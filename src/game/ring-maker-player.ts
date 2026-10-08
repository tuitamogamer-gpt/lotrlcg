import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { cannotReady } from "./core";
import { movableHand } from "./hand-rules";
// Remaining player cards from The Three Trials and Trouble in Tharbad.
import { card, plain, SCRIPTED } from "./cards";
import { finalRingEventPlayed } from "./ring-maker-final-player";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
  characters,
  choose,
  fx,
  get,
  globalUnits,
  make,
  opts,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  skip,
  units,
  locationQuest,
} from "./core";
import {
  allyCanEnter,
  enterAlly,
  progressLocation,
  returnAlly,
  resolveAllyKeywords,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allHeroes,
  eachSeat,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { effectiveKeyword } from "./expansion-passives";
import { engagedEnemies } from "./considered-engagement";
import { returnPlayedEventToHand } from "./event-resolution";

import { morgulCannotLeave } from "./morgul-vale";

type DelayedReturn = {
  id: string;
  code: string;
  player: number;
  owner: number;
  kind: "message" | "eagle";
};
export interface RingMakerState {
  returns: DelayedReturn[];
}
const state = (s: GameState) => (s.ringMaker ??= { returns: [] });
const firstLocation = "round:ring-first-location";
const eventKey = (code: string) => `round:ring-event:${code}`;
const sphereKey = (sphere: string) => `round:ring-sphere:${sphere}`;
const immune = (u: Unit) => playerCardImmune(u);
const canReady = (s: GameState, u: Unit) =>
  u.exhausted && !immune(u) && !cannotReady(u, s);
const affectedEnemies = (s: GameState) =>
  [
    ...new Map(
      playerOrder(s)
        .flatMap((p) => engagedEnemies(s, p))
        .map((u) => [u.id, u]),
    ).values(),
  ].filter((u) => !immune(u));

export function ringMakerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "08033")
    return s.staging.filter(
      (u) => card(u.code).type_code === "enemy" && !immune(u),
    );
  if (code === "08061") return allHeroes(s).filter((u) => !immune(u));
  return null;
}
export function ringMakerPlayProblem(
  s: GameState,
  code: string,
  source: string,
) {
  if (
    code === "08032" &&
    (playerOrder(s).length < 2 ||
      !playerOrder(s).some((p) =>
        seatView(s, p).hand.some((u) => u.id !== source),
      ))
  )
    return "Message from Elrond needs another player and a card to pass.";
  return null;
}
/** Every play consumes the first matching event, including canceled and free plays. */
export function ringMakerEventPlayed(s: GameState, code: string) {
  finalRingEventPlayed(s, code);
  s.used.push(sphereKey(card(code).sphere_code));
  if (["08033", "08061"].includes(code)) s.used.push(eventKey(code));
}
export function ringMakerSecrecy(s: GameState, c: Card) {
  if (
    c.type_code !== "event" ||
    s.threat > 20 ||
    s.used.includes(sphereKey(c.sphere_code))
  )
    return 0;
  return s.heroes
    .filter((h) => card(h.code).sphere_code === c.sphere_code)
    .flatMap((h) =>
      h.attachments.filter(
        (a) => a.code === "08034" && !a.blanked && !a.facedown,
      ),
    ).length;
}
export function ringMakerEvent(s: GameState, code: string, target?: string) {
  if (code === "08032") {
    choose(
      s,
      "Message from Elrond · Choose the sending player",
      playerOrder(s).map((p) => ({
        id: `player-${p}`,
        label: `Player ${p + 1}`,
        effects: [fx("ringMessageCard", { player: p })],
      })),
    );
    return true;
  }
  if (!["08033", "08061"].includes(code)) return false;
  const u = ringMakerPlayTargets(s, code)?.find((u) => u.id === target);
  if (!u) return true;
  if (code === "08033") {
    // Store on the target, so a controller's elimination cannot end this lasting effect.
    u.noEngagementRound = s.round;
  } else u.tempWill = (u.tempWill ?? 0) + 2;
  if (
    s.threat <= 20 &&
    s.used.filter((key) => key === eventKey(code)).length === 1
  )
    returnPlayedEventToHand(s, code);
  return true;
}

export function ringMakerLocationExplored(s: GameState) {
  prepend(
    s,
    ...allHeroes(s)
      .filter((h) => h.code === "08025" && !h.blanked && canReady(s, h))
      .map((h) =>
        fx("ringIdraenOffer", { target: h.id, player: ownerOf(s, h) }),
      ),
  );
}
/** Designer ruling 3.188: this passive precedes staging, When Revealed and keywords. */
export function ringMakerLocationRevealed(
  s: GameState,
  code: string,
  intercepted = false,
) {
  if (card(code).type_code !== "location")
    return { progress: 0, explored: false };
  const first = !s.used.includes(firstLocation);
  eachSeat(s, () => {
    if (!s.used.includes(firstLocation)) s.used.push(firstLocation);
  });
  if (!first || intercepted) return { progress: 0, explored: false };
  const value = allHeroes(s)
    .filter((h) => h.committed)
    .flatMap((h) =>
      h.attachments.filter(
        (a) => a.code === "08031" && !a.blanked && !a.facedown,
      ),
    ).length;
  if (!value) return { progress: 0, explored: false };
  const location = make(s, code);
  if (immune(location)) return { progress: 0, explored: false };
  progressLocation(s, location, value);
  return {
    progress: location.progress,
    explored: location.progress >= locationQuest(s, location),
  };
}

export function offerRingMakerDoomed(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (
    !played ||
    !fromHand ||
    u.blanked ||
    !["08030", "08057", "08091", "08115"].includes(u.code)
  )
    return false;
  prepend(s, fx("ringDoomedOffer", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export function ringMakerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (u.blanked) return;
  const controller = ownerOf(s, u);
  if (u.code === "08028" && played && fromHand && affectedEnemies(s).length)
    prepend(s, fx("ringRumilOffer", { source: u.id, player: controller }));
  if (u.code === "08059" && eagleDiscards(s).length)
    prepend(s, fx("ringGwaihirOffer", { source: u.id, player: controller }));
  const marker = `round:ring-doomed:${u.id}`;
  if (s.used.includes(marker)) {
    s.used = s.used.filter((key) => key !== marker);
    prepend(
      s,
      fx(
        u.code === "08030"
          ? "ringWandererOffer"
          : u.code === "08057"
            ? "ringHeraldOffer"
            : u.code === "08091"
              ? "finalRingPioneerOffer"
              : "finalRingGuardOffer",
        {
          source: u.id,
          player: controller,
        },
      ),
    );
  }
}
function eagleDiscards(s: GameState) {
  return s.discard.flatMap((code, index) =>
    card(code).type_code === "ally" &&
    card(code)
      .traits?.split(".")
      .some((t) => t.trim() === "Eagle") &&
    allyCanEnter(s, code)
      ? [{ code, index }]
      : [],
  );
}
function cheapAllies(s: GameState) {
  return s.hand.filter(
    (u) =>
      card(u.code).type_code === "ally" &&
      Number(card(u.code).cost) <= 2 &&
      allyCanEnter(s, u.code),
  );
}
export function ringMakerThreatRaised(
  s: GameState,
  amount: number,
  reason: string,
) {
  if (
    !["encounter", "quest-card"].includes(reason) ||
    !s.hand.some((u) => u.code === "08062") ||
    !canPay(s, card("08062"))
  )
    return;
  prepend(s, fx("ringFreeOffer", { value: amount, player: activeSeat(s) }));
}
export function ringMakerCharacterLeft(s: GameState, id: string) {
  if (s.ringMaker)
    s.ringMaker.returns = s.ringMaker.returns.filter((r) => r.id !== id);
}
export function ringMakerRoundEnd(s: GameState): Effect[] {
  const returns = s.ringMaker?.returns ?? [];
  if (s.ringMaker) s.ringMaker.returns = [];
  return returns.map((r) =>
    fx("ringDelayedReturn", {
      target: r.id,
      code: r.code,
      player: r.player,
      owner: r.owner,
      text: r.kind,
    }),
  );
}

export function ringMakerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "ringIdraenOffer": {
      const h = get(s, e.target);
      if (h && !h.blanked && canReady(s, h))
        choose(s, "Idraen · Location explored", [
          {
            id: "ready",
            label: "Ready Idraen",
            effects: [fx("ready", { target: h.id })],
          },
          skip,
        ]);
      return true;
    }
    case "ringDoomedOffer": {
      const u = get(s, e.target);
      if (!u) return true;
      const amount = ["08091", "08115"].includes(u.code) ? 1 : 2;
      choose(s, `${card(u.code).name} · Optional Doomed ${amount}`, [
        {
          id: "doomed",
          label: `Give Doomed ${amount} and gain the response`,
          effects: [{ ...e, kind: "ringDoomedResolve", flag: true }],
        },
        {
          id: "skip",
          label: `Play without Doomed ${amount}`,
          effects: [{ ...e, kind: "ringDoomedResolve", flag: false }],
        },
      ]);
      return true;
    }
    case "ringDoomedResolve": {
      const u = get(s, e.target);
      if (!u) return true;
      if (e.flag) s.used.push(`round:ring-doomed:${u.id}`);
      resolveAllyKeywords(
        s,
        u,
        true,
        true,
        e.flag ? (["08091", "08115"].includes(u.code) ? 1 : 2) : 0,
      );
      return true;
    }
    case "ringWandererOffer":
      choose(s, "Greyflood Wanderer · Place progress", [
        {
          id: "progress",
          label: "Place 1 progress on each location in play",
          effects: [{ ...e, kind: "ringWandererProgress" }],
        },
        skip,
      ]);
      return true;
    case "ringWandererProgress":
      prepend(
        s,
        ...units(s)
          .filter((u) => card(u.code).type_code === "location" && !immune(u))
          .map((u) => fx("locationProgress", { target: u.id, value: 1 })),
      );
      return true;
    case "ringHeraldOffer":
      choose(s, "Herald of Anórien · Choose a player", [
        ...playerOrder(s).map((p) => ({
          id: `player-${p}`,
          label: `Player ${p + 1}`,
          effects: [fx("ringHeraldAlly", { player: p })],
        })),
        skip,
      ]);
      return true;
    case "ringHeraldAlly":
      choose(s, "Herald of Anórien · Put an ally into play", [
        ...opts(cheapAllies(s), (u) => [
          fx("ringHeraldEnter", { target: u.id }),
        ]),
        skip,
      ]);
      return true;
    case "ringHeraldEnter": {
      const u = cheapAllies(s).find((u) => u.id === e.target);
      requireRule(u, "Choose an eligible ally with printed cost 2 or less.");
      s.hand = s.hand.filter((h) => h.id !== u.id);
      enterAlly(s, u, false, false, true);
      return true;
    }
    case "ringRumilOffer": {
      const rumil = get(s, e.source);
      const value = characters(s).filter((u) =>
        effectiveKeyword(u, "Ranged"),
      ).length;
      if (!rumil || rumil.blanked || !value || !affectedEnemies(s).length)
        return true;
      choose(s, "Rúmil · Damage an engaged enemy", [
        ...opts(affectedEnemies(s), (u) => [
          fx("damage", { target: u.id, value, text: "player" }),
        ]),
        skip,
      ]);
      return true;
    }
    case "ringGwaihirOffer": {
      const u = get(s, e.source);
      if (!u || u.blanked || !eagleDiscards(s).length) return true;
      choose(s, "Gwaihir · Return an Eagle from discard", [
        ...eagleDiscards(s).map(({ code, index }) => ({
          id: `discard-${index}`,
          code,
          label: card(code).name,
          effects: [fx("ringGwaihirEnter", { code, value: index })],
        })),
        skip,
      ]);
      return true;
    }
    case "ringGwaihirEnter": {
      requireRule(
        eagleDiscards(s).some((u) => u.code === e.code && u.index === e.value),
        "Choose the physical Eagle in your discard pile.",
      );
      const u = takePlayerDiscard(s, e.value!);
      state(s).returns.push({
        id: u.id,
        code: u.code,
        player: activeSeat(s),
        owner: u.owner ?? activeSeat(s),
        kind: "eagle",
      });
      enterAlly(s, u);
      return true;
    }
    case "ringMessageCard":
      choose(s, "Message from Elrond · Choose a card to pass", [
        ...opts(movableHand(s), (u) => [
          fx("ringMessageRecipient", { target: u.id }),
        ]),
        skip,
      ]);
      return true;
    case "ringMessageRecipient":
      choose(
        s,
        "Message from Elrond · Choose the recipient",
        playerOrder(s)
          .filter((p) => p !== activeSeat(s))
          .map((p) => ({
            id: `player-${p}`,
            label: `Player ${p + 1}`,
            effects: [{ ...e, kind: "ringMessagePass", value: p }],
          })),
      );
      return true;
    case "ringMessagePass": {
      const u = s.hand.find((u) => u.id === e.target);
      requireRule(
        u &&
          movableHand(s).includes(u) &&
          e.value !== activeSeat(s) &&
          playerOrder(s).includes(e.value!),
        "Choose a card in your hand and another player.",
      );
      const owner = u.owner ?? activeSeat(s);
      s.hand = s.hand.filter((h) => h.id !== u.id);
      u.owner = owner;
      seatView(s, e.value!).hand.push(u);
      state(s).returns.push({
        id: u.id,
        code: u.code,
        player: e.value!,
        owner,
        kind: "message",
      });
      return true;
    }
    case "ringDelayedReturn": {
      const inPlay = globalUnits(s).find((u) => u.id === e.target);
      if (inPlay) {
        if (!immune(inPlay) && !morgulCannotLeave(s, inPlay)) {
          if (card(inPlay.code).type_code === "ally")
            returnAlly(s, inPlay, e.text === "message");
          else if (
            e.text === "message" &&
            card(inPlay.code).type_code === "attachment"
          ) {
            forOwner(s, ownerOf(s, inPlay), () => {
              s.staging = s.staging.filter((u) => u.id !== inPlay.id);
            });
            forOwner(s, e.owner!, () => {
              putPlayerDeck(s, inPlay);
              shuffle(s, s.deck);
            });
          }
        }
        return true;
      }
      if (e.text !== "message") return true;
      const hand = seatView(s, e.player!).hand;
      const i = hand.findIndex((u) => u.id === e.target);
      let physical: Unit | undefined;
      if (i >= 0) physical = hand.splice(i, 1)[0];
      else {
        for (const host of globalUnits(s)) {
          const a = host.attachments.find((a) => a.id === e.target);
          if (
            !a ||
            a.facedown ||
            a.namelessCard ||
            /Permanent/i.test(plain(card(a.code).text))
          )
            continue;
          host.attachments = host.attachments.filter(
            (other) => other.id !== a.id,
          );
          physical = { ...make(s, a.code), id: a.id, owner: e.owner };
          break;
        }
        if (!physical)
          for (const attachments of Object.values(s.questAttachments ?? {})) {
            const i = attachments.findIndex((a) => a.id === e.target);
            if (i < 0) continue;
            const a = attachments.splice(i, 1)[0];
            physical = { ...make(s, a.code), id: a.id, owner: e.owner };
            break;
          }
      }
      if (physical)
        forOwner(s, e.owner!, () => {
          putPlayerDeck(s, physical!);
          shuffle(s, s.deck);
        });
      return true;
    }
    case "ringFreeOffer": {
      if (!canPay(s, card("08062"))) return true;
      const copies = s.hand.filter((u) => u.code === "08062");
      if (!copies.length) return true;
      choose(s, "Free to Choose · Respond to raised threat", [
        ...copies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Play Free to Choose · reduce threat by ${e.value}`,
          effects: [
            fx("eventPlay", {
              code: u.code,
              source: u.id,
              effects: [{ ...e, kind: "ringFreeReduce" }, e],
              cancelledEffects: [e],
            }),
          ],
        })),
        skip,
      ]);
      return true;
    }
    case "ringFreeReduce":
      reduceThreat(s, e.value ?? 0, "08060");
      return true;
    default:
      return false;
  }
}

export function validateRingMaker(s: GameState, seatCount: number) {
  const r = s.ringMaker;
  return (
    r === undefined ||
    (!!r &&
      Array.isArray(r.returns) &&
      r.returns.length <= 100 &&
      r.returns.every(
        (v) =>
          v &&
          typeof v.id === "string" &&
          v.id.length > 0 &&
          SCRIPTED.has(v.code) &&
          [v.player, v.owner].every(
            (p) => Number.isInteger(p) && p >= 0 && p < seatCount,
          ) &&
          ["message", "eagle"].includes(v.kind),
      ))
  );
}
