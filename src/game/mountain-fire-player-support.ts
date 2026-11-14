import type { GameState, Unit } from "./types";
import { card } from "./cards";
import { globalCharacters, ownerOf, seatView } from "./table";

/**
 * The Mountain of Fire player-card checks the low-level rules read without
 * the card module: Captains of the West's Noble heroes commit to the quest
 * without exhausting until the end of the phase, and Elladan and Elrohir look
 * for each other by title.
 */
export const captainsKey = (id: string) => `phase:mfp-captains:${id}`;
export const mountainFireCaptainsNoQuestExhaust = (s: GameState, u: Unit) =>
  seatView(s, ownerOf(s, u)).used.includes(captainsKey(u.id));
/** "While Elrohir is in play": any version of that unique character. */
export const titleInPlay = (s: GameState, title: string) =>
  globalCharacters(s).some((u) => card(u.code).name === title);
