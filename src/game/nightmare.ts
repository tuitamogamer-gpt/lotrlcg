/**
 * Nightmare mode: a Nightmare Deck's setup card lists the encounter cards it
 * removes from a scenario's standard encounter deck, its own encounter cards
 * are shuffled into the rest, and the card is flipped next to the quest deck,
 * its rules active for the whole game (see docs/NIGHTMARE.md).
 */
import type { GameState, ScenarioId } from "./types";
import { card, encounterCards } from "./cards";

const P = "octgn:e84f94bf-201b-4adf-95d2-0012e0bb50";
/** The Core Set Nightmare Deck's cards (OCTGN ids, as DragnCards keeps them). */
export const NIGHTMARE_CORE = {
  /** Passage Through Mirkwood's setup card and Nightmare Deck. */
  mirkwoodCard: `${P}01`,
  camp: `${P}06`,
  backtrack: `${P}09`,
  flies: `${P}15`,
  glade: `${P}17`,
  spiders: `${P}23`,
  web: `${P}24`,
  brood: `${P}28`,
  spawn: `${P}29`,
  /** Journey Along the Anduin's setup card and Nightmare Deck. */
  anduinCard: `${P}03`,
  ford: `${P}07`,
  trollSpawn: `${P}08`,
  rats: `${P}10`,
  marshlands: `${P}16`,
  outlaws: `${P}18`,
  pursuit: `${P}19`,
  smoking: `${P}21`,
  trollAttack: `${P}27`,
  /** Escape from Dol Guldur's setup card and Nightmare Deck. */
  dolGuldurCard: `${P}05`,
  catacomb: `${P}11`,
  captive: `${P}12`,
  interrogation: `${P}13`,
  labyrinth: `${P}14`,
  sentinel: `${P}20`,
  spider: `${P}22`,
  chamber: `${P}25`,
  master: `${P}26`,
} as const;

interface NightmareDeck {
  /** The setup card, flipped next to the quest deck. */
  card: string;
  /** "Remove the following cards, in the specified quantities, from the standard encounter deck" (by printed title). */
  removals: Record<string, number>;
}
/** The scenarios whose Nightmare Decks are supported, in publication order. */
export const NIGHTMARE: Partial<Record<ScenarioId, NightmareDeck>> = {
  mirkwood: {
    card: NIGHTMARE_CORE.mirkwoodCard,
    removals: {
      "Ungoliant's Spawn": 1,
      "Black Forest Bats": 1,
      "Forest Spider": 3,
      "Dol Guldur Orcs": 3,
      "Old Forest Road": 1,
      "Forest Gate": 2,
      "Mountains of Mirkwood": 3,
      "Caught in a Web": 2,
    },
  },
  anduin: {
    card: NIGHTMARE_CORE.anduinCard,
    removals: {
      "Evil Storm": 3,
      "Treacherous Fog": 2,
      "Banks of the Anduin": 2,
      "Dol Guldur Orcs": 3,
      "Enchanted Stream": 2,
      Despair: 2,
      "Misty Mountain Goblins": 3,
      "Necromancer's Pass": 2,
    },
  },
  "dol-guldur": {
    card: NIGHTMARE_CORE.dolGuldurCard,
    removals: {
      "Dol Guldur Orcs": 2,
      "Enchanted Stream": 2,
      "Great Forest Web": 1,
      "Mountains of Mirkwood": 3,
      "Caught in a Web": 2,
      "The Necromancer's Reach": 1,
      "Necromancer's Pass": 1,
      "Under the Shadow": 2,
      "Tower Gate": 2,
      "Iron Shackles": 1,
    },
  },
};
export const nightmareSupported = (id?: ScenarioId) => !!id && id in NIGHTMARE;
/** A Nightmare mode game of a supported scenario. */
export const nightmareLive = (s: GameState) =>
  !!s.nightmareMode && nightmareSupported(s.scenarioId);
/** The setup card flipped next to the quest deck. */
export const nightmareCardOf = (s: GameState) =>
  nightmareLive(s) ? NIGHTMARE[s.scenarioId]!.card : undefined;
/**
 * Journey Along the Anduin (Nightmare): "If the encounter deck is empty (at
 * any time), shuffle the encounter discard pile back into the encounter
 * deck."
 */
export const nightmareRefillsEncounterDeck = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "anduin";
/** The Nightmare Deck's encounter set ("Passage Through Mirkwood - Nightmare"). */
const nightmareSet = (id: ScenarioId) =>
  card(NIGHTMARE[id]!.card).encounter_set;
const plainTitle = (name: string) => name.replace(/’/g, "'");
/**
 * The Nightmare encounter deck: the standard encounter deck without the
 * removed cards, with the Nightmare Deck's encounter cards shuffled in (the
 * caller shuffles).
 */
export function nightmareEncounterDeck(id: ScenarioId, standard: string[]) {
  const deck = NIGHTMARE[id];
  if (!deck) return standard;
  const out = [...standard];
  for (const [title, n] of Object.entries(deck.removals))
    for (let i = 0; i < n; i++) {
      const at = out.findIndex((code) => plainTitle(card(code).name) === title);
      if (at < 0)
        throw new Error(`${title} is not in the standard encounter deck.`);
      out.splice(at, 1);
    }
  const set = nightmareSet(id);
  for (const c of encounterCards)
    if (c.encounter_set === set && c.type_code !== "nightmare")
      out.push(...(Array(c.quantity ?? 1).fill(c.code) as string[]));
  return out;
}
/** The quest inspector's lines for the Nightmare card. */
export function nightmareStatus(s: GameState): string[] {
  if (!nightmareLive(s)) return [];
  if (s.scenarioId === "mirkwood")
    return [
      "Passage Through Mirkwood · Nightmare mode: during setup, each player revealed 1 card from the encounter deck and added it to the staging area.",
    ];
  if (s.scenarioId === "anduin")
    return [
      "Journey Along the Anduin · Nightmare mode: Troll enemies cannot have attachments, and an empty encounter deck is refilled from the encounter discard pile at any time.",
    ];
  if (s.scenarioId === "dol-guldur") {
    const seats = s.table?.seats.length ?? 1;
    const captured = seats >= 4 ? 3 : seats === 3 ? 2 : 1;
    const held = (s.prisoner ? 1 : 0) + (s.nightmare?.prisoners?.length ?? 0);
    return [
      `Escape from Dol Guldur · Nightmare mode: when stage 1B is revealed, ${captured} random ${captured === 1 ? "hero is" : "heroes (of different players) are"} captured as “the prisoner”${held ? ` (${held} held now)` : ""}.`,
    ];
  }
  return [];
}
