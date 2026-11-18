import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { win } from "../src/game/board.ts";
import { make } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { addQuestProgress } from "../src/game/side-quests.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  ANGMAR,
  angmarCampaignAfterReveal,
  angmarInnocent,
} from "../src/game/angmar-campaign.ts";
import { card } from "../src/game/cards.ts";
import { DIKE } from "../src/game/deadmens-dike-support.ts";
import { CHETWOOD } from "../src/game/chetwood-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, context, report, url } from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/angmar-campaign-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/angmar-campaign-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const CAMPAIGN = "there-and-back-again.campaign.v1";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
const campaign = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), CAMPAIGN);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
/** Load a campaign state into the campaign slot and open the table. */
async function load(s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid campaign fixture");
  await page.evaluate(
    ([key, state]) => {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem("there-and-back-again.mode.v1", "campaign");
      localStorage.setItem("there-and-back-again.campaign-kind.v1", "angmar");
      localStorage.removeItem("there-and-back-again.choices.v1");
    },
    [CAMPAIGN, s],
  );
  await page.reload();
  await page.locator("#start-btn").click();
  await reviewedState(page);
  return campaign();
}
/** Choose an option of the current choice dialog by its id. */
async function choose(id) {
  await reviewedState(page);
  const s = await campaign(),
    index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const o = s.choice.options[index];
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((v) => v.label === o.label).length;
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: new RegExp(
        `^${o.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`,
      ),
    })
    .nth(occurrence)
    .click();
  await reviewedState(page);
  return campaign();
}
/** Keep the opening hand and reach the first action window (`pick` may answer a choice). */
async function opening(pick = () => undefined) {
  for (let i = 0; i < 200; i++) {
    await reviewedState(page);
    const s = await campaign();
    if (s?.choice)
      await choose(
        pick(s) ??
          s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      );
    else if (s?.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (s && !s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("The campaign opening did not finish");
}
/** The chapter is won (after `before` prepares the table): the Campaign Log is updated. */
async function victory(s, before = () => {}) {
  const t = structuredClone(s);
  Object.assign(t, { phase: "planning", choice: null, queue: [] });
  if (t.flow) t.flow.pending = null;
  before(t);
  win(t);
  return load(t);
}
async function record(answers) {
  for (const [label, value] of answers)
    await page.getByLabel(label).selectOption(value);
  await page
    .getByRole("button", { name: "Record the resolution", exact: false })
    .click();
  await reviewedState(page);
  return campaign();
}
/** Continue the campaign, choosing an optional chapter in the interlude. */
async function continueCampaign(chapter, width, before, pick) {
  await page.getByRole("button", { name: /^Continue campaign/ }).click();
  if (chapter) {
    await page
      .getByLabel("Next chapter", { exact: true })
      .selectOption(chapter);
    await checkpoint(`interlude-${chapter}`, width);
  }
  if (before) await before();
  await page.getByRole("button", { name: /^Begin next chapter/ }).click();
  await reviewedState(page);
  return opening(pick);
}
/** A table state at a calm planning window. */
function calmState(s) {
  const t = structuredClone(s);
  Object.assign(t, { phase: "planning", choice: null, queue: [] });
  if (t.flow) t.flow.pending = null;
  return t;
}
/** Play a card from hand through its Play card button. */
async function playFromHand(id) {
  await page
    .locator(`[data-motion-card="${id}"]`)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  const confirm = page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true });
  await confirm.waitFor({ timeout: 3000 }).catch(() => {});
  if (await confirm.count()) await confirm.click();
  await reviewedState(page);
  return campaign();
}
/** Open the quest inspector, wait for a campaign card line and check it. */
async function campaignCard(text, label, width) {
  await page.getByRole("button", { name: /^Inspect quest: / }).click();
  await page
    .getByLabel("Campaign card", { exact: true })
    .getByText(text)
    .waitFor();
  await checkpoint(label, width);
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
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
    // A new Angmar Awakened campaign, started through the lobby.
    await page.evaluate((key) => {
      for (const k of [
        key,
        "there-and-back-again.save.v1",
        "there-and-back-again.choices.v1",
      ])
        localStorage.removeItem(k);
      localStorage.setItem("there-and-back-again.mode.v1", "campaign");
    }, CAMPAIGN);
    await page.reload();
    await page.getByRole("button", { name: /Solo hot-seat/ }).click();
    await page
      .getByRole("group", { name: "Number of players", exact: true })
      .getByRole("button", { name: "1 player", exact: true })
      .click();
    await page
      .getByRole("group", { name: "Campaign", exact: true })
      .getByRole("button", { name: /Angmar Awakened/ })
      .click();
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    await reviewedState(page);
    let s = await campaign();
    assert.equal(s.scenarioId, "intruders-in-chetwood");
    assert.equal(s.campaign.kind, "angmar");
    assert.match(s.choice.title, /may place 4 damage on Protect the Innocent$/);
    await checkpoint("chetwood-choice", width);
    s = await choose("damage");
    assert.equal(angmarInnocent(s).damage, 4);
    s = await opening();
    const iarion = s.allies.find((u) => u.code === CHETWOOD.iarion);
    assert.ok(
      iarion?.attachments.some((a) => a.code === ANGMAR.pendant),
      "Iârion's Pendant on Iârion",
    );
    await campaignCard(
      /^Protect the Innocent has 4 damage/,
      "chetwood-setup",
      width,
    );
    // The resolution notes Protect the Innocent's damage.
    s = await victory(s, (t) => {
      angmarInnocent(t).damage = 6;
    });
    assert.equal(s.campaign.innocent, 6);
    assert.deepEqual(s.campaign.burdens, [ANGMAR.innocent]);
    await page
      .getByText(/Notes · Protect the Innocent: 6 damage/)
      .first()
      .waitFor();
    await page.getByRole("button", { name: /^Continue campaign/ }).waitFor();
    await checkpoint("chetwood-complete", width);
    // The Weather Hills: Protect the Innocent returns with its noted damage,
    // and Mysterious Omens is shuffled into the encounter deck.
    s = await continueCampaign(undefined, width);
    assert.equal(s.scenarioId, "the-weather-hills");
    assert.deepEqual(s.campaign.burdens, [ANGMAR.innocent, ANGMAR.omens]);
    assert.equal(angmarInnocent(s).damage, 6);
    assert.equal(s.encounterDeck.filter((c) => c === ANGMAR.omens).length, 1);
    await campaignCard(
      /^Mysterious Omens is shuffled into the encounter deck/,
      "weather-setup",
      width,
    );
    // Mysterious Omens is defeated: each player may attach a Permanent boon.
    const omensTable = calmState(s);
    omensTable.encounterDeck = omensTable.encounterDeck.filter(
      (c) => c !== ANGMAR.omens,
    );
    const omens = make(omensTable, ANGMAR.omens);
    omensTable.staging.push(omens);
    addQuestProgress(omensTable, omens, 9);
    flush(omensTable);
    s = await load(omensTable);
    assert.equal(
      s.choice.title,
      "Mysterious Omens · You may attach a boon to a hero",
    );
    s = await choose(ANGMAR.hardy);
    const hardyHero = s.heroes[0];
    s = await choose(hardyHero.id);
    assert.ok(
      s.heroes
        .find((h) => h.id === hardyHero.id)
        .attachments.some((a) => a.code === ANGMAR.hardy),
    );
    await campaignCard(
      /^Earned once this chapter is won \(Permanent\): Hardy on /,
      "weather-omens",
      width,
    );
    s = await victory(s, (t) => {
      angmarInnocent(t).damage = 3;
    });
    assert.deepEqual(s.campaign.boons, [ANGMAR.hardy]);
    assert.deepEqual(s.campaign.permanent, {
      [hardyHero.code]: [ANGMAR.hardy],
    });
    assert.deepEqual(s.campaign.burdens, [ANGMAR.innocent]);
    assert.equal(s.campaign.innocent, 3);
    await page
      .getByText(/Notes · Protect the Innocent: 3 damage/)
      .first()
      .waitFor();
    await page
      .getByText(/: Hardy$/)
      .first()
      .waitFor();
    await page.getByRole("button", { name: /^Continue campaign/ }).waitFor();
    await checkpoint("weather-complete", width);
    // Deadmen's Dike: Protect the Innocent with its noted damage, Iârion's
    // Pendant on Iârion, and Hardy back on its hero.
    s = await continueCampaign(undefined, width);
    assert.equal(s.scenarioId, "deadmens-dike");
    assert.equal(angmarInnocent(s).damage, 3);
    assert.ok(
      s.heroes
        .find((h) => h.code === hardyHero.code)
        .attachments.some((a) => a.code === ANGMAR.hardy),
    );
    assert.ok(
      s.allies
        .find((u) => u.code === CHETWOOD.iarion)
        ?.attachments.some((a) => a.code === ANGMAR.pendant),
      "Iârion's Pendant on Iârion",
    );
    await campaignCard(
      /^Protect the Innocent has 3 damage/,
      "dike-setup",
      width,
    );
    // Thaurdir's Spite moves to the hero with the most damage after a
    // Sorcery treachery is revealed.
    const sorceryTable = calmState(s);
    const dikeState = sorceryTable.deadmensDike;
    const thaurdir = dikeState.setAside.find((u) => u.code === DIKE.thaurdir);
    dikeState.setAside = dikeState.setAside.filter((u) => u.id !== thaurdir.id);
    sorceryTable.staging.push(thaurdir);
    sorceryTable.stage = 2;
    thaurdir.attachments.push({
      id: `a${sorceryTable.nextId++}`,
      code: ANGMAR.spite,
      exhausted: false,
    });
    sorceryTable.angmarCards.thaurdir = ANGMAR.spite;
    sorceryTable.heroes[1].damage = 2;
    angmarCampaignAfterReveal(
      sorceryTable,
      sorceryTable.encounterDeck.find(
        (c) =>
          card(c).type_code === "treachery" &&
          (card(c).traits ?? "").includes("Sorcery"),
      ),
    );
    flush(sorceryTable);
    s = await load(sorceryTable);
    assert.ok(s.heroes[1].attachments.some((a) => a.code === ANGMAR.spite));
    await campaignCard(
      /^Thaurdir's Spite is attached to /,
      "dike-thaurdir",
      width,
    );
    // The resolution: Arnor Ravaged takes Protect the Innocent's place,
    // Thaurdir's Spite joins the pool, and the group chooses a boon.
    s = await victory(s, (t) => {
      angmarInnocent(t).damage = 4;
    });
    assert.equal(s.campaign.resolution, "deadmens-dike");
    await page
      .getByRole("button", { name: /^Record the resolution/ })
      .waitFor();
    await checkpoint("dike-resolution", width);
    s = await record([
      [
        "The players as a group select Iârion's Pendant or Amarthiúl's Courage",
        ANGMAR.courage,
      ],
    ]);
    assert.equal(s.campaign.resolution, null);
    assert.deepEqual(s.campaign.boons, [ANGMAR.hardy, ANGMAR.courage]);
    assert.equal(s.campaign.ravaged, true);
    assert.deepEqual(s.campaign.burdens, [ANGMAR.innocent, ANGMAR.spite]);
    await page
      .getByText(/Notes · Arnor Ravaged: 4 damage/)
      .first()
      .waitFor();
    await page.getByText("Arnor Ravaged", { exact: true }).first().waitFor();
    await page.getByText(/is not available in campaign mode yet/).waitFor();
    assert.equal(
      await page.getByText(/Mendor/).count(),
      0,
      "the Mirkwood Paths note stays out of this campaign",
    );
    await checkpoint("dike-complete", width);
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
    `The Angmar Awakened campaign browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
          state: await campaign().catch(() => null),
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
