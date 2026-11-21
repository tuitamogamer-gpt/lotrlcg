/**
 * The City of Corsairs' Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (the removals from the three piles, where its two encounter set icons
 * place its cards, and the stage 2B and stage 3A Forced effects are the
 * scenario's own setup and stages, in src/game/city.ts) and its Nightmare
 * encounter cards, composed with the scenario's rules through batch4Scenario
 * while a Nightmare mode game is played. Effects use the "nco" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import { discardAttachment, enemyAddedToStaging, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly } from "./card-types";
import { isEnemy } from "./ships";
import { currentQuestUnit } from "./quest-state";
import { dealEnemyShadows } from "./considered-engagement";
import { heirsShadowDealt } from "./heirs-numenor";
import { carnShadowDealt } from "./carn-dum";
import { sailingHeadingLabel } from "./sailing";
import { CITY as C, CITY_NIGHTMARE as N } from "./city-support";
import { cityCardEntered } from "./city-encounters";
import { nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, seatLabel } from "./nightmare-core";

export interface NightmareCityState {
  /** Umbar Bridge: the progress it canceled on the current quest this round. */
  cityBridge?: { round: number; quest: string; canceled: number };
  /** The Cursed Sword: the round its once-per-round Forced effect resolved. */
  citySword?: number;
}

const ncoLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-city-of-corsairs" && !!s.city;
const trait = (u: { code: string }, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const raiders = (s: GameState) => enemies(s).filter((u) => trait(u, "Raider"));
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const printedCost = (code: string) => {
  const value = card(code).cost;
  return typeof value === "number"
    ? value
    : /^\d+$/.test(String(value))
      ? Number(value)
      : 0;
};
const raiderLabel = (s: GameState, u: Unit) =>
  `${name(u)} (${u.resources} resource${u.resources === 1 ? "" : "s"})${allEngaged(s).some((x) => x.id === u.id) ? seatLabel(s, ownerOf(s, u)) : " · staging area"}`;
/** Deal this physical card to an enemy as a shadow card. */
function dealAsShadow(s: GameState, enemy: Unit, code: string) {
  enemy.shadows.push(code);
  if (enemy.faceupShadows) enemy.faceupShadows.push(false);
  heirsShadowDealt(s, enemy);
  carnShadowDealt(s, enemy);
}
/** The Raider enemies with the most resources, for the first player to choose among. */
function raiderOptions(
  s: GameState,
  kind: string,
  value: number,
  most = false,
): Option[] {
  const list = raiders(s);
  const top = Math.max(...list.map((u) => u.resources));
  return list
    .filter((u) => !most || u.resources === top)
    .map((u) => ({
      id: u.id,
      code: u.code,
      label: `Add ${value} resource${value === 1 ? "" : "s"} to ${raiderLabel(s, u)}`,
      effects: [fx(kind, { target: u.id, value, player: firstPlayer(s) })],
    }));
}

// ------------------------------------------------------------- passives

/**
 * Umbar Bridge: "While Umbar Bridge is in the staging area, cancel the first
 * X progress that would be placed on the current quest each round, where X
 * is the highest number of resources on a Raider enemy in play." Each copy
 * cancels its own first X.
 */
function ncoProgress(s: GameState, amount: number, quest: Unit) {
  if (!ncoLive(s) || amount <= 0 || currentQuestUnit(s)?.id !== quest.id)
    return amount;
  const copies = staged(s, N.bridge).length;
  const x = Math.max(0, ...raiders(s).map((u) => u.resources));
  if (!copies || !x) return amount;
  const t = s.nightmare?.cityBridge;
  const used =
    t && t.round === s.round && t.quest === quest.id ? t.canceled : 0;
  const canceled = Math.min(amount, Math.max(0, copies * x - used));
  if (!canceled) return amount;
  (s.nightmare ??= {}).cityBridge = {
    round: s.round,
    quest: quest.id,
    canceled: used + canceled,
  };
  log(
    s,
    `Umbar Bridge cancels ${canceled} progress on the current quest (the first ${copies * x} this round).`,
    "danger",
  );
  return amount - canceled;
}
/** Corsair Loyalist: "While Corsair Loyalist has 4 or more resources on it, its attacks are considered to be undefended." */
const ncoCannotDefend = (s: GameState, enemy: Unit) =>
  ncoLive(s) &&
  enemy.code === N.loyalist &&
  !enemy.blanked &&
  enemy.resources >= 4;
/** Inspiring Fury's shadow: "During this attack, shadow effects cannot be canceled." */
const ncoCannotCancel = (s: GameState, shadow?: boolean) =>
  ncoLive(s) && !!shadow && !!s.combat?.ncoFury;
/** The Cursed Sword: "Cannot be discarded by player card effects." */
const ncoAttachmentImmune = (
  s: GameState,
  _host: Unit,
  a: { code: string },
  source?: string,
) => ncoLive(s) && a.code === N.sword && !!source;
/**
 * Patrol Ship: "Forced: After you shift your heading on-course, Patrol Ship
 * gets -40 engagement cost this round."
 */
function ncoHeadingShifted(s: GameState, before: number, after: number) {
  if (!ncoLive(s) || after >= before) return;
  for (const u of enemies(s).filter((x) => x.code === N.patrolShip)) {
    if (u.blanked) continue;
    u.tempEngagement = (u.tempEngagement ?? 0) - 40;
    log(s, `${name(u)} gets -40 engagement cost this round.`, "danger");
  }
}
/**
 * Walls of Umbar, in the staging area: "Forced: After a player commits an
 * ally to a Sailing test, raise his or her threat by 1."
 */
function ncoSailingCommitted(s: GameState, u: Unit) {
  if (!ncoLive(s) || !isAlly(u)) return;
  const copies = staged(s, N.walls).length;
  if (copies)
    prepend(s, fx("ncoThreat", { value: copies, player: ownerOf(s, u) }));
}
/**
 * Walls of Umbar: "*Forced: After Walls of Umbar is discarded from the
 * encounter deck during a Sailing test, raise each player's threat by 1 for
 * each ally he or she committed to that test."
 */
function ncoSailingDiscarded(
  s: GameState,
  looked: string[],
  committedIds: string[],
): Effect[] {
  if (!ncoLive(s)) return [];
  const copies = looked.filter((c) => c === N.walls).length;
  if (!copies) return [];
  const committed = allCharacters(s).filter(
    (u) => committedIds.includes(u.id) && isAlly(u),
  );
  return playerOrder(s).flatMap((p) => {
    const n = committed.filter((u) => ownerOf(s, u) === p).length;
    return n ? [fx("ncoThreat", { value: n * copies, player: p })] : [];
  });
}
/**
 * Patrol Ship: "*Forced: After Patrol Ship is discarded from the encounter
 * deck during a Sailing test, cancel all [Sailing] symbols found unless you
 * add it to the staging area."
 */
function ncoSailingSymbolsFound(s: GameState, successes: number) {
  const test = s.sailing?.test;
  if (!ncoLive(s) || !test?.looked?.includes(N.patrolShip)) return false;
  prepend(
    s,
    fx("ncoPatrolShipFound", { value: successes, player: test.player }),
  );
  return true;
}

// ------------------------------------------------------------- shadows

function ncoShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ncoLive(s)) return false;
  const enemy = get(s, c.enemyId),
    player = c.attackPlayer ?? firstPlayer(s);
  const raider = !!enemy && trait(enemy, "Raider");
  switch (code) {
    // Corsair Loyalist: "If attacking enemy is a Raider, either add 2
    // resources to attacking enemy, or attacking enemy makes an additional
    // attack after this one."
    case N.loyalist:
      if (enemy && raider)
        prepend(
          s,
          fx("ncoLoyalist", { target: enemy.id, player: firstPlayer(s) }),
        );
      return true;
    // Inspiring Fury: "Shuffle the encounter discard pile into the encounter
    // deck and deal attacking enemy 3 additional shadow cards. During this
    // attack, shadow effects cannot be canceled."
    case N.fury: {
      c.ncoFury = true;
      if (!enemy) return true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const dealt = dealEnemyShadows(s, enemy, 3);
      log(
        s,
        `Inspiring Fury: the encounter discard pile is shuffled into the encounter deck and ${name(enemy)} is dealt ${dealt.length} more shadow card${dealt.length === 1 ? "" : "s"}; shadow effects cannot be canceled during this attack.`,
        "danger",
      );
      prepend(s, ...dealt.map((x) => fx("shadowReveal", { code: x })));
      return true;
    }
    // Umbar Patrol: "Add 1 resource to each Raider enemy engaged with you."
    case N.patrol:
      for (const u of seatView(s, player).engaged.filter(
        (x) => isEnemy(x) && trait(x, "Raider"),
      ))
        u.resources += 1;
      log(
        s,
        "Umbar Patrol: each Raider enemy engaged with the defending player gets 1 resource.",
        "danger",
      );
      return true;
    // Raise the Alarm!: "If attacking enemy is a Raider, after this attack
    // ends, add 1 resource to attacking enemy for each damage dealt by this
    // attack."
    case N.alarm:
      if (raider) c.ncoAlarm = (c.ncoAlarm ?? 0) + 1;
      return true;
    // Slave Trade: "Discard an attachment you control. If attacking enemy is
    // a Raider, add resources to it equal to that attachment's printed cost."
    case N.slaveTrade:
      prepend(
        s,
        fx("ncoSlaveShadow", {
          target: enemy?.id,
          flag: raider,
          player,
        }),
      );
      return true;
  }
  return false;
}
/**
 * Raise the Alarm!'s shadow, after the attack; The Cursed Sword: "Forced:
 * After Captain Sahír attacks and deals excess damage, assign that excess
 * damage to Captain Sahír as resources. (Limit once per round.)"
 */
function ncoAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!ncoLive(s) || skipped) return [];
  const enemy = get(s, combat.enemyId);
  const out: Effect[] = [];
  const dealt = combat.damageDealt ?? 0;
  if (enemy && combat.ncoAlarm && dealt > 0)
    out.push(
      fx("ncoResources", {
        target: enemy.id,
        value: dealt * combat.ncoAlarm,
        player: combat.attackPlayer ?? firstPlayer(s),
        text: "Raise the Alarm!",
      }),
    );
  if (
    enemy &&
    enemy.code === C.sahir &&
    (combat.nmExcess ?? 0) > 0 &&
    s.nightmare?.citySword !== s.round &&
    enemy.attachments.some((a) => a.code === N.sword && !a.blanked)
  )
    out.push(
      fx("ncoSword", {
        target: enemy.id,
        value: combat.nmExcess,
        player: combat.attackPlayer ?? firstPlayer(s),
      }),
    );
  return out;
}
/** The Cursed Sword: Captain Sahír's excess damage (damage beyond the remaining hit points of the character damaged by his attack). */
function ncoDamageDealt(
  s: GameState,
  u: Unit,
  _amount: number,
  ctx: DamageContext,
) {
  const c = s.combat;
  if (
    !ncoLive(s) ||
    !c ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !allCharacters(s).some((x) => x.id === u.id)
  )
    return;
  const enemy = get(s, c.enemyId);
  if (
    !enemy ||
    enemy.code !== C.sahir ||
    !enemy.attachments.some((a) => a.code === N.sword && !a.blanked)
  )
    return;
  c.nmExcess = (c.nmExcess ?? 0) + Math.max(0, u.damage - stats(s, u).health);
}

// ------------------------------------------------------------- revealed

function ncoEncounter(s: GameState, code: string, replay: boolean) {
  if (!ncoLive(s)) return false;
  const kind =
    code === N.fury
      ? "ncoFury"
      : code === N.alarm
        ? "ncoAlarm"
        : code === N.slaveTrade
          ? "ncoSlaveTrade"
          : undefined;
  if (!kind) return false;
  prepend(s, fx(kind, { code, flag: replay, player: firstPlayer(s) }));
  return true;
}
/**
 * Umbar Patrol: "Forced: At the end of the encounter phase, if Umbar Patrol
 * is in the staging area, add 2 resources to the Raider enemy with the most
 * resources on it."
 */
function ncoEncounterEnd(s: GameState): Effect[] {
  if (!ncoLive(s)) return [];
  return staged(s, N.patrol).map((u) =>
    fx("ncoPatrol", { source: u.id, player: firstPlayer(s) }),
  );
}
/** Umbar Bridge: "Travel: Reduce the engagement cost of each Corsair enemy to 0 until the end of the round." */
function ncoTravelEffects(s: GameState, u: Unit) {
  if (!ncoLive(s) || u.code !== N.bridge || u.blanked) return undefined;
  return [fx("ncoBridgeTravel", { player: firstPlayer(s) })];
}

// ------------------------------------------------------------- effects

function nightmareCityEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nco")) return false;
  if (!ncoLive(s)) return true;
  const u = get(s, e.target);
  const player = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "ncoThreat":
      forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `Walls of Umbar: ${seatName(s, player)} raises their threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "ncoResources":
      if (u && isEnemy(u)) {
        u.resources += e.value ?? 0;
        log(
          s,
          `${e.text ?? "The Nightmare Deck"}: ${name(u)} gets ${e.value} resource${e.value === 1 ? "" : "s"}.`,
          "danger",
        );
      }
      return true;
    // Corsair Loyalist's shadow names no player: the first player chooses.
    case "ncoLoyalist":
      if (u && isEnemy(u))
        choose(s, "Corsair Loyalist · Shadow", [
          {
            id: "resources",
            code: u.code,
            label: `Add 2 resources to ${name(u)}`,
            effects: [
              fx("ncoResources", {
                target: u.id,
                value: 2,
                player,
                text: "Corsair Loyalist",
              }),
            ],
          },
          {
            id: "attack",
            code: u.code,
            label: `${name(u)} makes an additional attack after this one`,
            effects: [fx("ncoExtraAttack", { target: u.id, player })],
          },
        ]);
      return true;
    case "ncoExtraAttack":
      if (s.combat && u && s.combat.enemyId === u.id)
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      return true;
    case "ncoSword":
      if (u && u.code === C.sahir && s.nightmare?.citySword !== s.round) {
        (s.nightmare ??= {}).citySword = s.round;
        u.resources += e.value ?? 0;
        log(
          s,
          `The Cursed Sword: Captain Sahír takes the ${e.value} excess damage as resources.`,
          "danger",
        );
      }
      return true;
    // Inspiring Fury: "When Revealed: Deal Inspiring Fury to the enemy with
    // the highest [attack], as a shadow card." (Its surge is the keyword's.)
    case "ncoFury": {
      const list = enemies(s);
      if (!list.length) {
        if (!e.flag) s.encounterDiscard.push(N.fury);
        log(s, "Inspiring Fury: there is no enemy to deal it to.");
        return true;
      }
      const top = Math.max(...list.map((x) => stats(s, x).attack));
      const highest = list.filter((x) => stats(s, x).attack === top);
      if (highest.length === 1) {
        prepend(
          s,
          fx("ncoFuryDeal", {
            target: highest[0].id,
            flag: e.flag,
            player: firstPlayer(s),
          }),
        );
        return true;
      }
      choose(
        s,
        "Inspiring Fury · The enemy with the highest attack",
        highest.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Deal Inspiring Fury to ${name(x)} as a shadow card`,
          effects: [
            fx("ncoFuryDeal", {
              target: x.id,
              flag: e.flag,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      return true;
    }
    case "ncoFuryDeal":
      if (u && isEnemy(u)) {
        dealAsShadow(s, u, N.fury);
        log(
          s,
          `Inspiring Fury is dealt to ${name(u)} as a shadow card.`,
          "danger",
        );
      } else if (!e.flag) s.encounterDiscard.push(N.fury);
      return true;
    // Raise the Alarm!: "When Revealed: Discard cards from the top of the
    // encounter deck until a Raider enemy is discarded. Add that enemy to the
    // staging area and place 3 resources on it."
    case "ncoAlarm": {
      if (!e.flag) s.encounterDiscard.push(N.alarm);
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (isEnemy({ code } as Unit) && trait({ code }, "Raider")) {
          const enemy = make(s, code);
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
          cityCardEntered(s, enemy, false, false);
          enemy.resources += 3;
          log(
            s,
            `Raise the Alarm!: ${name(enemy)} is added to the staging area with 3 resources.`,
            "danger",
          );
          return true;
        }
        s.encounterDiscard.push(code);
        log(s, `Raise the Alarm! discards ${card(code).name}.`);
      }
      log(s, "Raise the Alarm!: the encounter deck holds no Raider enemy.");
      return true;
    }
    // Slave Trade: "When Revealed: Each player deals 2 damage to an ally he
    // or she controls. For each ally destroyed by this effect, place
    // resources on a Raider enemy in play equal to that ally's resource
    // cost."
    case "ncoSlaveTrade":
      if (!e.flag) s.encounterDiscard.push(N.slaveTrade);
      prepend(
        s,
        ...playerOrder(s).map((p) => fx("ncoSlaveChoose", { player: p })),
      );
      return true;
    case "ncoSlaveChoose": {
      const allies = allCharacters(s).filter(
        (x) => isAlly(x) && ownerOf(s, x) === player,
      );
      if (!allies.length) return true;
      choose(
        s,
        `Slave Trade · ${seatName(s, player)} deals 2 damage to an ally`,
        allies.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Deal 2 damage to ${name(x)}`,
          effects: [
            fx("damage", { target: x.id, value: 2, player }),
            // No player is named: the first player places the resources.
            fx("ncoSlaveCheck", {
              target: x.id,
              value: printedCost(x.code),
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      return true;
    }
    case "ncoSlaveCheck": {
      const value = e.value ?? 0;
      if (u || value <= 0) return true;
      const options = raiderOptions(s, "ncoResources", value);
      if (options.length)
        choose(
          s,
          `Slave Trade · Place ${value} resource${value === 1 ? "" : "s"} on a Raider enemy`,
          options.map((o) => ({
            ...o,
            effects: o.effects.map((x) => ({ ...x, text: "Slave Trade" })),
          })),
        );
      return true;
    }
    case "ncoSlaveShadow": {
      const attached = [
        ...allCharacters(s),
        ...s.staging,
        ...allEngaged(s),
        ...allActiveLocations(s),
      ].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              card(a.code).sphere_code !== "encounter" &&
              !card(a.code).text?.includes("Permanent") &&
              (attachmentController(s, host, a) ?? ownerOf(s, host)) === player,
          )
          .map((a) => ({ host, a })),
      );
      if (!attached.length) return true;
      choose(
        s,
        "Slave Trade · Discard an attachment you control",
        attached.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${card(a.code).name} (${name(host)})`,
          effects: [
            fx("ncoSlaveDiscard", {
              target: host.id,
              source: a.id,
              code: a.code,
              flag: e.flag,
              text: e.target,
              player,
            }),
          ],
        })),
      );
      return true;
    }
    case "ncoSlaveDiscard": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a) return true;
      discardAttachment(s, u, a);
      const raider = get(s, e.text);
      const value = printedCost(e.code!);
      if (e.flag && raider && isEnemy(raider) && value > 0) {
        raider.resources += value;
        log(
          s,
          `Slave Trade: ${name(raider)} gets ${value} resource${value === 1 ? "" : "s"}.`,
          "danger",
        );
      }
      return true;
    }
    case "ncoPatrol": {
      if (!staged(s, N.patrol).some((x) => x.id === e.source)) return true;
      const options = raiderOptions(s, "ncoResources", 2, true);
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        choose(
          s,
          "Umbar Patrol · The Raider enemy with the most resources",
          options,
        );
      return true;
    }
    case "ncoBridgeTravel":
      for (const x of enemies(s).filter((x) => trait(x, "Corsair")))
        x.tempEngagement = (x.tempEngagement ?? 0) - 999;
      log(
        s,
        "Umbar Bridge · Travel: each Corsair enemy's engagement cost is 0 until the end of the round.",
        "danger",
      );
      return true;
    case "ncoPatrolShipFound": {
      const test = s.sailing?.test;
      if (!test || test.phase !== "results") return true;
      const kept = Math.max(0, e.value ?? 0);
      if (!test.looked?.includes(N.patrolShip) || kept <= 0) {
        prepend(s, fx("sailingHeading", { value: kept, player: test.player }));
        return true;
      }
      choose(
        s,
        "Patrol Ship · Sailing test",
        [
          {
            id: "staging",
            code: N.patrolShip,
            label: "Add Patrol Ship to the staging area",
            effects: [
              fx("ncoPatrolShipAdd", { value: kept, player: test.player }),
            ],
          },
          {
            id: "cancel",
            label: `Cancel all ${kept} Sailing symbol${kept === 1 ? "" : "s"} found`,
            effects: [fx("sailingHeading", { value: 0, player: test.player })],
          },
        ],
        `${kept} uncancelled; ${sailingHeadingLabel(s.sailing!.heading)}.`,
      );
      return true;
    }
    case "ncoPatrolShipAdd": {
      const test = s.sailing?.test;
      const at = test?.looked?.indexOf(N.patrolShip) ?? -1;
      if (!test || at < 0) return true;
      test.looked!.splice(at, 1);
      (test.kept ??= []).push(N.patrolShip);
      const ship = make(s, N.patrolShip);
      s.staging.push(ship);
      enemyAddedToStaging(s, ship);
      log(s, "Patrol Ship is added to the staging area.", "danger");
      // Another copy discarded by the same test asks again.
      prepend(
        s,
        fx("ncoPatrolShipFound", { value: e.value, player: test.player }),
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- saves

export function validNightmareCity(s: GameState) {
  const q = s.nightmare;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const b = q?.cityBridge;
  return (
    (b === undefined ||
      (ncoLive(s) &&
        !!b &&
        typeof b === "object" &&
        round(b.round) &&
        typeof b.quest === "string" &&
        Number.isInteger(b.canceled) &&
        b.canceled > 0)) &&
    (q?.citySword === undefined || (ncoLive(s) && round(q.citySword)))
  );
}

export const NIGHTMARE_CITY_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  progress: ncoProgress,
  cannotDefend: ncoCannotDefend,
  cannotCancel: ncoCannotCancel,
  attachmentImmune: ncoAttachmentImmune,
  headingShifted: ncoHeadingShifted,
  sailingCommitted: ncoSailingCommitted,
  sailingDiscarded: ncoSailingDiscarded,
  sailingSymbolsFound: ncoSailingSymbolsFound,
  shadow: ncoShadow,
  attackFinished: ncoAttackFinished,
  damageDealt: ncoDamageDealt,
  encounter: ncoEncounter,
  encounterEnd: ncoEncounterEnd,
  travelEffects: ncoTravelEffects,
  effect: nightmareCityEffect,
  sharedEffect: () => false,
};
