import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  spendResources,
  threatOf,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  discardLocation,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestCode, mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { hasTrait } from "./expansion-passives";
import {
  fellowshipPayers,
  gollumDefeated,
  gollumEffect,
  gollumFollows,
  gollumShadow,
  gollumTreachery,
  lsGollum,
  lsSmeagol,
  morgulWraithCannotAttach,
  morgulWraithEngagement,
  morgulWraithImmune,
  searchOptions,
  smeagolFollows,
  takeFrom,
  takeVictory,
} from "./land-shadow-gollum";
import {
  POM,
  POM_VICTORY_LOCATIONS,
  PASSAGE_MARSHES_RECIPES,
  mireValue,
  passageMarshesStageInfo,
} from "./passage-marshes-support";
export * from "./passage-marshes-support";

/**
 * The Passage of the Marshes, the first scenario of The Land of Shadow. The
 * first player controls the Ring-bearer, Frodo Baggins, and Gollum, engaged
 * with him from the start, must be defeated and flipped to Sméagol before the
 * players can advance. Locations with the Mire keyword gather a mire token at
 * the end of each refresh phase and are discarded, with a Forced effect,
 * once they hold as many as their Mire value.
 */
const TREACHERIES: readonly string[] = [
  POM.creeping,
  POM.reek,
  POM.fellLight,
  POM.hates,
  POM.call,
];
/** The current quest's text is in effect (not while a stage resolves its When Revealed effects). */
const stageLive = (s: GameState) =>
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked &&
  !s.passageMarshes?.advancing;
const at = (s: GameState, quest: string) =>
  s.passageMarshes?.currentQuest === quest && stageLive(s);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const isLocationCode = (c: string) => card(c).type_code === "location";
const traitOf = (c: string, trait: string) =>
  (card(c).traits ?? "").split(".").some((t) => t.trim() === trait);
const isUndeadCode = (c: string) =>
  card(c).type_code === "enemy" && traitOf(c, "Undead");
const isUndead = (u: Unit) => isEnemy(u) && hasTrait(u, "Undead");
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const Who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "You");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const players = (s: GameState) => globalPlayerOrder(s).length;
/** Sméagol, the objective-ally the first player controls. */
export const pomSmeagol = lsSmeagol;
/** Gollum, the enemy side of the card. */
export const pomGollum = lsGollum;
/** "The first player controls Sméagol." */
const smeagolWithFirst = (s: GameState) => {
  const u = pomSmeagol(s);
  return !!u && ownerOf(s, u) === firstPlayer(s);
};
const stagingLocations = (s: GameState) => s.staging.filter(isLocation);
const victoryLocations = (s: GameState) =>
  (s.victoryCards ?? []).filter(isLocationCode);
const mireLocations = (s: GameState) =>
  s.staging.filter((u) => isLocation(u) && !u.blanked && mireValue(u.code));
/** Locations with as many mire tokens as their Mire value. */
const mired = (s: GameState) =>
  [...allActiveLocations(s), ...s.staging].filter(
    (u) =>
      isLocation(u) &&
      !u.blanked &&
      mireValue(u.code) > 0 &&
      u.resources >= mireValue(u.code),
  );
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** The index of the topmost Undead enemy in the encounter discard pile. */
function topmostUndead(s: GameState) {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (isUndeadCode(s.encounterDiscard[i])) return i;
  return -1;
}
// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupPassageMarshes(s: GameState) {
  const r = PASSAGE_MARSHES_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A puts Gollum into play engaged with the first player once the players
  // have their opening hands.
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.passageMarshes = {
    currentQuest: POM.taming,
    advancing: false,
    resolving: [],
  };
  log(
    s,
    "The Taming of Sméagol: Gollum is put into play engaged with the first player, and each player searches the encounter deck for 1 location.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.passageMarshes;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = passageMarshesStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Each stage: the players cannot advance unless the first player controls Sméagol.
  if (!smeagolWithFirst(s)) return true;
  // 2B: and there are at least 4 locations in the victory display.
  if (at(s, POM.across) && victoryLocations(s).length < POM_VICTORY_LOCATIONS)
    return true;
  if (q.currentQuest === POM.lights) {
    win(s);
    s.reason =
      '"Don\'t Look at the Lights!" is defeated with Sméagol as guide: the hobbits cross the Dead Marshes, and the players win the game.';
    return true;
  }
  q.advancing = true;
  prepend(s, fx("pomDefeat", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// The Mire keyword.

/** Place mire tokens on locations, then discard those that reached their Mire value. */
function placeMire(s: GameState, targets: Unit[], text: string) {
  for (const u of targets) u.resources += 1;
  if (targets.length)
    log(
      s,
      `${text}: 1 mire token is placed on ${targets.map((u) => `${name(u)} (${u.resources} of ${mireValue(u.code)})`).join(", ")}.`,
      "danger",
    );
  mireDiscard(s);
}
/** The Mire keyword: discard each location holding as many mire tokens as its Mire value. */
function mireDiscard(s: GameState) {
  const first = firstPlayer(s);
  const forced: Effect[] = [];
  for (const u of mired(s)) {
    log(
      s,
      `${name(u)} has ${u.resources} mire token${u.resources === 1 ? "" : "s"} and is discarded by the Mire keyword.`,
      "danger",
    );
    u.resources = 0;
    discardLocation(s, u);
    forced.push(fx("pomMireForced", { code: u.code, player: first }));
  }
  prepend(s, ...forced);
}

// ---------------------------------------------------------------------------
// Gollum and Sméagol.

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.passageMarshes;
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
    fx("pomTreachery", { code, source: u.id, player }),
    fx("pomTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const q = s.passageMarshes!;
  const p = activeSeat(s);
  switch (held.code) {
    case POM.creeping: {
      // Attach to the current quest, as a Condition attachment.
      const code = mainQuestCode(s);
      if (!code) return;
      q.resolving = q.resolving.filter((x) => x.id !== held.id);
      ((s.questAttachments ??= {})[code] ??= []).push({
        id: held.id,
        code: POM.creeping,
        exhausted: false,
      });
      log(
        s,
        `Creeping Marshes is attached to ${passageMarshesStageInfo(s)?.name ?? "the current quest"}: at the end of the refresh phase it places 1 mire token on each location in the staging area, then it is discarded.`,
        "danger",
      );
      return;
    }
    case POM.reek:
      prepend(s, fx("pomReek", { player: p }));
      return;
    case POM.fellLight:
      prepend(s, fx("pomFellLight", { player: p }));
      return;
    default:
      gollumTreachery(s, held.code);
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.passageMarshes) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    case POM.groping:
      c.pomMireOnKill = true;
      log(
        s,
        "Groping Dead: if this attack destroys a character, 1 mire token is placed on the active location.",
        "danger",
      );
      return true;
    case POM.deadThings: {
      const undead = seatView(s, p).engaged.filter(isUndead).length;
      log(
        s,
        `Dead Things: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${undead} (1 for each Undead enemy engaged with ${s.table ? "them" : "you"}).`,
        "danger",
      );
      if (undead) forOwner(s, p, () => raiseThreat(s, undead, "encounter"));
      return true;
    }
    case POM.candle:
      if (enemy) enemy.roundCannotTakeDamage = true;
      log(
        s,
        "Candle-bearer: until the end of the round, the attacking enemy cannot take damage.",
        "danger",
      );
      return true;
    case POM.fens: {
      const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      if (!defender) {
        log(s, "Evil-smelling Fens: there is no defending character.");
        return true;
      }
      log(
        s,
        `Evil-smelling Fens: 1 damage is dealt to ${name(defender)}.`,
        "danger",
      );
      prepend(
        s,
        fx("damage", {
          target: defender.id,
          value: 1,
          player: ownerOf(s, defender),
        }),
      );
      return true;
    }
    case POM.reek: {
      const threat = enemy ? threatOf(s, enemy) : 0;
      log(
        s,
        `Bitter Reek: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by the attacking enemy's threat (${threat}).`,
        "danger",
      );
      if (threat) forOwner(s, p, () => raiseThreat(s, threat, "encounter"));
      return true;
    }
    case POM.fellLight: {
      const i = topmostUndead(s);
      if (i < 0) {
        log(s, "A Fell Light: there is no Undead enemy in the discard pile.");
        return true;
      }
      const [returned] = s.encounterDiscard.splice(i, 1);
      const u = make(s, returned);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(
        s,
        `A Fell Light: ${name(u)} returns from the discard pile to the staging area.`,
        "danger",
      );
      return true;
    }
  }
  return gollumShadow(s, code);
}

// ---------------------------------------------------------------------------
// Effects.

export function passageMarshesEffect(s: GameState, e: Effect): boolean {
  const q = s.passageMarshes;
  if (!q || !e.kind.startsWith("pom")) return false;
  if (gollumEffect(s, e)) return true;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s);
  const u = e.target ? get(s, e.target) : undefined;
  switch (e.kind) {
    case "pomTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "pomTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // Setup (1A).
    case "pomSetupGollum": {
      const gollum = s.staging.find((x) => x.code === POM.gollum);
      if (!gollum) return true;
      log(
        s,
        "The Taming of Sméagol: Gollum is put into play engaged with the first player.",
        "danger",
      );
      forOwner(s, first, () => engage(s, gollum));
      return true;
    }
    case "pomSetupSearch": {
      const options = searchOptions(s, isLocationCode, "pomRevealSearched", p, [
        "deck",
      ]);
      if (!options.length) {
        log(
          s,
          `The Taming of Sméagol: ${who(s, p)} find${s.table ? "s" : ""} no location in the encounter deck.`,
        );
        return true;
      }
      choose(
        s,
        `The Taming of Sméagol · Reveal a location${seatLabel(s, p)}`,
        options,
        "Setup: each player searches the encounter deck for 1 location, reveals it, and adds it to the staging area.",
      );
      return true;
    }
    case "pomRevealSearched": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      log(
        s,
        `${Who(s, p)} ${verb(s, "reveal")} ${card(e.code).name} from the encounter ${e.text === "discard" ? "discard pile" : "deck"}.`,
        "danger",
      );
      revealed(s, e.code, undefined, "encounter");
      return true;
    }
    // Quest stages.
    case "pomDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(q.currentQuest === POM.taming ? "pomStageTwo" : "pomStageThree", {
          player: first,
        }),
      );
      return true;
    }
    case "pomStageTwo":
      q.advancing = false;
      delete q.gollumDefense;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = POM.across;
      s.stageRevealing = true;
      log(s, "Across the Marshes begins.", "chapter");
      prepend(
        s,
        fx("pomAcrossRevealed", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    case "pomAcrossRevealed": {
      // 2A: if fewer locations than players are in the staging area,
      // discard until a location is discarded and add it to the staging area.
      if (stagingLocations(s).length >= players(s)) {
        log(
          s,
          "Across the Marshes: the staging area holds at least as many locations as there are players.",
        );
        return true;
      }
      const discarded: string[] = [];
      let location: string | undefined;
      while (
        !location &&
        [...s.encounterDeck, ...s.encounterDiscard].some(isLocationCode)
      ) {
        const code = encounterDraw(s);
        if (!code) break;
        if (isLocationCode(code)) location = code;
        else {
          s.encounterDiscard.push(code);
          discarded.push(code);
        }
      }
      if (location) {
        const added = make(s, location);
        s.staging.push(added);
      }
      log(
        s,
        `Across the Marshes: ${discarded.length ? `${discarded.map((c) => card(c).name).join(", ")} ${discarded.length === 1 ? "is" : "are"} discarded` : "no card is discarded"}${location ? `, and ${card(location).name} is added to the staging area` : ", and no location is found"}.`,
        "danger",
      );
      return true;
    }
    case "pomStageThree":
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = POM.lights;
      s.stageRevealing = true;
      log(s, '"Don\'t Look at the Lights!" begins.', "chapter");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("pomUndeadSearch", { player })),
        fx("pomVictoryShuffle", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    case "pomUndeadSearch": {
      const options = searchOptions(s, isUndeadCode, "pomUndeadEngage", p);
      if (!options.length) {
        log(
          s,
          `"Don't Look at the Lights!": ${who(s, p)} find${s.table ? "s" : ""} no Undead enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `"Don't Look at the Lights!" · Put an Undead enemy into play engaged with ${s.table ? "you" : "you"}${seatLabel(s, p)}`,
        options,
        "When Revealed: each player searches the encounter deck and discard pile for an Undead enemy and puts it into play engaged with him.",
      );
      return true;
    }
    case "pomUndeadEngage": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const enemy = make(s, e.code);
      s.staging.push(enemy);
      log(
        s,
        `${card(e.code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      engage(s, enemy);
      return true;
    }
    case "pomVictoryShuffle": {
      const locations = victoryLocations(s);
      for (const code of locations) takeVictory(s, code);
      s.encounterDeck.push(...locations);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `"Don't Look at the Lights!": ${locations.length} location${locations.length === 1 ? "" : "s"} in the victory display ${locations.length === 1 ? "is" : "are"} shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    // The Mire keyword.
    case "pomMireRound": {
      placeMire(s, mireLocations(s), "Mire");
      return true;
    }
    case "pomCreeping": {
      const code = mainQuestCode(s);
      const host = mainQuestUnit(s);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!code || !host || !a) return true;
      if (!a.blanked) placeMire(s, mireLocations(s), "Creeping Marshes");
      const holder = mainQuestUnit(s);
      if (holder?.attachments.some((x) => x.id === a.id)) {
        discardAttachment(s, holder, a);
        log(s, "Creeping Marshes is discarded.");
      }
      return true;
    }
    case "pomMireForced":
      mireForced(s, e.code!, p);
      return true;
    case "pomQuagmireReturn": {
      const locations = victoryLocations(s);
      if (!locations.length) return true;
      const code = locations[Math.floor(random(s) * locations.length)];
      takeVictory(s, code);
      s.staging.push(make(s, code));
      log(
        s,
        `Shifting Quagmire: ${card(code).name} returns at random from the victory display to the staging area.`,
        "danger",
      );
      return true;
    }
    case "pomMereReveal": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      log(
        s,
        `Haunted Mere: ${card(e.code).name} is revealed from the encounter ${e.text === "discard" ? "discard pile" : "deck"}.`,
        "danger",
      );
      revealed(s, e.code, undefined, "encounter");
      return true;
    }
    case "pomThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "pomFens": {
      const characters = globalCharacters(s);
      log(
        s,
        "Evil-smelling Fens: 1 damage is dealt to each character.",
        "danger",
      );
      prepend(
        s,
        ...characters.map((c) =>
          fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
        ),
      );
      return true;
    }
    // Travel costs.
    case "pomSpendFellowship": {
      const payer = fellowshipPayers(s)[0];
      if (!payer) return true;
      forOwner(s, ownerOf(s, payer), () => spendResources(s, payer, 1));
      log(
        s,
        `${name(payer)} spends 1 Fellowship resource to travel to ${e.text}.`,
      );
      return true;
    }
    // Gollum and Sméagol.
    case "pomGollumDefense": {
      if (!u || !live(u, POM.gollum)) return true;
      const top = encounterDraw(s);
      if (!top) {
        log(
          s,
          "The Taming of Sméagol: the encounter deck is empty, so Gollum gets no defense bonus.",
        );
        return true;
      }
      s.encounterDiscard.push(top);
      const value = card(top).threat ?? 0;
      q.gollumDefense = { id: u.id, value };
      log(
        s,
        `The Taming of Sméagol: ${card(top).name} is discarded from the encounter deck, so Gollum gets +${value} defense for this attack.`,
        "danger",
      );
      return true;
    }
    case "pomReek": {
      const mine = [...s.heroes, ...s.allies].filter((x) => x.committed);
      const committed = globalCharacters(s).filter((x) => x.committed);
      choose(
        s,
        `Bitter Reek · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise your threat by ${mine.length} (1 for each character you control committed to the quest)`,
            effects: [
              fx("pomThreat", {
                value: mine.length,
                text: "Bitter Reek",
                player: p,
              }),
            ],
          },
          {
            id: "damage",
            label: `Deal 1 damage to each character committed to the quest (${committed.length})`,
            effects: committed.map((x) =>
              fx("damage", { target: x.id, value: 1, player: ownerOf(s, x) }),
            ),
          },
        ],
        "Peril. When Revealed: either raise your threat by 1 for each character you control that is committed to the quest, or deal 1 damage to each character committed to the quest.",
      );
      return true;
    }
    case "pomFellLight": {
      const i = topmostUndead(s);
      if (i >= 0) {
        const [code] = s.encounterDiscard.splice(i, 1);
        const enemy = make(s, code);
        s.staging.push(enemy);
        log(
          s,
          `A Fell Light: ${name(enemy)} is put into play from the discard pile engaged with ${who(s, p)}.`,
          "danger",
        );
        engage(s, enemy);
      } else
        log(s, "A Fell Light: there is no Undead enemy in the discard pile.");
      const undead = s.engaged.filter(isUndead);
      if (undead.length)
        log(
          s,
          `A Fell Light: each Undead enemy engaged with ${who(s, p)} makes an immediate attack.`,
          "danger",
        );
      prepend(
        s,
        ...undead.map((x) =>
          fx("immediateAttack", { target: x.id, player: p }),
        ),
      );
      return true;
    }
    case "pomGrope": {
      const [location] = allActiveLocations(s);
      if (!location || !isLocation(location)) {
        log(s, `${e.text}: there is no active location.`);
        return true;
      }
      placeMire(s, [location], e.text ?? "Groping Dead");
      return true;
    }
    case "pomDeadThings":
      raiseThreat(s, 3, "encounter");
      log(
        s,
        `Dead Things: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by 3.`,
        "danger",
      );
      return true;
  }
  return false;
}
/** The Forced effect of a location discarded by the Mire keyword. */
function mireForced(s: GameState, code: string, p: number) {
  switch (code) {
    case POM.mere: {
      const options = searchOptions(s, isUndeadCode, "pomMereReveal", p);
      if (!options.length) {
        log(
          s,
          "Haunted Mere: there is no Undead enemy in the encounter deck or discard pile.",
        );
        prepend(s, fx("pomShuffle", { text: "Haunted Mere", player: p }));
        return;
      }
      choose(
        s,
        `Haunted Mere · Reveal an Undead enemy${seatLabel(s, p)}`,
        options,
        "Forced: when Haunted Mere is discarded by the Mire keyword, search the encounter deck and discard pile for an Undead enemy, reveal it, and add it to the staging area. Shuffle the encounter deck.",
      );
      prepend(s, fx("pomShuffle", { text: "Haunted Mere", player: p }));
      return;
    }
    case POM.softMires:
      log(
        s,
        "Soft Mires: the first player reveals the top card of the encounter deck.",
        "danger",
      );
      prepend(s, fx("reveal", { player: p }));
      return;
    case POM.pools:
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("pomThreat", { value: 5, text: "Stagnant Pools", player }),
        ),
      );
      return;
    case POM.quagmire: {
      const locations = victoryLocations(s);
      if (!locations.length) {
        log(
          s,
          "Shifting Quagmire: there is no location in the victory display.",
        );
        return;
      }
      choose(
        s,
        `Shifting Quagmire · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "return",
            label:
              "Return a random location from the victory display to the staging area",
            effects: [fx("pomQuagmireReturn", { player: p })],
          },
          {
            id: "threat",
            label: `Raise each player's threat by ${locations.length} (1 for each location in the victory display)`,
            effects: playerOrder(s).map((player) =>
              fx("pomThreat", {
                value: locations.length,
                text: "Shifting Quagmire",
                player,
              }),
            ),
          },
        ],
        "Forced: when Shifting Quagmire is discarded by the Mire keyword, either return a random location from the victory display to the staging area, or raise each player's threat by 1 for each location in the victory display.",
      );
      return;
    }
    case POM.fens:
      prepend(s, fx("pomFens", { player: p }));
      return;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

export const PASSAGE_MARSHES_HOOKS: Batch4ScenarioHooks = {
  setup: setupPassageMarshes,
  openingHandsKept: (s) => {
    if (!s.passageMarshes || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      fx("pomSetupGollum", { player: first }),
      ...playerOrder(s).map((player) => fx("pomSetupSearch", { player })),
      fx("pomShuffle", { text: "The Taming of Sméagol", player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: passageMarshesStageInfo,
  check: (s) => {
    if (!s.passageMarshes || s.status !== "playing") return;
    lotrSagaCheck(s);
    if (s.status !== "playing" || s.round < 1) return;
    // Gollum engages the first player.
    if (!s.choice && !s.queue.length) gollumFollows(s);
  },
  encounter,
  shadow,
  // The first player token passed: Sméagol and Gollum follow it.
  firstPlayerChanged: (s, refresh) => {
    if (!s.passageMarshes) return;
    smeagolFollows(s);
    prepend(
      s,
      fx("pomGollumFollows", { flag: refresh, player: firstPlayer(s) }),
    );
  },
  // The Mire keyword and Creeping Marshes, at the end of the refresh phase.
  roundEnd: (s) => {
    const q = s.passageMarshes;
    if (!q) return [];
    const first = firstPlayer(s);
    const code = mainQuestCode(s);
    const creeping = code
      ? (s.questAttachments?.[code] ?? []).filter(
          (a) => a.code === POM.creeping,
        )
      : [];
    return [
      fx("pomMireRound", { player: first }),
      ...creeping.map((a) =>
        fx("pomCreeping", { source: a.id, player: first }),
      ),
    ];
  },
  // Sméagol: after the players quest unsuccessfully, flip him to Gollum.
  failedQuest: (s) => {
    const q = s.passageMarshes;
    if (!q || q.failedRound === s.round || !pomSmeagol(s)) return false;
    q.failedRound = s.round;
    prepend(
      s,
      fx("pomSmeagolFlips", {
        text: "Sméagol",
        player: firstPlayer(s),
      }),
    );
    return false;
  },
  // 1B: after attackers are declared against Gollum.
  attackersDeclared: (s, enemy) =>
    at(s, POM.taming) && live(enemy, POM.gollum)
      ? [fx("pomGollumDefense", { target: enemy.id, player: activeSeat(s) })]
      : [],
  playerAttackResolved: (s, enemy) => {
    const q = s.passageMarshes;
    if (q?.gollumDefense?.id === enemy.id) delete q.gollumDefense;
  },
  combatEnd: (s) => {
    if (s.passageMarshes) delete s.passageMarshes.gollumDefense;
  },
  stats: (s, u) => {
    const d = s.passageMarshes?.gollumDefense;
    return d && d.id === u.id && live(u, POM.gollum)
      ? { defense: d.value }
      : {};
  },
  // Gollum flips to Sméagol when he is defeated.
  enemyDestination: (s, u, destruction) => {
    if (!s.passageMarshes || !destruction || u.code !== POM.gollum)
      return false;
    gollumDefeated(s, u);
    return true;
  },
  characterDestroyed: (s, u, context) => {
    const q = s.passageMarshes;
    if (!q || !isCharacter(u)) return;
    if (u.code === POM.smeagol) {
      lose(s, "Sméagol is destroyed. The players lose the game.");
      return;
    }
    const c = s.combat;
    if (!c || !context.combatDamage || context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    // Groping Dead's shadow: once for this attack.
    if (c.pomMireOnKill) {
      delete c.pomMireOnKill;
      effects.push(
        fx("pomGrope", {
          text: "Groping Dead's shadow",
          player: firstPlayer(s),
        }),
      );
    }
    if (enemy && live(enemy, POM.groping))
      effects.push(
        fx("pomGrope", { text: "Groping Dead", player: firstPlayer(s) }),
      );
    if (enemy && live(enemy, POM.deadThings))
      effects.push(fx("pomDeadThings", { player: p }));
    if (enemy && live(enemy, POM.candle)) {
      enemy.roundCannotTakeDamage = true;
      log(
        s,
        "Candle-bearer destroyed a character: it cannot take damage until the end of the round.",
        "danger",
      );
    }
    prepend(s, ...effects);
  },
  // Undead: the engaged player cannot reduce his threat.
  cannotReduceThreat: (s) =>
    !!s.passageMarshes &&
    s.engaged.some(
      (u) =>
        isUndead(u) &&
        !u.blanked &&
        /The engaged player cannot reduce his threat/.test(
          card(u.code).text ?? "",
        ),
    ),
  // 2B: progress cannot be placed on locations in the staging area.
  locationProgressBlocked: (s, u) =>
    at(s, POM.across) && s.staging.some((x) => x.id === u.id),
  // 3B: no progress on this stage while any player is engaged with an Undead enemy.
  progress: (s, amount, quest) => {
    if (
      !at(s, POM.lights) ||
      quest.id !== mainQuestUnit(s)?.id ||
      !globalEngaged(s).some(isUndead)
    )
      return amount;
    if (amount > 0)
      log(
        s,
        `"Don't Look at the Lights!": a player is engaged with an Undead enemy, so ${amount} progress cannot be placed on this stage.`,
      );
    return 0;
  },
  // 2B: at the end of the staging step, too few locations reveal another card.
  stagingEnd: (s) => {
    if (!at(s, POM.across) || stagingLocations(s).length >= players(s)) return;
    log(
      s,
      "Across the Marshes: the staging area holds fewer locations than there are players, so the first player reveals the top card of the encounter deck.",
      "danger",
    );
    prepend(s, fx("reveal", { player: firstPlayer(s) }));
  },
  // Stagnant Pools: +1 threat for each mire token on it.
  threatBonus: (s, u) =>
    s.passageMarshes && live(u, POM.pools) ? u.resources : 0,
  // Morgul Wraith, while The One Ring is exhausted.
  engagementBonus: morgulWraithEngagement,
  immune: morgulWraithImmune,
  cannotAttach: morgulWraithCannotAttach,
  travelProblem: (s, u) => {
    if (!s.passageMarshes || u.blanked) return null;
    if (u.code === POM.mere || u.code === POM.pools) {
      const smeagol = pomSmeagol(s);
      return smeagol && !smeagol.exhausted
        ? null
        : `${name(u)}: exhaust Sméagol to travel here.`;
    }
    if (u.code === POM.quagmire)
      return fellowshipPayers(s).length
        ? null
        : "Shifting Quagmire: spend 1 Fellowship resource to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.passageMarshes || u.blanked) return undefined;
    const label = name(u);
    if (u.code === POM.mere || u.code === POM.pools)
      return [fx("pomExhaustSmeagol", { text: label, player: firstPlayer(s) })];
    if (u.code === POM.quagmire)
      return [
        fx("pomSpendFellowship", { text: label, player: firstPlayer(s) }),
      ];
    if (u.code === POM.softMires || u.code === POM.fens)
      return playerOrder(s).map((player) =>
        fx("pomThreat", { value: 1, text: label, player }),
      );
    return undefined;
  },
  effect: passageMarshesEffect,
  sharedEffect: (e) =>
    [
      "pomTreacheryDone",
      "pomShuffle",
      "pomDefeat",
      "pomStageTwo",
      "pomAcrossRevealed",
      "pomStageThree",
      "pomVictoryShuffle",
      "pomMireRound",
      "pomCreeping",
      "pomQuagmireReturn",
      "pomFens",
      "pomExhaustSmeagol",
      "pomSpendFellowship",
      "pomSmeagolFlips",
      "pomGollumFollows",
      "pomGrope",
    ].includes(e.kind),
};
