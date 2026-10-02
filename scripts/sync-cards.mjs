import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { canonicalReprint } from "./card-identity.mjs";

// A reference import does not expand the game's automated card scripts.
const urls = {
  cards: "https://ringsdb.com/api/public/cards/",
  packs: "https://ringsdb.com/api/public/packs/",
  dragncards: "https://dragncards.com/be/api/plugins/1",
};
const argv = process.argv.slice(2);
const sourceArg = argv.indexOf("--source-dir");
const sourceDir = sourceArg >= 0 ? argv[sourceArg + 1] : undefined;
if (sourceArg >= 0 && !sourceDir)
  throw new Error("--source-dir needs a directory");
const retrievedAt =
  process.env.CONTENT_RETRIEVED_AT ?? new Date().toISOString();
const digest = (data) => createHash("sha256").update(data).digest("hex");
const normalize = (s = "") =>
  s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^thehobbit/, "")
    .replace(/^thedarkofmirkwood$/, "darkofmirkwood");
const slug = (s) =>
  s
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const nightmareNames = [
  "Core Set",
  "Shadows of Mirkwood",
  "Khazad-dum",
  "Dwarrowdelf",
  "The Hobbit - Over Hill and Under Hill",
  "The Hobbit - On the Doorstep",
  "Heirs of Numenor",
  "Against the Shadow",
  "The Black Riders",
  "The Voice of Isengard",
  "The Road Darkens",
  "The Lost Realm",
  "Angmar Awakened",
  "Ringmaker",
  "The Treason of Saruman",
  "The Land of Shadow",
  "The Grey Havens",
  "Dreamchaser",
];
const nightmarePacks = new Map(
  nightmareNames.map((name) => [
    normalize(`${name} - Nightmare`),
    {
      code: `nightmare:${slug(name)}`,
      name: `${name} - Nightmare`,
      nightmare: true,
      source: "dragncards",
      source_url: "https://dragncards.com/plugin/1",
    },
  ]),
);
const raw = {};
const sourceMetadata = {};
for (const [key, url] of Object.entries(urls)) {
  let bytes, headers;
  if (sourceDir) {
    const filename =
      key === "dragncards" ? "dc-plugin-current.json" : `${key}.json`;
    bytes = await fs.readFile(path.join(sourceDir, filename));
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`${key}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    headers = response.headers;
  }
  raw[key] = JSON.parse(bytes.toString("utf8"));
  sourceMetadata[key] = {
    url,
    retrievedAt,
    sha256: digest(bytes),
    bytes: bytes.length,
    ...(headers
      ? {
          etag: headers.get("etag"),
          lastModified: headers.get("last-modified"),
        }
      : {}),
  };
}
const plugin =
  typeof raw.dragncards === "string"
    ? JSON.parse(
        gunzipSync(Buffer.from(raw.dragncards, "base64")).toString("utf8"),
      )
    : raw.dragncards;
if (
  !Array.isArray(raw.cards) ||
  !Array.isArray(raw.packs) ||
  !plugin.card_db ||
  !plugin.game_def?.preBuiltDecks ||
  plugin.id !== 1
) {
  throw new Error("Upstream schema changed: no files were replaced");
}
// Explicit publisher allowlist also excludes future third-party/custom packs.
const ffgPackCodes = new Set([
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
const ringsPacks = raw.packs.filter((p) => ffgPackCodes.has(p.code));
const officialPackCodes = new Set(ringsPacks.map((p) => p.code));
const packsByName = new Map(
  ringsPacks.map((p) => [
    normalize(p.name),
    {
      ...p,
      source: "ringsdb",
      source_url: p.url,
      nightmare: false,
    },
  ]),
);
const resolvePack = (name) =>
  packsByName.get(normalize(name)) ?? nightmarePacks.get(normalize(name));
const officialDb = Object.entries(plugin.card_db).filter(
  ([, c]) => c.A && resolvePack(c.A.packName),
);
const officialDbById = new Map(officialDb);
const imagePrefix =
  plugin.game_def.imageUrlPrefix?.English ??
  plugin.game_def.imageUrlPrefix?.Default;
if (typeof imagePrefix !== "string" || !imagePrefix.startsWith("https://"))
  throw new Error("Missing public image URL prefix");
const numeric = (value) =>
  /^\d+$/.test(String(value ?? "")) ? Number(value) : undefined;
const typeCode = (side) =>
  side.type === "Side Quest"
    ? side.sphere
      ? "player-side-quest"
      : "encounter-side-quest"
    : (side.type ?? "rules").toLowerCase().replace(/[ -]+/g, "-");
const sideText = (s) => [s.keywords, s.text].filter(Boolean).join("\n");
const trimUndefined = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const printing = (id, side, pack) =>
  trimUndefined({
    pack_code: pack.code,
    pack_name: pack.name,
    position: numeric(side.numberInPack),
    quantity: numeric(side.deckbuilderQuantity) ?? 1,
    octgnid: id,
    imagesrc: side.imageUrl?.startsWith("http")
      ? side.imageUrl
      : `${imagePrefix}${side.imageUrl ?? `${id}.jpg`}`,
  });
const dbCard = (id, c) => {
  const a = c.A,
    b = c.B,
    pack = resolvePack(a.packName),
    type = typeCode(a);
  return trimUndefined({
    code: `octgn:${id}`,
    octgnid: id,
    name: a.name,
    type_code: type,
    sphere_code: a.sphere?.toLowerCase() || "encounter",
    traits: a.traits ?? "",
    text: sideText(a),
    is_unique: ["1", "yes", "true", "‰"].includes(
      String(a.unique ?? "").toLowerCase(),
    ),
    pack_code: pack.code,
    pack_name: pack.name,
    position: numeric(a.numberInPack),
    quantity: numeric(a.deckbuilderQuantity) ?? 1,
    cost: type === "hero" ? undefined : numeric(a.cost),
    threat: type === "hero" ? numeric(a.cost) : numeric(a.threat),
    willpower: numeric(a.willpower),
    attack: numeric(a.attack),
    defense: numeric(a.defense),
    health: numeric(a.hitPoints),
    quest: numeric(a.questPoints),
    engagement: numeric(a.engagementCost),
    // Quest victory is printed on the reverse. Some upstream records put it
    // only on B, unlike the OCTGN front-side metadata for the same card.
    victory:
      numeric(a.victoryPoints) ??
      (type === "quest" ? numeric(b?.victoryPoints) : undefined),
    // PASS and other printed corner labels are rules text, not numeric victory.
    corner_text: a.cornerText || undefined,
    shadow: a.shadow || undefined,
    encounter_set: a.encounterSet || undefined,
    side: a.side || undefined,
    back_name: b?.text || b?.type ? b.name : undefined,
    back_text: b?.text || b?.keywords ? sideText(b) : undefined,
    back_type_code: b?.type ? typeCode(b) : undefined,
    back_quest: numeric(b?.questPoints),
    back_victory: numeric(b?.victoryPoints),
    back_corner_text: b?.cornerText || undefined,
    back_imagesrc: b?.imageUrl
      ? b.imageUrl.startsWith("http")
        ? b.imageUrl
        : `${imagePrefix}${b.imageUrl}`
      : undefined,
    printed_stats: Object.fromEntries(
      Object.entries({
        cost: a.cost,
        threat: a.threat,
        willpower: a.willpower,
        attack: a.attack,
        defense: a.defense,
        health: a.hitPoints,
        quest: a.questPoints,
        engagement: a.engagementCost,
        victory:
          a.victoryPoints || (type === "quest" ? b?.victoryPoints : undefined),
      }).filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      ),
    ),
    imagesrc: printing(id, a, pack).imagesrc,
    packs: [printing(id, a, pack)],
    source: "dragncards",
    source_url: "https://dragncards.com/plugin/1",
    official: true,
    nightmare: pack.nightmare,
  });
};
// Read only original fixtures; importing cards.ts would introduce a dependency
// on a previous catalogue and could mistakenly treat imported cards as scripted.
const curated = [
  ...JSON.parse(await fs.readFile("src/data/player-cards.json", "utf8")),
  ...JSON.parse(await fs.readFile("src/data/encounter-cards.json", "utf8")),
  ...JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        'import {CAMPAIGN_CARDS} from "./src/game/scenarios.ts"; process.stdout.write(JSON.stringify(CAMPAIGN_CARDS));',
      ],
      { encoding: "utf8" },
    ),
  ),
];
const curatedKey = (c) => `${normalize(c.pack_name)}:${normalize(c.name)}`;
const curatedByName = new Map(curated.map((c) => [curatedKey(c), c]));
const ringsCards = raw.cards.filter((c) =>
  (c.packs ?? [c]).some((p) => officialPackCodes.has(p.pack_code)),
);
const byUuid = new Map(),
  catalogue = new Map();
const playerFields = [
  "code",
  "name",
  "type_code",
  "type_name",
  "sphere_code",
  "sphere_name",
  "cost",
  "threat",
  "willpower",
  "attack",
  "defense",
  "health",
  "traits",
  "text",
  "flavor",
  "is_unique",
  "deck_limit",
  "pack_name",
  "pack_code",
  "position",
  "illustrator",
  "imagesrc",
  "url",
  "quantity",
  "octgnid",
  "has_errata",
  "restrictions",
  "errata",
];
for (const c of ringsCards) {
  const printings = (c.packs ?? [c]).filter((p) =>
    officialPackCodes.has(p.pack_code),
  );
  // A merged RingsDB row can aggregate two physical copies with different
  // card numbers. Use the matching Dragn printing's actual quantity, retaining
  // the aggregate API value as provenance (Limited Starter Gandalf #4/#37).
  for (const printing of printings) {
    const physical = officialDbById.get(printing.octgnid)?.A;
    const physicalQuantity = numeric(physical?.deckbuilderQuantity);
    if (
      physical &&
      resolvePack(physical.packName).code === printing.pack_code &&
      numeric(physical.numberInPack) === printing.position &&
      physicalQuantity !== undefined &&
      physicalQuantity !== printing.quantity
    ) {
      printing.ringsdb_quantity = printing.quantity;
      printing.quantity = physicalQuantity;
    }
  }
  const clean = Object.fromEntries(
    playerFields.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]),
  );
  if (!officialPackCodes.has(clean.pack_code))
    Object.assign(clean, printings[0]);
  Object.assign(clean, {
    packs: printings,
    source: "ringsdb",
    source_url: c.url,
    official: true,
    nightmare: false,
  });
  // The API labels many campaign boons/burdens Treasure. Keep its original
  // type for provenance and use the published face type/sphere in the library.
  let dbId = c.octgnid;
  let db = officialDbById.get(dbId);
  // Reconcile source identity errors by physical pack, position and printed name.
  // In particular RingsDB currently gives Gundabad Stalker the Hunter UUID.
  if (db && normalize(db.A.name) !== normalize(c.name)) {
    const corrected = officialDb.find(
      ([, record]) =>
        resolvePack(record.A.packName).code === c.pack_code &&
        numeric(record.A.numberInPack) === c.position &&
        normalize(record.A.name) === normalize(c.name),
    );
    if (corrected) {
      [dbId, db] = corrected;
      clean.ringsdb_octgnid = clean.octgnid;
      clean.octgnid = dbId;
      for (const p of clean.packs) {
        if (p.pack_code === c.pack_code && p.position === c.position)
          p.octgnid = dbId;
      }
    }
  }
  if (c.type_code === "treasure" && db) {
    const actual = dbCard(dbId, db);
    Object.assign(clean, {
      ringsdb_type_code: c.type_code,
      type_code: actual.type_code,
      sphere_code: actual.sphere_code,
      encounter_set: actual.encounter_set,
      shadow: actual.shadow,
      back_name: actual.back_name,
      back_text: actual.back_text,
      back_type_code: actual.back_type_code,
      back_quest: actual.back_quest,
      back_imagesrc: actual.back_imagesrc,
    });
  }
  const engine = curatedByName.get(curatedKey(clean));
  if (engine) clean.engine_code = engine.code;
  if (catalogue.has(clean.code))
    throw new Error(`Duplicate RingsDB code ${clean.code}`);
  catalogue.set(clean.code, trimUndefined(clean));
  for (const p of printings)
    if (p.octgnid && !byUuid.has(p.octgnid)) byUuid.set(p.octgnid, clean.code);
  if (dbId && !byUuid.has(dbId)) byUuid.set(dbId, clean.code);
}
const playerIdentity = new Map();
for (const c of catalogue.values()) {
  if (
    [
      "hero",
      "ally",
      "attachment",
      "event",
      "player-side-quest",
      "contract",
      "treasure",
    ].includes(c.type_code) &&
    !["boon", "burden"].includes(c.sphere_code)
  ) {
    const identity = `${normalize(c.name)}:${c.type_code}:${c.sphere_code}`;
    const candidates = playerIdentity.get(identity) ?? [];
    candidates.push(c);
    playerIdentity.set(identity, candidates);
  }
}
for (const [id, db] of officialDb) {
  if (byUuid.has(id)) continue;
  const c = dbCard(id, db);
  const original = canonicalReprint(
    playerIdentity.get(
      `${normalize(c.name)}:${c.type_code}:${c.sphere_code}`,
    ) ?? [],
    c,
  )?.code;
  if (
    original &&
    !c.encounter_set &&
    !["boon", "burden"].includes(c.sphere_code)
  ) {
    const target = catalogue.get(original);
    if (!target.packs.some((p) => p.octgnid === id))
      target.packs.push(...c.packs);
    byUuid.set(id, original);
    continue;
  }
  const engine = curatedByName.get(curatedKey(c));
  if (engine) {
    c.code = engine.code;
    c.engine_code = engine.code;
  }
  // Keep the established original Core and first Adventure Pack numbers.
  if (c.pack_code === "Core" && c.position > 73)
    c.code = `01${String(c.position).padStart(3, "0")}`;
  if (c.pack_code === "HfG" && c.position > 10)
    c.code = `02${String(c.position).padStart(3, "0")}`;
  if (catalogue.has(c.code))
    throw new Error(`Duplicate canonical code ${c.code}`);
  catalogue.set(c.code, c);
  byUuid.set(id, c.code);
}
const scenarios = [],
  campaignPools = [],
  excludedRecipes = [];
const recipeCorrections = JSON.parse(
  await fs.readFile(
    new URL("../src/data/scenario-recipe-corrections.json", import.meta.url),
    "utf8",
  ),
);
for (const [id, recipe] of Object.entries(plugin.game_def.preBuiltDecks)) {
  if (!/^[QENC]/.test(id)) continue;
  if (
    !Array.isArray(recipe.cards) ||
    recipe.cards.some((c) => !byUuid.has(c.databaseId))
  ) {
    excludedRecipes.push({ id, name: recipe.label });
    continue;
  }
  const sections = {};
  let recipeCards = recipe.cards.map((c) => {
    if (!Number.isInteger(c.quantity) || c.quantity < 1)
      throw new Error(`${id}: invalid quantity`);
    const code = byUuid.get(c.databaseId),
      section = c.loadGroupId;
    sections[section] ??= {};
    sections[section][code] = (sections[section][code] ?? 0) + c.quantity;
    return {
      code,
      quantity: c.quantity,
      section,
      ...(c.side ? { side: c.side } : {}),
    };
  });
  const correction = recipeCorrections[id];
  if (correction) {
    for (const [section, cards] of Object.entries(correction.sections)) {
      sections[section] = cards;
      recipeCards = recipeCards.filter((c) => c.section !== section);
      for (const [code, quantity] of Object.entries(cards)) {
        if (!catalogue.has(code) || !Number.isInteger(quantity) || quantity < 1)
          throw new Error(`${id}: invalid primary-source correction ${code}`);
        recipeCards.push({ code, quantity, section });
      }
    }
  }
  const codes = [...new Set(recipeCards.map((c) => c.code))];
  const entry = {
    id,
    name: recipe.label,
    mode: id.startsWith("E")
      ? "easy"
      : id.startsWith("N")
        ? "nightmare"
        : /^(C|Q0C)/.test(id)
          ? "campaign"
          : "standard",
    campaign: /^(C|[QEN]0C)/.test(id),
    pack_codes: [
      ...new Set(codes.map((c) => catalogue.get(c).pack_code)),
    ].sort(),
    card_codes: codes,
    cards: recipeCards,
    sections,
    source: correction ? "ffg" : "dragncards",
    source_url: correction?.source_url ?? "https://dragncards.com/plugin/1",
    ...(correction
      ? {
          correction_reason: correction.reason,
          original_source: {
            source: "dragncards",
            source_url: "https://dragncards.com/plugin/1",
            recipe_id: id,
          },
        }
      : {}),
    automated: false,
  };
  (id.startsWith("C") ? campaignPools : scenarios).push(entry);
}
const fullCards = [...catalogue.values()].sort((a, b) =>
  a.code.localeCompare(b.code, "en"),
);
for (const c of fullCards) {
  if (
    ![c.code, c.name, c.type_code, c.sphere_code, c.pack_code].every(
      (v) => typeof v === "string" && v.length > 0,
    ) ||
    !Number.isInteger(c.quantity) ||
    c.quantity < 0 ||
    !c.packs.length
  ) {
    throw new Error(`Malformed official record ${c.code}`);
  }
}
const nonPlayers = fullCards.filter(
  (c) =>
    c.sphere_code === "encounter" ||
    c.sphere_code === "burden" ||
    [
      "quest",
      "campaign",
      "nightmare",
      "rules",
      "objective",
      "objective-ally",
      "objective-hero",
      "ship-enemy",
      "ship-objective",
      "encounter-side-quest",
    ].includes(c.type_code),
);
const nonPlayerCodes = new Set(nonPlayers.map((c) => c.code));
const officialPlayers = fullCards.filter((c) => !nonPlayerCodes.has(c.code));
const packs = [...packsByName.values(), ...nightmarePacks.values()]
  .map((p) => ({
    ...p,
    count: fullCards.filter((c) =>
      c.packs.some((printing) => printing.pack_code === p.code),
    ).length,
  }))
  .sort((a, b) => a.code.localeCompare(b.code, "en"));
const counts = (key) =>
  Object.fromEntries(
    [...new Set(fullCards.map((c) => c[key]))]
      .sort()
      .map((value) => [
        value,
        fullCards.filter((c) => c[key] === value).length,
      ]),
  );
const standardNames = new Set(
  scenarios
    .filter((s) => s.mode === "standard")
    .map((s) =>
      normalize(
        s.name
          .replace(/^(Standard|Epic) /, "")
          .replace(
            / \((Campaign|Easy|Nightmare|Limited Collector's Edition)\)$/,
            "",
          ),
      ),
    ),
);
const nightmareScenarioNames = new Set(
  scenarios
    .filter((s) => s.mode === "nightmare")
    .map((s) => normalize(s.name.replace(/ \(Nightmare\)$/, ""))),
);
if (
  fullCards.length < 4000 ||
  standardNames.size !== 121 ||
  nightmareScenarioNames.size !== 72
) {
  throw new Error(
    `Incomplete snapshot: ${fullCards.length} cards, ${standardNames.size} scenarios, ${nightmareScenarioNames.size} nightmares`,
  );
}
for (const p of packs)
  if (!p.count && p.total)
    throw new Error(`Pack ${p.code} has no imported definitions`);
const manifest = {
  schemaVersion: 2,
  retrievedAt,
  scope:
    "Published Fantasy Flight Games LotR LCG card definitions and source recipes; community and virtual MotK cards excluded.",
  recipeCorrections: {
    file: "src/data/scenario-recipe-corrections.json",
    canonicalJsonSha256: createHash("sha256")
      .update(JSON.stringify(recipeCorrections))
      .digest("hex"),
    entries: Object.entries(recipeCorrections).map(([id, correction]) => ({
      id,
      source_url: correction.source_url,
      reason: correction.reason,
    })),
  },
  sources: {
    ...sourceMetadata,
    dragncards: { ...sourceMetadata.dragncards, pluginVersion: plugin.version },
  },
  counts: {
    cards: fullCards.length,
    playerCards: officialPlayers.length,
    encounterAndCampaignCards: nonPlayers.length,
    heroes: fullCards.filter((c) => c.type_code === "hero").length,
    packs: packs.length,
    ringsdbCanonicalCards: ringsCards.length,
    officialDragncardsRecords: officialDb.length,
    officialDragncardsPrintings: officialDb.filter(
      ([, c]) => numeric(c.A.deckbuilderQuantity) !== 0,
    ).length,
    cardPrintings: fullCards.reduce(
      (n, c) => n + c.packs.filter((p) => p.quantity !== 0).length,
      0,
    ),
    canonicalPrintedCards: fullCards.filter((c) => c.quantity !== 0).length,
    referenceOnlyFaces: fullCards.filter((c) => c.quantity === 0).length,
    scenarios: standardNames.size,
    nightmareScenarios: nightmareScenarioNames.size,
    scenarioRecipes: scenarios.length,
    campaignPools: campaignPools.length,
    byType: counts("type_code"),
    bySphere: counts("sphere_code"),
  },
  excluded: {
    ringsdbPacks: raw.packs
      .filter((p) => !officialPackCodes.has(p.code))
      .map((p) => ({ code: p.code, name: p.name })),
    dragncardsCardRecords:
      Object.keys(plugin.card_db).length - officialDb.length,
    scenarioRecipes: excludedRecipes,
  },
  notes: [
    "Reprints are folded into canonical player identities by rules and stat fingerprints; packs retains physical printing, quantity, image and OCTGN identity.",
    "Limited Starter Gandalf printings 4 and 37 both resolve to Core Gandalf with two copies each; the API aggregate quantity is preserved as ringsdb_quantity.",
    "Quantity-zero references are scanned rule-sheet pages or alternate faces already belonging to printed cards, excluded from physical printing counts.",
    "Nightmare data packs are grouped by original OCTGN set; retail Nightmare products are in the product catalogue.",
    "RingsDB availability dates can describe original content rather than the revised retail release.",
    "Imported rules text and scenario deck recipes do not imply automated play support.",
    "Gundabad Stalker upstream RingsDB UUID is reconciled by exact printed pack, position and name against DragnCards; ringsdb_octgnid retains the original API identity.",
    "The Long Dark standard/easy recipes use the official rulesheet's three encounter sets instead of the upstream Deeps of Moria inclusion; original_source and correction_reason retain the audit trail.",
    "Non-numeric printed corner labels, including The Long Dark's six PASS cards, are preserved as corner_text/back_corner_text.",
  ],
};
for (const s of [...scenarios, ...campaignPools])
  for (const code of s.card_codes) {
    if (!catalogue.has(code)) throw new Error(`${s.id}: missing ${code}`);
  }
const outputs = {
  "public/catalog.json": fullCards,
  "public/packs.json": packs,
  "public/scenarios.json": scenarios.sort((a, b) =>
    a.id.localeCompare(b.id, "en"),
  ),
  "public/campaign-pools.json": campaignPools.sort((a, b) =>
    a.id.localeCompare(b.id, "en"),
  ),
  "public/data-metadata.json": manifest,
  "src/data/official-player-cards.json": officialPlayers,
};
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "lotr-content-"));
try {
  for (const [filename, data] of Object.entries(outputs)) {
    await fs.writeFile(
      path.join(staging, path.basename(filename)),
      JSON.stringify(
        data,
        null,
        filename.endsWith("data-metadata.json") ? 2 : undefined,
      ) + "\n",
    );
  }
  for (const filename of Object.keys(outputs)) {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.copyFile(
      path.join(staging, path.basename(filename)),
      `${filename}.tmp`,
    );
    await fs.rename(`${filename}.tmp`, filename);
  }
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
console.log(JSON.stringify(manifest.counts, null, 2));
