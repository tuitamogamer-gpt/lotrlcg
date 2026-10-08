import { hasEncounterKeyword } from "./encounter-keyword";
import { setupAntlered } from "./antlered";
import { setupCelebrimbor } from "./celebrimbor";
import { setupNin } from "./nin-eilph";
import { setupTharbad } from "./tharbad";
import { setupThreeTrials } from "./three-trials";
import { setupDunlandTrap } from "./dunland-trap";
import { setupFangorn } from "./fangorn";
import { setupCatchOrc } from "./catch-orc";
import { setupFordsIsen } from "./fords-isen";
import { setupBloodGondor } from "./blood-gondor";
import { BUILT_IN_DECKS } from "./built-in-decks";
import { setupMorgulVale } from "./morgul-vale";
import { setupDruadanForest } from "./druadan-forest";
import { setupAmonDin } from "./amon-din";
import { setupAssaultOsgiliath } from "./assault-osgiliath";
import { setupHeirs } from "./heirs-numenor";
import { setupStewardFear } from "./steward-fear";
import { setupShadowFlame } from "./shadow-flame";
import { setupFoundationsStone } from "./foundations-stone";
import { startingThreat } from "./starting-threat";
import { setupLongDark } from "./long-dark";
import { setupWatcherWater } from "./watcher-water";
import { setupRoadRivendell } from "./road-rivendell";
import { setupRedhorn } from "./redhorn-gate";
import { syncAttachmentText } from "./attachment-text";
import { setupKhazad } from "./khazad-dum";
// Game creation and scenario setup.
import { card, HEROES, DECK, SCRIPTED, encounterCards } from "./cards";
import type {
  GameState,
  ScenarioId,
  PlayMode,
  CampaignState,
  SeatConfig,
  ReviewMode,
} from "./types";
import {
  SCENARIOS,
  scenario,
  OBJECTIVES,
  CAMPAIGN_CHAPTERS,
} from "./scenarios";

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
import { setupCarrock } from "./carrock";
import { setupEmynMuil } from "./emyn-muil";
import { setupRhosgobel } from "./rhosgobel";
import { setupReturnMirkwood } from "./return-mirkwood";
import { setupDeadMarshes } from "./dead-marshes";

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
        !hasEncounterKeyword(card(code)) &&
        card(code).type_code !== "hero" &&
        card(code).sphere_code !== "encounter" &&
        !code.startsWith("rc"),
      "Only scripted player cards can be included.",
    );
    requireRule(
      Number.isInteger(n) &&
        n >= 0 &&
        n <= Math.min(3, card(code).deck_limit ?? 3),
      `${card(code).name}: a deck can contain at most ${Math.min(3, card(code).deck_limit ?? 3)} copies.`,
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
    rangerReserves?: Record<number, number>;
  } = {},
): GameState {
  const starter = BUILT_IN_DECKS.find((d) => d.id === deckId);
  const original =
    !!starter &&
    JSON.stringify(Object.entries(deck).sort()) ===
      JSON.stringify(Object.entries(starter.cards).sort()) &&
    (heroCodes.join() === starter.heroes.join() ||
      !!options.campaign ||
      !!options.seats);
  validateDeckList(deck, original);
  const list = Object.entries(deck).flatMap(
    ([code, n]) => Array(n).fill(code) as string[],
  );
  requireRule(
    heroCodes.length >= 1 &&
      heroCodes.length <= 3 &&
      new Set(heroCodes).size === heroCodes.length &&
      heroCodes.every((c) => SCRIPTED.has(c) && card(c).type_code === "hero") &&
      new Set(heroCodes.map((c) => card(c).name)).size === heroCodes.length,
    "Choose one to three different heroes.",
  );
  const scenarioId = options.scenarioId ?? "mirkwood";
  const playMode = options.playMode ?? "normal";
  const chosenHeroes = options.seats?.flatMap((p) => p.heroes) ?? heroCodes;
  requireRule(
    scenarioId !== "fords-of-isen" ||
      !chosenHeroes.some((c) => card(c).name === "Gríma"),
    "Gríma is reserved by this scenario; choose another hero.",
  );
  requireRule(
    !["the-blood-of-gondor", "the-morgul-vale"].includes(scenarioId) ||
      !chosenHeroes.some((c) => card(c).name === "Faramir"),
    "Faramir is reserved by this scenario; choose another hero.",
  );
  requireRule(
    SCENARIOS.some((q) => q.id === scenarioId),
    "Unknown or unsupported scenario.",
  );
  requireRule(
    playMode === "normal" || playMode === "campaign",
    "Unknown game mode.",
  );
  requireRule(
    playMode !== "campaign" || options.campaign || scenarioId === "mirkwood",
    "A campaign begins in Mirkwood.",
  );
  requireRule(
    playMode !== "campaign" || CAMPAIGN_CHAPTERS.includes(scenarioId),
    "The Mirkwood Paths campaign covers the three Core Set quests.",
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
      .flatMap((c) =>
        Array(
          options.easy && c.easy_quantity !== undefined
            ? c.easy_quantity
            : c.quantity,
        ).fill(c.code),
      ),
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
        new Set(heroes).size === heroes.length &&
        heroes.every((h) => SCRIPTED.has(h) && card(h).type_code === "hero") &&
        new Set(heroes.map((h) => card(h).name)).size === heroes.length,
      "Choose one to four players with different heroes across the table.",
    );
    for (const config of options.seats) {
      const d = BUILT_IN_DECKS.find((d) => d.id === config.deckId);
      requireRule(
        (d || config.cards) &&
          config.heroes.length >= 1 &&
          config.heroes.length <= 3 &&
          config.heroes.every(
            (h) => SCRIPTED.has(h) && card(h).type_code === "hero",
          ),
        "Each player needs one to three supported heroes and a starter or custom deck.",
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
      const d = BUILT_IN_DECKS.find((d) => d.id === config.deckId);
      const cards = config.cards ?? d!.cards;
      s.deckId = config.cards ? "custom" : d!.id;
      if (config.cards) s.customDeck = { ...config.cards };
      else delete s.customDeck;
      s.startingHeroes = [...config.heroes];
      s.deck = Object.entries(cards).flatMap(([code, n]) =>
        Array<string>(n).fill(code),
      );
      s.heroes = config.heroes.map((h) => make(s, h));
      s.threat = startingThreat(config.heroes) + (campaign?.threatPenalty ?? 0);
      s.startingThreat = s.threat;
      syncSeat(s);
    });
    selectSeat(s, 0);
  } else {
    s.heroes = heroCodes.map((code) => make(s, code));
    s.threat = startingThreat(heroCodes) + (campaign?.threatPenalty ?? 0);
  }
  s.rangerReserves = Object.fromEntries(
    playerOrder(s).map((p) => [p, options.rangerReserves?.[p] ?? 3]),
  );
  requireRule(
    Object.values(s.rangerReserves).every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 3,
    ),
    "Set aside between zero and three Rangers per player.",
  );
  if (!s.table) s.startingThreat = s.threat;
  if (options.easy) {
    eachSeat(s, () => {
      for (const h of s.heroes) h.resources += 1;
    });
    log(
      s,
      "Easy mode: each hero begins with 1 additional resource, and the encounter cards marked for easy mode are set aside.",
      "good",
    );
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
  } else if (scenarioId === "hunt-for-gollum") {
    shuffle(s, s.encounterDeck);
    enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
  } else if (scenarioId === "conflict-at-the-carrock") {
    setupCarrock(s);
  } else if (scenarioId === "hills-of-emyn-muil") {
    setupEmynMuil(s);
  } else if (scenarioId === "journey-to-rhosgobel") {
    setupRhosgobel(s);
  } else if (scenarioId === "dead-marshes") {
    setupDeadMarshes(s);
  } else if (scenarioId === "return-to-mirkwood") {
    setupReturnMirkwood(s);
  } else if (
    ["into-the-pit", "the-seventh-level", "flight-from-moria"].includes(
      scenarioId,
    )
  ) {
    setupKhazad(s);
  } else if (scenarioId === "road-to-rivendell") {
    setupRoadRivendell(s);
  } else if (scenarioId === "redhorn-gate") {
    setupRedhorn(s);
  } else if (scenarioId === "shadow-and-flame") {
    setupShadowFlame(s);
  } else if (
    ["peril-in-pelargir", "into-ithilien", "siege-of-cair-andros"].includes(
      scenarioId,
    )
  ) {
    setupHeirs(s);
  } else if (scenarioId === "the-druadan-forest") {
    setupDruadanForest(s);
  } else if (scenarioId === "encounter-at-amon-din") {
    setupAmonDin(s);
  } else if (scenarioId === "the-blood-of-gondor") {
    setupBloodGondor(s);
  } else if (scenarioId === "the-antlered-crown") {
    setupAntlered(s);
  } else if (scenarioId === "celebrimbors-secret") {
    setupCelebrimbor(s);
  } else if (scenarioId === "the-nin-in-eilph") {
    setupNin(s);
  } else if (scenarioId === "trouble-in-tharbad") {
    setupTharbad(s);
  } else if (scenarioId === "the-three-trials") {
    setupThreeTrials(s);
  } else if (scenarioId === "the-dunland-trap") {
    setupDunlandTrap(s);
  } else if (scenarioId === "into-fangorn") {
    setupFangorn(s);
  } else if (scenarioId === "to-catch-an-orc") {
    setupCatchOrc(s);
  } else if (scenarioId === "fords-of-isen") {
    setupFordsIsen(s);
  } else if (scenarioId === "the-morgul-vale") {
    setupMorgulVale(s);
  } else if (scenarioId === "assault-on-osgiliath") {
    setupAssaultOsgiliath(s);
  } else if (scenarioId === "the-stewards-fear") {
    setupStewardFear(s);
  } else if (scenarioId === "foundations-of-stone") {
    setupFoundationsStone(s);
  } else if (scenarioId === "the-long-dark") {
    setupLongDark(s);
  } else if (scenarioId === "watcher-in-the-water") {
    setupWatcherWater(s);
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
  syncAttachmentText(s);
  return s;
}
