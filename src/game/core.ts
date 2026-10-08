import { selectedSideQuest } from "./side-quest-support";
import * as Realm from "./lost-realm-player";
import * as Antlered from "./antlered";
import * as Celebrimbor from "./celebrimbor";
import { imageUrl } from "./cards";
import {
  ninNoCardEconomy,
  ninCurrentQuest,
  NIN_QUESTS,
} from "./nin-eilph-support";
import * as Nin from "./nin-eilph";
import * as Tharbad from "./tharbad";
import { trialsStageInfo } from "./three-trials-support";
import * as Trials from "./three-trials";
import { trialsGrantedImmunity } from "./three-trials-support";
import * as DunlandQuest from "./dunland-trap";
import { FANGORN } from "./fangorn-support";
import * as Fangorn from "./fangorn";
import * as Catch from "./catch-orc";
import * as Fords from "./fords-isen";
import * as Isengard from "./voice-isengard";
import { ringMakerSecrecy } from "./ring-maker-player";
import { finalRingFollowFirst } from "./ring-maker-final-player";
import * as BloodQuest from "./blood-gondor";
import * as MorgulQuest from "./morgul-vale";
import { playerOrder } from "./table";
import {
  druadanForestStats,
  druadanForestThreat,
  druadanForestThreatBonus,
  druadanForestCostIncrease,
  druadanForestCannotGainResources,
} from "./druadan-forest";
import { amonDinEnemyAttackBonus } from "./amon-din";
import {
  assaultOsgiliathAttackBonus,
  assaultOsgiliathQuestStat,
} from "./assault-osgiliath";
import { shadowFlameAttackBonus } from "./shadow-flame";
import {
  heirsStats,
  heirsStagingThreatBonus,
  heirsStagingQuestCharacters,
  heirsQuestStat,
  heirsEngagementCost,
  heirsCanSpendResources,
  heirsObjectiveFree,
} from "./heirs-numenor";
import {
  stewardFearLocationQuestBonus,
  stewardFearEnemyAttackBonus,
  stewardFearIsClue,
} from "./steward-fear";
import {
  foundationsAllAreaUnits,
  foundationsStageInfo,
} from "./foundations-stone-support";
import {
  foundationsStats,
  foundationsEnemyX,
  foundationsDrawHero,
  foundationsObjectiveFree,
} from "./foundations-stone";
import { globalCharacters, globalEngaged } from "./table";
import { morgulPlayerStats, morgulPlayerCost } from "./morgul-player-cards";
import {
  osgiliathPlayerStats,
  osgiliathPlayerCost,
} from "./osgiliath-player-cards";
import { bloodPlayerCost } from "./blood-gondor-player-cards";
import {
  druadanPlayerStats,
  druadanPlayerQuestStat,
  druadanPlayerDefenseStat,
} from "./druadan-player-cards";
import {
  amonPlayerStats,
  amonPlayerCost,
  amonPlayerEnemyCannotAttack,
} from "./amon-din-player-cards";
import {
  stewardPlayerStats,
  stewardPlayerCanPay,
} from "./steward-player-cards";
import { longDarkThreatBonus, longDarkDefenseBonus } from "./long-dark";
import {
  heirsPlayerCost,
  heirsPlayerStats,
  heirsPlayerThreatModifier,
} from "./heirs-player-cards";
import {
  deckCardTaken,
  deckCardInserted,
  deckCardsSwapped,
  deckCardsReordered,
} from "./physical-player-card";
import {
  collectorEnemyCannotAttack,
  collectorLocationQuestBonus,
} from "./collector-player-cards";
import { mainQuestUnit } from "./quest-state";
import {
  watcherWaterLocationQuest,
  watcherWaterZeroCombatStats,
  watcherWaterCannotExhaust,
  watcherWaterCannotReady,
} from "./watcher-water";
import {
  longDarkPlayerEnemyCannotAttack,
  longDarkPlayerStats,
} from "./long-dark-player-cards";
import { redhornStatBonus, redhornWillCounts } from "./redhorn-gate";
import { rohanStats, rohanPlayCost } from "./rohan-player-cards";
import { watcherPlayerStats } from "./watcher-player-cards";
import { redhornPlayerStats, redhornPlayerCost } from "./redhorn-player-cards";
import {
  khazadStatBonus,
  khazadThreatBonus,
  khazadLocationQuest,
  khazadWillCounts,
  khazadStageInfo,
  khazadCannotPlay,
  KHAZAD,
  khazadCannotExhaust,
  khazadCannotReady,
} from "./khazad-dum";
// Shared helpers: state access, randomness, logging, effect queue helpers, statistics and payments.
import { card, name } from "./cards";
import { shadowFlamePlayerStats } from "./shadow-flame-player-cards";
import type { Card, Effect, GameState, Option, Unit } from "./types";
import { scenario, OBJECTIVES, CLUE } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allActiveLocations,
  allHeroes,
  allEngaged,
  forOwner,
  ownerOf,
  seatName,
  seatView,
  selectSeat,
  scopedEffect,
} from "./table";

import { observe } from "./presentation";
import {
  expansionStats,
  hasTrait,
  hasResourceIcon,
  restrictedSlots,
  restrictedLimit,
  restrictedAttachment,
  secrecyDiscount,
  singlePoolCard,
} from "./expansion-passives";
import {
  carrockStatBonus,
  carrockThreatBonus,
  carrockPaysLeadership,
  isSacked,
} from "./carrock";
import {
  emynMuilPlayCost,
  emynMuilThreatBonus,
  emynMuilStatBonus,
  emynMuilEventsBlocked,
} from "./emyn-muil";
import { syncAttachmentText } from "./attachment-text";
import { gondorRoundStats } from "./gondor-player-cards";
import {
  RHOS,
  rhosgobelFollowFirstPlayer,
  rhosgobelThreatBonus,
} from "./rhosgobel";
import { dwarfStats, dwarfAdditionalCost } from "./dwarf-player-cards";

import {
  returnMirkwoodCanFight,
  returnMirkwoodCannotPlay,
} from "./return-mirkwood";

import { mirkwoodPlayerStats } from "./mirkwood-player-cards";

import { khazadPlayerStats } from "./khazad-player-cards";

import {
  elfEnemyCannotAttack,
  elfStats,
  elfPlayCost,
} from "./elf-player-cards";

export const observation = (s: GameState) =>
  s.flow ? observe(s, stats, stagingThreat, threatOf) : undefined;

export class RuleError extends Error {}

export function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuleError(message);
}

export const fx = (kind: string, data: Omit<Effect, "kind"> = {}): Effect => ({
  kind,
  ...data,
});

export const skip: Option = {
  id: "skip",
  label: "Continue without using this ability",
  effects: [],
};

/** Positive resource gains include transfers; the resource phase is not a card effect. */
export const canGainResources = (
  s: GameState,
  u: Unit,
  cardEffect = true,
  transfer = false,
) =>
  !(cardEffect && !transfer && ninNoCardEconomy(s)) &&
  !isSacked(u) &&
  !druadanForestCannotGainResources(s, u, cardEffect) &&
  !Fords.fordsCannotGainResources(s, cardEffect);

export const cannotReady = (u: Unit, s?: GameState) =>
  khazadCannotReady(u) ||
  watcherWaterCannotReady(u) ||
  Catch.catchCannotReady(u) ||
  (!!s && Fangorn.fangornCannotReady(s, u));

export const characters = (s: GameState) => [...s.heroes, ...s.allies];

export const units = (s: GameState) => [
  ...allCharacters(s),
  ...s.staging,
  ...allEngaged(s),
  ...allActiveLocations(s),
  ...(s.assaultOsgiliath?.controlled ?? []),
  ...(s.bloodGondor?.captured ?? []),
];
/** Physical identity and uniqueness remain global across separated staging areas. */
export const globalUnits = (s: GameState) => [
  ...globalCharacters(s),
  ...globalEngaged(s),
  ...foundationsAllAreaUnits(s),
  ...(s.assaultOsgiliath?.controlled ?? []),
  ...(s.bloodGondor?.captured ?? []),
];

export const get = (s: GameState, id?: string) =>
  units(s).find((u) => u.id === id) ??
  (mainQuestUnit(s)?.id === id ? mainQuestUnit(s) : undefined);
/** Moving a physical shadow preserves which remaining cards are still facedown. */
export function removeShadowCard(enemy: Unit, index: number) {
  if (index < 0 || index >= enemy.shadows.length) return undefined;
  const removedCode = enemy.shadows[index];
  if (index < (enemy.revealedShadowCount ?? 0))
    enemy.revealedShadowCount = Math.max(
      0,
      (enemy.revealedShadowCount ?? 0) - 1,
    );
  const removed = enemy.shadows.splice(index, 1)[0];
  enemy.faceupShadows?.splice(index, 1);
  const resolved = enemy.shadows.slice(0, enemy.revealedShadowCount ?? 0);
  if (removedCode === KHAZAD.leader && !resolved.includes(KHAZAD.leader))
    delete enemy.shadowCancelsDamage;
  if (removedCode === KHAZAD.passage && !resolved.includes(KHAZAD.passage))
    delete enemy.shadowCancelsCombatDamage;
  return removed;
}

export function random(s: GameState) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    if (a === (s.deck as unknown)) deckCardsSwapped(s, i, j);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function make(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    ...(trialsGrantedImmunity(s, code) ? { immuneToPlayerEffects: true } : {}),
    ...(s.table ? { owner: activeSeat(s) } : {}),
    code,
    exhausted: false,
    damage: 0,
    progress: 0,
    resources: 0,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}

/** Remove the actual indexed card while retaining any phase identity. */
export function takePlayerDeck(s: GameState, index = 0): Unit {
  requireRule(
    index >= 0 && index < s.deck.length,
    "Choose an actual card in your player deck.",
  );
  const identity = deckCardTaken(s, index),
    u = make(s, s.deck.splice(index, 1)[0]);
  if (identity) {
    u.id = identity.id;
    if (identity.owner !== undefined) u.owner = identity.owner;
  }
  return u;
}
export function putPlayerDeck(s: GameState, u: Unit, index = s.deck.length) {
  requireRule(
    index >= 0 && index <= s.deck.length,
    "Choose a valid deck position.",
  );
  deckCardInserted(s, index, u);
  s.deck.splice(index, 0, u.code);
}
/** Permute the original indexed cards; identical printings retain separate identities. */
export function reorderPlayerDeck(
  s: GameState,
  start: number,
  order: number[],
) {
  requireRule(
    start >= 0 &&
      start + order.length <= s.deck.length &&
      new Set(order).size === order.length &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < order.length),
    "Order each original card exactly once.",
  );
  const original = s.deck.slice(start, start + order.length);
  deckCardsReordered(s, start, order);
  s.deck.splice(start, order.length, ...order.map((i) => original[i]));
}

export function log(
  s: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "normal",
) {
  s.log.push({
    id: s.nextId++,
    round: s.round,
    text,
    kind,
    ...(s.table ? { player: activeSeat(s) } : {}),
  });
  if (s.log.length > 250) s.log.shift();
}

export function prepend(s: GameState, ...effects: Effect[]) {
  s.queue.unshift(...effects.map((e) => scopedEffect(s, e)));
}

export function enqueue(s: GameState, ...effects: Effect[]) {
  s.queue.push(...effects.map((e) => scopedEffect(s, e)));
}

export function choose(
  s: GameState,
  title: string,
  options: Option[],
  description?: string,
) {
  if (options.length)
    s.choice = {
      title,
      options: options.map((o) => ({
        ...o,
        effects: o.effects.map((e) => scopedEffect(s, e)),
      })),
      description,
    };
}

export function opts(
  list: Unit[],
  effect: (u: Unit) => Effect[],
  detail?: (u: Unit) => string,
): Option[] {
  return list.map((u) => ({
    id: u.id,
    label: name(u),
    code: u.code,
    detail: detail?.(u),
    effects: effect(u),
  }));
}

export const has = (u: Unit, code: string) =>
  u.attachments.some((a) => !a.blanked && a.code === code);

export const restricted = (u: Unit) =>
  u.attachments.filter((a) => !a.blanked && restrictedAttachment(a.code));

export function restrictAttachments(s: GameState, u: Unit) {
  syncAttachmentText(s, u);
  if (restrictedSlots(u) <= restrictedLimit(u)) return;
  selectSeat(s, ownerOf(s, u));
  choose(
    s,
    `Restricted attachments · ${name(u)}`,
    restricted(u).map((a) => ({
      id: a.id,
      code: a.code,
      label: `Discard ${card(a.code).name}`,
      effects: [fx("discardAttachment", { target: u.id, source: a.id })],
    })),
    `Choose one attachment to discard. This character has ${restrictedSlots(u)} restricted slots used and may keep ${restrictedLimit(u)}.`,
  );
}

export function followFirstPlayer(s: GameState) {
  if (!s.table) return;
  finalRingFollowFirst(s);
  rhosgobelFollowFirstPlayer(s);
  const mendor = allCharacters(s).find((u) => u.code === "rc135");
  if (!mendor || ownerOf(s, mendor) === s.table.first) return;
  const from = ownerOf(s, mendor),
    to = s.table.first;
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== mendor.id);
  });
  forOwner(s, to, () => {
    s.allies.push(mendor);
  });
  log(s, `Mendor follows the first player: ${seatName(s, to)}.`);
}

export function hasGondor(u: Unit) {
  return hasTrait(u, "Gondor");
}

export function stats(s: GameState, u: Unit) {
  syncAttachmentText(s, u);
  const c = card(u.code);
  const bonus = expansionStats(s, u);
  const carrockBonus = carrockStatBonus(s, u);
  const gondorBonus = gondorRoundStats(s, u);
  const elfBonus = elfStats(s, u);
  const rohanBonus = rohanStats(s, u);
  const watcherBonus = watcherPlayerStats(s, u);
  const redhornBonus = redhornPlayerStats(s, u);
  const snowBonus = redhornStatBonus(s, u);
  const longDarkBonus = longDarkPlayerStats(s, u);
  const scenarioBonus = khazadStatBonus(s, u);
  const khazadBonus = khazadPlayerStats(s, u);
  const dwarfBonus = dwarfStats(s, u);
  const mirkwoodBonus = mirkwoodPlayerStats(s, u);
  const shadowFlameBonus = shadowFlamePlayerStats(s, u);
  const heirsBonus = heirsPlayerStats(s, u);
  const stewardBonus = stewardPlayerStats(s, u);
  const druadanBonus = druadanPlayerStats(s, u);
  const amonBonus = amonPlayerStats(s, u);
  const morgulBonus = morgulPlayerStats(s, u);
  const osgiliathBonus = osgiliathPlayerStats(s, u);
  const foundationsBonus = foundationsStats(s, u);
  const namelessX = foundationsEnemyX(s, u);
  const heirsScenarioBonus = heirsStats(s, u);
  const druadanScenarioBonus = druadanForestStats(s, u);
  const result = {
    will: Math.max(
      0,
      (c.willpower ?? 0) +
        [
          foundationsBonus.will,
          druadanScenarioBonus.will,
          morgulBonus.will,
          osgiliathBonus.will,
          amonBonus.will,
          stewardBonus.will,
          bonus.will,
          dwarfBonus.will,
          mirkwoodBonus.will,
          khazadBonus.will,
          elfBonus.will,
          rohanBonus.will,
          Isengard.isengardWill(s, u),
          snowBonus.will,
          longDarkBonus.will,
          shadowFlameBonus.will,
          Realm.realmWillBonus(s, u),
          u.code === "rc135" && s.mendorBoost ? 2 : 0,
          u.attachments.filter((a) => !a.blanked && a.code === "01027").length *
            2,
          u.attachments.filter((a) => !a.blanked && a.code === "01055").length,
          -u.attachments.filter((a) => !a.blanked && a.code === "01071").length,
          u.tempWill ?? 0,
          -Nin.ninStatPenalty(s, u),
          u.code === "01007" ? u.boost : 0,
          -(u.committed ? s.questDebuff : 0),
        ].reduce(
          (sum, value) =>
            sum + (Realm.realmWillProtected(s, u) ? Math.max(0, value) : value),
          0,
        ),
    ),
    attack: watcherWaterZeroCombatStats(u)
      ? 0
      : (namelessX ?? c.attack ?? 0) +
        foundationsBonus.attack +
        heirsScenarioBonus.attack +
        Fords.fordsAttackBonus(s, u) +
        Catch.catchAttackBonus(s, u) +
        DunlandQuest.dunlandCombatBonus(s, u) +
        Trials.trialsAttackBonus(s, u) +
        amonDinEnemyAttackBonus(s, u) +
        assaultOsgiliathAttackBonus(s, u) +
        stewardFearEnemyAttackBonus(s, u) +
        morgulBonus.attack +
        osgiliathBonus.attack +
        shadowFlameAttackBonus(s, u) +
        stewardBonus.attack +
        bonus.attack +
        dwarfBonus.attack +
        mirkwoodBonus.attack +
        elfBonus.attack +
        redhornBonus.attack +
        watcherBonus.attack +
        rohanBonus.attack +
        scenarioBonus.attack +
        snowBonus.attack +
        longDarkBonus.attack +
        carrockBonus.attack +
        gondorBonus.attack +
        emynMuilStatBonus(s, u) +
        (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
        (u.tempAttack ?? 0) -
        Nin.ninStatPenalty(s, u) +
        Nin.ninAttackBonus(u) +
        (u.roundAttack ?? 0) +
        (u.code === "01004" && !u.blanked ? u.damage : 0) +
        u.attachments.filter((a) => !a.blanked && a.code === "01041").length *
          (c.traits?.includes("Dwarf") ? 2 : 1) +
        (c.type_code === "enemy"
          ? u.boost +
            (u.code === "01090" ? u.resources * 2 : 0) +
            (u.code === "02021" ? 2 * cluesInPlay(s) : 0)
          : 0),
    defense: watcherWaterZeroCombatStats(u)
      ? 0
      : Math.max(
          0,
          (c.defense ?? 0) +
            (u.roundDefense ?? 0) +
            foundationsBonus.defense +
            heirsScenarioBonus.defense +
            DunlandQuest.dunlandCombatBonus(s, u) +
            druadanScenarioBonus.defense +
            osgiliathBonus.defense +
            druadanBonus.defense +
            stewardBonus.defense +
            longDarkDefenseBonus(s, u) +
            heirsBonus.defense +
            bonus.defense +
            dwarfBonus.defense +
            mirkwoodBonus.defense +
            elfBonus.defense +
            redhornBonus.defense +
            watcherBonus.defense +
            rohanBonus.defense +
            scenarioBonus.defense +
            carrockBonus.defense +
            gondorBonus.defense +
            (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
            (u.tempDefense ?? 0) -
            Nin.ninStatPenalty(s, u) -
            Realm.realmDefensePenalty(s, u) -
            (s.combat?.ninDefensePenalties?.[u.id] ?? 0) +
            (s.combat?.defenseBonuses?.[u.id] ?? 0),
        ),
    health:
      (namelessX ?? c.health ?? 0) +
      foundationsBonus.health +
      stewardBonus.health +
      bonus.health +
      u.attachments.filter((a) => !a.blanked && a.code === "01040").length * 4,
  };
  if (druadanPlayerDefenseStat(s, u)) result.defense = result.will;
  result.attack = Math.max(0, result.attack);
  return result;
}

/** Signs of Gollum in play: in the staging area or attached to heroes. */
export const cluesInPlay = (s: GameState) =>
  s.staging.filter((u) => u.code === CLUE).length +
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => a.code === CLUE).length;
export const hasClue = (u: Unit) => u.attachments.some((a) => a.code === CLUE);
export const riverlandsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) =>
    card(u.code).traits?.includes("Riverland"),
  );
/** An objective with an encounter card guarding it cannot be claimed. */
export const isGuarded = (s: GameState, u: Unit) =>
  units(s).some((x) => x.guarding === u.id);
/** Printed cost plus active-location surcharges (The East Bank, The West Bank). */
export function playCost(s: GameState, c: Card, target?: Unit) {
  syncAttachmentText(s, target);
  const printed = c.code === "08010" ? playerOrder(s).length : Number(c.cost);
  if (!Number.isFinite(printed)) return 0;
  const active = allActiveLocations(s);
  const surcharge = active.reduce(
    (n, l) =>
      n +
      ((l.code === "02018" && c.type_code === "ally") ||
      (l.code === "02019" && ["attachment", "event"].includes(c.type_code))
        ? 1
        : 0),
    0,
  );
  const gondorDiscount =
    c.code === "22003" && s.threat < 40
      ? 4
      : c.code === "05004"
        ? allCharacters(s).filter(
            (u) => card(u.code).type_code === "ally" && hasTrait(u, "Gondor"),
          ).length
        : 0;
  const baseCost = amonPlayerCost(
    s,
    c,
    heirsPlayerCost(
      s,
      c,
      rohanPlayCost(
        s,
        c,
        redhornPlayerCost(
          s,
          c,
          elfPlayCost(
            s,
            c,
            Math.max(
              0,
              printed +
                surcharge +
                emynMuilPlayCost(s, c) +
                druadanForestCostIncrease(s) -
                secrecyDiscount(s, c) -
                ringMakerSecrecy(s, c) -
                gondorDiscount,
            ) + dwarfAdditionalCost(c.code),
          ),
        ),
      ),
      target,
    ),
  );
  return Realm.realmPlayCost(
    s,
    c,
    Isengard.isengardCost(
      s,
      c,
      bloodPlayerCost(
        s,
        c,
        osgiliathPlayerCost(s, c, morgulPlayerCost(s, c, baseCost)),
      ),
    ),
  );
}
/** Current printed/modifier threat. Suppression only applies in staging. */
export const threatOf = (s: GameState, u: Unit) =>
  (u.suppressed || u.ignoreThreatRound === s.round) &&
  s.staging.some((x) => x.id === u.id)
    ? 0
    : Math.max(
        0,
        (BloodQuest.bloodGondorThreat(s, u) ??
          MorgulQuest.morgulBridgeValue(s, u) ??
          druadanForestThreat(s, u) ??
          card(u.code).threat ??
          0) +
          Fords.fordsThreatBonus(s, u) +
          Catch.catchThreatBonus(s, u) +
          DunlandQuest.dunlandThreatBonus(s, u) +
          Trials.trialsThreatBonus(s, u) +
          Tharbad.tharbadThreatBonus(s, u) +
          Nin.ninThreatBonus(s, u) +
          Celebrimbor.celebrimborThreatBonus(s, u) +
          Fangorn.fangornForestBonus(s, u) +
          druadanForestThreatBonus(s, u) +
          carrockThreatBonus(s, u) +
          emynMuilThreatBonus(s, u) +
          rhosgobelThreatBonus(s, u) +
          khazadThreatBonus(s, u) +
          heirsPlayerThreatModifier(u) +
          heirsStats(s, u).threat +
          longDarkThreatBonus(s, u) +
          (u.code === "02021" ? 2 * cluesInPlay(s) : 0) +
          (u.code === "02015"
            ? allCharacters(s).filter((x) => card(x.code).type_code === "ally")
                .length
            : 0) +
          (card(u.code).type_code === "location" &&
          s.staging.some((x) => x.id === u.id)
            ? (s.fog ?? 0)
            : 0) +
          (u.tempThreat ?? 0) -
          Realm.realmThreatPenalty(u) -
          u.attachments.filter((a) => !a.blanked && a.code === "01056").length,
      );

export const stagingThreat = (s: GameState) =>
  s.threatModifier +
  heirsStagingThreatBonus(s) +
  BloodQuest.bloodGondorStagingBonus(s) +
  s.staging
    .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
    .reduce((n, u) => n + threatOf(s, u), 0);

export const questWill = (s: GameState) =>
  [...allCharacters(s), ...heirsStagingQuestCharacters(s)]
    .filter(
      (u) =>
        redhornWillCounts(s, u) &&
        khazadWillCounts(s, u) &&
        (u.committed || seatView(s, ownerOf(s, u)).committedIds.includes(u.id)),
    )
    .reduce((n, u) => n + stats(s, u)[questStat(s)], 0);

export const questStat = (s: GameState) =>
  selectedSideQuest(s)
    ? druadanPlayerQuestStat(s)
    : (BloodQuest.bloodGondorQuestStat(s) ??
      assaultOsgiliathQuestStat(s) ??
      heirsQuestStat(s) ??
      druadanPlayerQuestStat(s));

export const locationQuest = (s: GameState, u: Unit) =>
  MorgulQuest.morgulBridgeValue(s, u) ??
  watcherWaterLocationQuest(s, u) ??
  (khazadLocationQuest(s, u) ?? card(u.code).quest ?? 0) +
    Tharbad.tharbadLocationQuest(s, u) +
    Antlered.antleredLocationBonus(s, u) +
    Fords.fordsLocationBonus(s, u) +
    Fangorn.fangornLocationBonus(s, u) +
    collectorLocationQuestBonus(u) +
    BloodQuest.bloodGondorLocationBonus(s, u) +
    stewardFearLocationQuestBonus(s, u);
export const engagementCost = (s: GameState, u: Unit) =>
  heirsEngagementCost(s, u) ??
  Math.max(
    0,
    (card(u.code).engagement ?? 0) +
      (u.tempEngagement ?? 0) +
      Tharbad.tharbadEngagementModifier(s, u) +
      Nin.ninEngagementModifier(s, u),
  );

export const mainStageInfo = (s: GameState) => {
  const nin = NIN_QUESTS.find((c) => c.code === ninCurrentQuest(s));
  if (nin)
    return {
      name: nin.back_name ?? nin.name,
      quest: nin.back_quest ?? 0,
      cardCode: nin.code,
      story: nin.back_text!,
      questImage: imageUrl({ ...nin, imagesrc: nin.back_imagesrc }),
    };
  const trial = trialsStageInfo(s);
  if (trial) return trial;
  const foundations = foundationsStageInfo(s);
  if (foundations) return foundations;
  const dynamic = khazadStageInfo(s);
  if (dynamic) return dynamic;
  if (s.scenarioId !== "mirkwood" || s.stage < 3)
    return scenario(s.scenarioId).stages[s.stage - 1];
  return s.branch === "beorn"
    ? {
        name: "Beorn’s Path",
        quest: 10,
        story:
          "Leave the forest behind. Ungoliant’s Spawn must not remain in play.",
      }
    : {
        name: "Don’t Leave the Path!",
        quest: 0,
        story: "Find and defeat Ungoliant’s Spawn to escape Mirkwood.",
      };
};

export const enemyAttackPrevented = (
  s: GameState,
  u: Unit,
  player = activeSeat(s),
) =>
  (["defense", "attack"].includes(s.phase) && Fangorn.hasHinder(u)) ||
  !!u.feinted ||
  !!u.preventedAttacks?.includes(player) ||
  has(u, "01069") ||
  amonPlayerEnemyCannotAttack(s, u, player) ||
  elfEnemyCannotAttack(s, u, player) ||
  collectorEnemyCannotAttack(s, u, player) ||
  longDarkPlayerEnemyCannotAttack(s, u, player);

export const canFight = (u: Unit) =>
  (u.code !== "08112" || !!u.blanked) &&
  returnMirkwoodCanFight(u) &&
  u.code !== "03011" &&
  (u.code !== "12117" || !!u.blanked) &&
  !has(u, "01108") &&
  !isSacked(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);

export const objectiveFree = (s: GameState, u: Unit) =>
  foundationsObjectiveFree(s, u) ??
  ((heirsObjectiveFree(s, u) ||
    stewardFearIsClue(u.code) ||
    OBJECTIVES.includes(u.code) ||
    u.code === FANGORN.mugash ||
    u.code === RHOS.athelas ||
    u.code === KHAZAD.book ||
    u.code === KHAZAD.tools) &&
    !units(s).some((x) => x.guarding === u.id));

export const objectiveCount = (s: GameState) =>
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => OBJECTIVES.includes(a.code)).length;

export const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allEngaged(s)].some((u) => u.code === code);

export const resources = (s: GameState, sphere?: string) => {
  syncAttachmentText(s);
  return s.heroes
    .filter(
      (h) =>
        !sphere ||
        hasResourceIcon(h, sphere) ||
        (sphere === "leadership" && carrockPaysLeadership(s, h)),
    )
    .reduce((n, h) => n + h.resources, 0);
};

export function eligiblePayers(s: GameState, c: Card, target?: Unit) {
  syncAttachmentText(s);
  const actualCost = playCost(s, c, target);
  const heroes = s.heroes
    .filter((h) => actualCost === 0 || heirsCanSpendResources(s, h))
    .filter(
      (h) =>
        stewardPlayerCanPay(s, h, c, actualCost) ||
        (c.code === "22062" && hasTrait(h, "Rohan")) ||
        hasResourceIcon(h, c.sphere_code) ||
        (actualCost > 0 &&
          c.type_code === "ally" &&
          h.code === "04128" &&
          !h.blanked) ||
        (c.sphere_code === "leadership" && carrockPaysLeadership(s, h)),
    );
  return [
    ...heroes,
    ...s.allies.filter(
      (u) =>
        !u.blanked &&
        ((u.code === "02059" && hasTraitCard(c, "Creature")) ||
          (u.code === "08146" &&
            hasTraitCard(c, "Ent") &&
            c.playOrigin !== "deck" &&
            c.playOrigin !== "discard")),
    ),
  ];
}

/** Card and ability costs share spending restrictions; transfers and losses do not. */
export function spendResources(s: GameState, hero: Unit, amount: number) {
  requireRule(
    Number.isInteger(amount) && amount >= 0 && hero.resources >= amount,
    "Not enough resources.",
  );
  requireRule(
    amount === 0 ||
      card(hero.code).type_code !== "hero" ||
      heirsCanSpendResources(s, hero),
    "Orc Vanguard prevents this hero from spending resources.",
  );
  hero.resources -= amount;
  if (amount > 0) hero.resourcesSpentRound = s.round;
}

const hasTraitCard = (c: Card, trait: string) =>
  (c.traits ?? "").split(".").some((t) => t.trim() === trait);

/** Response offers must use the same sphere and active-location cost as payment. */
export const canPay = (s: GameState, c: Card) =>
  !Antlered.antleredPlayProblem(s, c.code) &&
  !Nin.ninPlayProblem(s, c.code) &&
  (!["01036", "08143"].includes(c.code) ||
    (playCost(s, c) >= 3 &&
      eligiblePayers(s, c).filter(
        (h) => h.resources > 0 && s.heroes.some((u) => u.id === h.id),
      ).length >= 3)) &&
  !khazadCannotPlay(s) &&
  !returnMirkwoodCannotPlay(s) &&
  !(c.type_code === "event" && emynMuilEventsBlocked(s)) &&
  eligiblePayers(s, c).length > 0 &&
  (singlePoolCard(c)
    ? eligiblePayers(s, c).some((h) => h.resources >= playCost(s, c))
    : eligiblePayers(s, c).reduce((n, h) => n + h.resources, 0) >=
      playCost(s, c));

export function pay(
  s: GameState,
  c: Card,
  payment?: Record<string, number>,
  target?: Unit,
) {
  requireRule(
    !khazadCannotPlay(s),
    "Bridge of Khazad-dûm prevents playing cards while active.",
  );
  requireRule(
    !(c.type_code === "event" && emynMuilEventsBlocked(s)),
    "Amon Hen prevents players from playing events while active.",
  );
  requireRule(
    !returnMirkwoodCannotPlay(s),
    "Gollum’s guard cannot play cards during To the Elvin King’s Halls.",
  );
  let cost = playCost(s, c, target);
  const payers = eligiblePayers(s, c, target);
  if (["01036", "08143"].includes(c.code))
    requireRule(
      payment &&
        Object.entries(payment).filter(
          ([id, n]) => n > 0 && s.heroes.some((h) => h.id === id),
        ).length === 3,
      "This card must use resources from three different heroes' pools.",
    );
  requireRule(payers.length > 0, "A matching sphere hero is required.");
  requireRule(
    payers.reduce((n, h) => n + h.resources, 0) >= cost,
    "Not enough matching resources.",
  );
  if (singlePoolCard(c))
    requireRule(
      payment
        ? Object.values(payment).filter((n) => n > 0).length === 1
        : payers.some((h) => h.resources >= cost),
      "This card must be paid from a single hero’s resource pool.",
    );
  if (payment) {
    requireRule(
      Object.values(payment).every((v) => Number.isInteger(v) && v >= 0) &&
        Object.values(payment).reduce((a, b) => a + b, 0) === cost,
      "Choose exactly the card’s resource cost.",
    );
    for (const [id, v] of Object.entries(payment)) {
      const h = payers.find((h) => h.id === id);
      requireRule(h && h.resources >= v, "Invalid resource payment.");
    }
    for (const [id, v] of Object.entries(payment))
      spendResources(
        s,
        payers.find((h) => h.id === id)!,
        v,
      );
  } else {
    for (const h of [...payers].sort((a, b) => b.resources - a.resources)) {
      const n = Math.min(cost, h.resources);
      spendResources(s, h, n);
      cost -= n;
    }
  }
}

export function draw(s: GameState, count: number, cardEffect = true) {
  if (cardEffect && ninNoCardEconomy(s)) {
    log(s, "No End in Sight prevents player-card draws.");
    return;
  }
  if (allActiveLocations(s).some((l) => l.code === "01095")) {
    log(s, "Enchanted Stream prevents card draw.", "danger");
    return;
  }
  if (count > 0 && s.shackles > 0) {
    s.shackles--;
    s.encounterDiscard.push("01105");
    log(s, "Iron Shackles prevents this draw and is discarded.", "danger");
    return;
  }
  let n = 0;
  while (n < count && s.deck.length) {
    const u = takePlayerDeck(s);
    if (!foundationsDrawHero(s, u)) s.hand.push(u);
    n++;
  }
  if (n) {
    log(s, `Drew ${n} ${n === 1 ? "card" : "cards"}.`);
    Fords.fordsCardsDrawn(s);
  }
}

export function encounterDraw(s: GameState, shadow = false) {
  Antlered.antleredRoutePiles(s);
  if (
    !s.encounterDeck.length &&
    !shadow &&
    ["quest", "staging"].includes(s.phase) &&
    s.encounterDiscard.length
  ) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(s, "The encounter discard pile is shuffled back into its deck.");
  }
  return s.encounterDeck.shift();
}

export const stageInfo = (s: GameState) => {
  const side = selectedSideQuest(s);
  if (!side) return mainStageInfo(s);
  const c = card(side.code);
  return {
    name: c.name,
    quest: c.quest ?? 0,
    cardCode: c.code,
    story: c.text ?? "",
    questImage: imageUrl(c),
  };
};
