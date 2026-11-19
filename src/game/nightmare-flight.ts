/**
 * Flight from Moria's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (a bypassed quest card shuffled into the quest deck, Abandoned Tools'
 * Refresh Action once each round on Escape from Darkness), its three new
 * stage 2 routes (Ghâsh!, Blocked by Flame and Pursued by Shadow) and its
 * Nightmare encounter cards, composed with the Khazad-dûm scenario's own
 * rules through batch4Scenario while a Nightmare mode game is played.
 * Effects use the "nfm" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  engage,
  raiseThreat,
  removeFromQuest,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  livingSeats,
  ownerOf,
  playerOrder,
} from "./table";
import { isPlayerCardSource } from "./player-effect-immunity";
import { NIGHTMARE_KD as K, nightmareLive } from "./nightmare";
import { KHAZAD } from "./khazad-dum";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareFlightState {
  /** Blocked by Flame: The Nameless Fear reached 10 damage (removed); the stage is defeated. */
  flameDefeated?: boolean;
  /** Pursued by Shadow: the progress placed on it this round. */
  pursued?: { round: number; amount: number };
  /** An Evil Fortune's shadow: the attacking enemy whose attack destroying a character adds it to the victory display. */
  fortune?: string;
}

const flightLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "flight-from-moria";
/** The active route, turned to side 2B. */
const route = (s: GameState) =>
  s.khazad?.questSide === "B" ? s.khazad.activeQuest : undefined;
const fear = (s: GameState) =>
  s.staging.find((u) => u.code === KHAZAD.nameless);
/** "The Nameless Fear's [threat]" (X, the victory points, without it in play). */
const fearThreat = (s: GameState) => {
  const f = fear(s);
  return f ? threatOf(s, f) : s.victory;
};
const corridors = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, K.corridor))
    .length;

// ------------------------------------------------------------- the setup card

/** "When a quest card is bypassed, shuffle it into the quest deck instead of placing it on the bottom." */
function flightBypass(s: GameState) {
  if (!flightLive(s)) return undefined;
  const n = corridors(s);
  return {
    label: n
      ? `Shuffle this route into the quest deck (Shadowed Corridor: each player raises their threat by ${2 * n})`
      : "Shuffle this route into the quest deck",
    // Shadowed Corridor: "As an additional cost to bypass a quest card, each
    // player must raise his threat by 2." (each copy in play)
    cost: n
      ? playerOrder(s).map((player) =>
          fx("nfmCorridorThreat", { player, value: 2 * n }),
        )
      : [],
  };
}
function flightQuestBypassed(s: GameState): Effect[] {
  if (!flightLive(s) || !s.khazad) return [];
  shuffle(s, s.khazad.questDeck);
  log(
    s,
    "Flight from Moria · Nightmare: the bypassed route is shuffled into the quest deck.",
  );
  // Swarming Goblins: "While you are engaged with Swarming Goblins, it gains:
  // "Forced: When a quest card is bypassed, search the encounter discard pile
  // for a copy of Goblin Spearman and put it into play engaged with you.""
  return allEngaged(s)
    .filter((u) => live(s, u, K.swarming))
    .map((u) => fx("nfmSpearman", { player: ownerOf(s, u) }));
}
/** "While the Escape from Darkness quest card is in play, the Refresh Action on Abandoned Tools can only be triggered once each round." */
const flightAbilityOncePerRound = (s: GameState, code: string) =>
  flightLive(s) &&
  code === KHAZAD.tools &&
  s.khazad?.activeQuest === KHAZAD.darkness;

// ------------------------------------------------------------- the routes

/** Ghâsh!: "When Revealed: Deal 1 damage to each questing character." */
function flightStageRevealed(s: GameState, stage: number) {
  if (!flightLive(s) || stage !== 2) return;
  if (s.nightmare?.flameDefeated) delete s.nightmare.flameDefeated;
  if (route(s) !== K.ghash) return;
  const questing = allCharacters(s).filter((u) => u.committed);
  log(
    s,
    `Ghâsh! deals 1 damage to each questing character (${questing.length}).`,
    questing.length ? "danger" : "normal",
  );
  prepend(
    s,
    ...questing.map((u) =>
      fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
    ),
  );
}
/**
 * Blocked by Flame: "If The Nameless Fear has 10 or more damage on it, remove
 * all damage from it and advance to the next stage."
 */
function flightCheck(s: GameState) {
  if (!flightLive(s) || route(s) !== K.flame || s.nightmare?.flameDefeated)
    return;
  const f = fear(s);
  if (!f || f.damage < 10) return;
  f.damage = 0;
  (s.nightmare ??= {}).flameDefeated = true;
  log(
    s,
    "Blocked by Flame: The Nameless Fear has 10 damage; it is removed, and the stage is defeated.",
    "good",
  );
}
const flightStageDefeated = (s: GameState) =>
  flightLive(s) && route(s) === K.flame
    ? !!s.nightmare?.flameDefeated
    : undefined;
/**
 * Blocked by Flame: "The Nameless Fear attacks each player in turn order
 * during the combat phase (deal and discard a new shadow card for each
 * attack). Characters are eligible to attack The Nameless Fear while it is in
 * the staging area."
 */
const flightConsideredEngaged = (s: GameState, u: Unit, player: number) =>
  flightLive(s) &&
  route(s) === K.flame &&
  u.code === KHAZAD.nameless &&
  s.staging.some((x) => x.id === u.id) &&
  livingSeats(s).includes(player);
/** Pursued by Shadow: "Forced: At the end of the round, shuffle the discard pile into the encounter deck and discard the top 5 cards." */
const flightRoundEnd = (s: GameState) =>
  flightLive(s) && route(s) === K.pursued
    ? [fx("nfmPursued", { player: firstPlayer(s) })]
    : [];
/** Pursued by Shadow: "No more than 1 progress can be placed on this stage each round." */
function flightProgress(s: GameState, amount: number, quest: Unit) {
  if (!flightLive(s) || route(s) !== K.pursued || quest.code !== K.pursued)
    return amount;
  const p = s.nightmare?.pursued;
  const left = Math.max(0, 1 - (p && p.round === s.round ? p.amount : 0));
  if (amount > left)
    log(
      s,
      "Pursued by Shadow: no more than 1 progress can be placed on this stage each round.",
    );
  return Math.min(amount, left);
}
function flightProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (!flightLive(s) || quest.code !== K.pursued) return;
  const p = s.nightmare?.pursued;
  (s.nightmare ??= {}).pursued = {
    round: s.round,
    amount: (p && p.round === s.round ? p.amount : 0) + amount,
  };
}
/** Pursued by Shadow: "If the players defeat this stage, they win the game." */
const flightWinningStage = (s: GameState, code: string) =>
  flightLive(s) && code === K.pursued;

// ------------------------------------------------------------- the cards

/** Coal-Black Orc: "X is the number of victory points in the victory display." ([threat] and [attack]) */
const flightStats = (s: GameState, u: Unit) =>
  live(s, u, K.coalBlack) ? { attack: s.victory } : {};
const flightThreatBonus = (s: GameState, u: Unit) =>
  live(s, u, K.coalBlack) ? s.victory : 0;

const TREACHERIES: string[] = [K.dismay, K.fortune];
function flightEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!flightLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // An Evil Fortune: "When Revealed: Add this card to the victory display."
  if (code === K.fortune) {
    addVictoryCard(s, code);
    log(s, "An Evil Fortune enters the victory display.", "danger");
    return true;
  }
  // Dismay and Fear: "When Revealed: Choose and remove characters from the
  // quest until the total [willpower] of characters removed from the quest is
  // equal to or higher than The Nameless Fear's [threat]."
  s.encounterDiscard.push(code);
  prepend(s, fx("nfmDismay", { value: fearThreat(s), player: firstPlayer(s) }));
  return true;
}

function flightShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !flightLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
  switch (code) {
    // Coal-Black Orc: "Attacking enemy gets +X [attack]. X is the number of
    // victory points in the victory display."
    case K.coalBlack:
      c.attackBonus += s.victory;
      return true;
    // Shadowed Corridor: "If the defending character is a hero, discard all
    // resources in its resource pool. Deal attacking enemy another shadow card
    // for each resource discarded in this way."
    case K.corridor: {
      if (!defender || card(defender.code).type_code !== "hero") return true;
      const n = defender.resources;
      defender.resources = 0;
      log(
        s,
        `Shadowed Corridor: ${name(defender)} loses ${n} ${n === 1 ? "resource" : "resources"}.`,
        n ? "danger" : "normal",
      );
      if (n && enemy)
        prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: n }));
      return true;
    }
    // Dismay and Fear: "Discard each attachment you control with a cost less
    // than The Nameless Fear's [threat]."
    case K.dismay: {
      const player = c.attackPlayer ?? firstPlayer(s);
      const x = fearThreat(s);
      let n = 0;
      for (const u of allCharacters(s).filter((y) => ownerOf(s, y) === player))
        for (const a of [...u.attachments])
          if (
            isPlayerCardSource(a.code) &&
            (a.controller ?? a.owner ?? player) === player &&
            (Number(card(a.code).cost) || 0) < x
          ) {
            discardAttachment(s, u, a);
            n++;
          }
      log(
        s,
        `Dismay and Fear: ${n} ${n === 1 ? "attachment" : "attachments"} with a cost under ${x} discarded.`,
        n ? "danger" : "normal",
      );
      return true;
    }
    // An Evil Fortune: "If this attack destroys a character, add this card to
    // the victory display."
    case K.fortune:
      if (enemy) (s.nightmare ??= {}).fortune = enemy.id;
      return true;
  }
  return false;
}
/** An Evil Fortune's shadow: the attack destroyed a character. */
function flightCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const id = s.nightmare?.fortune;
  if (!flightLive(s) || !id || !context.combatDamage || context.enemyId !== id)
    return;
  if (!["hero", "ally"].includes(card(u.code).type_code)) return;
  delete s.nightmare!.fortune;
  const enemy = get(s, id);
  const at = enemy?.shadows.lastIndexOf(K.fortune) ?? -1;
  if (enemy && at >= 0) removeShadowCard(enemy, at);
  addVictoryCard(s, K.fortune);
  log(
    s,
    `An Evil Fortune: the attack destroys ${name(u)}; it enters the victory display.`,
    "danger",
  );
}
const flightAttackFinished = (s: GameState) => {
  if (s.nightmare?.fortune) delete s.nightmare.fortune;
  return [];
};

// ------------------------------------------------------------- effects

export function nightmareFlightEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nfmCorridorThreat":
      raiseThreat(s, e.value ?? 0, "cost");
      return true;
    case "nfmSpearman": {
      const at = s.encounterDiscard.lastIndexOf(KHAZAD.spearman);
      if (at < 0) {
        log(s, "Swarming Goblins · No Goblin Spearman is in the discard pile.");
        return true;
      }
      s.encounterDiscard.splice(at, 1);
      const u = make(s, KHAZAD.spearman);
      s.staging.push(u);
      engage(s, u);
      log(
        s,
        `Swarming Goblins: a Goblin Spearman from the discard pile engages${seatLabel(s, p) || " you"}.`,
        "danger",
      );
      return true;
    }
    case "nfmPursued": {
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const top = s.encounterDeck.splice(0, 5);
      s.encounterDiscard.push(...top);
      const foes = top.filter((c) => c === KHAZAD.foe);
      log(
        s,
        `Pursued by Shadow discards ${top.map((c) => card(c).name).join(", ") || "nothing"}${foes.length ? `; ${foes.length} A Foe Beyond resolves` : ""}.`,
        foes.length ? "danger" : "normal",
      );
      prepend(
        s,
        ...foes.map((code) =>
          fx("resolvePrintedWhenRevealed", { code, player: firstPlayer(s) }),
        ),
      );
      return true;
    }
    case "nfmDismay": {
      const questing = allCharacters(s).filter((u) => u.committed);
      const need = e.value ?? 0;
      if (need <= 0 || !questing.length) {
        if (need > 0)
          log(s, "Dismay and Fear · No questing character is left to remove.");
        return true;
      }
      choose(
        s,
        `Dismay and Fear · Remove a character from the quest (${need} [willpower] to go)`,
        questing.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} · ${stats(s, u).will} [willpower]`,
          effects: [
            fx("nfmDismayRemove", { target: u.id, value: need, player: p }),
          ],
        })),
        card(K.dismay).text,
      );
      return true;
    }
    case "nfmDismayRemove": {
      const u = get(s, e.target);
      if (!u) return true;
      const will = stats(s, u).will;
      removeFromQuest(s, u);
      log(
        s,
        `Dismay and Fear: ${name(u)} is removed from the quest.`,
        "danger",
      );
      prepend(s, fx("nfmDismay", { value: (e.value ?? 0) - will, player: p }));
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nfmCorridorThreat",
  "nfmSpearman",
  "nfmDismay",
  "nfmDismayRemove",
]);
export const NIGHTMARE_FLIGHT_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  bypass: flightBypass,
  questBypassed: flightQuestBypassed,
  abilityOncePerRound: flightAbilityOncePerRound,
  stageRevealed: flightStageRevealed,
  stageDefeated: flightStageDefeated,
  check: flightCheck,
  consideredEngaged: flightConsideredEngaged,
  roundEnd: flightRoundEnd,
  progress: flightProgress,
  questProgressPlaced: flightProgressPlaced,
  winningStage: flightWinningStage,
  stats: flightStats,
  threatBonus: flightThreatBonus,
  encounter: flightEncounter,
  shadow: flightShadow,
  characterDestroyed: flightCharacterDestroyed,
  attackFinished: flightAttackFinished,
  effect: nightmareFlightEffect,
  sharedEffect: (e) => e.kind.startsWith("nfm") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareFlight(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    (q.flameDefeated === undefined || typeof q.flameDefeated === "boolean") &&
    (q.pursued === undefined ||
      (!!q.pursued &&
        Number.isInteger(q.pursued.round) &&
        q.pursued.round >= 0 &&
        q.pursued.round <= s.round &&
        Number.isInteger(q.pursued.amount) &&
        q.pursued.amount >= 0)) &&
    (q.fortune === undefined || typeof q.fortune === "string")
  );
}
