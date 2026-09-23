import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const fixtures = JSON.parse(
  await fs.readFile("output/browser/fixtures.json", "utf8"),
);
const browser = await chromium.launch({ headless: true });
const failures = [];
for (const [name, fixture] of Object.entries(fixtures)) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => failures.push(e.message));
  await p.goto(process.env.GAME_URL ?? "http://localhost:5178");
  await p.evaluate(
    (save) =>
      localStorage.setItem(
        "there-and-back-again.save.v1",
        JSON.stringify(save),
      ),
    fixture,
  );
  await p.reload();
  await p
    .getByRole("button", { name: "Continue adventure", exact: true })
    .click();
  if (name === "victory") {
    await p.getByRole("button", { name: "Resolve quest", exact: true }).click();
    assert.ok(
      await p.getByRole("dialog", { name: "Beyond the shadow" }).isVisible(),
    );
    await p.screenshot({ path: "output/browser/victory.png", fullPage: true });
  } else {
    await p.locator(".hand-play").click();
    const dialog = p.locator("dialog[open]");
    if (name === "leadership")
      await dialog.locator("select").selectOption(fixture.heroes[0].id);
    if (name === "spirit")
      await dialog.locator("select").selectOption("discard-0");
    if (name === "lore")
      await dialog.getByRole("spinbutton", { name: "Choose X" }).fill("2");
    await dialog
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    if (name === "lore") {
      await p.locator("dialog[open] .choice-list>button").first().click();
      await p.locator("dialog[open] .choice-list>button").first().click();
    }
    if (name === "leadership")
      await p
        .getByRole("button", { name: "Steward of Gondor", exact: true })
        .click();
    if (name === "tactics") {
      await p.locator(".engaged-zone .card-action").click();
      await p.locator("dialog[open] .choice-list>button").nth(0).click();
      await p.locator("dialog[open] .choice-list>button").nth(2).click();
      await p
        .getByRole("button", { name: "Resolve enemy attack", exact: true })
        .click();
    }
    const s = JSON.parse(await p.evaluate(() => window.render_game_to_text()));
    if (name === "leadership") {
      assert.equal(s.heroes[0].resources, 2);
      assert.equal(s.heroes[0].attachments[0].exhausted, true);
    }
    if (name === "spirit") {
      assert.equal(s.allies[0].code, "01044");
      assert.ok(s.heroes.every((h) => h.resources === 0));
    }
    if (name === "lore") {
      assert.equal(s.hand.length, 1);
      assert.equal(
        s.heroes.reduce((n, h) => n + h.resources, 0),
        1,
      );
    }
    if (name === "tactics") {
      assert.equal(s.phase, "attack");
      assert.equal(s.heroes[0].exhausted, true);
      assert.equal(s.heroes[2].exhausted, true);
      assert.ok(s.heroes.every((h) => h.damage === 0));
    }
    await p.screenshot({
      path: `output/browser/${name}-interaction.png`,
      fullPage: true,
    });
  }
  await context.close();
  console.log(`${name}: interaction passed`);
}
await browser.close();
assert.deepEqual(failures, []);
