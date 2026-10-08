import test from "node:test";
import assert from "node:assert/strict";
import { make, fx, get } from "../src/game/core";
import {
  damage,
  destroy,
  discardHandCard,
  discardLocation,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { seatView } from "../src/game/table";
import { GRAM as G } from "../src/game/mount-gram-support";
import { DREAD as D } from "../src/game/dread-realm-support";
import { ANGMAR as A } from "../src/game/angmar-player-support";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import { placeEncounter } from "../src/game/board";
import * as Angmar from "../src/game/angmar-player";
import {
  base as gramBase,
  captive,
  reload as gramReload,
} from "./mount-gram-fixtures";
import { base, reload } from "./dread-realm-fixtures";

for (const cancellation of [
  "roundCannotTakeDamage",
  "shadowCancelsDamage",
  "shadowCancelsCombatDamage",
] as const)
  test(`board: ${cancellation} prevents Cruel Torturer from capturing an ally`, () => {
    const s = gramBase(),
      enemy = make(s, G.torturer),
      ally = make(s, "01016");
    s.engaged.push(enemy);
    s.allies.push(ally);
    ally[cancellation] = true;
    assert.equal(
      damage(s, ally.id, 2, { combatDamage: true, enemyId: enemy.id }),
      false,
    );
    assert.ok(get(s, ally.id));
    assert.equal(ally.damage, 0);
    assert.equal(s.mountGram!.captured[enemy.id], undefined);
    gramReload(s);
  });

test("board: discarding a captured location rescues physical cards without exploring it", () => {
  const s = gramBase(),
    cell = make(s, G.cell);
  s.activeLocation = cell;
  const physical = captive(s, cell);
  discardLocation(s, cell);
  flush(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.encounterDiscard.includes(cell.code));
  assert.ok(s.hand.some((u) => u.id === physical.id));
  assert.equal(s.mountGram!.captured[cell.id], undefined);
  assert.equal(s.victory, 0);
  assert.equal(s.choice, null);
  gramReload(s);
});

test("board: discarding Sinister Dungeon does not trigger its exploration reanimation", () => {
  const s = base(),
    dungeon = make(s, D.dungeon),
    physical = make(s, "01016");
  s.activeLocation = dungeon;
  s.hand.push(physical);
  discardLocation(s, dungeon);
  flush(s);
  assert.ok(s.hand.some((u) => u.id === physical.id));
  assert.equal(s.engaged.length, 0);
  assert.ok(s.encounterDiscard.includes(D.dungeon));
  reload(s);
});

test("board: discarding a borrowed hand card binds its owner and physical identity for reanimation", () => {
  const s = base(2),
    physical = make(s, "01016");
  physical.owner = 1;
  s.hand.push(physical);
  discardHandCard(s, physical.id);
  assert.equal(seatView(s, 1).discard.at(-1), physical.code);
  handle(
    s,
    fx("dreadReanimateDiscard", { source: physical.id, owner: 1, player: 0 }),
  );
  flush(s);
  const enemy = s.engaged.find((u) => u.id === physical.id)!;
  assert.ok(enemy);
  assert.equal(enemy.owner, 1);
  assert.equal(enemy.facedownCardId, physical.id);
  assert.equal(seatView(s, 1).discard.length, 0);
  reload(s);
});

test("board: a Sword-thain hero leaves with its hero type after its attachment is discarded", () => {
  const s = base(),
    promoted = make(s, A.lindir);
  promoted.attachments.push({
    id: `a${s.nextId++}`,
    code: A.thain,
    exhausted: false,
  });
  s.allies.push(promoted);
  Angmar.angmarSyncSwordThain(s);
  s.threat = 40;
  Angmar.angmarEvent(s, A.rally);
  destroy(s, promoted);
  flush(s);
  assert.ok(s.discard.includes(A.lindir));
  assert.ok(!s.hand.some((u) => u.id === promoted.id));
  assert.ok(!s.queue.some((e) => e.kind === "angmarRallyReturn"));
  reload(s);
});

test("shared Angmar: an Angmar Orc cannot discard a promoted Sword-thain hero", () => {
  const s = base(),
    promoted = make(s, A.lindir);
  promoted.attachments.push({
    id: `a${s.nextId++}`,
    code: A.thain,
    exhausted: false,
  });
  s.allies.push(promoted);
  Angmar.angmarSyncSwordThain(s);
  placeEncounter(s, C.orc);
  flush(s);
  assert.ok(s.choice);
  assert.ok(
    !s.choice.options.some((o) =>
      o.effects.some((e) => e.target === promoted.id),
    ),
  );
  reload(s);
});

test("shared Angmar: Make Camp can offer healing when only a Sword-thain hero is wounded", () => {
  const s = base(),
    promoted = make(s, A.lindir);
  promoted.damage = 2;
  promoted.attachments.push({
    id: `a${s.nextId++}`,
    code: A.thain,
    exhausted: false,
  });
  s.allies.push(promoted);
  Angmar.angmarSyncSwordThain(s);
  handle(s, fx("weatherHealResponse"));
  flush(s);
  assert.match(s.choice!.title, /Make Camp/);
  assert.ok(s.choice!.options.some((o) => o.id === "heal"));
  reload(s);
});
