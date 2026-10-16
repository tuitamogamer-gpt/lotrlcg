import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  beneathSandsPlayerFixture as fixture,
  beneathSandsPlayerAlly as ally,
  beneathSandsPlayerHand as hand,
  beneathSandsPlayerAttach as attach,
} from "../tests/beneath-sands-player-fixtures.ts";
import {
  BENEATH_SANDS_PLAYER as P,
  BENEATH_SANDS_PLAYER_CARDS,
} from "../src/game/beneath-sands-player-support.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats, fx, prepend } from "../src/game/core.ts";
import { availableAbilities, validateSave } from "../src/game/engine.ts";
import { syncSeat, forOwner, seatView } from "../src/game/table.ts";
import { flush } from "../src/game/effects.ts";
import { progressLocation } from "../src/game/board.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1",
  dir = smoke
    ? "output/beneath-sands-players-smoke"
    : "output/beneath-sands-players";
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
  assert.ok(validateSave(s), "valid original Beneath the Sands player fixture");
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
async function ability(p, id, attachmentId) {
  const s = await saved(p),
    u = get(s, id),
    a = availableAbilities(s, u).find(
      (a) => a.id === attachmentId && !a.disabled,
    );
  assert.ok(a, "enabled physical ability");
  let button = p.getByRole("button", { name: a.label, exact: true });
  if (!(await button.count()))
    button = p.getByRole("button", {
      name: `${card(u.code).name} · ${a.label}`,
      exact: true,
    });
  await button.click();
  await reviewedState(p);
  return saved(p);
}
async function commit(p, u) {
  await p
    .getByRole("button", { name: `Commit ${card(u.code).name}`, exact: true })
    .click();
  await p
    .getByRole("button", { name: /^(Commit & reveal|Commit this fellowship)$/ })
    .last()
    .click();
  await reviewedState(p);
  return saved(p);
}
async function attack(p, e, u) {
  await boardCard(p, e.id)
    .getByRole("button", { name: "Attack", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(u.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", {
      name: `Attack · ${stats(await saved(p), u).attack} power`,
      exact: true,
    })
    .click();
  await reviewedState(p);
  return saved(p);
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
  const response = await p.request.get(new URL(imageUrl(c), url).href);
  assert.equal(response.status(), 200);
  const actual = createHash("sha256")
      .update(await response.body())
      .digest("hex"),
    expected = createHash("sha256")
      .update(await fs.readFile(`public${imageUrl(c)}`))
      .digest("hex");
  assert.equal(actual, expected, "original cached face bytes");
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
    let s = fixture(),
      hirgon = s.heroes[0],
      hirgonAlly = hand(s, "17004");
    s.phase = "quest";
    s.encounterDeck = ["01099", "01099"];
    hirgon.tempWill = 6;
    await load(p, s);
    await commit(p, hirgon);
    s = await next(p);
    assert.match(s.choice.title, /Hirgon/);
    await shot(p, "hirgon-native-successful-quest-response", width);
    await resume(p);
    s = await choose(p, "use");
    s = await choose(p, hirgonAlly.id);
    await shot(p, "hirgon-physical-matching-resource-choice", width);
    await resume(p);
    for (let i = 0; i < 4; i++) s = await choose(p, hirgon.id);
    assert.match(s.choice.title, /Strengthen/);
    await resume(p);
    s = await choose(p, "raise");
    assert.equal(get(s, hirgon.id).resources, 6);
    assert.equal(s.threat, 21);
    assert.ok(get(s, hirgonAlly.id));
    await shot(p, "hirgon-paid-discount-and-round-boost", width);

    s = fixture();
    const harad = ally(s, "17006"),
      spear = hand(s, P.spear);
    await load(p, s);
    s = await play(p, spear.id, harad.id);
    assert.equal(
      stats(s, get(s, harad.id)).attack,
      card(harad.code).attack + 1,
    );
    await shot(p, "spear-native-harad-attachment-and-passive", width);
    s = fixture();
    const attacker = ally(s, "17006"),
      physicalSpear = attach(s, attacker, P.spear),
      enemy = make(s, "01089");
    s.engaged = [enemy];
    s.phase = "attack";
    await load(p, s);
    s = await attack(p, enemy, attacker);
    assert.match(s.choice.title, /Haradrim Spear/);
    await shot(p, "spear-native-attack-response", width);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(get(s, enemy.id), undefined);
    assert.ok(
      !get(s, attacker.id).attachments.some((a) => a.id === physicalSpear.id),
    );
    assert.ok(s.discard.includes(P.spear));
    await shot(p, "spear-bonus-ends-and-exact-attachment-discards", width);

    s = fixture();
    const hunting = hand(s, P.hunting),
      hunted = make(s, "01089"),
      hunter = s.heroes[0];
    s.phase = "quest";
    s.staging = [hunted];
    s.encounterDeck = ["01099", "01099", "01099"];
    await load(p, s);
    s = await commit(p, hunter);
    assert.match(s.choice.title, /Hunting Party/);
    await shot(p, "hunting-party-native-all-player-commitment", width);
    await resume(p);
    s = await choose(p, hunted.id);
    assert.equal(get(s, hunted.id), undefined);
    assert.ok(s.discard.includes(P.hunting));
    assert.equal(s.staging.filter((u) => u.code === "01099").length, 2);
    await shot(p, "hunting-party-discard-and-extra-reveal", width);

    s = fixture();
    const arrowHost = s.heroes[1],
      arrow = attach(s, arrowHost, P.arrow);
    s.threat = 40;
    s.deck = ["01013", "01014", "01015", "01016", "01017", "17004"];
    s.phase = "quest";
    s.encounterDeck = ["01099", "01099"];
    arrowHost.tempWill = 6;
    await load(p, s);
    await commit(p, arrowHost);
    await settle(p);
    s = await next(p);
    assert.match(s.choice.title, /Red Arrow/);
    await shot(p, "red-arrow-native-valour-success-response", width);
    await resume(p);
    s = await choose(p, "use");
    assert.ok(s.victoryCards.includes(P.arrow));
    assert.ok(!get(s, arrowHost.id).attachments.some((a) => a.id === arrow.id));
    assert.ok(!s.choice.options.some((o) => o.code === "17004"));
    await shot(p, "red-arrow-victory-cost-and-top-five-search", width);
    await resume(p);
    s = await choose(p, s.choice.options.find((o) => o.code).id);
    assert.equal(s.allies.length, 1);
    await shot(p, "red-arrow-physical-ally-put-into-play", width);

    s = fixture();
    const watch = make(s, P.watch),
      watcher = s.heroes[0];
    s.staging = [watch];
    s.phase = "quest";
    s.sideQuestSelections = {
      shared: { id: watch.id, code: watch.code, phase: "quest" },
    };
    watcher.tempWill = 8;
    s.encounterDeck = ["01099"];
    await load(p, s);
    await commit(p, watcher);
    s = await next(p);
    s = await settle(p);
    assert.ok(s.victoryCards.includes(P.watch));
    assert.equal(s.progress, 0);
    await shot(p, "keep-watch-native-six-progress-victory", width);
    s = fixture(2);
    const watched = make(s, "01089"),
      unstaged = make(s, "01089");
    s.engaged = [watched];
    s.staging = [unstaged];
    s.victoryCards = [P.watch];
    await load(p, s);
    s = await saved(p);
    assert.equal(
      stats(s, get(s, watched.id)).attack,
      card(watched.code).attack - 1,
    );
    assert.equal(
      stats(s, get(s, unstaged.id)).attack,
      card(unstaged.code).attack,
    );
    await shot(p, "keep-watch-only-nonunique-engaged-attack-penalty", width);

    s = fixture();
    const rider = ally(s, P.rider);
    s.phase = "quest";
    s.victoryCards = [P.watch];
    s.encounterDeck = ["01099", "01099"];
    await load(p, s);
    s = await commit(p, rider);
    assert.equal(get(s, rider.id).exhausted, false);
    assert.equal(get(s, rider.id).committed, true);
    await resume(p);
    await shot(p, "rider-native-quest-commitment-stays-ready", width);

    s = fixture();
    s.heroes[1] = make(s, "02001");
    s.heroes[1].resources = 10;
    s.heroes[1].phaseResourceIcons = ["spirit"];
    s.startingHeroes = s.heroes.map((h) => h.code);
    const hobbit = s.heroes[1],
      song = hand(s, P.song);
    attach(s, hobbit, "02010");
    const baseWill = stats(s, hobbit).will;
    await load(p, s);
    s = await play(p, song.id, hobbit.id);
    assert.equal(stats(s, get(s, hobbit.id)).will, baseWill + 2);
    await resume(p);
    await shot(p, "fireside-song-native-hobbit-play-counts-two-songs", width);

    s = fixture(2);
    const lookout = ally(s, P.lookout, 1),
      keptLookout = ally(s, P.lookout, 1),
      quester = s.heroes[0];
    s.phase = "quest";
    s.encounterDeck = ["01089", "01099"];
    await load(p, s);
    s = await commit(p, quester);
    if (s.table.active !== s.table.turn) s=await next(p);
    s=await next(p);
    assert.ok(s.choice.options.some((o) => o.id === `lookout-${lookout.id}`));
    await shot(p, "lookout-native-enemy-when-revealed-cancel-window", width);
    await resume(p);
    s = await choose(p, `lookout-${lookout.id}`);
    assert.equal(get(s, lookout.id), undefined);
    assert.ok(get(s, keptLookout.id));
    assert.ok(seatView(s, 1).discard.includes(P.lookout));
    assert.equal(get(s, quester.id).damage, 0);
    await shot(p, "lookout-remote-controller-physical-cost-cancels", width);

    s = fixture();
    const rangerHost = s.heroes[2],
      ranger = hand(s, P.ranger);
    s.deck = ["01013"];
    await load(p, s);
    s = await play(p, ranger.id, rangerHost.id);
    assert.match(s.choice.title, /Doughty Ranger/);
    await shot(p, "doughty-ranger-native-hand-play-response", width);
    await resume(p);
    s = await choose(p, "use");
    assert.equal(s.hand[0].code, "01013");
    assert.ok(
      get(s, rangerHost.id).attachments.some((a) => a.id === ranger.id),
    );
    await shot(p, "doughty-ranger-granted-trait-and-optional-draw", width);

    s = fixture(2);
    ally(s, "17004");
    ally(s, P.rider);
    const peoples = hand(s, P.peoples);
    for (const player of [0, 1])
      forOwner(s, player, () => {
        for (const u of [...s.heroes, ...s.allies]) u.exhausted = true;
      });
    const own = s.heroes[0],
      remote = seatView(s, 1).heroes[0];
    await load(p, s);
    s = await play(p, peoples.id);
    assert.equal(get(s, own.id).exhausted, false);
    assert.equal(get(s, remote.id).exhausted, false);
    assert.equal(get(s, own.id).tempWill, 1);
    assert.equal(get(s, remote.id).tempWill, undefined);
    assert.ok(s.discard.includes(P.peoples));
    await resume(p);
    await shot(
      p,
      "free-peoples-native-nine-printed-traits-ready-all-own-bonus",
      width,
    );

    s = fixture();
    for (const definition of BENEATH_SANDS_PLAYER_CARDS)
      if (definition.type_code !== "hero") hand(s, definition.code);
    await load(p, s);
    for (const definition of BENEATH_SANDS_PLAYER_CARDS) {
      if (definition.type_code === "hero")
        await p
          .getByRole("button", {
            name: `Inspect ${card(definition.code).name}`,
            exact: true,
          })
          .click();
      else {
        const u = (await saved(p)).hand.find((u) => u.code === definition.code);
        await boardCard(p, u.id).locator(".hand-art").click();
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
    smoke ? 30 : 90,
    "every planned native control and original face is required",
  );
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
    sourceScriptSha256,
  });
  console.log(
    `Beneath the Sands players: ${screenshots.length} checkpoints passed (${url}).`,
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
