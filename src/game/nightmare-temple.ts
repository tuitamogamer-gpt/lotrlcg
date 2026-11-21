/**
 * Temple of the Deceived's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (the removals from the encounter deck and the Island Map deck, and
 * the map's three Lost Island columns, two Edge of the Temple columns and
 * Temple column are the scenario's own setup, in src/game/temple.ts, as is
 * the Edge of the Temple side's Uncharted rules) and its Nightmare encounter
 * cards, composed with the scenario's rules through batch4Scenario while a
 * Nightmare mode game is played. Effects use the "ntd" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, random } from "./core";
import { discardAttachment, discardHandCard } from "./board";
import {
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { isHero, unitType } from "./card-types";
import { surgeEffects } from "./surge";
import { returnToStaging } from "./black-riders-hunted";
import { templeSyncMap } from "./temple";
import {
  TEMPLE as T,
  TEMPLE_NIGHTMARE as N,
  templeActiveLocation,
  templeAdjacent,
  templeCell,
  templeFrontOf,
  templeIsMapLocation,
  templeLocationsLeft,
  templeMapUnit,
  templeMapUnits,
} from "./temple-support";
import { nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, seatLabel } from "./nightmare-core";

export interface NightmareTempleState {
  /** Call of the Curse: the copies resolved this round (each adds +X [attack] and +X [defense] to each Undead enemy). */
  templeCall?: { round: number; count: number };
  /** Temple Foothills: the cards the players, as a group, have played this round. */
  templePlayed?: { round: number; count: number };
}

const ntdLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "temple-of-the-deceived" && !!s.temple;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isPlayerCard = (code: string) => card(code).sphere_code !== "encounter";
/** The active location, while its text is active. */
const activeIs = (s: GameState, code: string) => {
  const a = templeActiveLocation(s);
  return !!a && a.code === code && !a.blanked;
};
/** The active location's row on the Island Map (0 is the top row). */
const activeRow = (s: GameState) => {
  const a = templeActiveLocation(s);
  return a ? templeCell(s, a.id)?.row : undefined;
};
const thisRound = (s: GameState, t?: { round: number; count: number }) =>
  t && t.round === s.round ? t.count : 0;

// ------------------------------------------------------------- passives

/**
 * Call of the Curse: "Until the end of the round, each Undead enemy gets +X
 * [attack] and +X [defense]. X is the number of locations to the left of the
 * active location (in its row)." An encounter lasting effect: it recalculates
 * X and applies to Undead enemies that enter play later (FAQ 1.55).
 * Cursed Soldier: "While the active location is in the middle row, Cursed
 * Soldier gets +3 [attack]. While the active location is in the bottom row,
 * Cursed Soldier gets +3 [defense]."
 */
function ntdStats(s: GameState, u: Unit) {
  if (!ntdLive(s) || !isEnemy(u)) return {};
  let attack = 0,
    defense = 0;
  const copies = thisRound(s, s.nightmare?.templeCall);
  if (copies && trait(u, "Undead")) {
    const x = templeLocationsLeft(s).length * copies;
    attack += x;
    defense += x;
  }
  if (u.code === N.soldier && !u.blanked) {
    const row = activeRow(s);
    if (row === 1) attack += 3;
    if (row === 2) defense += 3;
  }
  return {
    ...(attack ? { attack } : {}),
    ...(defense ? { defense } : {}),
  };
}
/** Cursed Soldier: "While the active location is in the top row, Cursed Soldier gets +3 [threat]." */
const ntdThreatBonus = (s: GameState, u: Unit) =>
  ntdLive(s) && u.code === N.soldier && !u.blanked && activeRow(s) === 0
    ? 3
    : 0;
/** Temple Foothills: "While Temple Foothills is the active location, the players, as a group, cannot play more than 1 card each round." */
function ntdPlayerCardPlayed(s: GameState) {
  if (!ntdLive(s)) return;
  const q = (s.nightmare ??= {});
  q.templePlayed = {
    round: s.round,
    count: thisRound(s, q.templePlayed) + 1,
  };
}
const ntdPlayProblem = (s: GameState) =>
  ntdLive(s) &&
  activeIs(s, N.foothills) &&
  thisRound(s, s.nightmare?.templePlayed) >= 1
    ? "Temple Foothills: the players, as a group, cannot play more than 1 card each round."
    : null;
/** Cursed Temple: "While Cursed Temple is the active location, each player cannot draw cards by card effects." */
const ntdCannotDraw = (s: GameState) => ntdLive(s) && activeIs(s, N.cursed);

// ------------------------------------------------------------- the cards

/** Call of the Curse's When Revealed effect; true when X is 0 or 1. */
function callOfTheCurse(s: GameState) {
  const q = (s.nightmare ??= {});
  q.templeCall = { round: s.round, count: thisRound(s, q.templeCall) + 1 };
  const x = templeLocationsLeft(s).length;
  log(
    s,
    `Call of the Curse: until the end of the round, each Undead enemy gets +X [attack] and +X [defense], where X is the number of locations to the left of the active location (now ${x}).`,
    "danger",
  );
  return x <= 1;
}

function ntdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ntdLive(s) || ![N.deceitful, N.call, N.precipice].includes(code))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  // Sudden Precipice attaches to the active location as it resolves.
  if (code !== N.precipice || !fromReveal) s.encounterDiscard.push(code);
  if (fromReveal)
    prepend(
      s,
      fx(
        code === N.deceitful
          ? "ntdDeceitful"
          : code === N.call
            ? "ntdCall"
            : "ntdPrecipiceAttach",
        { code, player: firstPlayer(s) },
      ),
    );
  return true;
}

function ntdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ntdLive(s)) return false;
  switch (code) {
    // King's Knight: "If no damage is dealt by this attack, return attacking
    // enemy to the staging area after this attack."
    case N.knight:
      c.ntdKnightReturn = true;
      log(
        s,
        "King's Knight: if this attack deals no damage, the attacking enemy returns to the staging area after it.",
        "danger",
      );
      return true;
    // Call of the Curse: "Resolve the 'when revealed' effect of Call of the
    // Curse." (Its surge has no effect on a shadow card.)
    case N.call:
      callOfTheCurse(s);
      return true;
    // Sudden Precipice: "Attacking enemy makes an additional attack after
    // this one."
    case N.precipice:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Sudden Precipice: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
  }
  return false;
}

/** King's Knight: "Forced: After King's Knight attacks, if no damage was dealt by its attack, return it to the staging area." */
function ntdAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!ntdLive(s) || skipped || (combat.damageDealt ?? 0) > 0) return [];
  const enemy = get(s, combat.enemyId);
  if (!enemy) return [];
  const knight = enemy.code === N.knight && !enemy.blanked;
  return knight || combat.ntdKnightReturn
    ? [
        fx("ntdReturn", {
          target: enemy.id,
          code: knight ? N.knight : undefined,
          player: combat.attackPlayer ?? firstPlayer(s),
        }),
      ]
    : [];
}

/** The setup card: "Forced: After the active location is explored, discard all player cards attached to that location." */
function ntdExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (
    !ntdLive(s) ||
    !wasActive ||
    !templeIsMapLocation(s, u) ||
    !u.attachments.some((a) => isPlayerCard(a.code))
  )
    return;
  prepend(s, fx("ntdExplored", { target: u.id, player: firstPlayer(s) }));
}

/**
 * Deceitful Island: "Then, flip each adjacent location to its 'Lost Island'
 * or 'Edge of the Temple' side." Its progress is removed, as with every flip,
 * and its player card attachments are discarded (that side cannot have
 * them). Every player saw its revealed side.
 */
function flipFacedown(s: GameState, u: Unit) {
  const q = s.temple!;
  const original = q.originalCodes[u.id];
  if (!original || q.hiddenBacks[u.id]) return false;
  const front = templeFrontOf(original);
  if (front === T.temple) return false;
  for (const a of [...u.attachments])
    if (isPlayerCard(a.code)) discardAttachment(s, u, a, true);
  u.code = front;
  delete u.flipped;
  u.progress = 0;
  q.hiddenBacks[u.id] = original;
  q.lookedBy[u.id] = [...playerOrder(s)];
  return true;
}

export function nightmareTempleEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ntd")) return false;
  if (!ntdLive(s)) return true;
  const q = s.temple!;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    // Deceitful Island: "Switch the placement of the active location with
    // the location above or below it, or to its left (the active location
    // does not change)."
    case "ntdDeceitful": {
      const active = templeActiveLocation(s);
      const cell = active && templeCell(s, active.id);
      if (!active || !cell) return true;
      const options: Option[] = (
        [
          [-1, 0, "above"],
          [1, 0, "below"],
          [0, -1, "to its left"],
        ] as const
      ).flatMap(([dr, dc, where]) => {
        const other = q.map.find(
          (c) => c.row === cell.row + dr && c.column === cell.column + dc,
        );
        const u = other && templeMapUnit(s, other.id);
        return u
          ? [
              {
                id: u.id,
                code: u.code,
                label: `Switch with ${name(u)} · ${where}`,
                effects: [
                  fx("ntdDeceitfulSwitch", {
                    source: active.id,
                    target: u.id,
                    player: p,
                  }),
                ],
              },
            ]
          : [];
      });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          `Deceitful Island · Switch the active location${seatLabel(s, p)}`,
          options,
          "Switch the placement of the active location with the location above or below it, or to its left (the active location does not change). Then, flip each adjacent location to its Lost Island or Edge of the Temple side.",
        );
      return true;
    }
    case "ntdDeceitfulSwitch": {
      const active = templeActiveLocation(s);
      const a = q.map.find((c) => c.id === e.source);
      const b = q.map.find((c) => c.id === e.target);
      if (!active || active.id !== e.source || !a || !b) return true;
      [a.id, b.id] = [b.id, a.id];
      templeSyncMap(s);
      const flipped = templeAdjacent(s, active.id).filter((u) =>
        flipFacedown(s, u),
      );
      templeSyncMap(s);
      const other = templeMapUnit(s, e.target!)!;
      log(
        s,
        `Deceitful Island: ${name(active)} switches places with ${name(other)}${flipped.length ? `; ${flipped.length} adjacent location${flipped.length === 1 ? " is" : "s are"} flipped to ${flipped.length === 1 ? "its" : "their"} Lost Island or Edge of the Temple side` : ""}.`,
        "danger",
      );
      return true;
    }
    // Call of the Curse: "If X is 0 or 1, Call of the Curse gains surge."
    case "ntdCall":
      if (callOfTheCurse(s)) {
        log(s, "Call of the Curse: X is 0 or 1, so it gains surge.", "danger");
        prepend(s, ...surgeEffects(N.call));
      }
      return true;
    // Sudden Precipice: "Attach to the active location."
    case "ntdPrecipiceAttach": {
      const active = templeActiveLocation(s);
      if (!active) {
        s.encounterDiscard.push(N.precipice);
        return true;
      }
      active.attachments.push({
        id: `a${s.nextId++}`,
        code: N.precipice,
        exhausted: false,
      });
      log(
        s,
        `Sudden Precipice is attached to ${name(active)}: after the players travel from it to the right, each exhausted character takes 2 damage.`,
        "danger",
      );
      return true;
    }
    // "Forced: After you travel from attached location to the right, deal 2
    // damage to each exhausted character."
    case "ntdPrecipice": {
      const exhausted = allCharacters(s).filter((u) => u.exhausted);
      log(
        s,
        `Sudden Precipice: ${exhausted.length ? `each exhausted character takes 2 damage (${exhausted.map((u) => name(u)).join(", ")})` : "no character is exhausted"}.`,
        "danger",
      );
      prepend(
        s,
        ...exhausted.map((u) =>
          fx("damage", { target: u.id, value: 2, player: ownerOf(s, u) }),
        ),
      );
      return true;
    }
    // Desecrated Ruins: "Forced: When Desecrated Ruins is flipped over while
    // active, remove all resources from each hero and objective-ally."
    case "ntdDesecrated": {
      const holders = allCharacters(s).filter(
        (u) =>
          (isHero(u) || unitType(u) === "objective-ally") && u.resources > 0,
      );
      for (const u of holders) u.resources = 0;
      log(
        s,
        `Desecrated Ruins: ${holders.length ? `${holders.map((u) => name(u)).join(", ")} ${holders.length === 1 ? "loses its" : "lose their"} resources` : "no hero or objective-ally has resources"}.`,
        "danger",
      );
      return true;
    }
    // Cursed Temple: "Forced: When Cursed Temple is flipped over while
    // active, discard 3 cards at random from each player's hand."
    case "ntdCursedTemple": {
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          const tried = new Set<string>();
          let discarded = 0;
          while (discarded < 3) {
            const pool = s.hand.filter((h) => !tried.has(h.id));
            if (!pool.length) break;
            const pick = pool[Math.floor(random(s) * pool.length)];
            tried.add(pick.id);
            const before = s.hand.length;
            discardHandCard(s, pick.id, { encounterEffect: true });
            if (s.hand.length < before) discarded++;
          }
        });
      log(
        s,
        "Cursed Temple: each player discards 3 cards at random from their hand.",
        "danger",
      );
      return true;
    }
    case "ntdExplored": {
      const u = templeMapUnit(s, e.target!);
      if (!u) return true;
      const attached = u.attachments.filter((a) => isPlayerCard(a.code));
      for (const a of attached) discardAttachment(s, u, a);
      if (attached.length)
        log(
          s,
          `Temple of the Deceived (Nightmare): ${name(u)} is explored and its player card attachments are discarded.`,
          "danger",
        );
      return true;
    }
    case "ntdReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u) && e.code === N.knight)
        log(
          s,
          "King's Knight dealt no damage with its attack and returns to the staging area.",
          "danger",
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- saves

export function validNightmareTemple(s: GameState) {
  const q = s.nightmare;
  const counter = (t: unknown) =>
    t === undefined ||
    (ntdLive(s) &&
      !!t &&
      typeof t === "object" &&
      Number.isInteger((t as { round: number }).round) &&
      (t as { round: number }).round >= 0 &&
      (t as { round: number }).round <= s.round &&
      Number.isInteger((t as { count: number }).count) &&
      (t as { count: number }).count > 0);
  if (!counter(q?.templeCall) || !counter(q?.templePlayed)) return false;
  // Sudden Precipice is attached only to Island Map locations.
  return templeMapUnits(s)
    .flatMap((u) => u.attachments)
    .every((a) => a.code !== N.precipice || ntdLive(s));
}

export const NIGHTMARE_TEMPLE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: ntdStats,
  threatBonus: ntdThreatBonus,
  playerCardPlayed: ntdPlayerCardPlayed,
  playProblem: ntdPlayProblem,
  cannotDraw: ntdCannotDraw,
  encounter: ntdEncounter,
  shadow: ntdShadow,
  attackFinished: ntdAttackFinished,
  explored: ntdExplored,
  effect: nightmareTempleEffect,
  sharedEffect: () => false,
};
