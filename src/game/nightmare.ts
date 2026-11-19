/**
 * Nightmare mode: a Nightmare Deck's setup card lists the encounter cards it
 * removes from a scenario's standard encounter deck, its own encounter cards
 * are shuffled into the rest, and the card is flipped next to the quest deck,
 * its rules active for the whole game (see docs/NIGHTMARE.md).
 */
import type { GameState, ScenarioId } from "./types";
import { card, encounterCards } from "./cards";

const P = "octgn:e84f94bf-201b-4adf-95d2-0012e0bb50";
/** The Core Set Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_CORE = {
  /** Passage Through Mirkwood's setup card and Nightmare Deck. */
  mirkwoodCard: `${P}01`,
  camp: `${P}06`,
  backtrack: `${P}09`,
  flies: `${P}15`,
  glade: `${P}17`,
  spiders: `${P}23`,
  web: `${P}24`,
  brood: `${P}28`,
  spawn: `${P}29`,
  /** Journey Along the Anduin's setup card and Nightmare Deck. */
  anduinCard: `${P}03`,
  ford: `${P}07`,
  trollSpawn: `${P}08`,
  rats: `${P}10`,
  marshlands: `${P}16`,
  outlaws: `${P}18`,
  pursuit: `${P}19`,
  smoking: `${P}21`,
  trollAttack: `${P}27`,
  /** Escape from Dol Guldur's setup card and Nightmare Deck. */
  dolGuldurCard: `${P}05`,
  catacomb: `${P}11`,
  captive: `${P}12`,
  interrogation: `${P}13`,
  labyrinth: `${P}14`,
  sentinel: `${P}20`,
  spider: `${P}22`,
  chamber: `${P}25`,
  master: `${P}26`,
} as const;

const G = "octgn:b91cc63a-7fa3-46b4-b5b2-9da1663f00",
  E = "octgn:b7bd7ec2-fd79-4f9c-aba8-5bbb50cc00";
/** The Shadows of Mirkwood Nightmare Decks' cards. */
export const NIGHTMARE_SOM = {
  /** The Hunt for Gollum's setup card and Nightmare Deck. */
  gollumCard: `${G}01`,
  enemyTrail: `${G}03`,
  restless: `${G}04`,
  trailCold: `${G}05`,
  hawk: `${G}06`,
  warg: `${G}07`,
  watched: `${G}08`,
  lookout: `${G}09`,
  pools: `${G}10`,
  /** Conflict at the Carrock's setup card, stage 3 and Nightmare Deck. */
  carrockCard: `${G}41`,
  folly: `${G}43`,
  savage: `${G}45`,
  robBob: `${G}46`,
  louis: `${G}47`,
  morris: `${G}48`,
  rupert: `${G}49`,
  stuart: `${G}50`,
  supper: `${G}51`,
  lair: `${G}52`,
  hives: `${G}53`,
  /** A Journey to Rhosgobel's setup card and Nightmare Deck. */
  rhosCard: `${G}31`,
  eagleHunter: `${G}33`,
  shot: `${G}34`,
  darkwood: `${G}35`,
  noxious: `${G}36`,
  labyrinth: `${G}37`,
  thicket: `${G}38`,
  birdEater: `${G}39`,
  /** The Hills of Emyn Muil's setup card and Nightmare Deck. */
  emynCard: `${E}61`,
  tunneling: `${E}63`,
  interceptor: `${E}64`,
  brambles: `${E}65`,
  rapids: `${E}66`,
  hurrying: `${E}67`,
  blast: `${E}68`,
  hazardous: `${E}69`,
  retraced: `${E}70`,
  /** The Dead Marshes' setup card and Nightmare Deck. */
  deadCard: `${E}71`,
  mere: `${E}72`,
  quagmire: `${E}73`,
  thingsPools: `${E}74`,
  wight: `${E}75`,
  lostSoul: `${E}76`,
  guard: `${E}77`,
  candles: `${E}78`,
  mosquitoes: `${E}79`,
  devilry: `${E}80`,
  /** Return to Mirkwood's setup card and Nightmare Deck. */
  rtmCard: `${E}81`,
  ambushing: `${E}82`,
  wargRider: `${E}83`,
  webSpinner: `${E}84`,
  deceptive: `${E}85`,
  webWall: `${E}86`,
  isolation: `${E}87`,
  befouled: `${E}88`,
  wickedness: `${E}89`,
} as const;
/** The Khazad-dûm Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_KD = {
  /** Into the Pit's setup card, its new stage 2 and its Nightmare Deck. */
  pitCard: "octgn:207b3e48-c42c-42a8-b1ac-20950e6588d9",
  ambush: "octgn:17039c31-d3fd-4730-8b74-8f08458071fe",
  sentry: "octgn:5ce149ca-3cca-41ce-9756-bf137d910966",
  lurker: "octgn:ec1a2268-5e9d-4875-8089-2692d22fa180",
  dweller: "octgn:2d85efc7-b619-4376-a7ac-be797b874fba",
  twisting: "octgn:0f939a7b-8a2e-4358-b3b1-e50b3eef7c0b",
  fissure: "octgn:573eebae-82fc-4e41-a3a8-343194c893bc",
  shadowFall: "octgn:e84369a8-89c8-4866-bd21-7c25ece2ca3f",
  /** The Seventh Level's setup card and Nightmare Deck. */
  seventhCard: "octgn:804e57bd-26e8-495b-9676-2e39f009baba",
  maurul: "octgn:6d1eb802-0cb1-427a-9aa3-4e0c3b403681",
  chamber: "octgn:78393d15-048e-40ff-95b8-4dec18a77a8b",
  taskmaster: "octgn:8657c425-d50d-4a14-b7c8-b528463376e6",
  skirmisher: "octgn:750a1952-58d9-4ab7-aa3f-8cc5fd2ea040",
  pitGoblin: "octgn:e8b7ad31-b448-42ac-9f72-defcbe2303e9",
  deepMines: "octgn:874c52e0-e186-49dd-bb4b-7289bf1ecc6f",
  westernHall: "octgn:5277b186-0c76-4ec6-9615-20cdceb49241",
  balinsDoom: "octgn:6c97c646-1952-4080-ae56-ab7caeafb28f",
  beats: "octgn:c6b1e2eb-9ce9-419c-a210-723f3891720d",
  /** Flight from Moria's setup card, its new stage 2 quest cards and its Nightmare Deck. */
  flightCard: "octgn:1bac61b0-ee27-43eb-bb39-85f64c6b4c94",
  ghash: "octgn:45c91742-29a2-4409-a7e5-1f6234d73908",
  flame: "octgn:5ed5e5a0-8924-424a-a49f-527fe91c6374",
  pursued: "octgn:6c9419b0-e016-4ba8-b90a-575d4378984e",
  swarming: "octgn:877df84f-3f61-41e0-96ad-aab2aae56048",
  coalBlack: "octgn:0834d564-c1f1-4f16-8bc7-d7249d665d5c",
  corridor: "octgn:4c495965-946e-472f-841c-72f388a7ce65",
  dismay: "octgn:f6f49c59-637f-4ca2-b51f-e00c4332d33b",
  fortune: "octgn:a78c13d9-8acb-42eb-82a0-a216de3ed87a",
} as const;
/** The Dwarrowdelf Nightmare Decks' cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_DD = {
  /** The Redhorn Gate's setup card and Nightmare Deck. */
  redhornCard: "octgn:1ff3c8f4-e472-4c48-a1d4-5c239f5bb119",
  wolfpelt: "octgn:55c8245d-e0f3-4d11-90f5-617caf78f079",
  marauder: "octgn:abe7a278-0c8e-4b1b-b45a-4da86dd3a3db",
  giant: "octgn:d77287d1-d4d2-49bd-93c1-ae9d2590b8f7",
  cavern: "octgn:5a6f59a4-5beb-4281-898e-f4607056a160",
  silverlode: "octgn:fa005422-98d7-4350-b080-b5fe31fce9b0",
  blizzard: "octgn:b79d8300-714b-4699-8a0c-48b12b7ac145",
  cruel: "octgn:8df497f3-7857-4573-8467-8cf2e16fbc3f",
} as const;

interface NightmareDeck {
  /** The setup card, flipped next to the quest deck. */
  card: string;
  /** "Remove the following cards, in the specified quantities, from the standard encounter deck" (by printed title). */
  removals: Record<string, number>;
  /** The quest deck's stage count when a Nightmare Deck adds stages to it. */
  stages?: number;
  /** Stages the setup card removes from the quest deck, by printed title, replaced by the Nightmare Deck's (Into the Pit's Goblin Patrol). */
  questRemovals?: Record<string, number>;
}
/** The scenarios whose Nightmare Decks are supported, in publication order. */
export const NIGHTMARE: Partial<Record<ScenarioId, NightmareDeck>> = {
  mirkwood: {
    card: NIGHTMARE_CORE.mirkwoodCard,
    removals: {
      "Ungoliant's Spawn": 1,
      "Black Forest Bats": 1,
      "Forest Spider": 3,
      "Dol Guldur Orcs": 3,
      "Old Forest Road": 1,
      "Forest Gate": 2,
      "Mountains of Mirkwood": 3,
      "Caught in a Web": 2,
    },
  },
  anduin: {
    card: NIGHTMARE_CORE.anduinCard,
    removals: {
      "Evil Storm": 3,
      "Treacherous Fog": 2,
      "Banks of the Anduin": 2,
      "Dol Guldur Orcs": 3,
      "Enchanted Stream": 2,
      Despair: 2,
      "Misty Mountain Goblins": 3,
      "Necromancer's Pass": 2,
    },
  },
  "dol-guldur": {
    card: NIGHTMARE_CORE.dolGuldurCard,
    removals: {
      "Dol Guldur Orcs": 2,
      "Enchanted Stream": 2,
      "Great Forest Web": 1,
      "Mountains of Mirkwood": 3,
      "Caught in a Web": 2,
      "The Necromancer's Reach": 1,
      "Necromancer's Pass": 1,
      "Under the Shadow": 2,
      "Tower Gate": 2,
      "Iron Shackles": 1,
    },
  },
  "hunt-for-gollum": {
    card: NIGHTMARE_SOM.gollumCard,
    removals: {
      "River Ninglor": 2,
      // (Printed "Eaves of Mirkwood".)
      "The Eaves of Mirkwood": 1,
      "False Lead": 2,
      "Misty Mountain Goblins": 2,
      "Banks of the Anduin": 2,
      "Gladden Fields": 3,
      "Eastern Crows": 3,
      "Treacherous Fog": 2,
      "Evil Storm": 3,
    },
  },
  "conflict-at-the-carrock": {
    card: NIGHTMARE_SOM.carrockCard,
    // Stage 3, Grimbeorn's Folly, follows the standard quest deck's two.
    stages: 3,
    removals: {
      "Grimbeorn the Old": 1,
      Louis: 1,
      Morris: 1,
      Stuart: 1,
      Rupert: 1,
      "Bee Pastures": 3,
      "Oak-wood Grove": 3,
      "Roasted Slowly": 1,
      "Misty Mountain Goblins": 3,
      "Banks of the Anduin": 2,
      "Wolf Rider": 1,
      "Goblin Sniper": 2,
      Wargs: 2,
      Despair: 2,
      "The Brown Lands": 2,
      "The East Bight": 2,
    },
  },
  "journey-to-rhosgobel": {
    card: NIGHTMARE_SOM.rhosCard,
    removals: {
      "Forest Grove": 4,
      Exhaustion: 1,
      "Swarming Insects": 2,
      "Festering Wounds": 1,
      "Mountains of Mirkwood": 3,
      // Printed "Chieftan Ufthak".
      "Chieftain Ufthak": 1,
      "Dol Guldur Beastmaster": 2,
      "Driven by Shadow": 1,
      "The Necromancer's Reach": 1,
      "Necromancer's Pass": 2,
      "Enchanted Stream": 2,
    },
  },
  "hills-of-emyn-muil": {
    card: NIGHTMARE_SOM.emynCard,
    removals: {
      "The East Wall of Rohan": 1,
      "The North Stair": 1,
      "The Shores of Nen Hithoel": 2,
      "The Highlands": 4,
      "Slick Footing": 2,
      "Impassable Chasm": 2,
      "Dol Guldur Orcs": 2,
      // Printed "Chieftan Ufthak".
      "Chieftain Ufthak": 1,
      "Dol Guldur Beastmaster": 2,
      "The Necromancer's Reach": 2,
      "Necromancer's Pass": 2,
      "Enchanted Stream": 2,
      "Evil Storm": 3,
      "Pursued by Shadow": 2,
    },
  },
  "dead-marshes": {
    card: NIGHTMARE_SOM.deadCard,
    removals: {
      "A Wisp of Pale Sheen": 1,
      "Through the Mist": 1,
      "Giant Marsh Worm": 2,
      "Fens and Mires": 4,
      "Eastern Crows": 3,
      "Pursued by Shadow": 2,
      "Treacherous Fog": 2,
      "Wolf Rider": 1,
      "Hill Troll": 2,
      "Goblin Sniper": 2,
      Wargs: 2,
      Despair: 2,
      "The Brown Lands": 2,
      "The East Bight": 2,
    },
  },
  "return-to-mirkwood": {
    card: NIGHTMARE_SOM.rtmCard,
    removals: {
      "Woodman's Glade": 3,
      "Wood Elf Path": 3,
      "Mountains of Mirkwood": 3,
      "Goblin Sniper": 2,
      "Marsh Adder": 1,
      Wargs: 2,
      Despair: 2,
      "The Brown Lands": 2,
      "The East Bight": 2,
    },
  },
  "into-the-pit": {
    card: NIGHTMARE_KD.pitCard,
    removals: {
      "Stairs of Náin": 2,
      "Goblin Follower": 2,
      "Crumbling Ruin": 2,
      "Cave In": 3,
      "Fouled Well": 2,
      "Goblin Tunnels": 2,
      "Goblin Swordsman": 5,
    },
    questRemovals: { "Goblin Patrol": 1 },
  },
  "the-seventh-level": {
    card: NIGHTMARE_KD.seventhCard,
    removals: {
      "Plundered Armoury": 2,
      "Hidden Threat": 2,
      "Upper Hall": 2,
      "Goblin Scout": 2,
      "Goblin Swordsman": 2,
      "Goblin Spearman": 2,
    },
  },
  "flight-from-moria": {
    card: NIGHTMARE_KD.flightCard,
    removals: {
      "New Devilry": 1,
      "Stray Goblin": 3,
      "The Mountains' Roots": 2,
      "Chance Encounter": 3,
      "Goblin Archer": 2,
      "Goblin Spearman": 1,
      "Plundered Armoury": 2,
      "Cave In": 3,
      "Dark and Dreadful": 2,
    },
    questRemovals: { "Blocked by Shadow": 1 },
  },
  "redhorn-gate": {
    card: NIGHTMARE_DD.redhornCard,
    removals: {
      "Black Uruks": 1,
      "Mountain Warg": 3,
      "Knees of the Mountain": 1,
      "Turbulent Waters": 2,
      "Warg Lair": 2,
      "The Dimrill Stair": 1,
      "Fell Voices": 2,
      "Fallen Stones": 2,
      "Mountain Goblin": 3,
    },
  },
};
export const nightmareSupported = (id?: ScenarioId) => !!id && id in NIGHTMARE;
/** A Nightmare mode game of a supported scenario. */
export const nightmareLive = (s: GameState) =>
  !!s.nightmareMode && nightmareSupported(s.scenarioId);
/** A Nightmare quest deck's stage count, when it adds stages. */
export const nightmareStageCount = (s: GameState) =>
  nightmareLive(s) ? NIGHTMARE[s.scenarioId]!.stages : undefined;
/** The setup card flipped next to the quest deck. */
export const nightmareCardOf = (s: GameState) =>
  nightmareLive(s) ? NIGHTMARE[s.scenarioId]!.card : undefined;
/**
 * Journey Along the Anduin (Nightmare): "If the encounter deck is empty (at
 * any time), shuffle the encounter discard pile back into the encounter
 * deck."
 */
export const nightmareRefillsEncounterDeck = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "anduin";
const carrockNightmare = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "conflict-at-the-carrock";
const trollCode = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Troll");
/** Conflict at the Carrock (Nightmare): stage 2B places these Trolls ("Louis, Morris, Rupert and Stuart"). */
export const nightmareCarrockTrolls = (s: GameState) =>
  carrockNightmare(s)
    ? [
        NIGHTMARE_SOM.louis,
        NIGHTMARE_SOM.morris,
        NIGHTMARE_SOM.rupert,
        NIGHTMARE_SOM.stuart,
      ]
    : undefined;
/** The 5 unique Trolls stage 1A sets aside in Nightmare mode. */
export const NIGHTMARE_CARROCK_SET_ASIDE: string[] = [
  NIGHTMARE_SOM.robBob,
  NIGHTMARE_SOM.louis,
  NIGHTMARE_SOM.morris,
  NIGHTMARE_SOM.rupert,
  NIGHTMARE_SOM.stuart,
];
const inVictory = (s: GameState, code: string) =>
  !!s.victoryCards?.includes(code);
/**
 * Morris: "Immune to player events." While Morris is in the victory display,
 * each Troll enemy gains it.
 */
export const nightmareEventImmune = (
  s: GameState,
  u: { code: string; blanked?: boolean; resources?: number },
) =>
  (carrockNightmare(s) &&
    ((u.code === NIGHTMARE_SOM.morris && !u.blanked) ||
      (inVictory(s, NIGHTMARE_SOM.morris) &&
        card(u.code).type_code === "enemy" &&
        trollCode(u.code)))) ||
  // The Seventh Level (Nightmare), Chamber of Records: "Each Goblin enemy
  // with at least 1 resource on it is immune to player events."
  (nightmareLive(s) &&
    s.scenarioId === "the-seventh-level" &&
    (u.resources ?? 0) > 0 &&
    card(u.code).type_code === "enemy" &&
    (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Goblin") &&
    [...s.staging, s.activeLocation, ...(s.extraActiveLocations ?? [])].some(
      (l) => l?.code === NIGHTMARE_KD.chamber && !l.blanked,
    ));
/**
 * Rupert: "Rupert's [defense] cannot be reduced." While Rupert is in the
 * victory display, each Troll enemy's cannot. (Its [defense] stays at least
 * its printed value, +1 while Stuart is in the victory display.)
 */
export function nightmareDefenseFloor(
  s: GameState,
  u: { code: string; blanked?: boolean },
) {
  if (
    !carrockNightmare(s) ||
    card(u.code).type_code !== "enemy" ||
    !(
      (u.code === NIGHTMARE_SOM.rupert && !u.blanked) ||
      (inVictory(s, NIGHTMARE_SOM.rupert) && trollCode(u.code))
    )
  )
    return undefined;
  return (
    (Number(card(u.code).defense) || 0) +
    (inVictory(s, NIGHTMARE_SOM.stuart) && trollCode(u.code) ? 1 : 0)
  );
}
/** The Nightmare Deck's encounter set ("Passage Through Mirkwood - Nightmare"). */
const nightmareSet = (id: ScenarioId) =>
  card(NIGHTMARE[id]!.card).encounter_set;
const plainTitle = (name: string) => name.replace(/’/g, "'");
/**
 * The Nightmare encounter deck: the standard encounter deck without the
 * removed cards, with the Nightmare Deck's encounter cards shuffled in (the
 * caller shuffles).
 */
export function nightmareEncounterDeck(id: ScenarioId, standard: string[]) {
  const deck = NIGHTMARE[id];
  if (!deck) return standard;
  const out = [...standard];
  for (const [title, n] of Object.entries(deck.removals))
    for (let i = 0; i < n; i++) {
      const at = out.findIndex((code) => plainTitle(card(code).name) === title);
      if (at < 0)
        throw new Error(`${title} is not in the standard encounter deck.`);
      out.splice(at, 1);
    }
  const set = nightmareSet(id);
  for (const c of encounterCards)
    if (
      c.encounter_set === set &&
      c.type_code !== "nightmare" &&
      c.type_code !== "quest"
    )
      out.push(...(Array(c.quantity ?? 1).fill(c.code) as string[]));
  return out;
}
/** The quest inspector's lines for the Nightmare card. */
export function nightmareStatus(s: GameState): string[] {
  if (!nightmareLive(s)) return [];
  if (s.scenarioId === "mirkwood")
    return [
      "Passage Through Mirkwood · Nightmare mode: during setup, each player revealed 1 card from the encounter deck and added it to the staging area.",
    ];
  if (s.scenarioId === "anduin")
    return [
      "Journey Along the Anduin · Nightmare mode: Troll enemies cannot have attachments, and an empty encounter deck is refilled from the encounter discard pile at any time.",
    ];
  if (s.scenarioId === "dol-guldur") {
    const seats = s.table?.seats.length ?? 1;
    const captured = seats >= 4 ? 3 : seats === 3 ? 2 : 1;
    const held = (s.prisoner ? 1 : 0) + (s.nightmare?.prisoners?.length ?? 0);
    return [
      `Escape from Dol Guldur · Nightmare mode: when stage 1B is revealed, ${captured} random ${captured === 1 ? "hero is" : "heroes (of different players) are"} captured as “the prisoner”${held ? ` (${held} held now)` : ""}.`,
    ];
  }
  if (s.scenarioId === "hunt-for-gollum")
    return [
      "The Hunt for Gollum · Nightmare mode: at the end of each refresh phase an unclaimed Clue is attached to a Mordor enemy, which guards it; with 4 Clues on Mordor enemies the players lose.",
    ];
  if (s.scenarioId === "conflict-at-the-carrock")
    return [
      "Conflict at the Carrock · Nightmare mode: 5 unique Trolls were set aside, and stage 2B brings Louis, Morris, Rupert and Stuart; a quest phase that places no progress on the quest places 1 there at its end; after a unique Troll is defeated, a Sacked! card may be discarded; stage 3, Grimbeorn's Folly, is won by defeating Rob & Bob.",
    ];
  if (s.scenarioId === "journey-to-rhosgobel")
    return [
      "A Journey to Rhosgobel · Nightmare mode: a Goblin Eagle-hunter began in the staging area; the first Creature enemy revealed during each quest phase gains surge; an Athelas placed in the encounter discard pile may be shuffled back into the encounter deck.",
    ];
  if (s.scenarioId === "hills-of-emyn-muil")
    return [
      "The Hills of Emyn Muil · Nightmare mode: no more than 1 progress may be placed on each location in the staging area each round.",
    ];
  if (s.scenarioId === "dead-marshes")
    return [
      "The Dead Marshes · Nightmare mode: players cannot reduce their threat; The Mere of Dead Faces began in the staging area and takes Gollum's resource tokens while he is not in play; Gollum placed in the discard pile is shuffled back into the encounter deck.",
    ];
  if (s.scenarioId === "return-to-mirkwood")
    return [
      "Return to Mirkwood · Nightmare mode: at the beginning of each quest phase the player guarding Gollum exhausts a hero or resolves the topmost Tantrum in the encounter discard pile; stage 4A brings Attercop, Attercop.",
    ];
  if (s.scenarioId === "into-the-pit") {
    const n = s.nightmare?.torchDamage ?? 0;
    return [
      `Into the Pit · Nightmare mode: ${n} of 5 damage tokens on the setup card (1 each time Cave Torch exhausts; at 5, Cave Torch is removed from the game); stage 2 is Goblin Ambush.`,
    ];
  }
  if (s.scenarioId === "the-seventh-level")
    return [
      s.stage < 2
        ? "The Seventh Level · Nightmare mode: Overseer Maurûl and Chamber of Records are set aside until stage 2B is revealed."
        : "The Seventh Level · Nightmare mode: Chamber of Records and Overseer Maurûl came into play with stage 2B; the players cannot win unless Overseer Maurûl is in the victory display.",
    ];
  if (s.scenarioId === "flight-from-moria")
    return [
      "Flight from Moria · Nightmare mode: Ghâsh!, Blocked by Flame and Pursued by Shadow replace Blocked by Shadow in the quest deck; a bypassed quest card is shuffled into the quest deck; while Escape from Darkness is in play, Abandoned Tools' Refresh Action works once each round.",
    ];
  if (s.scenarioId === "redhorn-gate")
    return [
      `The Redhorn Gate · Nightmare mode: ${s.stage < 2 ? "Blinding Blizzard is set aside until stage 2B is revealed" : "stage 2B shuffled Blinding Blizzard into the encounter deck"}; player cards in the victory display do not count their victory points.`,
    ];
  return [];
}
