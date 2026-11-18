// The Lord of the Rings saga campaign: the Campaign Log, the Campaign Pool and
// each scenario's campaign card (setup and resolution).
import type { CampaignState, GameState, ScenarioId, Unit } from "./types";
import { card, name } from "./cards";
import { enqueue, fx, get, log, make, requireRule, shuffle } from "./core";
import { isOneRing, isRingBearerCode } from "./lotr-saga-codes";
import { jdBalrog } from "./journey-dark-support";
import { BF } from "./breaking-fellowship-support";
import { effectiveTraits as effectiveTraitsOf } from "./expansion-passives";
import { ringBearer } from "./lotr-saga";
import { forOwner, playerOrder, seatIndices, seatView } from "./table";
import { score } from "./actions";
import { OF } from "./old-forest-support";

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
/** The Old Forest and Fog on the Barrow-downs (Parts 1.1 and 1.2): optional, after A Shadow of the Past. */
export const SAGA_INSERTS: readonly ScenarioId[] = [
  "the-old-forest",
  "fog-on-the-barrow-downs",
];
/** The Campaign Log's chapters in play order (Parts 1, 1.1, 1.2, 2 … 18). */
export const SAGA_CAMPAIGN_JOURNAL: readonly ScenarioId[] = [
  SAGA_CAMPAIGN_ORDER[0],
  ...SAGA_INSERTS,
  ...SAGA_CAMPAIGN_ORDER.slice(1),
];
/** A chapter's part number on its campaign card: "1", "1.1", "1.2", "2" … */
export const sagaChapterNumber = (id: ScenarioId) => {
  const insert = SAGA_INSERTS.indexOf(id);
  return insert >= 0
    ? `1.${insert + 1}`
    : String(SAGA_CAMPAIGN_ORDER.indexOf(id) + 1);
};
/** The chapters whose campaign cards are implemented. */
export const SAGA_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "a-shadow-of-the-past",
  "the-old-forest",
  "fog-on-the-barrow-downs",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
  "the-ring-goes-south",
  "journey-in-the-dark",
  "breaking-of-the-fellowship",
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
];
/** The Treason of Saruman's chapters: Aragorn leads, without Frodo or his burdens. */
export const TOS_CHAPTERS: readonly ScenarioId[] = [
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
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
  bogey: "147024",
  tom: "148021",
  sting: "142011",
  mithril: "142012",
  glamdring: "142013",
  anduril: "142014",
  phial: "142015",
  hairs: "142016",
  rope: "142017",
  lembas: "142018",
  lust: "142084",
  shadowFear: "142085",
  pursued: "142086",
  grief: "142087",
  wound: "142088",
  night: "142089",
  illFate: "142090",
  intimidation: "143015",
  hands: "143016",
  forewarned: "143017",
  leader: "143018",
  hope: "143019",
  palantir: "143020",
  counsels: "143021",
  voice: "143068",
  shadowCard: "octgn:307411f3-4a45-44ae-bc64-4e16deb97d10",
  forestCard: "octgn:088b62be-0f26-4a87-805a-277edd463c8c",
  fogCard: "octgn:d34c9025-6380-4294-be3f-01c992922830",
  knifeCard: "octgn:2efa631a-eb16-4078-84a5-18c7033b86f3",
  fordCard: "octgn:0ee09c42-34c9-41aa-aa98-b582608b15bb",
  southCard: "octgn:fb0f51c6-c96e-44f1-9f67-1235eb2351dc",
  darkCard: "octgn:a073c291-5f86-4b49-821e-d965baf369fa",
  breakingCard: "octgn:dfb04502-e86f-41bc-83a0-b77048b9668c",
  urukCard: "octgn:a54706fb-776c-4c00-b0ef-454b21673bcb",
  helmCard: "octgn:cf5fad0e-e1c3-4340-a467-567ff0611c6f",
  isengardCard: "octgn:cb2d88e5-d469-43c6-9d69-e0cf36e2862e",
} as const;
/** Each scenario's campaign card. */
export const SAGA_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "a-shadow-of-the-past": SAGA.shadowCard,
  "the-old-forest": SAGA.forestCard,
  "fog-on-the-barrow-downs": SAGA.fogCard,
  "a-knife-in-the-dark": SAGA.knifeCard,
  "flight-to-the-ford": SAGA.fordCard,
  "the-ring-goes-south": SAGA.southCard,
  "journey-in-the-dark": SAGA.darkCard,
  "breaking-of-the-fellowship": SAGA.breakingCard,
  "the-uruk-hai": SAGA.urukCard,
  "helms-deep": SAGA.helmCard,
  "the-road-to-isengard": SAGA.isengardCard,
};
/** Old Man Willow's code (The Old Forest). */
const OLD_FOREST_WILLOW = OF.willow;
/** Old Man Willow (The Old Forest): 12 damage tokens earn Old Bogey-stories. */
export const OLD_MAN_WILLOW_DAMAGE = 12;
/** The Flight to the Ford burden deck (Weight of the Ring … Overcome by Terror). */
export const FORD_BURDENS = ["141080", "141081", "141082", "141083", "141084"];
export const SAGA_BOONS: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
  SAGA.gildor,
  SAGA.bogey,
  SAGA.tom,
  SAGA.sting,
  SAGA.mithril,
  SAGA.glamdring,
  SAGA.anduril,
  SAGA.phial,
  SAGA.hairs,
  SAGA.rope,
  SAGA.lembas,
  SAGA.intimidation,
  SAGA.hands,
  SAGA.forewarned,
  SAGA.leader,
  SAGA.hope,
  SAGA.palantir,
];
export const SAGA_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.ringDraws,
  ...FORD_BURDENS,
  SAGA.lust,
  SAGA.shadowFear,
  SAGA.pursued,
  SAGA.grief,
  SAGA.wound,
  SAGA.night,
  SAGA.illFate,
  SAGA.counsels,
  SAGA.voice,
];
/** The burden sets of A Shadow of the Past, Flight to the Ford and The Ring Goes South. */
export const FRODO_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.ringDraws,
  ...FORD_BURDENS,
  SAGA.lust,
];
/** The Uruk-hai's Skill boons and the trait each one's Setup asks for. */
export const SKILL_BOONS: Record<string, string> = {
  [SAGA.intimidation]: "Warrior",
  [SAGA.hands]: "Healer",
  [SAGA.forewarned]: "Ranger",
  [SAGA.leader]: "Noble",
};
/** The Ring Goes South's boon cards: player cards the players may include in their decks. */
export const SOUTH_BOONS: readonly string[] = [
  SAGA.sting,
  SAGA.mithril,
  SAGA.glamdring,
  SAGA.anduril,
];
/** Earned boons with a player card back that join a player's deck. */
export const SAGA_DECK_BOONS: readonly string[] = [
  ...SOUTH_BOONS,
  SAGA.palantir,
];
/** Breaking of the Fellowship's Gifts of Lórien. */
export const GIFT_BOONS: readonly string[] = [
  SAGA.phial,
  SAGA.hairs,
  SAGA.rope,
  SAGA.lembas,
];
/** Burdens that function like player cards, earned by each player. */
export const DECK_BURDENS: readonly string[] = [SAGA.counsels];
/** Burden objectives whose Setup adds them to the staging area (besides Gandalf's Delay). */
export const STAGED_BURDENS: readonly string[] = [SAGA.grief, SAGA.wound];
/** Boons with the Permanent keyword. */
export const SAGA_PERMANENT: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
  SAGA.intimidation,
  SAGA.hands,
  SAGA.forewarned,
  SAGA.leader,
  SAGA.hope,
];
/** A Knife in the Dark's resolution: each player may choose one of these. */
export const KNIFE_BOONS = [SAGA.ranger, SAGA.healer, SAGA.warrior, SAGA.noble];
/** The Campaign Log records Permanent cards attached to the Ring-bearer under this key. */
export const RING_BEARER_KEY = "ring-bearer";

export const isSagaCampaign = (c?: CampaignState | null) => c?.kind === "saga";
export const sagaCampaignGame = (s: GameState) => isSagaCampaign(s.campaign);
export function newSagaCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "saga",
    ...(seatHeroes ? { seatHeroes: [...seatHeroes] } : {}),
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
/**
 * The chapters the players may play next: after A Shadow of the Past they may
 * include The Old Forest and Fog on the Barrow-downs (in that order, each
 * optional) before A Knife in the Dark.
 */
export function sagaChapterOptions(
  c: Pick<CampaignState, "completed">,
): ScenarioId[] {
  const done = c.completed.map((q) => q.scenarioId);
  if (!done.length) return [SAGA_CAMPAIGN_ORDER[0]];
  const main =
    SAGA_CAMPAIGN_ORDER[done.filter((id) => !SAGA_INSERTS.includes(id)).length];
  const last = done[done.length - 1];
  const inserts =
    last === "a-shadow-of-the-past"
      ? [...SAGA_INSERTS]
      : last === "the-old-forest"
        ? ["fog-on-the-barrow-downs" as ScenarioId]
        : [];
  return [...inserts, ...(main ? [main] : [])];
}
/** The main chapter that follows (the inserts are chosen explicitly). */
export const nextSagaChapter = (c: CampaignState) =>
  sagaChapterOptions(c).at(-1);
export const sagaChapterSupported = (id: ScenarioId | undefined) =>
  !!id && SAGA_CAMPAIGN_SUPPORTED.includes(id);
export const sagaCampaignCard = (s: GameState) =>
  sagaCampaignGame(s) ? SAGA_CAMPAIGN_CARDS[s.scenarioId] : undefined;

/** Gandalf's Delay: each player draws 1 less card in their starting hand. */
export const sagaStartingHandPenalty = (s: GameState) =>
  sagaCampaignGame(s) &&
  (s.scenarioId === "a-shadow-of-the-past" ||
    (s.campaign!.burdens.includes(SAGA.delay) &&
      !TOS_CHAPTERS.includes(s.scenarioId)))
    ? 1
    : 0;

/** Cards a campaign Setup added to the hand: kept through a mulligan. */
export const sagaSetupHandIds = (s: GameState) =>
  sagaCampaignGame(s)
    ? (s.sagaCards?.setupHand ?? []).filter((id) =>
        s.hand.some((u) => u.id === id),
      )
    : [];
/** The names of the fallen heroes: no version of them can be used (The Road Darkens FAQ). */
export const fallenNames = (c: CampaignState) =>
  c.fallen.map((code) => card(code).name);
/**
 * Before the starting hands: each earned player-card boon joins the deck the
 * Campaign Log assigns it to (The Ring Goes South deals its own boons), and
 * no version of a fallen hero can be used.
 */
export function sagaCampaignDeckSetup(s: GameState) {
  const c = s.campaign;
  if (!isSagaCampaign(c)) return;
  const fallen = fallenNames(c!);
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const removed = s.deck.filter((code) => fallen.includes(card(code).name));
      if (removed.length) {
        s.deck = s.deck.filter((code) => !fallen.includes(card(code).name));
        log(
          s,
          `The Campaign Log: ${removed.map((code) => card(code).name).join(", ")} cannot be used (a fallen hero).`,
        );
      }
    });
  // The Treason of Saruman: no card titled "Frodo Baggins" can be used.
  if (TOS_CHAPTERS.includes(s.scenarioId))
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        if (s.deck.some((code) => card(code).name === "Frodo Baggins")) {
          s.deck = s.deck.filter((code) => card(code).name !== "Frodo Baggins");
          log(
            s,
            "The Treason of Saruman: no card titled Frodo Baggins can be used in its chapters.",
          );
        }
      });
  if (s.scenarioId === "the-ring-goes-south") return;
  const seats = playerOrder(s);
  for (const [code, seat] of Object.entries(c!.deckBoons ?? {}))
    if (
      c!.boons.includes(code) &&
      SAGA_DECK_BOONS.includes(code) &&
      seats.includes(seat)
    )
      forOwner(s, seat, () => s.deck.push(code));
}
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
  const tos = TOS_CHAPTERS.includes(s.scenarioId);
  // The Uruk-hai's campaign card: "Remove Gildor Inglorion and Mr. Underhill
  // from the Campaign Pool."
  if (s.scenarioId === "the-uruk-hai") {
    c!.boons = c!.boons.filter(
      (code) => code !== SAGA.gildor && code !== SAGA.underhill,
    );
    for (const [key, codes] of Object.entries(c!.permanent)) {
      const rest = codes.filter((code) => code !== SAGA.underhill);
      if (rest.length) c!.permanent[key] = rest;
      else delete c!.permanent[key];
    }
  }
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
  // The Treason of Saruman's chapters leave out the burden sets of A Shadow of
  // the Past, Flight to the Ford and The Ring Goes South.
  const encounter = [
    ...c!.boons.filter((code) => code === SAGA.gildor),
    ...c!.burdens.filter(
      (code) =>
        code !== SAGA.delay &&
        !STAGED_BURDENS.includes(code) &&
        !DECK_BURDENS.includes(code) &&
        !(tos && FRODO_BURDENS.includes(code)),
    ),
  ];
  if (s.scenarioId === "the-road-to-isengard") encounter.push(SAGA.voice);
  const staged = c!.burdens.filter((code) => STAGED_BURDENS.includes(code));
  // Journey in the Dark's campaign card.
  if (s.scenarioId === "journey-in-the-dark") {
    encounter.push(SAGA.pursued, SAGA.shadowFear);
    staged.push(SAGA.wound, SAGA.grief);
  }
  for (const code of new Set(staged))
    if (!s.staging.some((u) => u.code === code)) s.staging.push(make(s, code));
  // Breaking of the Fellowship's campaign card: starting with the first
  // player, each player chooses one Gift of Lórien for a hero they control.
  if (s.scenarioId === "breaking-of-the-fellowship") {
    encounter.push(SAGA.night, SAGA.illFate);
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaGiftChoice", { player }));
  } else
    // An earned Gift: "Setup: Attach to a hero in play."
    for (const code of GIFT_BOONS.filter((g) => c!.boons.includes(g)))
      enqueue(s, fx("sagaGiftSetup", { code, player: s.table?.first ?? 0 }));
  let delay = c!.burdens.includes(SAGA.delay) && !tos;
  if (s.scenarioId === "a-shadow-of-the-past") {
    // A Shadow of the Past's campaign card.
    if (bearer) attachBoon(s, bearer, SAGA.underhill);
    delay = true;
    encounter.push(SAGA.gildor, SAGA.ringDraws);
  }
  if (delay && !s.staging.some((u) => u.code === SAGA.delay))
    s.staging.push(make(s, SAGA.delay));
  // Old Bogey-stories: the first player attaches it to a hero in play (the
  // Old Forest's campaign card, or its own Setup once earned).
  if (s.scenarioId === "the-old-forest" || c!.boons.includes(SAGA.bogey))
    enqueue(s, fx("sagaBogeySetup", { player: s.table?.first ?? 0 }));
  // Ho! Tom Bombadil!: the first player adds it to their hand.
  if (c!.boons.includes(SAGA.tom)) {
    forOwner(s, s.table?.first ?? 0, () => {
      const tom = make(s, SAGA.tom);
      tom.owner = s.table?.first ?? 0;
      s.hand.push(tom);
      ((s.sagaCards ??= { ringDraws: 0, underhill: [] }).setupHand ??= []).push(
        tom.id,
      );
    });
    log(
      s,
      "Ho! Tom Bombadil! (a campaign boon) is added to the first player's hand.",
      "good",
    );
  }
  // The Ring Goes South's campaign card: the players have earned Sting,
  // Mithril Shirt, Glamdring and Andúril; each player chooses one for their
  // hand, and the rest are shuffled into the first player's deck.
  if (s.scenarioId === "the-ring-goes-south") {
    for (const code of SOUTH_BOONS)
      if (!c!.boons.includes(code)) c!.boons.push(code);
    (s.sagaCards ??= { ringDraws: 0, underhill: [] }).southPending = [
      ...SOUTH_BOONS,
    ];
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaSouthChoice", { player }));
    enqueue(s, fx("sagaSouthDeal", { player: s.table?.first ?? 0 }));
  }
  for (const code of [...new Set(encounter)])
    if (!s.encounterDeck.includes(code)) s.encounterDeck.push(code);
  shuffle(s, s.encounterDeck);
  // Earned burdens with a player card back (Poisoned Counsels) are shuffled
  // into their players' decks after the starting hands.
  for (const [code, seats] of Object.entries(c!.deckBurdens ?? {}))
    if (c!.burdens.includes(code))
      for (const seat of seats.filter((x) => playerOrder(s).includes(x)))
        forOwner(s, seat, () => {
          s.deck.push(code);
          shuffle(s, s.deck);
        });
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
  // Breaking of the Fellowship: "If Fallen into Evil is attached to a hero,
  // add that hero to the list of Fallen Heroes in the Campaign Log."
  if (s.scenarioId === "breaking-of-the-fellowship")
    for (const f of s.breakingFellowship?.fallen ?? []) {
      const u = get(s, f.id);
      if (u?.attachments.some((a) => a.code === BF.fallen)) fallen.push(u.code);
    }
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
  // The Uruk-hai is won by rescuing the captives.
  if (s.scenarioId === "the-uruk-hai") delete c.captives;
  // Boons whose cost removed them from the Campaign Pool (Ho! Tom Bombadil!).
  const spent = (s.sagaCards?.spent ?? []).filter((code) =>
    c.boons.includes(code),
  );
  for (const code of spent) c.boons.splice(c.boons.indexOf(code), 1);
  // Burdens Seat of Seeing removed from the game.
  for (const code of s.sagaCards?.cleared ?? []) {
    const i = c.burdens.indexOf(code);
    if (i >= 0) c.burdens.splice(i, 1);
  }
  if (spent.length)
    log(
      s,
      `${spent.map((code) => card(code).name).join(", ")} ${spent.length === 1 ? "is" : "are"} removed from the Campaign Pool.`,
    );
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
  } else if (s.scenarioId === "the-old-forest") {
    const willow = [
      ...s.staging,
      ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
    ].find((u) => u.code === OLD_FOREST_WILLOW);
    const earned =
      (willow?.damage ?? 0) >= OLD_MAN_WILLOW_DAMAGE &&
      !c.boons.includes(SAGA.bogey);
    if (earned) c.boons.push(SAGA.bogey);
    log(
      s,
      earned
        ? `The Old Forest · Resolution: Old Man Willow has ${willow!.damage} damage; Old Bogey-stories is earned.`
        : `The Old Forest · Resolution: Old Man Willow has ${willow?.damage ?? 0} damage (12 are needed); Old Bogey-stories is not earned.`,
      "good",
    );
  } else if (s.scenarioId === "journey-in-the-dark" && jdBalrog(s)) {
    // "If The Balrog is still in play, the first player must choose all 4
    // burden cards instead."
    const earned = [SAGA.pursued, SAGA.shadowFear, SAGA.wound, SAGA.grief];
    for (const code of earned)
      if (!c.burdens.includes(code)) c.burdens.push(code);
    log(
      s,
      "Journey in the Dark · Resolution: The Balrog is still in play; Pursued by the Enemy, Shadow of Fear, Grievous Wound and Overcome by Grief are added to the Campaign Pool.",
      "good",
    );
  } else if (s.scenarioId === "the-ring-goes-south") {
    // "If Lust for the Ring is attached to a hero, the players have earned
    // that burden."
    const lusted = seatIndices(s).some((p) =>
      seatView(s, p).heroes.some((h) =>
        h.attachments.some((a) => a.code === SAGA.lust),
      ),
    );
    if (lusted && !c.burdens.includes(SAGA.lust)) c.burdens.push(SAGA.lust);
    log(
      s,
      lusted
        ? "The Ring Goes South · Resolution: Lust for the Ring is attached to a hero; the players have earned that burden."
        : "The Ring Goes South · Resolution: Lust for the Ring is not attached to a hero.",
      "good",
    );
  } else if (s.scenarioId === "helms-deep") {
    // "Each player with a copy of Poisoned Counsels in his hand, deck or
    // discard pile has earned that burden."
    const seats = playerOrder(s).filter((p) => {
      const v = seatView(s, p);
      return (
        v.hand.some((u) => u.code === SAGA.counsels) ||
        v.deck.includes(SAGA.counsels) ||
        v.discard.includes(SAGA.counsels)
      );
    });
    if (seats.length) {
      if (!c.burdens.includes(SAGA.counsels)) c.burdens.push(SAGA.counsels);
      c.deckBurdens = {
        ...(c.deckBurdens ?? {}),
        [SAGA.counsels]: [
          ...new Set([...(c.deckBurdens?.[SAGA.counsels] ?? []), ...seats]),
        ],
      };
    }
    log(
      s,
      seats.length
        ? `Helm's Deep · Resolution: ${seats.map((p) => (s.table ? `Player ${p + 1}` : "you")).join(", ")} ${seats.length === 1 && !s.table ? "have" : seats.length === 1 ? "has" : "have"} earned Poisoned Counsels.`
        : "Helm's Deep · Resolution: no player has a copy of Poisoned Counsels.",
      "good",
    );
  } else if (s.scenarioId === "the-road-to-isengard") {
    const hands = playerOrder(s).map((p) => seatView(s, p).hand.length);
    const voice = hands.some((n) => n <= 3);
    const palantir = hands.some((n) => n >= 3);
    if (voice && !c.burdens.includes(SAGA.voice)) c.burdens.push(SAGA.voice);
    if (palantir && !c.boons.includes(SAGA.palantir)) {
      c.boons.push(SAGA.palantir);
      c.deckBoons = {
        ...(c.deckBoons ?? {}),
        [SAGA.palantir]: s.table?.first ?? 0,
      };
    }
    log(
      s,
      `The Road to Isengard · Resolution: ${[
        ...(voice ? ["the players have earned Saruman's Voice"] : []),
        ...(palantir
          ? ["the first player has earned the Palantír of Orthanc"]
          : []),
      ].join("; ")}.`,
      "good",
    );
  } else if (s.scenarioId === "fog-on-the-barrow-downs") {
    if (!c.boons.includes(SAGA.tom)) c.boons.push(SAGA.tom);
    log(
      s,
      "Fog on the Barrow-downs · Resolution: the players have earned the Ho! Tom Bombadil! boon card.",
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
/** The Uruk-hai: the pursuit value at which the players earn a reward. */
export const URUK_PURSUIT = 25;
/** A player's segment of the Campaign Log's heroes. */
function seatHeroes(s: GameState, player: number) {
  const c = s.campaign!;
  const counts = c.seatHeroes ??
    s.table?.seats.map((p) => p.startingHeroes.length) ?? [c.heroes.length];
  const start = counts.slice(0, player).reduce((n, x) => n + x, 0);
  return { start, codes: c.heroes.slice(start, start + counts[player]) };
}
/** The Uruk-hai's resolution: the Skill boons or Beyond All Hope. */
function urukQuestions(s: GameState): SagaQuestion[] {
  const c = s.campaign!;
  const fallen = c.fallen.filter((code) => !c.heroes.includes(code));
  const skills = Object.entries(SKILL_BOONS);
  return [
    {
      id: "reward",
      label:
        "The players must choose: each player earns a Skill boon, or one player earns Beyond All Hope and takes back a fallen hero.",
      options: [
        { id: "skill", label: "Each player earns a Skill boon" },
        ...(fallen.length
          ? [{ id: "hope", label: "One player earns Beyond All Hope" }]
          : []),
      ],
    },
    ...playerOrder(s).map((player) => ({
      id: `skill:${player}`,
      player,
      label: `Skill boons · ${s.table ? `Player ${player + 1}` : "You"}: a Skill boon for a hero ${s.table ? "that player controls" : "you control"} with its trait.`,
      options: [
        { id: "none", label: "No Skill boon" },
        ...skills.flatMap(([code, trait]) =>
          // The captives, rescued by the win, count as heroes they control.
          [
            ...seatView(s, player).heroes,
            ...(s.urukHai?.captives
              .filter((x) => x.owner === player)
              .map((x) => x.unit) ?? []),
          ]
            .filter(
              (h) =>
                card(h.code).sphere_code !== "fellowship" &&
                effectiveTraitsOf(h).includes(trait),
            )
            .map((h) => ({
              id: `${code}@${h.code}`,
              code,
              label: `${card(code).name} · ${name(h)}`,
            })),
        ),
      ],
    })),
    {
      id: "hope",
      label:
        "Beyond All Hope · the player and the fallen hero they take control of.",
      options: [
        { id: "none", label: "Not chosen" },
        ...playerOrder(s).flatMap((player) =>
          fallen.map((code) => ({
            id: `${player}@${code}`,
            code,
            label: `${s.table ? `Player ${player + 1}` : "You"} · ${card(code).name}`,
          })),
        ),
      ],
    },
    {
      id: "hopeDrop",
      label:
        "Beyond All Hope · the hero that player removes from the Campaign Log to control only 3 heroes.",
      options: [
        { id: "none", label: "No hero" },
        ...c.heroes.map((code) => ({ id: code, code, label: card(code).name })),
      ],
    },
  ];
}
/** Breaking of the Fellowship: the heroes a player may give up as a captive. */
const captiveCandidates = (s: GameState, player: number) =>
  seatView(s, player).heroes.filter(
    (h) =>
      !h.attachments.some((a) => isOneRing(a.code)) &&
      !isRingBearerCode(h.code) &&
      card(h.code).name !== "Aragorn",
  );
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
  if (s.scenarioId === "journey-in-the-dark" && !jdBalrog(s))
    return [
      {
        id: "treachery",
        label:
          "The first player chooses one of the burden treachery cards to add to the Campaign Pool.",
        options: [SAGA.pursued, SAGA.shadowFear].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      {
        id: "objective",
        label:
          "The first player chooses one of the burden objective cards to add to the Campaign Pool.",
        options: [SAGA.wound, SAGA.grief].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
    ];
  if (
    s.scenarioId === "the-uruk-hai" &&
    (s.urukHai?.pursuit ?? 99) <= URUK_PURSUIT
  )
    return urukQuestions(s);
  if (s.scenarioId === "breaking-of-the-fellowship")
    return [
      {
        id: "burden",
        label:
          "The first player chooses either Followed by Night or Ill Fate to be added to the Campaign Pool.",
        options: [SAGA.night, SAGA.illFate].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      ...playerOrder(s).map((player) => {
        const heroes = captiveCandidates(s, player);
        return {
          id: `captive:${player}`,
          player,
          label: `${s.table ? `Player ${player + 1}` : "You"}: choose 1 hero ${s.table ? "that player controls" : "you control"} (other than the Ring-bearer or Aragorn) to be taken captive.`,
          options: heroes.length
            ? heroes.map((h) => ({ id: h.code, code: h.code, label: name(h) }))
            : [{ id: "none", label: "No hero can be taken captive" }],
        };
      }),
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
  if (s.scenarioId === "the-uruk-hai") {
    if (answers.reward === "skill") {
      const chosen = questions
        .filter((q) => q.id.startsWith("skill:"))
        .map((q) => answers[q.id])
        .filter((a) => a !== "none")
        .map((a) => a.split("@"));
      requireRule(
        new Set(chosen.map(([code]) => code)).size === chosen.length,
        "Each Skill boon can be earned once.",
      );
      for (const [code, hero] of chosen) {
        c!.boons.push(code);
        c!.permanent[hero] = [...(c!.permanent[hero] ?? []), code];
      }
      log(
        s,
        `The Uruk-hai · Resolution: ${chosen.length ? chosen.map(([code, hero]) => `${card(code).name} (${card(hero).name})`).join(", ") : "no Skill boon"} ${chosen.length === 1 ? "is" : "are"} earned.`,
        "good",
      );
    } else {
      requireRule(
        answers.hope !== "none",
        "Choose the player and the fallen hero for Beyond All Hope.",
      );
      const [seat, hero] = answers.hope.split("@");
      const player = Number(seat);
      const { start, codes } = seatHeroes(s, player);
      // The engine keeps each player's hero count: the fallen hero takes the
      // place of a hero that player removes from the Campaign Log.
      requireRule(
        codes.includes(answers.hopeDrop),
        "Choose a hero of that player to remove from the Campaign Log.",
      );
      c!.heroes[start + codes.indexOf(answers.hopeDrop)] = hero;
      delete c!.permanent[answers.hopeDrop];
      c!.fallen = c!.fallen.filter((code) => code !== hero);
      c!.boons.push(SAGA.hope);
      c!.permanent[hero] = [...(c!.permanent[hero] ?? []), SAGA.hope];
      log(
        s,
        `The Uruk-hai · Resolution: Beyond All Hope is earned; ${card(hero).name} returns to the fellowship in place of ${card(answers.hopeDrop).name}.`,
        "good",
      );
    }
  }
  if (s.scenarioId === "journey-in-the-dark") {
    c!.burdens.push(answers.treachery, answers.objective);
    log(
      s,
      `Journey in the Dark · Resolution: ${card(answers.treachery).name} and ${card(answers.objective).name} are added to the Campaign Pool.`,
      "good",
    );
  }
  if (s.scenarioId === "breaking-of-the-fellowship") {
    c!.burdens.push(answers.burden);
    const captives = questions
      .filter((q) => q.id.startsWith("captive:"))
      .map((q) => answers[q.id])
      .filter((a) => a !== "none");
    c!.captives = [...new Set([...(c!.captives ?? []), ...captives])];
    log(
      s,
      `Breaking of the Fellowship · Resolution: ${card(answers.burden).name} is added to the Campaign Pool${captives.length ? `; ${captives.map((code) => card(code).name).join(", ")} ${captives.length === 1 ? "is" : "are"} taken captive` : ""}.`,
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
  const chapter = [...SAGA_CAMPAIGN_ORDER, ...SAGA_INSERTS].includes(
    s.scenarioId,
  );
  return (
    chapter &&
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
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === (s.table?.seats.length ?? 1) &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    (c.captives === undefined ||
      (codes(c.captives) && c.captives.every(hero))) &&
    (c.deckBurdens === undefined ||
      (!!c.deckBurdens &&
        typeof c.deckBurdens === "object" &&
        !Array.isArray(c.deckBurdens) &&
        Object.entries(c.deckBurdens).every(
          ([code, seats]) =>
            DECK_BURDENS.includes(code) &&
            c.burdens.includes(code) &&
            Array.isArray(seats) &&
            new Set(seats).size === seats.length &&
            seats.every(
              (seat) =>
                Number.isSafeInteger(seat) &&
                seat >= 0 &&
                seat < (s.table?.seats.length ?? 1),
            ),
        ))) &&
    (c.deckBoons === undefined ||
      (!!c.deckBoons &&
        typeof c.deckBoons === "object" &&
        !Array.isArray(c.deckBoons) &&
        Object.entries(c.deckBoons).every(
          ([code, seat]) =>
            SAGA_DECK_BOONS.includes(code) &&
            c.boons.includes(code) &&
            Number.isSafeInteger(seat) &&
            seat >= 0 &&
            seat < (s.table?.seats.length ?? 1),
        ))) &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (q, i) =>
        !!q &&
        sagaChapterOptions({ completed: c.completed.slice(0, i) }).includes(
          q.scenarioId,
        ) &&
        Number.isSafeInteger(q.score) &&
        integer(q.rounds),
    ) &&
    (s.status === "won"
      ? c.completed.at(-1)?.scenarioId === s.scenarioId
      : sagaChapterOptions(c).includes(s.scenarioId)) &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (s.status === "won" && c.resolution === s.scenarioId))
  );
}
