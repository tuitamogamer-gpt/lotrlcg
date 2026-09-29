import { STARTERS } from "../game/cards";
import type { PlayMode, ScenarioId } from "../game/types";

export const CHOICES_KEY = "there-and-back-again.choices.v1";
export interface FellowshipChoices {
  version: 1;
  setupMode: "classic" | "hotseat";
  selectedDeck: string;
  seatDecks: string[];
  playMode: PlayMode;
  scenario: ScenarioId;
}
export function parseChoices(value: unknown): FellowshipChoices | null {
  if (!value || typeof value !== "object") return null;
  const v = value as FellowshipChoices;
  // Starter ids, or a custom deck reference such as "custom:abc123" (the deck
  // itself stays on the device; a missing deck falls back to a starter).
  const validDeck = (id: unknown) =>
    STARTERS.some((d) => d.id === id) ||
    (typeof id === "string" && /^custom:[\w-]{1,64}$/.test(id));
  if (
    v.version !== 1 ||
    !["classic", "hotseat"].includes(v.setupMode) ||
    !validDeck(v.selectedDeck) ||
    !Array.isArray(v.seatDecks) ||
    v.seatDecks.length < 1 ||
    v.seatDecks.length > 4 ||
    !v.seatDecks.every(validDeck) ||
    new Set(v.seatDecks).size !== v.seatDecks.length ||
    !["normal", "campaign"].includes(v.playMode) ||
    !["mirkwood", "anduin", "dol-guldur", "hunt-for-gollum"].includes(
      v.scenario,
    )
  )
    return null;
  return {
    version: 1,
    setupMode: v.setupMode,
    selectedDeck: v.selectedDeck,
    seatDecks: [...v.seatDecks],
    playMode: v.playMode,
    scenario: v.scenario,
  };
}
export function readChoices(): FellowshipChoices | null {
  try {
    return parseChoices(
      JSON.parse(localStorage.getItem(CHOICES_KEY) ?? "null"),
    );
  } catch {
    return null;
  }
}
