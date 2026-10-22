import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base } from "../tests/weather-hills-fixtures.ts";
import { make } from "../src/game/core.ts";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";
import { WEATHER as W } from "../src/game/weather-hills-support.ts";
import { CHETWOOD as C } from "../src/game/chetwood-support.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/significant-audio";
await fs.mkdir(dir, { recursive: true });
const manifest = JSON.parse(
  await fs.readFile("public/audio/manifest.json", "utf8"),
);
function second(s) {
  s.stage = 2;
  s.staging[0].flipped = true;
  s.staging[0].resources = 4;
  s.weatherHills.orcDeck = [];
  s.weatherHills.setAside = [];
  return s;
}
function committed(s, q) {
  s.phase = "staging";
  Object.assign(s.heroes[0], {
    committed: true,
    exhausted: true,
    tempWill: 20,
  });
  s.committedIds = [s.heroes[0].id];
  if (q) s.sideQuestSelections = { shared: { id: q.id, code: q.code } };
  return s;
}
const stage = base();
stage.staging[0].resources = 3;
const hunted = make(stage, W.cornered);
hunted.damage = 1;
stage.engaged.push(hunted);
stage.hand = [make(stage, "01073")];
const side = second(base());
const q = make(side, W.camp);
side.staging.push(q);
committed(side, q);
const fall = second(base());
fall.phase = "defense";
fall.heroes[0].damage = 4;
fall.engaged.push(make(fall, C.captain));
const victory = committed(second(base()));
victory.progress = 19;
const defeat = second(base());
defeat.phase = "travel";
defeat.staging[0].resources = 1;
defeat.staging.push(make(defeat, W.valley));
const routine = base();
routine.hand = [make(routine, "01013")];
for (const [name, s] of Object.entries({
  stage,
  side,
  fall,
  victory,
  defeat,
  routine,
})) {
  syncSeat(s);
  assert.ok(validateSave(s), name);
}
const browser = await chromium.launch({ headless: true });
const checks = [],
  screenshots = [],
  errors = [],
  played = [];
const entries = new Set();
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
const probe = (p) =>
  p.evaluate(() => ({
    starts: window.__audioProbe.starts,
    max: window.__audioProbe.max,
    live: window.__audioProbe.live,
    stops: window.__audioProbe.stops,
    states: window.__audioProbe.states,
  }));
async function choose(p, id) {
  await reviewedState(p);
  const s = await saved(p),
    o = s.choice?.options.find((o) => o.id === id);
  assert.ok(o, JSON.stringify(s.choice));
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .first()
    .click();
  await reviewedState(p);
}
async function choices(p) {
  for (let i = 0; i < 100; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return;
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options.find((o) => o.id === "resolve")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("choices stalled");
}
async function load(p, s, resetSeen = false, trusted = true) {
  await p.goto(url);
  await p.evaluate(
    ({ s, resetSeen }) => {
      localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(s));
      localStorage.removeItem("there-and-back-again.choices.v1");
      localStorage.setItem("there-and-back-again.mode.v1", "normal");
      if (resetSeen)
        sessionStorage.removeItem("there-and-back-again.audio-events.v1");
    },
    { s, resetSeen },
  );
  await p.reload();
  entries.add(
    await p.locator('script[type="module"][src]').first().getAttribute("src"),
  );
  if (trusted) await p.locator("#start-btn").click();
  else await p.locator("#start-btn").evaluate((b) => b.click());
  await reviewedState(p);
  assert.equal(
    (await probe(p)).starts.length,
    0,
    "resume cannot announce old state",
  );
}
async function play(p, code) {
  await p
    .locator(
      `.hand-card:has(img[data-card-code="${code}"]) .hand-play:not(.hand-ability)`,
    )
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(p);
}
async function cue(p, kind, label) {
  const src = manifest.cues[kind].src;
  await p.waitForFunction(
    (src) => window.__audioProbe.starts.some((e) => e.src === src),
    src,
  );
  const data = await probe(p);
  const clips = data.starts.filter((e) => e.src === src);
  assert.equal(clips.length, 1, `${label}: exactly one spoken cue`);
  assert.ok(clips[0].duration > 0.5 && clips[0].duration < 3);
  assert.equal(data.max, 1, "no audio overlaps");
  played.push({ label, ...clips[0] });
  checks.push(label);
}
async function capture(p, label, height) {
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    label,
  );
  const box = await p.getByRole("dialog").boundingBox();
  assert.ok(
    box.y >= 0 && box.y + box.height <= height + 1,
    "settings dialog fits",
  );
  const file = `${dir}/${label}.png`;
  await p.screenshot({ path: file });
  screenshots.push(file);
}
try {
  for (const [width, height, reducedMotion] of [
    [1280, 900, "no-preference"],
    [390, 844, "reduce"],
    [320, 750, "reduce"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion,
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.addInitScript(() => {
      const original = window.AudioContext;
      const bytesToUrl = new WeakMap(),
        bufferToUrl = new WeakMap();
      const data = (window.__audioProbe = {
        starts: [],
        stops: 0,
        live: 0,
        max: 0,
        states: [],
        contexts: 0,
      });
      const fetchOriginal = window.fetch;
      window.fetch = async (...args) => {
        const response = await fetchOriginal(...args);
        const src = String(args[0]);
        if (src.startsWith("/audio/")) {
          const read = response.arrayBuffer.bind(response);
          response.arrayBuffer = async () => {
            const bytes = await read();
            bytesToUrl.set(bytes, src);
            return bytes;
          };
        }
        return response;
      };
      window.AudioContext = class extends original {
        gainNode;
        constructor(...args) {
          super(...args);
          data.contexts++;
          this.addEventListener("statechange", () =>
            data.states.push(this.state),
          );
        }
        createGain() {
          this.gainNode = super.createGain();
          return this.gainNode;
        }
        async decodeAudioData(bytes) {
          const src = bytesToUrl.get(bytes);
          const buffer = await super.decodeAudioData(bytes);
          bufferToUrl.set(buffer, src);
          return buffer;
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const start = source.start.bind(source),
            stop = source.stop.bind(source);
          let live = false;
          const ended = () => {
            if (live) {
              live = false;
              data.live--;
            }
          };
          source.addEventListener("ended", ended);
          source.start = (...args) => {
            data.starts.push({
              src: bufferToUrl.get(source.buffer),
              duration: source.buffer?.duration,
              volume: this.gainNode.gain.value,
            });
            live = true;
            data.live++;
            data.max = Math.max(data.max, data.live);
            return start(...args);
          };
          source.stop = (...args) => {
            data.stops++;
            ended();
            return stop(...args);
          };
          return source;
        }
      };
    });
    await installReviewHandler(p);
    await load(p, victory, true, false);
    await p
      .locator(".turn-actions .primary:visible")
      .first()
      .evaluate((b) => b.click());
    await reviewedState(p);
    assert.equal((await saved(p)).status, "won");
    assert.equal(
      await p.evaluate(() => window.__audioProbe.contexts),
      0,
      "untrusted programmatic actions cannot unlock audio",
    );
    await p.mouse.click(1, 1);
    await p.waitForFunction(() => window.__audioProbe.contexts > 0);
    assert.equal(
      (await probe(p)).starts.length,
      0,
      "first gesture never catches up a previously silent milestone",
    );
    checks.push(`${width}-gesture-unlock`);
    await load(p, routine, true);
    await play(p, "01013");
    await p.locator(".turn-actions .primary:visible").first().click();
    await reviewedState(p);
    assert.equal(
      (await probe(p)).starts.length,
      0,
      "routine actions have no sound",
    );
    checks.push(`${width}-routine-silent`);
    await p
      .locator('button[aria-label="Table preferences"]:visible')
      .first()
      .click();
    const voice = p.getByRole("checkbox", { name: /Voice announcements/ });
    assert.equal(await voice.isChecked(), true);
    assert.equal(
      await p
        .getByRole("slider", { name: "Voice volume", exact: true })
        .inputValue(),
      "30",
    );
    await voice.uncheck();
    const volume = p.getByRole("slider", { name: "Voice volume", exact: true });
    await volume.focus();
    await volume.press("Home");
    for (let i = 0; i < 9; i++) await volume.press("ArrowRight");
    await capture(p, `settings-muted-${width}`, height);
    await p.reload();
    await p.locator("#start-btn").click();
    await reviewedState(p);
    await p
      .locator('button[aria-label="Table preferences"]:visible')
      .first()
      .click();
    assert.equal(await voice.isChecked(), false);
    assert.equal(
      await p
        .getByRole("slider", { name: "Voice volume", exact: true })
        .inputValue(),
      "45",
    );
    checks.push(`${width}-preferences-persist`);
    await p
      .getByRole("button", { name: "Close dialog", exact: true })
      .last()
      .click();
    await load(p, victory, true);
    await p.locator(".turn-actions .primary:visible").first().click();
    await reviewedState(p);
    assert.equal((await saved(p)).status, "won");
    assert.equal(
      (await probe(p)).starts.length,
      0,
      "muted victory stays silent",
    );
    checks.push(`${width}-muted-silent`);
    await load(p, stage, true);
    await p.locator('button[aria-label="Table preferences"]:visible').first().click();
    await voice.check();
    await p.getByRole("button", { name: "Close dialog", exact: true }).last().click();
    await play(p, "01073");
    let s = await saved(p);
    await choose(p, s.choice.options.find((o) => o.code === W.cornered).id);
    await choices(p);
    await cue(p, "stage", `${width}-stage`);
    assert.ok(Math.abs((await probe(p)).starts[0].volume - 0.45) < 0.00001);
    const stable = await saved(p);
    await p.reload();
    await p.locator("#start-btn").click();
    await reviewedState(p);
    assert.equal((await probe(p)).starts.length, 0);
    assert.equal((await saved(p)).stage, stable.stage);
    checks.push(`${width}-reload-silent`);
    await load(p, side, true);
    await p.locator(".turn-actions .primary:visible").first().click();
    await reviewedState(p);
    await choices(p);
    await cue(p, "side-quest", `${width}-side-quest`);
    await load(p, fall, true);
    await p.locator(".engaged-zone .card-action").first().click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Aragorn/ })
      .click();
    await p
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    await choices(p);
    await cue(p, "hero-fall", `${width}-hero-fall`);
    await p
      .getByRole("button", { name: "Undo last action", exact: true })
      .click();
    await reviewedState(p);
    assert.equal((await probe(p)).live, 0, "Undo stops current voice");
    assert.equal(
      (await probe(p)).starts.filter(
        (e) => e.src === manifest.cues["hero-fall"].src,
      ).length,
      1,
    );
    await load(p, fall);
    await p.locator(".engaged-zone .card-action").first().click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Aragorn/ })
      .click();
    await p
      .getByRole("button", { name: "Resolve enemy attack", exact: true })
      .click();
    await reviewedState(p);
    await choices(p);
    assert.equal(
      (await probe(p)).starts.filter(
        (e) => e.src === manifest.cues["hero-fall"].src,
      ).length,
      0,
      "Reloading and replaying the prior combat never repeats the same logical death",
    );
    checks.push(`${width}-undo-dedup`);
    await load(p, victory, true);
    await p.locator(".turn-actions .primary:visible").first().click();
    await reviewedState(p);
    await cue(p, "victory", `${width}-victory`);
    await load(p, defeat, true);
    await p
      .locator(
        `.board-card:has(img[data-card-code="${W.valley}"]) .card-action`,
      )
      .click();
    await reviewedState(p);
    await cue(p, "defeat", `${width}-defeat`);
    await p.evaluate(() =>
      window.dispatchEvent(new PageTransitionEvent("pagehide")),
    );
    await p.waitForFunction(() => window.__audioProbe.live === 0);
    await p.waitForFunction(() =>
      window.__audioProbe.states.includes("suspended"),
    );
    assert.ok((await probe(p)).states.includes("suspended"));
    checks.push(`${width}-pagehide-stops`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.equal(entries.size, 1, "stable browser build");
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...entries].every((entry) =>
        entry.endsWith(`/assets/${process.env.EXPECTED_ENTRY}`),
      ),
    );
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        url,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
        entries: [...entries],
        checks,
        played,
        screenshots,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Significant audio: ${checks.length} browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      { url, checks, played, errors, failure: String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
