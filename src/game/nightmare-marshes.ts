/**
 * The Passage of the Marshes' Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (each location explored in the staging area raises each player's
 * threat by its Mire value) and its Nightmare encounter cards, composed with
 * the scenario's own rules (src/game/passage-marshes.ts) through
 * batch4Scenario while a Nightmare mode game is played. The Mire keyword of
 * its locations is the scenario's own (mireValue reads their text). Effects
 * use the "npm" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  random,
  spendResources,
  stats,
} from "./core";
import { discardHandCard, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import {
  fellowshipPayers,
  flipToGollum,
  lsGollum,
  lsSmeagol,
  searchOptions,
} from "./land-shadow-gollum";
import { POM, mireValue } from "./passage-marshes-support";
import { placeMire } from "./passage-marshes";
import { NIGHTMARE_LOS as L, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

const npmLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "the-passage-of-the-marshes" &&
  !!s.passageMarshes;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isUndeadCode = (c: string) =>
  card(c).type_code === "enemy" &&
  (card(c).traits ?? "").split(".").some((t) => t.trim() === "Undead");
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const their = (s: GameState) => (s.table ? "their" : "your");
/** The Mire X value of the active location (0 without one, or blanked). */
const activeMire = (s: GameState) => {
  const [location] = allActiveLocations(s);
  return location && !location.blanked ? mireValue(location.code) : 0;
};
const fellowshipResources = (s: GameState) =>
  fellowshipPayers(s).reduce((n, u) => n + u.resources, 0);

// ------------------------------------------------------------- the setup card

/**
 * The setup card: "Forced: When a location in the staging area is explored,
 * raise each player's threat by X, where X is that location's Mire value."
 */
function npmExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (!npmLive(s) || wasActive || card(u.code).type_code !== "location") return;
  const x = u.blanked ? 0 : mireValue(u.code);
  if (!x) return;
  log(
    s,
    `The Passage of the Marshes: ${name(u)} was explored in the staging area, so each player raises ${their(s)} threat by ${x} (its Mire value).`,
    "danger",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("pomThreat", {
        value: x,
        text: "The Passage of the Marshes",
        player,
      }),
    ),
  );
}

// ------------------------------------------------------------- the cards

/**
 * The locations' travel costs: Festering Mire "Each player discards 1 random
 * card from his hand", Candle-lit Pool "Spend 2 [fellowship] resources",
 * Great Reed Thicket "Exhaust Sméagol".
 */
function npmTravelProblem(s: GameState, u: Unit) {
  if (!npmLive(s) || u.blanked) return null;
  if (u.code === L.festering)
    return playerOrder(s).every((p) => seatView(s, p).hand.length)
      ? null
      : "Festering Mire: each player discards 1 random card from their hand to travel here.";
  if (u.code === L.candle)
    return fellowshipResources(s) >= 2
      ? null
      : "Candle-lit Pool: spend 2 Fellowship resources to travel here.";
  if (u.code === L.thicket) {
    const smeagol = lsSmeagol(s);
    return smeagol && !smeagol.exhausted
      ? null
      : "Great Reed Thicket: exhaust Sméagol to travel here.";
  }
  return null;
}
function npmTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!npmLive(s) || u.blanked) return undefined;
  if (u.code === L.festering)
    return playerOrder(s).map((player) =>
      fx("npmRandomDiscard", { text: "Festering Mire", player }),
    );
  if (u.code === L.candle)
    return [
      fx("npmSpendFellowship", {
        value: 2,
        text: "Candle-lit Pool",
        player: firstPlayer(s),
      }),
    ];
  if (u.code === L.thicket)
    return [
      fx("pomExhaustSmeagol", {
        text: "Great Reed Thicket",
        player: firstPlayer(s),
      }),
    ];
  return undefined;
}
/** The locations' Forced effects when the Mire keyword discards them. */
function mireForced(s: GameState, code: string) {
  const first = firstPlayer(s);
  switch (code) {
    // Festering Mire: "each player discards his hand."
    case L.festering:
      log(s, "Festering Mire: each player discards their hand.", "danger");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("npmDiscardHand", { player })),
      );
      return true;
    // Candle-lit Pool: "each player searches the encounter deck and discard
    // pile for an Undead enemy and puts it into play engaged with him."
    case L.candle:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("npmUndeadSearch", { player })),
        fx("pomShuffle", { text: "Candle-lit Pool", player: first }),
      );
      return true;
    // Great Reed Thicket: "either flip Sméagol to Gollum, or Gollum makes
    // an immediate attack."
    case L.thicket:
      prepend(s, fx("npmThicket", { player: first }));
      return true;
  }
  return false;
}

/** Pale Faces: "Forced: When Pale Faces attacks, raise your threat by 4." */
function npmEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (!npmLive(s)) return;
  if (live(s, enemy, L.pale)) {
    forOwner(s, player, () => raiseThreat(s, 4, "encounter"));
    log(
      s,
      `Pale Faces attacks: ${who(s, player)} ${s.table ? "raises" : "raise"} ${their(s)} threat by 4.`,
      "danger",
    );
  }
  // Gollum's Rage, dealt to Gollum facedown, resolves in his next attack,
  // an immediate attack included: it joins this attack's shadow cards.
  const c = s.combat;
  const previous = c?.immediatePreviousShadows;
  if (!c?.immediate || c.enemyId !== enemy.id || !previous?.length) return;
  const revealed = c.immediatePreviousRevealedShadowCount ?? 0;
  for (let i = previous.length - 1; i >= revealed; i--)
    if (previous[i] === L.rage) {
      previous.splice(i, 1);
      c.immediatePreviousFaceupShadows?.splice(i, 1);
      enemy.shadows.push(L.rage);
      enemy.faceupShadows?.push(false);
    }
}

function npmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !npmLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Pale Faces: "Attacking enemy gets +X [attack], where X is the Mire X
    // value of the active location."
    case L.pale: {
      const x = activeMire(s);
      c.attackBonus += x;
      log(
        s,
        x
          ? `Pale Faces: the attacking enemy gets +${x} [attack] (the active location's Mire value).`
          : "Pale Faces: the active location has no Mire value.",
        x ? "danger" : undefined,
      );
      return true;
    }
    // Rot and Vapors: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, place 1 mire token on the active location."
    case L.rot:
      c.attackBonus += 1;
      c.nmMireOnKill = (c.nmMireOnKill ?? 0) + 1;
      log(
        s,
        "Rot and Vapors: the attacking enemy gets +1 [attack]; if this attack destroys a character, 1 mire token is placed on the active location.",
        "danger",
      );
      return true;
    // Gollum's Rage: "If attacking enemy is Gollum, it gets +1 [attack] and
    // makes an additional attack against you after this one."
    case L.rage:
      if (enemy && enemy.code === POM.gollum && !enemy.blanked) {
        c.attackBonus += 1;
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          "Gollum's Rage: Gollum gets +1 [attack] and makes an additional attack after this one.",
          "danger",
        );
      } else log(s, "Gollum's Rage: the attacking enemy is not Gollum.");
      return true;
  }
  return false;
}

function npmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!npmLive(s) || (code !== L.rot && code !== L.rage)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Rot and Vapors: "Each player must choose: either raise your threat by 1
  // for each questing character you control, or deal 1 damage to each
  // character you control."
  if (code === L.rot) {
    s.encounterDiscard.push(code);
    prepend(s, ...playerOrder(s).map((player) => fx("npmRot", { player })));
    return true;
  }
  // Gollum's Rage: "Deal Gollum's Rage to Gollum as a facedown shadow card,
  // if able."
  const gollum = lsGollum(s);
  if (!gollum) {
    s.encounterDiscard.push(code);
    log(s, "Gollum's Rage: Gollum is not in play, so it is discarded.");
    return true;
  }
  gollum.shadows.push(code);
  gollum.faceupShadows?.push(false);
  log(
    s,
    "Gollum's Rage is dealt to Gollum as a facedown shadow card.",
    "danger",
  );
  return true;
}

/** Rot and Vapors' shadow: 1 mire token on the active location after a kill. */
function npmCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (
    !npmLive(s) ||
    !c ||
    !isCharacter(u) ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId
  )
    return;
  c.nmDestroyed = true;
  if (!c.nmMireOnKill) return;
  const n = c.nmMireOnKill;
  delete c.nmMireOnKill;
  prepend(
    s,
    fx("npmMire", {
      value: n,
      text: "Rot and Vapors' shadow",
      player: firstPlayer(s),
    }),
  );
}
/** Rotting Thing: the excess points of damage of its attack. */
function npmDamageDealt(
  s: GameState,
  u: Unit,
  _amount: number,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (
    !npmLive(s) ||
    !c ||
    !isCharacter(u) ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId
  )
    return;
  const enemy = get(s, c.enemyId);
  if (!enemy || !live(s, enemy, L.rotting)) return;
  c.nmExcess = (c.nmExcess ?? 0) + Math.max(0, u.damage - stats(s, u).health);
}
/**
 * Rotting Thing: "Forced: After Rotting Thing attacks and destroys a
 * character, place 1 mire token on the active location for each excess
 * point of damage."
 */
function npmAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!npmLive(s) || !combat.nmDestroyed || !combat.nmExcess) return [];
  const enemy = get(s, combat.enemyId);
  return enemy && live(s, enemy, L.rotting)
    ? [
        fx("npmMire", {
          value: combat.nmExcess,
          text: "Rotting Thing",
          player: firstPlayer(s),
        }),
      ]
    : [];
}
/** Rotting Thing: "Cannot have attachments." */
const npmCannotAttach = (s: GameState, u: Unit) =>
  npmLive(s) && live(s, u, L.rotting);

// ------------------------------------------------------------- effects

export function nightmareMarshesEffect(s: GameState, e: Effect): boolean {
  // The scenario's Mire keyword discarded one of the Nightmare locations.
  if (e.kind === "pomMireForced" && npmLive(s) && e.code)
    return mireForced(s, e.code);
  if (!e.kind.startsWith("npm")) return false;
  if (!npmLive(s)) return true;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "npmRandomDiscard": {
      if (!s.hand.length) return true;
      const u = s.hand[Math.floor(random(s) * s.hand.length)];
      discardHandCard(s, u.id, { encounterEffect: true });
      log(
        s,
        `${e.text}: ${who(s, p)} ${s.table ? "discards" : "discard"} ${card(u.code).name} at random to travel there.`,
      );
      return true;
    }
    case "npmDiscardHand": {
      const ids = s.hand.map((u) => u.id);
      for (const id of ids)
        if (s.hand.some((u) => u.id === id))
          discardHandCard(s, id, { encounterEffect: true });
      if (ids.length)
        log(
          s,
          `Festering Mire: ${who(s, p)} ${s.table ? "discards" : "discard"} ${ids.length} card${ids.length === 1 ? "" : "s"} from ${their(s)} hand.`,
          "danger",
        );
      return true;
    }
    case "npmSpendFellowship": {
      let left = e.value ?? 0;
      for (const payer of fellowshipPayers(s)) {
        if (left <= 0) break;
        const n = Math.min(left, payer.resources);
        forOwner(s, ownerOf(s, payer), () => spendResources(s, payer, n));
        left -= n;
      }
      log(
        s,
        `${e.value} Fellowship resource${e.value === 1 ? " is" : "s are"} spent to travel to ${e.text}.`,
      );
      return true;
    }
    case "npmUndeadSearch": {
      const options = searchOptions(s, isUndeadCode, "pomUndeadEngage", p);
      if (!options.length) {
        log(
          s,
          `Candle-lit Pool: ${who(s, p)} ${s.table ? "finds" : "find"} no Undead enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `Candle-lit Pool · Put an Undead enemy into play engaged with you${seatLabel(s, p)}`,
        options,
        "Forced: When Candle-lit Pool is discarded by the Mire keyword, each player searches the encounter deck and discard pile for an Undead enemy and puts it into play engaged with him.",
      );
      return true;
    }
    case "npmThicket": {
      // A single legal option, as We Hates Them! resolves: Sméagol flips if
      // he is in play, otherwise Gollum attacks.
      if (lsSmeagol(s)) {
        flipToGollum(s, "Great Reed Thicket");
        return true;
      }
      const gollum = lsGollum(s);
      if (!gollum) {
        log(s, "Great Reed Thicket: neither Sméagol nor Gollum is in play.");
        return true;
      }
      log(s, "Great Reed Thicket: Gollum makes an immediate attack.", "danger");
      prepend(
        s,
        fx("immediateAttack", {
          target: gollum.id,
          player: ownerOf(s, gollum),
        }),
      );
      return true;
    }
    case "npmRot": {
      const mine = [...s.heroes, ...s.allies];
      const questing = mine.filter((x) => x.committed);
      choose(
        s,
        `Rot and Vapors · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise your threat by ${questing.length} (1 for each questing character you control)`,
            effects: [
              fx("pomThreat", {
                value: questing.length,
                text: "Rot and Vapors",
                player: p,
              }),
            ],
          },
          {
            id: "damage",
            label: `Deal 1 damage to each character you control (${mine.length})`,
            effects: mine.map((x) =>
              fx("damage", { target: x.id, value: 1, player: p }),
            ),
          },
        ],
        "When Revealed: Each player must choose: either raise your threat by 1 for each questing character you control, or deal 1 damage to each character you control.",
      );
      return true;
    }
    case "npmMire": {
      const [location] = allActiveLocations(s);
      if (!location || card(location.code).type_code !== "location") {
        log(s, `${e.text}: there is no active location.`);
        return true;
      }
      placeMire(s, [location], e.text ?? "Mire", e.value ?? 1);
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_MARSHES_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  explored: npmExplored,
  travelProblem: npmTravelProblem,
  travelEffects: npmTravelEffects,
  enemyAttackStarted: npmEnemyAttackStarted,
  characterDestroyed: npmCharacterDestroyed,
  damageDealt: npmDamageDealt,
  attackFinished: npmAttackFinished,
  cannotAttach: npmCannotAttach,
  encounter: npmEncounter,
  shadow: npmShadow,
  effect: nightmareMarshesEffect,
  sharedEffect: () => false,
};
