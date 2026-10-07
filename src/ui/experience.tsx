import { fangornCarrier } from "../game/fangorn";
import { fordsMandatoryTravel } from "../game/fords-isen";
import { druadanPlayerQuestStat } from "../game/druadan-player-cards";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AnimatedNumber, CardPresence, MovingCard } from "./motion";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowCounterClockwise,
  Books,
  Check,
  Eye,
  Feather,
  Funnel,
  Pause,
  Shield,
  Stack,
  Sword,
  X,
} from "@phosphor-icons/react";
import { card, name } from "../game/cards";
import {
  canPlay,
  availableAbilities,
  canCommit,
  stats,
  stageInfo,
  needsTarget,
  playTargets,
  questWill,
  responseCards,
  stagingThreat,
  threatOf,
  hasClue,
} from "../game/engine";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  allCharacters,
  allEngaged,
  livingSeats,
  ownerOf,
  seatName,
} from "../game/table";
import type { Action, GameState, Unit } from "../game/types";
import { emynMuilMustCommit } from "../game/emyn-muil";
import { RHOS } from "../game/rhosgobel";
import { ROAD } from "../game/road-rivendell";
import { WATCHER_WATER } from "../game/watcher-water";
import { DEAD, deadMarshesEscapeStrength } from "../game/dead-marshes";
import { KHAZAD } from "../game/khazad-dum";
import { returnMirkwoodGuard } from "../game/return-mirkwood";

const requiredQuestSelections = (s: GameState) =>
  s.phase === "quest" && emynMuilMustCommit(s)
    ? allCharacters(s).filter(
        (u) => canCommit(s, u) && !s.committedIds.includes(u.id),
      ).length
    : 0;

export function playReason(s: GameState, u: Unit): string | null {
  return (
    canPlay(s, u) ??
    (needsTarget(u) && !playTargets(s, u).length
      ? "No eligible target is available."
      : null)
  );
}

export function usePreference<T extends string>(
  key: string,
  initial: T,
  values: readonly T[],
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`there-and-back-again.${key}`) as T;
      return values.includes(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`there-and-back-again.${key}`, value);
    } catch {
      /* Preferences remain usable in memory. */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
const offTurn = (s: GameState) =>
  s.table &&
  s.table.active !== s.table.turn &&
  [
    "setup",
    "resource",
    "planning",
    "quest",
    "encounter",
    "defense",
    "attack",
  ].includes(s.phase);
export const nextAction = (s: GameState): Action | null =>
  s.flow?.pending || (s.phase === "travel" && fordsMandatoryTravel(s))
    ? null
    : s.escapeTest
      ? s.choice ||
        s.status !== "playing" ||
        s.escapeTest.phase === "committing"
        ? null
        : { type: "RESOLVE_ESCAPE" }
      : offTurn(s)
        ? { type: "SELECT_SEAT", seat: s.table!.turn }
        : s.choice || s.status !== "playing"
          ? null
          : s.phase === "setup"
            ? { type: "KEEP" }
            : s.phase === "quest"
              ? requiredQuestSelections(s)
                ? null
                : { type: "COMMIT" }
              : s.phase === "defense"
                ? null
                : s.phase === "attack"
                  ? { type: "END_ATTACKS" }
                  : { type: "NEXT" };
export const nextLabel = (s: GameState) =>
  s.phase === "travel" && fordsMandatoryTravel(s)
    ? "Travel to The King’s Road"
    : s.escapeTest
      ? s.escapeTest.phase === "preparing"
        ? "Begin escape test"
        : s.escapeTest.phase === "actions"
          ? "Resolve escape test"
          : "Choose escape characters"
      : offTurn(s)
        ? `Continue as Player ${s.table!.turn + 1}`
        : s.phase === "attack" && s.earlyAttackPlayers?.length
          ? "Continue to enemy attacks"
          : requiredQuestSelections(s) > 0
            ? `Select ${requiredQuestSelections(s)} more characters`
            : s.table &&
                [
                  "resource",
                  "planning",
                  "quest",
                  "encounter",
                  "attack",
                ].includes(s.phase)
              ? {
                  resource: "Finish resource actions",
                  planning: "Finish planning",
                  quest: "Commit this fellowship",
                  encounter: "Finish engagement choices",
                  attack: "Finish attacks",
                }[
                  s.phase as
                    "resource" | "planning" | "quest" | "encounter" | "attack"
                ]
              : {
                  setup: "Keep hand",
                  resource: "Begin planning",
                  planning: "Begin quest",
                  quest: "Commit & reveal",
                  staging: "Resolve quest",
                  travel: allActiveLocations(s).length
                    ? "Continue to encounter"
                    : "Continue without travel",
                  encounter: "Engagement checks",
                  defense: "Choose an enemy",
                  attack: "Finish combat",
                  refresh: "Begin next round",
                }[s.phase];
export function TurnActions({
  s,
  dispatch,
  review,
}: {
  s: GameState;
  dispatch: (a: Action) => unknown;
  review?: () => void;
}) {
  const action = nextAction(s);
  if (s.flow?.pending)
    return (
      <div className="turn-actions resolution-paused">
        <span>
          <Pause size={13} weight="fill" /> WAITING FOR YOU
        </span>
        <strong>{s.flow.pending.title}</strong>
        <p>The table is paused. Read the event before continuing.</p>
        <button className="primary" onClick={review}>
          Review current event <ArrowRight size={17} />
        </button>
      </div>
    );
  if (s.escapeTest)
    return (
      <div className="turn-actions escape-turn-actions">
        <p>
          {s.escapeTest.phase === "preparing"
            ? "You may use actions before choosing characters for this escape test."
            : s.escapeTest.phase === "actions"
              ? "You may play events and use abilities before dealing escape cards."
              : "Finish choosing ready characters in the escape dialog."}
        </p>
        <button
          className="primary"
          disabled={!action}
          onClick={() => action && dispatch(action)}
        >
          {nextLabel(s)} <ArrowRight size={18} />
        </button>
      </div>
    );
  if (s.table?.seats[activeSeat(s)].eliminated || offTurn(s))
    return (
      <div className="turn-actions">
        <p>
          {s.table?.seats[activeSeat(s)].eliminated
            ? "This fellowship has been eliminated."
            : "You are viewing another player’s fellowship."}
        </p>
        <button
          className="primary"
          disabled={!!s.choice}
          onClick={() => dispatch({ type: "SELECT_SEAT", seat: s.table!.turn })}
        >
          Continue as Player {s.table!.turn + 1} <ArrowRight size={18} />
        </button>
      </div>
    );
  const mandatoryTravel =
    s.phase === "travel" &&
    !allActiveLocations(s).length &&
    s.staging.some((u) => u.code === "01088");
  return (
    <div className="turn-actions">
      {s.phase === "quest" && emynMuilMustCommit(s) && (
        <p className="mandatory-quest-note" role="status">
          The Falls of Rauros: select every eligible ready character.
          {requiredQuestSelections(s) > 0
            ? ` ${requiredQuestSelections(s)} still to select.`
            : " All required characters are selected."}
        </p>
      )}
      {s.phase === "setup" && (
        <button
          className="secondary mulligan-button"
          disabled={s.mulled || !!s.choice}
          onClick={() => dispatch({ type: "MULLIGAN" })}
        >
          <ArrowCounterClockwise size={16} />
          Mulligan {s.mulled ? "used" : "once"}
        </button>
      )}
      {s.phase === "defense" || mandatoryTravel ? (
        <button
          className="primary"
          onClick={() =>
            document
              .querySelector(
                s.phase === "defense" ? ".engaged-zone" : ".encounter-zone",
              )
              ?.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
                block: "center",
              })
          }
        >
          {s.phase === "defense" ? (
            <>
              <Shield size={17} />
              Choose an enemy
            </>
          ) : (
            <>
              Travel to The East Bight
              <ArrowRight size={17} />
            </>
          )}
        </button>
      ) : (
        <button
          className="primary"
          disabled={!action}
          onClick={() => action && dispatch(action)}
        >
          {nextLabel(s)}
          <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}
export function EscapeTestSummary({ s }: { s: GameState }) {
  const test = s.escapeTest;
  if (!test) return null;
  const committed = allCharacters(s).filter((u) =>
    test.committedIds.includes(u.id),
  );
  return (
    <section
      className="escape-test-summary"
      aria-label="Escape test"
      aria-live="polite"
    >
      <div>
        <strong>{card(test.source).name} · Escape test</strong>
        <span>
          {deadMarshesEscapeStrength(s)} committed{" "}
          {test.attack ? "attack" : "willpower"} · {test.count} escape{" "}
          {test.count === 1 ? "card" : "cards"}
        </span>
      </div>
      <div className="escape-participants">
        {test.participants.map((player) => {
          const characters = committed.filter((u) => ownerOf(s, u) === player);
          const strength = characters.reduce(
            (sum, u) => sum + stats(s, u)[test.attack ? "attack" : "will"],
            0,
          );
          return (
            <span key={player}>
              <strong>
                {s.table ? `Player ${player + 1}` : "Your fellowship"}
              </strong>
              {characters.length} committed · {strength}{" "}
              {test.attack ? "attack" : "willpower"}
            </span>
          );
        })}
      </div>
      <p>
        {test.phase === "preparing"
          ? "Choose ready heroes or allies to resist the escape. They exhaust when committed."
          : test.phase === "actions"
            ? "Use actions or events, then resolve to deal escape cards."
            : "Select escape characters in the current choice, then confirm when finished."}
      </p>
    </section>
  );
}
export function QuestForecast({ s }: { s: GameState }) {
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  const committed = allCharacters(s).filter(
    (u) =>
      u.committed ||
      (s.table
        ? s.table.seats.some((p) => p.committedIds.includes(u.id))
        : s.committedIds.includes(u.id)),
  ).length;
  const stat = druadanPlayerQuestStat(s);
  const statLabel =
    stat === "attack" ? "Attack" : stat === "defense" ? "Defense" : "Willpower";
  const StatIcon =
    stat === "attack" ? Sword : stat === "defense" ? Shield : Feather;
  return (
    <div className="forecast" aria-label="Quest forecast">
      <div className="forecast-numbers">
        <span>
          <StatIcon size={17} />
          <strong>
            <AnimatedNumber value={will} />
          </strong>
          <small>{statLabel}</small>
        </span>
        <span className="forecast-vs">vs</span>
        <span>
          <Eye size={17} />
          <strong>
            <AnimatedNumber value={threat} />
          </strong>
          <small>Staging threat</small>
        </span>
      </div>
      <p
        className={
          net > 0 ? "forecast-positive" : net < 0 ? "forecast-negative" : ""
        }
      >
        {net > 0
          ? `+${net} potential progress`
          : net < 0
            ? `+${-net} potential threat`
            : `${statLabel} matches threat`}
      </p>
      <small>
        {s.phase === "quest"
          ? `${committed} selected · Encounters can change this.`
          : "After available actions, resolve the quest."}
      </small>
    </div>
  );
}
export function Hand({
  s,
  inspect,
  play,
  dispatch,
  art,
  onPiles,
}: {
  s: GameState;
  inspect: (u: Unit) => void;
  play: (u: Unit) => void;
  dispatch: (a: Action) => unknown;
  art: (u: Unit) => ReactNode;
  onPiles: () => void;
}) {
  const [sort, setSort] = usePreference("hand-sort", "draw", [
    "draw",
    "cost",
    "name",
    "type",
  ] as const);
  const [onlyPlayable, setOnlyPlayable] = useState(false);
  const handActionable = (u: Unit) =>
    !playReason(s, u) || availableAbilities(s, u).some((a) => !a.disabled);
  const playable = s.hand.filter(handActionable).length;
  const cards = [...s.hand]
    .filter((u) => !onlyPlayable || handActionable(u))
    .sort((a, b) =>
      sort === "cost"
        ? (Number(card(a.code).cost) || 0) - (Number(card(b.code).cost) || 0)
        : sort === "name"
          ? name(a).localeCompare(name(b))
          : sort === "type"
            ? card(a.code).type_code.localeCompare(card(b.code).type_code)
            : 0,
    );
  return (
    <div
      className="hand-zone"
      id="your-hand"
      tabIndex={-1}
      aria-label="Your hand"
    >
      <div className="zone-label">
        <span>
          <Books size={17} />
          {s.table
            ? `${seatName(s, activeSeat(s)).toUpperCase()}’S HAND`
            : "YOUR HAND"}{" "}
          <b>{s.hand.length}</b>
        </span>
        <button className="pile-link" onClick={onPiles}>
          <Stack size={15} />
          {s.deck.length} in deck · {s.discard.length} discarded
        </button>
      </div>
      <div className="hand-toolbar">
        <button
          className="filter-toggle"
          aria-pressed={onlyPlayable}
          onClick={() => setOnlyPlayable(!onlyPlayable)}
        >
          <Funnel size={14} />
          {playable} playable now{onlyPlayable && <X size={12} />}
        </button>
        <label>
          Sort
          <select
            aria-label="Sort hand"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
          >
            <option value="draw">Draw order</option>
            <option value="cost">Resource cost</option>
            <option value="name">Name</option>
            <option value="type">Card type</option>
          </select>
        </label>
      </div>
      <motion.div layoutScroll className="hand-cards">
        <CardPresence>
          {cards.map((u, i) => {
            const reason = playReason(s, u);
            return (
              <MovingCard
                key={u.id}
                id={u.id}
                order={i}
                className={`hand-card ${handActionable(u) ? "playable" : ""}`}
              >
                <button
                  className="hand-art"
                  onClick={() => inspect(u)}
                  aria-label={`Inspect ${name(u)}`}
                  aria-description={reason ?? "Playable now"}
                  title={`${name(u)}${reason ? ` · ${reason}` : " · Playable now"}`}
                >
                  {art(u)}
                </button>
                {!reason && (
                  <button
                    className="hand-play"
                    title="Play this card"
                    onClick={() => play(u)}
                  >
                    {responseCards.includes(u.code) ? (
                      <>
                        <Shield size={13} />
                        Response
                      </>
                    ) : (
                      <>
                        <PlusIcon />
                        Play card
                        <ArrowRight size={13} />
                      </>
                    )}
                  </button>
                )}
                {availableAbilities(s, u).map((a) => (
                  <button
                    key={a.id ?? a.label}
                    className="hand-play hand-ability"
                    disabled={a.disabled || !!s.choice || !!s.flow?.pending}
                    onClick={() =>
                      dispatch({
                        type: "ABILITY",
                        id: u.id,
                        attachmentId: a.id,
                      })
                    }
                  >
                    {a.label}
                  </button>
                ))}
              </MovingCard>
            );
          })}
        </CardPresence>
        {!cards.length && (
          <div className="empty-zone hand-empty">
            <Books size={26} />
            <span>
              {onlyPlayable && s.hand.length
                ? "No cards are playable in this action window."
                : "Your hand is empty. Draw a card next round."}
            </span>
            {onlyPlayable && s.hand.length > 0 && (
              <button
                className="text-link"
                onClick={() => setOnlyPlayable(false)}
              >
                Show all cards
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">+</span>;
}
export function CardHoverPreview({ enabled }: { enabled: boolean }) {
  const [preview, setPreview] = useState<{
    src: string;
    name: string;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPreview(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      clearTimeout(timer);
      setPreview(null);
    };
    const over = (e: PointerEvent) => {
      if (
        e.pointerType !== "mouse" ||
        innerWidth < 1050 ||
        document.querySelector("dialog[open]")
      )
        return;
      const image = (e.target as Element).closest<HTMLImageElement>(
        "img[data-card-code]",
      );
      if (!image || image.closest(".hero-fan")) return;
      clearTimeout(timer);
      const rect = image.getBoundingClientRect(),
        width = 248,
        height = 420;
      timer = setTimeout(
        () =>
          setPreview({
            src: image.src,
            name: image.alt,
            left:
              rect.right + width + 20 < innerWidth
                ? rect.right + 14
                : Math.max(12, rect.left - width - 14),
            top: Math.max(
              12,
              Math.min(innerHeight - height - 12, rect.top - 40),
            ),
          }),
        350,
      );
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", clear);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    document.addEventListener("click", clear);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", clear);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
      document.removeEventListener("click", clear);
    };
  }, [enabled]);
  return preview ? (
    <div
      className="hover-preview"
      aria-hidden="true"
      style={{ left: preview.left, top: preview.top }}
    >
      <img src={preview.src} alt="" />
      <span>
        {preview.name}
        <small>Click to inspect</small>
      </span>
    </div>
  ) : null;
}
export function QuestGoals({ s }: { s: GameState }) {
  if (s.fangorn) {
    const captured = !!fangornCarrier(s),
      target = s.stage === 1 ? 9 : s.stage === 2 ? 12 : 6;
    return (
      <div className="quest-goals">
        <span className={captured ? "done" : ""}>
          {captured ? <Check size={12} /> : <Shield size={12} />} Capture Mugash
          on a hero
        </span>
        <span className={s.progress >= target ? "done" : ""}>
          <Shield size={12} />
          {s.stage === 3
            ? "Place quest progress while holding Mugash, reaching at least 6"
            : `Reach ${target} quest progress before time runs out`}
        </span>
      </div>
    );
  }
  if (s.catchOrc) {
    const captured = allHeroes(s).some((h) =>
      h.attachments.some((a) => card(a.code).name === "Mugash"),
    );
    const found =
      captured ||
      [...s.staging, ...allEngaged(s)].some(
        (u) => card(u.code).name === "Mugash",
      );
    const goals =
      s.stage < 3
        ? [
            { label: "Find Mugash in an out-of-play deck", done: found },
            {
              label: "Quest beyond the active location, then choose to advance",
              done: false,
            },
          ]
        : [
            { label: "Capture Mugash on a hero", done: captured },
            {
              label: "Place 15 quest progress while guarding him",
              done: s.progress >= 15,
            },
          ];
    return (
      <div className="quest-goals">
        {goals.map((g) => (
          <span key={g.label} className={g.done ? "done" : ""}>
            {g.done ? <Check size={12} /> : <Shield size={12} />} {g.label}
          </span>
        ))}
      </div>
    );
  }
  const objectives = allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => ["01108", "01109", "01110"].includes(a.code)).length;
  const fear = [...s.staging, ...allEngaged(s)].find(
    (u) => u.code === KHAZAD.nameless,
  );
  const eagle = allCharacters(s).find((u) => u.code === RHOS.wilyador);
  const athelas = allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => a.code === RHOS.athelas).length;
  const gollum = s.staging.find((u) => u.code === DEAD.gollum);
  const goals =
    s.scenarioId === "anduin"
      ? s.stage === 1
        ? [
            {
              label: "Defeat every Hill Troll",
              done: ![...s.staging, ...allEngaged(s)].some(
                (u) => u.code === "01082",
              ),
            },
          ]
        : s.stage === 2
          ? [
              {
                label: `${livingSeats(s).length + 1} encounter reveals each quest phase`,
                done: false,
              },
            ]
          : [
              {
                label: "Defeat every remaining enemy",
                done: ![...s.staging, ...allEngaged(s)].some(
                  (u) => card(u.code).type_code === "enemy",
                ),
              },
            ]
      : s.scenarioId === "dol-guldur"
        ? [
            {
              label: `Objectives claimed · ${objectives}/3`,
              done: objectives === 3,
            },
            { label: "Rescue the prisoner", done: !s.prisoner },
            { label: "Defeat the Nazgûl", done: s.nazgulDefeated },
          ]
        : s.scenarioId === "hunt-for-gollum"
          ? [
              {
                label: `Heroes holding a Clue · ${allHeroes(s).filter(hasClue).length}`,
                done: allHeroes(s).some(hasClue),
              },
              ...(s.stage === 3
                ? [{ label: "Place 8 progress on the trail", done: false }]
                : []),
            ]
          : s.scenarioId === "conflict-at-the-carrock"
            ? s.stage === 1
              ? [
                  {
                    label: "Place 7 quest progress to activate The Carrock",
                    done: s.progress >= 7,
                  },
                ]
              : [
                  { label: "Place 1 quest progress", done: s.progress >= 1 },
                  {
                    label: `Trolls remaining · ${[...s.staging, ...allEngaged(s)].filter((u) => card(u.code).type_code === "enemy" && card(u.code).traits?.includes("Troll")).length}`,
                    done: ![...s.staging, ...allEngaged(s)].some(
                      (u) =>
                        card(u.code).type_code === "enemy" &&
                        card(u.code).traits?.includes("Troll"),
                    ),
                  },
                ]
            : s.scenarioId === "journey-to-rhosgobel"
              ? [
                  {
                    label: `Wilyador · ${eagle ? Math.max(0, stats(s, eagle).health - eagle.damage) : 0}/${eagle ? stats(s, eagle).health : 20} HP`,
                    done: !!eagle && eagle.damage < stats(s, eagle).health,
                  },
                  {
                    label: `Athelas held · ${athelas} (${athelas * 5} healing)`,
                    done: !!eagle && athelas * 5 >= eagle.damage,
                  },
                  ...(s.stage === 3
                    ? [
                        {
                          label: "Heal every Wilyador wound",
                          done: !!eagle && eagle.damage === 0,
                        },
                      ]
                    : [
                        {
                          label: `Place ${stageInfo(s).quest} quest progress`,
                          done: s.progress >= stageInfo(s).quest,
                        },
                      ]),
                  ...(s.staging.some((u) => u.code === RHOS.rhosgobel)
                    ? [
                        {
                          label:
                            "Rhosgobel in staging prevents Wilyador healing",
                          done: false,
                        },
                      ]
                    : []),
                  ...(s.stage === 2
                    ? [
                        {
                          label:
                            "Healing Wilyador removes its source card from the game",
                          done: false,
                        },
                      ]
                    : []),
                ]
              : s.scenarioId === "dead-marshes"
                ? [
                    {
                      label: gollum
                        ? `Gollum escape tokens · ${gollum.resources}/8`
                        : "Gollum has escaped into the encounter deck",
                      done: !!gollum && gollum.resources < 8,
                    },
                    {
                      label:
                        s.stage === 1
                          ? `Place ${stageInfo(s).quest} progress with Gollum in staging`
                          : "Pass the final capture escape test",
                      done:
                        s.stage === 1 &&
                        !!gollum &&
                        s.progress >= stageInfo(s).quest,
                    },
                  ]
                : s.scenarioId === "hills-of-emyn-muil"
                  ? [
                      {
                        label: `Victory points · ${s.victory}/20`,
                        done: s.victory >= 20,
                      },
                      {
                        label: "Explore every Emyn Muil location",
                        done: ![...s.staging, ...allActiveLocations(s)].some(
                          (u) =>
                            card(u.code).type_code === "location" &&
                            card(u.code).traits?.includes("Emyn Muil"),
                        ),
                      },
                      {
                        label: "Place 1 quest progress",
                        done: s.progress >= 1,
                      },
                    ]
                  : s.scenarioId === "return-to-mirkwood"
                    ? [
                        {
                          label: `Gollum's guard · ${returnMirkwoodGuard(s) === undefined ? "No guard" : seatName(s, returnMirkwoodGuard(s)!)}`,
                          done: returnMirkwoodGuard(s) !== undefined,
                        },
                        {
                          label: `Place ${stageInfo(s).quest} quest progress`,
                          done: s.progress >= stageInfo(s).quest,
                        },
                        ...(s.stage === 2 && livingSeats(s).length > 1
                          ? [
                              {
                                label: "Gollum's guard cannot quest",
                                done: false,
                              },
                            ]
                          : []),
                        ...(s.stage === 3
                          ? [
                              {
                                label: "Gollum's guard cannot play cards",
                                done: false,
                              },
                            ]
                          : []),
                        ...(s.stage === 4
                          ? [
                              {
                                label: "Defeat every enemy in play",
                                done: ![...s.staging, ...allEngaged(s)].some(
                                  (u) => card(u.code).type_code === "enemy",
                                ),
                              },
                            ]
                          : []),
                      ]
                    : s.scenarioId === "into-the-pit"
                      ? [
                          {
                            label: `Place ${stageInfo(s).quest} quest progress${s.stage === 2 ? " or defeat every enemy" : ""}`,
                            done:
                              s.progress >= stageInfo(s).quest ||
                              (s.stage === 2 &&
                                ![...s.staging, ...allEngaged(s)].some(
                                  (u) => card(u.code).type_code === "enemy",
                                )),
                          },
                          ...(s.stage === 1
                            ? [
                                {
                                  label: "Explore the Bridge of Khazad-dûm",
                                  done: !!s.khazad?.victoryCards.includes(
                                    KHAZAD.bridge,
                                  ),
                                },
                              ]
                            : []),
                          ...(s.stage === 3
                            ? [
                                {
                                  label:
                                    "Heroes collect no resources during the resource phase",
                                  done: false,
                                },
                              ]
                            : []),
                        ]
                      : s.scenarioId === "the-seventh-level"
                        ? [
                            {
                              label: `Place ${stageInfo(s).quest} quest progress`,
                              done: s.progress >= stageInfo(s).quest,
                            },
                            ...(s.stage === 1
                              ? [
                                  {
                                    label: `Book of Mazarbul · ${allHeroes(s).find((h) => h.attachments.some((a) => a.code === KHAZAD.book))?.code ? name(allHeroes(s).find((h) => h.attachments.some((a) => a.code === KHAZAD.book))!) : "Unclaimed"}`,
                                    done: allHeroes(s).some((h) =>
                                      h.attachments.some(
                                        (a) => a.code === KHAZAD.book,
                                      ),
                                    ),
                                  },
                                ]
                              : []),
                          ]
                        : s.scenarioId === "flight-from-moria"
                          ? [
                              {
                                label: fear
                                  ? `The Nameless Fear · ${stats(s, fear).attack} attack / ${stats(s, fear).defense} defense / ${threatOf(s, fear)} threat`
                                  : "The Nameless Fear is not in staging",
                                done: false,
                              },
                              {
                                label: `Quest routes remaining · ${s.khazad?.questDeck.length ?? 0}`,
                                done: false,
                              },
                              ...(s.khazad?.questSide === "A" && s.stage === 2
                                ? [
                                    {
                                      label:
                                        "Turn this route over at the beginning of staging",
                                      done: false,
                                    },
                                  ]
                                : []),
                              ...(s.khazad?.activeQuest === KHAZAD.darkness &&
                              s.khazad.questSide === "B"
                                ? [
                                    {
                                      label: `Abandoned Tools · ${s.progress}/${stageInfo(s).quest} progress during refresh`,
                                      done: s.progress >= stageInfo(s).quest,
                                    },
                                  ]
                                : []),
                              ...(s.khazad?.activeQuest === KHAZAD.blocked &&
                              s.khazad.questSide === "B"
                                ? [
                                    {
                                      label: `Escape at ${stageInfo(s).quest} progress`,
                                      done: s.progress >= stageInfo(s).quest,
                                    },
                                  ]
                                : []),
                            ]
                          : s.scenarioId === "redhorn-gate"
                            ? [
                                {
                                  label: `Place ${stageInfo(s).quest} quest progress`,
                                  done: s.progress >= stageInfo(s).quest,
                                },
                                {
                                  label: "Keep Arwen Undómiel in play",
                                  done: allCharacters(s).some(
                                    (u) =>
                                      card(u.code)
                                        .name.normalize("NFD")
                                        .replace(/[\u0300-\u036f]/g, "") ===
                                        "Arwen Undomiel" &&
                                      card(u.code).type_code ===
                                        "objective-ally",
                                  ),
                                },
                                ...(s.stage === 3
                                  ? [
                                      {
                                        label: `Victory points · ${s.victory}/5`,
                                        done: s.victory >= 5,
                                      },
                                      {
                                        label:
                                          "Characters with 0 willpower are discarded",
                                        done: false,
                                      },
                                    ]
                                  : []),
                              ]
                            : s.scenarioId === "road-to-rivendell"
                              ? [
                                  {
                                    label: `Place ${stageInfo(s).quest} quest progress`,
                                    done: s.progress >= stageInfo(s).quest,
                                  },
                                  {
                                    label: "Keep Arwen Undómiel in play",
                                    done: allCharacters(s).some(
                                      (u) => u.code === ROAD.arwen,
                                    ),
                                  },
                                  ...(allActiveLocations(s).some(
                                    (u) => u.code === ROAD.gate,
                                  )
                                    ? [
                                        {
                                          label:
                                            "Goblin Gate: the first revealed enemy each round ambushes the fellowship",
                                          done: false,
                                        },
                                      ]
                                    : []),
                                  ...(s.stage === 3
                                    ? [
                                        {
                                          label:
                                            "Characters cannot be healed during this stage",
                                          done: false,
                                        },
                                      ]
                                    : []),
                                ]
                              : s.scenarioId === "shadow-and-flame"
                                ? [
                                    ...(stageInfo(s).quest > 0
                                      ? [
                                          {
                                            label: `Place ${stageInfo(s).quest} quest progress`,
                                            done:
                                              s.progress >= stageInfo(s).quest,
                                          },
                                        ]
                                      : []),
                                    {
                                      label:
                                        "Durin’s Bane is considered engaged with each player at threat 1 or higher",
                                      done: false,
                                    },
                                    ...(s.stage === 3
                                      ? [
                                          {
                                            label:
                                              "Dark Pit: during refresh, exhaust 1–3 ready characters and discard that many deck cards",
                                            done: false,
                                          },
                                          {
                                            label:
                                              "Their total printed cost must exceed Durin’s Bane’s remaining hit points",
                                            done: false,
                                          },
                                        ]
                                      : []),
                                  ]
                                : s.scenarioId === "the-long-dark"
                                  ? [
                                      {
                                        label: `Place ${stageInfo(s).quest} quest progress`,
                                        done: s.progress >= stageInfo(s).quest,
                                      },
                                      ...(s.stage === 1
                                        ? [
                                            {
                                              label:
                                                "Each location has +1 threat during this stage",
                                              done: false,
                                            },
                                          ]
                                        : []),
                                      {
                                        label: s.longDark?.locate
                                          ? `${s.longDark.locate.source} · Locate test in progress`
                                          : "Locate: discard one own hand card per attempt; an encounter card marked PASS passes",
                                        done: false,
                                      },
                                    ]
                                  : s.scenarioId === "watcher-in-the-water"
                                    ? [
                                        {
                                          label: `Place ${stageInfo(s).quest} quest progress`,
                                          done:
                                            s.progress >= stageInfo(s).quest,
                                        },
                                        ...(s.stage === 2
                                          ? [
                                              {
                                                label: `Victory points · ${s.victory}/3`,
                                                done: s.victory >= 3,
                                              },
                                              {
                                                label:
                                                  "Defeat The Watcher or open Doors of Durin",
                                                done: (
                                                  s.victoryCards ?? []
                                                ).some((code) =>
                                                  [
                                                    WATCHER_WATER.watcher,
                                                    WATCHER_WATER.doors,
                                                  ].includes(code),
                                                ),
                                              },
                                              {
                                                label:
                                                  "Doors: discard cards matching the encounter card's first letter",
                                                done: false,
                                              },
                                            ]
                                          : []),
                                        ...(allCharacters(s).some((u) =>
                                          u.attachments.some(
                                            (a) =>
                                              a.code === WATCHER_WATER.wrapped,
                                          ),
                                        )
                                          ? [
                                              {
                                                label:
                                                  "Rescue Wrapped heroes during combat before the round ends",
                                                done: false,
                                              },
                                            ]
                                          : []),
                                      ]
                                    : s.scenarioId === "mirkwood" &&
                                        s.stage === 3
                                      ? [
                                          {
                                            label:
                                              s.branch === "spider"
                                                ? "Defeat Ungoliant’s Spawn"
                                                : "Keep Ungoliant’s Spawn out of play",
                                            done:
                                              s.branch === "spider"
                                                ? s.status === "won"
                                                : !s.staging
                                                    .concat(allEngaged(s))
                                                    .some(
                                                      (u) => u.code === "01076",
                                                    ),
                                          },
                                        ]
                                      : [];
  return goals.length ? (
    <div className="quest-goals">
      {goals.map((g) => (
        <span key={g.label} className={g.done ? "done" : ""}>
          {g.done ? <Check size={12} /> : <Shield size={12} />} {g.label}
        </span>
      ))}
    </div>
  ) : null;
}
