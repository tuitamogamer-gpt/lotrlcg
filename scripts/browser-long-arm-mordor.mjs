import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/long-arm-mordor-browser-fixtures.ts";
import { MORDOR as M, MORDOR_ENCOUNTERS, MORDOR_QUESTS, MORDOR_OBJECTIVE_HEROES } from "../src/game/long-arm-mordor-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make, stats } from "../src/game/core.ts";
import { allCharacters, allEngaged, forOwner, playerOrder, selectSeat } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, choose, context, fresh, load, next, opening, report, resume, saved, settle } from "./browser-angmar-helpers.mjs";
const widths = process.env.MORDOR_WIDTHS ? process.env.MORDOR_WIDTHS.split(",").map(Number) : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.MORDOR_OUTPUT_DIR ?? "output/long-arm-mordor";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto.createHash("sha256").update(await fs.readFile(new URL(import.meta.url))).digest("hex");
const browser = await chromium.launch({ headless: true });
const errors = [], screenshots = [], entries = new Set(), checks = [], printedFaces = new Set(), artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) {
  await reviewedState(p); await capture(p, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`); console.log(`PASS ${label} @ ${width}`);
}
async function close(p) { await p.getByRole("button", { name: "Close dialog", exact: true }).last().click(); }
async function printed(p, c, reverse = false) {
  const expected = reverse ? { ...c, name: c.back_name ?? c.name, text: c.back_text, imagesrc: c.back_imagesrc, shadow: undefined } : c;
  assert.equal(await p.locator("[data-card-primary-name]").textContent(), expected.name);
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(expected.text)) assert.equal(await rules.textContent(), plain(expected.text));
  else if (await rules.count()) assert.equal(await rules.textContent(), "No additional abilities.");
  const img = p.locator(".card-detail img[data-card-code]");
  assert.equal(new URL(await img.getAttribute("src"), p.url()).pathname, expected.imagesrc);
  assert.ok(await img.evaluate(async (i) => { await i.decode(); return i.naturalWidth > 0; }));
  const shadow = p.locator(".card-detail-primary .shadow-text");
  if (expected.shadow) assert.equal(await shadow.textContent(), plain(expected.shadow)); else assert.equal(await shadow.count(), 0);
  printedFaces.add(expected.imagesrc);
}
async function attack(p, enemy, hero) {
  await boardCard(p, enemy.id).getByRole("button", { name: "Attack", exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: card(hero.code).name, exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: /^Attack · [0-9]+ power$/ }).click();
  await reviewedState(p); return saved(p);
}
async function defend(p, enemy, hero) {
  await boardCard(p, enemy.id).getByRole("button", { name: "Defend", exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: card(hero.code).name, exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Resolve enemy attack", exact: true }).click();
  await reviewedState(p); return saved(p);
}
try {
  for (const width of widths) {
    const view = await context(browser, width, width === 1280 ? 1000 : 844, errors, entries); page = view.p;
    for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) {
      await fresh(page, "the-long-arm-of-mordor", players, easy); await page.locator("#start-btn").click();
      const s = await opening(page);
      assert.equal(s.scenarioId, "the-long-arm-of-mordor"); assert.equal(s.stage, 1); assert.ok(s.mordor.initialized);
      assert.equal(s.mordor.captured.length, players * 3); assert.equal(allCharacters(s).length, players);
      assert.equal(s.staging.filter((e) => e.code === M.enforcers).length, players);
      assert.equal(s.encounterDeck.length, easy ? 23 : 29);
      assert.equal(s.mordor.removed.length, 4 - players);
      assert.ok(allCharacters(s).every((h) => MORDOR_OBJECTIVE_HEROES.includes(h.code) && h.resources === 3));
      assert.equal(await page.locator('[data-scenario-panel="harad"] [data-harad-captured] button').count(), players * 3);
      await checkpoint(page, `setup-${players}-${easy ? "easy" : "standard"}`, width);
      assert.deepEqual((await resume(page)).mordor, s.mordor);
    }
    // Declared staging fixture; actual Resolve quest puts successful progress on 1B.
    let s = F.mordorQuestFixture(1, 2); const original = s.mordor.captured.map((h) => h.id);
    await load(page, s); await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click();
    await reviewedState(page); s = await saved(page); assert.match(s.choice.title, /Rescue a hero/);
    await checkpoint(page, "stage-one-native-quest-rescue-choice", width); await resume(page); s = await settle(page);
    assert.equal(s.stage, 2); assert.equal(s.mordor.captured.length, 4);
    assert.equal(allCharacters(s).filter((h) => original.includes(h.id) && h.exhausted).length, 2);
    await checkpoint(page, "stage-one-owned-heroes-rescued-exhausted", width);

    // Real first-card payment from the neutral objective-hero at stage 2B.
    s = F.base(); F.setStage(s, 2); const first = make(s, "01013"), second = make(s, "01013"); s.hand = [first, second];
    const pool = s.heroes[0].resources;
    await load(page, s); await boardCard(page, first.id).getByRole("button", { name: "Play card", exact: true }).click();
    await checkpoint(page, "first-card-neutral-resource-payment", width);
    await page.getByRole("dialog").getByRole("button", { name: "Play card", exact: true }).click(); s = await settle(page);
    assert.equal(s.heroes[0].resources, pool - 2); assert.ok(s.allies.some((a) => a.id === first.id));
    await checkpoint(page, "first-card-paid-neutral-pool", width); await resume(page);

    // Kahliel's real beginning-of-planning response can pay a remote hero.
    s = F.base(2); F.setStage(s, 2); s.phase = "resource";
    const remote = allCharacters(s).find((h) => h.code === M.firyal), beforeRemote = remote.resources;
    await load(page, s);
    for (let n = 0; (await saved(page)).phase === "resource"; n++) { assert.ok(n < 5); await next(page); }
    s = await saved(page); assert.match(s.choice.title, /Kahliel/);
    await checkpoint(page, "kahliel-native-planning-remote-resource-choice", width); await resume(page);
    await choose(page, remote.id); s = await settle(page); assert.equal(get(s, remote.id).resources, beforeRemote + 1);
    await checkpoint(page, "kahliel-resource-paid-to-remote-objective-hero", width);

    // Firyal's own hot-seat commitment opens a top-card choice before further staging.
    s = F.base(2); F.setStage(s, 2); s.phase = "quest"; s.encounterDeck = [M.uruk, M.hut, M.hut];
    selectSeat(s, 1); s.table.turn = 1; const firyal = s.heroes[0]; await load(page, s);
    await page.getByRole("button", { name: `Commit ${card(firyal.code).name}`, exact: true }).click();
    await next(page); await reviewedState(page);
    s = await saved(page); assert.match(s.choice.title, /Firyal/); assert.equal(s.choice.options[0].code, M.uruk);
    await checkpoint(page, "firyal-native-commit-top-encounter-choice", width); await resume(page); await choose(page, "discard"); s = await saved(page);
    assert.ok(s.encounterDiscard.includes(M.uruk)); assert.equal(s.encounterDeck[0], M.hut);
    await checkpoint(page, "firyal-physical-top-card-discarded", width);

    // Yazan is an objective-hero encounter source and may damage a player-immune guard.
    s = F.base(3); F.setStage(s, 3); s.phase = "attack"; selectSeat(s, 2); s.table.turn = 2;
    const yazan = s.heroes[0], yazanEnemy = make(s, M.uruk); s.engaged.push(yazanEnemy);
    s.mordor.guarding[s.mordor.captured[0].id] = yazanEnemy.id; await load(page, s);
    await attack(page, yazanEnemy, yazan); s = await saved(page); assert.match(s.choice.title, /Yazan/);
    await checkpoint(page, "yazan-native-attack-guard-damage-response", width); await resume(page); await choose(page, yazanEnemy.id); s = await settle(page);
    assert.equal(get(s, yazanEnemy.id).damage, 1); await checkpoint(page, "yazan-encounter-source-damages-immune-guard", width);

    // Jubayr's actual defense discards one physical facedown shadow before reveal.
    s = F.base(4); F.setStage(s, 2); s.phase = "defense"; selectSeat(s, 3); s.table.turn = 3;
    const jubayr = s.heroes[0], jubayrEnemy = make(s, M.uruk); jubayrEnemy.shadows = [M.savage, M.hut]; s.engaged.push(jubayrEnemy);
    await load(page, s); await defend(page, jubayrEnemy, jubayr); s = await saved(page); assert.match(s.choice.title, /Jubayr/);
    await checkpoint(page, "jubayr-native-defense-facedown-shadow-choice", width); await resume(page); await choose(page, `${jubayrEnemy.id}:0`); s = await settle(page);
    assert.deepEqual(get(s, jubayrEnemy.id).shadows, [M.hut]); assert.ok(s.encounterDiscard.includes(M.savage));
    await checkpoint(page, "jubayr-physical-shadow-discard-before-reveal", width);

    // Actual second-stage quest defeat chooses owned rescues, Orc searches and distinct guards.
    s = F.mordorQuestFixture(2, 2); await load(page, s);
    await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click(); await reviewedState(page);
    await checkpoint(page, "stage-two-native-quest-rescue-and-orc-search", width); await resume(page); s = await settle(page);
    assert.equal(s.stage, 3); assert.equal(s.mordor.captured.length, 2); assert.equal(Object.keys(s.mordor.guarding).length, 2);
    assert.equal(new Set(Object.values(s.mordor.guarding)).size, 2);
    await checkpoint(page, "stage-three-distinct-physical-guards", width);

    // Native attack defeats a guarded Orc and returns its exact exhausted hero.
    let f = F.mordorGuardFixture(); await load(page, f.s); await attack(page, f.enemy, f.attacker); s = await settle(page);
    assert.ok(!get(s, f.enemy.id)); assert.ok(s.heroes.some((h) => h.id === f.hero.id && h.exhausted)); assert.equal(s.mordor.captured.length, 0);
    await checkpoint(page, "guard-actual-defeat-rescues-physical-hero", width);

    // Native enemy staging reveals Mordor Warg, then its printed attach-and-return choice.
    f = F.mordorWargFixture(); await load(page, f.s);
    await page.getByRole("button", { name: `Commit ${card(f.hero.code).name}`, exact: true }).click();
    await page.getByRole("button", { name: "Commit & reveal", exact: true }).last().click(); await reviewedState(page);
    s = await saved(page); assert.match(s.choice.title, /Mordor Warg/); await checkpoint(page, "warg-native-reveal-attachment-choice", width);
    await resume(page); await choose(page, f.enemy.id); s = await settle(page);
    const mounted = get(s, f.enemy.id); assert.ok(s.staging.some((u) => u.id === mounted.id));
    assert.equal(mounted.attachments.filter((a) => a.code === M.warg).length, 1); assert.equal(stats(s, mounted).health, 6);
    await checkpoint(page, "warg-physical-mount-and-staging-return", width);

    // Every player pays a real Southron Boma travel cost before moving the card.
    s = F.base(2); s.phase = "travel"; const boma = make(s, M.boma); s.staging.push(boma);
    const resources = allCharacters(s).map((h) => ({ id: h.id, resources: h.resources })); await load(page, s);
    await boardCard(page, boma.id).getByRole("button", { name: "Travel here", exact: true }).click();
    await reviewedState(page); await checkpoint(page, "boma-native-each-player-travel-cost", width); await resume(page); s = await settle(page);
    assert.equal(s.activeLocation.id, boma.id); for (const h of resources) assert.equal(get(s, h.id).resources, h.resources - 1);
    await checkpoint(page, "boma-physical-travel-paid-by-both-players", width);

    // Printed Southron Boma shadow readies an objective-hero and prevents this attack's damage.
    f = F.mordorShadowFixture(M.boma); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page);
    assert.equal(get(s, f.defender.id).damage, 0); assert.equal(get(s, f.defender.id).exhausted, false);
    await checkpoint(page, "boma-shadow-objective-hero-readied-no-damage", width);

    // Savage Attack shadow's actual character destruction reveals the top encounter card afterward.
    f = F.mordorShadowFixture(M.savage, true); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page);
    assert.ok(!get(s, f.defender.id)); assert.ok(s.staging.some((u) => u.code === M.hut));
    await checkpoint(page, "savage-shadow-actual-kill-reveals-next-encounter", width);

    f = F.mordorFinalFixture(); await load(page, f.s); await attack(page, f.enemy, f.hero); s = await settle(page);
    assert.equal(s.status, "won"); assert.ok(!get(s, f.enemy.id)); await checkpoint(page, "final-native-combat-victory", width);
    f = F.mordorFinalFixture(true); await load(page, f.s); await defend(page, f.enemy, f.hero); s = await settle(page);
    assert.equal(s.status, "lost"); await checkpoint(page, "objective-hero-actual-destruction-loss", width);

    // Read every promoted original face through ordinary pile and quest dialogs.
    s = F.base(); s.encounterDiscard = MORDOR_ENCOUNTERS.map((c) => c.code); await load(page, s);
    await page.getByRole("button", { name: `Browse encounter discard: ${MORDOR_ENCOUNTERS.length} cards`, exact: true }).click();
    for (const c of MORDOR_ENCOUNTERS) {
      await page.locator(".pile-entry").filter({ has: page.locator(`img[data-card-code="${c.code}"]`) }).getByRole("button").first().click();
      await printed(page, card(c.code)); await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width); await close(page);
    }
    await close(page);
    for (const [i, c] of MORDOR_QUESTS.toSorted((a, b) => Number(a.cost) - Number(b.cost)).entries()) {
      s = F.base(); F.setStage(s, i + 1); await load(page, s);
      await page.locator(".journey-area .quest-card-stack").click(); await page.getByRole("button", { name: "Read printed quest", exact: true }).click();
      await printed(page, c); await page.getByRole("button", { name: "Show reverse", exact: true }).click(); await printed(page, c, true);
      await checkpoint(page, `printed-quest-${i + 1}-both-faces`, width); await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(await fs.readFile("src/data/pending/the-long-arm-of-mordor-import.json", "utf8"));
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178").href); assert.equal(response.status(), 200);
    const bytes = await response.body(); assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const decoded = await artPage.evaluate(async (bytes) => { const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)])); const result = { width: bmp.width, height: bmp.height }; bmp.close(); return result; }, [...bytes]);
    assert.ok(decoded.width && decoded.height); artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.deepEqual([...printedFaces].sort(), bundle.artwork.map((a) => a.localPath).sort()); await artPage.close();
  await report(dir, { smoke: widths.join(",") !== "1280,390,320", sourceScriptSha256, errors, screenshots, entries, checks, printedFaces: [...printedFaces], artwork });
  console.log(`Long Arm of Mordor browser passed ${checks.length} checkpoints, ${artwork.length} original faces`);
} catch (error) {
  await fs.writeFile(`${dir}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, checks, errors, printedFaces: [...printedFaces], artwork }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${dir}/failure.png` }); throw error;
} finally { await browser.close(); }
