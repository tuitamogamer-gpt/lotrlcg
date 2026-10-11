import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import { canCommit } from "../src/game/actions";
import { fx, get, make, playCost, questWill, stats } from "../src/game/core";
import {
  collectResources,
  damage,
  discardHandCard,
  enterAlly,
  phaseEnd,
  progress,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { beginEnemyAttack } from "../src/game/combat";
import { forOwner, seatView } from "../src/game/table";
import {
  effectiveKeyword,
  hasResourceIcon,
  questExhausts,
} from "../src/game/expansion-passives";
import { syncAttachmentText } from "../src/game/attachment-text";
import * as Grey from "../src/game/grey-havens-player";
import {
  GREY_HAVENS as G,
  GREY_HAVENS_PLAYER_CARDS,
} from "../src/game/grey-havens-player-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import {
  greyHavensFixture as fixture,
  greyHavensAlly as ally,
  greyHavensHand as hand,
  greyHavensAttach as attach,
} from "./grey-havens-player-fixtures";
import type { Effect, GameState, Unit } from "../src/game/types";
import { VOYAGE as V } from "../src/game/voyage-belegaer-support";
import { expansionPlayTargets } from "../src/game/expansion-passives";
import { isAlly } from "../src/game/card-types";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support";
import { FATE as F } from "../src/game/fate-numenor-support";
import { fateAddIsland } from "../src/game/fate-numenor";
import { base as fateFixture } from "./fate-numenor-fixtures";
import { base as ninFixture } from "./nin-eilph-fixtures";

function select(s: GameState, id: string) {
  return choose(reload(s), id);
}
function effect(s: GameState, e: Effect) {
  s.queue.push(e);
  flush(s);
  return s;
}
function play(s: GameState, code: string, target?: string) {
  const event = hand(s, code);
  return applyAction(s, { type: "PLAY", id: event.id, target });
}
function ability(s: GameState, u: Unit, attachmentId?: string) {
  return applyAction(s, { type: "ABILITY", id: u.id, attachmentId });
}

test("Grey Havens registers all 15 unchanged source-audited player designs", () => {
  assert.equal(GREY_HAVENS_PLAYER_CARDS.length, 15);
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  for (const c of GREY_HAVENS_PLAYER_CARDS) {
    const original = catalog.find((u: { code: string }) => u.code === c.code);
    assert.equal(c.text, original.text, c.code);
    assert.equal(c.octgnid, original.octgnid, c.code);
    assert.ok(SCRIPTED.has(c.code), c.code);
  }
});
test("discard-top allies use their controller's pile and update after actual hand discard and reload", () => {
  const s = fixture(2),
    watcher = ally(s, G.seaWatcher),
    warden = ally(s, G.warden, 1),
    sailor = ally(s, G.sailor);
  s.discard = ["01014"];
  forOwner(s, 1, () => {
    s.discard = [G.almanac];
  });
  assert.equal(stats(s, watcher).attack, card(G.seaWatcher).attack! + 2);
  assert.ok(effectiveKeyword(watcher, "Ranged"));
  assert.equal(stats(s, warden).defense, card(G.warden).defense! + 2);
  assert.ok(effectiveKeyword(warden, "Sentinel"));
  const event = hand(s, "01020");
  discardHandCard(s, event.id);
  assert.equal(stats(s, watcher).attack, card(G.seaWatcher).attack);
  assert.equal(effectiveKeyword(watcher, "Ranged"), false);
  assert.equal(stats(s, sailor).will, card(G.sailor).willpower! + 1);
  reload(s);
});
test("blanking removes conditional bonuses and keywords", () => {
  const s = fixture(),
    u = ally(s, G.seaWatcher);
  s.discard = ["01014"];
  u.blanked = true;
  assert.equal(Grey.greyHavensStats(s, u).attack, 0);
  assert.deepEqual(Grey.greyHavensDynamicKeywords(s, u), []);
});
test("Sailor of Lune's protection tracks commitment and the current discard-top event", () => {
  const s = fixture(),
    u = ally(s, G.sailor);
  s.discard = ["01020"];
  u.committed = true;
  assert.equal(damage(s, u.id, 1), false);
  assert.equal(u.damage, 0);
  s.discard.push(G.almanac);
  assert.equal(damage(s, u.id, 1), true);
  assert.equal(u.damage, 1);
  s.discard.push("01020");
  u.committed = false;
  assert.equal(damage(s, u.id, 1), true);
});
test("Círdan's real resource draw discards only one newly drawn physical card", () => {
  let s = fixture();
  const old = hand(s, "01020");
  s.deck = ["01021", "01022", "01023"];
  s.phase = "resource";
  collectResources(s);
  flush(s);
  assert.match(s.choice!.title, /Círdan/);
  assert.equal(s.choice!.options.length, 2);
  assert.ok(!s.choice!.options.some((o) => o.id === old.id));
  const chosen = s.choice!.options[1];
  s = select(s, chosen.id);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01020", "01021"],
  );
  assert.deepEqual(s.discard, ["01022"]);
  assert.deepEqual(s.deck, ["01023"]);
});
test("a blocked resource draw gives Círdan no unrelated discard choice", () => {
  const s = fixture();
  hand(s, "01020");
  s.activeLocation = make(s, "01095");
  collectResources(s);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 1);
});
test("Círdan's remote resource draw uses the drawing player and preserves the first player's hand", () => {
  let s = fixture(2);
  forOwner(s, 1, () => {
    s.heroes[0] = make(s, G.cirdan);
    s.startingHeroes = s.heroes.map((u) => u.code);
    s.deck = ["01020", "01021"];
  });
  s.heroes = s.heroes.filter((u) => u.code !== G.cirdan);
  s.startingHeroes = s.heroes.map((u) => u.code);
  const before = s.hand.length;
  collectResources(s);
  flush(s);
  assert.equal(s.table!.active, 1);
  const chosen = s.choice!.options[0].id;
  s = select(s, chosen);
  assert.equal(seatView(s, 0).hand.length, before + 1);
  assert.equal(seatView(s, 1).hand.length, 1);
});
test("Galdor's setup Response replaces an arbitrary subset and spends the mulligan option", () => {
  let s = fixture();
  s.phase = "setup";
  s.mulled = false;
  const keep = hand(s, "01020"),
    one = hand(s, "01021"),
    two = hand(s, "01022");
  s.deck = ["01023", "01025", "01026"];
  Grey.greyHavensSetup(s);
  flush(s);
  s = select(s, "use");
  s = select(s, one.id);
  s = select(s, two.id);
  s = select(s, "done");
  assert.equal(s.mulled, true);
  assert.ok(s.hand.some((u) => u.id === keep.id));
  assert.deepEqual(s.discard, ["01021", "01022"]);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    ["01020", "01023", "01025"],
  );
  assert.throws(() => applyAction(s, { type: "MULLIGAN" }), /once/);
});
test("declining Galdor leaves the ordinary mulligan available", () => {
  let s = fixture();
  s.phase = "setup";
  s.mulled = false;
  hand(s, "01020");
  Grey.greyHavensSetup(s);
  flush(s);
  s = select(s, "skip");
  assert.equal(s.mulled, false);
  s = applyAction(s, { type: "MULLIGAN" });
  assert.equal(s.mulled, true);
});
test("Galdor's Action requires an empty hand and remains spent after phase end and reload", () => {
  let s = fixture();
  const hero = s.heroes.find((u) => u.code === G.galdor)!;
  s.deck = Array(12).fill("01020");
  s = ability(s, hero);
  assert.equal(s.hand.length, 6);
  assert.equal(availableAbilities(s, get(s, hero.id)!)[0].disabled, true);
  s.hand = [];
  phaseEnd(s);
  s = reload(s);
  assert.match(
    Grey.greyHavensAbilityProblem(s, get(s, hero.id)!)!,
    /once-per-game/,
  );
  assert.throws(() => ability(s, get(s, hero.id)!), /once-per-game/);
});
test("Skyward Volley pays resources and a controlled ranged character once and repeats only older discard copies", () => {
  let s = fixture();
  s.phase = "attack";
  const ranged = ally(s, "01017"),
    enemy = make(s, "01096"),
    second = make(s, "01097");
  s.engaged.push(enemy, second);
  s.discard = [G.volley, G.volley];
  const before = s.heroes.reduce((sum, h) => sum + h.resources, 0);
  s = play(s, G.volley, ranged.id);
  assert.equal(get(s, ranged.id)!.exhausted, true);
  s = select(s, enemy.id);
  s = select(s, enemy.id);
  s = select(s, second.id);
  assert.equal(get(s, enemy.id), undefined);
  assert.equal(s.choice, null);
  assert.equal(s.discard.filter((c) => c === G.volley).length, 3);
  assert.equal(
    s.heroes.reduce((sum, h) => sum + h.resources, 0),
    before - 2,
  );
});
test("Skyward Volley does not borrow another player's ranged character for its additional cost", () => {
  const s = fixture(2);
  s.phase = "attack";
  ally(s, "01017", 1);
  s.engaged.push(make(s, "01097"));
  const event = hand(s, G.volley);
  assert.match(canPlay(s, event)!, /ready ranged/);
  assert.deepEqual(playTargets(s, event), []);
});
test("The Evening Star can choose new active/staging targets and excludes the resolving event from its count", () => {
  let s = fixture();
  const first = make(s, "01100"),
    second = make(s, "01099");
  s.staging.push(first, second);
  s.discard = [G.star];
  s = play(s, G.star, first.id);
  assert.equal(get(s, first.id)!.progress, 2);
  assert.match(s.choice!.title, /1 remaining/);
  s = select(s, second.id);
  assert.equal(get(s, second.id)!.progress, 2);
  assert.equal(s.discard.filter((c) => c === G.star).length, 2);
  assert.equal(s.choice, null);
});
test("Elwing's Flight permits a questing character already ready and repeats the printed bonus", () => {
  let s = fixture();
  s.phase = "staging";
  const u = s.heroes[0];
  u.committed = true;
  u.exhausted = true;
  const before = stats(s, u).will;
  s.discard = [G.flight];
  s = play(s, G.flight, u.id);
  assert.equal(get(s, u.id)!.exhausted, false);
  s = select(s, u.id);
  assert.equal(stats(s, get(s, u.id)!).will, before + 2);
  phaseEnd(s);
  assert.equal(get(s, u.id)!.tempWill ?? 0, 0);
});
test("the printed event Action windows and player-card immunity are enforced before payment", () => {
  const s = fixture();
  const volley = hand(s, G.volley),
    flight = hand(s, G.flight),
    star = hand(s, G.star);
  assert.match(canPlay(s, volley)!, /Combat Action/);
  assert.match(canPlay(s, flight)!, /Quest Action/);
  const immune = make(s, "01099");
  immune.immuneToPlayerEffects = true;
  // Direct helper uses current immunity without replacing scenario-derived flags.
  s.staging.push(immune);
  assert.ok(
    !Grey.greyHavensPlayTargets(s, star.code)!.some((u) => u.id === immune.id),
  );
});
test("Grappling Hook pays the physical attachment and character exhaustion and changes only quest strength", () => {
  let s = fixture();
  s.phase = "quest";
  const u = s.heroes[2],
    a = attach(s, u, G.hook);
  const before = stats(s, u);
  s = ability(s, u, a.id);
  assert.equal(get(s, u.id)!.committed, true);
  assert.equal(get(s, u.id)!.exhausted, true);
  assert.equal(get(s, u.id)!.attachments.length, 0);
  assert.ok(s.discard.includes(G.hook));
  assert.equal(questWill(s), before.attack);
  assert.equal(stats(s, get(s, u.id)!).will, before.will);
  phaseEnd(s);
  assert.equal(
    Grey.greyHavensQuestStat(s, get(s, u.id)!, "defense"),
    "defense",
  );
});
test("Lindon Navigator commits while exhausted without exhausting and its Forced resolves after failed quests too", () => {
  let s = fixture(2);
  const u = ally(s, G.navigator),
    cost = hand(s, "01020");
  u.exhausted = true;
  s.phase = "quest";
  assert.equal(canCommit(s, u), true);
  assert.equal(questExhausts(s, u), false);
  s = applyAction(s, { type: "TOGGLE_QUEST", id: u.id });
  s = applyAction(s, { type: "COMMIT" });
  assert.equal(get(s, u.id)!.committed, true);
  assert.equal(get(s, u.id)!.exhausted, true);
  // Finish a resolved quest through the real phase effect, regardless of success.
  s.queue = [];
  s.choice = null;
  s = effect(s, fx("finishQuestPhase", { player: 0 }));
  assert.match(s.choice!.title, /Lindon Navigator/);
  s = select(s, cost.id);
  assert.ok(get(s, u.id));
  assert.ok(s.discard.includes("01020"));
});
test("Lindon Navigator must discard itself when no discardable hand card remains", () => {
  let s = fixture();
  const u = ally(s, G.navigator);
  u.committed = true;
  s.phase = "staging";
  s = effect(s, fx("finishQuestPhase"));
  assert.equal(s.choice!.options.length, 1);
  s = select(s, "ally");
  assert.equal(get(s, u.id), undefined);
  assert.ok(s.discard.includes(G.navigator));
});
test("To the Sea discards an exact physical subset, has a minimum cost of one and consumes only an ally actually played", () => {
  let s = fixture();
  const u = s.heroes[0],
    a = attach(s, u, G.sea),
    one = hand(s, "01020"),
    two = hand(s, "01021"),
    target = hand(s, G.navigator);
  s = ability(s, u, a.id);
  s = select(s, one.id);
  s = select(s, two.id);
  s = select(s, "done");
  assert.equal(playCost(s, card(G.navigator)), 1);
  const put = make(s, G.sailor);
  enterAlly(s, put);
  flush(s);
  assert.equal(playCost(s, card(G.navigator)), 1);
  const before = s.heroes.reduce((sum, h) => sum + h.resources, 0);
  s = applyAction(s, { type: "PLAY", id: target.id });
  assert.equal(
    s.heroes.reduce((sum, h) => sum + h.resources, 0),
    before - 1,
  );
  assert.equal(playCost(s, card(G.navigator)), 2);
});
test("To the Sea's unused discount expires at the end of its phase", () => {
  const s = fixture();
  s.used.push("phase:grey-havens:sea:5:a1");
  assert.equal(playCost(s, card(G.navigator)), 1);
  phaseEnd(s);
  assert.equal(playCost(s, card(G.navigator)), 2);
});
test("Narya attaches only to named characters and its Leadership icon is continuous", () => {
  const s = fixture();
  const event = hand(s, G.narya);
  assert.deepEqual(
    playTargets(s, event).map((u) => u.code),
    [G.cirdan],
  );
  const a = attach(s, s.heroes[0], G.narya);
  delete s.heroes[0].phaseResourceIcons;
  assert.ok(hasResourceIcon(s.heroes[0], "leadership"));
  a.blanked = true;
  assert.equal(hasResourceIcon(s.heroes[0], "leadership"), false);
});
test("Narya readies remote and already ready allies, preserves two distinct targets and lasting buffs after the source leaves", () => {
  let s = fixture(2);
  const u = s.heroes[0],
    a = attach(s, u, G.narya),
    one = ally(s, G.navigator, 1),
    two = ally(s, G.warden);
  one.exhausted = true;
  const before = stats(s, one);
  s = ability(s, u, a.id);
  s = select(s, one.id);
  assert.ok(!s.choice!.options.some((o) => o.id === one.id));
  s = select(s, two.id);
  assert.equal(get(s, one.id)!.exhausted, false);
  assert.equal(stats(s, get(s, one.id)!).attack, before.attack + 1);
  assert.equal(get(s, two.id)!.tempDefense, 1);
  assert.equal(get(s, u.id)!.exhausted, true);
  get(s, u.id)!.attachments = [];
  assert.equal(get(s, one.id)!.tempAttack, 1);
  phaseEnd(s);
  assert.equal(get(s, one.id)!.tempAttack ?? 0, 0);
});
test("Explorer's Almanac receives optional quest progress after active-location buffering and reload", () => {
  let s = fixture();
  const active = make(s, "01099"),
    target = make(s, "01100");
  s.activeLocation = active;
  active.progress = card(active.code).quest! - 1;
  s.staging.push(target);
  attach(s, target, G.almanac);
  s.phase = "staging";
  progress(s, 3, false, true);
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.match(s.choice!.title, /Explorer's Almanac/);
  s = select(s, `${target.id}:1`);
  assert.equal(get(s, target.id)!.progress, 1);
  s = select(s, "quest");
  assert.equal(s.progress, 1);
  assert.equal(s.choice, null);
});
test("Explorer's Almanac does not redirect progress from ordinary player effects", () => {
  const s = fixture(),
    u = make(s, "01100");
  s.staging.push(u);
  attach(s, u, G.almanac);
  progress(s, 2, true);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(u.progress, 0);
  assert.equal(s.progress, 2);
});
test("Mariner's Compass acts only at actual travel start, exhausts both costs and switches without revealing", () => {
  let s = fixture();
  const hero = s.heroes[2],
    a = attach(s, hero, G.compass),
    out = make(s, "01099");
  s.staging.push(out);
  out.progress = 1;
  s.encounterDeck = ["01100", "01099", "01099"];
  s = effect(s, fx("startTravel"));
  assert.equal(s.phase, "travel");
  assert.match(s.choice!.title, /Mariner's Compass/);
  s = select(s, "use");
  assert.ok(get(s, hero.id)!.exhausted);
  assert.ok(get(s, hero.id)!.attachments[0].exhausted);
  s = select(s, "deck-0");
  s = select(s, out.id);
  assert.equal(get(s, out.id), undefined);
  assert.ok(s.staging.some((u) => u.code === "01100" && u.progress === 0));
  assert.ok(s.encounterDeck.includes(out.code));
  assert.ok(!s.encounterDiscard.includes(out.code));
  assert.equal(s.activeLocation, null);
  assert.equal(s.threat, 20);
  assert.equal(s.choice, null);
  assert.equal(a.code, G.compass);
});
test("declining Compass leaves its costs ready and performs no search", () => {
  let s = fixture();
  const hero = s.heroes[2],
    a = attach(s, hero, G.compass);
  s.staging.push(make(s, "01099"));
  const deck = [...s.encounterDeck];
  s = effect(s, fx("startTravel"));
  s = select(s, "skip");
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.equal(
    get(s, hero.id)!.attachments.find((v) => v.id === a.id)!.exhausted,
    false,
  );
  assert.deepEqual(s.encounterDeck, deck);
});
test("Anchor Watch declares two exhausted defenders without Stand Together and uses one event payment", () => {
  let s = fixture();
  s.phase = "defense";
  const enemy = make(s, "01097"),
    one = s.heroes[0],
    two = s.heroes[1];
  one.exhausted = two.exhausted = true;
  s.engaged.push(enemy);
  s.discard = [G.anchor];
  const event = hand(s, G.anchor);
  const before = s.heroes.reduce((sum, h) => sum + h.resources, 0);
  beginEnemyAttack(s, enemy, []);
  flush(s);
  assert.match(s.choice!.title, /Anchor Watch/);
  s = select(s, event.id);
  s = select(s, one.id);
  s = select(s, two.id);
  assert.equal(
    s.heroes.reduce((sum, h) => sum + h.resources, 0),
    before - 2,
  );
  assert.equal(get(s, one.id)!.damage, 0);
  assert.equal(get(s, two.id)!.damage, 0);
  assert.ok(get(s, one.id)!.exhausted);
  assert.equal(s.standTogether, false);
  assert.equal(s.discard.filter((c) => c === G.anchor).length, 2);
});
test("Anchor Watch cannot use another player's exhausted sentinel and skips back to the original defender", () => {
  let s = fixture(2);
  s.phase = "defense";
  const enemy = make(s, "01097"),
    normal = s.heroes[0],
    exhausted = s.heroes[1],
    remote = ally(s, "01018", 1);
  exhausted.exhausted = remote.exhausted = true;
  s.engaged.push(enemy);
  hand(s, G.anchor);
  assert.ok(
    !Grey.greyHavensAnchorDefenders(s, enemy).some((u) => u.id === remote.id),
  );
  beginEnemyAttack(s, enemy, [normal.id]);
  flush(s);
  s = select(s, "skip");
  assert.ok(get(s, normal.id)!.exhausted);
  assert.equal(s.hand.filter((u) => u.code === G.anchor).length, 1);
});
test("Grey Havens attachment targets respect printed traits, icons and staging restriction", () => {
  const s = fixture(),
    location = make(s, "01099"),
    active = make(s, "01100");
  s.staging.push(location);
  s.activeLocation = active;
  const almanac = hand(s, G.almanac);
  assert.deepEqual(
    playTargets(s, almanac).map((u) => u.id),
    [location.id],
  );
  const sea = hand(s, G.sea);
  assert.deepEqual(
    playTargets(s, sea).map((u) => u.code),
    [G.cirdan, G.galdor],
  );
  for (const h of s.heroes) delete h.phaseResourceIcons;
  const compass = hand(s, G.compass);
  assert.equal(playTargets(s, compass).length, 0);
  syncAttachmentText(s);
  reload(s);
});
test("ship enemies are legal existing Feint and Gandalf targets and receive ordinary player-card damage", () => {
  let s = fixture();
  s.phase = "defense";
  const enemy = make(s, V.scout);
  s.engaged.push(enemy);
  const feint = hand(s, "01034");
  assert.ok(playTargets(s, feint).some((u) => u.id === enemy.id));
  s = applyAction(s, { type: "PLAY", id: feint.id, target: enemy.id });
  assert.equal(get(s, enemy.id)!.feinted, true);
  const gandalf = make(s, "01073");
  enterAlly(s, gandalf);
  flush(s);
  assert.match(s.choice!.title, /Gandalf/);
  assert.ok(s.choice!.options.some((o) => o.id === enemy.id));
  s = select(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 4);
});
test("ship objectives count as allies while printed immunity and ship-only defense restrict player targets", () => {
  let s = fixture();
  const ship = ally(s, V.dawn),
    ordinary = ally(s, G.navigator),
    enemy = make(s, V.scout);
  ship.exhausted = ordinary.exhausted = true;
  s.engaged.push(enemy);
  assert.equal(isAlly(ship), true);
  assert.ok(
    !expansionPlayTargets(s, card("02029"))!.some((u) => u.id === ship.id),
    "Born Aloft cannot target an immune ship ally",
  );
  assert.deepEqual(Grey.greyHavensAnchorDefenders(s, enemy), []);
  hand(s, G.anchor);
  assert.equal(
    Grey.greyHavensOfferAnchorAttack(s, enemy, []),
    false,
    "ordinary exhausted characters cannot defend ship attacks",
  );
  const hero = s.heroes[0],
    a = attach(s, hero, G.narya);
  s = ability(s, hero, a.id);
  assert.ok(!s.choice!.options.some((o) => o.id === ship.id));
  s = select(s, ordinary.id);
  assert.equal(get(s, ship.id)!.exhausted, true);
  assert.equal(get(s, ordinary.id)!.tempAttack, 1);
  reload(s);
});
test("Skyward Volley can damage a ship enemy using an ordinary ranged character", () => {
  let s = fixture();
  s.phase = "attack";
  const ranged = ally(s, "01017"),
    enemy = make(s, V.scout);
  s.engaged.push(enemy);
  s = play(s, G.volley, ranged.id);
  assert.ok(s.choice!.options.some((o) => o.id === enemy.id));
  s = select(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
});
test("Grey Havens player hooks leave ordinary phases free of new markers when no applicable card exists", () => {
  let s = fixture();
  s = effect(s, fx("startTravel"));
  assert.equal(s.choice, null);
  assert.equal(
    s.used.some((key) => key.startsWith("phase:grey-havens:")),
    false,
  );
  s.phase = "staging";
  s = effect(s, fx("finishQuestPhase"));
  assert.equal(
    s.used.some((key) => key.startsWith("phase:grey-havens:")),
    false,
  );
});
test("cancelled Skyward Volley still pays its additional ranged exhaustion cost", () => {
  let s = fixture();
  s.phase = "attack";
  const ranged = ally(s, "01017"),
    enemy = make(s, "01096"),
    balrog = make(s, S.bane);
  s.engaged.push(enemy);
  s.staging.push(balrog);
  attach(s, balrog, S.counter);
  s.encounterDeck = ["01093"];
  const before = s.heroes.reduce((sum, hero) => sum + hero.resources, 0);
  s = play(s, G.volley, ranged.id);
  assert.equal(get(s, ranged.id)!.exhausted, true);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.equal(
    s.heroes.reduce((sum, hero) => sum + hero.resources, 0),
    before - 2,
  );
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(G.volley));
  reload(s);
});
test("Shrine to Morgoth blocks Galdor's Action without spending the once-per-game limit", () => {
  const s = fateFixture();
  s.activeLocation = make(s, F.shrine);
  const galdor = make(s, G.galdor);
  s.heroes[0] = galdor;
  s.startingHeroes = s.heroes.map((u) => u.code);
  assert.match(Grey.greyHavensAbilityProblem(s, galdor)!, /drawable/);
  assert.throws(() => ability(s, galdor), /drawable/);
  assert.ok(!s.used.includes(`game:grey-havens:galdor:${galdor.id}`));
});
test("No End in Sight prevents Círdan's extra draw while his Forced still discards the framework card", () => {
  let s = ninFixture();
  const cirdan = make(s, G.cirdan);
  s.heroes[0] = cirdan;
  s.startingHeroes = s.heroes.map((u) => u.code);
  s.deck = ["01020", "01021", "01022"];
  collectResources(s);
  flush(s);
  assert.equal(s.hand.length, 1);
  assert.equal(s.choice!.options.length, 1);
  const chosen = s.choice!.options[0].id;
  s = select(s, chosen);
  assert.equal(s.hand.length, 0);
  assert.deepEqual(s.discard, ["01020"]);
  assert.deepEqual(s.deck, ["01021", "01022"]);
});
test("Compass excludes both Uncharted faces and rejects stale island targets before changing deck zones", () => {
  let s = fateFixture();
  const hero = s.heroes[2],
    compass = attach(s, hero, G.compass),
    island = fateAddIsland(s)!,
    flipped = make(s, F.temple),
    outgoing = make(s, "01099");
  s.staging.push(flipped, outgoing);
  s.encounterDeck = [F.plateau, "01099"];
  s = effect(s, fx("startTravel"));
  s = select(s, "use");
  s = select(s, "deck-0");
  assert.deepEqual(s.choice!.options.map((o) => o.id), [outgoing.id]);
  const zones = () => ({
    encounter: [...s.encounterDeck],
    discard: [...s.encounterDiscard],
    uncharted: [...s.fateNumenor!.unchartedDeck],
    hidden: { ...s.fateNumenor!.hiddenBacks },
    staging: s.staging.map((u) => ({ id: u.id, code: u.code })),
  });
  const before = zones();
  for (const invalid of [island, flipped]) {
    assert.throws(
      () => Grey.greyHavensEffect(s, fx("greyHavensCompassSwitch", {
        target: invalid.id, value: 0, code: F.plateau,
      })),
      /Switch the chosen physical locations/,
    );
    assert.deepEqual(zones(), before);
  }
  s = select(s, outgoing.id);
  assert.ok(s.staging.some((u) => u.code === F.plateau));
  assert.ok(s.staging.some((u) => u.id === island.id));
  assert.ok(s.staging.some((u) => u.id === flipped.id));
  assert.deepEqual(s.fateNumenor!.unchartedDeck, before.uncharted);
  assert.deepEqual(s.fateNumenor!.hiddenBacks, before.hidden);
  assert.equal(get(s, hero.id)!.attachments.find((a) => a.id === compass.id)!.exhausted, true);
  reload(s);
});
