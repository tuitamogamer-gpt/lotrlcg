/**
 * The Three Trials' Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (each engaged Guardian enemy contributes its [threat] to the staging
 * area; while the Trial of Intuition is the current trial, Guardian enemies
 * cannot be damaged and Barrow locations cannot be the active location and
 * are immune to player card effects) and its Nightmare encounter cards,
 * composed with the scenario's own rules (src/game/three-trials.ts) through
 * batch4Scenario while a Nightmare mode game is played. The scenario's
 * Guardians, Keys, trials and Guardian time counters serve the Nightmare
 * cards. Effects use the "ntt" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, threatOf } from "./core";
import { engage } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
} from "./table";
import { attachToQuest, currentQuestCode, mainQuestUnit } from "./quest-state";
import { surgeEffects } from "./surge";
import { canTravel } from "./actions";
import { fangornTravel } from "./fangorn";
import { TRIALS as T, TRIAL_KEYS } from "./three-trials-support";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareTrialsState {
  /** Haunted Pillars' shadow: +3 [defense] until the end of the phase. */
  trialsGuard?: { enemy: string; round: number; phase: string }[];
}

const ttLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-three-trials";
const traitsOf = (code: string) =>
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const hasTrait = (u: Unit, trait: string) => traitsOf(u.code).includes(trait);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isGuardian = (u: Unit) => isEnemy(u) && hasTrait(u, "Guardian");
const isBarrow = (u: Unit) =>
  card(u.code).type_code === "location" && hasTrait(u, "Barrow");
const intuition = (s: GameState) =>
  ttLive(s) && s.threeTrials?.activeQuest === T.intuition;
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
/** Shares a Trait with one of these Key objectives (Wolf, Boar or Raven). */
const sharesKeyTrait = (u: Unit, keys: string[]) =>
  keys.some((k) =>
    traitsOf(k)
      .filter((t) => t !== "Item" && t !== "Key")
      .some((t) => hasTrait(u, t)),
  );
const burdened = (u: Unit) =>
  u.attachments.some((a) => a.code === N.burden && !a.blanked);
const keysOn = (u: Unit) =>
  u.attachments.filter((a) => TRIAL_KEYS.includes(a.code)).map((a) => a.code);
const ancestors = (s: GameState) =>
  (mainQuestUnit(s)?.attachments ?? []).filter(
    (a) => a.code === N.ancestors && !a.blanked,
  ).length;
const unique = (u: Unit) => !!card(u.code).is_unique;
/** A Spirit, its animal, its Guardian and its Key. */
const SPIRITS: Record<
  string,
  { animal: string; guardian: string; key: string }
> = {
  [N.wolfSpirit]: { animal: "Wolf", guardian: T.wolf, key: T.wolfKey },
  [N.boarSpirit]: { animal: "Boar", guardian: T.boar, key: T.boarKey },
  [N.ravenSpirit]: { animal: "Raven", guardian: T.raven, key: T.ravenKey },
};
/** "If X's Guardian is in play or in the victory display, each X enemy gets +1 …" — one for each such Spirit in play. */
function spiritBoost(s: GameState, u: Unit, spirit: string) {
  const { animal, guardian } = SPIRITS[spirit];
  if (!isEnemy(u) || !hasTrait(u, animal)) return 0;
  const guarded =
    enemiesInPlay(s).some((e) => e.code === guardian) ||
    (s.victoryCards ?? []).includes(guardian);
  return guarded
    ? enemiesInPlay(s).filter((e) => live(s, e, spirit)).length
    : 0;
}

// ------------------------------------------------------------- the setup card

/** "Each engaged Guardian enemy contributes its [threat] to the total [threat] in the staging area." */
const ttStagingThreat = (s: GameState) =>
  ttLive(s)
    ? allEngaged(s)
        .filter(isGuardian)
        .reduce((n, u) => n + threatOf(s, u), 0)
    : 0;
/** "While the Trial of Intuition is the current trial, each Guardian enemy cannot be damaged, and each Barrow location cannot be the active location and is immune to player card effects." */
function ttDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (amount <= 0 || !intuition(s) || !isGuardian(u)) return amount;
  log(s, `${name(u)} cannot be damaged during the Trial of Intuition.`);
  return 0;
}
const ttImmune = (s: GameState, u: Unit) => intuition(s) && isBarrow(u);
const ttCannotBeActiveLocation = (s: GameState, u: Unit) =>
  intuition(s) && isBarrow(u);

// ------------------------------------------------------------- the cards

function ttStats(s: GameState, u: Unit) {
  if (!ttLive(s)) return {};
  const attack = spiritBoost(s, u, N.wolfSpirit);
  const defense =
    spiritBoost(s, u, N.boarSpirit) +
    3 *
      (s.nightmare?.trialsGuard ?? []).filter(
        (g) =>
          g.enemy === u.id && g.round === s.round && g.phase === phaseKey(s),
      ).length;
  // Trial of Ancestors: "Each non-unique character gets -1 [willpower]."
  const will =
    ["ally", "objective-ally", "hero"].includes(card(u.code).type_code) &&
    !unique(u)
      ? -ancestors(s)
      : 0;
  return {
    ...(attack ? { attack } : {}),
    ...(defense ? { defense } : {}),
    ...(will ? { will } : {}),
  };
}
/** Raven Spirit: each Raven enemy gets +1 [threat]. */
const ttThreatBonus = (s: GameState, u: Unit) =>
  ttLive(s) ? spiritBoost(s, u, N.ravenSpirit) : 0;
/** Each Spirit: "Forced: At the beginning of the encounter phase, … Spirit engages the player who controls Key of the … or is engaged with …'s Guardian, if able." */
function ttEncounterBegin(s: GameState) {
  if (!ttLive(s)) return;
  const spirits = enemiesInPlay(s).filter((u) =>
    Object.keys(SPIRITS).some((code) => live(s, u, code)),
  );
  if (spirits.length)
    prepend(
      s,
      ...spirits.map((u) =>
        fx("nttSpirit", { target: u.id, code: u.code, player: firstPlayer(s) }),
      ),
    );
}
/** Sacred Forest, in the staging area: each Guardian enemy gains "Forced: After any number of time counters are removed from this enemy, heal 2 damage on it for each time counter removed." */
function ttEnemyTimeRemoved(s: GameState, u: Unit, count: number) {
  const copies = staged(s, N.sacred).length;
  if (!ttLive(s) || !copies || count <= 0 || !isGuardian(u) || !u.damage)
    return;
  const healed = Math.min(u.damage, 2 * count * copies);
  u.damage -= healed;
  log(s, `Sacred Forest heals ${healed} damage on ${name(u)}.`, "danger");
}
const timedEnemies = (s: GameState) =>
  enemiesInPlay(s).filter((u) => !u.blanked && (u.timeCounters ?? 0) > 0);
/** Haunted Pillars: "When faced with the option to travel, players must travel to Haunted Pillars, if able." */
const pillarsAble = (s: GameState) =>
  staged(s, N.pillars).some((u) => canTravel(s, u) === null);
const ttMustTravel = (s: GameState) =>
  ttLive(s) && !allActiveLocations(s).length && pillarsAble(s);
function ttTravelProblem(s: GameState, u: Unit) {
  if (!ttLive(s)) return null;
  // Sacred Forest: "Travel: Remove each time counter from an enemy in play to travel here."
  if (live(s, u, N.sacred) && !timedEnemies(s).length)
    return "Sacred Forest requires an enemy with time counters.";
  if (!live(s, u, N.pillars) && staged(s, N.pillars).length && pillarsAble(s))
    return "Haunted Pillars: the players must travel there, if able.";
  return null;
}
const ttTravelEffects = (s: GameState, u: Unit): Effect[] | undefined =>
  ttLive(s) && live(s, u, N.sacred)
    ? [
        ...(fangornTravel(s, u) ?? []),
        fx("nttSacred", { player: firstPlayer(s) }),
      ]
    : undefined;
/** Cursed Burden: "Attached hero cannot commit to the quest, and cannot attack or defend against enemies with a Trait shared by any of that hero's attached Key objectives." */
const ttCannotCommit = (s: GameState, u: Unit) => ttLive(s) && burdened(u);
const burdenBars = (u: Unit, enemy: Unit) =>
  burdened(u) && sharesKeyTrait(enemy, keysOn(u));
const ttCannotDefend = (s: GameState, enemy: Unit, defender?: Unit) =>
  ttLive(s) && !!defender && burdenBars(defender, enemy);
/** Trial of Ancestors: non-unique characters "cannot attack enemies that share a Trait with the current trial's Key objective." */
function ttCannotAttack(s: GameState, character: Unit, enemy: Unit) {
  if (!ttLive(s)) return false;
  if (burdenBars(character, enemy)) return true;
  const key = s.threeTrials?.currentKey;
  return (
    !!key &&
    ancestors(s) > 0 &&
    !unique(character) &&
    sharesKeyTrait(enemy, [key])
  );
}
function ttRoundEnd(s: GameState): Effect[] {
  const q = s.nightmare;
  if (ttLive(s) && q?.trialsGuard)
    q.trialsGuard = q.trialsGuard.filter((g) => g.round > s.round);
  return [];
}

function ttEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !ttLive(s) ||
    (code !== N.pillars && code !== N.burden && code !== N.ancestors)
  )
    return false;
  if (code === N.pillars) {
    // Haunted Pillars: "Either return the active location to the staging
    // area, or Haunted Pillars gains surge." (It is already staged.)
    if (fromReveal) prepend(s, fx("nttPillars", { player: firstPlayer(s) }));
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.burden) {
    // Cursed Burden: "Attach to a hero with a Key objective attached, if
    // able." Its surge is printed.
    prepend(s, fx("nttBurden", { player: firstPlayer(s) }));
    return true;
  }
  // Trial of Ancestors: "Attach to the current quest."
  const quest = currentQuestCode(s);
  if (
    quest &&
    attachToQuest(s, quest, { id: `a${s.nextId++}`, code, exhausted: false })
  )
    log(s, "Trial of Ancestors is attached to the current quest.", "danger");
  else s.encounterDiscard.push(code);
  return true;
}

function ttShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ttLive(s)) return false;
  switch (code) {
    // Haunted Pillars: "Attacking enemy gets +3 [defense] until the end of
    // the phase."
    case N.pillars: {
      const q = (s.nightmare ??= {});
      q.trialsGuard = [
        ...(q.trialsGuard ?? []),
        { enemy: c.enemyId, round: s.round, phase: phaseKey(s) },
      ];
      return true;
    }
    // Trial of Ancestors: "If the defending character is not unique,
    // attacking enemy gets +10 [attack]."
    case N.ancestors: {
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u);
      if (defenders.some((d) => !unique(d))) c.attackBonus += 10;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareTrialsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ntt")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nttSpirit": {
      const spirit = SPIRITS[e.code ?? ""];
      if (!u || !spirit || !enemiesInPlay(s).some((x) => x.id === u.id))
        return true;
      const holder = allHeroes(s).find((h) =>
        h.attachments.some((a) => a.code === spirit.key),
      );
      const players = [
        ...new Set([
          ...(holder ? [ownerOf(s, holder)] : []),
          ...playerOrder(s).filter((q) =>
            seatView(s, q).engaged.some((x) => x.code === spirit.guardian),
          ),
        ]),
      ].filter((q) => !seatView(s, q).engaged.some((x) => x.id === u.id));
      if (!players.length) return true;
      const engageWith = (q: number) =>
        fx("nttEngage", { target: u.id, player: q });
      if (players.length === 1) {
        prepend(s, engageWith(players[0]));
        return true;
      }
      choose(
        s,
        `${name(u)} · Choose the player it engages`,
        players.map((q): Option => ({
          id: `p${q}`,
          label: `Engage${seatLabel(s, q) || " the player"}`,
          effects: [engageWith(q)],
        })),
        card(u.code).text,
      );
      return true;
    }
    case "nttEngage":
      if (u && enemiesInPlay(s).some((x) => x.id === u.id)) {
        engage(s, u);
        log(s, `${name(u)} engages${seatLabel(s, activeSeat(s))}.`, "danger");
      }
      return true;
    case "nttSacred": {
      const options = timedEnemies(s);
      if (!options.length) return true;
      const removeAll = (x: Unit) =>
        fx("trialsRemoveTime", {
          target: x.id,
          value: x.timeCounters ?? 0,
          player: p,
        });
      if (options.length === 1) {
        prepend(s, removeAll(options[0]));
        return true;
      }
      choose(
        s,
        "Sacred Forest · Remove each time counter from an enemy in play",
        options.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.timeCounters} time counters`,
          effects: [removeAll(x)],
        })),
        card(N.sacred).text,
      );
      return true;
    }
    case "nttPillars": {
      const active = allActiveLocations(s);
      const surge: Option = {
        id: "surge",
        label: "Haunted Pillars gains surge",
        effects: surgeEffects(N.pillars),
      };
      if (!active.length) {
        log(
          s,
          "Haunted Pillars: no active location to return; it gains surge.",
          "danger",
        );
        prepend(s, ...surge.effects);
        return true;
      }
      choose(
        s,
        "Haunted Pillars · Return the active location to the staging area, or Haunted Pillars gains surge",
        [
          ...active.map((l): Option => ({
            id: l.id,
            code: l.code,
            label: `Return ${name(l)} to the staging area`,
            effects: [fx("nttReturn", { target: l.id, player: p })],
          })),
          surge,
        ],
        card(N.pillars).text,
      );
      return true;
    }
    case "nttReturn":
      if (u && allActiveLocations(s).some((l) => l.id === u.id)) {
        removeActiveLocation(s, u.id);
        s.staging.push(u);
        log(
          s,
          `Haunted Pillars returns ${name(u)} to the staging area.`,
          "danger",
        );
      }
      return true;
    case "nttBurden": {
      const heroes = allHeroes(s).filter(
        (h) => keysOn(h).length > 0 && !burdened(h),
      );
      if (!heroes.length) {
        s.encounterDiscard.push(N.burden);
        log(s, "Cursed Burden: no hero holds a Key objective without it.");
        return true;
      }
      const attach = (h: Unit) =>
        fx("nttAttachBurden", { target: h.id, player: ownerOf(s, h) });
      if (heroes.length === 1) {
        prepend(s, attach(heroes[0]));
        return true;
      }
      choose(
        s,
        "Cursed Burden · Attach to a hero with a Key objective attached",
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [attach(h)],
        })),
        card(N.burden).text,
      );
      return true;
    }
    case "nttAttachBurden": {
      if (!u || burdened(u) || !keysOn(u).length) {
        s.encounterDiscard.push(N.burden);
        return true;
      }
      const a = make(s, N.burden);
      u.attachments.push({ id: a.id, code: N.burden, exhausted: false });
      if (u.committed) {
        u.committed = false;
        forOwner(s, ownerOf(s, u), () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
      }
      log(s, `Cursed Burden is attached to ${name(u)}.`, "danger");
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_TRIALS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stagingThreat: ttStagingThreat,
  damageAmount: ttDamageAmount,
  immune: ttImmune,
  cannotBeActiveLocation: ttCannotBeActiveLocation,
  stats: ttStats,
  threatBonus: ttThreatBonus,
  encounterBegin: ttEncounterBegin,
  enemyTimeRemoved: ttEnemyTimeRemoved,
  mustTravel: ttMustTravel,
  travelProblem: ttTravelProblem,
  travelEffects: ttTravelEffects,
  cannotCommit: ttCannotCommit,
  cannotDefend: ttCannotDefend,
  cannotAttack: ttCannotAttack,
  roundEnd: ttRoundEnd,
  encounter: ttEncounter,
  shadow: ttShadow,
  effect: nightmareTrialsEffect,
  sharedEffect: (e) =>
    ["nttSpirit", "nttSacred", "nttPillars", "nttReturn", "nttBurden"].includes(
      e.kind,
    ),
};

// ------------------------------------------------------------- saves

export function validNightmareTrials(s: GameState) {
  const list = s.nightmare?.trialsGuard;
  return (
    list === undefined ||
    (Array.isArray(list) &&
      list.every(
        (g) =>
          !!g &&
          typeof g.enemy === "string" &&
          Number.isInteger(g.round) &&
          g.round >= 0 &&
          typeof g.phase === "string",
      ))
  );
}
