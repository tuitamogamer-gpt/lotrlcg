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
  seatView,
} from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import {
  WR,
  WR_SCENARIO,
  WR_STAGE2,
  WR_STAGE3,
  wrCost,
  wrStageInfo,
} from "../src/game/woodland-realm-support";
import type { Action, GameState, Option, Unit } from "../src/game/types";

export const isWrSimScenario = (s: GameState) => s.scenarioId === WR_SCENARIO;

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && card(u.code).type_code === "ally";
};
const isMendor = (s: GameState, id: string) => get(s, id)?.code === WR.mendor;
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
  return 5 + wrCost(code);
};
const most = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(b) - score(a))[0];
const least = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(a) - score(b))[0];
/** Mendor's loss loses the game: other characters take damage and discards first. */
const spare = (s: GameState, options: Option[]) => {
  const others = options.filter((o) => !isMendor(s, o.id));
  return others.length ? others : options;
};
/** The last fight: the enemy with a resource at The Forest of Great Fear. */
const lastFight = (s: GameState) =>
  s.woodlandRealm?.currentQuest === WR.fear && !s.stageRevealing;
const marked = (s: GameState, u: Unit) => u.id === s.woodlandRealm?.markedId;

/**
 * Deterministic policy over the visible board and the offered legal choices.
 * The quick build is random; each 'opposing team' choice takes the greatest
 * challenge, as the cooperative rules ask of the first player.
 */
export function wrSimulationChoice(s: GameState): Option | undefined {
  if (!isWrSimScenario(s) || !s.choice) return;
  const { title, options } = s.choice;
  const by = (id: string) => options.find((o) => o.id === id);
  const units = options.filter((o) => get(s, o.id));
  if (/^Revealed · /.test(title)) return by("resolve");
  if (/^The Woodland Realm · Choose (the stage|encounter set)/.test(title))
    return by("random");
  // The opposing team: the greatest challenge.
  if (
    /^(Captured by Spiders|Spider Den|The Forest of Great Fear|Massing at Night|The Spiders' Ring|The Goblins' Caves) · The opposing team adds/.test(
      title,
    )
  )
    return most(options, (o) => danger(o.code));
  if (/^Chieftain Ufthak · The opposing team puts/.test(title))
    return most(options, (o) => danger(o.code));
  if (/^Abandoned Camp · The opposing team shuffles/.test(title))
    return most(options, (o) => danger(o.code));
  if (
    /^The Forest of Great Fear · The opposing team places a resource/.test(
      title,
    )
  )
    return most(units, (o) => danger(o.code)) ?? options[0];
  if (/from the top 5 encounter cards to reveal/.test(title))
    return most(options, (o) => wrCost(o.code ?? "") * 100 + danger(o.code));
  if (/^Black Forest Bats · The opposing team chooses/.test(title))
    return most(units, (o) => stats(s, get(s, o.id)!).will) ?? options[0];
  if (/^Caught in a Web · The opposing team attaches/.test(title))
    return most(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Driven by Shadow · The opposing team attaches/.test(title))
    return most(units, (o) => danger(o.code)) ?? options[0];
  if (/^Eyes of the Forest · The opposing team discards/.test(title))
    return most(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^Ambushing Orcs · Choose the lowest/.test(title))
    return least(units, (o) => danger(o.code)) ?? options[0];
  // The players' own choices.
  if (/^Wind-whipped Rain · Keep 1 card/.test(title)) {
    const hand = seatView(s, activeSeat(s)).hand.length;
    const absorb = characters(s)
      .filter((u) => u.code !== WR.mendor)
      .reduce((n, u) => n + Math.max(0, room(s, u.id) - 1), 0);
    return hand <= 1 || absorb < hand + 2 ? by("keep") : by("damage");
  }
  if (/^Wind-whipped Rain · Choose the card you keep/.test(title))
    return most(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^A Frightened Beast · Raise your threat/.test(title)) {
    const threat = seatView(s, activeSeat(s)).threat;
    const n = Number(/Raise your threat by (\d+)/.exec(title)?.[1] ?? 0);
    const ally = least(
      units.filter((o) => isAlly(s, o.id)),
      (o) => worth(s, o.id),
    );
    return threat + n < 42 || !ally ? by("threat") : ally;
  }
  if (/^Mountains of Mirkwood · Shadow/.test(title))
    return seatView(s, activeSeat(s)).threat < 40 ? by("threat") : by("attack");
  if (/Discard a card from your hand/.test(title))
    return least(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/Discard an attachment you control/.test(title))
    return least(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^Caught in a Web · Spend 2 resources/.test(title)) return by("use");
  if (/ · Response: /.test(title)) return by("use");
  // Damage to a character: the most remaining hit points, Mendor last.
  if (
    /Deal \d+ damage to a|Assign \d+ damage \(|Assign damage among|Assign Archery damage|^Assign \d+ damage$/i.test(
      title,
    ) &&
    units.length
  )
    return most(spare(s, units), (o) => room(s, o.id));
  if (
    /Exhaust a (character|hero) you control|Discard (a|an exhausted) character you control|Discard an ally you control/.test(
      title,
    )
  )
    return (
      least(
        spare(s, units).filter((o) => isAlly(s, o.id)),
        (o) => worth(s, o.id),
      ) ??
      least(spare(s, units), (o) => worth(s, o.id)) ??
      options[0]
    );
  // Immediate attacks: an ally chump-blocks, else the hero who survives with
  // the best defense; Mendor defends only when it survives.
  if (/ · Immediate attack$/.test(title)) {
    const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
    const attack = enemy ? stats(s, enemy).attack : 0;
    const survivor = least(
      units.filter((o) => {
        const u = get(s, o.id)!;
        return stats(s, u).defense + room(s, o.id) > attack;
      }),
      (o) =>
        (isAlly(s, o.id) ? 0 : 10) +
        (isMendor(s, o.id) ? 20 : 0) -
        stats(s, get(s, o.id)!).defense,
    );
    const ally = least(
      units.filter((o) => isAlly(s, o.id)),
      (o) => worth(s, o.id),
    );
    return (
      survivor ??
      ally ??
      most(spare(s, units), (o) => stats(s, get(s, o.id)!).defense) ??
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

export function wrSimulationAction(s: GameState): Action | undefined {
  if (!isWrSimScenario(s) || s.choice || s.flow?.pending) return;
  const q = s.woodlandRealm;
  if (!q) return;
  const final = lastFight(s);
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest enemy in the staging area; in the last fight, the enemy with a
  // resource.
  if (s.phase === "encounter") {
    const legal = s.staging.filter(
      (u) =>
        card(u.code).type_code === "enemy" && !optionalEngagementProblem(s, u),
    );
    const ready = characters(s).filter((u) => !u.exhausted).length;
    const target = final ? legal.find((u) => marked(s, u)) : undefined;
    if (target && ready >= 2) return { type: "ENGAGE", id: target.id };
    const weakest = legal
      .filter((u) => !marked(s, u))
      .sort((a, b) => stats(s, a).attack - stats(s, b).attack)[0];
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
      .filter((u) => card(u.code).type_code === "ally")
      .sort((a, b) => worth(s, a.id) - worth(s, b.id))[0];
    // Mendor defends only when it survives the attack with room to spare.
    const mendor = candidates.find(
      (u) =>
        u.code === WR.mendor &&
        room(s, u.id) + stats(s, u).defense > attack + 1,
    );
    const defender =
      hero ??
      ally ??
      mendor ??
      [...candidates]
        .filter((u) => u.code !== WR.mendor)
        .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
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
    // The enemy with a resource first in the last fight; otherwise the enemy
    // closest to destruction.
    const enemy =
      targets.find((e) => marked(s, e) && final) ??
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
    // In the last fight, the player facing the enemy with a resource keeps
    // every character back to defend and attack.
    if (final && s.engaged.some((u) => marked(s, u))) return { type: "COMMIT" };
    const goal = wrStageInfo(s)?.quest ?? 0;
    const target =
      stagingThreat(s) +
      Math.max(2, Math.min(3 * players(s), goal - s.progress));
    const committed = characters(s)
      .filter((u) => s.committedIds.includes(u.id))
      .reduce((n, u) => n + stats(s, u).will, 0);
    const candidates = characters(s).filter(
      (u) =>
        canCommit(s, u) &&
        stats(s, u).will > 0 &&
        !s.committedIds.includes(u.id),
    );
    // Stage 2: Mendor raises the progress cap from 5 to 10.
    const mendor = candidates.find((u) => u.code === WR.mendor);
    if (mendor && s.stage === 2 && !s.stageRevealing)
      return { type: "TOGGLE_QUEST", id: mendor.id };
    const own = candidates.sort(
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
  // Spider Den first (1B needs Mendor), then the highest threat.
  const score = (u: Unit) => (u.code === WR.den ? 100 : 0) + threatOf(s, u);
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
  const q = s.woodlandRealm!;
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
/** Spider Den has been explored and flipped: Mendor is under the first player's control. */
function rescueMendor(s: GameState) {
  s.staging = s.staging.filter((u) => u.code !== WR.den);
  const mendor = make(s, WR.mendor);
  forOwner(s, firstPlayer(s), () => s.allies.push(mendor));
  s.woodlandRealm!.mendorId = mendor.id;
  return mendor;
}
function common(s: GameState) {
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
}
/** The chosen stage 2 card, whichever the quick build picked. */
const stage2Of = (s: GameState) =>
  s.woodlandRealm!.questDeck.find((c) =>
    (WR_STAGE2 as readonly string[]).includes(c),
  )!;
const stage3Of = (s: GameState) =>
  s.woodlandRealm!.questDeck.find((c) =>
    (WR_STAGE3 as readonly string[]).includes(c),
  )!;

/**
 * A late-game start at "Don't Leave the Path" (2B): Spider Den has been
 * explored and Mendor is under the first player's control; progress cannot be
 * placed on staged locations, the players must travel and no more than 5 (or
 * 10, with Mendor committed) progress is placed on the stage each round. Each
 * player's threat is 20 and each player has put up to 3 non-unique allies from
 * his deck into play.
 */
export function wrPath(s: GameState) {
  const q = s.woodlandRealm!;
  useQuests(s, WR.path, stage3Of(s));
  common(s);
  rescueMendor(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 0;
}
/**
 * The end of Lost in the Dark (2B, 20 progress) with To the Elvenking's Halls
 * next: the stage is defeated at once and 3A's search reveals a card. Mendor
 * is under the first player's control. Each player's threat is 20 and each
 * player has put up to 3 non-unique allies from his deck into play.
 */
export function wrHalls(s: GameState) {
  const q = s.woodlandRealm!;
  useQuests(s, WR.dark, WR.halls);
  common(s);
  rescueMendor(s);
  q.defeated = [q.currentQuest];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 2;
  s.progress = 20;
}
/**
 * The last fight at The Forest of Great Fear (3B): the stage holds its 15
 * progress, so only the enemy with a resource keeps the players from winning:
 * a Giant Spider (+2 attack, +2 defense, immune to player card effects)
 * engaged with the first player with 2 hit points left. Mendor is under the
 * first player's control. Each player's threat is 20 and each player has put
 * up to 3 non-unique allies from his deck into play.
 */
export function wrFinal(s: GameState) {
  const q = s.woodlandRealm!;
  useQuests(s, stage2Of(s), WR.fear);
  common(s);
  rescueMendor(s);
  const spider = make(s, WR.giant);
  spider.resources = 1;
  spider.damage = (card(WR.giant).health ?? 5) - 2;
  forOwner(s, firstPlayer(s), () => s.engaged.push(spider));
  q.markedId = spider.id;
  // The marked Giant Spider is a physical copy: from the encounter deck, the
  // box (its set was not chosen) or the discard pile.
  const pile = [s.encounterDeck, q.box, s.encounterDiscard].find((x) =>
    x.includes(WR.giant),
  );
  if (!pile) throw new Error("no Giant Spider is available");
  pile.splice(pile.indexOf(WR.giant), 1);
  q.defeated = [q.currentQuest, q.questDeck.shift()!];
  q.currentQuest = q.questDeck.shift()!;
  s.stage = 3;
  s.progress = 15;
}
