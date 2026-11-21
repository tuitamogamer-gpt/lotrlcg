import encounters from "../data/raid-grey-havens-encounter-cards.json";
import quests from "../data/raid-grey-havens-quest-cards.json";
import recipes from "../data/raid-grey-havens-recipes.json";
import nightmareCards from "../data/nightmare-encounter-cards.json";
import type { Card, GameState, Unit } from "./types";
import { dcBase, dcIs } from "./dreamchaser-campaign-support";

export const RAID_ENCOUNTERS = encounters as Card[];
export const RAID_QUESTS = quests as Card[];
export const RAID_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests].find((c) => c.name === name)!.code;
export const RAID = {
  assault: code("The Corsairs' Assault"),
  advance: code("Sahír's Advance"),
  burn: code("The Havens Burn"),
  dream: code("Dream-chaser"),
  sahir: code("Captain Sahír"),
  naasiyah: code("Na'asiyah"),
  arsonist: code("Corsair Arsonist"),
  ravager: code("Sahír's Ravager"),
  harbor: code("Mithlond Harbor"),
  piers: code("Burning Piers"),
  pillaged: code("Pillaged Ship"),
  white: code("White Ship"),
  runner: code("Elven Wave-runner"),
  caravel: code("Elven Caravel"),
  torch: code("Put to the Torch"),
  fires: code("The Fires Spread"),
  raider: code("Umbar Raider"),
  infiltrator: code("Corsair Infiltrator"),
  leader: code("Raid Leader"),
  hardened: code("Battle-Hardened"),
};
/** The Nightmare Deck's cards the scenario's own rules refer to (docs/NIGHTMARE.md). */
export const RAID_NIGHTMARE = {
  advance: "octgn:ccba3aa6-5129-47d8-839c-b20aff126e62",
  pyromaniac: "octgn:5d491420-2c69-41b8-8023-a7020f5a33df",
  tower: "octgn:98763910-365c-452a-b7ed-24512c3962a8",
};
const NIGHTMARE_ENCOUNTERS = (nightmareCards as Card[]).filter(
  (c) => c.encounter_set === "Raid on the Grey Havens - Nightmare",
);
export interface RaidGreyHavensState {
  initialized: boolean;
  setAside: Unit[];
  /** Face-down, out-of-play physical locations underneath The Havens Burn. */
  burned: Unit[];
}
export function validateRaidGreyHavens(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.raidGreyHavens;
  if (q === undefined) return s.scenarioId !== "raid-on-the-grey-havens";
  if (
    !q ||
    s.scenarioId !== "raid-on-the-grey-havens" ||
    typeof q.initialized !== "boolean" ||
    ![1, 2].includes(s.stage) ||
    !Array.isArray(q.setAside) ||
    !Array.isArray(q.burned) ||
    !q.setAside.every(
      (u) =>
        validUnit(u) &&
        [
          RAID.sahir,
          RAID.naasiyah,
          RAID.burn,
          RAID.dream,
          RAID.ravager,
        ].includes(dcBase(u.code)),
    ) ||
    new Set(q.setAside.map((u) => u.code)).size !== q.setAside.length ||
    !q.burned.every(
      (u) =>
        validUnit(u) &&
        /Aflame\s+\d+/.test(
          [...(encounters as Card[]), ...NIGHTMARE_ENCOUNTERS].find(
            (c) => c.code === dcBase(u.code),
          )?.text ?? "",
        ),
    ) ||
    new Set([...q.setAside, ...q.burned].map((u) => u.id)).size !==
      q.setAside.length + q.burned.length
  )
    return false;
  return (
    !q.initialized ||
    (q.setAside.every((u) => [RAID.sahir, RAID.naasiyah].includes(u.code)) &&
      (s.stage === 1 || q.setAside.length === 0) &&
      s.staging.filter((u) => dcIs(u, RAID.burn)).length === 1)
  );
}
