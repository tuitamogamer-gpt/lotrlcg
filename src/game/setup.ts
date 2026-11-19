import {
  addHobbitTreasures,
  isBagginsBilbo,
  isHobbitScenarioId,
  placeBagginsBilbo,
} from "./hobbit-saga";
import { messengerSetup } from "./land-sorrow-player";
import {
  isFellowshipHero,
  isTreasonSarumanScenarioId,
  fellowshipAragornCode,
  sagaLineUp,
  isLotrSagaScenarioId,
  placeRingBearer,
} from "./lotr-saga";
import { bondHeroLimit, bondSetup } from "./fortress-nurn-player";
import { councilSetup } from "./ash-mountains-player";
import { wandererSetup } from "./wainriders-player";
import { huntersSetup } from "./ulfast-player";
import { perilousVoyageSetup } from "./perilous-voyage";
import { shadowEastPlayerScenarioProblem } from "./deck-setup";
import { burglarContractSetup } from "./burglar-contract";
import * as ShadowEastPlayers from "./shadow-east-player";
import { eredMithrinPlayerSetup } from "./ered-mithrin-player";
import { encounterReserveDefaults } from "./encounter-reserves";
import { batch4PlayerSetup } from "./batch4-player";
import { batch4Scenario } from "./batch4-scenarios";
import { huntDreadnaughtFleetSetup } from "./hunt-dreadnaught";
import * as Sands from "./beneath-sands";
import * as Race from "./race-harad";
import * as City from "./city";
import * as Umbar from "./escape-umbar";
import * as Desert from "./desert-crossing";
import * as Mordor from "./long-arm-mordor";
import * as Mumakil from "./mumakil";
import * as Cobas from "./cobas";
import * as Drowned from "./drowned";
import { setupDeadmensDike } from "./deadmens-dike";
import { setupVoyageBelegaer } from "./voyage-belegaer";
import { setupFateNumenor } from "./fate-numenor";
import { setupRaidGreyHavens } from "./raid-grey-havens";
import { setupStormcaller } from "./stormcaller";
import { setupDepths } from "./depths";
import { setupTemple } from "./temple";
import { stormcallerSetup as stormcallerPlayerSetup } from "./stormcaller-player";
import { flameWestPlayerSetup } from "./flame-west-player-cards";
import { greyHavensSetup } from "./grey-havens-player";
import * as Wastes from "./wastes-eriador";
import * as Gram from "./mount-gram";
import * as Etten from "./ettenmoors";
import * as Dread from "./dread-realm";
import * as Carn from "./carn-dum";
import * as Rhudaur from "./rhudaur";
import { setupChetwood } from "./chetwood";
import { setupWeather } from "./weather-hills";
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
import { SCENARIOS, scenario, OBJECTIVES } from "./scenarios";

import {
  eachSeat,
  playerOrder,
  selectSeat,
  seatView,
  snapshotSeat,
  syncSeat,
} from "./table";

import { pauseFor } from "./presentation";
import { draw, enqueue, fx, log, make, requireRule, shuffle } from "./core";

import { flush } from "./effects";
import { newCampaign } from "./campaign";
import {
  angmarCampaignDeckSetup,
  angmarCampaignSetup,
  angmarThreatReduction,
  angmarChapterSupported,
  angmarForbiddenTitle,
  isAngmarCampaign,
  newAngmarCampaign,
  nextAngmarChapter,
} from "./angmar-campaign";
import {
  DARK_MIRKWOOD_CHAPTERS,
  darkMirkwoodCampaignSetup,
  darkMirkwoodDeckSetup,
  mendorStarts,
  MIRKWOOD_PATHS_ORDER,
  nextMirkwoodChapter,
} from "./dark-mirkwood-campaign";
import {
  dreamchaserCampaignSetup,
  dreamchaserChapterSupported,
  dreamchaserDeckSetup,
  dreamchaserForbiddenTitle,
  isDreamchaserCampaign,
  newDreamchaserCampaign,
  nextDreamchaserChapter,
} from "./dreamchaser-campaign";
import {
  eredCampaignDeckSetup,
  eredCampaignSetup,
  eredChapterSupported,
  eredForbiddenTitle,
  isEredCampaign,
  newEredCampaign,
  nextEredChapter,
} from "./ered-campaign";
import {
  isSagaCampaign,
  newSagaCampaign,
  sagaChapterOptions,
  sagaCampaignDeckSetup,
  sagaCampaignSetup,
  sagaChapterSupported,
  sagaForbiddenTitle,
  sagaPlayerPenalty,
  sagaStartingHandPenalty,
} from "./saga-campaign";
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
  const size = Object.entries(deck).reduce(
    (n, [code, count]) =>
      n +
      (SCRIPTED.has(code) && card(code).type_code === "contract" ? 0 : count),
    0,
  );
  requireRule(
    Object.entries(deck).reduce(
      (n, [code, count]) =>
        n +
        (SCRIPTED.has(code) && card(code).type_code === "contract" ? count : 0),
      0,
    ) <= 1,
    "Choose at most one contract to begin in play.",
  );
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
        !code.startsWith("rc") &&
        !card(code).treasure,
      "Only scripted player cards can be included; a treasure joins a deck only once discovered.",
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
    /** Each Encounter design has an independent zero-to-three reserve. */
    batch4WindReserves?: Record<number, number>;
    eredEagleReserves?: Record<number, number>;
    wrathBombadilReserves?: Record<number, number>;
    /** Fourteen distinct Item/Artifact attachments per Burglar contract. */
    burglarLoot?: Record<number, string[]>;
    /** The Hobbit: discovered treasures each player adds to their deck. */
    hobbitTreasures?: Record<number, string[]>;
    /** The Dream-chaser campaign: the Hard/Expert Mode card's side for this chapter. */
    dreamchaserMode?: "hard" | "expert";
    /**
     * A new campaign after The Caves of Nibin-Dûm rescued the Ranger: the
     * seats that shuffle 1 copy of Ranger Sense into their deck and add it to
     * the Campaign Pool.
     */
    rangerLegacy?: number[];
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
      heroCodes.length <= bondHeroLimit(deck) &&
      new Set(heroCodes).size === heroCodes.length &&
      heroCodes.every((c) => SCRIPTED.has(c) && card(c).type_code === "hero") &&
      new Set(heroCodes.map((c) => card(c).name)).size === heroCodes.length,
    "Choose one to three different heroes (four with Bond of Friendship).",
  );
  const scenarioId = options.scenarioId ?? "mirkwood";
  const playMode = options.playMode ?? "normal";
  const chosenHeroes = options.seats?.flatMap((p) => p.heroes) ?? heroCodes;
  const shadowEastProblem = shadowEastPlayerScenarioProblem(
    scenarioId,
    chosenHeroes,
  );
  requireRule(!shadowEastProblem, shadowEastProblem ?? "");
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
    !chosenHeroes.some((c) => isFellowshipHero(c)),
    "Fellowship heroes such as the Ring-bearer are placed by The Lord of the Rings Saga; they are not chosen as heroes.",
  );
  requireRule(
    !isLotrSagaScenarioId(scenarioId) ||
      !!fellowshipAragornCode(scenarioId) ||
      !chosenHeroes.some((c) => card(c).name === "Frodo Baggins"),
    "Frodo Baggins is the Ring-bearer in The Lord of the Rings Saga; choose another hero.",
  );
  // The Treason of Saruman: no ally or hero titled "Saruman" or "Gríma".
  requireRule(
    !isTreasonSarumanScenarioId(scenarioId) ||
      ![
        ...chosenHeroes,
        ...Object.keys(deck),
        ...(options.seats ?? []).flatMap((p) => Object.keys(p.cards ?? {})),
      ].some(
        (c) =>
          ["Saruman", "Gríma"].includes(card(c).name) &&
          ["hero", "ally"].includes(card(c).type_code),
      ),
    "The Treason of Saruman forbids any ally or hero titled Saruman or Gríma; choose another card.",
  );
  // A player's other Aragorn is set aside: the Fellowship Aragorn is unique.
  const chosenLineUps = options.seats?.map((p) => p.heroes) ?? [heroCodes];
  heroCodes = sagaLineUp(scenarioId, heroCodes);
  requireRule(
    heroCodes.length >= 1 &&
      (options.seats ?? []).every(
        (p) => sagaLineUp(scenarioId, p.heroes).length >= 1,
      ),
    "The Fellowship Aragorn is unique in this Saga scenario; choose another hero besides Aragorn.",
  );
  requireRule(
    !chosenHeroes.some((c) => isBagginsBilbo(c)),
    "The Baggins Bilbo Baggins joins the first player only in The Hobbit scenarios; he is not chosen as a hero.",
  );
  requireRule(
    !isHobbitScenarioId(scenarioId) ||
      !chosenHeroes.some((c) => card(c).name === "Bilbo Baggins"),
    "Bilbo Baggins is reserved by The Hobbit; choose another hero.",
  );
  requireRule(
    SCENARIOS.some((q) => q.id === scenarioId),
    "Unknown or unsupported scenario.",
  );
  requireRule(
    playMode === "normal" || playMode === "campaign",
    "Unknown game mode.",
  );
  // The Lord of the Rings campaign follows the saga scenarios; Mirkwood Paths
  // follows the three Core Set quests.
  const sagaCampaign =
    playMode === "campaign" &&
    (options.campaign
      ? isSagaCampaign(options.campaign)
      : isLotrSagaScenarioId(scenarioId));
  // The Angmar Awakened campaign begins with Intruders in Chetwood.
  const angmarCampaign =
    playMode === "campaign" &&
    (options.campaign
      ? isAngmarCampaign(options.campaign)
      : scenarioId === "intruders-in-chetwood");
  // The Dream-chaser campaign begins with Voyage Across Belegaer.
  const dreamchaserCampaign =
    playMode === "campaign" &&
    (options.campaign
      ? isDreamchaserCampaign(options.campaign)
      : scenarioId === "voyage-across-belegaer");
  // The Ered Mithrin campaign begins with Journey Up the Anduin.
  const eredCampaign =
    playMode === "campaign" &&
    (options.campaign
      ? isEredCampaign(options.campaign)
      : scenarioId === "journey-up-the-anduin");
  // Mirkwood Paths begins in Mirkwood; The Dark of Mirkwood's mini campaign
  // begins at The Oath with a blank Campaign Log.
  requireRule(
    playMode !== "campaign" ||
      sagaCampaign ||
      angmarCampaign ||
      dreamchaserCampaign ||
      eredCampaign ||
      options.campaign ||
      scenarioId === "mirkwood" ||
      scenarioId === "the-oath",
    "A campaign begins in Mirkwood, or at The Oath for The Dark of Mirkwood's mini campaign.",
  );
  requireRule(
    playMode !== "campaign" ||
      sagaCampaign ||
      angmarCampaign ||
      dreamchaserCampaign ||
      eredCampaign ||
      (MIRKWOOD_PATHS_ORDER.includes(scenarioId) &&
        nextMirkwoodChapter({
          completed: options.campaign?.completed ?? [],
          mini:
            options.campaign?.mini ??
            (!options.campaign?.completed.length && scenarioId === "the-oath"),
        }) === scenarioId),
    "The Mirkwood Paths campaign follows its chapters in order: the three Core Set quests, then The Oath and The Caves of Nibin-Dûm.",
  );
  requireRule(
    !angmarCampaign ||
      (angmarChapterSupported(scenarioId) &&
        nextAngmarChapter(options.campaign ?? { completed: [] }) ===
          scenarioId),
    "The Angmar Awakened campaign follows its chapters in order, beginning with Intruders in Chetwood.",
  );
  requireRule(
    !dreamchaserCampaign ||
      (dreamchaserChapterSupported(scenarioId) &&
        nextDreamchaserChapter(options.campaign ?? { completed: [] }) ===
          scenarioId),
    "The Dream-chaser campaign follows its chapters in order, beginning with Voyage Across Belegaer.",
  );
  requireRule(
    !eredCampaign ||
      (eredChapterSupported(scenarioId) &&
        nextEredChapter(options.campaign ?? { completed: [] }) === scenarioId),
    "The Ered Mithrin campaign follows its chapters in order, beginning with Journey Up the Anduin.",
  );
  requireRule(
    !options.dreamchaserMode || dreamchaserCampaign,
    "Hard and Expert Mode belong to the Dream-chaser campaign.",
  );
  // The Old Forest and Fog on the Barrow-downs may follow A Shadow of the Past.
  requireRule(
    !sagaCampaign ||
      (sagaChapterSupported(scenarioId) &&
        sagaChapterOptions(options.campaign ?? newSagaCampaign([])).includes(
          scenarioId,
        )),
    "The Lord of the Rings campaign follows its chapters in order, beginning with A Shadow of the Past.",
  );
  // The campaign's box rules: no card titled "Frodo Baggins" in The Treason
  // of Saruman and The Flame of the West, none titled "Aragorn" in The Land of
  // Shadow.
  const forbidden = sagaCampaign
    ? sagaForbiddenTitle(scenarioId)
    : angmarCampaign
      ? angmarForbiddenTitle(scenarioId)
      : dreamchaserCampaign
        ? dreamchaserForbiddenTitle(scenarioId)
        : eredCampaign
          ? eredForbiddenTitle(scenarioId)
          : undefined;
  requireRule(
    !forbidden || !chosenHeroes.some((c) => card(c).name === forbidden),
    `No card titled ${forbidden} can be used in this chapter of the campaign.`,
  );
  const chosenLine = options.seats?.flatMap((p) => p.heroes) ?? heroCodes;
  const campaign =
    playMode === "campaign"
      ? structuredClone(
          options.campaign ??
            (sagaCampaign
              ? newSagaCampaign(
                  chosenLine,
                  options.seats?.map((p) => p.heroes.length),
                )
              : angmarCampaign
                ? newAngmarCampaign(
                    chosenLine,
                    options.seats?.map((p) => p.heroes.length),
                  )
                : dreamchaserCampaign
                  ? newDreamchaserCampaign(
                      chosenLine,
                      options.seats?.map((p) => p.heroes.length),
                    )
                  : eredCampaign
                    ? newEredCampaign(
                        chosenLine,
                        options.seats?.map((p) => p.heroes.length),
                      )
                    : newCampaign(chosenLine)),
        )
      : null;
  // The Dark of Mirkwood's mini campaign: The Oath with a blank Campaign Log.
  if (
    campaign &&
    !campaign.kind &&
    !campaign.completed.length &&
    scenarioId === "the-oath"
  )
    campaign.mini = true;
  // The Caves of Nibin-Dûm's legacy: "At the start of your next campaign,
  // each player may also shuffle 1 copy of Ranger Sense into their deck and
  // add it to the Campaign Pool."
  if (options.rangerLegacy?.length) {
    const seatCount = options.seats?.length ?? 1;
    requireRule(
      !!campaign &&
        !campaign.completed.length &&
        new Set(options.rangerLegacy).size === options.rangerLegacy.length &&
        options.rangerLegacy.every(
          (seat) => Number.isSafeInteger(seat) && seat >= 0 && seat < seatCount,
        ),
      "Ranger Sense joins a new campaign, one copy for each player at most.",
    );
    campaign!.rangerSense = [...options.rangerLegacy].sort((a, b) => a - b);
  }
  const s: GameState = {
    // The Dream-chaser campaign: the Hard/Expert Mode card for this chapter.
    ...(options.dreamchaserMode
      ? { dreamchaser: { mode: options.dreamchaserMode } }
      : {}),
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
    // A campaign card lies next to the quest deck, never in the encounter
    // deck, even when it shares the scenario's encounter set.
    encounterDeck: encounterCards
      .filter(
        (c) =>
          c.type_code !== "campaign" &&
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
          config.heroes.length <= bondHeroLimit(config.cards ?? d?.cards) &&
          config.heroes.every(
            (h) => SCRIPTED.has(h) && card(h).type_code === "hero",
          ),
        "Each player needs one to three supported heroes (four with Bond of Friendship) and a starter or custom deck.",
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
      const heroes = sagaLineUp(scenarioId, config.heroes);
      s.startingHeroes = [...heroes];
      s.deck = Object.entries(cards).flatMap(([code, n]) =>
        Array<string>(n).fill(code),
      );
      s.heroes = heroes.map((h) => make(s, h));
      s.threat = Math.max(
        0,
        startingThreat(heroes) +
          sagaPlayerPenalty(campaign, i) -
          angmarThreatReduction(campaign),
      );
      s.startingThreat = s.threat;
      syncSeat(s);
    });
    selectSeat(s, 0);
  } else {
    s.heroes = heroCodes.map((code) => make(s, code));
    s.threat = Math.max(
      0,
      startingThreat(heroCodes) +
        sagaPlayerPenalty(campaign, 0) -
        angmarThreatReduction(campaign),
    );
  }
  s.rangerReserves = {};
  s.batch4WindReserves = {};
  s.eredEagleReserves = {};
  s.wrathBombadilReserves = {};
  for (const player of playerOrder(s)) {
    const defaults = encounterReserveDefaults(seatView(s, player).deck);
    const rangers = options.rangerReserves?.[player] ?? defaults.rangers,
      wind = options.batch4WindReserves?.[player] ?? defaults.wind,
      eagles = options.eredEagleReserves?.[player] ?? defaults.eagles,
      bombadil =
        options.wrathBombadilReserves?.[player] ?? defaults.bombadil ?? 0;
    requireRule(
      [rangers, wind, eagles, bombadil].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 3,
      ),
      "Set aside between zero and three copies of each Encounter card per player.",
    );
    s.rangerReserves[player] = rangers;
    s.batch4WindReserves[player] = wind;
    s.eredEagleReserves[player] = eagles;
    s.wrathBombadilReserves[player] = bombadil;
  }
  if (!s.table) s.startingThreat = s.threat;
  // The Hobbit: the first player gains control of Bilbo Baggins (threat 0).
  placeBagginsBilbo(s);
  // The Lord of the Rings: the first player claims The One Ring and the Ring-bearer.
  placeRingBearer(s);
  chosenLineUps.forEach((heroes, player) => {
    const aside = heroes.filter(
      (h) => !sagaLineUp(scenarioId, heroes).includes(h),
    );
    if (aside.length)
      log(
        s,
        `${s.table ? `Player ${player + 1}'s` : "Your"} ${aside.map((h) => card(h).name).join(", ")} is set aside: the Fellowship hero Aragorn is unique in this Saga scenario.`,
      );
  });
  addHobbitTreasures(s, options.hobbitTreasures);
  huntersSetup(s);
  burglarContractSetup(s, options.burglarLoot);
  ShadowEastPlayers.shadowEastPlayerSetup(s);
  wandererSetup(s);
  councilSetup(s);
  messengerSetup(s);
  bondSetup(s);
  perilousVoyageSetup(s);
  // The Hunt for the Dreadnaught: each player chooses a ship before drawing.
  huntDreadnaughtFleetSetup(s);
  if (s.choice || s.queue.length) {
    s.setupPending = true;
    enqueue(s, fx("gameSetupContinue"));
  } else finishGameSetup(s);
  flush(s);
  syncAttachmentText(s);
  return s;
}

/** Saved continuation: Ring selection resolves before hands and scenario setup. */
export function finishGameSetup(s: GameState) {
  delete s.setupPending;
  const { scenarioId, playMode, campaign } = s;
  if (s.easyMode) {
    eachSeat(s, () => {
      for (const h of s.heroes) h.resources += 1;
    });
    log(
      s,
      "Easy mode: each hero begins with 1 additional resource, and the encounter cards marked for easy mode are set aside.",
      "good",
    );
  }
  // Mirkwood Paths (the campaign without a kind). The Dark of Mirkwood's
  // chapters build their encounter decks from recipes: their Campaign Pool
  // burdens join after the scenario's setup (darkMirkwoodCampaignSetup).
  if (campaign && !campaign.kind) {
    if (!DARK_MIRKWOOD_CHAPTERS.includes(scenarioId))
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
    // Parts 1–3: "Setup: Put Mendor into play." Parts 4 and 5 begin with
    // Mendor while he is in the Campaign Pool.
    if (mendorStarts(campaign, scenarioId)) s.allies.push(make(s, "rc135"));
  }
  // The Lord of the Rings campaign: earned player-card boons join their decks.
  sagaCampaignDeckSetup(s);
  // The Angmar Awakened campaign: Iârion's Pendant and Determination.
  angmarCampaignDeckSetup(s);
  // The Dream-chaser campaign: the Campaign Pool's player cards.
  dreamchaserDeckSetup(s);
  // Ranger Sense: a copy in the Campaign Pool joins its player's deck.
  darkMirkwoodDeckSetup(s);
  // The Ered Mithrin campaign: boon allies and discovered treasures.
  eredCampaignDeckSetup(s);
  eachSeat(s, () => {
    shuffle(s, s.deck);
    // Gandalf's Delay (a saga campaign burden): 1 less card.
    draw(
      s,
      (batch4Scenario(s).startingHandSize?.(s) ?? 6) -
        sagaStartingHandPenalty(s),
    );
  });
  greyHavensSetup(s);
  stormcallerPlayerSetup(s);
  flameWestPlayerSetup(s);
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
  } else if (scenarioId === "intruders-in-chetwood") {
    setupChetwood(s);
  } else if (scenarioId === "the-weather-hills") {
    setupWeather(s);
  } else if (scenarioId === "deadmens-dike") {
    setupDeadmensDike(s);
  } else if (scenarioId === "wastes-of-eriador") {
    Wastes.setupWastes(s);
  } else if (scenarioId === "escape-from-mount-gram") {
    Gram.setupMountGram(s);
  } else if (scenarioId === "across-the-ettenmoors") {
    Etten.setupEttenmoors(s);
  } else if (scenarioId === "the-dread-realm") {
    Dread.setupDreadRealm(s);
  } else if (scenarioId === "the-battle-of-carn-dum") {
    Carn.setupCarnDum(s);
  } else if (scenarioId === "the-treachery-of-rhudaur") {
    Rhudaur.setupRhudaur(s);
  } else if (scenarioId === "voyage-across-belegaer") {
    setupVoyageBelegaer(s);
  } else if (scenarioId === "the-fate-of-numenor") {
    setupFateNumenor(s);
  } else if (scenarioId === "raid-on-the-grey-havens") {
    setupRaidGreyHavens(s);
  } else if (scenarioId === "flight-of-the-stormcaller") {
    setupStormcaller(s);
  } else if (scenarioId === "the-thing-in-the-depths") {
    setupDepths(s);
  } else if (scenarioId === "the-city-of-corsairs") {
    City.setupCity(s);
  } else if (scenarioId === "escape-from-umbar") {
    Umbar.setupUmbar(s);
  } else if (scenarioId === "desert-crossing") {
    Desert.setupDesertCrossing(s);
  } else if (scenarioId === "the-long-arm-of-mordor") {
    Mordor.setupLongArmMordor(s);
  } else if (batch4Scenario(s).setup) {
    batch4Scenario(s).setup!(s);
  } else if (scenarioId === "beneath-the-sands") {
    Sands.setupBeneathSands(s);
  } else if (scenarioId === "race-across-harad") {
    Race.setupRaceHarad(s);
  } else if (scenarioId === "the-mumakil") {
    Mumakil.setupMumakil(s);
  } else if (scenarioId === "a-storm-on-cobas-haven") {
    Cobas.setupCobas(s);
  } else if (scenarioId === "the-drowned-ruins") {
    Drowned.setupDrowned(s);
  } else if (scenarioId === "temple-of-the-deceived") {
    setupTemple(s);
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
    if (campaign && !campaign.kind)
      enqueue(s, fx("appointedByFate", { player: s.table?.first ?? 0 }));
    for (const code of OBJECTIVES) {
      const objective = make(s, code);
      s.staging.push(objective);
      enqueue(s, fx("guardObjective", { target: objective.id }));
    }
    enqueue(s, fx("capturePrisoner"));
  }
  ShadowEastPlayers.shadowEastPlayerEncounterSetup(s);
  batch4PlayerSetup(s);
  eredMithrinPlayerSetup(s);
  sagaCampaignSetup(s);
  angmarCampaignSetup(s);
  dreamchaserCampaignSetup(s);
  darkMirkwoodCampaignSetup(s);
  eredCampaignSetup(s);
  log(
    s,
    `${scenario(scenarioId).name} · ${playMode === "campaign" ? (isSagaCampaign(campaign) ? "The Lord of the Rings campaign" : isAngmarCampaign(campaign) ? "The Angmar Awakened campaign" : isDreamchaserCampaign(campaign) ? "The Dream-chaser campaign" : isEredCampaign(campaign) ? "The Ered Mithrin campaign" : campaign?.mini ? "The Dark of Mirkwood mini campaign" : "Mirkwood Paths campaign") : "Normal game"}.`,
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
}
