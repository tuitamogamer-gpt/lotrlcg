/**
 * The Fate of Númenor's Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (removals, which the scenario's setup applies to its encounter deck, its
 * Uncharted deck and Shrine to Morgoth, replaced by the Nightmare Deck's
 * reprinted Uncharted deck, in src/game/fate-numenor.ts; no progress on the
 * staging area's non-Uncharted locations; Shrine to Morgoth's return while 3
 * or fewer double-sided locations are in the victory display) and its
 * Nightmare encounter cards, composed with the scenario's rules through
 * batch4Scenario while a Nightmare mode game is played. The reprinted
 * Uncharted locations keep the scenario's own scripts. Effects use the "nfn"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, threatOf } from "./core";
import { discardAttachment, raiseThreat, removeFromQuest } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import {
  FATE as F,
  FATE_NIGHTMARE as FN,
  FATE_UNCHARTED,
  fateIs,
} from "./fate-numenor-support";
import { fateBottomDiscard, fateShuffleIslands } from "./fate-numenor";
import { NIGHTMARE_GH as G, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareFateState {
  /** Shrine to Morgoth returned: the players choose a new location to travel to. */
  fateMustTravel?: true;
}
const nfnLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-fate-of-numenor" && !!s.fateNumenor;
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const undeadEnemy = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code) &&
  /(?:^|\.\s*)Undead\./.test(card(u.code).traits ?? "");
const cost = (code?: string) => (code ? Number(card(code).cost) || 0 : 0);
/** Face-up copies in play (the staging area or the active location). */
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code))
    .length;
/** Shrine to Morgoth, on either side, in the staging area. */
const isShrine = (s: GameState, u: Unit) =>
  fateIs(u.code, F.shrine) ||
  (u.code === F.lost &&
    fateIs(s.fateNumenor?.hiddenBacks[u.id] ?? "", F.shrine));
/** Double-sided (Uncharted deck) locations in the victory display. */
const doubleSided = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => FATE_UNCHARTED.includes(c)).length;
const questing = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => u.committed && ownerOf(s, u) === p);

// ------------------------------------------------------------- passives

function nfnThreatBonus(s: GameState, u: Unit) {
  if (!nfnLive(s)) return 0;
  let bonus = 0;
  // Overgrown Steps: while it is in the staging area, "Each Uncharted
  // location in the staging area gets +1 [threat]."
  if (u.code === F.lost && s.staging.some((x) => x.id === u.id))
    bonus += s.staging.filter((x) => live(s, x, G.steps)).length;
  // Desecrated Grounds: "Each Undead enemy gets +1 [threat] and +1 [attack]."
  if (undeadEnemy(u)) bonus += inPlay(s, FN.desecrated);
  return bonus;
}
const nfnStats = (s: GameState, u: Unit) =>
  nfnLive(s) && undeadEnemy(u) && inPlay(s, FN.desecrated)
    ? { attack: inPlay(s, FN.desecrated) }
    : {};
/** Forsaken City: "Each Undead enemy gains 'immune to player card effects.'" */
const nfnImmune = (s: GameState, u: Unit) =>
  nfnLive(s) && undeadEnemy(u) && inPlay(s, FN.forsaken) > 0;
/** "Progress cannot be placed on non-Uncharted locations in the staging area." */
const nfnLocationProgressBlocked = (s: GameState, u: Unit) =>
  nfnLive(s) &&
  isLocation(u) &&
  u.code !== F.lost &&
  s.staging.some((x) => x.id === u.id);

// ------------------------------------------------------------- travel

/**
 * Overgrown Steps: "Travel: Raise each player's threat by 2 to travel here."
 * The setup card: "Forced: When the players would travel to Shrine to
 * Morgoth, if there are 3 or fewer double-sided locations in the victory
 * display, return Shrine to Morgoth to the staging area and flip it to its
 * Lost Island side. Remove all progress from each Uncharted location in the
 * staging area and shuffle them so that the players do not know which one is
 * which. Then, choose a new location to travel to."
 */
function nfnTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!nfnLive(s)) return undefined;
  if (isShrine(s, u) && doubleSided(s) <= 3)
    return [fx("nfnShrineTravel", { target: u.id, player: firstPlayer(s) })];
  if (live(s, u, G.steps))
    return [fx("nfnStepsThreat", { player: firstPlayer(s) })];
  return undefined;
}
function nfnMustTravel(s: GameState) {
  return (
    nfnLive(s) &&
    !!s.nightmare?.fateMustTravel &&
    s.phase === "travel" &&
    !allActiveLocations(s).length &&
    s.staging.some((u) => isLocation(u) && !isShrine(s, u))
  );
}
function nfnTravelled(s: GameState) {
  if (s.nightmare?.fateMustTravel) delete s.nightmare.fateMustTravel;
}

// ------------------------------------------------------------- the cards

/**
 * Guardian of the Golden King: "Forced: After attackers are declared during
 * an attack against Guardian of the Golden King, look at the bottom card of
 * the first player's deck. Choose and remove characters from the attack until
 * only X or fewer characters are attacking, where X is the looked-at card's
 * printed cost (those characters do not ready)."
 */
function nfnAttackersDeclared(s: GameState, enemy: Unit): Effect[] {
  if (!nfnLive(s) || !live(s, enemy, G.guardian)) return [];
  return [fx("nfnGuardian", { target: enemy.id, player: firstPlayer(s) })];
}

function nfnEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nfnLive(s) || (code !== G.flora && code !== G.folly)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === G.flora)
    // Corrupted Flora: "Each player discards the bottom card of his deck.
    // Each player chooses and removes his characters from the quest until
    // only X or fewer of his characters are questing, where X is the printed
    // cost of the card that player discarded. Deal 1 damage to each character
    // still committed to the quest."
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("nfnFlora", { player })),
      fx("nfnFloraDamage", { player: firstPlayer(s) }),
    );
  // Calphon's Folly: "Choose an Uncharted location in the staging area and
  // flip it over. If it has a Forced effect, resolve it as if that location
  // were active. If it does not have a Forced effect, switch it with the
  // active location, if able."
  else prepend(s, fx("nfnFolly", { player: firstPlayer(s) }));
  return true;
}

/** Calphon's Folly: "Attacking enemy gets +X [attack], where X is the active location's [threat]." */
function nfnShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nfnLive(s) || code !== G.folly) return false;
  const active = s.activeLocation;
  const x = active ? threatOf(s, active) : 0;
  c.attackBonus += x;
  log(
    s,
    active
      ? `Calphon's Folly: the attacking enemy gets +${x} [attack] (${name(active)}'s [threat]).`
      : "Calphon's Folly: there is no active location.",
    x ? "danger" : undefined,
  );
  return true;
}

// ------------------------------------------------------------- effects

const hasForced = (code: string) =>
  /(?:^|\n)\*?Forced:/.test(card(code).text ?? "");

/** The flipped location's Forced effect (Desecrated Grounds and Forsaken City); the scenario resolves the reprinted ones. */
function nfnFlipped(s: GameState, e: Effect) {
  const u = get(s, e.target);
  if (!u || !(live(s, u, FN.desecrated) || live(s, u, FN.forsaken)))
    return false;
  const where = e.flag ? s.staging : allActiveLocations(s);
  if (!where.some((x) => x.id === u.id)) return true;
  if (u.code === FN.desecrated) {
    // "Forced: After Desecrated Grounds is flipped over while active, deal 1
    // damage to each exhausted character."
    const exhausted = allCharacters(s).filter((c) => c.exhausted);
    log(
      s,
      exhausted.length
        ? `Desecrated Grounds: 1 damage is dealt to each exhausted character (${exhausted.map((c) => name(c)).join(", ")}).`
        : "Desecrated Grounds: no character is exhausted.",
      exhausted.length ? "danger" : undefined,
    );
    prepend(
      s,
      ...exhausted.map((c) =>
        fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
      ),
    );
    return true;
  }
  // "Forced: After Forsaken City is flipped over while active, each engaged
  // Undead enemy makes an immediate attack."
  const enemies = allEngaged(s).filter((x) => undeadEnemy(x) && !x.blanked);
  log(
    s,
    enemies.length
      ? `Forsaken City: each engaged Undead enemy makes an immediate attack (${enemies.map((x) => name(x)).join(", ")}).`
      : "Forsaken City: no Undead enemy is engaged.",
    enemies.length ? "danger" : undefined,
  );
  prepend(
    s,
    ...enemies.map((x) =>
      fx("immediateAttack", { target: x.id, player: ownerOf(s, x) }),
    ),
  );
  return true;
}

export function nightmareFateEffect(s: GameState, e: Effect): boolean {
  if (e.kind === "fateFlipped") return nfnLive(s) && nfnFlipped(s, e);
  if (!e.kind.startsWith("nfn")) return false;
  if (!nfnLive(s)) return true;
  const q = s.fateNumenor!;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "nfnStepsThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "cost"));
      log(
        s,
        `Overgrown Steps: ${s.table ? "each player raises their" : "you raise your"} threat by 2 to travel there.`,
      );
      return true;
    case "nfnShrineTravel": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u || !isShrine(s, u)) return true;
      if (u.code !== F.lost) {
        // The face-up Shrine (turned by Calphon's Folly) returns to its Lost
        // Island side, which cannot have player card attachments.
        for (const a of [...u.attachments])
          if (card(a.code).sphere_code !== "encounter")
            discardAttachment(s, u, a);
        q.hiddenBacks[u.id] = u.code;
        u.code = F.lost;
      }
      log(
        s,
        `Shrine to Morgoth: with ${doubleSided(s)} double-sided location${doubleSided(s) === 1 ? "" : "s"} in the victory display, it returns to the staging area on its Lost Island side; the Lost Islands lose their progress and are shuffled. Choose a new location to travel to.`,
        "danger",
      );
      fateShuffleIslands(s);
      if (s.staging.some((x) => isLocation(x) && !isShrine(s, x)))
        (s.nightmare ??= {}).fateMustTravel = true;
      return true;
    }
    case "nfnGuardian": {
      const enemy = get(s, e.target);
      const pending = s.queue.find(
        (x) => x.kind === "resolvePlayerAttack" && x.target === e.target,
      );
      if (!enemy || !pending) return true;
      // The effect runs in the first player's seat.
      const bottom = s.deck.at(-1);
      const x = cost(bottom);
      choose(
        s,
        `Guardian of the Golden King · The bottom card of ${s.table ? `${seatName(s, firstPlayer(s))}'s` : "your"} deck${seatLabel(s, firstPlayer(s))}`,
        [
          {
            id: "resolve",
            ...(bottom ? { code: bottom } : {}),
            label: bottom
              ? `${card(bottom).name} · printed cost ${x}`
              : "Your deck is empty · X is 0",
            effects: [
              fx("nfnGuardianCheck", { target: e.target, value: x, player: p }),
            ],
          },
        ],
        `Forced: Only ${x} or fewer characters can attack Guardian of the Golden King; the others are removed from the attack (they do not ready).`,
      );
      return true;
    }
    case "nfnGuardianCheck": {
      const pending = s.queue.find(
        (x) => x.kind === "resolvePlayerAttack" && x.target === e.target,
      );
      const ids = (pending?.ids ?? []).filter((id) => !!get(s, id));
      if (!pending || ids.length <= (e.value ?? 0)) return true;
      choose(
        s,
        `Guardian of the Golden King · Remove a character from the attack (${ids.length} attacking, at most ${e.value ?? 0})${seatLabel(s, p)}`,
        ids.map((id): Option => {
          const u = get(s, id)!;
          return {
            id,
            code: u.code,
            label: s.table
              ? `${name(u)} · ${seatName(s, ownerOf(s, u))}`
              : name(u),
            effects: [
              fx("nfnGuardianRemove", {
                target: e.target,
                source: id,
                player: p,
              }),
              fx("nfnGuardianCheck", {
                target: e.target,
                value: e.value,
                player: p,
              }),
            ],
          };
        }),
      );
      return true;
    }
    case "nfnGuardianRemove": {
      const pending = s.queue.find(
        (x) => x.kind === "resolvePlayerAttack" && x.target === e.target,
      );
      if (!pending?.ids?.includes(e.source ?? "")) return true;
      pending.ids = pending.ids.filter((id) => id !== e.source);
      const u = get(s, e.source);
      if (u)
        log(
          s,
          `Guardian of the Golden King: ${name(u)} is removed from the attack.`,
          "danger",
        );
      return true;
    }
    case "nfnFlora": {
      const bottom = fateBottomDiscard(s, p);
      const x = cost(bottom);
      log(
        s,
        bottom
          ? `Corrupted Flora: ${who(s, p)} ${s.table ? "discards" : "discard"} ${card(bottom).name} from the bottom of ${s.table ? "their" : "your"} deck (printed cost ${x}).`
          : `Corrupted Flora: ${s.table ? `${seatName(s, p)}'s` : "your"} deck is empty (X is 0).`,
      );
      prepend(s, fx("nfnFloraCheck", { value: x, player: p }));
      return true;
    }
    case "nfnFloraCheck": {
      const committed = questing(s, p);
      if (committed.length <= (e.value ?? 0)) return true;
      choose(
        s,
        `Corrupted Flora · Remove a character from the quest (${committed.length} questing, at most ${e.value ?? 0})${seatLabel(s, p)}`,
        committed.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("nfnFloraRemove", { target: u.id, player: p }),
            fx("nfnFloraCheck", { value: e.value, player: p }),
          ],
        })),
      );
      return true;
    }
    case "nfnFloraRemove": {
      const u = allCharacters(s).find((x) => x.id === e.target);
      if (!u?.committed) return true;
      forOwner(s, ownerOf(s, u), () => removeFromQuest(s, u));
      log(s, `Corrupted Flora: ${name(u)} is removed from the quest.`);
      return true;
    }
    case "nfnFloraDamage": {
      const committed = allCharacters(s).filter((u) => u.committed);
      if (committed.length)
        log(
          s,
          `Corrupted Flora: 1 damage is dealt to each character still committed to the quest (${committed.map((u) => name(u)).join(", ")}).`,
          "danger",
        );
      prepend(
        s,
        ...committed.map((u) =>
          fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
        ),
      );
      return true;
    }
    case "nfnFolly": {
      const islands = s.staging.filter((u) => u.code === F.lost);
      if (!islands.length) {
        log(
          s,
          "Calphon's Folly: no Uncharted location is in the staging area.",
        );
        return true;
      }
      choose(
        s,
        `Calphon's Folly · Flip an Uncharted location${seatLabel(s, p)}`,
        islands.map((u, i): Option => ({
          id: u.id,
          code: F.lost,
          label: `Lost Island ${i + 1} · ${u.progress} progress`,
          effects: [fx("nfnFollyFlip", { target: u.id, player: p })],
        })),
        "When Revealed: Choose an Uncharted location in the staging area and flip it over. If it has a Forced effect, resolve it as if that location were active. If it does not have a Forced effect, switch it with the active location, if able.",
      );
      return true;
    }
    case "nfnFollyFlip": {
      const u = s.staging.find((x) => x.id === e.target && x.code === F.lost);
      const back = u && q.hiddenBacks[u.id];
      if (!u || !back) return true;
      delete q.hiddenBacks[u.id];
      delete q.lookedBy[u.id];
      u.code = back;
      u.progress = 0;
      log(
        s,
        `Calphon's Folly: the Lost Island is flipped over: ${name(u)}.`,
        "chapter",
      );
      if (hasForced(back)) {
        prepend(
          s,
          fx("fateFlipped", {
            target: u.id,
            code: back,
            player: firstPlayer(s),
            flag: true,
          }),
        );
        return true;
      }
      const prior = s.activeLocation;
      if (!prior) {
        log(
          s,
          `Calphon's Folly: there is no active location, so ${name(u)} stays in the staging area.`,
        );
        return true;
      }
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.activeLocation = u;
      s.staging.push(prior);
      log(
        s,
        `Calphon's Folly: ${name(u)} switches with the active location; ${name(prior)} returns to the staging area.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}
export function validNightmareFate(s: GameState) {
  const q = s.nightmare;
  if (q?.fateMustTravel === undefined) return true;
  return nfnLive(s) && q.fateMustTravel === true;
}

export const NIGHTMARE_FATE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: nfnStats,
  threatBonus: nfnThreatBonus,
  immune: nfnImmune,
  locationProgressBlocked: nfnLocationProgressBlocked,
  travelEffects: nfnTravelEffects,
  mustTravel: nfnMustTravel,
  travelBegin: nfnTravelled,
  travelEntered: nfnTravelled,
  attackersDeclared: nfnAttackersDeclared,
  encounter: nfnEncounter,
  shadow: nfnShadow,
  effect: nightmareFateEffect,
  sharedEffect: () => false,
};
