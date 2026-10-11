import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base, second } from "../tests/raid-grey-havens-fixtures.ts";
import { make } from "../src/game/core.ts";
import { destroy } from "../src/game/board.ts";
import { RAID as R } from "../src/game/raid-grey-havens-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  next,
  opening,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";

const dir = "output/raid-grey-havens";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [],
  entries = new Set(),
  checks = [];
let currentPage;
async function checkpoint(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    currentPage = p;
    p.setDefaultTimeout(30000);
    await fresh(
      p,
      "raid-on-the-grey-havens",
      width === 1440 ? 2 : 1,
      width !== 1440,
    );
    await p.locator("#start-btn").click();
    let s = await opening(p);
    assert.equal(s.scenarioId, "raid-on-the-grey-havens");
    assert.equal(s.raidGreyHavens.initialized, true);
    assert.equal(s.raidGreyHavens.burned.length, 0);
    assert.equal(s.stage, 1);
    assert.match(
      await p.locator('[data-scenario-panel="raid-grey-havens"]').innerText(),
      /end of each round/,
    );
    await checkpoint(p, "original-setup", width);
    await resume(p);

    s = base();
    s.phase = "travel";
    const white = make(s, R.white);
    s.staging.push(white);
    s.encounterDeck = [R.arsonist, ...Array(20).fill("01099")];
    await load(p, s);
    await p
      .getByRole("button", { name: "Travel here", exact: true })
      .and(p.locator("button:enabled"))
      .first()
      .click();
    await checkpoint(p, "white-ship-travel-search", width);
    await resume(p);
    s = await choose(p, R.arsonist);
    assert.equal(s.activeLocation.id, white.id);
    assert.ok(s.staging.some((u) => u.code === R.arsonist));
    assert.equal(s.choice, null);
    await checkpoint(p, "corsair-added-without-reveal", width);

    s = base();
    s.phase = "refresh";
    const pier = make(s, R.piers);
    pier.damage = 4;
    s.staging.push(pier);
    s.encounterDeck = [R.raider, ...Array(20).fill("01099")];
    await load(p, s);
    await next(p);
    await checkpoint(p, "burned-location-forced-order", width);
    await resume(p);
    s = await settle(p);
    assert.equal(s.raidGreyHavens.burned.length, 1);
    assert.equal(s.raidGreyHavens.burned[0].id, pier.id);
    assert.equal(s.staging.find((u) => u.code === R.dream).damage, 4);
    assert.ok(s.staging.some((u) => u.code === R.raider));
    await checkpoint(p, "aflame-round-damage-and-chain", width);
    await resume(p);

    s = base();
    s.phase = "staging";
    s.heroes[0] = make(s, "01005");
    s.heroes[0].resources = 3;
    s.heroes[0].committed = true;
    s.heroes[0].exhausted = true;
    s.heroes[0].tempWill = 30;
    s.committedIds = [s.heroes[0].id];
    s.hand = [make(s, "04078")];
    const trap = make(s, "05017");
    s.staging.push(trap);
    s.encounterDeck = [R.runner, ...Array(20).fill("01099")];
    await load(p, s);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /elite enemy's entry effects/);
    await checkpoint(p, "stage-two-elite-entry-order", width);
    await resume(p);
    s = await choose(p, "order-1");
    assert.match(s.choice.title, /Fresh Tracks/);
    assert.equal(s.encounterDeck[0], R.runner);
    await resume(p);
    s = await choose(p, "play");
    s = await settle(p);
    const naasiyah = s.staging.find((u) => u.code === R.naasiyah);
    assert.equal(naasiyah.damage, 1);
    assert.ok(naasiyah.attachments.some((a) => a.id === trap.id));
    assert.ok(s.staging.some((u) => u.code === R.runner));
    await checkpoint(p, "elite-trap-and-fresh-tracks", width);

    s = second();
    s.phase = "staging";
    const dream = s.staging.find((u) => u.code === R.dream);
    dream.damage = 3;
    s.heroes[0].committed = true;
    s.heroes[0].exhausted = true;
    s.heroes[0].tempWill = 30;
    s.committedIds = [s.heroes[0].id];
    s.encounterDeck = [R.raider, ...Array(20).fill("01099")];
    await load(p, s);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Remove damage/);
    await checkpoint(p, "quest-progress-removes-fire", width);
    await resume(p);
    s = await choose(p, `${dream.id}:3`);
    s = await settle(p);
    assert.equal(s.staging.find((u) => u.id === dream.id).damage, 0);
    assert.equal(s.progress, 0);
    await checkpoint(p, "dream-chaser-fire-extinguished", width);

    s = second();
    s.phase = "staging";
    s.heroes[0].committed = true;
    s.heroes[0].exhausted = true;
    s.heroes[0].tempWill = 30;
    s.committedIds = [s.heroes[0].id];
    s.encounterDeck = [R.raider, ...Array(20).fill("01099")];
    s.staging.find((u) => u.code === R.dream).damage = 1;
    destroy(
      s,
      s.staging.find((u) => u.code === R.sahir),
    );
    await load(p, s);
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    s = await settle(p);
    assert.equal(s.status, "won");
    await checkpoint(p, "sahir-defeated-and-havens-saved", width);
    await c.close();
  }
  await report(dir, { errors, screenshots, entries, checks });
  console.log(
    `PASS Raid on the Grey Havens: ${checks.length} desktop/mobile browser checkpoints`,
  );
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({ path: `${dir}/failure.png` });
    await fs.writeFile(
      `${dir}/failure-body.txt`,
      await currentPage.locator("body").innerText(),
    );
  }
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify({ message: String(error), errors, checks }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
