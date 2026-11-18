import { card } from "../src/game/cards";
import {
  canCommit,
  canTravel,
  characters,
  enemyAttackPrevented,
  stats,
} from "../src/game/engine";
import { get, make, stagingThreat, threatOf } from "../src/game/core";
import { optionalEngagementProblem } from "../src/game/actions";
import {
  activeSeat,
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
import {
  WQ,
  WQ_SCENARIO,
  WQ_STAGE2,
  WQ_STAGE3,
  wqCost,
  wqStageInfo,
} from "../src/game/wizards-quest-support";
import type { Action, GameState, Option, Unit } from "../src/game/types";

export const isWqSimScenario = (s: GameState) => s.scenarioId === WQ_SCENARIO;

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
const worth = (s: GameState, id: string) => {
  const u = get(s, id);
  if (!u) return 0;
  const x = stats(s, u);
  return x.will + x.attack + x.defense + x.health / 2;
};
/** The printed danger of an encounter card: an enemy's attack and threat, a location's threat and quest points. */
const danger = (code = "") => {
  const c = card(code);
  if (!code || !c) return 0;
  if (c.type_code === "enemy")
    return 10 + (Number(c.attack) || 0) * 2 + (Number(c.threat) || 0);
  if (c.type_code === "location")
    return (Number(c.threat) || 0) * 2 + (Number(c.quest) || 0) / 2;
  return 5 + wqCost(code);
};
const most = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(b) - score(a))[0];
const least = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(a) - score(b))[0];
/** The last fight: Rider of Mirkwood at Return to Rhosgobel. */
const lastFight = (s: GameState) =>
  s.wizardsQuest?.currentQuest === WQ.return && !s.stageRevealing;

/**
 * Deterministic policy over the visible board and the offered legal choices.
 * The quick build is random; each 'opposing team' choice takes the greatest
 * challenge, as the cooperative rules ask of the first player.
 */
export function wqSimulationChoice(s: GameState): Option | undefined {
  if (!isWqSimScenario(s) || !s.choice) return;
  const { title, options } = s.choice;
  const by = (id: string) => options.find((o) => o.id === id);
  const units = options.filter((o) => get(s, o.id));
  if (/^Revealed · /.test(title)) return by("resolve");
  if (/^The Wizard's Quest · Choose (the stage|encounter set)/.test(title))
    return by("random");
  // The opposing team: the greatest challenge.
  if (
    /^(Radagast's Request|Fastness of Mirkwood|The Wargs' Glade) · The opposing team adds/.test(
      title,
    )
  )
    return most(options, (o) => danger(o.code));
  if (/^A Fork in the Road · The opposing team adds a location/.test(title))
    return most(options, (o) => danger(o.code));
  if (/from the top 5 encounter cards to reveal/.test(title))
    return most(options, (o) => wqCost(o.code ?? "") * 100 + danger(o.code));
  if (/^Carried Away · The opposing team chooses an ally/.test(title))
    return most(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Eyes in the Dark · The opposing team chooses/.test(title))
    return most(units, (o) => stats(s, get(s, o.id)!).will) ?? options[0];
  if (/^Necromancer's Pass · (Choose a card|The opposing team)/.test(title))
    return most(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^Power Sevenfold · The opposing team chooses/.test(title)) {
    // One cheap location in the staging area is replaced, then the rest resolves.
    const chosen = /\((\d+) chosen\)/.exec(title)?.[1] ?? "0";
    const cheap = units.find((o) => {
      const u = get(s, o.id)!;
      return (
        chosen === "0" &&
        card(u.code).type_code === "location" &&
        s.staging.some((x) => x.id === u.id) &&
        threatOf(s, u) <= 1
      );
    });
    return cheap ?? by("resolve");
  }
  if (/^Power Sevenfold · Shadow/.test(title)) return by("reveal");
  if (/^Dungeons of the Necromancer · Attach a hero/.test(title))
    return least(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Nazgûl of Dol Guldur · /.test(title))
    return by("return") ?? by("threat");
  if (/^Bane of Amon Lanc · Discard/.test(title))
    return least(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/ · Response: /.test(title)) return by("use");
  // Damage to a character: the most remaining hit points.
  if (
    /Deal \d+ damage to a|Assign damage among|Assign Archery damage|^Assign \d+ damage$/i.test(
      title,
    ) &&
    units.length
  )
    return most(units, (o) => room(s, o.id));
  if (
    /Exhaust a character you control|Discard a character you control/.test(
      title,
    )
  )
    return (
      least(
        units.filter((o) => isAlly(s, o.id)),
        (o) => worth(s, o.id),
      ) ??
      least(units, (o) => worth(s, o.id)) ??
      options[0]
    );
  // Rider of Mirkwood's 6 attack and the other immediate attacks: an ally
  // chump-blocks, else the hero who survives with the best defense.
  if (/ · Immediate attack$/.test(title)) {
    const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
    const attack = enemy ? stats(s, enemy).attack : 0;
    const survivor = least(
      units.filter((o) => {
        const u = get(s, o.id)!;
        return stats(s, u).defense + room(s, o.id) > attack;
      }),
      (o) => (isAlly(s, o.id) ? 0 : 10) - stats(s, get(s, o.id)!).defense,
    );
    const ally = least(
      units.filter((o) => isAlly(s, o.id)),
      (o) => worth(s, o.id),
    );
    return (
      survivor ??
      ally ??
      most(units, (o) => stats(s, get(s, o.id)!).defense) ??
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

export function wqSimulationAction(s: GameState): Action | undefined {
  if (!isWqSimScenario(s) || s.choice || s.flow?.pending) return;
  const q = s.wizardsQuest;
  if (!q) return;
  const final = lastFight(s);
  const isRider = (u: Unit) => u.code === WQ.rider;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area.
  if (s.phase === "encounter") {
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          !isRider(u) &&
          !optionalEngagementProblem(s, u),
      )
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
    const ready = characters(s).filter((u) => !u.exhausted).length;
    if (weakest && s.engaged.length < 2 && ready >= 2 && !final)
      return { type: "ENGAGE", id: weakest.id };
    return;
  }
  if (s.phase === "defense") {
    const enemy = engagedEnemies(s).find(
      (u) => normalAttackPending(s, u) && !enemyAttackPrevented(s, u),
    );
    if (!enemy) return;
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
      .filter((u) => card(u.code).type_code !== "hero")
      .sort((a, b) => worth(s, a.id) - worth(s, b.id))[0];
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
  if (s.phase === "attack") {
    const me = activeSeat(s);
    const targets = engagedEnemies(s).filter(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    // Rider of Mirkwood first in the last fight; otherwise the enemy closest
    // to destruction.
    const enemy =
      targets.find((e) => isRider(e) && final) ??
      [...targets]
        .filter((e) => !isRider(e) || final)
        .sort(
          (a, b) =>
            room(s, a.id) +
            stats(s, a).defense -
            (room(s, b.id) + stats(s, b).defense),
        )[0];
    if (enemy)
      return {
        type: "ATTACK",
        enemyId: enemy.id,
        attackerIds: attackersFor(s, enemy)
          .filter((u) => ownerOf(s, u) === me)
          .map((u) => u.id),
      };
    return { type: "END_ATTACKS" };
  }
  if (s.phase === "quest") {
    // In the last fight, the player facing Rider of Mirkwood keeps every
    // character back to defend and attack.
    if (final && s.engaged.some(isRider)) return { type: "COMMIT" };
    const goal = wqStageInfo(s)?.quest ?? 0;
    const target =
      stagingThreat(s) +
      Math.max(2, Math.min(3 * players(s), goal - s.progress));
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
  // Rhosgobel first (1B cannot be defeated while it is in play), then the
  // Fork's location once it can be traveled to, else the highest threat.
  const score = (u: Unit) =>
    (u.code === WQ.rhosgobel ? 100 : 0) +
    (u.id === q.forkId ? 50 : 0) +
    threatOf(s, u);
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
/** The quick build takes these stage 2 and stage 3 cards instead (the others return to the box). */
function useQuests(s: GameState, stage2: string, stage3: string) {
  const q = s.wizardsQuest!;
  const chosen = [...q.questDeck];
  const wanted = [stage2, stage3];
  for (const c of chosen)
    if (!wanted.includes(c)) {
      q.box.push(c);
      q.questDeck = q.questDeck.filter((x) => x !== c);
    }
  for (const c of wanted)
    if (!chosen.includes(c)) {
      const i = q.box.indexOf(c);
      if (i < 0) throw new Error(`${card(c).back_name} is not in the box`);
      q.box.splice(i, 1);
    }
  q.questDeck = [...wanted];
}
/** Rhosgobel has been explored and flipped: Rider of Mirkwood is in the staging area. */
function flipRhosgobel(s: GameState) {
  s.staging = s.staging.filter((u) => u.code !== WQ.rhosgobel);
  const rider = make(s, WQ.rider);
  s.staging.push(rider);
  return rider;
}
function common(s: GameState) {
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
}
/** The chosen stage 2 card, whichever the quick build picked. */
const stage2Of = (s: GameState) =>
  s.wizardsQuest!.questDeck.find((c) =>
    (WQ_STAGE2 as readonly string[]).includes(c),
  )!;
const stage3Of = (s: GameState) =>
  s.wizardsQuest!.questDeck.find((c) =>
    (WQ_STAGE3 as readonly string[]).includes(c),
  )!;

/**
 * A late-game start at A New Terror Abroad (2B): Rhosgobel has been explored
 * and Rider of Mirkwood is in the staging area; it attacks the first player
 * at the beginning of each quest phase. Each player's threat is 20 and each
 * player has put up to 3 non-unique allies from his deck into play.
 */
export function wqTerror(s: GameState) {
  const q = s.wizardsQuest!;
  useQuests(s, WQ.terror, stage3Of(s));
  common(s);
  flipRhosgobel(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 0;
}
/**
 * The end of Carried Away (2B, 20 progress, no ally guarded) with Dungeons of
 * the Necromancer next: the stage is defeated at once, 3A's search reveals a
 * card and each player's hero is guarded by an enemy. Rider of Mirkwood is in
 * the staging area. Each player's threat is 20 and each player has put up to
 * 3 non-unique allies from his deck into play.
 */
export function wqDungeons(s: GameState) {
  const q = s.wizardsQuest!;
  useQuests(s, WQ.carried, WQ.dungeons);
  common(s);
  flipRhosgobel(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 20;
}
/**
 * The last fight at Return to Rhosgobel (3B): the stage holds its 10
 * progress, so only Rider of Mirkwood keeps the players from winning; it is
 * engaged with the first player with 3 hit points left. Each player's threat
 * is 20 and each player has put up to 3 non-unique allies from his deck into
 * play.
 */
export function wqFinal(s: GameState) {
  const q = s.wizardsQuest!;
  useQuests(s, stage2Of(s), WQ.return);
  common(s);
  const rider = flipRhosgobel(s);
  s.staging = s.staging.filter((u) => u.id !== rider.id);
  rider.damage = (card(WQ.rider).health ?? 10) - 3;
  forOwner(s, firstPlayer(s), () => s.engaged.push(rider));
  q.defeated = [q.currentQuest, q.questDeck.shift()!];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 3;
  s.progress = 10;
}
