import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { card } from "../src/game/cards.ts";
import { fx } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { addVictoryCard } from "../src/game/board.ts";
import { SA, SA_QUEST_CODES, saRecipe } from "../src/game/annuminas-support.ts";
import { atQuest, base, engaged, stage } from "../tests/annuminas-fixtures.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  fresh,
  load,
  opening,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";
const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/annuminas-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/annuminas-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  setups = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
let page;
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
const panel = "[data-scenario-panel='the-siege-of-annuminas']";
const unaside = (s, code) => {
  const at = s.annuminas.setAside.indexOf(code);
  if (at >= 0) s.annuminas.setAside.splice(at, 1);
};
async function travel() {
  await page.getByRole("button", { name: "Travel here" }).first().click();
  await reviewedState(page);
  return saved(page);
}
async function settleAll(s) {
  for (let n = 0; s.choice && n < 40; n++)
    s = await choose(
      page,
      s.choice.options.find((o) => o.id === "undefended")?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
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
    if (width === 1280)
      for (const easy of [false, true])
        for (const players of [1, 2, 3, 4]) {
          await fresh(page, "the-siege-of-annuminas", players, easy);
          await page.locator("#start-btn").click();
          let s = await opening(page);
          for (let n = 0; s.choice && n < 20; n++)
            s = await choose(page, s.choice.options[0].id);
          const q = s.annuminas;
          // No encounter card is revealed during setup: every physical card
          // of the recipe is accounted for.
          const physical = [
            ...s.encounterDeck,
            ...s.encounterDiscard,
            ...s.staging.map((u) => u.code),
            ...q.setAside,
            ...SA_QUEST_CODES,
          ].sort();
          assert.deepEqual(
            physical,
            saRecipe()
              .cards.flatMap((r) => Array(r.quantity).fill(r.code))
              .sort(),
          );
          assert.equal(s.staging[0].code, SA.city);
          assert.equal(s.staging[1].code, SA.gate);
          assert.equal(s.staging.length, players + 1);
          assert.deepEqual((await resume(page)).annuminas, q);
          await page.locator(panel).waitFor();
          await page.locator(`${panel} [data-side='1B']`).waitFor();
          await page.locator(`${panel} [data-city-strength='20']`).waitFor();
          await page.locator(`${panel} [data-quest-resources='1']`).waitFor();
          await page.locator(`${panel} [data-lieutenant='aside']`).waitFor();
          setups.push({ players, easy });
          await checkpoint(
            `setup-${players}-${easy ? "easy" : "normal"}`,
            width,
          );
        }
    // All three printed quest cards, both faces.
    for (const code of SA_QUEST_CODES) {
      const s = base(1);
      atQuest(s, code);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Inspect quest: ${card(code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Read printed quest", exact: true })
        .click();
      const side = card(code)
        .name.replace(/[^A-Za-z]+/g, "-")
        .toLowerCase();
      await checkpoint(`quest-${side}-front`, width);
      await page
        .getByRole("button", { name: "Show reverse", exact: true })
        .click();
      await checkpoint(`quest-${side}-back`, width);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .last()
        .click();
    }
    // Rebuild the Defenses: 10 progress for 10 city strength.
    const rebuild = base(1);
    rebuild.progress = 12;
    rebuild.queue.push(fx("saRebuildResponse", { player: 0 }));
    flush(rebuild);
    await load(page, rebuild);
    await checkpoint("rebuild-the-defenses", width);
    let s = await choose(page, "use");
    assert.equal(s.annuminas.cityStrength, 30);
    await page.locator(`${panel} [data-city-strength='30']`).waitFor();
    // Defend the City: the strongest staged enemy attacks each player.
    const defend = base(2);
    atQuest(defend, SA.defend);
    addVictoryCard(defend, SA.host);
    unaside(defend, SA.host);
    stage(defend, SA.vanguard);
    defend.queue.push(fx("saStagingAttacks", { player: 0 }));
    flush(defend);
    assert.match(
      defend.choice.title,
      /^Vanguard of Carn Dûm · Immediate attack/,
    );
    await load(page, defend);
    await page.locator(`${panel} [data-hosts='1']`).waitFor();
    await checkpoint("defend-the-city", width);
    // Dúnedain of Annúminas: spend a resource to take control.
    const dunedain = base(1);
    dunedain.encounterDeck = [SA.dunedain, SA.wall, SA.wall];
    dunedain.queue.push(fx("reveal", { player: 0 }));
    flush(dunedain);
    assert.match(dunedain.choice.title, /^Dúnedain of Annúminas · /);
    await load(page, dunedain);
    await checkpoint("dunedain-of-annuminas", width);
    s = await choose(page, dunedain.heroes[0].id);
    for (let n = 0; s.choice && n < 10; n++)
      s = await choose(page, s.choice.options[0].id);
    assert.ok(s.allies.some((u) => u.code === SA.dunedain));
    // The Hordes of Angmar.
    const hordes = base(1);
    engaged(hordes, SA.rider);
    hordes.encounterDeck = [SA.hordes, SA.wall];
    hordes.queue.push(fx("reveal", { player: 0 }));
    flush(hordes);
    assert.match(hordes.choice.title, /^The Hordes of Angmar · /);
    await load(page, hordes);
    await checkpoint("hordes-of-angmar", width);
    // Archery at the beginning of combat.
    const archery = base(1);
    unaside(archery, SA.host);
    stage(archery, SA.host);
    stage(archery, SA.orc);
    archery.queue.push(fx("heirsArchery", { value: 3, player: 0 }));
    flush(archery);
    await load(page, archery);
    await checkpoint("archery", width);
    // Lead the Sortie: the Battering Ram and the Lieutenant.
    const sortie = base(1);
    atQuest(sortie, SA.sortie);
    unaside(sortie, SA.ram);
    unaside(sortie, SA.lieutenant);
    stage(sortie, SA.ram).resources = 2;
    stage(sortie, SA.lieutenant);
    sortie.annuminas.cityStrength = 11;
    await load(page, sortie);
    await page.locator(`${panel} [data-side='3B']`).waitFor();
    await page.locator(`${panel} [data-lieutenant='play']`).waitFor();
    await page.locator(`${panel} [data-city-strength='11']`).waitFor();
    await checkpoint("lead-the-sortie", width);
    // The Lieutenant in the victory display at the end of the round wins.
    const won = base(1);
    atQuest(won, SA.sortie);
    unaside(won, SA.lieutenant);
    addVictoryCard(won, SA.lieutenant);
    won.queue.push(fx("saSortieWin", { player: 0 }));
    flush(won);
    assert.equal(won.status, "won");
    await load(page, won);
    await checkpoint("enemy-routed", width);
    // The city falls.
    const lost = base(1);
    lost.annuminas.cityStrength = 1;
    stage(lost, SA.orc);
    lost.queue.push(fx("saCityDamage", { player: 0 }));
    flush(lost);
    assert.equal(lost.status, "lost");
    await load(page, lost);
    await checkpoint("city-overrun", width);
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
    setups,
    artwork,
  });
  console.log(
    `The Siege of Annúminas browser passed ${checks.length} checkpoints, ${setups.length} native setups and ${artwork.length} original faces`,
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
          state: await saved(page).catch(() => null),
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
