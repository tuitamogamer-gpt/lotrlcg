import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random, shuffle } from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  progressLocation,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck, oneRing } from "./lotr-saga";
import { hasTrait } from "./expansion-passives";
import { dealEnemyShadows } from "./considered-engagement";
import {
  GOLLUM_SHARED_EFFECTS,
  flipToGollum,
  gollumDefeated,
  gollumEffect,
  gollumFollows,
  gollumShadow,
  gollumTreachery,
  isNazgulCode,
  lsSmeagol,
  morgulWraithCannotAttach,
  morgulWraithEngagement,
  morgulWraithImmune,
  searchOptions,
  smeagolFollows,
  takeFrom,
} from "./land-shadow-gollum";
import {
  SHELOB_LAIR_RECIPES,
  SL,
  SL_PASS_PROGRESS,
  shelobLairStageInfo,
} from "./shelob-lair-support";
export * from "./shelob-lair-support";

/**
 * Shelob's Lair, the third scenario of The Land of Shadow. Sméagol leads the
 * hobbits from the Morgul Vale up the secret stairs; once his Secret Way is
 * explored, Shelob waits in the staging area of The Spider's Pass, and at
 * Gollum's Betrayal the players must put both Shelob and Gollum in the
 * victory display. Shelob gathers resources: +1 threat each, and at the last
 * stage each one cancels the damage dealt to her once.
 */
const TREACHERIES: readonly string[] = [
  SL.exhalation,
  SL.openings,
  SL.poison,
  SL.malice,
  SL.rage,
  SL.hates,
  SL.call,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const isUnderground = (u: Unit) => isLocation(u) && hasTrait(u, "Underground");
const isOrc = (u: Unit) => isEnemy(u) && hasTrait(u, "Orc");
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const players = (s: GameState) => globalPlayerOrder(s).length;
/** The game phase, its steps included: the staging step belongs to the quest phase, attacks to combat. */
const phaseOf = (s: GameState) =>
  s.phase === "staging"
    ? "quest"
    : s.phase === "defense" || s.phase === "attack"
      ? "combat"
      : s.phase;
/** The current quest's text is in effect (not while a stage resolves its When Revealed effects). */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.shelobLair?.advancing;
const at = (s: GameState, quest: string) =>
  s.shelobLair?.currentQuest === quest && stageLive(s);
/** Shelob in play: in the staging area or engaged with a player. */
export const slShelob = (s: GameState) =>
  s.shelobLair
    ? [...s.staging, ...globalEngaged(s)].find((u) => u.code === SL.shelob)
    : undefined;
const inVictory = (s: GameState, code: string) =>
  (s.victoryCards ?? []).includes(code);
/** Cleft of Cirith Ungol in the victory display: Shelob loses Indestructible. */
const cleftTaken = (s: GameState) => inVictory(s, SL.cleft);
const stagingCount = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** Place resources on Shelob, if she is in play. */
function feedShelob(s: GameState, amount: number, text: string) {
  const shelob = slShelob(s);
  if (!shelob || amount <= 0) {
    if (amount > 0) log(s, `${text}: Shelob is not in play.`);
    return false;
  }
  shelob.resources += amount;
  log(
    s,
    `${text}: ${amount} resource${amount === 1 ? " is" : "s are"} placed on Shelob (${shelob.resources}).`,
    "danger",
  );
  return true;
}
/** Shelob makes an immediate attack against a player, if she is in play. */
function shelobAttacks(s: GameState, player: number, text: string): Effect[] {
  const shelob = slShelob(s);
  if (!shelob) {
    log(s, `${text}: Shelob is not in play.`);
    return [];
  }
  log(
    s,
    `${text}: Shelob makes an immediate attack against ${who(s, player)}.`,
    "danger",
  );
  return [fx("immediateAttack", { target: shelob.id, player })];
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupShelobLair(s: GameState) {
  const r = SHELOB_LAIR_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: Morgul Vale is the active location and Sméagol's Secret Way is in the
  // staging area; Sméagol joins the first player once the opening hands are
  // kept (his card waits in the staging area until then).
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  const [vale] = section("sharedActiveLocation");
  s.activeLocation = vale ? make(s, vale) : null;
  s.shelobLair = {
    currentQuest: SL.stairs,
    advancing: false,
    resolving: [],
    setAside: [
      ...section("sharedSetAside"),
      ...section("sharedEncounterDeck2"),
    ],
  };
  log(
    s,
    "The Stairs of Cirith Ungol: Cleft of Cirith Ungol, Shelob and The Great Spider encounter set are set aside; Morgul Vale is the active location and Sméagol's Secret Way is in the staging area.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.shelobLair;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 1B has no quest points: its Forced effect advances the quest.
  if (q.currentQuest === SL.stairs) return true;
  const goal = shelobLairStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  if (q.currentQuest === SL.betrayal) {
    // 3B: not unless both Shelob and Gollum are in the victory display.
    if (!inVictory(s, SL.shelob) || !inVictory(s, SL.gollum)) return true;
    win(
      s,
      "Gollum's Betrayal is defeated with Shelob and Gollum in the victory display: Frodo escapes Shelob's Lair, and the players win the game.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("slDefeat", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.shelobLair;
  if (!q || !TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  const player = activeSeat(s);
  prepend(
    s,
    fx("slTreachery", { code, source: u.id, player }),
    fx("slTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const q = s.shelobLair!;
  const p = activeSeat(s);
  switch (held.code) {
    case SL.exhalation:
      prepend(
        s,
        ...playerOrder(s).flatMap((player) => [
          fx("slRandomDiscard", { text: "Exhalation of Decay", player }),
          fx("slDiscardAttachment", { text: "Exhalation of Decay", player }),
        ]),
      );
      return;
    case SL.openings: {
      const locations = s.staging.filter(isLocation);
      q.openings = {
        round: s.round,
        count: (q.openings?.round === s.round ? q.openings.count : 0) + 1,
        ids: [
          ...(q.openings?.round === s.round ? (q.openings.ids ?? []) : []),
          ...locations.map((u) => u.id),
        ],
      };
      log(
        s,
        `Many Openings: each location in the staging area (${locations.length}) gets +1 threat until the end of the round.`,
        "danger",
      );
      if (locations.length < players(s)) {
        log(
          s,
          "Many Openings: the staging area holds fewer locations than there are players, so an additional encounter card is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: p }));
      }
      return;
    }
    case SL.poison:
      // Attached to a hero: the treachery stays in play as a Condition.
      prepend(s, fx("slPoison", { source: held.id, player: p }));
      return;
    case SL.malice:
      prepend(s, fx("slMalice", { player: p }));
      return;
    case SL.rage: {
      const shelob = slShelob(s);
      if (!shelob) {
        log(s, "Rage and Hunger: Shelob is not in play.");
        return;
      }
      q.rage = {
        round: s.round,
        phase: phaseOf(s),
        count:
          (q.rage?.round === s.round && q.rage.phase === phaseOf(s)
            ? (q.rage.count ?? 1)
            : 0) + 1,
      };
      log(
        s,
        "Rage and Hunger: Shelob gets +2 attack until the end of the phase and makes an immediate attack against each player, in player order.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("immediateAttack", { target: shelob.id, player }),
        ),
      );
      return;
    }
    default:
      gollumTreachery(s, held.code);
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.shelobLair) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  const isShelob = !!enemy && enemy.code === SL.shelob;
  switch (code) {
    case SL.morgulOrc:
      c.slDiscardOnKill = true;
      log(
        s,
        "Morgul Orc: if this attack destroys a character, the defending player discards 1 random card from his hand.",
        "danger",
      );
      return true;
    case SL.underWay: {
      if (!enemy) return true;
      const dealt = dealEnemyShadows(s, enemy, 2);
      log(
        s,
        `The Under-way: the attacking enemy is dealt ${dealt.length} additional shadow card${dealt.length === 1 ? "" : "s"}.`,
        "danger",
      );
      prepend(s, ...dealt.map((x) => fx("shadowReveal", { code: x })));
      return true;
    }
    case SL.exhalation:
      prepend(
        s,
        fx("slDiscardAttachment", { text: "Exhalation of Decay", player: p }),
      );
      return true;
    case SL.openings: {
      const [active] = allActiveLocations(s);
      const x = active ? threatOfLocation(s, active) : 0;
      c.attackBonus += x;
      log(
        s,
        `Many Openings: the attacking enemy gets +${x} attack (the active location's threat).`,
        "danger",
      );
      return true;
    }
    case SL.poison:
      if (!isShelob) {
        log(s, "Shelob's Poison: the attacking enemy is not Shelob.");
        return true;
      }
      prepend(s, fx("slPoison", { player: p }));
      return true;
    case SL.malice: {
      if (!isShelob || !enemy) {
        log(s, "Lurking Malice: the attacking enemy is not Shelob.");
        return true;
      }
      enemy.resources += 1;
      c.attackBonus += enemy.resources;
      log(
        s,
        `Lurking Malice: 1 resource is placed on Shelob, and she gets +${enemy.resources} attack (1 for each resource on her).`,
        "danger",
      );
      return true;
    }
    case SL.rage:
      if (!isShelob) {
        log(s, "Rage and Hunger: the attacking enemy is not Shelob.");
        return true;
      }
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Rage and Hunger: Shelob makes an additional attack after this one.",
        "danger",
      );
      return true;
  }
  return gollumShadow(s, code);
}
/** A location's current threat (Many Openings included). */
function threatOfLocation(s: GameState, u: Unit) {
  return Math.max(
    0,
    (card(u.code).threat ?? 0) + (SHELOB_LAIR_HOOKS.threatBonus?.(s, u) ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Effects.

/** Each player but those with too few cards: the cost "discard X random cards from each player's hand". */
const handsHold = (s: GameState, amount: number) =>
  playerOrder(s).every((p) => seatView(s, p).hand.length >= amount);
function randomDiscard(s: GameState, amount: number, text: string, p: number) {
  const discarded: string[] = [];
  for (let n = 0; n < amount && s.hand.length; n++) {
    const i = Math.floor(random(s) * s.hand.length);
    const [card] = s.hand.splice(i, 1);
    s.discard.push(card.code);
    discarded.push(name(card));
  }
  log(
    s,
    discarded.length
      ? `${text}: ${who(s, p)} ${verb(s, "discard")} ${discarded.length === 1 ? "a random card" : `${discarded.length} random cards`} (${discarded.join(", ")}).`
      : `${text}: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
    discarded.length ? "danger" : undefined,
  );
}

export function shelobLairEffect(s: GameState, e: Effect): boolean {
  const q = s.shelobLair;
  if (!q) return false;
  if (gollumEffect(s, e)) return true;
  if (!e.kind.startsWith("sl")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...s.staging, ...globalEngaged(s)].find((x) => x.id === e.target))
    : undefined;
  switch (e.kind) {
    case "slTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "slTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // Setup (1A): Sméagol is put into play under the first player's control.
    case "slSetupSmeagol": {
      const card = s.staging.find((x) => x.code === SL.gollum);
      if (!card) return true;
      s.staging = s.staging.filter((x) => x.id !== card.id);
      const smeagol: Unit = {
        ...make(s, SL.smeagol),
        id: card.id,
        owner: first,
        controller: first,
      };
      forOwner(s, first, () => s.allies.push(smeagol));
      log(
        s,
        `The Stairs of Cirith Ungol: Sméagol is put into play under ${s.table ? `${seatName(s, first)}'s` : "the first player's"} control.`,
      );
      return true;
    }
    // Quest stages.
    case "slDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(q.currentQuest === SL.pass ? "slStageThree" : "slStageTwo", {
          player: first,
        }),
      );
      return true;
    }
    case "slStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = SL.pass;
      s.stageRevealing = true;
      log(s, "The Spider's Pass begins.", "chapter");
      prepend(s, fx("slPassRevealed", { player: first }), fx("stageRevealed"));
      return true;
    }
    case "slPassRevealed": {
      // 2A: Shelob joins the staging area; The Great Spider and the discard pile join the encounter deck.
      const i = q.setAside.indexOf(SL.shelob);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        const shelob = make(s, SL.shelob);
        s.staging.push(shelob);
        enemyAddedToStaging(s, shelob);
      }
      const spider = q.setAside.filter((c) => c !== SL.cleft);
      q.setAside = q.setAside.filter((c) => c === SL.cleft);
      s.encounterDeck.push(...spider, ...s.encounterDiscard);
      const discarded = s.encounterDiscard.length;
      s.encounterDiscard = [];
      shuffle(s, s.encounterDeck);
      log(
        s,
        `The Spider's Pass: Shelob is added to the staging area, and The Great Spider encounter set (${spider.length}) and the encounter discard pile (${discarded}) are shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "slStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = SL.betrayal;
      delete q.passProgress;
      delete q.allies;
      s.stageRevealing = true;
      log(s, "Gollum's Betrayal begins.", "chapter");
      prepend(
        s,
        fx("slBetrayalRevealed", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    case "slBetrayalRevealed": {
      // 3A: Cleft of Cirith Ungol joins the staging area; Sméagol turns; Shelob heals.
      const i = q.setAside.indexOf(SL.cleft);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        s.staging.push(make(s, SL.cleft));
        log(
          s,
          "Gollum's Betrayal: Cleft of Cirith Ungol is added to the staging area.",
          "danger",
        );
      }
      if (!flipToGollum(s, "Gollum's Betrayal"))
        log(s, "Gollum's Betrayal: Sméagol is not in play.");
      const shelob = slShelob(s);
      if (shelob) {
        if (shelob.damage > 0)
          log(
            s,
            `Gollum's Betrayal: all damage (${shelob.damage}) is healed from Shelob.`,
          );
        shelob.damage = 0;
      }
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("slFeed", { value: 1, text: "Gollum's Betrayal", player }),
        ),
      );
      return true;
    }
    case "slFeed":
      feedShelob(s, e.value ?? 1, e.text ?? "Shelob");
      return true;
    case "slStarve": {
      const shelob = slShelob(s);
      if (!shelob || shelob.resources <= 0) {
        log(s, `${e.text}: there is no resource on Shelob.`);
        return true;
      }
      shelob.resources -= 1;
      log(
        s,
        `${e.text}: 1 resource is removed from Shelob (${shelob.resources}).`,
        "good",
      );
      return true;
    }
    // Shelob's Forced effect at the beginning of the quest phase.
    case "slShelobForced": {
      const shelob = slShelob(s);
      if (!shelob || shelob.blanked) return true;
      choose(
        s,
        `Shelob · Choose one${seatLabel(s, first)}`,
        [
          {
            id: "resource",
            label: `Place 1 resource on Shelob (+1 threat each; ${shelob.resources} now)`,
            effects: [
              fx("slFeed", { value: 1, text: "Shelob", player: first }),
            ],
          },
          {
            id: "attack",
            label: "Shelob makes an immediate attack against the first player",
            effects: [fx("slShelobAttack", { text: "Shelob", player: first })],
          },
        ],
        "Forced: at the beginning of the quest phase, either place 1 resource on Shelob, or she makes an immediate attack against the first player.",
      );
      return true;
    }
    case "slShelobAttack":
      prepend(s, ...shelobAttacks(s, p, e.text ?? "Shelob"));
      return true;
    // 1B: the Response after Sméagol's Secret Way is explored.
    case "slStairsResponse": {
      const nazgul = s.staging.filter(
        (x) => isEnemy(x) && isNazgulCode(x.code),
      );
      if (!nazgul.length || !handsHold(s, 3)) return true;
      choose(
        s,
        `The Stairs of Cirith Ungol · Discard each Nazgûl enemy?${seatLabel(s, first)}`,
        [
          {
            id: "discard",
            label: `Discard 3 random cards from each player's hand to discard each Nazgûl enemy in the staging area (${nazgul.map((x) => name(x)).join(", ")})`,
            effects: [
              ...playerOrder(s).map((player) =>
                fx("slRandomDiscard", {
                  value: 3,
                  text: "The Stairs of Cirith Ungol",
                  player,
                }),
              ),
              fx("slDiscardNazgul", { player: first }),
            ],
          },
          { id: "skip", label: "Do not respond", effects: [] },
        ],
        "Response: after Sméagol's Secret Way is explored, discard 3 random cards from each player's hand to discard each Nazgûl enemy in the staging area.",
      );
      return true;
    }
    case "slDiscardNazgul": {
      const nazgul = s.staging.filter(
        (x) => isEnemy(x) && isNazgulCode(x.code),
      );
      for (const x of nazgul) {
        for (const a of [...x.attachments]) discardAttachment(s, x, a, true);
        s.staging = s.staging.filter((y) => y.id !== x.id);
        s.encounterDiscard.push(x.code, ...x.shadows);
      }
      log(
        s,
        nazgul.length
          ? `The Stairs of Cirith Ungol: ${nazgul.map((x) => name(x)).join(", ")} ${nazgul.length === 1 ? "is" : "are"} discarded.`
          : "The Stairs of Cirith Ungol: there is no Nazgûl enemy in the staging area.",
        nazgul.length ? "good" : undefined,
      );
      return true;
    }
    case "slAdvanceStairs":
      if (q.currentQuest !== SL.stairs || q.advancing) return true;
      q.advancing = true;
      log(
        s,
        "The Stairs of Cirith Ungol: Sméagol's Secret Way is in the victory display, so the players advance to stage 2A.",
        "good",
      );
      prepend(s, fx("slDefeat", { player: first }));
      return true;
    // Locations.
    case "slValeExplored":
      prepend(
        s,
        fx("slValeSearch", { player: first }),
        fx("pomShuffle", { text: "Morgul Vale", player: first }),
        fx("slValeChoice", { player: first }),
      );
      return true;
    case "slValeSearch": {
      const options = searchOptions(
        s,
        (c) => c === SL.wraith,
        "slValeWraith",
        first,
      );
      if (!options.length)
        log(
          s,
          "Morgul Vale: there is no Morgul Wraith in the encounter deck or discard pile.",
        );
      else if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          `Morgul Vale · Add a Morgul Wraith to the staging area${seatLabel(s, first)}`,
          options,
          "Forced: after Morgul Vale is explored, search the encounter deck and discard pile for a Morgul Wraith and add it to the staging area.",
        );
      return true;
    }
    case "slValeWraith": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const wraith = make(s, e.code);
      s.staging.push(wraith);
      enemyAddedToStaging(s, wraith);
      log(
        s,
        `Morgul Vale: ${name(wraith)} is added to the staging area from the ${e.text === "discard" ? "discard pile" : "encounter deck"}.`,
        "danger",
      );
      return true;
    }
    case "slValeChoice": {
      const ring = oneRing(s);
      const options: Option[] = [];
      if (ring && !ring.exhausted && !ring.blanked)
        options.push({
          id: "ring",
          label: "Exhaust The One Ring",
          effects: [
            fx("slExhaustRing", { text: "Morgul Vale", player: first }),
          ],
        });
      options.push({
        id: "discard",
        label: "Discard 1 random card from each player's hand",
        effects: playerOrder(s).map((player) =>
          fx("slRandomDiscard", { value: 1, text: "Morgul Vale", player }),
        ),
      });
      choose(
        s,
        `Morgul Vale · The first player must choose${seatLabel(s, first)}`,
        options,
        "Then, the first player must either exhaust The One Ring, or discard 1 random card from each player's hand.",
      );
      return true;
    }
    case "slExhaustRing": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) return true;
      ring.exhausted = true;
      log(s, `${e.text}: The One Ring is exhausted.`, "danger");
      SHELOB_LAIR_HOOKS.oneRingExhausted?.(s);
      return true;
    }
    case "slSecretWayExplored": {
      const ready = [...s.heroes, ...s.allies].filter((x) => !x.exhausted);
      const options: Option[] = ready.map((x) => ({
        id: x.id,
        code: x.code,
        label: `Exhaust ${name(x)}`,
        effects: [
          fx("slExhaust", {
            target: x.id,
            text: "Sméagol's Secret Way",
            player: p,
          }),
        ],
      }));
      options.push({
        id: "discard",
        label: "Discard 1 random card from your hand",
        effects: [
          fx("slRandomDiscard", {
            value: 1,
            text: "Sméagol's Secret Way",
            player: p,
          }),
        ],
      });
      choose(
        s,
        `Sméagol's Secret Way · Exhaust a character or discard a random card${seatLabel(s, p)}`,
        options,
        "Forced: after Sméagol's Secret Way is explored, each player either exhausts a character he controls, or discards 1 random card from his hand.",
      );
      return true;
    }
    case "slExhaust": {
      const x = e.target ? get(s, e.target) : undefined;
      if (!x || x.exhausted) return true;
      exhaustCharacter(s, x);
      log(s, `${e.text}: ${name(x)} is exhausted.`);
      return true;
    }
    case "slSecretWayTravel": {
      const smeagol = lsSmeagol(s);
      const options: Option[] = [];
      if (smeagol && !smeagol.exhausted)
        options.push({
          id: "smeagol",
          label: "Exhaust Sméagol",
          effects: [
            fx("pomExhaustSmeagol", {
              text: "Sméagol's Secret Way",
              player: first,
            }),
          ],
        });
      if (handsHold(s, 1))
        options.push({
          id: "discard",
          label: "Discard 1 random card from each player's hand",
          effects: playerOrder(s).map((player) =>
            fx("slRandomDiscard", {
              value: 1,
              text: "Sméagol's Secret Way",
              player,
            }),
          ),
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        choose(
          s,
          `Sméagol's Secret Way · Travel cost${seatLabel(s, first)}`,
          options,
          "Travel: either exhaust Sméagol, or discard 1 random card from each player's hand.",
        );
      return true;
    }
    case "slTunnelActive": {
      const tunnel = s.staging.find((x) => x.id === e.target);
      if (!tunnel) return true;
      const prior = s.activeLocation;
      if (prior && prior.id !== tunnel.id) {
        s.activeLocation = null;
        s.staging.push(prior);
        log(
          s,
          `Blocked Tunnel: ${name(prior)} returns to the staging area.`,
          "danger",
        );
      }
      log(s, "Blocked Tunnel becomes the active location.", "danger");
      prepend(
        s,
        fx("travelEnter", { target: tunnel.id, flag: true, player: first }),
      );
      return true;
    }
    case "slTunnelAction": {
      const tunnel = [...allActiveLocations(s), ...s.staging].find(
        (x) => x.id === e.target,
      );
      if (!tunnel) return true;
      const options = weaponCharacters(s, p).map((x) => ({
        id: x.id,
        code: x.code,
        label: name(x),
        effects: [
          fx("slTunnelProgress", {
            target: tunnel.id,
            source: x.id,
            player: p,
          }),
        ],
      }));
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        choose(
          s,
          `Blocked Tunnel · Exhaust a character with a Weapon attachment${seatLabel(s, p)}`,
          options,
          "Action: exhaust a character with a Weapon attachment to place 3 progress on Blocked Tunnel.",
        );
      return true;
    }
    case "slTunnelProgress": {
      const x = e.source ? get(s, e.source) : undefined;
      const tunnel = [...allActiveLocations(s), ...s.staging].find(
        (y) => y.id === e.target,
      );
      if (!x || x.exhausted || !tunnel) return true;
      exhaustCharacter(s, x);
      log(
        s,
        `Blocked Tunnel: ${name(x)} is exhausted to place 3 progress on Blocked Tunnel.`,
        "good",
      );
      progressLocation(s, tunnel, 3);
      return true;
    }
    // Treacheries and shadows.
    case "slRandomDiscard":
      randomDiscard(s, e.value ?? 1, e.text ?? "Shelob's Lair", p);
      return true;
    case "slDiscardAttachment": {
      const attachments = [...s.heroes, ...s.allies].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              card(a.code).type_code !== "objective" &&
              card(a.code).sphere_code !== "encounter",
          )
          .map((a) => ({ host, a })),
      );
      if (!attachments.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} ${s.table ? "controls" : "control"} no non-objective attachment.`,
        );
        return true;
      }
      choose(
        s,
        `${e.text} · Discard a non-objective attachment you control${seatLabel(s, p)}`,
        attachments.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} · ${name(host)}`,
          effects: [
            fx("slDiscard", {
              target: host.id,
              source: a.id,
              text: e.text,
              player: p,
            }),
          ],
        })),
        "Discard a non-objective attachment you control.",
      );
      return true;
    }
    case "slDiscard": {
      const host = e.target ? get(s, e.target) : undefined;
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) {
        discardAttachment(s, host, a);
        log(s, `${e.text}: ${card(a.code).name} is discarded.`, "danger");
      }
      return true;
    }
    case "slPoison": {
      const heroes = s.heroes.filter(
        (h) => !h.attachments.some((a) => a.code === SL.poison),
      );
      if (!heroes.length) {
        log(
          s,
          `Shelob's Poison: ${who(s, p)} ${s.table ? "controls" : "control"} no hero without Shelob's Poison.`,
        );
        return true;
      }
      choose(
        s,
        `Shelob's Poison · Attach to a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("slPoisonAttach", { target: h.id, source: e.source, player: p }),
          ],
        })),
        "When Revealed: attach to a hero you control and exhaust that hero. (Counts as a Condition attachment: limit 1 per hero; treat attached hero's text box as blank, except for Traits; attached hero cannot ready.)",
      );
      return true;
    }
    case "slPoisonAttach": {
      const hero = e.target ? get(s, e.target) : undefined;
      if (!hero) return true;
      // From a revealed copy, the card leaves the resolving pile; from a shadow, a new copy is not created.
      let id = make(s, SL.poison).id;
      if (e.source) {
        const i = q.resolving.findIndex((x) => x.id === e.source);
        if (i >= 0) id = q.resolving.splice(i, 1)[0].id;
      } else {
        // From a shadow: the shadow card itself is attached.
        const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
        if (enemy) takeShadow(enemy, SL.poison);
      }
      hero.attachments.push({ id, code: SL.poison, exhausted: false });
      if (!hero.exhausted) exhaustCharacter(s, hero);
      log(
        s,
        `Shelob's Poison is attached to ${name(hero)}: its text box is blank, except for Traits, and it cannot ready.`,
        "danger",
      );
      return true;
    }
    case "slMalice": {
      const shelob = slShelob(s);
      if (!shelob) {
        log(s, "Lurking Malice: Shelob is not in play.");
        return true;
      }
      choose(
        s,
        `Lurking Malice · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "resource",
            label: `Place 1 resource on Shelob (${shelob.resources} now)`,
            effects: [
              fx("slFeed", { value: 1, text: "Lurking Malice", player: p }),
            ],
          },
          {
            id: "attack",
            label: "Shelob makes an immediate attack against you",
            effects: [
              fx("slShelobAttack", { text: "Lurking Malice", player: p }),
            ],
          },
        ],
        "Peril. When Revealed: either place 1 resource on Shelob, or she makes an immediate attack against you.",
      );
      return true;
    }
    case "slExtraShadows": {
      if (!u) return true;
      const dealt = dealEnemyShadows(s, u, e.value ?? 1);
      log(
        s,
        `The Under-way: ${name(u)} engaged a player and is dealt ${dealt.length} shadow card${dealt.length === 1 ? "" : "s"}.`,
        "danger",
      );
      return true;
    }
    // Peril: Morgul Orc and Orc of Cirith Ungol.
    case "slMorgulOrc":
      choose(
        s,
        `Morgul Orc · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: "Discard 1 random card from your hand",
            effects: [
              fx("slRandomDiscard", {
                value: 1,
                text: "Morgul Orc",
                player: p,
              }),
            ],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
        "Peril. When Revealed: either discard 1 random card from your hand, or reveal an additional encounter card.",
      );
      return true;
    case "slCirithOrc": {
      const orc = u;
      const options: Option[] = [
        {
          id: "discard",
          label: "Discard 1 random card from each player's hand",
          effects: playerOrder(s).map((player) =>
            fx("slRandomDiscard", {
              value: 1,
              text: "Orc of Cirith Ungol",
              player,
            }),
          ),
        },
      ];
      if (orc)
        options.push({
          id: "attack",
          label: "Orc of Cirith Ungol makes an immediate attack against you",
          effects: [fx("immediateAttack", { target: orc.id, player: p })],
        });
      choose(
        s,
        `Orc of Cirith Ungol · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: either discard 1 random card from each player's hand, or Orc of Cirith Ungol makes an immediate attack against you.",
      );
      return true;
    }
  }
  return false;
}
/** Take a revealed shadow card off its enemy, keeping the shadow bookkeeping aligned. */
function takeShadow(enemy: Unit, code: string) {
  const revealed = enemy.revealedShadowCount ?? enemy.shadows.length;
  let i = -1;
  for (let k = Math.min(revealed, enemy.shadows.length) - 1; k >= 0; k--)
    if (enemy.shadows[k] === code) {
      i = k;
      break;
    }
  if (i < 0) i = enemy.shadows.indexOf(code);
  if (i < 0) return false;
  enemy.shadows.splice(i, 1);
  enemy.faceupShadows?.splice(i, 1);
  if (enemy.revealedShadowCount !== undefined && i < enemy.revealedShadowCount)
    enemy.revealedShadowCount--;
  return true;
}
/** Characters the player controls with a Weapon attachment, ready to exhaust. */
function weaponCharacters(s: GameState, p: number) {
  return seatView(s, p)
    .heroes.concat(seatView(s, p).allies)
    .filter(
      (x) =>
        !x.exhausted &&
        x.attachments.some((a) =>
          (card(a.code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Weapon"),
        ),
    );
}

// ---------------------------------------------------------------------------
// Hooks.

export const SHELOB_LAIR_HOOKS: Batch4ScenarioHooks = {
  setup: setupShelobLair,
  openingHandsKept: (s) => {
    if (!s.shelobLair || s.round > 0) return false;
    prepend(
      s,
      fx("slSetupSmeagol", { player: firstPlayer(s) }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: shelobLairStageInfo,
  check: (s) => {
    if (!s.shelobLair || s.status !== "playing") return;
    lotrSagaCheck(s);
    if (s.status !== "playing" || s.round < 1) return;
    if (s.choice || s.queue.length) return;
    // Gollum engages the first player.
    gollumFollows(s);
    // Cleft of Cirith Ungol in the victory display: Shelob engages the first player.
    const shelob = slShelob(s);
    if (shelob && cleftTaken(s) && !shelob.blanked && !at(s, SL.pass)) {
      const first = firstPlayer(s);
      if (!seatView(s, first).engaged.some((x) => x.id === shelob.id))
        forOwner(s, first, () => engage(s, shelob));
    }
  },
  encounter,
  shadow,
  firstPlayerChanged: (s, refresh) => {
    if (!s.shelobLair) return;
    smeagolFollows(s);
    prepend(
      s,
      fx("pomGollumFollows", { flag: refresh, player: firstPlayer(s) }),
    );
  },
  // Sméagol: after the players quest unsuccessfully, flip him to Gollum.
  failedQuest: (s) => {
    const q = s.shelobLair;
    if (!q || q.failedRound === s.round || !lsSmeagol(s)) return false;
    q.failedRound = s.round;
    prepend(
      s,
      fx("pomSmeagolFlips", { text: "Sméagol", player: firstPlayer(s) }),
    );
    return false;
  },
  // Gollum flips to Sméagol when he is defeated; at 3B he goes to the victory display.
  enemyDestination: (s, u, destruction) => {
    if (!s.shelobLair || !destruction || u.code !== SL.gollum) return false;
    if (s.shelobLair.currentQuest === SL.betrayal && !s.shelobLair.advancing) {
      (s.victoryCards ??= []).push(SL.gollum);
      log(s, "Gollum is defeated: he is added to the victory display.", "good");
      return true;
    }
    gollumDefeated(s, u);
    return true;
  },
  characterDestroyed: (s, u, context) => {
    const q = s.shelobLair;
    if (!q || !isCharacter(u)) return;
    if (u.code === SL.smeagol) {
      lose(s, "Sméagol is destroyed. The players lose the game.");
      return;
    }
    const c = s.combat;
    if (!c || !context.combatDamage || context.enemyId !== c.enemyId) return;
    if (c.slDiscardOnKill) {
      delete c.slDiscardOnKill;
      prepend(
        s,
        fx("slRandomDiscard", {
          value: 1,
          text: "Morgul Orc",
          player: c.attackPlayer ?? activeSeat(s),
        }),
      );
    }
  },
  // Shelob, at the beginning of the quest phase.
  questBegin: (s) => {
    const shelob = slShelob(s);
    return shelob && !shelob.blanked
      ? [fx("slShelobForced", { player: firstPlayer(s) })]
      : [];
  },
  // 1B: at the end of the quest phase, with Sméagol's Secret Way in the victory display.
  endQuest: (s) => {
    if (at(s, SL.stairs) && inVictory(s, SL.secretWay))
      prepend(s, fx("slAdvanceStairs", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (!s.shelobLair || u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === SL.vale) prepend(s, fx("slValeExplored", { player: first }));
    if (u.code === SL.secretWay)
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("slSecretWayExplored", { player }),
        ),
        ...(at(s, SL.stairs)
          ? [fx("slStairsResponse", { player: first })]
          : []),
      );
    if (u.code === SL.spidersLair)
      prepend(s, fx("slStarve", { text: "The Spider's Lair", player: first }));
  },
  travelEntered: (s, u) => {
    if (s.shelobLair && live(u, SL.spidersLair))
      prepend(
        s,
        fx("slShelobAttack", {
          text: "The Spider's Lair",
          player: firstPlayer(s),
        }),
      );
  },
  cardEntered: (s, u, fromReveal, cancel) => {
    if (!s.shelobLair || !fromReveal || cancel) return;
    if (u.code === SL.tunnel)
      prepend(
        s,
        fx("slTunnelActive", { target: u.id, player: firstPlayer(s) }),
      );
    // Peril: the revealing player resolves the When Revealed effects.
    if (u.code === SL.morgulOrc)
      prepend(s, fx("slMorgulOrc", { target: u.id, player: activeSeat(s) }));
    if (u.code === SL.cirithOrc)
      prepend(s, fx("slCirithOrc", { target: u.id, player: activeSeat(s) }));
  },
  travelProblem: (s, u) => {
    if (!s.shelobLair || u.blanked) return null;
    if (u.code === SL.passage) {
      const smeagol = lsSmeagol(s);
      return smeagol && !smeagol.exhausted
        ? null
        : "Deep Dark Passage: exhaust Sméagol to travel here.";
    }
    if (u.code === SL.den || u.code === SL.cleft)
      return slShelob(s)
        ? null
        : `${name(u)}: place 1 resource on Shelob to travel here.`;
    if (u.code === SL.secretWay) {
      const smeagol = lsSmeagol(s);
      return (smeagol && !smeagol.exhausted) || handsHold(s, 1)
        ? null
        : "Sméagol's Secret Way: exhaust Sméagol or discard 1 random card from each player's hand to travel here.";
    }
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.shelobLair || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === SL.passage)
      return [fx("pomExhaustSmeagol", { text: name(u), player: first })];
    if (u.code === SL.den || u.code === SL.cleft)
      return [fx("slFeed", { value: 1, text: name(u), player: first })];
    if (u.code === SL.secretWay)
      return [fx("slSecretWayTravel", { player: first })];
    return undefined;
  },
  // 1B: progress cannot be placed on Underground locations.
  locationProgressBlocked: (s, u) => at(s, SL.stairs) && isUnderground(u),
  // Deep Dark Passage: progress on locations in the staging area is reduced by 1.
  locationProgressAmount: (s, u, amount) => {
    if (!s.shelobLair || !s.staging.some((x) => x.id === u.id)) return amount;
    const passages = stagingCount(s, SL.passage);
    return passages ? Math.max(0, amount - passages) : amount;
  },
  // 2B: no more than 4 progress on this stage each round.
  progress: (s, amount, quest) => {
    const q = s.shelobLair;
    if (!q || !at(s, SL.pass) || quest.id !== mainQuestUnit(s)?.id)
      return amount;
    const placed =
      q.passProgress?.round === s.round ? q.passProgress.amount : 0;
    const allowed = Math.max(0, Math.min(amount, SL_PASS_PROGRESS - placed));
    if (allowed < amount)
      log(
        s,
        `The Spider's Pass: no more than ${SL_PASS_PROGRESS} progress can be placed on this stage each round (${allowed} of ${amount}).`,
      );
    q.passProgress = { round: s.round, amount: placed + allowed };
    return allowed;
  },
  threatBonus: (s, u) => {
    const q = s.shelobLair;
    if (!q) return 0;
    if (live(u, SL.shelob)) return u.resources;
    if (isLocation(u) && q.openings?.round === s.round)
      return (q.openings.ids ?? []).filter((id) => id === u.id).length;
    return 0;
  },
  engagementBonus: (s, u) =>
    morgulWraithEngagement(s, u) +
    (s.shelobLair && isOrc(u) ? -5 * stagingCount(s, SL.underWay) : 0),
  engaged: (s, u) => {
    if (!s.shelobLair || !isOrc(u)) return;
    const ways = stagingCount(s, SL.underWay);
    if (ways)
      prepend(
        s,
        fx("slExtraShadows", {
          target: u.id,
          value: ways,
          player: activeSeat(s),
        }),
      );
  },
  immune: morgulWraithImmune,
  cannotAttach: (s, u, code) =>
    morgulWraithCannotAttach(s, u, code) ||
    (!!s.shelobLair && live(u, SL.shelob)),
  stats: (s, u) => {
    const q = s.shelobLair;
    if (!q || !live(u, SL.shelob)) return {};
    let attack = 0;
    if (cleftTaken(s)) attack += 2;
    if (q.rage?.round === s.round && q.rage.phase === phaseOf(s))
      attack += 2 * (q.rage.count ?? 1);
    return attack ? { attack } : {};
  },
  // Shelob is Indestructible until Cleft of Cirith Ungol is in the victory display.
  indestructible: (s, u) =>
    !!s.shelobLair && live(u, SL.shelob) && !cleftTaken(s),
  // 2B: Shelob cannot leave the staging area.
  cannotLeave: (s, u) => at(s, SL.pass) && live(u, SL.shelob),
  cannotEngage: (s, u) => at(s, SL.pass) && live(u, SL.shelob),
  // 2B: Sméagol cannot attack or defend.
  cannotDefend: (s, _enemy, defender) =>
    !!defender && at(s, SL.pass) && defender.code === SL.smeagol,
  cannotAttack: (s, character) =>
    at(s, SL.pass) && character.code === SL.smeagol,
  // 2B: each player cannot play, or put into play, more than 1 ally each round.
  allyEntryProblem: (s) => {
    const q = s.shelobLair;
    if (!q || !at(s, SL.pass)) return null;
    const count =
      q.allies?.round === s.round
        ? (q.allies.count[String(activeSeat(s))] ?? 0)
        : 0;
    return count >= 1
      ? "The Spider's Pass: each player cannot play, or put into play, more than 1 ally each round."
      : null;
  },
  allyEntering: (s, u) => {
    const q = s.shelobLair;
    if (!q || !isAlly(u) || u.code === SL.smeagol) return;
    if (q.allies?.round !== s.round) q.allies = { round: s.round, count: {} };
    const key = String(ownerOf(s, u));
    q.allies.count[key] = (q.allies.count[key] ?? 0) + 1;
  },
  // 3B: while Shelob has a resource, damage dealt to her is canceled and a resource discarded.
  replaceDamage: (s, u, amount) => {
    if (
      !at(s, SL.betrayal) ||
      !live(u, SL.shelob) ||
      amount <= 0 ||
      u.resources <= 0
    )
      return false;
    u.resources -= 1;
    log(
      s,
      `Gollum's Betrayal: the ${amount} damage dealt to Shelob is canceled, and 1 resource is discarded from her instead (${u.resources} left).`,
      "danger",
    );
    return true;
  },
  // Shelob's Poison: the attached hero's text box is blank, and it cannot ready.
  characterBlanked: (s, u) =>
    !!s.shelobLair &&
    isHero(u) &&
    u.attachments.some((a) => a.code === SL.poison),
  cannotReady: (s, u) =>
    !!s.shelobLair &&
    isHero(u) &&
    u.attachments.some((a) => a.code === SL.poison),
  // Den of Night: after a When Revealed effect is canceled, 1 resource on Shelob.
  whenRevealedCancelled: (s) => {
    const dens = stagingCount(s, SL.den);
    if (s.shelobLair && dens) feedShelob(s, dens, "Den of Night");
  },
  abilityLabel: (code) =>
    code === SL.tunnel
      ? "Blocked Tunnel · Exhaust a character with a Weapon attachment to place 3 progress"
      : undefined,
  abilityProblem: (s, u) => {
    if (!s.shelobLair || u.code !== SL.tunnel) return "Not Blocked Tunnel.";
    if (![...allActiveLocations(s), ...s.staging].some((x) => x.id === u.id))
      return "Blocked Tunnel is not in play.";
    return weaponCharacters(s, activeSeat(s)).length
      ? null
      : "Blocked Tunnel: you control no ready character with a Weapon attachment.";
  },
  ability: (s, u) => {
    if (!s.shelobLair || u.code !== SL.tunnel) return false;
    prepend(s, fx("slTunnelAction", { target: u.id, player: activeSeat(s) }));
    return true;
  },
  roundEnd: (s) => {
    const q = s.shelobLair;
    if (q) {
      delete q.openings;
      delete q.rage;
      delete q.passProgress;
      delete q.allies;
    }
    return [];
  },
  effect: shelobLairEffect,
  sharedEffect: (e) =>
    [
      ...GOLLUM_SHARED_EFFECTS,
      "slTreacheryDone",
      "slDefeat",
      "slStageTwo",
      "slPassRevealed",
      "slStageThree",
      "slBetrayalRevealed",
      "slFeed",
      "slStarve",
      "slAdvanceStairs",
      "slDiscardNazgul",
      "slValeExplored",
      "slValeWraith",
      "slTunnelActive",
      "slExtraShadows",
    ].includes(e.kind),
};
