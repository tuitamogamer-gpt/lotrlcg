import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base } from "../tests/against-shadow-final-fixtures.ts";
import { base as weatherBase } from "../tests/weather-hills-fixtures.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import { acknowledgeReviews } from "./browser-review-helpers.mjs";
import {
  observeBrowserArtifact,
  collectBrowserArtifactEvidence,
} from "./browser-artifact-evidence.mjs";

const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = process.env.PERFORMANCE_REPORT_DIR ?? "output/performance";
process.env.GAME_URL = url;
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const checks = [];
const errors = [];
const timelineRequests = [];
const entries = new Set();
let canvasEvidence;
let failure;
let activePage;

async function context(reducedMotion) {
  const c = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  const p = await c.newPage();
  activePage = p;
  observeBrowserArtifact(p);
  p.on("response", (response) => {
    if (/\/assets\/index-[^/]+\.js$/.test(new URL(response.url()).pathname))
      entries.add(response.url());
  });
  p.on("pageerror", (error) => errors.push(error.message));
  return { c, p };
}
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s));
  await p.goto(url);
  await p.evaluate((save) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.tutorial", "seen");
    localStorage.setItem("there-and-back-again.review-mode", "hidden");
    localStorage.setItem("there-and-back-again.hover-cards", "off");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  await p.locator(".character-art").first().waitFor();
}
const raw = (p) =>
  p.evaluate(() => localStorage.getItem("there-and-back-again.save.v1"));
function victory() {
  const s = weatherBase();
  s.stage = 2;
  s.staging[0].flipped = true;
  s.staging[0].resources = 4;
  s.weatherHills.orcDeck = [];
  s.weatherHills.setAside = [];
  s.phase = "staging";
  s.heroes[0].committed = true;
  s.heroes[0].exhausted = true;
  s.heroes[0].tempWill = 20;
  s.committedIds = [s.heroes[0].id];
  s.progress = 19;
  return s;
}
try {
  {
    const { c, p } = await context("no-preference");
    await p.addInitScript(() => {
      window.__ambientProof = { writes: [], frames: 0 };
      for (const name of ["width", "height"]) {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLCanvasElement.prototype,
          name,
        );
        Object.defineProperty(HTMLCanvasElement.prototype, name, {
          ...descriptor,
          set(value) {
            if (this.classList.contains("ambient"))
              window.__ambientProof.writes.push({ name, value });
            descriptor.set.call(this, value);
          },
        });
      }
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.classList.contains("ambient"))
          window.__ambientProof.frames++;
        return clear.apply(this, args);
      };
    });
    await p.goto(url);
    await p.locator("#start-btn").waitFor();
    await p.waitForFunction(() => window.__ambientProof.frames > 1);
    const state = await p.evaluate(() => window.render_game_to_text());
    const saved = await raw(p);
    const snapshot = () =>
      p.evaluate(() => {
        const canvas = document.querySelector("canvas.ambient");
        return {
          ...window.__ambientProof,
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
        };
      });
    const initial = await snapshot();
    canvasEvidence = { initial };
    // Font layout can change the initial height; each write must reflect a
    // different dimension, and an unchanged layout must never write again.
    for (const name of ["width", "height"]) {
      const values = initial.writes.filter((w) => w.name === name);
      for (let i = 1; i < values.length; i++)
        assert.notEqual(values[i].value, values[i - 1].value);
    }
    await p.waitForTimeout(700);
    const stable = await snapshot();
    assert.equal(stable.writes.length, initial.writes.length);
    assert.ok(
      stable.frames > initial.frames,
      "normal motion still draws particles",
    );
    await p.setViewportSize({ width: 1100, height: 750 });
    await p.waitForFunction(() => {
      const c = document.querySelector("canvas.ambient");
      return c.width === c.clientWidth && c.height === c.clientHeight;
    });
    const resized = await snapshot();
    assert.ok(resized.writes.length > stable.writes.length);
    assert.ok(resized.writes.length - stable.writes.length <= 2);
    await p.waitForTimeout(500);
    assert.equal((await snapshot()).writes.length, resized.writes.length);
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.waitForTimeout(150);
    const reduced = await snapshot();
    await p.waitForTimeout(500);
    const stopped = await snapshot();
    canvasEvidence = { initial, stable, resized, reduced, stopped };
    assert.equal(
      stopped.frames,
      reduced.frames,
      "a live preference change stops drawing",
    );
    assert.equal(stopped.writes.length, reduced.writes.length);
    await p.emulateMedia({ reducedMotion: "no-preference" });
    await p.waitForFunction(
      (n) => window.__ambientProof.frames > n,
      stopped.frames,
    );
    await p.waitForFunction(() => {
      const c = document.querySelector("canvas.ambient");
      return c.width === c.clientWidth && c.height === c.clientHeight;
    });
    const resumed = await snapshot();
    // CSS hides the reduced-motion canvas. A pending resize can set it to
    // zero before cleanup; restoring its visible dimensions is legitimate.
    assert.ok(resumed.writes.length - stopped.writes.length <= 2);
    await p.waitForTimeout(500);
    const stableAgain = await snapshot();
    assert.equal(stableAgain.writes.length, resumed.writes.length);
    assert.ok(stableAgain.frames > resumed.frames);
    for (const name of ["width", "height"]) {
      const values = stableAgain.writes.filter((w) => w.name === name);
      for (let i = 1; i < values.length; i++)
        assert.notEqual(values[i].value, values[i - 1].value);
    }
    assert.equal(
      await raw(p),
      saved,
      "decoration never writes an adventure save",
    );
    assert.equal(await p.evaluate(() => window.render_game_to_text()), state);
    canvasEvidence = {
      initial,
      stable,
      resized,
      reduced,
      stopped,
      resumed,
      stableAgain,
    };
    checks.push(
      "Ambient dimensions remain stable, resize once, and stop/resume on a live reduced-motion change without game actions",
    );
    await c.close();
  }
  const { c, p } = await context("reduce");
  let failedRequests = 0;
  await p.route("**/cards/01096.jpg", (route) => {
    failedRequests++;
    return route.abort("failed");
  });
  const s = base("mirkwood");
  s.phase = "quest";
  s.lastReveal = "01096";
  s.encounterDeck = ["01099", "01101"];
  await load(p, s);
  await p.locator(".table-history summary").click();
  await p.locator(".last-reveal .art-fallback").waitFor();
  assert.equal(failedRequests, 1);
  await p
    .getByRole("button", { name: "Commit & reveal", exact: true })
    .last()
    .click();
  const image = p.locator('.last-reveal img[data-card-code="01099"]');
  await image.waitFor();
  assert.ok(
    await image.evaluate(async (img) => {
      await img.decode();
      return img.naturalWidth > 0;
    }),
  );
  assert.equal(await p.locator(".last-reveal .art-fallback").count(), 0);
  assert.equal(JSON.parse(await raw(p)).lastReveal, "01099");
  assert.equal(
    failedRequests,
    1,
    "changing cards never retries the old failed source",
  );
  checks.push(
    "a real subsequent encounter reveal recovers its valid image after the previous source failed",
  );
  await c.close();

  for (const mode of [
    "normal",
    "delayed",
    "failed",
    "reduced",
    "live-reduced",
  ]) {
    const { c, p } = await context(
      mode === "reduced" ? "reduce" : "no-preference",
    );
    let requests = 0;
    let finishDelayed;
    const delayedFulfilled = new Promise((resolve) => {
      finishDelayed = resolve;
    });
    p.on("request", (request) => {
      if (/significant-moment-timeline-[^/]+\.js/.test(request.url())) {
        requests++;
        timelineRequests.push({ mode, path: new URL(request.url()).pathname });
      }
    });
    if (mode === "delayed" || mode === "failed") {
      await p.route(
        "**/assets/significant-moment-timeline-*.js",
        async (route) => {
          if (mode === "failed") return route.abort("failed");
          const response = await route.fetch();
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await route.fulfill({ response });
          finishDelayed();
        },
      );
    }
    await load(p, victory());
    assert.equal(
      requests,
      0,
      "the game and landing load without the GSAP timeline",
    );
    await p
      .getByRole("button", { name: "Resolve quest", exact: true })
      .last()
      .click();
    await acknowledgeReviews(p);
    const banner = p.locator('[data-significant-moment="victory"]');
    await banner.waitFor({ state: "visible" });
    const committed = await raw(p);
    assert.equal(JSON.parse(committed).status, "won");
    assert.equal(
      await banner.getAttribute("data-reduced-motion"),
      String(mode === "reduced"),
    );
    if (mode === "reduced") {
      assert.equal(requests, 0);
      assert.equal(
        await banner.locator("[data-significant-moment-visual]").count(),
        0,
      );
    } else if (mode === "normal" || mode === "live-reduced") {
      await p.waitForFunction(() =>
        document
          .querySelector(
            '[data-significant-moment="victory"] [data-moment-title]',
          )
          ?.getAttribute("style")
          ?.includes("opacity"),
      );
      if (mode === "live-reduced") {
        await p.emulateMedia({ reducedMotion: "reduce" });
        await p.waitForFunction(
          () =>
            document
              .querySelector('[data-significant-moment="victory"]')
              ?.getAttribute("data-reduced-motion") === "true",
        );
        assert.equal(
          await banner.locator("[data-significant-moment-visual]").count(),
          0,
        );
        const titleStyle = await banner
          .locator("[data-moment-title]")
          .getAttribute("style");
        assert.ok(
          !titleStyle?.includes("opacity") &&
            !titleStyle?.includes("transform"),
          "switching to reduced motion reverts the scoped GSAP styles",
        );
      }
    }
    // Dismissal remains independent of a failed or late decoration import.
    await banner.waitFor({ state: "detached", timeout: 3500 });
    if (mode === "delayed") {
      await delayedFulfilled;
      await p.waitForTimeout(100);
    }
    assert.equal(
      await raw(p),
      committed,
      "timers and late imports never dispatch game actions",
    );
    assert.equal(await p.locator("[data-significant-moment]").count(), 0);
    assert.equal(requests, mode === "reduced" ? 0 : 1);
    checks.push(
      `${mode} milestone keeps the original dismissal timer and committed game state`,
    );
    await c.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  failure = String(error);
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${dir}/failure.png` });
    await fs.writeFile(
      `${dir}/failure-state.json`,
      await activePage.evaluate(() => window.render_game_to_text()),
    );
  }
  throw error;
} finally {
  let artifactEvidence;
  let artifactError;
  try {
    artifactEvidence = await collectBrowserArtifactEvidence(entries);
  } catch (error) {
    artifactError = error;
  }
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        status: failure || artifactError ? "failed" : "passed",
        capturedAt: new Date().toISOString(),
        url,
        releaseSha: process.env.RELEASE_SHA ?? null,
        entries: [...entries],
        artifactEvidence,
        checks,
        errors,
        timelineRequests,
        canvasEvidence,
        failure,
        artifactFailure: artifactError ? String(artifactError) : undefined,
      },
      null,
      2,
    ),
  );
  await browser.close();
  if (artifactError) throw artifactError;
}
console.log(
  JSON.stringify({
    checks: checks.length,
    errors,
    report: `${dir}/report.json`,
  }),
);
