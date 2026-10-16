import definitions from "../data/race-harad-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { allActiveLocations, firstPlayer, forOwner } from "./table";
import { playerCardImmune } from "./card-immunity";
import { log } from "./core";

export const RACE_HARAD_PLAYER_CARDS = definitions as Card[];
export const RACE_HARAD_PLAYER_CODES = RACE_HARAD_PLAYER_CARDS.map((c) => c.code);
export const RACE_HARAD_PLAYER = {
  thurindir: "17028",
  tribesman: "17029",
  steed: "17030",
  warrior: "17031",
  hunters: "17032",
  pathfinder: "17033",
  backtrack: "17034",
  settler: "17035",
  secretWays: "17036",
  steward: "17037",
} as const;

export function raceHaradPlayerWillBonus(s: GameState, u: Unit) {
  return u.code === RACE_HARAD_PLAYER.thurindir && !u.blanked && !playerCardImmune(u)
    ? (s.victoryCards ?? []).filter((code) =>
        ["player-side-quest", "encounter-side-quest"].includes(card(code).type_code),
      ).length
    : 0;
}

/** This changes contribution to staging threat, never printed or current threat. */
export function raceHaradPlayerStagingThreatExcluded(s: GameState, u: Unit) {
  return (
    card(u.code).type_code === "location" &&
    !playerCardImmune(u) &&
    (s.victoryCards ?? []).includes(RACE_HARAD_PLAYER.secretWays) &&
    allActiveLocations(s).some((active) => card(active.code).name === card(u.code).name)
  );
}

export function raceHaradSideQuestToDiscard(s: GameState, quest: Unit) {
  if (
    quest.code !== RACE_HARAD_PLAYER.secretWays ||
    !(s.victoryCards ?? []).includes(quest.code)
  )
    return false;
  forOwner(s, quest.owner ?? quest.controller ?? firstPlayer(s), () =>
    s.discard.push(quest.code),
  );
  log(s, `${name(quest)} defeated · Its owner discards this additional copy.`, "good");
  return true;
}
