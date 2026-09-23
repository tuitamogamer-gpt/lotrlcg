import type { Card, ScenarioId } from "./types";
export const SCENARIOS = [
  {
    id: "mirkwood",
    name: "Passage Through Mirkwood",
    shortName: "Mirkwood",
    chapter: "I",
    difficulty: 1,
    tagline: "Beneath the ancient boughs",
    description:
      "Follow the hidden paths, brave the spiders, and find a way beyond the forest.",
    sets: [
      "Passage Through Mirkwood",
      "Spiders of Mirkwood",
      "Dol Guldur Orcs",
    ],
    stages: [
      {
        name: "Flies and Spiders",
        quest: 8,
        story: "The road leads beneath the tangled branches of Mirkwood.",
      },
      {
        name: "A Fork in the Road",
        quest: 2,
        story: "The trail divides. A final path will be chosen at random.",
      },
      {
        name: "A Chosen Path",
        quest: 10,
        story: "Escape by Beorn’s Path or defeat Ungoliant’s Spawn.",
      },
    ],
  },
  {
    id: "anduin",
    name: "Journey Along the Anduin",
    shortName: "The Anduin",
    chapter: "II",
    difficulty: 4,
    tagline: "Where the great river runs",
    description:
      "Overcome the Hill Troll, navigate the river, and survive an ambush on the shore.",
    sets: [
      "Journey Down the Anduin",
      "Sauron's Reach",
      "Dol Guldur Orcs",
      "Wilderlands",
    ],
    stages: [
      {
        name: "To the River…",
        quest: 8,
        story: "Defeat every Hill Troll in play before advancing.",
      },
      {
        name: "Anduin Passage",
        quest: 16,
        story:
          "Reveal an extra encounter each quest phase. No automatic engagement checks.",
      },
      {
        name: "Ambush on the Shore",
        quest: 0,
        story:
          "Reveal two cards on arrival. No further staging reveals; defeat every enemy in play.",
      },
    ],
  },
  {
    id: "dol-guldur",
    name: "Escape from Dol Guldur",
    shortName: "Dol Guldur",
    chapter: "III",
    difficulty: 7,
    tagline: "Into the Necromancer’s shadow",
    description:
      "Recover three guarded treasures, rescue your captive hero, and escape the Nazgûl.",
    sets: ["Escape from Dol Guldur", "Spiders of Mirkwood", "Dol Guldur Orcs"],
    stages: [
      {
        name: "The Necromancer’s Tower",
        quest: 9,
        story:
          "A hero is imprisoned. Claim at least one objective. Play at most one ally per round.",
      },
      {
        name: "Through the Caverns",
        quest: 15,
        story:
          "Place progress on this quest to rescue the prisoner. Claim all three objectives to advance. One ally per round.",
      },
      {
        name: "Out of the Dungeons",
        quest: 7,
        story:
          "An Orc Guard appears each quest phase. The Nazgûl must be defeated before you can escape.",
      },
    ],
  },
] as const;
export const scenario = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
export const OBJECTIVES = ["01108", "01109", "01110"];
export const CAMPAIGN_CARDS: Card[] = [
  {
    code: "rc132",
    name: "Mendor’s Support",
    type_code: "event",
    sphere_code: "neutral",
    cost: 0,
    text: "Boon. Only one copy can be played each round. Action: Mendor gets +2 [willpower], +2 [attack], and +2 [defense] until the end of the round.",
  },
  {
    code: "rc133",
    name: "Valor",
    type_code: "attachment",
    sphere_code: "neutral",
    cost: 0,
    traits: "Condition.",
    text: "Boon. Permanent. Limit 1 per hero. Response: After attached hero is declared as an attacker, exhaust Valor to heal 1 damage from that hero and deal 1 damage to the defending enemy.",
  },
  {
    code: "rc134",
    name: "Appointed by Fate",
    type_code: "attachment",
    sphere_code: "neutral",
    cost: 0,
    traits: "Condition.",
    text: "Boon. Attached hero collects 1 additional resource during each resource phase.",
  },
  {
    code: "rc135",
    name: "Mendor",
    type_code: "ally",
    sphere_code: "neutral",
    is_unique: true,
    willpower: 1,
    attack: 1,
    defense: 1,
    health: 3,
    traits: "Silvan. Scout.",
    text: "Boon. Objective-Ally. Ranged. After a quest card is defeated, ready Mendor and draw 1 card. If Mendor leaves play, remove him from the game.",
  },
  {
    code: "rc136",
    name: "Ungoliant’s Swarm",
    type_code: "enemy",
    sphere_code: "encounter",
    engagement: 33,
    threat: 3,
    attack: 2,
    defense: 2,
    health: 5,
    traits: "Creature. Spider.",
    text: "Burden. Forced: After Ungoliant’s Swarm engages you, choose and exhaust 2 characters you control.",
    shadow: "Put Ungoliant’s Swarm into play engaged with you.",
  },
  {
    code: "rc137",
    name: "Lingering Venom",
    type_code: "treachery",
    sphere_code: "encounter",
    text: "Burden. Surge. When Revealed: Choose: exhaust each damaged character you control, or deal 2 damage to the hero you control with the most damage on it.",
    shadow: "Exhaust each damaged character you control.",
  },
  {
    code: "rc138",
    name: "Scarred",
    type_code: "objective",
    sphere_code: "encounter",
    text: "Burden. Permanent. Limit 1 per hero. Forced: After a character you control is destroyed, raise your threat by 1.",
  },
].map((c) => ({
  ...c,
  pack_name: "Revised Core Set",
  imagesrc: `/cards/${c.code}.jpg`,
}));
export const ORC_GUARD: Card = {
  code: "orc-guard",
  name: "Orc Guard",
  type_code: "enemy",
  sphere_code: "encounter",
  attack: 1,
  defense: 1,
  health: 1,
  threat: 0,
  engagement: 0,
  traits: "",
  text: "A player-deck card placed facedown as an enemy. When it leaves play, return it to its owner’s discard pile.",
  imagesrc: "/cards/orc-guard.svg",
};
