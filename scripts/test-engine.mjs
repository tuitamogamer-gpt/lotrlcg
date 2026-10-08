import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = readdirSync(new URL("../tests", import.meta.url))
  .filter((name) => name.endsWith(".test.ts") && name !== "simulation.test.ts")
  .sort()
  .map((name) => `tests/${name}`);
if (!files.length) throw new Error("No engine test files found.");
const result = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx",
    "--test",
    "--test-skip-pattern=^hot-seat .*: complete seeded games with save checks$",
    ...process.argv.slice(2),
    ...files,
  ],
  { cwd: root, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
