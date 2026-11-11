import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, removeShadowCard } from "./core";
import { raiseThreat, removeFromQuest } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  forOwner,
  globalPlayerOrder,
  ownerOf,
} from "./table";
import { isEnemy } from "./ships";
import { spendBaggins } from "./hobbit-saga";
import { FAS } from "./flies-spiders-support";

/**
 * The Wilderland encounter set of The Hobbit: On the Doorstep, shared by
 * Flies and Spiders and The Lonely Mountain. Its effect kinds keep the names
 * they were saved under when Flies and Spiders introduced them.
 */
export const WILDERLAND = {
  bats: FAS.bats,
  path: FAS.path,
  weighed: FAS.weighed,
  friends: FAS.friends,
} as const;
const W = WILDERLAND;
export const WILDERLAND_TREACHERIES: readonly string[] = [W.friends, W.weighed];
type Combat = NonNullable<GameState["combat"]>;
/** Each scenario that uses the set records the rounds Weighed Down lasts. */
const holder = (s: GameState): { weighedDown: number[] } | undefined =>
  s.fliesSpiders ?? s.lonelyMountain;
const isCharacter = (u: Unit) =>
  ["hero", "ally"].includes(card(u.code).type_code);
const sphereOf = (u: Unit) => card(u.code).sphere_code ?? "";
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const inPlay = (s: GameState, u: Unit) =>
  allCharacters(s).some((x) => x.id === u.id);

/** When Revealed effects of the set's treacheries. */
export function wilderlandTreachery(s: GameState, code: string) {
  const q = holder(s);
  if (!q) return false;
  const first = firstPlayer(s);
  switch (code) {
    case W.friends:
      choose(
        s,
        "Fighting Among Friends · The first player names a sphere",
        ["leadership", "lore", "spirit", "tactics"].map((sphere) => ({
          id: sphere,
          label: sphere[0].toUpperCase() + sphere.slice(1),
          effects: [fx("fasFriends", { text: sphere, player: first })],
        })),
        "All non-Baggins characters who do not belong to the named sphere are removed from the quest.",
      );
      return true;
    case W.weighed:
      if (!q.weighedDown.includes(s.round)) q.weighedDown.push(s.round);
      log(
        s,
        "Weighed Down: until the end of the round, exhausted characters get -1 willpower, -1 attack and -1 defense.",
        "danger",
      );
      return true;
  }
  return false;
}
/** Shadow effects of the set. */
export function wilderlandShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !holder(s)) return false;
  const enemy = get(s, c.enemyId);
  const defenders = (c.defenderIds ?? [])
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (code) {
    case W.bats: {
      const d = defenders[0];
      if (!d || !enemy) return true;
      const index = enemy.shadows.indexOf(W.bats);
      if (index >= 0 && removeShadowCard(enemy, index)) {
        d.attachments.push({
          id: `a${s.nextId++}`,
          code: W.bats,
          exhausted: false,
        });
        log(s, `Dark Bats attaches to ${name(d)}.`, "danger");
      }
      return true;
    }
    case W.friends:
      c.attackBonus = (c.attackBonus ?? 0) + (defenders.length ? 1 : 2);
      return true;
    case W.weighed:
      c.fasWeighed = true;
      return true;
  }
  return false;
}
export function wilderlandEffect(s: GameState, e: Effect) {
  if (!holder(s)) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "fasFriends": {
      const removed = allCharacters(s).filter(
        (c) =>
          c.committed && sphereOf(c) !== "baggins" && sphereOf(c) !== e.text,
      );
      for (const c of removed) removeFromQuest(s, c);
      log(
        s,
        `Fighting Among Friends: ${removed.length} character${removed.length === 1 ? " is" : "s are"} removed from the quest.`,
        "danger",
      );
      return true;
    }
    case "fasPathCost":
      if (!spendBaggins(s, 2))
        log(s, "Bilbo Baggins cannot pay for Hidden Path.", "danger");
      return true;
    case "fasBatsAttach": {
      const bats = get(s, e.source);
      if (!u || !bats || !inPlay(s, u) || !isEnemy(bats)) return true;
      for (const p of globalPlayerOrder(s))
        forOwner(s, p, () => {
          s.engaged = s.engaged.filter((x) => x.id !== bats.id);
        });
      s.staging = s.staging.filter((x) => x.id !== bats.id);
      s.encounterDiscard.push(...bats.shadows);
      bats.shadows = [];
      u.attachments.push({ id: bats.id, code: bats.code, exhausted: false });
      log(s, `Dark Bats attaches to ${name(u)}.`, "danger");
      return true;
    }
    case "fasWeighedThreat":
      forOwner(s, e.player ?? activeSeat(s), () =>
        raiseThreat(s, 5, "encounter"),
      );
      log(
        s,
        "Weighed Down: the destroyed defender's controller raises their threat by 5.",
        "danger",
      );
      return true;
  }
  return false;
}
/** Shared effects resolve even while their seat is being eliminated. */
export const WILDERLAND_SHARED_EFFECTS: readonly string[] = ["fasFriends"];

/** Hidden Path: spend 2 Baggins resources (from Bilbo in your area) to travel. */
export function wilderlandTravelProblem(
  s: GameState,
  u: Unit,
  bilbo: Unit | undefined,
) {
  if (!holder(s) || u.blanked || u.code !== W.path) return null;
  return (bilbo?.resources ?? 0) < 2
    ? "Travel to Hidden Path: spend 2 Baggins resources from Bilbo Baggins."
    : null;
}
export const wilderlandTravelEffects = (s: GameState, u: Unit) =>
  holder(s) && !u.blanked && u.code === W.path
    ? [fx("fasPathCost", { player: firstPlayer(s) })]
    : undefined;
/** Hidden Path: while active, staging-area locations get -1 threat. */
export const wilderlandThreatBonus = (s: GameState, u: Unit) =>
  holder(s) &&
  card(u.code).type_code === "location" &&
  s.staging.some((x) => x.id === u.id) &&
  activeIs(s, W.path)
    ? -1
    : 0;
/** Dark Bats conditions and Weighed Down: -1/-1/-1 each. */
export function wilderlandPenalty(s: GameState, u: Unit) {
  const q = holder(s);
  if (!q || !isCharacter(u)) return 0;
  let penalty = u.attachments.filter((a) => a.code === W.bats).length;
  if (q.weighedDown.includes(s.round) && u.exhausted) penalty++;
  return penalty;
}
/** Dark Bats attaches to the character it damaged once its attack ends. */
export function wilderlandDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  ctx: DamageContext,
) {
  if (!holder(s) || amount <= 0 || !isCharacter(u) || !ctx.enemyId) return;
  const enemy = get(s, ctx.enemyId);
  if (
    enemy?.code === W.bats &&
    !enemy.blanked &&
    s.combat?.enemyId === enemy.id
  )
    s.combat.fasBats = u.id;
}
export const wilderlandAttackFinished = (
  s: GameState,
  combat: Combat,
): Effect[] =>
  holder(s) && combat.fasBats
    ? [
        fx("fasBatsAttach", {
          target: combat.fasBats,
          source: combat.enemyId,
          player: firstPlayer(s),
        }),
      ]
    : [];
/** Weighed Down shadow: a destroyed defender's controller raises threat by 5. */
export function wilderlandCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: DamageContext,
) {
  const c = s.combat;
  if (
    holder(s) &&
    c?.fasWeighed &&
    ctx.combatDamage &&
    ctx.enemyId === c.enemyId &&
    (c.defenderIds ?? []).includes(u.id)
  )
    return [fx("fasWeighedThreat", { player: ownerOf(s, u) })];
  return [];
}
