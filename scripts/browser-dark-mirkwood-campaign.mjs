import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { win } from "../src/game/board.ts";
import { availableAbilities, validateSave } from "../src/game/engine.ts";
import { get } from "../src/game/core.ts";
import { syncSeat } from "../src/game/table.ts";
import { card } from "../src/game/cards.ts";
import { DOM } from "../src/game/dark-mirkwood-campaign.ts";
import { OATH } from "../src/game/the-oath-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, context, report, url } from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/dark-mirkwood-campaign-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/dark-mirkwood-campaign-browser";
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
      localStorage.setItem("there-and-back-again.campaign-kind.v1", "mirkwood");
      localStorage.removeItem("there-and-back-again.choices.v1");
    },
    [CAMPAIGN, s],
  );
  await page.reload();
  await page.locator("#start-btn").click();
  await reviewedState(page);
  return campaign();
}
/** A copy of the state at a quiet action window of the given phase. */
function quiet(s, phase = "planning") {
  const t = structuredClone(s);
  Object.assign(t, { phase, choice: null, queue: [] });
  if (t.flow) t.flow.pending = null;
  return t;
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
    if (s?.choice) await choose(pick(s) ?? s.choice.options[0].id);
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
  const t = quiet(s);
  before(t);
  win(t);
  return load(t);
}
/** Use a card's ability through its button on the table. */
async function ability(unit, attachmentId) {
  const s = await campaign(),
    u = get(s, unit.id);
  const selected = availableAbilities(s, u).find(
    (a) => a.id === attachmentId && !a.disabled,
  );
  assert.ok(selected, "an enabled card ability");
  await page
    .locator(`[data-motion-card="${unit.id}"]`)
    .getByRole("button", { name: selected.label, exact: true })
    .click();
  await reviewedState(page);
  return campaign();
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
const carrier = (s, code) =>
  s.heroes.find((h) => h.attachments.some((a) => a.code === code));
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
    // The Dark of Mirkwood's mini campaign, begun at The Oath from the lobby.
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
      .getByRole("button", { name: /Mirkwood Paths/ })
      .click();
    await page.getByLabel("Mirkwood Paths start").selectOption("the-oath");
    await page.getByText("THE DARK OF MIRKWOOD · PART 1").first().waitFor();
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    await reviewedState(page);
    let s = await campaign();
    assert.equal(s.scenarioId, "the-oath");
    assert.equal(s.campaign.mini, true);
    assert.ok(s.encounterDeck.includes(DOM.stalking), "Stalking Goblin");
    // The Oath's setup: The Power of Spirit on one of the heroes.
    s = await opening((t) =>
      /Choose an Adaptation/.test(t.choice.title) ? DOM.spirit : undefined,
    );
    const spirit = carrier(s, DOM.spirit);
    assert.ok(spirit, "The Power of Spirit");
    await campaignCard(
      /^The Dark of Mirkwood mini campaign · Part 1/,
      "oath-setup",
      width,
    );
    // Its once-per-campaign Action: exhaust the hero, 3 progress on a location.
    {
      const t = quiet(s);
      const trail = { ...t.staging[0], id: `c${t.nextId++}`, code: OATH.trail };
      Object.assign(trail, { progress: 0, damage: 0, attachments: [] });
      t.staging.push(trail);
      s = await load(t);
    }
    const attached = carrier(s, DOM.spirit);
    s = await ability(
      attached,
      attached.attachments.find((a) => a.code === DOM.spirit).id,
    );
    assert.match(s.choice.title, /The Power of Spirit/);
    const trail = s.staging.find((u) => u.code === OATH.trail);
    s = await choose(trail.id);
    assert.equal(s.staging.find((u) => u.id === trail.id).progress, 3);
    assert.ok(s.darkMirkwood.used.includes(DOM.spirit));
    await checkpoint("oath-adaptation", width);
    // The resolution with 6 tokens: Guilty Conscience joins the pool.
    s = await victory(s, (t) => {
      t.darkMirkwood.tokens = 6;
    });
    assert.deepEqual(s.campaign.burdens, [DOM.stalking, DOM.guilty]);
    assert.deepEqual(s.campaign.adaptationsUsed, [DOM.spirit]);
    await page
      .getByText(/Notes · The Power of Spirit \(you\) · Action used/)
      .first()
      .waitFor();
    await page
      .getByText("Guilty Conscience", { exact: true })
      .first()
      .waitFor();
    await checkpoint("oath-complete", width);
    // The Caves of Nibin-Dûm (Part 2): the burdens, the Adaptation and
    // "No Time to Waste!".
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    s = await opening();
    assert.equal(s.scenarioId, "the-caves-of-nibin-dum");
    for (const code of [DOM.stalking, DOM.guilty, DOM.shiny])
      assert.ok(
        [...s.encounterDeck, ...s.encounterDiscard].includes(code) ||
          s.staging.some((u) => u.code === code),
        card(code).name,
      );
    assert.ok(carrier(s, DOM.spirit), "The Power of Spirit returns");
    const noTime = s.hand.find((u) => u.code === DOM.noTime);
    assert.ok(noTime, '"No Time to Waste!" in hand');
    await campaignCard(/^Highest threat: /, "caves-setup", width);
    // "No Time to Waste!": a Quest Action that leaves the game and the
    // Campaign Pool to reduce threat by 3 and reveal an encounter card.
    {
      const t = quiet(s, "quest");
      t.threat = 31;
      t.encounterDeck.unshift(OATH.gate);
      s = await load(t);
    }
    s = await playFromHand(noTime.id);
    assert.match(s.choice.title, /No Time to Waste!/);
    s = await choose("remove");
    for (let i = 0; i < 10 && s.choice; i++)
      s = await choose(s.choice.options[0].id);
    assert.equal(s.threat, 28);
    assert.ok(s.removed.includes(DOM.noTime));
    assert.ok(s.staging.some((u) => u.code === OATH.gate));
    await checkpoint("caves-no-time", width);
    // The resolution under 40 threat: the Ranger is rescued.
    s = await victory(s, (t) => {
      t.threat = 30;
    });
    assert.equal(s.campaign.resolution, "the-caves-of-nibin-dum");
    await page
      .getByLabel(
        /^Ranger Sense: add 1 copy to your deck and to the Campaign Pool\?/,
      )
      .selectOption("add");
    await checkpoint("caves-resolution", width);
    await page
      .getByRole("button", { name: "Record the resolution", exact: false })
      .click();
    await reviewedState(page);
    s = await campaign();
    assert.deepEqual(s.campaign.rangerSense, [0]);
    assert.deepEqual(s.campaign.noTimeToWaste, []);
    await page
      .getByRole("dialog")
      .getByText(/The Dark of Mirkwood mini campaign is complete\./)
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Continue campaign/ }).count(),
      0,
    );
    await checkpoint("campaign-complete", width);
    // The next campaign: each player may shuffle Ranger Sense into their deck.
    await page.goto(new URL("#adventures", url).href);
    await page.reload();
    await page
      .getByRole("group", { name: "Campaign", exact: true })
      .getByRole("button", { name: /Mirkwood Paths/ })
      .click();
    await page.getByLabel("Mirkwood Paths start").selectOption("mirkwood");
    await page
      .getByRole("group", { name: "Ranger Sense legacy" })
      .getByRole("checkbox", { name: "Player 1" })
      .waitFor();
    await checkpoint("ranger-legacy", width);
    await page.getByRole("button", { name: /Start a new campaign/ }).click();
    await page.getByRole("button", { name: /Begin anew/ }).click();
    await reviewedState(page);
    s = await campaign();
    assert.equal(s.scenarioId, "mirkwood");
    assert.deepEqual(s.campaign.rangerSense, [0]);
    assert.equal(
      [...s.deck, ...s.hand.map((u) => u.code)].filter((c) => c === DOM.ranger)
        .length,
      1,
    );
    await checkpoint("ranger-next-campaign", width);
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
    `The Dark of Mirkwood campaign browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
