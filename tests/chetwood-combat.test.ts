import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, validateSave, canTravel } from "../src/game/engine";
import { card } from "../src/game/cards";
import { make, fx, get, stats } from "../src/game/core";
import { check, revealed, placeEncounter } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  forOwner,
  seatView,
  startPhase,
  syncSeat,
} from "../src/game/table";
import { currentQuestCode } from "../src/game/quest-state";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import { chetwoodShadow } from "../src/game/chetwood";
import { base, choose, reload } from "./chetwood-fixtures";
import type { GameState, Unit } from "../src/game/types";

function enemy(s: GameState, code: string, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
function ally(s: GameState, code = "01016", player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.allies.push(u));
  return u;
}
function defend(s: GameState, e: Unit, d: Unit, shadows: string[] = []) {
  s.phase = "defense";
  e.shadows = shadows;
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: d.id,
  });
}
function settle(s: GameState) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 100, "decisions terminate");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}

test("Angmar Marauder returns only after its combat damage destroys an ally", () => {
  let s = base(),
    u = enemy(s, C.marauder),
    d = ally(s);
  s = settle(defend(s, u, d));
  assert.ok(s.staging.some((x) => x.id === u.id));
  assert.ok(!get(s, d.id));
  s = base();
  u = enemy(s, C.marauder);
  s.heroes[0].tempDefense = 10;
  s = settle(defend(s, u, s.heroes[0]));
  assert.ok(s.engaged.some((x) => x.id === u.id));
});
test("Angmar Orc shadow returns its attacker on an ally kill and discards that physical shadow once", () => {
  let s = base(),
    u = enemy(s, C.orc),
    d = ally(s);
  s = settle(defend(s, u, d, [C.orc]));
  assert.ok(s.staging.some((x) => x.id === u.id));
  assert.deepEqual(get(s, u.id)!.shadows, []);
  assert.equal(s.encounterDiscard.filter((c) => c === C.orc).length, 1);
  s = base();
  u = enemy(s, C.orc);
  s.heroes[0].tempDefense = 20;
  s = settle(defend(s, u, s.heroes[0], [C.orc]));
  assert.ok(s.engaged.some((x) => x.id === u.id));
});
test("Surprising Speed shadow returns a surviving attacker even when it kills nobody", () => {
  let s = base(),
    u = enemy(s, C.orc);
  s.heroes[0].tempDefense = 20;
  s = settle(defend(s, u, s.heroes[0], [C.speed]));
  assert.ok(s.staging.some((x) => x.id === u.id));
  assert.equal(s.encounterDiscard.filter((c) => c === C.speed).length, 1);
});
test("Angmar Captain discards from the attacked player's deck and repeats with a fresh shadow", () => {
  let s = base(2),
    u = enemy(s, C.captain, 1),
    d = ally(s, "01016", 1);
  forOwner(s, 1, () => {
    s.deck = ["01016", "01057"];
  });
  const firstDeck = [...s.deck];
  s.encounterDeck = [C.country];
  s.phase = "defense";
  forOwner(s, 1, () => {
    s.combat = null;
  });
  // The attacked fellowship remains responsible for the extra attack.
  s.table!.turn = 1;
  s = applyAction(reload(s), { type: "SELECT_SEAT", seat: 1 });
  s = defend(s, get(s, u.id)!, get(s, d.id)!);
  assert.match(s.choice!.title, /attack|defend/i);
  assert.equal(s.combat!.attackPlayer, 1);
  assert.deepEqual(get(s, u.id)!.shadows, [C.country]);
  assert.deepEqual(seatView(s, 1).deck, ["01057"]);
  assert.deepEqual(seatView(s, 0).deck, firstDeck);
  assert.ok(seatView(s, 1).discard.includes("01016"));
  assert.ok(validateSave(s));
});
test("Captain's additional attack is skipped when the discarded card is not an ally", () => {
  let s = base(),
    u = enemy(s, C.captain),
    d = ally(s);
  s.deck = ["01057", "01016"];
  s = settle(defend(s, u, d));
  assert.deepEqual(s.deck, ["01016"]);
  assert.ok(s.discard.includes("01057"));
  assert.equal(s.combat, null);
  assert.equal(s.phase, "attack");
});
for (const returnFirst of [false, true])
  test(`Captain and return shadow resolve in first-player order: return first = ${returnFirst}`, () => {
    let s = base(),
      u = enemy(s, C.captain),
      d = ally(s);
    s.deck = ["01016", "01057"];
    s.encounterDeck = [C.homestead];
    s = defend(s, u, d, [C.speed]);
    assert.match(s.choice!.title, /after-attack effect/);
    assert.equal(s.phase, "defense");
    const option = s.choice!.options.find(
      (o) => o.effects[0].kind === (returnFirst ? "chetReturn" : "chetCaptain"),
    )!;
    s = choose(reload(s), option.id);
    assert.match(s.choice!.title, /attack|defend/i);
    assert.equal(s.phase, "defense");
    assert.equal(
      s.staging.some((e) => e.id === u.id),
      returnFirst,
    );
    assert.deepEqual(get(s, u.id)!.shadows, [C.homestead]);
    s = choose(reload(s), s.heroes[0].id);
    s = settle(s);
    assert.ok(s.staging.some((e) => e.id === u.id));
    assert.equal(s.phase, "attack");
    assert.equal(s.encounterDiscard.filter((c) => c === C.speed).length, 1);
    assert.equal(s.encounterDiscard.filter((c) => c === C.homestead).length, 1);
  });
test("Chetwood Forest shadow offers only the defending player's ready heroes and preserves the choice on reload", () => {
  let s = base(2),
    u = enemy(s, C.orc),
    d = s.heroes[0];
  d.tempDefense = 20;
  s.heroes[2].exhausted = true;
  s = defend(s, u, d, [C.forest]);
  assert.match(s.choice!.title, /Exhaust a hero/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [s.heroes[1].id, "return"],
  );
  const chosen = s.heroes[1].id;
  s = choose(reload(s), chosen);
  s = settle(s);
  assert.equal(get(s, chosen)!.exhausted, true);
  assert.ok(s.engaged.some((e) => e.id === u.id));
});
test("Chetwood Forest shadow can return its attacker after the attack without exhausting another hero", () => {
  let s = base(),
    u = enemy(s, C.orc);
  s.heroes[0].tempDefense = 20;
  s = defend(s, u, s.heroes[0], [C.forest]);
  s = choose(reload(s), "return");
  s = settle(s);
  assert.ok(s.staging.some((e) => e.id === u.id));
  assert.equal(s.heroes[1].exhausted, false);
});
test("Rugged Country and Borders of Bree-land shadows count main plus every side quest", () => {
  const s = base(),
    u = enemy(s, C.orc),
    d = s.heroes[0];
  s.staging.push(make(s, C.rearguard), make(s, "09014"));
  s.combat = { enemyId: u.id, defenderId: d.id, attackBonus: 0 };
  chetwoodShadow(s, C.country);
  chetwoodShadow(s, C.borders);
  assert.equal(s.combat.attackBonus, 3);
  assert.equal(s.combat.defensePenalty, 3);
});
test("Angmar Marauder shadow counts allies controlled by the attacked player", () => {
  const s = base(2),
    u = enemy(s, C.orc, 1);
  ally(s);
  ally(s);
  ally(s, "01016", 1);
  s.combat = { enemyId: u.id, attackPlayer: 1, attackBonus: 0 };
  chetwoodShadow(s, C.marauder);
  assert.equal(s.combat.attackBonus, 1);
});
test("Weight of Responsibility shadow discards the defending player's main-quest, side-quest and character attachments", () => {
  let s = base(2),
    u = enemy(s, C.orc);
  s.heroes[0].tempDefense = 20;
  const q = make(s, C.rearguard);
  s.staging.push(q, make(s, "09014"));
  const main = {
    id: `a${s.nextId++}`,
    code: "10122",
    exhausted: false,
    owner: 0,
  };
  const side = {
    id: `a${s.nextId++}`,
    code: "10122",
    exhausted: false,
    owner: 0,
  };
  const own = {
    id: `a${s.nextId++}`,
    code: "01015",
    exhausted: false,
    owner: 0,
  };
  const other = {
    id: `a${s.nextId++}`,
    code: "01015",
    exhausted: false,
    owner: 1,
  };
  s.questAttachments = { [C.quest]: [main] };
  q.attachments.push(side);
  s.heroes[1].attachments.push(own);
  forOwner(s, 1, () => s.heroes[0].attachments.push(other));
  s = defend(s, u, s.heroes[0], [C.weight]);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id).sort(),
    [main.id, side.id, own.id].sort(),
  );
  s = choose(reload(s), main.id);
  s = choose(reload(s), side.id);
  s = choose(reload(s), own.id);
  assert.equal(s.questAttachments![C.quest]?.length ?? 0, 0);
  assert.equal(get(s, q.id)!.attachments.length, 0);
  assert.equal(seatView(s, 1).heroes[0].attachments[0].id, other.id);
});
test("Encounter side quests dealt as shadows have no When Revealed, Time or Iârion response", () => {
  let s = base(),
    u = enemy(s, C.orc);
  s.heroes[0].tempDefense = 20;
  s.allies[0].exhausted = true;
  s.hand.push(make(s, "01057"));
  s = settle(defend(s, u, s.heroes[0], [C.wilderness, C.rescue, C.ambush]));
  assert.equal(s.hand.length, 1);
  assert.equal(s.chetwood!.captive, undefined);
  assert.equal(s.staging.length, 0);
  assert.equal(s.allies[0].exhausted, true);
});
for (const phase of ["travel", "defense", "quest"] as const)
  test(`Pressing Needs selection during ${phase} lasts through that phase and survives reload`, () => {
    let s = base();
    s.phase = phase;
    if (phase === "defense") enemy(s, C.party); // Keep the defense window open.
    const q = make(s, C.wilderness);
    s.staging.push(q);
    revealed(s, C.needs);
    flush(s);
    s = choose(reload(s), q.id);
    assert.equal(currentQuestCode(s), C.wilderness);
    s = reload(s);
    addCurrentQuestProgress(s, 2);
    assert.equal(get(s, q.id)!.progress, 2);
    if (phase === "quest") {
      startPhase(s, "staging");
      assert.equal(currentQuestCode(s), C.wilderness);
    }
    startPhase(s, phase === "travel" ? "encounter" : "refresh");
    assert.equal(currentQuestCode(s), C.quest);
    assert.equal(s.sideQuestSelections, undefined);
  });
test("Borders copies let the first player order Forced effects and return different engaged enemies", () => {
  let s = base(2);
  const a = enemy(s, C.orc),
    b = enemy(s, C.marauder, 1);
  s.staging.push(make(s, C.borders), make(s, C.borders));
  handle(s, fx("startQuest"));
  flush(s);
  assert.match(s.choice!.title, /next Forced/);
  s = choose(reload(s), "order-1");
  s = choose(reload(s), b.id);
  s = choose(reload(s), a.id);
  assert.ok(s.staging.some((e) => e.id === a.id));
  assert.ok(s.staging.some((e) => e.id === b.id));
  assert.equal(
    seatView(s, 0).engaged.length + seatView(s, 1).engaged.length,
    0,
  );
});
test("Surprising Speed returns one enemy from each engaged player without raising threat or surging", () => {
  let s = base(3);
  const a = enemy(s, C.orc),
    b = enemy(s, C.marauder, 2);
  enemy(s, C.captain);
  revealed(s, C.speed);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(reload(s), "resolve");
  s = choose(reload(s), a.id);
  s = choose(reload(s), b.id);
  for (const p of [0, 1, 2]) assert.equal(seatView(s, p).threat, 20);
  assert.equal(s.staging.length, 2);
  assert.equal(s.encounterDeck.length, 30);
  assert.equal(seatView(s, 0).engaged.length, 1);
});
test("Surprising Speed gains Doomed and Surge only when no enemy can return", () => {
  let s = base(2);
  s.encounterDeck = [C.country];
  revealed(s, C.speed);
  s = settle(s);
  for (const p of [0, 1]) assert.equal(seatView(s, p).threat, 21);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [C.country],
  );
});
test("Sudden Assault shuffles its own card and the discard pile when willpower is insufficient", () => {
  let s = base();
  s.encounterDiscard = [C.country];
  s.encounterDeck = [C.forest];
  revealed(s, C.assault);
  s = settle(s);
  assert.deepEqual(
    s.encounterDeck.slice().sort(),
    [C.assault, C.country, C.forest].sort(),
  );
  assert.deepEqual(s.encounterDiscard, []);
});
test("Sudden Assault checks committed willpower and attacks the first player from staging with fresh shadows", () => {
  let s = base(2);
  const a = make(s, C.orc),
    b = make(s, C.marauder);
  s.staging.push(a, b);
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 20;
  s.heroes[0].exhausted = true;
  s.heroes[1].tempDefense = 10;
  s.heroes[2].tempDefense = 10;
  s.encounterDeck = [C.homestead, C.homestead];
  revealed(s, C.assault);
  flush(s);
  assert.equal(s.combat!.attackPlayer, 0);
  assert.equal(s.combat!.enemyId, a.id);
  assert.deepEqual(get(s, a.id)!.shadows, [C.homestead]);
  s = choose(reload(s), s.heroes[1].id);
  assert.equal(s.combat!.enemyId, b.id);
  s = choose(reload(s), s.heroes[2].id);
  assert.equal(s.combat, null);
  assert.equal(s.phase, "planning");
  assert.equal(s.encounterDiscard.filter((c) => c === C.homestead).length, 2);
  assert.ok(s.encounterDiscard.includes(C.assault));
  assert.equal(s.staging.length, 2);
});
test("Sudden Assault shuffles when every staged attack is prevented", () => {
  let s = base();
  const u = make(s, C.orc);
  u.feinted = true;
  s.staging.push(u);
  s.heroes[0].committed = true;
  s.heroes[0].tempWill = 20;
  s.encounterDeck = [];
  revealed(s, C.assault);
  s = settle(s);
  assert.ok(s.encounterDeck.includes(C.assault));
  assert.equal(s.combat, null);
});
test("Weight of Responsibility reveals one encounter per quest in play, including player side quests", () => {
  let s = base();
  s.staging.push(make(s, C.rearguard), make(s, "09014"));
  s.encounterDeck = [C.country, C.homestead, C.country, C.forest];
  revealed(s, C.weight);
  s = settle(s);
  assert.deepEqual(s.encounterDeck, [C.forest]);
  assert.equal(s.staging.length, 5);
  assert.equal(s.threat, 21);
});
test("Chetwood Forest travel is blocked without an enemy and can make another player engage to pay its cost", () => {
  let s = base(2);
  s.phase = "travel";
  const location = make(s, C.forest);
  s.staging.push(location);
  assert.match(canTravel(s, location)!, /requires/);
  const u = make(s, C.orc);
  s.staging.push(u);
  assert.equal(canTravel(s, location), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: location.id });
  assert.equal(s.activeLocation, null);
  s = choose(reload(s), `1-${u.id}`);
  assert.equal(s.activeLocation!.id, location.id);
  assert.ok(seatView(s, 1).engaged.some((e) => e.id === u.id));
});
test("Outlying Homestead travel resolves the revealed card while the threat reduction lock is still staged", () => {
  let s = base();
  s.phase = "travel";
  const location = make(s, C.homestead);
  s.staging.push(location);
  s.encounterDeck = [C.orc];
  s = applyAction(reload(s), { type: "TRAVEL", id: location.id });
  assert.match(s.choice!.title, /Angmar Orc/);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.id === location.id));
  s = choose(reload(s), "reveal");
  s = settle(s);
  assert.equal(s.activeLocation!.id, location.id);
});
test("Lost in the Wilderness never restores an eliminated player's hidden cards", () => {
  let s = base(2);
  const hidden = make(s, "01057");
  hidden.owner = 1;
  forOwner(s, 1, () => s.hand.push(hidden));
  revealed(s, C.wilderness);
  s = settle(s);
  const q = s.staging[0];
  forOwner(s, 1, () => {
    s.threat = 50;
  });
  check(s);
  assert.equal(s.table!.seats[1].eliminated, true);
  assert.equal(s.chetwood!.hiddenHands[q.id].length, 0);
  assert.ok(seatView(s, 1).removed.includes(hidden.code));
  assert.ok(validateSave(s));
});
test("Iârion follows the first-player token when its controller is eliminated without leaving play", () => {
  const s = base(2),
    iarion = s.allies[0];
  iarion.damage = 2;
  s.threat = 50;
  check(s);
  assert.equal(s.status, "playing");
  assert.equal(s.table!.first, 1);
  assert.equal(
    seatView(s, 1).allies.find((u) => u.code === C.iarion)!.id,
    iarion.id,
  );
  assert.equal(get(s, iarion.id)!.damage, 2);
  assert.equal(get(s, iarion.id)!.controller, 1);
  assert.ok(!s.encounterDiscard.includes(C.iarion));
  syncSeat(s);
  assert.ok(validateSave(s));
});
test("Save validation rejects an encounter card disguised as a hidden hand card and invalid selection phases", () => {
  const s = base(),
    u = make(s, C.orc);
  u.owner = 0;
  s.chetwood!.hiddenHands.bad = [u];
  assert.equal(validateSave(s), false);
  s.chetwood!.hiddenHands = {};
  const q = make(s, C.rearguard);
  s.staging.push(q);
  s.sideQuestSelections = {
    shared: { id: q.id, code: q.code, phase: "invalid" as never },
  };
  assert.equal(validateSave(s), false);
});
