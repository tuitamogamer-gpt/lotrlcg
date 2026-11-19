// The Dream-chaser campaign's Temple of the Deceived (Part 6): the campaign
// card's secrets and its Travel Action, the Spyglass offer, and the two
// cards the temple hides: Starla (boon) and Recurring Nightmare (burden),
// which follow the players for the rest of the campaign.
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalLivingSeats,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { enemyAddedToStaging, engage, raiseThreat } from "./board";
import { playerCardImmune } from "./card-immunity";
import {
  DC,
  dcBackFace,
  dcFace,
  dcIs,
  dcLevel,
  isDreamchaserGame,
} from "./dreamchaser-campaign-support";
import { isTempleGuardian } from "./temple-support";

const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const players = (s: GameState) => globalLivingSeats(s).length;
const state = (s: GameState) => (s.dreamchaser ??= {});
const SECRETS: readonly string[] = [DC.starla, DC.nightmare];

/** The secret facedown under a map location, in this campaign game. */
export const dreamchaserSecret = (s: GameState, locationId: string) =>
  isDreamchaserGame(s) ? s.dreamchaser?.secrets?.[locationId] : undefined;
/** Has this seat looked at the secret under a location (the Upgraded Gate Key)? */
export const dreamchaserSecretKnown = (
  s: GameState,
  locationId: string,
  seat = activeSeat(s),
) => !!s.dreamchaser?.secretLooks?.[locationId]?.includes(seat);

/**
 * "Shuffle Starla and both Recurring Nightmares together and place one
 * facedown under each Temple of the Deceived location, as secrets." (The
 * three Temple of the Deceived locations are the map's right-hand column.)
 */
export function placeTempleSecrets(s: GameState) {
  const map = s.temple?.map;
  if (!map) return;
  const cards = shuffle(s, [DC.starla, DC.nightmare, DC.nightmare]);
  const q = state(s);
  q.secrets = {};
  q.secretLooks = {};
  for (const cell of map
    .filter((c) => c.column === 4)
    .sort((a, b) => a.row - b.row))
    q.secrets[cell.id] = cards.shift()!;
  log(
    s,
    "Starla and both Recurring Nightmares are shuffled and placed facedown under the three Temple of the Deceived locations, as secrets.",
    "chapter",
  );
}

// ------------------------------------------------------------- stats

/**
 * Starla: "X is half the level of Starla, rounded up" (willpower, attack and
 * defense). Recurring Nightmare and the Temple Guardian's "Campaign Mode
 * only" side: X (their defense) is the number of players in the game.
 */
export function dreamchaserTempleStats(s: GameState, u: Unit) {
  const out = { will: 0, attack: 0, defense: 0 };
  if (u.blanked) return out;
  if (dcIs(u, DC.starla)) {
    const x = Math.ceil(dcLevel(s, DC.starla) / 2);
    out.will += x;
    out.attack += x;
    out.defense += x;
  }
  if (dcIs(u, DC.nightmare) || (isTempleGuardian(u) && dcBackFace(u)))
    out.defense += players(s);
  return out;
}
/** The Temple Guardian's "Campaign Mode only" side: "Archery X. X is the number of players in the game." */
export const dreamchaserTempleArchery = (s: GameState, u: Unit) =>
  isTempleGuardian(u) && dcBackFace(u) && !u.blanked ? players(s) : 0;

// ------------------------------------------------------------- hooks

/** The Travel Action: can it flip the secret at this location now? */
export function dreamchaserSecretProblem(s: GameState, u: Unit): string | null {
  if (!dreamchaserSecret(s, u.id)) return "There is no secret here.";
  if (s.temple?.activeId !== u.id)
    return "Only a secret at your location can be flipped over.";
  if (s.phase !== "travel")
    return "Flip over a secret during the travel phase (Travel Action).";
  return null;
}
/**
 * Recurring Nightmare: "Forced: When Recurring Nightmare enters your hand,
 * add it to the staging area."
 */
export function nightmareHandCheck(s: GameState) {
  if (
    s.scenarioId !== "temple-of-the-deceived" &&
    !s.campaign?.burdens.includes(DC.nightmare)
  )
    return;
  for (const p of seatIndices(s)) {
    if (!seatView(s, p).hand.some((h) => dcIs(h, DC.nightmare))) continue;
    forOwner(s, p, () => {
      for (const u of s.hand.filter((h) => dcIs(h, DC.nightmare))) {
        s.hand = s.hand.filter((h) => h.id !== u.id);
        const enemy = make(s, u.code);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        log(
          s,
          `Recurring Nightmare enters ${several(s) ? `${seatName(s, p)}'s` : "your"} hand and is added to the staging area.`,
          "danger",
        );
      }
    });
  }
}
/** "When Recurring Nightmare leaves play, shuffle it into any player's deck." */
export function nightmareLeavesPlay(s: GameState, u: Unit) {
  if (!isDreamchaserGame(s) || !dcIs(u, DC.nightmare)) return false;
  prepend(
    s,
    fx("dcNightmareShuffle", { code: u.code, player: firstPlayer(s) }),
  );
  return true;
}
/** Starla: "Response: After Starla exhausts, place 1 progress on a location." */
export function starlaExhausted(s: GameState, u: Unit) {
  if (!isDreamchaserGame(s) || !dcIs(u, DC.starla) || u.blanked) return;
  if (!progressTargets(s).length) return;
  prepend(s, fx("dcStarlaProgress", { source: u.id, player: ownerOf(s, u) }));
}
/** Starla: "Response: After Starla is discarded from your hand or deck, play her." */
export function starlaDiscarded(s: GameState, u: { code: string }) {
  if (!isDreamchaserGame(s) || !dcIs(u, DC.starla)) return;
  prepend(s, fx("dcStarlaPlay", { code: u.code, player: activeSeat(s) }));
}
/**
 * "For the remainder of the campaign, that player shuffles that Recurring
 * Nightmare into their deck after they draw their starting hand."
 */
export function shuffleCampaignNightmares(s: GameState) {
  const c = s.campaign;
  if (!isDreamchaserGame(s) || s.scenarioId === "temple-of-the-deceived")
    return;
  if (!c?.burdens.includes(DC.nightmare)) return;
  const seats = seatIndices(s);
  const shuffled: number[] = [];
  for (const p of c.nightmares ?? []) {
    if (!seats.includes(p)) continue;
    forOwner(s, p, () => {
      s.deck.push(DC.nightmare);
      shuffle(s, s.deck);
    });
    shuffled.push(p);
  }
  if (shuffled.length)
    log(
      s,
      `${shuffled.length === 1 ? "Recurring Nightmare is" : "Both Recurring Nightmares are"} shuffled into ${several(s) ? shuffled.map((p) => `${seatName(s, p)}'s`).join(" and ") : "your"} deck after the starting hand.`,
      "danger",
    );
}
/** A mulligan holds the Recurring Nightmares out of the new starting hand. */
export function dreamchaserHoldLateDeck(s: GameState): string[] {
  if (!isDreamchaserGame(s)) return [];
  const held = s.deck.filter((code) => dcIs(code, DC.nightmare));
  s.deck = s.deck.filter((code) => !dcIs(code, DC.nightmare));
  return held;
}
export function dreamchaserReturnLateDeck(s: GameState, held: string[]) {
  if (!held.length) return;
  s.deck.push(...held);
  shuffle(s, s.deck);
}

const progressTargets = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (l) => card(l.code).type_code === "location" && !playerCardImmune(l),
  );

// ------------------------------------------------------------- effects

export function dreamchaserTempleEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "dcSecretFlip": {
      // "Travel Action: Flip over a secret at your location. If it is a
      // Recurring Nightmare, it engages you. If it is Starla, you gain
      // control of her (ready)."
      const p = e.player ?? activeSeat(s);
      const q = state(s);
      const location = get(s, e.target);
      const code = q.secrets?.[e.target ?? ""];
      if (!location || !code || !SECRETS.includes(code)) return true;
      delete q.secrets![e.target!];
      if (q.secretLooks) delete q.secretLooks[e.target!];
      if (code === DC.nightmare) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        forOwner(s, p, () => engage(s, enemy));
        log(
          s,
          `The secret under ${name(location)} is a Recurring Nightmare: it engages ${several(s) ? seatName(s, p) : "you"}.`,
          "danger",
        );
      } else {
        const starla = make(s, code);
        starla.owner = p;
        forOwner(s, p, () => s.allies.push(starla));
        log(
          s,
          `The secret under ${name(location)} is Starla: ${several(s) ? `${seatName(s, p)} gains` : "you gain"} control of her, ready.`,
          "good",
        );
      }
      return true;
    }
    case "dcSecretLook": {
      // The Upgraded Gate Key: "look at the facedown side of a Temple of the
      // Deceived location or secret."
      const p = e.player ?? activeSeat(s);
      const q = state(s);
      const code = q.secrets?.[e.target ?? ""];
      if (!code) return true;
      const looks = (q.secretLooks ??= {});
      looks[e.target!] = [...new Set([...(looks[e.target!] ?? []), p])];
      forOwner(s, p, () =>
        choose(
          s,
          "Gate Key · The secret's facedown side",
          [{ id: "close", label: "Close", code, effects: [] }],
          "Looking at a secret does not flip it over.",
        ),
      );
      return true;
    }
    case "dcSpyglassOffer": {
      // "One player may raise their threat by 4 to attach Spyglass to a hero."
      const code = dcFace(s.campaign, DC.spyglass);
      const skip = { id: "skip", label: "Do not attach Spyglass", effects: [] };
      if (!several(s)) {
        const p = playerOrder(s)[0] ?? firstPlayer(s);
        choose(
          s,
          "Temple of the Deceived · Raise your threat by 4 to attach Spyglass to a hero?",
          [
            ...seatView(s, p).heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Raise your threat by 4; attach Spyglass to ${name(h)}`,
              effects: [fx("dcSpyglassTake", { target: h.id, player: p })],
            })),
            skip,
          ],
          card(code).text,
        );
        return true;
      }
      choose(
        s,
        "Temple of the Deceived · Which player raises their threat by 4 to attach Spyglass to a hero?",
        [
          ...playerOrder(s).map((p) => ({
            id: `seat-${p}`,
            label: `${seatName(s, p)} raises their threat by 4 (now ${seatView(s, p).threat})`,
            code,
            effects: [fx("dcSpyglassHero", { player: p })],
          })),
          skip,
        ],
        card(code).text,
      );
      return true;
    }
    case "dcSpyglassHero": {
      const p = e.player ?? firstPlayer(s);
      choose(
        s,
        `Temple of the Deceived · ${seatName(s, p)} raises their threat by 4: attach Spyglass to which hero?`,
        seatIndices(s).flatMap((owner) =>
          seatView(s, owner).heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)} (${seatName(s, owner)})`,
            effects: [fx("dcSpyglassTake", { target: h.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "dcSpyglassTake": {
      const p = e.player ?? firstPlayer(s);
      const hero = get(s, e.target);
      if (!hero) return true;
      const code = dcFace(s.campaign, DC.spyglass);
      forOwner(s, p, () => raiseThreat(s, 4, "framework"));
      const owner = ownerOf(s, hero);
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code,
        exhausted: false,
        owner,
        controller: owner,
      });
      log(
        s,
        `${several(s) ? `${seatName(s, p)} raises their` : "You raise your"} threat by 4: Spyglass is attached to ${name(hero)}.`,
        "good",
      );
      return true;
    }
    case "dcStarlaProgress": {
      const p = e.player ?? activeSeat(s);
      const starla = get(s, e.source);
      const targets = progressTargets(s);
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${starla ? name(starla) : "Starla"} exhausts · Place 1 progress on a location?`,
          [
            ...targets.map((l) => ({
              id: l.id,
              code: l.code,
              label: `Place 1 progress on ${name(l)}`,
              effects: [fx("locationProgress", { target: l.id, value: 1 })],
            })),
            { id: "skip", label: "Do not place progress", effects: [] },
          ],
          "Response: After Starla exhausts, place 1 progress on a location.",
        ),
      );
      return true;
    }
    case "dcStarlaPlay": {
      const p = e.player ?? activeSeat(s);
      forOwner(s, p, () => {
        if (!s.discard.some((code) => dcIs(code, DC.starla))) return;
        choose(
          s,
          "Starla is discarded · Play her?",
          [
            {
              id: "play",
              code: DC.starla,
              label: "Play Starla from your discard pile (cost 0)",
              effects: [fx("dcStarlaEnters", { player: p })],
            },
            { id: "skip", label: "Leave her in the discard pile", effects: [] },
          ],
          "Response: After Starla is discarded from your hand or deck, play her.",
        );
      });
      return true;
    }
    case "dcStarlaEnters": {
      const p = e.player ?? activeSeat(s);
      forOwner(s, p, () => {
        const i = s.discard
          .map((code) => dcIs(code, DC.starla))
          .lastIndexOf(true);
        if (i < 0) return;
        const [code] = s.discard.splice(i, 1);
        const starla = make(s, code);
        starla.owner = p;
        s.allies.push(starla);
        log(
          s,
          `${several(s) ? `${seatName(s, p)} plays` : "You play"} Starla from the discard pile.`,
          "good",
        );
      });
      return true;
    }
    case "dcNightmareShuffle": {
      const code = e.code ?? DC.nightmare;
      const seats = playerOrder(s);
      if (seats.length <= 1) {
        prepend(
          s,
          fx("dcNightmareDeck", { code, player: seats[0] ?? firstPlayer(s) }),
        );
        return true;
      }
      choose(
        s,
        "Recurring Nightmare leaves play · Shuffle it into which player's deck?",
        seats.map((p) => ({
          id: `seat-${p}`,
          label: seatName(s, p),
          code,
          effects: [fx("dcNightmareDeck", { code, player: p })],
        })),
        "When Recurring Nightmare leaves play, shuffle it into any player's deck.",
      );
      return true;
    }
    case "dcNightmareDeck": {
      const p = e.player ?? firstPlayer(s);
      forOwner(s, p, () => {
        s.deck.push(e.code ?? DC.nightmare);
        shuffle(s, s.deck);
      });
      log(
        s,
        `Recurring Nightmare is shuffled into ${several(s) ? `${seatName(s, p)}'s` : "your"} deck.`,
        "danger",
      );
      return true;
    }
    default:
      return false;
  }
}

/** The Temple of the Deceived's map locations that hide a secret. */
export const dreamchaserSecretLocations = (s: GameState) =>
  Object.keys((isDreamchaserGame(s) && s.dreamchaser?.secrets) || {});
