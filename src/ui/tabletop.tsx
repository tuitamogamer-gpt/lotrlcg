import {
  Coins,
  Compass,
  Crown,
  Eye,
  Heart,
  Leaf,
  Stack,
  Tree,
} from "@phosphor-icons/react";
import type { Card, GameState, Unit } from "../game/types";
import { card, imageUrl, name } from "../game/cards";
import { stageInfo } from "../game/engine";
import { activeSeat, seatIndices, seatName, seatView } from "../game/table";
import { QuestGoals } from "./experience";

// Presentation only: the engine remains the source of every count and action.
export function questFace(s: GameState) {
  const faces = {
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
  };
  return `/cards/quests/${faces[s.scenarioId][s.stage - 1]}.jpg`;
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
      <b>{value}</b>
    </span>
  );
}

export function JourneyArea({
  s,
  inspect,
  inspectQuest,
}: {
  s: GameState;
  inspect: (c: Card) => void;
  inspectQuest: () => void;
}) {
  const q = stageInfo(s);
  return (
    <aside className="journey-area" aria-label="Quest and active location">
      <div className="tabletop-label">
        <Compass size={13} /> THE JOURNEY <span>{s.stage} / 3</span>
      </div>
      <button
        className="quest-card-stack"
        onClick={inspectQuest}
        aria-label={`Inspect quest: ${q.name}`}
      >
        <img src={questFace(s)} alt={`${q.name} · side ${s.stage}B`} />
        <span className="quest-stage-seal">{s.stage}B</span>
      </button>
      <div className="tabletop-quest-title">
        <h2>{q.name}</h2>
        <span>Current quest</span>
      </div>
      <div
        className="tabletop-progress"
        aria-label={`Quest progress: ${s.progress} of ${q.quest || "special objective"}`}
      >
        <TableToken kind="progress" value={s.progress} />
        <div>
          <b>{q.quest ? `${s.progress} / ${q.quest}` : "Special objective"}</b>
          <span>Quest progress</span>
        </div>
        {q.quest > 0 && <progress value={s.progress} max={q.quest} />}
      </div>
      <QuestGoals s={s} />
      <div className="tabletop-location">
        <div className="tabletop-label">
          <Compass size={12} /> ACTIVE LOCATION
        </div>
        {s.activeLocation ? (
          <>
            <button
              className="location-card"
              onClick={() => inspect(card(s.activeLocation!.code))}
              aria-label={`Inspect active location: ${name(s.activeLocation)}`}
            >
              <img
                src={imageUrl(card(s.activeLocation.code))}
                alt={name(s.activeLocation)}
                data-card-code={s.activeLocation.code}
              />
              <TableToken kind="progress" value={s.activeLocation.progress} />
            </button>
            <strong>{name(s.activeLocation)}</strong>
            <span>
              {s.activeLocation.progress} / {card(s.activeLocation.code).quest}{" "}
              progress
            </span>
            <small>Explore before advancing the quest.</small>
          </>
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

function CardBack({ encounter = false }: { encounter?: boolean }) {
  return (
    <span
      className={`table-card-back ${encounter ? "encounter-back" : "player-back"}`}
      aria-hidden="true"
    >
      <span className="back-ornament">
        {encounter ? (
          <Eye size={29} weight="thin" />
        ) : (
          <Tree size={29} weight="thin" />
        )}
      </span>
      <span>{encounter ? "SHADOW" : "FELLOWSHIP"}</span>
      <i />
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
          <b className="deck-count">{count}</b>
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
            <img src={imageUrl(card(top))} alt={card(top).name} />
          ) : (
            <Stack size={21} weight="thin" />
          )}
          <b className="deck-count">{discard.length}</b>
        </span>
        <span>Discard pile</span>
      </button>
    </aside>
  );
}

export function ThreatCounter({ s }: { s: GameState }) {
  const digits = String(s.threat).padStart(2, "0").split("");
  return (
    <div
      className={`physical-threat ${s.threat >= 40 ? "danger" : ""}`}
      role="meter"
      aria-label="Threat level"
      aria-valuenow={s.threat}
      aria-valuemin={0}
      aria-valuemax={50}
    >
      <div className="threat-counter-heading">
        <Eye size={13} /> THREAT LEVEL
      </div>
      <div className="threat-wheels" aria-hidden="true">
        {digits.map((n, i) => (
          <div className="threat-wheel" key={i}>
            <small>{(Number(n) + 9) % 10}</small>
            <strong>{n}</strong>
            <small>{(Number(n) + 1) % 10}</small>
          </div>
        ))}
      </div>
      <span>50 ends this fellowship’s journey</span>
    </div>
  );
}

export function AttachmentStack({
  u,
  inspect,
}: {
  u: Unit;
  inspect: (c: Card) => void;
}) {
  if (!u.attachments.length) return null;
  return (
    <div className="table-attachments" aria-label={`Attachments on ${name(u)}`}>
      {u.attachments.map((a) => (
        <button
          key={a.id}
          className={a.exhausted ? "attachment-exhausted" : ""}
          onClick={() => inspect(card(a.code))}
          aria-label={`Inspect attachment: ${card(a.code).name}`}
          title={`${card(a.code).name}${a.exhausted ? " · exhausted" : ""}`}
        >
          <img
            src={imageUrl(card(a.code))}
            data-card-code={a.code}
            alt={card(a.code).name}
          />
          <span>{card(a.code).name}</span>
        </button>
      ))}
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
      <span>
        {count} shadow{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function OtherFellowships({
  s,
  select,
}: {
  s: GameState;
  select: (seat: number) => void;
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
