import { ScenarioState, FaceupShadows } from "./ui/scenario-state";
import { faceupShadowCards } from "./game/voice-isengard";
import { AMON_DIN as A } from "./game/amon-din-support";
import {
  consideredEngaged,
  normalAttackPending,
} from "./game/considered-engagement";
import { SHADOW_FLAME } from "./game/shadow-flame-support";
import { questStat } from "./game/core";
import { FOUNDATIONS_STONE as F } from "./game/foundations-stone-support";
import { HEIRS_NUMENOR as H } from "./game/heirs-numenor-support";
import { STEWARD_FEAR as S, STEWARD_CLUES } from "./game/steward-fear-support";
import { watcherWaterCannotExhaust } from "./game/watcher-water";
import { amonPlayerCannotDeclareAttack } from "./game/amon-din-player-cards";
import { eventXMaximum } from "./game/actions";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowCounterClockwise,
  BookOpen,
  Books,
  Campfire,
  CaretRight,
  Check,
  Compass,
  Diamond,
  Eye,
  Feather,
  List,
  Mountains,
  Moon,
  Plus,
  Minus,
  Scroll,
  Shield,
  Sparkle,
  Sword,
  Tree,
  UsersThree,
  X,
  Coins,
  FloppyDisk,
  Info,
  SpeakerHigh,
  SpeakerSlash,
  DownloadSimple,
  SlidersHorizontal,
  Stack,
  Keyboard,
  WarningCircle,
  UserCircle,
  Lightbulb,
} from "@phosphor-icons/react";
import { coachTip } from "./ui/coach";
import { Art, Sphere } from "./ui/card-art";
import {
  customId,
  createDeckId,
  HERO_CARDS,
  DECK_CARDS,
  deckProblems,
  deckSize,
  describeDeck,
  isCustomId,
  readDecks,
  writeDecks,
} from "./game/decks";
import type { CustomDeck } from "./game/decks";
import { readRecords, recordGame, summarize, writeRecords } from "./ui/records";
const Library = lazy(() => import("./ui/library"));
const DeckBuilder = lazy(() => import("./ui/deck-builder"));
const PublishedContent = lazy(() => import("./ui/published-content"));
import type { PublishedPlayRecipe } from "./ui/published-content";
import { CardProductNote, DeckProductNote } from "./ui/product-note";
import { SupportSummary } from "./ui/support-summary";
import { cardProductInfo } from "./game/products";
import { catalogCardCount, isScriptedCard, loadCatalog } from "./game/catalog";
import "./ui/catalog.css";
import carrockQuestCards from "./data/carrock-quest-cards.json";
import { CARROCK, isSacked } from "./game/carrock";
import { EMYN_MUIL_QUESTS, emynMuilMustCommit } from "./game/emyn-muil";
import { eligiblePayers, engagementCost, get } from "./game/core";
import { currentQuestUnit } from "./game/quest-state";
import { RHOS } from "./game/rhosgobel";
import { KHAZAD, khazadCannotExhaust } from "./game/khazad-dum";
import { DEAD } from "./game/dead-marshes";
import { singlePoolCard } from "./game/expansion-passives";
import { motion, useReducedMotion } from "motion/react";
import {
  AnimatedNumber,
  MovingCard,
  tableSpring,
  useDamageFeedback,
} from "./ui/motion";
import { card, STARTERS, plain, name } from "./game/cards";
import {
  applyAction,
  availableAbilities,
  enemyAttackPrevented,
  canCommit,
  canTravel,
  optionalEngagementProblem,
  createGame,
  needsTarget,
  playTargets,
  publicState,
  questWill,
  score,
  stageInfo,
  locationQuest,
  stagingThreat,
  threatOf,
  stats,
  restoreSave,
  continueCampaign,
  retryAdventure,
  objectiveFree,
  newCampaign,
  isGuarded,
  playCost,
} from "./game/engine";
import type {
  Action,
  Card,
  GameState,
  Unit,
  ScenarioId,
  PlayMode,
  SeatConfig,
} from "./game/types";
import {
  SCENARIOS,
  CAMPAIGN_CHAPTERS,
  scenario,
  OBJECTIVES,
} from "./game/scenarios";
import {
  Hand,
  CardHoverPreview,
  QuestForecast,
  QuestGoals,
  TurnActions,
  EscapeTestSummary,
  usePreference,
  playReason,
} from "./ui/experience";

import {
  FellowshipSetup,
  CooperativeActions,
  FellowshipSeats,
} from "./ui/fellowship";
import {
  matchesSavedDeck,
  recoverSavedDecks,
  savedDeckId,
  savedSeats,
  setupSeats,
} from "./ui/setup-decks";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  allEngaged,
  ownerOf,
  seatName,
  attackersFor,
  livingSeats,
} from "./game/table";
import {
  REVIEW_MODES,
  reviewModeLabel,
  startGuided,
} from "./game/presentation";
import { ResolutionDialog, ResolutionChronicle } from "./ui/resolution";
import {
  ChoiceDialog,
  CombatDialog,
  DecisionCard,
  DecisionDialog,
  DecisionStats,
} from "./ui/decisions";
import {
  AttachmentStack,
  JourneyArea,
  OtherFellowships,
  ShadowCards,
  TableDecks,
  TableToken,
  questFace,
  questStageLabel,
} from "./ui/tabletop";
import { ThreatCounter } from "./ui/threat";
import { StatBadge } from "./ui/stats";
import { TableCollection, PLAYMATS, PLAYMAT_CHOICES } from "./ui/premium";
import { LandingHero } from "./ui/landing";
import { QuestHeadline, QuestIndex, scenarioRelease } from "./ui/quest-index";

import { DeckPicker, HeroPicker } from "./ui/deck-picker";
import { AccountPanel, AccountStrip } from "./ui/account";
import { useAccount } from "./account/use-account";
import { readChoices } from "./account/choices";
import type { FellowshipChoices } from "./account/choices";

const SAVE_KEY = "there-and-back-again.save.v1",
  DECK_KEY = "there-and-back-again.deck.v1";
const CAMPAIGN_KEY = "there-and-back-again.campaign.v1";
const MODE_KEY = "there-and-back-again.mode.v1";
const readMode = (): PlayMode => {
  try {
    return localStorage.getItem(MODE_KEY) === "campaign"
      ? "campaign"
      : "normal";
  } catch {
    return "normal";
  }
};
const activeSaveKey = () =>
  readMode() === "campaign" ? CAMPAIGN_KEY : SAVE_KEY;
type Page =
  "adventures" | "library" | "fellowship" | "decks" | "guide" | "table";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
const readSave = (key = SAVE_KEY) => {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    const restored = restoreSave(s);
    return restored ? startGuided(restored) : null;
  } catch {
    return null;
  }
};
const readDeckId = () => {
  try {
    const savedDeck = readSave(activeSaveKey())?.deckId;
    if (STARTERS.some((s) => s.id === savedDeck)) return savedDeck!;
    const d = localStorage.getItem(DECK_KEY);
    return STARTERS.some((s) => s.id === d) || /^custom:[\w-]+$/.test(d ?? "")
      ? d!
      : "leadership";
  } catch {
    return "leadership";
  }
};
const phaseNames: Record<string, string> = {
  setup: "Your opening hand",
  resource: "Resource actions",
  planning: "Planning",
  quest: "Commit to the quest",
  staging: "Resolve the quest",
  travel: "Travel",
  encounter: "Encounter",
  defense: "Defend your fellowship",
  attack: "Strike back",
  refresh: "Refresh",
};
const objectiveClaimCode = (s: GameState, id: string) =>
  s.staging.find((u) => u.id === id)?.code ??
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .find((a) => a.id === id)?.code;
const claimableObjectives: string[] = [
  ...OBJECTIVES,
  RHOS.athelas,
  KHAZAD.book,
  KHAZAD.tools,
  F.axe,
  F.helm,
  H.scroll,
  ...STEWARD_CLUES,
];
const exhaustedClaimObjectives: string[] = [
  RHOS.athelas,
  KHAZAD.book,
  KHAZAD.tools,
  F.axe,
  F.helm,
  H.scroll,
  ...STEWARD_CLUES,
];
const objectiveClaimExhausts = (s: GameState, id: string) =>
  exhaustedClaimObjectives.includes(objectiveClaimCode(s, id) ?? "");
const objectiveClaimRestricted = (s: GameState, id: string) =>
  ![RHOS.athelas, H.scroll, ...STEWARD_CLUES].includes(
    objectiveClaimCode(s, id) ?? "",
  );
const objectiveClaimDescription = (s: GameState, id: string) => {
  const code = objectiveClaimCode(s, id);
  if (code === S.prisoner || code === S.scrap)
    return `Exhaust a ready hero you control to add this Clue to the victory display and place ${code === S.prisoner ? 2 : 1} resource ${code === S.prisoner ? "tokens" : "token"} on the quest.`;
  if (objectiveClaimExhausts(s, id))
    return `Choose a ready hero who can exhaust to carry the objective. Claiming it adds no threat.${objectiveClaimRestricted(s, id) ? " This objective is a restricted attachment." : ""}`;
  return "Choose a hero to carry the objective. Raise your threat by 2; this counts toward the hero’s two restricted attachments.";
};
const pendingEnemyAttack = (s: GameState, u: Unit) =>
  normalAttackPending(s, u) && !enemyAttackPrevented(s, u);
const phaseTitle = (s: GameState) =>
  s.escapeTest
    ? "Escape test"
    : s.phase === "attack" && s.earlyAttackPlayers?.length
      ? "Oath of Eorl · Player attacks"
      : phaseNames[s.phase];
/** "1 player", "2 players": English plural for the setup summaries. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
function planCardPayment(s: GameState, c: Card, cost: number, target?: Unit) {
  const payers = eligiblePayers(s, c, target);
  const single = singlePoolCard(c)
    ? payers.find((u) => u.resources >= cost)
    : null;
  let left = cost;
  return Object.fromEntries(
    payers.map((u) => {
      const spend =
        singlePoolCard(c) && u !== single ? 0 : Math.min(left, u.resources);
      left -= spend;
      return [u.id, spend];
    }),
  );
}
const sameDeckRecipe = (
  a: Pick<CustomDeck, "heroes" | "cards">,
  b: Pick<CustomDeck, "heroes" | "cards">,
) =>
  JSON.stringify([...a.heroes].sort()) ===
    JSON.stringify([...b.heroes].sort()) &&
  JSON.stringify(
    Object.entries(a.cards)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  ) ===
    JSON.stringify(
      Object.entries(b.cards)
        .filter(([, n]) => n > 0)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
function Modal({
  title,
  children,
  onClose,
  wide = false,
  compact = false,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""} ${compact ? "modal-compact" : ""} ${className}`}
      onCancel={(e) => {
        if (!onClose) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        {onClose && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
function Ambient() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const c = ref.current!,
      ctx = c.getContext("2d")!;
    let frame = 0;
    const particles = Array.from({ length: 22 }, (_, i) => ({
      x: ((i * 157) % 1000) / 1000,
      y: ((i * 71) % 800) / 800,
      r: (i % 3) + 0.5,
    }));
    const draw = (t: number) => {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
      ctx.clearRect(0, 0, c.width, c.height);
      particles.forEach((p, i) => {
        const x = (p.x + Math.sin(t / 12000 + i) * 0.03) * c.width,
          y = ((((p.y - t / 140000) % 1) + 1) % 1) * c.height;
        ctx.fillStyle = `rgba(226,198,134,${0.13 + Math.sin(t / 2000 + i) * 0.1})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={ref} className="ambient" aria-hidden="true" />;
}
function CardDetail({
  c,
  onClose,
  action,
}: {
  c: Card & { attachmentResourceTokens?: number };
  onClose: () => void;
  action?: ReactNode;
}) {
  const origin = cardProductInfo(c);
  const source = c.source_url ?? c.url;
  const printing = c as Card & {
    position?: number | string;
    corner_text?: string;
  };
  const printedNumber =
    printing.position ?? (!c.code.startsWith("octgn:") ? c.code : undefined);
  const [reverse, setReverse] = useState(false);
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="card-detail">
        {c.back_imagesrc ? (
          <div className="card-detail-art">
            <Art
              key={`${c.code}-${reverse}`}
              className={c.type_code === "quest" ? "quest-reference-art" : ""}
              imageSrc={reverse ? c.back_imagesrc : undefined}
              c={
                reverse
                  ? {
                      ...c,
                      imagesrc: c.back_imagesrc,
                      name: c.back_name ?? c.name,
                    }
                  : c
              }
            />
            <button
              className="secondary"
              aria-pressed={reverse}
              onClick={() => setReverse((shown) => !shown)}
            >
              {reverse ? "Show front" : "Show reverse"}
            </button>
          </div>
        ) : (
          <Art
            c={c}
            className={c.type_code === "quest" ? "quest-reference-art" : ""}
          />
        )}
        <div>
          <div className="detail-type">
            <Sphere sphere={c.sphere_code} />
            {c.type_code} · {c.sphere_code}
          </div>
          <h3>{c.name}</h3>
          <p className="traits">{c.traits}</p>
          {(c.health !== undefined || c.printed_stats?.health) && (
            <div className="detail-stats">
              {c.type_code === "enemy" ? (
                <StatBadge
                  kind="threat"
                  value={c.threat ?? c.printed_stats?.threat}
                  caption
                />
              ) : (
                <StatBadge
                  kind="willpower"
                  value={c.willpower ?? c.printed_stats?.willpower}
                  caption
                />
              )}
              <StatBadge
                kind="attack"
                value={c.attack ?? c.printed_stats?.attack}
                caption
              />
              <StatBadge
                kind="defense"
                value={c.defense ?? c.printed_stats?.defense}
                caption
              />
              <StatBadge
                kind="health"
                value={c.health ?? c.printed_stats?.health}
                caption
              />
            </div>
          )}
          {(c.text || c.type_code !== "quest") && (
            <p className="rules-text">
              {plain(c.text) || "No additional abilities."}
            </p>
          )}
          {c.shadow && <p className="shadow-text">{plain(c.shadow)}</p>}
          {c.back_text && (
            <div className="card-back-rules">
              <h4>{c.back_name ?? "Reverse side"}</h4>
              <p className="rules-text">{plain(c.back_text)}</p>
            </div>
          )}
          {action}
          <div className="source-note">
            <strong>{origin.originLabel}</strong>
            <br />
            {origin.availableIn.length > 1 && (
              <>
                <span>
                  Also included in:{" "}
                  {origin.availableIn
                    .filter((p) => p.id !== origin.original?.id)
                    .map((p) => p.name)
                    .join(" · ")}
                </span>
                <br />
              </>
            )}
            {c.encounter_set && (
              <>
                <span>Encounter set: {c.encounter_set}</span>
                <br />
              </>
            )}
            {c.nightmare && (
              <>
                <span>Nightmare edition</span>
                <br />
              </>
            )}
            {c.attachmentResourceTokens !== undefined && (
              <>
                <strong>
                  Live resource tokens: {c.attachmentResourceTokens}
                </strong>
                <br />
              </>
            )}
            {printedNumber !== undefined && (
              <>
                Card #{printedNumber}
                <br />
              </>
            )}
            {printing.corner_text && (
              <>
                Printed corner: {printing.corner_text}
                <br />
              </>
            )}
            {c.illustrator && `Illustration: ${c.illustrator}`}
            <br />
            {isScriptedCard(c)
              ? "Automated play support is available."
              : "Available to browse. Gameplay scripting is not available yet."}
          </div>
          {source && /^https?:\/\//.test(source) && (
            <a
              className="text-link"
              href={source}
              target="_blank"
              rel="noreferrer"
            >
              {c.source === "dragncards"
                ? "View DragnCards source"
                : c.source === "octgn"
                  ? "View OCTGN source"
                  : c.source === "ffg"
                    ? "View official source"
                    : "View on RingsDB"}{" "}
              <ArrowRight />
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Stats({ s, u }: { s: GameState; u: Unit }) {
  const st = stats(s, u);
  const c = card(u.code);
  return (
    <div className="card-modifiers" aria-label="Modified card values">
      {st.will !== (c.willpower ?? 0) && (
        <StatBadge kind="willpower" value={st.will} />
      )}
      {st.attack !== (c.attack ?? 0) && (
        <StatBadge kind="attack" value={st.attack} />
      )}
      {st.defense !== (c.defense ?? 0) && (
        <StatBadge kind="defense" value={st.defense} />
      )}
      {st.health !== (c.health ?? 0) && (
        <StatBadge kind="health" value={st.health} label="Maximum hit points" />
      )}
    </div>
  );
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [initialChoices] = useState(readChoices);
  const [page, setPage] = useState<Page>("adventures");
  const [libraryProduct, setLibraryProduct] = useState("all");
  const [game, setGame] = useState<GameState | null>(() =>
    readSave(
      initialChoices
        ? initialChoices.playMode === "campaign"
          ? CAMPAIGN_KEY
          : SAVE_KEY
        : activeSaveKey(),
    ),
  );
  const [setupMode, setSetupMode] = useState<"classic" | "hotseat">(() => {
    if (initialChoices) return initialChoices.setupMode;
    const saved = readSave(activeSaveKey());
    return saved ? (saved.table ? "hotseat" : "classic") : "hotseat";
  });
  const [playMode, setPlayMode] = useState<PlayMode>(
    () => initialChoices?.playMode ?? readMode(),
  );
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(
    () =>
      initialChoices?.scenario ??
      readSave(activeSaveKey())?.scenarioId ??
      "mirkwood",
  );
  const [interlude, setInterlude] = useState(false);
  const [nextHeroes, setNextHeroes] = useState<string[]>([]);
  const [nextSeatDecks, setNextSeatDecks] = useState<string[]>([]);
  const [nextDeck, setNextDeck] = useState("leadership");
  const [includeSupport, setIncludeSupport] = useState(true);
  const [claimId, setClaimId] = useState<string | null>(null);
  const quest = scenario(
    playMode === "campaign"
      ? (game?.scenarioId ?? "mirkwood")
      : selectedScenario,
  );
  const switchMode = (mode: PlayMode) => {
    if (mode === playMode) return;
    const saved = readSave(mode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY);
    setPlayMode(mode);
    setGame(saved);
    if (saved) {
      const recovered = recoverSavedDecks(saved, decks);
      setDecks(recovered);
      setSetupMode(saved.table ? "hotseat" : "classic");
      if (saved.table) setSeats(savedSeats(saved, recovered));
      setSelectedDeck(savedDeckId(saved, recovered));
      setEasyMode(saved.easyMode ? "on" : "off");
    }
    setSelectedScenario(saved?.scenarioId ?? "mirkwood");
    setHistory([]);
  };
  const [decks, setDecksState] = useState<CustomDeck[]>(() =>
    recoverSavedDecks(game, readDecks()),
  );
  const [selectedDeck, setSelectedDeck] = useState(() => {
    const id =
      initialChoices?.selectedDeck ??
      (game ? savedDeckId(game, decks) : readDeckId());
    return describeDeck(id, decks)
      ? id
      : game
        ? savedDeckId(game, decks)
        : "leadership";
  });
  const [seats, setSeats] = useState<SeatConfig[]>(() =>
    initialChoices
      ? setupSeats(
          initialChoices.seatDecks.map((deckId, i) => ({
            deckId:
              !describeDeck(deckId, decks) &&
              game?.table?.seats[i] &&
              initialChoices.scenario === game.scenarioId
                ? savedDeckId(game.table.seats[i], decks)
                : deckId,
          })),
          decks,
        )
      : game?.table
        ? savedSeats(game, decks)
        : setupSeats(undefined, decks),
  );
  const setDecks = (list: CustomDeck[]) => {
    setDecksState(list);
    if (!describeDeck(selectedDeck, list)) setSelectedDeck("leadership");
    setSeats((current) => setupSeats(current, list));
    return writeDecks(list);
  };
  useEffect(() => {
    writeDecks(decks);
  }, []);
  const starter =
    describeDeck(selectedDeck, decks) ?? describeDeck("leadership", decks)!;
  const deck = starter.cards;
  // Seats may reference a custom deck; the engine receives its card list.
  const seatConfig = (p: SeatConfig): SeatConfig =>
    isCustomId(p.deckId)
      ? {
          heroes: p.heroes,
          deckId: "custom",
          cards: decks.find((d) => customId(d) === p.deckId)?.cards,
        }
      : p;
  const [easyMode, setEasyMode] = usePreference("easy-mode", "off", [
    "off",
    "on",
  ] as const);
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState(readRecords);
  const resumable =
    game &&
    (playMode === "campaign" ||
      (game.scenarioId === selectedScenario &&
        (setupMode === "hotseat"
          ? !!game.table &&
            game.table.seats.map((p) => p.deckId).join() ===
              seats
                .map((p) => (isCustomId(p.deckId) ? "custom" : p.deckId))
                .join() &&
            game.table.seats.every((p, i) =>
              matchesSavedDeck(p, seats[i].deckId, decks),
            )
          : !game.table && matchesSavedDeck(game, selectedDeck, decks))));
  const displayHeroes =
    playMode === "campaign" && game?.campaign
      ? game.campaign.heroes
      : setupMode === "hotseat"
        ? seats.flatMap((p) => p.heroes)
        : starter.heroes;
  const [detail, setDetail] = useState<Card | null>(null);
  const [toast, setToast] = useState("");
  const [restart, setRestart] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sound, setSound] = useState(false);
  const [playCard, setPlayCard] = useState<Unit | null>(null);
  const [target, setTarget] = useState("");
  const [payment, setPayment] = useState<Record<string, number>>({});
  const [xCost, setXCost] = useState(1);
  const [combatEnemy, setCombatEnemy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showResolution, setShowResolution] = useState(true);
  useEffect(() => {
    setShowResolution(true);
  }, [game?.flow?.pending?.id]);
  const [showSettings, setShowSettings] = useState(false);
  const [showPiles, setShowPiles] = useState(false);
  const [showQuest, setShowQuest] = useState(false);
  const [pile, setPile] = useState<"player" | "encounter">("player");
  const [density, setDensity] = usePreference("density", "comfortable", [
    "comfortable",
    "compact",
  ] as const);
  const [reviewMode, setReviewMode] = usePreference(
    "review-mode",
    "hidden",
    REVIEW_MODES,
  );
  // The saved preference applies to the current game, including restored saves.
  useEffect(() => {
    if (!game?.flow || (game.flow.mode ?? "all") === reviewMode) return;
    try {
      setGame(applyAction(game, { type: "SET_REVIEW_MODE", mode: reviewMode }));
    } catch {
      /* An unsupported mode leaves the game unchanged. */
    }
  }, [game, reviewMode]);
  const [coach, setCoach] = usePreference("coach", "on", [
    "on",
    "off",
  ] as const);
  const [tutorial, setTutorial] = usePreference("tutorial", "pending", [
    "pending",
    "seen",
  ] as const);
  const [hoverCards, setHoverCards] = usePreference("hover-cards", "on", [
    "on",
    "off",
  ] as const);
  const [playmat, setPlaymat] = usePreference(
    "playmat",
    "adventure",
    PLAYMAT_CHOICES,
  );
  const activePlaymat =
    playmat === "adventure"
      ? page === "table" && game
        ? game.scenarioId
        : quest.id
      : playmat;
  const [saved, setSaved] = useState(true);
  const [history, setHistory] = useState<GameState[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  const [showAccount, setShowAccount] = useState(false);
  const [previewDeck, setPreviewDeck] = useState<string | null>(null);
  const choices = useMemo<FellowshipChoices>(
    () => ({
      version: 1,
      setupMode,
      selectedDeck,
      seatDecks: seats.map((p) => p.deckId),
      playMode,
      scenario: selectedScenario,
    }),
    [setupMode, selectedDeck, seats, playMode, selectedScenario],
  );
  const restoreChoices = useCallback(
    (restored: FellowshipChoices) => {
      const saved = readSave(
        restored.playMode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY,
      );
      const recovered = recoverSavedDecks(saved, decks);
      setDecks(recovered);
      setSetupMode(restored.setupMode);
      setSelectedDeck(
        describeDeck(restored.selectedDeck, recovered)
          ? restored.selectedDeck
          : "leadership",
      );
      setSeats(
        setupSeats(
          restored.seatDecks.map((deckId) => ({ deckId })),
          recovered,
        ),
      );
      setSelectedScenario(restored.scenario);
      setPlayMode(restored.playMode);
      setGame(saved);
      if (
        [restored.selectedDeck, ...restored.seatDecks].some(
          (id) => !describeDeck(id, recovered),
        )
      )
        notify(
          "A custom deck is missing on this device. Choose a local deck or import the adventure save.",
        );
      setHistory([]);
      setPage("adventures");
    },
    [decks],
  );
  const account = useAccount(choices, restoreChoices);
  useEffect(() => {
    if (account.recovery) setShowAccount(true);
  }, [account.recovery]);
  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, playMode);
    } catch {
      /* local mode still works */
    }
  }, [playMode]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (game)
      try {
        localStorage.setItem(
          game.playMode === "campaign" ? CAMPAIGN_KEY : SAVE_KEY,
          JSON.stringify(game),
        );
        setSaved(true);
      } catch {
        setSaved(false);
        notify(
          "The game is playable, but browser storage is full. Export your save to keep it.",
        );
      }
  }, [game, notify]);
  // Finished adventures join the journey record once.
  useEffect(() => {
    if (!game || game.status === "playing") return;
    const added = recordGame(game);
    if (added) setRecords(readRecords());
  }, [game]);
  useEffect(() => {
    try {
      localStorage.setItem(DECK_KEY, selectedDeck);
    } catch {
      /* deck stays available in memory */
    }
  }, [selectedDeck]);
  useEffect(() => {
    window.render_game_to_text = () =>
      JSON.stringify(
        game && page === "table"
          ? publicState(game)
          : {
              mode: page,
              playMode,
              scenario: quest.id,
              savedGame: !!game,
              cardCount: catalogCardCount(),
              automatedPlay: {
                heroes: HERO_CARDS.length,
                heroCodes: HERO_CARDS.map((c) => c.code),
                deckCards: DECK_CARDS.length,
                deckCardCodes: DECK_CARDS.map((c) => c.code),
                decks: STARTERS.map((d) => ({ id: d.id, heroes: d.heroes })),
                quests: SCENARIOS.map((q) => q.id),
              },
              fellowship: choices,
            },
      );
    window.advanceTime = () => Promise.resolve();
  }, [game, page, playMode, quest.id, choices]);
  const chime = () => {
    if (!sound) return;
    try {
      const ctx = audioCtx.current ?? new AudioContext();
      audioCtx.current = ctx;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      /* sound is optional */
    }
  };
  const dispatch = (action: Action) => {
    if (!game) return;
    try {
      const next = applyAction(game, action);
      setHistory((h) => [...h.slice(-19), game]);
      setGame(next);
      chime();
      // Events that were recorded without a pause still get a brief mention.
      const firstNew = game.flow?.nextId ?? Infinity;
      const recorded =
        next.flow?.history.filter(
          (h) => h.id >= firstNew && h.id !== next.flow?.pending?.id,
        ) ?? [];
      if (recorded.length)
        notify(
          recorded.length === 1
            ? recorded[0].title
            : `${recorded.at(-1)!.title} · ${recorded.length} events recorded`,
        );
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "That action is unavailable.");
      return false;
    }
  };
  const start = (style: "classic" | "hotseat" = setupMode) => {
    try {
      const selected =
        style === "hotseat" ? seats.map((p) => p.deckId) : [selectedDeck];
      for (const id of selected) {
        const description = describeDeck(id, decks);
        if (!description)
          throw new Error("Choose an available deck before beginning.");
        if (description.custom) {
          const problems = deckProblems(description);
          if (problems.length)
            throw new Error(
              `${description.name}: ${problems[0]} Open the deck builder to finish it.`,
            );
        }
      }
      const startingDeck =
        style === "hotseat" ? describeDeck(seats[0].deckId, decks)! : starter;
      const s = createGame(
        Date.now(),
        startingDeck.cards,
        startingDeck.heroes,
        startingDeck.custom ? "custom" : startingDeck.id,
        {
          guided: true,
          reviewMode,
          easy: easyMode === "on",
          scenarioId: playMode === "campaign" ? "mirkwood" : selectedScenario,
          playMode,
          ...(style === "hotseat" ? { seats: seats.map(seatConfig) } : {}),
          ...(playMode === "campaign" &&
          game?.campaign?.completed.length === CAMPAIGN_CHAPTERS.length &&
          game.campaign.mendorSaved
            ? {
                campaign: newCampaign(
                  style === "hotseat"
                    ? seats.flatMap((p) => p.heroes)
                    : starter.heroes,
                  true,
                ),
              }
            : {}),
        },
      );
      setSetupMode(style);
      setGame(s);
      setPage("table");
      window.scrollTo({ top: 0, behavior: "instant" });
      setRestart(false);
      setHistory([]);
      setCombatEnemy(null);
      setInterlude(false);
    } catch (e) {
      notify((e as Error).message);
      setPage("fellowship");
    }
  };
  const choosePublishedDeck = (recipe: PublishedPlayRecipe) => {
    const problems = deckProblems(recipe);
    if (problems.length) {
      notify(problems[0]);
      return;
    }
    let chosen = decks.find(
      (d) => d.source === recipe.source && sameDeckRecipe(d, recipe),
    );
    if (!chosen) {
      if (decks.length >= 50) {
        notify(
          "Your deck shelf holds 50 decks. Delete a deck before saving this recipe.",
        );
        return;
      }
      chosen = { ...recipe, id: createDeckId(), updatedAt: Date.now() };
      if (!setDecks([chosen, ...decks]))
        notify(
          "Browser storage is full. This deck stays available until you reload.",
        );
    }
    setSelectedDeck(customId(chosen));
    setSetupMode("classic");
    nav("adventures");
  };
  const prepareNextChapter = () => {
    if (!game?.campaign) return;
    const c = game.campaign;
    const picked = c.heroes.map((h) => (c.fallen.includes(h) ? "" : h));
    for (let i = 0; i < picked.length; i++) {
      if (!picked[i])
        picked[i] =
          HERO_CARDS.find(
            (h) => !picked.includes(h.code) && !c.fallen.includes(h.code),
          )?.code ?? "";
    }
    for (const h of HERO_CARDS)
      if (
        picked.length <
          (game.table?.seats.flatMap((p) => p.startingHeroes).length ?? 3) &&
        !picked.includes(h.code) &&
        !c.fallen.includes(h.code)
      )
        picked.push(h.code);
    setNextHeroes(picked);
    setNextDeck(game.deckId);
    setNextSeatDecks(game.table?.seats.map((p) => p.deckId) ?? []);
    setIncludeSupport(true);
    setInterlude(true);
  };
  const advanceCampaign = () => {
    if (!game) return;
    try {
      const next = continueCampaign(
        game,
        nextHeroes,
        nextDeck,
        includeSupport,
        Date.now(),
        game.table?.seats.some((p) => p.startingHeroes.length > 1)
          ? nextSeatDecks
          : undefined,
      );
      setGame(next);
      setHistory([]);
      setInterlude(false);
      setCombatEnemy(null);
      setSelectedDeck(nextDeck);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const retry = () => {
    if (!game) return;
    try {
      setGame(retryAdventure(game));
      setHistory([]);
      setCombatEnemy(null);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const nav = (p: Page) => {
    setPage(p);
    setMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const beginPlay = (u: Unit) => {
    if (!game) return;
    const reason = playReason(game, u);
    if (reason) {
      notify(reason);
      return;
    }
    setTarget("");
    setXCost(1);
    const c = card(u.code);
    const costing = c.cost === "X" ? { ...c, cost: 1 } : c;
    const legalTargets = needsTarget(u) ? playTargets(game, u) : [];
    const cost = legalTargets.length
      ? Math.min(...legalTargets.map((host) => playCost(game, costing, host)))
      : playCost(game, costing);
    setPayment(planCardPayment(game, costing, cost));
    setPlayCard(u);
  };
  const exportSave = () => {
    if (!game) return;
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(game, null, 2)], { type: "application/json" }),
    );
    a.href = url;
    a.download =
      game.playMode === "campaign"
        ? "mirkwood-paths-campaign.json"
        : `${game.scenarioId}-adventure.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Adventure exported.");
  };
  const importSave = async (file: File) => {
    try {
      const restored = restoreSave(JSON.parse(await file.text()));
      const s = restored ? startGuided(restored) : null;
      if (!s) throw new Error("This is not a valid adventure save.");
      const recovered = recoverSavedDecks(s, decks);
      setDecks(recovered);
      setGame(s);
      setPlayMode(s.playMode);
      setSetupMode(s.table ? "hotseat" : "classic");
      if (s.table) setSeats(savedSeats(s, recovered));
      setSelectedScenario(s.scenarioId);
      setSelectedDeck(savedDeckId(s, recovered));
      setEasyMode(s.easyMode ? "on" : "off");
      setHistory([]);
      setPage("table");
      notify("Adventure restored.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const undo = () => {
    const prev = history.at(-1);
    if (prev) {
      setGame(prev);
      setHistory((h) => h.slice(0, -1));
      setCombatEnemy(null);
      notify("Last action undone.");
    }
  };
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu) {
        setMenu(false);
        return;
      }
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        menu ||
        document.querySelector("dialog[open]") ||
        (e.target instanceof Element &&
          e.target.closest('input,select,textarea,[contenteditable="true"]'))
      )
        return;
      if (e.key === "?") {
        e.preventDefault();
        setShowSettings(true);
        return;
      }
      if (
        page !== "table" ||
        !game ||
        (game.status !== "playing" && !game.flow?.pending) ||
        game.choice
      )
        return;
      if (
        game.table &&
        /^[1-4]$/.test(e.key) &&
        Number(e.key) <= game.table.seats.length
      ) {
        e.preventDefault();
        dispatch({ type: "SELECT_SEAT", seat: Number(e.key) - 1 });
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        document
          .querySelector<HTMLButtonElement>(
            ".turn-panel .turn-actions .primary",
          )
          ?.click();
      }
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        undo();
      }
      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        document
          .querySelector<HTMLElement>("#your-hand")
          ?.focus({ preventScroll: window.innerWidth >= 1100 });
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });
  useEffect(() => {
    if (!menu) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>("#navigation-panel")!;
    const focusable = () => [
      ...panel.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]"),
    ];
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [menu]);
  const inspectedHand =
    game && page === "table" && detail
      ? game.hand.find((u) => u.code === detail.code)
      : null;
  return (
    <div
      className={`app redbook density-${density} ${page === "table" ? "playing" : ""}`}
      data-playmat={activePlaymat}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <CardHoverPreview enabled={hoverCards === "on" && !menu} />
      <aside
        id="navigation-panel"
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
        aria-label={menu ? "Main navigation" : undefined}
        className={`sidebar ${menu ? "is-open" : ""}`}
      >
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("adventures");
          }}
        >
          <div className="brand-mark">
            <Tree weight="duotone" size={38} />
            <span className="brand-stars">· ✦ ·</span>
          </div>
          <span>
            THE LORD
            <br />
            OF THE RINGS<small>THERE & BACK AGAIN · THE CARD GAME</small>
          </span>
        </a>
        <div className="sidebar-divider">
          <Diamond weight="fill" size={7} />
        </div>
        <div className="nav-label">YOUR JOURNEY</div>
        <nav>
          {(
            [
              { id: "adventures", label: "Adventures", icon: Compass },
              { id: "fellowship", label: "My fellowship", icon: UsersThree },
              { id: "decks", label: "Deck builder", icon: Stack },
              { id: "library", label: "Card library", icon: Books },
              { id: "guide", label: "How to play", icon: BookOpen },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-label={item.label}
              title={item.label}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => nav(item.id)}
            >
              <item.icon
                size={20}
                weight={page === item.id ? "duotone" : "regular"}
              />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        {game && (
          <button
            className={`resume-side ${page === "table" ? "active" : ""}`}
            aria-label="Return to adventure"
            title="Return to adventure"
            onClick={() => nav("table")}
          >
            <Campfire size={21} />
            <span>
              {game.status === "playing"
                ? "Return to adventure"
                : "View last adventure"}
              <small>
                Round {game.round || 1} · {scenario(game.scenarioId).shortName}
              </small>
            </span>
            <CaretRight size={14} />
          </button>
        )}
        <div className="sidebar-bottom">
          <Tree size={52} weight="thin" />
          <p>
            “Not all those who
            <br />
            wander are lost.”
          </p>
          <div className="build-info">
            <span className="green-dot" /> THE RED BOOK · CORE SET
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="navigation-panel"
            >
              <List size={22} />
            </button>
            <span>Middle-earth</span>
            <CaretRight size={12} />
            <strong>
              {page === "table"
                ? scenario(game!.scenarioId).name
                : page === "adventures"
                  ? "Adventures"
                  : page === "library"
                    ? "Card library"
                    : page === "fellowship"
                      ? "My fellowship"
                      : page === "decks"
                        ? "Deck builder"
                        : "How to play"}
            </strong>
          </div>
          <div className="top-tools">
            <button
              className="account-nav"
              onClick={() => setShowAccount(true)}
              aria-label={account.user ? "My account" : "Sign in or register"}
            >
              <UserCircle size={21} />
              <span>{account.user ? "My account" : "Sign in"}</span>
            </button>
            {page === "table" && (
              <button
                className="icon-button"
                aria-label="Jump to your hand"
                title="Your hand · H"
                onClick={() =>
                  document
                    .querySelector("#your-hand")
                    ?.scrollIntoView({ block: "center", behavior: "instant" })
                }
              >
                <Books size={20} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Table preferences"
              title="Table preferences & shortcuts"
              onClick={() => setShowSettings(true)}
            >
              <SlidersHorizontal size={20} />
            </button>
            <span className="solo-label">
              <UsersThree size={15} />{" "}
              {game?.table && page === "table"
                ? `${count(game.table.seats.length, "player")} · Solo hot-seat`
                : "A solo journey"}
            </span>
            <button
              className="icon-button"
              title={sound ? "Mute sounds" : "Enable sounds"}
              aria-label={sound ? "Mute sounds" : "Enable sounds"}
              onClick={() => {
                setSound(!sound);
                notify(sound ? "Sound effects off." : "Sound effects on.");
              }}
            >
              {sound ? <SpeakerHigh size={19} /> : <SpeakerSlash size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="How to play"
              onClick={() => nav("guide")}
            >
              <BookOpen size={19} />
            </button>
          </div>
        </header>
        {page === "adventures" && (
          <main id="main-content" tabIndex={-1} className="lobby">
            <LandingHero
              savedJourney={
                resumable && game?.status === "playing"
                  ? `Saved journey · Round ${game.round} · ${phaseTitle(game) ?? game.phase}`
                  : undefined
              }
              onResume={() => nav("table")}
              onLearn={() => nav("guide")}
            />
            <FellowshipSetup
              mode={setupMode}
              changeMode={setSetupMode}
              seats={seats}
              setSeats={setSeats}
              selectedDeck={selectedDeck}
              selectDeck={setSelectedDeck}
              inspect={setPreviewDeck}
              decks={decks}
              onBuild={() => nav("decks")}
            />
            <AccountStrip account={account} open={() => setShowAccount(true)} />
            <section className="mode-selection" aria-label="Choose game mode">
              <div className="mode-heading">
                <span className="book-kicker">II · CHOOSE YOUR QUEST</span>
                <h2>Where will the road lead?</h2>
                <p>
                  {playMode === "normal"
                    ? `Choose from ${SCENARIOS.length} automated quests. Each adventure begins with a fresh fellowship.`
                    : "Mirkwood Paths • Follow the quests in order. Boons, burdens, fallen heroes, and your story carry forward."}
                </p>
              </div>
              <div className="mode-tabs" role="group" aria-label="Game mode">
                <button
                  aria-pressed={playMode === "normal"}
                  onClick={() => switchMode("normal")}
                >
                  <Compass size={19} />
                  <span>
                    Normal game<small>A standalone adventure</small>
                  </span>
                </button>
                <button
                  aria-pressed={playMode === "campaign"}
                  onClick={() => switchMode("campaign")}
                >
                  <Books size={19} />
                  <span>
                    Campaign mode
                    <small>
                      One fellowship. {CAMPAIGN_CHAPTERS.length} chapters.
                    </small>
                  </span>
                </button>
              </div>
            </section>
            <QuestIndex
              selected={quest.id}
              locked={playMode === "campaign"}
              completed={
                game?.campaign?.completed.map((c) => c.scenarioId) ?? []
              }
              onSelect={setSelectedScenario}
            />
            <section className={`adventure-hero adventure-${quest.id}`}>
              <div className="forest-bg" />
              <Ambient />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span />{" "}
                  {playMode === "campaign"
                    ? `MIRKWOOD PATHS · CHAPTER ${quest.chapter}`
                    : quest.tagline.toUpperCase()}
                </div>
                <h2>
                  <QuestHeadline id={quest.id} />
                </h2>
                <p>{quest.description}</p>
                {resumable && game?.status === "playing" && (
                  <div className="resume-context">
                    <span className="green-dot" /> Saved journey · Round{" "}
                    {game.round || 1} · {phaseTitle(game)}
                  </div>
                )}
                {setupMode === "classic" && (
                  <div className="selected-fellowship-summary">
                    <span>YOUR FELLOWSHIP</span>
                    <strong>
                      {playMode === "campaign" && game?.campaign
                        ? (STARTERS.find((d) => d.id === game.deckId)?.name ??
                          "Campaign fellowship")
                        : starter.name}
                    </strong>
                    <small>
                      {displayHeroes
                        .slice(0, 3)
                        .map((code) => card(code).name)
                        .join(" · ")}
                    </small>
                    <button
                      onClick={() => {
                        const el = document.getElementById("fellowship-setup");
                        el?.scrollIntoView({
                          behavior: reducedMotion ? "instant" : "smooth",
                          block: "start",
                        });
                        el?.focus({ preventScroll: true });
                      }}
                    >
                      Change fellowship <ArrowRight size={14} />
                    </button>
                  </div>
                )}
                {setupMode === "hotseat" && (
                  <div className="selected-company">
                    <UsersThree size={19} />
                    <span>
                      {seats
                        .map(
                          (p, i) =>
                            `Player ${i + 1}: ${describeDeck(p.deckId, decks)?.name ?? "Choose a deck"}`,
                        )
                        .join(" · ")}
                      <small>
                        {seats.length}{" "}
                        {seats.length === 1 ? "player" : "players"} ·{" "}
                        {seats.reduce((n, p) => n + p.heroes.length, 0)} heroes
                        · {seats.length} separate{" "}
                        {seats.length === 1 ? "deck" : "decks"} · You control
                        the whole company
                      </small>
                    </span>
                  </div>
                )}
                {playMode === "campaign" && game?.campaign && (
                  <small className="campaign-deck-note">
                    Change your deck between chapters or start a new campaign.
                  </small>
                )}
                {!(resumable && game?.status === "playing") && (
                  <label className="preference-check easy-toggle">
                    <div>
                      <strong>Easy mode</strong>
                      <small>
                        The official easy mode: each hero begins with 1 extra
                        resource, and the encounter cards marked for easy mode
                        stay out of the deck.
                      </small>
                    </div>
                    <input
                      type="checkbox"
                      checked={easyMode === "on"}
                      onChange={(e) =>
                        setEasyMode(e.target.checked ? "on" : "off")
                      }
                    />
                  </label>
                )}
                <button
                  className="primary hero-cta"
                  id="start-btn"
                  onClick={() =>
                    resumable &&
                    (game?.status === "playing" || playMode === "campaign")
                      ? nav("table")
                      : game
                        ? setRestart(true)
                        : start()
                  }
                >
                  {resumable &&
                  (game?.status === "playing" || playMode === "campaign")
                    ? game?.status === "playing"
                      ? "Continue adventure"
                      : "View campaign results"
                    : playMode === "campaign"
                      ? "Begin campaign"
                      : "Begin adventure"}
                  <ArrowRight size={20} />
                </button>
                {game && (
                  <button
                    className="new-adventure"
                    onClick={() => setRestart(true)}
                  >
                    Start a new{" "}
                    {playMode === "campaign" ? "campaign" : "adventure"}{" "}
                    <ArrowCounterClockwise size={13} />
                  </button>
                )}
              </div>
              <div
                className="hero-fan"
                aria-label="First fellowship starting heroes"
              >
                {[displayHeroes[1], displayHeroes[0], displayHeroes[2]]
                  .filter(Boolean)
                  .map((code, i) => (
                    <motion.button
                      initial={reducedMotion ? false : { opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.12, duration: 0.6 }}
                      key={code}
                      className={`fan-card fan-${i}`}
                      onClick={() => setDetail(card(code))}
                      title={`Inspect ${card(code).name}`}
                    >
                      <Art c={card(code)} />
                    </motion.button>
                  ))}
                <div className="fan-caption">
                  <span />{" "}
                  {setupMode === "hotseat"
                    ? `${seats.reduce((n, p) => n + p.heroes.length, 0)} HEROES. ${seats.length} FELLOWSHIP${seats.length === 1 ? "" : "S"}.`
                    : `${starter.heroes.length} HEROES. ONE FELLOWSHIP.`}
                  <span />
                </div>
              </div>
              <div className="hero-bottom">
                <span>
                  <Compass size={17} /> {quest.name}
                </span>
                <span>
                  <UsersThree size={15} />{" "}
                  {setupMode === "hotseat"
                    ? `${seats.length} ${seats.length === 1 ? "player" : "players"} · Solo hot-seat`
                    : "1 player"}
                </span>
                <span>
                  <Diamond size={14} /> {scenarioRelease(quest.id)}
                </span>
                <span className="difficulty">
                  Difficulty {quest.difficulty} / 10
                </span>
              </div>
            </section>
            {playMode === "campaign" && game?.campaign && (
              <details className="lobby-journal">
                <summary>
                  <Books size={18} />
                  Campaign journal
                  <span>
                    {game.campaign.completed.length} /{" "}
                    {CAMPAIGN_CHAPTERS.length} chapters recorded
                  </span>
                </summary>
                <CampaignJournal game={game} inspect={setDetail} />
              </details>
            )}
            <div className="lobby-lower">
              <section className="journey-panel">
                <div className="section-line">
                  <h3>The path ahead</h3>
                  <span>{quest.stages.length} quest stages</span>
                </div>
                <div className="journey-stages">
                  {quest.stages
                    .map((stage, i) => ({
                      n:
                        [
                          "I",
                          "II",
                          "III",
                          "IV",
                          "V",
                          "VI",
                          "VII",
                          "VIII",
                          "IX",
                          "X",
                        ][i] ?? String(i + 1),
                      title: stage.name,
                      text: stage.story,
                      icon: [Tree, Compass, Mountains][i % 3],
                    }))
                    .map((q, i) => (
                      <div className="journey-stage" key={q.n}>
                        <div
                          className={`stage-emblem ${i === 0 ? "current" : ""}`}
                        >
                          <q.icon size={22} />
                        </div>
                        <div>
                          <span>STAGE {q.n}</span>
                          <h4>{q.title}</h4>
                          <p>{q.text}</p>
                        </div>
                        {i < quest.stages.length - 1 && (
                          <CaretRight className="stage-chevron" size={15} />
                        )}
                      </div>
                    ))}
                </div>
              </section>
              <section className="fellowship-mini">
                <div className="section-line">
                  <h3>Your fellowship</h3>
                  <button
                    className="text-link"
                    onClick={() => nav("fellowship")}
                  >
                    View deck <ArrowRight size={15} />
                  </button>
                </div>
                <div className="fellowship-summary">
                  <div className="avatar-stack">
                    {displayHeroes.slice(0, 3).map((code) => (
                      <div key={code}>
                        <Art c={card(code)} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong>
                      {setupMode === "hotseat"
                        ? "Your travelling company"
                        : starter.name}
                    </strong>
                    <span>
                      {setupMode === "hotseat"
                        ? `${count(seats.length, "player")} · ${seats.reduce((n, p) => n + p.heroes.length, 0)} heroes · ${count(seats.length, "deck")}`
                        : `${starter.subtitle} · ${deckSize(deck)} cards · ${count(starter.heroes.length, "hero")}`}
                    </span>
                  </div>
                </div>
                <div className="fellowship-foot">
                  <span>
                    <Shield size={14} /> Fully scripted player cards
                  </span>
                  <span>
                    <Check size={14} /> Ready
                  </span>
                </div>
              </section>
            </div>
            <section
              className="official-resources"
              aria-label="About this fan project"
            >
              <div>
                <strong>An unofficial fan project</strong>
                <p>
                  Inspired by The Lord of the Rings: The Card Game. Not
                  affiliated with or endorsed by Fantasy Flight Games. Game
                  text, card artwork and trademarks belong to their respective
                  owners.
                </p>
              </div>
              <nav aria-label="Original game and official rules">
                <a
                  href="https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Original game <ArrowRight size={16} />
                </a>
                <a
                  href="https://images-cdn.fantasyflightgames.com/filer_public/e9/2f/e92f2465-8a1e-4bfa-8293-ad0edd5e55c0/mec101_learn_to_play_eng_v11-compressed.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn to Play (PDF) <ArrowRight size={16} />
                </a>
                <a
                  href="https://images-cdn.fantasyflightgames.com/filer_public/f2/87/f28704b2-5f25-4fd8-be7a-18d4a5d2c1c4/mec101_core_set_rules_reference_v10c-compressed.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Rules Reference (PDF) <ArrowRight size={16} />
                </a>
              </nav>
            </section>
            <footer className="lobby-footer">
              <span>
                <FloppyDisk size={13} /> Your journey is saved automatically on
                this device.
              </span>
              <button onClick={() => setShowRecords(true)}>
                Your record{" "}
                <span>
                  {records.length} {records.length === 1 ? "game" : "games"}{" "}
                  <ArrowRight size={13} />
                </span>
              </button>
              <button onClick={() => nav("guide")}>
                New to the game?{" "}
                <span>
                  Learn the way <ArrowRight size={13} />
                </span>
              </button>
            </footer>
          </main>
        )}
        {page === "library" && (
          <Suspense
            fallback={
              <main className="content-page library">
                <p className="library-loading">Opening the archives…</p>
              </main>
            }
          >
            <Library
              inspect={setDetail}
              notify={notify}
              initialProduct={libraryProduct}
              chooseAdventure={(id, mode) => {
                const chosenDeck = selectedDeck;
                const chosenSetup = setupMode;
                const chosenSeats = seats;
                switchMode(mode === "campaign" ? "campaign" : "normal");
                setSelectedDeck(chosenDeck);
                setSetupMode(chosenSetup);
                setSeats(chosenSeats);
                setSelectedScenario(id);
                setEasyMode(mode === "easy" ? "on" : "off");
                nav("adventures");
              }}
            />
          </Suspense>
        )}
        {page === "decks" && (
          <Suspense
            fallback={
              <main className="content-page deck-builder">
                <p className="library-loading">Opening the deck builder…</p>
              </main>
            }
          >
            <DeckBuilder
              decks={decks}
              setDecks={setDecks}
              inspect={setDetail}
              notify={notify}
              play={(id) => {
                setSelectedDeck(id);
                setSetupMode("classic");
                nav("adventures");
              }}
            />
          </Suspense>
        )}
        {page === "fellowship" && (
          <main id="main-content" tabIndex={-1} className="content-page">
            <div className="page-heading">
              <div>
                <h1>Choose your fellowship.</h1>
                <p>
                  Choose a supported fellowship, or explore every published hero
                  and the separately sold starter decks below.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setSetupMode("classic");
                  if (game) setRestart(true);
                  else start("classic");
                }}
              >
                Begin with {starter.subtitle} <ArrowRight />
              </button>
            </div>
            <SupportSummary />
            <DeckPicker
              value={selectedDeck}
              onChange={(id) => {
                setSelectedDeck(id);
                setSetupMode("classic");
              }}
              inspect={setPreviewDeck}
              custom={decks}
              onBuild={() => nav("decks")}
            />
            <AccountStrip account={account} open={() => setShowAccount(true)} />
            <div className="hero-roster">
              {starter.heroes.map((code) => (
                <button key={code} onClick={() => setDetail(card(code))}>
                  <div className="roster-art">
                    <Art c={card(code)} />
                  </div>
                  <div>
                    <Sphere sphere={card(code).sphere_code} />
                    <h2>{card(code).name}</h2>
                    <p>{plain(card(code).text)}</p>
                    <span>{card(code).threat} printed threat</span>
                    <CardProductNote c={card(code)} />
                  </div>
                </button>
              ))}
            </div>
            <div className="deck-heading">
              <div>
                <h2>{starter.name}</h2>
                <p>
                  {starter.custom
                    ? "Your saved deck list."
                    : "Ready-to-play deck with registered cards."}{" "}
                  All cards below have scripted abilities.
                </p>
              </div>
              <strong>
                {deckSize(deck)}{" "}
                <span>
                  cards + {starter.heroes.length}{" "}
                  {starter.heroes.length === 1 ? "hero" : "heroes"}
                </span>
              </strong>
            </div>
            <DeckProductNote deck={starter} />
            <div className="deck-list">
              {Object.keys(deck).map((code) => (
                <div className="deck-row" key={code}>
                  <button
                    onClick={() => setDetail(card(code))}
                    className="deck-card-link"
                  >
                    <Art c={card(code)} />
                    <Sphere sphere={card(code).sphere_code} />
                    <span>
                      {card(code).name}
                      <small>
                        {card(code).type_code} · Cost {card(code).cost}
                      </small>
                    </span>
                  </button>
                  <span className="deck-quantity">× {deck[code]}</span>
                </div>
              ))}
            </div>
            <Suspense fallback={<p>Opening the published collection…</p>}>
              <PublishedContent
                inspect={setDetail}
                play={choosePublishedDeck}
                browse={(productId) => {
                  setLibraryProduct(productId);
                  nav("library");
                }}
              />
            </Suspense>
          </main>
        )}
        {page === "guide" && (
          <main id="main-content" tabIndex={-1} className="content-page guide">
            <div className="page-heading">
              <div>
                <h1>Every great journey starts here.</h1>
                <p>
                  Lead your fellowship through Middle-earth, one quest at a
                  time.
                </p>
              </div>
              <BookOpen size={45} weight="thin" />
            </div>
            <div className="guide-intro">
              <Tree size={40} />
              <div>
                <h2>Your first adventure</h2>
                <p>
                  Choose from {SCENARIOS.length} automated quests for a
                  standalone adventure, or follow the {CAMPAIGN_CHAPTERS.length}{" "}
                  Core Set campaign chapters. Choose an original 30-card starter
                  with three heroes, or build a deck of at least 50 cards with
                  one to three heroes. Solo hot-seat lets you command 1–4
                  players, each with a separate deck, hand, and threat dial.
                  Complete the final quest together. A seat is eliminated at 50
                  threat or when its last hero falls; surviving fellowships
                  continue.
                </p>
                <button
                  className="primary"
                  onClick={() => (game ? nav("table") : start())}
                >
                  {game ? "Return to adventure" : "Begin adventure"}
                  <ArrowRight />
                </button>
              </div>
            </div>
            <section className="guide-note">
              <h2>You set the pace</h2>
              <p>
                Choose your reading pace in Table preferences. Hidden
                information & losses reviews encounters, shadows and harmful
                changes; Every event also reviews your own plays; Decisions only
                keeps information in the chronicle. Select Continue when an
                event is waiting. Rules choices always require your input.
              </p>
              <p>
                Inspect table lets you look around while the game stays paused.
                Open Review current event to return, or browse the last 80
                events in the chronicle. Revealed cards can be opened at full
                size. Your save preserves the exact event waiting for
                confirmation. These reading pauses do not create extra
                card-action windows.
              </p>
            </section>
            <section className="guide-note">
              <h2>One company. Separate fellowships.</h2>
              <p>
                In hot-seat mode, choose a starter or custom deck for each
                player. Each player’s selected heroes begin in play, with a
                separate player deck. Keep or mulligan each hand, plan for each
                player, then commit each fellowship to the shared quest. One
                encounter is revealed per active seat. Engagement, defense, and
                attacks follow the first-player order; the crown moves each
                round.
              </p>
              <p>
                Click a player’s banner to view their hand and fellowship. Each
                hero has their own resource pool; players cannot pool resources
                across seats. Sentinel characters can defend for another
                fellowship, Ranged characters can join its attacks, and support
                cards let you choose which player benefits. Normal games and
                campaigns both support this arrangement.
              </p>
              <p>
                These original 30-card learning decks are preserved, with their
                three hero cards kept separate from the draw deck. Starting
                threat is the sum of your selected heroes’ threat values. Each
                hero gains one resource per round. Dol Guldur captures one hero
                from the whole table; the other heroes remain available for the
                rescue.
              </p>
            </section>
            <section className="guide-note">
              <h2>Choose your journey</h2>
              <p>
                <strong>Normal game:</strong> select any of the{" "}
                {SCENARIOS.length} registered quests for a fresh, standalone
                adventure. <strong>Campaign mode:</strong> follow Mirkwood Paths
                in order. After a victory, select Continue campaign to prepare
                the next chapter with your earned boons and burdens.
              </p>
              <p>
                The campaign log records fallen heroes, scores, permanent cards,
                and the hero captured in Dol Guldur. Each hero replacement adds
                +1 to every player’s starting threat in later chapters. Each
                player may change one surviving hero between quests and replace
                any fallen heroes. Choose whether to add Mendor’s Support to
                your next deck.
              </p>
              <p>
                Keep Mendor alive: losing him ends the first two campaign
                quests. In Dol Guldur, claiming an unguarded objective frees
                Mendor; placing progress on stage two rescues your hero. Claim
                objectives from the staging area after clearing their guards.
              </p>
              <p>
                Normal games and campaigns save separately on this device. Retry
                this quest restarts a failed chapter with the campaign log from
                before that quest. Export a save to keep additional adventures
                or move to another device.
              </p>
            </section>
            <div className="guide-steps">
              {[
                {
                  name: "Resource",
                  text: "Each hero gains 1 resource, and you draw a card. The game handles this at the start of each round.",
                  icon: Coins,
                },
                {
                  name: "Planning",
                  text: "Spend matching sphere resources to play allies and attachments. Inspect a hand card, choose its target and payment, then play it.",
                  icon: UsersThree,
                },
                {
                  name: "Quest",
                  text: "Select ready characters to commit. They exhaust. Compare quest strength with staging threat: willpower normally, attack for Battle, defense for Siege. Success places progress; failure raises your threat.",
                  icon: Feather,
                },
                {
                  name: "Travel",
                  text: "Choose one staging location to travel to. It stops contributing threat, but future progress must explore it before reaching the quest.",
                  icon: Compass,
                },
                {
                  name: "Encounter",
                  text: "Optionally engage one enemy. Enemies with an engagement cost at or below your threat then engage automatically.",
                  icon: Eye,
                },
                {
                  name: "Combat",
                  text: "Choose an enemy, then a ready defender. Shadow effects resolve before damage. After enemy attacks, select ready attackers to strike back. Attack minus defense is damage.",
                  icon: Sword,
                },
                {
                  name: "Refresh",
                  text: "Characters and attachments ready, threat rises by 1, and the next round begins. Webbed heroes require 2 of their own resources to ready.",
                  icon: Moon,
                },
              ].map((step, i) => (
                <section key={step.name}>
                  <span className="guide-number">0{i + 1}</span>
                  <step.icon size={25} />
                  <div>
                    <h3>{step.name}</h3>
                    <p>{step.text}</p>
                  </div>
                </section>
              ))}
            </div>
            <section className="guide-note">
              <h2>A living adventure</h2>
              <p>
                The registered play pool currently includes {HERO_CARDS.length}{" "}
                heroes, {DECK_CARDS.length} deckbuilding cards,{" "}
                {SCENARIOS.length} quests and the {CAMPAIGN_CHAPTERS.length}
                -chapter Mirkwood Paths campaign. New releases become playable
                when their rules are implemented. The library includes the
                official player, encounter, quest, campaign and Nightmare card
                catalog, with original and revised product information.
              </p>
              <SupportSummary />
              <p>
                Some optional responses resolve automatically or in a fixed
                order, and intermediate attack action windows are simplified.
                Targeted effects, Valor, and cancellations use decision prompts.
                Undo is available for local solo play; it can reveal hidden
                information.
              </p>
              <div className="guide-links">
                <a
                  href="https://ringsdb.com/api/doc"
                  target="_blank"
                  rel="noreferrer"
                >
                  RingsDB API <ArrowRight />
                </a>
                <a
                  href="https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Official rules <ArrowRight />
                </a>
                <a
                  href="https://github.com/GeckoTH/Lord-of-the-Rings"
                  target="_blank"
                  rel="noreferrer"
                >
                  Encounter data <ArrowRight />
                </a>
              </div>
              <p className="fine-print">
                Unofficial fan project. Card text and artwork belong to Fantasy
                Flight Games and their respective owners. Card data from RingsDB
                and OCTGN; encounter scans from Hall of Beorn. Original forest
                illustration generated for this project.
              </p>
            </section>
            <section className="save-tools">
              <h3>Bring your journey with you</h3>
              <button
                className="secondary"
                onClick={exportSave}
                disabled={!game}
              >
                <DownloadSimple /> Export save
              </button>
              <label className="secondary file-label">
                Import save
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importSave(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </section>
          </main>
        )}
        {page === "table" && game && (
          <main
            id="main-content"
            tabIndex={-1}
            className="table-page card-table"
          >
            <div className="table-heading">
              <div>
                <button className="text-link" onClick={() => nav("adventures")}>
                  <ArrowLeft size={14} /> Adventures
                </button>
                <h1>{scenario(game.scenarioId).name}</h1>
                <span className="game-mode-label">
                  {game.playMode === "campaign"
                    ? "Mirkwood Paths · Campaign"
                    : "Normal game"}
                </span>
              </div>
              <div className="table-tools">
                <button
                  className="playmat-trigger"
                  aria-label="Change playmat"
                  title={`Playmat: ${PLAYMATS[activePlaymat].name}`}
                  onClick={() => setShowSettings(true)}
                >
                  <span className={`playmat-swatch mat-${activePlaymat}`} />
                  <span>{PLAYMATS[activePlaymat].name}</span>
                  <SlidersHorizontal size={13} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Table preferences"
                  title="Table preferences & shortcuts"
                  onClick={() => setShowSettings(true)}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <span
                  className={`save-status ${saved ? "" : "unsaved"}`}
                  role="status"
                >
                  {saved ? <Check size={14} /> : <WarningCircle size={14} />}{" "}
                  {saved ? "Saved on this device" : "Export to save"}
                </span>
                <button
                  className="icon-button"
                  aria-label="Undo last action"
                  disabled={!history.length}
                  onClick={undo}
                >
                  <ArrowCounterClockwise size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="View discard piles"
                  title="Discard piles"
                  onClick={() => setShowPiles(true)}
                >
                  <Stack size={19} />
                </button>
                <button
                  className="secondary compact"
                  onClick={() => setShowLog(true)}
                >
                  <Scroll /> Chronicle
                </button>
              </div>
            </div>
            <FellowshipSeats s={game} dispatch={dispatch} />
            {(game.prisoner || game.captiveMendor) && (
              <div className="prisoner-banner">
                <Shield size={22} />
                <div>
                  <strong>
                    {game.prisoner
                      ? `${name(game.prisoner)} is imprisoned`
                      : "The prisoner is free"}
                  </strong>
                  <p>
                    {game.prisoner
                      ? "This hero cannot act or collect resources. Add progress to stage 2 to rescue them."
                      : ""}
                    {game.captiveMendor
                      ? " Claim your first objective to free Mendor."
                      : ""}
                  </p>
                </div>
                {game.prisoner && (
                  <button
                    className="text-link"
                    onClick={() => setDetail(card(game.prisoner!.code))}
                  >
                    Inspect hero
                  </button>
                )}
              </div>
            )}
            <div className="round-strip">
              <div className="round-number">
                <span>ROUND</span>
                <strong>
                  {game.round ? <AnimatedNumber value={game.round} /> : "—"}
                </strong>
              </div>
              <div className="phase-track">
                {[
                  { label: "Resource", key: "resource" },
                  { label: "Planning", key: "planning" },
                  { label: "Quest", key: "quest" },
                  { label: "Travel", key: "travel" },
                  { label: "Encounter", key: "encounter" },
                  { label: "Combat", key: "attack" },
                  { label: "Refresh", key: "refresh" },
                ].map((p, i) => {
                  const active =
                    p.key === game.phase ||
                    (p.key === "resource" && game.phase === "setup") ||
                    (p.key === "quest" && game.phase === "staging") ||
                    (p.key === "attack" && game.phase === "defense");
                  return (
                    <div
                      key={p.key}
                      className={active ? "active" : ""}
                      aria-current={active ? "step" : undefined}
                    >
                      <span>{i + 1}</span>
                      {p.label}
                      {active && (
                        <motion.i
                          className="phase-cursor"
                          layoutId="phase-cursor"
                          transition={
                            reducedMotion ? { duration: 0 } : tableSpring
                          }
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="shared-table-label">
                <Tree size={14} /> A SHARED JOURNEY
              </span>
            </div>
            <EscapeTestSummary s={game} />
            <ScenarioState s={game} inspect={setDetail} />
            <div className="table-layout">
              <section className={`gameboard board-${game.scenarioId}`}>
                <JourneyArea
                  s={game}
                  dispatch={dispatch}
                  inspect={setDetail}
                  inspectQuest={() => setShowQuest(true)}
                />
                <TableDecks
                  s={game}
                  kind="encounter"
                  openDiscard={() => {
                    setPile("encounter");
                    setShowPiles(true);
                  }}
                />
                <TableDecks
                  s={game}
                  kind="player"
                  openDiscard={() => {
                    setPile("player");
                    setShowPiles(true);
                  }}
                />
                <div
                  className={`encounter-field ${allEngaged(game).length ? "has-engaged" : ""} ${game.assaultOsgiliath?.controlled.length ? "has-controlled" : ""}`}
                >
                  <motion.div layoutScroll className="encounter-zone">
                    <div className="zone-label">
                      <span>
                        <Eye size={16} /> STAGING AREA
                      </span>
                      <span>
                        <Eye size={15} aria-hidden="true" />{" "}
                        {stagingThreat(game)} threat
                      </span>
                    </div>
                    <motion.div layoutScroll className="board-cards">
                      {game.staging.map((u) => (
                        <BoardCard
                          key={u.id}
                          s={game}
                          u={u}
                          dispatch={dispatch}
                          inspect={() => setDetail(card(u.code))}
                          inspectCard={setDetail}
                          action={
                            game.phase === "defense" &&
                            pendingEnemyAttack(game, u)
                              ? () => setCombatEnemy(u.id)
                              : claimableObjectives.includes(u.code) &&
                                  game.phase !== "setup" &&
                                  objectiveFree(game, u)
                                ? () => setClaimId(u.id)
                                : game.phase === "travel" &&
                                    card(u.code).type_code === "location"
                                  ? () => dispatch({ type: "TRAVEL", id: u.id })
                                  : game.phase === "encounter" &&
                                      card(u.code).type_code === "enemy" &&
                                      !game.optionalEngagement
                                    ? () =>
                                        dispatch({ type: "ENGAGE", id: u.id })
                                    : game.phase === "attack" &&
                                        card(u.code).type_code === "enemy" &&
                                        (game.table || game.earlyAttackPlayers
                                          ? !u.attackedBy?.includes(
                                              activeSeat(game),
                                            )
                                          : !u.attacked) &&
                                        attackersFor(game, u).length > 0
                                      ? () => {
                                          setCombatEnemy(u.id);
                                        }
                                      : undefined
                          }
                          actionLabel={
                            game.phase === "defense" &&
                            consideredEngaged(game, u)
                              ? "Defend"
                              : claimableObjectives.includes(u.code)
                                ? objectiveFree(game, u)
                                  ? objectiveClaimExhausts(game, u.id)
                                    ? "Claim · Exhaust hero"
                                    : "Claim · +2 threat"
                                  : "Guarded"
                                : card(u.code).type_code === "location"
                                  ? "Travel here"
                                  : game.phase === "attack"
                                    ? consideredEngaged(game, u)
                                      ? "Attack"
                                      : "Attack staging enemy"
                                    : "Engage"
                          }
                          actionDisabled={
                            game.phase === "attack" &&
                            amonPlayerCannotDeclareAttack(game)
                              ? "Hobbit-sense prevents this fellowship from declaring attacks this round."
                              : game.phase === "encounter" &&
                                  card(u.code).type_code === "enemy"
                                ? optionalEngagementProblem(game, u)
                                : exhaustedClaimObjectives.includes(u.code) &&
                                    !game.heroes.some(
                                      (h) =>
                                        !h.exhausted &&
                                        !khazadCannotExhaust(h) &&
                                        !watcherWaterCannotExhaust(h),
                                    )
                                  ? "A ready hero must be able to exhaust to claim this objective."
                                  : game.phase === "travel" &&
                                      card(u.code).type_code === "location"
                                    ? canTravel(game, u)
                                    : null
                          }
                        />
                      ))}
                      {!game.staging.length && (
                        <div className="empty-zone">
                          <Tree size={34} weight="thin" />
                          <span>For a moment, the path is clear.</span>
                        </div>
                      )}
                    </motion.div>
                  </motion.div>
                  {!!game.assaultOsgiliath?.controlled.length && (
                    <motion.div
                      layoutScroll
                      className="engaged-zone controlled-zone"
                      aria-label="Controlled Osgiliath locations"
                    >
                      <div className="zone-label">
                        <span>
                          <Shield size={15} /> CONTROLLED
                        </span>
                        <span>{game.assaultOsgiliath.controlled.length}</span>
                      </div>
                      <motion.div layoutScroll className="board-cards">
                        {game.assaultOsgiliath.controlled.map((u) => (
                          <BoardCard
                            key={u.id}
                            s={game}
                            u={u}
                            dispatch={dispatch}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                          />
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                  {allEngaged(game).length > 0 && (
                    <motion.div layoutScroll className="engaged-zone">
                      <div className="zone-label">
                        <span>
                          <Sword size={15} /> ENGAGED ENEMIES
                        </span>
                      </div>
                      <motion.div layoutScroll className="board-cards">
                        {allEngaged(game).map((u) => (
                          <BoardCard
                            key={u.id}
                            s={game}
                            u={u}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                            action={
                              (
                                game.phase === "defense"
                                  ? pendingEnemyAttack(game, u)
                                  : game.phase === "attack" &&
                                    (game.table || game.earlyAttackPlayers
                                      ? !u.attackedBy?.includes(
                                          activeSeat(game),
                                        )
                                      : !u.attacked) &&
                                    attackersFor(game, u).length > 0
                              )
                                ? () => {
                                    setCombatEnemy(u.id);
                                  }
                                : undefined
                            }
                            actionLabel={
                              game.phase === "defense"
                                ? "Defend"
                                : game.table &&
                                    ownerOf(game, u) !== activeSeat(game)
                                  ? `Ranged · ${seatName(game, ownerOf(game, u))}`
                                  : "Attack"
                            }
                            actionDisabled={
                              game.phase === "attack" &&
                              amonPlayerCannotDeclareAttack(game)
                                ? "Hobbit-sense prevents this fellowship from declaring attacks this round."
                                : null
                            }
                          />
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </div>
                <motion.div layoutScroll className="fellowship-zone">
                  <div className="zone-label">
                    <span>
                      <UsersThree size={16} />{" "}
                      {game.table
                        ? `${seatName(game, activeSeat(game)).toUpperCase()}’S FELLOWSHIP`
                        : "YOUR FELLOWSHIP"}
                    </span>
                    <span>
                      {questWill(game) > 0 && (
                        <>
                          <Feather size={15} /> {questWill(game)} committed
                        </>
                      )}
                    </span>
                  </div>
                  {game.phase === "quest" && emynMuilMustCommit(game) && (
                    <p className="quest-selection-note" role="status">
                      The Falls of Rauros requires every eligible ready
                      character to quest. Select each ready card below.
                    </p>
                  )}
                  {allHeroes(game)
                    .flatMap((h) =>
                      h.attachments
                        .filter((a) => a.code === KHAZAD.book && !a.blanked)
                        .map((a) => ({ h, a })),
                    )
                    .map(({ h, a }) => (
                      <div className="abilities objective-actions" key={a.id}>
                        <button
                          disabled={
                            game.phase === "setup" ||
                            !!game.escapeTest ||
                            !!game.choice ||
                            !!game.flow?.pending ||
                            !game.heroes.some(
                              (hero) =>
                                !hero.exhausted &&
                                !khazadCannotExhaust(hero) &&
                                hero.id !== h.id,
                            )
                          }
                          onClick={() => setClaimId(a.id)}
                        >
                          Move Book of Mazarbul · Exhaust a hero
                        </button>
                      </div>
                    ))}
                  <motion.div layoutScroll className="character-row">
                    <div
                      className="hero-company"
                      role="group"
                      aria-label="Heroes"
                    >
                      {game.heroes.map((u) => (
                        <CharacterCard
                          key={u.id}
                          s={game}
                          u={u}
                          inspect={() => setDetail(card(u.code))}
                          inspectCard={setDetail}
                          dispatch={dispatch}
                        />
                      ))}
                    </div>
                    {game.allies.length > 0 && (
                      <div
                        className="ally-company"
                        role="group"
                        aria-label="Allies"
                      >
                        {game.allies.map((u) => (
                          <CharacterCard
                            key={u.id}
                            s={game}
                            u={u}
                            inspect={() => setDetail(card(u.code))}
                            inspectCard={setDetail}
                            dispatch={dispatch}
                          />
                        ))}
                      </div>
                    )}
                    <OtherFellowships
                      s={game}
                      dispatch={dispatch}
                      select={(seat) => dispatch({ type: "SELECT_SEAT", seat })}
                    />
                  </motion.div>
                </motion.div>
                <Hand
                  key={game.table?.active ?? "classic"}
                  s={game}
                  inspect={(u) => setDetail(card(u.code))}
                  play={beginPlay}
                  dispatch={dispatch}
                  art={(u) => <Art c={card(u.code)} />}
                  onPiles={() => setShowPiles(true)}
                />
              </section>
              <aside className="turn-panel">
                <ThreatCounter s={game} />
                <div className="turn-panel-top">
                  <span className="green-dot" />{" "}
                  {game.table
                    ? seatName(game, activeSeat(game)).toUpperCase()
                    : "YOUR TURN"}
                </div>
                <h2 key={game.phase} className="phase-title">
                  {phaseTitle(game)}
                </h2>
                <TurnActions
                  s={game}
                  dispatch={dispatch}
                  review={() => setShowResolution(true)}
                />
                {coach === "on" &&
                  (() => {
                    const tip = coachTip(game);
                    return tip ? (
                      <aside
                        className={`coach-tip coach-${tip.tone}`}
                        aria-label="Coaching tip"
                      >
                        <Lightbulb size={18} weight="light" />
                        <div>
                          <strong>{tip.title}</strong>
                          <p>{tip.text}</p>
                          {tip.danger && <em>{tip.danger}</em>}
                        </div>
                      </aside>
                    ) : null;
                  })()}
                {!!game.pendingWolfReturns?.length && (
                  <p className="turn-tip">
                    {game.pendingWolfReturns.length} Wolf Rider shadow
                    {game.pendingWolfReturns.length === 1
                      ? " waits"
                      : "s wait"}{" "}
                    to return to the encounter deck at the end of combat.
                  </p>
                )}
                <details className="table-guidance">
                  <summary>Help with this phase</summary>
                  <p>{phaseHelp(game)}</p>
                  <div className="turn-tip">
                    {game.phase === "quest"
                      ? "Click a ready character to select it. Click again to unselect."
                      : game.phase === "planning"
                        ? `${game.hand.filter((u) => !playReason(game, u)).length} cards playable · Inspect a card for its rules and costs.`
                        : game.phase === "defense"
                          ? "Your defender exhausts. Damage is attack minus defense, after shadows."
                          : "Hover to preview a card. Click to read its full rules."}
                  </div>
                </details>
                {["quest", "staging"].includes(game.phase) && (
                  <QuestForecast s={game} />
                )}
                {game.lastQuest &&
                  ["quest", "staging", "travel"].includes(game.phase) && (
                    <div
                      className={`quest-result ${game.lastQuest.net >= 0 ? "success" : "failure"}`}
                    >
                      <span>
                        {game.lastQuest.net > 0
                          ? "Quest successful"
                          : game.lastQuest.net < 0
                            ? "Quest failed"
                            : "A stalemate"}
                      </span>
                      <strong>
                        {game.lastQuest.will} quest strength −{" "}
                        {game.lastQuest.threat} threat
                      </strong>
                      <small>
                        {game.lastQuest.net >= 0
                          ? `${game.lastQuest.net} progress gained`
                          : `Threat increased by ${-game.lastQuest.net}`}
                      </small>
                    </div>
                  )}
                <CooperativeActions s={game} dispatch={dispatch} />
                <details className="table-history">
                  <summary>Recent events</summary>
                  {game.lastReveal && (
                    <div className="last-reveal">
                      <h3>Last encounter</h3>
                      <button onClick={() => setDetail(card(game.lastReveal!))}>
                        <Art c={card(game.lastReveal)} />
                        <span>
                          {card(game.lastReveal).name}
                          <small>{card(game.lastReveal).type_code}</small>
                          <span>
                            Inspect <ArrowRight size={12} />
                          </span>
                        </span>
                      </button>
                    </div>
                  )}
                  {!!game.flow?.history.length && (
                    <div className="latest-event">
                      <button onClick={() => setShowLog(true)}>
                        <Scroll size={16} />
                        <span>
                          <strong>{game.flow.history.at(-1)!.title}</strong>
                          <small>Review the event chronicle</small>
                        </span>
                      </button>
                    </div>
                  )}
                  <div className="recent-log">
                    <h3>The chronicle</h3>
                    {game.log
                      .slice(-4)
                      .reverse()
                      .map((l) => (
                        <p key={l.id} className={l.kind}>
                          {l.text}
                        </p>
                      ))}
                  </div>
                  <button
                    className="text-link export-link"
                    onClick={exportSave}
                  >
                    <DownloadSimple size={14} /> Export adventure
                  </button>
                </details>
              </aside>
            </div>
            {game.status === "playing" && (
              <footer className="mobile-action-bar">
                <div>
                  <small>ROUND {game.round || 1}</small>
                  <strong>{phaseTitle(game)}</strong>
                </div>
                <TurnActions
                  s={game}
                  dispatch={dispatch}
                  review={() => setShowResolution(true)}
                />
              </footer>
            )}
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {page === "table" &&
        game &&
        tutorial === "pending" &&
        !game.flow?.pending &&
        !game.choice && (
          <Modal
            title="Your first adventure"
            className="tutorial-modal"
            onClose={() => setTutorial("seen")}
          >
            <p className="tutorial-lead">
              A round has seven phases. The table walks you through them; this
              is the whole rhythm.
            </p>
            <ol className="tutorial-steps">
              <li>
                <strong>Resource & planning.</strong> Each hero gains 1
                resource. Play allies and attachments with matching sphere
                resources.
              </li>
              <li>
                <strong>Quest.</strong> Commit characters; their quest strength
                must beat staging threat to place progress. Use willpower
                normally, attack for Battle, and defense for Siege. Usually, one
                encounter card is revealed per player; quest effects can change
                this.
              </li>
              <li>
                <strong>Travel & engagement.</strong> Travel to a location to
                remove its threat. Enemies whose engagement cost is at or below
                your threat engage you.
              </li>
              <li>
                <strong>Combat.</strong> Choose a defender for each enemy, then
                strike back with ready characters.
              </li>
              <li>
                <strong>Refresh.</strong> Your characters ready and each
                player’s threat rises by 1. At 50 threat you are eliminated.
              </li>
            </ol>
            <p className="tutorial-note">
              A lit lamp in the turn panel suggests a move for each decision.
              Enter confirms an event review. Press ? for shortcuts and
              preferences.
            </p>
            <label className="preference-check">
              <div>
                <strong>Show coaching tips</strong>
              </div>
              <input
                type="checkbox"
                checked={coach === "on"}
                onChange={(e) => setCoach(e.target.checked ? "on" : "off")}
              />
            </label>
            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => setTutorial("seen")}
                autoFocus
              >
                Start playing <ArrowRight />
              </button>
            </div>
          </Modal>
        )}
      {showRecords &&
        (() => {
          const sum = summarize(records);
          return (
            <Modal
              title="Your journey record"
              onClose={() => setShowRecords(false)}
            >
              <div className="records-summary">
                <div>
                  <strong>{sum.played}</strong>
                  <small>games</small>
                </div>
                <div>
                  <strong>{sum.won}</strong>
                  <small>victories</small>
                </div>
                <div>
                  <strong>
                    {sum.played ? Math.round((sum.won / sum.played) * 100) : 0}%
                  </strong>
                  <small>win rate</small>
                </div>
                <div>
                  <strong>{sum.bestScore ?? "—"}</strong>
                  <small>best score · lower is better</small>
                </div>
              </div>
              {records.length === 0 ? (
                <p>Finish an adventure and it will be recorded here.</p>
              ) : (
                <>
                  <table
                    className="records-table"
                    aria-label="Results by quest"
                  >
                    <thead>
                      <tr>
                        <th>Quest</th>
                        <th>Played</th>
                        <th>Won</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCENARIOS.map((q) => (
                        <tr key={q.id}>
                          <td>{q.name}</td>
                          <td>{sum.byScenario[q.id]?.played ?? 0}</td>
                          <td>{sum.byScenario[q.id]?.won ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <h3>Recent adventures</h3>
                  <table
                    className="records-table"
                    aria-label="Recent adventures"
                  >
                    <thead>
                      <tr>
                        <th>Result</th>
                        <th>Quest</th>
                        <th>Deck</th>
                        <th>Rounds</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...records]
                        .reverse()
                        .slice(0, 15)
                        .map((r) => (
                          <tr key={r.key}>
                            <td
                              className={
                                r.result === "won" ? "is-won" : "is-lost"
                              }
                            >
                              {r.result === "won" ? "Won" : "Lost"}
                            </td>
                            <td>
                              {scenario(r.scenarioId).shortName}
                              {r.playMode === "campaign" ? " · campaign" : ""}
                              {r.easy ? " · easy" : ""}
                            </td>
                            <td>
                              {r.deck}
                              {r.players > 1 ? ` · ${r.players} players` : ""}
                            </td>
                            <td>{r.rounds}</td>
                            <td>{r.result === "won" ? r.score : "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        if (
                          confirm("Clear your journey record on this device?")
                        ) {
                          writeRecords([]);
                          setRecords([]);
                        }
                      }}
                    >
                      Clear record
                    </button>
                  </div>
                </>
              )}
            </Modal>
          );
        })()}
      {showSettings && (
        <Modal
          title="Make the table yours"
          onClose={() => setShowSettings(false)}
        >
          <TableCollection
            selected={playmat}
            active={activePlaymat}
            select={setPlaymat}
          />
          <div className="preference-section">
            <h3>Card density</h3>
            <p>Choose more room to read, or more cards on screen.</p>
            <div className="preference-segments">
              {(["comfortable", "compact"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={density === v}
                  onClick={() => setDensity(v)}
                >
                  {v === "comfortable" ? "Comfortable" : "Compact"}
                  {density === v && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
          <div className="preference-section">
            <h3>Event reviews</h3>
            <p>
              Choose when the table waits for Continue. Every event is still
              written to the chronicle.
            </p>
            <div className="preference-segments preference-stack">
              {REVIEW_MODES.map((v) => (
                <button
                  key={v}
                  aria-pressed={reviewMode === v}
                  onClick={() => setReviewMode(v)}
                >
                  <span>
                    {reviewModeLabel[v]}
                    <small>
                      {
                        {
                          all: "Confirm each recorded event, including your own plays.",
                          hidden:
                            "Pause for revealed encounters, shadows, damage, threat and quest results. Recommended.",
                          decisions:
                            "Never pause for information. Only choices stop the table.",
                        }[v]
                      }
                    </small>
                  </span>
                  {reviewMode === v && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
          <label className="preference-check">
            <div>
              <strong>Hover card previews</strong>
              <small>
                Read cards without leaving the table. Available with a mouse on
                larger screens.
              </small>
            </div>
            <input
              type="checkbox"
              checked={hoverCards === "on"}
              onChange={(e) => setHoverCards(e.target.checked ? "on" : "off")}
            />
          </label>
          <label className="preference-check">
            <div>
              <strong>Coaching tips</strong>
              <small>
                One suggestion for the current decision, computed from the
                visible table. Numbers only; the choice stays yours.
              </small>
            </div>
            <input
              type="checkbox"
              checked={coach === "on"}
              onChange={(e) => setCoach(e.target.checked ? "on" : "off")}
            />
          </label>
          <div className="keyboard-guide">
            <h3>
              <Keyboard size={19} />
              Keyboard shortcuts
            </h3>
            <dl>
              <div>
                <dt>Switch player</dt>
                <dd>
                  <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>
                </dd>
              </div>
              <div>
                <dt>Next step</dt>
                <dd>
                  <kbd>N</kbd>
                </dd>
              </div>
              <div>
                <dt>Undo last action</dt>
                <dd>
                  <kbd>U</kbd>
                </dd>
              </div>
              <div>
                <dt>Jump to hand</dt>
                <dd>
                  <kbd>H</kbd>
                </dd>
              </div>
              <div>
                <dt>Preferences & shortcuts</dt>
                <dd>
                  <kbd>?</kbd>
                </dd>
              </div>
              <div>
                <dt>Close a card or menu</dt>
                <dd>
                  <kbd>Esc</kbd>
                </dd>
              </div>
            </dl>
            <p>Shortcuts pause while you’re typing or making a choice.</p>
          </div>
        </Modal>
      )}
      {showQuest && game && (
        <Modal title={stageInfo(game).name} onClose={() => setShowQuest(false)}>
          <div className="quest-inspector">
            <img
              src={questFace(game)}
              alt={`${stageInfo(game).name}, quest side ${questStageLabel(game)}`}
            />
            <p>{stageInfo(game).story}</p>
            {currentQuestUnit(game) && (
              <AttachmentStack
                u={currentQuestUnit(game)!}
                inspect={(c) => {
                  setShowQuest(false);
                  setDetail(c);
                }}
              />
            )}
            <QuestGoals s={game} />
            <p>
              <strong>
                {game.progress} / {stageInfo(game).quest || "Special objective"}
              </strong>{" "}
              quest progress · Stage {game.stage} of{" "}
              {scenario(game.scenarioId).stages.length}
            </p>
            <small>
              {scenarioRelease(game.scenarioId)} · Quest card · Fantasy Flight
              Games
            </small>
            {"cardCode" in stageInfo(game) && (
              <button
                className="secondary"
                onClick={async () => {
                  const stage = stageInfo(game);
                  if (!("cardCode" in stage)) return;
                  try {
                    const local = [
                      ...(carrockQuestCards as Card[]),
                      ...EMYN_MUIL_QUESTS,
                    ].find((c) => c.code === stage.cardCode);
                    const printed =
                      local ??
                      (await loadCatalog()).find(
                        (c) => c.code === stage.cardCode,
                      );
                    if (printed) {
                      setShowQuest(false);
                      setDetail(printed);
                    } else
                      notify(
                        "The printed quest is not available in the imported snapshot.",
                      );
                  } catch {
                    notify("The printed quest could not load. Try again.");
                  }
                }}
              >
                <BookOpen size={16} /> Read printed quest
              </button>
            )}
          </div>
        </Modal>
      )}
      {showPiles && game && (
        <Modal title="Discard piles" onClose={() => setShowPiles(false)}>
          <div className="preference-segments">
            {(["player", "encounter"] as const).map((p) => (
              <button
                key={p}
                aria-pressed={pile === p}
                onClick={() => setPile(p)}
              >
                {p === "player"
                  ? `Your cards · ${game.discard.length}`
                  : `Encounters · ${game.encounterDiscard.length}`}
              </button>
            ))}
          </div>
          <p className="pile-note">
            Only discarded cards are shown.{" "}
            {pile === "player" ? game.deck.length : game.encounterDeck.length}{" "}
            cards remain in the {pile === "player" ? "player" : "encounter"}{" "}
            deck.
          </p>
          <div className="pile-list">
            {[...(pile === "player" ? game.discard : game.encounterDiscard)]
              .reverse()
              .map((code, i) => (
                <button
                  key={`${code}-${i}`}
                  onClick={() => setDetail(card(code))}
                >
                  <Art c={card(code)} />
                  <span>
                    <strong>{card(code).name}</strong>
                    <small>
                      {card(code).type_code} · {card(code).sphere_code}
                    </small>
                  </span>
                  <Info size={17} />
                </button>
              ))}
          </div>
          {!(pile === "player" ? game.discard : game.encounterDiscard)
            .length && (
            <div className="empty-zone">
              <Stack size={30} />
              <span>No cards have been discarded here.</span>
            </div>
          )}
        </Modal>
      )}
      {showAccount && (
        <Modal
          title="Your account"
          onClose={() => setShowAccount(false)}
          compact
        >
          <AccountPanel account={account} />
        </Modal>
      )}
      {previewDeck &&
        (() => {
          const d = describeDeck(previewDeck, decks);
          if (!d) return null;
          return (
            <Modal
              title={`${d.subtitle} · ${d.name}`}
              onClose={() => setPreviewDeck(null)}
              wide
            >
              <p>
                {d.description} {d.heroes.length} starting{" "}
                {d.heroes.length === 1 ? "hero" : "heroes"} and{" "}
                {deckSize(d.cards)} player cards.
              </p>
              <DeckProductNote deck={d} />
              <div className="deck-preview-heroes">
                {d.heroes.map((code) => (
                  <button key={code} onClick={() => setDetail(card(code))}>
                    <Art c={card(code)} />
                    <strong>{card(code).name}</strong>
                    <span>
                      {card(code).threat} printed threat · Inspect hero
                    </span>
                    <CardProductNote c={card(code)} />
                  </button>
                ))}
              </div>
              <h3>Inside this deck</h3>
              <div className="deck-list">
                {Object.entries(d.cards).map(([code, count]) => (
                  <div className="deck-row" key={code}>
                    <button
                      className="deck-card-link"
                      onClick={() => setDetail(card(code))}
                    >
                      <Art c={card(code)} />
                      <span>
                        {card(code).name}
                        <small>
                          {card(code).type_code} · Cost {card(code).cost}
                        </small>
                      </span>
                    </button>
                    <span className="deck-quantity">× {count}</span>
                  </div>
                ))}
              </div>
            </Modal>
          );
        })()}
      {detail && (
        <CardDetail
          c={detail}
          onClose={() => setDetail(null)}
          action={
            inspectedHand && game ? (
              <div className="inspector-action">
                <p>
                  {playReason(game, inspectedHand) ??
                    `Available now · cost ${playCost(game, card(inspectedHand.code))} resources`}
                </p>
                {availableAbilities(game, inspectedHand).map((a) => (
                  <button
                    key={a.id ?? a.label}
                    className="secondary"
                    disabled={
                      a.disabled || !!game.choice || !!game.flow?.pending
                    }
                    onClick={() => {
                      setDetail(null);
                      dispatch({
                        type: "ABILITY",
                        id: inspectedHand.id,
                        attachmentId: a.id,
                      });
                    }}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  className="primary"
                  disabled={!!playReason(game, inspectedHand)}
                  onClick={() => {
                    setDetail(null);
                    beginPlay(inspectedHand);
                  }}
                >
                  Play this card <ArrowRight size={18} />
                </button>
              </div>
            ) : undefined
          }
        />
      )}
      {restart && (
        <Modal title="A new journey?" onClose={() => setRestart(false)} wide>
          <p>
            Your current saved adventure will be replaced. You can export it
            first to keep a copy.
          </p>
          {setupMode === "classic" ? (
            <DeckPicker
              value={selectedDeck}
              onChange={setSelectedDeck}
              label="New adventure fellowship"
              custom={decks}
              compact
            />
          ) : (
            <p className="restart-company">
              New company:{" "}
              {seats
                .flatMap((p) => p.heroes)
                .map((h) => card(h).name)
                .join(" · ")}
              <br />
              {count(seats.length, "player")} ·{" "}
              {seats.reduce((n, p) => n + p.heroes.length, 0)} heroes · one deck
              per player.
            </p>
          )}
          <div className="modal-actions">
            <button className="secondary" onClick={exportSave}>
              Export current save
            </button>
            <button className="primary" onClick={() => start()}>
              Begin anew <ArrowRight />
            </button>
          </div>
        </Modal>
      )}
      {game?.flow?.pending && page === "table" && showResolution && (
        <ResolutionDialog
          s={game}
          inspect={setDetail}
          continueGame={(stepId) => dispatch({ type: "CONTINUE", stepId })}
          viewTable={() => setShowResolution(false)}
          openLog={() => setShowLog(true)}
        />
      )}
      {game && game.choice && !game.flow?.pending && page === "table" && (
        <ChoiceDialog
          s={game}
          choose={(id) => dispatch({ type: "CHOOSE", id })}
          inspect={setDetail}
        />
      )}
      {claimId && game && (
        <DecisionDialog
          title="Claim an objective"
          onClose={() => setClaimId(null)}
          description={objectiveClaimDescription(game, claimId)}
        >
          <div className="decision-grid choice-list">
            {game.heroes
              .filter(
                (h) =>
                  !objectiveClaimExhausts(game, claimId) ||
                  (!h.exhausted &&
                    !khazadCannotExhaust(h) &&
                    !watcherWaterCannotExhaust(h) &&
                    !h.attachments.some((a) => a.id === claimId)),
              )
              .map((h) => (
                <DecisionCard
                  key={h.id}
                  c={card(h.code)}
                  inspect={setDetail}
                  onSelect={() => {
                    if (dispatch({ type: "CLAIM", id: claimId, heroId: h.id }))
                      setClaimId(null);
                  }}
                />
              ))}
          </div>
        </DecisionDialog>
      )}
      {game && playCard && (
        <DecisionDialog
          title={`Play ${name(playCard)}`}
          onClose={() => setPlayCard(null)}
          description={
            needsTarget(playCard)
              ? "Choose a target card, check your payment, then play."
              : "Check the card and your payment, then play."
          }
          footer={
            <>
              <span className="decision-hint">
                {needsTarget(playCard) && !target
                  ? "Select a target card to continue."
                  : !eligiblePayers(
                        game,
                        card(playCard.code).cost === "X"
                          ? { ...card(playCard.code), cost: xCost }
                          : card(playCard.code),
                        get(game, target),
                      ).length
                    ? "A matching sphere hero is required for this target."
                    : `${Object.values(payment).reduce((sum, n) => sum + n, 0)} resources selected`}
              </span>
              <div className="decision-actions">
                <button className="secondary" onClick={() => setPlayCard(null)}>
                  Cancel
                </button>
                <button
                  className="primary"
                  disabled={
                    (needsTarget(playCard) && !target) ||
                    (["01067", "06083"].includes(playCard.code) &&
                      (!Number.isInteger(xCost) ||
                        xCost < 1 ||
                        xCost > eventXMaximum(game, playCard.code))) ||
                    !eligiblePayers(
                      game,
                      card(playCard.code).cost === "X"
                        ? { ...card(playCard.code), cost: xCost }
                        : card(playCard.code),
                      get(game, target),
                    ).length ||
                    Object.values(payment).reduce(
                      (n, value) => n + value,
                      0,
                    ) !==
                      playCost(
                        game,
                        card(playCard.code).cost === "X"
                          ? { ...card(playCard.code), cost: xCost }
                          : card(playCard.code),
                        get(game, target),
                      )
                  }
                  onClick={() => {
                    if (
                      dispatch({
                        type: "PLAY",
                        id: playCard.id,
                        target,
                        payment,
                        amount: xCost,
                      })
                    )
                      setPlayCard(null);
                  }}
                >
                  Play card <ArrowRight />
                </button>
              </div>
            </>
          }
        >
          <div className="play-selection">
            <aside className="play-source">
              <DecisionCard c={card(playCard.code)} inspect={setDetail} />
            </aside>
            <section className="play-options">
              <p className="rules-text">{plain(card(playCard.code).text)}</p>
              {needsTarget(playCard) && (
                <section
                  aria-label="Choose a target"
                  className="target-selection"
                >
                  <h3>Choose a target</h3>
                  <div className="decision-grid">
                    {playTargets(game, playCard).map((u) => (
                      <DecisionCard
                        key={u.id}
                        unitId={u.id}
                        c={
                          u.id.startsWith("quest:")
                            ? { ...card(u.code), imagesrc: questFace(game) }
                            : card(u.code)
                        }
                        selected={target === u.id}
                        inspect={setDetail}
                        detail={
                          u.id.startsWith("quest:")
                            ? "Current encounter quest"
                            : game.table
                              ? u.id.startsWith("discard-")
                                ? `${seatName(game, Number(u.id.split("-")[1]))}’s discard`
                                : `${seatName(game, ownerOf(game, u))}’s fellowship`
                              : undefined
                        }
                        onSelect={() => {
                          setTarget(u.id);
                          const c = card(playCard.code);
                          const amount =
                            playCard.code === "01051"
                              ? Number(card(u.code).cost) || 0
                              : xCost;
                          if (playCard.code === "01051") setXCost(amount);
                          setPayment(
                            planCardPayment(
                              game,
                              c.cost === "X" ? { ...c, cost: amount } : c,
                              playCost(
                                game,
                                c.cost === "X" ? { ...c, cost: amount } : c,
                                u,
                              ),
                              u,
                            ),
                          );
                        }}
                      >
                        {!u.id.startsWith("discard-") &&
                          ["hero", "ally", "enemy"].includes(
                            card(u.code).type_code,
                          ) && <DecisionStats s={game} u={u} />}
                      </DecisionCard>
                    ))}
                  </div>
                  {!playTargets(game, playCard).length && (
                    <p className="decision-empty">
                      No valid targets are available.
                    </p>
                  )}
                </section>
              )}
              <h3 className="payment-heading">
                Pay{" "}
                {playCost(
                  game,
                  card(playCard.code).cost === "X"
                    ? { ...card(playCard.code), cost: xCost }
                    : card(playCard.code),
                  get(game, target),
                )}{" "}
                resources
              </h3>
              {["01067", "06083"].includes(playCard.code) && (
                <label className="field-label">
                  Choose X
                  <input
                    aria-label="Choose X"
                    type="number"
                    min="1"
                    max={eventXMaximum(game, playCard.code)}
                    value={xCost}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setXCost(n);
                      const c = card(playCard.code);
                      setPayment(
                        planCardPayment(
                          game,
                          { ...c, cost: n },
                          playCost(game, { ...c, cost: n }, get(game, target)),
                          get(game, target),
                        ),
                      );
                    }}
                  />
                </label>
              )}
              {eligiblePayers(
                game,
                card(playCard.code).cost === "X"
                  ? { ...card(playCard.code), cost: xCost }
                  : card(playCard.code),
                get(game, target),
              ).map((h) => (
                <div className="payment-row" key={h.id}>
                  <span>
                    <Sphere sphere={card(h.code).sphere_code} />
                    {name(h)} <small>({h.resources} available)</small>
                  </span>
                  <div className="stepper">
                    <button
                      disabled={!payment[h.id]}
                      onClick={() =>
                        setPayment((p) => ({ ...p, [h.id]: p[h.id] - 1 }))
                      }
                      aria-label={`Spend less from ${name(h)}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span>{payment[h.id] ?? 0}</span>
                    <button
                      disabled={(payment[h.id] ?? 0) >= h.resources}
                      onClick={() =>
                        setPayment((p) => ({
                          ...p,
                          [h.id]: (p[h.id] ?? 0) + 1,
                        }))
                      }
                      aria-label={`Spend more from ${name(h)}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </DecisionDialog>
      )}
      {game &&
        combatEnemy &&
        (() => {
          const enemy = [...allEngaged(game), ...game.staging].find(
            (u) => u.id === combatEnemy,
          );
          return enemy ? (
            <CombatDialog
              key={`${game.phase}-${enemy.id}`}
              s={game}
              enemy={enemy}
              dispatch={dispatch}
              inspect={setDetail}
              onClose={() => setCombatEnemy(null)}
            />
          ) : null;
        })()}

      {showLog && game && (
        <Modal
          title="The chronicle"
          onClose={() => setShowLog(false)}
          wide
          className="chronicle-dialog"
        >
          {game.flow?.history.length ? (
            <ResolutionChronicle s={game} inspect={setDetail} />
          ) : null}
          <details
            className="chronicle-rules-log"
            open={!game.flow?.history.length}
          >
            <summary>
              <Scroll size={16} /> Detailed rules log{" "}
              <span>{game.log.length} entries</span>
            </summary>
            <div className="full-log">
              {game.log
                .slice()
                .reverse()
                .map((l) => (
                  <div className={l.kind} key={l.id}>
                    <span>R{l.round || "—"}</span>
                    <p>{l.text}</p>
                  </div>
                ))}
            </div>
          </details>
        </Modal>
      )}
      {interlude && game?.campaign && (
        <Modal
          title="Prepare the next chapter"
          wide
          onClose={() => setInterlude(false)}
        >
          <p>
            Continue to{" "}
            <strong>
              {scenario(CAMPAIGN_CHAPTERS[game.campaign.completed.length])
                ?.name ?? "Campaign complete"}
            </strong>
            . Heroes recover their damage and begin with a fresh deck. Each
            replaced hero adds +1 to your permanent starting threat penalty.
          </p>
          <div className="campaign-hero-slots">
            {nextHeroes.map((code, i) => (
              <HeroPicker
                key={i}
                value={code}
                onChange={(code) =>
                  setNextHeroes((h) =>
                    h.map((old, j) => (j === i ? code : old)),
                  )
                }
                label={`${game.table ? `Player ${game.table.seats.findIndex((_, seat) => i < game.table!.seats.slice(0, seat + 1).reduce((n, p) => n + p.startingHeroes.length, 0)) + 1} · ` : ""}Campaign hero ${i + 1}`}
                heroes={HERO_CARDS}
                inspect={setDetail}
                unavailable={(candidate) =>
                  game.campaign!.fallen.includes(candidate)
                    ? "Fallen"
                    : nextHeroes.includes(candidate) && candidate !== code
                      ? "Already in the company"
                      : game.campaign!.prisoner === code && candidate !== code
                        ? "Keep the recorded prisoner"
                        : undefined
                }
              />
            ))}
          </div>
          {!game.table && game.deckId === "custom" && (
            <p className="campaign-deck-note">
              Your custom deck continues into the next chapter.
            </p>
          )}
          {!game.table && game.deckId !== "custom" && (
            <>
              <h3>Player deck</h3>
              <p>
                The deck supplies your player cards. Your chosen campaign heroes
                are shown above.
              </p>
              <DeckPicker
                value={nextDeck}
                onChange={setNextDeck}
                label="Campaign player deck"
                compact
                showHeroes={false}
              />
            </>
          )}
          {game.table?.seats.some((p) => p.startingHeroes.length > 1) && (
            <div className="campaign-deck-choices">
              {nextSeatDecks.map((deckId, i) => (
                <section key={i}>
                  <h3>Player {i + 1} deck</h3>
                  <DeckPicker
                    value={deckId}
                    onChange={(id) =>
                      setNextSeatDecks((decks) =>
                        decks.map((d, j) => (j === i ? id : d)),
                      )
                    }
                    label={`Campaign player ${i + 1} deck`}
                    compact
                    showHeroes={false}
                  />
                </section>
              ))}
            </div>
          )}
          {game.table && (
            <p className="campaign-note">
              Each player keeps one deck shared by their heroes. Each hero
              replacement raises every seat’s starting threat by 1.
            </p>
          )}
          <label className="support-toggle">
            <input
              type="checkbox"
              checked={includeSupport}
              onChange={(e) => setIncludeSupport(e.target.checked)}
            />{" "}
            Add earned Mendor’s Support to the deck
          </label>
          {game.campaign.prisoner && (
            <p className="campaign-note">
              The recorded prisoner, {card(game.campaign.prisoner).name}, must
              stay in your fellowship.
            </p>
          )}
          <p className="campaign-note">
            Starting threat penalty: +
            {game.campaign.threatPenalty +
              (game.table
                ? game.table.seats.reduce((total, p, i) => {
                    const offset = game
                      .table!.seats.slice(0, i)
                      .reduce((n, p) => n + p.startingHeroes.length, 0);
                    const selected = nextHeroes.slice(
                      offset,
                      offset + p.startingHeroes.length,
                    );
                    return (
                      total +
                      p.startingHeroes.filter((h) => !selected.includes(h))
                        .length
                    );
                  }, 0)
                : game.campaign.heroes.filter((h) => !nextHeroes.includes(h))
                    .length)}{" "}
            for every player. Each player may replace fallen heroes and
            voluntarily change one other hero.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setInterlude(false)}>
              Back
            </button>
            <button className="primary" onClick={advanceCampaign}>
              Begin next chapter <ArrowRight />
            </button>
          </div>
        </Modal>
      )}
      {game &&
        game.status !== "playing" &&
        !game.flow?.pending &&
        page === "table" &&
        !interlude && (
          <Modal
            title={
              game.status === "won"
                ? "Beyond the shadow"
                : "The fellowship has fallen"
            }
          >
            <div className="endgame">
              {game.status === "won" ? (
                <Tree size={64} weight="thin" />
              ) : (
                <Moon size={64} weight="thin" />
              )}
              <h2>
                {game.status === "won"
                  ? game.campaign?.completed.length === CAMPAIGN_CHAPTERS.length
                    ? "Your tale is complete."
                    : `${scenario(game.scenarioId).shortName} lies behind you.`
                  : "Every journey leaves a story."}
              </h2>
              <p>{game.reason}</p>
              <div>
                <span>
                  <strong>{game.round}</strong>Rounds
                </span>
                <span>
                  <strong>{game.threat}</strong>Threat
                </span>
                {game.status === "won" && (
                  <span>
                    <strong>{score(game)}</strong>Final score
                  </span>
                )}
              </div>
              {game.campaign && (
                <CampaignJournal game={game} inspect={setDetail} />
              )}
              {game.campaign &&
              game.status === "won" &&
              game.campaign.completed.length < CAMPAIGN_CHAPTERS.length ? (
                <button className="primary" onClick={prepareNextChapter}>
                  Continue campaign <ArrowRight />
                </button>
              ) : game.status === "lost" ? (
                <button className="primary" onClick={retry}>
                  Retry this quest <ArrowCounterClockwise />
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => {
                    nav("adventures");
                  }}
                >
                  Choose another adventure <ArrowRight />
                </button>
              )}
              {game.campaign?.completed.length === CAMPAIGN_CHAPTERS.length && (
                <p className="campaign-note">
                  {game.campaign.mendorSaved
                    ? "Mendor survived. His Support will be available from the start of your next Core Set campaign."
                    : "The campaign is complete, but Mendor did not survive the escape."}
                </p>
              )}
              <button className="text-link" onClick={() => nav("adventures")}>
                Return to adventures
              </button>
            </div>
          </Modal>
        )}
    </div>
  );
}

function CampaignJournal({
  game,
  inspect,
}: {
  game: GameState;
  inspect: (c: Card) => void;
}) {
  const c = game.campaign;
  if (!c) return null;
  return (
    <section className="campaign-journal" aria-label="Campaign log">
      <div className="section-line">
        <h3>
          <Books size={18} /> Mirkwood Paths
        </h3>
        <span>
          {c.completed.length} / {CAMPAIGN_CHAPTERS.length} chapters
        </span>
      </div>
      <ol>
        {CAMPAIGN_CHAPTERS.map((id) => {
          const q = scenario(id);
          const result = c.completed.find((r) => r.scenarioId === q.id);
          return (
            <li
              key={q.id}
              className={
                result ? "complete" : q.id === game.scenarioId ? "current" : ""
              }
            >
              <span>{result ? <Check size={15} /> : q.chapter}</span>
              <strong>{q.name}</strong>
              <small>
                {result
                  ? `Score ${result.score}`
                  : q.id === game.scenarioId
                    ? "Current chapter"
                    : "Ahead"}
              </small>
            </li>
          );
        })}
      </ol>
      <div className="campaign-pool">
        <div>
          <span>BOONS</span>
          {c.boons.length ? (
            [...new Set(c.boons)].map((code) => (
              <button key={code} onClick={() => inspect(card(code))}>
                <Sparkle size={13} />
                {card(code).name}
                {c.boons.filter((x) => x === code).length > 1
                  ? ` ×${c.boons.filter((x) => x === code).length}`
                  : ""}
              </button>
            ))
          ) : (
            <small>Earned as your story unfolds</small>
          )}
        </div>
        <div>
          <span>BURDENS</span>
          {c.burdens.length ? (
            [...new Set(c.burdens)].map((code) => (
              <button key={code} onClick={() => inspect(card(code))}>
                <Eye size={13} />
                {card(code).name}
                {c.burdens.filter((x) => x === code).length > 1
                  ? ` ×${c.burdens.filter((x) => x === code).length}`
                  : ""}
              </button>
            ))
          ) : (
            <small>No burdens recorded</small>
          )}
        </div>
      </div>
      {Object.entries(c.permanent).map(([hero, boons]) => (
        <p className="campaign-note" key={hero}>
          {card(hero).name}: {boons.map((code) => card(code).name).join(", ")}
        </p>
      ))}
      {c.prisoner && (
        <p className="campaign-note">
          Recorded prisoner: {card(c.prisoner).name}
        </p>
      )}
      {c.fallen.length > 0 && (
        <p className="campaign-note">
          Fallen heroes: {c.fallen.map((h) => card(h).name).join(", ")}
        </p>
      )}
      <footer>
        <span>
          Starting threat penalty <strong>+{c.threatPenalty}</strong>
        </span>
        <span>
          Campaign score{" "}
          <strong>{c.completed.reduce((sum, q) => sum + q.score, 0)}</strong>
        </span>
      </footer>
    </section>
  );
}

function phaseHelp(s: GameState) {
  if (s.escapeTest)
    return s.escapeTest.phase === "preparing"
      ? "Use end-of-quest actions, then choose ready characters for the escape test."
      : s.escapeTest.phase === "actions"
        ? "An action window is open. Play events or use abilities, then resolve the escape test to deal its cards."
        : "Choose ready heroes or allies to contribute their printed willpower or attack to the escape test.";
  switch (s.phase) {
    case "setup":
      return "Inspect your six starting cards. Keep them or take one mulligan before the first resource phase.";
    case "resource":
      return "Resources have been collected and cards drawn. Use eligible events and abilities, then continue to planning.";
    case "planning":
      return "Gather allies and equip your heroes. Spend resources from heroes with a matching sphere.";
    case "quest":
      return `Select ready characters below. Their ${questStat(s) === "attack" ? "attack" : questStat(s) === "defense" ? "defense" : "willpower"} contributes to this quest. Keep some ready to defend the dangers ahead.`;
    case "staging":
      return `The encounter has been revealed. Use available abilities or events before comparing ${questStat(s) === "attack" ? "attack" : questStat(s) === "defense" ? "defense" : "willpower"} and threat.`;
    case "travel":
      return s.staging.some(
        (u) => card(u.code).type_code === "location" && !canTravel(s, u),
      )
        ? "Choose an eligible location in staging. Check its travel cost before continuing."
        : allActiveLocations(s).length
          ? "Continue to the encounter phase after exploring the active locations."
          : "Continue to the encounter phase when you are ready.";
    case "encounter":
      return s.scenarioId === "anduin" && s.stage === 2
        ? "You may engage one enemy. Automatic engagement checks are skipped on the river."
        : "You may engage one enemy by choice. Then all enemies at or below your threat engage automatically.";
    case "defense":
      return "Each enemy attacks once. Assign a ready defender; its defense reduces incoming damage.";
    case "attack":
      return s.earlyAttackPlayers?.length
        ? "Oath of Eorl lets this fellowship attack before enemy attacks. Finish these attacks to continue the combat sequence."
        : s.table
          ? "Declare an attack with your ready characters. Other Ranged characters may join. Each fellowship may attack each eligible enemy once."
          : "Select an enemy and combine ready characters to attack it. Each enemy can be attacked once.";
    case "refresh":
      return "The fellowship has readied. Prepare for another round beneath the trees.";
  }
}
function BoardCard({
  s,
  u,
  inspect,
  inspectCard,
  action,
  actionLabel,
  actionDisabled,
  dispatch,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
  inspectCard: (c: Card) => void;
  action?: () => void;
  actionLabel?: string;
  actionDisabled?: string | null;
  dispatch?: (a: Action) => unknown;
}) {
  const c = card(u.code);
  const consideredPlayers = livingSeats(s).filter((player) =>
    consideredEngaged(s, u, player),
  );
  const consideredLabel = consideredPlayers.length
    ? `Considered engaged with ${consideredPlayers
        .map((player) => (s.table ? `Player ${player + 1}` : "your fellowship"))
        .join(" · ")}`
    : "Considered engaged at threat 1 or higher";
  const damageRef = useDamageFeedback(u.damage);
  return (
    <MovingCard
      id={u.id}
      className={`board-card ${u.code === SHADOW_FLAME.bane && !u.blanked && s.staging.some((e) => e.id === u.id) ? "considered-enemy" : ""} ${u.attachments.length ? "has-attachments" : ""} ${(s.table && s.phase === "attack" ? u.attackedBy?.includes(activeSeat(s)) : u.attacked) ? "acted" : ""}`}
    >
      <ShadowCards count={u.shadows.length - faceupShadowCards(u).length} />
      <FaceupShadows u={u} inspect={inspectCard} />
      <AttachmentStack u={u} inspect={inspectCard} />
      <button
        ref={damageRef}
        className="board-card-art"
        onClick={inspect}
        aria-label={`Inspect ${name(u)}`}
        aria-description={
          c.type_code === "enemy"
            ? `${u.damage} damage. ${stats(s, u).health - u.damage} hit points remaining.`
            : c.type_code === "location"
              ? `${u.progress} of ${locationQuest(s, u)} progress.`
              : undefined
        }
      >
        <Art c={c} />
        <span className="card-table-tokens">
          {u.damage > 0 && <TableToken kind="damage" value={u.damage} />}
          {u.progress > 0 && <TableToken kind="progress" value={u.progress} />}
          {(u.code === CARROCK.grimbeorn ||
            u.code === DEAD.gollum ||
            u.code === S.flames ||
            (s.scenarioId === "encounter-at-amon-din" &&
              (c.type_code === "location" || u.code === A.rescued))) && (
            <TableToken kind="resource" value={u.resources} />
          )}
        </span>
      </button>
      {u.code === SHADOW_FLAME.bane &&
        s.staging.some((e) => e.id === u.id) &&
        !u.blanked && (
          <div
            className="engaged-owner considered-engagement"
            aria-label={consideredLabel}
            title={consideredLabel}
          >
            Considered engaged
            <span>
              {consideredPlayers.length
                ? s.table
                  ? `${consideredPlayers.length === 1 ? "Player" : "Players"} ${consideredPlayers.map((player) => player + 1).join(", ")}`
                  : "Your fellowship"
                : "At threat 1 or higher"}
            </span>
          </div>
        )}
      {s.assaultOsgiliath?.controlled.some((l) => l.id === u.id) && (
        <div className="engaged-owner">
          {s.table ? seatName(s, u.owner ?? 0) : "Your fellowship"}
        </div>
      )}
      {s.table && allEngaged(s).some((e) => e.id === u.id) && (
        <div className="engaged-owner">
          Engaged with {seatName(s, ownerOf(s, u))}
        </div>
      )}
      {s.phase === "defense" &&
        c.type_code === "enemy" &&
        enemyAttackPrevented(
          s,
          u,
          allEngaged(s).some((e) => e.id === u.id)
            ? ownerOf(s, u)
            : activeSeat(s),
        ) && <div className="engaged-owner">Enemy attack prevented</div>}
      <div className="card-modifiers" aria-label="Modified card values">
        {threatOf(s, u) !== (c.threat ?? 0) && (
          <StatBadge kind="threat" value={threatOf(s, u)} />
        )}
        {c.type_code === "enemy" &&
          engagementCost(s, u) !== (c.engagement ?? 0) && (
            <span className="engaged-owner">
              Engagement cost {engagementCost(s, u)}
            </span>
          )}
        {c.type_code === "enemy" && stats(s, u).attack !== (c.attack ?? 0) && (
          <StatBadge kind="attack" value={stats(s, u).attack} />
        )}
        {c.type_code === "enemy" &&
          stats(s, u).defense !== (c.defense ?? 0) && (
            <StatBadge kind="defense" value={stats(s, u).defense} />
          )}
      </div>
      {c.type_code === "attachment" &&
        c.traits?.split(".").some((trait) => trait.trim() === "Trap") && (
          <div className="objective-status">
            <span>
              {u.blanked
                ? "Trap in staging · printed ability blank"
                : "Trap in staging · awaiting an eligible enemy"}
              {s.table ? ` · ${seatName(s, u.owner ?? 0)}` : ""}
            </span>
          </div>
        )}
      {!!s.stewardFear?.underneath[u.id]?.length && (
        <div
          className="objective-status"
          aria-label={`${s.stewardFear.underneath[u.id].length} facedown Underworld cards`}
        >
          <span>
            <Stack size={14} /> {s.stewardFear.underneath[u.id].length} facedown
            Underworld
          </span>
        </div>
      )}
      {s.scenarioId === "encounter-at-amon-din" &&
        (c.type_code === "location" ||
          [A.rescued, A.dead].includes(u.code)) && (
          <div
            className="objective-status"
            aria-label={`${u.code === A.dead ? u.damage : u.resources} ${u.code === A.dead ? "dead" : u.code === A.rescued ? "rescued" : "remaining"} villagers`}
          >
            <span>
              {u.code === A.dead ? u.damage : u.resources}{" "}
              {u.code === A.dead
                ? "dead villagers"
                : u.code === A.rescued
                  ? "rescued villagers"
                  : "villagers to rescue"}
            </span>
          </div>
        )}
      {c.type_code === "objective" && ![A.rescued, A.dead].includes(u.code) && (
        <div className="objective-status">
          <span>
            <Shield />
            {isGuarded(s, u) ? "Guarded" : "Unguarded"}
          </span>
        </div>
      )}
      {action && (
        <button
          className="card-action"
          onClick={action}
          disabled={!!actionDisabled || !!s.flow?.pending || !!s.choice}
          title={actionDisabled ?? undefined}
        >
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      )}
      {dispatch && availableAbilities(s, u).length > 0 && (
        <div className="abilities">
          {availableAbilities(s, u).map((a, i) => (
            <button
              key={a.id ?? i}
              disabled={
                a.disabled ||
                !!s.flow?.pending ||
                !!s.choice ||
                s.phase === "setup"
              }
              onClick={() =>
                dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
              }
            >
              <Sparkle size={11} /> {a.label}
            </button>
          ))}
        </div>
      )}
    </MovingCard>
  );
}
function CharacterCard({
  s,
  u,
  inspect,
  inspectCard,
  dispatch,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
  inspectCard: (c: Card) => void;
  dispatch: (a: Action) => unknown;
}) {
  const c = card(u.code),
    selected = s.committedIds.includes(u.id) || u.committed,
    canQuest =
      canCommit(s, u) &&
      !s.escapeTest &&
      !s.flow?.pending &&
      !s.choice &&
      (!s.table || s.table.active === s.table.turn);
  const damageRef = useDamageFeedback(u.damage);
  return (
    <MovingCard
      id={u.id}
      className={`character-card ${c.type_code === "hero" ? "hero-card" : "ally-card"} ${u.exhausted ? "exhausted" : ""} ${selected ? "committed" : ""} ${u.attachments.length ? "has-attachments" : ""}`}
    >
      <AttachmentStack u={u} inspect={inspectCard} />
      <button
        ref={damageRef}
        className="character-art"
        aria-description={`${u.exhausted ? "Exhausted. " : "Ready. "}${u.damage} damage. ${stats(s, u).health - u.damage} hit points remaining.`}
        onClick={
          canQuest
            ? () => dispatch({ type: "TOGGLE_QUEST", id: u.id })
            : inspect
        }
        aria-pressed={canQuest ? selected : undefined}
        aria-label={
          canQuest
            ? `${selected ? "Unselect" : "Commit"} ${name(u)}`
            : `Inspect ${name(u)}`
        }
      >
        <Art c={c} />
        {selected && (
          <span
            className="quest-badge"
            title="Committed to the quest"
            aria-label="Committed to the quest"
          >
            <Feather size={16} />
          </span>
        )}
        <span className="card-table-tokens">
          {(c.type_code === "hero" ||
            u.code === CARROCK.grimbeorn ||
            u.code === "02059") && (
            <TableToken kind="resource" value={u.resources} />
          )}
          {u.damage > 0 && <TableToken kind="damage" value={u.damage} />}
        </span>
      </button>
      <button
        className="character-inspect"
        onClick={inspect}
        aria-label={`Read ${name(u)} card`}
        title={`Read ${name(u)} card`}
      >
        <Info size={17} />
      </button>
      <Stats s={s} u={u} />
      {isSacked(u) && (
        <div className="engaged-owner">
          Sacked! · Cannot quest, fight or use own ability
        </div>
      )}
      <div className="abilities">
        {availableAbilities(s, u).map((a, i) => (
          <button
            key={a.id ?? i}
            disabled={
              a.disabled ||
              (s.phase === "setup" && !s.escapeTest) ||
              !!s.flow?.pending ||
              !!s.choice
            }
            onClick={() =>
              dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
            }
          >
            <Sparkle size={11} />
            {a.label}
          </button>
        ))}
      </div>
    </MovingCard>
  );
}
