/**
 * A Storm on Cobas Haven's Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (the removals, the random Dol Amroth objective and Raider Flagship's
 * inability to guard objectives are the scenario's own setup and guards, in
 * src/game/cobas.ts, as are City Under Siege's archery in the combined
 * archery total, War-torn Waters' Forced effect beside Siege Ship's, and the
 * Action that discards Broken Rudder or Grappled! like Taking on Water) and
 * its Nightmare encounter cards, composed with the scenario's rules through
 * batch4Scenario while a Nightmare mode game is played. Effects use the
 * "ncb" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  requireRule,
} from "./core";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  ownerOf,
  seatName,
  selectSeat,
} from "./table";
import { isShipObjective } from "./ships";
import { currentQuestUnit } from "./quest-state";
import { dealEnemyShadows } from "./considered-engagement";
import { returnToStaging } from "./black-riders-hunted";
import { voyageEffect } from "./voyage-belegaer";
import { sailingHeadingLabel } from "./sailing";
import {
  COBAS as C,
  COBAS_NIGHTMARE as N,
  cobasGuardIds,
} from "./cobas-support";
import { cobasGuardedObjectives, cobasObjectiveControlled } from "./cobas";
import { nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, seatLabel } from "./nightmare-core";

export interface NightmareCobasState {
  /** Raider Flagship (the setup card): the progress placed on the current quest this round. */
  cobasProgress?: { round: number; quest: string; placed: number };
}

const ncbLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "a-storm-on-cobas-haven" && !!s.cobas;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const ships = (s: GameState) => allCharacters(s).filter(isShipObjective);
const flagshipEngaged = (s: GameState) =>
  allEngaged(s).some((u) => u.code === C.flagship);
/** The Broken Rudder attachments on Ship objectives, by attachment id. */
const rudders = (s: GameState) =>
  ships(s).flatMap((u) =>
    u.attachments
      .filter((a) => a.code === N.rudder && !a.blanked)
      .map((a) => a.id),
  );
const rudderHost = (s: GameState, id: string) =>
  ships(s).find((u) =>
    u.attachments.some((a) => a.id === id && a.code === N.rudder),
  );

// ------------------------------------------------------------- passives

/**
 * The setup card: "While any player is engaged with Raider Flagship, no more
 * than 5 progress can be placed on the current quest each round." The round's
 * progress on that quest counts toward the limit.
 */
function ncbProgress(s: GameState, amount: number, quest: Unit) {
  if (
    !ncbLive(s) ||
    amount <= 0 ||
    currentQuestUnit(s)?.id !== quest.id ||
    !flagshipEngaged(s)
  )
    return amount;
  const t = s.nightmare?.cobasProgress;
  const placed =
    t && t.round === s.round && t.quest === quest.id ? t.placed : 0;
  const allowed = Math.min(amount, Math.max(0, 5 - placed));
  if (allowed < amount)
    log(
      s,
      `Raider Flagship: no more than 5 progress can be placed on the current quest each round (${amount - allowed} is not placed).`,
      "danger",
    );
  return allowed;
}
function ncbProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (!ncbLive(s) || amount <= 0 || currentQuestUnit(s)?.id !== quest.id)
    return;
  const q = (s.nightmare ??= {});
  const t = q.cobasProgress;
  q.cobasProgress =
    t && t.round === s.round && t.quest === quest.id
      ? { ...t, placed: t.placed + amount }
      : { round: s.round, quest: quest.id, placed: amount };
}
/** Sea-wall: "+2 [threat] and +2 quest points for each objective guarded by an encounter card." */
const seaWall = (s: GameState, u: Unit) =>
  ncbLive(s) && u.code === N.seaWall && !u.blanked
    ? 2 * cobasGuardedObjectives(s)
    : 0;
/** Grappled!: "Attached objective cannot ready." */
const ncbCannotReady = (s: GameState, u: Unit) =>
  ncbLive(s) && u.attachments.some((a) => a.code === N.grappled && !a.blanked);
/** Ramming Ship: "Cannot have attachments." */
const ncbCannotAttach = (s: GameState, u: Unit) =>
  ncbLive(s) && u.code === N.ramming && !u.blanked;
/**
 * City Under Siege: "While City Under Siege is in the staging area, ...
 * damage from the archery keyword must be applied to Ship objectives."
 */
function ncbArcheryTargets(s: GameState, characters: Unit[]) {
  if (!ncbLive(s) || !s.staging.some((u) => u.code === N.city && !u.blanked))
    return undefined;
  const targets = characters.filter(isShipObjective);
  return targets.length ? targets : undefined;
}

// ------------------------------------------------------------- objectives

const ABILITIES: Record<string, string> = {
  [N.aearlang]: "Exhaust Aearlang · Ready a hero",
  [N.docks]:
    "Exhaust Docks of Dol Amroth · Heal 2 damage from a Ship objective",
};
const readyTargets = (s: GameState) =>
  allHeroes(s).filter((h) => h.exhausted && !cannotReady(h, s));
const healTargets = (s: GameState) => ships(s).filter((u) => u.damage > 0);
function ncbAbilityProblem(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || !ABILITIES[u.code]) return null;
  if (
    !ncbLive(s) ||
    !cobasObjectiveControlled(s, u) ||
    u.blanked ||
    u.exhausted
  )
    return "The objective must be controlled by the players, ready and unblanked.";
  if (u.code === N.aearlang && !readyTargets(s).length)
    return "There is no exhausted hero to ready.";
  if (u.code === N.docks && !healTargets(s).length)
    return "There is no damaged Ship objective to heal.";
  return null;
}
/**
 * Aearlang: "Action: Exhaust Aearlang to ready a hero." Docks of Dol Amroth:
 * "Action: Exhaust Docks of Dol Amroth to heal 2 damage from a Ship
 * objective." "Any player may trigger this action."
 */
function ncbAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || !ABILITIES[u.code] || !ncbLive(s)) return false;
  const problem = ncbAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  u.exhausted = true;
  log(s, `${seatName(s, activeSeat(s))} exhausts ${name(u)}.`, "good");
  if (u.code === N.aearlang)
    choose(
      s,
      "Aearlang · Ready a hero",
      readyTargets(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: `Ready ${name(h)}${seatLabel(s, ownerOf(s, h))}`,
        effects: [fx("ready", { target: h.id, player: ownerOf(s, h) })],
      })),
    );
  else
    choose(
      s,
      "Docks of Dol Amroth · Heal a Ship objective",
      healTargets(s).map((x) => ({
        id: x.id,
        code: x.code,
        label: `Heal 2 damage from ${name(x)}${seatLabel(s, ownerOf(s, x))}`,
        effects: [
          fx("heal", {
            target: x.id,
            value: 2,
            source: u.id,
            code: u.code,
            player: ownerOf(s, x),
          }),
        ],
      })),
    );
  return true;
}

// ------------------------------------------------------------- enemies

function ncbEngaged(s: GameState, u: Unit) {
  if (!ncbLive(s) || u.blanked) return;
  // Ramming Ship: "Forced: After Ramming Ship engages you, it gets +4
  // [attack] until the end of the round."
  if (u.code === N.ramming) {
    u.roundAttack = (u.roundAttack ?? 0) + 4;
    log(
      s,
      "Ramming Ship gets +4 [attack] until the end of the round.",
      "danger",
    );
  }
  // Fang of Sahír: "Forced: When Fang of Sahír engages you, either deal 3
  // damage to a Ship objective you control, or Fang of Sahír makes an
  // immediate attack."
  if (u.code === N.fang)
    prepend(s, fx("ncbFang", { target: u.id, player: ownerOf(s, u) }));
}

// ------------------------------------------------------------- shadows

function ncbShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ncbLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Ramming Ship: "Put the top card of the Corsair deck into play engaged
    // with you and deal it a shadow card."
    case N.ramming:
      prepend(
        s,
        fx("ncbRammingShadow", { player: c.attackPlayer ?? firstPlayer(s) }),
      );
      return true;
    // City Under Siege: "If attacking enemy is guarding an objective, return
    // it to the staging area after this attack."
    case N.city:
      if (enemy && cobasGuardIds(enemy).length) {
        c.ncbReturn = true;
        log(
          s,
          `City Under Siege: ${name(enemy)} is guarding an objective and returns to the staging area after this attack.`,
          "danger",
        );
      }
      return true;
    // Sea-wall: "Attacking enemy gets +1 [attack] for each objective guarded
    // by an encounter card."
    case N.seaWall: {
      const guarded = cobasGuardedObjectives(s);
      c.attackBonus += guarded;
      if (guarded)
        log(
          s,
          `Sea-wall: the attacking enemy gets +${guarded} [attack] (${guarded} guarded objective${guarded === 1 ? "" : "s"}).`,
          "danger",
        );
      return true;
    }
    // Grappled!: "If defending character is a Ship, attach Grappled! to it."
    // The physical shadow card moves onto the defender.
    case N.grappled: {
      const defender = get(s, c.defenderId ?? undefined);
      if (
        enemy &&
        defender &&
        (isShipObjective(defender) || trait(defender, "Ship"))
      ) {
        removeShadowCard(
          enemy,
          Math.max(0, (enemy.revealedShadowCount ?? 1) - 1),
        );
        defender.attachments.push({
          id: `a${s.nextId++}`,
          code,
          exhausted: false,
        });
        log(s, `Grappled! is attached to ${name(defender)}.`, "danger");
      }
      return true;
    }
  }
  return false;
}
function ncbAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!ncbLive(s) || !combat.ncbReturn) return [];
  return [
    fx("ncbReturn", {
      target: combat.enemyId,
      player: combat.attackPlayer ?? firstPlayer(s),
    }),
  ];
}

// ------------------------------------------------------------- treacheries

/** Broken Rudder and Grappled!: "When Revealed: Attach to a Ship objective." */
function ncbEncounter(s: GameState, code: string, replay: boolean) {
  if (!ncbLive(s) || (code !== N.rudder && code !== N.grappled)) return false;
  prepend(
    s,
    fx("ncbConditionAttach", { code, flag: replay, player: firstPlayer(s) }),
  );
  return true;
}
/**
 * Broken Rudder: "*Forced: After this Sailing test ends, attach Broken
 * Rudder to a Ship objective committed to that test."
 */
function ncbSailingDiscarded(
  s: GameState,
  looked: string[],
  committedIds: string[],
): Effect[] {
  if (!ncbLive(s)) return [];
  const copies = looked.filter((c) => c === N.rudder).length;
  if (!copies || !ships(s).some((u) => committedIds.includes(u.id))) return [];
  return Array.from({ length: copies }, () =>
    fx("ncbRudderForced", { ids: committedIds, player: firstPlayer(s) }),
  );
}
/**
 * Broken Rudder's attached text: "During sailing tests, for each [Sailing]
 * symbol found, cancel it unless you deal 1 damage to attached objective."
 * Each copy's host controller chooses how many of the symbols left to keep.
 */
function ncbSailingSymbolsFound(s: GameState, successes: number) {
  if (!ncbLive(s) || !s.sailing?.test) return false;
  const ids = rudders(s);
  if (!ids.length) return false;
  prepend(
    s,
    fx("ncbRudderSymbols", {
      value: successes,
      ids,
      player: s.sailing.test.player,
    }),
  );
  return true;
}
function attachRudder(s: GameState, ship: Unit) {
  const index = s.encounterDiscard.lastIndexOf(N.rudder);
  if (index < 0) return;
  s.encounterDiscard.splice(index, 1);
  ship.attachments.push({
    id: `a${s.nextId++}`,
    code: N.rudder,
    exhausted: false,
  });
  log(s, `Broken Rudder is attached to ${name(ship)}.`, "danger");
}

// ------------------------------------------------------------- locations

/** War-torn Waters: "Travel: Deal 2 damage to each Ship objective to travel here." */
function ncbTravelEffects(s: GameState, u: Unit) {
  if (!ncbLive(s) || u.code !== N.warTorn || u.blanked) return undefined;
  return [fx("ncbWarTornTravel", { player: firstPlayer(s) })];
}

// ------------------------------------------------------------- effects

function nightmareCobasEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ncb")) return false;
  const u = get(s, e.target);
  const player = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "ncbFang": {
      if (!u || !allEngaged(s).some((x) => x.id === u.id)) return true;
      const own = ships(s).filter((x) => ownerOf(s, x) === player);
      const attack = fx("immediateAttack", { target: u.id, player });
      if (!own.length) {
        prepend(s, attack);
        return true;
      }
      choose(s, "Fang of Sahír · Forced", [
        ...own.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Deal 3 damage to ${name(x)}`,
          effects: [fx("damage", { target: x.id, value: 3, player })],
        })),
        {
          id: "attack",
          code: u.code,
          label: "Fang of Sahír makes an immediate attack",
          effects: [attack],
        },
      ]);
      return true;
    }
    case "ncbRammingShadow": {
      if (!s.cobas) return true;
      const before = new Set(allEngaged(s).map((x) => x.id));
      voyageEffect(s, fx("voyageBoard", { player }));
      const enemy = allEngaged(s).find((x) => !before.has(x.id));
      if (enemy) {
        dealEnemyShadows(s, enemy, 1);
        log(s, `${name(enemy)} is dealt a shadow card.`, "danger");
      }
      return true;
    }
    case "ncbReturn":
      if (u) returnToStaging(s, u);
      return true;
    case "ncbConditionAttach": {
      const code = e.code!;
      const available = ships(s);
      if (!available.length) {
        if (!e.flag) s.encounterDiscard.push(code);
        log(s, `${card(code).name}: there is no Ship objective to attach to.`);
        return true;
      }
      choose(
        s,
        `${card(code).name} · Choose a Ship objective`,
        available.map((ship) => ({
          id: ship.id,
          code: ship.code,
          label: `Attach ${card(code).name} to ${name(ship)}${seatLabel(s, ownerOf(s, ship))}`,
          effects: [
            fx("ncbConditionAttached", {
              target: ship.id,
              code,
              flag: e.flag,
            }),
          ],
        })),
      );
      return true;
    }
    case "ncbConditionAttached":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: e.code!,
          exhausted: false,
        });
        log(s, `${card(e.code!).name} is attached to ${name(u)}.`, "danger");
      } else if (!e.flag) s.encounterDiscard.push(e.code!);
      return true;
    case "ncbRudderForced": {
      if (!s.encounterDiscard.includes(N.rudder)) return true;
      const committed = ships(s).filter((x) => (e.ids ?? []).includes(x.id));
      if (committed.length === 1) attachRudder(s, committed[0]);
      else if (committed.length)
        choose(
          s,
          "Broken Rudder · Attach to a committed Ship objective",
          committed.map((ship) => ({
            id: ship.id,
            code: ship.code,
            label: `Attach Broken Rudder to ${name(ship)}${seatLabel(s, ownerOf(s, ship))}`,
            effects: [fx("ncbRudderAttach", { target: ship.id, player })],
          })),
        );
      return true;
    }
    case "ncbRudderAttach":
      if (u && isShipObjective(u)) attachRudder(s, u);
      return true;
    case "ncbRudderSymbols": {
      const test = s.sailing?.test;
      if (!test || test.phase !== "results") return true;
      const kept = Math.max(0, e.value ?? 0);
      const [id, ...rest] = e.ids ?? [];
      const host = id ? rudderHost(s, id) : undefined;
      if (!id || kept <= 0) {
        log(
          s,
          `Broken Rudder: ${kept} Sailing symbol${kept === 1 ? " remains" : "s remain"} uncancelled.`,
          kept ? undefined : "danger",
        );
        prepend(s, fx("sailingHeading", { value: kept, player: test.player }));
        return true;
      }
      const next = (value: number) =>
        fx("ncbRudderSymbols", { value, ids: rest, player: test.player });
      if (!host) {
        prepend(s, next(kept));
        return true;
      }
      const owner = ownerOf(s, host);
      selectSeat(s, owner);
      const max = Math.min(kept, s.sailing!.heading);
      const options: Option[] = Array.from({ length: max + 1 }, (_, k) => ({
        id: `rudder-${k}`,
        code: N.rudder,
        label: k
          ? `Keep ${k} Sailing symbol${k === 1 ? "" : "s"} · Deal ${k} damage to ${name(host)}`
          : kept === 1
            ? "Cancel the Sailing symbol"
            : `Cancel all ${kept} Sailing symbols`,
        effects: [
          ...(k
            ? [fx("damage", { target: host.id, value: k, player: owner })]
            : []),
          next(k),
        ],
      }));
      choose(
        s,
        "Broken Rudder · Sailing symbols",
        options,
        `Each Sailing symbol found is canceled unless 1 damage is dealt to ${name(host)}${seatLabel(s, owner)}. ${kept} uncancelled; ${sailingHeadingLabel(s.sailing!.heading)}.`,
      );
      return true;
    }
    case "ncbWarTornTravel": {
      const targets = ships(s);
      log(
        s,
        "War-torn Waters · Travel: 2 damage is dealt to each Ship objective.",
        "danger",
      );
      prepend(
        s,
        ...targets.map((x) =>
          fx("damage", { target: x.id, value: 2, player: ownerOf(s, x) }),
        ),
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- saves

export function validNightmareCobas(s: GameState) {
  const t = s.nightmare?.cobasProgress;
  return (
    t === undefined ||
    (ncbLive(s) &&
      !!t &&
      typeof t === "object" &&
      Number.isInteger(t.round) &&
      t.round >= 0 &&
      t.round <= s.round &&
      typeof t.quest === "string" &&
      Number.isInteger(t.placed) &&
      t.placed > 0)
  );
}

export const NIGHTMARE_COBAS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  progress: ncbProgress,
  questProgressPlaced: ncbProgressPlaced,
  threatBonus: seaWall,
  locationQuestBonus: seaWall,
  cannotReady: ncbCannotReady,
  cannotAttach: ncbCannotAttach,
  archeryTargets: ncbArcheryTargets,
  abilityLabel: (code) => ABILITIES[code],
  abilityProblem: ncbAbilityProblem,
  ability: ncbAbility,
  engaged: ncbEngaged,
  shadow: ncbShadow,
  attackFinished: ncbAttackFinished,
  encounter: ncbEncounter,
  sailingDiscarded: ncbSailingDiscarded,
  sailingSymbolsFound: ncbSailingSymbolsFound,
  travelEffects: ncbTravelEffects,
  effect: nightmareCobasEffect,
  sharedEffect: () => false,
};
