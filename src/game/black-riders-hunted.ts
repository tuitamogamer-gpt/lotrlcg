import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import { enemyAddedToStaging, engage, raiseThreat } from "./board";
import {
  activeSeat,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { oneRing, oneRingExhausted } from "./lotr-saga";
import { SP } from "./shadow-past-support";

/**
 * The Hunted and The Ring encounter sets of The Black Riders, shared by
 * A Shadow of the Past and A Knife in the Dark. Their effect kinds and combat
 * flags keep the names they were saved under when A Shadow of the Past
 * introduced them.
 */
export const HUNTED = {
  pathless: SP.pathless,
  cry: SP.cry,
  lure: SP.lure,
} as const;
const H = HUNTED;
export const HUNTED_TREACHERIES: readonly string[] = [H.cry, H.lure];
type Combat = NonNullable<GameState["combat"]>;

/** The scenarios whose encounter decks hold these sets. */
const live = (s: GameState) => !!(s.shadowPast || s.knifeDark);
const traitsOf = (code: string) =>
  (card(code).traits ?? "").split(".").map((t) => t.trim());
export const hasTrait = (code: string, trait: string) =>
  traitsOf(code).includes(trait);
/** A Nazgûl enemy card. */
export const isNazgulCard = (code: string) =>
  card(code).type_code === "enemy" && hasTrait(code, "Nazgûl");
export const isMorgul = (code: string) => hasTrait(code, "Morgul");
export const who = (s: GameState, p: number) =>
  s.table ? seatName(s, p) : "you";
export function nextPlayer(s: GameState, p: number) {
  const order = playerOrder(s);
  if (order.length < 2) return undefined;
  return order[(order.indexOf(p) + 1) % order.length];
}
/** Return an engaged enemy to the staging area; its shadow cards are discarded. */
export function returnToStaging(s: GameState, u: Unit) {
  if (!allEngaged(s).some((x) => x.id === u.id)) return false;
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  log(s, `${name(u)} returns to the staging area.`, "danger");
  return true;
}
/** Take a card out of the encounter deck, else the discard pile. */
export function searchEncounter(s: GameState, test: (code: string) => boolean) {
  const i = s.encounterDeck.findIndex(test);
  if (i >= 0) return s.encounterDeck.splice(i, 1)[0];
  for (let j = s.encounterDiscard.length - 1; j >= 0; j--)
    if (test(s.encounterDiscard[j])) return s.encounterDiscard.splice(j, 1)[0];
  return undefined;
}

/** When Revealed effects of Piercing Cry and Lure of the Ring. */
export function huntedTreachery(s: GameState, code: string, p: number) {
  if (!live(s)) return false;
  const first = firstPlayer(s);
  if (code === H.cry) {
    const found = [...s.encounterDeck, ...s.encounterDiscard].some((c) =>
      isNazgulCard(c),
    );
    if (!found) {
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Piercing Cry: no Nazgûl enemy is in the encounter deck or discard pile.",
      );
      return true;
    }
    choose(
      s,
      "Piercing Cry · Where does the Nazgûl enemy go?",
      [
        {
          id: "staging",
          label: "Add it to the staging area",
          effects: [fx("spCry", { flag: false, player: p })],
        },
        {
          id: "engaged",
          label: `Put it into play engaged with ${who(s, first)}`,
          effects: [fx("spCry", { flag: true, player: p })],
        },
      ],
      "Search the encounter deck and discard pile for a Nazgûl enemy, then shuffle the encounter deck.",
    );
    return true;
  }
  if (code === H.lure) {
    const ring = oneRing(s);
    if (!ring || ring.exhausted) {
      prepend(s, fx("spLureThreat", { player: first }));
      return true;
    }
    choose(s, "Lure of the Ring · The first player chooses", [
      {
        id: "exhaust",
        label: "Exhaust The One Ring",
        code: ring.code,
        effects: [fx("spLureExhaust", { player: first })],
      },
      {
        id: "threat",
        label: "Raise your threat by 3",
        effects: [fx("spLureThreat", { player: first })],
      },
    ]);
    return true;
  }
  return false;
}

/** Shadow effects of Pathless Country, Piercing Cry and Lure of the Ring. */
export function huntedShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !live(s)) return false;
  switch (code) {
    case H.pathless:
      c.spPathless = true;
      return true;
    case H.cry:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      return true;
    case H.lure:
      c.attackBonus += oneRingExhausted(s) ? 2 : 1;
      return true;
  }
  return false;
}

/** After an attack: "return the attacking enemy" and Pathless Country. */
export function huntedAttackFinished(
  s: GameState,
  combat: Combat,
  skipped = false,
): Effect[] {
  if (!live(s) || skipped) return [];
  const enemy = get(s, combat.enemyId);
  if (!enemy) return [];
  const p = combat.attackPlayer ?? firstPlayer(s);
  const effects: Effect[] = [];
  if (combat.spReturn)
    effects.push(fx("spReturn", { target: enemy.id, player: p }));
  const next = nextPlayer(s, p);
  if (combat.spPathless && next !== undefined)
    effects.push(fx("spPathlessEngage", { target: enemy.id, player: next }));
  return effects;
}

/** Pathless Country gets +4 quest points while in the staging area. */
export const pathlessQuestBonus = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === H.pathless &&
  !u.blanked &&
  s.staging.some((x) => x.id === u.id)
    ? 4
    : 0;

export function huntedEffect(s: GameState, e: Effect): boolean {
  if (!live(s)) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "spReturn":
      if (u) returnToStaging(s, u);
      return true;
    case "spCry": {
      const code = searchEncounter(s, (c) => isNazgulCard(c));
      shuffle(s, s.encounterDeck);
      if (!code) return true;
      const rider = make(s, code);
      s.staging.push(rider);
      if (e.flag) forOwner(s, first, () => engage(s, rider));
      if (allEngaged(s).some((x) => x.id === rider.id))
        log(
          s,
          `Piercing Cry: ${card(code).name} enters play engaged with ${who(s, first)}.`,
          "danger",
        );
      else {
        enemyAddedToStaging(s, rider);
        log(
          s,
          `Piercing Cry: ${card(code).name} is added to the staging area.`,
          "danger",
        );
      }
      return true;
    }
    case "spLureExhaust": {
      const ring = oneRing(s);
      if (ring && !ring.exhausted) {
        ring.exhausted = true;
        log(s, "Lure of the Ring: The One Ring is exhausted.", "danger");
      } else prepend(s, fx("spLureThreat", { player: first }));
      return true;
    }
    case "spLureThreat":
      raiseThreat(s, 3, "encounter");
      log(
        s,
        "Lure of the Ring: the first player raises their threat by 3.",
        "danger",
      );
      return true;
    case "spPathlessEngage": {
      if (!u) return true;
      if (
        s.staging.some((x) => x.id === u.id) ||
        allEngaged(s).some((x) => x.id === u.id)
      ) {
        forOwner(s, p, () => engage(s, u));
        if (!seatView(s, p).engaged.some((x) => x.id === u.id)) return true;
        log(
          s,
          `Pathless Country: ${name(u)} engages ${who(s, p)} and attacks.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    }
  }
  return false;
}
