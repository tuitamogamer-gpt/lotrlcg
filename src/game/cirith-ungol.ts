import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  addVictoryCard,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
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
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck, oneRing, ringBearer } from "./lotr-saga";
import { isOneRing } from "./lotr-saga-codes";
import { whiteHandArchery } from "./white-hand";
import {
  CIRITH_UNGOL_RECIPES,
  CU,
  CU_CHAMBER_PROGRESS,
  CU_ESCAPE_BONUS,
  CU_ESCAPE_PROGRESS,
  cirithUngolStageInfo,
  cuWatchers,
  isWatchers,
} from "./cirith-ungol-support";
export * from "./cirith-ungol-support";

/**
 * The Tower of Cirith Ungol, the first scenario of The Mountain of Fire. Frodo
 * lies captive at the top of the tower: the player carrying The One Ring with
 * Last of the Company must pass The Two Watchers, fight through the orcs to
 * the Topmost Chamber, and escape past the Watchers with the Ring-bearer.
 */
const TREACHERIES: readonly string[] = [
  CU.howls,
  CU.drawn,
  CU.deep,
  CU.vigilance,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const players = (s: GameState) => globalPlayerOrder(s).length;
/** The game phase, its steps included. */
const phaseOf = (s: GameState) =>
  s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase;
/** The current quest's text is in effect. */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.cirithUngol?.advancing;
const at = (s: GameState, quest: string) =>
  s.cirithUngol?.currentQuest === quest && stageLive(s);
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter((u) => isEnemy(u));
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
/** 1B: each non-unique location cannot leave the staging area. */
const lockedLocation = (s: GameState, u: Unit) =>
  at(s, CU.watchers) &&
  card(u.code).type_code === "location" &&
  !card(u.code).is_unique &&
  inStaging(s, u);
/** 1B and 3B: The Two Watchers (enemy side) is considered engaged with each player. */
const watchersEngaged = (s: GameState) =>
  at(s, CU.watchers) || at(s, CU.escape);
const company = (s: GameState) => {
  for (const host of globalCharacters(s)) {
    const a = host.attachments.find((x) => x.code === CU.company);
    if (a) return { host, a };
  }
  return undefined;
};
const defendersOf = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupCirithUngol(s: GameState) {
  const r = CIRITH_UNGOL_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.staging = section("sharedStagingArea")
    .filter((c) => c !== CU.company)
    .map((c) => make(s, c));
  s.activeLocation = null;
  // The first player loses control of the Ring-bearer, placed faceup under
  // Topmost Chamber as a guarded objective; The One Ring waits for the hero
  // who takes Last of the Company.
  const first = firstPlayer(s);
  let captive: Unit | undefined;
  let ring: Unit["attachments"][number] | undefined;
  forOwner(s, first, () => {
    const bearer = s.heroes.find((h) =>
      h.attachments.some((a) => isOneRing(a.code)),
    );
    if (!bearer) return;
    ring = bearer.attachments.find((a) => isOneRing(a.code));
    bearer.attachments = bearer.attachments.filter((a) => a !== ring);
    s.heroes = s.heroes.filter((h) => h.id !== bearer.id);
    s.committedIds = s.committedIds.filter((id) => id !== bearer.id);
    captive = bearer;
  });
  const lotc = make(s, CU.company);
  s.cirithUngol = {
    currentQuest: CU.watchers,
    advancing: false,
    resolving: [],
    setAside: section("sharedSetAside"),
    ringPlaced: false,
    ...(captive ? { captive } : {}),
    ...(ring ? { ring } : {}),
    company: { id: lotc.id, code: CU.company, exhausted: false },
  };
  log(
    s,
    "Pass the Two Watchers: Shagrat is set aside; The Two Watchers and Topmost Chamber are added to the staging area, and the Ring-bearer is placed faceup under Topmost Chamber as a guarded objective.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.cirithUngol;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    !q.ringPlaced
  )
    return true;
  const goal = cirithUngolStageInfo(s)?.quest ?? 0;
  if (s.progress < goal) return true;
  // 1B and 3B cannot be defeated while The Two Watchers is in play.
  if (q.currentQuest !== CU.tower && cuWatchers(s)) return true;
  // 2B cannot be defeated unless Topmost Chamber is in the victory display.
  if (
    q.currentQuest === CU.tower &&
    !(s.victoryCards ?? []).includes(CU.chamber)
  )
    return true;
  if (q.currentQuest === CU.escape) {
    questDefeated(s, q.currentQuest);
    win(
      s,
      "Escape from Cirith Ungol is defeated: the Ring-bearer is free of the tower, and the players win the game.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("cuDefeat", { player: firstPlayer(s) }));
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
  const q = s.cirithUngol;
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
    fx("cuTreachery", { code, source: u.id, player }),
    fx("cuTreacheryDone", { source: u.id, player }),
  );
  return true;
}
/**
 * An "either … or …" choice: an option is offered only when it can change the
 * game; with one left it resolves alone.
 */
function either(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  description: string,
) {
  if (!options.length) {
    log(s, `${title}: nothing can be resolved.`);
    return;
  }
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () =>
    choose(s, `${title} · Choose one${seatLabel(s, p)}`, options, description),
  );
}
const questingOf = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => u.committed,
  );
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    case CU.howls: {
      const targets = s.staging.filter((u) => isEnemy(u));
      for (const u of targets) prepend(s, fx("cuHowl", { target: u.id }));
      const q = s.cirithUngol!;
      q.howls = { round: s.round, phase: phaseOf(s) };
      log(
        s,
        targets.length
          ? "Orcish Howls: 1 damage to each enemy in the staging area; until the end of the phase each enemy gets +1 threat for each damage on it."
          : "Orcish Howls: no enemy is in the staging area.",
        "danger",
      );
      return;
    }
    case CU.drawn: {
      const first = firstPlayer(s);
      const ring = oneRing(s);
      either(
        s,
        first,
        "Drawn to the Ring",
        [
          ...(ring && !ring.exhausted
            ? [
                {
                  id: "ring",
                  label: "Exhaust The One Ring and reveal an encounter card",
                  effects: [
                    fx("cuDrawnRing", { player: first }),
                    fx("reveal", { player: first }),
                  ],
                },
              ]
            : []),
          ...(s.encounterDeck.some((c) => card(c).type_code === "enemy") ||
          s.encounterDiscard.some((c) => card(c).type_code === "enemy")
            ? [
                {
                  id: "enemy",
                  label:
                    "Discard until an enemy and put it into play engaged with you",
                  effects: [fx("cuDrawnEnemy", { player: first })],
                },
              ]
            : []),
        ],
        "When Revealed: the first player must choose: either exhaust The One Ring and reveal an encounter card, or discard cards from the top of the encounter deck until an enemy is discarded and put it into play engaged with him.",
      );
      return;
    }
    case CU.deep:
      prepend(s, ...playerOrder(s).map((player) => fx("cuDeep", { player })));
      return;
    case CU.vigilance:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("cuVigilance", { player })),
      );
      return;
  }
  void p;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!s.cirithUngol || !c) return false;
  const attacker = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case CU.gorbag:
    case CU.deep:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        `${card(code).name}: the attacking enemy makes an additional attack after this one.`,
        "danger",
      );
      return true;
    case CU.wounded: {
      const bonus = attacker?.damage ?? 0;
      c.attackBonus += bonus;
      log(
        s,
        `Wounded Uruk: the attacking enemy gets +${bonus} attack (1 for each damage on it).`,
        "danger",
      );
      return true;
    }
    case CU.howls: {
      const others = seatView(s, p).engaged.filter(
        (u) => isEnemy(u) && u.id !== c.enemyId,
      );
      if (!others.length || !attacker) {
        log(s, "Orcish Howls: you are not engaged with another enemy.");
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Orcish Howls · Resolve this attack against another enemy${seatLabel(s, p)}`,
          others.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("cuHowlRedirect", {
                source: attacker.id,
                target: u.id,
                player: p,
              }),
            ],
          })),
          "Shadow: if you are engaged with another enemy, resolve this attack against that enemy.",
        ),
      );
      return true;
    }
    case CU.orc:
      prepend(s, fx("cuExhaustOne", { text: "Orc of Mordor", player: p }));
      return true;
    case CU.archer: {
      const damaged = defendersOf(s).some((d) => d.damage > 0);
      c.attackBonus += damaged ? 2 : 1;
      log(
        s,
        `Snaga Archer: the attacking enemy gets +${damaged ? 2 : 1} attack.`,
        "danger",
      );
      return true;
    }
    case CU.soldier:
      c.attackBonus += 1;
      c.cuReturnOnKill = true;
      log(
        s,
        "Uruk Soldier: +1 attack; if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
    case CU.vigilance:
      c.attackBonus += 1;
      c.cuRevealOnKill = true;
      log(
        s,
        "Evil Vigilance: +1 attack; if this attack destroys a character, the top card of the encounter deck is revealed.",
        "danger",
      );
      return true;
    case CU.drawn:
      prepend(s, fx("cuDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Searches and helpers.

/** Discard from the top of the encounter deck until an enemy, reshuffling once. */
function discardUntilEnemy(s: GameState, text: string): string | undefined {
  for (let shuffled = false; ;) {
    if (!s.encounterDeck.length) {
      if (
        shuffled ||
        !s.encounterDiscard.some((c) => card(c).type_code === "enemy")
      )
        break;
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      shuffled = true;
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === "enemy") return code;
    s.encounterDiscard.push(code);
    log(s, `${text}: ${card(code).name} is discarded.`);
  }
  log(s, `${text}: no enemy is discarded.`);
  return undefined;
}
/** An enemy enters play: Wounded Uruk with 2 damage on it. */
function entering(s: GameState, u: Unit) {
  if (live(u, CU.wounded) && u.damage < 2) {
    u.damage = 2;
    log(s, "Wounded Uruk enters play with 2 damage on it.", "danger");
  }
}
function addEnemy(s: GameState, code: string, text: string) {
  const enemy = make(s, code);
  entering(s, enemy);
  s.staging.push(enemy);
  log(s, `${text}: ${card(code).name} is added to the staging area.`, "danger");
  enemyAddedToStaging(s, enemy);
  return enemy;
}
/**
 * 2B and Torch-lit Hall: discard until an enemy; if a copy of it is in the
 * staging area, that copy is discarded as well, else the enemy joins the
 * staging area.
 */
function copyOrAdd(s: GameState, text: string) {
  const code = discardUntilEnemy(s, text);
  if (!code) return;
  const copy = s.staging.find(
    (u) => isEnemy(u) && card(u.code).name === card(code).name,
  );
  if (copy) {
    s.encounterDiscard.push(code);
    log(
      s,
      `${text}: ${card(code).name} is discarded, and so is its copy in the staging area.`,
      "good",
    );
    destroy(s, copy, false);
    return;
  }
  addEnemy(s, code, text);
}
/** The Two Watchers' location side, flipped to its enemy side in the staging area. */
function flipWatchers(s: GameState, location: Unit) {
  if (s.activeLocation?.id === location.id) s.activeLocation = null;
  s.staging = s.staging.filter((u) => u.id !== location.id);
  const enemy: Unit = { ...make(s, CU.watchersEnemy), id: location.id };
  s.staging.push(enemy);
  log(
    s,
    "The Two Watchers flips to its enemy side and moves to the staging area: it is considered to be engaged with each player.",
    "danger",
  );
  enemyAddedToStaging(s, enemy);
}
/** The Ring-bearer is free of encounters: the first player gains control of it. */
function freeRingBearer(s: GameState) {
  const q = s.cirithUngol;
  if (!q?.captive) return;
  const frodo = q.captive;
  delete q.captive;
  const first = firstPlayer(s);
  frodo.owner = first;
  frodo.controller = first;
  forOwner(s, first, () => s.heroes.push(frodo));
  log(
    s,
    `The Ring-bearer is free of encounters: ${s.table ? seatName(s, first) : "the first player"} gains control of ${name(frodo)}.`,
    "good",
  );
}

// ---------------------------------------------------------------------------
// Effects.

export function cirithUngolEffect(s: GameState, e: Effect): boolean {
  const q = s.cirithUngol;
  if (!q) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "cuTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "cuTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const [held] = q.resolving.splice(i, 1);
        s.encounterDiscard.push(held.code);
      }
      return true;
    }
    // 1A Setup: the first player attaches Last of the Company and The One Ring to a hero.
    case "cuCompany": {
      const heroes = seatView(s, first).heroes;
      if (heroes.length === 1) {
        prepend(
          s,
          fx("cuCompanyAttach", { target: heroes[0].id, player: first }),
        );
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Pass the Two Watchers · Attach Last of the Company and The One Ring to a hero${seatLabel(s, first)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("cuCompanyAttach", { target: h.id, player: first })],
          })),
          "Setup: the first player attaches Last of the Company to a hero he controls and attaches The One Ring to that hero.",
        ),
      );
      return true;
    }
    case "cuCompanyAttach": {
      if (!u || q.ringPlaced) return true;
      if (q.company) u.attachments.push({ ...q.company, owner: first });
      if (q.ring) u.attachments.push({ ...q.ring, owner: first });
      delete q.company;
      delete q.ring;
      q.ringPlaced = true;
      log(
        s,
        `Last of the Company and The One Ring are attached to ${name(u)}: ${name(u)} is the Ring-bearer.`,
        "good",
      );
      return true;
    }
    case "cuDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(q.currentQuest === CU.watchers ? "cuStageTwo" : "cuStageThree", {
          player: first,
        }),
      );
      return true;
    }
    // 2A: shuffle the discard pile in, then discard until X enemies (X is the number of players).
    case "cuStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = CU.tower;
      s.stageRevealing = true;
      log(s, "Fighting in the Tower.", "chapter");
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      log(
        s,
        "Fighting in the Tower: the encounter discard pile is shuffled into the encounter deck.",
      );
      const wanted = players(s);
      let found = 0;
      while (found < wanted) {
        const code = s.encounterDeck.shift();
        if (!code) break;
        if (card(code).type_code !== "enemy") {
          s.encounterDiscard.push(code);
          log(s, `Fighting in the Tower: ${card(code).name} is discarded.`);
          continue;
        }
        found++;
        addEnemy(s, code, "Fighting in the Tower");
      }
      prepend(s, fx("stageRevealed"));
      return true;
    }
    // 3A: Last of the Company leaves, The One Ring goes to the Ring-bearer, The Two Watchers returns.
    case "cuStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = CU.escape;
      s.stageRevealing = true;
      log(s, "Escape from Cirith Ungol.", "chapter");
      const lotc = company(s);
      if (lotc) {
        lotc.host.attachments = lotc.host.attachments.filter(
          (a) => a.id !== lotc.a.id,
        );
        addVictoryCard(s, CU.company);
        log(s, "Last of the Company is added to the victory display.");
      }
      const frodo = globalCharacters(s).find(
        (h) => isHero(h) && card(h.code).traits?.includes("Ring-bearer"),
      );
      const bearer = ringBearer(s);
      const ring = oneRing(s);
      if (frodo && bearer && ring && bearer.id !== frodo.id) {
        bearer.attachments = bearer.attachments.filter((a) => a.id !== ring.id);
        frodo.attachments.push(ring);
      }
      if (frodo) {
        frodo.exhausted = true;
        log(
          s,
          `The One Ring is attached to the Ring-bearer, ${name(frodo)}, who is exhausted.`,
          "good",
        );
      }
      const victory = s.victoryCards ?? [];
      const i = victory.findIndex(isWatchers);
      if (i >= 0) {
        const [code] = victory.splice(i, 1);
        s.victory = Math.max(0, s.victory - (card(code).victory ?? 0));
        s.staging.push(make(s, CU.twoWatchers));
        log(
          s,
          "Escape from Cirith Ungol: The Two Watchers moves from the victory display to the staging area, location side faceup.",
          "danger",
        );
      }
      prepend(
        s,
        ...playerOrder(s)
          .filter((player) => player !== first)
          .map((player) => fx("reveal", { player })),
        fx("stageRevealed"),
      );
      return true;
    }
    // 2B Forced: at the beginning of the quest phase.
    case "cuTowerBegin":
      copyOrAdd(s, "Fighting in the Tower");
      return true;
    case "cuHall":
      copyOrAdd(s, "Torch-lit Hall");
      return true;
    // Topmost Chamber's Travel cost: add Shagrat to the staging area.
    case "cuShagrat": {
      const i = q.setAside.indexOf(CU.shagrat);
      if (i < 0) return true;
      q.setAside.splice(i, 1);
      addEnemy(s, CU.shagrat, "Topmost Chamber");
      return true;
    }
    case "cuHowl":
      if (u && isEnemy(u)) {
        u.damage += 1;
        log(s, `Orcish Howls: 1 damage to ${name(u)}.`, "danger");
        if (u.damage >= stats(s, u).health) destroy(s, u, true);
      }
      return true;
    case "cuHowlRedirect": {
      const target = get(s, e.target);
      if (!target) return true;
      forOwner(s, p, () =>
        s.used.push(`phase:small-target:${e.source}:${target.id}`),
      );
      log(
        s,
        `Orcish Howls: the attack is resolved against ${name(target)}.`,
        "good",
      );
      return true;
    }
    // Drawn to the Ring.
    case "cuDrawnRing": {
      const ring = oneRing(s);
      if (ring) {
        ring.exhausted = true;
        log(s, "Drawn to the Ring: The One Ring is exhausted.", "danger");
      }
      return true;
    }
    case "cuDrawnEnemy": {
      const code = discardUntilEnemy(s, "Drawn to the Ring");
      if (!code) return true;
      const enemy = make(s, code);
      entering(s, enemy);
      log(
        s,
        `Drawn to the Ring: ${card(code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, p);
      return true;
    }
    // Deep Shadows: discard your hand (at least 3 cards) or reveal an encounter card.
    case "cuDeep": {
      const hand = seatView(s, p).hand;
      either(
        s,
        p,
        "Deep Shadows",
        [
          ...(hand.length >= 3
            ? [
                {
                  id: "hand",
                  label: `Discard your hand (${hand.length} cards)`,
                  effects: [fx("cuDiscardHand", { player: p })],
                },
              ]
            : []),
          {
            id: "reveal",
            label: "Reveal an encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
        "When Revealed: each player must choose: either discard your hand (with at least 3 cards in it), or reveal an encounter card.",
      );
      return true;
    }
    case "cuDiscardHand":
      forOwner(s, p, () => {
        const n = s.hand.length;
        s.discard.push(...s.hand.map((c) => c.code));
        s.hand = [];
        log(
          s,
          `Deep Shadows: ${who(s, p)} discard${s.table ? "s" : ""} ${n} cards from hand.`,
          "danger",
        );
      });
      return true;
    // Evil Vigilance: discard a questing character or raise threat by the questers.
    case "cuVigilance": {
      const questing = questingOf(s, p);
      either(
        s,
        p,
        "Evil Vigilance",
        [
          ...questing.map((c) => ({
            id: `discard-${c.id}`,
            code: c.code,
            label: `Discard ${name(c)}`,
            effects: [fx("cuVigilanceDiscard", { target: c.id, player: p })],
          })),
          ...(questing.length
            ? [
                {
                  id: "threat",
                  label: `Raise your threat by ${questing.length}`,
                  effects: [
                    fx("cuThreat", {
                      value: questing.length,
                      text: "Evil Vigilance",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
        ],
        "When Revealed: each player must choose: either discard a questing character you control, or raise your threat by 1 for each questing character you control.",
      );
      return true;
    }
    case "cuVigilanceDiscard":
      if (u && isCharacter(u)) {
        log(s, `Evil Vigilance: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    case "cuThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "his" : "your"} threat by ${e.value}.`,
        "danger",
      );
      return true;
    // Orc of Mordor: exhaust a character you control.
    case "cuExhaustOne": {
      const ready = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (c) => !c.exhausted,
      );
      if (!ready.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
          ready.map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [
              fx("cuExhaust", { target: c.id, text: e.text, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "cuExhaust":
      if (u && exhaustCharacter(s, u))
        log(s, `${e.text}: ${name(u)} is exhausted.`, "danger");
      return true;
    // Snaga Archer: deal 2 damage to a character you control.
    case "cuArcherDamage": {
      const targets = [...seatView(s, p).heroes, ...seatView(s, p).allies];
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Snaga Archer · Deal 2 damage to a character you control${seatLabel(s, p)}`,
          targets.map((c) => ({
            id: c.id,
            code: c.code,
            label: `${name(c)} · ${c.damage} damage`,
            effects: [fx("damage", { target: c.id, value: 2, player: p })],
          })),
        ),
      );
      return true;
    }
    case "cuWoundedRage": {
      if (!u) return true;
      const ids =
        q.wounded?.round === s.round ? q.wounded.ids : ([] as string[]);
      q.wounded = { round: s.round, ids: [...ids, u.id] };
      log(
        s,
        "Wounded Uruk gets +2 attack until the end of the round.",
        "danger",
      );
      return true;
    }
    // Drawn to the Ring's shadow: discard a non-objective attachment you control.
    case "cuDiscardAttachment": {
      const owned = [
        ...globalCharacters(s),
        ...s.staging,
        ...globalEngaged(s),
        ...allActiveLocations(s),
      ].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!owned.length) {
        log(s, "Drawn to the Ring: you control no non-objective attachment.");
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Drawn to the Ring · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          owned.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} on ${name(host)}`,
            effects: [
              fx("cuDiscardThat", { target: host.id, source: a.id, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "cuDiscardThat": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(
          s,
          `Drawn to the Ring: ${card(a.code).name} is discarded.`,
          "danger",
        );
        discardAttachment(s, u, a);
      }
      return true;
    }
    // Last of the Company's Action: -X threat until the end of the phase.
    case "cuLessen": {
      const lotc = company(s);
      if (!u || !lotc) return true;
      const x = stats(s, lotc.host).will;
      const key = { round: s.round, phase: phaseOf(s) };
      const values =
        q.lessened?.round === key.round && q.lessened.phase === key.phase
          ? q.lessened.values
          : {};
      q.lessened = {
        ...key,
        values: { ...values, [u.id]: (values[u.id] ?? 0) + x },
      };
      log(
        s,
        `Last of the Company: ${name(u)} gets -${x} threat until the end of the phase.`,
        "good",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Last of the Company's Action.

const COMPANY_LABEL =
  "Last of the Company · Exhaust The One Ring and raise your threat by 1: an enemy gets -X threat until the end of the phase";
function companyProblem(s: GameState, u: Unit, attachmentId?: string) {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || a.code !== CU.company) return null;
  if (a.blanked) return "Last of the Company's text is blank.";
  if ((attachmentController(s, u, a) ?? ownerOf(s, u)) !== activeSeat(s))
    return "You do not control Last of the Company.";
  const ring = oneRing(s);
  if (!ring) return "The One Ring is not in play.";
  if (ring.exhausted) return "The One Ring is exhausted.";
  if (!enemiesInPlay(s).length) return "Choose an enemy in play.";
  return null;
}
function useCompany(s: GameState, u: Unit, attachmentId?: string) {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || a.code !== CU.company) return false;
  const problem = companyProblem(s, u, attachmentId);
  if (problem) throw new Error(problem);
  const p = activeSeat(s);
  oneRing(s)!.exhausted = true;
  raiseThreat(s, 1, "cost");
  log(
    s,
    "Last of the Company: The One Ring is exhausted and the threat is raised by 1.",
  );
  choose(
    s,
    `Last of the Company · Choose an enemy${seatLabel(s, p)}`,
    enemiesInPlay(s).map((enemy) => ({
      id: enemy.id,
      code: enemy.code,
      label: name(enemy),
      effects: [fx("cuLessen", { target: enemy.id, player: p })],
    })),
    "Until the end of the phase, that enemy gets -X threat, where X is the attached hero's willpower.",
  );
  return true;
}

// ---------------------------------------------------------------------------
// Hooks.

export const CIRITH_UNGOL_HOOKS: Batch4ScenarioHooks = {
  setup: setupCirithUngol,
  // 1A Setup: Last of the Company and The One Ring, once the hands are kept.
  openingHandsKept: (s) => {
    const q = s.cirithUngol;
    if (!q || q.ringPlaced || s.round > 0) return false;
    prepend(s, fx("cuCompany", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: cirithUngolStageInfo,
  check: (s) => {
    const q = s.cirithUngol;
    if (!q || s.status !== "playing") return;
    if (q.ringPlaced) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // Last of the Company: you cannot lose control of the first player token.
  keepFirstPlayer: (s) => !!s.cirithUngol && !!company(s),
  questBegin: (s) =>
    at(s, CU.tower) ? [fx("cuTowerBegin", { player: firstPlayer(s) })] : [],
  cardEntered: (s, u, fromReveal, cancelled) => {
    if (!s.cirithUngol || !fromReveal || cancelled) return;
    entering(s, u);
  },
  enemyEntered: (s, u) => {
    if (!s.cirithUngol || !inStaging(s, u) || !isEnemy(u)) return;
    // Bloodied Courtyard (active): after an enemy enters the staging area, 1 damage to it.
    if (activeIs(s, CU.courtyard)) {
      u.damage += 1;
      log(s, `Bloodied Courtyard: 1 damage to ${name(u)}.`, "danger");
      if (u.damage >= stats(s, u).health) destroy(s, u, true);
    }
  },
  engaged: (s, u) => {
    if (!s.cirithUngol || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === CU.gorbag)
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
    if (u.code === CU.wounded)
      prepend(s, fx("cuWoundedRage", { target: u.id, player: p }));
    if (u.code === CU.orc)
      prepend(s, fx("cuExhaustOne", { text: "Orc of Mordor", player: p }));
    if (u.code === CU.archer) prepend(s, fx("cuArcherDamage", { player: p }));
    if (u.code === CU.soldier)
      prepend(s, fx("cuThreat", { value: 2, text: "Uruk Soldier", player: p }));
  },
  revealedSurge: (s, code) =>
    !!s.cirithUngol && code === CU.howls && !s.staging.some((u) => isEnemy(u)),
  // Snaga Archer's Archery 2 from the staging area.
  combatBegin: (s) => {
    if (!s.cirithUngol) return;
    const archery = s.staging.reduce(
      (n, x) => n + (x.blanked || !isEnemy(x) ? 0 : whiteHandArchery(x.code)),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  consideredEngaged: (s, u, player) =>
    watchersEngaged(s) &&
    u.code === CU.watchersEnemy &&
    inStaging(s, u) &&
    playerOrder(s).includes(player),
  cannotEngage: (s, u) => !!s.cirithUngol && u.code === CU.watchersEnemy,
  cannotOptionallyEngage: (s, u) =>
    !!s.cirithUngol && u.code === CU.watchersEnemy,
  immune: (s, u) =>
    !!s.cirithUngol && (isWatchers(u.code) || u.code === CU.chamber),
  // 1B: non-unique locations cannot leave the staging area, even explored.
  cannotLeave: (s, u) => lockedLocation(s, u),
  cannotExplore: (s, u) => lockedLocation(s, u),
  travelProblem: (s, u) => {
    if (!s.cirithUngol) return null;
    if (
      at(s, CU.watchers) &&
      card(u.code).type_code === "location" &&
      !card(u.code).is_unique
    )
      return "Pass the Two Watchers: non-unique locations cannot leave the staging area.";
    if (
      u.code === CU.chamber &&
      !(at(s, CU.tower) && s.progress >= CU_CHAMBER_PROGRESS)
    )
      return `The players cannot travel to Topmost Chamber unless there is at least ${CU_CHAMBER_PROGRESS} progress on stage 2B.`;
    if (
      u.code === CU.twoWatchers &&
      at(s, CU.escape) &&
      s.progress < CU_ESCAPE_PROGRESS
    )
      return `The players cannot travel to The Two Watchers unless there is at least ${CU_ESCAPE_PROGRESS} progress on this stage.`;
    if (u.code === CU.stairs && !u.blanked)
      for (const p of playerOrder(s))
        if (
          ![...seatView(s, p).heroes, ...seatView(s, p).allies].some(
            (c) => !c.exhausted,
          )
        )
          return "Winding Stairs: each player must exhaust a character he controls to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.cirithUngol || u.blanked) return undefined;
    if (u.code === CU.chamber)
      return [fx("cuShagrat", { player: firstPlayer(s) })];
    if (u.code === CU.courtyard)
      return playerOrder(s).map((player) =>
        fx("cuThreat", { value: 1, text: "Bloodied Courtyard", player }),
      );
    if (u.code === CU.stairs)
      return playerOrder(s).map((player) =>
        fx("cuExhaustOne", { text: "Winding Stairs", player }),
      );
    return undefined;
  },
  travelEntered: (s, u, actualTravel) => {
    if (!s.cirithUngol || u.blanked) return;
    // A Watchers location made active by any means flips: it has no quest points.
    if (u.code === CU.twoWatchers) flipWatchers(s, u);
    else if (u.code === CU.hall && actualTravel)
      prepend(s, fx("cuHall", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    // The Ring-bearer is free of encounters once Topmost Chamber leaves play.
    if (s.cirithUngol && u.code === CU.chamber) freeRingBearer(s);
  },
  threatBonus: (s, u) => {
    const q = s.cirithUngol;
    if (!q || u.blanked) return 0;
    let bonus = 0;
    // The Two Watchers: X is twice the stage number of the main quest.
    if (u.code === CU.twoWatchers) bonus += 2 * s.stage;
    if (u.code === CU.watchersEnemy && at(s, CU.escape))
      bonus += CU_ESCAPE_BONUS;
    // 1B: each non-unique location gets -1 threat.
    if (
      at(s, CU.watchers) &&
      card(u.code).type_code === "location" &&
      !card(u.code).is_unique
    )
      bonus -= 1;
    // Echoing Passage: +1 threat for each enemy in the staging area.
    if (u.code === CU.passage)
      bonus += s.staging.filter((x) => isEnemy(x)).length;
    // Orcish Howls: +1 threat for each damage on each enemy, this phase.
    if (
      isEnemy(u) &&
      q.howls?.round === s.round &&
      q.howls.phase === phaseOf(s)
    )
      bonus += u.damage;
    if (
      q.lessened?.round === s.round &&
      q.lessened.phase === phaseOf(s) &&
      q.lessened.values[u.id]
    )
      bonus -= q.lessened.values[u.id];
    return bonus;
  },
  stats: (s, u) => {
    const q = s.cirithUngol;
    if (!q || !isEnemy(u)) return {};
    let attack = 0,
      defense = 0;
    if (u.code === CU.watchersEnemy && at(s, CU.escape))
      defense += CU_ESCAPE_BONUS;
    // Echoing Passage (active): each enemy gets +2 defense.
    if (activeIs(s, CU.passage)) defense += 2;
    if (
      u.code === CU.wounded &&
      q.wounded?.round === s.round &&
      q.wounded.ids.includes(u.id)
    )
      attack += 2;
    return { attack, defense };
  },
  engagementBonus: (s, u) => {
    const q = s.cirithUngol;
    if (!q || !isEnemy(u)) return 0;
    let bonus = 0;
    // Winding Stairs (active): each enemy in the staging area gets +10 engagement cost.
    if (activeIs(s, CU.stairs) && inStaging(s, u)) bonus += 10;
    if (live(u, CU.shagrat) && q.shagrat?.round === s.round)
      bonus -= q.shagrat.amount;
    return bonus;
  },
  // Shagrat: after progress is placed on the quest, -X engagement cost until the end of the round.
  questProgressPlaced: (s, _quest, amount) => {
    const q = s.cirithUngol;
    if (!q || amount <= 0) return;
    if (!enemiesInPlay(s).some((u) => live(u, CU.shagrat))) return;
    const before = q.shagrat?.round === s.round ? q.shagrat.amount : 0;
    q.shagrat = { round: s.round, amount: before + amount };
    log(
      s,
      `Shagrat gets -${amount} engagement cost until the end of the round.`,
      "danger",
    );
  },
  cannotAttach: (s, u, code) =>
    !!s.cirithUngol &&
    ((u.code === CU.gorbag && !u.blanked) ||
      (live(u, CU.shagrat) && card(code).sphere_code !== "boon")),
  // Shagrat cannot take non-combat damage.
  damageAmount: (s, u, amount, context) =>
    s.cirithUngol && live(u, CU.shagrat) && !context.combatDamage ? 0 : amount,
  // Allies cannot attack or defend against Shagrat.
  cannotAttack: (s, character, enemy) =>
    !!s.cirithUngol && live(enemy, CU.shagrat) && isAlly(character),
  cannotDefend: (s, enemy, defender) =>
    !!s.cirithUngol &&
    live(enemy, CU.shagrat) &&
    !!defender &&
    isAlly(defender),
  // The Two Watchers: its damage is canceled and raises the defending player's threat instead.
  replaceDamage: (s, u, amount, context) => {
    if (!s.cirithUngol || amount <= 0 || !context.combatDamage) return false;
    const enemy = get(s, context.enemyId);
    if (!enemy || enemy.code !== CU.watchersEnemy || enemy.blanked)
      return false;
    const p = s.combat?.attackPlayer ?? ownerOf(s, u);
    forOwner(s, p, () => raiseThreat(s, amount, "encounter"));
    log(
      s,
      `The Two Watchers: the ${amount} damage to ${name(u)} is canceled, and ${s.table ? `${seatName(s, p)} raises his` : "you raise your"} threat by ${amount} instead.`,
      "danger",
    );
    return true;
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.cirithUngol || !isCharacter(u) || !context.combatDamage || !c)
      return;
    if (context.enemyId !== c.enemyId) return;
    if (c.cuReturnOnKill) {
      c.cuReturnOnKill = false;
      c.returnToStaging = true;
    }
    if (c.cuRevealOnKill) {
      c.cuRevealOnKill = false;
      prepend(s, fx("reveal", { player: c.attackPlayer ?? activeSeat(s) }));
    }
  },
  abilityLabel: (code) => (code === CU.company ? COMPANY_LABEL : undefined),
  abilityProblem: (s, u, attachmentId) => companyProblem(s, u, attachmentId),
  ability: (s, u, attachmentId) => useCompany(s, u, attachmentId),
  effect: cirithUngolEffect,
  sharedEffect: (e) =>
    [
      "cuTreacheryDone",
      "cuCompany",
      "cuCompanyAttach",
      "cuDefeat",
      "cuStageTwo",
      "cuStageThree",
      "cuTowerBegin",
      "cuHall",
      "cuShagrat",
      "cuHowl",
    ].includes(e.kind),
};
