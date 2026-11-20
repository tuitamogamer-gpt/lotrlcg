/**
 * The Drúadan Forest's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (no resources collected in the resource phase, 5 resources on each
 * hero and a Garden of Poisons at setup, 3 resources after stage 2B is
 * revealed) and its Nightmare encounter cards, composed with the scenario's
 * own rules (src/game/druadan-forest.ts) through batch4Scenario while a
 * Nightmare mode game is played. Effects use the "ndf" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { enemyAddedToStaging } from "./board";
import {
  canGainResources,
  choose,
  engagementCost,
  fx,
  get,
  log,
  prepend,
} from "./core";
import {
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
  traitOf,
} from "./nightmare-core";

export interface NightmareDruadanState {
  /** Drû-buri-Drû: the damage it took this round. */
  bossDamage?: { round: number; taken: number };
}

const dfLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-druadan-forest";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const wose = (u: Unit) => isEnemy(u) && traitOf(u.code, "Wose");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const darts = (u: Unit) =>
  u.attachments.filter((a) => a.code === N.darts && !a.blanked).length;
/** An enemy's printed prowl value (X is the number of players). */
const prowl = (s: GameState, u: Unit) => {
  const m = /\bProwl (\d+|X)\b/i.exec(card(u.code).text ?? "");
  return u.blanked || !m
    ? 0
    : m[1] === "X"
      ? playerOrder(s).length
      : Number(m[1]);
};

// ------------------------------------------------------------- the setup card

/** "Heroes do not collect resources during the resource phase." */
const dfCannotCollectResources = (s: GameState) => dfLive(s);
/**
 * "Forced: After stage 2B is revealed, each hero with fewer than 3 resources
 * gains resources until it has 3." A card effect: a Garden of Poisons in play
 * ("Heroes cannot gain resources from card effects") prevents it.
 */
function dfStageRevealed(s: GameState, stage: number) {
  if (!dfLive(s) || stage !== 2) return;
  let n = 0,
    blocked = 0;
  for (const h of allHeroes(s))
    if (h.resources < 3) {
      if (!canGainResources(s, h)) {
        blocked++;
        continue;
      }
      n += 3 - h.resources;
      h.resources = 3;
    }
  log(
    s,
    `The Drúadan Forest · Nightmare: stage 2B gives each hero up to 3 resources (${n} gained${blocked ? `; ${blocked} ${blocked === 1 ? "hero cannot" : "heroes cannot"} gain resources` : ""}).`,
  );
}

// ------------------------------------------------------------- the cards

/** Drúadan Stalker's archery 3 and Poison-darts' archery 2. */
const dfUnitArchery = (s: GameState, u: Unit) =>
  dfLive(s) && isEnemy(u) && !u.blanked
    ? (u.code === N.stalker ? 3 : 0) + 2 * darts(u)
    : 0;
/**
 * Drû-buri-Drû: "While Drû-buri-Drû is in play, other Wose enemies get +1
 * [attack] and +1 [defense]." Devil's Mirk: "While Devil's Mirk is the
 * active location, each Wose enemy gets +2 [defense]." Poison-darts:
 * "Attached enemy gets +2 [attack]".
 */
function dfStats(s: GameState, u: Unit) {
  if (!dfLive(s) || !isEnemy(u)) return {};
  const boss =
    wose(u) &&
    u.code !== N.boss &&
    enemiesInPlay(s).some((x) => live(s, x, N.boss))
      ? 1
      : 0;
  const mirk = wose(u)
    ? 2 * allActiveLocations(s).filter((l) => live(s, l, N.mirk)).length
    : 0;
  return { attack: boss + 2 * darts(u), defense: boss + mirk };
}
/** Stonewain Valley: "+1 [threat] for each resource on it." */
const dfThreatBonus = (s: GameState, u: Unit) =>
  dfLive(s) && live(s, u, N.stonewain) ? u.resources : 0;
/** Devil's Mirk: "Immune to player card effects." */
const dfImmune = (s: GameState, u: Unit) => dfLive(s) && live(s, u, N.mirk);
/** Devil's Mirk: "While Devil's Mirk is in the staging area, characters cannot be healed." */
const dfCannotHeal = (s: GameState) =>
  dfLive(s) && s.staging.some((l) => live(s, l, N.mirk));
/** Drúadan Warrior: "Each hero with no resources in its resource pool cannot be declared as an attacker or defender against Drúadan Warrior." */
const broke = (u: Unit) =>
  card(u.code).type_code === "hero" && u.resources === 0;
const dfCannotDefend = (s: GameState, enemy: Unit, defender?: Unit) =>
  dfLive(s) && live(s, enemy, N.warrior) && !!defender && broke(defender);
const dfCannotAttack = (s: GameState, character: Unit, enemy: Unit) =>
  dfLive(s) && live(s, enemy, N.warrior) && broke(character);
/** Drúadan Stalker: "As an additional cost to optionally engage Drúadan Stalker, you must spend 2 resources." */
function dfCannotOptionallyEngage(s: GameState, u: Unit) {
  if (!dfLive(s) || !live(s, u, N.stalker)) return false;
  return s.heroes.reduce((n, h) => n + h.resources, 0) < 2;
}
function dfEngaged(s: GameState, u: Unit, optional?: boolean) {
  if (!dfLive(s) || !optional || !live(s, u, N.stalker)) return;
  prepend(
    s,
    fx("ndfStalkerPay", { value: 2, target: u.id, player: ownerOf(s, u) }),
  );
}
/** Eilenach: "Players cannot travel to Eilenach unless there is at least 1 resource in each hero's resource pool." */
const dfTravelProblem = (s: GameState, u: Unit) =>
  dfLive(s) && live(s, u, N.eilenach) && allHeroes(s).some((h) => !h.resources)
    ? "Eilenach: each hero must have at least 1 resource to travel here."
    : null;
/** Drû-buri-Drû: "Drû-buri-Drû cannot take more than 1 damage each round." */
const bossTaken = (s: GameState) => {
  const b = s.nightmare?.bossDamage;
  return b && b.round === s.round ? b.taken : 0;
};
function dfDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!dfLive(s) || amount <= 0 || !live(s, u, N.boss)) return amount;
  const left = Math.max(0, 1 - bossTaken(s));
  if (left < amount)
    log(s, "Drû-buri-Drû cannot take more than 1 damage each round.");
  return Math.min(amount, left);
}
function dfDamageDealt(s: GameState, u: Unit, value: number) {
  if (!dfLive(s) || value <= 0 || !live(s, u, N.boss)) return;
  (s.nightmare ??= {}).bossDamage = {
    round: s.round,
    taken: bossTaken(s) + value,
  };
}
/** Stonewain Valley: "resources discarded or spent by the first player for any reason are placed on Stonewain Valley." */
function dfResourcesSpent(s: GameState, hero: Unit, amount: number) {
  if (!dfLive(s) || amount <= 0 || ownerOf(s, hero) !== firstPlayer(s)) return;
  const valley = s.staging.find((l) => live(s, l, N.stonewain));
  if (!valley) return;
  valley.resources += amount;
  log(
    s,
    `Stonewain Valley: ${amount} ${amount === 1 ? "resource is" : "resources are"} placed on it (${valley.resources}).`,
  );
}

function dfEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!dfLive(s) || (code !== N.drums && code !== N.darts)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.drums) {
    s.encounterDiscard.push(code);
    prepend(s, fx("ndfDrums", { player: firstPlayer(s) }));
  } else prepend(s, fx("ndfDarts", { player: firstPlayer(s) }));
  return true;
}

function dfShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !dfLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Drúadan Stalker: "Attacking enemy gets +X [attack]. X is that enemy's
    // prowl value."
    case N.stalker:
      if (enemy) c.attackBonus += prowl(s, enemy);
      return true;
    // Eilenach: "If the defending character has no resources, deal it 1
    // damage."
    case N.eilenach: {
      const d = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      if (d && !d.resources)
        prepend(
          s,
          fx("damage", { target: d.id, value: 1, player: defendingPlayer(s) }),
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareDruadanEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndf")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "ndfStalkerPay":
      // The scenario's own resource payment (one at a time, from the heroes
      // of the engaging player).
      prepend(
        s,
        fx("druadanPayResources", {
          value: e.value ?? 2,
          player: p,
          text: "Drúadan Stalker",
        }),
      );
      return true;
    case "ndfDrums": {
      // Prowl on each engaged enemy (the scenario's group discard), then
      // the engaged Wose return.
      const prowls: Effect[] = [];
      for (const player of playerOrder(s))
        for (const enemy of seatView(s, player).engaged.filter(isEnemy)) {
          const value = prowl(s, enemy);
          if (value)
            prowls.push(
              fx("druadanProwl", {
                value,
                code: enemy.code,
                player: firstPlayer(s),
              }),
            );
        }
      log(s, "Drums of the Wild Men: prowl on each engaged enemy.", "danger");
      prepend(s, ...prowls, fx("ndfDrumsReturn", { player: firstPlayer(s) }));
      return true;
    }
    case "ndfDrumsReturn": {
      let returned = 0;
      for (const player of playerOrder(s)) {
        const back = seatView(s, player).engaged.filter(wose);
        forOwner(s, player, () => {
          s.engaged = s.engaged.filter((x) => !back.includes(x));
        });
        for (const enemy of back) {
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
        }
        returned += back.length;
      }
      log(
        s,
        `Drums of the Wild Men: ${returned} Wose ${returned === 1 ? "enemy returns" : "enemies return"} to the staging area${returned ? "" : "; it gains surge"}.`,
        "danger",
      );
      if (!returned) prepend(s, ...surgeEffects(N.drums));
      return true;
    }
    case "ndfDarts": {
      const foes = enemiesInPlay(s);
      if (!foes.length) {
        s.encounterDiscard.push(N.darts);
        log(s, "Poison-darts · No enemy is in play: it is discarded.");
        return true;
      }
      const max = Math.max(...foes.map((x) => engagementCost(s, x)));
      const top = foes.filter((x) => engagementCost(s, x) === max);
      if (top.length === 1) {
        prepend(s, fx("ndfDartsTo", { target: top[0].id }));
        return true;
      }
      choose(
        s,
        `Poison-darts · Attach it to an enemy with engagement cost ${max}${seatLabel(s, p)}`,
        top.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("ndfDartsTo", { target: x.id })],
        })),
        card(N.darts).text,
      );
      return true;
    }
    case "ndfDartsTo":
      if (!u) {
        s.encounterDiscard.push(N.darts);
        return true;
      }
      u.attachments.push({
        id: `${u.id}:darts:${s.nextId++}`,
        code: N.darts,
        exhausted: false,
      } as Attachment);
      log(s, `Poison-darts attaches to ${name(u)}.`, "danger");
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_DRUADAN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotCollectResources: dfCannotCollectResources,
  stageRevealed: dfStageRevealed,
  unitArchery: dfUnitArchery,
  stats: dfStats,
  threatBonus: dfThreatBonus,
  immune: dfImmune,
  cannotHeal: dfCannotHeal,
  cannotDefend: dfCannotDefend,
  cannotAttack: dfCannotAttack,
  cannotOptionallyEngage: dfCannotOptionallyEngage,
  engaged: dfEngaged,
  travelProblem: dfTravelProblem,
  damageAmount: dfDamageAmount,
  damageDealt: dfDamageDealt,
  resourcesSpent: dfResourcesSpent,
  encounter: dfEncounter,
  shadow: dfShadow,
  effect: nightmareDruadanEffect,
  sharedEffect: (e) => e.kind.startsWith("ndf"),
};

// ------------------------------------------------------------- saves

export function validNightmareDruadan(s: GameState) {
  const b = s.nightmare?.bossDamage;
  return (
    b === undefined ||
    (!!b &&
      Number.isInteger(b.round) &&
      Number.isInteger(b.taken) &&
      b.taken >= 0)
  );
}
