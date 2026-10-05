import {
  Coins,
  Compass,
  Crown,
  Heart,
  Leaf,
  Stack,
  Tree,
} from "@phosphor-icons/react";
import type { Action, Card, GameState, Unit } from "../game/types";
import { card, imageUrl, name, cachedImageSource } from "../game/cards";
import { foundationsArea } from "../game/foundations-stone-support";
import { availableAbilities, locationQuest, stageInfo } from "../game/engine";
import {
  activeSeat,
  allActiveLocations,
  seatIndices,
  seatName,
  seatView,
} from "../game/table";
import { QuestGoals } from "./experience";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedNumber, CountChange, tableSpring } from "./motion";
import carrockQuests from "../data/carrock-quest-cards.json";
import emynQuests from "../data/emyn-muil-quest-cards.json";
import { scenario } from "../game/scenarios";
import { currentQuestUnit } from "../game/quest-state";
import { collectorAbilityAnyPlayer } from "../game/collector-player-cards";
import { WATCHER_WATER } from "../game/watcher-water-support";

// Presentation only: the engine remains the source of every count and action.
export function questStageLabel(s: GameState) {
  const stage = stageInfo(s);
  const number = "questNumber" in stage ? stage.questNumber : s.stage;
  const side = "side" in stage ? stage.side : "B";
  return `${number}${side}`;
}

export function questFace(s: GameState) {
  const stage = stageInfo(s);
  if ("questImage" in stage && typeof stage.questImage === "string") {
    return cachedImageSource(stage.questImage);
  }
  if ("back_imagesrc" in stage && typeof stage.back_imagesrc === "string") {
    return cachedImageSource(stage.back_imagesrc);
  }
  if ("cardCode" in stage) {
    const quest = [...carrockQuests, ...emynQuests].find(
      (c) => c.code === stage.cardCode,
    );
    if (quest) return quest.back_imagesrc ?? quest.imagesrc;
  }
  const faces: Partial<Record<GameState["scenarioId"], string[]>> = {
    mirkwood: [
      "flies-and-spiders-1b",
      "a-fork-in-the-road-2b",
      s.branch === "spider"
        ? "a-chosen-path-dont-leave-the-path-3b"
        : "a-chosen-path-beorns-path-3b",
    ],
    anduin: ["to-the-river-1b", "anduin-passage-2b", "ambush-on-the-shore-3b"],
    "dol-guldur": [
      "the-necromancers-tower-1b",
      "through-the-caverns-2b",
      "out-of-the-dungeons-3b",
    ],
    "hunt-for-gollum": [
      "the-hunt-begins-1b",
      "a-new-terror-abroad-2b",
      "on-the-trail-3b",
    ],
  };
  const face = faces[s.scenarioId]?.[s.stage - 1];
  return face ? `/cards/quests/${face}.jpg` : "";
}

export function TableToken({
  kind,
  value,
}: {
  kind: "resource" | "damage" | "progress";
  value: number;
}) {
  const Icon = kind === "resource" ? Coins : kind === "damage" ? Heart : Leaf;
  const label = kind === "resource" ? "resources" : kind;
  return (
    <span
      className={`table-token token-${kind}`}
      title={`${value} ${label}`}
      aria-label={`${value} ${label}`}
    >
      <Icon weight="fill" size={11} aria-hidden="true" />
      <b>
        <AnimatedNumber value={value} />
      </b>
      <CountChange value={value} />
    </span>
  );
}

export function JourneyArea({
  s,
  inspect,
  inspectQuest,
  dispatch,
}: {
  s: GameState;
  inspect: (c: Card) => void;
  inspectQuest: () => void;
  dispatch?: (a: Action) => unknown;
}) {
  const q = stageInfo(s);
  const reduced = useReducedMotion();
  const active = allActiveLocations(s);
  const quest = currentQuestUnit(s);
  const resourceQuest = s.scenarioId === "the-stewards-fear" && s.stage < 3;
  const questValue = resourceQuest
    ? (s.stewardFear?.questResources ?? 0)
    : s.progress;
  const questGoal = resourceQuest ? 4 : q.quest;
  const area = s.foundationsStone?.split ? foundationsArea(s) : undefined;
  const locationCard = (u: Unit) => (
    <>
      <motion.button
        layoutId={reduced ? undefined : `card-${u.id}`}
        transition={reduced ? { duration: 0 } : tableSpring}
        className="location-card"
        onClick={() => inspect(card(u.code))}
        aria-label={`Inspect active location: ${name(u)}`}
      >
        <img
          src={imageUrl(card(u.code))}
          alt={name(u)}
          data-card-code={u.code}
        />
        <TableToken kind="progress" value={u.progress} />
        {u.damage > 0 && <TableToken kind="damage" value={u.damage} />}
      </motion.button>
      <AttachmentStack u={u} inspect={inspect} />
      {!!s.stewardFear?.underneath[u.id]?.length && (
        <span
          className="journey-underworld"
          aria-label={`${s.stewardFear.underneath[u.id].length} facedown Underworld cards`}
        >
          <Stack size={13} aria-hidden="true" />{" "}
          {s.stewardFear.underneath[u.id].length} facedown Underworld
        </span>
      )}
      {dispatch && (
        <div className="journey-location-actions">
          {availableAbilities(s, u).map((a) => (
            <button
              key={a.id ?? a.label}
              disabled={
                a.disabled ||
                !!s.choice ||
                !!s.flow?.pending ||
                s.phase === "setup"
              }
              onClick={() =>
                dispatch({ type: "ABILITY", id: u.id, attachmentId: a.id })
              }
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
  return (
    <aside className="journey-area" aria-label="Quest and active location">
      <div className="tabletop-label">
        <Compass size={13} /> THE JOURNEY{" "}
        <span>
          {s.stage} / {scenario(s.scenarioId).stages.length}
        </span>
      </div>
      {area && (
        <div className="journey-area-players">
          Staging area · {area.players.map((p) => seatName(s, p)).join(" · ")}
        </div>
      )}
      <button
        key={questFace(s)}
        className="quest-card-stack"
        onClick={inspectQuest}
        aria-label={`Inspect quest: ${q.name}`}
      >
        <img
          src={questFace(s)}
          alt={`${q.name} · side ${questStageLabel(s)}`}
        />
        <span className="quest-stage-seal">{questStageLabel(s)}</span>
      </button>
      <div
        className="tabletop-progress"
        aria-label={`Quest ${resourceQuest ? "resources" : "progress"}: ${questValue} of ${questGoal || "special objective"}`}
      >
        <TableToken
          kind={resourceQuest ? "resource" : "progress"}
          value={questValue}
        />
        <div>
          <b>
            {questGoal ? `${questValue} / ${questGoal}` : "Special objective"}
          </b>
          <span>{resourceQuest ? "Quest resources" : "Progress"}</span>
        </div>
        {questGoal > 0 && (
          <div
            className="quest-progress-track"
            role="progressbar"
            aria-label={resourceQuest ? "Quest resources" : "Quest progress"}
            aria-valuenow={questValue}
            aria-valuemin={0}
            aria-valuemax={questGoal}
          >
            <motion.span
              initial={false}
              animate={{ scaleX: Math.min(1, questValue / questGoal) }}
              transition={
                reduced ? { duration: 0 } : { duration: 0.65, ease: "easeOut" }
              }
            />
          </div>
        )}
      </div>
      {quest && <AttachmentStack u={quest} inspect={inspect} />}
      <QuestGoals s={s} />
      <div
        className={`tabletop-location ${active.length > 1 ? "multiple-active-locations" : ""}`}
      >
        <div className="tabletop-label">
          <Compass size={12} />{" "}
          {active.length > 1 ? "ACTIVE LOCATIONS" : "ACTIVE LOCATION"}
        </div>
        {active.length === 1 ? (
          <>
            {locationCard(active[0])}
            <span>
              {active[0].progress} / {locationQuest(s, active[0])} progress
            </span>
          </>
        ) : active.length > 1 ? (
          <div className="active-locations-list">
            {active.map((u) => (
              <div className="active-location-entry" key={u.id}>
                {locationCard(u)}
                <strong>{name(u)}</strong>
                <span>
                  {u.progress} / {locationQuest(s, u)} progress
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="location-slot">
            <Tree size={25} weight="thin" />
            <span>No active location</span>
            <small>Travel here from staging</small>
          </div>
        )}
      </div>
    </aside>
  );
}

export function CardBack({ encounter = false }: { encounter?: boolean }) {
  return (
    <span
      className={`table-card-back ${encounter ? "encounter-back" : "player-back"}`}
      aria-hidden="true"
    >
      <img
        className="card-back-art"
        src={`/art/premium/${encounter ? "shadow" : "fellowship"}-back.webp`}
        alt=""
        width={280}
        height={420}
        draggable={false}
      />
    </span>
  );
}

export function TableDecks({
  s,
  kind,
  openDiscard,
}: {
  s: GameState;
  kind: "player" | "encounter";
  openDiscard: () => void;
}) {
  const encounter = kind === "encounter";
  const count = encounter ? s.encounterDeck.length : s.deck.length;
  const discard = encounter ? s.encounterDiscard : s.discard;
  const top = discard.at(-1);
  return (
    <aside
      className={`table-decks ${kind}-decks`}
      aria-label={`${encounter ? "Encounter" : "Player"} deck and discard`}
    >
      <div className="deck-on-table">
        <div
          className={`physical-deck ${count ? "" : "deck-empty"}`}
          aria-label={`${count} cards in ${kind} deck`}
        >
          {count ? <CardBack encounter={encounter} /> : <Stack size={24} />}
          <b className="deck-count">
            <AnimatedNumber value={count} />
          </b>
        </div>
        <span>{encounter ? "Encounter deck" : "Your deck"}</span>
      </div>
      <button
        className={`discard-on-table ${top ? "has-cards" : ""}`}
        onClick={openDiscard}
        aria-label={`Browse ${kind} discard: ${discard.length} cards`}
      >
        <span className="discard-card">
          {top ? (
            <img
              key={`${top}-${discard.length}`}
              src={imageUrl(card(top))}
              alt={card(top).name}
            />
          ) : (
            <Stack size={21} weight="thin" />
          )}
          <b className="deck-count">
            <AnimatedNumber value={discard.length} />
          </b>
        </span>
        <span>Discard pile</span>
      </button>
    </aside>
  );
}

export function AttachmentStack({
  u,
  inspect,
}: {
  u: Unit;
  inspect: (c: Card) => void;
}) {
  const reduced = useReducedMotion();
  if (!u.attachments.length) return null;
  return (
    <div className="table-attachments" aria-label={`Attachments on ${name(u)}`}>
      {u.attachments.map((a) =>
        a.facedown ? (
          <span
            key={a.id}
            className="facedown-attachment"
            aria-label="Facedown attachment"
            title="Facedown attachment"
          >
            <CardBack encounter={card(a.code).sphere_code === "encounter"} />
            <span>Facedown attachment</span>
          </span>
        ) : (
          <motion.button
            layoutId={reduced ? undefined : `card-${a.id}`}
            transition={reduced ? { duration: 0 } : tableSpring}
            key={a.id}
            className={a.exhausted ? "attachment-exhausted" : ""}
            onClick={() =>
              inspect({
                ...card(a.code),
                attachmentResourceTokens: a.resourceTokens,
              } as Card & { attachmentResourceTokens?: number })
            }
            aria-label={`Inspect attachment: ${card(a.code).name}`}
            title={`${card(a.code).name}${a.resourceTokens !== undefined ? ` · ${a.resourceTokens} resource tokens` : ""}${a.exhausted ? " · exhausted" : ""}`}
          >
            <img
              src={imageUrl(card(a.code))}
              data-card-code={a.code}
              alt={card(a.code).name}
            />
            <span>{card(a.code).name}</span>
            {a.resourceTokens !== undefined && (
              <TableToken kind="resource" value={a.resourceTokens} />
            )}
          </motion.button>
        ),
      )}
    </div>
  );
}

export function ShadowCards({ count }: { count: number }) {
  if (!count) return null;
  return (
    <div
      className="table-shadows"
      aria-label={`${count} facedown shadow ${count === 1 ? "card" : "cards"}`}
    >
      {Array.from({ length: Math.min(count, 3) }, (_, i) => (
        <CardBack encounter key={i} />
      ))}
      {count > 1 && <span className="shadow-count">{count}</span>}
    </div>
  );
}

export function OtherFellowships({
  s,
  select,
  dispatch,
}: {
  s: GameState;
  select: (seat: number) => void;
  dispatch?: (a: Action) => unknown;
}) {
  if (!s.table || s.table.seats.length < 2) return null;
  return (
    <div
      className="other-fellowships"
      aria-label="Other fellowships at the table"
    >
      {seatIndices(s)
        .filter((i) => i !== activeSeat(s))
        .map((i) => {
          const p = seatView(s, i);
          return (
            <div
              className={`companion-company ${s.table!.seats[i].eliminated ? "eliminated" : ""}`}
              key={i}
            >
              <button
                className="companion-label"
                disabled={!!s.choice}
                onClick={() => select(i)}
                aria-label={`View ${seatName(s, i)}’s fellowship`}
              >
                {s.table!.first === i && <Crown size={11} weight="fill" />}
                {seatName(s, i)}
                <span>{p.hand.length} in hand</span>
              </button>
              <div className="companion-cards">
                {[...p.heroes, ...p.allies].map((u) => (
                  <button
                    key={u.id}
                    className={`companion-art ${u.exhausted ? "exhausted" : ""}`}
                    disabled={!!s.choice}
                    onClick={() => select(i)}
                    aria-label={`Control ${seatName(s, i)} to use ${name(u)}`}
                  >
                    <img
                      src={imageUrl(card(u.code))}
                      data-card-code={u.code}
                      alt={name(u)}
                    />
                    <span className="companion-tokens">
                      {card(u.code).type_code === "hero" && (
                        <TableToken kind="resource" value={u.resources} />
                      )}
                      {u.damage > 0 && (
                        <TableToken kind="damage" value={u.damage} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {dispatch &&
                [...p.heroes, ...p.allies]
                  .filter(
                    (u) =>
                      collectorAbilityAnyPlayer(u.code) ||
                      u.attachments.some(
                        (a) => a.code === WATCHER_WATER.wrapped,
                      ),
                  )
                  .map((u) => (
                    <div className="companion-abilities" key={u.id}>
                      {availableAbilities(s, u)
                        .filter((a) =>
                          !a.id
                            ? collectorAbilityAnyPlayer(u.code)
                            : u.attachments.some(
                                (att) =>
                                  att.id === a.id &&
                                  att.code === WATCHER_WATER.wrapped,
                              ),
                        )
                        .map((a) => (
                          <button
                            key={a.id ?? a.label}
                            disabled={
                              a.disabled ||
                              !!s.choice ||
                              !!s.flow?.pending ||
                              s.phase === "setup"
                            }
                            onClick={() =>
                              dispatch({
                                type: "ABILITY",
                                id: u.id,
                                attachmentId: a.id,
                              })
                            }
                            aria-label={`${name(u)} · ${a.label}`}
                          >
                            {name(u)} · {a.label}
                          </button>
                        ))}
                    </div>
                  ))}
              {!p.heroes.length && (
                <small>
                  {s.table!.seats[i].eliminated
                    ? "Fellowship eliminated"
                    : "Hero imprisoned"}
                </small>
              )}
            </div>
          );
        })}
    </div>
  );
}
