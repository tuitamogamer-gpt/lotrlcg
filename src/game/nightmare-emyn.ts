/**
 * The Hills of Emyn Muil's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rule and Nightmare encounter cards, composed with the scenario's own
 * rules through batch4Scenario while a Nightmare mode game is played.
 * Effects use the "nem" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  random,
  shuffle,
  threatOf,
} from "./core";
import { engage, raiseThreat } from "./board";
import { returnToStaging } from "./black-riders-hunted";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { NIGHTMARE_SOM as G, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  live,
  seatLabel,
  several,
  state,
  traitOf,
} from "./nightmare-core";

/** Lasting effects of The Hills of Emyn Muil's Nightmare cards. */
export interface NightmareEmynState {
  /** Progress placed on each location in the staging area this round (the setup card's limit). */
  emynProgress?: { id: string; round: number; amount: number }[];
  /** The characters Brambles and Thorns dealt damage to this round. */
  brambles?: { round: number; ids: string[] };
  /** Blast of Savage Wind: Emyn Muil locations with +2 [threat] until the end of the round (one entry for each Blast). */
  blast?: { id: string; round: number }[];
}

const emynLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "hills-of-emyn-muil";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
const emynMuilLocations = (s: GameState) =>
  locationsInPlay(s).filter((u) => traitOf(u.code, "Emyn Muil"));
const inPlay = (s: GameState) => [...s.staging, ...allEngaged(s)];
const hazard = (code: string) => traitOf(code, "Hazard");

// ------------------------------------------------------------- the setup card

/** "No more than 1 progress may be placed on each location in the staging area each round." */
function emynCapacity(s: GameState, u: Unit) {
  if (!emynLive(s) || !isLocation(u) || !inStaging(s, u)) return undefined;
  const placed =
    s.nightmare?.emynProgress?.find((m) => m.id === u.id && m.round === s.round)
      ?.amount ?? 0;
  return Math.max(0, 1 - placed);
}
function emynProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!emynLive(s) || amount <= 0 || !isLocation(u) || !inStaging(s, u)) return;
  const q = state(s);
  const rows = (q.emynProgress ?? []).filter((m) => m.round === s.round);
  const row = rows.find((m) => m.id === u.id);
  if (row) row.amount += amount;
  else rows.push({ id: u.id, round: s.round, amount });
  q.emynProgress = rows;
}

// ------------------------------------------------------------- passives

function emynStats(s: GameState, u: Unit) {
  // Orc Interceptor: "+1 [threat] and +1 [attack] for each resource token on
  // it."
  if (!emynLive(s) || !live(s, u, G.interceptor) || !u.resources) return {};
  return { attack: u.resources };
}
function emynThreatBonus(s: GameState, u: Unit) {
  if (!emynLive(s)) return 0;
  if (live(s, u, G.interceptor)) return u.resources;
  // Blast of Savage Wind: "Each Emyn Muil location gets +2 [threat] until the
  // end of the round."
  return (
    2 *
    (s.nightmare?.blast?.filter((m) => m.id === u.id && m.round === s.round)
      .length ?? 0)
  );
}
/** Sarn Gebir Rapids: "While it is the active location, the "when revealed" effects of Hazard cards cannot be canceled." */
const emynCannotCancel = (s: GameState, shadow?: boolean, code?: string) =>
  emynLive(s) &&
  !shadow &&
  !!code &&
  hazard(code) &&
  allActiveLocations(s).some((u) => live(s, u, G.rapids));
/**
 * Brambles and Thorns: "Forced: After a character commits to the quest, deal
 * 1 damage to that character if it has not been dealt damage by another copy
 * of Brambles and Thorns this round."
 */
function emynCommitted(s: GameState, units: Unit[]) {
  if (!emynLive(s) || !locationsInPlay(s).some((u) => live(s, u, G.brambles)))
    return;
  const q = state(s);
  const hit = q.brambles?.round === s.round ? q.brambles.ids : [];
  const fresh = units.filter((u) => !hit.includes(u.id));
  if (!fresh.length) return;
  q.brambles = { round: s.round, ids: [...hit, ...fresh.map((u) => u.id)] };
  log(
    s,
    `Brambles and Thorns: ${fresh.map(name).join(", ")} ${fresh.length === 1 ? "takes" : "take"} 1 damage after committing to the quest.`,
    "danger",
  );
  prepend(
    s,
    ...fresh.map((u) =>
      fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
    ),
  );
}
/** Orc Interceptor: "Forced: After a location leaves play as an explored location, place a resource token on Orc Interceptor." */
function emynExplored(s: GameState) {
  if (!emynLive(s)) return;
  const orcs = inPlay(s).filter((u) => live(s, u, G.interceptor));
  for (const u of orcs) u.resources += 1;
  if (orcs.length)
    log(
      s,
      `Orc Interceptor: a resource token is placed on each copy in play (${orcs.length}).`,
      "danger",
    );
}
/** Tunneling Nameless Thing: "Forced: After the players travel to a location, Tunneling Nameless Thing engages the first player." */
function emynTravelEntered(s: GameState, _u: Unit, actualTravel: boolean) {
  if (!emynLive(s) || !actualTravel) return;
  const p = firstPlayer(s);
  for (const u of inPlay(s).filter((x) => live(s, x, G.tunneling))) {
    if (allEngaged(s).some((x) => x.id === u.id) && ownerOf(s, u) === p)
      continue;
    forOwner(s, p, () => engage(s, u));
    log(
      s,
      `Tunneling Nameless Thing engages ${several(s) ? seatName(s, p) : "you"} after the travel.`,
      "danger",
    );
  }
}
/** Tunneling Nameless Thing: "If there is no active location, return Tunneling Nameless Thing to the staging area." */
function emynCheck(s: GameState) {
  if (!emynLive(s) || s.phase === "setup" || allActiveLocations(s).length)
    return;
  for (const u of allEngaged(s).filter((x) => live(s, x, G.tunneling)))
    if (!s.combat || s.combat.enemyId !== u.id) returnToStaging(s, u);
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [G.hurrying, G.blast, G.hazardous, G.retraced];
function emynEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!emynLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // A Hurrying Darkness: "Each player must either increase his threat by 5,
  // or reveal an additional encounter card from the encounter deck and add
  // it to the staging area."
  if (code === G.hurrying)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("nemHurrying", { player })),
    );
  // Blast of Savage Wind: "Remove all progress from each Emyn Muil location
  // in play. Each Emyn Muil location gets +2 [threat] until the end of the
  // round."
  else if (code === G.blast) {
    clearProgress(s, "Blast of Savage Wind");
    const q = state(s);
    q.blast = [
      ...(q.blast ?? []).filter((m) => m.round === s.round),
      ...emynMuilLocations(s).map((u) => ({ id: u.id, round: s.round })),
    ];
    if (!q.blast.length) delete q.blast;
  }
  // Hazardous Terrain: "Shuffle all Hazard cards in the encounter discard
  // pile back into the encounter deck."
  else if (code === G.hazardous) shuffleHazards(s, "Hazardous Terrain");
  // Retraced Steps: "Discard a random Emyn Muil location from the victory
  // display."
  else if (code === G.retraced) {
    const display = s.victoryCards ?? [];
    const options = display
      .map((c, i) => ({ c, i }))
      .filter(
        ({ c }) => card(c).type_code === "location" && traitOf(c, "Emyn Muil"),
      );
    if (!options.length) {
      log(
        s,
        "Retraced Steps · No Emyn Muil location is in the victory display.",
      );
      return true;
    }
    const { c, i } = options[Math.floor(random(s) * options.length)];
    display.splice(i, 1);
    s.victory = Math.max(0, s.victory - (card(c).victory ?? 0));
    const k = s.khazad?.victoryCards.indexOf(c) ?? -1;
    if (k >= 0) s.khazad!.victoryCards.splice(k, 1);
    s.encounterDiscard.push(c);
    log(
      s,
      `Retraced Steps: ${card(c).name} is discarded from the victory display (−${card(c).victory ?? 0} victory points).`,
      "danger",
    );
  }
  return true;
}
function clearProgress(s: GameState, source: string) {
  const cleared = emynMuilLocations(s).filter((u) => u.progress > 0);
  for (const u of cleared) u.progress = 0;
  log(
    s,
    cleared.length
      ? `${source}: all progress is removed from ${cleared.map(name).join(", ")}.`
      : `${source} · No Emyn Muil location in play has progress.`,
    cleared.length ? "danger" : "normal",
  );
}
function shuffleHazards(s: GameState, source: string) {
  const hazards = s.encounterDiscard.filter(hazard);
  s.encounterDiscard = s.encounterDiscard.filter((c) => !hazard(c));
  s.encounterDeck.push(...hazards);
  if (hazards.length) shuffle(s, s.encounterDeck);
  log(
    s,
    `${source}: ${hazards.length} Hazard ${hazards.length === 1 ? "card is" : "cards are"} shuffled from the encounter discard pile into the encounter deck.`,
    hazards.length ? "danger" : "normal",
  );
}

// ------------------------------------------------------------- shadows

function emynShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !emynLive(s)) return false;
  const enemy = get(s, c.enemyId);
  // A Hurrying Darkness: "Attacking enemy gets +X [attack]. X is the
  // [threat] of the active location."
  if (code === G.hurrying) {
    const active = allActiveLocations(s)[0];
    const x = active ? threatOf(s, active) : 0;
    c.attackBonus += x;
    log(
      s,
      `A Hurrying Darkness: the attacking enemy gets +${x} [attack]${active ? ` (${name(active)})` : " (no active location)"}.`,
      x ? "danger" : "normal",
    );
  }
  // Blast of Savage Wind: "Remove all progress from each Emyn Muil location
  // in play."
  else if (code === G.blast) clearProgress(s, "Blast of Savage Wind");
  // Hazardous Terrain: "Shuffle all Hazard cards in the encounter discard
  // pile back into the encounter deck. Then, deal another shadow card for
  // this attack."
  else if (code === G.hazardous) {
    shuffleHazards(s, "Hazardous Terrain");
    if (enemy)
      prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 1 }));
  } else return false;
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareEmynEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nem")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nemHurrying":
      choose(
        s,
        `A Hurrying Darkness · Raise your threat by 5, or reveal an encounter card${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 5",
            effects: [fx("nemHurryThreat", { player: p, value: 5 })],
          },
          ...(s.encounterDeck.length || s.encounterDiscard.length
            ? [
                {
                  id: "reveal",
                  label: "Reveal an encounter card into the staging area",
                  effects: [fx("reveal", { player: p })],
                },
              ]
            : []),
        ] as Option[],
        card(G.hurrying).text,
      );
      return true;
    case "nemHurryThreat":
      raiseThreat(s, e.value ?? 5, "encounter");
      log(
        s,
        `A Hurrying Darkness: ${several(s) ? `${seatName(s, p)} raises their` : "you raise your"} threat by ${e.value ?? 5}.`,
        "danger",
      );
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set(["nemHurrying", "nemHurryThreat"]);
export const NIGHTMARE_EMYN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: emynStats,
  threatBonus: emynThreatBonus,
  locationProgressCapacity: emynCapacity,
  locationProgressPlaced: emynProgressPlaced,
  cannotCancel: emynCannotCancel,
  charactersCommitted: emynCommitted,
  explored: emynExplored,
  travelEntered: emynTravelEntered,
  check: emynCheck,
  encounter: emynEncounter,
  shadow: emynShadow,
  effect: nightmareEmynEffect,
  sharedEffect: (e) => e.kind.startsWith("nem") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareEmyn(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    (q.emynProgress === undefined ||
      (Array.isArray(q.emynProgress) &&
        q.emynProgress.every(
          (m) =>
            !!m &&
            typeof m.id === "string" &&
            round(m.round) &&
            Number.isInteger(m.amount) &&
            m.amount > 0,
        ))) &&
    (q.brambles === undefined ||
      (!!q.brambles &&
        round(q.brambles.round) &&
        Array.isArray(q.brambles.ids) &&
        q.brambles.ids.every((id) => typeof id === "string"))) &&
    (q.blast === undefined ||
      (Array.isArray(q.blast) &&
        q.blast.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        )))
  );
}
