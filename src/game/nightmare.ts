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

const G = "octgn:b91cc63a-7fa3-46b4-b5b2-9da1663f00";
/** The Shadows of Mirkwood Nightmare Decks' cards. */
export const NIGHTMARE_SOM = {
  /** The Hunt for Gollum's setup card and Nightmare Deck. */
  gollumCard: `${G}01`,
  enemyTrail: `${G}03`,
  restless: `${G}04`,
  trailCold: `${G}05`,
  hawk: `${G}06`,
  warg: `${G}07`,
  watched: `${G}08`,
  lookout: `${G}09`,
  pools: `${G}10`,
  /** Conflict at the Carrock's setup card, stage 3 and Nightmare Deck. */
  carrockCard: `${G}41`,
  folly: `${G}43`,
  savage: `${G}45`,
  robBob: `${G}46`,
  louis: `${G}47`,
  morris: `${G}48`,
  rupert: `${G}49`,
  stuart: `${G}50`,
  supper: `${G}51`,
  lair: `${G}52`,
  hives: `${G}53`,
} as const;

interface NightmareDeck {
  /** The setup card, flipped next to the quest deck. */
  card: string;
  /** "Remove the following cards, in the specified quantities, from the standard encounter deck" (by printed title). */
  removals: Record<string, number>;
  /** The quest deck's stage count when a Nightmare Deck adds stages to it. */
  stages?: number;
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
  "hunt-for-gollum": {
    card: NIGHTMARE_SOM.gollumCard,
    removals: {
      "River Ninglor": 2,
      // (Printed "Eaves of Mirkwood".)
      "The Eaves of Mirkwood": 1,
      "False Lead": 2,
      "Misty Mountain Goblins": 2,
      "Banks of the Anduin": 2,
      "Gladden Fields": 3,
      "Eastern Crows": 3,
      "Treacherous Fog": 2,
      "Evil Storm": 3,
    },
  },
  "conflict-at-the-carrock": {
    card: NIGHTMARE_SOM.carrockCard,
    // Stage 3, Grimbeorn's Folly, follows the standard quest deck's two.
    stages: 3,
    removals: {
      "Grimbeorn the Old": 1,
      Louis: 1,
      Morris: 1,
      Stuart: 1,
      Rupert: 1,
      "Bee Pastures": 3,
      "Oak-wood Grove": 3,
      "Roasted Slowly": 1,
      "Misty Mountain Goblins": 3,
      "Banks of the Anduin": 2,
      "Wolf Rider": 1,
      "Goblin Sniper": 2,
      Wargs: 2,
      Despair: 2,
      "The Brown Lands": 2,
      "The East Bight": 2,
    },
  },
};
export const nightmareSupported = (id?: ScenarioId) => !!id && id in NIGHTMARE;
/** A Nightmare mode game of a supported scenario. */
export const nightmareLive = (s: GameState) =>
  !!s.nightmareMode && nightmareSupported(s.scenarioId);
/** A Nightmare quest deck's stage count, when it adds stages. */
export const nightmareStageCount = (s: GameState) =>
  nightmareLive(s) ? NIGHTMARE[s.scenarioId]!.stages : undefined;
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
const carrockNightmare = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "conflict-at-the-carrock";
const trollCode = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Troll");
/** Conflict at the Carrock (Nightmare): stage 2B places these Trolls ("Louis, Morris, Rupert and Stuart"). */
export const nightmareCarrockTrolls = (s: GameState) =>
  carrockNightmare(s)
    ? [
        NIGHTMARE_SOM.louis,
        NIGHTMARE_SOM.morris,
        NIGHTMARE_SOM.rupert,
        NIGHTMARE_SOM.stuart,
      ]
    : undefined;
/** The 5 unique Trolls stage 1A sets aside in Nightmare mode. */
export const NIGHTMARE_CARROCK_SET_ASIDE: string[] = [
  NIGHTMARE_SOM.robBob,
  NIGHTMARE_SOM.louis,
  NIGHTMARE_SOM.morris,
  NIGHTMARE_SOM.rupert,
  NIGHTMARE_SOM.stuart,
];
const inVictory = (s: GameState, code: string) =>
  !!s.victoryCards?.includes(code);
/**
 * Morris: "Immune to player events." While Morris is in the victory display,
 * each Troll enemy gains it.
 */
export const nightmareEventImmune = (
  s: GameState,
  u: { code: string; blanked?: boolean },
) =>
  carrockNightmare(s) &&
  ((u.code === NIGHTMARE_SOM.morris && !u.blanked) ||
    (inVictory(s, NIGHTMARE_SOM.morris) &&
      card(u.code).type_code === "enemy" &&
      trollCode(u.code)));
/**
 * Rupert: "Rupert's [defense] cannot be reduced." While Rupert is in the
 * victory display, each Troll enemy's cannot. (Its [defense] stays at least
 * its printed value, +1 while Stuart is in the victory display.)
 */
export function nightmareDefenseFloor(
  s: GameState,
  u: { code: string; blanked?: boolean },
) {
  if (
    !carrockNightmare(s) ||
    card(u.code).type_code !== "enemy" ||
    !(
      (u.code === NIGHTMARE_SOM.rupert && !u.blanked) ||
      (inVictory(s, NIGHTMARE_SOM.rupert) && trollCode(u.code))
    )
  )
    return undefined;
  return (
    (Number(card(u.code).defense) || 0) +
    (inVictory(s, NIGHTMARE_SOM.stuart) && trollCode(u.code) ? 1 : 0)
  );
}
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
    if (
      c.encounter_set === set &&
      c.type_code !== "nightmare" &&
      c.type_code !== "quest"
    )
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
  if (s.scenarioId === "hunt-for-gollum")
    return [
      "The Hunt for Gollum · Nightmare mode: at the end of each refresh phase an unclaimed Clue is attached to a Mordor enemy, which guards it; with 4 Clues on Mordor enemies the players lose.",
    ];
  if (s.scenarioId === "conflict-at-the-carrock")
    return [
      "Conflict at the Carrock · Nightmare mode: 5 unique Trolls were set aside, and stage 2B brings Louis, Morris, Rupert and Stuart; a quest phase that places no progress on the quest places 1 there at its end; after a unique Troll is defeated, a Sacked! card may be discarded; stage 3, Grimbeorn's Folly, is won by defeating Rob & Bob.",
    ];
  return [];
}
