import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { SHADOW_FLAME_PLAYER_CARDS } from "../src/game/shadow-flame-player-support.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import { effectCardPlayProblem } from "../src/game/actions.ts";
import { nextRound, phaseEnd } from "../src/game/board.ts";
import { beginEnemyAttack } from "../src/game/combat.ts";
import { canPay, eligiblePayers, playCost, stats } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import { hasResourceIcon } from "../src/game/expansion-passives.ts";
import { rhosgobelHeal, RHOS } from "../src/game/rhosgobel.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import {
  allCharacters,
  selectSeat,
  seatView,
  syncSeat,
} from "../src/game/table.ts";
import { validateSave } from "../src/game/save.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_080_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `shadow-player-${nextId++}`,
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
function game(sphere = "lore") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(671, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(672, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01007", "01008"], deckId: "spirit" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => (h.resources = 10));
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
function vilya(s: GameState, code: string) {
  s.heroes[0].code = "04128";
  s.heroes[0].attachments.push({
    id: "vilya",
    code: "04137",
    exhausted: false,
  });
  s.deck = [code, ...s.deck];
  return act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: "vilya" });
}

test("Shadow and Flame registers all ten exact printed player designs", () => {
  assert.equal(SHADOW_FLAME_PLAYER_CARDS.length, 10);
  for (const c of SHADOW_FLAME_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Elrond pays for allies from other spheres without granting their resource icons", () => {
  let s = game();
  s.heroes[0].code = "04128";
  assert.ok(
    eligiblePayers(s, card("02004")).some((h) => h.id === s.heroes[0].id),
  );
  assert.equal(hasResourceIcon(s.heroes[0], "tactics"), false);
  assert.equal(canPay(s, card("02002")), false);
  const before = s.heroes[0].resources;
  s = play(s, "02004");
  assert.equal(s.heroes[0].resources, before - 2);
  assert.ok(s.allies.some((u) => u.code === "02004"));
});
test("Text blanking disables Elrond's ally-payment permission while Vilya's icon remains", () => {
  const s = game();
  s.heroes[0].code = "04128";
  s.heroes[0].attachments.push(
    { id: "fear", code: KHAZAD.fear, exhausted: false },
    { id: "vilya", code: "04137", exhausted: false },
  );
  assert.equal(eligiblePayers(s, card("02004")).length, 0);
  assert.equal(hasResourceIcon(s.heroes[0], "spirit"), true);
});
test("Elrond responds only to actual healing by another card and does not recurse", () => {
  let s = game();
  s.heroes[0].code = "04128";
  s.heroes[1].damage = 4;
  rhosgobelHeal(s, s.heroes[1], 2, { code: "01063" });
  flush(s);
  assert.equal(s.choice?.title, "Elrond · After another card heals");
  s = choose(s, "heal");
  assert.equal(s.heroes[1].damage, 1);
  assert.equal(s.choice, null);
  rhosgobelHeal(s, s.heroes[1], 1);
  flush(s);
  assert.equal(s.choice, null);
});
test("Elrond's extra heal respects Wilyador's individual effect cap and removes Elrond at stage two", () => {
  let s = game();
  s.scenarioId = "journey-to-rhosgobel";
  s.stage = 2;
  s.heroes[0].code = "04128";
  const wily = unit(RHOS.wilyador);
  wily.damage = 10;
  s.allies.push(wily);
  s.discard.push("01063");
  rhosgobelHeal(s, wily, 8, { code: "01063", player: 0 });
  flush(s);
  assert.equal(s.allies[0].damage, 5);
  s = choose(s, "heal");
  assert.equal(s.allies[0].damage, 4);
  assert.ok(s.removed.includes("04128"));
  assert.ok(!s.heroes.some((u) => u.code === "04128"));
});
test("Miruvor chooses two distinct benefits and its willpower lasts through phase ends", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.exhausted = true;
  hero.attachments.push({ id: "miruvor", code: "04133", exhausted: true });
  assert.equal(
    availableAbilities(s, hero).find((a) => a.id === "miruvor")?.disabled,
    false,
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "miruvor" });
  s = choose(s, "ready");
  assert.ok(!s.choice?.options.some((o) => o.id === "ready"));
  s = choose(s, "will");
  assert.equal(s.heroes[0].exhausted, false);
  const base = card(s.heroes[0].code).willpower!;
  assert.equal(stats(s, s.heroes[0]).will, base + 1);
  phaseEnd(s);
  assert.equal(stats(s, s.heroes[0]).will, base + 1);
  nextRound(s);
  assert.equal(stats(s, s.heroes[0]).will, base);
});
test("Miruvor's returned physical card goes to its owner while benefits follow the host controller", () => {
  let s = table();
  selectSeat(s, 1);
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "foreign",
    code: "04133",
    owner: 0,
    exhausted: false,
  });
  const before = hero.resources;
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "foreign" });
  s = choose(s, "resource");
  s = choose(s, "top");
  assert.equal(seatView(s, 1).heroes[0].resources, before + 1);
  assert.equal(seatView(s, 0).deck[0], "04133");
  assert.equal(seatView(s, 1).deck[0] === "04133", false);
});
test("Sacked excludes Miruvor resources but leaves its other attachment benefits available", () => {
  let s = game("spirit"),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "miruvor", code: "04133", exhausted: false },
    { id: "sacked", code: CARROCK.sacked, exhausted: false },
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "miruvor" });
  assert.ok(!s.choice?.options.some((o) => o.id === "resource"));
  s = choose(s, "will");
  s = choose(s, "top");
  assert.equal(s.deck[0], "04133");
});
test("Master of the Forge searches its original top five and adds without drawing", () => {
  let s = game(),
    forge = unit("04134");
  s.allies.push(forge);
  s.deck = ["01013", "01014", "01026", "01015", "01016", "01057"];
  s.used.push("phase:elf-cannot-draw");
  s = act(s, { type: "ABILITY", id: forge.id });
  assert.ok(!s.choice?.options.some((o) => o.code === "01057"));
  s = choose(s, "card-2");
  assert.ok(s.hand.some((u) => u.code === "01026"));
  assert.equal(s.deck.length, 5);
  assert.equal(s.allies[0].exhausted, true);
});
test("Master of the Forge may fail its search and still shuffles a short deck", () => {
  let s = game(),
    forge = unit("04134");
  s.allies.push(forge);
  s.deck = ["01013", "01026"];
  s = act(s, { type: "ABILITY", id: forge.id });
  s = choose(s, "none");
  assert.equal(s.hand.length, 0);
  assert.equal(s.deck.length, 2);
});
test("Peace and Thought enforces Refresh and exhausts two different own heroes before drawing five", () => {
  let s = game();
  assert.ok(canPlay(s, unit("04135")));
  s.phase = "refresh";
  s.deck = ["01013", "01014", "01015", "01016", "01020", "01026"];
  s = play(s, "04135");
  const first = s.heroes[0].id,
    second = s.heroes[1].id;
  s = choose(s, first);
  assert.ok(!s.choice?.options.some((o) => o.id === first));
  s = choose(s, second);
  assert.equal(s.hand.length, 5);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.heroes[1].exhausted, true);
});
test("Peace and Thought can exhaust Sacked as an event cost but cannot exhaust Watchful Eyes", () => {
  let s = game();
  s.phase = "refresh";
  s.heroes[0].attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  s.heroes[1].attachments.push({
    id: "eyes",
    code: KHAZAD.fear,
    exhausted: false,
  });
  s = play(s, "04135");
  assert.ok(s.choice?.options.some((o) => o.id === s.heroes[0].id));
  assert.ok(!s.choice?.options.some((o) => o.id === s.heroes[1].id));
});
test("Risk Some Light moves one original viewed card to bottom then orders only unselected cards", () => {
  let s = game();
  s.threat = 20;
  s.encounterDeck = ["01082", "01083", "01084", "01086"];
  assert.equal(playCost(s, card("04136")), 0);
  s = play(s, "04136");
  s = choose(s, "card-1");
  assert.ok(!s.choice?.options.some((o) => o.code === "01086"));
  s = choose(s, "card-1");
  s = choose(s, "card-0");
  assert.deepEqual(s.encounterDeck, ["01084", "01082", "01086", "01083"]);
  assert.equal(s.lastReveal, null);
});
test("Risk Some Light may move no card and preserves duplicate printed encounter identities", () => {
  let s = game();
  s.encounterDeck = ["01082", "01082"];
  s = play(s, "04136");
  s = choose(s, "none");
  s = choose(s, "card-1");
  s = choose(s, "card-0");
  assert.deepEqual(s.encounterDeck, ["01082", "01082"]);
});
test("Hands Upon the Bow pays one exhaustion and resolves a staging attack with temporary plus one", () => {
  let s = game("tactics"),
    legolas = s.heroes[1],
    enemy = unit("01082");
  s.staging.push(enemy);
  const base = stats(s, legolas).attack;
  s = play(s, "04131", legolas.id);
  assert.equal(s.heroes[1].exhausted, true);
  s = choose(s, enemy.id);
  assert.equal(s.staging[0].damage, 1);
  assert.equal(stats(s, s.heroes[1]).attack, base);
  assert.equal(s.staging[0].attacked, false);
});
test("Hands Upon the Bow still exhausts Trollshaw Scout as its explicit event cost", () => {
  let s = game("tactics"),
    scout = unit("04104"),
    enemy = unit("01082");
  s.allies.push(scout);
  s.staging.push(enemy);
  s.hand.push(unit("01020"));
  s = play(s, "04131", scout.id);
  assert.equal(s.allies[0].exhausted, true);
  s = choose(s, enemy.id);
  assert.equal(s.choice?.title, "Trollshaw Scout · After attacking");
});
test("Hands Upon the Bow cannot target an enemy immune to player card effects", () => {
  const s = game("tactics"),
    enemy = unit(KHAZAD.nameless);
  s.staging.push(enemy);
  assert.ok(canPlay(s, unit("04131")));
  assert.equal(playTargets(s, unit("04131")).length, 0);
});
test("A Elbereth responds to the actual attacked player with Sentinel defense and preserves threat costs", () => {
  let s = table();
  selectSeat(s, 1);
  s.table!.turn = 1;
  s.threat = 20;
  const enemy = unit("01084", 1),
    sentinel = seatView(s, 0).heroes[0];
  sentinel.attachments.push({
    id: "sentinel",
    code: "02117",
    exhausted: false,
  });
  s.engaged.push(enemy);
  s.hand.push(unit("04132", 1));
  s.phase = "defense";
  syncSeat(s);
  beginEnemyAttack(s, enemy, [sentinel.id]);
  flush(s);
  assert.equal(s.table!.active, 1);
  assert.equal(s.choice?.title, "A Elbereth! Gilthoniel! · Enemy attacked you");
  s = choose(s, "play");
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.equal(s.encounterDeck.at(-1), "01084");
  assert.equal(seatView(s, 1).threat, 40);
  assert.ok(seatView(s, 1).discard.includes("04132"));
});
test("Canceled attacks do not offer A Elbereth and cannot resolve damage", () => {
  const s = game("spirit"),
    enemy = unit("01084");
  s.phase = "defense";
  enemy.feinted = true;
  s.engaged.push(enemy);
  s.hand.push(unit("04132"));
  beginEnemyAttack(s, enemy, [s.heroes[0].id]);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.heroes[0].damage, 0);
  assert.ok(s.hand.some((u) => u.code === "04132"));
});
test("A Elbereth never removes a unique enemy or turns its return into a victory kill", () => {
  const s = game("spirit"),
    enemy = unit(CARROCK.louis),
    defender = unit("01073");
  s.engaged.push(enemy);
  s.allies.push(defender);
  s.hand.push(unit("04132"));
  s.phase = "defense";
  beginEnemyAttack(s, enemy, [defender.id]);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.victory, 0);
  assert.ok(s.engaged.some((u) => u.code === CARROCK.louis));
  assert.ok(canPlay(s, unit("04132")));
});
test("Vilya grants only Elrond a Spirit icon and can exhaust its Sacked host as an attachment cost", () => {
  const s = game();
  s.heroes[0].code = "04128";
  assert.deepEqual(
    playTargets(s, unit("04137")).map((u) => u.id),
    [s.heroes[0].id],
  );
  s.heroes[0].attachments.push(
    { id: "vilya", code: "04137", exhausted: false },
    { id: "sacked", code: CARROCK.sacked, exhausted: false },
  );
  assert.equal(hasResourceIcon(s.heroes[0], "spirit"), true);
  assert.equal(
    availableAbilities(s, s.heroes[0]).find((a) => a.id === "vilya")?.disabled,
    false,
  );
});
test("Vilya plays an off-sphere ally at no cost and triggers PLAY rather than hand-only responses", () => {
  let s = game();
  s.discard.push("01026");
  const before = s.heroes[0].resources;
  s = vilya(s, "01059");
  s = choose(s, "play");
  assert.ok(s.allies.some((u) => u.code === "01059"));
  assert.ok(s.hand.some((u) => u.code === "01026"));
  assert.equal(s.heroes[0].resources, before);
  assert.equal(s.alliesPlayed, 1);
  assert.equal(s.heroes[0].exhausted, true);
});
test("Vilya free PLAY does not trigger Rivendell Minstrel's played-from-hand search", () => {
  let s = game();
  s = vilya(s, "02008");
  s = choose(s, "play");
  assert.ok(s.allies.some((u) => u.code === "02008"));
  assert.equal(s.choice, null);
});
test("Vilya deck PLAY triggers Renewed Friendship while put-into-play does not", () => {
  let s = table();
  seatView(s, 1).hand.push(unit("04007", 1));
  s = vilya(s, "02051");
  s = choose(s, "play");
  s = choose(s, seatView(s, 1).heroes[0].id);
  assert.match(s.choice?.title ?? "", /Renewed Friendship/);
  assert.equal(s.table!.active, 1);
  let put = table();
  seatView(put, 1).hand.push(unit("04007", 1));
  put = vilya(put, "02051");
  put = choose(put, "put");
  put = choose(put, seatView(put, 1).heroes[0].id);
  assert.equal(put.choice, null);
});
test("A Dwarf played from Vilya's deck does not trigger Legacy of Durin's from-hand response", () => {
  let s = game();
  s.heroes[1].code = "03002";
  s.heroes[1].attachments.push({
    id: "legacy",
    code: "04061",
    exhausted: false,
  });
  s = vilya(s, "03011");
  s = choose(s, "play");
  assert.ok(s.allies.some((u) => u.code === "03011"));
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 0);
  assert.equal(s.heroes[1].attachments[0].exhausted, false);
});
test("Vilya put-into-play bypasses Dol Guldur's ally PLAY cap without counting as PLAY", () => {
  let s = game();
  s.scenarioId = "dol-guldur";
  s.stage = 1;
  s.alliesPlayed = 1;
  s = vilya(s, "01059");
  assert.ok(!s.choice?.options.some((o) => o.id === "play"));
  s = choose(s, "put");
  assert.equal(s.alliesPlayed, 1);
  assert.ok(s.allies.some((u) => u.code === "01059"));
  assert.equal(s.choice, null);
});
test("Vilya's free PLAY keeps printed phase and Response restrictions", () => {
  let s = game();
  s = vilya(s, "01034");
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["bottom"],
  );
  s = choose(s, "bottom");
  assert.equal(s.deck.at(-1), "01034");
  const response = effectCardPlayProblem(s, unit("01048"), {
    putIntoPlay: false,
  });
  assert.match(response ?? "", /response/i);
});
test("Vilya treats printed X as zero rather than deriving it from a chosen positive-cost target", () => {
  let s = game();
  s.discard.push("01013");
  s = vilya(s, "01051");
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["bottom"],
  );
  s = choose(s, "bottom");
  assert.ok(s.discard.includes("01013"));
  assert.match(
    effectCardPlayProblem(s, unit("01067"), { putIntoPlay: false }) ?? "",
    /X is zero/,
  );
});
test("Vilya cannot duplicate a unique ally and may leave an otherwise legal card unplayed", () => {
  let s = game();
  s.allies.push(unit("01073"));
  s = vilya(s, "01073");
  assert.deepEqual(
    s.choice?.options.map((o) => o.id),
    ["bottom"],
  );
  s = choose(s, "bottom");
  assert.equal(s.allies.length, 1);
  s.heroes[0].exhausted = false;
  s.heroes[0].attachments[0].exhausted = false;
  s.deck.unshift("01013");
  s = act(s, { type: "ABILITY", id: s.heroes[0].id, attachmentId: "vilya" });
  s = choose(s, "bottom");
  assert.equal(s.deck.at(-1), "01013");
});
test("Vilya resolves exact attachment target restrictions and saves a pending target choice", () => {
  let s = game();
  s = vilya(s, "04107");
  s = choose(s, "put");
  assert.equal(s.choice?.title, "Vilya · Card target");
  assert.ok(validateSave(JSON.parse(JSON.stringify(s))));
  const hero = s.heroes[0];
  s = choose(s, hero.id);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === "04107"));
  assert.equal(s.hand.length, 0);
});
test("Hardy Leadership gives all Dwarves the same static health bonus across players", () => {
  const s = table();
  seatView(s, 2).allies.push(unit("03011", 2));
  s.heroes[0].attachments.push({
    id: "hardy",
    code: "04130",
    exhausted: false,
  });
  const dwarf = allCharacters(s).find((u) => u.code === "03011")!;
  assert.equal(stats(s, dwarf).health, card("03011").health! + 1);
});

test("Elrond's spending permission still needs a real resource match when Citadel Custodian is reduced to zero", () => {
  const s = game();
  s.heroes[0].code = "04128";
  s.allies.push(
    unit("05018"),
    unit("05018"),
    unit("05018"),
    unit("06108"),
    unit("01029"),
  );
  assert.equal(playCost(s, card("05004")), 0);
  assert.equal(hasResourceIcon(s.heroes[0], "leadership"), false);
  assert.equal(canPay(s, card("05004")), false);
  s.heroes[0].attachments.push({
    id: "match-song",
    code: "02010",
    exhausted: false,
  });
  assert.equal(canPay(s, card("05004")), true);
});
