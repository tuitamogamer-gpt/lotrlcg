import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  depthsPlayerFixture as fixture,
  depthsPlayerHand as hand,
  depthsPlayerAlly as ally,
  depthsPlayerAttach as attach,
} from "../tests/depths-player-fixtures.ts";
import { COBAS_PLAYER as P } from "../src/game/cobas-player-support.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { angmarSyncSwordThain } from "../src/game/angmar-player.ts";
import { get } from "../src/game/core.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, load, resume, choose, settle, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
// Keep the complete 117-checkpoint player report and its screenshots intact.
const dir = "output/cobas-houses-sacked";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
function paidState(s, healerId, payerId, eventId) {
  const healer = get(s, healerId);
  assert.ok(s.heroes.some((hero) => hero.id === healerId));
  assert.equal(healer.exhausted, true);
  assert.ok(healer.attachments.some((a) => a.code === "10149"));
  assert.ok(healer.attachments.some((a) => a.code === CARROCK.sacked));
  assert.equal(get(s, payerId).resources, 0);
  assert.equal(s.heroes.find((hero) => hero.code === "01001").damage, 1);
  assert.equal(s.fallenThreat, 0);
  assert.equal(s.discard.filter((code) => code === P.houses).length, 1);
  assert.ok(!s.hand.some((u) => u.id === eventId));
  assert.equal(s.choice, null);
}

try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;
    let s = fixture();
    s.phase = "refresh";
    s.discard = ["01001"];
    s.fallenThreat = 12;
    const healer = ally(s, P.ioreth),
      payer = s.heroes[0];
    attach(s, healer, "10149");
    attach(s, healer, CARROCK.sacked);
    angmarSyncSwordThain(s);
    assert.ok(s.heroes.some((hero) => hero.id === healer.id));
    for (const hero of s.heroes) hero.resources = hero.id === payer.id ? 4 : 0;
    const event = hand(s, P.houses);
    await load(p, s);

    await boardCard(p, event.id)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await p
      .locator('.decision-card[data-unit-id="discard-0"] .decision-select')
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Houses of Healing/);
    assert.ok(s.choice.options.some((o) => o.id === healer.id));
    assert.ok(!s.choice.options.some((o) => o.id === "pay"));
    assert.equal(get(s, payer.id).resources, 4);
    assert.equal(get(s, healer.id).exhausted, false);
    await shot(p, "sacked-healer-enables-discounted-play", width);

    await choose(p, healer.id);
    const selected = await saved(p);
    assert.ok(selected.choice.options.some((o) => o.id === "pay"));
    s = await resume(p);
    assert.deepEqual(
      s.choice,
      selected.choice,
      "saved Healer selection resumes",
    );
    assert.equal(get(s, healer.id).exhausted, false);
    assert.equal(get(s, payer.id).resources, 4);
    assert.ok(s.hand.some((u) => u.id === event.id));
    assert.ok(!s.heroes.some((hero) => hero.code === "01001"));
    await shot(p, "sacked-healer-selected-cost-restored", width);

    await choose(p, "pay");
    s = await settle(p);
    paidState(s, healer.id, payer.id, event.id);
    await shot(p, "sacked-healer-paid-and-hero-revived", width);

    s = await resume(p);
    paidState(s, healer.id, payer.id, event.id);
    await shot(p, "sacked-healer-paid-state-restored", width);
    await c.close();
  }
  assert.equal(screenshots.length, 12, "all focused checkpoints are required");
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    sourceScriptSha256,
  });
  console.log(`Cobas Houses/Sacked: 12 checkpoints passed (${url}).`);
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
