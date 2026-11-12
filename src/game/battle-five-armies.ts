import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  shuffle,
} from "./core";
import { damage, discardHandCard, engage, questDefeated, win } from "./board";
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
import { hasTrait } from "./expansion-passives";
import { heirsCanSpendResources } from "./heirs-numenor";
import { resolveDoomed } from "./voice-isengard";
import { surgeEffects } from "./surge";
import {
  bagginsBilbo,
  hobbitTreasureDefense,
  hobbitTreasureEffect,
  hobbitTreasureKill,
  isBagginsBilbo,
  loseBilbo,
  spendBaggins,
} from "./hobbit-saga";
import { hobbitRingDefense } from "./hobbit-player-cards";
import {
  WILDERLAND_SHARED_EFFECTS,
  WILDERLAND_TREACHERIES,
  wilderlandAttackFinished,
  wilderlandCharacterDestroyed,
  wilderlandDamageDealt,
  wilderlandEffect,
  wilderlandPenalty,
  wilderlandShadow,
  wilderlandThreatBonus,
  wilderlandTravelEffects,
  wilderlandTravelProblem,
  wilderlandTreachery,
} from "./wilderland";
import {
  BOFA as B,
  BOFA_RECIPES,
  BOFA_RUINS,
  BOFA_STAGES,
  bofaComplete,
  bofaEmptyStages,
  bofaStageInfo,
  bofaStageNumber,
  bofaStageProgress,
  bofaStagesInPlay,
} from "./battle-five-armies-support";
export * from "./battle-five-armies-support";

const typeOf = (code: string) => card(code).type_code;
const isCharacter = (u: Unit) => ["hero", "ally"].includes(typeOf(u.code));
const cardTrait = (code: string, trait: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === trait);
const isGoblin = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(typeOf(u.code)) && hasTrait(u, "Goblin");
const isGoblinCode = (code: string) =>
  typeOf(code) === "enemy" && cardTrait(code, "Goblin");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const bolg = (s: GameState) => s.staging.find((u) => u.code === B.bolg);
const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter((u) => typeOf(u.code) === "enemy"),
  ...allEngaged(s),
];
const stageLabel = (code: string) =>
  `${bofaStageNumber(code)}B ${card(code).name}`;

// ---------------------------------------------------------------------------
// Setup and the three stages in play.

export function setupBattleFiveArmies(s: GameState) {
  const r = BOFA_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const code of section("sharedStagingArea"))
    s.staging.push(make(s, code));
  s.battleFiveArmies = {
    currentQuest: B.gathering,
    stageProgress: {},
    chosenRound: 0,
    advancing: false,
    resolving: [],
    weighedDown: [],
    goblinRound: 0,
    goblinReveals: 0,
    bolgDestroyed: false,
  };
  log(
    s,
    "The Gathering of the Clouds: Bolg enters the staging area. One encounter card per player is revealed.",
    "chapter",
  );
}
/** Make another stage in play the current quest, keeping each stage's progress. */
function setCurrent(s: GameState, code: string) {
  const q = s.battleFiveArmies!;
  if (code === q.currentQuest || !BOFA_STAGES.includes(code)) return false;
  if (BOFA_STAGES.includes(q.currentQuest))
    q.stageProgress[q.currentQuest] = s.progress;
  s.progress = q.stageProgress[code] ?? 0;
  delete q.stageProgress[code];
  q.currentQuest = code;
  s.stage = bofaStageNumber(code);
  return true;
}
function removeProgress(s: GameState, code: string, amount: number) {
  const q = s.battleFiveArmies!;
  if (amount <= 0 || !bofaStagesInPlay(s).includes(code)) return 0;
  const before = bofaStageProgress(s, code);
  const after = Math.max(0, before - amount);
  if (code === q.currentQuest) s.progress = after;
  else q.stageProgress[code] = after;
  return before - after;
}
function advance(s: GameState) {
  const q = s.battleFiveArmies;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // Players cannot advance unless all three stages are complete.
  if (
    BOFA_STAGES.includes(q.currentQuest) &&
    BOFA_STAGES.every((c) => bofaComplete(s, c))
  ) {
    q.advancing = true;
    prepend(s, fx("bofaDefeatStages", { player: firstPlayer(s) }));
  }
  return true;
}
function chooseQuest(s: GameState, reason: "round" | "heedless") {
  const q = s.battleFiveArmies!;
  const first = firstPlayer(s);
  const options = BOFA_STAGES.filter(
    (c) => reason === "round" || c !== q.currentQuest,
  );
  choose(
    s,
    reason === "round"
      ? "The Battle of Five Armies · Choose the current quest for this round"
      : "Heedless of Order · Choose a different quest to be the current quest",
    options.map((code) => ({
      id: code,
      code,
      label: `${stageLabel(code)} · ${bofaStageProgress(s, code)}/8 progress${code === q.currentQuest ? " (current)" : ""}`,
      effects: [fx("bofaSetCurrent", { code, text: reason, player: first })],
    })),
    reason === "round"
      ? "Progress can be placed only on the current quest. Battle in the Dale quests with attack and The Defense of Ravenhill with defense."
      : "The new current quest lasts until the end of the round.",
  );
}

// ---------------------------------------------------------------------------
// Encounter cards.

function hold(
  s: GameState,
  code: string,
  replay: boolean,
  fromReveal: boolean,
) {
  const q = s.battleFiveArmies!;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  const player = firstPlayer(s);
  prepend(
    s,
    fx("bofaTreachery", { code, source: u.id, player }),
    fx("bofaTreacheryDone", { source: u.id, player }),
  );
}
const TREACHERIES: string[] = [
  B.heedless,
  B.hatred,
  B.goblins,
  ...WILDERLAND_TREACHERIES,
];
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.battleFiveArmies) return false;
  if (TREACHERIES.includes(code)) {
    hold(s, code, replay, fromReveal);
    return true;
  }
  if (code === B.climber && fromReveal) {
    const amount = playerOrder(s).length >= 3 ? 2 : 1;
    let removed = 0;
    for (const stage of bofaStagesInPlay(s))
      removed += removeProgress(s, stage, amount);
    log(
      s,
      `Gundabad Climber removes ${amount} progress from every quest stage in play (${removed} removed).`,
      "danger",
    );
    return true;
  }
  if (code === B.archer && fromReveal) {
    prepend(s, ...playerOrder(s).map((player) => fx("bofaArcher", { player })));
    return true;
  }
  return false;
}
function treachery(s: GameState, e: Effect) {
  const q = s.battleFiveArmies!;
  const held = q.resolving.find((x) => x.id === e.source);
  if (!held) return;
  switch (held.code) {
    case B.heedless:
      if (BOFA_STAGES.includes(q.currentQuest)) chooseQuest(s, "heedless");
      else {
        log(
          s,
          "Heedless of Order: the current quest cannot change; it gains Doomed 3.",
          "danger",
        );
        resolveDoomed(s, 3, "encounter");
      }
      return;
    case B.hatred: {
      const attacks: Effect[] = [];
      for (const p of playerOrder(s))
        for (const enemy of seatView(s, p).engaged)
          attacks.push(
            fx("immediateAttack", {
              target: enemy.id,
              player: p,
              noShadow: true,
            }),
          );
      if (attacks.length) {
        log(
          s,
          "Hatred Rekindled: each engaged enemy makes an immediate attack without a shadow card.",
          "danger",
        );
        prepend(s, ...attacks);
      } else {
        log(s, "Hatred Rekindled: no enemy attacks; it gains surge.");
        prepend(s, ...surgeEffects(held.code));
      }
      return;
    }
    case B.goblins:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bofaGoblinSearch", { player })),
        fx("bofaShuffle", { player: firstPlayer(s) }),
      );
      return;
    default:
      wilderlandTreachery(s, held.code);
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.battleFiveArmies) return false;
  const enemy = get(s, c.enemyId);
  const defenders = (c.defenderIds ?? [])
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const empty = bofaEmptyStages(s);
  switch (code) {
    case B.rider:
      c.attackBonus = (c.attackBonus ?? 0) + empty;
      return true;
    case B.vanguard:
      c.bofaVanguard = true;
      return true;
    case B.warg:
      c.defensePenalty = (c.defensePenalty ?? 0) + empty;
      return true;
    case B.archer:
      if (defenders[0] && empty > 0) damage(s, defenders[0].id, empty);
      return true;
    case B.eagle:
      if (enemy) damage(s, enemy.id, 3);
      return true;
    case B.hatred:
      c.bofaAgain = true;
      return true;
    case B.goblins: {
      const player = c.attackPlayer ?? activeSeat(s);
      c.attackBonus =
        (c.attackBonus ?? 0) +
        seatView(s, player).engaged.filter((u) => isGoblin(u)).length;
      return true;
    }
  }
  return wilderlandShadow(s, code);
}

// ---------------------------------------------------------------------------
// Effects.

export function bofaEffect(s: GameState, e: Effect): boolean {
  const q = s.battleFiveArmies;
  if (!q || !e.kind.startsWith("bofa")) return false;
  const first = firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "bofaSetup":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("reveal", { player })),
        fx("bofaStageOne", { player: first }),
      );
      return true;
    case "bofaStageOne":
      if (q.currentQuest !== B.gathering) return true;
      q.currentQuest = B.spur;
      q.stageProgress = { [B.dale]: 0, [B.ravenhill]: 0 };
      s.stage = 2;
      s.progress = 0;
      log(
        s,
        "The Gathering of the Clouds: The Eastern Spur, Battle in the Dale and The Defense of Ravenhill are put into play at the same time.",
        "chapter",
      );
      return true;
    case "bofaChooseQuest":
      if (BOFA_STAGES.includes(q.currentQuest) && q.chosenRound !== s.round)
        chooseQuest(s, "round");
      return true;
    case "bofaSetCurrent": {
      if (e.text === "round") q.chosenRound = s.round;
      const changed = setCurrent(s, e.code!);
      log(
        s,
        `${stageLabel(q.currentQuest)} is the current quest${e.text === "heedless" ? " until the end of the round" : ""}.`,
        e.text === "heedless" ? "danger" : undefined,
      );
      if (e.text === "heedless" && !changed) resolveDoomed(s, 3, "encounter");
      return true;
    }
    case "bofaDefeatStages": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("bofaStageFive", { player: first }));
      return true;
    }
    case "bofaStageFive":
      q.advancing = false;
      q.currentQuest = B.clouds;
      q.stageProgress = {};
      s.stage = 5;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, "The Clouds Burst.", "chapter");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bofaBodyguard", { player })),
        fx("bofaShuffle", { player: first }),
        fx("bofaStageReady", { player: first }),
      );
      return true;
    case "bofaBodyguard": {
      let from = s.encounterDeck.indexOf(B.bodyguard);
      const pile = from >= 0 ? s.encounterDeck : s.encounterDiscard;
      if (from < 0) from = s.encounterDiscard.lastIndexOf(B.bodyguard);
      if (from < 0) return true;
      pile.splice(from, 1);
      s.staging.push(make(s, B.bodyguard));
      log(
        s,
        `The Clouds Burst: ${seatName(s, e.player ?? first)} adds Bodyguard of Bolg to the staging area.`,
        "danger",
      );
      return true;
    }
    case "bofaShuffle":
      shuffle(s, s.encounterDeck);
      return true;
    case "bofaStageReady":
      s.stageRevealing = false;
      log(
        s,
        "The Clouds Burst: Bolg is considered engaged with the first player while he is in the staging area. Destroy him to win.",
        "danger",
      );
      return true;
    case "bofaVictory":
      win(s);
      s.reason =
        "Bolg falls and the Eagles and Beorn break the Goblin host: the Battle of Five Armies is won.";
      return true;
    case "bofaTreachery":
      treachery(s, e);
      return true;
    case "bofaTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "bofaStageForced": {
      const code = e.code!;
      if (!bofaStagesInPlay(s).includes(code) || bofaStageProgress(s, code) > 0)
        return true;
      if (code === B.spur) {
        for (const p of playerOrder(s))
          forOwner(s, p, () => {
            if (s.hand.length)
              discardHandCard(
                s,
                s.hand[Math.floor(random(s) * s.hand.length)].id,
                { encounterEffect: true },
              );
          });
        log(
          s,
          "The Eastern Spur has no progress: each player discards 1 random card from hand.",
          "danger",
        );
      } else if (code === B.dale) {
        let i = s.encounterDiscard.length - 1;
        while (i >= 0 && typeOf(s.encounterDiscard[i]) !== "enemy") i--;
        if (i < 0) return true;
        const [enemy] = s.encounterDiscard.splice(i, 1);
        s.staging.push(make(s, enemy));
        log(
          s,
          `Battle in the Dale has no progress: ${card(enemy).name} returns from the discard pile to the staging area.`,
          "danger",
        );
      } else if (code === B.ravenhill) {
        for (const p of playerOrder(s))
          forOwner(s, p, () => {
            for (const h of s.heroes) h.resources = 0;
          });
        log(
          s,
          "The Defense of Ravenhill has no progress: each player discards all resources from each hero's resource pool.",
          "danger",
        );
      }
      return true;
    }
    case "bofaRuins": {
      const stage = BOFA_RUINS[e.code!];
      const removed = stage ? removeProgress(s, stage, 2) : 0;
      if (removed)
        log(
          s,
          `${card(e.code!).name} removes ${removed} progress from ${stageLabel(stage)}.`,
          "danger",
        );
      return true;
    }
    case "bofaRuinsTravel":
      if (!spendBaggins(s, e.value ?? 3))
        log(s, "Bilbo Baggins cannot pay for the travel cost.", "danger");
      return true;
    case "bofaRider":
      if (removeProgress(s, q.currentQuest, 1))
        log(
          s,
          "Gundabad Wolf Rider removes 1 progress from the current quest.",
          "danger",
        );
      return true;
    case "bofaSlopes":
      if (removeProgress(s, q.currentQuest, 1))
        log(
          s,
          "Northern Slopes: a character left play; 1 progress is removed from the current quest.",
          "danger",
        );
      return true;
    case "bofaVanguardShadow": {
      const removed = removeProgress(s, q.currentQuest, 99);
      log(
        s,
        `Vanguard of Bolg's shadow: the attack destroyed a character; ${plural(removed, "progress token")} are removed from the current quest.`,
        "danger",
      );
      return true;
    }
    case "bofaArcher": {
      const player = e.player ?? first;
      let own: Unit[] = [];
      forOwner(s, player, () => {
        own = [...s.heroes, ...s.allies];
      });
      if (!own.length) return true;
      choose(
        s,
        "Gundabad Archer · Deal 2 damage to a character you control",
        opts(own, (c) => [fx("bofaArcherDamage", { target: c.id, player })]),
      );
      return true;
    }
    case "bofaArcherDamage":
      if (u && allCharacters(s).some((x) => x.id === u.id)) damage(s, u.id, 2);
      return true;
    case "bofaGoblinSearch": {
      const player = e.player ?? first;
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(isGoblinCode),
        ),
      ];
      if (!codes.length) return true;
      choose(
        s,
        "Goblins are Upon You! · Put a Goblin enemy into play engaged with you",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("bofaGoblinTake", { code, player })],
        })),
        "Search the encounter deck and discard pile.",
      );
      return true;
    }
    case "bofaGoblinTake": {
      const code = e.code!;
      let i = s.encounterDeck.indexOf(code);
      const pile = i >= 0 ? s.encounterDeck : s.encounterDiscard;
      if (i < 0) i = s.encounterDiscard.lastIndexOf(code);
      if (i < 0) return true;
      pile.splice(i, 1);
      const goblin = make(s, code);
      s.staging.push(goblin);
      engage(s, goblin);
      log(
        s,
        `Goblins are Upon You!: ${card(code).name} engages ${seatName(s, e.player ?? first)}.`,
        "danger",
      );
      return true;
    }
    case "bofaEagle": {
      const eagle = u;
      if (!eagle || eagle.code !== B.eagle || !spendBaggins(s, 2)) return true;
      const inStaging = s.staging.some((x) => x.id === eagle.id);
      const controlled = !inStaging && ownerOf(s, eagle) === first;
      const enemies = s.staging.filter(
        (x) => typeOf(x.code) === "enemy" && !card(x.code).is_unique,
      );
      choose(s, "Misty Mountain Eagle · Choose one", [
        ...(controlled
          ? []
          : [
              {
                id: "control",
                label: "Take control of Misty Mountain Eagle",
                effects: [
                  fx("bofaEagleControl", { target: eagle.id, player: first }),
                ],
              },
            ]),
        ...enemies.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Discard the Eagle to discard ${name(x)}`,
          effects: [
            fx("bofaEagleDiscard", {
              target: eagle.id,
              source: x.id,
              player: first,
            }),
          ],
        })),
      ]);
      return true;
    }
    case "bofaEagleControl": {
      const eagle = u;
      if (!eagle) return true;
      s.staging = s.staging.filter((x) => x.id !== eagle.id);
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          s.allies = s.allies.filter((x) => x.id !== eagle.id);
        });
      eagle.owner = first;
      eagle.controller = first;
      forOwner(s, first, () => s.allies.push(eagle));
      log(
        s,
        `${seatName(s, first)} takes control of Misty Mountain Eagle.`,
        "good",
      );
      return true;
    }
    case "bofaEagleDiscard": {
      const eagle = u;
      const enemy = s.staging.find((x) => x.id === e.source);
      if (!eagle || !enemy) return true;
      s.staging = s.staging.filter(
        (x) => x.id !== eagle.id && x.id !== enemy.id,
      );
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          s.allies = s.allies.filter((x) => x.id !== eagle.id);
        });
      s.encounterDiscard.push(
        ...eagle.attachments.map((a) => a.code),
        ...enemy.shadows,
        ...enemy.attachments.map((a) => a.code),
        enemy.code,
        eagle.code,
      );
      log(
        s,
        `Misty Mountain Eagle is discarded to discard ${name(enemy)} from the staging area.`,
        "good",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

/** Vanguard of Bolg: +1 threat, attack and defense per empty quest stage. */
const vanguardBonus = (s: GameState, u: Unit) =>
  u.code === B.vanguard && !u.blanked ? bofaEmptyStages(s) : 0;
/** Ravenous Warg: the defending player's character(s) with the most damage. */
function wargDefenders(s: GameState, enemy: Unit) {
  if (enemy.code !== B.warg || enemy.blanked) return undefined;
  const own = [...s.heroes, ...s.allies];
  if (!own.length) return undefined;
  const most = Math.max(...own.map((u) => u.damage));
  return own.filter((u) => u.damage === most);
}
function eagleProblem(s: GameState, u: Unit) {
  if (u.code !== B.eagle || u.blanked) return "No action.";
  if (activeSeat(s) !== firstPlayer(s))
    return "Only the first player may use Misty Mountain Eagle's action.";
  const bilbo = bagginsBilbo(s);
  if (!bilbo || bilbo.resources < 2 || !heirsCanSpendResources(s, bilbo))
    return "Spend 2 Baggins resources from Bilbo Baggins' resource pool.";
  return null;
}
const STAGE_EFFECTS = [
  "bofaSetup",
  "bofaStageOne",
  "bofaChooseQuest",
  "bofaSetCurrent",
  "bofaDefeatStages",
  "bofaStageFive",
  "bofaBodyguard",
  "bofaShuffle",
  "bofaStageReady",
  "bofaVictory",
  "bofaTreachery",
  "bofaTreacheryDone",
  "bofaStageForced",
  "bofaRuins",
  "bofaRider",
  "bofaSlopes",
  "bofaVanguardShadow",
];
export const BOFA_HOOKS: Batch4ScenarioHooks = {
  setup: setupBattleFiveArmies,
  openingHandsKept: (s) => {
    const q = s.battleFiveArmies;
    if (!q || q.currentQuest !== B.gathering || s.round > 0) return false;
    prepend(s, fx("bofaSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: bofaStageInfo,
  resourceStart: (s) => {
    const q = s.battleFiveArmies;
    return q &&
      BOFA_STAGES.includes(q.currentQuest) &&
      q.chosenRound !== s.round
      ? [fx("bofaChooseQuest", { player: firstPlayer(s) })]
      : [];
  },
  questStat: (s) => {
    const q = s.battleFiveArmies;
    if (!q) return undefined;
    if (q.currentQuest === B.dale) return "attack";
    if (q.currentQuest === B.ravenhill) return "defense";
    return undefined;
  },
  progress: (s, amount, quest) =>
    s.battleFiveArmies && [B.gathering, B.clouds].includes(quest.code)
      ? 0
      : amount,
  check: (s) => {
    const q = s.battleFiveArmies;
    if (q?.bolgDestroyed && s.status === "playing" && !q.advancing) {
      q.advancing = true;
      prepend(s, fx("bofaVictory", { player: firstPlayer(s) }));
    }
  },
  enemyDestination: (s, u) => {
    if (s.battleFiveArmies && u.code === B.bolg)
      s.battleFiveArmies.bolgDestroyed = true;
    return false;
  },
  roundEnd: (s) => {
    const q = s.battleFiveArmies;
    if (!q) return [];
    const first = firstPlayer(s);
    // The first player resolves the stages' Forced effects first.
    const stages = bofaStagesInPlay(s)
      .filter((c) => BOFA_STAGES.includes(c) && bofaStageProgress(s, c) <= 0)
      .map((code) => fx("bofaStageForced", { code, player: first }));
    const ruins = [...s.staging, ...allActiveLocations(s)]
      .filter((l) => l.code in BOFA_RUINS && !l.blanked)
      .map((l) => fx("bofaRuins", { code: l.code, player: first }));
    return [...stages, ...ruins];
  },
  immune: (s, u) =>
    !!s.battleFiveArmies &&
    !u.blanked &&
    (u.code === B.bolg || u.code in BOFA_RUINS),
  // Destroying Bolg at stage 5 wins the game.
  cannotLeave: (s, u, destruction) =>
    !!s.battleFiveArmies &&
    !destruction &&
    u.code === B.bolg &&
    !u.blanked &&
    s.staging.some((x) => x.id === u.id),
  cannotEngage: (s, u) =>
    !!s.battleFiveArmies && u.code === B.bolg && !u.blanked,
  cannotOptionallyEngage: (s, u) =>
    !!s.battleFiveArmies && u.code === B.bolg && !u.blanked,
  consideredEngaged: (s, u, player) =>
    !!s.battleFiveArmies &&
    s.battleFiveArmies.currentQuest === B.clouds &&
    u.code === B.bolg &&
    s.staging.some((x) => x.id === u.id) &&
    player === firstPlayer(s),
  damageAmount: (s, u, amount) =>
    s.battleFiveArmies &&
    u.code === B.bolg &&
    enemiesInPlay(s).some((x) => x.code === B.bodyguard && !x.blanked)
      ? 0
      : amount,
  threatBonus: (s, u) => {
    if (!s.battleFiveArmies) return 0;
    let bonus = wilderlandThreatBonus(s, u);
    if (u.blanked) return bonus;
    if (u.code === B.bolg) bonus += playerOrder(s).length;
    bonus += vanguardBonus(s, u);
    return bonus;
  },
  stats: (s, u) => {
    if (!s.battleFiveArmies) return {};
    if (isCharacter(u)) {
      const penalty = wilderlandPenalty(s, u);
      return penalty
        ? { will: -penalty, attack: -penalty, defense: -penalty }
        : {};
    }
    if (typeOf(u.code) !== "enemy") return {};
    const vanguard = vanguardBonus(s, u);
    const slopes = isGoblin(u)
      ? s.staging.filter((l) => l.code === B.slopes && !l.blanked).length
      : 0;
    return vanguard || slopes
      ? { attack: vanguard + slopes, defense: vanguard + slopes }
      : {};
  },
  shadowCards: (s, u, amount) =>
    s.battleFiveArmies && u.code === B.bodyguard && !u.blanked
      ? amount + bofaEmptyStages(s)
      : amount,
  forcedDefenders: (s, enemy) =>
    s.battleFiveArmies ? wargDefenders(s, enemy) : undefined,
  enemyAttackStarted: (s, enemy, player) => {
    if (s.battleFiveArmies && enemy.code === B.rider && !enemy.blanked)
      prepend(s, fx("bofaRider", { player }));
  },
  revealed: (s, code) => {
    const q = s.battleFiveArmies;
    if (!q || !isGoblinCode(code)) return;
    if (q.goblinRound !== s.round) {
      q.goblinRound = s.round;
      q.goblinReveals = 0;
    }
    q.goblinReveals++;
  },
  revealedSurge: (s, code) => {
    const q = s.battleFiveArmies;
    const b = bolg(s);
    return (
      !!q &&
      !!b &&
      !b.blanked &&
      isGoblinCode(code) &&
      q.goblinRound === s.round &&
      q.goblinReveals === 1
    );
  },
  cannotCancel: (s, shadow, code) =>
    !!s.battleFiveArmies && !shadow && code === B.goblins,
  travelProblem: (s, u) => {
    if (!s.battleFiveArmies || u.blanked) return null;
    const path = wilderlandTravelProblem(s, u, bagginsBilbo(s));
    if (path) return path;
    const stage = BOFA_RUINS[u.code];
    if (!stage) return null;
    const cost = s.battleFiveArmies.currentQuest === stage ? 1 : 3;
    return (bagginsBilbo(s)?.resources ?? 0) < cost
      ? `Travel to ${card(u.code).name}: spend ${cost} Baggins resource${cost === 1 ? "" : "s"}.`
      : null;
  },
  travelEffects: (s, u) => {
    if (!s.battleFiveArmies || u.blanked) return undefined;
    const path = wilderlandTravelEffects(s, u);
    if (path) return path;
    const stage = BOFA_RUINS[u.code];
    if (!stage) return undefined;
    const cost = s.battleFiveArmies.currentQuest === stage ? 1 : 3;
    return [fx("bofaRuinsTravel", { value: cost, player: firstPlayer(s) })];
  },
  characterLeft: (s, u) => {
    if (!s.battleFiveArmies) return;
    if (isBagginsBilbo(u.code)) loseBilbo(s);
    if (activeIs(s, B.slopes))
      prepend(s, fx("bofaSlopes", { player: firstPlayer(s) }));
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  damageDealt: (s, u, amount, ctx) => {
    if (s.battleFiveArmies) wilderlandDamageDealt(s, u, amount, ctx);
  },
  attackFinished: (s, combat) => {
    if (!s.battleFiveArmies) return [];
    const effects = wilderlandAttackFinished(s, combat);
    const enemy = get(s, combat.enemyId);
    // Hatred Rekindled's shadow: an additional attack right after this one.
    if (combat.bofaAgain && enemy)
      effects.push(
        fx("immediateAttack", {
          target: enemy.id,
          player: combat.attackPlayer ?? firstPlayer(s),
        }),
      );
    return effects;
  },
  characterDestroyed: (s, u, ctx) => {
    if (!s.battleFiveArmies) return;
    prepend(s, ...wilderlandCharacterDestroyed(s, u, ctx));
    const c = s.combat;
    if (c?.bofaVanguard && ctx.combatDamage && ctx.enemyId === c.enemyId) {
      c.bofaVanguard = false;
      prepend(s, fx("bofaVanguardShadow", { player: firstPlayer(s) }));
    }
  },
  defendersDeclared: (s, enemy, defenders) => [
    ...hobbitTreasureDefense(s, enemy, defenders),
    ...hobbitRingDefense(s, enemy, defenders),
  ],
  playerAttackResolved: (s, enemy, ids, amount, remainingHealth) =>
    prepend(s, ...hobbitTreasureKill(s, enemy, ids, amount, remainingHealth)),
  abilityLabel: (code) =>
    code === B.eagle
      ? "Misty Mountain Eagle · First player: spend 2 Baggins resources to take control of it or discard it and an enemy"
      : undefined,
  abilityProblem: (s, u) => eagleProblem(s, u),
  ability: (s, u) => {
    if (eagleProblem(s, u)) return false;
    prepend(s, fx("bofaEagle", { target: u.id, player: firstPlayer(s) }));
    return true;
  },
  encounter,
  shadow,
  effect: (s, e) =>
    bofaEffect(s, e) || wilderlandEffect(s, e) || hobbitTreasureEffect(s, e),
  sharedEffect: (e) =>
    STAGE_EFFECTS.includes(e.kind) ||
    WILDERLAND_SHARED_EFFECTS.includes(e.kind),
};
