import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const bundles = await Promise.all(
  ["intruders-in-chetwood", "the-weather-hills", "deadmen-s-dike"].map(
    async (slug) =>
      JSON.parse(
        await fs.readFile(
          new URL(`../src/data/pending/${slug}-import.json`, import.meta.url),
          "utf8",
        ),
      ),
  ),
);
const bundle = {
  cards: [
    ...new Map(
      bundles.flatMap((b) => b.cards).map((c) => [c.code, c]),
    ).values(),
  ],
  artwork: [
    ...new Map(
      bundles.flatMap((b) => b.artwork).map((a) => [a.source, a]),
    ).values(),
  ],
};
const dir = "output/lost-realm-reference";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
try {
  for (const [width, height] of [
    [1280, 900],
    [390, 844],
    [320, 750],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(base);
    const library = p.getByRole("button", {
      name: "Card library",
      exact: true,
    });
    const openNavigation = p.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await openNavigation.isVisible())
      await p
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await library.click();
    await p
      .getByLabel("Filter set or product")
      .selectOption({ label: "The Lost Realm" });
    for (const name of [
      "Iârion",
      "Orc Rearguard",
      "Stop the War Party",
      "Hunting the Orcs",
      "Thaurdir",
    ]) {
      await p.getByLabel("Search cards").fill(name);
      const code = bundle.cards.find((c) => c.name === name).code;
      const entry = p.locator(
        `.catalog-card:has(img[data-card-code="${code}"])`,
      );
      await entry.first().waitFor();
      assert.equal(await entry.count(), 1);
      const image = entry.locator("img");
      await image.evaluate(async (i) => {
        i.loading = "eager";
        await i.decode();
      });
      assert.ok(
        new URL(await image.getAttribute("src"), base).pathname.startsWith(
          "/cards/",
        ),
      );
      await entry.click();
      const dialog = p.getByRole("dialog", { name, exact: true });
      await dialog.waitFor();
      await dialog.locator("img").evaluate(async (i) => {
        await i.decode();
      });
      if (name === "Iârion")
        assert.match(await dialog.locator(".detail-stats").innerText(), /X/);
      if (name === "Stop the War Party") {
        await dialog
          .getByRole("button", { name: "Show reverse", exact: true })
          .click();
        await dialog.locator("img").evaluate(async (i) => {
          await i.decode();
        });
        assert.match(
          await dialog.locator("img").getAttribute("src"),
          /\.B\.jpg$/,
        );
      }
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${name}: overflow at ${width}`,
      );
      const bounds = await dialog.boundingBox();
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= height + 1,
        `${name}: clipped dialog`,
      );
      const path = `${dir}/${name.replace(/[^a-zA-Z0-9]+/g, "-")}-${width}.png`;
      await p.screenshot({ path });
      screenshots.push(path);
      await p.keyboard.press("Escape");
    }
    const decoded = await p.evaluate(
      async (art) =>
        Promise.all(
          art.map(async ({ localPath }) => {
            const i = new Image();
            i.src = localPath;
            await i.decode();
            return i.naturalWidth;
          }),
        ),
      bundle.artwork,
    );
    assert.equal(decoded.length, 64);
    assert.ok(decoded.every((n) => n > 200));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, decodedFaces: 64, errors }, null, 2),
  );
  console.log(
    `Lost Realm reference import: ${screenshots.length} responsive checkpoints and all 64 local faces decoded; original X stats and reverse quest face preserved.`,
  );
} finally {
  await browser.close();
}
