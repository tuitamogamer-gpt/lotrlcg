/**
 * The Long Dark's Nightmare Deck (docs/NIGHTMARE.md): its setup card's rules
 * (Durin's Greaves gains surge, and its own "Lost:" effect) and its Nightmare
 * encounter cards, composed with the scenario's own rules through
 * batch4Scenario while a Nightmare mode game is played. Its "Lost:" effects
 * join the scenario's through its lostSources and lostResolve hooks, and its
 * locate tests use the scenario's. Effects use the "nld" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { discardCharacter, discardHandCard, engage } from "./board";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { dealEnemyShadows } from "./considered-engagement";
import { LONG_DARK as L, longDarkPass } from "./long-dark-support";
import { longDarkLocate, longDarkLostSources } from "./long-dark";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareLongDarkState {
  /** Goblin Stalker's +2 [attack] for each PASS shadow card dealt this phase: the phase, and each enemy's bonus. */
  stalker?: { key: string; bonus: Record<string, number> };
  /** Dreadful Deep's failed locate tests: the attacking enemies returned to the staging area after their attack. */
  deepReturn?: string[];
  /** Eastern Mines' failed locate test: it returns to the staging area once travelled to. */
  minesFailed?: string;
  /** Bottomless Chasm's shadow: the attacking enemy whose destroying attack discards the defending player's hand. */
  chasm?: string;
}

const ldLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-long-dark";
const phaseKey = (s: GameState) =>
  `${s.round}:${s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase}`;
const lastPlayer = (s: GameState) => playerOrder(s).at(-1) ?? 0;
/** The setup card's "Lost:" effect. */
const SETUP_LOST = "nld-setup";
const isCharacter = (s: GameState, u: Unit) =>
  allCharacters(s).some((c) => c.id === u.id);
const heroes = (s: GameState) =>
  allCharacters(s).filter((u) => card(u.code).type_code === "hero");
/** Every ally in play, whoever controls it. */
const allies = (s: GameState) =>
  playerOrder(s).flatMap((p) => seatView(s, p).allies);

// ------------------------------------------------------------- the setup card

/** "Durin's Greaves gains surge." */
const ldRevealedSurge = (s: GameState, code: string) =>
  ldLive(s) && code === L.greaves;
/** The Nightmare Deck's "Lost:" effects in play. */
function ldLostSources(s: GameState) {
  if (!ldLive(s)) return [];
  const out: { id: string; code: string; label?: string }[] = [
    {
      id: SETUP_LOST,
      code: D.longDarkCard,
      label: "The Long Dark (setup card)",
    },
  ];
  for (const u of [...s.staging, ...allEngaged(s)])
    if (live(s, u, D.trapdoor)) out.push({ id: u.id, code: u.code });
  for (const h of allCharacters(s))
    for (const a of h.attachments)
      if (a.code === D.helpless && !a.blanked && !a.facedown)
        out.push({
          id: a.id,
          code: a.code,
          label: `Lost and Helpless (on ${name(h)})`,
        });
  return out;
}
function ldLostResolve(s: GameState, id: string) {
  if (!ldLive(s)) return false;
  const first = firstPlayer(s);
  // The setup card: "Lost: The first player must choose and discard an ally
  // in play."
  if (id === SETUP_LOST) {
    prepend(s, fx("nldSetupLost", { player: first }));
    return true;
  }
  // Trapdoor Spider: "Lost: Trapdoor Spider engages the last player and
  // makes an immediate attack."
  const spider = get(s, id);
  if (spider && live(s, spider, D.trapdoor)) {
    prepend(s, fx("nldTrapdoorLost", { target: id, player: lastPlayer(s) }));
    return true;
  }
  // Lost and Helpless: "Lost: Discard attached hero."
  const host = allCharacters(s).find((h) =>
    h.attachments.some((a) => a.id === id && a.code === D.helpless),
  );
  if (host) {
    prepend(
      s,
      fx("nldHelplessLost", { target: host.id, player: ownerOf(s, host) }),
    );
    return true;
  }
  return false;
}

// ------------------------------------------------------------- the cards

/** Goblin Stalker: "Forced: When Goblin Stalker attacks, deal it 1 additional shadow card." */
function ldEnemyAttackStarted(s: GameState, enemy: Unit) {
  if (!ldLive(s) || !live(s, enemy, D.goblinStalker)) return;
  if (dealEnemyShadows(s, enemy, 1).length)
    log(s, "Goblin Stalker attacks: it is dealt 1 additional shadow card.");
}
/**
 * Goblin Stalker: "Forced: When Goblin Stalker is dealt a shadow card with
 * "PASS" printed in its text box, it gets +2 [attack] until the end of the
 * phase."
 */
function ldShadowDealt(s: GameState, enemy: Unit, code: string) {
  if (!ldLive(s) || !live(s, enemy, D.goblinStalker) || !longDarkPass(code))
    return;
  const q = (s.nightmare ??= {});
  const key = phaseKey(s);
  const bonus = q.stalker?.key === key ? { ...q.stalker.bonus } : {};
  bonus[enemy.id] = (bonus[enemy.id] ?? 0) + 2;
  q.stalker = { key, bonus };
  log(
    s,
    "Goblin Stalker is dealt a shadow card with PASS: +2 [attack] until the end of the phase.",
    "danger",
  );
}
function ldStats(s: GameState, u: Unit) {
  if (!ldLive(s) || !live(s, u, D.goblinStalker)) return {};
  const q = s.nightmare?.stalker;
  const n = q?.key === phaseKey(s) ? (q.bonus[u.id] ?? 0) : 0;
  return n ? { attack: n } : {};
}
/** Trapdoor Spider: "Forced: If Trapdoor Spider damages a character, discard that character from play." */
function ldDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (!ldLive(s) || value <= 0 || !context.combatDamage) return;
  const enemy = get(s, context.enemyId);
  if (!enemy || !live(s, enemy, D.trapdoor) || !isCharacter(s, u)) return;
  prepend(s, fx("nldTrapdoorDiscard", { target: u.id, player: ownerOf(s, u) }));
}
/** Sentinel of the Deep: "While Sentinel of the Deep is engaged with a player, that player cannot draw cards from card effects." */
const ldCannotDraw = (s: GameState) =>
  ldLive(s) && s.engaged.some((u) => live(s, u, D.sentinel));
/**
 * Eastern Mines: "Travel: The first player must make a locate test to travel
 * here. If this test is failed, return Eastern Mines to the staging area and
 * trigger all "Lost:" effects in play."
 */
const ldTravelEffects = (s: GameState, u: Unit) =>
  ldLive(s) && live(s, u, D.mines)
    ? [fx("nldMinesTravel", { target: u.id, player: firstPlayer(s) })]
    : undefined;
function ldTravelEntered(s: GameState, u: Unit) {
  const q = s.nightmare;
  if (!ldLive(s) || !q?.minesFailed || q.minesFailed !== u.id) return;
  delete q.minesFailed;
  prepend(
    s,
    fx("nldMinesReturn", { target: u.id, player: firstPlayer(s) }),
    fx("longDarkLost", { player: firstPlayer(s) }),
  );
}
/**
 * Bottomless Chasm: "For each point of progress that is placed on Bottomless
 * Chasm, the players must choose and discard 1 card from a player's hand, if
 * able."
 */
function ldLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!ldLive(s) || amount <= 0 || !live(s, u, D.chasm)) return;
  log(
    s,
    `Bottomless Chasm: ${amount} progress, ${amount} ${amount === 1 ? "card" : "cards"} discarded from the players' hands.`,
    "danger",
  );
  prepend(s, fx("nldChasm", { value: amount, player: firstPlayer(s) }));
}
/** Bottomless Chasm's shadow: "If this attack destroys a character, the defending player discards all of the cards in his hand." */
function ldCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  const id = s.nightmare?.chasm;
  if (!ldLive(s) || !id || !context.combatDamage || context.enemyId !== id)
    return;
  const enemy = get(s, id);
  const player = enemy ? ownerOf(s, enemy) : ownerOf(s, u);
  log(
    s,
    `Bottomless Chasm: the attack destroys ${name(u)}; the defending player discards their hand${seatLabel(s, player)}.`,
    "danger",
  );
  prepend(s, fx("nldDiscardHand", { player }));
}
function ldAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  if (!q) return [];
  if (q.chasm === combat.enemyId) delete q.chasm;
  // Dreadful Deep's failed locate test: "return attacking enemy to the
  // staging area after this attack".
  if (q.deepReturn?.includes(combat.enemyId)) {
    q.deepReturn = q.deepReturn.filter((id) => id !== combat.enemyId);
    if (!q.deepReturn.length) delete q.deepReturn;
    const enemy = get(s, combat.enemyId);
    if (enemy && allEngaged(s).some((u) => u.id === enemy.id))
      return [fx("nldReturnEnemy", { target: enemy.id })];
  }
  return [];
}

const TREACHERIES: string[] = [D.deep, D.helpless];
function ldEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ldLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  // Lost and Helpless: "When Revealed: Attach to a hero. (Counts as a
  // Condition attachment with the text: "Lost: Discard attached hero.")"
  if (code === D.helpless) {
    if (!fromReveal || !heroes(s).length) {
      s.encounterDiscard.push(code);
      return true;
    }
    prepend(s, fx("nldHelpless", { player: firstPlayer(s) }));
    return true;
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Dreadful Deep: "When Revealed: Starting with the first player, each
  // player must choose and trigger a different "Lost:" effect in play."
  prepend(s, fx("nldDeep", { value: 0, ids: [], player: playerOrder(s)[0] }));
  return true;
}

function ldShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ldLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const player = enemy ? ownerOf(s, enemy) : (c.attackPlayer ?? 0);
  const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
  switch (code) {
    // Sentinel of the Deep and Eastern Mines: "Defending player must choose
    // and trigger 1 "Lost:" effect in play."
    case D.sentinel:
    case D.mines:
      prepend(s, fx("nldChooseLost", { player }));
      return true;
    // Bottomless Chasm: "If this attack destroys a character, the defending
    // player discards all of the cards in his hand."
    case D.chasm:
      if (enemy) (s.nightmare ??= {}).chasm = enemy.id;
      return true;
    // Dreadful Deep: "Make a locate test. If this test is failed, return
    // attacking enemy to the staging area after this attack and trigger all
    // "Lost:" effects in play."
    case D.deep:
      if (enemy && !s.longDark?.locate)
        longDarkLocate(
          s,
          card(D.deep).name,
          [],
          [fx("nldDeepFailed", { target: enemy.id, player: firstPlayer(s) })],
          player,
        );
      return true;
    // Lost and Helpless: "If you have no cards in your hand, discard
    // defending character from play."
    case D.helpless:
      if (defender && !seatView(s, player).hand.length) {
        log(
          s,
          `Lost and Helpless: the defending player has no cards in hand; ${name(defender)} is discarded.`,
          "danger",
        );
        forOwner(s, ownerOf(s, defender), () => discardCharacter(s, defender));
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareLongDarkEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nld")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nldSetupLost": {
      const options = allies(s);
      if (!options.length) {
        log(s, "The Long Dark · Lost: there is no ally in play to discard.");
        return true;
      }
      choose(
        s,
        "The Long Dark · Lost: choose and discard an ally in play",
        options.map((a): Option => ({
          id: a.id,
          code: a.code,
          label: `${name(a)}${seatLabel(s, ownerOf(s, a))}`,
          effects: [fx("nldDiscard", { target: a.id, player: p })],
        })),
        card(D.longDarkCard).back_text,
      );
      return true;
    }
    case "nldDiscard":
    case "nldTrapdoorDiscard":
    case "nldHelplessLost":
      if (u && isCharacter(s, u)) {
        log(
          s,
          `${e.kind === "nldTrapdoorDiscard" ? "Trapdoor Spider damaged" : e.kind === "nldHelplessLost" ? "Lost and Helpless · Lost:" : "The Long Dark · Lost:"} ${name(u)} is discarded from play.`,
          "danger",
        );
        forOwner(s, ownerOf(s, u), () => discardCharacter(s, u));
      }
      return true;
    case "nldTrapdoorLost":
      if (u && live(s, u, D.trapdoor)) {
        log(
          s,
          `Trapdoor Spider · Lost: it engages the last player and makes an immediate attack${seatLabel(s, p)}.`,
          "danger",
        );
        forOwner(s, p, () => engage(s, u));
        if (allEngaged(s).some((x) => x.id === u.id))
          prepend(
            s,
            fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
          );
      }
      return true;
    case "nldChooseLost": {
      const sources = longDarkLostSources(s);
      if (!sources.length) return true;
      const resolve = (id: string) =>
        fx("longDarkLostResolve", {
          target: id,
          ids: [],
          player: firstPlayer(s),
        });
      if (sources.length === 1) {
        prepend(s, resolve(sources[0].id));
        return true;
      }
      choose(
        s,
        `Choose and trigger 1 "Lost:" effect in play${seatLabel(s, p)}`,
        sources.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: x.label,
          effects: [resolve(x.id)],
        })),
      );
      return true;
    }
    case "nldDeep": {
      const order = playerOrder(s),
        cursor = e.value ?? 0,
        used = e.ids ?? [];
      if (cursor >= order.length) return true;
      const sources = longDarkLostSources(s).filter(
        (x) => !used.includes(x.id),
      );
      if (!sources.length) {
        log(s, 'Dreadful Deep: no other "Lost:" effect is in play.');
        return true;
      }
      const player = order[cursor];
      const next = (id: string) => [
        fx("longDarkLostResolve", {
          target: id,
          ids: [],
          player: firstPlayer(s),
        }),
        fx("nldDeep", {
          value: cursor + 1,
          ids: [...used, id],
          player: order[cursor + 1] ?? firstPlayer(s),
        }),
      ];
      if (sources.length === 1) {
        prepend(s, ...next(sources[0].id));
        return true;
      }
      choose(
        s,
        `Dreadful Deep · Choose and trigger a different "Lost:" effect${seatLabel(s, player)}`,
        sources.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: x.label,
          effects: next(x.id),
        })),
        card(D.deep).text,
      );
      return true;
    }
    case "nldMinesTravel":
      if (u && !s.longDark?.locate)
        longDarkLocate(
          s,
          card(D.mines).name,
          [],
          [fx("nldMinesFailed", { target: u.id, player: firstPlayer(s) })],
          firstPlayer(s),
        );
      return true;
    case "nldMinesFailed":
      if (u) (s.nightmare ??= {}).minesFailed = u.id;
      return true;
    case "nldMinesReturn":
      if (u && s.activeLocation?.id === u.id) {
        s.activeLocation = null;
        s.staging.push(u);
        log(s, "Eastern Mines returns to the staging area.", "danger");
      } else if (u && s.extraActiveLocations?.some((x) => x.id === u.id)) {
        s.extraActiveLocations = s.extraActiveLocations.filter(
          (x) => x.id !== u.id,
        );
        s.staging.push(u);
        log(s, "Eastern Mines returns to the staging area.", "danger");
      }
      return true;
    case "nldDeepFailed": {
      if (u) {
        const q = (s.nightmare ??= {});
        q.deepReturn = [...(q.deepReturn ?? []), u.id];
      }
      prepend(s, fx("longDarkLost", { player: firstPlayer(s) }));
      return true;
    }
    case "nldReturnEnemy":
      if (u && allEngaged(s).some((x) => x.id === u.id)) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        s.staging.push(u);
        log(
          s,
          `Dreadful Deep: ${name(u)} returns to the staging area after its attack.`,
          "danger",
        );
      }
      return true;
    case "nldChasm": {
      const value = e.value ?? 0;
      if (value <= 0) return true;
      const holders = playerOrder(s).filter(
        (x) => seatView(s, x).hand.length > 0,
      );
      if (!holders.length) return true;
      if (holders.length === 1) {
        prepend(s, fx("nldChasmHand", { value, player: holders[0] }));
        return true;
      }
      choose(
        s,
        `Bottomless Chasm · Choose a player's hand to discard 1 card from (${value} left)`,
        holders.map((x): Option => ({
          id: `seat-${x}`,
          label: `Player ${x + 1}'s hand (${seatView(s, x).hand.length})`,
          effects: [fx("nldChasmHand", { value, player: x })],
        })),
        card(D.chasm).text,
      );
      return true;
    }
    case "nldChasmHand": {
      const value = e.value ?? 0;
      if (!s.hand.length) {
        prepend(s, fx("nldChasm", { value, player: firstPlayer(s) }));
        return true;
      }
      choose(
        s,
        `Bottomless Chasm · Discard 1 card from your hand${seatLabel(s, p)}`,
        s.hand.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: card(h.code).name,
          effects: [
            fx("nldHandDiscard", { target: h.id, player: p }),
            fx("nldChasm", { value: value - 1, player: firstPlayer(s) }),
          ],
        })),
      );
      return true;
    }
    case "nldHandDiscard":
      if (e.target && s.hand.some((h) => h.id === e.target))
        discardHandCard(s, e.target, { encounterEffect: true });
      return true;
    case "nldDiscardHand":
      for (const h of [...s.hand])
        discardHandCard(s, h.id, { encounterEffect: true });
      return true;
    case "nldHelpless": {
      const options = heroes(s);
      if (!options.length) {
        s.encounterDiscard.push(D.helpless);
        return true;
      }
      choose(
        s,
        "Lost and Helpless · Attach it to a hero",
        options.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${seatLabel(s, ownerOf(s, h))}`,
          effects: [fx("nldHelplessAttach", { target: h.id, player: p })],
        })),
        card(D.helpless).text,
      );
      return true;
    }
    case "nldHelplessAttach":
      if (u && isCharacter(s, u)) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: D.helpless,
          exhausted: false,
        });
        log(s, `Lost and Helpless attaches to ${name(u)}.`, "danger");
      } else s.encounterDiscard.push(D.helpless);
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nldSetupLost",
  "nldTrapdoorLost",
  "nldChooseLost",
  "nldDeep",
  "nldChasmHand",
  "nldHandDiscard",
  "nldDiscardHand",
  "nldHelpless",
]);
export const NIGHTMARE_LONG_DARK_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  revealedSurge: ldRevealedSurge,
  lostSources: ldLostSources,
  lostResolve: ldLostResolve,
  enemyAttackStarted: ldEnemyAttackStarted,
  shadowDealt: ldShadowDealt,
  stats: ldStats,
  damageDealt: ldDamageDealt,
  cannotDraw: ldCannotDraw,
  travelEffects: ldTravelEffects,
  travelEntered: ldTravelEntered,
  locationProgressPlaced: ldLocationProgressPlaced,
  characterDestroyed: ldCharacterDestroyed,
  attackFinished: ldAttackFinished,
  encounter: ldEncounter,
  shadow: ldShadow,
  effect: nightmareLongDarkEffect,
  sharedEffect: (e) => e.kind.startsWith("nld") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareLongDark(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    (q.stalker === undefined ||
      (!!q.stalker &&
        typeof q.stalker.key === "string" &&
        !!q.stalker.bonus &&
        typeof q.stalker.bonus === "object" &&
        Object.values(q.stalker.bonus).every(
          (n) => typeof n === "number" && Number.isInteger(n) && n >= 0,
        ))) &&
    (q.deepReturn === undefined ||
      (Array.isArray(q.deepReturn) &&
        q.deepReturn.every((id) => typeof id === "string"))) &&
    (q.minesFailed === undefined || typeof q.minesFailed === "string") &&
    (q.chasm === undefined || typeof q.chasm === "string")
  );
}
