import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  exhaustCharacter,
  progressLocation,
  revealed,
  win,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { fx, make, prepend } from "../src/game/core.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import { card } from "../src/game/cards.ts";
import { ERED, ERED_TREASURES } from "../src/game/ered-campaign.ts";
import { WILDS_RHOVANION } from "../src/game/wilds-rhovanion-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, context, report, url } from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/ered-campaign-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/ered-campaign-browser";
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
      localStorage.setItem("there-and-back-again.campaign-kind.v1", "ered");
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
/** Keep the opening hand and reach the first action window. */
async function opening() {
  for (let i = 0; i < 200; i++) {
    await reviewedState(page);
    const s = await campaign();
    if (s?.choice) await choose(s.choice.options[0].id);
    else if (s?.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (s && !s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("The campaign opening did not finish");
}
/** Win the chapter from a quiet copy of the state and open its end-of-game dialog. */
async function victory(s, prepare = () => {}) {
  const t = quiet(s);
  prepare(t);
  win(t);
  return load(t);
}
/** Record the resolution answers already selected in the end-of-game dialog. */
async function record() {
  await page
    .getByRole("button", { name: "Record the resolution", exact: false })
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
    // The Ered Mithrin campaign, begun at Journey Up the Anduin from the lobby.
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
      .getByRole("button", { name: /Ered Mithrin/ })
      .click();
    await page.getByText("ERED MITHRIN · PART 1").first().waitFor();
    await checkpoint("lobby", width);
    await page.locator("#start-btn").click();
    await reviewedState(page);
    let s = await campaign();
    assert.equal(s.scenarioId, "journey-up-the-anduin");
    assert.equal(s.campaign.kind, "ered");
    assert.ok(s.encounterDeck.includes(ERED.growing), "A Growing Threat");
    assert.ok(
      s.allies.some((u) => u.code === ERED.turayn),
      "Turayn",
    );
    s = await opening();
    await campaignCard(
      /^Journey Up the Anduin has 0 of 4 resources/,
      "anduin-setup",
      width,
    );
    // Turayn's Response after he exhausts: another character's next damage
    // this round is reduced by 1.
    {
      const t = quiet(s, "quest");
      const turayn = t.allies.find((u) => u.code === ERED.turayn);
      exhaustCharacter(t, turayn);
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /Turayn exhausted/);
    s = await choose(s.heroes[0].id);
    assert.deepEqual(
      s.eredCampaign.shields.map((x) => x.target),
      [s.heroes[0].id],
    );
    await campaignCard(/^Turayn: the next time /, "turayn-response", width);
    // The fourth explored non-unique location: the players look at 3 random
    // undiscovered treasures and attach 1 to an eligible character.
    {
      const t = quiet(s);
      t.eredCampaign = { tokens: 3 };
      const lands = make(t, "01114");
      t.staging.push(lands);
      progressLocation(t, lands, card("01114").quest);
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /look at 3 random undiscovered treasures/);
    const looked = s.choice.options.map((o) => o.code);
    assert.ok(looked.every((code) => ERED_TREASURES.includes(code)));
    await checkpoint("anduin-treasures", width);
    // (Durin's Dagger is kept for the discard pile below.)
    const pick = looked.find(
      (code) => code !== ERED.crown && code !== ERED.dagger,
    );
    s = await choose(pick);
    assert.match(s.choice.title, /Attach to an eligible character/);
    s = await choose(s.heroes[1].id);
    assert.ok(s.heroes[1].attachments.some((a) => a.code === pick));
    await campaignCard(
      new RegExp(
        `^${card(pick).name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: discovered if`,
      ),
      "anduin-treasure",
      width,
    );
    // Durin's Dagger, discovered earlier and discarded: played from the
    // discard pile through its button.
    {
      const t = quiet(s);
      t.campaign.treasures = [ERED.dagger];
      t.discard.push(ERED.dagger);
      for (const h of t.heroes) h.resources = 1;
      s = await load(t);
    }
    await page
      .getByRole("button", { name: "View discard piles", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Play Durin's Dagger from discard",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("region", { name: "Choose a target", exact: true })
      .getByRole("button", { name: card(s.heroes[2].code).name, exact: true })
      .click();
    await checkpoint("dagger-discard", width);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(page);
    s = await campaign();
    assert.ok(s.heroes[2].attachments.some((a) => a.code === ERED.dagger));
    assert.ok(!s.discard.includes(ERED.dagger));
    // The resolution: the treasure is discovered; A Growing Threat and the
    // Evil Creatures enemy in play join the Campaign Pool; Turayn joins it.
    s = await victory(s, (t) => t.staging.push(make(t, "01082")));
    assert.deepEqual(s.campaign.treasures, [ERED.dagger, pick]);
    assert.deepEqual(s.campaign.burdens, [ERED.growing]);
    assert.equal(s.campaign.encounterPool["01082"], 1);
    assert.equal(s.campaign.resolution, "journey-up-the-anduin");
    await page
      .getByLabel(/^The heroes' selfless valor has inspired Turayn/)
      .selectOption("aid");
    await checkpoint("anduin-resolution", width);
    s = await record();
    assert.deepEqual(s.campaign.boons, [ERED.turayn]);
    assert.equal(s.campaign.resolution, null);
    await page
      .getByText(/^Notes · treasures:/)
      .first()
      .waitFor();
    await page
      .getByText(/Notes · encounter cards in the Campaign Pool:/)
      .first()
      .waitFor();
    await page.getByRole("button", { name: /^Continue campaign/ }).waitFor();
    await checkpoint("anduin-complete", width);
    // Lost in Mirkwood (Part 2): the interlude puts Turayn in the deck.
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page
      .getByRole("group", {
        name: "Boons and discovered treasures in your decks",
      })
      .waitFor();
    await page.getByLabel("Turayn: deck", { exact: true }).selectOption("0");
    await checkpoint("mirkwood-interlude", width);
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    // The setup: Melanwar for the player; the first player searches for
    // Twilight Hall, which guards 1 of 3 random undiscovered treasures.
    s = await opening();
    assert.equal(s.scenarioId, "lost-in-mirkwood");
    assert.ok(s.allies.some((u) => u.code === ERED.melanwar));
    assert.ok(
      [...s.deck, ...s.hand.map((u) => u.code)].includes(ERED.turayn),
      "Turayn joins the deck",
    );
    const hall = s.staging.find((u) => u.code === WILDS_RHOVANION.twilight);
    assert.ok(hall, "Twilight Hall in the staging area");
    assert.deepEqual(
      s.eredCampaign.guarded.map((g) => g.guardId),
      [hall.id],
    );
    const guarded = s.eredCampaign.guarded[0].code;
    assert.ok(ERED_TREASURES.includes(guarded));
    await campaignCard(
      / is guarded by Twilight Hall: when Twilight Hall leaves play/,
      "mirkwood-setup",
      width,
    );
    // Melanwar's Response when the travel phase begins.
    {
      const t = quiet(s, "staging");
      t.activeLocation = make(t, "01114");
      prepend(t, fx("startTravel", {}));
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /Melanwar · Exhaust him to place 1 progress/);
    await checkpoint("melanwar-response", width);
    s = await choose("use");
    assert.equal(s.activeLocation.progress, 1);
    // Explored, Twilight Hall frees its treasure: the players claim it.
    {
      const t = quiet(s);
      const guard = t.staging.find((u) => u.id === hall.id);
      progressLocation(t, guard, 20);
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /claim the treasure and attach it/);
    s = await choose(s.heroes[0].id);
    while (s.choice) s = await choose(s.choice.options.at(-1).id);
    assert.ok(s.heroes[0].attachments.some((a) => a.code === guarded));
    await campaignCard(
      new RegExp(
        `^${card(guarded).name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: discovered if`,
      ),
      "twilight-claim",
      width,
    );
    // The resolution: Melanwar's note.
    s = await victory(s);
    assert.equal(s.campaign.resolution, "lost-in-mirkwood");
    assert.ok(s.campaign.treasures.includes(guarded));
    await page
      .getByLabel(/^Melanwar pledged his friendship to the heroes/)
      .selectOption("note");
    await checkpoint("mirkwood-resolution", width);
    s = await record();
    assert.deepEqual(s.campaign.notes, ["melanwar"]);
    await page
      .getByText(/^Notes · “Melanwar has given you guidance on traversing/)
      .first()
      .waitFor();
    // The King's Quest (Part 3): heroes change without the threat penalty.
    await page.getByRole("button", { name: /^Continue campaign/ }).click();
    await page
      .getByText(
        /This chapter's campaign card lets each player change heroes without the \+1 threat penalty\./,
      )
      .waitFor();
    await page
      .getByText(
        /Heroes may be changed without adding to your permanent starting threat penalty\./,
      )
      .waitFor();
    await checkpoint("kings-interlude", width);
    await page.getByRole("button", { name: /^Begin next chapter/ }).click();
    await reviewedState(page);
    s = await opening();
    assert.equal(s.scenarioId, "the-kings-quest");
    assert.ok(s.allies.some((u) => u.code === ERED.isolde));
    assert.equal(s.staging.find((u) => u.code === ERED.threat).resources, 3);
    assert.ok(
      [...s.encounterDeck, ...s.encounterDiscard].includes(ERED.spawn) ||
        s.staging.some((u) => u.code === ERED.spawn),
      "Dagnir's Spawn",
    );
    assert.ok(s.wildsRhovanion.cavesDeck.some((u) => u.code === ERED.ruin));
    await campaignCard(
      /^Treasures in the Campaign Log: /,
      "kings-setup",
      width,
    );
    // The Threat to Wilderland at the beginning of the quest phase.
    {
      const t = quiet(s);
      prepend(t, fx("startQuest", {}));
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /The Threat to Wilderland/);
    await checkpoint("threat-to-wilderland", width);
    s = await choose("immune");
    assert.equal(s.staging.find((u) => u.code === ERED.threat).resources, 2);
    assert.ok(s.eredCampaign.immune.ids.length > 0);
    s = await load(quiet(s, "quest"));
    await campaignCard(
      /^The Threat to Wilderland: encounter cards are immune/,
      "kings-immune",
      width,
    );
    // Dagnir's Spawn, revealed: the player distributes 3 damage to shuffle it
    // back into the encounter deck.
    {
      const t = quiet(s, "staging");
      t.encounterDeck = t.encounterDeck.filter((x) => x !== ERED.spawn);
      revealed(t, ERED.spawn);
      flush(t);
      s = await load(t);
    }
    assert.match(s.choice.title, /Dagnir's Spawn · Distribute 3 damage/);
    await checkpoint("dagnirs-spawn", width);
    s = await choose("accept");
    for (let i = 0; i < 3; i++) s = await choose(s.heroes[i].id);
    assert.ok(!s.staging.some((u) => u.code === ERED.spawn));
    assert.ok(s.encounterDeck.includes(ERED.spawn));
    // The resolution: Isolde joins the Campaign Pool, with Abandoned Ruin and
    // the first player's choice of Dagnir's Spawn.
    s = await victory(s);
    assert.equal(s.campaign.resolution, "the-kings-quest");
    assert.ok(s.campaign.burdens.includes(ERED.ruin));
    await page
      .getByLabel(/^Isolde has resolved to continue the hunt/)
      .selectOption("aid");
    await page
      .getByLabel(/^The first player chooses either The Threat to Wilderland/)
      .selectOption({ label: "Dagnir's Spawn" });
    await checkpoint("kings-resolution", width);
    s = await record();
    assert.deepEqual(s.campaign.boons, [ERED.turayn, ERED.isolde]);
    assert.ok(s.campaign.burdens.includes(ERED.spawn));
    assert.ok(!s.campaign.burdens.includes(ERED.threat));
    await page
      .getByRole("dialog")
      .getByText(/The Withered Heath, is not available in campaign mode yet/)
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Continue campaign/ }).count(),
      0,
    );
    await checkpoint("kings-complete", width);
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
    `The Ered Mithrin campaign browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
