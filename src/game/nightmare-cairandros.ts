/**
 * The Siege of Cair Andros's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rule (player cards in the victory display contribute no victory
 * points) and its Nightmare encounter cards, with their Battleground damage,
 * composed with the scenario's own rules (src/game/heirs-numenor.ts) through
 * batch4Scenario while a Nightmare mode game is played. Effects use the "nsc"
 * prefix.
 */
import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, encounterDraw, fx, get, log, prepend } from "./core";
import { discardAttachment, exhaustCharacter } from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  removeActiveLocation,
} from "./table";
import { heirsShadowDealt } from "./heirs-numenor";
import { batch4Scenario } from "./batch4-scenarios";
import { dealEnemyShadows } from "./considered-engagement";
import { isPlayerCardSource } from "./player-effect-immunity";
import { NIGHTMARE_HON as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
  traitOf,
} from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareCairAndrosState {
  /** Orc Ravager: +2 [defense] for each shadow card it was dealt this phase. */
  ravager?: { round: number; phase: string; bonus: Record<string, number> };
  /** Orc Saboteur's shadow: its attack, waiting for a destroyed character. */
  saboteur?: { enemyId: string; player: number }[];
  /** Besieged Courtyard's shadow: the attacking enemies that attack again afterwards. */
  courtyard?: { enemyId: string; player: number }[];
}

const scLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "siege-of-cair-andros";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
/** Battleground locations in play: in the staging area or active. */
const battlegrounds = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" && traitOf(u.code, "Battleground"),
  );
/** The game phase of an engine step (defense and attack are the combat phase). */
const gamePhase = (s: GameState) =>
  s.phase === "staging"
    ? "quest"
    : s.phase === "defense" || s.phase === "attack"
      ? "combat"
      : s.phase;
const THRESHOLDS: Record<string, number> = {
  [N.courtyard]: 5,
  [N.walls]: 4,
  [N.wharf]: 6,
};

// ------------------------------------------------------------- the setup card

/** "Until the end of the game, player cards in the victory display do not contibute their victory points." */
const scVictoryValue = (s: GameState, code: string) =>
  scLive(s) && isPlayerCardSource(code) ? 0 : undefined;

// ------------------------------------------------------------- the Battlegrounds

/**
 * Besieged Courtyard (5), Walls of Cair Andros (4) and Anduin Wharf (6): "If
 * it has N or more damage, discard it and ..." (each player exhausts their
 * ready characters; each player assigns 4 damage among their characters; 2
 * cards are revealed from the encounter deck).
 */
function scCheck(s: GameState) {
  if (!scLive(s) || s.status !== "playing") return;
  for (const u of battlegrounds(s)) {
    const threshold = THRESHOLDS[u.code];
    if (!threshold || u.blanked || u.damage < threshold) continue;
    s.staging = s.staging.filter((x) => x.id !== u.id);
    removeActiveLocation(s, u.id);
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
    s.encounterDiscard.push(u.code);
    log(s, `${name(u)} has ${u.damage} damage and is discarded.`, "danger");
    if (u.code === N.courtyard)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("nscCourtyard", { player })),
      );
    else if (u.code === N.walls)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("nscWalls", { value: 4, player })),
      );
    else
      prepend(
        s,
        fx("reveal", { player: firstPlayer(s) }),
        fx("reveal", { player: firstPlayer(s) }),
      );
  }
}

// ------------------------------------------------------------- the cards

/** Southron Mounted Archer: "Archery 5." (each copy in play) */
const scArcheryBonus = (s: GameState) =>
  scLive(s)
    ? 5 * enemiesInPlay(s).filter((u) => live(s, u, N.archer)).length
    : 0;
/** Southron Mounted Archer: "Damage from each round's archery total may be assigned to Battleground locations, as well as characters." */
function scArcheryTargets(s: GameState, characters: Unit[]) {
  if (!scLive(s) || !enemiesInPlay(s).some((u) => live(s, u, N.archer)))
    return undefined;
  return [...characters, ...battlegrounds(s)];
}
/** Orc Ravager: "+2 [defense] until the end of the phase" for each shadow card it is dealt. */
function scStats(s: GameState, u: Unit) {
  const r = s.nightmare?.ravager;
  if (
    !scLive(s) ||
    !r ||
    r.round !== s.round ||
    r.phase !== gamePhase(s) ||
    !live(s, u, N.ravager)
  )
    return {};
  return { defense: 2 * (r.bonus[u.id] ?? 0) };
}
function scShadowDealt(s: GameState, u: Unit) {
  if (!scLive(s) || !live(s, u, N.ravager)) return;
  const q = (s.nightmare ??= {});
  const phase = gamePhase(s);
  const r =
    q.ravager?.round === s.round && q.ravager.phase === phase
      ? q.ravager
      : { round: s.round, phase, bonus: {} };
  r.bonus[u.id] = (r.bonus[u.id] ?? 0) + 1;
  q.ravager = r;
  log(
    s,
    `Orc Ravager is dealt a shadow card: +2 [defense] until the end of the phase (+${2 * r.bonus[u.id]}).`,
  );
}
/** Orc Saboteur: "Damage dealt by Orc Saboteur's attacks must be assigned to a Battleground location in play, if able." */
function scReplaceDamage(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (
    !scLive(s) ||
    amount <= 0 ||
    !context.combatDamage ||
    !context.enemyId ||
    card(u.code).type_code === "location"
  )
    return false;
  const enemy = get(s, context.enemyId);
  if (!enemy || !live(s, enemy, N.saboteur) || !battlegrounds(s).length)
    return false;
  log(
    s,
    `Orc Saboteur: its ${amount} damage must be assigned to a Battleground location instead of ${name(u)}.`,
    "danger",
  );
  prepend(
    s,
    fx("nscBattleground", {
      value: amount,
      code: N.saboteur,
      player: ownerOf(s, u),
    }),
  );
  return true;
}
/** Anduin Wharf: "While Anduin Wharf is the active location, allies cost 1 additional matching resource to play from hand." */
const scPlayCostReduction = (s: GameState, c: Card) =>
  scLive(s) && c.type_code === "ally"
    ? -allActiveLocations(s).filter((l) => live(s, l, N.wharf)).length
    : 0;
/** Orc Saboteur's shadow: "If this attack destroys a character, deal 2 damage to a Battleground location in play." */
function scCharacterDestroyed(s: GameState, _u: Unit, context: DamageContext) {
  const marks = s.nightmare?.saboteur;
  if (!scLive(s) || !marks?.length || !context.enemyId) return;
  const mine = marks.filter((m) => m.enemyId === context.enemyId);
  if (!mine.length) return;
  s.nightmare!.saboteur = marks.filter((m) => m.enemyId !== context.enemyId);
  prepend(
    s,
    ...mine.map((m) =>
      fx("nscBattleground", { value: 2, code: N.saboteur, player: m.player }),
    ),
  );
}
function scAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  if (!q) return [];
  if (q.saboteur?.length) {
    q.saboteur = q.saboteur.filter((m) => m.enemyId !== combat.enemyId);
    if (!q.saboteur.length) delete q.saboteur;
  }
  // Besieged Courtyard's shadow: "attacking enemy makes an additional attack
  // after this one".
  const again = (q.courtyard ?? []).filter((m) => m.enemyId === combat.enemyId);
  if (!again.length) return [];
  q.courtyard = q.courtyard!.filter((m) => m.enemyId !== combat.enemyId);
  if (!q.courtyard.length) delete q.courtyard;
  return again.map((m) =>
    fx("immediateAttack", { target: m.enemyId, player: m.player }),
  );
}

function scEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!scLive(s) || code !== N.ruin) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  // Ruin and Wroth: "When Revealed: Deal 2 shadow cards to each enemy in
  // play. Deal 2 damage to each Battleground location in play."
  if (fromReveal) prepend(s, fx("nscRuin", { player: firstPlayer(s) }));
  return true;
}

function scShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !scLive(s)) return false;
  const p = defendingPlayer(s);
  const q = (s.nightmare ??= {});
  switch (code) {
    // Orc Saboteur: "If this attack destroys a character, deal 2 damage to a
    // Battleground location in play."
    case N.saboteur:
      q.saboteur = [...(q.saboteur ?? []), { enemyId: c.enemyId, player: p }];
      return true;
    // Orc Ravager: "Exhaust a character you control. Deal attacking enemy
    // another shadow card."
    case N.ravager:
      prepend(
        s,
        fx("nscRavagerExhaust", { player: p }),
        fx("nscExtraShadow", { target: c.enemyId }),
      );
      return true;
    // Besieged Courtyard: "Choose one: either attacking enemy makes an
    // additional attack after this one, or deal 10 damage to a Battleground
    // location."
    case N.courtyard:
      prepend(s, fx("nscCourtyardShadow", { target: c.enemyId, player: p }));
      return true;
    // Walls of Cair Andros: "Attacking enemy gets +X [attack], where X is
    // the amount of damage on the active location."
    case N.walls:
      c.attackBonus += s.activeLocation?.damage ?? 0;
      return true;
    // Ruin and Wroth: "Discard an attachment you control."
    case N.ruin:
      prepend(s, fx("nscDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareCairAndrosEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nsc")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nscBattleground": {
      const locations = battlegrounds(s);
      const value = e.value ?? 0;
      if (!locations.length || value <= 0) return true;
      if (locations.length === 1) {
        prepend(s, fx("damage", { target: locations[0].id, value }));
        return true;
      }
      choose(
        s,
        `${card(e.code ?? N.saboteur).name} · Deal ${value} damage to a Battleground location${seatLabel(s, p)}`,
        locations.map((l): Option => ({
          id: l.id,
          code: l.code,
          label: `${name(l)} (${l.damage} damage)`,
          effects: [fx("damage", { target: l.id, value })],
        })),
        card(e.code ?? N.saboteur).text,
      );
      return true;
    }
    case "nscRuin": {
      const foes = enemiesInPlay(s);
      for (const foe of foes) dealEnemyShadows(s, foe, 2);
      const locations = battlegrounds(s);
      log(
        s,
        `Ruin and Wroth deals 2 shadow cards to each enemy in play (${foes.length}) and 2 damage to each Battleground location (${locations.length}).`,
        "danger",
      );
      prepend(
        s,
        ...locations.map((l) => fx("damage", { target: l.id, value: 2 })),
      );
      return true;
    }
    case "nscExtraShadow": {
      if (!u) return true;
      const code = encounterDraw(s, true);
      if (!code) return true;
      const at = u.revealedShadowCount ?? 0;
      u.faceupShadows ??= u.shadows.map(() => false);
      u.faceupShadows.splice(at, 0, false);
      u.shadows.splice(at, 0, code);
      heirsShadowDealt(s, u);
      batch4Scenario(s).shadowDealt?.(s, u, code);
      log(s, `Orc Ravager: ${name(u)} is dealt another shadow card.`, "danger");
      prepend(s, fx("shadowReveal", { code }));
      return true;
    }
    case "nscRavagerExhaust": {
      const ready = [...s.heroes, ...s.allies].filter((c) => !c.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `Orc Ravager · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [fx("nscExhaust", { target: c.id, player: p })],
        })),
        card(N.ravager).shadow,
      );
      return true;
    }
    case "nscExhaust":
      if (u && exhaustCharacter(s, u))
        log(s, `Orc Ravager: ${name(u)} exhausts${seatLabel(s, p)}.`);
      return true;
    case "nscCourtyardShadow": {
      const locations = battlegrounds(s);
      const options: Option[] = [
        {
          id: "attack",
          code: N.courtyard,
          label: `${u ? name(u) : "The attacking enemy"} makes an additional attack after this one`,
          effects: [fx("nscCourtyardAttack", { target: e.target, player: p })],
        },
        ...(locations.length
          ? [
              {
                id: "damage",
                code: N.courtyard,
                label: "Deal 10 damage to a Battleground location",
                effects: [
                  fx("nscBattleground", {
                    value: 10,
                    code: N.courtyard,
                    player: p,
                  }),
                ],
              },
            ]
          : []),
      ];
      choose(
        s,
        `Besieged Courtyard · Choose one${seatLabel(s, p)}`,
        options,
        card(N.courtyard).shadow,
      );
      return true;
    }
    case "nscCourtyardAttack": {
      if (!e.target) return true;
      const q = (s.nightmare ??= {});
      q.courtyard = [...(q.courtyard ?? []), { enemyId: e.target, player: p }];
      return true;
    }
    case "nscCourtyard": {
      const ready = [...s.heroes, ...s.allies].filter((c) => !c.exhausted);
      for (const c of ready) exhaustCharacter(s, c);
      log(
        s,
        `Besieged Courtyard: each ready character exhausts${seatLabel(s, p)} (${ready.length}).`,
        "danger",
      );
      return true;
    }
    case "nscWalls": {
      const left = e.value ?? 0;
      const own = [...s.heroes, ...s.allies];
      if (left <= 0 || !own.length) return true;
      choose(
        s,
        `Walls of Cair Andros · Assign 1 damage to a character you control (${left} left)${seatLabel(s, p)}`,
        own.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: `${name(c)} (${c.damage} damage)`,
          effects: [
            fx("damage", { target: c.id, value: 1, player: p }),
            fx("nscWalls", { value: left - 1, player: p }),
          ],
        })),
        card(N.walls).text,
      );
      return true;
    }
    case "nscDiscardAttachment": {
      const owned = allCharacters(s)
        .filter((c) => ownerOf(s, c) === p)
        .flatMap((c) =>
          c.attachments
            .filter((a) => (a.owner ?? ownerOf(s, c)) === p)
            .map((a) => ({ host: c, a })),
        );
      if (!owned.length) return true;
      choose(
        s,
        `Ruin and Wroth · Discard an attachment you control${seatLabel(s, p)}`,
        owned.map(({ host, a }): Option => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} (on ${name(host)})`,
          effects: [fx("nscDiscard", { target: host.id, source: a.id })],
        })),
        card(N.ruin).shadow,
      );
      return true;
    }
    case "nscDiscard": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        discardAttachment(s, u, a, true);
        log(s, `Ruin and Wroth: ${card(a.code).name} is discarded.`);
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nscRavagerExhaust",
  "nscExhaust",
  "nscCourtyard",
  "nscWalls",
]);
export const NIGHTMARE_CAIR_ANDROS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  victoryValue: scVictoryValue,
  check: scCheck,
  archeryBonus: scArcheryBonus,
  archeryTargets: scArcheryTargets,
  stats: scStats,
  shadowDealt: scShadowDealt,
  replaceDamage: scReplaceDamage,
  playCostReduction: scPlayCostReduction,
  characterDestroyed: scCharacterDestroyed,
  attackFinished: scAttackFinished,
  encounter: scEncounter,
  shadow: scShadow,
  effect: nightmareCairAndrosEffect,
  sharedEffect: (e) => e.kind.startsWith("nsc") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareCairAndros(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const marks = (v: unknown) =>
    Array.isArray(v) &&
    v.every(
      (m) =>
        !!m &&
        typeof m.enemyId === "string" &&
        Number.isInteger(m.player) &&
        m.player >= 0,
    );
  const r = q.ravager;
  return (
    (r === undefined ||
      (!!r &&
        Number.isInteger(r.round) &&
        typeof r.phase === "string" &&
        !!r.bonus &&
        typeof r.bonus === "object" &&
        Object.values(r.bonus).every((n) => Number.isInteger(n) && n > 0))) &&
    (q.saboteur === undefined || marks(q.saboteur)) &&
    (q.courtyard === undefined || marks(q.courtyard))
  );
}

// ------------------------------------------------------------- the table

/** The table's goal line for the Nightmare Battlegrounds' damage. */
export function nightmareCairAndrosGoal(s: GameState): string | undefined {
  if (!scLive(s)) return undefined;
  const list = battlegrounds(s).filter((u) => THRESHOLDS[u.code]);
  return list.length
    ? `Nightmare Battlegrounds · ${list.map((u) => `${name(u)} ${u.damage}/${THRESHOLDS[u.code]}`).join(", ")} damage before each is discarded`
    : undefined;
}
