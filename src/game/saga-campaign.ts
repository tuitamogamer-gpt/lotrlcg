// The Lord of the Rings saga campaign: the Campaign Log, the Campaign Pool and
// each scenario's campaign card (setup and resolution).
import type { CampaignState, GameState, ScenarioId, Unit } from "./types";
import { card, name } from "./cards";
import { enqueue, fx, get, log, make, requireRule, shuffle } from "./core";
import { isOneRing, isRingBearerCode } from "./lotr-saga-codes";
import { jdBalrog } from "./journey-dark-support";
import { BF } from "./breaking-fellowship-support";
import { effectiveTraits as effectiveTraitsOf } from "./expansion-passives";
import { fellowshipAragorn, ringBearer } from "./lotr-saga";
import {
  activeSeat,
  forOwner,
  playerOrder,
  seatIndices,
  seatView,
} from "./table";
import { score } from "./actions";
import { OF } from "./old-forest-support";

/** The campaign's scenarios in order (The Old Forest and Fog on the Barrow-downs follow A Shadow of the Past when included). */
export const SAGA_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "a-shadow-of-the-past",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
  "the-ring-goes-south",
  "journey-in-the-dark",
  "breaking-of-the-fellowship",
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
  "the-passage-of-the-marshes",
  "journey-to-the-cross-roads",
  "shelobs-lair",
  "the-passing-of-the-grey-company",
  "the-siege-of-gondor",
  "the-battle-of-the-pelennor-fields",
  "the-tower-of-cirith-ungol",
  "the-black-gate-opens",
  "mount-doom",
];
/** The Old Forest and Fog on the Barrow-downs (Parts 1.1 and 1.2): optional, after A Shadow of the Past. */
export const SAGA_INSERTS: readonly ScenarioId[] = [
  "the-old-forest",
  "fog-on-the-barrow-downs",
];
/** The Campaign Log's chapters in play order (Parts 1, 1.1, 1.2, 2 … 18). */
export const SAGA_CAMPAIGN_JOURNAL: readonly ScenarioId[] = [
  SAGA_CAMPAIGN_ORDER[0],
  ...SAGA_INSERTS,
  ...SAGA_CAMPAIGN_ORDER.slice(1),
];
/** A chapter's part number on its campaign card: "1", "1.1", "1.2", "2" … */
export const sagaChapterNumber = (id: ScenarioId) => {
  const insert = SAGA_INSERTS.indexOf(id);
  return insert >= 0
    ? `1.${insert + 1}`
    : String(SAGA_CAMPAIGN_ORDER.indexOf(id) + 1);
};
/** The chapters whose campaign cards are implemented. */
export const SAGA_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "a-shadow-of-the-past",
  "the-old-forest",
  "fog-on-the-barrow-downs",
  "a-knife-in-the-dark",
  "flight-to-the-ford",
  "the-ring-goes-south",
  "journey-in-the-dark",
  "breaking-of-the-fellowship",
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
  "the-passage-of-the-marshes",
  "journey-to-the-cross-roads",
  "shelobs-lair",
  "the-passing-of-the-grey-company",
  "the-siege-of-gondor",
  "the-battle-of-the-pelennor-fields",
  "the-tower-of-cirith-ungol",
  "the-black-gate-opens",
  "mount-doom",
];
/**
 * Chapters whose campaign cards let each player change hero cards without the
 * +1 threat penalty (The Ring Goes South, Helm's Deep, The Passage of the
 * Marshes).
 */
export const SAGA_FREE_CHANGES: readonly ScenarioId[] = [
  "the-ring-goes-south",
  "helms-deep",
  "the-passage-of-the-marshes",
  "the-passing-of-the-grey-company",
  "the-tower-of-cirith-ungol",
  "the-black-gate-opens",
  "mount-doom",
];
/**
 * The Mountain of Fire's chapters: Aragorn cannot be used at The Tower of
 * Cirith Ungol and Mount Doom, Frodo Baggins at The Black Gate Opens.
 */
export const MOF_CHAPTERS: readonly ScenarioId[] = [
  "the-tower-of-cirith-ungol",
  "the-black-gate-opens",
  "mount-doom",
];
/**
 * The Black Gate Opens cannot be won: in the campaign, the players' defeat
 * ends the chapter, and its resolution is recorded.
 */
export const SAGA_LOSS_CHAPTERS: readonly ScenarioId[] = [
  "the-black-gate-opens",
];
/** The Treason of Saruman's chapters: Aragorn leads, without Frodo or his burdens. */
export const TOS_CHAPTERS: readonly ScenarioId[] = [
  "the-uruk-hai",
  "helms-deep",
  "the-road-to-isengard",
];
/**
 * The Land of Shadow's chapters: no card titled "Aragorn" can be used, and the
 * burden sets of Helm's Deep and The Road to Isengard are left out.
 */
export const LOS_CHAPTERS: readonly ScenarioId[] = [
  "the-passage-of-the-marshes",
  "journey-to-the-cross-roads",
  "shelobs-lair",
];
/**
 * The Flame of the West's chapters: Aragorn leads, no card titled "Frodo
 * Baggins" can be used, and the burden sets of A Shadow of the Past, Flight to
 * the Ford, The Ring Goes South, The Passage of the Marshes and Shelob's Lair
 * are left out.
 */
export const FOTW_CHAPTERS: readonly ScenarioId[] = [
  "the-passing-of-the-grey-company",
  "the-siege-of-gondor",
  "the-battle-of-the-pelennor-fields",
];
export const SAGA = {
  underhill: "141017",
  ranger: "141018",
  healer: "141019",
  warrior: "141020",
  noble: "141021",
  gildor: "141077",
  delay: "141078",
  ringDraws: "141079",
  bogey: "147024",
  tom: "148021",
  sting: "142011",
  mithril: "142012",
  glamdring: "142013",
  anduril: "142014",
  phial: "142015",
  hairs: "142016",
  rope: "142017",
  lembas: "142018",
  lust: "142084",
  shadowFear: "142085",
  pursued: "142086",
  grief: "142087",
  wound: "142088",
  night: "142089",
  illFate: "142090",
  intimidation: "143015",
  hands: "143016",
  forewarned: "143017",
  leader: "143018",
  hope: "143019",
  palantir: "143020",
  counsels: "143021",
  voice: "143068",
  coneys: "144014",
  searchingEye: "144015",
  heavy: "144052",
  esquireRohan: "145014",
  esquireGondor: "145015",
  fear: "145016",
  wraith: "145062",
  army: "145068",
  banner: "145013",
  /** The Passing of the Grey Company's Army of the Dead enemy. */
  armyEnemy: "octgn:a25b4139-f1d0-4466-83f2-f06fa3e0c30b",
  /** The Siege of Gondor's Corsair Fleet (Corsair side). */
  corsairFleet: "octgn:0140d146-771e-4f19-9de8-d7cf0b4d8268",
  /** The Battle of the Pelennor Fields' Corsair Fleet (Gondor side, campaign mode only). */
  gondorFleet: "octgn:b002c7a6-f827-4a7d-8432-c3f2f995089e",
  gwaihir: "146041",
  /** The Tower of Cirith Ungol's Shagrat and Last of the Company. */
  shagrat: "octgn:a246d29f-f370-4308-828d-c1ff09029b4a",
  company: "octgn:ad4739ac-fd18-4add-9b83-860c1fcc2b54",
  /** The Black Gate Opens' Black Gate. */
  blackGate: "octgn:c6b0a8d2-32fe-4750-9270-7270cd5f062b",
  shadowCard: "octgn:307411f3-4a45-44ae-bc64-4e16deb97d10",
  forestCard: "octgn:088b62be-0f26-4a87-805a-277edd463c8c",
  fogCard: "octgn:d34c9025-6380-4294-be3f-01c992922830",
  knifeCard: "octgn:2efa631a-eb16-4078-84a5-18c7033b86f3",
  fordCard: "octgn:0ee09c42-34c9-41aa-aa98-b582608b15bb",
  southCard: "octgn:fb0f51c6-c96e-44f1-9f67-1235eb2351dc",
  darkCard: "octgn:a073c291-5f86-4b49-821e-d965baf369fa",
  breakingCard: "octgn:dfb04502-e86f-41bc-83a0-b77048b9668c",
  urukCard: "octgn:a54706fb-776c-4c00-b0ef-454b21673bcb",
  helmCard: "octgn:cf5fad0e-e1c3-4340-a467-567ff0611c6f",
  isengardCard: "octgn:cb2d88e5-d469-43c6-9d69-e0cf36e2862e",
  marshesCard: "octgn:61963ddc-1260-471f-afdf-96581602a444",
  crossroadsCard: "octgn:2b93afb6-38fd-4ded-bf92-ed86bc03635d",
  shelobCard: "octgn:cc77ab8d-1968-4607-b18d-7db3c3c186c7",
  greyCard: "octgn:c444788b-73ea-4729-a07a-593220479639",
  siegeCard: "octgn:949e2607-cbb5-4ae3-af26-f9d7e00e09d2",
  pelennorCard: "octgn:10557685-71b2-4f2e-b831-4b19d023ee46",
  cirithCard: "octgn:a27a3045-58aa-4cbe-ab36-90bc6e7a5cdb",
  gateCard: "octgn:9ffc1d82-10b3-4703-91e5-865407f0cc1e",
  doomCard: "octgn:271fa771-d678-461e-b5c6-483117059ed1",
} as const;
/** Each scenario's campaign card. */
export const SAGA_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "a-shadow-of-the-past": SAGA.shadowCard,
  "the-old-forest": SAGA.forestCard,
  "fog-on-the-barrow-downs": SAGA.fogCard,
  "a-knife-in-the-dark": SAGA.knifeCard,
  "flight-to-the-ford": SAGA.fordCard,
  "the-ring-goes-south": SAGA.southCard,
  "journey-in-the-dark": SAGA.darkCard,
  "breaking-of-the-fellowship": SAGA.breakingCard,
  "the-uruk-hai": SAGA.urukCard,
  "helms-deep": SAGA.helmCard,
  "the-road-to-isengard": SAGA.isengardCard,
  "the-passage-of-the-marshes": SAGA.marshesCard,
  "journey-to-the-cross-roads": SAGA.crossroadsCard,
  "shelobs-lair": SAGA.shelobCard,
  "the-passing-of-the-grey-company": SAGA.greyCard,
  "the-siege-of-gondor": SAGA.siegeCard,
  "the-battle-of-the-pelennor-fields": SAGA.pelennorCard,
  "the-tower-of-cirith-ungol": SAGA.cirithCard,
  "the-black-gate-opens": SAGA.gateCard,
  "mount-doom": SAGA.doomCard,
};
/** Old Man Willow's code (The Old Forest). */
const OLD_FOREST_WILLOW = OF.willow;
/** Old Man Willow (The Old Forest): 12 damage tokens earn Old Bogey-stories. */
export const OLD_MAN_WILLOW_DAMAGE = 12;
/** The Flight to the Ford burden deck (Weight of the Ring … Overcome by Terror). */
export const FORD_BURDENS = ["141080", "141081", "141082", "141083", "141084"];
export const SAGA_BOONS: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
  SAGA.gildor,
  SAGA.bogey,
  SAGA.tom,
  SAGA.sting,
  SAGA.mithril,
  SAGA.glamdring,
  SAGA.anduril,
  SAGA.phial,
  SAGA.hairs,
  SAGA.rope,
  SAGA.lembas,
  SAGA.intimidation,
  SAGA.hands,
  SAGA.forewarned,
  SAGA.leader,
  SAGA.hope,
  SAGA.palantir,
  SAGA.coneys,
  SAGA.army,
  SAGA.esquireRohan,
  SAGA.esquireGondor,
  SAGA.gwaihir,
];
export const SAGA_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.ringDraws,
  ...FORD_BURDENS,
  SAGA.lust,
  SAGA.shadowFear,
  SAGA.pursued,
  SAGA.grief,
  SAGA.wound,
  SAGA.night,
  SAGA.illFate,
  SAGA.counsels,
  SAGA.voice,
  SAGA.searchingEye,
  SAGA.heavy,
  SAGA.fear,
  SAGA.wraith,
];
/** The burden sets of A Shadow of the Past, Flight to the Ford and The Ring Goes South. */
export const FRODO_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.ringDraws,
  ...FORD_BURDENS,
  SAGA.lust,
];
/** The Uruk-hai's Skill boons and the trait each one's Setup asks for. */
export const SKILL_BOONS: Record<string, string> = {
  [SAGA.intimidation]: "Warrior",
  [SAGA.hands]: "Healer",
  [SAGA.forewarned]: "Ranger",
  [SAGA.leader]: "Noble",
};
/** The Ring Goes South's boon cards: player cards the players may include in their decks. */
export const SOUTH_BOONS: readonly string[] = [
  SAGA.sting,
  SAGA.mithril,
  SAGA.glamdring,
  SAGA.anduril,
];
/** Earned boons with a player card back that join a player's deck. */
export const SAGA_DECK_BOONS: readonly string[] = [
  ...SOUTH_BOONS,
  SAGA.palantir,
];
/** Breaking of the Fellowship's Gifts of Lórien. */
export const GIFT_BOONS: readonly string[] = [
  SAGA.phial,
  SAGA.hairs,
  SAGA.rope,
  SAGA.lembas,
];
/** Burdens that function like player cards, earned by each player. */
export const DECK_BURDENS: readonly string[] = [
  SAGA.counsels,
  SAGA.searchingEye,
];
/** The burden sets of Helm's Deep and The Road to Isengard. */
export const HD_RTI_BURDENS: readonly string[] = [SAGA.counsels, SAGA.voice];
/**
 * The burden sets The Flame of the West's campaign cards remove: A Shadow of
 * the Past, Flight to the Ford, The Ring Goes South, The Passage of the
 * Marshes and Shelob's Lair. The cards say "from the encounter deck", but The
 * Searching Eye and A Heavy Burden are never there: listing their sets leaves
 * them out of the chapters as well.
 */
export const FOTW_LEFT_BURDENS: readonly string[] = [
  ...FRODO_BURDENS,
  SAGA.searchingEye,
  SAGA.heavy,
];
/**
 * The burden sets The Tower of Cirith Ungol's and Mount Doom's campaign cards
 * remove: Helm's Deep, The Road to Isengard and The Passing of the Grey
 * Company (Overcome by Fear stays off the threat dials).
 */
export const MOF_LEFT_BURDENS: readonly string[] = [
  ...HD_RTI_BURDENS,
  SAGA.fear,
];
/** Is a burden left out of a chapter by its campaign card? */
export const sagaBurdenLeftOut = (id: ScenarioId, code: string) =>
  (TOS_CHAPTERS.includes(id) && FRODO_BURDENS.includes(code)) ||
  (LOS_CHAPTERS.includes(id) && HD_RTI_BURDENS.includes(code)) ||
  ((FOTW_CHAPTERS.includes(id) || id === "the-black-gate-opens") &&
    FOTW_LEFT_BURDENS.includes(code)) ||
  (["the-tower-of-cirith-ungol", "mount-doom"].includes(id) &&
    MOF_LEFT_BURDENS.includes(code));
/** Item boons a player may set aside at The Tower of Cirith Ungol (Andúril excluded). */
export const sagaItemBoons = (c: CampaignState) =>
  c.boons.filter(
    (code) =>
      code !== SAGA.anduril && (card(code).traits ?? "").includes("Item"),
  );
/** Boons the players earn copy by copy, each joining a player's deck (Brace of Coneys). */
export const COPY_BOONS: readonly string[] = [SAGA.coneys];
/** Burden objectives whose Setup adds them to the staging area (besides Gandalf's Delay). */
export const STAGED_BURDENS: readonly string[] = [SAGA.grief, SAGA.wound];
/**
 * Burdens whose own Setup places them (Gandalf's Delay, A Heavy Burden,
 * Overcome by Fear, Wraith on Wings): never shuffled into the encounter deck.
 */
export const SETUP_BURDENS: readonly string[] = [
  SAGA.delay,
  SAGA.heavy,
  SAGA.fear,
  SAGA.wraith,
];
/** Boons with the Permanent keyword. */
export const SAGA_PERMANENT: readonly string[] = [
  SAGA.underhill,
  SAGA.ranger,
  SAGA.healer,
  SAGA.warrior,
  SAGA.noble,
  SAGA.intimidation,
  SAGA.hands,
  SAGA.forewarned,
  SAGA.leader,
  SAGA.hope,
  SAGA.esquireRohan,
  SAGA.esquireGondor,
];
/** A Knife in the Dark's resolution: each player may choose one of these. */
export const KNIFE_BOONS = [SAGA.ranger, SAGA.healer, SAGA.warrior, SAGA.noble];
/** The Campaign Log records Permanent cards attached to the Ring-bearer under this key. */
export const RING_BEARER_KEY = "ring-bearer";
/**
 * The Campaign Log records Permanent cards attached to the Fellowship Aragorn
 * under this key: they follow him from box to box, and a recorded Aragorn's
 * Permanent cards are transferred to him.
 */
export const ARAGORN_KEY = "aragorn";

export const isSagaCampaign = (c?: CampaignState | null) => c?.kind === "saga";
export const sagaCampaignGame = (s: GameState) => isSagaCampaign(s.campaign);
export function newSagaCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "saga",
    ...(seatHeroes ? { seatHeroes: [...seatHeroes] } : {}),
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: [],
    mendorSaved: false,
    resolution: null,
  };
}
/**
 * The chapters the players may play next: after A Shadow of the Past they may
 * include The Old Forest and Fog on the Barrow-downs (in that order, each
 * optional) before A Knife in the Dark.
 */
export function sagaChapterOptions(
  c: Pick<CampaignState, "completed">,
): ScenarioId[] {
  const done = c.completed.map((q) => q.scenarioId);
  if (!done.length) return [SAGA_CAMPAIGN_ORDER[0]];
  const main =
    SAGA_CAMPAIGN_ORDER[done.filter((id) => !SAGA_INSERTS.includes(id)).length];
  const last = done[done.length - 1];
  const inserts =
    last === "a-shadow-of-the-past"
      ? [...SAGA_INSERTS]
      : last === "the-old-forest"
        ? ["fog-on-the-barrow-downs" as ScenarioId]
        : [];
  return [...inserts, ...(main ? [main] : [])];
}
/** The main chapter that follows (the inserts are chosen explicitly). */
export const nextSagaChapter = (c: CampaignState) =>
  sagaChapterOptions(c).at(-1);
export const sagaChapterSupported = (id: ScenarioId | undefined) =>
  !!id && SAGA_CAMPAIGN_SUPPORTED.includes(id);
export const sagaCampaignCard = (s: GameState) =>
  sagaCampaignGame(s) ? SAGA_CAMPAIGN_CARDS[s.scenarioId] : undefined;
/**
 * A player's starting threat penalty: the Campaign Log's, plus that player's
 * own (The Passage of the Marshes' permanent +2).
 */
export const sagaPlayerPenalty = (
  c: CampaignState | null | undefined,
  seat: number,
) =>
  (c?.threatPenalty ?? 0) +
  (isSagaCampaign(c) ? (c!.playerPenalty?.[seat] ?? 0) : 0);

/** Gandalf's Delay: each player draws 1 less card in their starting hand. */
export const sagaStartingHandPenalty = (s: GameState) =>
  sagaCampaignGame(s) &&
  (s.scenarioId === "a-shadow-of-the-past" ||
    (s.campaign!.burdens.includes(SAGA.delay) &&
      !sagaBurdenLeftOut(s.scenarioId, SAGA.delay)))
    ? 1
    : 0;

/** Cards a campaign Setup added to the hand: kept through a mulligan. */
export const sagaSetupHandIds = (s: GameState) =>
  sagaCampaignGame(s)
    ? (s.sagaCards?.setupHand ?? []).filter((id) =>
        s.hand.some((u) => u.id === id),
      )
    : [];
/** The names of the fallen heroes: no version of them can be used (The Road Darkens FAQ). */
export const fallenNames = (c: CampaignState) =>
  c.fallen.map((code) => card(code).name);
/**
 * Before the starting hands: each earned player-card boon joins the deck the
 * Campaign Log assigns it to (The Ring Goes South deals its own boons), and
 * no version of a fallen hero can be used.
 */
export function sagaCampaignDeckSetup(s: GameState) {
  const c = s.campaign;
  if (!isSagaCampaign(c)) return;
  const fallen = fallenNames(c!);
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const removed = s.deck.filter((code) => fallen.includes(card(code).name));
      if (removed.length) {
        s.deck = s.deck.filter((code) => !fallen.includes(card(code).name));
        log(
          s,
          `The Campaign Log: ${removed.map((code) => card(code).name).join(", ")} cannot be used (a fallen hero).`,
        );
      }
    });
  // The Treason of Saruman: no card titled "Frodo Baggins" can be used; The
  // Land of Shadow: no card titled "Aragorn".
  const title = sagaForbiddenTitle(s.scenarioId);
  if (title)
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        if (s.deck.some((code) => card(code).name === title)) {
          s.deck = s.deck.filter((code) => card(code).name !== title);
          log(
            s,
            `${card(SAGA_CAMPAIGN_CARDS[s.scenarioId] ?? "").name || "The Lord of the Rings"}: no card titled ${title} can be used in this chapter.`,
          );
        }
      });
  if (s.scenarioId === "the-ring-goes-south") return;
  const seats = playerOrder(s);
  for (const [code, seat] of Object.entries(c!.deckBoons ?? {}))
    if (
      c!.boons.includes(code) &&
      SAGA_DECK_BOONS.includes(code) &&
      seats.includes(seat)
    )
      forOwner(s, seat, () => s.deck.push(code));
  // Each earned copy of Brace of Coneys joins the deck the log assigns it to.
  for (const [code, decks] of Object.entries(c!.boonCopies ?? {}))
    if (c!.boons.includes(code) && COPY_BOONS.includes(code))
      for (const seat of decks)
        if (seat !== null && seats.includes(seat))
          forOwner(s, seat, () => s.deck.push(code));
}
/**
 * A mulligan redraws the starting hand before the campaign card's Setup: the
 * cards that Setup shuffled into the deck are held out of the new hand.
 */
export function sagaHoldLateDeck(s: GameState): string[] {
  const held: string[] = [];
  for (const code of s.sagaCards?.lateDeck?.[activeSeat(s)] ?? []) {
    const i = s.deck.indexOf(code);
    if (i < 0) continue;
    s.deck.splice(i, 1);
    held.push(code);
  }
  return held;
}
export function sagaReturnLateDeck(s: GameState, held: readonly string[]) {
  if (!held.length) return;
  s.deck.push(...held);
  shuffle(s, s.deck);
}
/** The card title a chapter's campaign rules forbid. */
export const sagaForbiddenTitle = (id: ScenarioId) =>
  TOS_CHAPTERS.includes(id) ||
  FOTW_CHAPTERS.includes(id) ||
  id === "the-black-gate-opens"
    ? "Frodo Baggins"
    : LOS_CHAPTERS.includes(id) ||
        id === "the-tower-of-cirith-ungol" ||
        id === "mount-doom"
      ? "Aragorn"
      : undefined;
/**
 * A card a campaign Setup shuffles into a player's deck after the starting
 * hands; a mulligan holds it out.
 */
export function sagaLateDeckCard(s: GameState, code: string, seat: number) {
  forOwner(s, seat, () => {
    s.deck.push(code);
    shuffle(s, s.deck);
  });
  const lists = ((s.sagaCards ??= { ringDraws: 0, underhill: [] }).lateDeck ??=
    []);
  while (lists.length <= seat) lists.push([]);
  lists[seat].push(code);
}
/** Attach a campaign card (a Permanent boon) to a hero. */
function attachBoon(s: GameState, hero: Unit, code: string) {
  if (hero.attachments.some((a) => a.code === code)) return;
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: hero.owner,
  });
}
/** Take a player card out of the players' hands, decks and discard piles (the first player's first). */
function takePlayerCard(s: GameState, code: string, first: number) {
  for (const p of [first, ...playerOrder(s).filter((x) => x !== first)]) {
    let found = false;
    forOwner(s, p, () => {
      const h = s.hand.findIndex((u) => u.code === code);
      const d = s.deck.indexOf(code);
      const x = s.discard.indexOf(code);
      if (h >= 0) s.hand.splice(h, 1);
      else if (d >= 0) s.deck.splice(d, 1);
      else if (x >= 0) s.discard.splice(x, 1);
      found = h >= 0 || d >= 0 || x >= 0;
    });
    if (found) return;
  }
}
/**
 * The Battle of the Pelennor Fields: the recorded Harad enemies are set
 * aside, Aragorn is set aside with Andúril and Banner of Elendil, and The
 * Corsair Fleet (Gondor side) enters the staging area with the resources the
 * log records.
 */
function pelennorSetup(s: GameState, c: CampaignState, first: number) {
  const q = (s.sagaCards ??= { ringDraws: 0, underhill: [] });
  q.haradAside = (c.blackGateEnemies ?? []).filter((code) =>
    (card(code).traits ?? "").includes("Harad"),
  );
  const aragorn = fellowshipAragorn(s);
  if (aragorn) {
    for (const code of [SAGA.anduril, SAGA.banner]) {
      takePlayerCard(s, code, first);
      if (!aragorn.attachments.some((a) => a.code === code))
        aragorn.attachments.push({
          id: `a${s.nextId++}`,
          code,
          exhausted: false,
          owner: first,
        });
    }
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        s.heroes = s.heroes.filter((u) => u.id !== aragorn.id);
      });
    q.aragornAside = aragorn;
  }
  const fleet = make(s, SAGA.gondorFleet);
  fleet.resources = c.corsairFleet ?? 0;
  s.staging.push(fleet);
}
/**
 * The campaign setup, after the scenario's own setup: Permanent boons are
 * attached to their recorded heroes, the Campaign Pool's encounter-backed
 * boons and its burdens join the encounter deck (Gandalf's Delay goes to the
 * staging area) and the campaign card's Setup resolves.
 */
export function sagaCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isSagaCampaign(c)) return;
  const los = LOS_CHAPTERS.includes(s.scenarioId);
  const first = s.table?.first ?? 0;
  // The burden sets a chapter's campaign card removes: The Treason of Saruman
  // leaves out those of A Shadow of the Past, Flight to the Ford and The Ring
  // Goes South; The Land of Shadow those of Helm's Deep and The Road to
  // Isengard; The Flame of the West Frodo's and the Land of Shadow's.
  const left = (code: string) => sagaBurdenLeftOut(s.scenarioId, code);
  // The Uruk-hai's campaign card: "Remove Gildor Inglorion and Mr. Underhill
  // from the Campaign Pool."
  if (s.scenarioId === "the-uruk-hai") {
    c!.boons = c!.boons.filter(
      (code) => code !== SAGA.gildor && code !== SAGA.underhill,
    );
    for (const [key, codes] of Object.entries(c!.permanent)) {
      const rest = codes.filter((code) => code !== SAGA.underhill);
      if (rest.length) c!.permanent[key] = rest;
      else delete c!.permanent[key];
    }
  }
  const bearer = ringBearer(s);
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      for (const hero of s.heroes)
        for (const code of c!.permanent[hero.code] ?? [])
          attachBoon(s, hero, code);
    });
  if (bearer)
    for (const code of c!.permanent[RING_BEARER_KEY] ?? [])
      attachBoon(s, bearer, code);
  // The Fellowship Aragorn carries the Permanent cards recorded for him.
  const aragorn = fellowshipAragorn(s);
  if (aragorn)
    for (const code of c!.permanent[ARAGORN_KEY] ?? [])
      attachBoon(s, aragorn, code);
  const encounter = [
    // Boons with an encounter card back: Gildor Inglorion and Gwaihir.
    ...c!.boons.filter((code) => code === SAGA.gildor || code === SAGA.gwaihir),
    ...c!.burdens.filter(
      (code) =>
        !SETUP_BURDENS.includes(code) &&
        !STAGED_BURDENS.includes(code) &&
        !DECK_BURDENS.includes(code) &&
        !left(code),
    ),
  ];
  if (s.scenarioId === "the-road-to-isengard") encounter.push(SAGA.voice);
  const staged = c!.burdens.filter(
    (code) => STAGED_BURDENS.includes(code) && !left(code),
  );
  // Journey in the Dark's campaign card.
  if (s.scenarioId === "journey-in-the-dark") {
    encounter.push(SAGA.pursued, SAGA.shadowFear);
    staged.push(SAGA.wound, SAGA.grief);
  }
  for (const code of new Set(staged))
    if (!s.staging.some((u) => u.code === code)) s.staging.push(make(s, code));
  // A Heavy Burden: "Setup: Attach to the Ring-bearer." (Shelob's Lair's
  // campaign card, then its own Setup once earned.)
  if (
    bearer &&
    !left(SAGA.heavy) &&
    (s.scenarioId === "shelobs-lair" || c!.burdens.includes(SAGA.heavy)) &&
    !bearer.attachments.some((a) => a.code === SAGA.heavy)
  )
    bearer.attachments.push({
      id: `a${s.nextId++}`,
      code: SAGA.heavy,
      exhausted: false,
    });
  // Overcome by Fear: "Setup: Attach to your threat dial." It returns to the
  // threat dial of each player The Passing of the Grey Company recorded.
  if (
    c!.burdens.includes(SAGA.fear) &&
    !left(SAGA.fear) &&
    s.scenarioId !== "the-passing-of-the-grey-company"
  )
    for (const seat of (c!.threatDials ?? []).filter((x) =>
      playerOrder(s).includes(x),
    ))
      forOwner(s, seat, () => {
        if (!(s.threatAttachments ?? []).some((a) => a.code === SAGA.fear))
          (s.threatAttachments ??= []).push({
            id: `a${s.nextId++}`,
            code: SAGA.fear,
            exhausted: false,
          });
      });
  // Wraith on Wings: "Setup: Add Wraith on Wings to the staging area." (each
  // earned copy).
  if (
    c!.burdens.includes(SAGA.wraith) &&
    !left(SAGA.wraith) &&
    s.scenarioId !== "the-battle-of-the-pelennor-fields"
  )
    for (let i = 0; i < (c!.burdenCopies?.[SAGA.wraith] ?? 1); i++)
      s.staging.push(make(s, SAGA.wraith));
  // The Tower of Cirith Ungol: each player sets an Item boon aside.
  if (s.scenarioId === "the-tower-of-cirith-ungol")
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaItemAside", { player }));
  // Mount Doom: "Place X resource tokens on this card, where X is the number
  // of resource tokens on The Black Gate, as recorded in the campaign log."
  if (s.scenarioId === "mount-doom")
    (s.sagaCards ??= { ringDraws: 0, underhill: [] }).doomTokens =
      c!.blackGateTokens ?? 0;
  // Army of the Dead: "Setup: The first player takes control of Army of the
  // Dead."
  if (c!.boons.includes(SAGA.army))
    forOwner(s, first, () => {
      if (s.allies.some((u) => u.code === SAGA.army)) return;
      const army = make(s, SAGA.army);
      army.owner = first;
      army.controller = first;
      s.allies.push(army);
    });
  // The Passing of the Grey Company, The Siege of Gondor and The Black Gate
  // Opens: "The first player may raise each player's threat by 1 to search
  // his deck for Andúril."
  if (
    [
      "the-passing-of-the-grey-company",
      "the-siege-of-gondor",
      "the-black-gate-opens",
    ].includes(s.scenarioId) &&
    seatView(s, first).deck.includes(SAGA.anduril)
  )
    enqueue(s, fx("sagaAndurilSearch", { player: first }));
  // The Battle of the Pelennor Fields' campaign card.
  if (s.scenarioId === "the-battle-of-the-pelennor-fields")
    pelennorSetup(s, c!, first);
  // Journey to the Cross-roads' campaign card: each player chooses resources
  // for their heroes or a copy of Brace of Coneys for their deck.
  if (s.scenarioId === "journey-to-the-cross-roads")
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaCrossroadsChoice", { player }));
  // Breaking of the Fellowship's campaign card: starting with the first
  // player, each player chooses one Gift of Lórien for a hero they control.
  if (s.scenarioId === "breaking-of-the-fellowship") {
    encounter.push(SAGA.night, SAGA.illFate);
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaGiftChoice", { player }));
  } else
    // An earned Gift: "Setup: Attach to a hero in play."
    for (const code of GIFT_BOONS.filter((g) => c!.boons.includes(g)))
      enqueue(s, fx("sagaGiftSetup", { code, player: s.table?.first ?? 0 }));
  let delay = c!.burdens.includes(SAGA.delay) && !left(SAGA.delay);
  if (s.scenarioId === "a-shadow-of-the-past") {
    // A Shadow of the Past's campaign card.
    if (bearer) attachBoon(s, bearer, SAGA.underhill);
    delay = true;
    encounter.push(SAGA.gildor, SAGA.ringDraws);
  }
  if (delay && !s.staging.some((u) => u.code === SAGA.delay))
    s.staging.push(make(s, SAGA.delay));
  // Old Bogey-stories: the first player attaches it to a hero in play (the
  // Old Forest's campaign card, or its own Setup once earned).
  if (s.scenarioId === "the-old-forest" || c!.boons.includes(SAGA.bogey))
    enqueue(s, fx("sagaBogeySetup", { player: s.table?.first ?? 0 }));
  // Ho! Tom Bombadil!: the first player adds it to their hand.
  if (c!.boons.includes(SAGA.tom)) {
    forOwner(s, s.table?.first ?? 0, () => {
      const tom = make(s, SAGA.tom);
      tom.owner = s.table?.first ?? 0;
      s.hand.push(tom);
      ((s.sagaCards ??= { ringDraws: 0, underhill: [] }).setupHand ??= []).push(
        tom.id,
      );
    });
    log(
      s,
      "Ho! Tom Bombadil! (a campaign boon) is added to the first player's hand.",
      "good",
    );
  }
  // The Ring Goes South's campaign card: the players have earned Sting,
  // Mithril Shirt, Glamdring and Andúril; each player chooses one for their
  // hand, and the rest are shuffled into the first player's deck.
  if (s.scenarioId === "the-ring-goes-south") {
    for (const code of SOUTH_BOONS)
      if (!c!.boons.includes(code)) c!.boons.push(code);
    (s.sagaCards ??= { ringDraws: 0, underhill: [] }).southPending = [
      ...SOUTH_BOONS,
    ];
    for (const player of playerOrder(s))
      enqueue(s, fx("sagaSouthChoice", { player }));
    enqueue(s, fx("sagaSouthDeal", { player: s.table?.first ?? 0 }));
  }
  for (const code of [...new Set(encounter)])
    if (!s.encounterDeck.includes(code)) s.encounterDeck.push(code);
  shuffle(s, s.encounterDeck);
  // Earned burdens with a player card back (Poisoned Counsels, The Searching
  // Eye) are shuffled into their players' decks after the starting hands; The
  // Passage of the Marshes' campaign card gives each player The Searching Eye.
  for (const [code, seats] of Object.entries(c!.deckBurdens ?? {}))
    if (c!.burdens.includes(code) && !left(code))
      for (const seat of seats.filter((x) => playerOrder(s).includes(x)))
        sagaLateDeckCard(s, code, seat);
  if (s.scenarioId === "the-passage-of-the-marshes")
    for (const seat of playerOrder(s))
      sagaLateDeckCard(s, SAGA.searchingEye, seat);
  log(
    s,
    `Campaign mode · ${card(SAGA_CAMPAIGN_CARDS[s.scenarioId] ?? "").name || "The Lord of the Rings"}: ${[
      ...(s.scenarioId === "a-shadow-of-the-past"
        ? [
            "Mr. Underhill is attached to the Ring-bearer, Gandalf's Delay waits in the staging area, and Gildor Inglorion and The Ring Draws Them are shuffled into the encounter deck",
          ]
        : []),
      ...(s.scenarioId === "the-passage-of-the-marshes"
        ? ["each player shuffles 1 copy of The Searching Eye into their deck"]
        : []),
      ...(s.scenarioId === "shelobs-lair"
        ? ["A Heavy Burden is attached to the Ring-bearer"]
        : []),
      ...(los
        ? [
            "the burdens of Helm's Deep and The Road to Isengard are left out, and no card titled Aragorn can be used",
          ]
        : []),
      ...(FOTW_CHAPTERS.includes(s.scenarioId)
        ? [
            "the burdens of A Shadow of the Past, Flight to the Ford, The Ring Goes South, The Passage of the Marshes and Shelob's Lair are left out, and no card titled Frodo Baggins can be used",
          ]
        : []),
      ...(s.scenarioId === "the-battle-of-the-pelennor-fields"
        ? [
            `Aragorn is set aside with Andúril and Banner of Elendil, The Corsair Fleet enters the staging area with ${c!.corsairFleet ?? 0} resources${s.sagaCards?.haradAside?.length ? `, and ${blackGateNote(s.sagaCards.haradAside)} ${s.sagaCards.haradAside.length === 1 ? "waits" : "wait"} for stage 5B` : ""}`,
          ]
        : []),
      ...(c!.boons.length || c!.burdens.some((code) => !left(code))
        ? [
            `the Campaign Pool adds ${[
              ...c!.boons,
              ...c!.burdens.filter((code) => !left(code)),
            ]
              .map((code) => card(code).name)
              .join(", ")}`,
          ]
        : []),
    ].join("; ")}.`,
    "chapter",
  );
}

/** Is the current chapter over for the campaign: won, or The Black Gate Opens ended? */
export const sagaChapterComplete = (s: GameState) =>
  s.status === "won" ||
  (s.status === "lost" &&
    isSagaCampaign(s.campaign) &&
    SAGA_LOSS_CHAPTERS.includes(s.scenarioId) &&
    s.campaign!.completed.at(-1)?.scenarioId === s.scenarioId);
/**
 * The Black Gate Opens in the campaign: the players' defeat ends the chapter
 * and records its resolution (called after each action).
 */
export function sagaCampaignLossCompletion(s: GameState) {
  if (
    s.status === "lost" &&
    isSagaCampaign(s.campaign) &&
    SAGA_LOSS_CHAPTERS.includes(s.scenarioId) &&
    !s.campaign!.completed.some((q) => q.scenarioId === s.scenarioId)
  )
    resolveSagaCampaign(s);
}
/** Burden cards of the Campaign Pool's kind anywhere the Flight to the Ford resolution looks. */
function burdensInPlay(s: GameState) {
  const units = [
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
    ...seatIndices(s).flatMap((p) => [
      ...seatView(s, p).heroes,
      ...seatView(s, p).allies,
      ...seatView(s, p).engaged,
    ]),
  ];
  return [
    ...units.map((u) => u.code),
    ...units.flatMap((u) => u.attachments.map((a) => a.code)),
    ...units.flatMap((u) => u.shadows ?? []),
    ...s.encounterDeck,
    ...s.encounterDiscard,
  ].filter((code) => SAGA_BURDENS.includes(code));
}
/**
 * After a win: fallen heroes are recorded (their Permanent cards leave the
 * Campaign Pool), the scenario joins the log and the campaign card's
 * resolution either resolves at once or waits for the players' choices.
 */
export function resolveSagaCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  // The Black Gate Opens: "If a hero is in its controller's discard pile, do
  // not add that hero's name to the list of fallen heroes."
  const fallen =
    s.scenarioId === "the-black-gate-opens"
      ? []
      : seatIndices(s).flatMap((i) => {
          const p = seatView(s, i);
          return p.startingHeroes.filter((code) => p.discard.includes(code));
        });
  // Breaking of the Fellowship: "If Fallen into Evil is attached to a hero,
  // add that hero to the list of Fallen Heroes in the Campaign Log."
  if (s.scenarioId === "breaking-of-the-fellowship")
    for (const f of s.breakingFellowship?.fallen ?? []) {
      const u = get(s, f.id);
      if (u?.attachments.some((a) => a.code === BF.fallen)) fallen.push(u.code);
    }
  for (const code of fallen) {
    if (!c.fallen.includes(code)) c.fallen.push(code);
    for (const x of c.permanent[code] ?? []) {
      const pool = SAGA_BURDENS.includes(x) ? c.burdens : c.boons;
      const i = pool.indexOf(x);
      if (i >= 0) pool.splice(i, 1);
    }
    delete c.permanent[code];
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  c.resolution = null;
  // The Uruk-hai is won by rescuing the captives.
  if (s.scenarioId === "the-uruk-hai") delete c.captives;
  // Boons whose cost removed them from the Campaign Pool (Ho! Tom Bombadil!).
  const spent = (s.sagaCards?.spent ?? []).filter((code) =>
    c.boons.includes(code),
  );
  for (const code of spent) c.boons.splice(c.boons.indexOf(code), 1);
  // Burdens Seat of Seeing removed from the game.
  for (const code of s.sagaCards?.cleared ?? []) {
    const i = c.burdens.indexOf(code);
    if (i >= 0) c.burdens.splice(i, 1);
  }
  if (spent.length)
    log(
      s,
      `${spent.map((code) => card(code).name).join(", ")} ${spent.length === 1 ? "is" : "are"} removed from the Campaign Pool.`,
    );
  if (s.scenarioId === "flight-to-the-ford") {
    const earned = [...new Set(burdensInPlay(s))].filter(
      (code) => !c.burdens.includes(code),
    );
    c.burdens.push(...earned);
    log(
      s,
      earned.length
        ? `Flight to the Ford · Resolution: ${earned.map((code) => card(code).name).join(", ")} ${earned.length === 1 ? "is" : "are"} added to the Campaign Pool.`
        : "Flight to the Ford · Resolution: no burden card is in play, in the encounter deck or in the discard pile.",
      "good",
    );
  } else if (s.scenarioId === "the-old-forest") {
    const willow = [
      ...s.staging,
      ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
    ].find((u) => u.code === OLD_FOREST_WILLOW);
    const earned =
      (willow?.damage ?? 0) >= OLD_MAN_WILLOW_DAMAGE &&
      !c.boons.includes(SAGA.bogey);
    if (earned) c.boons.push(SAGA.bogey);
    log(
      s,
      earned
        ? `The Old Forest · Resolution: Old Man Willow has ${willow!.damage} damage; Old Bogey-stories is earned.`
        : `The Old Forest · Resolution: Old Man Willow has ${willow?.damage ?? 0} damage (12 are needed); Old Bogey-stories is not earned.`,
      "good",
    );
  } else if (s.scenarioId === "journey-in-the-dark" && jdBalrog(s)) {
    // "If The Balrog is still in play, the first player must choose all 4
    // burden cards instead."
    const earned = [SAGA.pursued, SAGA.shadowFear, SAGA.wound, SAGA.grief];
    for (const code of earned)
      if (!c.burdens.includes(code)) c.burdens.push(code);
    log(
      s,
      "Journey in the Dark · Resolution: The Balrog is still in play; Pursued by the Enemy, Shadow of Fear, Grievous Wound and Overcome by Grief are added to the Campaign Pool.",
      "good",
    );
  } else if (s.scenarioId === "the-ring-goes-south") {
    // "If Lust for the Ring is attached to a hero, the players have earned
    // that burden."
    const lusted = seatIndices(s).some((p) =>
      seatView(s, p).heroes.some((h) =>
        h.attachments.some((a) => a.code === SAGA.lust),
      ),
    );
    if (lusted && !c.burdens.includes(SAGA.lust)) c.burdens.push(SAGA.lust);
    log(
      s,
      lusted
        ? "The Ring Goes South · Resolution: Lust for the Ring is attached to a hero; the players have earned that burden."
        : "The Ring Goes South · Resolution: Lust for the Ring is not attached to a hero.",
      "good",
    );
  } else if (s.scenarioId === "helms-deep") {
    // "Each player with a copy of Poisoned Counsels in his hand, deck or
    // discard pile has earned that burden."
    const seats = playerOrder(s).filter((p) => {
      const v = seatView(s, p);
      return (
        v.hand.some((u) => u.code === SAGA.counsels) ||
        v.deck.includes(SAGA.counsels) ||
        v.discard.includes(SAGA.counsels)
      );
    });
    if (seats.length) {
      if (!c.burdens.includes(SAGA.counsels)) c.burdens.push(SAGA.counsels);
      c.deckBurdens = {
        ...(c.deckBurdens ?? {}),
        [SAGA.counsels]: [
          ...new Set([...(c.deckBurdens?.[SAGA.counsels] ?? []), ...seats]),
        ],
      };
    }
    log(
      s,
      seats.length
        ? `Helm's Deep · Resolution: ${seats.map((p) => (s.table ? `Player ${p + 1}` : "you")).join(", ")} ${seats.length === 1 && !s.table ? "have" : seats.length === 1 ? "has" : "have"} earned Poisoned Counsels.`
        : "Helm's Deep · Resolution: no player has a copy of Poisoned Counsels.",
      "good",
    );
  } else if (s.scenarioId === "the-road-to-isengard") {
    const hands = playerOrder(s).map((p) => seatView(s, p).hand.length);
    const voice = hands.some((n) => n <= 3);
    const palantir = hands.some((n) => n >= 3);
    if (voice && !c.burdens.includes(SAGA.voice)) c.burdens.push(SAGA.voice);
    if (palantir && !c.boons.includes(SAGA.palantir)) {
      c.boons.push(SAGA.palantir);
      c.deckBoons = {
        ...(c.deckBoons ?? {}),
        [SAGA.palantir]: s.table?.first ?? 0,
      };
    }
    log(
      s,
      `The Road to Isengard · Resolution: ${[
        ...(voice ? ["the players have earned Saruman's Voice"] : []),
        ...(palantir
          ? ["the first player has earned the Palantír of Orthanc"]
          : []),
      ].join("; ")}.`,
      "good",
    );
  } else if (s.scenarioId === "journey-to-the-cross-roads") {
    // "Each player who chose to shuffle a copy of Brace of Coneys into his
    // deck during setup has earned that boon. ... Record the name and quantity
    // of each enemy underneath The Black Gate in the notes section."
    const seats = (s.sagaCards?.coneys ?? []).filter((p) =>
      playerOrder(s).includes(p),
    );
    if (seats.length) {
      if (!c.boons.includes(SAGA.coneys)) c.boons.push(SAGA.coneys);
      c.boonCopies = {
        ...(c.boonCopies ?? {}),
        [SAGA.coneys]: [...(c.boonCopies?.[SAGA.coneys] ?? []), ...seats],
      };
    }
    c.blackGateEnemies = [...(s.crossRoads?.underBlackGate ?? [])];
    log(
      s,
      `Journey to the Cross-roads · Resolution: ${
        seats.length
          ? `${seats.length} ${seats.length === 1 ? "copy" : "copies"} of Brace of Coneys ${seats.length === 1 ? "is" : "are"} earned`
          : "no player earned Brace of Coneys"
      }; the Campaign Log records ${blackGateNote(c.blackGateEnemies) || "no enemy"} under The Black Gate.`,
      "good",
    );
  } else if (s.scenarioId === "the-passing-of-the-grey-company") {
    // "Add each copy of Overcome by Fear attached to a player's threat dial to
    // the campaign pool and record the name of each player it was attached
    // to. If Army of the Dead is in the victory display, add the Army of the
    // Dead boon to the campaign pool."
    const seats = playerOrder(s).filter((p) =>
      (seatView(s, p).threatAttachments ?? []).some(
        (a) => a.code === SAGA.fear,
      ),
    );
    if (seats.length) {
      if (!c.burdens.includes(SAGA.fear)) c.burdens.push(SAGA.fear);
      c.threatDials = [...new Set([...(c.threatDials ?? []), ...seats])];
    }
    const army = (s.victoryCards ?? []).includes(SAGA.armyEnemy);
    if (army && !c.boons.includes(SAGA.army)) c.boons.push(SAGA.army);
    log(
      s,
      `The Passing of the Grey Company · Resolution: ${
        seats.length
          ? `Overcome by Fear is earned for ${seats.map((p) => (s.table ? `Player ${p + 1}` : "you")).join(", ")}`
          : "no threat dial carries Overcome by Fear"
      }${army ? "; the players earn the Army of the Dead boon" : ""}.`,
      "good",
    );
  } else if (s.scenarioId === "the-siege-of-gondor") {
    // "Count the number of resources on The Corsair Fleet and record that
    // number ... Remove Army of the Dead from the campaign pool."
    c.corsairFleet =
      s.staging.find((u) => u.code === SAGA.corsairFleet)?.resources ?? 0;
    c.boons = c.boons.filter((code) => code !== SAGA.army);
    log(
      s,
      `The Siege of Gondor · Resolution: The Corsair Fleet has ${c.corsairFleet} resources, recorded in the Notes; Army of the Dead leaves the Campaign Pool.`,
      "good",
    );
  } else if (s.scenarioId === "the-battle-of-the-pelennor-fields") {
    // "Add 1 copy, per player, of Wraith on Wings to the campaign pool. ... If
    // Esquire of Gondor, or Esquire of Rohan, is attached to a hero, that
    // hero's controller has earned that boon."
    const copies = playerOrder(s).length;
    if (!c.burdens.includes(SAGA.wraith)) c.burdens.push(SAGA.wraith);
    c.burdenCopies = {
      ...(c.burdenCopies ?? {}),
      [SAGA.wraith]: (c.burdenCopies?.[SAGA.wraith] ?? 0) + copies,
    };
    const earned: string[] = [];
    for (const p of playerOrder(s))
      for (const h of seatView(s, p).heroes)
        for (const code of [SAGA.esquireRohan, SAGA.esquireGondor])
          if (h.attachments.some((a) => a.code === code)) {
            if (!c.boons.includes(code)) c.boons.push(code);
            const key = heroKey(s, h);
            if (!(c.permanent[key] ?? []).includes(code))
              c.permanent[key] = [...(c.permanent[key] ?? []), code];
            earned.push(`${card(code).name} (${heroLabel(s, key)})`);
          }
    log(
      s,
      `The Battle of the Pelennor Fields · Resolution: ${copies} ${copies === 1 ? "copy" : "copies"} of Wraith on Wings ${copies === 1 ? "is" : "are"} earned${earned.length ? `; ${earned.join(", ")} ${earned.length === 1 ? "is" : "are"} earned` : ""}.`,
      "good",
    );
  } else if (s.scenarioId === "the-tower-of-cirith-ungol") {
    // "If Shagrat is in play, remove each Item boon attached to it from the
    // campaign pool. (The players have lost those boons.)"
    const shagrat = [
      ...s.staging,
      ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
    ].find((u) => u.code === SAGA.shagrat);
    const lost = (shagrat?.attachments ?? [])
      .filter((a) => (s.sagaCards?.guarded ?? []).includes(a.id))
      .map((a) => a.code);
    c.boons = c.boons.filter((code) => !lost.includes(code));
    if (c.deckBoons) for (const code of lost) delete c.deckBoons[code];
    log(
      s,
      lost.length
        ? `The Tower of Cirith Ungol · Resolution: Shagrat still guards ${lost.map((code) => card(code).name).join(", ")}; the players have lost ${lost.length === 1 ? "that boon" : "those boons"}.`
        : "The Tower of Cirith Ungol · Resolution: no Item boon is lost.",
      "good",
    );
  } else if (s.scenarioId === "the-black-gate-opens") {
    // "Record the number of resource tokens on The Black Gate ... If a Wraith
    // on Wings is in the victory display, remove that copy from the campaign
    // pool. If the first player controls Gwaihir, add him to the campaign
    // pool."
    c.blackGateTokens =
      s.staging.find((u) => u.code === SAGA.blackGate)?.resources ?? 0;
    const slain = (s.victoryCards ?? []).filter(
      (code) => code === SAGA.wraith,
    ).length;
    if (slain && c.burdens.includes(SAGA.wraith)) {
      const left = (c.burdenCopies?.[SAGA.wraith] ?? 1) - slain;
      if (left > 0)
        c.burdenCopies = { ...(c.burdenCopies ?? {}), [SAGA.wraith]: left };
      else {
        c.burdens = c.burdens.filter((code) => code !== SAGA.wraith);
        if (c.burdenCopies) delete c.burdenCopies[SAGA.wraith];
        if (c.burdenCopies && !Object.keys(c.burdenCopies).length)
          delete c.burdenCopies;
      }
    }
    const gwaihir =
      seatView(s, s.table?.first ?? 0).allies.some(
        (u) => u.code === SAGA.gwaihir,
      ) || !!s.sagaCards?.gwaihirAtLoss;
    if (gwaihir && !c.boons.includes(SAGA.gwaihir)) c.boons.push(SAGA.gwaihir);
    log(
      s,
      `The Black Gate Opens · Resolution: ${c.blackGateTokens} resource ${c.blackGateTokens === 1 ? "token" : "tokens"} on The Black Gate ${c.blackGateTokens === 1 ? "is" : "are"} recorded${slain ? `; ${slain} Wraith on Wings ${slain === 1 ? "leaves" : "leave"} the Campaign Pool` : ""}${gwaihir ? "; the players earn Gwaihir" : ""}.`,
      "good",
    );
  } else if (s.scenarioId === "shelobs-lair") {
    if (!c.burdens.includes(SAGA.heavy)) c.burdens.push(SAGA.heavy);
    log(
      s,
      "Shelob's Lair · Resolution: A Heavy Burden is added to the Campaign Pool; the players have earned that burden.",
      "good",
    );
  } else if (s.scenarioId === "fog-on-the-barrow-downs") {
    if (!c.boons.includes(SAGA.tom)) c.boons.push(SAGA.tom);
    log(
      s,
      "Fog on the Barrow-downs · Resolution: the players have earned the Ho! Tom Bombadil! boon card.",
      "good",
    );
  } else if (sagaResolutionQuestions(s).length) c.resolution = s.scenarioId;
  log(s, "The Campaign Log has been updated.", "good");
}

/** The Campaign Log's note of the enemies under The Black Gate: "Name ×2, …". */
export function blackGateNote(codes: readonly string[] = []) {
  const counts = new Map<string, number>();
  for (const code of codes)
    counts.set(card(code).name, (counts.get(card(code).name) ?? 0) + 1);
  return [...counts]
    .map(([title, n]) => (n > 1 ? `${title} ×${n}` : title))
    .join(", ");
}
/**
 * The campaign card's state during a chapter, for the quest inspector: Mount
 * Doom's resource tokens, the Item boons set aside or guarded at The Tower of
 * Cirith Ungol, and what waits at The Battle of the Pelennor Fields.
 */
export function sagaCampaignStatus(s: GameState): string[] {
  if (!isSagaCampaign(s.campaign)) return [];
  const q = s.sagaCards;
  const out: string[] = [];
  if (s.scenarioId === "mount-doom" && q?.doomTokens !== undefined)
    out.push(
      `${q.doomTokens} resource ${q.doomTokens === 1 ? "token remains" : "tokens remain"} on the campaign card: 1 is removed at the end of each round, and the players lose when none remain.`,
    );
  if (q?.itemsAside?.length)
    out.push(
      `Set aside until stage 3A, then guarded by Shagrat: ${q.itemsAside.map((x) => card(x.code).name).join(", ")}.`,
    );
  const guarded = [
    ...s.staging,
    ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
  ].flatMap((u) =>
    u.attachments.filter((a) => (q?.guarded ?? []).includes(a.id)),
  );
  if (guarded.length)
    out.push(
      `Shagrat guards ${guarded.map((a) => card(a.code).name).join(", ")}: defeat him to return ${guarded.length === 1 ? "it to its owner's hand" : "them to their owners' hands"}, or the players lose ${guarded.length === 1 ? "that boon" : "those boons"}.`,
    );
  if (q?.aragornAside)
    out.push(
      `Aragorn waits${q.aragornAside.attachments.length ? ` with ${q.aragornAside.attachments.map((a) => card(a.code).name).join(" and ")}` : ""} until The Corsair Fleet has no resources.`,
    );
  if (q?.haradAside?.length)
    out.push(
      `${blackGateNote(q.haradAside)} ${q.haradAside.length === 1 ? "waits" : "wait"} for stage 5B.`,
    );
  return out;
}
export type SagaQuestion = {
  id: string;
  player?: number;
  label: string;
  options: { id: string; label: string; code?: string }[];
};
const heroKey = (s: GameState, u: Unit) =>
  ringBearer(s)?.id === u.id
    ? RING_BEARER_KEY
    : card(u.code).sphere_code === "fellowship" &&
        card(u.code).name === "Aragorn"
      ? ARAGORN_KEY
      : u.code;
const heroLabel = (s: GameState, key: string) =>
  key === RING_BEARER_KEY
    ? `${ringBearer(s) ? name(ringBearer(s)!) : "Frodo Baggins"} (the Ring-bearer)`
    : key === ARAGORN_KEY
      ? "Aragorn (the Fellowship hero)"
      : card(key).name;
/** The Uruk-hai: the pursuit value at which the players earn a reward. */
export const URUK_PURSUIT = 25;
/** A player's segment of the Campaign Log's heroes. */
function seatHeroes(s: GameState, player: number) {
  const c = s.campaign!;
  const counts = c.seatHeroes ??
    s.table?.seats.map((p) => p.startingHeroes.length) ?? [c.heroes.length];
  const start = counts.slice(0, player).reduce((n, x) => n + x, 0);
  return { start, codes: c.heroes.slice(start, start + counts[player]) };
}
/** The Uruk-hai's resolution: the Skill boons or Beyond All Hope. */
function urukQuestions(s: GameState): SagaQuestion[] {
  const c = s.campaign!;
  const fallen = c.fallen.filter((code) => !c.heroes.includes(code));
  const skills = Object.entries(SKILL_BOONS);
  return [
    {
      id: "reward",
      label:
        "The players must choose: each player earns a Skill boon, or one player earns Beyond All Hope and takes back a fallen hero.",
      options: [
        { id: "skill", label: "Each player earns a Skill boon" },
        ...(fallen.length
          ? [{ id: "hope", label: "One player earns Beyond All Hope" }]
          : []),
      ],
    },
    ...playerOrder(s).map((player) => ({
      id: `skill:${player}`,
      player,
      label: `Skill boons · ${s.table ? `Player ${player + 1}` : "You"}: a Skill boon for a hero ${s.table ? "that player controls" : "you control"} with its trait.`,
      options: [
        { id: "none", label: "No Skill boon" },
        ...skills.flatMap(([code, trait]) =>
          // The captives, rescued by the win, count as heroes they control.
          [
            ...seatView(s, player).heroes,
            ...(s.urukHai?.captives
              .filter((x) => x.owner === player)
              .map((x) => x.unit) ?? []),
          ]
            .filter(
              (h) =>
                card(h.code).sphere_code !== "fellowship" &&
                effectiveTraitsOf(h).includes(trait),
            )
            .map((h) => ({
              id: `${code}@${h.code}`,
              code,
              label: `${card(code).name} · ${name(h)}`,
            })),
        ),
      ],
    })),
    {
      id: "hope",
      label:
        "Beyond All Hope · the player and the fallen hero they take control of.",
      options: [
        { id: "none", label: "Not chosen" },
        ...playerOrder(s).flatMap((player) =>
          fallen.map((code) => ({
            id: `${player}@${code}`,
            code,
            label: `${s.table ? `Player ${player + 1}` : "You"} · ${card(code).name}`,
          })),
        ),
      ],
    },
    {
      id: "hopeDrop",
      label:
        "Beyond All Hope · the hero that player removes from the Campaign Log to control only 3 heroes.",
      options: [
        { id: "none", label: "No hero" },
        ...c.heroes.map((code) => ({ id: code, code, label: card(code).name })),
      ],
    },
  ];
}
/** Breaking of the Fellowship: the heroes a player may give up as a captive. */
const captiveCandidates = (s: GameState, player: number) =>
  seatView(s, player).heroes.filter(
    (h) =>
      !h.attachments.some((a) => isOneRing(a.code)) &&
      !isRingBearerCode(h.code) &&
      card(h.code).name !== "Aragorn",
  );
/** The choices a campaign card's resolution asks of the players. */
export function sagaResolutionQuestions(s: GameState): SagaQuestion[] {
  const c = s.campaign;
  if (!isSagaCampaign(c) || s.status !== "won") return [];
  if (s.scenarioId === "a-shadow-of-the-past")
    return [
      {
        id: "burden",
        label:
          "Choose Gandalf's Delay or The Ring Draws Them and add it to the Campaign Pool.",
        options: [SAGA.delay, SAGA.ringDraws].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      {
        id: "boon",
        label:
          "Then, choose Gildor Inglorion or Mr. Underhill and add it to the Campaign Pool.",
        options: [SAGA.gildor, SAGA.underhill].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
    ];
  if (s.scenarioId === "mount-doom")
    return [
      {
        id: "ring",
        label: "Mount Doom · The first player must choose:",
        options: [
          {
            id: "destroy",
            label:
              "Destroy The One Ring card and defeat the power of Sauron: the players win the campaign",
          },
          {
            id: "keep",
            label:
              "Keep The One Ring card and succumb to the power of Sauron: the players lose the campaign",
          },
        ],
      },
    ];
  if (s.scenarioId === "the-passage-of-the-marshes")
    return playerOrder(s).map((player) => ({
      id: `eye:${player}`,
      player,
      label: `${s.table ? `Player ${player + 1}` : "You"} must choose: either take a permanent +2 starting threat penalty, or earn 1 copy of The Searching Eye.`,
      options: [
        { id: "penalty", label: "Take a permanent +2 starting threat penalty" },
        {
          id: "eye",
          code: SAGA.searchingEye,
          label: "Earn 1 copy of The Searching Eye",
        },
      ],
    }));
  if (s.scenarioId === "journey-in-the-dark" && !jdBalrog(s))
    return [
      {
        id: "treachery",
        label:
          "The first player chooses one of the burden treachery cards to add to the Campaign Pool.",
        options: [SAGA.pursued, SAGA.shadowFear].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      {
        id: "objective",
        label:
          "The first player chooses one of the burden objective cards to add to the Campaign Pool.",
        options: [SAGA.wound, SAGA.grief].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
    ];
  if (
    s.scenarioId === "the-uruk-hai" &&
    (s.urukHai?.pursuit ?? 99) <= URUK_PURSUIT
  )
    return urukQuestions(s);
  if (s.scenarioId === "breaking-of-the-fellowship")
    return [
      {
        id: "burden",
        label:
          "The first player chooses either Followed by Night or Ill Fate to be added to the Campaign Pool.",
        options: [SAGA.night, SAGA.illFate].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
      ...playerOrder(s).map((player) => {
        const heroes = captiveCandidates(s, player);
        return {
          id: `captive:${player}`,
          player,
          label: `${s.table ? `Player ${player + 1}` : "You"}: choose 1 hero ${s.table ? "that player controls" : "you control"} (other than the Ring-bearer or Aragorn) to be taken captive.`,
          options: heroes.length
            ? heroes.map((h) => ({ id: h.code, code: h.code, label: name(h) }))
            : [{ id: "none", label: "No hero can be taken captive" }],
        };
      }),
    ];
  if (s.scenarioId === "a-knife-in-the-dark")
    return playerOrder(s).map((player) => ({
      id: `boon:${player}`,
      player,
      label: `${s.table ? `Player ${player + 1}` : "You"}: choose a boon to attach to a hero ${s.table ? "that player controls" : "you control"} (optional).`,
      options: [
        { id: "none", label: "No boon" },
        ...KNIFE_BOONS.flatMap((code) =>
          seatView(s, player).heroes.map((h) => ({
            id: `${code}@${heroKey(s, h)}`,
            code,
            label: `${card(code).name} · ${heroLabel(s, heroKey(s, h))}`,
          })),
        ),
      ],
    }));
  return [];
}
/** Record the players' resolution choices in the Campaign Log. */
export function applySagaResolution(
  input: GameState,
  answers: Record<string, string>,
): GameState {
  const s = structuredClone(input);
  const c = s.campaign;
  requireRule(
    isSagaCampaign(c) && s.status === "won" && c!.resolution === s.scenarioId,
    "This campaign card has no resolution waiting.",
  );
  const questions = sagaResolutionQuestions(s);
  for (const q of questions)
    requireRule(
      q.options.some((o) => o.id === answers[q.id]),
      `Answer: ${q.label}`,
    );
  if (s.scenarioId === "a-shadow-of-the-past") {
    c!.burdens.push(answers.burden);
    c!.boons.push(answers.boon);
    if (answers.boon === SAGA.underhill)
      c!.permanent[RING_BEARER_KEY] = [
        ...(c!.permanent[RING_BEARER_KEY] ?? []),
        SAGA.underhill,
      ];
    log(
      s,
      `A Shadow of the Past · Resolution: ${card(answers.burden).name} and ${card(answers.boon).name} are added to the Campaign Pool.`,
      "good",
    );
  }
  if (s.scenarioId === "a-knife-in-the-dark") {
    const chosen = questions
      .map((q) => answers[q.id])
      .filter((a) => a !== "none")
      .map((a) => a.split("@"));
    requireRule(
      new Set(chosen.map(([code]) => code)).size === chosen.length,
      "Each boon card can be chosen once.",
    );
    for (const [code, hero] of chosen) {
      c!.boons.push(code);
      c!.permanent[hero] = [...(c!.permanent[hero] ?? []), code];
    }
    log(
      s,
      chosen.length
        ? `A Knife in the Dark · Resolution: ${chosen.map(([code, hero]) => `${card(code).name} (${heroLabel(s, hero)})`).join(", ")} ${chosen.length === 1 ? "is" : "are"} earned.`
        : "A Knife in the Dark · Resolution: no boon is chosen.",
      "good",
    );
  }
  if (s.scenarioId === "the-uruk-hai") {
    if (answers.reward === "skill") {
      const chosen = questions
        .filter((q) => q.id.startsWith("skill:"))
        .map((q) => answers[q.id])
        .filter((a) => a !== "none")
        .map((a) => a.split("@"));
      requireRule(
        new Set(chosen.map(([code]) => code)).size === chosen.length,
        "Each Skill boon can be earned once.",
      );
      for (const [code, hero] of chosen) {
        c!.boons.push(code);
        c!.permanent[hero] = [...(c!.permanent[hero] ?? []), code];
      }
      log(
        s,
        `The Uruk-hai · Resolution: ${chosen.length ? chosen.map(([code, hero]) => `${card(code).name} (${card(hero).name})`).join(", ") : "no Skill boon"} ${chosen.length === 1 ? "is" : "are"} earned.`,
        "good",
      );
    } else {
      requireRule(
        answers.hope !== "none",
        "Choose the player and the fallen hero for Beyond All Hope.",
      );
      const [seat, hero] = answers.hope.split("@");
      const player = Number(seat);
      const { start, codes } = seatHeroes(s, player);
      // The engine keeps each player's hero count: the fallen hero takes the
      // place of a hero that player removes from the Campaign Log.
      requireRule(
        codes.includes(answers.hopeDrop),
        "Choose a hero of that player to remove from the Campaign Log.",
      );
      c!.heroes[start + codes.indexOf(answers.hopeDrop)] = hero;
      delete c!.permanent[answers.hopeDrop];
      c!.fallen = c!.fallen.filter((code) => code !== hero);
      c!.boons.push(SAGA.hope);
      c!.permanent[hero] = [...(c!.permanent[hero] ?? []), SAGA.hope];
      log(
        s,
        `The Uruk-hai · Resolution: Beyond All Hope is earned; ${card(hero).name} returns to the fellowship in place of ${card(answers.hopeDrop).name}.`,
        "good",
      );
    }
  }
  if (s.scenarioId === "mount-doom") {
    c!.outcome = answers.ring === "destroy" ? "won" : "lost";
    log(
      s,
      c!.outcome === "won"
        ? "Mount Doom · Resolution: The One Ring is destroyed and the power of Sauron defeated. The players win the campaign."
        : "Mount Doom · Resolution: The One Ring is kept, and its bearer succumbs to the power of Sauron. The players lose the campaign.",
      c!.outcome === "won" ? "good" : "danger",
    );
  }
  if (s.scenarioId === "the-passage-of-the-marshes") {
    const penalty = [...(c!.playerPenalty ?? [])];
    while (penalty.length < (s.table?.seats.length ?? 1)) penalty.push(0);
    const eyes: number[] = [];
    for (const q of questions)
      if (answers[q.id] === "penalty") penalty[q.player!] += 2;
      else eyes.push(q.player!);
    if (penalty.some((n) => n > 0)) c!.playerPenalty = penalty;
    if (eyes.length) {
      if (!c!.burdens.includes(SAGA.searchingEye))
        c!.burdens.push(SAGA.searchingEye);
      c!.deckBurdens = {
        ...(c!.deckBurdens ?? {}),
        [SAGA.searchingEye]: [
          ...new Set([...(c!.deckBurdens?.[SAGA.searchingEye] ?? []), ...eyes]),
        ],
      };
    }
    log(
      s,
      `The Passage of the Marshes · Resolution: ${questions
        .map(
          (q) =>
            `${s.table ? `Player ${q.player! + 1}` : "you"} ${answers[q.id] === "penalty" ? `${s.table ? "takes" : "take"} a permanent +2 starting threat penalty` : `${s.table ? "earns" : "earn"} The Searching Eye`}`,
        )
        .join("; ")}.`,
      "good",
    );
  }
  if (s.scenarioId === "journey-in-the-dark") {
    c!.burdens.push(answers.treachery, answers.objective);
    log(
      s,
      `Journey in the Dark · Resolution: ${card(answers.treachery).name} and ${card(answers.objective).name} are added to the Campaign Pool.`,
      "good",
    );
  }
  if (s.scenarioId === "breaking-of-the-fellowship") {
    c!.burdens.push(answers.burden);
    const captives = questions
      .filter((q) => q.id.startsWith("captive:"))
      .map((q) => answers[q.id])
      .filter((a) => a !== "none");
    c!.captives = [...new Set([...(c!.captives ?? []), ...captives])];
    log(
      s,
      `Breaking of the Fellowship · Resolution: ${card(answers.burden).name} is added to the Campaign Pool${captives.length ? `; ${captives.map((code) => card(code).name).join(", ")} ${captives.length === 1 ? "is" : "are"} taken captive` : ""}.`,
      "good",
    );
  }
  c!.resolution = null;
  return s;
}

/** A saved Lord of the Rings campaign log, checked against the current game. */
export function validateSagaCampaign(s: GameState): boolean {
  const c = s.campaign;
  if (!c || c.kind !== "saga") return false;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  const integer = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const hero = (code: string) => {
    try {
      return card(code).type_code === "hero";
    } catch {
      return false;
    }
  };
  const chapter = [...SAGA_CAMPAIGN_ORDER, ...SAGA_INSERTS].includes(
    s.scenarioId,
  );
  return (
    chapter &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every((x) => SAGA_BOONS.includes(x)) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every((x) => SAGA_BURDENS.includes(x)) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    Object.entries(c.permanent).every(
      ([h, cs]) =>
        (h === RING_BEARER_KEY || h === ARAGORN_KEY || hero(h)) &&
        codes(cs) &&
        cs.every((x) => SAGA_PERMANENT.includes(x) && c.boons.includes(x)),
    ) &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === (s.table?.seats.length ?? 1) &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    (c.captives === undefined ||
      (codes(c.captives) && c.captives.every(hero))) &&
    (c.playerPenalty === undefined ||
      (Array.isArray(c.playerPenalty) &&
        c.playerPenalty.length === (s.table?.seats.length ?? 1) &&
        c.playerPenalty.every(integer))) &&
    (c.boonCopies === undefined ||
      (!!c.boonCopies &&
        typeof c.boonCopies === "object" &&
        !Array.isArray(c.boonCopies) &&
        Object.entries(c.boonCopies).every(
          ([code, decks]) =>
            COPY_BOONS.includes(code) &&
            c.boons.includes(code) &&
            Array.isArray(decks) &&
            decks.length >= 1 &&
            decks.length <= 4 &&
            decks.every(
              (seat) =>
                seat === null ||
                (Number.isSafeInteger(seat) &&
                  seat >= 0 &&
                  seat < (s.table?.seats.length ?? 1)),
            ),
        ))) &&
    (c.threatDials === undefined ||
      (Array.isArray(c.threatDials) &&
        new Set(c.threatDials).size === c.threatDials.length &&
        c.burdens.includes(SAGA.fear) &&
        c.threatDials.every(
          (seat) =>
            Number.isSafeInteger(seat) &&
            seat >= 0 &&
            seat < (s.table?.seats.length ?? 1),
        ))) &&
    (c.corsairFleet === undefined || integer(c.corsairFleet)) &&
    (c.blackGateTokens === undefined || integer(c.blackGateTokens)) &&
    (c.outcome === undefined ||
      ((c.outcome === "won" || c.outcome === "lost") &&
        c.completed.at(-1)?.scenarioId === "mount-doom")) &&
    (c.burdenCopies === undefined ||
      (!!c.burdenCopies &&
        typeof c.burdenCopies === "object" &&
        !Array.isArray(c.burdenCopies) &&
        Object.entries(c.burdenCopies).every(
          ([code, n]) =>
            code === SAGA.wraith &&
            c.burdens.includes(code) &&
            Number.isSafeInteger(n) &&
            n >= 1 &&
            n <= 8,
        ))) &&
    (c.blackGateEnemies === undefined ||
      (codes(c.blackGateEnemies) &&
        c.blackGateEnemies.every((code) => {
          try {
            return card(code).type_code === "enemy";
          } catch {
            return false;
          }
        }))) &&
    (c.deckBurdens === undefined ||
      (!!c.deckBurdens &&
        typeof c.deckBurdens === "object" &&
        !Array.isArray(c.deckBurdens) &&
        Object.entries(c.deckBurdens).every(
          ([code, seats]) =>
            DECK_BURDENS.includes(code) &&
            c.burdens.includes(code) &&
            Array.isArray(seats) &&
            new Set(seats).size === seats.length &&
            seats.every(
              (seat) =>
                Number.isSafeInteger(seat) &&
                seat >= 0 &&
                seat < (s.table?.seats.length ?? 1),
            ),
        ))) &&
    (c.deckBoons === undefined ||
      (!!c.deckBoons &&
        typeof c.deckBoons === "object" &&
        !Array.isArray(c.deckBoons) &&
        Object.entries(c.deckBoons).every(
          ([code, seat]) =>
            SAGA_DECK_BOONS.includes(code) &&
            c.boons.includes(code) &&
            Number.isSafeInteger(seat) &&
            seat >= 0 &&
            seat < (s.table?.seats.length ?? 1),
        ))) &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (q, i) =>
        !!q &&
        sagaChapterOptions({ completed: c.completed.slice(0, i) }).includes(
          q.scenarioId,
        ) &&
        Number.isSafeInteger(q.score) &&
        integer(q.rounds),
    ) &&
    (s.status === "won" ||
    (s.status === "lost" &&
      SAGA_LOSS_CHAPTERS.includes(s.scenarioId) &&
      c.completed.at(-1)?.scenarioId === s.scenarioId)
      ? c.completed.at(-1)?.scenarioId === s.scenarioId
      : sagaChapterOptions(c).includes(s.scenarioId)) &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (s.status === "won" && c.resolution === s.scenarioId))
  );
}
