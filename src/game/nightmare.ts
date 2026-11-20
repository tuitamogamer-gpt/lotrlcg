/**
 * Nightmare mode: a Nightmare Deck's setup card lists the encounter cards it
 * removes from a scenario's standard encounter deck, its own encounter cards
 * are shuffled into the rest, and the card is flipped next to the quest deck,
 * its rules active for the whole game (see docs/NIGHTMARE.md).
 */
import type { GameState, ScenarioId } from "./types";
import { card, encounterCards } from "./cards";
import { FOUNDATIONS_NIGHTMARE_REMOVALS } from "./foundations-stone-support";
import { HEIRS_NUMENOR } from "./heirs-numenor-support";

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
  /** Road to Rivendell's setup card, its new stage 2 and its Nightmare Deck. */
  rivendellCard: "octgn:c7777cad-8e18-49b3-bff7-290a241dd84c",
  night: "octgn:e7faf287-1288-48c2-86be-82449aa05193",
  stalker: "octgn:abb76690-2b56-4a51-af0d-10c292621697",
  trapper: "octgn:745919b3-e323-4368-a4ad-25d3bd5baab1",
  raiding: "octgn:eaeb6bc6-0064-4816-951c-b836e979fe01",
  trackers: "octgn:8af079b1-fe2f-407e-a66c-0c9421ffe5d6",
  bluffs: "octgn:2a49f405-1431-44ff-8316-573c23aaffcb",
  woods: "octgn:77dccc28-9be1-41ec-98c2-8b9099678660",
  assault: "octgn:8c9df134-1740-42a5-a69e-32cd928e884f",
  /** The Watcher in the Water's setup card and Nightmare Deck. */
  watcherCard: "octgn:3e1b7378-6be8-4e19-aacb-16cd61a90693",
  watcher: "octgn:5ee5fd66-eb6f-4958-a5a0-cc8dbb54142c",
  writhing: "octgn:0ca1652a-2733-4a38-9eff-53b527fb94a9",
  choking: "octgn:ae32eeef-ea88-48f7-9563-0eff62d02499",
  banks: "octgn:2fd9f511-463b-42c8-bc6f-9bd1b3b91057",
  depths: "octgn:da69a930-1102-4f2d-80ff-257354f3f701",
  pulled: "octgn:b658345f-6282-440d-9004-35fd6ef2e0b7",
  rippling: "octgn:e86c303c-eefb-448d-bbac-87ceb702f837",
  /** The Long Dark's setup card and Nightmare Deck. */
  longDarkCard: "octgn:b1217b87-40bd-442d-b7c8-0d9b7d262b04",
  goblinStalker: "octgn:3e0b01f7-0870-4585-be26-4cd1860d3137",
  trapdoor: "octgn:fc3ec643-ec75-4d49-beca-57f11d6b641a",
  sentinel: "octgn:83a77d46-89f5-4eeb-970b-8c1cd7d5eb4a",
  mines: "octgn:8b225bb2-a809-45ce-af4a-aa98f1d53e82",
  chasm: "octgn:c23266f8-cd28-4e21-8983-1c6180531e18",
  deep: "octgn:c0b9de2b-ada7-468b-9dc5-08bb28c07c3d",
  helpless: "octgn:0c0f7215-3a7f-489c-9edc-4fd5b896e635",
  /** Foundations of Stone's setup card and Nightmare Deck. */
  foundationsCard: "octgn:72230f13-1064-464a-aa14-283a1c61e2e6",
  seeker: "octgn:6e4985a3-5501-41ef-bd15-ec58eadba12c",
  centipede: "octgn:5afd0c41-3fe9-40a1-bdfc-f5e8bc323958",
  unspeakable: "octgn:c4efe804-2832-42f1-bebf-45d3072cc70f",
  primeval: "octgn:53b038f1-01c5-40d9-b583-7501b0d7c8df",
  nest: "octgn:0a53cafe-3137-4475-98f8-37818d1b91a5",
  river: "octgn:3f0b92d5-18d9-4a85-8efb-ce6e64172674",
  chill: "octgn:42d80e7e-8217-48a2-a386-c18b6bff1bf1",
  /** Shadow and Flame's setup card and Nightmare Deck (its Attack cards form the Balrog deck). */
  shadowFlameCard: "octgn:a4e67c29-716e-4221-b300-e7c03f339a96",
  terrible: "octgn:b94e993e-27a6-4ef4-b6f6-a7719928aceb",
  darkFire: "octgn:41cf7fb0-1194-4654-b23a-0b49259faf63",
  grip: "octgn:3b1df5e8-ce5e-4c66-a12b-25a322cfb0ba",
  bidding: "octgn:f376de21-bb3f-49dc-94e5-ce57216963e7",
  udun: "octgn:4858bd5a-6d80-4351-849b-532fc2bc4ffe",
  servant: "octgn:d4b4c172-dec4-4d31-91f8-24f3e3127713",
  captain: "octgn:bb81a9e4-3458-4893-bb85-788ef3f02184",
  fiery: "octgn:ed12d29f-d8f8-4689-8097-417b4d31f214",
  stairs: "octgn:ce3322ab-b890-40e0-852a-a4638796a122",
} as const;
/** The Against the Shadow Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_AS = {
  /** The Steward's Fear's setup card and Nightmare Deck. */
  stewardCard: "octgn:3342238a-2680-4044-822e-39a7d3d767b3",
  rise: "octgn:bb102bb7-e667-444c-b036-a65015452060",
  assassination: "octgn:1fe22408-2fbc-40f8-a88c-980ab90137d8",
  turncoat: "octgn:bbbad333-b966-4826-b98d-1a9e8b6a1c45",
  conspirator: "octgn:1c446c6e-5665-446a-80f1-68cceaed05eb",
  den: "octgn:eb4d41de-acaf-4cca-813b-3f1465cb5d4f",
  rath: "octgn:045cf035-2ebf-4ebf-a7a3-7d44d3f9b2dc",
  tunnel: "octgn:fc351158-b618-41f2-8ba0-a3ab18eb7dd3",
  accusations: "octgn:f0eb44aa-e060-4d5d-b66b-39bd1f0801d7",
  champion: "octgn:58aa1ac7-961f-4a44-ad11-7613d87d4eab",
} as const;
/** The Heirs of Númenor Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_HON = {
  /** Peril in Pelargir's setup card and Nightmare Deck. */
  pelargirCard: "octgn:486a95af-e3af-4513-ae9a-d705d8557db6",
  informant: "octgn:298c3181-5f6f-487c-adbd-741bb202b8e0",
  brute: "octgn:92576b76-6b3a-4bee-84dc-82f927e1caa1",
  ringleader: "octgn:6f300089-29ce-42e7-9bd4-2dda667cdd4a",
  dockside: "octgn:54e3ccfe-4e9b-4593-a3ef-e045b1a0c4a9",
  alley: "octgn:fbff9077-b7c2-4670-92ea-8ebaed5fc477",
  bedlam: "octgn:dc5c51d1-7528-46b4-b438-aae0cb744e29",
  ploy: "octgn:377d8e17-1c0d-4871-86a5-a69b9dee40d2",
  away: "octgn:647578d4-8c8d-44d7-8ef5-9c5d962369f0",
  /** Into Ithilien's setup card and Nightmare Deck (its Mûmak Elites set aside). */
  ithilienCard: "octgn:2491fe6d-38e2-4767-8e09-0174deb85ff8",
  elite: "octgn:048b6a57-f577-4dbe-a090-6eca1f266767",
  marksman: "octgn:066ed12c-00f8-4a8c-bb38-0acd926ccf51",
  captain: "octgn:a58dc702-4b9f-41ee-be83-136eda08906d",
  overlook: "octgn:9c5bec2f-cd2d-4d22-b8d3-b5dfb4e3345b",
  thickets: "octgn:b0e4169e-0dd1-4abc-a021-e6b16ebc0bd2",
  cormallen: "octgn:73611bf0-cc37-418a-88bc-ed01624ab33d",
  arrows: "octgn:50dda27b-1bf7-43d4-a6e2-eced8d60515a",
  fray: "octgn:b8caa465-cf1c-4be2-a32a-cab116ff0886",
  /** The Siege of Cair Andros's setup card and Nightmare Deck. */
  siegeCard: "octgn:846e56e8-ac94-41e0-b29a-aacf7ca8d39e",
  archer: "octgn:3bd3e9f2-6411-4ea3-9ff4-1ea1d51e202d",
  saboteur: "octgn:2c7390c5-06a8-451e-9895-88fb705e18e8",
  ravager: "octgn:04eb1904-64a4-4b89-ae71-38ee175aa093",
  courtyard: "octgn:c9e280a4-06b8-48bb-918d-da247e15157c",
  walls: "octgn:3a17475b-3238-4577-9fd5-83b67e2d0aa7",
  wharf: "octgn:f16bf495-bb88-4c5e-9a3f-5ba2d8bb916a",
  ruin: "octgn:49d6a591-67b0-4d65-a384-ae0662b09814",
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
  /**
   * The standard encounter sets the setup card's removals assume, when they
   * differ from the scenario's: The Long Dark's removes Deeps of Moria cards,
   * where its rulesheet names Hazards of the Pit.
   */
  sets?: readonly string[];
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
  "road-to-rivendell": {
    card: NIGHTMARE_DD.rivendellCard,
    removals: {
      "Ruined Road": 2,
      "Barren Hills": 2,
      "Goblin Taskmaster": 1,
      "Black Uruks": 4,
      "Mountain Warg": 3,
      "Bitter Wind": 3,
      "Warg Lair": 2,
      "Goblin Spearman": 5,
      "Goblin Archer": 2,
      "Plundered Armoury": 2,
    },
    questRemovals: { "Orc Outpost": 1 },
  },
  "the-long-dark": {
    card: NIGHTMARE_DD.longDarkCard,
    removals: {
      "Goblin Follower": 4,
      "Branching Paths": 1,
      "Burning Low": 3,
      "Stray Goblin": 2,
      "Chance Encounter": 2,
      "The Mountains' Roots": 2,
      "Abandoned Mine": 1,
      Fatigue: 2,
      "Goblin Sneak": 4,
      "Rock Adder": 3,
    },
    sets: ["The Long Dark", "Twists and Turns", "Deeps of Moria"],
  },
  "shadow-and-flame": {
    card: NIGHTMARE_DD.shadowFlameCard,
    removals: {
      "Goblin Scout": 3,
      "Goblin Tunnels": 2,
      "Stray Goblin": 3,
      "The Mountains' Roots": 3,
      "Ranging Goblin": 3,
      "Fiery Sword": 1,
      "Many Thonged Whip": 1,
    },
  },
  "foundations-of-stone": {
    card: NIGHTMARE_DD.foundationsCard,
    // Its cards with the Foundations of Stone icon join the set-aside set
    // (foundationsRecipe); printed "Brancing Paths".
    removals: FOUNDATIONS_NIGHTMARE_REMOVALS,
  },
  "peril-in-pelargir": {
    card: NIGHTMARE_HON.pelargirCard,
    removals: {
      "Collateral Damage": 4,
      "Harbor Storehouse": 2,
      Pickpocket: 3,
      "Harbor Thug": 1,
    },
  },
  "into-ithilien": {
    card: NIGHTMARE_HON.ithilienCard,
    removals: {
      "Blocking Wargs": 1,
      "Watcher in the Wood": 2,
      "Secluded Glade": 3,
      "Forest Bat": 3,
      "Southron Mercenaries": 3,
      "Overgrown Trail": 1,
    },
  },
  "siege-of-cair-andros": {
    card: NIGHTMARE_HON.siegeCard,
    // The setup card prints "Orc Arsonists".
    removals: {
      "Southron Mercenaries": 3,
      "Orc Arsonist": 2,
      "Orc Rabble": 2,
      "Orc Arbalesters": 3,
      "The Power of Mordor": 1,
      "Scourge of Mordor": 2,
    },
  },
  "the-stewards-fear": {
    card: NIGHTMARE_AS.stewardCard,
    // Its setup card's front is the Nightmare Deck's introduction: the
    // removals follow the source recipes (Q03.4 to N03.4).
    removals: {
      "Underworld Dissident": 3,
      Storehouse: 2,
      "Market Square": 2,
      Pickpocket: 3,
    },
  },
  "watcher-in-the-water": {
    card: NIGHTMARE_DD.watcherCard,
    removals: {
      "The Watcher": 1,
      "Makeshift Passage": 2,
      "Black Uruks": 4,
      "Mountain Warg": 3,
      "Warg Lair": 2,
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
/** The standard encounter sets of a Nightmare game, when its setup card assumes others. */
export const nightmareStandardSets = (id: ScenarioId) => NIGHTMARE[id]?.sets;
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
  if (s.scenarioId === "road-to-rivendell")
    return [
      "Road to Rivendell · Nightmare mode: an enemy with ambush that engages a player during the quest phase still counts its [threat] in the staging area until the end of the phase; stage 2 is Ambush in the Night.",
    ];
  if (s.scenarioId === "the-long-dark")
    return [
      "The Long Dark · Nightmare mode: Durin's Greaves gains surge. Lost: the first player chooses and discards an ally in play. The standard encounter deck uses Deeps of Moria, whose cards the setup card removes.",
    ];
  if (s.scenarioId === "shadow-and-flame")
    return [
      `Shadow and Flame · Nightmare mode: Durin's Bane's shadow cards come from the Balrog deck (${s.nightmare?.balrogDeck?.length ?? 0} ${(s.nightmare?.balrogDeck?.length ?? 0) === 1 ? "card" : "cards"}; ${s.nightmare?.balrogDiscard?.length ?? 0} in its discard pile), reshuffled at the beginning of each combat phase.`,
    ];
  if (s.scenarioId === "foundations-of-stone")
    return [
      "Foundations of Stone · Nightmare mode: when stage 3B is revealed, all Mount and Artifact cards are discarded from play, and each player discards allies until the total printed cost of their allies is 6 or less. The Nightmare Deck's cards with the Foundations of Stone icon wait in the set-aside encounter set.",
    ];
  if (s.scenarioId === "peril-in-pelargir") {
    const engaged = s.table
      ? s.table.seats.flatMap((seat, i) =>
          i === s.table!.active ? s.engaged : seat.engaged,
        )
      : s.engaged;
    const foe = [...s.staging, ...engaged].find(
      (u) =>
        card(u.code).type_code === "enemy" &&
        u.attachments.some((a) => a.code === HEIRS_NUMENOR.scroll),
    );
    return [
      `Peril in Pelargir · Nightmare mode: at the end of the combat phase, Alcaron's Scroll in the staging area attaches to the enemy in play with the highest [defense]; at the beginning of the refresh phase, the enemy it is attached to gets 1 progress token${foe ? ` (${foe.progress} on ${card(foe.code).name})` : ""}; an enemy with 3 or more progress tokens escapes with the scroll, and the players lose.`,
    ];
  }
  if (s.scenarioId === "into-ithilien") {
    const aside = s.nightmare?.eliteAside ?? 0;
    return [
      `Into Ithilien · Nightmare mode: both Mûmak Elites were set aside; one enters the staging area as each of stages 2A and 4A is revealed (${aside} still aside).`,
    ];
  }
  if (s.scenarioId === "siege-of-cair-andros")
    return [
      "The Siege of Cair Andros · Nightmare mode: player cards in the victory display contribute no victory points. Besieged Courtyard, Walls of Cair Andros and Anduin Wharf are discarded at 5, 4 and 6 damage, with their effects.",
    ];
  if (s.scenarioId === "the-stewards-fear")
    return [
      `The Steward's Fear · Nightmare mode: False Accusations and Murderous Turncoat are in the underworld deck (${s.stewardFear?.underworldDeck.length ?? 0} cards); the hidden Plot was chosen among 5; a destroyed enemy is shuffled into the underworld deck before stage 3; a Clue in the staging area is shuffled back at the beginning of the refresh phase.`,
    ];
  if (s.scenarioId === "watcher-in-the-water")
    return [
      "The Watcher in the Water · Nightmare mode: while Doors of Durin is in play, The Watcher cannot be engaged; a destroyed Tentacle enemy deals 1 damage to The Watcher; the players cannot win unless both Doors of Durin and The Watcher are in the victory display.",
    ];
  return [];
}
