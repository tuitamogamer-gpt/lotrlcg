/**
 * Voyage Across Belegaer's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (removals from the encounter deck and the Corsair deck, which the
 * scenario's setup applies with the Nightmare Deck's two stage 2 quest cards,
 * in src/game/voyage-belegaer.ts) and its Nightmare encounter cards, composed
 * with the scenario's rules through batch4Scenario while a Nightmare mode game
 * is played. Corsair Confrontation's and Lost at Sea's When Revealed effects
 * resolve here; their Forced effects and Lost at Sea's cancelled Sailing
 * symbol are the scenario's own checks. Effects use the "nvb" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, log, make, prepend, shuffle } from "./core";
import { enemyAddedToStaging, engage, exhaustCharacter } from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { isAlly } from "./card-types";
import { isShipEnemy, isShipObjective } from "./ships";
import { sailingOnCourse, shiftHeading } from "./sailing";
import { VOYAGE as V, voyageState } from "./voyage-belegaer-support";
import { NIGHTMARE_GH as G, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

const nvbLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "voyage-across-belegaer" &&
  !!voyageState(s);
const heading = (s: GameState) => s.sailing?.heading ?? 0;
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const stagedCount = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code)).length;
const readyShips = (s: GameState) =>
  allCharacters(s).filter((u) => isShipObjective(u) && !u.exhausted);
const shipLabel = (s: GameState, u: Unit) =>
  s.table ? `${name(u)} · ${seatName(s, ownerOf(s, u))}` : name(u);

// ------------------------------------------------------------- passives

function nvbThreatBonus(s: GameState, u: Unit) {
  if (!nvbLive(s)) return 0;
  let bonus = 0;
  // Open Waters: "each Ship enemy gets -5 engagement cost and +1 [threat]."
  if (isShipEnemy(u)) bonus += stagedCount(s, G.open);
  // Shattered Sea: +2, +4 or +6 [threat] by the heading's off-course setting.
  if (live(s, u, G.shattered)) bonus += 2 * heading(s);
  return bonus;
}
const nvbEngagementBonus = (s: GameState, u: Unit) =>
  nvbLive(s) && isShipEnemy(u) ? -5 * stagedCount(s, G.open) : 0;
const nvbLocationQuestBonus = (s: GameState, u: Unit) =>
  nvbLive(s) && live(s, u, G.shattered) ? 2 * heading(s) : 0;
/** Sahír's Pursuer: "Cannot have attachments." */
const nvbCannotAttach = (s: GameState, u: Unit) =>
  nvbLive(s) && live(s, u, G.pursuer);
/** Open Waters: "Travel: One player must exhaust a Ship objective to travel here." */
function nvbTravelProblem(s: GameState, u: Unit) {
  if (!nvbLive(s) || !live(s, u, G.open)) return null;
  return readyShips(s).length
    ? null
    : "Open Waters: one player must exhaust a Ship objective to travel here.";
}
function nvbTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!nvbLive(s) || !live(s, u, G.open)) return undefined;
  return [fx("nvbOpenWaters", { player: firstPlayer(s) })];
}

// ------------------------------------------------------------- the cards

/**
 * Brash Corsair: "Forced: When the engaged player exhausts a Ship objective,
 * Brash Corsair makes an immediate attack."
 */
function nvbCharacterExhausted(s: GameState, u: Unit) {
  if (!nvbLive(s) || !isShipObjective(u)) return;
  const owner = ownerOf(s, u);
  const corsairs = allEngaged(s).filter(
    (x) => live(s, x, G.brash) && ownerOf(s, x) === owner,
  );
  if (!corsairs.length) return;
  log(
    s,
    `Brash Corsair: ${name(u)} is exhausted, so ${corsairs.length === 1 ? "Brash Corsair makes" : `${corsairs.length} Brash Corsairs make`} an immediate attack against ${who(s, owner)}.`,
    "danger",
  );
  prepend(
    s,
    ...corsairs.map((x) =>
      fx("immediateAttack", { target: x.id, player: owner }),
    ),
  );
}
/**
 * Sahír's Pursuer: "Forced: At the end of the encounter phase, if it is in
 * the staging area, the first player must either engage it or shift your
 * heading off-course."
 */
function nvbEncounterEnd(s: GameState): Effect[] {
  if (!nvbLive(s)) return [];
  return s.staging
    .filter((u) => live(s, u, G.pursuer))
    .map((u) => fx("nvbPursuer", { target: u.id, player: firstPlayer(s) }));
}

function nvbEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nvbLive(s) || (code !== G.rogue && code !== G.dreams)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Rogue Wave: "Each player must either exhaust a Ship objective he
  // controls or distribute 4 damage among characters he controls (6 damage
  // instead if you are off-course)."
  if (code === G.rogue)
    prepend(s, ...playerOrder(s).map((player) => fx("nvbRogue", { player })));
  // Dreams of Númenor: "Either set your heading to the worst setting or
  // exhaust all allies in play."
  else prepend(s, fx("nvbDreams", { player: activeSeat(s) }));
  return true;
}

function nvbShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nvbLive(s)) return false;
  switch (code) {
    // Rogue Wave: "Attacking enemy gets +1 [attack] for each quest card in
    // the victory display."
    case G.rogue: {
      const n = (s.victoryCards ?? []).filter(
        (x) => card(x).type_code === "quest",
      ).length;
      c.attackBonus += n;
      log(
        s,
        `Rogue Wave: the attacking enemy gets +${n} [attack] (1 for each quest card in the victory display).`,
        n ? "danger" : undefined,
      );
      return true;
    }
    // Dreams of Númenor: "If you are off-course, attacking enemy makes an
    // additional attack after this one."
    case G.dreams:
      if (!sailingOnCourse(s)) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          "Dreams of Númenor: you are off-course, so the attacking enemy makes an additional attack after this one.",
          "danger",
        );
      } else log(s, "Dreams of Númenor: you are on-course.");
      return true;
  }
  return false;
}

/**
 * Raging Squall: "Forced: After Raging Squall is discarded from the
 * encounter deck during a Sailing test, deal 1 damage to each character
 * committed to that test."
 */
function nvbSailingDiscarded(
  s: GameState,
  looked: string[],
  committedIds: string[],
): Effect[] {
  if (!nvbLive(s)) return [];
  const copies = looked.filter((c) => c === G.squall).length;
  const committed = committedIds
    .map((id) => allCharacters(s).find((u) => u.id === id))
    .filter((u): u is Unit => !!u);
  if (!copies || !committed.length) return [];
  log(
    s,
    `Raging Squall is discarded by the Sailing test: ${copies === 1 ? "1 damage is" : `${copies} damage are`} dealt to each committed character (${committed.map((u) => name(u)).join(", ")}).`,
    "danger",
  );
  return Array.from({ length: copies }).flatMap(() =>
    committed.map((u) =>
      fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
    ),
  );
}

// ------------------------------------------------------------- effects

/** Corsair Warship copies in the encounter deck, discard pile and victory display. */
function warshipOptions(s: GameState): Option[] {
  const zones: [string, string[], string][] = [
    ["deck", s.encounterDeck, "encounter deck"],
    ["discard", s.encounterDiscard, "discard pile"],
    ["victory", s.victoryCards ?? [], "victory display"],
  ];
  return zones
    .filter(([, pile]) => pile.includes(V.warship))
    .map(([zone, , label]) => ({
      id: zone,
      code: V.warship,
      label: `Corsair Warship · ${label}`,
      effects: [fx("nvbWarshipTake", { text: zone, player: firstPlayer(s) })],
    }));
}

export function nightmareVoyageEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nvb")) return false;
  if (!nvbLive(s)) return true;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "nvbStageReveal": {
      // Lost at Sea: "Set your heading to the worst setting."
      if (e.code === G.lost) {
        if (s.sailing) s.sailing.heading = 3;
        log(
          s,
          "Lost at Sea: your heading is set to the worst setting (Off-course · ¾).",
          "danger",
        );
        return true;
      }
      // Corsair Confrontation: "Search the encounter deck, discard pile, and
      // victory display for 1 copy of Corsair Warship and add it to the
      // staging area. Shuffle the encounter deck."
      const options = warshipOptions(s);
      if (!options.length) {
        log(
          s,
          "Corsair Confrontation: no Corsair Warship is in the encounter deck, discard pile or victory display.",
        );
        shuffle(s, s.encounterDeck);
        return true;
      }
      choose(
        s,
        `Corsair Confrontation · Add a Corsair Warship to the staging area${seatLabel(s, p)}`,
        options,
        "When Revealed: Search the encounter deck, discard pile, and victory display for 1 copy of Corsair Warship and add it to the staging area. Shuffle the encounter deck.",
      );
      return true;
    }
    case "nvbWarshipTake": {
      const pile =
        e.text === "victory"
          ? (s.victoryCards ??= [])
          : e.text === "discard"
            ? s.encounterDiscard
            : s.encounterDeck;
      const i = pile.lastIndexOf(V.warship);
      if (i >= 0) {
        pile.splice(i, 1);
        if (e.text === "victory") s.victory -= card(V.warship).victory ?? 0;
        const warship = make(s, V.warship);
        s.staging.push(warship);
        enemyAddedToStaging(s, warship);
        log(
          s,
          `Corsair Confrontation: Corsair Warship is added to the staging area from the ${e.text === "victory" ? "victory display" : e.text === "discard" ? "discard pile" : "encounter deck"}.`,
          "danger",
        );
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "nvbOpenWaters": {
      const ships = readyShips(s);
      if (!ships.length) return true;
      choose(
        s,
        `Open Waters · Exhaust a Ship objective${seatLabel(s, p)}`,
        ships.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: shipLabel(s, u),
          effects: [
            fx("nvbExhaustShip", {
              target: u.id,
              text: "Open Waters",
              player: ownerOf(s, u),
            }),
          ],
        })),
        "Travel: One player must exhaust a Ship objective to travel here.",
      );
      return true;
    }
    case "nvbExhaustShip": {
      const u = allCharacters(s).find((x) => x.id === e.target);
      if (!u || u.exhausted) return true;
      forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
      log(s, `${e.text}: ${name(u)} is exhausted.`);
      return true;
    }
    case "nvbPursuer": {
      const pursuer = s.staging.find((u) => u.id === e.target);
      if (!pursuer) return true;
      const options: Option[] = [
        {
          id: "engage",
          code: G.pursuer,
          label: "Engage Sahír's Pursuer",
          effects: [fx("nvbEngage", { target: pursuer.id, player: p })],
        },
      ];
      if (heading(s) < 3)
        options.push({
          id: "shift",
          label: "Shift your heading off-course",
          effects: [fx("nvbShift", { player: p })],
        });
      choose(
        s,
        `Sahír's Pursuer · Choose one${seatLabel(s, p)}`,
        options,
        "Forced: At the end of the encounter phase, if Sahír's Pursuer is in the staging area, the first player must either engage it or shift your heading off-course.",
      );
      return true;
    }
    case "nvbEngage": {
      const pursuer = s.staging.find((u) => u.id === e.target);
      if (!pursuer) return true;
      log(
        s,
        `Sahír's Pursuer: ${who(s, p)} ${s.table ? "engages" : "engage"} it.`,
        "danger",
      );
      engage(s, pursuer);
      return true;
    }
    case "nvbShift":
      log(s, "Sahír's Pursuer: the heading shifts off-course.", "danger");
      shiftHeading(s, 1);
      return true;
    case "nvbRogue": {
      const damage = sailingOnCourse(s) ? 4 : 6;
      const options: Option[] = s.allies
        .filter((u) => isShipObjective(u) && !u.exhausted)
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [
            fx("nvbExhaustShip", {
              target: u.id,
              text: "Rogue Wave",
              player: p,
            }),
          ],
        }));
      options.push({
        id: "damage",
        label: `Distribute ${damage} damage among characters you control`,
        effects: [
          fx("voyageAssignDamage", {
            value: damage,
            player: p,
            text: "Rogue Wave",
          }),
        ],
      });
      choose(
        s,
        `Rogue Wave · Choose one${seatLabel(s, p)}`,
        options,
        "When Revealed: Each player must either exhaust a Ship objective he controls or distribute 4 damage among characters he controls (6 damage instead if you are off-course).",
      );
      return true;
    }
    case "nvbDreams": {
      const allies = allCharacters(s).filter((u) => isAlly(u) && !u.exhausted);
      const options: Option[] = [];
      if (heading(s) < 3)
        options.push({
          id: "heading",
          label: "Set your heading to the worst setting (Off-course · ¾)",
          effects: [fx("nvbWorst", { player: p })],
        });
      if (allies.length)
        options.push({
          id: "allies",
          label: `Exhaust all allies in play (${allies.length})`,
          effects: [fx("nvbExhaustAllies", { player: p })],
        });
      if (!options.length) {
        log(
          s,
          "Dreams of Númenor: the heading is at the worst setting and no ally in play is ready.",
        );
        return true;
      }
      choose(
        s,
        `Dreams of Númenor · Choose one${seatLabel(s, p)}`,
        options,
        "When Revealed: Either set your heading to the worst setting or exhaust all allies in play.",
      );
      return true;
    }
    case "nvbWorst":
      if (s.sailing) s.sailing.heading = 3;
      log(
        s,
        "Dreams of Númenor: your heading is set to the worst setting (Off-course · ¾).",
        "danger",
      );
      return true;
    case "nvbExhaustAllies": {
      const allies = allCharacters(s).filter((u) => isAlly(u) && !u.exhausted);
      for (const u of allies)
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
      log(
        s,
        `Dreams of Númenor: each ally in play is exhausted (${allies.map((u) => name(u)).join(", ")}).`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_VOYAGE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  threatBonus: nvbThreatBonus,
  engagementBonus: nvbEngagementBonus,
  locationQuestBonus: nvbLocationQuestBonus,
  cannotAttach: nvbCannotAttach,
  travelProblem: nvbTravelProblem,
  travelEffects: nvbTravelEffects,
  characterExhausted: nvbCharacterExhausted,
  encounterEnd: nvbEncounterEnd,
  encounter: nvbEncounter,
  shadow: nvbShadow,
  sailingDiscarded: nvbSailingDiscarded,
  effect: nightmareVoyageEffect,
  sharedEffect: () => false,
};
