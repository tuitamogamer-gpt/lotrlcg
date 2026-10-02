import { legacyReviews } from "./browser-review-helpers.mjs";
import { chromium, type Page } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { STARTERS } from "../src/game/cards";
import { createGame, validateSave } from "../src/game/engine";
import { applyPlanningFixtureAction as applyAction } from "./fixture-phase-helper.ts";
import { eachSeat } from "../src/game/table";
import type { GameState, Unit } from "../src/game/types";

const base = process.env.GAME_URL ?? "http://localhost:5178";
const dir = "output/threat";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch();
const errors: string[] = [];
const evidence: unknown[] = [];
const state = (p: Page) =>
  p.evaluate(() => JSON.parse(window.render_game_to_text()));

function fixture(threat: number, greeting = false) {
  const d = STARTERS.find(
    (d) => d.id === (greeting ? "spirit" : "leadership"),
  )!;
  const s = applyAction(createGame(73, d.cards, d.heroes, d.id), {
    type: "KEEP",
  });
  s.threat = threat;
  s.phase = greeting ? "planning" : "attack";
  s.staging = [];
  s.engaged = [];
  if (greeting) {
    s.heroes.forEach((h) => {
      h.resources = 3;
    });
    s.hand = [
      {
        ...s.heroes[0],
        id: `c${s.nextId++}`,
        code: "01046",
        resources: 0,
        attachments: [],
      } as Unit,
    ];
  }
  assert.ok(validateSave(s));
  return s;
}

async function load(p: Page, s: GameState) {
  await p.goto(base);
  await p.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await p.evaluate((save) => {
    localStorage.removeItem("there-and-back-again.choices.v1");
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(save));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.setItem("there-and-back-again.hover-cards", "off");
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  await p.locator(".illustrated-threat").waitFor();
  await p.waitForTimeout(650);
}

async function advanceUntilThreat(p: Page, expected: number) {
  for (let i = 0; i < 25; i++) {
    const s = await state(p);
    if (s.threat === expected) return;
    assert.ok(s.resolution, "threat changes through explicit game actions");
    await p.locator(".resolution-continue").click();
  }
  assert.fail(`Threat never reached ${expected}`);
}

async function checkValue(p: Page, expected: number) {
  assert.equal((await state(p)).threat, expected);
  assert.equal(
    await p.locator(".illustrated-threat").getAttribute("data-threat"),
    String(expected),
  );
  assert.equal(
    await p
      .getByRole("meter", { name: "Threat level" })
      .getAttribute("aria-valuenow"),
    String(Math.min(50, expected)),
  );
  assert.ok(
    (await p.getByRole("meter").getAttribute("aria-valuetext"))?.startsWith(
      `${expected} threat.`,
    ),
  );
  assert.equal(
    (await p.locator(".threat-disc-window").allTextContents()).join(""),
    String(expected).padStart(2, "0"),
  );
}

try {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion,
    });
    await legacyReviews(p);
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await load(p, fixture(29));
    await checkValue(p, 29);
    assert.equal(
      await p.locator(".threat-feedback").count(),
      0,
      "no fictitious change on load",
    );
    const before = await p
      .locator(".threat-disc-ring")
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
    await p.getByRole("button", { name: "Finish combat", exact: true }).click();
    await advanceUntilThreat(p, 30);
    const frozen = await state(p);
    if (reducedMotion === "no-preference") {
      await p.waitForTimeout(120);
      const during = await p
        .locator(".threat-disc-ring")
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
      assert.notDeepEqual(
        during,
        before,
        "the discs turn through a decade rollover",
      );
      assert.equal(await p.locator(".threat-feedback").textContent(), "+1");
      evidence.push({ reducedMotion, before, during });
    }
    await p.waitForTimeout(850);
    await checkValue(p, 30);
    assert.deepEqual(
      await state(p),
      frozen,
      "animation completion never advances a pending game event",
    );
    if (reducedMotion === "reduce") {
      assert.equal(
        await p
          .locator(".illustrated-threat")
          .evaluate(
            (el) =>
              el
                .getAnimations({ subtree: true })
                .filter((a) => a.playState === "running").length,
          ),
        0,
      );
    }
    if (frozen.resolution)
      await p
        .getByRole("button", { name: "Inspect table while paused" })
        .click();
    await p.screenshot({ path: `${dir}/${reducedMotion}-rollover.png` });

    await load(p, fixture(43, true));
    await p
      .locator(".hand-card")
      .filter({ has: p.getByRole("button", { name: /Inspect.*Galadhrim/ }) })
      .locator(".hand-play")
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await advanceUntilThreat(p, 37);
    if (reducedMotion === "no-preference")
      assert.equal(await p.locator(".threat-feedback").textContent(), "−6");
    await p.waitForTimeout(850);
    await checkValue(p, 37);
    assert.ok(
      !(await p.locator(".illustrated-threat").getAttribute("class"))?.includes(
        "danger",
      ),
    );
    assert.match(
      (await p.locator(".threat-announcement").textContent()) ?? "",
      /decreased by 6/,
    );
    await p.reload();
    await p.locator("#start-btn").click();
    await p.waitForTimeout(700);
    await checkValue(p, 37);
    assert.equal(await p.locator(".threat-feedback").count(), 0);

    await load(p, fixture(49));
    await p.getByRole("button", { name: "Finish combat", exact: true }).click();
    await advanceUntilThreat(p, 50);
    await p.waitForTimeout(850);
    await checkValue(p, 50);
    assert.match(
      (await p.locator(".threat-counter-caption").textContent()) ?? "",
      /Elimination reached/,
    );
    await p.close();
  }

  const d = STARTERS[0];
  let hotseat = createGame(19, d.cards, d.heroes, d.id, {
    seats: STARTERS.slice(0, 3).map((d) => ({
      heroes: d.heroes,
      deckId: d.id,
    })),
  });
  while (hotseat.phase === "setup")
    hotseat = applyAction(hotseat, { type: "KEEP" });
  eachSeat(hotseat, (i) => {
    hotseat.threat = [29, 43, 47][i];
  });
  assert.ok(validateSave(hotseat));
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await legacyReviews(p);
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await load(p, hotseat);
  for (const i of [1, 2, 0, 2, 1, 0]) {
    await p.locator(".seat-tab").nth(i).click();
    await checkValue(p, [29, 43, 47][i]);
    assert.equal(
      await p.locator(".threat-feedback").count(),
      0,
      "switching seats is not a threat change",
    );
  }

  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
    [390, 844],
    [320, 760],
  ]) {
    await p.setViewportSize({ width, height });
    await load(p, fixture(47));
    await p.locator(".illustrated-threat").scrollIntoViewIfNeeded();
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const box = await p.locator(".illustrated-threat").boundingBox();
    assert.ok(
      box &&
        box.x >= 0 &&
        box.x + box.width <= width &&
        box.width >= (width < 1100 ? 90 : 160) &&
        box.height > (width < 1100 ? 60 : 100),
      `the ${width}px threat dial remains contained and legible: ${JSON.stringify(box)}`,
    );
    await p.screenshot({ path: `${dir}/danger-${width}.png` });
    await p
      .locator(".illustrated-threat")
      .screenshot({ path: `${dir}/detail-${width}.png` });
    await p.getByRole("button", { name: "Finish combat", exact: true }).click();
    await advanceUntilThreat(p, 48);
    evidence.push({ width, height, box, actionReachable: true });
  }
  await load(p, fixture(0));
  await checkValue(p, 0);
  await p.evaluate(async () => {
    const face = document.querySelector(".threat-faceplate")!;
    const image = new Image();
    image.src = getComputedStyle(face).backgroundImage.match(
      /url\(["']?(.*?)["']?\)/,
    )![1];
    await image.decode();
    if (image.naturalWidth !== 768) throw Error("Faceplate art failed to load");
  });
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/verification.json`,
    JSON.stringify({ errors, evidence }, null, 2),
  );
  console.log(
    "Threat tracker passed: actual refresh increase, 29→30 rollover, paid threat reduction, 49→50 elimination, zero, reload, hot-seat switching, reduced motion, artwork, and five viewports.",
  );
} finally {
  await browser.close();
}
