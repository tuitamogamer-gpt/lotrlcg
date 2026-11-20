/**
 * The Antlered Crown's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (locations with time counters cannot be discarded from play by player
 * card effects; Dunlending Horde joins the Raven deck) and its Nightmare
 * encounter cards, composed with the scenario's own rules
 * (src/game/antlered.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's location time counters, Raven deck and Time
 * effects serve the Nightmare cards. Effects use the "ncr" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { discardHandCard } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  playerOrder,
  seatView,
} from "./table";
import { returnToStaging } from "./black-riders-hunted";
import { printedLocationTime } from "./antlered-support";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareCrownState {
  /** Raven Talisman: each copy's round, while each card in the first player's hand adds 1 [threat] to the staging area. */
  crownTalisman?: number[];
}

const crLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-antlered-crown";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
const timed = (s: GameState) =>
  locationsInPlay(s).filter((l) => (l.timeCounters ?? 0) > 0);
/** "Remove 1 time counter from a location in play" (the scenario's Time removal, a choice among several). */
const removeTime = (player: number) => fx("ncrTime", { player });

// ------------------------------------------------------------- the setup card

/** "Locations with time counters on them cannot be discarded from play by player card effect." */
const crPlayerDiscardBlocked = (s: GameState, u: Unit) =>
  crLive(s) && isLocation(u) && (u.timeCounters ?? 0) > 0;
/** "Dunlending Horde has the "Dunlending Warriors" encounter set icon and should be shuffled into the Raven deck during setup." */
const crSecondDeckCodes = (s: GameState) => (crLive(s) ? [N.horde] : []);

// ------------------------------------------------------------- the cards

/**
 * Raven Clan Druid: "Forced: After the engaged player draws any number of
 * cards, remove 1 time counter from a location in play." Dunlending Horde:
 * "Forced: After the engaged player draws any number of cards, heal all
 * damage from Dunlending Horde."
 */
function crCardsDrawnForced(s: GameState, player: number): Effect[] {
  if (!crLive(s)) return [];
  return seatView(s, player).engaged.flatMap((u) =>
    live(s, u, N.druid)
      ? [removeTime(player)]
      : live(s, u, N.horde) && u.damage
        ? [fx("ncrHordeHeal", { target: u.id, player })]
        : [],
  );
}
/** Dunlending Horde: "Cannot have attachments ..." */
const crCannotAttach = (s: GameState, u: Unit) =>
  crLive(s) && live(s, u, N.horde);
/** Dunlending Horde: "Cannot ... take non-combat damage." */
function crDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!crLive(s) || amount <= 0 || !live(s, u, N.horde) || context.combatDamage)
    return amount;
  log(s, "Dunlending Horde cannot take non-combat damage.");
  return 0;
}
/** Raven Talisman: "Until the end of the round, add 1 to the total [threat] in the staging area for each card in the first player's hand." */
const crStagingThreat = (s: GameState) =>
  crLive(s)
    ? (s.nightmare?.crownTalisman ?? []).filter((r) => r === s.round).length *
      seatView(s, firstPlayer(s)).hand.length
    : 0;
/** Gathering Forces: "If any player has 5 or more cards in hand, this effect cannot be canceled." */
const crCannotCancel = (s: GameState, shadow?: boolean, code?: string) =>
  crLive(s) &&
  !shadow &&
  code === N.gathering &&
  playerOrder(s).some((p) => seatView(s, p).hand.length >= 5);
/** Raven Stronghold: "Forced: When this location is explored, add the top card of the Raven deck to the staging area." */
function crExplored(s: GameState, u: Unit) {
  if (crLive(s) && live(s, u, N.stronghold))
    prepend(s, fx("crownRavenAdd", { player: firstPlayer(s) }));
}
/** Raven Talisman's shadow: "If this attack destroys a character, discard your hand and draw 3 cards." */
function crCharacterDestroyed(s: GameState, u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (
    !crLive(s) ||
    !c?.nmHandRefillOnKill ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const copies = c.nmHandRefillOnKill;
  c.nmHandRefillOnKill = 0;
  const p = c.attackPlayer ?? firstPlayer(s);
  prepend(
    s,
    ...Array.from({ length: copies }, () =>
      fx("ncrTalismanHand", { player: p }),
    ),
  );
}

function crEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !crLive(s) ||
    (code !== N.elite && code !== N.talisman && code !== N.gathering)
  )
    return false;
  const first = firstPlayer(s);
  if (code === N.elite) {
    // Raven Clan Elite (already in the staging area): "Either remove 1 time
    // counter from a location in play, or Raven Clan Elite makes an
    // immediate attack against the first player."
    if (fromReveal) {
      const elite = [...s.staging].reverse().find((u) => u.code === code);
      prepend(s, fx("ncrElite", { target: elite?.id, player: first }));
    }
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.gathering) {
    // Gathering Forces: "Add the top 2 cards of the Raven Deck to the
    // staging area."
    log(
      s,
      "Gathering Forces: the top 2 cards of the Raven deck join the staging area.",
      "danger",
    );
    prepend(
      s,
      fx("crownRavenAdd", { player: first }),
      fx("crownRavenAdd", { player: first }),
    );
    return true;
  }
  // Raven Talisman: "Each player draws 1 card. Until the end of the round,
  // add 1 to the total [threat] in the staging area for each card in the
  // first player's hand."
  const q = (s.nightmare ??= {});
  q.crownTalisman = [
    ...(q.crownTalisman ?? []).filter((r) => r === s.round),
    s.round,
  ];
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
  );
  return true;
}

function crShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !crLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Raven Clan Druid: "Attacking enemy gets +X [attack], where X is the
    // Time X value on the active location."
    case N.druid:
      if (s.activeLocation && !s.activeLocation.blanked)
        c.attackBonus += printedLocationTime(s.activeLocation.code);
      return true;
    // Highlands of Dunland: "Either remove 1 time counter from a location
    // in play, or return attacking enemy to the staging area after this
    // attack."
    case N.highlands:
      prepend(s, fx("ncrHighlands", { player: attacked }));
      return true;
    // Raven Talisman: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, discard your hand and draw 3 cards."
    case N.talisman:
      c.attackBonus += 1;
      c.nmHandRefillOnKill = (c.nmHandRefillOnKill ?? 0) + 1;
      return true;
    // Gathering Forces: "Put the top card of the Raven deck into play,
    // engaged with you."
    case N.gathering:
      prepend(s, fx("crownRavenAdd", { flag: true, player: attacked }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareCrownEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  // The Nightmare locations' Time effects (in the scenario's Time order).
  if (e.kind === "crownLocationExpired" && crLive(s)) {
    if (e.code === N.stronghold) {
      // Raven Stronghold: "each player reveals the top card of the Raven
      // deck and adds it to the staging area."
      log(
        s,
        "Raven Stronghold: each player reveals the top card of the Raven deck.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("crownRavenReveal", { player })),
      );
      return true;
    }
    if (e.code === N.highlands) {
      // Highlands of Dunland: "return each enemy in play to the staging
      // area."
      log(
        s,
        "Highlands of Dunland: each enemy in play returns to the staging area.",
        "danger",
      );
      for (const enemy of allEngaged(s).filter(
        (x) => card(x.code).type_code === "enemy",
      ))
        returnToStaging(s, enemy);
      return true;
    }
    return false;
  }
  if (!e.kind.startsWith("ncr")) return false;
  switch (e.kind) {
    case "ncrTime": {
      const targets = timed(s);
      if (!targets.length) return true;
      const batch = (l: Unit) => fx("crownRemoveTimeBatch", { ids: [l.id] });
      if (targets.length === 1) {
        prepend(s, batch(targets[0]));
        return true;
      }
      choose(
        s,
        `Remove 1 time counter from a location in play${seatLabel(s, p)}`,
        targets.map((l): Option => ({
          id: l.id,
          code: l.code,
          label: `${name(l)} · ${l.timeCounters} time counters`,
          effects: [batch(l)],
        })),
      );
      return true;
    }
    case "ncrHordeHeal":
      if (u && live(s, u, N.horde) && u.damage)
        prepend(s, fx("heal", { target: u.id, value: u.damage, player: p }));
      return true;
    case "ncrElite": {
      const elite = u && s.staging.some((x) => x.id === u.id) ? u : undefined;
      const options: Option[] = [
        ...(timed(s).length
          ? [
              {
                id: "time",
                label: "Remove 1 time counter from a location in play",
                effects: [removeTime(p)],
              },
            ]
          : []),
        ...(elite
          ? [
              {
                id: "attack",
                code: elite.code,
                label:
                  "Raven Clan Elite makes an immediate attack against the first player",
                effects: [
                  fx("immediateAttack", {
                    target: elite.id,
                    player: firstPlayer(s),
                  }),
                ],
              },
            ]
          : []),
      ];
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        "Raven Clan Elite · Remove 1 time counter, or it attacks the first player",
        options,
        card(N.elite).text,
      );
      return true;
    }
    case "ncrHighlands": {
      const options: Option[] = [
        ...(timed(s).length
          ? [
              {
                id: "time",
                label: "Remove 1 time counter from a location in play",
                effects: [removeTime(p)],
              },
            ]
          : []),
        {
          id: "return",
          label:
            "Return the attacking enemy to the staging area after this attack",
          effects: [fx("ncrReturnAttacker", { player: p })],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Highlands of Dunland · Remove 1 time counter, or the attacker returns to the staging area${seatLabel(s, p)}`,
        options,
        card(N.highlands).shadow,
      );
      return true;
    }
    case "ncrReturnAttacker":
      if (s.combat) s.combat.returnToStaging = true;
      return true;
    case "ncrTalismanHand": {
      const hand = [...s.hand];
      for (const h of hand) discardHandCard(s, h.id, { encounterEffect: true });
      log(
        s,
        `Raven Talisman${seatLabel(s, p)}: the hand (${hand.length} ${hand.length === 1 ? "card" : "cards"}) is discarded; 3 cards are drawn.`,
        "danger",
      );
      prepend(s, fx("draw", { value: 3, player: p }));
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_CROWN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  playerDiscardBlocked: crPlayerDiscardBlocked,
  secondDeckCodes: crSecondDeckCodes,
  cardsDrawnForced: crCardsDrawnForced,
  damageAmount: crDamageAmount,
  cannotAttach: crCannotAttach,
  stagingThreat: crStagingThreat,
  cannotCancel: crCannotCancel,
  explored: crExplored,
  characterDestroyed: crCharacterDestroyed,
  encounter: crEncounter,
  shadow: crShadow,
  effect: nightmareCrownEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareCrown(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    q?.crownTalisman === undefined ||
    (Array.isArray(q.crownTalisman) && q.crownTalisman.every(n))
  );
}

/** The Nightmare Deck's cards a save's Raven deck may hold. */
export const crownNightmareRaven = (s: GameState): readonly string[] =>
  s.nightmareMode && s.scenarioId === "the-antlered-crown" ? [N.horde] : [];
