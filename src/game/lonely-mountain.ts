import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  draw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  damage,
  discardHandCard,
  exhaustCharacter,
  questDefeated,
  win,
} from "./board";
import {
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
  BURGLES,
  SMAUG_PROGRESS_LIMIT,
  TLM as T,
  TLM_RECIPES,
  burgleItemLabel,
  burgleMatch,
  hasBurgle,
  tlmStageInfo,
  tlmStageNumber,
  type BurgleReason,
} from "./lonely-mountain-support";
export * from "./lonely-mountain-support";

const typeOf = (code: string) => card(code).type_code;
const isCharacter = (u: Unit) => ["hero", "ally"].includes(typeOf(u.code));
const isDragon = (code: string) =>
  typeOf(code) === "enemy" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Dragon");
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const golden = (s: GameState) => s.staging.find((u) => u.code === T.golden);
const magnificent = (s: GameState) =>
  s.staging.find((u) => u.code === T.magnificent);
const mountain = (s: GameState) =>
  s.staging.find((u) => u.code === T.mountain && !u.blanked);
/** Group the engine's phase steps into the printed phases. */
const printedPhase = (phase: string) =>
  phase === "staging" ? "quest" : phase === "attack" ? "defense" : phase;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ENCOUNTER_TYPES = ["enemy", "location", "treachery"] as const;

// ---------------------------------------------------------------------------
// Setup and stages.

export function setupLonelyMountain(s: GameState) {
  const r = TLM_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const code of section("sharedStagingArea"))
    s.staging.push(make(s, code));
  s.lonelyMountain = {
    currentQuest: T.welcome,
    advancing: false,
    stack: shuffle(s, section("sharedEncounterDeck2")),
    setAside: section("sharedSetAside").map((code) => make(s, code)),
    resolving: [],
    treasures: [],
    burgle: null,
    weighedDown: [],
    treacheryRound: 0,
    treacheryReveals: 0,
    ounce: [],
    noTravelRound: null,
    entranceNamed: null,
  };
  log(
    s,
    "A Warm Welcome: Smaug the Golden and The Lonely Mountain enter the staging area; the five Erebor treasures are stacked facedown under the Mountain. Smaug the Magnificent and A Bare Patch are set aside.",
    "chapter",
  );
}
function setStage(s: GameState, quest: string) {
  const q = s.lonelyMountain!;
  q.currentQuest = quest;
  s.stage = tlmStageNumber(quest);
  s.progress = 0;
}
function setAside(s: GameState, u: Unit) {
  const q = s.lonelyMountain!;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows);
  for (const a of u.attachments) s.encounterDiscard.push(a.code);
  q.setAside.push({
    ...u,
    damage: 0,
    progress: 0,
    exhausted: false,
    attachments: [],
    shadows: [],
  });
}
function fromSetAside(s: GameState, code: string) {
  const q = s.lonelyMountain!;
  const i = q.setAside.findIndex((u) => u.code === code);
  if (i < 0) return undefined;
  const [u] = q.setAside.splice(i, 1);
  s.staging.push(u);
  return u;
}
/**
 * Smaug the Golden collects progress tokens. After the 6th, the players
 * advance to stage 4A at once; returns whether that happened.
 */
function smaugProgress(s: GameState, amount: number, source: string) {
  const g = golden(s);
  if (!g || amount <= 0) return false;
  const before = g.progress;
  g.progress += amount;
  log(
    s,
    `${source}: Smaug the Golden has ${plural(g.progress, "progress token")}.`,
    "danger",
  );
  if (before < SMAUG_PROGRESS_LIMIT && g.progress >= SMAUG_PROGRESS_LIMIT) {
    stageFour(s);
    return true;
  }
  return false;
}
function stageFour(s: GameState) {
  setStage(s, T.thieves);
  s.stageRevealing = true;
  log(s, "Smaug wakes: Thieves! Fire! Murder!", "chapter");
  prepend(s, fx("tlmStageFourReveal", { player: firstPlayer(s) }));
}
function advance(s: GameState) {
  const q = s.lonelyMountain;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = tlmStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Players cannot defeat stage 3B while Smaug the Magnificent is in play.
  if (q.currentQuest === T.inside && magnificent(s)) return true;
  q.advancing = true;
  prepend(
    s,
    fx(q.currentQuest === T.inside ? "tlmDefeatQuest" : "tlmResetStage", {
      player: firstPlayer(s),
    }),
  );
  return true;
}

// ---------------------------------------------------------------------------
// Burgle attempts.

/** Discard from the encounter deck until a card with a burgle effect is discarded. */
function findBurgle(s: GameState) {
  let reshuffled = false;
  for (;;) {
    if (!s.encounterDeck.length) {
      if (reshuffled || !s.encounterDiscard.some(hasBurgle)) return undefined;
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      reshuffled = true;
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = s.encounterDeck.shift()!;
    s.encounterDiscard.push(code);
    if (hasBurgle(code)) return code;
    log(s, `Burgle attempt: ${card(code).name} is discarded.`);
  }
}
const burgleText = (code: string) =>
  card(code)
    .text?.split("\n")
    .find((line) => line.startsWith("Burgle"))
    ?.replace(/<\/?[bi]>/g, "") ?? "";
function burgleMatches(s: GameState) {
  const b = s.lonelyMountain?.burgle;
  if (!b) return [];
  const items = BURGLES[b.code].items;
  let matches: Unit[] = [];
  forOwner(s, firstPlayer(s), () => {
    matches = s.hand.filter((u) =>
      burgleMatch(card(u.code), card(b.revealed), items),
    );
  });
  return matches;
}
function canUseMountain(s: GameState) {
  const bilbo = bagginsBilbo(s);
  return (
    !!mountain(s) &&
    !!bilbo &&
    bilbo.resources >= 2 &&
    heirsCanSpendResources(s, bilbo)
  );
}
/** Reveal the top card of the first player's deck; false if it is empty. */
function revealTop(s: GameState) {
  const b = s.lonelyMountain!.burgle!;
  let top: string | undefined;
  forOwner(s, firstPlayer(s), () => {
    top = s.deck[0];
  });
  if (!top) return false;
  b.revealed = top;
  log(s, `Burgle attempt: the first player reveals ${card(top).name}.`);
  return true;
}
function burgleChoice(s: GameState) {
  const q = s.lonelyMountain!;
  const b = q.burgle;
  if (!b) return;
  const first = firstPlayer(s);
  const { items, cards } = BURGLES[b.code];
  const revealed = card(b.revealed);
  const matches = burgleMatches(s);
  const wanted = items.map((i) => burgleItemLabel(revealed, i)).join(" and ");
  const options: Option[] = [];
  if (matches.length >= cards)
    options.push({
      id: "discard",
      label: `Discard ${plural(cards, "matching card")} from your hand (${wanted})`,
      effects: [fx("tlmBurgleDiscard", { value: cards, player: first })],
    });
  if (canUseMountain(s))
    options.push({
      id: "mountain",
      code: T.mountain,
      label:
        "The Lonely Mountain · Spend 2 Baggins resources: take the revealed card into hand and reveal the next card",
      effects: [fx("tlmBurgleMountain", { player: first })],
    });
  options.push({
    id: "fail",
    label:
      matches.length >= cards
        ? "Discard nothing: the burgle attempt fails"
        : `Fewer than ${cards} matching card${cards === 1 ? "" : "s"}: the burgle attempt fails`,
    effects: [fx("tlmBurgleEnd", { flag: false, player: first })],
  });
  choose(
    s,
    `${card(b.code).name} · Burgle attempt: the revealed card is ${revealed.name}`,
    options,
    `${burgleText(b.code)} Matching ${wanted}: ${plural(matches.length, "card")} in hand.`,
  );
}
function startBurgle(s: GameState, reason: BurgleReason) {
  const q = s.lonelyMountain!;
  const first = firstPlayer(s);
  q.burgle = null;
  const code = findBurgle(s);
  if (!code) {
    log(s, "Burgle attempt: no card with a burgle effect can be discarded.");
    prepend(s, fx("tlmBurgleFail", { text: reason, player: first }));
    return;
  }
  log(
    s,
    `Burgle attempt: ${card(code).name} is discarded and its burgle effect resolves.`,
  );
  q.burgle = { reason, code, revealed: "" };
  forOwner(s, first, () => shuffle(s, s.deck));
  if (!revealTop(s)) {
    q.burgle = null;
    log(s, "Burgle attempt: the first player's deck is empty.", "danger");
    prepend(s, fx("tlmBurgleFail", { text: reason, player: first }));
    return;
  }
  burgleChoice(s);
}
function burgleSucceeded(s: GameState, reason: BurgleReason) {
  const q = s.lonelyMountain!;
  const first = firstPlayer(s);
  log(s, "The burgle attempt succeeds.", "good");
  if (reason === "patch") {
    const patch = s.staging.find((u) => u.code === T.patch);
    const m = magnificent(s);
    if (patch && m) {
      s.staging = s.staging.filter((u) => u.id !== patch.id);
      m.attachments.push({ id: patch.id, code: patch.code, exhausted: false });
      log(
        s,
        "A Bare Patch attaches to Smaug the Magnificent: he gets -3 defense.",
        "good",
      );
    }
    return;
  }
  if (q.currentQuest !== T.burglar) return;
  const treasure = q.stack.shift();
  if (treasure) {
    forOwner(s, first, () => s.hand.push(make(s, treasure)));
    q.treasures.push(treasure);
    log(
      s,
      `The first player takes ${card(treasure).name} from under The Lonely Mountain into hand.`,
      "good",
    );
  }
  choose(
    s,
    "The Burglar's Turn · Advance to stage 3?",
    [
      {
        id: "advance",
        label: "Advance to stage 3: Inside Information",
        effects: [fx("tlmStageThree", { player: first })],
      },
      {
        id: "stay",
        label: "Stay at stage 2 to burgle more treasure",
        effects: [],
      },
    ],
    "After a successful burgle attempt the players may advance to stage 3.",
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
  const q = s.lonelyMountain!;
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
    fx("tlmTreachery", { code, source: u.id, player }),
    fx("tlmTreacheryDone", { source: u.id, player }),
  );
}
const TREACHERIES: string[] = [
  T.belching,
  T.ounce,
  T.pretending,
  T.spell,
  ...WILDERLAND_TREACHERIES,
];
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.lonelyMountain || !TREACHERIES.includes(code)) return false;
  hold(s, code, replay, fromReveal);
  return true;
}
/** Each player's total willpower committed to the quest. */
function committedWill(s: GameState, player: number) {
  const v = seatView(s, player);
  return [...v.heroes, ...v.allies]
    .filter((u) => u.committed)
    .reduce((n, u) => n + Math.max(0, stats(s, u).will), 0);
}
function heroesWithMost(s: GameState) {
  const heroes = allCharacters(s).filter(
    (u) =>
      typeOf(u.code) === "hero" &&
      !u.attachments.some((a) => a.code === T.spell),
  );
  const most = Math.max(0, ...heroes.map((u) => u.resources));
  return heroes.filter((u) => u.resources === most);
}
function treachery(s: GameState, e: Effect) {
  const q = s.lonelyMountain!;
  const held = q.resolving.find((x) => x.id === e.source);
  if (!held) return;
  const first = firstPlayer(s);
  switch (held.code) {
    case T.belching: {
      const dragons = s.staging.filter((u) => isDragon(u.code) && !u.blanked);
      if (!dragons.length) {
        log(s, "Belching Fire: no Dragon enemy is in the staging area.");
        break;
      }
      const totals = playerOrder(s).map((p) => [p, committedWill(s, p)]);
      const most = Math.max(...totals.map(([, n]) => n));
      const targets = totals.filter(([, n]) => n === most).map(([p]) => p);
      const attack = (p: number) =>
        dragons.map((d) =>
          fx("immediateAttack", { target: d.id, player: p, noShadow: true }),
        );
      if (targets.length === 1) prepend(s, ...attack(targets[0]));
      else
        choose(
          s,
          "Belching Fire · Players tie for the most committed willpower",
          targets.map((p) => ({
            id: `player-${p}`,
            label: `${seatName(s, p)} (${most} willpower)`,
            effects: attack(p),
          })),
          "The first player chooses which tied player each Dragon attacks.",
        );
      break;
    }
    case T.ounce: {
      let events = 0;
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          for (let i = 0; i < 2 && s.hand.length; i++) {
            const u = s.hand[Math.floor(random(s) * s.hand.length)];
            const before = s.hand.length;
            discardHandCard(s, u.id, { encounterEffect: true });
            if (s.hand.length < before && typeOf(u.code) === "event") events++;
          }
        });
      if (events)
        q.ounce.push({
          round: s.round,
          phase: printedPhase(s.phase),
          amount: events,
        });
      log(
        s,
        `Known to an Ounce: each player discards 2 random cards; Dragon enemies get +${events} threat until the end of the phase.`,
        "danger",
      );
      break;
    }
    case T.pretending: {
      if (smaugProgress(s, 1, "Pretending to Sleep")) break;
      const x = golden(s)?.progress ?? 0;
      if (!x) break;
      const bilbo = bagginsBilbo(s);
      const advance = fx("tlmPretendAdvance", { player: first });
      if (!bilbo || bilbo.resources < x || !heirsCanSpendResources(s, bilbo)) {
        log(
          s,
          `Pretending to Sleep: Bilbo Baggins cannot spend ${x} Baggins resources.`,
          "danger",
        );
        prepend(s, advance);
        break;
      }
      choose(
        s,
        `Pretending to Sleep · Spend ${x} Baggins resources or advance to stage 4A`,
        [
          {
            id: "spend",
            label: `Spend ${plural(x, "Baggins resource")} from Bilbo Baggins`,
            effects: [fx("tlmPretendSpend", { value: x, player: first })],
          },
          {
            id: "advance",
            label: "Advance to stage 4A: Thieves! Fire! Murder!",
            effects: [advance],
          },
        ],
        "X is the number of progress tokens on Smaug the Golden.",
      );
      break;
    }
    case T.spell: {
      const heroes = heroesWithMost(s);
      if (!heroes.length) break;
      if (heroes.length === 1)
        prepend(
          s,
          fx("tlmSpellAttach", {
            target: heroes[0].id,
            source: held.id,
            player: first,
          }),
        );
      else
        choose(
          s,
          "Dragon-Spell · Attach to the hero with the most resources",
          opts(
            heroes,
            (u) => [
              fx("tlmSpellAttach", {
                target: u.id,
                source: held.id,
                player: first,
              }),
            ],
            (u) =>
              `${plural(u.resources, "resource")}${s.table ? ` · ${seatName(s, ownerOf(s, u))}` : ""}`,
          ),
        );
      break;
    }
    default:
      wilderlandTreachery(s, held.code);
  }
}
function shadow(s: GameState, code: string) {
  if (!s.combat || !s.lonelyMountain) return false;
  return wilderlandShadow(s, code);
}

// ---------------------------------------------------------------------------
// Effects.

export function tlmEffect(s: GameState, e: Effect): boolean {
  const q = s.lonelyMountain;
  if (!q || !e.kind.startsWith("tlm")) return false;
  const first = firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "tlmStageTwo":
      if (q.currentQuest !== T.welcome) return true;
      setStage(s, T.burglar);
      log(
        s,
        "The Burglar's Turn: Bilbo creeps into the dragon's hall while Smaug sleeps.",
        "chapter",
      );
      return true;
    case "tlmBurglarForced":
      if (q.currentQuest !== T.burglar) return true;
      if (smaugProgress(s, 1, "The Burglar's Turn")) return true;
      startBurgle(s, "stage");
      return true;
    case "tlmPatchOffer":
      if (
        !s.staging.some((x) => x.code === T.patch && !x.blanked) ||
        !magnificent(s)
      )
        return true;
      choose(
        s,
        "A Bare Patch · Make a burgle attempt?",
        [
          {
            id: "burgle",
            label: "The first player makes a burgle attempt",
            effects: [fx("tlmBurgleStart", { text: "patch", player: first })],
          },
          { id: "skip", label: "Decline", effects: [] },
        ],
        "If successful, attach A Bare Patch to Smaug the Magnificent (-3 defense).",
      );
      return true;
    case "tlmBurgleStart":
      startBurgle(s, e.text === "patch" ? "patch" : "stage");
      return true;
    case "tlmBurgleMountain": {
      const b = q.burgle;
      if (!b || !canUseMountain(s)) return true;
      spendBaggins(s, 2);
      forOwner(s, first, () => {
        if (s.deck[0] === b.revealed) s.hand.push(takePlayerDeck(s, 0));
      });
      log(
        s,
        `The Lonely Mountain: the first player spends 2 Baggins resources and takes ${card(b.revealed).name} into hand.`,
        "good",
      );
      if (!revealTop(s)) {
        log(s, "Burgle attempt: the first player's deck is empty.", "danger");
        prepend(s, fx("tlmBurgleEnd", { flag: false, player: first }));
        return true;
      }
      burgleChoice(s);
      return true;
    }
    case "tlmBurgleDiscard": {
      const remaining = e.value ?? 0;
      const matches = burgleMatches(s);
      if (!q.burgle) return true;
      if (remaining <= 0) {
        prepend(s, fx("tlmBurgleEnd", { flag: true, player: first }));
        return true;
      }
      if (matches.length < remaining) {
        prepend(s, fx("tlmBurgleEnd", { flag: false, player: first }));
        return true;
      }
      if (matches.length === remaining) {
        forOwner(s, first, () => {
          for (const m of matches)
            discardHandCard(s, m.id, { encounterEffect: true });
        });
        log(
          s,
          `Burgle attempt: the first player discards ${matches.map(name).join(", ")}.`,
        );
        prepend(s, fx("tlmBurgleEnd", { flag: true, player: first }));
        return true;
      }
      choose(
        s,
        `Burgle attempt · Discard a matching card (${remaining} more)`,
        opts(matches, (m) => [
          fx("tlmBurgleDiscardOne", {
            target: m.id,
            value: remaining,
            player: first,
          }),
        ]),
      );
      return true;
    }
    case "tlmBurgleDiscardOne": {
      if (!q.burgle) return true;
      const target = burgleMatches(s).find((m) => m.id === e.target);
      if (!target) return true;
      forOwner(s, first, () =>
        discardHandCard(s, target.id, { encounterEffect: true }),
      );
      log(s, `Burgle attempt: the first player discards ${name(target)}.`);
      prepend(
        s,
        fx("tlmBurgleDiscard", { value: (e.value ?? 1) - 1, player: first }),
      );
      return true;
    }
    case "tlmBurgleEnd": {
      const reason = q.burgle?.reason;
      q.burgle = null;
      if (!reason) return true;
      if (e.flag) burgleSucceeded(s, reason);
      else prepend(s, fx("tlmBurgleFail", { text: reason, player: first }));
      return true;
    }
    case "tlmBurgleFail": {
      log(s, "The burgle attempt fails.", "danger");
      const g = golden(s);
      // Forced (stage 2B): Smaug the Golden attacks the first player.
      if (e.text === "stage" && q.currentQuest === T.burglar && g)
        prepend(s, fx("immediateAttack", { target: g.id, player: first }));
      return true;
    }
    case "tlmStageThree":
      if (q.currentQuest !== T.burglar) return true;
      setStage(s, T.inside);
      s.stageRevealing = true;
      log(s, "Inside Information begins.", "chapter");
      prepend(s, fx("tlmStageThreeReveal", { player: first }));
      return true;
    case "tlmStageThreeReveal": {
      const g = golden(s);
      if (g) setAside(s, g);
      fromSetAside(s, T.magnificent);
      fromSetAside(s, T.patch);
      s.stageRevealing = false;
      log(
        s,
        "Inside Information: Smaug the Golden is set aside; Smaug the Magnificent and A Bare Patch enter the staging area.",
        "danger",
      );
      return true;
    }
    case "tlmStageFourReveal": {
      const g = golden(s);
      if (g) setAside(s, g);
      if (!magnificent(s)) fromSetAside(s, T.magnificent);
      s.stageRevealing = false;
      log(
        s,
        "Thieves! Fire! Murder!: Smaug the Golden's progress is removed and he is set aside; Smaug the Magnificent enters the staging area.",
        "danger",
      );
      return true;
    }
    case "tlmPretendSpend":
      if (!spendBaggins(s, e.value ?? 0)) prepend(s, fx("tlmPretendAdvance"));
      else
        log(
          s,
          `Pretending to Sleep: Bilbo Baggins spends ${plural(e.value ?? 0, "Baggins resource")}.`,
        );
      return true;
    case "tlmPretendAdvance":
      if (golden(s)) stageFour(s);
      return true;
    case "tlmResetStage": {
      q.advancing = false;
      if (q.currentQuest !== T.thieves) return true;
      const m = magnificent(s);
      if (m) setAside(s, m);
      fromSetAside(s, T.golden);
      setStage(s, T.burglar);
      log(
        s,
        "Thieves! Fire! Murder!: Smaug the Magnificent's damage is removed and he is set aside; Smaug the Golden returns to the staging area and the quest deck resets to stage 2B.",
        "chapter",
      );
      return true;
    }
    case "tlmDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("tlmVictory", { player: first }));
      return true;
    }
    case "tlmVictory":
      q.advancing = false;
      win(s);
      s.reason = q.treasures.length
        ? `Smaug is driven off and the heroes discover ${q.treasures.map((c) => card(c).name).join(", ")}.`
        : "Smaug is driven off from the Lonely Mountain.";
      return true;
    case "tlmTreachery":
      treachery(s, e);
      return true;
    case "tlmTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "tlmSpellAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (
        i < 0 ||
        !u ||
        !allCharacters(s).some((x) => x.id === u.id) ||
        u.attachments.some((a) => a.code === T.spell)
      )
        return true;
      const [spell] = q.resolving.splice(i, 1);
      u.attachments.push({ id: spell.id, code: spell.code, exhausted: false });
      log(s, `Dragon-Spell attaches to ${name(u)}.`, "danger");
      return true;
    }
    case "tlmSpellDamage":
      if (u && allCharacters(s).some((x) => x.id === u.id))
        damage(s, u.id, e.value ?? 0);
      return true;
    case "tlmHallProgress":
      smaugProgress(s, 1, "Great Hall");
      return true;
    case "tlmSlopes": {
      const g = golden(s);
      choose(s, "Western Slopes · Choose one", [
        {
          id: "draw",
          label: "The first player draws 2 cards",
          effects: [fx("tlmSlopesDraw", { player: first })],
        },
        ...(g && g.progress > 0
          ? [
              {
                id: "progress",
                label: "Remove 1 progress token from Smaug the Golden",
                effects: [fx("tlmSlopesProgress", { player: first })],
              },
            ]
          : []),
        { id: "skip", label: "Decline", effects: [] },
      ]);
      return true;
    }
    case "tlmSlopesDraw":
      forOwner(s, first, () => draw(s, 2));
      return true;
    case "tlmSlopesProgress": {
      const g = golden(s);
      if (g && g.progress > 0) {
        g.progress--;
        log(
          s,
          `Western Slopes: Smaug the Golden has ${plural(g.progress, "progress token")}.`,
          "good",
        );
      }
      return true;
    }
    case "tlmEntranceCost": {
      let heroes: Unit[] = [];
      forOwner(s, first, () => {
        heroes = s.heroes.filter((h) => !h.exhausted);
      });
      choose(
        s,
        "Secret Entrance · The first player exhausts a hero",
        opts(heroes, (h) => [
          fx("tlmEntranceExhaust", { target: h.id, player: first }),
        ]),
      );
      return true;
    }
    case "tlmEntranceExhaust":
      if (!u || !exhaustCharacter(s, u))
        log(s, "Secret Entrance: the hero cannot exhaust.", "danger");
      choose(
        s,
        "Secret Entrance · Name a card type",
        ENCOUNTER_TYPES.map((type) => ({
          id: type,
          label: type[0].toUpperCase() + type.slice(1),
          effects: [fx("tlmEntranceName", { text: type, player: first })],
        })),
        "Then look at the top card of the encounter deck; if it is not the named type, Secret Entrance returns to the staging area.",
      );
      return true;
    case "tlmEntranceName":
      q.entranceNamed = e.text ?? null;
      return true;
    case "tlmEntranceLook": {
      const named = q.entranceNamed;
      q.entranceNamed = null;
      const top = s.encounterDeck[0];
      const entrance = allActiveLocations(s).find((l) => l.id === e.target);
      const type = top ? typeOf(top) : undefined;
      log(
        s,
        top
          ? `Secret Entrance: the first player looks at the top encounter card, a ${type}.`
          : "Secret Entrance: the encounter deck is empty.",
      );
      if (type === named || !entrance) return true;
      if (s.activeLocation?.id === entrance.id) s.activeLocation = null;
      s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
        (l) => l.id !== entrance.id,
      );
      s.staging.push(entrance);
      q.noTravelRound = s.round;
      log(
        s,
        "Secret Entrance returns to the staging area; the players cannot travel again this round.",
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

/** X: the number of non-Burglar characters committed to the quest. */
const smaugGoldenThreat = (s: GameState) =>
  allCharacters(s).filter((u) => u.committed && !hasTrait(u, "Burglar")).length;
const ounceBonus = (s: GameState) =>
  (s.lonelyMountain?.ounce ?? [])
    .filter((o) => o.round === s.round && o.phase === printedPhase(s.phase))
    .reduce((n, o) => n + o.amount, 0);
function mountainThreat(s: GameState, u: Unit, other: number) {
  const q = s.lonelyMountain!;
  const printed = Number(card(u.code).threat ?? 0);
  let threat = printed + other;
  if (q.stack.length) threat -= 2 * q.stack.length;
  // Secret Entrance: The Lonely Mountain's threat is reduced by half (round up).
  if (activeIs(s, T.entrance)) threat = Math.ceil(Math.max(0, threat) / 2);
  return threat - printed;
}
/**
 * Inside Information, Forced: if the total progress on this stage is greater
 * than Smaug the Magnificent's remaining hit points, he is removed from play.
 */
function insideInformation(s: GameState) {
  const q = s.lonelyMountain;
  if (!q || q.currentQuest !== T.inside || s.stageRevealing) return;
  const m = magnificent(s);
  if (!m) return;
  const remaining = stats(s, m).health - m.damage;
  if (s.progress <= remaining) return;
  s.staging = s.staging.filter((x) => x.id !== m.id);
  s.encounterDiscard.push(...m.shadows, ...m.attachments.map((a) => a.code));
  (s.removedEncounter ??= []).push(m.code);
  log(
    s,
    `Inside Information: ${s.progress} progress exceeds Smaug the Magnificent's ${Math.max(0, remaining)} remaining hit points; he is removed from play.`,
    "good",
  );
}
const STAGE_EFFECTS = [
  "tlmStageTwo",
  "tlmBurglarForced",
  "tlmPatchOffer",
  "tlmBurgleStart",
  "tlmBurgleMountain",
  "tlmBurgleDiscard",
  "tlmBurgleDiscardOne",
  "tlmBurgleEnd",
  "tlmBurgleFail",
  "tlmStageThree",
  "tlmStageThreeReveal",
  "tlmStageFourReveal",
  "tlmPretendSpend",
  "tlmPretendAdvance",
  "tlmResetStage",
  "tlmDefeatQuest",
  "tlmVictory",
  "tlmTreachery",
  "tlmTreacheryDone",
  "tlmHallProgress",
];
export const TLM_HOOKS: Batch4ScenarioHooks = {
  setup: setupLonelyMountain,
  advance,
  stageInfo: tlmStageInfo,
  skipQuestPhase: (s) => s.lonelyMountain?.currentQuest === T.welcome,
  progress: (s, amount, quest) =>
    s.lonelyMountain && [T.welcome, T.burglar].includes(quest.code)
      ? 0
      : amount,
  check: insideInformation,
  questProgressPlaced: (s) => insideInformation(s),
  questSucceeded: (s) => {
    const q = s.lonelyMountain;
    if (!q) return;
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (q.currentQuest === T.burglar)
      effects.push(fx("tlmBurglarForced", { player: first }));
    if (
      s.staging.some((u) => u.code === T.patch && !u.blanked) &&
      magnificent(s)
    )
      effects.push(fx("tlmPatchOffer", { player: first }));
    // These effects follow the successful quest's progress.
    const i = s.queue.findIndex((e) => e.kind === "successfulQuestProgress");
    s.queue.splice(i + 1, 0, ...effects);
  },
  roundEnd: (s) => {
    const q = s.lonelyMountain;
    if (!q) return [];
    const first = firstPlayer(s);
    return [
      ...allActiveLocations(s)
        .filter((l) => l.code === T.hall && !l.blanked)
        .map(() => fx("tlmHallProgress", { player: first })),
      ...(q.currentQuest === T.welcome
        ? [fx("tlmStageTwo", { player: first })]
        : []),
    ];
  },
  immune: (s, u) =>
    !!s.lonelyMountain &&
    !u.blanked &&
    ([T.golden, T.magnificent].includes(u.code) ||
      (u.code === T.mountain && s.lonelyMountain.stack.length > 0)),
  indestructible: (s, u) =>
    !!s.lonelyMountain &&
    !u.blanked &&
    [T.golden, T.magnificent].includes(u.code),
  cannotLeave: (s, u) =>
    !!s.lonelyMountain &&
    !u.blanked &&
    s.staging.some((x) => x.id === u.id) &&
    (u.code === T.magnificent ||
      (u.code === T.mountain && s.lonelyMountain.stack.length > 0)),
  cannotEngage: (s, u) =>
    !!s.lonelyMountain &&
    !u.blanked &&
    [T.golden, T.magnificent].includes(u.code),
  cannotOptionallyEngage: (s, u) =>
    !!s.lonelyMountain &&
    !u.blanked &&
    [T.golden, T.magnificent].includes(u.code),
  consideredEngaged: (s, u, player) =>
    !!s.lonelyMountain &&
    u.code === T.magnificent &&
    !u.blanked &&
    s.staging.some((x) => x.id === u.id) &&
    player === firstPlayer(s),
  threatBonus: (s, u) => {
    const q = s.lonelyMountain;
    if (!q) return 0;
    let bonus = wilderlandThreatBonus(s, u);
    if (u.blanked) return bonus;
    if (u.code === T.golden) bonus += smaugGoldenThreat(s);
    if (isDragon(u.code)) bonus += ounceBonus(s);
    if (u.code === T.mountain) bonus = mountainThreat(s, u, bonus);
    return bonus;
  },
  stats: (s, u) => {
    if (!s.lonelyMountain) return {};
    if (u.code === T.magnificent)
      return u.attachments.some((a) => a.code === T.patch && !a.blanked)
        ? { defense: -3 }
        : {};
    if (!isCharacter(u)) return {};
    const penalty = wilderlandPenalty(s, u);
    const spell = u.attachments.some((a) => a.code === T.spell && !a.blanked)
      ? u.resources
      : 0;
    return penalty || spell
      ? { will: -penalty - spell, attack: -penalty, defense: -penalty }
      : {};
  },
  resourcesSpent: (s, hero, amount) => {
    if (
      s.lonelyMountain &&
      amount > 0 &&
      hero.attachments.some((a) => a.code === T.spell && !a.blanked)
    )
      prepend(
        s,
        fx("tlmSpellDamage", {
          target: hero.id,
          value: amount,
          player: ownerOf(s, hero),
        }),
      );
  },
  revealed: (s, code, origin) => {
    const q = s.lonelyMountain;
    if (!q) return;
    if (typeOf(code) === "treachery") {
      if (q.treacheryRound !== s.round) {
        q.treacheryRound = s.round;
        q.treacheryReveals = 0;
      }
      q.treacheryReveals++;
    }
    if (typeOf(code) !== "location" || origin !== "encounter") return;
    const crows = [...s.staging, ...allEngaged(s)].filter(
      (u) => u.code === T.crows && !u.blanked,
    ).length;
    for (let i = 0; i < crows; i++)
      if (smaugProgress(s, 1, "Croaking Crows")) break;
  },
  revealedSurge: (s, code) => {
    const q = s.lonelyMountain;
    return (
      !!q &&
      typeOf(code) === "treachery" &&
      activeIs(s, T.desolation) &&
      q.treacheryRound === s.round &&
      q.treacheryReveals === 1
    );
  },
  explored: (s, u) => {
    if (s.lonelyMountain && !u.blanked && u.code === T.slopes)
      prepend(s, fx("tlmSlopes", { player: firstPlayer(s) }));
  },
  travelProblem: (s, u) => {
    const q = s.lonelyMountain;
    if (!q) return null;
    if (q.noTravelRound === s.round)
      return "Secret Entrance turned the players back: they cannot travel again this round.";
    if (u.blanked) return null;
    if (u.code === T.mountain && q.stack.length)
      return "The Lonely Mountain cannot leave the staging area while cards are stacked under it.";
    const path = wilderlandTravelProblem(s, u, bagginsBilbo(s));
    if (path) return path;
    if (u.code === T.entrance) {
      let ready = false;
      forOwner(s, firstPlayer(s), () => {
        ready = s.heroes.some((h) => !h.exhausted);
      });
      if (!ready)
        return "Travel to Secret Entrance: the first player must exhaust a hero.";
    }
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.lonelyMountain || u.blanked) return undefined;
    const path = wilderlandTravelEffects(s, u);
    if (path) return path;
    if (u.code === T.entrance)
      return [fx("tlmEntranceCost", { player: firstPlayer(s) })];
    return undefined;
  },
  travelEntered: (s, u, actualTravel) => {
    const q = s.lonelyMountain;
    if (!q) return;
    if (actualTravel && u.code === T.entrance && q.entranceNamed)
      prepend(
        s,
        fx("tlmEntranceLook", { target: u.id, player: firstPlayer(s) }),
      );
    else q.entranceNamed = null;
  },
  damageDealt: (s, u, amount, ctx) => {
    if (!s.lonelyMountain) return;
    wilderlandDamageDealt(s, u, amount, ctx);
    if (u.code === T.magnificent) insideInformation(s);
  },
  attackFinished: (s, combat) => {
    if (!s.lonelyMountain) return [];
    const effects = wilderlandAttackFinished(s, combat);
    const enemy = get(s, combat.enemyId);
    // Forced: a shadow card with a burgle effect gives Smaug the Magnificent an additional attack.
    if (
      enemy?.code === T.magnificent &&
      !enemy.blanked &&
      enemy.shadows.some(hasBurgle) &&
      s.staging.some((x) => x.id === enemy.id)
    ) {
      log(
        s,
        "Smaug the Magnificent was dealt a shadow card with a burgle effect: he makes an additional attack.",
        "danger",
      );
      effects.push(
        fx("immediateAttack", {
          target: enemy.id,
          player: combat.attackPlayer ?? firstPlayer(s),
        }),
      );
    }
    return effects;
  },
  characterDestroyed: (s, u, ctx) => {
    if (s.lonelyMountain)
      prepend(s, ...wilderlandCharacterDestroyed(s, u, ctx));
  },
  defendersDeclared: (s, enemy, defenders) => [
    ...hobbitTreasureDefense(s, enemy, defenders),
    ...hobbitRingDefense(s, enemy, defenders),
  ],
  playerAttackResolved: (s, enemy, ids, amount, remainingHealth) =>
    prepend(s, ...hobbitTreasureKill(s, enemy, ids, amount, remainingHealth)),
  characterLeft: (s, u) => {
    if (isBagginsBilbo(u.code)) loseBilbo(s);
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  encounter,
  shadow,
  effect: (s, e) =>
    tlmEffect(s, e) || wilderlandEffect(s, e) || hobbitTreasureEffect(s, e),
  sharedEffect: (e) =>
    STAGE_EFFECTS.includes(e.kind) ||
    WILDERLAND_SHARED_EFFECTS.includes(e.kind),
};
