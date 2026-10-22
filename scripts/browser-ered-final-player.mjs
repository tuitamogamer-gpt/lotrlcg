import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { ERED_FINAL_PLAYER_ART } from "../tests/ered-final-player-art.ts";
import {
  fixture,
  ally,
  hand,
  attach,
} from "../tests/ered-final-player-fixtures.ts";
import {
  ERED_FINAL_PLAYER as P,
  ERED_FINAL_PLAYER_CARDS as cards,
} from "../src/game/ered-final-player-support.ts";
import { availableAbilities } from "../src/game/engine.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats, enemyAttackPrevented } from "../src/game/core.ts";
import { damage } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { forOwner, seatView } from "../src/game/table.ts";
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

const widths = process.env.ERED_FINAL_PLAYER_WIDTHS
  ? process.env.ERED_FINAL_PLAYER_WIDTHS.split(",").map(Number)
  : [1280, 390, 320];
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir =
  process.env.ERED_FINAL_PLAYER_OUTPUT_DIR ?? "output/ered-final-player";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [],
  artwork = [],
  printedFaces = new Set();
let page;
const board = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(id, target) {
  await board(page, id)
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  if (target)
    await page
      .locator(`.decision-card[data-unit-id="${target}"] .decision-select`)
      .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  await reviewedState(page);
  return saved(page);
}
async function ability(id, attachmentId) {
  const s = await saved(page),
    u = get(s, id);
  const a = availableAbilities(s, u).find(
    (a) => a.id === attachmentId && !a.disabled,
  );
  assert.ok(a, `enabled ability ${id}/${attachmentId}`);
  let b = page.getByRole("button", { name: a.label, exact: true });
  if (!(await b.count()))
    b = page.getByRole("button", {
      name: `${card(u.code).name} · ${a.label}`,
      exact: true,
    });
  await b.click();
  await reviewedState(page);
  return saved(page);
}
async function close() {
  await page
    .getByRole("button", { name: "Close dialog", exact: true })
    .last()
    .click();
}
async function defend(enemy, hero) {
  await board(page, enemy.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
    .click();
  await reviewedState(page);
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
        bilbo = s.heroes[0],
        e = make(s, "01096");
      s.phase = "quest";
      s.staging.push(e);
      await load(page, s);
      await page
        .getByRole("button", {
          name: `Commit ${card(bilbo.code).name}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Commit & reveal", exact: true })
        .last()
        .click();
      await reviewedState(page);
      assert.match((await saved(page)).choice.title, /Bilbo/);
      await resume(page);
      await choose(page, "use");
      await choose(page, e.id);
      assert.equal(
        get(await saved(page), bilbo.id).tempWill,
        card(e.code).threat,
      );
      await checkpoint("bilbo-native-commit-response", width);
    }
    {
      const s = fixture(),
        rad = s.heroes[1],
        eagle = hand(s, "02098");
      s.heroes.forEach((h) => {
        delete h.phaseResourceIcons;
        h.resources = h.id === rad.id ? 4 : 0;
      });
      await load(page, s);
      await play(eagle.id);
      assert.match((await saved(page)).choice.title, /Radagast/);
      await choose(page, "use");
      assert.equal(get(await saved(page), rad.id).resources, 3);
      await checkpoint("radagast-native-creature-payment", width);
    }
    {
      const s = fixture(),
        u = hand(s, P.defender);
      await load(page, s);
      await play(u.id);
      assert.match((await saved(page)).choice.title, /Greenwood Defender/);
      await resume(page);
      await choose(page, "use");
      assert.ok(
        (await saved(page)).used.includes(`round:ered-final:defender:${u.id}`),
      );
      await checkpoint("greenwood-defender-native-entry", width);
    }
    {
      const s = fixture(2),
        silvan = ally(s, "10089"),
        u = hand(s, P.guide),
        target = seatView(s, 1).heroes[0];
      await load(page, s);
      await play(u.id, silvan.id);
      assert.equal(get(await saved(page), silvan.id), undefined);
      await resume(page);
      await choose(page, target.id);
      assert.equal(
        get(await saved(page), target.id).resources,
        target.resources + 1,
      );
      await checkpoint("elf-guide-native-remote-resource", width);
    }
    {
      const s = fixture(2),
        g = ally(s, P.gaffer),
        e = make(s, "01096");
      s.phase = "defense";
      s.staging.push(e);
      await load(page, s);
      await ability(g.id);
      await choose(page, e.id);
      const state = await saved(page);
      assert.equal(get(state, g.id), undefined);
      assert.equal(enemyAttackPrevented(state, get(state, e.id), 0), true);
      assert.equal(enemyAttackPrevented(state, get(state, e.id), 1), false);
      await checkpoint("gaffer-native-player-scoped-prevention", width);
    }
    {
      const s = fixture(),
        u = hand(s, P.song);
      hand(s, "01020");
      hand(s, "01021");
      s.deck = Array(10).fill("01022");
      await load(page, s);
      await play(u.id);
      const state = await saved(page);
      assert.equal(state.hand.length, 3);
      assert.equal(state.deck.length, 9);
      assert.ok(state.discard.includes(P.song));
      await checkpoint("drinking-song-native-hand-refresh", width);
    }
    {
      const s = fixture(),
        u = hand(s, P.sting);
      s.encounterDeck = ["01099", "01103"];
      await load(page, s);
      await play(u.id);
      const state = await saved(page),
        guard = state.staging.find((e) => e.code === "01103");
      assert.equal(guard.attachments.find((a) => a.code === P.sting).id, u.id);
      assert.ok(state.encounterDiscard.includes("01099"));
      await resume(page);
      await checkpoint("sting-native-enemy-guard", width);
    }
    {
      const s = fixture(),
        hero = s.heroes[1],
        shield = attach(s, hero, P.shield),
        enemy = make(s, "01089");
      enemy.tempAttack = 1;
      enemy.shadows = ["01085"];
      enemy.revealedShadowCount = 0;
      s.engaged.push(enemy);
      hand(s, "01048");
      s.phase = "defense";
      await load(page, s);
      await defend(enemy, hero);
      assert.equal((await saved(page)).choice.title, "A shadow falls");
      await choose(page, "cancel");
      assert.match((await saved(page)).choice.title, /Round Shield/);
      await resume(page);
      await choose(page, "use");
      const state = await settle(page);
      assert.equal(get(state, hero.id).damage, 0);
      assert.equal(
        get(state, hero.id).attachments.find((a) => a.id === shield.id)
          .exhausted,
        true,
      );
      await checkpoint("round-shield-native-canceled-shadow-response", width);
    }
    {
      const s = fixture(),
        dwarf = hand(s, P.toymaker),
        armor = hand(s, P.armor);
      await load(page, s);
      await play(dwarf.id);
      await choose(page, "use");
      const before = (await saved(page)).heroes.reduce(
        (n, h) => n + h.resources,
        0,
      );
      await play(armor.id, dwarf.id);
      const state = await saved(page);
      assert.equal(
        state.heroes.reduce((n, h) => n + h.resources, 0),
        before,
      );
      assert.equal(
        stats(state, get(state, dwarf.id)).defense,
        card(P.toymaker).defense + 1,
      );
      await checkpoint("toymaker-armor-native-discount", width);
    }
    {
      const s = fixture();
      s.heroes = s.heroes.slice(0, 1);
      s.startingHeroes = s.heroes.map((h) => h.code);
      const u = hand(s, P.shirefolk);
      await load(page, s);
      await play(u.id);
      assert.equal((await saved(page)).threat, 16);
      await checkpoint("shirefolk-native-hobbit-threat", width);
    }
    {
      const s = fixture(2),
        raven = ally(s, P.raven);
      s.phase = "refresh";
      forOwner(s, 1, () => {
        s.deck = ["01013", "01021"];
      });
      await load(page, s);
      await ability(raven.id);
      await choose(page, "ally");
      await resume(page);
      await choose(page, "player-1");
      assert.equal((await saved(page)).choice.options[0].code, "01013");
      await choose(page, "continue");
      assert.ok(
        seatView(await saved(page), 1).hand.some(
          (u) => u.code === "01013" && u.owner === 1,
        ),
      );
      await checkpoint("messenger-raven-native-remote-top-card", width);
    }
    {
      const s = fixture(),
        u = hand(s, P.kingsReturn);
      s.deck = [P.shirt, "01020"];
      s.encounterDeck = ["01096", "01099"];
      await load(page, s);
      await play(u.id);
      await resume(page);
      await choose(page, "card-0");
      const state = await saved(page);
      assert.ok(
        state.staging.some(
          (u) =>
            u.code === "01099" && u.attachments.some((a) => a.code === P.shirt),
        ),
      );
      assert.ok(state.encounterDiscard.includes("01096"));
      await checkpoint("kings-return-native-typed-location-guard", width);
    }
    {
      const s = fixture(),
        hero = s.heroes[0],
        hound = ally(s, P.hound);
      hero.damage = 1;
      damage(s, hero.id, 2);
      flush(s);
      await load(page, s);
      await resume(page);
      await choose(page, `${hound.id}-2`);
      const state = await saved(page);
      assert.equal(get(state, hero.id).damage, 1);
      assert.equal(get(state, hound.id), undefined);
      assert.ok(state.discard.includes(P.hound));
      await checkpoint("loyal-hound-native-lethal-prevention", width);
    }
    {
      const s = fixture(),
        enemy = make(s, "01096"),
        u = hand(s, P.hunt);
      s.phase = "defense";
      s.staging.push(enemy);
      const before = s.heroes.map((h) => h.resources);
      await load(page, s);
      await play(u.id, enemy.id);
      const state = await saved(page);
      assert.equal(get(state, enemy.id), undefined);
      assert.ok(state.encounterDiscard.includes(enemy.code));
      assert.deepEqual(
        state.heroes.map((h, i) => before[i] - h.resources),
        [1, 1, 1],
      );
      await checkpoint("great-hunt-native-three-pool-payment", width);
    }
    {
      const s = fixture(),
        enemy = make(s, "01096"),
        u = hand(s, P.shirriff);
      s.engaged.push(enemy);
      await load(page, s);
      await play(u.id);
      const state = await saved(page),
        actual = get(state, u.id);
      assert.equal(
        stats(state, actual).attack,
        Number(card(u.code).attack) + 1,
      );
      await checkpoint("bywater-shirriff-native-engagement-stats", width);
    }
    {
      const s = fixture(),
        u = hand(s, P.debt);
      ally(s, "08059");
      s.deck = ["02098", "01020", "01021", "01022", "01023", "01024"];
      await load(page, s);
      await play(u.id);
      await resume(page);
      await choose(page, "card-0");
      let state = await settle(page);
      const borrowed = state.allies.find((u) => u.code === "02098");
      assert.ok(borrowed);
      assert.ok(
        state.used.some((m) =>
          m.startsWith(`round:ered-final:debt:${borrowed.id}:`),
        ),
      );
      await checkpoint("gwaihirs-debt-native-top-five-entry", width);
    }
    {
      const s = fixture(),
        hero = s.heroes[1],
        shirt = attach(s, hero, P.shirt);
      damage(s, hero.id, 3);
      flush(s);
      await load(page, s);
      await resume(page);
      await choose(page, shirt.id);
      const state = await saved(page);
      assert.equal(get(state, hero.id).damage, 2);
      assert.equal(
        get(state, hero.id).attachments.find((a) => a.id === shirt.id)
          .exhausted,
        false,
      );
      await checkpoint("mithril-shirt-native-ready-prevention", width);
    }
    {
      const s = fixture(2),
        u = hand(s, P.reforged),
        target = s.heroes[0];
      forOwner(s, 1, () => {
        s.discard = [P.shield];
      });
      await load(page, s);
      await play(u.id, "discard-1-0");
      await resume(page);
      await choose(page, target.id);
      const state = await saved(page),
        a = get(state, target.id).attachments.find((a) => a.code === P.shield);
      assert.ok(a);
      assert.equal(a.owner, 1);
      assert.ok(!seatView(state, 1).discard.includes(P.shield));
      await checkpoint("reforged-native-foreign-discard-owner", width);
    }
    {
      const s = fixture(),
        rad = s.heroes[1],
        u = hand(s, P.staff),
        eagle = hand(s, "02098");
      await load(page, s);
      await play(u.id, rad.id);
      await ability(rad.id, u.id);
      await choose(page, "discount");
      const before = (await saved(page)).heroes.reduce(
        (n, h) => n + h.resources,
        0,
      );
      await play(eagle.id);
      await choose(page, "skip");
      const state = await saved(page);
      assert.equal(
        state.heroes.reduce((n, h) => n + h.resources, 0),
        before,
      );
      assert.equal(
        get(state, rad.id).attachments.find((a) => a.id === u.id).exhausted,
        true,
      );
      await checkpoint("radagast-staff-native-creature-discount", width);
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
      for (const source of cards) {
        const c = card(source.code);
        await page
          .locator(".pile-entry")
          .filter({ has: page.locator(`img[data-card-code="${c.code}"]`) })
          .getByRole("button")
          .first()
          .click();
        assert.equal(
          await page.locator("[data-card-primary-name]").textContent(),
          c.name,
        );
        if (plain(c.text))
          assert.equal(
            await page.locator("[data-card-primary-rules]").textContent(),
            plain(c.text),
          );
        const img = page.locator(".card-detail img[data-card-code]");
        assert.equal(
          new URL(await img.getAttribute("src"), page.url()).pathname,
          `/cards/${c.code}.jpg`,
        );
        assert.ok(
          await img.evaluate(async (i) => {
            await i.decode();
            return i.naturalWidth > 0;
          }),
        );
        printedFaces.add(c.code);
        if ([P.bilbo, P.radagast, P.reforged, P.shirt].includes(c.code))
          await checkpoint(`printed-${c.code}`, width);
        await close();
      }
      await close();
      checks.push(`all-twenty-printed-faces-${width}`);
    }
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const pin of ERED_FINAL_PLAYER_ART) {
    const response = await p.request.get(
      new URL(pin.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178")
        .href,
    );
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    assert.equal(bytes.length, pin.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
    const size = await p.evaluate(
      async (data) => {
        const b = await createImageBitmap(new Blob([Uint8Array.from(data)]));
        const r = { width: b.width, height: b.height };
        b.close();
        return r;
      },
      [...bytes],
    );
    assert.ok(size.width && size.height);
    artwork.push({ ...pin, ...size });
  }
  await p.close();
  assert.equal(printedFaces.size, 20);
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
    `Ered finale player browser passed ${checks.length} checkpoints, all20 original faces`,
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
