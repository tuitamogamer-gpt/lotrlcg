import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, shuffle, stagingThreat, threatOf } from "../src/game/core";
import { optionalEngagementProblem } from "../src/game/actions";
import { addVictoryCard } from "../src/game/board";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { SA, SA_STAGE } from "../src/game/annuminas-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const SA_SIM_SCENARIOS = [
  "the-siege-of-annuminas",
] as const satisfies readonly ScenarioId[];
export type SaSimScenario = (typeof SA_SIM_SCENARIOS)[number];
export const isSaSimScenario = (id: ScenarioId): id is SaSimScenario =>
  SA_SIM_SCENARIOS.some((scenario) => scenario === id);

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

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function saSimulationChoice(s: GameState): Option | undefined {
  if (!isSaSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const by = (id: string) => options.find((o) => o.id === id);
  if (/^Revealed · /.test(title)) return by("resolve");
  // Heal the most damaged character.
  if (/^Defend the City · Heal 1 damage/.test(title))
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => (get(s, b.id)?.damage ?? 0) - (get(s, a.id)?.damage ?? 0),
      )[0] ?? by("skip")
    );
  // Take control of the Dúnedain when a hero can pay.
  if (/^Dúnedain of Annúminas · Spend 1 resource/.test(title))
    return options.find((o) => o.id !== "skip") ?? by("skip");
  if (/^The Hordes of Angmar · /.test(title))
    return (
      by("return") ??
      [...options].sort(
        (a, b) =>
          (card(a.code ?? "").attack ?? 9) - (card(b.code ?? "").attack ?? 9),
      )[0]
    );
  if (
    /^Sorcery of Carn Dûm · Discard your highest cost attachment, or assign (\d+)/.test(
      title,
    )
  ) {
    const x = Number(/assign (\d+)/.exec(title)![1]);
    return x <= 1 ? by("damage") : by("discard");
  }
  if (/^Caught in the Press · 1 damage/.test(title)) return by("willpower");
  if (/^Caught in the Press · Remove 2 progress/.test(title))
    return by("return");
  if (/^Warg of Carn Dûm · |^Orc of Angmar · |^Host of Angmar · /.test(title))
    return by("other") ?? options[0];
  // At 3B the Lieutenant needs 10 progress on the stage: keep it.
  const sortie = s.annuminas?.currentQuest === SA.sortie;
  if (/^Angmar Warg-rider · /.test(title))
    return s.progress >= 2 && !(sortie && s.progress - 2 < 10)
      ? by("progress")
      : by("other");
  if (/^Gate of Annúminas · Engage/.test(title))
    return [...options].sort(
      (a, b) => stats(s, get(s, a.id)!).attack - stats(s, get(s, b.id)!).attack,
    )[0];
  // Damage to a hero, or assigned damage: the most remaining hit points.
  if (
    /Weary Warriors · Deal 1 damage|Arnor Battlefield · Deal 1 damage|Assign damage among|Assign Archery damage/i.test(
      title,
    ) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  if (/Exhaust a character you control/.test(title))
    return (
      [...options.filter((o) => isAlly(s, o.id))].sort(
        (a, b) => room(s, a.id) - room(s, b.id),
      )[0] ?? options[0]
    );
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

export function saSimulationAction(s: GameState): Action | undefined {
  if (!isSaSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const q = s.annuminas;
  const sortie = q?.currentQuest === SA.sortie && !s.stageRevealing;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area.
  if (s.phase === "encounter") {
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
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
      const hero = [...candidates]
        .filter(
          (u) =>
            card(u.code).type_code === "hero" &&
            room(s, u.id) + stats(s, u).defense > attack + 1,
        )
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
      const ally = [...candidates]
        .filter((u) => card(u.code).type_code === "ally")
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
  // The players attack the Lieutenant once he can take damage, else the
  // enemy that can be hurt.
  if (s.phase === "attack") {
    const me = activeSeat(s);
    const targets = engagedEnemies(s).filter(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    const lieutenant = targets.find((e) => e.code === SA.lieutenant);
    const enemy =
      (lieutenant && s.progress >= 10 ? lieutenant : undefined) ??
      targets.find((e) => e.code !== SA.lieutenant) ??
      targets[0];
    if (!enemy) return { type: "END_ATTACKS" };
    return {
      type: "ATTACK",
      enemyId: enemy.id,
      attackerIds: attackersFor(s, enemy)
        .filter((u) => ownerOf(s, u) === me)
        .map((u) => u.id),
    };
  }
  if (s.phase === "quest") {
    // Commit enough willpower for the staging area and some progress; the
    // best defender stays back. At 3B with the Lieutenant open to damage, the
    // players only keep their threat down and hold the rest back to attack.
    const strike = sortie && s.progress >= 10;
    // The player facing the Lieutenant keeps every character back.
    if (strike && s.engaged.some((u) => u.code === SA.lieutenant))
      return { type: "COMMIT" };
    const target = stagingThreat(s) + (strike ? 0 : 3 * players(s));
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
      own.find((u) => u.id !== guard?.id) ??
      (committed || strike ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  // At 3B the Battering Ram must go; else the highest threat.
  const score = (u: Unit) =>
    (sortie && u.code === SA.ram ? 20 : 0) + threatOf(s, u);
  const location = open.sort((a, b) => score(b) - score(a))[0];
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
/** Move the set-aside Hosts of Angmar to the victory display. */
function hostsDefeated(s: GameState, n: number) {
  const q = s.annuminas!;
  for (let i = 0; i < n; i++) {
    const at = q.setAside.indexOf(SA.host);
    if (at < 0) return;
    q.setAside.splice(at, 1);
    addVictoryCard(s, SA.host);
  }
}
/**
 * A late-game start at the end of Defend the City: two Hosts of Angmar are
 * in the victory display (30 quest points) and 2B holds 30 progress, so Lead
 * the Sortie begins at once with Battering Ram and Lieutenant of Angmar. The
 * Dúnedain and the third Host have joined the encounter deck. Each player's
 * threat is 15 and each player has put up to 3 non-unique allies from his
 * deck into play.
 */
export function saSortie(s: GameState) {
  const q = s.annuminas!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  hostsDefeated(s, 2);
  for (const c of [SA.dunedain, SA.dunedain, SA.dunedain, SA.host]) {
    const at = q.setAside.indexOf(c);
    if (at >= 0) {
      q.setAside.splice(at, 1);
      s.encounterDeck.push(c);
    }
  }
  s.encounterDeck = shuffle(s, s.encounterDeck);
  q.currentQuest = SA.defend;
  q.questResources = 0;
  s.stage = SA_STAGE[SA.defend];
  s.progress = 30;
}
/**
 * The last fight, at 3B: Battering Ram has been explored into the victory
 * display, the stage holds 10 progress so the Lieutenant can take damage, and
 * Lieutenant of Angmar is engaged with the first player with 3 hit points
 * left. Each player's threat is 15 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function saFinal(s: GameState) {
  const q = s.annuminas!;
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 15));
  hostsDefeated(s, 2);
  for (const c of [SA.dunedain, SA.dunedain, SA.dunedain, SA.host]) {
    const at = q.setAside.indexOf(c);
    if (at >= 0) {
      q.setAside.splice(at, 1);
      s.encounterDeck.push(c);
    }
  }
  s.encounterDeck = shuffle(s, s.encounterDeck);
  q.setAside = q.setAside.filter((c) => c !== SA.ram && c !== SA.lieutenant);
  addVictoryCard(s, SA.ram);
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const lt = make(s, SA.lieutenant);
    lt.damage = (card(SA.lieutenant).health ?? 9) - 3;
    s.engaged.push(lt);
  });
  q.currentQuest = SA.sortie;
  s.stage = SA_STAGE[SA.sortie];
  s.progress = 10;
}
