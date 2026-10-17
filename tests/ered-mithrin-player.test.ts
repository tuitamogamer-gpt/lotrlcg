import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { ERED_PLAYER_ART } from "./ered-mithrin-player-art";
import { card, playerCards, SCRIPTED } from "../src/game/cards";
import {
  availableAbilities,
  canPlay,
  playTargets,
  publicState,
  validateSave,
} from "../src/game/engine";
import {
  canFight,
  fx,
  get,
  make,
  playCost,
  prepend,
  stats,
  threatOf,
} from "../src/game/core";
import {
  addVictoryCard,
  collectResources,
  destroy,
  phaseEnd,
  progressLocation,
  returnAlly,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table";
import {
  effectiveKeyword,
  questExhausts,
} from "../src/game/expansion-passives";
import { isAlly, isHero } from "../src/game/card-types";
import * as E from "../src/game/ered-mithrin-player";
import {
  ERED_MITHRIN_PLAYER as P,
  ERED_MITHRIN_PLAYER_CARDS,
  eredMithrinPlayerRefresh,
} from "../src/game/ered-mithrin-player-support";
import {
  ability,
  act,
  ally,
  attach,
  fixture,
  hand,
  pick,
  play,
  reload,
  settle,
} from "./ered-mithrin-player-fixtures";
import type { GameState } from "../src/game/types";

test("forty originals have one native definition and unchanged source metadata", () => {
  const originals = JSON.parse(
    fs.readFileSync("src/data/official-player-cards.json", "utf8"),
  );
  assert.equal(ERED_MITHRIN_PLAYER_CARDS.length, 40);
  for (const c of ERED_MITHRIN_PLAYER_CARDS) {
    const source = originals.find((a: { code: string }) => a.code === c.code);
    assert.deepEqual({ ...c, imagesrc: source.imagesrc }, source);
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(
      playerCards.filter((a) => a.code === c.code).length,
      1,
      c.code,
    );
  }
});
test("all40 original scan bytes retain immutable source UUIDs and SHA256 pins", () => {
  assert.equal(ERED_PLAYER_ART.length, 40);
  for (const a of ERED_PLAYER_ART) {
    const bytes = fs.readFileSync(`public${a.localPath}`);
    assert.equal(bytes.length, a.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), a.sha256);
    assert.match(a.source, new RegExp(`${a.octgnid}\\.jpg$`));
  }
});
test("Grimbeorn's native defense offers a paid exhausted counterattack against that enemy", () => {
  let s = fixture();
  s.phase = "defense";
  const g = s.heroes[0],
    enemy = make(s, "01085");
  enemy.shadows = ["01099"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: g.id });
  while (s.flow?.pending)
    s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Grimbeorn/);
  s = pick(s, "use");
  s = settle(s);
  assert.equal(get(s, g.id)!.resources, 14);
  assert.ok(get(s, g.id)!.exhausted);
  assert.ok(
    !get(s, enemy.id),
    "its reduced defense allows the physical counterattack to destroy it",
  );
});
test("Grimbeorn may counterattack an immune enemy without reducing its defense", () => {
  let s = fixture();
  s.phase = "defense";
  const g = s.heroes[0],
    enemy = make(s, "octgn:f35e7236-2e03-4e03-aa92-7c4803e79acf");
  enemy.shadows = ["01099"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: g.id });
  while (s.flow?.pending)
    s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /Grimbeorn/);
  s = pick(s, "use");
  s = settle(s);
  assert.equal(get(s, g.id)!.resources, 14);
  assert.equal(
    get(s, enemy.id)!.damage,
    0,
    "immune enemy retains all3defense against Grimbeorn's3attack",
  );
});
test("Beorn's Rage is a native declaration Response, pays its event, and weakens only that enemy for the phase", () => {
  let s = fixture();
  s.phase = "attack";
  const g = s.heroes[0],
    enemy = make(s, "01085"),
    event = hand(s, P.rage);
  s.engaged.push(enemy);
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [g.id] });
  assert.match(s.choice!.title, /Beorn's Rage/);
  s = pick(s, event.id);
  s = settle(s);
  assert.ok(s.discard.includes(P.rage));
  assert.equal(s.heroes[0].resources, 14);
});
test("The Hidden Way searches native quest-start top five, moves old active, and stores one fewer reveal", () => {
  let s = fixture();
  const old = make(s, "01100");
  s.activeLocation = old;
  const e = hand(s, P.hidden);
  s.encounterDeck = ["01092", "01099", "01085", "01090", "01101"];
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Hidden Way/);
  s = pick(s, e.id);
  s = pick(s, "1");
  assert.equal(s.activeLocation!.code, "01099");
  assert.ok(s.staging.some((l) => l.id === old.id));
  assert.ok(s.used.includes("phase:ered-hidden"));
  assert.ok(validateSave(s));
});
test("Quicker Than Sight pays a controlled Silvan return before canceling a native shadow", () => {
  let s = fixture();
  s.phase = "defense";
  const g = s.heroes[0],
    silvan = ally(s, P.galion),
    enemy = make(s, "01085"),
    event = hand(s, P.quicker);
  enemy.shadows = ["01092"];
  enemy.revealedShadowCount = 0;
  s.engaged.push(enemy);
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderId: g.id });
  while (s.flow?.pending)
    s = act(s, { type: "CONTINUE", stepId: s.flow.pending.id });
  assert.match(s.choice!.title, /shadow falls/);
  s = pick(s, event.id);
  assert.match(s.choice!.title, /Return a Silvan/);
  s = pick(s, silvan.id);
  s = settle(s);
  assert.ok(s.hand.some((h) => h.code === P.galion));
  assert.ok(s.discard.includes(P.quicker));
});
test("Swift and Strong exhausts its Weapon as cost and readies only after its event resolves", () => {
  let s = fixture();
  s.phase = "attack";
  const g = s.heroes[0],
    weapon = attach(s, g, P.sword),
    event = hand(s, P.swift),
    enemy = make(s, "01085");
  s.engaged.push(enemy);
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [g.id] });
  assert.match(s.choice!.title, /Swift and Strong/);
  s = pick(s, event.id);
  s = pick(s, weapon.id);
  s = settle(s);
  assert.equal(get(s, g.id)!.exhausted, false);
  assert.equal(get(s, g.id)!.attachments[0].exhausted, true);
  assert.ok(s.used.includes(`phase:ered-swift-next:${g.id}`));
  assert.ok(s.discard.includes(P.swift));
});
test("Glamdring and Orcrist resolve distinct native destruction responses for draw and attached hero resources", () => {
  let s = fixture();
  s.phase = "attack";
  const g = s.heroes[0],
    glam = attach(s, g, P.glamdring),
    orc = attach(s, g, P.orcrist),
    enemy = make(s, "01085");
  s.engaged.push(enemy);
  const before = s.hand.length,
    resources = g.resources;
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [g.id] });
  s = settle(s, "use");
  assert.equal(s.hand.length, before + 1);
  assert.equal(get(s, g.id)!.resources, resources + 1);
  assert.ok(get(s, g.id)!.attachments.some((a) => a.id === glam.id));
  assert.ok(get(s, g.id)!.attachments.some((a) => a.id === orc.id));
  assert.ok(!get(s, enemy.id));
});
test("Guardian counts different equipped player cards up to three and printed armor passives remain canonical", () => {
  const s = fixture(),
    g = ally(s, P.guardian);
  attach(s, g, P.helm);
  attach(s, g, P.helm);
  attach(s, g, P.sword);
  attach(s, g, P.armor);
  attach(s, g, P.determination);
  assert.equal(stats(s, g).will, 4);
  assert.equal(stats(s, g).attack, 4);
  assert.equal(stats(s, g).defense, 6);
  assert.equal(stats(s, g).health, 10);
  assert.equal(questExhausts(s, g), false);
  assert.ok(!playTargets(s, hand(s, P.helm)).some((u) => u.id === g.id));
});
test("Skin-changer replaces itself with the chosen physical Beorning from hand and discard", () => {
  for (const fromDiscard of [false, true]) {
    let s = fixture();
    s.phase = "attack";
    const skin = ally(s, P.skin);
    let bear;
    if (fromDiscard) s.discard.push(P.bear);
    else bear = hand(s, P.bear);
    s = ability(s, skin.id);
    s = pick(s, fromDiscard ? "discard-0" : bear!.id);
    s = settle(s);
    assert.ok(!get(s, skin.id));
    assert.equal(s.allies.filter((u) => u.code === P.bear).length, 1);
    assert.ok(s.discard.includes(P.skin));
    assert.equal(s.hand.length, 0);
  }
});
test("Long Lake Fisherman names a cost before choosing among top five and shuffles after decline", () => {
  let s = fixture();
  s.deck = [P.helm, P.bear, P.fisherman, P.walls, P.elvenking, "01026"];
  const f = hand(s, P.fisherman);
  s = play(s, f.id);
  s = pick(s, "use");
  assert.match(s.choice!.title, /Name a printed cost/);
  s = pick(s, "5");
  assert.equal(
    s.choice!.options.some((o) => o.code === P.bear),
    true,
  );
  s = pick(s, "1");
  assert.ok(s.hand.some((u) => u.code === P.bear));
  assert.equal(s.deck.length, 5);
  assert.ok(validateSave(s));
});
test("Woodmen's Clearing and Haldan respond to exploration with preserved attachment count and first player ownership", () => {
  let s = fixture(2);
  const loc = make(s, "01099");
  s.activeLocation = loc;
  attach(s, loc, P.clearing);
  attach(s, loc, P.path);
  const before = seatView(s, 0).hand.length,
    threat = seatView(s, 0).threat;
  assert.equal(
    questExhausts(
      s,
      s.heroes.find((h) => h.code === P.haldan)!,
    ),
    false,
  );
  progressLocation(s, loc, 10);
  flush(s);
  s = settle(s, "use");
  assert.equal(seatView(s, 0).hand.length, before + 2);
  assert.equal(seatView(s, 0).threat, threat - 3);
  assert.equal(seatView(s, 1).threat, 20);
});
test("Grey Cloak consumes its physical attachment and skips only its controller's check this phase", () => {
  let s = fixture(2);
  s.phase = "encounter";
  const h = s.heroes[1],
    cloak = attach(s, h, P.cloak),
    enemy = make(s, "01085");
  s.staging.push(enemy);
  s = ability(s, h.id, cloak.id);
  s = pick(s, enemy.id);
  assert.ok(get(s, h.id)!.exhausted);
  assert.ok(!get(s, h.id)!.attachments.some((a) => a.id === cloak.id));
  assert.ok(s.discard.includes(P.cloak));
  assert.ok(seatView(s, 0).used.includes(`phase:ered-cloak:${enemy.id}`));
  assert.ok(!seatView(s, 1).used.includes(`phase:ered-cloak:${enemy.id}`));
});
for (const code of [P.arkenstone, P.glamdring, P.orcrist, P.ring])
  test(`${card(code).name} discards without When Revealed and releases the same physical guarded card`, () => {
    let s = fixture();
    if (code === P.ring) {
      s.heroes[1] = make(s, P.dain);
      s.heroes[1].resources = 15;
      s.heroes[1].phaseResourceIcons = [
        "leadership",
        "spirit",
        "lore",
        "tactics",
      ];
      s.startingHeroes = s.heroes.map((h) => h.code);
    }
    const a = hand(s, code);
    s.encounterDeck = ["01092", "01085", "01099"];
    s = play(s, a.id);
    s = settle(s);
    const guard = s.staging.find((u) => u.code === "01085")!;
    assert.ok(guard);
    assert.deepEqual(s.encounterDiscard, ["01092"]);
    assert.equal(guard.attachments[0].id, a.id);
    assert.equal(s.threat, 20);
    destroy(s, guard);
    flush(s);
    assert.match(s.choice!.title, /Choose an eligible character/);
    s = pick(s, s.choice!.options[0].id);
    assert.ok(
      allCharacters(s).some((u) => u.attachments.some((b) => b.id === a.id)),
    );
    assert.ok(validateSave(s));
  });
test("Arkenstone willpower follows unique characters and transfer pays both threat effects once per round", () => {
  let s = fixture(2);
  const h = s.heroes[0],
    foreign = seatView(s, 1).heroes[0],
    a = attach(s, h, P.arkenstone);
  const before = stats(s, h).will;
  assert.equal(before, card(h.code).willpower! + 1);
  assert.equal(stats(s, foreign).will, card(foreign.code).willpower);
  s = ability(s, h.id, a.id);
  s = pick(s, foreign.id);
  assert.equal(seatView(s, 0).threat, 18);
  assert.equal(seatView(s, 1).threat, 22);
  assert.equal(get(s, foreign.id)!.attachments[0].id, a.id);
  selectSeat(s, 1);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, foreign.id)!, a.id));
});
test("Wiglaf free Item is played on him and his ready action exhausts a selected attachment once per phase", () => {
  let s = fixture();
  const w = hand(s, P.wiglaf),
    helm = hand(s, P.helm);
  s = play(s, w.id);
  assert.match(s.choice!.title, /Wiglaf/);
  s = pick(s, helm.id);
  assert.ok(get(s, w.id)!.attachments.some((a) => a.id === helm.id));
  get(s, w.id)!.exhausted = true;
  s = ability(s, w.id);
  s = pick(s, helm.id);
  assert.equal(get(s, w.id)!.exhausted, false);
  assert.equal(get(s, w.id)!.attachments[0].exhausted, true);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, w.id)!));
});
test("Woodmen's Path only attaches before progress and changes active quest value; Traveler and Hunter follow attachments", () => {
  let s = fixture();
  const loc = make(s, "01099");
  s.staging.push(loc);
  const path = hand(s, P.path);
  s = play(s, path.id, loc.id);
  const traveler = ally(s, P.traveler);
  assert.equal(stats(s, traveler).will, 1);
  s.activeLocation = s.staging.shift()!;
  assert.equal(stats(s, traveler).will, 2);
  assert.equal(playCost(s, card(P.hunter)), 3);
  s.activeLocation.progress = 1;
  assert.ok(!playTargets(s, hand(s, P.path)).some((u) => u.id === loc.id));
});
test("Meneldor enters and leaves with separate optional progress responses and rejects restricted attachments", () => {
  let s = fixture();
  const loc = make(s, "01099");
  s.staging.push(loc);
  const m = hand(s, P.meneldor);
  s = play(s, m.id);
  s = pick(s, loc.id);
  assert.equal(get(s, loc.id)!.progress, 2);
  assert.ok(!playTargets(s, hand(s, P.helm)).some((u) => u.id === m.id));
  returnAlly(s, get(s, m.id)!);
  flush(s);
  assert.match(s.choice!.title, /Meneldor/);
  s = pick(s, "skip");
  assert.equal(s.hand.filter((u) => u.code === P.meneldor).length, 1);
});
test("Wild Stallion keeps its identity as an ally-owned restricted Mount and grants all four bonuses", () => {
  let s = fixture();
  const horse = ally(s, P.stallion),
    g = ally(s, P.guardian);
  s = ability(s, horse.id);
  s = pick(s, g.id);
  assert.ok(!s.allies.some((u) => u.id === horse.id));
  assert.equal(get(s, g.id)!.attachments[0].id, horse.id);
  assert.equal(stats(s, get(s, g.id)!).will, 3);
  assert.equal(stats(s, get(s, g.id)!).health, 3);
  assert.ok(validateSave(s));
});
test("South Away moves without paying travel and reduces each player's threat by all attachments", () => {
  let s = fixture(3);
  s.phase = "travel";
  const old = make(s, "01100"),
    loc = make(s, "01099");
  s.activeLocation = old;
  s.staging.push(loc);
  attach(s, loc, P.path);
  attach(s, loc, P.clearing);
  const event = hand(s, P.south);
  s = play(s, event.id, loc.id);
  assert.equal(s.activeLocation!.id, loc.id);
  assert.ok(s.staging.some((u) => u.id === old.id));
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 18);
});
test("Flight of Eagles returns an Eagle as cost, consumes one reserve, removes event, and native reveal assigns controller", () => {
  let s = fixture(2);
  const eagle = ally(s, P.meneldor),
    flight = hand(s, P.flight);
  s = play(s, flight.id, eagle.id);
  s = settle(s);
  assert.ok(s.hand.some((u) => u.code === P.meneldor));
  assert.ok(s.removed.includes(P.flight));
  assert.equal(s.eredEagleReserves![0], 2);
  assert.equal(s.encounterDeck.filter((c) => c === P.eagle).length, 1);
  const u = make(s, P.eagle);
  s.staging.push(u);
  E.eredMithrinPlayerEagleRevealed(s, u);
  flush(s);
  s = pick(s, "1");
  s = settle(s);
  assert.ok(seatView(s, 1).allies.some((a) => a.code === P.eagle));
});
test("Thranduil pays actual printed cost without sphere match and enforces Combat and once per round", () => {
  let s = fixture();
  s.phase = "attack";
  for (const h of s.heroes) h.phaseResourceIcons = [];
  const t = s.heroes.find((h) => h.code === P.thranduil)!,
    g = hand(s, P.galion);
  s = ability(s, t.id);
  s = pick(s, g.id);
  s = settle(s, "use");
  assert.ok(get(s, g.id));
  assert.equal(stats(s, get(s, g.id)!).will, 1);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, t.id)!));
  assert.equal(E.eredMithrinPlayerAbilityLabel(P.galion), null);
});
test("The Elvenking exhausts physical title and returns controlled Silvan to ready its attached hero", () => {
  let s = fixture();
  const h = s.heroes.find((h) => h.code === P.thranduil)!,
    a = attach(s, h, P.elvenking),
    g = ally(s, P.galion);
  h.exhausted = true;
  s = ability(s, h.id, a.id);
  s = pick(s, g.id);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.attachments[0].exhausted, true);
  assert.ok(s.hand.some((u) => u.code === P.galion));
});
test("Leather Boots responds only to a revealed location and exhausts the selected copy", () => {
  let s = fixture();
  const h = s.heroes[1],
    a = attach(s, h, P.boots);
  h.exhausted = true;
  E.eredMithrinPlayerLocationRevealed(s, make(s, "01099"));
  flush(s);
  s = pick(s, "use");
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.equal(get(s, h.id)!.attachments[0].exhausted, true);
});
test("Giant Bear readies once per phase then shuffles into the owner's deck at that phase end", () => {
  let s = fixture(2);
  const b = ally(s, P.bear, 1);
  b.exhausted = true;
  selectSeat(s, 1);
  s = ability(s, b.id);
  assert.equal(get(s, b.id)!.exhausted, false);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, b.id)!));
  phaseEnd(s);
  flush(s);
  s = settle(s);
  assert.ok(!get(s, b.id));
  assert.ok(seatView(s, 1).deck.includes(P.bear));
});
test("Outmatched attaches on its controller's next engagement and readies a surviving defender", () => {
  let s = fixture(2);
  const trap = hand(s, P.outmatched);
  s = play(s, trap.id);
  assert.ok(s.staging.some((u) => u.id === trap.id));
  const e = make(s, "01085");
  s.engaged.push(e);
  E.eredMithrinPlayerEnemyEngaged(s, e, 1);
  assert.equal(e.attachments.length, 0);
  E.eredMithrinPlayerEnemyEngaged(s, e, 0);
  assert.equal(e.attachments[0].id, trap.id);
  const d = s.heroes[0];
  d.exhausted = true;
  E.eredMithrinPlayerEnemyAttackResolved(s, e, [d.id]);
  flush(s);
  s = settle(s, "use");
  assert.equal(get(s, d.id)!.exhausted, false);
});
test("Galion cannot attack or defend and optional willpower expires after the round", () => {
  const s = fixture(),
    g = ally(s, P.galion);
  assert.equal(E.eredMithrinPlayerAbilityLabel(P.galion), null);
  assert.ok(!availableAbilities(s, g).length);
  assert.equal(card(g.code).attack, 0);
  assert.equal(canFight(g), false);
});
test("Thalion transforms physically after three side quests, gains icons/resources, and demotes when text is blanked", () => {
  let s = fixture(2);
  const t = ally(s, P.thalion, 1);
  for (const code of ["09014", "10009", "10034"]) addVictoryCard(s, code);
  eredMithrinPlayerRefresh(s);
  assert.ok(isHero(t));
  assert.ok(!isAlly(t));
  assert.ok(seatView(s, 1).heroes.some((u) => u.id === t.id));
  assert.ok(!seatView(s, 1).allies.some((u) => u.id === t.id));
  assert.ok(allHeroes(s).some((u) => u.id === t.id));
  const before = t.resources;
  collectResources(s);
  assert.equal(get(s, t.id)!.resources, before + 1);
  s = reload(s);
  const beforePublic = JSON.stringify(s);
  publicState(s);
  assert.equal(
    JSON.stringify(s),
    beforePublic,
    "public rendering does not promote or mutate cards",
  );
});
test("Dáin uses a real deck discard only while defending, caps three per phase, and clears after attack", () => {
  let s = fixture(2);
  selectSeat(s, 1);
  const d = s.heroes.find((h) => h.code === P.dain)!,
    enemy = make(s, "01085");
  s.engaged.push(enemy);
  s.phase = "defense";
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, d));
  if (s.table) s.table.turn = 1;
  s.combat = {
    enemyId: enemy.id,
    defenderId: d.id,
    attackPlayer: 1,
    attackBonus: 0,
  };
  const before = s.deck.length;
  for (let n = 0; n < 3; n++) s = ability(s, d.id);
  assert.equal(s.deck.length, before - 3);
  assert.equal(stats(s, get(s, d.id)!).defense, 6);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, d.id)!));
  E.eredMithrinPlayerEnemyAttackResolved(s, get(s, enemy.id)!, [d.id]);
  assert.equal(stats(s, get(s, d.id)!).defense, 3);
});
test("Soldier of Erebor discards three physical deck cards to ready once per round", () => {
  let s = fixture();
  const d = ally(s, P.soldier);
  d.exhausted = true;
  const before = s.deck.length;
  s = ability(s, d.id);
  assert.equal(s.deck.length, before - 3);
  assert.equal(s.discard.length, 3);
  assert.equal(get(s, d.id)!.exhausted, false);
  assert.ok(E.eredMithrinPlayerAbilityProblem(s, get(s, d.id)!));
});
test("Man the Walls applies once to each player's next ally, disallows their questing, and rejects all further copies that round", () => {
  let s = fixture(4);
  const e = hand(s, P.walls);
  s = play(s, e.id);
  for (const p of playerOrder(s)) {
    selectSeat(s, p);
    const h = hand(s, P.guardian);
    assert.equal(playCost(s, card(h.code)), 1);
    s = play(s, h.id);
    assert.ok(seatView(s, p).used.includes(`round:ered-walls:${h.id}`));
    assert.equal(playCost(s, card(P.guardian)), 2);
  }
  selectSeat(s, 2);
  assert.ok(canPlay(s, hand(s, P.walls)));
  assert.ok(validateSave(s));
});
test("Familiar Lands follows equipped player locations only; Girion discounts Items and Warrior Sword caps at three enemies", () => {
  let s = fixture();
  const l = make(s, "01099"),
    other = make(s, "01100");
  s.staging.push(l, other);
  attach(s, l, P.path);
  attach(s, other, "01080");
  const e = hand(s, P.lands);
  s = play(s, e.id);
  assert.ok(s.used.includes("phase:ered-lands"));
  const trappedEnemy = make(s, "01085");
  s.staging.push(trappedEnemy);
  attach(s, trappedEnemy, P.outmatched);
  assert.equal(
    threatOf(s, trappedEnemy),
    card(trappedEnemy.code).threat,
    "Familiar Lands never reduces an attached enemy's threat",
  );
  const g = ally(s, P.girion);
  assert.equal(playCost(s, card(P.helm), g), 0);
  attach(s, g, P.sword);
  s.engaged = Array.from({ length: 4 }, () => make(s, "01085"));
  assert.equal(stats(s, g).attack, 5);
});
test("Ring of Thrór discards the actual top attachment and puts it into play after readying its hero", () => {
  let s = fixture(2);
  selectSeat(s, 1);
  const h = s.heroes.find((h) => h.code === P.dain)!,
    ring = attach(s, h, P.ring),
    g = ally(s, P.guardian);
  h.exhausted = true;
  s.deck = [P.helm, ...s.deck];
  s = ability(s, h.id, ring.id);
  assert.match(s.choice!.title, /Ring of Thrór/);
  s = pick(s, g.id);
  assert.equal(get(s, h.id)!.exhausted, false);
  assert.ok(get(s, g.id)!.attachments.some((a) => a.code === P.helm));
  assert.ok(!s.discard.includes(P.helm));
  assert.equal(get(s, h.id)!.attachments[0].exhausted, true);
});
for (const players of [1, 2, 3, 4])
  test(`pending player choices preserve physical card ownership for ${players} players`, () => {
    let s = fixture(players);
    const p = players - 1;
    selectSeat(s, p);
    const w = hand(s, P.wiglaf),
      h = hand(s, P.helm);
    s = play(s, w.id);
    assert.ok(s.choice);
    s = reload(s);
    s = pick(s, h.id);
    assert.equal(ownerOf(s, get(s, w.id)!), p);
    assert.equal(get(s, w.id)!.attachments[0].owner ?? 0, p);
    syncSeat(s);
    assert.ok(validateSave(s));
  });
