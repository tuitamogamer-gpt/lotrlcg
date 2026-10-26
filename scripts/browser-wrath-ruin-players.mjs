import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { WRATH_RUIN_PLAYER_ART } from "../tests/wrath-ruin-player-art.ts";
import {
  fixture,
  hand,
  attach,
  ring,
} from "../tests/wrath-ruin-player-fixtures.ts";
import {
  createBurglarGame,
  DEFAULT_LOOT,
} from "../tests/burglar-contract-fixtures.ts";
import { WRATH_RUIN_PLAYER as P } from "../src/game/wrath-ruin-player-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { DECKS_KEY, DECK_CARDS } from "../src/game/decks.ts";
import { get, make, stats, locationQuest } from "../src/game/core.ts";
import { syncSeat } from "../src/game/table.ts";
import { shadowEastRing } from "../src/game/shadow-east-player-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
  next,
  opening,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";

const widths = process.env.WRATH_RUIN_PLAYER_WIDTHS?.split(",").map(Number) ?? [
  1280, 390, 320,
];
assert.ok(
  widths.length && widths.every((width) => [1280, 390, 320].includes(width)),
);
const dir =
  process.env.WRATH_RUIN_PLAYER_OUTPUT_DIR ?? "output/wrath-ruin-players";
await fs.mkdir(dir, { recursive: true });
await fs.rm(`${dir}/failure.json`, { force: true });
await fs.rm(`${dir}/failure.png`, { force: true });
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const codes = [
  "22001",
  "22002",
  "22003",
  "22004",
  "22005",
  "22006",
  "22007",
  "22008",
  "22009",
  "22010",
  "22024",
];
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [],
  printedFaces = new Set();
let page;
const board = (id) => page.locator(`[data-motion-card="${id}"]`);

async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}

async function play(id, target) {
  await board(id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await page
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(page);
  return saved(page);
}

async function close() {
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}

async function chooseCode(code) {
  const state = await saved(page);
  const option = state.choice?.options.find(
    (candidate) => candidate.code === code,
  );
  assert.ok(option, `${code}: ${JSON.stringify(state.choice)}`);
  return choose(page, option.id);
}

async function attack(enemyId, attackerId) {
  await board(enemyId)
    .getByRole("button", { name: /^(Attack|Ranged ·)/ })
    .click();
  const state = await saved(page);
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: card(get(state, attackerId).code).name,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Attack ·/ })
    .click();
  await reviewedState(page);
}

async function defend(enemy, hero) {
  await board(enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(page);
}

async function commit(ids) {
  const state = await saved(page);
  for (const id of ids)
    await page
      .getByRole("button", {
        name: `Commit ${card(get(state, id).code).name}`,
        exact: true,
      })
      .click();
  await page
    .getByRole("button", { name: "Commit & reveal", exact: true })
    .last()
    .click();
  await reviewedState(page);
}

async function nav(label) {
  const toggle = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .locator("#navigation-panel")
    .getByRole("button", { name: label, exact: true })
    .click();
}

function hero(s, code, index = 0) {
  const unit = make(s, code);
  unit.resources = 15;
  unit.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
  s.heroes[index] = unit;
  s.startingHeroes[index] = code;
  syncSeat(s);
  return unit;
}

async function settleUntil(pattern) {
  for (let count = 0; count < 100; count++) {
    await reviewedState(page);
    const state = await saved(page);
    if (pattern.test(state.choice?.title ?? "")) return state;
    assert.ok(
      state.choice,
      `Expected ${pattern}; no decision in ${state.phase}`,
    );
    await choose(
      page,
      state.choice.options.find((option) => option.id === "skip")?.id ??
        state.choice.options[0].id,
    );
  }
  throw Error(`Decisions did not reach ${pattern}`);
}

function burglar(s, player = 0) {
  const contract = s.burglarContract?.contracts.find(
    (entry) => entry.player === player,
  );
  assert.ok(contract, `Burglar contract for player ${player}`);
  return contract;
}

function drawDeck() {
  const cards = { 22005: 3, 17140: 3, "09007": 3, 19032: 3 };
  let count = 12;
  for (const c of DECK_CARDS) {
    if (!["ally", "event"].includes(c.type_code) || cards[c.code]) continue;
    const copies = Math.min(c.deck_limit ?? 3, 3, 50 - count);
    cards[c.code] = copies;
    count += copies;
    if (count === 50) return cards;
  }
  throw Error("A legal fifty-card nonattachment deck is required");
}

async function nativeLootTravel(s) {
  // Preserve the real contract and its physical loot. Isolate ordinary table
  // zones so the next action exercises travel without unrelated combat.
  s.phase = "travel";
  s.staging = [];
  s.activeLocation = null;
  s.extraActiveLocations = [];
  s.queue = [];
  s.choice = null;
  const location = make(s, "01099");
  s.staging.push(location);
  await load(page, s);
  await board(location.id)
    .getByRole("button", { name: "Travel here", exact: true })
    .click();
  await settle(page);
  return { state: await resume(page), location };
}

async function nativeLootExplore(s) {
  assert.ok(s.activeLocation);
  const quest = locationQuest(s, s.activeLocation),
    hero = s.heroes[1];
  s.phase = "quest";
  s.staging = [];
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s.progress = 0;
  s.queue = [];
  s.choice = null;
  for (const unit of s.heroes) {
    unit.exhausted = false;
    unit.committed = false;
  }
  s.committedIds = [];
  hero.tempWill = quest + 2 - (card(hero.code).willpower ?? 0);
  await load(page, s);
  await commit([hero.id]);
  await settle(page);
  await next(page);
  await settleUntil(/The Burglar’s Turn · Claim/);
  return saved(page);
}

try {
  for (const width of widths) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    {
      const s = fixture(),
        thorin = hero(s, P.thorin),
        enemy = make(s, "01082"),
        other = make(s, "01096");
      s.phase = "attack";
      s.engaged = [enemy, other];
      s.deck = ["01018", "01016"];
      await load(page, s);
      await attack(enemy.id, thorin.id);
      assert.match((await saved(page)).choice.title, /Thorin/);
      await choose(page, "use");
      await resume(page);
      await choose(page, other.id);
      await settle(page);
      const state = await saved(page);
      assert.equal(get(state, other.id).damage, 1);
      assert.ok(state.discard.includes("01018"));
      assert.deepEqual(state.deck, ["01016"]);
      await checkpoint("thorin-native-attack-response", width);
    }
    {
      const s = fixture(),
        soldier = hand(s, P.soldier);
      s.threat = 39;
      s.deck = ["05003", "01016", "05007", "05002", "01073", "05004"];
      await load(page, s);
      await play(soldier.id);
      await choose(page, "search");
      assert.deepEqual(
        (await saved(page)).choice.options
          .filter((option) => option.code)
          .map((option) => option.code),
        ["05003", "05007"],
      );
      await resume(page);
      await chooseCode("05003");
      assert.ok((await saved(page)).hand.some((unit) => unit.code === "05003"));
      assert.ok((await saved(page)).deck.includes("05004"));
      await checkpoint("soldier-native-private-top-five-search", width);
    }
    {
      const s = fixture(),
        event = hand(s, P.pillars);
      s.threat = 29;
      s.deck = Array(6).fill("05007");
      const resources = s.heroes.reduce((sum, unit) => sum + unit.resources, 0);
      await load(page, s);
      await play(event.id);
      const state = await saved(page);
      assert.equal(state.threat, 40);
      assert.equal(state.hand.length, 4);
      assert.equal(
        state.heroes.reduce((sum, unit) => sum + unit.resources, 0),
        resources,
      );
      await checkpoint("pillars-native-discount-threat-and-four-cards", width);
    }
    {
      const s = fixture(),
        unit = hand(s, P.halfling);
      s.encounterDeck = ["01099", "01096"];
      s.deck = ["01018", "01016"];
      await load(page, s);
      await play(unit.id);
      await settleUntil(/Cautious Halfling/);
      await choose(page, "use");
      await resume(page);
      assert.equal((await saved(page)).choice.options[0].code, "01099");
      await checkpoint("halfling-native-saved-private-look", width);
      await settle(page);
      const state = await saved(page);
      assert.deepEqual(state.encounterDeck, ["01099", "01096"]);
      assert.ok(state.hand.some((card) => card.code === "01018"));
      await checkpoint("halfling-native-look-keeps-encounter-order", width);
    }
    {
      const s = fixture(),
        target = hero(s, "01007"),
        circlet = hand(s, P.circlet);
      const before = stats(s, target).will;
      await load(page, s);
      await play(circlet.id, target.id);
      const state = await resume(page);
      assert.equal(stats(state, get(state, target.id)).will, before + 2);
      assert.ok(
        get(state, target.id).attachments.some(
          (attachment) => attachment.id === circlet.id,
        ),
      );
      await checkpoint("silver-circlet-native-spirit-hero-attachment", width);
    }
    {
      const s = fixture(),
        event = hand(s, P.bombadillo);
      // An empty encounter deck makes the card added by this actual play the
      // next physical reveal, without changing the shuffled result afterward.
      s.encounterDeck = [];
      s.encounterDiscard = [];
      await load(page, s);
      await play(event.id);
      let state = await resume(page);
      assert.equal(state.wrathBombadilReserves[0], 2);
      assert.deepEqual(state.encounterDeck, [P.tom]);
      assert.ok(state.victoryCards.includes(P.bombadillo));
      assert.ok(!state.discard.includes(P.bombadillo));
      await checkpoint("bombadillo-native-reserve-to-encounter-deck", width);
      await next(page);
      await commit([state.heroes[1].id]);
      await settleUntil(/Tom Bombadil · Choose a fellowship/);
      await resume(page);
      await choose(page, "player-0");
      state = await saved(page);
      const tom = state.allies.find((unit) => unit.code === P.tom);
      assert.ok(tom);
      assert.equal(tom.committed, true);
      assert.equal(tom.exhausted, false);
      assert.equal(state.encounterDeck.length, 0);
      await checkpoint("tom-native-reveal-ready-and-committed", width);
      const round = state.round;
      for (let i = 0; i < 25 && (await saved(page)).round === round; i++) {
        await settle(page);
        await next(page);
      }
      state = await resume(page);
      assert.equal(state.round, round + 1);
      assert.equal(get(state, tom.id), undefined);
      assert.ok(state.removed.includes(P.tom));
      assert.ok(state.removed.includes(P.bombadillo));
      assert.ok(!state.victoryCards.includes(P.bombadillo));
      await checkpoint(
        "tom-native-round-end-removes-both-physical-cards",
        width,
      );
    }
    {
      const s = fixture(),
        axe = hand(s, P.axe);
      s.encounterDeck = ["01099", "01096", "01099"];
      await load(page, s);
      await play(axe.id);
      const state = await resume(page),
        guard = state.staging.find((unit) => unit.code === "01096");
      assert.ok(guard);
      assert.ok(
        guard.attachments.some(
          (attachment) => attachment.id === axe.id && attachment.code === P.axe,
        ),
      );
      assert.ok(state.encounterDiscard.includes("01099"));
      assert.ok(!state.hand.some((unit) => unit.id === axe.id));
      await checkpoint("durins-axe-native-guarded-enemy", width);
    }
    {
      const s = fixture(),
        attacker = s.heroes[1],
        axe = attach(s, attacker, P.axe),
        enemy = make(s, "01089"),
        other = make(s, "01082");
      s.phase = "attack";
      s.engaged = [enemy, other];
      attacker.tempAttack = 10;
      await load(page, s);
      await attack(enemy.id, attacker.id);
      await settleUntil(/Durin/);
      await resume(page);
      await choose(page, other.id);
      await settle(page);
      const state = await saved(page);
      assert.equal(get(state, enemy.id), undefined);
      assert.equal(get(state, other.id).damage, 1);
      assert.ok(
        get(state, attacker.id).attachments.some(
          (attachment) => attachment.id === axe.id,
        ),
      );
      await checkpoint("durins-axe-native-kill-and-second-enemy-damage", width);
    }
    {
      const s = fixture(),
        first = make(s, "01089"),
        second = make(s, "01096"),
        event = hand(s, P.charge);
      s.phase = "staging";
      s.staging = [first, second];
      s.heroes[1].tempAttack = 10;
      s.heroes[2].tempAttack = 10;
      await load(page, s);
      await play(event.id);
      await choose(page, first.id);
      await choose(page, s.heroes[1].id);
      await resume(page);
      await choose(page, "attack");
      assert.equal(get(await saved(page), first.id), undefined);
      assert.ok(
        !(await saved(page)).choice.options.some(
          (option) => option.id === first.id,
        ),
      );
      await choose(page, second.id);
      await choose(page, s.heroes[2].id);
      await resume(page);
      await choose(page, "attack");
      await settle(page);
      const state = await saved(page);
      assert.equal(get(state, second.id), undefined);
      assert.equal(state.phase, "staging");
      assert.equal(get(state, s.heroes[1].id).exhausted, true);
      assert.equal(get(state, s.heroes[2].id).exhausted, true);
      assert.ok(state.discard.includes(P.charge));
      await checkpoint(
        "charge-native-two-staging-attacks-with-saved-choices",
        width,
      );
    }
    {
      const s = fixture(),
        bearer = ring(s),
        strength = hand(s, P.strength);
      const defense = stats(s, bearer).defense;
      await load(page, s);
      await play(strength.id, bearer.id);
      let state = await saved(page);
      assert.equal(stats(state, get(state, bearer.id)).defense, defense + 1);
      // Keep the actual played attachment and isolate a normal defense using
      // a real printed shadow. The cancellation is chosen through the UI.
      state.phase = "defense";
      const enemy = make(state, "01083");
      enemy.shadows = ["01086"];
      enemy.revealedShadowCount = 0;
      state.engaged = [enemy];
      const threat = state.threat;
      const expectedDamage = Math.max(
        0,
        stats(state, enemy).attack -
          stats(state, get(state, bearer.id)).defense,
      );
      await load(page, state);
      await defend(enemy, get(state, bearer.id));
      assert.ok(
        (await saved(page)).choice.options.some(
          (option) => option.id === `wrath-strength-${strength.id}`,
        ),
      );
      await resume(page);
      await choose(page, `wrath-strength-${strength.id}`);
      await settle(page);
      state = await saved(page);
      assert.equal(shadowEastRing(state).attachment.exhausted, true);
      assert.equal(state.threat, threat + 1);
      assert.equal(get(state, bearer.id).damage, expectedDamage);
      await checkpoint(
        "inner-strength-native-shadow-cancel-and-ring-cost",
        width,
      );
    }
    {
      const s = fixture();
      s.discard = [...codes];
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Browse player discard: ${codes.length} cards`,
          exact: true,
        })
        .click();
      for (const code of codes) {
        const c = card(code),
          pin = WRATH_RUIN_PLAYER_ART.find(
            (entry) => entry.code === code && entry.face === "front",
          );
        assert.ok(pin, `original face pin for ${code}`);
        await page
          .locator(".pile-entry")
          .filter({ has: page.locator(`img[data-card-code="${code}"]`) })
          .getByRole("button")
          .first()
          .click();
        assert.equal(
          await page.locator("[data-card-primary-name]").textContent(),
          c.name,
        );
        assert.equal(
          await page.locator("[data-card-primary-rules]").textContent(),
          plain(c.text),
        );
        const img = page.locator(".card-detail img[data-card-code]");
        assert.equal(
          new URL(await img.getAttribute("src"), page.url()).pathname,
          pin.localPath,
        );
        await img.evaluate((element) => element.decode());
        printedFaces.add(code);
        if ([P.thorin, P.tom, P.burglar].includes(code))
          await checkpoint(`original-printed-${code}`, width);
        if (code === P.burglar) {
          await page
            .getByRole("button", { name: "Show reverse", exact: true })
            .click();
          assert.equal(
            await page.locator("[data-card-primary-rules]").textContent(),
            plain(c.back_text),
          );
          const reverse = WRATH_RUIN_PLAYER_ART.find(
            (entry) => entry.code === code && entry.face === "back",
          );
          assert.equal(
            new URL(await img.getAttribute("src"), page.url()).pathname,
            reverse.localPath,
          );
          await img.evaluate((element) => element.decode());
          await checkpoint("burglar-original-printed-reverse", width);
        }
        await close();
      }
      await close();
      checks.push(`all-eleven-original-printed-fronts-${width}`);
    }
    {
      const deck = {
        id: `wrath-browser-${width}`,
        name: `Burglar fellowship ${width}`,
        heroes: ["21002", "01004", "01007"],
        cards: drawDeck(),
        updatedAt: Date.now(),
      };
      await page.evaluate(
        ({ key, deck }) => {
          localStorage.removeItem("there-and-back-again.save.v1");
          localStorage.removeItem("there-and-back-again.choices.v1");
          localStorage.setItem("there-and-back-again.mode.v1", "normal");
          localStorage.setItem(key, JSON.stringify([deck]));
          sessionStorage.removeItem(
            "there-and-back-again.deck-editor-draft.v1",
          );
        },
        { key: DECKS_KEY, deck },
      );
      await page.reload();
      await nav("Deck builder");
      const shelf = () =>
        page
          .locator(".deck-shelf-item")
          .filter({
            has: page.getByRole("heading", { name: deck.name, exact: true }),
          });
      await shelf().getByRole("button", { name: "Edit", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Search cards", exact: true })
        .fill(card(P.burglar).name);
      await page
        .getByRole("button", {
          name: `Add one ${card(P.burglar).name}`,
          exact: true,
        })
        .click();
      assert.match(
        await page.locator(".builder-summary").textContent(),
        /50\s*\/ 50/,
      );
      assert.match(
        await page.locator("[data-loot-count]").textContent(),
        /0\s*\/ 14/,
      );
      const addLoot = async (code) => {
        await page
          .getByRole("searchbox", {
            name: "Search loot attachments",
            exact: true,
          })
          .fill(card(code).name);
        await page
          .locator(`[data-loot-code="${code}"]`)
          .getByRole("button", {
            name: `Add ${card(code).name} to loot deck`,
            exact: true,
          })
          .click();
      };
      for (const code of DEFAULT_LOOT.slice(0, 13)) await addLoot(code);
      assert.match(
        await page.locator("[data-loot-count]").textContent(),
        /13\s*\/ 14/,
      );
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page.reload();
      await nav("Deck builder");
      assert.equal(
        await shelf()
          .getByRole("button", { name: "Play", exact: true })
          .isDisabled(),
        true,
      );
      await shelf().getByRole("button", { name: "Edit", exact: true }).click();
      assert.match(
        await page.locator("[data-loot-count]").textContent(),
        /13\s*\/ 14/,
      );
      await addLoot(DEFAULT_LOOT[13]);
      assert.match(
        await page.locator("[data-loot-count]").textContent(),
        /14\s*\/ 14/,
      );
      await checkpoint(
        "burglar-native-builder-fourteen-distinct-loot-and-draft-reload",
        width,
      );
      await page
        .getByRole("button", { name: "Save deck", exact: true })
        .click();
      const stored = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        DECKS_KEY,
      );
      assert.deepEqual(
        stored.find((candidate) => candidate.id === deck.id).loot,
        [...DEFAULT_LOOT],
      );
      await shelf().getByRole("button", { name: "Play", exact: true }).click();
      const reserveNames = [
        "Tom Bombadil",
        "Ranger of the North",
        "Eagle of the North",
        "Wind from the Sea",
      ];
      for (const name of reserveNames) {
        const select = page.getByRole("combobox", {
          name: `Player 1 ${name} reserves`,
          exact: true,
        });
        assert.equal(await select.inputValue(), "3");
        assert.deepEqual(
          await select
            .locator("option")
            .evaluateAll((options) => options.map((option) => option.value)),
          ["0", "1", "2", "3"],
        );
      }
      await page
        .getByRole("combobox", {
          name: "Player 1 Tom Bombadil reserves",
          exact: true,
        })
        .selectOption("2");
      await page
        .getByRole("combobox", {
          name: "Player 1 Wind from the Sea reserves",
          exact: true,
        })
        .selectOption("1");
      await checkpoint(
        "encounter-reserves-independent-three-per-design-limits",
        width,
      );
      await page.locator("#start-btn").click();
      await opening(page);
      let state = await resume(page),
        contract = burglar(state);
      assert.equal(state.wrathBombadilReserves[0], 2);
      assert.equal(state.batch4WindReserves[0], 1);
      assert.equal(state.rangerReserves[0], 3);
      assert.equal(state.eredEagleReserves[0], 3);
      assert.equal(contract.loot.length, 14);
      assert.equal(state.hand.length + state.deck.length, 50);
      assert.ok(
        !state.deck.includes(P.burglar) &&
          !state.hand.some((unit) => unit.code === P.burglar),
      );
      const panel = page.locator("[data-burglar-contract]");
      assert.match(await panel.textContent(), /14 cards remain/);
      for (const code of DEFAULT_LOOT)
        assert.ok(
          !(await panel.textContent()).includes(card(code).name),
          `${code}: unrevealed loot name is private`,
        );
      await checkpoint(
        "burglar-native-setup-keeps-loot-and-contract-out-of-draw-deck",
        width,
      );
      const top = contract.loot[0];
      const travelled = await nativeLootTravel(state);
      state = travelled.state;
      assert.equal(burglar(state).loot.length, 13);
      assert.ok(
        state.activeLocation.attachments.some(
          (attachment) =>
            attachment.id === top.id && attachment.code === top.code,
        ),
      );
      assert.equal(
        locationQuest(state, state.activeLocation),
        card(travelled.location.code).quest + 1,
      );
      await checkpoint(
        "burglar-native-travel-reveals-one-physical-loot",
        width,
      );
      await nativeLootExplore(state);
      await resume(page);
      await choose(page, "hand");
      await settle(page);
      state = await resume(page);
      assert.ok(
        state.hand.some((unit) => unit.id === top.id && unit.code === top.code),
      );
      assert.equal(burglar(state).loot.length, 13);
      assert.equal(state.burglarContract.claims.length, 0);
      await checkpoint(
        "burglar-native-exploration-claims-saved-loot-to-hand",
        width,
      );
    }
    {
      const s = createBurglarGame(),
        contract = burglar(s);
      const index = contract.loot.findIndex((unit) => unit.code === "01040");
      assert.ok(index >= 0, "fixture loot includes Citadel Plate");
      const [plate] = contract.loot.splice(index, 1);
      contract.loot.unshift(plate);
      let { state } = await nativeLootTravel(s);
      await nativeLootExplore(state);
      await resume(page);
      const target = state.heroes[0],
        before = target.resources;
      await choose(page, `attach:${target.id}`);
      await settle(page);
      state = await resume(page);
      assert.ok(
        get(state, target.id).attachments.some(
          (attachment) =>
            attachment.id === plate.id && attachment.code === "01040",
        ),
      );
      assert.equal(get(state, target.id).resources, before);
      assert.equal(burglar(state).loot.length, 13);
      await checkpoint(
        "burglar-native-exploration-attaches-physical-loot-without-cost",
        width,
      );
    }
    {
      const s = createBurglarGame(2);
      for (const contract of s.burglarContract.contracts) {
        const index = contract.loot.findIndex((unit) => unit.code === "01040");
        assert.ok(index >= 0);
        const [plate] = contract.loot.splice(index, 1);
        contract.loot.unshift(plate);
      }
      const topIds = s.burglarContract.contracts.map(
        (contract) => contract.loot[0].id,
      );
      const { state, location } = await nativeLootTravel(s);
      assert.deepEqual(
        state.burglarContract.contracts.map((contract) => contract.loot.length),
        [13, 13],
      );
      for (const id of topIds)
        assert.ok(
          state.activeLocation.attachments.some(
            (attachment) => attachment.id === id,
          ),
        );
      assert.equal(
        locationQuest(state, state.activeLocation),
        card(location.code).quest + 4,
      );
      await checkpoint(
        "two-contracts-native-shared-travel-preserves-both-loot-owners",
        width,
      );
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const pin of WRATH_RUIN_PLAYER_ART) {
    const response = await artPage.request.get(
      new URL(pin.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, pin.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
    const dimensions = await artPage.evaluate(
      async (data) => {
        const bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(data)]),
        );
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return dimensions;
      },
      [...bytes],
    );
    assert.ok(dimensions.width > 0 && dimensions.height > 0);
    artwork.push({ ...pin, ...dimensions });
  }
  await artPage.close();
  assert.equal(printedFaces.size, 11);
  const smoke =
    process.env.WRATH_RUIN_PLAYER_SMOKE === "1" ||
    widths.join(",") !== "1280,390,320";
  await report(dir, {
    smoke,
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Wrath and Ruin player browser passed ${checks.length} checkpoints and ${artwork.length} original image faces`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
