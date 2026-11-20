/**
 * Celebrimbor's Secret's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (progress that would be placed on a location in the staging area is
 * reduced to 1; its own Scour effect deals 1 damage to a location in play)
 * and its Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/celebrimbor.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's Scour effects, location damage and The Orcs'
 * Search serve the Nightmare cards. Effects use the "ncs" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random } from "./core";
import { discardHandCard } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { celebrimborSearchCount, celebrimborUnderSearch } from "./celebrimbor";
import { CELEBRIMBOR as C } from "./celebrimbor-support";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareCelebState {
  /** Bellach's Bodyguard's shadow: enemies that cannot take damage until the end of the phase. */
  celebNoDamage?: { id: string; round: number; phase: string }[];
  /** Hateful Search: each copy's phase, in which each damaged location gets +1 [threat]. */
  celebHateful?: { round: number; phase: string }[];
  /** Sauron's Agent: Bellach's attacks under way, and the characters they have destroyed. */
  celebAgent?: { enemy: string; count: number };
}

const csLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "celebrimbors-secret";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const ostInEdhil = (u: Unit) =>
  isLocation(u) && /\bOst-in-Edhil\b/.test(card(u.code).traits ?? "");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
const inPlay = (s: GameState, u: Unit) =>
  [...s.staging, ...allActiveLocations(s), ...allEngaged(s)].some(
    (x) => x.id === u.id,
  );
const bellach = (s: GameState) =>
  enemiesInPlay(s).find((u) => u.code === C.bellach);
/** The Nightmare cards with a Scour effect. */
const SCOUR: readonly string[] = [N.snuffler, N.bodyguard, N.dusty];
/** The Nightmare encounter cards with When Revealed effects. */
const REVEALED: readonly string[] = [N.snuffler, N.hateful, N.agent, N.closing];

// ------------------------------------------------------------- the setup card

/** "Forced: When any amount of progress would be placed on a location in the staging area, reduce that amount to 1." */
const csLocationProgressAmount = (s: GameState, u: Unit, amount: number) =>
  csLive(s) && amount > 1 && s.staging.some((x) => x.id === u.id) ? 1 : amount;
/** The Nightmare Scour cards; from the encounter discard pile (City Remains), only Little Snuffler's can resolve. */
const csScourCodes = (s: GameState, fromDiscard?: boolean) =>
  !csLive(s) ? [] : fromDiscard ? [N.snuffler] : SCOUR;
/** The setup card: "Scour: Deal 1 damage to a location in play." */
const csScourEffects = (s: GameState): Effect[] =>
  csLive(s)
    ? [fx("celebScour", { code: N.celebCard, player: firstPlayer(s) })]
    : [];

// ------------------------------------------------------------- the cards

/** Bones of Hollin: "Forced: After any amount of damage is placed on Bones of Hollin, raise each player's threat by that amount." */
function csLocationDamaged(s: GameState, u: Unit, amount: number) {
  if (!csLive(s) || amount <= 0 || !live(s, u, N.bones)) return;
  log(
    s,
    `Bones of Hollin: ${amount} damage raises each player's threat by ${amount}.`,
    "danger",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("heirsThreat", { value: amount, player }),
    ),
  );
}
/**
 * Dusty Labyrinth: "+1 [threat] for each damage on it." Hateful Search:
 * "Until the end of the phase, each damaged location gets +1 [threat]."
 */
function csThreatBonus(s: GameState, u: Unit) {
  if (!csLive(s) || !isLocation(u)) return 0;
  const hateful = u.damage
    ? (s.nightmare?.celebHateful ?? []).filter(
        (x) => x.round === s.round && x.phase === phaseKey(s),
      ).length
    : 0;
  return (live(s, u, N.dusty) ? u.damage : 0) + hateful;
}
/**
 * Bellach's Bodyguard: "Bellach cannot take damage." Its shadow: "Attacking
 * enemy cannot take damage until the end of the phase."
 */
function csDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!csLive(s) || amount <= 0) return amount;
  if (
    u.code === C.bellach &&
    enemiesInPlay(s).some((e) => live(s, e, N.bodyguard))
  ) {
    log(s, "Bellach's Bodyguard: Bellach cannot take damage.");
    return 0;
  }
  if (
    (s.nightmare?.celebNoDamage ?? []).some(
      (x) => x.id === u.id && x.round === s.round && x.phase === phaseKey(s),
    )
  ) {
    log(s, `${name(u)} cannot take damage until the end of the phase.`);
    return 0;
  }
  return amount;
}
/** Sauron's Agent: count each character Bellach's attacks destroy. */
function csCharacterDestroyed(s: GameState, _u: Unit, context: DamageContext) {
  const a = s.nightmare?.celebAgent;
  if (csLive(s) && a && context.combatDamage && context.enemyId === a.enemy)
    a.count++;
}
/**
 * Bones of Hollin: "Travel: Place 2 damage on an Ost-in-Edhil location in
 * play to travel here." Dusty Labyrinth: "Travel: The first player must
 * place a card from his hand facedown underneath The Orcs' Search to travel
 * here."
 */
function csTravelProblem(s: GameState, u: Unit) {
  if (!csLive(s)) return null;
  if (live(s, u, N.bones) && !locationsInPlay(s).some(ostInEdhil))
    return "Bones of Hollin requires 2 damage on an Ost-in-Edhil location in play.";
  if (live(s, u, N.dusty) && !seatView(s, firstPlayer(s)).hand.length)
    return "Dusty Labyrinth requires the first player to place a card from their hand underneath The Orcs' Search.";
  return null;
}
function csTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!csLive(s)) return undefined;
  if (live(s, u, N.bones))
    return [fx("ncsBonesTravel", { player: firstPlayer(s) })];
  if (live(s, u, N.dusty))
    return [fx("ncsDustyTravel", { player: firstPlayer(s) })];
  return undefined;
}

function csEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!csLive(s) || !REVEALED.includes(code)) return false;
  const first = firstPlayer(s);
  if (code === N.snuffler) {
    // Little Snuffler (already in the staging area): "When Revealed: Trigger
    // Little Snuffler's Scour effect."
    if (fromReveal) {
      const snuffler = [...s.staging].reverse().find((u) => u.code === code);
      prepend(
        s,
        fx("celebScour", { code, target: snuffler?.id, player: first }),
      );
    }
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.closing) {
    // Closing In: "Place Closing In facedown underneath The Orcs' Search."
    // Its surge is printed.
    celebrimborUnderSearch(s, make(s, code));
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.hateful) {
    // Hateful Search: "Deal 1 damage to each location in the staging area.
    // Until the end of the phase, each damaged location gets +1 [threat]. If
    // there are no locations in the staging area, Hateful Search gains
    // surge."
    const staged = s.staging.filter(isLocation);
    const q = (s.nightmare ??= {});
    q.celebHateful = [
      ...(q.celebHateful ?? []).filter((x) => x.round === s.round),
      { round: s.round, phase: phaseKey(s) },
    ];
    if (!staged.length)
      log(
        s,
        "Hateful Search: no location is in the staging area; it gains surge.",
        "danger",
      );
    prepend(
      s,
      ...(staged.length
        ? staged.map((l) =>
            fx("celebLocationDamage", {
              target: l.id,
              value: 1,
              player: first,
            }),
          )
        : surgeEffects(code)),
    );
    return true;
  }
  // Sauron's Agent: "Bellach makes an immediate attack against each player
  // in turn order. Then, deal 1 damage to the active location for each
  // character destroyed by this effect."
  const boss = bellach(s);
  if (!boss) {
    log(s, "Sauron's Agent: Bellach is not in play.");
    return true;
  }
  (s.nightmare ??= {}).celebAgent = { enemy: boss.id, count: 0 };
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("immediateAttack", { target: boss.id, player }),
    ),
    fx("ncsAgentDone", { player: first }),
  );
  return true;
}

function csShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !csLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  const defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  switch (code) {
    // Bellach's Bodyguard: "Attacking enemy cannot take damage until the end
    // of the phase."
    case N.bodyguard: {
      const q = (s.nightmare ??= {});
      q.celebNoDamage = [
        ...(q.celebNoDamage ?? []).filter((x) => x.round === s.round),
        { id: c.enemyId, round: s.round, phase: phaseKey(s) },
      ];
      return true;
    }
    // Hateful Search: "Defending player discards a non-objective attachment
    // he controls." (Spies from Mordor's shadow)
    case N.hateful:
      prepend(s, fx("celebDiscardAttachment", { player: attacked }));
      return true;
    // Sauron's Agent: "Deal 1 damage to the defending character."
    case N.agent:
      prepend(
        s,
        ...defenders.flatMap((target) => {
          const u = get(s, target);
          return u
            ? [fx("damage", { target, value: 1, player: ownerOf(s, u) })]
            : [];
        }),
      );
      return true;
    // Closing In: "Attacking enemy gets +1 [attack] for each card underneath
    // The Orcs' Search."
    case N.closing:
      c.attackBonus += celebrimborSearchCount(s);
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

/** Damage to one location, by a chosen location among several. */
function damageOne(
  s: GameState,
  title: string,
  targets: Unit[],
  value: number,
  p: number,
  more: Effect[] = [],
) {
  const hit = (l: Unit) => [
    fx("celebLocationDamage", { target: l.id, value, player: p }),
    ...more,
  ];
  if (targets.length === 1) {
    prepend(s, ...hit(targets[0]));
    return;
  }
  // The Secret Chamber, whose loss ends the game, is offered last.
  const ordered = [
    ...targets.filter((l) => l.code !== C.chamber),
    ...targets.filter((l) => l.code === C.chamber),
  ];
  choose(
    s,
    title,
    ordered.map((l): Option => ({
      id: l.id,
      code: l.code,
      label: `${name(l)} · ${l.damage}/${card(l.code).quest ?? 0} damage`,
      effects: hit(l),
    })),
  );
}

export function nightmareCelebEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  // The Nightmare Deck's Scour effects (in the scenario's Scour order).
  if (e.kind === "celebScour" && csLive(s)) {
    const fromDiscard = e.source?.startsWith("discard:");
    switch (e.code) {
      case N.celebCard: {
        const targets = locationsInPlay(s);
        if (!targets.length) return true;
        log(
          s,
          "Celebrimbor's Secret · Nightmare: Scour deals 1 damage to a location in play.",
          "danger",
        );
        damageOne(
          s,
          "Celebrimbor's Secret · Scour: deal 1 damage to a location in play",
          targets,
          1,
          p,
        );
        return true;
      }
      case N.snuffler:
        prepend(s, fx("ncsSnuffler", { player: firstPlayer(s) }));
        return true;
      case N.bodyguard:
        if (!fromDiscard && u && inPlay(s, u) && u.damage)
          prepend(s, fx("heal", { target: u.id, value: u.damage, player: p }));
        return true;
      case N.dusty:
        if (!fromDiscard && u && locationsInPlay(s).some((l) => l.id === u.id))
          prepend(
            s,
            fx("celebLocationDamage", { target: u.id, value: 2, player: p }),
          );
        return true;
    }
    return false;
  }
  if (!e.kind.startsWith("ncs")) return false;
  switch (e.kind) {
    case "ncsSnuffler": {
      // Little Snuffler: "Scour: The first player discards a random card
      // from his hand and assigns X damage among locations in the staging
      // area. X is the discarded card's cost."
      if (!s.hand.length) {
        log(
          s,
          `Little Snuffler${seatLabel(s, p)}: no card in hand to discard.`,
        );
        return true;
      }
      const pick = s.hand[Math.floor(random(s) * s.hand.length)];
      const cost = Number(card(pick.code).cost);
      const x = Number.isFinite(cost) && cost > 0 ? cost : 0;
      discardHandCard(s, pick.id, { encounterEffect: true });
      log(
        s,
        `Little Snuffler${seatLabel(s, p)}: ${name(pick)} is discarded at random; ${x} damage among the staging area's locations.`,
        "danger",
      );
      if (x) prepend(s, fx("ncsAssign", { value: x, player: p }));
      return true;
    }
    case "ncsAssign": {
      const left = e.value ?? 0;
      const targets = s.staging.filter(isLocation);
      if (left <= 0 || !targets.length) return true;
      damageOne(
        s,
        `Little Snuffler · Assign ${left} damage among locations in the staging area`,
        targets,
        1,
        p,
        left > 1 ? [fx("ncsAssign", { value: left - 1, player: p })] : [],
      );
      return true;
    }
    case "ncsAgentDone": {
      const count = s.nightmare?.celebAgent?.count ?? 0;
      if (s.nightmare) delete s.nightmare.celebAgent;
      if (count) {
        log(
          s,
          `Sauron's Agent: ${count} ${count === 1 ? "character" : "characters"} destroyed; the active location takes ${count} damage.`,
          "danger",
        );
        prepend(s, fx("celebActiveDamage", { value: count, player: p }));
      }
      return true;
    }
    case "ncsBonesTravel":
      damageOne(
        s,
        "Bones of Hollin · Travel: place 2 damage on an Ost-in-Edhil location in play",
        locationsInPlay(s).filter(ostInEdhil),
        2,
        p,
      );
      return true;
    case "ncsDustyTravel": {
      if (!s.hand.length) return true;
      choose(
        s,
        `Dusty Labyrinth · Travel: place a card from your hand underneath The Orcs' Search${seatLabel(s, p)}`,
        s.hand.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("ncsUnderSearch", { target: h.id, player: p })],
        })),
        card(N.dusty).text,
      );
      return true;
    }
    case "ncsUnderSearch": {
      const i = s.hand.findIndex((h) => h.id === e.target);
      if (i < 0) return true;
      const [h] = s.hand.splice(i, 1);
      celebrimborUnderSearch(s, { ...h, owner: h.owner ?? p });
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_CELEB_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  locationProgressAmount: csLocationProgressAmount,
  scourCodes: csScourCodes,
  scourEffects: csScourEffects,
  locationDamaged: csLocationDamaged,
  threatBonus: csThreatBonus,
  damageAmount: csDamageAmount,
  characterDestroyed: csCharacterDestroyed,
  travelProblem: csTravelProblem,
  travelEffects: csTravelEffects,
  encounter: csEncounter,
  shadow: csShadow,
  effect: nightmareCelebEffect,
  sharedEffect: (e) => ["ncsAgentDone"].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareCeleb(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.celebNoDamage === undefined ||
      (Array.isArray(q.celebNoDamage) &&
        q.celebNoDamage.every(
          (x) =>
            !!x &&
            typeof x.id === "string" &&
            n(x.round) &&
            typeof x.phase === "string",
        ))) &&
    (q?.celebHateful === undefined ||
      (Array.isArray(q.celebHateful) &&
        q.celebHateful.every(
          (x) => !!x && n(x.round) && typeof x.phase === "string",
        ))) &&
    (q?.celebAgent === undefined ||
      (!!q.celebAgent &&
        typeof q.celebAgent.enemy === "string" &&
        n(q.celebAgent.count)))
  );
}

/** The Nightmare Deck's Ost-in-Edhil locations a save's setup may hold. */
export const celebNightmareLocations = (s: GameState): readonly string[] =>
  s.nightmareMode && s.scenarioId === "celebrimbors-secret"
    ? [N.bones, N.dusty]
    : [];
