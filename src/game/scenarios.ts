import { FORDS_ISEN_QUESTS } from "./fords-isen-support";
import { BLOOD_GONDOR_QUESTS } from "./blood-gondor-support";
import { MORGUL_VALE_QUESTS } from "./morgul-vale-support";
import { DRUADAN_FOREST_QUESTS } from "./druadan-forest-support";
import { AMON_DIN_QUESTS } from "./amon-din-support";
import { ASSAULT_OSGILIATH_QUESTS } from "./assault-osgiliath-support";
import heirsQuests from "../data/heirs-numenor-quest-cards.json";
import scriptedScenarioArt from "../data/scripted-scenario-art.json";
import stewardQuests from "../data/steward-fear-quest-cards.json";
import type { Card, ScenarioId } from "./types";
import {
  FOUNDATIONS_STONE as F,
  FOUNDATIONS_STONE_QUESTS,
} from "./foundations-stone-support";
import carrockQuests from "../data/carrock-quest-cards.json";
import emynQuests from "../data/emyn-muil-quest-cards.json";
import rhosgobelQuests from "../data/rhosgobel-quest-cards.json";
import deadMarshesQuests from "../data/dead-marshes-quest-cards.json";
import returnMirkwoodQuests from "../data/return-mirkwood-quest-cards.json";
import khazadQuests from "../data/khazad-dum-quest-cards.json";
import redhornQuests from "../data/redhorn-gate-quest-cards.json";
import roadQuests from "../data/road-rivendell-quest-cards.json";
import watcherWaterQuests from "../data/watcher-water-quest-cards.json";
import longDarkQuests from "../data/long-dark-quest-cards.json";
import shadowFlameQuests from "../data/shadow-flame-quest-cards.json";
const questImage = (code: string) => {
  const c = [
    ...carrockQuests,
    ...emynQuests,
    ...rhosgobelQuests,
    ...deadMarshesQuests,
    ...returnMirkwoodQuests,
    ...khazadQuests,
    ...redhornQuests,
    ...roadQuests,
    ...watcherWaterQuests,
    ...longDarkQuests,
    ...shadowFlameQuests,
    ...heirsQuests,
    ...stewardQuests,
    ...DRUADAN_FOREST_QUESTS,
    ...AMON_DIN_QUESTS,
    ...ASSAULT_OSGILIATH_QUESTS,
    ...BLOOD_GONDOR_QUESTS,
    ...MORGUL_VALE_QUESTS,
    ...FORDS_ISEN_QUESTS,
    ...FOUNDATIONS_STONE_QUESTS,
  ].find((c) => c.code === code);
  const src = c?.back_imagesrc || c?.imagesrc;
  return scriptedScenarioArt[src as keyof typeof scriptedScenarioArt] ?? src;
};
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
  {
    id: "hunt-for-gollum",
    name: "The Hunt for Gollum",
    shortName: "Hunt for Gollum",
    chapter: "IV",
    difficulty: 4,
    tagline: "On the trail of the creature",
    description:
      "Follow the signs of Gollum’s passing along the Anduin and into the eaves of Mirkwood before the Hunters from Mordor close in.",
    sets: ["The Hunt for Gollum", "Journey Down the Anduin", "Sauron's Reach"],
    stages: [
      {
        name: "The Hunt Begins",
        quest: 8,
        story:
          "Reveal 1 card per player at setup. After a successful quest, the first player looks at the top 3 cards and reveals one.",
      },
      {
        name: "A New Terror Abroad",
        quest: 10,
        story:
          "At the start of each quest phase, the first player looks at the top 2 cards and reveals one.",
      },
      {
        name: "On the Trail",
        quest: 8,
        story:
          "Only players with a Clue-bearing hero may commit characters. Losing every Clue returns the quest to stage 2.",
      },
    ],
  },
  {
    id: "conflict-at-the-carrock",
    name: "Conflict at the Carrock",
    shortName: "The Carrock",
    chapter: "V",
    difficulty: 7,
    tagline: "Trolls on the Anduin",
    description:
      "Find Grimbeorn the Old, prepare your fellowship and drive four marauding Trolls from the Carrock.",
    sets: ["Conflict at the Carrock", "Journey Down the Anduin", "Wilderlands"],
    stages: [
      {
        name: "Grimbeorn’s Quest",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801202c9012",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801202c9012"),
        quest: 7,
        story:
          "The Carrock waits in staging. On the seventh quest progress, discard the previous active location and make The Carrock active.",
      },
      {
        name: "Against the Trolls",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801202c9003",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801202c9003"),
        quest: 1,
        story:
          "Louis, Morris, Stuart and Rupert enter staging. Place one quest progress and defeat every Troll in play to win.",
      },
    ],
  },
  {
    id: "journey-to-rhosgobel",
    name: "A Journey to Rhosgobel",
    shortName: "Rhosgobel",
    chapter: "VI",
    difficulty: 6,
    tagline: "The wounded Eagle",
    description:
      "Bring Wilyador to Radagast, gather Athelas and heal the wounded Eagle before his injuries become fatal.",
    sets: ["A Journey to Rhosgobel", "Spiders of Mirkwood", "Dol Guldur Orcs"],
    stages: [
      {
        name: "The Wounded Eagle",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801203c9020",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801203c9020"),
        quest: 8,
        story:
          "The first player controls Wilyador with two wounds. He suffers two more each round. Complete this stage before traveling to Rhosgobel.",
      },
      {
        name: "Radagast’s Request",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801203c9022",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801203c9022"),
        quest: 12,
        story:
          "At quest start, optionally wound Wilyador to choose one of three encounters. After an effect heals him, remove its source card from the game.",
      },
      {
        name: "Return to Rhosgobel",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801203c9024",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801203c9024"),
        quest: 0,
        story:
          "Heal five wounds for each controlled Athelas. Win immediately if Wilyador is completely healed; otherwise the Eagle is lost.",
      },
    ],
  },
  {
    id: "hills-of-emyn-muil",
    name: "The Hills of Emyn Muil",
    shortName: "Emyn Muil",
    chapter: "VII",
    difficulty: 4,
    tagline: "The trail grows cold",
    description:
      "Explore the rugged hills around Amon Hen and Amon Lhaw to discover where Gollum's trail leads next.",
    sets: ["The Hills of Emyn Muil", "Dol Guldur Orcs", "Sauron's Reach"],
    stages: [
      {
        name: "The Hills of Emyn Muil",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801204c9019",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801204c9019"),
        quest: 1,
        story:
          "Place one quest progress, collect at least 20 victory points and explore every Emyn Muil location in play. With no locations in staging, the first treachery of each quest phase gains Surge.",
      },
    ],
  },
  {
    id: "dead-marshes",
    name: "The Dead Marshes",
    shortName: "Dead Marshes",
    chapter: "VIII",
    difficulty: 5,
    tagline: "Catch the elusive Gollum",
    description:
      "Keep Gollum in sight through the deadly marshes. Reserve ready characters for escape tests and choose who will make the final capture attempt.",
    sets: ["The Dead Marshes", "Sauron's Reach", "Wilderlands"],
    stages: [
      {
        name: "Into the Marshes",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801205c9011",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801205c9011"),
        quest: 12,
        story:
          "Gollum starts in staging. At the end of each quest phase, all players make an escape test; failure places two resource tokens on him. At eight tokens, he escapes into the encounter deck.",
      },
      {
        name: "The Capture",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801205c9017",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801205c9017"),
        quest: 3,
        story:
          "The first player chooses one player for the final escape test. Deal one card per resource token on Gollum. A successful capture wins; otherwise return to stage 1B without repeating setup.",
      },
    ],
  },
  {
    id: "return-to-mirkwood",
    name: "Return to Mirkwood",
    shortName: "Return to Mirkwood",
    chapter: "IX",
    difficulty: 7,
    tagline: "The captive's last resistance",
    description:
      "Escort Gollum alive to Thranduil's halls. Share guard duty, withstand his tantrums and defeat the enemies drawn by his cries.",
    sets: ["Return to Mirkwood", "Spiders of Mirkwood", "Wilderlands"],
    stages: [
      {
        name: "Through the Forest",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801206c9021",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801206c9021"),
        quest: 12,
        story:
          "Choose Gollum's guard before revealing one encounter per player. The captive is a controlled ally; he cannot quest or fight, and his departure or his guard's elimination loses the game.",
      },
      {
        name: "Escape Attempt",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801206c9010",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801206c9010"),
        quest: 3,
        story:
          "Gollum's guard cannot commit characters unless he is the only remaining player. Questing unsuccessfully immediately lets Gollum escape.",
      },
      {
        name: "To the Elvin King's Halls",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801206c9023",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801206c9023"),
        quest: 7,
        story:
          "The player guarding Gollum cannot play cards from his hand. Other players can still help with their own cards and controlled abilities.",
      },
      {
        name: "Ambush",
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801206c9001",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801206c9001"),
        quest: 2,
        story:
          "Every enemy in play engages Gollum's guard at combat start. Place two progress and defeat every enemy in play to win.",
      },
    ],
  },
  {
    id: "into-the-pit",
    name: "Into the Pit",
    shortName: "Into the Pit",
    chapter: "X",
    difficulty: 5,
    tagline: "Through the eastern gate",
    description:
      "Carry the Cave Torch through Moria, explore the Bridge and overcome the Goblin Patrol.",
    sets: [
      "Into the Pit",
      "Twists and Turns",
      "Hazards of the Pit",
      "Goblins of the Deep",
    ],
    stages: [
      {
        name: "Entering the Mines",
        quest: 7,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9028",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9028"),
        story:
          "Explore East-gate, First Hall and the Bridge of Khazad-dûm before advancing.",
      },
      {
        name: "Goblin Patrol",
        quest: 11,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9036",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9036"),
        story:
          "Search for enemies including a Patrol Leader. Defeat all enemies or place eleven progress.",
      },
      {
        name: "A Way Up",
        quest: 12,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9004",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9004"),
        story:
          "Heroes no longer collect resources during the resource phase. Escape by completing this stage.",
      },
    ],
  },
  {
    id: "the-seventh-level",
    name: "The Seventh Level",
    shortName: "Seventh Level",
    chapter: "XI",
    difficulty: 3,
    tagline: "The chamber of records",
    description:
      "Follow the Book of Mazarbul to discover Balin's fate and withstand the gathering Goblins.",
    sets: ["The Seventh Level", "Plundering Goblins", "Goblins of the Deep"],
    stages: [
      {
        name: "Search for the Chamber",
        quest: 15,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9070",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9070"),
        story: "The first player chooses a hero to carry the Book of Mazarbul.",
      },
      {
        name: "The Fate of Balin",
        quest: 17,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9077",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9077"),
        story:
          "Remove the Book. At the end of staging, reveal one extra card per player and resolve only enemies.",
      },
    ],
  },
  {
    id: "flight-from-moria",
    name: "Flight from Moria",
    shortName: "Flight from Moria",
    chapter: "XII",
    difficulty: 7,
    tagline: "A foe beyond your strength",
    description:
      "Search a shuffled deck of escape routes while victory points strengthen The Nameless Fear.",
    sets: [
      "Flight from Moria",
      "Hazards of the Pit",
      "Deeps of Moria",
      "Plundering Goblins",
    ],
    stages: [
      {
        name: "A Presence in the Dark",
        quest: 0,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9002",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9002"),
        story:
          "Prepare the shuffled quest deck and reveal one encounter per player.",
      },
      {
        name: "Search for an Exit",
        quest: 0,
        cardCode: "octgn:51223bd0-ffd1-11df-a976-0801207c9056",
        questImage: questImage("octgn:51223bd0-ffd1-11df-a976-0801207c9056"),
        story:
          "Reveal each new route at the beginning of staging. At combat end, stay or bypass the current route.",
      },
    ],
  },
  {
    id: "redhorn-gate",
    name: "The Redhorn Gate",
    shortName: "Redhorn Gate",
    chapter: "XIII",
    difficulty: 6,
    tagline: "Across the snowbound pass",
    description:
      "Escort Arwen over the Misty Mountains, cross Caradhras and survive the bitter cold.",
    sets: ["The Redhorn Gate", "Misty Mountains"],
    stages: redhornQuests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name || q.name,
        quest: q.back_quest || 0,
        story: q.back_text || "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "road-to-rivendell",
    name: "Road to Rivendell",
    shortName: "Road to Rivendell",
    chapter: "XIV",
    difficulty: 4,
    tagline: "Ambush in the mountain foothills",
    description:
      "Escort Arwen to her father's home while Orcs and wild creatures ambush the fellowship.",
    sets: ["Road to Rivendell", "Misty Mountains", "Plundering Goblins"],
    stages: roadQuests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name || q.name,
        quest: q.back_quest || 0,
        story: q.back_text || "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "watcher-in-the-water",
    name: "The Watcher in the Water",
    shortName: "The Watcher",
    chapter: "XV",
    difficulty: 5,
    tagline: "Speak friend and enter",
    description:
      "Face the lake's many tentacles, decipher the Doors of Durin or drive The Watcher away.",
    sets: ["The Watcher in the Water", "Misty Mountains"],
    stages: watcherWaterQuests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name || q.name,
        quest: q.back_quest || 0,
        story: q.back_text || "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "the-long-dark",
    name: "The Long Dark",
    shortName: "The Long Dark",
    chapter: "XVI",
    difficulty: 7,
    tagline: "Lost beneath the mountain",
    description:
      "Find a route through the black pit with the Cave Torch, and survive the dangers of losing your way.",
    sets: ["The Long Dark", "Twists and Turns", "Hazards of the Pit"],
    stages: longDarkQuests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name || q.name,
        quest: q.back_quest || 0,
        story: q.back_text || "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "foundations-of-stone",
    name: "Foundations of Stone",
    shortName: "Foundations of Stone",
    chapter: "XVII",
    difficulty: 6,
    tagline: "The flood beneath the mines",
    description:
      "Follow the Cave Torch into the drowned halls, survive the separation and find your companions again.",
    sets: [
      "Foundations of Stone",
      "Twists and Turns",
      "Hazards of the Pit",
      "Goblins of the Deep",
    ],
    stages: [F.walls, F.edge, F.washed, F.lair, F.depths].map((code) => {
      const q = FOUNDATIONS_STONE_QUESTS.find((q) => q.code === code)!;
      return {
        name: q.back_name ?? q.name,
        quest: q.quest ?? q.back_quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: q.back_imagesrc ?? q.imagesrc,
      };
    }),
  },
  {
    id: "shadow-and-flame",
    name: "Shadow and Flame",
    shortName: "Shadow and Flame",
    chapter: "XVIII",
    difficulty: 8,
    tagline: "The last lord of Moria",
    description:
      "Hold the Rear Guard against Durin's Bane and cast the Balrog into the Dark Pit.",
    sets: ["Shadow and Flame", "Deeps of Moria", "Goblins of the Deep"],
    stages: shadowFlameQuests
      .slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name || q.name,
        quest: q.back_quest || 0,
        story: q.back_text || "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "peril-in-pelargir",
    name: "Peril in Pelargir",
    shortName: "Peril in Pelargir",
    chapter: "XIX",
    difficulty: 6,
    tagline: "Brigands in the harbour city",
    description:
      "Carry a secret message through the streets of Pelargir while thieves and spies close in on the fellowship.",
    sets: ["Peril in Pelargir", "Streets of Gondor", "Brigands"],
    stages: [
      {
        name: "The Leaping Fish",
        quest: 6,
        story:
          "Battle. When Revealed: Each player must search the encounter deck for a copy of Harbor Thug and add it to the staging area. Shuffle the encounter deck.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9021",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9021.B.jpg",
      },
      {
        name: "Fighting in the Streets",
        quest: 13,
        story:
          "Battle. The players cannot advance to the next stage unless Alcaron's Scroll is attached to a hero.  When Revealed: Attach Alcaron's Scroll to the highest engagement cost enemy in play, if able. Otherwise, add Alcaron's Scroll to the staging area.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9023",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9023.B.jpg",
      },
      {
        name: "Escape to the Quays",
        quest: 15,
        story:
          "Enemies cannot be optionally engaged.  Forced: The first enemy revealed from the encounter deck each round makes an immediate attack against the player who controls Alcaron's Scroll from the staging area.  The players cannot defeat this stage unless Alcaron's Scroll is attached to a hero. If the players defeat this stage, they have won the game.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9025",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9025.B.jpg",
      },
    ],
  },
  {
    id: "into-ithilien",
    name: "Into Ithilien",
    shortName: "Into Ithilien",
    chapter: "XX",
    difficulty: 4,
    tagline: "Ambush in the Rangers’ land",
    description:
      "Escort the Rangers through Ithilien as Southron raiders and the wild land itself turn against you.",
    sets: [
      "Into Ithilien",
      "Creatures of the Forest",
      "Brooding Forest",
      "Southrons",
    ],
    stages: [
      {
        name: "Ambush in Ithilien",
        quest: 15,
        story:
          "Battle. If the players complete this stage with Celador in the staging area, advance to stage 3A (bypassing stage 2).",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9027",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9027.B.jpg",
      },
      {
        name: "Southron Counter-attack",
        quest: 9,
        story:
          "Siege. Archery X. X is the number of players in the game. After this stage is completed, advance to stage 4A (bypassing stage 3).",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9029",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9029.B.jpg",
      },
      {
        name: "The Hidden Way",
        quest: 12,
        story:
          "When Revealed: The first player takes control of all Ranger objectives in the staging area.  Enemies do not make engagement checks and cannot be optionally engaged.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9031",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9031.B.jpg",
      },
      {
        name: "Approaching Cair Andros",
        quest: 15,
        story:
          "If any player's threat is 37 or higher, Approaching Cair Andros gains siege.  Forced: At the end of each round, raise each player's threat by 2.  If the players defeat this stage, they have won the game.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9033",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9033.B.jpg",
      },
    ],
  },
  {
    id: "siege-of-cair-andros",
    name: "The Siege of Cair Andros",
    shortName: "The Siege of Cair Andros",
    chapter: "XXI",
    difficulty: 7,
    tagline: "Hold the river fortress",
    description:
      "Defend the island fortress of Cair Andros, battleground by battleground, against the assault from Mordor.",
    sets: ["The Siege of Cair Andros", "Mordor Elite", "Ravaging Orcs"],
    stages: [
      {
        name: "The Defense",
        quest: 9,
        story:
          "Siege. Players must deal damage from undefended attacks to the lowest [threat] Battleground location in play. If there are no Battleground locations in play, immediately advance to the next stage.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9035",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9035.B.jpg",
      },
      {
        name: "Reinforcing the Banks",
        quest: 9,
        story:
          "Reveal 1 additional card from the encounter deck and add it to the staging area during the staging step each round.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9037",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9037.B.jpg",
      },
      {
        name: "Breakthrough at the Approach",
        quest: 7,
        story:
          "Battle. Forced: After the players quest unsuccessfully, instead of raising threat, each player must choose and discard 1 character he controls.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9039",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9039.B.jpg",
      },
      {
        name: "Breakthrough at the Citadel",
        quest: 5,
        story:
          "Siege. Breakthrough at the Citadel adds 5 [threat] to the staging area.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9041",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9041.B.jpg",
      },
      {
        name: "The Last Battle",
        quest: 15,
        story:
          "Siege. When Revealed: Reveal 1 card per player from the encounter deck and add it to the staging area.  If the players have collected 4 or more victory points, The Last Battle gains battle and loses siege.  If the players defeat this stage, they have won the game.",
        cardCode: "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9043",
        questImage: "/cards/4823aae3-46ef-4a75-89f9-cbd3aa1b9043.B.jpg",
      },
    ],
  },
  {
    id: "the-stewards-fear",
    name: "The Steward's Fear",
    shortName: "The Steward's Fear",
    chapter: "XXII",
    difficulty: 5,
    tagline: "A conspiracy in Minas Tirith",
    description:
      "Uncover the plot stirring beneath Minas Tirith and unmask the villain behind it before the city falls.",
    sets: ["The Steward's Fear", "Streets of Gondor", "Brigands"],
    stages: [
      {
        name: "Conspiracy",
        quest: 0,
        story:
          "When revealed: Search the encounter deck for The Fourth Star and make it the active location. Shuffle the encounter deck.  Forced: After the active location leaves play as an explored location, place 1 resource token on this quest.  If there are 4 or more resource tokens on Conspiracy, advance to the next stage.",
        cardCode: "octgn:4e12f20f-aec3-4311-a656-10a517fd97fe",
        questImage: "/cards/4e12f20f-aec3-4311-a656-10a517fd97fe.B.jpg",
      },
      {
        name: "The Grand Design",
        quest: 0,
        story:
          "When Revealed: Make Roots of Mindolluin the active location, returning any other active location to the staging area.  Forced: After the active location leaves play as an explored location place 1 resource token on this quest.  If there are 4 or more resource tokens on The Grand Design, advance to the next stage.",
        cardCode: "octgn:21ee317d-9aca-43be-9782-521539827cb8",
        questImage: "/cards/21ee317d-9aca-43be-9782-521539827cb8.B.jpg",
      },
      {
        name: "The Confrontation",
        quest: 15,
        story:
          "When Revealed: Shuffle the underworld deck into the encounter deck. The players cannot defeat this stage while a Villain is in play.  If this stage is defeated, the players have won the game.",
        cardCode: "octgn:8239e81a-f779-4c7c-b586-cd5ad732f061",
        questImage: "/cards/8239e81a-f779-4c7c-b586-cd5ad732f061.B.jpg",
      },
    ],
  },
  {
    id: "the-druadan-forest",
    name: "The Drúadan Forest",
    shortName: "Drúadan Forest",
    chapter: "XXIII",
    difficulty: 6,
    tagline: "Pursuit beneath the silent trees",
    description:
      "Pursue the conspirators into the Woses’ forest, withstand their arrows and earn their trust.",
    sets: ["The Druadan Forest", "Brooding Forest"],
    stages: DRUADAN_FOREST_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name ?? q.name,
        quest: q.quest ?? q.back_quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "encounter-at-amon-din",
    name: "Encounter at Amon Dîn",
    shortName: "Amon Dîn",
    chapter: "XXIV",
    difficulty: 3,
    tagline: "Save the burning villages",
    description:
      "Rescue the villagers of Anórien from the raiders before Ghulat and his Orcs destroy their homes.",
    sets: ["Encounter at Amon Din", "Ravaging Orcs"],
    stages: AMON_DIN_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name ?? q.name,
        quest: q.quest ?? q.back_quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "assault-on-osgiliath",
    name: "Assault on Osgiliath",
    shortName: "Osgiliath",
    chapter: "XXV",
    difficulty: 8,
    tagline: "Reclaim the ruined city",
    description:
      "Join the forces of Gondor to capture the streets, harbours and strongholds of Osgiliath.",
    sets: ["Assault on Osgiliath", "Mordor Elite", "Southrons"],
    stages: ASSAULT_OSGILIATH_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.back_name ?? q.name,
        quest: q.quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "the-blood-of-gondor",
    name: "The Blood of Gondor",
    shortName: "Blood of Gondor",
    chapter: "XXVI",
    difficulty: 6,
    tagline: "Ambush at the crossroads",
    description:
      "Survive the hidden forces of Mordor and fight through the ambush in Ithilien.",
    sets: ["The Blood of Gondor", "Ravaging Orcs"],
    stages: BLOOD_GONDOR_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.name,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "the-morgul-vale",
    name: "The Morgul Vale",
    shortName: "Morgul Vale",
    chapter: "XXVII",
    difficulty: 7,
    tagline: "Pursuit beneath the Dead City",
    description:
      "Defeat three Captains and rescue Faramir before his captors reach Minas Morgul.",
    sets: ["The Morgul Vale", "Mordor Elite", "Creatures of the Forest"],
    stages: MORGUL_VALE_QUESTS.slice()
      .sort((a, b) => Number(a.cost) - Number(b.cost))
      .map((q) => ({
        name: q.name,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? q.text ?? "",
        cardCode: q.code,
        questImage: questImage(q.code),
      })),
  },
  {
    id: "fords-of-isen",
    name: "Fords of Isen",
    shortName: "Fords of Isen",
    chapter: "XXVIII",
    difficulty: 5,
    tagline: "Hold the crossing before time runs out",
    description:
      "Rescue Gríma from the Islet and hold the Fords against the Dunlendings. Every card you draw can strengthen the raiders.",
    sets: ["Fords of Isen", "Dunland Raiders", "Dunland Warriors"],
    stages: FORDS_ISEN_QUESTS.map((q) => ({
      name: q.name,
      cardCode: q.code,
      quest: q.back_quest!,
      story: q.back_text!,
      questImage: questImage(q.code),
    })),
  },
] as const;
/** The Mirkwood Paths campaign covers the three Core Set quests in order. */
export const CAMPAIGN_CHAPTERS: readonly ScenarioId[] = [
  "mirkwood",
  "anduin",
  "dol-guldur",
];
/** Signs of Gollum: the Clue objective of The Hunt for Gollum. */
export const CLUE = "02014";
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
