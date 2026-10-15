import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  cityPlayerFixture as fixture,
  cityPlayerHand as hand,
  cityPlayerAlly as ally,
  cityPlayerAttach as attach,
} from "../tests/city-player-fixtures.ts";
import {
  CITY_PLAYER as P,
  CITY_PLAYER_CARDS,
} from "../src/game/city-player-support.ts";
import { availableAbilities } from "../src/game/engine.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { seatView, syncSeat, selectSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const holdLineScriptSha256 = createHash("sha256")
  .update(
    await fs.readFile(new URL("./browser-city-hold-line.mjs", import.meta.url)),
  )
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1";
const dir = smoke ? "output/city-players-smoke" : "output/city-players";
await fs.mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid City of Corsairs player fixture");
  const navigation = p.waitForNavigation({ waitUntil: "load" });
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
    location.reload();
  }, s);
  await navigation;
  await p.locator("#start-btn").click();
  await reviewedState(p);
  return saved(p);
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await boardCard(p, id)
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
async function ability(p, unit, attachmentId) {
  const s = await saved(p),
    u = get(s, unit.id);
  const selected = availableAbilities(s, u).find(
    (a) => a.id === attachmentId && !a.disabled,
  );
  assert.ok(selected, "enabled physical card ability");
  const ownButton = p.getByRole("button", {
    name: selected.label,
    exact: true,
  });
  const button = (await ownButton.count())
    ? ownButton
    : p.getByRole("button", {
        name: `${card(u.code).name} · ${selected.label}`,
        exact: true,
      });
  await button.click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, enemy, hero, power) {
  await boardCard(p, enemy.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(hero.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: `Attack · ${power} power`, exact: true })
    .click();
  await reviewedState(p);
}
async function printed(p, c) {
  assert.equal(
    await p.locator("[data-card-primary-name]").textContent(),
    c.name,
  );
  assert.equal(
    await p.locator("[data-card-primary-rules]").textContent(),
    plain(c.text),
  );
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(
    new URL(await img.getAttribute("src"), p.url()).pathname,
    imageUrl(c),
  );
  assert.ok(
    await img.evaluate(async (i) => {
      await i.decode();
      return i.complete && i.naturalWidth > 0;
    }),
  );
}
try {
  for (const [width, height] of smoke
    ? [[1280, 900]]
    : [
        [1280, 900],
        [390, 844],
        [320, 750],
      ]) {
    const { c, p } = await context(browser, width, height, errors, entries);
    activePage = p;

    let s = fixture();
    s.phase = "attack";
    s.deck = [P.knight, "01023", "01024"];
    const imrahil = s.heroes[0];
    await load(p, s);
    s = await ability(p, imrahil);
    assert.match(s.choice.title, /Prince Imrahil/);
    assert.equal(get(s, imrahil.id).resources, 9);
    await shot(p, "imrahil-paid-physical-top-five-search", width);
    s = await resume(p);
    s = await choose(p, "deck-0");
    const temporary = s.allies.find((u) => u.code === P.knight);
    assert.ok(temporary);
    assert.equal(s.deck.length, 2);
    await shot(p, "imrahil-ally-entered-without-play-cost", width);
    await resume(p);
    await next(p);
    s = await settle(p);
    assert.ok(!get(s, temporary.id));
    assert.equal(s.deck.filter((code) => code === P.knight).length, 1);
    await shot(p, "imrahil-real-phase-end-owner-deck-shuffle", width);

    s = fixture();
    const knight = hand(s, P.knight),
      payer = s.heroes[0];
    await load(p, s);
    s = await play(p, knight.id);
    assert.ok(s.allies.some((u) => u.id === knight.id));
    assert.equal(get(s, payer.id).resources, 6);
    await shot(p, "knight-single-hero-resource-pool", width);

    s = fixture();
    const soldier = hand(s, P.soldier),
      nextSoldier = hand(s, P.soldier);
    await load(p, s);
    s = await play(p, soldier.id);
    assert.match(s.choice.title, /Soldier of Dol Amroth/);
    await shot(p, "soldier-entry-optional-response", width);
    await resume(p);
    s = await choose(p, "use");
    const before = s.heroes.reduce((sum, h) => sum + h.resources, 0);
    s = await play(p, nextSoldier.id);
    assert.equal(
      s.heroes.reduce((sum, h) => sum + h.resources, 0),
      before - 1,
    );
    assert.match(s.choice.title, /Soldier/);
    s = await choose(p, "skip");
    await shot(p, "soldier-next-tactics-play-discount-consumed", width);

    s = fixture(2);
    const sulien = ally(s, P.sulien),
      locA = make(s, "01099"),
      locB = make(s, "01094");
    s.staging = [locA, locB];
    selectSeat(s, 1);
    if (s.table) s.table.turn = 1;
    const lore = s.heroes[0];
    await load(p, s);
    s = await ability(p, sulien);
    assert.match(s.choice.title, /Súlien/);
    assert.ok(
      s.choice.options.every((o) =>
        seatView(s, 1).heroes.some((h) => h.id === o.id),
      ),
    );
    await shot(p, "sulien-remote-player-own-lore-payment", width);
    await resume(p);
    s = await choose(p, lore.id);
    assert.equal(get(s, lore.id).resources, 9);
    assert.equal(get(s, sulien.id).exhausted, true);
    assert.equal(get(s, locA.id).tempThreat, -1);
    assert.equal(get(s, locB.id).tempThreat, -1);
    await shot(
      p,
      "sulien-shared-ally-exhausts-staging-locations-reduced",
      width,
    );

    s = fixture(2);
    const presence = hand(s, P.presence),
      chosen = s.heroes[0];
    await load(p, s);
    s = await play(p, presence.id, chosen.id);
    assert.match(s.choice.title, /Inspiring Presence/);
    const low = [...seatView(s, 0).heroes, ...seatView(s, 1).heroes].filter(
      (h) => (card(h.code).threat ?? 0) < 11,
    );
    assert.ok(low.every((h) => get(s, h.id).tempDefense === 2));
    assert.ok(!get(s, chosen.id).tempDefense);
    await shot(p, "presence-printed-threat-cross-seat-defense", width);
    const a = seatView(s, 0).heroes[1],
      b = seatView(s, 1).heroes[0];
    const payment = s.choice.options.find(
      (o) =>
        o.effects[0]?.ids?.includes(a.id) && o.effects[0]?.ids?.includes(b.id),
    );
    assert.ok(payment);
    await resume(p);
    s = await choose(p, payment.id);
    assert.ok(low.every((h) => get(s, h.id).tempAttack === 2));
    await shot(p, "presence-group-leadership-split-payment-attack", width);

    s = fixture();
    const guardian = hand(s, P.guardian),
      enemy = make(s, "01089");
    s.engaged = [enemy];
    enemy.shadows = ["01099"];
    await load(p, s);
    s = await play(p, guardian.id);
    assert.match(s.choice.title, /Guardian of Ithilien/);
    await shot(p, "guardian-physical-entry-return-response", width);
    await resume(p);
    s = await choose(p, enemy.id);
    assert.ok(s.staging.some((u) => u.id === enemy.id));
    assert.ok(!s.engaged.some((u) => u.id === enemy.id));
    assert.deepEqual(get(s, enemy.id).shadows, []);
    await shot(p, "guardian-return-to-staging-discard-shadow", width);

    s = fixture();
    const ranger = ally(s, P.guardian),
      spear = hand(s, P.spear),
      attached = make(s, "01082");
    attach(s, attached, "05017");
    s.engaged = [attached];
    await load(p, s);
    s = await play(p, spear.id, ranger.id);
    assert.equal(stats(s, get(s, ranger.id)).attack, 2);
    await shot(p, "ranger-spear-ranger-attachment-base-attack", width);
    s.phase = "attack";
    await load(p, s);
    await attack(p, attached, ranger, 3);
    s = await settle(p);
    assert.ok(s.log.some((line) => /3 attack/.test(line.text)));
    await shot(
      p,
      "ranger-spear-conditional-actual-enemy-attachment-attack",
      width,
    );

    s = fixture();
    const prince = hand(s, P.prince),
      titled = s.heroes[0];
    for (const code of ["06002", "06004", "06006", "06008"]) ally(s, code);
    await load(p, s);
    s = await play(p, prince.id, titled.id);
    assert.ok(get(s, titled.id).attachments.some((a) => a.code === P.prince));
    await shot(p, "prince-physical-title-outlands-trait", width);
    await resume(p);
    s = await saved(p);
    s.phase = "refresh";
    s.queue = [];
    s.choice = null;
    const resources = get(s, titled.id).resources;
    await load(p, s);
    await next(p);
    s = await settle(p);
    assert.equal(get(s, titled.id).resources, resources + 2);
    await shot(p, "prince-real-resource-phase-four-sphere-outlands", width);

    const { runCityHoldLine } = await import("./browser-city-hold-line.mjs");
    await runCityHoldLine(p, {
      fixture,
      load,
      shot,
      choose,
      saved,
      reviewedState,
      width,
      boardCard,
      resume,
    });

    s = fixture();
    for (const definition of CITY_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of CITY_PLAYER_CARDS) {
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${definition.name}`,
            exact: true,
          })
          .click();
      else {
        const physical = (await saved(p)).hand.find(
          (u) => u.code === definition.code,
        );
        await boardCard(p, physical.id).locator(".hand-art").click();
      }
      await printed(p, card(definition.code));
      await shot(p, `printed-${definition.code}`, width);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await c.close();
  }
  assert.equal(
    screenshots.length,
    smoke ? 29 : 87,
    "all requested checkpoints are required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
    sourceScriptSha256,
    holdLineScriptSha256,
  });
  console.log(
    `City of Corsairs players: ${screenshots.length} checkpoints passed (${url}).`,
  );
} catch (error) {
  const failureScreenshot = `${dir}/first-failure.png`;
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({ path: failureScreenshot }).catch(() => null);
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
        failureScreenshot,
        sourceScriptSha256,
        stack: error.stack,
        lastState:
          activePage && !activePage.isClosed()
            ? await saved(activePage).catch(() => null)
            : null,
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
