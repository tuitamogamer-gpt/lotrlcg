/**
 * Flight of the Stormcaller's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (removals from the encounter deck and the Corsair deck, which the
 * scenario's setup applies, with Raider of the Storm in the Corsair deck, in
 * src/game/stormcaller.ts) and its Nightmare encounter cards, composed with
 * the scenario's rules through batch4Scenario while a Nightmare mode game is
 * played. The setup card's and Cliffside Inlet's quest points reach the main
 * quest's stage through mainQuestGoalBonus. Effects use the "nfc" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, stats, threatOf } from "./core";
import { enemyAddedToStaging, engage } from "./board";
import { dealEnemyShadows } from "./considered-engagement";
import { surgeEffects } from "./surge";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
} from "./table";
import { isShipEnemy, isShipObjective } from "./ships";
import { sailingOnCourse, shiftHeading } from "./sailing";
import { currentQuestProgress, currentQuestUnit } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import {
  stormcallerAddToArea,
  stormcallerArea,
  stormcallerSameStage,
} from "./stormcaller";
import { STORMCALLER as V, stormcallerState } from "./stormcaller-support";
import { NIGHTMARE_DC as D, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  live,
  phaseKey,
  seatLabel,
  state,
} from "./nightmare-core";

export interface NightmareStormcallerState {
  /** Dark and Stormy: shadow effects cannot be canceled until the end of this round. */
  stormcallerStormy?: number;
  /** Sahír's Getting Away!: [threat] added to the staging area until the end of the phase. */
  stormcallerThreat?: { round: number; phase: string; n: number };
}

const nfcLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "flight-of-the-stormcaller" &&
  !!stormcallerState(s);
const off = (s: GameState) => !sailingOnCourse(s);
const heading = (s: GameState) => s.sailing?.heading ?? 0;
const ships = (s: GameState) => allCharacters(s).filter(isShipObjective);
const shipLabel = (s: GameState, u: Unit) =>
  s.table ? `${name(u)} · ${seatName(s, ownerOf(s, u))}` : name(u);
const engaged = (s: GameState, u: Unit) =>
  allEngaged(s).some((x) => x.id === u.id);
/** Every card of the Stormcaller's area and the players' staging and engagement areas. */
const inPlay = (s: GameState) => [
  ...(stormcallerState(s)?.area ?? []),
  ...s.staging,
  ...allEngaged(s),
];
/** The Stormcaller, wherever it is. */
const stormcaller = (s: GameState) =>
  get(s, stormcallerState(s)?.stormcallerId);

// ------------------------------------------------------------- passives

/**
 * The setup card: "While you are at the same stage as the Stormcaller, the
 * main quest gets +X quest points, where X is the Stormcaller's remaining hit
 * points." Cliffside Inlet: "While Cliffside Inlet is in the staging area,
 * the main quest gets +2 quest points."
 */
export function nfcMainQuestGoalBonus(s: GameState) {
  if (!nfcLive(s)) return 0;
  let bonus = 2 * s.staging.filter((u) => live(s, u, D.inlet)).length;
  const target = stormcaller(s);
  if (target && stormcallerSameStage(s))
    bonus += Math.max(0, stats(s, target).health - target.damage);
  return bonus;
}
/**
 * Raider of the Storm: "While Raider of the Storm is engaged with you, each
 * Ship enemy engaged with you gets +1 [threat], +1 [attack], +1 [defense]"
 * (once for each Raider of the Storm).
 */
function raidersFor(s: GameState, u: Unit) {
  if (!isShipEnemy(u) || !engaged(s, u)) return 0;
  const player = ownerOf(s, u);
  return allEngaged(s).filter(
    (x) => live(s, x, D.raider) && ownerOf(s, x) === player,
  ).length;
}
function nfcStats(s: GameState, u: Unit) {
  const n = nfcLive(s) ? raidersFor(s, u) : 0;
  return n ? { attack: n, defense: n } : {};
}
const nfcThreatBonus = (s: GameState, u: Unit) =>
  nfcLive(s) ? raidersFor(s, u) : 0;
/** Southron Sailor's own contribution (the scenario counts it). */
const sailorCounts = (s: GameState, u: Unit) =>
  engaged(s, u) &&
  allEngaged(s).some(
    (x) => x.code === V.sailor && !x.blanked && ownerOf(s, x) === ownerOf(s, u),
  );
/** Tide-runner: "While you are off-course, Tide-runner is considered to be in the Stormcaller's area and the staging area, regardless of its current location." */
const tideRunners = (s: GameState) =>
  off(s) ? inPlay(s).filter((u) => live(s, u, D.tideRunner)) : [];
/**
 * Raider of the Storm: each Ship enemy engaged with you "contributes its
 * [threat] to the total [threat] in the staging area". Tide-runner, while
 * off-course, contributes its [threat] wherever it is (it is considered to be
 * in the staging area). Sahír's Getting Away!: "add 8 [threat] to the staging
 * area until the end of the phase."
 */
function nfcStagingThreat(s: GameState) {
  if (!nfcLive(s)) return 0;
  const counted = new Set<string>();
  for (const u of allEngaged(s))
    if (raidersFor(s, u) && !sailorCounts(s, u)) counted.add(u.id);
  for (const u of tideRunners(s))
    if (!s.staging.some((x) => x.id === u.id) && !sailorCounts(s, u))
      counted.add(u.id);
  let total = inPlay(s)
    .filter((u) => counted.has(u.id))
    .reduce((n, u) => n + threatOf(s, u), 0);
  const extra = s.nightmare?.stormcallerThreat;
  if (extra && extra.round === s.round && extra.phase === phaseKey(s))
    total += extra.n;
  return total;
}
/**
 * Tide-runner, while off-course at a different stage than the Stormcaller's:
 * as a card in the Stormcaller's area it is immune to player card effects and
 * cannot leave the area (it is not destroyed until the players catch up or
 * are back on-course).
 */
const tideProtected = (s: GameState, u: Unit) =>
  nfcLive(s) && live(s, u, D.tideRunner) && off(s) && !stormcallerSameStage(s);
/** Tide-runner and Venom's Bite: "Cannot have attachments." */
const nfcCannotAttach = (s: GameState, u: Unit) =>
  nfcLive(s) && (live(s, u, D.tideRunner) || live(s, u, D.venom));
/** Dark and Stormy: "Until the end of the round, shadow effects cannot be canceled." */
const nfcCannotCancel = (s: GameState, shadow?: boolean) =>
  nfcLive(s) && !!shadow && s.nightmare?.stormcallerStormy === s.round;
/** Ship enemies the Stormcaller's area holds (Tide-runner, while off-course, wherever it is). */
function shipsInArea(s: GameState) {
  const area = stormcallerArea(s).filter(isShipEnemy);
  return [
    ...area,
    ...tideRunners(s).filter((u) => !area.some((x) => x.id === u.id)),
  ];
}

// ------------------------------------------------------------- the cards

function nfcEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nfcLive(s)) return false;
  const p = firstPlayer(s);
  switch (code) {
    // Tide-runner: "When Revealed: Either choose a player to engage
    // Tide-runner, or add Tide-runner to the Stormcaller's area and it gains
    // surge."
    case D.tideRunner: {
      const u = [...s.staging].reverse().find((x) => x.code === code);
      if (fromReveal && !replay && u)
        prepend(s, fx("nfcTide", { target: u.id, player: p }));
      return true;
    }
    // Sharp Jetties: "When Revealed: If your heading is off-course, make
    // Sharp Jetties the active location, returning any currently active
    // location to the staging area."
    case D.jetties: {
      const u = [...s.staging].reverse().find((x) => x.code === code);
      if (fromReveal && !replay && u)
        prepend(s, fx("nfcJetties", { target: u.id, player: p }));
      return true;
    }
    // Dark and Stormy and Sahír's Getting Away!.
    case D.stormy:
    case D.getaway: {
      if (replay) {
        const i = s.encounterDiscard.lastIndexOf(code);
        if (i >= 0) s.encounterDiscard.splice(i, 1);
      }
      s.encounterDiscard.push(code);
      if (fromReveal)
        prepend(
          s,
          fx(code === D.stormy ? "nfcStormy" : "nfcGetaway", { player: p }),
        );
      return true;
    }
  }
  return false;
}

function nfcShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nfcLive(s)) return false;
  switch (code) {
    // Dark and Stormy: "Attacking enemy makes an additional attack after
    // this one."
    case D.stormy:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Dark and Stormy: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    // Sahír's Getting Away!: "If this attack damages a Ship objective, place
    // 1 progress on the Stormcaller's quest stage."
    case D.getaway:
      c.nfcGetaway = (c.nfcGetaway ?? 0) + 1;
      log(
        s,
        "Sahír's Getting Away!: if this attack damages a Ship objective, the Stormcaller places 1 progress on its quest stage.",
        "danger",
      );
      return true;
  }
  return false;
}
function nfcAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!nfcLive(s) || !combat.nfcGetaway || !combat.voyageShipDamaged) return [];
  return [
    fx("nfcProgress", {
      value: combat.nfcGetaway,
      text: "Sahír's Getting Away!: the attack damaged a Ship objective",
      player: firstPlayer(s),
    }),
  ];
}

/**
 * Venom's Bite: "*Forced: After this Sailing test ends, if you are
 * off-course, put the Venom's Bite into play in the staging area. If you are
 * on-course, put it into play in the Stormcaller's area instead."
 */
function nfcSailingDiscarded(s: GameState, looked: string[]): Effect[] {
  if (!nfcLive(s) || !looked.includes(D.venom)) return [];
  return [fx("nfcVenom", { player: firstPlayer(s) })];
}
/**
 * Sharp Jetties: "Forced: When any amount of progress is placed on Sharp
 * Jetties, either remove an equal amount of progress from the current quest,
 * or deal an equal amount of damage to each Ship objective."
 */
function nfcLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!nfcLive(s) || amount <= 0 || !live(s, u, D.jetties)) return;
  prepend(
    s,
    fx("nfcJettiesProgress", {
      target: u.id,
      value: amount,
      player: firstPlayer(s),
    }),
  );
}
/** Cliffside Inlet: "Travel: Discard cards from the top of the encounter deck until a Ship enemy is discarded. Put that enemy into play in the Stormcaller's area." */
function nfcTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!nfcLive(s) || !live(s, u, D.inlet)) return undefined;
  return [fx("nfcInlet", { player: firstPlayer(s) })];
}
/** Shadow cards dealt to the Stormcaller's area (Dark and Stormy) are discarded at the end of the combat phase, as in the staging area. */
function nfcCombatEnd(s: GameState) {
  if (!nfcLive(s)) return;
  for (const u of stormcallerState(s)!.area)
    if (u.shadows.length) {
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
    }
}

// ------------------------------------------------------------- effects

export function nightmareStormcallerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfc")) return false;
  if (!nfcLive(s)) return true;
  const q = stormcallerState(s)!;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "nfcTide": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u) return true;
      choose(
        s,
        `Tide-runner · Choose one${seatLabel(s, p)}`,
        [
          ...playerOrder(s).map((player): Option => ({
            id: `engage-${player}`,
            code: D.tideRunner,
            label: s.table
              ? `${seatName(s, player)} engages Tide-runner`
              : "Engage Tide-runner",
            effects: [fx("nfcTideEngage", { target: u.id, player })],
          })),
          {
            id: "area",
            label: "Add Tide-runner to the Stormcaller's area (it gains surge)",
            effects: [fx("nfcTideArea", { target: u.id, player: p })],
          },
        ],
        card(D.tideRunner).text,
      );
      return true;
    }
    case "nfcTideEngage": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u) return true;
      log(
        s,
        `Tide-runner engages ${s.table ? seatName(s, p) : "you"}.`,
        "danger",
      );
      engage(s, u);
      return true;
    }
    case "nfcTideArea": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u) return true;
      stormcallerAddToArea(s, u);
      log(
        s,
        "Tide-runner is added to the Stormcaller's area and gains surge.",
        "danger",
      );
      prepend(s, ...surgeEffects(D.tideRunner));
      return true;
    }
    case "nfcJetties": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u) return true;
      if (!off(s)) {
        log(s, "Sharp Jetties: your heading is on-course.");
        return true;
      }
      const returned = allActiveLocations(s);
      for (const l of returned) {
        removeActiveLocation(s, l.id);
        s.staging.push(l);
      }
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.activeLocation = u;
      log(
        s,
        `Sharp Jetties: your heading is off-course, so it becomes the active location${returned.length ? ` (${returned.map((l) => name(l)).join(", ")} returns to the staging area)` : ""}.`,
        "danger",
      );
      return true;
    }
    case "nfcJettiesProgress": {
      const n = e.value ?? 0;
      const quest = currentQuestUnit(s);
      const options: Option[] = [];
      if (currentQuestProgress(s) > 0)
        options.push({
          id: "progress",
          label: `Remove ${n} progress from ${quest ? name(quest) : "the current quest"}`,
          effects: [fx("nfcRemoveProgress", { value: n, player: p })],
        });
      const fleet = ships(s);
      if (fleet.length)
        options.push({
          id: "damage",
          label: `Deal ${n} damage to each Ship objective (${fleet.map((u) => shipLabel(s, u)).join(", ")})`,
          effects: fleet.map((u) =>
            fx("damage", { target: u.id, value: n, player: ownerOf(s, u) }),
          ),
        });
      if (!options.length) return true;
      choose(
        s,
        `Sharp Jetties · ${n} progress was placed on it${seatLabel(s, p)}`,
        options,
        "Forced: When any amount of progress is placed on Sharp Jetties, either remove an equal amount of progress from the current quest, or deal an equal amount of damage to each Ship objective.",
      );
      return true;
    }
    case "nfcRemoveProgress": {
      const removed = removeCurrentQuestProgress(s, e.value ?? 0);
      log(
        s,
        `Sharp Jetties: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest.`,
        "danger",
      );
      return true;
    }
    case "nfcInlet": {
      let found: string | undefined;
      const discarded: string[] = [];
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        discarded.push(code);
        if (card(code).type_code === "ship-enemy") {
          found = code;
          break;
        }
      }
      if (found) {
        s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(found), 1);
        stormcallerAddToArea(s, make(s, found), true);
      }
      log(
        s,
        found
          ? `Cliffside Inlet: ${discarded.length} encounter ${discarded.length === 1 ? "card is" : "cards are"} discarded; ${card(found).name} is put into play in the Stormcaller's area.`
          : `Cliffside Inlet: ${discarded.length} encounter ${discarded.length === 1 ? "card is" : "cards are"} discarded without a Ship enemy.`,
        "danger",
      );
      return true;
    }
    case "nfcVenom": {
      const i = s.encounterDiscard.lastIndexOf(D.venom);
      if (i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      const u = make(s, D.venom);
      if (off(s)) {
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      } else stormcallerAddToArea(s, u, true);
      log(
        s,
        `Venom's Bite was discarded by the Sailing test: you are ${off(s) ? "off-course, so it is put into play in the staging area" : "on-course, so it is put into play in the Stormcaller's area"}.`,
        "danger",
      );
      return true;
    }
    case "nfcStormy": {
      const enemies = inPlay(s).filter(isShipEnemy);
      for (const u of enemies) dealEnemyShadows(s, u, 1);
      state(s).stormcallerStormy = s.round;
      log(
        s,
        `Dark and Stormy: ${enemies.length ? `each Ship enemy in play is dealt a shadow card (${enemies.map((u) => name(u)).join(", ")})` : "no Ship enemy is in play"}; until the end of the round, shadow effects cannot be canceled.`,
        "danger",
      );
      return true;
    }
    case "nfcGetaway": {
      const area = shipsInArea(s);
      prepend(
        s,
        ...(area.length
          ? [
              fx("nfcProgress", {
                value: area.length,
                text: `Sahír's Getting Away!: ${area.length === 1 ? "1 Ship enemy is" : `${area.length} Ship enemies are`} in the Stormcaller's area`,
                player: p,
              }),
            ]
          : []),
        fx("nfcGetawayChoice", { player: p }),
      );
      return true;
    }
    case "nfcGetawayChoice": {
      const options: Option[] = [];
      if (heading(s) < 3)
        options.push({
          id: "heading",
          label: "Shift your heading off-course",
          effects: [fx("nfcShift", { player: p })],
        });
      options.push({
        id: "threat",
        label: "Add 8 [threat] to the staging area until the end of the phase",
        effects: [fx("nfcThreat", { value: 8, player: p })],
      });
      choose(
        s,
        `Sahír's Getting Away! · Choose one${seatLabel(s, p)}`,
        options,
        "Then, either shift your heading off-course or add 8 [threat] to the staging area until the end of the phase.",
      );
      return true;
    }
    case "nfcShift":
      shiftHeading(s, 1);
      log(s, "Sahír's Getting Away!: the heading shifts off-course.", "danger");
      return true;
    case "nfcThreat": {
      const st = state(s);
      const key = phaseKey(s);
      const value = e.value ?? 8;
      const current = st.stormcallerThreat;
      st.stormcallerThreat =
        current && current.round === s.round && current.phase === key
          ? { ...current, n: current.n + value }
          : { round: s.round, phase: key, n: value };
      log(
        s,
        `Sahír's Getting Away!: ${value} [threat] is added to the staging area until the end of the phase.`,
        "danger",
      );
      return true;
    }
    case "nfcProgress": {
      const n = e.value ?? 0;
      if (n <= 0) return true;
      q.enemyProgress += n;
      log(
        s,
        `${e.text}: the Stormcaller places ${n} progress on ${card(q.enemyQuest).name}.`,
        "danger",
      );
      prepend(s, fx("stormcallerEnemyAdvance"));
      return true;
    }
  }
  return false;
}

export function validNightmareStormcaller(s: GameState) {
  const q = s.nightmare;
  const stormy = q?.stormcallerStormy,
    extra = q?.stormcallerThreat;
  if (stormy === undefined && extra === undefined) return true;
  return (
    nfcLive(s) &&
    (stormy === undefined ||
      (Number.isInteger(stormy) && stormy >= 0 && stormy <= s.round)) &&
    (extra === undefined ||
      (!!extra &&
        Number.isInteger(extra.round) &&
        extra.round >= 0 &&
        extra.round <= s.round &&
        typeof extra.phase === "string" &&
        Number.isInteger(extra.n) &&
        extra.n > 0 &&
        extra.n % 8 === 0))
  );
}

export const NIGHTMARE_STORMCALLER_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  mainQuestGoalBonus: nfcMainQuestGoalBonus,
  stats: nfcStats,
  threatBonus: nfcThreatBonus,
  stagingThreat: nfcStagingThreat,
  immune: tideProtected,
  indestructible: tideProtected,
  cannotAttach: nfcCannotAttach,
  cannotCancel: nfcCannotCancel,
  encounter: nfcEncounter,
  shadow: nfcShadow,
  attackFinished: nfcAttackFinished,
  sailingDiscarded: nfcSailingDiscarded,
  locationProgressPlaced: nfcLocationProgressPlaced,
  travelEffects: nfcTravelEffects,
  combatEnd: nfcCombatEnd,
  effect: nightmareStormcallerEffect,
  sharedEffect: () => false,
};
