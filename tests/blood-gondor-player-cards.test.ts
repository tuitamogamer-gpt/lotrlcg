import test from "node:test";
import assert from "node:assert/strict";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playCost,
  playTargets,
  stats,
  stagingThreat,
  validateSave,
} from "../src/game/engine.ts";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { BLOOD_PLAYER_CARDS } from "../src/game/blood-gondor-player-support.ts";
import {
  bloodPlayerAbilityProblem,
  bloodPlayerHandAbilityProblem,
  bloodPlayerRoundEndEffects,
} from "../src/game/blood-gondor-player-cards.ts";
import {
  discardCharacter,
  enemyAddedToStaging,
  phaseEnd,
  returnAlly,
} from "../src/game/board.ts";
import { fx, get } from "../src/game/core.ts";
import { flush } from "../src/game/effects.ts";
import {
  hasKeyword,
  forOwner,
  seatView,
  selectSeat,
  syncSeat,
} from "../src/game/table.ts";
import { effectCardPlayProblem } from "../src/game/actions.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { SHADOW_FLAME } from "../src/game/shadow-flame.ts";
import type { GameState, Unit } from "../src/game/types.ts";

let serial = 2_500_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `blood-player-${serial++}`,
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
function game(sphere = "spirit", players = 1): GameState {
  const d = STARTERS.find((d) => d.id === sphere)!;
  let s = createGame(
    971,
    d.cards,
    d.heroes,
    d.id,
    players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {},
  );
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  Object.assign(s, {
    phase: "planning",
    choice: null,
    queue: [],
    staging: [],
    engaged: [],
    activeLocation: null,
    extraActiveLocations: [],
    combat: null,
    encounterDeck: Array(30).fill("01099"),
    encounterDiscard: [],
  });
  for (let player = 0; player < players; player++)
    forOwner(s, player, () => {
      s.hand = [];
      s.allies = [];
      s.used = [];
      s.threat = 20;
      s.deck = ["01043", "01044", "01045", "01043", "01044", "01045"];
      s.discard = [];
      s.heroes.forEach((h) =>
        Object.assign(h, {
          resources: 10,
          damage: 0,
          exhausted: false,
          committed: false,
          attachments: [],
        }),
      );
    });
  selectSeat(s, 0);
  return s;
}
function choose(s: GameState, id: string): GameState {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string): GameState {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function reload(s: GameState): GameState {
  const parsed = JSON.parse(JSON.stringify(s));
  assert.ok(
    validateSave(parsed),
    "Blood of Gondor choices must validate after JSON save/reload",
  );
  return parsed;
}
function caldara(s: GameState, others = ["01007", "01008"]) {
  s.heroes = [unit("06107"), ...others.map((code) => unit(code))];
  s.heroes.forEach((h) => (h.resources = 10));
  syncSeat(s);
  return s.heroes[0];
}
function tome(s: GameState) {
  const hero = s.heroes[0],
    id = `blood-tome-${serial++}`;
  hero.attachments.push({ id, code: "06109", exhausted: false, owner: 0 });
  return { hero, id };
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => ["skip", "resolve"].includes(o.id))?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}

test("Blood of Gondor registers all ten exact designs, including existing Squire and Guthlaf scripts", () => {
  assert.equal(BLOOD_PLAYER_CARDS.length, 10);
  for (const c of BLOOD_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});

test("Caldara chooses two actual Spirit allies, discards as a cost, and does not PLAY either ally", () => {
  let s = game(),
    h = caldara(s);
  s.discard = ["01043", "01044", "01058"];
  s.heroes[1].attachments.push({ id: "horn", code: "01042", exhausted: false });
  const resources = s.heroes[1].resources;
  s = act(s, { type: "ABILITY", id: h.id });
  assert.equal(s.choice?.title, "Caldara · Choose Spirit allies");
  assert.ok(
    get(s, h.id),
    "Caldara stays in play while the full target choice is prepared",
  );
  s = choose(reload(s), "ally-0");
  s = choose(reload(s), "ally-1");
  assert.ok(!get(s, h.id));
  assert.deepEqual(
    s.allies.map((u) => u.code),
    ["01043", "01044"],
  );
  assert.equal(s.alliesPlayed, 0);
  assert.ok(s.discard.includes("06107"));
  assert.equal(
    s.heroes[0].resources,
    resources,
    "Discard cost does not trigger Horn of Gondor's destruction response",
  );
});
test("Caldara ignores gained Spirit icons and resolves the maximum available ally count", () => {
  let s = game(),
    h = caldara(s, ["01007", "01010"]);
  s.heroes[2].attachments.push({
    id: "spirit-song",
    code: "02081",
    exhausted: false,
  });
  s.discard = ["01043", "01044"];
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, "ally-1");
  assert.deepEqual(
    s.allies.map((u) => u.code),
    ["01044"],
  );
  assert.ok(s.discard.includes("01043"));
  s = game();
  h = caldara(s);
  s.discard = ["01043"];
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, "ally-0");
  assert.equal(s.allies.length, 1);
});
test("Caldara respects uniqueness when selecting a batch and counts only her controller's heroes", () => {
  let s = game("spirit", 2),
    h = caldara(s, ["01007", "01010"]);
  forOwner(s, 1, () => {
    s.heroes = [unit("01008", 1), unit("01009", 1), unit("06107", 1)];
  });
  s.discard = ["06112", "06112", "01043"];
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, "ally-0");
  assert.equal(s.allies.length, 1);
  assert.equal(s.allies[0].code, "06112");
  assert.equal(seatView(s, 1).allies.length, 0);
  s = game();
  h = caldara(s);
  s.discard = ["06112", "06112", "01043"];
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, "ally-0");
  assert.ok(!s.choice?.options.some((o) => o.id === "ally-1"));
  s = choose(s, "ally-2");
  assert.deepEqual(
    s.allies.map((u) => u.code),
    ["06112", "01043"],
  );
});
test("Caldara's once-per-game errata survives Fortune or Fate revival and round/phase cleanup", () => {
  let s = game(),
    h = caldara(s);
  s.discard = ["01043", "01044"];
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, "ally-0");
  s = choose(s, "ally-1");
  const target = playTargets(s, unit("01054")).find((u) => u.code === "06107")!;
  s = play(s, "01054", target.id);
  phaseEnd(s);
  flush(s);
  s.discard.push("01045");
  const revived = s.heroes.find((u) => u.code === "06107")!;
  assert.ok(revived);
  assert.match(bloodPlayerAbilityProblem(s, revived) ?? "", /once per game/);
  assert.ok(
    availableAbilities(s, revived).find((a) => a.label.includes("Caldara"))
      ?.disabled,
  );
  assert.throws(
    () => act(s, { type: "ABILITY", id: revived.id }),
    /once per game/,
  );
});
test("Caldara cannot pay a discard cost to do nothing or use blank/Sacked printed abilities", () => {
  const s = game(),
    h = caldara(s, ["01010", "01011"]);
  s.discard = ["01043"];
  assert.match(bloodPlayerAbilityProblem(s, h) ?? "", /printed Spirit/);
  assert.throws(() => act(s, { type: "ABILITY", id: h.id }), /printed Spirit/);
  h.blanked = true;
  assert.match(bloodPlayerAbilityProblem(s, h) ?? "", /printed ability/);
});

test("Tome reduces its cost per controlled printed Leadership hero, and gained icons give legal hosts", () => {
  let s = game("leadership");
  assert.equal(playCost(s, card("06109")), 1);
  const host = s.heroes[1];
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = play(s, "06109", host.id);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 1,
  );
  s = game("spirit");
  s.heroes[0].phaseResourceIcons = ["leadership"];
  assert.ok(playTargets(s, unit("06109")).some((u) => u.id === s.heroes[0].id));
  assert.equal(
    playCost(s, card("06109")),
    4,
    "Granted icon does not reduce the cost",
  );
});
test("Tome pays and plays the selected duplicate event, then puts that actual event on the deck bottom", () => {
  let s = game("leadership"),
    b = tome(s);
  s.discard = ["01025", "01025"];
  s.deck = ["01043"];
  s.heroes[1].exhausted = true;
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(reload(s), "discard-1");
  s = choose(reload(s), "pay-0");
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 5,
  );
  assert.equal(s.heroes[1].exhausted, false);
  assert.equal(s.discard.filter((code) => code === "01025").length, 1);
  assert.ok(s.discard.includes("06109"));
  assert.deepEqual(s.deck, ["01043", "01025"]);
});
test("Tome rejects wrong spheres, response timing, unaffordable events and blank attachment text without cost", () => {
  const s = game("leadership"),
    b = tome(s);
  s.discard = ["01050", "01034"];
  assert.match(
    bloodPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /discard pile/,
  );
  s.discard = ["01025"];
  s.heroes.forEach((h) => (h.resources = 0));
  assert.match(
    bloodPlayerAbilityProblem(s, b.hero, b.id) ?? "",
    /discard pile/,
  );
  s.heroes[0].resources = 10;
  s.activeLocation = unit(EMYN.amonLhaw);
  assert.ok(!availableAbilities(s, b.hero).some((a) => a.id === b.id));
  assert.throws(
    () => act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id }),
    /blank/,
  );
  assert.ok(get(s, b.hero.id)!.attachments.some((a) => a.id === b.id));
});
test("Counter-Spell cancels a paid Tome replay while its selected physical event still finishes at bottom", () => {
  let s = game("leadership"),
    b = tome(s);
  s.discard = ["01025", "01025"];
  s.deck = ["01043"];
  s.heroes[1].exhausted = true;
  const bane = unit(SHADOW_FLAME.bane);
  bane.attachments.push({
    id: "counter",
    code: SHADOW_FLAME.counter,
    exhausted: false,
  });
  s.staging.push(bane);
  s.encounterDeck = [SHADOW_FLAME.flame, "01099"];
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-1");
  s = choose(s, "pay-0");
  assert.equal(s.heroes[1].exhausted, true);
  assert.equal(s.deck.at(-1), "01025");
  assert.ok(s.discard.includes("06109"));
  assert.equal(s.discard.filter((code) => code === "01025").length, 1);
});
test("Tome explicitly chooses and pays X before replaying Men of the West", () => {
  let s = game("leadership"),
    b = tome(s);
  s.discard = ["06083", "06002", "06004"];
  s.deck = ["01043"];
  s = act(s, { type: "ABILITY", id: b.hero.id, attachmentId: b.id });
  s = choose(s, "discard-0");
  assert.equal(s.choice?.title, "Tome of Atanatar · Choose X");
  s = choose(reload(s), "x-2");
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = choose(reload(s), "pay-0");
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before - 2,
  );
  assert.ok(s.hand.some((u) => u.code === "06002"));
  assert.ok(s.hand.some((u) => u.code === "06004"));
  assert.equal(s.deck.at(-1), "06083");
});

test("The Hammer-stroke moves staging and other players' enemies, leaves already-engaged enemies and ignores engagement cost", () => {
  let s = game("tactics", 2);
  s.heroes = STARTERS.find((d) => d.id === "tactics")!.heroes.map((code) => ({
    ...unit(code),
    resources: 10,
  }));
  syncSeat(s);
  s.phase = "encounter";
  const own = unit("01089"),
    staged = unit("01084"),
    other = unit("01082", 1);
  staged.tempEngagement = 99;
  s.engaged = [own];
  s.staging = [staged];
  forOwner(s, 1, () => {
    s.engaged = [other];
  });
  s = play(s, "06111");
  s = settle(s);
  assert.deepEqual(
    new Set(seatView(s, 0).engaged.map((u) => u.id)),
    new Set([own.id, staged.id, other.id]),
  );
  assert.equal(seatView(s, 1).engaged.length, 0);
  assert.equal(s.staging.length, 0);
  assert.equal(
    s.log.filter((line) => line.text.includes("East Bight Patrol engages"))
      .length,
    0,
    "Already engaged enemy is not engaged again",
  );
});
test("The Hammer-stroke requires an Encounter action and skips enemies immune to movement", () => {
  const s = game("tactics"),
    enemy = unit("01089"),
    immune = unit(KHAZAD.nameless);
  s.staging = [enemy, immune];
  assert.match(canPlay(s, unit("06111")) ?? "", /Encounter/);
  s.phase = "encounter";
  s.staging = [immune];
  assert.match(canPlay(s, unit("06111")) ?? "", /enemy/);
});

test("Emery's hand action discards the controller's actual top three and enters under another player's control", () => {
  let s = game("spirit", 2),
    emery = unit("06112");
  s.hand = [emery];
  s.deck = ["01043", "01044", "01073", "01045"];
  const others = [...seatView(s, 1).deck];
  s.phase = "quest";
  assert.ok(availableAbilities(s, emery).some((a) => !a.disabled));
  s = act(s, { type: "ABILITY", id: emery.id });
  s = choose(reload(s), "player-1");
  assert.deepEqual(seatView(s, 0).deck, ["01045"]);
  assert.deepEqual(seatView(s, 0).discard, ["01043", "01044", "01073"]);
  assert.deepEqual(seatView(s, 1).deck, others);
  assert.ok(!seatView(s, 0).hand.some((u) => u.id === emery.id));
  const ally = seatView(s, 1).allies.find((u) => u.id === emery.id)!;
  assert.equal(ally.owner, 0);
  discardCharacter(s, ally);
  flush(s);
  assert.ok(seatView(s, 0).discard.includes("06112"));
  assert.ok(!seatView(s, 1).discard.includes("06112"));
});
test("Emery's conditional discard resolves before a discarded Hidden Cache response and keeps ownership", () => {
  let s = game("spirit", 2),
    emery = unit("06112");
  s.hand = [emery];
  s.deck = ["06143", "01013", "01043", "01045"];
  s = act(s, { type: "ABILITY", id: emery.id });
  s = choose(s, "player-1");
  assert.ok(!seatView(s, 1).allies.some((u) => u.code === "06112"));
  assert.ok(seatView(s, 0).discard.includes("06112"));
  assert.ok(!seatView(s, 1).discard.includes("06112"));
  assert.match(s.choice?.title ?? "", /Hidden Cache/);
  s = settle(reload(s));
  assert.equal(s.choice, null);
});
test("Emery requires the full three-card cost, while ordinary PLAY does not use her hand action", () => {
  let s = game(),
    emery = unit("06112");
  s.hand = [emery];
  s.deck = ["01043", "01044"];
  assert.match(bloodPlayerHandAbilityProblem(s, emery) ?? "", /three cards/);
  assert.ok(availableAbilities(s, emery)[0].disabled);
  assert.throws(() => act(s, { type: "ABILITY", id: emery.id }), /three cards/);
  s = act(s, { type: "PLAY", id: emery.id });
  assert.equal(s.allies[0].code, "06112");
  assert.deepEqual(s.deck, ["01043", "01044"]);
});

test("Children of the Sea targets only a controlled Silvan/Noldor ally and shuffles it to its physical owner's deck", () => {
  let s = game("spirit", 2),
    own = unit("01044", 1),
    foreign = unit("01044", 1);
  s.heroes[0].phaseResourceIcons = ["spirit"];
  s.allies = [own];
  forOwner(s, 1, () => {
    s.allies = [foreign];
  });
  assert.deepEqual(
    playTargets(s, unit("06113")).map((u) => u.id),
    [own.id],
  );
  const before = stats(s, own).will,
    deck0 = seatView(s, 0).deck.length,
    deck1 = seatView(s, 1).deck.length;
  s = play(s, "06113", own.id);
  assert.equal(stats(s, get(s, own.id)!).will, before + 2);
  s = reload(s);
  phaseEnd(s);
  flush(s);
  assert.ok(!get(s, own.id));
  assert.equal(seatView(s, 0).deck.length, deck0);
  assert.equal(seatView(s, 1).deck.length, deck1 + 1);
  assert.ok(seatView(s, 1).allies.some((u) => u.id === foreign.id));
});
test("Children's delayed effect survives source resolution and does not follow an ally returned to hand then reentered", () => {
  let s = game(),
    ally = unit("01044");
  s.allies = [ally];
  s = play(s, "06113", ally.id);
  const deckSize = s.deck.length;
  returnAlly(s, get(s, ally.id)!);
  flush(s);
  const hand = s.hand.find((u) => u.code === "01044")!;
  s = act(s, { type: "PLAY", id: hand.id });
  const newId = s.allies[0].id;
  assert.notEqual(newId, ally.id);
  phaseEnd(s);
  flush(s);
  assert.ok(get(s, newId));
  assert.equal(s.deck.length, deckSize);
});

test("The first player chooses Sneak Attack's hand departure or Children's shuffle, and either saved choice resolves only once", () => {
  for (const destination of ["hand", "deck"]) {
    let s = game("leadership"),
      ally = unit("01044");
    s.hand = [ally];
    s.heroes[0].phaseResourceIcons = ["spirit"];
    s = play(s, "01023");
    s = choose(s, ally.id);
    assert.equal(get(s, ally.id)!.temporary, true);
    s = play(s, "06113", ally.id);
    const deckSize = s.deck.length;
    phaseEnd(s);
    flush(s);
    assert.match(s.choice?.title ?? "", /first end-of-phase effect/);
    assert.ok(
      get(s, ally.id),
      "The first player's order is chosen before either move",
    );
    s = choose(reload(s), destination);
    assert.ok(!get(s, ally.id));
    assert.equal(
      s.hand.filter((u) => u.code === "01044").length,
      destination === "hand" ? 1 : 0,
    );
    assert.equal(s.deck.length, deckSize + (destination === "deck" ? 1 : 0));
    assert.equal(s.discard.filter((code) => code === "01044").length, 0);
    assert.equal(
      s.choice,
      null,
      "The already-queued second departure is now a no-op",
    );
  }
});
test("Conflicting Children departures are ordered by the first player and return a borrowed temporary ally to its physical owner", () => {
  for (const destination of ["hand", "deck"]) {
    let s = game("leadership", 2),
      ally = unit("01044", 1);
    s.table!.first = 1;
    s.heroes[0].phaseResourceIcons = ["spirit"];
    ally.temporary = true;
    s.allies = [ally];
    syncSeat(s);
    s = play(s, "06113", ally.id);
    const deck0 = seatView(s, 0).deck.length,
      deck1 = seatView(s, 1).deck.length;
    phaseEnd(s);
    flush(s);
    assert.equal(
      s.table!.active,
      1,
      "The first player gets the ordering choice",
    );
    assert.ok(
      s.choice!.options.every((o) => o.effects[0].player === 0),
      "The departure resolves in the actual controller's scope",
    );
    s = choose(reload(s), destination);
    assert.ok(!get(s, ally.id));
    assert.equal(seatView(s, 0).deck.length, deck0);
    assert.equal(
      seatView(s, 0).hand.filter((u) => u.code === "01044").length,
      0,
    );
    assert.equal(
      seatView(s, 1).deck.length,
      deck1 + (destination === "deck" ? 1 : 0),
    );
    assert.equal(
      seatView(s, 1).hand.filter((u) => u.code === "01044").length,
      destination === "hand" ? 1 : 0,
    );
  }
});
test("Anborn exhausts to recover the exact chosen Trap from his controller's discard pile", () => {
  let s = game("lore", 2),
    anborn = unit("06114");
  s.allies = [anborn];
  s.discard = ["06115", "05017", "06115", "01057"];
  forOwner(s, 1, () => {
    s.discard = ["05017"];
  });
  s = act(s, { type: "ABILITY", id: anborn.id });
  assert.equal(s.choice?.options.length, 3);
  s = choose(reload(s), "trap-2");
  assert.equal(get(s, anborn.id)!.exhausted, true);
  assert.deepEqual(seatView(s, 0).discard, ["06115", "05017", "01057"]);
  assert.deepEqual(seatView(s, 1).discard, ["05017"]);
  assert.equal(seatView(s, 0).hand.at(-1)!.code, "06115");
  assert.throws(() => act(s, { type: "ABILITY", id: anborn.id }), /exhaust/);
});

test("Poisoned Stakes enters unattached, attaches all copies to the next eligible enemy and keeps owner on defeat", () => {
  let s = game("lore", 2);
  s.heroes[0].phaseResourceIcons = ["lore"];
  s = play(s, "06115");
  s = play(s, "06115");
  const trapIds = s.staging.map((u) => u.id);
  assert.equal(stagingThreat(s), 0);
  const immune = unit(KHAZAD.nameless);
  s.staging.push(immune);
  enemyAddedToStaging(s, immune);
  assert.ok(s.staging.some((u) => u.code === "06115"));
  const enemy = unit("01089");
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.deepEqual(
    enemy.attachments.map((a) => a.id),
    trapIds,
  );
  s.queue.push(...bloodPlayerRoundEndEffects(s));
  flush(s);
  assert.ok(!get(s, enemy.id));
  assert.equal(
    seatView(s, 0).discard.filter((code) => code === "06115").length,
    2,
  );
  assert.equal(
    seatView(s, 1).discard.filter((code) => code === "06115").length,
    0,
  );
});
test("Poisoned Stakes does two damage at each actual round end; Amon Lhaw blanks automatic attach and round damage", () => {
  let s = game("lore");
  s = play(s, "06115");
  s.activeLocation = unit(EMYN.amonLhaw);
  stats(s, s.heroes[0]);
  const first = unit("01089");
  s.staging.push(first);
  enemyAddedToStaging(s, first);
  assert.equal(first.attachments.length, 0);
  s.activeLocation = null;
  stats(s, s.heroes[0]);
  const next = unit("01084");
  s.staging.push(next);
  enemyAddedToStaging(s, next);
  assert.ok(next.attachments.some((a) => a.code === "06115"));
  s.activeLocation = unit(EMYN.amonLhaw);
  stats(s, s.heroes[0]);
  s.queue.push(fx("endRound"));
  flush(s);
  assert.equal(get(s, next.id)!.damage, 0);
  s.activeLocation = null;
  stats(s, s.heroes[0]);
  s.queue.push(fx("endRound"));
  flush(s);
  assert.equal(get(s, next.id)!.damage, 2);
});
test("Poisoned Stakes can be PLAYed by Vilya and cannot be PUT into an unspecified play area", () => {
  const s = game("lore"),
    trap = unit("06115");
  assert.match(
    effectCardPlayProblem(s, trap, { putIntoPlay: true }) ?? "",
    /Trap|staging|play effect/,
  );
  assert.equal(effectCardPlayProblem(s, trap, { putIntoPlay: false }), null);
  assert.equal(playTargets(s, trap).length, 0);
});
test("Poisoned Stakes' round-end passive defeats an enemy before Dwarven Sellsword's Forced payment window", () => {
  let s = game("leadership"),
    sellsword = unit("12083"),
    enemy = unit("01083");
  s.allies = [sellsword];
  enemy.attachments = [
    { id: "poison-before-forced", code: "06115", owner: 0, exhausted: false },
  ];
  s.staging = [enemy];
  s.phase = "refresh";
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  s = act(s, { type: "NEXT" });
  assert.match(s.choice?.title ?? "", /Dwarven Sellsword/);
  assert.ok(
    !get(s, enemy.id),
    "The passive damage and resulting defeat finish before a Forced ability pauses",
  );
  assert.ok(s.encounterDiscard.includes("01083"));
  assert.ok(s.discard.includes("06115"));
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    before,
    "Sellsword payment has not happened yet",
  );
});

test("Well-Equipped offers only its own actual discarded attachment and any eligible Dwarf in play", () => {
  let s = game("spirit", 2),
    dwarf = unit("01004", 1),
    own = unit("01004");
  s.heroes = [{ ...own, resources: 10 }];
  syncSeat(s);
  forOwner(s, 1, () => {
    s.heroes = [{ ...dwarf, resources: 10 }];
  });
  s.discard = ["01039"];
  s.deck = ["01039", "01043", "01044"];
  s = play(s, "06116");
  assert.equal(s.choice?.options.filter((o) => o.code === "01039").length, 1);
  assert.ok(s.choice?.options.some((o) => o.id === "attachment-1"));
  s = choose(reload(s), "attachment-1");
  assert.ok(s.choice?.options.some((o) => o.id === dwarf.id));
  s = choose(reload(s), dwarf.id);
  assert.deepEqual(seatView(s, 0).deck, ["01044"]);
  assert.equal(
    seatView(s, 0).discard.filter((code) => code === "01039").length,
    1,
  );
  const host = get(s, dwarf.id)!;
  assert.equal(host.attachments[0].code, "01039");
  assert.equal(host.attachments[0].owner, 0);
  discardCharacter(s, host);
  flush(s);
  assert.equal(
    seatView(s, 0).discard.filter((code) => code === "01039").length,
    2,
  );
});
test("Well-Equipped respects attachment text, unique titles and optional decline while resolving partial top-two effects", () => {
  let s = game("tactics");
  s.deck = ["04057", "01026", "01043"];
  s.heroes[0].attachments.push({
    id: "steward-already",
    code: "01026",
    exhausted: false,
  });
  s = play(s, "06116");
  assert.equal(
    s.choice,
    null,
    "Rivendell Bow cannot attach to these Dwarves and unique Steward is already present",
  );
  assert.ok(s.discard.includes("04057"));
  assert.ok(s.discard.includes("01026"));
  s = game("tactics");
  s.deck = ["01039"];
  s = play(s, "06116");
  s = choose(reload(s), "skip");
  assert.equal(s.deck.length, 0);
  assert.ok(s.discard.includes("01039"));
  assert.equal(s.heroes.flatMap((h) => h.attachments).length, 0);
});
test("Well-Equipped finishes attaching before offering discarded Hidden Cache and does not trigger played-attachment responses", () => {
  let s = game("tactics");
  s.deck = ["01039", "06143", "01043"];
  s = play(s, "06116");
  assert.equal(s.choice?.title, "Well-Equipped · Discarded attachment");
  s = choose(s, "attachment-0");
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].attachments[0].code, "01039");
  assert.match(s.choice?.title ?? "", /Hidden Cache/);
  s = settle(reload(s));
  assert.ok(s.discard.includes("06116"));
});

test("Reprinted Squire grants a Gondor hero resource after a discard cost; Guthlaf reuses global hero trait conditions", () => {
  let s = game("leadership"),
    squire = unit("06108");
  s.heroes[0].attachments.push({
    id: "gondor",
    code: "01026",
    exhausted: false,
  });
  s.allies = [squire];
  discardCharacter(s, squire);
  flush(s);
  assert.match(s.choice?.title ?? "", /Squire/);
  const before = s.heroes[0].resources;
  s = choose(s, s.heroes[0].id);
  assert.equal(s.heroes[0].resources, before + 1);
  s = game("tactics", 2);
  forOwner(s, 1, () => {
    s.heroes = [unit("01007", 1), unit("01008", 1)];
  });
  assert.equal(playCost(s, card("06110")), 2);
  const guthlaf = unit("06110");
  s.allies = [guthlaf];
  stats(s, guthlaf);
  assert.equal(hasKeyword(guthlaf, "Sentinel"), true);
});
