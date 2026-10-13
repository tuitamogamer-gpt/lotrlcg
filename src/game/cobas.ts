import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { surgeEffects } from "./surge";
import { resolveDoomed } from "./voice-isengard";
import { mainQuestUnit } from "./quest-state";
import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly } from "./card-types";
import { isEnemy, isShipEnemy, isShipObjective } from "./ships";
import {
  choose,
  enemyAttackPrevented,
  fx,
  get,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  spendResources,
  stats,
  removeShadowCard,
} from "./core";
import {
  addVictoryCard,
  damage,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  exhaustCharacter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { sailingOnCourse } from "./sailing";
import {
  COBAS as C,
  COBAS_OBJECTIVES,
  COBAS_RECIPES,
  COBAS_SHIPS,
  COBAS_MAIN_QUESTS,
  cobasStageInfo,
  cobasGuardsObjective,
} from "./cobas-support";

export { cobasGuardIds, cobasGuardsObjective } from "./cobas-support";

const active = (s: GameState) => !!s.cobas;
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const ships = (s: GameState) => allCharacters(s).filter(isShipObjective);
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const objectives = (s: GameState) =>
  s.staging.filter((u) => COBAS_OBJECTIVES.includes(u.code));
const guards = (s: GameState, objective: Unit) =>
  [...s.staging, ...allEngaged(s), ...allActiveLocations(s)].filter((u) =>
    cobasGuardsObjective(u, objective.id),
  );
export const cobasObjectiveControlled = (s: GameState, u: Unit) =>
  active(s) &&
  objectives(s).some((o) => o.id === u.id) &&
  !s.cobas!.pendingGuarded.includes(u.id) &&
  !guards(s, u).length;
const controlled = cobasObjectiveControlled;
export function cobasGuardedStarted(s: GameState, u: Unit) {
  if (
    s.cobas &&
    COBAS_OBJECTIVES.includes(u.code) &&
    !s.cobas.pendingGuarded.includes(u.id)
  )
    s.cobas.pendingGuarded.push(u.id);
}
const bonus = (s: GameState, code: string) =>
  objectives(s).some((u) => u.code === code && !u.blanked && controlled(s, u));
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const freshPhysical = (s: GameState, u: Unit) => {
  const fresh = { ...make(s, u.code), id: u.id };
  delete fresh.owner;
  return fresh;
};
const phaseKey = (s: GameState) =>
  `${s.round}:${["quest", "staging"].includes(s.phase) ? "quest" : ["defense", "attack"].includes(s.phase) ? "combat" : s.phase}`;
const unguarded = (s: GameState) =>
  objectives(s).filter((u) => controlled(s, u));
const guarding = (s: GameState, u: Unit) =>
  objectives(s).some((o) => cobasGuardsObjective(u, o.id));
const stageLive = (s: GameState, stage: number) =>
  active(s) && s.stage === stage && !mainQuestUnit(s)?.blanked;
export const cobasSailingExtraCards = (s: GameState) =>
  bonus(s, C.sea) ? 2 : 0;
export const cobasBoardingModifier = (s: GameState) =>
  active(s)
    ? -allActiveLocations(s).filter((u) => u.code === C.haven && !u.blanked)
        .length
    : 0;
export const cobasEngagementModifier = (s: GameState, u: Unit) =>
  active(s) &&
  u.code === C.flagship &&
  !mainQuestUnit(s)?.blanked &&
  (s.stage === 3 || s.sailing?.heading === 3)
    ? -50
    : 0;
export const cobasCanAttackEnemy = (s: GameState, enemy: Unit, u: Unit) =>
  !active(s) ||
  enemy.code !== C.flagship ||
  enemy.blanked ||
  isShipObjective(u);
export const cobasStats = (s: GameState, u: Unit) => {
  const increase =
    active(s) && u.code === C.warship && !u.blanked && sailingOnCourse(s)
      ? 2
      : 0;
  return {
    will: increase + (u.cobasShipObjective ? (card(u.code).threat ?? 0) : 0),
    attack: increase,
    defense: increase,
  };
};
export const cobasThreatBonus = (s: GameState, u: Unit) =>
  active(s) && u.code === C.coast && !u.blanked && !sailingOnCourse(s) ? 2 : 0;
export const cobasStagingThreat = (s: GameState) =>
  s.cobas?.rammingPhase === phaseKey(s) ? s.cobas.rammingThreat : 0;
export const cobasArchery = (s: GameState, base: number) =>
  active(s)
    ? Math.max(
        0,
        base +
          2 *
            enemies(s).filter((u) => u.code === C.siege && !u.blanked).length -
          (bonus(s, C.heron) ? 4 : 0),
      )
    : base;
export function cobasPublicState(s: GameState) {
  const q = s.cobas;
  if (!q) return undefined;
  return {
    objectives: objectives(s).map((u) => {
      const attached = guards(s, u),
        guard = attached[0];
      return {
        id: u.id,
        code: u.code,
        controlled: controlled(s, u),
        pendingGuarded: q.pendingGuarded.includes(u.id),
        guards: attached.map((g) => ({ id: g.id, code: g.code })),
        guardId: guard?.id,
        guardCode: guard?.code,
      };
    }),
    corsairCount: q.corsairDeck.length,
    discardCount: q.corsairDiscard.length,
    warshipsAvailable: q.setAside.filter((u) => u.code === C.warship).length,
    belfalas: q.belfalas.map((x) => ({ id: x.enemy.id, code: x.enemy.code })),
    questPoints: cobasStageInfo(s)?.quest ?? 0,
    flagshipDefeated: (s.victoryCards ?? []).includes(C.flagship),
    heading: s.sailing?.heading,
  };
}
export function setupCobas(s: GameState) {
  const recipe = COBAS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = [...pile("sharedEncounterDeck"), ...COBAS_OBJECTIVES];
  s.cobas = {
    initialized: false,
    advancing: false,
    currentQuest: C.outmaneuver,
    questDeck: COBAS_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: [...COBAS_SHIPS, C.warship, C.warship].map((c) => make(s, c)),
    corsairDeck: shuffle(s, pile("sharedEncounterDeck2")),
    corsairDiscard: [],
    belfalas: [],
    capturePending: [],
    pendingGuarded: [],
    rammingThreat: 0,
  };
  s.sailing = { heading: 0 };
}
export function cobasOpeningHandsKept(s: GameState) {
  if (!s.cobas || s.cobas.initialized) return false;
  prepend(
    s,
    fx("voyageFleet", { player: firstPlayer(s), value: 0 }),
    fx("cobasSetup", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function cobasCheck(s: GameState) {
  const q = s.cobas;
  if (!q) return;
  for (const entry of [...q.belfalas]) {
    if (allActiveLocations(s).some((u) => u.id === entry.locationId)) continue;
    q.belfalas = q.belfalas.filter((x) => x !== entry);
    if (entry.player !== undefined && !s.table?.seats[entry.player]?.eliminated)
      forOwner(s, entry.player, () => s.engaged.push(entry.enemy));
    else {
      delete entry.enemy.owner;
      s.staging.push(entry.enemy);
    }
    log(
      s,
      `${name(entry.enemy)} returns to play as Belfalas Islet is no longer active.`,
    );
  }
  if (q.rammingPhase && q.rammingPhase !== phaseKey(s)) {
    q.rammingThreat = 0;
    delete q.rammingPhase;
  }
}
export function cobasAdvance(s: GameState) {
  const q = s.cobas;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.phase === "setup"
  )
    return true;
  if (s.stage === 3) {
    if (
      !s.choice &&
      !s.queue.length &&
      (s.progress >= (cobasStageInfo(s)?.quest ?? Infinity) ||
        (s.victoryCards ?? []).includes(C.flagship))
    ) {
      win(s);
      s.reason = "Your fleet breaks the Corsair blockade of Cobas Haven.";
    }
    return true;
  }
  if (s.stage === 2 && objectives(s).some((u) => !controlled(s, u)))
    return true;
  if (s.progress >= (cobasStageInfo(s)?.quest ?? Infinity)) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, fx("cobasAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function cobasEngaged(s: GameState, u: Unit) {
  if (!stageLive(s, 1) || !isShipEnemy(u)) return;
  if (sailingOnCourse(s)) prepend(s, fx("damage", { target: u.id, value: 2 }));
  else prepend(s, fx("cobasEngagementDamage", { player: ownerOf(s, u) }));
}
export function cobasQuestEnd(s: GameState) {
  if (!active(s)) return;
  const effects = s.staging
    .filter((u) => u.code === C.siege && !u.blanked && !guarding(s, u))
    .map((u) =>
      fx("cobasSiege", {
        target: u.id,
        player: firstPlayer(s),
        code: u.code,
        text: `${name(u)} · guard an objective`,
      }),
    );
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        effects,
        player: firstPlayer(s),
        text: "Choose the next Siege Ship Forced effect",
      }),
    );
  else prepend(s, ...effects);
}
export function cobasPhaseEnd(s: GameState) {
  if (!active(s)) return;
  for (const { enemy } of s.cobas!.belfalas) {
    enemy.tempThreat = 0;
    enemy.tempWill = 0;
    enemy.tempAttack = 0;
    enemy.tempDefense = 0;
    enemy.suppressed = false;
    enemy.feinted = false;
    enemy.preventedAttacks = [];
    delete enemy.phaseResourceIcons;
  }
  if (s.phase !== "encounter") return;
  prepend(
    s,
    ...allEngaged(s)
      .filter((u) => u.code === C.flagship && !u.blanked)
      .map((u) => fx("voyageBoard", { player: ownerOf(s, u), source: u.id })),
  );
}
export function cobasRoundEnd(s: GameState) {
  for (const { enemy } of s.cobas?.belfalas ?? []) {
    enemy.boost = 0;
    delete enemy.tempEngagement;
    delete enemy.roundAttack;
    delete enemy.roundDefense;
    delete enemy.roundThreat;
    delete enemy.roundCannotTakeDamage;
  }
}
export function cobasExhausted(s: GameState, u: Unit) {
  if (!active(s)) return;
  prepend(
    s,
    ...u.attachments
      .filter((a) => a.code === C.water && !a.blanked)
      .map(() =>
        fx("damage", { target: u.id, value: 2, player: ownerOf(s, u) }),
      ),
  );
}
export function cobasDamageDealt(
  s: GameState,
  _u: Unit,
  value: number,
  context: DamageContext,
) {
  const q = s.cobas,
    c = s.combat;
  if (
    !q ||
    !c?.cobasRamming ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    value <= 0
  )
    return;
  q.rammingPhase = phaseKey(s);
  q.rammingThreat += value;
}
export function cobasRemoveCharacter(
  s: GameState,
  u: Unit,
  destruction: boolean,
  lastKnownBlanked = !!u.blanked,
) {
  if (!s.cobas || u.code !== C.warship || !destruction || lastKnownBlanked)
    return false;
  // The physical card returns as a fresh game instance; lasting modifiers do not follow it out of play.
  s.cobas.setAside.push(freshPhysical(s, u));
  return true;
}
export function cobasEnemyDestination(
  s: GameState,
  u: Unit,
  destruction: boolean,
  wasEngaged: boolean,
  lastKnownBlanked = !!u.blanked,
) {
  if (
    !s.cobas ||
    u.code !== C.skirmisher ||
    u.cobasShipObjective ||
    lastKnownBlanked ||
    !destruction ||
    !wasEngaged
  )
    return false;
  s.cobas.capturePending.push(u);
  prepend(s, fx("cobasCaptureOffer", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export const cobasCannotTravel = (s: GameState, u: Unit) =>
  active(s) && !u.blanked && u.code === C.belfalas && !sailingOnCourse(s);
export function cobasTravelProblem(s: GameState, u: Unit) {
  if (!active(s) || u.blanked) return null;
  if (cobasCannotTravel(s, u))
    return "You must be on-course to travel to Belfalas Islet.";
  if (u.code === C.coast && !ships(s).some(canExhaust))
    return "Exhaust a ready Ship objective to travel to Coast of Anfalas.";
  return null;
}
export function cobasTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!active(s) || u.blanked || u.code !== C.coast) return undefined;
  return [fx("cobasCoastTravel", { player: firstPlayer(s) })];
}
export function cobasTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel: boolean,
) {
  cobasCheck(s);
  if (active(s) && actualTravel && u.code === C.belfalas && !u.blanked)
    prepend(
      s,
      fx("cobasBelfalasOffer", { target: u.id, player: firstPlayer(s) }),
    );
}
export function cobasAbilityLabel(s: GameState, u: Unit) {
  if (!active(s)) return undefined;
  if (u.code === C.gull)
    return "Exhaust Tower of the Gull · Deal 2 damage to a non-unique Ship enemy";
  if (u.code === C.beacon)
    return "Exhaust The Beacon · Spend 5 resources to take a Dol Amroth Warship";
  return undefined;
}
export function cobasAbilityProblem(s: GameState, u: Unit) {
  if (!active(s) || !controlled(s, u) || u.blanked || u.exhausted)
    return "The objective must be controlled by the players, ready and unblanked.";
  if (u.code === C.gull) {
    if (!["defense", "attack"].includes(s.phase))
      return "Use this Combat Action in the combat phase.";
    if (!enemies(s).some((e) => isShipEnemy(e) && !card(e.code).is_unique))
      return "Choose a non-unique Ship enemy.";
  }
  if (u.code === C.beacon) {
    if (s.phase !== "planning")
      return "Use this Planning Action in the planning phase.";
    if (!s.cobas!.setAside.some((u) => u.code === C.warship))
      return "There is no set-aside Dol Amroth Warship.";
    if (
      allHeroes(s)
        .filter((h) => ownerOf(s, h) === activeSeat(s))
        .reduce((n, h) => n + h.resources, 0) < 5
    )
      return "Spend 5 resources from your heroes.";
  }
  return null;
}
export function cobasWaterAbilities(s: GameState, u: Unit) {
  if (!active(s)) return [];
  return u.attachments
    .filter((a) => a.code === C.water && !a.blanked)
    .map((a) => ({
      id: a.id,
      label: "Taking on Water · Exhaust 3 characters you control to discard",
      disabled: own(s, activeSeat(s)).filter(canExhaust).length < 3,
    }));
}
export function cobasAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (!active(s)) return false;
  if (attachmentId) {
    if (
      !u.attachments.some(
        (a) => a.id === attachmentId && a.code === C.water && !a.blanked,
      )
    )
      return false;
    requireRule(
      own(s, activeSeat(s)).filter(canExhaust).length >= 3,
      "Exhaust 3 ready characters you control.",
    );
    prepend(
      s,
      fx("cobasWaterPay", {
        target: u.id,
        source: attachmentId,
        ids: [],
        player: activeSeat(s),
      }),
    );
    return true;
  }
  if (!cobasAbilityLabel(s, u)) return false;
  requireRule(!cobasAbilityProblem(s, u), cobasAbilityProblem(s, u) ?? "");
  if (u.code === C.gull)
    choose(
      s,
      "Tower of the Gull · Choose a Ship enemy",
      enemies(s)
        .filter((e) => isShipEnemy(e) && !card(e.code).is_unique)
        .map((e) => ({
          id: e.id,
          code: e.code,
          label: `Deal 2 damage to ${name(e)}`,
          effects: [
            fx("cobasGullDamage", {
              target: e.id,
              source: u.id,
              player: activeSeat(s),
            }),
          ],
        })),
    );
  else
    prepend(
      s,
      fx("cobasBeaconPay", {
        target: u.id,
        value: 5,
        player: activeSeat(s),
        ids: [],
      }),
    );
  return true;
}
function search(
  s: GameState,
  predicate: (code: string) => boolean,
  effect: string,
): Option[] {
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
                  fx(effect, {
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
function takeSearch(s: GameState, e: Effect) {
  const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
  if (e.value === undefined || pile[e.value] !== e.code) return undefined;
  const u = make(s, pile.splice(e.value, 1)[0]);
  s.staging.push(u);
  if (isEnemy(u)) enemyAddedToStaging(s, u);
  return u;
}
function attachGuard(
  s: GameState,
  enemy: Unit,
  objective: Unit,
  additional = false,
) {
  if ((!additional && guarding(s, enemy)) || !controlled(s, objective))
    return false;
  const engaged = allEngaged(s).some((u) => u.id === enemy.id);
  if (engaged)
    forOwner(s, ownerOf(s, enemy), () => {
      s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
    });
  if (additional && enemy.guarding)
    enemy.cobasGuarding = [...(enemy.cobasGuarding ?? []), objective.id];
  else enemy.guarding = objective.id;
  log(s, `${name(enemy)} guards ${name(objective)}.`);
  return engaged;
}
export function cobasCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancel: boolean,
) {
  if (!active(s)) return;
  if (COBAS_OBJECTIVES.includes(u.code)) cobasGuardedStarted(s, u);
  if (!fromReveal || cancel || u.code !== C.heavy) return;
  prepend(s, fx("cobasHeavySearch", { target: u.id, player: firstPlayer(s) }));
}
export function cobasEncounter(s: GameState, code: string, replay = false) {
  if (!active(s)) return false;
  if (code === C.water)
    prepend(
      s,
      fx("cobasWaterAttach", { player: firstPlayer(s), flag: replay }),
    );
  else if (code === C.assault)
    prepend(s, fx("cobasAssault", { player: firstPlayer(s), flag: replay }));
  else if (code === C.ramming)
    prepend(s, fx("cobasRamming", { player: firstPlayer(s), flag: replay }));
  else return false;
  if (code !== C.water && !replay) s.encounterDiscard.push(code);
  return true;
}
export function cobasShadow(s: GameState, code: string) {
  if (!active(s) || !s.combat) return false;
  if (code === C.coast) {
    if (!sailingOnCourse(s)) s.combat.attackBonus += 2;
    return true;
  }
  if (code === C.water) {
    const defender = get(s, s.combat.defenderId ?? undefined),
      enemy = get(s, s.combat.enemyId);
    if (defender && isShipObjective(defender) && enemy) {
      removeShadowCard(
        enemy,
        Math.max(0, (enemy.revealedShadowCount ?? 1) - 1),
      );
      defender.attachments.push({
        id: `a${s.nextId++}`,
        code,
        exhausted: false,
      });
    }
    return true;
  }
  return false;
}
export function cobasEffect(s: GameState, e: Effect) {
  if (
    !e.kind.startsWith("cobas") ||
    e.kind.startsWith("cobasPlayer") ||
    e.kind.startsWith("cobasEconomy") ||
    e.kind.startsWith("cobasReactive")
  )
    return false;
  const q = s.cobas;
  if (!q) return false;
  const u = get(s, e.target),
    player = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "cobasSetup": {
      for (const code of [C.flagship, C.scout]) {
        const unit = make(s, code);
        s.staging.push(unit);
        enemyAddedToStaging(s, unit);
      }
      choose(
        s,
        "Prepare Dol Amroth’s defenses",
        COBAS_OBJECTIVES.map((code) => ({
          id: code,
          code,
          label: `Choose ${card(code).name}`,
          effects: [
            fx("cobasSetupObjective", { code, player: firstPlayer(s) }),
          ],
        })),
      );
      break;
    }
    case "cobasSetupObjective": {
      const index = s.encounterDeck.indexOf(e.code!);
      if (index < 0) break;
      const objective = make(s, s.encounterDeck.splice(index, 1)[0]);
      s.staging.push(objective);
      cobasGuardedStarted(s, objective);
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      prepend(
        s,
        fx("guardObjective", { target: objective.id, player: firstPlayer(s) }),
      );
      break;
    }
    case "cobasAdvance": {
      q.completedQuests.push(q.currentQuest);
      addVictoryCard(s, q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      log(s, `${card(q.currentQuest).name} · The battle continues.`, "chapter");
      prepend(
        s,
        fx("cobasStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    }
    case "cobasStageReveal":
      if (s.stage === 2)
        prepend(
          s,
          fx("cobasStageSearch", {
            value: playerOrder(s).length >= 3 ? 2 : 1,
            player: firstPlayer(s),
          }),
          fx("cobasShuffle"),
          fx("cobasStageGuards", { player: firstPlayer(s) }),
        );
      else if (s.stage === 3)
        prepend(s, fx("engagementRound", { player: firstPlayer(s) }));
      break;
    case "cobasStageSearch": {
      if ((e.value ?? 0) <= 0) break;
      const options = search(
        s,
        (code) => card(code).type_code === "ship-enemy",
        "cobasSearchTake",
      );
      if (options.length)
        choose(
          s,
          "Battle in the Bay · Choose a Ship enemy",
          options.map((o) => ({
            ...o,
            effects: [
              ...o.effects,
              fx("cobasStageSearch", {
                value: (e.value ?? 1) - 1,
                player: firstPlayer(s),
              }),
            ],
          })),
        );
      break;
    }
    case "cobasSearchTake":
      takeSearch(s, e);
      break;
    case "cobasShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "cobasStageGuards": {
      const target = unguarded(s)[0],
        available = s.staging.filter(
          (u) => isShipEnemy(u) && !card(u.code).is_unique && !guarding(s, u),
        );
      if (!target || !available.length) break;
      // Each objective receives a separate physical guard; first player chooses order and pairings.
      choose(
        s,
        "Battle in the Bay · Guard a Dol Amroth objective",
        unguarded(s).flatMap((o) =>
          available.map((enemy) => ({
            id: `${o.id}:${enemy.id}`,
            code: enemy.code,
            label: `${name(enemy)} guards ${name(o)}`,
            effects: [
              fx("cobasGuard", { target: enemy.id, source: o.id }),
              fx("cobasStageGuards", { player: firstPlayer(s) }),
            ],
          })),
        ),
      );
      break;
    }
    case "cobasGuardedDone": {
      q.pendingGuarded = q.pendingGuarded.filter((id) => id !== e.target);
      break;
    }
    case "cobasGuard": {
      const objective = get(s, e.source);
      if (u && objective) attachGuard(s, u, objective);
      break;
    }
    case "cobasEngagementDamage": {
      const targets = own(s, player).filter(isShipObjective);
      if (targets.length)
        choose(
          s,
          "Outmaneuver the Enemy · Damage a Ship objective",
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Deal 2 damage to ${name(u)}`,
            effects: [fx("damage", { target: u.id, value: 2, player })],
          })),
        );
      break;
    }
    case "cobasSiege": {
      if (
        !u ||
        u.blanked ||
        !s.staging.some((x) => x.id === u.id) ||
        guarding(s, u)
      )
        break;
      const options = unguarded(s).map((o) => ({
        id: o.id,
        code: o.code,
        label: `Guard ${name(o)}`,
        effects: [fx("cobasGuard", { target: u.id, source: o.id })],
      }));
      if (options.length) choose(s, "Siege Ship · Guard an objective", options);
      break;
    }
    case "cobasHeavySearch": {
      if (!u) break;
      const options = search(
        s,
        (code) => COBAS_OBJECTIVES.includes(code),
        "cobasHeavyTake",
      ).map((o) => ({
        ...o,
        effects: o.effects.map((effect) => ({ ...effect, target: u.id })),
      }));
      if (options.length)
        choose(s, "Heavy Cruiser · Search for a Dol Amroth objective", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "cobasHeavyTake": {
      const objective = takeSearch(s, e);
      if (objective && u) {
        // Caleb Grace, 27 April 2018: the Cruiser guards both objectives at once.
        attachGuard(s, u, objective, true);
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "cobasAssault": {
      const available = enemies(s).filter(
          (u) => isShipEnemy(u) && !guarding(s, u),
        ),
        targets = unguarded(s);
      if (!available.length || !targets.length) {
        if (!e.flag) prepend(s, ...surgeEffects(C.assault));
        break;
      }
      choose(
        s,
        "The Raiders’ Assault · Attach a Ship enemy to an objective",
        targets.flatMap((o) =>
          available.map((enemy) => ({
            id: `${o.id}:${enemy.id}`,
            code: enemy.code,
            label: `${name(enemy)} guards ${name(o)}`,
            effects: [
              fx("cobasAssaultGuard", {
                target: enemy.id,
                source: o.id,
                flag: e.flag,
              }),
            ],
          })),
        ),
      );
      break;
    }
    case "cobasAssaultGuard": {
      const objective = get(s, e.source);
      if ((!u || !objective || !attachGuard(s, u, objective)) && !e.flag)
        prepend(s, ...surgeEffects(C.assault));
      break;
    }
    case "cobasCoastTravel": {
      const options = ships(s)
        .filter(canExhaust)
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("exhaust", { target: u.id, player: ownerOf(s, u) })],
        }));
      if (options.length) choose(s, "Coast of Anfalas · Travel cost", options);
      break;
    }
    case "cobasBelfalasOffer": {
      if (!u || !allActiveLocations(s).some((x) => x.id === u.id)) break;
      const options = enemies(s)
        .filter((u) => isShipEnemy(u) && !guarding(s, u))
        .map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: `Set ${name(enemy)} out of play while Belfalas Islet is active`,
          effects: [
            fx("cobasBelfalasTake", { target: enemy.id, source: u.id }),
          ],
        }));
      if (options.length)
        choose(s, "Belfalas Islet · Optional response", [
          ...options,
          { id: "skip", label: "Decline the response", effects: [] },
        ]);
      break;
    }
    case "cobasBelfalasTake": {
      if (
        !u ||
        !e.source ||
        guarding(s, u) ||
        !allActiveLocations(s).some((x) => x.id === e.source)
      )
        break;
      const engaged = allEngaged(s).some((x) => x.id === u.id),
        owner = engaged ? ownerOf(s, u) : undefined;
      q.belfalas.push({
        locationId: e.source,
        enemy: u,
        ...(owner !== undefined ? { player: owner } : {}),
      });
      if (owner !== undefined)
        forOwner(s, owner, () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
      else s.staging = s.staging.filter((x) => x.id !== u.id);
      log(
        s,
        `${name(u)} is considered out of play while Belfalas Islet is active.`,
      );
      break;
    }
    case "cobasGullDamage": {
      const source = get(s, e.source);
      if (u && source && !cobasAbilityProblem(s, source)) {
        source.exhausted = true;
        damage(s, u.id, 2);
      }
      break;
    }
    case "cobasBeaconPay": {
      if (!u || u.code !== C.beacon || !controlled(s, u) || u.exhausted) break;
      const selected = e.ids ?? [],
        left = e.value ?? 5;
      if (left <= 0) {
        const payment = new Map<string, number>();
        for (const id of selected) payment.set(id, (payment.get(id) ?? 0) + 1);
        if (
          [...payment].some(([id, n]) => {
            const h = get(s, id);
            return !h || h.resources < n || ownerOf(s, h) !== player;
          })
        )
          break;
        const index = q.setAside.findIndex((u) => u.code === C.warship);
        if (index < 0) break;
        for (const [id, n] of payment) spendResources(s, get(s, id)!, n);
        u.exhausted = true;
        const ship = q.setAside.splice(index, 1)[0];
        ship.owner = player;
        ship.controller = player;
        forOwner(s, player, () => s.allies.push(ship));
        log(
          s,
          `${seatName(s, player)} takes control of Dol Amroth Warship.`,
          "good",
        );
        break;
      }
      const options = allHeroes(s)
        .filter(
          (h) =>
            ownerOf(s, h) === player &&
            h.resources > selected.filter((id) => id === h.id).length,
        )
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: `Spend 1 resource from ${name(h)} · ${left} remaining`,
          effects: [
            fx("cobasBeaconPay", {
              target: u.id,
              value: left - 1,
              ids: [...selected, h.id],
              player,
            }),
          ],
        }));
      if (options.length)
        choose(s, "The Beacon · Choose resource payment", options);
      break;
    }
    case "cobasWaterAttach": {
      const available = ships(s);
      if (!available.length) {
        if (!e.flag) s.encounterDiscard.push(C.water);
        break;
      }
      choose(
        s,
        "Taking on Water · Choose a Ship objective",
        available.map((ship) => ({
          id: ship.id,
          code: ship.code,
          label: `Attach Taking on Water to ${name(ship)}`,
          effects: [
            fx("cobasWaterAttached", { target: ship.id, flag: e.flag }),
          ],
        })),
      );
      break;
    }
    case "cobasWaterAttached":
      if (u)
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: C.water,
          exhausted: false,
        });
      else if (!e.flag) s.encounterDiscard.push(C.water);
      break;
    case "cobasWaterPay": {
      const selected = e.ids ?? [];
      if (
        !u?.attachments.some(
          (a) => a.id === e.source && a.code === C.water && !a.blanked,
        )
      )
        break;
      if (selected.length === 3) {
        const chars = selected.map((id) => get(s, id));
        if (chars.some((u) => !u || !canExhaust(u) || ownerOf(s, u) !== player))
          break;
        for (const char of chars) exhaustCharacter(s, char!);
        const a = u.attachments.find((a) => a.id === e.source);
        if (a) discardAttachment(s, u, a);
        break;
      }
      choose(
        s,
        "Taking on Water · Choose 3 ready characters",
        own(s, player)
          .filter((u) => canExhaust(u) && !selected.includes(u.id))
          .map((char) => ({
            id: char.id,
            code: char.code,
            label: `Select ${name(char)} · ${selected.length}/3 selected`,
            effects: [
              fx("cobasWaterPay", {
                target: u.id,
                source: e.source,
                ids: [...selected, char.id],
                player,
              }),
            ],
          })),
      );
      break;
    }
    case "cobasRamming": {
      const available = allEngaged(s).filter(isShipEnemy);
      if (sailingOnCourse(s) || !available.length) {
        if (!e.flag) resolveDoomed(s, 2, "encounter");
        break;
      }
      const max = Math.max(...available.map((u) => stats(s, u).attack));
      choose(
        s,
        "Ramming Speed! · Highest-attack engaged Ship",
        available
          .filter((u) => stats(s, u).attack === max)
          .map((enemy) => ({
            id: enemy.id,
            code: enemy.code,
            label: `${name(enemy)} attacks ${seatName(s, ownerOf(s, enemy))}`,
            effects: [
              fx("cobasRammingAttempt", {
                target: enemy.id,
                player: ownerOf(s, enemy),
                flag: e.flag,
              }),
            ],
          })),
      );
      break;
    }
    case "cobasRammingAttempt": {
      if (!u || enemyAttackPrevented(s, u, player)) {
        if (!e.flag) resolveDoomed(s, 2, "encounter");
      } else
        prepend(
          s,
          fx("immediateAttack", {
            target: u.id,
            player,
            text: "cobas-ramming",
          }),
        );
      break;
    }
    case "cobasCaptureOffer": {
      const enemy = q.capturePending.find((u) => u.id === e.target);
      if (!enemy) break;
      const available = own(s, player).filter(isAlly);
      const options: Option[] = [
        {
          id: "decline",
          label: "Leave Corsair Skirmisher in the encounter discard pile",
          effects: [fx("cobasCaptureDecline", { target: enemy.id })],
        },
      ];
      if (available.reduce((n, u) => n + stats(s, u).will, 0) >= 3)
        options.unshift({
          id: "capture",
          code: enemy.code,
          label:
            "Discard allies with at least 3 willpower to capture Corsair Skirmisher",
          effects: [
            fx("cobasCaptureSelect", { target: enemy.id, player, ids: [] }),
          ],
        });
      choose(s, "Corsair Skirmisher · Optional capture response", options);
      break;
    }
    case "cobasCaptureSelect": {
      const enemy = q.capturePending.find((u) => u.id === e.target);
      if (!enemy) break;
      const selected = e.ids ?? [],
        allies = own(s, player).filter(isAlly),
        total = allies
          .filter((u) => selected.includes(u.id))
          .reduce((n, u) => n + stats(s, u).will, 0);
      const options: Option[] = allies
        .filter((u) => !selected.includes(u.id))
        .map((ally) => ({
          id: ally.id,
          code: ally.code,
          label: `Select ${name(ally)} (${stats(s, ally).will} willpower) · ${total}/3 selected`,
          effects: [
            fx("cobasCaptureSelect", {
              target: enemy.id,
              player,
              ids: [...selected, ally.id],
            }),
          ],
        }));
      if (total >= 3)
        options.unshift({
          id: "pay",
          label: `Discard the selected allies (${total} willpower) and capture Corsair Skirmisher`,
          effects: [
            fx("cobasCapturePay", { target: enemy.id, player, ids: selected }),
          ],
        });
      options.push({
        id: "decline",
        label: "Decline the response",
        effects: [fx("cobasCaptureDecline", { target: enemy.id })],
      });
      choose(s, "Corsair Skirmisher · Choose allies to discard", options);
      break;
    }
    case "cobasCapturePay": {
      const index = q.capturePending.findIndex((u) => u.id === e.target);
      if (index < 0) break;
      const selected = own(s, player).filter(
        (u) => isAlly(u) && (e.ids ?? []).includes(u.id),
      );
      if (selected.reduce((n, u) => n + stats(s, u).will, 0) < 3) {
        prepend(s, fx("cobasCaptureDecline", { target: e.target }));
        break;
      }
      for (const ally of selected) destroy(s, ally, false);
      const enemy = q.capturePending.splice(index, 1)[0];
      if (s.status !== "playing") {
        s.encounterDiscard.push(enemy.code);
        break;
      }
      const captured = freshPhysical(s, enemy);
      captured.cobasShipObjective = true;
      captured.owner = player;
      captured.controller = player;
      forOwner(s, player, () => s.allies.push(captured));
      log(
        s,
        `${seatName(s, player)} captures Corsair Skirmisher as a Ship objective.`,
        "good",
      );
      break;
    }
    case "cobasCaptureDecline": {
      const index = q.capturePending.findIndex((u) => u.id === e.target);
      if (index >= 0)
        s.encounterDiscard.push(q.capturePending.splice(index, 1)[0].code);
      break;
    }
    default:
      return false;
  }
  return true;
}
export const cobasSharedEffect = (e: Effect) =>
  [
    "cobasSetup",
    "cobasSetupObjective",
    "cobasAdvance",
    "cobasStageReveal",
    "cobasStageSearch",
    "cobasSearchTake",
    "cobasShuffle",
    "cobasStageGuards",
    "cobasGuard",
    "cobasGuardedDone",
    "cobasSiege",
    "cobasHeavySearch",
    "cobasHeavyTake",
    "cobasAssault",
    "cobasAssaultGuard",
    "cobasCoastTravel",
    "cobasBelfalasOffer",
    "cobasBelfalasTake",
    "cobasWaterAttach",
    "cobasWaterAttached",
    "cobasRamming",
    "cobasCaptureDecline",
  ].includes(e.kind);
