import { cannotReady } from "./core";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
// The Morgul Vale: continuous bonuses, optional quest readying, and paid Record replays.
import { card, name, plain } from "./cards";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  enqueue,
  fx,
  get,
  opts,
  prepend,
  requireRule,
  skip,
} from "./core";
import { discardAttachment, readyCharacter } from "./board";
import { hasResourceIcon, hasTrait } from "./expansion-passives";

import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  eventReplayPayments,
  needsTarget,
  playEventFromDiscardEffect,
  playTargets,
  replayEventProblem,
} from "./actions";

const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const activeAttachment = (a: Attachment) => !a.blanked && !a.facedown;
const live = (s: GameState, u: Unit) =>
  allCharacters(s).some((candidate) => candidate.id === u.id);

export const MORGUL_ATTACHMENT_ACTIONS = ["06142"];

/** Théoden affects printed Tactics heroes across the entire table, including himself. */
export function morgulPlayerStats(s: GameState, u: Unit) {
  const tacticsHero =
    card(u.code).type_code === "hero" && card(u.code).sphere_code === "tactics";
  return {
    will:
      tacticsHero && !immune(u)
        ? allCharacters(s).filter(
            (source) => source.code === "06134" && !source.blanked,
          ).length
        : 0,
    attack: !immune(u)
      ? u.attachments.filter((a) => a.code === "06137" && activeAttachment(a))
          .length
      : 0,
    defense: 0,
  };
}

/** Spear's staging value is +2 instead of +1; the first point is in ordinary stats. */
export const morgulPlayerAttackBonus = (s: GameState, u: Unit, enemy: Unit) =>
  !immune(u) && s.staging.some((candidate) => candidate.id === enemy.id)
    ? u.attachments.filter((a) => a.code === "06137" && activeAttachment(a))
        .length
    : 0;

/** Gained Lore icons can pay and host the Scroll, but do not earn its printed-icon discount. */
export function morgulPlayerCost(s: GameState, c: Card, cost: number) {
  return c.code === "06142"
    ? Math.max(
        0,
        cost -
          s.heroes.filter((h) => card(h.code).sphere_code === "lore").length,
      )
    : cost;
}

export function morgulPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "06137")
    return allCharacters(s).filter((u) => hasTrait(u, "Rohan") && !immune(u));
  if (code === "06139")
    return allHeroes(s).filter(
      (u) => (hasTrait(u, "Gondor") || hasTrait(u, "Rohan")) && !immune(u),
    );
  if (code === "06142")
    return allHeroes(s).filter((u) => hasResourceIcon(u, "lore") && !immune(u));
  return code === "06140"
    ? allHeroes(s).filter(
        (hero) =>
          hasResourceIcon(hero, "spirit") &&
          hero.resources > 0 &&
          !immune(hero),
      )
    : null;
}

export function morgulPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "06140" && !morgulPlayerPlayTargets(s, code)?.length)
    return "Lay of Nimrodel needs a Spirit hero with resources.";
  if (
    ["06137", "06139", "06142"].includes(code) &&
    !morgulPlayerPlayTargets(s, code)?.length
  )
    return "This attachment has no eligible character.";
  return null;
}

/** FAQ 1.55: calculate the lasting bonus once, after the event's payment. */
export function morgulPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (code !== "06140") return false;
  // Target eligibility was checked before costs were paid. Spending the hero's
  // last resource can reduce the resulting bonus to zero without undoing play.
  const hero = allHeroes(s).find(
    (u) => u.id === target && hasResourceIcon(u, "spirit") && !immune(u),
  );
  requireRule(hero, "Choose a Spirit hero.");
  hero.tempWill = (hero.tempWill ?? 0) + hero.resources;
  return true;
}

function steed(s: GameState, u: Unit, id?: string) {
  return u.attachments.find(
    (a) =>
      a.id === id &&
      a.code === "06139" &&
      activeAttachment(a) &&
      attachmentController(s, u, a) === activeSeat(s),
  );
}
function canSteedReady(s: GameState, u: Unit, id?: string) {
  return (
    live(s, u) &&
    !!steed(s, u, id) &&
    !immune(u) &&
    u.exhausted &&
    u.resources >= 1 &&
    heirsCanSpendResources(s, u) &&
    !cannotReady(u)
  );
}

/** Every actual commitment grants one optional response per physical attached Steed. */
export function morgulPlayerCharactersCommitted(s: GameState, actual: Unit[]) {
  for (const u of actual.filter(
    (candidate) => candidate.committed && live(s, candidate),
  ))
    for (const a of u.attachments.filter(
      (attachment) =>
        attachment.code === "06139" && activeAttachment(attachment),
    ))
      enqueue(
        s,
        fx("morgulSteedResponse", {
          source: u.id,
          text: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
}

function scroll(s: GameState, u: Unit, id?: string) {
  return u.attachments.find(
    (a) =>
      a.id === id &&
      a.code === "06142" &&
      activeAttachment(a) &&
      attachmentController(s, u, a) === activeSeat(s),
  );
}
function loreEvents(s: GameState) {
  return s.discard
    .map((code, index) => ({
      index,
      unit: { ...s.heroes[0], id: `morgul-discard-${index}`, code } as Unit,
    }))
    .filter(
      ({ unit }) =>
        card(unit.code).sphere_code === "lore" &&
        card(unit.code).type_code === "event" &&
        !replayEventProblem(s, unit),
    );
}
const discardEvent = (s: GameState, e: Effect) =>
  loreEvents(s).find(
    ({ index, unit }) => index === e.value && unit.code === e.code,
  );

export const morgulPlayerAbilityLabel = (code: string) =>
  code === "06142" ? "Discard Scroll · play a Lore event" : undefined;

export function morgulPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (!u.attachments.some((a) => a.id === attachmentId && a.code === "06142"))
    return undefined;
  if (!scroll(s, u, attachmentId))
    return "The Scroll must be faceup, unblanked and controlled by you.";
  if (!loreEvents(s).length)
    return "Your discard pile needs a Lore event that can be played and paid for now.";
  return undefined;
}

export function useMorgulPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!u.attachments.some((a) => a.id === attachmentId && a.code === "06142"))
    return false;
  requireRule(
    !morgulPlayerAbilityProblem(s, u, attachmentId),
    morgulPlayerAbilityProblem(s, u, attachmentId) ?? "",
  );
  choose(
    s,
    "Scroll of Isildur · Lore event",
    [
      ...loreEvents(s).map(({ index, unit }) => ({
        id: `discard-${index}`,
        label: card(unit.code).name,
        code: unit.code,
        effects: [
          fx("morgulScrollAmount", {
            source: u.id,
            text: attachmentId,
            code: unit.code,
            value: index,
          }),
        ],
      })),
      skip,
    ],
    "Choose the event, its targets and complete payment. Discard this Scroll as the cost; the selected physical event finishes on the bottom of your deck.",
  );
  return true;
}

export function handleMorgulPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "morgulSteedResponse": {
      const hero = get(s, e.source);
      if (!hero || !canSteedReady(s, hero, e.text)) return true;
      choose(s, "Steed of the Mark · Committed hero", [
        {
          id: "ready",
          code: "06139",
          label: `Spend 1 resource from ${name(hero)} to ready that hero`,
          effects: [{ ...e, kind: "morgulSteedReady" }],
        },
        skip,
      ]);
      return true;
    }
    case "morgulSteedReady": {
      const hero = get(s, e.source);
      requireRule(
        hero && canSteedReady(s, hero, e.text),
        "This Steed needs its exhausted hero and one resource from that hero's own pool.",
      );
      spendResources(s, hero, 1);
      readyCharacter(s, hero);
      return true;
    }
    case "morgulScrollAmount": {
      const host = get(s, e.source),
        entry = discardEvent(s, e);
      requireRule(
        host && scroll(s, host, e.text) && entry,
        "The Scroll and selected playable Lore event must remain available.",
      );
      if (entry.unit.code === "01067") {
        const maximum = Math.max(
          0,
          ...playerOrder(s).map((p) => seatView(s, p).deck.length),
        );
        choose(
          s,
          "Scroll of Isildur · Choose X",
          Array.from({ length: maximum }, (_, i) => i + 1)
            .filter(
              (amount) => !replayEventProblem(s, entry.unit, undefined, amount),
            )
            .map((amount) => ({
              id: `x-${amount}`,
              label: `X = ${amount} · inspect ${amount} cards`,
              effects: [{ ...e, kind: "morgulScrollTarget", count: amount }],
            })),
        );
      } else prepend(s, { ...e, kind: "morgulScrollTarget" });
      return true;
    }
    case "morgulScrollTarget": {
      const host = get(s, e.source),
        entry = discardEvent(s, e);
      requireRule(
        host && scroll(s, host, e.text) && entry,
        "The Scroll and selected playable Lore event must remain available.",
      );
      if (needsTarget(entry.unit))
        choose(
          s,
          "Scroll of Isildur · Event target",
          opts(
            playTargets(s, entry.unit).filter(
              (target) =>
                !replayEventProblem(s, entry.unit, target.id, e.count),
            ),
            (target) => [
              { ...e, kind: "morgulScrollPayment", target: target.id },
            ],
          ),
        );
      else prepend(s, { ...e, kind: "morgulScrollPayment" });
      return true;
    }
    case "morgulScrollPayment": {
      const host = get(s, e.source),
        entry = discardEvent(s, e);
      requireRule(
        host &&
          scroll(s, host, e.text) &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target, e.count),
        "Choose a legal Lore event, amount and target.",
      );
      choose(
        s,
        "Scroll of Isildur · Pay event cost",
        eventReplayPayments(s, entry.unit, e.target, e.count).map(
          (payment, index) => ({
            id: `pay-${index}`,
            label:
              Object.entries(payment)
                .map(([id, amount]) => `${amount} from ${name(get(s, id)!)}`)
                .join(" + ") || "Play at cost 0",
            effects: [
              {
                ...e,
                kind: "morgulScrollPlay",
                ids: Object.entries(payment).map(
                  ([id, amount]) => `${id}=${amount}`,
                ),
              },
            ],
          }),
        ),
      );
      return true;
    }
    case "morgulScrollPlay": {
      const host = get(s, e.source),
        attachment = host && scroll(s, host, e.text),
        entry = discardEvent(s, e);
      requireRule(
        host &&
          attachment &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target, e.count),
        "The Scroll, event, amount and target must still be legal.",
      );
      const payment = Object.fromEntries(
        (e.ids ?? []).map((value) => {
          const split = value.lastIndexOf("=");
          return [value.slice(0, split), Number(value.slice(split + 1))];
        }),
      );
      requireRule(
        eventReplayPayments(s, entry.unit, e.target, e.count).some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(payment),
        ),
        "Choose the event's complete legal resource payment.",
      );
      discardAttachment(s, host, attachment);
      playEventFromDiscardEffect(s, entry.index, {
        target: e.target,
        payment,
        amount: e.count,
        bottom: true,
      });
      return true;
    }
    default:
      return false;
  }
}
