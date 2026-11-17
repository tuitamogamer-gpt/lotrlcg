import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, make, stagingThreat, threatOf } from "../src/game/core";
import { optionalEngagementProblem } from "../src/game/actions";
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
import {
  ADG,
  ADG_LIEUTENANTS,
  ADG_SIEGE,
  ADG_STAGE3,
  ADG_STAGE3_CODES,
} from "../src/game/attack-dol-guldur-support";
import type {
  Action,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "../src/game/types";

export const ADG_SIM_SCENARIOS = [
  "attack-on-dol-guldur",
] as const satisfies readonly ScenarioId[];
export type AdgSimScenario = (typeof ADG_SIM_SCENARIOS)[number];
export const isAdgSimScenario = (id: ScenarioId): id is AdgSimScenario =>
  ADG_SIM_SCENARIOS.some((scenario) => scenario === id);

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
const atStage3 = (s: GameState) =>
  !!s.attackDolGuldur &&
  ADG_STAGE3_CODES.includes(s.attackDolGuldur.currentQuest) &&
  !s.stageRevealing;
/** Progress the players keep at stage 3 to pay its Forced effect twice. */
const reserve = (s: GameState) => (atStage3(s) ? 10 : 0);
const worth = (c: string) =>
  (card(c).willpower ?? 0) + (card(c).attack ?? 0) + (card(c).defense ?? 0);
/** Dangerous cards that Power of Lórien cancels. */
const CANCEL: readonly string[] = [
  ADG.army,
  ADG.olog,
  ADG.servant,
  ADG.sevenfold,
];

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function adgSimulationChoice(s: GameState): Option | undefined {
  if (!isAdgSimScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const by = (id: string) => options.find((o) => o.id === id);
  if (/^Revealed · /.test(title)) {
    const code = options.find((o) => o.id === "resolve")?.code ?? "";
    return (
      (CANCEL.includes(code) ? by("adg-power") : undefined) ?? by("resolve")
    );
  }
  if (/^Assault on the Golden Wood · Raise each player's threat/.test(title))
    return playerOrder(s).every((p) => (s.table ? true : p === 0)) &&
      s.threat < 35
      ? by("use")
      : by("skip");
  if (/^Crossing the Anduin · Remove 10 progress/.test(title))
    return by("host");
  if (/^Crossing the Anduin · Remove 20 more progress/.test(title))
    return by("power");
  if (/Search for a Dol Guldur location/.test(title))
    return by(ADG.gate) ?? options[0];
  // A stage 3 whose Dol Guldur location is in the staging area; else the
  // weakest Lieutenant.
  if (/Advance to a (new )?stage 3/.test(title)) {
    const score = (c: string) =>
      (s.victoryCards?.includes(ADG_STAGE3[c].lieutenant) ? 100 : 0) +
      10 * s.staging.filter((u) => u.code === ADG_STAGE3[c].location).length -
      (card(ADG_STAGE3[c].lieutenant).attack ?? 0);
    return [...options].sort(
      (a, b) => score(b.code ?? "") - score(a.code ?? ""),
    )[0];
  }
  if (/· Remove 5 progress from this stage, or/.test(title))
    return by("progress") ?? options[0];
  if (/· Remove an additional 5 progress\?/.test(title)) return by("bonus");
  if (/Choose a non-unique enemy to destroy/.test(title))
    return [...options].sort(
      (a, b) => (ADG_SIEGE[b.code ?? ""] ?? 0) - (ADG_SIEGE[a.code ?? ""] ?? 0),
    )[0];
  if (/Keep 1 card; discard the rest/.test(title))
    return [...options].sort(
      (a, b) => worth(b.code ?? "") - worth(a.code ?? ""),
    )[0];
  if (/Search your deck for a card/.test(title))
    return (
      [...options]
        .filter((o) => card(o.code ?? "").type_code === "ally")
        .sort((a, b) => worth(b.code ?? "") - worth(a.code ?? ""))[0] ??
      options[0]
    );
  if (/Put an ally from the top 10 cards/.test(title))
    return (
      [...options]
        .filter((o) => o.id !== "skip")
        .sort((a, b) => worth(b.code ?? "") - worth(a.code ?? ""))[0] ??
      by("skip")
    );
  if (/Discard an ally you control/.test(title))
    return [...options].sort(
      (a, b) =>
        (a.code === ADG.host ? 99 : worth(a.code ?? "")) -
        (b.code === ADG.host ? 99 : worth(b.code ?? "")),
    )[0];
  if (/^Power Sevenfold · /.test(title))
    return (
      options.find((o) => o.id === `location:${ADG.gate}`) ??
      options.find((o) => o.id.startsWith("location:")) ??
      [...options].sort(
        (a, b) =>
          (card(a.code ?? "").attack ?? 9) - (card(b.code ?? "").attack ?? 9),
      )[0]
    );
  // Remove progress only beyond what stage 3 needs.
  if (/^Battle Warg · Remove 1 progress/.test(title))
    return s.progress > reserve(s) + 1 ? by("progress") : by("other");
  if (/^Dol Guldur Marauder · Remove 1 progress/.test(title))
    return s.progress > reserve(s) + 1 ? by("progress") : by("other");
  if (/^Beast of Taur-nu-Fuin · Remove 2 progress/.test(title))
    return s.progress > reserve(s) + 2 ? by("progress") : by("other");
  if (/^Amon Lanc Archer · Remove 2 progress/.test(title))
    return s.progress > reserve(s) + 2 ? by("progress") : by("other");
  if (/^Mirkwood Olog-hai · Remove 2 progress/.test(title)) return by("return");
  // Damage to a character, or assigned damage: the most remaining hit points.
  if (
    /Deal 2 damage to an ally|Assign damage among|Assign Archery damage/i.test(
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

export function adgSimulationAction(s: GameState): Action | undefined {
  if (!isAdgSimScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  const q = s.attackDolGuldur;
  const open = q?.cityStrength === 0;
  // The encounter phase: a player with one enemy engaged or none engages the
  // weakest non-Lieutenant enemy in the staging area.
  if (s.phase === "encounter") {
    const weakest = s.staging
      .filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          !ADG_LIEUTENANTS.includes(u.code) &&
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
  // The players attack a Lieutenant once it has lost indestructible, else an
  // enemy with a siege value.
  if (s.phase === "attack") {
    const me = activeSeat(s);
    const targets = engagedEnemies(s).filter(
      (e) =>
        !e.attackedBy?.includes(me) &&
        attackersFor(s, e).some((u) => ownerOf(s, u) === me),
    );
    const lieutenant = targets.find((e) => ADG_LIEUTENANTS.includes(e.code));
    const enemy =
      (lieutenant && open ? lieutenant : undefined) ??
      [...targets]
        .filter((e) => !ADG_LIEUTENANTS.includes(e.code))
        .sort(
          (a, b) =>
            stats(s, a).health - a.damage - (stats(s, b).health - b.damage) ||
            (ADG_SIEGE[b.code] ?? 0) - (ADG_SIEGE[a.code] ?? 0),
        )[0];
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
    // Commit enough willpower for the staging area and some progress (stage
    // 3 needs 10 a round); the best defender stays back. In the last fight,
    // the player facing a Lieutenant keeps every character back to attack.
    if (open && s.engaged.some((u) => ADG_LIEUTENANTS.includes(u.code)))
      return { type: "COMMIT" };
    const target =
      stagingThreat(s) + (atStage3(s) ? 12 : 3 * players(s)) - s.progress;
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
  // A location with a siege value first; else the highest threat.
  const score = (u: Unit) =>
    (atStage3(s) ? 10 * (ADG_SIEGE[u.code] ?? 0) : 0) + threatOf(s, u);
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
 * The armies of Lórien across the Anduin: Host of Lórien is under the first
 * player's control, Power of Lórien in his play area, and 2B has added Gate
 * of Dol Guldur to the staging area.
 */
function crossed(s: GameState) {
  const q = s.attackDolGuldur!;
  const first = playerOrder(s)[0];
  s.staging = s.staging.filter((u) => u.code !== ADG.power);
  q.lorien = { player: first };
  q.setAside = q.setAside.filter((c) => c !== ADG.host);
  forOwner(s, first, () => {
    const host = make(s, ADG.host);
    host.owner = first;
    s.allies.push(host);
  });
  const gate = s.encounterDeck.indexOf(ADG.gate);
  if (gate >= 0) {
    s.encounterDeck.splice(gate, 1);
    s.staging.push(make(s, ADG.gate));
  }
  for (const p of playerOrder(s)) forOwner(s, p, () => (s.threat = 18));
}
/**
 * A mid-game start at The Siege of Dol Guldur (3B): the players crossed the
 * Anduin with Host of Lórien and Power of Lórien, Gate of Dol Guldur waits in
 * the staging area with Bane of Amon Lanc, and Dol Guldur's city strength is
 * down to 4. Each player's threat is 18 and each player has put up to 3
 * non-unique allies from his deck into play.
 */
export function adgSiege(s: GameState) {
  const q = s.attackDolGuldur!;
  reinforce(s);
  crossed(s);
  q.setAside = q.setAside.filter((c) => c !== ADG.bane);
  s.staging.push(make(s, ADG.bane));
  q.currentQuest = ADG.siege;
  q.questResources = 0;
  q.cityStrength = 4;
  s.stage = 3;
  s.progress = 0;
}
/**
 * The last fight, at The Siege of Dol Guldur (3B): Dol Guldur's city strength
 * is 0, so Bane of Amon Lanc has lost indestructible; it is engaged with the
 * first player with 3 hit points left, and the stage holds 10 progress. The
 * players crossed the Anduin with Host of Lórien and Power of Lórien; each
 * player's threat is 18 and each player has put up to 3 non-unique allies
 * from his deck into play.
 */
export function adgFinal(s: GameState) {
  const q = s.attackDolGuldur!;
  reinforce(s);
  crossed(s);
  q.setAside = q.setAside.filter((c) => c !== ADG.bane);
  const first = playerOrder(s)[0];
  forOwner(s, first, () => {
    const bane = make(s, ADG.bane);
    bane.damage = (card(ADG.bane).health ?? 9) - 3;
    s.engaged.push(bane);
  });
  q.currentQuest = ADG.siege;
  q.questResources = 0;
  q.cityStrength = 0;
  s.stage = 3;
  s.progress = 10;
}
