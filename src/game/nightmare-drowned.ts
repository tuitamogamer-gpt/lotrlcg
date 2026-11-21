/**
 * The Drowned Ruins' Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (the removals from the encounter deck and the Grotto deck, and Captain
 * Sahír's attack on each player at stage 2A, are the scenario's own setup
 * and quest, in src/game/drowned.ts, as are the Grotto locations' sides,
 * the Underwater sides' Forced effects, Flooded Caverns' Forced effect and
 * Great Shark's engagement) and its Nightmare encounter cards, composed with
 * the scenario's rules through batch4Scenario while a Nightmare mode game is
 * played. Effects use the "ndw" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  stats,
  threatOf,
} from "./core";
import { enemyAddedToStaging, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { isHero, unitType } from "./card-types";
import { surgeEffects } from "./surge";
import { dealEnemyShadows } from "./considered-engagement";
import { drownedFlip } from "./drowned";
import {
  DROWNED_NIGHTMARE as N,
  drownedState,
  drownedUnderwater,
} from "./drowned-support";
import { nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareDrownedState {
  /** Jagged Cavern: the treachery cards revealed this round. */
  drownedTreacheries?: { round: number; count: number };
  /** Sharp Precipice: the copies in the staging area as the players were faced with the option to travel. */
  drownedPrecipice?: { round: number; copies: number };
  /** Pit into the Depths: the copies resolved this quest phase (each ally gets -1 [willpower] for each). */
  drownedPit?: { round: number; copies: number };
  /** Sulfur Cloud: the progress Underwater locations may still receive this phase. */
  drownedSulfur?: { round: number; phase: string; cap: number };
}

const ndwLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-drowned-ruins" && !!s.drowned;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
/** The active location by its title, while its text is active. */
const activeNamed = (s: GameState, title: string) =>
  allActiveLocations(s).some((u) => card(u.code).name === title && !u.blanked);
/** Underwater locations in the victory display (Great Shark). */
const underwaterVictories = (s: GameState) =>
  (drownedState(s)?.victoryLocations ?? []).filter((u) =>
    trait(u, "Underwater"),
  ).length;
const thisRound = <T extends { round: number }>(s: GameState, t?: T) =>
  t && t.round === s.round ? t : undefined;

// ------------------------------------------------------------- passives

/** The setup card: "While the active location is Underwater, encounter card effects cannot be canceled." */
const ndwCannotCancel = (s: GameState) => ndwLive(s) && drownedUnderwater(s);
/**
 * Great Shark: "+1 [threat], +1 [attack], and +1 [defense] for each
 * Underwater location in the victory display." Pit into the Depths: "Until
 * the end of the quest phase, each ally gets -1 [willpower]."
 */
function ndwStats(s: GameState, u: Unit) {
  if (!ndwLive(s)) return {};
  if (u.code === N.shark && !u.blanked) {
    const x = underwaterVictories(s);
    return x ? { attack: x, defense: x } : {};
  }
  // An objective-ally under a player's control is an ally too.
  const pit = thisRound(s, s.nightmare?.drownedPit);
  if (
    pit &&
    ["ally", "objective-ally"].includes(unitType(u)) &&
    ["quest", "staging"].includes(s.phase)
  )
    return { will: -pit.copies };
  return {};
}
/**
 * Great Shark's threat; Flooded Caverns: "If Flooded Caverns is in the
 * staging area and the active location is Underwater, add that location's
 * [threat] to the [threat] of Flooded Caverns."
 */
function ndwThreatBonus(s: GameState, u: Unit) {
  if (!ndwLive(s) || u.blanked) return 0;
  if (u.code === N.shark) return underwaterVictories(s);
  if (
    u.code === N.flooded &&
    s.staging.some((x) => x.id === u.id) &&
    drownedUnderwater(s)
  )
    return allActiveLocations(s)
      .filter((l) => trait(l, "Underwater"))
      .reduce((n, l) => n + threatOf(s, l), 0);
  return 0;
}
/** Great Shark "cannot be … damaged unless the active location is Underwater." */
const ndwDamageAmount = (s: GameState, u: Unit, amount: number) =>
  ndwLive(s) && u.code === N.shark && !u.blanked && !drownedUnderwater(s)
    ? 0
    : amount;
/** Overgrown Passage: "While Overgrown Passage is the active location, heroes cannot gain resources." */
const ndwCannotGainResources = (s: GameState, u: Unit) =>
  ndwLive(s) && isHero(u) && activeNamed(s, "Overgrown Passage");

/** Jagged Cavern: "the first treachery card revealed each round gains doomed 1 and surge." */
function ndwRevealed(s: GameState, code: string) {
  if (!ndwLive(s) || card(code).type_code !== "treachery") return;
  const q = (s.nightmare ??= {});
  const t = thisRound(s, q.drownedTreacheries);
  q.drownedTreacheries = { round: s.round, count: (t?.count ?? 0) + 1 };
}
const firstTreachery = (s: GameState, code: string) =>
  ndwLive(s) &&
  card(code).type_code === "treachery" &&
  thisRound(s, s.nightmare?.drownedTreacheries)?.count === 1 &&
  activeNamed(s, "Jagged Cavern");
const ndwRevealedDoomed = (s: GameState, code: string) =>
  firstTreachery(s, code) ? 1 : 0;
const ndwRevealedSurge = (s: GameState, code: string) =>
  firstTreachery(s, code);

/** Submerged Crawlway: "deal each engaged enemy 1 additional shadow card at the beginning of the combat phase." */
function ndwCombatBegin(s: GameState) {
  if (!ndwLive(s) || !activeNamed(s, "Submerged Crawlway")) return;
  const engaged = allEngaged(s);
  for (const u of engaged) dealEnemyShadows(s, u, 1);
  if (engaged.length)
    log(
      s,
      "Submerged Crawlway: each engaged enemy is dealt 1 additional shadow card.",
      "danger",
    );
}

/**
 * Sharp Precipice: "Forced: When faced with the option to travel, if you do
 * not choose to travel to a location named Sharp Precipice, you must raise
 * each player's threat by 3." Each copy in the staging area as the travel
 * phase offers travel (no active location) counts.
 */
function ndwTravelBegin(s: GameState) {
  if (!ndwLive(s) || allActiveLocations(s).length) return;
  const copies = s.staging.filter(
    (u) => u.code === N.precipice && !u.blanked,
  ).length;
  const q = (s.nightmare ??= {});
  if (copies) q.drownedPrecipice = { round: s.round, copies };
  else delete q.drownedPrecipice;
}
function ndwTravelEntered(s: GameState, u: Unit) {
  if (!ndwLive(s) || card(u.code).name !== "Sharp Precipice") return;
  delete s.nightmare?.drownedPrecipice;
}
function ndwEncounterBegin(s: GameState) {
  const p = thisRound(s, s.nightmare?.drownedPrecipice);
  if (!ndwLive(s) || !p) return;
  delete s.nightmare!.drownedPrecipice;
  log(
    s,
    `Sharp Precipice: the players did not travel to it, so each player raises their threat by ${3 * p.copies}.`,
    "danger",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("ndwThreat", { value: 3 * p.copies, player }),
    ),
  );
}

/** Sulfur Cloud: "No more than X progress may be placed on Underwater locations this phase." */
const sulfur = (s: GameState) => {
  const t = s.nightmare?.drownedSulfur;
  return t && t.round === s.round && t.phase === phaseKey(s) ? t : undefined;
};
const ndwProgressCapacity = (s: GameState, u: Unit) =>
  ndwLive(s) && trait(u, "Underwater") ? sulfur(s)?.cap : undefined;
function ndwProgressPlaced(s: GameState, u: Unit, amount: number) {
  const t = sulfur(s);
  if (ndwLive(s) && t && trait(u, "Underwater"))
    t.cap = Math.max(0, t.cap - amount);
}

// ------------------------------------------------------------- the cards

function ndwEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ndwLive(s) || ![N.submerged, N.sulfur, N.pit].includes(code))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  // Submerged Dead is an enemy, already in the staging area.
  if (code !== N.submerged) s.encounterDiscard.push(code);
  if (fromReveal)
    prepend(
      s,
      fx(
        code === N.submerged
          ? "ndwSubmerged"
          : code === N.sulfur
            ? "ndwSulfur"
            : "ndwPit",
        { code, player: firstPlayer(s) },
      ),
    );
  return true;
}

function ndwShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ndwLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Submerged Dead: "If the active location is Underwater, put Submerged
    // Dead into play in the staging area."
    case N.submerged: {
      if (!drownedUnderwater(s) || !enemy) return true;
      const index = enemy.shadows.lastIndexOf(N.submerged);
      if (index < 0) return true;
      removeShadowCard(enemy, index);
      const u = make(s, N.submerged);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(
        s,
        "Submerged Dead leaves the shadow cards and enters the staging area.",
        "danger",
      );
      return true;
    }
    // Pit into the Depths: "If the active location is Underwater, treat
    // this attack as if it were undefended."
    case N.pit:
      if (drownedUnderwater(s)) {
        c.defenderId = null;
        c.defenderIds = [];
        log(s, "Pit into the Depths: this attack is undefended.", "danger");
      }
      return true;
  }
  return false;
}

/** Undersea Cave Troll: the excess points of damage its attack deals. */
function ndwDamageDealt(
  s: GameState,
  u: Unit,
  _amount: number,
  ctx: DamageContext,
) {
  const c = s.combat;
  if (
    !ndwLive(s) ||
    !c ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !allCharacters(s).some((x) => x.id === u.id)
  )
    return;
  const enemy = get(s, c.enemyId);
  if (!enemy || enemy.code !== N.troll || enemy.blanked) return;
  c.nmExcess = (c.nmExcess ?? 0) + Math.max(0, u.damage - stats(s, u).health);
}
function ndwAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!ndwLive(s) || skipped || !combat.nmExcess) return [];
  const enemy = get(s, combat.enemyId);
  if (enemy && (enemy.code !== N.troll || enemy.blanked)) return [];
  return [
    fx("ndwTroll", {
      value: combat.nmExcess,
      player: combat.attackPlayer ?? firstPlayer(s),
    }),
  ];
}

export function nightmareDrownedEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndw")) return false;
  if (!ndwLive(s)) return true;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "ndwThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      return true;
    // Submerged Dead: "If the active location is Underwater, return each
    // other Submerged Dead in the encounter discard pile to the staging
    // area."
    case "ndwSubmerged": {
      if (!drownedUnderwater(s)) return true;
      const n = s.encounterDiscard.filter((c) => c === N.submerged).length;
      s.encounterDiscard = s.encounterDiscard.filter((c) => c !== N.submerged);
      for (let i = 0; i < n; i++) {
        const u = make(s, N.submerged);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      if (n)
        log(
          s,
          `Submerged Dead: ${n} more ${n === 1 ? "copy returns" : "copies return"} from the encounter discard pile to the staging area.`,
          "danger",
        );
      return true;
    }
    // Sulfur Cloud: "If the active location is Underwater, choose a number
    // and raise each player's threat by that number … If the active
    // location is not Underwater, Sulfur Cloud gains surge."
    case "ndwSulfur": {
      if (!drownedUnderwater(s)) {
        log(
          s,
          "Sulfur Cloud: the active location is not Underwater, so it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(N.sulfur));
        return true;
      }
      const options: Option[] = Array.from({ length: 9 }, (_, n) => ({
        id: `number-${n}`,
        label: `${n} · each player raises their threat by ${n}; Underwater locations may receive ${2 * n} progress this phase`,
        effects: [fx("ndwSulfurNumber", { value: n, player: firstPlayer(s) })],
      }));
      choose(
        s,
        `Sulfur Cloud · Choose a number${seatLabel(s, firstPlayer(s))}`,
        options,
        "Each player raises their threat by the chosen number. No more than twice that number of progress may be placed on Underwater locations this phase.",
      );
      return true;
    }
    case "ndwSulfurNumber": {
      const n = e.value ?? 0;
      const q = (s.nightmare ??= {});
      const t = sulfur(s);
      q.drownedSulfur = {
        round: s.round,
        phase: phaseKey(s),
        cap: Math.min(2 * n, t?.cap ?? Infinity),
      };
      log(
        s,
        `Sulfur Cloud: the number is ${n}; no more than ${q.drownedSulfur.cap} progress may be placed on Underwater locations this phase.`,
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("ndwThreat", { value: n, player }),
        ),
      );
      return true;
    }
    // Pit into the Depths: "Until the end of the quest phase, each ally gets
    // -1 [willpower]. If the active location has the Grotto trait, remove all
    // progress from it and flip it to its Underwater side."
    case "ndwPit": {
      const q = (s.nightmare ??= {});
      const t = thisRound(s, q.drownedPit);
      q.drownedPit = { round: s.round, copies: (t?.copies ?? 0) + 1 };
      const grotto = allActiveLocations(s).filter((l) => trait(l, "Grotto"));
      for (const l of grotto) {
        l.progress = 0;
        drownedFlip(s, l);
      }
      log(
        s,
        `Pit into the Depths: each ally gets -1 willpower until the end of the quest phase${grotto.length ? `; ${grotto.map((l) => name(l)).join(", ")} loses its progress and flips` : ""}.`,
        "danger",
      );
      return true;
    }
    // Undersea Cave Troll: "discard 1 resource from one of your
    // objective-allies or from one of your heroes' resource pools" for each
    // point of excess damage.
    case "ndwTroll": {
      const n = e.value ?? 0;
      if (n <= 0) return true;
      const holders = allCharacters(s).filter(
        (u) =>
          ownerOf(s, u) === p &&
          (isHero(u) || unitType(u) === "objective-ally") &&
          u.resources > 0,
      );
      if (!holders.length) return true;
      choose(
        s,
        `Undersea Cave Troll · Discard a resource (${n} left)${seatLabel(s, p)}`,
        holders.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard 1 resource from ${name(u)}`,
          effects: [
            fx("ndwTrollResource", { target: u.id, player: p }),
            fx("ndwTroll", { value: n - 1, player: p }),
          ],
        })),
        `${seatName(s, p)} discards 1 resource for each point of excess damage.`,
      );
      return true;
    }
    case "ndwTrollResource": {
      const u = get(s, e.target);
      if (u && u.resources > 0) u.resources--;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- saves

export function validNightmareDrowned(s: GameState) {
  const q = s.nightmare;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const positive = (n: unknown) => Number.isInteger(n) && (n as number) > 0;
  const ok = (t: unknown, check: (t: Record<string, unknown>) => boolean) =>
    t === undefined ||
    (ndwLive(s) &&
      !!t &&
      typeof t === "object" &&
      check(t as Record<string, unknown>));
  return (
    ok(q?.drownedTreacheries, (t) => round(t.round) && positive(t.count)) &&
    ok(q?.drownedPrecipice, (t) => round(t.round) && positive(t.copies)) &&
    ok(q?.drownedPit, (t) => round(t.round) && positive(t.copies)) &&
    ok(
      q?.drownedSulfur,
      (t) =>
        round(t.round) &&
        typeof t.phase === "string" &&
        Number.isInteger(t.cap) &&
        (t.cap as number) >= 0,
    )
  );
}

export const NIGHTMARE_DROWNED_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotCancel: ndwCannotCancel,
  stats: ndwStats,
  threatBonus: ndwThreatBonus,
  damageAmount: ndwDamageAmount,
  cannotGainResources: ndwCannotGainResources,
  revealed: ndwRevealed,
  revealedDoomed: ndwRevealedDoomed,
  revealedSurge: ndwRevealedSurge,
  combatBegin: ndwCombatBegin,
  travelBegin: ndwTravelBegin,
  travelEntered: ndwTravelEntered,
  encounterBegin: ndwEncounterBegin,
  locationProgressCapacity: ndwProgressCapacity,
  locationProgressPlaced: ndwProgressPlaced,
  encounter: ndwEncounter,
  shadow: ndwShadow,
  damageDealt: ndwDamageDealt,
  attackFinished: ndwAttackFinished,
  effect: nightmareDrownedEffect,
  sharedEffect: () => false,
};
