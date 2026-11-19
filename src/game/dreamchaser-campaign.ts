// The Dream-chaser campaign (its Campaign Expansion): the Campaign Log with
// its XP and checkboxes, the Campaign Pool, Hard and Expert Mode, the fleet's
// Modification boons and each scenario's campaign card.
import type {
  CampaignState,
  Effect,
  GameState,
  ScenarioId,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  RuleError,
  shuffle,
} from "./core";
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
import { enemyAddedToStaging, raiseThreat } from "./board";
import { reduceThreat } from "./threat-reduction";
import { score } from "./actions";
import { dreamchaserCardEffect } from "./dreamchaser-campaign-cards";
import { isShipEnemy } from "./ships";
import {
  DC,
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  CIRDAN,
  COMMAND,
  SEND_FOR_HELP,
  GALDOR,
  MODIFICATIONS,
  backFace,
  dcBase,
  dcFace,
  dcIs,
  dcScenarioFace,
  dcUpgraded,
  dreamchaserPart,
  fleetShip,
  isDreamchaserCampaign,
  isFleetShip,
} from "./dreamchaser-campaign-support";
import { VOYAGE, VOYAGE_STAGE_TWO } from "./voyage-belegaer-support";
import { FATE } from "./fate-numenor-support";
import { RAID } from "./raid-grey-havens-support";
import { STORMCALLER } from "./stormcaller-support";
import { DEPTHS } from "./depths-support";
import { DROWNED } from "./drowned-support";
import { COBAS, COBAS_OBJECTIVES } from "./cobas-support";
import { cobasObjectiveControlled as cobasControlled } from "./cobas";
import { dreamchaserPhaseRedirect, gavinPlacement } from "./dreamchaser-cobas";
import { CITY } from "./city-support";
import { TEMPLE, templeMapUnits } from "./temple-support";
import {
  placeTempleSecrets,
  shuffleCampaignNightmares,
} from "./dreamchaser-temple";

export {
  DREAMCHASER_CAMPAIGN_CARDS,
  DREAMCHASER_CAMPAIGN_ORDER,
  DREAMCHASER_LOG,
  isDreamchaserCampaign,
} from "./dreamchaser-campaign-support";

/** The chapters supported in campaign mode so far. */
export const DREAMCHASER_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "voyage-across-belegaer",
  "the-fate-of-numenor",
  "raid-on-the-grey-havens",
  "flight-of-the-stormcaller",
  "the-thing-in-the-depths",
  "temple-of-the-deceived",
  "the-drowned-ruins",
  "a-storm-on-cobas-haven",
  "the-city-of-corsairs",
];
/** The chapters whose campaign card shuffles Thunderstruck into the encounter deck and Crowley into the Corsair deck. */
const CORSAIR_CHAPTERS: readonly ScenarioId[] = [
  "voyage-across-belegaer",
  "flight-of-the-stormcaller",
  "a-storm-on-cobas-haven",
  "the-city-of-corsairs",
];
/** The chapters whose campaign card shuffles Revenant into the encounter deck. */
const REVENANT_CHAPTERS: readonly ScenarioId[] = [
  "the-fate-of-numenor",
  "temple-of-the-deceived",
  "the-drowned-ruins",
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
  /**
   * Raid on the Grey Havens: Calphon is in play under the campaign card
   * (his loss loses the game until stage 2B removes him).
   */
  calphon?: boolean;
  /** Raid on the Grey Havens: the copies of Galdor's Counsel chosen during setup, by the seat that took each. */
  galdor?: Record<string, number>;
  /** Graxar: the enemies attacked this round ("No more than 1 character can attack Graxar each round"). */
  attacked?: { round: number; ids: string[] };
  /** Once-per-game abilities used this game (Throwing Axe), by attachment id. */
  spent?: string[];
  /** Calaerion's stat boosts: "+1 [willpower], +1 [attack], and +1 [defense] until the end of the phase" (or round). */
  boosts?: {
    target: string;
    until: "phase" | "round";
    phase: string;
    round: number;
    /** The amounts (without them, +1 willpower, +1 attack and +1 defense). */
    will?: number;
    attack?: number;
    defense?: number;
  }[];
  /** Calaerion (Upgraded): the round his Response was last used ("Limit once per round"). */
  calaerionRound?: number;
  /** The Thing in the Depths: the Captain Sahír enemies Black Key (burden) was attached to. */
  keyed?: string[];
  /** The Thing in the Depths: the seat that added Come Together to their hand. */
  together?: number;
  /** Come Together: the Traits granted until the end of the round. */
  grants?: { target: string; trait: string; round: number }[];
  /**
   * Temple of the Deceived: the secrets facedown under the Temple of the
   * Deceived locations (Starla and both Recurring Nightmares), by map
   * location id.
   */
  secrets?: Record<string, string>;
  /** The seats that looked at each secret with the Upgraded Gate Key. */
  secretLooks?: Record<string, number[]>;
  /** The Drowned Ruins: the copies of Command chosen during setup, by the seat that took each. */
  commands?: Record<string, number>;
  /** The Drowned Ruins: the copy of Círdan's Blessing chosen during setup, by its seat. */
  cirdan?: Record<string, number>;
  /** Command (Leadership): the allies it put into play, discarded at the end of the phase. */
  summoned?: string[];
  /** Command (Spirit): the round characters with Círdan's Blessing do not exhaust to quest. */
  blessedQuest?: number;
  /** Círdan's Blessing (Tactics): "+3 [attack] for this attack", by attacker id. */
  strikes?: Record<string, number>;
  /** A Storm on Cobas Haven: the copies of Send for Help still set aside. */
  sendForHelp?: string[];
  /** Send for Help (Tactics): the heroes it put into play until the end of the round. */
  borrowed?: string[];
  /** Send for Help (Spirit): the additional phases still to come after the current one. */
  extraPhases?: string[];
  /** Send for Help (Spirit): the additional phase in progress and the phase start it delays. */
  extraPhase?: { phase: string; resume: Effect };
  /** The City of Corsairs: the Captain Sahír enemies Black Key (burden) and The Black Sword were attached to. */
  armed?: string[];
  /** The Black Sword: the round Captain Sahír attacked each other player. */
  swordRound?: number;
  /** The Black Sword: the round its Refresh Action was used (group limit). */
  swordRefresh?: number;
  /** The Stormcaller's campaign side (The City of Corsairs): the progress placed this round. */
  questProgress?: { round: number; placed: number };
}
export const dreamchaserState = (s: GameState) => (s.dreamchaser ??= {});
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
/** A scalable card's level in this game. */
const dcMarksOf = (s: GameState, key: string) =>
  Math.max(0, s.campaign?.marks?.[key] ?? 0);

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
  // The Permanent boons recorded in the Campaign Log return to their heroes
  // (Parrying Cutlass, Throwing Axe), on their Upgraded sides once all of
  // their checkboxes are marked.
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      for (const h of s.heroes)
        for (const code of c!.permanent[h.code] ?? []) {
          if (h.attachments.some((a) => dcBase(a.code) === code)) continue;
          h.attachments.push({
            id: `a${s.nextId++}`,
            code: dcFace(c, code),
            exhausted: false,
            owner: p,
          });
          log(s, `${card(code).name} is attached to ${name(h)}.`, "good");
        }
    });
  // The Campaign Pool's encounter burdens are shuffled into the encounter deck.
  const pool: string[] = c!.burdens.filter((code) => code === DC.ominous);
  // Raid on the Grey Havens: "Shuffle Graxar into the encounter deck."
  if (s.scenarioId === "raid-on-the-grey-havens") pool.push(DC.graxar);
  // Voyage Across Belegaer: "Shuffle Ominous Fate and Thunderstruck into the
  // encounter deck. Shuffle Crowley into the Corsair deck."
  // The Fate of Númenor (and later chapters): "Shuffle Revenant into the
  // encounter deck."
  if (REVENANT_CHAPTERS.includes(s.scenarioId)) pool.push(DC.revenant);
  if (s.scenarioId === "voyage-across-belegaer" && !pool.includes(DC.ominous))
    pool.push(DC.ominous);
  if (CORSAIR_CHAPTERS.includes(s.scenarioId)) {
    pool.push(DC.thunderstruck);
    const corsairs = corsairDeck(s);
    if (corsairs) {
      corsairs.push(DC.crowley);
      shuffle(s, corsairs);
    }
  }
  // Recurring Nightmare: "For the remainder of the campaign, that player
  // shuffles that Recurring Nightmare into their deck after they draw their
  // starting hand."
  shuffleCampaignNightmares(s);
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
  const fleet = s as GameState & {
    voyageBelegaer?: { corsairDeck: string[] };
    stormcaller?: { corsairDeck: string[] };
  };
  return (fleet.voyageBelegaer ?? fleet.stormcaller ?? s.cobas ?? s.city)
    ?.corsairDeck;
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

/**
 * "For each character in play, its controller may deal 1 damage to it to
 * reduce their threat by 1" (The Fate of Númenor, Temple of the Deceived and
 * The Drowned Ruins): one offer for each player, in turn order.
 */
export const dreamchaserWoundOffers = (s: GameState): Effect[] =>
  playerOrder(s).map((player) => fx("dcWound", { player }));
/**
 * The Fate of Númenor's campaign card, once the scenario's setup put Calphon
 * into play: "Attach Spyglass to Calphon. … For each character in play, its
 * controller may deal 1 damage to it to reduce their threat by 1."
 */
/**
 * Raid on the Grey Havens' campaign card, after the scenario's setup: "The
 * first player takes control of Calphon and attaches Spyglass and Black Key
 * (boon) to him. … Each player may choose one copy of Galdor's Counsel and
 * add it to their hand. For this game, X is plus 1 for each of those copies."
 */
export function dreamchaserRaidReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const p = firstPlayer(s);
  const calphon = make(s, dcScenarioFace(c, DC.calphon));
  calphon.owner = p;
  for (const code of [DC.spyglass, DC.keyBoon])
    calphon.attachments.push({
      id: `a${s.nextId++}`,
      code: dcFace(c, code),
      exhausted: false,
    });
  forOwner(s, p, () => s.allies.push(calphon));
  dreamchaserState(s).calphon = true;
  log(
    s,
    `${several(s) ? `${seatName(s, p)} takes` : "You take"} control of Calphon, with Spyglass and Black Key attached.`,
    "good",
  );
  return playerOrder(s).map((player) => fx("dcGaldorOffer", { player }));
}
/**
 * Flight of the Stormcaller's campaign card, once the fleet is prepared:
 * "Flip the Stormcaller to its 'Campaign Mode only' side, then attach Black
 * Key (burden) to it. Each player chooses a Modification boon for each of
 * their ship-objectives … Put Calaerion into play under the control of the
 * player with the Dream-chaser." (The scenario's setup made the Stormcaller
 * on its campaign side.)
 */
export function dreamchaserFlightReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const area = s as GameState & { stormcaller?: { area: Unit[] } };
  const target = [...(area.stormcaller?.area ?? []), ...s.staging].find((u) =>
    dcIs(u, STORMCALLER.stormcaller),
  );
  if (target) {
    const key = dcFace(c, DC.keyBurden);
    target.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} is attached to the Stormcaller.`, "danger");
  }
  dreamchaserCalaerion(s);
  return dreamchaserFleetReady(s);
}
/** "Put Calaerion into play under the control of the player with the Dream-chaser." */
export function dreamchaserCalaerion(s: GameState) {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return;
  const p =
    seatIndices(s).find((x) =>
      seatView(s, x).allies.some((u) => fleetShip(u.code) === "dream"),
    ) ?? firstPlayer(s);
  const u = make(s, dcFace(c, DC.calaerion));
  u.owner = p;
  forOwner(s, p, () => s.allies.push(u));
  log(
    s,
    `Calaerion enters play under ${several(s) ? `${seatName(s, p)}'s` : "your"} control.`,
    "good",
  );
}
/**
 * The Thing in the Depths' campaign card: "Forced: After Captain Sahír flips
 * over, remove Black Key (burden) from the game and attach Black Key (boon)
 * to him. Add Sea Serpent (Menacing side) to the staging area. One player
 * adds Come Together to their hand. For this game, X is plus 1 for Come
 * Together." (Flipping discarded the burden, which leaves the game.)
 */
export function dreamchaserSahirFlipped(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const sahir = seatIndices(s)
    .flatMap((p) => seatView(s, p).allies)
    .find((u) => u.code === DEPTHS.sahirAlly);
  if (sahir) {
    const key = dcFace(c, DC.keyBoon);
    sahir.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} (boon) is attached to Captain Sahír.`, "good");
  }
  const serpent = make(s, DC.serpent);
  s.staging.push(serpent);
  enemyAddedToStaging(s, serpent);
  log(s, "Sea Serpent (Menacing) is added to the staging area.", "danger");
  return [fx("dcTogetherOffer", { player: firstPlayer(s) })];
}
/**
 * Temple of the Deceived's campaign card, once the scenario's setup put
 * Captain Sahír into play: "Attach Black Key (boon) to Captain Sahír. …
 * Shuffle Starla and both Recurring Nightmares together and place one
 * facedown under each Temple of the Deceived location, as secrets. For each
 * character in play, its controller may deal 1 damage to it to reduce their
 * threat by 1. One player may raise their threat by 4 to attach Spyglass to
 * a hero." (Revenant was shuffled into the encounter deck.)
 */
export function dreamchaserTempleReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const sahir = seatIndices(s)
    .flatMap((p) => seatView(s, p).allies)
    .find((u) => u.code === TEMPLE.sahirAlly);
  if (sahir) {
    const key = dcFace(c, DC.keyBoon);
    sahir.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} (boon) is attached to Captain Sahír.`, "good");
  }
  placeTempleSecrets(s);
  return [
    ...dreamchaserWoundOffers(s),
    fx("dcSpyglassOffer", { player: firstPlayer(s) }),
  ];
}
/**
 * The Drowned Ruins' campaign card, once the scenario's setup put Captain
 * Sahír into play: "Attach Black Key (boon) to Captain Sahír. … Each player
 * may choose one copy of Command and add it to their hand. For this game, X
 * is plus 1 for each of those copies. One player may choose one copy of
 * Círdan's Blessing and add it to their hand. For each character in play,
 * its controller may deal 1 damage to it to reduce their threat by 1."
 */
export function dreamchaserDrownedReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const sahir = seatIndices(s)
    .flatMap((p) => seatView(s, p).allies)
    .find((u) => u.code === DROWNED.sahirAlly);
  if (sahir) {
    const key = dcFace(c, DC.keyBoon);
    sahir.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} (boon) is attached to Captain Sahír.`, "good");
  }
  return [
    ...playerOrder(s).map((player) => fx("dcCommandOffer", { player })),
    fx("dcCirdanOffer", { player: firstPlayer(s) }),
    ...dreamchaserWoundOffers(s),
  ];
}
/**
 * A Storm on Cobas Haven's campaign card, once the fleet is prepared and the
 * scenario's setup is done: "Attach Black Key (burden) to Raider Flagship.
 * Each player chooses a Modification boon for each of their ship-objectives
 * … Put Calaerion into play under the control of the player with the
 * Dream-chaser. Put Gavin into play under any player's control. One player
 * may choose a copy of Círdan's Blessing not in the Campaign Pool and add it
 * to their hand." The four copies of Send for Help are set aside for Gavin.
 */
export function dreamchaserCobasReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const flagship = s.staging.find((u) => u.code === COBAS.flagship);
  if (flagship) {
    const key = dcFace(c, DC.keyBurden);
    flagship.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} is attached to Raider Flagship.`, "danger");
  }
  dreamchaserState(s).sendForHelp = [...SEND_FOR_HELP];
  dreamchaserCalaerion(s);
  return [
    ...dreamchaserFleetReady(s),
    gavinPlacement(s),
    ...(CIRDAN.some((code) => !c!.boons.includes(code))
      ? [fx("dcCirdanOffer", { player: firstPlayer(s) })]
      : []),
  ];
}
/**
 * The City of Corsairs' campaign card, once the fleet is prepared and the
 * scenario's setup is done: "Flip the Stormcaller to its 'Campaign Mode
 * only' side, then attach Black Key (burden) to it. Each player chooses a
 * Modification boon for each of their ship-objectives … Put Calaerion into
 * play under the control of the player with the Dream-chaser. One player
 * may choose a copy of Círdan's Blessing not in the Campaign Pool and add it
 * to their hand. If 'Gavin returned,' put him into play under any player's
 * control. Flip this card over." (The scenario's setup made the Stormcaller
 * on its campaign side.)
 */
export function dreamchaserCityReady(s: GameState): Effect[] {
  const c = s.campaign;
  if (!isDreamchaserCampaign(c)) return [];
  const stormcaller = s.staging.find((u) => dcIs(u, CITY.stormcaller));
  if (stormcaller) {
    const key = dcFace(c, DC.keyBurden);
    stormcaller.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, `${card(key).name} is attached to the Stormcaller.`, "danger");
  }
  dreamchaserCalaerion(s);
  log(
    s,
    "The City of Corsairs: the campaign card is flipped over (Captain Sahír will bring Black Key and The Black Sword).",
    "chapter",
  );
  return [
    ...dreamchaserFleetReady(s),
    ...(CIRDAN.some((code) => !c!.boons.includes(code))
      ? [fx("dcCirdanOffer", { player: firstPlayer(s) })]
      : []),
    ...(gavinReturned(c)
      ? [fx("dcCityGavin", { player: firstPlayer(s) })]
      : []),
  ];
}
export function dreamchaserFateReady(s: GameState, calphon: Unit): Effect[] {
  if (!isDreamchaserCampaign(s.campaign)) return [];
  const code = dcFace(s.campaign, DC.spyglass);
  calphon.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  log(s, `${card(code).name} is attached to ${name(calphon)}.`, "good");
  return dreamchaserWoundOffers(s);
}

// --------------------------------------------------------------- resolution

/** One bullet of the campaign card's XP list, as resolved at the end of the game. */
export interface XpLine {
  label: string;
  xp: number;
}
const inVictory = (s: GameState, code: string) =>
  (s.victoryCards ?? []).filter((c) => dcBase(c) === dcBase(code)).length;
/** Every card in play: the staging area, each seat's characters and engaged enemies. */
const allInPlay = (s: GameState) => [
  ...s.staging,
  ...seatIndices(s).flatMap((p) => {
    const v = seatView(s, p);
    return [...v.heroes, ...v.allies, ...v.engaged];
  }),
];
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...seatIndices(s).flatMap((p) => seatView(s, p).engaged)].some(
    (u) => ["enemy", "ship-enemy"].includes(card(u.code).type_code),
  );
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
  if (s.scenarioId === "the-fate-of-numenor")
    lines.push(
      {
        label:
          "1 XP for each Lush Jungle and Drowned Graves in the victory display",
        xp: inVictory(s, FATE.jungle) + inVictory(s, FATE.graves),
      },
      {
        label: "1 XP for each resource on this card (to a maximum of 3 XP)",
        xp: Math.min(3, s.dreamchaser?.resources ?? 0),
      },
      {
        label: "1 XP if each surviving player's threat is 40 or less",
        xp: globalLivingSeats(s).every((p) => seatView(s, p).threat <= 40)
          ? 1
          : 0,
      },
    );
  if (s.scenarioId === "flight-of-the-stormcaller")
    lines.push(
      {
        label: "1 XP if you ended the game on-course",
        xp: s.sailing?.heading === 0 ? 1 : 0,
      },
      {
        label: "1 XP if you ended the game on stage 2B",
        xp: s.stage === 2 ? 1 : 0,
      },
      {
        label: "2 XP if you destroyed the Stormcaller",
        xp: inVictory(s, STORMCALLER.stormcaller) ? 2 : 0,
      },
      {
        label: "1 XP if Crowley is in the victory display",
        xp: inVictory(s, DC.crowley) ? 1 : 0,
      },
      {
        label: "2 XP if Thunderstruck is in the victory display",
        xp: inVictory(s, DC.thunderstruck) ? 2 : 0,
      },
      {
        label: "1 XP if each hero has no damage on it",
        xp: seatIndices(s).every((p) =>
          seatView(s, p).heroes.every((h) => !h.damage),
        )
          ? 1
          : 0,
      },
    );
  if (s.scenarioId === "the-thing-in-the-depths") {
    const named = (n: string) =>
      allInPlay(s).filter((u) => card(u.code).name === n);
    const serpents = allInPlay(s).filter(
      (u) => dcIs(u, DC.serpent) && u.code.endsWith(".B"),
    );
    const threats = globalLivingSeats(s).map((p) => seatView(s, p).threat);
    lines.push(
      {
        label: "1 XP if Captain Sahír has 5 or more resources",
        xp: named("Captain Sahír").some((u) => u.resources >= 5) ? 1 : 0,
      },
      {
        label: "1 XP if Na'asiyah has 5 or more resources",
        xp: named("Na'asiyah").some((u) => u.resources >= 5) ? 1 : 0,
      },
      {
        label:
          "1 XP if Sea Serpent (Enraged side) is in play (2 XP instead if it is in the victory display)",
        xp: (s.victoryCards ?? []).includes(backFace(DC.serpent))
          ? 2
          : serpents.length
            ? 1
            : 0,
      },
      {
        label: "1 XP if each hero has no damage on it",
        xp: seatIndices(s).every((p) =>
          seatView(s, p).heroes.every((h) => !h.damage),
        )
          ? 1
          : 0,
      },
      {
        label:
          "1 XP if each surviving player's threat is 40 or less (2 XP instead if their threat is 30 or less)",
        xp: threats.every((n) => n <= 30)
          ? 2
          : threats.every((n) => n <= 40)
            ? 1
            : 0,
      },
    );
  }
  if (s.scenarioId === "temple-of-the-deceived") {
    const map = s.temple ? templeMapUnits(s) : [];
    lines.push(
      {
        label: "1 XP for each resource on this card (to a maximum of 3 XP)",
        xp: Math.min(3, s.dreamchaser?.resources ?? 0),
      },
      {
        label: "1 XP for each faceup Temple Halls",
        xp: map.filter((u) => u.code === TEMPLE.halls).length,
      },
      {
        label: "1 XP if 4 or fewer Uncharted locations are faceup",
        xp:
          map.filter((u) => [TEMPLE.lost, TEMPLE.temple].includes(u.code))
            .length <= 4
            ? 1
            : 0,
      },
      {
        label: "1 XP if Temple Guardian is in the victory display",
        xp: inVictory(s, TEMPLE.guardian) ? 1 : 0,
      },
      {
        label: "1 XP if each surviving player's threat is 40 or less",
        xp: globalLivingSeats(s).every((p) => seatView(s, p).threat <= 40)
          ? 1
          : 0,
      },
    );
  }
  if (s.scenarioId === "the-drowned-ruins") {
    const underwater = (s.drowned?.victoryLocations ?? []).filter((u) =>
      (card(u.code).traits ?? "").includes("Underwater."),
    ).length;
    lines.push(
      {
        label: "1 XP for each resource on this card (to a maximum of 3 XP)",
        xp: Math.min(3, s.dreamchaser?.resources ?? 0),
      },
      {
        label: "1 XP if Na'asiyah has 5 or more resources",
        xp: allInPlay(s).some(
          (u) => card(u.code).name === "Na'asiyah" && u.resources >= 5,
        )
          ? 1
          : 0,
      },
      {
        label: "1 XP if no enemies are in play",
        xp: enemiesInPlay(s) ? 0 : 1,
      },
      {
        label:
          "1 XP if 5 or more Underwater locations are in the victory display",
        xp: underwater >= 5 ? 1 : 0,
      },
      {
        label:
          "2 XP if Shrine to Morgoth (Grotto side) is in the victory display",
        xp: (s.victoryCards ?? []).includes(DROWNED.shrine) ? 2 : 0,
      },
      {
        label: "1 XP if each surviving player's threat is 40 or less",
        xp: globalLivingSeats(s).every((p) => seatView(s, p).threat <= 40)
          ? 1
          : 0,
      },
    );
  }
  if (s.scenarioId === "the-city-of-corsairs") {
    const named = (n: string) =>
      (s.victoryCards ?? []).some((code) => card(code).name === n);
    lines.push(
      {
        label: "1 XP if Corsair Warship is in the victory display",
        xp: named("Corsair Warship") ? 1 : 0,
      },
      {
        label: "1 XP if Shattered Monument is in the victory display",
        xp: inVictory(s, CITY.monument) ? 1 : 0,
      },
      {
        label: "1 XP if Crowley is in the victory display",
        xp: inVictory(s, DC.crowley) ? 1 : 0,
      },
      {
        label: "1 XP if Stormcaller is in the victory display",
        xp: inVictory(s, CITY.stormcaller) ? 1 : 0,
      },
      {
        label: "2 XP if Thunderstruck is in the victory display",
        xp: inVictory(s, DC.thunderstruck) ? 2 : 0,
      },
    );
  }
  if (s.scenarioId === "a-storm-on-cobas-haven") {
    const allies = seatIndices(s).flatMap((p) => seatView(s, p).allies);
    const objectives = s.staging.filter(
      (u) => COBAS_OBJECTIVES.includes(u.code) && cobasControlled(s, u),
    );
    lines.push(
      {
        label: "1 XP if you ended the game on-course",
        xp: s.sailing?.heading === 0 ? 1 : 0,
      },
      {
        label: "1 XP if 2 Dol Amroth Warships are in play",
        xp: allies.filter((u) => dcIs(u, COBAS.warship)).length >= 2 ? 1 : 0,
      },
      {
        label: "1 XP if the players control 2 Corsair Skirmishers",
        xp: allies.filter((u) => u.cobasShipObjective).length >= 2 ? 1 : 0,
      },
      {
        label: "1 XP if the players control 4 Dol Amroth objectives",
        xp: objectives.length >= 4 ? 1 : 0,
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
        label: "2 XP if Raider Flagship is in the victory display",
        xp: inVictory(s, COBAS.flagship) ? 2 : 0,
      },
      {
        label: "2 XP if Thunderstruck is in the victory display",
        xp: inVictory(s, DC.thunderstruck) ? 2 : 0,
      },
    );
  }
  if (s.scenarioId === "raid-on-the-grey-havens") {
    const burned = s.raidGreyHavens?.burned.length ?? 0;
    lines.push(
      {
        label:
          "1 XP if 2 or fewer cards are underneath The Havens Burn (2 XP instead if no cards are underneath it)",
        xp: burned === 0 ? 2 : burned <= 2 ? 1 : 0,
      },
      {
        label: "1 XP for each Elven Wave-runner in the victory display",
        xp: inVictory(s, RAID.runner),
      },
      {
        label: "1 XP if Na'asiyah is in the victory display",
        xp: inVictory(s, RAID.naasiyah) ? 1 : 0,
      },
      {
        label: "1 XP if no enemies are in play",
        xp: enemiesInPlay(s) ? 0 : 1,
      },
      {
        label: "1 XP if each surviving player's threat is 40 or less",
        xp: globalLivingSeats(s).every((p) => seatView(s, p).threat <= 40)
          ? 1
          : 0,
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
/** Temple of the Deceived: the Recurring Nightmares that are no longer secrets. */
const templeFreedNightmares = (s: GameState) =>
  s.scenarioId !== "temple-of-the-deceived" || !s.dreamchaser?.secrets
    ? 0
    : 2 -
      Object.values(s.dreamchaser.secrets).filter(
        (code) => code === DC.nightmare,
      ).length;
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
  if (s.scenarioId === "raid-on-the-grey-havens") {
    // "Add the copies of Galdor's Counsel chosen during setup to the
    // Campaign Pool." Each joins the deck of the player who chose it.
    const chosen = Object.entries(s.dreamchaser?.galdor ?? {});
    for (const [code, seat] of chosen) {
      if (!c.boons.includes(code)) c.boons.push(code);
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: seat };
    }
    if (chosen.length)
      log(
        s,
        `Raid on the Grey Havens · Resolution: ${chosen.map(([code]) => card(code).name + (card(code).boon_sphere ? ` (${card(code).boon_sphere})` : "")).join(", ")} ${chosen.length === 1 ? "joins" : "join"} the Campaign Pool.`,
        "good",
      );
    // "If Graxar is in the victory display, choose either Parrying Cutlass
    // or Throwing Axe, add it to the Campaign Pool, and record which hero you
    // attach it to." The end-of-game dialog asks.
    if (inVictory(s, DC.graxar)) c.resolution = s.scenarioId;
  }
  if (s.scenarioId === "temple-of-the-deceived") {
    // "If Starla is under a player's control, add her to the Campaign Pool."
    // She joins the deck of the player who controls her.
    const starla = seatIndices(s).find((p) =>
      seatView(s, p).allies.some((u) => dcIs(u, DC.starla)),
    );
    if (starla !== undefined) {
      if (!c.boons.includes(DC.starla)) c.boons.push(DC.starla);
      c.deckBoons = { ...(c.deckBoons ?? {}), [DC.starla]: starla };
      log(
        s,
        "Temple of the Deceived · Resolution: Starla joins the Campaign Pool.",
        "good",
      );
    }
    // "For each Recurring Nightmare that is not a secret, add it to the
    // Campaign Pool and choose a player." With several players the
    // end-of-game dialog asks.
    const freed = templeFreedNightmares(s);
    if (freed) {
      if (!c.burdens.includes(DC.nightmare)) c.burdens.push(DC.nightmare);
      if (several(s)) c.resolution = s.scenarioId;
      else c.nightmares = Array<number>(freed).fill(firstPlayer(s));
      log(
        s,
        `Temple of the Deceived · Resolution: ${freed === 1 ? "a Recurring Nightmare joins" : "both Recurring Nightmares join"} the Campaign Pool.`,
        "danger",
      );
    }
  }
  if (s.scenarioId === "the-city-of-corsairs") {
    // "Resolution: The players win the campaign!"
    c.outcome = "won";
    log(
      s,
      "The City of Corsairs · Resolution: the players win the Dream-chaser campaign!",
      "good",
    );
  }
  if (s.scenarioId === "a-storm-on-cobas-haven") {
    // "Add the Círdan's Blessing chosen during setup to the Campaign Pool."
    for (const [code, seat] of Object.entries(s.dreamchaser?.cirdan ?? {})) {
      if (!c.boons.includes(code)) c.boons.push(code);
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: seat };
      log(
        s,
        `A Storm on Cobas Haven · Resolution: Círdan's Blessing (${card(code).boon_sphere}) joins the Campaign Pool.`,
        "good",
      );
    }
  }
  if (s.scenarioId === "the-drowned-ruins") {
    // "Add each copy of Command and Círdan's Blessing chosen during setup to
    // the Campaign Pool." Each joins the deck of the player who chose it.
    const chosen = Object.entries({
      ...(s.dreamchaser?.commands ?? {}),
      ...(s.dreamchaser?.cirdan ?? {}),
    });
    for (const [code, seat] of chosen) {
      if (!c.boons.includes(code)) c.boons.push(code);
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: seat };
    }
    if (chosen.length)
      log(
        s,
        `The Drowned Ruins · Resolution: ${chosen.map(([code]) => `${card(code).name} (${card(code).boon_sphere})`).join(", ")} ${chosen.length === 1 ? "joins" : "join"} the Campaign Pool.`,
        "good",
      );
  }
  // The Thing in the Depths: "The players may add Come Together to the
  // Campaign Pool." The end-of-game dialog asks.
  if (
    s.scenarioId === "the-thing-in-the-depths" &&
    s.dreamchaser?.together !== undefined &&
    !c.boons.includes(DC.together)
  )
    c.resolution = s.scenarioId;
  c.xp = Math.max(0, (c.xp ?? 0) + gained);
  // "The players may spend 4 XP on Gavin to record in the Campaign Log that
  // 'Gavin returned.'" The end-of-game dialog asks.
  if (
    s.scenarioId === "a-storm-on-cobas-haven" &&
    c.xp >= 4 &&
    !dcUpgraded(c, DC.gavin)
  )
    c.resolution = s.scenarioId;
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

/** The choices a campaign card's resolution waits for in the end-of-game dialog. */
export function dreamchaserResolutionQuestions(s: GameState): {
  id: string;
  label: string;
  options: { id: string; code?: string; label: string }[];
}[] {
  const c = s.campaign;
  if (
    !isDreamchaserCampaign(c) ||
    s.status !== "won" ||
    c!.resolution !== s.scenarioId
  )
    return [];
  if (s.scenarioId === "raid-on-the-grey-havens")
    return [
      {
        id: "boon",
        label:
          "Graxar is in the victory display: add Parrying Cutlass or Throwing Axe to the Campaign Pool",
        options: [DC.cutlass, DC.axe].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      {
        id: "hero",
        label: "Record the hero it is attached to (Permanent)",
        options: c!.heroes
          .filter((h) => !c!.fallen.includes(h))
          .map((h) => ({ id: h, code: h, label: card(h).name })),
      },
    ];
  if (s.scenarioId === "a-storm-on-cobas-haven")
    return [
      {
        id: "gavin",
        label: `Spend 4 XP on Gavin to record "Gavin returned" (${c!.xp ?? 0} unspent XP)?`,
        options: [
          { id: "spend", code: DC.gavin, label: "Spend 4 XP: Gavin returned" },
          { id: "skip", label: "Keep the XP" },
        ],
      },
    ];
  if (s.scenarioId === "temple-of-the-deceived")
    return Array.from({ length: templeFreedNightmares(s) }, (_, i) => ({
      id: `nightmare-${i + 1}`,
      label: `Recurring Nightmare${templeFreedNightmares(s) > 1 ? ` (copy ${i + 1})` : ""}: which player shuffles it into their deck after drawing their starting hand, for the rest of the campaign?`,
      options: seatIndices(s).map((p) => ({
        id: String(p),
        code: DC.nightmare,
        label: seatName(s, p),
      })),
    }));
  if (s.scenarioId === "the-thing-in-the-depths")
    return [
      {
        id: "together",
        label: "Add Come Together to the Campaign Pool?",
        options: [
          { id: "add", code: DC.together, label: "Add Come Together" },
          { id: "skip", label: "Do not add it" },
        ],
      },
    ];
  return [];
}
/** Record the resolution's choices in the Campaign Log. */
export function applyDreamchaserResolution(
  input: GameState,
  answers: Record<string, string>,
): GameState {
  const s = structuredClone(input);
  const c = s.campaign!;
  const questions = dreamchaserResolutionQuestions(s);
  if (!questions.length)
    throw new RuleError("This campaign card has no resolution waiting.");
  for (const q of questions)
    if (!q.options.some((o) => o.id === answers[q.id]))
      throw new RuleError(`Answer: ${q.label}`);
  if (s.scenarioId === "raid-on-the-grey-havens") {
    const code = answers.boon,
      hero = answers.hero;
    if (!c.boons.includes(code)) c.boons.push(code);
    c.permanent = {
      ...c.permanent,
      [hero]: [...(c.permanent[hero] ?? []).filter((x) => x !== code), code],
    };
    log(
      s,
      `Raid on the Grey Havens · Resolution: ${card(code).name} joins the Campaign Pool, attached to ${card(hero).name}.`,
      "good",
    );
  }
  if (s.scenarioId === "a-storm-on-cobas-haven" && answers.gavin === "spend") {
    c.xp = Math.max(0, (c.xp ?? 0) - 4);
    c.marks = { ...(c.marks ?? {}), [DC.gavin]: 4 };
    log(
      s,
      'A Storm on Cobas Haven · Resolution: the players spend 4 XP; the Campaign Log records "Gavin returned."',
      "good",
    );
  }
  if (s.scenarioId === "temple-of-the-deceived") {
    c.nightmares = questions.map((q) => Number(answers[q.id]));
    log(
      s,
      `Temple of the Deceived · Resolution: ${c.nightmares.map((p) => seatName(s, p)).join(" and ")} will shuffle ${c.nightmares.length === 1 ? "the Recurring Nightmare" : "a Recurring Nightmare each"} into their deck after drawing their starting hand.`,
      "danger",
    );
  }
  if (
    s.scenarioId === "the-thing-in-the-depths" &&
    answers.together === "add"
  ) {
    if (!c.boons.includes(DC.together)) c.boons.push(DC.together);
    c.deckBoons = {
      ...(c.deckBoons ?? {}),
      [DC.together]: s.dreamchaser?.together ?? 0,
    };
    log(
      s,
      "The Thing in the Depths · Resolution: Come Together joins the Campaign Pool.",
      "good",
    );
  }
  c.resolution = null;
  return s;
}

// ----------------------------------------------------------------- effects

export function dreamchaserCampaignEffect(s: GameState, e: Effect): boolean {
  // Send for Help (Spirit): an additional phase delays the next one.
  if (isDreamchaserCampaign(s.campaign) && dreamchaserPhaseRedirect(s, e))
    return true;
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
    case "dcWound": {
      const p = e.player ?? firstPlayer(s);
      const done = (e.text ?? "").split(",").filter(Boolean);
      const view = seatView(s, p);
      const chars = [...view.heroes, ...view.allies].filter(
        (u) =>
          !done.includes(u.id) &&
          ["hero", "ally", "objective-ally"].includes(card(u.code).type_code),
      );
      if (!chars.length || !view.threat) return true;
      const campaignCard = card(DREAMCHASER_CAMPAIGN_CARDS[s.scenarioId]!);
      forOwner(s, p, () =>
        choose(
          s,
          `${campaignCard.name} · ${several(s) ? `${seatName(s, p)}: deal` : "Deal"} 1 damage to a character to reduce your threat by 1?`,
          [
            ...chars.map((u) => {
              const health = card(u.code).health ?? 0;
              const lethal = health > 0 && u.damage + 1 >= health;
              return {
                id: u.id,
                code: u.code,
                label: `Deal 1 damage to ${name(u)}${lethal ? " (it is destroyed)" : ""}; threat −1`,
                effects: [
                  fx("damage", { target: u.id, value: 1, player: p }),
                  fx("dcThreatDown", { value: 1, player: p }),
                  fx("dcWound", { player: p, text: [...done, u.id].join(",") }),
                ],
              };
            }),
            { id: "skip", label: "Done", effects: [] },
          ],
          "For each character in play, its controller may deal 1 damage to it to reduce their threat by 1.",
        ),
      );
      return true;
    }
    case "dcGaldorOffer": {
      const p = e.player ?? firstPlayer(s);
      const taken = Object.keys(dreamchaserState(s).galdor ?? {});
      const free = GALDOR.filter((code) => !taken.includes(code));
      if (!free.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Raid on the Grey Havens · ${several(s) ? `${seatName(s, p)} may choose` : "Choose"} a copy of Galdor's Counsel for ${several(s) ? "their" : "your"} hand?`,
          [
            ...free.map((code) => ({
              id: code,
              code,
              label: `${card(code).name} (${card(code).boon_sphere}) · level ${dcMarksOf(s, code)}`,
              detail: card(code).text,
              effects: [fx("dcGaldorTake", { code, player: p })],
            })),
            { id: "skip", label: "Do not take a copy", effects: [] },
          ],
          "Each player may choose one copy of Galdor's Counsel and add it to their hand. For this game, Ominous Fate's X is plus 1 for each of those copies.",
        ),
      );
      return true;
    }
    case "dcGaldorTake": {
      const p = e.player ?? firstPlayer(s);
      const q = dreamchaserState(s);
      if (!GALDOR.includes(e.code as (typeof GALDOR)[number])) return true;
      if (Object.keys(q.galdor ?? {}).includes(e.code!)) return true;
      q.galdor = { ...(q.galdor ?? {}), [e.code!]: p };
      q.ominous = (q.ominous ?? 0) + 1;
      forOwner(s, p, () => {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      });
      log(
        s,
        `${card(e.code!).name} (${card(e.code!).boon_sphere}) is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand; Ominous Fate's X is plus ${q.ominous} this game.`,
        "good",
      );
      return true;
    }
    case "dcCommandOffer": {
      const p = e.player ?? firstPlayer(s);
      const taken = Object.keys(dreamchaserState(s).commands ?? {});
      const free = COMMAND.filter((code) => !taken.includes(code));
      if (!free.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `The Drowned Ruins · ${several(s) ? `${seatName(s, p)} may choose` : "Choose"} a copy of Command for ${several(s) ? "their" : "your"} hand?`,
          [
            ...free.map((code) => ({
              id: code,
              code,
              label: `${card(code).name} (${card(code).boon_sphere}) · level ${dcMarksOf(s, code)}`,
              detail: card(code).text,
              effects: [fx("dcCommandTake", { code, player: p })],
            })),
            { id: "skip", label: "Do not take a copy", effects: [] },
          ],
          "Each player may choose one copy of Command and add it to their hand. For this game, Ominous Fate's X is plus 1 for each of those copies.",
        ),
      );
      return true;
    }
    case "dcCommandTake": {
      const p = e.player ?? firstPlayer(s);
      const q = dreamchaserState(s);
      if (!COMMAND.includes(e.code as (typeof COMMAND)[number])) return true;
      if (Object.keys(q.commands ?? {}).includes(e.code!)) return true;
      q.commands = { ...(q.commands ?? {}), [e.code!]: p };
      q.ominous = (q.ominous ?? 0) + 1;
      forOwner(s, p, () => {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      });
      log(
        s,
        `Command (${card(e.code!).boon_sphere}) is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand; Ominous Fate's X is plus ${q.ominous} this game.`,
        "good",
      );
      return true;
    }
    case "dcCirdanOffer": {
      // "One player may choose one copy of Círdan's Blessing and add it to
      // their hand."
      const players = playerOrder(s);
      if (players.length === 1) {
        prepend(s, fx("dcCirdanCopy", { player: players[0] }));
        return true;
      }
      choose(
        s,
        `${card(DREAMCHASER_CAMPAIGN_CARDS[s.scenarioId]!).name} · Which player may choose a copy of Círdan's Blessing for their hand?`,
        [
          ...players.map((p) => ({
            id: `seat-${p}`,
            label: seatName(s, p),
            code: CIRDAN[0],
            effects: [fx("dcCirdanCopy", { player: p })],
          })),
          { id: "skip", label: "No one takes a copy", effects: [] },
        ],
      );
      return true;
    }
    case "dcCirdanCopy": {
      const p = e.player ?? firstPlayer(s);
      if (Object.keys(dreamchaserState(s).cirdan ?? {}).length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${card(DREAMCHASER_CAMPAIGN_CARDS[s.scenarioId]!).name} · ${several(s) ? `${seatName(s, p)} chooses` : "Choose"} a copy of Círdan's Blessing for ${several(s) ? "their" : "your"} hand?`,
          [
            // A Storm on Cobas Haven: "a copy … not in the Campaign Pool".
            ...CIRDAN.filter((code) => !s.campaign!.boons.includes(code)).map(
              (code) => ({
                id: code,
                code,
                label: `${card(code).name} (${card(code).boon_sphere}) · level ${dcMarksOf(s, code)}`,
                detail: card(code).text,
                effects: [fx("dcCirdanTake", { code, player: p })],
              }),
            ),
            { id: "skip", label: "Do not take a copy", effects: [] },
          ],
          "One player may choose one copy of Círdan's Blessing and add it to their hand.",
        ),
      );
      return true;
    }
    case "dcCirdanTake": {
      const p = e.player ?? firstPlayer(s);
      const q = dreamchaserState(s);
      if (!CIRDAN.includes(e.code as (typeof CIRDAN)[number])) return true;
      if (Object.keys(q.cirdan ?? {}).length) return true;
      q.cirdan = { [e.code!]: p };
      forOwner(s, p, () => {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      });
      log(
        s,
        `Círdan's Blessing (${card(e.code!).boon_sphere}) is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand.`,
        "good",
      );
      return true;
    }
    case "dcTogetherOffer": {
      const players = playerOrder(s);
      if (players.length === 1) {
        prepend(s, fx("dcTogetherTake", { player: players[0] }));
        return true;
      }
      choose(
        s,
        "The Thing in the Depths · Which player adds Come Together to their hand?",
        players.map((p) => ({
          id: `seat-${p}`,
          label: seatName(s, p),
          code: DC.together,
          effects: [fx("dcTogetherTake", { player: p })],
        })),
      );
      return true;
    }
    case "dcTogetherTake": {
      const p = e.player ?? firstPlayer(s);
      const q = dreamchaserState(s);
      if (q.together !== undefined) return true;
      q.together = p;
      q.ominous = (q.ominous ?? 0) + 1;
      forOwner(s, p, () => {
        const u = make(s, DC.together);
        u.owner = p;
        s.hand.push(u);
      });
      log(
        s,
        `Come Together is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand; Ominous Fate's X is plus ${q.ominous} this game.`,
        "good",
      );
      return true;
    }
    case "dcCalphonGone": {
      // "Remove Calphon and each attachment on him from the game, ignoring
      // his 'leaves play' ability."
      const q = dreamchaserState(s);
      q.calphon = false;
      for (const p of seatIndices(s))
        forOwner(s, p, () => {
          for (const u of s.allies.filter((x) => dcIs(x, FATE.calphon)))
            log(
              s,
              `${name(u)}${u.attachments.length ? ` and ${u.attachments.map((a) => card(a.code).name).join(" and ")}` : ""} ${u.attachments.length ? "are" : "is"} removed from the game.`,
              "chapter",
            );
          s.allies = s.allies.filter((x) => !dcIs(x, FATE.calphon));
        });
      return true;
    }
    case "dcThreatDown":
      forOwner(s, e.player ?? activeSeat(s), () =>
        reduceThreat(s, e.value ?? 0, undefined, "quest-card"),
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
  if (s.scenarioId === "raid-on-the-grey-havens") {
    const chosen = Object.keys(s.dreamchaser?.galdor ?? {});
    out.push(
      `Galdor's Counsel chosen this game: ${chosen.length ? chosen.map((code) => `${card(code).boon_sphere} (level ${dcMarksOf(s, code)})`).join(", ") : "none"}. Graxar is shuffled into the encounter deck; with Graxar in the victory display the resolution adds Parrying Cutlass or Throwing Axe to the Campaign Pool.`,
    );
    if (s.dreamchaser?.calphon)
      out.push(
        "Calphon is controlled by the first player and carries Spyglass and Black Key; if he leaves play the players lose, until stage 2B removes him from the game.",
      );
  }
  if (s.scenarioId === "flight-of-the-stormcaller")
    out.push(
      'The Stormcaller is on its "Campaign Mode only" side with Black Key (burden) attached: at its stage no more than 9 progress can be placed on your quest each round. Calaerion serves the player with the Dream-chaser.',
    );
  if (s.scenarioId === "the-thing-in-the-depths")
    out.push(
      'The Thing in the Depths is on its "Campaign Mode only" side (each destroyed Creature deals it 2 damage). Captain Sahír carries Black Key (burden) as an enemy; when he flips, it becomes the boon, Sea Serpent (Menacing) enters the staging area and a player adds Come Together to their hand.',
    );
  if (s.scenarioId === "the-city-of-corsairs")
    out.push(
      'The Stormcaller is on its "Campaign Mode only" side with Black Key (burden): it takes at most 10 damage and the quest at most 10 progress each round. When stage 2B is revealed, the boons and non-Ship burdens move into the second encounter deck; Captain Sahír enters play with Black Key (burden) and The Black Sword, whose resources a hero may take in the refresh phase (once per round). Winning this chapter wins the campaign.',
    );
  if (s.scenarioId === "a-storm-on-cobas-haven") {
    const aside = s.dreamchaser?.sendForHelp?.length ?? 0;
    out.push(
      `Raider Flagship carries Black Key (burden); Calaerion serves the player with the Dream-chaser and Gavin is in play. Set-aside copies of Send for Help: ${aside} (Gavin's Planning Action shuffles himself and a random one into the encounter deck).${s.dreamchaser?.extraPhases?.length ? ` Additional phases to come: ${s.dreamchaser.extraPhases.join(", ")}.` : ""}`,
    );
  }
  if (s.scenarioId === "the-drowned-ruins") {
    const chosen = Object.keys(s.dreamchaser?.commands ?? {});
    const blessing = Object.keys(s.dreamchaser?.cirdan ?? {});
    out.push(
      `Captain Sahír carries Black Key (boon). Command copies chosen this game: ${chosen.length ? chosen.map((code) => `${card(code).boon_sphere} (level ${dcMarksOf(s, code)})`).join(", ") : "none"}; Círdan's Blessing: ${blessing.length ? blessing.map((code) => `${card(code).boon_sphere} (level ${dcMarksOf(s, code)})`).join(", ") : "none"}. They join the Campaign Pool with the resolution.`,
    );
  }
  if (s.scenarioId === "temple-of-the-deceived") {
    const left = Object.keys(s.dreamchaser?.secrets ?? {}).length;
    out.push(
      `The Temple Guardian is on its "Campaign Mode only" side (Archery X; X is its defense too). Captain Sahír carries Black Key (boon). Secrets still facedown under the Temple of the Deceived locations: ${left} of 3 (Starla and both Recurring Nightmares). Travel Action: flip over a secret at your location; a Recurring Nightmare engages you, Starla joins you ready.`,
    );
  }
  if (REVENANT_CHAPTERS.includes(s.scenarioId)) {
    const n = s.dreamchaser?.resources ?? 0;
    out.push(
      `Resources on the campaign card: ${n}. Revenant is shuffled into the encounter deck; it gets +${2 * n} attack and +${2 * n} defense, takes at most 2 damage at a time, and returns to the encounter deck when destroyed, placing 1 resource here.`,
    );
  }
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
            Object.values(q.reduced).every(integer))) &&
        (q.calphon === undefined || typeof q.calphon === "boolean") &&
        (q.galdor === undefined ||
          (!!q.galdor &&
            typeof q.galdor === "object" &&
            !Array.isArray(q.galdor) &&
            Object.entries(q.galdor).every(
              ([code, seat]) =>
                GALDOR.includes(code as (typeof GALDOR)[number]) &&
                integer(seat) &&
                seat < seats,
            ))) &&
        (q.attacked === undefined ||
          (!!q.attacked &&
            integer(q.attacked.round) &&
            codes(q.attacked.ids))) &&
        (q.spent === undefined || codes(q.spent)) &&
        (q.boosts === undefined ||
          (Array.isArray(q.boosts) &&
            q.boosts.every(
              (b) =>
                !!b &&
                typeof b.target === "string" &&
                (b.until === "phase" || b.until === "round") &&
                typeof b.phase === "string" &&
                integer(b.round) &&
                [b.will, b.attack, b.defense].every(
                  (n) => n === undefined || Number.isSafeInteger(n),
                ),
            ))) &&
        (q.calaerionRound === undefined || integer(q.calaerionRound)) &&
        (q.keyed === undefined || codes(q.keyed)) &&
        (q.together === undefined ||
          (integer(q.together) && q.together < seats)) &&
        (q.grants === undefined ||
          (Array.isArray(q.grants) &&
            q.grants.every(
              (g) =>
                !!g &&
                typeof g.target === "string" &&
                typeof g.trait === "string" &&
                !!g.trait &&
                integer(g.round),
            ))) &&
        (q.secrets === undefined ||
          (!!q.secrets &&
            typeof q.secrets === "object" &&
            !Array.isArray(q.secrets) &&
            Object.keys(q.secrets).length <= 3 &&
            Object.entries(q.secrets).every(
              ([id, code]) =>
                /^c\d+$/.test(id) &&
                (code === DC.starla || code === DC.nightmare),
            ) &&
            Object.values(q.secrets).filter((code) => code === DC.starla)
              .length <= 1)) &&
        (q.commands === undefined ||
          (!!q.commands &&
            typeof q.commands === "object" &&
            !Array.isArray(q.commands) &&
            Object.entries(q.commands).every(
              ([code, seat]) =>
                COMMAND.includes(code as (typeof COMMAND)[number]) &&
                integer(seat) &&
                seat < seats,
            ))) &&
        (q.cirdan === undefined ||
          (!!q.cirdan &&
            typeof q.cirdan === "object" &&
            !Array.isArray(q.cirdan) &&
            Object.keys(q.cirdan).length <= 1 &&
            Object.entries(q.cirdan).every(
              ([code, seat]) =>
                CIRDAN.includes(code as (typeof CIRDAN)[number]) &&
                integer(seat) &&
                seat < seats,
            ))) &&
        (q.summoned === undefined || codes(q.summoned)) &&
        (q.blessedQuest === undefined || integer(q.blessedQuest)) &&
        (q.strikes === undefined ||
          (!!q.strikes &&
            typeof q.strikes === "object" &&
            !Array.isArray(q.strikes) &&
            Object.values(q.strikes).every(integer))) &&
        (q.sendForHelp === undefined ||
          (codes(q.sendForHelp) &&
            q.sendForHelp.every((code) =>
              SEND_FOR_HELP.includes(code as (typeof SEND_FOR_HELP)[number]),
            ) &&
            new Set(q.sendForHelp).size === q.sendForHelp.length)) &&
        (q.borrowed === undefined || codes(q.borrowed)) &&
        (q.extraPhases === undefined ||
          (codes(q.extraPhases) &&
            q.extraPhases.every((x) =>
              ["resource", "planning", "combat", "refresh"].includes(x),
            ))) &&
        (q.extraPhase === undefined ||
          (!!q.extraPhase &&
            typeof q.extraPhase.phase === "string" &&
            !!q.extraPhase.resume &&
            typeof q.extraPhase.resume.kind === "string")) &&
        (q.armed === undefined || codes(q.armed)) &&
        (q.swordRound === undefined || integer(q.swordRound)) &&
        (q.swordRefresh === undefined || integer(q.swordRefresh)) &&
        (q.questProgress === undefined ||
          (!!q.questProgress &&
            integer(q.questProgress.round) &&
            integer(q.questProgress.placed))) &&
        (q.secretLooks === undefined ||
          (!!q.secretLooks &&
            typeof q.secretLooks === "object" &&
            !Array.isArray(q.secretLooks) &&
            Object.entries(q.secretLooks).every(
              ([id, looked]) =>
                !!q.secrets?.[id] &&
                Array.isArray(looked) &&
                looked.every((p) => integer(p) && p < seats) &&
                new Set(looked).size === looked.length,
            )))))
  );
}
export { backFace, dcBase, dcFace };
