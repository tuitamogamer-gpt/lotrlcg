// The Angmar Awakened campaign (its Campaign Expansion): the Campaign Log,
// the Campaign Pool and each scenario's campaign card.
import type {
  CampaignState,
  Effect,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  RuleError,
  shuffle,
  stats,
} from "./core";
import {
  activeSeat,
  allCharacters,
  forOwner,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { canPlay, playHandCard, playTargets, score } from "./actions";
import { removePlayedEvent } from "./event-resolution";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import { check, damage, raiseThreat, readyCharacter, revealed } from "./board";
import { applyCombatDamageConsequences } from "./combat";
import {
  DIKE_DISCARD_REASON,
  dikeCannotLeaveDiscard,
} from "./deadmens-discard";
import { angmarPhase } from "./angmar-campaign-boost";
import { gramState } from "./mount-gram-support";
import { RHUDAUR } from "./rhudaur-support";
import { gramCardLeaves } from "./mount-gram";

/** The campaign's cards. */
export const ANGMAR = {
  chetwoodCard: "octgn:81f744b1-aa0e-4326-bd18-d701390141bf",
  weatherCard: "octgn:b8c49f35-4f52-48eb-ae3f-456b7daea4a7",
  dikeCard: "octgn:0f039a53-c92a-4ac0-b7db-c1506d7b96e5",
  wastesCard: "octgn:cb628fb0-b66a-49b0-8063-12dd39f564ce",
  gramCard: "octgn:85afcf03-9776-4f05-b9c0-346e6e39b1b1",
  ettenCard: "octgn:cf9443b5-735d-4c8f-bd88-8643345f9632",
  rhudaurCard: "octgn:d060f58b-3067-43c0-a480-d55c68c33305",
  carnCard: "octgn:e7020edb-aebd-44c2-8c5a-37fc744b7b9f",
  dreadCard: "octgn:64a91e39-51e9-42d4-9445-d8bbaca95314",
  /** Iârion's Pendant (boon attachment). */
  pendant: "10157",
  /** Protect the Innocent (side quest), Arnor Ravaged on its other side. */
  innocent: "10158",
  /** Mysterious Omens (side quest). */
  omens: "10160",
  /** The Permanent boons Mysterious Omens offers. */
  cunning: "10161",
  hardy: "10162",
  resolute: "10163",
  ruthless: "10164",
  stalwart: "10165",
  /** Amarthiúl's Courage (boon attachment, chosen after Deadmen's Dike). */
  courage: "10167",
  /** Thaurdir's three burdens. */
  legacy: "10168",
  majesty: "10169",
  spite: "10170",
  /** Determination (boon event, one copy per player). */
  determination: "10172",
  /** Fend off Despair (side quest). */
  despair: "10173",
  /** Arnor Ravaged: Protect the Innocent's other side, a burden objective. */
  ravaged: "10158.B",
  /** Loot the Dungeons (side quest) and the six boons it offers. */
  loot: "10175",
  berelind: "10176",
  brooch: "10177",
  coruhaer: "10178",
  laermuin: "10179",
  mail: "10180",
  silverthorn: "10181",
  /** Losing Time (burden treachery, five copies). */
  losing: "10183",
  /** The Clue boons of The Treachery of Rhudaur. */
  brand: "10185",
  heirloom: "10186",
  orders: "10187",
  /** The Battle of Carn Dûm's four boons. */
  champion: "10189",
  lore: "10190",
  raiment: "10191",
  skirmishers: "10192",
} as const;
/** Elrond's Champion, Lore of Ancient Arnor, Raiment of the Second Age and Rivendell Skirmishers. */
export const CARN_BOONS: readonly string[] = [
  "10189",
  "10190",
  "10191",
  "10192",
];
/** Daechanar's Brand, Heirloom of Iârchon and Orders from Angmar. */
export const CLUE_BOONS: readonly string[] = ["10185", "10186", "10187"];
/** The Treachery of Rhudaur's Clue objectives and the boons with the same names (read when used, not at load). */
const clueBoon = (code: string) =>
  code === RHUDAUR.brand
    ? "10185"
    : code === RHUDAUR.heirloom
      ? "10186"
      : code === RHUDAUR.orders
        ? "10187"
        : undefined;
/** Berelind, Chieftain's Brooch, Coruhaer, Laermuin, Mail of Eärnur and Silverthorn. */
export const LOOT_BOONS: readonly string[] = [
  "10176",
  "10177",
  "10178",
  "10179",
  "10180",
  "10181",
];
/** Thaurdir's Legacy, Majesty and Spite (the support module's list, kept local to avoid an import cycle at load). */
const THAURDIR_BURDENS: readonly string[] = [
  ANGMAR.legacy,
  ANGMAR.majesty,
  ANGMAR.spite,
];
/** Cunning, Hardy, Resolute, Ruthless and Stalwart (Permanent Condition boons). */
export const SKILL_BOONS: readonly string[] = [
  ANGMAR.cunning,
  ANGMAR.hardy,
  ANGMAR.resolute,
  ANGMAR.ruthless,
  ANGMAR.stalwart,
];
/** The campaign's nine chapters in order. */
export const ANGMAR_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "intruders-in-chetwood",
  "the-weather-hills",
  "deadmens-dike",
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
];
/** The chapters whose campaign cards are scripted so far. */
export const ANGMAR_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "intruders-in-chetwood",
  "the-weather-hills",
  "deadmens-dike",
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
];
/** The chapters whose campaign card lets each player change heroes without the +1 threat penalty. */
export const ANGMAR_FREE_CHANGES: readonly ScenarioId[] = [
  "wastes-of-eriador",
  "the-battle-of-carn-dum",
];
/** The Angmar Awakened boons that join a player's deck (Iârion's Pendant, once chosen). */
export const ANGMAR_DECK_BOONS: readonly string[] = [
  "10157",
  ...LOOT_BOONS,
  ...CLUE_BOONS,
  ...CARN_BOONS,
];
/** Fend off Despair: each player's starting threat is lowered by the Campaign Log's reduction. */
export const angmarThreatReduction = (c?: CampaignState | null) =>
  isAngmarCampaign(c) ? (c!.threatReduction ?? 0) : 0;
/** Each chapter's campaign card. */
export const ANGMAR_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "intruders-in-chetwood": ANGMAR.chetwoodCard,
  "the-weather-hills": ANGMAR.weatherCard,
  "deadmens-dike": ANGMAR.dikeCard,
  "wastes-of-eriador": ANGMAR.wastesCard,
  "escape-from-mount-gram": ANGMAR.gramCard,
  "across-the-ettenmoors": ANGMAR.ettenCard,
  "the-treachery-of-rhudaur": ANGMAR.rhudaurCard,
  "the-battle-of-carn-dum": ANGMAR.carnCard,
  "the-dread-realm": ANGMAR.dreadCard,
};
export const isAngmarCampaign = (c?: CampaignState | null) =>
  c?.kind === "angmar";
/** A new Angmar Awakened campaign: the heroes are recorded at its start. */
export function newAngmarCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "angmar",
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
    ...(seatHeroes && seatHeroes.length > 1 ? { seatHeroes } : {}),
  };
}
/** The chapter the campaign continues with, or undefined once it is complete. */
export const nextAngmarChapter = (
  c: Pick<CampaignState, "completed">,
): ScenarioId | undefined => ANGMAR_CAMPAIGN_ORDER[c.completed.length];
export const angmarChapterSupported = (id?: ScenarioId) =>
  !!id && ANGMAR_CAMPAIGN_SUPPORTED.includes(id);
/**
 * "When playing campaign mode, the Amarthiúl hero cannot be used until
 * indicated by a campaign card" (The Battle of Carn Dûm's).
 */
export const angmarForbiddenTitle = (id: ScenarioId) =>
  ANGMAR_CAMPAIGN_ORDER.indexOf(id) <
  ANGMAR_CAMPAIGN_ORDER.indexOf("the-battle-of-carn-dum")
    ? "Amarthiúl"
    : undefined;
/** Has the current chapter been recorded in the Campaign Log? */
export const angmarChapterComplete = (s: GameState) =>
  isAngmarCampaign(s.campaign) &&
  s.campaign!.completed.at(-1)?.scenarioId === s.scenarioId;

const first = (s: GameState) => s.table?.first ?? 0;
const state = (s: GameState) => (s.angmarCards ??= {});
/** Several players share the table (one seat reads "you"). */
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const who = (s: GameState, p: number) => (several(s) ? seatName(s, p) : "you");
/** Protect the Innocent (or Arnor Ravaged) in the staging area. */
export const angmarInnocent = (s: GameState): Unit | undefined =>
  s.staging.find(
    (u) =>
      u.code === ANGMAR.innocent &&
      (!s.angmarCards?.innocent || u.id === s.angmarCards.innocent),
  );
/** Arnor Ravaged in the staging area. */
export const angmarRavaged = (s: GameState): Unit | undefined =>
  s.staging.find((u) => u.code === ANGMAR.ravaged);
/** Fend off Despair in play: "Each event card gains doomed 1." */
export const angmarEventDoomed = (s: GameState, code: string) =>
  isAngmarCampaign(s.campaign) &&
  card(code).type_code === "event" &&
  s.staging.some((u) => u.code === ANGMAR.despair && !u.blanked)
    ? 1
    : 0;
/** Cards a campaign Setup added to the hand: kept through a mulligan. */
export const angmarSetupHandIds = (s: GameState) =>
  isAngmarCampaign(s.campaign)
    ? (s.angmarCards?.setupHand ?? []).filter((id) =>
        s.hand.some((u) => u.id === id),
      )
    : [];
/** Before the starting hands: the Campaign Pool's player cards join their decks. */
export function angmarCampaignDeckSetup(s: GameState) {
  const c = s.campaign;
  if (!isAngmarCampaign(c)) return;
  const seats = seatIndices(s);
  // Escape from Mount Gram's resolution: the cards left captured cannot be
  // included in that player's deck for the rest of the campaign.
  for (const seat of seats) {
    const banned = c!.banned?.[seat] ?? [];
    if (!banned.length) continue;
    forOwner(s, seat, () => {
      const before = s.deck.length;
      s.deck = s.deck.filter((code) => !banned.includes(code));
      if (s.deck.length < before)
        log(
          s,
          `Escape from Mount Gram: ${banned.map((code) => card(code).name).join(", ")} ${banned.length === 1 ? "is" : "are"} left out of ${several(s) ? `${seatName(s, seat)}'s` : "your"} deck.`,
        );
    });
  }
  for (const [code, seat] of Object.entries(c!.deckBoons ?? {}))
    if (
      c!.boons.includes(code) &&
      ANGMAR_DECK_BOONS.includes(code) &&
      seats.includes(seat)
    )
      forOwner(s, seat, () => s.deck.push(code));
  // Determination: each copy joins the deck of the player who earned it.
  if (c!.boons.includes(ANGMAR.determination))
    for (const seat of c!.boonCopies?.[ANGMAR.determination] ?? [])
      if (seat !== null && seats.includes(seat))
        forOwner(s, seat, () => s.deck.push(ANGMAR.determination));
}
/** "If Protect the Innocent has 10 or more damage on it (20 or more damage if there are 3 or 4 players in the game), the players lose the game." */
export const innocentLimit = (s: GameState) =>
  (s.table?.seats.length ?? 1) >= 3 ? 20 : 10;

/** The campaign card's Setup, after the scenario's own setup. */
export function angmarCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isAngmarCampaign(c)) return;
  // The Permanent boons recorded in the Campaign Log return to their heroes
  // ("Setup: Attach to a hero"); Cunning adds 2 resources to that hero's pool.
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      for (const h of s.heroes)
        for (const code of c!.permanent[h.code] ?? []) {
          if (h.attachments.some((a) => a.code === code)) continue;
          h.attachments.push({
            id: `a${s.nextId++}`,
            code,
            exhausted: false,
            owner: p,
          });
          if (code === ANGMAR.cunning) h.resources += 2;
        }
    });
  // The Weather Hills' campaign card adds Mysterious Omens to the Campaign
  // Log; while it stays in the Campaign Pool it is shuffled into each later
  // encounter deck.
  if (
    s.scenarioId === "the-weather-hills" &&
    !c!.burdens.includes(ANGMAR.omens)
  )
    c!.burdens.push(ANGMAR.omens);
  if (c!.burdens.includes(ANGMAR.omens)) {
    s.encounterDeck.push(ANGMAR.omens);
    shuffle(s, s.encounterDeck);
  }
  // The Wastes of Eriador: "Shuffle the Fend Off Despair side quest into the
  // encounter deck." It returns to each later deck once it is in the pool.
  if (
    s.scenarioId === "wastes-of-eriador" ||
    c!.burdens.includes(ANGMAR.despair)
  ) {
    s.encounterDeck.push(ANGMAR.despair);
    shuffle(s, s.encounterDeck);
  }
  // Across the Ettenmoors: "Setup: Set all 5 Losing Time treacheries aside,
  // out of play." The copies the Campaign Pool earns join each later deck.
  if (s.scenarioId === "across-the-ettenmoors")
    state(s).losing = { aside: 5, clock: 0 };
  else if (c!.burdens.includes(ANGMAR.losing)) {
    const copies = c!.burdenCopies?.[ANGMAR.losing] ?? 1;
    s.encounterDeck.push(...Array<string>(copies).fill(ANGMAR.losing));
    shuffle(s, s.encounterDeck);
  }
  // Arnor Ravaged: "Setup: Add Arnor Ravaged to the staging area with damage
  // on it equal to the amount of damage marked for it in the Campaign Log."
  if (c!.ravaged && c!.burdens.includes(ANGMAR.innocent)) {
    const ravaged = make(s, ANGMAR.ravaged);
    ravaged.damage = c!.innocent ?? 0;
    s.staging.push(ravaged);
  }
  // The Wastes of Eriador: "Each player adds 1 copy of Determination to
  // their starting hand." (It stays there through a mulligan.)
  if (s.scenarioId === "wastes-of-eriador")
    for (const p of seatIndices(s))
      forOwner(s, p, () => {
        const u = make(s, ANGMAR.determination);
        u.owner = p;
        s.hand.push(u);
        (state(s).setupHand ??= []).push(u.id);
      });
  // The Weather Hills and Deadmen's Dike: "Add the Protect the Innocent side
  // quest to the staging area and place damage on it equal to the amount of
  // damage noted for it in the Campaign Log."
  if (
    s.scenarioId !== "intruders-in-chetwood" &&
    c!.burdens.includes(ANGMAR.innocent) &&
    !c!.ravaged
  ) {
    const quest = make(s, ANGMAR.innocent);
    quest.damage = c!.innocent ?? 0;
    s.staging.push(quest);
    state(s).innocent = quest.id;
  }
  // Thaurdir's burdens: "Setup: Attach to Thaurdir (even if he is out of
  // play)." The Treachery of Rhudaur holds him aside from its setup.
  for (const thaurdir of s.rhudaur?.setAside ?? [])
    angmarThaurdirAppears(s, thaurdir);
  // Amarthiúl's Courage: "Setup: Attach to Amarthiúl." (The Amarthiúl hero;
  // the scenarios' objective ally is attached as he enters play.)
  for (const p of seatIndices(s))
    for (const h of seatView(s, p).heroes) angmarAmarthiulEntered(s, h);
  // The Battle of Carn Dûm: "Then, each player in turn order may select one
  // of the following boons and add it to their opening hand: Elrond's
  // Champion, Lore of Ancient Arnor, Raiment of the Second Age, or Rivendell
  // Skirmishers. Add the chosen cards to the Campaign Pool."
  if (s.scenarioId === "the-battle-of-carn-dum")
    for (const player of playerOrder(s))
      enqueue(s, fx("angmarCarnChoice", { player }));
  // The Dread Realm: "Each player may search their deck for a boon card and
  // add it to their opening hand. Each hero begins the game with damage on
  // them equal to the amount noted for them in the Campaign Log."
  if (s.scenarioId === "the-dread-realm") {
    for (const p of seatIndices(s))
      for (const h of seatView(s, p).heroes)
        h.damage = c!.heroDamage?.[h.code] ?? 0;
    for (const player of playerOrder(s))
      enqueue(s, fx("angmarDreadSearch", { player }));
  }
  if (s.scenarioId === "intruders-in-chetwood") {
    // "Add the Protect the Innocent side quest to the staging area. Starting
    // with the first player, each player may place 4 damage on Protect the
    // Innocent to add 1 resource to each of their heroes' resource pools."
    // (Iârion's Pendant waits for Iârion, who enters play with the
    // scenario's setup.)
    const quest = make(s, ANGMAR.innocent);
    s.staging.push(quest);
    state(s).innocent = quest.id;
    for (const player of playerOrder(s))
      enqueue(s, fx("angmarInnocentResources", { player }));
  }
}
/** Mysterious Omens: "Forced: After Mysterious Omens becomes the current quest, each player discards 1 random card from their hand." */
export function angmarCampaignSideChosen(s: GameState, quest: Unit) {
  if (
    !isAngmarCampaign(s.campaign) ||
    quest.code !== ANGMAR.omens ||
    quest.blanked
  )
    return;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("angmarOmensDiscard", { player })),
  );
}
/**
 * Mysterious Omens: "Forced: When Mysterious Omens is defeated, remove it
 * from the Campaign Pool. Then, each player may choose 1 of the following
 * boons and attach it to a hero they control: Cunning, Hardy, Resolute,
 * Ruthless, or Stalwart." The Campaign Log changes once the chapter is won.
 */
export function angmarCampaignSideDefeated(s: GameState, quest: Unit) {
  if (!isAngmarCampaign(s.campaign)) return;
  // Fend off Despair: "Forced: When Fend Off Despair is defeated, mark in the
  // Campaign Log that each player's starting threat is reduced by 2. (This
  // reduction is cumulative.)"
  if (quest.code === ANGMAR.despair) {
    state(s).despair = (s.angmarCards?.despair ?? 0) + 1;
    log(
      s,
      "Fend off Despair is defeated: each player's starting threat will be 2 lower in later chapters once this chapter is won.",
      "good",
    );
    return;
  }
  // Loot the Dungeons: its captured cards are rescued as it leaves play, and
  // "each player (at every staging area) may choose one of the following
  // boons and add it to their hand: Berelind, Chieftain's Brooch, Coruhaer,
  // Laermuin, Mail of Eärnur, or Silverthorn. Add the chosen cards to the
  // Campaign Pool."
  if (quest.code === ANGMAR.loot) {
    if (gramState(s)) gramCardLeaves(s, quest);
    log(
      s,
      "Loot the Dungeons is defeated: each player may take one of its boons.",
      "good",
    );
    prepend(
      s,
      ...globalPlayerOrder(s).map((player) =>
        fx("angmarLootChoice", { player }),
      ),
    );
    return;
  }
  if (quest.code !== ANGMAR.omens) return;
  state(s).omens = true;
  log(
    s,
    "Mysterious Omens is defeated: it leaves the Campaign Pool once this chapter is won.",
    "good",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("angmarSkillChoice", { player })),
  );
}
/** The Permanent boons still available to Mysterious Omens. */
const freeSkills = (s: GameState) =>
  SKILL_BOONS.filter(
    (code) =>
      !s.campaign!.boons.includes(code) &&
      !(s.angmarCards?.skills ?? []).some((x) => x.code === code),
  );
/** A campaign boon's once-per-game ability has been used. */
const spent = (s: GameState, id: string) =>
  (s.angmarCards?.spent ?? []).includes(id);
/** The campaign boons' Actions. */
export const angmarCampaignAbilityLabel = (code: string) =>
  code === ANGMAR.cunning
    ? "Cunning · Attached hero gets +2 willpower, +2 attack and +2 defense until the end of the phase (once per game)"
    : code === ANGMAR.hardy
      ? "Hardy · Ready attached hero (once per game)"
      : code === ANGMAR.ruthless
        ? "Ruthless · Move damage from attached hero to an enemy engaged with you (once per game)"
        : code === ANGMAR.stalwart
          ? "Stalwart · Play an attachment from your discard pile on attached hero (once per game)"
          : code === ANGMAR.courage
            ? "Amarthiúl's Courage · Ready Amarthiúl (once per game)"
            : undefined;
/** Attachments in a player's discard pile that Stalwart can play on its hero. */
function stalwartChoices(s: GameState, hero: Unit, p: number) {
  return [...new Set(seatView(s, p).discard)].filter((code) => {
    if (card(code).type_code !== "attachment") return false;
    // Probe a copy of the game, as if the card were in the hand.
    const t = structuredClone(s);
    let ok = false;
    forOwner(t, p, () => {
      const probe = make(t, code);
      probe.owner = p;
      t.hand.push(probe);
      try {
        ok =
          !canPlay(t, probe, { playOrigin: "discard" }) &&
          playTargets(t, probe).some((x) => x.id === hero.id);
      } catch {
        ok = false;
      }
    });
    return ok;
  });
}
export function angmarCampaignAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !angmarCampaignAbilityLabel(a.code))
    return "No campaign card ability.";
  if (a.blanked) return `${card(a.code).name}'s text is blank.`;
  const p = activeSeat(s);
  if (ownerOf(s, u) !== p)
    return `${card(a.code).name} belongs to another player.`;
  if (spent(s, a.id)) return `${card(a.code).name} was used this game.`;
  if (a.code === ANGMAR.hardy || a.code === ANGMAR.courage) {
    if (a.code === ANGMAR.courage && card(u.code).name !== "Amarthiúl")
      return "Amarthiúl's Courage readies only Amarthiúl.";
    if (!u.exhausted) return `${name(u)} is already ready.`;
    if (cannotReady(u, s)) return `${name(u)} cannot ready.`;
  }
  if (a.code === ANGMAR.ruthless) {
    if (!u.damage) return `${name(u)} has no damage to move.`;
    if (!seatView(s, p).engaged.some(isEnemyUnit))
      return "No enemy is engaged with you.";
  }
  if (a.code === ANGMAR.stalwart) {
    if (s.phase !== "planning") return "This is a Planning Action.";
    if (dikeCannotLeaveDiscard(s)) return DIKE_DISCARD_REASON;
    if (!stalwartChoices(s, u, p).length)
      return "No attachment in your discard pile can be played on this hero.";
  }
  return null;
}
const isEnemyUnit = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code);
export function angmarCampaignAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !angmarCampaignAbilityLabel(a.code)) return false;
  const problem = angmarCampaignAbilityProblem(s, u, attachmentId);
  if (problem) throw new RuleError(problem);
  const p = activeSeat(s);
  (state(s).spent ??= []).push(a.id);
  if (a.code === ANGMAR.cunning) {
    (state(s).boosts ??= []).push({
      target: u.id,
      phase: angmarPhase(s.phase),
      round: s.round,
    });
    log(
      s,
      `Cunning: ${name(u)} gets +2 willpower, +2 attack and +2 defense until the end of the phase.`,
      "good",
    );
  } else if (a.code === ANGMAR.hardy || a.code === ANGMAR.courage) {
    readyCharacter(s, u);
    log(s, `${card(a.code).name}: ${name(u)} readies.`, "good");
  } else if (a.code === ANGMAR.ruthless) {
    choose(
      s,
      "Ruthless · Choose an enemy engaged with you",
      seatView(s, p)
        .engaged.filter(isEnemyUnit)
        .map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: name(enemy),
          effects: [
            fx("angmarRuthlessAmount", {
              source: u.id,
              target: enemy.id,
              player: p,
            }),
          ],
        })),
      card(ANGMAR.ruthless).text,
    );
  } else if (a.code === ANGMAR.stalwart) {
    choose(
      s,
      "Stalwart · Play an attachment from your discard pile",
      stalwartChoices(s, u, p).map((code) => ({
        id: code,
        code,
        label: `${card(code).name} (cost ${card(code).cost ?? 0})`,
        effects: [fx("angmarStalwartPlay", { code, target: u.id, player: p })],
      })),
      card(ANGMAR.stalwart).text,
    );
  }
  return true;
}
/** Determination: "Action: Attach Determination to a unique character. Then, ready each character with a copy of Determination attached, as well as each character who is 'determined' in the Campaign Log." */
export function angmarCampaignPlayerEvent(s: GameState, code: string) {
  if (!isAngmarCampaign(s.campaign)) return false;
  if (code === ANGMAR.lore) {
    // Lore of Ancient Arnor: "Action: Each player returns 1 card from their
    // discard pile to their hand (2 cards instead if you are the only player
    // in the game) and shuffles the rest of their discard pile back into
    // their deck. Then, remove this card from the game."
    removePlayedEvent(s, code);
    const players = playerOrder(s);
    prepend(
      s,
      ...players.map((player) =>
        fx("angmarLoreReturn", {
          player,
          count: globalPlayerOrder(s).length === 1 ? 2 : 1,
        }),
      ),
      fx("angmarLoreShuffle", { player: activeSeat(s) }),
    );
    return true;
  }
  if (code !== ANGMAR.determination) return false;
  prepend(s, fx("angmarDetermination", { player: activeSeat(s) }));
  return true;
}
/** The unique characters in play Determination can be attached to. */
const uniqueCharacters = (s: GameState) =>
  seatIndices(s).flatMap((p) =>
    [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
      (u) => card(u.code).is_unique,
    ),
  );
/** Resolute: "Response: Cancel up to 2 points of damage just dealt to attached hero. (Limit once per game.)" */
export function angmarOfferResolute(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    !isAngmarCampaign(s.campaign) ||
    context.bypassResolute ||
    context.cost ||
    value <= 0
  )
    return false;
  const a = u.attachments.find(
    (x) => x.code === ANGMAR.resolute && !x.blanked && !spent(s, x.id),
  );
  if (!a) return false;
  prepend(
    s,
    fx("angmarResoluteWindow", {
      target: u.id,
      source: a.id,
      value,
      text: encodeDamageContext(context),
      player: ownerOf(s, u),
    }),
  );
  return true;
}
/**
 * Amarthiúl's Courage: "Setup: Attach to Amarthiúl. Otherwise, remove
 * Amarthiúl's Courage from the game." Amarthiúl enters play with the setup
 * (the objective ally of three scenarios, or a player's hero).
 */
export function angmarAmarthiulEntered(s: GameState, u: Unit) {
  const c = s.campaign;
  if (
    !isAngmarCampaign(c) ||
    !c!.boons.includes(ANGMAR.courage) ||
    card(u.code).name !== "Amarthiúl" ||
    seatIndices(s).some((p) =>
      [...seatView(s, p).heroes, ...seatView(s, p).allies].some((x) =>
        x.attachments.some((a) => a.code === ANGMAR.courage),
      ),
    )
  )
    return;
  u.attachments.push({
    id: `a${s.nextId++}`,
    code: ANGMAR.courage,
    exhausted: false,
  });
  log(s, "Amarthiúl's Courage is attached to Amarthiúl.", "good");
}
/**
 * Deadmen's Dike: "Forced: After Thaurdir enters play, randomly select one of
 * the following burdens and attach it to Thaurdir: Thaurdir's Legacy,
 * Thaurdir's Majesty, or Thaurdir's Spite. Add that card to the Campaign
 * Pool." (The Campaign Log records it once the chapter is won.)
 */
export function angmarThaurdirEntered(s: GameState, thaurdir: Unit) {
  if (
    !isAngmarCampaign(s.campaign) ||
    s.scenarioId !== "deadmens-dike" ||
    s.angmarCards?.thaurdir
  )
    return;
  const code =
    THAURDIR_BURDENS[Math.floor(random(s) * THAURDIR_BURDENS.length)];
  thaurdir.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  state(s).thaurdir = code;
  log(
    s,
    `Deadmen's Dike: ${card(code).name} is attached to Thaurdir at random and joins the Campaign Pool.`,
    "danger",
  );
}
/**
 * Thaurdir's burdens in the Campaign Pool: "Setup: Attach to Thaurdir (even
 * if he is out of play). Otherwise, remove this card from the game."
 */
export function angmarThaurdirAppears(s: GameState, thaurdir: Unit) {
  const c = s.campaign;
  if (!isAngmarCampaign(c) || card(thaurdir.code).name !== "Thaurdir") return;
  const burdens = c!.burdens.filter(
    (code) =>
      THAURDIR_BURDENS.includes(code) &&
      !thaurdirBurdens(s).some(({ a }) => a.code === code),
  );
  for (const code of burdens)
    thaurdir.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  if (burdens.length)
    log(
      s,
      `${burdens.map((code) => card(code).name).join(", ")} ${burdens.length === 1 ? "is" : "are"} attached to Thaurdir.`,
      "danger",
    );
}
/** Thaurdir's burdens in play, with their hosts (Thaurdir or a hero). */
function thaurdirBurdens(s: GameState) {
  const hosts = [
    ...seatIndices(s).flatMap((p) => [
      ...seatView(s, p).heroes,
      ...seatView(s, p).allies,
      ...seatView(s, p).engaged,
    ]),
    ...s.staging,
    ...(s.deadmensDike?.setAside ?? []),
    ...(s.rhudaur?.setAside ?? []),
  ];
  return hosts.flatMap((host) =>
    host.attachments
      .filter((a) => THAURDIR_BURDENS.includes(a.code) && !a.blanked)
      .map((a) => ({ host, a })),
  );
}
/** The heroes Thaurdir's burden moves to: the most resources, non-objective attachments or damage. */
function burdenTargets(s: GameState, code: string) {
  const heroes = seatIndices(s).flatMap((p) => seatView(s, p).heroes);
  const value = (h: Unit) =>
    code === ANGMAR.legacy
      ? h.resources
      : code === ANGMAR.majesty
        ? h.attachments.filter(
            (a) => !card(a.code).type_code.startsWith("objective"),
          ).length
        : h.damage;
  const most = Math.max(...heroes.map(value));
  return heroes.filter((h) => value(h) === most);
}
const BURDEN_RULE: Record<string, string> = {
  [ANGMAR.legacy]: "the hero with the most resources",
  [ANGMAR.majesty]: "the hero with the most non-objective attachments",
  [ANGMAR.spite]: "the hero with the most damage",
};
/** Thaurdir's burdens: "Forced: After a Sorcery treachery is revealed, move … to the hero with the most …". */
export function angmarCampaignAfterReveal(s: GameState, code: string) {
  if (
    !isAngmarCampaign(s.campaign) ||
    card(code).type_code !== "treachery" ||
    !(card(code).traits ?? "").split(".").some((t) => t.trim() === "Sorcery")
  )
    return;
  prepend(
    s,
    ...thaurdirBurdens(s).map(({ a }) =>
      fx("angmarThaurdirMove", { source: a.id, code: a.code }),
    ),
  );
}
/** Thaurdir's burden leaves play: it is removed from this game (the Campaign Pool keeps it). */
export function angmarCampaignAttachmentLeaves(
  s: GameState,
  host: Unit,
  a: { id: string; code: string },
) {
  if (!isAngmarCampaign(s.campaign) || !THAURDIR_BURDENS.includes(a.code))
    return false;
  host.attachments = host.attachments.filter((x) => x.id !== a.id);
  log(s, `${card(a.code).name} is removed from the game.`);
  return true;
}
const isGramCampaign = (s: GameState) =>
  isAngmarCampaign(s.campaign) &&
  s.scenarioId === "escape-from-mount-gram" &&
  !!gramState(s);
/** Escape from Mount Gram's Setup: Loot the Dungeons, once each captured deck is formed. */
export const angmarGramSetupEffects = (s: GameState) =>
  isGramCampaign(s)
    ? [fx("angmarLootSetup", { player: globalPlayerOrder(s)[0] })]
    : [];
/**
 * Escape from Mount Gram (its campaign card's other side): "Forced: After a
 * hero enters play, attach to that hero each set-aside permanent boon
 * attachment assigned to that character in the Campaign Log."
 */
export function angmarHeroEntered(s: GameState, hero: Unit) {
  if (!isGramCampaign(s)) return;
  const boons = (s.campaign!.permanent[hero.code] ?? []).filter(
    (code) => !hero.attachments.some((a) => a.code === code),
  );
  for (const code of boons)
    hero.attachments.push({
      id: `a${s.nextId++}`,
      code,
      exhausted: false,
      owner: hero.owner ?? ownerOf(s, hero),
    });
  if (boons.length)
    log(
      s,
      `${boons.map((code) => card(code).name).join(", ")} ${boons.length === 1 ? "is" : "are"} attached to ${name(hero)} again.`,
      "good",
    );
  angmarAmarthiulEntered(s, hero);
}
/** Loot the Dungeons "gets +4 quest points for each player in the game at every staging area". */
export const angmarSideQuestBonus = (s: GameState, quest: Unit) =>
  quest.code === ANGMAR.loot && isAngmarCampaign(s.campaign) && !quest.blanked
    ? 4 * globalPlayerOrder(s).length
    : 0;
/**
 * Escape from Mount Gram: "Forced: Instead of raising their threat by 1
 * during the refresh phase, each player raises their threat by the number of
 * completed quest cards plus the number of side quests in the victory display."
 */
export function angmarRefreshBase(s: GameState) {
  const q = gramState(s);
  if (!isGramCampaign(s) || !q) return 1;
  const completed = (s.stage >= 2 ? 1 : 0) + q.removedQuests.length;
  const sides = (s.victoryCards ?? []).filter((code) =>
    card(code).type_code.endsWith("side-quest"),
  ).length;
  return completed + sides;
}
/**
 * Across the Ettenmoors: "Forced: At the beginning of the quest phase, place
 * 1 resource on this card. Then, if there are 3 or more resources on it,
 * remove 3 resources from it to reveal 1 set-aside copy of Losing Time and
 * place it in the encounter discard pile."
 */
export function angmarCampaignQuestStart(s: GameState) {
  const clock = s.angmarCards?.losing;
  if (
    !isAngmarCampaign(s.campaign) ||
    s.scenarioId !== "across-the-ettenmoors" ||
    !clock
  )
    return;
  clock.clock += 1;
  log(
    s,
    `Across the Ettenmoors: 1 resource is placed on the campaign card (${clock.clock}).`,
  );
  if (clock.clock < 3 || !clock.aside) return;
  clock.clock -= 3;
  clock.aside -= 1;
  log(
    s,
    `Across the Ettenmoors: 3 resources are removed to reveal a set-aside Losing Time (${clock.aside} left).`,
    "danger",
  );
  prepend(s, fx("angmarRevealLosing", { player: globalPlayerOrder(s)[0] }));
}
/** Losing Time: "Surge. When Revealed: Each player must either raise their threat by 3 or exhaust a hero they control." */
export function angmarCampaignEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (code !== ANGMAR.losing || !isAngmarCampaign(s.campaign)) return false;
  if (!replay) s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("angmarLosingTime", { player })),
  );
  return true;
}
/** Losing Time: "Shadow: Attacking enemy either gets +3 [attack] or +3 [defense] until the end of the phase." */
export function angmarCampaignShadow(s: GameState, code: string) {
  const c = s.combat;
  if (code !== ANGMAR.losing || !c || !isAngmarCampaign(s.campaign))
    return false;
  prepend(
    s,
    fx("angmarLosingShadow", { target: c.enemyId, player: activeSeat(s) }),
  );
  return true;
}
/** Iârion enters play: the campaign card attaches Iârion's Pendant to him. */
export function angmarIarionEntered(s: GameState, iarion: Unit) {
  if (
    !isAngmarCampaign(s.campaign) ||
    !["intruders-in-chetwood", "deadmens-dike"].includes(s.scenarioId)
  )
    return;
  prepend(s, fx("angmarPendantAttach", { target: iarion.id }));
}

/** Protect the Innocent's Forced effect and Arnor Ravaged's, after an attack damages a character. */
export function angmarCampaignDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (!isAngmarCampaign(s.campaign) || value <= 0 || !context.combatDamage)
    return;
  // Arnor Ravaged: "Forced: After an attack damages a character but does not
  // destroy it, move 1 damage from Arnor Ravaged to that character."
  const ravaged = angmarRavaged(s);
  if (
    ravaged &&
    !ravaged.blanked &&
    ravaged.damage > 0 &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
    u.damage < stats(s, u).health
  ) {
    ravaged.damage -= 1;
    u.damage += 1;
    log(
      s,
      `Arnor Ravaged: 1 damage moves from it to ${name(u)} (${ravaged.damage} left on Arnor Ravaged).`,
      "danger",
    );
  }
  const quest = angmarInnocent(s);
  if (!quest || quest.blanked) return;
  quest.damage += 1;
  log(
    s,
    `Protect the Innocent: an attack damaged ${name(u)}; 1 damage is placed on it (${quest.damage} in all).`,
    "danger",
  );
  angmarInnocentCheck(s);
}
/** The players lose with 10 (or 20) damage on Protect the Innocent. */
export function angmarInnocentCheck(s: GameState) {
  const quest = angmarInnocent(s);
  if (!quest || s.status !== "playing" || quest.damage < innocentLimit(s))
    return;
  s.status = "lost";
  s.reason = `Protect the Innocent has ${quest.damage} damage on it: the players lose the game.`;
  s.choice = null;
  s.queue = [];
}
/** "When progress would be placed on Protect the Innocent, remove that much damage from it instead." */
export function angmarInnocentProgress(
  s: GameState,
  quest: Unit,
  amount: number,
) {
  if (quest.code !== ANGMAR.innocent || !isAngmarCampaign(s.campaign))
    return false;
  const removed = Math.min(quest.damage, amount);
  quest.damage -= removed;
  log(
    s,
    `Protect the Innocent: ${amount} progress would be placed on it; ${removed} damage is removed instead (${quest.damage} left).`,
    "good",
  );
  return true;
}
/** Protect the Innocent's quest points are "–": progress never defeats it. */
export const angmarSideDefeatBlocked = (s: GameState, quest: Unit) =>
  quest.code === ANGMAR.innocent && isAngmarCampaign(s.campaign);

/** Iârion's Pendant: the Response that cancels a revealed card's "when revealed" effects. */
export function angmarPendantRevealOptions(
  s: GameState,
  continuation: Effect,
): Option[] {
  return pendants(s).map(({ host, a, player }) => ({
    id: `pendant-${a.id}`,
    label: `Add Iârion's Pendant to the victory display to cancel the "when revealed" effects${several(s) ? ` · ${seatName(s, player)}` : ""}`,
    code: ANGMAR.pendant,
    ability: { player, source: a.id, code: ANGMAR.pendant, type: "response" },
    effects: [
      fx("angmarPendantSpend", { target: host.id, source: a.id, player }),
      { ...continuation, flag: true },
    ],
  }));
}
/** Iârion's Pendant: the Response that cancels a shadow effect just triggered. */
export function angmarPendantShadowOptions(
  s: GameState,
  effectiveShadow: boolean,
): Option[] {
  if (!effectiveShadow) return [];
  return pendants(s).map(({ host, a, player }) => ({
    id: `pendant-${a.id}`,
    label: `Add Iârion's Pendant to the victory display to cancel the shadow effect${several(s) ? ` · ${seatName(s, player)}` : ""}`,
    code: ANGMAR.pendant,
    ability: { player, source: a.id, code: ANGMAR.pendant, type: "response" },
    effects: [
      fx("angmarPendantSpend", { target: host.id, source: a.id, player }),
    ],
  }));
}
/** Each Iârion's Pendant in play, with its host and its controller. */
function pendants(s: GameState) {
  if (!isAngmarCampaign(s.campaign)) return [];
  return seatIndices(s).flatMap((player) =>
    [...seatView(s, player).heroes, ...seatView(s, player).allies].flatMap(
      (host) =>
        host.attachments
          .filter((a) => a.code === ANGMAR.pendant && !a.blanked)
          .map((a) => ({ host, a, player })),
    ),
  );
}

/** The campaign card's Resolution, once the chapter is won. */
export function resolveAngmarCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  // A hero in its controller's discard pile is a fallen hero.
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) {
    const lost = c.permanent[code] ?? [];
    delete c.permanent[code];
    c.boons = c.boons.filter((x) => !lost.includes(x));
  }
  // Mysterious Omens, defeated in this chapter, leaves the Campaign Pool, and
  // the boons it attached are earned (Permanent, on their heroes).
  const q = s.angmarCards;
  if (q?.omens) c.burdens = c.burdens.filter((x) => x !== ANGMAR.omens);
  for (const { code, hero } of q?.skills ?? []) {
    if (c.fallen.includes(hero) || c.boons.includes(code)) continue;
    c.boons.push(code);
    c.permanent[hero] = [...(c.permanent[hero] ?? []), code];
  }
  if ((q?.skills ?? []).length)
    log(
      s,
      `Mysterious Omens: ${q!.skills!.map((x) => `${card(x.code).name} (${card(x.hero).name})`).join(", ")} ${q!.skills!.length === 1 ? "is" : "are"} earned.`,
      "good",
    );
  // Determination: "Forced: If you win this scenario, mark in the Campaign
  // Log that attached character is 'determined.'"
  const determined = seatIndices(s).flatMap((p) =>
    [...seatView(s, p).heroes, ...seatView(s, p).allies]
      .filter((u) =>
        u.attachments.some(
          (a) => a.code === ANGMAR.determination && !a.blanked,
        ),
      )
      .map((u) => u.code),
  );
  if (determined.length) {
    c.determined = [...new Set([...(c.determined ?? []), ...determined])];
    log(
      s,
      `Determination: ${determined.map((code) => card(code).name).join(", ")} ${determined.length === 1 ? "is" : "are"} determined in the Campaign Log.`,
      "good",
    );
  }
  // Fend off Despair, defeated in this chapter: -2 starting threat each time.
  if (q?.despair) {
    c.threatReduction = (c.threatReduction ?? 0) + 2 * q.despair;
    log(
      s,
      `Fend off Despair: each player's starting threat is reduced by ${c.threatReduction} in the Campaign Log.`,
      "good",
    );
  }
  if (s.scenarioId === "the-battle-of-carn-dum") {
    // "Note the amount of damage on each hero at the end of the game."
    c.heroDamage = Object.fromEntries(
      seatIndices(s).flatMap((p) =>
        seatView(s, p).heroes.map((h) => [h.code, h.damage] as const),
      ),
    );
    for (const { code, seat } of q?.carnBoons ?? []) {
      if (!c.boons.includes(code)) c.boons.push(code);
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: seat };
    }
    log(
      s,
      `The Battle of Carn Dûm · Resolution: the damage on each hero is noted (${Object.entries(
        c.heroDamage,
      )
        .map(([code, n]) => `${card(code).name} ${n}`)
        .join(", ")}).`,
      "good",
    );
  }
  if (s.scenarioId === "the-dread-realm") {
    // "The players win the campaign!"
    c.outcome = "won";
    log(
      s,
      "The Dread Realm · Resolution: the players win the campaign!",
      "good",
    );
  }
  if (s.scenarioId === "the-treachery-of-rhudaur" && rhudaurClues(s).length)
    // "For each Clue a player controls, that player may add the boon with
    // the same name to the Campaign Pool and their deck."
    c.resolution = s.scenarioId;
  if (s.scenarioId === "across-the-ettenmoors") {
    // "Add each copy of Losing Time in the encounter deck or encounter
    // discard pile to the Campaign Pool."
    const copies = [...s.encounterDeck, ...s.encounterDiscard].filter(
      (code) => code === ANGMAR.losing,
    ).length;
    if (copies) {
      if (!c.burdens.includes(ANGMAR.losing)) c.burdens.push(ANGMAR.losing);
      c.burdenCopies = { ...(c.burdenCopies ?? {}), [ANGMAR.losing]: copies };
    }
    log(
      s,
      `Across the Ettenmoors · Resolution: ${copies} ${copies === 1 ? "copy" : "copies"} of Losing Time ${copies === 1 ? "joins" : "join"} the Campaign Pool.`,
      copies ? "danger" : "good",
    );
  }
  if (s.scenarioId === "escape-from-mount-gram") {
    // Loot the Dungeons' boons join the pool (and their chooser's deck).
    for (const { code, seat } of q?.loot ?? []) {
      if (!c.boons.includes(code)) c.boons.push(code);
      c.deckBoons = { ...(c.deckBoons ?? {}), [code]: seat };
    }
    // "Each player must make note of which unique cards are still in their
    // captured deck and not in play at the end of the game. Those cards
    // cannot be included in that player's deck for the rest of the campaign."
    const g = gramState(s);
    const inPlay = new Set(
      allCharacters(s).flatMap((u) => [
        u.code,
        ...u.attachments.map((a) => a.code),
      ]),
    );
    for (const seat of seatIndices(s)) {
      const banned = [
        ...new Set(
          (g?.capturedDecks[seat] ?? [])
            .map((u) => u.code)
            .filter(
              (code) =>
                card(code).is_unique &&
                card(code).type_code !== "hero" &&
                !inPlay.has(code),
            ),
        ),
      ];
      if (!banned.length) continue;
      c.banned = {
        ...(c.banned ?? {}),
        [seat]: [...new Set([...(c.banned?.[seat] ?? []), ...banned])],
      };
      log(
        s,
        `Escape from Mount Gram · Resolution: ${banned.map((code) => card(code).name).join(", ")} cannot be included in ${several(s) ? `${seatName(s, seat)}'s` : "your"} deck for the rest of the campaign.`,
        "danger",
      );
    }
  }
  if (s.scenarioId === "wastes-of-eriador") {
    // "Add each of those events [Determination] to the Campaign Pool." and
    // the Resolution: "Add Fend Off Despair to the Campaign Pool."
    if (!c.boons.includes(ANGMAR.determination))
      c.boons.push(ANGMAR.determination);
    c.boonCopies = {
      ...(c.boonCopies ?? {}),
      [ANGMAR.determination]: seatIndices(s),
    };
    if (!c.burdens.includes(ANGMAR.despair)) c.burdens.push(ANGMAR.despair);
    log(
      s,
      "The Wastes of Eriador · Resolution: each player's Determination and Fend off Despair are added to the Campaign Pool.",
      "good",
    );
  }
  if (s.scenarioId === "the-weather-hills") {
    // "Note the amount of damage on Protect the Innocent in the Campaign Log
    // (replacing the previous number)."
    c.innocent = angmarInnocent(s)?.damage ?? 0;
    log(
      s,
      `The Weather Hills · Resolution: Protect the Innocent's ${c.innocent} damage is noted in the Campaign Log.`,
      "good",
    );
  }
  if (s.scenarioId === "deadmens-dike") {
    // "Note the amount of damage on Protect the Innocent in the Campaign Log
    // (replacing the previous number) and remove Protect the Innocent from
    // the Campaign Pool. Add Arnor Ravaged to the Campaign Pool in its place
    // (found on the opposite side of Protect the Innocent)."
    c.innocent = angmarInnocent(s)?.damage ?? 0;
    c.ravaged = true;
    if (!c.burdens.includes(ANGMAR.innocent)) c.burdens.push(ANGMAR.innocent);
    const burden = q?.thaurdir;
    if (burden && !c.burdens.includes(burden)) c.burdens.push(burden);
    log(
      s,
      `Deadmen's Dike · Resolution: Protect the Innocent's ${c.innocent} damage is noted, and Arnor Ravaged takes its place in the Campaign Pool${burden ? `; ${card(burden).name} joins it` : ""}.`,
      "good",
    );
    // "The players as a group must select either Iârion's Pendant or
    // Amarthiúl's Courage to add to the Campaign Pool."
    c.resolution = s.scenarioId;
  }
  if (s.scenarioId === "intruders-in-chetwood") {
    // "Note the amount of damage on Protect the Innocent in the Campaign Log
    // and add Protect the Innocent to the Campaign Pool."
    c.innocent = angmarInnocent(s)?.damage ?? 0;
    if (!c.burdens.includes(ANGMAR.innocent)) c.burdens.push(ANGMAR.innocent);
    log(
      s,
      `Intruders in Chetwood · Resolution: Protect the Innocent's ${c.innocent} damage is noted in the Campaign Log, and it joins the Campaign Pool.`,
      "good",
    );
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  log(s, "The Campaign Log has been updated.", "good");
}

/** The Clues each player controls at the end of The Treachery of Rhudaur, with the boons of the same names. */
function rhudaurClues(s: GameState) {
  return seatIndices(s).flatMap((seat) =>
    [...seatView(s, seat).heroes, ...seatView(s, seat).allies].flatMap((u) =>
      u.attachments
        .filter((a) => clueBoon(a.code))
        .map((a) => ({ boon: clueBoon(a.code)!, seat })),
    ),
  );
}
/** The choices a campaign card's resolution asks of the players. */
export function angmarResolutionQuestions(s: GameState): {
  id: string;
  label: string;
  options: { id: string; code?: string; label: string }[];
}[] {
  const c = s.campaign;
  if (
    !isAngmarCampaign(c) ||
    s.status !== "won" ||
    c!.resolution !== s.scenarioId
  )
    return [];
  if (s.scenarioId === "the-treachery-of-rhudaur")
    return rhudaurClues(s).map(({ boon, seat }) => ({
      id: `clue:${boon}:${seat}`,
      label: `Add ${card(boon).name} to the Campaign Pool and ${several(s) ? `${seatName(s, seat)}'s` : "your"} deck?`,
      options: [
        { id: "add", code: boon, label: `Add ${card(boon).name}` },
        { id: "skip", label: "Do not add it" },
      ],
    }));
  if (s.scenarioId === "deadmens-dike")
    return [
      {
        id: "boon",
        label:
          "The players as a group select Iârion's Pendant or Amarthiúl's Courage and add it to the Campaign Pool.",
        options: [ANGMAR.pendant, ANGMAR.courage].map((code) => ({
          id: code,
          code,
          label: card(code).name,
        })),
      },
    ];
  return [];
}
/** Record the players' resolution choices in the Campaign Log. */
export function applyAngmarResolution(
  input: GameState,
  answers: Record<string, string>,
): GameState {
  const s = structuredClone(input);
  const c = s.campaign;
  const questions = angmarResolutionQuestions(s);
  if (!questions.length)
    throw new RuleError("This campaign card has no resolution waiting.");
  for (const q of questions)
    if (!q.options.some((o) => o.id === answers[q.id]))
      throw new RuleError(`Answer: ${q.label}`);
  if (s.scenarioId === "the-treachery-of-rhudaur") {
    const added: string[] = [];
    for (const q of questions) {
      if (answers[q.id] !== "add") continue;
      const [, boon, seat] = q.id.split(":");
      if (!c!.boons.includes(boon)) c!.boons.push(boon);
      c!.deckBoons = { ...(c!.deckBoons ?? {}), [boon]: Number(seat) };
      added.push(card(boon).name);
    }
    log(
      s,
      added.length
        ? `The Treachery of Rhudaur · Resolution: ${added.join(", ")} ${added.length === 1 ? "joins" : "join"} the Campaign Pool and ${added.length === 1 ? "its" : "their"} player's deck.`
        : "The Treachery of Rhudaur · Resolution: no Clue boon is added.",
      "good",
    );
  }
  if (s.scenarioId === "deadmens-dike") {
    if (!c!.boons.includes(answers.boon)) c!.boons.push(answers.boon);
    log(
      s,
      `Deadmen's Dike · Resolution: ${card(answers.boon).name} is added to the Campaign Pool${answers.boon === ANGMAR.pendant ? " (any player may add it to their deck)" : ""}.`,
      "good",
    );
  }
  c!.resolution = null;
  return s;
}

/** The campaign card's live state, for the quest inspector. */
export function angmarCampaignStatus(s: GameState): string[] {
  if (!isAngmarCampaign(s.campaign)) return [];
  const out: string[] = [];
  const quest = angmarInnocent(s);
  if (quest)
    out.push(
      `Protect the Innocent has ${quest.damage} damage: each attack that damages a character adds 1, progress placed on it removes damage instead, and the players lose at ${innocentLimit(s)}.`,
    );
  const q = s.angmarCards;
  if (s.campaign!.burdens.includes(ANGMAR.omens) && !q?.omens)
    out.push(
      "Mysterious Omens is shuffled into the encounter deck: defeating it removes it from the Campaign Pool and lets each player attach Cunning, Hardy, Resolute, Ruthless or Stalwart to a hero.",
    );
  for (const { host, a } of thaurdirBurdens(s))
    out.push(
      card(host.code).type_code === "hero"
        ? `${card(a.code).name} is attached to ${name(host)} (${a.code === ANGMAR.legacy ? "-2 willpower, its printed text box is blank" : a.code === ANGMAR.majesty ? "-2 attack, it cannot commit to the quest" : "-2 defense, it cannot be healed"}); after a Sorcery treachery is revealed it moves to ${BURDEN_RULE[a.code]}.`
        : `${card(a.code).name} is attached to Thaurdir: after a Sorcery treachery is revealed it moves to ${BURDEN_RULE[a.code]}.`,
    );
  const loot = s.staging.find((u) => u.code === ANGMAR.loot);
  if (loot)
    out.push(
      `Loot the Dungeons is in each player's staging area (${loot.progress}/${(card(ANGMAR.loot).quest ?? 0) + angmarSideQuestBonus(s, loot)} progress): defeating it rescues the cards captured beneath it and lets each player add Berelind, Chieftain's Brooch, Coruhaer, Laermuin, Mail of Eärnur or Silverthorn to their hand.`,
    );
  const clock = s.angmarCards?.losing;
  if (clock && s.scenarioId === "across-the-ettenmoors")
    out.push(
      `Across the Ettenmoors has ${clock.clock} resource${clock.clock === 1 ? "" : "s"}: it gains 1 at the beginning of each quest phase, and at 3 a set-aside Losing Time (${clock.aside} left) is revealed and placed in the encounter discard pile.`,
    );
  else if (s.campaign!.burdens.includes(ANGMAR.losing))
    out.push(
      `Losing Time (${s.campaign!.burdenCopies?.[ANGMAR.losing] ?? 1} in the Campaign Pool) is shuffled into the encounter deck.`,
    );
  if (isGramCampaign(s))
    out.push(
      `Each refresh phase, each player raises their threat by the number of completed quest cards plus the side quests in the victory display (now ${angmarRefreshBase(s)}) instead of 1.`,
    );
  const ravaged = angmarRavaged(s);
  if (ravaged)
    out.push(
      `Arnor Ravaged has ${ravaged.damage} damage: after an attack damages a character without destroying it, 1 of its damage moves to that character.`,
    );
  if (
    (s.scenarioId === "wastes-of-eriador" ||
      s.campaign!.burdens.includes(ANGMAR.despair)) &&
    !q?.despair
  )
    out.push(
      "Fend off Despair is shuffled into the encounter deck: while it is in play each event gains doomed 1, and defeating it lowers each player's starting threat by 2 in later chapters.",
    );
  if (s.campaign!.determined?.length)
    out.push(
      `Determined in the Campaign Log: ${s.campaign!.determined.map((code) => card(code).name).join(", ")} (each Determination readies them).`,
    );
  if (s.scenarioId === "the-battle-of-carn-dum")
    out.push(
      "The damage on each hero at the end of this chapter is noted in the Campaign Log: each hero begins The Dread Realm with it.",
    );
  if (s.scenarioId === "the-dread-realm" && s.campaign!.heroDamage)
    out.push(
      `Each hero began with the damage noted after The Battle of Carn Dûm (${Object.entries(
        s.campaign!.heroDamage,
      )
        .map(([code, n]) => `${card(code).name} ${n}`)
        .join(", ")}).`,
    );
  if (q?.skills?.length)
    out.push(
      `Earned once this chapter is won (Permanent): ${q.skills.map((x) => `${card(x.code).name} on ${card(x.hero).name}`).join(", ")}.`,
    );
  return out;
}

/** The campaign's effects. */
export function angmarCampaignEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "angmarInnocentResources": {
      const p = e.player ?? first(s);
      const quest = angmarInnocent(s);
      if (!quest) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Intruders in Chetwood · ${several(s) ? `${seatName(s, p)} may` : "You may"} place 4 damage on Protect the Innocent`,
          [
            {
              id: "damage",
              label: `Place 4 damage on Protect the Innocent to add 1 resource to each of ${several(s) ? "their" : "your"} heroes`,
              code: ANGMAR.innocent,
              effects: [fx("angmarInnocentTake", { player: p })],
            },
            { id: "skip", label: "Do not place damage", effects: [] },
          ],
          card(ANGMAR.chetwoodCard).text,
        ),
      );
      return true;
    }
    case "angmarInnocentTake": {
      const p = e.player ?? first(s);
      const quest = angmarInnocent(s);
      if (!quest) return true;
      quest.damage += 4;
      forOwner(s, p, () => {
        for (const h of s.heroes) h.resources += 1;
      });
      log(
        s,
        `Intruders in Chetwood: ${who(s, p)} ${several(s) ? "places" : "place"} 4 damage on Protect the Innocent (${quest.damage} in all) and each of ${several(s) ? "their" : "your"} heroes gains 1 resource.`,
      );
      angmarInnocentCheck(s);
      return true;
    }
    case "angmarPendantAttach": {
      // "Attach Iârion's Pendant to Iârion."
      const iarion = get(s, e.target);
      if (!iarion || iarion.attachments.some((a) => a.code === ANGMAR.pendant))
        return true;
      iarion.attachments.push({
        id: `a${s.nextId++}`,
        code: ANGMAR.pendant,
        exhausted: false,
      });
      log(s, `Iârion's Pendant is attached to ${name(iarion)}.`, "good");
      return true;
    }
    case "angmarOmensDiscard": {
      const p = e.player ?? first(s);
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const i = Math.floor(random(s) * s.hand.length);
        const [u] = s.hand.splice(i, 1);
        s.discard.push(u.code);
        log(
          s,
          `Mysterious Omens: ${who(s, p)} ${several(s) ? "discards" : "discard"} ${name(u)} at random.`,
          "danger",
        );
      });
      return true;
    }
    case "angmarSkillChoice": {
      const p = e.player ?? first(s);
      const skills = freeSkills(s);
      if (!skills.length || !seatView(s, p).heroes.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Mysterious Omens · ${several(s) ? `${seatName(s, p)} may` : "You may"} attach a boon to a hero`,
          [
            ...skills.map((code) => ({
              id: code,
              code,
              label: card(code).name,
              effects: [fx("angmarSkillHero", { code, player: p })],
            })),
            { id: "skip", label: "Do not attach a boon", effects: [] },
          ],
          card(ANGMAR.omens).text,
        ),
      );
      return true;
    }
    case "angmarSkillHero": {
      const p = e.player ?? first(s);
      const heroes = seatView(s, p).heroes;
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name} · Attach to a hero ${several(s) ? `${seatName(s, p)} controls` : "you control"}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("angmarSkillAttach", {
                code: e.code,
                target: h.id,
                player: p,
              }),
            ],
          })),
          card(e.code!).text,
        ),
      );
      return true;
    }
    case "angmarSkillAttach": {
      const p = e.player ?? first(s);
      const hero = get(s, e.target);
      if (!hero || !freeSkills(s).includes(e.code!)) return true;
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code: e.code!,
        exhausted: false,
        owner: p,
      });
      (state(s).skills ??= []).push({ code: e.code!, hero: hero.code });
      log(
        s,
        `Mysterious Omens: ${card(e.code!).name} is attached to ${name(hero)} (Permanent).`,
        "good",
      );
      return true;
    }
    case "angmarRuthlessAmount": {
      const hero = get(s, e.source);
      const enemy = get(s, e.target);
      if (!hero || !enemy || !hero.damage) return true;
      choose(
        s,
        `Ruthless · Move damage from ${name(hero)} to ${name(enemy)}`,
        Array.from({ length: hero.damage }, (_, i) => i + 1).map((n) => ({
          id: String(n),
          label: `Move ${n} damage`,
          effects: [
            fx("angmarRuthlessMove", {
              source: hero.id,
              target: enemy.id,
              value: n,
              player: e.player,
            }),
          ],
        })),
      );
      return true;
    }
    case "angmarRuthlessMove": {
      const hero = get(s, e.source);
      const enemy = get(s, e.target);
      const n = Math.min(e.value ?? 0, hero?.damage ?? 0);
      if (!hero || !enemy || n <= 0) return true;
      hero.damage -= n;
      enemy.damage += n;
      log(
        s,
        `Ruthless: ${n} damage moves from ${name(hero)} to ${name(enemy)}.`,
        "good",
      );
      // Moving damage is not dealing it; a destroyed enemy leaves play as usual.
      check(s);
      return true;
    }
    case "angmarStalwartPlay": {
      const p = e.player ?? first(s);
      const hero = get(s, e.target);
      if (!hero) return true;
      forOwner(s, p, () => {
        const i = s.discard.indexOf(e.code!);
        if (i < 0) return;
        s.discard.splice(i, 1);
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
        try {
          playHandCard(s, { type: "PLAY", id: u.id, target: hero.id });
          log(
            s,
            `Stalwart: ${name(u)} is played from the discard pile on ${name(hero)}.`,
            "good",
          );
        } catch (error) {
          s.hand = s.hand.filter((x) => x.id !== u.id);
          s.discard.push(e.code!);
          throw error;
        }
      });
      return true;
    }
    case "angmarResoluteWindow": {
      const hero = get(s, e.target);
      if (!hero) return true;
      const context = readDamageContext(e);
      const value = e.value ?? 0;
      forOwner(s, e.player ?? ownerOf(s, hero), () =>
        choose(
          s,
          `Resolute · ${value} damage is dealt to ${name(hero)}`,
          [
            {
              id: "cancel",
              code: ANGMAR.resolute,
              label: `Cancel ${Math.min(2, value)} damage (once per game)`,
              effects: [
                fx("angmarResoluteResume", {
                  target: hero.id,
                  source: e.source,
                  value: value - Math.min(2, value),
                  text: encodeDamageContext({
                    ...context,
                    bypassResolute: true,
                  }),
                  flag: true,
                }),
              ],
            },
            {
              id: "skip",
              label: "Do not cancel",
              effects: [
                fx("angmarResoluteResume", {
                  target: hero.id,
                  value,
                  text: encodeDamageContext({
                    ...context,
                    bypassResolute: true,
                  }),
                }),
              ],
            },
          ],
          card(ANGMAR.resolute).text,
        ),
      );
      return true;
    }
    case "angmarResoluteResume": {
      const hero = get(s, e.target);
      if (!hero) return true;
      if (e.flag && e.source) {
        (state(s).spent ??= []).push(e.source);
        log(s, `Resolute: damage dealt to ${name(hero)} is canceled.`, "good");
      }
      const context = readDamageContext(e);
      const value = e.value ?? 0;
      if (!value) {
        check(s);
        return true;
      }
      const remaining = stats(s, hero).health - hero.damage;
      const enemy = get(s, context.enemyId);
      if (damage(s, hero.id, value, context) && enemy && context.combatDamage)
        applyCombatDamageConsequences(s, hero, enemy, value, remaining);
      return true;
    }
    case "angmarThaurdirMove": {
      const found = thaurdirBurdens(s).find(({ a }) => a.id === e.source);
      if (!found) return true;
      const targets = burdenTargets(s, found.a.code);
      if (targets.length === 1)
        prepend(
          s,
          fx("angmarThaurdirPlace", {
            source: found.a.id,
            target: targets[0].id,
          }),
        );
      else if (targets.length)
        forOwner(s, first(s), () =>
          choose(
            s,
            `${card(found.a.code).name} · Choose ${BURDEN_RULE[found.a.code]}`,
            targets.map((h) => ({
              id: h.id,
              code: h.code,
              label: name(h),
              effects: [
                fx("angmarThaurdirPlace", { source: found.a.id, target: h.id }),
              ],
            })),
            card(found.a.code).text,
          ),
        );
      return true;
    }
    case "angmarThaurdirPlace": {
      const found = thaurdirBurdens(s).find(({ a }) => a.id === e.source);
      const hero = get(s, e.target);
      if (!found || !hero) return true;
      if (found.host.id !== hero.id) {
        found.host.attachments = found.host.attachments.filter(
          (x) => x.id !== found.a.id,
        );
        hero.attachments.push(found.a);
      }
      log(
        s,
        `${card(found.a.code).name} moves to ${name(hero)} (it counts as a Sorcery attachment).`,
        "danger",
      );
      return true;
    }
    case "angmarCarnChoice": {
      const p = e.player ?? first(s);
      const taken = (s.angmarCards?.carnBoons ?? []).map((x) => x.code);
      const free = CARN_BOONS.filter(
        (code) => !taken.includes(code) && !s.campaign!.boons.includes(code),
      );
      if (!free.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `The Battle of Carn Dûm · ${several(s) ? `${seatName(s, p)} may` : "You may"} add a boon to ${several(s) ? "their" : "your"} opening hand`,
          [
            ...free.map((code) => ({
              id: code,
              code,
              label: card(code).name,
              effects: [fx("angmarCarnTake", { code, player: p })],
            })),
            { id: "skip", label: "Do not take a boon", effects: [] },
          ],
          card(ANGMAR.carnCard).text,
        ),
      );
      return true;
    }
    case "angmarCarnTake": {
      const p = e.player ?? first(s);
      if (
        !CARN_BOONS.includes(e.code!) ||
        (s.angmarCards?.carnBoons ?? []).some((x) => x.code === e.code)
      )
        return true;
      forOwner(s, p, () => {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
        (state(s).setupHand ??= []).push(u.id);
      });
      (state(s).carnBoons ??= []).push({ code: e.code!, seat: p });
      log(
        s,
        `The Battle of Carn Dûm: ${card(e.code!).name} is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} opening hand.`,
        "good",
      );
      return true;
    }
    case "angmarDreadSearch": {
      const p = e.player ?? first(s);
      const boons = [
        ...new Set(
          seatView(s, p).deck.filter(
            (code) => card(code).sphere_code === "boon",
          ),
        ),
      ];
      if (!boons.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `The Dread Realm · ${several(s) ? `${seatName(s, p)} may` : "You may"} search ${several(s) ? "their" : "your"} deck for a boon card`,
          [
            ...boons.map((code) => ({
              id: code,
              code,
              label: card(code).name,
              effects: [fx("angmarDreadTake", { code, player: p })],
            })),
            { id: "skip", label: "Do not search", effects: [] },
          ],
          card(ANGMAR.dreadCard).text,
        ),
      );
      return true;
    }
    case "angmarDreadTake": {
      const p = e.player ?? first(s);
      forOwner(s, p, () => {
        const i = s.deck.indexOf(e.code!);
        if (i < 0) return;
        s.deck.splice(i, 1);
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
        (state(s).setupHand ??= []).push(u.id);
        shuffle(s, s.deck);
      });
      log(
        s,
        `The Dread Realm: ${card(e.code!).name} is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} opening hand.`,
        "good",
      );
      return true;
    }
    case "angmarLoreReturn": {
      const p = e.player ?? first(s);
      const discard = seatView(s, p).discard;
      if (!discard.length || !(e.count ?? 0)) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Lore of Ancient Arnor · ${several(s) ? `${seatName(s, p)} returns` : "Return"} a card from ${several(s) ? "their" : "your"} discard pile to ${several(s) ? "their" : "your"} hand`,
          [...new Set(discard)].map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("angmarLoreTake", { code, player: p, count: e.count }),
            ],
          })),
          card(ANGMAR.lore).text,
        ),
      );
      return true;
    }
    case "angmarLoreTake": {
      const p = e.player ?? first(s);
      forOwner(s, p, () => {
        const i = s.discard.lastIndexOf(e.code!);
        if (i < 0) return;
        s.discard.splice(i, 1);
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      });
      log(
        s,
        `Lore of Ancient Arnor: ${card(e.code!).name} returns to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand.`,
        "good",
      );
      if ((e.count ?? 1) > 1)
        prepend(
          s,
          fx("angmarLoreReturn", { player: p, count: (e.count ?? 1) - 1 }),
        );
      return true;
    }
    case "angmarLoreShuffle":
      for (const p of seatIndices(s))
        forOwner(s, p, () => {
          if (!s.discard.length) return;
          s.deck.push(...s.discard.splice(0));
          shuffle(s, s.deck);
        });
      log(
        s,
        "Lore of Ancient Arnor: each player shuffles the rest of their discard pile into their deck.",
      );
      return true;
    case "angmarRevealLosing":
      revealed(s, ANGMAR.losing, undefined, "encounter");
      return true;
    case "angmarLosingTime": {
      const p = e.player ?? first(s);
      const heroes = seatView(s, p).heroes.filter((h) => !h.exhausted);
      forOwner(s, p, () =>
        choose(
          s,
          `Losing Time · ${several(s) ? `${seatName(s, p)} must` : "You must"} raise ${several(s) ? "their" : "your"} threat by 3 or exhaust a hero`,
          [
            {
              id: "threat",
              label: "Raise your threat by 3",
              effects: [fx("angmarLosingThreat", { player: p })],
            },
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Exhaust ${name(h)}`,
              effects: [fx("exhaust", { target: h.id })],
            })),
          ],
          card(ANGMAR.losing).text,
        ),
      );
      return true;
    }
    case "angmarLosingThreat": {
      const p = e.player ?? first(s);
      forOwner(s, p, () => raiseThreat(s, 3, "encounter"));
      log(
        s,
        `Losing Time: ${who(s, p)} ${several(s) ? "raises" : "raise"} the threat by 3.`,
        "danger",
      );
      return true;
    }
    case "angmarLosingShadow": {
      const enemy = get(s, e.target);
      if (!enemy) return true;
      choose(
        s,
        `Losing Time · ${name(enemy)} gets +3 attack or +3 defense until the end of the phase`,
        (["attack", "defense"] as const).map((stat) => ({
          id: stat,
          label: `+3 ${stat}`,
          effects: [fx("angmarLosingBoost", { target: enemy.id, text: stat })],
        })),
        card(ANGMAR.losing).text,
      );
      return true;
    }
    case "angmarLosingBoost": {
      const enemy = get(s, e.target);
      if (!enemy || (e.text !== "attack" && e.text !== "defense")) return true;
      (state(s).boosts ??= []).push({
        target: enemy.id,
        phase: angmarPhase(s.phase),
        round: s.round,
        stat: e.text,
        value: 3,
      });
      log(
        s,
        `Losing Time: ${name(enemy)} gets +3 ${e.text} until the end of the phase.`,
        "danger",
      );
      return true;
    }
    case "angmarLootSetup": {
      const q = gramState(s);
      if (!q || s.staging.some((u) => u.code === ANGMAR.loot)) return true;
      const loot = make(s, ANGMAR.loot);
      delete loot.owner;
      s.staging.push(loot);
      // "capturing the bottom 5 cards of each player's captured deck underneath it."
      const cards = globalPlayerOrder(s).flatMap((p) =>
        (q.capturedDecks[p] ?? []).splice(-5),
      );
      if (cards.length) (q.captured[loot.id] ??= []).push(...cards);
      log(
        s,
        `Escape from Mount Gram: Loot the Dungeons enters the staging area and captures ${cards.length} card${cards.length === 1 ? "" : "s"}.`,
        "danger",
      );
      return true;
    }
    case "angmarLootChoice": {
      const p = e.player ?? first(s);
      const taken = (s.angmarCards?.loot ?? []).map((x) => x.code);
      const free = LOOT_BOONS.filter(
        (code) => !taken.includes(code) && !s.campaign!.boons.includes(code),
      );
      if (!free.length || s.table?.seats[p]?.eliminated) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Loot the Dungeons · ${several(s) ? `${seatName(s, p)} may` : "You may"} add a boon to ${several(s) ? "their" : "your"} hand`,
          [
            ...free.map((code) => ({
              id: code,
              code,
              label: card(code).name,
              effects: [fx("angmarLootTake", { code, player: p })],
            })),
            { id: "skip", label: "Do not take a boon", effects: [] },
          ],
          card(ANGMAR.loot).text,
        ),
      );
      return true;
    }
    case "angmarLootTake": {
      const p = e.player ?? first(s);
      const taken = (s.angmarCards?.loot ?? []).map((x) => x.code);
      if (!LOOT_BOONS.includes(e.code!) || taken.includes(e.code!)) return true;
      forOwner(s, p, () => {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      });
      (state(s).loot ??= []).push({ code: e.code!, seat: p });
      log(
        s,
        `Loot the Dungeons: ${card(e.code!).name} is added to ${several(s) ? `${seatName(s, p)}'s` : "your"} hand.`,
        "good",
      );
      return true;
    }
    case "angmarDetermination": {
      const p = e.player ?? first(s);
      const targets = uniqueCharacters(s);
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          "Determination · Attach to a unique character",
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("angmarDeterminationAttach", { target: u.id, player: p }),
            ],
          })),
          card(ANGMAR.determination).text,
        ),
      );
      return true;
    }
    case "angmarDeterminationAttach": {
      const p = e.player ?? first(s);
      const host = get(s, e.target);
      const pending = [...(s.resolvingEvents ?? [])]
        .reverse()
        .find(
          (event) =>
            event.unit.code === ANGMAR.determination &&
            event.destination !== "spent",
        );
      if (!host || !pending) return true;
      // The event stays in play as a Condition attachment.
      pending.destination = "spent";
      host.attachments.push({
        id: pending.unit.id,
        code: ANGMAR.determination,
        exhausted: false,
        owner: pending.unit.owner ?? p,
      });
      const determined = s.campaign!.determined ?? [];
      const ready = seatIndices(s).flatMap((q) =>
        [...seatView(s, q).heroes, ...seatView(s, q).allies].filter(
          (u) =>
            u.attachments.some((a) => a.code === ANGMAR.determination) ||
            determined.includes(u.code),
        ),
      );
      for (const u of ready) readyCharacter(s, u);
      log(
        s,
        `Determination is attached to ${name(host)}; ${ready.map(name).join(", ")} ${ready.length === 1 ? "readies" : "ready"}.`,
        "good",
      );
      return true;
    }
    case "angmarPendantSpend": {
      const host = get(s, e.target);
      if (!host) return true;
      host.attachments = host.attachments.filter((a) => a.id !== e.source);
      (s.victoryCards ??= []).push(ANGMAR.pendant);
      s.victory += card(ANGMAR.pendant).victory ?? 0;
      log(
        s,
        "Iârion's Pendant is added to the victory display, and the effect is canceled.",
        "good",
      );
      return true;
    }
  }
  return false;
}

/** The Campaign Pool's cards this campaign can hold so far. */
export const ANGMAR_BOONS: readonly string[] = [
  ...SKILL_BOONS,
  ANGMAR.pendant,
  ANGMAR.courage,
  ANGMAR.determination,
  ...LOOT_BOONS,
  ...CLUE_BOONS,
  ...CARN_BOONS,
];
export const ANGMAR_BURDENS: readonly string[] = [
  ANGMAR.innocent,
  ANGMAR.omens,
  ...THAURDIR_BURDENS,
  ANGMAR.despair,
  ANGMAR.losing,
];
/** The Angmar Awakened Campaign Log in a saved game. */
export function validateAngmarCampaign(s: GameState): boolean {
  const c = s.campaign;
  if (!c || c.kind !== "angmar") return false;
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
  const q = s.angmarCards;
  return (
    ANGMAR_CAMPAIGN_ORDER.includes(s.scenarioId) &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every((x) => ANGMAR_BOONS.includes(x)) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every((x) => ANGMAR_BURDENS.includes(x)) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    Object.entries(c.permanent).every(
      ([h, cs]) => hero(h) && codes(cs) && cs.every((x) => c.boons.includes(x)),
    ) &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (c.resolution === s.scenarioId &&
        s.status === "won" &&
        ["deadmens-dike", "the-treachery-of-rhudaur"].includes(
          s.scenarioId,
        ))) &&
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === (s.table?.seats.length ?? 1) &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    (c.innocent === undefined || integer(c.innocent)) &&
    (c.ravaged === undefined || typeof c.ravaged === "boolean") &&
    (c.threatReduction === undefined ||
      (integer(c.threatReduction) && c.threatReduction % 2 === 0)) &&
    (c.banned === undefined ||
      (!!c.banned &&
        typeof c.banned === "object" &&
        !Array.isArray(c.banned) &&
        Object.entries(c.banned).every(
          ([seat, list]) =>
            /^\d+$/.test(seat) &&
            +seat < (s.table?.seats.length ?? 1) &&
            codes(list),
        ))) &&
    (c.heroDamage === undefined ||
      (!!c.heroDamage &&
        typeof c.heroDamage === "object" &&
        !Array.isArray(c.heroDamage) &&
        Object.entries(c.heroDamage).every(
          ([code, n]) => hero(code) && integer(n),
        ))) &&
    (c.outcome === undefined ||
      (c.outcome === "won" &&
        c.completed.at(-1)?.scenarioId === "the-dread-realm")) &&
    (c.determined === undefined ||
      (codes(c.determined) &&
        new Set(c.determined).size === c.determined.length)) &&
    (c.deckBoons === undefined ||
      (!!c.deckBoons &&
        typeof c.deckBoons === "object" &&
        !Array.isArray(c.deckBoons) &&
        Object.entries(c.deckBoons).every(
          ([code, seat]) =>
            ANGMAR_DECK_BOONS.includes(code) &&
            c.boons.includes(code) &&
            integer(seat) &&
            seat < (s.table?.seats.length ?? 1),
        ))) &&
    (c.burdenCopies === undefined ||
      (!!c.burdenCopies &&
        typeof c.burdenCopies === "object" &&
        !Array.isArray(c.burdenCopies) &&
        Object.entries(c.burdenCopies).every(
          ([code, n]) =>
            code === ANGMAR.losing &&
            c.burdens.includes(code) &&
            integer(n) &&
            n >= 1 &&
            n <= 5,
        ))) &&
    (c.boonCopies === undefined ||
      (!!c.boonCopies &&
        typeof c.boonCopies === "object" &&
        !Array.isArray(c.boonCopies) &&
        Object.entries(c.boonCopies).every(
          ([code, seats]) =>
            code === ANGMAR.determination &&
            c.boons.includes(code) &&
            Array.isArray(seats) &&
            seats.length <= 4 &&
            seats.every(
              (seat) =>
                seat === null ||
                (integer(seat) && seat < (s.table?.seats.length ?? 1)),
            ),
        ))) &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (r, i) =>
        ANGMAR_CAMPAIGN_ORDER[i] === r.scenarioId &&
        // Victory points can take a score below 0.
        Number.isSafeInteger(r.score) &&
        integer(r.rounds),
    ) &&
    (c.completed.at(-1)?.scenarioId === s.scenarioId ||
      (nextAngmarChapter(c) === s.scenarioId && s.status !== "won")) &&
    (q === undefined ||
      (!!q &&
        typeof q === "object" &&
        (q.innocent === undefined || typeof q.innocent === "string") &&
        (q.thaurdir === undefined || THAURDIR_BURDENS.includes(q.thaurdir)) &&
        (q.despair === undefined || (integer(q.despair) && q.despair > 0)) &&
        (q.setupHand === undefined || codes(q.setupHand)) &&
        (q.carnBoons === undefined ||
          (Array.isArray(q.carnBoons) &&
            q.carnBoons.every(
              (x) =>
                !!x &&
                CARN_BOONS.includes(x.code) &&
                integer(x.seat) &&
                x.seat < (s.table?.seats.length ?? 1),
            ) &&
            new Set(q.carnBoons.map((x) => x.code)).size ===
              q.carnBoons.length)) &&
        (q.losing === undefined ||
          (!!q.losing &&
            integer(q.losing.aside) &&
            q.losing.aside <= 5 &&
            integer(q.losing.clock) &&
            q.losing.clock <= 2)) &&
        (q.loot === undefined ||
          (Array.isArray(q.loot) &&
            q.loot.every(
              (x) =>
                !!x &&
                LOOT_BOONS.includes(x.code) &&
                integer(x.seat) &&
                x.seat < (s.table?.seats.length ?? 1),
            ) &&
            new Set(q.loot.map((x) => x.code)).size === q.loot.length)) &&
        (q.omens === undefined || typeof q.omens === "boolean") &&
        (q.skills === undefined ||
          (Array.isArray(q.skills) &&
            q.skills.every(
              (x) =>
                !!x &&
                SKILL_BOONS.includes(x.code) &&
                typeof x.hero === "string" &&
                hero(x.hero),
            ))) &&
        (q.spent === undefined || codes(q.spent)) &&
        (q.boosts === undefined ||
          (Array.isArray(q.boosts) &&
            q.boosts.every(
              (b) =>
                !!b &&
                typeof b.target === "string" &&
                typeof b.phase === "string" &&
                integer(b.round) &&
                (b.stat === undefined ||
                  b.stat === "attack" ||
                  b.stat === "defense") &&
                (b.value === undefined || integer(b.value)),
            )))))
  );
}
