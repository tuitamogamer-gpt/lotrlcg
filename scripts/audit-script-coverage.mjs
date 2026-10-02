import fs from "node:fs";
import { createHash } from "node:crypto";
import { SCRIPTED } from "../src/game/cards.ts";
import {
  automationSummary,
  isAutomatedCard,
  automatedScenarioId,
} from "../src/game/support.ts";
import { cardProductInfo } from "../src/game/products.ts";

const catalogBytes = fs.readFileSync(
  new URL("../public/catalog.json", import.meta.url),
);
const catalog = JSON.parse(catalogBytes);
const recipes = JSON.parse(
  fs.readFileSync(new URL("../public/scenarios.json", import.meta.url)),
);
const rows = catalog.map((card) => ({
  code: card.code,
  name: card.name,
  type: card.type_code,
  pack: card.pack_name,
  state: isAutomatedCard(card) ? "scripted" : "pending",
  originalProduct: cardProductInfo(card).original?.id ?? null,
}));
const playerTypes = new Set([
  "hero",
  "ally",
  "event",
  "attachment",
  "player-side-quest",
  "contract",
  "treasure",
]);
const scenarios = recipes.map((recipe) => ({
  id: recipe.id,
  name: recipe.name,
  mode: recipe.mode,
  engineId: automatedScenarioId(recipe),
  state: automatedScenarioId(recipe) ? "scripted" : "pending",
}));
const grouped = new Map();
for (const row of rows) {
  const key = row.originalProduct ?? row.pack;
  const summary = grouped.get(key) ?? {
    product: key,
    total: 0,
    scripted: 0,
    player: 0,
    playerScripted: 0,
  };
  summary.total++;
  summary.scripted += row.state === "scripted" ? 1 : 0;
  if (playerTypes.has(row.type)) {
    summary.player++;
    summary.playerScripted += row.state === "scripted" ? 1 : 0;
  }
  grouped.set(key, summary);
}
const report = {
  schema: "lotr-script-coverage/v1",
  catalogSha256: createHash("sha256").update(catalogBytes).digest("hex"),
  runtime: automationSummary(),
  catalog: {
    total: rows.length,
    scripted: rows.filter((r) => r.state === "scripted").length,
    pending: rows.filter((r) => r.state === "pending").length,
  },
  scenarioRecipes: {
    total: scenarios.length,
    scripted: scenarios.filter((r) => r.state === "scripted").length,
  },
  registeredCodes: [...SCRIPTED].sort(),
  products: [...grouped.values()].sort((a, b) =>
    String(a.product).localeCompare(String(b.product)),
  ),
  cards: rows,
  scenarios,
};
fs.writeFileSync(
  new URL("../public/automation-coverage.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    runtime: report.runtime,
    catalog: report.catalog,
    scenarioRecipes: report.scenarioRecipes,
  }),
);
