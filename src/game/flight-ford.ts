import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  enemyAttackPrevented,
  followFirstPlayer,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
} from "./core";
import {
  damage,
  depositInFlightEncounterCards,
  destroy,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { syncAttachmentText } from "./attachment-text";
import { mainQuestUnit } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import { surgeEffects } from "./surge";
import {
  lotrSagaCheck,
  oneRing,
  ringBearer,
  ringBearerFollowsFirstPlayer,
} from "./lotr-saga";
import {
  huntedAttackFinished,
  huntedEffect,
  huntedShadow,
  huntedTreachery,
  isNazgulCard,
  pathlessQuestBonus,
  who,
} from "./black-riders-hunted";
import {
  blackSteedRoundEnd,
  nazgulAttackBonus,
  nazgulAttackStarted,
  nazgulCannotAttach,
  nazgulCannotDefend,
  nazgulEffect,
  nazgulEngagementBonus,
  nazgulImmune,
  nazgulNoDamage,
  nazgulShadow,
  nazgulTreachery,
} from "./black-riders-nazgul";
import {
  FF,
  FLIGHT_FORD_QUESTS,
  FLIGHT_FORD_RECIPES,
  RING_BEARER_LIFE,
  flightFordStageInfo,
} from "./flight-ford-support";
export * from "./flight-ford-support";

const TREACHERIES: readonly string[] = [
  FF.uponUs,
  FF.stricken,
  FF.nine,
  FF.pain,
  FF.weight,
  FF.fear,
  FF.eaten,
  FF.panicked,
  FF.overcome,
  FF.steed,
  FF.gale,
  FF.cry,
  FF.terror,
  FF.blade,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const isEnemyUnit = (u: Unit) => card(u.code).type_code === "enemy";
const isHeroUnit = (u: Unit) => card(u.code).type_code === "hero";
const isCharacter = (u: Unit) =>
  ["hero", "ally"].includes(card(u.code).type_code);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const wounded = (u: Unit) =>
  u.attachments.some((a) => a.code === FF.wound && !a.blanked);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
/** Pain Assailed Him: the Ring-bearer's statistics are 0 this round. */
const painful = (s: GameState, u: Unit) =>
  !!s.flightFord &&
  s.flightFord.painRound === s.round &&
  ringBearer(s)?.id === u.id;
const combatPhase = (s: GameState) => ["defense", "attack"].includes(s.phase);
function discardRandom(s: GameState, p: number, count: number, why: string) {
  forOwner(s, p, () => {
    const discarded: string[] = [];
    for (let i = 0; i < count && s.hand.length; i++) {
      const hand = s.hand[Math.floor(random(s) * s.hand.length)];
      discarded.push(card(hand.code).name);
      discardHandCard(s, hand.id, { encounterEffect: true });
    }
    if (discarded.length)
      log(
        s,
        `${why}: ${who(s, p)} discard${s.table ? "s" : ""} ${discarded.join(" and ")} at random.`,
        "danger",
      );
  });
}
/** Pass the first player token to the next player; the Ring-bearer follows it. */
function passFirstPlayer(s: GameState) {
  if (!s.table) return;
  const order = globalPlayerOrder(s);
  if (order.length < 2) return;
  s.table.first = order[1 % order.length] ?? 0;
  followFirstPlayer(s);
  ringBearerFollowsFirstPlayer(s);
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupFlightFord(s: GameState) {
  const r = FLIGHT_FORD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const staging = section("sharedStagingArea");
  // 1 Fell Rider per player; the other copies stay in the encounter deck.
  const riders = staging.filter((c) => c === FF.fell);
  const x = playerOrder(s).length;
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...riders.slice(x),
  ]);
  for (const code of staging.filter((c) => c === FF.bridge))
    s.staging.push(make(s, code));
  for (const code of riders.slice(0, x)) s.staging.push(make(s, code));
  const bearer = ringBearer(s);
  if (bearer) {
    const wound = make(s, FF.wound);
    bearer.attachments.push({ id: wound.id, code: FF.wound, exhausted: false });
  }
  s.flightFord = {
    currentQuest: FF.pursued,
    advancing: false,
    life: RING_BEARER_LIFE,
    setAside: section("sharedSetAside"),
    burdens: shuffle(s, section("sharedEncounterDeck2")),
    resolving: [],
    extraReveals: 0,
    blank: null,
    painRound: null,
  };
  log(
    s,
    `Pursued by the Enemy: An Evil Wound is attached to the Ring-bearer, whose life is set at ${RING_BEARER_LIFE}. The Last Bridge and ${x} Fell Rider${x === 1 ? "" : "s"} wait in the staging area; Ford of Bruinen and The Witch-king are set aside.`,
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.flightFord;
  if (!q) return false;
  const goal = flightFordStageInfo(s)?.quest ?? 0;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    goal <= 0 ||
    s.progress < goal
  )
    return true;
  // 1B: the players cannot advance unless The Last Bridge is in the victory display.
  if (
    s.stage === 1 &&
    stageLive(s) &&
    !(s.victoryCards ?? []).includes(FF.bridge)
  )
    return true;
  if (s.stage === 2) {
    win(
      s,
      "Race to Rivendell is defeated: the Ring-bearer reaches the Ford of Bruinen and Rivendell.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("ffDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
/** Reduce the Ring-bearer's life; the players lose when it reaches zero. */
function reduceLife(s: GameState, amount: number, why: string) {
  const q = s.flightFord;
  if (!q || amount <= 0 || s.status !== "playing") return;
  q.life = Math.max(0, q.life - amount);
  log(
    s,
    `${why}: the Ring-bearer's life is reduced by ${amount} (${q.life} left).`,
    "danger",
  );
  if (q.life > 0) return;
  s.status = "lost";
  s.reason =
    "The Ring-bearer's life has reached zero. The players lose the game.";
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, s.reason, "danger");
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.flightFord;
  if (!q || !TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const player = activeSeat(s);
  const u = make(s, code);
  q.resolving.push(u);
  prepend(
    s,
    fx("ffTreachery", { code, source: u.id, player }),
    fx("ffTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.flightFord) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case FF.fear:
      forOwner(s, p, () => raiseThreat(s, 3, "encounter"));
      log(
        s,
        `Fear of Discovery: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by 3.`,
        "danger",
      );
      return true;
    case FF.eaten:
      if (c.defenderId && get(s, c.defenderId)) {
        log(
          s,
          "Eaten Alive!: the defending character takes 1 damage.",
          "danger",
        );
        forOwner(s, p, () => damage(s, c.defenderId!, 1, {}));
      }
      return true;
    case FF.panicked:
      prepend(s, fx("ffPanickedShadow", { player: p }));
      return true;
    case FF.overcome:
      discardRandom(s, p, 1, "Overcome by Terror");
      return true;
    case FF.uponUs:
      c.ffUponUs = true;
      return true;
    case FF.pain:
      c.ffPain = true;
      return true;
    case FF.nine:
      c.spReturn = true;
      return true;
  }
  return nazgulShadow(s, code) || huntedShadow(s, code);
}
function treachery(s: GameState, code: string, source: string, p: number) {
  const q = s.flightFord!;
  const first = firstPlayer(s);
  switch (code) {
    case FF.uponUs: {
      const attackers = allEngaged(s).filter(
        (u) =>
          isEnemyUnit(u) &&
          !enemyAttackPrevented(seatView(s, ownerOf(s, u)), u, ownerOf(s, u)),
      );
      if (!attackers.length) {
        log(
          s,
          "The Enemy is Upon Us!: no engaged enemy attacks. It gains surge.",
        );
        prepend(s, ...surgeEffects(code));
        return;
      }
      log(
        s,
        "The Enemy is Upon Us!: each engaged enemy makes an immediate attack.",
        "danger",
      );
      prepend(
        s,
        ...attackers.map((u) =>
          fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
        ),
      );
      return;
    }
    case FF.stricken: {
      const options: Option[] = [
        ...(q.burdens.length
          ? [
              {
                id: "burden",
                label:
                  "Shuffle the top card of the burden deck into the encounter deck and reveal an additional encounter card",
                effects: [fx("ffStrickenBurden", { player: p })],
              },
            ]
          : []),
        {
          id: "end",
          label:
            "Raise each player's threat by 3 and immediately end the quest phase (do not resolve the quest)",
          effects: [fx("ffStrickenEnd", { player: p })],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return;
      }
      forOwner(s, p, () =>
        choose(s, `Stricken Dumb${seatLabel(s, p)}`, options),
      );
      return;
    }
    case FF.nine: {
      q.blank = { round: s.round, ids: globalCharacters(s).map((u) => u.id) };
      syncAttachmentText(s);
      log(
        s,
        "The Nine are Abroad: the text box of each character in play is blank until the end of the round.",
        "danger",
      );
      if (s.staging.some((u) => isNazgulCard(u.code))) {
        log(s, "A Nazgûl enemy is in the staging area: it gains surge.");
        prepend(s, ...surgeEffects(code));
      }
      return;
    }
    case FF.pain:
      prepend(s, fx("ffPain", { player: first }));
      return;
    case FF.weight: {
      const bearer = ringBearer(s);
      if (bearer)
        prepend(s, fx("ffAttach", { target: bearer.id, source, player: p }));
      return;
    }
    case FF.fear: {
      const bearer = ringBearer(s);
      const reveal = fx("reveal", { player: first });
      if (!bearer || bearer.exhausted) {
        log(s, "Fear of Discovery: an additional encounter card is revealed.");
        prepend(s, reveal);
        return;
      }
      choose(s, "Fear of Discovery · The first player chooses", [
        {
          id: "exhaust",
          code: bearer.code,
          label: "Exhaust the Ring-bearer",
          effects: [fx("ffExhaust", { target: bearer.id, player: first })],
        },
        {
          id: "reveal",
          label: "Reveal an additional encounter card",
          effects: [reveal],
        },
      ]);
      return;
    }
    case FF.eaten:
      prepend(
        s,
        fx("ffEaten", { value: playerOrder(s).length, player: first }),
      );
      return;
    case FF.panicked:
      prepend(s, fx("ffPanicked", { player: first }));
      return;
    case FF.overcome:
      prepend(s, fx("ffOvercome", { player: first }));
      return;
    default:
      if (
        !nazgulTreachery(s, code, p, (target) =>
          fx("ffAttach", { target, source, player: p }),
        )
      )
        huntedTreachery(s, code, p);
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function flightFordEffect(s: GameState, e: Effect): boolean {
  const q = s.flightFord;
  if (!q || !e.kind.startsWith("ff")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "ffDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("ffNextStage", { player: first }));
      return true;
    }
    case "ffNextStage": {
      q.advancing = false;
      if (s.stage >= FLIGHT_FORD_QUESTS.length) return true;
      s.stage += 1;
      q.currentQuest = FLIGHT_FORD_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      prepend(s, fx("ffRace", { player: first }));
      return true;
    }
    case "ffRace": {
      const added: Unit[] = [];
      for (const code of [FF.ford, FF.witchKing]) {
        const i = q.setAside.indexOf(code);
        if (i < 0) continue;
        q.setAside.splice(i, 1);
        added.push(make(s, code));
      }
      for (const x of added) {
        s.staging.push(x);
        if (isEnemyUnit(x)) enemyAddedToStaging(s, x);
      }
      if (added.length)
        log(
          s,
          `Race to Rivendell: ${added.map((x) => name(x)).join(" and ")} ${added.length === 1 ? "is" : "are"} added to the staging area.`,
          "chapter",
        );
      return true;
    }
    case "ffTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id, p);
      return true;
    }
    case "ffTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "ffAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u) return true;
      const held = q.resolving.splice(i, 1)[0];
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "ffLife":
      reduceLife(
        s,
        e.value ?? 1,
        e.code ? card(e.code).name : "The Morgul-wound",
      );
      return true;
    case "ffPain":
      reduceLife(s, 1, "Pain Assailed Him");
      if (s.status !== "playing") return true;
      q.painRound = s.round;
      log(
        s,
        "Pain Assailed Him: the Ring-bearer's willpower, attack and defense are 0 until the end of the round.",
        "danger",
      );
      return true;
    case "ffStrickenBurden": {
      const burden = q.burdens.shift();
      if (burden) {
        s.encounterDeck.push(burden);
        shuffle(s, s.encounterDeck);
        log(
          s,
          `Stricken Dumb: ${card(burden).name} is shuffled from the burden deck into the encounter deck, and an additional encounter card is revealed.`,
          "danger",
        );
      }
      prepend(s, fx("reveal", { player: p }));
      return true;
    }
    case "ffStrickenEnd":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 3, "encounter"));
      log(
        s,
        "Stricken Dumb: each player raises their threat by 3 and the quest phase ends without resolving the quest.",
        "danger",
      );
      if (s.phase === "quest") {
        s.queue = s.queue.filter(
          (x) => !["reveal", "khazadStagingEnd", "questReady"].includes(x.kind),
        );
        s.queue.push(fx("finishQuestPhase", { player: first }));
      }
      return true;
    case "ffQuestBegin": {
      q.extraReveals = 0;
      const bearer = ringBearer(s);
      const weights = (bearer?.attachments ?? []).filter(
        (a) => a.code === FF.weight && !a.blanked,
      );
      prepend(s, ...weights.map(() => fx("ffWeight", { player: first })));
      return true;
    }
    case "ffWeight": {
      const ring = oneRing(s);
      const extra = fx("ffWeightReveal", { player: first });
      if (!ring || ring.exhausted) {
        prepend(s, extra);
        return true;
      }
      choose(
        s,
        "Weight of the Ring · The first player chooses",
        [
          {
            id: "exhaust",
            code: ring.code,
            label: "Exhaust The One Ring",
            effects: [fx("ffExhaustRing", { code: FF.weight, player: first })],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card this phase",
            effects: [extra],
          },
        ],
        "Forced: at the beginning of each quest phase.",
      );
      return true;
    }
    case "ffWeightReveal":
      q.extraReveals += 1;
      log(
        s,
        "Weight of the Ring: an additional encounter card will be revealed this phase.",
        "danger",
      );
      return true;
    case "ffExhaustRing": {
      const ring = oneRing(s);
      if (ring && !ring.exhausted) {
        ring.exhausted = true;
        log(
          s,
          `${e.code ? card(e.code).name : "The One Ring"}: The One Ring is exhausted.`,
          "danger",
        );
      }
      return true;
    }
    case "ffExhaust":
      if (u && !u.exhausted) {
        exhaustCharacter(s, u);
        log(s, `Fear of Discovery: ${name(u)} is exhausted.`, "danger");
      }
      return true;
    case "ffEaten": {
      const n = e.value ?? 0;
      const heroes = seatView(s, first).heroes;
      if (n <= 0 || !heroes.length) return true;
      forOwner(s, first, () =>
        choose(
          s,
          `Eaten Alive! · Deal 1 damage to a hero you control (${n} to deal)${seatLabel(s, first)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${wounded(h) ? " · reduces the Ring-bearer's life" : ""}`,
            effects: [
              fx("ffEatenDamage", { target: h.id, player: first }),
              fx("ffEaten", { value: n - 1, player: first }),
            ],
          })),
          "Deal X damage divided among the heroes the first player controls.",
        ),
      );
      return true;
    }
    case "ffEatenDamage":
      if (u) forOwner(s, p, () => damage(s, u.id, 1, {}));
      return true;
    case "ffPanicked":
      forOwner(s, first, () => raiseThreat(s, 3, "encounter"));
      log(
        s,
        `Panicked: ${who(s, first)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by 3${s.table ? " and passes the first player token" : ""}.`,
        "danger",
      );
      passFirstPlayer(s);
      return true;
    case "ffPanickedShadow": {
      const ready = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (x) => !x.exhausted,
      );
      if (!ready.length) return true;
      if (ready.length === 1) {
        prepend(
          s,
          fx("ffExhaustCharacter", { target: ready[0].id, player: p }),
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Panicked · Exhaust a character you control${seatLabel(s, p)}`,
          ready.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("ffExhaustCharacter", { target: x.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "ffExhaustCharacter":
      if (u && !u.exhausted) {
        forOwner(s, p, () => exhaustCharacter(s, u));
        log(s, `Panicked: ${name(u)} is exhausted.`, "danger");
      }
      return true;
    case "ffOvercome": {
      const ring = oneRing(s);
      if (ring && !ring.exhausted) {
        ring.exhausted = true;
        log(s, "Overcome by Terror: The One Ring is exhausted.", "danger");
      } else discardRandom(s, first, 2, "Overcome by Terror");
      return true;
    }
    case "ffFellRider": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      choose(
        s,
        "Fell Rider · The first player chooses",
        [
          {
            id: "engage",
            code: u.code,
            label: `Engage ${name(u)}`,
            effects: [fx("ffFellEngage", { target: u.id, player: first })],
          },
          {
            id: "life",
            label: "Reduce the Ring-bearer's life by 1",
            effects: [fx("ffLife", { value: 1, code: FF.fell, player: first })],
          },
        ],
        "Forced: at the beginning of the encounter phase, while Fell Rider is in the staging area.",
      );
      return true;
    }
    case "ffFellEngage":
      if (u && s.staging.some((x) => x.id === u.id)) {
        forOwner(s, first, () => engage(s, u));
        log(s, `Fell Rider engages ${who(s, first)}.`, "danger");
      }
      return true;
    case "ffBridgeBurden": {
      const burden = q.burdens.shift();
      if (!burden) {
        log(s, "The Last Bridge: the burden deck is empty.");
        return true;
      }
      log(
        s,
        `The Last Bridge: the first player reveals ${card(burden).name} from the burden deck.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", {
          code: burden,
          revealOrigin: "encounter",
          player: first,
        }),
      );
      return true;
    }
    case "ffFordReveal":
      log(
        s,
        "Ford of Bruinen: the first player reveals the top card of the encounter deck to travel there.",
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
    case "ffFordDiscard": {
      const enemies = allEngaged(s).filter(isEnemyUnit);
      if (enemies.length)
        log(
          s,
          `Ford of Bruinen: ${enemies.map((x) => name(x)).join(", ")} ${enemies.length === 1 ? "is" : "are"} swept away by the flood.`,
          "good",
        );
      for (const x of enemies) destroy(s, x, false);
      return true;
    }
    case "ffUponUsProgress": {
      const removed = removeCurrentQuestProgress(s, Number.MAX_SAFE_INTEGER);
      log(
        s,
        `The Enemy is Upon Us!: a character was destroyed; ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest.`,
        "danger",
      );
      return true;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

function check(s: GameState) {
  const q = s.flightFord;
  if (!q) return;
  lotrSagaCheck(s);
}
function attackFinished(s: GameState, combat: Combat, skipped = false) {
  const effects = huntedAttackFinished(s, combat, skipped);
  if (!s.flightFord || skipped || !combat.ffDestroyed) return effects;
  const p = combat.attackPlayer ?? firstPlayer(s);
  if (combat.ffUponUs) effects.push(fx("ffUponUsProgress", { player: p }));
  if (combat.ffPain)
    effects.push(fx("ffLife", { value: 1, code: FF.pain, player: p }));
  return effects;
}

export const FLIGHT_FORD_HOOKS: Batch4ScenarioHooks = {
  setup: setupFlightFord,
  advance,
  stageInfo: flightFordStageInfo,
  check,
  encounter,
  shadow,
  questBegin: (s) =>
    s.flightFord ? [fx("ffQuestBegin", { player: firstPlayer(s) })] : [],
  extraStagingReveals: (s) => s.flightFord?.extraReveals ?? 0,
  encounterBegin: (s) => {
    if (!s.flightFord) return;
    const riders = s.staging.filter((u) => live(u, FF.fell));
    prepend(
      s,
      ...riders.map((u) =>
        fx("ffFellRider", { target: u.id, player: firstPlayer(s) }),
      ),
    );
  },
  stats: (s, u) => {
    if (!s.flightFord) return {};
    if (isEnemyUnit(u)) return { attack: nazgulAttackBonus(s, u) };
    const camp = isHeroUnit(u) && activeIs(s, FF.camp) ? 1 : 0;
    const pain = painful(s, u);
    return {
      will: camp,
      attack: pain ? -1000 : camp,
      defense: pain ? -1000 : camp,
    };
  },
  willpowerOverride: (s, u) => (painful(s, u) ? 0 : undefined),
  // The Last Bridge: X is the number of players in the game.
  threatBonus: (s, u) =>
    s.flightFord && live(u, FF.bridge) ? playerOrder(s).length : 0,
  engagementBonus: (s, u) => (s.flightFord ? nazgulEngagementBonus(s, u) : 0),
  locationQuestBonus: pathlessQuestBonus,
  immune: (s, u) =>
    !!s.flightFord &&
    (live(u, FF.bridge) || live(u, FF.ford) || nazgulImmune(s, u)),
  cannotAttach: (s, u, code) =>
    !!s.flightFord && nazgulCannotAttach(s, u, code),
  cannotDefend: (s, enemy, defender) =>
    !!s.flightFord && nazgulCannotDefend(s, enemy, defender),
  damageAmount: (s, u, amount, context) =>
    s.flightFord && isEnemyUnit(u) && nazgulNoDamage(s, u, context)
      ? 0
      : amount,
  // An Evil Wound: damage to the Ring-bearer reduces the Ring-bearer's life instead.
  replaceDamage: (s, u, amount) => {
    if (!s.flightFord || !wounded(u) || amount <= 0) return false;
    reduceLife(
      s,
      amount,
      `An Evil Wound (${name(u)} would take ${amount} damage)`,
    );
    return true;
  },
  cannotHeal: (s, u) => !!s.flightFord && wounded(u),
  // The Nine are Abroad: the characters' text boxes are blank this round.
  characterBlanked: (s, u) =>
    !!s.flightFord?.blank &&
    s.flightFord.blank.round === s.round &&
    s.flightFord.blank.ids.includes(u.id),
  enemyAttackStarted: (s, enemy, player) => {
    if (s.flightFord) nazgulAttackStarted(s, enemy, player);
  },
  // Ettenmoors: no shadow card for Nazgûl enemies during the combat phase.
  skipShadowDeal: (s, u) =>
    !!s.flightFord && activeIs(s, FF.ettenmoors) && isNazgulCard(u.code),
  shadowCards: (s, u, amount) =>
    s.flightFord &&
    combatPhase(s) &&
    activeIs(s, FF.ettenmoors) &&
    isNazgulCard(u.code)
      ? 0
      : amount,
  locationProgressPlaced: (s, u, amount) => {
    if (s.flightFord && live(u, FF.ettenmoors) && amount > 0)
      prepend(
        s,
        fx("ffLife", { value: 1, code: FF.ettenmoors, player: firstPlayer(s) }),
      );
  },
  travelEffects: (s, u) => {
    if (!s.flightFord || u.blanked) return undefined;
    if (u.code === FF.bridge)
      return [fx("ffBridgeBurden", { player: firstPlayer(s) })];
    if (u.code === FF.ford)
      return [fx("ffFordReveal", { player: firstPlayer(s) })];
    return undefined;
  },
  explored: (s, u) => {
    if (s.flightFord && live(u, FF.ford))
      prepend(s, fx("ffFordDiscard", { player: firstPlayer(s) }));
  },
  roundEnd: (s) =>
    !s.flightFord
      ? []
      : [
          ...(stageLive(s)
            ? [
                fx("ffLife", {
                  value: 1,
                  code: s.flightFord.currentQuest,
                  player: firstPlayer(s),
                }),
              ]
            : []),
          ...blackSteedRoundEnd(s),
        ],
  characterDestroyed: (s, u, context) => {
    if (
      s.flightFord &&
      s.combat &&
      isCharacter(u) &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.ffDestroyed = true;
  },
  attackFinished,
  effect: (s, e) =>
    huntedEffect(s, e) || nazgulEffect(s, e) || flightFordEffect(s, e),
  sharedEffect: (e) =>
    [
      "ffDefeatQuest",
      "ffNextStage",
      "ffRace",
      "ffLife",
      "ffPain",
      "ffStrickenEnd",
      "ffQuestBegin",
      "ffWeightReveal",
      "ffExhaustRing",
      "ffPanicked",
      "ffBridgeBurden",
      "ffFordReveal",
      "ffFordDiscard",
      "ffUponUsProgress",
    ].includes(e.kind),
};
