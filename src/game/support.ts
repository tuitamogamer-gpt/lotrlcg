import { hasEncounterKeyword } from "./encounter-keyword";
import { SCRIPTED, playerCards, encounterCards } from "./cards";
import { SAGA_CAMPAIGN_SUPPORTED } from "./saga-campaign";
import { SCENARIOS, CAMPAIGN_CHAPTERS } from "./scenarios";
import { nightmareSupported } from "./nightmare";
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
  deckCards: playerCards.filter(
    (c) =>
      !hasEncounterKeyword(c) &&
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
  const name = reference.name
    .replace(/\s*\((?:Easy|Campaign|Nightmare)\)\s*$/i, "")
    .trim();
  // The frozen source recipe drops the article printed in the MEC77 title,
  // and names The Siege of Annúminas' standard game mode after its setup card
  // (the epic multiplayer mode recipe stays unsupported).
  // The Starter's 2018 recipes are named after its Limited Collector's
  // Edition; the atlas names them after the Two-Player Limited Edition Starter.
  const lower = name.toLocaleLowerCase("en");
  const canonicalName =
    lower === "temple of doom"
      ? "The Temple of Doom"
      : lower === "standard the siege of annúminas"
        ? "The Siege of Annúminas"
        : name.replace(
            /\s*\(Limited Collector['’]s Edition\)$/i,
            " (Two-Player Limited Edition Starter)",
          );
  // Some source recipes drop a title's accents ("The Druadan Forest").
  const fold = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en");
  const match = SCENARIOS.find((s) => fold(s.name) === fold(canonicalName));
  if (
    !match ||
    (reference.mode === "campaign" &&
      !CAMPAIGN_CHAPTERS.includes(match.id) &&
      !SAGA_CAMPAIGN_SUPPORTED.includes(match.id)) ||
    // Nightmare mode: only the scenarios whose Nightmare Decks are supported.
    (reference.mode === "nightmare" && !nightmareSupported(match.id))
  )
    return null;
  return match.id;
}
