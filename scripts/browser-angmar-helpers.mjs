import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";
import { validateSave } from "../src/game/engine.ts";
import { syncSeat } from "../src/game/table.ts";

export const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
export const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
export async function resume(p) {
  const before = await saved(p);
  assert.ok(
    validateSave(before),
    "the actual browser adventure is valid before reload",
  );
  await p.reload();
  await p.locator("#start-btn").click();
  await reviewedState(p);
  const after = await saved(p);
  assert.equal(
    after.originalSeed,
    before.originalSeed,
    "reload resumes the same adventure",
  );
  assert.equal(after.round, before.round, "reload does not advance the round");
  assert.equal(after.stage, before.stage, "reload does not advance the stage");
  assert.equal(
    after.phase,
    before.phase,
    "reload preserves the decision phase",
  );
  return after;
}
export async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), `valid browser fixture ${s.scenarioId}`);
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
export async function choose(p, id) {
  await reviewedState(p);
  const s = await saved(p),
    index = s.choice?.options.findIndex((o) => o.id === id) ?? -1;
  assert.ok(index >= 0, JSON.stringify(s.choice));
  const o = s.choice.options[index];
  const occurrence = s.choice.options
    .slice(0, index)
    .filter((v) => v.label === o.label).length;
  await p
    .getByRole("dialog")
    .getByRole("button", { name: o.label, exact: true })
    .nth(occurrence)
    .click();
  await reviewedState(p);
  return saved(p);
}
export async function settle(p) {
  for (let i = 0; i < 240; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (!s.choice) return s;
    await choose(
      p,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  throw Error("Angmar decisions did not settle");
}
export async function opening(p) {
  for (let i = 0; i < 300; i++) {
    await reviewedState(p);
    const s = await saved(p);
    if (s.choice)
      await choose(
        p,
        s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options.find((o) => o.id === "skip")?.id ??
          s.choice.options[0].id,
      );
    else if (s.phase === "setup")
      await p.getByRole("button", { name: "Keep hand", exact: true }).click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await p.waitForTimeout(25);
  }
  throw Error("Angmar opening did not finish");
}
export async function menu(p) {
  const missions = p.locator(".mission-selection");
  if (await missions.isVisible()) return;
  const toggle = p.getByRole("button", {
    name: /^(Open|Close) navigation$/,
  });
  if (
    (await toggle.isVisible()) &&
    (await toggle.getAttribute("aria-expanded")) !== "true"
  )
    await toggle.click();
  await p.getByRole("button", { name: "Adventure", exact: true }).click();
}
export async function fresh(p, id, players, easy) {
  await p.evaluate(() => {
    localStorage.removeItem("there-and-back-again.save.v1");
    localStorage.removeItem("there-and-back-again.choices.v1");
  });
  await p.reload();
  await p.getByRole("button", { name: /Solo hot-seat/ }).click();
  await p
    .getByRole("group", { name: "Number of players", exact: true })
    .getByRole("button", {
      name: `${players} ${players === 1 ? "player" : "players"}`,
      exact: true,
    })
    .click();
  await p.locator(`.mission-${id}`).click();
  await p.locator(".easy-toggle input").setChecked(easy);
}
export async function next(p) {
  await reviewedState(p);
  const candidates = p.locator(
    ".turn-panel button.primary:visible, .mobile-action-bar button.primary:visible",
  );
  assert.ok(await candidates.count(), "a next-phase action is available");
  await candidates.last().click();
  await reviewedState(p);
  return saved(p);
}
export async function context(browser, width, height, errors, entries) {
  const c = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    }),
    p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await installReviewHandler(p);
  await p.goto(url);
  for (const src of await p
    .locator('script[type="module"][src]')
    .evaluateAll((els) => els.map((e) => e.src)))
    entries.add(src);
  return { c, p };
}
export async function capture(p, dir, name, screenshots) {
  const failures = await p.evaluate(async () => {
    const root =
      [...document.querySelectorAll('dialog[open],[role="dialog"]')].at(-1) ??
      document;
    const imgs = [...root.querySelectorAll("img")].filter((i) => {
      const r = i.getBoundingClientRect();
      return (
        i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
        r.width &&
        r.height &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    });
    return (
      await Promise.all(
        imgs.map(async (i) => {
          i.loading = "eager";
          try {
            await i.decode();
            return null;
          } catch {
            return i.src;
          }
        }),
      )
    ).filter(Boolean);
  });
  assert.deepEqual(failures, [], `${name}: visible images decode`);
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: no horizontal overflow`,
  );
  const modal = p.getByRole("dialog");
  if (await modal.count()) {
    const r = await modal.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= p.viewportSize().height + 1,
      `${name}: unclipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
export async function report(dir, data) {
  assert.deepEqual(data.errors, [], "no browser errors");
  assert.equal(data.entries.size, 1, "stable browser artifact");
  if (process.env.EXPECTED_ENTRY)
    assert.ok(
      [...data.entries].every((src) =>
        src.endsWith(`/assets/${process.env.EXPECTED_ENTRY}`),
      ),
      "expected release artifact",
    );
  await fs.rm(`${dir}/failure.json`, { force: true });
  await fs.writeFile(
    `${dir}/report.json`,
    JSON.stringify(
      {
        ...data,
        entries: [...data.entries],
        url,
        checkedAt: new Date().toISOString(),
        releaseSha: process.env.RELEASE_SHA ?? null,
      },
      null,
      2,
    ),
  );
}
