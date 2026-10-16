import definitions from "../data/beneath-sands-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  allEngaged,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "./table";
import { playerCardImmune } from "./card-immunity";
import { log } from "./core";

export const BENEATH_SANDS_PLAYER_CARDS = definitions as Card[];
export const BENEATH_SANDS_PLAYER_CODES = BENEATH_SANDS_PLAYER_CARDS.map(
  (c) => c.code,
);
export const BENEATH_SANDS_PLAYER = {
  hirgon: "17055",
  spear: "17056",
  hunting: "17057",
  arrow: "17058",
  watch: "17059",
  rider: "17060",
  song: "17061",
  lookout: "17062",
  ranger: "17063",
  peoples: "17064",
} as const;

export function beneathSandsPlayerStats(s: GameState, u: Unit) {
  if (playerCardImmune(u)) return { attack: 0 };
  const spear = u.attachments.filter(
    (a) => a.code === BENEATH_SANDS_PLAYER.spear && !a.blanked && !a.facedown,
  ).length;
  const boosts = playerOrder(s).reduce(
    (n, p) =>
      n +
      seatView(s, p).used.filter((key) =>
        key.startsWith(`attack:beneath-sands-spear:${u.id}:`),
      ).length,
    0,
  );
  const watch =
    (s.victoryCards ?? []).includes(BENEATH_SANDS_PLAYER.watch) &&
    !card(u.code).is_unique &&
    allEngaged(s).some((enemy) => enemy.id === u.id)
      ? 1
      : 0;
  return { attack: spear + 3 * boosts - watch };
}

export function beneathSandsPlayerDoesNotExhaustToQuest(s: GameState, u: Unit) {
  return (
    u.code === BENEATH_SANDS_PLAYER.rider &&
    !u.blanked &&
    (s.victoryCards ?? []).some((code) =>
      ["player-side-quest", "encounter-side-quest"].includes(
        card(code).type_code,
      ),
    )
  );
}

export function beneathSandsSideQuestToDiscard(s: GameState, quest: Unit) {
  if (
    quest.code !== BENEATH_SANDS_PLAYER.watch ||
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
