/**
 * Intruders in Chetwood's Nightmare Deck (docs/NIGHTMARE.md): its Nightmare
 * encounter cards (the setup card has no rule beyond the removals), composed
 * with the scenario's own rules (src/game/chetwood.ts) through batch4Scenario
 * while a Nightmare mode game is played. The scenario's encounter side
 * quests, its returns to the staging area and its after-attack effects serve
 * the Nightmare cards. Effects use the "nch" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  enemyAttackPrevented,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
} from "./core";
import {
  discardHandCard,
  enemyAddedToStaging,
  raiseThreat,
  revealed,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { angmarPhase } from "./angmar-campaign-boost";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import { who } from "./black-riders-hunted";
import { CHETWOOD as C } from "./chetwood-support";
import { NIGHTMARE_TLR as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareChetwoodState {
  /** Protect the Bree-landers: copies that took progress during a round's quest phase. */
  chetwoodBree?: { id: string; round: number }[];
}

type Combat = NonNullable<GameState["combat"]>;
type Zone = "deck" | "discard" | "victory";

const chLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "intruders-in-chetwood";
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const ownCharacters = (s: GameState, p: number) =>
  allCharacters(s).filter(
    (u) => (isHero(u) || isAlly(u)) && ownerOf(s, u) === p,
  );
const ZONE: Record<Zone, string> = {
  deck: "encounter deck",
  discard: "encounter discard pile",
  victory: "victory display",
};

// ------------------------------------------------------------- the cards

/** Shadow the War Party: "Each copy of Orc War Party cannot be engaged, cannot be dealt damage, and gets +2 [threat]." */
const shadowCopies = (s: GameState, u: Unit) =>
  chLive(s) && u.code === C.party ? staged(s, N.shadowParty).length : 0;
const chCannotEngage = (s: GameState, u: Unit) => shadowCopies(s, u) > 0;
const chDamageAmount = (s: GameState, u: Unit, amount: number) =>
  shadowCopies(s, u) > 0 ? 0 : amount;
const chThreatBonus = (s: GameState, u: Unit) => 2 * shadowCopies(s, u);

/** "Search the encounter deck, discard pile and victory display for X": the zone holding a copy, the encounter deck first. */
function zoneOf(s: GameState, code: string): Zone | undefined {
  if (s.encounterDeck.includes(code)) return "deck";
  if (s.encounterDiscard.includes(code)) return "discard";
  if ((s.victoryCards ?? []).includes(code)) return "victory";
  return undefined;
}
/** A copy taken from its zone (a card leaving the victory display takes its points along). */
function takeCopy(s: GameState, code: string) {
  const zone = zoneOf(s, code);
  if (zone === "deck") s.encounterDeck.splice(s.encounterDeck.indexOf(code), 1);
  else if (zone === "discard")
    s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(code), 1);
  else if (zone === "victory") {
    s.victoryCards!.splice(s.victoryCards!.indexOf(code), 1);
    s.victory = Math.max(0, s.victory - (card(code).victory ?? 0));
  }
  return zone;
}
const search = (
  s: GameState,
  code: string,
  source: string,
  extra: Partial<Effect> = {},
) =>
  fx("nchReveal", {
    code,
    source,
    player: firstPlayer(s),
    text: `${card(source).name} · Search for ${card(code).name}`,
    ...extra,
  });

/**
 * Orc Abductor: "Forced: At the end of the round, if Orc Abductor is in the
 * staging area, search ... for Rescue Iârion, and reveal it. Shuffle the
 * encounter deck." Greenway Path: "Forced: At the end of the round, if
 * Greenway Path is in the staging area, search ... for Shadow the War Party,
 * and reveal it." The first player orders them.
 */
function chRoundEnd(s: GameState): Effect[] {
  if (!chLive(s)) return [];
  const effects = s.staging.flatMap((u) =>
    live(s, u, N.abductor)
      ? [search(s, C.rescue, N.abductor, { target: u.id, flag: true })]
      : live(s, u, N.greenway)
        ? [search(s, N.shadowParty, N.greenway, { target: u.id, flag: true })]
        : [],
  );
  return effects.length > 1
    ? [
        fx("fangornOrder", {
          effects,
          player: firstPlayer(s),
          text: "Choose the next end-of-round Forced effect",
        }),
      ]
    : effects;
}
/** Protect the Bree-landers: progress placed on it during the quest phase. */
function chQuestProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (
    amount <= 0 ||
    !chLive(s) ||
    !live(s, quest, N.protect) ||
    angmarPhase(s.phase) !== "quest"
  )
    return;
  const q = (s.nightmare ??= {});
  q.chetwoodBree = [
    ...(q.chetwoodBree ?? []).filter(
      (x) => x.round === s.round && x.id !== quest.id,
    ),
    { id: quest.id, round: s.round },
  ];
}
/**
 * Protect the Bree-landers: "Forced: At the end of the quest phase, if no
 * progress was placed on Protect the Bree-landers, place 1 resource on it.
 * Then, raise each player's threat by the number of resources on Protect the
 * Bree-landers."
 */
function chEndQuest(s: GameState) {
  if (!chLive(s)) return;
  const placed = s.nightmare?.chetwoodBree ?? [];
  prepend(
    s,
    ...staged(s, N.protect)
      .filter((u) => !placed.some((x) => x.id === u.id && x.round === s.round))
      .map((u) => fx("nchBree", { target: u.id, player: firstPlayer(s) })),
  );
}
/** Northern Chetwood: "Forced: After progress is placed on Northern Chetwood (and it is still in play), search ... for Lost in the Wilderness, and reveal it." */
function chLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (amount > 0 && chLive(s) && live(s, u, N.northern))
    prepend(s, search(s, C.wilderness, N.northern, { target: u.id }));
}
/** Outskirts of Archet: "Travel: Search ... for Protect the Bree-landers, and reveal it." */
const chTravelEffects = (s: GameState, u: Unit) =>
  chLive(s) && live(s, u, N.outskirts)
    ? [search(s, N.protect, N.outskirts)]
    : undefined;
/** Outskirts of Archet's shadow: "If this attack destroys a character, raise your threat by 3." */
function chCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  const c = s.combat;
  if (
    !chLive(s) ||
    !c?.nmThreatOnKill ||
    !(isHero(u) || isAlly(u)) ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId
  )
    return;
  const value = c.nmThreatOnKill;
  c.nmThreatOnKill = 0;
  prepend(
    s,
    fx("nchThreat", {
      value,
      code: N.outskirts,
      player: c.attackPlayer ?? activeSeat(s),
    }),
  );
}
/**
 * Soldier of Angmar: "Forced: After Soldier of Angmar attacks and destroys an
 * ally, search ... for Orc Ambush and reveal it. Shuffle the encounter deck."
 * Northern Chetwood's shadow resolves after the attack.
 */
function chAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!chLive(s) || skipped) return [];
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const out: Effect[] = [];
  if (enemy && live(s, enemy, N.soldier) && c.chetwoodAllyKilled)
    out.push(search(s, C.ambush, N.soldier));
  // Northern Chetwood: "Discard 1 card at random from your hand for each
  // point of damage dealt by this attack."
  if (c.nmDiscardPerDamage && (c.damageDealt ?? 0) > 0)
    out.push(
      fx("nchDiscard", {
        count: c.nmDiscardPerDamage * c.damageDealt!,
        code: N.northern,
        player: p,
      }),
    );
  return out;
}

const TREACHERIES: readonly string[] = [N.greatHost, N.killThem];
function chEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!chLive(s) || ![...TREACHERIES, N.shadowParty].includes(code))
    return false;
  const p = firstPlayer(s);
  if (code === N.shadowParty) {
    // Shadow the War Party: "When Revealed: Return each engaged Orc War
    // Party to the staging area."
    if (!fromReveal) return true;
    const parties = allEngaged(s).filter((u) => u.code === C.party);
    if (parties.length)
      log(
        s,
        `Shadow the War Party: ${parties.length} engaged Orc War Part${parties.length === 1 ? "y returns" : "ies return"} to the staging area.`,
        "danger",
      );
    prepend(
      s,
      ...parties.map((u) =>
        fx("chetReturn", { target: u.id, player: ownerOf(s, u) }),
      ),
    );
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.greatHost) {
    // A Great Host: "Each player returns each enemy engaged with him to the
    // staging area. Either ... or ... Shuffle the encounter deck."
    const engaged = allEngaged(s);
    if (engaged.length)
      log(
        s,
        `A Great Host: ${engaged.length} engaged ${engaged.length === 1 ? "enemy returns" : "enemies return"} to the staging area.`,
        "danger",
      );
    prepend(
      s,
      ...engaged.map((u) =>
        fx("chetReturn", { target: u.id, player: ownerOf(s, u) }),
      ),
      fx("nchHost", { player: p }),
    );
    return true;
  }
  prepend(s, fx("nchKill", { player: p }));
  return true;
}

function chShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !chLive(s)) return false;
  switch (code) {
    // Orc Abductor: "Deal 1 damage to defending character."
    case N.abductor: {
      const defenders = c.defenderIds?.length
        ? c.defenderIds
        : c.defenderId
          ? [c.defenderId]
          : [];
      prepend(
        s,
        ...defenders.flatMap((target) => {
          const u = get(s, target);
          return u
            ? [fx("damage", { target, value: 1, player: ownerOf(s, u) })]
            : [];
        }),
      );
      return true;
    }
    // Soldier of Angmar: "Attacking enemy gets +2 [attack]."
    case N.soldier:
      c.attackBonus += 2;
      return true;
    // Northern Chetwood: "Discard 1 card at random from your hand for each
    // point of damage dealt by this attack."
    case N.northern:
      c.nmDiscardPerDamage = (c.nmDiscardPerDamage ?? 0) + 1;
      log(
        s,
        "Northern Chetwood: after this attack, a card is discarded at random from the defending player's hand for each point of damage it dealt.",
        "danger",
      );
      return true;
    // Outskirts of Archet: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, raise your threat by 3."
    case N.outskirts:
      c.attackBonus += 1;
      c.nmThreatOnKill = (c.nmThreatOnKill ?? 0) + 3;
      log(
        s,
        "Outskirts of Archet: the attacking enemy gets +1 [attack]; if this attack destroys a character, the defending player raises their threat by 3.",
        "danger",
      );
      return true;
    // Greenway Path: "Return attacking enemy to the staging area after this
    // attack." (The scenario's own return.)
    case N.greenway:
      c.chetwoodReturnAfterAttack = true;
      log(
        s,
        "Greenway Path: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareChetwoodEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nch")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nchReveal": {
      // A Forced effect's source must still be in play (in the staging
      // area, with the flag) when it resolves.
      if (
        e.target &&
        (!u || (e.flag && !s.staging.some((x) => x.id === e.target)))
      )
        return true;
      const code = e.code!,
        by = card(e.source!).name;
      const zone = takeCopy(s, code);
      shuffle(s, s.encounterDeck);
      if (!zone) {
        log(
          s,
          `${by}: ${card(code).name} is not in the encounter deck, discard pile or victory display.`,
        );
        return true;
      }
      log(
        s,
        `${by}: ${card(code).name} is revealed from the ${ZONE[zone]}.`,
        "danger",
      );
      revealed(s, code);
      return true;
    }
    case "nchBree": {
      if (!u || !live(s, u, N.protect) || !s.staging.some((x) => x.id === u.id))
        return true;
      u.resources += 1;
      log(
        s,
        `Protect the Bree-landers: no progress was placed on it this quest phase. It gets a resource (${u.resources}), and each player raises their threat by ${u.resources}.`,
        "danger",
      );
      for (const x of playerOrder(s))
        forOwner(s, x, () => raiseThreat(s, u.resources, "encounter"));
      return true;
    }
    case "nchHost": {
      // A Great Host: "Either search ... for Orc Rearguard and reveal it, or
      // each player must deal 4 damage to a character he controls. Shuffle
      // the encounter deck."
      const options: Option[] = [];
      if (zoneOf(s, C.rearguard))
        options.push({
          id: "rearguard",
          code: C.rearguard,
          label: `Search for Orc Rearguard and reveal it (${ZONE[zoneOf(s, C.rearguard)!]})`,
          effects: [search(s, C.rearguard, N.greatHost)],
        });
      if (playerOrder(s).some((x) => ownCharacters(s, x).length))
        options.push({
          id: "damage",
          label: `${playerOrder(s).length > 1 ? "Each player deals" : "Deal"} 4 damage to a character ${playerOrder(s).length > 1 ? "they control" : "you control"}`,
          effects: [
            ...playerOrder(s).map((x) =>
              fx("nchHurt", { value: 4, code: N.greatHost, player: x }),
            ),
            fx("nchShuffle", { player: p }),
          ],
        });
      if (!options.length) shuffle(s, s.encounterDeck);
      else if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          "A Great Host · Reveal Orc Rearguard, or deal 4 damage",
          options,
          card(N.greatHost).text,
        );
      return true;
    }
    case "nchHurt": {
      const value = e.value ?? 0;
      const targets = ownCharacters(s, p);
      if (!targets.length) {
        log(
          s,
          `${card(e.code!).name}: ${who(s, p)} control${s.table ? "s" : ""} no character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name}${seatLabel(s, p)} · Deal ${value} damage to a character you control`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("damage", { target: x.id, value, player: p })],
          })),
        ),
      );
      return true;
    }
    case "nchShuffle":
      shuffle(s, s.encounterDeck);
      return true;
    case "nchKill": {
      // Kill Them!: "Search the encounter deck, discard pile and victory
      // display for a copy of Orc War Party and add it to the staging area.
      // Shuffle the encounter deck."
      const zone = takeCopy(s, C.party);
      if (zone) {
        const party = make(s, C.party);
        s.staging.push(party);
        enemyAddedToStaging(s, party);
        log(
          s,
          `Kill Them!: an Orc War Party from the ${ZONE[zone]} is added to the staging area.`,
          "danger",
        );
      } else
        log(
          s,
          "Kill Them!: no Orc War Party is in the encounter deck, discard pile or victory display.",
        );
      shuffle(s, s.encounterDeck);
      // "Either remove all progress from the main quest, or each Orc War
      // Party in the staging area makes an immediate attack against the
      // player with the highest threat."
      const attackers = s.staging.filter(
        (x) => x.code === C.party && !enemyAttackPrevented(s, x),
      );
      const options: Option[] = [];
      if (s.progress > 0)
        options.push({
          id: "progress",
          code: C.quest,
          label: `Remove all progress from the main quest (${s.progress})`,
          effects: [fx("nchClear", { player: p })],
        });
      if (attackers.length)
        options.push({
          id: "attack",
          code: C.party,
          label: `${attackers.length === 1 ? "The Orc War Party attacks" : `Each Orc War Party (${attackers.length}) attacks`} the player with the highest threat`,
          effects: [
            fx("nchVictim", { ids: attackers.map((x) => x.id), player: p }),
          ],
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        choose(
          s,
          "Kill Them! · Remove the main quest's progress, or Orc War Party attacks",
          options,
          card(N.killThem).text,
        );
      return true;
    }
    case "nchClear": {
      const removed = s.progress;
      s.progress = 0;
      log(
        s,
        `Kill Them!: ${removed} progress is removed from the main quest.`,
        "danger",
      );
      return true;
    }
    case "nchVictim": {
      // The player with the highest threat (the first player chooses among
      // tied players).
      const order = playerOrder(s);
      const top = Math.max(...order.map((x) => effectiveThreat(s, x)));
      const tied = order.filter((x) => effectiveThreat(s, x) === top);
      const attack = (x: number) => fx("nchAttacks", { ids: e.ids, player: x });
      if (tied.length === 1) prepend(s, attack(tied[0]));
      else
        choose(
          s,
          "Kill Them! · Choose a player tied for the highest threat",
          tied.map((x) => ({
            id: `player-${x}`,
            label: `${seatName(s, x)} · ${top} threat`,
            effects: [attack(x)],
          })),
        );
      return true;
    }
    case "nchAttacks": {
      // Each Orc War Party still in the staging area attacks in turn.
      const [id, ...ids] = e.ids ?? [];
      if (!id) return true;
      const enemy = get(s, id);
      prepend(
        s,
        ...(enemy &&
        s.staging.some((x) => x.id === id) &&
        !enemyAttackPrevented(s, enemy)
          ? [fx("immediateAttack", { target: id, player: p })]
          : []),
        ...(ids.length ? [fx("nchAttacks", { ids, player: p })] : []),
      );
      return true;
    }
    case "nchThreat":
      log(
        s,
        `${card(e.code!).name}: this attack destroyed a character; ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${e.value}.`,
        "danger",
      );
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      return true;
    case "nchDiscard":
      forOwner(s, p, () => {
        for (let i = 0; i < (e.count ?? 0) && s.hand.length; i++) {
          const x = s.hand[Math.floor(random(s) * s.hand.length)];
          log(
            s,
            `${card(e.code!).name}: ${name(x)} is discarded at random${seatLabel(s, p)}.`,
            "danger",
          );
          discardHandCard(s, x.id, { encounterEffect: true });
        }
      });
      return true;
  }
  return false;
}

export const NIGHTMARE_CHETWOOD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  threatBonus: chThreatBonus,
  cannotEngage: chCannotEngage,
  damageAmount: chDamageAmount,
  roundEnd: chRoundEnd,
  endQuest: chEndQuest,
  questProgressPlaced: chQuestProgressPlaced,
  locationProgressPlaced: chLocationProgressPlaced,
  travelEffects: chTravelEffects,
  characterDestroyed: chCharacterDestroyed,
  attackFinished: chAttackFinished,
  encounter: chEncounter,
  shadow: chShadow,
  effect: nightmareChetwoodEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareChetwood(s: GameState) {
  const bree = s.nightmare?.chetwoodBree;
  return (
    bree === undefined ||
    (chLive(s) &&
      Array.isArray(bree) &&
      bree.every(
        (x) =>
          !!x &&
          typeof x.id === "string" &&
          Number.isInteger(x.round) &&
          x.round >= 0 &&
          x.round <= s.round,
      ))
  );
}
