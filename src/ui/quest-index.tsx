import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, MagnifyingGlass, X } from "@phosphor-icons/react";
import { encounterCards } from "../game/cards";
import { cardProductInfo } from "../game/products";
import { SCENARIOS, scenario } from "../game/scenarios";
import type { ScenarioId } from "../game/types";
import { normalizeSearchText as normalize } from "../search-text";

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
  "the-river-running": {
    lead: "Escape the pursuit",
    em: "along the River Running.",
  },
  "danger-in-dorwinion": { lead: "Expose the cult", em: "in Dorwinion." },
  "temple-of-doom": { lead: "Enter", em: "the Temple of Doom." },
  "wrath-and-ruin": { lead: "Reclaim the streets", em: "of Dorwinion." },
  "challenge-of-the-wainriders": {
    lead: "Race the champion",
    em: "for freedom.",
  },
  "the-city-of-ulfast": { lead: "Elude the guard", em: "in Ulfast." },
  "the-withered-heath": {
    lead: "Track the dragon",
    em: "across the Withered Heath.",
  },
  "roam-across-rhovanion": { lead: "Follow Urdug", em: "across Rhovanion." },
  "fire-in-the-night": { lead: "Defend the town", em: "from Dagnir’s fire." },
  "the-ghost-of-framsburg": {
    lead: "Discover the treasures",
    em: "of Framsburg.",
  },
  "the-black-serpent": { lead: "Raid the camp", em: "of the Black Serpent." },
  "the-dungeons-of-cirith-gurat": {
    lead: "Rescue the prisoners",
    em: "of Cirith Gurat.",
  },
  "the-crossings-of-poros": { lead: "Make a stand", em: "at the Poros." },
  "journey-up-the-anduin": { lead: "Journey north", em: "up the Anduin." },
  "lost-in-mirkwood": { lead: "Find the path", em: "out of Mirkwood." },
  "the-kings-quest": {
    lead: "Face the Fire Worm",
    em: "beneath the Iron Hills.",
  },
  "beneath-the-sands": { lead: "Find a path", em: "beneath the sands." },
  "race-across-harad": { lead: "Race north", em: "across Harad." },
  "the-mumakil": { lead: "Capture", em: "the wild Mûmakil." },
  "escape-from-umbar": { lead: "Escape from", em: "Umbar." },
  "desert-crossing": { lead: "Cross", em: "the desert of Harad." },
  "the-long-arm-of-mordor": {
    lead: "Rescue the heroes",
    em: "from Mordor's grasp.",
  },
  "the-drowned-ruins": { lead: "Dive into", em: "the drowned ruins." },
  "a-storm-on-cobas-haven": { lead: "Break through", em: "the Corsair fleet." },
  "the-city-of-corsairs": {
    lead: "End the plot",
    em: "in the streets of Umbar.",
  },
  "temple-of-the-deceived": {
    lead: "Explore",
    em: "the temple of the deceived.",
  },
  "voyage-across-belegaer": { lead: "Voyage across", em: "Belegaer." },
  "the-fate-of-numenor": { lead: "Discover", em: "the fate of Númenor." },
  "raid-on-the-grey-havens": { lead: "Defend", em: "the Grey Havens." },
  "flight-of-the-stormcaller": { lead: "Pursue", em: "the Stormcaller." },
  "the-thing-in-the-depths": {
    lead: "Confront",
    em: "the thing in the depths.",
  },
  "wastes-of-eriador": { lead: "Survive", em: "the Wastes of Eriador." },
  "escape-from-mount-gram": { lead: "Escape from", em: "Mount Gram." },
  "across-the-ettenmoors": { lead: "Cross", em: "the Ettenmoors." },
  "the-treachery-of-rhudaur": {
    lead: "Uncover",
    em: "the treachery of Rhudaur.",
  },
  "the-battle-of-carn-dum": { lead: "Battle at", em: "Carn Dûm." },
  "the-dread-realm": { lead: "Descend into", em: "the Dread Realm." },

  "the-weather-hills": { lead: "Hunt through", em: "the Weather Hills." },
  "intruders-in-chetwood": { lead: "Guard", em: "the borders of Bree-land." },
  "the-antlered-crown": { lead: "Unite", em: "the clans of Dunland." },
  "celebrimbors-secret": { lead: "Uncover", em: "Celebrimbor’s Secret." },
  "the-nin-in-eilph": { lead: "Cross", em: "the Nîn-in-Eilph." },
  "trouble-in-tharbad": { lead: "Escape from", em: "Tharbad." },
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
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [release, setRelease] = useState("");
  const term = normalize(query.trim());
  const groups = RELEASE_GROUPS.map((group) => ({
    ...group,
    quests: group.quests.filter(
      (q) =>
        (locked || !release || group.name === release) &&
        (locked ||
          normalize(`${q.name} ${q.tagline} ${group.name}`).includes(term)),
    ),
  })).filter((group) => group.quests.length > 0);
  const count = groups.reduce((total, group) => total + group.quests.length, 0);
  function clearFilters() {
    setQuery("");
    setRelease("");
    search.current?.focus();
  }
  function viewAdventure() {
    const preview = document.getElementById("adventure-preview");
    preview?.focus({ preventScroll: true });
    preview?.scrollIntoView({ block: "start", behavior: "instant" });
  }
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
  }, [selected, query, release, locked]);
  return (
    <>
      {!locked && (
        <div
          className="adventure-filters"
          role="search"
          aria-label="Find an adventure"
        >
          <label className="adventure-search">
            <MagnifyingGlass size={21} aria-hidden="true" />
            <input
              ref={search}
              type="search"
              aria-label="Search adventures"
              placeholder="Find your next adventure…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="adventure-release">
            <span>Collection</span>
            <select
              aria-label="Filter adventures by collection"
              value={release}
              onChange={(event) => setRelease(event.target.value)}
            >
              <option value="">All collections</option>
              {RELEASE_GROUPS.map((group) => (
                <option key={group.name} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <span className="adventure-results" role="status">
            {count} {count === 1 ? "adventure" : "adventures"}
          </span>
          {(query || release) && (
            <button className="adventure-clear" onClick={clearFilters}>
              <X size={16} /> Clear filters
            </button>
          )}
        </div>
      )}
      <section className="mission-selection" aria-label="Missions">
        <div className="mission-index-heading">
          <span>The adventure archive</span>
          <span>{String(count).padStart(2, "0")}</span>
        </div>
        <div className="mission-index" ref={index}>
          {groups.length === 0 && (
            <div className="adventure-empty">
              <MagnifyingGlass size={30} aria-hidden="true" />
              <h3>No adventures found</h3>
              <p>Try another title or explore a different collection.</p>
              <button onClick={clearFilters}>
                Show all adventures <ArrowRight size={16} />
              </button>
            </div>
          )}
          {groups.map((group) => (
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
        <button className="mission-current" onClick={viewAdventure}>
          <span>
            <small>YOUR SELECTED ADVENTURE</small>
            <strong>{scenario(selected).name}</strong>
          </span>
          <ArrowRight size={20} aria-hidden="true" />
          <span className="mission-current-action">View adventure</span>
        </button>
      </section>
    </>
  );
}
