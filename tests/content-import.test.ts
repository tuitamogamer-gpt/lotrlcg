import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SCRIPTED, STARTERS } from "../src/game/cards";
import type { Card } from "../src/game/types";
import { canonicalReprint } from "../scripts/card-identity.mjs";

const read = (filename: string) =>
  JSON.parse(fs.readFileSync(filename, "utf8"));
const catalogue = read("public/catalog.json") as (Card & {
  position?: number;
  back_quest?: number;
  ringsdb_octgnid?: string;
  corner_text?: string;
  packs: { pack_code: string; quantity: number; octgnid?: string }[];
})[];
const byCode = new Map(catalogue.map((c) => [c.code, c]));
const packs = read("public/packs.json");
const scenarios = read("public/scenarios.json");
const campaignPools = read("public/campaign-pools.json");
const manifest = read("public/data-metadata.json");

test("quest victory printed only on the reverse is retained for victory displays", () => {
  for (const [suffix, victory] of [
    ["9002", 2],
    ["9062", 2],
    ["9064", 1],
    ["9066", 1],
    ["9068", 1],
  ] as const) {
    const c = byCode.get(`octgn:51223bd0-ffd1-11df-a976-0801207c${suffix}`)!;
    assert.equal(c.victory, victory);
    assert.equal(c.printed_stats?.victory, String(victory));
  }
  const departure = byCode.get("octgn:007721bf-3e80-4857-aaf4-aabb65d1827d")!;
  assert.equal(departure.victory, 3);
});

test("The Long Dark's six printed PASS corner labels survive canonical import", () => {
  const passCards = catalogue.filter(
    (c) => c.pack_code === "TLD" && c.corner_text === "PASS",
  );
  assert.equal(passCards.length, 6);
  for (const suffix of ["9001", "9006", "9011", "9013", "9023", "9024"]) {
    assert.ok(
      passCards.some((c) => c.code.endsWith(suffix)),
      suffix,
    );
  }
  assert.ok(passCards.every((c) => c.victory === undefined));
});

test("The Long Dark reference recipes follow the primary encounter sets and retain one setup Torch", () => {
  for (const [id, expected] of [
    ["Q02.7", 58],
    ["E02.7", 42],
  ] as const) {
    const recipe = scenarios.find((s: { id: string }) => s.id === id);
    assert.equal(recipe.source, "ffg");
    assert.match(recipe.source_url, /the_long_dark_rulesheet\.pdf$/);
    assert.match(recipe.correction_reason, /Deeps of Moria/);
    assert.equal(recipe.original_source.source, "dragncards");
    assert.equal(
      Object.values(recipe.sections.sharedEncounterDeck).reduce(
        (n: number, v: unknown) => n + Number(v),
        0,
      ),
      expected,
    );
    assert.equal(
      recipe.sections.sharedStagingArea[
        "octgn:51223bd0-ffd1-11df-a976-0801207c9017"
      ],
      1,
    );
    const sets = new Set(
      Object.keys(recipe.sections.sharedEncounterDeck).map(
        (code) => byCode.get(code)?.encounter_set,
      ),
    );
    assert.deepEqual(
      sets,
      new Set(["The Long Dark", "Twists and Turns", "Hazards of the Pit"]),
    );
  }
});

test("full official snapshot has unique identities and reconciled manifest counts", () => {
  assert.equal(catalogue.length, 4183);
  assert.equal(byCode.size, catalogue.length);
  assert.equal(manifest.counts.cards, catalogue.length);
  assert.equal(manifest.counts.canonicalPrintedCards, 4144);
  assert.equal(manifest.counts.referenceOnlyFaces, 39);
  assert.equal(manifest.counts.cardPrintings, 4410);
  assert.equal(
    manifest.counts.cardPrintings,
    catalogue.reduce(
      (n, c) => n + c.packs.filter((p) => p.quantity !== 0).length,
      0,
    ),
  );
  const packCodes = new Set(packs.map((p: { code: string }) => p.code));
  for (const c of catalogue) {
    assert.ok(c.official, c.code);
    assert.ok(c.name && c.type_code && c.sphere_code, c.code);
    assert.ok(packCodes.has(c.pack_code), c.code);
    assert.ok(!/^ALeP/i.test(c.pack_name ?? ""), c.code);
    assert.notEqual(c.pack_code, "MotKA");
    assert.ok(Number.isInteger(c.quantity) && c.quantity! >= 0, c.code);
    assert.ok(c.packs.length > 0, c.code);
    for (const p of c.packs) assert.ok(packCodes.has(p.pack_code), c.code);
  }
  for (const source of Object.values(manifest.sources) as {
    sha256: string;
    url: string;
  }[]) {
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.match(source.url, /^https:\/\//);
  }
});

test("all original cycles, revised campaigns and every published Nightmare are present", () => {
  assert.equal(packs.length, 113);
  assert.equal(
    packs.filter((p: { nightmare: boolean }) => p.nightmare).length,
    18,
  );
  assert.equal(
    packs.filter((p: { cycle_position: number }) =>
      [10, 12, 14, 16, 18, 21, 24, 26, 29].includes(p.cycle_position),
    ).length,
    54,
  );
  for (const [code, expected] of [
    ["AACE", 38],
    ["DCCE", 60],
    ["EMCE", 40],
    ["TDoM", 15],
  ] as const) {
    assert.equal(
      packs.find((p: { code: string }) => p.code === code)?.count,
      expected,
      code,
    );
  }
  const heroes = catalogue.filter((c) => c.type_code === "hero");
  assert.equal(heroes.length, 112);
  assert.equal(
    heroes.filter((c) => !["baggins", "fellowship"].includes(c.sphere_code))
      .length,
    103,
  );
  assert.equal(catalogue.filter((c) => c.type_code === "nightmare").length, 72);
  assert.equal(catalogue.filter((c) => c.type_code === "campaign").length, 60);
  assert.ok(
    catalogue.some((c) => c.pack_code === "EMCE" && c.type_code === "enemy"),
  );
  assert.ok(
    catalogue.some(
      (c) => c.pack_code === "DCCE" && c.type_code === "ship-enemy",
    ),
  );
});

test("355 scenario recipes and seven campaign pools have exact resolvable sections", () => {
  assert.equal(scenarios.length, 355);
  assert.equal(campaignPools.length, 7);
  assert.equal(
    new Set(scenarios.map((s: { id: string }) => s.id)).size,
    scenarios.length,
  );
  assert.equal(manifest.counts.scenarios, 121);
  assert.equal(manifest.counts.nightmareScenarios, 72);
  for (const s of [...scenarios, ...campaignPools]) {
    assert.equal(s.automated, false);
    assert.ok(s.name && s.id && s.source_url, s.id);
    const sectionTotals: Record<string, Record<string, number>> = {};
    for (const c of s.cards) {
      assert.ok(byCode.has(c.code), `${s.id}: ${c.code}`);
      assert.ok(Number.isInteger(c.quantity) && c.quantity > 0, s.id);
      sectionTotals[c.section] ??= {};
      sectionTotals[c.section][c.code] =
        (sectionTotals[c.section][c.code] ?? 0) + c.quantity;
    }
    assert.deepEqual(sectionTotals, s.sections, s.id);
    assert.deepEqual(
      new Set(s.card_codes),
      new Set(s.cards.map((c: { code: string }) => c.code)),
      s.id,
    );
  }
  assert.equal(
    scenarios.find((s: { id: string }) => s.id === "Q0C.01").mode,
    "campaign",
  );
  assert.equal(
    scenarios.find((s: { id: string }) => s.id === "N01.1").mode,
    "nightmare",
  );
});

test("official preconstructed recipes and extras resolve canonical reprint identities", () => {
  const decks = read("public/published-decks.json");
  assert.equal(decks.length, 6);
  assert.equal(
    decks.filter(
      (d: { productId: string }) => d.productId === "limited-starter",
    ).length,
    2,
  );
  assert.equal(
    decks.filter(
      (d: { productId: string }) => d.productId !== "limited-starter",
    ).length,
    4,
  );
  for (const d of decks) {
    assert.equal(d.heroes.length, 3);
    assert.equal(
      Object.values(d.cards).reduce((n: number, q) => n + Number(q), 0),
      50,
    );
    for (const code of [
      ...d.heroes,
      ...Object.keys(d.cards),
      ...Object.keys(d.sideboard),
    ]) {
      assert.ok(byCode.has(code), `${d.id}: ${code}`);
    }
    for (const code of d.heroes)
      assert.equal(byCode.get(code)?.type_code, "hero");
  }
});

test("Core fixtures remain unchanged and reference imports do not enable unscripted expansion rules", () => {
  assert.equal(STARTERS.length, 4);
  assert.ok(SCRIPTED.size >= 137);
  assert.ok(SCRIPTED.has("01074"));
  assert.equal(byCode.get("01074")?.name, "King Spider");
  assert.equal(byCode.get("01132")?.engine_code, "rc132");
  assert.equal(byCode.get("01135")?.type_code, "objective-ally");
  assert.equal(byCode.get("01135")?.engine_code, "rc135");
  assert.ok(SCRIPTED.has("05001"));
  assert.ok(!SCRIPTED.has("142002"));
  assert.ok(!SCRIPTED.has("01132"));
  for (const c of catalogue.filter((c) => c.nightmare))
    assert.ok(!SCRIPTED.has(c.code));
  const quest = byCode.get("01119")!;
  assert.equal(quest.name, "Flies and Spiders");
  assert.equal(quest.back_quest, 8);
  assert.match(quest.text!, /Setup:/);
});

test("corrected campaign types and UUIDs retain the upstream identity for provenance", () => {
  const hunter = byCode.get("12191")!;
  const stalker = byCode.get("12192")!;
  assert.notEqual(hunter.octgnid, stalker.octgnid);
  assert.equal(stalker.ringsdb_octgnid, hunter.octgnid);
  assert.equal(stalker.type_code, "enemy");
  assert.equal(stalker.sphere_code, "burden");
  assert.equal(hunter.is_unique, false);
  assert.equal(stalker.is_unique, false);
  assert.match(stalker.shadow!, /Shadow:/);
  assert.ok(byCode.get("01096")?.text?.includes("[attack]"));
});

test("same-name reprints preserve distinct Gandalf abilities and exact Limited Starter quantities", () => {
  const core = byCode.get("01073")!;
  const hobbit = byCode.get("131010")!;
  const secondStarterId = "5867614b-61fc-4b7c-9a05-02c59b7cc06a";
  assert.ok(core.packs.some((p) => p.octgnid === secondStarterId));
  assert.ok(!hobbit.packs.some((p) => p.octgnid === secondStarterId));
  const printed = core.packs.filter((p) => p.pack_code === "Starter");
  assert.deepEqual(
    printed.map((p) => p.quantity),
    [2, 2],
  );
  assert.match(core.text!, /After Gandalf enters play/);
  assert.match(hobbit.text!, /does not exhaust to commit/);
  // Both allies have the same name, sphere, cost and stats. Rules identify
  // the correct printing independently of candidate ordering.
  const sourcePrinting = {
    ...core,
    text: core.text!.replace(/\\n/g, "").replace(/<[^>]*>/g, ""),
  };
  assert.equal(canonicalReprint([hobbit, core], sourcePrinting)?.code, "01073");
  assert.equal(canonicalReprint([core, hobbit], sourcePrinting)?.code, "01073");
  assert.equal(
    canonicalReprint([core, hobbit], {
      ...sourcePrinting,
      text: "A different printed ability.",
    }),
    undefined,
  );
  assert.equal(
    canonicalReprint(
      [core, { ...core, code: "ambiguous-printing" }],
      sourcePrinting,
    ),
    undefined,
  );
  const starterPlayerCopies = catalogue.reduce(
    (n, c) =>
      n +
      (["hero", "ally", "attachment", "event"].includes(c.type_code)
        ? c.packs
            .filter((p) => p.pack_code === "Starter")
            .reduce((q, p) => q + p.quantity, 0)
        : 0),
    0,
  );
  assert.equal(starterPlayerCopies, 106);
  for (const d of read("public/published-decks.json").filter(
    (d: { productId: string }) => d.productId === "limited-starter",
  )) {
    assert.equal(d.cards["01073"], 2);
    assert.equal(d.cards["131010"], undefined);
  }
});
