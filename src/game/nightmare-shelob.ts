/**
 * Shelob's Lair's Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (Shelob keeps her unresolved shadow cards at the end of the combat phase;
 * while Cleft of Cirith Ungol is in the staging area, the players can travel
 * only to it) and its Nightmare encounter cards, composed with the
 * scenario's own rules (src/game/shelob-lair.ts) through batch4Scenario
 * while a Nightmare mode game is played. Resources placed on Shelob use the
 * scenario's own effect ("slFeed"). Effects use the "nlr" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { engage, exhaustCharacter, removeFromQuest } from "./board";
import { activeSeat, firstPlayer, playerOrder, seatName } from "./table";
import { isAlly, isHero } from "./card-types";
import { hasTrait } from "./expansion-passives";
import { lsSmeagol } from "./land-shadow-gollum";
import { SL, slShelob } from "./shelob-lair";
import { NIGHTMARE_LOS as L, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareShelobState {
  /** Impenetrable Dark: the round until whose end characters cannot be readied by player card effects. */
  shelobDark?: number;
  /** Impenetrable Dark's and Growing Stench's shadows: characters that cannot ready until the end of the round. */
  shelobNoReady?: { round: number; ids: string[] };
}

const nlrLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "shelobs-lair" && !!s.shelobLair;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isUnderground = (u: Unit) =>
  card(u.code).type_code === "location" && hasTrait(u, "Underground");
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const stagedCount = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code)).length;
const isShelob = (u?: Unit) => !!u && u.code === SL.shelob;
/** Mark characters that cannot ready until the end of the round. */
function noReady(s: GameState, ids: string[]) {
  if (!ids.length) return;
  const q = (s.nightmare ??= {});
  const kept =
    q.shelobNoReady?.round === s.round ? q.shelobNoReady.ids : ([] as string[]);
  q.shelobNoReady = { round: s.round, ids: [...new Set([...kept, ...ids])] };
}

// ------------------------------------------------------------- the setup card

/**
 * "Do not discard unresolved shadow cards from Shelob at the end of the
 * combat phase." Her resolved shadow cards are discarded; the facedown ones
 * stay dealt to her.
 */
function nlrCombatEndShadows(s: GameState, u: Unit) {
  if (!nlrLive(s) || !isShelob(u)) return false;
  const resolved = Math.min(u.revealedShadowCount ?? 0, u.shadows.length);
  if (resolved) s.encounterDiscard.push(...u.shadows.splice(0, resolved));
  if (u.shadows.length) u.faceupShadows = u.shadows.map(() => false);
  else delete u.faceupShadows;
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
/**
 * "While Cleft of Cirith Ungol is in the staging area, players cannot travel
 * to locations not named Cleft of Cirith Ungol." Torech Ungol: "Travel:
 * Exhaust Sméagol to travel here."
 */
function nlrTravelProblem(s: GameState, u: Unit) {
  if (!nlrLive(s)) return null;
  if (u.code !== SL.cleft && s.staging.some((x) => x.code === SL.cleft))
    return "Shelob's Lair (Nightmare): while Cleft of Cirith Ungol is in the staging area, the players cannot travel to another location.";
  if (live(s, u, L.torech)) {
    const smeagol = lsSmeagol(s);
    return smeagol && !smeagol.exhausted
      ? null
      : "Torech Ungol: exhaust Sméagol to travel here.";
  }
  return null;
}
/** Torech Ungol's and Cobwebbed Tunnel's travel costs. */
function nlrTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!nlrLive(s)) return undefined;
  const first = firstPlayer(s);
  if (live(s, u, L.torech))
    return [fx("pomExhaustSmeagol", { text: "Torech Ungol", player: first })];
  // Cobwebbed Tunnel: "The first player reveals an encounter card to travel here."
  if (live(s, u, L.cobwebbed)) return [fx("reveal", { player: first })];
  return undefined;
}

// ------------------------------------------------------------- the cards

function nlrStats(s: GameState, u: Unit) {
  if (!nlrLive(s) || !live(s, u, SL.shelob)) return {};
  // Torech Ungol: "While in the staging area, Shelob gets +1 [attack] and +1 [defense]."
  const n = stagedCount(s, L.torech);
  return n ? { attack: n, defense: n } : {};
}
/**
 * Cobwebbed Tunnel: "While in the staging area, each Underground location in
 * the staging area gets +1 [threat] and +5 quest points."
 */
const tunnelsOn = (s: GameState, u: Unit) =>
  nlrLive(s) && isUnderground(u) && s.staging.some((x) => x.id === u.id)
    ? stagedCount(s, L.cobwebbed)
    : 0;
const nlrThreatBonus = (s: GameState, u: Unit) => tunnelsOn(s, u);
const nlrLocationQuestBonus = (s: GameState, u: Unit) => 5 * tunnelsOn(s, u);
/** Foul-smelling Cave: "Forced: When explored, place 1 resource on Shelob, if able." */
function nlrExplored(s: GameState, u: Unit) {
  if (!nlrLive(s) || !live(s, u, L.foulCave)) return;
  prepend(
    s,
    fx("slFeed", {
      value: 1,
      text: "Foul-smelling Cave",
      player: firstPlayer(s),
    }),
  );
}
/** Orc of Minas Morgul: Peril; the revealing player resolves its When Revealed effect. */
function nlrCardEntered(
  s: GameState,
  u: Unit,
  fromReveal?: boolean,
  cancelled?: boolean,
) {
  if (!nlrLive(s) || !fromReveal || cancelled || u.code !== L.minasOrc) return;
  prepend(s, fx("nlrMinasOrc", { target: u.id, player: activeSeat(s) }));
}

function nlrEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nlrLive(s) || (code !== L.impenetrable && code !== L.stench))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Impenetrable Dark: "Each player removes a character he controls from the
  // quest and exhausts that character. Until the end of the round,
  // characters cannot be readied by player card effects."
  if (code === L.impenetrable) {
    s.encounterDiscard.push(code);
    (s.nightmare ??= {}).shelobDark = s.round;
    log(
      s,
      "Impenetrable Dark: until the end of the round, characters cannot be readied by player card effects.",
      "danger",
    );
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("nlrDarkQuest", { player })),
    );
    return true;
  }
  // Growing Stench: "Deal Growing Stench to Shelob as a facedown shadow card."
  const shelob = slShelob(s);
  if (!shelob) {
    s.encounterDiscard.push(code);
    log(s, "Growing Stench: Shelob is not in play, so it is discarded.");
    return true;
  }
  shelob.shadows.push(code);
  shelob.faceupShadows?.push(false);
  log(
    s,
    "Growing Stench is dealt to Shelob as a facedown shadow card.",
    "danger",
  );
  return true;
}

/**
 * Shelob's facedown shadow cards (Growing Stench, or those the setup card
 * keeps) resolve in her next attack, an immediate one included: they join
 * that attack's shadow cards.
 */
function nlrEnemyAttackStarted(s: GameState, enemy: Unit) {
  const c = s.combat;
  const previous = c?.immediatePreviousShadows;
  if (
    !nlrLive(s) ||
    !isShelob(enemy) ||
    !c?.immediate ||
    c.enemyId !== enemy.id ||
    !previous?.length
  )
    return;
  const revealed = c.immediatePreviousRevealedShadowCount ?? 0;
  const moved = previous.splice(revealed);
  c.immediatePreviousFaceupShadows?.splice(revealed);
  enemy.shadows.push(...moved);
  enemy.faceupShadows?.push(...moved.map(() => false));
}

function nlrShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nlrLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((x): x is Unit => !!x);
  switch (code) {
    // Foul-smelling Cave: "+1 [attack] (+2 [attack] instead if attacking enemy is Shelob)."
    case L.foulCave: {
      const bonus = isShelob(enemy) ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Foul-smelling Cave: the attacking enemy gets +${bonus} [attack]${bonus === 2 ? " (it is Shelob)" : ""}.`,
        "danger",
      );
      return true;
    }
    // Orc of Minas Morgul: "Attacking enemy gets +2 [attack]."
    case L.minasOrc:
      c.attackBonus += 2;
      log(
        s,
        "Orc of Minas Morgul: the attacking enemy gets +2 [attack].",
        "danger",
      );
      return true;
    // Under-gate Sentry: "Either discard a random card from your hand, or
    // exhaust a character you control."
    case L.sentry:
      prepend(s, fx("nlrSentryShadow", { player: p }));
      return true;
    // Impenetrable Dark: "Exhaust a character you control. Until the end of
    // the round, that character cannot ready."
    case L.impenetrable:
      prepend(s, fx("nlrDarkShadow", { player: p }));
      return true;
    // Growing Stench: "Defending character cannot ready. If the attacking
    // enemy is Shelob and this attack destroys a character, place 1
    // resource on Shelob." (No duration is printed: until the end of the
    // round, as the scenarios' other "cannot ready" shadows.)
    case L.stench:
      noReady(
        s,
        defenders.map((x) => x.id),
      );
      if (isShelob(enemy)) c.nlrStench = (c.nlrStench ?? 0) + 1;
      log(
        s,
        `Growing Stench: ${defenders.length ? `${defenders.map((x) => name(x)).join(", ")} cannot ready until the end of the round` : "the attack is undefended"}${isShelob(enemy) ? "; if this attack destroys a character, 1 resource is placed on Shelob" : ""}.`,
        "danger",
      );
      return true;
  }
  return false;
}

/** A Nightmare enemy's attack destroyed a character (Under-gate Sentry, Growing Stench). */
function nlrCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (
    !nlrLive(s) ||
    !c ||
    !isCharacter(u) ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId
  )
    return;
  c.nmDestroyed = true;
}
function nlrAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!nlrLive(s) || !combat.nmDestroyed) return [];
  const enemy = get(s, combat.enemyId);
  const p = combat.attackPlayer ?? activeSeat(s);
  const effects: Effect[] = [];
  // Under-gate Sentry: "Forced: After it attacks and destroys a character
  // you control, discard a random card from your hand."
  if (enemy && live(s, enemy, L.sentry))
    effects.push(
      fx("slRandomDiscard", {
        value: 1,
        text: "Under-gate Sentry",
        player: p,
      }),
    );
  if (combat.nlrStench && isShelob(enemy))
    effects.push(
      fx("slFeed", {
        value: combat.nlrStench,
        text: "Growing Stench",
        player: firstPlayer(s),
      }),
    );
  return effects;
}
/** Impenetrable Dark's and Growing Stench's readying prohibitions. */
const nlrCannotPlayerReady = (s: GameState) =>
  nlrLive(s) && s.nightmare?.shelobDark === s.round;
const nlrCannotReady = (s: GameState, u: Unit) =>
  nlrLive(s) &&
  s.nightmare?.shelobNoReady?.round === s.round &&
  s.nightmare.shelobNoReady.ids.includes(u.id);
function nlrRoundEnd(s: GameState): Effect[] {
  const q = s.nightmare;
  if (q) {
    delete q.shelobDark;
    delete q.shelobNoReady;
  }
  return [];
}

// ------------------------------------------------------------- effects

export function nightmareShelobEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nlr")) return false;
  if (!nlrLive(s)) return true;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "nlrDarkQuest": {
      const questing = [...s.heroes, ...s.allies].filter(
        (x) => isCharacter(x) && x.committed,
      );
      if (!questing.length) {
        log(
          s,
          `Impenetrable Dark: ${who(s, p)} ${verb(s, "control")} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `Impenetrable Dark · Remove a character you control from the quest${seatLabel(s, p)}`,
        questing.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("nlrDarkRemove", { target: x.id, player: p })],
        })),
        "When Revealed: Each player removes a character he controls from the quest and exhausts that character.",
      );
      return true;
    }
    case "nlrDarkRemove": {
      const x = e.target ? get(s, e.target) : undefined;
      if (!x) return true;
      removeFromQuest(s, x);
      if (!x.exhausted) exhaustCharacter(s, x);
      log(
        s,
        `Impenetrable Dark: ${name(x)} is removed from the quest and exhausted.`,
        "danger",
      );
      return true;
    }
    case "nlrDarkShadow": {
      const ready = [...s.heroes, ...s.allies].filter(
        (x) => isCharacter(x) && !x.exhausted,
      );
      if (!ready.length) {
        log(
          s,
          `Impenetrable Dark: ${who(s, p)} ${verb(s, "control")} no ready character.`,
        );
        return true;
      }
      choose(
        s,
        `Impenetrable Dark · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("nlrDarkExhaust", { target: x.id, player: p })],
        })),
        "Shadow: Exhaust a character you control. Until the end of the round, that character cannot ready.",
      );
      return true;
    }
    case "nlrDarkExhaust": {
      const x = e.target ? get(s, e.target) : undefined;
      if (!x) return true;
      exhaustCharacter(s, x);
      noReady(s, [x.id]);
      log(
        s,
        `Impenetrable Dark: ${name(x)} is exhausted and cannot ready until the end of the round.`,
        "danger",
      );
      return true;
    }
    case "nlrSentryShadow": {
      const options: Option[] = [];
      if (s.hand.length)
        options.push({
          id: "discard",
          label: "Discard a random card from your hand",
          effects: [
            fx("slRandomDiscard", {
              value: 1,
              text: "Under-gate Sentry",
              player: p,
            }),
          ],
        });
      for (const x of [...s.heroes, ...s.allies].filter(
        (y) => isCharacter(y) && !y.exhausted,
      ))
        options.push({
          id: x.id,
          code: x.code,
          label: `Exhaust ${name(x)}`,
          effects: [
            fx("slExhaust", {
              target: x.id,
              text: "Under-gate Sentry",
              player: p,
            }),
          ],
        });
      if (!options.length) {
        log(
          s,
          `Under-gate Sentry: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand and no ready character.`,
        );
        return true;
      }
      choose(
        s,
        `Under-gate Sentry · Choose one${seatLabel(s, p)}`,
        options,
        "Shadow: Either discard a random card from your hand, or exhaust a character you control.",
      );
      return true;
    }
    case "nlrMinasOrc": {
      const orc = s.staging.find((x) => x.id === e.target);
      const options: Option[] = [];
      if (s.hand.length)
        options.push({
          id: "discard",
          label: "Discard a random card from your hand",
          effects: [
            fx("slRandomDiscard", {
              value: 1,
              text: "Orc of Minas Morgul",
              player: p,
            }),
          ],
        });
      if (orc)
        options.push({
          id: "engage",
          label:
            "Engage Orc of Minas Morgul and reveal an additional encounter card",
          effects: [fx("nlrMinasEngage", { target: orc.id, player: p })],
        });
      if (!options.length) {
        log(
          s,
          "Orc of Minas Morgul: there is no card in hand to discard and the Orc has left the staging area.",
        );
        return true;
      }
      choose(
        s,
        `Orc of Minas Morgul · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: Either discard a random card from your hand, or engage Orc of Minas Morgul and reveal an additional encounter card.",
      );
      return true;
    }
    case "nlrMinasEngage": {
      const orc = s.staging.find((x) => x.id === e.target);
      if (orc) {
        log(
          s,
          `Orc of Minas Morgul: ${who(s, p)} ${verb(s, "engage")} it and ${verb(s, "reveal")} an additional encounter card.`,
          "danger",
        );
        engage(s, orc);
      }
      prepend(s, fx("reveal", { player: p }));
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_SHELOB_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  combatEndShadows: nlrCombatEndShadows,
  travelProblem: nlrTravelProblem,
  travelEffects: nlrTravelEffects,
  stats: nlrStats,
  threatBonus: nlrThreatBonus,
  locationQuestBonus: nlrLocationQuestBonus,
  explored: nlrExplored,
  cardEntered: nlrCardEntered,
  enemyAttackStarted: nlrEnemyAttackStarted,
  characterDestroyed: nlrCharacterDestroyed,
  attackFinished: nlrAttackFinished,
  cannotPlayerReady: nlrCannotPlayerReady,
  cannotReady: nlrCannotReady,
  roundEnd: nlrRoundEnd,
  encounter: nlrEncounter,
  shadow: nlrShadow,
  effect: nightmareShelobEffect,
  sharedEffect: () => false,
};

/** The Nightmare state a save restores (docs/NIGHTMARE.md). */
export function validNightmareShelob(s: GameState) {
  const q = s.nightmare;
  if (q?.shelobDark === undefined && q?.shelobNoReady === undefined)
    return true;
  const round = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    nlrLive(s) &&
    (q.shelobDark === undefined || round(q.shelobDark)) &&
    (q.shelobNoReady === undefined ||
      (!!q.shelobNoReady &&
        round(q.shelobNoReady.round) &&
        Array.isArray(q.shelobNoReady.ids) &&
        q.shelobNoReady.ids.every((id) => typeof id === "string")))
  );
}
