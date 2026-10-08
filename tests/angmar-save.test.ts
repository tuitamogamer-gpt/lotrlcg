import test from "node:test";
import assert from "node:assert/strict";
import { createGame, validateSave, restoreSave } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { make } from "../src/game/core";
import { fx } from "../src/game/core";
import { CHETWOOD } from "../src/game/chetwood-support";
import { DREAD } from "../src/game/dread-realm-support";
import { ANGMAR } from "../src/game/angmar-player-support";
import { base as carnBase, enemy as carnEnemy } from "./carn-dum-fixtures";
import { base } from "./against-shadow-final-fixtures";
import type { ScenarioId } from "../src/game/types";

const ids: ScenarioId[] = [
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
];
const fields = [
  "wastesEriador",
  "mountGram",
  "ettenmoors",
  "rhudaur",
  "carnDum",
  "dreadRealm",
] as const;
for (const id of ids)
  for (const players of [1, 2, 3, 4])
    for (const easy of [false, true])
      test(`${id} ${players}-player ${easy ? "easy" : "normal"} initial save roundtrip`, () => {
        const d = STARTERS[0],
          s = createGame(41, d.cards, d.heroes, d.id, {
            scenarioId: id,
            easy,
            ...(players > 1
              ? {
                  seats: STARTERS.slice(0, players).map((d) => ({
                    deckId: d.id,
                    heroes: [...d.heroes],
                  })),
                }
              : {}),
          });
        assert.ok(validateSave(s));
        const json = JSON.parse(JSON.stringify(s));
        assert.deepEqual(restoreSave(json), s);
        const bad = structuredClone(s);
        delete bad[fields[ids.indexOf(id)]];
        assert.equal(validateSave(bad), false);
        const foreign = structuredClone(s);
        Object.assign(foreign, {
          [fields[(ids.indexOf(id) + 1) % ids.length]]: { initialized: false },
        });
        assert.equal(validateSave(foreign), false);
      });
test("Sword-thain physical ally validates in the hero zone and preserves attachments on reload", () => {
  const s = base("mirkwood"),
    u = make(s, "01014");
  u.attachments.push({
    id: `a${s.nextId++}`,
    code: ANGMAR.thain,
    exhausted: false,
  });
  s.heroes.push(u);
  assert.ok(validateSave(s));
  assert.ok(
    restoreSave(JSON.parse(JSON.stringify(s)))?.heroes.some(
      (h) => h.id === u.id,
    ),
  );
});
test("Favor of the Valar dial card keeps a unique physical identity and one-per-player limit", () => {
  const s = base("mirkwood");
  s.threatAttachments = [
    { id: `a${s.nextId++}`, code: ANGMAR.favor, exhausted: false },
  ];
  assert.ok(validateSave(s));
  const duplicate = structuredClone(s);
  duplicate.heroes[0].attachments.push({ ...duplicate.threatAttachments![0] });
  assert.equal(validateSave(duplicate), false);
  const two = structuredClone(s);
  two.threatAttachments!.push({
    ...two.threatAttachments![0],
    id: `a${two.nextId++}`,
  });
  assert.equal(validateSave(two), false);
  const code = structuredClone(s);
  code.threatAttachments![0].code = "01026";
  assert.equal(validateSave(code), false);
});
test("Reanimated Dead is one physical player card with a hidden face, never an extra encounter copy", () => {
  const d = STARTERS[0],
    s = createGame(42, d.cards, d.heroes, d.id, {
      scenarioId: "the-dread-realm",
    });
  const u = make(s, DREAD.reanimated);
  u.owner = 0;
  u.facedownCard = "01016";
  u.facedownCardId = u.id;
  s.engaged.push(u);
  assert.ok(validateSave(s));
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
  const missing = structuredClone(s);
  delete missing.engaged[0].facedownCard;
  assert.equal(validateSave(missing), false);
  const different = structuredClone(s);
  different.engaged[0].facedownCardId = "different";
  assert.equal(validateSave(different), false);
  const deck = structuredClone(s);
  deck.encounterDeck.push(DREAD.reanimated);
  assert.equal(validateSave(deck), false);
  const duplicate = structuredClone(s);
  const h = make(duplicate, "01016");
  h.id = u.id;
  duplicate.hand.push(h);
  assert.equal(validateSave(duplicate), false);
});
test("A paid physical card awaiting mandatory cost effects saves once outside all in-play zones", () => {
  const s = base("mirkwood"),
    unit = make(s, "01016");
  s.pendingPlayerPlays = [
    {
      unit,
      player: 0,
      target: s.heroes[0].id,
      effectiveCost: 1,
      played: true,
      fromHand: true,
      bottom: false,
      amount: 0,
    },
  ];
  assert.ok(validateSave(s));
  assert.deepEqual(restoreSave(JSON.parse(JSON.stringify(s))), s);
  const hand = structuredClone(s);
  hand.hand.push(structuredClone(unit));
  assert.equal(validateSave(hand), false);
  const event = structuredClone(s);
  event.resolvingEvents = [
    { unit: { ...unit, code: "01050" }, player: 0, destination: "discard" },
  ];
  assert.equal(validateSave(event), false);
  for (const change of [
    { player: 1 },
    { player: -1 },
    { effectiveCost: -1 },
    { effectiveCost: NaN },
    { effectiveCost: Infinity },
    { amount: -1 },
    { amount: Infinity },
    { played: "true" },
    { fromHand: undefined },
    { bottom: null },
    { target: 12 },
    { unit: { ...unit, code: "01082" } },
    { unit: { ...unit, owner: 2 } },
  ]) {
    const bad = structuredClone(s);
    Object.assign(bad.pendingPlayerPlays![0], change);
    assert.equal(validateSave(bad), false, JSON.stringify(change));
  }
});
test("Carn Dûm's attack history stores printed ally titles with duplicate copies", () => {
  const s = carnBase(),
    enemy = carnEnemy(s);
  s.combat = {
    enemyId: enemy.id,
    attackBonus: 0,
    carnKilledAllies: ["01016", "01016"],
  };
  assert.ok(validateSave(s));
  assert.deepEqual(
    restoreSave(JSON.parse(JSON.stringify(s)))?.combat?.carnKilledAllies,
    ["01016", "01016"],
  );
  for (const code of ["c123", "01001", "01082", "missing"])
    assert.equal(
      validateSave({ ...s, combat: { ...s.combat, carnKilledAllies: [code] } }),
      false,
    );
});
test("Hidden Wilderness hands require their physical host or its serialized rescue continuation", () => {
  const d = STARTERS[0],
    s = createGame(99, d.cards, d.heroes, d.id, {
      scenarioId: "the-dread-realm",
    });
  const host = make(s, CHETWOOD.wilderness),
    hidden = make(s, "01016");
  s.staging.push(host);
  s.encounterHiddenHands = { [host.id]: [hidden] };
  assert.ok(validateSave(s));
  const orphan = structuredClone(s);
  orphan.staging = orphan.staging.filter((u) => u.id !== host.id);
  assert.equal(validateSave(orphan), false);
  orphan.queue.push(
    fx("chetRescueCards", { target: host.id, code: host.code, player: 0 }),
  );
  assert.ok(validateSave(orphan));
  assert.ok(restoreSave(JSON.parse(JSON.stringify(orphan))));
  const foreign = structuredClone(s);
  foreign.staging[0].code = "01088";
  assert.equal(validateSave(foreign), false);
});
