/**
 * Shadow and Flame's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * Balrog deck (the 10 Attack cards, from which Durin's Bane is dealt its
 * shadow cards, with its own discard pile, reshuffled at the beginning of each
 * combat phase or when it runs out) and its Nightmare encounter cards,
 * composed with the scenario's own rules through batch4Scenario while a
 * Nightmare mode game is played. Effects use the "nsf" prefix.
 */
import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, shuffle, stats, units } from "./core";
import {
  discardAttachment,
  discardHandCard,
  exhaustCharacter,
  revealed,
} from "./board";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
} from "./table";
import { SHADOW_FLAME as S } from "./shadow-flame-support";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;
type Mark = {
  enemyId: string;
  kind: "captain" | "stairs" | "bidding";
  player: number;
};

export interface NightmareShadowFlameState {
  /** The Balrog deck (the Attack cards Durin's Bane is dealt) and its discard pile. */
  balrogDeck?: string[];
  balrogDiscard?: string[];
  /** Terrible Strength's attack: the attacking enemy. */
  terrible?: string;
  /** The Dark Fire's attack: the attacking enemy (Durin's Bane). */
  darkFire?: string;
  /** "If this attack destroys a character" shadows waiting on their attack. */
  destroyMarks?: Mark[];
  /** Morgoth's Bidding: Durin's Bane's additional attacks after these attacks, by enemy and defending player. */
  bidding?: { enemyId: string; player: number }[];
}

const sfLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "shadow-and-flame";
const isBane = (u: Unit) => u.code === S.bane && !u.blanked;
const bane = (s: GameState) => units(s).find((u) => u.code === S.bane);
const attackCard = (code: string) => traitOf(code, "Attack");

// ------------------------------------------------------------- the Balrog deck

/** Balrog cards discarded with Durin's Bane's shadows go to the Balrog discard pile. */
function sweep(s: GameState) {
  const q = s.nightmare;
  if (!q?.balrogDeck || !s.encounterDiscard.some(attackCard)) return;
  q.balrogDiscard = [
    ...(q.balrogDiscard ?? []),
    ...s.encounterDiscard.filter(attackCard),
  ];
  s.encounterDiscard = s.encounterDiscard.filter((c) => !attackCard(c));
}
function reshuffle(s: GameState) {
  const q = s.nightmare;
  if (!q?.balrogDeck || !q.balrogDiscard?.length) return;
  q.balrogDeck = shuffle(s, [...q.balrogDeck, ...q.balrogDiscard]);
  q.balrogDiscard = [];
  log(s, "The Balrog discard pile is shuffled back into the Balrog deck.");
}
/**
 * "When Durin's Bane would be dealt a shadow card, deal it from the Balrog
 * deck instead of the encounter deck." ("or if the Balrog deck runs out of
 * cards, shuffle the Balrog discard pile back into the Balrog deck")
 */
function sfShadowDraw(s: GameState, u: Unit) {
  if (!sfLive(s) || !isBane(u) || !s.nightmare?.balrogDeck) return undefined;
  sweep(s);
  if (!s.nightmare.balrogDeck.length) reshuffle(s);
  return s.nightmare.balrogDeck.shift() ?? null;
}
/** "At the beginning of each combat phase ... shuffle the Balrog discard pile back into the Balrog deck." */
function sfCombatBegin(s: GameState) {
  if (!sfLive(s)) return;
  sweep(s);
  reshuffle(s);
}
function sfCheck(s: GameState) {
  if (sfLive(s)) sweep(s);
}

// ------------------------------------------------------------- the cards

/** Servant of Flame: "Forced: While Durin's Bane has no damage, Servant of Flame gets +2 [attack] and +2 [defense]." */
function sfStats(s: GameState, u: Unit) {
  if (!sfLive(s) || !live(s, u, D.servant)) return {};
  const b = bane(s);
  return b && !b.damage ? { attack: 2, defense: 2 } : {};
}
/** Captain of Mordor: "Each enemy gets -20 engagement cost." */
const sfEngagementBonus = (s: GameState) =>
  sfLive(s)
    ? -20 *
      [...s.staging, ...allEngaged(s)].filter((x) => live(s, x, D.captain))
        .length
    : 0;
/** Fiery Depths: "Progress cannot be placed on Fiery Depths while it is in the staging area." */
const sfLocationProgressBlocked = (s: GameState, u: Unit) =>
  sfLive(s) && live(s, u, D.fiery) && s.staging.some((x) => x.id === u.id);
/** Fiery Depths: "Travel: Each player must move 1 damage from Durin's Bane to a hero to travel here." */
function sfTravelProblem(s: GameState, u: Unit) {
  if (!sfLive(s) || !live(s, u, D.fiery)) return null;
  const b = bane(s),
    n = playerOrder(s).length;
  return !b || b.damage < n
    ? `Fiery Depths: each player must move 1 damage from Durin's Bane to a hero (it has ${b?.damage ?? 0}).`
    : null;
}
const sfTravelEffects = (s: GameState, u: Unit) =>
  sfLive(s) && live(s, u, D.fiery)
    ? playerOrder(s).map((player) => fx("nsfFiery", { player }))
    : undefined;
/** Crumbling Stairs: "While Crumbling Stairs is in the staging area, event cards cost 1 additional matching resource to play from hand." */
const sfPlayCostReduction = (s: GameState, c: Card) =>
  sfLive(s) && c.type_code === "event"
    ? -s.staging.filter((l) => live(s, l, D.stairs)).length
    : 0;
/** Blazing Grip: "Cannot be canceled." */
const sfCannotCancel = (s: GameState, shadow?: boolean, code?: string) =>
  sfLive(s) && !!shadow && code === D.grip;

/**
 * Terrible Strength: "For each excess point of combat damage dealt by this
 * attack ... you must damage another character you control. Exhaust all
 * characters damaged from this effect." The Dark Fire: "For each point of
 * damage dealt by this attack, heal 1 damage from Durin's Bane."
 */
function sfDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const q = s.nightmare;
  if (!sfLive(s) || !q || value <= 0 || !context.combatDamage) return;
  if (
    q.terrible &&
    context.enemyId === q.terrible &&
    allCharacters(s).some((c) => c.id === u.id)
  ) {
    const excess = Math.min(value, u.damage - stats(s, u).health);
    if (excess > 0) {
      log(
        s,
        `Terrible Strength: ${excess} excess ${excess === 1 ? "point" : "points"} of damage to ${name(u)}.`,
        "danger",
      );
      prepend(
        s,
        fx("nsfTerrible", {
          value: excess,
          ids: [],
          source: u.id,
          player: ownerOf(s, u),
        }),
      );
    }
  }
  if (q.darkFire && context.enemyId === q.darkFire) {
    const b = get(s, q.darkFire);
    if (b) {
      const healed = Math.min(value, b.damage);
      b.damage -= healed;
      if (healed)
        log(
          s,
          `The Dark Fire: ${healed} damage is healed from ${name(b)}.`,
          "danger",
        );
    }
  }
}
/** The "If this attack destroys a character" shadows (Captain of Mordor, Crumbling Stairs, Morgoth's Bidding). */
function sfCharacterDestroyed(s: GameState, _u: Unit, context: DamageContext) {
  const q = s.nightmare;
  if (!sfLive(s) || !q?.destroyMarks || !context.combatDamage) return;
  for (const m of q.destroyMarks.filter((m) => m.enemyId === context.enemyId)) {
    const enemy = get(s, m.enemyId);
    if (m.kind === "captain" && enemy) {
      enemy.roundCannotTakeDamage = true;
      log(
        s,
        `Captain of Mordor: ${name(enemy)} cannot take damage this round.`,
        "danger",
      );
    } else if (m.kind === "stairs")
      prepend(s, fx("nsfDiscardEvents", { player: m.player }));
    else if (
      m.kind === "bidding" &&
      !q.bidding?.some((b) => b.enemyId === m.enemyId)
    )
      q.bidding = [
        ...(q.bidding ?? []),
        { enemyId: m.enemyId, player: m.player },
      ];
  }
}
function sfAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  if (!q) return [];
  if (q.terrible === combat.enemyId) delete q.terrible;
  if (q.darkFire === combat.enemyId) delete q.darkFire;
  if (q.destroyMarks) {
    q.destroyMarks = q.destroyMarks.filter((m) => m.enemyId !== combat.enemyId);
    if (!q.destroyMarks.length) delete q.destroyMarks;
  }
  const extra = q.bidding?.find((b) => b.enemyId === combat.enemyId);
  if (!extra) return [];
  q.bidding = q.bidding!.filter((b) => b !== extra);
  if (!q.bidding.length) delete q.bidding;
  const b = get(s, extra.enemyId);
  if (!sfLive(s) || !b) return [];
  log(
    s,
    `Morgoth's Bidding: ${name(b)} makes an additional attack${seatLabel(s, extra.player)}.`,
    "danger",
  );
  return [fx("immediateAttack", { target: b.id, player: extra.player })];
}

function sfShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !sfLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const player = enemy ? ownerOf(s, enemy) : (c.attackPlayer ?? firstPlayer(s));
  const defending = c.attackPlayer ?? player;
  const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
  const q = (s.nightmare ??= {});
  const mark = (kind: Mark["kind"]) => {
    if (enemy)
      q.destroyMarks = [
        ...(q.destroyMarks ?? []),
        { enemyId: enemy.id, kind, player: defending },
      ];
  };
  switch (code) {
    case D.terrible:
      if (enemy) q.terrible = enemy.id;
      return true;
    case D.darkFire:
      if (enemy) q.darkFire = enemy.id;
      return true;
    // Blazing Grip: "Discard all cards attached to the defending character
    // and deal it 1 damage."
    case D.grip:
      if (defender) {
        for (const a of [...defender.attachments])
          discardAttachment(s, defender, a);
        log(
          s,
          `Blazing Grip: ${name(defender)}'s attachments are discarded, and it takes 1 damage.`,
          "danger",
        );
        prepend(
          s,
          fx("damage", {
            target: defender.id,
            value: 1,
            player: ownerOf(s, defender),
          }),
        );
      }
      return true;
    case D.bidding:
      mark("bidding");
      return true;
    // Flame of Udún: "Deal Durin's Bane 3 additional shadow cards from the
    // encounter deck (not the Balrog deck)."
    case D.udun: {
      const b = enemy && isBane(enemy) ? enemy : bane(s);
      if (b) prepend(s, fx("khazadExtraShadows", { target: b.id, count: 3 }));
      return true;
    }
    // Servant of Flame: "Search the encounter deck for a treachery card with
    // the Shadow or Flame trait and reveal it, if able. Shuffle the encounter
    // deck."
    case D.servant: {
      const i = s.encounterDeck.findIndex(
        (x) =>
          card(x).type_code === "treachery" &&
          (traitOf(x, "Shadow") || traitOf(x, "Flame")),
      );
      const found = i >= 0 ? s.encounterDeck.splice(i, 1)[0] : undefined;
      shuffle(s, s.encounterDeck);
      if (found) {
        log(s, `Servant of Flame reveals ${card(found).name}.`, "danger");
        revealed(s, found);
      } else
        log(
          s,
          "Servant of Flame: no treachery with the Shadow or Flame trait.",
        );
      return true;
    }
    case D.captain:
      mark("captain");
      return true;
    case D.stairs:
      mark("stairs");
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareShadowFlameEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nsf")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nsfTerrible": {
      const left = e.value ?? 0,
        ids = e.ids ?? [];
      const others = [...s.heroes, ...s.allies].filter(
        (c) => c.id !== e.source,
      );
      if (left <= 0 || !others.length) {
        for (const id of [...new Set(ids)]) {
          const c = get(s, id);
          if (c) exhaustCharacter(s, c);
        }
        if (ids.length)
          log(
            s,
            `Terrible Strength: the characters it damaged are exhausted${seatLabel(s, p)}.`,
          );
        return true;
      }
      choose(
        s,
        `Terrible Strength · Damage another character you control (${left} left)${seatLabel(s, p)}`,
        others.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [
            fx("damage", { target: c.id, value: 1, player: p }),
            fx("nsfTerrible", {
              value: left - 1,
              ids: [...ids, c.id],
              source: e.source,
              player: p,
            }),
          ],
        })),
        card(D.terrible).shadow,
      );
      return true;
    }
    case "nsfFiery": {
      const own = s.heroes;
      if (!own.length) return true;
      choose(
        s,
        `Fiery Depths · Move 1 damage from Durin's Bane to a hero${seatLabel(s, p)}`,
        own.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("nsfFieryTo", { target: h.id, player: p })],
        })),
        card(D.fiery).text,
      );
      return true;
    }
    case "nsfFieryTo": {
      const b = bane(s),
        h = get(s, e.target);
      if (!b || !h || b.damage <= 0) return true;
      b.damage -= 1;
      h.damage += 1;
      log(s, `Fiery Depths: 1 damage moves from ${name(b)} to ${name(h)}.`);
      return true;
    }
    case "nsfDiscardEvents": {
      const events = s.hand.filter((h) => card(h.code).type_code === "event");
      for (const h of events)
        discardHandCard(s, h.id, { encounterEffect: true });
      log(
        s,
        `Crumbling Stairs: ${events.length} event ${events.length === 1 ? "card is" : "cards are"} discarded${seatLabel(s, p)}.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nsfTerrible",
  "nsfFiery",
  "nsfFieryTo",
  "nsfDiscardEvents",
]);
export const NIGHTMARE_SHADOW_FLAME_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  shadowDraw: sfShadowDraw,
  combatBegin: sfCombatBegin,
  check: sfCheck,
  stats: sfStats,
  engagementBonus: sfEngagementBonus,
  locationProgressBlocked: sfLocationProgressBlocked,
  travelProblem: sfTravelProblem,
  travelEffects: sfTravelEffects,
  playCostReduction: sfPlayCostReduction,
  cannotCancel: sfCannotCancel,
  damageDealt: sfDamageDealt,
  characterDestroyed: sfCharacterDestroyed,
  attackFinished: sfAttackFinished,
  shadow: sfShadow,
  effect: nightmareShadowFlameEffect,
  sharedEffect: (e) => e.kind.startsWith("nsf") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

const BALROG: string[] = [D.terrible, D.darkFire, D.grip, D.bidding, D.udun];
export function validNightmareShadowFlame(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const codes = (v: unknown) =>
    Array.isArray(v) &&
    v.every((c) => typeof c === "string" && BALROG.includes(c));
  return (
    (q.balrogDeck === undefined || codes(q.balrogDeck)) &&
    (q.balrogDiscard === undefined || codes(q.balrogDiscard)) &&
    (q.terrible === undefined || typeof q.terrible === "string") &&
    (q.darkFire === undefined || typeof q.darkFire === "string") &&
    (q.destroyMarks === undefined ||
      (Array.isArray(q.destroyMarks) &&
        q.destroyMarks.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            ["captain", "stairs", "bidding"].includes(m.kind) &&
            Number.isInteger(m.player) &&
            m.player >= 0,
        ))) &&
    (q.bidding === undefined ||
      (Array.isArray(q.bidding) &&
        q.bidding.every(
          (b) =>
            !!b &&
            typeof b.enemyId === "string" &&
            Number.isInteger(b.player) &&
            b.player >= 0,
        )))
  );
}
