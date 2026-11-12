import { card } from "../src/game/cards";
import { canCommit, canTravel, characters, stats } from "../src/game/engine";
import { get, objectiveFree } from "../src/game/core";
import { allCharacters, firstPlayer, seatView } from "../src/game/table";
import {
  engagedEnemies,
  normalAttackPending,
} from "../src/game/considered-engagement";
import { defendersFor } from "../src/game/table";
import { enemyAttackPrevented } from "../src/game/engine";
import { availableAbilities } from "../src/game/actions";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  LAKE,
  lakePlayers,
  lakeTownDamage,
} from "../src/game/lake-town-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const LAKE_SCENARIOS = [
  "the-battle-of-lake-town",
] as const satisfies readonly ScenarioId[];
export type LakeScenario = (typeof LAKE_SCENARIOS)[number];
export const isLakeScenario = (id: ScenarioId): id is LakeScenario =>
  LAKE_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
const isAlly = (s: GameState, id: string) =>
  card(get(s, id)?.code ?? "").type_code === "ally";
/** Against Smaug: chump with an ally, else the defender who survives, else the toughest. */
function smaugDefender(s: GameState, ids: string[], attack: number) {
  const ally = ids
    .filter((id) => isAlly(s, id))
    .sort((a, b) => room(s, a) - room(s, b))[0];
  if (ally) return ally;
  const survives = (id: string) => {
    const u = get(s, id)!;
    return room(s, id) > Math.max(0, attack - stats(s, u).defense);
  };
  return (
    ids.find(survives) ??
    [...ids].sort((a, b) => {
      const da = stats(s, get(s, a)!).defense + room(s, a);
      const db = stats(s, get(s, b)!).defense + room(s, b);
      return db - da;
    })[0]
  );
}
const resets = (s: GameState) =>
  s.log.filter((l) => l.text.startsWith("The Dragon's Wrath: the quest deck"))
    .length;

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function lakeSimulationChoice(s: GameState): Option | undefined {
  if (!isLakeScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  // Smaug engages the first player when an ally can take his attack (or at
  // 3B, where he can be defeated); otherwise he stays in the staging area.
  if (/Where does the dragon strike/.test(title)) {
    const chump = seatView(s, firstPlayer(s)).allies.length > 0;
    return options.find(
      (o) => o.id === (s.stage === 3 || chump ? "engaged" : "staging"),
    );
  }
  // Burn: once Lake-town is in danger, characters take burn they can survive.
  if (/^Burn · .* takes how much burn damage\?/.test(title))
    return (
      [...options]
        .filter(
          (o) => o.id.startsWith("take-") && !o.label.includes("(destroyed)"),
        )
        .sort(
          (a, b) => (b.effects[0].value ?? 0) - (a.effects[0].value ?? 0),
        )[0] ?? options.find((o) => o.id === "back")
    );
  if (/^Burn · \d+ damage to assign/.test(title)) {
    const remaining = Number(/(\d+) damage/.exec(title)?.[1] ?? 0);
    if (lakeTownDamage(s) + remaining >= 35) {
      const sturdy = options
        .filter((o) => get(s, o.id) && room(s, o.id) >= 2)
        .sort((a, b) => room(s, b.id) - room(s, a.id))[0];
      if (sturdy) return sturdy;
    }
    return options.find((o) => o.id === "town");
  }
  // Fire and Water: douse the flames once the town is badly burned.
  if (/Fire and Water · Douse the flames/.test(title))
    return lakeTownDamage(s) >= 25
      ? options[0]
      : options.find((o) => o.id === "keep");
  // Never discard a hero to cancel a shadow effect.
  if (
    /Close to the Flame · Shadow effect|Scorching Blast · Shadow effect/.test(
      title,
    )
  )
    return options.find((o) => o.id === "resolve");
  if (/The Old Thrush · Smaug's defense −(\d+)/.test(title)) {
    const value = Number(/−(\d+)/.exec(title)![1]);
    return value < 2 && options.length > 2
      ? options[0]
      : options.find((o) => o.id === "done");
  }
  if (
    /Assign.*damage|damage.*hero|damage.*character/i.test(title) &&
    options.some((o) => get(s, o.id))
  )
    return [...options.filter((o) => get(s, o.id))].sort(
      (a, b) => room(s, b.id) - room(s, a.id),
    )[0];
  const enemy = get(s, s.combat?.enemyId);
  if (
    /Immediate attack/i.test(title) &&
    enemy &&
    /Smaug/.test(enemy.code ? card(enemy.code).name : "")
  ) {
    const ids = options.filter((o) => get(s, o.id)).map((o) => o.id);
    const id = smaugDefender(s, ids, stats(s, enemy).attack);
    return options.find((o) => o.id === id) ?? options[0];
  }
  if (/defend|Immediate attack/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).defense : -1) - (ua ? stats(s, ua).defense : -1)
      );
    })[0];
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

export function lakeSimulationAction(s: GameState): Action | undefined {
  if (!isLakeScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  // Claim The Old Thrush with the hero with the most attack.
  const thrush = s.staging.find((u) => u.code === LAKE.thrush);
  if (thrush && s.phase === "planning" && objectiveFree(s, thrush)) {
    const hero = [...s.heroes]
      .filter((h) => !h.exhausted)
      .sort((a, b) => stats(s, b).attack - stats(s, a).attack)[0];
    if (hero) return { type: "CLAIM", id: thrush.id, heroId: hero.id };
  }
  // The Dragon's Wrath: return once to 2B when Lake-town outweighs the victory display.
  const quest = mainQuestUnit(s);
  if (
    s.phase === "refresh" &&
    quest?.code === LAKE.wrath &&
    resets(s) < 1 &&
    lakeTownDamage(s) >= s.victory + 8 &&
    availableAbilities(s, quest).some((a) => !a.disabled)
  )
    return { type: "ABILITY", id: quest.id };
  // Defend Smaug with an ally if possible; never waste a hero needlessly.
  if (s.phase === "defense") {
    const smaug = engagedEnemies(s).find(
      (u) =>
        card(u.code).name.startsWith("Smaug") &&
        normalAttackPending(s, u) &&
        !enemyAttackPrevented(s, u),
    );
    if (smaug) {
      const ids = defendersFor(s, smaug).map((u) => u.id);
      return {
        type: "DEFEND",
        enemyId: smaug.id,
        defenderId: ids.length
          ? smaugDefender(s, ids, stats(s, smaug).attack)
          : null,
      };
    }
  }
  if (s.phase === "quest") {
    // Keep an ally back to take Smaug's attack, else the best defender.
    const own = characters(s);
    const guard =
      own.find((u) => card(u.code).type_code === "ally") ??
      [...own].sort((a, b) => stats(s, b).defense - stats(s, a).defense)[0];
    const ready = own.find(
      (u) =>
        u.id !== guard?.id &&
        canCommit(s, u) &&
        !s.committedIds.includes(u.id) &&
        stats(s, u).will > 0,
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  // Solo: Merchant's District costs only 2 damage for 3 victory points.
  const district = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].find((u) => u.code === LAKE.merchant);
  if (
    district &&
    lakePlayers(s) === 1 &&
    lakeTownDamage(s) < 30 &&
    availableAbilities(s, district).some((a) => !a.disabled)
  )
    return { type: "ABILITY", id: district.id };
  const open = s.staging.filter(
    (u) => card(u.code).type_code === "location" && !canTravel(s, u),
  );
  if (s.activeLocation) {
    // Exhaust a hero to make Fisherman's Dock a second active location.
    const dock = open.find(
      (u) => u.code === LAKE.dock && !(s.extraActiveLocations ?? []).length,
    );
    return dock ? { type: "TRAVEL", id: dock.id } : { type: "NEXT" };
  }
  const location = open.sort(
    (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
  )[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
