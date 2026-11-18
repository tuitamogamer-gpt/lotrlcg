import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  skip,
} from "./core";
import {
  allyCanEnter,
  damage,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  enterAlly,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  takePlayerDiscard,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { addQuestProgress } from "./side-quests";
import { surgeEffects } from "./surge";
import { resolveDoomed } from "./voice-isengard";
import {
  goblinCannotAttach,
  goblinCannotCancel,
  goblinEffect,
  goblinEncounter,
  goblinEngaged,
  goblinShadow,
  goblinStats,
} from "./goblins-set";
import {
  OATH,
  OATH_QUESTS,
  OATH_TREACHERIES,
  isForestLocation,
  isGoblinEnemy,
  isSpiderEnemy,
  oathRecipe,
  oathStageInfo,
  troopInPlay,
  OATH_2018_SCENARIO,
} from "./the-oath-support";
export * from "./the-oath-support";

/**
 * The Oath, the first scenario of the Two-Player Limited Edition Starter
 * (2018), reprinted with three more cards in The Dark of Mirkwood (2022).
 * Goblins have raided a woodman village: the players follow their trail
 * through Mirkwood, where 2B cannot be defeated until a Goblin Trail is in the
 * victory display, and win by defeating 3B once Goblin Troop has left play.
 * Caught in a Web, Goblin Sniper, Driven by Shadow and Forest Gate keep the
 * Core Set's text and follow its rules (core-reprints.ts).
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const his = (s: GameState) => (s.table ? "his" : "your");
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.oath?.advancing;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** The player an enemy is engaged with, if any. */
function engagedWith(s: GameState, u: Unit) {
  for (const p of playerOrder(s))
    if (seatView(s, p).engaged.some((x) => x.id === u.id)) return p;
  return undefined;
}
const titles = (codes: string[]) => [
  ...new Set(codes.map((c) => card(c).name)),
];
/** The encounter deck and discard pile cards matching a test, by title. */
const searchable = (s: GameState, test: (c: string) => boolean) =>
  titles([...s.encounterDeck, ...s.encounterDiscard].filter(test));
/** Take the first copy of a title out of the encounter deck, else the discard pile. */
function takeEncounter(s: GameState, title: string) {
  for (const zone of [s.encounterDeck, s.encounterDiscard]) {
    const i = zone.findIndex((c) => card(c).name === title);
    if (i >= 0) return make(s, zone.splice(i, 1)[0]);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupOath(s: GameState) {
  const r = oathRecipe(s.scenarioId, !!s.easyMode);
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: The Eaves of Mirkwood is added to the staging area and Goblin Troop
  // is set aside, out of play.
  for (const c of section("sharedStagingArea")) s.staging.push(make(s, c));
  s.oath = {
    currentQuest: OATH.raid,
    advancing: false,
    edition: s.scenarioId === OATH_2018_SCENARIO ? "2018" : "2022",
    troopAside: section("sharedSetAside").includes(OATH.troop),
    resolving: [],
  };
  log(
    s,
    "After the Raid: The Eaves of Mirkwood is added to the staging area and Goblin Troop is set aside, out of play.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.oath;
  if (!q) return false;
  const goal = oathStageInfo(s)?.quest ?? 0;
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
  // 2B: not defeated unless at least 1 copy of Goblin Trail is in the victory display.
  if (
    s.stage === 2 &&
    stageLive(s) &&
    !(s.victoryCards ?? []).includes(OATH.trail)
  )
    return true;
  // 3B: not defeated while Goblin Troop is in play.
  if (s.stage === 3 && stageLive(s) && (q.troopAside || troopInPlay(s)))
    return true;
  if (s.stage === OATH_QUESTS.length) {
    win(
      s,
      "The Rearguard is defeated: the heroes discover the trail to the Goblins' secret lair and the players win the game.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("oathDefeatQuest", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.oath;
  if (!q) return false;
  const player = activeSeat(s);
  // The Goblins set (shared with The Caves of Nibin-Dûm).
  if (goblinEncounter(s, code, replay, fromReveal)) return true;
  if (!OATH_TREACHERIES.includes(code)) return false;
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
  prepend(
    s,
    fx("oathTreachery", { code, source: u.id, player }),
    fx("oathTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    // Each player returns 1 enemy engaged with him to the staging area; with
    // none returned, Surprising Speed gains surge and doomed 1.
    case OATH.speed:
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("oathSpeedReturn", { source: held.id, player }),
        ),
        fx("oathSpeedCheck", { source: held.id, player: p }),
      );
      return;
  }
}

/** The shadow effects of this encounter deck (the reprints follow the Core Set). */
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.oath) return false;
  // The Goblins set (shared with The Caves of Nibin-Dûm).
  if (goblinShadow(s, code)) return true;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const undefended = !defenders.length;
  switch (code) {
    case OATH.spiders:
      prepend(s, fx("oathSpidersShadow", { flag: undefended, player: p }));
      return true;
    case OATH.greatSpider:
      prepend(s, fx("oathGreatSpiderShadow", { player: p }));
      return true;
    case OATH.speed:
      c.attackBonus += 1;
      c.returnToStaging = true;
      log(
        s,
        `Surprising Speed: ${enemy ? name(enemy) : "the attacking enemy"} gets +1 attack and returns to the staging area after this attack.`,
        "danger",
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Locations.

const graveCount = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "location").length;
/** Spider Den: the Spider enemies a player can put into play to discard it. */
const denSpiders = (s: GameState) => searchable(s, (c) => isSpiderEnemy(c));
function denProblem(s: GameState, u: Unit): string | null {
  if (!live(u, OATH.den)) return "Spider Den's text is blank.";
  if (s.phase !== "quest" && s.phase !== "staging")
    return "Spider Den's ability is a Quest Action.";
  if (
    !s.staging.some((x) => x.id === u.id) &&
    !allActiveLocations(s).some((x) => x.id === u.id)
  )
    return "Spider Den must be in play.";
  if (!denSpiders(s).length)
    return "There is no Spider enemy in the encounter deck or discard pile.";
  return null;
}
function discardLocation(s: GameState, u: Unit) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
    (x) => x.id !== u.id,
  );
  s.encounterDiscard.push(u.code);
}

// ---------------------------------------------------------------------------
// Effects.

function oathEffect(s: GameState, e: Effect): boolean {
  const q = s.oath;
  if (!q || !e.kind.startsWith("oath")) return false;
  // The Goblins set (shared with The Caves of Nibin-Dûm).
  if (goblinEffect(s, e)) return true;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "oathDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("oathNextStage", { player: first }));
      return true;
    }
    case "oathNextStage":
      q.advancing = false;
      if (s.stage >= OATH_QUESTS.length) return true;
      s.stage += 1;
      q.currentQuest = OATH_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      // 2B: each player adds a Forest location; 3A: Goblin Troop and a Goblin
      // enemy for each other player.
      prepend(
        s,
        ...(s.stage === 2
          ? [
              ...playerOrder(s).map((player) =>
                fx("oathForestSearch", { player }),
              ),
              fx("oathShuffle", { player: first }),
            ]
          : [
              fx("oathTroop", { player: first }),
              ...playerOrder(s)
                .filter((player) => player !== first)
                .map((player) => fx("oathGoblinSearch", { player })),
            ]),
      );
      return true;
    case "oathForestSearch":
    case "oathGoblinSearch": {
      const forest = e.kind === "oathForestSearch";
      const options = searchable(s, (c) =>
        forest ? isForestLocation(c) : isGoblinEnemy(c),
      );
      if (!options.length) {
        log(
          s,
          `${card(q.currentQuest).name}: there is no ${forest ? "Forest location" : "Goblin enemy"} in the encounter deck or discard pile for ${who(s, p)}.`,
        );
        return true;
      }
      choose(
        s,
        `${card(q.currentQuest).name} · Add a ${forest ? "Forest location" : "Goblin enemy"} to the staging area${seatLabel(s, p)}`,
        options.map((title) => ({
          id: title,
          label: title,
          code: [...s.encounterDeck, ...s.encounterDiscard].find(
            (c) => card(c).name === title,
          ),
          effects: [fx("oathAddToStaging", { text: title, player: p })],
        })),
        forest
          ? "When Revealed: each player searches the encounter deck and discard pile for a Forest location and adds it to the staging area."
          : "When Revealed: each other player searches the encounter deck and discard pile for a Goblin enemy and adds it to the staging area.",
      );
      return true;
    }
    case "oathAddToStaging": {
      const u = takeEncounter(s, e.text ?? "");
      if (!u) return true;
      s.staging.push(u);
      if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
      log(s, `${name(u)} is added to the staging area.`, "danger");
      return true;
    }
    case "oathTroop": {
      if (!q.troopAside) return true;
      q.troopAside = false;
      const troop = make(s, OATH.troop);
      s.staging.push(troop);
      enemyAddedToStaging(s, troop);
      log(
        s,
        "The Rearguard: the set-aside Goblin Troop is added to the staging area.",
        "danger",
      );
      return true;
    }
    case "oathTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "oathSpeedReturn": {
      const enemies = seatView(s, p).engaged.filter(
        (u) => card(u.code).type_code === "enemy",
      );
      if (!enemies.length) return true;
      choose(
        s,
        `Surprising Speed · Return an enemy engaged with ${who(s, p)} to the staging area${seatLabel(s, p)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("oathSpeedEnemy", {
              target: u.id,
              source: e.source,
              player: p,
            }),
          ],
        })),
        "When Revealed: each player returns 1 enemy engaged with him to the staging area.",
      );
      return true;
    }
    case "oathSpeedEnemy": {
      const u = seatView(s, p).engaged.find((x) => x.id === e.target);
      if (!u) return true;
      forOwner(s, p, () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
      s.staging.push(u);
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) held.progress = 1;
      log(
        s,
        `Surprising Speed: ${name(u)} returns to the staging area.`,
        "danger",
      );
      return true;
    }
    case "oathSpeedCheck": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!held || held.progress) return true;
      log(
        s,
        "Surprising Speed: no enemy was returned to the staging area, so it gains surge and doomed 1.",
        "danger",
      );
      prepend(s, ...surgeEffects(OATH.speed));
      resolveDoomed(s, 1, "encounter");
      return true;
    }
    case "oathSpidersShadow": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `Spiders of Mirkwood · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: e.flag ? `Exhaust ${name(u)} and deal it 2 damage` : name(u),
          effects: [
            fx("oathSpidersExhaust", {
              target: u.id,
              flag: e.flag,
              player: p,
            }),
          ],
        })),
        "Shadow: choose and exhaust 1 character you control. If this attack was undefended, also deal that character 2 damage.",
      );
      return true;
    }
    case "oathSpidersExhaust": {
      const u = get(s, e.target);
      if (!u) return true;
      exhaustCharacter(s, u);
      if (e.flag) damage(s, u.id, 2, {});
      log(
        s,
        `Spiders of Mirkwood: ${name(u)} is exhausted${e.flag ? " and takes 2 damage" : ""}.`,
        "danger",
      );
      return true;
    }
    case "oathGreatSpiderShadow": {
      const exhausted = charactersOf(s, p).filter((u) => u.exhausted);
      if (!exhausted.length) return true;
      choose(
        s,
        `Great Spider · Deal 1 damage to an exhausted character you control${seatLabel(s, p)}`,
        exhausted.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("damage", { target: u.id, value: 1, player: p })],
        })),
        "Shadow: deal 1 damage to an exhausted character you control.",
      );
      return true;
    }
    case "oathGreatSpider": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `Great Spider · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("exhaust", { target: u.id, player: p })],
        })),
        "Forced: after Great Spider engages you, exhaust a character you control.",
      );
      return true;
    }
    case "oathGroveDiscard": {
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `Tangled Grove: ${who(s, p)} ${s.table ? "discards" : "discard"} ${card(pick.code).name} at random.`,
        );
        discardHandCard(s, pick.id);
      });
      return true;
    }
    case "oathTrailProgress": {
      const quest = mainQuestUnit(s);
      if (!quest) return true;
      log(
        s,
        "Goblin Trail: 6 progress is placed on the current quest.",
        "good",
      );
      addQuestProgress(s, quest, 6);
      return true;
    }
    case "oathCampTravel": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "enemy") {
        const u = make(s, top);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        log(
          s,
          `Abandoned Camp: ${name(u)} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
        return true;
      }
      s.encounterDiscard.push(top);
      log(
        s,
        `Abandoned Camp: ${card(top).name} is discarded from the encounter deck.`,
      );
      return true;
    }
    case "oathCampResponse":
      choose(
        s,
        `Abandoned Camp · Discard the top card of ${his(s)} deck${seatLabel(s, p)}`,
        [
          {
            id: "use",
            label:
              "Discard the top card of your deck: an ally is put into play",
            effects: [fx("oathCamp", { player: p })],
          },
          skip,
        ],
        "Response: after the players travel to Abandoned Camp, the first player discards the top card of their deck. If that card is an ally, put it into play under their control.",
      );
      return true;
    case "oathCamp": {
      const [top] = discardPlayerDeck(s, 1, p);
      if (!top) return true;
      if (card(top).type_code !== "ally" || !allyCanEnter(s, top)) {
        log(s, `Abandoned Camp: ${card(top).name} is discarded.`);
        return true;
      }
      forOwner(s, p, () => {
        const i = s.discard.lastIndexOf(top);
        if (i < 0) return;
        const ally = takePlayerDiscard(s, i, { playerCardCost: true });
        ally.owner = p;
        log(
          s,
          `Abandoned Camp: ${name(ally)} is discarded and put into play under ${who(s, p)}'s control.`,
          "good",
        );
        enterAlly(s, ally, false, false, false);
      });
      return true;
    }
    case "oathDen": {
      const den = [...s.staging, ...allActiveLocations(s)].find(
        (x) => x.id === e.source && x.code === OATH.den,
      );
      if (!den) return true;
      const u = takeEncounter(s, e.text ?? "");
      if (!u) return true;
      log(
        s,
        `Spider Den: ${name(u)} is put into play engaged with ${who(s, p)}, and Spider Den is discarded.`,
        "good",
      );
      enterEnemyEngaged(s, u, p);
      discardLocation(s, den);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const OATH_HOOKS: Batch4ScenarioHooks = {
  setup: setupOath,
  advance,
  stageInfo: oathStageInfo,
  encounter,
  shadow,
  stats: (s, u) => {
    if (!s.oath) return {};
    // Spiders of Mirkwood: +1 attack for each exhausted character its player controls.
    if (live(u, OATH.spiders)) {
      const p = engagedWith(s, u);
      return p === undefined
        ? {}
        : { attack: charactersOf(s, p).filter((x) => x.exhausted).length };
    }
    // Goblin Troop (the Goblins set).
    return goblinStats(s, u);
  },
  threatBonus: (s, u) => (s.oath && live(u, OATH.grove) ? graveCount(s) : 0),
  cannotCancel: (s, _shadow, code) =>
    !!s.oath && (activeIs(s, OATH.eaves) || goblinCannotCancel(s, code)),
  cannotAttach: (s, u) => !!s.oath && goblinCannotAttach(s, u),
  engaged: (s, u) => {
    if (!s.oath) return;
    const p = activeSeat(s);
    if (live(u, OATH.greatSpider))
      prepend(s, fx("oathGreatSpider", { player: p }));
    goblinEngaged(s, u);
  },
  travelProblem: (s, u) =>
    s.oath &&
    live(u, OATH.grove) &&
    playerOrder(s).some((p) => !seatView(s, p).hand.length)
      ? "Tangled Grove: each player must discard 1 random card from his hand to travel here."
      : null,
  travelEffects: (s, u) => {
    if (!s.oath) return undefined;
    const first = firstPlayer(s);
    if (live(u, OATH.grove))
      return playerOrder(s).map((player) => fx("oathGroveDiscard", { player }));
    if (live(u, OATH.trail)) return [fx("reveal", { player: first })];
    if (live(u, OATH.camp)) return [fx("oathCampTravel", { player: first })];
    return undefined;
  },
  travelEntered: (s, u, actualTravel) => {
    if (!s.oath || !actualTravel || !live(u, OATH.camp)) return;
    prepend(s, fx("oathCampResponse", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (!s.oath || u.code !== OATH.trail || u.blanked) return;
    prepend(s, fx("oathTrailProgress", { player: firstPlayer(s) }));
  },
  abilityLabel: (code) =>
    code === OATH.den
      ? "Spider Den · Quest Action: put a Spider enemy into play engaged with you to discard Spider Den"
      : undefined,
  abilityProblem: (s, u) => (u.code === OATH.den ? denProblem(s, u) : null),
  ability: (s, u) => {
    if (u.code !== OATH.den || denProblem(s, u)) return false;
    const p = activeSeat(s);
    const options: Option[] = denSpiders(s).map((title) => ({
      id: title,
      label: title,
      effects: [fx("oathDen", { source: u.id, text: title, player: p })],
    }));
    choose(
      s,
      `Spider Den · Put a Spider enemy into play engaged with ${who(s, p)}${seatLabel(s, p)}`,
      options,
      "Quest Action: search the encounter deck and discard pile for a Spider enemy and put it into play engaged with you to discard Spider Den. (Any player may trigger this effect.)",
    );
    return true;
  },
  effect: oathEffect,
  sharedEffect: (e) =>
    [
      "oathDefeatQuest",
      "oathNextStage",
      "oathShuffle",
      "oathTroop",
      "oathTreacheryDone",
      "oathSpeedCheck",
    ].includes(e.kind),
};
