// Complete original Hills of Emyn Muil scenario. Nightmare remains separate.
import encounters from "../data/emyn-muil-encounter-cards.json";
import quests from "../data/emyn-muil-quest-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  shuffle,
} from "./core";
import {
  discardHandCard,
  discardPlayerDeck,
  placeEncounter,
  win,
} from "./board";
import {
  allCharacters,
  allActiveLocations,
  eachSeat,
  livingSeats,
  removeActiveLocation,
  ownerOf,
  seatView,
  selectSeat,
} from "./table";

export const EMYN_MUIL_ENCOUNTERS = encounters as Card[];
export const EMYN_MUIL_QUESTS = quests as Card[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801204c${suffix}`;
export const EMYN = {
  amonHen: code("9001"),
  amonLhaw: code("9002"),
  chasm: code("9007"),
  horseThieves: code("9010"),
  falls: code("9011"),
  rockslide: code("9014"),
  footing: code("9015"),
  eastWall: code("9017"),
  highlands: code("9018"),
  quest: code("9019"),
  northStair: code("9021"),
  outerRidge: code("9022"),
  shores: code("9024"),
} as const;
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );

export function setupEmynMuil(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => c !== EMYN.amonHen && c !== EMYN.amonLhaw,
  );
  placeEncounter(s, EMYN.amonHen, true);
  placeEncounter(s, EMYN.amonLhaw, true);
  shuffle(s, s.encounterDeck);
  s.emynMuilTreacherySeen = false;
  log(
    s,
    "Amon Hen and Amon Lhaw enter staging. Explore the hills to collect victory points.",
    "chapter",
  );
}

/** The sole stage needs one progress, twenty victory points and no Emyn Muil locations. */
export function advanceEmynMuil(s: GameState) {
  if (s.scenarioId !== "hills-of-emyn-muil") return false;
  if (
    s.status === "playing" &&
    s.phase !== "setup" &&
    s.progress >= 1 &&
    s.victory >= 20 &&
    !s.queue.length &&
    !s.choice &&
    !s.stageRevealing &&
    !locations(s).some((u) => card(u.code).traits?.includes("Emyn Muil"))
  )
    win(s);
  return true;
}

export const emynMuilStatBonus = (s: GameState, u: Unit) =>
  u.code === EMYN.horseThieves
    ? s.staging.filter((x) => card(x.code).type_code === "location").length
    : 0;
export function emynMuilThreatBonus(s: GameState, u: Unit) {
  const printedX = ([EMYN.amonHen, EMYN.amonLhaw] as string[]).includes(u.code)
    ? 2 * livingSeats(s).length
    : 0;
  return (
    printedX +
    (s.staging.some((x) => x.id === u.id) &&
    card(u.code).type_code === "location"
      ? allActiveLocations(s).filter((u) => u.code === EMYN.outerRidge).length
      : 0)
  );
}
export const emynMuilPlayCost = (s: GameState, c: Card) =>
  ["ally", "hero"].includes(c.type_code) && !c.traits?.includes("Rohan")
    ? 2 * allActiveLocations(s).filter((u) => u.code === EMYN.eastWall).length
    : 0;
export const emynMuilEventsBlocked = (s: GameState) =>
  allActiveLocations(s).some((u) => u.code === EMYN.amonHen);
export const emynMuilAttachmentsBlanked = (s: GameState) =>
  allActiveLocations(s).some((u) => u.code === EMYN.amonLhaw);
export const emynMuilMustCommit = (s: GameState) =>
  allActiveLocations(s).some((u) => u.code === EMYN.falls);
export function emynMuilQuestStart(s: GameState) {
  s.emynMuilTreacherySeen = false;
}

/** Surge belongs to the first treachery revealed, even if its when-revealed is canceled. */
export function emynMuilRevealSurge(s: GameState, encounterCode: string) {
  if (
    s.scenarioId !== "hills-of-emyn-muil" ||
    !["quest", "staging"].includes(s.phase) ||
    card(encounterCode).type_code !== "treachery" ||
    s.emynMuilTreacherySeen
  )
    return false;
  s.emynMuilTreacherySeen = true;
  return !s.staging.some((u) => card(u.code).type_code === "location");
}

/** Return true when the scenario queues the entire travel-cost sequence. */
export function emynMuilTravelCost(s: GameState, location: Unit) {
  const first = s.table?.first ?? 0;
  if (location.code === EMYN.highlands) {
    requireRule(
      s.encounterDeck.length > 0,
      "The Highlands requires an encounter card to reveal as its travel cost.",
    );
    enqueue(
      s,
      fx("reveal", { player: first }),
      fx("travelEnter", { target: location.id, player: first }),
    );
    return true;
  }
  if (location.code === EMYN.shores) {
    requireRule(
      seatView(s, first).hand.some((u) => card(u.code).type_code === "event"),
      "The first player must discard an event to travel to The Shores of Nen Hithoel.",
    );
    enqueue(s, fx("emynPayShores", { target: location.id, player: first }));
    return true;
  }
  return false;
}
export function emynMuilTravel(s: GameState, location: Unit) {
  if (location.code === EMYN.northStair)
    prepend(s, fx("emynNorthStair", { player: s.table?.first ?? 0 }));
}

/** Handled treacheries are discarded after their effects are queued. */
export function emynMuilEncounter(s: GameState, encounterCode: string) {
  switch (encounterCode) {
    case EMYN.chasm: {
      const active = allActiveLocations(s);
      if (active.length > 1) {
        selectSeat(s, s.table?.first ?? 0);
        choose(
          s,
          "Impassable Chasm · Choose the active location",
          opts(active, (u) => [fx("emynReturnActive", { target: u.id })]),
          "The first player chooses the single active location returned to staging.",
        );
      } else if (active.length) {
        prepend(s, fx("emynReturnActive", { target: active[0].id }));
      } else prepend(s, fx("reveal", { player: s.table?.first ?? 0 }));
      break;
    }
    case EMYN.rockslide:
      prepend(
        s,
        ...allCharacters(s)
          .filter((u) => u.committed)
          .map((u) =>
            fx("damage", { target: u.id, value: 2, player: ownerOf(s, u) }),
          ),
      );
      break;
    case EMYN.footing: {
      let removed = 0;
      for (const location of locations(s))
        if (location.progress > 0) {
          location.progress--;
          removed++;
        }
      if (removed) prepend(s, fx("emynFootingDiscard", { value: removed }));
      log(
        s,
        `Slick Footing removes ${removed} location progress token${removed === 1 ? "" : "s"}.`,
        "danger",
      );
      break;
    }
    default:
      return false;
  }
  s.encounterDiscard.push(encounterCode);
  return true;
}

export function emynMuilShadow(s: GameState, shadowCode: string) {
  if (!s.combat) return false;
  if (
    ([EMYN.falls, EMYN.outerRidge, EMYN.shores] as string[]).includes(
      shadowCode,
    )
  ) {
    s.combat.returnToStaging = true;
    return true;
  }
  if (shadowCode === EMYN.rockslide) {
    s.combat.defenderId = null;
    delete s.combat.defenderIds;
    log(
      s,
      "Rockslide removes the defender from combat. The attack becomes undefended.",
      "danger",
    );
    return true;
  }
  return false;
}

export function emynMuilEffect(s: GameState, effect: Effect) {
  switch (effect.kind) {
    case "emynReturnActive": {
      const previous = get(s, effect.target);
      if (previous && allActiveLocations(s).some((u) => u.id === previous.id)) {
        previous.progress = 0;
        removeActiveLocation(s, previous.id);
        s.staging.push(previous);
        log(
          s,
          `Impassable Chasm returns ${name(previous)} to staging with no progress.`,
          "danger",
        );
      }
      break;
    }
    case "emynPayShores":
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "The Shores of Nen Hithoel · Travel cost",
        opts(
          s.hand.filter((u) => card(u.code).type_code === "event"),
          (u) => [
            fx("emynDiscardEvent", { source: u.id }),
            fx("travelEnter", { target: effect.target }),
          ],
          () => "Discard this event from the first player's hand",
        ),
      );
      break;
    case "emynDiscardEvent": {
      const event = s.hand.find((u) => u.id === effect.source);
      requireRule(
        event && card(event.code).type_code === "event",
        "The travel cost requires an event in the first player's hand.",
      );
      discardHandCard(s, event.id);
      log(
        s,
        `The first player discards ${name(event)} to pay the travel cost.`,
      );
      break;
    }
    case "emynNorthStair": {
      const previous = s.encounterDiscard.pop();
      if (previous) {
        log(
          s,
          `The North Stair returns ${card(previous).name} from the encounter discard.`,
          "danger",
        );
        // This moves a card, rather than revealing it: no Surge, Doomed, Thalin
        // or responses that require a card revealed from the encounter deck.
        placeEncounter(s, previous);
      }
      break;
    }
    case "emynFootingDiscard":
      eachSeat(s, (player) => {
        discardPlayerDeck(s, effect.value ?? 0, player);
      });
      break;
    default:
      return false;
  }
  return true;
}
