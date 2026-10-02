import { finishResourcePhase } from "./browser-review-helpers.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { HERO_CARDS, DECK_CARDS } from "../src/game/decks.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { make } from "../src/game/core.ts";
import { advanceQuest } from "../src/game/board.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { RHOS } from "../src/game/rhosgobel.ts";
import {
  installReviewHandler,
  acknowledgeReviews,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5201";
const dir = "output/expansion-rules";
await fs.mkdir(dir, { recursive: true });
const retailRecipes = JSON.parse(
  await fs.readFile("public/published-decks.json", "utf8"),
).filter((d) => ["starter-gondor", "starter-dwarves"].includes(d.id));
const leadership = STARTERS.find((d) => d.id === "leadership");
const spirit = STARTERS.find((d) => d.id === "spirit");
const lore = STARTERS.find((d) => d.id === "lore");
function fixture(deck = leadership) {
  let s = createGame(72, deck.cards, deck.heroes, deck.id, {
    scenarioId: "conflict-at-the-carrock",
  });
  s = applyAction(s, { type: "KEEP" });
  s.choice = null;
  s.queue = [];
  return s;
}
const contribution = fixture();
contribution.heroes.forEach((h, i) => {
  h.resources = i === 0 ? 8 : 0;
});
const grimbeorn = make(contribution, CARROCK.grimbeorn);
grimbeorn.resources = 7;
contribution.staging.push(grimbeorn);
const sacked = fixture(spirit);
sacked.phase = "quest";
sacked.heroes[0].attachments.push({
  id: `sack-${sacked.nextId++}`,
  code: CARROCK.sacked,
  exhausted: false,
});
const finalStage = fixture();
finalStage.progress = 7;
advanceQuest(finalStage);
const blockedTravel = fixture();
blockedTravel.phase = "travel";
let falls = createGame(72, leadership.cards, leadership.heroes, leadership.id, {
  scenarioId: "hills-of-emyn-muil",
});
falls = applyAction(falls, { type: "KEEP" });
falls.phase = "quest";
falls.activeLocation = make(falls, EMYN.falls);
const songPayment = fixture(lore);
songPayment.heroes.forEach((h) => {
  h.resources = 0;
});
songPayment.heroes[0].resources = 2;
songPayment.heroes[0].attachments.push({
  id: `song-${songPayment.nextId++}`,
  code: "02010",
  exhausted: false,
});
songPayment.hand = [make(songPayment, "01026")];
let athelasClaim = createGame(
  72,
  leadership.cards,
  leadership.heroes,
  leadership.id,
  { scenarioId: "journey-to-rhosgobel" },
);
athelasClaim = applyAction(athelasClaim, { type: "KEEP" });
athelasClaim.heroes[1].exhausted = true;
athelasClaim.staging.push(make(athelasClaim, RHOS.athelas));
const raptors = structuredClone(athelasClaim);
raptors.phase = "defense";
raptors.engaged = [make(raptors, RHOS.bats)];
raptors.allies.push(make(raptors, "02057"));
const radagastPayment = structuredClone(athelasClaim);
radagastPayment.heroes.forEach((h) => {
  h.resources = 0;
});
const radagast = make(radagastPayment, "02059");
radagast.resources = 5;
radagastPayment.allies.push(radagast);
radagastPayment.hand = [make(radagastPayment, "02053")];
for (const s of [
  contribution,
  sacked,
  finalStage,
  blockedTravel,
  falls,
  songPayment,
  athelasClaim,
  raptors,
  radagastPayment,
])
  assert.ok(validateSave(s));

const browser = await chromium.launch({ headless: true });
const errors = [];
const state = async (p) => {
  await acknowledgeReviews(p);
  return JSON.parse(await p.evaluate(() => window.render_game_to_text()));
};
async function navigate(p, name) {
  const button = p.getByRole("button", { name, exact: true });
  const box = await button.boundingBox();
  if (!box || box.x < 0 || box.x + box.width > p.viewportSize().width)
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await button.click();
}
async function load(p, s) {
  await p.evaluate((game) => {
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(game));
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  await acknowledgeReviews(p);
}
async function screenshot(p, name, height) {
  await p.waitForFunction(
    () =>
      [...document.images].every((img) => {
        const r = img.getBoundingClientRect();
        return (
          r.bottom <= 0 ||
          r.top >= innerHeight ||
          r.right <= 0 ||
          r.left >= innerWidth ||
          img.complete
        );
      }),
    null,
    { timeout: 25000 },
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: no horizontal overflow`,
  );
  const dialog = p.getByRole("dialog");
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    assert.ok(
      box.y >= 0 && box.y + box.height <= height + 1,
      `${name}: dialog stays in viewport`,
    );
    for (const img of await dialog.locator(".card-detail-art img").all()) {
      const art = await img.boundingBox();
      assert.ok(
        art.x >= box.x && art.x + art.width <= box.x + box.width,
        `${name}: complete quest face fits inside the inspector`,
      );
    }
  }
  await p.screenshot({ path: `${dir}/${name}.png` });
}
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [320, 750],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await installReviewHandler(p);
    await p.goto(base);
    await p.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    const registry = JSON.parse(
      await p.evaluate(() => window.render_game_to_text()),
    ).automatedPlay;
    assert.equal(registry.heroes, HERO_CARDS.length);
    assert.equal(registry.deckCards, DECK_CARDS.length);
    assert.ok(
      registry.heroCodes.includes("02001") &&
        registry.heroCodes.includes("02025"),
    );
    assert.ok(registry.deckCardCodes.includes("02057"));

    if (width === 1280) {
      await p
        .getByRole("button", {
          name: /Conflict at the Carrock.*Trolls on the Anduin/s,
        })
        .click();
      assert.equal(await p.locator(".journey-stage").count(), 2);
      await p
        .getByRole("button", { name: "Choose Leadership", exact: true })
        .click();
      await p.locator("#start-btn").click();
      const setup = await state(p);
      assert.equal(setup.scenario, "conflict-at-the-carrock");
      assert.equal(setup.phase, "setup");
      assert.deepEqual(
        setup.staging.map((u) => u.name),
        ["The Carrock"],
      );
      assert.equal(setup.encounterCount, 45);
      await screenshot(p, `carrock-setup-${width}`, height);
      await p
        .getByRole("button", { name: "Keep hand", exact: true })
        .first()
        .click();
      await finishResourcePhase(p);
      assert.equal((await state(p)).phase, "planning");
    }

    await load(p, contribution);
    const help = p.getByRole("button", {
      name: "Help Grimbeorn · Pay 1 resource",
      exact: true,
    });
    assert.ok(
      await help.isEnabled(),
      "Grimbeorn's staging action is reachable",
    );
    await p
      .locator(".board-card")
      .filter({
        has: p.getByRole("button", {
          name: "Inspect Grimbeorn the Old",
          exact: true,
        }),
      })
      .scrollIntoViewIfNeeded();
    await screenshot(p, `grimbeorn-staging-${width}`, height);
    await help.click();
    const pending = await state(p);
    assert.match(pending.choice.title, /Help Grimbeorn/);
    await screenshot(p, `grimbeorn-choice-${width}`, height);
    await p.reload();
    await p.locator("#start-btn").click();
    assert.deepEqual(
      (await state(p)).choice,
      pending.choice,
      "the resource choice survives reload",
    );
    await p
      .getByRole("dialog")
      .getByRole("button", {
        name: "Aragorn",
        exact: true,
      })
      .click();
    const after = await state(p);
    const joined = after.allies.find((u) => u.name === "Grimbeorn the Old");
    assert.equal(joined.resources, 8);
    assert.equal(after.heroes[0].resources, 7);
    assert.ok(!after.staging.some((u) => u.name === "Grimbeorn the Old"));
    await p.reload();
    await p.locator("#start-btn").click();
    assert.equal(
      (await state(p)).allies.find((u) => u.name === "Grimbeorn the Old")
        .resources,
      8,
    );

    await load(p, sacked);
    assert.equal(
      await p
        .getByRole("button", { name: "Commit Éowyn", exact: true })
        .count(),
      0,
    );
    const hero = p.locator(".character-card").filter({
      has: p.getByRole("button", { name: "Read Éowyn card", exact: true }),
    });
    assert.match(await hero.innerText(), /Sacked!.*Cannot quest, fight/s);
    const ownAbility = hero
      .locator(".abilities > button")
      .filter({ hasText: "Strength of spirit" });
    assert.equal(await ownAbility.count(), 1, await hero.innerText());
    assert.ok(await ownAbility.isDisabled());
    await hero.scrollIntoViewIfNeeded();
    await screenshot(p, `sacked-hero-${width}`, height);
    await hero
      .getByRole("button", { name: "Inspect attachment: Sacked!", exact: true })
      .click();
    await p.getByRole("dialog", { name: "Sacked!", exact: true }).waitFor();
    assert.match(
      await p.locator(".card-detail .source-note").innerText(),
      /Conflict at the Carrock/,
    );
    await screenshot(p, `sacked-inspector-${width}`, height);
    await p.keyboard.press("Escape");

    await load(p, blockedTravel);
    const carrock = p.locator(".board-card").filter({
      has: p.getByRole("button", {
        name: "Inspect The Carrock",
        exact: true,
      }),
    });
    assert.ok(
      await carrock
        .getByRole("button", { name: "Travel here", exact: true })
        .isDisabled(),
      "The Carrock does not offer illegal travel",
    );

    await load(p, finalStage);
    assert.equal((await state(p)).quest.stage, 2);
    assert.equal((await state(p)).staging.length, 4);
    assert.match(
      await p.locator(".tabletop-label").first().innerText(),
      /2\s*\/\s*2/,
    );
    await p
      .getByRole("button", {
        name: "Inspect quest: Against the Trolls",
        exact: true,
      })
      .click();
    assert.match(
      await p.locator(".quest-inspector").innerText(),
      /Stage 2 of 2/,
    );
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "Against the Trolls", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    assert.equal(
      await p
        .getByRole("button", { name: "Show front", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.match(await p.locator(".card-detail").innerText(), /Troll/);
    await screenshot(p, `carrock-printed-quest-${width}`, height);
    await p.keyboard.press("Escape");

    await load(p, falls);
    assert.equal((await state(p)).quest.stage, 1);
    assert.match(
      await p.locator(".quest-goals").first().innerText(),
      /Victory points.*0\/20.*Explore every Emyn Muil location/s,
    );
    const commit = p.locator(".turn-actions .primary");
    assert.ok(
      await commit.first().isDisabled(),
      "Falls of Rauros requires every eligible ready character",
    );
    assert.match(await commit.first().innerText(), /Select 3 more characters/);
    await p
      .getByRole("group", { name: "Heroes", exact: true })
      .scrollIntoViewIfNeeded();
    await screenshot(p, `falls-required-selection-${width}`, height);
    for (const heroName of ["Aragorn", "Théodred", "Glóin"]) {
      await p
        .getByRole("button", { name: `Commit ${heroName}`, exact: true })
        .click();
    }
    assert.ok(await commit.first().isEnabled());
    assert.match(await commit.first().innerText(), /Commit & reveal/);
    await p
      .getByRole("button", {
        name: "Inspect quest: The Hills of Emyn Muil",
        exact: true,
      })
      .click();
    assert.match(
      await p.locator(".quest-inspector").innerText(),
      /Stage 1 of 1/,
    );
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "The Hills of Emyn Muil", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    assert.match(
      await p.locator(".card-back-rules").innerText(),
      /20 victory points/,
    );
    await screenshot(p, `emyn-printed-quest-${width}`, height);
    await p.keyboard.press("Escape");

    await load(p, songPayment);
    await p.locator(".hand-play").click();
    const songDialog = p.getByRole("dialog");
    assert.equal(
      await songDialog.locator(".payment-row").count(),
      1,
      "Song of Kings makes its bearer an eligible Leadership payer",
    );
    assert.match(
      await songDialog.locator(".payment-row").innerText(),
      /Denethor.*2 available/s,
    );
    assert.equal(
      await songDialog.locator(".payment-row .stepper > span").innerText(),
      "2",
      "matching resources are preallocated through the engine payer list",
    );
    await songDialog
      .locator(
        `.target-selection [data-unit-id="${songPayment.heroes[0].id}"] .decision-select`,
      )
      .click();
    await songDialog
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    const songAfter = await state(p);
    assert.equal(songAfter.heroes[0].resources, 0);
    assert.ok(songAfter.heroes[0].attachments.some((a) => a.code === "01026"));

    await load(p, radagastPayment);
    await p.locator(".hand-play").click();
    const creatureDialog = p.getByRole("dialog");
    assert.equal(await creatureDialog.locator(".payment-row").count(), 1);
    assert.match(
      await creatureDialog.locator(".payment-row").innerText(),
      /Radagast.*5 available/s,
    );
    assert.equal(
      await creatureDialog.locator(".payment-row .stepper > span").innerText(),
      "5",
    );
    await creatureDialog.locator(".payment-row").scrollIntoViewIfNeeded();
    await screenshot(p, `radagast-creature-payment-${width}`, height);
    await creatureDialog
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    const creatureAfter = await state(p);
    assert.equal(
      creatureAfter.allies.find((u) => u.code === "02059").resources,
      0,
    );
    assert.ok(creatureAfter.allies.some((u) => u.code === "02053"));
    await p.reload();
    await p.locator("#start-btn").click();
    const creatureReloaded = await state(p);
    assert.equal(
      creatureReloaded.allies.find((u) => u.code === "02059").resources,
      0,
    );
    assert.ok(creatureReloaded.allies.some((u) => u.code === "02053"));

    await load(p, athelasClaim);
    assert.match(
      await p.locator(".quest-goals").first().innerText(),
      /Wilyador.*18\/20 HP.*Athelas held.*0/s,
    );
    const heldThreat = (await state(p)).threat;
    await p
      .getByRole("button", { name: "Claim · Exhaust hero", exact: true })
      .click();
    const claim = p.getByRole("dialog", {
      name: "Claim an objective",
      exact: true,
    });
    assert.match(await claim.innerText(), /ready hero to exhaust/);
    assert.equal(
      await claim.locator(".decision-select").count(),
      2,
      "only ready heroes are offered for Athelas",
    );
    await claim.getByRole("button", { name: "Aragorn", exact: true }).click();
    const claimed = await state(p);
    assert.equal(claimed.threat, heldThreat);
    assert.ok(claimed.heroes[0].exhausted);
    assert.ok(
      claimed.heroes[0].attachments.some((a) => a.code === RHOS.athelas),
    );
    await p.locator(".quest-goals").first().scrollIntoViewIfNeeded();
    await screenshot(p, `rhosgobel-wilyador-${width}`, height);
    await p
      .getByRole("button", {
        name: "Inspect quest: The Wounded Eagle",
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Read printed quest", exact: true })
      .click();
    await p
      .getByRole("dialog", { name: "The Wounded Eagle", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Show reverse", exact: true }).click();
    await screenshot(p, `rhosgobel-printed-quest-${width}`, height);
    await p.keyboard.press("Escape");
    await load(p, raptors);
    await p.locator(".engaged-zone .card-action").click();
    const combat = p.getByRole("dialog", {
      name: "Choose your defender",
      exact: true,
    });
    assert.equal(
      await combat.locator(".combat-company .decision-select").count(),
      2,
      "raptor attacks offer only Eagle or Ranged defenders",
    );
    assert.match(
      (
        await combat.locator(".combat-company .decision-select").allInnerTexts()
      ).join(" "),
      /Wilyador.*Haldir of Lórien/s,
    );
    await p.keyboard.press("Escape");

    await navigate(p, "Deck builder");
    await p.getByRole("button", { name: "New deck", exact: true }).click();
    await p
      .getByRole("button", { name: "Add Bilbo Baggins", exact: true })
      .click();
    assert.match(
      await p.locator(".builder-hero.is-selected").innerText(),
      /The Hunt for Gollum/,
    );
    await p
      .getByRole("button", { name: "Add Frodo Baggins", exact: true })
      .click();
    assert.equal(await p.locator(".builder-hero.is-selected").count(), 2);
    const filter = p.getByRole("combobox", {
      name: "Filter playable card product",
      exact: true,
    });
    await filter.selectOption("A Journey to Rhosgobel");
    const haldir = p.locator(".builder-card").filter({
      has: p.getByRole("button", {
        name: /Haldir of Lórien.*ally/s,
      }),
    });
    assert.match(await haldir.innerText(), /A Journey to Rhosgobel/);
    await haldir
      .getByRole("button", { name: "Add one Haldir of Lórien", exact: true })
      .click();
    assert.match(
      await p.locator(".builder-deck-list").innerText(),
      /1 ×.*Haldir/s,
    );
    await haldir.scrollIntoViewIfNeeded();
    await screenshot(p, `registered-player-cards-${width}`, height);
    if (width === 1280) {
      await p.getByRole("button", { name: "Cancel", exact: true }).click();
      await navigate(p, "Adventures");
      await p
        .getByRole("button", { name: "Choose Spirit", exact: true })
        .click();
      await navigate(p, "Card library");
      await p
        .getByRole("group", { name: "Content category", exact: true })
        .getByRole("button", { name: "Scenario lists", exact: true })
        .click();
      await p
        .getByRole("textbox", { name: "Search cards", exact: true })
        .fill("Conflict at the Carrock");
      await p
        .getByRole("combobox", { name: "Filter scenario mode", exact: true })
        .selectOption("easy");
      await p.locator(".scenario-recipe").first().click();
      assert.match(
        await p.locator(".published-support").innerText(),
        /Automated play is available/,
      );
      await p
        .getByRole("button", { name: "Choose adventure", exact: true })
        .click();
      assert.equal(
        await p
          .getByRole("button", { name: "Choose Spirit", exact: true })
          .getAttribute("aria-pressed"),
        "true",
        "archive selection preserves the chosen deck",
      );
      assert.equal(
        await p
          .getByRole("button", {
            name: /Conflict at the Carrock.*Trolls on the Anduin/s,
          })
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.ok(
        await p.getByRole("checkbox", { name: /Easy mode/ }).isChecked(),
      );
      await navigate(p, "Card library");
      await p
        .getByRole("group", { name: "Content category", exact: true })
        .getByRole("button", { name: "Scenario lists", exact: true })
        .click();
      await p
        .getByRole("textbox", { name: "Search cards", exact: true })
        .fill("Conflict at the Carrock");
      await p
        .getByRole("combobox", { name: "Filter scenario mode", exact: true })
        .selectOption("nightmare");
      await p.locator(".scenario-recipe").first().click();
      assert.ok(
        await p
          .getByRole("button", { name: "Choose adventure", exact: true })
          .isDisabled(),
        "an imported Nightmare list does not inherit standard quest support",
      );
      for (const retailRecipe of retailRecipes) {
        await navigate(p, "My fellowship");
        await p
          .locator(".published-starter")
          .filter({ hasText: retailRecipe.name })
          .click();
        assert.ok(
          await p
            .getByRole("button", { name: "Choose for play", exact: true })
            .isEnabled(),
          `the fully registered ${retailRecipe.name} retail recipe can be chosen`,
        );
        await p
          .getByRole("button", { name: "Choose for play", exact: true })
          .click();
        const retailChoice = p
          .locator(".deck-choice")
          .filter({ hasText: retailRecipe.name });
        assert.equal(
          await retailChoice
            .locator("button")
            .first()
            .getAttribute("aria-pressed"),
          "true",
        );
        assert.match(
          await retailChoice.locator(".deck-product-note").innerText(),
          /Separately sold Starter Deck.*Sold as its own starter deck/s,
        );
        await p
          .getByRole("button", {
            name: /Passage Through Mirkwood.*Beneath the ancient boughs/s,
          })
          .click();
        await p.locator("#start-btn").click();
        const replace = p.getByRole("dialog", {
          name: "A new journey?",
          exact: true,
        });
        if (await replace.isVisible())
          await replace
            .getByRole("button", { name: "Begin anew", exact: true })
            .click();
        const retail = await state(p);
        assert.equal(retail.phase, "setup");
        assert.equal(retail.deck, "custom");
        assert.equal(retail.deckCount + retail.hand.length, 50);
        assert.deepEqual(
          retail.heroes.map((h) => h.code),
          retailRecipe.heroes,
        );
        await screenshot(p, `${retailRecipe.id}-retail-setup-1280`, height);
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, [], "no browser errors");
  console.log(
    "Expansion UI passed: registered card choices and provenance, Carrock setup/Grimbeorn/Sacked, Falls mandatory quest selection, Rhosgobel health/Athelas/Raptor choices, Song and Radagast payments, printed quest reverses, retail Gondor and Dwarves start, save/reload, and responsive layouts.",
  );
} finally {
  await browser.close();
}
