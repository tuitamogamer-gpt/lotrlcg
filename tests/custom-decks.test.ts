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
