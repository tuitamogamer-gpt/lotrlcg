/**
 * The Shadows of Mirkwood Nightmare Decks (docs/NIGHTMARE.md): each setup
 * card's rules and Nightmare encounter cards, composed with the scenario's own
 * rules through batch4Scenario while a Nightmare mode game is played. Effects
 * use the "nsm" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, imageUrl, name } from "./cards";
import {
  choose,
  cluesInPlay,
  fx,
  get,
  hasClue,
  log,
  make,
  prepend,
  shuffle,
  threatOf,
  units,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  raiseThreat,
} from "./board";
import { addCurrentQuestProgress } from "./side-quests";
import {
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { NIGHTMARE_SOM as G, nightmareLive } from "./nightmare";
import { CLUE } from "./scenarios";
import { CARROCK } from "./carrock";
import { isPlayerCardSource } from "./player-effect-immunity";
import { surgeEffects } from "./surge";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  lose,
  seatLabel,
  several,
  state,
  traitOf,
  undefended,
} from "./nightmare-core";

/** Lasting effects of the Shadows of Mirkwood Nightmare cards. */
export interface NightmareSomState {
  /** Hunter's Lookout's shadow: +1 [defense] for each Clue card in play, this round. */
  lookout?: { enemyId: string; round: number; amount: number }[];
  /** Hunting Warg: the round each copy entered play. */
  wargs?: { id: string; round: number }[];
  /** Conflict at the Carrock: progress placed on the quest this quest phase (its round). */
  carrockPlaced?: number;
  /** Savage Hill-troll's shadow: characters that do not ready during this round's refresh phase. */
  noRefresh?: { id: string; round: number }[];
  /** Rob & Bob: the round of its first attack. */
  robRound?: number;
  /** Rob & Bob was defeated (stage 3, Grimbeorn's Folly, is won). */
  robDefeated?: boolean;
}

// ------------------------------------------------------------- The Hunt for Gollum

const gollumLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "hunt-for-gollum";
const HUNTERS = "02021";
const isEnemyUnit = (u: Unit) => card(u.code).type_code === "enemy";
const mordorEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => isEnemyUnit(u) && traitOf(u.code, "Mordor"),
  );
const cluesOn = (u: Unit) =>
  u.attachments.filter((a) => a.code === CLUE).length;
/** The Clue cards attached to Mordor enemies. */
export const cluesOnMordor = (s: GameState) =>
  mordorEnemies(s).reduce((n, u) => n + cluesOn(u), 0);
const inPlayAnywhere = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code));

/** A Clue in the staging area attached to a Mordor enemy, which guards it. */
function clueToEnemy(s: GameState, clue: Unit, enemy: Unit) {
  // "If it was guarded, detach the encounter guarding it first."
  for (const g of units(s)) if (g.guarding === clue.id) delete g.guarding;
  s.staging = s.staging.filter((u) => u.id !== clue.id);
  enemy.attachments.push({ id: clue.id, code: CLUE, exhausted: false });
  log(
    s,
    `Signs of Gollum is attached to ${name(enemy)}, which now guards it (${cluesOnMordor(s)} Clues on Mordor enemies).`,
    "danger",
  );
}
/** The first player chooses the Mordor enemy a Clue is attached to (if several). */
function chooseHunter(
  s: GameState,
  title: string,
  then: (enemy: Unit) => Effect[],
) {
  const enemies = mordorEnemies(s);
  if (enemies.length === 1) {
    prepend(s, ...then(enemies[0]));
    return true;
  }
  if (!enemies.length) return false;
  choose(
    s,
    title,
    enemies.map((u): Option => ({
      id: u.id,
      code: u.code,
      label: name(u),
      effects: then(u),
    })),
  );
  return true;
}

/**
 * Ravenous Hawk: "Forced: When a card effect instructs a player to "look" at
 * cards in the encounter deck and Ravenous Hawk is among those cards, that
 * player must put Ravenous Hawk into play engaged with him. (This does not
 * satisfy the Forced effect of stage 1B or 2B)." The quest's look (stages 1B
 * and 2B): each Ravenous Hawk among the top `count` cards leaves the deck and
 * engages the first player; returns how many did.
 */
export function nightmareRavenousHawks(s: GameState, count: number) {
  if (!gollumLive(s)) return 0;
  const top = s.encounterDeck.slice(0, count);
  const hawks = top.filter((code) => code === G.hawk).length;
  if (!hawks) return 0;
  s.encounterDeck = [
    ...top.filter((code) => code !== G.hawk),
    ...s.encounterDeck.slice(count),
  ];
  const p = firstPlayer(s);
  for (let i = 0; i < hawks; i++) {
    const hawk = make(s, G.hawk);
    s.staging.push(hawk);
    enemyAddedToStaging(s, hawk);
    forOwner(s, p, () => engage(s, hawk));
  }
  log(
    s,
    `Ravenous Hawk is among the cards looked at, and enters play engaged with ${several(s) ? seatName(s, p) : "you"}.`,
    "danger",
  );
  return hawks;
}

/** Hunter's Lookout: "Each Mordor enemy with at least 1 Clue card attached gets +2 [defense]." */
function somStats(s: GameState, u: Unit) {
  if (!gollumLive(s) || !isEnemyUnit(u)) return {};
  let defense = 0;
  if (traitOf(u.code, "Mordor") && cluesOn(u))
    defense += 2 * inPlayAnywhere(s, G.lookout).length;
  for (const m of s.nightmare?.lookout ?? [])
    if (m.enemyId === u.id && m.round === s.round) defense += m.amount;
  return defense ? { defense } : {};
}
/** The Trail Goes Cold: "Attached location contributes its [threat] during the quest phase as if it were in the staging area." */
function somStagingThreat(s: GameState) {
  if (!gollumLive(s) || !["quest", "staging"].includes(s.phase)) return 0;
  return allActiveLocations(s)
    .filter((l) => l.attachments.some((a) => a.code === G.trailCold))
    .reduce((n, l) => n + threatOf(s, l), 0);
}
/** Dark Pools: "Progress cannot be placed on Dark Pools while it is in the staging area." */
const somProgressBlocked = (s: GameState, u: Unit) =>
  live(s, u, G.pools) && s.staging.some((x) => x.id === u.id);
/** Watched Path: "Each player who does not control at least 1 Clue card cannot draw cards through card effects." */
const somCannotDraw = (s: GameState) =>
  gollumLive(s) &&
  inPlayAnywhere(s, G.watched).length > 0 &&
  !s.heroes.some(hasClue);
/** A Clue guarded by a Mordor enemy stays in play when the enemy leaves: it returns to the staging area. */
function somAttachmentLeaves(s: GameState, host: Unit, a: { code: string }) {
  if (!gollumLive(s) || a.code !== CLUE || !isEnemyUnit(host)) return false;
  const clue = make(s, CLUE);
  s.staging.push(clue);
  log(
    s,
    `${name(host)} leaves play: the Clue it guarded returns to the staging area, unguarded.`,
    "good",
  );
  return true;
}
function somCardEntered(s: GameState, u: Unit) {
  // Hunting Warg: the round it entered play.
  if (live(s, u, G.warg)) {
    const q = state(s);
    q.wargs = [
      ...(q.wargs ?? []).filter((m) => m.round === s.round),
      { id: u.id, round: s.round },
    ];
  }
}
/**
 * Hunting Warg: "Forced: At the beginning of the refresh phase, if Hunting
 * Warg entered play this round, search the encounter deck and discard pile for
 * 1 copy of Hunters from Mordor and add it to the staging area, if able.
 * Shuffle the encounter deck."
 */
function somRefreshStart(s: GameState): Effect[] {
  if (!gollumLive(s)) return [];
  const q = s.nightmare;
  const fresh = (q?.wargs ?? []).filter(
    (m) =>
      m.round === s.round &&
      [...s.staging, ...allEngaged(s)].some((u) => u.id === m.id),
  );
  if (q) delete q.wargs;
  return fresh.map(() => fx("nsmWargHunters", { player: firstPlayer(s) }));
}
/**
 * The setup card: "Forced: At the end of the refresh phase, choose an
 * unclaimed Clue card not attached to a Mordor enemy and attach it to a Mordor
 * enemy, if able."
 */
const somRoundEnd = (s: GameState): Effect[] =>
  gollumLive(s) ? [fx("nsmRefreshClue", { player: firstPlayer(s) })] : [];
/** "If at any point there are four or more Clue cards attached to Mordor enemies, the players lose the game." */
function somCheck(s: GameState) {
  if (gollumLive(s) && s.status === "playing" && cluesOnMordor(s) >= 4)
    lose(
      s,
      "Four Clue cards are attached to Mordor enemies: the Enemy has found the trail first, and the players have lost the game.",
    );
}
/** Dark Pools: "Forced: After Dark Pools becomes the active location, each player must discard an ally with the highest printed cost among the allies he controls." */
function somTravelEntered(s: GameState, u: Unit) {
  if (!live(s, u, G.pools)) return;
  prepend(s, ...playerOrder(s).map((player) => fx("nsmPoolsAlly", { player })));
}

// ------------------------------------------------------------- Conflict at the Carrock

const carrockLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "conflict-at-the-carrock";
const isTrollUnit = (u: Unit) => isEnemyUnit(u) && traitOf(u.code, "Troll");
const victoryCopies = (s: GameState, code: string) =>
  (s.victoryCards ?? []).filter((c) => c === code).length;
/** Stage 2's end in Nightmare mode: stage 3, Grimbeorn's Folly, follows. */
export function nightmareCarrockFolly(s: GameState) {
  if (!carrockLive(s) || s.stage !== 2) return false;
  s.stage = 3;
  s.progress = 0;
  log(
    s,
    "Grimbeorn's Folly · Tracks lead to the leader of these Trolls, who has captured Grimbeorn the Old.",
    "chapter",
  );
  prepend(s, fx("nsmFolly", { player: firstPlayer(s) }));
  return true;
}
/** Stage 3B: "When Rob & Bob have been defeated, ... the players have won the game." */
export const nightmareCarrockWon = (s: GameState) =>
  carrockLive(s) && !!s.nightmare?.robDefeated;
/** Stage 3 (Nightmare mode only): Grimbeorn's Folly. */
function carrockStageInfo(s: GameState) {
  if (!carrockLive(s) || s.stage !== 3) return undefined;
  const c = card(G.folly);
  return {
    name: c.back_name ?? c.name,
    cardCode: G.folly,
    quest: Number(c.back_quest ?? c.quest) || 0,
    story: c.back_text ?? "",
    side: "B" as const,
    questImage: imageUrl({ ...c, imagesrc: c.back_imagesrc }),
  };
}
function carrockStats(s: GameState, u: Unit) {
  if (!carrockLive(s) || !isTrollUnit(u)) return {};
  // Savage Hill-troll (victory display): +1 hit point; Morris: +1 [attack];
  // Stuart: +1 [defense].
  return {
    health: victoryCopies(s, G.savage),
    attack: victoryCopies(s, G.morris),
    defense: victoryCopies(s, G.stuart),
  };
}
/** Stuart: "Cannot have player attachments." (Each Troll enemy while Stuart is in the victory display.) */
const carrockCannotAttach = (s: GameState, u: Unit, code: string) =>
  carrockLive(s) &&
  isPlayerCardSource(code) &&
  ((live(s, u, G.stuart) && isEnemyUnit(u)) ||
    (victoryCopies(s, G.stuart) > 0 && isTrollUnit(u)));
/** Savage Hill-troll's shadow: the defending character does not ready during this round's refresh phase. */
const carrockCannotReady = (s: GameState, u: Unit) =>
  carrockLive(s) &&
  s.phase === "refresh" &&
  !!s.nightmare?.noRefresh?.some((m) => m.id === u.id && m.round === s.round);
/** Troll Lair: "While Troll Lair is in the staging area, players cannot reduce their threat." */
const carrockCannotReduceThreat = (s: GameState) =>
  carrockLive(s) && s.staging.some((u) => live(s, u, G.lair));
/** The setup card: a quest phase that placed no progress on the quest. */
function carrockQuestBegin(s: GameState): Effect[] {
  if (carrockLive(s) && s.nightmare) delete s.nightmare.carrockPlaced;
  return [];
}
function carrockQuestProgressPlaced(s: GameState, _q: Unit, amount: number) {
  if (carrockLive(s) && amount > 0 && ["quest", "staging"].includes(s.phase))
    state(s).carrockPlaced = s.round;
}
/**
 * "Forced: At the end of the quest phase, if no progress was placed on the
 * current quest this phase, place 1 progress on the current quest (bypassing
 * the active location)."
 */
function carrockEndQuest(s: GameState) {
  if (!carrockLive(s) || s.status !== "playing") return;
  if (s.nightmare?.carrockPlaced === s.round) return;
  log(
    s,
    "Conflict at the Carrock · Nightmare: no progress was placed on the quest this phase, so 1 is placed on it.",
  );
  addCurrentQuestProgress(s, 1);
}
/** Hives and Hives: "Forced: After any amount of progress is placed on Hives and Hives, deal 1 damage to each character in play." */
function carrockProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!live(s, u, G.hives) || amount <= 0) return;
  log(s, "Hives and Hives: each character in play takes 1 damage.", "danger");
  prepend(
    s,
    ...playerOrder(s).flatMap((p) =>
      [...seatView(s, p).heroes, ...seatView(s, p).allies].map((c) =>
        fx("damage", { target: c.id, value: 1, player: p }),
      ),
    ),
  );
}
/**
 * A defeated enemy: "Response: After defeating a unique Troll enemy, you may
 * choose and discard 1 "Sacked!" card from play." Rob & Bob's defeat wins
 * stage 3.
 */
function carrockEnemyDestination(s: GameState, u: Unit, destruction?: boolean) {
  if (!carrockLive(s) || !destruction || !isTrollUnit(u)) return false;
  if (u.code === G.robBob) state(s).robDefeated = true;
  if (card(u.code).is_unique && sackedInPlay(s).length)
    prepend(s, fx("nsmSacked", { player: firstPlayer(s) }));
  return false;
}
const sackedInPlay = (s: GameState) =>
  playerOrder(s).flatMap((p) =>
    [...seatView(s, p).heroes, ...seatView(s, p).allies].flatMap((h) =>
      h.attachments
        .filter((a) => a.code === CARROCK.sacked)
        .map((a) => ({ h, a })),
    ),
  );
/**
 * Louis: "Forced: After Louis attacks, the defending player must raise his
 * threat by 3." (While Louis is in the victory display, each Troll enemy:
 * by 1.) Rob & Bob: "Forced: After Rob & Bob makes its first attack each
 * round, if there are two or more players, it engages the next player and
 * makes an additional attack."
 */
function carrockAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!carrockLive(s)) return [];
  const enemy = get(s, c.enemyId);
  if (!enemy) return [];
  const p = c.attackPlayer ?? firstPlayer(s);
  const out: Effect[] = [];
  const raise =
    (live(s, enemy, G.louis) ? 3 : 0) +
    (isTrollUnit(enemy) ? victoryCopies(s, G.louis) : 0);
  if (raise) out.push(fx("nsmLouisThreat", { player: p, value: raise }));
  if (
    live(s, enemy, G.robBob) &&
    s.nightmare?.robRound !== s.round &&
    playerOrder(s).length > 1
  ) {
    state(s).robRound = s.round;
    const order = playerOrder(s);
    const next = order[(order.indexOf(p) + 1) % order.length];
    out.push(fx("nsmRobBob", { target: enemy.id, player: next }));
  }
  return out;
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [G.enemyTrail, G.restless, G.trailCold, G.supper];
function somEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nightmareLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  const p = firstPlayer(s);
  if (code === G.trailCold) prepend(s, fx("nsmTrailCold", { player: p }));
  else if (code === G.supper) {
    s.encounterDiscard.push(code);
    prepend(s, fx("nsmSupper", { player: p }));
  } else {
    s.encounterDiscard.push(code);
    prepend(
      s,
      code === G.enemyTrail
        ? fx("nsmEnemyTrail", { player: p, flag: true })
        : fx("nsmRestless", { player: p }),
    );
  }
  return true;
}

// ------------------------------------------------------------- shadows

function somShadow(s: GameState, code: string) {
  if (carrockShadow(s, code)) return true;
  const c = s.combat;
  if (!c || !gollumLive(s)) return false;
  const p = defendingPlayer(s),
    enemy = get(s, c.enemyId);
  // The Enemy's Trail: "Search the encounter discard pile for a Clue card and
  // attach it to a Mordor enemy in play, if able."
  if (code === G.enemyTrail)
    prepend(s, fx("nsmEnemyTrail", { player: firstPlayer(s) }));
  // Restless Hunters: "Damage from this attack must be applied to a hero you
  // control with a Clue card attached, if able." (An undefended attack.)
  else if (code === G.restless) {
    const bearers = seatView(s, p).heroes.filter(hasClue);
    if (!undefended(s) || !bearers.length) {
      log(
        s,
        "Restless Hunters · The attack is defended, or no hero of the defending player has a Clue.",
      );
      return true;
    }
    if (bearers.length === 1) {
      c.undefendedTargetId = bearers[0].id;
      log(
        s,
        `Restless Hunters: the attack's damage must go to ${name(bearers[0])}, who holds a Clue.`,
        "danger",
      );
    } else
      choose(
        s,
        `Restless Hunters · Choose the hero with a Clue to take this attack's damage${seatLabel(s, p)}`,
        bearers.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("nsmRestlessTarget", { target: h.id, player: p })],
        })),
      );
  }
  // Watched Path: "If you do not control at least 1 Clue card, discard all
  // cards from your hand."
  else if (code === G.watched)
    prepend(s, fx("nsmWatchedShadow", { player: p }));
  // Hunter's Lookout: "Attacking enemy gets +1 [defense] for each Clue card
  // in play until the end of the round."
  else if (code === G.lookout) {
    if (enemy) {
      const amount = cluesInPlay(s);
      const q = state(s);
      q.lookout = [
        ...(q.lookout ?? []).filter((m) => m.round === s.round),
        { enemyId: enemy.id, round: s.round, amount },
      ];
      log(
        s,
        `Hunter's Lookout: ${name(enemy)} gets +${amount} [defense] until the end of the round.`,
        amount ? "danger" : "normal",
      );
    }
  } else return false;
  return true;
}

/** Conflict at the Carrock's Nightmare shadows. */
function carrockShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !carrockLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const troll = !!enemy && isTrollUnit(enemy);
  // Savage Hill-troll: "If attacking enemy is a Troll, defending character
  // does not ready during the refresh phase this round."
  if (code === G.savage) {
    const ids = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
    if (troll && ids.length) {
      const q = state(s);
      q.noRefresh = [
        ...(q.noRefresh ?? []).filter((m) => m.round === s.round),
        ...ids.map((id) => ({ id, round: s.round })),
      ];
      log(
        s,
        `Savage Hill-troll: ${ids.map((id) => name(get(s, id)!)).join(", ")} will not ready during this round's refresh phase.`,
        "danger",
      );
    } else
      log(s, "Savage Hill-troll · The attack is undefended, or not a Troll's.");
  }
  // Troll Lair: "If attacking enemy is a Troll, remove 4 damage tokens from
  // it."
  else if (code === G.lair) {
    if (troll && enemy) {
      const healed = Math.min(4, enemy.damage);
      enemy.damage -= healed;
      log(s, `Troll Lair: ${name(enemy)} heals ${healed} damage.`, "danger");
    } else log(s, "Troll Lair · The attacking enemy is not a Troll.");
  }
  // Hives and Hives: "Attacking enemy gets +2 [attack]."
  else if (code === G.hives) {
    c.attackBonus += 2;
    log(s, "Hives and Hives: the attacking enemy gets +2 [attack].", "danger");
  } else return false;
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareSomEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nsm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nsmRefreshClue": {
      const clues = s.staging.filter((u) => u.code === CLUE);
      if (!clues.length || !mordorEnemies(s).length) {
        log(
          s,
          "The Hunt for Gollum · Nightmare: no unclaimed Clue or no Mordor enemy, so no Clue is attached.",
        );
        return true;
      }
      const clue =
        get(s, e.target) ?? (clues.length === 1 ? clues[0] : undefined);
      if (!clue) {
        choose(
          s,
          "The Hunt for Gollum · Choose an unclaimed Clue to attach to a Mordor enemy",
          clues.map((u): Option => ({
            id: u.id,
            code: u.code,
            label: `${name(u)}${units(s).some((g) => g.guarding === u.id) ? " (guarded)" : ""}`,
            effects: [fx("nsmRefreshClue", { target: u.id, player: p })],
          })),
          card(G.gollumCard).back_text,
        );
        return true;
      }
      chooseHunter(
        s,
        "The Hunt for Gollum · Choose the Mordor enemy the Clue is attached to",
        (enemy) => [
          fx("nsmAttachClue", { target: enemy.id, source: clue.id, player: p }),
        ],
      );
      return true;
    }
    case "nsmAttachClue": {
      const enemy = get(s, e.target),
        clue = s.staging.find((u) => u.id === e.source);
      if (enemy && clue) clueToEnemy(s, clue, enemy);
      return true;
    }
    case "nsmEnemyTrail": {
      // "Search the encounter discard pile for a Clue card and attach it to a
      // Mordor enemy in play, if able. If no card is attached by this effect,
      // The Enemy's Trail gains surge."
      const found = s.encounterDiscard.includes(CLUE);
      if (
        !found ||
        !chooseHunter(
          s,
          "The Enemy's Trail · Choose the Mordor enemy the Clue is attached to",
          (enemy) => [fx("nsmTrailClue", { target: enemy.id, player: p })],
        )
      ) {
        log(
          s,
          `The Enemy's Trail · ${found ? "There is no Mordor enemy in play" : "There is no Clue in the encounter discard pile"}${e.flag ? ", so it gains surge" : ""}.`,
          e.flag ? "danger" : "normal",
        );
        if (e.flag) prepend(s, ...surgeEffects(G.enemyTrail));
      }
      return true;
    }
    case "nsmTrailClue": {
      const enemy = get(s, e.target);
      const i = s.encounterDiscard.lastIndexOf(CLUE);
      if (!enemy || i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      enemy.attachments.push({
        id: `a${s.nextId++}`,
        code: CLUE,
        exhausted: false,
      });
      log(
        s,
        `The Enemy's Trail attaches a Clue from the encounter discard pile to ${name(enemy)} (${cluesOnMordor(s)} Clues on Mordor enemies).`,
        "danger",
      );
      return true;
    }
    case "nsmRestless": {
      // "The first player chooses a Clue card attached to a hero and attaches
      // it to a Mordor enemy in play, if able." (Surge is a printed keyword.)
      const held = allHeroes(s).flatMap((h) =>
        h.attachments.filter((a) => a.code === CLUE).map((a) => ({ h, a })),
      );
      if (!held.length || !mordorEnemies(s).length) {
        log(
          s,
          "Restless Hunters · No hero holds a Clue, or no Mordor enemy is in play.",
        );
        return true;
      }
      if (held.length === 1 && !e.source) {
        prepend(
          s,
          fx("nsmRestless", {
            player: p,
            target: held[0].h.id,
            source: held[0].a.id,
          }),
        );
        return true;
      }
      if (!e.source) {
        choose(
          s,
          "Restless Hunters · Choose a Clue attached to a hero",
          held.map(({ h, a }): Option => ({
            id: `${h.id}:${a.id}`,
            code: CLUE,
            label: `Signs of Gollum on ${name(h)}`,
            effects: [
              fx("nsmRestless", { player: p, target: h.id, source: a.id }),
            ],
          })),
          card(G.restless).text,
        );
        return true;
      }
      chooseHunter(
        s,
        "Restless Hunters · Choose the Mordor enemy the Clue is attached to",
        (enemy) => [
          fx("nsmMoveClue", {
            target: enemy.id,
            source: e.source,
            ids: [e.target!],
            player: p,
          }),
        ],
      );
      return true;
    }
    case "nsmMoveClue": {
      const enemy = get(s, e.target),
        hero = get(s, e.ids?.[0]);
      const a = hero?.attachments.find((x) => x.id === e.source);
      if (!enemy || !hero || !a) return true;
      hero.attachments = hero.attachments.filter((x) => x.id !== a.id);
      enemy.attachments.push(a);
      log(
        s,
        `Restless Hunters moves the Clue from ${name(hero)} to ${name(enemy)} (${cluesOnMordor(s)} Clues on Mordor enemies).`,
        "danger",
      );
      return true;
    }
    case "nsmRestlessTarget": {
      if (s.combat && get(s, e.target)) {
        s.combat.undefendedTargetId = e.target;
        log(
          s,
          `Restless Hunters: the attack's damage must go to ${name(get(s, e.target)!)}, who holds a Clue.`,
          "danger",
        );
      }
      return true;
    }
    case "nsmTrailCold": {
      // "Attach to the active location and remove all progress from that
      // location. (Limit 1 per location.) If The Trail Goes Cold does not
      // attach to a location as a result of its effect, it gains surge."
      const l = s.activeLocation;
      if (!l || l.attachments.some((a) => a.code === G.trailCold)) {
        s.encounterDiscard.push(G.trailCold);
        log(
          s,
          `The Trail Goes Cold · ${l ? "The active location already has one" : "There is no active location"}, so it gains surge.`,
          "danger",
        );
        prepend(s, ...surgeEffects(G.trailCold));
        return true;
      }
      l.attachments.push({
        id: `a${s.nextId++}`,
        code: G.trailCold,
        exhausted: false,
      });
      const lost = l.progress;
      l.progress = 0;
      log(
        s,
        `The Trail Goes Cold is attached to ${name(l)}${lost ? `, removing ${lost} progress` : ""}: its [threat] counts during the quest phase as if it were in the staging area.`,
        "danger",
      );
      return true;
    }
    case "nsmWargHunters": {
      let at = s.encounterDeck.indexOf(HUNTERS);
      let from = "encounter deck";
      if (at >= 0) s.encounterDeck.splice(at, 1);
      else {
        at = s.encounterDiscard.lastIndexOf(HUNTERS);
        from = "encounter discard pile";
        if (at >= 0) s.encounterDiscard.splice(at, 1);
      }
      shuffle(s, s.encounterDeck);
      if (at < 0) {
        log(
          s,
          "Hunting Warg · No Hunters from Mordor is in the encounter deck or discard pile.",
        );
        return true;
      }
      const u = make(s, HUNTERS);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(
        s,
        `Hunting Warg entered play this round: Hunters from Mordor joins the staging area from the ${from}.`,
        "danger",
      );
      return true;
    }
    case "nsmFolly": {
      // Stage 3A: "Add Rob & Bob to the staging area. Then, each player must
      // search the encounter deck and discard pile for a non-unique Troll
      // enemy and add it to the staging area, if able. Shuffle the encounter
      // deck."
      const rob = make(s, G.robBob);
      s.staging.push(rob);
      enemyAddedToStaging(s, rob);
      log(s, "Rob & Bob enter the staging area.", "danger");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("nsmFollyTroll", { player })),
        fx("nsmShuffle", { player: p }),
      );
      return true;
    }
    case "nsmFollyTroll": {
      // Each player searches for a non-unique Troll enemy (the encounter
      // deck first, then the discard pile) and chooses among the titles found.
      const troll = (code: string) =>
        card(code).type_code === "enemy" &&
        !card(code).is_unique &&
        traitOf(code, "Troll");
      const found = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard].filter(troll)),
      ];
      if (!found.length) {
        log(
          s,
          "Grimbeorn's Folly · No non-unique Troll is left to search for.",
        );
        return true;
      }
      const code = e.code ?? (found.length === 1 ? found[0] : undefined);
      if (!code || !found.includes(code)) {
        choose(
          s,
          `Grimbeorn's Folly · Search for a non-unique Troll enemy${seatLabel(s, p)}`,
          found.map((x): Option => ({
            id: x,
            code: x,
            label: card(x).name,
            effects: [fx("nsmFollyTroll", { player: p, code: x })],
          })),
          card(G.folly).text,
        );
        return true;
      }
      const at = s.encounterDeck.indexOf(code);
      if (at >= 0) s.encounterDeck.splice(at, 1);
      else s.encounterDiscard.splice(s.encounterDiscard.indexOf(code), 1);
      const u = make(s, code);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(
        s,
        `Grimbeorn's Folly: ${several(s) ? `${seatName(s, p)} adds` : "you add"} ${name(u)} to the staging area.`,
        "danger",
      );
      return true;
    }
    case "nsmShuffle":
      shuffle(s, s.encounterDeck);
      return true;
    case "nsmLouisThreat":
      if ((e.value ?? 0) > 0) {
        raiseThreat(s, e.value!, "encounter");
        log(
          s,
          `Louis: ${several(s) ? `${seatName(s, p)} raises their` : "you raise your"} threat by ${e.value} after the attack.`,
          "danger",
        );
      }
      return true;
    case "nsmRobBob": {
      const rob = get(s, e.target);
      if (!rob) return true;
      forOwner(s, p, () => engage(s, rob));
      log(
        s,
        `Rob & Bob engage ${several(s) ? seatName(s, p) : "you"} and make an additional attack.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: rob.id, player: p }));
      return true;
    }
    case "nsmSacked": {
      const sacked = sackedInPlay(s);
      if (!sacked.length) return true;
      choose(
        s,
        "Conflict at the Carrock · A unique Troll was defeated: discard a Sacked! card?",
        [
          ...sacked.map(({ h, a }): Option => ({
            id: `${h.id}:${a.id}`,
            code: a.code,
            label: `Sacked! on ${name(h)}`,
            effects: [
              fx("nsmSackedDiscard", { target: h.id, source: a.id, player: p }),
            ],
          })),
          { id: "skip", label: "Keep the Sacked! cards", effects: [] },
        ],
        card(G.carrockCard).back_text,
      );
      return true;
    }
    case "nsmSackedDiscard": {
      const h = get(s, e.target);
      const a = h?.attachments.find((x) => x.id === e.source);
      if (h && a) {
        discardAttachment(s, h, a);
        log(s, `Sacked! is discarded from ${name(h)}.`, "good");
      }
      return true;
    }
    case "nsmSupper": {
      // "The first player chooses a hero in any player's discard pile and
      // removes that hero from the game. Then, heal all damage from each
      // Troll enemy in play. If no damage is removed from any Troll enemy as
      // a result of this effect, Time for Supper gains surge."
      const fallen = playerOrder(s).flatMap((x) =>
        seatView(s, x)
          .discard.filter((c) => card(c).type_code === "hero")
          .map((c) => ({ player: x, code: c })),
      );
      if (fallen.length && e.code === undefined)
        choose(
          s,
          "Time for Supper · Remove a hero in a discard pile from the game",
          fallen.map((h): Option => ({
            id: `${h.player}:${h.code}`,
            code: h.code,
            label: `${card(h.code).name}${several(s) ? ` · ${seatName(s, h.player)}` : ""}`,
            effects: [
              fx("nsmSupper", { player: p, code: h.code, value: h.player }),
            ],
          })),
          card(G.supper).text,
        );
      else {
        if (e.code) {
          const owner = e.value ?? p;
          const pile = seatView(s, owner).discard;
          const at = pile.indexOf(e.code);
          if (at >= 0) {
            pile.splice(at, 1);
            seatView(s, owner).removed.push(e.code);
            log(
              s,
              `Time for Supper removes ${card(e.code).name} from the game.`,
              "danger",
            );
          }
        }
        let healed = 0;
        for (const u of [...s.staging, ...allEngaged(s)].filter(isTrollUnit)) {
          healed += u.damage;
          u.damage = 0;
        }
        if (healed)
          log(
            s,
            `Time for Supper heals ${healed} damage from the Troll enemies.`,
            "danger",
          );
        else {
          log(
            s,
            "Time for Supper heals no damage from a Troll, and gains surge.",
            "danger",
          );
          prepend(s, ...surgeEffects(G.supper));
        }
      }
      return true;
    }
    case "nsmWatchedShadow": {
      if (s.heroes.some(hasClue)) {
        log(
          s,
          `Watched Path · ${several(s) ? `${seatName(s, p)} controls` : "You control"} a Clue.`,
        );
        return true;
      }
      const n = s.hand.length;
      for (const u of [...s.hand])
        discardHandCard(s, u.id, { encounterEffect: true });
      log(
        s,
        `Watched Path: without a Clue, ${several(s) ? `${seatName(s, p)} discards` : "you discard"} ${n} ${n === 1 ? "card" : "cards"} from hand.`,
        n ? "danger" : "normal",
      );
      return true;
    }
    case "nsmPoolsAlly": {
      if (e.target) {
        const ally = get(s, e.target);
        if (ally && s.allies.some((a) => a.id === ally.id)) {
          discardCharacter(s, ally);
          log(s, `Dark Pools: ${name(ally)} is discarded.`, "danger");
        }
        return true;
      }
      const allies = s.allies.filter((a) => card(a.code).type_code === "ally");
      if (!allies.length) return true;
      const printed = (a: Unit) => Number(card(a.code).cost) || 0;
      const top = Math.max(...allies.map(printed));
      const tied = allies.filter((a) => printed(a) === top);
      if (tied.length === 1)
        prepend(s, fx("nsmPoolsAlly", { target: tied[0].id, player: p }));
      else
        choose(
          s,
          `Dark Pools · Discard an ally with the highest printed cost (${top})${seatLabel(s, p)}`,
          tied.map((a): Option => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [fx("nsmPoolsAlly", { target: a.id, player: p })],
          })),
          card(G.pools).text,
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nsmRestlessTarget",
  "nsmWatchedShadow",
  "nsmPoolsAlly",
  "nsmLouisThreat",
  "nsmFollyTroll",
]);
export const NIGHTMARE_SOM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: (s, u) => {
    const out: Partial<
      Record<"will" | "attack" | "defense" | "health", number>
    > = { ...somStats(s, u) };
    for (const [k, v] of Object.entries(carrockStats(s, u)) as [
      "attack" | "defense" | "health",
      number,
    ][])
      if (v) out[k] = (out[k] ?? 0) + v;
    return out;
  },
  stagingThreat: somStagingThreat,
  locationProgressBlocked: somProgressBlocked,
  locationProgressPlaced: carrockProgressPlaced,
  cannotDraw: somCannotDraw,
  cannotAttach: carrockCannotAttach,
  cannotReady: carrockCannotReady,
  cannotReduceThreat: carrockCannotReduceThreat,
  attachmentLeaves: somAttachmentLeaves,
  cardEntered: somCardEntered,
  refreshStart: somRefreshStart,
  roundEnd: somRoundEnd,
  check: somCheck,
  travelEntered: somTravelEntered,
  questBegin: carrockQuestBegin,
  questProgressPlaced: carrockQuestProgressPlaced,
  endQuest: carrockEndQuest,
  enemyDestination: carrockEnemyDestination,
  attackFinished: carrockAttackFinished,
  stageInfo: carrockStageInfo,
  encounter: somEncounter,
  shadow: somShadow,
  effect: nightmareSomEffect,
  sharedEffect: (e) => e.kind.startsWith("nsm") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareSom(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    (q.lookout === undefined ||
      (Array.isArray(q.lookout) &&
        q.lookout.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            round(m.round) &&
            Number.isInteger(m.amount) &&
            m.amount >= 0,
        ))) &&
    (q.wargs === undefined ||
      (Array.isArray(q.wargs) &&
        q.wargs.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        ))) &&
    (q.carrockPlaced === undefined || round(q.carrockPlaced)) &&
    (q.noRefresh === undefined ||
      (Array.isArray(q.noRefresh) &&
        q.noRefresh.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        ))) &&
    (q.robRound === undefined || round(q.robRound)) &&
    (q.robDefeated === undefined || typeof q.robDefeated === "boolean")
  );
}
