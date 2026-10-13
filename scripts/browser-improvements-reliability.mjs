import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { STARTERS } from "../src/game/cards.ts";
import { createGame, validateSave } from "../src/game/engine.ts";
import { DECKS_KEY } from "../src/game/decks.ts";
import {
  ADVENTURE_SAVE_KEY,
  CAMPAIGN_SAVE_KEY,
} from "../src/ui/save-recovery.ts";
import { capture, report, url } from "./browser-angmar-helpers.mjs";
import {
  observeBrowserArtifact,
  collectBrowserArtifactEvidence,
} from "./browser-artifact-evidence.mjs";

const dir =
  process.env.RELIABILITY_OUTPUT_DIR ?? "output/improvements-reliability";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  checks = [],
  screenshots = [],
  recoveryButtonBounds = [];
const blockedExternalURLs = new Set(),
  blockedExternalReadDiagnostics = [];
const browser = await chromium.launch({ headless: true });
const leadership = STARTERS.find((d) => d.id === "leadership");
const spirit = STARTERS.find((d) => d.id === "spirit");
const cards = { ...leadership.cards };
for (const [code, count] of Object.entries(spirit.cards))
  cards[code] = Math.min(3, (cards[code] ?? 0) + count);
const normal = createGame(
  41001,
  leadership.cards,
  leadership.heroes,
  "leadership",
  { guided: true },
);
const campaign = createGame(
  41002,
  leadership.cards,
  leadership.heroes,
  "leadership",
  { guided: true, playMode: "campaign" },
);
const custom = createGame(41003, cards, ["01001", "01007", "01003"], "custom", {
  guided: true,
});
for (const game of [normal, campaign, custom]) assert.ok(validateSave(game));
const draft = (id, name = id) => ({
  id,
  name,
  heroes: [],
  cards: {},
  updatedAt: 1000,
});
let activeCase = "initialization";

async function device(seed = {}, width = 1440) {
  const c = await browser.newContext({
    viewport: { width, height: 1050 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  await c.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === new URL(url).origin)
      return route.continue();
    blockedExternalURLs.add(route.request().url());
    return route.abort();
  });
  await c.addInitScript((seed) => {
    if (localStorage.getItem("reliability.browser.seeded")) return;
    for (const [key, value] of Object.entries(seed))
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      );
    localStorage.setItem("there-and-back-again.tutorial", "seen");
    localStorage.setItem("there-and-back-again.coach", "off");
    localStorage.setItem("reliability.browser.seeded", "yes");
  }, seed);
  return c;
}

async function open(c) {
  const p = await c.newPage();
  p.on("pageerror", (error) => errors.push(error.message));
  p.on("console", (message) => {
    if (message.type() !== "error") return;
    if (
      message.text() === "Failed to load resource: net::ERR_FAILED" &&
      blockedExternalURLs.has(message.location().url)
    ) {
      blockedExternalReadDiagnostics.push(message.text());
      return;
    }
    errors.push(message.text());
  });
  observeBrowserArtifact(p);
  await p.goto(url);
  await p.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  for (const src of await p
    .locator('script[type="module"][src]')
    .evaluateAll((nodes) => nodes.map((node) => node.src)))
    entries.add(src);
  return p;
}

async function go(p, name) {
  const inspect = p.getByRole("button", {
    name: "Inspect table while paused",
    exact: true,
  });
  if (await inspect.isVisible()) await inspect.click();
  const navigation = p.getByRole("button", { name: /^Open navigation$/ });
  if (await navigation.isVisible()) await navigation.click();
  await p.getByRole("button", { name, exact: true }).first().click();
}

const stored = (p, key) => p.evaluate((key) => localStorage.getItem(key), key);
async function upload(p, value, name = "recovery.json") {
  await go(p, "How to play");
  await p.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
async function checkpoint(p, name) {
  await capture(p, dir, name, screenshots);
  checks.push(name);
}
async function download(p, label, name) {
  const pending = p.waitForEvent("download");
  await p.getByRole("button", { name: label, exact: true }).click();
  const file = `${dir}/${name}.json`;
  await (await pending).saveAs(file);
  return JSON.parse(await fs.readFile(file, "utf8"));
}

try {
  for (const [name, raw] of [
    ["malformed", '{"original deck shelf": incomplete JSON'],
    [
      "unknown",
      JSON.stringify(
        [
          draft("known", "Known draft"),
          { ...draft("unknown"), cards: { "not-registered": 1 } },
        ],
        null,
        2,
      ),
    ],
  ]) {
    activeCase = `${name}-original-shelf`;
    const c = await device({ [DECKS_KEY]: raw });
    const p = await open(c);
    assert.equal(
      await stored(p, DECKS_KEY),
      raw,
      "mount does not rewrite original bytes",
    );
    await p.reload();
    await p.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    assert.equal(
      await stored(p, DECKS_KEY),
      raw,
      "reload preserves original bytes",
    );
    await go(p, "How to play");
    assert.ok(
      await p
        .getByRole("button", { name: "Export save", exact: true })
        .isDisabled(),
    );
    const backup = await download(
      p,
      "Export recovery backup",
      `${name}-original-backup`,
    );
    assert.equal(
      backup.entries[DECKS_KEY],
      raw,
      "backup retains even unparseable original bytes",
    );
    await checkpoint(p, `${name}-shelf-preserved-and-backed-up`);
    if (name === "unknown") {
      await go(p, "Deck builder");
      await go(p, "New deck");
      await p
        .getByRole("textbox", { name: "Deck name", exact: true })
        .fill("Unfinished protected draft");
      await go(p, "Save draft");
      assert.equal(
        await stored(p, DECKS_KEY),
        raw,
        "an edit does not overwrite unknown original data",
      );
      assert.equal(
        await p
          .getByRole("textbox", { name: "Deck name", exact: true })
          .inputValue(),
        "Unfinished protected draft",
      );
      await checkpoint(p, "unsupported-shelf-keeps-unsaved-editor");
    }
    await c.close();
  }

  activeCase = "full-shelf-custom-save-import";
  {
    const original = Array.from({ length: 50 }, (_, i) =>
      draft(`original-${i + 1}`, `Original draft ${i + 1}`),
    );
    const originalBytes = JSON.stringify(original, null, 2);
    const c = await device({ [DECKS_KEY]: originalBytes });
    const p = await open(c);
    await upload(p, custom, "custom-adventure.json");
    await p.getByText(/Your full deck shelf is unchanged/).waitFor();
    assert.equal(
      await stored(p, DECKS_KEY),
      originalBytes,
      "import cannot evict any original deck",
    );
    assert.equal(
      JSON.parse(await stored(p, ADVENTURE_SAVE_KEY)).originalSeed,
      custom.originalSeed,
    );
    await checkpoint(p, "full-shelf-import-preserves-all-original-bytes");
    await p.reload();
    await p.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    assert.equal(await stored(p, DECKS_KEY), originalBytes);
    assert.match(
      await p.locator("#start-btn").innerText(),
      /Continue adventure/,
    );
    await p.locator("#start-btn").click();
    const resumed = JSON.parse(await stored(p, ADVENTURE_SAVE_KEY));
    assert.equal(resumed.originalSeed, custom.originalSeed);
    assert.deepEqual(resumed.customDeck, cards);
    await checkpoint(p, "full-shelf-imported-custom-game-resumes-after-reload");
    await c.close();
  }

  activeCase = "ordinary-two-tab-saves";
  {
    const c = await device({ [DECKS_KEY]: [] });
    const a = await open(c),
      b = await open(c);
    // Each tab keeps its unfinished working copy in sessionStorage while the
    // saved shelf and its storage-event updates remain shared between tabs.
    await go(a, "Deck builder");
    await go(b, "Deck builder");
    await go(b, "New deck");
    await b
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Unfinished draft in tab B");
    await go(a, "New deck");
    await a
      .getByRole("textbox", { name: "Deck name", exact: true })
      .fill("Saved draft in tab A");
    await go(a, "Save draft");
    await b.getByText(/deck shelf was updated from another tab/).waitFor();
    assert.equal(
      await b
        .getByRole("textbox", { name: "Deck name", exact: true })
        .inputValue(),
      "Unfinished draft in tab B",
    );
    await go(b, "Save draft");
    await b
      .getByRole("heading", { name: "Unfinished draft in tab B", exact: true })
      .waitFor();
    assert.deepEqual(
      JSON.parse(await stored(b, DECKS_KEY))
        .map((d) => d.name)
        .sort(),
      ["Saved draft in tab A", "Unfinished draft in tab B"],
    );
    await a.reload();
    await a.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    await go(a, "Deck builder");
    for (const name of ["Saved draft in tab A", "Unfinished draft in tab B"])
      await a.getByRole("heading", { name, exact: true }).waitFor();
    await checkpoint(a, "two-tab-saves-preserve-both-decks-and-editor");
    await c.close();
  }

  const legacy = {
    [ADVENTURE_SAVE_KEY]: normal,
    [CAMPAIGN_SAVE_KEY]: campaign,
  };
  for (const [width, mode] of [
    [1440, "normal"],
    [320, "campaign"],
  ]) {
    activeCase = `legacy-recovery-explicit-${mode}-${width}`;
    const previousNormal = { ...normal, originalSeed: 61001 };
    const previousCampaign = { ...campaign, originalSeed: 61002 };
    const c = await device(
      {
        [ADVENTURE_SAVE_KEY]: previousNormal,
        [CAMPAIGN_SAVE_KEY]: previousCampaign,
      },
      width,
    );
    const p = await open(c);
    const beforeNormal = await stored(p, ADVENTURE_SAVE_KEY),
      beforeCampaign = await stored(p, CAMPAIGN_SAVE_KEY);
    await upload(p, legacy);
    const chooser = p.getByRole("dialog", {
      name: "Choose an adventure to restore",
      exact: true,
    });
    await chooser.waitFor();
    assert.equal(
      await stored(p, ADVENTURE_SAVE_KEY),
      beforeNormal,
      "nothing is overwritten before selection",
    );
    assert.equal(await stored(p, CAMPAIGN_SAVE_KEY), beforeCampaign);
    const restoreButtonBounds = await chooser.evaluate((dialog) => {
      const container = dialog.getBoundingClientRect();
      return [...dialog.querySelectorAll(".modal-actions > button")].map(
        (button) => {
          const box = button.getBoundingClientRect();
          return {
            withinDialog:
              box.left >= container.left && box.right <= container.right,
            withinViewport: box.left >= 0 && box.right <= innerWidth,
            height: box.height,
          };
        },
      );
    });
    recoveryButtonBounds.push({ width, mode, bounds: restoreButtonBounds });
    assert.equal(restoreButtonBounds.length, 2);
    for (const bounds of restoreButtonBounds) {
      assert.ok(bounds.withinDialog, "restore button fits inside the dialog");
      assert.ok(
        bounds.withinViewport,
        "restore button fits inside the viewport",
      );
      assert.ok(
        bounds.height >= 44,
        "restore button has a usable touch target",
      );
    }
    await checkpoint(
      p,
      `legacy-recovery-waits-for-explicit-selection-${width}`,
    );
    await chooser
      .getByRole("button", {
        name: new RegExp(`^Restore both and open ${mode} adventure`),
      })
      .click();
    await p.getByText("Both adventures restored.", { exact: true }).waitFor();
    assert.equal(
      JSON.parse(await stored(p, ADVENTURE_SAVE_KEY)).originalSeed,
      normal.originalSeed,
    );
    assert.equal(
      JSON.parse(await stored(p, CAMPAIGN_SAVE_KEY)).originalSeed,
      campaign.originalSeed,
    );
    assert.equal(
      JSON.parse(await p.evaluate(() => window.render_game_to_text())).playMode,
      mode,
    );
    await checkpoint(
      p,
      `legacy-recovery-restores-both-and-opens-${mode}-${width}`,
    );
    await c.close();
  }

  activeCase = "actual-error-boundary-recovery-export-roundtrip";
  {
    const c = await device({
      [ADVENTURE_SAVE_KEY]: normal,
      [CAMPAIGN_SAVE_KEY]: campaign,
    });
    const p = await open(c);
    const boundaryReached = await p.evaluate(() => {
      const element = document.getElementById("root").firstElementChild;
      let fiber =
        element[
          Object.keys(element).find((key) => key.startsWith("__reactFiber$"))
        ];
      while (fiber) {
        const instance = fiber.stateNode;
        if (
          instance?.state &&
          Object.hasOwn(instance.state, "error") &&
          typeof instance.setState === "function"
        ) {
          instance.setState({
            error: new Error("Recovery display regression fixture"),
          });
          return true;
        }
        fiber = fiber.return;
      }
      return false;
    });
    assert.ok(boundaryReached, "actual mounted recovery boundary is exercised");
    await p
      .getByRole("heading", {
        name: "Something went wrong on screen",
        exact: true,
      })
      .waitFor();
    await p.getByText(/Changes that did not reach browser storage/).waitFor();
    const backup = await download(
      p,
      "Export saved games",
      "actual-error-boundary-backup",
    );
    assert.equal(backup.format, "there-and-back-again-recovery");
    assert.equal(
      JSON.parse(backup.entries[ADVENTURE_SAVE_KEY]).originalSeed,
      normal.originalSeed,
    );
    assert.equal(
      JSON.parse(backup.entries[CAMPAIGN_SAVE_KEY]).originalSeed,
      campaign.originalSeed,
    );
    await checkpoint(p, "actual-error-boundary-retains-stored-data-honestly");
    await c.close();
    const fresh = await device();
    const q = await open(fresh);
    await upload(q, backup);
    const chooser = q.getByRole("dialog", {
      name: "Choose an adventure to restore",
      exact: true,
    });
    await chooser
      .getByRole("button", { name: /^Restore both and open normal adventure/ })
      .click();
    await q.getByText("Both adventures restored.", { exact: true }).waitFor();
    assert.equal(
      JSON.parse(await stored(q, ADVENTURE_SAVE_KEY)).originalSeed,
      normal.originalSeed,
    );
    assert.equal(
      JSON.parse(await stored(q, CAMPAIGN_SAVE_KEY)).originalSeed,
      campaign.originalSeed,
    );
    await checkpoint(q, "actual-error-boundary-download-is-importable");
    await fresh.close();
  }

  activeCase = "corrupt-backup-entry-never-overwrites-valid-other-save";
  {
    const corrupt = "original damaged normal adventure bytes";
    const backup = {
      format: "there-and-back-again-recovery",
      version: 1,
      exportedAt: 1000,
      entries: {
        [ADVENTURE_SAVE_KEY]: corrupt,
        [CAMPAIGN_SAVE_KEY]: JSON.stringify(campaign),
        [DECKS_KEY]: "original damaged deck bytes",
      },
      unreadableKeys: [],
    };
    const c = await device({
      [ADVENTURE_SAVE_KEY]: normal,
      [DECKS_KEY]: [draft("existing")],
    });
    const p = await open(c);
    await upload(p, backup);
    await p.getByText(/Some entries could not be restored/).waitFor();
    assert.equal(
      JSON.parse(await stored(p, ADVENTURE_SAVE_KEY)).originalSeed,
      normal.originalSeed,
    );
    assert.equal(
      JSON.parse(await stored(p, CAMPAIGN_SAVE_KEY)).originalSeed,
      campaign.originalSeed,
    );
    assert.equal(
      JSON.parse(await stored(p, DECKS_KEY))[0].id,
      "existing",
      "raw deck bytes are not blindly restored",
    );
    await checkpoint(p, "corrupt-backup-entry-preserves-valid-existing-data");
    await c.close();
  }

  assert.equal(checks.length, 13, "all reliability checkpoints completed");
  await report(dir, {
    errors,
    entries,
    checks,
    screenshots,
    recoveryButtonBounds,
    blockedExternalReadDiagnostics,
    reviewMode: "user-default",
    smoke: false,
    limitations: [
      "Two-tab detection is optimistic, not an atomic cross-tab lock.",
      "The error-boundary fixture exercises the actual mounted export handler; it does not claim a crash trigger.",
      "External requests are intentionally blocked; their exact resource-abort diagnostics are retained separately. Visible images still must decode.",
    ],
  });
  console.log(`Reliability browser passed ${checks.length} checkpoints.`);
} catch (error) {
  let artifactEvidence = null,
    artifactEvidenceError = null;
  try {
    artifactEvidence = await collectBrowserArtifactEvidence(entries);
  } catch (evidenceError) {
    artifactEvidenceError = String(evidenceError);
  }
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        activeCase,
        error: String(error),
        errors,
        checks,
        screenshots,
        recoveryButtonBounds,
        blockedExternalReadDiagnostics,
        entries: [...entries],
        artifactEvidence,
        artifactEvidenceError,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
