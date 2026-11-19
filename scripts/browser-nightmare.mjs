import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { revealed } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { make } from "../src/game/core.ts";
import {
  NIGHTMARE_CORE as N,
  NIGHTMARE_SOM as G,
} from "../src/game/nightmare.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
  opening,
  report,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/nightmare-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/nightmare-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
try {
  for (const width of [1280, 390, 320]) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    // Passage Through Mirkwood in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
      localStorage.setItem("there-and-back-again.mode.v1", "normal");
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-mirkwood").click();
    await page.locator(".easy-toggle input").setChecked(true);
    const nightmare = page.locator(".nightmare-toggle input");
    await nightmare.setChecked(true);
    assert.equal(await page.locator(".easy-toggle input").isChecked(), false);
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    let s = await opening(page);
    assert.equal(s.scenarioId, "mirkwood");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.easyMode, undefined);
    const names = s.staging.map((u) => card(u.code).name);
    assert.ok(names.includes("Forest Spider"), names.join());
    assert.ok(names.includes("Old Forest Road"), names.join());
    // The setup card's reveal (a revealed treachery leaves the staging area).
    assert.ok(
      s.log.some((l) => /^Revealed /.test(l.text)),
      "the setup card's reveal",
    );
    // The Nightmare card in the quest inspector, its rules side first.
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/each player revealed 1 card/)
      .waitFor();
    await checkpoint("nightmare-card", width);
    await page
      .getByRole("button", {
        name: "Nightmare card · Passage Through Mirkwood",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByText(/You are playing Nightmare mode\./)
      .first()
      .waitFor();
    await checkpoint("nightmare-detail", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // The Spider's Web: the highest-threat player's heroes are exhausted, and
    // it attaches to one of them.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "staging", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      revealed(t, N.web);
      flush(t);
      s = await load(page, t);
    }
    assert.match(
      s.choice.title,
      /^The Spider's Web · Attach it to one of your heroes/,
    );
    await checkpoint("spiders-web", width);
    s = await choose(page, s.heroes[0].id);
    assert.ok(s.heroes[0].attachments.some((a) => a.code === N.web));
    assert.ok(s.heroes.every((h) => h.exhausted));
    // Journey Along the Anduin in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-anduin").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "anduin");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Troll enemies cannot have attachments/)
      .waitFor();
    await checkpoint("anduin-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Gladden Marshlands' Action: a hero takes 1 damage, and its threat drops
    // by 1 until the end of the phase.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = t.staging.filter((u) => u.code !== N.marshlands);
      t.staging.push(make(t, N.marshlands));
      s = await load(page, t);
    }
    await page
      .getByRole("button", {
        name: "Deal 1 damage to a hero to reduce its threat",
        exact: true,
      })
      .click();
    s = await saved(page);
    assert.match(s.choice.title, /^Gladden Marshlands · Deal 1 damage/);
    await checkpoint("gladden-marshlands", width);
    s = await choose(page, s.heroes[0].id);
    assert.equal(s.staging.find((u) => u.code === N.marshlands).tempThreat, -1);
    assert.equal(s.heroes[0].damage, 1);
    // Escape from Dol Guldur in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-dol-guldur").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "dol-guldur");
    assert.equal(s.nightmareMode, true);
    assert.ok(s.prisoner);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/1 random hero is captured/)
      .waitFor();
    await checkpoint("dol-guldur-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A second prisoner (Torture Master's shadow) joins the prison banner.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const hero = t.heroes.shift();
      hero.owner = 0;
      t.nightmare = { ...(t.nightmare ?? {}), prisoners: [hero] };
      s = await load(page, t);
    }
    await page
      .locator(".prisoner-banner")
      .getByText(/ and .+ are imprisoned$/)
      .waitFor();
    assert.equal(
      await page.locator(".game-mode-label").innerText(),
      "Nightmare mode",
    );
    await checkpoint("dol-guldur-prisoners", width);
    // The Hunt for Gollum in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-hunt-for-gollum").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "hunt-for-gollum");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/4 Clues on Mordor enemies/)
      .waitFor();
    await checkpoint("gollum-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Clue attached to (and guarded by) Hunters from Mordor.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = t.staging.filter((u) => u.code !== "02021");
      const hunters = make(t, "02021");
      hunters.attachments.push({
        id: `a${t.nextId++}`,
        code: "02014",
        exhausted: false,
      });
      t.staging.push(hunters);
      s = await load(page, t);
    }
    await page
      .getByLabel("Attachments on Hunters from Mordor", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Signs of Gollum",
        exact: true,
      })
      .waitFor();
    await checkpoint("gollum-clue-hunters", width);
    // Conflict at the Carrock in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-conflict-at-the-carrock").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "conflict-at-the-carrock");
    assert.equal(s.nightmareMode, true);
    for (const code of [G.robBob, G.louis, G.morris, G.rupert, G.stuart])
      assert.ok(!s.encounterDeck.includes(code), code);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/5 unique Trolls were set aside/)
      .waitFor();
    await checkpoint("carrock-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 3, Grimbeorn's Folly: Rob & Bob in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 3;
      t.progress = 0;
      t.staging = [make(t, G.robBob), make(t, G.savage)];
      t.victoryCards = [G.stuart];
      t.victory = 2;
      s = await load(page, t);
    }
    const folly = page
      .getByRole("button", { name: "Inspect quest: Grimbeorn's Folly" })
      .locator("img");
    await folly.waitFor();
    assert.ok(
      (await folly.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "stage 3's face loads",
    );
    await page
      .locator(".journey-area .tabletop-label")
      .getByText("3 / 3")
      .waitFor();
    await page
      .locator(".journey-area .quest-goals")
      .getByText("Defeat Rob & Bob to rescue Grimbeorn the Old")
      .waitFor();
    await checkpoint("carrock-grimbeorns-folly", width);
    // A Journey to Rhosgobel in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-journey-to-rhosgobel").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "journey-to-rhosgobel");
    assert.equal(s.nightmareMode, true);
    assert.equal(
      s.staging.filter((u) => u.code === G.eagleHunter).length,
      1,
      "the setup's Goblin Eagle-hunter",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Goblin Eagle-hunter began in the staging area/)
      .waitFor();
    await checkpoint("rhosgobel-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Noxious Supplies on Wilyador.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const eagle = t.allies.find((u) => u.code.endsWith("9019"));
      eagle.attachments.push({
        id: `a${t.nextId++}`,
        code: G.noxious,
        exhausted: false,
      });
      s = await load(page, t);
    }
    await page
      .getByLabel("Attachments on Wilyador", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Noxious Supplies",
        exact: true,
      })
      .waitFor();
    await checkpoint("rhosgobel-noxious-supplies", width);
    // The Hills of Emyn Muil in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-hills-of-emyn-muil").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "hills-of-emyn-muil");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/no more than 1 progress may be placed on each location/)
      .waitFor();
    await checkpoint("emyn-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Orc Interceptor with resource tokens in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const orc = make(t, G.interceptor);
      orc.resources = 3;
      t.staging.push(orc);
      s = await load(page, t);
    }
    assert.equal(s.staging.find((u) => u.code === G.interceptor).resources, 3);
    await page.getByLabel("3 resources", { exact: true }).first().waitFor();
    await checkpoint("emyn-orc-interceptor", width);
    // The Dead Marshes in Nightmare mode, from the lobby.
    await page.evaluate(() => {
      for (const k of [
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
    });
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page.locator(".mission-dead-marshes").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await opening(page);
    assert.equal(s.scenarioId, "dead-marshes");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.staging.some((u) => u.code === G.mere),
      "The Mere of Dead Faces",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/players cannot reduce their threat/)
      .waitFor();
    await checkpoint("dead-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Swarming Mosquitoes' escape test counts [defense]; the Mere holds 3
    // tokens.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "staging", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging.find((u) => u.code === G.mere).resources = 3;
      t.escapeTest = {
        phase: "actions",
        source: G.mosquitoes,
        participants: [0],
        cursor: 1,
        committedIds: [],
        count: 2,
        attack: false,
        capture: false,
        continuation: [],
        stat: "defense",
      };
      s = await load(page, t);
    }
    await page
      .getByLabel("Escape test", { exact: true })
      .getByText(/committed defense · 2 escape cards/)
      .waitFor();
    await page.getByLabel("3 resources", { exact: true }).first().waitFor();
    await checkpoint("dead-mosquitoes-escape", width);
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const a of art) {
    const r = await p.request.get(new URL(a.localPath, url).href);
    assert.equal(r.status(), 200);
    const bytes = await r.body();
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const size = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const size = { width: b.width, height: b.height };
        b.close();
        return size;
      },
      [...bytes],
    );
    assert.ok(size.width > 0 && size.height > 0);
    artwork.push({ ...a, ...size });
  }
  await p.close();
  await report(dir, {
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    artwork,
  });
  console.log(
    `The Nightmare browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
  );
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
    await fs.writeFile(
      `${dir}/failure.json`,
      JSON.stringify(
        {
          error: String(error),
          stack: error.stack,
          state: await saved(page).catch(() => null),
          errors,
          checks,
        },
        null,
        2,
      ),
    );
  }
  throw error;
} finally {
  await browser.close();
}
