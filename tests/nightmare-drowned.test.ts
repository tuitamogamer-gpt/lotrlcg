import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { STARTERS, card, encounterCards } from "../src/game/cards";
import { addVictoryCard, progressLocation, revealed } from "../src/game/board";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { flush } from "../src/game/effects";
import { applyAction, createGame } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { allEngaged, forOwner, playerOrder } from "../src/game/table";
import {
  drownedCannotEngage,
  drownedEffect,
  drownedEncounterStart,
  drownedQuestEnd,
  drownedTravelEntered,
} from "../src/game/drowned";
import {
  DROWNED as D,
  DROWNED_NIGHTMARE_GROTTO,
  drownedFront,
} from "../src/game/drowned-support";
import {
  NIGHTMARE,
  NIGHTMARE_DC as N,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import { autoplay, opening, valid } from "./nightmare-fixtures";
import { add, choose, reload, setActive, settle } from "./drowned-fixtures";

const ID = "the-drowned-ruins";
const hooks = (s: GameState) => batch4Scenario(s);
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
/** A Nightmare mode game through the setup's choices (the scenario's own fixture). */
function start(players = 1, seed = 50) {
  const d = STARTERS[0];
  let s = createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: ID,
    nightmare: true,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 100, "Drowned setup terminates");
    s = applyAction(
      s,
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
/** A quiet Nightmare board in the planning phase (drowned-fixtures' base, in Nightmare mode). */
function board(players = 1) {
  const s = start(players);
  Object.assign(s, {
    phase: "planning",
    queue: [],
    choice: null,
    combat: null,
    suspendedCombats: [],
    progress: 0,
    encounterDiscard: [],
    encounterDeck: Array(30).fill(D.drowned),
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.engaged = [];
      s.used = [];
      s.hand = [];
      s.discard = [];
      s.committedIds = [];
      s.allies = s.allies.filter((u) =>
        [D.sahirAlly, D.naasiyahAlly].includes(u.code),
      );
      for (const u of [...s.heroes, ...s.allies])
        Object.assign(u, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
          attachments: [],
        });
    });
  return s;
}
const ally = (s: GameState, code: string) =>
  s.allies.find((u) => u.code === code)!;
/** An Underwater location in the victory display (a Grotto card's Underwater side). */
function victory(s: GameState) {
  const q = s.drowned!;
  const u = q.grottoDeck.shift()!;
  u.code = q.originalCodes[u.id] + ":B";
  q.victoryLocations.push(u);
  addVictoryCard(s, u.code);
  return u;
}
function engaged(s: GameState, code: string, p = 0) {
  return add(s, code, "engaged", p);
}

test("Nightmare: The Drowned Ruins' setup card and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(N.drownedCard);
  assert.equal(setup.type_code, "nightmare");
  assert.ok(
    setup.text!.includes(
      "1x Cursed Caverns / Twisting Hollow\n1x Undersea Grotto / Dark Abyss\n",
    ),
  );
  const back = setup.back_text!.split("\n");
  assert.deepEqual(back.length, 3);
  assert.ok(back[1].endsWith("encounter card effects cannot be canceled."));
  assert.ok(back[2].includes("Captain Sahír makes an immediate attack"));
  for (const [code, front, under, t, q, bt, bq] of [
    [N.passageJagged, "Overgrown Passage", "Jagged Cavern", 5, 5, 6, 8],
    [N.passageCrawlway, "Overgrown Passage", "Submerged Crawlway", 5, 5, 2, 16],
    [N.precipiceJagged, "Sharp Precipice", "Jagged Cavern", 2, 3, 6, 8],
    [N.precipiceCrawlway, "Sharp Precipice", "Submerged Crawlway", 2, 3, 2, 16],
  ] as const) {
    const c = card(code);
    assert.deepEqual(
      [c.name, c.threat, c.quest, c.traits, c.back_name],
      [front, t, q, "Underground. Grotto.", under],
    );
    const b = card(code + ":B");
    assert.deepEqual(
      [b.name, b.threat, b.quest, b.victory, b.traits, b.quantity],
      [under, bt, bq, 2, "Underground. Underwater.", 0],
    );
    assert.equal(b.text!.split("\n").length, 2);
    assert.equal(
      drownedFront(code),
      `drowned-${front.toLowerCase().replace(" ", "-")}`,
    );
  }
  assert.ok(
    card(N.precipiceJagged).text!.includes("choose to travel a location named"),
  );
  assert.deepEqual(
    [N.submerged, N.shark, N.troll].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health, c.victory];
    }),
    [
      [26, 2, 3, 2, 3, undefined],
      [34, 4, 4, 4, 6, undefined],
      [36, 3, 7, 1, 10, 1],
    ],
  );
  assert.equal(card(N.shark).text!.split("\n").length, 3);
  assert.deepEqual([card(N.flooded).threat, card(N.flooded).quest], [2, 6]);
  const set = encounterCards.filter(
    (c) => c.encounter_set === "The Drowned Ruins - Nightmare",
  );
  assert.equal(set.length, 17);
  assert.equal(
    set.reduce(
      (n, c) => n + (c.type_code === "nightmare" ? 0 : (c.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((a) => set.some((c) => c.code === a.code)).length,
    16,
  );
  // The generic public sides are the printed shared scans.
  for (const [generic, code] of [
    ["drowned-overgrown-passage", N.passageJagged],
    ["drowned-sharp-precipice", N.precipiceCrawlway],
  ]) {
    const hash = createHash("sha256")
      .update(readFileSync(`public/cards/${generic}.jpg`))
      .digest("hex");
    assert.equal(
      art.find((a) => a.code === code && a.face === "front")!.sha256,
      hash,
    );
  }
  assert.equal(nightmareCardOf(start()), N.drownedCard);
  assert.match(nightmareStatus(start())[0], /cannot be canceled/);
});

test("Nightmare: The Drowned Ruins' encounter deck and Grotto deck match the source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.7")!;
  const section = (name: string) =>
    tally(
      recipe.cards
        .filter((c) => c.section === name)
        .flatMap((c) => Array<string>(c.quantity).fill(c.code)),
    );
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.drownedCard)
        .text!.toLowerCase()
        .includes(`${n}x ${title}`.toLowerCase()),
      title,
    );
  for (const players of [1, 2]) {
    const s = start(players);
    const q = s.drowned!;
    assert.deepEqual(
      tally([...s.encounterDeck, ...s.encounterDiscard]),
      section("sharedEncounterDeck"),
    );
    const grotto = [...q.grottoDeck, ...s.staging]
      .filter(
        (u) => q.originalCodes[u.id] && q.originalCodes[u.id] !== D.shrine,
      )
      .map((u) => q.originalCodes[u.id]);
    assert.deepEqual(tally(grotto), section("sharedEncounterDeck2"));
    for (const code of DROWNED_NIGHTMARE_GROTTO)
      assert.ok(grotto.includes(code));
    assert.ok(valid(s));
  }
});

test("Nightmare: while the active location is Underwater, encounter card effects cannot be canceled", () => {
  const s = board();
  setActive(s, N.passageJagged);
  assert.equal(hooks(s).cannotCancel!(s, false, D.undertow), false);
  setActive(s, N.passageJagged, true);
  assert.ok(hooks(s).cannotCancel!(s, false, D.undertow));
  assert.ok(hooks(s).cannotCancel!(s, true, D.undertow));
});

test("Nightmare: as stage 2A resolves, Captain Sahír makes an immediate attack against each player in turn order", () => {
  const s = board(2);
  setActive(s, N.passageJagged);
  drownedEffect(s, fx("drownedBetrayal", { player: 0 }));
  const attacks = s.queue.filter((e) => e.kind === "immediateAttack");
  assert.deepEqual(
    attacks.map((e) => e.player),
    [0, 1],
  );
  const sahir = get(s, attacks[0].target)!;
  assert.equal(sahir.code, D.sahir);
});

test("Nightmare: Overgrown Passage stops heroes gaining resources while active; Sharp Precipice flips as the players travel to it, and costs 3 threat each when the players travel elsewhere", () => {
  let s = board();
  setActive(s, N.passageJagged);
  assert.ok(hooks(s).cannotGainResources!(s, s.heroes[0]));
  assert.ok(!hooks(s).cannotGainResources!(s, ally(s, D.naasiyahAlly)));
  // Travelling to Sharp Precipice flips it without a choice.
  const precipice = setActive(s, N.precipiceCrawlway);
  drownedTravelEntered(s, precipice);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(precipice.code, N.precipiceCrawlway + ":B");
  // Faced with the option to travel, the players travel elsewhere.
  s = board(2);
  setActive(s, N.passageCrawlway);
  const staged = s.activeLocation!;
  s.activeLocation = null;
  s.staging.push(staged);
  const other = setActive(s, N.precipiceJagged);
  s.activeLocation = null;
  s.staging.push(other);
  hooks(s).travelBegin!(s);
  assert.equal(s.nightmare?.drownedPrecipice?.copies, 1);
  hooks(s).encounterBegin!(s);
  flush(s);
  for (const p of [0, 1]) forOwner(s, p, () => assert.equal(s.threat, 23));
  // Travelling to it costs nothing.
  hooks(s).travelBegin!(s);
  hooks(s).travelEntered!(s, other, true);
  hooks(s).encounterBegin!(s);
  flush(s);
  for (const p of [0, 1]) forOwner(s, p, () => assert.equal(s.threat, 23));
  assert.ok(valid(s));
});

test("Nightmare: Jagged Cavern gives the round's first treachery doomed 1 and surge, and at the end of the quest phase each player discards their hand before it may flip", () => {
  let s = board();
  setActive(s, N.precipiceJagged, true);
  hooks(s).revealed!(s, D.undertow, "encounter");
  assert.equal(hooks(s).revealedDoomed!(s, D.undertow, "encounter"), 1);
  assert.ok(hooks(s).revealedSurge!(s, D.undertow));
  hooks(s).revealed!(s, D.tangling, "encounter");
  assert.equal(hooks(s).revealedDoomed!(s, D.tangling, "encounter"), 0);
  assert.ok(!hooks(s).revealedSurge!(s, D.tangling));
  s.round++;
  hooks(s).revealed!(s, D.undertow, "encounter");
  assert.equal(hooks(s).revealedDoomed!(s, D.undertow, "encounter"), 1);
  // End of the quest phase.
  s = board(2);
  const cavern = setActive(s, N.passageJagged, true);
  for (const p of [0, 1])
    forOwner(s, p, () => {
      add(s, "01023", "hand", p);
      add(s, "01025", "hand", p);
    });
  drownedQuestEnd(s);
  flush(s);
  for (const p of [0, 1]) forOwner(s, p, () => assert.equal(s.hand.length, 0));
  assert.match(s.choice!.title, /Jagged Cavern · Flip to its Grotto side/);
  s = choose(s, "flip");
  assert.equal(s.activeLocation!.code, drownedFront(N.passageJagged));
  assert.equal(s.activeLocation!.id, cavern.id);
  assert.ok(valid(s));
});

test("Nightmare: Submerged Crawlway deals each engaged enemy an additional shadow card as combat begins, and at the end of the quest phase each player adds an enemy to the staging area before it may flip", () => {
  let s = board();
  setActive(s, N.precipiceCrawlway, true);
  const a = engaged(s, D.drowned);
  hooks(s).combatBegin!(s);
  assert.equal(a.shadows.length, 1);
  s = board();
  setActive(s, N.precipiceCrawlway, true);
  s.encounterDeck = [N.shark, D.undertow];
  drownedQuestEnd(s);
  flush(s);
  assert.match(s.choice!.title, /Search for an enemy/);
  s = choose(s, N.shark);
  assert.ok(s.staging.some((u) => u.code === N.shark));
  assert.match(s.choice!.title, /Submerged Crawlway · Flip/);
  assert.ok(valid(s));
});

test("Nightmare: Great Shark grows with each Underwater location in the victory display, and cannot be engaged or damaged unless the active location is Underwater", () => {
  const s = board();
  setActive(s, N.passageJagged);
  const shark = add(s, N.shark);
  assert.ok(drownedCannotEngage(s, shark));
  assert.equal(hooks(s).damageAmount!(s, shark, 3, {}), 0);
  victory(s);
  victory(s);
  assert.deepEqual(
    [threatOf(s, shark), stats(s, shark).attack, stats(s, shark).defense],
    [6, 6, 6],
  );
  // Engaged, it returns at the beginning of the encounter phase.
  const e = engaged(s, N.shark);
  drownedEncounterStart(s);
  assert.ok(s.staging.some((u) => u.id === e.id));
  setActive(s, N.passageJagged, true);
  assert.ok(!drownedCannotEngage(s, shark));
  assert.equal(hooks(s).damageAmount!(s, shark, 3, {}), 3);
  assert.ok(valid(s));
});

test("Nightmare: Undersea Cave Troll's excess damage discards that many resources from the attacked player's heroes and objective-allies", () => {
  let s = board();
  setActive(s, N.passageJagged);
  const troll = engaged(s, N.troll);
  const naasiyah = ally(s, D.naasiyahAlly);
  naasiyah.resources = 0;
  s.phase = "defense";
  // A 1-hit-point ally: most of the attack is excess damage.
  const defender = add(s, "01016", "allies");
  s = applyAction(reload(s), {
    type: "DEFEND",
    enemyId: troll.id,
    defenderId: defender.id,
  });
  flush(s);
  for (
    let i = 0;
    i < 20 && s.choice && !/Undersea Cave Troll/.test(s.choice.title);
    i++
  )
    s = choose(
      s,
      s.choice.options.find((o) => ["continue", "skip"].includes(o.id))?.id ??
        s.choice.options[0].id,
    );
  assert.match(s.choice!.title, /Undersea Cave Troll · Discard a resource/);
  const before = s.heroes.reduce((n, h) => n + h.resources, 0);
  for (
    let i = 0;
    i < 20 && s.choice && /Undersea Cave Troll/.test(s.choice.title);
    i++
  )
    s = choose(s, s.choice.options[0].id);
  const after = s.heroes.reduce((n, h) => n + h.resources, 0);
  assert.ok(before - after > 0);
  assert.ok(valid(s));
});

test("Nightmare: Sulfur Cloud surges away from Underwater locations; Underwater, the chosen number raises each player's threat and caps the progress Underwater locations receive this phase", () => {
  let s = board();
  setActive(s, N.passageJagged);
  s.encounterDeck = [N.sulfur, D.drowned];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  s = settle(s);
  assert.ok(
    s.staging.some((u) => u.code === D.drowned),
    "it surges",
  );
  s = board(2);
  const under = setActive(s, N.passageCrawlway, true);
  s.phase = "quest";
  s.encounterDeck = [N.sulfur];
  s.queue.push(fx("reveal", { player: 0 }));
  flush(s);
  assert.match(s.choice!.title, /Sulfur Cloud · Choose a number/);
  s = choose(s, "number-2");
  for (const p of [0, 1]) forOwner(s, p, () => assert.equal(s.threat, 22));
  const u = s.activeLocation!;
  progressLocation(s, u, 10);
  assert.equal(u.progress, 4);
  assert.equal(u.id, under.id);
  assert.ok(valid(s));
});

test("Nightmare: Flooded Caverns adds the Underwater active location's threat while staged; at the end of the quest phase it returns an Underwater location from the victory display to the Grotto deck, then returns to the staging area", () => {
  let s = board();
  const active = setActive(s, N.passageCrawlway, true);
  const flooded = add(s, N.flooded);
  assert.equal(threatOf(s, flooded), 2 + threatOf(s, active));
  // Active Flooded Caverns.
  s = board();
  const v = victory(s);
  s.staging.push(make(s, N.flooded));
  const f = s.staging.at(-1)!;
  s.staging = s.staging.filter((x) => x.id !== f.id);
  if (s.activeLocation) s.staging.push(s.activeLocation);
  s.activeLocation = f;
  drownedQuestEnd(s);
  flush(s);
  assert.match(
    s.choice!.title,
    /Flooded Caverns · Return an Underwater location/,
  );
  s = choose(s, v.id);
  const q = s.drowned!;
  assert.equal(q.grottoDeck.at(-1)!.id, v.id);
  assert.equal(q.grottoDeck.at(-1)!.code, drownedFront(q.originalCodes[v.id]));
  assert.ok(!s.victoryCards?.includes(v.code));
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === f.id));
  assert.ok(valid(s));
});

test("Nightmare: Pit into the Depths lowers each ally's willpower for the quest phase and flips a Grotto active location; its shadow leaves the attack undefended while Underwater", () => {
  let s = board();
  const active = setActive(s, N.passageJagged);
  active.progress = 3;
  const naasiyah = ally(s, D.naasiyahAlly);
  const will = stats(s, naasiyah).will;
  s.phase = "quest";
  revealed(s, N.pit);
  flush(s);
  s = settle(s);
  assert.equal(s.activeLocation!.code, N.passageJagged + ":B");
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(stats(s, ally(s, D.naasiyahAlly)).will, will - 1);
  s.phase = "planning";
  assert.equal(stats(s, ally(s, D.naasiyahAlly)).will, will);
  // Its shadow, Underwater.
  const enemy = engaged(s, D.drowned);
  s.combat = {
    enemyId: enemy.id,
    defenderId: s.heroes[0].id,
    defenderIds: [s.heroes[0].id],
    attackBonus: 0,
    attackPlayer: 0,
  };
  assert.ok(hooks(s).shadow!(s, N.pit));
  assert.deepEqual(s.combat.defenderIds, []);
});

test("Nightmare: Submerged Dead returns the other copies from the encounter discard pile while Underwater, and its shadow brings it into play there", () => {
  let s = board();
  setActive(s, N.passageCrawlway, true);
  s.encounterDiscard = [N.submerged, N.submerged, D.undertow];
  revealed(s, N.submerged);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === N.submerged).length, 3);
  assert.deepEqual(s.encounterDiscard, [D.undertow]);
  // Its shadow.
  const enemy = engaged(s, D.drowned);
  enemy.shadows = [N.submerged];
  enemy.revealedShadowCount = 1;
  s.combat = {
    enemyId: enemy.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    attackPlayer: 0,
  };
  assert.ok(hooks(s).shadow!(s, N.submerged));
  assert.equal(s.staging.filter((u) => u.code === N.submerged).length, 4);
  assert.deepEqual(get(s, enemy.id)!.shadows, []);
  assert.ok(valid(s));
});

test("Nightmare: The Drowned Ruins' lasting effects survive a reload, and invalid ones are rejected", () => {
  const s = board();
  s.nightmare = {
    drownedTreacheries: { round: s.round, count: 1 },
    drownedPit: { round: s.round, copies: 2 },
    drownedSulfur: { round: s.round, phase: "quest", cap: 4 },
  };
  assert.ok(valid(s));
  assert.deepEqual(reload(s).nightmare, s.nightmare);
  for (const bad of [
    { drownedTreacheries: { round: s.round + 1, count: 1 } },
    { drownedPit: { round: s.round, copies: 0 } },
    { drownedSulfur: { round: s.round, phase: "quest", cap: -1 } },
  ]) {
    const t = structuredClone(s);
    t.nightmare = bad;
    assert.ok(!valid(t), JSON.stringify(bad));
  }
});

test("Nightmare: The Drowned Ruins Nightmare games keep valid saves to their end", () => {
  for (const players of [1, 2])
    for (const seed of [3, 7, 11]) {
      const s = autoplay(opening(start(players, seed)), 3000);
      assert.ok(valid(s), `${players} players, seed ${seed}`);
    }
});
