import { useState, useEffect, useRef, useCallback } from "react";
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
  Crown,
  Diamond,
  Eye,
  Feather,
  Heart,
  Leaf,
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
  MagnifyingGlass,
  Crosshair,
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
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import {
  card,
  playerCards,
  STARTERS,
  SCRIPTED,
  imageUrl,
  plain,
  name,
} from "./game/cards";
import {
  applyAction,
  availableAbilities,
  characters,
  createGame,
  needsTarget,
  playTargets,
  publicState,
  questWill,
  score,
  stageInfo,
  stagingThreat,
  stats,
  restoreSave,
  continueCampaign,
  retryAdventure,
  canFight,
  objectiveFree,
  newCampaign,
} from "./game/engine";
import type {
  Action,
  Card,
  GameState,
  Unit,
  ScenarioId,
  PlayMode,
} from "./game/types";
import { SCENARIOS, scenario, OBJECTIVES } from "./game/scenarios";
import {
  Hand,
  CardHoverPreview,
  QuestForecast,
  QuestGoals,
  TurnActions,
  usePreference,
  playReason,
} from "./ui/experience";

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
type Page = "adventures" | "library" | "fellowship" | "guide" | "table";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
const readSave = (key = SAVE_KEY) => {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    return restoreSave(s);
  } catch {
    return null;
  }
};
const readDeckId = () => {
  try {
    const savedDeck = readSave(activeSaveKey())?.deckId;
    if (STARTERS.some((s) => s.id === savedDeck)) return savedDeck!;
    const d = localStorage.getItem(DECK_KEY);
    return STARTERS.some((s) => s.id === d) ? d! : "leadership";
  } catch {
    return "leadership";
  }
};
const phaseNames: Record<string, string> = {
  setup: "Your opening hand",
  planning: "Planning",
  quest: "Commit to the quest",
  staging: "Resolve the quest",
  travel: "Travel",
  encounter: "Encounter",
  defense: "Defend your fellowship",
  attack: "Strike back",
  refresh: "Refresh",
};
function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  wide?: boolean;
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
      className={`modal ${wide ? "modal-wide" : ""}`}
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
function Sphere({ sphere }: { sphere: string }) {
  const I =
    sphere === "leadership"
      ? Crown
      : sphere === "spirit"
        ? Feather
        : sphere === "tactics"
          ? Sword
          : sphere === "lore"
            ? Leaf
            : Diamond;
  return (
    <I
      weight="duotone"
      className={`sphere-${sphere}`}
      size={16}
      aria-label={sphere}
    />
  );
}
function Art({ c, className = "" }: { c: Card; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={`art-fallback ${className}`}>
      <Tree size={38} />
      <span>{c.name}</span>
    </div>
  ) : (
    <img
      src={imageUrl(c)}
      alt={c.name}
      data-card-code={c.code}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
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
  c: Card;
  onClose: () => void;
  action?: ReactNode;
}) {
  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="card-detail">
        <Art c={c} />
        <div>
          <div className="detail-type">
            <Sphere sphere={c.sphere_code} />
            {c.type_code} · {c.sphere_code}
          </div>
          <h3>{c.name}</h3>
          <p className="traits">{c.traits}</p>
          {c.health !== undefined && (
            <div className="detail-stats">
              <span>
                <Feather /> {c.willpower ?? "—"}
              </span>
              <span>
                <Sword /> {c.attack}
              </span>
              <span>
                <Shield /> {c.defense}
              </span>
              <span>
                <Heart /> {c.health}
              </span>
            </div>
          )}
          <p className="rules-text">
            {plain(c.text) || "No additional abilities."}
          </p>
          {c.shadow && <p className="shadow-text">{plain(c.shadow)}</p>}
          {action}
          <div className="source-note">
            {c.pack_name} · #{c.code}
            <br />
            {c.illustrator && `Illustration: ${c.illustrator}`}
            <br />
            {SCRIPTED.has(c.code)
              ? "Scripted in this adventure."
              : "Available to browse. Gameplay scripting is not available yet."}
          </div>
          {c.url && (
            <a
              className="text-link"
              href={c.url}
              target="_blank"
              rel="noreferrer"
            >
              View on RingsDB <ArrowRight />
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Stats({ s, u }: { s: GameState; u: Unit }) {
  const st = stats(s, u);
  return (
    <div className="stat-row">
      <span title="Willpower">
        <Feather />
        {st.will}
      </span>
      <span title="Attack">
        <Sword />
        {st.attack}
      </span>
      <span title="Defense">
        <Shield />
        {st.defense}
      </span>
      <span title="Remaining hit points" className={u.damage ? "damaged" : ""}>
        <Heart />
        {st.health - u.damage}
      </span>
    </div>
  );
}

export default function App() {
  const reducedMotion = useReducedMotion();
  const [page, setPage] = useState<Page>("adventures");
  const [game, setGame] = useState<GameState | null>(() =>
    readSave(activeSaveKey()),
  );
  const [playMode, setPlayMode] = useState<PlayMode>(readMode);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>(
    () => readSave(activeSaveKey())?.scenarioId ?? "mirkwood",
  );
  const [interlude, setInterlude] = useState(false);
  const [nextHeroes, setNextHeroes] = useState<string[]>([]);
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
    setSelectedScenario(saved?.scenarioId ?? "mirkwood");
    if (saved && STARTERS.some((d) => d.id === saved.deckId))
      setSelectedDeck(saved.deckId);
    setHistory([]);
  };
  const [selectedDeck, setSelectedDeck] = useState(readDeckId);
  const starter = STARTERS.find((d) => d.id === selectedDeck)!;
  const deck = starter.cards;
  const resumable =
    game &&
    (playMode === "campaign" ||
      (game.scenarioId === selectedScenario &&
        (game.deckId === selectedDeck || game.deckId === "custom")));
  const displayHeroes =
    playMode === "campaign" && game?.campaign
      ? game.campaign.heroes
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
  const [attackers, setAttackers] = useState<string[]>([]);
  const [defender, setDefender] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPiles, setShowPiles] = useState(false);
  const [pile, setPile] = useState<"player" | "encounter">("player");
  const [density, setDensity] = usePreference("density", "comfortable", [
    "comfortable",
    "compact",
  ] as const);
  const [hoverCards, setHoverCards] = usePreference("hover-cards", "on", [
    "on",
    "off",
  ] as const);
  const [saved, setSaved] = useState(true);
  const [history, setHistory] = useState<GameState[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
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
              cardCount: 1315,
            },
      );
    window.advanceTime = () => Promise.resolve();
  }, [game, page, playMode, quest.id]);
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
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "That action is unavailable.");
      return false;
    }
  };
  const start = () => {
    try {
      const s = createGame(Date.now(), deck, starter.heroes, starter.id, {
        scenarioId: playMode === "campaign" ? "mirkwood" : selectedScenario,
        playMode,
        ...(playMode === "campaign" &&
        game?.campaign?.completed.length === 3 &&
        game.campaign.mendorSaved
          ? { campaign: newCampaign(starter.heroes, true) }
          : {}),
      });
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
  const prepareNextChapter = () => {
    if (!game?.campaign) return;
    const c = game.campaign;
    const picked = c.heroes.filter((h) => !c.fallen.includes(h));
    for (const h of playerCards.filter((h) => h.type_code === "hero"))
      if (
        picked.length < 3 &&
        !picked.includes(h.code) &&
        !c.fallen.includes(h.code)
      )
        picked.push(h.code);
    setNextHeroes(picked);
    setNextDeck(game.deckId);
    setIncludeSupport(true);
    setInterlude(true);
  };
  const advanceCampaign = () => {
    if (!game) return;
    try {
      const next = continueCampaign(game, nextHeroes, nextDeck, includeSupport);
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
    const cost = Number(card(u.code).cost) || 0;
    let left = cost;
    const pay: Record<string, number> = {};
    for (const h of game.heroes) {
      if (
        card(u.code).sphere_code === "neutral" ||
        card(h.code).sphere_code === card(u.code).sphere_code ||
        (card(u.code).sphere_code === "spirit" &&
          h.code === "01001" &&
          h.attachments.some((a) => a.code === "01027"))
      ) {
        const v = Math.min(left, h.resources);
        pay[h.id] = v;
        left -= v;
      }
    }
    setPayment(pay);
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
      const s = restoreSave(JSON.parse(await file.text()));
      if (!s) throw new Error("This is not a valid adventure save.");
      setGame(s);
      setPlayMode(s.playMode);
      setSelectedScenario(s.scenarioId);
      setSelectedDeck(s.deckId === "custom" ? "leadership" : s.deckId);
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
      if (page !== "table" || game?.status !== "playing" || game.choice) return;
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
          .querySelector("#your-hand")
          ?.scrollIntoView({ block: "center", behavior: "instant" });
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
      className={`app density-${density} ${page === "table" ? "playing" : ""}`}
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
            THERE &<br />
            BACK AGAIN<small>THE LORD OF THE RINGS · LCG</small>
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
            <span className="green-dot" /> CORE SET · SOLO PLAY
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
                      : "How to play"}
            </strong>
          </div>
          <div className="top-tools">
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
              <UsersThree size={15} /> Solo play
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
            <div className="profile" title="Local adventurer">
              B
            </div>
          </div>
        </header>
        {page === "adventures" && (
          <main id="main-content" tabIndex={-1} className="lobby">
            <div className="page-heading">
              <div>
                <span className="lobby-kicker">THERE & BACK AGAIN</span>
                <h1>Choose your adventure.</h1>
                <p>
                  Three quests. Four fellowships. Your journey through
                  Middle-earth.
                </p>
              </div>
              <span className="chapter-label">
                <Diamond size={13} /> CORE SET ·{" "}
                {playMode === "campaign" ? "CAMPAIGN" : "3 QUESTS"}
              </span>
            </div>
            <section className="mode-selection" aria-label="Choose game mode">
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
                    Campaign mode<small>One fellowship. Three chapters.</small>
                  </span>
                </button>
              </div>
              <p>
                {playMode === "normal"
                  ? "Choose any Core Set quest. Each adventure begins with a fresh fellowship."
                  : "Mirkwood Paths • Follow the quests in order. Boons, burdens, fallen heroes, and your story carry forward."}
              </p>
            </section>
            <section
              className="mission-selection"
              aria-label="Core Set missions"
            >
              {SCENARIOS.map((q) => {
                const completed = game?.campaign?.completed.some(
                  (c) => c.scenarioId === q.id,
                );
                return (
                  <button
                    key={q.id}
                    className={`mission-card mission-${q.id} ${quest.id === q.id ? "selected" : ""}`}
                    aria-pressed={quest.id === q.id}
                    disabled={playMode === "campaign" && q.id !== quest.id}
                    onClick={() => setSelectedScenario(q.id)}
                  >
                    <span className="mission-number">
                      {completed ? <Check size={23} /> : q.chapter}
                    </span>
                    <span>
                      <small>
                        {completed
                          ? "CHAPTER COMPLETE"
                          : `DIFFICULTY ${q.difficulty} / 10`}
                      </small>
                      <strong>{q.name}</strong>
                      <em>{q.tagline}</em>
                    </span>
                    {quest.id === q.id && <Diamond size={14} weight="fill" />}
                  </button>
                );
              })}
            </section>
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
                  {quest.id === "mirkwood" ? (
                    <>
                      Into the heart
                      <br />
                      of <em>Mirkwood.</em>
                    </>
                  ) : quest.id === "anduin" ? (
                    <>
                      Along the
                      <br />
                      <em>great river.</em>
                    </>
                  ) : (
                    <>
                      Escape from
                      <br />
                      <em>Dol Guldur.</em>
                    </>
                  )}
                </h2>
                <p>{quest.description}</p>
                {resumable && game?.status === "playing" && (
                  <div className="resume-context">
                    <span className="green-dot" /> Saved journey · Round{" "}
                    {game.round || 1} · {phaseNames[game.phase]}
                  </div>
                )}
                <label className="starter-select">
                  YOUR FELLOWSHIP
                  <select
                    aria-label="Choose starter deck"
                    value={
                      playMode === "campaign" && game?.campaign
                        ? game.deckId
                        : selectedDeck
                    }
                    disabled={playMode === "campaign" && !!game?.campaign}
                    onChange={(e) => setSelectedDeck(e.target.value)}
                  >
                    {STARTERS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.subtitle} · {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                {playMode === "campaign" && game?.campaign && (
                  <small className="campaign-deck-note">
                    Change your deck between chapters or start a new campaign.
                  </small>
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
              <div className="hero-fan" aria-label="Your starting heroes">
                {[displayHeroes[1], displayHeroes[0], displayHeroes[2]].map(
                  (code, i) => (
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
                  ),
                )}
                <div className="fan-caption">
                  <span /> THREE HEROES. ONE FELLOWSHIP.
                  <span />
                </div>
              </div>
              <div className="hero-bottom">
                <span>
                  <Compass size={17} /> {quest.name}
                </span>
                <span>
                  <UsersThree size={15} /> 1 player
                </span>
                <span>
                  <Diamond size={14} /> Core Set
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
                    {game.campaign.completed.length} / 3 chapters recorded
                  </span>
                </summary>
                <CampaignJournal game={game} inspect={setDetail} />
              </details>
            )}
            <div className="lobby-lower">
              <section className="journey-panel">
                <div className="section-line">
                  <h3>The path ahead</h3>
                  <span>3 quest stages</span>
                </div>
                <div className="journey-stages">
                  {quest.stages
                    .map((stage, i) => ({
                      n: ["I", "II", "III"][i],
                      title: stage.name,
                      text: stage.story,
                      icon: [Tree, Compass, Mountains][i],
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
                        {i < 2 && (
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
                    {displayHeroes.map((code) => (
                      <div key={code}>
                        <Art c={card(code)} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong>{starter.name}</strong>
                    <span>{starter.subtitle} · 30 cards · 3 heroes</span>
                  </div>
                </div>
                <div className="fellowship-foot">
                  <span>
                    <Shield size={14} /> Fully scripted starter deck
                  </span>
                  <span>
                    <Check size={14} /> Ready
                  </span>
                </div>
              </section>
            </div>
            <footer className="lobby-footer">
              <span>
                <FloppyDisk size={13} /> Your journey is saved automatically on
                this device.
              </span>
              <button onClick={() => nav("guide")}>
                New to the game?{" "}
                <span>
                  Learn the way <ArrowRight size={13} />
                </span>
              </button>
            </footer>
          </main>
        )}
        {page === "library" && <Library inspect={setDetail} notify={notify} />}
        {page === "fellowship" && (
          <main id="main-content" tabIndex={-1} className="content-page">
            <div className="page-heading">
              <div>
                <h1>Choose your fellowship.</h1>
                <p>
                  Four original Core Set starter decks. Four ways through the
                  forest.
                </p>
              </div>
              <button
                className="primary"
                onClick={() => (game ? setRestart(true) : start())}
              >
                Begin with {starter.subtitle} <ArrowRight />
              </button>
            </div>
            <div className="starter-grid">
              {STARTERS.map((d) => (
                <button
                  key={d.id}
                  className={`starter-option ${selectedDeck === d.id ? "selected" : ""}`}
                  onClick={() => setSelectedDeck(d.id)}
                >
                  <Sphere sphere={d.id} />
                  <span>{d.subtitle}</span>
                  <h2>{d.name}</h2>
                  <p>{d.description}</p>
                  <small>
                    {selectedDeck === d.id ? (
                      <>
                        <Check size={12} /> Selected fellowship
                      </>
                    ) : (
                      "30 cards · 3 heroes"
                    )}
                  </small>
                </button>
              ))}
            </div>
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
                    <span>{card(code).threat} starting threat</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="deck-heading">
              <div>
                <h2>{starter.name}</h2>
                <p>
                  Original printed card quantities. All cards below have
                  scripted abilities.
                </p>
              </div>
              <strong>
                30 <span>cards + 3 heroes</span>
              </strong>
            </div>
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
          </main>
        )}
        {page === "guide" && (
          <main id="main-content" tabIndex={-1} className="content-page guide">
            <div className="page-heading">
              <div>
                <h1>Every great journey starts here.</h1>
                <p>
                  Lead your fellowship through the Core Set, one quest at a
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
                  All three Core Set quests are ready for solo play in normal or
                  campaign mode. Choose Leadership, Tactics, Spirit, or Lore.
                  Each original learning deck includes its three heroes and 30
                  cards, including one Gandalf. Win by finishing the final
                  quest; lose if threat reaches 50 or all your heroes fall.
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
              <h2>Choose your journey</h2>
              <p>
                <strong>Normal game:</strong> select any of the three missions
                for a fresh, standalone adventure.{" "}
                <strong>Campaign mode:</strong> follow Mirkwood Paths in order.
                After a victory, select Continue campaign to prepare the next
                chapter with your earned boons and burdens.
              </p>
              <p>
                The campaign log records fallen heroes, scores, permanent cards,
                and the hero captured in Dol Guldur. Replacing a hero adds +1 to
                your starting threat in later chapters. You may change one
                surviving hero between quests and replace any fallen heroes.
                Choose whether to add Mendor’s Support to your next deck.
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
                  text: "Select ready characters to commit. They exhaust. After revealing an encounter, compare their willpower with staging threat. Success places progress; failure raises your threat.",
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
                This version scripts all three Core Set quests, their encounter
                decks, the Mirkwood Paths campaign, and all 73 original Core Set
                player-card definitions across four starter decks. Multiplayer,
                expert campaign mode, expansion scenarios, and other player-card
                abilities are not implemented. The library includes the wider
                RingsDB player-card catalog for browsing.
              </p>
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
          <main id="main-content" tabIndex={-1} className="table-page">
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
                <strong>{game.round || "—"}</strong>
              </div>
              <div className="phase-track">
                {[
                  { label: "Resource", key: "setup" },
                  { label: "Planning", key: "planning" },
                  { label: "Quest", key: "quest" },
                  { label: "Travel", key: "travel" },
                  { label: "Encounter", key: "encounter" },
                  { label: "Combat", key: "attack" },
                  { label: "Refresh", key: "refresh" },
                ].map((p, i) => {
                  const active =
                    p.key === game.phase ||
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
                    </div>
                  );
                })}
              </div>
              <div
                className={`threat-dial ${game.threat >= 40 ? "danger" : ""}`}
              >
                <Eye size={23} />
                <strong>{game.threat}</strong>
                <span>
                  THREAT<small> / 50</small>
                </span>
              </div>
            </div>
            <div className="table-layout">
              <section className={`gameboard board-${game.scenarioId}`}>
                <div className="encounter-zone">
                  <div className="zone-label">
                    <span>
                      <Eye size={16} /> STAGING AREA
                    </span>
                    <span>
                      {stagingThreat(game)} threat · {game.encounterDeck.length}{" "}
                      encounter cards
                    </span>
                  </div>
                  <div className="board-cards">
                    {game.staging.map((u) => (
                      <BoardCard
                        key={u.id}
                        s={game}
                        u={u}
                        inspect={() => setDetail(card(u.code))}
                        action={
                          OBJECTIVES.includes(u.code) &&
                          game.phase !== "setup" &&
                          objectiveFree(game, u)
                            ? () => setClaimId(u.id)
                            : game.phase === "travel" &&
                                card(u.code).type_code === "location" &&
                                !game.activeLocation
                              ? () => dispatch({ type: "TRAVEL", id: u.id })
                              : game.phase === "encounter" &&
                                  card(u.code).type_code === "enemy" &&
                                  !game.optionalEngagement
                                ? () => dispatch({ type: "ENGAGE", id: u.id })
                                : game.phase === "attack" &&
                                    card(u.code).type_code === "enemy" &&
                                    !u.attacked &&
                                    game.heroes.some(
                                      (h) => h.code === "01009" && !h.exhausted,
                                    )
                                  ? () => {
                                      setCombatEnemy(u.id);
                                      setAttackers([]);
                                      setDefender("");
                                    }
                                  : undefined
                        }
                        actionLabel={
                          OBJECTIVES.includes(u.code)
                            ? objectiveFree(game, u)
                              ? "Claim · +2 threat"
                              : "Guarded"
                            : card(u.code).type_code === "location"
                              ? "Travel here"
                              : game.phase === "attack"
                                ? "Dúnhere attack"
                                : "Engage"
                        }
                      />
                    ))}
                    {!game.staging.length && (
                      <div className="empty-zone">
                        <Tree size={34} weight="thin" />
                        <span>For a moment, the path is clear.</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="quest-zone">
                  <div className="quest-marker">
                    <Compass size={26} />
                  </div>
                  <div className="quest-description">
                    <span>
                      QUEST {game.stage} ·{" "}
                      {game.scenarioId !== "mirkwood"
                        ? scenario(game.scenarioId).shortName.toUpperCase()
                        : game.branch === "unknown"
                          ? "THE FOREST PATH"
                          : game.branch === "spider"
                            ? "THE SPIDER’S LAIR"
                            : "THE WAY OUT"}
                    </span>
                    <h2>{stageInfo(game).name}</h2>
                    <p>{stageInfo(game).story}</p>
                    <QuestGoals s={game} />
                  </div>
                  <div className="quest-progress">
                    <strong>
                      {game.progress}
                      <small> / {stageInfo(game).quest || "—"}</small>
                    </strong>
                    <span>PROGRESS</span>
                    <div>
                      <i
                        style={{
                          width: `${Math.min(100, (game.progress / (stageInfo(game).quest || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {(game.activeLocation || game.engaged.length > 0) && (
                  <div className="active-zones">
                    {game.activeLocation && (
                      <div className="active-location">
                        <div className="zone-label">
                          <span>
                            <Compass size={15} /> ACTIVE LOCATION
                          </span>
                        </div>
                        <div className="location-inline">
                          <button
                            onClick={() =>
                              setDetail(card(game.activeLocation!.code))
                            }
                          >
                            <Art c={card(game.activeLocation.code)} />
                          </button>
                          <div>
                            <h3>{name(game.activeLocation)}</h3>
                            <p>
                              {game.activeLocation.progress} /{" "}
                              {card(game.activeLocation.code).quest} progress
                            </p>
                            <small>Progress goes here before the quest.</small>
                          </div>
                        </div>
                      </div>
                    )}
                    {game.engaged.length > 0 && (
                      <div className="engaged-zone">
                        <div className="zone-label">
                          <span>
                            <Sword size={15} /> ENGAGED ENEMIES
                          </span>
                        </div>
                        <div className="board-cards">
                          {game.engaged.map((u) => (
                            <BoardCard
                              key={u.id}
                              s={game}
                              u={u}
                              inspect={() => setDetail(card(u.code))}
                              action={
                                ["defense", "attack"].includes(game.phase) &&
                                !u.attacked
                                  ? () => {
                                      setCombatEnemy(u.id);
                                      setAttackers([]);
                                      setDefender("");
                                    }
                                  : undefined
                              }
                              actionLabel={
                                game.phase === "defense" ? "Defend" : "Attack"
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="fellowship-zone">
                  <div className="zone-label">
                    <span>
                      <UsersThree size={16} /> YOUR FELLOWSHIP
                    </span>
                    <span>
                      {characters(game).filter((u) => !u.exhausted).length}{" "}
                      ready · {questWill(game)} willpower committed
                    </span>
                  </div>
                  <div className="character-row">
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
                    {!game.allies.length && (
                      <div className="ally-placeholder">
                        <Plus size={22} weight="thin" />
                        <span>
                          Your allies will
                          <br />
                          gather here
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Hand
                  s={game}
                  inspect={(u) => setDetail(card(u.code))}
                  play={beginPlay}
                  art={(u) => <Art c={card(u.code)} />}
                  onPiles={() => setShowPiles(true)}
                />
              </section>
              <aside className="turn-panel">
                <div className="turn-panel-top">
                  <span className="green-dot" /> YOUR TURN
                </div>
                <h2>{phaseNames[game.phase]}</h2>
                <p>{phaseHelp(game)}</p>
                {["quest", "staging"].includes(game.phase) && (
                  <QuestForecast s={game} />
                )}
                <TurnActions s={game} dispatch={dispatch} />
                <div className="turn-tip">
                  {game.phase === "quest"
                    ? "Click a ready character to select it. Click again to unselect."
                    : game.phase === "planning"
                      ? `${game.hand.filter((u) => !playReason(game, u)).length} cards playable · Inspect a card for its rules and costs.`
                      : game.phase === "defense"
                        ? "Your defender exhausts. Damage is attack minus defense, after shadows."
                        : "Hover to preview a card. Click to read its full rules."}
                </div>
                {game.lastQuest && (
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
                      {game.lastQuest.will} willpower − {game.lastQuest.threat}{" "}
                      threat
                    </strong>
                    <small>
                      {game.lastQuest.net >= 0
                        ? `${game.lastQuest.net} progress gained`
                        : `Threat increased by ${-game.lastQuest.net}`}
                    </small>
                  </div>
                )}
                <div className="resource-pools">
                  <h3>Resource pools</h3>
                  {game.heroes.map((h) => (
                    <div key={h.id}>
                      <Sphere sphere={card(h.code).sphere_code} />
                      <span>{name(h)}</span>
                      <strong>{h.resources}</strong>
                    </div>
                  ))}
                </div>
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
                <button className="text-link export-link" onClick={exportSave}>
                  <DownloadSimple size={14} /> Export adventure
                </button>
              </aside>
            </div>
            {game.status === "playing" && (
              <footer className="mobile-action-bar">
                <div>
                  <small>ROUND {game.round || 1}</small>
                  <strong>{phaseNames[game.phase]}</strong>
                </div>
                <TurnActions s={game} dispatch={dispatch} />
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
      {showSettings && (
        <Modal
          title="Make the table yours"
          onClose={() => setShowSettings(false)}
        >
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
          <div className="keyboard-guide">
            <h3>
              <Keyboard size={19} />
              Keyboard shortcuts
            </h3>
            <dl>
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
      {detail && (
        <CardDetail
          c={detail}
          onClose={() => setDetail(null)}
          action={
            inspectedHand && game ? (
              <div className="inspector-action">
                <p>
                  {playReason(game, inspectedHand) ??
                    `Available now · cost ${card(inspectedHand.code).cost} resources`}
                </p>
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
        <Modal title="A new journey?" onClose={() => setRestart(false)}>
          <p>
            Your current saved adventure will be replaced. You can export it
            first to keep a copy.
          </p>
          <label className="field-label">
            Starting fellowship
            <select
              aria-label="New adventure fellowship"
              value={selectedDeck}
              onChange={(e) => setSelectedDeck(e.target.value)}
            >
              {STARTERS.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.subtitle} · {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="secondary" onClick={exportSave}>
              Export current save
            </button>
            <button className="primary" onClick={start}>
              Begin anew <ArrowRight />
            </button>
          </div>
        </Modal>
      )}
      {game && game.choice && page === "table" && (
        <Modal title={game.choice.title}>
          <p className="choice-description">{plain(game.choice.description)}</p>
          <div className="choice-list">
            {game.choice.options.map((o) => (
              <button
                key={o.id}
                onClick={() => dispatch({ type: "CHOOSE", id: o.id })}
              >
                {o.code ? <Art c={card(o.code)} /> : <Diamond size={18} />}
                <span>
                  {o.label}
                  {o.detail && <small>{o.detail}</small>}
                </span>
                <CaretRight size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {claimId && game && (
        <Modal title="Claim an objective" onClose={() => setClaimId(null)}>
          <p>
            Raise your threat by 2 and attach this objective to a hero. It
            counts toward that hero’s two restricted attachments.
          </p>
          <div className="choice-list">
            {game.heroes.map((h) => (
              <button
                key={h.id}
                disabled={
                  h.attachments.filter((a) =>
                    card(a.code).text?.includes("Restricted"),
                  ).length >= 2
                }
                onClick={() => {
                  if (dispatch({ type: "CLAIM", id: claimId, heroId: h.id }))
                    setClaimId(null);
                }}
              >
                <Art c={card(h.code)} />
                <span>{name(h)}</span>
                <CaretRight />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {game && playCard && (
        <Modal
          title={`Play ${name(playCard)}`}
          onClose={() => setPlayCard(null)}
        >
          <p className="rules-text">{plain(card(playCard.code).text)}</p>
          {needsTarget(playCard) && (
            <label className="field-label">
              Choose a target
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  if (playCard.code === "01051") {
                    const t = playTargets(game, playCard).find(
                      (u) => u.id === e.target.value,
                    );
                    const n = t ? Number(card(t.code).cost) || 0 : 0;
                    setXCost(n);
                    let left = n;
                    const pay: Record<string, number> = {};
                    for (const h of game.heroes) {
                      const spend = Math.min(left, h.resources);
                      pay[h.id] = spend;
                      left -= spend;
                    }
                    setPayment(pay);
                  }
                }}
              >
                <option value="">Select a character</option>
                {playTargets(game, playCard).map((u) => (
                  <option key={u.id} value={u.id}>
                    {name(u)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <h3 className="payment-heading">
            Pay{" "}
            {card(playCard.code).cost === "X"
              ? xCost
              : card(playCard.code).cost}{" "}
            resources
          </h3>
          {playCard.code === "01067" && (
            <label className="field-label">
              Choose X
              <input
                aria-label="Choose X"
                type="number"
                min="1"
                max={game.deck.length}
                value={xCost}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setXCost(n);
                  let left = n;
                  const p: Record<string, number> = {};
                  for (const h of game.heroes) {
                    const take = Math.min(left, h.resources);
                    p[h.id] = take;
                    left -= take;
                  }
                  setPayment(p);
                }}
              />
            </label>
          )}
          {game.heroes
            .filter((h) => Object.hasOwn(payment, h.id))
            .map((h) => (
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
                  <span>{payment[h.id]}</span>
                  <button
                    disabled={payment[h.id] >= h.resources}
                    onClick={() =>
                      setPayment((p) => ({ ...p, [h.id]: p[h.id] + 1 }))
                    }
                    aria-label={`Spend more from ${name(h)}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setPlayCard(null)}>
              Cancel
            </button>
            <button
              className="primary"
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
        </Modal>
      )}
      {game && combatEnemy && (
        <Modal
          title={
            game.phase === "defense"
              ? "Choose your defender"
              : "Choose your attackers"
          }
          onClose={() => setCombatEnemy(null)}
        >
          <div className="combat-target">
            <Sword size={25} />
            <span>
              {name(
                [...game.engaged, ...game.staging].find(
                  (u) => u.id === combatEnemy,
                )!,
              )}
              <small>
                {game.phase === "defense"
                  ? "Shadow effects are revealed after choosing a defender."
                  : "Combine ready characters for one attack."}
              </small>
            </span>
          </div>
          <div className="choice-list">
            {characters(game)
              .filter(
                (u) =>
                  !u.exhausted &&
                  canFight(u) &&
                  (!game.staging.some((e) => e.id === combatEnemy) ||
                    u.code === "01009"),
              )
              .map((u) => (
                <button
                  key={u.id}
                  className={
                    (
                      game.phase === "defense" && !game.standTogether
                        ? defender === u.id
                        : attackers.includes(u.id)
                    )
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    game.phase === "defense" && !game.standTogether
                      ? setDefender(u.id)
                      : setAttackers((a) =>
                          a.includes(u.id)
                            ? a.filter((id) => id !== u.id)
                            : [...a, u.id],
                        )
                  }
                >
                  <Art c={card(u.code)} />
                  <span>
                    {name(u)}
                    <small>
                      {game.phase === "defense"
                        ? `${stats(game, u).defense} defense · ${stats(game, u).health - u.damage} hit points`
                        : `${stats(game, u).attack} attack`}
                    </small>
                  </span>
                  {(game.phase === "defense" && !game.standTogether
                    ? defender === u.id
                    : attackers.includes(u.id)) && <Check size={20} />}
                </button>
              ))}
          </div>
          {game.phase === "defense" && (
            <button
              className={`undefended ${(game.standTogether ? !attackers.length : !defender) ? "selected" : ""}`}
              onClick={() => {
                setDefender("");
                setAttackers([]);
              }}
            >
              Leave undefended · All damage goes to one hero
            </button>
          )}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setCombatEnemy(null)}>
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => {
                const ok =
                  game.phase === "defense"
                    ? dispatch({
                        type: "DEFEND",
                        enemyId: combatEnemy,
                        defenderId: defender || null,
                        defenderIds: game.standTogether ? attackers : undefined,
                      })
                    : dispatch({
                        type: "ATTACK",
                        enemyId: combatEnemy,
                        attackerIds: attackers,
                      });
                if (ok) setCombatEnemy(null);
              }}
            >
              {game.phase === "defense"
                ? "Resolve enemy attack"
                : `Attack · ${attackers.reduce(
                    (n, id) =>
                      n +
                      stats(
                        game,
                        characters(game).find((u) => u.id === id)!,
                      ).attack,
                    0,
                  )} power`}
              <Sword />
            </button>
          </div>
        </Modal>
      )}
      {showLog && game && (
        <Modal title="The chronicle" onClose={() => setShowLog(false)}>
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
        </Modal>
      )}
      {interlude && game?.campaign && (
        <Modal
          title="Prepare the next chapter"
          onClose={() => setInterlude(false)}
        >
          <p>
            Continue to{" "}
            <strong>{SCENARIOS[game.campaign.completed.length]?.name}</strong>.
            Heroes recover their damage and begin with a fresh deck. Each
            replaced hero adds +1 to your permanent starting threat penalty.
          </p>
          <div className="interlude-heroes">
            {nextHeroes.map((code, i) => (
              <label className="field-label" key={i}>
                Hero {i + 1}
                <select
                  aria-label={`Campaign hero ${i + 1}`}
                  value={code}
                  onChange={(e) =>
                    setNextHeroes((h) =>
                      h.map((old, j) => (i === j ? e.target.value : old)),
                    )
                  }
                >
                  {playerCards
                    .filter((c) => c.type_code === "hero")
                    .map((c) => (
                      <option
                        key={c.code}
                        value={c.code}
                        disabled={
                          game.campaign!.fallen.includes(c.code) ||
                          (nextHeroes.includes(c.code) && c.code !== code)
                        }
                      >
                        {c.name}
                        {game.campaign!.fallen.includes(c.code)
                          ? " · fallen"
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
          <label className="field-label">
            Player deck
            <select
              aria-label="Campaign player deck"
              value={nextDeck}
              onChange={(e) => setNextDeck(e.target.value)}
            >
              {STARTERS.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.subtitle} · {d.name}
                </option>
              ))}
            </select>
          </label>
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
              game.campaign.heroes.filter((h) => !nextHeroes.includes(h))
                .length}
            . You may replace fallen heroes and voluntarily change one other
            hero.
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
      {game && game.status !== "playing" && page === "table" && !interlude && (
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
                ? game.campaign?.completed.length === 3
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
            game.campaign.completed.length < 3 ? (
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
            {game.campaign?.completed.length === 3 && (
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
        <span>{c.completed.length} / 3 chapters</span>
      </div>
      <ol>
        {SCENARIOS.map((q) => {
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
  switch (s.phase) {
    case "setup":
      return "Inspect your six starting cards. Keep them or take one mulligan before the first resource phase.";
    case "planning":
      return "Gather allies and equip your heroes. Spend resources from heroes with a matching sphere.";
    case "quest":
      return "Select ready characters below. Keep some ready to defend the dangers ahead.";
    case "staging":
      return "The encounter has been revealed. Use available abilities or events before comparing willpower and threat.";
    case "travel":
      return s.activeLocation
        ? "You already have an active location. Continue to the encounter phase."
        : "Travel to one location in staging, or stay where you are. Check its travel cost first.";
    case "encounter":
      return s.scenarioId === "anduin" && s.stage === 2
        ? "You may engage one enemy. Automatic engagement checks are skipped on the river."
        : "You may engage one enemy by choice. Then all enemies at or below your threat engage automatically.";
    case "defense":
      return "Each enemy attacks once. Assign a ready defender; its defense reduces incoming damage.";
    case "attack":
      return "Select an enemy and combine ready characters to attack it. Each enemy can be attacked once.";
    case "refresh":
      return "The fellowship has readied. Prepare for another round beneath the trees.";
  }
}
function BoardCard({
  s,
  u,
  inspect,
  action,
  actionLabel,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
  action?: () => void;
  actionLabel?: string;
}) {
  const c = card(u.code);
  return (
    <div className={`board-card ${u.attacked ? "acted" : ""}`}>
      <button
        className="board-card-art"
        onClick={inspect}
        aria-label={`Inspect ${name(u)}`}
      >
        <Art c={c} />
        <span
          className="encounter-value"
          title={
            c.type_code === "objective"
              ? "Objective"
              : c.type_code === "enemy"
                ? "Engagement cost"
                : "Quest points"
          }
        >
          {c.type_code === "enemy" ? (
            <Crosshair size={12} />
          ) : (
            <Compass size={12} />
          )}{" "}
          {c.type_code === "objective"
            ? "Objective"
            : c.type_code === "enemy"
              ? c.engagement
              : c.quest}
        </span>
      </button>
      <div className="board-card-name">{name(u)}</div>
      {c.type_code === "enemy" ? (
        <div className="enemy-stats">
          <span>
            <Eye />
            {c.threat}
          </span>
          <span>
            <Sword />
            {stats(s, u).attack}
          </span>
          <span>
            <Shield />
            {c.defense}
          </span>
          <span className={u.damage ? "damaged" : ""}>
            <Heart />
            {(c.health ?? 0) - u.damage}
          </span>
        </div>
      ) : c.type_code === "objective" ? (
        <div className="enemy-stats">
          <span>
            <Shield />
            {objectiveFree(s, u) ? "Unguarded" : "Guarded"}
          </span>
        </div>
      ) : (
        <div className="enemy-stats">
          <span>
            <Eye />
            {c.threat}
          </span>
          <span>
            <Compass />
            {u.progress}/{c.quest}
          </span>
        </div>
      )}
      {action && (
        <button className="card-action" onClick={action}>
          {actionLabel}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
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
    selected = s.committedIds.includes(u.id) || u.committed;
  return (
    <div
      className={`character-card ${u.exhausted ? "exhausted" : ""} ${selected ? "committed" : ""}`}
    >
      <button
        className="character-art"
        onClick={
          s.phase === "quest" && !u.exhausted
            ? () => dispatch({ type: "TOGGLE_QUEST", id: u.id })
            : inspect
        }
        aria-pressed={
          s.phase === "quest" && !u.exhausted ? selected : undefined
        }
        aria-label={
          s.phase === "quest" && !u.exhausted
            ? `${selected ? "Unselect" : "Commit"} ${name(u)}`
            : `Inspect ${name(u)}`
        }
      >
        <Art c={c} />
        {selected && (
          <span className="quest-badge">
            <Feather size={12} /> Questing
          </span>
        )}
        {u.exhausted && !selected && (
          <span className="exhausted-badge">Exhausted</span>
        )}
        {c.type_code === "hero" && (
          <span className="resource-token" title={`${u.resources} resources`}>
            <Coins size={12} />
            {u.resources}
          </span>
        )}
      </button>
      <button className="character-name" onClick={inspect}>
        <Sphere sphere={c.sphere_code} />
        {name(u)}
        <Info size={11} />
      </button>
      <Stats s={s} u={u} />
      <div className="abilities">
        {availableAbilities(s, u).map((a, i) => (
          <button
            key={a.id ?? i}
            disabled={a.disabled}
            onClick={() =>
              dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
            }
          >
            <Sparkle size={11} />
            {a.label}
          </button>
        ))}
        {u.attachments
          .filter(
            (a) =>
              !["01026", "01057", "01070", "01071", "01072"].includes(a.code),
          )
          .map((a) => (
            <button
              key={a.id}
              title={plain(card(a.code).text)}
              onClick={() => inspectCard(card(a.code))}
            >
              <Diamond size={10} />
              {card(a.code).name}
            </button>
          ))}
      </div>
    </div>
  );
}
function Library({
  inspect,
  notify,
}: {
  inspect: (c: Card) => void;
  notify: (s: string) => void;
}) {
  const [catalog, setCatalog] = useState<Card[]>(playerCards);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sphere, setSphere] = useState("all");
  const [type, setType] = useState("all");
  const [scripted, setScripted] = useState(false);
  const [limit, setLimit] = useState(32);
  useEffect(() => {
    let ignore = false;
    fetch("/catalog.json")
      .then((r) => r.json())
      .then((data: Card[]) => {
        if (!ignore) setCatalog(data);
      })
      .catch(() =>
        notify("Showing the cached Core Set. The full catalog could not load."),
      )
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [notify]);
  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("https://ringsdb.com/api/public/cards/", {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (
        !Array.isArray(data) ||
        !data.every(
          (c) =>
            typeof c.code === "string" &&
            typeof c.name === "string" &&
            typeof c.type_code === "string" &&
            typeof c.sphere_code === "string",
        )
      )
        throw new Error();
      setCatalog(data);
      notify(
        `Library refreshed: ${data.length.toLocaleString()} player cards from RingsDB.`,
      );
    } catch {
      notify("RingsDB is unavailable. Your cached library is still available.");
    } finally {
      setLoading(false);
    }
  };
  const found = catalog.filter(
    (c) =>
      (c.name + " " + (c.traits ?? ""))
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (sphere === "all" || c.sphere_code === sphere) &&
      (type === "all" || c.type_code === type) &&
      (!scripted || SCRIPTED.has(c.code)),
  );
  return (
    <main id="main-content" tabIndex={-1} className="content-page library">
      <div className="page-heading">
        <div>
          <h1>The archives of Middle-earth</h1>
          <p>Discover the heroes, allies, and artifacts of your next story.</p>
        </div>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <ArrowCounterClockwise />
          {loading ? "Loading cards…" : "Refresh RingsDB"}
        </button>
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <MagnifyingGlass size={19} />
          <input
            aria-label="Search cards"
            placeholder="Search by name or trait…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(32);
            }}
          />
        </label>
        <select
          aria-label="Filter sphere"
          value={sphere}
          onChange={(e) => {
            setSphere(e.target.value);
            setLimit(32);
          }}
        >
          <option value="all">All spheres</option>
          {["leadership", "spirit", "lore", "tactics", "neutral"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter card type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setLimit(32);
          }}
        >
          <option value="all">All card types</option>
          {["hero", "ally", "attachment", "event"].map((v) => (
            <option key={v} value={v}>
              {v[0].toUpperCase() + v.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="library-summary">
        <span>
          {found.length.toLocaleString()} cards {query && `matching “${query}”`}
        </span>
        <label>
          <input
            type="checkbox"
            checked={scripted}
            onChange={(e) => {
              setScripted(e.target.checked);
              setLimit(32);
            }}
          />{" "}
          Scripted cards only
        </label>
      </div>
      <div className="catalog-grid">
        {found.slice(0, limit).map((c) => (
          <button
            className="catalog-card"
            key={c.code}
            onClick={() => inspect(c)}
          >
            <Art c={c} />
            <div>
              <span>{c.name}</span>
              <Sphere sphere={c.sphere_code} />
            </div>
            <small>
              {c.pack_name} · {c.type_code}
              {SCRIPTED.has(c.code) && <Check size={12} />}
            </small>
          </button>
        ))}
      </div>
      {found.length === 0 && (
        <div className="library-empty">
          <MagnifyingGlass size={40} weight="thin" />
          <h2>No cards on this path.</h2>
          <p>Try another name, trait, or filter.</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery("");
              setSphere("all");
              setType("all");
              setScripted(false);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {found.length > limit && (
        <button
          className="secondary load-more"
          onClick={() => setLimit((v) => v + 32)}
        >
          Show more cards <Plus size={16} />
        </button>
      )}
      <p className="library-source">
        Player-card data from{" "}
        <a href="https://ringsdb.com/api/" target="_blank" rel="noreferrer">
          RingsDB’s public API
        </a>
        . A local snapshot keeps the library available. Browsing does not imply
        gameplay support.
      </p>
    </main>
  );
}
