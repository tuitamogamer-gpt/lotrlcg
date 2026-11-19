/**
 * Peril in Pelargir's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * Forced effects on Alcaron's Scroll (in the staging area at the end of the
 * combat phase, it attaches to the enemy in play with the highest [defense];
 * attached to an enemy at the beginning of the refresh phase, that enemy gets
 * 1 progress token; an enemy with 3 or more progress tokens has escaped with
 * the scroll, and the players lose) and its Nightmare encounter cards,
 * composed with the scenario's own rules (src/game/heirs-numenor.ts) through
 * batch4Scenario while a Nightmare mode game is played. Effects use the "npp"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, stats } from "./core";
import { engage, exhaustCharacter, removeFromQuest } from "./board";
import {
  activeSeat,
  allEngaged,
  allHeroes,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { HEIRS_NUMENOR as H } from "./heirs-numenor-support";
import { heirsMoveScroll } from "./heirs-numenor";
import { NIGHTMARE_HON as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  lose,
  seatLabel,
  traitOf,
} from "./nightmare-core";

export interface NightmarePelargirState {
  /** They're Getting Away!: +2 [threat] for each card in the staging area (for each resolved copy) until the end of the phase. */
  getaway?: { round: number; phase: string; n: number };
  /** Bedlam in the Streets: the enemies engaged by its effect, which then make immediate attacks. */
  bedlam?: { enemyId: string; player: number }[];
}

const ppLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "peril-in-pelargir";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const scrolled = (u: Unit) => u.attachments.some((a) => a.code === H.scroll);
const scrollHero = (s: GameState) => allHeroes(s).find(scrolled);
const scrollEnemy = (s: GameState) => enemiesInPlay(s).find(scrolled);
const scrollInStaging = (s: GameState) =>
  s.staging.some((u) => u.code === H.scroll);
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const docksideInStaging = (s: GameState) =>
  s.staging.some((l) => live(s, l, N.dockside));
/** The game phase of an engine step (staging and quest resolution are the quest phase). */
const gamePhase = (s: GameState) =>
  s.phase === "staging"
    ? "quest"
    : s.phase === "defense" || s.phase === "attack"
      ? "combat"
      : s.phase;
const progressOn = (s: GameState, u: Unit, n: number, source: string) => {
  u.progress += n;
  log(
    s,
    `${source}: ${name(u)} gets ${n} progress ${n === 1 ? "token" : "tokens"} (${u.progress} of 3 before it escapes with Alcaron's Scroll).`,
    "danger",
  );
  ppCheck(s);
};

// ------------------------------------------------------------- the setup card

/** "Forced: At the end of the combat phase, if Alcaron's Scroll is in the staging area, attach it to the enemy in play with the highest [defense]." */
function ppCombatEnd(s: GameState) {
  if (!ppLive(s) || !scrollInStaging(s) || !enemiesInPlay(s).length) return;
  prepend(s, fx("nppScroll", { player: firstPlayer(s) }));
}
/** "Forced: At the beginning of the refresh phase, if Alcaron's Scroll is attached to an enemy, place 1 progress token on that enemy." */
function ppRefreshStart(s: GameState): Effect[] {
  const u = ppLive(s) ? scrollEnemy(s) : undefined;
  return u
    ? [fx("nppProgress", { target: u.id, value: 1, text: "setup" })]
    : [];
}
/** "If at any point there are 3 or more progress tokens on an enemy, that enemy has escaped with the scroll, and the players lose the game." */
function ppCheck(s: GameState) {
  if (!ppLive(s) || s.status !== "playing") return;
  const u = enemiesInPlay(s).find((x) => x.progress >= 3);
  if (u)
    lose(
      s,
      `${name(u)} has escaped with Alcaron's Scroll (${u.progress} progress tokens). The players lose.`,
    );
}

// ------------------------------------------------------------- the cards

/** Cunning Informant: "While Alcaron's Scroll is attached to a hero, Cunning Informant gets +3 [attack]." */
const ppStats = (s: GameState, u: Unit) =>
  ppLive(s) && live(s, u, N.informant) && scrollHero(s) ? { attack: 3 } : {};
/**
 * Pelargir Alley: "While Alcaron's Scroll is not attached to a hero, Pelargir
 * Alley gets +3 [threat]." They're Getting Away!: "each card in the staging
 * area gets +2 [threat] until the end of the phase" (each card with a
 * [threat] value).
 */
function ppThreatBonus(s: GameState, u: Unit) {
  if (!ppLive(s)) return 0;
  const g = s.nightmare?.getaway;
  const away =
    g && g.round === s.round && g.phase === gamePhase(s) && inStaging(s, u)
      ? 2 * g.n
      : 0;
  return away + (live(s, u, N.alley) && !scrollHero(s) ? 3 : 0);
}
/** Dockside Street: "While Dockside Street is in the staging area, enemies in the staging area cannot be ... optionally engaged." */
const ppCannotOptionallyEngage = (s: GameState, u: Unit) =>
  ppLive(s) && isEnemy(u) && inStaging(s, u) && docksideInStaging(s);
/** Dockside Street: "... enemies in the staging area cannot be damaged ..." */
function ppDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !ppLive(s) ||
    amount <= 0 ||
    !isEnemy(u) ||
    !inStaging(s, u) ||
    !docksideInStaging(s)
  )
    return amount;
  log(s, `Dockside Street: ${name(u)} cannot be damaged in the staging area.`);
  return 0;
}
/** Dockside Street: "Travel: Exhaust the hero with Alcaron's Scroll attached to travel here." */
function ppTravelProblem(s: GameState, u: Unit) {
  if (!ppLive(s) || !live(s, u, N.dockside)) return null;
  const h = scrollHero(s);
  return !h || h.exhausted
    ? "Dockside Street: exhaust the hero with Alcaron's Scroll attached to travel here."
    : null;
}
function ppTravelEffects(s: GameState, u: Unit) {
  if (!ppLive(s) || !live(s, u, N.dockside)) return undefined;
  const h = scrollHero(s);
  return h
    ? [fx("nppDockside", { target: h.id, player: ownerOf(s, h) })]
    : undefined;
}
/** Pelargir Ringleader: "Forced: When Pelargir Ringleader engages a player, return the topmost Brigand enemy in the encounter discard pile to play, engaged with that player." */
function ppEngaged(s: GameState, u: Unit) {
  if (!ppLive(s) || !live(s, u, N.ringleader)) return;
  prepend(s, fx("nppRingleader", { target: u.id, player: activeSeat(s) }));
}

function ppEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ppLive(s)) return false;
  // Harbor Brute: "When Revealed: If Alcaron's Scroll is attached to an
  // enemy, detach it from that enemy and attach it to Harbor Brute. Move all
  // progress tokens from that enemy to Harbor Brute."
  if (code === N.brute) {
    const brute = [...s.staging].reverse().find((u) => u.code === code);
    if (fromReveal && brute)
      prepend(s, fx("nppBrute", { target: brute.id, player: firstPlayer(s) }));
    return true;
  }
  if (code !== N.ploy && code !== N.away && code !== N.bedlam) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // The Thieves' Ploy: "When Revealed: If Alcaron's Scroll is attached to a
  // hero, choose an enemy engaged with that hero's controller, if able.
  // Attach Alcaron's Scroll to that enemy, then add 1 progress to that enemy."
  if (code === N.ploy) prepend(s, fx("nppPloy", { player: firstPlayer(s) }));
  // They're Getting Away!: "When Revealed: If Alcaron's Scroll is attached
  // to an enemy, choose one: either add 1 progress token to that enemy, or
  // each card in the staging area gets +2 [threat] until the end of the
  // phase."
  else if (code === N.away)
    prepend(s, fx("nppAway", { player: firstPlayer(s) }));
  // Bedlam in the Streets: "When Revealed: Each player must either remove a
  // hero he controls from the quest or engage an enemy in the staging area.
  // Each enemy engaged by this effect makes an immediate attack."
  else {
    if (s.nightmare) delete s.nightmare.bedlam;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("nppBedlam", { player })),
      fx("nppBedlamAttacks", { player: firstPlayer(s) }),
    );
  }
  return true;
}

function ppShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ppLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Pelargir Ringleader, Bedlam in the Streets: "Attacking enemy gets +2
    // [attack]."
    case N.ringleader:
    case N.bedlam:
      c.attackBonus += 2;
      return true;
    // Pelargir Alley: "If the defending player controls a hero with
    // Alcaron's Scroll attached, attach Alcaron's Scroll to the attacking
    // enemy."
    case N.alley: {
      const h = scrollHero(s);
      if (enemy && h && ownerOf(s, h) === defendingPlayer(s)) {
        log(
          s,
          `Pelargir Alley: Alcaron's Scroll passes from ${name(h)} to the attacking ${name(enemy)}.`,
          "danger",
        );
        heirsMoveScroll(s, enemy);
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmarePelargirEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("npp")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nppScroll": {
      if (!scrollInStaging(s)) return true;
      const foes = enemiesInPlay(s);
      if (!foes.length) return true;
      const max = Math.max(...foes.map((x) => stats(s, x).defense));
      const top = foes.filter((x) => stats(s, x).defense === max);
      log(
        s,
        "Peril in Pelargir · Nightmare: Alcaron's Scroll attaches to the enemy in play with the highest [defense].",
        "danger",
      );
      if (top.length === 1) heirsMoveScroll(s, top[0]);
      else
        choose(
          s,
          `Peril in Pelargir · Attach Alcaron's Scroll to an enemy with ${max} [defense]${seatLabel(s, p)}`,
          top.map((x): Option => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("nppAttach", { target: x.id })],
          })),
          card(N.pelargirCard).back_text,
        );
      return true;
    }
    case "nppAttach":
      if (u) heirsMoveScroll(s, u);
      return true;
    case "nppProgress":
      if (u && s.status === "playing")
        progressOn(
          s,
          u,
          e.value ?? 1,
          e.text === "setup"
            ? "Peril in Pelargir · Nightmare"
            : card(e.code ?? N.away).name,
        );
      return true;
    case "nppDockside":
      if (u && exhaustCharacter(s, u))
        log(
          s,
          `Dockside Street: ${name(u)}, with Alcaron's Scroll attached, exhausts to travel there.`,
        );
      return true;
    case "nppRingleader": {
      let at = -1;
      for (let i = s.encounterDiscard.length - 1; i >= 0; i--) {
        const code = s.encounterDiscard[i];
        if (card(code).type_code === "enemy" && traitOf(code, "Brigand")) {
          at = i;
          break;
        }
      }
      if (at < 0) {
        log(
          s,
          "Pelargir Ringleader · No Brigand enemy is in the encounter discard pile.",
        );
        return true;
      }
      const [code] = s.encounterDiscard.splice(at, 1);
      const foe = make(s, code);
      s.staging.push(foe);
      engage(s, foe);
      log(
        s,
        `Pelargir Ringleader: ${name(foe)} returns from the encounter discard pile, engaged${seatLabel(s, p) || " with you"}.`,
        "danger",
      );
      return true;
    }
    case "nppBrute": {
      const from = scrollEnemy(s);
      if (!u || !from || from.id === u.id) return true;
      const moved = from.progress;
      heirsMoveScroll(s, u);
      from.progress = 0;
      u.progress += moved;
      log(
        s,
        `Harbor Brute takes Alcaron's Scroll from ${name(from)}${moved ? ` and its ${moved} progress ${moved === 1 ? "token" : "tokens"}` : ""}.`,
        "danger",
      );
      ppCheck(s);
      return true;
    }
    case "nppPloy": {
      const h = scrollHero(s);
      if (!h) return true;
      const owner = ownerOf(s, h);
      const foes = seatView(s, owner).engaged.filter(isEnemy);
      if (!foes.length) {
        log(
          s,
          `The Thieves' Ploy · No enemy is engaged with the player whose hero, ${name(h)}, has Alcaron's Scroll.`,
        );
        return true;
      }
      if (foes.length === 1) {
        prepend(s, fx("nppPloyTo", { target: foes[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `The Thieves' Ploy · Choose an enemy to take Alcaron's Scroll${seatLabel(s, p)}`,
        foes.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("nppPloyTo", { target: x.id, player: p })],
        })),
        card(N.ploy).text,
      );
      return true;
    }
    case "nppPloyTo":
      if (!u) return true;
      heirsMoveScroll(s, u);
      progressOn(s, u, 1, "The Thieves' Ploy");
      return true;
    case "nppAway": {
      const foe = scrollEnemy(s);
      if (!foe) return true;
      choose(
        s,
        `They're Getting Away! · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "progress",
            code: foe.code,
            label: `Add 1 progress token to ${name(foe)} (${foe.progress} now)`,
            effects: [
              fx("nppProgress", { target: foe.id, value: 1, code: N.away }),
            ],
          },
          {
            id: "threat",
            code: N.away,
            label:
              "Each card in the staging area gets +2 [threat] until the end of the phase",
            effects: [fx("nppAwayThreat")],
          },
        ],
        card(N.away).text,
      );
      return true;
    }
    case "nppAwayThreat": {
      const q = (s.nightmare ??= {});
      const phase = gamePhase(s);
      q.getaway =
        q.getaway?.round === s.round && q.getaway.phase === phase
          ? { ...q.getaway, n: q.getaway.n + 1 }
          : { round: s.round, phase, n: 1 };
      log(
        s,
        `They're Getting Away!: each card in the staging area gets +${2 * q.getaway.n} [threat] until the end of the phase.`,
        "danger",
      );
      return true;
    }
    case "nppBedlam": {
      const heroes = s.heroes.filter((h) => h.committed);
      const foes = s.staging.filter(isEnemy);
      if (!heroes.length && !foes.length) {
        log(
          s,
          `Bedlam in the Streets · No questing hero and no enemy in the staging area${seatLabel(s, p)}.`,
        );
        return true;
      }
      choose(
        s,
        `Bedlam in the Streets · Remove a hero from the quest or engage an enemy${seatLabel(s, p)}`,
        [
          ...heroes.map((h): Option => ({
            id: `quest:${h.id}`,
            code: h.code,
            label: `Remove ${name(h)} from the quest`,
            effects: [fx("nppBedlamRemove", { target: h.id, player: p })],
          })),
          ...foes.map((x): Option => ({
            id: `engage:${x.id}`,
            code: x.code,
            label: `Engage ${name(x)} (it makes an immediate attack)`,
            effects: [fx("nppBedlamEngage", { target: x.id, player: p })],
          })),
        ],
        card(N.bedlam).text,
      );
      return true;
    }
    case "nppBedlamRemove":
      if (u) {
        removeFromQuest(s, u);
        log(
          s,
          `Bedlam in the Streets: ${name(u)} is removed from the quest${seatLabel(s, p)}.`,
        );
      }
      return true;
    case "nppBedlamEngage":
      if (u && inStaging(s, u)) {
        engage(s, u);
        if (s.engaged.some((x) => x.id === u.id)) {
          const q = (s.nightmare ??= {});
          q.bedlam = [...(q.bedlam ?? []), { enemyId: u.id, player: p }];
          log(
            s,
            `Bedlam in the Streets: ${name(u)} engages${seatLabel(s, p) || " you"}.`,
            "danger",
          );
        }
      }
      return true;
    case "nppBedlamAttacks": {
      const list = s.nightmare?.bedlam ?? [];
      if (s.nightmare) delete s.nightmare.bedlam;
      prepend(
        s,
        ...list
          .filter(({ enemyId, player }) =>
            seatView(s, player).engaged.some((x) => x.id === enemyId),
          )
          .map(({ enemyId, player }) =>
            fx("immediateAttack", { target: enemyId, player }),
          ),
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nppDockside",
  "nppRingleader",
  "nppBedlam",
  "nppBedlamRemove",
  "nppBedlamEngage",
]);
export const NIGHTMARE_PELARGIR_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  combatEnd: ppCombatEnd,
  refreshStart: ppRefreshStart,
  check: ppCheck,
  stats: ppStats,
  threatBonus: ppThreatBonus,
  cannotOptionallyEngage: ppCannotOptionallyEngage,
  damageAmount: ppDamageAmount,
  travelProblem: ppTravelProblem,
  travelEffects: ppTravelEffects,
  engaged: ppEngaged,
  encounter: ppEncounter,
  shadow: ppShadow,
  effect: nightmarePelargirEffect,
  sharedEffect: (e) => e.kind.startsWith("npp") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmarePelargir(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const g = q.getaway;
  return (
    (g === undefined ||
      (!!g &&
        Number.isInteger(g.round) &&
        typeof g.phase === "string" &&
        Number.isInteger(g.n) &&
        g.n > 0)) &&
    (q.bedlam === undefined ||
      (Array.isArray(q.bedlam) &&
        q.bedlam.every(
          (b) =>
            !!b &&
            typeof b.enemyId === "string" &&
            Number.isInteger(b.player) &&
            b.player >= 0,
        )))
  );
}

// ------------------------------------------------------------- the table

/** The table's goal line for Alcaron's Scroll in Nightmare mode. */
export function nightmarePelargirGoal(s: GameState): string | undefined {
  if (!ppLive(s)) return undefined;
  const foe = scrollEnemy(s);
  if (foe)
    return `Alcaron’s Scroll · ${name(foe)} has ${foe.progress} of 3 progress tokens (at 3 it escapes and the players lose)`;
  if (scrollInStaging(s))
    return "Alcaron’s Scroll · claim it before the end of the combat phase, when it attaches to the enemy with the highest defense";
  return undefined;
}
