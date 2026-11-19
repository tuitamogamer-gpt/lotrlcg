// The Dream-chaser campaign: card codes, card faces and the Campaign Log's
// checkboxes (kept free of engine imports so every scenario module can read
// them without import cycles).
import type { CampaignState, GameState, ScenarioId } from "./types";

const O = "octgn:";
export const DC = {
  /** The nine campaign cards. */
  voyageCard: `${O}18b9cb80-a536-427f-8c76-a05a9477bb7f`,
  fateCard: `${O}53f207b7-6670-4cc1-ad0f-d0190386d2b5`,
  raidCard: `${O}78a03d01-99f6-4c8c-9251-ec20f85ec609`,
  flightCard: `${O}c6df8413-6e0a-4ba3-b705-4b9626c66b02`,
  thingCard: `${O}c281bdda-e8d3-408c-bd5d-d7673b092576`,
  templeCard: `${O}870d08ac-097f-4bb7-8da8-439a2b05e838`,
  drownedCard: `${O}95604bc2-d030-4403-b3da-892402a38a39`,
  cobasCard: `${O}a56afdd4-343f-4b66-9bd2-f775d6372cd7`,
  cityCard: `${O}7be3bdf4-dc81-4a3d-8fb1-08bfe4c9b1b5`,
  /** Modification boons. */
  armor: "11172",
  ballista: "11173",
  quarters: "11174",
  sails: "11175",
  /** Burdens. */
  ominous: "11176",
  thunderstruck: "11177",
  crowley: "11178",
  revenant: "11181",
  graxar: "11188",
  keyBurden: "11192",
  serpent: "11196",
  nightmare: "11199",
  sword: "11216",
  /** Boons. */
  spyglass: "11180",
  keyBoon: "11183",
  cutlass: "11189",
  axe: "11190",
  calaerion: "11193",
  together: "11195",
  starla: "11198",
  gavin: "11210",
  /** Hard Mode (Expert Mode on its other side). */
  hard: `${O}adc553ec-872a-493b-bbed-c9313e9d0f0f`,
  /** The campaign expansion's versions of scenario cards. */
  calphon: `${O}b69c7813-2319-49d4-b4a6-157a044ac73c`,
  stormcaller: `${O}5a19564f-aa1d-4db1-91ee-6123b9d64967`,
  thing: `${O}93c87689-1400-4b1d-8076-a22e9736919c`,
  guardian: `${O}05ecd24a-f18c-4c11-8cf7-1d021e380751`,
  gateKey: `${O}e2bbbc36-80aa-479e-955a-21d723fdc9da`,
  warship: `${O}ee22a40c-9884-4872-988b-f8468e4ac549`,
  monument: `${O}d777af13-989a-40b7-8825-61a7dc8e793c`,
  /** The fleet: the campaign expansion's six ships. */
  dream: `${O}8043cc1b-caa1-4f12-8abb-61322c9e9499`,
  dawn: `${O}88d4f08d-3f1b-4d3b-9f46-b896c9b662b0`,
  dusk: `${O}94f2aa12-7d4c-4124-a642-a7f3fb2ca414`,
  glorinaith: `${O}814fecd8-1d51-431e-a904-e12ba8747391`,
  narelenya: `${O}a85f3566-9501-4f73-83d7-3f1d6a81f08a`,
  silver: `${O}24180e46-4cad-4d59-a917-6cda1ff1383f`,
} as const;
export const GALDOR = ["11184", "11185", "11186", "11187"] as const;
export const COMMAND = ["11201", "11202", "11203", "11204"] as const;
export const CIRDAN = ["11205", "11206", "11207", "11208"] as const;
export const SEND_FOR_HELP = ["11211", "11212", "11213", "11214"] as const;
export const MODIFICATIONS: readonly string[] = [
  DC.armor,
  DC.ballista,
  DC.quarters,
  DC.sails,
];
/** The original scenario cards the campaign expansion reprints (their fronts are the same). */
export const DC_ORIGINAL: Record<string, string> = {
  [DC.calphon]: `${O}24a816f2-172f-4945-8d9b-21eb7fb68263`,
  [DC.stormcaller]: `${O}3065a397-5346-4148-8e0a-47009fe9b87d`,
  [DC.thing]: `${O}b53fd0fc-5734-4bdc-b26f-c2133da31c3d`,
  [DC.guardian]: `${O}e4f6c61b-afb1-4f12-81d5-4edd14a90d32`,
  [DC.gateKey]: `${O}447dd08d-693c-407f-8155-87164f212351`,
  [DC.warship]: `${O}b585f28e-7612-4f07-83f7-0fed8d391e3d`,
  [DC.monument]: `${O}f811f153-81f4-4688-8b4d-400215e6748a`,
  [DC.dream]: `${O}07a8f60f-926c-4342-bf04-e3af9a24df10`,
  [DC.dawn]: `${O}81632d10-625e-42f0-9e6b-09574a9ffbc3`,
  [DC.narelenya]: `${O}32db1af6-e214-4958-9ca4-bdf3a73758b5`,
  [DC.silver]: `${O}c9139d8c-0d9d-4d34-bfb5-8d40ca455bfc`,
};
/** Original cards whose campaign side exists only as a print-and-play back. */
export const HAVENS_BURN = `${O}6302e603-fade-43b3-a6b3-235af412fdfa`;
export const DREAM_LOCATION = `${O}c792fec6-5840-4aba-8dcd-36b1632d58fa`;
export const CITY_STORMCALLER = `${O}c45dc401-bb07-42ec-ba4c-ee9105a3f349`;
/** A campaign face's code: the card's other side. */
export const backFace = (code: string) => `${code}.B`;
/**
 * The engine identity of a card face: an Upgraded or "Campaign Mode only"
 * face, or the campaign expansion's reprint, reads as the original card.
 */
export function dcBase(code: string): string {
  const front = code.endsWith(".B") ? code.slice(0, -2) : code;
  return DC_ORIGINAL[front] ?? front;
}
/** Is this unit (or code) the given original card, on either face? */
export const dcIs = (u: { code: string } | string, original: string) =>
  dcBase(typeof u === "string" ? u : u.code) === original;
/** Is this card face an Upgraded or "Campaign Mode only" side? */
export const dcBackFace = (u: { code: string } | string) =>
  (typeof u === "string" ? u : u.code).endsWith(".B");

export const DREAMCHASER_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "voyage-across-belegaer",
  "the-fate-of-numenor",
  "raid-on-the-grey-havens",
  "flight-of-the-stormcaller",
  "the-thing-in-the-depths",
  "temple-of-the-deceived",
  "the-drowned-ruins",
  "a-storm-on-cobas-haven",
  "the-city-of-corsairs",
];
export const DREAMCHASER_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "voyage-across-belegaer": DC.voyageCard,
  "the-fate-of-numenor": DC.fateCard,
  "raid-on-the-grey-havens": DC.raidCard,
  "flight-of-the-stormcaller": DC.flightCard,
  "the-thing-in-the-depths": DC.thingCard,
  "temple-of-the-deceived": DC.templeCard,
  "the-drowned-ruins": DC.drownedCard,
  "a-storm-on-cobas-haven": DC.cobasCard,
  "the-city-of-corsairs": DC.cityCard,
};
export const isDreamchaserCampaign = (c?: CampaignState | null) =>
  c?.kind === "dreamchaser";
export const isDreamchaserGame = (s: GameState) =>
  isDreamchaserCampaign(s.campaign);
/** The campaign card's part number (Ominous Fate's X before its additions). */
export const dreamchaserPart = (id: ScenarioId) =>
  DREAMCHASER_CAMPAIGN_ORDER.indexOf(id) + 1;

export type DreamchaserLogLine = {
  /** The Campaign Log line's key (a card code). */
  key: string;
  /** The title printed in the Campaign Log. */
  label: string;
  boxes: number;
  kind: "scalable" | "upgradable";
};
/** The Campaign Log's checkboxes, as printed (rulebook page 31). */
export const DREAMCHASER_LOG: readonly DreamchaserLogLine[] = [
  {
    key: CIRDAN[0],
    label: "Círdan's Blessing (Leadership)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: CIRDAN[3],
    label: "Círdan's Blessing (Lore)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: CIRDAN[2],
    label: "Círdan's Blessing (Spirit)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: CIRDAN[1],
    label: "Círdan's Blessing (Tactics)",
    boxes: 5,
    kind: "scalable",
  },
  { key: DC.together, label: "Come Together", boxes: 5, kind: "scalable" },
  {
    key: COMMAND[0],
    label: "Command (Leadership)",
    boxes: 4,
    kind: "scalable",
  },
  { key: COMMAND[1], label: "Command (Lore)", boxes: 4, kind: "scalable" },
  { key: COMMAND[2], label: "Command (Spirit)", boxes: 4, kind: "scalable" },
  { key: COMMAND[3], label: "Command (Tactics)", boxes: 4, kind: "scalable" },
  {
    key: GALDOR[0],
    label: "Galdor's Counsel (Leadership)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: GALDOR[3],
    label: "Galdor's Counsel (Lore)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: GALDOR[2],
    label: "Galdor's Counsel (Spirit)",
    boxes: 5,
    kind: "scalable",
  },
  {
    key: GALDOR[1],
    label: "Galdor's Counsel (Tactics)",
    boxes: 5,
    kind: "scalable",
  },
  { key: DC.starla, label: "Starla", boxes: 5, kind: "scalable" },
  { key: DC.armor, label: "Armor Plating", boxes: 2, kind: "upgradable" },
  { key: DC.ballista, label: "Ballista", boxes: 2, kind: "upgradable" },
  { key: DC.keyBoon, label: "Black Key (boon)", boxes: 4, kind: "upgradable" },
  {
    key: DC.keyBurden,
    label: "Black Key (burden)",
    boxes: 5,
    kind: "upgradable",
  },
  { key: DC.calaerion, label: "Calaerion", boxes: 5, kind: "upgradable" },
  { key: DC.calphon, label: "Calphon", boxes: 2, kind: "upgradable" },
  { key: DC.dawn, label: "Dawn Star", boxes: 4, kind: "upgradable" },
  {
    key: DC.warship,
    label: "Dol Amroth Warship",
    boxes: 3,
    kind: "upgradable",
  },
  {
    key: DC.dream,
    label: "Dream-chaser (ship-objective)",
    boxes: 4,
    kind: "upgradable",
  },
  {
    key: DREAM_LOCATION,
    label: "Dream-chaser (location)",
    boxes: 2,
    kind: "upgradable",
  },
  { key: DC.dusk, label: "Duskbringer", boxes: 4, kind: "upgradable" },
  {
    key: DC.quarters,
    label: "Enlarged Quarters",
    boxes: 2,
    kind: "upgradable",
  },
  { key: DC.sails, label: "Extra Sails", boxes: 2, kind: "upgradable" },
  { key: DC.gateKey, label: "Gate Key", boxes: 2, kind: "upgradable" },
  { key: DC.gavin, label: "Gavin", boxes: 4, kind: "upgradable" },
  { key: DC.glorinaith, label: "Glórinaith", boxes: 4, kind: "upgradable" },
  { key: DC.narelenya, label: "Nárelenya", boxes: 4, kind: "upgradable" },
  { key: DC.cutlass, label: "Parrying Cutlass", boxes: 5, kind: "upgradable" },
  {
    key: SEND_FOR_HELP[0],
    label: "Send for Help (Leadership)",
    boxes: 3,
    kind: "upgradable",
  },
  {
    key: SEND_FOR_HELP[3],
    label: "Send for Help (Lore)",
    boxes: 2,
    kind: "upgradable",
  },
  {
    key: SEND_FOR_HELP[2],
    label: "Send for Help (Spirit)",
    boxes: 4,
    kind: "upgradable",
  },
  {
    key: SEND_FOR_HELP[1],
    label: "Send for Help (Tactics)",
    boxes: 3,
    kind: "upgradable",
  },
  { key: DC.silver, label: "Silver Wing", boxes: 4, kind: "upgradable" },
  { key: DC.spyglass, label: "Spyglass", boxes: 3, kind: "upgradable" },
  { key: DC.sword, label: "The Black Sword", boxes: 5, kind: "upgradable" },
  { key: HAVENS_BURN, label: "The Havens Burn", boxes: 2, kind: "upgradable" },
  {
    key: DC.monument,
    label: "The Shattered Monument",
    boxes: 2,
    kind: "upgradable",
  },
  { key: DC.axe, label: "Throwing Axe", boxes: 5, kind: "upgradable" },
];
const logLine = (key: string) => DREAMCHASER_LOG.find((l) => l.key === key);
/** The checkboxes marked next to a card's title in the Campaign Log. */
export const dcMarks = (c: CampaignState | null | undefined, key: string) =>
  isDreamchaserCampaign(c) ? Math.max(0, c!.marks?.[key] ?? 0) : 0;
/** A scalable card's level: one for each marked checkbox. */
export const dcLevel = (s: GameState, key: string) => dcMarks(s.campaign, key);
/** An upgradable card is upgraded once each of its checkboxes is marked. */
export const dcUpgraded = (c: CampaignState | null | undefined, key: string) =>
  !!logLine(key) && dcMarks(c, key) >= logLine(key)!.boxes;
/**
 * The face a campaign card takes in this game: its Upgraded side once all of
 * its checkboxes are marked (the "key" is its Campaign Log line).
 */
export function dcFace(
  c: CampaignState | null | undefined,
  code: string,
  key = code,
) {
  return isDreamchaserCampaign(c) && dcUpgraded(c, key) ? backFace(code) : code;
}

/**
 * The code a reprinted scenario card takes in this game: its Upgraded or
 * "Campaign Mode only" side once all of its checkboxes are marked (in a
 * Dream-chaser campaign), otherwise the original card.
 */
export const dcScenarioFace = (
  c: CampaignState | null | undefined,
  reprint: string,
) => (dcUpgraded(c, reprint) ? backFace(reprint) : DC_ORIGINAL[reprint]);
/**
 * An original card whose campaign side is printed on its back (The Havens
 * Burn, the Dream-chaser location, the Stormcaller of The City of Corsairs):
 * that side once all of its checkboxes are marked.
 */
export const dcCampaignSide = (
  c: CampaignState | null | undefined,
  original: string,
) => (dcUpgraded(c, original) ? backFace(original) : original);
/** Is this location Uncharted (a Lost Island, faceup)? */
export const isUncharted = (text?: string | null) =>
  /(^|\n)Uncharted\./.test(text ?? "");

/** The fleet's six ships: the four original Grey Havens ships and the expansion's two. */
export const FLEET: readonly { id: string; code: string; key: string }[] = [
  { id: "dream", code: DC_ORIGINAL[DC.dream], key: DC.dream },
  { id: "dawn", code: DC_ORIGINAL[DC.dawn], key: DC.dawn },
  { id: "dusk", code: DC.dusk, key: DC.dusk },
  { id: "glorinaith", code: DC.glorinaith, key: DC.glorinaith },
  { id: "narelenya", code: DC_ORIGINAL[DC.narelenya], key: DC.narelenya },
  { id: "silver", code: DC_ORIGINAL[DC.silver], key: DC.silver },
];
/**
 * The ships a Dream-chaser campaign prepares its fleet from: each on its
 * Upgraded side once its Campaign Log checkboxes are all marked.
 */
export const dreamchaserFleet = (c: CampaignState | null | undefined) =>
  FLEET.map((f) => (dcUpgraded(c, f.key) ? backFace(f.key) : f.code));
/** Is this code one of the fleet's six ships (either face)? */
export const isFleetShip = (code: string) =>
  FLEET.some((f) => dcBase(code) === dcBase(f.code));
/** The fleet ship a code belongs to ("dream", "dawn", …). */
export const fleetShip = (code: string) =>
  FLEET.find((f) => dcBase(code) === dcBase(f.code))?.id;
