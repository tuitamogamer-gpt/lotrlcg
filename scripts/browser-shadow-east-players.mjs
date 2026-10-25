import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { SHADOW_EAST_PLAYER_ART } from "../tests/shadow-east-player-art.ts";
import { fixture, ring, fellowship, hand, ally } from "../tests/shadow-east-player-fixtures.ts";
import { SHADOW_EAST_PLAYER as P, SHADOW_EAST_PLAYER_CARDS as cards, shadowEastRing, shadowEastGollum, shadowEastPlayerStats } from "../src/game/shadow-east-player-support.ts";
import { card, plain, DECK, playerCards } from "../src/game/cards.ts";
import { createGame } from "../src/game/setup.ts";
import { get, make, playCost, locationQuest, enemyAttackPrevented } from "../src/game/core.ts";
import { forOwner, seatView, syncSeat } from "../src/game/table.ts";
import { reviewedState } from "./browser-review-helpers.mjs";
import { capture, choose, context, load, report, resume, saved, settle, next } from "./browser-angmar-helpers.mjs";

const widths = process.env.SHADOW_EAST_PLAYER_WIDTHS?.split(",").map(Number) ?? [1280, 390, 320];
assert.ok(widths.length && widths.every((w) => [1280, 390, 320].includes(w)));
const dir = process.env.SHADOW_EAST_PLAYER_OUTPUT_DIR ?? "output/shadow-east-players";
await fs.mkdir(dir, { recursive: true });
await fs.rm(`${dir}/failure.json`, { force: true });
await fs.rm(`${dir}/failure.png`, { force: true });
const sourceScriptSha256 = createHash("sha256").update(await fs.readFile(new URL(import.meta.url))).digest("hex");
const browser = await chromium.launch({ headless: true });
const errors = [], entries = new Set(), screenshots = [], checks = [], artwork = [], printedFaces = new Set();
let page;
const board = (id) => page.locator(`[data-motion-card="${id}"]`);
async function checkpoint(label, width) {
  await reviewedState(page);
  await capture(page, dir, `${label}-${width}`, screenshots);
  checks.push(`${label}-${width}`);
  console.log(`PASS ${label} @ ${width}`);
}
async function play(id, target) {
  await board(id).getByRole("button", { name: "Play card", exact: true }).click();
  if (target) await page.locator(`.decision-card[data-unit-id="${target}"] .decision-select`).click();
  await page.getByRole("dialog").getByRole("button", { name: "Play card", exact: true }).click();
  await reviewedState(page);
  return saved(page);
}
async function close() { await page.getByRole("button", { name: "Close dialog", exact: true }).last().click(); }
async function commit(ids) {
  const s = await saved(page);
  for (const id of ids) await page.getByRole("button", { name: `Commit ${card(get(s, id).code).name}`, exact: true }).click();
  await page.getByRole("button", { name: "Commit & reveal", exact: true }).last().click();
  await reviewedState(page);
}
async function attack(enemyId, attackerId) {
  await board(enemyId).getByRole("button", { name: /^(Attack|Ranged ·)/ }).click();
  const s = await saved(page);
  await page.getByRole("dialog").getByRole("button", { name: card(get(s, attackerId).code).name, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Attack ·/ }).click();
  await reviewedState(page);
}
async function nav(label) {
  const toggle = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.locator("#navigation-panel").getByRole("button", { name: label, exact: true }).click();
}
function company(s, count, excluded = []) {
  const names = new Set([...s.heroes.map((h) => card(h.code).name), ...excluded]);
  for (const c of playerCards) {
    if (c.type_code !== "ally" || !c.is_unique || names.has(c.name)) continue;
    names.add(c.name); s.allies.push(make(s, c.code));
    if (--count === 0) return;
  }
  throw Error("Not enough unique companions for fixture");
}

try {
  for (const width of widths) {
    const view = await context(browser, width, width === 1280 ? 1000 : 844, errors, entries);
    page = view.p;
    {
      const s = createGame(318, { ...DECK, [P.ring]: 1, [P.master]: 1 }, [P.frodo, "01004", "01012"], "custom", { scenarioId: "mirkwood" });
      await load(page, s);
      assert.match((await saved(page)).choice.title, /bearer/);
      await choose(page, s.heroes[0].id);
      await resume(page);
      const option = (await saved(page)).choice.options.find((o) => o.code === P.master);
      assert.ok(option); await choose(page, option.id);
      let state = await saved(page);
      const master = state.hand.find((u) => u.code === P.master);
      assert.ok(master); assert.equal(state.hand.length, 7);
      assert.equal(shadowEastRing(state).host.id, s.heroes[0].id);
      await checkpoint("one-ring-native-bearer-and-master-search", width);
      await page.getByRole("button", { name: /Mulligan/, exact: false }).click();
      state = await saved(page);
      assert.equal(state.hand.length, 7); assert.ok(state.hand.some((u) => u.id === master.id));
      await resume(page);
      assert.ok((await saved(page)).hand.some((u) => u.id === master.id));
      await checkpoint("master-search-survives-native-mulligan", width);
    }
    {
      const deck = { ...DECK, [P.ring]: 1, [P.master]: 1 };
      const s = createGame(319, deck, [P.frodo, "01004", "01012"], "custom", { scenarioId: "mirkwood", seats: [
        { deckId: "custom", cards: deck, heroes: [P.frodo, "01004", "01012"] },
        { deckId: "custom", cards: deck, heroes: ["01001", "01002", "01003"] },
      ] });
      await load(page, s); await choose(page, "1");
      await choose(page, seatView(await saved(page), 1).heroes[0].id);
      await choose(page, "skip");
      const state = await resume(page);
      assert.equal(shadowEastRing(state).player, 1);
      assert.equal(seatView(state, 0).removed.filter((c) => c === P.ring).length, 1);
      assert.equal(seatView(state, 1).removed.includes(P.ring), false);
      await checkpoint("first-player-selects-one-ring-controller", width);
    }
    {
      const s = fixture(), frodo = s.heroes[0], friend = s.heroes[1];
      s.phase = "quest"; s.encounterDeck = ["01099", "01099"];
      await load(page, s); await commit([frodo.id, friend.id]);
      assert.match((await saved(page)).choice.title, /Frodo/);
      await choose(page, "use"); await resume(page); await choose(page, friend.id);
      const state = await saved(page);
      assert.equal(get(state, frodo.id).resources, frodo.resources - 1);
      assert.equal(get(state, friend.id).exhausted, false);
      await checkpoint("frodo-native-commit-resource-response", width);
    }
    {
      const s = fixture(), gandalf = ally(s, "01073"), u = hand(s, P.merry);
      await load(page, s); await play(u.id); await choose(page, "use");
      assert.equal(shadowEastPlayerStats(await saved(page), get(await saved(page), gandalf.id)).will, 1);
      await checkpoint("merry-native-entry-unique-allies", width);
    }
    {
      const s = fixture(), pippin = ally(s, P.pippin), enemy = make(s, "01082");
      pippin.exhausted = true; s.phase = "encounter"; s.staging.push(enemy);
      await load(page, s); await board(enemy.id).getByRole("button", { name: "Engage", exact: true }).click();
      await reviewedState(page); await choose(page, "use");
      assert.equal(get(await saved(page), pippin.id).exhausted, false);
      await checkpoint("pippin-native-engagement-ready", width);
    }
    {
      const s = fixture(), enemy = make(s, "01082"), faramir = hand(s, P.faramir);
      enemy.attachments.push({ id: `a${s.nextId++}`, code: "06064", exhausted: false, owner: 0 });
      s.staging.push(enemy); await load(page, s); await play(faramir.id); await choose(page, "use");
      await choose(page, enemy.id);
      assert.equal(get(await saved(page), enemy.id).damage, 4);
      assert.ok((await saved(page)).engaged.some((u) => u.id === enemy.id));
      await checkpoint("faramir-native-engage-attached-enemy", width);
    }
    {
      const s = fixture(2), derufin = ally(s, P.derufin), enemy = make(s, "01082");
      s.phase = "attack"; derufin.tempAttack = 10; enemy.owner = 1; seatView(s, 1).engaged.push(enemy);
      const threat = seatView(s, 1).threat;
      await load(page, s); await attack(enemy.id, derufin.id); await choose(page, "use");
      await settle(page);
      assert.equal(get(await saved(page), derufin.id), undefined);
      assert.equal(seatView(await saved(page), 1).threat, threat - card(enemy.code).threat);
      await checkpoint("derufin-native-ranged-kill-remote-threat", width);
    }
    {
      const s = fixture(), event = hand(s, P.gathering), recruit = hand(s, "01013");
      s.encounterDeck = ["01099", "01082", "01099", "01099", "01099", "01097"];
      await load(page, s); await play(event.id);
      assert.deepEqual((await saved(page)).choice.options.filter((o) => o.id !== "skip").map((o) => o.code), ["01082"]);
      await resume(page); await choose(page, "1");
      assert.equal(playCost(await saved(page), card("01013")), Math.max(0, Number(card("01013").cost) - card("01082").threat));
      await play(recruit.id);
      assert.equal(playCost(await saved(page), card("01013")), Number(card("01013").cost));
      await checkpoint("gathering-storm-native-search-and-discount", width);
    }
    {
      const s = fixture(), location = make(s, "01099"), enemy = make(s, "01082"), event = hand(s, P.pursuit);
      s.activeLocation = location; s.staging.push(enemy);
      const guide = ally(s, "01073"), companion = ally(s, "02079");
      s.encounterDeck = ["01099", "01115", "01099", "01099"];
      await load(page, s); await play(event.id, location.id);
      assert.equal(locationQuest(await saved(page), get(await saved(page), location.id)), card(location.code).quest + 2);
      await next(page); await commit([s.heroes[1].id, guide.id, companion.id]); await next(page);
      assert.match((await saved(page)).choice.title, /Put Off Pursuit/);
      await choose(page, "use"); await resume(page); await choose(page, enemy.id); await settle(page);
      assert.equal((await saved(page)).staging.some((u) => u.id === enemy.id), false);
      assert.ok((await saved(page)).encounterDeck.includes(enemy.code));
      await checkpoint("put-off-pursuit-native-play-and-exploration", width);
    }
    {
      const s = fixture(); ring(s); hand(s, P.master);
      s.phase = "quest"; s.encounterDeck = ["01115", "01099", "01099"]; s.heroes[1].tempWill = 2;
      await load(page, s); await commit([s.heroes[1].id]);
      assert.ok((await saved(page)).choice.options.some((o) => o.id === "east-master-0"));
      await resume(page); await choose(page, "east-master-0"); await settle(page);
      const state = await saved(page);
      assert.equal(state.threat, s.threat + 1);
      assert.equal(state.encounterDiscard.filter((c) => c === "01115").length, 1);
      assert.equal(state.staging.filter((u) => u.code === "01099").length, 1);
      assert.equal(state.encounterDeck.length, 1);
      await checkpoint("master-ring-native-whole-card-cancellation", width);
    }
    {
      const s = fixture(); ring(s); s.phase = "defense";
      const enemy = make(s, "01082"), event = hand(s, P.ruling); s.engaged.push(enemy);
      await load(page, s); await play(event.id, enemy.id);
      assert.equal(enemyAttackPrevented(await saved(page), get(await saved(page), enemy.id), 0), true);
      await checkpoint("ruling-ring-native-combat-prevention", width);
    }
    {
      const s = fixture(), host = ring(s), event = hand(s, P.power); host.exhausted = true;
      await load(page, s); await play(event.id);
      const state = await saved(page);
      assert.equal(get(state, host.id).exhausted, false); assert.equal(state.threat, s.threat + 1);
      assert.equal(shadowEastRing(state).attachment.exhausted, true);
      assert.equal(shadowEastPlayerStats(state, get(state, host.id)).attack, 1);
      await checkpoint("ring-of-power-native-ready-and-bonus", width);
    }
    {
      const s = fixture(), hero = make(s, P.smeagol), location = make(s, "01099");
      s.heroes[0] = hero; s.startingHeroes[0] = P.smeagol; s.phase = "travel"; s.staging.push(location);
      s.shadowEastPlayers = { contracts: [], pendingRings: [], smeagol: { id: hero.id, owner: 0, stinkersAdded: true } };
      await load(page, s); await board(location.id).getByRole("button", { name: "Travel here", exact: true }).click();
      await reviewedState(page); await choose(page, "use");
      assert.equal((await saved(page)).threat, s.threat + 1);
      assert.equal((await saved(page)).hand.length, s.hand.length + 1);
      await checkpoint("smeagol-native-travel-response", width);
    }
    {
      const s = fixture(), hero = make(s, P.smeagol);
      s.heroes[0] = hero; s.startingHeroes[0] = P.smeagol; s.phase = "quest";
      hero.damage = 1; hero.resources = 4;
      s.shadowEastPlayers = { contracts: [], pendingRings: [], smeagol: { id: hero.id, owner: 0, stinkersAdded: true } };
      s.encounterDeck = [P.stinker, "01099", "01099"]; s.heroes[1].tempWill = 3;
      await load(page, s); await commit([s.heroes[1].id]); await settle(page);
      let state = await resume(page), gollum = shadowEastGollum(state);
      assert.ok(gollum); assert.equal(gollum.id, hero.id); assert.equal(gollum.damage, 0); assert.equal(gollum.resources, 0);
      assert.equal(await page.locator('[data-smeagol-state="Gollum"]').count(), 1);
      await page.getByRole("button", { name: "Inspect Sméagol / Gollum", exact: true }).click();
      assert.equal(await page.locator("[data-card-primary-name]").textContent(), "Gollum");
      await checkpoint("stinker-native-flip-and-gollum-inspector", width); await close();
      // Retain the resulting physical card; isolate the following real attack.
      state = await saved(page); state.phase = "attack"; state.heroes[1].exhausted = false; state.heroes[1].committed = false;
      state.heroes[1].tempAttack = 8; state.queue = []; state.choice = null; if (state.flow) state.flow.pending = null;
      await load(page, state); await attack(gollum.id, state.heroes[1].id); await settle(page);
      state = await resume(page);
      assert.equal(shadowEastGollum(state), undefined);
      const returned = state.heroes.find((u) => u.id === hero.id);
      assert.ok(returned); assert.equal(returned.code, P.smeagol); assert.equal(returned.exhausted, true);
      await checkpoint("gollum-native-defeat-restores-physical-smeagol", width);
    }
    {
      const s = fixture(); fellowship(s); company(s, 5, ["Merry"]);
      const merry = hand(s, P.merry); await load(page, s); await play(merry.id); await settle(page);
      assert.equal((await saved(page)).shadowEastPlayers.contracts[0].side, "B");
      assert.equal(await page.locator('[data-fellowship-contract="B"]').count(), 1);
      await resume(page); await page.getByRole("button", { name: "Inspect Fellowship · Side B", exact: true }).click();
      assert.match(await page.locator("[data-card-primary-rules]").textContent(), /Each character you control gets/);
      await checkpoint("fellowship-native-ninth-companion-flips-contract", width); await close();
    }
    {
      const s = fixture(); fellowship(s, 0, "B"); company(s, 5, ["Derufin"]);
      const derufin = ally(s, P.derufin), enemy = make(s, "01082"); derufin.tempAttack = 10;
      s.phase = "attack"; s.engaged.push(enemy);
      await load(page, s); await attack(enemy.id, derufin.id); await choose(page, "use"); await settle(page);
      assert.equal((await saved(page)).shadowEastPlayers.contracts[0].side, "A");
      assert.equal(await page.locator('[data-fellowship-contract="A"]').count(), 1);
      await checkpoint("fellowship-native-companion-leaves-flips-back", width);
    }
    {
      const s = fixture(); s.discard = cards.map((c) => c.code);
      await load(page, s); await page.getByRole("button", { name: `Browse player discard: ${cards.length} cards`, exact: true }).click();
      for (const source of cards) {
        const c = card(source.code);
        await page.locator(".pile-entry").filter({ has: page.locator(`img[data-card-code="${c.code}"]`) }).getByRole("button").first().click();
        assert.equal(await page.locator("[data-card-primary-name]").textContent(), c.name);
        assert.equal(await page.locator("[data-card-primary-rules]").textContent(), plain(c.text));
        const img = page.locator(".card-detail img[data-card-code]");
        assert.equal(new URL(await img.getAttribute("src"), page.url()).pathname, `/cards/${c.code}.jpg`);
        await img.evaluate((i) => i.decode()); printedFaces.add(c.code);
        if ([P.ring, P.smeagol, P.fellowship].includes(c.code)) await checkpoint(`printed-${c.code}`, width);
        await close();
      }
      await close(); checks.push(`all-thirteen-printed-fronts-${width}`);
    }
    {
      await nav("Deck builder"); await page.getByRole("button", { name: "New deck", exact: true }).click();
      await page.getByRole("textbox", { name: "Search cards", exact: true }).fill("Fellowship");
      await page.getByRole("button", { name: "Add one Fellowship", exact: true }).click();
      assert.match(await page.locator("[data-deck-contracts]").textContent(), /Fellowship/);
      assert.match(await page.locator(".builder-summary").textContent(), /0\s*\/ 50/);
      await page.getByRole("textbox", { name: "Search cards", exact: true }).fill("The One Ring");
      await page.getByRole("button", { name: "Add one The One Ring", exact: true }).click();
      assert.match(await page.locator(".builder-summary").textContent(), /1\s*\/ 50/);
      await checkpoint("contract-builder-excludes-contract-from-deck-size", width);
    }
    await view.c.close();
  }
  const p = await browser.newPage();
  for (const pin of SHADOW_EAST_PLAYER_ART) {
    const response = await p.request.get(new URL(pin.localPath, process.env.GAME_URL ?? "http://127.0.0.1:5178").href);
    assert.equal(response.status(), 200); const bytes = await response.body();
    assert.equal(bytes.length, pin.bytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
    const size = await p.evaluate(async (data) => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(data)]));
      const size = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return size;
    }, [...bytes]);
    assert.ok(size.width && size.height); artwork.push({ ...pin, ...size });
  }
  await p.close(); assert.equal(printedFaces.size, 13);
  const smoke = process.env.SHADOW_EAST_PLAYER_SMOKE === "1" || widths.join(",") !== "1280,390,320";
  await report(dir, { smoke, sourceScriptSha256, errors, entries, screenshots, checks, printedFaces: [...printedFaces], artwork });
  console.log(`Shadow East player browser passed ${checks.length} checkpoints and all16 original image faces`);
} catch (error) {
  await fs.writeFile(`${dir}/failure.json`, JSON.stringify({ error: String(error), stack: error.stack, checks, errors }, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: `${dir}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
