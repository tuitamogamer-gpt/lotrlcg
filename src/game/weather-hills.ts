import { isHero } from "./card-types";
import type { Effect, GameState, Option, Phase, Unit } from "./types";
import { isAngmarAdventure } from "./angmar-scenario-ids";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardQuestAttachments,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  revealed,
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
  seatView,
} from "./table";
import {
  allQuestUnits,
  attachToQuest,
  currentQuestUnit,
  mainQuestCode,
} from "./quest-state";
import { CHETWOOD } from "./chetwood-support";
import {
  WEATHER as W,
  WEATHER_RECIPES,
  weatherSideTime,
} from "./weather-hills-support";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { reduceThreat } from "./threat-reduction";
import { syncAttachmentText } from "./attachment-text";

const mission = (s: GameState) => s.staging.find((u) => u.code === W.mission);
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const live = (s: GameState, code: string) =>
  locations(s).filter((u) => u.code === code && !u.blanked);
const character = (u: Unit) =>
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code);
const committed = (s: GameState, u: Unit) =>
  u.committed || seatView(s, ownerOf(s, u)).committedIds.includes(u.id);
const weatherCard = (code: string) =>
  card(code).type_code === "treachery" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Weather");
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const sharedCards = [
  W.wind,
  W.cold,
  W.blast,
  W.camp,
  W.search,
  W.ruins,
  W.discovery,
  W.causeway,
];
const sharedEffects = [
  "weatherAllThreat",
  "weatherPlayerThreat",
  "weatherHeroDamage",
  "weatherAssignDamage",
  "weatherColdAttach",
  "weatherUndefendedChoice",
  "weatherMakeUndefended",
  "weatherHealResponse",
  "weatherHealHero",
  "weatherSearchResponse",
  "weatherReduceAllThreat",
];
const sharedRules = (s: GameState) =>
  !!s.weatherHills || isAngmarAdventure(s.scenarioId);

/** Assigning damage to one character creates one damage event for that total. */
function mergeAssignedDamage(effects: Effect[]) {
  const merged: Effect[] = [];
  for (const effect of effects) {
    const previous = merged.find(
      (e) =>
        e.kind === "damage" &&
        effect.kind === "damage" &&
        e.target === effect.target &&
        e.player === effect.player,
    );
    if (previous) previous.value = (previous.value ?? 0) + (effect.value ?? 0);
    else merged.push({ ...effect });
  }
  return merged;
}

function ordered(s: GameState, effects: Effect[], text: string) {
  if (!effects.length) return;
  if (effects.length === 1) prepend(s, effects[0]);
  else
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
function lose(s: GameState) {
  s.status = "lost";
  s.reason =
    "Savage Counter-attack has no resource tokens. The Orcs overwhelm the Rangers.";
  s.queue = [];
  s.choice = null;
}

/** Each recipe zone is already separated; setup placements do not reveal their cards. */
export function setupWeather(s: GameState) {
  const recipe = WEATHER_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  s.weatherHills = {
    initialized: false,
    orcDeck: pile("sharedEncounterDeck2"),
    setAside: pile("sharedSetAside").map((code) => make(s, code)),
    weatherSurgeRound: 0,
  };
}
export function weatherOpeningHandsKept(s: GameState) {
  if (!s.weatherHills || s.weatherHills.initialized) return false;
  prepend(s, fx("weatherSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function weatherCardEntered(s: GameState, u: Unit, fromReveal: boolean) {
  if (s.weatherHills && weatherSideTime(u.code))
    u.timeCounters = fromReveal ? weatherSideTime(u.code) : 0;
}
/** Revealing a set-aside card retains the same physical card and attachments. */
export function weatherRevealedUnit(
  s: GameState,
  code: string,
): Unit | undefined {
  const q = s.weatherHills;
  if (!q?.advancing) return undefined;
  const i = q.setAside.findIndex((u) => u.code === code);
  return i >= 0 ? q.setAside.splice(i, 1)[0] : undefined;
}
export function weatherRevealSurge(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
) {
  const q = s.weatherHills;
  if (
    !q ||
    s.stage !== 1 ||
    origin !== "encounter" ||
    !weatherCard(code) ||
    q.weatherSurgeRound === s.round
  )
    return false;
  q.weatherSurgeRound = s.round;
  return true;
}
export function weatherAfterReveal(s: GameState, code: string) {
  if (!s.weatherHills || !weatherCard(code)) return;
  for (const u of live(s, W.hilltop)) {
    u.resources++;
    log(s, `${name(u)} gains a resource token.`, "danger");
  }
}
export function weatherCanceled(s: GameState, code: string) {
  if (!sharedRules(s) || card(code).type_code !== "treachery") return;
  ordered(
    s,
    live(s, W.ruins).map((u) =>
      fx("weatherAllThreat", {
        code: u.code,
        target: u.id,
        value: 2,
        player: firstPlayer(s),
      }),
    ),
    "Ruins of Arnor · Choose the next Forced effect",
  );
}
export function weatherLocationThreat(
  s: GameState,
  u: Unit,
): number | undefined {
  return s.weatherHills && u.code === W.hilltop && !u.blanked
    ? (card(u.code).threat ?? 0) + u.resources
    : undefined;
}
export const weatherWillPenalty = (s: GameState, u: Unit) =>
  s.weatherHills && s.stage === 2 && character(u) && u.damage > 0 ? -1 : 0;

/** Only defeated enemies trigger Hunting; tokens gained from the camp alone never flip it. */
export function weatherEnemyDefeated(s: GameState, _u: Unit) {
  const m = mission(s);
  if (s.weatherHills?.initialized && m && !m.flipped && !m.blanked)
    prepend(
      s,
      fx("weatherEnemyToken", { target: m.id, player: firstPlayer(s) }),
    );
}
export function weatherCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    sharedRules(s) &&
    character(u) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId
  )
    s.combat.weatherCharacterKilled = true;
}
export function weatherAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (!sharedRules(s) || !c.weatherCharacterKilled) return;
  const effects: Effect[] = [];
  const m = mission(s);
  if (s.weatherHills && m?.flipped && !m.blanked)
    effects.push(
      fx("weatherRemoveMission", {
        target: m.id,
        value: 1,
        player: firstPlayer(s),
      }),
    );
  if (c.weatherRuinsThreat)
    effects.push(
      fx("weatherPlayerThreat", {
        value: c.weatherRuinsThreat,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  if (!effects.length) return;
  // Chetwood's shared Angmar hook runs immediately before this hook. Combine
  // every simultaneous Forced effect, including Captain and Marauder, into
  // its existing ordering group and defense-continuation sentinel.
  const angmar = s.queue[0];
  if (angmar?.kind === "chetAttackEffects")
    angmar.effects = [...(angmar.effects ?? []), ...effects];
  else prepend(s, fx("chetAttackEffects", { effects, player: firstPlayer(s) }));
}
export function weatherEngaged(s: GameState, u: Unit) {
  if (s.weatherHills && u.code === W.cornered && !u.blanked)
    prepend(s, fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }));
}
export function weatherOrcAdded(s: GameState, u: Unit) {
  if (
    !s.weatherHills ||
    card(u.code).type_code !== "enemy" ||
    !(card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Orc")
  )
    return;
  for (const l of allActiveLocations(s).filter(
    (l) => l.code === W.forn && !l.blanked,
  ))
    prepend(
      s,
      fx("immediateAttack", {
        target: u.id,
        code: l.code,
        player: firstPlayer(s),
      }),
    );
}
export function weatherExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (!sharedRules(s)) return;
  // "When explored" resolves before "After the active location is explored".
  if (s.weatherHills && s.stage === 1 && wasActive)
    prepend(
      s,
      fx("weatherRevealOrcs", {
        value: (s.table?.seats.length ?? 1) >= 3 ? 2 : 1,
        player: firstPlayer(s),
      }),
    );
  if (u.code === W.causeway && !u.blanked)
    prepend(
      s,
      fx("weatherAllThreat", {
        value: 2,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (s.weatherHills && wasActive && !u.blanked && u.code === W.orcCamp)
    prepend(s, fx("weatherCampTokenResponse", { player: firstPlayer(s) }));
  if (s.weatherHills && wasActive && !u.blanked && u.code === W.valley)
    prepend(s, fx("weatherValleyResponse", { player: firstPlayer(s) }));
}
export function weatherRefreshEnd(s: GameState) {
  if (!sharedRules(s)) return;
  const effects: Effect[] = s.staging
    .filter((u) => u.code === W.search && !u.blanked)
    .map((u) =>
      fx("weatherAllThreat", {
        target: u.id,
        code: u.code,
        value: 2,
        player: firstPlayer(s),
      }),
    );
  for (const l of allActiveLocations(s).filter(
    (u) => !!s.weatherHills && u.code === W.ridge && !u.blanked,
  ))
    effects.push(
      fx("weatherRidgeDamage", { code: l.code, player: firstPlayer(s) }),
    );
  for (const u of s.staging) {
    if (
      s.weatherHills &&
      !u.blanked &&
      weatherSideTime(u.code) &&
      u.timeCounters
    ) {
      u.timeCounters--;
      if (!u.timeCounters)
        effects.push(
          fx("weatherShelterExpired", { target: u.id, player: firstPlayer(s) }),
        );
    }
  }
  ordered(s, effects, "Choose the next end-of-refresh Forced effect");
}
export function weatherQuestStart(s: GameState) {
  if (s.weatherHills && s.stage === 2)
    prepend(s, fx("weatherQuestCost", { player: firstPlayer(s) }));
}
export const weatherStagingCountBonus = (s: GameState) =>
  s.weatherHills &&
  seatView(s, firstPlayer(s)).used.includes("phase:weather-additional-reveal")
    ? 1
    : 0;
export function weatherCheck(s: GameState) {
  if (!s.weatherHills?.initialized || s.status !== "playing") return;
  const m = mission(s);
  if (m?.flipped && !m.blanked && m.resources <= 0) lose(s);
}
export function weatherAdvance(s: GameState) {
  const q = s.weatherHills;
  if (!q) return false;
  if (
    q.initialized &&
    s.stage === 2 &&
    !q.advancing &&
    !s.stageRevealing &&
    !s.queue.length &&
    !s.choice &&
    s.progress >= 20 &&
    !locations(s).some((u) => u.code === W.forn && !u.blanked)
  ) {
    if (!questDefeated(s, W.animals)) win(s);
  }
  return true;
}
export function weatherTravelProblem(s: GameState, u: Unit) {
  if (!s.weatherHills || u.blanked) return null;
  if (u.code === W.valley && !mission(s)?.resources)
    return "Sheltered Valley requires a resource token on the Mission objective.";
  if (
    u.code === W.orcCamp &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (code) =>
        card(code).type_code === "enemy" &&
        (card(code).traits ?? "").split(".").some((t) => t.trim() === "Orc"),
    )
  )
    return "Concealed Orc-camp requires an Orc enemy in the encounter deck or discard pile.";
  return null;
}
export function weatherTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (!s.weatherHills || u.blanked) return undefined;
  if (u.code === W.valley)
    return [fx("weatherRemoveMission", { value: 1, player: firstPlayer(s) })];
  if (u.code === W.orcCamp)
    return [fx("chetSearchOrc", { player: firstPlayer(s) }), fx("chetShuffle")];
  return undefined;
}
export function weatherSideDefeated(s: GameState, u: Unit) {
  if (!sharedRules(s)) return;
  if (u.code === W.camp)
    prepend(s, fx("weatherHealResponse", { player: firstPlayer(s) }));
  if (u.code === W.search)
    prepend(s, fx("weatherSearchResponse", { player: firstPlayer(s) }));
}

export function weatherEncounter(s: GameState, code: string, replay = false) {
  if (
    !s.weatherHills &&
    !(isAngmarAdventure(s.scenarioId) && sharedCards.includes(code))
  )
    return false;
  if (code === W.wind) {
    const ids = allCharacters(s)
      .filter((u) => committed(s, u))
      .map((u) => u.id);
    prepend(
      s,
      fx("weatherAssignDamage", {
        value: ids.length,
        ids,
        player: firstPlayer(s),
        code,
      }),
    );
  } else if (code === W.ice) {
    const count = allQuestUnits(s).length;
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("weatherAssignDamage", {
          value: count,
          ids: [
            ...seatView(s, player).heroes,
            ...seatView(s, player).allies,
          ].map((u) => u.id),
          player,
          code,
        }),
      ),
      fx("weatherIceExhaust", { player: firstPlayer(s) }),
    );
  } else if (code === W.cold) {
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("weatherHeroDamage", { value: 1, player, code }),
      ),
      fx("weatherColdAttach", { player: firstPlayer(s) }),
    );
  } else if (code === W.blast) {
    for (const u of allCharacters(s).filter((u) => u.damage > 0)) {
      u.committed = false;
      forOwner(s, ownerOf(s, u), () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
    }
  } else if (code === W.discovery) {
    const amount = allActiveLocations(s).reduce(
      (n, u) => n + threatOf(s, u),
      0,
    );
    prepend(
      s,
      fx("weatherAllThreat", { value: amount, code, player: firstPlayer(s) }),
    );
  } else return false;
  if (!replay && card(code).type_code === "treachery" && code !== W.cold)
    s.encounterDiscard.push(code);
  return true;
}
export function weatherShadow(s: GameState, code: string) {
  const c = s.combat;
  if (
    (!s.weatherHills &&
      !(isAngmarAdventure(s.scenarioId) && sharedCards.includes(code))) ||
    !c
  )
    return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === W.cornered) {
    const defenders = (
      c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
    ).map((id) => get(s, id));
    c.attackBonus += defenders.some((u) => u && u.damage > 0) ? 2 : 1;
  } else if (code === W.ridge || code === W.blast) {
    c.attackBonus += [
      ...seatView(s, player).heroes,
      ...seatView(s, player).allies,
    ].filter((u) => u.damage > 0).length;
  } else if (code === W.ice) {
    prepend(
      s,
      fx("weatherAssignDamage", {
        value: allQuestUnits(s).length,
        ids: [...seatView(s, player).heroes, ...seatView(s, player).allies].map(
          (u) => u.id,
        ),
        player,
        code,
      }),
    );
  } else if (code === W.wind) {
    const ids = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
    if (ids.length > 1)
      choose(
        s,
        "Biting Wind · Damage a defender",
        ids.flatMap((id) => {
          const u = get(s, id);
          return u
            ? [
                {
                  id,
                  code: u.code,
                  label: name(u),
                  effects: [fx("damage", { target: id, value: 1, player })],
                },
              ]
            : [];
        }),
      );
    else if (ids[0])
      prepend(s, fx("damage", { target: ids[0], value: 1, player }));
  } else if (code === W.ruins) {
    c.attackBonus++;
    c.weatherRuinsThreat = (c.weatherRuinsThreat ?? 0) + 2;
  } else if (code === W.discovery)
    prepend(s, fx("weatherUndefendedChoice", { player }));
  else return false;
  return true;
}

/** End the interrupted framework flow while retaining already-triggered card effects. */
function endInterruptedPhase(s: GameState) {
  const phase = s.phase;
  const obsolete = new Set([
    "reveal",
    "resolveQuestResult",
    "questReady",
    "khazadStagingEnd",
    "questSucceeded",
    "questSuccessResponses",
    "successfulQuestProgress",
    "failedQuest",
    "finishQuestPhase",
    "commitSeat",
    "automaticEngagement",
    "engagementRound",
    "engagementAllAreas",
    "startCombat",
    "combatStartEffects",
    "prepareCombat",
    "enemyDamage",
    "combatDamage",
    "enemyDone",
    "shadowReveal",
    "shadowResponse",
    "shadowEffect",
    "immediateChooseDefender",
    "immediateDefend",
    "resolvePlayerAttack",
    "playerAttackResolved",
    "endCombat",
    "travelEnter",
    "travelDone",
    "phaseEnd",
    "startPlanning",
    "startQuest",
    "startTravel",
    "startEncounter",
    "refreshReady",
    "refreshEnd",
    "endRound",
    "endRoundAfterCollector",
    "nextRound",
    "resourceCollect",
  ]);
  s.queue = s.queue.filter(
    (e) =>
      !obsolete.has(e.kind) &&
      !(
        ["continueProgress", "allocateActiveProgress"].includes(e.kind) &&
        e.text === "quest"
      ),
  );
  for (const u of allCharacters(s)) u.committed = false;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.committedIds = [];
    });
  s.lastQuest = null;
  delete s.sideQuestSelections;
  if (
    phase === "defense" ||
    phase === "attack" ||
    s.combat ||
    s.suspendedCombats.length
  ) {
    for (const combat of [
      ...s.suspendedCombats,
      ...(s.combat ? [s.combat] : []),
    ])
      s.encounterDiscard.push(...(combat.immediatePreviousShadows ?? []));
    for (const enemy of [...s.staging, ...allEngaged(s)]) {
      s.encounterDiscard.push(...enemy.shadows);
      enemy.shadows = [];
      delete enemy.faceupShadows;
      enemy.revealedShadowCount = 0;
      delete enemy.shadowCancelsDamage;
      delete enemy.shadowCancelsCombatDamage;
    }
    if (s.pendingWolfReturns?.length)
      s.encounterDeck.unshift(...s.pendingWolfReturns.splice(0));
  }
  s.combat = null;
  s.suspendedCombats = [];
  delete s.earlyAttackPlayers;
  delete s.pendingQuestDefeat;
  prepend(
    s,
    fx("phaseEnd"),
    fx("weatherStageTwoSetup", { text: phase, player: firstPlayer(s) }),
  );
}
function successor(phase: Phase) {
  if (phase === "resource") return "startPlanning";
  if (phase === "planning") return "startQuest";
  if (phase === "quest" || phase === "staging") return "startTravel";
  if (phase === "travel") return "startEncounter";
  if (phase === "encounter") return "startCombat";
  if (phase === "defense" || phase === "attack") return "refreshReady";
  if (phase === "refresh") return "endRound";
  return "nextRound";
}

export function weatherEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("weather")) return false;
  const q = s.weatherHills;
  if (
    !q &&
    !(isAngmarAdventure(s.scenarioId) && sharedEffects.includes(e.kind))
  )
    return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "weatherSetup": {
      q!.initialized = true;
      const m = make(s, W.mission);
      m.flipped = false;
      s.staging.push(m, make(s, W.hilltop));
      s.activeLocation = make(s, W.ridge);
      shuffle(s, s.encounterDeck);
      shuffle(s, q!.orcDeck);
      break;
    }
    case "weatherEnemyToken": {
      if (!u || u.code !== W.mission || u.flipped) break;
      u.resources++;
      if (!u.flipped && u.resources >= 3 + (s.table?.seats.length ?? 1)) {
        u.flipped = true;
        q!.advancing = true;
        prepend(s, fx("weatherAdvanceStage", { player: firstPlayer(s) }));
      }
      break;
    }
    case "weatherAdvanceStage":
      discardQuestAttachments(s, mainQuestCode(s)!);
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, "The Orcs are cornered. Savage Counter-attack begins.", "chapter");
      endInterruptedPhase(s);
      break;
    case "weatherStageTwoSetup": {
      s.encounterDeck.push(
        ...s.encounterDiscard.splice(0),
        ...q!.orcDeck.splice(0),
      );
      shuffle(s, s.encounterDeck);
      const effects = [CHETWOOD.ambush, W.forn].flatMap((code) =>
        q!.setAside.some((u) => u.code === code)
          ? [fx("weatherRevealAside", { code, player: firstPlayer(s) })]
          : [],
      );
      prepend(
        s,
        ...effects,
        fx("weatherStageReady", { text: e.text, player: firstPlayer(s) }),
      );
      break;
    }
    case "weatherRevealAside":
      if (e.code) revealed(s, e.code);
      break;
    case "weatherStageReady":
      q!.advancing = false;
      s.stageRevealing = false;
      prepend(s, fx(successor(e.text as Phase), { player: firstPlayer(s) }));
      break;
    case "weatherRevealOrcs": {
      const code = q!.orcDeck.shift();
      if (code) {
        if ((e.value ?? 1) > 1)
          prepend(
            s,
            fx("weatherRevealOrcs", {
              value: e.value! - 1,
              player: firstPlayer(s),
            }),
          );
        revealed(s, code);
      }
      break;
    }
    case "weatherRemoveMission": {
      const m = u?.code === W.mission ? u : mission(s);
      if (m) m.resources = Math.max(0, m.resources - (e.value ?? 1));
      weatherCheck(s);
      break;
    }
    case "weatherQuestCost": {
      const options: Option[] = [];
      if (mission(s)?.resources)
        options.push({
          id: "token",
          label: "Discard 1 resource token from Savage Counter-attack",
          effects: [
            fx("weatherRemoveMission", { value: 1, player: firstPlayer(s) }),
          ],
        });
      options.push({
        id: "reveal",
        label: "Reveal an additional encounter card during staging",
        effects: [fx("used", { text: "phase:weather-additional-reveal" })],
      });
      choose(
        s,
        "Cornered Animals · Pay a token or reveal an extra card",
        options,
      );
      break;
    }
    case "weatherAllThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "weatherPlayerThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "weatherRidgeDamage":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("weatherCharacterDamage", { value: 1, player, code: W.ridge }),
        ),
      );
      break;
    case "weatherShelterExpired":
      if (u && !u.blanked && !u.timeCounters)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("weatherHeroDamage", { value: 4, player, code: W.shelter }),
          ),
          fx("weatherResetShelter", { target: u.id, player: firstPlayer(s) }),
        );
      break;
    case "weatherResetShelter":
      if (u && s.staging.some((x) => x.id === u.id)) u.timeCounters = 4;
      break;
    case "weatherHeroDamage":
    case "weatherCharacterDamage": {
      const targets =
        e.kind === "weatherHeroDamage" ? s.heroes : [...s.heroes, ...s.allies];
      choose(
        s,
        `${card(e.code!).name} · Choose a ${e.kind === "weatherHeroDamage" ? "hero" : "character"}`,
        targets.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Deal ${e.value ?? 1} damage to ${name(h)}`,
          effects: [fx("damage", { target: h.id, value: e.value ?? 1 })],
        })),
      );
      break;
    }
    case "weatherAssignDamage": {
      const amount = e.value ?? 0;
      const reserved = (id: string) =>
        (e.effects ?? [])
          .filter((effect) => effect.kind === "damage" && effect.target === id)
          .reduce((sum, effect) => sum + (effect.value ?? 0), 0);
      const capacity = (u: Unit) =>
        Math.max(0, stats(s, u).health - u.damage - reserved(u.id));
      const targets = (e.ids ?? []).flatMap((id) => {
        const u = get(s, id);
        return u && character(u) && capacity(u) > 0 ? [u] : [];
      });
      if (amount <= 0 || !targets.length) {
        prepend(s, ...mergeAssignedDamage(e.effects ?? []));
        break;
      }
      choose(
        s,
        `${card(e.code!).name} · Assign ${amount} remaining damage`,
        targets.flatMap((h) =>
          Array.from({ length: Math.min(amount, capacity(h)) }, (_, index) => {
            const value = index + 1;
            return {
              id: `${h.id}:${value}`,
              code: h.code,
              label: `${value} damage to ${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
              effects: [
                fx("weatherAssignDamage", {
                  value: amount - value,
                  ids: e.ids,
                  code: e.code,
                  effects: [
                    ...(e.effects ?? []),
                    fx("damage", {
                      target: h.id,
                      value,
                      player: ownerOf(s, h),
                    }),
                  ],
                }),
              ],
            };
          }),
        ),
      );
      break;
    }
    case "weatherIceExhaust":
      for (const h of allCharacters(s).filter((u) => u.damage > 0))
        exhaustCharacter(s, h);
      break;
    case "weatherColdAttach": {
      const quest = currentQuestUnit(s);
      const attachment = {
        id: make(s, W.cold).id,
        code: W.cold,
        exhausted: false,
      };
      if (!quest || !attachToQuest(s, quest.code, attachment))
        s.encounterDiscard.push(W.cold);
      syncAttachmentText(s);
      break;
    }
    case "weatherUndefendedChoice":
      choose(
        s,
        "Tragic Discovery · Raise threat or leave this attack undefended",
        [
          {
            id: "threat",
            label: "Raise your threat by 3",
            effects: [fx("weatherPlayerThreat", { value: 3 })],
          },
          {
            id: "undefended",
            label: "This attack is considered undefended",
            effects: [fx("weatherMakeUndefended")],
          },
        ],
      );
      break;
    case "weatherMakeUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
      }
      break;
    case "weatherCampTokenResponse":
      choose(s, "Concealed Orc-camp · Add a resource token to the Mission?", [
        {
          id: "token",
          label: "Place 1 resource token on the Mission objective",
          effects: [fx("weatherCampToken")],
        },
        skip,
      ]);
      break;
    case "weatherCampToken": {
      const m = mission(s);
      if (m) m.resources++;
      break;
    }
    case "weatherValleyResponse": {
      const targets = allCharacters(s).filter((h) =>
        rhosgobelHealingAllowed(s, h),
      );
      if (targets.length)
        choose(s, "Sheltered Valley · Heal all damage from a character", [
          ...targets.map((h) => ({
            id: h.id,
            code: h.code,
            label: `Heal ${name(h)}`,
            effects: [fx("weatherValleyHeal", { target: h.id })],
          })),
          skip,
        ]);
      break;
    }
    case "weatherValleyHeal":
      if (u) rhosgobelHeal(s, u, u.damage, { code: W.valley });
      break;
    case "weatherHealResponse":
      if (
        allCharacters(s).some((u) => isHero(u) && rhosgobelHealingAllowed(s, u))
      )
        choose(
          s,
          "Make Camp · Heal up to 3 damage from one hero for each player?",
          [
            {
              id: "heal",
              label: "Resolve the healing response",
              effects: playerOrder(s).map((player) =>
                fx("weatherHealHero", { player }),
              ),
            },
            skip,
          ],
        );
      break;
    case "weatherHealHero":
      choose(s, "Make Camp · Heal up to 3 damage from a hero", [
        ...s.heroes
          .filter((h) => rhosgobelHealingAllowed(s, h))
          .flatMap((h) =>
            Array.from({ length: Math.min(3, h.damage) }, (_, index) => ({
              id: `${h.id}:${index + 1}`,
              code: h.code,
              label: `Heal ${index + 1} damage from ${name(h)}`,
              effects: [
                fx("heal", { target: h.id, value: index + 1, code: W.camp }),
              ],
            })),
          ),
        { id: "skip", label: "Heal 0 damage", effects: [] },
      ]);
      break;
    case "weatherSearchResponse":
      choose(s, "Search the Ruins · Reduce each player's threat by 3?", [
        {
          id: "reduce",
          label: "Reduce each player's threat by 3",
          effects: [fx("weatherReduceAllThreat")],
        },
        skip,
      ]);
      break;
    case "weatherReduceAllThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () =>
          reduceThreat(s, 3, { code: W.search }, "encounter"),
        );
      break;
    default:
      return false;
  }
  return true;
}
