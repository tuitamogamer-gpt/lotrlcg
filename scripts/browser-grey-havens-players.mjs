import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  greyHavensFixture as fixture,
  greyHavensHand as hand,
  greyHavensAlly as ally,
} from "../tests/grey-havens-player-fixtures.ts";
import {
  GREY_HAVENS as G,
  GREY_HAVENS_PLAYER_CARDS,
} from "../src/game/grey-havens-player-support.ts";
import { card, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { seatView, syncSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import {
  url,
  saved,
  resume,
  choose,
  settle,
  next,
  context,
  capture,
  report,
} from "./browser-angmar-helpers.mjs";
import { reviewedState } from "./browser-review-helpers.mjs";

const smoke = process.env.GREY_HAVENS_BROWSER_SMOKE === "1";
const dir = "output/grey-havens-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid player browser fixture");
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
  const after = await saved(p);
  assert.deepEqual(
    after.hand.map((u) => u.id),
    s.hand.map((u) => u.id),
    "fixture hand replaces the previous adventure",
  );
  return after;
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await p
    .locator(`[data-motion-card="${id}"]`)
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
async function act(p, id, label) {
  await p
    .locator(`[data-motion-card="${id}"]`)
    .getByRole("button", { name: label, exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
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
    // Both a real attachment payment and a remote ally Action target cross reload boundaries.
    let s = fixture(2),
      narya = hand(s, G.narya),
      hero = s.heroes[0],
      remote = ally(s, G.navigator, 1),
      local = ally(s, G.warden);
    remote.exhausted = true;
    const prior = stats(s, remote);
    await load(p, s);
    s = await play(p, narya.id, hero.id);
    s = await settle(p);
    assert.ok(get(s, hero.id).attachments.some((a) => a.id === narya.id));
    await act(p, hero.id, "Exhaust Narya and character · Ready up to 2 allies");
    await shot(p, "narya-ready-allies-choice", width);
    await resume(p);
    await choose(p, remote.id);
    await choose(p, local.id);
    s = await settle(p);
    assert.equal(get(s, remote.id).exhausted, false);
    assert.equal(stats(s, get(s, remote.id)).attack, prior.attack + 1);
    assert.equal(get(s, local.id).tempDefense, 1);
    assert.equal(get(s, hero.id).exhausted, true);
    await shot(p, "narya-remote-and-ready-ally-result", width);
    await resume(p);

    // Discard two selected physical cards; the Noldor ally pays the one-resource minimum.
    s = fixture();
    hero = s.heroes[0];
    const sea = hand(s, G.sea),
      one = hand(s, "01020"),
      two = hand(s, "01021"),
      navigator = hand(s, G.navigator);
    await load(p, s);
    await play(p, sea.id, hero.id);
    await settle(p);
    await act(
      p,
      hero.id,
      "Exhaust To the Sea, to the Sea! · Discard cards for a Noldor ally discount",
    );
    await choose(p, one.id);
    await shot(p, "sea-physical-discard-subset", width);
    await resume(p);
    await choose(p, two.id);
    await choose(p, "done");
    s = await settle(p);
    const before = s.heroes.reduce((sum, h) => sum + h.resources, 0);
    await play(p, navigator.id);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.id === navigator.id));
    assert.equal(
      s.heroes.reduce((sum, h) => sum + h.resources, 0),
      before - 1,
    );
    assert.deepEqual(s.discard, ["01020", "01021"]);
    assert.ok(!s.used.some((key) => key.startsWith("phase:grey-havens:sea:")));
    await shot(p, "sea-noldor-ally-paid-minimum", width);
    await resume(p);

    // The resolving event stays outside discard while its older copy grants a second choice.
    s = fixture();
    const event = hand(s, G.star),
      first = make(s, "01100"),
      second = make(s, "01099");
    s.staging.push(first, second);
    s.discard = [G.star];
    await load(p, s);
    await play(p, event.id, first.id);
    s = await saved(p);
    assert.match(s.choice.title, /1 remaining/);
    assert.equal(get(s, first.id).progress, 2);
    assert.deepEqual(s.discard, [G.star]);
    await shot(p, "evening-star-repeat-choice", width);
    await resume(p);
    await choose(p, second.id);
    s = await settle(p);
    assert.equal(get(s, second.id).progress, 2);
    assert.deepEqual(s.discard, [G.star, G.star]);
    await shot(p, "evening-star-two-location-result", width);

    // Actual refresh -> resource progression adds Círdan's extra card and restricts Forced choices.
    s = fixture();
    const old = hand(s, "01020");
    s.phase = "refresh";
    s.deck = ["01021", "01022", "01023"];
    await load(p, s);
    await next(p);
    s = await saved(p);
    assert.match(s.choice.title, /Círdan/);
    assert.equal(s.choice.options.length, 2);
    assert.ok(!s.choice.options.some((o) => o.id === old.id));
    await shot(p, "cirdan-only-newly-drawn-choice", width);
    await resume(p);
    s = await choose(p, s.choice.options[1].id);
    s = await settle(p);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      ["01020", "01021"],
    );
    assert.deepEqual(s.discard, ["01022"]);
    assert.equal(s.phase, "resource");
    await shot(p, "cirdan-resource-draw-result", width);

    const faces = GREY_HAVENS_PLAYER_CARDS.map(imageUrl);
    const broken = await p.evaluate(
      async (urls) =>
        (
          await Promise.all(
            urls.map(async (src) => {
              const i = new Image();
              i.src = src;
              try {
                await i.decode();
                return null;
              } catch {
                return src;
              }
            }),
          )
        ).filter(Boolean),
      faces,
    );
    assert.deepEqual(broken, []);
    checks.push(`${faces.length} original player faces decoded @ ${width}`);
    assert.equal(card(G.cirdan).name, "Círdan the Shipwright");
    assert.equal(seatView(s, 0).hand.length, 2);
    await c.close();
  }
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
  });
  console.log(
    `Grey Havens players: ${screenshots.length} actual browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
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
