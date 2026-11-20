/**
 * The Dread Realm's Nightmare Deck (docs/NIGHTMARE.md): its setup card (no
 * lasting effect) and its Nightmare encounter cards, composed with the
 * scenario's own rules (src/game/dread-realm.ts) through batch4Scenario while
 * a Nightmare mode game is played. The Sorcery cards it attaches to a deck or
 * a threat dial count for Daechanar there (dreadPlacedSorceries). Effects use
 * the "ndr" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  takePlayerDeck,
} from "./core";
import { raiseThreat, takePlayerDiscard } from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, attachToQuest, mainQuestUnit } from "./quest-state";
import { isAlly, isHero } from "./card-types";
import { syncAttachmentText } from "./attachment-text";
import { DREAD as D } from "./dread-realm-support";
import { dreadReanimate } from "./dread-realm";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  phaseKey,
  seatLabel,
} from "./nightmare-core";

export interface NightmareDreadState {
  /** Daechanar's Curse attached to the top of a player's deck: its id and that player. */
  dreadCurses?: { id: string; player: number }[];
  /** The round in which each player (by seat) last played an event card (Silent Guardian's "the first time … each round"). */
  dreadEventRounds?: Record<string, number>;
  /** The events a Silent Guardian's Forced effect reanimates instead of discarding them, with the round they were played in. */
  dreadGuardianEvents?: { id: string; round: number }[];
  /** Cursed Halls' shadows: until the end of the phase, the attacker counts each Reanimated Dead engaged with that player. */
  dreadHalls?: {
    enemy: string;
    player: number;
    round: number;
    phase: string;
  }[];
}

const ndrLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-dread-realm" && !!s.dreadRealm;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const sorcery = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Sorcery");
/** The Nightmare Deck's Sorcery treacheries: each attaches somewhere as its 'when revealed' effect. */
const PLACED: readonly string[] = [
  N.powerBeyond,
  N.daechanarCurse,
  N.allIsLost,
];
const deckOwner = (s: GameState, p: number) =>
  s.table ? `${seatName(s, p)}'s` : "your";
function order(s: GameState, effects: Effect[], text: string) {
  if (effects.length === 1) prepend(s, effects[0]);
  else if (effects.length)
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
/** Cursed Halls' bonuses still in their phase. */
const activeHalls = (s: GameState) =>
  (s.nightmare?.dreadHalls ?? []).filter(
    (h) => h.round === s.round && h.phase === phaseKey(s),
  );
const reanimatedEngaged = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter((u) => u.code === D.reanimated).length;

/**
 * The 'when revealed' effects of the Nightmare Deck's Sorcery treacheries:
 * Power Beyond Death "Attach to the main quest.", Daechanar's Curse "Attach
 * Daechanar's Curse to the top of the first player's deck.", All is Lost
 * "Attach All is Lost to the first player's threat dial."
 */
function attachPlaced(s: GameState, code: string) {
  const id = `a${s.nextId++}`;
  const p = firstPlayer(s);
  if (code === N.powerBeyond) {
    const quest = mainQuestUnit(s);
    if (
      !quest ||
      !attachToQuest(s, quest.code, { id, code, exhausted: false })
    ) {
      s.encounterDiscard.push(code);
      log(s, "Power Beyond Death: there is no main quest; it is discarded.");
      return;
    }
    syncAttachmentText(s);
    log(
      s,
      `Power Beyond Death is attached to ${name(quest)}: Daechanar gets +2 [defense].`,
      "danger",
    );
  } else if (code === N.daechanarCurse) {
    ((s.nightmare ??= {}).dreadCurses ??= []).push({ id, player: p });
    log(
      s,
      `Daechanar's Curse is attached to the top of ${deckOwner(s, p)} deck: the next draw from it reanimates those cards instead.`,
      "danger",
    );
  } else {
    forOwner(s, p, () =>
      (s.threatAttachments ??= []).push({ id, code, exhausted: false }),
    );
    log(
      s,
      `All is Lost is attached to ${deckOwner(s, p)} threat dial: each attack against a Reanimated Dead raises that threat by 1.`,
      "danger",
    );
  }
}

function ndrEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ndrLive(s) || !PLACED.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  attachPlaced(s, code);
  return true;
}

// ------------------------------------------------------------- the cards

/**
 * Power Beyond Death: "Daechanar gets +2 [defense]." Cursed Halls' shadow:
 * "Until the end of the phase, attacking enemy gets +1 [attack] and +1
 * [defense] for each Reanimated Dead engaged with you."
 */
function ndrStats(s: GameState, u: Unit) {
  if (!ndrLive(s)) return {};
  let attack = 0,
    defense = 0;
  if (u.code === D.daechanar && !u.blanked)
    defense +=
      2 *
      allQuestUnits(s)
        .flatMap((q) => q.attachments)
        .filter((a) => a.code === N.powerBeyond && !a.blanked).length;
  for (const h of activeHalls(s))
    if (h.enemy === u.id) {
      const n = reanimatedEngaged(s, h.player);
      attack += n;
      defense += n;
    }
  return attack || defense ? { attack, defense } : {};
}

/**
 * Necromancer of Carn Dûm: "Forced: When Necromancer of Carn Dûm would attack
 * you, instead reanimate the top card of your deck and deal it each of the
 * Necromancer of Carn Dûm's shadow cards." Its attack is replaced before a
 * defender is declared; the new Reanimated Dead attacks later this step.
 */
function ndrBeforeNormalDefense(s: GameState, enemy: Unit) {
  if (!ndrLive(s) || !live(s, enemy, N.necromancer)) return false;
  const player = activeSeat(s);
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: player,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  };
  prepend(
    s,
    fx("ndrNecromancer", { target: enemy.id, player }),
    fx("enemyDone", { flag: true }),
  );
  return true;
}

/**
 * Silent Guardian: "While you are engaged with Silent Guardian it gains:
 * 'Forced: The first time you play an event card each round, instead of
 * discarding that card after playing it, reanimate it.'"
 */
function ndrEventPlayed(s: GameState, u: Unit) {
  if (!ndrLive(s)) return;
  const p = activeSeat(s),
    q = (s.nightmare ??= {});
  const rounds = (q.dreadEventRounds ??= {});
  if (rounds[p] === s.round) return;
  rounds[p] = s.round;
  q.dreadGuardianEvents = (q.dreadGuardianEvents ?? []).filter(
    (e) => e.round === s.round,
  );
  if (seatView(s, p).engaged.some((e) => live(s, e, N.guardian)))
    q.dreadGuardianEvents.push({ id: u.id, round: s.round });
  if (!q.dreadGuardianEvents.length) delete q.dreadGuardianEvents;
}
function ndrEventDestination(s: GameState, u: Unit, player: number) {
  const q = s.nightmare;
  const i = q?.dreadGuardianEvents?.findIndex((e) => e.id === u.id) ?? -1;
  if (!ndrLive(s) || i < 0) return false;
  q!.dreadGuardianEvents!.splice(i, 1);
  if (!q!.dreadGuardianEvents!.length) delete q!.dreadGuardianEvents;
  const owner = u.owner ?? player;
  dreadReanimate(s, { ...u, owner }, player);
  log(
    s,
    `Silent Guardian: ${card(u.code).name} is reanimated instead of being discarded${seatLabel(s, player)}.`,
    "danger",
  );
  return true;
}

/**
 * Daechanar's Curse: "The next time a player would draw 1 or more cards from
 * attached deck, reanimate those cards instead. Then, discard Daechanar's
 * Curse." One copy answers each draw.
 */
function ndrDrawReplaced(
  s: GameState,
  count: number,
  _cardEffect: boolean,
  fromBottom: boolean,
) {
  if (!ndrLive(s)) return false;
  const p = activeSeat(s),
    q = s.nightmare;
  const curse = q?.dreadCurses?.find((c) => c.player === p);
  if (!curse) return false;
  const n = Math.min(count, s.deck.length);
  for (let i = 0; i < n; i++)
    dreadReanimate(s, takePlayerDeck(s, fromBottom ? s.deck.length - 1 : 0), p);
  q!.dreadCurses = q!.dreadCurses!.filter((c) => c !== curse);
  if (!q!.dreadCurses.length) delete q!.dreadCurses;
  s.encounterDiscard.push(N.daechanarCurse);
  log(
    s,
    `Daechanar's Curse: ${n === 1 ? "the card" : `the ${n} cards`} ${s.table ? `${seatName(s, p)} would draw are` : "you would draw are"} reanimated instead, and the Curse is discarded.`,
    "danger",
  );
  return true;
}

/** All is Lost: "Each time you attack a Reanimated Dead, raise your threat by 1." */
function ndrPlayerAttackDeclared(s: GameState, enemy: Unit) {
  if (!ndrLive(s) || enemy.code !== D.reanimated) return true;
  const n = (s.threatAttachments ?? []).filter(
    (a) => a.code === N.allIsLost && !a.blanked,
  ).length;
  if (n) {
    raiseThreat(s, n, "encounter");
    log(
      s,
      `All is Lost: attacking a Reanimated Dead raises ${s.table ? `${seatName(s, activeSeat(s))}'s` : "your"} threat by ${n}.`,
      "danger",
    );
  }
  return true;
}

/** Cursed Halls: "While Cursed Halls is in the staging area, Sorcery attachments are immune to player card effects." */
function ndrAttachmentImmune(
  s: GameState,
  _host: Unit,
  a: { code: string },
  source?: string,
) {
  if (
    !ndrLive(s) ||
    !source ||
    card(source).sphere_code === "encounter" ||
    !sorcery(a.code) ||
    !s.staging.some((u) => live(s, u, N.cursedHalls))
  )
    return false;
  log(
    s,
    `Cursed Halls: ${card(a.code).name} is immune to player card effects.`,
  );
  return true;
}

/** Inner Sanctum: "Travel: Discard the top 3 cards of the encounter deck. Resolve the 'when revealed' effects of each Sorcery card discarded by this effect." */
function ndrTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!ndrLive(s) || !live(s, u, N.sanctum)) return undefined;
  return [fx("ndrSanctum", { player: firstPlayer(s) })];
}

/** The Witch-king's Gift: "Time 5." */
export const dreadSideTime = (code: string) => (code === N.gift ? 5 : 0);
function ndrCardEntered(s: GameState, u: Unit) {
  if (ndrLive(s) && live(s, u, N.gift) && s.staging.some((x) => x.id === u.id))
    u.timeCounters = dreadSideTime(u.code);
}
function ndrRefreshEndForced(s: GameState): Effect[] {
  if (!ndrLive(s)) return [];
  return s.staging
    .filter((u) => live(s, u, N.gift) && (u.timeCounters ?? 0) > 0)
    .map((u) => fx("ndrGiftTime", { target: u.id, player: firstPlayer(s) }));
}
/** The Witch-king's Gift: "When this quest is defeated, place it in the encounter discard pile." */
function ndrSideQuestDestination(s: GameState, u: Unit) {
  if (!ndrLive(s) || !live(s, u, N.gift)) return false;
  s.encounterDiscard.push(u.code);
  log(
    s,
    "The Witch-king's Gift defeated · Placed in the encounter discard pile.",
    "good",
  );
  return true;
}

function ndrShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ndrLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Cursed Halls: "Until the end of the phase, attacking enemy gets +1
    // [attack] and +1 [defense] for each Reanimated Dead engaged with you."
    case N.cursedHalls: {
      const q = (s.nightmare ??= {}),
        player = defendingPlayer(s);
      q.dreadHalls = [
        ...activeHalls(s),
        { enemy: c.enemyId, player, round: s.round, phase: phaseKey(s) },
      ];
      const n = reanimatedEngaged(s, player);
      log(
        s,
        `Cursed Halls: until the end of the phase, ${enemy ? name(enemy) : "the attacker"} gets +1 [attack] and +1 [defense] for each Reanimated Dead engaged with ${s.table ? seatName(s, player) : "you"} (${n} now).`,
        "danger",
      );
      return true;
    }
    // Power Beyond Death: "If this attack destroys a character, resolve this
    // card's 'when revealed' effect."
    case N.powerBeyond:
      c.nmPowerOnKill = (c.nmPowerOnKill ?? 0) + 1;
      log(
        s,
        "Power Beyond Death: if this attack destroys a character, it attaches to the main quest.",
        "danger",
      );
      return true;
    // All is Lost: "If attacking enemy is a Reanimated Dead, it attacks again
    // after this attack."
    case N.allIsLost:
      if (enemy?.code === D.reanimated && !enemy.blanked) {
        c.nmAttackAgain = (c.nmAttackAgain ?? 0) + 1;
        log(
          s,
          "All is Lost: the Reanimated Dead attacks again after this attack.",
          "danger",
        );
      } else log(s, "All is Lost: the attacker is not a Reanimated Dead.");
      return true;
  }
  return false;
}
function ndrCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (
    ndrLive(s) &&
    c &&
    isCharacter(u) &&
    ctx.combatDamage &&
    ctx.enemyId === c.enemyId
  )
    c.nmDestroyed = true;
}
function ndrAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!ndrLive(s)) return [];
  const effects: Effect[] = [];
  if (combat.nmDestroyed)
    for (let i = 0; i < (combat.nmPowerOnKill ?? 0); i++)
      effects.push(
        fx("ndrPowerShadow", {
          target: combat.enemyId,
          player: firstPlayer(s),
        }),
      );
  const enemy = get(s, combat.enemyId);
  if (enemy)
    for (let i = 0; i < (combat.nmAttackAgain ?? 0); i++)
      effects.push(
        fx("immediateAttack", {
          target: enemy.id,
          player: combat.attackPlayer ?? ownerOf(s, enemy),
        }),
      );
  return effects;
}
/** Cursed Halls' combat phase bonuses end with the phase. */
function ndrCombatEnd(s: GameState) {
  const q = s.nightmare;
  if (!q?.dreadHalls) return;
  q.dreadHalls = q.dreadHalls.filter(
    (h) => h.round === s.round && h.phase !== "combat",
  );
  if (!q.dreadHalls.length) delete q.dreadHalls;
}

// ------------------------------------------------------------- effects

export function nightmareDreadEffect(s: GameState, e: Effect): boolean {
  // The scenario resolves a discarded Sorcery card's 'when revealed' effect
  // (Sinister Dungeon's shadow): the Nightmare Deck's attach themselves.
  if (e.kind === "dreadDiscardSorcery" && e.code && PLACED.includes(e.code)) {
    ndrEncounter(s, e.code, true, true);
    return true;
  }
  if (!e.kind.startsWith("ndr")) return false;
  if (!ndrLive(s)) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "ndrNecromancer": {
      const p = e.player ?? activeSeat(s);
      if (!u) return true;
      let dead: Unit | undefined;
      forOwner(s, p, () => {
        if (s.deck.length) dead = dreadReanimate(s, takePlayerDeck(s), p);
      });
      if (!dead) {
        log(
          s,
          `Necromancer of Carn Dûm does not attack: ${s.table ? `${seatName(s, p)}'s` : "your"} deck is empty, so nothing is reanimated.`,
        );
        return true;
      }
      const moved = u.shadows.length;
      dead.shadows.push(...u.shadows);
      if (u.faceupShadows || dead.faceupShadows)
        dead.faceupShadows = [
          ...(dead.faceupShadows ?? []),
          ...(u.faceupShadows ?? Array<boolean>(moved).fill(false)),
        ];
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      log(
        s,
        `Necromancer of Carn Dûm does not attack: instead, the top card of ${s.table ? `${seatName(s, p)}'s` : "your"} deck is reanimated and dealt its ${moved} shadow card${moved === 1 ? "" : "s"}.`,
        "danger",
      );
      return true;
    }
    case "ndrSanctum": {
      const discarded: string[] = [];
      for (let i = 0; i < 3 && s.encounterDeck.length; i++) {
        const co = s.encounterDeck.shift()!;
        s.encounterDiscard.push(co);
        discarded.push(co);
      }
      const codes = discarded.filter(sorcery);
      log(
        s,
        `Inner Sanctum: the encounter deck discards ${discarded.map((co) => card(co).name).join(", ") || "nothing"}${codes.length ? `; ${codes.length} Sorcery 'when revealed' effect${codes.length === 1 ? "" : "s"} resolve` : ""}.`,
        codes.length ? "danger" : undefined,
      );
      order(
        s,
        codes.map((code) =>
          fx(PLACED.includes(code) ? "ndrSorcery" : "dreadDiscardSorcery", {
            code,
            player: firstPlayer(s),
          }),
        ),
        "Inner Sanctum · Choose the next Sorcery 'when revealed' effect",
      );
      return true;
    }
    case "ndrSorcery":
      if (e.code) ndrEncounter(s, e.code, true, true);
      return true;
    case "ndrPowerShadow": {
      let found = false;
      if (u) {
        const i = u.shadows.lastIndexOf(N.powerBeyond);
        if (i >= 0) found = !!removeShadowCard(u, i);
      }
      if (!found) {
        const i = s.encounterDiscard.lastIndexOf(N.powerBeyond);
        if (i >= 0) {
          s.encounterDiscard.splice(i, 1);
          found = true;
        }
      }
      if (found) {
        log(
          s,
          "Power Beyond Death: the attack destroyed a character, so its 'when revealed' effect resolves.",
          "danger",
        );
        attachPlaced(s, N.powerBeyond);
      }
      return true;
    }
    case "ndrGiftTime":
      if (
        !u ||
        !live(s, u, N.gift) ||
        !s.staging.some((x) => x.id === u.id) ||
        !(u.timeCounters ?? 0)
      )
        return true;
      u.timeCounters!--;
      log(
        s,
        `The Witch-king's Gift: a time counter is removed (${u.timeCounters} left).`,
        u.timeCounters ? undefined : "danger",
      );
      if (!u.timeCounters)
        prepend(s, fx("ndrGift", { target: u.id, player: firstPlayer(s) }));
      return true;
    // The Witch-king's Gift: "Forced: When the last time counter is removed
    // from this quest, reanimate each card in each player's discard pile.
    // Then, remove The Witch-king's Gift from the game."
    case "ndrGift": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      let total = 0;
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          while (s.discard.length) {
            dreadReanimate(
              s,
              takePlayerDiscard(s, s.discard.length - 1, {
                encounterEffect: true,
              }),
              p,
            );
            total++;
          }
        });
      s.staging = s.staging.filter((x) => x.id !== u.id);
      (s.removedEncounter ??= []).push(u.code);
      log(
        s,
        `The Witch-king's Gift: its last time counter is removed; ${total} card${total === 1 ? " is" : "s are"} reanimated from the players' discard piles, and the Gift is removed from the game.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_DREAD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: ndrStats,
  beforeNormalDefense: ndrBeforeNormalDefense,
  eventPlayed: ndrEventPlayed,
  eventDestination: ndrEventDestination,
  drawReplaced: ndrDrawReplaced,
  playerAttackDeclared: ndrPlayerAttackDeclared,
  attachmentImmune: ndrAttachmentImmune,
  travelEffects: ndrTravelEffects,
  cardEntered: ndrCardEntered,
  refreshEndForced: ndrRefreshEndForced,
  sideQuestDestination: ndrSideQuestDestination,
  characterDestroyed: ndrCharacterDestroyed,
  attackFinished: ndrAttackFinished,
  combatEnd: ndrCombatEnd,
  encounter: ndrEncounter,
  shadow: ndrShadow,
  effect: nightmareDreadEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareDread(s: GameState) {
  const q = s.nightmare;
  if (
    q?.dreadCurses === undefined &&
    q?.dreadEventRounds === undefined &&
    q?.dreadGuardianEvents === undefined &&
    q?.dreadHalls === undefined
  )
    return true;
  const seats = s.table?.seats.length ?? 1;
  const seat = (p: unknown) =>
    Number.isInteger(p) && (p as number) >= 0 && (p as number) < seats;
  const round = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    ndrLive(s) &&
    (q.dreadCurses === undefined ||
      (Array.isArray(q.dreadCurses) &&
        q.dreadCurses.every(
          (c) => !!c && typeof c.id === "string" && seat(c.player),
        ) &&
        new Set(q.dreadCurses.map((c) => c.id)).size ===
          q.dreadCurses.length)) &&
    (q.dreadEventRounds === undefined ||
      (!!q.dreadEventRounds &&
        typeof q.dreadEventRounds === "object" &&
        !Array.isArray(q.dreadEventRounds) &&
        Object.entries(q.dreadEventRounds).every(
          ([p, n]) => seat(Number(p)) && round(n),
        ))) &&
    (q.dreadGuardianEvents === undefined ||
      (Array.isArray(q.dreadGuardianEvents) &&
        q.dreadGuardianEvents.every(
          (e) => !!e && typeof e.id === "string" && round(e.round),
        ))) &&
    (q.dreadHalls === undefined ||
      (Array.isArray(q.dreadHalls) &&
        q.dreadHalls.every(
          (h) =>
            !!h &&
            typeof h.enemy === "string" &&
            seat(h.player) &&
            round(h.round) &&
            typeof h.phase === "string",
        )))
  );
}
