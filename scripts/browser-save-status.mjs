import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { validateSave } from "../src/game/engine.ts";
import { ADVENTURE_SAVE_KEY } from "../src/ui/save-recovery.ts";
import {
  capture,
  context,
  fresh,
  next,
  opening,
  report,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
import { reviewedState } from "./browser-review-helpers.mjs";

const dir = process.env.SAVE_STATUS_OUTPUT_DIR ?? "output/save-status";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  const value = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (value) {
    const proxy = new URL(value);
    launch.proxy = {
      server: `${proxy.protocol}//${proxy.host}`,
      username: decodeURIComponent(proxy.username),
      password: decodeURIComponent(proxy.password),
    };
  }
}
const browser = await chromium.launch(launch);
const errors = [],
  checks = [],
  screenshots = [],
  entries = new Set();
let page;
const warning =
  "Your latest progress could not be saved on this device. Export the adventure to keep it.";
function pass(label, width) {
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function attemptedSave() {
  return page.evaluate(() => {
    const probe = window.__saveStatusProbe;
    return { count: probe.count, game: JSON.parse(probe.lastAttempt) };
  });
}
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    page = p;
    await fresh(page, "mirkwood", 1, false);
    await page.locator("#start-btn").click();
    await opening(page);
    const before = await saved(page);
    assert.ok(validateSave(before));
    assert.equal(before.phase, "resource");

    // Retain the actual serialized state the running app tries to write. Other
    // storage entries, game actions and the download path remain unmodified.
    await page.evaluate((key) => {
      const original = Storage.prototype.setItem;
      const probe = { original, count: 0, lastAttempt: "" };
      window.__saveStatusProbe = probe;
      Storage.prototype.setItem = function (name, value) {
        if (this === localStorage && name === key) {
          probe.count++;
          probe.lastAttempt = String(value);
          throw new DOMException(
            "Test save capacity reached",
            "QuotaExceededError",
          );
        }
        return original.call(this, name, value);
      };
    }, ADVENTURE_SAVE_KEY);
    await next(page);
    assert.equal((await reviewedState(page)).phase, "planning");
    const banner = page.locator(".save-failure-banner");
    await banner.waitFor({ state: "visible" });
    assert.equal(await banner.getAttribute("role"), "status");
    assert.match(
      await banner.innerText(),
      /Changes are not saved on this device/,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Export unsaved adventure", exact: true })
        .isEnabled(),
    );
    assert.deepEqual(
      await saved(page),
      before,
      "failed writes retain the previous valid save",
    );
    assert.equal(
      await banner.evaluate((node) => node.contains(document.activeElement)),
      false,
      "the warning does not take keyboard focus",
    );
    pass("failed write retains the previous save and exposes recovery", width);

    const failureToast = page.locator(".toast").filter({ hasText: warning });
    await failureToast.waitFor({ state: "visible" });
    await failureToast.waitFor({ state: "hidden", timeout: 7000 });
    assert.ok(
      await banner.isVisible(),
      "recovery remains after the temporary toast expires",
    );
    const attemptsBefore = (await attemptedSave()).count;
    await next(page);
    assert.equal((await reviewedState(page)).phase, "quest");
    const attempted = await attemptedSave();
    assert.ok(attempted.count > attemptsBefore);
    assert.equal(attempted.game.phase, "quest");
    assert.ok(validateSave(attempted.game));
    assert.equal(
      await failureToast.count(),
      0,
      "another failed action does not repeat the notification",
    );
    await page.locator(".table-history").scrollIntoViewIfNeeded();
    const bounds = await banner.boundingBox();
    assert.ok(
      bounds && bounds.y >= 0 && bounds.y + bounds.height <= height,
      "the sticky recovery remains within the viewport while browsing the table",
    );
    await capture(page, dir, `unsaved-progress-${width}`, screenshots);
    pass(
      "recovery persists while playing without repeated failure toasts",
      width,
    );

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export unsaved adventure", exact: true })
      .click();
    const download = await downloadPromise;
    const exportedPath = `${dir}/unsaved-adventure-${width}.json`;
    await download.saveAs(exportedPath);
    assert.deepEqual(
      JSON.parse(await fs.readFile(exportedPath, "utf8")),
      attempted.game,
      "the actual download contains the most recent in-memory game",
    );
    assert.deepEqual(
      await saved(page),
      before,
      "export does not claim the device save succeeded",
    );
    assert.ok(await banner.isVisible());
    pass(
      "export downloads exact unsaved progress without hiding the warning",
      width,
    );

    await page.evaluate(() => {
      Storage.prototype.setItem = window.__saveStatusProbe.original;
    });
    // Undo is a real legal action. Its successful write is followed by normal
    // phase advancement to prove autosaving resumes, including review queues.
    // Return to the header after testing the sticky warning at the bottom of
    // the table; nearest-only auto scrolling can place a control under it.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const undo = page.getByRole("button", {
      name: "Undo last action",
      exact: true,
    });
    const undoBounds = await undo.boundingBox();
    const warningBounds = await banner.boundingBox();
    assert.ok(
      undoBounds &&
        warningBounds &&
        undoBounds.y >= warningBounds.y + warningBounds.height,
      "the header action remains reachable below recovery",
    );
    await undo.click();
    await banner.waitFor({ state: "hidden" });
    assert.match(
      await page.locator(".save-status").innerText(),
      /Saved on this device/,
    );
    assert.equal(await page.locator(".save-status.unsaved").count(), 0);
    const recovered = await saved(page);
    assert.ok(validateSave(recovered));
    const recoveredView = await page.evaluate(() =>
      JSON.parse(window.render_game_to_text()),
    );
    assert.equal(recovered.phase, recoveredView.phase);
    assert.equal(recovered.status, recoveredView.mode);
    await next(page);
    const continued = await saved(page);
    assert.ok(validateSave(continued));
    assert.notDeepEqual(
      continued,
      recovered,
      "a later legal action is persisted",
    );
    const continuedView = await page.evaluate(() =>
      JSON.parse(window.render_game_to_text()),
    );
    assert.equal(continued.phase, continuedView.phase);
    assert.equal(continued.status, continuedView.mode);
    assert.equal(await banner.count(), 0);
    await capture(page, dir, `saving-recovered-${width}`, screenshots);
    pass(
      "successful writes clear recovery and persist later phase actions",
      width,
    );
    await c.close();
  }
  assert.equal(checks.length, 12);
  await report(dir, { checks, errors, screenshots, entries, smoke: false });
  console.log(`Save status: ${checks.length} checks passed.`);
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { error: String(error), stack: error.stack, checks, errors },
      null,
      2,
    ),
  );
  if (page && !page.isClosed())
    await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
