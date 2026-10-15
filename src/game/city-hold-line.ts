import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  canPay,
  choose,
  fx,
  get,
  log,
  prepend,
  requireRule,
  skip,
  spendResourcePayment,
} from "./core";
import {
  activeSeat,
  allHeroes,
  defendersFor,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { beginEnemyAttack } from "./combat";
import { readyCharacter } from "./board";
import { hasResourceIcon } from "./expansion-passives";
import { heirsCanSpendResources } from "./heirs-numenor";
import { playerCardImmune } from "./card-immunity";

export const HOLD_THE_LINE = "12140";

export interface CityHoldLineAttack {
  defenderIds: string[];
  damagedIds: string[];
  readyPaid: boolean;
}

/** The attacked player chooses ordinary eligible defenders, including Sentinel. */
export function cityHoldLineDefenders(s: GameState, enemy: Unit) {
  return defendersFor(s, enemy).filter((u) => !playerCardImmune(u));
}

/** The declaration response precedes exhausting any ordinary chosen defender. */
export function cityHoldLineOfferAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  returnWolf = false,
  watcherResolved = false,
  shadowsPrepared = false,
) {
  if (!cityHoldLineDefenders(s, enemy).length) return false;
  const player = activeSeat(s);
  const context = {
    target: enemy.id,
    player,
    flag: returnWolf,
    value: watcherResolved ? 1 : 0,
    count: shadowsPrepared ? 1 : 0,
  };
  const resume = fx("cityHoldLineResume", {
    ...context,
    ids,
    text: "skip",
  });
  const options: Option[] = playerOrder(s).flatMap((caster) => {
    const view = seatView(s, caster);
    return view.hand
      .filter(
        (h) =>
          h.code === HOLD_THE_LINE &&
          canPay(view, {
            ...card(h.code),
            playOwner: h.owner ?? caster,
          }),
      )
      .map((h) => ({
        id: h.id,
        code: h.code,
        label: `Play Hold the Line · ${seatName(s, caster)}`,
        ability: {
          player: caster,
          source: h.id,
          code: h.code,
          type: "response" as const,
        },
        effects: [
          fx("eventPlay", {
            code: h.code,
            source: h.id,
            player: caster,
            effects: [fx("cityHoldLineChoose", { ...context, ids: [] })],
            cancelledEffects: [resume],
          }),
        ],
      }));
  });
  if (!options.length) return false;
  choose(s, "Hold the Line · Enemy declared as an attacker", [
    ...options,
    { ...skip, effects: [resume] },
  ]);
  return true;
}

/** Attach the lasting effect before declaration/shadow damage can occur. */
export function cityHoldLineDeclared(s: GameState, defenderIds: string[]) {
  if (!s.combat) return;
  s.combat.cityHoldLine = {
    defenderIds: [...defenderIds],
    damagedIds: [],
    readyPaid: false,
  };
}

/** Healing later in the attack cannot erase damage already taken from it. */
export function cityHoldLineDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  const attack = s.combat?.cityHoldLine;
  if (
    amount <= 0 ||
    context.cost ||
    !attack?.defenderIds.includes(u.id) ||
    (context.enemyId && context.enemyId !== s.combat!.enemyId)
  )
    return;
  if (!attack.damagedIds.includes(u.id)) attack.damagedIds.push(u.id);
}

/** The optional payment creates a delayed effect; it never readies early. */
export function cityHoldLineAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  canceled = false,
): Effect[] {
  const attack = combat.cityHoldLine;
  if (!attack?.readyPaid || canceled) return [];
  return attack.defenderIds
    .filter((id) => !attack.damagedIds.includes(id))
    .flatMap((id) => {
      const u = get(s, id);
      return u
        ? [fx("cityHoldLineReady", { target: id, player: ownerOf(s, u) })]
        : [];
    });
}

const payers = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      h.resources > 0 &&
      hasResourceIcon(h, "tactics") &&
      heirsCanSpendResources(seatView(s, ownerOf(s, h)), h),
  );

export function handleCityHoldLineEffect(s: GameState, e: Effect): boolean {
  const enemy = get(s, e.target);
  switch (e.kind) {
    case "cityHoldLineChoose": {
      if (!enemy) return true;
      const chosen = e.ids ?? [];
      requireRule(
        chosen.length <= 3 && new Set(chosen).size === chosen.length,
        "Hold the Line permits up to three distinct eligible defenders.",
      );
      const remaining = cityHoldLineDefenders(s, enemy).filter(
        (u) => !chosen.includes(u.id),
      );
      if (chosen.length === 3 || !remaining.length) {
        prepend(s, { ...e, kind: "cityHoldLineResume", text: "declared" });
        return true;
      }
      choose(
        s,
        `Hold the Line · Declare defender ${chosen.length + 1} of up to 3`,
        [
          ...remaining.map((u) => ({
            id: u.id,
            code: u.code,
            label: `${name(u)} · ${seatName(s, ownerOf(s, u))}`,
            effects: [
              { ...e, kind: "cityHoldLineChoose", ids: [...chosen, u.id] },
            ],
          })),
          {
            id: "done",
            label: chosen.length
              ? `Declare ${chosen.length} defender${chosen.length === 1 ? "" : "s"}`
              : "Leave the attack undefended",
            effects: [{ ...e, kind: "cityHoldLineResume", text: "declared" }],
          },
        ],
        "Their defense is combined. Any combat damage is assigned to one defender.",
      );
      return true;
    }
    case "cityHoldLineResume": {
      if (!enemy) return true;
      // immediateDefend has already marked its declaration continuation as
      // pending=false when this optional response suspends beginEnemyAttack.
      const immediate = s.combat?.immediate ? s.combat : undefined;
      beginEnemyAttack(
        s,
        enemy,
        e.ids ?? [],
        !!e.flag,
        !!e.value,
        !!e.count,
        false,
        false,
        e.text === "declared" ? "declared" : "skip",
      );
      if (immediate && s.combat)
        s.combat = {
          ...immediate,
          ...s.combat,
          immediate: true,
          immediatePendingDeclaration: false,
        };
      return true;
    }
    case "cityHoldLineGroupOffer":
      if (
        s.combat &&
        s.combat.enemyId === e.target &&
        s.combat.cityHoldLine?.defenderIds.length &&
        payers(s).reduce((n, h) => n + h.resources, 0) >= 2
      )
        choose(
          s,
          "Hold the Line · Then spend 2 Tactics resources as a group?",
          [
            {
              id: "pay",
              label:
                "Spend 2 Tactics resources · Ready undamaged defenders after this attack",
              effects: [
                fx("cityHoldLineGroupChoose", {
                  target: e.target,
                  ids: [],
                  player: activeSeat(s),
                }),
              ],
            },
            skip,
          ],
          "Pay now. A defender that takes damage from this attack will remain exhausted.",
        );
      return true;
    case "cityHoldLineGroupChoose": {
      const picked = e.ids ?? [];
      if (picked.length === 2) {
        prepend(s, { ...e, kind: "cityHoldLineGroupPay" });
        return true;
      }
      requireRule(picked.length < 2, "Choose exactly two Tactics resources.");
      const available = payers(s).filter(
        (h) => h.resources > picked.filter((id) => id === h.id).length,
      );
      requireRule(
        available.length,
        "The shared payment must remain available.",
      );
      choose(
        s,
        `Hold the Line · Choose Tactics resource ${picked.length + 1} of 2`,
        available.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} · ${seatName(s, ownerOf(s, h))}`,
          effects: [
            { ...e, kind: "cityHoldLineGroupChoose", ids: [...picked, h.id] },
          ],
        })),
        "Choose the complete payment before spending any resources.",
      );
      return true;
    }
    case "cityHoldLineGroupPay": {
      const picked = e.ids ?? [];
      const amounts = new Map<string, number>();
      for (const id of picked) amounts.set(id, (amounts.get(id) ?? 0) + 1);
      requireRule(
        s.combat &&
          s.combat.enemyId === e.target &&
          s.combat.cityHoldLine &&
          picked.length === 2 &&
          [...amounts].every(([id, amount]) =>
            payers(s).some((h) => h.id === id && h.resources >= amount),
          ),
        "Pay exactly two available Tactics resources for this attack.",
      );
      s.combat!.cityHoldLine!.readyPaid = true;
      spendResourcePayment(s, Object.fromEntries(amounts));
      log(
        s,
        "Hold the Line · Group payment will ready surviving defenders that take no damage from this attack.",
      );
      return true;
    }
    case "cityHoldLineReady": {
      const u = get(s, e.target);
      if (u && !playerCardImmune(u)) readyCharacter(s, u);
      return true;
    }
    default:
      return false;
  }
}
