import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import {
  applyAction,
  availableAbilities,
  canPlay,
  playTargets,
} from "../src/game/engine";
import {
  eligiblePayers,
  fx,
  get,
  make,
  prepend,
  stats,
} from "../src/game/core";
import {
  collectResources,
  discardPlayerDeck,
  engage,
  enterAlly,
  phaseEnd,
} from "../src/game/board";
import { addQuestProgress } from "../src/game/side-quests";
import { flush } from "../src/game/effects";
import { forOwner, seatView, selectSeat } from "../src/game/table";
import {
  MUMAKIL_PLAYER as P,
  MUMAKIL_PLAYER_CARDS,
  mumakilKahlielPays,
} from "../src/game/mumakil-player-support";
import {
  mumakilAttackersDeclared,
  mumakilCharactersCommitted,
  mumakilDefendersDeclared,
  mumakilPlayerDeckDiscarded,
  mumakilConeyCondition,
  mumakilEnemyCannotAttack,
} from "../src/game/mumakil-player";
import { collectorEnemyCannotAttack } from "../src/game/collector-player-cards";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  mumakilPlayerFixture as fixture,
  mumakilPlayerHand as hand,
  mumakilPlayerAlly as ally,
  mumakilPlayerAttach as attach,
} from "./mumakil-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";

const pick = (s: GameState, id: string) => choose(reload(s), id);
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
function settle(s: GameState) {
  for (let n = 0; s.choice && n < 50; n++)
    s = pick(
      s,
      s.choice.options.find((o) => ["skip", "continue"].includes(o.id))?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
function offerAttack(s: GameState, source: ReturnType<typeof make>) {
  const enemy = s.engaged[0] ?? make(s, "01089");
  prepend(s, ...mumakilAttackersDeclared(s, enemy, [source]));
  flush(s);
  return s;
}
function offerDefense(
  s: GameState,
  source: ReturnType<typeof make>,
  exhausted = true,
) {
  const enemy = s.engaged[0] ?? make(s, "01089");
  prepend(
    s,
    ...mumakilDefendersDeclared(
      s,
      enemy,
      [source],
      exhausted ? [source.id] : [],
    ),
  );
  flush(s);
  return s;
}

test("Mûmakil preserves ten original designs, 28 physical cards and two previously implemented designs", () => {
  const catalog = JSON.parse(fs.readFileSync("public/catalog.json", "utf8"));
  assert.deepEqual(
    MUMAKIL_PLAYER_CARDS,
    catalog.filter((c: { code: string }) =>
      Object.values(P).includes(c.code as typeof P.kahliel),
    ),
  );
  assert.equal(MUMAKIL_PLAYER_CARDS.length, 10);
  assert.equal(
    MUMAKIL_PLAYER_CARDS.reduce((n, c) => n + c.quantity!, 0),
    28,
  );
  for (const c of MUMAKIL_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.equal(playerCards.filter((p) => p.code === c.code).length, 1);
    assert.equal(card(c.code).text, c.text);
  }
  assert.equal(card(P.prepare).quest, 6);
  assert.equal(card(P.prepare).victory, 1);
});
test("Kahliel pays for Harad allies of any sphere, without lending that permission to other heroes or non-Harad cards", () => {
  const s = fixture();
  for (const h of s.heroes) delete h.phaseResourceIcons;
  assert.ok(
    eligiblePayers(s, card(P.firyal)).some((h) => h.code === P.kahliel),
  );
  assert.ok(!eligiblePayers(s, card(P.firyal)).some((h) => h.code === "01006"));
  assert.ok(
    !eligiblePayers(s, card("01059")).some((h) => h.code === P.kahliel),
  );
  s.heroes[0].blanked = true;
  assert.equal(mumakilKahlielPays(s.heroes[0], card(P.firyal)), false);
});
test("Native Harad ally play pays five actual Kahliel resources and preserves the physical ally identity", () => {
  let s = fixture();
  for (const h of s.heroes) {
    delete h.phaseResourceIcons;
    h.resources = h.code === P.kahliel ? 5 : 0;
  }
  const f = hand(s, P.firyal);
  assert.equal(canPlay(s, f), null);
  s = settle(
    act(s, { type: "PLAY", id: f.id, payment: { [s.heroes[0].id]: 5 } }),
  );
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(get(s, f.id)!.code, P.firyal);
});
test("Kahliel's native action chooses and discards one physical Harad hand copy before readying another player's ally", () => {
  let s = fixture(2);
  const hero = s.heroes[0],
    cost = hand(s, P.yazan),
    kept = hand(s, P.yazan),
    foreign = hand(s, P.jubayr, 1),
    target = ally(s, P.firyal, 1);
  target.exhausted = true;
  s = act(s, { type: "ABILITY", id: hero.id });
  s = pick(s, target.id);
  assert.ok(s.choice!.options.some((o) => o.id === cost.id));
  assert.ok(!s.choice!.options.some((o) => o.id === foreign.id));
  s = pick(s, cost.id);
  assert.equal(get(s, target.id)!.exhausted, false);
  assert.ok(s.hand.some((u) => u.id === kept.id));
  assert.ok(!s.hand.some((u) => u.id === cost.id));
  assert.equal(s.discard.filter((c) => c === P.yazan).length, 1);
  assert.equal(seatView(s, 1).hand[0].id, foreign.id);
});
test("Kahliel can ready himself and pays his discard cost without spending resources", () => {
  let s = fixture();
  const h = s.heroes[0],
    c = hand(s, P.yazan);
  h.exhausted = true;
  s = act(s, { type: "ABILITY", id: h.id });
  s = pick(s, h.id);
  s = pick(s, c.id);
  assert.equal(s.heroes[0].exhausted, false);
  assert.equal(s.heroes[0].resources, 10);
});
test("Kahliel's phase limit survives saves and resets only at phase end", () => {
  let s = fixture();
  const h = s.heroes[0],
    a = ally(s, P.firyal),
    c = hand(s, P.yazan);
  hand(s, P.jubayr);
  a.exhausted = true;
  s = act(s, { type: "ABILITY", id: h.id });
  s = pick(s, a.id);
  s = pick(s, c.id);
  get(s, a.id)!.exhausted = true;
  assert.ok(
    availableAbilities(reload(s), get(s, h.id)!).find((o) => !o.id)!.disabled,
  );
  phaseEnd(s);
  assert.ok(
    !availableAbilities(reload(s), get(s, h.id)!).find((o) => !o.id)!.disabled,
  );
});
test("Kahliel has no usable action without a Harad ally cost or an affected exhausted Harad target", () => {
  const s = fixture(),
    h = s.heroes[0];
  hand(s, "01013");
  h.exhausted = true;
  assert.ok(availableAbilities(s, h)[0].disabled);
  hand(s, P.yazan);
  h.exhausted = false;
  assert.ok(availableAbilities(s, h)[0].disabled);
});
test("Headdress attaches only to Kahliel and gives every player's Harad characters one willpower", () => {
  const s = fixture(2),
    h = s.heroes[0],
    own = ally(s, P.yazan),
    remote = ally(s, P.firyal, 1),
    non = ally(s, "01016", 1),
    a = hand(s, P.headdress);
  assert.deepEqual(
    playTargets(s, a).map((u) => u.id),
    [h.id],
  );
  const before = [h, own, remote, non].map((u) => stats(s, u).will);
  attach(s, h, P.headdress);
  assert.deepEqual(
    [h, own, remote, non].map(
      (u) => stats(s, u).will - before[[h, own, remote, non].indexOf(u)],
    ),
    [1, 1, 1, 0],
  );
});
test("Headdress's Refresh Action shuffles only the topmost Harad ally in its controller's discard pile", () => {
  let s = fixture(2),
    host = seatView(s, 1).heroes[0];
  host.code = P.kahliel;
  s.heroes[0].code = "01002";
  const a = attach(s, host, P.headdress, 0);
  a.controller = 0;
  s.phase = "refresh";
  s.discard = [P.jubayr];
  s.deck = ["01016"];
  forOwner(s, 1, () => {
    s.discard = [P.firyal, "01013", P.yazan, "01014"];
    s.deck = ["01015"];
  });
  selectSeat(s, 1);
  s.table!.turn = 1;
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: a.id });
  assert.deepEqual(s.discard, [P.firyal, "01013", "01014"]);
  assert.deepEqual([...s.deck].sort(), ["01015", P.yazan].sort());
  assert.deepEqual(seatView(s, 0).discard, [P.jubayr]);
  assert.equal(get(s, host.id)!.attachments[0].exhausted, true);
});
test("Headdress is restricted to refresh and cannot exhaust without an available topmost Harad ally", () => {
  const s = fixture(),
    h = s.heroes[0],
    a = attach(s, h, P.headdress);
  s.discard = [P.firyal];
  assert.ok(availableAbilities(s, h).find((o) => o.id === a.id)!.disabled);
  s.phase = "refresh";
  s.discard = ["01013"];
  assert.ok(availableAbilities(s, h).find((o) => o.id === a.id)!.disabled);
});
test("Prepare for Battle costs one, takes six progress and grants one additional draw only to the actual first player", () => {
  let s = fixture(2);
  const q = hand(s, P.prepare);
  s = settle(act(s, { type: "PLAY", id: q.id }));
  assert.ok(s.staging.some((u) => u.id === q.id));
  addQuestProgress(s, get(s, q.id)!, 6);
  flush(s);
  assert.equal(s.victoryCards!.filter((c) => c === P.prepare).length, 1);
  s.table!.first = 1;
  forOwner(s, 0, () => (s.deck = ["01013", "01014", "01015"]));
  forOwner(s, 1, () => (s.deck = ["01016", "01017", "01018"]));
  collectResources(s);
  flush(s);
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 2);
});
test("A second defeated Prepare for Battle goes to its physical owner's discard instead of duplicating victory", () => {
  const s = fixture(2);
  s.victoryCards = [P.prepare];
  const q = make(s, P.prepare);
  q.owner = 1;
  q.controller = 0;
  s.staging = [q];
  addQuestProgress(s, q, 6);
  flush(s);
  assert.deepEqual(s.victoryCards, [P.prepare]);
  assert.deepEqual(seatView(s, 1).discard, [P.prepare]);
  assert.ok(!s.discard.includes(P.prepare));
});
test("Firyal's native commitment offers a private optional look, survives reload and discards the actual top before staging", () => {
  let s = fixture();
  const f = ally(s, P.firyal);
  s.phase = "quest";
  s.committedIds = [f.id];
  s.encounterDeck = ["01089", "01100", "01099"];
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Firyal/);
  assert.ok(s.choice!.options.every((o) => !o.code));
  s = pick(s, "use");
  assert.equal(
    s.choice!.options.find((o) => o.id === "discard")!.code,
    "01089",
  );
  s = pick(s, "discard");
  s = settle(s);
  assert.ok(s.encounterDiscard.includes("01089"));
  assert.ok(s.staging.some((u) => u.code === "01100"));
  assert.equal(get(s, f.id)!.committed, true);
});
test("Firyal can decline without revealing or discarding, or keep the looked-at card", () => {
  for (const choice of ["skip", "keep"]) {
    let s = fixture();
    const f = ally(s, P.firyal);
    s.encounterDeck = ["01089", "01100"];
    f.committed = true;
    mumakilCharactersCommitted(s, [f.id]);
    flush(s);
    if (choice === "keep") {
      s = pick(s, "use");
      s = pick(s, "keep");
    } else s = pick(s, "skip");
    assert.deepEqual(s.encounterDeck, ["01089", "01100"]);
    assert.deepEqual(s.encounterDiscard, []);
  }
});
test("Firyal's blanked text and empty encounter deck cannot initiate a look", () => {
  const s = fixture(),
    f = ally(s, P.firyal);
  f.blanked = true;
  mumakilCharactersCommitted(s, [f.id]);
  flush(s);
  assert.equal(s.choice, null);
  f.blanked = false;
  s.encounterDeck = [];
  mumakilCharactersCommitted(s, [f.id]);
  flush(s);
  assert.equal(s.choice, null);
});
test("Yazan's native attack deals response damage to another nonunique enemy before the declared attack resolves", () => {
  let s = fixture(),
    y = ally(s, P.yazan),
    enemy = make(s, "01082"),
    target = make(s, "01089");
  s.phase = "attack";
  s.engaged = [enemy];
  s.staging = [target];
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [y.id] });
  assert.match(s.choice!.title, /Yazan/);
  s = pick(s, target.id);
  s = settle(s);
  assert.equal(get(s, target.id)!.damage, 1);
  assert.equal(get(s, enemy.id)!.damage, 0);
  assert.equal(get(s, y.id)!.exhausted, true);
});
test("Yazan can kill the declared target before ordinary combat and the continuation safely completes", () => {
  let s = fixture(),
    y = ally(s, P.yazan),
    enemy = make(s, "01089");
  enemy.damage = 2;
  s.phase = "attack";
  s.engaged = [enemy];
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [y.id] });
  s = pick(s, enemy.id);
  s = settle(s);
  assert.equal(get(s, enemy.id), undefined);
  assert.ok(s.encounterDiscard.includes(enemy.code));
  assert.equal(s.choice, null);
});
test("Yazan may damage another player's enemy and his once-per-phase limit persists across saves", () => {
  let s = fixture(2),
    y = ally(s, P.yazan),
    target = make(s, "01089");
  forOwner(s, 1, () => (s.engaged = [target]));
  s = offerAttack(s, y);
  s = pick(s, target.id);
  assert.equal(get(s, target.id)!.damage, 1);
  s = offerAttack(s, get(s, y.id)!);
  assert.equal(s.choice, null);
  phaseEnd(s);
  s = offerAttack(s, get(s, y.id)!);
  assert.match(s.choice!.title, /Yazan/);
});
test("Yazan excludes unique enemies and enemies immune to player card effects, and declining uses no limit", () => {
  let s = fixture(),
    y = ally(s, P.yazan),
    target = make(s, "01089"),
    immune = make(s, "01082"),
    unique = make(s, "octgn:486f9475-98e1-42d9-ac90-e6190545a5b9");
  immune.immuneToPlayerEffects = true;
  s.staging = [target, immune, unique];
  s = offerAttack(s, y);
  assert.ok(!s.choice!.options.some((o) => o.id === immune.id));
  assert.ok(!s.choice!.options.some((o) => o.id === unique.id));
  s = pick(s, "skip");
  s = offerAttack(s, get(s, y.id)!);
  assert.match(s.choice!.title, /Yazan/);
});
test("Jubayr's native defense discards a real facedown shadow before its effect can resolve", () => {
  let s = fixture(),
    j = ally(s, P.jubayr),
    enemy = make(s, "01089");
  enemy.shadows = ["01092"];
  s.phase = "defense";
  s.engaged = [enemy];
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: j.id });
  assert.match(s.choice!.title, /Jubayr/);
  s = pick(s, `${enemy.id}:0`);
  s = settle(s);
  assert.ok(s.encounterDiscard.includes("01092"));
  assert.equal(get(s, j.id)!.damage, 0);
  assert.equal(get(s, j.id)!.exhausted, true);
});
test("Jubayr can discard another enemy's facedown shadow but cannot choose revealed or unique-host shadows", () => {
  let s = fixture(2),
    j = ally(s, P.jubayr),
    enemy = make(s, "01089"),
    unique = make(s, "octgn:486f9475-98e1-42d9-ac90-e6190545a5b9");
  enemy.shadows = ["01092", "01093", "01094"];
  enemy.revealedShadowCount = 1;
  enemy.faceupShadows = [false, true, false];
  unique.shadows = ["01092"];
  s.staging = [unique];
  forOwner(s, 1, () => (s.engaged = [enemy]));
  s = offerDefense(s, j);
  assert.deepEqual(
    s.choice!.options.filter((o) => o.id !== "skip").map((o) => o.id),
    [`${enemy.id}:2`],
  );
  s = pick(s, `${enemy.id}:2`);
  assert.deepEqual(get(s, enemy.id)!.shadows, ["01092", "01093"]);
  assert.equal(get(s, enemy.id)!.revealedShadowCount, 1);
  assert.equal(get(s, enemy.id)!.faceupShadows?.[1], true);
  assert.ok(s.encounterDiscard.includes("01094"));
});
test("Jubayr does not respond when declared without exhausting and respects his phase limit", () => {
  let s = fixture(),
    j = ally(s, P.jubayr),
    e = make(s, "01089");
  e.shadows = ["01092", "01093"];
  s.engaged = [e];
  s = offerDefense(s, j, false);
  assert.equal(s.choice, null);
  s = offerDefense(s, j);
  s = pick(s, `${e.id}:0`);
  s = offerDefense(s, get(s, j.id)!);
  assert.equal(s.choice, null);
  phaseEnd(s);
  s = offerDefense(s, get(s, j.id)!);
  assert.match(s.choice!.title, /Jubayr/);
});
test("Jubayr can remove a shadow from an immune nonunique enemy because attached cards do not inherit immunity", () => {
  let s = fixture(),
    j = ally(s, P.jubayr),
    e = make(s, "01089");
  e.immuneToPlayerEffects = true;
  e.shadows = ["01092"];
  s.engaged = [e];
  s = offerDefense(s, j);
  s = pick(s, `${e.id}:0`);
  assert.deepEqual(get(s, e.id)!.shadows, []);
});
test("Andrath's existing native play response remains active under the original Mûmakil printing", () => {
  let s = fixture(),
    e = make(s, "01082"),
    u = hand(s, P.guardsman);
  s.engaged = [e];
  s = act(s, { type: "PLAY", id: u.id });
  s = pick(s, "use");
  s = pick(s, e.id);
  assert.ok(collectorEnemyCannotAttack(s, get(s, e.id)!, 0));
});
test("Wait no Longer's original printing searches only top five and reduces actual staging", () => {
  let s = fixture();
  hand(s, P.wait);
  s.encounterDeck = ["01077", "01081", "01077", "01077", "01077", "01089"];
  s = act(s, { type: "NEXT" });
  s = pick(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.code === "01089"));
  s = pick(s, "enemy-1");
  s = act(s, { type: "COMMIT" });
  s = settle(s);
  assert.equal(s.staging.length, 0);
  assert.equal(s.engaged[0].code, "01081");
});
test("Dwarf Pipe attaches only to a Dwarf character with one copy per character", () => {
  const s = fixture(),
    dwarf = ally(s, "01028"),
    pipe = hand(s, P.pipe);
  assert.ok(playTargets(s, pipe).some((u) => u.id === dwarf.id));
  assert.ok(!playTargets(s, pipe).some((u) => u.id === s.heroes[0].id));
  attach(s, dwarf, P.pipe);
  assert.ok(!playTargets(s, pipe).some((u) => u.id === dwarf.id));
});
test("Dwarf Pipe returns the chosen actual card from an atomic top-two discard to deck bottom after reload", () => {
  let s = fixture(),
    dwarf = ally(s, "01028"),
    pipe = attach(s, dwarf, P.pipe);
  s.deck = ["01013", "01014", "01015"];
  s.discard = ["01013"];
  discardPlayerDeck(s, 2);
  flush(s);
  assert.match(s.choice!.title, /Dwarf Pipe/);
  s = pick(s, `${pipe.id}:2`);
  assert.deepEqual(s.deck, ["01015", "01014"]);
  assert.deepEqual(s.discard, ["01013", "01013"]);
  assert.equal(get(s, dwarf.id)!.attachments[0].exhausted, true);
});
test("Two Dwarf Pipes keep identical discarded copies separate and never recover an older matching discard", () => {
  let s = fixture(),
    d1 = ally(s, "01028"),
    d2 = ally(s, "01028"),
    p1 = attach(s, d1, P.pipe),
    p2 = attach(s, d2, P.pipe);
  s.deck = ["01013", "01013", "01015"];
  s.discard = ["01013"];
  discardPlayerDeck(s, 2);
  flush(s);
  s = pick(s, `${p1.id}:2`);
  assert.match(s.choice!.title, /Dwarf Pipe/);
  s = pick(s, `${p2.id}:1`);
  assert.deepEqual(s.deck, ["01015", "01013", "01013"]);
  assert.deepEqual(s.discard, ["01013"]);
});
test("Dwarf Pipe declining leaves both the discarded card and its ready attachment unchanged", () => {
  let s = fixture(),
    d = ally(s, "01028"),
    p = attach(s, d, P.pipe);
  s.deck = ["01013", "01015"];
  discardPlayerDeck(s, 1);
  flush(s);
  s = pick(s, "skip");
  assert.deepEqual(s.deck, ["01015"]);
  assert.deepEqual(s.discard, ["01013"]);
  assert.equal(
    get(s, d.id)!.attachments.find((a) => a.id === p.id)!.exhausted,
    false,
  );
});
test("Dwarf Pipe responds only for the discard deck's player and current errata also covers a non-top deck card", () => {
  let s = fixture(2),
    d = ally(s, "01028", 1),
    pipe = attach(s, d, P.pipe, 0);
  forOwner(s, 1, () => (s.discard = ["01014"]));
  mumakilPlayerDeckDiscarded(s, ["01014"], 0);
  flush(s);
  assert.equal(s.choice, null);
  mumakilPlayerDeckDiscarded(s, ["01014"], 1);
  flush(s);
  assert.match(s.choice!.title, /Dwarf Pipe/);
  s = pick(s, `${pipe.id}:0`);
  assert.ok(seatView(s, 1).deck.at(-1) === "01014");
  assert.deepEqual(seatView(s, 1).discard, []);
});
test("Coney needs two distinct unique Ranger and Warrior characters under its caster's control", () => {
  const s = fixture(2);
  s.heroes = [s.heroes[0]];
  ally(s, P.yazan);
  const j = ally(s, P.jubayr, 1);
  assert.equal(mumakilConeyCondition(s), false);
  ally(s, P.jubayr);
  assert.equal(mumakilConeyCondition(s), true);
  s.allies = [];
  s.heroes[0].dynamicTraits = ["Ranger", "Warrior"];
  assert.equal(mumakilConeyCondition(s), false);
  assert.equal(seatView(s, 1).allies[0].id, j.id);
});
test("Coney's native engagement response pays one actual Lore resource and prevents that enemy attacking only its caster", () => {
  let s = fixture(2);
  ally(s, P.yazan);
  ally(s, P.jubayr);
  const c = hand(s, P.coney),
    e = make(s, "01089");
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  engage(s, e);
  flush(s);
  assert.match(s.choice!.title, /Coney/);
  s = pick(s, "use");
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  assert.ok(s.discard.includes(P.coney));
  assert.ok(!s.hand.some((u) => u.id === c.id));
  assert.equal(mumakilEnemyCannotAttack(s, get(s, e.id)!, 0), true);
  assert.equal(mumakilEnemyCannotAttack(s, get(s, e.id)!, 1), false);
  s.phase = "defense";
  assert.throws(
    () => act(s, { type: "DEFEND", enemyId: e.id, defenderId: s.heroes[0].id }),
    /cannot attack/,
  );
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.heroes[0].exhausted, false);
});
test("Coney cannot be played in a normal action window and declining engagement spends no cost", () => {
  let s = fixture();
  ally(s, P.yazan);
  ally(s, P.jubayr);
  const c = hand(s, P.coney),
    e = make(s, "01089");
  assert.match(canPlay(s, c)!, /automatically/);
  engage(s, e);
  flush(s);
  s = pick(s, "skip");
  assert.ok(s.hand.some((u) => u.id === c.id));
  assert.equal(mumakilEnemyCannotAttack(s, get(s, e.id)!), false);
});
test("Dwarf Pipe's physical batch resolves before a mining ally can shift the remaining discard positions", () => {
  let s = fixture();
  const dwarf = ally(s, "01028"),
    pipe = attach(s, dwarf, P.pipe);
  s.deck = ["12066", "01013", "01014"];
  discardPlayerDeck(s, 2);
  flush(s);
  assert.match(s.choice!.title, /Dwarf Pipe/);
  s = pick(s, `${pipe.id}:1`);
  assert.match(s.choice!.title, /Ered Luin Miner/);
  s = pick(s, "enter");
  assert.deepEqual(s.deck, ["01014", "01013"]);
  assert.ok(s.allies.some((u) => u.code === "12066"));
  assert.deepEqual(s.discard, []);
});
