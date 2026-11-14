/**
 * Encounter cards reprinted under a new identity with the Core Set's text:
 * the Two-Player Limited Edition Starter's copies in The Oath. Their rules
 * dispatch on the Core Set code, while the physical card keeps its own
 * identity, face and discard pile.
 */
export const CORE_REPRINTS: Readonly<Record<string, string>> = {
  // Caught in a Web
  "octgn:460b83ed-986a-496b-9b38-627c77a836e9": "01080",
  // Goblin Sniper
  "octgn:e8db9cc7-d53f-4ce9-991d-31078b2d507a": "01083",
  // Driven by Shadow
  "octgn:64813258-1533-420c-9fce-4d4c1f13c99d": "01092",
  // Forest Gate
  "octgn:96b72fe4-c42d-469d-9741-294c4da73278": "01100",
};
/** The Core Set code whose rules a card follows (itself for any other card). */
export const coreReprint = (code: string) => CORE_REPRINTS[code] ?? code;
/** Caught in a Web, in any printing, attached and active. */
export const webAttachments = (
  attachments: { code: string; blanked?: boolean }[],
) => attachments.filter((a) => !a.blanked && coreReprint(a.code) === "01080");
