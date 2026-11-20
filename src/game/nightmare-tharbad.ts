/**
 * Trouble in Tharbad's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (each player's starting threat is raised by 5; progress cannot be
 * placed on The Crossing at Tharbad while Bellach is in play) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/tharbad.ts) through batch4Scenario while a Nightmare mode game is
 * played. The scenario's time counters and threat elimination level serve
 * the Nightmare cards; the Nightmare reductions of that level (by 2 and 5)
 * are kept beside the scenario's own steps of 10. Effects use the "nth"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend } from "./core";
import { check, engage, enemyAddedToStaging } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { canRemoveQuestTime, questTime } from "./quest-time";
import { resolveDoomed } from "./voice-isengard";
import { threatElimination } from "./threat-elimination";
import { THARBAD as T } from "./tharbad-support";
import { NIGHTMARE_RINGMAKER as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, undefended } from "./nightmare-core";

export interface NightmareTharbadState {
  /** The Nightmare cards' reductions of each player's threat elimination level. */
  tharbadReduction?: number;
  /** Dark Pathway: the round whose first treachery without printed surge has been revealed in the quest phase. */
  tharbadPathwayRound?: number;
  /** Dark Pathway gave surge to a Conspicuous Lot this round, whose own surge check is pending. */
  tharbadPathwayLot?: number;
}

const thLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "trouble-in-tharbad";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const printedSurge = (code: string) =>
  /(?:^|[.\n]\s*)Surge(?:[.\s]|$)/i.test(card(code).text ?? "");
const threatOf = (s: GameState, p: number) => seatView(s, p).threat;
const patrolled = (u: Unit) =>
  u.attachments.some((a) => a.code === N.patrol && !a.blanked);
const reduce = (value: number, player: number) =>
  fx("nthReduce", { value, player });

// ------------------------------------------------------------- the setup card

/** "Setup: Raise each player's starting threat by 5." */
const thSetupFollowUp = (s: GameState): Effect[] =>
  thLive(s) ? [fx("nthSetup", { player: firstPlayer(s) })] : [];
/** "Progress cannot be placed on The Crossing at Tharbad while Bellach is in play." */
const thLocationProgressBlocked = (s: GameState, u: Unit) =>
  thLive(s) &&
  u.code === T.crossing &&
  !u.blanked &&
  enemiesInPlay(s).some((e) => e.code === T.bellach && !e.blanked);

// ------------------------------------------------------------- the cards

/** Bellach's Hunter: "While a player controls 5 or more allies, Bellach's Hunter gets -20 engagement cost." */
const thEngagementBonus = (s: GameState, u: Unit) =>
  thLive(s) &&
  live(s, u, N.hunter) &&
  playerOrder(s).some((p) => seatView(s, p).allies.length >= 5)
    ? -20
    : 0;
/**
 * Bellach's Hunter: "Forced: When Bellach's Hunter engages a player, that
 * player must either remove all time counters from the current quest or
 * deal 5 damage to a hero he controls." Blood Hound: "Forced: When Blood
 * Hound engages you, raise your threat by 5."
 */
function thEngaged(s: GameState, u: Unit) {
  if (!thLive(s)) return;
  const p = activeSeat(s);
  if (live(s, u, N.hunter))
    prepend(s, fx("nthHunter", { target: u.id, player: p }));
  if (live(s, u, N.hound)) {
    log(s, `Blood Hound engages${seatLabel(s, p)}: threat +5.`, "danger");
    prepend(s, fx("heirsThreat", { value: 5, player: p }));
  }
}
/** City of Spies, in the staging area: "Forced: When you commit a character to the quest, raise your threat by 1. This effect does not stack with other copies of City of Spies." */
function thCharactersCommitted(s: GameState, units: Unit[]) {
  if (!thLive(s) || !units.length || !staged(s, N.city).length) return;
  log(
    s,
    `City of Spies: ${units.length} committed ${units.length === 1 ? "character raises" : "characters raise"} threat.`,
    "danger",
  );
  prepend(
    s,
    ...units.map((u) => fx("heirsThreat", { value: 1, player: ownerOf(s, u) })),
  );
}
/** Dark Pathway, as the active location: "the first treachery card without the printed surge keyword revealed during the quest phase gains surge." */
function thRevealedSurge(s: GameState, code: string) {
  if (
    !thLive(s) ||
    (s.phase !== "quest" && s.phase !== "staging") ||
    card(code).type_code !== "treachery" ||
    printedSurge(code)
  )
    return false;
  const q = (s.nightmare ??= {});
  if (q.tharbadPathwayRound === s.round) return false;
  q.tharbadPathwayRound = s.round;
  const pathway = allActiveLocations(s).some((l) => live(s, l, N.pathway));
  if (pathway) {
    log(
      s,
      `Dark Pathway: ${card(code).name}, the first treachery of the quest phase without surge, gains surge.`,
      "danger",
    );
    // A card surges once: Conspicuous Lot's own "gains surge" adds nothing.
    if (code === T.lot) q.tharbadPathwayLot = s.round;
  }
  return pathway;
}
/** Tharbad Patrol: "Forced: After the players travel to attached location, each player must discard the top 2 cards from the encounter deck and engage each enemy he discarded in this way." */
function thTravelEntered(s: GameState, u: Unit, actualTravel: boolean) {
  if (!thLive(s) || !actualTravel || !patrolled(u)) return;
  log(
    s,
    `Tharbad Patrol: the patrol at ${name(u)} springs its trap.`,
    "danger",
  );
  prepend(
    s,
    ...u.attachments
      .filter((a) => a.code === N.patrol && !a.blanked)
      .flatMap(() =>
        playerOrder(s).map((player) => fx("nthPatrol", { player })),
      ),
  );
}

function thEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !thLive(s) ||
    (code !== N.seeker && code !== N.waylaid && code !== N.patrol)
  )
    return false;
  if (code === N.seeker) {
    // Orc Seeker (already in the staging area): "Either reduce each player's
    // threat elimination level by 2, or Orc Seeker engages the first player
    // and makes an immediate attack."
    if (fromReveal) {
      const seeker = [...s.staging].reverse().find((u) => u.code === code);
      prepend(
        s,
        fx("nthSeeker", { target: seeker?.id, player: firstPlayer(s) }),
      );
    }
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
  if (code === N.patrol) {
    // Tharbad Patrol: "Attach Tharbad Patrol to a non-unique location in the
    // staging area without a copy of Tharbad Patrol attached." Its surge is
    // printed.
    prepend(s, fx("nthPatrolAttach", { player: firstPlayer(s) }));
    return true;
  }
  // Waylaid by Agents: "Each player must choose: either remove 1 time counter
  // from the quest or discard an ally he controls from play. Then, if any
  // player's threat is 20 or less, Waylaid by Agents gains doomed 3."
  s.encounterDiscard.push(code);
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("nthWaylaid", { player })),
    fx("nthWaylaidDoom", { player: firstPlayer(s) }),
  );
  return true;
}

function thShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !thLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Orc Seeker: "Reduce each player's threat elimination level by 2 (5
    // instead if undefended)."
    case N.seeker:
      prepend(s, reduce(undefended(s) ? 5 : 2, firstPlayer(s)));
      return true;
    // Blood Hound: "Either raise your threat by 10, or attacking enemy makes
    // an additional attack against you after this one."
    case N.hound:
      prepend(s, fx("nthHound", { player: attacked }));
      return true;
    // Dark Pathway: "Either remove 1 time counter from the current quest or
    // treat this attack as undefended."
    case N.pathway:
      prepend(s, fx("nthPathway", { player: attacked }));
      return true;
    // Waylaid by Agents: "Attacking enemy gets +1 [attack] (+3 [attack]
    // instead if your threat is 20 or less)."
    case N.waylaid:
      c.attackBonus += threatOf(s, attacked) <= 20 ? 3 : 1;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareTharbadEffect(s: GameState, e: Effect): boolean {
  if (e.kind === "tharbadLotSurge" && thLive(s)) {
    const q = s.nightmare;
    if (q?.tharbadPathwayLot === undefined) return false;
    const surged = q.tharbadPathwayLot === s.round;
    delete q.tharbadPathwayLot;
    if (surged) log(s, "Conspicuous Lot already has surge from Dark Pathway.");
    return surged;
  }
  if (!e.kind.startsWith("nth")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nthSetup":
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          s.threat += 5;
        });
      log(
        s,
        "Trouble in Tharbad · Nightmare: each player's starting threat is raised by 5.",
        "danger",
      );
      return true;
    case "nthReduce": {
      const q = (s.nightmare ??= {});
      q.tharbadReduction = (q.tharbadReduction ?? 0) + (e.value ?? 0);
      log(
        s,
        `Each player's threat elimination level is reduced by ${e.value} (now ${threatElimination(s)}).`,
        "danger",
      );
      check(s);
      return true;
    }
    case "nthHunter": {
      const time = questTime(s)?.time ?? 0;
      const heroes = seatView(s, p).heroes;
      const options: Option[] = [
        ...(time > 0 && canRemoveQuestTime(s)
          ? [
              {
                id: "time",
                label: `Remove all ${time} time counters from the current quest`,
                effects: [fx("removeQuestTime", { value: time, player: p })],
              },
            ]
          : []),
        ...heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `Deal 5 damage to ${name(h)}`,
          effects: [fx("damage", { target: h.id, value: 5, player: p })],
        })),
      ];
      if (!options.length) return true;
      choose(
        s,
        `Bellach's Hunter · Remove all time counters, or deal 5 damage to a hero you control${seatLabel(s, p)}`,
        options,
        card(N.hunter).text,
      );
      return true;
    }
    case "nthSeeker": {
      const seeker = u && s.staging.some((x) => x.id === u.id) ? u : undefined;
      if (!seeker) {
        prepend(s, reduce(2, p));
        return true;
      }
      choose(
        s,
        "Orc Seeker · Reduce each player's threat elimination level by 2, or it engages the first player and attacks",
        [
          {
            id: "reduce",
            label: "Reduce each player's threat elimination level by 2",
            effects: [reduce(2, p)],
          },
          {
            id: "attack",
            code: seeker.code,
            label:
              "Orc Seeker engages the first player and makes an immediate attack",
            effects: [fx("nthSeekerAttack", { target: seeker.id, player: p })],
          },
        ],
        card(N.seeker).text,
      );
      return true;
    }
    case "nthSeekerAttack":
      if (u && s.staging.some((x) => x.id === u.id)) {
        engage(s, u);
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    case "nthWaylaid": {
      const allies = seatView(s, p).allies;
      const options: Option[] = [
        ...(canRemoveQuestTime(s)
          ? [
              {
                id: "time",
                label: "Remove 1 time counter from the quest",
                effects: [fx("removeQuestTime", { player: p })],
              },
            ]
          : []),
        ...allies.map((a): Option => ({
          id: a.id,
          code: a.code,
          label: `Discard ${name(a)}`,
          effects: [fx("nthDiscardAlly", { target: a.id, player: p })],
        })),
      ];
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Waylaid by Agents · Remove 1 time counter, or discard an ally you control${seatLabel(s, p)}`,
        options,
        card(N.waylaid).text,
      );
      return true;
    }
    case "nthDiscardAlly":
      if (u && seatView(s, p).allies.some((a) => a.id === u.id))
        prepend(s, fx("trialsDiscardCharacter", { target: u.id, player: p }));
      return true;
    case "nthWaylaidDoom":
      if (playerOrder(s).some((q) => threatOf(s, q) <= 20)) {
        log(
          s,
          "Waylaid by Agents: a player's threat is 20 or less; it gains doomed 3.",
          "danger",
        );
        resolveDoomed(s, 3, "encounter");
      }
      return true;
    case "nthHound": {
      const c = s.combat;
      choose(
        s,
        `Blood Hound · Raise your threat by 10, or the attacker attacks you again${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 10",
            effects: [fx("heirsThreat", { value: 10, player: p })],
          },
          ...(c
            ? [
                {
                  id: "attack",
                  label:
                    "The attacking enemy makes an additional attack after this one",
                  effects: [fx("nthExtraAttack", { player: p })],
                },
              ]
            : []),
        ],
        card(N.hound).shadow,
      );
      return true;
    }
    case "nthExtraAttack":
      if (s.combat) s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      return true;
    case "nthPathway": {
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
        {
          id: "undefended",
          label: "Treat this attack as undefended",
          effects: [fx("nthUndefended", { player: p })],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Dark Pathway · Remove 1 time counter, or this attack is undefended${seatLabel(s, p)}`,
        options,
        card(N.pathway).shadow,
      );
      return true;
    }
    case "nthUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, "Dark Pathway: this attack is considered undefended.", "danger");
      }
      return true;
    case "nthPatrolAttach": {
      const hosts = s.staging.filter(
        (l) =>
          card(l.code).type_code === "location" &&
          !card(l.code).is_unique &&
          !patrolled(l),
      );
      if (!hosts.length) {
        s.encounterDiscard.push(N.patrol);
        log(
          s,
          "Tharbad Patrol: no non-unique location in the staging area can take it.",
        );
        return true;
      }
      const attach = (l: Unit) =>
        fx("nthPatrolOn", { target: l.id, player: p });
      if (hosts.length === 1) {
        prepend(s, attach(hosts[0]));
        return true;
      }
      choose(
        s,
        "Tharbad Patrol · Attach to a non-unique location in the staging area",
        hosts.map((l): Option => ({
          id: l.id,
          code: l.code,
          label: name(l),
          effects: [attach(l)],
        })),
        card(N.patrol).text,
      );
      return true;
    }
    case "nthPatrolOn":
      if (u && !patrolled(u)) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: N.patrol,
          exhausted: false,
        });
        log(s, `Tharbad Patrol is attached to ${name(u)}.`, "danger");
      } else s.encounterDiscard.push(N.patrol);
      return true;
    case "nthPatrol": {
      const cards = s.encounterDeck.splice(0, 2);
      s.encounterDiscard.push(...cards);
      log(
        s,
        `Tharbad Patrol: ${cards.length ? cards.map((c) => card(c).name).join(" and ") : "nothing"} discarded${seatLabel(s, p)}.`,
        "danger",
      );
      for (const code of cards.filter((c) => card(c).type_code === "enemy")) {
        const i = s.encounterDiscard.lastIndexOf(code);
        if (i < 0) continue;
        s.encounterDiscard.splice(i, 1);
        const enemy = make(s, code);
        engage(s, enemy);
        if (!allEngaged(s).some((x) => x.id === enemy.id)) {
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
        }
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_THARBAD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  setupFollowUp: thSetupFollowUp,
  locationProgressBlocked: thLocationProgressBlocked,
  engagementBonus: thEngagementBonus,
  engaged: thEngaged,
  charactersCommitted: thCharactersCommitted,
  revealedSurge: thRevealedSurge,
  travelEntered: thTravelEntered,
  encounter: thEncounter,
  shadow: thShadow,
  effect: nightmareTharbadEffect,
  sharedEffect: (e) =>
    [
      "nthSetup",
      "nthReduce",
      "nthSeeker",
      "nthWaylaidDoom",
      "nthPatrolAttach",
      "nthPatrolOn",
    ].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareTharbad(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.tharbadReduction === undefined ||
      (n(q.tharbadReduction) && q.tharbadReduction <= 50)) &&
    (q?.tharbadPathwayRound === undefined || n(q.tharbadPathwayRound)) &&
    (q?.tharbadPathwayLot === undefined || n(q.tharbadPathwayLot))
  );
}
