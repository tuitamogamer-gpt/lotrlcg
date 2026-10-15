import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import { isHero } from "./card-types";
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
import {
  addVictoryCard,
  destroy,
  discardLocation,
  enemyAddedToStaging,
  engage,
  questDefeated,
  win,
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
  seatName,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { sailingOnCourse } from "./sailing";
import { heirsShadowDealt } from "./heirs-numenor";
import { carnShadowDealt } from "./carn-dum";
import {
  CITY as C,
  CITY_MAIN_QUESTS,
  CITY_RECIPES,
  CITY_SHIPS,
} from "./city-support";
import * as Encounters from "./city-encounters";

export * from "./city-encounters";
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((x) => x.trim() === t);
const stageLive = (s: GameState, stage: number) =>
  !!s.city && s.stage === stage && !mainQuestUnit(s)?.blanked;

export function setupCity(s: GameState) {
  const recipe = CITY_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  if (playerOrder(s).length < 3) s.encounterDeck.push(C.belfalas);
  s.city = {
    initialized: false,
    advancing: false,
    currentQuest: C.coast,
    questDeck: CITY_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: CITY_SHIPS.map((code) => make(s, code)),
    corsairDeck: shuffle(s, pile("sharedEncounterDeck2")),
    corsairDiscard: [],
    secondDeck: shuffle(s, [
      ...pile("sharedEncounterDeck3"),
      C.sahir,
      C.monument,
    ]),
    inactiveDeck: [],
    inactiveDiscard: [],
    stormcallerDestroyed: false,
    allyEntries: { round: s.round, count: 0 },
    foes: [],
  };
  s.sailing = { heading: 0 };
}
export function cityOpeningHandsKept(s: GameState) {
  if (!s.city || s.city.initialized) return false;
  prepend(
    s,
    fx("voyageFleet", { value: 0, player: firstPlayer(s) }),
    fx("citySetup", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export const cityQuestProgressBlocked = (s: GameState) =>
  stageLive(s, 1) && !sailingOnCourse(s);

export function cityCheck(s: GameState) {
  if (!s.city) return;
  cityFirstPlayerChanged(s);
  if (
    s.stage === 4 &&
    (s.victoryCards ?? []).includes(C.sahir) &&
    s.status === "playing"
  ) {
    win(s);
    s.reason =
      "Captain Sahír is defeated. The Corsairs' treacherous plot is ended.";
  }
}
export function cityAdvance(s: GameState) {
  const q = s.city;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && (q.stormcallerDestroyed || s.progress >= 15)) {
    // The Stormcaller route advances without defeating the 15-point quest.
    if (!q.stormcallerDestroyed && questDefeated(s, q.currentQuest))
      return true;
    q.advancing = true;
    prepend(s, fx("cityAdvance", { player: firstPlayer(s) }));
  } else if (s.stage === 3 && s.progress >= 18) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, fx("cityAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function cityFirstPlayerChanged(s: GameState) {
  if (!s.city) return;
  const sahir = enemies(s).find((u) => u.code === C.sahir && !u.blanked);
  if (!sahir) return;
  const player = firstPlayer(s);
  if (
    allEngaged(s).some((u) => u.id === sahir.id) &&
    ownerOf(s, sahir) === player
  )
    return;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((u) => u.id !== sahir.id);
    });
  s.staging = s.staging.filter((u) => u.id !== sahir.id);
  s.staging.push(sahir);
  forOwner(s, player, () => engage(s, sahir));
}
export function cityDamageAmount(s: GameState, u: Unit, amount: number) {
  if (!s.city || u.code !== C.sahir || u.blanked || amount <= 0) return amount;
  const cancelled = Math.min(u.resources, amount);
  u.resources -= cancelled;
  if (cancelled)
    log(
      s,
      `Captain Sahír discards ${cancelled} resources to cancel ${cancelled} damage.`,
    );
  return amount - cancelled;
}
export const cityIndestructible = (s: GameState, u: Unit) =>
  u.code === C.sahir &&
  stageLive(s, 4) &&
  enemies(s).some((e) => e.resources > 0);

/** Called only for an actual destruction, before its resource tokens leave play. */
export function cityDestroyed(s: GameState, u: Unit, destruction = true) {
  if (!s.city || !destruction) return;
  if (u.code === C.stormcaller && s.stage === 1)
    s.city.stormcallerDestroyed = true;
  if (!stageLive(s, 4) || (!isHero(u) && !isEnemy(u))) return;
  const sahir = enemies(s).find((e) => e.code === C.sahir && e.id !== u.id);
  if (sahir && u.resources > 0) {
    const amount = u.resources;
    sahir.resources += amount;
    u.resources = 0;
    log(
      s,
      `${name(u)} is destroyed; Captain Sahír gains its ${amount} resources.`,
      "danger",
    );
  }
}
/** Victory is earned by defeating an enemy, never by the stage-2 discard. */
export function cityEnemyDestination(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (!s.city || destruction || !card(u.code).victory) return false;
  s.encounterDiscard.push(u.code);
  return true;
}
/** One notification represents the complete cost, even when several pools paid it. */
export function cityResourcesSpent(
  s: GameState,
  player: number,
  amount: number,
) {
  if (!s.city || amount <= 0) return;
  for (const u of allEngaged(s))
    if (u.code === C.slaver && !u.blanked && ownerOf(s, u) === player) {
      u.resources++;
      log(
        s,
        `${name(u)} takes 1 of the resources spent by ${seatName(s, player)}.`,
        "danger",
      );
    }
}
export function cityResourcesBegin(s: GameState): Effect[] {
  if (!s.city) return [];
  return [...s.staging, ...allActiveLocations(s)]
    .filter((u) => u.code === C.monument && !u.blanked)
    .map((u) =>
      fx("cityMonumentResources", { source: u.id, player: firstPlayer(s) }),
    );
}
export const cityImmuneToEvents = (s: GameState, u: Unit) =>
  !!s.city &&
  trait(u, "Raider") &&
  u.resources > 0 &&
  [...s.staging, ...allActiveLocations(s)].some(
    (l) => l.code === C.monument && !l.blanked,
  );
export function cityCombatStart(s: GameState): Effect[] {
  if (!s.city) return [];
  const sahir = enemies(s).find((u) => u.code === C.sahir);
  if (sahir) s.city.sahirAttacks = { id: sahir.id, round: s.round, count: 0 };
  else delete s.city.sahirAttacks;
  return [];
}
const sahirAttacksMade = (s: GameState, u: Unit) => {
  const ledger = s.city?.sahirAttacks;
  return ledger?.id === u.id && ledger.round === s.round ? ledger.count : 0;
};
/** Printed variable quantities are recalculated during the enemy-attack window. */
export function cityNormalAttackPending(
  s: GameState,
  u: Unit,
): boolean | undefined {
  if (!s.city || u.code !== C.sahir) return undefined;
  return (
    sahirAttacksMade(s, u) < 1 + (u.blanked ? 0 : Math.floor(u.resources / 5))
  );
}
export function cityNormalAttackMarked(s: GameState, u: Unit) {
  if (!s.city || u.code !== C.sahir) return;
  s.city.sahirAttacks = {
    id: u.id,
    round: s.round,
    count: sahirAttacksMade(s, u) + 1,
  };
}
/** FAQ 1.42: discard every old shadow and deal a fresh one for another attack. */
export function cityPrepareAttack(s: GameState, u: Unit) {
  if (!s.city || u.code !== C.sahir || sahirAttacksMade(s, u) < 1) return;
  s.encounterDiscard.push(...u.shadows.splice(0));
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  const code = encounterDraw(s, true);
  if (code) {
    u.shadows.push(code);
    heirsShadowDealt(s, u);
    carnShadowDealt(s, u);
  }
}
export function cityRoundEnd(s: GameState): Effect[] {
  if (!s.city || s.stage !== 1) return [];
  return allEngaged(s)
    .filter((u) => u.code === C.stormcaller && !u.blanked)
    .map((u) =>
      fx("cityStormcallerEnd", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function cityPublicState(s: GameState) {
  const q = s.city;
  if (!q) return undefined;
  const sahir = enemies(s).find((u) => u.code === C.sahir);
  return {
    atSea: s.stage <= 2,
    stormcallerDestroyed: q.stormcallerDestroyed,
    corsairCount: q.corsairDeck.length,
    corsairDiscardCount: q.corsairDiscard.length,
    secondDeckCount: q.secondDeck.length,
    inactiveDeckCount: q.inactiveDeck.length,
    inactiveDiscardCount: q.inactiveDiscard.length,
    sahir: sahir
      ? {
          id: sahir.id,
          resources: sahir.resources,
          damage: sahir.damage,
          indestructible: cityIndestructible(s, sahir),
          extraAttacks: Math.floor(sahir.resources / 5),
        }
      : undefined,
  };
}
function search(
  s: GameState,
  type: "enemy" | "location",
  discard: boolean,
  player: number,
): Option[] {
  return (["deck", ...(discard ? ["discard"] : [])] as string[]).flatMap(
    (zone) =>
      (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
        (code, index) => {
          const kind = card(code).type_code;
          if (
            !(type === "enemy"
              ? ["enemy", "ship-enemy"].includes(kind)
              : kind === "location")
          )
            return [];
          return [
            {
              id: `${zone}-${index}`,
              code,
              label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
              effects: [
                fx("citySearchTake", {
                  code,
                  value: index,
                  text: zone,
                  player,
                }),
              ],
            },
          ];
        },
      ),
  );
}
function nextStage(s: GameState, stage: number) {
  const q = s.city!;
  q.completedQuests.push(q.currentQuest);
  addVictoryCard(s, q.currentQuest);
  q.currentQuest = q.questDeck.shift()!;
  s.stage = stage;
  s.progress = 0;
  q.advancing = true;
  s.stageRevealing = true;
  log(
    s,
    `${card(q.currentQuest).name} · ${stage === 2 ? "The fleet reaches Umbar." : stage === 3 ? "The heroes enter the Corsair city." : "The final confrontation begins."}`,
    "chapter",
  );
}
function takeAside(s: GameState, code: string) {
  const q = s.city!;
  const index = q.setAside.findIndex((u) => u.code === code);
  return index < 0 ? undefined : q.setAside.splice(index, 1)[0];
}
export function cityEffect(s: GameState, e: Effect) {
  if (Encounters.cityEncounterEffect(s, e)) return true;
  if (!e.kind.startsWith("city")) return false;
  const q = s.city;
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "citySetup":
      for (const code of [
        C.stormcaller,
        ...Array<string>(playerOrder(s).length >= 3 ? 2 : 1).fill(C.belfalas),
      ]) {
        const unit = make(s, code);
        s.staging.push(unit);
        if (isEnemy(unit)) enemyAddedToStaging(s, unit);
        Encounters.cityCardEntered(s, unit, false, false);
      }
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    case "cityAdvance":
      if (s.stage === 1) {
        nextStage(s, 2);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("cityAssignDamage", {
              player,
              value: own(s, player)
                .filter(isShipObjective)
                .reduce((n, u) => n + u.damage, 0),
              text: "Fate of the Dream-chaser",
            }),
          ),
          fx("cityDiscardFleet", { player: firstPlayer(s) }),
          fx("citySwapDeck", { player: firstPlayer(s) }),
        );
      } else if (s.stage === 3) {
        nextStage(s, 4);
        const monument = takeAside(s, C.monument),
          sahir = takeAside(s, C.sahir);
        if (monument) s.staging.push(monument);
        if (sahir) {
          s.staging.push(sahir);
          enemyAddedToStaging(s, sahir);
          Encounters.cityCardEntered(s, sahir, false, false);
          forOwner(s, firstPlayer(s), () => engage(s, sahir));
        }
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("cityStageSearch", { text: "enemy", flag: true, player }),
          ),
          fx("cityAllRaiderResources", { player: firstPlayer(s) }),
          fx("cityStageReady", { player: firstPlayer(s) }),
        );
      }
      break;
    case "cityAssignDamage": {
      const remaining = e.value ?? 0;
      const chars = own(s, e.player ?? activeSeat(s)).filter(
        (u) => !isShipObjective(u),
      );
      if (remaining <= 0 || !chars.length) break;
      choose(
        s,
        `${e.text ?? "Encounter effect"} · Assign ${remaining} damage`,
        chars.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Deal 1 damage to ${name(u)}`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: e.player }),
            { ...e, value: remaining - 1 },
          ],
        })),
        "Assign damage among non-Ship characters you control before the fleet is discarded.",
      );
      break;
    }
    case "cityDiscardFleet":
      // Caleb Grace, 29 Nov 2016 (ALeP 3.226): stage 2A also discards every
      // shadow in play. Surviving Corsairs must not carry sea cards onto land.
      for (const enemy of enemies(s)) {
        s.encounterDiscard.push(...enemy.shadows.splice(0));
        delete enemy.faceupShadows;
        enemy.revealedShadowCount = 0;
        delete enemy.shadowCancelsDamage;
        delete enemy.shadowCancelsCombatDamage;
      }
      for (const combat of [s.combat, ...s.suspendedCombats])
        if (combat?.immediatePreviousShadows) {
          s.encounterDiscard.push(...combat.immediatePreviousShadows.splice(0));
          combat.immediatePreviousFaceupShadows = [];
          combat.immediatePreviousRevealedShadowCount = 0;
          combat.immediatePreviousShadowCancelsDamage = false;
          combat.immediatePreviousShadowCancelsCombatDamage = false;
        }
      for (const enemy of [...enemies(s)].filter(isShipEnemy))
        destroy(s, enemy, false);
      for (const ship of allCharacters(s).filter(isShipObjective))
        destroy(s, ship, false);
      for (const location of [...s.staging, ...allActiveLocations(s)].filter(
        (u) => card(u.code).type_code === "location" && trait(u, "Ocean"),
      ))
        discardLocation(s, location);
      break;
    case "citySwapDeck": {
      const land = [
        ...q.secondDeck.splice(0),
        ...q.corsairDeck.splice(0),
        ...q.corsairDiscard.splice(0),
      ];
      for (const pile of [s.encounterDeck, s.encounterDiscard])
        for (let i = pile.length - 1; i >= 0; i--)
          if ([C.watch, C.battle].includes(pile[i]))
            land.push(pile.splice(i, 1)[0]);
      q.inactiveDeck = s.encounterDeck.splice(0);
      q.inactiveDiscard = s.encounterDiscard.splice(0);
      s.encounterDeck = shuffle(s, land);
      delete s.sailing;
      nextStage(s, 3);
      // These physical cards are searched from the newly active City deck.
      for (const code of [C.monument, C.sahir]) {
        const index = s.encounterDeck.indexOf(code);
        if (index >= 0)
          q.setAside.push(make(s, s.encounterDeck.splice(index, 1)[0]));
      }
      prepend(
        s,
        ...playerOrder(s).flatMap((player) => [
          fx("cityStageSearch", { text: "enemy", player }),
          fx("cityStageSearch", { text: "location", player }),
        ]),
        fx("cityHavenResources", { player: firstPlayer(s) }),
        fx("cityStageReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "cityStageSearch": {
      const options = search(
        s,
        e.text === "location" ? "location" : "enemy",
        !!e.flag,
        e.player ?? firstPlayer(s),
      );
      if (options.length)
        choose(
          s,
          `${card(q.currentQuest).name} · ${seatName(s, e.player ?? firstPlayer(s))} chooses an ${e.text}`,
          options,
        );
      break;
    }
    case "citySearchTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value === undefined || pile[e.value] !== e.code) break;
      const unit = make(s, pile.splice(e.value, 1)[0]);
      s.staging.push(unit);
      if (isEnemy(unit)) enemyAddedToStaging(s, unit);
      Encounters.cityCardEntered(s, unit, false, false);
      break;
    }
    case "cityHavenResources":
      if (!q.stormcallerDestroyed)
        for (const enemy of enemies(s).filter((u) => trait(u, "Raider")))
          enemy.resources++;
      break;
    case "cityAllRaiderResources":
      for (const enemy of enemies(s).filter((u) => trait(u, "Raider")))
        enemy.resources++;
      break;
    case "cityStageReady":
      shuffle(s, s.encounterDeck);
      q.advancing = false;
      prepend(s, fx("stageRevealed", { player: firstPlayer(s) }));
      break;
    case "cityMonumentResources": {
      const source = [...s.staging, ...allActiveLocations(s)].find(
        (u) => u.id === e.source,
      );
      if (source?.code === C.monument && !source.blanked)
        for (const enemy of enemies(s).filter((u) => trait(u, "Raider")))
          enemy.resources++;
      break;
    }
    case "cityStormcallerEnd":
      if (
        u &&
        u.code === C.stormcaller &&
        allEngaged(s).some((x) => x.id === u.id) &&
        !u.blanked
      )
        choose(s, "Stormcaller · End of the round", [
          {
            id: "staging",
            label: "Return Stormcaller to the staging area",
            effects: [
              fx("cityStormcallerReturn", {
                target: u.id,
                player: ownerOf(s, u),
              }),
            ],
          },
          ...(s.sailing && s.sailing.heading < 3
            ? [
                {
                  id: "heading",
                  label: "Shift heading off-course",
                  effects: [fx("sailingShift", { value: 1 })],
                },
              ]
            : []),
        ]);
      break;
    case "cityStormcallerReturn":
      if (u && allEngaged(s).some((x) => x.id === u.id)) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        delete u.owner;
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    default:
      return false;
  }
  return true;
}
export const citySharedEffect = (e: Effect) =>
  [
    "citySetup",
    "cityAdvance",
    "cityDiscardFleet",
    "citySwapDeck",
    "cityHavenResources",
    "cityAllRaiderResources",
    "cityStageReady",
    "cityMonumentResources",
  ].includes(e.kind);
