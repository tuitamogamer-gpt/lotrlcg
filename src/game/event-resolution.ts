import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { resolvePlayerAbility } from "./player-ability-triggers";
import type { GameState, Unit } from "./types";
import { activeSeat, forOwner } from "./table";
import { fx, prepend, putPlayerDeck } from "./core";
import { foundationsPlayerCardDiscarded } from "./foundations-player-cards";
import { addVictoryCard, takePlayerDiscard } from "./board";
import { ringMakerCharacterLeft } from "./ring-maker-player";

/** Events remain outside hand/discard while their entire ability resolves (RR p8). */
export function holdPlayedEvent(s: GameState, unit: Unit, bottom = false) {
  (s.resolvingEvents ??= []).push({
    unit,
    player: activeSeat(s),
    destination: bottom ? "bottom" : "discard",
  });
  prepend(s, fx("eventFinish", { target: unit.id, player: activeSeat(s) }));
}

export function finishPlayedEvent(s: GameState, id: string) {
  const pending = s.resolvingEvents?.find((event) => event.unit.id === id);
  if (!pending) return;
  s.resolvingEvents = s.resolvingEvents!.filter((event) => event !== pending);
  if (!s.resolvingEvents.length) delete s.resolvingEvents;
  // Events do not enter play: self-return and Record effects keep their printed
  // player's hand/deck destination. Discards always use the originating deck.
  const destinationPlayer = ["hand", "bottom"].includes(pending.destination)
    ? pending.player
    : (pending.unit.owner ?? pending.player);
  if (pending.destination !== "hand")
    ringMakerCharacterLeft(s, pending.unit.id);
  forOwner(s, destinationPlayer, () => {
    if (pending.destination === "removed") s.removed.push(pending.unit.code);
    else if (pending.destination === "victory")
      addVictoryCard(s, pending.unit.code);
    else if (pending.destination === "bottom") putPlayerDeck(s, pending.unit);
    else if (pending.destination === "hand") s.hand.push(pending.unit);
    else {
      s.discard.push(pending.unit.code);
      foundationsPlayerCardDiscarded(s, pending.unit);
    }
  });
}

/** Self-return applies to the resolving physical event, including pending saves. */
export function returnPlayedEventToHand(
  s: GameState,
  code: string,
  id?: string,
  legacyIndex?: number,
): boolean {
  const pending = [...(s.resolvingEvents ?? [])]
    .reverse()
    .find(
      (event) =>
        event.player === activeSeat(s) &&
        event.unit.code === code &&
        (id === undefined || event.unit.id === id),
    );
  if (pending) {
    pending.destination = "hand";
    return true;
  }
  if (
    id !== undefined ||
    dikeCannotLeaveDiscard(s) ||
    s.discard[legacyIndex ?? -1] !== code
  )
    return false;
  s.hand.push(takePlayerDiscard(s, legacyIndex!));
  return true;
}

export function putPlayedEventInVictory(s: GameState, code: string) {
  const pending = [...(s.resolvingEvents ?? [])]
    .reverse()
    .find(
      (event) => event.player === activeSeat(s) && event.unit.code === code,
    );
  if (pending) pending.destination = "victory";
  else if (!dikeCannotLeaveDiscard(s)) {
    const index = s.discard.lastIndexOf(code);
    if (index >= 0) {
      takePlayerDiscard(s, index);
      addVictoryCard(s, code);
    }
  }
}

/** A self-removing event changes the destination of its own physical copy. */
export function removePlayedEvent(s: GameState, code: string) {
  const pending = [...(s.resolvingEvents ?? [])]
    .reverse()
    .find(
      (event) => event.player === activeSeat(s) && event.unit.code === code,
    );
  if (pending) pending.destination = "removed";
  else if (!dikeCannotLeaveDiscard(s)) {
    const index = s.discard.lastIndexOf(code);
    if (index >= 0) takePlayerDiscard(s, index);
    s.removed.push(code);
  }
}

/** Nested event effects finish before the framework continuations they interrupted. */
export function resolveEventAbility(
  s: GameState,
  unit: Unit,
  ability: () => void,
  bottom = false,
) {
  resolvePlayerAbility(
    s,
    { player: activeSeat(s), source: unit.id, code: unit.code, type: "action" },
    () => {
      holdPlayedEvent(s, unit, bottom);
      const finish = s.queue.shift()!;
      ability();
      s.queue.push(finish);
    },
  );
}
