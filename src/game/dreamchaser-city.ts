// The Dream-chaser campaign's The City of Corsairs (Part 9): the
// Stormcaller's "Campaign Mode only" side, The Shattered Monument's Upgraded
// side, the campaign card's flipped side with The Black Sword, and the
// campaign's victory.
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, log, prepend, shuffle } from "./core";
import {
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { exhaustCharacter } from "./board";
import {
  CITY_STORMCALLER,
  DC,
  dcBackFace,
  dcFace,
  dcIs,
  isDreamchaserGame,
} from "./dreamchaser-campaign-support";
import { CITY } from "./city-support";

const live = (s: GameState) =>
  isDreamchaserGame(s) && s.scenarioId === "the-city-of-corsairs";
const state = (s: GameState) => (s.dreamchaser ??= {});
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) =>
    ["enemy", "ship-enemy"].includes(card(u.code).type_code),
  );
/** The Stormcaller of The City of Corsairs on its "Campaign Mode only" side. */
const campaignStormcaller = (u: Unit) =>
  u.code === `${CITY_STORMCALLER}.B` && !u.blanked;
/** The Black Sword attached to a Captain Sahír. */
export const blackSword = (u: Unit) =>
  u.attachments.find((a) => dcIs(a.code, DC.sword) && !a.blanked);
const swordInPlay = (s: GameState) =>
  enemies(s)
    .filter((u) => u.code === CITY.sahir)
    .map((u) => ({ sahir: u, sword: blackSword(u) }))
    .find((x) => !!x.sword);

// ------------------------------------------------------- the Stormcaller

/** "No more than 10 progress can be placed on the quest each round." */
export function cityCampaignQuestProgress(s: GameState, amount: number) {
  if (!live(s) || amount <= 0 || !enemies(s).some(campaignStormcaller))
    return amount;
  const q = state(s);
  if (q.questProgress?.round !== s.round)
    q.questProgress = { round: s.round, placed: 0 };
  const allowed = Math.min(amount, Math.max(0, 10 - q.questProgress.placed));
  q.questProgress.placed += allowed;
  if (allowed < amount)
    log(
      s,
      `The Stormcaller: no more than 10 progress can be placed on the quest this round (${amount - allowed} is lost).`,
      "danger",
    );
  return allowed;
}
/** "The Stormcaller cannot take more than 10 damage each round." */
export const cityStormcallerDamageCap = (u: Unit) =>
  campaignStormcaller(u) ? 10 : undefined;

// ------------------------------------------------------ The Black Sword

/**
 * The campaign card's flipped side: "Forced: When Captain Sahír enters play,
 * attach Black Key (burden) and The Black Sword to him." The Black Sword
 * "enters play with 3 resources on it" (2 on its Upgraded side).
 */
export function citySahirCheck(s: GameState) {
  if (!live(s)) return;
  const q = state(s);
  for (const sahir of enemies(s).filter((u) => u.code === CITY.sahir)) {
    if ((q.armed ?? []).includes(sahir.id)) continue;
    q.armed = [...(q.armed ?? []), sahir.id];
    const key = dcFace(s.campaign, DC.keyBurden);
    const sword = dcFace(s.campaign, DC.sword);
    sahir.attachments.push(
      { id: `a${s.nextId++}`, code: key, exhausted: false },
      {
        id: `a${s.nextId++}`,
        code: sword,
        exhausted: false,
        resourceTokens: dcBackFace(sword) ? 2 : 3,
      },
    );
    log(
      s,
      `Black Key (burden) and The Black Sword (${dcBackFace(sword) ? 2 : 3} resources) are attached to Captain Sahír.`,
      "danger",
    );
  }
}
/** The Black Sword: "Captain Sahír gets +2 [attack]" (not on its Upgraded side). */
export function citySwordAttack(u: Unit) {
  const sword = blackSword(u);
  return sword && !dcBackFace(sword) ? 2 : 0;
}
/** The Black Sword: "Captain Sahír … gains indestructible." */
export const citySwordIndestructible = (s: GameState, u: Unit) =>
  live(s) && u.code === CITY.sahir && !!blackSword(u);
/**
 * The Black Sword: "Forced: After Captain Sahír attacks for the first time
 * each round, he makes an attack against each other player (in turn order)."
 */
export function citySwordAttacked(s: GameState, enemy: Unit) {
  if (!live(s) || enemy.code !== CITY.sahir || !blackSword(enemy)) return;
  const q = state(s);
  if (q.swordRound === s.round) return;
  q.swordRound = s.round;
  const attacked = ownerOf(s, enemy);
  const others = playerOrder(s).filter((p) => p !== attacked);
  if (!others.length) return;
  log(
    s,
    "The Black Sword: Captain Sahír attacks each other player in turn order.",
    "danger",
  );
  prepend(
    s,
    ...others.map((player) =>
      fx("immediateAttack", { target: enemy.id, player }),
    ),
  );
}
/** "Refresh Action: Exhaust a hero to move 1 resource from The Black Sword to that hero's resource pool." */
export const citySwordLabel = (s: GameState, u: Unit) =>
  live(s) && card(u.code).type_code === "hero" && swordInPlay(s)
    ? "The Black Sword · Refresh Action: exhaust this hero to take 1 resource from it"
    : undefined;
export function citySwordProblem(s: GameState, u: Unit): string | null {
  if (s.phase !== "refresh")
    return "Use this Refresh Action in the refresh phase.";
  if (s.dreamchaser?.swordRefresh === s.round)
    return "The Black Sword's Refresh Action was used this round (group limit).";
  if (u.exhausted) return `${name(u)} must be ready.`;
  return null;
}
export function citySwordAbility(s: GameState, u: Unit) {
  const x = swordInPlay(s);
  if (!x?.sword) return;
  state(s).swordRefresh = s.round;
  exhaustCharacter(s, u);
  x.sword.resourceTokens = Math.max(0, (x.sword.resourceTokens ?? 0) - 1);
  u.resources += 1;
  log(s, `${name(u)} takes 1 resource from The Black Sword.`, "good");
  // "If The Black Sword has no resources on it, remove it from the game."
  if (!x.sword.resourceTokens) {
    x.sahir.attachments = x.sahir.attachments.filter(
      (a) => a.id !== x.sword!.id,
    );
    log(
      s,
      "The Black Sword has no resources left: it is removed from the game.",
      "good",
    );
  }
}

// ------------------------------------------------------------ stage 2B

/**
 * "Forced: When stage 2B is revealed, search the encounter deck and discard
 * pile for each boon and non-Ship burden and shuffle them into the second
 * encounter deck."
 */
export function cityStageTwoSearch(s: GameState) {
  const q = s.city;
  if (!live(s) || !q) return;
  const moves = (code: string) => {
    const c = card(code);
    return (
      c.sphere_code === "boon" ||
      (c.sphere_code === "burden" && c.type_code !== "ship-enemy")
    );
  };
  const moved: string[] = [];
  for (const pile of [s.encounterDeck, s.encounterDiscard])
    for (let i = pile.length - 1; i >= 0; i--)
      if (moves(pile[i])) moved.push(pile.splice(i, 1)[0]);
  if (!moved.length) return;
  q.secondDeck.push(...moved);
  shuffle(s, q.secondDeck);
  log(
    s,
    `${moved.map((code) => card(code).name).join(", ")} ${moved.length === 1 ? "is" : "are"} shuffled into the second encounter deck.`,
    "chapter",
  );
}

// ------------------------------------------------------------- effects

export function dreamchaserCityEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "dcCityStageTwo":
      cityStageTwoSearch(s);
      return true;
    case "dcCityGavin": {
      // "If 'Gavin returned,' put him into play under any player's control."
      const players = playerOrder(s);
      if (players.length <= 1) {
        prepend(s, fx("dcGavinTake", { player: players[0] ?? firstPlayer(s) }));
        return true;
      }
      choose(
        s,
        "Gavin returned · Which player takes control of him?",
        players.map((x) => ({
          id: `seat-${x}`,
          label: seatName(s, x),
          code: DC.gavin,
          effects: [fx("dcGavinTake", { player: x })],
        })),
      );
      return true;
    }
    default:
      return false;
  }
}
