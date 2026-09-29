// Game creation and scenario setup.
import {
  card,
  HEROES,
  DECK,
  SCRIPTED,
  encounterCards,
  STARTERS,
} from "./cards";
import type {
  GameState,
  ScenarioId,
  PlayMode,
  CampaignState,
  SeatConfig,
  ReviewMode,
} from "./types";
import { SCENARIOS, scenario, OBJECTIVES } from "./scenarios";

import {
  eachSeat,
  playerOrder,
  selectSeat,
  snapshotSeat,
  syncSeat,
} from "./table";

import { pauseFor } from "./presentation";
import { draw, enqueue, fx, log, make, requireRule, shuffle } from "./core";

import { flush } from "./effects";
import { newCampaign } from "./campaign";

/** The official deck limits: at least 50 cards, at most 3 copies, scripted player cards only. */
export function validateDeckList(
  deck: Record<string, number>,
  originalStarter = false,
) {
  const size = Object.values(deck).reduce((n, v) => n + v, 0);
  requireRule(
    (size >= 50 && size <= 100) || (size === 30 && originalStarter),
    "Use an original 30-card starter list or at least 50 cards for a custom deck.",
  );
  for (const [code, n] of Object.entries(deck)) {
    requireRule(
      SCRIPTED.has(code) &&
        card(code).type_code !== "hero" &&
        card(code).sphere_code !== "encounter" &&
        !code.startsWith("rc"),
      "Only scripted player cards can be included.",
    );
    requireRule(
      Number.isInteger(n) && n >= 0 && n <= 3,
      "A deck can contain at most 3 copies of each card.",
    );
  }
}
export function createGame(
  seed = Date.now(),
  deck = DECK,
  heroCodes = HEROES,
  deckId = "custom",
  options: {
    scenarioId?: ScenarioId;
    playMode?: PlayMode;
    campaign?: CampaignState;
    includeSupport?: boolean;
    seats?: SeatConfig[];
    guided?: boolean;
    reviewMode?: ReviewMode;
    /** Official easy mode: each hero starts with one additional resource. */
    easy?: boolean;
  } = {},
): GameState {
  const list = Object.entries(deck).flatMap(
    ([code, n]) => Array(n).fill(code) as string[],
  );
  const starter = STARTERS.find((d) => d.id === deckId);
  const original =
    !!starter &&
    JSON.stringify(Object.entries(deck).sort()) ===
      JSON.stringify(Object.entries(starter.cards).sort()) &&
    (heroCodes.join() === starter.heroes.join() ||
      !!options.campaign ||
      !!options.seats);
  validateDeckList(deck, original);
  requireRule(
    heroCodes.length >= 1 &&
      heroCodes.length <= 3 &&
      new Set(heroCodes).size === heroCodes.length &&
      heroCodes.every((c) => card(c).type_code === "hero"),
    "Choose one to three different heroes.",
  );
  const scenarioId = options.scenarioId ?? "mirkwood";
  const playMode = options.playMode ?? "normal";
  requireRule(
    SCENARIOS.some((q) => q.id === scenarioId),
    "Unknown Core Set scenario.",
  );
  requireRule(
    playMode === "normal" || playMode === "campaign",
    "Unknown game mode.",
  );
  requireRule(
    playMode !== "campaign" || options.campaign || scenarioId === "mirkwood",
    "A campaign begins in Mirkwood.",
  );
  const campaign =
    playMode === "campaign"
      ? structuredClone(
          options.campaign ??
            newCampaign(options.seats?.flatMap((p) => p.heroes) ?? heroCodes),
        )
      : null;
  const s: GameState = {
    ...(options.guided
      ? {
          flow: {
            nextId: 1,
            pending: null,
            history: [],
            ...(options.reviewMode ? { mode: options.reviewMode } : {}),
          },
        }
      : {}),
    version: 2,
    scenarioId,
    playMode,
    campaign,
    startingHeroes: [...heroCodes],
    prisoner: null,
    captiveMendor: null,
    nazgulDefeated: false,
    stageRevealing: false,
    alliesPlayed: 0,
    threatModifier: 0,
    shackles: 0,
    mendorBoost: false,
    campaignScarred: false,
    includeSupport: options.includeSupport ?? true,
    suspendedCombats: [],
    deckId,
    ...(original ? {} : { customDeck: { ...deck } }),
    ...(options.easy ? { easyMode: true } : {}),
    used: [],
    standTogether: false,
    peek: null,
    seed: seed | 0,
    originalSeed: seed | 0,
    nextId: 1,
    phase: "setup",
    round: 0,
    threat: 29,
    status: "playing",
    reason: "",
    heroes: [],
    allies: [],
    hand: [],
    deck: list,
    discard: [],
    removed: [],
    encounterDeck: encounterCards
      .filter((c) =>
        (scenario(scenarioId).sets as readonly string[]).includes(
          c.encounter_set ?? "",
        ),
      )
      .flatMap((c) => Array(c.quantity).fill(c.code)),
    encounterDiscard: [],
    staging: [],
    engaged: [],
    activeLocation: null,
    stage: 1,
    branch: "unknown",
    progress: 0,
    victory: 0,
    fallenThreat: 0,
    committedIds: [],
    questDebuff: 0,
    faramir: 0,
    gondor: false,
    eowynUsed: false,
    mulled: false,
    optionalEngagement: false,
    choice: null,
    queue: [],
    combat: null,
    log: [],
    lastReveal: null,
    lastQuest: null,
  };
  if (options.seats) {
    const heroes = options.seats.flatMap((p) => p.heroes);
    requireRule(
      options.seats.length >= 1 &&
        options.seats.length <= 4 &&
        new Set(heroes).size === heroes.length,
      "Choose one to four players with different heroes across the table.",
    );
    for (const config of options.seats) {
      const d = STARTERS.find((d) => d.id === config.deckId);
      requireRule(
        (d || config.cards) &&
          config.heroes.length >= 1 &&
          config.heroes.length <= 3 &&
          config.heroes.every(
            (h) => SCRIPTED.has(h) && card(h).type_code === "hero",
          ),
        "Each player needs one to three heroes and a Core Set starter or custom deck.",
      );
      if (config.cards) validateDeckList(config.cards);
    }
    const blank = snapshotSeat(s);
    s.table = {
      seats: options.seats.map(() => structuredClone(blank)),
      active: 0,
      first: 0,
      turn: 0,
      passed: [],
    };
    options.seats.forEach((config, i) => {
      selectSeat(s, i);
      const d = STARTERS.find((d) => d.id === config.deckId);
      const cards = config.cards ?? d!.cards;
      s.deckId = config.cards ? "custom" : d!.id;
      if (config.cards) s.customDeck = { ...config.cards };
      else delete s.customDeck;
      s.startingHeroes = [...config.heroes];
      s.deck = Object.entries(cards).flatMap(([code, n]) =>
        Array<string>(n).fill(code),
      );
      s.heroes = config.heroes.map((h) => make(s, h));
      s.threat =
        config.heroes.reduce((n, h) => n + (card(h).threat ?? 0), 0) +
        (campaign?.threatPenalty ?? 0);
      syncSeat(s);
    });
    selectSeat(s, 0);
  } else {
    s.heroes = heroCodes.map((code) => make(s, code));
    s.threat =
      s.heroes.reduce((n, h) => n + (card(h.code).threat ?? 0), 0) +
      (campaign?.threatPenalty ?? 0);
  }
  if (options.easy) {
    eachSeat(s, () => {
      for (const h of s.heroes) h.resources += 1;
    });
    log(s, "Easy mode: each hero begins with 1 additional resource.", "good");
  }
  if (campaign) {
    s.encounterDeck.push(
      ...campaign.burdens.filter((c) => ["rc136", "rc137"].includes(c)),
    );
    eachSeat(s, () => {
      if (s.includeSupport && campaign.boons.includes("rc132"))
        s.deck.push("rc132");
      for (const h of s.heroes)
        for (const code of campaign.permanent[h.code] ?? [])
          h.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
    });
    s.allies.push(make(s, "rc135"));
  }
  eachSeat(s, () => {
    shuffle(s, s.deck);
    draw(s, 6);
  });
  if (scenarioId === "mirkwood") {
    for (const code of ["01096", "01099"]) {
      s.encounterDeck.splice(s.encounterDeck.indexOf(code), 1);
      s.staging.push(make(s, code));
    }
    shuffle(s, s.encounterDeck);
  } else if (scenarioId === "anduin") {
    shuffle(s, s.encounterDeck);
    enqueue(
      s,
      ...playerOrder(s).map((player) => fx("reveal", { player })),
      fx("ensureTroll"),
    );
  } else {
    s.encounterDeck = s.encounterDeck.filter(
      (code) => code !== "01102" && !OBJECTIVES.includes(code),
    );
    shuffle(s, s.encounterDeck);
    if (campaign)
      enqueue(s, fx("appointedByFate", { player: s.table?.first ?? 0 }));
    for (const code of OBJECTIVES) {
      const objective = make(s, code);
      s.staging.push(objective);
      enqueue(s, fx("guardObjective", { target: objective.id }));
    }
    enqueue(s, fx("capturePrisoner"));
  }
  log(
    s,
    `${scenario(scenarioId).name} · ${playMode === "campaign" ? "Mirkwood Paths campaign" : "Normal game"}.`,
    "chapter",
  );
  if (s.flow)
    pauseFor(s, {
      kind: "setup",
      title: `${scenario(scenarioId).shortName} · The table is ready`,
      detail:
        "Each fellowship has drawn six starting cards. Review the setup, then continue at your pace.",
      cards: s.staging.map((u) => ({ code: u.code, label: "Scenario setup" })),
      lines: s.log.slice(),
    });
  flush(s);
  return s;
}
