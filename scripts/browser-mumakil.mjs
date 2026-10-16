import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/mumakil-browser-fixtures.ts";
import { MUMAKIL as M, MUMAKIL_ENCOUNTERS, MUMAKIL_QUESTS } from "../src/game/mumakil-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, make } from "../src/game/core.ts";
import { allEngaged, forOwner, seatView } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, choose, context, fresh, load, next, opening, report, resume, saved, settle } from "./browser-angmar-helpers.mjs";
const widths = process.env.MUMAKIL_WIDTHS ? process.env.MUMAKIL_WIDTHS.split(",").map(Number) : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.MUMAKIL_OUTPUT_DIR ?? "output/mumakil";
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
import { MORDOR, MORDOR_ENCOUNTERS } from "../src/game/long-arm-mordor-support.ts";
const encounters = [...MUMAKIL_ENCOUNTERS, ...MORDOR_ENCOUNTERS.filter((c) => c.encounter_set === "Jungle Forest")];
try {
  for (const width of widths) {
    const view = await context(browser, width, width === 1280 ? 1000 : 844, errors, entries); page = view.p;
    for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) {
      await fresh(page, "the-mumakil", players, easy); await page.locator("#start-btn").click(); const s = await opening(page);
      assert.equal(s.scenarioId, "the-mumakil"); assert.equal(s.stage, 1); assert.ok(s.mumakil.initialized);
      assert.equal(s.staging.length, players); assert.equal(new Set(s.staging.map((l) => l.code)).size, players);
      assert.equal(s.encounterDeck.length, (easy ? 25 : 32) - players); assert.equal(s.mumakil.setAside.length, 8);
      assert.equal(await page.locator('[data-scenario-panel="mumakil"]').count(), 1);
      await checkpoint(page, `setup-${players}-${easy ? "easy" : "standard"}`, width); assert.deepEqual((await resume(page)).mumakil, s.mumakil);
    }
    let s = F.questFixture(1, 2); const beforeObjectives = s.mumakil.setAside.filter((u) => [M.lasso, M.spear, M.pit, M.noose].includes(u.code)).map((u) => u.id);
    await load(page, s); await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click(); await reviewedState(page);
    await checkpoint(page, "stage-one-native-quest-random-capture-choice", width); await resume(page); s = await settle(page);
    assert.equal(s.stage, 2); const attached = allEngaged(s).flatMap((u) => u.attachments); assert.equal(attached.length, 2); assert.ok(attached.every((a) => beforeObjectives.includes(a.id)));
    await checkpoint(page, "stage-two-physical-random-objectives-attached", width);

    for (const code of [M.lasso, M.spear, M.pit, M.noose]) {
      const f = F.captureFixture(code); await load(page, f.s);
      if (code === M.lasso) await attack(page, f.enemy, f.hero);
      if (code === M.spear) await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click();
      if (code === M.pit) await boardCard(page, f.s.staging[0].id).getByRole("button", { name: "Travel here", exact: true }).click();
      if (code === M.noose) await defend(page, f.enemy, f.hero);
      await reviewedState(page); s = await saved(page); assert.match(s.choice.title, /Attempt to capture/);
      const label = { [M.lasso]: "lasso", [M.spear]: "spear", [M.pit]: "pit", [M.noose]: "noose" }[code];
      await checkpoint(page, `${label}-native-capture-response`, width); await resume(page); await choose(page, "capture"); s = await settle(page);
      assert.ok(!get(s, f.enemy.id)); assert.ok(s.victoryCards.includes(code)); assert.ok(s.victoryCards.includes(M.wild));
      assert.match(await page.locator("[data-mumakil-captured]").textContent(), /1/);
      if ([M.spear, M.pit].includes(code)) assert.equal(s.status, "won");
      await checkpoint(page, `${label}-physical-pair-captured`, width);
    }
    // Native staging reveals the real treachery. Choices and physical Conditions survive reload.
    for (const code of [M.fever, M.insects, M.savage, M.stampede, M.python]) {
      const f = F.revealFixture(code); await load(page, f.s);
      await page.getByRole("button", { name: `Commit ${card(f.hero.code).name}`, exact: true }).click();
      await page.getByRole("button", { name: "Commit & reveal", exact: true }).last().click(); await reviewedState(page);
      const label = { [M.fever]: "fever", [M.insects]: "insects", [M.savage]: "savage", [M.stampede]: "stampede", [M.python]: "python-surge" }[code];
      if (code === M.fever) {
        for (let n = 0; n < 30; n++) {
          await reviewedState(page); const pending = await saved(page);
          if (pending.choice?.title.includes("Terrible Fever")) break;
          assert.ok(pending.choice, "Fever's actual attachment choice remains reachable after commitment responses");
          await choose(page, pending.choice.options.find((o) => o.id === "skip")?.id ?? pending.choice.options[0].id);
        }
        assert.match((await saved(page)).choice.title, /Terrible Fever/);
      }
      await checkpoint(page, `${label}-native-reveal`, width); await resume(page); s = await settle(page);
      if (code === M.fever) assert.ok(get(s, f.hero.id).attachments.some((a) => a.code === M.fever));
      if (code === M.insects) { assert.equal(s.hand.length, 0); assert.ok(s.discard.includes("01073")); }
      if (code === M.savage) { assert.ok(!s.allies.some((u) => u.code === "01013")); assert.deepEqual(s.deck, ["01033"]); }
      if (code === M.stampede) assert.ok(s.staging.some((u) => u.code === M.trail));
      if (code === M.python) assert.ok(s.staging.some((u) => u.code === M.python));
      await checkpoint(page, `${label}-physical-resolution`, width);
    }
    let f = F.shadowFixture(M.fever); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page);
    assert.ok(s.mumakil.cannotReady.some((p) => p.id === f.defender.id)); await checkpoint(page, "fever-native-shadow-ready-lock", width); await resume(page);
    f = F.shadowFixture(M.centipede); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page);
    assert.ok(get(s, f.defender.id).blanked); assert.ok(!get(s, f.defender.id).printedTraitsPreserved); await checkpoint(page, "centipede-native-shadow-full-blank", width);
    f = F.shadowFixture(M.savage, true); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page);
    assert.ok(!get(s, f.defender.id)); assert.ok(s.staging.some((u) => u.id === f.enemy.id)); await checkpoint(page, "savage-native-shadow-kill-return", width);
    // Real Python damage converts the exact enemy into the cannot-ready Condition.
    s = F.base(); F.setStage(s); s.phase = "defense"; const python = make(s, M.python); s.engaged.push(python); const hero = s.heroes[0];
    await load(page, s); await defend(page, python, hero); s = await settle(page);
    assert.ok(!get(s, python.id)); assert.ok(get(s, hero.id).attachments.some((a) => a.id === python.id));
    await checkpoint(page, "python-native-damage-physical-condition", width); await resume(page);
    // The refresh phase opens Wild Mûmak's actual end-of-round return-or-attack choice.
    s = F.base(); F.setStage(s); s.phase = "refresh"; const wild = F.addWild(s, M.noose); await load(page, s); await next(page); await reviewedState(page);
    s = await saved(page); assert.match(s.choice.title, /Wild Mûmak/); await checkpoint(page, "wild-native-end-round-choice", width);
    await resume(page); await choose(page, "return"); s = await settle(page); assert.ok(s.staging.some((u) => u.id === wild.id && u.attachments.length === 1));
    await checkpoint(page, "wild-native-end-round-staging-return", width);
    // An actual undefended attack destroys the last surviving hero and loses.
    s = F.base(); F.setStage(s); s.phase = "defense"; const last = s.heroes[0]; s.discard.push(...s.heroes.slice(1).map((u) => u.code)); s.heroes = [last]; last.damage = 4;
    const tiger = make(s, M.tiger); s.engaged.push(tiger); await load(page, s);
    await boardCard(page, tiger.id).getByRole("button", { name: "Defend", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: card(last.code).name, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Resolve enemy attack", exact: true }).click(); s = await settle(page);
    assert.equal(s.status, "lost"); await checkpoint(page, "native-combat-last-hero-loss", width);

    s = F.base(); s.encounterDiscard = encounters.map((c) => c.code); await load(page, s);
    await page.getByRole("button", { name: `Browse encounter discard: ${encounters.length} cards`, exact: true }).click();
    for (const c of encounters) {
      await page.locator(".pile-entry").filter({ has: page.locator(`img[data-card-code="${c.code}"]`) }).getByRole("button").first().click();
      await printed(page, card(c.code)); await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width); await close(page);
    }
    await close(page);
    for (const [i, c] of MUMAKIL_QUESTS.entries()) {
      s = F.base(); F.setStage(s, i + 1); await load(page, s); await page.locator(".journey-area .quest-card-stack").click();
      await page.getByRole("button", { name: "Read printed quest", exact: true }).click(); await printed(page, c);
      await page.getByRole("button", { name: "Show reverse", exact: true }).click(); await printed(page, c, true);
      await checkpoint(page, `printed-quest-${i + 1}-both-faces`, width); await close(page);
    }
    await view.c.close();
  }
  const bundle = JSON.parse(await fs.readFile("src/data/pending/the-mumakil-import.json", "utf8"));
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178").href); assert.equal(response.status(), 200);
    const bytes = await response.body(); assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const decoded = await artPage.evaluate(async (bytes) => { const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)])); const r = { width: bmp.width, height: bmp.height }; bmp.close(); return r; }, [...bytes]);
    assert.ok(decoded.width && decoded.height); artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.deepEqual([...printedFaces].sort(), bundle.artwork.map((a) => a.localPath).sort()); await artPage.close();
  await report(dir, { smoke: widths.join(",") !== "1280,390,320", sourceScriptSha256, errors, screenshots, entries, checks, printedFaces: [...printedFaces], artwork });
  console.log(`Mûmakil browser passed ${checks.length} checkpoints, ${artwork.length} original faces`);
} catch (error) {
  await fs.writeFile(`${dir}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, checks, errors, printedFaces: [...printedFaces], artwork }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${dir}/failure.png` }); throw error;
} finally { await browser.close(); }
