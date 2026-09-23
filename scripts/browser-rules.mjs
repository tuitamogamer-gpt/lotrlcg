import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const dir = "output/rules-regression";
const fixtures = JSON.parse(await fs.readFile(`${dir}/fixtures.json`, "utf8"));
const browser = await chromium.launch();
const errors = [];
const state = async (p) =>
  JSON.parse(await p.evaluate(() => window.render_game_to_text()));
async function drain(p) {
  for (let i = 0; i < 100; i++) {
    if (!(await state(p)).resolution) return;
    await p.locator(".resolution-continue").click();
  }
  throw Error("Resolution did not terminate");
}
async function load(p, s) {
  await p.evaluate((s) => {
    localStorage.setItem(
      s.playMode === "campaign"
        ? "there-and-back-again.campaign.v1"
        : "there-and-back-again.save.v1",
      JSON.stringify(s),
    );
    localStorage.setItem("there-and-back-again.mode.v1", s.playMode);
  }, s);
  await p.reload();
  await p.locator("#start-btn").click();
  await drain(p);
}
async function choose(p, label) {
  await p.getByRole("dialog").getByRole("button", { name: label }).click();
  await drain(p);
}
async function shot(p, name, height) {
  const dialog = (await p.getByRole("dialog").count())
    ? await p.getByRole("dialog").boundingBox()
    : null;
  if (dialog)
    assert.ok(
      dialog.y >= 0 && dialog.y + dialog.height <= height + 1,
      "decision stays in viewport",
    );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: `${dir}/${name}.png` });
}
try {
  for (const [width, height] of [
    [1280, 720],
    [1440, 900],
  ]) {
    const p = await browser.newPage({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(process.env.GAME_URL ?? "http://localhost:5178");

    await load(p, fixtures.restricted);
    await p.locator(".hand-play").click();
    await p
      .getByRole("dialog")
      .locator("select")
      .selectOption(fixtures.restricted.heroes[0].id);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await drain(p);
    assert.match((await state(p)).choice.title, /Restricted/);
    const frozen = await state(p);
    await p.keyboard.press("Escape");
    await p.keyboard.press("n");
    assert.deepEqual(
      await state(p),
      frozen,
      "mandatory discard cannot be bypassed",
    );
    await p.reload();
    await p.locator("#start-btn").click();
    assert.deepEqual(await state(p), frozen, "pending choice survives reload");
    await shot(p, `restricted-${width}`, height);
    await choose(p, "Discard Blade of Gondolin");
    assert.equal((await state(p)).heroes[0].attachments.length, 2);

    await load(p, fixtures.objective);
    await p
      .getByRole("button", { name: "Claim · +2 threat", exact: true })
      .click();
    await choose(p, /Gimli/);
    assert.match((await state(p)).choice.title, /Restricted/);
    await choose(p, "Discard Dungeon Torch");
    assert.ok((await state(p)).staging.some((u) => u.name === "Dungeon Torch"));

    await load(p, fixtures.progress);
    await p.locator(".engaged-zone .card-action").click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Legolas/ })
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: /Attack ·/ })
      .click();
    await drain(p);
    await shot(p, `victory-order-${width}`, height);
    await choose(p, /Blade of Gondolin · Place 1/);
    assert.equal((await state(p)).quest.stage, 2);
    await choose(p, /Legolas · Place 2/);
    assert.equal((await state(p)).quest.stage, 3);

    for (const destination of ["hand", "deck"]) {
      await load(p, fixtures.beorn);
      await shot(p, `beorn-${destination}-${width}`, height);
      await choose(
        p,
        destination === "hand"
          ? /Sneak Attack · Return/
          : /Beorn's fury · Shuffle/,
      );
      const after = await state(p);
      assert.equal(after.phase, "quest");
      assert.equal(
        after.hand.some((u) => u.code === "01031"),
        destination === "hand",
      );
      assert.equal(after.allies.length, 0);
    }

    await load(p, fixtures.miner);
    await choose(p, /Discard Iron Shackles/);
    const save = JSON.parse(
      await p.evaluate(() =>
        localStorage.getItem("there-and-back-again.save.v1"),
      ),
    );
    assert.equal(save.shackles, 0);

    await load(p, fixtures.fog);
    assert.equal((await state(p)).stagingThreat, 6);
    const fields = p.locator(".board-card").filter({
      has: p.locator(".board-card-name", { hasText: "Gladden Fields" }),
    });
    assert.match(await fields.locator(".enemy-stats").innerText(), /4/);
    await shot(p, `fog-${width}`, height);

    await load(p, fixtures.prevention);
    assert.equal(
      await p.getByRole("button", { name: "Defend", exact: true }).count(),
      1,
    );
    assert.equal(
      await p.getByText("Enemy attack prevented", { exact: true }).count(),
      2,
    );
    await load(p, fixtures.wolf);
    assert.equal((await state(p)).pendingWolfReturns, 1);
    assert.match(
      await p.locator(".turn-panel").innerText(),
      /1 Wolf Rider shadow waits/,
    );
    await shot(p, `wolf-waiting-${width}`, height);
    await p.getByRole("button", { name: "Finish combat", exact: true }).click();
    await drain(p);
    assert.equal((await state(p)).pendingWolfReturns, 0);
    const wolfSave = JSON.parse(
      await p.evaluate(() =>
        localStorage.getItem("there-and-back-again.save.v1"),
      ),
    );
    assert.equal(wolfSave.encounterDeck[0], "01081");

    await load(p, fixtures.valor);
    for (let i = 0; i < 3; i++) {
      const s = await state(p);
      assert.equal(s.table.active, i);
      assert.match(s.choice.title, /Earn Valor/);
      assert.equal(s.choice.options.length, 2);
      await shot(p, `valor-player-${i + 1}-${width}`, height);
      await choose(p, i === 0 ? "Aragorn" : i === 1 ? "Éowyn" : "Legolas");
    }
    assert.equal(
      (await state(p)).table.seats
        .flatMap((p) => p.heroes.flatMap((h) => h.attachments))
        .filter((a) => a.code === "rc133").length,
      3,
    );
    await p.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log(
  "Rules browser checks passed at 1280×720 and 1440×900: Restricted play/claim/reload, ordered progress, both Beorn exits, Miner, Fog display, prevented attacks, deferred Wolf Rider, and per-player Valor. All progress used explicit confirmations.",
);
