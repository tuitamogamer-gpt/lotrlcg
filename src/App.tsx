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
  canPlay,
  characters,
  createGame,
  needsTarget,
  playTargets,
  responseCards,
  publicState,
  questWill,
  score,
  stageInfo,
  stagingThreat,
  stats,
  validateSave,
} from "./game/engine";
import type { Action, Card, GameState, Unit } from "./game/types";

const SAVE_KEY = "there-and-back-again.save.v1",
  DECK_KEY = "there-and-back-again.deck.v1";
type Page = "adventures" | "library" | "fellowship" | "guide" | "table";
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => Promise<void>;
  }
}
const readSave = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    return validateSave(s) ? s : null;
  } catch {
    return null;
  }
};
const readDeckId = () => {
  try {
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
function CardDetail({ c, onClose }: { c: Card; onClose: () => void }) {
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
  const [game, setGame] = useState<GameState | null>(readSave);
  const [selectedDeck, setSelectedDeck] = useState(readDeckId);
  const starter = STARTERS.find((d) => d.id === selectedDeck)!;
  const deck = starter.cards;
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
  const [history, setHistory] = useState<GameState[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (game)
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      } catch {
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
          : { mode: page, savedGame: !!game, cardCount: 1315 },
      );
    window.advanceTime = () => Promise.resolve();
  }, [game, page]);
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
      const s = createGame(Date.now(), deck, starter.heroes, starter.id);
      setGame(s);
      setPage("table");
      setRestart(false);
      setHistory([]);
      setCombatEnemy(null);
    } catch (e) {
      notify((e as Error).message);
      setPage("fellowship");
    }
  };
  const nav = (p: Page) => {
    setPage(p);
    setMenu(false);
  };
  const beginPlay = (u: Unit) => {
    if (!game) return;
    const reason = canPlay(game, u);
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
    a.download = "mirkwood-adventure.json";
    a.click();
    URL.revokeObjectURL(url);
    notify("Adventure exported.");
  };
  const importSave = async (file: File) => {
    try {
      const s = JSON.parse(await file.text());
      if (!validateSave(s))
        throw new Error("This is not a valid adventure save.");
      setGame(s);
      setHistory([]);
      setPage("table");
      notify("Adventure restored.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <div className={`app ${page === "table" ? "playing" : ""}`}>
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
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
            onClick={() => nav("table")}
          >
            <Campfire size={21} />
            <span>
              {game.status === "playing"
                ? "Return to adventure"
                : "View last adventure"}
              <small>Round {game.round || 1} · Mirkwood</small>
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
            <span className="green-dot" /> SOLO ADVENTURE · v0.1
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Open navigation"
            >
              <List size={22} />
            </button>
            <span>Middle-earth</span>
            <CaretRight size={12} />
            <strong>
              {page === "table"
                ? "Passage Through Mirkwood"
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
          <main className="lobby">
            <div className="page-heading">
              <div>
                <h1>Your adventure awaits.</h1>
                <p>
                  A fellowship. An uncharted path. A story only you can tell.
                </p>
              </div>
              <span className="chapter-label">
                <Diamond size={13} /> CHAPTER I
              </span>
            </div>
            <section className="adventure-hero">
              <div className="forest-bg" />
              <Ambient />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> THE SHADOWS OF MIRKWOOD
                </div>
                <h2>
                  Into the heart
                  <br />
                  of <em>Mirkwood.</em>
                </h2>
                <p>
                  Beyond the familiar paths, an ancient
                  <br className="desktop-break" /> darkness stirs. Your journey
                  begins here.
                </p>
                <label className="starter-select">
                  YOUR FELLOWSHIP
                  <select
                    aria-label="Choose starter deck"
                    value={selectedDeck}
                    onChange={(e) => setSelectedDeck(e.target.value)}
                  >
                    {STARTERS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.subtitle} · {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary hero-cta"
                  id="start-btn"
                  onClick={() =>
                    game?.status === "playing" ? nav("table") : start()
                  }
                >
                  {game?.status === "playing"
                    ? "Continue adventure"
                    : "Begin adventure"}
                  <ArrowRight size={20} />
                </button>
                {game?.status === "playing" && (
                  <button
                    className="new-adventure"
                    onClick={() => setRestart(true)}
                  >
                    Start a new adventure <ArrowCounterClockwise size={13} />
                  </button>
                )}
              </div>
              <div className="hero-fan" aria-label="Your starting heroes">
                {[starter.heroes[1], starter.heroes[0], starter.heroes[2]].map(
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
                  <Compass size={17} /> Passage Through Mirkwood
                </span>
                <span>
                  <UsersThree size={15} /> 1 player
                </span>
                <span>
                  <Diamond size={14} /> Core Set
                </span>
                <span className="difficulty">
                  Difficulty <i className="lit" />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </section>
            <div className="lobby-lower">
              <section className="journey-panel">
                <div className="section-line">
                  <h3>The path ahead</h3>
                  <span>3 quest stages</span>
                </div>
                <div className="journey-stages">
                  {[
                    {
                      n: "I",
                      title: "Flies and Spiders",
                      text: "Step beneath the trees",
                      icon: Tree,
                    },
                    {
                      n: "II",
                      title: "A Fork in the Road",
                      text: "Follow the hidden trail",
                      icon: Compass,
                    },
                    {
                      n: "III",
                      title: "A Chosen Path",
                      text: "Face what lies beyond",
                      icon: Mountains,
                    },
                  ].map((q, i) => (
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
                    {starter.heroes.map((code) => (
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
          <main className="content-page">
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
                onClick={() =>
                  game?.status === "playing" ? setRestart(true) : start()
                }
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
          <main className="content-page guide">
            <div className="page-heading">
              <div>
                <h1>Every great journey starts here.</h1>
                <p>
                  The forest plays against you. Lead your fellowship through all
                  three quest stages.
                </p>
              </div>
              <BookOpen size={45} weight="thin" />
            </div>
            <div className="guide-intro">
              <Tree size={40} />
              <div>
                <h2>Your first adventure</h2>
                <p>
                  Passage Through Mirkwood is ready for solo play. Choose
                  Leadership, Tactics, Spirit, or Lore. Each original learning
                  deck includes its three heroes and 30 cards, including one
                  Gandalf. Win by finishing the final quest; lose if threat
                  reaches 50 or all your heroes fall.
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
                This first version scripts the original 36-card Mirkwood
                encounter deck, both final quest branches, and all 73 original
                Core Set player-card definitions across four starter decks.
                Multiplayer, campaign mode, other scenarios, and other
                player-card abilities are not implemented. The library includes
                the wider RingsDB player-card catalog for browsing.
              </p>
              <p>
                Some optional responses are presented in a fixed order. All
                selected effects resolve through visible decision prompts. Undo
                is available for local solo play; it can reveal hidden
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
          <main className="table-page">
            <div className="table-heading">
              <div>
                <button className="text-link" onClick={() => nav("adventures")}>
                  <ArrowLeft size={14} /> Adventures
                </button>
                <h1>Passage Through Mirkwood</h1>
              </div>
              <div className="table-tools">
                <span className="save-status">
                  <Check size={13} /> Saved
                </span>
                <button
                  className="icon-button"
                  aria-label="Undo last action"
                  disabled={!history.length}
                  onClick={() => {
                    const prev = history.at(-1);
                    if (prev) {
                      setGame(prev);
                      setHistory((h) => h.slice(0, -1));
                      setCombatEnemy(null);
                      notify("Last action undone.");
                    }
                  }}
                >
                  <ArrowCounterClockwise size={18} />
                </button>
                <button
                  className="secondary compact"
                  onClick={() => setShowLog(true)}
                >
                  <Scroll /> Chronicle
                </button>
              </div>
            </div>
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
                    <div key={p.key} className={active ? "active" : ""}>
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
                <span>THREAT</span>
              </div>
            </div>
            <div className="table-layout">
              <section className="gameboard">
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
                          game.phase === "travel" &&
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
                          card(u.code).type_code === "location"
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
                      {game.branch === "unknown"
                        ? "THE FOREST PATH"
                        : game.branch === "spider"
                          ? "THE SPIDER’S LAIR"
                          : "THE WAY OUT"}
                    </span>
                    <h2>{stageInfo(game).name}</h2>
                    <p>{stageInfo(game).story}</p>
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
                        dispatch={dispatch}
                      />
                    ))}
                    {game.allies.map((u) => (
                      <CharacterCard
                        key={u.id}
                        s={game}
                        u={u}
                        inspect={() => setDetail(card(u.code))}
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
                <div className="hand-zone">
                  <div className="zone-label">
                    <span>
                      <Books size={16} /> YOUR HAND <b>{game.hand.length}</b>
                    </span>
                    <span>
                      {game.deck.length} in deck · {game.discard.length}{" "}
                      discarded
                    </span>
                  </div>
                  <div className="hand-cards">
                    {game.hand.map((u) => (
                      <div
                        className={`hand-card ${canPlay(game, u) === null ? "playable" : ""}`}
                        key={u.id}
                      >
                        <button
                          className="hand-art"
                          onClick={() => setDetail(card(u.code))}
                          aria-label={`Inspect ${name(u)}`}
                        >
                          <Art c={card(u.code)} />
                        </button>
                        <button
                          className="hand-play"
                          disabled={!!canPlay(game, u)}
                          title={canPlay(game, u) ?? "Play this card"}
                          onClick={() => beginPlay(u)}
                        >
                          {card(u.code).cost}
                          <Sphere sphere={card(u.code).sphere_code} />
                          <span>
                            {responseCards.includes(u.code)
                              ? "Response"
                              : "Play card"}
                          </span>
                        </button>
                      </div>
                    ))}
                    {!game.hand.length && (
                      <div className="empty-zone">
                        Your hand is empty. Draw a card next round.
                      </div>
                    )}
                  </div>
                </div>
              </section>
              <aside className="turn-panel">
                <div className="turn-panel-top">
                  <span className="green-dot" /> YOUR TURN
                </div>
                <h2>{phaseNames[game.phase]}</h2>
                <p>{phaseHelp(game)}</p>
                {game.phase === "setup" ? (
                  <>
                    <button
                      className="primary"
                      onClick={() => dispatch({ type: "KEEP" })}
                    >
                      Keep hand <ArrowRight />
                    </button>
                    <button
                      className="secondary"
                      disabled={game.mulled}
                      onClick={() => dispatch({ type: "MULLIGAN" })}
                    >
                      Mulligan {game.mulled ? "used" : "once"}{" "}
                      <ArrowCounterClockwise />
                    </button>
                  </>
                ) : game.phase === "quest" ? (
                  <>
                    <div className="quest-equation">
                      <span>
                        <Feather />
                        {questWill(game)}
                        <small>Willpower</small>
                      </span>
                      <span className="vs">vs</span>
                      <span>
                        <Eye />
                        {stagingThreat(game)}
                        <small>Staging threat</small>
                      </span>
                    </div>
                    <button
                      className="primary"
                      onClick={() => dispatch({ type: "COMMIT" })}
                    >
                      Commit & reveal <ArrowRight />
                    </button>
                  </>
                ) : game.phase === "defense" ? (
                  <div className="turn-hint">
                    <Shield size={22} /> Choose an engaged enemy to defend
                    against.
                  </div>
                ) : game.phase === "attack" ? (
                  <button
                    className="primary"
                    onClick={() => dispatch({ type: "END_ATTACKS" })}
                  >
                    Finish combat <ArrowRight />
                  </button>
                ) : (
                  <button
                    className="primary"
                    onClick={() => dispatch({ type: "NEXT" })}
                  >
                    {game.phase === "planning"
                      ? "Begin quest"
                      : game.phase === "staging"
                        ? "Resolve quest"
                        : game.phase === "travel"
                          ? "Continue without travel"
                          : game.phase === "encounter"
                            ? "Engagement checks"
                            : "Begin next round"}
                    <ArrowRight />
                  </button>
                )}
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
      {detail && <CardDetail c={detail} onClose={() => setDetail(null)} />}
      {restart && (
        <Modal title="A new journey?" onClose={() => setRestart(false)}>
          <p>
            Your current saved adventure will be replaced. You can export it
            first to keep a copy.
          </p>
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
      {game && game.status !== "playing" && page === "table" && (
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
                ? "Mirkwood lies behind you."
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
            <button className="primary" onClick={start}>
              Begin another journey <ArrowRight />
            </button>
            <button className="text-link" onClick={() => nav("adventures")}>
              Return to adventures
            </button>
          </div>
        </Modal>
      )}
    </div>
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
      return "You may engage one enemy by choice. Then all enemies at or below your threat engage automatically.";
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
      <button className="board-card-art" onClick={inspect}>
        <Art c={c} />
        <span
          className="encounter-value"
          title={c.type_code === "enemy" ? "Engagement cost" : "Quest points"}
        >
          {c.type_code === "enemy" ? (
            <Crosshair size={12} />
          ) : (
            <Compass size={12} />
          )}{" "}
          {c.type_code === "enemy" ? c.engagement : c.quest}
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
  dispatch,
}: {
  s: GameState;
  u: Unit;
  inspect: () => void;
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
        aria-label={
          s.phase === "quest"
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
              onClick={inspect}
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
    <main className="content-page library">
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
