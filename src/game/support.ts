import { SCRIPTED, playerCards, encounterCards } from "./cards";
import { SCENARIOS, CAMPAIGN_CHAPTERS } from "./scenarios";
import type { Card } from "./types";
import { EMYN_MUIL_QUESTS, RHOSGOBEL_QUESTS } from "./encounter-definitions";

// Quest stages are implemented by scenario modules rather than card actions.
export const SCRIPTED_QUESTS = new Set([
  "01119",
  "01120",
  "01121",
  "01122",
  "01123",
  "01124",
  "01125",
  "01126",
  "01127",
  "01128",
  "02011",
  "02012",
  "02013",
  "octgn:51223bd0-ffd1-11df-a976-0801202c9012",
  "octgn:51223bd0-ffd1-11df-a976-0801202c9003",
  ...EMYN_MUIL_QUESTS.map((c) => c.code),
  ...RHOSGOBEL_QUESTS.map((c) => c.code),
]);
export const isAutomatedCard = (c: Card) =>
  SCRIPTED.has(c.engine_code ?? c.code) ||
  (c.type_code === "quest" && SCRIPTED_QUESTS.has(c.code));
export const automationSummary = () => ({
  playerCards: playerCards.length,
  heroes: playerCards.filter((c) => c.type_code === "hero").length,
  deckCards: playerCards.filter((c) =>
    [
      "ally",
      "attachment",
      "event",
      "player-side-quest",
      "contract",
      "treasure",
    ].includes(c.type_code),
  ).length,
  encounterCards: encounterCards.length,
  scenarios: SCENARIOS.length,
  scenarioIds: SCENARIOS.map((s) => s.id),
});
export function automatedScenarioId(reference: { name: string; mode: string }) {
  if (reference.mode === "nightmare") return null;
  const name = reference.name
    .replace(/\s*\((?:Easy|Campaign)\)\s*$/i, "")
    .trim();
  const match = SCENARIOS.find((s) => s.name === name);
  if (
    !match ||
    (reference.mode === "campaign" && !CAMPAIGN_CHAPTERS.includes(match.id))
  )
    return null;
  return match.id;
}
