/**
 * The Ring Goes South's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (as the players advance to stage 4B, each player puts a set-aside
 * Pale-green Tentacle into play engaged with them) and its Nightmare
 * encounter cards, composed with the scenario's own rules
 * (src/game/ring-south.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's damage on locations, its 2 active locations at
 * stage 4 and its Watcher in the Water serve the Nightmare cards. Effects use
 * the "nrs" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
} from "./core";
import {
  allyEntryResponses,
  engage,
  enemyAddedToStaging,
  enterEnemyEngaged,
  exhaustCharacter,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { consideredEngaged } from "./considered-engagement";
import { returnToStaging, who } from "./black-riders-hunted";
import { RS } from "./ring-south-support";
import { batch4Scenario } from "./batch4-scenarios";
import { NIGHTMARE_TRD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareRingSouthState {
  /** Shelterless Land: each resolved copy's round and phase, while each damage on each active location adds 1 [threat] to the staging area. */
  southShelter?: { round: number; phase: string }[];
  /** Misty Mountain Warg: the enemy whose "when revealed" immediate attack is about to begin. */
  southWarg?: string;
}

type Combat = NonNullable<GameState["combat"]>;

const rsLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-ring-goes-south";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
/** The Pale-green Tentacles in play. */
const tentacles = (s: GameState) =>
  enemiesInPlay(s).filter((u) => live(s, u, N.tentacle));
/** "Each damage on each active location." */
const activeDamage = (s: GameState) =>
  allActiveLocations(s).reduce((n, l) => n + l.damage, 0);
/**
 * "Place X damage on an active location" (the first player chooses between
 * two, as for the scenario's own cards), or on each active location.
 */
const locationDamage = (
  text: string,
  player: number,
  each = false,
  value = 1,
) => fx("rgsLocationDamage", { text, flag: each, value, player });

// ------------------------------------------------------------- the setup card

/**
 * "Forced: When the players advance to stage 4B, each player puts 1 copy of
 * Pale-green Tentacle into play engaged with him. Shuffle any remaining
 * copies, and the encounter discard pile, into the encounter deck."
 */
function rsStageRevealed(s: GameState, stage: number) {
  if (rsLive(s) && stage === 4)
    prepend(s, fx("nrsTentacles", { player: firstPlayer(s) }));
}

// ------------------------------------------------------------- the cards

/** Pale-green Tentacle: "Cannot have attachments." Hunting Hawk: "Cannot have attachments." */
const rsCannotAttach = (s: GameState, u: Unit) =>
  rsLive(s) && (live(s, u, N.tentacle) || live(s, u, N.hawk));
/** Hunting Hawk: "Cannot ... be optionally engaged." */
const rsCannotOptionallyEngage = (s: GameState, u: Unit) =>
  rsLive(s) && live(s, u, N.hawk);
/** Pale-green Tentacle: "Watcher in the Water cannot take damage." */
const rsDamageAmount = (s: GameState, u: Unit, amount: number) =>
  rsLive(s) && live(s, u, RS.watcher) && tentacles(s).length ? 0 : amount;
/** Expanse of Hollin: "X is 1 more than the number of enemies in play." (Its printed [threat] is X.) */
const rsThreatBonus = (s: GameState, u: Unit) =>
  rsLive(s) && live(s, u, N.expanse) ? 1 + enemiesInPlay(s).length : 0;
/** Shelterless Land: "Until the end of the phase, add 1 to the total [threat] in the staging area for each damage on each active location." */
function rsStagingThreat(s: GameState) {
  if (!rsLive(s)) return 0;
  const copies = (s.nightmare?.southShelter ?? []).filter(
    (x) => x.round === s.round && x.phase === phaseKey(s),
  ).length;
  return copies * activeDamage(s);
}
/**
 * Hunting Hawk, in the staging area: "Forced: After a player plays an ally,
 * he must either exhaust it, or place 1 damage on an active location." (Each
 * copy, before the ally's own responses.)
 */
function rsAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (!rsLive(s) || !played) return false;
  const hawks = s.staging.filter((x) => live(s, x, N.hawk));
  if (!hawks.length) return false;
  const p = ownerOf(s, u);
  prepend(
    s,
    ...hawks.map(() => fx("nrsHawk", { target: u.id, player: p })),
    fx("nrsAllyResume", {
      target: u.id,
      flag: played,
      value: fromHand ? 1 : 0,
      player: p,
    }),
  );
  return true;
}
/** Slopes of Hithaeglir: "Forced: After a 'when revealed' effect is canceled, place 1 damage on each active location." (Each copy in play.) */
function rsWhenRevealedCancelled(s: GameState) {
  if (!rsLive(s) || !allActiveLocations(s).length) return;
  prepend(
    s,
    ...locationsInPlay(s)
      .filter((u) => live(s, u, N.slopes))
      .map(() => locationDamage("Slopes of Hithaeglir", firstPlayer(s), true)),
  );
}
/**
 * Expanse of Hollin: "Forced: When Expanse of Hollin is explored, shuffle the
 * encounter discard pile into the encounter deck. Then, discard the top card
 * of the encounter deck for each damage here. Add each enemy discarded by
 * this effect to the staging area." Slopes of Hithaeglir: "Forced: When
 * Slopes of Hithaeglir is explored, each player raises his threat by 1 for
 * each damage here."
 */
function rsExplored(s: GameState, u: Unit) {
  if (!rsLive(s)) return;
  const p = firstPlayer(s);
  if (live(s, u, N.expanse))
    prepend(s, fx("nrsExpanse", { value: u.damage, player: p }));
  else if (live(s, u, N.slopes) && u.damage > 0)
    prepend(s, fx("nrsSlopes", { value: u.damage, player: p }));
}
/** Misty Mountain Warg's "when revealed" attack: "If it destroys a character, place 2 damage on each active location." */
function rsEnemyAttackStarted(s: GameState, enemy: Unit) {
  const q = s.nightmare;
  const c = s.combat;
  if (!rsLive(s) || !q?.southWarg || q.southWarg !== enemy.id) return;
  if (c?.enemyId !== enemy.id) return;
  c.nmLocationsOnKill = (c.nmLocationsOnKill ?? 0) + 2;
  delete q.southWarg;
}
/**
 * Pale-green Tentacle: "Forced: After Pale-green Tentacle attacks and
 * destroys a character, return Pale-green Tentacle to the staging area."
 * Misty Mountain Warg's attack and its shadow: damage on the active locations
 * if the attack destroys a character.
 */
function rsAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!rsLive(s) || skipped || !c.rgsDestroyed) return [];
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? firstPlayer(s);
  const effects: Effect[] = [];
  if (enemy && live(s, enemy, N.tentacle))
    effects.push(fx("nrsTentacleReturn", { target: enemy.id, player: p }));
  if (c.nmLocationsOnKill)
    effects.push(
      locationDamage("Misty Mountain Warg", p, true, c.nmLocationsOnKill),
    );
  for (let i = 0; i < (c.nmLocationOnKill ?? 0); i++)
    effects.push(locationDamage("Misty Mountain Warg", p));
  return effects;
}

function rsEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!rsLive(s)) return false;
  const p = activeSeat(s);
  if (code === N.warg) {
    // Misty Mountain Warg: "When Revealed: Misty Mountain Warg makes an
    // immediate attack against you."
    if (!fromReveal) return true;
    const warg = [...enemiesInPlay(s)].reverse().find((u) => u.code === code);
    if (warg) prepend(s, fx("nrsWarg", { target: warg.id, player: p }));
    return true;
  }
  if (code !== N.hunted && code !== N.shelterless) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.hunted) {
    prepend(s, fx("nrsHunted", { player: p }));
    return true;
  }
  // Shelterless Land: its surge and doomed 1 are printed.
  const q = (s.nightmare ??= {});
  q.southShelter = [
    ...(q.southShelter ?? []).filter((x) => x.round === s.round),
    { round: s.round, phase: phaseKey(s) },
  ];
  log(
    s,
    `Shelterless Land: until the end of the phase, each damage on each active location adds 1 [threat] to the staging area (${activeDamage(s)} now).`,
    "danger",
  );
  return true;
}

function rsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !rsLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Misty Mountain Warg: "If this attack destroys a character, place 1
    // damage on an active location."
    case N.warg:
      c.nmLocationOnKill = (c.nmLocationOnKill ?? 0) + 1;
      return true;
    // Hunted in Hollin: "Raise your threat by 1 for each enemy engaged with
    // you." (Watcher in the Water is considered engaged with each player.)
    case N.hunted: {
      const engaged = [
        ...seatView(s, p).engaged,
        ...s.staging.filter((x) => isEnemy(x) && consideredEngaged(s, x, p)),
      ].length;
      if (engaged)
        prepend(
          s,
          fx("nrsThreat", { value: engaged, code: N.hunted, player: p }),
        );
      return true;
    }
    // Shelterless Land: "Attacking enemy gets +1 [attack] for each damage on
    // each active location."
    case N.shelterless: {
      const bonus = activeDamage(s);
      c.attackBonus += bonus;
      log(
        s,
        `Shelterless Land: the attacking enemy gets +${bonus} [attack].`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareRingSouthEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrs")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nrsTentacles": {
      const q = s.ringSouth;
      if (!q) return true;
      const engaged: string[] = [];
      for (const player of playerOrder(s)) {
        const i = q.setAside.indexOf(N.tentacle);
        if (i < 0) break;
        q.setAside.splice(i, 1);
        enterEnemyEngaged(s, make(s, N.tentacle), player);
        engaged.push(who(s, player));
      }
      const rest = q.setAside.filter((c) => c === N.tentacle);
      q.setAside = q.setAside.filter((c) => c !== N.tentacle);
      s.encounterDeck.push(...rest, ...s.encounterDiscard);
      s.encounterDiscard = [];
      shuffle(s, s.encounterDeck);
      log(
        s,
        `The Ring Goes South: a Pale-green Tentacle enters play engaged with ${engaged.join(", ") || "no player"}; ${rest.length} other ${rest.length === 1 ? "copy is" : "copies are"} shuffled into the encounter deck with the discard pile.`,
        "danger",
      );
      return true;
    }
    case "nrsTentacleReturn":
      if (u && live(s, u, N.tentacle)) returnToStaging(s, u);
      return true;
    case "nrsHawk": {
      const ally =
        u && allCharacters(s).some((x) => x.id === u.id) ? u : undefined;
      const options: Option[] = [];
      if (ally && !ally.exhausted)
        options.push({
          id: "exhaust",
          code: ally.code,
          label: `Exhaust ${name(ally)}`,
          effects: [fx("nrsHawkExhaust", { target: ally.id, player: p })],
        });
      if (allActiveLocations(s).length)
        options.push({
          id: "damage",
          label: "Place 1 damage on an active location",
          effects: [locationDamage("Hunting Hawk", p)],
        });
      if (!options.length) {
        log(
          s,
          "Hunting Hawk: the ally cannot be exhausted and there is no active location.",
        );
        return true;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Hunting Hawk${seatLabel(s, p)} · Exhaust the ally, or place 1 damage on an active location`,
          options,
          "Forced: after a player plays an ally.",
        ),
      );
      return true;
    }
    case "nrsHawkExhaust":
      if (u && !u.exhausted) {
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
        log(s, `Hunting Hawk: ${name(u)} is exhausted.`, "danger");
      }
      return true;
    case "nrsAllyResume":
      if (u) allyEntryResponses(s, u, !!e.flag, !!e.value, false, false, true);
      return true;
    case "nrsWarg":
      if (!u || !enemiesInPlay(s).some((x) => x.id === u.id)) return true;
      (s.nightmare ??= {}).southWarg = u.id;
      log(
        s,
        `Misty Mountain Warg makes an immediate attack against ${who(s, p)}.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", { target: u.id, player: p }),
        fx("nrsWargDone", { player: p }),
      );
      return true;
    case "nrsWargDone":
      if (s.nightmare) delete s.nightmare.southWarg;
      return true;
    case "nrsHunted": {
      const enemies = s.staging.filter(
        (x) => isEnemy(x) && !batch4Scenario(s).cannotEngage?.(s, x),
      );
      const low = Math.min(...enemies.map((x) => engagementCost(s, x)));
      const lowest = enemies.filter((x) => engagementCost(s, x) === low);
      forOwner(s, p, () =>
        choose(
          s,
          `Hunted in Hollin${seatLabel(s, p)} · Raise your threat by 6, or engage an enemy and reveal an encounter card`,
          [
            {
              id: "threat",
              label: "Raise your threat by 6",
              effects: [
                fx("nrsThreat", { value: 6, code: N.hunted, player: p }),
              ],
            },
            ...lowest.map((x) => ({
              id: x.id,
              code: x.code,
              label: `Engage ${name(x)} (engagement cost ${low}) and reveal an encounter card`,
              effects: [fx("nrsHuntedEngage", { target: x.id, player: p })],
            })),
          ],
          "Peril. Either raise your threat by 6, or engage the lowest engagement cost enemy in the staging area and reveal an encounter card.",
        ),
      );
      return true;
    }
    case "nrsHuntedEngage":
      if (u && s.staging.some((x) => x.id === u.id))
        forOwner(s, p, () => engage(s, u));
      prepend(s, fx("reveal", { player: p }));
      return true;
    case "nrsThreat": {
      const value = e.value ?? 0;
      forOwner(s, p, () => raiseThreat(s, value, "encounter"));
      log(
        s,
        `${card(e.code ?? N.hunted).name}: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${value}.`,
        "danger",
      );
      return true;
    }
    case "nrsExpanse": {
      const count = e.value ?? 0;
      s.encounterDeck.push(...s.encounterDiscard);
      s.encounterDiscard = [];
      shuffle(s, s.encounterDeck);
      const discarded: string[] = [];
      const added: string[] = [];
      for (let i = 0; i < count && s.encounterDeck.length; i++) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "enemy") {
          const x = make(s, code);
          s.staging.push(x);
          enemyAddedToStaging(s, x);
          added.push(card(code).name);
        } else {
          s.encounterDiscard.push(code);
          discarded.push(card(code).name);
        }
      }
      log(
        s,
        `Expanse of Hollin: the encounter discard pile is shuffled into the encounter deck${count ? `, then ${count} card${count === 1 ? " is" : "s are"} discarded from its top${discarded.length ? ` (${discarded.join(", ")})` : ""}${added.length ? `; ${added.join(", ")} ${added.length === 1 ? "is" : "are"} added to the staging area` : ""}` : ""}.`,
        "danger",
      );
      return true;
    }
    case "nrsSlopes": {
      const value = e.value ?? 0;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, value, "encounter"));
      log(
        s,
        `Slopes of Hithaeglir: each player raises their threat by ${value}.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_RING_SOUTH_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: rsStageRevealed,
  cannotAttach: rsCannotAttach,
  cannotOptionallyEngage: rsCannotOptionallyEngage,
  damageAmount: rsDamageAmount,
  threatBonus: rsThreatBonus,
  stagingThreat: rsStagingThreat,
  allyEntered: rsAllyEntered,
  whenRevealedCancelled: rsWhenRevealedCancelled,
  explored: rsExplored,
  enemyAttackStarted: rsEnemyAttackStarted,
  attackFinished: rsAttackFinished,
  encounter: rsEncounter,
  shadow: rsShadow,
  effect: nightmareRingSouthEffect,
  sharedEffect: (e) =>
    ["nrsTentacles", "nrsExpanse", "nrsSlopes"].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareRingSouth(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.southShelter === undefined ||
      (Array.isArray(q.southShelter) &&
        q.southShelter.every(
          (x) => !!x && n(x.round) && typeof x.phase === "string",
        ))) &&
    (q?.southWarg === undefined || typeof q.southWarg === "string")
  );
}
