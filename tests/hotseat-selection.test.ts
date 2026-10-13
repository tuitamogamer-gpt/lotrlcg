import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  hotseatCaseSelector,
  assertHotseatGameCounts,
} from "./hotseat-selection";

const root = fileURLToPath(new URL("..", import.meta.url));
const totals = (normal: number, easy: number) => ({
  normal: { won: 0, lost: normal },
  easy: { won: 0, lost: easy },
});

test("a malformed or empty hot-seat debug selector fails before any complete-game test can pass", () => {
  for (const value of ["", "normal/9/999"]) {
    const env = { ...process.env, LOTR_HOTSEAT_CASE: value };
    // A subprocess is a new runner, not a child-v8 worker of this runner.
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "--test-name-pattern=^hot-seat the-thing-in-the-depths normal: complete seeded games with save checks$",
        "tests/hotseat.test.ts",
      ],
      {
        cwd: root,
        env,
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stdout + result.stderr, /Invalid LOTR_HOTSEAT_CASE/);
  }
});

test("every bounded hot-seat selector requires one complete game and never accepts zero outcomes", () => {
  assert.equal(hotseatCaseSelector(undefined), undefined);
  for (const difficulty of ["normal", "easy"])
    for (const players of [1, 2, 3, 4])
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const selector = hotseatCaseSelector(
          `${difficulty}/${players}/${seed}`,
        );
        assert.throws(
          () => assertHotseatGameCounts("depths", selector, true, totals(0, 0)),
          /empty selection cannot pass/,
        );
        assert.doesNotThrow(() =>
          assertHotseatGameCounts(
            "depths",
            selector,
            true,
            totals(
              difficulty === "normal" ? 1 : 0,
              difficulty === "easy" ? 1 : 0,
            ),
          ),
        );
      }
  assert.throws(
    () => assertHotseatGameCounts("mirkwood", "easy/1/1", false, totals(0, 0)),
    /selects no available games/,
  );
});

test("the full hot-seat matrices still require all 32 normal and 32 easy games", () => {
  assert.doesNotThrow(() =>
    assertHotseatGameCounts("depths", undefined, true, totals(32, 32)),
  );
  assert.doesNotThrow(() =>
    assertHotseatGameCounts("mirkwood", undefined, false, totals(32, 0)),
  );
  assert.throws(() =>
    assertHotseatGameCounts("depths", undefined, true, totals(32, 31)),
  );
  assert.throws(() =>
    assertHotseatGameCounts("depths", undefined, true, totals(31, 32)),
  );
});
