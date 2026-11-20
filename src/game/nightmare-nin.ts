/**
 * The Nîn-in-Eilph's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (Ancient Marsh-dweller joins the staging area whenever the players
 * advance to stage 2A), its two new stages (An Arduous Journey and Deadly
 * Waters, drawn at random in place of A Weary Passage and Impassable
 * Marshland) and its Nightmare encounter cards, composed with the scenario's
 * own rules (src/game/nin-eilph.ts) through batch4Scenario while a Nightmare
 * mode game is played. The scenario's random stages, time counters and
 * Ancient Marsh-dweller serve the Nightmare cards. Effects use the "nni"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { NinExtras } from "./nin-eilph-support";
import { card, name } from "./cards";
import {
  characters,
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  stats,
} from "./core";
import {
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  removeFromQuest,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { returnToStaging } from "./black-riders-hunted";
import { canRemoveQuestTime } from "./quest-time";
import { NIN, ninCurrentQuest } from "./nin-eilph-support";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareNinState {
  /** Quicksand's shadow: characters that cannot ready until the end of the round. */
  ninUnready?: { id: string; round: number }[];
  /** Rotten Stench: each copy's phase, in which locations in the staging area get +1 [threat]. */
  ninStench?: { round: number; phase: string }[];
}

const niLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-nin-in-eilph";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const creature = (u: Unit) =>
  isEnemy(u) && /\bCreature\b/.test(card(u.code).traits ?? "");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const current = (s: GameState, code: string) =>
  niLive(s) && ninCurrentQuest(s) === code;
/** A character's [willpower], read in its controller's seat. */
function willOf(s: GameState, u: Unit) {
  let will = 0;
  forOwner(s, ownerOf(s, u), () => {
    will = stats(s, u).will;
  });
  return will;
}
const sandQuesters = (s: GameState) =>
  allCharacters(s).filter((u) => u.committed && willOf(s, u) >= 3);

// ------------------------------------------------------------- the stages

/** The setup card's new stages replace A Weary Passage (2B) and Impassable Marshland (3B). */
function niStageCandidates(
  s: GameState,
  stage: number,
  printed: readonly string[],
) {
  if (!niLive(s) || (stage !== 2 && stage !== 3)) return undefined;
  return printed.map((c) =>
    c === NIN.weary ? N.arduous : c === NIN.impassable ? N.deadly : c,
  );
}
/**
 * After the players advance to a quest stage: the setup card ("Forced: When
 * the players advance to stage 2A, add Ancient Marsh-dweller to the staging
 * area (from out of play or engaged with a player)."), each engaged Deadly
 * Marsh Adder, each Peat Bog in the staging area and each Swarms of
 * Mosquitoes in the victory display.
 */
function niStageRevealed(s: GameState, stage: number) {
  if (!niLive(s)) return;
  const first = firstPlayer(s);
  prepend(
    s,
    ...(stage === 2 ? [fx("nniDweller", { player: first })] : []),
    ...allEngaged(s)
      .filter((u) => live(s, u, N.marshAdder))
      .map((u) => fx("nniAdderReturn", { target: u.id, player: first })),
    ...s.staging
      .filter((u) => live(s, u, N.peat))
      .flatMap(() => playerOrder(s).map((player) => fx("nniPeat", { player }))),
    ...(s.victoryCards ?? [])
      .filter((c) => c === N.swarms)
      .map(() => fx("nniSwarms", { player: first })),
  );
}
/** An Arduous Journey: "Allies enter play exhausted." */
function niAllyEntered(s: GameState, u: Unit) {
  if (current(s, N.arduous) && !u.exhausted) {
    u.exhausted = true;
    log(s, `An Arduous Journey: ${name(u)} enters play exhausted.`, "danger");
  }
  return false;
}
/** Deadly Waters: "Treachery card effects cannot be canceled." */
const niCannotCancel = (s: GameState, _shadow?: boolean, code?: string) =>
  current(s, N.deadly) && !!code && card(code).type_code === "treachery";

// ------------------------------------------------------------- the cards

/** Desolate Meadow, in the staging area: "Forced: After any number of time counters are removed from the current quest, heal 2 damage on each Creature enemy in play." */
const niQuestTimeRemoved = (s: GameState): Effect[] =>
  niLive(s)
    ? s.staging
        .filter((u) => live(s, u, N.meadow))
        .map(() => fx("nniMeadow", { player: firstPlayer(s) }))
    : [];
/** Deadly Marsh Adder: "Forced: After Deadly Marsh Adder engages you, discard a damaged character you control." */
function niEngaged(s: GameState, u: Unit) {
  if (niLive(s) && live(s, u, N.marshAdder))
    prepend(s, fx("nniAdderDiscard", { target: u.id, player: activeSeat(s) }));
}
/** Rotten Stench: "Until the end of the phase, each location in the staging area gets +1 [threat]." */
const niThreatBonus = (s: GameState, u: Unit) =>
  niLive(s) && isLocation(u) && s.staging.some((x) => x.id === u.id)
    ? (s.nightmare?.ninStench ?? []).filter(
        (x) => x.round === s.round && x.phase === phaseKey(s),
      ).length
    : 0;
/** Quicksand's shadow: "Defending character cannot ready until the end of the round." */
const niCannotReady = (s: GameState, u: Unit) =>
  niLive(s) &&
  (s.nightmare?.ninUnready ?? []).some(
    (x) => x.id === u.id && x.round === s.round,
  );

function niEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!niLive(s) || (code !== N.quicksand && code !== N.stench)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Rotten Stench looks for the topmost location before joining the pile.
  prepend(
    s,
    fx(code === N.quicksand ? "nniQuicksand" : "nniStench", {
      player: firstPlayer(s),
    }),
    fx("nniDiscard", { code }),
  );
  return true;
}

function niShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !niLive(s)) return false;
  const defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  switch (code) {
    // Desolate Meadow: "If this attack destroys a character, remove all
    // progress from the current quest." (the scenario's own Finger of
    // Glanduin rule)
    case N.meadow:
      c.ninLoseProgressOnKill = true;
      return true;
    // Quicksand: "Defending character cannot ready until the end of the
    // round."
    case N.quicksand: {
      const q = (s.nightmare ??= {});
      q.ninUnready = [
        ...(q.ninUnready ?? []).filter((x) => x.round === s.round),
        ...defenders.map((id) => ({ id, round: s.round })),
      ];
      if (defenders.length)
        log(
          s,
          "Quicksand: the defending character cannot ready until the end of the round.",
          "danger",
        );
      return true;
    }
    // Rotten Stench: "Deal 1 damage to the defending character."
    case N.stench:
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
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareNinEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nni")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nniDweller":
      log(
        s,
        "The Nîn-in-Eilph · Nightmare: the players advance to stage 2A; Ancient Marsh-dweller joins the staging area.",
        "danger",
      );
      prepend(s, fx("ninReturnDweller", { text: "keep-damage", player: p }));
      return true;
    case "nniAdderReturn":
      if (u && live(s, u, N.marshAdder)) returnToStaging(s, u);
      return true;
    case "nniPeat":
      if (!s.hand.length) return true;
      {
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, pick.id, { encounterEffect: true });
        log(
          s,
          `Peat Bog${seatLabel(s, p)}: ${name(pick)} is discarded at random.`,
          "danger",
        );
      }
      return true;
    case "nniSwarms": {
      const i = s.victoryCards?.indexOf(N.swarms) ?? -1;
      if (i < 0) return true;
      s.victoryCards!.splice(i, 1);
      s.victory -= card(N.swarms).victory ?? 0;
      const swarm = make(s, N.swarms);
      s.staging.push(swarm);
      enemyAddedToStaging(s, swarm);
      log(
        s,
        "Swarms of Mosquitoes returns from the victory display to the staging area.",
        "danger",
      );
      return true;
    }
    case "nniMeadow": {
      const healed = enemiesInPlay(s).filter((x) => creature(x) && x.damage);
      log(
        s,
        `Desolate Meadow: each Creature enemy heals 2 damage${healed.length ? "" : " (none is damaged)"}.`,
        "danger",
      );
      prepend(
        s,
        ...healed.map((x) => fx("heal", { target: x.id, value: 2, player: p })),
      );
      return true;
    }
    case "nniAdderDiscard": {
      const damaged = characters(s).filter((x) => x.damage > 0);
      if (!damaged.length) {
        log(
          s,
          `Deadly Marsh Adder${seatLabel(s, p)}: no damaged character to discard.`,
        );
        return true;
      }
      const discard = (x: Unit) =>
        fx("nniDiscardCharacter", { target: x.id, player: p });
      if (damaged.length === 1) {
        prepend(s, discard(damaged[0]));
        return true;
      }
      choose(
        s,
        `Deadly Marsh Adder · Discard a damaged character you control${seatLabel(s, p)}`,
        damaged.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} (${x.damage} damage)`,
          effects: [discard(x)],
        })),
        card(N.marshAdder).text,
      );
      return true;
    }
    case "nniDiscardCharacter":
      if (u && characters(s).some((x) => x.id === u.id)) {
        log(s, `Deadly Marsh Adder: ${name(u)} is discarded.`, "danger");
        discardCharacter(s, u);
      }
      return true;
    case "nniDiscard":
      s.encounterDiscard.push(e.code!);
      return true;
    case "nniQuicksand": {
      const questers = sandQuesters(s);
      const options: Option[] = [
        ...(canRemoveQuestTime(s)
          ? [
              {
                id: "time",
                label: "Remove 1 time counter from the current quest",
                effects: [fx("removeQuestTime", { player: p })],
              },
            ]
          : []),
        ...(questers.length
          ? [
              {
                id: "quest",
                label: `Remove each character with 3 or more willpower from the quest (${questers.map(name).join(", ")})`,
                effects: [fx("nniQuicksandQuest", { player: p })],
              },
            ]
          : []),
      ];
      if (!options.length) {
        log(s, "Quicksand: no time counter or questing character to remove.");
        return true;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        "Quicksand · Remove 1 time counter, or remove each character with 3 or more willpower from the quest",
        options,
        card(N.quicksand).text,
      );
      return true;
    }
    case "nniQuicksandQuest":
      for (const x of sandQuesters(s)) {
        removeFromQuest(s, x);
        log(s, `Quicksand: ${name(x)} is removed from the quest.`, "danger");
      }
      return true;
    case "nniStench": {
      let i = s.encounterDiscard.length - 1;
      while (i >= 0 && card(s.encounterDiscard[i]).type_code !== "location")
        i--;
      if (i >= 0) {
        const [code] = s.encounterDiscard.splice(i, 1);
        s.staging.push(make(s, code));
        log(
          s,
          `Rotten Stench: ${card(code).name} returns from the encounter discard pile to the staging area.`,
          "danger",
        );
      } else
        log(s, "Rotten Stench: no location is in the encounter discard pile.");
      const q = (s.nightmare ??= {});
      q.ninStench = [
        ...(q.ninStench ?? []).filter((x) => x.round === s.round),
        { round: s.round, phase: phaseKey(s) },
      ];
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_NIN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageCandidates: niStageCandidates,
  stageRevealed: niStageRevealed,
  allyEntered: niAllyEntered,
  cannotCancel: niCannotCancel,
  questTimeRemoved: niQuestTimeRemoved,
  engaged: niEngaged,
  threatBonus: niThreatBonus,
  cannotReady: niCannotReady,
  encounter: niEncounter,
  shadow: niShadow,
  effect: nightmareNinEffect,
  sharedEffect: (e) =>
    [
      "nniDweller",
      "nniAdderReturn",
      "nniSwarms",
      "nniMeadow",
      "nniDiscard",
      "nniQuicksand",
      "nniQuicksandQuest",
      "nniStench",
    ].includes(e.kind),
};

// ------------------------------------------------------------- saves

/** The setup card's stage cards and the Nightmare locations a save may hold. */
export const ninNightmareExtras = (s: GameState): NinExtras =>
  s.nightmareMode && s.scenarioId === "the-nin-in-eilph"
    ? {
        quests: [
          { code: N.arduous, stage: 2 },
          { code: N.deadly, stage: 3 },
        ],
        locations: [N.meadow, N.peat],
      }
    : {};

export function validNightmareNin(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.ninUnready === undefined ||
      (Array.isArray(q.ninUnready) &&
        q.ninUnready.every(
          (x) => !!x && typeof x.id === "string" && n(x.round),
        ))) &&
    (q?.ninStench === undefined ||
      (Array.isArray(q.ninStench) &&
        q.ninStench.every(
          (x) => !!x && n(x.round) && typeof x.phase === "string",
        )))
  );
}
