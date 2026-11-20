/**
 * The Ered Mithrin campaign's Campaign Pool across scenario modules.
 *
 * MEC115: an encounter card in the Campaign Pool is added to each later
 * encounter deck regardless of encounter set. Each Ered Mithrin scenario
 * module scripts only the cards of its own recipes, so a card that joined the
 * Campaign Pool in an earlier chapter would resolve nothing in a later one.
 * This layer scripts those cards for the chapters from The Withered Heath on:
 * batch4Scenario composes its hooks with the current chapter's, and each hook
 * acts only on a card that is foreign to the current chapter (in the Campaign
 * Pool's portable list, outside the chapter's recipes). Card text that refers
 * to another scenario's components (the Evil Creatures deck, a Caves deck the
 * chapter does not have) does as much as it can.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  removeShadowCard,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardLocation,
  discardPlayerDeck,
  engage,
  enemyAddedToStaging,
  placeEncounter,
} from "./board";
import { isAlly } from "./card-types";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { batch4Scenario } from "./batch4-scenarios";
import { WILDS_RHOVANION as W } from "./wilds-rhovanion-support";
import {
  WITHERED_HEATH as H,
  WITHERED_HEATH_RECIPES,
  witheredHeathSigns,
} from "./withered-heath-support";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  ROAM_RHOVANION as R,
  ROAM_RHOVANION_RECIPES,
} from "./roam-rhovanion-support";
import {
  FIRE_NIGHT as F,
  FIRE_NIGHT_RECIPES,
  fireNightSideCount,
} from "./fire-night-support";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_RECIPES,
  ghostLoot,
} from "./ghost-framsburg-support";
import {
  GUNDABAD as GB,
  MOUNT_GUNDABAD_RECIPES,
  gundabadQuestCount,
} from "./mount-gundabad-support";
import { FATE_WILDERLAND_RECIPES } from "./fate-wilderland-support";

/** Physical cards and lasting effects of the Campaign Pool's foreign cards. */
export interface EredPoolState {
  /** Foreign treacheries whose effects are resolving (kept out of the discard pile). */
  resolving: string[];
  /** Hobgoblin: the player card it guards, faceup. */
  guarded: { guardId: string; player: number; card: Unit }[];
  /** Lonely Lands: the events placed facedown under it. */
  stored: { locationId: string; player: number; cards: Unit[] }[];
  noReady: { id: string; round: number }[];
  noDamage: { id: string; round: number; phase: string }[];
  locationProgress: { id: string; round: number; amount: number }[];
  vastness: { round: number; phase: string; amount: number }[];
  darkPlaces: { round: number; phase: string; amount: number }[];
  /** Group responses limited to once per game (Lost Armory, Ancient Treasury). */
  usedResponses: string[];
  /** Heavy Snow: the round in which characters cannot be readied by player card effects. */
  playerReadyBlockedRound?: number;
  /** Wild Creatures: the players who engaged an enemy in the staging area. */
  wildEngaged?: number[];
  /** Terrible Shadows: each character's -1 [willpower], [attack] and [defense] until the end of the round. */
  shadows?: { id: string; round: number; amount: number }[];
  /** Moonlit Passage: each player's threat reduced by player card effects this round. */
  threatReduced?: { player: number; round: number; amount: number }[];
  /** Narrow Stair's shadow: characters that cannot be readied by player card effects this round. */
  noPlayerReady?: { id: string; round: number }[];
}

/** The chapters this layer serves, with their own modules' recipes. */
const LATER: Record<string, readonly { card_codes: string[] }[]> = {
  "the-withered-heath": WITHERED_HEATH_RECIPES,
  "roam-across-rhovanion": ROAM_RHOVANION_RECIPES,
  "fire-in-the-night": FIRE_NIGHT_RECIPES,
  "the-ghost-of-framsburg": GHOST_FRAMSBURG_RECIPES,
  "mount-gundabad": MOUNT_GUNDABAD_RECIPES,
  "the-fate-of-wilderland": FATE_WILDERLAND_RECIPES,
};
const NATIVE: Record<string, Set<string>> = Object.fromEntries(
  Object.entries(LATER).map(([id, recipes]) => [
    id,
    new Set(recipes.flatMap((r) => r.card_codes)),
  ]),
);
/**
 * The encounter cards of Journey Up the Anduin, Lost in Mirkwood, The King's
 * Quest, The Withered Heath, Roam Across Rhovanion, Fire in the Night, The
 * Ghost of Framsburg and Mount Gundabad that can join the Campaign Pool (A Growing Threat sets aside a non-unique,
 * non-objective, non-burden card; Roam Across Rhovanion's resolution adds
 * staging locations), scripted here for later chapters. (The Core Set's cards
 * resolve in every scenario.)
 */
export const ERED_POOL_PORTABLE = [
  W.riverbank,
  W.frenzied,
  W.crossing,
  W.troop,
  W.stray,
  W.wargs,
  W.hills,
  W.lonely,
  W.supplies,
  W.lostWild,
  W.weighed,
  W.twilight,
  W.patrol,
  W.spider,
  W.unseen,
  W.vastness,
  W.accursed,
  W.darkWoods,
  W.gloom,
  W.swarm,
  W.mine,
  W.contested,
  W.chasm,
  W.denizen,
  W.troll,
  W.hobgoblin,
  W.werewolf,
  W.giantSpider,
  W.blackBats,
  W.tunnel,
  W.fork,
  W.darkPlaces,
  W.eyes,
  W.afraid,
  W.breath,
  W.scales,
  W.grotto,
  W.cavern,
  W.lake,
  W.armory,
  W.den,
  W.treasury,
  // The Withered Heath
  H.troll,
  H.hatchling,
  H.pass,
  H.door,
  H.entrance,
  H.creatureDen,
  H.falls,
  H.snow,
  H.cold,
  // Roam Across Rhovanion
  R.giant,
  R.eagle,
  R.bear,
  R.moor,
  R.ravine,
  R.slopes,
  R.sneaking,
  R.weather,
  R.creatures,
  // Fire in the Night
  F.thrall,
  F.orc,
  F.gate,
  F.palisade,
  F.tower,
  F.wrath,
  F.fury,
  F.flames,
  // The Ghost of Framsburg (the discover keyword is ignored in later chapters)
  G.crypt,
  G.stalker,
  G.staircase,
  G.spectre,
  G.hall,
  G.terrible,
  G.ruins,
  G.moonlit,
  G.tower,
  G.slammed,
  // (Fram's Shade, a unique Hazard, can join through The Ghost of Framsburg's
  // resolution.)
  G.shade,
  // Mount Gundabad (the deep and discover keywords are ignored in The Fate of
  // Wilderland)
  GB.ruins,
  GB.guardian,
  GB.slave,
  GB.bane,
  GB.mines,
  GB.dweller,
  GB.stairs,
  GB.shadows,
];
const PORTABLE = new Set(ERED_POOL_PORTABLE);

/** An Ered Mithrin campaign game in a chapter this layer serves. */
export const eredPoolLive = (s: GameState) =>
  s.campaign?.kind === "ered" && s.scenarioId in NATIVE;
/** A Campaign Pool card the current chapter's own module does not script. */
export const eredForeign = (s: GameState, code: string) =>
  eredPoolLive(s) && PORTABLE.has(code) && !NATIVE[s.scenarioId].has(code);
const foreignUnit = (s: GameState, u: Unit, code: string) =>
  u.code === code && !u.blanked && eredForeign(s, code);
const foreignAttachments = (s: GameState, u: Unit, code: string) =>
  eredForeign(s, code)
    ? u.attachments.filter((a) => a.code === code && !a.blanked && !a.facedown)
        .length
    : 0;

const fresh = (): EredPoolState => ({
  resolving: [],
  guarded: [],
  stored: [],
  noReady: [],
  noDamage: [],
  locationProgress: [],
  vastness: [],
  darkPlaces: [],
  usedResponses: [],
});
const pool = (s: GameState) => (s.eredPool ??= fresh());

type Combat = NonNullable<GameState["combat"]> & {
  eredPoolBlankShadow?: boolean;
  eredPoolDiscardAlly?: boolean;
  eredPoolWeather?: boolean;
  eredPoolWeatherKill?: boolean;
  /** Terrible Shadows' shadow: the threat raised if this attack destroys a character. */
  eredPoolTerrible?: number;
  /** Desecrated Ruins' shadow: each player discards a random card if this attack destroys a character. */
  eredPoolRuins?: number;
  /** This attack destroyed a character (Terrible Shadows, Desecrated Ruins). */
  eredPoolKill?: boolean;
};

// ------------------------------------------------------------- helpers

const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...(s.extraActiveLocations ?? []),
  ].filter((u) => card(u.code).type_code === "location");
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const trait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((v) => v.trim() === t);
const dark = (s: GameState) =>
  !!s.activeLocation && trait(s.activeLocation, "Dark");
const maxCharacters = (s: GameState) =>
  Math.max(0, ...playerOrder(s).map((p) => own(s, p).length));
const phaseMatches = (s: GameState, m: { round: number; phase: string }) =>
  m.round === s.round && m.phase === s.phase;
const objectiveLocation = (u: Unit) =>
  card(u.code).type_code === "objective-location";
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const stagedLocations = (s: GameState) =>
  s.staging.filter((l) => card(l.code).type_code === "location").length;
/** Crypt Stalker and Hidden Staircase: "X is the tens digit of the first player's threat." */
const tens = (s: GameState) =>
  Math.floor(seatView(s, firstPlayer(s)).threat / 10);
/** The foreign copies of a location in the staging area. */
const stagedForeign = (s: GameState, code: string) =>
  s.staging.filter((l) => foreignUnit(s, l, code)).length;
/** Add an encounter card to the staging area (an enemy may engage a player). */
function add(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") {
    enemyAddedToStaging(s, u);
    if (player !== undefined) forOwner(s, player, () => engage(s, u));
  }
  return u;
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
/** Discard, rather than reveal: keywords and When Revealed effects never fire. */
function discardUntil(
  s: GameState,
  accepts: (code: string) => boolean,
  reshuffle = false,
) {
  let remaining = s.encounterDeck.length + s.encounterDiscard.length;
  while (remaining-- > 0) {
    if (!s.encounterDeck.length) {
      if (!reshuffle || !s.encounterDiscard.length) break;
      shuffleDiscard(s);
    }
    const code = s.encounterDeck.shift();
    if (!code) break;
    if (accepts(code)) return code;
    s.encounterDiscard.push(code);
  }
  return undefined;
}
function noReady(s: GameState, id: string) {
  const q = pool(s);
  q.noReady = q.noReady.filter((m) => m.id !== id);
  q.noReady.push({ id, round: s.round });
}
/** Is this enemy guarding a card (in any of the Ered Mithrin scenarios' ways)? */
function guardingCard(s: GameState, u: Unit) {
  return (
    !!u.guarding ||
    !!u.cobasGuarding?.length ||
    !!s.eredPool?.guarded.some((g) => g.guardId === u.id) ||
    !!s.eredCampaign?.guarded?.some((g) => g.guardId === u.id) ||
    !!s.witheredHeath?.guards.some((g) => g.guardId === u.id) ||
    !!s.roamRhovanion?.guarded.some((g) => g.guardId === u.id) ||
    !!s.roamRhovanion?.guardedPlayerCards.some((g) => g.guardId === u.id) ||
    !!s.mountGundabad?.guardedPlayerCards.some((g) => g.guardId === u.id) ||
    !!s.ghostFramsburg?.loot.some((g) => g.guardId === u.id)
  );
}
/** The chapter's Caves deck, if it has one. */
const cavesDeck = (s: GameState) =>
  s.witheredHeath?.cavesDeck ?? s.mountGundabad?.cavesDeck;
/** The Deep keyword (and Contested Depths' replacement), through the chapter's own Caves rule. */
function deep(s: GameState, u: Unit): Effect | undefined {
  if (!cavesDeck(s)?.length) return;
  if (s.witheredHeath) {
    // The Withered Heath's stage 2 does not resolve the deep keyword.
    if (s.stage === 2 && !mainQuestUnit(s)?.blanked) return;
    return fx("heathDeep", { target: u.id, player: firstPlayer(s) });
  }
  return fx("gundabadDeep", {
    target: u.id,
    code: u.code,
    player: firstPlayer(s),
  });
}
function characterOptions(
  s: GameState,
  p: number,
  e: Effect,
  predicate = (_u: Unit) => true,
): Option[] {
  return own(s, p)
    .filter(predicate)
    .map((u) => ({
      id: u.id,
      code: u.code,
      label: name(u),
      effects: [{ ...e, target: u.id, player: p }],
    }));
}
function consume(s: GameState, code: string, discard = true) {
  const q = pool(s),
    i = q.resolving.indexOf(code);
  if (i < 0) return false;
  q.resolving.splice(i, 1);
  if (discard) s.encounterDiscard.push(code);
  return true;
}
/** A resolving treachery becomes a Condition attachment. */
function condition(s: GameState, u: Unit, code: string) {
  if (!consume(s, code, false)) return;
  const a = make(s, code);
  u.attachments.push({ id: a.id, code, exhausted: false });
}
function discardWholeHand(s: GameState, player: number) {
  forOwner(s, player, () => {
    for (const u of [...s.hand]) {
      if (u.code === W.lostWild && eredForeign(s, u.code)) {
        s.hand = s.hand.filter((c) => c.id !== u.id);
        s.encounterDiscard.push(u.code);
      } else discardHandCard(s, u.id);
    }
  });
}
/** Lonely Lands' facedown events go to their owners' discard piles when it leaves play. */
function releaseStored(s: GameState, locationId: string) {
  const q = s.eredPool;
  if (!q) return;
  for (const batch of q.stored.filter((v) => v.locationId === locationId))
    for (const c of batch.cards)
      forOwner(s, c.owner ?? batch.player, () => s.discard.push(c.code));
  q.stored = q.stored.filter((v) => v.locationId !== locationId);
}

// ------------------------------------------------------------- passives

function poolStats(s: GameState, u: Unit) {
  let will = 0,
    attack = 0,
    defense = 0;
  if (!eredPoolLive(s)) return { attack, defense };
  // Guardian of Gundabad: +2 [defense] while there are 3 or more quest cards
  // in the victory display.
  if (foreignUnit(s, u, GB.guardian) && gundabadQuestCount(s) >= 3)
    defense += 2;
  // Crypt Stalker: X [attack] and [defense].
  if (foreignUnit(s, u, G.stalker)) {
    attack += tens(s);
    defense += tens(s);
  }
  // Terrible Shadows: -1 [willpower], [attack] and [defense] until the end of
  // the round.
  const shade = (s.eredPool?.shadows ?? [])
    .filter((m) => m.id === u.id && m.round === s.round)
    .reduce((n, m) => n + m.amount, 0);
  will -= shade;
  attack -= shade;
  defense -= shade;
  // Frenzied Creature: +1 [threat], +1 [attack], +1 [defense], immune.
  const frenzy = foreignAttachments(s, u, W.frenzied);
  attack += frenzy;
  defense += frenzy;
  if (foreignUnit(s, u, W.werewolf)) attack += u.damage;
  // Dragon Hatchling: +1 [attack] for each Dragon Sign in the victory display.
  if (foreignUnit(s, u, H.hatchling)) attack += witheredHeathSigns(s);
  // Goblin Troop: each other Goblin enemy engaged with you gets +1/+1.
  if (trait(u, "Goblin") && allEngaged(s).some((e) => e.id === u.id)) {
    const n = allEngaged(s).filter(
      (e) =>
        e.id !== u.id &&
        foreignUnit(s, e, W.troop) &&
        ownerOf(s, e) === ownerOf(s, u),
    ).length;
    attack += n;
    defense += n;
  }
  if (foreignUnit(s, u, W.hobgoblin)) {
    const g = s.eredPool?.guarded.find((c) => c.guardId === u.id);
    const n = g ? Number(card(g.card.code).cost) || 0 : 0;
    attack += n;
    defense += n;
  }
  return will ? { will, attack, defense } : { attack, defense };
}
function poolThreatBonus(s: GameState, u: Unit) {
  if (!eredPoolLive(s)) return 0;
  let n = foreignAttachments(s, u, W.frenzied);
  if (foreignUnit(s, u, W.hills) || foreignUnit(s, u, W.lake))
    n += maxCharacters(s);
  if (foreignUnit(s, u, W.lonely))
    n +=
      2 *
      (s.eredPool?.stored
        .filter((c) => c.locationId === u.id)
        .reduce((n, c) => n + c.cards.length, 0) ?? 0);
  if (foreignUnit(s, u, W.twilight)) n += 2 * u.resources;
  // Dragon Hatchling and Cave Entrance: +1 [threat] for each Dragon Sign in
  // the victory display; High Falls: X is the number of staging locations.
  if (foreignUnit(s, u, H.hatchling) || foreignUnit(s, u, H.entrance))
    n += witheredHeathSigns(s);
  if (foreignUnit(s, u, H.falls)) n += stagedLocations(s);
  // Burning Watchtower: X is 1 more than the side quests in the victory display.
  if (foreignUnit(s, u, F.tower)) n += 1 + fireNightSideCount(s);
  // Crypt Stalker and Hidden Staircase: X is the tens digit of the first
  // player's threat.
  if (foreignUnit(s, u, G.stalker) || foreignUnit(s, u, G.staircase))
    n += tens(s);
  // Desecrated Ruins: +2 [threat] while there are 3 or more quest cards in
  // the victory display.
  if (foreignUnit(s, u, GB.ruins) && gundabadQuestCount(s) >= 3) n += 2;
  if (foreignUnit(s, u, W.contested))
    n += (s.victoryCards ?? []).filter(
      (c) => card(c).type_code === "location",
    ).length;
  if (foreignUnit(s, u, W.hobgoblin)) {
    const g = s.eredPool?.guarded.find((g) => g.guardId === u.id);
    if (g) n += Number(card(g.card.code).cost) || 0;
  }
  // Vastness of Mirkwood: each non-objective location in the staging area.
  if (
    card(u.code).type_code === "location" &&
    s.staging.some((l) => l.id === u.id)
  )
    n += (s.eredPool?.vastness ?? [])
      .filter((m) => phaseMatches(s, m))
      .reduce((n, m) => n + m.amount * (u.progress > 0 ? 2 : 1), 0);
  return n;
}
const poolStagingThreat = (s: GameState) =>
  (s.eredPool?.darkPlaces ?? [])
    .filter((m) => phaseMatches(s, m))
    .reduce((n, m) => n + m.amount, 0);
const poolLocationQuestBonus = (s: GameState, u: Unit) =>
  foreignUnit(s, u, W.hills) || foreignUnit(s, u, W.lake)
    ? maxCharacters(s)
    : 0;
function poolLocationProgressAmount(s: GameState, u: Unit, amount: number) {
  if (!eredPoolLive(s) || amount <= 0) return amount;
  const staged = s.staging.some((l) => l.id === u.id);
  // Dark Tunnel: progress cannot be placed on Dark locations in the staging area.
  if (
    staged &&
    trait(u, "Dark") &&
    s.staging.some((l) => foreignUnit(s, l, W.tunnel))
  )
    return 0;
  // Dark Black Woods: no more than 1 progress on each Forest location in the
  // staging area each round. Deep Ravine: no more than 1 progress on each
  // location in the staging area each round.
  if (
    !staged ||
    !(
      (trait(u, "Forest") &&
        s.staging.some((l) => foreignUnit(s, l, W.darkWoods))) ||
      s.staging.some((l) => foreignUnit(s, l, R.ravine))
    )
  )
    return amount;
  const q = pool(s),
    m = q.locationProgress.find((m) => m.id === u.id && m.round === s.round);
  const placed = Math.min(amount, Math.max(0, 1 - (m?.amount ?? 0)));
  if (placed > 0) {
    if (m) m.amount += placed;
    else q.locationProgress.push({ id: u.id, round: s.round, amount: placed });
  }
  return placed;
}
const poolCannotReady = (s: GameState, u: Unit) =>
  !!s.eredPool?.noReady.some((m) => m.id === u.id && m.round === s.round);
/** Afraid of the Dark: while the active location is Dark, the hero's text is blank. */
const poolCharacterBlanked = (s: GameState, u: Unit) =>
  eredPoolLive(s) && dark(s) && foreignAttachments(s, u, W.afraid) > 0;
const poolWillpowerOverride = (s: GameState, u: Unit) =>
  poolCharacterBlanked(s, u) ? 0 : undefined;
/**
 * Accursed Forest: 'when revealed' effects cannot be canceled. Mountain Pass:
 * the 'when revealed' effects of Weather treachery cards cannot be canceled.
 */
const poolCannotCancel = (s: GameState, shadow = false, code?: string) =>
  !shadow &&
  (s.staging.some((u) => foreignUnit(s, u, W.accursed)) ||
    (!!code &&
      card(code).type_code === "treachery" &&
      trait(code, "Weather") &&
      s.staging.some((u) => foreignUnit(s, u, H.pass))));
/** Dwarven Door: progress cannot be placed on it while it is in the staging area. */
const poolLocationProgressBlocked = (s: GameState, u: Unit) =>
  foreignUnit(s, u, H.door) && s.staging.some((l) => l.id === u.id);
/** Heavy Snow: until the end of the round, characters cannot be readied by player card effects. */
const poolCannotPlayerReady = (s: GameState) =>
  eredPoolLive(s) && s.eredPool?.playerReadyBlockedRound === s.round;
/** Narrow Stair's shadow: the defending character cannot be readied by player card effects this round. */
const poolCannotPlayerReadyCharacter = (s: GameState, u: Unit) =>
  !!s.eredPool?.noPlayerReady?.some(
    (m) => m.id === u.id && m.round === s.round,
  );
const poolCannotOptionallyEngage = (s: GameState, u: Unit) =>
  foreignUnit(s, u, W.stray) || foreignUnit(s, u, R.eagle);
/** Frenzied Creature's host; Forgotten Crypt: "Immune to player card effects." */
const poolImmune = (s: GameState, u: Unit) =>
  foreignAttachments(s, u, W.frenzied) > 0 || foreignUnit(s, u, G.crypt);
function poolCannotAttach(s: GameState, u: Unit, code?: string) {
  if (!foreignUnit(s, u, u.code)) return false;
  // Grey Mountain Giant and Fram's Shade: "Cannot have non-objective
  // attachments." (Fram's Shade's Loot bonuses find no Loot objective.)
  if (u.code === R.giant || u.code === G.shade)
    return !code || !card(code).type_code.startsWith("objective");
  if (u.code === W.troop || u.code === W.troll || u.code === H.troll)
    return (
      !code ||
      ["hero", "ally", "attachment", "event", "player-side-quest"].includes(
        card(code).type_code,
      )
    );
  return false;
}
function poolDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!eredPoolLive(s) || amount <= 0) return amount;
  if (s.eredPool?.noDamage.some((m) => m.id === u.id && phaseMatches(s, m)))
    return 0;
  if (foreignUnit(s, u, W.blackBats) && dark(s)) return 0;
  // Dragon Scales: cancel all of that damage, then discard Dragon Scales.
  const scales = eredForeign(s, W.scales)
    ? u.attachments.find((a) => a.code === W.scales && !a.blanked)
    : undefined;
  if (scales) {
    discardAttachment(s, u, scales, true);
    return 0;
  }
  return amount;
}
function poolDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  // Deep-dweller: "Forced: When Deep-dweller takes any amount of damage (and
  // survives), return it to the staging area."
  if (
    amount > 0 &&
    foreignUnit(s, u, GB.dweller) &&
    u.damage < stats(s, u).health
  )
    prepend(s, fx("eredPoolReturnEnemy", { target: u.id }));
  if (
    !eredPoolLive(s) ||
    amount <= 0 ||
    !context.combatDamage ||
    !context.enemyId ||
    !allCharacters(s).some((c) => c.id === u.id)
  )
    return;
  const enemy = get(s, context.enemyId);
  if (!enemy) return;
  // Giant Spider: the damaged character cannot ready until the end of the round.
  if (foreignUnit(s, enemy, W.giantSpider)) noReady(s, u.id);
  // Snow-troll: after it attacks and destroys a character, return it to the
  // staging area.
  if (
    foreignUnit(s, enemy, H.troll) &&
    u.damage >= stats(s, u).health &&
    s.combat?.enemyId === enemy.id
  )
    s.combat.returnToStaging = true;
  // Stone-troll: discard 1 card for each excess point of damage.
  if (foreignUnit(s, enemy, W.troll) && u.damage > stats(s, u).health)
    prepend(
      s,
      fx("eredPoolDiscardHand", {
        player: ownerOf(s, u),
        value: u.damage - stats(s, u).health,
      }),
    );
}

// ------------------------------------------------------------- triggers

function poolEngaged(s: GameState, u: Unit) {
  if (!eredPoolLive(s)) return;
  const p = ownerOf(s, u);
  const effects: Effect[] = [];
  // Ravenous Spider; Deep-dweller: "Forced: When Deep-dweller engages you, it
  // makes an immediate attack."
  if (foreignUnit(s, u, W.spider) || foreignUnit(s, u, GB.dweller))
    effects.push(fx("immediateAttack", { target: u.id, player: p }));
  // Grey Mountain Giant: "Forced: When Grey Mountain Giant engages you,
  // discard the top 5 cards of your deck. Assign damage among characters you
  // control equal to the number of allies discarded by this effect."
  if (foreignUnit(s, u, R.giant))
    effects.push(fx("eredPoolGiant", { player: p }));
  // The Dragon's Thrall: "Forced: After The Dragon's Thrall engages you,
  // either deal 3 damage to Hrogar's Hill, or it makes an immediate attack
  // against you." (Hrogar's Hill is only Fire in the Night's.)
  if (foreignUnit(s, u, F.thrall))
    effects.push(fx("immediateAttack", { target: u.id, player: p }));
  // Stray Goblin: after a player engages an enemy, it engages that player.
  for (const stray of s.staging.filter(
    (e) => e.id !== u.id && foreignUnit(s, e, W.stray),
  ))
    effects.push(fx("eredPoolStrayEngage", { target: stray.id, player: p }));
  prepend(s, ...effects);
}
function poolEnemyAttackStarted(s: GameState, u: Unit, player: number) {
  // Crypt Stalker: "Forced: When Crypt Stalker attacks, raise the defending
  // player's threat by 1."
  if (foreignUnit(s, u, G.stalker))
    prepend(s, fx("threat", { player, value: 1 }));
  if (!eredPoolLive(s) || u.blanked || !eredForeign(s, W.breath)) return;
  for (const breath of u.attachments.filter(
    (a) => a.code === W.breath && !a.blanked,
  ))
    prepend(
      s,
      ...own(s, player).map((c) =>
        fx("damage", { target: c.id, value: 1, player }),
      ),
      fx("discardAttachment", { target: u.id, source: breath.id, player }),
    );
}
/** Hunting Eagle: "Forced: When the encounter phase begins, Hunting Eagle engages the first player." */
function poolEncounterBegin(s: GameState) {
  if (!eredPoolLive(s)) return;
  prepend(
    s,
    ...s.staging
      .filter((u) => foreignUnit(s, u, R.eagle))
      .map((u) =>
        fx("eredPoolEagle", { target: u.id, player: firstPlayer(s) }),
      ),
  );
}
/** Harsh Weather's and Terrible Shadows' shadows: a character destroyed by this attack. */
function poolCharacterDestroyed(
  s: GameState,
  _u: Unit,
  context: DamageContext = {},
) {
  const c = s.combat as Combat | null;
  if (c?.eredPoolWeather) c.eredPoolWeatherKill = true;
  if (
    (c?.eredPoolTerrible || c?.eredPoolRuins) &&
    context.combatDamage &&
    context.enemyId === c.enemyId
  )
    c.eredPoolKill = true;
}
/** Pack of Wargs and Werewolf: a shadow card with no shadow effect. */
function poolShadowResolved(s: GameState, u: Unit, code: string) {
  if (!eredPoolLive(s) || u.blanked || !s.combat || card(code).shadow) return;
  const c = s.combat as Combat;
  if (foreignUnit(s, u, W.wargs)) c.eredPoolBlankShadow = true;
  if (foreignUnit(s, u, W.werewolf))
    prepend(
      s,
      fx("damage", { target: u.id, value: 1 }),
      ...(c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).map((target) =>
        fx("damage", { target, value: 1 }),
      ),
    );
}
function poolAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!eredPoolLive(s) || skipped) return [];
  const c = combat as Combat,
    u = get(s, c.enemyId),
    p = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  if (u && c.eredPoolBlankShadow && foreignUnit(s, u, W.wargs))
    effects.push(
      fx("immediateAttack", {
        target: u.id,
        player: p,
        text: "desert-no-shadow",
      }),
    );
  if (
    c.eredPoolDiscardAlly &&
    (c.damageDealt ?? 0) > 0 &&
    c.defenderId &&
    !get(s, c.defenderId)
  )
    effects.push(fx("eredPoolDiscardAlly", { player: p }));
  // Harsh Weather's shadow: "If this attack destroys a character, exhaust a
  // character you control."
  if (
    c.eredPoolWeather &&
    (c.eredPoolWeatherKill ||
      (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).some(
        (id) => !get(s, id),
      ))
  )
    effects.push(
      fx("eredPoolExhaust", { player: p, text: card(R.weather).name }),
    );
  // Terrible Shadows' shadow: "If this attack destroys a character, raise the
  // defending player's threat by 3."
  if (c.eredPoolTerrible && c.eredPoolKill)
    effects.push(fx("threat", { player: p, value: c.eredPoolTerrible }));
  // Desecrated Ruins' shadow: "If this attack destroys a character, each
  // player discards a random card from his hand."
  if (c.eredPoolRuins && c.eredPoolKill)
    for (let i = 0; i < c.eredPoolRuins; i++)
      effects.push(
        ...playerOrder(s).map((player) =>
          fx("eredPoolRandomDiscard", { player }),
        ),
      );
  return effects;
}
function poolHostLeaves(s: GameState, u: Unit) {
  const q = s.eredPool;
  if (!q) return;
  // Hobgoblin: return the card it was guarding to its owner's hand.
  for (const g of q.guarded.filter((g) => g.guardId === u.id))
    forOwner(s, g.card.owner ?? g.player, () => {
      s.hand.push(g.card);
    });
  q.guarded = q.guarded.filter((g) => g.guardId !== u.id);
  releaseStored(s, u.id);
}
function poolExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (!eredPoolLive(s)) return;
  if (foreignUnit(s, u, W.riverbank))
    log(
      s,
      "Wooded Riverbank · There is no Evil Creatures deck in this scenario.",
    );
  if (foreignUnit(s, u, W.mine) && wasActive)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolMineResponse", { player })),
    );
  // Twilight Hall: after a Forest location is explored, place 1 resource here.
  if (trait(u, "Forest"))
    for (const l of locations(s).filter((l) => foreignUnit(s, l, W.twilight)))
      l.resources++;
  releaseStored(s, u.id);
}
function poolTravelProblem(s: GameState, u: Unit): string | null {
  if (!eredPoolLive(s)) return null;
  if (foreignUnit(s, u, W.twilight) && u.resources === 0)
    return "Twilight Hall needs at least 1 resource before the players can travel there.";
  // High Falls' Travel cost: assign X damage among characters in play.
  if (
    foreignUnit(s, u, H.falls) &&
    allCharacters(s).reduce(
      (sum, c) => sum + Math.max(0, stats(s, c).health - c.damage),
      0,
    ) < stagedLocations(s)
  )
    return "High Falls requires assigning damage equal to the number of staging locations.";
  if (!s.activeLocation) {
    const chasm = s.staging.find((l) => foreignUnit(s, l, W.chasm));
    if (chasm && u.id !== chasm.id && !foreignUnit(s, u, W.chasm))
      return "The players must travel to Deep Chasm while there is no active location.";
  }
  // Narrow Stair: "When faced with the option to travel, the players must
  // travel to Narrow Stair."
  if (u.code !== GB.stairs && stagedForeign(s, GB.stairs))
    return "The players must travel to Narrow Stair.";
  return null;
}
const poolMustTravel = (s: GameState) =>
  eredPoolLive(s) &&
  !s.activeLocation &&
  s.staging.some(
    (l) => foreignUnit(s, l, W.chasm) || foreignUnit(s, l, GB.stairs),
  );
function poolTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!eredPoolLive(s) || u.blanked || !eredForeign(s, u.code)) return;
  if (u.code === W.accursed) return [fx("reveal", { player: firstPlayer(s) })];
  if (u.code === W.twilight)
    return playerOrder(s).map((player) =>
      fx("threat", { player, value: u.resources }),
    );
  if (u.code === W.darkWoods)
    return playerOrder(s).map((player) =>
      fx("eredPoolDiscardAdd", { player, text: "enemy" }),
    );
  if (u.code === W.mine)
    return playerOrder(s).map((player) => fx("eredPoolMineCost", { player }));
  if (u.code === H.entrance)
    return playerOrder(s).map((player) => fx("threat", { player, value: 1 }));
  if (u.code === H.falls)
    return [
      fx("eredPoolAssignDamage", {
        player: firstPlayer(s),
        flag: true,
        value: stagedLocations(s),
      }),
    ];
  if (u.code === H.creatureDen)
    return [fx("eredPoolCreatureDen", { player: firstPlayer(s) })];
  // Deep Ravine: "The first player must either exhaust Urdug, or raise each
  // player's threat by 2 to travel here." (Urdug is only Roam Across
  // Rhovanion's.)
  if (u.code === R.ravine)
    return playerOrder(s).map((player) => fx("threat", { player, value: 2 }));
  // Wooden Palisade: "Travel: The first player readies a hero he controls."
  if (u.code === F.palisade)
    return [fx("eredPoolPalisade", { player: firstPlayer(s) })];
  // Burning Watchtower: "Travel: Each player assigns X damage among
  // characters he controls."
  if (u.code === F.tower)
    return playerOrder(s).map((player) =>
      fx("eredPoolAssignDamage", {
        player,
        value: 1 + fireNightSideCount(s),
      }),
    );
  // Town Gate's Travel (Dagnir attacks) finds no Dagnir outside Fire in the
  // Night.
}
/** After the players travel to a foreign location, or it becomes the active location. */
function poolTravelEntered(s: GameState, u: Unit, actual = true) {
  if (!eredPoolLive(s) || u.blanked || !eredForeign(s, u.code)) return;
  const q = pool(s),
    effects: Effect[] = [];
  if (u.code === W.cavern)
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("eredPoolAssignDamage", { player, value: own(s, player).length }),
      ),
    );
  if (u.code === W.den)
    effects.push(fx("eredPoolDen", { player: firstPlayer(s) }));
  if (
    [W.armory, W.treasury].includes(u.code) &&
    !q.usedResponses.includes(u.code)
  )
    effects.push(
      fx("eredPoolLocationResponse", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (actual && u.code === W.contested)
    effects.push(
      fx("eredPoolContested", { target: u.id, player: firstPlayer(s) }),
    );
  // Grey Moorland: "Forced: After Grey Moorland becomes the active location,
  // shuffle the encounter discard pile into the encounter deck and discard
  // cards from it until a treachery is discarded. Resolve the 'When Revealed'
  // effect on that treachery."
  if (u.code === R.moor)
    effects.push(fx("eredPoolMoor", { player: firstPlayer(s) }));
  // Slopes of Ered Mithrin: "Response: After the players travel to Slopes of
  // Ered Mithrin, the first player may ready a character he controls."
  if (actual && u.code === R.slopes)
    effects.push(fx("eredPoolSlopes", { player: firstPlayer(s) }));
  // Forgotten Crypt: "Forced: After Forgotten Crypt becomes the active
  // location, discard cards from the encounter deck until an Undead enemy is
  // discarded and add it to the staging area. Then, attach a Loot objective
  // in the encounter discard pile to that enemy as a guarded objective."
  if (u.code === G.crypt)
    effects.push(fx("eredPoolCrypt", { player: firstPlayer(s) }));
  // Creature Den's Response searches the Caves deck for a Dragon Sign.
  if (actual && u.code === H.creatureDen)
    log(s, "Creature Den · There is no Dragon Sign in this scenario's decks.");
  if (
    actual &&
    [W.chasm, W.tunnel, W.fork, H.door, H.entrance, H.falls].includes(u.code)
  ) {
    const keyword = deep(s, u);
    // Forked Passage: "When you travel to Forked Passage (before resolving the
    // deep keyword) …" – its Response needs a Caves deck to look at.
    if (u.code === W.fork && (cavesDeck(s)?.length ?? 0) > 0)
      effects.push(
        fx("eredPoolForkResponse", {
          target: u.id,
          code: u.code,
          flag: !!keyword,
          player: firstPlayer(s),
        }),
      );
    else if (keyword) effects.push(keyword);
  }
  prepend(s, ...effects);
}
function poolAllyEntered(s: GameState, u: Unit) {
  // Underground Lake: after an ally enters play, exhaust it.
  if (locations(s).some((l) => foreignUnit(s, l, W.lake))) u.exhausted = true;
  return false;
}
/**
 * Cursed Tower (in the staging area): "Forced: After a player plays an
 * event, raise his threat by 1." Lonely Lands: after an event is played
 * during the quest phase, place it facedown under it.
 */
function poolEventPlayed(s: GameState, u: Unit) {
  if (!eredPoolLive(s)) return;
  const towers = stagedForeign(s, G.tower);
  if (towers)
    prepend(s, fx("threat", { player: ownerOf(s, u), value: towers }));
  if (s.phase !== "quest") return;
  if (!s.staging.some((l) => foreignUnit(s, l, W.lonely))) return;
  prepend(
    s,
    fx("eredPoolCaptureEvent", {
      source: u.id,
      code: u.code,
      player: activeSeat(s),
    }),
  );
}
/** Lost in the Wild, in a player's hand: after you play a card, discard each card in your hand. */
function poolPlayerCardPlayed(s: GameState) {
  if (!eredPoolLive(s) || !eredForeign(s, W.lostWild)) return;
  const player = activeSeat(s);
  if (seatView(s, player).hand.some((c) => c.code === W.lostWild))
    prepend(s, fx("eredPoolDiscardWholeHand", { player }));
}
/** Weighed Down: after the attached hero readies, discard an attachment from it. */
function poolCharacterReadied(s: GameState, u: Unit) {
  if (foreignAttachments(s, u, W.weighed))
    prepend(
      s,
      fx("eredPoolWeighedDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
}
function poolRevealSurge(s: GameState, code: string) {
  if (!eredForeign(s, code)) return false;
  if (code === W.crossing)
    return !s.activeLocation || threatOf(s, s.activeLocation) < 3;
  if (code === W.vastness)
    return (
      s.staging.filter(
        (l) => card(l.code).type_code === "location" && !objectiveLocation(l),
      ).length < playerOrder(s).length
    );
  if (code === W.swarm) return allHeroes(s).every((h) => h.resources === 0);
  if (code === W.denizen)
    return !s.staging.some((e) => card(e.code).type_code === "enemy");
  // Powerful in Wrath: "If no damage is dealt this way, Powerful in Wrath
  // gains surge." (Hrogar's Hill is only Fire in the Night's.)
  if (code === F.wrath) return true;
  // Abandoned Ruins: "If they cannot [resolve the Discover keyword of the
  // active location], Abandoned Ruins gains surge and doomed 2." (The
  // discover keyword is ignored.)
  if (code === G.ruins) return true;
  return false;
}
function poolCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  // Wilderland Bear: "When Revealed: The first player must choose: either
  // Wilderland Bear makes an immediate attack against him, or each player
  // discards 1 random card from his hand."
  if (fromReveal && !cancelled && foreignUnit(s, u, R.bear))
    prepend(s, fx("eredPoolBear", { target: u.id, player: firstPlayer(s) }));
  // Orc of the Flame: "When Revealed: The first player must either deal 2
  // damage to a hero he controls, or deal 3 damage to Hrogar's Hill." (No
  // Hrogar's Hill here: the hero takes it.)
  if (fromReveal && !cancelled && foreignUnit(s, u, F.orc))
    prepend(s, fx("eredPoolOrcFlame", { player: firstPlayer(s) }));
  // Hobgoblin: the first player attaches the top card of their deck to it
  // faceup as a guarded attachment.
  if (!cancelled && foreignUnit(s, u, W.hobgoblin))
    prepend(
      s,
      fx("eredPoolHobgoblin", { target: u.id, player: firstPlayer(s) }),
    );
}
/** Lightless Grotto: after the players commit characters to the quest. */
function poolCommitted(s: GameState) {
  if (!eredPoolLive(s)) return;
  prepend(
    s,
    ...locations(s)
      .filter((l) => foreignUnit(s, l, W.grotto))
      .map(() => fx("eredPoolGrotto", { player: firstPlayer(s) })),
  );
}
/**
 * Town Gate (in the staging area): "Forced: At the end of the quest phase,
 * place 1 resource here. Then, if there are 3 resources here, discard Town
 * Gate and deal 4 damage to Hrogar's Hill."
 */
function poolEndQuest(s: GameState) {
  if (!eredPoolLive(s)) return;
  prepend(
    s,
    ...s.staging
      .filter((u) => foreignUnit(s, u, F.gate))
      .map((u) => fx("eredPoolGate", { target: u.id, player: firstPlayer(s) })),
  );
}
/**
 * Haunted Hall (in the staging area): "Forced: After a player places any
 * amount of progress on a Dark location in the staging area, he raises his
 * threat by 1."
 */
function poolLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (
    !eredPoolLive(s) ||
    amount <= 0 ||
    !trait(u, "Dark") ||
    !s.staging.some((l) => l.id === u.id)
  )
    return;
  const halls = stagedForeign(s, G.hall);
  if (halls) prepend(s, fx("threat", { player: activeSeat(s), value: halls }));
}
/**
 * Moonlit Passage (in the staging area): "Each player's threat cannot be
 * reduced by more than 1 via player card effects each round."
 */
function poolThreatReduction(s: GameState, amount: number, reason?: string) {
  if (!eredPoolLive(s) || reason !== "player-card" || amount <= 0)
    return amount;
  if (!eredForeign(s, G.moonlit)) return amount;
  const q = pool(s),
    p = activeSeat(s);
  q.threatReduced = (q.threatReduced ?? []).filter((m) => m.round === s.round);
  const record = q.threatReduced.find((m) => m.player === p);
  const n = stagedForeign(s, G.moonlit)
    ? Math.min(amount, Math.max(0, 1 - (record?.amount ?? 0)))
    : amount;
  if (n > 0) {
    if (record) record.amount += n;
    else q.threatReduced.push({ player: p, round: s.round, amount: n });
  }
  if (n < amount)
    log(
      s,
      `Moonlit Passage: each player's threat cannot be reduced by more than 1 via player card effects each round (${n} of ${amount} is reduced).`,
    );
  return n;
}
/**
 * Evil Spectre: "Forced: When Evil Spectre is destroyed, shuffle it back into
 * the encounter deck if the active location has the Dark trait."
 */
function poolEnemyDestination(s: GameState, u: Unit, destruction = false) {
  if (!destruction || !foreignUnit(s, u, G.spectre) || !dark(s)) return false;
  s.encounterDeck = shuffle(s, [...s.encounterDeck, u.code]);
  log(
    s,
    "Evil Spectre is destroyed while the active location is Dark: it is shuffled back into the encounter deck.",
    "danger",
  );
  return true;
}
/** Mirkwood Patrol: at the end of the encounter phase. */
const poolEncounterEnd = (s: GameState): Effect[] =>
  eredPoolLive(s)
    ? s.staging
        .filter((u) => foreignUnit(s, u, W.patrol))
        .map((u) =>
          fx("eredPoolPatrol", { target: u.id, player: firstPlayer(s) }),
        )
    : [];
const poolCannotDiscardHand = (
  s: GameState,
  u: Unit,
  byPlayerCardEffect = true,
) => u.code === W.lostWild && eredForeign(s, u.code) && byPlayerCardEffect;
function poolHandDiscardDestination(s: GameState, u: Unit) {
  if (u.code !== W.lostWild || !eredForeign(s, u.code)) return false;
  s.encounterDiscard.push(u.code);
  return true;
}

// ------------------------------------------------------------- treacheries

const TREACHERIES = [
  W.frenzied,
  W.crossing,
  W.supplies,
  W.lostWild,
  W.weighed,
  W.unseen,
  W.vastness,
  W.gloom,
  W.swarm,
  W.denizen,
  W.afraid,
  W.eyes,
  W.darkPlaces,
  W.breath,
  W.scales,
  H.snow,
  H.cold,
  R.sneaking,
  R.weather,
  R.creatures,
  F.wrath,
  F.fury,
  F.flames,
  G.terrible,
  G.ruins,
  G.slammed,
  GB.bane,
  GB.shadows,
];
function poolEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!TREACHERIES.includes(code) || !eredForeign(s, code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  pool(s).resolving.push(code);
  prepend(s, fx("eredPoolTreachery", { code, player: firstPlayer(s) }));
  return true;
}
function poolShadow(s: GameState, code: string) {
  const c = s.combat as Combat | null;
  if (!c || !eredForeign(s, code)) return false;
  const player = c.attackPlayer ?? activeSeat(s),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []),
    defender = defenders[0] ? get(s, defenders[0]) : undefined;
  const enemy = get(s, c.enemyId);
  /** This shadow card leaves the attacking enemy's shadow cards. */
  const takeShadow = () => {
    const i = enemy?.shadows
      .slice(0, enemy.revealedShadowCount ?? 0)
      .lastIndexOf(code);
    if (!enemy || i === undefined || i < 0) return false;
    removeShadowCard(enemy, i);
    return true;
  };
  if (code === W.crossing)
    c.attackBonus += defender && defender.damage > 0 ? 2 : 1;
  else if (code === W.troop) c.attackBonus += 2;
  else if (code === W.stray) {
    if (takeShadow()) add(s, code);
  } else if (code === W.wargs) c.returnToStaging = true;
  else if (code === W.riverbank || code === W.werewolf)
    prepend(
      s,
      ...defenders.map((target) => fx("damage", { target, value: 1, player })),
    );
  else if (code === W.frenzied) {
    if (enemy && takeShadow()) {
      const a = make(s, code);
      enemy.attachments.push({ id: a.id, code, exhausted: false });
    }
  } else if (code === W.supplies)
    prepend(
      s,
      fx("threat", { player, value: seatView(s, player).engaged.length }),
    );
  else if (code === W.unseen) {
    if (enemy && guardingCard(s, enemy)) {
      enemy.tempAttack = (enemy.tempAttack ?? 0) + 2;
      enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
    }
  } else if ([W.patrol, W.giantSpider].includes(code))
    for (const id of defenders) noReady(s, id);
  else if ([W.spider, W.denizen].includes(code))
    c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === W.gloom) {
    c.attackBonus++;
    c.eredPoolDiscardAlly = true;
  } else if (code === W.swarm)
    c.attackBonus += defender && defender.attachments.length > 0 ? 2 : 1;
  else if (code === W.troll)
    prepend(s, fx("eredPoolDiscardAttachment", { player }));
  else if (code === W.blackBats) {
    if (dark(s))
      pool(s).noDamage.push({ id: c.enemyId, round: s.round, phase: s.phase });
  } else if (code === W.darkPlaces) c.attackBonus++;
  // Heavy Snow: exhaust a character you control.
  else if (code === H.snow) prepend(s, fx("eredPoolExhaust", { player }));
  // Deadly Cold: +1 [attack] (+2 instead if the defending character is damaged).
  else if (code === H.cold)
    c.attackBonus += defenders.some((id) => (get(s, id)?.damage ?? 0) > 0)
      ? 2
      : 1;
  // Hunting Eagle: +1 [attack] (+2 instead if the attacker is a Creature).
  else if (code === R.eagle)
    c.attackBonus += enemy && trait(enemy, "Creature") ? 2 : 1;
  // Slopes of Ered Mithrin: "If the first player controls Urdug, exhaust him"
  // (Urdug is only Roam Across Rhovanion's).
  else if (code === R.slopes)
    log(s, "Slopes of Ered Mithrin · No one controls Urdug in this scenario.");
  // Harsh Weather: +1 [attack]; if this attack destroys a character, exhaust
  // a character you control.
  else if (code === R.weather) {
    c.attackBonus++;
    c.eredPoolWeather = true;
  }
  // Grey Moorland: return the attacking enemy to the staging area.
  else if (code === R.moor) c.returnToStaging = true;
  // Orc of the Flame: +1 [attack] (+2 at 25 damage on Hrogar's Hill, only
  // Fire in the Night's).
  else if (code === F.orc) c.attackBonus++;
  // Bright Flames: +1 [attack] for each side quest in the victory display.
  else if (code === F.flames) c.attackBonus += fireNightSideCount(s);
  // The Dragon's Fury: attacking enemy makes an additional attack.
  else if (code === F.fury) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  // The Dragon's Thrall and Powerful in Wrath send damage to Hrogar's Hill,
  // only Fire in the Night's.
  else if (code === F.thrall || code === F.wrath)
    log(s, `${card(code).name} · There is no Hrogar's Hill in this scenario.`);
  // Snow-troll: attacking enemy makes an additional attack against you.
  else if (code === H.troll) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  // Dragon Hatchling: until the end of the phase, +1 [attack] and +1
  // [defense] for each Dragon Sign in the victory display.
  else if (code === H.hatchling) {
    const n = witheredHeathSigns(s);
    if (enemy && n) {
      enemy.tempAttack = (enemy.tempAttack ?? 0) + n;
      enemy.tempDefense = (enemy.tempDefense ?? 0) + n;
    }
  } else if (code === W.eyes) {
    if (!defenders.length) prepend(s, fx("eredPoolDiscardAlly", { player }));
  }
  // Crypt Stalker: "Either raise your threat by 2, or return attacking enemy
  // to the staging area."
  else if (code === G.stalker)
    prepend(s, fx("eredPoolStalkerShadow", { target: c.enemyId, player }));
  // Evil Spectre: +1 [attack] (+2 instead if the active location is Dark).
  else if (code === G.spectre) c.attackBonus += dark(s) ? 2 : 1;
  // Moonlit Passage: "Raise your threat by 1."
  else if (code === G.moonlit) prepend(s, fx("threat", { player, value: 1 }));
  // Cursed Tower: "Discard a non-objective attachment you control."
  else if (code === G.tower)
    prepend(s, fx("eredPoolDiscardAttachment", { player, flag: true }));
  // Terrible Shadows: +1 [attack]; if this attack destroys a character, the
  // defending player raises their threat by 3.
  else if (code === G.terrible) {
    c.attackBonus++;
    c.eredPoolTerrible = (c.eredPoolTerrible ?? 0) + 3;
  }
  // Abandoned Ruins: "Attacking enemy makes an additional attack against you
  // after this one."
  else if (code === G.ruins) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  // Desecrated Ruins: +1 [attack]; if this attack destroys a character, each
  // player discards a random card from his hand.
  else if (code === GB.ruins) {
    c.attackBonus++;
    c.eredPoolRuins = (c.eredPoolRuins ?? 0) + 1;
  }
  // Guardian of Gundabad: attacking enemy gets +2 [defense] until the end of
  // the phase.
  else if (code === GB.guardian) {
    if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
  }
  // Dagnir's Slave: +1 [attack] (+2 with Dagnir engaged with you, only in
  // Mount Gundabad).
  else if (code === GB.slave) c.attackBonus++;
  // Wilderland's Bane: the attacking enemy makes an additional attack.
  else if (code === GB.bane) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  // Mines of Gundabad: only an attacking Dagnir makes the defending player
  // assign damage.
  else if (code === GB.mines)
    log(s, "Mines of Gundabad · The attacking enemy is not Dagnir.");
  // Narrow Stair: until the end of the round, the defending character cannot
  // be readied by player card effects.
  else if (code === GB.stairs) {
    const q = pool(s);
    q.noPlayerReady = [
      ...(q.noPlayerReady ?? []).filter((m) => m.round === s.round),
      ...defenders.map((id) => ({ id, round: s.round })),
    ];
  }
  // Suffocating Shadows: +1 [attack] (+3 instead with 3 or more quest cards
  // in the victory display).
  else if (code === GB.shadows)
    c.attackBonus += gundabadQuestCount(s) >= 3 ? 3 : 1;
  else return false;
  return true;
}
function treachery(s: GameState, code: string) {
  const q = pool(s);
  if (code === W.frenzied) {
    // "Add the top card of the Evil Creatures deck to the staging area and
    // attach Frenzied Creature to it": there is no Evil Creatures deck.
    log(
      s,
      "Frenzied Creature · There is no Evil Creatures deck in this scenario.",
    );
    consume(s, code);
  } else if (code === W.crossing) {
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("eredPoolAssignDamage", {
          player,
          value: s.activeLocation ? threatOf(s, s.activeLocation) : 0,
        }),
      ),
    );
  } else if (code === W.supplies) {
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolSupplies", { player })),
    );
  } else if (code === W.lostWild) {
    const players = playerOrder(s).filter(
      (p) => !seatView(s, p).hand.some((c) => c.code === code),
    );
    const max = Math.max(-1, ...players.map((p) => seatView(s, p).hand.length));
    const targets = players.filter((p) => seatView(s, p).hand.length === max);
    if (targets.length)
      choose(
        s,
        "Lost in the Wild · Choose the player with the most cards",
        targets.map((p) => ({
          id: String(p),
          label: `Player ${p + 1} · ${max} cards`,
          effects: [fx("eredPoolLostHand", { player: p, code })],
        })),
      );
    else consume(s, code);
  } else if (code === W.weighed) {
    const heroes = allHeroes(s).filter(
        (u) => !u.attachments.some((a) => a.code === code),
      ),
      max = Math.max(-1, ...heroes.map((u) => u.attachments.length)),
      targets = heroes.filter((u) => u.attachments.length === max);
    if (targets.length)
      choose(
        s,
        "Weighed Down · Choose a hero with the most attachments",
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("eredPoolCondition", { target: u.id, code }),
            fx("exhaust", { target: u.id, player: ownerOf(s, u) }),
          ],
        })),
      );
    else consume(s, code);
  } else if (code === W.unseen) {
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolUnseen", { player })),
    );
  } else if (code === W.vastness) {
    consume(s, code);
    q.vastness.push({ round: s.round, phase: s.phase, amount: 1 });
  } else if (code === W.gloom) {
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolGloom", { player })),
    );
  } else if (code === W.swarm) {
    consume(s, code);
    for (const player of playerOrder(s)) {
      const heroes = seatView(s, player).heroes,
        n = heroes.reduce((n, h) => n + h.resources, 0);
      for (const h of heroes) h.resources = 0;
      if (n) prepend(s, fx("threat", { player, value: n }));
    }
  } else if (code === W.denizen) {
    consume(s, code);
    const staged = s.staging.filter((u) => card(u.code).type_code === "enemy"),
      max = Math.max(-1, ...staged.map((u) => stats(s, u).attack)),
      targets = staged.filter((u) => stats(s, u).attack === max);
    if (targets.length)
      choose(
        s,
        "Denizen of the Deep · Highest attack enemy",
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
          ],
        })),
      );
  } else if (code === W.afraid) {
    const targets = allHeroes(s).filter(
      (u) => u.committed && !u.attachments.some((a) => a.code === code),
    );
    if (targets.length)
      choose(
        s,
        "Afraid of the Dark · Attach to a questing hero",
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("eredPoolCondition", { target: u.id, code }),
            fx("eredPoolRemoveQuest", { target: u.id }),
          ],
        })),
      );
    else consume(s, code);
  } else if (code === W.eyes) {
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolEyes", { player })),
    );
  } else if (code === W.darkPlaces) {
    consume(s, code);
    if (s.activeLocation)
      q.darkPlaces.push({
        round: s.round,
        phase: s.phase,
        amount: threatOf(s, s.activeLocation),
      });
    else {
      const found = discardUntil(s, (c) => card(c).type_code === "location");
      if (found) add(s, found);
    }
  } else if (code === R.sneaking) {
    // "The first player loses control of Urdug, then attach Urdug to a
    // location in the staging area as a guarded objective. If he cannot, add
    // 5 to the total [threat] in the staging area until the end of the phase.
    // In either case, remove Sneaking Off from the game." (Urdug is only Roam
    // Across Rhovanion's.)
    consume(s, code, false);
    s.removed.push(code);
    q.darkPlaces.push({ round: s.round, phase: s.phase, amount: 5 });
    log(
      s,
      "Sneaking Off: no one controls Urdug, so the staging area gets +5 threat until the end of the phase; Sneaking Off is removed from the game.",
      "danger",
    );
  } else if (code === R.weather) {
    // "For each ready character a player controls, he must choose: either
    // exhaust that character or raise his threat by 1."
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).flatMap((player) =>
        own(s, player)
          .filter((u) => !u.exhausted)
          .map((u) => fx("eredPoolWeatherCharacter", { target: u.id, player })),
      ),
    );
  } else if (code === R.creatures) {
    // "Starting with the first player, each player chooses an enemy in the
    // staging area and engages it. Then, if any player did not engage an
    // enemy this way, discard cards from the encounter deck until a Creature
    // enemy is discarded and add it to the staging area."
    consume(s, code);
    q.wildEngaged = [];
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("eredPoolWildEngage", { player })),
      fx("eredPoolWildFinish", { player: firstPlayer(s) }),
    );
  } else if (code === F.wrath) {
    // "Doomed 1. When Revealed: Discard the active location and deal X damage
    // to Hrogar's Hill, where X is that location's [threat]." (No Hrogar's
    // Hill here; it surges.)
    consume(s, code);
    const loc = s.activeLocation;
    if (loc && discardLocation(s, loc, true))
      log(s, `Powerful in Wrath discards ${name(loc)}.`, "danger");
  } else if (code === F.fury) {
    // "Dagnir makes an immediate attack against the first player." (Dagnir is
    // only Fire in the Night's.)
    consume(s, code);
    log(s, "The Dragon's Fury · There is no Dagnir in this scenario.");
  } else if (code === F.flames) {
    // "Each player assigns X damage among characters he controls, where X is
    // 1 more than the number of side quests in the victory display."
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("eredPoolAssignDamage", {
          player,
          value: 1 + fireNightSideCount(s),
        }),
      ),
    );
  } else if (code === H.snow) {
    // "Exhaust a character. Until the end of the round, characters cannot be
    // readied by player card effects."
    consume(s, code);
    q.playerReadyBlockedRound = s.round;
    prepend(s, fx("eredPoolExhaust", { player: firstPlayer(s), flag: true }));
  } else if (code === H.cold) {
    // "For each ready character a player controls, he must choose: either
    // exhaust that character, or deal 1 damage to it."
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).flatMap((player) =>
        own(s, player)
          .filter((u) => !u.exhausted)
          .map((u) => fx("eredPoolColdCharacter", { target: u.id, player })),
      ),
    );
  } else if (code === W.breath || code === W.scales) {
    const targets = enemies(s).filter(
      (u) => trait(u, "Dragon") && !u.attachments.some((a) => a.code === code),
    );
    if (targets.length)
      choose(
        s,
        `${card(code).name} · Attach to a Dragon`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("eredPoolCondition", { target: u.id, code })],
        })),
      );
    else consume(s, code);
  } else if (code === G.terrible) {
    // "Each character gets -1 [willpower], -1 [attack], and -1 [defense]
    // until the end of the round."
    consume(s, code);
    q.shadows = [
      ...(q.shadows ?? []).filter((m) => m.round === s.round),
      ...allCharacters(s).map((u) => ({ id: u.id, round: s.round, amount: 1 })),
    ];
    log(
      s,
      "Terrible Shadows: each character gets -1 [willpower], -1 [attack] and -1 [defense] until the end of the round.",
      "danger",
    );
  } else if (code === G.ruins) {
    // "Each player resolves the Discover keyword of the active location in
    // turn order. If they cannot, Abandoned Ruins gains surge and doomed 2."
    // (The discover keyword is ignored: each player raises their threat by 2,
    // and it surges.)
    consume(s, code);
    log(
      s,
      "Abandoned Ruins · The discover keyword is ignored: it gains surge and doomed 2.",
      "danger",
    );
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("threat", { player, value: 2 })),
    );
  } else if (code === GB.bane) {
    // "Dagnir makes an immediate attack against each engaged player. If no
    // attacks were made this way, Dagnir gets -30 engagement cost until the
    // end of the round." (Dagnir is only Mount Gundabad's.)
    consume(s, code);
    log(s, "Wilderland's Bane · There is no Dagnir in this scenario.");
  } else if (code === GB.shadows) {
    // "Each player assigns X damage among allies he controls, where X is 1
    // more than the number of quest cards in the victory display."
    consume(s, code);
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("eredPoolAssignDamage", {
          player,
          text: "ally",
          value: 1 + gundabadQuestCount(s),
        }),
      ),
    );
  } else if (code === G.slammed) {
    // "Each player chooses and exhausts a character he controls. Until the
    // end of the round, characters cannot be readied by player card effects."
    // (Doomed 1 is a printed keyword.)
    consume(s, code);
    q.playerReadyBlockedRound = s.round;
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("eredPoolExhaust", { player, text: card(G.slammed).name }),
      ),
    );
  }
}

// ------------------------------------------------------------- effects

export function eredPoolEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("eredPool")) return false;
  const q = pool(s),
    player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "eredPoolTreachery":
      treachery(s, e.code!);
      break;
    case "eredPoolCondition":
      if (u) condition(s, u, e.code!);
      else consume(s, e.code!);
      break;
    case "eredPoolLostHand":
      if (consume(s, e.code!, false))
        forOwner(s, player, () => {
          s.hand.push(make(s, e.code!));
        });
      break;
    case "eredPoolRemoveQuest":
      if (u) {
        u.committed = false;
        forOwner(s, ownerOf(s, u), () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
      }
      break;
    case "eredPoolAssignDamage": {
      const remaining = e.value ?? 0;
      if (remaining <= 0) break;
      // (flag: among all characters in play, as High Falls' Travel cost;
      // text "ally": among your allies, as Suffocating Shadows.)
      const targets = (e.flag ? allCharacters(s) : own(s, player)).filter(
        (c) =>
          c.damage < stats(s, c).health && (e.text !== "ally" || isAlly(c)),
      );
      if (targets.length)
        choose(
          s,
          `Assign ${remaining} damage ${e.flag ? "among characters in play" : e.text === "ally" ? "among your allies" : "among your characters"}`,
          targets.map((c) => ({
            id: c.id,
            code: c.code,
            label: `Deal 1 damage to ${name(c)}`,
            effects: [
              fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
              fx("eredPoolAssignDamage", {
                player,
                flag: e.flag,
                text: e.text,
                value: remaining - 1,
              }),
            ],
          })),
        );
      break;
    }
    case "eredPoolExhaust": {
      // Heavy Snow (flag: any character, as its When Revealed effect) and
      // Harsh Weather's shadow (text: its title).
      const targets = (e.flag ? allCharacters(s) : own(s, player)).filter(
        canExhaust,
      );
      if (targets.length)
        choose(
          s,
          `${e.text ?? card(H.snow).name} · Exhaust a character`,
          targets.map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [fx("exhaust", { target: c.id, player: ownerOf(s, c) })],
          })),
        );
      break;
    }
    case "eredPoolColdCharacter":
      if (u && !u.exhausted && own(s, player).some((c) => c.id === u.id))
        choose(s, `Deadly Cold · ${name(u)}`, [
          ...(canExhaust(u)
            ? [
                {
                  id: "exhaust",
                  label: `Exhaust ${name(u)}`,
                  effects: [fx("exhaust", { target: u.id, player })],
                },
              ]
            : []),
          {
            id: "damage",
            label: `Deal 1 damage to ${name(u)}`,
            effects: [fx("damage", { target: u.id, player, value: 1 })],
          },
        ]);
      break;
    case "eredPoolOrcFlame": {
      const heroes = seatView(s, player).heroes;
      if (heroes.length)
        choose(
          s,
          "Orc of the Flame · Deal 2 damage to a hero you control",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("damage", { target: h.id, value: 2, player })],
          })),
        );
      break;
    }
    case "eredPoolPalisade": {
      const heroes = seatView(s, player).heroes.filter(
        (h) => h.exhausted && !cannotReady(h, s),
      );
      if (heroes.length)
        choose(
          s,
          "Wooden Palisade · Ready a hero you control",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("ready", { target: h.id, player })],
          })),
        );
      break;
    }
    case "eredPoolGate":
      if (u && s.staging.some((x) => x.id === u.id)) {
        u.resources++;
        if (u.resources >= 3 && discardLocation(s, u, true))
          log(s, "Town Gate has 3 resources and is discarded.");
      }
      break;
    case "eredPoolGiant": {
      const n = discardPlayerDeck(s, 5, player).filter(
        (code) => card(code).type_code === "ally",
      ).length;
      log(
        s,
        `Grey Mountain Giant discards the top 5 cards of Player ${player + 1}'s deck: ${n} ${n === 1 ? "ally" : "allies"}.`,
        n ? "danger" : undefined,
      );
      if (n) prepend(s, fx("eredPoolAssignDamage", { player, value: n }));
      break;
    }
    case "eredPoolEagle":
      if (u && s.staging.some((x) => x.id === u.id))
        forOwner(s, player, () => engage(s, u));
      break;
    case "eredPoolBear":
      if (u)
        choose(s, "Wilderland Bear · The first player must choose", [
          {
            id: "attack",
            label: "Wilderland Bear makes an immediate attack against you",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
          {
            id: "discard",
            label: "Each player discards 1 random card from their hand",
            effects: playerOrder(s).map((p) =>
              fx("eredPoolRandomDiscard", { player: p }),
            ),
          },
        ]);
      break;
    case "eredPoolRandomDiscard":
      forOwner(s, player, () => {
        if (!s.hand.length) return;
        const c = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, c.id, { encounterEffect: true });
      });
      break;
    case "eredPoolMoor": {
      // As Lightless Grotto: the treachery resolves through every scenario's
      // scripts, which return it to the discard pile.
      shuffleDiscard(s);
      const code = discardUntil(s, (c) => card(c).type_code === "treachery");
      if (code) placeEncounter(s, code, false, 0, undefined, true);
      break;
    }
    case "eredPoolSlopes":
      choose(s, "Slopes of Ered Mithrin · You may ready a character", [
        ...own(s, player)
          .filter((c) => c.exhausted && !cannotReady(c, s))
          .map((c) => ({
            id: c.id,
            code: c.code,
            label: `Ready ${name(c)}`,
            effects: [fx("ready", { target: c.id, player })],
          })),
        { id: "decline", label: "Do not ready a character", effects: [] },
      ]);
      break;
    case "eredPoolWeatherCharacter":
      if (u && !u.exhausted && own(s, player).some((c) => c.id === u.id))
        choose(s, `Harsh Weather · ${name(u)}`, [
          ...(canExhaust(u)
            ? [
                {
                  id: "exhaust",
                  label: `Exhaust ${name(u)}`,
                  effects: [fx("exhaust", { target: u.id, player })],
                },
              ]
            : []),
          {
            id: "threat",
            label: "Raise your threat by 1",
            effects: [fx("threat", { player, value: 1 })],
          },
        ]);
      break;
    case "eredPoolWildEngage": {
      // (An enemy the chapter forbids engaging, such as Dagnir, is no choice.)
      const list = s.staging.filter(
        (x) =>
          card(x.code).type_code === "enemy" &&
          !batch4Scenario(s).cannotEngage?.(s, x),
      );
      if (list.length)
        choose(
          s,
          "Wild Creatures · Choose an enemy in the staging area to engage",
          list.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("eredPoolWildEngageTake", { target: x.id, player })],
          })),
        );
      break;
    }
    case "eredPoolWildEngageTake":
      if (u && s.staging.some((x) => x.id === u.id)) {
        forOwner(s, player, () => engage(s, u));
        if (!s.staging.some((x) => x.id === u.id))
          q.wildEngaged = [...(q.wildEngaged ?? []), player];
      }
      break;
    case "eredPoolWildFinish": {
      const engaged = new Set(q.wildEngaged ?? []).size;
      delete q.wildEngaged;
      if (engaged >= playerOrder(s).length) break;
      const found = discardUntil(
        s,
        (c) => card(c).type_code === "enemy" && trait(c, "Creature"),
      );
      if (found) {
        add(s, found);
        log(s, `Wild Creatures adds ${card(found).name} to the staging area.`);
      }
      break;
    }
    case "eredPoolCreatureDen": {
      // Creature Den's Travel cost: shuffle the encounter discard pile into
      // the encounter deck, discard until an enemy, add it to the staging area.
      shuffleDiscard(s);
      const found = discardUntil(s, (c) => card(c).type_code === "enemy");
      if (found) {
        add(s, found);
        log(s, `Creature Den adds ${card(found).name} to the staging area.`);
      } else log(s, "Creature Den · No enemy was discarded.");
      break;
    }
    case "eredPoolSupplies": {
      const allies = own(s, player).filter(isAlly);
      choose(s, "Ruined Supplies · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${allies.length}`,
          effects: [fx("threat", { player, value: allies.length })],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each ally you control",
          effects: allies.map((c) =>
            fx("damage", { target: c.id, value: 1, player }),
          ),
        },
      ]);
      break;
    }
    case "eredPoolGloom": {
      const n = own(s, player).filter(isAlly).length;
      choose(s, "Gathering Gloom · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${n}`,
          effects: [fx("threat", { player, value: n })],
        },
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player })],
        },
      ]);
      break;
    }
    case "eredPoolUnseen": {
      const opts = characterOptions(
        s,
        player,
        fx("eredPoolUnseenTake"),
        (c) => c.committed,
      );
      if (opts.length)
        choose(s, "Unseen Danger · Remove a character from the quest", opts);
      else {
        const code = s.encounterDeck.shift();
        if (code) s.encounterDiscard.push(code);
      }
      break;
    }
    case "eredPoolUnseenTake": {
      const code = s.encounterDeck.shift();
      if (code) s.encounterDiscard.push(code);
      if (u) {
        u.committed = false;
        forOwner(s, player, () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
        if (code && (card(code).threat ?? 0) > stats(s, u).will)
          discardCharacter(s, u);
      }
      break;
    }
    case "eredPoolEyes": {
      const questers = own(s, player).filter((c) => c.committed);
      choose(s, "Eyes in the Dark · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${questers.length}`,
          effects: [fx("threat", { player, value: questers.length })],
        },
        ...questers.map((c) => ({
          id: c.id,
          code: c.code,
          label: `Discard ${name(c)}`,
          effects: [fx("eredPoolDiscardCharacter", { target: c.id, player })],
        })),
      ]);
      break;
    }
    case "eredPoolDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "eredPoolDiscardWholeHand":
      discardWholeHand(s, player);
      break;
    case "eredPoolDiscardHand": {
      if ((e.value ?? 1) <= 0) break;
      const hand = seatView(s, player).hand;
      if (hand.length)
        choose(
          s,
          `Discard ${e.value ?? 1} card${e.value === 1 ? "" : "s"} from your hand`,
          hand.map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [
              fx("eredPoolDiscardHandTake", { target: c.id, player }),
              fx("eredPoolDiscardHand", {
                player,
                value: (e.value ?? 1) - 1,
              }),
            ],
          })),
        );
      break;
    }
    case "eredPoolDiscardHandTake":
      forOwner(s, player, () => {
        const c = s.hand.find((c) => c.id === e.target);
        if (!c) return;
        if (c.code === W.lostWild && eredForeign(s, c.code)) {
          s.hand = s.hand.filter((v) => v.id !== c.id);
          s.encounterDiscard.push(c.code);
        } else discardHandCard(s, c.id);
      });
      break;
    case "eredPoolDiscardAlly": {
      const allies = own(s, player).filter(isAlly);
      if (allies.length)
        choose(
          s,
          "Choose an ally to discard",
          allies.map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [fx("eredPoolDiscardCharacter", { target: c.id, player })],
          })),
        );
      break;
    }
    case "eredPoolDiscardAttachment": {
      // (flag: Cursed Tower's "non-objective attachment".)
      const targets = own(s, player).flatMap((c) =>
        c.attachments
          .filter(
            (a) =>
              !a.facedown &&
              (!e.flag || !card(a.code).type_code.startsWith("objective")),
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name}`,
            effects: [
              fx("discardAttachment", { target: c.id, source: a.id, player }),
            ],
          })),
      );
      if (targets.length)
        choose(
          s,
          e.flag
            ? "Cursed Tower · Discard a non-objective attachment you control"
            : "Discard an attachment you control",
          targets,
        );
      break;
    }
    case "eredPoolStalkerShadow":
      // Crypt Stalker's shadow.
      choose(s, "Crypt Stalker · Choose one", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("threat", { player, value: 2 })],
        },
        ...(u
          ? [
              {
                id: "return",
                label: `Return ${name(u)} to the staging area`,
                effects: [fx("eredPoolReturnEnemy", { target: u.id, player })],
              },
            ]
          : []),
      ]);
      break;
    case "eredPoolReturnEnemy":
      if (u && allEngaged(s).some((x) => x.id === u.id)) {
        for (const p of playerOrder(s))
          forOwner(s, p, () => {
            s.engaged = s.engaged.filter((x) => x.id !== u.id);
          });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        log(s, `${name(u)} returns to the staging area.`);
      }
      break;
    case "eredPoolCrypt": {
      // Forgotten Crypt: an Undead enemy from the encounter deck, then a Loot
      // objective from the discard pile (none outside The Ghost of Framsburg).
      const code = discardUntil(
        s,
        (c) => card(c).type_code === "enemy" && trait(c, "Undead"),
      );
      if (!code) {
        log(
          s,
          "Forgotten Crypt · No Undead enemy is discarded from the encounter deck.",
        );
        break;
      }
      const enemy = add(s, code);
      log(
        s,
        `Forgotten Crypt adds ${name(enemy)} to the staging area.`,
        "danger",
      );
      if (!s.encounterDiscard.some((c) => ghostLoot(s, c)))
        log(
          s,
          "Forgotten Crypt · There is no Loot objective in the encounter discard pile.",
        );
      break;
    }
    case "eredPoolWeighedDiscard":
      if (u) {
        const other = u.attachments.filter(
          (a) =>
            a.code !== W.weighed &&
            !card(a.code).type_code.startsWith("objective"),
        );
        const targets = other.length
          ? other
          : u.attachments.filter((a) => a.code === W.weighed);
        if (targets.length)
          choose(
            s,
            "Weighed Down · Discard an attachment from this hero",
            targets.map((a) => ({
              id: a.id,
              code: a.code,
              label: card(a.code).name,
              effects: [
                fx("discardAttachment", { target: u.id, source: a.id, player }),
              ],
            })),
          );
      }
      break;
    case "eredPoolStrayEngage":
      if (u && s.staging.some((x) => x.id === u.id))
        forOwner(s, player, () => engage(s, u));
      break;
    case "eredPoolDiscardAdd": {
      const code = s.encounterDeck.shift();
      if (code) {
        if (card(code).type_code === e.text) add(s, code);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "eredPoolGrotto": {
      // "Resolve the 'when revealed' effect on that treachery": through every
      // scenario's scripts, which return it to the discard pile.
      const code = discardUntil(s, (c) => card(c).type_code === "treachery");
      if (code) placeEncounter(s, code, false, 0, undefined, true);
      break;
    }
    case "eredPoolHobgoblin":
      if (u)
        forOwner(s, player, () => {
          const code = s.deck.shift();
          if (!code) return;
          const physical = make(s, code);
          physical.owner = player;
          q.guarded.push({ guardId: u.id, player, card: physical });
          log(
            s,
            `Hobgoblin guards ${card(code).name} from the top of Player ${player + 1}'s deck.`,
            "danger",
          );
        });
      break;
    case "eredPoolPatrol": {
      const patrol = get(s, e.target);
      if (!patrol || !s.staging.some((x) => x.id === patrol.id)) break;
      const unguarded = s.staging.filter(
        (o) =>
          objectiveLocation(o) &&
          ![...enemies(s), ...locations(s)].some(
            (g) => g.guarding === o.id || g.cobasGuarding?.includes(o.id),
          ),
      );
      if (unguarded.length)
        choose(
          s,
          "Mirkwood Patrol · Guard an objective-location",
          unguarded.map((o) => ({
            id: o.id,
            code: o.code,
            label: name(o),
            effects: [
              fx("eredPoolPatrolGuard", { source: patrol.id, target: o.id }),
            ],
          })),
        );
      break;
    }
    case "eredPoolPatrolGuard": {
      const patrol = get(s, e.source);
      if (!patrol || !u || !s.staging.some((x) => x.id === patrol.id)) break;
      if (!patrol.guarding) patrol.guarding = u.id;
      else if (patrol.guarding !== u.id)
        patrol.cobasGuarding = [
          ...new Set([...(patrol.cobasGuarding ?? []), u.id]),
        ];
      break;
    }
    case "eredPoolCaptureEvent": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (!event) break;
      const lands = s.staging.filter((l) => foreignUnit(s, l, W.lonely));
      if (lands.length)
        choose(
          s,
          "Lonely Lands · Place this event facedown under a location",
          lands.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("eredPoolCaptureEventTake", {
                target: l.id,
                source: e.source,
                player: event.player,
              }),
            ],
          })),
        );
      break;
    }
    case "eredPoolCaptureEventTake": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (u && event) {
        event.destination = "spent";
        q.stored.push({
          locationId: u.id,
          player: event.player,
          cards: [event.unit],
        });
      }
      break;
    }
    case "eredPoolMineCost":
      forOwner(s, player, () => {
        s.discard.push(...s.deck.splice(0, 4));
      });
      break;
    case "eredPoolMineResponse": {
      const pile = seatView(s, player).discard;
      if (pile.length)
        choose(s, "Iron Hills Mine · Return a card from your discard pile?", [
          ...pile.map((code, i) => ({
            id: String(i),
            code,
            label: card(code).name,
            effects: [fx("eredPoolReturnDiscard", { player, value: i, code })],
          })),
          { id: "skip", label: "Decline", effects: [] },
        ]);
      break;
    }
    case "eredPoolReturnDiscard":
      forOwner(s, player, () => {
        if (s.discard[e.value!] === e.code)
          s.hand.push(make(s, s.discard.splice(e.value!, 1)[0]));
      });
      break;
    case "eredPoolDen":
      // Frightful Den: shuffle the discard pile in, then discard until X
      // enemies are discarded (X is the number of players).
      shuffleDiscard(s);
      for (const _p of playerOrder(s)) {
        const code = discardUntil(s, (c) => card(c).type_code === "enemy");
        if (code) add(s, code);
      }
      break;
    case "eredPoolLocationResponse":
      if (!q.usedResponses.includes(e.code!))
        choose(s, `${card(e.code!).name} · Use the group response?`, [
          {
            id: "use",
            label:
              e.code === W.armory
                ? "Each player may search for a Weapon or Armor"
                : "Each player may reduce threat, draw cards, or gain a resource",
            effects: [fx("eredPoolLocationUse", { code: e.code })],
          },
          { id: "skip", label: "Decline", effects: [] },
        ]);
      break;
    case "eredPoolLocationUse":
      q.usedResponses.push(e.code!);
      prepend(
        s,
        ...playerOrder(s).map((p) =>
          fx(e.code === W.armory ? "eredPoolArmory" : "eredPoolTreasury", {
            player: p,
          }),
        ),
      );
      break;
    case "eredPoolArmory": {
      const deck = seatView(s, player).deck;
      const options = deck.flatMap((code, i) =>
        card(code).type_code === "attachment" &&
        /\b(Weapon|Armor)\./.test(card(code).traits ?? "")
          ? [
              {
                id: String(i),
                code,
                label: card(code).name,
                effects: [fx("eredPoolSearchTake", { player, code, value: i })],
              },
            ]
          : [],
      );
      choose(s, "Lost Armory · Search your deck", [
        ...options,
        {
          id: "skip",
          label: "Decline",
          effects: [fx("eredPoolSearchShuffle", { player })],
        },
      ]);
      break;
    }
    case "eredPoolSearchTake":
      forOwner(s, player, () => {
        if (s.deck[e.value!] === e.code)
          s.hand.push(make(s, s.deck.splice(e.value!, 1)[0]));
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "eredPoolSearchShuffle":
      forOwner(s, player, () => {
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "eredPoolTreasury":
      choose(s, "Ancient Treasury · Choose a benefit", [
        {
          id: "threat",
          label: "Reduce your threat by 3",
          effects: [fx("threat", { player, value: -3 })],
        },
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { player, value: 2 })],
        },
        ...seatView(s, player).heroes.map((hero) => ({
          id: hero.id,
          code: hero.code,
          label: `Add 1 resource to ${card(hero.code).name}`,
          effects: [fx("resource", { target: hero.id, value: 1, player })],
        })),
        { id: "skip", label: "Decline", effects: [] },
      ]);
      break;
    case "eredPoolContested": {
      if (!u) break;
      const n = (s.victoryCards ?? []).filter(
        (c) => card(c).type_code === "location",
      ).length;
      const replace = deep(s, u);
      choose(s, "Contested Depths · Raise threat or enter a cave", [
        {
          id: "threat",
          label: `Raise each player's threat by ${n}`,
          effects: playerOrder(s).map((p) =>
            fx("threat", { player: p, value: n }),
          ),
        },
        ...(replace
          ? [
              {
                id: "replace",
                label:
                  "Discard Contested Depths and replace it with the top card of the Caves deck",
                effects: [replace],
              },
            ]
          : []),
      ]);
      break;
    }
    case "eredPoolForkResponse":
      choose(s, "Forked Passage · Look at the Caves deck?", [
        {
          id: "use",
          label:
            "Raise each player's threat by 2; choose the next cave; add Forked Passage to the victory display",
          effects: [
            ...playerOrder(s).map((p) => fx("threat", { player: p, value: 2 })),
            fx("eredPoolForkOrder"),
            // The deep keyword resolves after the Response.
            ...(e.flag && u ? [deep(s, u)!] : []),
            fx("eredPoolForkVictory", { target: e.target, code: e.code }),
          ],
        },
        {
          id: "skip",
          label: "Continue into the caves",
          effects: e.flag && u ? [deep(s, u)!] : [],
        },
      ]);
      break;
    case "eredPoolForkOrder": {
      const deck = cavesDeck(s);
      if (!deck || deck.length < 2) break;
      choose(
        s,
        "Caves deck · Choose the card to leave on top",
        deck.slice(0, 2).map((c, i) => ({
          id: c.id,
          code: c.code,
          label: `Keep ${card(c.code).name} on top`,
          effects: [fx("eredPoolForkReorder", { value: i })],
        })),
      );
      break;
    }
    case "eredPoolForkReorder": {
      const deck = cavesDeck(s),
        i = e.value ?? 0;
      if (deck && i < 2 && deck.length >= 2) {
        const pair = deck.splice(0, 2);
        deck.unshift(pair[i]);
        deck.push(pair[1 - i]);
      }
      break;
    }
    case "eredPoolForkVictory": {
      // Add Forked Passage to the victory display (from play, or from the
      // discard pile where its deep keyword put it).
      if (u && s.activeLocation?.id === u.id) s.activeLocation = null;
      else if (!u) {
        const i = s.encounterDiscard.lastIndexOf(e.code!);
        if (i < 0) break;
        s.encounterDiscard.splice(i, 1);
      } else break;
      s.victoryCards ??= [];
      s.victoryCards.push(e.code!);
      s.victory += card(e.code!).victory ?? 0;
      log(s, "Forked Passage is added to the victory display.");
      break;
    }
  }
  return true;
}

// ------------------------------------------------------------- abilities

const poolAbilityLabel = (code: string) =>
  code === W.hills ? "Exhaust a character to reduce threat" : undefined;
function poolAbilityProblem(s: GameState, u: Unit) {
  if (!foreignUnit(s, u, W.hills)) return null;
  return s.phase !== "quest"
    ? "Use Hills of Wilderland during the quest phase."
    : activeSeat(s) !== firstPlayer(s)
      ? "Only the first player can trigger this ability."
      : !own(s, firstPlayer(s)).some((c) => !c.exhausted)
        ? "Exhaust a ready character to pay this cost."
        : null;
}
function poolAbility(s: GameState, u: Unit) {
  if (!foreignUnit(s, u, W.hills)) return false;
  const p = activeSeat(s);
  const opts = characterOptions(
    s,
    p,
    fx("eredPoolHillsPay", { source: u.id }),
    (c) => !c.exhausted,
  );
  if (opts.length) choose(s, "Hills of Wilderland · Exhaust a character", opts);
  return true;
}
function poolHillsEffect(s: GameState, e: Effect) {
  if (e.kind === "eredPoolHillsPay") {
    const c = get(s, e.target);
    if (c)
      prepend(
        s,
        fx("exhaust", { target: c.id, player: e.player }),
        fx("eredPoolHillsReduce", { target: e.source, player: e.player }),
      );
    return true;
  }
  if (e.kind === "eredPoolHillsReduce") {
    const l = get(s, e.target);
    if (l) l.tempThreat = (l.tempThreat ?? 0) - 1;
    return true;
  }
  return false;
}

/** Pool effects a player resolves in their own seat (the rest run in the first player's). */
const PLAYER_EFFECTS = new Set([
  "eredPoolAssignDamage",
  "eredPoolGiant",
  "eredPoolRandomDiscard",
  "eredPoolWeatherCharacter",
  "eredPoolWildEngage",
  "eredPoolWildEngageTake",
  "eredPoolExhaust",
  "eredPoolColdCharacter",
  "eredPoolDiscardHand",
  "eredPoolDiscardAlly",
  "eredPoolDiscardAttachment",
  "eredPoolDiscardWholeHand",
  "eredPoolUnseen",
  "eredPoolEyes",
  "eredPoolStalkerShadow",
]);

export const ERED_POOL_HOOKS: Batch4ScenarioHooks = {
  stats: poolStats,
  threatBonus: poolThreatBonus,
  stagingThreat: poolStagingThreat,
  locationQuestBonus: poolLocationQuestBonus,
  locationProgressAmount: poolLocationProgressAmount,
  locationProgressBlocked: poolLocationProgressBlocked,
  cannotReady: poolCannotReady,
  cannotPlayerReady: poolCannotPlayerReady,
  cannotPlayerReadyCharacter: poolCannotPlayerReadyCharacter,
  characterBlanked: poolCharacterBlanked,
  willpowerOverride: poolWillpowerOverride,
  cannotCancel: poolCannotCancel,
  cannotOptionallyEngage: poolCannotOptionallyEngage,
  immune: poolImmune,
  cannotAttach: poolCannotAttach,
  damageAmount: poolDamageAmount,
  damageDealt: poolDamageDealt,
  engaged: poolEngaged,
  encounterBegin: poolEncounterBegin,
  endQuest: poolEndQuest,
  characterDestroyed: poolCharacterDestroyed,
  enemyAttackStarted: poolEnemyAttackStarted,
  shadowResolved: poolShadowResolved,
  attackFinished: poolAttackFinished,
  hostLeaves: poolHostLeaves,
  explored: poolExplored,
  travelProblem: poolTravelProblem,
  mustTravel: poolMustTravel,
  travelEffects: poolTravelEffects,
  travelEntered: poolTravelEntered,
  allyEntered: poolAllyEntered,
  eventPlayed: poolEventPlayed,
  playerCardPlayed: poolPlayerCardPlayed,
  characterReadied: poolCharacterReadied,
  revealedSurge: poolRevealSurge,
  cardEntered: poolCardEntered,
  committed: poolCommitted,
  encounterEnd: poolEncounterEnd,
  cannotDiscardHand: poolCannotDiscardHand,
  handDiscardDestination: poolHandDiscardDestination,
  locationProgressPlaced: poolLocationProgressPlaced,
  threatReduction: poolThreatReduction,
  enemyDestination: poolEnemyDestination,
  encounter: poolEncounter,
  shadow: poolShadow,
  effect: (s, e) => poolHillsEffect(s, e) || eredPoolEffect(s, e),
  abilityLabel: poolAbilityLabel,
  abilityProblem: poolAbilityProblem,
  ability: poolAbility,
  sharedEffect: (e) =>
    e.kind.startsWith("eredPool") && !PLAYER_EFFECTS.has(e.kind),
};

/**
 * The current chapter's hooks with the Campaign Pool's: passive values add
 * up, prohibitions combine, triggers run for both, and a card-keyed hook
 * goes to the pool first (it handles only foreign cards).
 */
export function composeEredPool(
  h: Batch4ScenarioHooks,
  p: Batch4ScenarioHooks = ERED_POOL_HOOKS,
): Batch4ScenarioHooks {
  return {
    ...h,
    stats: (s, u) => {
      const a = h.stats?.(s, u) ?? {},
        b = p.stats!(s, u);
      const out: ReturnType<NonNullable<Batch4ScenarioHooks["stats"]>> = {
        ...a,
      };
      for (const key of ["will", "attack", "defense", "health"] as const)
        if (b[key] !== undefined) out[key] = (out[key] ?? 0) + b[key]!;
      return out;
    },
    threatBonus: (s, u) => (h.threatBonus?.(s, u) ?? 0) + p.threatBonus!(s, u),
    stagingThreat: (s) => (h.stagingThreat?.(s) ?? 0) + p.stagingThreat!(s),
    locationQuestBonus: (s, u) =>
      (h.locationQuestBonus?.(s, u) ?? 0) + p.locationQuestBonus!(s, u),
    locationProgressAmount: (s, u, amount) =>
      p.locationProgressAmount!(
        s,
        u,
        h.locationProgressAmount
          ? h.locationProgressAmount(s, u, amount)
          : amount,
      ),
    locationProgressBlocked: (s, u) =>
      !!h.locationProgressBlocked?.(s, u) || p.locationProgressBlocked!(s, u),
    cannotReady: (s, u) => !!h.cannotReady?.(s, u) || p.cannotReady!(s, u),
    cannotPlayerReady: (s) =>
      !!h.cannotPlayerReady?.(s) || p.cannotPlayerReady!(s),
    cannotPlayerReadyCharacter: (s, u) =>
      !!h.cannotPlayerReadyCharacter?.(s, u) ||
      p.cannotPlayerReadyCharacter!(s, u),
    characterBlanked: (s, u) =>
      !!h.characterBlanked?.(s, u) || p.characterBlanked!(s, u),
    willpowerOverride: (s, u) =>
      h.willpowerOverride?.(s, u) ?? p.willpowerOverride!(s, u),
    cannotCancel: (s, shadow, code) =>
      !!h.cannotCancel?.(s, shadow, code) || p.cannotCancel!(s, shadow, code),
    cannotOptionallyEngage: (s, u) =>
      !!h.cannotOptionallyEngage?.(s, u) || p.cannotOptionallyEngage!(s, u),
    immune: (s, u) => !!h.immune?.(s, u) || p.immune!(s, u),
    cannotAttach: (s, u, code) =>
      !!h.cannotAttach?.(s, u, code) || p.cannotAttach!(s, u, code),
    damageAmount: (s, u, amount, context) =>
      p.damageAmount!(
        s,
        u,
        h.damageAmount ? h.damageAmount(s, u, amount, context) : amount,
        context,
      ),
    damageDealt: (s, u, amount, context) => {
      h.damageDealt?.(s, u, amount, context);
      p.damageDealt!(s, u, amount, context);
    },
    engaged: (s, u, optional, fromStaging) => {
      h.engaged?.(s, u, optional, fromStaging);
      p.engaged!(s, u, optional, fromStaging);
    },
    encounterBegin: (s) => {
      h.encounterBegin?.(s);
      p.encounterBegin!(s);
    },
    endQuest: (s) => {
      h.endQuest?.(s);
      p.endQuest!(s);
    },
    characterDestroyed: (s, u, context) => {
      h.characterDestroyed?.(s, u, context);
      p.characterDestroyed!(s, u, context);
    },
    enemyAttackStarted: (s, u, player) => {
      h.enemyAttackStarted?.(s, u, player);
      p.enemyAttackStarted!(s, u, player);
    },
    shadowResolved: (s, u, code) => {
      h.shadowResolved?.(s, u, code);
      p.shadowResolved!(s, u, code);
    },
    attackFinished: (s, combat, skipped) => [
      ...(h.attackFinished?.(s, combat, skipped) ?? []),
      ...p.attackFinished!(s, combat, skipped),
    ],
    hostLeaves: (s, u, defeated) => {
      h.hostLeaves?.(s, u, defeated);
      p.hostLeaves!(s, u, defeated);
    },
    explored: (s, u, wasActive) => {
      h.explored?.(s, u, wasActive);
      p.explored!(s, u, wasActive);
    },
    travelProblem: (s, u) => h.travelProblem?.(s, u) ?? p.travelProblem!(s, u),
    mustTravel: (s) => !!h.mustTravel?.(s) || p.mustTravel!(s),
    travelEffects: (s, u) => h.travelEffects?.(s, u) ?? p.travelEffects!(s, u),
    travelEntered: (s, u, actual) => {
      h.travelEntered?.(s, u, actual);
      p.travelEntered!(s, u, actual);
    },
    allyEntered: (s, u, played, fromHand) => {
      const a = !!h.allyEntered?.(s, u, played, fromHand);
      return p.allyEntered!(s, u, played, fromHand) || a;
    },
    eventPlayed: (s, u) => {
      h.eventPlayed?.(s, u);
      p.eventPlayed!(s, u);
    },
    playerCardPlayed: (s, u, fromHand) => {
      h.playerCardPlayed?.(s, u, fromHand);
      p.playerCardPlayed!(s, u, fromHand);
    },
    characterReadied: (s, u) => {
      h.characterReadied?.(s, u);
      p.characterReadied!(s, u);
    },
    revealedSurge: (s, code) =>
      !!h.revealedSurge?.(s, code) || p.revealedSurge!(s, code),
    cardEntered: (s, u, fromReveal, cancelled) => {
      h.cardEntered?.(s, u, fromReveal, cancelled);
      p.cardEntered!(s, u, fromReveal, cancelled);
    },
    committed: (s) => {
      h.committed?.(s);
      p.committed!(s);
    },
    encounterEnd: (s) => [
      ...(h.encounterEnd?.(s) ?? []),
      ...p.encounterEnd!(s),
    ],
    cannotDiscardHand: (s, u, byPlayerCardEffect) =>
      !!h.cannotDiscardHand?.(s, u, byPlayerCardEffect) ||
      p.cannotDiscardHand!(s, u, byPlayerCardEffect),
    handDiscardDestination: (s, u) =>
      p.handDiscardDestination!(s, u) || !!h.handDiscardDestination?.(s, u),
    locationProgressPlaced: (s, u, amount) => {
      h.locationProgressPlaced?.(s, u, amount);
      p.locationProgressPlaced!(s, u, amount);
    },
    threatReduction: (s, amount, reason, source) =>
      p.threatReduction!(
        s,
        h.threatReduction
          ? h.threatReduction(s, amount, reason, source)
          : amount,
        reason,
        source,
      ),
    enemyDestination: (s, u, destruction, wasEngaged) =>
      !!h.enemyDestination?.(s, u, destruction, wasEngaged) ||
      p.enemyDestination!(s, u, destruction, wasEngaged),
    encounter: (s, code, replay, fromReveal) =>
      p.encounter!(s, code, replay, fromReveal) ||
      !!h.encounter?.(s, code, replay, fromReveal),
    shadow: (s, code) => p.shadow!(s, code) || !!h.shadow?.(s, code),
    effect: (s, e) => p.effect!(s, e) || !!h.effect?.(s, e),
    abilityLabel: (code) => h.abilityLabel?.(code) ?? p.abilityLabel!(code),
    abilityProblem: (s, u, attachmentId) => {
      const own = p.abilityProblem!(s, u, attachmentId);
      if (own !== undefined && own !== null) return own;
      // An ability only the layer names answers to the layer alone (a
      // Nightmare location's Action in a scenario whose own hooks refuse
      // the cards they do not know).
      const code = attachmentId
        ? u.attachments.find((a) => a.id === attachmentId)?.code
        : u.code;
      if (code && p.abilityLabel?.(code) && !h.abilityLabel?.(code))
        return null;
      return h.abilityProblem?.(s, u, attachmentId) ?? null;
    },
    ability: (s, u, attachmentId) =>
      p.ability!(s, u, attachmentId) || !!h.ability?.(s, u, attachmentId),
    // Hooks only a Nightmare Deck's layer defines (the Campaign Pool's
    // layer leaves them out).
    revealedDoomed: (s, code, revealOrigin) =>
      (h.revealedDoomed?.(s, code, revealOrigin) ?? 0) +
      (p.revealedDoomed?.(s, code, revealOrigin) ?? 0),
    combatBegin: (s) => {
      h.combatBegin?.(s);
      p.combatBegin?.(s);
    },
    check: (s) => {
      h.check?.(s);
      p.check?.(s);
    },
    indestructible: (s, u) =>
      !!h.indestructible?.(s, u) || !!p.indestructible?.(s, u),
    cannotAttack: (s, character, enemy) =>
      !!h.cannotAttack?.(s, character, enemy) ||
      !!p.cannotAttack?.(s, character, enemy),
    cannotDefend: (s, enemy, defender) =>
      !!h.cannotDefend?.(s, enemy, defender) ||
      !!p.cannotDefend?.(s, enemy, defender),
    roundEnd: (s) => [...(h.roundEnd?.(s) ?? []), ...(p.roundEnd?.(s) ?? [])],
    combatEnd: (s) => {
      h.combatEnd?.(s);
      p.combatEnd?.(s);
    },
    failedQuest: (s, amount) => {
      const handled = !!h.failedQuest?.(s, amount);
      return !!p.failedQuest?.(s, amount) || handled;
    },
    missingHeroAllowed: (s, player) =>
      !!h.missingHeroAllowed?.(s, player) ||
      !!p.missingHeroAllowed?.(s, player),
    cannotDraw: (s) => !!h.cannotDraw?.(s) || !!p.cannotDraw?.(s),
    resourceStart: (s) => [
      ...(h.resourceStart?.(s) ?? []),
      ...(p.resourceStart?.(s) ?? []),
    ],
    refreshEndForced: (s) => [
      ...(h.refreshEndForced?.(s) ?? []),
      ...(p.refreshEndForced?.(s) ?? []),
    ],
    refreshStart: (s) => [
      ...(h.refreshStart?.(s) ?? []),
      ...(p.refreshStart?.(s) ?? []),
    ],
    attachmentLeaves: (s, host, attachment, leaving) =>
      !!p.attachmentLeaves?.(s, host, attachment, leaving) ||
      !!h.attachmentLeaves?.(s, host, attachment, leaving),
    stageInfo: (s) => p.stageInfo?.(s) ?? h.stageInfo?.(s),
    questBegin: (s) => [
      ...(h.questBegin?.(s) ?? []),
      ...(p.questBegin?.(s) ?? []),
    ],
    questProgressPlaced: (s, quest, amount) => {
      h.questProgressPlaced?.(s, quest, amount);
      p.questProgressPlaced?.(s, quest, amount);
    },
    cannotReduceThreat: (s) =>
      !!h.cannotReduceThreat?.(s) || !!p.cannotReduceThreat?.(s),
    cannotHeal: (s, u) => !!h.cannotHeal?.(s, u) || !!p.cannotHeal?.(s, u),
    healLimit: (s, u, source) => {
      const a = h.healLimit?.(s, u, source),
        b = p.healLimit?.(s, u, source);
      return a === undefined ? b : b === undefined ? a : Math.min(a, b);
    },
    healed: (s, u, amount, source) => {
      h.healed?.(s, u, amount, source);
      p.healed?.(s, u, amount, source);
    },
    revealed: (s, code, origin) => {
      h.revealed?.(s, code, origin);
      p.revealed?.(s, code, origin);
    },
    losesKeyword: (s, u, keyword) =>
      !!h.losesKeyword?.(s, u, keyword) || !!p.losesKeyword?.(s, u, keyword),
    charactersCommitted: (s, units) => {
      h.charactersCommitted?.(s, units);
      p.charactersCommitted?.(s, units);
    },
    cannotLeave: (s, u, destruction) =>
      !!h.cannotLeave?.(s, u, destruction) ||
      !!p.cannotLeave?.(s, u, destruction),
    escapeDifficulty: (s) =>
      (h.escapeDifficulty?.(s) ?? 0) + (p.escapeDifficulty?.(s) ?? 0),
    escapeCommitLimit: (s, player) => {
      const a = h.escapeCommitLimit?.(s, player),
        b = p.escapeCommitLimit?.(s, player);
      return a === undefined ? b : b === undefined ? a : Math.min(a, b);
    },
    escapeCommitted: (s, u) => {
      h.escapeCommitted?.(s, u);
      p.escapeCommitted?.(s, u);
    },
    escapeResolved: (s, escape, passed) =>
      !!h.escapeResolved?.(s, escape, passed) ||
      !!p.escapeResolved?.(s, escape, passed),
    gollumTokens: (s, amount) =>
      !!h.gollumTokens?.(s, amount) || !!p.gollumTokens?.(s, amount),
    guardLocked: (s) => !!h.guardLocked?.(s) || !!p.guardLocked?.(s),
    guardTargetsEveryone: (s) =>
      !!h.guardTargetsEveryone?.(s) || !!p.guardTargetsEveryone?.(s),
    guardChanged: (s, from, to) => {
      h.guardChanged?.(s, from, to);
      p.guardChanged?.(s, from, to);
    },
    stageRevealed: (s, stage) => {
      h.stageRevealed?.(s, stage);
      p.stageRevealed?.(s, stage);
    },
    stageEffects: (s, stage) =>
      h.stageEffects?.(s, stage) ?? p.stageEffects?.(s, stage),
    stageDefeated: (s) => h.stageDefeated?.(s) ?? p.stageDefeated?.(s),
    attachmentExhausted: (s, u, a) => [
      ...(h.attachmentExhausted?.(s, u, a) ?? []),
      ...(p.attachmentExhausted?.(s, u, a) ?? []),
    ],
    noEngagementCheck: (s, u) =>
      !!h.noEngagementCheck?.(s, u) || !!p.noEngagementCheck?.(s, u),
    progress: (s, amount, quest) => {
      const a = h.progress ? h.progress(s, amount, quest) : amount;
      return p.progress ? p.progress(s, a, quest) : a;
    },
    dynamicTraits: (s, u) => [
      ...(h.dynamicTraits?.(s, u) ?? []),
      ...(p.dynamicTraits?.(s, u) ?? []),
    ],
    engagementBonus: (s, u) =>
      (h.engagementBonus?.(s, u) ?? 0) + (p.engagementBonus?.(s, u) ?? 0),
    ringBearerCancelled: (s, code) => {
      h.ringBearerCancelled?.(s, code);
      p.ringBearerCancelled?.(s, code);
    },
    planningBegin: (s) => {
      h.planningBegin?.(s);
      p.planningBegin?.(s);
    },
    oneRingExhausted: (s) => {
      h.oneRingExhausted?.(s);
      p.oneRingExhausted?.(s);
    },
    hideWillpower: (s, u) =>
      (h.hideWillpower?.(s, u) ?? 0) + (p.hideWillpower?.(s, u) ?? 0),
    hideValueBonus: (s, player) =>
      (h.hideValueBonus?.(s, player) ?? 0) +
      (p.hideValueBonus?.(s, player) ?? 0),
    hideThreatBonus: (s, player) =>
      (h.hideThreatBonus?.(s, player) ?? 0) +
      (p.hideThreatBonus?.(s, player) ?? 0),
    hidePassed: (s, player, source) => [
      ...(h.hidePassed?.(s, player, source) ?? []),
      ...(p.hidePassed?.(s, player, source) ?? []),
    ],
    hideFailed: (s, player, source) => [
      ...(h.hideFailed?.(s, player, source) ?? []),
      ...(p.hideFailed?.(s, player, source) ?? []),
    ],
    hideCommitLimit: (s, player) => {
      const a = h.hideCommitLimit?.(s, player),
        b = p.hideCommitLimit?.(s, player);
      return a === undefined ? b : b === undefined ? a : Math.min(a, b);
    },
    enemyEntered: (s, u) => {
      h.enemyEntered?.(s, u);
      p.enemyEntered?.(s, u);
    },
    replaceDamage: (s, u, amount, context) =>
      !!h.replaceDamage?.(s, u, amount, context) ||
      !!p.replaceDamage?.(s, u, amount, context),
    winningStage: (s, code) =>
      !!h.winningStage?.(s, code) || !!p.winningStage?.(s, code),
    bypass: (s) => p.bypass?.(s) ?? h.bypass?.(s),
    questBypassed: (s, code) => [
      ...(h.questBypassed?.(s, code) ?? []),
      ...(p.questBypassed?.(s, code) ?? []),
    ],
    abilityOncePerRound: (s, code) =>
      !!h.abilityOncePerRound?.(s, code) || !!p.abilityOncePerRound?.(s, code),
    consideredEngaged: (s, u, player) =>
      !!h.consideredEngaged?.(s, u, player) ||
      !!p.consideredEngaged?.(s, u, player),
    advance: (s) => !!h.advance?.(s) || !!p.advance?.(s),
    cannotEngage: (s, u) =>
      !!h.cannotEngage?.(s, u) || !!p.cannotEngage?.(s, u),
    cannotCommit: (s, u) =>
      !!h.cannotCommit?.(s, u) || !!p.cannotCommit?.(s, u),
    lostSources: (s) => [
      ...(h.lostSources?.(s) ?? []),
      ...(p.lostSources?.(s) ?? []),
    ],
    lostResolve: (s, id) =>
      !!h.lostResolve?.(s, id) || !!p.lostResolve?.(s, id),
    playCostReduction: (s, c) =>
      (h.playCostReduction?.(s, c) ?? 0) + (p.playCostReduction?.(s, c) ?? 0),
    whenRevealedCancelled: (s, code) => {
      h.whenRevealedCancelled?.(s, code);
      p.whenRevealedCancelled?.(s, code);
    },
    locationControlled: (s, u, player) => {
      h.locationControlled?.(s, u, player);
      p.locationControlled?.(s, u, player);
    },
    hiddenCardTurned: (s, u, player) => {
      h.hiddenCardTurned?.(s, u, player);
      p.hiddenCardTurned?.(s, u, player);
    },
    cannotWin: (s) => !!h.cannotWin?.(s) || !!p.cannotWin?.(s),
    // An explored location goes where the scenario sends it first, then the layer.
    locationDestination: (s, u) =>
      !!h.locationDestination?.(s, u) || !!p.locationDestination?.(s, u),
    questDiscard: (s, code) =>
      !!h.questDiscard?.(s, code) || !!p.questDiscard?.(s, code),
    attachmentCannotReady: (s, host, a) =>
      !!h.attachmentCannotReady?.(s, host, a) ||
      !!p.attachmentCannotReady?.(s, host, a),
    cannotAdvanceStage: (s, stage) =>
      !!h.cannotAdvanceStage?.(s, stage) || !!p.cannotAdvanceStage?.(s, stage),
    cannotDefeatStage: (s, stage) =>
      !!h.cannotDefeatStage?.(s, stage) || !!p.cannotDefeatStage?.(s, stage),
    questProgressRemoved: (s, amount) => {
      h.questProgressRemoved?.(s, amount);
      p.questProgressRemoved?.(s, amount);
    },
    cardsDrawnForced: (s, player) => [
      ...(h.cardsDrawnForced?.(s, player) ?? []),
      ...(p.cardsDrawnForced?.(s, player) ?? []),
    ],
    cannotBeActiveLocation: (s, u) =>
      !!h.cannotBeActiveLocation?.(s, u) || !!p.cannotBeActiveLocation?.(s, u),
    enemyTimeRemoved: (s, u, count) => {
      h.enemyTimeRemoved?.(s, u, count);
      p.enemyTimeRemoved?.(s, u, count);
    },
    questTimeRemoved: (s, count) => [
      ...(h.questTimeRemoved?.(s, count) ?? []),
      ...(p.questTimeRemoved?.(s, count) ?? []),
    ],
    scourCodes: (s, fromDiscard) => [
      ...(h.scourCodes?.(s, fromDiscard) ?? []),
      ...(p.scourCodes?.(s, fromDiscard) ?? []),
    ],
    scourEffects: (s) => [
      ...(h.scourEffects?.(s) ?? []),
      ...(p.scourEffects?.(s) ?? []),
    ],
    locationDamaged: (s, u, amount) => {
      h.locationDamaged?.(s, u, amount);
      p.locationDamaged?.(s, u, amount);
    },
    secondDeckCodes: (s) => [
      ...(h.secondDeckCodes?.(s) ?? []),
      ...(p.secondDeckCodes?.(s) ?? []),
    ],
    playerDiscardBlocked: (s, u) =>
      !!h.playerDiscardBlocked?.(s, u) || !!p.playerDiscardBlocked?.(s, u),
    discardCardKept: (s, code) =>
      !!h.discardCardKept?.(s, code) || !!p.discardCardKept?.(s, code),
    stageCandidates: (s, stage, printed) =>
      p.stageCandidates?.(s, stage, printed) ??
      h.stageCandidates?.(s, stage, printed),
    cardsDrawn: (s, player, count, cardEffect) => {
      h.cardsDrawn?.(s, player, count, cardEffect);
      p.cardsDrawn?.(s, player, count, cardEffect);
    },
    playProblem: (s, code) =>
      h.playProblem?.(s, code) ?? p.playProblem?.(s, code) ?? null,
    outOfPlayDiscarded: (s, player, count) => {
      h.outOfPlayDiscarded?.(s, player, count);
      p.outOfPlayDiscarded?.(s, player, count);
    },
    progressRemovalReplaced: (s, stage) =>
      !!h.progressRemovalReplaced?.(s, stage) ||
      !!p.progressRemovalReplaced?.(s, stage),
    burgleFailed: (s) => {
      h.burgleFailed?.(s);
      p.burgleFailed?.(s);
    },
    planningEnd: (s) => {
      h.planningEnd?.(s);
      p.planningEnd?.(s);
    },
    setupFollowUp: (s) => [
      ...(h.setupFollowUp?.(s) ?? []),
      ...(p.setupFollowUp?.(s) ?? []),
    ],
    defendersDeclared: (s, enemy, defenders) => [
      ...(h.defendersDeclared?.(s, enemy, defenders) ?? []),
      ...(p.defendersDeclared?.(s, enemy, defenders) ?? []),
    ],
    beforeDestroy: (s, u, destruction, context) =>
      !!h.beforeDestroy?.(s, u, destruction, context) ||
      !!p.beforeDestroy?.(s, u, destruction, context),
    archeryBonus: (s) =>
      (h.archeryBonus?.(s) ?? 0) + (p.archeryBonus?.(s) ?? 0),
    unitArchery: (s, u) =>
      (h.unitArchery?.(s, u) ?? 0) + (p.unitArchery?.(s, u) ?? 0),
    toughnessBonus: (s, u) =>
      (h.toughnessBonus?.(s, u) ?? 0) + (p.toughnessBonus?.(s, u) ?? 0),
    areaArchery: (s, area) =>
      (h.areaArchery?.(s, area) ?? 0) + (p.areaArchery?.(s, area) ?? 0),
    abilitiesBlocked: (s, player) =>
      !!h.abilitiesBlocked?.(s, player) || !!p.abilitiesBlocked?.(s, player),
    resourcesSpent: (s, hero, amount) => {
      h.resourcesSpent?.(s, hero, amount);
      p.resourcesSpent?.(s, hero, amount);
    },
    archeryTargets: (s, characters, last) => {
      const own = h.archeryTargets?.(s, characters, last) ?? characters;
      return p.archeryTargets?.(s, own, last) ?? own;
    },
    // A layer's switched quest keyword (Savage Fray) takes precedence.
    questStat: (s) => p.questStat?.(s) ?? h.questStat?.(s),
    shadowDraw: (s, u) => {
      const code = h.shadowDraw?.(s, u);
      return code !== undefined ? code : p.shadowDraw?.(s, u);
    },
    namelessFed: (s, u, player) => {
      h.namelessFed?.(s, u, player);
      p.namelessFed?.(s, u, player);
    },
    shadowDealt: (s, u, code) => {
      h.shadowDealt?.(s, u, code);
      p.shadowDealt?.(s, u, code);
    },
    victoryValue: (s, code) =>
      p.victoryValue?.(s, code) ?? h.victoryValue?.(s, code),
    willpowerGainBlocked: (s, u) =>
      !!h.willpowerGainBlocked?.(s, u) || !!p.willpowerGainBlocked?.(s, u),
    cannotCollectResources: (s, hero) =>
      !!h.cannotCollectResources?.(s, hero) ||
      !!p.cannotCollectResources?.(s, hero),
    locationProgressCapacity: (s, u) => {
      const a = h.locationProgressCapacity?.(s, u),
        b = p.locationProgressCapacity?.(s, u);
      return a === undefined ? b : b === undefined ? a : Math.min(a, b);
    },
    sideDefeated: (s, u) => {
      h.sideDefeated?.(s, u);
      p.sideDefeated?.(s, u);
    },
    shadowCancelled: (s, code) => {
      h.shadowCancelled?.(s, code);
      p.shadowCancelled?.(s, code);
    },
    readyIntercepted: (s, u, cardEffect) =>
      !!h.readyIntercepted?.(s, u, cardEffect) ||
      !!p.readyIntercepted?.(s, u, cardEffect),
    sideDefeatBlocked: (s, u) =>
      !!h.sideDefeatBlocked?.(s, u) || !!p.sideDefeatBlocked?.(s, u),
    sideQuestGoalBonus: (s, quest) =>
      (h.sideQuestGoalBonus?.(s, quest) ?? 0) +
      (p.sideQuestGoalBonus?.(s, quest) ?? 0),
    mainQuestGoalBonus: (s) =>
      (h.mainQuestGoalBonus?.(s) ?? 0) + (p.mainQuestGoalBonus?.(s) ?? 0),
    cardsCaptured: (s, host, count) => {
      h.cardsCaptured?.(s, host, count);
      p.cardsCaptured?.(s, host, count);
    },
    cardsRescued: (s, source, count, player) => {
      h.cardsRescued?.(s, source, count, player);
      p.cardsRescued?.(s, source, count, player);
    },
    rescueDestination: (s, source, u) =>
      !!p.rescueDestination?.(s, source, u) ||
      !!h.rescueDestination?.(s, source, u),
  };
}

// ------------------------------------------------------------- saves

/** Physical cards held by the Campaign Pool's foreign cards. */
export const eredPoolUnits = (s: GameState): Unit[] => [
  ...(s.eredPool?.guarded.map((g) => g.card) ?? []),
  ...(s.eredPool?.stored.flatMap((g) => g.cards) ?? []),
];
export function validEredPool(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.eredPool;
  if (q === undefined) return true;
  const seats = s.table?.seats.length ?? 1;
  const player = (p: unknown) =>
    Number.isInteger(p) && (p as number) >= 0 && (p as number) < seats;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const phase = (m: { round: number; phase: string }) =>
    !!m && round(m.round) && typeof m.phase === "string";
  return (
    !!q &&
    // (A seat's own view is validated outside campaign mode.)
    s.scenarioId in NATIVE &&
    [
      q.resolving,
      q.guarded,
      q.stored,
      q.noReady,
      q.noDamage,
      q.locationProgress,
      q.vastness,
      q.darkPlaces,
      q.usedResponses,
    ].every(Array.isArray) &&
    q.resolving.every((c) => TREACHERIES.includes(c)) &&
    q.guarded.every(
      (g) =>
        !!g &&
        typeof g.guardId === "string" &&
        player(g.player) &&
        validUnit(g.card),
    ) &&
    q.stored.every(
      (g) =>
        !!g &&
        typeof g.locationId === "string" &&
        player(g.player) &&
        Array.isArray(g.cards) &&
        g.cards.every(validUnit),
    ) &&
    q.noReady.every((m) => !!m && typeof m.id === "string" && round(m.round)) &&
    q.noDamage.every((m) => !!m && typeof m.id === "string" && phase(m)) &&
    q.locationProgress.every(
      (m) =>
        !!m &&
        typeof m.id === "string" &&
        round(m.round) &&
        Number.isInteger(m.amount) &&
        m.amount >= 0,
    ) &&
    [...q.vastness, ...q.darkPlaces].every(
      (m) => phase(m) && Number.isInteger(m.amount) && m.amount >= 0,
    ) &&
    q.usedResponses.every((c) => [W.armory, W.treasury].includes(c)) &&
    new Set(q.usedResponses).size === q.usedResponses.length &&
    (q.playerReadyBlockedRound === undefined ||
      round(q.playerReadyBlockedRound)) &&
    (q.wildEngaged === undefined ||
      (Array.isArray(q.wildEngaged) && q.wildEngaged.every(player))) &&
    (q.shadows === undefined ||
      (Array.isArray(q.shadows) &&
        q.shadows.every(
          (m) =>
            !!m &&
            typeof m.id === "string" &&
            round(m.round) &&
            Number.isInteger(m.amount) &&
            m.amount > 0,
        ))) &&
    (q.noPlayerReady === undefined ||
      (Array.isArray(q.noPlayerReady) &&
        q.noPlayerReady.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        ))) &&
    (q.threatReduced === undefined ||
      (Array.isArray(q.threatReduced) &&
        q.threatReduced.every(
          (m) =>
            !!m &&
            player(m.player) &&
            round(m.round) &&
            Number.isInteger(m.amount) &&
            m.amount >= 0,
        )))
  );
}
/** The pool's visible state: Lonely Lands' facedown events are counted. */
export const eredPoolPublicState = (s: GameState) =>
  s.eredPool
    ? {
        eredPool: {
          ...s.eredPool,
          stored: s.eredPool.stored.map((g) => ({
            locationId: g.locationId,
            player: g.player,
            count: g.cards.length,
          })),
        },
      }
    : {};
