import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, canPlay } from "../src/game/engine";
import { fx, get, make, prepend, stats } from "../src/game/core";
import { damage, engage, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import { activeSeat, forOwner, seatView, selectSeat } from "../src/game/table";
import {
  haradCharactersCommitted,
  haradDefendersDeclared,
  haradWellWarnedCondition,
  haradWhenRevealedOptions,
} from "../src/game/harad-player-responses";
import { HARAD_PLAYER as P } from "../src/game/harad-player-support";
import { CHETWOOD } from "../src/game/chetwood-support";
import { FORDS } from "../src/game/fords-isen-support";
import {
  haradPlayerFixture as fixture,
  haradPlayerAlly as ally,
  haradPlayerHand as hand,
  haradPlayerAttach as attach,
} from "./harad-player-fixtures";
import { choose, reload } from "./against-shadow-final-fixtures";
import type { GameState } from "../src/game/types";

const select = (s: GameState, id: string) => choose(reload(s), id);
function settle(s: GameState) {
  for (let n = 0; n < 50 && s.choice; n++)
    s = select(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options.find((o) => o.id === "resolve")?.id ??
        s.choice.options[0].id,
    );
  assert.equal(s.choice, null);
  return s;
}
function gimliOffer(s: GameState) {
  const enemy = make(s, "01089");
  prepend(s, ...haradDefendersDeclared(s, enemy, [s.heroes[0]]));
  flush(s);
  return s;
}
function legolasOffer(s: GameState) {
  const hero = s.heroes[1];
  hero.committed = true;
  haradCharactersCommitted(s, [hero.id]);
  flush(s);
  return s;
}

test("Gimli responds to actual defender declaration, spends his own pool and readies Legolas with a lasting attack bonus", () => {
  let s = fixture();
  const gimli = s.heroes[0],
    legolas = s.heroes[1],
    enemy = make(s, "01089");
  s.phase = "defense";
  s.engaged = [enemy];
  legolas.exhausted = true;
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: gimli.id,
  });
  assert.match(s.choice!.title, /Gimli/);
  s = select(s, legolas.id);
  s = settle(s);
  assert.equal(get(s, gimli.id)!.resources, 9);
  assert.equal(get(s, legolas.id)!.resources, 10);
  assert.equal(get(s, legolas.id)!.exhausted, false);
  assert.equal(stats(s, get(s, legolas.id)!).attack, 4);
  assert.equal(get(s, gimli.id)!.exhausted, true);
  assert.ok(s.used.some((key) => key.startsWith(`phase:harad:${P.gimli}:`)));
  phaseEnd(s);
  assert.equal(stats(s, get(s, legolas.id)!).attack, 3);
  assert.ok(!s.used.some((key) => key.startsWith("phase:harad:")));
});

test("Gimli cannot use another hero's resources, cannot ready himself, and cannot respond while blanked", () => {
  for (const variant of ["empty", "blanked"] as const) {
    const s = fixture(),
      gimli = s.heroes[0];
    s.heroes[1].exhausted = true;
    if (variant === "empty") gimli.resources = 0;
    else gimli.blanked = true;
    gimliOffer(s);
    assert.equal(s.choice, null);
  }
  const s = gimliOffer(fixture());
  assert.ok(s.choice!.options.every((o) => o.id !== s.heroes[0].id));
});

test("Gimli can ready a remote hero; the named bonus recognizes other printings of Legolas", () => {
  let s = fixture(2);
  s.heroes[1].code = "08056";
  const remote = seatView(s, 1).heroes[0];
  remote.code = "01005";
  remote.exhausted = true;
  const before = stats(s, remote).attack;
  s = gimliOffer(s);
  s = select(s, remote.id);
  assert.equal(get(s, remote.id)!.exhausted, false);
  assert.equal(stats(s, get(s, remote.id)!).attack, before + 1);
  assert.equal(get(s, s.heroes[0].id)!.resources, 9);
});

test("Gimli's optional decline spends nothing and his response is limited once per phase", () => {
  let s = gimliOffer(fixture());
  const gimli = s.heroes[0],
    legolas = s.heroes[1];
  s = select(s, "skip");
  assert.equal(get(s, gimli.id)!.resources, 10);
  s = gimliOffer(s);
  s = select(s, legolas.id);
  s = gimliOffer(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, gimli.id)!.resources, 9);
});

test("The independent named-hero bonuses can change a ready partner without a successful ready", () => {
  let s = gimliOffer(fixture());
  const legolas = s.heroes[1];
  assert.equal(legolas.exhausted, false);
  s = select(s, legolas.id);
  assert.equal(stats(s, get(s, legolas.id)!).attack, 4);
  const discard = hand(s, "01050");
  s = legolasOffer(s);
  s = select(s, s.heroes[0].id);
  s = select(s, discard.id);
  assert.equal(stats(s, s.heroes[0]).will, 3);
});

test("Legolas responds after native quest commitment, discards exactly the chosen physical hand card and grants Gimli willpower", () => {
  let s = fixture();
  s.phase = "quest";
  const gimli = s.heroes[0],
    legolas = s.heroes[1];
  gimli.exhausted = true;
  const discarded = hand(s, "01050"),
    kept = hand(s, "01050");
  s.committedIds = [legolas.id];
  s = applyAction(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /Legolas/);
  s = select(s, gimli.id);
  assert.match(s.choice!.title, /hand to discard/);
  s = select(s, discarded.id);
  s = settle(s);
  assert.equal(get(s, gimli.id)!.exhausted, false);
  assert.equal(stats(s, get(s, gimli.id)!).will, 3);
  assert.equal(get(s, legolas.id)!.committed, true);
  assert.equal(get(s, legolas.id)!.exhausted, true);
  assert.ok(!s.hand.some((u) => u.id === discarded.id));
  assert.ok(s.hand.some((u) => u.id === kept.id));
  assert.equal(s.discard.filter((code) => code === "01050").length, 1);
});

test("Legolas may ready another player's Gimli and uses only his own controller's hand", () => {
  let s = fixture(2);
  s.heroes[0].code = "08025";
  const remote = seatView(s, 1).heroes[2];
  remote.code = "01004";
  remote.exhausted = true;
  const discarded = hand(s, "01050"),
    foreign = hand(s, "01051", 1);
  s = legolasOffer(s);
  s = select(s, remote.id);
  assert.ok(s.choice!.options.some((o) => o.id === discarded.id));
  assert.ok(!s.choice!.options.some((o) => o.id === foreign.id));
  s = select(s, discarded.id);
  assert.equal(get(s, remote.id)!.exhausted, false);
  assert.equal(stats(s, get(s, remote.id)!).will, 3);
  assert.equal(seatView(s, 1).hand[0].id, foreign.id);
});

test("Legolas neither discards protected Ill Tidings nor initiates without an available hand card", () => {
  const s = fixture();
  hand(s, FORDS.tidings);
  legolasOffer(s);
  assert.equal(s.choice, null);
  assert.equal(s.hand.length, 1);
});

test("Legolas can decline, is limited once per phase, and resets at the next phase", () => {
  let s = fixture();
  const discarded = hand(s, "01050"),
    second = hand(s, "01051");
  s = legolasOffer(s);
  s = select(s, "skip");
  assert.equal(s.hand.length, 2);
  s = legolasOffer(s);
  s = select(s, s.heroes[0].id);
  s = select(s, discarded.id);
  s = legolasOffer(s);
  assert.equal(s.choice, null);
  phaseEnd(s);
  s = legolasOffer(s);
  s = select(s, s.heroes[0].id);
  s = select(s, second.id);
  assert.equal(s.hand.length, 0);
});

test("Well Warned requires two distinct unique characters controlled by its caster", () => {
  const s = fixture(2);
  assert.equal(haradWellWarnedCondition(s, 0), true);
  assert.equal(haradWellWarnedCondition(s, 1), false);
  s.heroes = [s.heroes[1]];
  assert.equal(
    haradWellWarnedCondition(s, 0),
    false,
    "one unique Noble Scout cannot supply both distinct characters",
  );
  ally(s, "08028");
  assert.equal(haradWellWarnedCondition(s, 0), true);
});

test("Well Warned responds to another player's real engagement and reduces that player's threat by printed threat", () => {
  let s = fixture(2);
  const event = hand(s, P.wellWarned),
    enemy = make(s, "01089");
  enemy.tempThreat = 7;
  const printed = 2;
  s.staging = [enemy];
  selectSeat(s, 1);
  const remoteBefore = s.threat;
  engage(s, enemy);
  flush(s);
  assert.equal(activeSeat(s), 0);
  assert.match(s.choice!.title, /Well Warned/);
  s = select(s, event.id);
  s = settle(s);
  assert.equal(seatView(s, 1).threat, remoteBefore - printed);
  assert.equal(seatView(s, 0).threat, 20);
  assert.ok(seatView(s, 0).discard.includes(P.wellWarned));
});

test("Every physical Well Warned may respond to the same engagement and a declined copy remains in hand", () => {
  let s = fixture();
  const first = hand(s, P.wellWarned),
    second = hand(s, P.wellWarned),
    enemy = make(s, "01089");
  s.staging = [enemy];
  engage(s, enemy);
  flush(s);
  s = select(s, first.id);
  assert.match(s.choice!.title, /Well Warned/);
  s = select(s, second.id);
  assert.equal(s.threat, 16);
  assert.equal(s.discard.filter((c) => c === P.wellWarned).length, 2);
  const third = hand(s, P.wellWarned),
    other = make(s, "01089");
  s.staging = [other];
  engage(s, other);
  flush(s);
  s = select(s, "skip");
  assert.ok(s.hand.some((u) => u.id === third.id));
});

test("Well Warned remains response-only, does not borrow remote prerequisites, and honors threat-reduction prevention", () => {
  let s = fixture(2);
  const event = hand(s, P.wellWarned, 1);
  forOwner(s, 1, () =>
    assert.match(canPlay(s, event)!, /responds|response window/),
  );
  const enemy = make(s, "01089");
  s.staging = [enemy];
  engage(s, enemy);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(seatView(s, 1).hand.some((u) => u.id === event.id));
  const eligible = hand(s, P.wellWarned),
    other = make(s, "01089");
  s.staging = [other, make(s, CHETWOOD.homestead)];
  engage(s, other);
  flush(s);
  s = select(s, eligible.id);
  assert.equal(s.threat, 20);
});

test("Dwarven Shield responds only after actual surviving enemy combat damage and its pending exhaustion survives save", () => {
  let s = fixture();
  const hero = s.heroes[0],
    attachment = attach(s, hero, P.shield),
    enemy = make(s, "01082");
  s.engaged = [enemy];
  const before = hero.resources;
  damage(s, hero.id, 2, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.match(s.choice!.title, /Dwarven Shield/);
  assert.equal(get(s, hero.id)!.damage, 2);
  s = select(s, "use");
  assert.equal(get(s, hero.id)!.resources, before + 1);
  assert.equal(
    get(s, hero.id)!.attachments.find((a) => a.id === attachment.id)!.exhausted,
    true,
  );
  damage(s, hero.id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(s.choice, null);
});

test("Dwarven Shield can decline and its remote host controller chooses while physical ownership remains unchanged", () => {
  let s = fixture(2);
  const hero = seatView(s, 1).heroes[0],
    a = attach(s, hero, P.shield, 0),
    enemy = make(s, "01089");
  hero.code = "02116";
  forOwner(s, 1, () => {
    s.engaged = [enemy];
  });
  damage(s, hero.id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  assert.equal(activeSeat(s), 1);
  s = select(s, "skip");
  assert.equal(get(s, hero.id)!.resources, 10);
  assert.equal(get(s, hero.id)!.attachments[0].exhausted, false);
  damage(s, hero.id, 1, { enemyId: enemy.id, combatDamage: true });
  flush(s);
  s = select(s, "use");
  assert.equal(get(s, hero.id)!.resources, 11);
  assert.equal(seatView(s, 0).heroes[0].resources, 10);
  assert.equal(
    get(s, hero.id)!.attachments.find((attachment) => attachment.id === a.id)!
      .owner,
    0,
  );
});

test("Dwarven Shield ignores prevented, non-attack, zero and lethal damage", () => {
  for (const variant of [
    "prevented",
    "non-attack",
    "zero",
    "lethal",
  ] as const) {
    const s = fixture(),
      hero = s.heroes[0],
      _shield = attach(s, hero, P.shield),
      enemy = make(s, "01089");
    s.engaged = [enemy];
    if (variant === "prevented") hero.roundCannotTakeDamage = true;
    damage(
      s,
      hero.id,
      variant === "zero" ? 0 : variant === "lethal" ? 5 : 1,
      variant === "non-attack"
        ? { enemyId: enemy.id }
        : { enemyId: enemy.id, combatDamage: true },
    );
    flush(s);
    assert.ok(!s.choice?.title.includes("Dwarven Shield"), variant);
  }
});

test("Halfling Bounder requires a side quest in victory, accepts either side-quest type and ignores underworld cards", () => {
  const s = fixture(),
    bounder = ally(s, P.bounder),
    continuation = fx("placeEncounter", {
      code: "02023",
      text: "revealed",
      revealOrigin: "encounter",
    });
  assert.equal(haradWhenRevealedOptions(s, "02023", continuation).length, 0);
  for (const side of ["09014", "octgn:85eb724c-a258-4d94-83ba-5e9f21d82491"]) {
    s.victoryCards = [side];
    const options = haradWhenRevealedOptions(s, "02023", continuation);
    assert.ok(options.some((o) => o.id === `bounder-${bounder.id}`));
  }
  assert.equal(
    haradWhenRevealedOptions(s, "02023", {
      ...continuation,
      revealOrigin: "underworld",
    }).length,
    0,
  );
});

test("Halfling Bounder's real cancellation discards the physical ally and preserves independent Surge", () => {
  let s = fixture();
  const bounder = ally(s, P.bounder);
  s.victoryCards = ["09014"];
  s.encounterDeck = ["02023", "01099"];
  const river = make(s, "02017");
  river.progress = 2;
  s.staging = [river];
  prepend(s, fx("reveal"));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `bounder-${bounder.id}`));
  s = select(s, `bounder-${bounder.id}`);
  s = settle(s);
  assert.equal(get(s, bounder.id), undefined);
  assert.ok(s.discard.includes(P.bounder));
  assert.ok(s.encounterDiscard.includes("02023"));
  assert.equal(s.threat, 21, "printed Doomed survives cancellation");
  assert.equal(
    get(s, river.id)!.progress,
    2,
    "the canceled When Revealed cannot remove progress",
  );
  assert.ok(
    s.staging.some((u) => u.code === "01099"),
    "printed Surge still reveals the next physical card",
  );
});

test("Halfling Bounder can cancel another player's encounter card while its controller pays the discard", () => {
  let s = fixture(2);
  const bounder = ally(s, P.bounder, 1);
  s.victoryCards = ["09014"];
  s.encounterDeck = ["01117"];
  prepend(s, fx("reveal"));
  flush(s);
  s = select(s, `bounder-${bounder.id}`);
  s = settle(s);
  assert.equal(get(s, bounder.id), undefined);
  assert.ok(seatView(s, 1).discard.includes(P.bounder));
  assert.ok(!seatView(s, 0).discard.includes(P.bounder));
});

test("Halfling Bounder also cancels an encounter side quest's When Revealed while leaving its physical side quest in staging", () => {
  let s = fixture();
  const bounder = ally(s, P.bounder),
    kept = hand(s, "01050"),
    side = CHETWOOD.wilderness;
  s.victoryCards = ["09014"];
  s.encounterDeck = [side];
  prepend(s, fx("reveal"));
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === `bounder-${bounder.id}`));
  s = select(s, `bounder-${bounder.id}`);
  s = settle(s);
  assert.ok(s.hand.some((u) => u.id === kept.id));
  assert.ok(s.staging.some((u) => u.code === side));
  assert.ok(s.discard.includes(P.bounder));
});

test("Dwarven Shield's printed defense applies before a real enemy attack and the damage response follows Gimli's declaration response", () => {
  let s = fixture();
  s.phase = "defense";
  const hero = s.heroes[0],
    a = attach(s, hero, P.shield),
    enemy = make(s, "01082");
  s.engaged = [enemy];
  s = applyAction(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: hero.id,
  });
  assert.match(s.choice!.title, /Gimli/);
  assert.equal(get(s, hero.id)!.damage, 0);
  s = select(s, "skip");
  assert.match(s.choice!.title, /Dwarven Shield/);
  assert.equal(get(s, hero.id)!.damage, 3);
  s = select(s, "use");
  s = settle(s);
  assert.equal(get(s, hero.id)!.resources, 11);
  assert.equal(
    get(s, hero.id)!.attachments.find((attachment) => attachment.id === a.id)!
      .exhausted,
    true,
  );
});
