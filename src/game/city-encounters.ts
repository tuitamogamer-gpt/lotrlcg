import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import { isEnemy, isShipEnemy, isShipObjective } from "./ships";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
} from "./core";
import { discardCharacter, enemyAddedToStaging, engage } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { sailingOnCourse } from "./sailing";
import { heirsShadowDealt } from "./heirs-numenor";
import { carnShadowDealt } from "./carn-dum";
import { surgeEffects } from "./surge";

import { CITY as C } from "./city-support";

type CityCombat = NonNullable<GameState["combat"]> & {
  cityWatchShadows?: number;
  cityBelfalasShadows?: number;
  cityKilledAllyCosts?: number[];
};
const live = (s: GameState) => !!s.city;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const raiders = (s: GameState) => enemies(s).filter((u) => trait(u, "Raider"));
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const active = (s: GameState, code: string) =>
  live(s) && allActiveLocations(s).some((u) => u.code === code && !u.blanked);
const phase = (s: GameState) =>
  `${s.round}:${["quest", "staging"].includes(s.phase) ? "quest" : ["defense", "attack"].includes(s.phase) ? "combat" : s.phase}`;
const printedCost = (code: string) => {
  const value = card(code).cost;
  return typeof value === "number"
    ? value
    : /^\d+$/.test(String(value))
      ? Number(value)
      : 0;
};
function shadowCard(s: GameState, enemy: Unit) {
  const code = encounterDraw(s, true);
  if (!code) return;
  enemy.shadows.push(code);
  if (enemy.faceupShadows) enemy.faceupShadows.push(false);
  heirsShadowDealt(s, enemy);
  carnShadowDealt(s, enemy);
}
function searchOptions(s: GameState, corsairOnly = false) {
  return (["deck", "discard"] as const).flatMap((pile) =>
    (pile === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
      (code, index) => {
        const u = { code } as Unit;
        return isEnemy(u) && (!corsairOnly || trait(u, "Corsair"))
          ? [
              {
                id: `${pile}:${index}`,
                code,
                label: `${card(code).name} · ${pile === "deck" ? "encounter deck" : "discard pile"}`,
                effects: [
                  fx("cityECSearchTake", {
                    code,
                    value: index,
                    text: pile,
                    player: firstPlayer(s),
                  }),
                ],
              },
            ]
          : [];
      },
    ),
  );
}

export function cityStats(s: GameState, u: Unit) {
  return {
    attack: live(s) && u.code === C.slaver && !u.blanked ? u.resources : 0,
    defense: active(s, C.harbor) && isEnemy(u) && trait(u, "Corsair") ? 2 : 0,
  };
}
export function cityThreatBonus(s: GameState, u: Unit) {
  if (!live(s)) return 0;
  const ownBonus = !u.blanked
    ? u.code === C.slaver
      ? u.resources
      : u.code === C.city
        ? Math.max(0, ...raiders(s).map((r) => r.resources))
        : 0
    : 0;
  return (
    ownBonus +
    s.city!.foes.filter((e) => e.id === u.id && e.phase === phase(s)).length *
      u.resources
  );
}
export const cityLocationThreat = cityThreatBonus;
export const cityCannotOptionallyEngage = (s: GameState, _u?: Unit) =>
  live(s) && s.city!.patrolRound === s.round;
export const cityCannotEngage = cityCannotOptionallyEngage;

/** The limit counts every ally entering this round, including entries before travel. */
export function cityAllyProblem(s: GameState, count = 1) {
  if (!active(s, C.waters)) return null;
  const entered =
    s.city!.allyEntries.round === s.round ? s.city!.allyEntries.count : 0;
  return entered + count > 1
    ? "Corsair Waters allows only 1 ally to enter play each round."
    : null;
}
export function cityAllyEntered(s: GameState, u?: Unit) {
  if (!live(s) || (u && !isAlly(u))) return;
  if (s.city!.allyEntries.round !== s.round)
    s.city!.allyEntries = { round: s.round, count: 0 };
  s.city!.allyEntries.count++;
}

export function cityCardEntered(
  s: GameState,
  u: Unit,
  _fromReveal = false,
  _cancel = false,
) {
  if (!live(s) || !isEnemy(u) || !trait(u, "Raider")) return;
  const count = s.staging.filter(
    (a) => a.code === C.watch && !a.blanked,
  ).length;
  if (count) {
    u.resources += count;
    log(
      s,
      `Watch Tower · Add ${count} resource${count === 1 ? "" : "s"} to ${name(u)}.`,
    );
  }
}

export function cityTravelProblem(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return null;
  if (
    u.code === C.belfalas &&
    !s.city!.corsairDeck.length &&
    !s.city!.corsairDiscard.length
  )
    return "Southern Belfalas requires a Corsair to reveal and engage.";
  if (u.code === C.city && !searchOptions(s, true).length)
    return "City of Corsairs requires a Corsair enemy in the encounter deck or discard pile.";
  return null;
}
export function cityTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!live(s) || u.blanked) return undefined;
  if (u.code === C.belfalas)
    return [fx("cityECBelfalasTravel", { player: firstPlayer(s) })];
  if (u.code === C.city)
    return [fx("cityECCityTravel", { player: firstPlayer(s) })];
  return undefined;
}
export function cityTravelEntered(
  _s: GameState,
  _u: Unit,
  _actualTravel = true,
) {}

/** Resolve the printed either/or when an empty active slot gives the travel option. */
export function cityTravelStart(s: GameState) {
  if (!live(s) || allActiveLocations(s).length) return;
  prepend(
    s,
    ...s.staging
      .filter((u) => u.code === C.streets && !u.blanked)
      .map((u) =>
        fx("cityECStreets", { target: u.id, player: firstPlayer(s) }),
      ),
  );
}

export function cityEncounter(s: GameState, code: string, replay = false) {
  if (!live(s)) return false;
  const kind =
    code === C.foes
      ? "cityECFoes"
      : code === C.patrol
        ? "cityECPatrol"
        : code === C.serpent
          ? "cityECSerpent"
          : code === C.fury
            ? "cityECFury"
            : undefined;
  if (!kind) return false;
  if (!replay) s.encounterDiscard.push(code);
  prepend(s, fx(kind, { player: firstPlayer(s), flag: replay }));
  return true;
}
export function cityShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  const c = s.combat as CityCombat,
    enemy = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s);
  if (code === C.watch) c.cityWatchShadows = (c.cityWatchShadows ?? 0) + 1;
  else if (code === C.belfalas)
    c.cityBelfalasShadows = (c.cityBelfalasShadows ?? 0) + 1;
  else if (code === C.harbor) {
    if (enemy && trait(enemy, "Raider"))
      prepend(s, fx("cityECHarborShadow", { target: enemy.id, player }));
  } else if (code === C.waters) {
    const options = [
      {
        id: "undefended",
        label: "Treat this attack as undefended",
        effects: [fx("voyageUndefended")],
      },
    ];
    if (s.sailing && s.sailing.heading < 3)
      options.unshift({
        id: "heading",
        label: "Shift your heading off-course",
        effects: [fx("voyageShift", { value: 1 })],
      });
    choose(
      s,
      "Corsair Waters · Shift heading or take an undefended attack",
      options,
    );
  } else if (code === C.streets) {
    if (enemy && trait(enemy, "Raider"))
      for (let n = 0; n < Math.min(3, enemy.resources); n++)
        shadowCard(s, enemy);
  } else return false;
  return true;
}

/** Only actual combat damage from this physical Slave Ship attack causes extra damage. */
export function cityDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    !live(s) ||
    value <= 0 ||
    !context.combatDamage ||
    !context.enemyId ||
    !isShipObjective(u)
  )
    return;
  const enemy = get(s, context.enemyId);
  if (!enemy || enemy.code !== C.slave || enemy.blanked) return;
  prepend(
    s,
    fx("cityECAssignNonShip", {
      value,
      player: s.combat?.attackPlayer ?? ownerOf(s, u),
      text: "Slave Ship",
    }),
  );
}
export function cityCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !live(s) ||
    !s.combat ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId ||
    !isAlly(u)
  )
    return;
  const c = s.combat as CityCombat;
  (c.cityKilledAllyCosts ??= []).push(printedCost(u.code));
}
export function cityAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  if (!live(s) || skipped) return;
  const c = combat as CityCombat,
    effects: Effect[] = [],
    player = c.attackPlayer ?? activeSeat(s);
  for (let n = 0; n < (c.cityWatchShadows ?? 0); n++)
    for (const value of c.cityKilledAllyCosts ?? [])
      if (value > 0)
        effects.push(
          fx("cityECWatchShadow", { value, player: firstPlayer(s) }),
        );
  if (c.raidKilledCharacter)
    for (let n = 0; n < (c.cityBelfalasShadows ?? 0); n++)
      effects.push(fx("cityECBelfalasShadow", { player }));
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        effects,
        player: firstPlayer(s),
        text: "Choose the next City of Corsairs after-attack shadow",
      }),
    );
  else prepend(s, ...effects);
  delete c.cityWatchShadows;
  delete c.cityBelfalasShadows;
  delete c.cityKilledAllyCosts;
}

export function cityEncounterEffect(s: GameState, e: Effect) {
  if (!live(s) || !e.kind.startsWith("cityEC")) return false;
  const q = s.city!,
    u = get(s, e.target),
    player = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "cityECFoes": {
      const targets = s.staging.filter((a) => isEnemy(a) && trait(a, "Raider"));
      if (!targets.length) {
        if (!e.flag) prepend(s, ...surgeEffects(C.foes));
        break;
      }
      choose(
        s,
        "Foes of Ecthelion · Add 2 resources to a Raider",
        targets.map((a) => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("cityECFoesApply", { target: a.id, player })],
        })),
      );
      break;
    }
    case "cityECFoesApply":
      if (u) u.resources += 2;
      q.foes.push(
        ...s.staging
          .filter((a) => isEnemy(a) && trait(a, "Raider"))
          .map((a) => ({ id: a.id, phase: phase(s) })),
      );
      break;
    case "cityECPatrol":
      prepend(
        s,
        ...playerOrder(s).map((p) => fx("cityECPatrolReturn", { player: p })),
        fx("cityECPatrolDone", { player }),
      );
      break;
    case "cityECPatrolReturn": {
      const targets = seatView(s, player).engaged.filter(isEnemy);
      if (targets.length)
        choose(
          s,
          `${seatName(s, player)} · Return an engaged enemy to staging`,
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [fx("cityECPatrolMove", { target: a.id, player })],
          })),
        );
      break;
    }
    case "cityECPatrolMove":
      if (u && allEngaged(s).some((a) => a.id === u.id))
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((a) => a.id !== u.id);
          delete u.owner;
          s.staging.push(u);
          enemyAddedToStaging(s, u);
        });
      break;
    case "cityECPatrolDone":
      q.patrolRound = s.round;
      if (!s.staging.some(isEnemy)) {
        const options = searchOptions(s);
        if (options.length)
          choose(s, "Umbar Patrol · Search for an enemy", options);
        else shuffle(s, s.encounterDeck);
      }
      break;
    case "cityECSerpent": {
      const ships = enemies(s).filter(isShipEnemy);
      for (const a of ships) shadowCard(s, a);
      if (!sailingOnCourse(s))
        for (const a of ships) a.tempEngagement = (a.tempEngagement ?? 0) - 10;
      break;
    }
    case "cityECFury": {
      for (const a of allEngaged(s).filter((a) => trait(a, "Raider")))
        a.resources++;
      const assignments = playerOrder(s)
        .map((p) => ({
          player: p,
          value: seatView(s, p)
            .engaged.filter((a) => trait(a, "Raider"))
            .reduce((n, a) => n + a.resources, 0),
        }))
        .filter((a) => a.value > 0 && own(s, a.player).length);
      if (!assignments.length && !e.flag) prepend(s, ...surgeEffects(C.fury));
      else
        prepend(
          s,
          ...assignments.map((a) =>
            fx("voyageAssignDamage", { ...a, text: "Fury and Malice" }),
          ),
        );
      break;
    }
    case "cityECBelfalasTravel":
      choose(
        s,
        "Southern Belfalas · Choose a player to reveal and engage a Corsair",
        playerOrder(s).map((p) => ({
          id: `player:${p}`,
          label: seatName(s, p),
          effects: [fx("cityECBelfalasBoard", { player: p })],
        })),
      );
      break;
    case "cityECBelfalasBoard": {
      if (!q.corsairDeck.length)
        q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
      const code = q.corsairDeck.shift();
      if (code) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        cityCardEntered(s, enemy, true, false);
        forOwner(s, player, () => engage(s, enemy));
        if (!q.corsairDeck.length)
          q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
      }
      break;
    }
    case "cityECCityTravel": {
      const options = searchOptions(s, true);
      if (options.length)
        choose(s, "City of Corsairs · Search for a Corsair enemy", options);
      break;
    }
    case "cityECSearchTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value === undefined || pile[e.value] !== e.code) break;
      const enemy = make(s, pile.splice(e.value, 1)[0]);
      s.staging.push(enemy);
      cityCardEntered(s, enemy);
      enemyAddedToStaging(s, enemy);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "cityECStreets": {
      if (
        !u ||
        allActiveLocations(s).length ||
        !s.staging.some((a) => a.id === u.id)
      )
        break;
      choose(
        s,
        "Streets of Umbar · Travel to Streets or add 2 resources to a Raider",
        [
          ...s.staging
            .filter((a) => a.code === C.streets)
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `Travel to ${name(a)}`,
              effects: [fx("travelEnter", { target: a.id, player })],
            })),
          ...raiders(s).map((a) => ({
            id: `resource:${a.id}`,
            code: a.code,
            label: `Add 2 resources to ${name(a)}`,
            effects: [
              fx("cityECResources", { target: a.id, value: 2, player }),
            ],
          })),
        ],
      );
      break;
    }
    case "cityECResources":
      if (u) u.resources += e.value ?? 0;
      break;
    case "cityECHarborShadow": {
      const targets = own(s, player).filter(
        (a) => isHero(a) && a.resources > 0,
      );
      if (u && targets.length)
        choose(
          s,
          "Umbar Harbor · Move 1 hero resource to the attacking Raider",
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [
              fx("cityECHarborMove", { target: a.id, source: u.id, player }),
            ],
          })),
        );
      break;
    }
    case "cityECHarborMove": {
      const enemy = get(s, e.source);
      if (u && enemy && u.resources > 0) {
        u.resources--;
        enemy.resources++;
      }
      break;
    }
    case "cityECWatchShadow": {
      const targets = raiders(s);
      if (targets.length)
        choose(
          s,
          `Watch Tower · Add ${e.value ?? 0} resources to a Raider`,
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [
              fx("cityECResources", { target: a.id, value: e.value, player }),
            ],
          })),
        );
      break;
    }
    case "cityECBelfalasShadow": {
      const targets = own(s, player).filter(isAlly);
      if (targets.length)
        choose(
          s,
          "Southern Belfalas · Discard an ally you control",
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [fx("cityECDiscardAlly", { target: a.id, player })],
          })),
        );
      break;
    }
    case "cityECDiscardAlly":
      if (u) discardCharacter(s, u);
      break;
    case "cityECAssignNonShip": {
      const left = e.value ?? 0,
        targets = own(s, player).filter((a) => !isShipObjective(a));
      if (left > 0 && targets.length)
        choose(
          s,
          `${e.text ?? "Encounter effect"} · Assign ${left} damage to non-Ship characters`,
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: `Deal 1 damage to ${name(a)}`,
            effects: [
              fx("damage", { target: a.id, value: 1, player }),
              fx("cityECAssignNonShip", {
                value: left - 1,
                player,
                text: e.text,
              }),
            ],
          })),
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
