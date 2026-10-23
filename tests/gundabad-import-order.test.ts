import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("the scenario catalog can load before the card registry finishes", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "import { SCENARIOS } from './src/game/scenarios.ts'; if (!SCENARIOS.some((s) => s.id === 'mount-gundabad')) process.exit(2);",
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || "scenario import failed",
  );
});
