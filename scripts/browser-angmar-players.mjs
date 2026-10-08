import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  angmarFixture,
  angmarHand,
  angmarAlly,
} from "../tests/angmar-player-fixtures.ts";
import {
  ANGMAR as A,
  ANGMAR_PLAYER_CARDS,
} from "../src/game/angmar-player-support.ts";
import { card, imageUrl } from "../src/game/cards.ts";
import { get } from "../src/game/core.ts";
import { stats, validateSave } from "../src/game/engine.ts";
import {
  activeSeat,
  forOwner,
  seatView,
  selectSeat,
} from "../src/game/table.ts";
import { isHero } from "../src/game/card-types.ts";
import { DIKE } from "../src/game/deadmens-dike-support.ts";
import { base as dike } from "../tests/deadmens-dike-fixtures.ts";
import { make } from "../src/game/core.ts";
import {
  url,
  saved,
  load,
  resume,
  choose,
  settle,
  next,
  context,
  capture,
  report,
} from "./browser-angmar-helpers.mjs";
const smoke = process.env.ANGMAR_BROWSER_SMOKE === "1";
const dir = "output/angmar-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true }),
  errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
async function shot(p, name, width) {
  await capture(p, dir, `${name}-${width}`, screenshots);
  checks.push(name);
  console.log(`PASS ${name} @ ${width}`);
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
  return settle(p);
}
async function piles(p) {
  await p
    .getByRole("button", { name: "View discard piles", exact: true })
    .click();
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
    // A real paid Favor play selects a remote player's dial rather than a hero attachment slot.
    let s = angmarFixture(2),
      favor = angmarHand(s, A.favor);
    forOwner(s, 1, () => {
      s.threat = 49;
    });
    await load(p, s);
    await p
      .locator(`[data-motion-card="${favor.id}"]`)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    assert.equal(
      await p.locator('.target-selection [data-unit-id^="threat:"]').count(),
      2,
    );
    assert.match(await p.getByRole("dialog").innerText(), /threat dial/);
    await shot(p, "favor-player-targets", width);
    await p
      .locator('.decision-card[data-unit-id="threat:1"] .decision-select')
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    assert.ok(
      seatView(s, 1).threatAttachments.some(
        (a) => a.id === favor.id && a.owner === 0,
      ),
    );
    assert.equal(
      seatView(s, 0).heroes[0].resources,
      10 - Number(card(A.favor).cost),
    );
    await p.locator(".seat-tab").nth(1).click();
    assert.match(
      await p.locator(".threat-attachments").innerText(),
      /Favor of the Valar/,
    );
    await p
      .locator(".threat-attachments")
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(p, "favor-remote-dial-attachment", width);
    const beforeReload = await saved(p);
    await fs.writeFile(
      `${dir}/favor-before-reload.json`,
      JSON.stringify(beforeReload, null, 2),
    );
    assert.ok(
      validateSave(beforeReload),
      "remote Favor snapshot validates before browser reload",
    );
    const restored = await resume(p);
    assert.equal(seatView(restored, 1).threatAttachments[0].id, favor.id);
    s = restored;
    selectSeat(s, 0);
    s.table.turn = 0;
    s.phase = "attack";
    await load(p, s);
    for (let turns = 0; s.phase === "attack"; turns++) {
      assert.ok(turns < 2, "both players finish their actual attack turns");
      await next(p);
      s = await settle(p);
    }
    assert.equal(s.phase, "refresh");
    assert.equal(seatView(s, 1).threat, 45);
    assert.equal(seatView(s, 1).threatAttachments.length, 0);
    assert.ok(seatView(s, 0).discard.includes(A.favor));
    await shot(p, "favor-prevents-threat-elimination", width);
    // Distinct physical discard occurrences: replaying the top event leaves an earlier copy.
    s = angmarFixture();
    s.discard = [A.light, A.light];
    s.deck = ["01020", "01021"];
    const before = s.heroes.reduce((n, h) => n + h.resources, 0);
    await load(p, s);
    await piles(p);
    assert.equal(
      await p
        .getByRole("button", {
          name: "Play Elven-light from discard",
          exact: true,
        })
        .count(),
      2,
    );
    await shot(p, "elven-light-discard-copies", width);
    await p
      .getByRole("button", {
        name: "Play Elven-light from discard",
        exact: true,
      })
      .first()
      .click();
    assert.match(await p.getByRole("dialog").innerText(), /Pay 1 resources/);
    await shot(p, "elven-light-replay-payment", width);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    assert.deepEqual(s.discard, [A.light]);
    assert.deepEqual(
      s.hand.map((u) => u.code),
      [A.light, "01020"],
    );
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      before - 1,
    );
    assert.equal(s.deck.length, 1);
    await shot(p, "elven-light-return-and-draw", width);
    await resume(p);
    // Lords applies the boost across player ownership and pays from the active Spirit pools.
    s = angmarFixture(2);
    s.discard = [A.lords];
    s.deck = ["01020"];
    const noldor = angmarAlly(s, A.jeweler, 1);
    const prior = stats(s, noldor);
    await load(p, s);
    await piles(p);
    await p
      .getByRole("button", {
        name: "Play Lords of the Eldar from discard",
        exact: true,
      })
      .click();
    await shot(p, "lords-replay-payment", width);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    assert.equal(seatView(s, 0).deck.at(-1), A.lords);
    assert.equal(seatView(s, 0).discard.length, 0);
    const after = stats(s, get(s, noldor.id));
    for (const k of ["will", "attack", "defense"])
      assert.equal(after[k], prior[k] + 1);
    await shot(p, "lords-remote-noldor-boost", width);
    await resume(p);
    // Printed restriction removes the replay action's legal availability in Power of Angmar.
    s = dike();
    s.discard = [A.light];
    s.staging.push(make(s, DIKE.power));
    await load(p, s);
    await piles(p);
    const blocked = p.getByRole("button", {
      name: "Play Elven-light from discard",
      exact: true,
    });
    assert.ok(await blocked.isDisabled());
    assert.match(await blocked.getAttribute("title"), /Power of Angmar/);
    await shot(p, "discard-replay-power-blocked", width);
    // Jeweler's hand Action preserves the physical ally while paying two actual hand cards.
    s = angmarFixture();
    const jeweler = angmarHand(s, A.jeweler),
      one = angmarHand(s, "01020"),
      two = angmarHand(s, "01021");
    const resources = s.heroes.map((h) => h.resources);
    await load(p, s);
    await p
      .locator(`[data-motion-card="${jeweler.id}"]`)
      .getByRole("button", {
        name: "Discard 2 hand cards · Put Elven Jeweler into play",
        exact: true,
      })
      .click();
    await shot(p, "jeweler-first-discard-choice", width);
    await resume(p);
    await choose(p, one.id);
    await shot(p, "jeweler-second-discard-choice", width);
    s = await choose(p, two.id);
    s = await settle(p);
    assert.ok(s.allies.some((u) => u.id === jeweler.id));
    assert.deepEqual(s.discard, ["01020", "01021"]);
    assert.deepEqual(
      s.heroes.map((h) => h.resources),
      resources,
    );
    await shot(p, "jeweler-physical-ally-enters", width);
    s = angmarFixture();
    angmarHand(s, A.jeweler);
    angmarHand(s, "01020");
    await load(p, s);
    const unavailableJeweler = p.getByRole("button", {
      name: "Discard 2 hand cards · Put Elven Jeweler into play",
      exact: true,
    });
    assert.ok(await unavailableJeweler.isDisabled());
    await shot(p, "jeweler-insufficient-hand", width);
    // Sword-thain changes the effective in-play card type and resource UI, leaving the printed card intact.
    s = angmarFixture();
    const lindir = angmarAlly(s, A.lindir),
      sword = angmarHand(s, A.thain);
    await load(p, s);
    s = await play(p, sword.id, lindir.id);
    assert.ok(isHero(get(s, lindir.id)));
    assert.ok(s.heroes.some((h) => h.id === lindir.id));
    const promoted = p.locator(`[data-motion-card="${lindir.id}"]`);
    assert.ok((await promoted.getAttribute("class")).includes("hero-card"));
    assert.ok(
      await promoted
        .locator('[data-token="resource"], [aria-label*="resource"]')
        .count(),
    );
    await promoted.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(p, "sword-thain-effective-hero", width);
    s = await resume(p);
    assert.ok(isHero(get(s, lindir.id)));
    s.phase = "refresh";
    const startResources = get(s, lindir.id).resources;
    await load(p, s);
    await next(p);
    s = await settle(p);
    assert.equal(get(s, lindir.id).resources, startResources + 1);
    await p
      .locator(`[data-motion-card="${lindir.id}"]`)
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(p, "sword-thain-resource-round", width);
    const faces = ANGMAR_PLAYER_CARDS.map(imageUrl),
      broken = await p.evaluate(
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
    checks.push(`${faces.length} original player faces decoded at ${width}`);
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
    `Angmar players: ${screenshots.length} browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        entries: [...entries],
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
