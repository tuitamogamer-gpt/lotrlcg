// The Dream-chaser campaign (its Campaign Expansion): the Campaign Log with
// its XP and checkboxes, the Campaign Pool, Hard and Expert Mode, the fleet's
// Modification boons and each scenario's campaign card.
import type { CampaignState, Effect, GameState, ScenarioId } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, shuffle } from "./core";
import {
  activeSeat,
  allCharacters,
  firstPlayer,
  forOwner,
  globalLivingSeats,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { raiseThreat } from "./board";
import { score } from "./actions";
import { dreamchaserCardEffect } from "./dreamchaser-campaign-cards";
import { isShipEnemy } from "./ships";
import {
  DC,
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  MODIFICATIONS,
  backFace,
  dcBase,
  dcFace,
  dcUpgraded,
  dreamchaserPart,
  isDreamchaserCampaign,
  isFleetShip,
} from "./dreamchaser-campaign-support";
import { VOYAGE, VOYAGE_STAGE_TWO } from "./voyage-belegaer-support";

export {
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  isDreamchaserCampaign,
} from "./dreamchaser-campaign-support";

/** The chapters supported in campaign mode so far. */
export const DREAMCHASER_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "voyage-across-belegaer",
];
/** The campaign's sailing chapters: their setups prepare the fleet. */
const FLEET_CHAPTERS: readonly ScenarioId[] = [
  "voyage-across-belegaer",
  "flight-of-the-stormcaller",
  "a-storm-on-cobas-haven",
  "the-city-of-corsairs",
];

/** A new Dream-chaser campaign: the heroes are recorded at its start. */
export function newDreamchaserCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "dreamchaser",
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
    xp: 0,
    marks: {},
    ...(seatHeroes && seatHeroes.length > 1 ? { seatHeroes } : {}),
  };
}
/** The chapter the campaign continues with, or undefined once it is complete. */
export const nextDreamchaserChapter = (
  c: Pick<CampaignState, "completed">,
): ScenarioId | undefined => DREAMCHASER_CAMPAIGN_ORDER[c.completed.length];
export const dreamchaserChapterSupported = (id?: ScenarioId) =>
  !!id && DREAMCHASER_CAMPAIGN_SUPPORTED.includes(id);
/**
 * "When playing the Dream-chaser campaign, the Na'asiyah hero cannot be used
 * in scenarios 1 through 7."
 */
export const dreamchaserForbiddenTitle = (id: ScenarioId) => {
  const i = DREAMCHASER_CAMPAIGN_ORDER.indexOf(id);
  return i >= 0 && i < 7 ? "Na'asiyah" : undefined;
};
/** Has the current chapter been recorded in the Campaign Log? */
export const dreamchaserChapterComplete = (s: GameState) =>
  isDreamchaserCampaign(s.campaign) &&
  s.campaign!.completed.at(-1)?.scenarioId === s.scenarioId;

/** The Dream-chaser campaign's state during a game. */
export interface DreamchaserGame {
  /** The Hard/Expert Mode card's side, when it is in play. */
  mode?: "hard" | "expert";
  /** "For this game, X is plus 1": additions to Ominous Fate's X. */
  ominous?: number;
  /** Resources on the campaign card. */
  resources?: number;
  /** Hard Mode: the threat each seat has reduced this round ("round:seat"). */
  reduced?: Record<string, number>;
  /** Thunderstruck: the damage each copy took this round. */
  damage?: { round: number; byId: Record<string, number> };
}
export const dreamchaserState = (s: GameState) => (s.dreamchaser ??= {});
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;

/** Ominous Fate's X: "the campaign card's part number", plus this game's additions. */
export const dreamchaserOminousX = (s: GameState) =>
  dreamchaserPart(s.scenarioId) + (s.dreamchaser?.ominous ?? 0);

// ---------------------------------------------------------------- XP and the log

/**
 * Spending XP: "Spending 1 XP allows the players to mark any one checkbox.
 * The players can only spend XP before or after a scenario." The checkboxes
 * stay marked; Gavin's are marked only with A Storm on Cobas Haven's
 * resolution ("Gavin returned").
 */
export function dreamchaserMarksProblem(
  c: CampaignState,
  marks: Record<string, number>,
): string | null {
  if (!isDreamchaserCampaign(c)) return "This is not a Dream-chaser campaign.";
  let spent = 0;
  for (const [key, value] of Object.entries(marks)) {
    const line = DREAMCHASER_LOG.find((l) => l.key === key);
    if (!line) return "That card has no checkboxes in the Campaign Log.";
    const before = c.marks?.[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < before || value > line.boxes)
      return `${line.label} has ${line.boxes} checkboxes; marked checkboxes stay marked.`;
    if (
      key === DC.gavin &&
      value > before &&
      (value !== line.boxes ||
        c.completed.at(-1)?.scenarioId !== "a-storm-on-cobas-haven")
    )
      return "Gavin's 4 XP are spent with A Storm on Cobas Haven's resolution, to record \"Gavin returned\".";
    spent += value - before;
  }
  if (spent > (c.xp ?? 0)) return `Only ${c.xp ?? 0} unspent XP remain.`;
  return null;
}
/** Mark the given checkboxes, spending 1 XP for each newly marked one. */
export function spendDreamchaserXp(
  c: CampaignState,
  marks: Record<string, number>,
): CampaignState {
  const problem = dreamchaserMarksProblem(c, marks);
  if (problem) throw new Error(problem);
  const next = structuredClone(c);
  let spent = 0;
  for (const [key, value] of Object.entries(marks)) {
    spent += value - (c.marks?.[key] ?? 0);
    if (value) (next.marks ??= {})[key] = value;
  }
  next.xp = (c.xp ?? 0) - spent;
  return next;
}
/** "Gavin returned": the players spent 4 XP on Gavin. */
export const gavinReturned = (c?: CampaignState | null) =>
  dcUpgraded(c, DC.gavin);

// ------------------------------------------------------------------ setup

/** Before the starting hands: the Campaign Pool's player cards join their decks. */
export function dreamchaserDeckSetup(s: GameState) {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return;
  const seats = seatIndices(s);
  for (const [code, seat] of Object.entries(c!.deckBoons ?? {}))
    if (c!.boons.includes(code) && seats.includes(seat))
      forOwner(s, seat, () => s.deck.push(code));
}

/** The campaign card's Setup and the Campaign Pool, after the scenario's own setup. */
export function dreamchaserCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return;
  const mode = s.dreamchaser?.mode;
  if (mode) {
    // "Put this card next to the quest deck at the end of setup. It remains
    // in play for the rest of the game."
    log(
      s,
      `${mode === "hard" ? "Hard Mode" : "Expert Mode"} is next to the quest deck for this game.`,
      "danger",
    );
  }
  // The Campaign Pool's encounter burdens are shuffled into the encounter deck.
  const pool: string[] = c!.burdens.filter((code) => code === DC.ominous);
  // Voyage Across Belegaer: "Shuffle Ominous Fate and Thunderstruck into the
  // encounter deck. Shuffle Crowley into the Corsair deck."
  if (s.scenarioId === "voyage-across-belegaer") {
    if (!pool.includes(DC.ominous)) pool.push(DC.ominous);
    pool.push(DC.thunderstruck);
    const corsairs = corsairDeck(s);
    if (corsairs) {
      corsairs.push(DC.crowley);
      shuffle(s, corsairs);
    }
  }
  if (pool.length) {
    s.encounterDeck.push(...pool);
    shuffle(s, s.encounterDeck);
    log(
      s,
      `${pool.map((code) => card(code).name).join(" and ")} ${pool.length === 1 ? "is" : "are"} shuffled into the encounter deck.`,
    );
  }
}
/** The Corsair deck of the sailing scenarios. */
function corsairDeck(s: GameState): string[] | undefined {
  const fleet = (
    s as GameState & {
      voyageBelegaer?: { corsairDeck: string[] };
      stormcaller?: { corsairDeck: string[] };
    }
  ).voyageBelegaer;
  return fleet?.corsairDeck;
}

/**
 * Once the fleet is prepared: "Each player chooses a Modification boon for
 * each of their ship-objectives and attaches it to that ship-objective."
 * Voyage Across Belegaer adds: "For each ship-objective, its controller may
 * deal 2 damage to it to add 1 resource to a hero's resource pool."
 */
export function dreamchaserFleetReady(s: GameState): Effect[] {
  if (
    !isDreamchaserCampaign(s.campaign) ||
    !FLEET_CHAPTERS.includes(s.scenarioId)
  )
    return [];
  const effects: Effect[] = [];
  for (const player of playerOrder(s))
    for (const ship of fleetShips(s, player))
      effects.push(fx("dcModification", { target: ship.id, player }));
  if (s.scenarioId === "voyage-across-belegaer")
    for (const player of playerOrder(s))
      for (const ship of fleetShips(s, player))
        effects.push(fx("dcShipToll", { target: ship.id, player }));
  return effects;
}
/** The fleet's ship-objectives a player controls. */
const fleetShips = (s: GameState, p: number) =>
  seatView(s, p).allies.filter((u) => isFleetShip(u.code));

// --------------------------------------------------------------- resolution

/** One bullet of the campaign card's XP list, as resolved at the end of the game. */
export interface XpLine {
  label: string;
  xp: number;
}
const inVictory = (s: GameState, code: string) =>
  (s.victoryCards ?? []).filter((c) => dcBase(c) === dcBase(code)).length;
const shipEnemiesInPlay = (s: GameState) =>
  [...s.staging, ...seatIndices(s).flatMap((p) => seatView(s, p).engaged)].some(
    (u) => isShipEnemy(u),
  );
/** The XP each bullet of the current chapter's campaign card gives now. */
export function dreamchaserXpLines(s: GameState): XpLine[] {
  const lines: XpLine[] = [];
  const surviving = globalLivingSeats(s).length;
  lines.push({ label: "1 XP for each surviving player", xp: surviving });
  if (s.scenarioId === "voyage-across-belegaer") {
    const done = (
      s as GameState & { voyageBelegaer?: { completedQuests: string[] } }
    ).voyageBelegaer?.completedQuests;
    const stageTwo = VOYAGE_STAGE_TWO.filter(
      (code) => inVictory(s, code) || done?.includes(code),
    ).length;
    lines.push(
      {
        label: "1 XP if 4 stage 2B quest cards are in the victory display",
        xp: stageTwo >= 4 ? 1 : 0,
      },
      {
        label: "1 XP if you ended the game on-course",
        xp: s.sailing?.heading === 0 ? 1 : 0,
      },
      {
        label: "1 XP if no Ship enemies are in play",
        xp: shipEnemiesInPlay(s) ? 0 : 1,
      },
      {
        label: "1 XP for each Corsair Warship in the victory display",
        xp: inVictory(s, VOYAGE.warship),
      },
      {
        label: "1 XP if Crowley is in the victory display",
        xp: inVictory(s, DC.crowley) ? 1 : 0,
      },
      {
        label: "2 XP if Thunderstruck is in the victory display",
        xp: inVictory(s, DC.thunderstruck) ? 2 : 0,
      },
    );
  }
  lines.push({
    label: "–1 XP if Ominous Fate is in the victory display",
    xp: inVictory(s, DC.ominous) ? -1 : 0,
  });
  const mode = s.dreamchaser?.mode;
  if (mode)
    lines.push({
      label:
        mode === "hard" ? "Hard Mode: gain 1 XP" : "Expert Mode: gain 2 XP",
      xp: mode === "hard" ? 1 : 2,
    });
  return lines;
}
/** The chapter's resolution: XP and the Campaign Pool. */
export function resolveDreamchaserCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  // A hero in its controller's discard pile is a fallen hero.
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) {
    const lost = c.permanent[code] ?? [];
    delete c.permanent[code];
    c.boons = c.boons.filter((x) => !lost.includes(x));
  }
  const gained = dreamchaserXpLines(s).reduce((n, l) => n + l.xp, 0);
  if (
    s.scenarioId === "voyage-across-belegaer" &&
    !c.burdens.includes(DC.ominous)
  )
    // "Add Ominous Fate to the Campaign Pool."
    c.burdens.push(DC.ominous);
  c.xp = Math.max(0, (c.xp ?? 0) + gained);
  log(
    s,
    `${card(DREAMCHASER_CAMPAIGN_CARDS[s.scenarioId]!).name} · Resolution: the players gain ${gained} XP (${c.xp} unspent).`,
    "good",
  );
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
    xp: gained,
  });
  log(s, "The Campaign Log has been updated.", "good");
}

// ----------------------------------------------------------------- effects

export function dreamchaserCampaignEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("dc")) return false;
  switch (e.kind) {
    case "dcModification": {
      const ship = get(s, e.target);
      const p = e.player ?? firstPlayer(s);
      if (!ship) return true;
      const taken = allCharacters(s).flatMap((u) =>
        u.attachments.map((a) => dcBase(a.code)),
      );
      const free = MODIFICATIONS.filter((code) => !taken.includes(code));
      if (!free.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${card(DREAMCHASER_CAMPAIGN_CARDS[s.scenarioId]!).name} · ${several(s) ? `${seatName(s, p)} chooses` : "Choose"} a Modification boon for ${name(ship)}`,
          free.map((code) => ({
            id: code,
            code: dcFace(s.campaign, code),
            label: card(dcFace(s.campaign, code)).name,
            detail: card(dcFace(s.campaign, code)).text,
            effects: [
              fx("dcModificationTake", { target: ship.id, code, player: p }),
            ],
          })),
          "Each player chooses a Modification boon for each of their ship-objectives and attaches it to that ship-objective.",
        ),
      );
      return true;
    }
    case "dcModificationTake": {
      const ship = get(s, e.target);
      if (!ship || !MODIFICATIONS.includes(e.code!)) return true;
      const code = dcFace(s.campaign, e.code!);
      ship.attachments.push({
        id: `a${s.nextId++}`,
        code,
        exhausted: false,
        owner: e.player,
        controller: e.player,
      });
      log(s, `${card(code).name} is attached to ${name(ship)}.`, "good");
      return true;
    }
    case "dcShipToll": {
      const ship = get(s, e.target);
      const p = e.player ?? firstPlayer(s);
      if (!ship) return true;
      const heroes = seatView(s, p).heroes;
      forOwner(s, p, () =>
        choose(
          s,
          `Voyage Across Belegaer · Deal 2 damage to ${name(ship)} to add 1 resource to a hero's resource pool?`,
          [
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Deal 2 damage to ${name(ship)}; 1 resource to ${name(h)}`,
              effects: [
                fx("damage", { target: ship.id, value: 2, player: p }),
                fx("dcAddResource", { target: h.id, player: p }),
              ],
            })),
            { id: "skip", label: "Do not damage the ship", effects: [] },
          ],
          "For each ship-objective, its controller may deal 2 damage to it to add 1 resource to a hero's resource pool.",
        ),
      );
      return true;
    }
    case "dcAddResource": {
      const h = get(s, e.target);
      if (h) {
        h.resources += e.value ?? 1;
        log(s, `${name(h)} gains ${e.value ?? 1} resource.`, "good");
      }
      return true;
    }
    case "dcDivideDamage": {
      const left = e.value ?? 0;
      const p = e.player ?? activeSeat(s);
      if (left <= 0) return true;
      const chars = seatView(s, p).heroes.concat(seatView(s, p).allies);
      if (!chars.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text ?? "Encounter effect"} · ${several(s) ? `${seatName(s, p)} assigns` : "Assign"} ${left} damage`,
          chars.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Deal 1 damage to ${name(u)}`,
            effects: [
              fx("damage", { target: u.id, value: 1, player: p }),
              fx("dcDivideDamage", {
                value: left - 1,
                player: p,
                text: e.text,
              }),
            ],
          })),
          "Distribute the damage among characters you control, one point at a time.",
        ),
      );
      return true;
    }
    case "dcThreat":
      forOwner(s, e.player ?? activeSeat(s), () =>
        raiseThreat(s, e.value ?? 0, "encounter"),
      );
      return true;
    default:
      return dreamchaserCardEffect(s, e);
  }
}

// ------------------------------------------------------------------ status

export function dreamchaserCampaignStatus(s: GameState): string[] {
  if (!isDreamchaserCampaign(s.campaign)) return [];
  const out: string[] = [];
  const c = s.campaign!;
  out.push(
    `Campaign Log: ${c.xp ?? 0} unspent XP. The XP this chapter gives so far: ${
      dreamchaserXpLines(s)
        .filter((l) => l.xp)
        .map(
          (l) =>
            `${l.label.replace(/^[–-]?\d+ XP (if |for each )?/, "")} ${l.xp > 0 ? "+" : ""}${l.xp}`,
        )
        .join(", ") || "none"
    }.`,
  );
  if (s.dreamchaser?.mode === "hard")
    out.push(
      "Hard Mode: each player's threat cannot be reduced by more than 1 each round, and drawing cards raises the drawing player's threat by that number (1 XP if you win).",
    );
  if (s.dreamchaser?.mode === "expert")
    out.push(
      "Expert Mode: threat cannot be reduced, drawing cards raises threat by that number, and a character healed or readied by a player card effect raises its controller's threat by 1 (2 XP if you win).",
    );
  if (
    c.burdens.includes(DC.ominous) ||
    s.scenarioId === "voyage-across-belegaer"
  )
    out.push(
      `Ominous Fate is shuffled into the encounter deck: X is ${dreamchaserOminousX(s)} (the campaign card's part number${s.dreamchaser?.ominous ? ` plus ${s.dreamchaser.ominous}` : ""}).`,
    );
  return out;
}

// -------------------------------------------------------------- validation

const integer = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const exists = (code: string) => {
  try {
    return !!card(code);
  } catch {
    return false;
  }
};
/** A saved Dream-chaser campaign: its Campaign Log and this chapter's state. */
export function validateDreamchaserCampaign(s: GameState): boolean {
  const c = s.campaign;
  if (!c || !isDreamchaserCampaign(c)) return false;
  const seats = s.table?.seats.length ?? 1;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  const hero = (code: string) =>
    exists(code) && card(code).type_code === "hero";
  const order = DREAMCHASER_CAMPAIGN_ORDER;
  const q = s.dreamchaser;
  return (
    order.includes(s.scenarioId) &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every(exists) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every(exists) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    Object.entries(c.permanent).every(
      ([h, cs]) => hero(h) && codes(cs) && cs.every((x) => c.boons.includes(x)),
    ) &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (c.resolution === s.scenarioId && s.status === "won")) &&
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === seats &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    integer(c.xp ?? 0) &&
    (c.marks === undefined ||
      (!!c.marks &&
        typeof c.marks === "object" &&
        !Array.isArray(c.marks) &&
        Object.entries(c.marks).every(([key, n]) => {
          const line = DREAMCHASER_LOG.find((l) => l.key === key);
          return !!line && integer(n) && n <= line.boxes;
        }))) &&
    (c.nightmares === undefined ||
      (Array.isArray(c.nightmares) &&
        c.nightmares.length <= 2 &&
        c.nightmares.every((p) => integer(p) && p < seats))) &&
    (c.deckBoons === undefined ||
      (!!c.deckBoons &&
        typeof c.deckBoons === "object" &&
        !Array.isArray(c.deckBoons) &&
        Object.entries(c.deckBoons).every(
          ([code, seat]) =>
            c.boons.includes(code) && integer(seat) && seat < seats,
        ))) &&
    (c.outcome === undefined ||
      (c.outcome === "won" &&
        c.completed.at(-1)?.scenarioId === "the-city-of-corsairs")) &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (r, i) =>
        order[i] === r.scenarioId &&
        // Victory points can take a score below 0.
        Number.isSafeInteger(r.score) &&
        integer(r.rounds) &&
        (r.xp === undefined || Number.isSafeInteger(r.xp)),
    ) &&
    (c.completed.at(-1)?.scenarioId === s.scenarioId ||
      (nextDreamchaserChapter(c) === s.scenarioId && s.status !== "won")) &&
    (q === undefined ||
      (!!q &&
        typeof q === "object" &&
        (q.mode === undefined || q.mode === "hard" || q.mode === "expert") &&
        (q.ominous === undefined || integer(q.ominous)) &&
        (q.resources === undefined || integer(q.resources)) &&
        (q.reduced === undefined ||
          (!!q.reduced &&
            typeof q.reduced === "object" &&
            !Array.isArray(q.reduced) &&
            Object.values(q.reduced).every(integer)))))
  );
}
export { backFace, dcBase, dcFace };
