import { choosePlayerResponse } from "./player-ability-triggers";
import { mainQuestCode } from "./quest-state";
// Original Return to Mirkwood: controlled Gollum, guard transfers and all printed encounters.
import encounters from "../data/return-mirkwood-encounter-cards.json";
import quests from "../data/return-mirkwood-quest-cards.json";
import { card } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  removeShadowCard,
  shuffle,
  skip,
} from "./core";
import {
  questDefeated,
  check,
  discardPlayerDeck,
  engage,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
  selectSeat,
} from "./table";

export const RETURN_MIRKWOOD_ENCOUNTERS = encounters as Card[];
export const RETURN_MIRKWOOD_QUESTS = quests as Card[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801206c${suffix}`;
export const RETURN = {
  ambush: code("9001"),
  attercop: code("9004"),
  watercourse: code("9007"),
  escape: code("9010"),
  gollum: code("9012"),
  anguish: code("9013"),
  bite: code("9014"),
  bats: code("9015"),
  ring: code("9020"),
  forest: code("9021"),
  halls: code("9023"),
  provisions: code("9025"),
  path: code("9027"),
  glade: code("9028"),
} as const;
export const returnMirkwoodGollum = (s: GameState) =>
  allCharacters(s).find((u) => u.code === RETURN.gollum);
export const returnMirkwoodGuard = (s: GameState) => {
  const g = returnMirkwoodGollum(s);
  return g ? ownerOf(s, g) : undefined;
};
const lockedGuard = (s: GameState) =>
  allActiveLocations(s).some((u) => u.code === RETURN.ring);
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
export function setupReturnMirkwood(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter((c) => c !== RETURN.gollum);
  forOwner(s, s.table?.first ?? 0, () => s.allies.push(make(s, RETURN.gollum)));
  shuffle(s, s.encounterDeck);
  prepend(
    s,
    fx("returnStartingGuard", { player: s.table?.first ?? 0 }),
    ...playerOrder(s).map((player) => fx("reveal", { player })),
  );
  log(
    s,
    "Choose who guards Gollum, then reveal one encounter per player.",
    "chapter",
  );
}
export function returnMirkwoodCheck(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood" || s.status !== "playing") return;
  const g = returnMirkwoodGollum(s);
  if (!g) {
    lose(
      s,
      "Gollum has left play. The captive must reach Thranduil's halls alive.",
    );
    return;
  }
  const guard = ownerOf(s, g),
    p = seatView(s, guard);
  if (p.threat >= 50 || !p.heroes.length || s.table?.seats[guard].eliminated)
    lose(s, "The player guarding Gollum has been eliminated. Gollum escapes.");
}
export function advanceReturnMirkwood(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood") return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length
  )
    return true;
  const required = [12, 3, 7, 2][s.stage - 1];
  if (s.progress < required) return true;
  if (s.stage === 4) {
    if (
      ![...s.staging, ...allEngaged(s)].some(
        (u) => card(u.code).type_code === "enemy",
      )
    )
      win(s);
  } else {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage++;
    s.progress = 0;
    log(
      s,
      `A new chapter: ${["", "Escape Attempt", "To the Elvin King's Halls", "Ambush"][s.stage - 1]}.`,
      "chapter",
    );
  }
  return true;
}
export const returnMirkwoodCanFight = (u: Unit) => u.code !== RETURN.gollum;
export const returnMirkwoodCanCommit = (s: GameState, u: Unit) =>
  u.code !== RETURN.gollum &&
  !(
    s.scenarioId === "return-to-mirkwood" &&
    s.stage === 2 &&
    livingSeats(s).length > 1 &&
    ownerOf(s, u) === returnMirkwoodGuard(s)
  );
export const returnMirkwoodCannotPlay = (
  s: GameState,
  player = activeSeat(s),
) =>
  s.scenarioId === "return-to-mirkwood" &&
  s.stage === 3 &&
  player === returnMirkwoodGuard(s);
export function returnMirkwoodQuestFailed(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood" || s.stage !== 2) return false;
  lose(
    s,
    "The party quests unsuccessfully during Escape Attempt. Gollum escapes.",
  );
  return true;
}
export function returnMirkwoodUndefendedTarget(s: GameState, player: number) {
  return returnMirkwoodGuard(s) === player
    ? returnMirkwoodGollum(s)
    : undefined;
}
function moveEnemyEffects(s: GameState, enemies: Unit[]) {
  const guard = returnMirkwoodGuard(s);
  if (guard === undefined) return [];
  return enemies
    .filter((u) => !seatView(s, guard).engaged.some((e) => e.id === u.id))
    .map((u) => fx("returnEngage", { target: u.id, player: guard }));
}
export function returnMirkwoodEncounterStart(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood") return;
  prepend(
    s,
    ...moveEnemyEffects(
      s,
      [...s.staging, ...allEngaged(s)].filter(
        (u) => u.code === RETURN.attercop,
      ),
    ),
  );
}
/** Return true and defer shadow dealing until these Forced engagements finish. */
export function returnMirkwoodCombatStart(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood" || s.stage !== 4) return false;
  const effects = moveEnemyEffects(
    s,
    [...s.staging, ...allEngaged(s)].filter(
      (u) => card(u.code).type_code === "enemy",
    ),
  );
  if (!effects.length) return false;
  prepend(s, ...effects, fx("startCombat", { flag: true }));
  return true;
}
export function returnMirkwoodEngaged(s: GameState, enemy: Unit) {
  if (enemy.code !== RETURN.bats) return;
  const guard = returnMirkwoodGuard(s);
  if (guard === undefined) return;
  const p = seatView(s, guard);
  prepend(
    s,
    ...[...p.heroes, ...p.allies].map((u) =>
      fx("damage", { target: u.id, value: 1, player: guard }),
    ),
  );
  log(
    s,
    "Mirkwood Bats wound every character controlled by Gollum's guard, including Gollum.",
    "danger",
  );
}
export function returnMirkwoodRoundEnd(s: GameState) {
  if (s.scenarioId !== "return-to-mirkwood") return;
  const guard = returnMirkwoodGuard(s);
  if (guard === undefined) return;
  prepend(
    s,
    fx("returnGuardThreat", { value: 3, player: guard, flag: true }),
    fx("returnChooseGuard", { player: guard }),
  );
}
function transferGollum(s: GameState, to: number) {
  const g = returnMirkwoodGollum(s);
  requireRule(
    g && livingSeats(s).includes(to),
    "Choose a surviving player to guard Gollum.",
  );
  const from = ownerOf(s, g);
  if (from === to) return;
  requireRule(
    !lockedGuard(s),
    "The Spider's Ring prevents changing Gollum's guard.",
  );
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== g.id);
  });
  forOwner(s, to, () => {
    s.allies.push(g);
  });
  log(s, `Gollum is now guarded by ${seatName(s, to)}.`);
}
function chooseGuard(
  s: GameState,
  actor: number,
  forced: boolean,
  initial = false,
) {
  const current = returnMirkwoodGuard(s);
  if (current === undefined || (!initial && lockedGuard(s))) return;
  const candidates = livingSeats(s).filter(
    (player) => initial || player !== current,
  );
  if (!candidates.length) return;
  selectSeat(s, livingSeats(s).includes(actor) ? actor : (s.table?.first ?? 0));
  choose(
    s,
    initial ? "Choose Gollum's first guard" : "Choose Gollum's new guard",
    [
      ...candidates.map((player) => ({
        id: `player-${player}`,
        label: seatName(s, player),
        effects: [fx("returnSetGuard", { value: player })],
      })),
      ...(!forced && !initial
        ? [{ ...skip, label: "Keep guarding Gollum" }]
        : []),
    ],
    lockedGuard(s)
      ? "The active Spider's Ring prevents transfers."
      : "Transfer the same captive with his wounds and attachments.",
  );
}
export function returnMirkwoodTravelProblem(s: GameState, location: Unit) {
  const guard = returnMirkwoodGuard(s);
  if (
    location.code === RETURN.glade &&
    (guard === undefined ||
      !seatView(s, guard).heroes.some((h) => !h.exhausted))
  )
    return "Woodman's Glade requires a ready hero controlled by Gollum's guard.";
  return null;
}
export function returnMirkwoodTravelCost(s: GameState, location: Unit) {
  if (location.code !== RETURN.glade) return false;
  requireRule(
    !returnMirkwoodTravelProblem(s, location),
    returnMirkwoodTravelProblem(s, location) ?? "",
  );
  const guard = returnMirkwoodGuard(s)!;
  selectSeat(s, guard);
  choose(
    s,
    "Woodman's Glade · Travel cost",
    opts(
      seatView(s, guard).heroes.filter((h) => !h.exhausted),
      (h) => [
        fx("exhaust", { target: h.id }),
        fx("travelEnter", { target: location.id }),
      ],
    ),
    "Gollum's guard must exhaust one of his heroes before the party travels.",
  );
  return true;
}
export function returnMirkwoodTravel(s: GameState, location: Unit) {
  if (location.code === RETURN.path)
    prepend(s, fx("returnChooseGuard", { player: returnMirkwoodGuard(s) }));
}
export function returnMirkwoodExplored(s: GameState, location: Unit) {
  if (location.code !== RETURN.glade) return;
  const guard = returnMirkwoodGuard(s);
  prepend(
    s,
    fx("returnGladeResponse", {
      source: location.id,
      ids: livingSeats(s)
        .filter((p) => p !== guard)
        .map(String),
      player: s.table?.first ?? 0,
    }),
  );
}
function treacheryTargets(s: GameState) {
  const guard = returnMirkwoodGuard(s);
  return guard === undefined
    ? []
    : allActiveLocations(s).some((u) => u.code === RETURN.watercourse)
      ? playerOrder(s)
      : [guard];
}
export function returnMirkwoodEncounter(s: GameState, encounterCode: string) {
  if (
    ![RETURN.anguish, RETURN.bite, RETURN.provisions].includes(
      encounterCode as typeof RETURN.anguish,
    )
  )
    return false;
  const targets = treacheryTargets(s);
  if (encounterCode === RETURN.anguish)
    prepend(s, fx("returnThreatGroup", { ids: targets.map(String), value: 8 }));
  else if (encounterCode === RETURN.bite)
    prepend(
      s,
      ...targets.map((player) => fx("returnBite", { player, value: 4 })),
    );
  else
    prepend(
      s,
      ...targets.map((player) =>
        fx("returnDiscardDeck", { player, count: 10 }),
      ),
    );
  // Each expanded recipient performs the whole effect. New guards exclude the
  // actual current guard, including transfers made by an earlier recipient.
  s.queue.splice(
    targets.length && encounterCode !== RETURN.anguish ? targets.length : 1,
    0,
    ...targets.map((player) => fx("returnChooseGuard", { player, flag: true })),
    fx("returnDiscardTreachery", { code: encounterCode }),
  );
  return true;
}
export function returnMirkwoodShadow(s: GameState, shadowCode: string) {
  const guard = returnMirkwoodGuard(s);
  if (guard === undefined) return false;
  const targets = treacheryTargets(s);
  switch (shadowCode) {
    case RETURN.anguish:
      prepend(
        s,
        fx("returnThreatGroup", { value: 4, ids: targets.map(String) }),
      );
      break;
    case RETURN.bite:
      prepend(
        s,
        ...targets.map((player) => fx("returnBite", { value: 2, player })),
      );
      break;
    case RETURN.provisions:
      prepend(
        s,
        ...targets.map((player) =>
          fx("returnDiscardDeck", { count: 5, player }),
        ),
      );
      break;
    case RETURN.ring: {
      const combat = s.combat;
      if (!combat) break;
      const enemy = get(s, combat.enemyId),
        index = enemy?.shadows.indexOf(shadowCode) ?? -1;
      if (enemy && index >= 0) {
        removeShadowCard(enemy, index);
      }
      const undefended = !(
        combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
      ).some((id) => !!get(s, id));
      const locations = allActiveLocations(s);
      if (undefended && locations.length > 1) {
        selectSeat(s, s.table?.first ?? 0);
        choose(
          s,
          "The Spider's Ring · Return an active location",
          opts(locations, (location) => [
            fx("returnRingActive", {
              target: location.id,
              player: s.table?.first ?? 0,
            }),
          ]),
          "The first player chooses the active location returned to staging; its progress remains.",
        );
      } else ringBecomesActive(s, undefended ? locations[0]?.id : undefined);
      break;
    }
    default:
      return false;
  }
  return true;
}
function ringBecomesActive(s: GameState, returnedId?: string) {
  const previous = allActiveLocations(s).find((u) => u.id === returnedId);
  if (previous) {
    removeActiveLocation(s, previous.id);
    s.staging.push(previous);
  }
  const location = make(s, RETURN.ring);
  if (!s.activeLocation) s.activeLocation = location;
  else (s.extraActiveLocations ??= []).push(location);
  log(
    s,
    "The shadow Spider's Ring becomes an active location without travel.",
    "danger",
  );
}
export function returnMirkwoodEffect(s: GameState, e: Effect) {
  switch (e.kind) {
    case "returnRingActive":
      ringBecomesActive(s, e.target);
      break;
    case "returnStartingGuard":
      chooseGuard(s, s.table?.first ?? 0, true, true);
      break;
    case "returnChooseGuard":
      chooseGuard(s, e.player ?? returnMirkwoodGuard(s) ?? 0, !!e.flag);
      break;
    case "returnSetGuard":
      transferGollum(s, e.value!);
      break;
    case "returnEngage": {
      const enemy = get(s, e.target);
      if (enemy)
        forOwner(s, e.player ?? returnMirkwoodGuard(s) ?? 0, () =>
          engage(s, enemy),
        );
      break;
    }
    case "returnGuardThreat":
      raiseThreat(s, e.value ?? 0, e.flag ? "quest-card" : "encounter");
      break;
    case "returnThreatGroup":
      for (const player of (e.ids ?? []).map(Number))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "returnBite": {
      const player = e.player ?? returnMirkwoodGuard(s) ?? 0;
      if (!livingSeats(s).includes(player)) break;
      selectSeat(s, player);
      choose(
        s,
        `Gollum's Bite · ${seatName(s, player)}`,
        opts(seatView(s, player).heroes, (h) => [
          fx("damage", { target: h.id, value: e.value ?? 0, player }),
        ]),
        `Choose one of this player's heroes to suffer ${e.value ?? 0} damage.`,
      );
      break;
    }
    case "returnDiscardDeck": {
      const discarded = discardPlayerDeck(
        s,
        e.count ?? 0,
        e.player ?? activeSeat(s),
      );
      log(
        s,
        `Wasted Provisions discards ${discarded.length} cards from this player's deck.`,
        "danger",
      );
      break;
    }
    case "returnDiscardTreachery":
      s.encounterDiscard.push(e.code!);
      break;
    case "returnGladeResponse":
      if (e.ids?.length)
        choosePlayerResponse(
          s,
          e.source ?? RETURN.glade,
          RETURN.glade,
          "Woodman's Glade · Exploration response",
          [
            {
              id: "reduce",
              label: "Reduce every other player's threat by 2",
              effects: [fx("returnGladeThreat", { ids: e.ids })],
            },
            skip,
          ],
        );
      break;
    case "returnGladeThreat":
      for (const player of (e.ids ?? []).map(Number))
        forOwner(s, player, () => {
          s.threat = Math.max(0, s.threat - 2);
        });
      break;
    default:
      return false;
  }
  check(s);
  return true;
}
