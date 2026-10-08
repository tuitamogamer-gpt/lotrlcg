import { useEffect, useRef } from "react";
import { Check } from "@phosphor-icons/react";
import { encounterCards } from "../game/cards";
import { cardProductInfo } from "../game/products";
import { SCENARIOS, scenario } from "../game/scenarios";
import type { ScenarioId } from "../game/types";

type Scenario = (typeof SCENARIOS)[number];

/** The product that first printed a quest: "Core Set", a cycle name, or the pack. */
export const scenarioRelease = (id: ScenarioId) => {
  const q = scenario(id);
  const c = encounterCards.find((c) => c.encounter_set === q.sets[0]);
  const origin = c ? cardProductInfo(c).original : null;
  return origin?.cycle ?? origin?.name ?? c?.pack_name ?? q.name;
};

/** Two-line adventure titles: a lead line, then an emphasised destination. */
const HEADLINES: Partial<
  Record<ScenarioId, { lead: string; tail?: string; em: string }>
> = {
  "the-three-trials": { lead: "Undertake", em: "the Three Trials." },
  "the-dunland-trap": { lead: "Survive the", em: "Dunland Trap." },
  "into-fangorn": { lead: "Escape from", em: "Fangorn." },
  "fords-of-isen": { lead: "Stand at", tail: "the ", em: "Fords of Isen." },
  "to-catch-an-orc": {
    lead: "Hunt through",
    tail: "the heights of ",
    em: "Methedras.",
  },
  mirkwood: { lead: "Into the heart", tail: "of ", em: "Mirkwood." },
  anduin: { lead: "Along the", em: "great river." },
  "dol-guldur": { lead: "Escape from", em: "Dol Guldur." },
  "hunt-for-gollum": { lead: "On the trail", tail: "of ", em: "Gollum." },
  "conflict-at-the-carrock": { lead: "Trolls at", em: "the Carrock." },
  "journey-to-rhosgobel": { lead: "A journey", tail: "to ", em: "Rhosgobel." },
  "hills-of-emyn-muil": { lead: "The hills of", em: "Emyn Muil." },
  "dead-marshes": { lead: "Through the", em: "Dead Marshes." },
  "return-to-mirkwood": { lead: "Return to", em: "Mirkwood." },
  "into-the-pit": { lead: "Descend into", em: "the pit." },
  "the-seventh-level": { lead: "Down to the", em: "seventh level." },
  "flight-from-moria": { lead: "Flight from", em: "Moria." },
  "redhorn-gate": { lead: "Over the", em: "Redhorn Gate." },
  "road-to-rivendell": { lead: "The road", tail: "to ", em: "Rivendell." },
  "watcher-in-the-water": { lead: "The Watcher", em: "in the Water." },
  "the-long-dark": { lead: "Through the", em: "long dark." },
  "foundations-of-stone": { lead: "Foundations", em: "of stone." },
  "shadow-and-flame": { lead: "Against shadow", em: "and flame." },
  "peril-in-pelargir": { lead: "Peril in", em: "Pelargir." },
  "into-ithilien": { lead: "The road into", em: "Ithilien." },
  "siege-of-cair-andros": { lead: "The siege of", em: "Cair Andros." },
  "the-stewards-fear": { lead: "The Steward’s", em: "fear." },
  "the-druadan-forest": { lead: "Through the", em: "Drúadan Forest." },
  "encounter-at-amon-din": { lead: "Rescue at", em: "Amon Dîn." },
  "assault-on-osgiliath": { lead: "The assault on", em: "Osgiliath." },
};

/** The adventure panel title for any quest; unknown quests split their name. */
export function QuestHeadline({ id }: { id: ScenarioId }) {
  const words = scenario(id).name.split(" ");
  const headline = HEADLINES[id] ?? {
    lead: words.slice(0, -1).join(" "),
    em: `${words.at(-1)}.`,
  };
  return (
    <>
      {headline.lead}
      <br />
      {headline.tail}
      <em>{headline.em}</em>
    </>
  );
}

/** Quests grouped by release, in the order the chapters are numbered. */
const RELEASE_GROUPS = SCENARIOS.reduce<{ name: string; quests: Scenario[] }[]>(
  (groups, q) => {
    const name = scenarioRelease(q.id);
    const group = groups.find((g) => g.name === name);
    if (group) group.quests.push(q);
    else groups.push({ name, quests: [q] });
    return groups;
  },
  [],
);

/**
 * A table of contents for every automated quest. The list scrolls inside its
 * own frame so the adventure panel beside it keeps a readable height, and the
 * chosen chapter is brought into view without moving the page.
 */
export function QuestIndex({
  selected,
  locked,
  completed,
  onSelect,
}: {
  selected: ScenarioId;
  /** Campaign play keeps the current chapter and greys out the rest. */
  locked: boolean;
  completed: readonly ScenarioId[];
  onSelect: (id: ScenarioId) => void;
}) {
  const index = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = index.current;
    const current = list?.querySelector<HTMLElement>(".mission-card.selected");
    if (!list || !current) return;
    const headerRoom = 48;
    const top = current.offsetTop - headerRoom;
    const bottom = current.offsetTop + current.offsetHeight;
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = Math.max(
        0,
        current.offsetTop - list.clientHeight / 2 + current.offsetHeight / 2,
      );
  }, [selected]);
  return (
    <section className="mission-selection" aria-label="Missions">
      <div className="mission-index" ref={index}>
        {RELEASE_GROUPS.map((group) => (
          <div
            className="mission-group"
            key={group.name}
            role="group"
            aria-label={group.name}
          >
            <h3>{group.name}</h3>
            {group.quests.map((q) => {
              const done = completed.includes(q.id);
              return (
                <button
                  key={q.id}
                  className={`mission-card mission-${q.id}${selected === q.id ? " selected" : ""}`}
                  aria-pressed={selected === q.id}
                  disabled={locked && q.id !== selected}
                  onClick={() => onSelect(q.id)}
                >
                  <span className="mission-number" aria-hidden="true">
                    {done ? <Check size={16} weight="bold" /> : q.chapter}
                  </span>
                  <span className="mission-text">
                    <strong>{q.name}</strong>
                    <em>{q.tagline}</em>
                  </span>
                  <small
                    className="mission-difficulty"
                    aria-label={
                      done
                        ? "Chapter complete"
                        : `Difficulty ${q.difficulty} of 10`
                    }
                  >
                    {done ? "Done" : `${q.difficulty} / 10`}
                  </small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
