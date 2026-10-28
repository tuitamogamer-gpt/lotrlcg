import type { Card, GameState, Unit } from "./types";
import { card, SCRIPTED } from "./cards";
import { isHero } from "./card-types";
import { activeSeat, allHeroes, ownerOf, seatIndices } from "./table";
import { restrictedAttachment, restrictedSlots } from "./expansion-passives";
import { playerEffectImmune } from "./player-effect-immunity";
import { rhosgobelHealingAllowed } from "./rhosgobel";

export const ULFAST_PLAYER = {
  sentry: "22030",
  bow: "22031",
  strength: "22033",
  knight: "22034",
  hunters: "22049",
} as const;
export const huntersContract = (s: GameState, player = activeSeat(s)) =>
  s.ulfastPlayers?.contracts.find((c) => c.player === player);
export const huntersHealingTargets = (s: GameState, player = activeSeat(s)) =>
  allHeroes(s).filter(
    (h) =>
      ownerOf(s, h) === player &&
      !playerEffectImmune(s, h, ULFAST_PLAYER.hunters) &&
      rhosgobelHealingAllowed(s, h),
  );
// Raiment of War explicitly counts as two Restricted attachments, including
// the contract's flip requirement and reverse-side willpower bonus.
export const hunterAttachmentCount = (u: Unit) =>
  restrictedSlots({
    ...u,
    attachments: u.attachments.filter((a) => !a.facedown),
  });
export const huntersRestrictedBonus = (s: GameState | undefined, u: Unit) =>
  s && isHero(u) && huntersContract(s, ownerOf(s, u)) ? 1 : 0;
export const huntersDiscountKey = (u: Unit) => `round:ulfast-discount:${u.id}`;
export function huntersCostReduction(s: GameState, c: Card, target?: Unit) {
  return target &&
    isHero(target) &&
    ownerOf(s, target) === activeSeat(s) &&
    c.type_code === "attachment" &&
    restrictedAttachment(c.code) &&
    huntersContract(s)?.side === "A" &&
    !s.used.includes(huntersDiscountKey(target))
    ? 1
    : 0;
}
export function ulfastPlayerStats(s: GameState, u: Unit) {
  return {
    will:
      isHero(u) &&
      huntersContract(s, ownerOf(s, u))?.side === "B" &&
      !playerEffectImmune(s, u, ULFAST_PLAYER.hunters)
        ? hunterAttachmentCount(u)
        : 0,
    attack: u.attachments.filter(
      (a) =>
        a.code === ULFAST_PLAYER.strength &&
        !a.blanked &&
        !a.facedown &&
        !playerEffectImmune(s, u, a.code),
    ).length,
  };
}
export const ulfastPlayerAttackBonus = (s: GameState, u: Unit, enemy: Unit) =>
  s.ulfastPlayers?.attackBonuses
    .filter((b) => b.hero === u.id && b.enemy === enemy.id)
    .reduce((n, b) => n + b.value, 0) ?? 0;
export function validateUlfastPlayers(
  s: GameState,
  validUnit: (v: unknown) => boolean,
) {
  const q = s.ulfastPlayers;
  if (q === undefined) return true;
  const ids = seatIndices(s),
    id = (v: unknown) => typeof v === "string" && !!v;
  return (
    !!q &&
    Array.isArray(q.contracts) &&
    Array.isArray(q.attackBonuses) &&
    q.contracts.every(
      (c) =>
        !!c &&
        ids.includes(c.player) &&
        ["A", "B"].includes(c.side) &&
        validUnit(c.unit) &&
        c.unit.code === ULFAST_PLAYER.hunters &&
        (c.unit.owner ?? c.player) === c.player,
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length &&
    q.attackBonuses.every(
      (b) =>
        !!b &&
        id(b.hero) &&
        id(b.enemy) &&
        Number.isSafeInteger(b.value) &&
        b.value >= 0,
    )
  );
}
export function huntersDeckProblems(cards: Record<string, number>) {
  return cards[ULFAST_PLAYER.hunters] &&
    Object.entries(cards).some(
      ([c, n]) => n > 0 && SCRIPTED.has(c) && card(c).type_code === "ally",
    )
    ? ["Forth, The Three Hunters! cannot include ally cards in its deck."]
    : [];
}
export function huntersAbilityProblem(s: GameState, id: string): string | null {
  const c = huntersContract(s);
  if (!c || c.unit.id !== id) return "Choose your own Three Hunters contract.";
  if (s.phase === "setup") return "Wait for an action window.";
  if (c.side === "A") {
    if (s.phase !== "refresh")
      return "Flip this contract during a Refresh action window.";
    const heroes = allHeroes(s).filter((h) => ownerOf(s, h) === c.player);
    if (!heroes.length || heroes.some((h) => hunterAttachmentCount(h) < 2))
      return "Each of your heroes needs at least two restricted attachments.";
  } else {
    if (c.unit.exhausted) return "The Three Hunters contract is exhausted.";
    if (!huntersHealingTargets(s, c.player).length)
      return "None of your heroes can be healed.";
  }
  return null;
}
