/**
 * Deadmen's Dike's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules and its Nightmare encounter cards, composed with the scenario's own
 * rules (src/game/deadmens-dike.ts) through batch4Scenario while a Nightmare
 * mode game is played. The scenario's deck-discard batches ("dikeMill":
 * Fornost Square's tokens and the deck-out elimination) and its enemy
 * return from the encounter discard pile serve the Nightmare cards, and
 * Deadmen's Gate follows Palace Ruins' action like any other triggered
 * Action. The scenario itself resolves each copy of Cursed Dead by title,
 * and its setup builds the Nightmare encounter deck and the setup card's
 * Cursed Dead discards. Effects use the "ndk" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, cards as allCards, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  putPlayerDeck,
  shuffle,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import { discardHandCard, exhaustCharacter, readyCharacter } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { surgeEffects } from "./surge";
import { NIGHTMARE_TLR as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  live,
  phaseKey,
  seatLabel,
  traitOf,
} from "./nightmare-core";

/** A facedown card under Gather Your Courage, with the seat whose deck it left. */
export interface DikeCourageCard {
  player: number;
  id: string;
  code: string;
  owner?: number;
}
export interface NightmareDikeState {
  /** Palace Ruins: X off its [threat] until the end of the phase (an entry is also its once-per-phase limit). */
  dikePalace?: { id: string; round: number; phase: string; value: number }[];
  /** Fornost Street's shadow: an Undead enemy's +1 [attack] and +1 [defense] until the end of the phase. */
  dikeStreet?: { enemy: string; round: number; phase: string }[];
  /** Gather Your Courage: the cards placed facedown under it. */
  dikeCourage?: { quest: string; cards: DikeCourageCard[] }[];
}

const dkLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "deadmens-dike" && !!s.deadmensDike;
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const activeOf = (s: GameState, code: string) =>
  allActiveLocations(s).filter((u) => live(s, u, code));
const undeadEnemy = (u: Unit) => isEnemy(u) && traitOf(u.code, "Undead");
const heroes = (s: GameState) => allCharacters(s).filter((u) => isHero(u));
const fears = (u: Unit) =>
  u.attachments.filter((a) => a.code === N.fear && !a.blanked).length;
const thisPhase = (s: GameState, m: { round: number; phase: string }) =>
  m.round === s.round && m.phase === phaseKey(s);
const mill = (count: number, player: number, effects: Effect[] = []) =>
  fx("dikeMill", { count, ids: [], effects, player });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Paralyzing Fear: the hero whose ready resolves after its controller paid. */
let paying: string | undefined;

// ------------------------------------------------------------- the cards

/** Undead Horde: "Cannot have attachments." */
const dkCannotAttach = (s: GameState, u: Unit) =>
  dkLive(s) && live(s, u, N.horde);
/**
 * Undead Horde: "For each excess point of combat damage dealt by Undead
 * Horde (damage that is dealt beyond the remaining hit points of the
 * character damaged by its attack) you must discard 1 card from the top of
 * your deck."
 */
function dkDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  ctx: DamageContext,
) {
  if (!dkLive(s) || !ctx.combatDamage || amount <= 0) return;
  const enemy = get(s, ctx.enemyId);
  if (!enemy || !live(s, enemy, N.horde)) return;
  const excess = Math.min(amount, u.damage - stats(s, u).health);
  if (excess <= 0) return;
  const p = s.combat?.attackPlayer ?? ownerOf(s, u);
  log(
    s,
    `Undead Horde: ${plural(excess, "excess point")} of combat damage on ${name(u)}; ${who(s, p)} discard${s.table ? "s" : ""} the top ${plural(excess, "card")} of ${s.table ? "their" : "your"} deck.`,
    "danger",
  );
  prepend(s, mill(excess, p));
}
/**
 * Fornost Street: "While Fornost Street is in the staging area, each other
 * Fornost location gets +1 [threat]." Palace Ruins' action: its [threat]
 * is reduced by X until the end of the phase.
 */
function dkThreatBonus(s: GameState, u: Unit) {
  if (!dkLive(s) || !isLocation(u)) return 0;
  let bonus = traitOf(u.code, "Fornost")
    ? staged(s, N.street).filter((x) => x.id !== u.id).length
    : 0;
  if (u.code === N.palace)
    bonus -= (s.nightmare?.dikePalace ?? [])
      .filter((m) => m.id === u.id && thisPhase(s, m))
      .reduce((n, m) => n + m.value, 0);
  return bonus;
}
/** Fornost Street's shadow: "+1 [attack] and +1 [defense] until the end of the phase." */
function dkStats(s: GameState, u: Unit) {
  if (!dkLive(s) || !isEnemy(u)) return {};
  const n = (s.nightmare?.dikeStreet ?? []).filter(
    (m) => m.enemy === u.id && thisPhase(s, m),
  ).length;
  return n ? { attack: n, defense: n } : {};
}
/** Decrepit City (active): "'when revealed' effects cannot be canceled." */
const dkCannotCancel = (s: GameState, shadow?: boolean) =>
  dkLive(s) && !shadow && activeOf(s, N.city).length > 0;
/** Fornost Street: "Travel: Return the topmost enemy in the encounter discard pile to the staging area." */
function dkTravelProblem(s: GameState, u: Unit) {
  if (!dkLive(s) || !live(s, u, N.street)) return null;
  return s.encounterDiscard.some((c) => card(c).type_code === "enemy")
    ? null
    : "Fornost Street requires an enemy in the encounter discard pile.";
}
const dkTravelEffects = (s: GameState, u: Unit): Effect[] | undefined =>
  dkLive(s) && live(s, u, N.street)
    ? [fx("dikeReturnEnemy", { player: firstPlayer(s) })]
    : undefined;

/**
 * Palace Ruins: "Action: Discard the top X cards of your deck to reduce
 * Palace Ruin's [threat] by X until the end of the phase. Any player may
 * trigger this action. (Limit once per phase.)"
 */
const dkAbilityLabel = (code: string) =>
  code === N.palace
    ? "Discard the top X cards of your deck: Palace Ruins gets −X [threat] until the end of the phase"
    : undefined;
function dkAbilityProblem(s: GameState, u: Unit): string | null {
  if (!dkLive(s) || u.code !== N.palace) return null;
  if (u.blanked) return "Palace Ruins' text box is blank.";
  if (!s.staging.some((x) => x.id === u.id))
    return "Palace Ruins' [threat] only counts in the staging area.";
  if (
    (s.nightmare?.dikePalace ?? []).some(
      (m) => m.id === u.id && thisPhase(s, m),
    )
  )
    return "Palace Ruins' action was already triggered this phase.";
  if (!s.deck.length) return "Your deck is empty.";
  if (threatOf(s, u) <= 0) return "Palace Ruins has no [threat] to reduce.";
  return null;
}
function dkAbility(s: GameState, u: Unit) {
  if (!dkLive(s) || u.code !== N.palace || dkAbilityProblem(s, u)) return false;
  const p = activeSeat(s);
  const most = Math.min(s.deck.length, threatOf(s, u));
  choose(
    s,
    `Palace Ruins${seatLabel(s, p)} · Choose X: discard the top X cards of your deck`,
    Array.from({ length: most }, (_, i): Option => ({
      id: String(i + 1),
      code: u.code,
      label: `X = ${i + 1}: discard ${plural(i + 1, "card")}, Palace Ruins gets −${i + 1} [threat] this phase`,
      effects: [fx("ndkPalace", { target: u.id, value: i + 1, player: p })],
    })),
    card(N.palace).text,
  );
  return true;
}

/**
 * Paralyzing Fear: "Forced: When attached hero would ready, it does not
 * ready unless attached hero's controller discards a card from the top of
 * his deck." (One card for each copy attached.)
 */
function dkReadyIntercepted(s: GameState, u: Unit, cardEffect: boolean) {
  if (!dkLive(s) || paying === u.id || !fears(u)) return false;
  prepend(
    s,
    fx("ndkFearReady", {
      target: u.id,
      flag: cardEffect,
      player: ownerOf(s, u),
    }),
  );
  return true;
}

/** Gather Your Courage: "Forced: When this quest is defeated, shuffle each card under this quest into its owner's deck." */
function dkSideDefeated(s: GameState, u: Unit) {
  if (!dkLive(s) || !live(s, u, N.courage)) return;
  const entry = s.nightmare?.dikeCourage?.find((c) => c.quest === u.id);
  if (!entry) return;
  release(s, entry.quest, (owner, unit) =>
    forOwner(s, owner, () => putPlayerDeck(s, unit)),
  );
  log(
    s,
    `Gather Your Courage is defeated: ${plural(entry.cards.length, "card")} under it ${entry.cards.length === 1 ? "is" : "are"} shuffled into ${s.table ? "their owners'" : "your"} deck${s.table ? "s" : ""}.`,
    "good",
  );
}
/** Return the cards under one Gather Your Courage to their owners; eliminated owners' cards leave the game. */
function release(
  s: GameState,
  quest: string,
  place: (owner: number, unit: Unit) => void,
  shuffled = true,
) {
  const q = s.nightmare!;
  const entry = q.dikeCourage?.find((c) => c.quest === quest);
  q.dikeCourage = (q.dikeCourage ?? []).filter((c) => c.quest !== quest);
  if (!q.dikeCourage.length) delete q.dikeCourage;
  const owners = new Set<number>();
  for (const c of entry?.cards ?? []) {
    const owner = c.owner ?? c.player;
    if (s.table?.seats[owner]?.eliminated) continue;
    const unit = make(s, c.code);
    unit.id = c.id;
    if (c.owner !== undefined) unit.owner = c.owner;
    place(owner, unit);
    owners.add(owner);
  }
  if (shuffled)
    for (const owner of owners) forOwner(s, owner, () => shuffle(s, s.deck));
}
/**
 * If Gather Your Courage leaves play without being defeated, the cards
 * under it go to their owners' discard piles (its Forced effect only
 * shuffles them back on defeat).
 */
function dkCheck(s: GameState) {
  if (!dkLive(s)) return;
  for (const entry of s.nightmare?.dikeCourage ?? [])
    if (!s.staging.some((u) => u.id === entry.quest)) {
      release(
        s,
        entry.quest,
        (owner, unit) => forOwner(s, owner, () => s.discard.push(unit.code)),
        false,
      );
      log(
        s,
        `Gather Your Courage left play: the cards under it are placed in ${s.table ? "their owners'" : "your"} discard pile${s.table ? "s" : ""}.`,
      );
    }
}

function dkEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!dkLive(s)) return false;
  const p = firstPlayer(s);
  if (code === N.courage) {
    // Gather Your Courage: "When Revealed: Each player places the top 8
    // cards of his deck facedown under this quest."
    if (!fromReveal) return true;
    const quest = [...s.staging].reverse().find((u) => u.code === N.courage);
    if (quest) prepend(s, fx("ndkCourage", { target: quest.id, player: p }));
    return true;
  }
  if (code !== N.fear && code !== N.curse) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (code === N.fear) {
    // Paralyzing Fear: "When Revealed: Attach to a hero and exhaust that
    // hero."
    if (!fromReveal || !heroes(s).length) {
      s.encounterDiscard.push(code);
      return true;
    }
    prepend(s, fx("ndkFear", { player: p }));
    return true;
  }
  // Curse of Angmar: "When Revealed: Each player discards each card in his
  // hand that has the same title as a card in his discard pile. If no cards
  // are discarded by this effect, Curse of Angmar gains surge."
  s.encounterDiscard.push(code);
  if (fromReveal) prepend(s, fx("ndkCurse", { player: p }));
  return true;
}

function dkShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !dkLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const engaged = seatView(s, p).engaged.filter(undeadEnemy);
  switch (code) {
    // Palace Ruins: "Discard 1 card from the top of your deck for each
    // Undead enemy engaged with you."
    case N.palace:
      log(
        s,
        `Palace Ruins: ${plural(engaged.length, "Undead enemy")} engaged; ${who(s, p)} discard${s.table ? "s" : ""} the top ${plural(engaged.length, "card")} of ${s.table ? "their" : "your"} deck.`,
        "danger",
      );
      if (engaged.length) prepend(s, mill(engaged.length, p));
      return true;
    // Fornost Street: "Each Undead enemy engaged with you gets +1 [attack]
    // and +1 [defense] until the end of the phase."
    case N.street: {
      const q = (s.nightmare ??= {});
      q.dikeStreet = [
        ...(q.dikeStreet ?? []).filter((m) => m.round === s.round),
        ...engaged.map((u) => ({
          enemy: u.id,
          round: s.round,
          phase: phaseKey(s),
        })),
      ];
      log(
        s,
        `Fornost Street: ${engaged.length ? `${engaged.map((u) => name(u)).join(", ")} get${engaged.length === 1 ? "s" : ""} +1 [attack] and +1 [defense] until the end of the phase` : "no Undead enemy is engaged"}${seatLabel(s, p)}.`,
        "danger",
      );
      return true;
    }
    // Decrepit City: "Either discard 3 cards from the top of your deck, or
    // this attack is considered undefended."
    case N.city:
      prepend(s, fx("ndkCityShadow", { player: p }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareDikeEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndk")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  const q = (s.nightmare ??= {});
  switch (e.kind) {
    case "ndkPalace": {
      // The cost: discard the top X cards of the triggering player's deck.
      if (!u) return true;
      const x = e.value ?? 0;
      q.dikePalace = [
        ...(q.dikePalace ?? []).filter((m) => m.round === s.round),
        { id: u.id, round: s.round, phase: phaseKey(s), value: 0 },
      ];
      log(
        s,
        `Palace Ruins: ${who(s, p)} discard${s.table ? "s" : ""} the top ${plural(x, "card")} of ${s.table ? "their" : "your"} deck to reduce its [threat] by ${x} this phase.`,
        "good",
      );
      prepend(
        s,
        mill(x, p, [
          fx("ndkPalaceReduce", { target: u.id, value: x, player: p }),
        ]),
      );
      return true;
    }
    case "ndkPalaceReduce": {
      // (Deadmen's Gate's discard follows the action's own finish.)
      const entry = (q.dikePalace ?? []).find(
        (m) => m.id === e.target && thisPhase(s, m),
      );
      if (entry) entry.value += e.value ?? 0;
      return true;
    }
    case "ndkFear": {
      const options = heroes(s);
      if (!options.length) {
        s.encounterDiscard.push(N.fear);
        return true;
      }
      if (options.length === 1) {
        prepend(s, fx("ndkFearAttach", { target: options[0].id, player: p }));
        return true;
      }
      choose(
        s,
        "Paralyzing Fear · Attach it to a hero and exhaust that hero",
        options.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${seatLabel(s, ownerOf(s, h))}`,
          effects: [fx("ndkFearAttach", { target: h.id, player: p })],
        })),
        card(N.fear).text,
      );
      return true;
    }
    case "ndkFearAttach": {
      if (!u || !isHero(u) || !heroes(s).some((h) => h.id === u.id)) {
        s.encounterDiscard.push(N.fear);
        return true;
      }
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: N.fear,
        exhausted: false,
      });
      forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
      log(
        s,
        `Paralyzing Fear attaches to ${name(u)}${seatLabel(s, ownerOf(s, u))}, and ${name(u)} is exhausted.`,
        "danger",
      );
      return true;
    }
    case "ndkFearReady": {
      // The hero would ready: its controller may discard to let it ready.
      if (!u || !u.exhausted) return true;
      const n = fears(u);
      if (!n) {
        prepend(
          s,
          fx("ndkFearPaid", { target: u.id, flag: e.flag, player: p }),
        );
        return true;
      }
      if (s.deck.length < n) {
        log(
          s,
          `Paralyzing Fear: ${name(u)} does not ready (${who(s, p)} cannot discard ${plural(n, "card")} from ${s.table ? "their" : "your"} deck).`,
          "danger",
        );
        return true;
      }
      choose(
        s,
        `Paralyzing Fear${seatLabel(s, p)} · Discard to ready ${name(u)}?`,
        [
          {
            id: "pay",
            code: N.fear,
            label: `Discard the top ${plural(n, "card")} of your deck to ready ${name(u)}`,
            effects: [
              mill(n, p, [
                fx("ndkFearPaid", { target: u.id, flag: e.flag, player: p }),
              ]),
            ],
          },
          {
            id: "skip",
            label: `${name(u)} does not ready`,
            effects: [],
          },
        ],
        card(N.fear).text,
      );
      return true;
    }
    case "ndkFearPaid":
      if (u?.exhausted) {
        paying = u.id;
        try {
          readyCharacter(s, u, e.flag ?? true);
        } finally {
          paying = undefined;
        }
      }
      return true;
    case "ndkCurse": {
      let discarded = 0;
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          const titles = new Set(s.discard.map((c) => card(c).name));
          const matches = s.hand.filter((h) => titles.has(card(h.code).name));
          const names: string[] = [];
          for (const h of matches) {
            const before = s.hand.length;
            discardHandCard(s, h.id, { encounterEffect: true });
            if (s.hand.length < before) {
              discarded++;
              names.push(name(h));
            }
          }
          if (names.length)
            log(
              s,
              `Curse of Angmar: ${who(s, player)} discard${s.table ? "s" : ""} ${names.join(", ")}.`,
              "danger",
            );
        });
      if (!discarded) {
        log(s, "Curse of Angmar discards no cards, and gains surge.", "danger");
        prepend(s, ...surgeEffects(N.curse));
      }
      return true;
    }
    case "ndkCourage": {
      if (!u) return true;
      const cards: DikeCourageCard[] = [];
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          for (let i = 0; i < 8 && s.deck.length; i++) {
            const c = takePlayerDeck(s);
            cards.push({
              player,
              id: c.id,
              code: c.code,
              ...(c.owner !== undefined && c.owner !== player
                ? { owner: c.owner }
                : {}),
            });
          }
        });
      q.dikeCourage = [
        ...(q.dikeCourage ?? []).filter((c) => c.quest !== u.id),
        { quest: u.id, cards },
      ];
      log(
        s,
        `Gather Your Courage: ${s.table ? "each player places" : "you place"} the top 8 cards of ${s.table ? "their" : "your"} deck facedown under it (${plural(cards.length, "card")}).`,
        "danger",
      );
      return true;
    }
    case "ndkCityShadow": {
      const c = s.combat;
      if (!c) return true;
      const defended = !!c.defenderId || (c.defenderIds?.length ?? 0) > 0;
      const canDiscard = s.deck.length >= 3;
      const options: Option[] = [];
      if (canDiscard || !defended)
        options.push({
          id: "discard",
          label: `Discard the top ${plural(Math.min(3, s.deck.length), "card")} of your deck`,
          effects: [mill(3, p)],
        });
      if (defended || !canDiscard)
        options.push({
          id: "undefended",
          label: defended
            ? "This attack is considered undefended"
            : "This attack is already undefended",
          effects: [fx("ndkUndefended", { player: p })],
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          `Decrepit City${seatLabel(s, p)} · Discard 3 cards from your deck, or this attack is undefended`,
          options,
          card(N.city).shadow,
        );
      return true;
    }
    case "ndkUndefended":
      if (s.combat && (s.combat.defenderId || s.combat.defenderIds?.length)) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(
          s,
          "Decrepit City: this attack is considered undefended.",
          "danger",
        );
      }
      return true;
  }
  return false;
}

export const NIGHTMARE_DIKE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotAttach: dkCannotAttach,
  damageDealt: dkDamageDealt,
  threatBonus: dkThreatBonus,
  stats: dkStats,
  cannotCancel: dkCannotCancel,
  travelProblem: dkTravelProblem,
  travelEffects: dkTravelEffects,
  abilityLabel: dkAbilityLabel,
  abilityProblem: dkAbilityProblem,
  ability: dkAbility,
  readyIntercepted: dkReadyIntercepted,
  sideDefeated: dkSideDefeated,
  check: dkCheck,
  encounter: dkEncounter,
  shadow: dkShadow,
  effect: nightmareDikeEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareDike(s: GameState) {
  const q = s.nightmare;
  if (
    q?.dikePalace === undefined &&
    q?.dikeStreet === undefined &&
    q?.dikeCourage === undefined
  )
    return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const seats = s.table?.seats.length ?? 1;
  const seat = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) < seats;
  return (
    dkLive(s) &&
    (q.dikePalace === undefined ||
      (Array.isArray(q.dikePalace) &&
        q.dikePalace.every(
          (m) =>
            !!m &&
            typeof m.id === "string" &&
            round(m.round) &&
            typeof m.phase === "string" &&
            Number.isInteger(m.value) &&
            m.value >= 0,
        ))) &&
    (q.dikeStreet === undefined ||
      (Array.isArray(q.dikeStreet) &&
        q.dikeStreet.every(
          (m) =>
            !!m &&
            typeof m.enemy === "string" &&
            round(m.round) &&
            typeof m.phase === "string",
        ))) &&
    (q.dikeCourage === undefined ||
      (Array.isArray(q.dikeCourage) &&
        q.dikeCourage.length > 0 &&
        q.dikeCourage.every(
          (entry) =>
            !!entry &&
            typeof entry.quest === "string" &&
            Array.isArray(entry.cards) &&
            entry.cards.every(
              (c) =>
                !!c &&
                seat(c.player) &&
                typeof c.id === "string" &&
                typeof c.code === "string" &&
                c.code in allCards &&
                (c.owner === undefined || seat(c.owner)),
            ),
        )))
  );
}
