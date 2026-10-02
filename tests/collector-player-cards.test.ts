import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED } from "../src/game/cards.ts";
import { COLLECTOR_PLAYER_CARDS } from "../src/game/collector-player-support.ts";
import { officialStarterDecks } from "../src/game/products.ts";
import { deckProblems } from "../src/game/decks.ts";
import {
  createGame,
  canPlay,
  availableAbilities,
  locationQuest,
  playTargets,
  stats,
  validateSave,
} from "../src/game/engine.ts";
import {
  make,
  get,
  prepend,
  canFight,
  engagementCost,
  putPlayerDeck,
  takePlayerDeck,
} from "../src/game/core.ts";
import {
  enterAlly,
  discardCharacter,
  phaseEndPlayer,
  revealed,
  advanceQuest,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import {
  selectSeat,
  seatView,
  syncSeat,
  attackersFor,
  defendersFor,
} from "../src/game/table.ts";
import {
  collectorAttackKilled,
  collectorDefendersDeclared,
  collectorEnemyAttackFinished,
  collectorEncounterRevealed,
  collectorLocationExplored,
  collectorRoundEndEffects,
  collectorEnemyCannotAttack,
} from "../src/game/collector-player-cards.ts";
import { currentQuestUnit } from "../src/game/quest-state.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { SHADOW_FLAME as S } from "../src/game/shadow-flame-support.ts";
import type { GameState, Unit } from "../src/game/types.ts";
const leadership = officialStarterDecks.find(
  (d) => d.id === "limited-leadership-spirit",
)!;
const lore = officialStarterDecks.find((d) => d.id === "limited-lore-tactics")!;
function game(loreDeck = false) {
  const d = loreDeck ? lore : leadership;
  let s = act(createGame(853, d.cards, d.heroes, "custom"), { type: "KEEP" });
  s.staging = [];
  s.queue = [];
  s.choice = null;
  s.hand = [];
  s.deck = Array(30).fill("01018");
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  let s = createGame(854, leadership.cards, leadership.heroes, "custom", {
    seats: [
      { heroes: leadership.heroes, deckId: "custom", cards: leadership.cards },
      { heroes: lore.heroes, deckId: "custom", cards: lore.cards },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (const i of [0, 1]) {
    selectSeat(s, i);
    s.hand = [];
    s.deck = Array(30).fill("01018");
    s.heroes.forEach((h) => (h.resources = 10));
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  s.queue = [];
  s.choice = null;
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
  const u = make(s, code);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function attach(s: GameState, u: Unit, code: string, owner = 0) {
  const id = `ca-${s.nextId++}`;
  u.attachments.push({ id, code, owner, exhausted: false });
  return id;
}
function stored(s: GameState) {
  assert.ok(validateSave(s));
  const copy = JSON.parse(JSON.stringify(s)) as GameState;
  assert.ok(validateSave(copy));
  return copy;
}

test("Collector's Edition exact two retail decks and23 added designs are supported", () => {
  assert.equal(COLLECTOR_PLAYER_CARDS.length, 23);
  for (const c of COLLECTOR_PLAYER_CARDS)
    assert.ok(SCRIPTED.has(c.code), c.name);
  for (const d of [leadership, lore]) {
    assert.deepEqual(deckProblems(d), []);
    assert.equal(
      Object.values(d.cards).reduce((n, v) => n + v, 0),
      50,
    );
  }
});
test("Gildor pays only his own resource, draws for chosen other player, and enforces once per round", () => {
  let s = table();
  const gildor = s.heroes.find((h) => h.code === "22081")!;
  const before = gildor.resources;
  s = act(s, { type: "ABILITY", id: gildor.id });
  s = stored(s);
  s = choose(s, "player-1");
  assert.equal(get(s, gildor.id)!.resources, before - 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  selectSeat(s, 0);
  assert.ok(
    availableAbilities(s, get(s, gildor.id)!).find((a) =>
      /Gildor/.test(a.label),
    )!.disabled,
  );
});
test("Nori responds to actual Dwarf PLAY from hand and not put into play", () => {
  let s = game();
  const before = s.threat;
  s = play(s, "12083");
  assert.match(s.choice!.title, /Nori/);
  s = choose(s, "use");
  assert.equal(s.threat, before - 1);
  const u = make(s, "12083");
  enterAlly(s, u, false, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(s.threat, before - 1);
});
test("Fili searches exact Kili, then shuffles, while partner is PUT and Nori responds once", () => {
  let s = game();
  s.deck = ["131007", "01018", "01018"];
  s = play(s, "131006");
  s = choose(s, "use");
  assert.match(s.choice!.title, /Fili/);
  s = stored(s);
  s = choose(s, "use");
  assert.deepEqual(s.allies.map((u) => u.code).sort(), ["131006", "131007"]);
  assert.equal(s.deck.length, 2);
  assert.equal(s.choice, null);
});
test("Kili searches Fili but a put-into-play Kili never chains his PLAY response", () => {
  let s = game();
  s.deck = ["131006", "01018"];
  s = play(s, "131007");
  s = choose(s, "skip");
  s = choose(s, "use");
  assert.ok(s.allies.some((u) => u.code === "131006"));
  s = game();
  s.deck = ["131006"];
  enterAlly(s, make(s, "131007"), false, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.deepEqual(s.deck, ["131006"]);
});
test("Woodland Courier chooses a Forest location for2 progress and respects Carrock immunity", () => {
  let s = game();
  const forest = make(s, "01100"),
    carrock = make(s, CARROCK.carrock);
  s.staging = [forest, carrock];
  s = play(s, "12087");
  s = choose(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.id === carrock.id));
  s = choose(s, forest.id);
  assert.equal(get(s, forest.id)!.progress, 2);
});
test("Andrath Guardsman prevents a chosen nonunique enemy from attacking only his controller this round", () => {
  let s = table();
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  syncSeat(s);
  s = play(s, "17002");
  s = choose(s, "use");
  s = choose(s, enemy.id);
  assert.ok(collectorEnemyCannotAttack(s, enemy, 0));
  assert.equal(collectorEnemyCannotAttack(s, enemy, 1), false);
});
test("Guardsman put into play has no PLAY-from-hand cancellation response", () => {
  let s = game();
  s.engaged = [make(s, "01082")];
  enterAlly(s, make(s, "17002"), false, false, false);
  flush(s);
  assert.equal(s.choice, null);
});
test("Galadriel searches physical top5, puts eligible attachment without payment, and reorders remaining tail", () => {
  let s = game();
  const top = ["01026", "01018", "01043", "01016", "01017"],
    tail = ["01015", "01014"];
  s.deck = [...top, ...tail];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "142003");
  s = choose(s, "use");
  s = choose(s, "attachment-0");
  s = choose(s, s.heroes[0].id);
  assert.ok(
    get(s, s.heroes[0].id)!.attachments.some((a) => a.code === "01026"),
  );
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 3,
  );
  s = stored(s);
  for (const id of ["card-3", "card-2", "card-1", "card-0"]) s = choose(s, id);
  assert.deepEqual(s.deck, ["01017", "01016", "01043", "01018", ...tail]);
  assert.ok(s.discard.length === 0);
});
test("Galadriel put into play does not search top5", () => {
  let s = game();
  s.deck = ["01026", "01018"];
  enterAlly(s, make(s, "142003"), false, false, false);
  flush(s);
  assert.equal(s.choice, null);
  assert.deepEqual(s.deck, ["01026", "01018"]);
});
test("Gimli ready response follows a revealed enemy and is optional", () => {
  let s = game();
  const gimli = make(s, "143004");
  gimli.exhausted = true;
  s.allies = [gimli];
  collectorEncounterRevealed(s, "01082");
  flush(s);
  s = choose(s, "use");
  assert.equal(get(s, gimli.id)!.exhausted, false);
});
test("Blue Mountain Trader changes controller while preserving owner and transfers a resource only once per round", () => {
  let s = table();
  const trader = make(s, "08006");
  trader.owner = 0;
  s.allies = [trader];
  syncSeat(s);
  const old = s.heroes[0],
    donor = seatView(s, 1).heroes[0],
    before = old.resources;
  s = act(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  s = stored(s);
  s = choose(s, `${donor.id}-${old.id}`);
  assert.equal(seatView(s, 0).allies.length, 0);
  assert.equal(seatView(s, 1).allies[0].owner, 0);
  assert.equal(seatView(s, 0).heroes[0].resources, before + 1);
  selectSeat(s, 1);
  assert.ok(
    availableAbilities(s, get(s, trader.id)!).find((a) =>
      /Trader/.test(a.label),
    )!.disabled,
  );
  discardCharacter(s, get(s, trader.id)!);
  flush(s);
  assert.ok(seatView(s, 0).discard.includes("08006"));
  assert.ok(!seatView(s, 1).discard.includes("08006"));
});
test("Trader can be discarded instead of moving a resource", () => {
  let s = table();
  const trader = make(s, "08006");
  trader.owner = 0;
  s.allies = [trader];
  syncSeat(s);
  s = act(s, { type: "ABILITY", id: trader.id });
  s = choose(s, "player-1");
  s = choose(s, "discard");
  assert.equal(get(s, trader.id), undefined);
  assert.ok(seatView(s, 0).discard.includes("08006"));
});
test("Thorin's declared-attack response discards actual deck top before1 damage", () => {
  let s = game(true);
  const thorin = s.heroes.find((h) => h.code === "22001")!,
    enemy = make(s, "01082");
  s.engaged = [enemy];
  s.deck = ["01018", "01016"];
  s.phase = "attack";
  s = act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [thorin.id] });
  assert.match(s.choice!.title, /Thorin/);
  s = choose(s, "use");
  s = choose(s, enemy.id);
  assert.equal(s.discard[0], "01018");
  assert.equal(s.deck[0], "01016");
  assert.ok(get(s, enemy.id)!.damage >= 1);
});
test("Azain offers one response with any player's Tactics payer and2 damage to a shared-trait enemy", () => {
  let s = table();
  const azain = make(s, "12004"),
    enemy = make(s, "01089"),
    victim = make(s, "01081");
  s.allies = [azain];
  s.staging = [enemy];
  syncSeat(s);
  collectorAttackKilled(s, victim, [azain.id]);
  assert.equal(
    s.queue.filter((e) => e.kind === "collectorAzainResponse").length,
    1,
  );
  flush(s);
  s = choose(s, "use");
  const payer = seatView(s, 1).heroes.find((h) => h.code === "22001")!,
    before = payer.resources;
  s = choose(s, payer.id);
  s = choose(s, enemy.id);
  assert.equal(get(s, enemy.id)!.damage, 2);
  assert.equal(
    seatView(s, 1).heroes.find((h) => h.id === payer.id)!.resources,
    before - 1,
  );
  assert.equal(s.choice, null);
});
test("Azain uses victim last-known granted traits and cannot target unrelated enemies", () => {
  let s = game(true);
  const azain = make(s, "12004"),
    orc = make(s, "01089"),
    spider = make(s, "01074");
  s.allies = [azain];
  s.staging = [orc, spider];
  collectorAttackKilled(s, make(s, "01074"), [azain.id], ["Orc"]);
  flush(s);
  s = choose(s, "use");
  s = choose(s, s.heroes.find((h) => h.code === "22001")!.id);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [orc.id],
  );
});
test("Ioreth permits another player's Lore payment, heals any character and cannot attack or defend", () => {
  let s = table();
  const ioreth = make(s, "12117");
  ioreth.owner = 0;
  s.allies = [ioreth];
  s.heroes[0].damage = 3;
  syncSeat(s);
  selectSeat(s, 1);
  const loreHero = s.heroes[0],
    before = loreHero.resources;
  assert.equal(canFight(ioreth), false);
  const enemy = make(s, "01082");
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === ioreth.id));
  assert.ok(!defendersFor(s, enemy).some((u) => u.id === ioreth.id));
  s = act(s, { type: "ABILITY", id: ioreth.id });
  s = choose(s, loreHero.id);
  s = choose(s, seatView(s, 0).heroes[0].id);
  assert.equal(seatView(s, 0).heroes[0].damage, 0);
  assert.equal(get(s, ioreth.id)!.exhausted, true);
  assert.equal(get(s, loreHero.id)!.resources, before - 1);
});
test("Elf-stone adds1 quest point and first player puts ally from hand rather than playing it", () => {
  let s = table();
  const loc = make(s, "01094"),
    guardsman = make(s, "17002");
  s.activeLocation = loc;
  s.hand = [guardsman];
  s.engaged = [make(s, "01082")];
  attach(s, loc, "141016", 1);
  assert.equal(locationQuest(s, loc), (card(loc.code).quest ?? 0) + 1);
  syncSeat(s);
  collectorLocationExplored(s, loc, [...loc.attachments]);
  flush(s);
  s = choose(s, "use");
  s = choose(s, guardsman.id);
  assert.ok(seatView(s, 0).allies.some((u) => u.id === guardsman.id));
  assert.equal(s.choice, null);
  assert.ok(!s.used.some((k) => k.startsWith("round:andrath:")));
});
test("Legolas ally killing-attack response draws once and is optional", () => {
  let s = game(true);
  const legolas = make(s, "143005");
  s.allies = [legolas];
  collectorAttackKilled(s, make(s, "01081"), [legolas.id]);
  flush(s);
  s = choose(s, "use");
  assert.equal(s.hand.length, 1);
});
test("Mablung's5 engagement bonus survives phase end and can return an enemy from another seat", () => {
  let s = table();
  selectSeat(s, 1);
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  syncSeat(s);
  selectSeat(s, 0);
  const initial = engagementCost(s, enemy);
  attach(s, s.heroes[0], "02034");
  s = play(s, "144005");
  s = choose(s, "use");
  s = choose(s, enemy.id);
  s = choose(s, "staging");
  phaseEndPlayer(s);
  assert.equal(engagementCost(s, get(s, enemy.id)!), initial + 5);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  assert.equal(seatView(s, 1).engaged.length, 0);
});
test("Sarn Ford Sentry draws one card per enemy engaged with its controller", () => {
  let s = game(true);
  s.engaged = [make(s, "01082"), make(s, "01081")];
  s = play(s, "09005");
  s = choose(s, "use");
  assert.equal(s.hand.length, 2);
});
test("Galadhon Archer can damage other player's enemy but not own engaged enemy", () => {
  let s = table();
  const own = make(s, "01082"),
    other = make(s, "01081");
  s.engaged = [own];
  syncSeat(s);
  selectSeat(s, 1);
  s.engaged = [other];
  syncSeat(s);
  selectSeat(s, 0);
  s.heroes[0].attachments.push({
    id: "song-battle",
    code: "02104",
    exhausted: false,
  });
  s = play(s, "08087");
  s = choose(s, "use");
  assert.ok(!s.choice!.options.some((o) => o.id === own.id));
  s = choose(s, other.id);
  assert.equal(get(s, other.id)!.damage, 1);
});
test("Pursuing the Enemy returns own Silvan ally as cost and damages every enemy of chosen player", () => {
  let s = table();
  const silvan = make(s, "01060");
  s.allies = [silvan];
  syncSeat(s);
  selectSeat(s, 1);
  const first = make(s, "01082"),
    second = make(s, "01081");
  s.engaged = [first, second];
  syncSeat(s);
  selectSeat(s, 0);
  s.heroes[0].attachments.push({
    id: "song-battle",
    code: "02104",
    exhausted: false,
  });
  s = play(s, "08060", silvan.id);
  assert.ok(!get(s, silvan.id));
  assert.ok(s.hand.some((u) => u.code === silvan.code));
  s = choose(s, "player-1");
  assert.equal(get(s, first.id)!.damage, 1);
  assert.equal(get(s, second.id)!.damage, 1);
});
test("Desperate Defense modifies only declared Sentinel for this attack, persists save, and readies only on zero attack damage", () => {
  let s = game();
  const defender = make(s, "143004"),
    enemy = make(s, "01082");
  defender.exhausted = true;
  s.allies = [defender];
  s.engaged = [enemy];
  s.hand = [make(s, "145009")];
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackBonus: 0,
    damageDealt: 0,
  };
  const initial = stats(s, defender).defense;
  collectorDefendersDeclared(s, [defender.id]);
  flush(s);
  s = choose(s, defender.id);
  assert.equal(stats(s, get(s, defender.id)!).defense, initial + 2);
  s = stored(s);
  collectorEnemyAttackFinished(s, s.combat!.desperateDefenderIds!, true);
  assert.equal(get(s, defender.id)!.exhausted, false);
  s.combat = null;
  assert.equal(stats(s, get(s, defender.id)!).defense, initial);
  defender.exhausted = true;
  collectorEnemyAttackFinished(s, [defender.id], false);
  assert.equal(defender.exhausted, true);
});
test("Desperate Defense cannot be played during an unrelated action window", () => {
  let s = game();
  assert.match(canPlay(s, make(s, "145009"))!, /respond|defender/i);
});
test("Sellsword group payment uses old round resources, while Galadriel and Elrond discard at round end", () => {
  let s = table();
  const sellsword = make(s, "12083"),
    galadriel = make(s, "142003"),
    elrond = make(s, "142005");
  s.allies = [sellsword, galadriel, elrond];
  syncSeat(s);
  const payer = s.heroes[0],
    before = payer.resources;
  prepend(s, ...collectorRoundEndEffects(s));
  flush(s);
  s = choose(s, payer.id);
  assert.equal(get(s, payer.id)!.resources, before - 1);
  assert.ok(get(s, sellsword.id));
  assert.equal(get(s, galadriel.id), undefined);
  assert.equal(get(s, elrond.id), undefined);
});
test("Long Defeat attaches to physical current quest and resolves optional draw before stage advances", () => {
  let s = game(true);
  const quest = currentQuestUnit(s)!;
  assert.ok(quest);
  s = play(s, "10122", quest.id);
  assert.equal(currentQuestUnit(s)!.attachments.length, 1);
  assert.deepEqual(playTargets(s, make(s, "10122")), []);
  s.progress = 8;
  advanceQuest(s);
  flush(s);
  assert.match(s.choice!.title, /Long Defeat/);
  assert.equal(s.stage, 1);
  s = stored(s);
  s = choose(s, "use");
  s = choose(s, "draw");
  assert.equal(s.hand.length, 2);
  assert.equal(s.stage, 2);
  assert.ok(s.discard.includes("10122"));
  assert.equal(s.questAttachments?.[quest.code], undefined);
});
test("Long Defeat allocates no more than5 across owned characters and preserves pending choice save", () => {
  let s = game(true);
  const quest = currentQuestUnit(s)!;
  s = play(s, "10122", quest.id);
  const one = s.heroes[0],
    two = s.heroes[2];
  one.damage = 2;
  two.damage = 3;
  s.progress = 8;
  advanceQuest(s);
  flush(s);
  s = choose(s, "use");
  s = choose(s, "heal");
  s = choose(s, one.id);
  s = choose(s, "heal-2");
  s = stored(s);
  s = choose(s, two.id);
  s = choose(s, "heal-3");
  assert.equal(s.choice!.options.length, 1);
  s = choose(s, "done");
  assert.equal(get(s, one.id)!.damage, 0);
  assert.equal(get(s, two.id)!.damage, 0);
  assert.equal(s.stage, 2);
});
test("Elrond's Condition response can discard Iron Shackles from the deck", () => {
  let s = game(true);
  s.shackles = 1;
  s = play(s, "142005");
  s = choose(s, "use");
  s = choose(s, "condition");
  s = choose(s, "shackles");
  assert.equal(s.shackles, 0);
  assert.ok(s.encounterDiscard.includes("01105"));
});

test("Lookout actual enemy reveal discards source and cancels only When Revealed, while enemy enters staging", () => {
  let s = game(true);
  const lookout = make(s, "17062"),
    hero = s.heroes[0];
  s.allies = [lookout];
  hero.committed = true;
  hero.exhausted = true;
  revealed(s, "01089");
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `lookout-${lookout.id}`));
  s = stored(s);
  s = choose(s, `lookout-${lookout.id}`);
  assert.equal(get(s, lookout.id), undefined);
  assert.ok(s.discard.includes("17062"));
  assert.equal(get(s, hero.id)!.damage, 0);
  assert.ok(s.staging.some((u) => u.code === "01089"));
});
test("The Eaves of Mirkwood prevents Lookout cancellation and retains source in play", () => {
  let s = game(true);
  const lookout = make(s, "17062"),
    hero = s.heroes[0];
  s.allies = [lookout];
  s.activeLocation = make(s, "02016");
  hero.committed = true;
  hero.exhausted = true;
  revealed(s, "01089");
  flush(s);
  assert.ok(!s.choice!.options.some((o) => o.id === `lookout-${lookout.id}`));
  s = choose(s, hero.id);
  assert.equal(get(s, hero.id)!.damage, 2);
  assert.ok(get(s, lookout.id));
});
test("Actual Desperate Defense attack damage redirected to Dori does not ready original defender", () => {
  let s = game();
  const defender = s.heroes[0],
    dori = make(s, "131009"),
    enemy = make(s, "01082");
  defender.roundKeywords = ["Sentinel"];
  s.allies = [dori];
  s.engaged = [enemy];
  s.hand = [make(s, "145009")];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderIds: [defender.id] });
  assert.match(s.choice!.title, /Desperate Defense/);
  s = choose(s, defender.id);
  assert.match(s.choice!.title, /Dori/);
  s = stored(s);
  s = choose(s, dori.id);
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, dori.id)!.damage, 2);
  assert.equal(get(s, defender.id)!.exhausted, true);
});
test("Actual Desperate Defense readies defender when Frodo cancels all attack damage", () => {
  let s = game();
  const defender = s.heroes[2],
    enemy = make(s, "01082");
  defender.code = "02025";
  defender.roundKeywords = ["Sentinel"];
  s.engaged = [enemy];
  s.hand = [make(s, "145009")];
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: enemy.id, defenderIds: [defender.id] });
  s = choose(s, defender.id);
  assert.match(s.choice!.title, /Frodo/);
  s = choose(s, "cancel-damage");
  assert.equal(get(s, defender.id)!.damage, 0);
  assert.equal(get(s, defender.id)!.exhausted, false);
});

test("Galadriel's top5 permutation preserves a used Heavy Stroke among identical printed copies", () => {
  let s = game();
  s.deck = [];
  const used = make(s, "04105"),
    fresh = make(s, "04105");
  s.used.push(`phase:heavy-stroke:${used.id}`);
  putPlayerDeck(s, used);
  putPlayerDeck(s, fresh);
  s.deck.push("01018", "01016", "01017");
  s = play(s, "142003");
  s = choose(s, "use");
  s = choose(s, "skip");
  for (const id of ["card-4", "card-3", "card-2", "card-1", "card-0"])
    s = choose(s, id);
  s = stored(s);
  assert.equal(takePlayerDeck(s, 4).id, used.id);
  assert.notEqual(takePlayerDeck(s, 3).id, used.id);
});
test("Galadriel's attachment move and residual reorder retain hidden Heavy Stroke phase identity", () => {
  let s = game();
  s.deck = ["01026"];
  const used = make(s, "04105");
  s.used.push(`phase:heavy-stroke:${used.id}`);
  putPlayerDeck(s, used);
  s.deck.push("04105", "01018", "01016");
  s = play(s, "142003");
  s = choose(s, "use");
  s = choose(s, "attachment-0");
  s = choose(s, s.heroes[0].id);
  for (const id of ["card-3", "card-2", "card-1", "card-0"]) s = choose(s, id);
  s = stored(s);
  assert.equal(takePlayerDeck(s, 3).id, used.id);
});

test("Ioreth's printed ban rejects her controller's public ATTACK and DEFEND actions", () => {
  const s = game(true),
    ioreth = make(s, "12117"),
    enemy = make(s, "01082");
  s.allies = [ioreth];
  s.engaged = [enemy];
  s.phase = "attack";
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === ioreth.id));
  assert.throws(
    () =>
      act(s, { type: "ATTACK", enemyId: enemy.id, attackerIds: [ioreth.id] }),
    /attacker|ready|eligible/i,
  );
  s.phase = "defense";
  assert.ok(!defendersFor(s, enemy).some((u) => u.id === ioreth.id));
  assert.throws(
    () =>
      act(s, { type: "DEFEND", enemyId: enemy.id, defenderIds: [ioreth.id] }),
    /defender|ready|eligible/i,
  );
});
test("Ioreth's printed combat ban disappears when blanked and existing readiness/ownership rules still apply", () => {
  const s = game(true),
    ioreth = make(s, "12117"),
    enemy = make(s, "01082");
  s.allies = [ioreth];
  s.engaged = [enemy];
  ioreth.blanked = true;
  assert.equal(canFight(ioreth), true);
  assert.ok(attackersFor(s, enemy).some((u) => u.id === ioreth.id));
  assert.ok(defendersFor(s, enemy).some((u) => u.id === ioreth.id));
  ioreth.exhausted = true;
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === ioreth.id));
  assert.ok(!defendersFor(s, enemy).some((u) => u.id === ioreth.id));
});

test("Counter-Spell cancels Desperate Defense after its cost without granting defense or readying", () => {
  let s = game();
  const defender = make(s, "143004"),
    enemy = make(s, "01082"),
    balrog = make(s, S.bane);
  balrog.attachments.push({
    id: "counter-desperate",
    code: S.counter,
    exhausted: false,
  });
  defender.exhausted = true;
  s.allies = [defender];
  s.engaged = [enemy];
  s.staging = [balrog];
  s.hand = [make(s, "145009")];
  s.encounterDeck = [S.fires];
  s.phase = "defense";
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender.id,
    defenderIds: [defender.id],
    attackPlayer: 0,
    attackBonus: 0,
    damageDealt: 0,
  };
  const before = stats(s, defender).defense,
    funds = s.heroes.reduce((n, h) => n + h.resources, 0);
  collectorDefendersDeclared(s, [defender.id]);
  flush(s);
  s = choose(s, defender.id);
  assert.equal(stats(s, get(s, defender.id)!).defense, before);
  assert.equal(s.combat!.desperateDefenderIds, undefined);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    funds - 1,
  );
  assert.ok(s.discard.includes("145009"));
  assert.ok(s.encounterDiscard.includes(S.fires));
  collectorEnemyAttackFinished(s, s.combat!.desperateDefenderIds ?? [], true);
  assert.equal(get(s, defender.id)!.exhausted, true);
});
