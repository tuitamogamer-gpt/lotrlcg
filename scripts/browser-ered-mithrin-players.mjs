import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { ERED_PLAYER_ART } from "../tests/ered-mithrin-player-art.ts";
import {
  fixture,
  ally,
  hand,
  attach,
} from "../tests/ered-mithrin-player-fixtures.ts";
import {
  ERED_MITHRIN_PLAYER as P,
  ERED_MITHRIN_PLAYER_CARDS as cards,
} from "../src/game/ered-mithrin-player-support.ts";
import { availableAbilities } from "../src/game/engine.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make } from "../src/game/core.ts";
import { seatView, selectSeat, syncSeat } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import {
  capture,
  choose,
  context,
  load,
  report,
  resume,
  saved,
  settle,
} from "./browser-angmar-helpers.mjs";

const widths = process.env.ERED_PLAYER_WIDTHS
  ? process.env.ERED_PLAYER_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.ERED_PLAYER_OUTPUT_DIR ?? "output/ered-mithrin-players";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({ headless: true }),
  errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [],
  printedFaces = new Set();
let page;
const board = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
  await reviewedState(p);
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await board(p, id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await p
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
}
async function ability(p, id, attachmentId) {
  const s = await saved(p),
    u = get(s, id),
    a = availableAbilities(s, u).find(
      (a) => a.id === attachmentId && !a.disabled,
    );
  assert.ok(a, `enabled physical ability ${id}/${attachmentId}`);
  let b = p.getByRole("button", { name: a.label, exact: true });
  if (!(await b.count()))
    b = p.getByRole("button", {
      name: `${card(u.code).name} · ${a.label}`,
      exact: true,
    });
  await b.click();
  await reviewedState(p);
  return saved(p);
}
async function close(p) {
  await p
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function printed(p, c) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    c.name,
  );
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(c.text)) assert.equal(await rules.textContent(), plain(c.text));
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    `/cards/${c.code}.jpg`,
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.naturalWidth > 0;
    }),
  );
  printedFaces.add(c.code);
}
try {
  for (const width of widths) {
    const view = await context(
      browser,
      width,
      width === 1280 ? 1000 : 844,
      errors,
      entries,
    );
    page = view.p;
    {
      const s = fixture(),
        w = hand(s, P.wiglaf),
        helm = hand(s, P.helm);
      await load(page, s);
      await play(page, w.id);
      assert.match((await saved(page)).choice.title, /Wiglaf/);
      await checkpoint(page, "wiglaf-native-response-pending", width);
      await resume(page);
      await choose(page, helm.id);
      let state = await saved(page);
      assert.ok(get(state, w.id).attachments.some((a) => a.id === helm.id));
      await checkpoint(page, "wiglaf-native-free-item", width);
    }
    {
      const s = fixture();
      s.encounterDeck = ["01092", "01085", "01099"];
      const a = hand(s, P.arkenstone);
      await load(page, s);
      await play(page, a.id);
      let state = await settle(page),
        guard = state.staging.find((u) =>
          u.attachments.some((x) => x.id === a.id),
        );
      assert.ok(guard);
      assert.deepEqual(state.encounterDiscard, ["01092"]);
      await resume(page);
      await checkpoint(page, "guarded-arkenstone-physical-guard", width);
    }
    {
      const s = fixture();
      s.phase = "attack";
      const u = ally(s, P.skin),
        bear = hand(s, P.bear);
      await load(page, s);
      await ability(page, u.id);
      await resume(page);
      await choose(page, bear.id);
      const state = await settle(page);
      assert.ok(!get(state, u.id));
      assert.ok(get(state, bear.id));
      await checkpoint(page, "skin-changer-native-replacement", width);
    }
    {
      const s = fixture();
      s.phase = "attack";
      const t = s.heroes.find((h) => h.code === P.thranduil),
        g = hand(s, P.galion);
      for (const h of s.heroes) h.phaseResourceIcons = [];
      await load(page, s);
      await ability(page, t.id);
      await choose(page, g.id);
      await choose(page, "use");
      const state = await settle(page);
      assert.ok(get(state, g.id));
      await resume(page);
      await checkpoint(page, "thranduil-native-silvan-play", width);
    }
    {
      const s = fixture(2);
      selectSeat(s, 1);
      s.table.turn = 1;
      const d = s.heroes.find((h) => h.code === P.dain),
        ring = attach(s, d, P.ring),
        g = ally(s, P.guardian);
      d.exhausted = true;
      s.deck = [P.helm, ...s.deck];
      syncSeat(s);
      await load(page, s);
      await ability(page, d.id, ring.id);
      await resume(page);
      await choose(page, g.id);
      const state = await settle(page);
      assert.ok(!get(state, d.id).exhausted);
      assert.ok(get(state, g.id).attachments.some((a) => a.code === P.helm));
      await checkpoint(page, "ring-native-top-attachment", width);
    }
    {
      const s = fixture(4),
        e = hand(s, P.walls),
        g = hand(s, P.guardian);
      await load(page, s);
      await play(page, e.id);
      await play(page, g.id);
      const state = await saved(page);
      assert.ok(seatView(state, 0).used.includes(`round:ered-walls:${g.id}`));
      for (let p = 1; p < 4; p++)
        assert.ok(seatView(state, p).used.includes("phase:ered-walls"));
      await resume(page);
      await checkpoint(page, "walls-four-player-native-discount", width);
    }
    {
      const s = fixture();
      s.phase = "defense";
      const grim = s.heroes.find((h) => h.code === P.grimbeorn),
        enemy = make(s, "01085");
      s.engaged.push(enemy);
      enemy.shadows = ["01099"];
      enemy.revealedShadowCount = 0;
      await load(page, s);
      await board(page, enemy.id)
        .getByRole("button", { name: "Defend", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: card(grim.code).name, exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Resolve enemy attack", exact: true })
        .click();
      await reviewedState(page);
      assert.match((await saved(page)).choice.title, /Grimbeorn/);
      await resume(page);
      await choose(page, "use");
      const state = await settle(page);
      assert.equal(get(state, grim.id).resources, grim.resources - 1);
      await checkpoint(page, "grimbeorn-native-defense-counterattack", width);
    }
    {
      const s = fixture();
      s.discard = cards.map((c) => c.code);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Browse player discard: ${cards.length} cards`,
          exact: true,
        })
        .click();
      for (const c of cards) {
        await page
          .locator(".pile-entry")
          .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
          .getByRole("button")
          .first()
          .click();
        await printed(page, c);
        if (
          [P.grimbeorn, P.haldan, P.thranduil, P.dain, P.ring].includes(c.code)
        )
          await checkpoint(page, `printed-${c.code}`, width);
        await close(page);
      }
      await close(page);
      checks.push(`all-forty-printed-faces-${width}`);
    }
    await view.c.close();
  }
  const pins = ERED_PLAYER_ART,
    p = await browser.newPage();
  for (const a of pins) {
    const response = await p.request.get(
      new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const b = await response.body();
    assert.equal(b.length, a.bytes);
    assert.equal(createHash("sha256").update(b).digest("hex"), a.sha256);
    const d = await p.evaluate(
      async (bytes) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(bytes)]));
        const d = { width: b.width, height: b.height };
        b.close();
        return d;
      },
      [...b],
    );
    assert.ok(d.width && d.height);
    artwork.push({ ...a, ...d });
  }
  await p.close();
  assert.equal(printedFaces.size, 40);
  await report(dir, {
    smoke: widths.join(",") !== "1280,390,320",
    sourceScriptSha256,
    errors,
    entries,
    screenshots,
    checks,
    printedFaces: [...printedFaces],
    artwork,
  });
  console.log(
    `Ered Mithrin player browser passed ${checks.length} checkpoints, all40 original faces`,
  );
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
