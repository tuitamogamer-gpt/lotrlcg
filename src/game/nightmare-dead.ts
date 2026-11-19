/**
 * The Dead Marshes' Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules and Nightmare encounter cards, composed with the scenario's own rules
 * (and its escape tests) through batch4Scenario while a Nightmare mode game is
 * played. Effects use the "ndm" prefix (the setup step is in nightmareSetup).
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  damage,
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  raiseThreat,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { NIGHTMARE_SOM as G, nightmareLive } from "./nightmare";
import {
  DEAD,
  deadMarshesAddResources,
  deadMarshesCheck,
  type EscapeTest,
} from "./dead-marshes";
import { surgeEffects } from "./surge";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
  several,
  traitOf,
} from "./nightmare-core";

const deadLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "dead-marshes";
const isEnemyCode = (code: string) => card(code).type_code === "enemy";
const undead = (code: string) => isEnemyCode(code) && traitOf(code, "Undead");
const inPlay = (s: GameState) => [...s.staging, ...allEngaged(s)];
const locationsInPlay = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
];
const mere = (s: GameState) => s.staging.find((u) => live(s, u, G.mere));
/** The escape tests the Nightmare cards begin (their dealt cards). */
const TESTS: Record<string, { count: number; stat?: "defense" }> = {
  [G.quagmire]: { count: 1 },
  [G.wight]: { count: 3 },
  [G.candles]: { count: 1 },
  [G.mosquitoes]: { count: 2, stat: "defense" },
};
/** A Nightmare card's escape test (for the save checks). */
export const nightmareEscapeTest = (s: GameState, source: string) =>
  deadLive(s) ? TESTS[source] : undefined;

// ------------------------------------------------------------- the setup card

/**
 * "Forced: After Gollum is placed in the discard pile, shuffle him into the
 * encounter deck." (At the next state check.)
 */
function deadCheck(s: GameState) {
  if (!deadLive(s) || s.phase === "setup") return;
  const n = s.encounterDiscard.filter((c) => c === DEAD.gollum).length;
  if (!n) return;
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== DEAD.gollum);
  s.encounterDeck.push(...Array<string>(n).fill(DEAD.gollum));
  shuffle(s, s.encounterDeck);
  log(
    s,
    "The Dead Marshes · Nightmare: Gollum was placed in the discard pile, and is shuffled into the encounter deck.",
    "danger",
  );
}

// ------------------------------------------------------------- The Mere of Dead Faces

/** "If Gollum is not in play, any resource tokens that would be placed on Gollum are placed here instead." */
function deadGollumTokens(s: GameState, amount: number) {
  const m = deadLive(s) ? mere(s) : undefined;
  if (!m || amount <= 0) return false;
  m.resources += amount;
  log(
    s,
    `The Mere of Dead Faces takes the ${amount} resource ${amount === 1 ? "token" : "tokens"} meant for Gollum (${m.resources} there).`,
    "danger",
  );
  return true;
}
/** "Forced: After Gollum enters play, place 2 resource tokens on Gollum, then move all resource tokens from The Mere of Dead Faces to Gollum." */
function deadCardEntered(s: GameState, u: Unit) {
  const m = deadLive(s) ? mere(s) : undefined;
  if (!m || u.code !== DEAD.gollum) return;
  const moved = m.resources;
  u.resources += 2 + moved;
  m.resources = 0;
  log(
    s,
    `The Mere of Dead Faces: Gollum enters play with 2 resource tokens${moved ? `, and the Mere's ${moved} move to him` : ""} (${u.resources}).`,
    "danger",
  );
  deadMarshesCheck(s);
}

// ------------------------------------------------------------- passives

function deadThreatBonus(s: GameState, u: Unit) {
  // The Mere of Dead Faces: "X is the number of resource tokens here."
  return deadLive(s) && live(s, u, G.mere) ? u.resources : 0;
}
const isMere = (s: GameState, u: Unit) => deadLive(s) && live(s, u, G.mere);
/** Lost Soul of Lórien (Condition): "Attached hero's [willpower] is reduced to 0." */
const deadWillpower = (s: GameState, u: Unit) =>
  deadLive(s) && u.attachments.some((a) => a.code === G.lostSoul && !a.blanked)
    ? 0
    : undefined;
/** Stagnant Quagmire: "While in play, it adds its Escape value to all escape tests." */
const deadEscapeDifficulty = (s: GameState) =>
  deadLive(s)
    ? 2 * locationsInPlay(s).filter((u) => live(s, u, G.quagmire)).length
    : 0;
/** Ill-fated Guard: "While engaged with a player, that player cannot commit more than 1 character to each escape test." */
const deadCommitLimit = (s: GameState, player: number) =>
  deadLive(s) &&
  allEngaged(s).some((e) => live(s, e, G.guard) && ownerOf(s, e) === player)
    ? 1
    : undefined;
/** Things in the Pools: "Forced: After a character commits to an escape test, deal 1 damage to that character." (each copy in play) */
function deadEscapeCommitted(s: GameState, u: Unit) {
  if (!deadLive(s)) return;
  const things = inPlay(s).filter((x) => live(s, x, G.thingsPools)).length;
  if (!things) return;
  log(
    s,
    `Things in the Pools: ${name(u)} takes ${things} damage for committing to the escape test.`,
    "danger",
  );
  damage(s, u.id, things);
}
/** Marsh-wight: "Forced: After Marsh-wight engages a player, that player makes an escape test, dealing 3 cards from the encounter deck." */
function deadEngaged(s: GameState, u: Unit) {
  if (!deadLive(s) || !live(s, u, G.wight)) return;
  const p = ownerOf(s, u);
  log(
    s,
    `Marsh-wight engages ${several(s) ? seatName(s, p) : "you"}: an escape test follows, with 3 cards.`,
    "danger",
  );
  prepend(
    s,
    fx("deadBeginEscape", {
      code: G.wight,
      count: 3,
      player: p,
      target: u.id,
    }),
  );
}
/**
 * Lost Soul of Lórien: "Forced: After Lost Soul of Lórien is destroyed,
 * attach it to a hero with 1 or more [willpower], if able."
 */
function deadEnemyDestination(s: GameState, u: Unit, destruction?: boolean) {
  if (!deadLive(s) || !destruction || !live(s, u, G.lostSoul)) return false;
  if (!lostSoulHosts(s).length) return false;
  prepend(s, fx("ndmLostSoul", { player: firstPlayer(s) }));
  return true;
}
const lostSoulHosts = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      stats(s, h).will >= 1 &&
      !h.attachments.some((a) => a.code === G.lostSoul),
  );

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [G.candles, G.mosquitoes, G.devilry];
function deadEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!deadLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Candles of Corpses: "Each player makes an escape test, dealing 1 card
  // from the encounter deck."
  if (code === G.candles)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("deadBeginEscape", { code, count: 1, player }),
      ),
      fx("deadDiscardTreachery", { code }),
    );
  // Swarming Mosquitoes: "The first player makes an escape test counting
  // [defense] instead of [willpower], dealing 2 cards from the encounter
  // deck."
  else if (code === G.mosquitoes)
    prepend(
      s,
      fx("deadBeginEscape", {
        code,
        count: 2,
        player: firstPlayer(s),
        text: "defense",
      }),
      fx("deadDiscardTreachery", { code }),
    );
  // Devilry of the Dark Land: "Return the top X Undead enemies in the
  // encounter discard pile to the staging area, where X is the number of
  // players. If no enemies were returned to the staging area as a result of
  // this effect, Devilry of the Dark Land gains surge."
  else {
    const x = playerOrder(s).length;
    const back: string[] = [];
    for (let i = s.encounterDiscard.length - 1; i >= 0 && back.length < x; i--)
      if (undead(s.encounterDiscard[i]))
        back.push(...s.encounterDiscard.splice(i, 1));
    s.encounterDiscard.push(code);
    for (const c of back) {
      const u = make(s, c);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
    }
    if (back.length)
      log(
        s,
        `Devilry of the Dark Land returns ${back.map((c) => card(c).name).join(", ")} to the staging area.`,
        "danger",
      );
    else {
      log(
        s,
        "Devilry of the Dark Land finds no Undead enemy in the encounter discard pile, and gains surge.",
        "danger",
      );
      prepend(s, ...surgeEffects(code));
    }
  }
  return true;
}

// ------------------------------------------------------------- shadows

function deadShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !deadLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const p = defendingPlayer(s);
  // Stagnant Quagmire: "Perform an escape test, dealing 1 card from the
  // encounter deck. If this test is failed, discard defending character."
  if (code === G.quagmire) {
    const defender = c.defenderIds?.[0] ?? c.defenderId ?? undefined;
    prepend(
      s,
      fx("deadBeginEscape", {
        code,
        count: 1,
        player: p,
        ...(defender ? { target: defender } : {}),
      }),
    );
  }
  // Things in the Pools: "Attacking enemy gets +1 [attack] (+2 [attack]
  // instead if attacking enemy is Undead)."
  else if (code === G.thingsPools) {
    const bonus = enemy && undead(enemy.code) ? 2 : 1;
    c.attackBonus += bonus;
    log(
      s,
      `Things in the Pools: the attacking enemy gets +${bonus} [attack].`,
      "danger",
    );
  }
  // Ill-fated Guard: "Discard all attachments from each character you
  // control with 3 or more [willpower]."
  else if (code === G.guard) {
    const hit = allCharacters(s).filter(
      (u) =>
        ownerOf(s, u) === p && stats(s, u).will >= 3 && u.attachments.length,
    );
    for (const u of hit)
      for (const a of [...u.attachments]) discardAttachment(s, u, a);
    log(
      s,
      hit.length
        ? `Ill-fated Guard: every attachment is discarded from ${hit.map(name).join(", ")}.`
        : "Ill-fated Guard · No character of the defending player with 3 or more [willpower] has an attachment.",
      hit.length ? "danger" : "normal",
    );
  } else return false;
  return true;
}

// ------------------------------------------------------------- escape tests

/** A Nightmare card's escape test: its outcome. */
function deadEscapeResolved(s: GameState, escape: EscapeTest, passed: boolean) {
  if (!deadLive(s) || !TESTS[escape.source]) return false;
  if (passed) return true;
  const p = escape.participants[0] ?? firstPlayer(s);
  // Stagnant Quagmire's shadow: the defending character is discarded.
  if (escape.source === G.quagmire) {
    const u = escape.target ? get(s, escape.target) : undefined;
    if (u && allCharacters(s).some((x) => x.id === u.id)) {
      discardCharacter(s, u);
      log(s, `Stagnant Quagmire: ${name(u)} is discarded.`, "danger");
    }
  }
  // Marsh-wight: "If this test is failed, place 2 resource tokens on Gollum
  // and Marsh-wight makes an immediate attack."
  else if (escape.source === G.wight) {
    deadMarshesAddResources(s, 2);
    const wight = escape.target ? get(s, escape.target) : undefined;
    if (wight && allEngaged(s).some((e) => e.id === wight.id))
      prepend(
        s,
        fx("immediateAttack", { target: wight.id, player: ownerOf(s, wight) }),
      );
  }
  // Candles of Corpses: "Each player who fails this test must either discard
  // a hero he controls from play or raise his threat by 5."
  else if (escape.source === G.candles)
    prepend(s, fx("ndmCandles", { player: p }));
  // Swarming Mosquitoes: "If this test is failed, place 1 resource token on
  // Gollum and deal 1 damage to each character in play."
  else if (escape.source === G.mosquitoes) {
    deadMarshesAddResources(s, 1);
    log(
      s,
      "Swarming Mosquitoes: each character in play takes 1 damage.",
      "danger",
    );
    prepend(
      s,
      ...allCharacters(s).map((u) =>
        fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
      ),
    );
  }
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareDeadEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "ndmLostSoul": {
      const hosts = lostSoulHosts(s);
      if (!hosts.length) {
        s.encounterDiscard.push(G.lostSoul);
        log(s, "Lost Soul of Lórien · No hero has 1 or more [willpower].");
        return true;
      }
      if (hosts.length === 1)
        prepend(s, fx("ndmLostSoulAttach", { target: hosts[0].id, player: p }));
      else
        choose(
          s,
          "Lost Soul of Lórien · Choose a hero with 1 or more [willpower] to attach it to",
          hosts.map((h): Option => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${several(s) ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
            effects: [fx("ndmLostSoulAttach", { target: h.id, player: p })],
          })),
          card(G.lostSoul).text,
        );
      return true;
    }
    case "ndmLostSoulAttach": {
      const h = get(s, e.target);
      if (!h || !allHeroes(s).some((x) => x.id === h.id)) {
        s.encounterDiscard.push(G.lostSoul);
        return true;
      }
      h.attachments.push({
        id: `a${s.nextId++}`,
        code: G.lostSoul,
        exhausted: false,
      });
      log(
        s,
        `Lost Soul of Lórien is attached to ${name(h)}, whose [willpower] is reduced to 0.`,
        "danger",
      );
      return true;
    }
    case "ndmCandles": {
      const heroes = seatView(s, p).heroes;
      choose(
        s,
        `Candles of Corpses · Discard a hero you control, or raise your threat by 5${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 5",
            effects: [fx("ndmCandlesThreat", { player: p })],
          },
          ...heroes.map((h): Option => ({
            id: h.id,
            code: h.code,
            label: `Discard ${name(h)}`,
            effects: [fx("ndmCandlesHero", { target: h.id, player: p })],
          })),
        ],
        card(G.candles).text,
      );
      return true;
    }
    case "ndmCandlesThreat":
      raiseThreat(s, 5, "encounter");
      log(
        s,
        `Candles of Corpses: ${several(s) ? `${seatName(s, p)} raises their` : "you raise your"} threat by 5.`,
        "danger",
      );
      return true;
    case "ndmCandlesHero": {
      const h = get(s, e.target);
      if (h && s.heroes.some((x) => x.id === h.id)) {
        discardCharacter(s, h);
        log(s, `Candles of Corpses: ${name(h)} is discarded.`, "danger");
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "ndmCandles",
  "ndmCandlesThreat",
  "ndmCandlesHero",
]);
export const NIGHTMARE_DEAD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  // "Players cannot reduce their threat."
  cannotReduceThreat: (s) => deadLive(s),
  threatBonus: deadThreatBonus,
  // The Mere of Dead Faces: "Cannot leave the staging area." (No quest
  // points: no progress, no travel.)
  travelProblem: (s, u) =>
    isMere(s, u)
      ? "The Mere of Dead Faces cannot leave the staging area."
      : null,
  cannotLeave: isMere,
  locationProgressBlocked: isMere,
  willpowerOverride: deadWillpower,
  escapeDifficulty: deadEscapeDifficulty,
  escapeCommitLimit: deadCommitLimit,
  escapeCommitted: deadEscapeCommitted,
  escapeResolved: deadEscapeResolved,
  gollumTokens: deadGollumTokens,
  cardEntered: deadCardEntered,
  engaged: deadEngaged,
  enemyDestination: deadEnemyDestination,
  check: deadCheck,
  encounter: deadEncounter,
  shadow: deadShadow,
  effect: nightmareDeadEffect,
  sharedEffect: (e) => e.kind.startsWith("ndm") && !PLAYER_EFFECTS.has(e.kind),
};
