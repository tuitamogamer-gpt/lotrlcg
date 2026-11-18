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
  EK,
  EK_BRIDGE_TARGET,
  EK_SCENARIO,
  EK_STAGE2,
  ekCost,
  ekStageInfo,
} from "../src/game/escape-khazad-support";
import type { Action, GameState, Option, Unit } from "../src/game/types";

export const isEkSimScenario = (s: GameState) => s.scenarioId === EK_SCENARIO;

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
  return 5 + ekCost(code);
};
/** A player card's value to keep: an ally's willpower, else its cost. */
const keep = (code = "") =>
  (card(code).type_code === "ally" ? 10 + (card(code).willpower ?? 0) : 0) +
  (Number(card(code).cost) || 0);
const most = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(b) - score(a))[0];
const least = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(a) - score(b))[0];
const bane = (s: GameState) =>
  engagedEnemies(s).find((u) => u.code === EK.bane);

/**
 * Deterministic policy over the visible board and the offered legal choices.
 * The quick build is random; each 'opposing team' choice takes the greatest
 * challenge, as the cooperative rules ask of the first player.
 */
export function ekSimulationChoice(s: GameState): Option | undefined {
  if (!isEkSimScenario(s) || !s.choice) return;
  const { title, options } = s.choice;
  const by = (id: string) => options.find((o) => o.id === id);
  const units = options.filter((o) => get(s, o.id));
  if (/^Revealed · /.test(title)) return by("resolve");
  if (/^Escape from Khazad-dûm · Choose (the stage|encounter set)/.test(title))
    return by("random");
  // The opposing team: the greatest challenge.
  if (/ · The opposing team adds/.test(title))
    return most(options, (o) => danger(o.code));
  if (/from the top 5 encounter cards to reveal/.test(title))
    return most(options, (o) => ekCost(o.code ?? "") * 100 + danger(o.code));
  if (/^Black Uruks · The opposing team deals/.test(title))
    return most(
      options,
      (o) => (card(o.code ?? "").shadow ? 20 : 0) + danger(o.code),
    );
  if (/^Lost and Alone · The opposing team removes/.test(title))
    return most(units, (o) => stats(s, get(s, o.id)!).will) ?? options[0];
  if (/^(Goblin Dungeon|Watchful Eyes) · The opposing team/.test(title))
    return most(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Vast and Intricate · The opposing team attaches/.test(title))
    return most(units, (o) => threatOf(s, get(s, o.id)!)) ?? options[0];
  if (/^A Foe Beyond · The opposing team discards/.test(title))
    return most(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/ · The opposing team shuffles/.test(title))
    return most(options, (o) => danger(o.code));
  // The players' own choices.
  if (/^Black Bats · /.test(title)) return by("threat");
  if (/^Cave Spider/.test(title)) return by("progress") ?? by("attack");
  if (/^Deep Deep Dark · /.test(title)) {
    const allies = units.filter((o) => isAlly(s, o.id));
    return characters(s).length <= 3 || !allies.length
      ? by("threat")
      : least(allies, (o) => worth(s, o.id));
  }
  if (/^Fatigue · Declare a different defending character/.test(title)) {
    const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
    const attack = enemy ? stats(s, enemy).attack : 0;
    return (
      least(
        units.filter((o) => {
          const u = get(s, o.id)!;
          return stats(s, u).defense + room(s, o.id) > attack;
        }),
        (o) => worth(s, o.id),
      ) ??
      least(
        units.filter((o) => isAlly(s, o.id)),
        (o) => worth(s, o.id),
      ) ??
      by("none")
    );
  }
  if (/^(Out of the Depths · Search|A Wrong Turn · Choose)/.test(title))
    return most(options, (o) => keep(o.code));
  if (/^Lightless Grotto · Choose an enemy/.test(title))
    return least(units, (o) => stats(s, get(s, o.id)!).attack) ?? options[0];
  if (/ · Response: /.test(title)) return by("use");
  // Damage to a character: the most remaining hit points.
  if (
    /Assign 1 damage \(|Deal \d+ damage to a|Assign damage among|Assign Archery damage|^Assign \d+ damage$/i.test(
      title,
    ) &&
    units.length
  )
    return most(units, (o) => room(s, o.id));
  if (/Exhaust a character|Discard a character you control/.test(title))
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
    // The Bridge of Khazad-dûm: the defender that leaves the least excess damage.
    if (s.combat?.undefendedTargetId === EK_BRIDGE_TARGET && units.length)
      return least(
        units,
        (o) =>
          Math.max(
            0,
            attack - stats(s, get(s, o.id)!).defense - room(s, o.id),
          ) *
            10 +
          (isAlly(s, o.id) ? 0 : 1),
      );
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

export function ekSimulationAction(s: GameState): Action | undefined {
  if (!isEkSimScenario(s) || s.choice || s.flow?.pending) return;
  const q = s.escapeKhazad;
  if (!q) return;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area.
  if (s.phase === "encounter") {
    const legal = s.staging.filter(
      (u) =>
        card(u.code).type_code === "enemy" && !optionalEngagementProblem(s, u),
    );
    const ready = characters(s).filter((u) => !u.exhausted).length;
    const weakest = [...legal].sort(
      (a, b) => stats(s, a).attack - stats(s, b).attack,
    )[0];
    if (weakest && s.engaged.length < 2 && ready >= 2)
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
    // Durin's Bane first; otherwise the enemy closest to destruction.
    const enemy =
      targets.find((u) => u.code === EK.bane) ??
      [...targets].sort(
        (a, b) =>
          room(s, a.id) +
          stats(s, a).defense -
          (room(s, b.id) + stats(s, b).defense),
      )[0];
    if (enemy) {
      const own = attackersFor(s, enemy).filter((u) => ownerOf(s, u) === me);
      // The Great Bridge: a single attacker, the strongest.
      const attackers = s.staging.some((u) => u.code === EK.greatBridge)
        ? [...own]
            .sort((a, b) => stats(s, b).attack - stats(s, a).attack)
            .slice(0, 1)
        : own;
      return {
        type: "ATTACK",
        enemyId: enemy.id,
        attackerIds: attackers.map((u) => u.id),
      };
    }
    return { type: "END_ATTACKS" };
  }
  if (s.phase === "quest") {
    // Last Lord of Moria with its progress: keep every character to attack Durin's Bane.
    if (
      q.currentQuest === EK.lastLord &&
      s.progress >= 15 &&
      bane(s) &&
      !s.committedIds.length
    )
      return { type: "COMMIT" };
    const goal = ekStageInfo(s)?.quest ?? 0;
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
  // Dark Pit first at Out of the Depths, then the highest threat.
  const score = (u: Unit) => (u.code === EK.pit ? 100 : 0) + threatOf(s, u);
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
  const q = s.escapeKhazad!;
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
/** Dark Pit has been explored and flipped: Durin's Bane is set aside. */
function explorePit(s: GameState) {
  const q = s.escapeKhazad!;
  s.staging = s.staging.filter((u) => u.code !== EK.pit);
  if (s.activeLocation?.code === EK.pit) s.activeLocation = null;
  q.baneAside = true;
}
function common(s: GameState) {
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
}
const stage3Of = (s: GameState) =>
  s.escapeKhazad!.questDeck.find(
    (c) => !(EK_STAGE2 as readonly string[]).includes(c),
  )!;

/**
 * A late-game start at the end of Out of the Depths (1B, 10 progress) with
 * Old One Lair next: Dark Pit has been explored and Durin's Bane is set
 * aside, so the stage is defeated at once, 2A's search reveals a card and
 * Old One Lair adds an enemy with a resource that keeps progress off the
 * stage. Each player's threat is 20 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function ekLair(s: GameState) {
  useQuests(s, EK.lair, stage3Of(s));
  common(s);
  explorePit(s);
  s.progress = 10;
}
/**
 * The end of A Way Up (2B, 20 progress) with The Bridge of Khazad-dûm next:
 * the stage is defeated at once, 3A adds Durin's Bane (attacking the first
 * player with more than 1 player), and at the beginning of each quest phase
 * it attacks the first player, its undefended and excess damage going onto
 * the stage. Each player's threat is 20 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function ekBridge(s: GameState) {
  const q = s.escapeKhazad!;
  useQuests(s, EK.wayUp, EK.bridge);
  common(s);
  explorePit(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 20;
}
/**
 * The last fight at Last Lord of Moria (3B): the stage holds its 15
 * progress, so only Durin's Bane keeps the players from winning; it is
 * engaged with the first player with 2 of its 15 hit points left. Each
 * player's threat is 20 and each player has put up to 3 non-unique allies
 * from his deck into play.
 */
export function ekFinal(s: GameState) {
  const q = s.escapeKhazad!;
  useQuests(s, q.questDeck[0], EK.lastLord);
  common(s);
  explorePit(s);
  q.baneAside = false;
  q.defeated = [q.currentQuest, q.questDeck.shift()!];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 3;
  s.progress = 15;
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const u = make(s, EK.bane);
    u.damage = 13;
    s.engaged.push(u);
  });
}
