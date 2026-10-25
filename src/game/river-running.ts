import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  skip,
  units,
} from "./core";
import {
  damage,
  discardAttachment,
  engage,
  enemyAddedToStaging,
  exhaustCharacter,
  questDefeated,
  readyCharacter,
  win,
} from "./board";
import {
  activeSeat,
  allEngaged,
  allHeroes,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import {
  RIVER_RUNNING as R,
  RIVER_RUNNING_RECIPES,
  riverRunningPhase,
  riverRunningPlayers,
  riverRunningStageInfo,
} from "./river-running-support";
import {
  SHADOW_EAST_SHARED_HOOKS,
  shadowEastEffect,
  shadowEastEncounter,
  shadowEastEngagementBonus,
  shadowEastRevealedSurge,
  shadowEastRoundEnd,
  shadowEastShadow,
  shadowEastSharedEffect,
  shadowEastStats,
  shadowEastThreatBonus,
  shadowEastTrait,
} from "./shadow-east-encounters";
export * from "./river-running-support";
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const pursuit = (s: GameState) => s.staging.find((u) => u.code === R.pursuit);
const ready = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => !u.exhausted,
  );
const heroes = (s: GameState, p: number) =>
  allHeroes(s).filter((u) => ownerOf(s, u) === p);
function addPursuit(s: GameState, n = 1) {
  const u = pursuit(s);
  if (u) {
    u.resources += n;
    log(
      s,
      `Easterling Pursuit gains ${n} resource${n === 1 ? "" : "s"} (${u.resources} total).`,
      "danger",
    );
  }
}
function addEnemy(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  return u;
}
const stageLive = (s: GameState) => !mainQuestUnit(s)?.blanked;
const phaseEffects = (s: GameState) =>
  s.riverRunning?.phaseEffects.filter(
    (m) => m.round === s.round && m.phase === riverRunningPhase(s),
  ) ?? [];
export function setupRiverRunning(s: GameState) {
  const recipe = RIVER_RUNNING_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter(
      (r) =>
        ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section) &&
        r.code !== R.pursuit,
    )
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  const i = s.encounterDeck.indexOf(R.river);
  if (i >= 0) s.encounterDeck.splice(i, 1);
  s.staging.push(make(s, R.pursuit), make(s, R.river));
  s.riverRunning = {
    initialized: false,
    currentQuest: R.first,
    setAside: [make(s, R.warriors)],
    resolving: [],
    setupChosen: [],
    enteredEnemies: [],
    progressRound: 0,
    progressPlaced: 0,
    phaseEffects: [],
  };
  shuffle(s, s.encounterDeck);
}
export function riverRunningOpeningHandsKept(s: GameState) {
  if (!s.riverRunning || s.riverRunning.initialized) return false;
  prepend(s, fx("riverSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function riverRunningAdvance(s: GameState) {
  const q = s.riverRunning;
  if (!q) return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.pendingQuestDefeat ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.progress < (riverRunningStageInfo(s)?.quest ?? Infinity)) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 2) {
    win(s);
    s.reason =
      "The fellowship crosses the River Running and escapes the Easterling riders.";
    return true;
  }
  s.stage = 2;
  s.progress = 0;
  q.currentQuest = R.second;
  q.progressRound = s.round;
  q.progressPlaced = 0;
  s.stageRevealing = true;
  prepend(
    s,
    fx("riverStageTwo", { player: firstPlayer(s) }),
    fx("stageRevealed"),
  );
  return true;
}
export function riverRunningProgress(s: GameState, amount: number, u: Unit) {
  const q = s.riverRunning;
  if (!q || u.code !== R.second || !stageLive(s) || !allEngaged(s).length)
    return amount;
  return Math.min(
    amount,
    Math.max(0, 5 - (q.progressRound === s.round ? q.progressPlaced : 0)),
  );
}
export function riverRunningQuestProgressPlaced(
  s: GameState,
  u: Unit,
  amount: number,
) {
  const q = s.riverRunning;
  if (!q || u.code !== R.second) return;
  if (q.progressRound !== s.round) {
    q.progressRound = s.round;
    q.progressPlaced = 0;
  }
  q.progressPlaced += amount;
}
export function riverRunningStats(s: GameState, u: Unit) {
  return {
    ...shadowEastStats(s, u),
    will: u.exhausted ? -phaseEffects(s).reduce((n, m) => n + m.weary, 0) : 0,
  };
}
export function riverRunningThreatBonus(s: GameState, u: Unit) {
  return (
    shadowEastThreatBonus(s, u) +
    (u.code === R.plains
      ? 2 * phaseEffects(s).reduce((n, m) => n + m.plains, 0)
      : 0)
  );
}
export const riverRunningEngagementBonus = (s: GameState, u: Unit) =>
  shadowEastEngagementBonus(s, u) +
  (s.stage === 2 && stageLive(s) && s.staging.some((x) => x.id === u.id)
    ? -10
    : 0);
export function riverRunningEngaged(s: GameState, u: Unit) {
  if (u.code === R.outrider && !u.blanked)
    prepend(s, fx("riverOutrider", { target: u.id, player: ownerOf(s, u) }));
}
export function riverRunningWhenRevealedCancelled(s: GameState) {
  addPursuit(s, live(s, R.riverbank).length);
}
export function riverRunningCannotReady(s: GameState, u: Unit) {
  return (
    s.phase === "refresh" &&
    live(s, R.arduous).length > 0 &&
    u.exhausted &&
    !(s.refreshReadied?.[ownerOf(s, u)] ?? []).includes(u.id) &&
    (s.refreshReadied?.[ownerOf(s, u)]?.length ?? 0) >= 6
  );
}
export const riverRunningRefreshCharacters = (s: GameState, player: number) =>
  live(s, R.arduous).length
    ? [fx("riverRefresh", { player, ids: [] })]
    : undefined;
export function riverRunningSideDefeated(s: GameState, u: Unit) {
  if (u.code === R.arduous && !u.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("riverArduousReady", { player })),
    );
}
export function riverRunningTravelProblem(s: GameState, u: Unit) {
  if (u.blanked) return null;
  if (
    u.code === R.river &&
    !s.staging.some((x) => card(x.code).type_code === "enemy")
  )
    return "River Running requires the first player to engage an enemy from staging.";
  if (
    u.code === R.outcrop &&
    !heroes(s, firstPlayer(s)).some((h) => !h.exhausted)
  )
    return "Rocky Outcrop requires a ready hero controlled by the first player.";
  return null;
}
export function riverRunningTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  const player = firstPlayer(s);
  if (u.code === R.river) return [fx("riverTravelEngage", { player })];
  if (u.code === R.outcrop) return [fx("riverTravelExhaust", { player })];
  if (u.code === R.riverbank) return [fx("riverPursuit", { value: 1, player })];
  if (u.code === R.plains)
    return playerOrder(s).map((player) => fx("threat", { value: 2, player }));
  return undefined;
}
export function riverRunningEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (shadowEastEncounter(s, code, replay, fromReveal)) return true;
  if (![R.plains, R.weary, R.fatigue, R.close].includes(code)) return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === R.plains || code === R.weary)
    s.riverRunning!.phaseEffects.push({
      round: s.round,
      phase: riverRunningPhase(s),
      plains: code === R.plains ? 1 : 0,
      weary: code === R.weary ? 1 : 0,
    });
  else if (code === R.fatigue)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("riverFatigue", { player })),
    );
  else if (code === R.close) {
    addPursuit(s);
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("threat", { value: pursuit(s)?.resources ?? 0, player }),
      ),
    );
  }
  return true;
}
export function riverRunningShadow(s: GameState, code: string) {
  if (shadowEastShadow(s, code)) return true;
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === R.weary) {
    if (c.defenderId)
      prepend(s, fx("damage", { target: c.defenderId, value: 1, player }));
  } else if (code === R.fatigue)
    prepend(s, fx("riverFatigueShadow", { player }));
  else if (code === R.outrider)
    prepend(s, fx("riverDiscardAttachment", { player }));
  else if (code === R.close) {
    c.attackBonus++;
    c.riverPursuitOnKill = (c.riverPursuitOnKill ?? 0) + 1;
  } else return false;
  return true;
}
export function riverRunningCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: DamageContext,
) {
  if (
    s.combat &&
    ctx.combatDamage &&
    ctx.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
    s.combat.riverPursuitOnKill
  ) {
    addPursuit(s, s.combat.riverPursuitOnKill);
    delete s.combat.riverPursuitOnKill;
  }
}
export const riverRunningSharedEffect = (e: Effect) =>
  [
    "riverSetup",
    "riverStageTwo",
    "riverFindEnemies",
    "riverPursuit",
    "riverRoundEnd",
    "riverRoundOrder",
  ].includes(e.kind) || shadowEastSharedEffect(e);
export function riverRunningEffect(s: GameState, e: Effect) {
  if (shadowEastEffect(s, e)) return true;
  if (!e.kind.startsWith("river") || !s.riverRunning) return false;
  const q = s.riverRunning,
    player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "riverSetup":
      q.initialized = true;
      prepend(
        s,
        fx("riverSetupChoose", { value: 0, player: playerOrder(s)[0] }),
      );
      break;
    case "riverSetupChoose": {
      const n = e.value ?? 0,
        players = playerOrder(s);
      if (n >= players.length) {
        shuffle(s, s.encounterDeck);
        break;
      }
      const choices = [
        ...new Set(
          s.encounterDeck.filter(
            (c) =>
              card(c).type_code === "enemy" &&
              shadowEastTrait(c, "Easterling") &&
              !q.setupChosen.includes(c),
          ),
        ),
      ];
      choose(
        s,
        "Chased by Easterlings · Add a different Easterling enemy",
        choices.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("riverSetupTake", { code, player: players[n] }),
            fx("riverSetupChoose", {
              value: n + 1,
              player: players[n + 1] ?? players[n],
            }),
          ],
        })),
      );
      break;
    }
    case "riverSetupTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        q.setupChosen.push(e.code!);
        addEnemy(s, s.encounterDeck.splice(i, 1)[0]);
      }
      break;
    }
    case "riverStageTwo": {
      const side = q.setAside.shift();
      if (side) s.staging.push(side);
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        fx("riverFindEnemies", {
          count: riverRunningPlayers(s),
          player: firstPlayer(s),
        }),
      );
      break;
    }
    case "riverFindEnemies": {
      let count = e.count ?? 0;
      const found: string[] = [];
      while (count > 0 && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "enemy") {
          found.push(code);
          count--;
        } else s.encounterDiscard.push(code);
      }
      // All enemies are discarded first, then added; their forced entry effects resolve afterwards.
      for (const code of found) addEnemy(s, code);
      break;
    }
    case "riverPursuit":
      addPursuit(s, e.value ?? 1);
      break;
    case "riverRoundOrder": {
      const pending = e.effects ?? [];
      if (pending.length <= 1) {
        prepend(s, ...pending);
        break;
      }
      choose(
        s,
        "Choose an end-of-round forced effect",
        pending.map((effect, i) => ({
          id: String(i),
          label:
            effect.kind === "riverRoundEnd"
              ? "Easterling Pursuit"
              : `Easterling Horse · ${get(s, effect.target) ? name(get(s, effect.target)!) : "Return its enemy"}`,
          effects: [
            effect,
            fx("riverRoundOrder", {
              effects: pending.filter((_v, j) => j !== i),
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "riverRoundEnd": {
      q.phaseEffects = [];
      const p = pursuit(s);
      if (!p || p.blanked) break;
      addPursuit(s);
      if (p.resources >= 3) {
        p.resources -= 3;
        s.encounterDeck.push(...s.encounterDiscard.splice(0));
        shuffle(s, s.encounterDeck);
        prepend(
          s,
          fx("riverFindEnemies", {
            count: riverRunningPlayers(s),
            player: firstPlayer(s),
          }),
        );
      }
      break;
    }
    case "riverOutrider":
      if (u)
        choose(s, "Easterling Outrider · Pursuit or an immediate attack", [
          {
            id: "pursuit",
            label: "Place 1 resource on Easterling Pursuit",
            effects: [fx("riverPursuit", { value: 1, player })],
          },
          {
            id: "attack",
            label: "Easterling Outrider makes an immediate attack",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
        ]);
      break;
    case "riverTravelEngage": {
      const enemies = s.staging.filter(
          (u) => card(u.code).type_code === "enemy",
        ),
        highest = Math.max(...enemies.map((u) => engagementCost(s, u)));
      choose(
        s,
        "River Running · Engage the highest engagement cost enemy",
        enemies
          .filter((u) => engagementCost(s, u) === highest)
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("riverEngage", { target: u.id, player: firstPlayer(s) }),
            ],
          })),
      );
      break;
    }
    case "riverEngage":
      if (u) engage(s, u, false);
      break;
    case "riverTravelExhaust":
      choose(
        s,
        "Rocky Outcrop · Exhaust a hero",
        heroes(s, firstPlayer(s))
          .filter((u) => !u.exhausted)
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("exhaust", { target: u.id, player: firstPlayer(s) })],
          })),
      );
      break;
    case "riverFatigue":
      choose(
        s,
        "Painful Fatigue · Exhaust a character and deal 1 damage to it",
        [...seatView(s, player).heroes, ...seatView(s, player).allies].map(
          (u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("riverFatiguePay", { target: u.id, player })],
          }),
        ),
      );
      break;
    case "riverFatiguePay":
      if (u) {
        exhaustCharacter(s, u);
        damage(s, u.id, 1);
      }
      break;
    case "riverFatigueShadow":
      choose(
        s,
        "Painful Fatigue · Exhaust a character or return the attacker after this attack",
        [
          ...ready(s, player).map((u) => ({
            id: u.id,
            code: u.code,
            label: `Exhaust ${name(u)}`,
            effects: [fx("exhaust", { target: u.id, player })],
          })),
          {
            id: "return",
            label: "Return the attacking enemy to staging after this attack",
            effects: [fx("riverReturnAfterAttack", { player })],
          },
        ],
      );
      break;
    case "riverReturnAfterAttack":
      if (s.combat) s.combat.returnToStaging = true;
      break;
    case "riverDiscardAttachment": {
      const hosts = [
        ...new Map(
          [
            ...units(s),
            ...allQuestUnits(s),
            ...playerOrder(s)
              .map((p) => get(s, `threat:${p}`)!)
              .filter(Boolean),
          ].map((h) => [h.id, h]),
        ).values(),
      ];
      const choices = hosts.flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              a.code !== "21001" &&
              !/\bPermanent\b/.test(card(a.code).text ?? "") &&
              (h.id.startsWith("threat:")
                ? (a.controller ?? a.owner ?? Number(h.id.slice(7)))
                : attachmentController(s, h, a)) === player &&
              card(a.code).sphere_code !== "encounter",
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${h.id.startsWith("threat:") ? "Threat dial" : name(h)}`,
            effects: [
              fx("riverDiscardAttachmentTake", {
                target: h.id,
                source: a.id,
                player,
              }),
            ],
          })),
      );
      choose(
        s,
        "Easterling Outrider · Discard an attachment you control",
        choices,
      );
      break;
    }
    case "riverDiscardAttachmentTake": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) {
        if (u.id.startsWith("threat:")) {
          forOwner(s, Number(u.id.slice(7)), () => {
            s.threatAttachments = s.threatAttachments?.filter(
              (x) => x.id !== a.id,
            );
          });
          seatView(s, a.owner ?? player).discard.push(a.code);
        } else discardAttachment(s, u, a);
      }
      break;
    }
    case "riverRefresh": {
      const considered = e.ids ?? [],
        candidates = [
          ...seatView(s, player).heroes,
          ...seatView(s, player).allies,
        ].filter(
          (u) =>
            u.exhausted && !considered.includes(u.id) && !cannotReady(u, s),
        );
      const remaining = 6 - (s.refreshReadied?.[player]?.length ?? 0);
      if (!candidates.length || remaining <= 0) break;
      const effect = (u: Unit) => [
        fx(
          u.attachments.some((a) => a.code === "01080" && !a.blanked)
            ? "riverWebRefresh"
            : "riverFrameworkReady",
          { target: u.id, player },
        ),
        fx("riverRefresh", { player, ids: [...considered, u.id] }),
      ];
      if (candidates.length <= remaining) prepend(s, ...effect(candidates[0]));
      else
        choose(
          s,
          `An Arduous Journey · Choose a character to ready (${remaining} remaining)`,
          candidates.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: effect(u),
          })),
        );
      break;
    }
    case "riverFrameworkReady":
      if (u) readyCharacter(s, u, false);
      break;
    case "riverWebRefresh": {
      const cost =
        (u?.attachments.filter((a) => a.code === "01080" && !a.blanked)
          .length ?? 0) * 2;
      if (u && u.exhausted && cost && u.resources >= cost && !cannotReady(u, s))
        choose(s, `Free ${name(u)} from the web?`, [
          {
            id: "pay",
            label: `Pay ${cost} resources to ready`,
            effects: [
              fx("resource", {
                target: u.id,
                value: -cost,
                flag: true,
                player,
              }),
              fx("riverFrameworkReady", { target: u.id, player }),
            ],
          },
          skip,
        ]);
      break;
    }
    case "riverArduousReady":
      choose(s, "An Arduous Journey · You may ready a hero", [
        ...heroes(s, player)
          .filter((u) => u.exhausted && !cannotReady(u, s))
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("riverFrameworkReady", { target: u.id, player })],
          })),
        skip,
      ]);
      break;
    default:
      return false;
  }
  return true;
}
export const RIVER_RUNNING_HOOKS: Batch4ScenarioHooks = {
  ...SHADOW_EAST_SHARED_HOOKS,
  setup: setupRiverRunning,
  openingHandsKept: riverRunningOpeningHandsKept,
  advance: riverRunningAdvance,
  stageInfo: riverRunningStageInfo,
  progress: riverRunningProgress,
  questProgressPlaced: riverRunningQuestProgressPlaced,
  stats: riverRunningStats,
  threatBonus: riverRunningThreatBonus,
  engagementBonus: riverRunningEngagementBonus,
  stagingThreat: (s) =>
    s.stage === 1 && stageLive(s) ? (pursuit(s)?.resources ?? 0) : 0,
  engaged: riverRunningEngaged,
  cannotOptionallyEngage: (s) => live(s, R.river).length > 0,
  cannotPlayerReady: (s) => live(s, R.outcrop).length > 0,
  cannotReady: riverRunningCannotReady,
  refreshCharacters: riverRunningRefreshCharacters,
  sideDefeated: riverRunningSideDefeated,
  whenRevealedCancelled: riverRunningWhenRevealedCancelled,
  travelProblem: riverRunningTravelProblem,
  travelEffects: riverRunningTravelEffects,
  encounter: riverRunningEncounter,
  shadow: riverRunningShadow,
  characterDestroyed: riverRunningCharacterDestroyed,
  roundEnd: (s) => [
    fx("riverRoundOrder", {
      effects: [
        ...shadowEastRoundEnd(s).filter((e) =>
          allEngaged(s).some((u) => u.id === e.target),
        ),
        fx("riverRoundEnd", { player: firstPlayer(s) }),
      ],
      player: firstPlayer(s),
    }),
  ],
  revealedSurge: shadowEastRevealedSurge,
  effect: riverRunningEffect,
  sharedEffect: riverRunningSharedEffect,
};
