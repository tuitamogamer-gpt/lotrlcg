import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import {
  raceHaradPlayerFixture as fixture,
  raceHaradThurindirSetupFixture,
  raceHaradPlayerAlly as ally,
  raceHaradPlayerHand as hand,
  raceHaradPlayerAttach as attach,
} from "../tests/race-harad-player-fixtures.ts";
import {
  RACE_HARAD_PLAYER as P,
  RACE_HARAD_PLAYER_CARDS,
} from "../src/game/race-harad-player-support.ts";
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
  dir = smoke ? "output/race-harad-players-smoke" : "output/race-harad-players";
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
  assert.ok(validateSave(s), "valid original Race Across Harad player fixture");
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
  for (const [width, height] of smoke ? [[1280,900]] : [[1280,900],[390,844],[320,750]]) {
    const { c, p } = await context(browser,width,height,errors,entries);
    activePage=p;
    let s=raceHaradThurindirSetupFixture();
    await load(p,s);
    await p.getByRole("button",{name:"Keep hand",exact:true}).click();
    await reviewedState(p);s=await saved(p);
    assert.match(s.choice.title,/Thurindir/);
    await shot(p,"thurindir-native-post-mulligan-deck-search",width);
    const found=s.choice.options.find(o=>o.code===P.secretWays);
    assert.ok(found);
    await resume(p);s=await choose(p,found.id);
    assert.ok(s.hand.some(u=>u.code===P.secretWays));
    await shot(p,"thurindir-selected-physical-sidequest-after-reload",width);

    s=fixture(2);
    const tribesman=ally(s,P.tribesman), remote=ally(s,"17008",1);
    await load(p,s);s=await ability(p,tribesman.id);
    assert.ok(!s.choice.options.some(o=>o.id===tribesman.id));
    await shot(p,"tribesman-native-other-harad-target",width);
    await resume(p);s=await choose(p,remote.id);
    assert.equal(get(s,tribesman.id).exhausted,true);
    assert.equal(get(s,remote.id).tempWill,1);assert.equal(get(s,remote.id).tempAttack,1);assert.equal(get(s,remote.id).tempDefense,1);
    await resume(p);
    await shot(p,"tribesman-paid-exhaustion-remote-phase-bonuses",width);

    s=fixture();
    const rider=s.heroes[0], steed=attach(s,rider,P.steed), engageEnemy=make(s,"01089");
    rider.exhausted=true;s.staging=[engageEnemy];s.phase="encounter";
    await load(p,s);
    await boardCard(p,engageEnemy.id).getByRole("button",{name:"Engage",exact:true}).click();
    await reviewedState(p);s=await saved(p);assert.match(s.choice.title,/Steed/);
    await shot(p,"steed-actual-engagement-response",width);
    await resume(p);s=await choose(p,"use");
    assert.equal(get(s,rider.id).exhausted,false);assert.equal(get(s,rider.id).attachments.find(a=>a.id===steed.id).exhausted,true);
    await shot(p,"steed-physical-exhaustion-readies-hero",width);

    s=fixture();
    const warrior=hand(s,P.warrior), host=s.heroes[0];s.deck=["01013","01014"];
    await load(p,s);s=await play(p,warrior.id,host.id);assert.match(s.choice.title,/Mighty Warrior/);
    await shot(p,"mighty-warrior-native-hand-play-response",width);
    await resume(p);s=await choose(p,"use");assert.equal(s.hand.at(-1).code,"01013");
    assert.ok(get(s,host.id).attachments.some(a=>a.id===warrior.id));
    await shot(p,"mighty-warrior-physical-attachment-and-draw",width);

    s=fixture();
    const hunter=hand(s,P.hunters), attacking=s.heroes[1], killed=make(s,"01089");
    attacking.tempAttack=20;killed.tempThreat=30;s.engaged=[killed];s.phase="attack";
    const originalResources=attacking.resources;
    await load(p,s);s=await attack(p,killed,attacking);assert.match(s.choice.title,/Proud Hunters/);
    await shot(p,"proud-hunters-native-killing-hero-response",width);
    await resume(p);s=await choose(p,attacking.id);s=await settle(p);
    assert.equal(get(s,attacking.id).resources,originalResources+card(killed.code).threat);
    assert.ok(!s.hand.some(u=>u.id===hunter.id));assert.ok(s.discard.includes(P.hunters));
    await shot(p,"proud-hunters-printed-threat-physical-event",width);

    s=fixture();
    const pathfinder=hand(s,P.pathfinder);s.encounterDeck=["01077","01099","01089","01077","01077","01098"];
    await load(p,s);s=await play(p,pathfinder.id);assert.match(s.choice.title,/Pathfinder/);
    assert.ok(!s.choice.options.some(o=>o.code==="01098"));
    await shot(p,"pathfinder-native-top-five-forced-search",width);
    await resume(p);s=await choose(p,"deck-1");assert.ok(get(s,pathfinder.id));assert.ok(s.staging.some(u=>u.code==="01099"));
    await shot(p,"pathfinder-physical-location-added-without-reveal",width);
    s=fixture();const doomedPathfinder=hand(s,P.pathfinder), keptPathfinder=ally(s,P.pathfinder);s.encounterDeck=[];
    await load(p,s);await play(p,doomedPathfinder.id);s=await choose(p,"none");
    assert.equal(get(s,doomedPathfinder.id),undefined);assert.ok(get(s,keptPathfinder.id));
    await shot(p,"pathfinder-failed-search-discards-exact-ally",width);

    s=fixture();const backtrack=hand(s,P.backtrack), location=make(s,"01099");s.staging=[location];s.progress=5;
    await load(p,s);s=await play(p,backtrack.id);assert.match(s.choice.title,/Backtrack/);
    await shot(p,"backtrack-native-staging-location-target",width);
    await resume(p);s=await choose(p,location.id);assert.equal(s.choice.options.length,5);
    await shot(p,"backtrack-main-quest-physical-progress-choice",width);
    await resume(p);s=await choose(p,"3");assert.equal(s.progress,2);assert.equal(get(s,location.id),undefined);
    assert.ok(s.encounterDiscard.includes(location.code));assert.ok(s.discard.includes(P.backtrack));
    await shot(p,"backtrack-removed-three-and-explored-location",width);

    s=fixture();const settler=ally(s,P.settler), keptSettler=ally(s,P.settler), active=make(s,"01099"), matching=make(s,"01099"), quester=s.heroes[0];
    s.activeLocation=active;s.staging=[matching];s.phase="quest";quester.tempWill=10;s.encounterDeck=["01077","01089"];
    await load(p,s);await commit(p,quester);s=await next(p);assert.match(s.choice.title,/Settler/);
    await shot(p,"settler-native-active-location-exploration-response",width);
    await resume(p);s=await choose(p,matching.id);s=await settle(p);
    assert.equal(get(s,settler.id),undefined);assert.ok(get(s,keptSettler.id));assert.equal(get(s,matching.id),undefined);
    assert.equal(s.encounterDiscard.filter(code=>code===active.code).length,2);
    await shot(p,"settler-selected-physical-cost-and-matching-discard",width);

    s=fixture();const sidequest=make(s,P.secretWays), sideQuester=s.heroes[0];
    s.staging=[sidequest];s.phase="quest";s.sideQuestSelections={shared:{id:sidequest.id,code:sidequest.code,phase:"quest"}};
    sideQuester.tempWill=7;s.encounterDeck=["01077","01089"];
    await load(p,s);await commit(p,sideQuester);s=await next(p);s=await settle(p);
    assert.ok(s.victoryCards.includes(P.secretWays));assert.equal(s.progress,0);
    await shot(p,"explore-secret-ways-native-six-progress-victory",width);
    s=fixture();const activeWays=make(s,"01099"), twin=make(s,"01099"), other=make(s,"01077");
    s.activeLocation=activeWays;s.staging=[twin,other];s.victoryCards=[P.secretWays];
    await load(p,s);s=await saved(p);
    const publicState=await reviewedState(p);
    assert.equal(stats(s,s.heroes[0]).will,3);
    assert.ok(publicState);
    await shot(p,"secret-ways-matching-threat-and-thurindir-victory-bonus",width);

    s=fixture(2);const steward=ally(s,P.steward), secondSteward=ally(s,P.steward), event=hand(s,"01022");s.deck=["01013","01014"];
    await load(p,s);s=await play(p,event.id);assert.match(s.choice.title,/Steward/);
    assert.ok(s.resolvingEvents.some(e=>e.unit.id===event.id));
    await shot(p,"steward-native-paid-event-response-before-resolution",width);
    await resume(p);s=await choose(p,"use");s=await settle(p);
    assert.equal(s.threat,21);assert.equal(seatView(s,1).threat,21);assert.equal(s.hand.at(-1).code,"01013");
    assert.ok(s.discard.includes("01022"));assert.equal(s.choice,null);assert.ok(get(s,steward.id));assert.ok(get(s,secondSteward.id));
    await shot(p,"steward-doomed-all-players-draw-and-shared-round-limit",width);

    s=fixture();
    for (const definition of RACE_HARAD_PLAYER_CARDS) if(definition.type_code!=="hero")hand(s,definition.code);
    await load(p,s);
    for (const definition of RACE_HARAD_PLAYER_CARDS) {
      if(definition.type_code==="hero") await p.getByRole("button",{name:`Inspect ${definition.name}`,exact:true}).click();
      else {const u=(await saved(p)).hand.find(u=>u.code===definition.code);await boardCard(p,u.id).locator(".hand-art").click();}
      await printed(p,card(definition.code));await shot(p,`printed-${definition.code}`,width);
      await p.getByRole("dialog").getByRole("button",{name:"Close dialog",exact:true}).click();
    }
    await c.close();
  }
  assert.equal(screenshots.length,smoke?32:96,"every planned native control and original face is required");
  await report(dir,{entries,errors,screenshots,checks,reviewMode:"all",smoke,sourceScriptSha256});
  console.log(`Race Across Harad players: ${screenshots.length} checkpoints passed (${url}).`);
} catch(error) {
  const failureScreenshot=`${dir}/first-failure.png`;
  if(activePage&&!activePage.isClosed())await activePage.screenshot({path:failureScreenshot}).catch(()=>null);
  await fs.writeFile(`${dir}/failure.json`,JSON.stringify({url,errors,screenshots,failure:String(error),failureScreenshot,sourceScriptSha256,stack:error.stack,lastState:activePage&&!activePage.isClosed()?await saved(activePage).catch(()=>null):null},null,2));
  throw error;
} finally {await browser.close();}
