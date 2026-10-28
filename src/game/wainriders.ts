import { collectorQuestDefeated } from "./collector-player-cards";
import { haradPlayerQuestDefeated } from "./harad-player";
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
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
  random,
} from "./core";
import {
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  exhaustCharacter,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { mainQuestCode } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  WAINRIDERS as W,
  WAINRIDERS_QUESTS,
  WAINRIDERS_RECIPES,
  racingResult,
  wainridersAhead,
  wainridersGoal,
  wainridersPhase,
  wainridersStageInfo,
} from "./wainriders-support";
import {
  SHADOW_EAST_SHARED_HOOKS,
  shadowEastAttach,
  shadowEastCombatBegin,
  shadowEastDamageAmount,
  shadowEastEffect,
  shadowEastEncounter,
  shadowEastEnemies,
  shadowEastRevealedSurge,
  shadowEastRoundEnd,
  shadowEastShadow,
  shadowEastSharedEffect,
  shadowEastStats,
  shadowEastThreatBonus,
  shadowEastTrait,
} from "./shadow-east-encounters";
import {
  plainsCannotReady,
  plainsRefreshCharacters,
  plainsSideDefeated,
  plainsEffect,
} from "./rolling-plains";
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const champion = (s: GameState) => s.staging.find((u) => u.code === W.champion);
const characters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const ready = (s: GameState, p: number) =>
  characters(s, p).filter(
    (u) =>
      !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u),
  );
const option = (u: Unit, effects: Effect[]) => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const phases = (s: GameState) =>
  s.wainriders!.phaseEffects.filter(
    (e) => e.round === s.round && e.phase === wainridersPhase(s),
  );
const engaged = (s: GameState) =>
  s.wainriders!.challengerSteps % 6 === s.wainriders!.wainriderSteps % 6;
function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
export function wainridersDamage(s: GameState, amount: number) {
  const q = s.wainriders!;
  q.damage = Math.max(0, q.damage + amount);
  log(
    s,
    `The Wainriders ${amount < 0 ? "lose" : "gain"} ${Math.abs(amount)} damage (${q.damage}).`,
    amount < 0 ? "good" : "danger",
  );
  while (
    s.status === "playing" &&
    q.damage >= wainridersGoal(s) &&
    wainridersGoal(s) > 0
  ) {
    q.damage -= wainridersGoal(s);
    q.wainriderSteps++;
    log(
      s,
      `The Wainriders advance: ${q.wainriderSteps} of 12 stages.`,
      "danger",
    );
    if (q.wainriderSteps === 12) {
      s.status = "lost";
      s.reason = "The Wainriders complete two circuits before the challengers.";
      break;
    }
  }
}
export function setupWainriders(s: GameState) {
  const r = WAINRIDERS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((r) =>
      ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section),
    )
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.wainriders = {
    initialized: false,
    currentQuest: WAINRIDERS_QUESTS[0].code,
    challengerSteps: 0,
    wainriderSteps: 0,
    damage: 0,
    progress: [0, 0, 0, 0, 0, 0],
    defeated: [],
    completedRound: 0,
    completed: 0,
    setupChosen: [],
    resolving: [],
    enteredEnemies: [],
    phaseEffects: [],
  };
  add(s, W.challengers);
  add(s, W.wainriders);
  add(s, W.champion);
  shuffle(s, s.encounterDeck);
}
function beginTest(s: GameState, travel = false) {
  const q = s.wainriders!;
  if (q.completedRound !== s.round) {
    q.completed = 0;
    q.completedRound = s.round;
  }
  const stage = s.stage;
  q.test = {
    stage,
    stat: travel
      ? "attack"
      : stage === 1 || stage === 4
        ? "defense"
        : stage === 2 || stage === 6
          ? "attack"
          : "will",
    result: travel || stage === 3 || stage === 6 ? "turn" : "straight",
    required: 1 + (travel ? 0 : q.completed) + live(s, W.ravine).length,
    excess: travel ? 0 : Math.max(0, s.progress - wainridersGoal(s)),
    travel,
  };
  prepend(s, fx("wainTest", { player: firstPlayer(s) }));
}
export function wainridersAdvance(s: GameState) {
  const q = s.wainriders;
  if (!q) return false;
  if (
    s.status !== "playing" ||
    !["quest", "staging"].includes(s.phase) ||
    s.choice ||
    q.test ||
    s.queue.some((e) => e.kind === "wainContinue") ||
    s.stageRevealing ||
    s.pendingQuestDefeat
  )
    return true;
  if (s.progress >= wainridersGoal(s)) beginTest(s);
  return true;
}
function finishTest(s: GameState, passed: boolean) {
  const q = s.wainriders!,
    t = q.test!;
  delete q.test;
  if (t.travel) {
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx(passed ? "draw" : "wainRandomDiscard", { value: 1, player }),
      ),
    );
    return;
  }
  q.progress[t.stage - 1] = s.progress;
  if (t.stage === 6 && !passed) {
    s.progress = 0;
    q.progress[5] = 0;
    return;
  }
  q.completed++;
  if (!q.defeated.includes(t.stage - 1)) q.defeated.push(t.stage - 1);
  q.challengerSteps++;
  s.stage = (q.challengerSteps % 6) + 1;
  q.currentQuest = WAINRIDERS_QUESTS[s.stage - 1].code;
  s.progress = q.progress[s.stage - 1] + (passed ? t.excess : 0);
  if (q.challengerSteps === 12) {
    win(s);
    s.reason = "The challengers complete two circuits and win their freedom.";
    return;
  }
  log(
    s,
    `The Challengers advance to ${WAINRIDERS_QUESTS[s.stage - 1].name} (circuit ${Math.floor(q.challengerSteps / 6) + 1}).`,
    "good",
  );
  const failures: Effect[] = [];
  if (!passed) {
    if (t.stage === 1)
      failures.push(
        ...playerOrder(s).map((player) => fx("wainRandomDiscard", { player })),
      );
    if (t.stage === 2)
      failures.push(
        ...allCharacters(s).map((u) =>
          fx("damage", {
            target: u.id,
            value: 1,
            player: ownerOf(s, u),
            text: encodeDamageContext({ questEffect: true }),
          }),
        ),
      );
    if (t.stage === 3)
      failures.push(
        ...playerOrder(s).map((player) => fx("wainDiscardAlly", { player })),
      );
    if (t.stage === 4)
      failures.push(
        ...Array.from({ length: playerOrder(s).length >= 3 ? 2 : 1 }, () =>
          fx("reveal", { player: firstPlayer(s) }),
        ),
      );
    if (t.stage === 5)
      failures.push(
        fx("wainDamage", {
          value: 2 * playerOrder(s).length,
          player: firstPlayer(s),
        }),
      );
  }
  const before = s.queue.length;
  const code = WAINRIDERS_QUESTS[t.stage - 1].code,
    attachments = s.questAttachments?.[code] ?? [];
  collectorQuestDefeated(s, code, attachments);
  haradPlayerQuestDefeated(s, code, attachments);
  const responses = s.queue.splice(0, s.queue.length - before);
  prepend(
    s,
    ...failures,
    fx("wainContinue", { player: firstPlayer(s) }),
    ...responses,
  );
}
export function wainridersReplaceDamage(
  s: GameState,
  u: Unit,
  value: number,
  ctx: DamageContext,
) {
  if (u.code !== W.champion || ctx.bypassWainriders || ctx.cost || value <= 0)
    return false;
  const loc = allActiveLocations(s).find(
    (l) => l.code === W.narrow && !l.blanked,
  );
  if (!loc) return false;
  prepend(
    s,
    fx("wainNarrow", {
      target: u.id,
      source: loc.id,
      value,
      text: encodeDamageContext({ ...ctx, bypassWainriders: true }),
      player: firstPlayer(s),
    }),
  );
  return true;
}
export function wainridersEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (shadowEastEncounter(s, code, replay, fromReveal)) return true;
  if (
    ![W.driver, W.chariot, W.cunning, W.plains, W.weary, W.fatigue].includes(
      code,
    )
  )
    return false;
  if (!replay && card(code).type_code === "treachery" && code !== W.chariot)
    s.encounterDiscard.push(code);
  if (code === W.chariot) {
    if (!fromReveal) {
      if (!replay) s.encounterDiscard.push(code);
      return true;
    }
    const physical = make(s, code);
    s.wainriders!.resolving.push(physical);
    prepend(
      s,
      fx("wainChariot", { source: physical.id, player: firstPlayer(s) }),
    );
  } else if (fromReveal) {
    if (code === W.driver) {
      const u = [...s.staging].reverse().find((u) => u.code === code);
      if (u)
        prepend(s, fx("wainDriver", { target: u.id, player: firstPlayer(s) }));
    } else if (code === W.cunning)
      prepend(s, fx("wainCunning", { player: firstPlayer(s) }));
    else if (code === W.fatigue)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("plainsFatigue", { player })),
      );
    else
      s.wainriders!.phaseEffects.push({
        round: s.round,
        phase: wainridersPhase(s),
        plains: code === W.plains ? 1 : 0,
        weary: code === W.weary ? 1 : 0,
      });
  }
  return true;
}
export function wainridersShadow(s: GameState, code: string) {
  if (shadowEastShadow(s, code)) return true;
  const c = s.combat;
  if (!c) return false;
  if (code === W.veteran) {
    if (wainridersAhead(s)) c.attackBonus += 2;
  } else if (code === W.driver) c.wainReturnOnKill = true;
  else if (code === W.cunning) {
    c.attackBonus++;
    c.wainDamageOnKill = (c.wainDamageOnKill ?? 0) + 2;
  } else if (code === W.weary) {
    if (c.defenderId)
      prepend(
        s,
        fx("damage", {
          target: c.defenderId,
          value: 1,
          player: c.attackPlayer ?? activeSeat(s),
        }),
      );
  } else if (code === W.fatigue)
    prepend(
      s,
      fx("plainsFatigueShadow", { player: c.attackPlayer ?? activeSeat(s) }),
    );
  else return false;
  return true;
}
export function wainridersEffect(s: GameState, e: Effect): boolean {
  if (shadowEastEffect(s, e) || plainsEffect(s, e)) return true;
  if (
    !s.wainriders ||
    !e.kind.startsWith("wain") ||
    e.kind.startsWith("wainPlayer")
  )
    return false;
  const q = s.wainriders,
    player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "wainSetup":
      q.initialized = true;
      prepend(
        s,
        fx("wainSetupChoose", {
          value: 1,
          player: playerOrder(s)[1] ?? firstPlayer(s),
        }),
      );
      break;
    case "wainSetupChoose": {
      const n = e.value ?? 1,
        ps = playerOrder(s);
      if (n >= ps.length) {
        shuffle(s, s.encounterDeck);
        break;
      }
      const choices = [
        ...new Set(
          s.encounterDeck.filter(
            (c) =>
              card(c).type_code === "location" && !q.setupChosen.includes(c),
          ),
        ),
      ];
      choose(
        s,
        "Wainrider Camp · Add a different location",
        choices.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("wainSetupTake", { code, player: ps[n] }),
            fx("wainSetupChoose", { value: n + 1, player: ps[n + 1] ?? ps[n] }),
          ],
        })),
      );
      break;
    }
    case "wainSetupTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        q.setupChosen.push(e.code!);
        add(s, s.encounterDeck.splice(i, 1)[0]);
      }
      break;
    }
    case "wainTest": {
      const t = q.test;
      if (!t) break;
      const choices = ready(s, firstPlayer(s));
      if (!choices.length) {
        q.lastTest = {
          cards: [],
          matches: 0,
          required: t.required,
          passed: false,
        };
        finishTest(s, false);
        break;
      }
      choose(
        s,
        `Racing ${t.stat} test · ${t.required} ${t.result.toUpperCase()} result${t.required === 1 ? "" : "s"}`,
        choices.map((u) => ({
          ...option(u, [
            fx("wainTestCommit", { target: u.id, player: firstPlayer(s) }),
          ]),
          label: `${name(u)} · Exhaust to discard ${stats(s, u)[t.stat]} encounter cards`,
        })),
      );
      break;
    }
    case "wainTestCommit": {
      const t = q.test;
      if (!t || !u || !ready(s, firstPlayer(s)).some((x) => x.id === u.id))
        break;
      const value = stats(s, u)[t.stat];
      if (!exhaustCharacter(s, u)) break;
      const cards = s.encounterDeck.splice(0, value);
      s.encounterDiscard.push(...cards);
      const matches = cards.filter((c) =>
        [t.result, "wild"].includes(racingResult(c) ?? ""),
      ).length;
      q.lastTest = {
        cards,
        matches,
        required: t.required,
        passed: matches >= t.required,
      };
      log(
        s,
        `Racing test: ${matches}/${t.required} ${t.result} results — ${matches >= t.required ? "passed" : "failed"}.`,
        matches >= t.required ? "good" : "danger",
      );
      prepend(
        s,
        fx("wainTestFinish", {
          flag: matches >= t.required,
          player: firstPlayer(s),
        }),
      );
      break;
    }
    case "wainTestFinish":
      if (q.test) finishTest(s, !!e.flag);
      break;
    case "wainContinue":
      wainridersAdvance(s);
      break;
    case "wainTravelTest":
      beginTest(s, true);
      break;
    case "wainDamage":
      wainridersDamage(s, e.value ?? 0);
      break;
    case "wainQuestEnd": {
      const x = s.staging
        .filter((u) => card(u.code).type_code === "enemy")
        .reduce((n, u) => n + threatOf(s, u), 0);
      if (live(s, W.wainriders).length) wainridersDamage(s, x);
      q.progress[s.stage - 1] = s.progress;
      for (const i of q.defeated) q.progress[i] = 0;
      q.defeated = [];
      s.progress = q.progress[s.stage - 1];
      break;
    }
    case "wainRandomDiscard":
      if (s.hand.length) {
        const v = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, v.id, { encounterEffect: true });
      }
      break;
    case "wainDiscardAlly":
      choose(
        s,
        "The Turnaround · Discard an ally",
        s.allies.map((u) =>
          option(u, [fx("wainDiscardAllyTake", { target: u.id, player })]),
        ),
      );
      break;
    case "wainDiscardAllyTake":
      if (u) discardCharacter(s, u);
      break;
    case "wainDriver":
      if (u)
        choose(s, "Chariot Driver · Damage or an attack", [
          {
            id: "damage",
            label: "Place 3 damage on The Wainriders' stage",
            effects: [fx("wainDamage", { value: 3, player })],
          },
          {
            id: "attack",
            label: "Chariot Driver attacks the first player",
            effects: [
              fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
            ],
          },
        ]);
      break;
    case "wainCunning": {
      const c = champion(s);
      q.cunning = 0;
      prepend(
        s,
        ...(c && engaged(s)
          ? playerOrder(s).map((player) =>
              fx("immediateAttack", { target: c.id, player }),
            )
          : []),
        fx("wainCunningDone", { player: firstPlayer(s) }),
      );
      break;
    }
    case "wainCunningDone": {
      const c = champion(s);
      if (q.cunning === 0 && c) wainridersDamage(s, threatOf(s, c));
      delete q.cunning;
      break;
    }
    case "wainChariot": {
      const choices = shadowEastEnemies(s).filter(
        (u) =>
          !card(u.code).is_unique &&
          shadowEastTrait(u, "Easterling") &&
          !u.attachments.some((a) => a.code === W.chariot),
      );
      if (choices.length)
        choose(
          s,
          "Wainrider Chariot · Attach to an Easterling",
          choices.map((u) =>
            option(u, [
              fx("wainChariotTake", { target: u.id, source: e.source, player }),
            ]),
          ),
        );
      else {
        const i = q.resolving.findIndex((u) => u.id === e.source);
        if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      }
      break;
    }
    case "wainChariotTake": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const physical = q.resolving.splice(i, 1)[0];
        if (u) shadowEastAttach(s, u, physical.code, physical);
        else s.encounterDiscard.push(physical.code);
      }
      break;
    }
    case "wainNarrow": {
      const loc = get(s, e.source);
      const normal = fx("damage", {
        target: e.target,
        value: e.value,
        text: e.text,
        player,
      });
      if (
        !loc ||
        loc.blanked ||
        !allActiveLocations(s).some((l) => l.id === loc.id)
      ) {
        prepend(s, normal);
        break;
      }
      choose(s, "Narrow Pass · Replace damage to the champion?", [
        {
          id: "remove",
          label: `Remove up to ${e.value} damage from The Wainriders' stage`,
          effects: [fx("wainDamage", { value: -(e.value ?? 0), player })],
        },
        {
          id: "skip",
          label: "Place the damage on Wainrider Champion",
          effects: [normal],
        },
      ]);
      break;
    }
    case "wainCrowded": {
      const choices = (["deck", "discard"] as const).flatMap((p) =>
        [
          ...new Set(
            (p === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (c) => card(c).type_code === "enemy",
            ),
          ),
        ].map((code) => ({
          id: `${p}:${code}`,
          code,
          label: `${card(code).name} · ${p}`,
          effects: [fx("wainCrowdedTake", { code, text: p, player })],
        })),
      );
      if (choices.length) choose(s, "Crowded Track · Add an enemy", choices);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "wainCrowdedTake": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) add(s, pile.splice(i, 1)[0]);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "wainTravelExhaust":
      choose(
        s,
        "Rocky Outcrop · Exhaust a hero",
        ready(s, firstPlayer(s))
          .filter((u) =>
            seatView(s, firstPlayer(s)).heroes.some((h) => h.id === u.id),
          )
          .map((u) =>
            option(u, [
              fx("exhaust", { target: u.id, player: firstPlayer(s) }),
            ]),
          ),
      );
      break;
    default:
      return false;
  }
  return true;
}
export const WAINRIDERS_HOOKS: Batch4ScenarioHooks = {
  ...SHADOW_EAST_SHARED_HOOKS,
  setup: setupWainriders,
  openingHandsKept: (s) => {
    if (s.wainriders!.initialized) return false;
    prepend(s, fx("wainSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance: wainridersAdvance,
  stageInfo: wainridersStageInfo,
  progress: (s, n, u) =>
    u.code === mainQuestCode(s) && activePlayerAbilityCode(s) ? 0 : n,
  stats: (s, u) => {
    const a = shadowEastStats(s, u);
    return {
      ...a,
      attack:
        a.attack +
        u.attachments.filter((a) => a.code === W.chariot && !a.blanked).length,
      defense:
        a.defense + (u.code === W.champion ? 2 * playerOrder(s).length : 0),
      will: u.exhausted ? -phases(s).reduce((n, m) => n + m.weary, 0) : 0,
    };
  },
  threatBonus: (s, u) =>
    shadowEastThreatBonus(s, u) +
    (u.code === W.champion ? 2 * playerOrder(s).length : 0) +
    (!u.blanked && u.code === W.veteran && wainridersAhead(s) ? 2 : 0) +
    (!u.blanked && u.code === W.crowded
      ? characters(s, firstPlayer(s)).length
      : 0) +
    (u.code === W.plains ? 2 * phases(s).reduce((n, m) => n + m.plains, 0) : 0),
  immune: (_s, u) => u.code === W.champion,
  indestructible: (_s, u) => u.code === W.champion,
  cannotLeave: (s, u) =>
    u.code === W.champion ||
    (!u.blanked &&
      u.code === W.veteran &&
      wainridersAhead(s) &&
      s.staging.some((x) => x.id === u.id)),
  cannotEngage: (s, u) =>
    u.code === W.champion ||
    (!u.blanked && u.code === W.veteran && wainridersAhead(s)),
  consideredEngaged: (s, u, p) =>
    u.code === W.champion &&
    !u.blanked &&
    engaged(s) &&
    playerOrder(s).includes(p),
  skipShadowDeal: (_s, u) => u.code === W.champion,
  combatBegin: (s) => {
    shadowEastCombatBegin(s);
    const n = shadowEastEnemies(s).filter(
      (u) => u.code === W.racer && !u.blanked,
    ).length;
    if (n) prepend(s, fx("heirsArchery", { value: n, player: firstPlayer(s) }));
  },
  replaceDamage: wainridersReplaceDamage,
  damageAmount: shadowEastDamageAmount,
  damageDealt: (s, u, _n, ctx) => {
    if (!ctx.combatDamage || !ctx.enemyId) return;
    const enemy = get(s, ctx.enemyId);
    if (enemy?.attachments.some((a) => a.code === W.chariot && !a.blanked)) {
      const excess = Math.max(0, u.damage - stats(s, u).health);
      if (excess) wainridersDamage(s, excess);
    }
  },
  characterDestroyed: (s, _u, ctx) => {
    const c = s.combat;
    if (!ctx.combatDamage || !c || ctx.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    if (enemy?.code === W.racer && !enemy.blanked && !c.wainRacerKilled) {
      c.wainRacerKilled = true;
    }
    if (c.wainReturnOnKill) c.returnToStaging = true;
    if (c.wainDamageOnKill) {
      prepend(
        s,
        fx("wainDamage", { value: c.wainDamageOnKill, player: firstPlayer(s) }),
      );
      delete c.wainDamageOnKill;
    }
  },
  attackFinished: (s, c) =>
    c.wainRacerKilled
      ? [fx("wainDamage", { value: 2, player: firstPlayer(s) })]
      : [],
  enemyAttackStarted: (s, u, p) => {
    SHADOW_EAST_SHARED_HOOKS.enemyAttackStarted?.(s, u, p);
    if (u.code === W.champion && s.wainriders!.cunning !== undefined)
      s.wainriders!.cunning!++;
  },
  cannotPlayerReady: (s) => live(s, W.outcrop).length > 0,
  cannotReady: plainsCannotReady,
  refreshCharacters: plainsRefreshCharacters,
  sideDefeated: plainsSideDefeated,
  travelProblem: (s, u) =>
    !u.blanked &&
    u.code === W.outcrop &&
    !ready(s, firstPlayer(s)).some((u) =>
      seatView(s, firstPlayer(s)).heroes.some((h) => h.id === u.id),
    )
      ? "Rocky Outcrop requires a ready hero controlled by the first player."
      : null,
  travelEffects: (s, u) =>
    u.blanked
      ? undefined
      : u.code === W.ravine
        ? [fx("wainTravelTest", { player: firstPlayer(s) })]
        : u.code === W.plains
          ? playerOrder(s).map((player) => fx("threat", { value: 2, player }))
          : u.code === W.outcrop
            ? [fx("wainTravelExhaust", { player: firstPlayer(s) })]
            : undefined,
  travelEntered: (s, u) => {
    if (u.code === W.crowded && !u.blanked)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("wainCrowded", { player })),
      );
  },
  endQuest: (s) => prepend(s, fx("wainQuestEnd", { player: firstPlayer(s) })),
  roundEnd: shadowEastRoundEnd,
  revealedSurge: (s, c) =>
    shadowEastRevealedSurge(s, c) || (c === W.racer && wainridersAhead(s)),
  encounter: wainridersEncounter,
  shadow: wainridersShadow,
  effect: wainridersEffect,
  sharedEffect: (e) =>
    shadowEastSharedEffect(e) ||
    ["wainDamage", "wainContinue", "wainQuestEnd", "wainCunningDone"].includes(
      e.kind,
    ),
};
