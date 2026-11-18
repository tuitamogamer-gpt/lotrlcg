import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, stagingThreat, threatOf } from "../src/game/core";
import { optionalEngagementProblem } from "../src/game/actions";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { CAVES, CAVES_STAGES } from "../src/game/caves-nibin-dum-support";
import { OATH } from "../src/game/the-oath-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const CAVES_SIM_SCENARIOS = [
  "the-caves-of-nibin-dum-2018",
  "the-caves-of-nibin-dum",
] as const satisfies readonly ScenarioId[];
export type CavesSimScenario = (typeof CAVES_SIM_SCENARIOS)[number];
export const isCavesSimScenario = (id: ScenarioId): id is CavesSimScenario =>
  CAVES_SIM_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
const stageOf = (s: GameState) =>
  s.caves
    ? (CAVES_STAGES as readonly string[]).indexOf(s.caves.currentQuest) + 1
    : 0;
/** A searched option is a code or an encounter card's title. */
const codeOf = (key: string) =>
  [...Object.values(CAVES), ...Object.values(OATH)].find(
    (c) => c === key || card(c).name === key,
  ) ?? "";
const attackOf = (key: string) => {
  const c = codeOf(key);
  return c ? Number(card(c).attack) || 0 : 9;
};
const worth = (c: string) =>
  (card(c).willpower ?? 0) + (card(c).attack ?? 0) + (card(c).defense ?? 0);
/** Less dangerous encounter cards first: locations by threat, then enemies. */
const danger = (key: string) => {
  const c = codeOf(key);
  if (!c) return 30;
  const t = card(c).type_code;
  return t === "location"
    ? Number(card(c).threat) || 0
    : t === "enemy"
      ? 10 + (card(c).attack ?? 0)
      : 20;
};

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function cavesSimulationChoice(s: GameState): Option | undefined {
  if (!isCavesSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const by = (id: string) => options.find((o) => o.id === id);
  if (/^Revealed · /.test(title)) return by("resolve");
  if (
    /Attach Cave Torch to one of your heroes|^Cave Torch · Attach/.test(title)
  )
    return options[0];
  if (/Add a different (location|enemy) to the staging area/.test(title))
    return [...options].sort(
      (a, b) => danger(a.code ?? a.label) - danger(b.code ?? b.label),
    )[0];
  if (/^Lost in the Dark · /.test(title)) return by("torch") ?? options[0];
  if (/^Cavern Warg · Exhaust Cave Torch/.test(title)) return by("torch");
  // At 4B the Chieftain takes damage only with 8 progress on the stage:
  // remove X progress only if 8 remain, else return it to the staging area.
  if (/^Goblin Chieftain · Remove/.test(title))
    return stageOf(s) === 4
      ? ((s.progress >= 8 + 4 ? by("progress") : undefined) ?? by("return"))
      : (by("progress") ?? by("return"));
  if (/^Watchful Eyes · Attach/.test(title)) return options[0];
  if (/^Crumbling Ruin · Exhaust/.test(title))
    return [...options].sort((a, b) => room(s, b.id) - room(s, a.id))[0];
  if (/^Branching Paths · Choose/.test(title))
    return [...options].sort(
      (a, b) => danger(a.code ?? a.label) - danger(b.code ?? b.label),
    )[0];
  if (/Put an ally from the top 5 cards/.test(title))
    return (
      [...options]
        .filter((o) => o.id !== "skip")
        .sort((a, b) => worth(b.code ?? "") - worth(a.code ?? ""))[0] ??
      by("skip")
    );
  if (/^Cracked Pillar · Declare attackers/.test(title))
    return options.find((o) => get(s, o.id)) ?? by("attack") ?? by("skip");
  // The options are titles: the Goblin enemy with the least attack.
  if (/^Goblins are Upon You! · /.test(title))
    return [...options].sort(
      (a, b) => attackOf(a.code ?? a.label) - attackOf(b.code ?? b.label),
    )[0];
  if (/^Eyes in the Dark · Choose/.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    return ally ?? by("threat") ?? options[0];
  }
  // Damage to a character, or assigned damage: the most remaining hit points.
  if (
    /Deal \d damage to a character|Assign damage among|Assign Archery damage/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  if (/Exhaust a character you control|Discard an ally you control/.test(title))
    return (
      [...options.filter((o) => isAlly(s, o.id))].sort(
        (a, b) => room(s, a.id) - room(s, b.id),
      )[0] ?? options[0]
    );
  // Great Cave-troll's additional attack in the last fight: the defender
  // that takes the least excess damage.
  const attacker = s.combat ? get(s, s.combat.enemyId) : undefined;
  if (
    /Immediate attack/i.test(title) &&
    attacker?.code === CAVES.troll &&
    stageOf(s) === 4 &&
    s.progress >= 8
  ) {
    const attack = stats(s, attacker).attack;
    const excess = (id: string) => {
      const u = get(s, id);
      return u ? Math.max(0, attack - stats(s, u).defense - room(s, id)) : 99;
    };
    const best = [...options.filter((o) => get(s, o.id))].sort(
      (a, b) => excess(a.id) - excess(b.id),
    )[0];
    if (best) return best;
  }
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id))].sort((a, b) => {
        const ua = units.find((u) => u.id === a.id)!;
        const ub = units.find((u) => u.id === b.id)!;
        return stats(s, ub).defense - stats(s, ua).defense;
      })[0] ??
      by("undefended") ??
      options[0]
    );
  }
  for (const id of ["use", "gain", "draw"]) {
    const preferred = by(id);
    if (preferred) return preferred;
  }
  return by("skip") ?? by("resolve") ?? options[0];
}

export function cavesSimulationAction(s: GameState): Action | undefined {
  if (!isCavesSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const stage = stageOf(s);
  const open = stage === 4 && s.progress >= 8;
  // The last fight: with 12 progress at 4B, 8 remain after Goblin
  // Chieftain's Forced effect, so it can still take damage.
  const ready4 = stage === 4 && s.progress >= 12;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area; in the last fight, Goblin Chieftain.
  if (s.phase === "encounter") {
    const chieftain = s.staging.find(
      (u) => u.code === CAVES.chieftain && !optionalEngagementProblem(s, u),
    );
    if (
      chieftain &&
      ready4 &&
      !engagedEnemies(s).some((u) => u.code === CAVES.chieftain)
    )
      return { type: "ENGAGE", id: chieftain.id };
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          u.code !== CAVES.chieftain &&
          !optionalEngagementProblem(s, u),
      )
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
    const ready = characters(s).filter((u) => !u.exhausted).length;
    if (weakest && s.engaged.length < 2 && ready >= 2)
      return { type: "ENGAGE", id: weakest.id };
    return;
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const attack = stats(s, enemy).attack;
      // Great Cave-troll removes 1 progress per point of excess damage: in
      // the last fight, the defender that takes the least excess damage.
      if (enemy.code === CAVES.troll && open) {
        const excess = (u: Unit) =>
          Math.max(0, attack - stats(s, u).defense - room(s, u.id));
        const best = [...candidates].sort(
          (a, b) =>
            excess(a) - excess(b) ||
            room(s, b.id) +
              stats(s, b).defense -
              (room(s, a.id) + stats(s, a).defense),
        )[0];
        if (best)
          return { type: "DEFEND", enemyId: enemy.id, defenderId: best.id };
      }
      const hero = [...candidates]
        .filter(
          (u) =>
            card(u.code).type_code === "hero" &&
            room(s, u.id) + stats(s, u).defense > attack + 1,
        )
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
      const ally = [...candidates]
        .filter((u) => card(u.code).type_code !== "hero")
        .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
      const defender =
        hero ??
        ally ??
        [...candidates].sort(
          (a, b) => stats(s, b).defense - stats(s, a).defense,
        )[0];
      return {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    }
  }
  if (s.phase === "attack") {
    const me = activeSeat(s);
    // The first player breaks Cracked Pillar once the engaged enemies are done.
    const pillar = s.staging.find((u) => u.code === CAVES.pillar);
    const targets = engagedEnemies(s).filter(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    const chieftain = targets.find((e) => e.code === CAVES.chieftain);
    const enemy =
      (chieftain && open ? chieftain : undefined) ??
      targets.find((e) => e.code !== CAVES.chieftain);
    if (enemy)
      return {
        type: "ATTACK",
        enemyId: enemy.id,
        attackerIds: attackersFor(s, enemy)
          .filter((u) => ownerOf(s, u) === me)
          .map((u) => u.id),
      };
    if (
      pillar &&
      stage === 3 &&
      pillar.damage < 4 &&
      me === firstPlayer(s) &&
      s.caves?.pillarAttacked !== s.round &&
      characters(s).some((u) => !u.exhausted && stats(s, u).attack > 0)
    )
      return { type: "ABILITY", id: pillar.id };
    return { type: "END_ATTACKS" };
  }
  if (s.phase === "quest") {
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back. In the last fight the player facing Goblin
    // Chieftain keeps every character back to attack it.
    if (ready4 && s.engaged.some((u) => u.code === CAVES.chieftain))
      return { type: "COMMIT" };
    // At 4B, enough willpower to bring the stage to 12 progress.
    const target =
      stagingThreat(s) +
      (stage === 4 ? Math.max(3, 12 - s.progress) : 3 * players(s));
    const committed = characters(s)
      .filter((u) => s.committedIds.includes(u.id))
      .reduce((n, u) => n + stats(s, u).will, 0);
    const own = characters(s)
      .filter(
        (u) =>
          canCommit(s, u) &&
          stats(s, u).will > 0 &&
          !s.committedIds.includes(u.id),
      )
      .sort(
        (a, b) =>
          stats(s, b).will -
            stats(s, b).attack -
            (stats(s, a).will - stats(s, a).attack) ||
          stats(s, b).will - stats(s, a).will,
      );
    const guard = [...characters(s)].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const next =
      own.find((u) => u.id !== guard?.id) ?? (committed ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const locations = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // Cracked Pillar first (it advances the quest), else the highest threat.
  const score = (u: Unit) =>
    (u.code === CAVES.pillar ? 50 : 0) + threatOf(s, u);
  const location = locations.sort((a, b) => score(b) - score(a))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/** Each player puts up to 3 non-unique allies from his deck into play. */
function reinforce(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const picks = [...s.deck.entries()]
        .filter(([, c]) => card(c).type_code === "ally" && !card(c).is_unique)
        .sort(
          ([i, a], [j, b]) =>
            (card(b).willpower ?? 0) - (card(a).willpower ?? 0) || i - j,
        )
        .slice(0, 3)
        .map(([i]) => i)
        .sort((i, j) => j - i);
      for (const i of picks) {
        const ally = make(s, s.deck.splice(i, 1)[0]);
        ally.owner = p;
        s.allies.push(ally);
      }
    });
}
/**
 * A late-game start at The Chasm (3B): Goblin Chieftain is set aside and
 * Cracked Pillar is in the staging area, undamaged. Each player's threat is
 * 20 and each player has put up to 3 non-unique allies from his deck into
 * play.
 */
export function cavesChasm(s: GameState) {
  const q = s.caves!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
  q.setAside = q.setAside.filter((c) => c !== CAVES.pillar);
  s.staging.push(make(s, CAVES.pillar));
  q.currentQuest = CAVES.chasm;
  s.stage = 3;
  s.progress = 0;
}
/**
 * The last fight, at Oathkeepers (4B): the stage holds 16 progress, so Goblin
 * Chieftain can take damage even after its Forced effect removes 4 and Great
 * Cave-troll's excess damage removes some more; it is engaged with the first
 * player with 3 hit points left, and Cracked Pillar has been explored. Each
 * player's threat is 20 and each player has put up to 3 non-unique allies
 * from his deck into play.
 */
export function cavesFinal(s: GameState) {
  const q = s.caves!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
  q.setAside = q.setAside.filter(
    (c) => c !== CAVES.pillar && c !== CAVES.chieftain,
  );
  s.encounterDiscard.push(CAVES.pillar);
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const chieftain = make(s, CAVES.chieftain);
    chieftain.damage = (card(CAVES.chieftain).health ?? 8) - 3;
    s.engaged.push(chieftain);
  });
  q.currentQuest = CAVES.oathkeepers;
  s.stage = 4;
  s.progress = 16;
}
