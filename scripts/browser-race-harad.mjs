import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { chromium } from "playwright";
import * as F from "../tests/race-harad-browser-fixtures.ts";
import { RACE_HARAD as R, RACE_HARAD_QUESTS } from "../src/game/race-harad-support.ts";
import { card, plain } from "../src/game/cards.ts";
import { get, stats } from "../src/game/core.ts";
import { allCharacters, allEngaged } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, choose, context, fresh, load, opening, report, resume, saved, settle } from "./browser-angmar-helpers.mjs";
const widths = process.env.RACE_HARAD_WIDTHS ? process.env.RACE_HARAD_WIDTHS.split(",").map(Number) : [1280, 390, 320];
assert.ok(widths.length && widths.every((n) => [1280, 390, 320].includes(n)));
const dir = process.env.RACE_HARAD_OUTPUT_DIR ?? "output/race-harad";
await fs.mkdir(dir, { recursive: true });
const sourceScriptSha256 = crypto.createHash("sha256").update(await fs.readFile(new URL(import.meta.url))).digest("hex");
const browser = await chromium.launch({ headless: true }), errors = [], screenshots = [], entries = new Set(), checks = [], printedFaces = new Set(), artwork = [];
let page;
const boardCard = (p, id) => p.locator(`[data-motion-card="${id}"]`);
async function checkpoint(p, label, width) { await reviewedState(p); await capture(p, dir, `${label}-${width}`, screenshots); checks.push(`${label}-${width}`); console.log(`PASS ${label} @ ${width}`); }
async function close(p) { await p.getByRole("button", { name: "Close dialog", exact: true }).last().click(); }
async function printed(p, c, reverse = false) {
  const expected = reverse ? { ...c, name: c.back_name ?? c.name, text: c.back_text, imagesrc: c.back_imagesrc, shadow: undefined } : c;
  assert.equal(await p.locator("[data-card-primary-name]").textContent(), expected.name);
  const rules = p.locator("[data-card-primary-rules]");
  if (plain(expected.text)) assert.equal(await rules.textContent(), plain(expected.text)); else if (await rules.count()) assert.equal(await rules.textContent(), "No additional abilities.");
  const img = p.locator(".card-detail img[data-card-code]"); assert.equal(new URL(await img.getAttribute("src"), p.url()).pathname, expected.imagesrc);
  assert.ok(await img.evaluate(async (i) => { await i.decode(); return i.naturalWidth > 0; }));
  const shadow = p.locator(".card-detail-primary .shadow-text"); if (expected.shadow) assert.equal(await shadow.textContent(), plain(expected.shadow)); else assert.equal(await shadow.count(), 0);
  printedFaces.add(expected.imagesrc);
}
async function defend(p, enemy, defender) {
  await boardCard(p, enemy.id).getByRole("button", { name: "Defend", exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: card(defender.code).name, exact: true }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Resolve enemy attack", exact: true }).click(); await reviewedState(p); return saved(p);
}
const bundle = JSON.parse(await fs.readFile("src/data/pending/race-across-harad-import.json", "utf8"));
const encounters = bundle.cards.filter((c) => c.type_code !== "quest").map((c) => card(c.code));
try {
  for (const width of widths) {
    const view = await context(browser, width, width === 1280 ? 1000 : 844, errors, entries); page = view.p;
    for (const players of [1, 2, 3, 4]) for (const easy of [false, true]) {
      await fresh(page, "race-across-harad", players, easy); await page.locator("#start-btn").click(); const s = await opening(page);
      assert.equal(s.scenarioId, "race-across-harad"); assert.equal(s.stage, 2); assert.equal(s.raceHarad.enemyStage, 1); assert.ok(s.raceHarad.initialized);
      assert.equal(allCharacters(s).filter((u) => u.code === R.tamed).length, players); assert.equal(s.raceHarad.removed.length, 4 - players);
      assert.equal(s.staging.filter((u) => card(u.code).type_code === "location").length, players); assert.equal(s.encounterDeck.length, (easy ? 34 : 38) - players);
      assert.equal(await page.locator('[data-scenario-panel="race-harad"]').count(), 1); await checkpoint(page, `setup-${players}-${easy ? "easy" : "standard"}`, width); assert.deepEqual((await resume(page)).raceHarad, s.raceHarad);
    }
    // The physical Mount remains in staging until the original saved choice is resolved.
    let f = F.raceWarg(); const physical = f.s.staging.find((u) => u.code === R.racingWarg), before = stats(f.s, f.target);
    await load(page, f.s); await checkpoint(page, "warg-native-pending-physical-choice", width); await resume(page); await choose(page, f.target.id); let s = await settle(page);
    const host = get(s, f.target.id); assert.equal(host.attachments[0].id, physical.id); assert.equal(stats(s, host).attack, before.attack + 1); await checkpoint(page, "warg-native-physical-mount-attached", width); await resume(page);
    for (const code of [R.racingWarg, R.pursuer, R.road, R.howling, R.pursuers, R.sandstorm, R.exhaustion, R.fear]) {
      f = F.raceReveal(code); await load(page, f.s); await page.getByRole("button", { name: `Commit ${card(f.hero.code).name}`, exact: true }).click(); await page.getByRole("button", { name: "Commit & reveal", exact: true }).last().click(); await reviewedState(page);
      const label = { [R.racingWarg]: "racing-warg", [R.pursuer]: "pursuer", [R.road]: "road", [R.howling]: "howling", [R.pursuers]: "pursuers", [R.sandstorm]: "sandstorm", [R.exhaustion]: "heat-exhaustion", [R.fear]: "fear" }[code];
      await checkpoint(page, `${label}-native-reveal`, width); await resume(page); s = await settle(page);
      if (code === R.racingWarg) assert.ok(get(s, f.target.id).attachments.some((a) => a.code === code));
      else if ([R.pursuer, R.road].includes(code)) assert.ok(s.raceHarad.area.some((u) => u.code === code));
      else if (code === R.howling) assert.ok(s.raceHarad.howling.length);
      else if (code === R.sandstorm) assert.equal(s.hand.length, 0);
      else if (code === R.exhaustion) assert.ok(allCharacters(s).some((u) => u.damage));
      else if (code === R.fear) assert.ok(s.used.some((v) => v.startsWith("round:mordor-fear")));
      else assert.ok(s.encounterDiscard.includes(code));
      await checkpoint(page, `${label}-physical-resolution`, width);
    }
    for (const stage of [2, 3, 4]) {
      f = F.raceQuest(stage); await load(page, f.s); await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click(); await reviewedState(page); await checkpoint(page, `player-stage-${stage}-native-resolution`, width); await resume(page); s = await settle(page);
      assert.equal(s.stage, Math.min(4, stage + 1)); if (stage === 4) assert.equal(s.status, "won"); await checkpoint(page, `player-stage-${stage}-physical-result`, width);
    }
    for (const caught of [false, true]) {
      f = F.racePursuit(caught); await load(page, f.s); await page.getByRole("button", { name: "Resolve quest", exact: true }).last().click(); s = await settle(page); assert.equal(s.status, caught ? "lost" : "playing"); assert.equal(s.raceHarad.enemyStage, 2); await checkpoint(page, caught ? "native-orc-pursuit-caught-loss" : "native-orc-pursuit-stage-convergence", width); await resume(page);
    }
    for (const code of [R.erg, R.expanse, R.dunes, R.oasis, R.river]) {
      f = F.raceTravel(code); await load(page, f.s); await boardCard(page, f.location.id).getByRole("button", { name: "Travel here", exact: true }).click(); await reviewedState(page); await resume(page); s = await settle(page); assert.equal(s.activeLocation?.id, f.location.id); await checkpoint(page, `native-travel-${code.slice(6, 14)}`, width);
    }
    for (const code of [R.pursuer, R.howling, R.pursuers, R.road, R.sandstorm, R.exhaustion]) {
      f = F.raceShadow(code, code === R.pursuers); await load(page, f.s); await defend(page, f.enemy, f.defender); s = await settle(page); await resume(page);
      if (code === R.pursuer) assert.ok(allEngaged(s).some((u) => u.code === R.pursuer)); if (code === R.road) assert.ok(s.raceHarad.area.some((u) => u.id === f.enemy.id)); if (code === R.pursuers) assert.equal(s.raceHarad.enemyProgress, 3);
      await checkpoint(page, `native-shadow-${code.slice(6, 14)}`, width);
    }
    s = F.base(); s.encounterDiscard = encounters.map((c) => c.code); await load(page, s); await page.getByRole("button", { name: `Browse encounter discard: ${encounters.length} cards`, exact: true }).click();
    for (const c of encounters) { await page.locator(".pile-entry").filter({ has: page.locator(`img[data-card-code="${c.code}"]`) }).getByRole("button").first().click(); await printed(page, c); await checkpoint(page, `printed-encounter-${c.code.slice(6, 14)}`, width); await close(page); }
    await close(page);
    for (const [i, c] of RACE_HARAD_QUESTS.entries()) {
      s = F.base(); await load(page, s); const details = page.locator('[data-scenario-panel="race-harad"] details'); await details.locator("summary").click();
      await details.getByRole("button", { name: `${i < 4 ? i + 1 : i - 3}${i < 4 ? "A/B" : "C/D"} · ${c.name}`, exact: true }).click();
      await printed(page, c); await page.getByRole("button", { name: "Show reverse", exact: true }).click(); await printed(page, c, true); await checkpoint(page, `printed-quest-${i + 1}-both-faces`, width); await close(page);
    }
    await view.c.close();
  }
  const artPage = await browser.newPage();
  for (const a of bundle.artwork) {
    const response = await artPage.request.get(new URL(a.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178").href); assert.equal(response.status(), 200); const bytes = await response.body(); assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), a.sha256);
    const decoded = await artPage.evaluate(async (bytes) => { const bmp = await createImageBitmap(new Blob([Uint8Array.from(bytes)])); const r = { width: bmp.width, height: bmp.height }; bmp.close(); return r; }, [...bytes]); assert.ok(decoded.width && decoded.height); artwork.push({ path: a.localPath, sha256: a.sha256, ...decoded });
  }
  assert.deepEqual([...printedFaces].sort(), bundle.artwork.map((a) => a.localPath).sort()); await artPage.close();
  await report(dir, { smoke: widths.join(",") !== "1280,390,320", sourceScriptSha256, errors, screenshots, entries, checks, printedFaces: [...printedFaces], artwork }); console.log(`Race Across Harad browser passed ${checks.length} checkpoints, ${artwork.length} original faces`);
} catch (error) { await fs.writeFile(`${dir}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, checks, errors, printedFaces: [...printedFaces], artwork }, null, 2)); if (page && !page.isClosed()) await page.screenshot({ path: `${dir}/failure.png` }); throw error; }
finally { await browser.close(); }
