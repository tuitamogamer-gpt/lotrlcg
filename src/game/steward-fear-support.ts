import encounters from "../data/steward-fear-encounter-cards.json";
import quests from "../data/steward-fear-quest-cards.json";
import streets from "../data/streets-gondor-encounter-cards.json";
import recipes from "../data/steward-fear-recipes.json";
import type { Card, GameState } from "./types";

export const STEWARD_FEAR_ENCOUNTERS = encounters as Card[];
export const STEWARD_FEAR_QUESTS = quests as Card[];
export const STREETS_GONDOR_ENCOUNTERS = streets as Card[];
export const STEWARD_FEAR_RECIPES = recipes;
const code = (title: string) =>
  [
    ...STEWARD_FEAR_ENCOUNTERS,
    ...STEWARD_FEAR_QUESTS,
    ...STREETS_GONDOR_ENCOUNTERS,
  ].find((c) => c.name === title)!.code;
export const STEWARD_FEAR = {
  conspiracy: code("Conspiracy"),
  grandDesign: code("The Grand Design"),
  confrontation: code("The Confrontation"),
  sewers: code("Sewers"),
  flames: code("Up in Flames"),
  castamir: code("The Hand of Castamir"),
  prisoner: code("A Prisoner"),
  alliance: code("Unholy Alliance"),
  houses: code("Houses of the Dead"),
  daughter: code("Daughter of Berúthiel"),
  counsels: code("Poisoned Counsels"),
  roots: code("Roots of Mindolluin"),
  scrap: code("A Scrap of History"),
  fourthStar: code("The Fourth Star"),
  storehouse: code("Storehouse"),
  knife: code("A Knife in the Back"),
  bane: code("Telemnar's Bane"),
  map: code("Secret Map"),
  dissident: code("Underworld Dissident"),
  discovery: code("Unwelcome Discovery"),
  falseLead: code("False Lead"),
} as const;
export const STREETS = {
  cityStreet: code("City Street"),
  localTrouble: code("Local Trouble"),
  lostCity: code("Lost in the City"),
  market: code("Market Square"),
  pickpocket: code("Pickpocket"),
} as const;
export const STEWARD_CLUES: string[] = [
  STEWARD_FEAR.prisoner,
  STEWARD_FEAR.scrap,
  STEWARD_FEAR.map,
];
export const STEWARD_PLOTS: string[] = [
  STEWARD_FEAR.flames,
  STEWARD_FEAR.alliance,
  STEWARD_FEAR.counsels,
];
export const STEWARD_VILLAINS: string[] = [
  STEWARD_FEAR.castamir,
  STEWARD_FEAR.daughter,
  STEWARD_FEAR.bane,
];
/** Hidden cards are persisted for determinism; presentations expose counts only. */
export interface StewardFearState {
  underworldDeck: string[];
  underneath: Record<string, string[]>;
  hiddenPlot?: string;
  hiddenVillain?: string;
  rootsSetAside?: string;
  removedHidden: string[];
  questResources: number;
  pendingUnderworld: string[];
}

/** Validate hidden data without exposing any of its identities to the presentation. */
/**
 * The Nightmare Deck's cards a save may hold in the scenario's hidden zones:
 * its 2 Plots, the cards the underworld deck may hold (Murderous Turncoat,
 * Faithless Conspirator and False Accusations) and its locations with
 * facedown cards (Traitors' Den, Arched Tunnel, Rath Celerdain).
 */
const NIGHTMARE_STEWARD = {
  plots: [
    "octgn:bb102bb7-e667-444c-b036-a65015452060",
    "octgn:1fe22408-2fbc-40f8-a88c-980ab90137d8",
  ],
  underworld: [
    "octgn:bbbad333-b966-4826-b98d-1a9e8b6a1c45",
    "octgn:1c446c6e-5665-446a-80f1-68cceaed05eb",
    "octgn:f0eb44aa-e060-4d5d-b66b-39bd1f0801d7",
  ],
  locations: [
    "octgn:eb4d41de-acaf-4cca-813b-3f1465cb5d4f",
    "octgn:fc351158-b618-41f2-8ba0-a3ab18eb7dd3",
    "octgn:045cf035-2ebf-4ebf-a7a3-7d44d3f9b2dc",
  ],
};
export function validateStewardFearState(s: GameState): boolean {
  const q = s.stewardFear;
  if (q === undefined) return s.scenarioId !== "the-stewards-fear";
  if (s.scenarioId !== "the-stewards-fear" || !q || typeof q !== "object")
    return false;
  const underworldMaximum: Record<string, number> = {
    [STREETS.pickpocket]: 3,
    "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9052": 2,
    "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9085": s.easyMode ? 0 : 1,
    "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9088": 3,
    ...Object.fromEntries(STEWARD_CLUES.map((c) => [c, 1])),
  };
  // Nightmare mode shuffles the Nightmare Deck's cards and any destroyed
  // enemy into the underworld deck.
  const nightmare = !!s.nightmareMode;
  const enemies = new Set(
    [...STEWARD_FEAR_ENCOUNTERS, ...STREETS_GONDOR_ENCOUNTERS]
      .filter((c) => c.type_code === "enemy")
      .map((c) => c.code),
  );
  const plots = nightmare
    ? [...STEWARD_PLOTS, ...NIGHTMARE_STEWARD.plots]
    : STEWARD_PLOTS;
  const hiddenList = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.every(
      (c) =>
        typeof c === "string" &&
        (underworldMaximum[c] > 0 ||
          (nightmare &&
            (enemies.has(c) || NIGHTMARE_STEWARD.underworld.includes(c)))),
    );
  if (
    !hiddenList(q.underworldDeck) ||
    !hiddenList(q.pendingUnderworld) ||
    !q.underneath ||
    typeof q.underneath !== "object" ||
    Array.isArray(q.underneath) ||
    !Number.isInteger(q.questResources) ||
    q.questResources < 0 ||
    (q.hiddenPlot !== undefined && !plots.includes(q.hiddenPlot)) ||
    (q.hiddenVillain !== undefined &&
      !STEWARD_VILLAINS.includes(q.hiddenVillain)) ||
    (q.rootsSetAside !== undefined && q.rootsSetAside !== STEWARD_FEAR.roots) ||
    !Array.isArray(q.removedHidden) ||
    new Set(q.removedHidden).size !== q.removedHidden.length ||
    q.removedHidden.some((c) => ![...plots, ...STEWARD_VILLAINS].includes(c)) ||
    q.removedHidden.filter((c) => plots.includes(c)).length >
      plots.length - 1 ||
    q.removedHidden.filter((c) => STEWARD_VILLAINS.includes(c)).length > 2 ||
    (q.hiddenPlot !== undefined && q.removedHidden.includes(q.hiddenPlot)) ||
    (q.hiddenVillain !== undefined && q.removedHidden.includes(q.hiddenVillain))
  )
    return false;
  const locations = [
    s.activeLocation,
    ...(s.extraActiveLocations ?? []),
    ...s.staging,
  ].filter(
    (u): u is NonNullable<typeof u> =>
      !!u &&
      ([...STEWARD_FEAR_ENCOUNTERS, ...STREETS_GONDOR_ENCOUNTERS].some(
        (c) => c.code === u.code && c.type_code === "location",
      ) ||
        (nightmare && NIGHTMARE_STEWARD.locations.includes(u.code))),
  );
  const underworld = [...q.underworldDeck, ...q.pendingUnderworld];
  for (const [id, cards] of Object.entries(q.underneath)) {
    if (!locations.some((l) => l.id === id) || !hiddenList(cards)) return false;
    underworld.push(...cards);
  }
  return Object.entries(underworldMaximum).every(
    ([c, max]) => underworld.filter((code) => code === c).length <= max,
  );
}
