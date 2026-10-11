import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import {
  depthsPlayerFixture as fixture,
  depthsPlayerHand as hand,
  depthsPlayerAlly as ally,
} from "../tests/depths-player-fixtures.ts";
import {
  DEPTHS_PLAYER as P,
  DEPTHS_PLAYER_CARDS,
} from "../src/game/depths-player-support.ts";
import { depthsPlayerAbilityLabel } from "../src/game/depths-player.ts";
import { card, imageUrl } from "../src/game/cards.ts";
import { fx, get, make, stats, threatOf } from "../src/game/core.ts";
import { selectSeat, syncSeat } from "../src/game/table.ts";
import { validateSave } from "../src/game/engine.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { pauseFor } from "../src/game/presentation.ts";
import { angmarSyncSwordThain } from "../src/game/angmar-player.ts";

const url =
  process.env.GAME_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.DEPTHS_BROWSER_SMOKE === "1";
const dir = "output/depths-players";
await fs.mkdir(dir, { recursive: true });
const launch = { headless: true };
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
  const value = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (value) {
    const proxy = new URL(value);
    launch.proxy = { server: `${proxy.protocol}//${proxy.host}` };
    if (proxy.username)
      launch.proxy.username = decodeURIComponent(proxy.username);
    if (proxy.password)
      launch.proxy.password = decodeURIComponent(proxy.password);
  }
}
const browser = await chromium.launch(launch);
const errors = [],
  entries = new Set(),
  screenshots = [],
  checks = [];
let activePage;
async function load(p, s) {
  syncSeat(s);
  assert.ok(validateSave(s), "valid player browser fixture");
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
function queued(s, title) {
  s.flow = { nextId: 1, pending: null, history: [], mode: "all" };
  pauseFor(s, {
    kind: "quest",
    title,
    detail:
      "Continue the saved framework event before resolving its queued effect.",
  });
}
async function shot(p, label, width) {
  await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label} @ ${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(p, id, target) {
  await p
    .locator(`[data-motion-card="${id}"]`)
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
async function act(p, _id, code) {
  await p
    .getByRole("button", { name: depthsPlayerAbilityLabel(code), exact: true })
    .click();
  await reviewedState(p);
  return saved(p);
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
    // Three real printed Surge reveals, capped at two Responses in this phase.
    let s = fixture(),
      lanwyn = s.heroes[0];
    lanwyn.exhausted = true;
    s.encounterDeck = ["01115", "01099", "01115", "01099", "01115", "01099"];
    s.queue = [fx("reveal"), fx("reveal"), fx("reveal")];
    queued(s, "Reveal cards with Surge");
    await load(p, s);
    s = await saved(p);
    assert.match(s.choice.title, /Lanwyn/);
    await shot(p, "lanwyn-surge-response", width);
    await resume(p);
    await choose(p, "ready");
    s = await saved(p);
    assert.equal(get(s, lanwyn.id).exhausted, false);
    assert.match(s.choice.title, /Lanwyn/);
    await shot(p, "lanwyn-ready-next-surge", width);
    await resume(p);
    await choose(p, "will");
    s = await settle(p);
    assert.equal(stats(s, get(s, lanwyn.id)).will, 4);
    assert.equal(s.used.filter((k) => k.includes("lanwyn:")).length, 2);
    await shot(p, "lanwyn-second-response-phase-limit", width);
    await next(p);
    s = await settle(p);
    assert.equal(stats(s, get(s, lanwyn.id)).will, 2);
    await shot(p, "lanwyn-phase-expiry", width);

    // The initiating player spends their own Lore resource for another player's Eldahir.
    s = fixture(2);
    const eldahir = ally(s, P.eldahir),
      enemy = make(s, "01082");
    enemy.shadows = ["01089", "01099"];
    enemy.faceupShadows = [false, false];
    s.engaged.push(enemy);
    s.phase = "defense";
    selectSeat(s, 1);
    const payer = s.heroes[0],
      before = payer.resources;
    await load(p, s);
    await p
      .getByRole("button", {
        name: "Eldahir · " + depthsPlayerAbilityLabel(P.eldahir),
        exact: true,
      })
      .click();
    await reviewedState(p);
    await shot(p, "eldahir-any-player-lore-payer", width);
    await resume(p);
    await choose(p, payer.id);
    await shot(p, "eldahir-individual-facedown-shadow", width);
    await resume(p);
    await choose(p, enemy.id + ":0");
    s = await saved(p);
    assert.equal(get(s, payer.id).resources, before - 1);
    assert.deepEqual(get(s, enemy.id).faceupShadows, [false, false]);
    assert.equal(stats(s, get(s, eldahir.id)).defense, 4);
    assert.equal(s.choice.options[0].code, "01089");
    await shot(p, "eldahir-private-look-defense-result", width);
    await resume(p);
    await choose(p, "continue");
    s = await saved(p);
    assert.deepEqual(get(s, enemy.id).shadows, ["01089", "01099"]);
    const usedEldahirAbility = p.locator(
      `[data-motion-card="${eldahir.id}"] .abilities > button`,
    );
    assert.equal(await usedEldahirAbility.count(), 1);
    assert.ok(await usedEldahirAbility.isDisabled());
    assert.equal(await usedEldahirAbility.isVisible(), false);
    await shot(p, "eldahir-once-phase-faces-still-down", width);

    // Captain's Wisdom is played in the visible Resource action window.
    s = fixture();
    s.phase = "resource";
    const noble = s.heroes[1],
      wisdom = hand(s, P.wisdom);
    await load(p, s);
    await p
      .locator(`[data-motion-card="${wisdom.id}"]`)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await shot(p, "wisdom-resource-noble-selection", width);
    await p
      .locator(`.decision-card[data-unit-id="${noble.id}"] .decision-select`)
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    assert.equal(get(s, noble.id).resources, 12);
    assert.equal(get(s, noble.id).exhausted, true);
    await resume(p);
    await shot(p, "wisdom-real-exhaustion-resource-result", width);

    // Actual paid PLAY remembers one paying hero through the attachment Response.
    s = fixture();
    const warrior = s.heroes[2];
    s.heroes.forEach((h) => (h.resources = 0));
    warrior.resources = 3;
    const smith = hand(s, P.ironsmith),
      plate = hand(s, "01040");
    s.discard = [P.raiment];
    await load(p, s);
    await play(p, smith.id);
    await shot(p, "ironsmith-single-payer-hand-discard", width);
    await resume(p);
    await choose(p, "discard-0");
    s = await settle(p);
    assert.equal(get(s, warrior.id).resources, 0);
    assert.equal(get(s, warrior.id).attachments[0].code, P.raiment);
    assert.ok(s.hand.some((u) => u.id === plate.id));
    await shot(p, "ironsmith-free-discard-raiment-result", width);
    s = fixture();
    const swordHero = ally(s, P.eldahir);
    swordHero.attachments.push({
      id: "a" + s.nextId++,
      code: "10149",
      exhausted: false,
      owner: 0,
    });
    swordHero.resources = 3;
    swordHero.phaseResourceIcons = ["tactics"];
    s.heroes.forEach((h) => (h.resources = 0));
    const swordSmith = hand(s, P.ironsmith),
      swordPlate = hand(s, "01040");
    angmarSyncSwordThain(s);
    await load(p, s);
    await play(p, swordSmith.id);
    await shot(p, "ironsmith-effective-hero-paid-response", width);
    await resume(p);
    await choose(p, swordPlate.id);
    s = await settle(p);
    assert.equal(get(s, swordHero.id).resources, 0);
    assert.ok(
      get(s, swordHero.id).attachments.some((a) => a.id === swordPlate.id),
    );
    await shot(p, "ironsmith-sword-thain-physical-host", width);

    // Raiment's normal play uses two Restricted slots and its Warrior bonuses.
    s = fixture();
    const fighter = s.heroes[2];
    s.heroes.forEach((h) => (h.resources = 0));
    fighter.resources = 10;
    fighter.attachments.push({
      id: "a" + s.nextId++,
      code: "01040",
      exhausted: false,
      owner: 0,
    });
    const oldPlate = fighter.attachments[0],
      raiment = hand(s, P.raiment);
    await load(p, s);
    await p
      .locator(`[data-motion-card="${raiment.id}"]`)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await shot(p, "raiment-warrior-play-targets", width);
    await p
      .locator(`.decision-card[data-unit-id="${fighter.id}"] .decision-select`)
      .click();
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await reviewedState(p);
    await shot(p, "raiment-two-restricted-slots", width);
    await resume(p);
    s = await saved(p);
    assert.ok(s.choice.options.some((o) => o.id === oldPlate.id));
    await choose(p, oldPlate.id);
    s = await settle(p);
    assert.equal(get(s, fighter.id).resources, 8);
    assert.equal(stats(s, get(s, fighter.id)).attack, 3);
    assert.equal(stats(s, get(s, fighter.id)).defense, 3);
    assert.equal(stats(s, get(s, fighter.id)).health, 7);
    await shot(p, "raiment-paid-bonuses-result", width);

    // Sam's printed cost condition uses the owner's Frodo, followed by a remote payer.
    s = fixture();
    s.heroes[1] = make(s, "02025");
    const samHand = hand(s, P.sam),
      spirit = s.heroes[0];
    await load(p, s);
    await p
      .locator(`[data-motion-card="${samHand.id}"]`)
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    await shot(p, "sam-own-frodo-discount-play", width);
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "Play card", exact: true })
      .click();
    s = await settle(p);
    assert.equal(get(s, spirit.id).resources, 9);
    await shot(p, "sam-one-resource-play-result", width);
    s = fixture(2);
    const sam = ally(s, P.sam);
    sam.exhausted = true;
    selectSeat(s, 1);
    s.phase = "staging";
    s.staging = [make(s, "01099")];
    const remoteSpirit = s.heroes[2],
      remoteBefore = remoteSpirit.resources;
    await load(p, s);
    await next(p);
    s = await saved(p);
    assert.match(s.choice.title, /Sam Gamgee/);
    while (
      s.choice.options.find((o) => o.id === "pay")?.ability?.player !== 1
    ) {
      await choose(p, "skip");
      s = await saved(p);
      assert.match(s.choice.title, /Sam Gamgee/);
    }
    await shot(p, "sam-remote-threat-response", width);
    await resume(p);
    await choose(p, "pay");
    await shot(p, "sam-remote-spirit-payer", width);
    await resume(p);
    await choose(p, remoteSpirit.id);
    s = await settle(p);
    assert.equal(get(s, remoteSpirit.id).resources, remoteBefore - 1);
    assert.equal(get(s, sam.id).exhausted, false);
    assert.equal(stats(s, get(s, sam.id)).will, 3);
    assert.equal(stats(s, get(s, sam.id)).defense, 2);
    await shot(p, "sam-round-ready-and-stat-result", width);

    // Elevenses picks physical own questing Hobbits only, after staging.
    s = fixture();
    const elevSam = ally(s, P.sam),
      frodo = make(s, "02025");
    s.heroes[1] = frodo;
    for (const u of [elevSam, frodo]) {
      u.committed = true;
      u.exhausted = true;
    }
    s.committedIds = [elevSam.id, frodo.id];
    s.phase = "staging";
    s.staging = [make(s, "01100")];
    const elev = hand(s, P.elevenses);
    await load(p, s);
    await play(p, elev.id);
    await shot(p, "elevenses-post-staging-hobbit-selection", width);
    await resume(p);
    await choose(p, elevSam.id);
    await shot(p, "elevenses-physical-selected-one", width);
    await resume(p);
    await choose(p, frodo.id);
    await choose(p, "finish");
    s = await saved(p);
    assert.equal(s.threat, 18);
    assert.equal(get(s, elevSam.id).committed, false);
    assert.equal(get(s, frodo.id).exhausted, false);
    await shot(p, "elevenses-ready-remove-reduce-result", width);
    await resume(p);
    await next(p);
    s = await settle(p);
    assert.equal(s.threat, 20);
    assert.equal(s.lastQuest.will, 0);
    await shot(p, "elevenses-removal-affects-quest-result", width);

    // Quest success adds one token; a real readying event opens Explorer's Action.
    s = fixture();
    const explorer = ally(s, P.explorer),
      questHero = s.heroes[0],
      location = make(s, "01100");
    explorer.progress = 3;
    for (const u of [explorer, questHero]) {
      u.committed = true;
      u.exhausted = true;
    }
    s.committedIds = [explorer.id, questHero.id];
    s.phase = "staging";
    s.staging = [location];
    const vigilant = hand(s, "01020");
    await load(p, s);
    await next(p);
    await shot(p, "explorer-actual-success-response", width);
    await resume(p);
    await choose(p, "progress");
    await settle(p);
    await play(p, vigilant.id, explorer.id);
    s = await settle(p);
    assert.equal(get(s, explorer.id).progress, 4);
    assert.equal(get(s, explorer.id).exhausted, false);
    await shot(p, "explorer-progress-pile-readied", width);
    await act(p, explorer.id, P.explorer);
    await shot(p, "explorer-location-movement-target", width);
    await resume(p);
    await choose(p, location.id);
    s = await settle(p);
    assert.equal(get(s, explorer.id).progress, 0);
    assert.equal(get(s, explorer.id).exhausted, true);
    assert.ok(!s.staging.some((u) => u.id === location.id));
    assert.ok(s.encounterDiscard.includes(location.code));
    await shot(p, "explorer-exhaust-move-explore-result", width);

    // Guarded's attachment controller pays two different Scout exhaustion costs.
    s = fixture();
    const guardedLocation = make(s, "01100"),
      scout = s.heroes[0],
      secondScout = ally(s, P.explorer);
    s.staging = [guardedLocation];
    const guarded = hand(s, P.guarded);
    await load(p, s);
    await play(p, guarded.id, guardedLocation.id);
    await settle(p);
    await act(p, guardedLocation.id, P.guarded);
    await shot(p, "guarded-controller-scout-cost", width);
    await resume(p);
    await choose(p, scout.id);
    s = await saved(p);
    assert.equal(threatOf(s, get(s, guardedLocation.id)), 0);
    assert.equal(get(s, scout.id).exhausted, true);
    await shot(p, "guarded-first-threat-reduction", width);
    await act(p, guardedLocation.id, P.guarded);
    await shot(p, "guarded-second-scout-no-source-exhaust", width);
    await resume(p);
    await choose(p, secondScout.id);
    s = await saved(p);
    assert.equal(get(s, guardedLocation.id).tempThreat, -4);
    assert.equal(get(s, guardedLocation.id).attachments[0].exhausted, false);
    await shot(p, "guarded-stacked-phase-reduction", width);
    await next(p);
    s = await settle(p);
    assert.equal(threatOf(s, get(s, guardedLocation.id)), 2);
    await shot(p, "guarded-phase-expiry-result", width);

    const faces = DEPTHS_PLAYER_CARDS.map(imageUrl);
    const broken = await p.evaluate(
      async (urls) =>
        (
          await Promise.all(
            urls.map(async (src) => {
              const image = new Image();
              image.src = src;
              try {
                await image.decode();
                return null;
              } catch {
                return src;
              }
            }),
          )
        ).filter(Boolean),
      faces,
    );
    assert.deepEqual(broken, []);
    assert.equal(card(P.lanwyn).name, "Lanwyn");
    checks.push(`${faces.length} original player faces decoded @ ${width}`);
    await c.close();
  }
  await report(dir, {
    entries,
    errors,
    screenshots,
    checks,
    reviewMode: "all",
    smoke,
  });
  console.log(
    `Depths players: ${screenshots.length} actual browser checkpoints passed (${url}).`,
  );
} catch (error) {
  await fs.writeFile(
    `${dir}/failure.json`,
    JSON.stringify(
      {
        url,
        errors,
        screenshots,
        failure: String(error),
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
