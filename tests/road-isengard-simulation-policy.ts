import { card } from "../src/game/cards";
import {
  availableAbilities,
  canCommit,
  canPlay,
  canTravel,
  characters,
  stats,
} from "../src/game/engine";
import { get, make, stagingThreat } from "../src/game/core";
import {
  activeSeat,
  allCharacters,
  attackersFor,
  defendersFor,
  forOwner,
  ownerOf,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { enemyAttackPrevented } from "../src/game/engine";
import { TOS_ARAGORN } from "../src/game/lotr-saga-codes";
import { RI, roadIsengardSaruman } from "../src/game/road-isengard-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const RI_SCENARIOS = [
  "the-road-to-isengard",
] as const satisfies readonly ScenarioId[];
export type RiScenario = (typeof RI_SCENARIOS)[number];
export const isRiScenario = (id: ScenarioId): id is RiScenario =>
  RI_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const aragorn = (s: GameState, id: string) => get(s, id)?.code === TOS_ARAGORN;
const isLocation = (code: string) => card(code).type_code === "location";
/** Saruman still has hit points, so the players cannot win yet. */
const sarumanStands = (s: GameState) => {
  const saruman = roadIsengardSaruman(s);
  return !!saruman && saruman.damage < stats(s, saruman).health;
};
const orthancActive = (s: GameState) => s.activeLocation?.code === RI.orthanc;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function riSimulationChoice(s: GameState): Option | undefined {
  if (!isRiScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  if (/^Revealed · /.test(title))
    return options.find((o) => o.id === "resolve");
  // Advance once every Ent is roused or after three rounds.
  if (/^Rouse the Ents · The players may advance/.test(title)) {
    const ents = s.staging.filter((u) => u.code === RI.ent).length;
    return options.find(
      (o) =>
        o.id ===
        (!ents || (s.roadIsengard?.rouse ?? 0) >= 3 ? "advance" : "stay"),
    );
  }
  // The hero with the most willpower rouses the Ent.
  if (/^Ent of Fangorn · Exhaust a hero/.test(title))
    return (
      [...options].sort((a, b) => {
        const ua = get(s, a.id),
          ub = get(s, b.id);
        return (ub ? stats(s, ub).will : 0) - (ua ? stats(s, ua).will : 0);
      })[0] ?? options[0]
    );
  // Keep cards in hand for The Voice of Saruman.
  if (/^(Isengard Orc|Wolf of Isengard) · Choose one/.test(title))
    return (
      options.find(
        (o) => o.id === (s.hand.length >= 3 ? "discard" : "reveal"),
      ) ??
      options.find((o) => o.id === "attack") ??
      options[0]
    );
  // Orthanc: reveal a location rather than an enemy or a treachery.
  if (/^Orthanc · Reveal 1/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          Number(isLocation(b.code!)) - Number(isLocation(a.code!)) ||
          (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
      )[0] ?? options[0]
    );
  // The cheapest ally is discarded, an Ent of Fangorn last.
  if (/^Plain of Isengard · Discard an ally/.test(title))
    return (
      [...options].sort(
        (a, b) =>
          Number(a.code === RI.ent) - Number(b.code === RI.ent) ||
          (Number(card(a.code!).cost) || 0) - (Number(card(b.code!).cost) || 0),
      )[0] ?? options[0]
    );
  // The weakest character is exhausted.
  if (/^Underground Armoury · Exhaust/.test(title))
    return (
      [...options].sort((a, b) => {
        const ua = get(s, a.id),
          ub = get(s, b.id);
        return (
          (ua ? stats(s, ua).defense : 0) - (ub ? stats(s, ub).defense : 0)
        );
      })[0] ?? options[0]
    );
  // The weakest enemy when a search puts one into play.
  if (/^Gates of Isengard · Put an enemy/.test(title))
    return (
      [...options].sort(
        (a, b) => (card(a.code!).attack ?? 0) - (card(b.code!).attack ?? 0),
      )[0] ?? options[0]
    );
  // The location closest to being explored.
  if (/^Breaking Isengard · Place 2 progress/.test(title))
    return (
      [...options].sort((a, b) => {
        const left = (o: Option) => {
          const u = [
            ...s.staging,
            ...(s.activeLocation ? [s.activeLocation] : []),
          ].find((x) => x.id === o.id);
          return u ? (card(u.code).quest ?? 0) - u.progress : 99;
        };
        return left(a) - left(b);
      })[0] ?? options[0]
    );
  // Aragorn readies the best defender.
  if (/^Aragorn · Ready a hero/.test(title))
    return (
      [...options].sort((a, b) => {
        const ua = get(s, a.id),
          ub = get(s, b.id);
        return (
          (ub ? stats(s, ub).defense : 0) - (ua ? stats(s, ua).defense : 0)
        );
      })[0] ?? options[0]
    );
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return (
      [...options.filter((o) => get(s, o.id) && !aragorn(s, o.id))].sort(
        (a, b) => room(s, b.id) - room(s, a.id),
      )[0] ?? options[0]
    );
  // Chump attacks with allies.
  if (/Immediate attack/i.test(title)) {
    const ally = options.find((o) => isAlly(s, o.id));
    if (ally) return ally;
    return (
      [...options.filter((o) => get(s, o.id) && !aragorn(s, o.id))].sort(
        (a, b) => {
          const ua = units.find((u) => u.id === a.id)!;
          const ub = units.find((u) => u.id === b.id)!;
          return stats(s, ub).defense - stats(s, ua).defense;
        },
      )[0] ??
      options.find((o) => o.id === "undefended") ??
      options[0]
    );
  }
  for (const id of ["use", "gain", "draw"]) {
    const preferred = options.find((o) => o.id === id);
    if (preferred) return preferred;
  }
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

const ability = (s: GameState, u: Unit) =>
  availableAbilities(s, u).some(
    (a) => a.label.startsWith("Ent of Fangorn") && !a.disabled,
  );

export function riSimulationAction(s: GameState): Action | undefined {
  if (!isRiScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const q = s.roadIsengard;
  // The Voice of Saruman: never empty the hand.
  if (s.phase === "planning" && s.stage === 3) {
    if (s.hand.length <= 2) return { type: "NEXT" };
    const ally = s.hand.find(
      (u) => !canPlay(s, u) && card(u.code).type_code === "ally",
    );
    return ally ? { type: "PLAY", id: ally.id } : { type: "NEXT" };
  }
  // Before the quest resolves, Aragorn readies a questing hero.
  if (s.phase === "staging") {
    const hero = s.heroes.find((h) => h.code === TOS_ARAGORN);
    if (
      hero &&
      availableAbilities(s, hero).some(
        (a) => a.label.startsWith("Aragorn") && !a.disabled,
      )
    )
      return { type: "ABILITY", id: hero.id };
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (enemy) {
      const candidates = defendersFor(s, enemy);
      const ally = candidates.find((u) => card(u.code).type_code === "ally");
      const attack = stats(s, enemy).attack;
      const survives = (u: (typeof candidates)[number]) =>
        stats(s, u).health - u.damage > attack - stats(s, u).defense;
      const defender =
        ally ??
        [...candidates]
          .filter((u) => u.code !== TOS_ARAGORN || survives(u))
          .sort(
            (a, b) =>
              Number(survives(b)) - Number(survives(a)) ||
              stats(s, b).defense - stats(s, a).defense,
          )[0];
      return {
        type: "DEFEND",
        enemyId: enemy.id,
        defenderId: defender?.id ?? null,
      };
    }
  }
  if (s.phase === "attack") {
    // Attack an enemy the ready characters can damage; Saruman takes it all.
    const p = activeSeat(s);
    const targets = engagedEnemies(s)
      .filter((e) => !e.attackedBy?.includes(p))
      .map((e) => {
        const attackers = attackersFor(s, e).filter((u) => ownerOf(s, u) === p);
        const damage =
          attackers.reduce((n, u) => n + stats(s, u).attack, 0) -
          stats(s, e).defense;
        return { e, attackers, damage };
      })
      .filter((t) => t.attackers.length && t.damage > 0)
      .sort(
        (a, b) =>
          Number(b.e.code === RI.saruman) - Number(a.e.code === RI.saruman) ||
          stats(s, a.e).health -
            a.e.damage -
            a.damage -
            (stats(s, b.e).health - b.e.damage - b.damage),
      );
    const best = targets[0];
    return best
      ? {
          type: "ATTACK",
          enemyId: best.e.id,
          attackerIds: best.attackers.map((u) => u.id),
        }
      : { type: "END_ATTACKS" };
  }
  if (s.phase === "quest") {
    // Rouse the Ents (in the staging area), or break Isengard with one you control.
    const ent = [...s.staging, ...s.allies]
      .filter((u) => u.code === RI.ent && ability(s, u))
      .sort((a, b) => b.resources - a.resources)[0];
    if (ent) return { type: "ABILITY", id: ent.id };
    if (s.stage === 1) return { type: "COMMIT" };
    const own = characters(s).filter(
      (u) => canCommit(s, u) && stats(s, u).will > 0,
    );
    // While Orthanc is active and Saruman stands, match the threat without
    // questing successfully: exploring Orthanc would end the fight.
    if (q && orthancActive(s) && sarumanStands(s)) {
      const threat = stagingThreat(s);
      let will = characters(s)
        .filter((u) => s.committedIds.includes(u.id))
        .reduce((n, u) => n + stats(s, u).will, 0);
      const next = own
        .filter((u) => !s.committedIds.includes(u.id))
        .sort((a, b) => stats(s, b).will - stats(s, a).will)
        .find((u) => will + stats(s, u).will <= threat);
      if (next) {
        will += stats(s, next).will;
        return { type: "TOGGLE_QUEST", id: next.id };
      }
      return { type: "COMMIT" };
    }
    // Keep the best defender back.
    const guard = [...characters(s)].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const ready = own.find(
      (u) => u.id !== guard?.id && !s.committedIds.includes(u.id),
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel" || s.activeLocation) return;
  const open = s.staging.filter((u) => isLocation(u.code) && !canTravel(s, u));
  // The Voice of Saruman: Orthanc while Saruman stands, any other location after.
  if (s.stage === 3) {
    const orthanc = open.find((u) => u.code === RI.orthanc);
    if (orthanc && sarumanStands(s)) return { type: "TRAVEL", id: orthanc.id };
    const other = open
      .filter((u) => u.code !== RI.orthanc)
      .sort(
        (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
      )[0];
    return other ? { type: "TRAVEL", id: other.id } : { type: "NEXT" };
  }
  // Breaking Isengard: the non-unique location quickest to explore.
  const location = [...open]
    .filter((u) => !card(u.code).is_unique)
    .sort((a, b) => (card(a.code).quest ?? 0) - (card(b.code).quest ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/**
 * A late-game start: The Voice of Saruman is under way with 12 of its 15
 * progress and Saruman's Staff on Saruman, whose damage passes his 6 hit
 * points by 4 for each player and 2 more. The players roused the four Ents of
 * Fangorn at stage 1 (they take turns taking control of them), and Gates of
 * Isengard is in the victory display. Every physical card stays in a legal
 * zone.
 */
export function riVoice(s: GameState) {
  const q = s.roadIsengard!;
  const ents = s.staging.filter((u) => u.code === RI.ent);
  s.staging = s.staging.filter((u) => u.code !== RI.ent);
  const players = s.table ? s.table.seats.map((_, i) => i) : [0];
  ents.forEach((ent, i) => {
    const p = players[i % players.length];
    ent.resources = 0;
    forOwner(s, p, () => {
      if (s.table) ent.owner = p;
      s.allies.push(ent);
    });
  });
  for (const code of [RI.gates, RI.orthanc, RI.saruman, RI.staff])
    q.setAside.splice(q.setAside.indexOf(code), 1);
  const saruman = make(s, RI.saruman);
  saruman.attachments.push({
    id: make(s, RI.staff).id,
    code: RI.staff,
    exhausted: false,
  });
  saruman.damage = stats(s, saruman).health + 4 * players.length + 2;
  s.staging.push(saruman, make(s, RI.orthanc));
  (s.victoryCards ??= []).push(RI.gates);
  s.victory += card(RI.gates).victory ?? 0;
  s.stage = 3;
  s.progress = 12;
  q.currentQuest = RI.voice;
  q.rouse = 0;
  q.breaking = 5;
}
