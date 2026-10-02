import assert from "node:assert/strict";
import test from "node:test";
import playerCards from "../src/data/player-cards.json";
import { STARTERS } from "../src/game/cards";
import {
  cardProductInfo,
  deckProductInfo,
  officialStarterDecks,
  PRODUCTS,
} from "../src/game/products";

test("product catalogue covers all original cycles and separate Nightmare products", () => {
  const kinds = (kind: string) => PRODUCTS.filter((p) => p.kind === kind);
  assert.equal(kinds("adventure-pack").length, 54);
  assert.equal(kinds("deluxe").length, 8);
  assert.equal(kinds("nightmare-deck").length, 48);
  assert.equal(kinds("hero-expansion").length, 3);
  assert.equal(kinds("campaign-expansion").length, 3);
  assert.equal(kinds("starter-deck").length, 4);
  assert.equal(kinds("saga").length, 11);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  assert.ok(PRODUCTS.every((p) => p.sourceUrls.length > 0));
  assert.ok(PRODUCTS.every((p) => !p.name.startsWith("ALeP")));
  assert.ok(PRODUCTS.every((p) => !p.packCodes.includes("MotKA")));
  assert.equal(kinds("promo").length, 7);
  for (const p of PRODUCTS)
    for (const parent of [...(p.reprints ?? []), ...(p.requires ?? [])])
      assert.ok(
        PRODUCTS.some((other) => other.id === parent),
        `${p.id} refers to ${parent}`,
      );
});

test("the four separately sold starter recipes retain 3 heroes, 50 cards and extras", () => {
  const soldSeparately = officialStarterDecks.filter(
    (d) => d.productId !== "limited-starter",
  );
  assert.equal(soldSeparately.length, 4);
  for (const d of soldSeparately) {
    assert.equal(d.heroes.length, 3);
    assert.equal(
      Object.values(d.cards).reduce((sum, n) => sum + n, 0),
      50,
    );
    assert.ok(Object.keys(d.sideboard).length > 0);
    assert.ok(
      Object.values(d.cards).every(
        (n) => Number.isInteger(n) && n > 0 && n <= 3,
      ),
    );
    assert.ok(d.heroes.every((code) => !Object.hasOwn(d.cards, code)));
    const info = deckProductInfo(d);
    assert.equal(info.kind, "official-preconstructed");
    assert.equal(info.product?.id, d.productId);
    assert.match(info.label, /Separately sold Starter Deck/);
    assert.ok(info.availableIn.some((p) => p.id === d.productId));
    assert.match(d.source_url, /mec10[3-6]_rules\.pdf$/);
  }
  const dwarves = officialStarterDecks.find((d) => d.id === "starter-dwarves")!;
  assert.deepEqual(dwarves.heroes, ["02116", "131004", "03002"]);
  assert.equal(dwarves.cards["01073"], 3);
});

test("Limited Starter decks are complete bundled recipes with the Core Gandalf", () => {
  assert.equal(officialStarterDecks.length, 6);
  const limited = officialStarterDecks.filter(
    (d) => d.productId === "limited-starter",
  );
  assert.equal(limited.length, 2);
  assert.deepEqual(
    limited.map((d) => d.heroes),
    [
      ["01001", "22081", "131003"],
      ["01011", "03002", "22001"],
    ],
  );
  for (const deck of limited) {
    assert.equal(
      Object.values(deck.cards).reduce((sum, n) => sum + n, 0),
      50,
    );
    assert.equal(deck.cards["01073"], 2);
    assert.ok(!Object.hasOwn(deck.cards, "131010"));
    assert.deepEqual(deck.sideboard, {});
    const info = deckProductInfo(deck);
    assert.equal(info.kind, "official-preconstructed");
    assert.match(info.label, /Included in Collector’s Edition/);
    assert.ok(info.availableIn.some((p) => p.id === "limited-starter"));
  }
  for (const code of ["22001", "22081"])
    assert.equal(
      cardProductInfo({ code, name: code }).original?.id,
      "limited-starter",
    );
});

test("Core Set learning decks are included lists with app titles", () => {
  for (const d of STARTERS) {
    const info = deckProductInfo(d);
    assert.equal(info.kind, "app-built");
    assert.equal(info.product?.id, "core");
    assert.match(info.label, /Core Set/);
    assert.match(info.detail, /printed single-sphere learning list/);
    assert.match(info.detail, /included in the Core Set/);
  }
  const faramir = playerCards.find((c) => c.code === "01014")!;
  const info = cardProductInfo(faramir);
  assert.equal(info.original?.id, "core");
  assert.ok(info.availableIn.some((p) => p.id === "revised-core"));
  assert.ok(info.availableIn.some((p) => p.id === "starter-gondor"));
  assert.match(info.originLabel, /Core Set/);
});

test("repackaged player pools and campaign boxes do not conflate their contents", () => {
  const hero = cardProductInfo({
    code: "09001",
    name: "Aragorn",
    pack_code: "TLR",
    type_code: "hero",
    sphere_code: "tactics",
  });
  assert.equal(hero.original?.id, "the-lost-realm");
  assert.ok(
    hero.availableIn.some((p) => p.id === "angmar-awakened-hero-expansion"),
  );
  assert.ok(
    !hero.availableIn.some(
      (p) => p.id === "angmar-awakened-campaign-expansion",
    ),
  );
  const encounter = cardProductInfo({
    code: "encounter-import-id",
    name: "Orc",
    pack_code: "TLR",
    type_code: "enemy",
    sphere_code: "encounter",
  });
  assert.ok(
    encounter.availableIn.some(
      (p) => p.id === "angmar-awakened-campaign-expansion",
    ),
  );
  assert.ok(
    !encounter.availableIn.some(
      (p) => p.id === "angmar-awakened-hero-expansion",
    ),
  );
  const saga = cardProductInfo({
    code: "141001",
    name: "Sam Gamgee",
    pack_code: "TBR",
    type_code: "hero",
    sphere_code: "leadership",
  });
  assert.ok(
    saga.availableIn.some((p) => p.id === "fellowship-of-the-ring-saga"),
  );
});

test("Nightmare encounter symbols resolve separate retail products from shared source sets", () => {
  const info = cardProductInfo({
    code: "octgn:test",
    name: "Hunter",
    type_code: "enemy",
    sphere_code: "encounter",
    pack_code: "nightmare:shadows-of-mirkwood",
    pack_name: "Shadows of Mirkwood - Nightmare",
    encounter_set: "The Hunt for Gollum - Nightmare",
  });
  assert.equal(info.original?.id, "the-hunt-for-gollum-nightmare");
  assert.equal(info.availableIn.length, 1);
  assert.equal(info.original?.requires?.[0], "the-hunt-for-gollum");
  const printedTypo = cardProductInfo({
    code: "octgn:depths",
    name: "Crashing Arm",
    type_code: "enemy",
    sphere_code: "encounter",
    pack_code: "nightmare:dreamchaser",
    pack_name: "Dreamchaser - Nightmare",
    encounter_set: "The Things in the Depths - Nightmare",
  });
  assert.equal(printedTypo.original?.id, "the-thing-in-the-depths-nightmare");
});

test("modified starter lists and Hero Expansion pools remain assembled decks", () => {
  const boxed = officialStarterDecks[0];
  const changed = { ...boxed, cards: { ...boxed.cards, "01073": 2 } };
  assert.equal(deckProductInfo(changed).kind, "custom");
  const heroPool = deckProductInfo({
    id: "assembled",
    productId: "angmar-awakened-hero-expansion",
    heroes: ["09001"],
    cards: { "09003": 3 },
  });
  assert.equal(heroPool.kind, "custom");
  assert.match(heroPool.detail, /deckbuilding pool/);
});

test("unknown imported cards retain honest printed names and union pack metadata", () => {
  const unknown = cardProductInfo({
    code: "new",
    name: "New",
    pack_name: "New official product",
  });
  assert.equal(unknown.original, null);
  assert.equal(unknown.originLabel, "New official product");
  assert.equal(unknown.availableIn.length, 0);
  const core = cardProductInfo({
    code: "01001",
    name: "Aragorn",
    packs: ["Core", { pack_code: "RevCore" }],
  });
  assert.equal(core.original?.id, "core");
  assert.ok(core.availableIn.some((p) => p.id === "revised-core"));
  assert.ok(core.availableIn.some((p) => p.id === "promo-aragorn-2014"));
  const spiritAragorn = cardProductInfo({ code: "22137", name: "Aragorn" });
  assert.ok(
    !spiritAragorn.availableIn.some((p) => p.id === "promo-aragorn-2014"),
  );
  const reprintAlias = cardProductInfo({
    code: "20001",
    name: "Aragorn",
    pack_code: "Starter",
  });
  assert.equal(reprintAlias.original?.id, "core");
});
