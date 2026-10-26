import assert from "node:assert/strict";
import test from "node:test";
import { createGame, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import {
  check,
  discardAttachment,
  discardLocation,
  progressLocation,
} from "../src/game/board";
import { fx, get, locationQuest, make, stats } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import {
  activeSeat,
  forOwner,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import { deckProblems, deckSize, deckStorageProblem } from "../src/game/decks";
import { parseDeckEditorDraft } from "../src/ui/deck-editor-draft";
import { WRATH_RUIN } from "../src/game/wrath-ruin-support";
import {
  burglarContractPublicState,
  burglarDeckProblems,
  burglarGuardedObjective,
  burglarLootEligible,
} from "../src/game/burglar-contract-support";
import {
  DEFAULT_LOOT,
  BURGLAR_HEROES,
  act,
  burglarMainDeck,
  createBurglarGame,
  pick,
  reload,
  settle,
} from "./burglar-contract-fixtures";
import type { GameState } from "../src/game/types";

function top(s: GameState, code: string, player = 0) {
  const contract = s.burglarContract!.contracts.find(
    (c) => c.player === player,
  )!;
  const index = contract.loot.findIndex((u) => u.code === code);
  if (index < 0) {
    const u = contract.loot[0];
    u.code = code;
    return u;
  }
  const [unit] = contract.loot.splice(index, 1);
  contract.loot.unshift(unit);
  return unit;
}
function travelReady(s: GameState, code = "01099") {
  s.phase = "travel";
  s.staging = [make(s, code)];
  s.activeLocation = null;
  s.extraActiveLocations = [];
  s.queue = [];
  s.choice = null;
  if (s.table) {
    s.table.first = 0;
    s.table.turn = 0;
    s.table.passed = [];
    selectSeat(s, 0);
  }
  syncSeat(s);
  return s.staging[0];
}
function travel(s: GameState, code = "01099") {
  const location = travelReady(s, code);
  return settle(act(s, { type: "TRAVEL", id: location.id }));
}
function explore(s: GameState) {
  progressLocation(s, s.activeLocation!, locationQuest(s, s.activeLocation!));
  flush(s);
  return reload(s);
}

for (const players of [1, 2, 3, 4])
  test(`Burglar native setup for ${players} player(s) keeps fourteen physical loot cards outside the fifty-card decks`, () => {
    const s = createBurglarGame(players);
    assert.equal(s.burglarContract!.contracts.length, players);
    for (const c of s.burglarContract!.contracts) {
      assert.equal(c.side, "B");
      assert.equal(c.loot.length, 14);
      assert.equal(new Set(c.loot.map((u) => u.id)).size, 14);
      assert.ok(c.loot.every((u) => u.owner === c.player));
      const p = seatView(s, c.player);
      assert.equal(p.deck.length + p.hand.length, 50);
      assert.ok(!p.deck.includes("22024"));
      assert.ok(!p.hand.some((u) => u.code === "22024"));
    }
    reload(s);
  });

test("Burglar deck legality rejects draw-deck attachments and incomplete or repeated loot designs", () => {
  const cards = burglarMainDeck();
  assert.equal(deckSize(cards), 50);
  assert.deepEqual(
    deckProblems({ cards, heroes: BURGLAR_HEROES[0], loot: DEFAULT_LOOT }),
    [],
  );
  assert.match(
    burglarDeckProblems({
      cards: { ...cards, "01040": 1 },
      loot: DEFAULT_LOOT,
    }).join(" "),
    /cannot include attachments/,
  );
  for (const loot of [
    undefined,
    DEFAULT_LOOT.slice(1),
    [...DEFAULT_LOOT.slice(1), DEFAULT_LOOT[1]],
    [...DEFAULT_LOOT.slice(1), "01073"],
  ]) {
    assert.match(
      burglarDeckProblems({ cards, loot }).join(" "),
      /14 different/,
    );
    assert.throws(
      () =>
        createGame(1, cards, BURGLAR_HEROES[0], "custom", {
          burglarLoot: { 0: loot! },
        }),
      /14 different/,
    );
  }
  assert.equal(burglarLootEligible("01073"), false);
  assert.equal(burglarLootEligible("rc135"), false);
  assert.equal(burglarLootEligible("not-a-card"), false);
});

test("Burglar unfinished and saved decks preserve loot separately through the draft parser", () => {
  const deck = {
    id: "burglar",
    name: "Burglar",
    cards: burglarMainDeck(),
    heroes: BURGLAR_HEROES[0],
    loot: DEFAULT_LOOT.slice(0, 13),
    updatedAt: 1,
  };
  assert.equal(deckStorageProblem([deck]), null);
  const draft = { version: 1 as const, savedAt: 2, report: [], deck };
  const restored = parseDeckEditorDraft(JSON.parse(JSON.stringify(draft)))!;
  assert.deepEqual(restored.deck.loot, deck.loot);
  restored.deck.loot!.push(DEFAULT_LOOT[13]);
  assert.equal(deck.loot.length, 13);
  assert.deepEqual(deckProblems(restored.deck), []);
  const malformed = structuredClone(draft);
  malformed.deck.loot[1] = malformed.deck.loot[0];
  assert.equal(parseDeckEditorDraft(malformed), null);
});

test("native travel reveals exactly the physical top loot, adds its quest point and suppresses its player ability", () => {
  let s = createBurglarGame();
  const item = top(s, "01040"),
    id = item.id;
  const location = travelReady(s);
  s = act(s, { type: "TRAVEL", id: location.id });
  assert.equal(s.burglarContract!.contracts[0].loot.length, 13);
  assert.equal(s.activeLocation!.attachments[0].id, id);
  assert.ok(burglarGuardedObjective(s, s.activeLocation!.attachments[0]));
  assert.equal(s.activeLocation!.attachments[0].blanked, true);
  assert.equal(
    locationQuest(s, s.activeLocation!),
    (card(location.code).quest ?? 0) + 1,
  );
  assert.equal(
    stats(s, s.activeLocation!).health,
    card(location.code).health ?? 0,
  );
  assert.match(s.choice!.title, /Old Forest Road/);
  reload(s);
});

test("an immune location does not trigger or consume its hidden loot card", () => {
  let s = createBurglarGame();
  const loot = structuredClone(s.burglarContract!.contracts[0].loot),
    location = travelReady(s, "01099");
  // Secluded Glade retains its printed immunity to player card effects.
  location.code = "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9073";
  assert.match(card(location.code).text, /immune/i);
  s = act(s, { type: "TRAVEL", id: location.id });
  s = settle(s);
  assert.deepEqual(s.burglarContract!.contracts[0].loot, loot);
  assert.equal(s.burglarContract!.guarded.length, 0);
});

test("a unique loot conflict discards only that revealed card without drawing a replacement", () => {
  let s = createBurglarGame();
  const loot = top(s, "01042"),
    next = s.burglarContract!.contracts[0].loot[1].id;
  s.heroes[0].attachments.push({
    id: "existing-horn",
    code: "01042",
    exhausted: false,
    owner: 0,
  });
  s = travel(s);
  assert.equal(s.activeLocation!.attachments.length, 0);
  assert.equal(s.burglarContract!.contracts[0].loot.length, 13);
  assert.equal(s.burglarContract!.contracts[0].loot[0].id, next);
  assert.ok(s.discard.includes(loot.code));
});

test("active exploration saves the actual loot and adding it to hand retains its identity", () => {
  let s = createBurglarGame();
  const loot = top(s, "01040"),
    id = loot.id;
  s = travel(s);
  s = explore(s);
  assert.equal(s.burglarContract!.claims[0].unit.id, id);
  assert.match(s.choice!.title, /Claim Citadel Plate/);
  s = pick(s, "hand");
  s = settle(s);
  assert.ok(s.hand.some((u) => u.id === id));
  assert.equal(s.burglarContract!.claims.length, 0);
  assert.equal(s.burglarContract!.guarded.length, 0);
  reload(s);
});

test("active exploration attaches loot at no cost while applying its real attachment text", () => {
  let s = createBurglarGame();
  const id = top(s, "01040").id,
    hero = s.heroes[0].id;
  s.heroes.forEach((h) => (h.resources = 0));
  const before = stats(s, s.heroes[0]).health;
  s = explore(travel(s));
  s = pick(s, `attach:${hero}`);
  s = settle(s);
  const h = get(s, hero)!;
  assert.ok(h.attachments.some((a) => a.id === id && !a.blanked));
  assert.equal(h.resources, 0);
  assert.equal(stats(s, h).health, before + 4);
  reload(s);
});

test("loot respects printed attachment targets and can go to hand when none is legal", () => {
  let s = createBurglarGame();
  top(s, "08118");
  s = explore(travel(s));
  assert.equal(
    s.choice!.options.filter((o) => o.id.startsWith("attach:")).length,
    0,
  );
  assert.ok(s.choice!.options.some((o) => o.id === "hand"));
  s = pick(s, "hand");
  assert.ok(s.hand.some((u) => u.code === "08118"));
});

test("Guarded enemy loot ignores Guarded both when revealed and when claimed", () => {
  let s = createBurglarGame();
  const id = top(s, "22006").id;
  const deck = [...s.encounterDeck];
  s = travel(s);
  assert.deepEqual(s.encounterDeck, deck);
  s = explore(s);
  s = pick(s, `attach:${s.heroes[0].id}`);
  s = settle(s);
  assert.deepEqual(s.encounterDeck, deck);
  assert.ok(s.heroes[0].attachments.some((a) => a.id === id));
  assert.equal(s.burglarContract!.claims.length, 0);
});

test("claiming a third Restricted attachment opens the real saved discard choice", () => {
  let s = createBurglarGame();
  top(s, "01040");
  const hero = s.heroes[0];
  hero.attachments.push(
    { id: "sword", code: "01039", exhausted: false, owner: 0 },
    { id: "axe", code: "01041", exhausted: false, owner: 0 },
  );
  s = explore(travel(s));
  s = pick(s, `attach:${hero.id}`);
  assert.match(s.choice!.title, /Restricted/);
  s = pick(reload(s), "axe");
  s = settle(s);
  assert.equal(get(s, hero.id)!.attachments.length, 2);
  assert.ok(s.discard.includes("01041"));
});

test("declining the contract's loot destination discards its actual physical card", () => {
  let s = createBurglarGame();
  top(s, "01040");
  s = explore(travel(s));
  s = pick(s, "skip");
  s = settle(s);
  assert.equal(s.burglarContract!.claims.length, 0);
  assert.ok(s.discard.includes("01040"));
});

for (const scenario of ["mirkwood", "wrath-and-ruin"] as const)
  for (const destination of ["hand", "ordinary"])
    test(`${scenario}: an ordinary guarded attachment can enter hand or retain its normal claim (${destination})`, () => {
      let s = travel(
        createBurglarGame(1, scenario),
        scenario === "mirkwood" ? "01099" : WRATH_RUIN.square,
      );
      const guarded = make(s, "18011");
      s.activeLocation!.attachments.push({
        id: guarded.id,
        code: guarded.code,
        owner: 0,
        controller: 0,
        exhausted: false,
      });
      s = explore(s);
      if (scenario === "wrath-and-ruin") {
        const contract = s.choice!.options.find((o) =>
          o.effects.some((e) => e.kind === "burglarExplore"),
        );
        assert.ok(
          contract,
          "the contract shares the saved When ordering with location capture",
        );
        s = pick(s, contract.id);
      }
      assert.equal(s.burglarContract!.claims.length, 2);
      s = pick(s, guarded.id);
      s = pick(reload(s), destination === "hand" ? "hand" : "skip");
      // Resolve the contract's own ordinary loot before its separate Guarded fallback.
      if (s.choice?.title.includes("The Burglar’s Turn")) s = pick(s, "skip");
      if (destination === "hand") {
        s = settle(s);
        assert.ok(s.hand.some((u) => u.id === guarded.id));
        assert.ok(
          !s.heroes.some((h) => h.attachments.some((a) => a.id === guarded.id)),
        );
      } else {
        assert.match(s.choice!.title, /Necklace of Girion.*eligible character/);
        assert.ok(
          s.burglarContract!.claims.some(
            (c) => c.unit.id === guarded.id && c.fallback,
          ),
        );
        s = pick(reload(s), `attach:${s.heroes[0].id}`);
        s = settle(s);
        assert.ok(s.heroes[0].attachments.some((a) => a.id === guarded.id));
        assert.ok(!s.hand.some((u) => u.id === guarded.id));
      }
      assert.equal(s.burglarContract!.claims.length, 0);
      reload(s);
    });

test("a location explored in staging discards loot and never re-triggers its ignored Guarded keyword", () => {
  let s = createBurglarGame();
  top(s, "22006");
  s = travel(s);
  const location = s.activeLocation!,
    deck = [...s.encounterDeck];
  s.activeLocation = null;
  s.staging.push(location);
  progressLocation(s, location, locationQuest(s, location));
  flush(s);
  s = settle(s);
  assert.equal(s.burglarContract!.guarded.length, 0);
  assert.equal(s.burglarContract!.claims.length, 0);
  assert.ok(s.discard.includes("22006"));
  assert.deepEqual(s.encounterDeck, deck);
  assert.ok(
    !s.heroes.some((h) => h.attachments.some((a) => a.code === "22006")),
  );
  reload(s);
});

test("discarding an active location grants no loot and preserves its owner's discard", () => {
  let s = createBurglarGame();
  top(s, "22006");
  s = travel(s);
  discardLocation(s, s.activeLocation!);
  flush(s);
  s = settle(s);
  assert.equal(s.burglarContract!.guarded.length, 0);
  assert.equal(s.burglarContract!.claims.length, 0);
  assert.ok(s.discard.includes("22006"));
});

test("removing a guarded loot attachment by an encounter effect clears its saved metadata", () => {
  let s = createBurglarGame();
  top(s, "01040");
  s = travel(s);
  discardAttachment(s, s.activeLocation!, s.activeLocation!.attachments[0]);
  assert.equal(s.burglarContract!.guarded.length, 0);
  assert.ok(s.discard.includes("01040"));
  reload(s);
});

test("two contracts choose travel order and each adds one quest point per attached card", () => {
  let s = createBurglarGame(2);
  top(s, "01040", 0);
  top(s, "01040", 1);
  const location = travelReady(s);
  s = act(s, { type: "TRAVEL", id: location.id });
  assert.match(s.choice!.title, /next Forced effect/);
  s = pick(s, "order-1");
  s = settle(s);
  assert.deepEqual(
    s.burglarContract!.contracts.map((c) => c.loot.length),
    [13, 13],
  );
  assert.equal(s.activeLocation!.attachments.length, 2);
  assert.equal(
    locationQuest(s, s.activeLocation!),
    (card(location.code).quest ?? 0) + 4,
  );
  reload(s);
});

test("the first player chooses which contract resolves a simultaneous unique-loot conflict", () => {
  let s = createBurglarGame(2);
  top(s, "01042", 0);
  const kept = top(s, "01042", 1).id;
  const location = travelReady(s);
  s = act(s, { type: "TRAVEL", id: location.id });
  s = pick(s, "order-1");
  s = settle(s);
  assert.equal(s.activeLocation!.attachments[0].id, kept);
  assert.ok(seatView(s, 0).discard.includes("01042"));
  assert.ok(!seatView(s, 1).discard.includes("01042"));
});

test("each contract may claim guarded attachments with the selected player's saved decisions", () => {
  let s = createBurglarGame(2);
  top(s, "01040", 0);
  top(s, "01039", 1);
  s = travel(s);
  s = explore(s);
  assert.match(s.choice!.title, /Choose the next contract/);
  s = pick(s, "order-1");
  assert.equal(activeSeat(s), 1);
  assert.equal(s.burglarContract!.claims.length, 2);
  const id = s.burglarContract!.claims.find((c) => c.unit.owner === 0)!.unit.id;
  s = pick(s, id);
  s = pick(reload(s), "hand");
  s = settle(s);
  assert.ok(seatView(s, 1).hand.some((u) => u.id === id && u.owner === 0));
  reload(s);
});

for (const first of ["loot", "progress"])
  test(`Brown Lands offers simultaneous travel Forced effects: ${first} first`, () => {
    let s = createBurglarGame();
    top(s, "01040");
    const location = travelReady(s, "01087");
    s = act(s, { type: "TRAVEL", id: location.id });
    assert.match(s.choice!.title, /Forced/);
    const index = s.choice!.options.find((o) =>
      first === "loot"
        ? o.label.includes("Burglar")
        : o.label.includes("Brown"),
    )!.id;
    s = pick(s, index);
    s = settle(s);
    if (first === "loot") {
      assert.equal(s.activeLocation!.id, location.id);
      assert.equal(s.activeLocation!.progress, 1);
      assert.equal(locationQuest(s, s.activeLocation!), 2);
      assert.equal(s.burglarContract!.contracts[0].loot.length, 13);
    } else {
      assert.equal(s.activeLocation, null);
      assert.equal(s.burglarContract!.contracts[0].loot.length, 14);
    }
    reload(s);
  });

test("moving a location into the active slot without travelling never draws loot", () => {
  const s = createBurglarGame(),
    location = travelReady(s);
  handle(s, fx("travelEnter", { target: location.id, flag: true }));
  flush(s);
  assert.equal(s.burglarContract!.contracts[0].loot.length, 14);
  assert.equal(s.activeLocation!.attachments.length, 0);
});

test("loot order is private and public rendering remains pure across saved restoration", () => {
  const s = createBurglarGame(2),
    before = JSON.stringify(s),
    first = publicState(s);
  assert.equal(JSON.stringify(s), before);
  const copy = structuredClone(s);
  copy.burglarContract!.contracts.forEach((c) => c.loot.reverse());
  assert.deepEqual(publicState(copy), first);
  assert.deepEqual(
    burglarContractPublicState(copy),
    burglarContractPublicState(s),
  );
  assert.deepEqual(reload(s), reload(reload(s)));
});

test("malformed loot, duplicate physical identities and missing guarded hosts cannot be restored", () => {
  const s = createBurglarGame();
  const duplicate = structuredClone(s);
  duplicate.burglarContract!.contracts[0].loot[1].id =
    duplicate.burglarContract!.contracts[0].loot[0].id;
  assert.equal(validateSave(duplicate), false);
  const foreign = structuredClone(s);
  foreign.burglarContract!.contracts[0].loot[0].code = "01073";
  assert.equal(validateSave(foreign), false);
  const guarded = travel(s);
  guarded.burglarContract!.guarded[0].locationId = "missing";
  assert.equal(validateSave(guarded), false);
});

test("elimination removes the owner's hidden loot, contract and guarded objective without losing another player's cards", () => {
  let s = createBurglarGame(2);
  top(s, "01040", 0);
  top(s, "01039", 1);
  s = travel(s);
  forOwner(s, 1, () => (s.threat = 50));
  check(s);
  flush(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.deepEqual(
    s.burglarContract!.contracts.map((c) => c.player),
    [0],
  );
  assert.equal(s.burglarContract!.guarded.length, 1);
  assert.ok(!s.activeLocation!.attachments.some((a) => a.owner === 1));
  assert.ok(seatView(s, 1).removed.includes("22024"));
  assert.ok(seatView(s, 1).removed.includes("01039"));
  reload(s);
});
