import fs from "node:fs/promises";

// Printed product identities and official preconstructed recipes are intentionally
// separate from card rules. RingsDB merges reprints into a canonical card.
const args = Object.fromEntries(
  process.argv.slice(2).reduce((all, value, index, values) => {
    if (value.startsWith("--")) all.push([value.slice(2), values[index + 1]]);
    return all;
  }, []),
);
const getJson = async (path, url) => {
  if (path) return JSON.parse(await fs.readFile(path, "utf8"));
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
};
const [packs, cards] = await Promise.all([
  getJson(args.packs, "https://ringsdb.com/api/public/packs/"),
  getJson(args.cards, "https://ringsdb.com/api/public/cards/"),
]);
const slug = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const normalize = (text) => slug(text).replace(/-/g, "");
const ffg =
  "https://www.fantasyflightgames.com/product/the-lord-of-the-rings-the-card-game/";
// Publisher allowlist matches the card importer and keeps future community packs
// out even when they do not carry the familiar ALeP / MotK labels.
const officialPackCodes = new Set([
  "Core",
  "TDoM",
  "HfG",
  "CatC",
  "JtR",
  "TMaO",
  "HoEM",
  "TDM",
  "RtM",
  "KD",
  "TRG",
  "RtR",
  "WitW",
  "TLD",
  "FoS",
  "SaF",
  "OHaUH",
  "TBoLT",
  "HoN",
  "OtD",
  "TSF",
  "TDF",
  "EaAD",
  "AoO",
  "TBR",
  "BoG",
  "TSoE",
  "TMV",
  "VoI",
  "TDT",
  "TTT",
  "TiT",
  "TRD",
  "NiE",
  "TOF",
  "CS",
  "TAC",
  "FotBd",
  "TLR",
  "ToS",
  "WoE",
  "EfMG",
  "AtE",
  "ToR",
  "BoCD",
  "LoS",
  "TDR",
  "AACE",
  "TGH",
  "TRoB",
  "MatPP",
  "FotS",
  "TitD",
  "TotD",
  "FotW",
  "DR",
  "SoCH",
  "CoC",
  "TSoH",
  "M",
  "TSoA",
  "RAH",
  "BtS",
  "Starter",
  "TBS",
  "MoF",
  "DoCG",
  "CoP",
  "AoDG",
  "TWoR",
  "TWH",
  "RAR",
  "FitN",
  "TGoF",
  "MG",
  "TFoW",
  "TWQ",
  "TWR",
  "ASitE",
  "WaR",
  "TCoU",
  "CotW",
  "UtAM",
  "TMoM",
  "EfKD",
  "TLoS",
  "TFoN",
  "THftD",
  "RevCore",
  "DoD",
  "EoL",
  "DoG",
  "RoR",
  "DCCE",
  "EMCE",
]);
const officialPacks = packs.filter((p) => officialPackCodes.has(p.code));
const packByCode = new Map(officialPacks.map((p) => [p.code, p]));
const specialIds = {
  Core: "core",
  RevCore: "revised-core",
  Starter: "limited-starter",
  DoD: "starter-dwarves",
  EoL: "starter-elves",
  DoG: "starter-gondor",
  RoR: "starter-rohan",
};
const idFor = (code) =>
  specialIds[code] ?? slug(packByCode.get(code)?.name ?? code);
const cycles = {
  10: "Shadows of Mirkwood",
  12: "Dwarrowdelf",
  14: "Against the Shadow",
  16: "The Ring-maker",
  18: "Angmar Awakened",
  21: "Dream-chaser",
  24: "Haradrim",
  26: "Ered Mithrin",
  29: "Vengeance of Mordor",
  40: "The Hobbit",
  41: "The Lord of the Rings",
};
const deluxe = {
  KD: "Dwarrowdelf",
  HoN: "Against the Shadow",
  VoI: "The Ring-maker",
  TLR: "Angmar Awakened",
  TGH: "Dream-chaser",
  TSoH: "Haradrim",
  TWoR: "Ered Mithrin",
  ASitE: "Vengeance of Mordor",
};
const campaign = {
  AACE: "Angmar Awakened",
  DCCE: "Dream-chaser",
  EMCE: "Ered Mithrin",
};
const kindFor = (p) =>
  p.code === "Core" || p.code === "RevCore"
    ? "core"
    : p.code === "Starter"
      ? "limited-starter"
      : specialIds[p.code]
        ? "starter-deck"
        : deluxe[p.code]
          ? "deluxe"
          : campaign[p.code]
            ? "campaign-expansion"
            : p.cycle_position === 40 || p.cycle_position === 41
              ? "saga"
              : p.cycle_position === 50
                ? "scenario-pack"
                : "adventure-pack";
const descriptions = {
  core: "Original base game with four single-sphere learning lists and three scenarios.",
  deluxe:
    "Heroes, player cards and three scenarios; cards are assembled into decks.",
  "adventure-pack":
    "Original cycle pack with a hero, player cards and a scenario; cards are assembled into decks.",
  saga: "Heroes, player cards and book-based scenarios; cards are assembled into decks.",
  "starter-deck":
    "Sold separately as a ready-to-play deck: three heroes, 50 playing cards and additional deckbuilding cards.",
  "limited-starter":
    "Two prebuilt decks and two scenarios, included in the Limited Collector’s Edition bundle.",
  "scenario-pack":
    "Additional scenarios and encounter cards; requires the Core Set.",
  "campaign-expansion":
    "Scenario and campaign cards from a repackaged cycle; player deckbuilding cards are in the separate Hero Expansion.",
  "hero-expansion":
    "Player-card pool from a deluxe expansion and six Adventure Packs. Includes suggested decklists to assemble.",
  "nightmare-deck":
    "Alternative encounter cards and instructions that modify an existing scenario; the original scenario is required.",
};
const products = officialPacks.map((p) => {
  const kind = kindFor(p);
  return {
    id: idFor(p.code),
    name: p.name,
    kind,
    packCodes: [p.code],
    ...(cycles[p.cycle_position] || deluxe[p.code] || campaign[p.code]
      ? {
          cycle: cycles[p.cycle_position] ?? deluxe[p.code] ?? campaign[p.code],
        }
      : {}),
    content: ["campaign-expansion", "scenario-pack"].includes(kind)
      ? "encounter"
      : "mixed",
    description: descriptions[kind],
    sourceUrls: [p.url, ffg],
  };
});
const productById = new Map(products.map((p) => [p.id, p]));
productById.get("revised-core").reprints = ["core"];
productById.get("revised-core").description =
  "Repackaged Core Set with three copies of each player card and new campaign cards. Includes learning and suggested decklists to assemble.";
productById
  .get("revised-core")
  .sourceUrls.push(
    "https://www.fantasyflightgames.com/en/news/2021/9/16/the-road-goes-ever-on/",
  );
productById
  .get("the-dark-of-mirkwood")
  .sourceUrls.push(
    "https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/the-dark-of-mirkwood-scenario-pack/",
  );
productById.get("the-dark-of-mirkwood").reprints = ["limited-starter"];
productById.get("the-dark-of-mirkwood").description =
  "The Oath and The Caves of Nibin-dûm from the Limited Collector’s Edition, with new campaign cards.";
productById
  .get("limited-starter")
  .sourceUrls.push(
    "https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/lord-rings-living-card-game-limited-collectors-edition/",
  );

const repackCycles = [
  [
    "Angmar Awakened",
    "angmar-awakened",
    "AACE",
    ["TLR", "WoE", "EfMG", "AtE", "ToR", "BoCD", "TDR"],
    "https://www.fantasyflightgames.com/en/news/2022/3/17/evil-reawakened/",
  ],
  [
    "Dream-chaser",
    "dream-chaser",
    "DCCE",
    ["TGH", "FotS", "TitD", "TotD", "DR", "SoCH", "CoC"],
    "https://www.fantasyflightgames.com/en/news/2023/3/2/a-high-seas-adventure/",
  ],
  [
    "Ered Mithrin",
    "ered-mithrin",
    "EMCE",
    ["TWoR", "TWH", "RAR", "FitN", "TGoF", "MG", "TFoW"],
    "https://www.fantasyflightgames.com/en/news/2024/2/22/into-the-wilds/",
  ],
];
for (const [name, id, campaignCode, codes, url] of repackCycles) {
  products.push({
    id: `${id}-hero-expansion`,
    name: `${name} Hero Expansion`,
    kind: "hero-expansion",
    cycle: name,
    content: "player",
    packCodes: [],
    reprints: codes.map(idFor),
    description: descriptions["hero-expansion"],
    sourceUrls: [url],
  });
  const p = productById.get(idFor(campaignCode));
  p.reprints = codes.map(idFor);
  p.sourceUrls.push(url);
}
for (const [name, id, codes, url] of [
  [
    "The Fellowship of the Ring",
    "fellowship-of-the-ring-saga",
    ["TBR", "TRD"],
    "https://www.fantasyflightgames.com/en/news/2022/7/14/the-bonds-of-fellowship/",
  ],
  [
    "The Two Towers",
    "two-towers-saga",
    ["ToS", "LoS"],
    "https://www.fantasyflightgames.com/en/news/2023/7/6/the-hand-and-the-eye/",
  ],
  [
    "The Return of the King",
    "return-of-the-king-saga",
    ["FotW", "MoF"],
    "https://www.fantasyflightgames.com/en/news/2024/7/18/the-fate-of-middle-earth/",
  ],
])
  products.push({
    id,
    name: `${name} Saga Expansion`,
    kind: "saga",
    cycle: "The Lord of the Rings",
    content: "mixed",
    packCodes: [],
    reprints: codes.map(idFor),
    description: `Repackaged contents of ${codes.map((c) => packByCode.get(c).name).join(" and ")}; heroes, deckbuilding cards and six scenarios.`,
    sourceUrls: [url],
  });

// Nightmare deluxe/core/saga boxes package three scenarios together; cycle
// Nightmare Adventure Packs are separate retail products, not a cycle box.
const nightmareGroups = [
  [
    "Core",
    "Core Set",
    "core-set",
    [
      "Passage Through Mirkwood",
      "Journey Along the Anduin",
      "Escape from Dol Guldur",
    ],
  ],
  [
    "KD",
    "Khazad-dûm",
    "khazad-dum",
    ["Into the Pit", "The Seventh Level", "Flight from Moria"],
  ],
  [
    "HoN",
    "Heirs of Númenor",
    "heirs-of-numenor",
    ["Peril in Pelargir", "Into Ithilien", "The Siege of Cair Andros"],
  ],
  [
    "VoI",
    "The Voice of Isengard",
    "the-voice-of-isengard",
    ["The Fords of Isen", "To Catch an Orc", "Into Fangorn"],
  ],
  [
    "TLR",
    "The Lost Realm",
    "the-lost-realm",
    ["Intruders in Chetwood", "The Weather Hills", "Deadmen’s Dike"],
  ],
  [
    "TGH",
    "The Grey Havens",
    "the-grey-havens",
    [
      "Voyage Across Belegaer",
      "The Fate of Númenor",
      "Raid on the Grey Havens",
    ],
  ],
  [
    "OHaUH",
    "The Hobbit: Over Hill and Under Hill",
    "the-hobbit-over-hill-and-under-hill",
    [
      "We Must Away, Ere Break of Day",
      "Over the Misty Mountains Grim",
      "Dungeons Deep and Caverns Dim",
    ],
  ],
  [
    "OtD",
    "The Hobbit: On the Doorstep",
    "the-hobbit-on-the-doorstep",
    ["Flies and Spiders", "The Lonely Mountain", "The Battle of Five Armies"],
  ],
  [
    "TBR",
    "The Black Riders",
    "the-black-riders",
    ["A Shadow of the Past", "A Knife in the Dark", "Flight to the Ford"],
  ],
  [
    "TRD",
    "The Road Darkens",
    "the-road-darkens",
    [
      "The Ring Goes South",
      "Journey in the Dark",
      "Breaking of the Fellowship",
    ],
  ],
  [
    "ToS",
    "The Treason of Saruman",
    "the-treason-of-saruman",
    ["The Uruk-hai", "Helm’s Deep", "The Road to Isengard"],
  ],
  [
    "LoS",
    "The Land of Shadow",
    "the-land-of-shadow",
    [
      "The Passage of the Marshes",
      "Journey to the Cross-roads",
      "Shelob’s Lair",
    ],
  ],
];
const nightmareSources = [
  "https://www.fantasyflightgames.com/en/products/the-lord-of-the-rings-the-card-game/products/black-riders-nightmare-decks/",
  "https://github.com/GeckoTH/Lord-of-the-Rings",
];
for (const [code, name, sourceSlug, quests] of nightmareGroups)
  products.push({
    id: `${idFor(code)}-nightmare`,
    name: `${name} Nightmare Decks`,
    kind: "nightmare-deck",
    cycle: productById.get(idFor(code)).cycle ?? "Core Set",
    content: "encounter",
    packCodes: [`nightmare:${sourceSlug}`],
    aliases: [
      `${name.replace(": ", " - ")} - Nightmare`,
      `${name} - Nightmare`,
    ],
    encounterSets: quests.map((q) => `${q} - Nightmare`),
    requires: [idFor(code)],
    description: descriptions["nightmare-deck"],
    sourceUrls: nightmareSources,
  });
const nightmareCycles = {
  10: "shadows-of-mirkwood",
  12: "dwarrowdelf",
  14: "against-the-shadow",
  16: "ringmaker",
  18: "angmar-awakened",
  21: "dreamchaser",
};
for (const p of officialPacks.filter((p) => nightmareCycles[p.cycle_position]))
  products.push({
    id: `${idFor(p.code)}-nightmare`,
    name: `${p.name} Nightmare Deck`,
    kind: "nightmare-deck",
    cycle: cycles[p.cycle_position],
    content: "encounter",
    packCodes: [`nightmare:${nightmareCycles[p.cycle_position]}`],
    encounterSets: [
      `${p.name} - Nightmare`,
      ...(p.code === "TitD" ? ["The Things in the Depths - Nightmare"] : []),
    ],
    requires: [idFor(p.code)],
    description: descriptions["nightmare-deck"],
    sourceUrls: nightmareSources,
  });

// These individual promotional printings were checked against FFG's event
// announcements and card/product-layout images. They reuse existing rules.
const promoSources = {
  aragorn:
    "https://www.fantasyflightgames.com/en/ffg_blog/22030/original_content",
  legolas:
    "https://www.fantasyflightgames.com/en/news/2015/10/30/join-the-fellowship/",
  gondor:
    "https://www.fantasyflightgames.com/en/news/2016/7/27/defend-against-the-siege-of-annuminas/",
  elves:
    "https://www.fantasyflightgames.com/en/news/2017/9/14/assault-on-dol-guldur/",
  eowyn:
    "https://www.fantasyflightgames.com/en/news/2018/8/24/the-woodland-realm/",
};
for (const [id, name, code, event, url] of [
  [
    "promo-aragorn-2014",
    "Aragorn",
    "01001",
    "Fellowship 2014",
    promoSources.aragorn,
  ],
  [
    "promo-legolas-2015",
    "Legolas",
    "01005",
    "Fellowship 2015",
    promoSources.legolas,
  ],
  [
    "promo-boromir-2016",
    "Boromir",
    "02095",
    "Gen Con 2016",
    promoSources.gondor,
  ],
  [
    "promo-faramir-2016",
    "Faramir",
    "144002",
    "Fellowship 2016",
    promoSources.gondor,
  ],
  [
    "promo-celeborn-2017",
    "Celeborn",
    "08001",
    "Gen Con 2017",
    promoSources.elves,
  ],
  [
    "promo-galadriel-2017",
    "Galadriel",
    "08112",
    "Fellowship 2017",
    promoSources.elves,
  ],
  ["promo-eowyn-2018", "Éowyn", "01007", "Fellowship 2018", promoSources.eowyn],
]) {
  if (
    !cards.some(
      (c) => c.code === code && c.name === name && c.type_code === "hero",
    )
  )
    throw new Error(
      `Promotional printing does not match its canonical hero: ${id}`,
    );
  products.push({
    id,
    name: `${name} · ${event} Promo`,
    kind: "promo",
    packCodes: [],
    cardCodes: [code],
    content: "player",
    description: `Official alternate-art printing of ${name}, distributed at ${event}. Its rules match the original hero; this is not a separately sold player deck.`,
    sourceUrls: [url],
  });
}

const recipes = [
  {
    pack: "DoD",
    heroes: ["Dáin Ironfoot", "Ori", "Bifur"],
    cards: {
      Bombur: 1,
      Dori: 2,
      "Erebor Hammersmith": 3,
      "Erebor Record Keeper": 3,
      "Ered Luin Miner": 3,
      "Ered Nimrais Prospector": 3,
      Gandalf: 3,
      Glóin: 2,
      "Longbeard Elder": 3,
      "Miner of the Iron Hills": 2,
      Cram: 2,
      "Healing Herbs": 2,
      "King Under the Mountain": 3,
      "Legacy of Durin": 2,
      "Narvi’s Belt": 2,
      "Thrór’s Map": 2,
      "A Very Good Tale": 2,
      "Hidden Cache": 3,
      "Lure of Moria": 2,
      "We Are Not Idle": 3,
      "Durin’s Song": 2,
    },
  },
  {
    pack: "EoL",
    heroes: ["Celeborn", "Galadriel", "Haldir of Lórien"],
    cards: {
      "Defender of the Naith": 3,
      "Galadhrim Minstrel": 3,
      "Galadriel’s Handmaiden": 3,
      Gandalf: 2,
      "Greenwood Archer": 3,
      "Henamarth Riversong": 2,
      "Mirkwood Runner": 2,
      "Naith Guide": 3,
      Orophin: 2,
      "Silvan Refugee": 2,
      "Silvan Tracker": 2,
      Lembas: 2,
      Nenya: 3,
      "O Lórien!": 3,
      Wingfoot: 2,
      "A Test of Will": 2,
      "Daeron’s Runes": 2,
      "Elrond’s Counsel": 2,
      "Feigned Voices": 3,
      "Host of Galadhrim": 2,
      "The Tree People": 2,
    },
  },
  {
    pack: "DoG",
    heroes: ["Boromir", "Prince Imrahil", "Mablung"],
    cards: {
      "Angbor the Fearless": 2,
      "Soldier of Gondor": 3,
      "Citadel Custodian": 2,
      "Defender of Rammas": 3,
      "Pelargir Ship Captain": 2,
      "Errand-rider": 2,
      Faramir: 2,
      Gandalf: 2,
      "Gondorian Spearman": 2,
      "Envoy of Pelargir": 3,
      "Squire of the Citadel": 3,
      "Captain of Gondor": 1,
      "Gondorian Shield": 2,
      "Heir of Mardil": 1,
      "Steward of Gondor": 2,
      "Valiant Sword": 3,
      "Visionary Leadership": 3,
      "Behind Strong Walls": 2,
      Feint: 2,
      "Need Drives Them": 2,
      "Pillars of the Kings": 2,
      "Valiant Sacrifice": 2,
      "Foe-hammer": 2,
    },
  },
  {
    pack: "RoR",
    heroes: ["Éomer", "Hirgon", "Lothíriel"],
    cards: {
      Éomund: 3,
      "Escort from Edoras": 3,
      Gandalf: 2,
      Guthlaf: 1,
      "Horseback Archer": 2,
      "Riddermark Knight": 3,
      "West Road Traveller": 3,
      "Westfold Horse-Breaker": 2,
      "Westfold Horse-breeder": 2,
      "Westfold Lancer": 3,
      "Westfold Outrider": 3,
      "Ancient Mathom": 2,
      Firefoot: 2,
      "Horn of the Mark": 2,
      "The Red Arrow": 1,
      "War Axe": 2,
      "A Test of Will": 2,
      "Astonishing Speed": 2,
      Feint: 2,
      "Forth Eorlingas!": 2,
      "Oath of Eorl": 2,
      "The Muster of Rohan": 2,
      "Wait no Longer": 2,
    },
  },
];
const starters = recipes.map((recipe, i) => {
  const included = cards.filter((c) =>
    c.packs?.some((p) => p.pack_code === recipe.pack),
  );
  const find = (name, hero) => {
    const matches = included.filter(
      (c) =>
        normalize(c.name) === normalize(name) &&
        (c.type_code === "hero") === hero,
    );
    if (matches.length !== 1)
      throw new Error(
        `${recipe.pack}: ${name} resolves to ${matches.length} cards`,
      );
    return matches[0].code;
  };
  const heroes = recipe.heroes.map((name) => find(name, true));
  const list = Object.fromEntries(
    Object.entries(recipe.cards).map(([name, quantity]) => [
      find(name, false),
      quantity,
    ]),
  );
  if (Object.values(list).reduce((sum, n) => sum + n, 0) !== 50)
    throw new Error(`${recipe.pack}: starter must contain 50 cards`);
  const sideboard = Object.fromEntries(
    included.flatMap((c) => {
      const physical = c.packs.find(
        (p) => p.pack_code === recipe.pack,
      ).quantity;
      const remaining =
        physical - (heroes.includes(c.code) ? 1 : (list[c.code] ?? 0));
      if (remaining < 0) throw new Error(`${recipe.pack}: too many ${c.name}`);
      return remaining ? [[c.code, remaining]] : [];
    }),
  );
  const source_url = `https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/mec${103 + i}_rules.pdf`;
  const product = productById.get(idFor(recipe.pack));
  product.sourceUrls.push(
    "https://www.fantasyflightgames.com/en/news/2021/12/9/starting-the-journey/",
    source_url,
  );
  product.content = "player";
  return {
    id: idFor(recipe.pack),
    productId: idFor(recipe.pack),
    name: product.name,
    deckKind: "official-preconstructed",
    heroes,
    cards: list,
    sideboard,
    source_url,
  };
});

// The 2018 Limited Starter is packed as two consecutive, complete decks.
// OCTGN / DragnCards retain printed numbers 1–33 and 34–65, including two
// separate Core Gandalf printings (#4 and #37), each with quantity two.
// RingsDB folds both Gandalfs into a single #4 printing with quantity four.
const limitedSource =
  "https://github.com/GeckoTH/Lord-of-the-Rings/blob/802f09c407e8b418c6fa59fd003bddfdc671e968/o8g/Sets/Two-Player%20Limited%20Edition%20Starter/set.xml";
const limitedCards = cards.flatMap((card) => {
  const printing = card.packs?.find((p) => p.pack_code === "Starter");
  return printing ? [{ card, printing }] : [];
});
for (const [id, name, first, last, expectedHeroes] of [
  [
    "limited-leadership-spirit",
    "Limited Starter · Leadership / Spirit",
    1,
    33,
    ["01001", "22081", "131003"],
  ],
  [
    "limited-lore-tactics",
    "Limited Starter · Lore / Tactics",
    34,
    65,
    ["01011", "03002", "22001"],
  ],
]) {
  const included = limitedCards
    .filter(
      ({ printing }) => printing.position >= first && printing.position <= last,
    )
    .sort((a, b) => a.printing.position - b.printing.position);
  const heroes = included
    .filter(({ card }) => card.type_code === "hero")
    .map(({ card }) => card.code);
  const list = Object.fromEntries(
    included
      .filter(({ card }) => card.type_code !== "hero")
      .map(({ card, printing }) => [
        card.code,
        card.code === "01073" ? 2 : printing.quantity,
      ]),
  );
  list["01073"] = 2;
  if (
    JSON.stringify(heroes) !== JSON.stringify(expectedHeroes) ||
    Object.values(list).reduce((sum, quantity) => sum + quantity, 0) !== 50
  )
    throw new Error(`${id}: the numbered Limited Starter recipe changed`);
  starters.push({
    id,
    productId: "limited-starter",
    name,
    deckKind: "official-preconstructed",
    heroes,
    cards: list,
    sideboard: {},
    source_url: limitedSource,
  });
}
productById
  .get("limited-starter")
  .sourceUrls.push(
    limitedSource,
    "https://www.fantasyflightgames.com/en/news/2018/6/21/there-and-back-again-1/",
  );

const printedCardProducts = {};
for (const card of cards.filter((c) => packByCode.has(c.pack_code))) {
  const printed = (card.packs ?? []).filter((p) => packByCode.has(p.pack_code));
  const metadata = {
    canonicalCode: card.code,
    originalPack: card.pack_code,
    packs: printed.map((p) => p.pack_code),
    type: card.type_code,
    sphere: card.sphere_code,
  };
  printedCardProducts[card.code] = metadata;
  // Older exports and saved RingsDB lists may use the reprint's image code.
  // Preserve the card's first publication even when an alias identifies a later edition.
  for (const printing of printed)
    if (printing.image_code)
      printedCardProducts[printing.image_code] = metadata;
}
await Promise.all([
  fs.writeFile(
    "src/data/products.json",
    JSON.stringify(products, null, 2) + "\n",
  ),
  fs.writeFile(
    "src/data/card-products.json",
    JSON.stringify(printedCardProducts) + "\n",
  ),
  fs.writeFile(
    "src/data/official-starter-decks.json",
    JSON.stringify(starters, null, 2) + "\n",
  ),
  fs.writeFile(
    "public/published-decks.json",
    JSON.stringify(starters, null, 2) + "\n",
  ),
]);
console.log(
  `${products.filter((p) => p.kind !== "promo").length} published products and ${products.filter((p) => p.kind === "promo").length} verified promotional printings; ${Object.keys(printedCardProducts).length} card provenance keys including reprint aliases; ${starters.length} official preconstructed recipes.`,
);
