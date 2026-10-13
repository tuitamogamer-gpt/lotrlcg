import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
import type { LeaveDestination } from "./mirkwood-player-cards";
import { card, name } from "./cards";
import {
  canGainResources,
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  putPlayerDeck,
  reorderPlayerDeck,
  spendResources,
} from "./core";
import { discardPlayerDeck } from "./board";
import {
  activeSeat,
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isHero, unitType } from "./card-types";
import { heirsCanSpendResources } from "./heirs-numenor";
import { DROWNED as T, drownedState } from "./drowned-support";
const live = (s: GameState) =>
  s.scenarioId === "the-drowned-ruins" && !!s.drowned;
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const cost = (code: string) => Number(card(code).cost) || 0;
const removeOne = (pile: string[], code: string) => {
  const index = pile.lastIndexOf(code);
  if (index >= 0) pile.splice(index, 1);
};
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function bottomDiscard(s: GameState, player: number) {
  let code: string | undefined;
  forOwner(s, player, () => {
    const n = s.deck.length;
    if (!n) return;
    reorderPlayerDeck(s, 0, [
      n - 1,
      ...Array.from({ length: n - 1 }, (_, i) => i),
    ]);
    code = discardPlayerDeck(s, 1, player)[0];
  });
  return code;
}
function handToBottom(s: GameState, u: Unit, player: number) {
  forOwner(s, player, () => (s.hand = s.hand.filter((h) => h.id !== u.id)));
  forOwner(s, u.owner ?? player, () => putPlayerDeck(s, u));
}

export function drownedCompanionStats(s: GameState, u: Unit) {
  const bonus =
    live(s) && u.code === T.sahirAlly && !u.blanked
      ? Math.min(6, u.resources)
      : 0;
  return { will: bonus, attack: bonus };
}
export function drownedSahirDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (!live(s) || u.code !== T.sahir || u.blanked) return amount;
  const cancelled = Math.min(amount, u.resources);
  u.resources -= cancelled;
  return amount - cancelled;
}
export const drownedCannotSearch = (s: GameState, player = activeSeat(s)) =>
  live(s) &&
  seatView(s, player).engaged.some((u) => u.code === T.cadaver && !u.blanked);
export function drownedEngaged(s: GameState, u: Unit) {
  if (live(s) && u.code === T.cadaver && !u.blanked)
    prepend(s, fx("drownedECCadaver", { target: u.id, player: ownerOf(s, u) }));
}
/** Called after complete physical removal, before optional destruction Responses. */
export function drownedEnemyDestroyed(
  s: GameState,
  u: Unit,
  wasEngaged: boolean,
  _lastKnownThreat?: number,
) {
  const q = drownedState(s);
  if (!live(s) || !q) return;
  if (u.code === T.throngs && !u.blanked && wasEngaged) {
    const bottom = bottomDiscard(s, ownerOf(s, u));
    if (bottom && cost(bottom) <= 2 && s.encounterDiscard.includes(u.code)) {
      removeOne(s.encounterDiscard, u.code);
      s.encounterDeck.unshift(u.code);
    }
  }
}
export function drownedCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const q = drownedState(s);
  if (!live(s) || !q) return;
  if (s.combat && context.combatDamage && context.enemyId === s.combat.enemyId)
    s.combat.raidKilledCharacter = true;
  if (unitType(u) !== "ally") return;
  const enemy = get(s, context.enemyId);
  if (
    context.fateBottomOnDestroy ||
    (context.combatDamage &&
      ((enemy?.code === T.drowned && !enemy.blanked) ||
        !!s.combat?.fateBottomOnAllyKill))
  )
    if (!q.bottomOnDestroy.includes(u.id)) q.bottomOnDestroy.push(u.id);
}
export function drownedCharacterLeft(
  s: GameState,
  u: Unit,
  destination: LeaveDestination,
) {
  const q = drownedState(s);
  if (
    !live(s) ||
    !q?.bottomOnDestroy.includes(u.id) ||
    destination.zone !== "discard"
  )
    return;
  q.bottomOnDestroy = q.bottomOnDestroy.filter((id) => id !== u.id);
  forOwner(s, destination.player, () => {
    const i = destination.index ?? s.discard.lastIndexOf(u.code);
    if (s.discard[i] !== u.code) return;
    s.discard.splice(i, 1);
    putPlayerDeck(s, u);
    destination.zone = "deck";
    destination.index = s.deck.length - 1;
    destination.id = u.id;
    log(s, `${name(u)} is placed on the bottom of its owner's deck.`, "danger");
  });
}
export function drownedCharacterLeaves(s: GameState, u: Unit) {
  if (
    !live(s) ||
    !(u.code === T.naasiyahAlly || (u.code === T.sahirAlly && s.stage === 1))
  )
    return;
  if (u.blanked) {
    const q = drownedState(s)!;
    if (!q.blankedDepartures.includes(u.code)) q.blankedDepartures.push(u.code);
  } else lose(s, `${name(u)} leaves play. The players lose the game.`);
}
/** The original double-sided companions never enter an encounter/player discard. */
export function drownedCompanionRemoved(s: GameState, u: Unit) {
  if (!live(s) || ![T.sahirAlly, T.naasiyahAlly].includes(u.code)) return false;
  const q = drownedState(s)!;
  if (!q.removedUnits.some((x) => x.id === u.id)) q.removedUnits.push(u);
  return true;
}
export function drownedFirstPlayerChanged(s: GameState) {
  if (!live(s)) return;
  for (const [code, p] of [
    [T.sahirAlly, firstPlayer(s)],
    [T.naasiyahAlly, playerOrder(s).at(-1)!],
  ] as const) {
    const u = allCharacters(s).find((u) => u.code === code && !u.blanked);
    if (!u || ownerOf(s, u) === p) continue;
    forOwner(
      s,
      ownerOf(s, u),
      () => (s.allies = s.allies.filter((x) => x.id !== u.id)),
    );
    u.owner = p;
    u.controller = p;
    forOwner(s, p, () => s.allies.push(u));
  }
}
export function drownedCompanionCheck(s: GameState) {
  const q = drownedState(s);
  if (!live(s) || !q?.initialized || s.status !== "playing") return;
  for (const code of s.stage === 1
    ? [T.sahirAlly, T.naasiyahAlly]
    : [T.naasiyahAlly]) {
    const u = allCharacters(s).find((u) => u.code === code);
    if (u) {
      if (u.blanked && !q.blankedDepartures.includes(code))
        q.blankedDepartures.push(code);
      if (!u.blanked)
        q.blankedDepartures = q.blankedDepartures.filter((c) => c !== code);
    } else if (!q.blankedDepartures.includes(code)) {
      lose(s, `${card(code).name} leaves play. The players lose the game.`);
      return;
    }
  }
  drownedFirstPlayerChanged(s);
}

export function drownedAbilityLabel(s: GameState, u: Unit) {
  return live(s) && !u.blanked && [T.sahirAlly, T.naasiyahAlly].includes(u.code)
    ? "Spend 1 hero resource · Add 1 resource here · Once per round"
    : null;
}
export function drownedAbilityProblem(s: GameState, u: Unit) {
  if (!drownedAbilityLabel(s, u)) return "This card has no available action.";
  const p = ownerOf(s, u);
  if (p !== activeSeat(s)) return "Only the controller may use this action.";
  if (
    (s.table ? s.table.seats.map((_, i) => seatView(s, i)) : [s]).some((seat) =>
      seat.used.includes(`round:drowned-deposit:${u.id}:${s.round}`),
    )
  )
    return "This action has already been used this round.";
  if (!canGainResources(s, u)) return "This card cannot gain resources.";
  return own(s, p).some(
    (h) => isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
  )
    ? null
    : "A hero resource is required.";
}
export function useDrownedAbility(s: GameState, u: Unit) {
  if (!drownedAbilityLabel(s, u)) return false;
  if (!drownedAbilityProblem(s, u))
    prepend(s, fx("drownedECDeposit", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export function drownedPlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  ids: string[],
): Effect[] {
  return live(s)
    ? ids.flatMap((id) =>
        get(s, id)?.code === T.naasiyahAlly
          ? [
              fx("drownedECNaasiyahWindow", {
                target: id,
                source: enemy.id,
                flag: true,
                player: ownerOf(s, get(s, id)!),
              }),
            ]
          : [],
      )
    : [];
}
export function drownedDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return live(s)
    ? defenders
        .filter((u) => u.code === T.naasiyahAlly)
        .map((u) =>
          fx("drownedECNaasiyahWindow", {
            target: u.id,
            source: enemy.id,
            flag: false,
            player: ownerOf(s, u),
          }),
        )
    : [];
}
function clearBoosts(s: GameState, enemyId: string, playerAttack: boolean) {
  const q = drownedState(s);
  if (!q) return;
  for (const b of q.combatBoosts.filter(
    (b) => b.enemyId === enemyId && b.playerAttack === playerAttack,
  )) {
    const u = get(s, b.characterId);
    if (u) {
      u.tempAttack = (u.tempAttack ?? 0) - b.attack;
      u.tempDefense = (u.tempDefense ?? 0) - b.defense;
    }
  }
  q.combatBoosts = q.combatBoosts.filter(
    (b) => b.enemyId !== enemyId || b.playerAttack !== playerAttack,
  );
}
export function drownedPlayerAttackFinished(s: GameState, enemy: Unit) {
  if (live(s)) clearBoosts(s, enemy.id, true);
}
export function drownedAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  if (!live(s)) return;
  const enemy = get(s, combat.enemyId);
  if (!skipped && enemy && !enemy.blanked && enemy.code === T.sahir)
    enemy.resources += combat.raidKilledCharacter ? 4 : 2;
  clearBoosts(s, combat.enemyId, false);
  // FAQ 1.42: each additional attack replaces the previous physical shadows.
  if (!skipped && enemy && (combat.extraAttacks ?? 0) > 0) {
    s.encounterDiscard.push(...enemy.shadows);
    enemy.shadows = [];
    delete enemy.faceupShadows;
    enemy.revealedShadowCount = 0;
  }
}
export function drownedCompanionEncounter(
  s: GameState,
  code: string,
  replay = false,
) {
  if (!live(s) || code !== T.curse) return false;
  if (!replay) s.encounterDiscard.push(code);
  prepend(s, fx("drownedECCurse", { player: firstPlayer(s) }));
  return true;
}
export function drownedCompanionShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  if (code === T.drowned) s.combat.fateBottomOnAllyKill = true;
  else if (code === T.curse) {
    const bottom = bottomDiscard(s, s.combat.attackPlayer ?? activeSeat(s));
    if (bottom && cost(bottom) <= 2)
      s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
  } else return false;
  return true;
}
function naasiyahWindow(s: GameState, e: Effect, u?: Unit) {
  if (!u || u.blanked || ownerOf(s, u) !== (e.player ?? activeSeat(s))) return;
  const ability = {
    player: ownerOf(s, u),
    source: u.id,
    code: u.code,
    type: "action" as const,
  };
  const options: Option[] = [
    { id: "continue", label: "Continue the attack", effects: [] },
  ];
  if (u.resources > 0 && heirsCanSpendResources(s, u))
    for (const stat of ["attack", "defense"] as const)
      options.push({
        id: stat,
        label: `Spend 1 Na'asiyah resource · +2 ${stat} for this attack`,
        code: u.code,
        ability,
        effects: [{ ...e, kind: "drownedECNaasiyahBoost", text: stat }, e],
      });
  if (!drownedAbilityProblem(s, u))
    options.push({
      id: "deposit",
      label:
        "Spend 1 hero resource · Add 1 resource to Na'asiyah · Once per round",
      code: u.code,
      ability,
      effects: [
        fx("drownedECDeposit", {
          target: u.id,
          player: ownerOf(s, u),
          effects: [e],
        }),
      ],
    });
  if (options.length > 1)
    choose(
      s,
      "Na'asiyah · Combat actions",
      options,
      "Resource actions may be used while she is attacking or defending.",
    );
}
export function drownedCompanionEffect(s: GameState, e: Effect) {
  const q = drownedState(s);
  if (!live(s) || !q) return false;
  const player = e.player ?? activeSeat(s),
    u =
      get(s, e.target) ??
      seatView(s, player).hand.find((h) => h.id === e.target);
  switch (e.kind) {
    case "drownedECCadaver": {
      const cards = seatView(s, player).hand.filter((h) => cost(h.code) <= 2);
      if (cards.length)
        choose(
          s,
          "Soulless Cadaver · Put low-cost cards on the bottom",
          opts(cards, (h) => [
            fx("drownedECHandBottom", { target: h.id, player }),
            e,
          ]),
        );
      break;
    }
    case "drownedECHandBottom":
      if (u && seatView(s, player).hand.some((h) => h.id === u.id))
        handToBottom(s, u, player);
      break;
    case "drownedECCurse":
      prepend(
        s,
        ...allCharacters(s)
          .filter((u) => unitType(u) === "ally" && cost(u.code) <= 2)
          .map((u) =>
            fx("damage", {
              target: u.id,
              value: 1,
              text: encodeDamageContext({ fateBottomOnDestroy: true }),
              player: ownerOf(s, u),
            }),
          ),
      );
      break;
    case "drownedECDeposit":
      if (u && !drownedAbilityProblem(s, u))
        choose(
          s,
          `${name(u)} · Spend 1 hero resource`,
          opts(
            own(s, ownerOf(s, u)).filter(
              (h) =>
                isHero(h) && h.resources > 0 && heirsCanSpendResources(s, h),
            ),
            (h) => [
              fx("drownedECDepositPay", {
                target: u.id,
                source: h.id,
                player: ownerOf(s, u),
              }),
              ...(e.effects ?? []),
            ],
          ),
        );
      break;
    case "drownedECDepositPay": {
      const h = get(s, e.source);
      if (
        u &&
        h &&
        isHero(h) &&
        ownerOf(s, h) === ownerOf(s, u) &&
        h.resources > 0 &&
        heirsCanSpendResources(s, h) &&
        !drownedAbilityProblem(s, u)
      ) {
        spendResources(s, h, 1);
        u.resources++;
        seatView(s, ownerOf(s, u)).used.push(
          `round:drowned-deposit:${u.id}:${s.round}`,
        );
      }
      break;
    }
    case "drownedECNaasiyahWindow":
      naasiyahWindow(s, e, u);
      break;
    case "drownedECNaasiyahBoost":
      if (
        u &&
        u.resources > 0 &&
        !u.blanked &&
        ownerOf(s, u) === player &&
        heirsCanSpendResources(s, u)
      ) {
        spendResources(s, u, 1);
        const attack = e.text === "attack" ? 2 : 0,
          defense = e.text === "defense" ? 2 : 0;
        u.tempAttack = (u.tempAttack ?? 0) + attack;
        u.tempDefense = (u.tempDefense ?? 0) + defense;
        q.combatBoosts.push({
          characterId: u.id,
          enemyId: e.source!,
          playerAttack: !!e.flag,
          attack,
          defense,
        });
      }
      break;
    default:
      return false;
  }
  return true;
}
