import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, random } from "./core";
import {
  activeSeat,
  globalCharacters,
  globalEngaged,
  playerOrder,
  seatName,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { returnToStaging } from "./black-riders-hunted";
import { UH } from "./uruk-hai-support";

/**
 * The Snaga Orcs encounter set of The Treason of Saruman, shared by The
 * Uruk-hai and The Road to Isengard: Snaga and Saruman's Orders. Its effect
 * kinds keep the names they were saved under when The Uruk-hai introduced
 * them.
 */
export const SNAGA_ORCS = {
  snaga: UH.snaga,
  orders: UH.orders,
} as const;
const O = SNAGA_ORCS;
/** Each scenario that uses the set. */
export const snagaOrcsHolder = (s: GameState) => s.urukHai ?? s.roadIsengard;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);

/** Snaga's When Revealed effect, once it is in the staging area. */
export function snagaOrcsEnemyRevealed(
  s: GameState,
  code: string,
  fromReveal: boolean,
) {
  if (code !== O.snaga || !snagaOrcsHolder(s)) return false;
  if (!fromReveal) return true;
  const u = [...s.staging].reverse().find((x) => x.code === code);
  prepend(s, fx("uhSnaga", { target: u?.id, player: activeSeat(s) }));
  return true;
}
/** Saruman's Orders' When Revealed effect. */
export function snagaOrcsTreachery(s: GameState, code: string) {
  if (code !== O.orders || !snagaOrcsHolder(s)) return false;
  prepend(s, ...playerOrder(s).map((player) => fx("uhOrders", { player })));
  return true;
}
/** Saruman's Orders' shadow. */
export function snagaOrcsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || code !== O.orders || !snagaOrcsHolder(s)) return false;
  c.attackBonus += 1;
  c.uhOrders = true;
  log(
    s,
    "Saruman's Orders: the attacking enemy gets +1 attack; if this attack destroys a character, it returns to the staging area.",
    "danger",
  );
  return true;
}
/** Saruman's Orders returns the attacking enemy after its attack destroys a character. */
export function snagaOrcsCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat;
  if (
    !snagaOrcsHolder(s) ||
    !c?.uhOrders ||
    !(isHero(u) || isAlly(u)) ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId
  )
    return;
  c.returnToStaging = true;
}

export function snagaOrcsEffect(s: GameState, e: Effect): boolean {
  if (!snagaOrcsHolder(s)) return false;
  const p = e.player ?? activeSeat(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...globalCharacters(s), ...globalEngaged(s), ...s.staging].find(
        (x) => x.id === e.target,
      ))
    : undefined;
  switch (e.kind) {
    case "uhOrders": {
      const engaged = s.engaged.filter((x) => isEnemy(x));
      const options: Option[] = [
        ...engaged.map((x) => ({
          id: `return-${x.id}`,
          code: x.code,
          label: `Return ${name(x)} to the staging area`,
          effects: [fx("uhOrdersReturn", { target: x.id, player: p })],
        })),
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Saruman's Orders · Choose${seatLabel(s, p)}`,
        options,
        "Each player must choose: either return an enemy engaged with him to the staging area, or reveal an encounter card.",
      );
      return true;
    }
    case "uhOrdersReturn":
      if (u) returnToStaging(s, u);
      return true;
    case "uhSnaga": {
      if (!s.hand.length) {
        log(
          s,
          `Snaga: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      const i = Math.floor(random(s) * s.hand.length);
      const [discarded] = s.hand.splice(i, 1);
      s.discard.push(discarded.code);
      const cost = Number(card(discarded.code).cost) || 0;
      if (u && cost > 0) u.roundThreat = (u.roundThreat ?? 0) + cost;
      log(
        s,
        `Snaga: ${who(s, p)} ${verb(s, "discard")} a random card (${name(discarded)}, printed cost ${cost}); Snaga gets +${cost} threat until the end of the round.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}
