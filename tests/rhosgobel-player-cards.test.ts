import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import { SHADOW_FLAME } from "../src/game/shadow-flame-support";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { RHOSGOBEL_PLAYER_CARDS } from "../src/game/rhosgobel-player-support.ts";
import { RHOS } from "../src/game/rhosgobel.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
  stats,
} from "../src/game/engine.ts";
import {
  damage,
  discardCharacter,
  nextRound,
  progressLocation,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import { rhosgobelQuestResolved } from "../src/game/rhosgobel-player-cards.ts";
import { huntDefenseEffects } from "../src/game/expansion-player-cards.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let nextId = 700_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `rhos-player-${nextId++}`,
  owner,
  code,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(sphere = "leadership") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(371, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => {
    h.resources = 5;
  });
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(372, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => {
      h.resources = 5;
    });
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function skipAll(s: GameState) {
  for (let i = 0; s.choice && i < 30; i++) s = choose(s, "skip");
  return s;
}
function radagastGame() {
  const s = game("lore"),
    radagast = unit("02059"),
    eagle = unit("02053");
  radagast.resources = 4;
  eagle.damage = 3;
  s.allies = [radagast, eagle];
  return { s, radagast, eagle };
}

test("A Journey to Rhosgobel registers its complete ten-card player set", () => {
  assert.equal(RHOSGOBEL_PLAYER_CARDS.length, 10);
  for (const c of RHOSGOBEL_PLAYER_CARDS)
    assert.ok(SCRIPTED.has(c.code), c.code);
});
test("Dúnedain Quest's willpower and resource-paid move follow its current hero", () => {
  let s = table();
  const donor = s.heroes[0],
    recipient = seatView(s, 2).heroes[0];
  const before = [stats(s, donor).will, stats(s, recipient).will];
  donor.attachments.push({
    id: "quest-signal",
    code: "02051",
    exhausted: false,
    owner: 0,
  });
  const resources = donor.resources;
  assert.equal(stats(s, donor).will, before[0] + 1);
  s = act(s, { type: "ABILITY", id: donor.id, attachmentId: "quest-signal" });
  s = choose(s, recipient.id);
  assert.equal(seatView(s, 0).heroes[0].resources, resources - 1);
  assert.equal(stats(s, seatView(s, 0).heroes[0]).will, before[0]);
  assert.equal(stats(s, seatView(s, 2).heroes[0]).will, before[1] + 1);
});
test("Parting Gifts moves any chosen quantity across players and triggers Heir of Mardil", () => {
  let s = table();
  const donor = s.heroes[0],
    recipient = seatView(s, 1).heroes[0];
  recipient.code = "05002";
  recipient.exhausted = true;
  recipient.attachments.push({
    id: "heir",
    code: "08113",
    exhausted: false,
    owner: 1,
  });
  const before = donor.resources + recipient.resources;
  s = play(s, "02052", donor.id);
  s = choose(s, recipient.id);
  s = choose(s, "amount-3");
  assert.equal(s.choice?.title, "Heir of Mardil");
  s = choose(s, "heir");
  const a = seatView(s, 0).heroes[0],
    b = seatView(s, 1).heroes[0];
  assert.equal(a.resources, 2);
  assert.equal(b.resources, 8);
  assert.equal(a.resources + b.resources, before);
  assert.equal(b.exhausted, false);
});
test("Parting Gifts can donate existing Sacked resources and use a granted Leadership icon", () => {
  let s = table();
  const donor = seatView(s, 2).heroes[0],
    recipient = s.heroes[1];
  donor.attachments.push(
    { id: "song", code: "02010", exhausted: false, owner: 2 },
    { id: "sack", code: CARROCK.sacked, exhausted: false },
  );
  const event = unit("02052");
  assert.ok(playTargets(s, event).some((u) => u.id === donor.id));
  s = play(s, "02052", donor.id);
  s = choose(s, recipient.id);
  s = choose(s, "amount-4");
  assert.equal(seatView(s, 2).heroes[0].resources, 1);
  assert.equal(seatView(s, 0).heroes[1].resources, 9);
});
test("Parting Gifts rejects a receiving hero while Sacked", () => {
  let s = game();
  const donor = s.heroes[0],
    recipient = s.heroes[1];
  recipient.attachments.push({
    id: "sack",
    code: CARROCK.sacked,
    exhausted: false,
  });
  s = play(s, "02052", donor.id);
  assert.ok(!s.choice?.options.some((o) => o.id === recipient.id));
});
test("Landroval recovers a destroyed hero with one damage and no old tokens or attachments", () => {
  let s = game();
  const hero = s.heroes[0],
    landroval = unit("02053");
  hero.attachments.push({ id: "old", code: "01026", exhausted: false });
  hero.damage = 1;
  const fallen = s.fallenThreat;
  landroval.exhausted = true;
  s.allies.push(landroval);
  damage(s, hero.id, 20);
  flush(s);
  assert.equal(s.choice?.title, "Landroval · Destroyed hero");
  s = choose(s, landroval.id);
  const recovered = s.heroes.find((u) => u.code === hero.code)!;
  assert.ok(recovered);
  assert.notEqual(recovered.id, hero.id);
  assert.equal(recovered.damage, 1);
  assert.equal(recovered.resources, 0);
  assert.equal(recovered.exhausted, false);
  assert.equal(recovered.attachments.length, 0);
  assert.equal(s.fallenThreat, fallen);
  assert.ok(!s.discard.includes(hero.code));
  assert.ok(s.discard.includes("01026"));
  assert.ok(s.hand.some((u) => u.code === "02053"));
  assert.ok(s.used.includes("game:landroval"));
});
test("Landroval's once-per-game limit survives round changes and later copies", () => {
  let s = game();
  const bird = unit("02053");
  s.allies.push(bird);
  damage(s, s.heroes[0].id, 20);
  flush(s);
  s = choose(s, bird.id);
  nextRound(s);
  flush(s);
  s = skipAll(s);
  assert.ok(s.used.includes("game:landroval"));
  s.allies.push(unit("02053"));
  damage(s, s.heroes[0].id, 20);
  flush(s);
  assert.notEqual(s.choice?.title, "Landroval · Destroyed hero");
});
test("Landroval can recover another player's hero while the limit belongs to his controller", () => {
  let s = table();
  const hero = seatView(s, 2).heroes[0],
    bird = unit("02053");
  s.allies.push(bird);
  syncSeat(s);
  damage(s, hero.id, 20);
  flush(s);
  s = choose(s, bird.id);
  assert.ok(
    seatView(s, 2).heroes.some((u) => u.code === hero.code && u.damage === 1),
  );
  assert.ok(seatView(s, 0).used.includes("game:landroval"));
  assert.ok(!seatView(s, 2).used.includes("game:landroval"));
});
test("Landroval does not prevent immediate elimination after the last hero is destroyed", () => {
  const s = game();
  s.heroes = [s.heroes[0]];
  s.allies.push(unit("02053"));
  damage(s, s.heroes[0].id, 20);
  flush(s);
  assert.equal(s.status, "lost");
  assert.equal(s.choice, null);
});
test("Landroval does not respond to an ordinary hero discard", () => {
  const s = game();
  s.allies.push(unit("02053"));
  discardCharacter(s, s.heroes[0]);
  flush(s);
  assert.notEqual(s.choice?.title, "Landroval · Destroyed hero");
});
test("Landroval cannot receive Restricted attachments", () => {
  const s = game("tactics"),
    bird = unit("02053");
  s.allies.push(bird);
  assert.ok(!playTargets(s, unit("01039")).some((u) => u.id === bird.id));
});
test("To the Eyrie pays its event cost and exhausts an Eagle to rescue another player's ally", () => {
  let s = table();
  const victim = unit("01013", 2),
    eagle = unit("02004", 1);
  seatView(s, 2).allies.push(victim);
  seatView(s, 1).allies.push(eagle);
  seatView(s, 1).hand.push(unit("02054", 1));
  syncSeat(s);
  const before = seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0);
  damage(s, victim.id, 20);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.equal(s.choice?.title, "To the Eyrie · Destroyed ally");
  s = choose(s, eagle.id);
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.equal(seatView(s, 1).allies[0].exhausted, true);
  assert.ok(seatView(s, 1).discard.includes("02054"));
  assert.ok(seatView(s, 2).hand.some((u) => u.code === "01013"));
  assert.ok(!seatView(s, 2).discard.includes("01013"));
});
test("Counter-Spell cancels To the Eyrie after Eagle exhaustion and resource payment, without consuming the destroyed ally", () => {
  let s = table();
  const victim = unit("01013", 2),
    eagle = unit("02004", 1),
    bane = unit(SHADOW_FLAME.bane);
  s.staging = [bane];
  bane.attachments = [
    { id: "eyrie-counter", code: SHADOW_FLAME.counter, exhausted: false },
  ];
  s.encounterDeck = [SHADOW_FLAME.flame];
  seatView(s, 2).allies.push(victim);
  seatView(s, 1).allies.push(eagle);
  seatView(s, 1).hand.push(unit("02054", 1));
  syncSeat(s);
  const before = seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0);
  damage(s, victim.id, 20);
  flush(s);
  s = choose(s, eagle.id);
  assert.equal(
    seatView(s, 1).allies.find((u) => u.id === eagle.id)!.exhausted,
    true,
  );
  assert.equal(
    seatView(s, 1).heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.ok(seatView(s, 1).discard.includes("02054"));
  assert.ok(seatView(s, 2).discard.includes(victim.code));
  assert.ok(!seatView(s, 2).hand.some((u) => u.code === victim.code));
  assert.equal(s.choice, null);
});
test("another player's To the Eyrie may still recover the same actual destroyed ally after the first copy is canceled", () => {
  let s = table();
  const victim = unit("01013", 2),
    bane = unit(SHADOW_FLAME.bane);
  s.staging = [bane];
  bane.attachments = [
    { id: "eyrie-counter", code: SHADOW_FLAME.counter, exhausted: false },
  ];
  s.encounterDeck = [SHADOW_FLAME.flame];
  seatView(s, 2).allies.push(victim);
  for (const player of [0, 1]) {
    const p = seatView(s, player);
    p.heroes[0].code = "01004";
    p.hand.push(unit("02054", player));
    p.allies.push(unit("02004", player));
  }
  syncSeat(s);
  damage(s, victim.id, 20);
  flush(s);
  s = choose(s, seatView(s, 0).allies[0].id);
  assert.equal(s.table!.active, 1);
  assert.equal(s.choice!.title, "To the Eyrie · Destroyed ally");
  s = choose(s, seatView(s, 1).allies[0].id);
  assert.ok(!seatView(s, 2).discard.includes(victim.code));
  assert.equal(
    seatView(s, 2).hand.filter((u) => u.code === victim.code).length,
    1,
  );
});
test("To the Eyrie is destruction-only and cannot exhaust another player's Eagle as its cost", () => {
  const s = table();
  const victim = unit("01013", 2);
  seatView(s, 2).allies.push(victim);
  seatView(s, 2).allies.push(unit("02004", 2));
  seatView(s, 1).hand.push(unit("02054", 1));
  damage(s, victim.id, 20);
  flush(s);
  assert.notEqual(s.choice?.title, "To the Eyrie · Destroyed ally");
  selectSeat(s, 1);
  s.allies.push(unit("02004", 1));
  s.choice = null;
  s.queue = [];
  const other = unit("01013", 2);
  seatView(s, 2).allies.push(other);
  discardCharacter(s, other);
  flush(s);
  assert.notEqual(s.choice?.title, "To the Eyrie · Destroyed ally");
});
test("To the Eyrie cannot rescue an older same-title discard after this physical ally was rescued", () => {
  let s = table();
  const victim = unit("01013", 2);
  seatView(s, 2).allies.push(victim);
  seatView(s, 2).discard.push("01013");
  for (const player of [0, 1]) {
    const p = seatView(s, player);
    p.heroes[0].code = "01004";
    p.hand.push(unit("02054", player));
    p.allies.push(unit("02004", player));
  }
  syncSeat(s);
  damage(s, victim.id, 20);
  flush(s);
  s = choose(s, seatView(s, 0).allies[0].id);
  assert.notEqual(s.choice?.title, "To the Eyrie · Destroyed ally");
  assert.equal(seatView(s, 2).discard.filter((c) => c === "01013").length, 1);
  assert.equal(seatView(s, 2).hand.filter((c) => c.code === "01013").length, 1);
});
test("Escort from Edoras gets its committed bonus and is forcibly discarded after any quest outcome", () => {
  for (const delta of [-1, 0, 1]) {
    let s = game("spirit");
    const escort = unit("02055");
    s.allies.push(escort);
    assert.equal(stats(s, escort).will, 2);
    escort.committed = true;
    assert.equal(stats(s, escort).will, 4);
    const enemy = unit("01082");
    enemy.tempThreat = 3 - delta;
    s.staging = [enemy];
    s.phase = "staging";
    s.encounterDeck = [];
    s.encounterDiscard = [];
    s = act(s, { type: "NEXT" });
    assert.equal(s.lastQuest?.net, delta);
    assert.ok(!s.allies.some((u) => u.id === escort.id));
    assert.ok(s.discard.includes("02055"));
  }
});
test("An Escort removed from the quest loses the bonus and does not resolve the committed Forced effect", () => {
  const s = game("spirit"),
    escort = unit("02055");
  s.allies.push(escort);
  escort.committed = true;
  escort.committed = false;
  assert.equal(stats(s, escort).will, 2);
  rhosgobelQuestResolved(s);
  assert.ok(s.allies.some((u) => u.id === escort.id));
});
test("Ancient Mathom offers optional first-player draws for each explored copy", () => {
  let s = table();
  const location = unit("01095");
  s.activeLocation = location;
  s.table!.first = 2;
  location.attachments.push(
    { id: "mathom-a", code: "02056", exhausted: false, owner: 0 },
    { id: "mathom-b", code: "02056", exhausted: false, owner: 1 },
  );
  const before = seatView(s, 2).hand.length;
  progressLocation(s, location, card(location.code).quest!);
  flush(s);
  assert.equal(s.table!.active, 0);
  assert.equal(s.choice?.title, "Ancient Mathom · Explored location");
  s = choose(s, "draw");
  assert.equal(s.table!.active, 1);
  s = choose(s, "draw");
  assert.equal(seatView(s, 2).hand.length, before + 6);
  assert.ok(seatView(s, 0).discard.includes("02056"));
  assert.ok(seatView(s, 1).discard.includes("02056"));
});
test("Ancient Mathom attaches only to locations and does not trigger below exploration", () => {
  const s = game("spirit"),
    location = unit("01095");
  s.staging.push(location);
  const mathom = unit("02056");
  assert.deepEqual(
    playTargets(s, mathom).map((u) => u.id),
    [location.id],
  );
  location.attachments.push({
    id: "mathom",
    code: mathom.code,
    exhausted: false,
  });
  progressLocation(s, location, 1);
  flush(s);
  assert.equal(s.choice, null);
});
test("Text blanking suppresses Mathom's exploration response and Dúnedain Quest's action", () => {
  const s = game("spirit");
  s.activeLocation = unit(EMYN.amonLhaw);
  const location = unit("01095");
  s.staging.push(location);
  location.attachments.push({
    id: "blank-mathom",
    code: "02056",
    exhausted: false,
  });
  s.heroes[0].attachments.push({
    id: "blank-quest",
    code: "02051",
    exhausted: false,
  });
  assert.ok(
    !availableAbilities(s, s.heroes[0]).some((a) => a.id === "blank-quest"),
  );
  assert.equal(stats(s, s.heroes[0]).will, card(s.heroes[0].code).willpower);
  progressLocation(s, location, card(location.code).quest!);
  flush(s);
  assert.equal(s.choice, null);
});
test("Infighting moves tokens between staging and engaged enemies before destroying its target", () => {
  let s = game("lore");
  const donor = unit("01082"),
    recipient = unit("01074");
  donor.damage = 4;
  recipient.damage = 1;
  s.staging.push(donor);
  s.engaged.push(recipient);
  s = play(s, "02058", donor.id);
  s = choose(s, recipient.id);
  s = choose(s, "amount-2");
  assert.equal(s.staging.find((u) => u.id === donor.id)!.damage, 2);
  assert.ok(!s.engaged.some((u) => u.id === recipient.id));
  assert.ok(s.encounterDiscard.includes("01074"));
  assert.ok(s.discard.includes("02058"));
  assert.notEqual(s.choice?.title, "Foe-hammer · Defeated enemy");
});
test("Infighting requires two enemies and never includes its source as receiving target", () => {
  let s = game("lore");
  const donor = unit("01082");
  donor.damage = 1;
  s.staging.push(donor);
  assert.match(canPlay(s, unit("02058"))!, /different enemy/);
  s.staging.push(unit("01074"));
  s = play(s, "02058", donor.id);
  assert.ok(!s.choice?.options.some((o) => o.id === donor.id));
});
test("Radagast heals an Eagle for the chosen resource quantity without exhausting", () => {
  const { s: initial, radagast, eagle } = radagastGame();
  let s = initial;
  radagast.exhausted = true;
  assert.equal(availableAbilities(s, radagast)[0].disabled, false);
  s = act(s, { type: "ABILITY", id: radagast.id });
  s = choose(s, eagle.id);
  s = choose(s, "amount-2");
  assert.equal(s.allies.find((u) => u.id === radagast.id)!.resources, 2);
  assert.equal(s.allies.find((u) => u.id === radagast.id)!.exhausted, true);
  assert.equal(s.allies.find((u) => u.id === eagle.id)!.damage, 1);
});
test("Radagast may heal an enemy Creature and rejects undamaged Creatures", () => {
  const { s: initial, radagast, eagle } = radagastGame();
  let s = initial;
  eagle.damage = 0;
  const spider = unit("01096");
  spider.damage = 2;
  s.staging.push(spider);
  s = act(s, { type: "ABILITY", id: radagast.id });
  assert.ok(s.choice?.options.some((o) => o.id === spider.id));
  assert.ok(!s.choice?.options.some((o) => o.id === eagle.id));
  s = choose(s, spider.id);
  s = choose(s, "amount-1");
  assert.equal(s.staging[0].damage, 1);
});
test("Radagast's resource phase collects one and his pool pays Creature cards without a Tactics hero", () => {
  let s = game("lore");
  const radagast = unit("02059");
  s.allies.push(radagast);
  nextRound(s);
  flush(s);
  assert.equal(radagast.resources, 1);
  radagast.resources = 2;
  s = act(s, { type: "NEXT" });
  assert.equal(canPlay(s, unit("02004")), null);
  const played = play(s, "02004");
  assert.equal(played.allies.find((u) => u.id === radagast.id)!.resources, 0);
  assert.ok(played.allies.some((u) => u.code === "02004"));
  assert.match(canPlay(s, unit("02054"))!, /sphere hero/);
});
test("Radagast's Creature-only payment pool cannot pay Winged Guardian's after-defense Tactics fee", () => {
  const s = game("lore"),
    radagast = unit("02059"),
    guardian = unit("02004");
  radagast.resources = 4;
  s.allies = [radagast, guardian];
  s.queue.push(...huntDefenseEffects(s, [guardian.id]));
  flush(s);
  assert.ok(!s.allies.some((u) => u.id === guardian.id));
  assert.equal(radagast.resources, 4);
  assert.ok(s.discard.includes("02004"));
  assert.equal(s.choice, null);
});
test("Radagast respects Wilyador's staging healing lock and stage-two source removal", () => {
  let s = game("lore");
  s.scenarioId = "journey-to-rhosgobel";
  s.stage = 2;
  const radagast = unit("02059"),
    eagle = unit(RHOS.wilyador);
  radagast.resources = 8;
  eagle.damage = 10;
  s.allies = [radagast, eagle];
  s.staging = [unit(RHOS.rhosgobel)];
  assert.equal(availableAbilities(s, radagast)[0].disabled, true);
  s.staging = [];
  s = act(s, { type: "ABILITY", id: radagast.id });
  s = choose(s, eagle.id);
  s = choose(s, "amount-8");
  assert.equal(s.allies.find((u) => u.id === eagle.id)!.damage, 5);
  assert.ok(!s.allies.some((u) => u.id === radagast.id));
  assert.ok(s.removed.includes("02059"));
  assert.ok(!s.discard.includes("02059"));
});
