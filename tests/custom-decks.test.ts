import test from "node:test";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import {
  applyAction,
  createGame,
  continueCampaign,
  retryAdventure,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import {
  deckProblems,
  parseRingsDbDeck,
  ringsDbId,
  legalSphere,
  deckWarnings,
  DECKS_KEY,
  readDecks,
  createDeckId,
} from "../src/game/decks";
const leadership = STARTERS.find((d) => d.id === "leadership")!;
const spirit = STARTERS.find((d) => d.id === "spirit")!;
const fifty: Record<string, number> = { ...leadership.cards };
for (const [code, n] of Object.entries(spirit.cards))
  fifty[code] = Math.min(3, (fifty[code] ?? 0) + n);
test("a custom 50-card deck plays in classic solo, survives saves, and keeps its list for retries", () => {
  const s = createGame(3, fifty, ["01001", "01007", "01003"], "custom", {
    guided: true,
  });
  assert.equal(s.deckId, "custom");
  assert.deepEqual(s.customDeck, fifty);
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)))!;
  assert.deepEqual(restored.customDeck, fifty);
  const lost = { ...restored, status: "lost" as const, flow: undefined };
  const again = retryAdventure(lost, 4);
  assert.equal(again.deckId, "custom");
  assert.deepEqual(again.customDeck, fifty);
  assert.throws(
    () => createGame(3, { "01013": 3 }, ["01001"], "custom"),
    /at least 50/,
  );
});
test("deck rules allow off-sphere cards while explaining how they need another way into play", () => {
  const d = { heroes: leadership.heroes, cards: fifty };
  assert.deepEqual(deckProblems(d), []);
  assert.ok(deckWarnings(d).some((p) => p.includes("matching hero sphere")));
  assert.ok(
    deckProblems({ heroes: ["01013"], cards: fifty }).some((p) =>
      p.includes("not a supported hero"),
    ),
  );
  assert.ok(
    deckProblems({
      heroes: leadership.heroes,
      cards: { ...fifty, unknown: 1 },
    }).some((p) => p.includes("unknown is not")),
  );
});
test("RingsDB imports reject malformed quantities and report every list adjustment", () => {
  assert.throws(
    () => parseRingsDbDeck({ slots: [] }, "test"),
    /invalid decklist/,
  );
  const report = parseRingsDbDeck(
    {
      heroes: { "01001": 1, "01002": 1, "01003": 1, "01004": 1, "01005": 0 },
      slots: {
        "01013": 7,
        "01014": 1.5,
        "01015": "2",
        "01016": true,
        unknown: 5,
      },
    },
    "test",
    10,
  );
  assert.deepEqual(report.deck.heroes, leadership.heroes);
  assert.equal(report.heroesDropped.length, 1);
  assert.deepEqual(report.deck.cards, { "01013": 3, "01015": 2 });
  assert.equal(report.unsupported[0].quantity, 5);
  assert.equal(report.adjustments.length, 3);
  const slotsOnly = parseRingsDbDeck(
    { slots: { "01001": 1, "01013": 3 } },
    "test",
    10,
  );
  assert.deepEqual(slotsOnly.deck.heroes, ["01001"]);
  assert.notEqual(slotsOnly.deck.id, report.deck.id);
  assert.notEqual(createDeckId(10), createDeckId(10));
  assert.equal(ringsDbId("https://ringsdb.com/deck/view/123"), null);
  assert.equal(
    ringsDbId("https://example.com/ringsdb.com/decklist/view/123"),
    null,
  );
  assert.equal(ringsDbId("https://ringsdb.com/decklist/view/123oops"), null);
  assert.equal(ringsDbId("ringsdb.com/decklist/view/123/title"), "123");
});
test("stored deck drafts survive while corrupt card types and duplicate ids are rejected", (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const draft = {
    id: "draft",
    name: "Draft",
    heroes: [],
    cards: {},
    updatedAt: 10,
  };
  const items = [
    draft,
    { ...draft, id: "wrong-hero", heroes: ["01013"] },
    { ...draft, id: "encounter", cards: { "01096": 1 } },
    { ...draft, id: "boon", cards: { rc132: 1 } },
    { ...draft, id: "cards-array", cards: [] },
    { ...draft, name: "duplicate" },
  ];
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) =>
        key === DECKS_KEY ? JSON.stringify(items) : null,
    },
  });
  t.after(() =>
    old
      ? Object.defineProperty(globalThis, "localStorage", old)
      : Reflect.deleteProperty(globalThis, "localStorage"),
  );
  assert.deepEqual(readDecks(), [draft]);
});
test("custom saves reject unusable original lists before retries can fail", () => {
  const s = createGame(3, fifty, ["01001", "01007", "01003"], "custom");
  for (const cards of [
    {},
    { ...fifty, rc132: 1 },
    { ...fifty, "01013": 1.5 },
    { ...fifty, "01001": 1 },
  ]) {
    assert.equal(restoreSave({ ...s, customDeck: cards }), null);
  }
  assert.equal(restoreSave({ ...s, startingHeroes: ["01001", "01001"] }), null);
  assert.throws(
    () =>
      createGame(3, { ...fifty, "01013": 1.5 }, leadership.heroes, "custom"),
    /at most 3/,
  );
  assert.throws(
    () => createGame(3, { ...fifty, "01013": -1 }, leadership.heroes, "custom"),
    /at most 3/,
  );
});
test("hot-seat seats may mix a starter with a custom deck, and campaigns carry the custom list forward", () => {
  const seats = [
    { heroes: ["01001", "01002", "01003"], deckId: "leadership" },
    { heroes: ["01007", "01008", "01009"], deckId: "custom", cards: fifty },
  ];
  let s = createGame(5, leadership.cards, seats[0].heroes, "leadership", {
    seats,
    playMode: "campaign",
  });
  assert.equal(s.table!.seats[0].deckId, "leadership");
  assert.equal(s.table!.seats[1].deckId, "custom");
  assert.deepEqual(s.table!.seats[1].customDeck, fifty);
  assert.equal(
    s.table!.seats[1].deck.length + s.table!.seats[1].hand.length,
    Object.values(fifty).reduce((n, v) => n + v, 0),
  );
  assert.ok(validateSave(s));
  s = { ...s, status: "won" };
  s.campaign!.completed = [{ scenarioId: "mirkwood", score: 50, rounds: 5 }];
  const next = continueCampaign(
    s,
    [...seats[0].heroes, ...seats[1].heroes],
    "leadership",
    true,
    6,
  );
  assert.equal(next.scenarioId, "anduin");
  assert.equal(next.table!.seats[1].deckId, "custom");
  assert.deepEqual(next.table!.seats[1].customDeck, fifty);
});
test("easy mode builds the official smaller encounter decks", () => {
  const sizes = {
    mirkwood: [36, 27],
    anduin: [47, 32],
    "dol-guldur": [41, 30],
  } as const;
  for (const [scenarioId, [normal, easy]] of Object.entries(sizes)) {
    const base = createGame(
      11,
      leadership.cards,
      leadership.heroes,
      "leadership",
      {
        scenarioId: scenarioId as keyof typeof sizes,
      },
    );
    const light = createGame(
      11,
      leadership.cards,
      leadership.heroes,
      "leadership",
      {
        scenarioId: scenarioId as keyof typeof sizes,
        easy: true,
      },
    );
    // Every encounter card is in the deck, the discard or the staging area
    // (guards are staging units); Dol Guldur also sets the Nazgûl aside.
    const count = (s: typeof base) =>
      s.encounterDeck.length +
      s.encounterDiscard.length +
      s.staging.length +
      (scenarioId === "dol-guldur" ? 1 : 0);
    assert.equal(count(base), normal, `${scenarioId} normal`);
    assert.equal(count(light), easy, `${scenarioId} easy`);
    assert.ok(
      !light.encounterDeck.includes("01090"),
      "Chieftain Ufthak leaves the easy deck",
    );
  }
});
test("easy mode gives every hero one extra starting resource and is kept for the next chapter", () => {
  const s = createGame(9, leadership.cards, leadership.heroes, "leadership", {
    easy: true,
    playMode: "campaign",
  });
  assert.ok(s.easyMode);
  assert.ok(s.heroes.every((h) => h.resources === 1));
  assert.ok(validateSave(s));
  const plain = createGame(
    9,
    leadership.cards,
    leadership.heroes,
    "leadership",
  );
  assert.ok(plain.heroes.every((h) => h.resources === 0));
  assert.equal(plain.easyMode, undefined);
  const kept = applyAction(s, { type: "KEEP" });
  assert.ok(kept.heroes.every((h) => h.resources === 2));
  const won = { ...s, status: "won" as const };
  won.campaign!.completed = [{ scenarioId: "mirkwood", score: 50, rounds: 5 }];
  assert.ok(
    continueCampaign(won, leadership.heroes, "leadership", true, 7).easyMode,
  );
  const bad = structuredClone(s);
  (bad as { easyMode: unknown }).easyMode = "yes";
  assert.equal(restoreSave(bad), null);
});
test("deckbuilding rules explain every problem and RingsDB lists import with a report", () => {
  assert.deepEqual(
    deckProblems({ heroes: ["01001", "01002", "01003"], cards: fifty }).filter(
      (p) => !p.includes("hero to pay"),
    ),
    [],
  );
  assert.ok(legalSphere("01013", ["01001"]));
  assert.ok(!legalSphere("01013", ["01007"]));
  const problems = deckProblems({ heroes: [], cards: { "01013": 4 } });
  assert.ok(problems.some((p) => p.includes("at least one hero")));
  assert.ok(problems.some((p) => p.includes("more cards")));
  assert.ok(problems.some((p) => p.includes("at most 3")));
  assert.equal(
    ringsDbId("https://ringsdb.com/decklist/view/12345/some-title"),
    "12345",
  );
  assert.equal(ringsDbId(" 777 "), "777");
  assert.equal(ringsDbId("https://example.com/"), null);
  const report = parseRingsDbDeck(
    {
      name: "Leadership rush",
      heroes: { "01001": 1, "02001": 1 },
      slots: { "01013": 3, "01014": 2, "02010": 3, "01001": 1 },
    },
    "https://ringsdb.com/decklist/view/1",
    1000,
  );
  assert.equal(report.deck.name, "Leadership rush");
  assert.deepEqual(report.deck.heroes, ["01001"]);
  assert.deepEqual(report.deck.cards, { "01013": 3, "01014": 2 });
  assert.equal(report.unsupported.length, 1);
  assert.equal(report.unsupported[0].code, "02010");
  assert.deepEqual(report.heroesDropped, ["02001"]);
});
