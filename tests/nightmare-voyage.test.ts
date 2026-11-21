import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { check, exhaustCharacter } from "../src/game/board";
import {
  engagementCost,
  fx,
  get,
  locationQuest,
  make,
  threatOf,
} from "../src/game/core";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { forOwner } from "../src/game/table";
import { sailingSymbols } from "../src/game/sailing";
import {
  voyageEndQuest,
  voyageSailingCancelledIcons,
} from "../src/game/voyage-belegaer";
import {
  VOYAGE as V,
  VOYAGE_STAGE_TWO,
} from "../src/game/voyage-belegaer-support";
import {
  NIGHTMARE,
  NIGHTMARE_GH as G,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import { base, choose, reload, settle } from "./voyage-belegaer-fixtures";

const ID = "voyage-across-belegaer";
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare voyage at stage 1 with the fleet in play (the scenario's own fixture). */
function board(players = 1) {
  const s = base(players);
  s.nightmareMode = true;
  s.nightmare = {};
  const q = s.voyageBelegaer!;
  q.questDeck.splice(q.questDeck.length - 1, 0, G.confrontation, G.lost);
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
}
/** The given player reveals a known card from the top of the encounter deck. */
function reveal(s: GameState, code: string, p = 0) {
  s.encounterDeck.unshift(code);
  s.queue.push(fx("reveal", { player: p }));
  flush(s);
  return s;
}
/** Make a stage the current quest, the others in the quest deck. */
function changeQuest(s: GameState, code: string) {
  const q = s.voyageBelegaer!,
    all = [q.currentQuest, ...q.questDeck, ...q.completedQuests];
  q.currentQuest = code;
  q.questDeck = all.filter((c) => c !== code && c !== V.pursuit);
  q.questDeck.push(V.pursuit);
  q.completedQuests = [];
  s.stage = code === V.departure ? 1 : code === V.pursuit ? 3 : 2;
  s.progress = 0;
  return s;
}
function shadowOf(s: GameState, attacker: Unit, code: string) {
  s.combat = {
    enemyId: attacker.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  attacker.shadows = [code];
  attacker.revealedShadowCount = 1;
  const handled = hooks(s).shadow!(s, code);
  flush(s);
  return handled;
}
const ships = (s: GameState) =>
  s.allies.filter((u) => card(u.code).type_code === "ship-objective");

test("Nightmare: Voyage Across Belegaer's setup card, stages and Nightmare Deck carry their scans' texts, stats and Sailing symbols", () => {
  const c = card(G.voyageCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "Voyage Across Belegaer",
      "nightmare",
      "nightmare",
      "Voyage Across Belegaer - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for the Voyage Across Belegaer scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n2x Southron Sailor\n1x Starlit Sea\n1x Fog Bank\n2x Calm Waters\n2x Thrown Off Course\n1x Scouting Ship\nThen, /,
    '"quest deck", paragraphs and "standard encounter deck" (the catalogue had none of them)',
  );
  assert.match(
    c.text!,
    /throughout the game, which is now ready to begin\.\n1\*: Some cards in The Grey Havens Nightmare Decks/,
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.",
    "without the flavour text",
  );
  for (const [code, name] of [
    [G.confrontation, "Corsair Confrontation"],
    [G.lost, "Lost at Sea"],
  ] as const) {
    const q = card(code);
    assert.deepEqual(
      [q.name, q.type_code, q.cost, q.victory, q.back_quest],
      [name, "quest", 2, 3, undefined],
      "stage 2, Victory 3, no quest points",
    );
    assert.match(q.back_text!, /^Sailing\./);
  }
  assert.equal(
    card(G.lost).text,
    "When Revealed: Set your heading to the worst setting ( 3/4 ).",
  );
  assert.match(
    card(G.lost).back_text!,
    /Cancel the first 1 symbol found during each Sailing test\.\nForced: /,
  );
  assert.equal(
    card(G.pursuer).name,
    "Sahír's Pursuer",
    'the catalogue had "Sahir\'s"',
  );
  assert.match(card(G.pursuer).text!, /shift your heading off-course\.$/);
  assert.equal(card(G.shattered).text!.split("\n").length, 3);
  assert.match(card(G.rogue).text!, /distribute 4 damage among characters/);
  const stat = (code: string) => {
    const x = card(code);
    return [x.engagement, x.threat, x.attack, x.defense, x.health, x.traits];
  };
  assert.deepEqual(stat(G.brash), [16, 3, 3, 4, 3, "Corsair."]);
  assert.deepEqual(stat(G.pursuer), [40, 3, 7, 3, 8, "Corsair. Ship."]);
  assert.deepEqual(
    [G.open, G.shattered, G.dreams, G.squall, G.brash, G.pursuer, G.rogue].map(
      sailingSymbols,
    ),
    [1, 1, 1, 1, 0, 0, 0],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Voyage Across Belegaer - Nightmare",
  );
  assert.equal(set.length, 10);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    16,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    13,
  );
});

test("Nightmare: Voyage Across Belegaer's encounter deck, Corsair deck and quest deck match the source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.1")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(card(G.voyageCard).text!.includes(`${n}x ${title}`), title);
  for (const s of [opening(nightmareGame(ID)), opening(nightmareForTwo(ID))]) {
    const q = s.voyageBelegaer!;
    assert.equal(nightmareCardOf(s), G.voyageCard);
    assert.deepEqual(
      tally([...s.encounterDeck, ...s.encounterDiscard]),
      tally(section("sharedEncounterDeck")),
    );
    assert.deepEqual(
      tally([...q.corsairDeck, ...q.corsairDiscard]),
      tally(section("sharedEncounterDeck2")),
    );
    assert.deepEqual(
      [...q.questDeck.slice(0, -1)].sort(),
      [...VOYAGE_STAGE_TWO, G.confrontation, G.lost].sort(),
    );
    assert.equal(q.questDeck.at(-1), V.pursuit);
    assert.match(
      nightmareStatus(s)[0],
      /^Voyage Across Belegaer · Nightmare mode: the quest deck's stage 2 cards include Corsair Confrontation and Lost at Sea/,
    );
    assert.ok(valid(s));
  }
});

test("Nightmare: Corsair Confrontation brings a Corsair Warship from the deck, discard pile or victory display, and is defeated at the end of the quest phase without one in play", () => {
  let s = changeQuest(board(), G.confrontation);
  s.encounterDiscard.push(V.warship);
  s.victoryCards = [V.warship];
  s.victory = card(V.warship).victory ?? 0;
  queue(s, fx("voyageStageReveal", { player: 0 }));
  flush(s);
  assert.match(
    s.choice!.title,
    /^Corsair Confrontation · Add a Corsair Warship/,
  );
  assert.deepEqual(options(s), ["discard", "victory"]);
  s = settle(choose(reload(s), "victory"));
  assert.ok(s.staging.some((u) => u.code === V.warship));
  assert.deepEqual(s.victoryCards, []);
  assert.equal(s.victory, 0);
  // With a Corsair Warship in play the stage holds.
  voyageEndQuest(s);
  flush(s);
  assert.equal(s.voyageBelegaer!.currentQuest, G.confrontation);
  // Without one, it is defeated: on-course, the players choose between the top 2 stages.
  s.staging = [];
  voyageEndQuest(s);
  flush(s);
  assert.match(s.choice!.title, /^On-course · Choose the next quest stage/);
  assert.equal(s.choice!.options.length, 2);
  const next = s.choice!.options[1].id;
  s = settle(choose(reload(s), next));
  assert.equal(s.voyageBelegaer!.currentQuest, next);
  assert.ok(s.voyageBelegaer!.completedQuests.includes(G.confrontation));
  assert.ok(s.victoryCards!.includes(G.confrontation));
});

test("Nightmare: Lost at Sea sets the heading to the worst setting, cancels a Sailing symbol, and is defeated on-course with a choice among the top 3 stages", () => {
  let s = changeQuest(board(), G.lost);
  queue(s, fx("voyageStageReveal", { player: 0 }));
  flush(s);
  assert.equal(s.sailing!.heading, 3);
  assert.equal(voyageSailingCancelledIcons(s), 1);
  stage(s, V.rough);
  assert.equal(voyageSailingCancelledIcons(s), 2, "with Rough Waters");
  // Off-course, it holds; on-course, it is defeated.
  voyageEndQuest(s);
  flush(s);
  assert.equal(s.voyageBelegaer!.currentQuest, G.lost);
  s.sailing!.heading = 0;
  s.progress = 99;
  hooks(s);
  voyageEndQuest(s);
  flush(s);
  assert.match(s.choice!.title, /^Lost at Sea · Choose the next quest stage/);
  assert.equal(s.choice!.options.length, 3);
  const before = [...s.voyageBelegaer!.questDeck];
  const next = s.choice!.options[2].id;
  s = settle(choose(reload(s), next));
  const q = s.voyageBelegaer!;
  assert.equal(q.currentQuest, next);
  assert.deepEqual(
    q.questDeck.slice(-2),
    before.slice(0, 2),
    "the others on the bottom",
  );
});

test("Nightmare: Brash Corsair attacks when its player exhausts a Ship objective; Sahír's Pursuer makes the first player engage it or shift off-course", () => {
  let s = board();
  const brash = engaged(s, G.brash);
  const [ship] = ships(s);
  exhaustCharacter(s, ship);
  assert.ok(
    s.queue.some((e) => e.kind === "immediateAttack" && e.target === brash.id),
  );
  // Sahír's Pursuer at the end of the encounter phase.
  s = board();
  const pursuer = stage(s, G.pursuer);
  assert.equal(hooks(s).cannotAttach!(s, pursuer, "01040"), true);
  queue(s, ...hooks(s).encounterEnd!(s));
  flush(s);
  assert.match(s.choice!.title, /^Sahír's Pursuer · Choose one/);
  assert.deepEqual(options(s), ["engage", "shift"]);
  s = settle(choose(reload(s), "shift"));
  assert.equal(s.sailing!.heading, 1);
  s.sailing!.heading = 3;
  queue(s, ...hooks(s).encounterEnd!(s));
  flush(s);
  assert.deepEqual(options(s), ["engage"]);
  s = settle(choose(reload(s), "engage"));
  assert.ok(s.engaged.some((u) => u.id === pursuer.id));
});

test("Nightmare: Open Waters strengthens the Ship enemies and costs a Ship objective's exhaustion to travel; Shattered Sea grows with the heading", () => {
  let s = board();
  const open = stage(s, G.open);
  const pursuer = stage(s, G.pursuer);
  assert.deepEqual([engagementCost(s, pursuer), threatOf(s, pursuer)], [35, 4]);
  for (const u of ships(s)) u.exhausted = true;
  s.phase = "travel";
  assert.throws(
    () => act(s, { type: "TRAVEL", id: open.id }),
    /exhaust a Ship objective/,
  );
  const [ship] = ships(s);
  ship.exhausted = false;
  s = act(s, { type: "TRAVEL", id: open.id });
  assert.match(s.choice!.title, /^Open Waters · Exhaust a Ship objective/);
  s = settle(choose(reload(s), ship.id));
  assert.equal(s.activeLocation?.id, open.id);
  assert.equal(get(s, ship.id)!.exhausted, true);
  // Shattered Sea.
  s = board();
  const sea = stage(s, G.shattered);
  assert.deepEqual([threatOf(s, sea), locationQuest(s, sea)], [4, 4]);
  s.sailing!.heading = 2;
  assert.deepEqual([threatOf(s, sea), locationQuest(s, sea)], [8, 8]);
  s.sailing!.heading = 3;
  assert.deepEqual([threatOf(s, sea), locationQuest(s, sea)], [10, 10]);
});

test("Nightmare: Rogue Wave exhausts a Ship objective or deals 4 damage (6 off-course), and its shadow counts the quest cards in the victory display", () => {
  let s = board();
  const [ship] = ships(s);
  s = reveal(s, G.rogue);
  assert.match(s.choice!.title, /^Rogue Wave · Choose one/);
  assert.ok(options(s).includes(ship.id) && options(s).includes("damage"));
  assert.match(
    s.choice!.options.find((o) => o.id === "damage")!.label,
    /Distribute 4 damage/,
  );
  s = settle(choose(reload(s), ship.id));
  assert.equal(get(s, ship.id)!.exhausted, true);
  s = board();
  s.sailing!.heading = 1;
  s = reveal(s, G.rogue);
  assert.match(
    s.choice!.options.find((o) => o.id === "damage")!.label,
    /Distribute 6 damage/,
  );
  // Its shadow.
  s = board();
  s.victoryCards = [V.storm, V.mists, V.warship];
  shadowOf(s, engaged(s, V.pirate), G.rogue);
  assert.equal(s.combat!.attackBonus, 2);
});

test("Nightmare: Dreams of Númenor sets the worst heading or exhausts every ally; its shadow attacks again off-course", () => {
  let s = board();
  s = reveal(s, G.dreams);
  assert.deepEqual(options(s), ["heading", "allies"]);
  s = settle(choose(reload(s), "heading"));
  assert.equal(s.sailing!.heading, 3);
  s = reveal(s, G.dreams);
  assert.deepEqual(options(s), ["allies"], "the heading is already the worst");
  s = settle(choose(reload(s), "allies"));
  assert.ok(
    ships(s).every((u) => u.exhausted),
    "Ship objectives are allies",
  );
  // Its shadow.
  s = board();
  shadowOf(s, engaged(s, V.pirate), G.dreams);
  assert.equal(s.combat!.extraAttacks, undefined);
  s = board();
  s.sailing!.heading = 1;
  shadowOf(s, engaged(s, V.pirate), G.dreams);
  assert.equal(s.combat!.extraAttacks, 1);
});

test("Nightmare: Raging Squall, discarded by a Sailing test, damages each committed character", () => {
  const s = board();
  const hero = s.heroes[0];
  const [ship] = ships(s);
  const effects = hooks(s).sailingDiscarded!(
    s,
    [G.squall, "01099", G.squall],
    [hero.id, ship.id],
  );
  assert.equal(effects.length, 4, "1 damage to each of two characters, twice");
  assert.ok(effects.every((e) => e.kind === "damage" && e.value === 1));
  assert.deepEqual(hooks(s).sailingDiscarded!(s, ["01099"], [hero.id]), []);
});

test("Nightmare: a Sailing test passes to the next first player when Brash Corsair's attack eliminates its first player, without the Dream-chaser that left", () => {
  let s = board(2);
  s.phase = "quest";
  queue(s, fx("sailingBegin"));
  flush(s);
  assert.equal(s.sailing!.test!.player, 0);
  const dream = s.allies.find((u) => u.code === V.dream)!;
  s = act(s, { type: "CHOOSE", id: dream.id });
  assert.deepEqual(s.sailing!.test!.committedIds, [dream.id]);
  // The first player's last hero falls (as to Brash Corsair's attack).
  forOwner(s, 0, () => (s.threat = 50));
  check(s);
  assert.equal(s.table!.seats[0].eliminated, true);
  assert.equal(s.status, "playing");
  assert.equal(s.sailing!.test!.player, 1);
  assert.deepEqual(s.sailing!.test!.committedIds, []);
  assert.ok(valid(s));
  flush(s);
  assert.match(s.choice!.title, /^Sailing test · Commit characters/);
  assert.ok(valid(s));
});

test("Nightmare: Voyage Across Belegaer Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});
