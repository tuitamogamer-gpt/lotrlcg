// The Angmar Awakened campaign: light rules read by the stats, text and
// healing code (kept apart from the campaign module to avoid import cycles).
import type { GameState, Unit } from "./types";
import { card } from "./cards";

/** Thaurdir's burdens (objectives that count as Sorcery attachments on a hero). */
export const THAURDIR = {
  legacy: "10168",
  majesty: "10169",
  spite: "10170",
} as const;
export const THAURDIR_BURDENS: readonly string[] = [
  THAURDIR.legacy,
  THAURDIR.majesty,
  THAURDIR.spite,
];
const onHero = (s: GameState, u: Unit, code: string) =>
  s.campaign?.kind === "angmar" &&
  card(u.code).type_code === "hero" &&
  u.attachments.some((a) => a.code === code && !a.blanked);
/** Thaurdir's Legacy: "Attached hero … is treated as if its printed text box were blank." */
export const angmarCampaignCharacterBlanked = (s: GameState, u: Unit) =>
  onHero(s, u, THAURDIR.legacy);
/** Thaurdir's Majesty: "Attached hero … cannot commit to the quest." */
export const angmarCampaignCannotCommit = (s: GameState, u: Unit) =>
  onHero(s, u, THAURDIR.majesty);
/** Thaurdir's Spite: "Attached hero … cannot be healed." */
export const angmarCampaignCannotHeal = (s: GameState, u: Unit) =>
  onHero(s, u, THAURDIR.spite);
