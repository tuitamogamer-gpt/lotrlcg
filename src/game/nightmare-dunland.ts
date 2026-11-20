/**
 * The Dunland Trap's Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (printed removals only) and its Nightmare encounter cards, composed with
 * the scenario's own rules (src/game/dunland-trap.ts) through batch4Scenario
 * while a Nightmare mode game is played. The scenario's draw reactions,
 * shadow cards and Dunland enemies serve the Nightmare cards. Effects use the
 * "ndt" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random, stats } from "./core";
import { discardHandCard, engage, enemyAddedToStaging } from "./board";
import {
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  live,
  phaseKey,
  seatLabel,
  undefended,
} from "./nightmare-core";

export interface NightmareDunlandState {
  /** Boar Clan Assault: whether one of its immediate attacks has begun. */
  dunlandAssault?: boolean;
  /** Boar Clan Assault's shadow: +1 [attack] for these enemies until the end of the phase. */
  dunlandBoost?: { enemies: string[]; round: number; phase: string }[];
  /** Stalked by Dunlendings: copies resolved this round (the first player's hand size in [threat] each). */
  dunlandStalked?: { round: number; copies: number };
}

const dtLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-dunland-trap";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isDunland = (u: Unit) =>
  isEnemy(u) && /\bDunland\b/.test(card(u.code).traits ?? "");
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);

// ------------------------------------------------------------- the cards

/** Boar Clan Ambusher: "Forced: After Boar Clan Ambusher attacks and destroys a character, discard a random card from your hand." */
function dtEnemyAttackStarted(s: GameState, enemy: Unit) {
  if (!dtLive(s)) return;
  const q = s.nightmare;
  if (q?.dunlandAssault === false) q.dunlandAssault = true;
  if (live(s, enemy, N.ambusher) && s.combat?.enemyId === enemy.id)
    s.combat.nmHandDiscardOnKill = (s.combat.nmHandDiscardOnKill ?? 0) + 1;
}
/** Boar Clan Ambusher (and its shadow): a destroyed character costs the defending player a random card from hand, once for each copy. */
function dtCharacterDestroyed(s: GameState, u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (
    !dtLive(s) ||
    !c?.nmHandDiscardOnKill ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const copies = c.nmHandDiscardOnKill;
  c.nmHandDiscardOnKill = 0;
  const p = c.attackPlayer ?? firstPlayer(s);
  prepend(
    s,
    ...Array.from({ length: copies }, () => fx("ndtDiscard", { player: p })),
  );
}
/**
 * Boar Clan Skirmisher: "Forced: After the engaged player draws any number of
 * cards, he deals 1 damage to a hero he controls." Munuv Dûv River, in the
 * staging area: "Forced: After a player draws any number of cards, he deals 1
 * shadow card to an enemy engaged with him."
 */
function dtCardsDrawnForced(s: GameState, player: number): Effect[] {
  if (!dtLive(s)) return [];
  return [
    ...seatView(s, player)
      .engaged.filter((u) => live(s, u, N.skirmisher))
      .map((u) =>
        fx("ndtHeroDamage", { target: u.id, code: u.code, value: 1, player }),
      ),
    ...staged(s, N.river).map((u) =>
      fx("ndtRiver", { target: u.id, code: u.code, player }),
    ),
  ];
}
/** Plains of Dunland: "While Plains of Dunland is in the staging area, each Dunland enemy gets -20 engagement cost and cannot be optionally engaged." */
const dtEngagementBonus = (s: GameState, u: Unit) =>
  dtLive(s) && isDunland(u) ? -20 * staged(s, N.plains).length : 0;
const dtCannotOptionallyEngage = (s: GameState, u: Unit) =>
  dtLive(s) && isDunland(u) && staged(s, N.plains).length > 0;
/** Plains of Dunland: "Travel: The first player engages the highest [attack] enemy in the staging area to travel here." */
const dtTravelProblem = (s: GameState, u: Unit) =>
  dtLive(s) && live(s, u, N.plains) && !s.staging.some(isEnemy)
    ? "Plains of Dunland requires an enemy in the staging area to engage."
    : null;
/** Hithaeglir Woods: "Travel: Deal each Dunland enemy a shadow card to travel here." */
function dtTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!dtLive(s)) return undefined;
  if (live(s, u, N.plains))
    return [fx("ndtPlains", { player: firstPlayer(s) })];
  if (live(s, u, N.woods))
    return [
      ...[...s.staging, ...allEngaged(s)].filter(isDunland).map((e) =>
        fx("dunlandShadow", {
          target: e.id,
          code: e.code,
          player: firstPlayer(s),
        }),
      ),
      fx("ndtWoodsDone", { player: firstPlayer(s) }),
    ];
  return undefined;
}
/** Hithaeglir Woods: "While Hithaeglir Woods is in the staging area, each Dunland enemy in the staging area cannot take damage." */
function dtDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !dtLive(s) ||
    amount <= 0 ||
    !isDunland(u) ||
    !inStaging(s, u) ||
    !staged(s, N.woods).length
  )
    return amount;
  log(
    s,
    `${name(u)} cannot take damage in the staging area (Hithaeglir Woods).`,
  );
  return 0;
}
/** Boar Clan Assault's shadow: "Each enemy engaged with you gets +1 [attack] until the end of the phase." */
function dtStats(s: GameState, u: Unit) {
  if (!dtLive(s)) return {};
  const n = (s.nightmare?.dunlandBoost ?? []).filter(
    (b) =>
      b.round === s.round &&
      b.phase === phaseKey(s) &&
      b.enemies.includes(u.id),
  ).length;
  return n ? { attack: n } : {};
}
/** Stalked by Dunlendings: "Until the end of the round, add X [threat] to the total [threat] in the staging area. X is the number of cards in the first player's hand." */
function dtStagingThreat(s: GameState) {
  const t = s.nightmare?.dunlandStalked;
  if (!dtLive(s) || !t || t.round !== s.round) return 0;
  return t.copies * seatView(s, firstPlayer(s)).hand.length;
}
function dtRoundEnd(s: GameState): Effect[] {
  const q = s.nightmare;
  if (!dtLive(s) || !q) return [];
  if (q.dunlandStalked && q.dunlandStalked.round <= s.round)
    delete q.dunlandStalked;
  if (q.dunlandBoost)
    q.dunlandBoost = q.dunlandBoost.filter((b) => b.round > s.round);
  return [];
}

function dtEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!dtLive(s) || (code !== N.assault && code !== N.stalked)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.assault) {
    // Boar Clan Assault: "Each engaged enemy makes an immediate attack. If no
    // attacks are made this way, Boar Clan Assault gains surge."
    (s.nightmare ??= {}).dunlandAssault = false;
    prepend(
      s,
      fx("fangornOrder", {
        text: "Boar Clan Assault · Choose the next enemy to attack",
        effects: allEngaged(s).map((u) =>
          fx("immediateAttack", {
            target: u.id,
            code: u.code,
            player: ownerOf(s, u),
          }),
        ),
        player: firstPlayer(s),
      }),
      fx("ndtAssaultDone", { player: firstPlayer(s) }),
    );
    return true;
  }
  // Stalked by Dunlendings: "Each player draws 1 card." Then its [threat]
  // lasts until the end of the round.
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
    fx("ndtStalked", { player: firstPlayer(s) }),
  );
  return true;
}

function dtShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !dtLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Boar Clan Ambusher: "If this attack destroys a character, discard a
    // random card from your hand."
    case N.ambusher:
      c.nmHandDiscardOnKill = (c.nmHandDiscardOnKill ?? 0) + 1;
      return true;
    // Boar Clan Skirmisher: "Deal 1 damage to a hero you control (2 damage
    // instead if undefended)."
    case N.skirmisher:
      prepend(
        s,
        fx("ndtHeroDamage", {
          code,
          value: undefended(s) ? 2 : 1,
          player: attacked,
        }),
      );
      return true;
    // Munuv Dûv River: "Raise your threat by 1 for each enemy engaged with
    // you."
    case N.river: {
      const n = seatView(s, attacked).engaged.length;
      if (n) prepend(s, fx("heirsThreat", { value: n, player: attacked }));
      return true;
    }
    // Boar Clan Assault: "Each enemy engaged with you gets +1 [attack] until
    // the end of the phase."
    case N.assault: {
      const q = (s.nightmare ??= {});
      q.dunlandBoost = [
        ...(q.dunlandBoost ?? []),
        {
          enemies: seatView(s, attacked).engaged.map((u) => u.id),
          round: s.round,
          phase: phaseKey(s),
        },
      ];
      return true;
    }
    // Stalked by Dunlendings: "Put the topmost enemy in the discard pile into
    // play engaged with you and deal it a shadow card."
    case N.stalked: {
      let i = s.encounterDiscard.length - 1;
      while (i >= 0 && card(s.encounterDiscard[i]).type_code !== "enemy") i--;
      if (i < 0) {
        log(
          s,
          "Stalked by Dunlendings: no enemy is in the encounter discard pile.",
        );
        return true;
      }
      const [found] = s.encounterDiscard.splice(i, 1);
      const enemy = make(s, found);
      forOwner(s, attacked, () => engage(s, enemy));
      if (!allEngaged(s).some((x) => x.id === enemy.id)) {
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        return true;
      }
      log(
        s,
        `Stalked by Dunlendings: ${name(enemy)} returns from the discard pile, engaged${seatLabel(s, attacked)}.`,
        "danger",
      );
      prepend(
        s,
        fx("dunlandShadow", {
          target: enemy.id,
          code: found,
          player: attacked,
        }),
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareDunlandEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndt")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "ndtDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const card = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `Boar Clan Ambusher: ${name(card)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, card.id, { encounterEffect: true });
      });
      return true;
    case "ndtHeroDamage": {
      const heroes = seatView(s, p).heroes;
      const value = e.value ?? 1;
      if (!heroes.length) return true;
      choose(
        s,
        `${card(e.code ?? N.skirmisher).name} · Deal ${value} damage to a hero you control${seatLabel(s, p)}`,
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} · ${value} damage`,
          effects: [fx("damage", { target: h.id, value, player: p })],
        })),
        card(N.skirmisher).text,
      );
      return true;
    }
    case "ndtRiver": {
      const enemies = seatView(s, p).engaged;
      if (!enemies.length) return true;
      if (enemies.length === 1) {
        prepend(
          s,
          fx("dunlandShadow", {
            target: enemies[0].id,
            code: enemies[0].code,
            player: p,
          }),
        );
        return true;
      }
      choose(
        s,
        `Munuv Dûv River · Deal a shadow card to an enemy engaged with you${seatLabel(s, p)}`,
        enemies.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [
            fx("dunlandShadow", { target: x.id, code: x.code, player: p }),
          ],
        })),
        card(N.river).text,
      );
      return true;
    }
    case "ndtPlains": {
      const enemies = s.staging.filter(isEnemy);
      if (!enemies.length) return true;
      const top = Math.max(...enemies.map((x) => stats(s, x).attack));
      const highest = enemies.filter((x) => stats(s, x).attack === top);
      if (highest.length === 1) {
        prepend(s, fx("ndtEngage", { target: highest[0].id, player: p }));
        return true;
      }
      choose(
        s,
        "Plains of Dunland · Engage the highest [attack] enemy in the staging area",
        highest.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: `Engage ${name(x)}`,
          effects: [fx("ndtEngage", { target: x.id, player: p })],
        })),
        card(N.plains).text,
      );
      return true;
    }
    case "ndtEngage":
      if (u && inStaging(s, u)) {
        engage(s, u);
        log(
          s,
          `Plains of Dunland: ${name(u)} engages the first player.`,
          "danger",
        );
      }
      return true;
    case "ndtWoodsDone":
      log(s, "Hithaeglir Woods: each Dunland enemy is dealt a shadow card.");
      return true;
    case "ndtAssaultDone": {
      const q = s.nightmare;
      const attacked = !!q?.dunlandAssault;
      if (q) delete q.dunlandAssault;
      if (!attacked) {
        log(
          s,
          "Boar Clan Assault: no attack was made; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(N.assault));
      }
      return true;
    }
    case "ndtStalked": {
      const q = (s.nightmare ??= {});
      const t =
        q.dunlandStalked?.round === s.round
          ? q.dunlandStalked
          : { round: s.round, copies: 0 };
      t.copies += 1;
      q.dunlandStalked = t;
      log(
        s,
        "Stalked by Dunlendings: until the end of the round, the first player's hand size adds to the staging area's [threat].",
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_DUNLAND_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  enemyAttackStarted: dtEnemyAttackStarted,
  characterDestroyed: dtCharacterDestroyed,
  cardsDrawnForced: dtCardsDrawnForced,
  engagementBonus: dtEngagementBonus,
  cannotOptionallyEngage: dtCannotOptionallyEngage,
  travelProblem: dtTravelProblem,
  travelEffects: dtTravelEffects,
  damageAmount: dtDamageAmount,
  stats: dtStats,
  stagingThreat: dtStagingThreat,
  roundEnd: dtRoundEnd,
  encounter: dtEncounter,
  shadow: dtShadow,
  effect: nightmareDunlandEffect,
  sharedEffect: (e) =>
    [
      "ndtPlains",
      "ndtEngage",
      "ndtWoodsDone",
      "ndtAssaultDone",
      "ndtStalked",
    ].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareDunland(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.dunlandAssault === undefined ||
      typeof q.dunlandAssault === "boolean") &&
    (q?.dunlandBoost === undefined ||
      (Array.isArray(q.dunlandBoost) &&
        q.dunlandBoost.every(
          (b) =>
            !!b &&
            Array.isArray(b.enemies) &&
            b.enemies.every((id) => typeof id === "string") &&
            n(b.round) &&
            typeof b.phase === "string",
        ))) &&
    (q?.dunlandStalked === undefined ||
      (!!q.dunlandStalked &&
        n(q.dunlandStalked.round) &&
        n(q.dunlandStalked.copies)))
  );
}
