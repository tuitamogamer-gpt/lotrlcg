import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { base as baseFixture } from "../tests/against-shadow-final-fixtures.ts";
import { make } from "../src/game/core.ts";
import { raiseThreat, revealed } from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { validateSave } from "../src/game/engine.ts";
import {
  forOwner,
  playerOrder,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import {
  installReviewHandler,
  reviewedState,
} from "./browser-review-helpers.mjs";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const dir = "output/trials-tharbad-players";
await fs.mkdir(dir, { recursive: true });
function fixture(players = 1) {
  const s = baseFixture("mirkwood", players);
  s.heroes[0] = make(s, "08025");
  s.heroes[2] = make(s, "01012");
  s.startingHeroes = s.heroes.map((h) => h.code);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes) {
        h.resources = 10;
        h.phaseResourceIcons = ["leadership", "tactics", "spirit", "lore"];
      }
    });
  return s;
}
function attach(s, host, code) {
  host.attachments.push({
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: 0,
  });
}
const brooch = fixture();
brooch.hand = [make(brooch, "08034"), make(brooch, "08061")];
const courageId = brooch.hand[1].id;
const noiseless = fixture(2);
noiseless.staging = [make(noiseless, "01096")];
noiseless.hand = [make(noiseless, "08033")];
const warden = fixture();
warden.heroes[0].committed = warden.heroes[0].exhausted = true;
attach(warden, warden.heroes[0], "08031");
revealed(warden, "01087");
flush(warden);
const wanderer = fixture();
wanderer.heroes[0].exhausted = true;
wanderer.hand = [make(wanderer, "08030")];
wanderer.activeLocation = make(wanderer, "01087");
wanderer.staging = [make(wanderer, "01099")];
const herald = fixture(2);
herald.hand = [make(herald, "08057")];
forOwner(herald, 1, () => {
  herald.hand = [make(herald, "08026"), make(herald, "08028")];
});
const scoutId = seatView(herald, 1).hand[0].id;
const rumil = fixture(2);
rumil.hand = [make(rumil, "08028")];
attach(rumil, rumil.heroes[0], "02097");
forOwner(rumil, 1, () => {
  rumil.engaged = [make(rumil, "01082")];
});
const enemyId = seatView(rumil, 1).engaged[0].id;
const gwaihir = fixture();
gwaihir.hand = [make(gwaihir, "08059")];
gwaihir.discard = ["02075"];
const message = fixture(2);
message.phase = "refresh";
message.hand = [make(message, "08032"), make(message, "08034")];
const giftId = message.hand[1].id;
const free = fixture();
free.hand = [make(free, "08062")];
raiseThreat(free, 3, "encounter");
flush(free);
const fixtures = {
  brooch,
  noiseless,
  warden,
  wanderer,
  herald,
  rumil,
  gwaihir,
  message,
  free,
};
for (const [name, s] of Object.entries(fixtures)) {
  syncSeat(s);
  assert.ok(validateSave(s), `${name}: valid checkpoint`);
}

const browser = await chromium.launch({ headless: true });
const errors = [],
  screenshots = [];
const saved = (p) =>
  p.evaluate(() =>
    JSON.parse(localStorage.getItem("there-and-back-again.save.v1")),
  );
async function resume(p) {
  await p.reload();
  await p.locator("#start-btn").click();
  return reviewedState(p);
}
async function load(p, s) {
  await p.evaluate((state) => {
    localStorage.setItem("there-and-back-again.save.v1", JSON.stringify(state));
    localStorage.setItem("there-and-back-again.mode.v1", "normal");
    localStorage.removeItem("there-and-back-again.choices.v1");
  }, s);
  return resume(p);
}
async function choose(p, id) {
  const s = await reviewedState(p),
    index = s.choice.options.findIndex((o) => o.id === id);
  assert.ok(index >= 0, JSON.stringify(s.choice));
  await p
    .locator("dialog[open] .choice-list .decision-select")
    .nth(index)
    .click();
  return reviewedState(p);
}
async function play(p, code, target, cost) {
  await p
    .locator(
      `.hand-card:has(img[data-card-code="${code}"]) .hand-play:not(.hand-ability)`,
    )
    .click();
  if (target)
    await p
      .locator(`.target-selection [data-unit-id="${target}"] .decision-select`)
      .click();
  if (cost !== undefined)
    assert.match(
      await p.locator(".payment-heading").innerText(),
      new RegExp(`Pay ${cost} resources`),
    );
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Play card", exact: true })
    .click();
  return reviewedState(p);
}
async function next(p) {
  await p.locator(".turn-actions .primary:visible").click();
  return reviewedState(p);
}
async function capture(p, name, height) {
  await p.evaluate(async () => {
    await Promise.all(
      [...document.images]
        .filter((i) => {
          const r = i.getBoundingClientRect();
          return r.width && r.height && r.bottom > 0 && r.top < innerHeight;
        })
        .map(async (i) => {
          i.loading = "eager";
          await i.decode();
        }),
    );
  });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${name}: overflow`,
  );
  const dialog = p.locator("dialog[open]");
  if (await dialog.count()) {
    const r = await dialog.last().boundingBox();
    assert.ok(
      r.y >= 0 && r.y + r.height <= height + 1,
      `${name}: clipped dialog`,
    );
  }
  const path = `${dir}/${name}.png`;
  await p.screenshot({ path });
  screenshots.push(path);
}
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
    await installReviewHandler(p);
    await p.goto(base);

    await load(p, brooch);
    await play(p, "08034", brooch.heroes[0].id, 1);
    const before = (await saved(p)).heroes.reduce((n, h) => n + h.resources, 0);
    await play(p, "08061", brooch.heroes[0].id);
    assert.equal(
      (await saved(p)).heroes.reduce((n, h) => n + h.resources, 0),
      before,
    );
    assert.ok((await saved(p)).hand.some((u) => u.id === courageId));
    assert.equal((await saved(p)).heroes[0].tempWill, 2);
    await capture(p, `brooch-courage-${width}`, height);
    await resume(p);
    await play(p, "08061", brooch.heroes[0].id, 1);
    assert.ok(!(await saved(p)).hand.some((u) => u.id === courageId));

    await load(p, noiseless);
    await play(p, "08033", noiseless.staging[0].id, 1);
    assert.equal(
      (await saved(p)).staging[0].noEngagementRound,
      noiseless.round,
    );
    assert.equal((await saved(p)).hand[0].id, noiseless.hand[0].id);
    await resume(p);
    await capture(p, `noiseless-${width}`, height);

    await load(p, warden);
    await capture(p, `idraen-ready-${width}`, height);
    await resume(p);
    await choose(p, "ready");
    assert.equal((await saved(p)).heroes[0].exhausted, false);
    assert.equal((await saved(p)).heroes[0].committed, true);

    await load(p, wanderer);
    await play(p, "08030", undefined, 3);
    await capture(p, `optional-doomed-${width}`, height);
    await resume(p);
    await choose(p, "doomed");
    await choose(p, "progress");
    await choose(p, "ready");
    assert.equal((await saved(p)).threat, 22);
    assert.equal((await saved(p)).activeLocation, null);
    assert.equal((await saved(p)).staging[0].progress, 1);

    await load(p, herald);
    await play(p, "08057", undefined, 2);
    await choose(p, "doomed");
    await choose(p, "player-1");
    await capture(p, `herald-recipient-${width}`, height);
    await resume(p);
    await choose(p, scoutId);
    assert.ok(seatView(await saved(p), 1).allies.some((u) => u.id === scoutId));

    await load(p, rumil);
    await play(p, "08028", undefined, 4);
    await capture(p, `rumil-cross-seat-${width}`, height);
    await resume(p);
    await choose(p, enemyId);
    assert.equal(seatView(await saved(p), 1).engaged[0].damage, 2);

    await load(p, gwaihir);
    await play(p, "08059", undefined, 5);
    await capture(p, `gwaihir-eagle-${width}`, height);
    await resume(p);
    await choose(p, "discard-0");
    assert.ok((await saved(p)).allies.some((u) => u.code === "02075"));
    for (let i = 0; i < 12 && (await saved(p)).round === gwaihir.round; i++) {
      const s = await reviewedState(p);
      assert.equal(
        s.choice,
        null,
        "No optional card responses in the empty quest fixture",
      );
      await next(p);
    }
    assert.equal((await saved(p)).round, gwaihir.round + 1);
    assert.ok(!(await saved(p)).allies.some((u) => u.code === "02075"));
    assert.ok((await saved(p)).hand.some((u) => u.code === "02075"));

    await load(p, message);
    await play(p, "08032");
    await choose(p, "player-0");
    await choose(p, giftId);
    await capture(p, `message-recipient-${width}`, height);
    await resume(p);
    await choose(p, "player-1");
    assert.equal(seatView(await saved(p), 1).hand[0].id, giftId);
    await resume(p);
    await next(p);
    const returned = await saved(p),
      owner = seatView(returned, 0);
    assert.equal(returned.round, message.round + 1);
    assert.ok(!seatView(returned, 1).hand.some((u) => u.id === giftId));
    assert.ok(
      owner.deck.includes("08034") ||
        owner.hand.some((u) => u.code === "08034"),
    );

    await load(p, free);
    await capture(p, `free-to-choose-${width}`, height);
    await resume(p);
    await choose(p, free.hand[0].id);
    assert.equal((await saved(p)).threat, 20);
    assert.ok((await saved(p)).discard.includes("08062"));

    const art = await p.evaluate(
      async (codes) =>
        Promise.all(
          codes.map(async (code) => {
            const img = new Image();
            img.src = `/cards/${code}.jpg`;
            await img.decode();
            return { code, width: img.naturalWidth, height: img.naturalHeight };
          }),
        ),
      [
        "08025",
        "08028",
        "08030",
        "08031",
        "08032",
        "08033",
        "08034",
        "08057",
        "08059",
        "08061",
        "08062",
      ],
    );
    assert.ok(art.every((i) => i.width > 200 && i.height > 300));
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${dir}/result.json`,
    JSON.stringify({ screenshots, errors }, null, 2),
  );
  console.log(
    `Three Trials / Trouble in Tharbad: ${screenshots.length} screenshots, real payments, cross-seat choices, delayed returns and reloads at 1280/390/320px; all new art decoded; no browser errors.`,
  );
} finally {
  await browser.close();
}
