import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../src/game/engine";
import { card } from "../src/game/cards";
import { make, stats } from "../src/game/core";
import { resolveReveal } from "../src/game/board";
import { flush } from "../src/game/effects";
import { KHAZAD as K } from "../src/game/khazad-dum";
import { REDHORN as R } from "../src/game/redhorn-gate";
import { ROAD } from "../src/game/road-rivendell";
import { LONG_DARK as L } from "../src/game/long-dark-support";
import { SHADOW_FLAME as F } from "../src/game/shadow-flame-support";
import { EMYN as E } from "../src/game/emyn-muil";
import { STEWARD_FEAR as S } from "../src/game/steward-fear-support";
import { MORGUL_VALE as M } from "../src/game/morgul-vale-support";
import { AMON_DIN as A } from "../src/game/amon-din-support";
import { CELEBRIMBOR as C } from "../src/game/celebrimbor-support";
import { ANTLERED as T } from "../src/game/antlered-support";
import { BLOOD_GONDOR as B } from "../src/game/blood-gondor-support";
import { DEPTHS_PLAYER as P } from "../src/game/depths-player-support";
import { base, reload } from "./against-shadow-final-fixtures";
import type { GameState, ScenarioId } from "../src/game/types";

interface Witness {
  scenario: ScenarioId;
  code: string;
  prepare?: (s: GameState) => void;
  choice?: string;
}

// Each witness meets the printed failure condition through real encounter
// resolution. The response must precede the additional encounter reveal.
const witnesses: Witness[] = [
  { scenario: "the-seventh-level", code: K.chance },
  { scenario: "the-seventh-level", code: K.devilry },
  { scenario: "the-seventh-level", code: K.caveIn },
  { scenario: "the-seventh-level", code: K.well },
  {
    scenario: "redhorn-gate",
    code: R.voices,
    prepare: (s) => s.allies.push(make(s, R.arwen)),
  },
  {
    scenario: "road-to-rivendell",
    code: ROAD.night,
    choice: "damage",
    prepare: (s) => {
      const arwen = make(s, ROAD.arwen);
      s.allies.push(arwen);
    },
  },
  {
    scenario: "the-long-dark",
    code: L.fatigue,
    prepare: (s) => s.heroes.forEach((u) => (u.exhausted = true)),
  },
  { scenario: "shadow-and-flame", code: F.fires },
  {
    scenario: "hills-of-emyn-muil",
    code: E.chasm,
    prepare: (s) => (s.emynMuilTreacherySeen = true),
  },
  { scenario: "the-stewards-fear", code: S.knife },
  { scenario: "the-morgul-vale", code: M.city },
  { scenario: "encounter-at-amon-din", code: A.ravager },
  { scenario: "encounter-at-amon-din", code: A.trapped },
  { scenario: "encounter-at-amon-din", code: A.panicked },
  { scenario: "celebrimbors-secret", code: C.desecrated },
  {
    scenario: "celebrimbors-secret",
    code: C.spies,
    prepare: (s) => s.heroes.forEach((u) => (u.exhausted = true)),
  },
  {
    scenario: "the-antlered-crown",
    code: T.back,
    prepare: (s) => s.allies.push(make(s, T.turch)),
  },
  {
    scenario: "the-antlered-crown",
    code: T.cry,
    prepare: (s) => s.allies.push(make(s, T.turch)),
  },
];

function lanwyn(scenario: ScenarioId) {
  const s = base(scenario);
  const hero = make(s, P.lanwyn);
  hero.resources = 10;
  hero.exhausted = true;
  s.heroes[0] = hero;
  s.startingHeroes = s.heroes.map((u) => u.code);
  s.phase = "staging";
  s.encounterDeck = Array(4).fill("01099");
  return { s, hero };
}

function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(s, { type: "CHOOSE", id });
}

for (const witness of witnesses) {
  test(`${card(witness.code).name}: printed gained Surge offers Lanwyn before revealing the additional card`, () => {
    assert.match(card(witness.code).text ?? "", /gains surge/i);
    let { s, hero } = lanwyn(witness.scenario);
    witness.prepare?.(s);
    resolveReveal(s, witness.code);
    flush(s);
    if (witness.choice) s = choose(s, witness.choice);
    assert.match(s.choice?.title ?? "", /Lanwyn/);
    assert.equal(
      s.encounterDeck.length,
      4,
      "mandatory effects finish before the extra reveal",
    );
    s = choose(s, "will");
    assert.equal(s.encounterDeck.length, 3);
    assert.equal(
      stats(
        s,
        s.heroes.find((u) => u.id === hero.id)!,
      ).will,
      4,
    );
    assert.equal(
      s.choice,
      null,
      "one physical card supplies one Lanwyn response",
    );
    assert.ok(s.staging.some((u) => u.code === "01099"));
  });
}

test("Emyn quest Surge and Chasm's gained Surge reveal two cards after one saved Lanwyn response", () => {
  let { s, hero } = lanwyn("hills-of-emyn-muil");
  s.emynMuilTreacherySeen = false;
  resolveReveal(s, E.chasm);
  flush(s);
  assert.match(s.choice?.title ?? "", /Lanwyn/);
  assert.equal(s.encounterDeck.length, 4);
  s = choose(reload(s), "will");
  assert.equal(s.encounterDeck.length, 2);
  assert.equal(s.staging.filter((u) => u.code === "01099").length, 2);
  assert.equal(
    stats(
      s,
      s.heroes.find((u) => u.id === hero.id)!,
    ).will,
    4,
  );
  assert.equal(s.choice, null);
  reload(s);
});

test("Crossroads printed and gained Surge create two extra reveals and one Lanwyn response", () => {
  let { s, hero } = lanwyn("the-blood-of-gondor");
  resolveReveal(s, B.conflict);
  flush(s);
  assert.match(s.choice?.title ?? "", /Lanwyn/);
  assert.equal(s.encounterDeck.length, 4, "both reveals follow the response");
  s = choose(s, "will");
  assert.equal(s.encounterDeck.length, 2);
  assert.equal(
    stats(
      s,
      s.heroes.find((u) => u.id === hero.id)!,
    ).will,
    4,
  );
  assert.equal(s.choice, null);
});

test("Ordinary additional encounter reveals do not trigger Lanwyn", () => {
  let { s, hero } = lanwyn("celebrimbors-secret");
  resolveReveal(s, C.scout);
  flush(s);
  assert.match(s.choice?.title ?? "", /Bellach/);
  s = choose(s, "reveal");
  assert.equal(s.encounterDeck.length, 3);
  assert.equal(s.choice, null);
  assert.equal(s.heroes.find((u) => u.id === hero.id)!.tempWill, undefined);
});

test("Cave In removing actual progress does not gain Surge or offer Lanwyn", () => {
  const { s, hero } = lanwyn("the-seventh-level");
  s.progress = 1;
  resolveReveal(s, K.caveIn);
  flush(s);
  assert.equal(s.progress, 0);
  assert.equal(s.encounterDeck.length, 4);
  assert.equal(s.choice, null);
  assert.equal(hero.tempWill, undefined);
});

test("Cancelling Cave In's When Revealed prevents its conditional Surge and Lanwyn response", () => {
  let { s, hero } = lanwyn("the-seventh-level");
  s.hand.push(make(s, "01050"));
  resolveReveal(s, K.caveIn);
  flush(s);
  assert.match(s.choice?.title ?? "", /Cave In/);
  s = choose(s, "cancel");
  assert.equal(s.encounterDeck.length, 4);
  assert.equal(s.choice, null);
  assert.equal(s.heroes.find((u) => u.id === hero.id)!.tempWill, undefined);
  assert.ok(s.encounterDiscard.includes(K.caveIn));
});
