import assert from "node:assert/strict";
import test from "node:test";
import { card, STARTERS } from "../src/game/cards";
import { createGame, applyAction, validateSave } from "../src/game/engine";
import { get, make } from "../src/game/core";
import { advanceQuest, progressLocation } from "../src/game/board";
import { flush } from "../src/game/effects";
import { encounterCharacterEntered } from "../src/game/encounter-character-uniqueness";
import {
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import { COBAS_PLAYER as P } from "../src/game/cobas-player-support";
import { DEPTHS as D } from "../src/game/depths-support";
import { choose, reload } from "./against-shadow-final-fixtures";
import { drownedPlayerAttach as attach } from "./drowned-player-fixtures";
import type { GameState, ScenarioId } from "../src/game/types";

function opening(
  scenarioId: ScenarioId,
  players = 1,
  heroPlayer = 0,
  onlyHero = false,
  easy = false,
) {
  const deck = STARTERS[0],
    heroes = onlyHero ? [P.naasiyah] : [P.naasiyah, ...deck.heroes.slice(1)];
  return createGame(
    50,
    { ...deck.cards, ...STARTERS[1].cards },
    heroes,
    "custom",
    {
      scenarioId,
      easy,
      ...(players > 1
        ? {
            seats: STARTERS.slice(0, players).map((d, player) => ({
              deckId: d.id,
              heroes:
                player === heroPlayer
                  ? onlyHero
                    ? [P.naasiyah]
                    : [P.naasiyah, ...d.heroes.slice(1)]
                  : [...d.heroes],
            })),
          }
        : {}),
    },
  );
}
function finishSetup(s: GameState) {
  for (
    let n = 0;
    n < 150 && s.status === "playing" && (s.phase === "setup" || s.choice);
    n++
  ) {
    s = applyAction(
      s,
      s.choice
        ? {
            type: "CHOOSE",
            id:
              s.choice.options.find((o) =>
                ["skip", "continue", "resolve", "close"].includes(o.id),
              )?.id ?? s.choice.options[0].id,
          }
        : { type: "KEEP" },
    );
  }
  assert.ok(s.status !== "playing" || s.phase !== "setup", "setup terminates");
  return s;
}
function settle(s: GameState) {
  flush(s);
  for (let n = 0; n < 100 && s.status === "playing" && s.choice; n++)
    s = choose(
      reload(s),
      s.choice.options.find((o) =>
        ["skip", "continue", "resolve", "close"].includes(o.id),
      )?.id ?? s.choice.options[0].id,
    );
  return s;
}
const playerNaasiyah = (s: GameState) =>
  allCharacters(s).find((u) => u.code === P.naasiyah);
const encounterNaasiyah = (s: GameState) =>
  allCharacters(s).find((u) => u.code === D.naasiyahAlly);

for (const scenario of ["temple-of-the-deceived", "the-drowned-ruins"] as const)
  for (const easy of [false, true])
    test(`${scenario} ${easy ? "easy" : "normal"}: Na'asiyah remains a legal starting hero until the objective ally enters`, () => {
      let s = opening(scenario, 1, 0, false, easy);
      const hero = playerNaasiyah(s)!;
      assert.ok(hero, "the hero is accepted during deck/setup selection");
      const before = s.startingThreat,
        startingHeroes = [...s.startingHeroes];
      s = finishSetup(s);
      assert.equal(s.status, "playing");
      assert.equal(playerNaasiyah(s), undefined);
      assert.ok(encounterNaasiyah(s));
      assert.ok(s.discard.includes(P.naasiyah));
      assert.equal(s.startingThreat, before);
      assert.deepEqual(s.startingHeroes, startingHeroes);
      assert.equal(s.fallenThreat, card(P.naasiyah).threat);
      assert.equal(get(s, hero.id), undefined);
      assert.ok(validateSave(s));
      s = reload(s);
      assert.equal(playerNaasiyah(s), undefined);
      assert.ok(encounterNaasiyah(s));
    });

for (const scenario of ["temple-of-the-deceived", "the-drowned-ruins"] as const)
  test(`${scenario}: the table-wide conflict discards a remote player's hero while the last player keeps the objective ally`, () => {
    let s = opening(scenario, 3, 1);
    const before = seatView(s, 1).startingThreat;
    s = finishSetup(s);
    assert.equal(s.status, "playing");
    assert.equal(playerNaasiyah(s), undefined);
    assert.ok(seatView(s, 1).discard.includes(P.naasiyah));
    assert.equal(seatView(s, 1).startingThreat, before);
    assert.equal(ownerOf(s, encounterNaasiyah(s)!), 2);
    assert.ok(validateSave(s));
  });

test("Uniqueness discard routes a transferred hero and each attachment to their actual owners without destruction rewards", () => {
  let s = finishSetup(opening("mirkwood", 3));
  const hero = playerNaasiyah(s)!,
    originalThreat = seatView(s, 0).startingThreat;
  hero.owner = 0;
  hero.controller = 1;
  forOwner(s, 0, () => {
    s.heroes = s.heroes.filter((u) => u.id !== hero.id);
  });
  forOwner(s, 1, () => s.heroes.push(hero));
  attach(s, hero, "01040", 2);
  attach(s, hero, "01057", 0);
  const hornBearer = seatView(s, 2).heroes[0];
  attach(s, hornBearer, "01042", 2);
  const before = hornBearer.resources;
  const objective = make(s, D.naasiyahAlly);
  objective.owner = 2;
  objective.controller = 2;
  forOwner(s, 2, () => s.allies.push(objective));
  encounterCharacterEntered(s, objective);
  s = settle(s);
  assert.equal(playerNaasiyah(s), undefined);
  assert.ok(seatView(s, 0).discard.includes(P.naasiyah));
  assert.ok(seatView(s, 0).discard.includes("01057"));
  assert.ok(seatView(s, 2).discard.includes("01040"));
  assert.ok(!seatView(s, 1).discard.includes(P.naasiyah));
  assert.equal(
    get(s, hornBearer.id)!.resources,
    before,
    "a uniqueness discard does not trigger Horn of Gondor's destruction response",
  );
  assert.equal(seatView(s, 0).startingThreat, originalThreat);
});

test("Na'asiyah's enemy face and the hero coexist in Raid on the Grey Havens", () => {
  let s = opening("raid-on-the-grey-havens");
  s = finishSetup(s);
  assert.equal(s.status, "playing");
  assert.ok(playerNaasiyah(s));
  const enemy = make(s, D.naasiyah);
  s.staging.push(enemy);
  encounterCharacterEntered(s, enemy);
  assert.ok(playerNaasiyah(s));
  assert.ok(!s.discard.includes(P.naasiyah));
});

for (const players of [1, 3])
  test(`Depths ${players}p: Na'asiyah stays through stage one and is discarded only when her enemy face flips into an objective ally`, () => {
    let s = finishSetup(
      opening("the-thing-in-the-depths", players, players === 1 ? 0 : 1),
    );
    const hero = playerNaasiyah(s)!;
    assert.ok(hero);
    const owner = ownerOf(s, hero),
      before = seatView(s, owner).startingThreat;
    attach(s, hero, "01040", owner);
    s.phase = "staging";
    const helm = s.staging.find((u) => u.code === D.helm)!;
    progressLocation(s, helm, 100);
    s.staging.push(make(s, D.cargo));
    s.progress = 4;
    advanceQuest(s);
    s = settle(s);
    assert.equal(s.status, "playing");
    assert.equal(s.stage, 3);
    assert.equal(playerNaasiyah(s), undefined);
    assert.ok(encounterNaasiyah(s));
    assert.ok(seatView(s, owner).discard.includes(P.naasiyah));
    assert.ok(seatView(s, owner).discard.includes("01040"));
    assert.equal(seatView(s, owner).startingThreat, before);
    assert.ok(validateSave(s));
    s = reload(s);
    assert.equal(playerNaasiyah(s), undefined);
  });

for (const scenario of [
  "temple-of-the-deceived",
  "the-drowned-ruins",
] as const) {
  test(`${scenario}: losing the only starting hero to uniqueness ends a solo game`, () => {
    const s = finishSetup(opening(scenario, 1, 0, true));
    assert.equal(s.status, "lost");
    assert.equal(s.heroes.length, 0);
    assert.ok(s.discard.includes(P.naasiyah));
    assert.equal(s.startingThreat, card(P.naasiyah).threat);
    assert.equal(s.choice, null);
    assert.deepEqual(s.queue, []);
  });
  test(`${scenario}: a middle player's only Na'asiyah hero is eliminated and the other fellowships continue`, () => {
    const s = finishSetup(opening(scenario, 3, 1, true));
    assert.equal(s.status, "playing");
    assert.equal(s.table!.seats[1].eliminated, true);
    assert.deepEqual(playerOrder(s), [0, 2]);
    assert.ok(seatView(s, 1).discard.includes(P.naasiyah));
    assert.equal(ownerOf(s, encounterNaasiyah(s)!), 2);
  });
}
