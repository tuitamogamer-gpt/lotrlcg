import { card } from "../src/game/cards";
import {
  canCommit,
  canTravel,
  characters,
  enemyAttackPrevented,
  stats,
} from "../src/game/engine";
import { get, make, stagingThreat, threatOf } from "../src/game/core";
import {
  availableAbilities,
  optionalEngagementProblem,
} from "../src/game/actions";
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
import { mainQuestUnit } from "../src/game/quest-state";
import { isShipEnemy, isShipObjective } from "../src/game/ships";
import {
  HD,
  HD_DAMAGED,
  HD_SCENARIO,
  hdDreadnaughtHealth,
  hdPhysical,
  hdQuestPoints,
  hdRoundCap,
} from "../src/game/hunt-dreadnaught-support";
import type { Action, GameState, Option, Unit } from "../src/game/types";
import type { HdMode } from "./hunt-dreadnaught-simulation-driver";

export const isHdSimScenario = (s: GameState) => s.scenarioId === HD_SCENARIO;

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && ["ally", "ship-objective"].includes(card(u.code).type_code);
};
const players = (s: GameState) =>
  s.table ? s.table.seats.filter((x) => !x.eliminated).length : 1;
const worth = (s: GameState, id: string) => {
  const u = get(s, id);
  if (!u) return 0;
  const x = stats(s, u);
  return x.will + x.attack + x.defense + x.health / 2;
};
/** The printed danger of an encounter card. */
const danger = (code = "") => {
  const c = card(hdPhysical(code));
  if (!code || !c) return 0;
  if (["enemy", "ship-enemy"].includes(c.type_code))
    return 10 + (Number(c.attack) || 0) * 2 + (Number(c.threat) || 0);
  if (c.type_code === "location")
    return (Number(c.threat) || 0) * 2 + (Number(c.quest) || 0) / 2;
  return 5;
};
/** A player card's value to keep: an ally's willpower, else its cost. */
const keep = (code = "") =>
  (card(code).type_code === "ally" ? 10 + (card(code).willpower ?? 0) : 0) +
  (Number(card(code).cost) || 0);
const most = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(b) - score(a))[0];
const least = (options: Option[], score: (o: Option) => number) =>
  [...options].sort((a, b) => score(a) - score(b))[0];
/** Each seat takes the first ship of this order that is still free. */
const SHIP_ORDER = [
  HD.swan,
  HD.pride,
  HD.goldenWing,
  HD.eithiliant,
  HD.twilight,
  HD.silentMist,
];

/** Deterministic policy over the visible board and the offered legal choices. */
export function hdSimulationChoice(
  s: GameState,
  mode: HdMode = "standard",
): Option | undefined {
  if (!isHdSimScenario(s) || !s.choice) return;
  const { title, options } = s.choice;
  const by = (id: string) => options.find((o) => o.id === id);
  const units = options.filter((o) => get(s, o.id));
  if (/^Revealed · /.test(title)) return by("resolve");
  if (/^Prepare your fleet · /.test(title))
    return SHIP_ORDER.map((c) => by(c)).find(Boolean) ?? options[0];
  if (/^The Hunt for the Dreadnaught · Choose a difficulty mode/.test(title))
    return by(mode) ?? options[0];
  if (/^Pride of Lebennin · Shuffle a card/.test(title))
    return least(options, (o) => keep(o.code));
  if (/^Golden Wing · Setup/.test(title))
    return most(units, (o) => stats(s, get(s, o.id)!).attack) ?? options[0];
  if (/^Spend a resource|^Belfalas Shipyard · Spend a resource/.test(title))
    return most(units, (o) => get(s, o.id)!.resources) ?? options[0];
  if (/ · Ready (a character|a card)/.test(title))
    return most(units, (o) => worth(s, o.id)) ?? options[0];
  if (/^Corsair Skirmisher · Response/.test(title)) return by("capture");
  if (/^Corsair Skirmisher · Choose allies to discard/.test(title))
    return (
      by("pay") ??
      least(
        units.filter((o) => !isShipObjective(get(s, o.id)!)),
        (o) => worth(s, o.id),
      ) ??
      by("decline")
    );
  if (/^Belfalas Shipyard · Response/.test(title))
    return (
      most(units, (o) => {
        const u = get(s, o.id)!;
        return u.damage * 2 + (u.code.endsWith(":B") ? 0 : 10);
      }) ?? by("skip")
    );
  if (/^Gondorian Warship · Choose a player/.test(title)) return options[0];
  if (/ · Attach to a Ship objective/.test(title))
    return most(units, (o) => room(s, o.id)) ?? options[0];
  if (/^Out of the Mist · Choose the enemy/.test(title))
    return least(units, (o) => stats(s, get(s, o.id)!).attack) ?? options[0];
  if (/^Out of the Mist · Shadow/.test(title))
    return s.threat <= 35 ? by("threat") : (by("attack") ?? by("threat"));
  if (/ · Raise your threat by \d+ or it gains Boarding 1/.test(title))
    return s.threat <= 35 ? by("threat") : by("boarding");
  if (/^Sea Monster · /.test(title))
    return (
      most(units, (o) => (isShipEnemy(get(s, o.id)!) ? 1 : 0)) ?? options[0]
    );
  if (/^Destroy the Dreadnaught · Response/.test(title))
    return s.threat <= 35 ? by("cancel") : by("allow");
  if (/^Golden Wing · Deal 6 damage/.test(title))
    return (
      most(units, (o) =>
        hdPhysical(get(s, o.id)!.code) === HD.dreadnaught
          ? 100
          : -room(s, o.id),
      ) ?? options[0]
    );
  if (/^Pride of Lebennin · Add up to/.test(title))
    return (
      most(
        options.filter((o) => o.id !== "done"),
        (o) => danger(o.code),
      ) ?? by("done")
    );
  if (/^Eithiliant · Shuffle up to/.test(title)) return by("done");
  if (/^Corsair Plunderer · Discard an attachment/.test(title))
    return least(options, (o) => Number(card(o.code ?? "").cost) || 0);
  if (/^Fierce Marauder · /.test(title))
    return most(units, (o) => get(s, o.id)!.resources) ?? options[0];
  // Damage to a character: the most remaining hit points.
  if (
    /Assign 1 damage \(|Deal \d+ damage \(|Deal \d+ damage to a|Assign damage among|Assign Archery damage|^Assign \d+ damage$/i.test(
      title,
    ) &&
    units.length
  )
    return most(units, (o) => room(s, o.id));
  if (/Exhaust a character|Discard a character you control/.test(title))
    return (
      least(
        units.filter((o) => isAlly(s, o.id) && !isShipObjective(get(s, o.id)!)),
        (o) => worth(s, o.id),
      ) ??
      least(units, (o) => worth(s, o.id)) ??
      options[0]
    );
  // Immediate attacks: a survivor with the best defense, else a chump ally.
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
      units.filter((o) => isAlly(s, o.id) && !isShipObjective(get(s, o.id)!)),
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

const questLeft = (s: GameState, u: Unit) =>
  Math.max(0, (card(u.code).quest ?? 0) - (u.progress ?? 0));
/** A scenario ability the policy uses when it is available. */
function scenarioAbility(s: GameState): Action | undefined {
  const quest = mainQuestUnit(s);
  const units = [...(quest ? [quest] : []), ...s.staging, ...characters(s)];
  for (const u of units) {
    // The scenario's own abilities only.
    const abilities = availableAbilities(s, u).filter(
      (a) =>
        !a.disabled &&
        /^(Destroy the Dreadnaught|Easy Mode|Standard Mode|Swan|Grappled!|Taking on Water) · /.test(
          a.label,
        ),
    );
    for (const a of abilities) {
      // 2B's Response: cancel the Dreadnaught's attack while threat allows.
      if (/cancel the Dreadnaught's attack/.test(a.label) && s.threat > 35)
        continue;
      // The Setup card's Quest Action: on an enemy with hit points to lose.
      if (/Quest Action: deal 10 damage/.test(a.label)) {
        const big = engagedEnemies(s).some(
          (e) =>
            !card(e.code).is_unique &&
            hdPhysical(e.code) !== HD.dreadnaught &&
            room(s, e.id) >= 5,
        );
        if (!big) continue;
      }
      return { type: "ABILITY", id: u.id, attachmentId: a.id };
    }
  }
  return undefined;
}
export function hdSimulationAction(s: GameState): Action | undefined {
  if (!isHdSimScenario(s) || s.choice || s.flow?.pending) return;
  const q = s.huntDreadnaught;
  if (!q || s.phase === "setup") return;
  const used = scenarioAbility(s);
  if (used) return used;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest non-Ship enemy in the staging area.
  if (s.phase === "encounter") {
    // Never a Ship enemy (Boarding) or a strong enemy.
    const legal = s.staging.filter(
      (u) =>
        card(u.code).type_code === "enemy" &&
        stats(s, u).attack <= 3 &&
        !optionalEngagementProblem(s, u),
    );
    const ready = characters(s).filter((u) => !u.exhausted).length;
    const weakest = [...legal].sort(
      (a, b) => stats(s, a).attack - stats(s, b).attack,
    )[0];
    if (weakest && s.engaged.length < 2 && ready >= 3)
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
    // A ship survives the attack if it can; an ally chump-blocks otherwise.
    const ship = [...candidates]
      .filter(
        (u) =>
          isShipObjective(u) && room(s, u.id) + stats(s, u).defense > attack,
      )
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
    const ally = [...candidates]
      .filter((u) => card(u.code).type_code === "ally")
      .sort((a, b) => worth(s, a.id) - worth(s, b.id))[0];
    const defender =
      hero ??
      ship ??
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
    // The Dreadnaught first; otherwise the enemy closest to destruction.
    const enemy =
      targets.find((u) => hdPhysical(u.code) === HD.dreadnaught) ??
      [...targets].sort(
        (a, b) =>
          room(s, a.id) +
          stats(s, a).defense -
          (room(s, b.id) + stats(s, b).defense),
      )[0];
    if (enemy) {
      const own = attackersFor(s, enemy).filter((u) => ownerOf(s, u) === me);
      const attackers =
        enemy.code === HD.ophidian
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
    // At 2B the stage has no quest points: quest only to beat the staging
    // threat and keep the characters for the Dreadnaught.
    const goal =
      q.currentQuest === HD.search
        ? Math.max(0, hdQuestPoints(s) - s.progress)
        : 0;
    const target =
      stagingThreat(s) +
      (q.currentQuest === HD.search
        ? Math.max(
            2,
            Math.min(
              hdRoundCap(s),
              goal + (s.activeLocation ? questLeft(s, s.activeLocation) : 0),
            ),
          )
        : 1);
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
    // Keep the best defender and a ship back for combat.
    const guard = [...characters(s)].sort(
      (a, b) => stats(s, b).defense - stats(s, a).defense,
    )[0];
    const guardShip = [...characters(s)]
      .filter((u) => isShipObjective(u))
      .sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
    const next =
      own.find((u) => u.id !== guard?.id && u.id !== guardShip?.id) ??
      (committed ? undefined : own[0]);
    return next && committed < target
      ? { type: "TOGGLE_QUEST", id: next.id }
      : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const locations = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  const score = (u: Unit) => (u.code === HD.shipyard ? 50 : 0) + threatOf(s, u);
  const location = locations.sort((a, b) => score(b) - score(a))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}

/** Each player puts up to 3 non-unique allies from their deck into play. */
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
function common(s: GameState) {
  reinforce(s);
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 20));
}
/** The Dreadnaught arrives: 2A has been revealed and its Elite side is staged. */
function stageTwo(s: GameState) {
  const q = s.huntDreadnaught!;
  q.currentQuest = HD.destroy;
  q.questProgress = null;
  s.stage = 2;
  s.progress = 0;
  const attachments = s.questAttachments?.[HD.search] ?? [];
  s.questAttachments = {
    ...(s.questAttachments ?? {}),
    [HD.search]: [],
    [HD.destroy]: attachments,
  };
  q.setAside = q.setAside.filter((c) => c !== HD.dreadnaught);
  const u = make(s, HD.dreadnaught);
  s.staging.push(u);
  return u;
}

/**
 * A late-game start at the end of Searching the High Seas (1B) with all of
 * its 8 progress per player: the players advance at the end of this round's
 * quest phase and 2A adds the Dreadnaught. Each player's threat is 20 and
 * each player has put up to 3 non-unique allies from their deck into play.
 */
export function hdArrival(s: GameState) {
  common(s);
  s.progress = hdQuestPoints(s);
}
/**
 * The hunt at Destroy the Dreadnaught (2B): the Elite Dreadnaught is staged
 * with no damage. Each player's threat is 20 and each player has put up to
 * 3 non-unique allies from their deck into play.
 */
export function hdHunt(s: GameState) {
  common(s);
  stageTwo(s);
}
/**
 * The last fight: the Damaged Dreadnaught has 3 hit points left, every
 * set-aside unique Corsair has already been sent, and no damage was taken
 * this round. Each player's threat is 20 and each player has put up to 3
 * non-unique allies from their deck into play.
 */
export function hdFinal(s: GameState) {
  common(s);
  const q = s.huntDreadnaught!;
  const u = stageTwo(s);
  u.code = HD_DAMAGED;
  u.damage = hdDreadnaughtHealth(s) - 3;
  // The six unique Corsairs were sent and destroyed earlier.
  const uniques = [
    HD.captain,
    HD.commander,
    HD.descendant,
    HD.hydraken,
    HD.ophidian,
    HD.varjax,
  ];
  q.setAside = q.setAside.filter((c) => !uniques.includes(c));
  for (const c of uniques) {
    (s.victoryCards ??= []).push(c);
    s.victory += card(c).victory ?? 0;
  }
}
