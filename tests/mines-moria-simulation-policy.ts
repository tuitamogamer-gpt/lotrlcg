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
  forOwner,
  ownerOf,
  playerOrder,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import {
  MM,
  MM_SCENARIO,
  MM_STAGE2,
  mmCost,
  mmStageInfo,
} from "../src/game/mines-moria-support";
import type { Action, GameState, Option, Unit } from "../src/game/types";

export const isMmSimScenario = (s: GameState) => s.scenarioId === MM_SCENARIO;

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
  return 5 + mmCost(code);
};
const most = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(b) - score(a))[0];
const least = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(a) - score(b))[0];
/** The last push: Chamber of Mazarbul at a stage 3 card that needs it explored. */
const lastPush = (s: GameState) =>
  [MM.balin, MM.eastward, MM.drums].includes(
    s.minesMoria?.currentQuest as never,
  ) && !s.stageRevealing;

/**
 * Deterministic policy over the visible board and the offered legal choices.
 * The quick build is random; each 'opposing team' choice takes the greatest
 * challenge, as the cooperative rules ask of the first player.
 */
export function mmSimulationChoice(s: GameState): Option | undefined {
  if (!isMmSimScenario(s) || !s.choice) return;
  const { title, options } = s.choice;
  const by = (id: string) => options.find((o) => o.id === id);
  const units = options.filter((o) => get(s, o.id));
  if (/^Revealed · /.test(title)) return by("resolve");
  if (/^The Mines of Moria · Choose (the stage|encounter set)/.test(title))
    return by("random");
  // The opposing team: the greatest challenge.
  if (/ · The opposing team adds/.test(title))
    return most(options, (o) => danger(o.code));
  if (
    /from the top 5 encounter cards to reveal|^Hidden Threat · The opposing team places/.test(
      title,
    )
  )
    return most(options, (o) => mmCost(o.code ?? "") * 100 + danger(o.code));
  if (/^A Presence in the Dark · The opposing team puts/.test(title))
    // The less dangerous card goes to the bottom.
    return least(options, (o) => danger(o.code));
  if (/^Narrow Paths · The opposing team chooses an attachment/.test(title))
    return most(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^(Shadow of Fear|Sudden Pitfall) · The opposing team/.test(title))
    return most(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Denizen of the Deep · The opposing team attaches/.test(title))
    return most(units, (o) => danger(o.code)) ?? options[0];
  if (/^They Are Coming! · Shadow: the opposing team shuffles/.test(title))
    return most(options, (o) => danger(o.code));
  // The players' own choices.
  if (/^Web-spinner · /.test(title)) return by("cap");
  if (/^The Fate of Balin · /.test(title)) return by("cap");
  if (/^Foul Air · Deal 1 damage/.test(title)) {
    const questing = characters(s).filter((u) => u.committed);
    return questing.every((u) => room(s, u.id) > 1) ? by("damage") : by("end");
  }
  if (/^Sudden Pitfall · Shadow/.test(title)) return by("protect");
  if (/^Lurking Malice · Shadow/.test(title))
    return most(units, (o) => get(s, o.id)!.resources) ?? options[0];
  if (/^Many-pillared Hall · Shadow/.test(title))
    return least(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/Remove a character from the quest/.test(title))
    return least(units, (o) => stats(s, get(s, o.id)!).will) ?? options[0];
  if (/ · Response: /.test(title)) return by("use");
  // Damage to a character: the most remaining hit points.
  if (
    /Assign 1 damage \(|Deal \d+ damage to a|Assign damage among|Assign Archery damage|^Assign \d+ damage$/i.test(
      title,
    ) &&
    units.length
  )
    return most(units, (o) => room(s, o.id));
  if (
    /Exhaust a character you control|Discard (a|an exhausted) character you control|Discard an ally you control/.test(
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
  // Immediate attacks: an ally chump-blocks, else the hero who survives with
  // the best defense.
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

export function mmSimulationAction(s: GameState): Action | undefined {
  if (!isMmSimScenario(s) || s.choice || s.flow?.pending) return;
  const q = s.minesMoria;
  if (!q) return;
  const watcher = (u: Unit) => u.code === MM.watcher;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area; at Drums in the Deep, every enemy.
  if (s.phase === "encounter") {
    const legal = s.staging.filter(
      (u) =>
        card(u.code).type_code === "enemy" && !optionalEngagementProblem(s, u),
    );
    const ready = characters(s).filter((u) => !u.exhausted).length;
    const weakest = [...legal].sort(
      (a, b) => stats(s, a).attack - stats(s, b).attack,
    )[0];
    const limit = q.currentQuest === MM.drums ? 3 : 2;
    if (weakest && s.engaged.length < limit && ready >= 2)
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
    // The Watcher first at the West-door; otherwise the enemy closest to
    // destruction.
    const enemy =
      targets.find(watcher) ??
      [...targets].sort(
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
    const goal = mmStageInfo(s)?.quest ?? 0;
    const remaining = Math.max(0, goal - s.progress);
    const target =
      stagingThreat(s) +
      Math.max(
        2,
        Math.min(
          3 * players(s),
          remaining + (s.activeLocation ? questLeft(s, s.activeLocation) : 0),
        ),
      );
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
  // Chamber of Mazarbul first at the stage 3 cards, then the highest threat.
  const score = (u: Unit) =>
    (u.code === MM.chamber && lastPush(s) ? 100 : 0) + threatOf(s, u);
  const location = locations.sort((a, b) => score(b) - score(a))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
const questLeft = (s: GameState, u: Unit) =>
  Math.max(0, (card(u.code).quest ?? 0) - (u.progress ?? 0));

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
  const q = s.minesMoria!;
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
/** The Watcher has been defeated and flipped: Chamber of Mazarbul is in the staging area. */
function flipWatcher(s: GameState) {
  s.staging = s.staging.filter((u) => u.code !== MM.watcher);
  const chamber = make(s, MM.chamber);
  s.staging.push(chamber);
  return chamber;
}
function common(s: GameState) {
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
}
const stage3Of = (s: GameState) =>
  s.minesMoria!.questDeck.find(
    (c) => !(MM_STAGE2 as readonly string[]).includes(c),
  )!;

/**
 * A late-game start at A Presence in the Dark (2B): The Watcher has been
 * defeated and Chamber of Mazarbul is in the staging area; at the beginning
 * of each staging step the opposing team puts 1 of the top 2 encounter cards
 * on the bottom. Each player's threat is 20 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function mmPresence(s: GameState) {
  const q = s.minesMoria!;
  useQuests(s, MM.presence, stage3Of(s));
  common(s);
  flipWatcher(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 0;
}
/**
 * The end of The Long Dark of Moria (2B, 20 progress) with Drums in the Deep
 * next: the stage is defeated at once, 3A's search reveals a card and Drums
 * in the Deep adds an enemy; no enemy can take damage while Chamber of
 * Mazarbul is in the staging area. Each player's threat is 20 and each player
 * has put up to 3 non-unique allies from his deck into play.
 */
export function mmDrums(s: GameState) {
  const q = s.minesMoria!;
  useQuests(s, MM.longDark, MM.drums);
  common(s);
  flipWatcher(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 20;
}
/**
 * The last push at The Fate of Balin (3B): the stage holds its 20 progress,
 * so only Chamber of Mazarbul keeps the players from winning: it is the
 * active location with 4 of its 5 quest points explored. Each player's threat
 * is 20 and each player has put up to 3 non-unique allies from his deck into
 * play.
 */
export function mmFinal(s: GameState) {
  const q = s.minesMoria!;
  useQuests(s, q.questDeck[0], MM.balin);
  common(s);
  const chamber = flipWatcher(s);
  s.staging = s.staging.filter((u) => u.id !== chamber.id);
  chamber.progress = 4;
  s.activeLocation = chamber;
  q.defeated = [q.currentQuest, q.questDeck.shift()!];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 3;
  s.progress = 20;
}
