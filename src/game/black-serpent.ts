import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  requireRule,
  shuffle,
} from "./core";
import { mainQuestUnit } from "./quest-state";
import {
  allyEntryResponses,
  enemyAddedToStaging,
  engage,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import {
  BLACK_SERPENT as B,
  BLACK_SERPENT_MAIN_QUESTS,
  BLACK_SERPENT_OBJECTIVES,
  BLACK_SERPENT_RECIPES,
  blackSerpentControlledObjectives,
  blackSerpentIsObjective,
  blackSerpentObjectives,
} from "./black-serpent-support";
export * from "./black-serpent-support";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const live = (s: GameState) => !!s.blackSerpent;
const stageLive = (s: GameState, stage: number) =>
  live(s) && s.stage === stage && !mainQuestUnit(s)?.blanked;
const sideLive = (s: GameState, code: string) =>
  live(s) && s.staging.some((u) => u.code === code && !u.blanked);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const harad = (u: Unit) =>
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Harad");
const championQuest = (s: GameState, u: Unit) => {
  const marker = s.blackSerpent?.champions.find((c) => c.enemyId === u.id);
  return marker
    ? s.staging.find((q) => q.id === marker.questId && !q.blanked)
    : undefined;
};
const bossLocked = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === B.serpent &&
  !u.blanked &&
  !(stageLive(s, 3) && s.progress >= 6);
const encounterHeld = (s: GameState, code: string) =>
  blackSerpentObjectives(s).some(
    ({ host, attachment }) =>
      attachment.code === code &&
      !attachment.blanked &&
      card(host.code).sphere_code === "encounter",
  );
const modifier = (s: GameState, kind: "banner" | "garb", target: string) =>
  s.blackSerpent?.modifiers.filter(
    (e) =>
      e.kind === kind &&
      e.target === target &&
      e.round === s.round &&
      e.phase === s.phase,
  ).length ?? 0;
type SerpentCombat = NonNullable<GameState["combat"]> & {
  blackSerpentKilled?: number;
  blackSerpentQuarter?: number;
  blackSerpentChaos?: boolean;
};

export function setupBlackSerpent(s: GameState) {
  const recipe = BLACK_SERPENT_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.staging.push(make(s, B.serpent));
  s.blackSerpent = {
    initialized: false,
    advancing: false,
    currentQuest: B.fort,
    questDeck: BLACK_SERPENT_MAIN_QUESTS.slice(1),
    completedQuests: [],
    setAside: BLACK_SERPENT_OBJECTIVES.map((c) => make(s, c)),
    champions: [],
    shields: [],
    shieldPlayers: [],
    modifiers: [],
    canceledEvents: [],
  };
}
export function blackSerpentOpeningHandsKept(s: GameState) {
  if (!s.blackSerpent || s.blackSerpent.initialized) return false;
  prepend(
    s,
    fx("blackSerpentSetup", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
function addEnemy(s: GameState, u: Unit) {
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function asAttachment(u: Unit): Attachment {
  return {
    id: u.id,
    code: u.code,
    exhausted: u.exhausted,
    ...(u.blanked ? { blanked: true } : {}),
  };
}
function revealObjective(s: GameState, u: Unit) {
  s.staging.push(u);
  // Guarded(X) adds its matching card directly; it is neither revealed nor resolved.
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!,
      type = card(code).type_code;
    const match =
      u.code === B.garb
        ? type === "enemy"
        : u.code === B.summons
          ? type === "location"
          : ["enemy", "location"].includes(type);
    if (!match) {
      s.encounterDiscard.push(code);
      continue;
    }
    const host = make(s, code);
    s.staging = s.staging.filter((o) => o.id !== u.id);
    host.attachments.push(asAttachment(u));
    type === "enemy" ? addEnemy(s, host) : s.staging.push(host);
    break;
  }
}
function randomObjective(s: GameState, attachToBoss = false) {
  const q = s.blackSerpent!;
  if (!q.setAside.length) return;
  const u = q.setAside.splice(Math.floor(random(s) * q.setAside.length), 1)[0];
  const boss = enemies(s).find((e) => e.code === B.serpent);
  if (attachToBoss && boss) boss.attachments.push(asAttachment(u));
  else revealObjective(s, u);
}
function shuffledDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
export function blackSerpentCheck(s: GameState) {
  const q = s.blackSerpent;
  if (!q || s.status !== "playing") return;
  q.champions = q.champions.filter((e) =>
    s.staging.some((u) => u.id === e.questId),
  );
  if (mainQuestUnit(s)?.blanked) return;
  for (const objective of s.staging.filter(blackSerpentIsObjective)) {
    const pending = (e: Effect) =>
      e.kind === "blackSerpentClaim" && e.target === objective.id;
    if (
      !s.queue.some(pending) &&
      !s.choice?.options.some((o) => o.effects.some(pending))
    )
      prepend(
        s,
        fx("blackSerpentClaim", {
          target: objective.id,
          player: firstPlayer(s),
        }),
      );
  }
}
export function blackSerpentAdvance(s: GameState) {
  const q = s.blackSerpent;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  const goal = s.stage === 2 ? 5 : 6;
  if (
    s.progress < goal ||
    (!mainQuestUnit(s)?.blanked &&
      (s.staging.some(blackSerpentIsObjective) ||
        blackSerpentObjectives(s).some(
          ({ host }) => !allHeroes(s).some((h) => h.id === host.id),
        ) ||
        enemies(s).some((u) => !u.blanked && !!championQuest(s, u))))
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 3) {
    win(s);
    s.reason =
      "The fellowship has seized the Serpent’s banner, garb and summons for the road to Cirith Gurat.";
  } else {
    q.advancing = true;
    prepend(s, fx("blackSerpentAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function blackSerpentProgress(
  s: GameState,
  amount: number,
  quest: Unit,
) {
  if (!live(s)) return amount;
  if (s.blackSerpent!.noProgressRound === s.round) return 0;
  return quest.code === s.blackSerpent!.currentQuest && sideLive(s, B.courtyard)
    ? Math.max(0, Math.min(amount, (s.stage === 2 ? 5 : 6) - s.progress))
    : amount;
}
export function blackSerpentStats(s: GameState, u: Unit) {
  if (!live(s)) return { attack: 0, defense: 0 };
  const boss = u.code === B.serpent && !u.blanked ? s.stage : 0,
    champion = championQuest(s, u) ? 2 : 0;
  const attackPlayer =
    s.combat?.enemyId === u.id
      ? (s.combat.attackPlayer ?? activeSeat(s))
      : activeSeat(s);
  const engagedPlayer = allEngaged(s).some((e) => e.id === u.id)
    ? ownerOf(s, u)
    : blackSerpentConsideredEngaged(s, u, attackPlayer)
      ? attackPlayer
      : undefined;
  const virtualCaptain = blackSerpentConsideredEngaged(s, u, attackPlayer)
    ? allEngaged(s).filter(
        (e) =>
          e.code === B.captain && !e.blanked && ownerOf(s, e) === attackPlayer,
      ).length
    : 0;
  return {
    attack:
      boss +
      champion +
      virtualCaptain +
      (harad(u) && encounterHeld(s, B.banner) ? 1 : 0) -
      (harad(u) && engagedPlayer !== undefined
        ? modifier(s, "banner", String(engagedPlayer))
        : 0),
    defense: boss + champion,
  };
}
export function blackSerpentThreatBonus(s: GameState, u: Unit) {
  if (!live(s)) return 0;
  return (
    (u.code === B.serpent && !u.blanked ? s.stage : 0) +
    (u.code === B.bastion && !u.blanked
      ? blackSerpentControlledObjectives(s).length
      : 0) +
    (championQuest(s, u) ? 2 : 0) +
    (card(u.code).sphere_code === "encounter" &&
    u.attachments.some((a) => a.code === B.garb && !a.blanked)
      ? 2
      : 0) -
    2 * modifier(s, "garb", u.id)
  );
}
export const blackSerpentImmune = (s: GameState, u: Unit) =>
  live(s) &&
  ((!u.blanked && !!championQuest(s, u)) ||
    (card(u.code).sphere_code === "encounter" &&
      u.attachments.some((a) => a.code === B.garb && !a.blanked)));
export const blackSerpentCannotLeave = (s: GameState, u: Unit) =>
  s.staging.some((e) => e.id === u.id) && bossLocked(s, u);
export const blackSerpentCannotEngage = (s: GameState, u: Unit) =>
  s.staging.some((e) => e.id === u.id) && bossLocked(s, u);
export function blackSerpentDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (!live(s)) return amount;
  const q = s.blackSerpent!,
    quest = championQuest(s, u);
  return bossLocked(s, u) ||
    (quest && quest.progress < 4) ||
    q.shields.some((e) => e.id === u.id && e.round === s.round) ||
    (enemies(s).some((e) => e.id === u.id) &&
      allEngaged(s).some((e) => e.id === u.id) &&
      q.shieldPlayers.some(
        (e) => e.player === ownerOf(s, u) && e.round === s.round,
      ))
    ? 0
    : amount;
}
export const blackSerpentThreatReductionBlocked = (s: GameState) =>
  live(s) && encounterHeld(s, B.summons);
export const blackSerpentConsideredEngaged = (
  s: GameState,
  u: Unit,
  player = activeSeat(s),
) =>
  stageLive(s, 2) &&
  u.code === B.serpent &&
  s.staging.some((e) => e.id === u.id) &&
  blackSerpentControlledObjectives(s, player).length > 0;
export function blackSerpentAttachmentLeaves(
  s: GameState,
  _host: Unit,
  a: Attachment,
) {
  if (!live(s) || !blackSerpentIsObjective(a)) return false;
  const u = make(s, a.code);
  u.id = a.id;
  u.exhausted = a.exhausted;
  if (a.blanked) u.blanked = true;
  s.staging.push(u);
  return true;
}
export function blackSerpentEngaged(s: GameState, u: Unit) {
  if (live(s) && u.code === B.guard && !u.blanked)
    prepend(
      s,
      fx("blackSerpentGuard", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function blackSerpentEncounterEnd(s: GameState): Effect[] {
  return live(s)
    ? enemies(s)
        .filter((u) => u.code === B.serpent && !u.blanked)
        .map((u) =>
          fx("blackSerpentBossAttack", {
            target: u.id,
            player: firstPlayer(s),
          }),
        )
    : [];
}
export function blackSerpentRoundEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  return [
    ...(sideLive(s, B.camp) ? [fx("blackSerpentClearLocations")] : []),
    ...(sideLive(s, B.escape)
      ? [fx("blackSerpentRemoveProgress", { value: s.progress })]
      : []),
  ];
}
export function blackSerpentSideQuestChosen(s: GameState, u: Unit) {
  if (live(s) && u.code === B.escape && !u.blanked)
    prepend(s, fx("reveal", { player: firstPlayer(s) }));
}
export const blackSerpentSideDefeatBlocked = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === B.champion &&
  !u.blanked &&
  enemies(s).some((e) =>
    s.blackSerpent!.champions.some(
      (m) => m.questId === u.id && m.enemyId === e.id,
    ),
  );
export function blackSerpentAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (!live(s) || !played || !fromHand) return false;
  const redoubts = s.staging.filter((l) => l.code === B.redoubt && !l.blanked);
  if (!redoubts.length) return false;
  prepend(
    s,
    ...redoubts.map((l) =>
      fx("blackSerpentRedoubtAlly", {
        source: l.id,
        target: u.id,
        player: ownerOf(s, u),
      }),
    ),
    fx("blackSerpentAllyResume", {
      target: u.id,
      flag: played,
      value: fromHand ? 1 : 0,
      player: ownerOf(s, u),
    }),
  );
  return true;
}
export function blackSerpentEventPlayed(s: GameState, u: Unit) {
  if (!live(s)) return;
  prepend(
    s,
    ...s.staging
      .filter((l) => l.code === B.tower && !l.blanked)
      .map((l) =>
        fx("blackSerpentTowerEvent", {
          source: l.id,
          target: u.id,
          player: activeSeat(s),
        }),
      ),
  );
}
export function blackSerpentEventCancelled(s: GameState, id: string) {
  const q = s.blackSerpent;
  if (!q) return false;
  const canceled = q.canceledEvents.includes(id);
  q.canceledEvents = q.canceledEvents.filter((c) => c !== id);
  return canceled;
}
export function blackSerpentTravelProblem(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return null;
  if (u.code === B.tower && !allHeroes(s).some(canExhaust))
    return "Exhaust a ready hero to travel here.";
  if (
    u.code === B.redoubt &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (c) => card(c).type_code === "enemy",
    )
  )
    return "Find an enemy in the encounter deck or discard pile to travel here.";
  return null;
}
export function blackSerpentTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!live(s) || u.blanked) return undefined;
  if (u.code === B.tower)
    return [fx("blackSerpentTowerTravel", { player: firstPlayer(s) })];
  if (u.code === B.redoubt)
    return [fx("blackSerpentRedoubtTravel", { player: firstPlayer(s) })];
  if (u.code === B.camp)
    return playerOrder(s).map((player) => fx("threat", { value: 1, player }));
}
export function blackSerpentEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!live(s) || ![B.bold, B.quarter, B.chaos, B.champion].includes(code))
    return false;
  if (!fromReveal) {
    if (!replay && card(code).type_code === "treachery")
      s.encounterDiscard.push(code);
    return true;
  }
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  const target =
    code === B.champion
      ? [...s.staging].reverse().find((u) => u.code === B.champion)?.id
      : undefined;
  prepend(
    s,
    fx(
      code === B.bold
        ? "blackSerpentBold"
        : code === B.quarter
          ? "blackSerpentQuarter"
          : code === B.chaos
            ? "blackSerpentChaos"
            : "blackSerpentChampion",
      { target, player: firstPlayer(s) },
    ),
  );
  return true;
}
export function blackSerpentShadow(s: GameState, code: string) {
  const c = s.combat as SerpentCombat | null;
  if (!live(s) || !c) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  if (code === B.guard)
    prepend(s, fx("blackSerpentGuardShadow", { target: c.enemyId, player: p }));
  else if (code === B.bastion)
    c.attackBonus += blackSerpentControlledObjectives(s).length;
  else if (code === B.courtyard)
    prepend(
      s,
      fx("blackSerpentCourtyardShadow", { target: c.enemyId, player: p }),
    );
  else if (code === B.bold) {
    const enemy = get(s, c.enemyId);
    if (enemy && !card(enemy.code).is_unique)
      prepend(s, fx("blackSerpentBoldShadow", { target: enemy.id, player: p }));
  } else if (code === B.quarter)
    c.blackSerpentQuarter = (c.blackSerpentQuarter ?? 0) + 1;
  else if (code === B.chaos) {
    c.attackBonus++;
    c.blackSerpentChaos = true;
  } else return false;
  return true;
}
export function blackSerpentCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat as SerpentCombat | null;
  if (
    live(s) &&
    c &&
    context.combatDamage &&
    context.enemyId === c.enemyId &&
    (isHero(u) || isAlly(u))
  )
    c.blackSerpentKilled = (c.blackSerpentKilled ?? 0) + 1;
}
export function blackSerpentAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  const c = combat as SerpentCombat;
  if (!live(s) || skipped || !c.blackSerpentKilled) return;
  if (c.blackSerpentChaos) s.progress = 0;
  if (c.blackSerpentQuarter)
    prepend(
      s,
      ...Array.from({ length: c.blackSerpentQuarter }, () =>
        fx("blackSerpentQuarterShadow", {
          player: c.attackPlayer ?? activeSeat(s),
        }),
      ),
    );
}
export const blackSerpentSkipShadowDeal = (s: GameState, u: Unit) =>
  live(s) &&
  u.code === B.serpent &&
  stageLive(s, 2) &&
  s.staging.some((e) => e.id === u.id);
export function blackSerpentBeginShadows(s: GameState, u: Unit) {
  if (
    !live(s) ||
    u.code !== B.serpent ||
    !stageLive(s, 2) ||
    !s.staging.some((e) => e.id === u.id)
  )
    return false;
  s.encounterDiscard.push(...u.shadows);
  const c = encounterDraw(s, true);
  u.shadows = c ? [c] : [];
  u.revealedShadowCount = 0;
  delete u.faceupShadows;
  return true;
}
export function blackSerpentFinishShadows(s: GameState, u: Unit) {
  if (
    !live(s) ||
    u.code !== B.serpent ||
    s.stage !== 2 ||
    !s.staging.some((e) => e.id === u.id)
  )
    return false;
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  u.revealedShadowCount = 0;
  delete u.faceupShadows;
  return true;
}
export function blackSerpentAbilityLabel(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!live(s) || !attachmentId) return null;
  const a = u.attachments.find(
    (a) => a.id === attachmentId && blackSerpentIsObjective(a) && !a.blanked,
  );
  return a ? `Exhaust ${card(a.code).name} · Raise threat by 1` : null;
}
export function blackSerpentAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!blackSerpentAbilityLabel(s, u, attachmentId))
    return "This card has no available Harad objective action.";
  if (!s.blackSerpent!.initialized || s.phase === "setup")
    return "Finish setup before taking actions.";
  if (!isHero(u) || ownerOf(s, u) !== activeSeat(s))
    return "The objective must be attached to a hero you control.";
  const a = u.attachments.find((a) => a.id === attachmentId)!;
  if (a.exhausted) return "Ready the objective before using its action.";
  if (
    a.code === B.garb &&
    !s.staging.some((e) => card(e.code).type_code === "enemy" && harad(e))
  )
    return "Choose a Harad enemy in the staging area.";
  return null;
}
export function blackSerpentAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!blackSerpentAbilityLabel(s, u, attachmentId)) return false;
  const problem = blackSerpentAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const a = u.attachments.find((a) => a.id === attachmentId)!;
  if (a.code === B.garb) {
    choose(
      s,
      "The Serpent's Garb · Choose a Harad enemy",
      s.staging
        .filter((e) => card(e.code).type_code === "enemy" && harad(e))
        .map((e) => ({
          id: e.id,
          code: e.code,
          label: name(e),
          effects: [
            fx("blackSerpentObjectiveAction", {
              source: u.id,
              text: a.id,
              target: e.id,
              player: ownerOf(s, u),
            }),
          ],
        })),
    );
  } else
    prepend(
      s,
      fx("blackSerpentObjectiveAction", {
        source: u.id,
        text: a.id,
        player: ownerOf(s, u),
      }),
    );
  return true;
}
export const blackSerpentSharedEffect = (e: Effect) =>
  e.kind.startsWith("blackSerpent") &&
  ![
    "blackSerpentGuard",
    "blackSerpentGuardShadow",
    "blackSerpentCourtyardShadow",
    "blackSerpentBoldShadow",
    "blackSerpentQuarterShadow",
    "blackSerpentRedoubtAlly",
    "blackSerpentAllyResume",
    "blackSerpentTowerEvent",
    "blackSerpentObjectiveAction",
    "blackSerpentObjectiveBenefit",
  ].includes(e.kind);
export function blackSerpentEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("blackSerpent")) return false;
  const q = s.blackSerpent;
  if (!q) return true;
  const u = get(s, e.target),
    player = e.player ?? firstPlayer(s);
  const remove = (n: number) => {
    s.progress = Math.max(0, s.progress - n);
  };
  const chooseRemove = (
    n: number,
    label: string,
    other: Effect[],
    otherLabel: string,
    otherAllowed = true,
  ) =>
    choose(s, label, [
      ...(s.progress >= n
        ? [
            {
              id: "progress",
              label: `Remove ${n} progress from the main quest`,
              effects: [fx("blackSerpentRemoveProgress", { value: n })],
            },
          ]
        : []),
      ...(otherAllowed
        ? [{ id: "other", label: otherLabel, effects: other }]
        : []),
    ]);
  switch (e.kind) {
    case "blackSerpentSetup":
      randomObjective(s);
      q.initialized = true;
      break;
    case "blackSerpentAdvance":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("blackSerpentStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "blackSerpentStageReveal":
      if (s.stage === 2) {
        shuffledDiscard(s);
        randomObjective(s);
      }
      if (s.stage === 3) {
        randomObjective(s, true);
        shuffledDiscard(s);
        prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      }
      break;
    case "blackSerpentClaim":
      if (u && blackSerpentIsObjective(u))
        choose(
          s,
          `${card(u.code).name} · First player attaches to a hero`,
          allHeroes(s)
            .filter((h) => ownerOf(s, h) === firstPlayer(s))
            .map((h) => ({
              id: h.id,
              code: h.code,
              label: name(h),
              effects: [
                fx("blackSerpentAttach", {
                  target: h.id,
                  source: u.id,
                  player: firstPlayer(s),
                }),
              ],
            })),
        );
      break;
    case "blackSerpentAttach": {
      const objective = s.staging.find((o) => o.id === e.source);
      if (u && isHero(u) && objective && blackSerpentIsObjective(objective)) {
        s.staging = s.staging.filter((o) => o.id !== objective.id);
        u.attachments.push(asAttachment(objective));
        log(s, `${name(u)} claims ${name(objective)}.`);
      }
      break;
    }
    case "blackSerpentRemoveProgress":
      remove(e.value ?? 0);
      break;
    case "blackSerpentBossAttack":
      if (u && !u.blanked)
        chooseRemove(
          s.stage,
          "The Black Serpent · End of encounter phase",
          [fx("immediateAttack", { target: u.id, player: firstPlayer(s) })],
          "The Black Serpent attacks the first player",
        );
      break;
    case "blackSerpentGuard":
      chooseRemove(
        2,
        "Serpent Guard · Progress or protection",
        [fx("blackSerpentShieldPlayer", { player })],
        "Enemies engaged with you cannot take damage this round",
      );
      break;
    case "blackSerpentGuardShadow":
      chooseRemove(
        2,
        "Serpent Guard · Shadow",
        [fx("blackSerpentShield", { target: e.target })],
        "Attacking enemy cannot take damage this round",
      );
      break;
    case "blackSerpentShield":
      if (e.target) {
        q.shields = q.shields.filter((e) => e.round === s.round);
        if (!q.shields.some((x) => x.id === e.target))
          q.shields.push({ id: e.target, round: s.round });
      }
      break;
    case "blackSerpentShieldPlayer":
      q.shieldPlayers = q.shieldPlayers.filter((e) => e.round === s.round);
      if (!q.shieldPlayers.some((e) => e.player === player))
        q.shieldPlayers.push({ player, round: s.round });
      break;
    case "blackSerpentClearLocations":
      for (const l of [...s.staging, ...allActiveLocations(s)].filter(
        (l) => card(l.code).type_code === "location",
      ))
        l.progress = 0;
      break;
    case "blackSerpentAllyResume":
      if (u) allyEntryResponses(s, u, !!e.flag, !!e.value, false, false, true);
      break;
    case "blackSerpentRedoubtAlly":
      if (u)
        chooseRemove(
          1,
          "The Serpent's Redoubt · Ally played",
          [fx("exhaust", { target: u.id, player })],
          `Exhaust ${name(u)}`,
          canExhaust(u),
        );
      break;
    case "blackSerpentTowerEvent":
      chooseRemove(
        1,
        "Roofless Tower · Event played",
        [fx("blackSerpentCancelEvent", { target: e.target })],
        "Cancel the event’s effects",
      );
      break;
    case "blackSerpentCancelEvent":
      if (e.target && !q.canceledEvents.includes(e.target))
        q.canceledEvents.push(e.target);
      break;
    case "blackSerpentTowerTravel":
      choose(
        s,
        "Roofless Tower · Exhaust a hero",
        allHeroes(s)
          .filter(canExhaust)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("exhaust", { target: h.id, player: ownerOf(s, h) })],
          })),
      );
      break;
    case "blackSerpentRedoubtTravel": {
      const opts = (["deck", "discard"] as const).flatMap((zone) =>
        (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
          (code, i) =>
            card(code).type_code === "enemy"
              ? [
                  {
                    id: `${zone}:${i}`,
                    code,
                    label: `${card(code).name} · ${zone}`,
                    effects: [
                      fx("blackSerpentRedoubtEnemy", {
                        text: zone,
                        value: i,
                        code,
                        player: firstPlayer(s),
                      }),
                    ],
                  },
                ]
              : [],
        ),
      );
      if (opts.length) choose(s, "The Serpent's Redoubt · Find an enemy", opts);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "blackSerpentRedoubtEnemy": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (pile[e.value!] === e.code) {
        const enemy = make(s, pile.splice(e.value!, 1)[0]);
        addEnemy(s, enemy);
        forOwner(s, firstPlayer(s), () => engage(s, enemy));
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "blackSerpentBold":
      prepend(
        s,
        ...allHeroes(s)
          .filter((h) => h.attachments.some(blackSerpentIsObjective))
          .map((h) =>
            fx("damage", { target: h.id, value: 1, player: ownerOf(s, h) }),
          ),
      );
      break;
    case "blackSerpentQuarter":
      choose(s, "No Quarter · Reveal two cards or reveal an objective", [
        {
          id: "reveal",
          label: "Reveal 2 encounter cards",
          effects: [
            fx("reveal", { player: firstPlayer(s) }),
            fx("reveal", { player: firstPlayer(s) }),
          ],
        },
        ...blackSerpentControlledObjectives(s).map(
          ({ host, attachment: a }) => ({
            id: a.id,
            code: a.code,
            label: `Reveal ${card(a.code).name} again`,
            effects: [
              fx("blackSerpentReguard", {
                source: host.id,
                target: a.id,
                player: firstPlayer(s),
              }),
            ],
          }),
        ),
      ]);
      break;
    case "blackSerpentReguard": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) => a.id === e.target && blackSerpentIsObjective(a),
        );
      if (host && a) {
        host.attachments = host.attachments.filter((x) => x.id !== a.id);
        const objective = make(s, a.code);
        objective.id = a.id;
        objective.exhausted = a.exhausted;
        revealObjective(s, objective);
      }
      break;
    }
    case "blackSerpentChaos":
      choose(s, "Chaos in the Night · Raise threat or block quest progress", [
        {
          id: "threat",
          label: "Raise each player’s threat by 3",
          effects: playerOrder(s).map((player) =>
            fx("threat", { value: 3, player }),
          ),
        },
        {
          id: "progress",
          label: "Quest cards cannot receive progress this round",
          effects: [fx("blackSerpentBlockProgress")],
        },
      ]);
      break;
    case "blackSerpentBlockProgress":
      q.noProgressRound = s.round;
      break;
    case "blackSerpentChampion":
      if (u) {
        while (s.encounterDeck.length) {
          const code = s.encounterDeck.shift()!;
          const enemy = make(s, code);
          if (card(code).type_code === "enemy" && harad(enemy)) {
            enemy.resources++;
            q.champions.push({ questId: u.id, enemyId: enemy.id });
            addEnemy(s, enemy);
            break;
          }
          s.encounterDiscard.push(code);
        }
      }
      break;
    case "blackSerpentCourtyardShadow":
      chooseRemove(
        2,
        "Broken Courtyard · Shadow",
        [fx("blackSerpentReturnAfterAttack")],
        "Return attacking enemy to staging after this attack",
      );
      break;
    case "blackSerpentReturnAfterAttack":
      if (s.combat) s.combat.returnToStaging = true;
      break;
    case "blackSerpentBoldShadow": {
      const controlled = blackSerpentControlledObjectives(s, player);
      choose(s, "Bold and Grim · Shadow", [
        ...controlled.map(({ host, attachment: a }) => ({
          id: a.id,
          code: a.code,
          label: `Attach ${card(a.code).name} to attacking enemy`,
          effects: [
            fx("blackSerpentMoveObjective", {
              source: host.id,
              target: e.target,
              text: a.id,
              player,
            }),
          ],
        })),
        {
          id: "attack",
          label: "Attacking enemy makes an additional attack",
          effects: [fx("blackSerpentAdditionalAttack")],
        },
      ]);
      break;
    }
    case "blackSerpentAdditionalAttack":
      if (s.combat) s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      break;
    case "blackSerpentMoveObjective": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) => a.id === e.text && blackSerpentIsObjective(a),
        );
      if (host && a && u) {
        host.attachments = host.attachments.filter((x) => x.id !== a.id);
        u.attachments.push(a);
      }
      break;
    }
    case "blackSerpentQuarterShadow": {
      const targets = s.staging.filter(
        (u) =>
          card(u.code).sphere_code === "encounter" && !card(u.code).is_unique,
      );
      const options = blackSerpentControlledObjectives(s, player).flatMap(
        ({ host, attachment: a }) =>
          targets.map((target) => ({
            id: `${a.id}:${target.id}`,
            code: a.code,
            label: `Attach ${card(a.code).name} to ${name(target)}`,
            effects: [
              fx("blackSerpentMoveObjective", {
                source: host.id,
                target: target.id,
                text: a.id,
                player,
              }),
            ],
          })),
      );
      if (options.length) choose(s, "No Quarter · Shadow", options);
      break;
    }
    case "blackSerpentObjectiveAction": {
      const host = get(s, e.source),
        a = host?.attachments.find((a) => a.id === e.text);
      if (!host || !a || a.exhausted || a.blanked) break;
      a.exhausted = true;
      prepend(
        s,
        fx("threat", { value: 1, player }),
        fx("blackSerpentObjectiveBenefit", {
          code: a.code,
          source: host.id,
          target: e.target,
          player,
        }),
      );
      break;
    }
    case "blackSerpentObjectiveBenefit": {
      q.modifiers = q.modifiers.filter(
        (e) => e.round === s.round && e.phase === s.phase,
      );
      if (e.code === B.summons && get(s, e.source))
        prepend(s, fx("resource", { target: e.source, value: 1, player }));
      if (e.code === B.banner)
        q.modifiers.push({
          kind: "banner",
          target: String(player),
          round: s.round,
          phase: s.phase,
        });
      if (e.code === B.garb && u)
        q.modifiers.push({
          kind: "garb",
          target: u.id,
          round: s.round,
          phase: s.phase,
        });
      break;
    }
    default:
      return false;
  }
  return true;
}

import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { blackSerpentStageInfo } from "./black-serpent-support";
export const BLACK_SERPENT_HOOKS: Batch4ScenarioHooks = {
  setup: setupBlackSerpent,
  openingHandsKept: blackSerpentOpeningHandsKept,
  check: blackSerpentCheck,
  advance: blackSerpentAdvance,
  stageInfo: blackSerpentStageInfo,
  stats: blackSerpentStats,
  threatBonus: blackSerpentThreatBonus,
  progress: blackSerpentProgress,
  immune: blackSerpentImmune,
  cannotLeave: blackSerpentCannotLeave,
  cannotEngage: blackSerpentCannotEngage,
  damageAmount: blackSerpentDamageAmount,
  cannotReduceThreat: blackSerpentThreatReductionBlocked,
  consideredEngaged: blackSerpentConsideredEngaged,
  attachmentLeaves: blackSerpentAttachmentLeaves,
  engaged: blackSerpentEngaged,
  encounterEnd: blackSerpentEncounterEnd,
  roundEnd: blackSerpentRoundEnd,
  sideQuestChosen: blackSerpentSideQuestChosen,
  sideDefeatBlocked: blackSerpentSideDefeatBlocked,
  allyEntered: blackSerpentAllyEntered,
  eventPlayed: blackSerpentEventPlayed,
  eventCancelled: blackSerpentEventCancelled,
  travelProblem: blackSerpentTravelProblem,
  travelEffects: blackSerpentTravelEffects,
  encounter: blackSerpentEncounter,
  shadow: blackSerpentShadow,
  characterDestroyed: blackSerpentCharacterDestroyed,
  attackFinished: (s, c, skipped) => {
    blackSerpentAttackFinished(s, c, skipped);
    return [];
  },
  skipShadowDeal: blackSerpentSkipShadowDeal,
  beginShadows: blackSerpentBeginShadows,
  finishShadows: blackSerpentFinishShadows,
  abilityLabel: (code) =>
    BLACK_SERPENT_OBJECTIVES.includes(code)
      ? `Exhaust ${card(code).name} · Raise threat by 1`
      : undefined,
  abilityProblem: blackSerpentAbilityProblem,
  ability: blackSerpentAbility,
  sharedEffect: blackSerpentSharedEffect,
  effect: blackSerpentEffect,
};
