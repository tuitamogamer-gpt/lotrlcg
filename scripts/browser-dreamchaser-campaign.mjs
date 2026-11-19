import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { win } from "../src/game/board.ts";
import { availableAbilities, validateSave } from "../src/game/engine.ts";
import { get } from "../src/game/core.ts";
import { syncSeat } from "../src/game/table.ts";
import {
  DC,
  GALDOR,
  backFace,
  dcIs,
} from "../src/game/dreamchaser-campaign-support.ts";
import { RAID } from "../src/game/raid-grey-havens-support.ts";
import { STORMCALLER } from "../src/game/stormcaller-support.ts";
import { DEPTHS } from "../src/game/depths-support.ts";
import { VOYAGE } from "../src/game/voyage-belegaer-support.ts";
import { FATE } from "../src/game/fate-numenor-support.ts";
import { card } from "../src/game/cards.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, context, report, url } from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/dreamchaser-campaign-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/dreamchaser-campaign-browser";
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
      localStorage.setItem(
        "there-and-back-again.campaign-kind.v1",
        "dreamchaser",
      );
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
    // A new Dream-chaser campaign, started through the lobby on Hard Mode.
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
      .getByRole("button", { name: /Dream-chaser/ })
      .click();
    await page.getByLabel("Hard or Expert Mode").first().selectOption("hard");
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    await reviewedState(page);
    let s = await campaign();
    assert.equal(s.scenarioId, "voyage-across-belegaer");
    assert.equal(s.campaign.kind, "dreamchaser");
    assert.equal(s.dreamchaser.mode, "hard");
    assert.ok(s.encounterDeck.includes(DC.ominous));
    assert.ok(s.voyageBelegaer.corsairDeck.includes(DC.crowley));
    // The fleet: the Dream-chaser and Duskbringer; their Modification boons.
    s = await opening((t) =>
      /^Prepare the fleet/.test(t.choice.title) &&
      t.choice.options.some((o) => card(o.code).name === "Duskbringer")
        ? t.choice.options.find((o) => card(o.code).name === "Duskbringer").id
        : /Choose a Modification boon for Dream-chaser/.test(t.choice.title)
          ? DC.armor
          : /Choose a Modification boon/.test(t.choice.title)
            ? DC.quarters
            : undefined,
    );
    const fleet = s.allies.filter(
      (u) => card(u.code).type_code === "ship-objective",
    );
    assert.deepEqual(
      fleet.map((u) => card(u.code).name),
      ["Dream-chaser", "Duskbringer"],
    );
    assert.ok(fleet[0].attachments.some((a) => a.code === DC.armor));
    assert.ok(fleet[1].attachments.some((a) => a.code === DC.quarters));
    await campaignCard(/^Campaign Log: 0 unspent XP/, "voyage-setup", width);
    // The resolution: XP for the campaign card's bullets (and Hard Mode).
    s = await victory(s, (t) => {
      t.victoryCards = [...(t.victoryCards ?? []), VOYAGE.warship];
      t.sailing.heading = 0;
    });
    assert.ok(s.campaign.burdens.includes(DC.ominous));
    assert.ok(s.campaign.xp >= 3, `XP ${s.campaign.xp}`);
    assert.equal(s.campaign.completed[0].xp, s.campaign.xp);
    await page
      .getByText(new RegExp(`Notes · ${s.campaign.xp} unspent XP`))
      .first()
      .waitFor();
    await page.getByText("Ominous Fate", { exact: true }).first().waitFor();
    await checkpoint("voyage-complete", width);
    // The interlude: 2 XP mark Calphon's checkboxes (his Upgraded side).
    const xp = s.campaign.xp;
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    const mark = page.getByRole("button", {
      name: "Mark a checkbox: Calphon",
      exact: true,
    });
    await mark.click();
    await mark.click();
    await page.getByText(`Campaign Log · ${xp - 2} unspent XP`).waitFor();
    await page.getByLabel("2 of 2 checkboxes").first().waitFor();
    await checkpoint("fate-interlude", width);
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    // The Fate of Númenor: one hero takes 1 damage to reduce the threat by 1.
    let wounded = 0;
    s = await opening((t) => {
      if (!/Deal 1 damage to a character/.test(t.choice.title)) return;
      if (wounded++) return "skip";
      return t.choice.options.find((o) => t.heroes.some((h) => h.id === o.id))
        .id;
    });
    assert.equal(s.scenarioId, "the-fate-of-numenor");
    assert.equal(s.campaign.marks[DC.calphon], 2);
    assert.equal(s.campaign.xp, xp - 2);
    assert.equal(s.heroes.filter((h) => h.damage === 1).length, 1);
    assert.ok(s.encounterDeck.includes(DC.revenant));
    assert.ok(s.encounterDeck.includes(DC.ominous));
    const calphon = s.allies.find((u) => u.code === backFace(DC.calphon));
    assert.ok(calphon, "the Upgraded Calphon");
    const spyglass = calphon.attachments.find((a) => a.code === DC.spyglass);
    assert.ok(spyglass, "Spyglass on Calphon");
    // Spyglass places 2 progress on a Lost Island (Uncharted).
    s = await ability(calphon, spyglass.id);
    assert.equal(s.choice.title, "Spyglass · Choose one");
    s = await choose("progress");
    const island = s.staging.find((u) => u.code === FATE.lost);
    s = await choose(island.id);
    assert.equal(s.staging.find((u) => u.id === island.id).progress, 2);
    await campaignCard(
      /^Resources on the campaign card: 0\. Revenant/,
      "fate-setup",
      width,
    );
    // The resolution: a Lush Jungle in the victory display, Revenant's resource.
    s = await victory(s, (t) => {
      t.victoryCards = [...(t.victoryCards ?? []), FATE.jungle];
      t.dreamchaser = { ...(t.dreamchaser ?? {}), resources: 1 };
    });
    assert.equal(s.campaign.completed.length, 2);
    assert.ok(
      s.campaign.completed[1].xp >= 4,
      `XP ${s.campaign.completed[1].xp}`,
    );
    await checkpoint("fate-complete", width);
    // Raid on the Grey Havens: Calphon with Spyglass and Black Key, Graxar,
    // and a copy of Galdor's Counsel for the hand.
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    s = await opening((t) =>
      /copy of Galdor's Counsel/.test(t.choice.title) ? GALDOR[0] : undefined,
    );
    assert.equal(s.scenarioId, "raid-on-the-grey-havens");
    const guide = s.allies.find((u) => dcIs(u, FATE.calphon));
    assert.ok(guide, "Calphon");
    assert.deepEqual(
      guide.attachments.map((a) => a.code),
      [DC.spyglass, DC.keyBoon],
    );
    assert.ok(s.encounterDeck.includes(DC.graxar));
    assert.ok(s.hand.some((h) => h.code === GALDOR[0]));
    assert.equal(s.dreamchaser.ominous, 1);
    await campaignCard(
      /^Galdor's Counsel chosen this game: leadership/,
      "raid-setup",
      width,
    );
    // The resolution: Graxar in the victory display adds Throwing Axe for a hero.
    s = await victory(s, (t) => {
      t.victoryCards = [...(t.victoryCards ?? []), DC.graxar, RAID.runner];
      t.raidGreyHavens.burned = [];
    });
    assert.equal(s.campaign.resolution, "raid-on-the-grey-havens");
    assert.ok(s.campaign.boons.includes(GALDOR[0]));
    const hero = s.campaign.heroes[0];
    await page
      .getByLabel(/add Parrying Cutlass or Throwing Axe/)
      .selectOption(DC.axe);
    await page
      .getByLabel(/Record the hero it is attached to/)
      .selectOption(hero);
    await checkpoint("raid-resolution", width);
    await page
      .getByRole("button", { name: "Record the resolution", exact: false })
      .click();
    await reviewedState(page);
    s = await campaign();
    assert.equal(s.campaign.resolution, null);
    assert.deepEqual(s.campaign.permanent[hero], [DC.axe]);
    assert.equal(s.campaign.completed.length, 3);
    await page.getByRole("button", { name: /^Continue campaign/ }).waitFor();
    await checkpoint("raid-complete", width);
    // Flight of the Stormcaller: the Stormcaller's campaign side with Black
    // Key (burden), the fleet's Modification boons, and Calaerion; the Throwing
    // Axe returns to its hero.
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    s = await opening((t) =>
      /^Prepare the fleet/.test(t.choice.title) &&
      t.choice.options.some((o) => card(o.code).name === "Duskbringer")
        ? t.choice.options.find((o) => card(o.code).name === "Duskbringer").id
        : undefined,
    );
    assert.equal(s.scenarioId, "flight-of-the-stormcaller");
    const boss = [...s.stormcaller.area, ...s.staging].find((u) =>
      dcIs(u, STORMCALLER.stormcaller),
    );
    assert.equal(boss.code, backFace(DC.stormcaller));
    assert.deepEqual(
      boss.attachments.map((a) => a.code),
      [DC.keyBurden],
    );
    assert.ok(s.allies.some((u) => dcIs(u, DC.calaerion)));
    assert.ok(s.encounterDeck.includes(DC.thunderstruck));
    assert.ok(s.stormcaller.corsairDeck.includes(DC.crowley));
    assert.ok(
      s.heroes.some(
        (h) => h.code === hero && h.attachments.some((a) => a.code === DC.axe),
      ),
    );
    await campaignCard(/^Campaign Log: /, "flight-setup", width);
    // The resolution: the Stormcaller destroyed, on-course.
    s = await victory(s, (t) => {
      t.victoryCards = [...(t.victoryCards ?? []), backFace(DC.stormcaller)];
      t.sailing.heading = 0;
    });
    assert.equal(s.campaign.completed.length, 4);
    assert.ok(
      s.campaign.completed[3].xp >= 4,
      `XP ${s.campaign.completed[3].xp}`,
    );
    await page.getByRole("button", { name: /^Continue campaign/ }).waitFor();
    await checkpoint("flight-complete", width);
    // The Thing in the Depths: the Thing's campaign side; Come Together after
    // Captain Sahír flips, offered to the Campaign Pool at the end.
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    s = await opening();
    assert.equal(s.scenarioId, "the-thing-in-the-depths");
    assert.ok(
      s.depths.setAside.some((u) => u.code === backFace(DC.thing)),
      "the Thing's campaign side",
    );
    await campaignCard(
      /The Thing in the Depths is on its "Campaign Mode only" side/,
      "depths-setup",
      width,
    );
    s = await victory(s, (t) => {
      t.dreamchaser = { ...(t.dreamchaser ?? {}), together: 0 };
      t.staging.push({
        id: `c${t.nextId++}`,
        code: backFace(DC.serpent),
        exhausted: false,
        damage: 0,
        progress: 0,
        resources: 0,
        committed: false,
        attachments: [],
        boost: 0,
        attacked: false,
        shadows: [],
      });
    });
    assert.equal(s.campaign.resolution, "the-thing-in-the-depths");
    await page
      .getByLabel(/Add Come Together to the Campaign Pool/)
      .selectOption("add");
    await checkpoint("depths-resolution", width);
    await page
      .getByRole("button", { name: "Record the resolution", exact: false })
      .click();
    await reviewedState(page);
    s = await campaign();
    assert.ok(s.campaign.boons.includes(DC.together));
    assert.equal(s.campaign.completed.length, 5);
    await page.getByText(/is not available in campaign mode yet/).waitFor();
    await checkpoint("depths-complete", width);
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
    `The Dream-chaser campaign browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
