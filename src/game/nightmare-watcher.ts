/**
 * The Watcher in the Water's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rules (The Watcher cannot be engaged while Doors of Durin is in
 * play, a destroyed Tentacle enemy damages it, and the players cannot win
 * until both are in the victory display), its own The Watcher and its
 * Nightmare encounter cards, composed with the scenario's own rules through
 * batch4Scenario while a Nightmare mode game is played. Effects use the "nww"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  prepend,
  random,
  shuffle,
  units,
} from "./core";
import {
  damage,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  revealed,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  livingSeats,
  ownerOf,
  seatIndices,
} from "./table";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isPlayerCardSource } from "./player-effect-immunity";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { WATCHER_WATER as W } from "./watcher-water-support";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareWatcherState {
  /** Writhing Tentacle's immediate attack: it attaches to the defending character afterwards. */
  writhing?: string;
  /** Banks of Sirannon's shadow: the attacking enemy whose damage discards random cards. */
  banks?: string;
  /** A player is looking at encounter cards (Hideous Depths shuffles the deck afterwards). */
  peeked?: boolean;
}

const watcherLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "watcher-in-the-water";
const tentacleCode = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Tentacle");
const tentacleEnemy = (code: string) =>
  card(code).type_code === "enemy" && tentacleCode(code);
/** A Tentacle attachment (Wrapped!, Grasping, Writhing or Choking Tentacle). */
const tentacleAttached = (u: Unit) =>
  u.attachments.some((a) => !a.blanked && !a.facedown && tentacleCode(a.code));
const watcher = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].find((u) => u.code === D.watcher);
const doorsInPlay = (s: GameState) => units(s).some((u) => u.code === W.doors);
/** "If that card has a shadow effect or is a Tentacle enemy" (the top card, discarded). */
function tentacleTest(s: GameState, label: string) {
  const code = encounterDraw(s);
  if (!code) return false;
  s.encounterDiscard.push(code);
  const hit = !!card(code).shadow || tentacleEnemy(code);
  log(
    s,
    `${label} discards ${card(code).name}${hit ? " — it strikes" : ""}.`,
    hit ? "danger" : "normal",
  );
  return hit;
}
/** The Tentacle enemy leaves play as an attachment of the character. */
function attachTentacle(s: GameState, u: Unit, host: Unit) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  for (const p of livingSeats(s))
    forOwner(s, p, () => (s.engaged = s.engaged.filter((x) => x.id !== u.id)));
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  for (const a of [...u.attachments]) discardAttachment(s, u, a);
  host.attachments.push({ id: u.id, code: u.code, exhausted: false });
  log(
    s,
    `${name(u)} attaches to ${name(host)} as a Tentacle attachment.`,
    "danger",
  );
}

// ------------------------------------------------------------- the setup card

/** "While Doors of Durin is in play, The Watcher cannot be engaged." */
const watcherCannotEngage = (s: GameState, u: Unit) =>
  watcherLive(s) && live(s, u, D.watcher) && doorsInPlay(s);
/** "Forced: When a Tentacle enemy is destroyed, deal 1 damage to The Watcher if it is in play." */
function watcherEnemyDestination(s: GameState, u: Unit, destruction?: boolean) {
  if (!watcherLive(s) || !destruction || !tentacleEnemy(u.code)) return false;
  const w = watcher(s);
  if (w && w.id !== u.id)
    prepend(
      s,
      fx("nwwWatcherDamage", { target: w.id, player: firstPlayer(s) }),
    );
  return false;
}
/** "The players cannot win the game unless both Doors of Durin and The Watcher are in the victory display." */
function watcherAdvance(s: GameState) {
  if (
    !watcherLive(s) ||
    s.stage !== 2 ||
    s.stageRevealing ||
    s.progress < 5 ||
    s.victory < 3
  )
    return false;
  const v = s.victoryCards ?? [];
  if (v.includes(W.doors) && v.includes(D.watcher)) return false;
  return true;
}

// ------------------------------------------------------------- the cards

/** The Watcher: "While The Watcher is in the staging area, it cannot be damaged by player card effects." */
function watcherDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (
    !watcherLive(s) ||
    !live(s, u, D.watcher) ||
    context.combatDamage ||
    context.questEffect ||
    !s.staging.some((x) => x.id === u.id)
  )
    return amount;
  const source = activePlayerAbilityCode(s);
  if (!source || !isPlayerCardSource(source)) return amount;
  log(
    s,
    "The Watcher cannot be damaged by player card effects in the staging area.",
  );
  return 0;
}
/** Banks of Sirannon: "While Banks of Sirannon is in the staging area, each Tentacle enemy gets +2 [defense]." */
function watcherStats(s: GameState, u: Unit) {
  if (!watcherLive(s) || !tentacleEnemy(u.code)) return {};
  const banks = s.staging.filter((l) => live(s, l, D.banks)).length;
  return banks ? { defense: 2 * banks } : {};
}
/**
 * Writhing Tentacle: "Forced: When Writhing Tentacle engages a player,
 * discard the top card of the encounter deck. If that card has a shadow
 * effect or is a Tentacle enemy, Writhing Tentacle makes an immediate attack,
 * then attaches to the defending character as a Tentacle attachment."
 */
function watcherEngaged(s: GameState, u: Unit) {
  if (!watcherLive(s) || !live(s, u, D.writhing)) return;
  prepend(s, fx("nwwWrithing", { target: u.id, player: ownerOf(s, u) }));
}
function watcherAttackFinished(
  s: GameState,
  combat: Combat,
  skipped?: boolean,
): Effect[] {
  const q = s.nightmare;
  if (q?.banks) delete q.banks;
  if (!watcherLive(s)) return [];
  const enemy = get(s, combat.enemyId);
  // Writhing Tentacle attaches to the defending character.
  if (q?.writhing && q.writhing === combat.enemyId) {
    delete q.writhing;
    const host = get(
      s,
      combat.defenderIds?.[0] ?? combat.defenderId ?? undefined,
    );
    if (
      enemy &&
      host &&
      !skipped &&
      allCharacters(s).some((c) => c.id === host.id)
    )
      attachTentacle(s, enemy, host);
    return [];
  }
  // Choking Tentacle: "Forced: After resolving an attack made by Choking
  // Tentacle, discard the top card of the encounter deck. If that card has a
  // shadow effect or is a Tentacle enemy, attach Choking Tentacle to a
  // character the defending player controls as a Tentacle attachment."
  if (
    enemy &&
    !skipped &&
    live(s, enemy, D.choking) &&
    allEngaged(s).some((x) => x.id === enemy.id)
  )
    return [
      fx("nwwChoking", {
        target: enemy.id,
        player: ownerOf(s, enemy),
      }),
    ];
  return [];
}
/** Writhing Tentacle's attachment: "Attached character cannot commit to the quest." */
const watcherCannotCommit = (s: GameState, u: Unit) =>
  watcherLive(s) &&
  u.attachments.some((a) => !a.blanked && a.code === D.writhing);
/** Choking Tentacle's attachment: "Forced: After attached character readies, deal it 1 damage." */
function watcherCharacterReadied(s: GameState, u: Unit) {
  if (!watcherLive(s)) return;
  const n = u.attachments.filter(
    (a) => !a.blanked && a.code === D.choking,
  ).length;
  if (!n) return;
  log(s, `Choking Tentacle: ${name(u)} readies and takes ${n} damage.`);
  prepend(s, fx("damage", { target: u.id, value: n, player: ownerOf(s, u) }));
}
/** Banks of Sirannon's shadow: "For each point of damage dealt by this attack, the defending player must discard a random card from his hand." */
function watcherDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const id = s.nightmare?.banks;
  if (
    !watcherLive(s) ||
    !id ||
    !context.combatDamage ||
    context.enemyId !== id ||
    value <= 0
  )
    return;
  const player = ownerOf(s, u);
  log(
    s,
    `Banks of Sirannon: ${value} ${value === 1 ? "random card is" : "random cards are"} discarded${seatLabel(s, player)}.`,
    "danger",
  );
  prepend(
    s,
    ...Array.from({ length: value }, () => fx("nwwRandomDiscard", { player })),
  );
}
/**
 * Hideous Depths: "Forced: After a player looks at one or more cards in the
 * encounter deck, shuffle the encounter deck." A look is a seat's known
 * encounter card (one still in the encounter deck, not a dealt shadow card);
 * once its window closes (no pending choice, or the card was moved and the
 * knowledge cleared), the deck is shuffled and that knowledge ends.
 */
function watcherCheck(s: GameState) {
  if (!watcherLive(s)) return;
  const depths = [...s.staging, ...allActiveLocations(s)].some((l) =>
    live(s, l, D.depths),
  );
  const seats = seatIndices(s);
  let looking = false;
  for (const p of seats)
    forOwner(s, p, () => {
      const code = s.peek;
      if (
        code &&
        s.encounterDeck.includes(code) &&
        !allEngaged(s).some((e) => e.shadows.includes(code))
      )
        looking = true;
    });
  if (looking && depths) (s.nightmare ??= {}).peeked = true;
  if (!s.nightmare?.peeked || s.choice) return;
  delete s.nightmare.peeked;
  if (!depths) return;
  shuffle(s, s.encounterDeck);
  for (const p of seats)
    forOwner(s, p, () => {
      s.peek = null;
    });
  log(
    s,
    "Hideous Depths: a player looked at the encounter deck; it is shuffled.",
  );
}
/** Hideous Depths: "Travel: Reveal the topmost Tentacle enemy in the encounter discard pile to travel here." */
const topTentacle = (s: GameState) =>
  [...s.encounterDiscard].reverse().find(tentacleEnemy);
const watcherTravelProblem = (s: GameState, u: Unit) =>
  live(s, u, D.depths) && !topTentacle(s)
    ? "Hideous Depths: no Tentacle enemy is in the encounter discard pile to reveal."
    : null;
const watcherTravelEffects = (s: GameState, u: Unit) =>
  live(s, u, D.depths)
    ? [fx("nwwDepthsTravel", { player: firstPlayer(s) })]
    : undefined;

/** Pulled Under: "If no characters were damaged by this effect, Pulled Under gains surge." */
const watcherRevealedSurge = (s: GameState, code: string) =>
  watcherLive(s) &&
  code === D.pulled &&
  !allCharacters(s).some(tentacleAttached);
const TREACHERIES: string[] = [D.pulled, D.rippling];
function watcherEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!watcherLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Pulled Under: "When Revealed: Deal 3 damage to each character with a
  // Tentacle attachment."
  if (code === D.pulled) {
    const held = allCharacters(s).filter(tentacleAttached);
    log(
      s,
      `Pulled Under deals 3 damage to each character with a Tentacle attachment (${held.length}).`,
      held.length ? "danger" : "normal",
    );
    prepend(
      s,
      ...held.map((u) =>
        fx("damage", { target: u.id, value: 3, player: ownerOf(s, u) }),
      ),
    );
    return true;
  }
  // Rippling From Beneath: "When Revealed: Shuffle X Tentacle enemies from
  // the encounter discard pile into the encounter deck. Heal X damage from
  // The Watcher, if it is in play. X is the number of players in the game."
  const x = livingSeats(s).length;
  const back: string[] = [];
  for (let i = s.encounterDiscard.length - 1; i >= 0 && back.length < x; i--)
    if (tentacleEnemy(s.encounterDiscard[i]))
      back.push(...s.encounterDiscard.splice(i, 1));
  s.encounterDeck.push(...back);
  shuffle(s, s.encounterDeck);
  const w = watcher(s);
  const healed = w ? Math.min(w.damage, x) : 0;
  if (w) w.damage -= healed;
  log(
    s,
    `Rippling From Beneath shuffles ${back.length} Tentacle ${back.length === 1 ? "enemy" : "enemies"} into the encounter deck${w ? ` and heals ${healed} damage from The Watcher` : ""}.`,
    "danger",
  );
  return true;
}

function watcherShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !watcherLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
  switch (code) {
    // Banks of Sirannon: "For each point of damage dealt by this attack, the
    // defending player must discard a random card from his hand."
    case D.banks:
      if (enemy) (s.nightmare ??= {}).banks = enemy.id;
      return true;
    // Pulled Under: "If the defending character has a Tentacle attachment,
    // discard that character."
    case D.pulled:
      if (defender && tentacleAttached(defender)) {
        log(
          s,
          `Pulled Under: ${name(defender)} has a Tentacle attachment and is discarded.`,
          "danger",
        );
        discardCharacter(s, defender);
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareWatcherEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nww")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nwwWatcherDamage":
      if (u) {
        log(
          s,
          "A Tentacle enemy is destroyed: 1 damage to The Watcher.",
          "good",
        );
        // The setup card's effect, not a player card's (even while the
        // ability that destroyed the Tentacle is still resolving).
        damage(s, u.id, 1, { questEffect: true });
      }
      return true;
    case "nwwWrithing":
      if (!u || !allEngaged(s).some((x) => x.id === u.id)) return true;
      if (tentacleTest(s, "Writhing Tentacle")) {
        (s.nightmare ??= {}).writhing = u.id;
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    case "nwwChoking": {
      if (!u || !allEngaged(s).some((x) => x.id === u.id)) return true;
      if (!tentacleTest(s, "Choking Tentacle")) return true;
      const own = allCharacters(s).filter((c) => ownerOf(s, c) === p);
      if (!own.length) return true;
      choose(
        s,
        `Choking Tentacle · Attach it to a character you control${seatLabel(s, p)}`,
        own.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [fx("nwwChokingAttach", { target: u.id, source: c.id })],
        })),
        card(D.choking).text,
      );
      return true;
    }
    case "nwwChokingAttach": {
      const host = get(s, e.source);
      if (u && host && allEngaged(s).some((x) => x.id === u.id))
        attachTentacle(s, u, host);
      return true;
    }
    case "nwwRandomDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const c = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, c.id, { encounterEffect: true });
      });
      return true;
    case "nwwDepthsTravel": {
      const code = topTentacle(s);
      if (!code) return true;
      s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(code), 1);
      log(s, `Hideous Depths: ${card(code).name} is revealed to travel there.`);
      revealed(s, code);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nwwWrithing",
  "nwwChoking",
  "nwwChokingAttach",
  "nwwRandomDiscard",
]);
export const NIGHTMARE_WATCHER_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotEngage: watcherCannotEngage,
  cannotOptionallyEngage: watcherCannotEngage,
  enemyDestination: watcherEnemyDestination,
  advance: watcherAdvance,
  damageAmount: watcherDamageAmount,
  stats: watcherStats,
  engaged: watcherEngaged,
  attackFinished: watcherAttackFinished,
  cannotCommit: watcherCannotCommit,
  characterReadied: watcherCharacterReadied,
  damageDealt: watcherDamageDealt,
  check: watcherCheck,
  travelProblem: watcherTravelProblem,
  travelEffects: watcherTravelEffects,
  revealedSurge: watcherRevealedSurge,
  encounter: watcherEncounter,
  shadow: watcherShadow,
  effect: nightmareWatcherEffect,
  sharedEffect: (e) => e.kind.startsWith("nww") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareWatcher(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    (q.writhing === undefined || typeof q.writhing === "string") &&
    (q.banks === undefined || typeof q.banks === "string") &&
    (q.peeked === undefined || typeof q.peeked === "boolean")
  );
}
