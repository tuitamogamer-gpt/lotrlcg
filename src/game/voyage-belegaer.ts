import { raidEngaged } from "./raid-grey-havens";
import { cityCardEntered } from "./city";
import { COBAS_CORSAIRS } from "./cobas-support";
import { cobasBoardingModifier } from "./cobas";
import { isShipEnemy, isShipObjective } from "./ships";
import { stormcallerState, STORMCALLER_CORSAIRS } from "./stormcaller-support";
import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isHero, isAlly } from "./card-types";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  threatOf,
  units,
} from "./core";
import {
  addVictoryCard,
  damage,
  discardAttachment,
  discardHandCard,
  enemyAddedToStaging,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
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
} from "./table";
import { allQuestUnits, currentQuestUnit, mainQuestUnit } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import { shiftHeading, sailingOnCourse } from "./sailing";
import {
  VOYAGE as V,
  VOYAGE_CORSAIRS,
  VOYAGE_RECIPES,
  VOYAGE_SHIPS,
  VOYAGE_STAGE_TWO,
  voyageCurrentQuest,
  voyageStageInfo,
  voyageState,
  type VoyageState,
} from "./voyage-belegaer-support";

type Combat = NonNullable<GameState["combat"]> & {
  voyageShiftOnCharacterKilled?: number;
  voyageShiftOnShipDamaged?: number;
  voyageExcessCopies?: number;
  voyageCharacterKilled?: boolean;
  voyageShipDamaged?: boolean;
};
const combat = (s: GameState) => s.combat as Combat | null;
const isVoyage = (s: GameState) => !!voyageState(s);
const fleetState = (s: GameState) =>
  voyageState(s) ??
  stormcallerState(s) ??
  s.cobas ??
  (s.city && s.stage <= 2 ? s.city : undefined);
const isFleet = (s: GameState) => !!fleetState(s);
export const SHIP_CONTROLLER_ELIMINATED = "game:ship-controller-eliminated";
const ship = (u: Unit) => isShipObjective(u);
const shipEnemy = (u: Unit) => isShipEnemy(u);
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const questLive = (s: GameState, code: string) =>
  voyageCurrentQuest(s) === code && !mainQuestUnit(s)?.blanked;
const off = (s: GameState) => !sailingOnCourse(s);
const ships = (s: GameState) => allCharacters(s).filter(ship);
export const voyageSailingExtraCards = (s: GameState) =>
  isFleet(s)
    ? 2 *
      allActiveLocations(s).filter((u) => u.code === V.calm && !u.blanked)
        .length
    : 0;
export const voyageSailingCancelledIcons = (s: GameState) =>
  isFleet(s) ? live(s, V.rough).length : 0;
export const voyageCannotDamage = (s: GameState, u: Unit) =>
  isFleet(s) &&
  u.code === V.warship &&
  !u.blanked &&
  s.staging.some((x) => x.id === u.id);
export const voyageNoEngagementCheck = (s: GameState, enemy: Unit) =>
  isFleet(s) &&
  shipEnemy(enemy) &&
  allActiveLocations(s).some((u) => u.code === V.fog && !u.blanked);
export const voyageEnemyCannotAttack = voyageNoEngagementCheck;
export const voyageCanAttackEnemy = (
  s: GameState,
  enemy: Unit,
  character: Unit,
) =>
  !isFleet(s) ||
  !shipEnemy(enemy) ||
  (!voyageNoEngagementCheck(s, enemy) &&
    !allEngaged(s).some(
      (u) =>
        u.code === V.captain &&
        !u.blanked &&
        ownerOf(s, u) === ownerOf(s, character),
    ));
export const voyageEngagementModifier = (s: GameState, u: Unit) =>
  isFleet(s) && u.code === V.scout && !u.blanked && off(s) ? -15 : 0;
export const voyageBoardingBonus = (s: GameState) =>
  isVoyage(s) && off(s) && questLive(s, V.divination) ? 1 : 0;
export const voyageArchery = (s: GameState, u: Unit) =>
  isFleet(s) &&
  u.code === V.warship &&
  !u.blanked &&
  s.staging.some((x) => x.id === u.id)
    ? 4
    : 0;
export const voyageCanCancelWhenRevealed = (s: GameState, code: string) =>
  !isFleet(s) || code !== V.winds || s.sailing?.heading !== 3;
export const voyageDrawBonus = (s: GameState, player = activeSeat(s)) =>
  isFleet(s) && own(s, player).some((u) => u.code === V.dawn && !u.blanked)
    ? 1
    : 0;
export const voyagePlayCost = (s: GameState, c: Card) =>
  isFleet(s) &&
  c.type_code === "ally" &&
  !s.used.includes("voyage-narelenya") &&
  own(s, activeSeat(s)).some((u) => u.code === V.narelenya && !u.blanked)
    ? -1
    : 0;
export function voyagePlayerCardPlayed(s: GameState, c: Card) {
  if (
    isFleet(s) &&
    c.type_code === "ally" &&
    !s.used.includes("voyage-narelenya")
  )
    s.used.push("voyage-narelenya");
}
export function voyageStats(s: GameState, u: Unit) {
  const corsair =
    isFleet(s) && u.code === V.pirate && !u.blanked ? u.resources : 0;
  return {
    attack:
      corsair +
      (isFleet(s) &&
      isHero(u) &&
      own(s, ownerOf(s, u)).some((a) => a.code === V.silver && !a.blanked)
        ? 1
        : 0),
    defense: corsair,
    will: isVoyage(s)
      ? (ship(u) && sailingOnCourse(s) && questLive(s, V.departure) ? 2 : 0) +
        (isAlly(u) && !ship(u) && off(s) && questLive(s, V.mists) ? -2 : 0)
      : 0,
  };
}
export const voyageThreatBonus = (s: GameState, u: Unit) =>
  isVoyage(s) &&
  off(s) &&
  questLive(s, V.guidance) &&
  (card(u.code).traits ?? "").split(".").some((x) => x.trim() === "Ocean")
    ? 1
    : 0;
export function voyageStagingThreat(s: GameState) {
  if (!isFleet(s)) return 0;
  return allEngaged(s)
    .filter(shipEnemy)
    .reduce(
      (n, enemy) =>
        n +
        (allEngaged(s).some(
          (u) =>
            u.code === V.sailor &&
            !u.blanked &&
            ownerOf(s, u) === ownerOf(s, enemy),
        )
          ? threatOf(s, enemy)
          : 0),
      0,
    );
}
export function voyageProgress(s: GameState, amount: number, quest: Unit) {
  return isVoyage(s) && quest.code === V.pursuit && off(s) && !quest.blanked
    ? 0
    : amount;
}
export function voyageTravelProblem(s: GameState, u: Unit) {
  if (
    isFleet(s) &&
    !u.blanked &&
    u.code === V.rolling &&
    s.sailing?.heading === 3
  )
    return "Rolling Seas requires shifting off-course. At the worst heading, that Travel cost cannot be paid.";
  return isFleet(s) &&
    s.sailing?.heading === 3 &&
    u.code !== V.waterspout &&
    live(s, V.waterspout).length
    ? "At the worst heading, the players must travel to Waterspout, if able."
    : null;
}
export const voyageMandatoryTravel = (s: GameState) =>
  isFleet(s) &&
  s.sailing?.heading === 3 &&
  !allActiveLocations(s).length &&
  live(s, V.waterspout).length > 0;
export function voyageTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!isFleet(s) || u.blanked) return undefined;
  if (u.code === V.rolling) return [fx("voyageShift", { value: 1 })];
  // The cached physical front names Starlit Sea; the source transcription used
  // an unrelated development title (Uncharted Ocean).
  if (u.code === V.starlit && off(s))
    return playerOrder(s).map((player) =>
      fx("voyageThreat", { value: 3, player }),
    );
  return undefined;
}
export function voyageTravelEntered(s: GameState, u: Unit) {
  if (isFleet(s) && u.code === V.waterspout && !u.blanked)
    prepend(
      s,
      ...ships(s).map((a) =>
        fx("damage", { target: a.id, value: 4, player: ownerOf(s, a) }),
      ),
    );
}
export function setupVoyage(s: GameState) {
  const recipe = VOYAGE_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  const q: VoyageState = {
    initialized: false,
    advancing: false,
    currentQuest: V.departure,
    questDeck: [...shuffle(s, [...VOYAGE_STAGE_TWO]), V.pursuit],
    completedQuests: [],
    setAside: VOYAGE_SHIPS.map((c) => make(s, c)),
    corsairDeck: shuffle(
      s,
      recipe.cards
        .filter((r) => r.section === "sharedEncounterDeck2")
        .flatMap((r) => Array<string>(r.quantity).fill(r.code)),
    ),
    corsairDiscard: [],
  };
  (s as GameState & { voyageBelegaer?: VoyageState }).voyageBelegaer = q;
  s.sailing = { heading: 0 };
}
export const setupVoyageBelegaer = setupVoyage;
export function voyageOpeningHandsKept(s: GameState) {
  if (!isVoyage(s) || voyageState(s)!.initialized) return false;
  prepend(
    s,
    fx("voyageFleet", { player: firstPlayer(s), value: 0 }),
    fx("voyageSetupDone"),
    fx("nextRound"),
  );
  return true;
}
export function voyageAdvance(s: GameState) {
  const q = voyageState(s);
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.phase === "setup"
  )
    return true;
  if (q.currentQuest === V.pursuit) {
    if (
      !s.choice &&
      !s.queue.length &&
      (s.progress >= 10 || ![...s.staging, ...allEngaged(s)].some(shipEnemy))
    ) {
      win(s);
      s.reason =
        s.progress >= 10
          ? "Your fleet loses the Corsair pursuers and completes the voyage."
          : "Your fleet defeats the Corsair pursuers and completes the voyage.";
    }
    return true;
  }
  if (s.progress >= (voyageStageInfo(s)?.quest ?? Infinity)) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, fx("voyageAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function voyageEndQuest(s: GameState) {
  if (isVoyage(s) && off(s) && questLive(s, V.storm))
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("voyageAssignDamage", { value: 5, player, text: "Into the Storm" }),
      ),
    );
}
export function voyageCorsairDiscard(s: GameState, code: string) {
  const q = fleetState(s);
  const corsairs = s.cobas
    ? COBAS_CORSAIRS
    : isVoyage(s)
      ? VOYAGE_CORSAIRS
      : STORMCALLER_CORSAIRS;
  if (!q || !corsairs.includes(code)) return false;
  q.corsairDiscard.push(code);
  if (!q.corsairDeck.length)
    q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
  return true;
}
export function voyageEngaged(s: GameState, u: Unit, fromStaging: boolean) {
  if (!isFleet(s) || u.blanked) return;
  const player = ownerOf(s, u);
  const effects: Effect[] = [];
  if (shipEnemy(u) && fromStaging) {
    const boarding =
      Number(/Boarding (\d+)/.exec(card(u.code).text ?? "")?.[1] ?? 0) +
      voyageBoardingBonus(s) +
      cobasBoardingModifier(s);
    effects.push(
      ...Array.from({ length: Math.max(0, boarding) }, () =>
        fx("voyageBoard", { player, source: u.id, flag: u.code === V.cruiser }),
      ),
    );
  }
  if (u.code === V.marauder)
    effects.push(fx("voyageMarauderEngaged", { target: u.id, player }));
  if (u.code === V.pirate)
    effects.push(fx("voyagePirateEngaged", { target: u.id, player }));
  prepend(s, ...effects);
}
export function voyageAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (
    isFleet(s) &&
    enemy.code === V.marauder &&
    !enemy.blanked &&
    enemy.resources > 0
  )
    prepend(
      s,
      fx("voyageAssignDamage", {
        value: enemy.resources,
        player,
        source: enemy.id,
        text: "Vicious Marauder",
      }),
    );
}
export function voyageCharacterLeaves(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (!isFleet(s)) return;
  if (!destruction || !ship(u)) return;
  if (u.code === V.dream) {
    s.status = "lost";
    s.reason =
      "The Dream-chaser is destroyed. The fleet cannot complete its voyage.";
    s.choice = null;
    s.queue = [];
    log(s, s.reason, "danger");
  } else if (VOYAGE_SHIPS.includes(u.code))
    forOwner(s, ownerOf(s, u), () => {
      if (!s.used.includes(SHIP_CONTROLLER_ELIMINATED))
        s.used.push(SHIP_CONTROLLER_ELIMINATED);
    });
}
export function voyageDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const c = combat(s);
  if (
    !isFleet(s) ||
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId
  )
    return;
  if (ship(u) && value > 0) c.voyageShipDamaged = true;
  if (
    allCharacters(s).some((a) => a.id === u.id) &&
    u.damage >= stats(s, u).health
  )
    c.voyageCharacterKilled = true;
  const before = u.damage - value;
  const excess = Math.max(0, value - Math.max(0, stats(s, u).health - before));
  if (
    excess &&
    c.voyageExcessCopies &&
    allCharacters(s).some((a) => a.id === u.id)
  )
    prepend(
      s,
      ...Array.from({ length: c.voyageExcessCopies }, () =>
        fx("voyageExcessDamage", {
          player: c.attackPlayer ?? activeSeat(s),
          value: excess,
        }),
      ),
    );
}
export function voyageAfterAttack(s: GameState) {
  const c = combat(s);
  if (!isFleet(s) || !c) return;
  if (c.voyageCharacterKilled)
    for (let n = 0; n < (c.voyageShiftOnCharacterKilled ?? 0); n++)
      shiftHeading(s, 1);
  if (c.voyageShipDamaged)
    for (let n = 0; n < (c.voyageShiftOnShipDamaged ?? 0); n++)
      shiftHeading(s, 1);
}
export function voyageEncounter(s: GameState, code: string, replay = false) {
  if (!isFleet(s)) return false;
  if (code === V.boarding)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("voyageBoard", { player })),
    );
  else if (code === V.thrown)
    choose(s, "Thrown Off Course", [
      {
        id: "progress",
        label:
          "Remove all current quest progress · Each player raises threat by 4",
        effects: [
          fx("voyageRemoveProgress"),
          ...playerOrder(s).map((player) =>
            fx("voyageThreat", { value: 4, player }),
          ),
        ],
      },
      {
        id: "heading",
        label: "Shift heading off-course",
        effects: [fx("voyageShift", { value: 1 })],
      },
    ]);
  else if (code === V.sudden)
    choose(s, "Sudden Storms", [
      {
        id: "heading",
        label: "Shift heading off-course",
        effects: [fx("voyageShift", { value: 1 })],
      },
      {
        id: "damage",
        label: "Deal 1 damage to every exhausted character",
        effects: allCharacters(s)
          .filter((u) => u.exhausted)
          .map((u) =>
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
          ),
      },
    ]);
  else if (code === V.winds) {
    if (off(s))
      prepend(
        s,
        ...allCharacters(s).map((u) =>
          fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
        ),
      );
  } else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function voyageShadow(s: GameState, code: string) {
  const c = combat(s);
  if (!isFleet(s) || !c) return false;
  const enemy = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s);
  if (code === V.calm) c.attackBonus += enemy && shipEnemy(enemy) ? 3 : 1;
  else if (code === V.rough) {
    if (off(s)) c.attackBonus += 2;
  } else if (code === V.boarding)
    c.attackBonus += own(s, player).some((u) => ship(u) && u.exhausted) ? 2 : 1;
  else if (code === V.starlit) c.attackBonus += off(s) ? 2 : 1;
  else if (code === V.fog) {
    if (s.sailing?.heading === 3) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else if (code === V.thrown)
    c.voyageShiftOnCharacterKilled = (c.voyageShiftOnCharacterKilled ?? 0) + 1;
  else if (code === V.rolling)
    c.voyageShiftOnShipDamaged = (c.voyageShiftOnShipDamaged ?? 0) + 1;
  else if (code === V.sudden)
    c.voyageExcessCopies = (c.voyageExcessCopies ?? 0) + 1;
  else if (code === V.winds)
    choose(s, "Winds of Wrath · Shadow", [
      {
        id: "heading",
        label: "Shift heading off-course",
        effects: [fx("voyageShift", { value: 1 })],
      },
      {
        id: "undefended",
        label: "Treat this attack as undefended",
        effects: [fx("voyageUndefended")],
      },
    ]);
  else return false;
  return true;
}

function search(s: GameState, predicate: (code: string) => boolean): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) =>
    (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
      (code, index) =>
        predicate(code)
          ? [
              {
                id: `${zone}-${index}`,
                code,
                label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
                effects: [
                  fx("voyageSearchTake", {
                    code,
                    value: index,
                    text: zone,
                    player: firstPlayer(s),
                  }),
                ],
              },
            ]
          : [],
    ),
  );
}
export function voyageEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("voyage")) return false;
  const q = fleetState(s);
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "voyageFleet": {
      const players = playerOrder(s),
        slot = e.value ?? 0;
      if (slot >= (players.length === 1 ? 2 : players.length)) break;
      const player = players.length === 1 ? players[0] : players[slot];
      const dreamControlled = ships(s).some((u) => u.code === V.dream);
      const available = q.setAside
        .filter((u) => VOYAGE_SHIPS.includes(u.code))
        .filter((u) =>
          (players.length === 1 && slot === 0) ||
          (!dreamControlled && slot === players.length - 1)
            ? u.code === V.dream
            : true,
        );
      choose(
        s,
        `Prepare the fleet · ${seatName(s, player)}`,
        available.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Take control of ${name(u)}`,
          effects: [
            fx("voyageFleetTake", { target: u.id, player }),
            fx("voyageFleet", {
              value: slot + 1,
              player:
                players.length === 1
                  ? players[0]
                  : (players[slot + 1] ?? players[0]),
            }),
          ],
        })),
        "Every player chooses one unique Ship objective. The fleet must include the Dream-chaser; a solo player also chooses another ship.",
      );
      break;
    }
    case "voyageFleetTake": {
      const index = q.setAside.findIndex((a) => a.id === e.target);
      if (index < 0) break;
      const unit = q.setAside.splice(index, 1)[0],
        player = e.player ?? activeSeat(s);
      unit.owner = player;
      unit.controller = player;
      if (unit.code === V.dream)
        unit.attachments.push({
          id: `c${s.nextId++}`,
          code: V.heading,
          exhausted: false,
        });
      forOwner(s, player, () => {
        s.allies.push(unit);
        if (unit.code === V.dawn) s.threat += 3;
        if (unit.code === V.silver) s.threat = Math.max(0, s.threat - 3);
      });
      log(s, `${seatName(s, player)} controls ${name(unit)}.`);
      break;
    }
    case "voyageSetupDone":
      if (!isVoyage(s)) break;
      for (const code of [V.rolling, V.scout]) {
        const unit = make(s, code);
        s.staging.push(unit);
        if (shipEnemy(unit)) enemyAddedToStaging(s, unit);
      }
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    case "voyageShift":
      shiftHeading(s, e.value ?? 1);
      break;
    case "voyageThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "voyageRemoveProgress":
      removeCurrentQuestProgress(
        s,
        currentQuestUnit(s)?.progress ?? s.progress,
      );
      break;
    case "voyageUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
      }
      break;
    case "voyageAdvance": {
      if (!isVoyage(s)) break;
      const top = q.questDeck.slice(0, sailingOnCourse(s) ? 2 : 1);
      if (top.length > 1)
        choose(
          s,
          "On-course · Choose the next quest stage",
          top.map((code) => ({
            id: code,
            code,
            label: `Advance to ${card(code).name}`,
            effects: [
              fx("voyageAdvanceTake", {
                code,
                flag: true,
                player: firstPlayer(s),
              }),
            ],
          })),
          "Look at the top two quest stages. Advance to one and place the other on the bottom of the quest deck.",
        );
      else if (top[0])
        prepend(
          s,
          fx("voyageAdvanceTake", { code: top[0], player: firstPlayer(s) }),
        );
      break;
    }
    case "voyageAdvanceTake": {
      if (!isVoyage(s)) break;
      const top = q.questDeck.splice(0, e.flag ? 2 : 1);
      if (!e.code || !top.includes(e.code)) break;
      q.questDeck.push(...top.filter((code) => code !== e.code));
      q.completedQuests.push(q.currentQuest);
      addVictoryCard(s, q.currentQuest);
      q.currentQuest = e.code;
      s.stage = e.code === V.pursuit ? 3 : 2;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      log(s, `${card(e.code).name} · The fleet sails onward.`, "chapter");
      prepend(
        s,
        fx("voyageStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    }
    case "voyageStageReveal":
      if (!isVoyage(s)) break;
      if (q.currentQuest === V.pursuit)
        prepend(
          s,
          fx("voyagePursuitSearch", {
            value: playerOrder(s).length >= 3 ? 2 : 1,
            player: firstPlayer(s),
          }),
          fx("voyageShuffle"),
        );
      else {
        const target =
          q.currentQuest === V.storm
            ? V.waterspout
            : q.currentQuest === V.mists
              ? V.fog
              : q.currentQuest === V.divination
                ? V.scout
                : V.starlit;
        const opts = search(s, (c) => c === target);
        if (opts.length)
          choose(
            s,
            `${card(q.currentQuest).name} · Search for ${card(target).name}`,
            opts.map((o) => ({
              ...o,
              effects: [...o.effects, fx("voyageShuffle")],
            })),
          );
        else shuffle(s, s.encounterDeck);
      }
      break;
    case "voyagePursuitSearch": {
      if (!isVoyage(s)) break;
      const candidates = [...s.encounterDeck, ...s.encounterDiscard].filter(
        (code) => card(code).type_code === "ship-enemy",
      );
      if (!candidates.length || (e.value ?? 0) <= 0) break;
      const max = Math.max(...candidates.map((code) => card(code).threat ?? 0));
      choose(
        s,
        "Corsair Pursuit · Search for the highest threat Ship enemy",
        search(
          s,
          (code) =>
            card(code).type_code === "ship-enemy" && card(code).threat === max,
        ).map((o) => ({
          ...o,
          effects: [
            ...o.effects,
            fx("voyagePursuitSearch", {
              value: (e.value ?? 1) - 1,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "voyageSearchTake": {
      if (!isVoyage(s)) break;
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value === undefined || pile[e.value] !== e.code) break;
      const unit = make(s, pile.splice(e.value, 1)[0]);
      s.staging.push(unit);
      if (shipEnemy(unit)) enemyAddedToStaging(s, unit);
      log(s, `${name(unit)} is added to the staging area.`);
      break;
    }
    case "voyageShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "voyageBoard": {
      if (!q.corsairDeck.length)
        q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
      const code = q.corsairDeck.shift();
      if (!code) break;
      const enemy = make(s, code);
      if (
        e.flag &&
        (card(code).traits ?? "").split(".").some((t) => t.trim() === "Raider")
      )
        enemy.resources = 1;
      // The card is put into play engaged, so it never passes through staging
      // and cannot accidentally trigger another ship's Boarding keyword.
      enemy.owner = e.player ?? activeSeat(s);
      forOwner(s, enemy.owner, () => s.engaged.push(enemy));
      voyageEngaged(s, enemy, false);
      raidEngaged(s, enemy);
      cityCardEntered(s, enemy, false, false);
      if (!q.corsairDeck.length)
        q.corsairDeck = shuffle(s, q.corsairDiscard.splice(0));
      log(
        s,
        `${card(code).name} boards ${seatName(s, enemy.owner)}'s fleet.`,
        "danger",
      );
      break;
    }
    case "voyageMarauderEngaged":
      if (u && s.hand.length) {
        const physical = s.hand[Math.floor(random(s) * s.hand.length)];
        const cost = card(physical.code).cost;
        const value =
          typeof cost === "number"
            ? cost
            : /^\d+$/.test(String(cost))
              ? Number(cost)
              : 0;
        discardHandCard(s, physical.id);
        u.resources += value;
      }
      break;
    case "voyagePirateEngaged": {
      if (!u) break;
      const attached = [...units(s), ...allQuestUnits(s)].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              card(a.code).sphere_code !== "encounter" &&
              !card(a.code).text?.includes("Permanent") &&
              (attachmentController(s, host, a) ?? ownerOf(s, host)) ===
                (e.player ?? activeSeat(s)),
          )
          .map((a) => ({ host, attachment: a })),
      );
      if (attached.length)
        choose(
          s,
          "Cunning Pirate · Discard an attachment you control",
          attached.map(({ host, attachment: a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · on ${name(host)}`,
            effects: [
              fx("voyagePirateDiscard", {
                target: host.id,
                source: a.id,
                damageTarget: u.id,
                player: e.player,
              }),
            ],
          })),
        );
      break;
    }
    case "voyagePirateDiscard": {
      const a = u?.attachments.find((a) => a.id === e.source),
        enemy = get(s, e.damageTarget);
      if (u && a && enemy) {
        const printed = card(a.code).cost,
          value =
            typeof printed === "number"
              ? printed
              : /^\d+$/.test(String(printed))
                ? Number(printed)
                : 0;
        discardAttachment(s, u, a);
        enemy.resources += value;
      }
      break;
    }
    case "voyageAssignDamage": {
      const left = e.value ?? 0;
      if (left <= 0) break;
      const chars = own(s, e.player ?? activeSeat(s));
      if (!chars.length) break;
      choose(
        s,
        `${e.text ?? "Encounter effect"} · Assign ${left} damage`,
        chars.map((a) => ({
          id: a.id,
          code: a.code,
          label: `Deal 1 damage to ${name(a)}`,
          effects: [
            fx("damage", { target: a.id, value: 1, player: e.player }),
            fx("voyageAssignDamage", {
              value: left - 1,
              player: e.player,
              source: e.source,
              text: e.text,
            }),
          ],
        })),
        "Distribute the required damage among characters you control, one point at a time.",
      );
      break;
    }
    case "voyageExcessDamage": {
      const targets = own(s, e.player ?? activeSeat(s)).filter(ship);
      if (targets.length)
        choose(
          s,
          "Sudden Storms · Excess damage",
          targets.map((a) => ({
            id: a.id,
            code: a.code,
            label: `Deal ${e.value ?? 0} excess damage to ${name(a)}`,
            effects: [
              fx("voyageExcessApply", {
                target: a.id,
                value: e.value,
                player: e.player,
              }),
            ],
          })),
        );
      break;
    }
    case "voyageExcessApply": {
      if (!u) break;
      // Excess remains damage from this attack for Rolling Seas, but applying
      // it must not recursively generate another excess-damage assignment.
      const c = combat(s),
        before = u.damage;
      if (damage(s, u.id, e.value ?? 0) && c) {
        c.voyageShipDamaged = true;
        if (before + (e.value ?? 0) >= stats(s, u).health)
          c.voyageCharacterKilled = true;
      }
      break;
    }
  }
  return true;
}
