/**
 * We Must Away, Ere Break of Day's Nightmare Deck (docs/NIGHTMARE.md): its
 * setup card's rule (Troll Key and Troll Purse gain surge) and its Nightmare
 * encounter cards, composed with the scenario's own rules
 * (src/game/we-must-away.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario builds its encounter deck with the setup
 * card's removals, discards Roast Mutton's cards one at a time (asking this
 * layer after each), and resolves the sack deck ("wmaSack") and the stage
 * advance ("wmaDefeatQuest"). Effects use the "nwm" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, random, shuffle } from "./core";
import {
  destroy,
  discardAttachment,
  discardCharacter,
  discardLocation,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { effectiveTraits } from "./expansion-passives";
import { NIGHTMARE_OHUH as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { WMA, WMA_SACKS } from "./we-must-away-support";

const wmLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "we-must-away-ere-break-of-day";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isTroll = (u: Unit) => isEnemy(u) && effectiveTraits(u).includes("Troll");
const sackOf = (u: Unit) =>
  u.attachments.find((a) => WMA_SACKS.includes(a.code));
/** The Nightmare treacheries whose When Revealed effects this layer resolves. */
const TREACHERIES: string[] = [N.mince, N.night, N.oneByOne];
const locationsInPlay = (s: GameState) => [
  ...s.staging.filter((u) => card(u.code).type_code === "location"),
  ...allActiveLocations(s),
];

// ------------------------------------------------------------- the setup card

/** "The objective cards Troll Key and Troll Purse gain surge." */
const wmRevealedSurge = (s: GameState, code: string) =>
  wmLive(s) && (code === WMA.key || code === WMA.purse);

// ------------------------------------------------------------- the cards

/** A Murder of Crows: "Forced: If A Murder of Crows would be destroyed, shuffle it back into the encounter deck instead." */
function wmBeforeDestroy(
  s: GameState,
  u: Unit,
  destruction: boolean,
  _context: DamageContext,
) {
  if (!wmLive(s) || !destruction || !live(s, u, N.crows)) return false;
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  s.encounterDeck.push(u.code);
  shuffle(s, s.encounterDeck);
  log(
    s,
    "A Murder of Crows would be destroyed: it is shuffled back into the encounter deck instead.",
    "danger",
  );
  return true;
}
/** Comfortable Light: "Progress cannot be placed here." */
const wmLocationProgressBlocked = (s: GameState, u: Unit) =>
  wmLive(s) && live(s, u, N.light);
/** Comfortable Light: "Travel: Sack 1." */
const wmTravelEffects = (s: GameState, u: Unit) =>
  wmLive(s) && live(s, u, N.light)
    ? [fx("wmaSack", { value: 1, player: firstPlayer(s) })]
    : undefined;
/** Comfortable Light: "Forced: After Comfortable Light becomes the active location, discard it." */
function wmTravelEntered(s: GameState, u: Unit) {
  if (wmLive(s) && live(s, u, N.light))
    prepend(s, fx("nwmLight", { target: u.id, player: firstPlayer(s) }));
}
/** Wicked Hilltops: "Forced: After placing 1 or more progress tokens on Wicked Hilltops, each player must discard an ally he controls without an attached Sack card." */
function wmLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!wmLive(s) || amount <= 0 || !live(s, u, N.hilltops)) return;
  prepend(s, ...playerOrder(s).map((player) => fx("nwmHilltops", { player })));
}
/** Red River-bank: "Forced: At the beginning of the refresh phase, place the top card of the encounter discard pile on the bottom of the encounter deck and raise each player's threat by that card's [threat]." */
const wmRefreshStart = (s: GameState): Effect[] =>
  wmLive(s)
    ? locationsInPlay(s)
        .filter((u) => live(s, u, N.river))
        .map(() => fx("nwmRiver", { player: firstPlayer(s) }))
    : [];
/**
 * Night Wanes Slow: "Forced: When this card is discarded from the top of the
 * encounter deck as a result of a quest card effect, immediately stop making
 * progress and end the quest phase." (Roast Mutton's discards stop; nothing
 * of the quest phase follows them.)
 */
function wmQuestDiscard(s: GameState, code: string) {
  if (!wmLive(s) || code !== N.night) return false;
  log(
    s,
    "Night Wanes Slow is discarded by the quest: no more progress is made, and the quest phase ends.",
    "danger",
  );
  return true;
}

function wmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!wmLive(s)) return false;
  const first = firstPlayer(s);
  // A Murder of Crows: "When Revealed: Reveal a random card from the
  // encounter discard pile and add it to the staging area, if able."
  if (code === N.crows) {
    if (fromReveal) prepend(s, fx("nwmCrows", { player: first }));
    return true;
  }
  if (!TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.night) {
    // Night Wanes Slow: "Shuffle the encounter discard pile into the
    // encounter deck. Reveal 1 additional encounter card." (It is discarded
    // after resolving.)
    s.encounterDeck.push(...s.encounterDiscard.splice(0));
    shuffle(s, s.encounterDeck);
    s.encounterDiscard.push(code);
    log(
      s,
      "Night Wanes Slow: the encounter discard pile is shuffled into the encounter deck, and 1 additional encounter card is revealed.",
      "danger",
    );
    prepend(s, fx("reveal", { player: first }));
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.mince) {
    // Mince Them Fine: "Each engaged Troll enemy makes an immediate attack.
    // If the players are at stage 1, immediately advance to stage 2A."
    const attacks = allEngaged(s)
      .filter(isTroll)
      .map((u) =>
        fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
      );
    const advance =
      s.stage === 1 &&
      s.weMustAway &&
      !s.weMustAway.advancing &&
      !s.stageRevealing;
    if (advance) s.weMustAway!.advancing = true;
    prepend(
      s,
      ...attacks,
      ...(advance ? [fx("wmaDefeatQuest", { player: first })] : []),
    );
    if (advance)
      log(s, "Mince Them Fine: the players advance to stage 2A.", "danger");
    return true;
  }
  // One by One: "Choose and destroy a character with a Sack card attached.
  // Then, return that Sack card to the top of the Sack deck and Sack 1."
  prepend(s, fx("nwmOneByOne", { player: first }));
  return true;
}

function wmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !wmLive(s)) return false;
  const enemy = get(s, c.enemyId);
  // Wicked Hilltops: "Attacking enemy gets +2 [attack]. (+3 [attack] instead
  // if attacking enemy is a Troll.)"
  if (code === N.hilltops) {
    c.attackBonus += enemy && isTroll(enemy) ? 3 : 2;
    return true;
  }
  // Mince Them Fine: "If attacking enemy is a Troll, return it to the staging
  // area after this attack."
  if (code === N.mince) {
    if (enemy && isTroll(enemy)) c.returnToStaging = true;
    return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareWmaEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nwm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nwmCrows": {
      if (!s.encounterDiscard.length) {
        log(s, "A Murder of Crows: the encounter discard pile is empty.");
        return true;
      }
      const at = Math.floor(random(s) * s.encounterDiscard.length);
      const [code] = s.encounterDiscard.splice(at, 1);
      log(
        s,
        `A Murder of Crows reveals ${card(code).name} at random from the encounter discard pile.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", { code, revealOrigin: "discard", player: p }),
      );
      return true;
    }
    case "nwmLight": {
      const u = get(s, e.target);
      if (u && allActiveLocations(s).some((l) => l.id === u.id))
        discardLocation(s, u, true);
      return true;
    }
    case "nwmHilltops": {
      const allies = seatView(s, p).allies.filter(
        (a) => card(a.code).type_code === "ally" && !sackOf(a),
      );
      if (!allies.length) return true;
      if (allies.length === 1) {
        prepend(s, fx("nwmDiscardAlly", { target: allies[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `Wicked Hilltops · Discard an ally you control without an attached Sack card${seatLabel(s, p)}`,
        allies.map((a): Option => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("nwmDiscardAlly", { target: a.id, player: p })],
        })),
        card(N.hilltops).text,
      );
      return true;
    }
    case "nwmDiscardAlly": {
      const a = get(s, e.target);
      if (a && allCharacters(s).some((x) => x.id === a.id)) {
        log(s, `Wicked Hilltops: ${name(a)} is discarded.`, "danger");
        discardCharacter(s, a);
      }
      return true;
    }
    case "nwmRiver": {
      const top = s.encounterDiscard.pop();
      if (!top) return true;
      s.encounterDeck.push(top);
      const threat = Number(card(top).threat) || 0;
      log(
        s,
        `Red River-bank: ${card(top).name} goes to the bottom of the encounter deck; each player raises their threat by ${threat}.`,
        "danger",
      );
      if (threat)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("heirsThreat", { value: threat, player }),
          ),
        );
      return true;
    }
    case "nwmOneByOne": {
      const sacked = allCharacters(s).filter((u) => sackOf(u));
      if (!sacked.length) {
        log(s, "One by One: no character has a Sack card attached.");
        return true;
      }
      if (sacked.length === 1) {
        prepend(
          s,
          fx("nwmOneByOneDestroy", { target: sacked[0].id, player: p }),
        );
        return true;
      }
      choose(
        s,
        "One by One · Choose and destroy a character with a Sack card attached",
        sacked.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${card(sackOf(u)!.code).name})`,
          effects: [fx("nwmOneByOneDestroy", { target: u.id, player: p })],
        })),
        card(N.oneByOne).text,
      );
      return true;
    }
    case "nwmOneByOneDestroy": {
      const u = get(s, e.target);
      const sack = u && sackOf(u);
      if (!u || !sack) return true;
      log(s, `One by One: ${name(u)} is destroyed.`, "danger");
      destroy(s, u);
      // Its Sack returns to the top of the sack deck, then Sack 1.
      const q = s.weMustAway;
      if (q) {
        const i = q.sackDeck.indexOf(sack.code);
        if (i >= 0) q.sackDeck.splice(i, 1);
        q.sackDeck.unshift(sack.code);
        prepend(s, fx("wmaSack", { value: 1, player: firstPlayer(s) }));
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_WMA_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  revealedSurge: wmRevealedSurge,
  beforeDestroy: wmBeforeDestroy,
  locationProgressBlocked: wmLocationProgressBlocked,
  travelEffects: wmTravelEffects,
  travelEntered: wmTravelEntered,
  locationProgressPlaced: wmLocationProgressPlaced,
  refreshStart: wmRefreshStart,
  questDiscard: wmQuestDiscard,
  encounter: wmEncounter,
  shadow: wmShadow,
  effect: nightmareWmaEffect,
  sharedEffect: (e) => e.kind.startsWith("nwm"),
};
