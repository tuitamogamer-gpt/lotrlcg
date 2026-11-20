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
