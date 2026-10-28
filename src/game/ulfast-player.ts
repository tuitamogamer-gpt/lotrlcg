import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, make, prepend, requireRule } from "./core";
import { destroy, discardHandCard, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { restrictedAttachment } from "./expansion-passives";
import { isHero } from "./card-types";
import { isSacked } from "./carrock";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { shadowEastRing } from "./shadow-east-player-support";
import { discardableHand } from "./hand-rules";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { batch4Scenario } from "./batch4-scenarios";
import {
  ULFAST_PLAYER as P,
  huntersAbilityProblem,
  huntersContract,
  huntersDeckProblems,
  huntersDiscountKey,
  huntersHealingTargets,
} from "./ulfast-player-support";

const state = (s: GameState) =>
  (s.ulfastPlayers ??= { contracts: [], attackBonuses: [] });
const skip = { id: "skip", label: "Skip the response", effects: [] };
export function huntersPlayerEliminated(s: GameState, player: number) {
  const q = s.ulfastPlayers;
  if (!q) return;
  for (const c of q.contracts.filter((c) => c.player === player))
    forOwner(s, player, () => s.removed.push(c.unit.code));
  q.contracts = q.contracts.filter((c) => c.player !== player);
}
export function huntersSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count =
        s.deck.filter((c) => c === P.hunters).length ||
        s.customDeck?.[P.hunters] ||
        0;
      if (!count) return;
      requireRule(count === 1, "Choose one Three Hunters contract.");
      requireRule(
        !s.deck.some((c) => card(c).type_code === "ally") &&
          !huntersDeckProblems(s.customDeck ?? {}).length,
        "Forth, The Three Hunters! cannot include ally cards in its deck.",
      );
      s.deck = s.deck.filter((c) => c !== P.hunters);
      const unit = make(s, P.hunters);
      unit.owner = player;
      state(s).contracts.push({ player, unit, side: "A" });
    });
}
export function useHuntersAbility(s: GameState, u: Unit): boolean {
  if (u.code !== P.hunters) return false;
  requireRule(
    !huntersAbilityProblem(s, u.id),
    huntersAbilityProblem(s, u.id) ?? "Unavailable contract action.",
  );
  const c = huntersContract(s)!;
  if (c.side === "A") c.side = "B";
  else {
    c.unit.exhausted = true;
    prepend(
      s,
      ...huntersHealingTargets(s, c.player).map((h) =>
        fx("heal", {
          target: h.id,
          source: u.id,
          code: P.hunters,
          value: 1,
          player: c.player,
        }),
      ),
    );
  }
  return true;
}
export function huntersAttachmentPlayed(
  s: GameState,
  host: Unit,
  code: string,
  played: boolean,
) {
  if (
    played &&
    isHero(host) &&
    ownerOf(s, host) === activeSeat(s) &&
    restrictedAttachment(code) &&
    huntersContract(s)?.side === "A"
  )
    if (!s.used.includes(huntersDiscountKey(host)))
      s.used.push(huntersDiscountKey(host));
}
export function ulfastPlayerTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.strength)
    return allHeroes(s).filter(
      (h) =>
        h.attachments.some((a) => a.code === "21001") &&
        !h.attachments.some((a) => a.code === P.strength),
    );
}
const sentryTargets = (s: GameState) =>
  [...s.staging, ...allEngaged(s), ...allActiveLocations(s)].filter(
    (u) =>
      ["enemy", "location"].includes(card(u.code).type_code) &&
      (s.victoryCards ?? []).some((c) => card(c).name === card(u.code).name) &&
      !playerEffectImmune(s, u, P.sentry) &&
      !batch4Scenario(s).cannotLeave?.(s, u, false),
  );
const knightTargets = (s: GameState) =>
  s.discard
    .map((code, index) => ({ code, index }))
    .filter(
      (c) =>
        card(c.code).type_code === "ally" &&
        (card(c.code).traits ?? "")
          .split(".")
          .some((t) => t.trim() === "Gondor") &&
        !dikeCannotLeaveDiscard(s),
    );
export function ulfastPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (u.blanked || isSacked(u)) return;
  if (u.code === P.sentry && played && fromHand && sentryTargets(s).length)
    prepend(
      s,
      fx("ulfastPlayerSentry", { source: u.id, player: activeSeat(s) }),
    );
  if (u.code === P.knight && knightTargets(s).length)
    prepend(
      s,
      fx("ulfastPlayerKnight", { source: u.id, player: activeSeat(s) }),
    );
}
export function ulfastPlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return attackers.flatMap((u) =>
    u.attachments
      .filter(
        (a) =>
          !a.blanked &&
          !a.facedown &&
          [P.bow, P.strength].includes(a.code as typeof P.bow),
      )
      .map((a) =>
        fx("ulfastPlayerAttackResponse", {
          target: u.id,
          source: a.id,
          code: a.code,
          text: enemy.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}
export function ulfastPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ulfastPlayer")) return false;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "ulfastPlayerSentry": {
      const source = get(s, e.source);
      if (!source || source.blanked || isSacked(source)) break;
      const targets = sentryTargets(s);
      if (targets.length)
        choosePlayerResponse(
          s,
          e.source!,
          P.sentry,
          "Woodland Sentry · After playing from hand",
          [
            ...targets.map((t) => ({
              id: t.id,
              code: t.code,
              label: `Discard ${name(t)}`,
              effects: [
                fx("ulfastPlayerSentryDiscard", { target: t.id, player }),
              ],
            })),
            skip,
          ],
        );
      break;
    }
    case "ulfastPlayerSentryDiscard":
      if (u && sentryTargets(s).some((t) => t.id === u.id))
        destroy(s, u, false);
      break;
    case "ulfastPlayerKnight": {
      const source = get(s, e.source);
      if (!source || source.blanked || isSacked(source)) break;
      const targets = knightTargets(s);
      if (targets.length)
        choosePlayerResponse(
          s,
          e.source!,
          P.knight,
          "Knight of Belfalas · Recover a Gondor ally",
          [
            ...targets.map((t) => ({
              id: String(t.index),
              code: t.code,
              label: card(t.code).name,
              effects: [
                fx("ulfastPlayerKnightTake", {
                  value: t.index,
                  code: t.code,
                  player,
                }),
              ],
            })),
            skip,
          ],
        );
      break;
    }
    case "ulfastPlayerKnightTake":
      if (
        e.value !== undefined &&
        s.discard[e.value] === e.code &&
        !dikeCannotLeaveDiscard(s)
      ) {
        const code = s.discard.splice(e.value, 1)[0];
        const returned = make(s, code);
        returned.owner = player;
        s.hand.push(returned);
      }
      break;
    case "ulfastPlayerAttackResponse": {
      const a = u?.attachments.find((a) => a.id === e.source),
        enemy = get(s, e.text);
      if (!u || !a || a.blanked || a.facedown || !enemy || isSacked(u)) break;
      if (a.code === P.bow) {
        if (!discardableHand(s).length || playerEffectImmune(s, enemy, P.bow))
          break;
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Keen Longbow · Discard up to three cards",
          [
            {
              id: "use",
              label: "Choose cards to discard",
              effects: [
                fx("ulfastPlayerBowChoose", {
                  target: enemy.id,
                  source: a.id,
                  ids: [],
                  player,
                }),
              ],
            },
            skip,
          ],
        );
      } else {
        const ring = shadowEastRing(s);
        if (
          !ring ||
          ring.host.id !== u.id ||
          ring.player !== player ||
          ring.attachment.exhausted ||
          ring.attachment.blanked ||
          playerEffectImmune(s, u, P.strength)
        )
          break;
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Strength and Courage · Double printed attack",
          [
            {
              id: "use",
              label: "Exhaust The One Ring and raise threat by 1",
              effects: [
                fx("ulfastPlayerStrengthPay", {
                  target: u.id,
                  text: enemy.id,
                  player,
                }),
              ],
            },
            skip,
          ],
        );
      }
      break;
    }
    case "ulfastPlayerBowChoose": {
      const selected = e.ids ?? [],
        remaining = discardableHand(s).filter((c) => !selected.includes(c.id));
      choose(s, "Keen Longbow · Choose up to three cards", [
        ...(selected.length < 3
          ? remaining.map((c) => ({
              id: c.id,
              code: c.code,
              label: `Discard ${name(c)}`,
              effects: [
                fx("ulfastPlayerBowChoose", { ...e, ids: [...selected, c.id] }),
              ],
            }))
          : []),
        {
          id: "done",
          label: `Discard ${selected.length} and deal ${selected.length} damage`,
          effects: [
            fx("ulfastPlayerBowPay", {
              target: e.target,
              source: e.source,
              ids: selected,
              player,
            }),
          ],
        },
      ]);
      break;
    }
    case "ulfastPlayerBowPay": {
      const ids = e.ids ?? [];
      requireRule(
        ids.length <= 3 &&
          new Set(ids).size === ids.length &&
          ids.every((id) => discardableHand(s).some((c) => c.id === id)),
        "Choose up to three different cards you can discard.",
      );
      const before = s.queue.length;
      for (const id of ids) discardHandCard(s, id);
      const costResponses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...costResponses,
        fx("damage", { target: e.target, value: ids.length, player }),
      );
      break;
    }
    case "ulfastPlayerStrengthPay": {
      const ring = shadowEastRing(s);
      requireRule(
        ring &&
          u &&
          ring.host.id === u.id &&
          ring.player === player &&
          !ring.attachment.exhausted &&
          !ring.attachment.blanked,
        "Exhaust your ready One Ring.",
      );
      ring.attachment.exhausted = true;
      const before = s.queue.length;
      raiseThreat(s, 1, "cost");
      const costResponses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...costResponses,
        fx("ulfastPlayerStrengthGain", {
          target: e.target,
          text: e.text,
          value: card(u.code).attack ?? 0,
          player,
        }),
      );
      break;
    }
    case "ulfastPlayerStrengthGain":
      if (u)
        state(s).attackBonuses.push({
          hero: u.id,
          enemy: e.text!,
          value: e.value ?? 0,
        });
      break;
    case "ulfastPlayerAttackCleanup":
      if (s.ulfastPlayers)
        s.ulfastPlayers.attackBonuses = s.ulfastPlayers.attackBonuses.filter(
          (b) => !(e.ids ?? []).includes(b.hero) || b.enemy !== e.target,
        );
      break;
    default:
      return false;
  }
  return true;
}
