import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import {
  choose,
  draw,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
  units,
} from "./core";
import { addQuestProgress } from "./side-quests";
import { mainQuestUnit } from "./quest-state";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  phaseEnd,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  attachmentController,
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
import { heirsShadowDealt } from "./heirs-numenor";
import { carnShadowDealt } from "./carn-dum";
import { UMBAR as C, UMBAR_RECIPES } from "./escape-umbar-support";

type UmbarCombat = NonNullable<GameState["combat"]> & {
  umbarKilled?: number;
  umbarInjuredShadows?: number;
};
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((x) => x.trim() === t);
const locationActive = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code && !u.blanked);
const live = (s: GameState, code: string) =>
  s.staging.some((u) => u.code === code && !u.blanked);
const championQuest = (s: GameState, enemy: Unit) => {
  const entry = s.umbar?.champions.find((e) => e.enemyId === enemy.id);
  return entry
    ? s.staging.find(
        (q) => q.id === entry.questId && q.code === C.champion && !q.blanked,
      )
    : undefined;
};
const liveChampions = (s: GameState) =>
  enemies(s).filter((e) => !!championQuest(s, e));
function dealShadow(s: GameState, enemy: Unit) {
  const code = encounterDraw(s, true);
  if (!code) return;
  enemy.shadows.push(code);
  if (enemy.faceupShadows) enemy.faceupShadows.push(false);
  heirsShadowDealt(s, enemy);
  carnShadowDealt(s, enemy);
}
function findEnemy(s: GameState, harad = false) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (
      card(code).type_code === "enemy" &&
      (!harad || trait({ code } as Unit, "Harad"))
    )
      return make(s, code);
    s.encounterDiscard.push(code);
  }
}
function addEnemy(s: GameState, enemy: Unit, player?: number) {
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  if (player !== undefined) forOwner(s, player, () => engage(s, enemy));
}
export function setupUmbar(s: GameState) {
  const recipe = UMBAR_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  // Recipe staging sections contain every setup candidate, not six mandatory locations.
  s.encounterDeck = recipe.cards
    .filter((c) =>
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section),
    )
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const seize = s.encounterDeck.indexOf(C.seize);
  if (seize >= 0) s.encounterDeck.splice(seize, 1);
  s.staging.push(make(s, C.seize));
  s.umbar = {
    initialized: false,
    advancing: false,
    currentQuest: C.stranded,
    questDeck: [C.flee],
    completedQuests: [],
    stageEnteredRound: s.round,
    underAlley: [],
    champions: [],
  };
}
export function umbarOpeningHandsKept(s: GameState) {
  if (!s.umbar || s.umbar.initialized) return false;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("umbarSetupLocation", { player })),
    fx("umbarSetupDone", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function umbarProgress(s: GameState, amount: number) {
  if (!s.umbar || mainQuestUnit(s)?.blanked) return false;
  s.progress = Math.min(15, s.progress + Math.max(0, amount));
  // Exploring the active Alleyway returns its enemy before excess progress can
  // defeat the main quest. Its leave-play Forced effect cannot wait for check().
  umbarCheck(s);
  umbarAdvance(s);
  return true;
}
export function umbarAdvance(s: GameState) {
  const q = s.umbar;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (
    s.progress < 15 ||
    (mainQuestUnit(s)?.blanked ? false : allEngaged(s).length > 0) ||
    liveChampions(s).length
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 2) {
    win(s);
    s.reason =
      "The city guard is defeated. Your fellowship escapes from Umbar.";
  } else {
    q.advancing = true;
    prepend(s, fx("umbarAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function umbarCheck(s: GameState) {
  const q = s.umbar;
  if (q) {
    // An Alleyway's leave trigger uses the stored cards even when its text is blanked now.
    for (const entry of [...q.underAlley]) {
      if (
        [...s.staging, ...allActiveLocations(s)].some(
          (l) => l.id === entry.locationId,
        )
      )
        continue;
      q.underAlley = q.underAlley.filter((e) => e !== entry);
      for (const enemy of entry.enemies) addEnemy(s, enemy, firstPlayer(s));
    }
    q.champions = q.champions.filter((e) =>
      s.staging.some((q) => q.id === e.questId),
    );
  }
  if (live(s, C.hostile)) {
    for (const p of playerOrder(s)) {
      if (seatView(s, p).hand.length <= 5) continue;
      const pending = (e: Effect) =>
        e.kind === "umbarHandLimit" && e.player === p;
      if (
        !s.queue.some(pending) &&
        !s.choice?.options.some((o) => o.effects.some(pending))
      )
        prepend(s, fx("umbarHandLimit", { player: p }));
    }
  }
}
export function umbarQuestStart(s: GameState) {
  if (
    s.umbar &&
    s.stage === 2 &&
    !mainQuestUnit(s)?.blanked &&
    playerOrder(s).some((p) => !seatView(s, p).engaged.length)
  )
    prepend(s, fx("umbarFindEnemy", { player: firstPlayer(s), flag: true }));
}
export function umbarRoundEnd(s: GameState): Effect[] {
  return s.umbar && live(s, C.seize)
    ? [fx("umbarSeizeEnd", { player: firstPlayer(s) })]
    : [];
}
export function umbarStats(s: GameState, u: Unit) {
  return {
    attack:
      (championQuest(s, u) ? 2 : 0) +
      (trait(u, "Harad")
        ? allEngaged(s).filter(
            (c) =>
              c.id !== u.id &&
              c.code === C.captain &&
              !c.blanked &&
              ownerOf(s, c) === ownerOf(s, u) &&
              allEngaged(s).some((e) => e.id === u.id),
          ).length
        : 0),
    defense: championQuest(s, u) ? 2 : 0,
  };
}
export function umbarThreatBonus(s: GameState, u: Unit) {
  return (
    (championQuest(s, u) ? 2 : 0) +
    (u.code === C.port && !u.blanked ? allEngaged(s).length : 0) +
    (trait(u, "Harad")
      ? s.staging.filter(
          (c) => c.id !== u.id && c.code === C.captain && !c.blanked,
        ).length
      : 0)
  );
}
export const umbarEngagementModifier = (s: GameState, _u: Unit) =>
  locationActive(s, C.street) ? -s.progress : 0;
export const umbarImmune = (s: GameState, u: Unit) => !!championQuest(s, u);
export const umbarDamageBlocked = (s: GameState, u: Unit) => {
  const q = championQuest(s, u);
  return !!q && q.progress < 4;
};
export const umbarLocationProgressBlocked = (s: GameState, u: Unit) =>
  u.code === C.estate && !u.blanked && s.staging.some((l) => l.id === u.id);
export const umbarSideDefeatBlocked = (s: GameState, u: Unit) =>
  u.code === C.champion &&
  !u.blanked &&
  liveChampions(s).some((e) =>
    s.umbar!.champions.some((c) => c.questId === u.id && c.enemyId === e.id),
  );
export function umbarSideDefeated(s: GameState, u: Unit) {
  if (u.code === C.hostile && !u.blanked)
    prepend(s, fx("umbarTerritoryResponse", { player: firstPlayer(s) }));
}
export function umbarCannotReady(s: GameState, u: Unit) {
  const markers = seatView(s, ownerOf(s, u)).used;
  return (
    u.exhausted &&
    (markers.includes(`round:umbar-enfeebled:${s.round}`) ||
      markers.includes(`round:umbar-no-ready:${s.round}:${u.id}`))
  );
}
export function umbarCombatEnd(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.used = s.used.filter((k) => k !== `round:umbar-enfeebled:${s.round}`);
    });
}
export function umbarEngaged(s: GameState, u: Unit) {
  forOwner(s, ownerOf(s, u), () => {
    const key = `round:umbar-engaged:${s.round}:${u.id}`;
    if (!s.used.includes(key)) s.used.push(key);
  });
  if (u.blanked || ![C.soldier, C.archer].includes(u.code)) return;
  prepend(s, fx("umbarEngageChoice", { target: u.id, player: ownerOf(s, u) }));
}
export function umbarAttackStarted(
  s: GameState,
  enemy: Unit,
  player = activeSeat(s),
) {
  if (enemy.code === C.sentry && !enemy.blanked)
    prepend(s, fx("umbarSentryAttack", { target: enemy.id, player }));
}
export function umbarCharacterDestroyed(
  s: GameState,
  _u: Unit,
  context: DamageContext,
) {
  if (
    (isHero(_u) || isAlly(_u)) &&
    context.combatDamage &&
    s.combat &&
    context.enemyId === s.combat.enemyId
  )
    (s.combat as UmbarCombat).umbarKilled =
      ((s.combat as UmbarCombat).umbarKilled ?? 0) + 1;
}
export function umbarAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
) {
  const c = combat as UmbarCombat;
  if (skipped || !c.umbarKilled) return;
  const enemy = get(s, c.enemyId);
  if (enemy && live(s, C.seize))
    prepend(
      s,
      fx("umbarRemoveProgress", {
        value: threatOf(s, enemy),
        count: c.umbarKilled,
        player: firstPlayer(s),
      }),
    );
  if (c.umbarInjuredShadows)
    prepend(
      s,
      ...Array.from({ length: c.umbarInjuredShadows }, () =>
        fx("umbarRaiseAll", { value: 1, player: firstPlayer(s) }),
      ),
    );
}
export function umbarEnemyDestroyed(
  s: GameState,
  _enemy: Unit,
  destruction = true,
) {
  if (destruction && isEnemy(_enemy))
    prepend(
      s,
      ...allActiveLocations(s)
        .filter((l) => l.code === C.square && !l.blanked)
        .map((l) =>
          fx("umbarSquareResponse", { source: l.id, player: firstPlayer(s) }),
        ),
    );
}
export function umbarTravelProblem(s: GameState, u: Unit) {
  if (u.blanked) return null;
  if (
    u.code === C.estate &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (code) =>
        card(code).type_code === "enemy" && trait({ code } as Unit, "Harad"),
    )
  )
    return "Haradrim Estate requires a Harad enemy in the encounter deck or discard pile.";
  if (
    u.code === C.port &&
    allCharacters(s).reduce(
      (n, c) => n + Math.max(0, stats(s, c).health - c.damage),
      0,
    ) < allEngaged(s).length
  )
    return "Port of Harad requires enough character hit points to assign its travel damage.";
  if (
    u.code === C.square &&
    !s.encounterDeck.length &&
    !s.encounterDiscard.length
  )
    return "Umbar Square requires an encounter card to reveal.";
  return null;
}
export function umbarTravelEffects(
  _s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return;
  if (u.code === C.square) return [fx("reveal")];
  if (u.code === C.port) return [fx("umbarPortDamage", { target: u.id })];
  if (u.code === C.estate) return [fx("umbarEstateSearch", { target: u.id })];
}
export function umbarTravelEntered(s: GameState, u: Unit, actualTravel = true) {
  if (actualTravel && u.code === C.alley && !u.blanked)
    prepend(
      s,
      fx("umbarAlleyResponse", { target: u.id, player: firstPlayer(s) }),
    );
}
export function umbarEncounter(s: GameState, code: string, replay = false) {
  const kind =
    code === C.pursuit
      ? "umbarPursuit"
      : code === C.nowhere
        ? "umbarNowhere"
        : code === C.injured
          ? "umbarInjured"
          : code === C.enfeebled
            ? "umbarEnfeebled"
            : code === C.champion
              ? "umbarChampion"
              : undefined;
  if (!kind) return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  const target =
    code === C.champion
      ? [...s.staging].reverse().find((u) => u.code === C.champion)?.id
      : undefined;
  prepend(s, fx(kind, { target, player: firstPlayer(s) }));
  return true;
}
export function umbarShadow(s: GameState, code: string) {
  if (!s.combat) return false;
  const c = s.combat as UmbarCombat,
    player = c.attackPlayer ?? activeSeat(s);
  if (code === C.pursuit) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === C.nowhere)
    c.attackBonus += seatView(s, player).used.includes(
      `round:umbar-engaged:${s.round}:${c.enemyId}`,
    )
      ? 2
      : 1;
  else if (code === C.injured) {
    c.attackBonus++;
    c.umbarInjuredShadows = (c.umbarInjuredShadows ?? 0) + 1;
  } else if (code === C.soldier)
    prepend(s, fx("umbarSoldierShadow", { player }));
  else if (code === C.street)
    prepend(s, fx("umbarDiscardAttachment", { player }));
  else if (code === C.enfeebled) {
    const ids = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
    for (const id of ids) {
      const u = get(s, id);
      if (u)
        forOwner(s, ownerOf(s, u), () =>
          s.used.push(`round:umbar-no-ready:${s.round}:${id}`),
        );
    }
  } else return false;
  return true;
}
export const umbarSharedEffect = (e: Effect) =>
  e.kind.startsWith("umbar") &&
  ![
    "umbarHandLimit",
    "umbarHandDiscard",
    "umbarInjuredChoice",
    "umbarEnfeebledChoose",
    "umbarExhaust",
    "umbarDiscardCharacter",
    "umbarEngageChoice",
    "umbarSentryAttack",
    "umbarSoldierShadow",
    "umbarDiscardAttachment",
    "umbarAttachDiscard",
  ].includes(e.kind);

export function umbarEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("umbar")) return false;
  const q = s.umbar,
    u = get(s, e.target),
    p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "umbarSetupLocation": {
      if (!q) break;
      const already = new Set(
        s.staging
          .filter((l) => card(l.code).type_code === "location")
          .map((l) => l.code),
      );
      const choices = [
        ...new Set(
          s.encounterDeck.filter(
            (code) => card(code).type_code === "location" && !already.has(code),
          ),
        ),
      ];
      choose(
        s,
        `${seatName(s, p)} · Add a different location`,
        choices.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("umbarSetupTake", { code, player: p })],
        })),
      );
      break;
    }
    case "umbarSetupTake": {
      if (!q || !e.code) break;
      const index = s.encounterDeck.indexOf(e.code);
      if (index >= 0)
        s.staging.push(make(s, s.encounterDeck.splice(index, 1)[0]));
      const sentry = s.encounterDeck.indexOf(C.sentry);
      if (sentry >= 0)
        addEnemy(s, make(s, s.encounterDeck.splice(sentry, 1)[0]), p);
      break;
    }
    case "umbarSetupDone":
      if (q) {
        shuffle(s, s.encounterDeck);
        q.initialized = true;
      }
      break;
    case "umbarAdvance": {
      if (!q) break;
      // Other already-triggered effects may have added an engaged enemy after
      // the advancement opportunity was queued. Recheck the printed restriction.
      if (
        s.stage !== 1 ||
        s.progress < 15 ||
        (!mainQuestUnit(s)?.blanked && allEngaged(s).length > 0) ||
        liveChampions(s).length
      ) {
        q.advancing = false;
        break;
      }
      const oldPhase = s.phase;
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage = 2;
      s.progress = 0;
      q.stageEnteredRound = s.round;
      q.advancing = false;
      // End the entire current phase, including the rest of staging/combat. Finish
      // active printed ability boundaries, then move to the next framework phase.
      const boundaries = s.queue.filter(
        (effect) => effect.kind === "playerAbilityFinish",
      );
      s.queue = [];
      phaseEnd(s);
      s.queue.push(
        fx("umbarFleeSetup", { text: oldPhase, player: firstPlayer(s) }),
        ...boundaries,
      );
      break;
    }
    case "umbarFleeSetup": {
      const oldPhase = e.text;
      if (["defense", "attack"].includes(oldPhase ?? "")) {
        // Ending combat discards its shadow cards before the subsequent printed
        // shuffle and enemy searches, including cards held by an interrupted attack.
        umbarCombatEnd(s);
        for (const enemy of enemies(s)) {
          s.encounterDiscard.push(...enemy.shadows.splice(0));
          delete enemy.faceupShadows;
          enemy.revealedShadowCount = 0;
          delete enemy.shadowCancelsDamage;
          delete enemy.shadowCancelsCombatDamage;
        }
        for (const combat of [s.combat, ...s.suspendedCombats])
          if (combat?.immediatePreviousShadows) {
            s.encounterDiscard.push(
              ...combat.immediatePreviousShadows.splice(0),
            );
          }
        s.combat = null;
        s.suspendedCombats = [];
      }
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const next =
        oldPhase === "planning"
          ? "startQuest"
          : ["quest", "staging"].includes(oldPhase ?? "")
            ? "startTravel"
            : oldPhase === "travel"
              ? "startEncounter"
              : oldPhase === "encounter"
                ? "startCombat"
                : ["defense", "attack"].includes(oldPhase ?? "")
                  ? "endCombat"
                  : oldPhase === "refresh"
                    ? "nextRound"
                    : "startPlanning";
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("umbarFindEnemy", { player })),
        fx(next, { player: firstPlayer(s) }),
      );
      break;
    }
    case "umbarFindEnemy": {
      const enemy = findEnemy(s);
      if (enemy) addEnemy(s, enemy, e.flag ? undefined : p);
      break;
    }
    case "umbarSeizeEnd":
      if (
        q &&
        q.stageEnteredRound < s.round &&
        s.progress === 0 &&
        live(s, C.seize)
      ) {
        s.status = "lost";
        s.reason =
          "Seize them! The guard captures the fellowship after a full round without progress on the main quest.";
        s.queue = [];
        s.choice = null;
        log(s, s.reason, "danger");
      }
      break;
    case "umbarRemoveProgress":
      s.progress = Math.max(
        0,
        s.progress - Math.max(0, e.value ?? 0) * (e.count ?? 1),
      );
      break;
    case "umbarPursuit":
      choose(s, "Enemy Pursuit · Remove progress or assign damage", [
        {
          id: "progress",
          label: `Remove all ${s.progress} progress from the main quest`,
          effects: [
            fx("umbarRemoveProgress", { value: s.progress, player: p }),
          ],
        },
        ...(s.progress > 0
          ? [
              {
                id: "damage",
                label: `Assign ${s.progress} damage among characters in play`,
                effects: [
                  fx("umbarAssignDamage", { value: s.progress, player: p }),
                ],
              },
            ]
          : []),
      ]);
      break;
    case "umbarAssignDamage": {
      const left = e.value ?? 0,
        chars = allCharacters(s);
      if (left > 0 && chars.length)
        choose(
          s,
          `${e.text ?? "Encounter effect"} · Assign ${left} damage`,
          chars.map((c) => ({
            id: c.id,
            code: c.code,
            label: `Deal 1 damage to ${name(c)}`,
            effects: [
              fx("damage", {
                target: c.id,
                value: 1,
                player: ownerOf(s, c),
                text: e.flag
                  ? JSON.stringify({ damageContext: { cost: true } })
                  : undefined,
              }),
              { ...e, value: left - 1 },
            ],
          })),
        );
      break;
    }
    case "umbarNowhere":
      prepend(s, fx("umbarFindEnemy", { player: firstPlayer(s) }));
      break;
    case "umbarChampion": {
      if (!q || !u) break;
      const enemy = findEnemy(s, true);
      if (enemy) {
        enemy.resources++;
        q.champions.push({ questId: u.id, enemyId: enemy.id });
        addEnemy(s, enemy);
      }
      break;
    }
    case "umbarInjured":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("umbarInjuredChoice", { player })),
      );
      break;
    case "umbarInjuredChoice":
      choose(s, `${seatName(s, p)} · Injured Companion`, [
        {
          id: "threat",
          label: `Raise your threat by ${own(s, p).length}`,
          effects: [fx("threat", { value: own(s, p).length, player: p })],
        },
        ...own(s, p).map((c) => ({
          id: c.id,
          code: c.code,
          label: `Discard ${name(c)}`,
          effects: [fx("umbarDiscardCharacter", { target: c.id, player: p })],
        })),
      ]);
      break;
    case "umbarDiscardCharacter":
      if (u && ownerOf(s, u) === p) discardCharacter(s, u);
      break;
    case "umbarEnfeebled":
      for (const player of playerOrder(s))
        forOwner(s, player, () =>
          s.used.push(`round:umbar-enfeebled:${s.round}`),
        );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("umbarEnfeebledChoose", { player }),
        ),
      );
      break;
    case "umbarEnfeebledChoose": {
      const chars = own(s, p).filter((c) => !c.exhausted);
      choose(
        s,
        `${seatName(s, p)} · Enfeebled: exhaust a character`,
        chars.map((c) => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [fx("umbarExhaust", { target: c.id, player: p })],
        })),
      );
      break;
    }
    case "umbarExhaust":
      if (u) exhaustCharacter(s, u);
      break;
    case "umbarRaiseAll":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "umbarEngageChoice": {
      if (!u) break;
      const soldier = u.code === C.soldier;
      const opts: Option[] =
        s.progress >= 2
          ? [
              {
                id: "progress",
                label: "Remove 2 progress from the main quest",
                effects: [fx("umbarRemoveProgress", { value: 2, player: p })],
              },
            ]
          : [];
      if (soldier)
        opts.push({
          id: "attack",
          label: "Southron Soldier makes an immediate attack",
          effects: [fx("immediateAttack", { target: u.id, player: p })],
        });
      else
        opts.push(
          ...own(s, p)
            .filter(isAlly)
            .map((c) => ({
              id: c.id,
              code: c.code,
              label: `Discard ${name(c)}`,
              effects: [
                fx("umbarDiscardCharacter", { target: c.id, player: p }),
              ],
            })),
        );
      // An either/or may choose an ineffective option only if neither can be paid in full.
      if (!opts.length)
        opts.push({
          id: "progress",
          label: "Remove as much of 2 progress as possible",
          effects: [fx("umbarRemoveProgress", { value: 2, player: p })],
        });
      choose(s, `${name(u)} · Engagement Forced effect`, opts);
      break;
    }
    case "umbarSentryAttack":
      if (u && s.combat?.enemyId === u.id)
        choose(s, "Umbar Sentry · Remove progress or increase attack", [
          ...(s.progress > 0
            ? [
                {
                  id: "progress",
                  label: "Remove 1 progress from the main quest",
                  effects: [fx("umbarRemoveProgress", { value: 1, player: p })],
                },
              ]
            : []),
          {
            id: "attack",
            label: "Umbar Sentry gets +2 attack for this attack",
            effects: [fx("umbarAttackBoost", { value: 2, player: p })],
          },
        ]);
      break;
    case "umbarAttackBoost":
      if (s.combat) s.combat.attackBonus += e.value ?? 0;
      break;
    case "umbarSoldierShadow":
      choose(
        s,
        "Southron Soldier · Engage a non-unique enemy from staging",
        s.staging
          .filter((c) => isEnemy(c) && !card(c.code).is_unique)
          .map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [fx("umbarEngageShadow", { target: c.id, player: p })],
          })),
      );
      break;
    case "umbarEngageShadow":
      if (u) {
        forOwner(s, p, () => engage(s, u));
        dealShadow(s, u);
      }
      break;
    case "umbarDiscardAttachment":
      choose(
        s,
        "Umbar Street · Discard an attachment you control",
        units(s).flatMap((c) =>
          c.attachments
            .filter((a) => attachmentController(s, c, a) === p)
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: card(a.code).name,
              effects: [
                fx("umbarAttachDiscard", {
                  target: c.id,
                  source: a.id,
                  player: p,
                }),
              ],
            })),
        ),
      );
      break;
    case "umbarAttachDiscard": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      break;
    }
    case "umbarHandLimit":
      if (!live(s, C.hostile) || seatView(s, p).hand.length <= 5) break;
      choose(
        s,
        `${seatName(s, p)} · In Enemy Territory: discard to 5 cards`,
        seatView(s, p).hand.map((c) => ({
          id: c.id,
          code: c.code,
          label: card(c.code).name,
          effects: [
            fx("umbarHandDiscard", { target: c.id, player: p }),
            fx("umbarHandLimit", { player: p }),
          ],
        })),
      );
      break;
    case "umbarHandDiscard":
      forOwner(s, p, () => {
        if (s.hand.some((c) => c.id === e.target))
          discardHandCard(s, e.target!);
      });
      break;
    case "umbarTerritoryResponse":
      choose(s, "In Enemy Territory · Response", [
        {
          id: "draw",
          label: "Each player draws a card",
          effects: [fx("umbarDrawAll", { player: p })],
        },
        { id: "skip", label: "Decline response", effects: [] },
      ]);
      break;
    case "umbarDrawAll":
      for (const player of playerOrder(s))
        forOwner(s, player, () => draw(s, 1));
      break;
    case "umbarSquareResponse":
      if (allActiveLocations(s).some((l) => l.id === e.source && !l.blanked))
        choose(s, "Umbar Square · Response", [
          {
            id: "progress",
            label: "Place 1 progress on the main quest",
            effects: [fx("umbarMainProgress", { value: 1, player: p })],
          },
          { id: "skip", label: "Decline response", effects: [] },
        ]);
      break;
    case "umbarMainProgress": {
      const quest = mainQuestUnit(s);
      if (quest) addQuestProgress(s, quest, e.value ?? 0);
      break;
    }
    case "umbarPortDamage":
      prepend(
        s,
        fx("umbarAssignDamage", {
          value: allEngaged(s).length,
          player: firstPlayer(s),
          flag: true,
          text: "Port of Harad travel",
        }),
      );
      break;
    case "umbarEstateSearch": {
      const opts: Option[] = (["deck", "discard"] as const).flatMap((pile) =>
        (pile === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
          (code, i) =>
            card(code).type_code === "enemy" && trait({ code } as Unit, "Harad")
              ? [
                  {
                    id: `${pile}:${i}`,
                    code,
                    label: `${card(code).name} · ${pile}`,
                    effects: [
                      fx("umbarEstateTake", {
                        code,
                        value: i,
                        text: pile,
                        player: firstPlayer(s),
                      }),
                    ],
                  },
                ]
              : [],
        ),
      );
      choose(s, "Haradrim Estate · Search for a Harad enemy", opts);
      break;
    }
    case "umbarEstateTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value !== undefined && pile[e.value] === e.code) {
        addEnemy(s, make(s, pile.splice(e.value, 1)[0]), firstPlayer(s));
        prepend(
          s,
          fx("umbarMainProgress", { value: 1, player: firstPlayer(s) }),
        );
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "umbarAlleyResponse":
      if (q && u)
        choose(s, "Narrow Alleyway · Response", [
          ...allEngaged(s)
            .filter((c) => !card(c.code).is_unique)
            .map((c) => ({
              id: c.id,
              code: c.code,
              label: `Place ${name(c)} under Narrow Alleyway`,
              effects: [
                fx("umbarAlleyHide", { target: c.id, source: u.id, player: p }),
              ],
            })),
          { id: "skip", label: "Decline response", effects: [] },
        ]);
      break;
    case "umbarAlleyHide": {
      if (
        !q ||
        !u ||
        !e.source ||
        !allEngaged(s).some((c) => c.id === u.id) ||
        card(u.code).is_unique
      )
        break;
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      s.encounterDiscard.push(...u.shadows);
      forOwner(s, ownerOf(s, u), () => {
        s.engaged = s.engaged.filter((c) => c.id !== u.id);
      });
      const held = { ...make(s, u.code), id: u.id };
      delete held.owner;
      let entry = q.underAlley.find((c) => c.locationId === e.source);
      if (!entry) {
        entry = { locationId: e.source, enemies: [] };
        q.underAlley.push(entry);
      }
      entry.enemies.push(held);
      break;
    }
    default:
      return false;
  }
  return true;
}
