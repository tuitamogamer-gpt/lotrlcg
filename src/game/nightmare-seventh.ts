/**
 * The Seventh Level's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (Overseer Maurûl and Chamber of Records set aside until stage 2B) and
 * its Nightmare encounter cards, whose resource tokens on Goblin enemies feed
 * one another, composed with the Khazad-dûm scenario's own rules through
 * batch4Scenario while a Nightmare mode game is played. Effects use the
 * "nsl" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { fx, get, log, make, prepend, shuffle } from "./core";
import { enemyAddedToStaging, revealed } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  livingSeats,
  ownerOf,
  removeActiveLocation,
} from "./table";
import { NIGHTMARE_KD as K, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, traitOf } from "./nightmare-core";

const seventhLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-seventh-level";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isGoblin = (u: Unit) => isEnemy(u) && traitOf(u.code, "Goblin");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const goblins = (s: GameState) => enemiesInPlay(s).filter(isGoblin);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
/** Overseer Maurûl's X: the highest number of resources on a Goblin enemy in play. */
const mostResources = (s: GameState) =>
  goblins(s).reduce((n, u) => Math.max(n, u.resources), 0);
/** "Add N resources to each Goblin enemy in play." */
function feedGoblins(s: GameState, n: number, source: string) {
  const fed = goblins(s);
  for (const u of fed) u.resources += n;
  log(
    s,
    fed.length
      ? `${source}: ${n} ${n === 1 ? "resource" : "resources"} on each Goblin enemy in play (${fed.map((u) => name(u)).join(", ")}).`
      : `${source}: no Goblin enemy is in play.`,
    fed.length ? "danger" : "normal",
  );
}

// ------------------------------------------------------------- the setup card

/**
 * "Forced: When stage 2B is revealed, make Chamber of Records the active
 * location (returning any currently active location to the staging area) and
 * add Overseer Maurûl to the staging area. Then, shuffle all copies of
 * Balin's Doom in the encounter discard pile back into the encounter deck."
 */
function seventhStageRevealed(s: GameState, stage: number) {
  if (!seventhLive(s) || stage !== 2) return;
  for (const l of allActiveLocations(s)) {
    removeActiveLocation(s, l.id);
    s.staging.push(l);
  }
  s.activeLocation = make(s, K.chamber);
  const maurul = make(s, K.maurul);
  s.staging.push(maurul);
  enemyAddedToStaging(s, maurul);
  const dooms = s.encounterDiscard.filter((c) => c === K.balinsDoom).length;
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== K.balinsDoom);
  s.encounterDeck.push(...Array<string>(dooms).fill(K.balinsDoom));
  shuffle(s, s.encounterDeck);
  log(
    s,
    `The Seventh Level · Nightmare: Chamber of Records becomes the active location and Overseer Maurûl enters the staging area; ${dooms} ${dooms === 1 ? "Balin's Doom is" : "copies of Balin's Doom are"} shuffled back into the encounter deck.`,
    "danger",
  );
}
/** Overseer Maurûl: "The players cannot win the game unless Overseer Maurûl is in the victory display." */
const seventhStageDefeated = (s: GameState) =>
  seventhLive(s) && s.stage === 2
    ? s.progress >= 17 && !!s.victoryCards?.includes(K.maurul)
    : undefined;

// ------------------------------------------------------------- passives

/**
 * Goblin Skirmisher: "Each Goblin enemy gets +1 [attack] for each resource
 * on it. This ability does not stack with other copies of Goblin
 * Skirmisher."; Overseer Maurûl: "+X [attack], and +X [defense]".
 */
function seventhStats(s: GameState, u: Unit) {
  if (!seventhLive(s)) return {};
  const skirmisher =
    isGoblin(u) && enemiesInPlay(s).some((e) => live(s, e, K.skirmisher));
  const x = live(s, u, K.maurul) ? mostResources(s) : 0;
  return {
    attack: (skirmisher ? u.resources : 0) + x,
    defense: x,
  };
}
/**
 * Western Hall: "Each Goblin enemy gets +1 [threat] for each resource on it.
 * This ability does not stack with other copies of Western Hall."; Overseer
 * Maurûl: "+X [threat]".
 */
function seventhThreatBonus(s: GameState, u: Unit) {
  if (!seventhLive(s)) return 0;
  const hall =
    isGoblin(u) && locationsInPlay(s).some((l) => live(s, l, K.westernHall));
  return (
    (hall ? u.resources : 0) + (live(s, u, K.maurul) ? mostResources(s) : 0)
  );
}
/** Deep-Mines: "Forced: When a Goblin enemy enters play, add 1 resource to that enemy if Deep-Mines is in the staging area." */
function seventhEnemyEntered(s: GameState, u: Unit) {
  if (!seventhLive(s) || !isGoblin(u)) return;
  const mines = s.staging.filter((l) => live(s, l, K.deepMines)).length;
  if (!mines) return;
  u.resources += mines;
  log(
    s,
    `Deep-Mines: ${name(u)} enters play with ${mines} ${mines === 1 ? "resource" : "resources"}.`,
    "danger",
  );
}
/** Chamber of Records: "Forced: When a Goblin enemy engages a player, add 2 resources to that enemy." */
function seventhEngaged(s: GameState, u: Unit) {
  if (
    !seventhLive(s) ||
    !isGoblin(u) ||
    !locationsInPlay(s).some((l) => live(s, l, K.chamber))
  )
    return;
  u.resources += 2;
  log(
    s,
    `Chamber of Records: ${name(u)} engages and takes 2 resources.`,
    "danger",
  );
}
/**
 * Orc Taskmaster: "Forced: When a Goblin enemy with at least 1 resource on it
 * is dealt any amount of damage, remove 1 resource from that enemy and cancel
 * all damage just dealt to it."
 */
function seventhReplaceDamage(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !seventhLive(s) ||
    amount <= 0 ||
    !isGoblin(u) ||
    u.resources < 1 ||
    !enemiesInPlay(s).some((e) => live(s, e, K.taskmaster))
  )
    return false;
  u.resources -= 1;
  log(
    s,
    `Orc Taskmaster: ${name(u)} loses 1 resource, and the ${amount} damage dealt to it is cancelled.`,
    "danger",
  );
  return true;
}
/** Western Hall: "Travel: Add 1 resource to each Goblin enemy in play." */
function seventhTravelEntered(s: GameState, u: Unit, actualTravel: boolean) {
  if (actualTravel && live(s, u, K.westernHall))
    feedGoblins(s, 1, "Western Hall");
}
/** Pit Goblin's and Orc Taskmaster's "When Revealed" effects. */
function seventhCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancelled: boolean,
) {
  if (!fromReveal || cancelled) return;
  // Pit Goblin: "When Revealed: Add 2 resources to Pit Goblin."
  if (live(s, u, K.pitGoblin)) {
    u.resources += 2;
    log(s, "Pit Goblin enters play with 2 resources.", "danger");
  }
  // Orc Taskmaster: "When Revealed: Add 1 resource to each Goblin enemy in
  // play."
  else if (live(s, u, K.taskmaster)) feedGoblins(s, 1, "Orc Taskmaster");
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [K.balinsDoom, K.beats];
function seventhEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!seventhLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Balin's Doom: "When Revealed: Add 1 resource to each Goblin enemy in
  // play." (Surge and Doomed 1 are its keywords.)
  if (code === K.balinsDoom) {
    feedGoblins(s, 1, "Balin's Doom");
    s.encounterDiscard.push(code);
    return true;
  }
  // Beats and Echoes: "When Revealed: Reveal the top X cards of the encounter
  // deck, adding all enemies to the staging area. Discard the other revealed
  // cards without resolving them. X is 2 plus the number of players not
  // engaged with a Goblin enemy."
  const free = livingSeats(s).filter(
    (p) => !allEngaged(s).some((u) => isGoblin(u) && ownerOf(s, u) === p),
  ).length;
  const top = s.encounterDeck.splice(0, 2 + free);
  const enemies = top.filter((c) => card(c).type_code === "enemy");
  s.encounterDiscard.push(
    ...top.filter((c) => card(c).type_code !== "enemy"),
    code,
  );
  log(
    s,
    `Beats and Echoes reveals ${top.length} ${top.length === 1 ? "card" : "cards"}: ${top.map((c) => card(c).name).join(", ") || "none"}; ${enemies.length} ${enemies.length === 1 ? "enemy enters" : "enemies enter"} the staging area.`,
    enemies.length ? "danger" : "normal",
  );
  prepend(
    s,
    ...enemies.map((c) =>
      fx("nslRevealEnemy", { code: c, player: firstPlayer(s) }),
    ),
  );
  return true;
}

// ------------------------------------------------------------- shadows

function seventhShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !seventhLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Balin's Doom and Pit Goblin: "If attacking enemy is a Goblin, add 1
    // resource to it."
    case K.balinsDoom:
    case K.pitGoblin:
      if (enemy && isGoblin(enemy)) {
        enemy.resources += 1;
        log(
          s,
          `${card(code).name}: ${name(enemy)} takes 1 resource.`,
          "danger",
        );
      }
      return true;
    // Goblin Skirmisher: "Deal X damage to defending character. X is the
    // number of resources on attacking enemy."
    case K.skirmisher: {
      const x = enemy?.resources ?? 0;
      const defender = c.defenderIds?.[0] ?? c.defenderId ?? undefined;
      if (x > 0 && defender)
        prepend(
          s,
          fx("damage", { target: defender, value: x, player: c.attackPlayer }),
        );
      return true;
    }
    // Deep-Mines: "Attacking enemy gets +1 [attack]. Then, if attacking enemy
    // is a Goblin, deal it another shadow card."
    case K.deepMines:
      c.attackBonus += 1;
      if (enemy && isGoblin(enemy))
        prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 1 }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareSeventhEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nsl")) return false;
  switch (e.kind) {
    case "nslRevealEnemy":
      if (e.code) revealed(s, e.code);
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_SEVENTH_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: seventhStageRevealed,
  stageDefeated: seventhStageDefeated,
  stats: seventhStats,
  threatBonus: seventhThreatBonus,
  enemyEntered: seventhEnemyEntered,
  engaged: seventhEngaged,
  replaceDamage: seventhReplaceDamage,
  travelEntered: seventhTravelEntered,
  cardEntered: seventhCardEntered,
  encounter: seventhEncounter,
  shadow: seventhShadow,
  effect: nightmareSeventhEffect,
  sharedEffect: (e) => e.kind.startsWith("nsl"),
};
