/**
 * The Lonely Mountain's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (the players cannot advance to stage 3 while a card is stacked
 * underneath The Lonely Mountain; Smaug the Magnificent cannot take damage
 * unless A Bare Patch is attached to him) and its Nightmare encounter cards,
 * composed with the scenario's own rules (src/game/lonely-mountain.ts)
 * through batch4Scenario while a Nightmare mode game is played. The scenario
 * builds its encounter deck with the setup card's removals and resolves the
 * Nightmare burgle effects through its own burgle attempts. Effects use the
 * "ntl" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { fx, get, log, prepend, random } from "./core";
import { discardHandCard, exhaustCharacter } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { heirsCanSpendResources } from "./heirs-numenor";
import { bagginsBilbo, spendBaggins } from "./hobbit-saga";
import { NIGHTMARE_OTD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { TLM } from "./lonely-mountain-support";

export interface NightmareTlmState {
  /** The Dragon's Ire: its attacks are resolving (characters they destroy give the Dragons progress). */
  tlmIre?: number;
  /** Southern Spur: the players who played an ally in this round's planning phase. */
  tlmAllies?: { round: number; players: number[] };
}

const tlLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-lonely-mountain";
const isDragon = (u: Unit) =>
  card(u.code).type_code === "enemy" &&
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Dragon");
/** "Each Dragon enemy in play." */
const dragons = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) => isDragon(u) && !u.blanked);
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code))
    .length;
const threatEach = (s: GameState, value: number) =>
  playerOrder(s).map((player) => fx("heirsThreat", { value, player }));

// ------------------------------------------------------------- the setup card

/** "While there is at least 1 card stacked underneath The Lonely Mountain, the players cannot advance to stage 3." */
const tlCannotAdvanceStage = (s: GameState, stage: number) =>
  tlLive(s) && stage === 3 && (s.lonelyMountain?.stack.length ?? 0) > 0;
/** "Smaug the Magnificent cannot take damage unless A Bare Patch is attached to him." */
function tlDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !tlLive(s) ||
    amount <= 0 ||
    u.code !== TLM.magnificent ||
    u.attachments.some((a) => a.code === TLM.patch && !a.blanked)
  )
    return amount;
  log(
    s,
    "Smaug the Magnificent cannot take damage unless A Bare Patch is attached to him (Nightmare mode).",
  );
  return 0;
}

// ------------------------------------------------------------- the cards

/** Erebor Bats: "Forced: When Erebor Bats attacks, the defending player discards 1 random card from his hand." */
function tlEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (tlLive(s) && live(s, enemy, N.ereborBats))
    prepend(s, fx("ntlBats", { player }));
}
/** Secret Tunnel: "Forced: After a player fails a burgle attempt, each player raises his threat by 2." */
function tlBurgleFailed(s: GameState) {
  const tunnels = tlLive(s) ? inPlay(s, N.tunnel) : 0;
  if (!tunnels) return;
  log(
    s,
    `Secret Tunnel: the burgle attempt failed; each player raises their threat by ${2 * tunnels}.`,
    "danger",
  );
  prepend(s, ...threatEach(s, 2 * tunnels));
}
/** Secret Tunnel: "Travel: Exhaust Bilbo Baggins and spend 1 [baggins] resource to travel here." */
function tlTravelProblem(s: GameState, u: Unit) {
  if (!tlLive(s) || !live(s, u, N.tunnel)) return null;
  const bilbo = bagginsBilbo(s);
  return bilbo &&
    !bilbo.exhausted &&
    bilbo.resources >= 1 &&
    heirsCanSpendResources(s, bilbo)
    ? null
    : "Travel to Secret Tunnel: exhaust Bilbo Baggins and spend 1 Baggins resource.";
}
const tlTravelEffects = (s: GameState, u: Unit) =>
  tlLive(s) && live(s, u, N.tunnel)
    ? [fx("ntlTunnelCost", { player: firstPlayer(s) })]
    : undefined;
/** Southern Spur: the allies played during the planning phase, by player. */
function tlAllyEntered(s: GameState, u: Unit, played: boolean) {
  if (!tlLive(s) || !played || s.phase !== "planning") return false;
  const q = (s.nightmare ??= {});
  const t =
    q.tlmAllies?.round === s.round
      ? q.tlmAllies
      : { round: s.round, players: [] };
  const p = ownerOf(s, u);
  if (!t.players.includes(p)) t.players.push(p);
  q.tlmAllies = t;
  return false;
}
/** Southern Spur: "Forced: At the end of the planning phase, each player who played at least 1 ally this phase must raise his threat by 1." */
function tlPlanningEnd(s: GameState) {
  const spurs = tlLive(s) ? inPlay(s, N.spur) : 0;
  const t = s.nightmare?.tlmAllies;
  const players =
    t?.round === s.round
      ? t.players.filter((p) => playerOrder(s).includes(p))
      : [];
  if (s.nightmare) delete s.nightmare.tlmAllies;
  if (!spurs || !players.length) return;
  log(
    s,
    `Southern Spur: each player who played an ally this phase raises their threat by ${spurs}.`,
    "danger",
  );
  prepend(
    s,
    ...players.map((player) => fx("heirsThreat", { value: spurs, player })),
  );
}
/**
 * Southern Spur's shadow: "If this attack destroys a character, raise each
 * player's threat by 3." The Dragon's Ire: "For each character that is
 * destroyed by one of these attacks, place 1 progress on each Dragon enemy
 * in play."
 */
function tlCharacterDestroyed(s: GameState, _u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (!tlLive(s) || !c || !ctx.combatDamage || ctx.enemyId !== c.enemyId)
    return;
  if (c.nmThreatOnKill) {
    const value = c.nmThreatOnKill;
    c.nmThreatOnKill = 0;
    log(
      s,
      `Southern Spur: the attack destroyed a character; each player raises their threat by ${value}.`,
      "danger",
    );
    prepend(s, ...threatEach(s, value));
  }
  const enemy = get(s, c.enemyId);
  if (s.nightmare?.tlmIre && enemy && isDragon(enemy))
    prepend(s, fx("ntlIreProgress", { player: firstPlayer(s) }));
}
/** The Front Gate: "Forced: When The Front Gate is explored, each Dragon enemy in play makes an attack against the first player." */
function tlExplored(s: GameState, u: Unit) {
  if (!tlLive(s) || !live(s, u, N.frontGate)) return;
  const first = firstPlayer(s);
  const attackers = dragons(s);
  log(
    s,
    `The Front Gate is explored: ${attackers.length ? attackers.map((d) => name(d)).join(" and ") : "no Dragon enemy"} attack${attackers.length === 1 ? "s" : ""} the first player.`,
    "danger",
  );
  // "Deal and resolve a shadow card for this attack."
  prepend(
    s,
    ...attackers.map((d) =>
      fx("immediateAttack", { target: d.id, player: first }),
    ),
  );
}

function tlEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!tlLive(s) || (code !== N.ire && code !== N.lust)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.ire) {
    // "Each Dragon enemy in play makes an immediate attack against each
    // player in turn order. Do not deal shadow cards for these attacks."
    const attackers = dragons(s);
    if (!attackers.length) {
      log(s, "The Dragon's Ire: no Dragon enemy is in play.");
      return true;
    }
    const q = (s.nightmare ??= {});
    q.tlmIre = (q.tlmIre ?? 0) + 1;
    prepend(
      s,
      ...playerOrder(s).flatMap((player) =>
        attackers.map((d) =>
          fx("immediateAttack", { target: d.id, player, noShadow: true }),
        ),
      ),
      fx("ntlIreDone", { player: firstPlayer(s) }),
    );
    return true;
  }
  // Lust for Treasure: "Each player raises his threat by 1 for each
  // attachment attached to a character he controls."
  for (const player of playerOrder(s)) {
    const v = seatView(s, player);
    const n = [...v.heroes, ...v.allies].reduce(
      (sum, u) => sum + u.attachments.length,
      0,
    );
    log(
      s,
      `Lust for Treasure: ${n} attachment${n === 1 ? "" : "s"}${seatLabel(s, player)}.`,
      n ? "danger" : undefined,
    );
    if (n) prepend(s, fx("heirsThreat", { value: n, player }));
  }
  return true;
}

function tlShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !tlLive(s) || code !== N.spur) return false;
  // Southern Spur: "Attacking enemy gets +2 [attack]. If this attack
  // destroys a character, raise each player's threat by 3."
  c.attackBonus += 2;
  c.nmThreatOnKill = (c.nmThreatOnKill ?? 0) + 3;
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareTlmEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ntl")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "ntlBats":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const u = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `Erebor Bats: ${name(u)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, u.id, { encounterEffect: true });
      });
      return true;
    case "ntlTunnelCost": {
      const bilbo = bagginsBilbo(s);
      if (!bilbo || !exhaustCharacter(s, bilbo) || !spendBaggins(s, 1))
        log(
          s,
          "Secret Tunnel: Bilbo Baggins cannot pay the travel cost.",
          "danger",
        );
      else
        log(
          s,
          "Secret Tunnel: Bilbo Baggins exhausts and spends 1 Baggins resource.",
        );
      return true;
    }
    case "ntlIreProgress":
      // "Place 1 progress on each Dragon enemy in play." Smaug the Golden's
      // progress follows the scenario's rule (his 6th advances to stage 4A).
      for (const d of dragons(s))
        if (d.code === TLM.golden)
          prepend(
            s,
            fx("tlmSmaugProgress", {
              value: 1,
              text: "The Dragon's Ire",
              player: p,
            }),
          );
        else {
          d.progress += 1;
          log(s, `The Dragon's Ire: 1 progress is placed on ${name(d)}.`);
        }
      return true;
    case "ntlIreDone": {
      const q = s.nightmare;
      if (q?.tlmIre) {
        q.tlmIre -= 1;
        if (!q.tlmIre) delete q.tlmIre;
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_TLM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotAdvanceStage: tlCannotAdvanceStage,
  damageAmount: tlDamageAmount,
  enemyAttackStarted: tlEnemyAttackStarted,
  burgleFailed: tlBurgleFailed,
  travelProblem: tlTravelProblem,
  travelEffects: tlTravelEffects,
  allyEntered: (s, u, played) => tlAllyEntered(s, u, played),
  planningEnd: tlPlanningEnd,
  characterDestroyed: tlCharacterDestroyed,
  explored: tlExplored,
  encounter: tlEncounter,
  shadow: tlShadow,
  effect: nightmareTlmEffect,
  sharedEffect: (e) =>
    ["ntlTunnelCost", "ntlIreProgress", "ntlIreDone"].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareTlm(s: GameState) {
  const q = s.nightmare;
  const t = q?.tlmAllies;
  const seats = s.table?.seats.length ?? 1;
  return (
    (q?.tlmIre === undefined || (Number.isInteger(q.tlmIre) && q.tlmIre > 0)) &&
    (t === undefined ||
      (!!t &&
        Number.isInteger(t.round) &&
        t.round >= 0 &&
        Array.isArray(t.players) &&
        t.players.every((p) => Number.isInteger(p) && p >= 0 && p < seats)))
  );
}
