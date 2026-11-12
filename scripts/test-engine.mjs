import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = readdirSync(new URL("../tests", import.meta.url))
  .filter(
    (name) =>
      name.endsWith(".test.ts") &&
      name !== "simulation.test.ts" &&
      name !== "grey-havens-simulation.test.ts" &&
      name !== "stormcaller-simulation.test.ts" &&
      name !== "depths-simulation.test.ts" &&
      name !== "temple-simulation.test.ts" &&
      name !== "drowned-simulation.test.ts" &&
      name !== "cobas-simulation.test.ts" &&
      name !== "city-simulation.test.ts" &&
      name !== "harad-simulation.test.ts" &&
      name !== "mumakil-simulation.test.ts" &&
      name !== "race-harad-simulation.test.ts" &&
      name !== "beneath-sands-simulation.test.ts" &&
      name !== "batch4-simulation.test.ts" &&
      name !== "ered-simulation.test.ts" &&
      name !== "shadow-east-simulation.test.ts" &&
      name !== "wrath-ruin-simulation.test.ts" &&
      name !== "ulfast-simulation.test.ts" &&
      name !== "wainriders-simulation.test.ts" &&
      name !== "ash-mountains-simulation.test.ts" &&
      name !== "land-sorrow-simulation.test.ts" &&
      name !== "fortress-nurn-simulation.test.ts" &&
      name !== "massing-osgiliath-simulation.test.ts" &&
      name !== "we-must-away-simulation.test.ts" &&
      name !== "misty-mountains-simulation.test.ts" &&
      name !== "dungeons-deep-simulation.test.ts" &&
      name !== "flies-spiders-simulation.test.ts" &&
      name !== "lonely-mountain-simulation.test.ts" &&
      name !== "battle-five-armies-simulation.test.ts" &&
      name !== "lake-town-simulation.test.ts",
  )
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
