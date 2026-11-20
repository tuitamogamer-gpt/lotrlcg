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
  NIGHTMARE_DD as DW,
  NIGHTMARE_HON as HON,
  NIGHTMARE_AS as AS,
  NIGHTMARE_KD as K,
  NIGHTMARE_OHUH as OHUH,
  NIGHTMARE_OTD as OTD,
  NIGHTMARE_VOI as VOI,
  NIGHTMARE_RINGMAKER as RM,
  NIGHTMARE_SOM as G,
} from "../src/game/nightmare.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { mainQuestCode } from "../src/game/quest-state.ts";
import { RETURN } from "../src/game/return-mirkwood.ts";
import { ROAD } from "../src/game/road-rivendell.ts";
import { WATCHER_WATER } from "../src/game/watcher-water-support.ts";
import { AMON_DIN } from "../src/game/amon-din-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
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
/**
 * The shared helpers' opening, which also resolves an escape test revealed
 * during setup (The Dead Marshes' The Lights of the Dead, for one).
 */
async function nightmareOpening(p) {
  // A setup choice spares the escorted Arwen Undómiel (her loss ends Road to
  // Rivendell and The Redhorn Gate) when another option is offered.
  const spare = (o) =>
    !o.code ||
    card(o.code)?.type_code !== "objective-ally" ||
    !card(o.code).name.startsWith("Arwen");
  for (let i = 0; i < 300; i++) {
    await reviewedState(p);
    const s = await saved(p);
    assert.equal(s.status, "playing", "The Nightmare opening keeps the game");
    if (s.choice)
      await choose(
        p,
        s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options.find((o) => o.id === "skip")?.id ??
          // Followed by Night: no enemy is engaged at setup, so its attacks
          // spare Arwen the damage a second copy would make lethal.
          s.choice.options.find((o) => o.id === "attacks")?.id ??
          (s.choice.options.find(spare) ?? s.choice.options[0]).id,
      );
    else if (s.escapeTest && s.escapeTest.phase !== "committing")
      await p
        .getByRole("button", { name: /^(Begin|Resolve) escape test/ })
        .first()
        .click();
    else if (s.phase === "setup")
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await p.waitForTimeout(25);
  }
  throw Error("The Nightmare opening did not finish");
}
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
    let s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    s = await nightmareOpening(page);
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
    // Return to Mirkwood in Nightmare mode, from the lobby.
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
    await page.locator(".mission-return-to-mirkwood").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "return-to-mirkwood");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.allies.some((u) => u.code === RETURN.gollum),
      "Gollum's guard",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/exhausts a hero or resolves the topmost Tantrum/)
      .waitFor();
    await checkpoint("rtm-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Isolation on the current quest.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.questAttachments = {
        [mainQuestCode(t)]: [
          { id: `a${t.nextId++}`, code: G.isolation, exhausted: false },
        ],
      };
      s = await load(page, t);
    }
    await page
      .getByRole("complementary", { name: "Quest and active location" })
      .getByLabel("Attachments on Through the Forest", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Isolation",
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByRole("dialog", { name: "Through the Forest", exact: true })
      .getByLabel("Attachments on Through the Forest", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Isolation",
        exact: true,
      })
      .waitFor();
    await checkpoint("rtm-isolation", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // The quest phase begins: Gollum's guard exhausts a hero or resolves
    // the topmost Tantrum, Gollum's Anguish.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "quest", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      delete t.questAttachments;
      t.encounterDiscard = [RETURN.anguish];
      t.queue.push({ kind: "nrmQuestBegin", player: 0 });
      flush(t);
      s = await load(page, t);
    }
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Resolve Gollum's Anguish's / })
      .waitFor();
    await checkpoint("rtm-quest-begin", width);
    {
      const threat = s.threat;
      s = await choose(page, "tantrum");
      assert.equal(s.threat, threat + 8);
      assert.deepEqual(s.encounterDiscard, [RETURN.anguish]);
    }
    // Into the Pit in Nightmare mode, from the lobby.
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
    await page.locator(".mission-into-the-pit").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "into-the-pit");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.heroes.some((h) => h.attachments.some((a) => a.code === KHAZAD.torch)),
      "Cave Torch",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/0 of 5 damage tokens on the setup card/)
      .waitFor();
    await checkpoint("pit-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2, Goblin Ambush: Shadow-Fall on First Hall, 3 damage tokens.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 1;
      t.nightmare = { ...(t.nightmare ?? {}), torchDamage: 3 };
      const hall = make(t, KHAZAD.hall);
      hall.attachments.push({
        id: `a${t.nextId++}`,
        code: K.shadowFall,
        exhausted: false,
      });
      t.staging = [hall, make(t, K.sentry)];
      s = await load(page, t);
    }
    const ambush = page
      .getByRole("button", { name: "Inspect quest: Goblin Ambush" })
      .locator("img");
    await ambush.waitFor();
    assert.ok(
      (await ambush.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Goblin Ambush's face loads",
    );
    await page
      .getByLabel("Quest progress: 1 of 2", { exact: true })
      .first()
      .waitFor();
    await page
      .locator(".journey-area .quest-goals")
      .getByText("Defeat 2 enemies (1 quest progress each)")
      .waitFor();
    await page
      .getByLabel("Attachments on First Hall", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Shadow-Fall",
        exact: true,
      })
      .waitFor();
    await checkpoint("pit-goblin-ambush", width);
    // The Seventh Level in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-seventh-level").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-seventh-level");
    assert.equal(s.nightmareMode, true);
    for (const code of [K.maurul, K.chamber])
      assert.ok(!s.encounterDeck.includes(code), code);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/set aside until stage 2B is revealed/)
      .waitFor();
    await checkpoint("seventh-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2B: Chamber of Records, Overseer Maurûl and a Pit Goblin with 3
    // resources.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 0;
      t.activeLocation = make(t, K.chamber);
      delete t.extraActiveLocations;
      const goblin = make(t, K.pitGoblin);
      goblin.resources = 3;
      t.staging = [make(t, K.maurul), goblin];
      for (const h of t.heroes)
        h.attachments = h.attachments.filter((a) => a.code !== KHAZAD.book);
      s = await load(page, t);
    }
    await page
      .getByRole("button", {
        name: "Inspect active location: Chamber of Records",
        exact: true,
      })
      .waitFor();
    await page.getByLabel("3 resources", { exact: true }).first().waitFor();
    await page
      .locator(".journey-area .quest-goals")
      .getByText("Overseer Maurûl in the victory display")
      .waitFor();
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/cannot win unless Overseer Maurûl is in the victory display/)
      .waitFor();
    await checkpoint("seventh-chamber-of-records", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Flight from Moria in Nightmare mode, from the lobby.
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
    await page.locator(".mission-flight-from-moria").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "flight-from-moria");
    assert.equal(s.nightmareMode, true);
    {
      const routes = [s.khazad.activeQuest, ...s.khazad.questDeck];
      for (const code of [K.ghash, K.flame, K.pursued])
        assert.ok(routes.includes(code), code);
      assert.ok(!routes.includes(KHAZAD.blocked), "Blocked by Shadow");
    }
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/replace Blocked by Shadow in the quest deck/)
      .waitFor();
    await checkpoint("flight-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    /** The board on route `code`, turned to side 2B. */
    const flightRoute = (code, change) => {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const k = t.khazad;
      k.questDeck = [k.activeQuest, ...k.questDeck].filter((c) => c !== code);
      k.activeQuest = code;
      k.questSide = "B";
      t.stage = 2;
      t.progress = 0;
      t.staging = t.staging.filter((u) => u.code === KHAZAD.nameless);
      change(t);
      return t;
    };
    // Blocked by Flame: The Nameless Fear has 4 damage; a Coal-Black Orc.
    s = await load(
      page,
      flightRoute(K.flame, (t) => {
        t.staging[0].damage = 4;
        t.staging.push(make(t, K.coalBlack));
      }),
    );
    const flame = page
      .getByRole("button", { name: "Inspect quest: Blocked by Flame" })
      .locator("img");
    await flame.waitFor();
    assert.ok(
      (await flame.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Blocked by Flame's face loads",
    );
    await page
      .locator(".journey-area .quest-goals")
      .getByText("Blocked by Flame · The Nameless Fear has 4/10 damage")
      .waitFor();
    await checkpoint("flight-blocked-by-flame", width);
    // Pursued by Shadow: 1 progress placed this round.
    s = await load(
      page,
      flightRoute(K.pursued, (t) => {
        t.progress = 1;
        t.nightmare = {
          ...(t.nightmare ?? {}),
          pursued: { round: t.round, amount: 1 },
        };
      }),
    );
    await page
      .getByLabel("Quest progress: 1 of 5", { exact: true })
      .first()
      .waitFor();
    await page
      .locator(".journey-area .quest-goals")
      .getByText("Escape at 5 progress · no more than 1 each round")
      .waitFor();
    await checkpoint("flight-pursued-by-shadow", width);
    // The Redhorn Gate in Nightmare mode, from the lobby.
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
    await page.locator(".mission-redhorn-gate").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "redhorn-gate");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.nightmare?.blizzards, 2);
    assert.ok(!s.encounterDeck.includes(DW.blizzard), "Blinding Blizzard");
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Blinding Blizzard is set aside until stage 2B/)
      .waitFor();
    await checkpoint("redhorn-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2B: a Blinding Blizzard with 3 progress, a Snow-Giant and an Icy
    // Cavern in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 0;
      delete t.nightmare.blizzards;
      const blizzard = make(t, DW.blizzard);
      blizzard.progress = 3;
      t.staging = [blizzard, make(t, DW.giant), make(t, DW.cavern)];
      s = await load(page, t);
    }
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Blinding Blizzard · 3/5 progress (it takes the progress for the quest and Snow locations)",
      )
      .waitFor();
    const blizzardFace = page
      .locator(`img[src*="${DW.blizzard.slice("octgn:".length)}"]`)
      .first();
    await blizzardFace.waitFor();
    assert.ok(
      (await blizzardFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Blinding Blizzard's face loads",
    );
    await checkpoint("redhorn-blinding-blizzard", width);
    // Road to Rivendell in Nightmare mode, from the lobby.
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
    await page.locator(".mission-road-to-rivendell").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "road-to-rivendell");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/stage 2 is Ambush in the Night/)
      .waitFor();
    await checkpoint("rivendell-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2B, Ambush in the Night: Goblin Gate guards Arwen Undómiel.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 0;
      const arwen = t.allies.find((u) => u.code === ROAD.arwen);
      t.allies = t.allies.filter((u) => u.code !== ROAD.arwen);
      t.nightmare = { ...(t.nightmare ?? {}), arwen };
      const gate = make(t, ROAD.gate);
      gate.attachments.push({
        id: `a${t.nextId++}`,
        code: ROAD.arwen,
        exhausted: false,
      });
      t.staging = [gate];
      s = await load(page, t);
    }
    const night = page
      .getByRole("button", { name: "Inspect quest: Ambush in the Night" })
      .locator("img");
    await night.waitFor();
    assert.ok(
      (await night.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Ambush in the Night's face loads",
    );
    await page
      .getByLabel("Attachments on Goblin Gate", { exact: true })
      .getByRole("button", {
        name: "Inspect attachment: Arwen Undómiel",
        exact: true,
      })
      .waitFor();
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Explore Goblin Gate to free Arwen Undómiel (no progress on this stage until then)",
      )
      .waitFor();
    await checkpoint("rivendell-ambush-in-the-night", width);
    // The Watcher in the Water in Nightmare mode, from the lobby.
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
    await page.locator(".mission-watcher-in-the-water").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "watcher-in-the-water");
    assert.equal(s.nightmareMode, true);
    assert.deepEqual(
      s.watcherWater.setAside.slice().sort(),
      [DW.watcher, WATCHER_WATER.doors].sort(),
    );
    assert.ok(!s.encounterDeck.includes(DW.watcher), "The Watcher set aside");
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/The Watcher cannot be engaged/)
      .waitFor();
    await checkpoint("watcher-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2, The Seething Lake: the Nightmare Deck's The Watcher in the
    // staging area, Doors of Durin active, a Writhing Tentacle on a hero.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 0;
      t.watcherWater.setAside = [];
      t.activeLocation = make(t, WATCHER_WATER.doors);
      t.staging = [make(t, DW.watcher), make(t, DW.banks)];
      t.heroes[0].attachments.push({
        id: `a${t.nextId++}`,
        code: DW.writhing,
        exhausted: false,
      });
      s = await load(page, t);
    }
    const watcherFace = page
      .locator(`img[src*="${DW.watcher.slice("octgn:".length)}"]`)
      .first();
    await watcherFace.waitFor();
    assert.ok(
      (await watcherFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "The Watcher's face loads",
    );
    for (const goal of [
      "Open Doors of Durin, then defeat The Watcher (both in the victory display)",
      "Writhing Tentacle: its character cannot commit to the quest",
    ])
      await page
        .locator(".journey-area .quest-goals")
        .getByText(goal, { exact: true })
        .waitFor();
    await checkpoint("watcher-seething-lake", width);
    // The Long Dark in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-long-dark").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-long-dark");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Durin's Greaves gains surge/)
      .waitFor();
    await checkpoint("longdark-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Lost and Helpless on a hero, Trapdoor Spider and Eastern Mines in the
    // staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [make(t, DW.trapdoor), make(t, DW.mines)];
      t.heroes[1].attachments.push({
        id: `a${t.nextId++}`,
        code: DW.helpless,
        exhausted: false,
      });
      s = await load(page, t);
    }
    const spiderFace = page
      .locator(`img[src*="${DW.trapdoor.slice("octgn:".length)}"]`)
      .first();
    await spiderFace.waitFor();
    assert.ok(
      (await spiderFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Trapdoor Spider's face loads",
    );
    for (const goal of [
      "Lost: the first player discards an ally in play (the Nightmare setup card)",
      `Lost and Helpless: Lost discards ${card(s.heroes[1].code).name}`,
    ])
      await page
        .locator(".journey-area .quest-goals")
        .getByText(goal, { exact: true })
        .waitFor();
    await checkpoint("longdark-lost-and-helpless", width);
    // Foundations of Stone in Nightmare mode, from the lobby.
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
    await page.locator(".mission-foundations-of-stone").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "foundations-of-stone");
    assert.equal(s.nightmareMode, true);
    for (const code of [DW.unspeakable, DW.primeval, DW.nest])
      assert.ok(s.foundationsStone.setAside.includes(code), code);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/when stage 3B is revealed/)
      .waitFor();
    await checkpoint("foundations-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // An Unspeakable Thing fed two cards, and a Mithril Seeker with a resource.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const thing = make(t, DW.unspeakable);
      for (const code of t.deck.splice(0, 2))
        thing.attachments.push({
          id: `a${t.nextId++}`,
          code,
          owner: 0,
          exhausted: false,
          namelessCard: true,
        });
      const seeker = make(t, DW.seeker);
      seeker.resources = 1;
      t.staging = [thing, seeker];
      s = await load(page, t);
    }
    const thingFace = page
      .locator(`img[src*="${DW.unspeakable.slice("octgn:".length)}"]`)
      .first();
    await thingFace.waitFor();
    assert.ok(
      (await thingFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Unspeakable Thing's face loads",
    );
    await page
      .getByLabel("Attachments on Unspeakable Thing", { exact: true })
      .waitFor();
    await checkpoint("foundations-unspeakable-thing", width);
    // Shadow and Flame in Nightmare mode, from the lobby.
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
    await page.locator(".mission-shadow-and-flame").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "shadow-and-flame");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.nightmare.balrogDeck.length, 10, "the Balrog deck");
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/shadow cards come from the Balrog deck/)
      .waitFor();
    await checkpoint("shadowflame-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Servant of Flame and a Captain of Mordor with Durin's Bane, two cards
    // in the Balrog discard pile.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.nightmare.balrogDiscard = t.nightmare.balrogDeck.splice(0, 2);
      t.staging = [
        ...t.staging.filter((u) => card(u.code).name === "Durin's Bane"),
        make(t, DW.servant),
        make(t, DW.captain),
      ];
      s = await load(page, t);
    }
    const servantFace = page
      .locator(`img[src*="${DW.servant.slice("octgn:".length)}"]`)
      .first();
    await servantFace.waitFor();
    assert.ok(
      (await servantFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Servant of Flame's face loads",
    );
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Balrog deck · 8 shadow cards for Durin’s Bane, 2 in its discard pile",
        { exact: true },
      )
      .waitFor();
    await checkpoint("shadowflame-balrog-deck", width);
    // Peril in Pelargir in Nightmare mode, from the lobby.
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
    await page.locator(".mission-peril-in-pelargir").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "peril-in-pelargir");
    assert.equal(s.nightmareMode, true);
    const SCROLL = "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9001";
    assert.ok(
      s.heroes.some((h) => h.attachments.some((a) => a.code === SCROLL)),
      "Alcaron's Scroll on a hero",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/escapes with the scroll, and the players lose/)
      .waitFor();
    await checkpoint("pelargir-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Alcaron's Scroll on a Harbor Brute with 2 progress tokens, a Cunning
    // Informant beside it.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const bearer = t.heroes.find((h) =>
        h.attachments.some((a) => a.code === SCROLL),
      );
      const scroll = bearer.attachments.find((a) => a.code === SCROLL);
      bearer.attachments = bearer.attachments.filter((a) => a !== scroll);
      delete scroll.owner;
      const brute = make(t, HON.brute);
      brute.attachments.push(scroll);
      brute.progress = 2;
      t.staging = [...t.staging, brute, make(t, HON.informant)];
      s = await load(page, t);
    }
    const bruteFace = page
      .locator(`img[src*="${HON.brute.slice("octgn:".length)}"]`)
      .first();
    await bruteFace.waitFor();
    assert.ok(
      (await bruteFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Harbor Brute's face loads",
    );
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Alcaron’s Scroll · Harbor Brute has 2 of 3 progress tokens (at 3 it escapes and the players lose)",
        { exact: true },
      )
      .waitFor();
    await checkpoint("pelargir-escaping-scroll", width);
    // Into Ithilien in Nightmare mode, from the lobby.
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
    await page.locator(".mission-into-ithilien").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "into-ithilien");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.nightmare.eliteAside, 2, "both Mûmak Elites set aside");
    assert.ok(!s.encounterDeck.includes(HON.elite));
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/both Mûmak Elites were set aside/)
      .waitFor();
    await checkpoint("ithilien-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Stage 2: a Mûmak Elite in the staging area with a Haradrim Marksman,
    // the other still set aside.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.stage = 2;
      t.progress = 0;
      t.nightmare.eliteAside = 1;
      t.staging = [...t.staging, make(t, HON.elite), make(t, HON.marksman)];
      s = await load(page, t);
    }
    const eliteFace = page
      .locator(`img[src*="${HON.elite.slice("octgn:".length)}"]`)
      .first();
    await eliteFace.waitFor();
    assert.ok(
      (await eliteFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Mûmak Elite's face loads",
    );
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Mûmak Elite · 1 set aside (one enters the staging area as each of stages 2A and 4A is revealed)",
        { exact: true },
      )
      .waitFor();
    await checkpoint("ithilien-mumak-elite", width);
    // The Siege of Cair Andros in Nightmare mode, from the lobby.
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
    await page.locator(".mission-siege-of-cair-andros").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "siege-of-cair-andros");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/contribute no victory points/)
      .waitFor();
    await checkpoint("siege-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Besieged Courtyard with 3 damage and an Orc Saboteur beside the
    // scenario's Battlegrounds.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const courtyard = make(t, HON.courtyard);
      courtyard.damage = 3;
      t.staging = [...t.staging, courtyard, make(t, HON.saboteur)];
      s = await load(page, t);
    }
    const courtyardFace = page
      .locator(`img[src*="${HON.courtyard.slice("octgn:".length)}"]`)
      .first();
    await courtyardFace.waitFor();
    assert.ok(
      (await courtyardFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Besieged Courtyard's face loads",
    );
    await page
      .locator(".journey-area .quest-goals")
      .getByText(
        "Nightmare Battlegrounds · Besieged Courtyard 3/5 damage before each is discarded",
        { exact: true },
      )
      .waitFor();
    await checkpoint("siege-besieged-courtyard", width);
    // The Steward's Fear in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-stewards-fear").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-stewards-fear");
    assert.equal(s.nightmareMode, true);
    {
      const q = s.stewardFear;
      const under = [
        ...q.underworldDeck,
        ...Object.values(q.underneath).flat(),
      ];
      assert.equal(
        under.filter((c) => c === AS.turncoat || c === AS.accusations).length,
        5,
        "Murderous Turncoat and False Accusations in the underworld deck",
      );
    }
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/hidden Plot was chosen among 5/)
      .waitFor();
    await checkpoint("steward-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Rise to Power in the staging area with 2 resources.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const q = t.stewardFear;
      if (q.hiddenPlot === AS.rise) delete q.hiddenPlot;
      q.removedHidden = q.removedHidden.filter((c) => c !== AS.rise);
      const rise = make(t, AS.rise);
      rise.resources = 2;
      t.staging = [...t.staging, rise];
      s = await load(page, t);
    }
    const riseFace = page
      .locator(`img[src*="${AS.rise.slice("octgn:".length)}"]`)
      .first();
    await riseFace.waitFor();
    assert.ok(
      (await riseFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Rise to Power's face loads",
    );
    await checkpoint("steward-rise-to-power", width);
    // The Drúadan Forest in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-druadan-forest").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-druadan-forest");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.druadanForest.bossSetAside, AS.boss);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/heroes collect no resources in the resource phase/)
      .waitFor();
    await checkpoint("druadan-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Drúadan Stalker armed with Poison-darts beside a Devil's Mirk.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const stalker = make(t, AS.stalker);
      stalker.attachments.push({
        id: `${stalker.id}:darts:0`,
        code: AS.darts,
        exhausted: false,
      });
      t.staging = [...t.staging, stalker, make(t, AS.mirk)];
      s = await load(page, t);
    }
    const stalkerFace = page
      .locator(`img[src*="${AS.stalker.slice("octgn:".length)}"]`)
      .first();
    await stalkerFace.waitFor();
    assert.ok(
      (await stalkerFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Drúadan Stalker's face loads",
    );
    await page
      .getByLabel("Attachments on Drúadan Stalker", { exact: true })
      .waitFor();
    await checkpoint("druadan-poison-darts", width);
    // Encounter at Amon Dîn in Nightmare mode, from the lobby.
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
    await page.locator(".mission-encounter-at-amon-din").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "encounter-at-amon-din");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.log.some((l) =>
        /1 villager token is placed on Rescued Villagers/.test(l.text),
      ),
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Ghulat cannot take damage unless there are at least 15/)
      .waitFor();
    await checkpoint("amondin-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Those Now Sundered on Rescued Villagers, beside a Besieged Homestead.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const rescued = t.staging.find((u) => u.code === AMON_DIN.rescued);
      rescued.resources = 2;
      rescued.attachments.push({
        id: `${rescued.id}:sundered:${t.nextId++}`,
        code: AS.sundered,
        exhausted: false,
      });
      const homestead = make(t, AS.homestead);
      homestead.resources = 2;
      t.staging = [...t.staging, homestead];
      s = await load(page, t);
    }
    const homesteadFace = page
      .locator(`img[src*="${AS.homestead.slice("octgn:".length)}"]`)
      .first();
    await homesteadFace.waitFor();
    assert.ok(
      (await homesteadFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Besieged Homestead's face loads",
    );
    await page
      .getByLabel("Attachments on Rescued Villagers", { exact: true })
      .waitFor();
    await checkpoint("amondin-those-now-sundered", width);
    // Assault on Osgiliath in Nightmare mode, from the lobby.
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
    await page.locator(".mission-assault-on-osgiliath").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "assault-on-osgiliath");
    assert.equal(s.nightmareMode, true);
    assert.ok(s.staging.some((u) => u.code === AS.palace));
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Palace Remains began in the staging area/)
      .waitFor();
    await checkpoint("osgiliath-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Haradrim Warrior beside Palace Remains with 3 resource tokens.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const palace = t.staging.find((u) => u.code === AS.palace);
      palace.resources = 3;
      t.staging = [...t.staging, make(t, AS.haradrim)];
      s = await load(page, t);
    }
    const warriorFace = page
      .locator(`img[src*="${AS.haradrim.slice("octgn:".length)}"]`)
      .first();
    await warriorFace.waitFor();
    assert.ok(
      (await warriorFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Haradrim Warrior's face loads",
    );
    await checkpoint("osgiliath-haradrim-warrior", width);
    // The Blood of Gondor in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-blood-of-gondor").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-blood-of-gondor");
    assert.equal(s.nightmareMode, true);
    assert.ok(s.staging.some((u) => u.code === AS.numenorean));
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/cannot win unless The Cross-roads/)
      .waitFor();
    await checkpoint("blood-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // An Orc Trickster beside an Edge of Ithilien in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, AS.trickster), make(t, AS.edge)];
      s = await load(page, t);
    }
    const tricksterFace = page
      .locator(`img[src*="${AS.trickster.slice("octgn:".length)}"]`)
      .first();
    await tricksterFace.waitFor();
    assert.ok(
      (await tricksterFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Orc Trickster's face loads",
    );
    await checkpoint("blood-orc-trickster", width);

    // The Morgul Vale in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-morgul-vale").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-morgul-vale");
    assert.equal(s.nightmareMode, true);
    assert.equal(
      s.staging.find((u) => card(u.code).name === "To the Tower")?.progress,
      1,
      "1 progress token on To the Tower at setup",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/1 progress token was placed on To the Tower/)
      .waitFor();
    await checkpoint("morgul-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Sentry of the White Bridge beside an Ephel Dúath in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, AS.sentry), make(t, AS.ephel)];
      s = await load(page, t);
    }
    const sentryFace = page
      .locator(`img[src*="${AS.sentry.slice("octgn:".length)}"]`)
      .first();
    await sentryFace.waitFor();
    assert.ok(
      (await sentryFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Sentry of the White Bridge's face loads",
    );
    await checkpoint("morgul-sentry", width);

    // We Must Away, Ere Break of Day in Nightmare mode, from the lobby.
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
    await page.locator(".mission-we-must-away-ere-break-of-day").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "we-must-away-ere-break-of-day");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.weMustAway.sackDeck.length, 7);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Troll Key and Troll Purse gain surge/)
      .waitFor();
    await checkpoint("wma-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Murder of Crows beside a Comfortable Light in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OHUH.crows), make(t, OHUH.light)];
      s = await load(page, t);
    }
    const crowsFace = page
      .locator(`img[src*="${OHUH.crows.slice("octgn:".length)}"]`)
      .first();
    await crowsFace.waitFor();
    assert.ok(
      (await crowsFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "A Murder of Crows' face loads",
    );
    await checkpoint("wma-murder-of-crows", width);

    // Over the Misty Mountains Grim in Nightmare mode, from the lobby.
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
    await page.locator(".mission-over-the-misty-mountains-grim").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "over-the-misty-mountains-grim");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      [...s.encounterDeck, ...s.mistyMountains.inactiveDeck].includes(
        OHUH.greatGoblin,
      ) || s.staging.some((u) => u.code === OHUH.greatGoblin),
      "the Nightmare Great Goblin is in the Goblin deck",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/no more than 1 Baggins resource/)
      .waitFor();
    await checkpoint("omm-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Goblin Prowler beside a Dark Passages in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OHUH.prowler), make(t, OHUH.passages)];
      s = await load(page, t);
    }
    const prowlerFace = page
      .locator(`img[src*="${OHUH.prowler.slice("octgn:".length)}"]`)
      .first();
    await prowlerFace.waitFor();
    assert.ok(
      (await prowlerFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Goblin Prowler's face loads",
    );
    await checkpoint("omm-goblin-prowler", width);

    // Dungeons Deep and Caverns Dim in Nightmare mode, from the lobby.
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
    await page.locator(".mission-dungeons-deep-and-caverns-dim").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "dungeons-deep-and-caverns-dim");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.nightmare?.lowerGateAside, 1, "The Lower Gate is aside");
    assert.ok(
      !s.encounterDeck.includes(OHUH.lowerGate) &&
        !s.staging.some((u) => u.code === OHUH.lowerGate),
      "The Lower Gate waits for stage 3B",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/Gollum cannot take damage; The Lower Gate is set aside/)
      .waitFor();
    await checkpoint("ddcd-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Wicked Wolf beside a Pine Slopes in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OHUH.wickedWolf), make(t, OHUH.pine)];
      s = await load(page, t);
    }
    const wolfFace = page
      .locator(`img[src*="${OHUH.wickedWolf.slice("octgn:".length)}"]`)
      .first();
    await wolfFace.waitFor();
    assert.ok(
      (await wolfFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Wicked Wolf's face loads",
    );
    await checkpoint("ddcd-wicked-wolf", width);

    // Flies and Spiders in Nightmare mode, from the lobby.
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
    await page.locator(".mission-flies-and-spiders").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "flies-and-spiders");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      [...s.heroes, ...s.allies].some((u) =>
        u.attachments.some((a) => a.poison),
      ),
      "a hero took the setup card's poison",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/gives 1 poison to a hero they control at setup/)
      .waitFor();
    await checkpoint("fas-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // An Attercop beside a Patch of Midnight in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OTD.attercop), make(t, OTD.patch)];
      s = await load(page, t);
    }
    const attercopFace = page
      .locator(`img[src*="${OTD.attercop.slice("octgn:".length)}"]`)
      .first();
    await attercopFace.waitFor();
    assert.ok(
      (await attercopFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Attercop's face loads",
    );
    await checkpoint("fas-attercop", width);

    // The Lonely Mountain in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-lonely-mountain").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-lonely-mountain");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.lonelyMountain.stack.length, 5);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/cannot advance to stage 3 while a card is stacked/)
      .waitFor();
    await checkpoint("tlm-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // Erebor Bats beside a Southern Spur in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OTD.ereborBats), make(t, OTD.spur)];
      s = await load(page, t);
    }
    const batsFace = page
      .locator(`img[src*="${OTD.ereborBats.slice("octgn:".length)}"]`)
      .first();
    await batsFace.waitFor();
    assert.ok(
      (await batsFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Erebor Bats' face loads",
    );
    await checkpoint("tlm-erebor-bats", width);

    // The Battle of Five Armies in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-battle-of-five-armies").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-battle-of-five-armies");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/with 5 \(0 now\) the players lose/)
      .waitFor();
    await checkpoint("bofa-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Gundabad Elite beside an Embattled Valley in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, OTD.elite), make(t, OTD.valley)];
      s = await load(page, t);
    }
    const gundabadFace = page
      .locator(`img[src*="${OTD.elite.slice("octgn:".length)}"]`)
      .first();
    await gundabadFace.waitFor();
    assert.ok(
      (await gundabadFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Gundabad Elite's face loads",
    );
    await checkpoint("bofa-gundabad-elite", width);

    // The Fords of Isen in Nightmare mode, from the lobby.
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
    await page.locator(".mission-fords-of-isen").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "fords-of-isen");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/fewer than 3 cards in hand draws 3 cards/)
      .waitFor();
    await checkpoint("fords-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Dunland Assassin beside a Western Shore in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, VOI.assassin), make(t, VOI.western)];
      s = await load(page, t);
    }
    const assassinFace = page
      .locator(`img[src*="${VOI.assassin.slice("octgn:".length)}"]`)
      .first();
    await assassinFace.waitFor();
    assert.ok(
      (await assassinFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Dunland Assassin's face loads",
    );
    await checkpoint("fords-dunland-assassin", width);

    // To Catch an Orc in Nightmare mode, from the lobby.
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
    await page.locator(".mission-to-catch-an-orc").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "to-catch-an-orc");
    assert.equal(s.nightmareMode, true);
    assert.equal(
      s.catchOrc.decks[0].filter((u) => u.code === VOI.vigilant).length,
      1,
      "a Vigilant Orc hides in the out-of-play deck",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/shuffled a Vigilant Orc into their out-of-play deck/)
      .waitFor();
    await checkpoint("catch-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Methedras Lookout beside a Methedras Peak in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, VOI.lookout), make(t, VOI.peak)];
      s = await load(page, t);
    }
    const lookoutFace = page
      .locator(`img[src*="${VOI.lookout.slice("octgn:".length)}"]`)
      .first();
    await lookoutFace.waitFor();
    assert.ok(
      (await lookoutFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Methedras Lookout's face loads",
    );
    await checkpoint("catch-methedras-lookout", width);

    // Into Fangorn in Nightmare mode, from the lobby.
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
    await page.locator(".mission-into-fangorn").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "into-fangorn");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.engaged.some((u) => /Huorn/.test(card(u.code)?.traits ?? "")),
      "a Huorn is engaged at setup",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/cannot defeat stage 1B or 2B unless Edge of Fangorn/)
      .waitFor();
    await checkpoint("fangorn-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // An Entwood beside a Tangled Forest in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [
        ...t.staging,
        make(t, VOI.entwood),
        make(t, VOI.tangledForest),
      ];
      s = await load(page, t);
    }
    const entwoodFace = page
      .locator(`img[src*="${VOI.entwood.slice("octgn:".length)}"]`)
      .first();
    await entwoodFace.waitFor();
    assert.ok(
      (await entwoodFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Entwood's face loads",
    );
    await checkpoint("fangorn-entwood", width);

    // The Dunland Trap in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-dunland-trap").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-dunland-trap");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/removed the printed standard encounter cards/)
      .waitFor();
    await checkpoint("dunland-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Plains of Dunland beside a Munuv Dûv River in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, RM.plains), make(t, RM.river)];
      s = await load(page, t);
    }
    const plainsFace = page
      .locator(`img[src*="${RM.plains.slice("octgn:".length)}"]`)
      .first();
    await plainsFace.waitFor();
    assert.ok(
      (await plainsFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Plains of Dunland's face loads",
    );
    await checkpoint("dunland-plains", width);

    // The Three Trials in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-three-trials").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-three-trials");
    assert.equal(s.nightmareMode, true);
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/each engaged Guardian enemy contributes its \[threat\]/)
      .waitFor();
    await checkpoint("trials-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Sacred Forest beside a Haunted Pillars in the staging area.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.staging = [...t.staging, make(t, RM.sacred), make(t, RM.pillars)];
      s = await load(page, t);
    }
    const sacredFace = page
      .locator(`img[src*="${RM.sacred.slice("octgn:".length)}"]`)
      .first();
    await sacredFace.waitFor();
    assert.ok(
      (await sacredFace.evaluate(async (i) => {
        await i.decode();
        return i.naturalWidth;
      })) > 0,
      "Sacred Forest's face loads",
    );
    await checkpoint("trials-sacred-forest", width);

    // Trouble in Tharbad in Nightmare mode, from the lobby.
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
    await page.locator(".mission-trouble-in-tharbad").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "trouble-in-tharbad");
    assert.equal(s.nightmareMode, true);
    assert.equal(
      s.threat,
      s.heroes.reduce((n, h) => n + (card(h.code)?.threat ?? 0), 0) + 5,
      "each starting threat is raised by 5",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/starting threat was raised by 5/)
      .waitFor();
    await checkpoint("tharbad-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A City of Spies beside a Dark Pathway watched by a Tharbad Patrol.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const pathway = make(t, RM.pathway);
      pathway.attachments.push({
        id: `a${t.nextId++}`,
        code: RM.patrol,
        exhausted: false,
      });
      t.staging = [...t.staging, make(t, RM.city), pathway];
      s = await load(page, t);
    }
    for (const [code, label] of [
      [RM.city, "City of Spies"],
      [RM.pathway, "Dark Pathway"],
      [RM.patrol, "Tharbad Patrol"],
    ]) {
      const face = page
        .locator(`img[src*="${code.slice("octgn:".length)}"]`)
        .first();
      await face.waitFor();
      assert.ok(
        (await face.evaluate(async (i) => {
          await i.decode();
          return i.naturalWidth;
        })) > 0,
        `${label}'s face loads`,
      );
    }
    await checkpoint("tharbad-city-pathway", width);

    // The Nîn-in-Eilph in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-nin-in-eilph").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-nin-in-eilph");
    assert.equal(s.nightmareMode, true);
    assert.equal(s.stage, 2);
    assert.ok(
      s.staging.some((u) => card(u.code)?.name === "Ancient Marsh-dweller"),
      "Ancient Marsh-dweller joined the staging area at stage 2A",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/advance to stage 2A, Ancient Marsh-dweller joins/)
      .waitFor();
    await checkpoint("nin-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // An Arduous Journey, with a Desolate Meadow and a Peat Bog beside a Swarms of Mosquitoes.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      t.ninEilph.activeQuest = RM.arduous;
      t.staging = [
        ...t.staging,
        make(t, RM.meadow),
        make(t, RM.peat),
        make(t, RM.swarms),
      ];
      s = await load(page, t);
    }
    await page.getByText("An Arduous Journey").first().waitFor();
    for (const [code, label] of [
      [RM.meadow, "Desolate Meadow"],
      [RM.peat, "Peat Bog"],
      [RM.swarms, "Swarms of Mosquitoes"],
    ]) {
      const face = page
        .locator(`img[src*="${code.slice("octgn:".length)}"]`)
        .first();
      await face.waitFor();
      assert.ok(
        (await face.evaluate(async (i) => {
          await i.decode();
          return i.naturalWidth;
        })) > 0,
        `${label}'s face loads`,
      );
    }
    await checkpoint("nin-arduous-journey", width);

    // Celebrimbor's Secret in Nightmare mode, from the lobby.
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
    await page.locator(".mission-celebrimbors-secret").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "celebrimbors-secret");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      ["Bellach", "The Orcs' Search", "The Secret Chamber"].every((n) =>
        s.staging.some((u) => card(u.code)?.name === n),
      ),
      "the scenario's setup",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/in the staging area is reduced to 1/)
      .waitFor();
    await checkpoint("celeb-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A damaged Dusty Labyrinth and a Bones of Hollin beside Bellach's Bodyguard.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const dusty = make(t, RM.dusty);
      dusty.damage = 2;
      t.staging = [
        ...t.staging,
        dusty,
        make(t, RM.bones),
        make(t, RM.bodyguard),
      ];
      t.celebrimbor.stagingLocations = t.staging.map((u) => u.id);
      s = await load(page, t);
    }
    for (const [code, label] of [
      [RM.dusty, "Dusty Labyrinth"],
      [RM.bones, "Bones of Hollin"],
      [RM.bodyguard, "Bellach's Bodyguard"],
    ]) {
      const face = page
        .locator(`img[src*="${code.slice("octgn:".length)}"]`)
        .first();
      await face.waitFor();
      assert.ok(
        (await face.evaluate(async (i) => {
          await i.decode();
          return i.naturalWidth;
        })) > 0,
        `${label}'s face loads`,
      );
    }
    await checkpoint("celeb-dusty-labyrinth", width);

    // The Antlered Crown in Nightmare mode, from the lobby.
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
    await page.locator(".mission-the-antlered-crown").click();
    await page.locator(".nightmare-toggle input").setChecked(true);
    await page.locator("#start-btn").click();
    s = await nightmareOpening(page);
    assert.equal(s.scenarioId, "the-antlered-crown");
    assert.equal(s.nightmareMode, true);
    assert.ok(
      s.staging.some((u) => card(u.code)?.name === "Raven War-camp") &&
        !!s.activeLocation &&
        card(s.activeLocation.code).name === "Dunland Battlefield",
      "the scenario's setup",
    );
    assert.equal(
      s.antlered.ravenDeck.filter((c) => c === RM.horde).length +
        s.staging.filter((u) => u.code === RM.horde).length,
      2,
      "Dunlending Horde joined the Raven deck",
    );
    await page.getByRole("button", { name: /^Inspect quest: / }).click();
    await page
      .getByLabel("Nightmare card", { exact: true })
      .getByText(/locations with time counters cannot be discarded from play/)
      .waitFor();
    await checkpoint("crown-nightmare-card", width);
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    // A Raven Stronghold and a Highlands of Dunland with time counters, and an engaged Dunlending Horde.
    {
      const t = structuredClone(s);
      Object.assign(t, { phase: "planning", choice: null, queue: [] });
      if (t.flow) t.flow.pending = null;
      const stronghold = make(t, RM.stronghold);
      stronghold.timeCounters = 3;
      const highlands = make(t, RM.highlands);
      highlands.timeCounters = 2;
      t.staging = [...t.staging, stronghold, highlands];
      t.engaged = [...t.engaged, make(t, RM.horde)];
      s = await load(page, t);
    }
    for (const [code, label] of [
      [RM.stronghold, "Raven Stronghold"],
      [RM.highlands, "Highlands of Dunland"],
      [RM.horde, "Dunlending Horde"],
    ]) {
      const face = page
        .locator(`img[src*="${code.slice("octgn:".length)}"]`)
        .first();
      await face.waitFor();
      assert.ok(
        (await face.evaluate(async (i) => {
          await i.decode();
          return i.naturalWidth;
        })) > 0,
        `${label}'s face loads`,
      );
    }
    await checkpoint("crown-raven-stronghold", width);
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
