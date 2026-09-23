import players from "../data/player-cards.json";
import encounters from "../data/encounter-cards.json";
import type { Card, Unit } from "./types";
import { CAMPAIGN_CARDS, ORC_GUARD } from "./scenarios";
export const playerCards = players as Card[];
export const encounterCards = encounters as Card[];
export const cards: Record<string, Card> = Object.fromEntries(
  [...playerCards, ...encounterCards, ...CAMPAIGN_CARDS, ORC_GUARD].map((c) => [
    c.code,
    c,
  ]),
);
export const HEROES = ["01001", "01002", "01007"];
export const DECK: Record<string, number> = {
  "01013": 3,
  "01014": 2,
  "01015": 2,
  "01016": 3,
  "01017": 1,
  "01018": 2,
  "01020": 3,
  "01022": 1,
  "01023": 3,
  "01026": 3,
  "01027": 2,
  "01043": 3,
  "01044": 2,
  "01045": 3,
  "01046": 3,
  "01048": 3,
  "01050": 3,
  "01055": 2,
  "01057": 3,
  "01073": 3,
};
export interface StarterDeck {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  heroes: string[];
  cards: Record<string, number>;
}
export const STARTERS: StarterDeck[] = [
  {
    id: "leadership",
    name: "The King’s Company",
    subtitle: "Leadership",
    description: "Rally Gondor’s allies and build a powerful resource engine.",
    heroes: ["01001", "01002", "01003"],
  },
  {
    id: "tactics",
    name: "Blades of the West",
    subtitle: "Tactics",
    description:
      "Stand your ground with warriors, weapons, and decisive attacks.",
    heroes: ["01004", "01005", "01006"],
  },
  {
    id: "spirit",
    name: "A Light in the Shadow",
    subtitle: "Spirit",
    description:
      "Quest with courage, control your threat, and cancel the darkness.",
    heroes: ["01007", "01008", "01009"],
  },
  {
    id: "lore",
    name: "Wisdom of the Wild",
    subtitle: "Lore",
    description: "Heal your fellowship and see what lies beyond the next turn.",
    heroes: ["01010", "01011", "01012"],
  },
].map((d) => ({
  ...d,
  cards: {
    ...Object.fromEntries(
      playerCards
        .filter((c) => c.sphere_code === d.id && c.type_code !== "hero")
        .map((c) => [c.code, c.quantity ?? 1]),
    ),
    "01073": 1,
  },
}));
export const SCRIPTED = new Set(
  [...playerCards, ...encounterCards, ...CAMPAIGN_CARDS, ORC_GUARD].map(
    (c) => c.code,
  ),
);
export const card = (code: string): Card => {
  const c = cards[code];
  if (!c) throw new Error(`Unknown card: ${code}`);
  return c;
};
export const imageUrl = (c: Card) =>
  c.imagesrc?.startsWith("/cards/")
    ? c.imagesrc
    : c.pack_name === "Core Set" && cards[c.code]
      ? `/cards/${c.code}.${c.sphere_code === "encounter" ? "jpg" : "png"}`
      : c.imagesrc?.startsWith("http")
        ? c.imagesrc
        : `https://ringsdb.com${c.imagesrc ?? `/bundles/cards/${c.code}.png`}`;
export const name = (u: Unit) => card(u.code).name;
export const plain = (s = "") =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\[willpower\]/g, "willpower")
    .replace(/\[attack\]/g, "attack")
    .replace(/\[defense\]/g, "defense")
    .replace(/\[threat\]/g, "threat")
    .replace(/\[spirit\]/g, "Spirit")
    .replace(/\[leadership\]/g, "Leadership");
export const STAGES = [
  {
    name: "Flies and Spiders",
    quest: 8,
    story:
      "The road leads beneath the tangled branches of Mirkwood. Something stirs in the shadows.",
  },
  {
    name: "A Fork in the Road",
    quest: 2,
    story:
      "The trail divides before you. Every path leads deeper into the forest.",
  },
];
