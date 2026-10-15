import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  haradPlayerFixture as fixture,
  haradPlayerHand as hand,
  haradPlayerAlly as ally,
  haradPlayerAttach as attach,
} from "../tests/harad-player-fixtures.ts";
import {
  HARAD_PLAYER as P,
  HARAD_PLAYER_CARDS,
} from "../src/game/harad-player-support.ts";
import { availableAbilities } from "../src/game/engine.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { seatView, syncSeat, selectSeat, forOwner } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { CHETWOOD } from "../src/game/chetwood-support.ts";
import { mainQuestUnit } from "../src/game/quest-state.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const responseScriptSha256 = createHash("sha256")
  .update(
    await fs.readFile(
      new URL("./browser-harad-responses.mjs", import.meta.url),
    ),
  )
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1";
const dir = smoke ? "output/harad-players-smoke" : "output/harad-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid Sands of Harad player fixture");
  const navigation = p.waitForNavigation({ waitUntil: "load" });
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
    location.reload();
  }, s);
  await navigation;
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await boardCard(p, id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await p
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, enemy, hero, power) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: `Attack · ${power} power`, exact: true })
    .click();
  await reviewedState(p);
}
async function printed(p, c) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    c.name,
  );
  assert.equal(
    await p.locator("[data-card-primary-rules]").textContent(),
    plain(c.text),
  );
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    imageUrl(c),
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.complete && i.naturalWidth > 0;
    }),
  );
}
try {
  for (const [width, height] of smoke
    ? [[1280, 900]]
    : [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;
    let s = fixture();
    const guard = hand(s, P.guard);
    s.deck = ["01013", "01014", "01015"];
    await load(p, s);
    s = await play(p, guard.id);
    assert.match(s.choice.title, /Optional cost reduction/);
    await shot(p, "guard-optional-top-two-discard", width);
    await resume(p);
    s = await choose(p, "discount");
    assert.deepEqual(s.deck, ["01015"]);
    assert.ok(s.discard.includes("01013") && s.discard.includes("01014"));
    assert.match(s.choice.title, /resource payment/);
    await shot(p, "guard-actual-discard-saved-resource-allocation", width);
    await resume(p);
    const payment = s.choice.options.find(
      (o) =>
        Object.values(JSON.parse(o.effects[0].text)).filter((n) => n === 1)
          .length === 2,
    );
    assert.ok(payment);
    const resources = s.heroes.reduce((n, h) => n + h.resources, 0);
    s = await choose(p, payment.id);
    assert.ok(s.allies.some((u) => u.id === guard.id));
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      resources - 2,
    );
    await shot(p, "guard-paid-two-pools-physical-ally-enters", width);

    s = fixture();
    const friendship = hand(s, P.friendship),
      h = s.heroes[2];
    s.deck = ["01013", "01014"];
    await load(p, s);
    s = await play(p, friendship.id, h.id);
    assert.equal(get(s, h.id).resources, 11);
    assert.ok(s.hand.some((u) => u.code === "01013"));
    assert.ok(s.discard.includes(P.friendship));
    await shot(p, "friendship-distinct-unique-traits-draw-and-resource", width);

    s = fixture(2);
    const dour = hand(s, P.dour),
      foe = make(s, "01089");
    s.engaged = [foe];
    s.victoryCards = ["09014", CHETWOOD.rearguard];
    await load(p, s);
    s = await play(p, dour.id, foe.id);
    assert.equal(get(s, foe.id).damage, 2);
    await shot(p, "dour-counts-player-and-encounter-side-quests", width);

    s = fixture();
    const shield = hand(s, P.shield),
      knife = hand(s, P.knife),
      gimli = s.heroes[0],
      legolas = s.heroes[1];
    await load(p, s);
    await play(p, shield.id, gimli.id);
    s = await play(p, knife.id, legolas.id);
    assert.equal(stats(s, get(s, gimli.id)).defense, 3);
    assert.equal(stats(s, get(s, legolas.id)).attack, 4);
    assert.equal(stats(s, get(s, legolas.id)).will, 2);
    await shot(p, "printed-dwarf-silvan-restricted-attachment-bonuses", width);

    s = fixture(2);
    const road = hand(s, P.road),
      quest = mainQuestUnit(s);
    s.heroes[1].code = "01005";
    forOwner(s, 1, () => {
      s.deck = ["01013", P.storm, "01014"];
    });
    await load(p, s);
    s = await play(p, road.id, quest.id);
    assert.ok(mainQuestUnit(s).attachments.some((a) => a.id === road.id));
    await shot(p, "road-physical-main-quest-attachment", width);
    s.phase = "attack";
    s.progress = 6;
    const enemy = make(s, "01089");
    enemy.damage = 2;
    s.engaged = [enemy];
    await load(p, s);
    await attack(p, enemy, get(s, s.heroes[1].id), 3);
    s = await saved(p);
    assert.match(s.choice.title, /Victory responses/);
    s = await choose(
      p,
      s.choice.options.find((o) => o.label.includes("Legolas")).id,
    );
    assert.match(s.choice.title, /Road Goes Ever On/);
    await choose(p, "search");
    await shot(p, "road-actual-defeat-first-player-chooses-searcher", width);
    s = await choose(p, "player-1");
    await resume(p);
    s = await choose(p, "deck-1");
    assert.equal(
      seatView(s, 1).hand.filter((u) => u.code === P.storm).length,
      1,
    );
    assert.ok(seatView(s, 0).discard.includes(P.road));
    await shot(p, "road-remote-private-deck-side-quest-and-shuffle", width);

    s = fixture();
    s.victoryCards = [P.storm];
    for (const h of s.heroes) delete h.phaseResourceIcons;
    const first = hand(s, P.dunadan),
      second = hand(s, P.dunadan);
    await load(p, s);
    s = await play(p, first.id);
    assert.ok(s.allies.some((u) => u.id === first.id));
    await shot(p, "storm-first-ally-play-without-resource-match", width);
    assert.equal(
      await boardCard(p, second.id)
        .getByRole("button", { name: "Play card", exact: true })
        .count(),
      0,
    );
    assert.match(
      await boardCard(p, second.id)
        .locator(".hand-art")
        .getAttribute("aria-description"),
      /matching sphere/i,
    );
    await shot(p, "storm-second-ally-needs-normal-sphere-match", width);

    s = fixture();
    s.phase = "defense";
    s.victoryCards = ["09014"];
    const dunadan = ally(s, P.dunadan),
      one = make(s, "01090"),
      two = make(s, "01090");
    s.engaged = [one, two];
    await load(p, s);
    async function defend(foe) {
      await boardCard(p, foe.id)
        .getByRole("button", { name: "Defend", exact: true })
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: card(dunadan.code).name, exact: true })
        .click();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Resolve enemy attack", exact: true })
        .click();
      await reviewedState(p);
    }
    await defend(one);
    s = await saved(p);
    assert.equal(get(s, dunadan.id).exhausted, false);
    assert.equal(get(s, dunadan.id).damage, 1);
    await shot(p, "dunadan-first-defense-without-exhaustion", width);
    await resume(p);
    await defend(two);
    s = await saved(p);
    assert.equal(get(s, dunadan.id).exhausted, false);
    assert.equal(get(s, dunadan.id).damage, 2);
    await shot(p, "dunadan-second-native-defense-still-ready", width);

    s = fixture(2);
    const archer = hand(s, P.archer),
      remote = seatView(s, 1).heroes[0];
    remote.exhausted = true;
    await load(p, s);
    s = await play(p, archer.id);
    assert.match(s.choice.title, /Greenwood Archer/);
    await choose(p, "use");
    s = await choose(p, remote.id);
    assert.equal(get(s, remote.id).exhausted, false);
    await shot(p, "greenwood-archer-reused-original-remote-ready", width);

    const { runHaradResponses } = await import("./browser-harad-responses.mjs");
    await runHaradResponses(p, {
      fixture,
      load,
      shot,
      choose,
      saved,
      reviewedState,
      resume,
      width,
      boardCard,
    });

    s = fixture();
    for (const definition of HARAD_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of HARAD_PLAYER_CARDS) {
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${definition.name}`,
            exact: true,
          })
          .click();
      else {
        const physical = (await saved(p)).hand.find(
          (u) => u.code === definition.code,
        );
        await boardCard(p, physical.id).locator(".hand-art").click();
      }
      await printed(p, card(definition.code));
      await shot(p, `printed-${definition.code}`, width);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await c.close();
  }
  assert.equal(
    screenshots.length,
    smoke ? 38 : 114,
    "all requested checkpoints are required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
    sourceScriptSha256,
    responseScriptSha256,
  });
  console.log(
    `Sands of Harad players: ${screenshots.length} checkpoints passed (${url}).`,
  );
} catch (error) {
  const failureScreenshot = `${dir}/first-failure.png`;
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: failureScreenshot }).catch(() => null);
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
        failureScreenshot,
        sourceScriptSha256,
        responseScriptSha256,
        stack: error.stack,
        lastState:
          activePage && !activePage.isClosed()
            ? await saved(activePage).catch(() => null)
            : null,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
