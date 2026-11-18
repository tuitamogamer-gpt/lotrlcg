import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { check, raiseThreat } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { createGame } from "../src/game/engine.ts";
import { DECK_CARDS } from "../src/game/decks.ts";
import { forOwner } from "../src/game/table.ts";
import { PERILOUS_VOYAGE as PV } from "../src/game/perilous-voyage-support.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
  report,
  resume,
  saved,
  url,
} from "./browser-angmar-helpers.mjs";

const art = JSON.parse(
  await fs.readFile(
    new URL("../tests/perilous-voyage-art.json", import.meta.url),
    "utf8",
  ),
);
const dir = "output/perilous-voyage-browser";
await fs.mkdir(dir, { recursive: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [];
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const HEROES = ["01001", "01002", "01004"];
/** A legal 100-card deck for Aragorn, Théodred and Gimli, with the contract. */
function voyageDeck() {
  const deck = {};
  let n = 0;
  for (const c of DECK_CARDS.filter(
    (c) =>
      ["leadership", "tactics", "neutral"].includes(c.sphere_code) &&
      !c.is_unique &&
      c.type_code !== "contract" &&
      (c.deck_limit ?? 3) >= 3,
  )) {
    if (n >= 100) break;
    const count = Math.min(3, 100 - n);
    deck[c.code] = count;
    n += count;
  }
  deck[PV] = 1;
  return deck;
}
const panel = "[data-perilous-voyage]";
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
/** Keep the opening hand and reach the first action window. */
async function opening() {
  for (let i = 0; i < 100; i++) {
    await reviewedState(page);
    const s = await saved(page);
    if (s.choice)
      await choose(
        page,
        s.choice.options.find((o) => o.id === "resolve")?.id ??
          s.choice.options[0].id,
      );
    else if (s.phase === "setup")
      await page
        .getByRole("button", { name: "Keep hand", exact: true })
        .click();
    else if (!s.queue.length && !s.flow?.pending) return s;
    else await page.waitForTimeout(25);
  }
  throw Error("The opening did not finish");
}
/** A saved state where the threat reaches 50 and the contract flips. */
function flipped(s, deck) {
  const t = structuredClone(s);
  t.choice = null;
  if (deck) {
    t.deck = deck;
    // The replaced deck has no remembered physical copies.
    t.used = t.used.filter((k) => !k.startsWith("phase:heavy-deck:"));
  }
  t.threat = 49;
  forOwner(t, 0, () => raiseThreat(t, 1, "encounter"));
  check(t);
  flush(t);
  return t;
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
    // A native game whose 100-card deck holds the contract.
    const game = createGame(4047, voyageDeck(), HEROES, "custom", {
      scenarioId: "mirkwood",
    });
    assert.equal(game.perilousVoyage.contracts[0].side, "A");
    await load(page, game);
    let s = await opening();
    assert.equal(s.deck.length + s.hand.length, 100);
    await page.locator(`${panel} [data-voyage-side='A']`).waitFor();
    await checkpoint("side-a", width);
    // Side A's Action through the panel button.
    const threat = s.threat,
      hand = s.hand.length;
    await page
      .getByRole("button", {
        name: "Exhaust and raise your threat by 1 to look at the top 2 cards",
        exact: true,
      })
      .click();
    await reviewedState(page);
    s = await saved(page);
    assert.match(s.choice.title, /^A Perilous Voyage · Draw 1 of the top 2/);
    await checkpoint("look-top-two", width);
    const kept = s.choice.options[0].code;
    s = await choose(page, "top-0");
    assert.equal(s.threat, threat + 1);
    assert.equal(s.hand.length, hand + 1);
    assert.equal(s.hand.at(-1).code, kept);
    await page.locator(`${panel} [data-voyage-exhausted='true']`).waitFor();
    assert.deepEqual((await resume(page)).perilousVoyage, s.perilousVoyage);
    // Reaching 50 threat flips the contract: Side B and the search.
    const flip = flipped(s);
    assert.equal(flip.status, "playing");
    assert.equal(flip.threat, 40);
    await load(page, flip);
    s = await saved(page);
    assert.match(s.choice.title, /^A Perilous Voyage · Search your deck/);
    await page.locator(`${panel} [data-voyage-side='B']`).waitFor();
    await checkpoint("flip-search", width);
    const found = s.choice.options[0].id;
    s = await choose(page, found);
    assert.match(s.choice.title, /^A Perilous Voyage · Add it to your hand/);
    await checkpoint("add-or-play", width);
    const before = s.hand.length;
    s = await choose(page, "hand");
    assert.equal(s.hand.length, before + 1);
    assert.equal(s.hand.at(-1).code, found);
    // Playing Brok Ironfist from the deck for 6 - 3 resources.
    const brok = structuredClone(s);
    for (const h of brok.heroes) h.resources = h.code === "01004" ? 0 : 2;
    const play = flipped(
      Object.assign(brok, {
        perilousVoyage: {
          contracts: [{ ...s.perilousVoyage.contracts[0], side: "A" }],
        },
      }),
      ["01019", ...brok.deck.filter((c) => c !== "01019").slice(0, 20)],
    );
    await load(page, play);
    s = await choose(page, "01019");
    s = await choose(page, "play");
    for (let i = 0; i < 3 && s.choice; i++)
      s = await choose(page, s.choice.options[0].id);
    assert.ok(s.allies.some((u) => u.code === "01019"));
    assert.equal(
      s.heroes.reduce((n, h) => n + h.resources, 0),
      1,
      "4 leadership resources - 3",
    );
    await checkpoint("play-reduced", width);
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
    artwork,
  });
  console.log(
    `A Perilous Voyage browser passed ${checks.length} checkpoints and ${artwork.length} original faces`,
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
