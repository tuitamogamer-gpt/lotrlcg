/**
 * Into Ithilien's Nightmare Deck (docs/NIGHTMARE.md): its setup card's two
 * Mûmak Elites (set aside at setup, one added to the staging area as each of
 * stages 2A and 4A is revealed) and its Nightmare encounter cards, with their
 * archery, battle and siege, composed with the scenario's own rules
 * (src/game/heirs-numenor.ts) through batch4Scenario while a Nightmare mode
 * game is played. Effects use the "nii" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, stats } from "./core";
import { placeEncounter } from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
} from "./table";
import { hasResourceIcon } from "./expansion-passives";
import { surgeEffects } from "./surge";
import { druadanPlayerQuestStat } from "./druadan-player-cards";
import {
  heirsArcheryTotal,
  heirsQuestKeyword,
  heirsQuestStat,
} from "./heirs-numenor";
import { NIGHTMARE_HON as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareIthilienState {
  /** The Mûmak Elites still set aside. */
  eliteAside?: number;
  /** Savage Fray: the current quest's keyword is switched this round (an odd count). */
  fray?: { round: number; n: number };
  /** Obsidian Arrows: the current quest's archery 2 (for each resolved copy) this round. */
  arrows?: { round: number; n: number };
  /** Mûmak Elite: the damage each copy took this round. */
  eliteDamage?: { round: number; taken: Record<string, number> };
  /** Dense Thickets' attack: the attacking enemy. */
  thickets?: string;
}

const ithLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "into-ithilien";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const harad = (u: Unit) => traitOf(u.code, "Harad");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const battle = (s: GameState) => heirsQuestKeyword(s, "Battle");
const siege = (s: GameState) => heirsQuestKeyword(s, "Siege");
const captains = (s: GameState) =>
  enemiesInPlay(s).filter((u) => live(s, u, N.captain)).length;
const overlookInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some((l) => live(s, l, N.overlook));
const players = (s: GameState) => playerOrder(s).length;
/** Ranger objectives in play: Celador and Ithilien Guardian, in the staging area or controlled. */
const rangerObjectives = (s: GameState) =>
  [...s.staging, ...allCharacters(s)].filter(
    (u) =>
      card(u.code).type_code === "objective-ally" && traitOf(u.code, "Ranger"),
  );
/** An enemy's archery value (Obsidian Arrows' shadow). */
export function nightmareArcheryOf(s: GameState, u: Unit) {
  if (u.blanked) return 0;
  const text = card(u.code).text ?? "";
  let n = 0;
  const printed = /Archery (\d+)/.exec(text);
  if (printed) n += Number(printed[1]);
  else if (/Archery X/.test(text))
    n += /different resource icons/.test(text)
      ? ["leadership", "tactics", "spirit", "lore"].filter((sphere) =>
          [...allCharacters(s)].some(
            (h) =>
              card(h.code).type_code === "hero" && hasResourceIcon(h, sphere),
          ),
        ).length
      : players(s);
  if (ithLive(s)) {
    if (u.code === N.marksman && battle(s)) n += 2;
    if (harad(u) && s.staging.some((x) => x.id === u.id)) n += captains(s);
  }
  return n;
}

// ------------------------------------------------------------- the setup card

/** "Forced: When quest stages 2A or 4A are revealed, add 1 of the previously set aside copies of Mûmak Elite to the staging area." */
function ithStageRevealed(s: GameState, stage: number) {
  const q = s.nightmare;
  if (!ithLive(s) || (stage !== 2 && stage !== 4) || !q?.eliteAside) return;
  q.eliteAside -= 1;
  placeEncounter(s, N.elite, true);
  log(
    s,
    `Into Ithilien · Nightmare: stage ${stage}A adds a set-aside Mûmak Elite to the staging area (${q.eliteAside} left aside).`,
    "danger",
  );
}

// ------------------------------------------------------------- archery

/**
 * Mûmak Elite's archery X (the number of players), Haradrim Marksman's
 * archery 2 while the current quest has battle, Haradrim Captain's archery 1
 * for each Harad enemy in the staging area, Ithilien Overlook's archery 2 and
 * Obsidian Arrows' archery 2 on the current quest this round.
 */
function ithArcheryBonus(s: GameState) {
  if (!ithLive(s)) return 0;
  let n = 0;
  for (const u of enemiesInPlay(s)) {
    if (live(s, u, N.elite)) n += players(s);
    if (live(s, u, N.marksman) && battle(s)) n += 2;
  }
  n += captains(s) * s.staging.filter((u) => isEnemy(u) && harad(u)).length;
  n +=
    2 *
    [...s.staging, ...allActiveLocations(s)].filter((l) =>
      live(s, l, N.overlook),
    ).length;
  const a = s.nightmare?.arrows;
  if (a && a.round === s.round) n += 2 * a.n;
  return n;
}
/** Ithilien Overlook: "you must continue assigning archery damage to that character until that character is destroyed or there is no more archery damage to assign." */
function ithArcheryTargets(s: GameState, characters: Unit[], last?: Unit) {
  if (!ithLive(s) || !last || !overlookInPlay(s)) return undefined;
  const same = characters.filter((u) => u.id === last.id);
  return same.length ? same : undefined;
}

// ------------------------------------------------------------- the cards

/** Haradrim Marksman and Cormallen Fields: +2 [threat] while the current quest has battle. Dense Thickets: +1 [threat] for each Forest location. */
function ithThreatBonus(s: GameState, u: Unit) {
  if (!ithLive(s)) return 0;
  let n = 0;
  if ((live(s, u, N.marksman) || live(s, u, N.cormallen)) && battle(s)) n += 2;
  if (card(u.code).type_code === "location" && traitOf(u.code, "Forest"))
    n += s.staging.filter((l) => live(s, l, N.thickets)).length;
  return n;
}
/** Haradrim Marksman: +2 [attack] while the current quest has siege. Haradrim Captain: "Each engaged Harad enemy gets +1 [defense]." */
function ithStats(s: GameState, u: Unit) {
  if (!ithLive(s) || !isEnemy(u)) return {};
  return {
    attack: live(s, u, N.marksman) && siege(s) ? 2 : 0,
    defense:
      harad(u) && allEngaged(s).some((x) => x.id === u.id) ? captains(s) : 0,
  };
}
/** Haradrim Marksman: "While the current quest has siege, ... allies cannot be declared as defenders against its attacks." */
const ithCannotDefend = (s: GameState, enemy: Unit, defender?: Unit) =>
  ithLive(s) &&
  live(s, enemy, N.marksman) &&
  !!defender &&
  ["ally", "objective-ally"].includes(card(defender.code).type_code) &&
  siege(s);
/** Mûmak Elite: "Cannot have attachments." */
const ithCannotAttach = (s: GameState, u: Unit) =>
  ithLive(s) && live(s, u, N.elite);
const eliteTaken = (s: GameState, u: Unit) => {
  const e = s.nightmare?.eliteDamage;
  return e && e.round === s.round ? (e.taken[u.id] ?? 0) : 0;
};
/** Mûmak Elite: "Mûmak Elite cannot take more than 3 damage each round." */
function ithDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!ithLive(s) || amount <= 0 || !live(s, u, N.elite)) return amount;
  const left = Math.max(0, 3 - eliteTaken(s, u));
  if (left < amount)
    log(
      s,
      `Mûmak Elite cannot take more than 3 damage each round (${left} more this round).`,
    );
  return Math.min(amount, left);
}
function ithDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (!ithLive(s) || value <= 0) return;
  const q = (s.nightmare ??= {});
  if (live(s, u, N.elite)) {
    const e =
      q.eliteDamage?.round === s.round
        ? q.eliteDamage
        : { round: s.round, taken: {} };
    e.taken[u.id] = (e.taken[u.id] ?? 0) + value;
    q.eliteDamage = e;
  }
  // Dense Thickets' shadow: "Excess damage dealt by this attack ... must be
  // assigned to a Ranger objective in play."
  if (
    q.thickets &&
    context.combatDamage &&
    context.enemyId === q.thickets &&
    allCharacters(s).some((c) => c.id === u.id) &&
    card(u.code).type_code !== "objective-ally"
  ) {
    const excess = Math.min(value, u.damage - stats(s, u).health);
    if (excess > 0)
      prepend(
        s,
        fx("niiThickets", {
          value: excess,
          source: u.id,
          player: ownerOf(s, u),
        }),
      );
  }
}
/** Cormallen Fields: "While the current quest has siege, when faced with the option to travel, the players must travel to Cormallen Fields, if able." */
const cormallenInStaging = (s: GameState) =>
  s.staging.some((l) => live(s, l, N.cormallen));
const ithMustTravel = (s: GameState) =>
  ithLive(s) && !s.activeLocation && cormallenInStaging(s) && siege(s);
function ithTravelProblem(s: GameState, u: Unit) {
  if (!ithLive(s) || live(s, u, N.cormallen) || !cormallenInStaging(s))
    return null;
  return siege(s)
    ? "Cormallen Fields: while the current quest has siege, the players must travel to Cormallen Fields."
    : null;
}
/** Savage Fray: the current quest's battle is siege, or its siege battle, until the end of the round. */
function ithQuestStat(s: GameState) {
  const f = s.nightmare?.fray;
  if (!ithLive(s) || !f || f.round !== s.round || f.n % 2 === 0)
    return undefined;
  const base = heirsQuestStat(s) ?? druadanPlayerQuestStat(s);
  return base === "attack"
    ? "defense"
    : base === "defense"
      ? "attack"
      : undefined;
}

function ithEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ithLive(s) || (code !== N.arrows && code !== N.fray)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Obsidian Arrows: "When Revealed: The current quest gains archery 2 until
  // the end of the round. Then, assign all archery damage to characters in
  // play as if it were the beginning of the combat phase."
  // Savage Fray: "When Revealed: If the current quest has a keyword, until
  // the end of the round, switch that keyword from battle to siege, or siege
  // to battle, if able. If the current quest does not have a keyword, Savage
  // Fray gains surge."
  prepend(
    s,
    fx(code === N.arrows ? "niiArrows" : "niiFray", {
      player: firstPlayer(s),
    }),
  );
  return true;
}

function ithShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ithLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Haradrim Captain: "Attacking enemy gets +1 [attack] (+3 [attack]
    // instead if it has the Harad trait)."
    case N.captain:
      c.attackBonus += enemy && harad(enemy) ? 3 : 1;
      return true;
    // Obsidian Arrows: "Attacking enemy gets +X [attack]. X is that enemy's
    // archery value."
    case N.arrows:
      if (enemy) c.attackBonus += nightmareArcheryOf(s, enemy);
      return true;
    // Dense Thickets: excess damage to a Ranger objective in play.
    case N.thickets:
      (s.nightmare ??= {}).thickets = c.enemyId;
      return true;
  }
  return false;
}
function ithAttackFinished(s: GameState, _combat: Combat): Effect[] {
  if (s.nightmare?.thickets) delete s.nightmare.thickets;
  return [];
}

// ------------------------------------------------------------- effects

export function nightmareIthilienEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nii")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "niiArrows": {
      const q = (s.nightmare ??= {});
      q.arrows =
        q.arrows?.round === s.round
          ? { round: s.round, n: q.arrows.n + 1 }
          : { round: s.round, n: 1 };
      const total = heirsArcheryTotal(s);
      log(
        s,
        `Obsidian Arrows: the current quest gains archery 2 until the end of the round; ${total} archery damage is assigned now.`,
        "danger",
      );
      if (total > 0)
        prepend(
          s,
          fx("heirsArchery", { value: total, player: firstPlayer(s) }),
        );
      return true;
    }
    case "niiFray": {
      const b = battle(s),
        sg = siege(s);
      if (!b && !sg) {
        log(
          s,
          "Savage Fray: the current quest has no keyword; it gains surge.",
        );
        prepend(s, ...surgeEffects(N.fray));
        return true;
      }
      const q = (s.nightmare ??= {});
      q.fray =
        q.fray?.round === s.round
          ? { round: s.round, n: q.fray.n + 1 }
          : { round: s.round, n: 1 };
      log(
        s,
        `Savage Fray: until the end of the round, the current quest has ${b ? "siege instead of battle" : "battle instead of siege"}.`,
        "danger",
      );
      return true;
    }
    case "niiThickets": {
      const left = e.value ?? 0;
      const rangers = rangerObjectives(s).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (left <= 0 || !rangers.length) {
        if (left > 0)
          log(s, "Dense Thickets · No Ranger objective is in play.");
        return true;
      }
      log(
        s,
        `Dense Thickets: ${left} excess ${left === 1 ? "point" : "points"} of damage must be assigned to a Ranger objective.`,
        "danger",
      );
      if (rangers.length === 1) {
        prepend(s, fx("damage", { target: rangers[0].id, value: left }));
        return true;
      }
      choose(
        s,
        `Dense Thickets · Assign ${left} excess damage to a Ranger objective${seatLabel(s, p)}`,
        rangers.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("damage", { target: u.id, value: left })],
        })),
        card(N.thickets).shadow,
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_ITHILIEN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: ithStageRevealed,
  archeryBonus: ithArcheryBonus,
  archeryTargets: ithArcheryTargets,
  threatBonus: ithThreatBonus,
  stats: ithStats,
  cannotDefend: ithCannotDefend,
  cannotAttach: ithCannotAttach,
  damageAmount: ithDamageAmount,
  damageDealt: ithDamageDealt,
  mustTravel: ithMustTravel,
  travelProblem: ithTravelProblem,
  questStat: ithQuestStat,
  encounter: ithEncounter,
  shadow: ithShadow,
  attackFinished: ithAttackFinished,
  effect: nightmareIthilienEffect,
  sharedEffect: (e) => e.kind.startsWith("nii"),
};

// ------------------------------------------------------------- saves

export function validNightmareIthilien(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const counted = (v: unknown) =>
    !!v &&
    typeof v === "object" &&
    Number.isInteger((v as { round: unknown }).round) &&
    Number.isInteger((v as { n: unknown }).n) &&
    (v as { n: number }).n > 0;
  return (
    (q.eliteAside === undefined ||
      (Number.isInteger(q.eliteAside) &&
        q.eliteAside >= 0 &&
        q.eliteAside <= 2)) &&
    (q.fray === undefined || counted(q.fray)) &&
    (q.arrows === undefined || counted(q.arrows)) &&
    (q.eliteDamage === undefined ||
      (!!q.eliteDamage &&
        Number.isInteger(q.eliteDamage.round) &&
        !!q.eliteDamage.taken &&
        typeof q.eliteDamage.taken === "object" &&
        Object.values(q.eliteDamage.taken).every(
          (n) => Number.isInteger(n) && n >= 0,
        ))) &&
    (q.thickets === undefined || typeof q.thickets === "string")
  );
}

// ------------------------------------------------------------- the table

/** The table's goal line for the set-aside Mûmak Elites in Nightmare mode. */
export function nightmareIthilienGoal(s: GameState): string | undefined {
  const n = ithLive(s) ? (s.nightmare?.eliteAside ?? 0) : 0;
  return n
    ? `Mûmak Elite · ${n} set aside (one enters the staging area as each of stages 2A and 4A is revealed)`
    : undefined;
}
