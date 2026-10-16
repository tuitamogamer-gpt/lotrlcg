import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  mumakilPlayerFixture as fixture,
  mumakilPlayerAlly as ally,
  mumakilPlayerHand as hand,
  mumakilPlayerAttach as attach,
} from "../tests/mumakil-player-fixtures.ts";
import {
  MUMAKIL_PLAYER as P,
  MUMAKIL_PLAYER_CARDS,
} from "../src/game/mumakil-player-support.ts";
import { card, plain, imageUrl } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { availableAbilities, validateSave } from "../src/game/engine.ts";
import { syncSeat, forOwner, seatView } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";

const sourceScriptSha256 = createHash("sha256")
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest("hex");
const url = process.env.GAME_URL ?? "http://127.0.0.1:5178";
process.env.GAME_URL = url;
const { saved, resume, choose, settle, next, context, capture, report } =
  await import("./browser-angmar-helpers.mjs");
const smoke = process.env.SMOKE === "1",
  dir = smoke ? "output/mumakil-players-smoke" : "output/mumakil-players";
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
  assert.ok(validateSave(s), "valid original Mûmakil player fixture");
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
    .getByRole("button", { name: "Commit & reveal", exact: true })
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
async function defend(p, e, u) {
  await boardCard(p, e.id)
    .getByRole("button", { name: "Defend", exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: card(u.code).name, exact: true })
    .click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve enemy attack", exact: true })
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
    let s = fixture(2),
      k = s.heroes[0],
      cost = hand(s, P.yazan),
      kept = hand(s, P.yazan),
      remote = ally(s, P.firyal, 1);
    remote.exhausted = true;
    await load(p, s);
    s = await ability(p, k.id);
    assert.match(s.choice.title, /Kahliel/);
    await shot(p, "kahliel-native-remote-ready-target", width);
    s = await choose(p, remote.id);
    await shot(p, "kahliel-physical-harad-discard-cost", width);
    await resume(p);
    s = await choose(p, cost.id);
    assert.equal(get(s, remote.id).exhausted, false);
    assert.ok(s.hand.some((u) => u.id === kept.id));
    assert.equal(s.discard.filter((code) => code === P.yazan).length, 1);
    await shot(p, "kahliel-paid-discard-remote-ready-after-reload", width);
    assert.ok(availableAbilities(s, get(s, k.id)).find((a) => !a.id).disabled);
    await shot(p, "kahliel-phase-limit-persisted", width);

    s = fixture();
    for (const h of s.heroes) {
      delete h.phaseResourceIcons;
      h.resources = h.code === P.kahliel ? 5 : 0;
    }
    const fhand = hand(s, P.firyal);
    await load(p, s);
    s = await play(p, fhand.id);
    assert.equal(s.heroes[0].resources, 0);
    assert.ok(s.allies.some((u) => u.id === fhand.id));
    await shot(p, "kahliel-pays-five-for-off-sphere-firyal", width);
    s.phase = "quest";
    s.encounterDeck = ["01089", "01100", "01099"];
    await load(p, s);
    s = await commit(p, get(s, fhand.id));
    assert.match(s.choice.title, /Firyal/);
    assert.ok(s.choice.options.every((o) => !o.code));
    await shot(p, "firyal-native-commit-private-response", width);
    s = await choose(p, "use");
    await shot(p, "firyal-actual-top-card-look", width);
    await resume(p);
    s = await choose(p, "discard");
    s = await settle(p);
    assert.ok(s.encounterDiscard.includes("01089"));
    assert.ok(s.staging.some((u) => u.code === "01100"));
    await shot(p, "firyal-discard-before-real-staging", width);

    s = fixture();
    s.phase = "attack";
    const y = ally(s, P.yazan),
      e = make(s, "01082"),
      other = make(s, "01089");
    s.engaged = [e];
    s.staging = [other];
    await load(p, s);
    s = await attack(p, e, y);
    assert.match(s.choice.title, /Yazan/);
    await shot(p, "yazan-native-attack-nonunique-target", width);
    await resume(p);
    s = await choose(p, other.id);
    s = await settle(p);
    assert.equal(get(s, other.id).damage, 1);
    assert.equal(get(s, y.id).exhausted, true);
    await shot(p, "yazan-response-damage-then-combat", width);

    s = fixture();
    s.phase = "defense";
    const j = ally(s, P.jubayr),
      enemy = make(s, "01089");
    enemy.shadows = ["01092"];
    s.engaged = [enemy];
    await load(p, s);
    s = await defend(p, enemy, j);
    assert.match(s.choice.title, /Jubayr/);
    await shot(p, "jubayr-native-exhaustion-facedown-shadow-choice", width);
    await resume(p);
    s = await choose(p, `${enemy.id}:0`);
    s = await settle(p);
    assert.ok(s.encounterDiscard.includes("01092"));
    assert.equal(get(s, j.id).damage, 0);
    await shot(p, "jubayr-physical-shadow-discard-before-reveal", width);

    s = fixture(2);
    const hd = hand(s, P.headdress),
      kh = s.heroes[0],
      yr = ally(s, P.yazan, 1);
    await load(p, s);
    s = await play(p, hd.id, kh.id);
    assert.equal(stats(s, get(s, yr.id)).will, 3);
    await shot(p, "headdress-native-attach-global-remote-willpower", width);
    s.phase = "refresh";
    s.discard = [P.firyal, "01013", P.yazan, "01014"];
    s.deck = ["01015"];
    await load(p, s);
    s = await ability(p, kh.id, hd.id);
    assert.deepEqual(s.discard, [P.firyal, "01013", "01014"]);
    assert.deepEqual([...s.deck].sort(), [P.yazan, "01015"].sort());
    await shot(p, "headdress-refresh-topmost-harad-ally-only", width);

    s = fixture();
    const q = hand(s, P.prepare);
    await load(p, s);
    s = await play(p, q.id);
    assert.ok(s.staging.some((u) => u.id === q.id));
    assert.equal(card(P.prepare).quest, 6);
    await shot(p, "prepare-for-battle-native-six-point-side-quest", width);
    s = fixture();
    s.phase = "refresh";
    s.victoryCards = [P.prepare];
    s.deck = ["01013", "01014", "01015"];
    await load(p, s);
    await next(p);
    s = await settle(p);
    assert.equal(s.hand.length, 2);
    await shot(p, "prepare-for-battle-real-resource-phase-extra-draw", width);

    s = fixture();
    const guard = hand(s, P.guardsman),
      foe = make(s, "01089");
    s.engaged = [foe];
    await load(p, s);
    s = await play(p, guard.id);
    assert.match(s.choice.title, /Andrath/);
    await shot(p, "andrath-original-native-play-response", width);
    await choose(p, "use");
    s = await choose(p, foe.id);
    assert.ok(s.used.some((key) => key.includes(foe.id)));
    await shot(p, "andrath-original-enemy-attack-prevention", width);

    s = fixture();
    hand(s, P.wait);
    s.encounterDeck = ["01077", "01081", "01077", "01077", "01077", "01089"];
    await load(p, s);
    s = await next(p);
    assert.match(s.choice.title, /Wait no Longer/);
    await choose(p, "use");
    await shot(p, "wait-no-longer-native-top-five-search", width);
    await resume(p);
    s = await choose(p, "enemy-1");
    await p
      .getByRole("button", { name: "Commit & reveal", exact: true })
      .last()
      .click();
    await reviewedState(p);
    s = await settle(p);
    assert.equal(s.staging.length, 0);
    assert.equal(s.engaged[0].code, "01081");
    await shot(p, "wait-no-longer-actual-staging-reduction", width);

    s = fixture();
    const dwarf = ally(s, "01028"),
      pipe = attach(s, dwarf, P.pipe),
      erebor = hand(s, "16004");
    s.deck = ["01013", "01014", "01015"];
    await load(p, s);
    await play(p, erebor.id);
    s = await choose(p, "discount");
    assert.match(s.choice.title, /Dwarf Pipe/);
    await shot(p, "dwarf-pipe-actual-guard-deck-discard-response", width);
    await resume(p);
    s = await choose(p, `${pipe.id}:0`);
    assert.match(s.choice.title, /resource payment/);
    s = await choose(p, s.choice.options.find((o) => o.id !== "cancel").id);
    assert.ok(s.allies.some((u) => u.id === erebor.id));
    assert.deepEqual(s.deck, ["01015", "01013"]);
    assert.deepEqual(s.discard, ["01014"]);
    await shot(p, "dwarf-pipe-physical-bottom-return-and-guard-payment", width);

    s = fixture();
    s.phase = "encounter";
    ally(s, P.yazan);
    ally(s, P.jubayr);
    const coney = hand(s, P.coney),
      engageEnemy = make(s, "01089");
    s.staging = [engageEnemy];
    await load(p, s);
    await boardCard(p, engageEnemy.id)
      .getByRole("button", { name: "Engage", exact: true })
      .click();
    await reviewedState(p);
    s = await saved(p);
    assert.match(s.choice.title, /Coney/);
    await shot(p, "coney-native-engagement-distinct-unique-traits", width);
    await resume(p);
    s = await choose(p, "use");
    s = await settle(p);
    assert.ok(s.discard.includes(P.coney));
    assert.ok(!s.hand.some((u) => u.id === coney.id));
    assert.ok(
      s.used.some((key) => key === `round:mumakil-coney:${engageEnemy.id}`),
    );
    await shot(p, "coney-paid-lore-cancels-round-attacks", width);

    s = fixture();
    for (const def of MUMAKIL_PLAYER_CARDS)
      if (def.type_code !== "hero") hand(s, def.code);
    await load(p, s);
    for (const def of MUMAKIL_PLAYER_CARDS) {
      if (def.type_code === "hero")
        await p
          .getByRole("button", { name: `Inspect ${def.name}`, exact: true })
          .click();
      else {
        const u = (await saved(p)).hand.find((u) => u.code === def.code);
        await boardCard(p, u.id).locator(".hand-art").click();
      }
      await printed(p, card(def.code));
      await shot(p, `printed-${def.code}`, width);
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
    }
    await c.close();
  }
  assert.equal(
    screenshots.length,
    smoke ? 34 : 102,
    "every native control and original printed face is required",
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
    `The Mûmakil players: ${screenshots.length} checkpoints passed (${url}).`,
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
