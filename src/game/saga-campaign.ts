// The Lord of the Rings saga campaign: the Campaign Log, the Campaign Pool and
// each scenario's campaign card (setup and resolution).
import type { CampaignState, GameState, ScenarioId, Unit } from "./types";
import { card, name } from "./cards";
import { log, make, requireRule, shuffle } from "./core";
import { ringBearer } from "./lotr-saga";
import { forOwner, playerOrder, seatIndices, seatView } from "./table";
import { score } from "./actions";

/** The campaign's scenarios in order (The Old Forest and Fog on the Barrow-downs follow A Shadow of the Past when included). */
export const SAGA_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "a-shadow-of-the-past",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
  "the-ring-goes-south",
  "journey-in-the-dark",
  "breaking-of-the-fellowship",
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
  "the-passage-of-the-marshes",
  "journey-to-the-cross-roads",
  "shelobs-lair",
  "the-passing-of-the-grey-company",
  "the-siege-of-gondor",
  "the-battle-of-the-pelennor-fields",
  "the-tower-of-cirith-ungol",
  "the-black-gate-opens",
  "mount-doom",
];
/** The chapters whose campaign cards are implemented. */
export const SAGA_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "a-shadow-of-the-past",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
];
export const SAGA = {
  underhill: "141017",
  ranger: "141018",
  healer: "141019",
  warrior: "141020",
  noble: "141021",
  gildor: "141077",
  delay: "141078",
  ringDraws: "141079",
  shadowCard: "octgn:307411f3-4a45-44ae-bc64-4e16deb97d10",
  knifeCard: "octgn:2efa631a-eb16-4078-84a5-18c7033b86f3",
  fordCard: "octgn:0ee09c42-34c9-41aa-aa98-b582608b15bb",
} as const;
/** Each scenario's campaign card. */
export const SAGA_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "a-shadow-of-the-past": SAGA.shadowCard,
  "a-knife-in-the-dark": SAGA.knifeCard,
  "flight-to-the-ford": SAGA.fordCard,
};
/** The Flight to the Ford burden deck (Weight of the Ring … Overcome by Terror). */
export const FORD_BURDENS = ["141080", "141081", "141082", "141083", "141084"];
export const SAGA_BOONS: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
  SAGA.gildor,
];
export const SAGA_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.ringDraws,
  ...FORD_BURDENS,
];
/** Boons with the Permanent keyword. */
export const SAGA_PERMANENT: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
];
/** A Knife in the Dark's resolution: each player may choose one of these. */
export const KNIFE_BOONS = [SAGA.ranger, SAGA.healer, SAGA.warrior, SAGA.noble];
/** The Campaign Log records Permanent cards attached to the Ring-bearer under this key. */
export const RING_BEARER_KEY = "ring-bearer";

export const isSagaCampaign = (c?: CampaignState | null) => c?.kind === "saga";
export const sagaCampaignGame = (s: GameState) => isSagaCampaign(s.campaign);
export function newSagaCampaign(heroes: string[]): CampaignState {
  return {
    kind: "saga",
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: [],
    mendorSaved: false,
    resolution: null,
  };
}
export const nextSagaChapter = (c: CampaignState) =>
  SAGA_CAMPAIGN_ORDER[c.completed.length];
export const sagaChapterSupported = (id: ScenarioId | undefined) =>
  !!id && SAGA_CAMPAIGN_SUPPORTED.includes(id);
export const sagaCampaignCard = (s: GameState) =>
  sagaCampaignGame(s) ? SAGA_CAMPAIGN_CARDS[s.scenarioId] : undefined;

/** Gandalf's Delay: each player draws 1 less card in their starting hand. */
export const sagaStartingHandPenalty = (s: GameState) =>
  sagaCampaignGame(s) &&
  (s.scenarioId === "a-shadow-of-the-past" ||
    s.campaign!.burdens.includes(SAGA.delay))
    ? 1
    : 0;

/** Attach a campaign card (a Permanent boon) to a hero. */
function attachBoon(s: GameState, hero: Unit, code: string) {
  if (hero.attachments.some((a) => a.code === code)) return;
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: hero.owner,
  });
}
/**
 * The campaign setup, after the scenario's own setup: Permanent boons are
 * attached to their recorded heroes, the Campaign Pool's encounter-backed
 * boons and its burdens join the encounter deck (Gandalf's Delay goes to the
 * staging area) and the campaign card's Setup resolves.
 */
export function sagaCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isSagaCampaign(c)) return;
  const bearer = ringBearer(s);
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      for (const hero of s.heroes)
        for (const code of c!.permanent[hero.code] ?? [])
          attachBoon(s, hero, code);
    });
  if (bearer)
    for (const code of c!.permanent[RING_BEARER_KEY] ?? [])
      attachBoon(s, bearer, code);
  const encounter = [
    ...c!.boons.filter((code) => code === SAGA.gildor),
    ...c!.burdens.filter((code) => code !== SAGA.delay),
  ];
  let delay = c!.burdens.includes(SAGA.delay);
  if (s.scenarioId === "a-shadow-of-the-past") {
    // A Shadow of the Past's campaign card.
    if (bearer) attachBoon(s, bearer, SAGA.underhill);
    delay = true;
    encounter.push(SAGA.gildor, SAGA.ringDraws);
  }
  if (delay && !s.staging.some((u) => u.code === SAGA.delay))
    s.staging.push(make(s, SAGA.delay));
  for (const code of [...new Set(encounter)])
    if (!s.encounterDeck.includes(code)) s.encounterDeck.push(code);
  shuffle(s, s.encounterDeck);
  log(
    s,
    `Campaign mode · ${card(SAGA_CAMPAIGN_CARDS[s.scenarioId] ?? "").name || "The Lord of the Rings"}: ${[
      ...(s.scenarioId === "a-shadow-of-the-past"
        ? [
            "Mr. Underhill is attached to the Ring-bearer, Gandalf's Delay waits in the staging area, and Gildor Inglorion and The Ring Draws Them are shuffled into the encounter deck",
          ]
        : []),
      ...(c!.boons.length || c!.burdens.length
        ? [
            `the Campaign Pool adds ${[...c!.boons, ...c!.burdens].map((code) => card(code).name).join(", ")}`,
          ]
        : []),
    ].join("; ")}.`,
    "chapter",
  );
}

/** Burden cards of the Campaign Pool's kind anywhere the Flight to the Ford resolution looks. */
function burdensInPlay(s: GameState) {
  const units = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...seatIndices(s).flatMap((p) => [
      ...seatView(s, p).heroes,
      ...seatView(s, p).allies,
      ...seatView(s, p).engaged,
    ]),
  ];
  return [
    ...units.map((u) => u.code),
    ...units.flatMap((u) => u.attachments.map((a) => a.code)),
    ...units.flatMap((u) => u.shadows ?? []),
    ...s.encounterDeck,
    ...s.encounterDiscard,
  ].filter((code) => SAGA_BURDENS.includes(code));
}
/**
 * After a win: fallen heroes are recorded (their Permanent cards leave the
 * Campaign Pool), the scenario joins the log and the campaign card's
 * resolution either resolves at once or waits for the players' choices.
 */
export function resolveSagaCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  for (const code of fallen) {
    if (!c.fallen.includes(code)) c.fallen.push(code);
    for (const x of c.permanent[code] ?? []) {
      const pool = SAGA_BURDENS.includes(x) ? c.burdens : c.boons;
      const i = pool.indexOf(x);
      if (i >= 0) pool.splice(i, 1);
    }
    delete c.permanent[code];
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  c.resolution = null;
  if (s.scenarioId === "flight-to-the-ford") {
    const earned = [...new Set(burdensInPlay(s))].filter(
      (code) => !c.burdens.includes(code),
    );
    c.burdens.push(...earned);
    log(
      s,
      earned.length
        ? `Flight to the Ford · Resolution: ${earned.map((code) => card(code).name).join(", ")} ${earned.length === 1 ? "is" : "are"} added to the Campaign Pool.`
        : "Flight to the Ford · Resolution: no burden card is in play, in the encounter deck or in the discard pile.",
      "good",
    );
  } else if (sagaResolutionQuestions(s).length) c.resolution = s.scenarioId;
  log(s, "The Campaign Log has been updated.", "good");
}

export type SagaQuestion = {
  id: string;
  player?: number;
  label: string;
  options: { id: string; label: string; code?: string }[];
};
const heroKey = (s: GameState, u: Unit) =>
  ringBearer(s)?.id === u.id ? RING_BEARER_KEY : u.code;
const heroLabel = (s: GameState, key: string) =>
  key === RING_BEARER_KEY
    ? `${ringBearer(s) ? name(ringBearer(s)!) : "Frodo Baggins"} (the Ring-bearer)`
    : card(key).name;
/** The choices a campaign card's resolution asks of the players. */
export function sagaResolutionQuestions(s: GameState): SagaQuestion[] {
  const c = s.campaign;
  if (!isSagaCampaign(c) || s.status !== "won") return [];
  if (s.scenarioId === "a-shadow-of-the-past")
    return [
      {
        id: "burden",
        label:
          "Choose Gandalf's Delay or The Ring Draws Them and add it to the Campaign Pool.",
        options: [SAGA.delay, SAGA.ringDraws].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      {
        id: "boon",
        label:
          "Then, choose Gildor Inglorion or Mr. Underhill and add it to the Campaign Pool.",
        options: [SAGA.gildor, SAGA.underhill].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
    ];
  if (s.scenarioId === "a-knife-in-the-dark")
    return playerOrder(s).map((player) => ({
      id: `boon:${player}`,
      player,
      label: `${s.table ? `Player ${player + 1}` : "You"}: choose a boon to attach to a hero ${s.table ? "that player controls" : "you control"} (optional).`,
      options: [
        { id: "none", label: "No boon" },
        ...KNIFE_BOONS.flatMap((code) =>
          seatView(s, player).heroes.map((h) => ({
            id: `${code}@${heroKey(s, h)}`,
            code,
            label: `${card(code).name} · ${heroLabel(s, heroKey(s, h))}`,
          })),
        ),
      ],
    }));
  return [];
}
/** Record the players' resolution choices in the Campaign Log. */
export function applySagaResolution(
  input: GameState,
  answers: Record<string, string>,
): GameState {
  const s = structuredClone(input);
  const c = s.campaign;
  requireRule(
    isSagaCampaign(c) && s.status === "won" && c!.resolution === s.scenarioId,
    "This campaign card has no resolution waiting.",
  );
  const questions = sagaResolutionQuestions(s);
  for (const q of questions)
    requireRule(
      q.options.some((o) => o.id === answers[q.id]),
      `Answer: ${q.label}`,
    );
  if (s.scenarioId === "a-shadow-of-the-past") {
    c!.burdens.push(answers.burden);
    c!.boons.push(answers.boon);
    if (answers.boon === SAGA.underhill)
      c!.permanent[RING_BEARER_KEY] = [
        ...(c!.permanent[RING_BEARER_KEY] ?? []),
        SAGA.underhill,
      ];
    log(
      s,
      `A Shadow of the Past · Resolution: ${card(answers.burden).name} and ${card(answers.boon).name} are added to the Campaign Pool.`,
      "good",
    );
  }
  if (s.scenarioId === "a-knife-in-the-dark") {
    const chosen = questions
      .map((q) => answers[q.id])
      .filter((a) => a !== "none")
      .map((a) => a.split("@"));
    requireRule(
      new Set(chosen.map(([code]) => code)).size === chosen.length,
      "Each boon card can be chosen once.",
    );
    for (const [code, hero] of chosen) {
      c!.boons.push(code);
      c!.permanent[hero] = [...(c!.permanent[hero] ?? []), code];
    }
    log(
      s,
      chosen.length
        ? `A Knife in the Dark · Resolution: ${chosen.map(([code, hero]) => `${card(code).name} (${heroLabel(s, hero)})`).join(", ")} ${chosen.length === 1 ? "is" : "are"} earned.`
        : "A Knife in the Dark · Resolution: no boon is chosen.",
      "good",
    );
  }
  c!.resolution = null;
  return s;
}

/** A saved Lord of the Rings campaign log, checked against the current game. */
export function validateSagaCampaign(s: GameState): boolean {
  const c = s.campaign;
  if (!c || c.kind !== "saga") return false;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  const integer = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const hero = (code: string) => {
    try {
      return card(code).type_code === "hero";
    } catch {
      return false;
    }
  };
  const index = SAGA_CAMPAIGN_ORDER.indexOf(s.scenarioId);
  return (
    index >= 0 &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every((x) => SAGA_BOONS.includes(x)) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every((x) => SAGA_BURDENS.includes(x)) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    Object.entries(c.permanent).every(
      ([h, cs]) =>
        (h === RING_BEARER_KEY || hero(h)) &&
        codes(cs) &&
        cs.every((x) => SAGA_PERMANENT.includes(x) && c.boons.includes(x)),
    ) &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    Array.isArray(c.completed) &&
    c.completed.length === index + (s.status === "won" ? 1 : 0) &&
    c.completed.every(
      (q, i) =>
        !!q &&
        q.scenarioId === SAGA_CAMPAIGN_ORDER[i] &&
        Number.isSafeInteger(q.score) &&
        integer(q.rounds),
    ) &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (s.status === "won" && c.resolution === s.scenarioId))
  );
}
