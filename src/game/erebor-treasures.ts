import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, draw, fx, get, log, requireRule } from "./core";
import { addVictoryCard, damage, raiseThreat } from "./board";
import {
  activeSeat,
  attachmentController,
  ownerOf,
  playerOrder,
} from "./table";
import { consideredEngaged, engagedEnemies } from "./considered-engagement";
import { playerEffectImmune } from "./player-effect-immunity";
import { isEnemy } from "./ships";

/**
 * The Erebor treasures of The Hobbit: On the Doorstep, burgled from under
 * The Lonely Mountain. Their attachment restrictions and printed bonuses
 * (Mithril Shirt, Thrór's Battle Axe and Thrór's Hunting Bow) live in the
 * expansion attachment rules.
 */
export const EREBOR = {
  arkenstone: "132020",
  shirt: "132021",
  axe: "132022",
  bow: "132023",
  cup: "132024",
} as const;
const E = EREBOR;
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
/** A discount waiting for the next matching ally: phase:132020:<sphere>:<X>. */
const ARKENSTONE = `phase:${E.arkenstone}:`;
const live = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && enabled(a));

export const ereborAbilityLabel = (code: string) =>
  code === E.arkenstone
    ? "The Arkenstone · Exhaust and raise your threat by X: your next ally of the attached hero's sphere costs X less"
    : code === E.cup
      ? "Thrór's Golden Cup · Add it to the victory display to draw 3 cards"
      : undefined;
export function ereborAbilityProblem(
  s: GameState,
  u: Unit,
  a: Attachment,
): string | undefined {
  if (a.code !== E.arkenstone && a.code !== E.cup) return undefined;
  const title = card(a.code).name;
  if (!enabled(a)) return `${title}'s text is inactive.`;
  if (attachmentController(s, u, a) !== activeSeat(s))
    return `You do not control ${title}.`;
  if (a.code === E.arkenstone && a.exhausted)
    return "The Arkenstone must be ready.";
  return undefined;
}
export function useEreborAbility(s: GameState, u: Unit, a: Attachment) {
  if (a.code !== E.arkenstone && a.code !== E.cup) return false;
  const problem = ereborAbilityProblem(s, u, a);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  if (a.code === E.cup) {
    u.attachments = u.attachments.filter((x) => x.id !== a.id);
    addVictoryCard(s, a.code);
    draw(s, 3);
    log(
      s,
      "Thrór's Golden Cup is added to the victory display and its controller draws 3 cards.",
      "good",
    );
    return true;
  }
  const sphere = card(u.code).sphere_code ?? "";
  choose(
    s,
    "The Arkenstone · Raise your threat by X",
    Array.from({ length: 6 }, (_, i) => i + 1).map((x) => ({
      id: `x-${x}`,
      label: `X = ${x}: the next ${sphere} ally you play this phase costs ${x} less`,
      effects: [
        fx("hobbitPlayerArkenstone", {
          target: u.id,
          source: a.id,
          value: x,
          text: sphere,
          player,
        }),
      ],
    })),
    `Exhaust The Arkenstone and raise your threat by X. The attached hero's sphere is ${sphere}.`,
  );
  return true;
}
/** The Arkenstone lowers the cost of the next matching ally played this phase. */
export function ereborCostReduction(s: GameState, c: Card) {
  if (c.type_code !== "ally") return 0;
  return s.used
    .filter((key) => key.startsWith(`${ARKENSTONE}${c.sphere_code}:`))
    .reduce((n, key) => n + Number(key.split(":").at(-1)), 0);
}
export function ereborAllyPlayed(s: GameState, code: string) {
  const prefix = `${ARKENSTONE}${card(code).sphere_code}:`;
  s.used = s.used.filter((key) => !key.startsWith(prefix));
}
/** Thrór's Hunting Bow: +2 attack while making a ranged attack. */
export function ereborAttackBonus(s: GameState, u: Unit, enemy: Unit) {
  if (!live(u, E.bow)) return 0;
  const controller = ownerOf(s, u);
  const inStaging = s.staging.some((x) => x.id === enemy.id);
  const ranged = inStaging
    ? !consideredEngaged(s, enemy, controller) &&
      playerOrder(s).some((p) => consideredEngaged(s, enemy, p))
    : ownerOf(s, enemy) !== controller;
  return ranged ? 2 : 0;
}
/** Thrór's Battle Axe: after the attached hero attacks and destroys an enemy. */
export function ereborKillResponses(s: GameState, ids: string[]): Effect[] {
  return ids.flatMap((id) => {
    const u = get(s, id);
    return u && live(u, E.axe)
      ? [fx("hobbitPlayerAxe", { target: u.id, player: ownerOf(s, u) })]
      : [];
  });
}
const axeTargets = (s: GameState, player: number) =>
  engagedEnemies(s, player).filter(
    (e) => isEnemy(e) && !playerEffectImmune(s, e, E.axe),
  );
export function ereborTreasureEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "hobbitPlayerArkenstone": {
      const a = u?.attachments.find(
        (x) => x.id === e.source && x.code === E.arkenstone,
      );
      if (!u || !a || a.exhausted || !enabled(a)) return true;
      const x = e.value ?? 1;
      a.exhausted = true;
      raiseThreat(s, x, "cost");
      s.used.push(`${ARKENSTONE}${e.text}:${x}`);
      log(
        s,
        `The Arkenstone: its controller raises their threat by ${x}; their next ${e.text} ally this phase costs ${x} less.`,
        "good",
      );
      return true;
    }
    case "hobbitPlayerAxe": {
      const player = e.player ?? activeSeat(s);
      const targets = axeTargets(s, player);
      if (!u || !live(u, E.axe) || !targets.length) return true;
      choose(s, "Thrór's Battle Axe · Deal 1 damage to another enemy?", [
        ...targets.map((t) => ({
          id: t.id,
          code: t.code,
          label: `Deal 1 damage to ${name(t)}`,
          effects: [fx("hobbitPlayerAxeDamage", { target: t.id, player })],
        })),
        { id: "skip", label: "Decline", effects: [] },
      ]);
      return true;
    }
    case "hobbitPlayerAxeDamage":
      if (
        u &&
        axeTargets(s, e.player ?? activeSeat(s)).some((t) => t.id === u.id)
      ) {
        damage(s, u.id, 1);
        log(s, `Thrór's Battle Axe deals 1 damage to ${name(u)}.`, "good");
      }
      return true;
  }
  return false;
}
