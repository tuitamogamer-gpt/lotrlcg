import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAction,
  createGame,
  publicState,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { card, STARTERS } from "../src/game/cards";
import { fx, locationQuest, make } from "../src/game/core";
import {
  damage,
  discardLocation,
  progress,
  progressLocation,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { selectSeat, seatView, syncSeat } from "../src/game/table";
import {
  templeMapUnit,
  templeMapUnits,
  templePublicState,
  templeTravelCandidates,
  templeTravelStart,
} from "../src/game/temple";
import { TEMPLE as T, TEMPLE_LOST_FACES } from "../src/game/temple-support";
import {
  add,
  base,
  cell,
  choose,
  reload,
  setActive,
  setFace,
  settle,
  start,
} from "./temple-fixtures";

const layout = (s: ReturnType<typeof base>) => structuredClone(s.temple!.map);
const legalTravel = (s: ReturnType<typeof base>, target: string) => {
  s.phase = "travel";
  s.activeLocation!.progress = locationQuest(s, s.activeLocation!);
  templeTravelStart(s);
  return applyAction(reload(s), { type: "TRAVEL", id: target });
};

for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Temple original ${players}-seat ${easy ? "easy" : "standard"} setup conserves 15 permanent map cards`, () => {
      const s = start(players, easy, 50);
      assert.equal(s.encounterDeck.length, easy ? 25 : 32);
      assert.equal(s.temple!.setAside.length, 0);
      assert.equal(s.temple!.map.length, 15);
      assert.equal(templeMapUnits(s).length, 15);
      assert.equal(new Set(templeMapUnits(s).map((u) => u.id)).size, 15);
      assert.deepEqual(
        s.temple!.map.map((c) => [c.row, c.column]),
        Array.from({ length: 15 }, (_, i) => [Math.floor(i / 5), i % 5]),
      );
      assert.equal(
        Object.values(s.temple!.originalCodes).filter((c) => c === T.grotto)
          .length,
        1,
      );
      for (const code of [...TEMPLE_LOST_FACES, T.halls])
        assert.equal(
          Object.values(s.temple!.originalCodes).filter((c) => c === code)
            .length,
          2,
        );
      assert.equal(
        templeMapUnits(s).filter((u) => u.code === T.temple).length,
        3,
      );
      assert.equal(Object.keys(s.temple!.hiddenBacks).length, 13);
      assert.deepEqual(
        s.temple!.lookedBy,
        {},
        "starting flips suppress Jagged Cliffs' printed Forced look",
      );
      assert.equal(s.activeLocation!.id, cell(s, 0, 0).id);
      assert.ok(!s.activeLocation!.code.startsWith("temple-"));
      assert.ok(!cell(s, 2, 0).code.startsWith("temple-"));
      assert.ok(validateSave(s));
      assert.deepEqual(reload(s).temple!.map, s.temple!.map);
      assert.deepEqual(
        start(players, easy, 50).temple!.originalCodes,
        s.temple!.originalCodes,
        "the same seed reproduces every hidden physical side",
      );
    });

test("Temple opening hands may be saved before an active marker exists", () => {
  const d = STARTERS[0];
  const s = createGame(50, d.cards, d.heroes, d.id, {
    scenarioId: "temple-of-the-deceived",
  });
  assert.equal(s.phase, "setup");
  assert.equal(s.temple!.initialized, false);
  assert.equal(s.temple!.activeId, null);
  assert.equal(s.temple!.outOfStaging.length, 15);
  assert.equal(
    s.temple!.setAside.length,
    4,
    "the two reference rules cards are not playable Units",
  );
  assert.ok(validateSave(s));
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
});

test("Temple map staging is orthogonal, with Jagged and Jungle printed exclusions", () => {
  const s = base();
  let active = setActive(s, T.flooded);
  const neighbors = s.staging.filter((u) =>
    s.temple!.map.some((c) => c.id === u.id),
  );
  assert.deepEqual(
    new Set(neighbors.map((u) => u.id)),
    new Set([
      cell(s, 0, 1).id,
      cell(s, 2, 1).id,
      cell(s, 1, 0).id,
      cell(s, 1, 2).id,
    ]),
  );
  assert.ok(!neighbors.some((u) => u.id === cell(s, 0, 0).id));
  active = setActive(s, T.cliffs);
  assert.ok(!s.staging.some((u) => u.id === cell(s, 1, 2).id));
  assert.ok(s.staging.some((u) => u.id === cell(s, 0, 1).id));
  active = setActive(s, T.jungle);
  assert.ok(!s.staging.some((u) => u.id === cell(s, 0, 1).id));
  assert.ok(!s.staging.some((u) => u.id === cell(s, 2, 1).id));
  assert.ok(s.staging.some((u) => u.id === cell(s, 1, 2).id));
  assert.equal(s.activeLocation!.id, active.id);
  assert.ok(validateSave(s));
});

test("Temple reaching quest points retains active card and tokens; departure alone explores and clears", () => {
  let s = base();
  const old = setActive(s, T.flooded);
  const position = layout(s);
  const hidden = setFace(s, cell(s, 1, 2).id, T.cursed, true);
  hidden.progress = 6;
  progressLocation(s, old, 9);
  assert.equal(old.progress, 9);
  assert.equal(s.activeLocation!.id, old.id);
  assert.ok(!s.encounterDiscard.includes(T.flooded));
  s = legalTravel(s, hidden.id);
  s = settle(s);
  assert.equal(s.activeLocation!.id, hidden.id);
  assert.equal(s.activeLocation!.code, T.cursed);
  assert.equal(
    s.activeLocation!.progress,
    0,
    "flipping the destination clears its preloaded progress",
  );
  assert.equal(
    templeMapUnit(s, old.id)!.progress,
    0,
    "departure clears every old progress token",
  );
  assert.equal(templeMapUnit(s, old.id)!.code, T.flooded);
  assert.deepEqual(s.temple!.map, position);
  assert.equal(templeMapUnits(s).length, 15);
  assert.ok(validateSave(s));
});

test("Temple Winding Caverns permits three orthogonal steps without making remote cells staging", () => {
  let s = base();
  const active = setActive(s, T.caverns, 1, 0);
  const remote = setFace(s, cell(s, 1, 3).id, T.cursed, true);
  s.phase = "travel";
  active.progress = locationQuest(s, active);
  assert.ok(!s.staging.some((u) => u.id === remote.id));
  assert.ok(templeTravelCandidates(s).some((u) => u.id === remote.id));
  assert.ok(!templeTravelCandidates(s).some((u) => u.id === cell(s, 0, 3).id));
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: remote.id }));
  assert.equal(s.activeLocation!.id, remote.id);
  assert.equal(s.activeLocation!.code, T.cursed);
  assert.ok(validateSave(s));
});

test("Temple ordinary travel is once per phase even after the new location is completed", () => {
  let s = base();
  setActive(s, T.flooded);
  const destination = setFace(s, cell(s, 1, 2).id, T.cursed);
  s = settle(legalTravel(s, destination.id));
  s.activeLocation!.progress = 3;
  assert.equal(templeTravelCandidates(s).length, 0);
  assert.throws(
    () => applyAction(reload(s), { type: "TRAVEL", id: cell(s, 1, 1).id }),
    /already travelled/,
  );
  s.queue = [fx("startTravel")];
  flush(s);
  assert.equal(s.temple!.travelUsed, false);
  assert.ok(templeTravelCandidates(s).length > 0);
});

test("Temple guarded Gate Key cannot pay travel cost; claim preserves ID and charges exhaustion only", () => {
  let s = base();
  const active = setActive(s, T.caverns, 1, 3);
  const temple = cell(s, 1, 4);
  s.phase = "travel";
  active.progress = locationQuest(s, active);
  assert.ok(!templeTravelCandidates(s).some((u) => u.id === temple.id));
  const guardian = s.staging.find((u) => u.code === T.guardian)!;
  damage(s, guardian.id, 10); // Framework damage defeats the real physical guard.
  const key = s.staging.find((u) => u.code === T.key)!;
  const hero = s.heroes[0];
  const threat = s.threat;
  s = applyAction(reload(s), { type: "CLAIM", id: key.id, heroId: hero.id });
  assert.equal(s.threat, threat);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(
    s.heroes[0].attachments.find((a) => a.code === T.key)!.id,
    key.id,
  );
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: temple.id }));
  assert.ok(!s.activeLocation!.code.startsWith("temple-"));
  assert.equal(
    s.heroes[0].attachments.find((a) => a.code === T.key)!.exhausted,
    true,
  );
  assert.ok(validateSave(s));
});

test("Temple eighth Grotto progress wins immediately when not active, including a player card", () => {
  let s = base();
  setActive(s, T.flooded, 1, 3);
  const grotto = setFace(s, cell(s, 1, 4).id, T.grotto);
  assert.ok(!card(T.grotto).text?.includes("Immune"));
  grotto.progress = 7;
  s.phase = "planning";
  const scout = add(s, "01016", "hand"); // Snowbourn Scout's optional entry response.
  s = applyAction(reload(s), { type: "PLAY", id: scout.id });
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 20);
    const option =
      s.choice.options.find((o) => o.id === grotto.id) ??
      s.choice.options.find((o) => o.id === "resolve") ??
      s.choice.options[0];
    s = choose(reload(s), option.id);
  }
  assert.equal(s.status, "won");
  assert.equal(templeMapUnit(s, grotto.id)!.progress, 8);
  assert.equal(s.activeLocation!.code, T.flooded);
  assert.equal(s.choice, null);
  assert.ok(validateSave(s));
});

test("Temple main-quest progress may be divided among staging locations and retained on the quest", () => {
  let s = base();
  setActive(s, T.flooded);
  s.activeLocation!.progress = 5;
  const a = cell(s, 0, 1),
    b = cell(s, 2, 1);
  setFace(s, a.id, T.cursed, true);
  setFace(s, b.id, T.jungle, true);
  progress(s, 6);
  flush(s);
  s = choose(reload(s), `${a.id}:2`);
  s = choose(reload(s), `${b.id}:3`);
  s = choose(reload(s), "quest");
  assert.equal(templeMapUnit(s, a.id)!.progress, 2);
  assert.equal(templeMapUnit(s, b.id)!.progress, 3);
  assert.equal(s.progress, 1);
  assert.equal(
    s.status,
    "playing",
    "progress never completes the dash main quest",
  );
  assert.equal(s.activeLocation!.progress, 5);
  assert.ok(validateSave(s));
});

test("Temple private Lost Island look is saved for its owner, with no public choice/history leak", () => {
  let s = base(2);
  const hidden = cell(s, 0, 2);
  const face = s.temple!.hiddenBacks[hidden.id];
  hidden.progress = 4;
  s = applyAction(reload(s), { type: "ABILITY", id: hidden.id });
  assert.equal(s.choice!.options[0].label, "Close");
  assert.equal(
    s.choice!.options[0].code,
    face,
    "the actor can inspect the actual side",
  );
  const other = templePublicState(seatView(s, 1))!.cells.find(
    (c) => c.id === hidden.id,
  )!;
  assert.equal(other.looked, undefined);
  assert.equal(other.code, T.lost);
  assert.equal(other.image, "/cards/temple-lost-island.jpg");
  assert.equal(
    templePublicState(s)!.cells.find((c) => c.id === hidden.id)!.looked!.code,
    face,
  );
  const unauthorized = publicState(seatView(s, 1));
  assert.equal(unauthorized.choice!.options[0].label, "Close");
  s = choose(reload(s), "close");
  assert.equal(s.temple!.privateLook, null);
  assert.ok(
    !s.log.some(
      (l) => l.text.includes(card(face).name) && l.text.includes("Remember"),
    ),
  );
  selectSeat(s, 1);
  assert.equal(
    templePublicState(s)!.cells.find((c) => c.id === hidden.id)!.looked,
    undefined,
  );
  assert.ok(validateSave(s));
});

test("Temple Jagged Cliffs forced look grants communal knowledge without flipping adjacent cells", () => {
  let s = base(2);
  setActive(s, T.flooded);
  const cliff = setFace(s, cell(s, 1, 2).id, T.cliffs, true);
  s = settle(legalTravel(s, cliff.id));
  const neighbors = [cell(s, 0, 2), cell(s, 2, 2), cell(s, 1, 3)].filter(
    (u) => u.code === T.lost,
  );
  assert.ok(neighbors.length > 0);
  for (const viewer of [0, 1])
    for (const u of neighbors) {
      assert.ok(
        templePublicState(seatView(s, viewer))!.cells.find(
          (c) => c.id === u.id,
        )!.looked,
      );
      assert.equal(u.code, T.lost);
    }
  assert.ok(
    !s.staging.some((u) => u.id === cell(s, 1, 3).id),
    "the right neighbor is looked at even though Cliffs suppresses its staging status",
  );
  assert.ok(validateSave(s));
});

test("Temple map locations resist discard and make-active shortcuts without blanket immunity", () => {
  const s = base();
  const map = setFace(s, cell(s, 0, 2).id, T.cursed);
  const before = layout(s);
  assert.throws(() => discardLocation(s, map), /Island Map/);
  const activeId = s.activeLocation!.id;
  s.queue = [
    fx("travelEnter", { target: map.id, flag: true, text: "strider-replace" }),
  ];
  flush(s);
  assert.equal(
    s.activeLocation!.id,
    activeId,
    "a saved make-active continuation cannot move the marker",
  );
  progressLocation(s, map, 2);
  assert.equal(map.progress, 2);
  assert.deepEqual(s.temple!.map, before);
  assert.equal(templeMapUnits(s).length, 15);
  assert.ok(validateSave(s));
});

test("Temple remote Gate Key action pays its own hero, reveals privately and preserves the Key on hero death", () => {
  let s = base(2);
  const guardian = s.staging.find((u) => u.code === T.guardian)!;
  damage(s, guardian.id, 10);
  const key = s.staging.find((u) => u.code === T.key)!;
  selectSeat(s, 1);
  if (s.table) s.table.turn = 1;
  const heroId = s.heroes[0].id;
  s = applyAction(reload(s), { type: "CLAIM", id: key.id, heroId });
  s.heroes[0].exhausted = false; // Prepared action-window fixture after readiness.
  const resources = s.heroes[0].resources;
  const target = cell(s, 1, 4);
  const face = s.temple!.hiddenBacks[target.id];
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: heroId,
    attachmentId: key.id,
  });
  s = choose(reload(s), target.id);
  assert.equal(s.heroes[0].resources, resources - 3);
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(
    s.heroes[0].attachments.find((a) => a.id === key.id)!.exhausted,
    true,
  );
  assert.equal(
    templePublicState(s)!.cells.find((c) => c.id === target.id)!.looked!.code,
    face,
  );
  assert.equal(
    templePublicState(seatView(s, 0))!.cells.find((c) => c.id === target.id)!
      .looked,
    undefined,
  );
  s = choose(reload(s), "close");
  damage(s, heroId, 100);
  assert.equal(
    s.status,
    "playing",
    "the ordinary hero death leaves two heroes and both companions in play",
  );
  assert.equal(s.staging.filter((u) => u.code === T.key).length, 1);
  assert.equal(s.staging.find((u) => u.code === T.key)!.id, key.id);
  assert.ok(!s.encounterDiscard.includes(T.key));
  assert.ok(validateSave(s));
});

test("Temple revisit preserves a revealed face and requires no second flip or hidden-state leak", () => {
  let s = base();
  const old = setActive(s, T.flooded);
  const destination = setFace(s, cell(s, 1, 2).id, T.cursed, true);
  const fixed = layout(s);
  s = settle(legalTravel(s, destination.id));
  s.activeLocation!.progress = 3;
  s.queue = [fx("startTravel")];
  flush(s);
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: old.id }));
  assert.equal(s.activeLocation!.code, T.flooded);
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(templeMapUnit(s, destination.id)!.code, T.cursed);
  assert.equal(s.temple!.hiddenBacks[old.id], undefined);
  assert.equal(s.temple!.hiddenBacks[destination.id], undefined);
  assert.deepEqual(s.temple!.map, fixed);
  assert.ok(validateSave(s));
});

test("Temple Ancient Mathom responds on actual departure, retains its attachment, and ignores QP completion", () => {
  let s = base();
  const active = setActive(s, T.flooded);
  s.heroes[0].attachments.push({
    id: make(s, "02081").id,
    code: "02081",
    exhausted: false,
  });
  const mathom = add(s, "02056", "hand");
  s = applyAction(reload(s), {
    type: "PLAY",
    id: mathom.id,
    target: active.id,
  });
  const before = s.hand.length;
  progressLocation(s, s.activeLocation!, 5);
  flush(s);
  assert.equal(
    s.choice,
    null,
    "matching quest points is not an exploration event",
  );
  assert.equal(s.hand.length, before);
  const next = setFace(s, cell(s, 1, 2).id, T.cursed, true);
  s = legalTravel(s, next.id);
  assert.match(s.choice?.title ?? "", /Ancient Mathom/);
  s = choose(reload(s), "draw");
  assert.equal(s.hand.length, before + 3);
  assert.equal(
    templeMapUnit(s, active.id)!.attachments.find((a) => a.code === "02056")!
      .id,
    mathom.id,
  );
  assert.ok(validateSave(s));
});

test("Temple map/private physical schema rejects missing, duplicate, misplaced, forged and leaked copies", () => {
  const s = base(2);
  syncSeat(s);
  const mutations = [
    (x: typeof s) => x.temple!.map.pop(),
    (x: typeof s) => (x.temple!.map[0].id = x.temple!.map[1].id),
    (x: typeof s) => (x.temple!.map[1].column = 0),
    (x: typeof s) =>
      x.temple!.outOfStaging.push(structuredClone(x.temple!.outOfStaging[0])),
    (x: typeof s) => x.temple!.outOfStaging.pop(),
    (x: typeof s) => (x.temple!.originalCodes[x.temple!.map[0].id] = T.grotto),
    (x: typeof s) => (x.temple!.hiddenBacks[cell(x, 0, 2).id] = T.guardian),
    (x: typeof s) => (x.temple!.lookedBy[cell(x, 0, 2).id] = [2]),
    (x: typeof s) => (x.temple!.travelUsed = "yes" as unknown as boolean),
    (x: typeof s) =>
      (x.temple!.privateLook = { locationId: cell(x, 0, 2).id, player: 1 }),
    (x: typeof s) => x.encounterDeck.push(T.cliffs),
    (x: typeof s) => x.encounterDiscard.push(T.lost),
    (x: typeof s) => (x.victoryCards ??= []).push(T.grotto),
    (x: typeof s) =>
      x.temple!.victoryEnemies.push(
        structuredClone(x.staging.find((u) => u.code === T.guardian)!),
      ),
    (x: typeof s) => {
      const remote = x.temple!.outOfStaging.pop()!;
      x.staging.push(remote);
    },
  ];
  for (const mutate of mutations) {
    const damaged = structuredClone(s);
    mutate(damaged);
    assert.equal(validateSave(damaged), false);
    assert.equal(restoreSave(damaged), null);
  }
});
