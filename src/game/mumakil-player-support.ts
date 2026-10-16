import definitions from "../data/mumakil-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { name } from "./cards";
import { allCharacters, firstPlayer, forOwner } from "./table";
import { hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { log } from "./core";

export const MUMAKIL_PLAYER_CARDS = definitions as Card[];
export const MUMAKIL_PLAYER_CODES = MUMAKIL_PLAYER_CARDS.map((c) => c.code);
export const MUMAKIL_PLAYER = {
  kahliel: "17001",
  guardsman: "17002",
  prepare: "17003",
  yazan: "17004",
  wait: "17005",
  jubayr: "17006",
  pipe: "17007",
  firyal: "17008",
  coney: "17009",
  headdress: "17010",
} as const;

/** Kahliel removes resource matching for Harad allies, never their costs. */
export const mumakilKahlielPays = (hero: Unit, c: Card) =>
  hero.code === MUMAKIL_PLAYER.kahliel &&
  !hero.blanked &&
  c.type_code === "ally" &&
  (c.traits ?? "").split(".").some((t) => t.trim() === "Harad");

/** The global bonus also reaches another player's Harad characters. */
export function mumakilPlayerWillBonus(s: GameState, u: Unit) {
  if (!hasTrait(u, "Harad") || playerCardImmune(u)) return 0;
  return allCharacters(s).reduce(
    (n, h) =>
      n +
      h.attachments.filter(
        (a) => a.code === MUMAKIL_PLAYER.headdress && !a.blanked && !a.facedown,
      ).length,
    0,
  );
}

/** The first-player token is checked when the actual resource draw occurs. */
export const mumakilResourceDrawBonus = (s: GameState, player: number) =>
  player === firstPlayer(s) &&
  (s.victoryCards ?? []).includes(MUMAKIL_PLAYER.prepare)
    ? 1
    : 0;

/** MEC55 p.2 applies to every side quest limited to one victory-display copy. */
export function mumakilSideQuestToDiscard(s: GameState, quest: Unit) {
  if (
    quest.code !== MUMAKIL_PLAYER.prepare ||
    !(s.victoryCards ?? []).includes(quest.code)
  )
    return false;
  forOwner(s, quest.owner ?? quest.controller ?? firstPlayer(s), () =>
    s.discard.push(quest.code),
  );
  log(
    s,
    `${name(quest)} defeated · Its owner discards this additional copy.`,
    "good",
  );
  return true;
}
