import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
function manifest(index: number, count: number) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "tests/simulation.test.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        SIMULATION_SHARD: String(index),
        SIMULATION_SHARDS: String(count),
        SIMULATION_LIST_ONLY: "1",
      },
      encoding: "utf8",
    },
  );
}
test("four CI simulation shards cover every registered complete-game case exactly once", () => {
  const full = manifest(0, 1);
  assert.equal(full.status, 0, full.stderr);
  const baseline = JSON.parse(full.stdout);
  assert.ok(baseline.registeredCases > 100);
  assert.equal(baseline.selectedCases.length, baseline.registeredCases);
  assert.equal(new Set(baseline.selectedCases).size, baseline.registeredCases);
  const names: string[] = [];
  for (let index = 0; index < 4; index++) {
    const result = manifest(index, 4);
    assert.equal(result.status, 0, result.stderr);
    const part = JSON.parse(result.stdout);
    assert.equal(part.registeredCases, baseline.registeredCases);
    assert.ok(part.selectedCases.length > 0);
    names.push(...part.selectedCases);
  }
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names.sort(), baseline.selectedCases.sort());
});
test("invalid simulation shard settings fail instead of reporting an empty passing suite", () => {
  for (const [index, count] of [
    [0, 0],
    [-1, 4],
    [4, 4],
    [0.5, 4],
    [0, 17],
  ]) {
    const result = manifest(index, count);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid simulation shard/);
  }
});
