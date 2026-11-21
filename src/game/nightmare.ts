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
import { threatElimination } from "./threat-elimination";

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
  /** The Drúadan Forest's setup card and Nightmare Deck (its Drû-buri-Drû set aside). */
  druadanCard: "octgn:2387ac72-763b-47e0-b9f3-29a08dbeb200",
  boss: "octgn:c2a753b8-dfb3-4bdf-a0b4-523323c52f43",
  warrior: "octgn:f9a62ed6-f066-478d-9af0-0c39dea250dd",
  stalker: "octgn:8c844d0e-74df-4def-a1e7-cb5d2e255908",
  mirk: "octgn:17353135-52af-42a8-a6af-3b2e9148bf5f",
  eilenach: "octgn:6c86b76e-003d-40aa-af57-bd0e6536a2f6",
  stonewain: "octgn:b509154c-7596-4a48-941e-0dfa7277d0cf",
  drums: "octgn:63b5d3fe-227a-4781-b9ef-52dc6fb656d5",
  darts: "octgn:27f961dd-c360-418e-9aac-6756d3a46dde",
  /** Encounter at Amon Dîn's setup card and Nightmare Deck. */
  amonCard: "octgn:b7be2ad3-5ea1-4cc5-98dc-c7d3cf45cb71",
  raiders: "octgn:77b11dde-8c66-4977-8ad9-3525a4b70a3f",
  pillaging: "octgn:791c7f2d-26ce-4719-a9ca-eaaa11b10924",
  homestead: "octgn:b35ad07f-7862-4479-bc04-7dcf76e7cbc5",
  village: "octgn:037cd2ac-cb12-4905-bd2b-86ae57350a1b",
  trapped: "octgn:22511a31-8420-4f18-b834-be80c89d5e6a",
  run: "octgn:b4dcd330-15c0-4700-b1aa-d235f253b1de",
  saveUs: "octgn:a067986f-6c42-446d-8a23-58d0190c39f0",
  sundered: "octgn:b86d305d-12ba-43bb-9356-fd424f63ace5",
  /** Assault on Osgiliath's setup card and Nightmare Deck (its Palace Remains staged). */
  osgiliathCard: "octgn:5e0ecd2d-d63e-4507-8707-641b974398ff",
  invading: "octgn:c9604830-bb2f-4016-b914-7c41248513b5",
  haradrim: "octgn:6b928a6d-c90b-4e94-931e-ba5f8f1ebaf4",
  palace: "octgn:ac4da79d-d966-45bf-b1d3-c4d0a348dd7e",
  battlements: "octgn:d4b810a1-7d10-4610-9609-fb7f7568e5f5",
  eastern: "octgn:2e502d3d-5cf5-47eb-9577-3c14d74995fa",
  western: "octgn:6d567c10-864f-48a8-8104-14882b2b254e",
  relentless: "octgn:15ccb88a-9a78-4aac-a1f2-839070a19016",
  overrun: "octgn:ffc5f529-5d18-4870-970b-7503c176f56b",
  pressed: "octgn:d74119d9-703c-4d5a-998b-4788230254c9",
  /** The Blood of Gondor's setup card and Nightmare Deck (its Black Númenorean staged in place of the scenario's). */
  bloodCard: "octgn:118672b6-c6e2-43ec-ae3d-8657d8b659d5",
  numenorean: "octgn:13c23487-ad49-437b-be41-1c09dd5c30e4",
  trickster: "octgn:ef8af2c9-e9c7-463a-8853-c9ccfc3eff69",
  marksman: "octgn:330cc524-6e48-4aa8-a201-d80e1b67570e",
  edge: "octgn:d2e0ef58-b688-4cf7-9289-246b0af56ba8",
  mountains: "octgn:866767a4-a4e9-4f61-b8eb-88f21e2fe6f2",
  surrounded: "octgn:3459889b-48a2-4401-b511-6e11dabec437",
  onslaught: "octgn:812dce54-8a84-4a44-94ee-5b2cd2bf1997",
  /** The Morgul Vale's setup card and Nightmare Deck (1 progress token on To the Tower at setup). */
  morgulCard: "octgn:d6d15b55-0418-48a4-8571-9495c1e52232",
  nurn: "octgn:f1112857-2210-4087-b262-5862aed26b68",
  captor: "octgn:740357cb-f22e-4888-aed5-ccc67728b69d",
  sentry: "octgn:b490fe8e-4367-424d-8a5c-bc7b8e1a56a7",
  banks: "octgn:43375421-21f6-4e77-855c-0d29d145c803",
  ephel: "octgn:85ee1e86-178d-40cf-81d3-c86f5a1f2678",
  fields: "octgn:a1e74757-c5c8-4b81-a01a-6406410f661d",
  beckons: "octgn:56fbff9f-2518-4ea3-918b-caf14a93738d",
  fumes: "octgn:18150bb4-3157-429c-b958-af1210acd4b2",
} as const;
/** The Hobbit: Over Hill and Under Hill Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_OHUH = {
  /** We Must Away, Ere Break of Day's setup card and Nightmare Deck (Troll Key and Troll Purse gain surge). */
  wmaCard: "octgn:1c31e98f-1c81-4d10-b434-3b4e66c49f3c",
  crows: "octgn:4f73ca81-67c1-44db-a7ca-63a762748fc4",
  river: "octgn:0071049b-ca5b-4083-b955-a74da4aad5f1",
  hilltops: "octgn:f036c797-cede-404b-8cc3-d975a9f86ebc",
  light: "octgn:f4f20186-79fb-4d53-9431-ecd719fd152b",
  mince: "octgn:aebb2c2f-859e-4f08-9017-1fcc4a4cc528",
  night: "octgn:1d23916d-4e14-4b1f-ab4b-02a231870465",
  oneByOne: "octgn:5c4fb1ac-a989-463d-a622-367882c56d4e",
  /** Over the Misty Mountains Grim's setup card and Nightmare Deck (shared between its two encounter decks). */
  ommCard: "octgn:d70f1956-fa20-4237-8a75-ab7678ed9840",
  ledge: "octgn:2f1ba4e7-ddc6-4d97-93d3-31907840aed0",
  valley: "octgn:7d76b849-a3c7-4e2d-ab9d-f02ff0cca709",
  splinters: "octgn:364ef18d-2a93-4ea9-a2f6-799a4e1b7617",
  greatGoblin: "octgn:1919025a-6f04-497f-b024-8ed3fd91b0c9",
  prowler: "octgn:c6582860-80cf-48d6-92f3-dde5e3e31333",
  passages: "octgn:f7a42b56-2a8e-4c6f-b60c-5031ad2a99db",
  swish: "octgn:7d3ef70c-4107-4747-9913-048224ba6e76",
  /** Dungeons Deep and Caverns Dim's setup card and Nightmare Deck (The Lower Gate set aside until stage 3B). */
  ddcdCard: "octgn:a0a4d2cf-ed07-4942-9588-8fca05f75bbf",
  lowerGate: "octgn:94c35d99-945d-470d-9914-331e480c8cce",
  wickedWolf: "octgn:b0caeaa6-2c96-4d92-9cca-7cb55387d8c0",
  sentries: "octgn:a25d1abc-f24e-4ce7-bf14-cb5adb007a4d",
  pine: "octgn:15e5feb5-73f4-4472-b279-1887ff29f691",
  stones: "octgn:536fa3c6-a078-4e79-b316-70cdc826e5d7",
  whereIsIt: "octgn:f631b06f-1f0c-45aa-b5af-c4f9b9a41455",
  weHates: "octgn:fb951af8-2bc7-4529-8e16-ca85a362aac1",
} as const;
/** The Hobbit: On the Doorstep Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_OTD = {
  /** Flies and Spiders' setup card and Nightmare Deck (each player gives 1 poison to a hero at setup). */
  fasCard: "octgn:337906ff-c49f-4768-ad9f-57561a4c1eb1",
  attercop: "octgn:c101383e-807d-44b7-992d-a8299c4402a0",
  venomous: "octgn:8607dbe8-720a-436f-a946-af666e5db568",
  colony: "octgn:ebf0f1f6-8627-4d7d-986e-fd7ae9a2de55",
  path: "octgn:aac8023b-431b-4cfa-8f6e-659a4e8dd04e",
  patch: "octgn:92d3dcbb-8ce7-40fa-9df1-44617ebf08b4",
  battle: "octgn:0f9b520c-f5c8-4704-a887-feb72fe7cba5",
  bite: "octgn:8471389d-5424-41f9-8ed8-e7f29e9e78f4",
  /** The Lonely Mountain's setup card and Nightmare Deck (no stage 3 while a treasure remains under the Mountain). */
  tlmCard: "octgn:efe062c5-dcdc-47fb-a66a-5c31f4ed5f7c",
  ereborBats: "octgn:424d4f29-d7c6-465f-9742-adb51177affc",
  tunnel: "octgn:8da00775-fb2b-4abe-bde9-39ecce643d5d",
  spur: "octgn:f2484786-8e29-4d43-866e-31c4adae3b1f",
  frontGate: "octgn:2e77da31-a3ef-4bea-9af8-3f663c608a62",
  ire: "octgn:fa005ccd-cf35-4d49-8259-23f3c8035954",
  lust: "octgn:ece25a80-d4c6-4032-90eb-ca485da5373d",
  /** The Battle of Five Armies' setup card and Nightmare Deck (progress on the setup card at stage 5B loses the game). */
  bofaCard: "octgn:46ac76d7-4215-4840-a029-c4aceb051b94",
  greatWarg: "octgn:d4309384-8472-4385-8122-163d6c4c8396",
  frenzied: "octgn:b028411b-ab1d-4a54-a9d0-38cb70489f98",
  elite: "octgn:40956aef-c093-489d-b74a-24502705c6bb",
  valley: "octgn:29baa3ae-f954-49c1-b127-f364887f80a7",
  ridge: "octgn:487955be-4805-427c-984b-23bb88e697a6",
  dread: "octgn:1b770413-a3b1-41ae-b843-b3b9e78b2906",
} as const;
/** The Voice of Isengard Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_VOI = {
  /** The Fords of Isen's setup card and Nightmare Deck (hands refill to 3 as each new stage begins). */
  fordsCard: "octgn:d985a0cd-4c06-4e2e-b05a-ad0ac9ac86be",
  assassin: "octgn:f53cd455-26e0-419c-967d-45ecc9990bab",
  vengeful: "octgn:40299169-8b0f-4462-ae58-03db71c0970f",
  savage: "octgn:82f9180c-0d38-4485-b99b-d15ed7910e17",
  western: "octgn:f642149c-2bfe-44c1-b4d6-dbf30ef5c988",
  eastern: "octgn:6a768da7-6c40-4002-ad01-e405edd4f286",
  isenRiver: "octgn:d26e6602-0c2d-440e-8065-10cfa89687c1",
  brutal: "octgn:1e392c0d-2fc3-4d57-8209-3a5e64292f3d",
  /** To Catch an Orc's setup card and Nightmare Deck (a Vigilant Orc in each out-of-play deck; Mugash's Rage waits for stage 3A). */
  catchCard: "octgn:aae56769-69c1-4693-bcbe-dcd282c29568",
  vigilant: "octgn:5e24cde4-29e5-4f8f-82c5-67f96f9c3283",
  lookout: "octgn:20a4504c-13c1-4129-b04e-2025a0a180ff",
  guardWarg: "octgn:2f273bdf-2c16-43e6-8845-5899cac1e3ab",
  peak: "octgn:8a2a900e-3e98-4724-9350-93afa955016a",
  trail: "octgn:50f22268-96bd-441f-bfab-b11f9e3c0f21",
  cunning: "octgn:4a9980e2-9b62-4658-8128-3493060a0f92",
  patrolling: "octgn:69a5def2-08da-498c-83d6-406ecbd6bc04",
  rage: "octgn:fcf26273-b39d-413c-aece-0c007888e527",
  /** Into Fangorn's setup card and Nightmare Deck (a Huorn engaged with each player; stages 1B and 2B wait for Edge of Fangorn). */
  fangornCard: "octgn:d495b495-db4b-496a-9294-c956afd1db9f",
  huornOfFangorn: "octgn:35376ae0-c807-4c16-8f4d-e14d36aec142",
  blocking: "octgn:3dab12d3-6cf8-4d3c-9edc-df93db02eced",
  wicked: "octgn:414a8370-1c4d-4e95-b33d-3b6f59db315c",
  tangledForest: "octgn:c5e24012-cbaf-40aa-b4af-28d3464e72a7",
  entwood: "octgn:726db6b7-4ff6-4ebc-b1c3-0e52b0fd3c95",
  darkCorner: "octgn:1fc9cfde-aff7-4210-b3da-c7ddb00a9c1e",
  stifling: "octgn:edc600d3-b128-45a9-9f15-9a651901a90a",
  anger: "octgn:a753e0fd-510a-40e2-8a87-ed306f156358",
} as const;
/** The Ring-maker Nightmare Decks' cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_RINGMAKER = {
  /** The Dunland Trap's setup card and Nightmare Deck (printed removals only). */
  dunlandCard: "octgn:b42cd34e-7eb6-4163-8ef6-4a2f66f45439",
  ambusher: "octgn:f5f06bf8-82ae-437f-95e9-1d67312a78f2",
  skirmisher: "octgn:354f9e8d-aa47-4493-a697-b59f0bd178ea",
  plains: "octgn:efb4a7ca-6892-43e8-9de4-ab8d2ffc7cdc",
  river: "octgn:f2f7e1d5-9be6-4a8a-bb46-50ae4da2cb16",
  woods: "octgn:ffbf96c9-ee9f-4462-b1c5-1acf8609015a",
  assault: "octgn:fea90493-29cd-4668-9e3b-eb3150cdc339",
  stalked: "octgn:81907a30-abb2-44de-b3be-eb44e43977d8",
  /** The Three Trials' setup card and Nightmare Deck (engaged Guardians' threat; the Trial of Intuition's protections). */
  trialsCard: "octgn:f096ca9b-c50e-4897-b0c6-216c9c520bee",
  wolfSpirit: "octgn:b644346d-3791-41f4-9d8a-0fd281e36b8b",
  boarSpirit: "octgn:bc629269-aa5b-4f5c-b071-c1413f85d24c",
  ravenSpirit: "octgn:c8a7cd39-10e0-4d50-a75b-e8a7ac24e32f",
  sacred: "octgn:f1dda3f9-e4cc-4c36-8167-a31dfdce2637",
  pillars: "octgn:4008f69c-fda2-4fe4-a8bd-373d38203c87",
  burden: "octgn:a142205c-6aa0-4fed-be81-312c2dd33673",
  ancestors: "octgn:4aacc507-dfaf-4193-98c5-09dbf879423d",
  /** Trouble in Tharbad's setup card and Nightmare Deck (starting threat +5; The Crossing at Tharbad while Bellach is in play). */
  tharbadCard: "octgn:9fb6747a-1dd1-4a38-8c55-9459fda296c1",
  hunter: "octgn:2bc9f441-e922-4509-aef9-a27e485ed227",
  seeker: "octgn:715a7c96-17de-4e8d-8771-a8ae0e36e732",
  hound: "octgn:fa961100-1d40-4614-b405-faf9c00e2a83",
  city: "octgn:99d7fe5f-dcb5-43e2-9b73-8d47e661e6be",
  pathway: "octgn:be2d2c3f-db7a-43bc-b0e8-43587dfce5c9",
  waylaid: "octgn:4b748920-83c0-473a-a2fd-0ec8a6b3f1b8",
  patrol: "octgn:68384cac-543c-4e62-9866-e066f2ad27f0",
  /** The Nîn-in-Eilph's setup card, new stages and Nightmare Deck (Ancient Marsh-dweller at stage 2A). */
  ninCard: "octgn:30252ae6-2652-45b9-a245-41abd03d05d6",
  arduous: "octgn:ec21ab35-cc55-4e35-9ed7-b143bd94f17e",
  deadly: "octgn:9ad3750c-5cb8-45c7-be04-b454f1d7de82",
  meadow: "octgn:1e2c314d-2673-41d5-9905-3d60b5f33d98",
  marshAdder: "octgn:27393c24-6278-4202-91ef-ef3d708387e6",
  quicksand: "octgn:5f93b0c2-fa71-43e3-bfd6-c68c283e5328",
  stench: "octgn:5fd07c1e-b086-4618-aa6e-89ff34f85c28",
  peat: "octgn:87025e60-afc4-410b-9b97-c5f527b524c8",
  swarms: "octgn:cbbc2de7-c8ab-4c7b-8b83-8d29debf1696",
  /** Celebrimbor's Secret's setup card and Nightmare Deck (progress on staged locations; its own Scour). */
  celebCard: "octgn:79b22351-0e03-4bb9-87cb-b0cbefbefb60",
  bodyguard: "octgn:58615245-a21c-4f45-9636-9f76e2a7f19e",
  snuffler: "octgn:0db0ef38-f9c4-47b1-a6a9-0aa5b9c1f538",
  bones: "octgn:30ccffbd-b86a-4f6e-a286-8e8c753266ed",
  dusty: "octgn:d4afa945-f35f-4ae3-adb5-c90ed54f5e91",
  hateful: "octgn:6c9c2d37-2ca5-4753-8e1d-655fa5cd3ae7",
  agent: "octgn:730dcb7f-df08-450a-8e28-9b436e11bce8",
  closing: "octgn:f0a7b02f-4d0f-49c6-8c27-1600af0022e7",
  /** The Antlered Crown's setup card and Nightmare Deck (locations with time counters; Dunlending Horde in the Raven deck). */
  crownCard: "octgn:ed458b9f-c913-4cb6-9f47-7760bba94c5b",
  elite: "octgn:381569ad-e2bf-4fb5-a045-a36b918deac4",
  druid: "octgn:33a1b9de-6b17-49f8-8eb3-7dd98feaf1cb",
  horde: "octgn:56243a40-0019-406a-b502-34dd17d8b6cf",
  stronghold: "octgn:5c525922-8f10-4793-b7c8-3fec9b3ce3f6",
  highlands: "octgn:be9453b3-7576-4893-88d5-d62f0331411e",
  talisman: "octgn:7f16112f-596c-43aa-b73e-3870f0325d66",
  gathering: "octgn:12429164-0155-45e4-aa1c-e94292084bdf",
} as const;
/** Over the Misty Mountains Grim's Nightmare cards with The Great Goblin's encounter set icon: they join the second (Goblin) encounter deck. */
export const NIGHTMARE_OMM_GOBLIN_DECK: readonly string[] = [
  NIGHTMARE_OHUH.greatGoblin,
  NIGHTMARE_OHUH.prowler,
  NIGHTMARE_OHUH.passages,
  NIGHTMARE_OHUH.swish,
];
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
/** The Black Riders Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_TBR = {
  /** A Shadow of the Past's setup card and Nightmare Deck. */
  shadowCard: "octgn:4422e6ce-b272-4a2d-bd05-bf3f41063ea6",
  khamul: "octgn:dd71d27f-b53e-453b-bcbc-bb479104461a",
  horseman: "octgn:fcf4a99e-38f0-4809-8eb1-a1120776722b",
  eastfarthing: "octgn:e07f95e5-8cae-4b4a-b3e7-92da7ddb1d68",
  greenHill: "octgn:40bcc7a9-044e-44b6-83d2-6e09294c19c3",
  stockWoods: "octgn:87b6ecff-219c-4002-b46b-ca683cb4c25b",
  mordor: "octgn:b0ed537a-1e96-4b46-af9b-3449be219781",
  followed: "octgn:86e0fbfc-04da-46b0-807b-ac58bd60248b",
  sniffing: "octgn:784aedb3-8bc3-437c-ba35-2a94949c498d",
  /** A Knife in the Dark's setup card and Nightmare Deck (its Weathertop set aside). */
  knifeCard: "octgn:12dd413b-fe0f-40ca-b871-480ca88ade09",
  wraith: "octgn:90d64456-eceb-423b-866f-ece8ceb98ec3",
  spy: "octgn:b73f14e3-f528-4a8f-bf3b-06936eeea9fd",
  weathertop: "octgn:e8046e94-bc12-4055-b5f1-2cd34640b85e",
  hills: "octgn:61b6316c-dfbd-4f90-ab71-99eee8056047",
  oldRoad: "octgn:d3650ee1-5225-4a8f-9114-e1123d941228",
  inn: "octgn:9834324f-1ad0-4922-a708-d07ca671d9b3",
  ringsWill: "octgn:1698dbfd-7649-44ef-b618-6171e626caa6",
  bladeTip: "octgn:7d5b9903-3521-4ecc-9225-e6216147e020",
  /** Flight to the Ford's setup card and Nightmare Deck (its Fell Riders staged, its Ford of Bruinen set aside). */
  fordCard: "octgn:07c4aed0-1673-438f-8e2b-371f34f215b4",
  fellRider: "octgn:5e6ece32-827a-4af7-af6b-0d21a0477c99",
  ford: "octgn:49e734b0-3b71-45e4-8f31-ad1e09f1d9e4",
  trollshaw: "octgn:3029e445-173b-481b-9a62-61f79185ab30",
  eastRoad: "octgn:32bd5a1d-7273-4916-aa3b-cb152c1cd6f1",
  wilderness: "octgn:2f380c3c-7de7-4961-b5f5-878f3e4e58c8",
  ettendales: "octgn:3d64b8b8-4805-49d5-b308-4bf3fb472c1d",
  comeBack: "octgn:3b63d940-fcbc-4741-8840-cc276fcb558b",
  twilight: "octgn:b432d02a-d0ca-496c-96c0-e8f5753b2e17",
} as const;
/** The Road Darkens Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_TRD = {
  /** The Ring Goes South's setup card and Nightmare Deck (its Pale-green Tentacles set aside). */
  southCard: "octgn:8db8a9b7-402f-40fe-943e-8a3e58662b38",
  tentacle: "octgn:34e81b70-82c4-4fb4-8e6b-e3df7f587181",
  hawk: "octgn:73867364-ecad-451c-b75f-3da7ea1f1b48",
  warg: "octgn:6c01519b-bb2c-4c8b-b5d3-4951d2a32d13",
  expanse: "octgn:fd9a5cdb-071c-4a2c-aa1e-b25d22d06a10",
  slopes: "octgn:958e2ca4-208c-4235-be56-afc463e9eb2f",
  hunted: "octgn:89a39894-f5d2-42a5-9927-fb057db778f4",
  shelterless: "octgn:c1b934af-a47f-4886-846f-c319b2efeca0",
  /** Journey in the Dark's setup card and Nightmare Deck. */
  darkCard: "octgn:d3a5ad2f-39b9-4ec8-b1f2-da2049c470b4",
  slab: "octgn:86fb45b5-6fd4-44ce-98d7-ab8a7fe3b611",
  zirak: "octgn:e4660d9f-4779-4103-ad48-36337065931b",
  glowing: "octgn:c3b3a3e0-1575-4094-a6b3-853b569f8046",
  mine: "octgn:35a5ec34-97ea-4b9e-9fdc-6a00c39c504d",
  whip: "octgn:dc2da597-7d44-4654-a3f4-860e3f7117d6",
  sword: "octgn:c7c7761f-a4dd-4f09-ac10-f0483d0c931d",
  weary: "octgn:0d3586ef-3159-4066-8417-aba5c379739a",
  cutOff: "octgn:7e9a0e02-59cd-46de-83a8-4b8fe49c7021",
  /** Breaking of the Fellowship's setup card and Nightmare Deck. */
  breakingCard: "octgn:dda5488d-b1c3-40bf-b6c1-2c34b8c14cdd",
  isengardArcher: "octgn:ea09c696-81a1-4e2f-95ec-3b8c6d9b8d0b",
  isengardTracker: "octgn:ffd14d9f-b3e4-46c4-b7b1-f7fcba350ba0",
  langflood: "octgn:f310684a-aa58-46f5-aa43-a6289e7c7b66",
  emynMuil: "octgn:a3f162a7-847d-47ed-8a05-4e930806765b",
  arrowsNight: "octgn:aa7977bd-06af-4a8f-bc94-7162250eff7a",
  huntingRing: "octgn:c857d5a3-2b1f-4ef9-a5c7-2368ec28d15c",
  discord: "octgn:3b803986-90bc-441c-aec0-932d661eb8eb",
} as const;
/** The Lost Realm Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_TLR = {
  /** Intruders in Chetwood's setup card and Nightmare Deck. */
  chetwoodCard: "octgn:8231bc2d-f52d-429c-b969-a77a7e5aca52",
  abductor: "octgn:1384425f-206b-47ab-96ed-c322e7295a75",
  soldier: "octgn:fe5ce9b0-2dd0-49f7-b3d3-6df03d367b33",
  northern: "octgn:3748b1e3-625d-4752-831d-4d52b2366359",
  outskirts: "octgn:d43b2298-a255-4afa-a95b-f7f1c8420757",
  greenway: "octgn:6259c002-16d5-4499-baa8-f0e9b8b2ffda",
  greatHost: "octgn:5211f81c-288a-4243-889d-6e294fbc3b8c",
  killThem: "octgn:e7995075-7f11-4f8f-ab16-e7455b67afc2",
  shadowParty: "octgn:bfd46195-4981-47f4-95c1-84f9ec2cadc2",
  protect: "octgn:0569374c-0f0d-461e-8047-cf467393c38f",
  /** The Weather Hills' setup card and Nightmare Deck (its Captive Villagers and Rearguard Ambushers in the Orc deck). */
  weatherCard: "octgn:4ee09875-c105-4532-ba68-3701f3327696",
  villager: "octgn:90f60cd2-e787-4b40-8b3a-35be274d0e9b",
  ambusher: "octgn:cf123545-659f-41b9-8051-8ed29302ca2c",
  raider: "octgn:0b6022c0-c46c-411f-90b3-b6ad267ebb8e",
  valley: "octgn:7c01b52d-35ed-449a-83d1-5879f608ef42",
  tower: "octgn:e62b817f-7806-40ad-95e3-a7c3e805e95d",
  tracks: "octgn:db7a5fb4-f390-49c2-b555-d963350cd8ff",
  track: "octgn:74c7150c-c65d-480b-8673-cd2509fc992b",
  /** Deadmen's Dike's setup card and Nightmare Deck. */
  dikeCard: "octgn:9d460d1a-45d9-4828-a40e-2dbddc51c086",
  horde: "octgn:68ddf4d3-6336-40ed-862c-c68ae97ffb28",
  cursedDead: "octgn:a9d496bb-46b8-4660-8ae8-430a4cafb997",
  palace: "octgn:7ddffdc0-bb6f-4ab3-a6df-c2df039062e8",
  street: "octgn:d1cc7784-d659-4b87-8ce5-ffea723ee715",
  city: "octgn:d413aeaa-974a-478f-8a06-bd12d4ab661f",
  fear: "octgn:3dd092db-4bb4-4f56-b3cd-447328ac97ac",
  curse: "octgn:55dd30df-7b57-4cc9-b778-f8a4bfe72431",
  courage: "octgn:66fc0634-c88c-4af2-a009-8ade84806f98",
} as const;
/** The Treason of Saruman Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_TOS = {
  /** The Uruk-hai's setup card and Nightmare Deck (Mauhúr set aside until stage 2A). */
  urukCard: "octgn:94923076-b890-4a15-b576-5bba2e2ab2b4",
  mauhur: "octgn:36384b25-2c8d-4999-9c38-70a461a45518",
  lugdush: "octgn:7595e0f2-391c-4c39-9147-888d53031784",
  whiteHand: "octgn:5b883ef3-a7f1-4c88-870b-af254e9d2151",
  wold: "octgn:a58a4337-b935-4b6c-b6fb-72e71e8bb9a8",
  enchanted: "octgn:69b6719b-07f5-4514-b747-21fd0e2e9463",
  trail: "octgn:196e8d0a-70c6-49f9-b26c-2ed2b7d3ac87",
  command: "octgn:bd44e9b4-5226-4fb5-a300-dffc9b35f6d4",
  draught: "octgn:ea7a8cd4-6e75-4ea7-85d1-9f89a66c9d19",
  /** Helm's Deep's setup card and Nightmare Deck. */
  helmCard: "octgn:687a4018-2f4f-4c37-a8ad-c293bb8f2f04",
  host: "octgn:45f8c9d9-4911-484b-b203-a55a32977af5",
  berserker: "octgn:14531c46-aad5-4090-bb7d-2edf9f78e5ff",
  helmsDike: "octgn:fae22b80-f5aa-43b3-81dd-6c24c8a44a0d",
  hornburgWall: "octgn:1b66485b-7d01-47b6-8504-7fee5c2f2729",
  caves: "octgn:88a7e17c-4733-48c1-ad95-c2b01b8db5df",
  arrows: "octgn:5da26e76-9e95-4129-aea1-a3460f7b2132",
  crippling: "octgn:c828d0d2-0d82-49c2-b18d-7a819ee103b2",
  /** The Road to Isengard's setup card (Ent of Fangorn is removed from the game when it leaves play) and Nightmare Deck. */
  isengardCard: "octgn:5ab2daa0-b88d-47f2-8896-75bb6e76c350",
  archer: "octgn:3467d57f-412b-482a-8176-3d396a3a44f1",
  halfOrc: "octgn:b4bdb916-7538-461f-9aa5-141ff2809254",
  shaft: "octgn:a39f7fcf-952c-4789-91a2-ef12bc6a8f43",
  fortress: "octgn:955203ad-c973-4bdb-ade7-2e4f0fd43e9c",
  fumes: "octgn:0acfc1ee-22f6-41d9-8cce-594830b42ba8",
  traitor: "octgn:7b4b95f6-5b2d-47ff-b6cb-7bc6c9504b08",
  daunting: "octgn:eb01e452-e7ed-4617-9f4d-913d82753886",
} as const;

/** Angmar Awakened's Nightmare Decks. */
export const NIGHTMARE_AA = {
  /** The Wastes of Eriador's setup card and Nightmare Deck (Day and Night follow the scenario's Time objective). */
  wastesCard: "octgn:970eb6ec-5ec3-4444-9298-e0e8764fbda5",
  packHunters: "octgn:964209a4-0219-4fc0-a734-b89abd3074f0",
  wilderness: "octgn:8bfb1224-0a31-4ced-9e68-cb0b9d438035",
  badlands: "octgn:a203a422-201a-4b2a-b9bd-687258687479",
  wolves: "octgn:8bc37a15-f097-4471-8259-ac6f2cac3bc3",
  hail: "octgn:4d3d40e7-fc9a-414b-aaf9-2bae207a2e42",
  stand: "octgn:ec0c1c07-2d48-4fa8-948c-51d976ffe559",
  track: "octgn:cd23a6ca-9c2d-429f-9926-2fc75a67603b",
  /** Escape from Mount Gram's setup card (its captured deck setup and the heroes it keeps captured) and Nightmare Deck (Orc of Thaurdir joins the Angmar Orcs). */
  gramCard: "octgn:688f685a-c89d-46d5-92b6-d827e3ee83d9",
  jailor: "octgn:cf24afc6-3fa7-4b43-8ff6-75b78aab16e0",
  prisonGuard: "octgn:3798030e-df23-45db-ab29-0ef8a2a35cd6",
  prisonCell: "octgn:0cb30c28-b71c-4337-a4d1-6d5bc491bf81",
  chamber: "octgn:d9a1e647-cd77-43b5-97a4-686564697225",
  torment: "octgn:81da79b7-cf26-462e-a6e5-36f01f0145f5",
  goblinPatrol: "octgn:98ff43a9-a592-42da-8ea2-75558d0f7dea",
  vault: "octgn:66d1d599-0c19-46d2-9335-02d68c59a99f",
  thaurdir: "octgn:bcd69c86-8dd5-4c60-8f0f-5d19985ce913",
  /** Across the Ettenmoors' setup card (stages 2A and 3A find a safe location to guard the side quest they reveal), its stage 1 and Nightmare Deck. */
  ettenCard: "octgn:4e309ae8-11c9-4326-a5ad-60e4d16e60c4",
  ettenQuest: "octgn:b9acdd61-8007-41be-b986-e9809a587a70",
  serpent: "octgn:a1893a93-326b-429c-acd4-cd569b12bf18",
  stoneTroll: "octgn:8073dade-022c-4ad6-8891-5cb116506ed1",
  beetle: "octgn:753a527a-63b0-490e-9342-4ee4ac19bc1c",
  foothills: "octgn:c52272ad-0a46-4867-9873-e7ed1ffee0dd",
  vastFells: "octgn:fe544acb-93c9-4f7a-8743-9526c8b57943",
  thunder: "octgn:bcfbd822-5a8d-4090-9c36-e721488be682",
  barren: "octgn:2f3a59dd-d404-426e-9e40-1589cf690618",
  isolated: "octgn:dd28d391-8eca-4a12-9455-3d705adb46a5",
  rescue: "octgn:00a0a007-10dd-4a05-bedf-3a4e8ff972dc",
  /** The Treachery of Rhudaur's setup card (three encounter sets set aside until stage 2B) and Nightmare Deck. */
  rhudaurCard: "octgn:f6b545d9-8d93-4b10-866a-bfa15351ac69",
  hunter: "octgn:2fc8a29f-1de3-4821-8ea9-97d7385fa4d1",
  thrall: "octgn:2c012cbe-2e29-4b5f-9828-0cf8a325a604",
  courtyard: "octgn:37cd1ae2-e0fc-428b-9918-a4466f9a9d4c",
  cellar: "octgn:d75bd61b-ec33-431a-880f-cf9357314ea2",
  forces: "octgn:91d379b3-bbcb-48d1-81df-7b50e321e768",
  /** The Quiet the Spirits encounter set's card. */
  apostate: "octgn:c167ea82-42c5-4f08-a1ce-cfffdbf24af4",
  /** The Sift through the Debris encounter set's card. */
  antechamber: "octgn:0377297f-ce7d-47ce-9166-29f5872d5c97",
  /** The Decipher Ancient Texts encounter set's card. */
  drain: "octgn:6e38a878-8211-4bbc-ba7c-ed460874fd67",
  /** The Battle of Carn Dûm's setup card (the Siege keyword) and Nightmare Deck. */
  carnCard: "octgn:9cb0fd46-5ff4-4286-9843-f598723bc51b",
  orcWight: "octgn:5273452f-2d35-4a1c-91db-5bde684ed4a7",
  elite: "octgn:6008ab23-bedb-4501-aa1a-35bc555f905b",
  tower: "octgn:c5f58852-7f2a-4828-bd59-0b20c3059c40",
  gates: "octgn:cb77d46f-e8af-42f0-9619-da6e077ade04",
  decay: "octgn:40886c6a-0960-443b-8562-05b8fec9d34a",
  howling: "octgn:0bc8f9e4-7eac-4ac6-ae91-f5ba5d5052aa",
  blackMare: "octgn:8d99a2be-18d6-4bfb-85ab-7be54a18e6b7",
  flanks: "octgn:cde8957d-c9c8-4dab-a38f-7fa262247092",
  rally: "octgn:e2c4a5fe-dc9d-481b-b46b-91613e62d250",
  sever: "octgn:fa377dbc-a99e-4554-8c99-51835697ff8a",
  /** The Dread Realm's setup card and Nightmare Deck. */
  dreadCard: "octgn:c3d01d85-72cb-4d81-8b75-966ec4a1b9c4",
  guardian: "octgn:898579aa-324e-4e58-920e-30ab29c8700a",
  necromancer: "octgn:159f7a00-2c31-4e64-8adc-6143a5a7d8bb",
  sanctum: "octgn:c5711d74-8adb-427a-b0fe-e7a8c373659b",
  cursedHalls: "octgn:bc8020d9-4c85-4cf5-899f-3547d9d7efeb",
  powerBeyond: "octgn:346f832a-27ba-4c71-83b5-f690d0953911",
  daechanarCurse: "octgn:77414e71-92e8-4237-a627-4d92c02cddbc",
  allIsLost: "octgn:d0968637-1ffc-4365-855f-ee35704a8128",
  gift: "octgn:ac5c7c07-591f-4ac0-9080-e46433a50ff3",
} as const;
/** The Land of Shadow's Nightmare Decks (The Lord of the Rings saga). */
export const NIGHTMARE_LOS = {
  /** The Passage of the Marshes' setup card (Mire on explored staging locations) and Nightmare Deck. */
  marshesCard: "octgn:9f4fa8d5-eaa4-4089-82aa-1ea4563a237b",
  festering: "octgn:77ee7ac0-7957-4cb2-9f01-05eea2c80d6e",
  candle: "octgn:a6993cad-4a32-48f4-b5fc-289d39faf740",
  thicket: "octgn:04029ea1-9780-4335-a8a2-74c08710c3f2",
  pale: "octgn:b2113592-2485-4324-98c8-ab4bec23deae",
  rotting: "octgn:6e82330b-ca0d-4d6b-a796-024de152ca56",
  rot: "octgn:555dcce7-e705-4ba1-ba58-4880b449c178",
  rage: "octgn:9b0f5fb4-4f7f-4e89-8565-b327980f2627",
  /** Journey to the Cross-roads' setup card (1 Southron Warrior per player under The Cross-roads) and Nightmare Deck. */
  crossroadsCard: "octgn:797f8633-3df6-4e0e-b42e-c088f34e488f",
  warrior: "octgn:7fe4a83b-8654-4599-ab5d-6c06e56a7cdc",
  rearguard: "octgn:7b41bc67-160e-4d01-90ba-d00481aa3b81",
  glade: "octgn:38e03ed2-9492-4522-8ef1-014f0444b40e",
  fern: "octgn:1fa7117f-2e41-45ae-b81e-75da3ad36cf2",
  shadowy: "octgn:0f6dfe98-9645-4c52-93d1-cd6e9089c640",
  wrath: "octgn:7dcb70a6-4be1-4436-8e38-9ebdcc12d165",
  ware: "octgn:26fcc4f7-16bc-4134-b184-ede9bfe82906",
  /** Shelob's Lair's setup card (Shelob keeps her unresolved shadow cards; only Cleft of Cirith Ungol while it is staged) and Nightmare Deck. */
  lairCard: "octgn:227857db-5332-4c3a-b253-93f5886d8451",
  foulCave: "octgn:4de10000-6646-4e25-8208-4c277bbbcf80",
  torech: "octgn:31da2071-cc8e-4fb4-a3f8-062a235eb209",
  cobwebbed: "octgn:f774288a-fe38-4da1-ba57-3c3c2ada62a1",
  minasOrc: "octgn:f951fa4a-6087-442d-a8cf-0e80facba040",
  sentry: "octgn:38421493-b5f5-4399-b543-b59f69bbb43a",
  impenetrable: "octgn:36becc00-6e06-4b75-985e-9073f009defd",
  stench: "octgn:807c78ee-ec6b-4df0-9721-1e475f0d04dc",
} as const;

/** The Grey Havens' Nightmare Decks (the Dream-chaser cycle). */
export const NIGHTMARE_GH = {
  /** Voyage Across Belegaer's setup card and Nightmare Deck (two stage 2 quest cards, Brash Corsair in the Corsair deck). */
  voyageCard: "octgn:5111c160-ad76-4d33-bc50-52d171880e47",
  confrontation: "octgn:2e5c938b-9b70-4d8b-b632-479fedda84de",
  lost: "octgn:5583464f-f2e7-44cc-9d8f-87ea065b7e08",
  brash: "octgn:5212a036-a6f3-4979-a4cf-6f4a221bdf36",
  pursuer: "octgn:2a9e1288-4e94-497b-b1c4-41fd8ba34c65",
  open: "octgn:322a9715-116f-4cc8-91b5-e090f3074dbb",
  shattered: "octgn:fe88f19e-2ea8-45d7-afee-86f8d35630a6",
  rogue: "octgn:6ea88b3d-c675-4690-b993-ce4672eb3b16",
  dreams: "octgn:60df407c-b1d7-455b-b4b3-7c68739f73c3",
  squall: "octgn:a62a05a3-c982-4ee1-ac17-7298e6f1a525",
  /**
   * The Fate of Númenor's setup card and Nightmare Deck (its reprinted
   * Uncharted deck and Shrine to Morgoth are in FATE_NIGHTMARE).
   */
  fateCard: "octgn:d6fa1984-6016-4b44-8466-772160706d31",
  guardian: "octgn:d09d5da8-4fb8-4c94-a344-25fbd40cbd46",
  steps: "octgn:2bb3f0dd-6028-4cd5-bfdc-3d12f9b69c92",
  flora: "octgn:406c33fc-8f5d-4d1d-a635-eb6ae9c33091",
  folly: "octgn:6a03ecc3-716a-4499-9412-b3838c4b1cba",
  /**
   * Raid on the Grey Havens' setup card and Nightmare Deck (its stage 2,
   * Sahír's Advance, and three unique Ship locations among them).
   */
  raidCard: "octgn:a33274da-588d-4430-b730-0e82942c0605",
  advance: "octgn:ccba3aa6-5129-47d8-839c-b20aff126e62",
  pillager: "octgn:c4993a31-1e07-469c-a3cb-13e90e44253f",
  pyromaniac: "octgn:5d491420-2c69-41b8-8023-a7020f5a33df",
  marauder: "octgn:4a9282c0-44e5-4438-9b97-4b93dc29282d",
  narelenya: "octgn:e0c17eeb-3231-49a4-a807-1e176247573c",
  dawnStar: "octgn:7e8c1439-0d73-459d-b3d9-29c7c2c56e76",
  silverWing: "octgn:f40d0756-8603-4bf3-ad66-2890552bd60e",
  tower: "octgn:98763910-365c-452a-b7ed-24512c3962a8",
  sudden: "octgn:6e765a17-9c2e-4b30-b023-5f08450553c4",
  infiltration: "octgn:b52b72ae-574d-4736-96d6-3531a0aae7ae",
} as const;
/** The Dream-chaser cycle's Nightmare Decks. */
export const NIGHTMARE_DC = {
  /**
   * Flight of the Stormcaller's setup card and Nightmare Deck (Raider of the
   * Storm joins the Corsair deck).
   */
  stormcallerCard: "octgn:00724f28-cae7-4d45-95b4-076d91bd2a86",
  raider: "octgn:a3ac80dc-be8b-4d45-a9c4-f611183eb4be",
  tideRunner: "octgn:dd13a7d6-b58e-41ce-a73c-c86a45996607",
  venom: "octgn:51c3083f-3a95-44aa-bb34-4b28c9189c05",
  jetties: "octgn:35524392-598c-4980-93ea-91d7702242ab",
  inlet: "octgn:c81aa8c4-969d-46f6-b0a6-a53e59e75db9",
  stormy: "octgn:6d34a654-ec8f-41b5-8fa9-a86a15cdf5e6",
  getaway: "octgn:17516d4f-8ce4-491e-8b2d-8dc9fe841934",
  /**
   * The Thing in the Depths' setup card and Nightmare Deck (Slithering Arm,
   * Crashing Arm and Deep Maelstrom join the set aside The Thing in the
   * Depths encounter set; Corsair Duelist bears the Corsair Raiders icon).
   */
  depthsCard: "octgn:a08d5b97-8055-40ea-8e98-20a7a608216b",
  quarters: "octgn:5fa05845-7cdd-46da-9862-4f3f10525ef1",
  aftCabin: "octgn:671e838c-630c-4bd7-91d8-20ec6c144f9f",
  tumultuous: "octgn:26cf3d89-9cfe-45a9-8deb-c2840193ba0f",
  duelist: "octgn:e5b4ba4a-99dc-4f01-9216-21406aa05bd0",
  slithering: "octgn:5e1bbe70-dae7-404a-a420-93e393538fa3",
  crashing: "octgn:a926afdc-c770-4315-b4eb-6b417e765c55",
  maelstrom: "octgn:58f19ebb-2e0f-4ff9-9ec1-1984e9faca02",
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
  "the-druadan-forest": {
    card: NIGHTMARE_AS.druadanCard,
    // The setup card prints "Drû-buri-Drû".
    removals: {
      "Lost Companion": 2,
      "Secluded Glade": 3,
      "Overgrown Trail": 1,
      "Dru-buri-Dru": 1,
      "Drúadan Elite": 1,
      "Drúadan Hunter": 1,
      "Stars in Sky": 1,
      "Men in the Dark": 1,
    },
  },
  "encounter-at-amon-din": {
    card: NIGHTMARE_AS.amonCard,
    removals: {
      "Burning Farmhouse": 2,
      "Gondorian Hamlet": 2,
      "Marauding Orc": 1,
      "Orc Rabble": 1,
      "Orc Ravager": 3,
      "Craven Eagle": 2,
      "Trapped Inside": 2,
      "Panicked!": 2,
      "Scourge of Mordor": 2,
    },
  },
  "assault-on-osgiliath": {
    card: NIGHTMARE_AS.osgiliathCard,
    removals: {
      "Uruk Soldier": 4,
      "Southron Phalanx": 3,
      "West Quarter": 2,
      "East Quarter": 2,
      "Ruined Tower": 1,
      "Ruined Square": 1,
      "The Master's Malice": 2,
      "Street Fighting": 2,
      "Southron Mercenaries": 3,
      "Uruk Lieutenant": 1,
      "Orc Arbalesters": 1,
      "The Power of Mordor": 1,
    },
  },
  "the-blood-of-gondor": {
    card: NIGHTMARE_AS.bloodCard,
    removals: {
      "Black Númenorean": 1,
      "Evil Crow": 2,
      "Lying in Wait": 2,
      "The Dark Woods": 4,
      "Orc Rabble": 1,
      "Orc Arsonist": 1,
      "Scourge of Mordor": 1,
    },
  },
  "we-must-away-ere-break-of-day": {
    card: NIGHTMARE_OHUH.wmaCard,
    removals: {
      "A Suspicious Crow": 3,
      "Lone-Lands": 1,
      "Dreary Hills": 1,
      "Hobbit-lands": 2,
      "A Nice Pickle": 2,
    },
  },
  "over-the-misty-mountains-grim": {
    card: NIGHTMARE_OHUH.ommCard,
    removals: {
      "Cave Entrance": 2,
      "Lone-Lands": 2,
      "Dreary Hills": 2,
      "Overhanging Rock": 2,
      "Great Cavern Room": 1,
      "The Great Goblin": 1,
      "Goblin Miners": 3,
      "Goblin Axeman": 3,
    },
  },
  "dungeons-deep-and-caverns-dim": {
    card: NIGHTMARE_OHUH.ddcdCard,
    removals: {
      "Goblin Miners": 3,
      "Goblin Axeman": 3,
      "The Goblins' Caves": 3,
      "Grip, grab! Pinch, nab!": 3,
      "Not fair! Not fair!": 1,
    },
  },
  "fords-of-isen": {
    card: NIGHTMARE_VOI.fordsCard,
    removals: {
      "Dunland Prowler": 3,
      "Dunlending Bandit": 2,
      "Dunland Berserker": 1,
      "Gap of Rohan": 2,
      "The King's Road": 2,
    },
  },
  "the-three-trials": {
    card: NIGHTMARE_RINGMAKER.trialsCard,
    removals: {
      "Spirit of the Wild": 3,
      "Grim Foothills": 3,
      "Tangled Woods": 1,
      "Turned Around": 3,
    },
  },
  "trouble-in-tharbad": {
    card: NIGHTMARE_RINGMAKER.tharbadCard,
    removals: {
      "Orc Hunter": 1,
      "Orc Skirmisher": 2,
      "Tharbad Hideout": 2,
      "Hidden Alleyway": 2,
      "Decrepit Rooftops": 1,
      "Orc Hunting Party": 2,
    },
  },
  "the-nin-in-eilph": {
    card: NIGHTMARE_RINGMAKER.ninCard,
    removals: {
      Neekerbreekers: 3,
      "Hidden Eyot": 1,
      "Finger of Glanduin": 3,
      "Off Track": 2,
      "Low on Provisions": 1,
    },
    questRemovals: { "A Weary Passage": 1, "Impassable Marshland": 1 },
  },
  "celebrimbors-secret": {
    card: NIGHTMARE_RINGMAKER.celebCard,
    removals: {
      "Orc Skirmisher": 1,
      "Orc Hunter": 1,
      "Prowling Wolf": 3,
      "Ruined Plaza": 1,
      "City Remains": 1,
      "Ancient Foundation": 1,
      "Broken Lands": 3,
      "Spies from Mordor": 1,
      "Orc Hunting Party": 2,
    },
  },
  "a-shadow-of-the-past": {
    card: NIGHTMARE_TBR.shadowCard,
    removals: {
      "Evil Crow": 3,
      "Woody End": 1,
      Bamfurlong: 1,
      "Stock-brook": 1,
      "Green Hill Country": 3,
      "Pathless Country": 3,
      "Rode Like a Gale": 2,
    },
  },
  "flight-to-the-ford": {
    card: NIGHTMARE_TBR.fordCard,
    removals: {
      "Fell Rider": 4,
      "Ford of Bruinen": 1,
      "The Troll's Camp": 1,
      Ettenmoors: 3,
      "Pain Assailed Him": 3,
      "The Old Road": 3,
      "Pathless Country": 3,
      "Stricken Dumb": 3,
      "Rode Like a Gale": 2,
    },
  },
  "the-ring-goes-south": {
    card: NIGHTMARE_TRD.southCard,
    removals: {
      "Crebain from Dunland": 2,
      "Howling Warg": 2,
      "Tree-crowned Hill": 1,
      "Hills of Hollin": 3,
      Snowdrifts: 2,
      "Storm of Howls": 1,
    },
  },
  "journey-in-the-dark": {
    card: NIGHTMARE_TRD.darkCard,
    removals: {
      "Moria Archer": 3,
      "Mines of Moria": 4,
      "We Cannot Get Out": 1,
      "Deep Fissure": 3,
    },
  },
  "breaking-of-the-fellowship": {
    card: NIGHTMARE_TRD.breakingCard,
    removals: {
      "Uruk-hai Archer": 4,
      "River Anduin": 2,
      "Slopes of Amon Hen": 1,
      "Black Feathered Arrows": 2,
    },
  },
  "intruders-in-chetwood": {
    card: NIGHTMARE_TLR.chetwoodCard,
    removals: {
      "Angmar Orc": 1,
      "Angmar Marauder": 3,
      "Chetwood Forest": 2,
      "Outlying Homestead": 1,
      "Borders of Bree-land": 2,
      "Rugged Country": 1,
      "Shrouded Hills": 1,
      "Surprising Speed": 3,
      "Sudden Assault": 2,
    },
  },
  "the-weather-hills": {
    card: NIGHTMARE_TLR.weatherCard,
    removals: {
      "Cornered Orc": 3,
      "Sheltered Valley": 2,
      "Concealed Orc-camp": 1,
      "Angmar Marauder": 2,
      "Angmar Orc": 2,
      "Ruins of Arnor": 3,
      "Tragic Discovery": 2,
    },
  },
  "the-uruk-hai": {
    card: NIGHTMARE_TOS.urukCard,
    removals: {
      "Uruk-hai Fighter": 3,
      Snaga: 1,
      Eastemnet: 2,
      "Plains of Rohan": 2,
      "The Wold": 3,
      "Unseen Barrier": 2,
    },
  },
  "helms-deep": {
    card: NIGHTMARE_TOS.helmCard,
    removals: {
      "Isengard Uruk": 1,
      "Uruk-hai Fighter": 3,
      "Wild Hillman": 3,
      "The Hornburg": 3,
      "Deeping Wall": 1,
      "Postern Door": 2,
      "Reckless Hate": 2,
    },
  },
  "the-road-to-isengard": {
    card: NIGHTMARE_TOS.isengardCard,
    removals: {
      Snaga: 3,
      "Ring-wall of Isengard": 1,
      "Open Pit": 2,
      "Machines of Isengard": 1,
      "Blast of Sorcery": 3,
    },
  },
  "wastes-of-eriador": {
    card: NIGHTMARE_AA.wastesCard,
    removals: {
      "Northern Warg": 2,
      "White Warg": 1,
      "Sudden Darkness": 1,
      "North Downs": 1,
      "Eriador Wastes": 2,
      "Cold from Angmar": 1,
      "Biting Wind": 3,
      "Freezing Blast": 1,
      "Shrouded Hills": 1,
      "Rugged Country": 3,
      "Pressing Needs": 2,
    },
  },
  "escape-from-mount-gram": {
    card: NIGHTMARE_AA.gramCard,
    removals: {
      "Prison Cell": 4,
      "Dungeon Guard": 3,
      "Jailor Gornákh": 1,
      Interrogation: 2,
      "Goblin Tormentor": 1,
      "Cruel Torturer": 1,
    },
  },
  "across-the-ettenmoors": {
    card: NIGHTMARE_AA.ettenCard,
    removals: {
      "Shrouded Hills": 2,
      "No Rest": 1,
      "Arador's Bane": 2,
      "Troll-fells": 2,
      "Goblin Pursuer": 2,
      "Cold from Angmar": 2,
    },
    questRemovals: { "Into the Ettenmoors": 1 },
  },
  "the-treachery-of-rhudaur": {
    card: NIGHTMARE_AA.rhudaurCard,
    removals: {
      "Decrepit Remains": 2,
      "Eerie Halls": 2,
      "Dark Covenant": 1,
      "Ruins of Arnor": 2,
      "Tragic Discovery": 2,
      "Cursed Dead": 5,
    },
  },
  "the-battle-of-carn-dum": {
    card: NIGHTMARE_AA.carnCard,
    removals: {
      "Vile Affliction": 1,
      "Furious Charge": 1,
      "Orc Ambush": 1,
      "Angmar Orc": 1,
      "Angmar Marauder": 3,
      "Terror of the North": 3,
      "Accursed Battlefield": 2,
      "Blight of Carn Dûm": 1,
    },
    // The scenario's own sets (its cards' set is spelled without the accent);
    // its setup rebuilds the deck from its recipe and applies the removals.
    sets: ["The Battle of Carn Dum", "Angmar Orcs", "Dark Sorcery"],
  },
  "the-passage-of-the-marshes": {
    card: NIGHTMARE_LOS.marshesCard,
    removals: {
      "Groping Dead": 3,
      "Dead Things": 3,
      "Soft Mires": 3,
      "Haunted Mere": 3,
      "Bitter Reek": 3,
    },
  },
  "journey-to-the-cross-roads": {
    card: NIGHTMARE_LOS.crossroadsCard,
    // The setup card prints "Henneth Annun", without the accent.
    removals: {
      "Captain of Harad": 1,
      "Henneth Annûn": 1,
      "Southward Road": 2,
      "Hills of Ithilien": 4,
      "The Dark Lord's Summons": 3,
    },
  },
  "voyage-across-belegaer": {
    card: NIGHTMARE_GH.voyageCard,
    // Southron Sailor is in the Corsair deck; the scenario's setup applies
    // the removals to both decks.
    removals: {
      "Southron Sailor": 2,
      "Starlit Sea": 1,
      "Fog Bank": 1,
      "Calm Waters": 2,
      "Thrown Off Course": 2,
      "Scouting Ship": 1,
    },
  },
  "the-fate-of-numenor": {
    card: NIGHTMARE_GH.fateCard,
    // The Uncharted deck and Shrine to Morgoth leave with the other removals;
    // the scenario's setup applies them to its three piles, and the Nightmare
    // Deck's reprints replace them.
    removals: {
      "Forbidden Coast": 2,
      "Cursed Temple": 2,
      "Flooded Ruins": 2,
      "Drowned Graves": 2,
      "Lush Jungle": 2,
      "Shrine to Morgoth": 1,
      "Steep Plateau": 3,
      "Aimless Wandering": 3,
      "Mysterious Fog": 1,
      "Servant of the Deceiver": 1,
      "Lingering Malevolence": 1,
      "Drowned Dead": 1,
    },
  },
  "raid-on-the-grey-havens": {
    card: NIGHTMARE_GH.raidCard,
    // The scenario's setup applies the removals and shuffles the
    // Dream-chaser into the encounter deck for the setup card's search.
    removals: {
      "Corsair Arsonist": 3,
      "Elven Wave-runner": 2,
      "Umbar Raider": 1,
    },
    questRemovals: { "Sahír's Advance": 1 },
  },
  "flight-of-the-stormcaller": {
    card: NIGHTMARE_DC.stormcallerCard,
    // Southron Sailor and Serpent's Blade are in the Corsair deck; the
    // scenario's setup applies the removals to both decks.
    removals: {
      "Calm Waters": 2,
      "Corsair Skiff": 2,
      "Southron Sailor": 2,
      "Serpent's Blade": 2,
      "Hidden Cove": 1,
      "Jagged Reef": 2,
    },
  },
  "the-thing-in-the-depths": {
    card: NIGHTMARE_DC.depthsCard,
    // The Arms are in the set aside The Thing in the Depths encounter set;
    // the scenario's setup applies the removals to both piles.
    removals: {
      "Corsair Infiltrator": 2,
      "Crew Quarters": 1,
      "Crushing Arm": 1,
      "Grasping Arm": 1,
      "Giant Arm": 1,
    },
  },
  "shelobs-lair": {
    card: NIGHTMARE_LOS.lairCard,
    removals: {
      "Morgul Orc": 4,
      "The Under-way": 2,
      "Deep Dark Passage": 3,
      "Many Openings": 2,
    },
  },
  "the-dread-realm": {
    card: NIGHTMARE_AA.dreadCard,
    removals: {
      "Witch of Angmar": 3,
      "A Fell Dread": 2,
      "Unholy Crypt": 1,
      "Sinister Dungeon": 1,
      "Dead Lord": 2,
      "Terror of the North": 3,
    },
  },
  "deadmens-dike": {
    card: NIGHTMARE_TLR.dikeCard,
    removals: {
      "Fornost Square": 2,
      "Broken Battlements": 3,
      "Norbury Tombs": 2,
      "Restless Evil": 2,
    },
  },
  "a-knife-in-the-dark": {
    card: NIGHTMARE_TBR.knifeCard,
    removals: {
      "Shady Bree-lander": 4,
      "Weather Hills": 3,
      "Unwanted Attention": 1,
      "Pathless Country": 3,
      Weathertop: 1,
    },
  },
  "the-antlered-crown": {
    card: NIGHTMARE_RINGMAKER.crownCard,
    removals: {
      "Dunland Prowler": 1,
      "Dunland Berserker": 1,
      "Dunlending Bandit": 2,
      "Raven Skirmisher": 3,
      "Raven War-camp": 3,
      "Driven Back": 2,
    },
  },
  "the-dunland-trap": {
    card: NIGHTMARE_RINGMAKER.dunlandCard,
    removals: {
      "Boar Clan Warrior": 4,
      "Hithaeglir Stream": 4,
      "Plains of Enedwaith": 3,
      "Dunlending Ambush": 1,
      "Frenzied Attack": 1,
      "Low on Provisions": 1,
    },
  },
  "into-fangorn": {
    card: NIGHTMARE_VOI.fangornCard,
    removals: {
      "Deadly Huorn": 3,
      "Tangled Woods": 3,
      "Turned Around": 3,
    },
  },
  "to-catch-an-orc": {
    card: NIGHTMARE_VOI.catchCard,
    removals: {
      "Methedras Orc": 1,
      "Orc Skirmisher": 1,
      "Orc Hunter": 1,
      "Prowling Wolf": 3,
      Methedras: 2,
      "Orc Cave": 1,
      "Orc Hunting Party": 2,
    },
  },
  "the-battle-of-five-armies": {
    card: NIGHTMARE_OTD.bofaCard,
    removals: {
      "Dark Bats": 3,
      "Hidden Path": 3,
      "Fighting Among Friends": 2,
      "Vanguard of Bolg": 1,
      "Ravenous Warg": 1,
      "Gundabad Climber": 4,
      "Gundabad Wolf Rider": 3,
      "Misty Mountain Eagle": 1,
    },
  },
  "the-lonely-mountain": {
    card: NIGHTMARE_OTD.tlmCard,
    removals: {
      "Dark Bats": 3,
      "Fighting Among Friends": 2,
      "Western Slopes": 3,
      "Secret Entrance": 2,
      "Belching Fire": 4,
    },
  },
  "flies-and-spiders": {
    card: NIGHTMARE_OTD.fasCard,
    removals: {
      "Dark Bats": 3,
      "Hidden Path": 3,
      "Fighting Among Friends": 2,
      "Wicked Spider": 5,
      "Fat Spider": 1,
      "Giant Web": 1,
    },
  },
  "the-morgul-vale": {
    card: NIGHTMARE_AS.morgulCard,
    removals: {
      "Forest Bat": 3,
      "Watcher in the Wood": 1,
      "Orc Arbalesters": 3,
      "The Power of Mordor": 1,
      "Morgul Sorcerer": 2,
      "Morgul Tracker": 2,
      "Morgul Road": 3,
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
/**
 * A Nightmare Deck shared between two encounter decks (Over the Misty
 * Mountains Grim's): the removals apply to whichever deck holds each card,
 * and each Nightmare card joins the deck its encounter set icon names.
 */
export function nightmareEncounterDecks(
  id: ScenarioId,
  decks: string[][],
  deckOf: (code: string) => number,
) {
  const out = decks.map((d) => [...d]);
  const deck = NIGHTMARE[id];
  if (!deck) return out;
  for (const [title, n] of Object.entries(deck.removals))
    for (let i = 0; i < n; i++) {
      const pile = out.find((d) =>
        d.some((code) => plainTitle(card(code).name) === title),
      );
      if (!pile)
        throw new Error(`${title} is not in the standard encounter decks.`);
      pile.splice(
        pile.findIndex((code) => plainTitle(card(code).name) === title),
        1,
      );
    }
  const set = nightmareSet(id);
  for (const c of encounterCards)
    if (
      c.encounter_set === set &&
      c.type_code !== "nightmare" &&
      c.type_code !== "quest"
    )
      out[deckOf(c.code)].push(
        ...(Array(c.quantity ?? 1).fill(c.code) as string[]),
      );
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
  if (s.scenarioId === "the-druadan-forest")
    return [
      "The Drúadan Forest · Nightmare mode: heroes collect no resources in the resource phase; each began with 5 and a Garden of Poisons in the staging area; after stage 2B is revealed, each hero has at least 3. The Nightmare Deck's Drû-buri-Drû waits for stage 3.",
    ];
  if (s.scenarioId === "encounter-at-amon-din")
    return [
      "Encounter at Amon Dîn · Nightmare mode: Ghulat cannot take damage unless there are at least 15 progress tokens on Protect the Villagers; Rescued Villagers began with 1 villager token; at the beginning of each quest phase, the players discard 1 villager token from Rescued Villagers or reveal an encounter card.",
    ];
  if (s.scenarioId === "assault-on-osgiliath") {
    const staged = s.staging.filter(
      (u) =>
        card(u.code).type_code === "location" &&
        /\bOsgiliath\b/.test(card(u.code).traits ?? ""),
    ).length;
    const players = s.table?.seats.length ?? 1;
    return [
      `Assault on Osgiliath · Nightmare mode: Palace Remains began in the staging area. While more Osgiliath locations are in the staging area than there are players (${staged} for ${players}), a non-unique location may take the quest's remaining progress each quest phase.`,
    ];
  }
  if (s.scenarioId === "the-blood-of-gondor") {
    const hidden = Object.values(s.bloodGondor?.hidden ?? {}).flat().length;
    return [
      `The Blood of Gondor · Nightmare mode: each player took a hidden card at setup (${hidden} hidden now); the players cannot win unless The Cross-roads and the Nightmare Deck's Black Númenorean are in the victory display.`,
    ];
  }
  if (s.scenarioId === "fords-of-isen")
    return [
      "The Fords of Isen · Nightmare mode: after the players advance to a new quest stage, each player with fewer than 3 cards in hand draws 3 cards.",
    ];
  if (s.scenarioId === "the-three-trials")
    return [
      "The Three Trials · Nightmare mode: each engaged Guardian enemy contributes its [threat] to the staging area; while the Trial of Intuition is the current trial, Guardian enemies cannot be damaged and Barrow locations cannot be the active location and are immune to player card effects.",
    ];
  if (s.scenarioId === "the-dunland-trap")
    return [
      "The Dunland Trap · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck.",
    ];
  if (s.scenarioId === "the-ring-goes-south") {
    const aside =
      s.ringSouth?.setAside.filter((c) => c === NIGHTMARE_TRD.tentacle)
        .length ?? 0;
    return [
      `The Ring Goes South · Nightmare mode: when the players advance to stage 4B, each player puts a Pale-green Tentacle into play engaged with them, and the other copies and the encounter discard pile are shuffled into the encounter deck${aside ? ` (${aside} set aside now)` : ""}.`,
    ];
  }
  if (s.scenarioId === "journey-in-the-dark") {
    const weapons = s.nightmare?.darkWeapons?.length ?? 0;
    return [
      `Journey in the Dark · Nightmare mode: each hero in each player's discard pile cannot leave the discard pile, and the players cannot defeat stage 3B unless The Balrog is in the victory display${weapons ? ` (${weapons} Weapon${weapons === 1 ? "" : "s"} wait for The Balrog out of play)` : ""}.`,
    ];
  }
  if (s.scenarioId === "breaking-of-the-fellowship")
    return [
      "Breaking of the Fellowship · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck.",
    ];
  if (s.scenarioId === "intruders-in-chetwood")
    return [
      "Intruders in Chetwood · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck.",
    ];
  if (s.scenarioId === "the-weather-hills") {
    const guarded = s.staging.filter(
      (u) => u.code === NIGHTMARE_TLR.villager,
    ).length;
    return [
      `The Weather Hills · Nightmare mode: each Captive Villager and Rearguard Ambusher was shuffled into the Orc deck; the players cannot win while a Captive Villager is guarded by an encounter card${guarded ? ` (${guarded} guarded now)` : ""}, and lose if one leaves play.`,
    ];
  }
  if (s.scenarioId === "helms-deep")
    return [
      "Helm's Deep · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck.",
    ];
  if (s.scenarioId === "the-road-to-isengard")
    return [
      "The Road to Isengard · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck; when Ent of Fangorn leaves play, it is removed from the game.",
    ];
  if (s.scenarioId === "the-uruk-hai") {
    const aside = !!s.nightmare?.urukMauhur;
    return [
      `The Uruk-hai · Nightmare mode: each Captive is immune to player card effects; when the players advance to stage 2A, Mauhúr is added to the staging area${aside ? " (set aside now)" : ""}.`,
    ];
  }
  if (s.scenarioId === "wastes-of-eriador")
    return [
      "The Wastes of Eriador · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck.",
    ];
  if (s.scenarioId === "escape-from-mount-gram")
    return [
      "Escape from Mount Gram · Nightmare mode: each player's other heroes were shuffled into their captured deck, with the hero set aside facedown at its bottom; the players cannot win while a hero is captured.",
    ];
  if (s.scenarioId === "across-the-ettenmoors")
    return [
      "Across the Ettenmoors · Nightmare mode: stage 1 is the Nightmare Deck's Into the Ettenmoors; as stages 2A and 3A reveal their side quest, a safe location found in the encounter deck guards it.",
    ];
  if (s.scenarioId === "the-treachery-of-rhudaur") {
    const aside = s.nightmare?.rhudaurAside?.length ?? 0;
    return [
      `The Treachery of Rhudaur · Nightmare mode: the Sift through the Debris, Decipher Ancient Texts and Quiet the Spirits encounter sets are set aside (${aside} cards); as stage 2B begins, the set of each side quest that was not defeated is shuffled into the encounter deck with its discard pile.`,
    ];
  }
  if (s.scenarioId === "the-battle-of-carn-dum")
    return [
      "The Battle of Carn Dûm · Nightmare mode: characters committed to a quest with the siege keyword count their [defense] instead of their [willpower], against the staging area's [threat].",
    ];
  if (s.scenarioId === "the-passage-of-the-marshes")
    return [
      "The Passage of the Marshes · Nightmare mode: when a location in the staging area is explored, each player raises their threat by that location's Mire value.",
    ];
  if (s.scenarioId === "voyage-across-belegaer")
    return [
      "Voyage Across Belegaer · Nightmare mode: the quest deck's stage 2 cards include Corsair Confrontation and Lost at Sea, and Brash Corsair joins the Corsair deck.",
    ];
  if (s.scenarioId === "the-fate-of-numenor")
    return [
      "The Fate of Númenor · Nightmare mode: progress cannot be placed on non-Uncharted locations in the staging area; while 3 or fewer double-sided locations are in the victory display, travelling to Shrine to Morgoth returns it to the staging area on its Lost Island side, and the Lost Islands lose their progress and are shuffled before the players choose a new location to travel to.",
    ];
  if (s.scenarioId === "raid-on-the-grey-havens")
    return [
      "Raid on the Grey Havens · Nightmare mode: Captain Sahír and Na'asiyah cannot have attachments; during setup, each player added a different unique location from the encounter deck to the staging area, the Dream-chaser among them. Stage 2 is the Nightmare Deck's Sahír's Advance: the players win when Captain Sahír and Na'asiyah are both in the victory display.",
    ];
  if (s.scenarioId === "flight-of-the-stormcaller")
    return [
      "Flight of the Stormcaller · Nightmare mode: Raider of the Storm joins the Corsair deck; while you are at the same stage as the Stormcaller, the main quest gets +X quest points, where X is the Stormcaller's remaining hit points (included in the stage's quest points).",
    ];
  if (s.scenarioId === "the-thing-in-the-depths")
    return [
      "The Thing in the Depths · Nightmare mode: after The Thing in the Depths enters play, it attacks each player in turn order. At stage 3, a quest phase begins by revealing a location from the encounter deck while there are fewer locations in play than players, and each Tentacle enemy in play resolves its Grapple keyword at the end of the refresh phase.",
    ];
  if (s.scenarioId === "shelobs-lair")
    return [
      "Shelob's Lair · Nightmare mode: unresolved shadow cards stay on Shelob at the end of the combat phase; while Cleft of Cirith Ungol is in the staging area, the players can travel only to it.",
    ];
  if (s.scenarioId === "journey-to-the-cross-roads") {
    const players = s.table ? s.table.seats.length : 1;
    const aside = Math.max(0, 4 - players);
    return [
      `Journey to the Cross-roads · Nightmare mode: during setup, ${players === 1 ? "1 Southron Warrior was" : `${players} Southron Warriors were`} shuffled facedown under The Cross-roads${aside ? ` (the other ${aside === 1 ? "one is" : `${aside} are`} set aside, out of play)` : ""}.`,
    ];
  }
  if (s.scenarioId === "the-dread-realm") {
    const curses = s.nightmare?.dreadCurses ?? [];
    const decks = [...new Set(curses.map((c) => c.player))].map((p) => {
      const n = curses.filter((c) => c.player === p).length;
      const heroes = (
        s.table && p !== s.table.active ? s.table.seats[p] : s
      ).startingHeroes
        .map((c) => card(c).name)
        .join(" & ");
      return `${n === 1 ? "Daechanar's Curse is" : `${n} copies of Daechanar's Curse are`} attached to the top of ${s.table ? `${heroes}'s` : "your"} deck`;
    });
    return [
      `The Dread Realm · Nightmare mode: the setup card removed the printed standard encounter cards and shuffled in its Nightmare Deck${decks.length ? ` (${decks.join("; ")})` : ""}.`,
    ];
  }
  if (s.scenarioId === "deadmens-dike") {
    const under = (s.nightmare?.dikeCourage ?? []).reduce(
      (n, c) => n + c.cards.length,
      0,
    );
    return [
      `Deadmen's Dike · Nightmare mode: each player's deck cannot include more than 50 total cards; during setup, each player placed a copy of Cursed Dead in the encounter discard pile${under ? ` (${under} card${under === 1 ? " is" : "s are"} facedown under Gather Your Courage)` : ""}.`,
    ];
  }
  if (s.scenarioId === "flight-to-the-ford")
    return [
      "Flight to the Ford · Nightmare mode: the players cannot win while Ford of Bruinen is in play; the Nightmare Deck's Fell Riders are staged and its Ford of Bruinen set aside in place of the scenario's.",
    ];
  if (s.scenarioId === "a-knife-in-the-dark")
    return [
      "A Knife in the Dark · Nightmare mode: while Bill Ferny is in the staging area, he is immune to player card effects; the Nightmare Deck's Weathertop is set aside in place of the scenario's.",
    ];
  if (s.scenarioId === "a-shadow-of-the-past")
    return [
      "A Shadow of the Past · Nightmare mode: when stage 3A is revealed, Khamûl the Easterling joins the staging area if he is not in play.",
    ];
  if (s.scenarioId === "the-antlered-crown")
    return [
      "The Antlered Crown · Nightmare mode: locations with time counters cannot be discarded from play by player card effects; the Nightmare Deck's Dunlending Horde joined the Raven deck.",
    ];
  if (s.scenarioId === "celebrimbors-secret")
    return [
      "Celebrimbor's Secret · Nightmare mode: progress that would be placed on a location in the staging area is reduced to 1; the setup card's own Scour deals 1 damage to a location in play whenever each Scour effect in play is triggered.",
    ];
  if (s.scenarioId === "the-nin-in-eilph")
    return [
      "The Nîn-in-Eilph · Nightmare mode: when the players advance to stage 2A, Ancient Marsh-dweller joins the staging area (from out of play or engaged with a player); An Arduous Journey and Deadly Waters replace A Weary Passage and Impassable Marshland among the random stages.",
    ];
  if (s.scenarioId === "trouble-in-tharbad")
    return [
      `Trouble in Tharbad · Nightmare mode: each player's starting threat was raised by 5; progress cannot be placed on The Crossing at Tharbad while Bellach is in play. Threat elimination level: ${threatElimination(s)}.`,
    ];
  if (s.scenarioId === "into-fangorn") {
    const edge = (s.victoryCards ?? []).some(
      (c) => card(c).name === "Edge of Fangorn",
    );
    return [
      `Into Fangorn · Nightmare mode: each player put a Huorn enemy from the encounter deck into play engaged with them at setup; the players cannot defeat stage 1B or 2B unless Edge of Fangorn is in the victory display (${edge ? "it is" : "it is not yet"}).`,
    ];
  }
  if (s.scenarioId === "to-catch-an-orc") {
    const rage = s.nightmare?.catchRageAside ?? 0;
    const vigilant = (s.catchOrc?.setAside ?? []).filter(
      (u) => u.code === NIGHTMARE_VOI.vigilant,
    ).length;
    return [
      `To Catch an Orc · Nightmare mode: each player shuffled a Vigilant Orc into their out-of-play deck (${vigilant} more set aside); ${rage ? `both copies of Mugash's Rage are set aside until the players advance to stage 3A` : "Mugash's Rage has joined the encounter deck"}.`,
    ];
  }
  if (s.scenarioId === "the-battle-of-five-armies") {
    const players = s.table?.seats.length ?? 1;
    const tokens = s.nightmare?.bofaProgress ?? 0;
    return [
      `The Battle of Five Armies · Nightmare mode: at stage 5B each instruction to remove progress from a quest stage places 1 progress on the setup card instead; with ${3 + 2 * players} (${tokens} now) the players lose.`,
    ];
  }
  if (s.scenarioId === "the-lonely-mountain") {
    const stack = s.lonelyMountain?.stack.length ?? 0;
    return [
      `The Lonely Mountain · Nightmare mode: the players cannot advance to stage 3 while a card is stacked underneath The Lonely Mountain (${stack} now); Smaug the Magnificent cannot take damage unless A Bare Patch is attached to him.`,
    ];
  }
  if (s.scenarioId === "flies-and-spiders")
    return [
      "Flies and Spiders · Nightmare mode: each player gives 1 poison to a hero they control at setup, after the scenario's own setup.",
    ];
  if (s.scenarioId === "dungeons-deep-and-caverns-dim")
    return [
      `Dungeons Deep and Caverns Dim · Nightmare mode: Gollum cannot take damage; The Lower Gate ${s.nightmare?.lowerGateAside ? "is set aside until stage 3B is revealed" : "has entered the staging area"}.`,
    ];
  if (s.scenarioId === "over-the-misty-mountains-grim") {
    const players = s.table?.seats.length ?? 1;
    return [
      `Over the Misty Mountains Grim · Nightmare mode: stage 3B's When Revealed effect may spend no more than ${players} Baggins resource${players === 1 ? "" : "s"} (the number of players). Its Nightmare cards joined both encounter decks.`,
    ];
  }
  if (s.scenarioId === "we-must-away-ere-break-of-day")
    return [
      "We Must Away, Ere Break of Day · Nightmare mode: the objective cards Troll Key and Troll Purse gain surge.",
    ];
  if (s.scenarioId === "the-morgul-vale") {
    const tower =
      s.staging.find((u) => card(u.code).name === "To the Tower")?.progress ??
      0;
    return [
      `The Morgul Vale · Nightmare mode: 1 progress token was placed on To the Tower at setup (${tower} of 10 now).`,
    ];
  }
  if (s.scenarioId === "watcher-in-the-water")
    return [
      "The Watcher in the Water · Nightmare mode: while Doors of Durin is in play, The Watcher cannot be engaged; a destroyed Tentacle enemy deals 1 damage to The Watcher; the players cannot win unless both Doors of Durin and The Watcher are in the victory display.",
    ];
  return [];
}
