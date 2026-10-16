import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  allyEntryResponses,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import {
  CROSSINGS_POROS as P,
  CROSSINGS_POROS_MAIN_QUESTS,
  CROSSINGS_POROS_RECIPES,
  CROSSINGS_POROS_SETS,
  CROSSINGS_POROS_STAGE_TWO,
  CROSSINGS_POROS_STAGE_THREE,
  crossingsPorosSet,
  crossingsPorosStageInfo,
} from "./crossings-poros-support";
export * from "./crossings-poros-support";
const live = (s: GameState) => !!s.crossingsPoros;
const stageLive = (s: GameState, code: string) =>
  live(s) &&
  s.crossingsPoros!.currentQuest === code &&
  !mainQuestUnit(s)?.blanked;
const sideLive = (s: GameState, code: string) =>
  live(s) && s.staging.some((u) => u.code === code && !u.blanked);
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const championQuest = (s: GameState, enemy: Unit) => {
  const entry = s.crossingsPoros?.champions.find((c) => c.enemyId === enemy.id);
  return entry
    ? s.staging.find((q) => q.id === entry.questId && !q.blanked)
    : undefined;
};
const championInPlay = (s: GameState) =>
  enemies(s).some((u) => !!championQuest(s, u));
type PorosCombat = NonNullable<GameState["combat"]> & {
  porosKilled?: number;
  porosDangerShadows?: number;
  porosThreatShadows?: number;
  porosPoisonShadow?: boolean;
};
export function setupCrossingsPoros(s: GameState) {
  const recipe = CROSSINGS_POROS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.staging.push(...pile("sharedStagingArea").map((code) => make(s, code)));
  s.crossingsPoros = {
    initialized: false,
    advancing: false,
    currentQuest: P.flight,
    questDeck: CROSSINGS_POROS_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAsideQuests: [],
    removedQuests: [],
    setAside: pile("sharedSetAside").map((code) => make(s, code)),
    removed: [],
    champions: [],
    poisoned: [],
    garrisonEntered: false,
  };
}
export function crossingsPorosOpeningHandsKept(s: GameState) {
  const q = s.crossingsPoros;
  if (!q || q.initialized) return false;
  prepend(
    s,
    ...playerOrder(s)
      .slice(1)
      .map((player) => fx("reveal", { player })),
    fx("crossingsPorosSetupDone"),
    fx("nextRound"),
  );
  return true;
}
export function crossingsPorosCheck(s: GameState) {
  const q = s.crossingsPoros;
  if (!q || s.status !== "playing") return;
  q.champions = q.champions.filter((c) =>
    s.staging.some((u) => u.id === c.questId),
  );
  if (q.garrisonEntered && !allCharacters(s).some((u) => u.code === P.garrison))
    loseGarrison(s);
}
function loseGarrison(s: GameState) {
  s.status = "lost";
  s.reason = "Poros Garrison has left play. The crossings fall to the enemy.";
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  log(s, s.reason, "danger");
}
export function crossingsPorosAdvance(s: GameState) {
  const q = s.crossingsPoros;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing" ||
    s.stage === 1 ||
    s.stage === 4
  )
    return true;
  if (
    s.progress < (crossingsPorosStageInfo(s)?.quest ?? Infinity) ||
    championInPlay(s)
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  q.advancing = true;
  prepend(s, fx("crossingsPorosAdvance", { player: firstPlayer(s) }));
  return true;
}
export function crossingsPorosPlanningEnd(s: GameState) {
  if (!stageLive(s, P.flight) || s.crossingsPoros!.advancing) return;
  s.crossingsPoros!.advancing = true;
  prepend(s, fx("crossingsPorosAdvance", { player: firstPlayer(s) }));
}
export function crossingsPorosCombatEnd(s: GameState) {
  if (
    !stageLive(s, P.battle) ||
    s.progress < 20 ||
    championInPlay(s) ||
    s.status !== "playing"
  )
    return;
  if (questDefeated(s, P.battle)) return;
  win(s);
  s.reason =
    "The attack on the Crossings of Poros is repelled. The refugees cross safely into Gondor.";
}
export function crossingsPorosStats(s: GameState, u: Unit) {
  const boss = live(s) && u.code === P.serpent && !u.blanked ? s.stage : 0,
    champion = championQuest(s, u) ? 2 : 0;
  return {
    attack: boss + champion,
    defense: boss + champion,
    health: 0,
    will: 0,
  };
}
export function crossingsPorosThreatBonus(s: GameState, u: Unit) {
  if (!live(s)) return 0;
  return (
    (championQuest(s, u) ? 2 : 0) +
    (u.blanked
      ? 0
      : u.code === P.serpent
        ? s.stage
        : u.code === P.land
          ? Math.max(0, ...playerOrder(s).map((p) => own(s, p).length))
          : u.code === P.vale &&
              playerOrder(s).some((p) => seatView(s, p).threat >= 35)
            ? 3
            : 0)
  );
}
export const crossingsPorosEngagementBonus = (s: GameState, u: Unit) =>
  stageLive(s, P.pursuit) &&
  s.staging.some((e) => e.id === u.id) &&
  card(u.code).type_code === "enemy"
    ? -10
    : 0;
export const crossingsPorosCannotLeave = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === P.serpent &&
  !u.blanked &&
  s.staging.some((e) => e.id === u.id);
export const crossingsPorosCannotOptionallyEngage = crossingsPorosCannotLeave;
export const crossingsPorosImmune = (s: GameState, u: Unit) =>
  live(s) && ((u.code === P.garrison && !u.blanked) || !!championQuest(s, u));
export function crossingsPorosDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (!live(s)) return amount;
  const q = championQuest(s, u);
  return (u.code === P.serpent && !u.blanked) ||
    (stageLive(s, P.creatures) &&
      s.staging.some((e) => e.id === u.id) &&
      card(u.code).type_code === "enemy") ||
    (q && q.progress < 4)
    ? 0
    : amount;
}
export const crossingsPorosCannotDefend = (s: GameState, u: Unit) =>
  live(s) && u.code === P.viper && !u.blanked;
export const crossingsPorosCannotReady = (s: GameState, u: Unit) =>
  !!s.crossingsPoros?.poisoned.some(
    (p) => p.id === u.id && p.round === s.round,
  );
export const crossingsPorosCannotPlayerReady = (s: GameState) =>
  sideLive(s, P.water);
export const crossingsPorosCannotReduceThreat = (s: GameState) =>
  sideLive(s, P.wayDown);
export const crossingsPorosCannotCancel = (s: GameState, shadow = false) =>
  !shadow && sideLive(s, P.foothills);
export const crossingsPorosCharacterBlanked = (s: GameState, u: Unit) =>
  u.damage > 0 && (isHero(u) || isAlly(u)) && sideLive(s, P.remedy);
export const crossingsPorosLocationProgressBlocked = (s: GameState, u: Unit) =>
  u.code !== P.dunes &&
  card(u.code).type_code === "location" &&
  s.staging.some((e) => e.id === u.id) &&
  sideLive(s, P.dunes);
export const crossingsPorosSideDefeatBlocked = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === P.champion &&
  !u.blanked &&
  s.crossingsPoros!.champions.some(
    (c) => c.questId === u.id && enemies(s).some((e) => e.id === c.enemyId),
  );
export const crossingsPorosExtraOptionalEngagements = (
  s: GameState,
  player: number,
) =>
  live(s) && own(s, player).some((u) => u.code === P.garrison && !u.blanked)
    ? 1
    : 0;
export function crossingsPorosAllyEntered(
  s: GameState,
  u: Unit,
  played = false,
  fromHand = false,
) {
  if (!live(s) || !isAlly(u)) return false;
  if (stageLive(s, P.flight)) {
    u.exhausted = true;
    return false;
  }
  if (!played || !(stageLive(s, P.desert) || stageLive(s, P.mountains)))
    return false;
  prepend(
    s,
    fx("crossingsPorosAlly", { target: u.id, player: ownerOf(s, u) }),
    fx("crossingsPorosAllyResponses", {
      target: u.id,
      flag: played,
      value: fromHand ? 1 : 0,
      player: ownerOf(s, u),
    }),
  );
  return true;
}
export function crossingsPorosEngaged(s: GameState, u: Unit) {
  if (!live(s)) return;
  const player = ownerOf(s, u);
  if (stageLive(s, P.creatures))
    prepend(s, fx("crossingsPorosDamageHero", { player }));
  if (stageLive(s, P.pursuit)) s.progress = Math.max(0, s.progress - 1);
  if (stageLive(s, P.orcs)) prepend(s, fx("threat", { value: 1, player }));
  if (u.code === P.outrider && !u.blanked)
    prepend(s, fx("crossingsPorosOutrider", { target: u.id, player }));
}
export function crossingsPorosEncounterEnd(s: GameState): Effect[] {
  return live(s)
    ? enemies(s)
        .filter((u) => u.code === P.serpent && !u.blanked)
        .map((u) =>
          fx("crossingsPorosSerpent", { target: u.id, player: firstPlayer(s) }),
        )
    : [];
}
export function crossingsPorosTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel = true,
) {
  if (!live(s)) return;
  const effects: Effect[] = [];
  if (!u.blanked) {
    if (u.code === P.land)
      effects.push(
        fx("crossingsPorosAside", { flag: true, player: firstPlayer(s) }),
      );
    if (u.code === P.waste)
      effects.push(
        fx("crossingsPorosAside", { flag: false, player: firstPlayer(s) }),
        fx("crossingsPorosShuffle"),
      );
    if (u.code === P.foothills)
      effects.push(
        ...playerOrder(s).map((player) => fx("threat", { value: 2, player })),
      );
    if ([P.vale, P.dunes].includes(u.code))
      effects.push(fx("reveal", { player: firstPlayer(s) }));
    if (u.code === P.oasis)
      effects.push(
        ...playerOrder(s).map((player) =>
          fx("desertExhaust", { player, text: "Desert Oasis" }),
        ),
      );
  }
  if (actualTravel)
    effects.push(
      ...enemies(s)
        .filter(
          (e) =>
            e.code === P.viper &&
            !e.blanked &&
            (!allEngaged(s).some((x) => x.id === e.id) ||
              ownerOf(s, e) !== firstPlayer(s)),
        )
        .map((e) =>
          fx("crossingsPorosViper", { target: e.id, player: firstPlayer(s) }),
        ),
    );
  prepend(s, ...effects);
}
export function crossingsPorosExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  if (live(s) && wasActive && u.code === P.oasis && !u.blanked)
    prepend(s, fx("desertOasisResponse", { player: firstPlayer(s) }));
}
export function crossingsPorosSideDefeated(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return;
  if (u.code === P.wayDown)
    choose(s, "Find a Way Down · Reduce each player's threat by 3?", [
      {
        id: "use",
        label: "Reduce each player's threat by 3",
        effects: playerOrder(s).map((player) =>
          fx("threat", { value: -3, player }),
        ),
      },
      { id: "skip", label: "Decline response", effects: [] },
    ]);
  if (u.code === P.water)
    prepend(s, fx("desertWaterResponse", { player: firstPlayer(s) }));
  if (u.code === P.remedy)
    prepend(s, fx("desertRemedyResponse", { player: firstPlayer(s) }));
}
export function crossingsPorosCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  if (!live(s) || !fromReveal || cancelled) return false;
  if ([P.prowler, P.warg].includes(u.code))
    prepend(
      s,
      fx("crossingsPorosEnemyReveal", { target: u.id, player: firstPlayer(s) }),
    );
  return false;
}
export function crossingsPorosEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!live(s)) return false;
  if (
    ![P.danger, P.shadow, P.sandstorm, P.exhaustion, P.champion].includes(code)
  )
    return false;
  if (!fromReveal) {
    if (!replay && card(code).type_code === "treachery")
      s.encounterDiscard.push(code);
    return true;
  }
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  const target =
    code === P.champion
      ? [...s.staging].reverse().find((u) => u.code === code)?.id
      : undefined;
  prepend(
    s,
    fx(
      code === P.danger
        ? "crossingsPorosAside"
        : code === P.shadow
          ? "crossingsPorosMountains"
          : code === P.sandstorm
            ? "desertSandstormAll"
            : code === P.exhaustion
              ? "desertExhaustAll"
              : "crossingsPorosChampion",
      { target, flag: code === P.danger, player: firstPlayer(s) },
    ),
  );
  return true;
}
export function crossingsPorosShadow(s: GameState, code: string) {
  const c = s.combat as PorosCombat | null;
  if (!live(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === P.outrider)
    prepend(s, fx("desertExhaust", { player, text: "Southron Outrider" }));
  else if (code === P.prowler)
    forOwner(s, player, () => {
      const u = shuffle(s, [...s.hand])[0];
      if (u) discardHandCard(s, u.id);
    });
  else if (code === P.warg) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === P.waste) c.returnToStaging = true;
  else if (code === P.danger)
    c.porosDangerShadows = (c.porosDangerShadows ?? 0) + 1;
  else if (code === P.shadow) {
    c.attackBonus++;
    c.porosThreatShadows = (c.porosThreatShadows ?? 0) + 1;
  } else if (code === P.exhaustion)
    prepend(s, fx("desertExhaust", { player, text: "Heat Exhaustion" }));
  else if (code === P.sandstorm)
    prepend(s, fx("desertSandstormShadow", { player }));
  else if (code === P.scorpion) c.porosPoisonShadow = true;
  else return false;
  return true;
}
export function crossingsPorosDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (
    !s.crossingsPoros ||
    amount <= 0 ||
    !context.enemyId ||
    !(isAlly(u) || isHero(u))
  )
    return;
  const enemy = get(s, context.enemyId),
    c = s.combat as PorosCombat | null;
  const poison = (u: Unit) => {
    const q = s.crossingsPoros!;
    q.poisoned = q.poisoned.filter((p) => p.id !== u.id);
    q.poisoned.push({ id: u.id, round: s.round });
  };
  if (enemy?.code === P.scorpion && !enemy.blanked) poison(u);
  if (
    context.combatDamage &&
    c?.enemyId === context.enemyId &&
    c.porosPoisonShadow
  )
    for (const id of c.defenderIds?.length
      ? c.defenderIds
      : c.defenderId
        ? [c.defenderId]
        : []) {
      const d = get(s, id);
      if (d) poison(d);
    }
}
export function crossingsPorosCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    live(s) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    (isHero(u) || isAlly(u))
  )
    (s.combat as PorosCombat).porosKilled =
      ((s.combat as PorosCombat).porosKilled ?? 0) + 1;
}
export function crossingsPorosCharacterLeft(
  s: GameState,
  u: Unit,
  _controller?: number,
) {
  if (live(s) && u.code === P.garrison) loseGarrison(s);
}
export function crossingsPorosAttackFinished(
  s: GameState,
  completed: NonNullable<GameState["combat"]>,
): Effect[] {
  const c = completed as PorosCombat;
  if (!live(s) || !c.porosKilled) return [];
  const effects: Effect[] = [];
  if (stageLive(s, P.battle)) {
    const e = get(s, c.enemyId);
    if (e)
      effects.push(
        fx("crossingsPorosRemoveProgress", {
          value: (card(e.code).threat ?? 0) * c.porosKilled,
        }),
      );
  }
  effects.push(
    ...Array.from({ length: c.porosDangerShadows ?? 0 }, () =>
      fx("crossingsPorosAside", { flag: true, player: firstPlayer(s) }),
    ),
  );
  if (c.porosThreatShadows)
    effects.push(
      fx("threat", {
        value: 2 * c.porosThreatShadows,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  return effects;
}
function setAside(s: GameState, set: string, enemyOnly = false) {
  return s.crossingsPoros!.setAside.filter(
    (u) =>
      crossingsPorosSet(u.code) === set &&
      (!enemyOnly || card(u.code).type_code === "enemy"),
  );
}
function randomAside(s: GameState, set: string, enemyOnly = false) {
  const q = s.crossingsPoros!,
    u = shuffle(s, setAside(s, set, enemyOnly))[0];
  if (u) q.setAside = q.setAside.filter((c) => c.id !== u.id);
  return u;
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function addEnemy(s: GameState, u: Unit) {
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function incorporate(s: GameState, set: string) {
  const q = s.crossingsPoros!,
    take = setAside(s, set);
  q.setAside = q.setAside.filter((u) => !take.includes(u));
  s.encounterDeck.push(...take.map((u) => u.code));
}
function removeSet(s: GameState, set: string) {
  const q = s.crossingsPoros!,
    take = setAside(s, set);
  q.setAside = q.setAside.filter((u) => !take.includes(u));
  q.removed.push(...take);
}
export const crossingsPorosSharedEffect = (e: Effect) =>
  e.kind.startsWith("crossingsPoros") &&
  ![
    "crossingsPorosAlly",
    "crossingsPorosDamageHero",
    "crossingsPorosOutrider",
  ].includes(e.kind);
export function crossingsPorosEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("crossingsPoros")) return false;
  const q = s.crossingsPoros;
  if (!q) return true;
  const player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "crossingsPorosSetupDone":
      q.initialized = true;
      break;
    case "crossingsPorosAdvance": {
      if (s.stage >= 4) break;
      q.completedQuests.push(q.currentQuest);
      const pool =
        s.stage === 1
          ? CROSSINGS_POROS_STAGE_TWO
          : s.stage === 2
            ? CROSSINGS_POROS_STAGE_THREE
            : [P.battle];
      const next = shuffle(s, [...pool])[0];
      q.currentQuest = next;
      q.questDeck = q.questDeck.filter((c) => c !== next);
      s.stage++;
      s.progress = 0;
      s.stageRevealing = true;
      if (s.stage === 2) {
        const other = CROSSINGS_POROS_STAGE_TWO.filter((c) => c !== next);
        q.removedQuests.push(...other);
        q.questDeck = q.questDeck.filter((c) => !other.includes(c));
        incorporate(
          s,
          next === P.desert ? "Desert Sands" : "Mountains of Shadow",
        );
        removeSet(
          s,
          next === P.desert ? "Mountains of Shadow" : "Desert Sands",
        );
        shuffle(s, s.encounterDeck);
      }
      if (s.stage === 3) {
        q.setAsideQuests = CROSSINGS_POROS_STAGE_THREE.filter(
          (c) => c !== next,
        );
        q.questDeck = q.questDeck.filter((c) => !q.setAsideQuests.includes(c));
        incorporate(
          s,
          next === P.creatures
            ? "Desert Creatures"
            : next === P.pursuit
              ? "Harad Soldiers"
              : "Mordor Orcs",
        );
        shuffleDiscard(s);
      }
      if (s.stage === 4) {
        const i = q.setAside.findIndex((u) => u.code === P.garrison);
        if (i >= 0) {
          const g = q.setAside.splice(i, 1)[0];
          g.owner = firstPlayer(s);
          forOwner(s, firstPlayer(s), () => s.allies.push(g));
          q.garrisonEntered = true;
        }
        const sets: string[] = q.setAsideQuests.map((c) =>
          c === P.creatures
            ? "Desert Creatures"
            : c === P.pursuit
              ? "Harad Soldiers"
              : "Mordor Orcs",
        );
        for (const pile of [s.encounterDeck, s.encounterDiscard])
          for (let i = pile.length - 1; i >= 0; i--)
            if (
              card(pile[i]).type_code === "enemy" &&
              sets.includes(crossingsPorosSet(pile[i]) ?? "")
            )
              addEnemy(s, make(s, pile.splice(i, 1)[0]));
        shuffle(s, s.encounterDeck);
      }
      log(s, `${card(next).name} · Stage ${s.stage}`, "chapter");
      prepend(
        s,
        ...(s.stage === 3
          ? playerOrder(s).map((player) => fx("reveal", { player }))
          : []),
        fx("crossingsPorosStageReady"),
      );
      break;
    }
    case "crossingsPorosStageReady":
      q.advancing = false;
      s.stageRevealing = false;
      break;
    case "crossingsPorosAllyResponses":
      if (u) allyEntryResponses(s, u, !!e.flag, !!e.value, false, false, true);
      break;
    case "crossingsPorosAlly":
      if (u)
        choose(
          s,
          `${card(q.currentQuest).name} · Exhaust the ally or ${q.currentQuest === P.desert ? "deal it 1 damage" : "raise your threat by 1"}`,
          [
            ...(!u.exhausted
              ? [
                  {
                    id: "exhaust",
                    label: `Exhaust ${name(u)}`,
                    effects: [fx("exhaust", { target: u.id, player })],
                  },
                ]
              : []),
            {
              id: "penalty",
              label:
                q.currentQuest === P.desert
                  ? "Deal 1 damage to the ally"
                  : "Raise your threat by 1",
              effects: [
                q.currentQuest === P.desert
                  ? fx("damage", { target: u.id, value: 1, player })
                  : fx("threat", { value: 1, player }),
              ],
            },
          ],
        );
      break;
    case "crossingsPorosDamageHero":
      choose(
        s,
        "Deadly Creatures · Deal 1 damage to a hero",
        own(s, player)
          .filter(isHero)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("damage", { target: h.id, value: 1, player })],
          })),
      );
      break;
    case "crossingsPorosOutrider":
      if (u && !u.blanked)
        choose(s, "Southron Outrider · Choose a pursuit cost", [
          ...(setAside(s, "Harad Soldiers", true).length
            ? [
                {
                  id: "discard",
                  label: "Discard a random set aside Harad Soldier enemy",
                  effects: [
                    fx("crossingsPorosDiscardEnemy", {
                      text: "Harad Soldiers",
                      player,
                    }),
                  ],
                },
              ]
            : []),
          {
            id: "attack",
            label: "Southron Outrider gets +3 attack this round",
            effects: [fx("crossingsPorosBoost", { target: u.id, value: 3 })],
          },
        ]);
      break;
    case "crossingsPorosBoost":
      if (u) u.roundAttack = (u.roundAttack ?? 0) + (e.value ?? 0);
      break;
    case "crossingsPorosSerpent":
      if (u && !u.blanked)
        choose(s, "The Black Serpent · Remove progress or suffer an attack", [
          ...(s.progress >= s.stage
            ? [
                {
                  id: "progress",
                  label: `Remove ${s.stage} progress from the main quest`,
                  effects: [
                    fx("crossingsPorosRemoveProgress", { value: s.stage }),
                  ],
                },
              ]
            : []),
          {
            id: "attack",
            label: "The Black Serpent attacks the first player",
            effects: [
              fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
            ],
          },
        ]);
      break;
    case "crossingsPorosRemoveProgress":
      s.progress = Math.max(0, s.progress - (e.value ?? 0));
      break;
    case "crossingsPorosEnemyReveal":
      if (u) {
        const set = u.code === P.warg ? "Desert Creatures" : "Mordor Orcs";
        choose(s, `${name(u)} · Choose a pursuit cost`, [
          ...(setAside(s, set, true).length
            ? [
                {
                  id: "discard",
                  label: `Discard a random set aside ${set} enemy`,
                  effects: [
                    fx("crossingsPorosDiscardEnemy", { text: set, player }),
                  ],
                },
              ]
            : []),
          {
            id: u.code === P.warg ? "surge" : "attack",
            label:
              u.code === P.warg
                ? "Desert Warg gains surge"
                : "Uruk Prowler attacks the first player",
            effects: [
              u.code === P.warg
                ? fx("reveal", { player })
                : fx("immediateAttack", {
                    target: u.id,
                    player: firstPlayer(s),
                  }),
            ],
          },
        ]);
      }
      break;
    case "crossingsPorosDiscardEnemy": {
      const enemy = randomAside(s, e.text!, true);
      if (enemy) s.encounterDiscard.push(enemy.code);
      break;
    }
    case "crossingsPorosAside": {
      const sizes = CROSSINGS_POROS_SETS.map((set) => ({
          set,
          count: setAside(s, set).length,
        })),
        max = Math.max(...sizes.map((x) => x.count));
      if (!max) break;
      const options = sizes
        .filter((x) => x.count === max)
        .map(({ set, count }) => ({
          id: set,
          label: `${set} · ${count} cards remaining`,
          effects: [
            fx("crossingsPorosAsideTake", { text: set, flag: e.flag, player }),
          ],
        }));
      if (options.length === 1) prepend(s, ...options[0].effects);
      else choose(s, "Choose the largest set aside encounter set", options);
      break;
    }
    case "crossingsPorosAsideTake": {
      const held = randomAside(s, e.text!);
      if (held) {
        if (e.flag) {
          s.encounterDeck.unshift(held.code);
          prepend(s, fx("reveal", { player }));
        } else s.encounterDiscard.push(held.code);
      }
      break;
    }
    case "crossingsPorosShuffle":
      shuffleDiscard(s);
      break;
    case "crossingsPorosMountains":
      if (s.activeLocation)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("threat", {
              value: card(s.activeLocation!.code).quest ?? 0,
              player,
            }),
          ),
        );
      else prepend(s, fx("reveal", { player }));
      break;
    case "crossingsPorosChampion":
      if (u) {
        while (s.encounterDeck.length) {
          const code = s.encounterDeck.shift()!;
          if (
            card(code).type_code === "enemy" &&
            (card(code).traits ?? "")
              .split(".")
              .some((t) => t.trim() === "Harad")
          ) {
            const enemy = make(s, code);
            enemy.resources++;
            q.champions.push({ questId: u.id, enemyId: enemy.id });
            addEnemy(s, enemy);
            break;
          }
          s.encounterDiscard.push(code);
        }
      }
      break;
    case "crossingsPorosViper":
      if (u) forOwner(s, player, () => engage(s, u));
      break;
    default:
      return false;
  }
  return true;
}

import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
export const CROSSINGS_POROS_HOOKS: Batch4ScenarioHooks = {
  setup: setupCrossingsPoros,
  openingHandsKept: crossingsPorosOpeningHandsKept,
  check: crossingsPorosCheck,
  advance: crossingsPorosAdvance,
  stageInfo: crossingsPorosStageInfo,
  stats: crossingsPorosStats,
  threatBonus: crossingsPorosThreatBonus,
  engagementBonus: crossingsPorosEngagementBonus,
  locationProgressBlocked: crossingsPorosLocationProgressBlocked,
  sideDefeatBlocked: crossingsPorosSideDefeatBlocked,
  sideDefeated: crossingsPorosSideDefeated,
  cannotReady: crossingsPorosCannotReady,
  cannotPlayerReady: crossingsPorosCannotPlayerReady,
  characterBlanked: crossingsPorosCharacterBlanked,
  immune: crossingsPorosImmune,
  cannotLeave: crossingsPorosCannotLeave,
  cannotEngage: crossingsPorosCannotLeave,
  cannotOptionallyEngage: crossingsPorosCannotOptionallyEngage,
  cannotDefend: crossingsPorosCannotDefend,
  extraOptionalEngagements: crossingsPorosExtraOptionalEngagements,
  cannotCancel: crossingsPorosCannotCancel,
  cannotReduceThreat: crossingsPorosCannotReduceThreat,
  planningEnd: crossingsPorosPlanningEnd,
  encounterEnd: crossingsPorosEncounterEnd,
  combatEnd: crossingsPorosCombatEnd,
  engaged: crossingsPorosEngaged,
  characterDestroyed: crossingsPorosCharacterDestroyed,
  characterLeft: crossingsPorosCharacterLeft,
  damageAmount: crossingsPorosDamageAmount,
  damageDealt: crossingsPorosDamageDealt,
  explored: crossingsPorosExplored,
  travelEntered: crossingsPorosTravelEntered,
  allyEntered: crossingsPorosAllyEntered,
  attackFinished: crossingsPorosAttackFinished,
  cardEntered: crossingsPorosCardEntered,
  encounter: crossingsPorosEncounter,
  shadow: crossingsPorosShadow,
  effect: crossingsPorosEffect,
  sharedEffect: crossingsPorosSharedEffect,
};
