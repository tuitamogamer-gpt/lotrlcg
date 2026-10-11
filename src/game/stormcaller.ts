import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isHero, isAlly } from "./card-types";
import { voyageEncounter } from "./voyage-belegaer";
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
  locationQuest,
} from "./core";
import {
  enemyAddedToStaging,
  questDefeated,
  raiseThreat,
  win,
  engage,
  discardCharacter,
  progressLocation,
  damage,
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
import {
  allQuestUnits,
  currentQuestUnit,
  mainQuestUnit,
  attachToQuest,
} from "./quest-state";
import { sailingOnCourse } from "./sailing";
import {
  STORMCALLER as V,
  STORMCALLER_RECIPES,
  STORMCALLER_SHIPS,
  STORMCALLER_MAIN_QUESTS,
  STORMCALLER_ENEMY_QUESTS,
  stormcallerCurrentQuest,
  stormcallerStageInfo,
  stormcallerState,
  type StormcallerState,
} from "./stormcaller-support";

const isStormcaller = (s: GameState) => !!stormcallerState(s);
const ship = (u: Unit) => card(u.code).type_code === "ship-objective";
const shipEnemy = (u: Unit) => card(u.code).type_code === "ship-enemy";
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const questLive = (s: GameState, code: string) =>
  stormcallerCurrentQuest(s) === code && !mainQuestUnit(s)?.blanked;
const off = (s: GameState) => !sailingOnCourse(s);
const ships = (s: GameState) => allCharacters(s).filter(ship);

export const stormcallerSameStage = (s: GameState) =>
  !!stormcallerState(s) &&
  s.stage === stormcallerState(s)!.enemyStage &&
  card(stormcallerCurrentQuest(s)!).name ===
    card(stormcallerState(s)!.enemyQuest).name;
type AreaUnit = Unit & { stormcallerArea?: boolean };
export const stormcallerArea = (s: GameState) => [
  ...(stormcallerState(s)?.area ?? []),
  ...s.staging.filter((u) => (u as AreaUnit).stormcallerArea),
];
export const stormcallerStaging = (s: GameState) =>
  s.staging.filter((u) => (u as AreaUnit).stormcallerArea);
export function stormcallerSyncArea(s: GameState) {
  const q = stormcallerState(s);
  if (!q) return;
  if (stormcallerSameStage(s)) {
    const newlyStaged = q.area.splice(0);
    for (const u of newlyStaged) {
      (u as AreaUnit).stormcallerArea = true;
      s.staging.push(u);
    }
    prepend(
      s,
      ...newlyStaged
        .filter(
          (u) =>
            card(u.code).type_code === "location" &&
            u.progress >= locationQuest(s, u),
        )
        .map((u) => fx("stormcallerAreaExplore", { target: u.id })),
    );
  } else {
    const moved = s.staging.filter((u) => (u as AreaUnit).stormcallerArea);
    s.staging = s.staging.filter((u) => !(u as AreaUnit).stormcallerArea);
    q.area.push(...moved);
  }
}
export function stormcallerAreaLeft(s: GameState, u: Unit) {
  const q = stormcallerState(s);
  if (q) q.area = q.area.filter((a) => a.id !== u.id);
  delete (u as AreaUnit).stormcallerArea;
}
function addArea(s: GameState, u: Unit) {
  const q = stormcallerState(s);
  if (!q) return;
  s.staging = s.staging.filter((a) => a.id !== u.id);
  q.area = q.area.filter((a) => a.id !== u.id);
  (u as AreaUnit).stormcallerArea = true;
  q.area.push(u);
  stormcallerSyncArea(s);
}
export function stormcallerCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancel: boolean,
) {
  if (
    !isStormcaller(s) ||
    !fromReveal ||
    cancel ||
    ![V.escort, V.coast].includes(u.code)
  )
    return false;
  addArea(s, u);
  return true;
}
export const stormcallerAreaImmune = (s: GameState, u: Unit) =>
  isStormcaller(s) &&
  !stormcallerSameStage(s) &&
  stormcallerArea(s).some((a) => a.id === u.id);
export const stormcallerAreaCannotLeave = stormcallerAreaImmune;
export const stormcallerCanAttackEnemy = (
  s: GameState,
  enemy: Unit,
  character: Unit,
) =>
  !isStormcaller(s) ||
  !shipEnemy(enemy) ||
  (!stormcallerAreaImmune(s, enemy) &&
    !allEngaged(s).some(
      (u) =>
        u.code === V.captain &&
        !u.blanked &&
        ownerOf(s, u) === ownerOf(s, character),
    ));
export const stormcallerCanCancelWhenRevealed = (s: GameState, code: string) =>
  !isStormcaller(s) ||
  ![V.winds, V.overboard].includes(code) ||
  s.sailing?.heading !== 3;
function resetRound(s: GameState) {
  const q = stormcallerState(s);
  if (q && q.counterRound !== s.round) {
    q.counterRound = s.round;
    q.damageThisRound = 0;
    q.progressThisRound = 0;
  }
}
export function stormcallerDamageAmount(s: GameState, u: Unit, amount: number) {
  const q = stormcallerState(s);
  if (!q || u.code !== V.stormcaller) return amount;
  resetRound(s);
  const limit = q.enemyStage === 2 ? 4 : q.enemyStage === 3 ? 8 : Infinity;
  return Math.max(0, Math.min(amount, limit - q.damageThisRound));
}

export const stormcallerStats = (s: GameState, u: Unit) => ({
  will: 0,
  defense: 0,
  attack:
    isStormcaller(s) && u.code === V.seafarer && !u.blanked ? u.resources : 0,
});
export const stormcallerThreatBonus = (s: GameState, u: Unit) =>
  isStormcaller(s) &&
  u.code === V.stormcaller &&
  off(s) &&
  [2, 3].includes(stormcallerState(s)!.enemyStage)
    ? 2
    : 0;

export function stormcallerProgress(s: GameState, amount: number, quest: Unit) {
  const q = stormcallerState(s);
  if (!q || quest.code !== V.full) return amount;
  resetRound(s);
  const allowed = quest.blanked
    ? amount
    : Math.min(amount, Math.max(0, (off(s) ? 4 : 8) - q.progressThisRound));
  q.progressThisRound += allowed;
  return allowed;
}

export const stormcallerTravelProblem = (s: GameState, u: Unit) =>
  isStormcaller(s) && u.code === V.cove && !u.blanked && s.progress < 2
    ? "Hidden Cove requires moving 2 progress from the main quest; that Travel cost cannot be paid."
    : null;
export function stormcallerTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  return isStormcaller(s) && u.code === V.cove && !u.blanked
    ? [fx("stormcallerTransfer", { value: 2, flag: true })]
    : undefined;
}
export function stormcallerTravelEntered(s: GameState, u: Unit) {
  if (isStormcaller(s) && u.code === V.cove && !u.blanked)
    prepend(s, fx("stormcallerCoveResponse", { player: firstPlayer(s) }));
}

export function setupStormcaller(s: GameState) {
  const recipe = STORMCALLER_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  // The recipe preplaces two standard/one easy Rolling Seas; printed setup always requires one/two by player count.
  const rolls = Math.min(
      playerOrder(s).length >= 3 ? 2 : 1,
      pile("sharedEncounterDeck").filter((c) => c === V.rolling).length +
        pile("sharedStagingArea").filter((c) => c === V.rolling).length,
    ),
    preplaced = pile("sharedStagingArea").filter((c) => c === V.rolling).length;
  for (let n = rolls; n < preplaced; n++) s.encounterDeck.push(V.rolling);
  for (let n = preplaced; n < rolls; n++) {
    const index = s.encounterDeck.indexOf(V.rolling);
    if (index >= 0) s.encounterDeck.splice(index, 1);
  }
  const target = make(s, V.stormcaller);
  const q: StormcallerState = {
    initialized: false,
    advancing: false,
    currentQuest: V.departure,
    questDeck: STORMCALLER_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: STORMCALLER_SHIPS.map((c) => make(s, c)),
    corsairDeck: shuffle(s, pile("sharedEncounterDeck2")),
    corsairDiscard: [],
    area: [target],
    enemyQuest: V.fullEnemy,
    enemyQuestDeck: STORMCALLER_ENEMY_QUESTS.slice(1),
    enemyCompletedQuests: [],
    enemyStage: 2,
    enemyProgress: 0,
    stormcallerId: target.id,
    progressThisRound: 0,
    damageThisRound: 0,
    counterRound: s.round,
  };
  (s as GameState & { stormcaller?: StormcallerState }).stormcaller = q;
  s.sailing = { heading: 0 };
}

export function stormcallerOpeningHandsKept(s: GameState) {
  if (!isStormcaller(s) || stormcallerState(s)!.initialized) return false;
  prepend(
    s,
    fx("voyageFleet", { player: firstPlayer(s), value: 0 }),
    fx("stormcallerSetupDone"),
    fx("nextRound"),
  );
  return true;
}
export function stormcallerAdvance(s: GameState) {
  const q = stormcallerState(s);
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.phase === "setup"
  )
    return true;
  if (s.progress >= (stormcallerStageInfo(s)?.quest ?? Infinity)) {
    if (questDefeated(s, q.currentQuest)) return true;
    q.advancing = true;
    prepend(s, fx("stormcallerAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function stormcallerEndQuest(s: GameState) {
  if (isStormcaller(s) && off(s) && questLive(s, V.departure))
    prepend(s, fx("stormcallerTransfer", { value: 2 }));
}
export function stormcallerEndStaging(s: GameState) {
  if (isStormcaller(s) && off(s) && questLive(s, V.foul))
    prepend(s, fx("reveal"));
}
export function stormcallerTravelStart(s: GameState) {
  if (!isStormcaller(s)) return;
  const effects: Effect[] = [];
  for (const u of [
    ...s.staging,
    ...stormcallerState(s)!.area,
    ...allActiveLocations(s),
  ].filter((u) => u.code === V.reef && !u.blanked))
    effects.push(
      ...(off(s)
        ? ships(s).map((a) =>
            fx("damage", { target: a.id, value: 2, player: ownerOf(s, a) }),
          )
        : [fx("stormcallerReefProgress", { target: u.id, value: 2 })]),
    );
  prepend(s, ...effects);
}
export function stormcallerRoundEnd(s: GameState) {
  return isStormcaller(s) ? [fx("stormcallerEnemyRound")] : [];
}
function order(s: GameState, effects: Effect[], title: string) {
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        effects: effects.map((e) => ({
          ...e,
          code: e.code ?? get(s, e.target)?.code,
          text:
            e.text ??
            `${card(e.code ?? get(s, e.target)?.code ?? V.departure).name} · ${e.kind === "stormcallerSeafarer" ? "take a committed hero resource" : e.kind === "stormcallerSwiftEngage" ? "engage the committing player" : "resolve Forced effect"}`,
        })),
        text: title,
        player: firstPlayer(s),
      }),
    );
  else prepend(s, ...effects);
}
export function stormcallerCharactersCommitted(
  s: GameState,
  committed: Unit[],
  sailing = false,
) {
  if (!isStormcaller(s)) return;
  const effects: Effect[] = [];
  const groups = new Map<number, Unit[]>();
  for (const u of committed) {
    const player = ownerOf(s, u);
    groups.set(player, [...(groups.get(player) ?? []), u]);
  }
  for (const [player, chars] of groups) {
    for (const enemy of allEngaged(s).filter(
      (a) => a.code === V.seafarer && !a.blanked && ownerOf(s, a) === player,
    ))
      for (const hero of chars.filter(isHero))
        effects.push(
          fx("stormcallerSeafarer", {
            source: hero.id,
            target: enemy.id,
            player,
          }),
        );
    if (!sailing && off(s)) {
      const conditions = allQuestUnits(s)
        .flatMap((q) => q.attachments)
        .filter((a) => a.code === V.squall && !a.blanked).length;
      for (const ally of chars.filter(isAlly))
        for (let n = 0; n < conditions; n++)
          effects.push(fx("damage", { target: ally.id, value: 1, player }));
    }
  }
  if (!sailing)
    for (const [player, chars] of groups)
      if (chars.length >= 4)
        for (const enemy of s.staging.filter(
          (a) => a.code === V.swift && !a.blanked,
        ))
          effects.push(
            fx("stormcallerSwiftEngage", { target: enemy.id, player }),
          );
  order(s, effects, "Choose the next commitment Forced effect");
}
export function stormcallerSailingCommitted(s: GameState, u: Unit) {
  stormcallerCharactersCommitted(s, [u], true);
}
export function stormcallerSailingCommitDone(s: GameState) {
  const test = s.sailing?.test;
  if (!test || !isStormcaller(s)) return;
  const counts = new Map<number, number>();
  for (const id of test.committedIds) {
    const u = get(s, id);
    if (u)
      counts.set(
        ownerOf(s, u),
        (counts.get(ownerOf(s, u)) ?? 0) + (u.code === V.dream ? 2 : 1),
      );
  }
  const effects: Effect[] = [];
  for (const [player, count] of counts)
    if (count >= 4)
      for (const u of s.staging.filter((a) => a.code === V.swift && !a.blanked))
        effects.push(
          fx("stormcallerSwiftEngage", {
            target: u.id,
            player,
            code: u.code,
            text: `Swift Raider · Engage ${seatName(s, player)}`,
          }),
        );
  order(s, effects, "Choose the next Swift Raider engagement");
}
export function stormcallerWeatherRevealed(s: GameState, code: string) {
  if (
    !isStormcaller(s) ||
    !questLive(s, V.cape) ||
    card(code).type_code !== "treachery" ||
    !(card(code).traits ?? "").split(".").some((t) => t.trim() === "Weather")
  )
    return;
  prepend(
    s,
    ...[...ships(s), ...s.staging, ...allEngaged(s)]
      .filter((u) => ship(u) || shipEnemy(u))
      .map((u) =>
        fx(ship(u) ? "damage" : "stormcallerWeatherShipDamage", {
          target: u.id,
          value: 1,
          player: ship(u) ? ownerOf(s, u) : firstPlayer(s),
        }),
      ),
  );
}

export function stormcallerEngaged(
  s: GameState,
  u: Unit,
  fromStaging: boolean,
) {
  if (isStormcaller(s) && u.code === V.skiff && !u.blanked && fromStaging)
    prepend(s, fx("stormcallerSkiff", { target: u.id, player: ownerOf(s, u) }));
}
export function stormcallerCharacterLeaves(
  s: GameState,
  u: Unit,
  _destruction: boolean,
) {
  if (isStormcaller(s) && u.code === V.stormcaller) {
    win(s);
    s.reason = "The fleet captures the Stormcaller and recovers the key.";
  }
}
export function stormcallerDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  _context: DamageContext,
) {
  const q = stormcallerState(s);
  if (q && u.code === V.stormcaller) {
    resetRound(s);
    q.damageThisRound += value;
  }
}

export function stormcallerEncounter(
  s: GameState,
  code: string,
  replay = false,
) {
  if (!isStormcaller(s)) return false;
  if ([V.escort, V.coast].includes(code)) return true;
  if (code === V.squall) {
    const quest = currentQuestUnit(s);
    if (quest)
      attachToQuest(s, quest.code, {
        id: `c${s.nextId++}`,
        code: V.squall,
        exhausted: false,
      });
    return true;
  }
  if (code !== V.overboard) return false;
  prepend(
    s,
    ...playerOrder(s)
      .filter(
        (player) =>
          own(s, player)
            .filter((a) => a.committed)
            .reduce((n, a) => n + stats(s, a).will, 0) >= 8,
      )
      .map((player) => fx("stormcallerOverboard", { player, flag: true })),
  );
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function stormcallerShadow(s: GameState, code: string) {
  if (!isStormcaller(s) || !s.combat) return false;
  if (code === V.overboard)
    s.combat.attackBonus += stormcallerState(s)!.enemyStage;
  else if (code === V.coast) {
    if (stormcallerSameStage(s)) s.combat.attackBonus += 2;
  } else return false;
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
                  fx("stormcallerSearchTake", {
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
export function stormcallerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("stormcaller")) return false;
  const q = stormcallerState(s);
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "stormcallerWeatherShipDamage":
      if (u && shipEnemy(u)) damage(s, u.id, e.value ?? 1);
      break;
    case "stormcallerAreaExplore":
      if (u && !stormcallerAreaCannotLeave(s, u)) progressLocation(s, u, 0);
      break;
    case "stormcallerReefProgress":
      if (u) progressLocation(s, u, e.value ?? 2);
      break;
    case "stormcallerSeafarer": {
      const hero = get(s, e.source);
      if (
        u &&
        !u.blanked &&
        hero &&
        isHero(hero) &&
        ownerOf(s, u) === ownerOf(s, hero) &&
        hero.resources > 0
      ) {
        hero.resources--;
        u.resources++;
      }
      break;
    }
    case "stormcallerSwiftEngage":
      if (u && !u.blanked && s.staging.some((a) => a.id === u.id))
        forOwner(s, e.player ?? firstPlayer(s), () => engage(s, u));
      break;
    case "stormcallerSkiff":
      if (u)
        choose(s, "Corsair Skiff · Boarding", [
          {
            id: "threat",
            label: "Raise your threat by 3",
            effects: [fx("stormcallerThreat", { value: 3, player: e.player })],
          },
          {
            id: "board",
            label: "Corsair Skiff gains Boarding 1",
            effects: [fx("voyageBoard", { source: u.id, player: e.player })],
          },
        ]);
      break;
    case "stormcallerOverboard": {
      const player = e.player ?? activeSeat(s),
        chars = own(s, player).filter((a) => a.committed),
        will = chars.reduce((n, a) => n + stats(s, a).will, 0);
      if ((e.flag || will >= 8) && chars.length)
        choose(
          s,
          `${seatName(s, player)} · Man Overboard!`,
          chars.map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard questing ${name(a)}`,
            effects: [
              fx("stormcallerDiscardCharacter", { target: a.id, player }),
            ],
          })),
        );
      break;
    }
    case "stormcallerDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "stormcallerTransfer": {
      const amount = e.flag ? 2 : Math.min(e.value ?? 2, s.progress);
      if (e.flag && s.progress < 2) break;
      s.progress -= amount;
      q.enemyProgress += amount;
      prepend(s, fx("stormcallerEnemyAdvance"));
      break;
    }
    case "stormcallerCoveResponse":
      choose(s, "Hidden Cove · Heal the fleet", [
        {
          id: "heal",
          label: "Heal 4 damage from every Ship objective",
          effects: [fx("stormcallerCoveHeal")],
        },
        { id: "pass", label: "Pass", effects: [] },
      ]);
      break;
    case "stormcallerCoveHeal":
      for (const a of ships(s)) a.damage = Math.max(0, a.damage - 4);
      break;
    case "stormcallerEnemyRound": {
      if (!q.initialized) break;
      const target = get(s, q.stormcallerId);
      if (!target) break;
      const code = s.encounterDeck.shift();
      if (code) s.encounterDiscard.push(code);
      const escort = stormcallerArea(s)
        .filter((a) => a.code === V.escort && !a.blanked)
        .reduce((n, a) => n + threatOf(s, a), 0);
      const progress =
        threatOf(s, target) + (code ? (card(code).threat ?? 0) : 0) + escort;
      q.enemyProgress += progress;
      log(
        s,
        `The Stormcaller places ${progress} progress on ${card(q.enemyQuest).name}${code ? ` after discarding ${card(code).name}` : ""}.`,
        "danger",
      );
      prepend(s, fx("stormcallerEnemyAdvance"));
      break;
    }
    case "stormcallerEnemyAdvance": {
      if (q.enemyProgress < (card(q.enemyQuest).back_quest ?? Infinity)) break;
      if (q.enemyStage === 4) {
        s.status = "lost";
        s.reason =
          "The Stormcaller escapes around the Cape of Andrast with the stolen key.";
        s.choice = null;
        s.queue = [];
        log(s, s.reason, "danger");
        break;
      }
      q.enemyCompletedQuests.push(q.enemyQuest);
      q.enemyQuest = q.enemyQuestDeck.shift()!;
      q.enemyStage++;
      q.enemyProgress = 0;
      const target = get(s, q.stormcallerId);
      if (target && !target.blanked) {
        s.staging = s.staging.filter((a) => a.id !== target.id);
        for (const player of playerOrder(s))
          forOwner(s, player, () => {
            s.engaged = s.engaged.filter((a) => a.id !== target.id);
          });
        addArea(s, target);
      }
      stormcallerSyncArea(s);
      log(
        s,
        `The Stormcaller advances to stage ${q.enemyStage} · ${card(q.enemyQuest).name}.`,
        "danger",
      );
      const triggered: Effect[] = allEngaged(s)
        .filter((a) => a.code === V.blade && !a.blanked)
        .map((a) =>
          fx("immediateAttack", {
            target: a.id,
            player: ownerOf(s, a),
            code: a.code,
            text: `Serpent's Blade · attack ${seatName(s, ownerOf(s, a))}`,
          }),
        );
      if (q.enemyStage === 3)
        triggered.push(
          fx("stormcallerEnemyReveal", {
            code: q.enemyQuest,
            text: "The Weather Turns Foul · Search for Sahír's Escort",
            player: firstPlayer(s),
          }),
        );
      order(
        s,
        triggered,
        "Choose the next effect after the Stormcaller advances",
      );
      break;
    }
    case "stormcallerEnemyReveal": {
      const opts = search(s, (c) => c === V.escort).map((o) => ({
        ...o,
        effects: o.effects.map((effect) => ({ ...effect, flag: true })),
      }));
      if (opts.length)
        choose(
          s,
          "The Weather Turns Foul · Search for Sahír's Escort",
          opts.map((o) => ({
            ...o,
            effects: [...o.effects, fx("stormcallerShuffle")],
          })),
        );
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "stormcallerCapeWeather": {
      let code: string | undefined;
      let reshuffled = false;
      for (;;) {
        if (!s.encounterDeck.length) {
          if (
            !reshuffled &&
            ["quest", "staging"].includes(s.phase) &&
            s.encounterDiscard.length
          ) {
            s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
            reshuffled = true;
          } else break;
        }
        const next = s.encounterDeck.shift()!;
        s.encounterDiscard.push(next);
        if (
          card(next).type_code === "treachery" &&
          (card(next).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Weather")
        ) {
          code = next;
          break;
        }
      }
      if (code === V.squall) {
        const index = s.encounterDiscard.lastIndexOf(code);
        if (index >= 0) s.encounterDiscard.splice(index, 1);
      }
      if (code && !stormcallerEncounter(s, code, true))
        voyageEncounter(s, code, true);
      break;
    }
    case "stormcallerSetupDone":
      for (const code of Array(
        s.easyMode ? 1 : playerOrder(s).length >= 3 ? 2 : 1,
      ).fill(V.rolling)) {
        const unit = make(s, code);
        s.staging.push(unit);
        if (shipEnemy(unit)) enemyAddedToStaging(s, unit);
      }
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    case "stormcallerThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "stormcallerAdvance": {
      if (s.stage === 4 || s.stage === q.enemyStage) {
        win(s);
        s.reason =
          "The fleet catches the Stormcaller and recovers the stolen key.";
        q.advancing = false;
        break;
      }
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("stormcallerStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      stormcallerSyncArea(s);
      break;
    }
    case "stormcallerStageReveal":
      if (q.currentQuest === V.full) {
        const opts = search(s, (c) => c === V.swift);
        if (opts.length)
          choose(
            s,
            "Full Sail Ahead! · Search for Swift Raider",
            opts.map((o) => ({
              ...o,
              effects: [...o.effects, fx("stormcallerShuffle")],
            })),
          );
        else shuffle(s, s.encounterDeck);
      } else if (q.currentQuest === V.cape)
        prepend(s, fx("stormcallerCapeWeather"));
      break;
    case "stormcallerSearchTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value === undefined || pile[e.value] !== e.code) break;
      const unit = make(s, pile.splice(e.value, 1)[0]);
      if (e.flag) {
        addArea(s, unit);
        if (s.staging.some((a) => a.id === unit.id) && shipEnemy(unit))
          enemyAddedToStaging(s, unit);
      } else {
        s.staging.push(unit);
        if (shipEnemy(unit)) enemyAddedToStaging(s, unit);
      }
      log(
        s,
        `${name(unit)} is added to ${e.flag ? "the Stormcaller’s area" : "the staging area"}.`,
      );
      break;
    }
    case "stormcallerShuffle":
      shuffle(s, s.encounterDeck);
      break;
  }
  return true;
}

const GLOBAL_EFFECTS = new Set([
  "stormcallerSetupDone",
  "stormcallerAdvance",
  "stormcallerStageReveal",
  "stormcallerSearchTake",
  "stormcallerShuffle",
  "stormcallerCapeWeather",
  "stormcallerEnemyRound",
  "stormcallerEnemyAdvance",
  "stormcallerEnemyReveal",
  "stormcallerTransfer",
  "stormcallerCoveResponse",
  "stormcallerCoveHeal",
  "stormcallerReefProgress",
  "stormcallerAreaExplore",
  "stormcallerWeatherShipDamage",
]);
/** These continuations belong to the shared scenario, even if the first player's seat was just eliminated. */
export const stormcallerSharedEffect = (e: Effect) =>
  GLOBAL_EFFECTS.has(e.kind);
