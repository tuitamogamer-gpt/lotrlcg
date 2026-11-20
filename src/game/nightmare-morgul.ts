/**
 * The Morgul Vale's Nightmare Deck (docs/NIGHTMARE.md): its setup card's rule
 * (1 progress token on To the Tower at setup, in nightmareSetup) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/morgul-vale.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario's "morgulProgress" effect places the progress
 * on To the Tower (its loss at 10 included). Effects use the "nmv" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, encounterDraw, fx, get, log, prepend } from "./core";
import { discardAttachment } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  playerOrder,
  seatView,
} from "./table";
import { effectiveTraits } from "./expansion-passives";
import { hasSilverLamp } from "./voice-isengard";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
} from "./nightmare-core";
import { MORGUL_VALE as M } from "./morgul-vale-support";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareMorgulState {
  /** The Tower Beckons: its resolved copies add X [threat] to the staging area until the end of the phase. */
  morgulBeckons?: { round: number; phase: string; n: number };
  /** Orc Captor's shadow: +3 [defense] for each attacking enemy (by id) until the end of the combat phase. */
  morgulCaptor?: { round: number; bonus: Record<string, number> };
  /** Sentry of the White Bridge's and Noxious Fumes' shadows: progress on To the Tower if this attack destroys a character. */
  morgulKill?: { enemyId: string; n: number; killed: boolean };
}

const mvLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-morgul-vale";
const tower = (s: GameState) =>
  s.staging.find((u) => u.code === M.tower)?.progress ?? 0;
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const isCaptain = (u: Unit) =>
  isEnemy(u) && effectiveTraits(u).includes("Captain");
const captains = (s: GameState) => enemiesInPlay(s).filter(isCaptain);
const locationsInPlay = (s: GameState) => [
  ...s.staging.filter((u) => card(u.code).type_code === "location"),
  ...allActiveLocations(s),
];
/** The game phase of an engine step (staging and quest resolution are the quest phase). */
const gamePhase = (s: GameState) =>
  s.phase === "staging"
    ? "quest"
    : s.phase === "defense" || s.phase === "attack"
      ? "combat"
      : s.phase;
const progress = (player: number) => fx("morgulProgress", { value: 1, player });
/**
 * Lord Alcaron: "Forced: When Lord Alcaron is dealt a shadow card with no
 * shadow effect, he makes an additional attack after this one" (the
 * scenario's own count of his additional attacks).
 */
function alcaronDealt(u: Unit, code: string) {
  if (u.code === M.alcaron && !u.blanked && !card(code).shadow)
    u.morgulExtraAttacks = (u.morgulExtraAttacks ?? 0) + 1;
}

// ------------------------------------------------------------- the cards

/**
 * Warrior of Nurn: "Each Captain enemy in play gets +1 [defense]." Ephel
 * Dúath: "While Ephel Dúath is in the staging area, each Captain enemy in
 * play gets +2 [attack]." Sentry of the White Bridge: [attack] X, the progress
 * tokens on To the Tower. Orc Captor's shadow: "+3 [defense] until the end of
 * the combat phase."
 */
function mvStats(s: GameState, u: Unit) {
  if (!mvLive(s) || !isEnemy(u)) return {};
  let attack = 0,
    defense = 0;
  if (live(s, u, N.sentry)) attack += tower(s);
  if (isCaptain(u)) {
    defense += enemiesInPlay(s).filter((x) => live(s, x, N.nurn)).length;
    attack += 2 * s.staging.filter((x) => live(s, x, N.ephel)).length;
  }
  const c = s.nightmare?.morgulCaptor;
  if (c && c.round === s.round && gamePhase(s) === "combat")
    defense += c.bonus[u.id] ?? 0;
  return {
    ...(attack ? { attack } : {}),
    ...(defense ? { defense } : {}),
  };
}
/** Sentry of the White Bridge: [threat] X, the progress tokens on To the Tower. */
const mvThreatBonus = (s: GameState, u: Unit) =>
  mvLive(s) && live(s, u, N.sentry) ? tower(s) : 0;
/** The Tower Beckons: "Until the end of the phase, The Tower Beckons adds X [threat] to the total [threat] in the staging area, where X is the number of progress tokens on To the Tower." */
function mvStagingThreat(s: GameState) {
  const b = s.nightmare?.morgulBeckons;
  return mvLive(s) && b && b.round === s.round && b.phase === gamePhase(s)
    ? b.n * tower(s)
    : 0;
}
/**
 * At the end of the round: Warrior of Nurn heals all damage from each
 * Captain enemy in play; each Orc Captor in the staging area places 1
 * progress token on To the Tower; White-flowered Fields makes each player
 * exhaust a hero or place 1 progress token on To the Tower.
 */
function mvRoundEnd(s: GameState): Effect[] {
  if (!mvLive(s)) return [];
  const first = firstPlayer(s);
  return [
    ...enemiesInPlay(s)
      .filter((u) => live(s, u, N.nurn))
      .map(() => fx("nmvHeal", { text: "Warrior of Nurn", player: first })),
    ...s.staging.filter((u) => live(s, u, N.captor)).map(() => progress(first)),
    ...locationsInPlay(s)
      .filter((u) => live(s, u, N.fields))
      .flatMap(() =>
        playerOrder(s).map((player) => fx("nmvFields", { player })),
      ),
  ];
}
/**
 * Banks of Morgulduin: "Forced: When Banks of Morgulduin is explored, deal it
 * facedown as a shadow card to a Captain enemy." With no Captain enemy in
 * play, it is discarded.
 */
function mvLocationDestination(s: GameState, u: Unit) {
  if (!mvLive(s) || !live(s, u, N.banks)) return false;
  const targets = captains(s);
  if (!targets.length) return false;
  for (const a of [...u.attachments]) discardAttachment(s, u, a);
  if (targets.length === 1) dealBanks(s, targets[0], u.code);
  else prepend(s, fx("nmvBanks", { code: u.code, player: firstPlayer(s) }));
  return true;
}
function dealBanks(s: GameState, u: Unit, code: string) {
  // A Captain dealt it while attacking resolves it with this attack.
  const attacking = s.combat?.enemyId === u.id;
  u.faceupShadows ??= u.shadows.map(() => false);
  const at = attacking ? (u.revealedShadowCount ?? 0) : u.shadows.length;
  u.shadows.splice(at, 0, code);
  u.faceupShadows.splice(at, 0, false);
  alcaronDealt(u, code);
  log(
    s,
    `Banks of Morgulduin is explored: it is dealt facedown as a shadow card to ${name(u)}.`,
    "danger",
  );
  if (attacking) prepend(s, fx("shadowReveal", { code }));
}

function mvEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!mvLive(s) || (code !== N.beckons && code !== N.fumes)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  const first = firstPlayer(s);
  // The Tower Beckons: "Place 1 progress token on To the Tower. Until the
  // end of the phase, The Tower Beckons adds X [threat] ..."
  if (code === N.beckons)
    prepend(s, progress(first), fx("nmvBeckons", { player: first }));
  // Noxious Fumes: "Place 1 progress token on To the Tower. Each player must
  // assign damage among heroes he controls equal to the number of progress
  // tokens on To the Tower."
  else
    prepend(
      s,
      progress(first),
      ...playerOrder(s).map((player) => fx("nmvFumes", { player, ids: [] })),
    );
  return true;
}

/** Sentry of the White Bridge's and Noxious Fumes' shadows: "If this attack destroys a character, place 1 progress (token) on To the Tower." */
function killClause(s: GameState, c: Combat) {
  const q = (s.nightmare ??= {});
  const k =
    q.morgulKill?.enemyId === c.enemyId
      ? q.morgulKill
      : { enemyId: c.enemyId, n: 0, killed: false };
  k.n += 1;
  q.morgulKill = k;
}
function mvShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !mvLive(s)) return false;
  const p = defendingPlayer(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Warrior of Nurn: "Heal all damage from each Captain enemy in play."
    case N.nurn:
      prepend(s, fx("nmvHeal", { text: "Warrior of Nurn", player: p }));
      return true;
    // Orc Captor: "Attacking enemy gets +3 [defense] until the end of the
    // combat phase."
    case N.captor: {
      const q = (s.nightmare ??= {});
      const r =
        q.morgulCaptor?.round === s.round
          ? q.morgulCaptor
          : { round: s.round, bonus: {} };
      r.bonus[c.enemyId] = (r.bonus[c.enemyId] ?? 0) + 3;
      q.morgulCaptor = r;
      log(
        s,
        `Orc Captor: ${enemy ? name(enemy) : "the attacking enemy"} gets +3 [defense] until the end of the combat phase.`,
        "danger",
      );
      return true;
    }
    // Sentry of the White Bridge: "Attacking enemy gets +1 [attack]. If this
    // attack destroys a character, place 1 progress token on To the Tower."
    case N.sentry:
      c.attackBonus += 1;
      killClause(s, c);
      return true;
    // Noxious Fumes: "If this attack destroys a character, place 1 progress
    // on To the Tower."
    case N.fumes:
      killClause(s, c);
      return true;
    // Banks of Morgulduin: "If attacking enemy is a Captain, deal it 3
    // additional shadow cards for this attack."
    case N.banks:
      if (enemy && isCaptain(enemy))
        prepend(s, fx("nmvExtraShadows", { target: enemy.id, value: 3 }));
      return true;
    // Ephel Dúath: "Defending player must either place 1 progress token on
    // To the Tower or treat this attack as undefended."
    case N.ephel:
      choose(
        s,
        `Ephel Dúath · Place 1 progress token on To the Tower, or treat this attack as undefended${seatLabel(s, p)}`,
        [
          {
            id: "tower",
            label: "Place 1 progress token on To the Tower",
            effects: [progress(p)],
          },
          {
            id: "undefended",
            label: "Treat this attack as undefended",
            effects: [fx("nmvUndefended", { player: p })],
          },
        ],
        card(N.ephel).shadow,
      );
      return true;
    // White-flowered Fields: "Return attacking enemy to the staging area
    // after this attack."
    case N.fields:
      c.returnToStaging = true;
      return true;
    // The Tower Beckons: "Place 1 progress token on To the Tower."
    case N.beckons:
      prepend(s, progress(p));
      return true;
  }
  return false;
}
function mvCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  const k = s.nightmare?.morgulKill;
  if (
    mvLive(s) &&
    k &&
    s.combat &&
    k.enemyId === s.combat.enemyId &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    k.killed = true;
}
function mvAttackFinished(s: GameState, combat: Combat): Effect[] {
  const k = s.nightmare?.morgulKill;
  if (!k || k.enemyId !== combat.enemyId) return [];
  delete s.nightmare!.morgulKill;
  if (!k.killed) return [];
  log(
    s,
    `This attack destroyed a character: ${k.n} progress ${k.n === 1 ? "token is" : "tokens are"} placed on To the Tower.`,
    "danger",
  );
  return Array.from({ length: k.n }, () => progress(firstPlayer(s)));
}

// ------------------------------------------------------------- effects

export function nightmareMorgulEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nmv")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nmvHeal": {
      const hurt = captains(s).filter((u) => u.damage > 0);
      if (hurt.length)
        log(
          s,
          `${e.text ?? "Warrior of Nurn"}: all damage is healed from ${hurt.map((u) => name(u)).join(", ")}.`,
          "danger",
        );
      prepend(
        s,
        ...hurt.map((u) =>
          fx("heal", { target: u.id, value: u.damage, player: p }),
        ),
      );
      return true;
    }
    case "nmvBeckons": {
      const q = (s.nightmare ??= {});
      const phase = gamePhase(s);
      const b =
        q.morgulBeckons?.round === s.round && q.morgulBeckons.phase === phase
          ? q.morgulBeckons
          : { round: s.round, phase, n: 0 };
      b.n += 1;
      q.morgulBeckons = b;
      log(
        s,
        `The Tower Beckons adds ${tower(s)} [threat] to the staging area until the end of the phase (the progress tokens on To the Tower).`,
        "danger",
      );
      return true;
    }
    case "nmvFumes": {
      // Each point is assigned first, then the damage is dealt together.
      const total = e.value ?? tower(s);
      const assigned = e.ids ?? [];
      const heroes = seatView(s, p).heroes;
      if (total <= 0 || !heroes.length) return true;
      const done =
        assigned.length >= total
          ? assigned
          : heroes.length === 1
            ? [
                ...assigned,
                ...Array<string>(total - assigned.length).fill(heroes[0].id),
              ]
            : undefined;
      if (done) {
        const counts = new Map<string, number>();
        for (const id of done) counts.set(id, (counts.get(id) ?? 0) + 1);
        log(
          s,
          `Noxious Fumes${seatLabel(s, p)}: ${[...counts]
            .map(([id, n]) => `${name(get(s, id)!)} takes ${n}`)
            .join(", ")} damage.`,
          "danger",
        );
        prepend(
          s,
          ...[...counts].map(([target, value]) =>
            fx("damage", { target, value, player: p }),
          ),
        );
        return true;
      }
      const left = total - assigned.length;
      choose(
        s,
        `Noxious Fumes · Assign 1 damage to a hero you control (${left} of ${total} left)${seatLabel(s, p)}`,
        heroes.map((h): Option => {
          const pending = assigned.filter((id) => id === h.id).length;
          return {
            id: h.id,
            code: h.code,
            label: `${name(h)} (${h.damage}${pending ? ` + ${pending}` : ""} damage)`,
            effects: [
              fx("nmvFumes", {
                player: p,
                value: total,
                ids: [...assigned, h.id],
              }),
            ],
          };
        }),
        card(N.fumes).text,
      );
      return true;
    }
    case "nmvFields": {
      const ready = seatView(s, p).heroes.filter((h) => !h.exhausted);
      if (!ready.length) {
        log(
          s,
          `White-flowered Fields${seatLabel(s, p)}: no ready hero to exhaust, so 1 progress token is placed on To the Tower.`,
          "danger",
        );
        prepend(s, progress(p));
        return true;
      }
      choose(
        s,
        `White-flowered Fields · Exhaust a hero you control, or place 1 progress token on To the Tower${seatLabel(s, p)}`,
        [
          ...ready.map((h): Option => ({
            id: h.id,
            code: h.code,
            label: `Exhaust ${name(h)}`,
            effects: [fx("exhaust", { target: h.id, player: p })],
          })),
          {
            id: "tower",
            label: "Place 1 progress token on To the Tower",
            effects: [progress(p)],
          },
        ],
        card(N.fields).text,
      );
      return true;
    }
    case "nmvBanks": {
      const code = e.code ?? N.banks;
      const targets = captains(s);
      if (!targets.length) {
        s.encounterDiscard.push(code);
        return true;
      }
      if (targets.length === 1) {
        dealBanks(s, targets[0], code);
        return true;
      }
      choose(
        s,
        "Banks of Morgulduin · Deal it facedown as a shadow card to a Captain enemy",
        targets.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("nmvBanksTo", { target: u.id, code, player: p })],
        })),
        card(N.banks).text,
      );
      return true;
    }
    case "nmvBanksTo": {
      const u = get(s, e.target);
      if (u && isCaptain(u)) dealBanks(s, u, e.code ?? N.banks);
      else s.encounterDiscard.push(e.code ?? N.banks);
      return true;
    }
    case "nmvExtraShadows": {
      // As Khazad-dûm's additional shadow cards: they are revealed for this
      // attack, after the shadow cards already revealed.
      const u = get(s, e.target);
      if (!u) return true;
      const codes: string[] = [];
      for (let i = 0; i < (e.value ?? 0); i++) {
        const code = encounterDraw(s, true);
        if (!code) break;
        codes.push(code);
      }
      u.faceupShadows ??= u.shadows.map(() => false);
      const at = u.revealedShadowCount ?? 0;
      u.shadows.splice(at, 0, ...codes);
      u.faceupShadows.splice(at, 0, ...codes.map(() => hasSilverLamp(s, u)));
      for (const code of codes) alcaronDealt(u, code);
      log(
        s,
        `Banks of Morgulduin: ${name(u)} is dealt ${codes.length} additional shadow card${codes.length === 1 ? "" : "s"} for this attack.`,
        "danger",
      );
      prepend(s, ...codes.map((code) => fx("shadowReveal", { code })));
      return true;
    }
    case "nmvUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, "Ephel Dúath: this attack is treated as undefended.", "danger");
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_MORGUL_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: mvStats,
  threatBonus: mvThreatBonus,
  stagingThreat: mvStagingThreat,
  roundEnd: mvRoundEnd,
  locationDestination: mvLocationDestination,
  encounter: mvEncounter,
  shadow: mvShadow,
  characterDestroyed: mvCharacterDestroyed,
  attackFinished: mvAttackFinished,
  effect: nightmareMorgulEffect,
  sharedEffect: (e) => e.kind.startsWith("nmv"),
};

// ------------------------------------------------------------- saves

const isRound = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
export function validNightmareMorgul(s: GameState) {
  const q = s.nightmare;
  const b = q?.morgulBeckons,
    c = q?.morgulCaptor,
    k = q?.morgulKill;
  return (
    (b === undefined ||
      (!!b &&
        isRound(b.round) &&
        typeof b.phase === "string" &&
        Number.isInteger(b.n) &&
        b.n > 0)) &&
    (c === undefined ||
      (!!c &&
        isRound(c.round) &&
        !!c.bonus &&
        typeof c.bonus === "object" &&
        Object.values(c.bonus).every((n) => Number.isInteger(n) && n > 0))) &&
    (k === undefined ||
      (!!k &&
        typeof k.enemyId === "string" &&
        Number.isInteger(k.n) &&
        k.n > 0 &&
        typeof k.killed === "boolean"))
  );
}
