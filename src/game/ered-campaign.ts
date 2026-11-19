// The Ered Mithrin campaign (its Campaign Expansion, MEC115): the Campaign
// Log with its treasures, notes and encounter cards, the Campaign Pool and
// each scenario's campaign card.
import type {
  CampaignState,
  Effect,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  RuleError,
  shuffle,
} from "./core";
import {
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { score } from "./actions";
import { expansionPlayTargets } from "./expansion-passives";
import {
  WILDS_EVIL_CREATURES,
  WILDS_RHOVANION,
} from "./wilds-rhovanion-support";
/** The campaign card's title. */
const scenarioName = (s: GameState) =>
  ERED_CAMPAIGN_CARDS[s.scenarioId]
    ? card(ERED_CAMPAIGN_CARDS[s.scenarioId]!).name
    : "Ered Mithrin";

/** The campaign's cards (RingsDB codes; the campaign cards by OCTGN id). */
export const ERED = {
  anduinCard: "octgn:12da9483-0fce-43c6-ae47-4cc2aea9cde9",
  mirkwoodCard: "octgn:28491ce2-ffc5-4f26-ab6d-88b68d59ea63",
  kingsCard: "octgn:3d3d4db9-873a-48a6-8a2d-e50abc5533f5",
  /** Turayn (unique boon ally, Journey Up the Anduin). */
  turayn: "12166",
  /** Melanwar (unique boon ally, Lost in Mirkwood). */
  melanwar: "12169",
  /** Isolde (unique boon ally, The King's Quest). */
  isolde: "12171",
  /** The King's Quest's burdens: The Threat to Wilderland (objective), Dagnir's Spawn (enemy) and Abandoned Ruin (location). */
  threat: "12172",
  spawn: "12173",
  ruin: "12174",
  /** A Growing Threat (burden treachery, Journey Up the Anduin). */
  growing: "12167",
  /** The nine treasures. */
  anvil: "12196",
  axe: "12197",
  dagger: "12198",
  crown: "12199",
  lute: "12200",
  shield: "12201",
  helm: "12202",
  jewels: "12203",
  bow: "12204",
} as const;
/** Anvil of Gundabad, Axe of the Edain, Durin's Dagger, Dwarf-Lord's Crown, Glittering Lute, Gondolin Shield, Helm of Heroes, Jewels of Wilderland and Masterwork Bow. */
export const ERED_TREASURES: readonly string[] = [
  ERED.anvil,
  ERED.axe,
  ERED.dagger,
  ERED.crown,
  ERED.lute,
  ERED.shield,
  ERED.helm,
  ERED.jewels,
  ERED.bow,
];
/** The campaign's nine chapters in order. */
export const ERED_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
  "the-withered-heath",
  "roam-across-rhovanion",
  "fire-in-the-night",
  "the-ghost-of-framsburg",
  "mount-gundabad",
  "the-fate-of-wilderland",
];
/** The chapters whose campaign cards are scripted so far. */
export const ERED_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "journey-up-the-anduin",
  "lost-in-mirkwood",
  "the-kings-quest",
];
/** The chapters whose campaign card lets each player change heroes without the +1 threat penalty. */
export const ERED_FREE_CHANGES: readonly ScenarioId[] = [
  "the-kings-quest",
  "the-ghost-of-framsburg",
];
/** Each scripted chapter's campaign card. */
export const ERED_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "journey-up-the-anduin": ERED.anduinCard,
  "lost-in-mirkwood": ERED.mirkwoodCard,
  "the-kings-quest": ERED.kingsCard,
};
/** The boons in the Campaign Pool that a player may add to their deck. */
export const ERED_DECK_BOONS: readonly string[] = [
  ERED.turayn,
  ERED.melanwar,
  ERED.isolde,
];
export const ERED_BOONS: readonly string[] = [...ERED_DECK_BOONS];
export const ERED_BURDENS: readonly string[] = [
  ERED.growing,
  ERED.threat,
  ERED.spawn,
  ERED.ruin,
];
/** The burdens shuffled into each encounter deck at setup. */
const ENCOUNTER_BURDENS: readonly string[] = [ERED.growing, ERED.spawn];
/** The Campaign Log's notes and their printed wording. */
export const ERED_NOTES: Record<string, string> = {
  turayn: "Turayn has taken an oath of vigilance",
  melanwar: "Melanwar has given you guidance on traversing Wilderland",
  isolde: "Isolde is on the hunt",
};
/** The encounter sets Lost in Mirkwood's resolution adds to the Campaign Pool. */
const SPIDERS_AND_ORCS = ["Spiders of Mirkwood", "Dol Guldur Orcs"];
/** Each chapter's boon ally: "Any player gains control of …" and the resolution's choice. */
const BOON_ALLY: Partial<Record<ScenarioId, { code: string; note: string }>> = {
  "journey-up-the-anduin": { code: ERED.turayn, note: "turayn" },
  "lost-in-mirkwood": { code: ERED.melanwar, note: "melanwar" },
  "the-kings-quest": { code: ERED.isolde, note: "isolde" },
};
export const isEredCampaign = (c?: CampaignState | null) => c?.kind === "ered";
/** A chapter of the Ered Mithrin campaign is being played. */
export const eredChapter = (s: GameState) =>
  isEredCampaign(s.campaign) &&
  s.playMode === "campaign" &&
  ERED_CAMPAIGN_ORDER.includes(s.scenarioId);
/** A new Ered Mithrin campaign: the heroes are recorded at its start. */
export function newEredCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "ered",
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
    ...(seatHeroes && seatHeroes.length > 1 ? { seatHeroes } : {}),
  };
}
/** The chapter the campaign continues with, or undefined once it is complete. */
export const nextEredChapter = (
  c: Pick<CampaignState, "completed">,
): ScenarioId | undefined => ERED_CAMPAIGN_ORDER[c.completed.length];
export const eredChapterSupported = (id?: ScenarioId) =>
  !!id && ERED_CAMPAIGN_SUPPORTED.includes(id);
/**
 * "Haldan cannot be used as a hero in this campaign" (MEC115), until The
 * King's Quest's campaign card: "Haldan may be included among a player's
 * heroes."
 */
export const eredForbiddenTitle = (id: ScenarioId) =>
  ERED_CAMPAIGN_ORDER.indexOf(id) <
  ERED_CAMPAIGN_ORDER.indexOf("the-kings-quest")
    ? "Haldan"
    : undefined;
/** Has the current chapter been recorded in the Campaign Log? */
export const eredChapterComplete = (s: GameState) =>
  isEredCampaign(s.campaign) &&
  s.campaign!.completed.at(-1)?.scenarioId === s.scenarioId;
/** The campaign card's part number (X on The Threat to Wilderland and Dagnir's Spawn). */
export const eredPart = (id: ScenarioId) => ERED_CAMPAIGN_ORDER.indexOf(id) + 1;

/** The campaign card, treasures and boons during a chapter. */
export interface EredCampaignGame {
  /** Journey Up the Anduin: the resources on the campaign card. */
  tokens?: number;
  /** The treasures taken from the undiscovered treasures this game (attached or claimed). */
  taken?: string[];
  /** The random undiscovered treasures the players are looking at. */
  looking?: string[];
  /** A Growing Threat: the encounter cards it set aside this game. */
  growing?: string[];
  /** Turayn: the characters whose next damage this round is reduced by 1. */
  shields?: { target: string; round: number }[];
  /** Anvil of Gundabad: the Item attachment it is playing with its cost reduced by 1. */
  anvil?: string;
  /** Treasures attached to encounter cards as guarded objectives (claimed when free). */
  guarded?: { guardId: string; code: string }[];
  /** The round the players quested unsuccessfully (Melanwar). */
  failedRound?: number;
  /** Abandoned Ruin's Response was used this game (limit once per game). */
  ruinUsed?: boolean;
  /** The Threat to Wilderland: the encounter cards made immune to player card effects for this quest phase. */
  immune?: { ids: string[]; round: number };
  /** Dagnir's Spawn: the players who took its X damage this reveal. */
  spawn?: { id: string; accepted: number[]; asked: number[] };
}
export const eredState = (s: GameState) => (s.eredCampaign ??= {});
/** Several players share the table (one seat reads "you"). */
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const seatLabel = (s: GameState, p: number) =>
  several(s) ? ` · ${seatName(s, p)}` : "";
const names = (codes: string[]) =>
  codes.map((code) => card(code).name).join(", ");

// ------------------------------------------------------------- the pool

/**
 * "Players cannot add more copies of a card to the pool than they own in one
 * collection" (MEC115): the copies printed in its product.
 */
export const ownedCopies = (code: string) =>
  Math.max(1, Number(card(code).quantity) || 1);
/** Add one copy of an encounter card to the Campaign Pool, if able. */
export function addPoolCopy(c: CampaignState, code: string): boolean {
  const n = c.encounterPool?.[code] ?? 0;
  if (n >= ownedCopies(code)) return false;
  c.encounterPool = { ...(c.encounterPool ?? {}), [code]: n + 1 };
  return true;
}
/** The encounter cards of the Campaign Pool, one code per copy. */
export const poolEncounterCards = (c: CampaignState) => [
  ...c.burdens.filter((code) => ENCOUNTER_BURDENS.includes(code)),
  ...Object.entries(c.encounterPool ?? {}).flatMap(
    ([code, n]) => Array(n).fill(code) as string[],
  ),
];

// ------------------------------------------------------------- setup

/** Before the starting hands: the boons and treasures each player adds to their deck. */
export function eredCampaignDeckSetup(s: GameState) {
  const c = s.campaign;
  if (!isEredCampaign(c) || !eredChapter(s)) return;
  const seats = seatIndices(s);
  for (const [code, seat] of Object.entries(c!.deckBoons ?? {}))
    if (
      seats.includes(seat) &&
      ((ERED_DECK_BOONS.includes(code) && c!.boons.includes(code)) ||
        (ERED_TREASURES.includes(code) && !!c!.treasures?.includes(code)))
    )
      forOwner(s, seat, () => s.deck.push(code));
}
/** The campaign card's Setup and the Campaign Pool, after the scenario's own setup. */
export function eredCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isEredCampaign(c) || !eredChapter(s)) return;
  // Campaign Mode: the Campaign Pool's burdens and the encounter cards
  // written in the Campaign Log join the encounter deck "regardless of
  // encounter set" (MEC115).
  const pool = poolEncounterCards(c!);
  // "Shuffle A Growing Threat into the encounter deck."
  if (s.scenarioId === "journey-up-the-anduin" && !pool.includes(ERED.growing))
    pool.push(ERED.growing);
  // The King's Quest: "Add The Threat to Wilderland to the staging area,
  // shuffle Dagnir's Spawn into the encounter deck, and shuffle Abandoned
  // Ruin into the Caves deck."
  const kings = s.scenarioId === "the-kings-quest";
  if (kings && !pool.includes(ERED.spawn)) pool.push(ERED.spawn);
  if (kings || c!.burdens.includes(ERED.threat)) threatSetup(s);
  if (kings || c!.burdens.includes(ERED.ruin)) ruinSetup(s);
  // "If 'Turayn has taken an oath of vigilance,' search the encounter deck
  // for 3 treacheries and remove them from the game."
  if (kings && c!.notes?.includes("turayn"))
    enqueue(
      s,
      fx("emcRemove", { text: "treachery", value: 3, player: firstPlayer(s) }),
    );
  // "Any player gains control of Turayn/Melanwar."
  const ally = BOON_ALLY[s.scenarioId];
  if (ally) {
    const seats = playerOrder(s);
    if (seats.length > 1)
      enqueue(
        s,
        fx("emcAllySeat", { code: ally.code, player: firstPlayer(s) }),
      );
    else gainAlly(s, ally.code, seats[0] ?? 0);
  }
  // Lost in Mirkwood: "The first player may search the encounter deck for a
  // copy of Twilight Hall and add it to the staging area."
  if (s.scenarioId === "lost-in-mirkwood")
    enqueue(s, fx("emcTwilightSearch", { player: firstPlayer(s) }));
  if (pool.length) {
    s.encounterDeck.push(...pool);
    shuffle(s, s.encounterDeck);
    log(
      s,
      `${names([...new Set(pool)])} ${pool.length === 1 ? "is" : "are"} shuffled into the encounter deck (${pool.length} ${pool.length === 1 ? "card" : "cards"}).`,
    );
  }
}
/**
 * The Threat to Wilderland: "Setup: Add The Threat to Wilderland to the
 * staging area with X resources on it. X is the campaign card's part number."
 */
function threatSetup(s: GameState) {
  const u = make(s, ERED.threat);
  u.resources = eredPart(s.scenarioId);
  s.staging.push(u);
  log(
    s,
    `The Threat to Wilderland is added to the staging area with ${u.resources} resources.`,
    "danger",
  );
}
/** The scenario's Caves deck, if it has one. */
const cavesDeck = (s: GameState): Unit[] | undefined =>
  s.wildsRhovanion?.cavesDeck && s.scenarioId === "the-kings-quest"
    ? s.wildsRhovanion.cavesDeck
    : undefined;
/**
 * Abandoned Ruin: "Setup: Shuffle Abandoned Ruin into the Caves deck, if
 * able. Otherwise, remove it from the game."
 */
function ruinSetup(s: GameState) {
  const deck = cavesDeck(s);
  if (!deck) {
    log(
      s,
      "Abandoned Ruin has no Caves deck to join and is removed from the game.",
    );
    return;
  }
  deck.push(make(s, ERED.ruin));
  shuffle(s, deck);
  log(s, "Abandoned Ruin is shuffled into the Caves deck.");
}
/** "Any player gains control of Turayn" (or Melanwar, or Isolde). */
function gainAlly(s: GameState, code: string, p: number) {
  const u = make(s, code);
  u.owner = p;
  forOwner(s, p, () => s.allies.push(u));
  log(
    s,
    `${several(s) ? `${seatName(s, p)} gains` : "You gain"} control of ${card(code).name}.`,
    "good",
  );
}

// ------------------------------------------------------------- treasures

/** The treasures still undiscovered: neither in the Campaign Log nor taken this game. */
export function undiscoveredTreasures(s: GameState) {
  const inPlay = new Set(
    allCharacters(s).flatMap((u) => u.attachments.map((a) => a.code)),
  );
  return ERED_TREASURES.filter(
    (code) =>
      !s.campaign?.treasures?.includes(code) &&
      !s.eredCampaign?.taken?.includes(code) &&
      !inPlay.has(code),
  );
}
/** The characters a treasure can be attached to ("Attach to a character/hero", Restricted). */
export const treasureHosts = (s: GameState, code: string) =>
  expansionPlayTargets(s, card(code)) ?? allCharacters(s);
/** The treasures the players control: "The players discover each treasure they control." */
export const treasuresInPlay = (s: GameState) => [
  ...new Set(
    allCharacters(s).flatMap((u) =>
      u.attachments
        .filter((a) => ERED_TREASURES.includes(a.code))
        .map((a) => a.code),
    ),
  ),
];
/**
 * "The players look at 3 random undiscovered treasures and choose 1 to attach
 * to an eligible character."
 */
export const eredTreasureOffer = (
  s: GameState,
  source: string,
  guardId?: string,
) =>
  fx("emcTreasureLook", {
    player: firstPlayer(s),
    text: source,
    ...(guardId ? { target: guardId } : {}),
  });
function attachTreasure(s: GameState, host: Unit, code: string) {
  const p = ownerOf(s, host);
  const id = `a${s.nextId++}`;
  host.attachments.push({
    id,
    code,
    exhausted: false,
    ...(s.table ? { owner: p } : {}),
  });
  const q = eredState(s);
  q.taken = [...new Set([...(q.taken ?? []), code])];
  log(
    s,
    `${card(code).name} (a treasure) is attached to ${name(host)}${several(s) ? ` (${seatName(s, p)})` : ""}.`,
    "good",
  );
  return id;
}
/**
 * A treasure attached to an encounter card as a guarded objective. It is kept
 * beside its guard (it gives the guard no bonus or ability) and shown by the
 * quest inspector.
 */
function guardTreasure(s: GameState, guard: Unit, code: string) {
  const q = eredState(s);
  q.taken = [...new Set([...(q.taken ?? []), code])];
  q.guarded = [...(q.guarded ?? []), { guardId: guard.id, code }];
  log(
    s,
    `${card(code).name} (a treasure) is attached to ${name(guard)} as a guarded objective.`,
    "good",
  );
}
/**
 * "When that treasure is free of encounters, the players claim it": once its
 * guard has left play (explored, defeated or discarded), it is claimed.
 */
export function eredCampaignGuardCheck(s: GameState) {
  // Abandoned Ruin: "Response: After Abandoned Ruin becomes the active
  // location, look at 3 random undiscovered treasures and attach 1 of them to
  // Abandoned Ruin as a guarded objective. … Limit once per game for the
  // group." (It only helps, so it is always used.)
  const ruin = s.activeLocation;
  if (
    ruin?.code === ERED.ruin &&
    !ruin.blanked &&
    eredChapter(s) &&
    s.status === "playing" &&
    !s.eredCampaign?.ruinUsed
  ) {
    eredState(s).ruinUsed = true;
    log(s, "Abandoned Ruin becomes the active location.");
    prepend(s, eredTreasureOffer(s, ERED.ruin, ruin.id));
  }
  const q = s.eredCampaign;
  if (!q?.guarded?.length || s.status !== "playing") return;
  const freed = q.guarded.filter((g) => !get(s, g.guardId));
  if (!freed.length) return;
  q.guarded = q.guarded.filter((g) => !freed.includes(g));
  for (const g of freed) {
    log(
      s,
      `${card(g.code).name} is free of encounters: the players claim it.`,
      "good",
    );
    prepend(
      s,
      fx("emcTreasureClaim", { code: g.code, player: firstPlayer(s) }),
    );
  }
}

// ------------------------------------------------------------- the campaign card

/**
 * Journey Up the Anduin's campaign card: "Response: After you explore a
 * non-unique location, put a resource here. Then, if there are X resources
 * here, the players look at 3 random undiscovered treasures and choose 1 to
 * attach to an eligible character. X is 3 more than the number of players in
 * the game." (It only helps, so it is always used.)
 */
export function eredCampaignLocationExplored(s: GameState, u: Unit) {
  // An explored guard frees its treasure at once.
  eredCampaignGuardCheck(s);
  if (!eredChapter(s) || s.scenarioId !== "journey-up-the-anduin") return;
  const c = card(u.code);
  if (c.type_code !== "location" || c.is_unique) return;
  const q = eredState(s);
  q.tokens = (q.tokens ?? 0) + 1;
  const x = anduinTreasureAt(s);
  log(
    s,
    `Journey Up the Anduin: ${c.name} is explored, and a resource is put on the campaign card (${q.tokens}/${x}).`,
  );
  if (q.tokens === x) prepend(s, eredTreasureOffer(s, ERED.anduinCard));
}
/** X on Journey Up the Anduin's campaign card: 3 more than the number of players. */
export const anduinTreasureAt = (s: GameState) =>
  (s.table?.seats.length ?? 1) + 3;

// ------------------------------------------------------------- resolution

/**
 * A Growing Threat: the index of the topmost non-unique, non-objective,
 * non-burden encounter card in the encounter discard pile (its top is the end
 * of the array), or -1.
 */
export function growingThreatTarget(s: GameState): number {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--) {
    const c = card(s.encounterDiscard[i]);
    if (
      !c.is_unique &&
      !/objective/i.test(c.type_code) &&
      c.sphere_code !== "burden"
    )
      return i;
  }
  return -1;
}
/** The Evil Creatures enemies in play (Journey Up the Anduin's Evil Creatures deck). */
const evilCreaturesInPlay = (s: GameState) =>
  [...s.staging, ...seatIndices(s).flatMap((p) => seatView(s, p).engaged)]
    .filter(
      (u) =>
        card(u.code).type_code === "enemy" &&
        WILDS_EVIL_CREATURES.includes(u.code),
    )
    .map((u) => u.code);
/** The campaign card's Resolution after the players win, before its choices. */
export function resolveEredCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  // A hero in its controller's discard pile is a fallen hero.
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  const q = s.eredCampaign;
  // "The players discover each treasure they control."
  const found = treasuresInPlay(s).filter(
    (code) => !c.treasures?.includes(code),
  );
  if (found.length) {
    c.treasures = [...(c.treasures ?? []), ...found];
    log(
      s,
      `${names(found)} ${found.length === 1 ? "is" : "are"} discovered and recorded in the Campaign Log.`,
      "good",
    );
  }
  // A Growing Threat: "During quest resolution, add a copy of that card to
  // the campaign pool, if able."
  const grown: string[] = [];
  for (const code of q?.growing ?? [])
    if (addPoolCopy(c, code)) grown.push(code);
  if (grown.length)
    log(
      s,
      `A Growing Threat: a copy of ${names(grown)} joins the Campaign Pool.`,
      "danger",
    );
  if (s.scenarioId === "journey-up-the-anduin") {
    // "Add A Growing Threat and each Evil Creatures enemy in play to the
    // campaign pool."
    if (!c.burdens.includes(ERED.growing)) c.burdens.push(ERED.growing);
    const evil = evilCreaturesInPlay(s).filter((code) => addPoolCopy(c, code));
    log(
      s,
      `Journey Up the Anduin · Resolution: A Growing Threat${evil.length ? ` and ${names(evil)}` : ""} ${evil.length ? "join" : "joins"} the Campaign Pool.`,
      "danger",
    );
  }
  if (s.scenarioId === "lost-in-mirkwood") {
    // "Discard cards from the encounter deck until X cards from either the
    // Spiders of Mirkwood or Dol Guldur Orcs encounter set have been
    // discarded and add those cards to the campaign pool. X is equal to the
    // number of players in the game."
    const x = s.table?.seats.length ?? 1;
    const hits: string[] = [];
    let reshuffled = false;
    for (let n = 0; hits.length < x && n < 500; n++) {
      if (!s.encounterDeck.length) {
        // An empty encounter deck is replenished from the discard pile once.
        if (reshuffled || !s.encounterDiscard.length) break;
        s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        reshuffled = true;
      }
      const code = s.encounterDeck.shift()!;
      s.encounterDiscard.push(code);
      if (SPIDERS_AND_ORCS.includes(card(code).encounter_set ?? ""))
        hits.push(code);
    }
    const added = hits.filter((code) => addPoolCopy(c, code));
    log(
      s,
      `Lost in Mirkwood · Resolution: ${hits.length ? names(hits) : "no card"} ${hits.length === 1 ? "is" : "are"} discarded from the Spiders of Mirkwood and Dol Guldur Orcs sets${added.length ? `; ${names(added)} ${added.length === 1 ? "joins" : "join"} the Campaign Pool` : ""}.`,
      "danger",
    );
  }
  if (s.scenarioId === "the-kings-quest") {
    // "Add Abandoned Ruin to the campaign pool." (The first player then
    // chooses The Threat to Wilderland or Dagnir's Spawn.)
    if (!c.burdens.includes(ERED.ruin)) c.burdens.push(ERED.ruin);
    log(
      s,
      "The King's Quest · Resolution: Abandoned Ruin joins the Campaign Pool.",
      "danger",
    );
  }
  // "If the heroes choose to accept his aid / invite him / fight alongside
  // her … add them to the campaign pool … Otherwise, mark in the campaign
  // log that …"
  if (BOON_ALLY[s.scenarioId]) c.resolution = s.scenarioId;
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  log(s, "The Campaign Log has been updated.", "good");
}
/** The choices a campaign card's resolution asks of the players. */
export function eredResolutionQuestions(s: GameState): {
  id: string;
  label: string;
  options: { id: string; code?: string; label: string }[];
}[] {
  const c = s.campaign;
  if (
    !isEredCampaign(c) ||
    s.status !== "won" ||
    c!.resolution !== s.scenarioId
  )
    return [];
  const ally = BOON_ALLY[s.scenarioId];
  if (!ally) return [];
  return [
    {
      id: ally.note,
      label: ALLY_QUESTION[ally.note],
      options: [
        {
          id: "aid",
          code: ally.code,
          label: `Add ${card(ally.code).name} to the Campaign Pool`,
        },
        { id: "note", label: `“${ERED_NOTES[ally.note]}”` },
      ],
    },
    // The King's Quest: "The first player chooses either Threat to
    // Wilderland or Dagnir's Spawn and add it to the campaign pool."
    ...(s.scenarioId === "the-kings-quest"
      ? [
          {
            id: "burden",
            label:
              "The first player chooses either The Threat to Wilderland or Dagnir's Spawn and adds it to the Campaign Pool.",
            options: [ERED.threat, ERED.spawn].map((code) => ({
              id: code,
              code,
              label: card(code).name,
            })),
          },
        ]
      : []),
  ];
}
const ALLY_QUESTION: Record<string, string> = {
  turayn:
    "The heroes' selfless valor has inspired Turayn. Do the heroes accept his aid?",
  melanwar:
    "Melanwar pledged his friendship to the heroes. Do the heroes invite him to join their quest?",
  isolde:
    "Isolde has resolved to continue the hunt. Do the heroes choose to fight alongside her?",
};
/** Record the players' resolution choices in the Campaign Log. */
export function applyEredResolution(
  input: GameState,
  answers: Record<string, string>,
): GameState {
  const s = structuredClone(input);
  const c = s.campaign!;
  const questions = eredResolutionQuestions(s);
  if (!questions.length)
    throw new RuleError("This campaign card has no resolution waiting.");
  for (const q of questions)
    if (!q.options.some((o) => o.id === answers[q.id]))
      throw new RuleError(`Answer: ${q.label}`);
  const ally = BOON_ALLY[s.scenarioId]!;
  const title = card(ERED_CAMPAIGN_CARDS[s.scenarioId]!).name;
  if (answers[ally.note] === "aid") {
    if (!c.boons.includes(ally.code)) c.boons.push(ally.code);
    log(
      s,
      `${title} · Resolution: ${card(ally.code).name} joins the Campaign Pool (any player may add ${ally.code === ERED.isolde ? "her" : "him"} to their deck).`,
      "good",
    );
  } else {
    c.notes = [...new Set([...(c.notes ?? []), ally.note])];
    log(
      s,
      `${title} · Resolution: the Campaign Log notes that “${ERED_NOTES[ally.note]}”.`,
      "good",
    );
  }
  if (s.scenarioId === "the-kings-quest") {
    if (!c.burdens.includes(answers.burden)) c.burdens.push(answers.burden);
    log(
      s,
      `${title} · Resolution: ${card(answers.burden).name} joins the Campaign Pool.`,
      "danger",
    );
  }
  c.resolution = null;
  return s;
}

// ------------------------------------------------------------- status

/** The campaign's live state, for the quest inspector. */
export function eredCampaignStatus(s: GameState): string[] {
  const c = s.campaign;
  if (!isEredCampaign(c) || !eredChapter(s)) return [];
  const q = s.eredCampaign;
  const out: string[] = [];
  if (s.scenarioId === "journey-up-the-anduin") {
    const x = anduinTreasureAt(s);
    out.push(
      (q?.tokens ?? 0) >= x
        ? `Journey Up the Anduin has ${q!.tokens} resources: its treasure was earned at ${x}.`
        : `Journey Up the Anduin has ${q?.tokens ?? 0} of ${x} resources: each explored non-unique location adds 1, and at ${x} the players look at 3 random undiscovered treasures and attach 1 to an eligible character.`,
    );
  }
  for (const g of q?.guarded ?? []) {
    const guard = get(s, g.guardId);
    if (guard)
      out.push(
        `${card(g.code).name} is guarded by ${name(guard)}: when ${name(guard)} leaves play, the players claim it and attach it to a character.`,
      );
  }
  if (q?.immune && q.immune.round === s.round)
    out.push(
      "The Threat to Wilderland: encounter cards are immune to player card effects until the end of the quest phase.",
    );
  const unrecorded = treasuresInPlay(s).filter(
    (code) => !c!.treasures?.includes(code),
  );
  if (unrecorded.length)
    out.push(
      `${names(unrecorded)}: discovered if the players still control ${unrecorded.length === 1 ? "it" : "them"} when this chapter is won.`,
    );
  if (q?.growing?.length)
    out.push(
      `A Growing Threat set aside ${names(q.growing)}: a copy of each joins the Campaign Pool when this chapter is won (if a copy is left in the collection).`,
    );
  for (const shield of q?.shields ?? []) {
    const u = get(s, shield.target);
    if (u && shield.round === s.round)
      out.push(
        `Turayn: the next time ${name(u)} would be dealt damage this round, 1 of that damage is canceled.`,
      );
  }
  if (c!.treasures?.length)
    out.push(`Treasures in the Campaign Log: ${names(c!.treasures)}.`);
  for (const note of c!.notes ?? [])
    out.push(`The Campaign Log notes that “${ERED_NOTES[note] ?? note}”.`);
  const pool = poolEncounterCards(c!);
  if (pool.length && s.scenarioId !== "journey-up-the-anduin")
    out.push(
      `The Campaign Pool's encounter cards were shuffled into the encounter deck: ${Object.entries(
        pool.reduce<Record<string, number>>(
          (m, code) => ({ ...m, [code]: (m[code] ?? 0) + 1 }),
          {},
        ),
      )
        .map(([code, n]) => `${card(code).name}${n > 1 ? ` ×${n}` : ""}`)
        .join(", ")}.`,
    );
  return out;
}

// ------------------------------------------------------------- effects

/** The campaign's framework effects (its card scripts are in ered-campaign-cards.ts). */
export function eredCampaignFrameworkEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? firstPlayer(s);
  const q = eredState(s);
  switch (e.kind) {
    case "emcAllySeat": {
      const code = e.code!;
      choose(
        s,
        `${scenarioName(s)} · Any player gains control of ${card(code).name}`,
        playerOrder(s).map((seat) => ({
          id: `seat-${seat}`,
          code,
          label: seatName(s, seat),
          effects: [fx("emcAllyGain", { code, player: seat })],
        })),
        card(ERED_CAMPAIGN_CARDS[s.scenarioId]!).text,
      );
      return true;
    }
    case "emcAllyGain":
      gainAlly(s, e.code!, p);
      return true;
    case "emcTreasureLook": {
      const pile = undiscoveredTreasures(s);
      if (!pile.length) {
        q.looking = [];
        log(s, "No undiscovered treasure is left.");
        return true;
      }
      if (!q.looking?.length) {
        const deck = shuffle(s, [...pile]);
        q.looking = deck.slice(0, 3);
      }
      const source = e.text && card(e.text) ? card(e.text).name : "Treasure";
      const guard = get(s, e.target);
      choose(
        s,
        `${source} · The players look at ${q.looking.length} random undiscovered treasure${q.looking.length === 1 ? "" : "s"} and choose 1${guard ? ` to guard on ${name(guard)}` : ""}${seatLabel(s, p)}`,
        q.looking.map((code): Option => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            guard
              ? fx("emcTreasureGuard", { code, target: guard.id, player: p })
              : fx("emcTreasureHost", { code, player: p }),
          ],
        })),
        guard
          ? `It is attached to ${name(guard)} as a guarded objective; the players claim it when ${name(guard)} leaves play. The others return to the undiscovered treasures.`
          : "The others return to the undiscovered treasures.",
      );
      return true;
    }
    case "emcTreasureGuard": {
      q.looking = [];
      const guard = get(s, e.target);
      if (guard && e.code) guardTreasure(s, guard, e.code);
      return true;
    }
    case "emcTreasureClaim": {
      const code = e.code!;
      const hosts = treasureHosts(s, code);
      if (!hosts.length) {
        log(s, `${card(code).name} has no eligible character to attach to.`);
        return true;
      }
      choose(
        s,
        `${card(code).name} · The players claim the treasure and attach it to a character${seatLabel(s, p)}`,
        hosts.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${several(s) ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [
            fx("emcTreasureAttach", {
              code,
              target: h.id,
              player: p,
              flag: true,
            }),
          ],
        })),
        card(code).text,
      );
      return true;
    }
    case "emcRemove": {
      // "Search the encounter deck for N [cards] and remove them from the game."
      const left = e.value ?? 0;
      const kind = e.text ?? "treachery";
      const match = (code: string) => {
        const c = card(code);
        return kind === "treachery"
          ? c.type_code === "treachery"
          : c.type_code === kind && !c.is_unique;
      };
      const found = [...new Set(s.encounterDeck.filter(match))];
      if (left <= 0 || !found.length) {
        shuffle(s, s.encounterDeck);
        log(s, "The encounter deck is shuffled after the search.");
        return true;
      }
      choose(
        s,
        `${scenarioName(s)} · Remove a ${kind === "treachery" ? "treachery" : `non-unique ${kind}`} from the encounter deck (${left} left)${seatLabel(s, p)}`,
        found.map((code) => ({
          id: code,
          code,
          label: `${card(code).name} (${s.encounterDeck.filter((x) => x === code).length} in the deck)`,
          effects: [
            fx("emcRemoveCard", { code, text: kind, value: left, player: p }),
          ],
        })),
      );
      return true;
    }
    case "emcRemoveCard": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        s.removed.push(e.code!);
        log(s, `${card(e.code!).name} is removed from the game.`, "good");
      }
      prepend(
        s,
        fx("emcRemove", { text: e.text, value: (e.value ?? 1) - 1, player: p }),
      );
      return true;
    }
    case "emcTwilightSearch": {
      const hall = WILDS_RHOVANION.twilight;
      choose(
        s,
        `Lost in Mirkwood · Search the encounter deck for a copy of Twilight Hall?${seatLabel(s, p)}`,
        [
          {
            id: "search",
            code: hall,
            label: "Search for Twilight Hall",
            effects: [fx("emcTwilightAdd", { player: p })],
          },
          { id: "decline", label: "Do not search", effects: [] },
        ],
        card(ERED.mirkwoodCard).text,
      );
      return true;
    }
    case "emcTwilightAdd": {
      const hall = WILDS_RHOVANION.twilight;
      const found = s.encounterDeck.includes(hall);
      if (found) s.encounterDeck.splice(s.encounterDeck.indexOf(hall), 1);
      // A searched deck is shuffled.
      shuffle(s, s.encounterDeck);
      if (!found) {
        log(
          s,
          "Lost in Mirkwood: no Twilight Hall is left in the encounter deck.",
        );
        return true;
      }
      const u = make(s, hall);
      s.staging.push(u);
      log(s, "Lost in Mirkwood: Twilight Hall is added to the staging area.");
      prepend(s, eredTreasureOffer(s, ERED.mirkwoodCard, u.id));
      return true;
    }
    case "emcTreasureHost": {
      q.looking = [];
      const code = e.code!;
      const hosts = treasureHosts(s, code);
      if (!hosts.length) {
        log(s, `${card(code).name} has no eligible character to attach to.`);
        return true;
      }
      choose(
        s,
        `${card(code).name} · Attach to an eligible character${seatLabel(s, p)}`,
        hosts.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${several(s) ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [fx("emcTreasureAttach", { code, target: h.id, player: p })],
        })),
        card(code).text,
      );
      return true;
    }
    case "emcTreasureAttach": {
      const host = get(s, e.target);
      if (!host || !e.code) return true;
      const id = attachTreasure(s, host, e.code);
      // Anvil of Gundabad: "After you claim or play Anvil of Gundabad …"
      if (e.flag && e.code === ERED.anvil)
        prepend(
          s,
          fx("emcAnvilSearch", { source: id, player: ownerOf(s, host) }),
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- saves

/** The Ered Mithrin Campaign Log in a saved game. */
export function validateEredCampaign(
  s: GameState,
  seatCount = s.table?.seats.length ?? 1,
): boolean {
  const c = s.campaign;
  if (!c || c.kind !== "ered") return false;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  const integer = (v: unknown): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const hero = (code: string) => {
    try {
      return card(code).type_code === "hero";
    } catch {
      return false;
    }
  };
  const known = (code: string) => {
    try {
      return !!card(code);
    } catch {
      return false;
    }
  };
  return (
    ERED_CAMPAIGN_ORDER.includes(s.scenarioId) &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every((x) => ERED_BOONS.includes(x)) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every((x) => ERED_BURDENS.includes(x)) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    !Object.keys(c.permanent).length &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (c.resolution === s.scenarioId &&
        s.status === "won" &&
        c.completed.at(-1)?.scenarioId === s.scenarioId &&
        !!BOON_ALLY[s.scenarioId])) &&
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === seatCount &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    (c.treasures === undefined ||
      (codes(c.treasures) &&
        c.treasures.every((x) => ERED_TREASURES.includes(x)) &&
        new Set(c.treasures).size === c.treasures.length)) &&
    (c.notes === undefined ||
      (codes(c.notes) &&
        c.notes.every((x) => x in ERED_NOTES) &&
        new Set(c.notes).size === c.notes.length)) &&
    (c.encounterPool === undefined ||
      (!!c.encounterPool &&
        typeof c.encounterPool === "object" &&
        !Array.isArray(c.encounterPool) &&
        Object.entries(c.encounterPool).every(
          ([code, n]) =>
            known(code) &&
            card(code).sphere_code !== "burden" &&
            integer(n) &&
            n >= 1 &&
            n <= ownedCopies(code),
        ))) &&
    (c.deckBoons === undefined ||
      (!!c.deckBoons &&
        typeof c.deckBoons === "object" &&
        !Array.isArray(c.deckBoons) &&
        Object.entries(c.deckBoons).every(
          ([code, seat]) =>
            ((ERED_DECK_BOONS.includes(code) && c.boons.includes(code)) ||
              (ERED_TREASURES.includes(code) &&
                !!c.treasures?.includes(code))) &&
            integer(seat) &&
            seat < seatCount,
        ))) &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (r, i) =>
        ERED_CAMPAIGN_ORDER[i] === r.scenarioId &&
        // Victory points can take a score below 0.
        Number.isSafeInteger(r.score) &&
        integer(r.rounds),
    ) &&
    (c.completed.at(-1)?.scenarioId === s.scenarioId ||
      (nextEredChapter(c) === s.scenarioId && s.status !== "won"))
  );
}
/**
 * The chapter's state in a saved game (a seat's own validation sees the
 * shared state outside campaign mode).
 */
export function validEredState(s: GameState): boolean {
  const q = s.eredCampaign;
  if (q === undefined) return true;
  const integer = (v: unknown): v is number =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  return (
    !!q &&
    typeof q === "object" &&
    (s.playMode !== "campaign" || eredChapter(s)) &&
    (q.tokens === undefined || integer(q.tokens)) &&
    (q.taken === undefined ||
      (codes(q.taken) &&
        q.taken.every((x) => ERED_TREASURES.includes(x)) &&
        new Set(q.taken).size === q.taken.length)) &&
    (q.looking === undefined ||
      (codes(q.looking) &&
        q.looking.length <= 3 &&
        q.looking.every((x) => ERED_TREASURES.includes(x)))) &&
    (q.growing === undefined || codes(q.growing)) &&
    (q.anvil === undefined || typeof q.anvil === "string") &&
    (q.failedRound === undefined || integer(q.failedRound)) &&
    (q.ruinUsed === undefined || typeof q.ruinUsed === "boolean") &&
    (q.immune === undefined ||
      (!!q.immune && codes(q.immune.ids) && integer(q.immune.round))) &&
    (q.spawn === undefined ||
      (!!q.spawn &&
        typeof q.spawn.id === "string" &&
        Array.isArray(q.spawn.accepted) &&
        q.spawn.accepted.every(integer) &&
        Array.isArray(q.spawn.asked) &&
        q.spawn.asked.every(integer))) &&
    (q.guarded === undefined ||
      (Array.isArray(q.guarded) &&
        q.guarded.every(
          (g) =>
            !!g &&
            typeof g.guardId === "string" &&
            ERED_TREASURES.includes(g.code),
        ))) &&
    (q.shields === undefined ||
      (Array.isArray(q.shields) &&
        q.shields.every(
          (x) => !!x && typeof x.target === "string" && integer(x.round),
        )))
  );
}
