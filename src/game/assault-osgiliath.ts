// Original/easy Assault on Osgiliath. Shared Mordor Elite/Southrons rules live in heirs-numenor.
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
  threatOf,
  units,
} from "./core";
import {
  discardAttachment,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  attachmentController,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
  selectSeat,
} from "./table";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsCanSpendResources } from "./heirs-numenor";
import { ASSAULT_OSGILIATH as A } from "./assault-osgiliath-support";
export { ASSAULT_OSGILIATH } from "./assault-osgiliath-support";

const isAssault = (s: GameState) => s.scenarioId === "assault-on-osgiliath";
const state = (s: GameState) =>
  (s.assaultOsgiliath ??= { controlled: [], archeryBonus: 0 });
const first = (s: GameState) => s.table?.first ?? 0;
const osgiliath = (code: string) =>
  card(code).type_code === "location" &&
  /\bOsgiliath\b/.test(card(code).traits ?? "");
const controlled = (s: GameState, player?: number) =>
  (s.assaultOsgiliath?.controlled ?? []).filter(
    (u) => player === undefined || (u.owner ?? 0) === player,
  );
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const readyHeroes = (s: GameState, player: number) =>
  seatView(s, player).heroes.filter(canExhaust);
const readyCharacters = (s: GameState, player: number) =>
  seatView(s, player)
    .heroes.concat(seatView(s, player).allies)
    .filter(canExhaust);
const readyTableCharacters = (s: GameState) =>
  playerOrder(s).flatMap((player) => readyCharacters(s, player));
const inPlayLocations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s), ...controlled(s)].filter((u) =>
    osgiliath(u.code),
  );
const spendableHeroes = (s: GameState) =>
  s.heroes.filter((h) => h.resources > 0 && heirsCanSpendResources(s, h));
const bridgeCost = (s: GameState, bridge: Unit) =>
  s.staging.some((u) => u.id !== bridge.id && osgiliath(u.code)) ? 1 : 2;

export function setupAssaultOsgiliath(s: GameState) {
  state(s);
  prepend(
    s,
    ...playerOrder(s).flatMap((player) => [
      fx("osgiliathSetupSearch", { player }),
      fx("osgiliathSetupSearch", { player, flag: true }),
    ]),
    fx("osgiliathShuffle"),
  );
}

/** This replaces the ordinary discard when a location is explored. */
export function assaultOsgiliathCapture(s: GameState, u: Unit): boolean {
  if (!isAssault(s) || !osgiliath(u.code)) return false;
  s.staging = s.staging.filter((l) => l.id !== u.id);
  removeActiveLocation(s, u.id);
  const q = state(s);
  if (q.controlled.some((l) => l.id === u.id)) {
    const previous = u.owner ?? 0;
    q.controlled = q.controlled.filter((l) => l.id !== u.id);
    if (previous !== first(s)) returnTowers(s, previous);
  }
  u.progress = 0;
  u.owner = first(s);
  q.controlled.push(u);
  log(s, `The first player takes control of ${name(u)}.`, "good");
  return true;
}
function returnTowers(s: GameState, player: number) {
  const towers = controlled(s, player).filter(
    (l) => l.code === A.tower && !l.blanked,
  );
  for (const tower of towers) returnLocation(s, tower, false);
}
function returnLocation(s: GameState, u: Unit, cascade = true) {
  const q = state(s);
  if (!q.controlled.some((l) => l.id === u.id)) return;
  const player = u.owner ?? 0;
  q.controlled = q.controlled.filter((l) => l.id !== u.id);
  u.progress = 0;
  delete u.owner;
  s.staging.push(u);
  log(s, `${name(u)} returns to the staging area.`, "danger");
  if (cascade) returnTowers(s, player);
}
export function assaultOsgiliathPlayerEliminated(s: GameState, player: number) {
  if (!isAssault(s)) return;
  for (const u of controlled(s, player)) returnLocation(s, u);
}
export function assaultOsgiliathCharacterLeft(s: GameState) {
  if (!isAssault(s)) return;
  for (const u of controlled(s).filter(
    (l) => l.code === A.square && !l.blanked,
  ))
    returnLocation(s, u);
}
export function assaultOsgiliathEnemyDefeated(s: GameState) {
  if (!isAssault(s)) return;
  prepend(
    s,
    ...inPlayLocations(s)
      .filter((l) => l.code === A.square && !l.blanked)
      .map((l) =>
        fx("osgiliathSquareOffer", { target: l.id, player: first(s) }),
      ),
  );
}
type AssaultCombat = NonNullable<GameState["combat"]> & {
  osgiliathReturnIfKilled?: boolean;
  osgiliathUndefended?: boolean;
};
export function assaultOsgiliathCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (!isAssault(s) || !context.combatDamage || !context.enemyId) return;
  const enemy = get(s, context.enemyId),
    player = ownerOf(s, u),
    combat = s.combat as AssaultCombat | null;
  prepend(
    s,
    ...(enemy?.code === A.soldier && !enemy.blanked
      ? [fx("osgiliathReturnChoose", { player })]
      : []),
    ...(combat?.enemyId === context.enemyId && combat.osgiliathReturnIfKilled
      ? [fx("osgiliathReturnChoose", { player, flag: true })]
      : []),
  );
}
/** The Forced text follows the undefended declaration, before shadow resolution. */
export function assaultOsgiliathAttackUndefended(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
) {
  if (!isAssault(s) || combat.osgiliathUndefended) return;
  combat.osgiliathUndefended = true;
  const player = combat.attackPlayer ?? activeSeat(s);
  for (const u of controlled(s, player).filter(
    (l) =>
      !l.blanked && [A.gate, A.library, A.harbor, A.bridge].includes(l.code),
  ))
    returnLocation(s, u);
}
export const assaultOsgiliathAttackBonus = (s: GameState, u: Unit) =>
  isAssault(s) &&
  u.code === A.phalanx &&
  !u.blanked &&
  allEngaged(s).some((e) => e.id === u.id)
    ? controlled(s, ownerOf(s, u)).length
    : 0;
export const assaultOsgiliathArcheryBonus = (s: GameState) =>
  s.assaultOsgiliath?.archeryBonus ?? 0;
export function assaultOsgiliathRoundEnd(s: GameState) {
  if (!isAssault(s) || s.status !== "playing") return;
  if (
    controlled(s).length > 0 &&
    ![...s.staging, ...allActiveLocations(s)].some((u) => osgiliath(u.code))
  )
    win(s);
  state(s).archeryBonus = 0;
  delete state(s).questStat;
}

export const assaultOsgiliathCannotCancel = (code: string) => code === A.street;
export function assaultOsgiliathEncounter(
  s: GameState,
  code: string,
  replay = false,
): boolean {
  if (code === A.lieutenant) {
    const candidate = [...s.encounterDiscard]
      .reverse()
      .find(
        (c) =>
          card(c).type_code === "enemy" && /\bOrc\b/.test(card(c).traits ?? ""),
      );
    if (candidate) {
      const index = s.encounterDiscard.lastIndexOf(candidate);
      s.encounterDiscard.splice(index, 1);
      placeEncounter(s, candidate, true);
    }
  } else if (code === A.commander) {
    const fresh = s.staging.filter((u) => u.code === code).at(-1);
    if (fresh)
      prepend(
        s,
        ...playerOrder(s)
          .filter((p) => controlled(s, p).length > 0)
          .map((player) => fx("immediateAttack", { target: fresh.id, player })),
      );
  } else if (code === A.pinned) {
    const count = controlled(s).length;
    state(s).archeryBonus += count;
    if (count < 4)
      prepend(
        s,
        fx("amonSurgeWindow", { code }),
        fx("reveal", { player: first(s) }),
      );
  } else if (code === A.counter) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("osgiliathCounter", { player })),
    );
  } else if (code === A.street) {
    prepend(s, fx("osgiliathStreet", { player: first(s) }));
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function assaultOsgiliathShadow(s: GameState, code: string): boolean {
  const c = s.combat as AssaultCombat | null;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s),
    defended = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).some(
      (id) => !!get(s, id),
    );
  if (code === A.phalanx) c.attackBonus += controlled(s, player).length;
  else if ([A.pinned, A.east, A.west].includes(code))
    c.osgiliathReturnIfKilled = true;
  else if (code === A.soldier)
    prepend(
      s,
      fx("osgiliathThreat", { value: controlled(s, player).length, player }),
    );
  else if (code === A.lieutenant)
    prepend(s, fx("osgiliathDiscardAttachment", { flag: !defended, player }));
  else return false;
  return true;
}

export function assaultOsgiliathSecondLocation(s: GameState, u: Unit) {
  return u.code === A.tower && !u.blanked && allActiveLocations(s).length === 1;
}
export function assaultOsgiliathTravelProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.blanked) return null;
  if ([A.harbor, A.bridge].includes(u.code))
    return "The players cannot travel here.";
  if (assaultOsgiliathSecondLocation(s, u) && !readyTableCharacters(s).length)
    return "Exhaust a ready character to travel to a second active location.";
  if (u.code === A.library && !s.encounterDeck.length)
    return "The King's Library requires an encounter card to reveal.";
  return null;
}
export function assaultOsgiliathTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (assaultOsgiliathSecondLocation(s, u))
    return [fx("osgiliathTowerPay", { target: u.id, player: first(s) })];
  if (u.code === A.library) return [fx("reveal", { player: first(s) })];
  return undefined;
}
export function assaultOsgiliathAbilityLabel(code: string): string | undefined {
  if (code === A.gate)
    return "Use West Gate · Search for an Osgiliath location";
  if (code === A.harbor)
    return "Ancient Harbor · Exhaust a hero for 1 progress";
  if (code === A.bridge)
    return "The Old Bridge · Spend resources for 1 progress";
  return undefined;
}
export function assaultOsgiliathAbilityProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (!assaultOsgiliathAbilityLabel(u.code)) return null;
  if (!isAssault(s) || u.blanked) return "This printed action is unavailable.";
  if (!inPlayLocations(s).some((l) => l.id === u.id))
    return "Choose an Osgiliath location in play.";
  if (["setup", "staging", "refresh"].includes(s.phase))
    return "Wait for an action window.";
  if (u.code === A.gate) {
    if (allActiveLocations(s).length)
      return "West Gate requires no active location.";
  } else if (u.code === A.harbor) {
    if (!["defense", "attack"].includes(s.phase))
      return "Ancient Harbor requires a combat action window.";
    if (!readyHeroes(s, activeSeat(s)).length)
      return "Exhaust a ready hero you control.";
  } else if (u.code === A.bridge) {
    if (s.phase !== "planning")
      return "The Old Bridge requires the planning phase.";
    if (
      spendableHeroes(s).reduce((n, h) => n + h.resources, 0) < bridgeCost(s, u)
    )
      return "Spend enough resources from heroes you control.";
  }
  return null;
}
export function useAssaultOsgiliathAbility(s: GameState, u: Unit): boolean {
  if (!assaultOsgiliathAbilityLabel(u.code)) return false;
  const problem = assaultOsgiliathAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  if (u.code === A.gate) {
    prepend(
      s,
      fx("osgiliathGateSearch", { target: u.id, player: activeSeat(s) }),
    );
  } else if (u.code === A.harbor) {
    choose(
      s,
      "Ancient Harbor · Exhaust a hero",
      opts(readyHeroes(s, activeSeat(s)), (h) => [
        fx("osgiliathHarbor", { target: u.id, source: h.id }),
      ]),
    );
  } else {
    prepend(
      s,
      fx("osgiliathBridgePay", { target: u.id, count: bridgeCost(s, u) }),
    );
  }
  return true;
}

const activeQuarter = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code && !u.blanked);
export function assaultOsgiliathQuestStat(
  s: GameState,
): "attack" | "defense" | null {
  const battle = activeQuarter(s, A.east),
    siege = activeQuarter(s, A.west);
  if (battle && siege) return state(s).questStat ?? "defense";
  if (siege) return "defense";
  if (battle) return "attack";
  return null;
}
export function assaultOsgiliathPrepareQuest(
  s: GameState,
  continuation: Effect,
): boolean {
  if (
    !activeQuarter(s, A.east) ||
    !activeQuarter(s, A.west) ||
    state(s).questStat
  )
    return false;
  selectSeat(s, first(s));
  choose(
    s,
    "East and West Quarter · Resolve conflicting quest statistics",
    [
      {
        id: "battle",
        label: "Resolve battle · Quest using attack",
        effects: [
          fx("osgiliathQuestStat", { flag: true, player: first(s) }),
          continuation,
        ],
      },
      {
        id: "siege",
        label: "Resolve siege · Quest using defense",
        effects: [fx("osgiliathQuestStat", { player: first(s) }), continuation],
      },
    ],
    "Both active locations replace willpower. The first player orders the conflicting effects (FAQ 1.02).",
  );
  return true;
}

export function assaultOsgiliathEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "osgiliathShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "osgiliathSetupSearch": {
      const options = s.encounterDeck.flatMap((code, index) => {
        const c = card(code);
        return (
          e.flag ? osgiliath(code) && c.is_unique : c.type_code === "enemy"
        )
          ? [
              {
                id: `deck:${index}`,
                label: c.name,
                code,
                effects: [fx("osgiliathSetupAdd", { code, value: index })],
              },
            ]
          : [];
      });
      choose(
        s,
        e.flag
          ? "Retake the City · Choose a unique location"
          : "Retake the City · Choose an enemy",
        options,
      );
      break;
    }
    case "osgiliathSetupAdd":
      requireRule(
        s.encounterDeck[e.value!] === e.code,
        "Choose the same physical encounter card.",
      );
      s.encounterDeck.splice(e.value!, 1);
      placeEncounter(s, e.code!, true);
      break;
    case "osgiliathCounter": {
      const locations = controlled(s, activeSeat(s));
      const high = Math.max(...locations.map((l) => threatOf(s, l)));
      choose(s, "Counter-attack · Return a location or raise threat", [
        ...opts(
          locations.filter((l) => threatOf(s, l) === high),
          (l) => [fx("osgiliathReturn", { target: l.id })],
        ),
        {
          id: "threat",
          label: `Raise threat by ${locations.reduce((n, l) => n + threatOf(s, l), 0)}`,
          effects: [
            fx("osgiliathThreat", {
              value: locations.reduce((n, l) => n + threatOf(s, l), 0),
            }),
          ],
        },
      ]);
      break;
    }
    case "osgiliathReturnChoose": {
      const locations = controlled(s, activeSeat(s));
      const high = Math.max(...locations.map((l) => threatOf(s, l)));
      choose(
        s,
        e.flag
          ? "Return a controlled location with the highest threat"
          : "Uruk Soldier · Return a controlled location",
        opts(
          locations.filter((l) => !e.flag || threatOf(s, l) === high),
          (l) => [fx("osgiliathReturn", { target: l.id })],
        ),
      );
      break;
    }
    case "osgiliathReturn":
      if (u) returnLocation(s, u);
      break;
    case "osgiliathThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "osgiliathStreet": {
      let code: string | undefined;
      while (s.encounterDeck.length) {
        code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (osgiliath(code)) break;
        code = undefined;
      }
      if (!code) break;
      const index = s.encounterDiscard.length - 1;
      const location = code;
      choose(s, "Street Fighting · Claim the discarded location", [
        ...opts(readyHeroes(s, first(s)), (h) => [
          fx("osgiliathStreetTake", {
            code: location,
            value: index,
            source: h.id,
          }),
        ]),
        {
          id: "staging",
          label: "Add the location to staging",
          code,
          effects: [fx("osgiliathStreetTake", { code, value: index })],
        },
      ]);
      break;
    }
    case "osgiliathStreetTake": {
      requireRule(
        s.encounterDiscard[e.value!] === e.code,
        "Choose the same discarded Osgiliath location.",
      );
      const hero = get(s, e.source);
      if (e.source)
        requireRule(
          hero &&
            readyHeroes(s, first(s)).some((h) => h.id === hero.id) &&
            exhaustCharacter(s, hero),
          "Exhaust a ready hero controlled by the first player.",
        );
      s.encounterDiscard.splice(e.value!, 1);
      if (hero) assaultOsgiliathCapture(s, make(s, e.code!));
      else placeEncounter(s, e.code!, true);
      break;
    }
    case "osgiliathSquareOffer":
      if (u && !u.blanked)
        choose(s, "Ruined Square · Enemy defeated", [
          {
            id: "progress",
            label: "Place 1 progress on Ruined Square",
            code: u.code,
            effects: [fx("locationProgress", { target: u.id, value: 1 })],
          },
          skip,
        ]);
      break;
    case "osgiliathDiscardAttachment": {
      const attachments = units(s).flatMap((host) =>
        host.attachments
          .filter((a) => attachmentController(s, host, a) === activeSeat(s))
          .map((a) => ({ host, a })),
      );
      if (e.flag) {
        for (const { host, a } of attachments) discardAttachment(s, host, a);
      } else
        choose(
          s,
          "Uruk Lieutenant · Discard an attachment you control",
          attachments.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("discardAttachment", { target: host.id, source: a.id }),
            ],
          })),
        );
      break;
    }
    case "osgiliathTowerPay":
      choose(
        s,
        "Ruined Tower · Exhaust a character to travel",
        opts(readyTableCharacters(s), (c) => [
          fx("exhaust", { target: c.id, player: ownerOf(s, c) }),
        ]),
      );
      break;
    case "osgiliathHarbor": {
      const hero = get(s, e.source);
      requireRule(
        u &&
          hero &&
          readyHeroes(s, activeSeat(s)).some((h) => h.id === hero.id) &&
          exhaustCharacter(s, hero),
        "Exhaust a ready hero you control.",
      );
      progressLocation(s, u, 1);
      break;
    }
    case "osgiliathBridgePay": {
      if (!u) break;
      const remaining = e.count ?? 0;
      if (remaining <= 0) {
        progressLocation(s, u, 1);
        break;
      }
      choose(
        s,
        `The Old Bridge · Pay ${remaining} remaining resource${remaining === 1 ? "" : "s"}`,
        opts(spendableHeroes(s), (h) => [
          fx("osgiliathBridgeResource", {
            target: h.id,
            source: u.id,
            count: remaining,
          }),
        ]),
      );
      break;
    }
    case "osgiliathBridgeResource":
      requireRule(
        u &&
          s.heroes.some((h) => h.id === u.id) &&
          u.resources > 0 &&
          heirsCanSpendResources(s, u),
        "Spend a resource from a hero you control.",
      );
      u.resources--;
      prepend(
        s,
        fx("osgiliathBridgePay", {
          target: e.source,
          count: (e.count ?? 1) - 1,
        }),
      );
      break;
    case "osgiliathGateSearch": {
      const options = [
        ...s.encounterDeck.map((code, index) => ({
          code,
          index,
          zone: "deck",
        })),
        ...s.encounterDiscard.map((code, index) => ({
          code,
          index,
          zone: "discard",
        })),
      ].filter(({ code }) => osgiliath(code));
      if (options.length)
        choose(
          s,
          "West Gate · Reveal an Osgiliath location",
          options.map(({ code, index, zone }) => ({
            id: `${zone}:${index}`,
            code,
            label: `${card(code).name} · ${zone}`,
            effects: [
              fx("osgiliathGatePick", {
                target: e.target,
                code,
                value: index,
                text: zone,
              }),
            ],
          })),
        );
      else prepend(s, fx("osgiliathGateActive", { target: e.target }));
      break;
    }
    case "osgiliathGatePick": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      requireRule(
        pile[e.value!] === e.code,
        "Choose the same physical Osgiliath location.",
      );
      pile.splice(e.value!, 1);
      prepend(s, fx("osgiliathGateActive", { target: e.target }));
      revealed(s, e.code!);
      break;
    }
    case "osgiliathGateActive":
      if (u && !allActiveLocations(s).length) {
        s.staging = s.staging.filter((l) => l.id !== u.id);
        if (controlled(s).some((l) => l.id === u.id)) {
          state(s).controlled = controlled(s).filter((l) => l.id !== u.id);
          returnTowers(s, u.owner ?? 0);
          u.progress = 0;
          delete u.owner;
        }
        s.activeLocation = u;
        log(s, "West Gate becomes the active location.", "good");
      }
      shuffle(s, s.encounterDeck);
      break;
    case "osgiliathQuestStat":
      state(s).questStat = e.flag ? "attack" : "defense";
      break;
    default:
      return false;
  }
  return true;
}
