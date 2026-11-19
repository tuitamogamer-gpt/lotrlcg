/**
 * The Redhorn Gate's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (Blinding Blizzard set aside until stage 2B, player cards in the
 * victory display without their victory points) and its Nightmare encounter
 * cards, composed with the scenario's own rules through batch4Scenario while
 * a Nightmare mode game is played. Effects use the "nrg" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  shuffle,
  stats,
} from "./core";
import { discardCharacter, revealed } from "./board";
import { activeSeat, firstPlayer, livingSeats, seatView } from "./table";
import { hasTrait } from "./expansion-passives";
import { isPlayerCardSource } from "./player-effect-immunity";
import { currentQuestUnit } from "./quest-state";
import { realmWillProtected } from "./lost-realm-player";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { REDHORN } from "./redhorn-gate";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareRedhornState {
  /** Blinding Blizzard copies set aside, out of play, until stage 2B is revealed. */
  blizzards?: number;
  /** Silvertine Marauder's shadow on the current attack: the attacking enemy, once for each copy. */
  marauders?: string[];
}

const redhornLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "redhorn-gate";
const blizzards = (s: GameState) =>
  s.staging.filter((u) => live(s, u, D.blizzard));
const snowCode = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Snow");
/** The defending character of the current attack (the first, with several). */
const defender = (s: GameState) =>
  get(s, s.combat?.defenderIds?.[0] ?? s.combat?.defenderId ?? undefined);

// ------------------------------------------------------------- the setup card

/** "During this game, player cards in the victory display do not count their victory points." */
const redhornVictoryValue = (s: GameState, code: string) =>
  redhornLive(s) && isPlayerCardSource(code) ? 0 : undefined;
/**
 * "Forced: When stage 2b is revealed, shuffle each set aside copy of Blinding
 * Blizzard into the encounter deck." (The state check that follows the
 * stage's reveal.)
 */
function redhornCheck(s: GameState) {
  if (!redhornLive(s) || s.stage < 2) return;
  const n = s.nightmare?.blizzards ?? 0;
  if (!n) return;
  delete s.nightmare!.blizzards;
  s.encounterDeck.push(...(Array(n).fill(D.blizzard) as string[]));
  shuffle(s, s.encounterDeck);
  log(
    s,
    `The Redhorn Gate · Nightmare: stage 2B shuffles ${n} set-aside ${n === 1 ? "copy" : "copies"} of Blinding Blizzard into the encounter deck.`,
    "danger",
  );
}

// ------------------------------------------------------------- Blinding Blizzard

/** "While Blinding Blizzard is in play, heroes do not collect resources during the resource phase." */
const redhornCannotCollect = (s: GameState) =>
  redhornLive(s) && blizzards(s).length > 0;
/**
 * "Progress that would be placed on the current quest or on Snow locations
 * are instead placed on Blinding Blizzard. When the 5th progress is placed on
 * Blinding Blizzard, discard it." (The first copy in play takes it; progress
 * beyond the 5th is lost with it.)
 */
function blizzardTakes(s: GameState, amount: number, what: string) {
  const b = blizzards(s)[0];
  if (!b || amount <= 0) return false;
  b.progress += amount;
  log(
    s,
    `Blinding Blizzard: ${amount} progress for ${what} is placed on it (${Math.min(5, b.progress)} of 5).`,
  );
  if (b.progress >= 5) {
    s.staging = s.staging.filter((u) => u.id !== b.id);
    s.encounterDiscard.push(b.code);
    log(s, "Blinding Blizzard has its 5th progress and is discarded.", "good");
  }
  return true;
}
function redhornProgress(s: GameState, amount: number, quest: Unit) {
  if (
    !redhornLive(s) ||
    currentQuestUnit(s)?.id !== quest.id ||
    !blizzardTakes(s, amount, "the current quest")
  )
    return amount;
  return 0;
}
function redhornLocationProgress(s: GameState, u: Unit, amount: number) {
  if (
    !redhornLive(s) ||
    !hasTrait(u, "Snow") ||
    !blizzardTakes(s, amount, name(u))
  )
    return amount;
  return 0;
}

// ------------------------------------------------------------- the cards

/**
 * Icy Cavern: "X is the number of Snow cards in the staging area." (its
 * [threat]). Silvertine Marauder: "While attacking, Silvertine Marauder gets
 * +2 [attack] if the defending character has less than 2 [willpower]." (and
 * its shadow's +2 for the attacking enemy).
 */
const redhornThreatBonus = (s: GameState, u: Unit) =>
  live(s, u, D.cavern)
    ? s.staging.filter((x) => hasTrait(x, "Snow")).length
    : 0;
function redhornStats(s: GameState, u: Unit) {
  if (!redhornLive(s) || s.combat?.enemyId !== u.id) return {};
  const shadows = (s.nightmare?.marauders ?? []).filter(
    (id) => id === u.id,
  ).length;
  const copies = (live(s, u, D.marauder) ? 1 : 0) + shadows;
  if (!copies) return {};
  const d = defender(s);
  return d && stats(s, d).will < 2 ? { attack: 2 * copies } : {};
}
/** Frozen Silverlode: "While Frozen Silverlode is in the staging area, characters cannot gain [willpower] from player card effects." */
const redhornWillpowerGainBlocked = (s: GameState) =>
  redhornLive(s) && s.staging.some((u) => live(s, u, D.silverlode));
/** Snow-Giant: "While Snow-Giant is in the staging area, it attacks the first player during the combat phase, as if it were engaged." */
const redhornConsideredEngaged = (s: GameState, u: Unit, player: number) =>
  redhornLive(s) &&
  s.phase === "defense" &&
  live(s, u, D.giant) &&
  s.staging.some((x) => x.id === u.id) &&
  player === firstPlayer(s) &&
  livingSeats(s).includes(player);
/** Wolfpelt Goblin's and Snow-Giant's Forced effects as they engage a player. */
function redhornEngaged(s: GameState, u: Unit) {
  if (!redhornLive(s) || u.blanked) return;
  const player = activeSeat(s);
  // Wolfpelt Goblin: "Forced: After engaging Wolfpelt Goblin, the engaged
  // player must deal X damage to 1 character he controls, where X is the
  // active location's remaining quest points. Then, remove 2 progress from
  // the active location, if able."
  if (u.code === D.wolfpelt) prepend(s, fx("nrgWolfpelt", { player }));
  // Snow-Giant: "Forced: After Snow-Giant engages you, discard the ally you
  // control with the highest [willpower]."
  if (u.code === D.giant) prepend(s, fx("nrgGiant", { player }));
}
/** Icy Cavern: "Travel: Search the encounter deck and discard pile for 1 copy of Freezing Cold and reveal it to travel here." */
const freezingCold = (s: GameState) =>
  s.encounterDeck.includes(REDHORN.cold) ||
  s.encounterDiscard.includes(REDHORN.cold);
const redhornTravelProblem = (s: GameState, u: Unit) =>
  live(s, u, D.cavern) && !freezingCold(s)
    ? "Icy Cavern: no copy of Freezing Cold is in the encounter deck or discard pile to reveal."
    : null;
const redhornTravelEffects = (s: GameState, u: Unit) =>
  live(s, u, D.cavern)
    ? [fx("nrgCavernTravel", { player: firstPlayer(s) })]
    : undefined;

const TREACHERIES: string[] = [D.blizzard, D.cruel];
function redhornEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!redhornLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Blinding Blizzard: "When Revealed: Add Blinding Blizzard to the staging
  // area."
  if (code === D.blizzard) {
    s.staging.push(make(s, code));
    log(
      s,
      "Blinding Blizzard enters the staging area: heroes collect no resources, and progress for the current quest or a Snow location is placed on it.",
      "danger",
    );
    return true;
  }
  // Caradhras the Cruel: "When Revealed: Return all Snow cards in the
  // encounter discard pile to the top of the encounter deck, in random order.
  // Reveal the top card of the encounter deck (reveal the top 2 cards instead
  // if there are 3 or 4 players in the game)."
  const snow = s.encounterDiscard.filter(snowCode);
  s.encounterDiscard = s.encounterDiscard.filter((c) => !snowCode(c));
  shuffle(s, snow);
  s.encounterDeck.unshift(...snow);
  s.encounterDiscard.push(code);
  const n = livingSeats(s).length >= 3 ? 2 : 1;
  log(
    s,
    `Caradhras the Cruel returns ${snow.length} Snow ${snow.length === 1 ? "card" : "cards"} to the top of the encounter deck and reveals ${n === 1 ? "the top card" : "the top 2 cards"}.`,
    "danger",
  );
  prepend(
    s,
    ...Array.from({ length: n }, () =>
      fx("reveal", { player: firstPlayer(s) }),
    ),
  );
  return true;
}

function redhornShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !redhornLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Silvertine Marauder: "Attacking enemy gets +2 [attack] if the defending
    // character has less than 2 [willpower]."
    case D.marauder:
      if (enemy)
        (s.nightmare ??= {}).marauders = [
          ...(s.nightmare.marauders ?? []),
          enemy.id,
        ];
      return true;
    // Icy Cavern, Frozen Silverlode: "Defending character gets -1
    // [willpower]. Deal the attacking enemy 1 additional shadow card."
    case D.cavern:
    case D.silverlode: {
      const d = defender(s);
      if (d && !realmWillProtected(s, d)) {
        d.tempWill = (d.tempWill ?? 0) - 1;
        log(s, `${card(code).name}: ${name(d)} gets -1 [willpower].`, "danger");
      }
      if (enemy)
        prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 1 }));
      return true;
    }
  }
  return false;
}
const redhornAttackFinished = (s: GameState) => {
  if (s.nightmare?.marauders) delete s.nightmare.marauders;
  return [];
};

// ------------------------------------------------------------- effects

export function nightmareRedhornEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrg")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nrgWolfpelt": {
      const loc = s.activeLocation;
      const x = loc ? Math.max(0, locationQuest(s, loc) - loc.progress) : 0;
      const own = [...s.heroes, ...s.allies];
      if (x > 0 && own.length)
        choose(
          s,
          `Wolfpelt Goblin · Deal ${x} damage to a character you control${seatLabel(s, p)}`,
          own.map((u): Option => ({
            id: u.id,
            code: u.code,
            label: `${name(u)} · ${x} damage`,
            effects: [fx("damage", { target: u.id, value: x, player: p })],
          })),
          card(D.wolfpelt).text,
        );
      else
        log(
          s,
          `Wolfpelt Goblin: the active location has no remaining quest points; no damage is dealt.`,
        );
      if (loc && loc.progress > 0) {
        const removed = Math.min(2, loc.progress);
        loc.progress -= removed;
        log(
          s,
          `Wolfpelt Goblin removes ${removed} progress from ${name(loc)}.`,
          "danger",
        );
      }
      return true;
    }
    case "nrgGiant": {
      const allies = seatView(s, p).allies;
      if (!allies.length) {
        log(s, "Snow-Giant: no ally to discard.");
        return true;
      }
      const top = Math.max(...allies.map((u) => stats(s, u).will));
      const highest = allies.filter((u) => stats(s, u).will === top);
      if (highest.length === 1) {
        prepend(s, fx("nrgGiantDiscard", { target: highest[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `Snow-Giant · Discard the ally with the highest [willpower]${seatLabel(s, p)}`,
        highest.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} · ${top} [willpower]`,
          effects: [fx("nrgGiantDiscard", { target: u.id, player: p })],
        })),
        card(D.giant).text,
      );
      return true;
    }
    case "nrgGiantDiscard": {
      const u = get(s, e.target);
      if (!u) return true;
      log(s, `Snow-Giant: ${name(u)} is discarded.`, "danger");
      discardCharacter(s, u);
      return true;
    }
    case "nrgCavernTravel": {
      let at = s.encounterDeck.indexOf(REDHORN.cold);
      if (at >= 0) s.encounterDeck.splice(at, 1);
      else {
        at = s.encounterDiscard.lastIndexOf(REDHORN.cold);
        if (at < 0) return true;
        s.encounterDiscard.splice(at, 1);
      }
      shuffle(s, s.encounterDeck);
      log(s, "Icy Cavern: a Freezing Cold is revealed to travel there.");
      revealed(s, REDHORN.cold);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set(["nrgWolfpelt", "nrgGiant", "nrgGiantDiscard"]);
export const NIGHTMARE_REDHORN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  victoryValue: redhornVictoryValue,
  check: redhornCheck,
  cannotCollectResources: redhornCannotCollect,
  progress: redhornProgress,
  locationProgressAmount: redhornLocationProgress,
  threatBonus: redhornThreatBonus,
  stats: redhornStats,
  willpowerGainBlocked: redhornWillpowerGainBlocked,
  consideredEngaged: redhornConsideredEngaged,
  engaged: redhornEngaged,
  travelProblem: redhornTravelProblem,
  travelEffects: redhornTravelEffects,
  encounter: redhornEncounter,
  shadow: redhornShadow,
  attackFinished: redhornAttackFinished,
  effect: nightmareRedhornEffect,
  sharedEffect: (e) => e.kind.startsWith("nrg") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareRedhorn(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    (q.blizzards === undefined ||
      (Number.isInteger(q.blizzards) && q.blizzards >= 0)) &&
    (q.marauders === undefined ||
      (Array.isArray(q.marauders) &&
        q.marauders.every((id) => typeof id === "string")))
  );
}
