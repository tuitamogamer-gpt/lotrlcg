import { choosePlayerResponse } from "./player-ability-triggers";
import { mainQuestCode } from "./quest-state";
import { heirsShadowDealt } from "./heirs-numenor";
import { druadanPlayerNoEngagementChecks } from "./druadan-player-cards";
import { engagementCost } from "./core";
import { amonPlayerCanEngage } from "./amon-din-player-cards";
// Original Road to Rivendell; shared Khazad-dûm sets are scripted independently.
import encounters from "../data/road-rivendell-encounter-cards.json";
import quests from "../data/road-rivendell-quest-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  encounterDraw,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  shuffle,
  skip,
  units,
} from "./core";
import {
  questDefeated,
  check,
  damage,
  discardAttachment,
  discardCharacter,
  engage,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { beginEnemyAttack } from "./combat";
import {
  longDarkPlayerIgnoreEngagement,
  longDarkPlayerEnemyCannotAttack,
} from "./long-dark-player-cards";
import { elfEnemyCannotAttack } from "./elf-player-cards";

export const ROAD_ENCOUNTERS = encounters as Card[];
export const ROAD_QUESTS = quests as Card[];
export const ROAD = Object.fromEntries(
  [
    ["mountains", "Along the Misty Mountains"],
    ["outpost", "Orc Outpost"],
    ["rivendell", "Approaching Rivendell"],
    ["arwen", "Arwen Undómiel"],
    ["hills", "Barren Hills"],
    ["crebain", "Crebain"],
    ["night", "Followed by Night"],
    ["gate", "Goblin Gate"],
    ["taskmaster", "Goblin Taskmaster"],
    ["ambush", "Orc Ambush"],
    ["raiders", "Orc Raiders"],
    ["country", "Pathless Country"],
    ["road", "Ruined Road"],
    ["sentry", "Sleeping Sentry"],
    ["bear", "Wild Bear"],
  ].map(([key, title]) => [
    key,
    [...ROAD_ENCOUNTERS, ...ROAD_QUESTS].find((c) => c.name === title)!.code,
  ]),
) as Record<
  | "mountains"
  | "outpost"
  | "rivendell"
  | "arwen"
  | "hills"
  | "crebain"
  | "night"
  | "gate"
  | "taskmaster"
  | "ambush"
  | "raiders"
  | "country"
  | "road"
  | "sentry"
  | "bear",
  string
>;
const isRoad = (s: GameState) => s.scenarioId === "road-to-rivendell";
const state = (s: GameState) => (s.roadRivendell ??= {});
const active = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code && !u.blanked);
const arwen = (s: GameState) =>
  allCharacters(s).find((u) => u.code === ROAD.arwen);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
export function setupRoadRivendell(s: GameState) {
  state(s);
  s.encounterDeck = s.encounterDeck.filter((c) => c !== ROAD.arwen);
  const a = make(s, ROAD.arwen);
  forOwner(s, s.table?.first ?? 0, () => s.allies.push(a));
  shuffle(s, s.encounterDeck);
  enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
}
export function roadRivendellCheck(s: GameState) {
  if (!isRoad(s) || !s.roadRivendell || s.status !== "playing") return;
  const a = arwen(s);
  if (!a) {
    lose(s, "Arwen Undómiel has left play. The escort has failed.");
    return;
  }
  const player = ownerOf(s, a),
    p = seatView(s, player);
  if (s.table?.seats[player].eliminated || p.threat >= 50 || !p.heroes.length)
    lose(s, "Arwen Undómiel's controlling fellowship has been eliminated.");
}
export function roadRivendellFollowFirstPlayer(s: GameState) {
  if (!isRoad(s) || !s.table || s.status !== "playing") return;
  const a = arwen(s);
  if (!a) return;
  const from = ownerOf(s, a),
    to = s.table.first;
  if (from === to) return;
  forOwner(s, from, () => (s.allies = s.allies.filter((u) => u.id !== a.id)));
  forOwner(s, to, () => s.allies.push(a));
  log(s, `Arwen follows the first player: ${seatName(s, to)}.`);
}
export function roadRivendellCharacterExhausted(s: GameState, u: Unit) {
  if (u.code === ROAD.arwen && !u.blanked)
    prepend(
      s,
      fx("roadRivendellArwenResponse", { source: u.id, player: ownerOf(s, u) }),
    );
}
export const roadRivendellCannotCancel = (s: GameState) =>
  s.staging.some((u) => u.code === ROAD.crebain && !u.blanked);
export const roadRivendellHealingAllowed = (s: GameState, u: Unit) =>
  !(
    isRoad(s) &&
    s.stage === 3 &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  );
export const roadRivendellEnemyCanAttack = (s: GameState, u: Unit) =>
  !(
    u.preventedAttacks?.includes(ownerOf(s, u)) ||
    (u.feinted && !u.preventedAttacks?.length) ||
    u.attachments.some((a) => a.code === "01069" && !a.blanked) ||
    elfEnemyCannotAttack(s, u, ownerOf(s, u)) ||
    longDarkPlayerEnemyCannotAttack(s, u, ownerOf(s, u))
  );
/** Mark every first enemy revealed, including one subsequently killed by Thalin. */
export function roadRivendellRevealedEnemy(s: GameState, u: Unit) {
  if (!isRoad(s) || state(s).gateSeenRound === s.round) return;
  state(s).gateSeenRound = s.round;
  state(s).gateEnemyId = u.id;
}
export function roadRivendellEnemyEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
) {
  if (!isRoad(s) || !s.staging.some((e) => e.id === u.id)) return;
  if (fromReveal) roadRivendellRevealedEnemy(s, u);
  if (
    (!u.blanked && /\bAmbush\b/i.test(card(u.code).text ?? "")) ||
    (state(s).gateEnemyId === u.id && active(s, ROAD.gate))
  )
    prepend(
      s,
      fx("roadRivendellAmbush", { target: u.id, player: s.table?.first ?? 0 }),
    );
}
export function roadRivendellEngaged(s: GameState, u: Unit) {
  const player = ownerOf(s, u),
    effects: Effect[] = [];
  // Goblin Gate is a passive effect of engagement, before After-engagement Forced abilities.
  if (isRoad(s) && state(s).gateEnemyId === u.id && active(s, ROAD.gate))
    effects.push(
      fx("roadRivendellImmediateAttack", { target: u.id, player, flag: true }),
    );
  if (u.code === ROAD.taskmaster && !u.blanked)
    effects.push(fx("roadRivendellTaskmaster", { target: u.id, player }));
  if (u.code === ROAD.raiders && !u.blanked)
    effects.push(
      fx("roadRivendellRaiders", { target: u.id, player, count: 2 }),
    );
  if (u.code === ROAD.bear && !u.blanked)
    effects.push(fx("roadRivendellImmediateAttack", { target: u.id, player }));
  prepend(s, ...effects);
}
/** A location immediately explored at its threshold has already left play. */
export function roadRivendellProgressPlaced(
  _s: GameState,
  u: Unit,
  value: number,
) {
  if (
    u.code === ROAD.country &&
    !u.blanked &&
    value > 0 &&
    u.progress < (card(u.code).quest ?? 0)
  )
    u.progress = Math.max(0, u.progress - 1);
}
export function roadRivendellTravelEntered(s: GameState, u: Unit) {
  if (u.code === ROAD.road && !u.blanked)
    prepend(
      s,
      fx("roadRivendellRuinedRoad", {
        target: u.id,
        player: s.table?.first ?? 0,
      }),
    );
}
export function roadRivendellRoundEnd(s: GameState) {
  if (!s.roadRivendell) return;
  delete state(s).gateEnemyId;
  delete state(s).gateSeenRound;
}
export function advanceRoadRivendell(s: GameState) {
  if (!isRoad(s) || s.stageRevealing) return false;
  const threshold = [20, 7, 13][s.stage - 1];
  if (s.progress < threshold) return true;
  if (s.stage === 3) {
    win(s);
    return true;
  }
  if (questDefeated(s, mainQuestCode(s)!)) return true;
  s.stage++;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(
    s,
    ...(s.stage === 2
      ? [fx("roadRivendellOutpost")]
      : playerOrder(s).map((player) => fx("reveal", { player }))),
    fx("roadRivendellStageReady"),
  );
  log(
    s,
    `Stage ${s.stage} · ${s.stage === 2 ? "Orc Outpost" : "Approaching Rivendell"}`,
    "chapter",
  );
  return true;
}
function damageAllies(s: GameState) {
  for (const a of [...allCharacters(s)].filter((u) =>
    ["ally", "objective-ally"].includes(card(u.code).type_code),
  )) {
    if (s.status !== "playing") break;
    damage(s, a.id, 1);
  }
}
function frodoCancellations(s: GameState) {
  return playerOrder(s).flatMap((p) =>
    seatView(s, p).used.filter((k) => k.startsWith("phase:frodo:")),
  );
}
function encodeOrderedEffect(e: Effect) {
  return [e.kind, e.target, e.player ?? 0].join("|");
}
function decodeOrderedEffect(value: string): Effect | null {
  const parts = value.split("|"),
    [kind, target, seat] = parts,
    player = Number(seat);
  if (
    parts.length !== 3 ||
    ![
      "roadRivendellAmbush",
      "roadRivendellImmediateAttack",
      "roadRivendellTaskmaster",
      "roadRivendellRaiders",
    ].includes(kind) ||
    !target ||
    target.length > 80 ||
    !Number.isInteger(player) ||
    player < 0 ||
    player > 3
  )
    return null;
  return fx(kind, {
    target,
    player,
    ...(kind === "roadRivendellRaiders" ? { count: 2 } : {}),
  });
}
/** Mandatory entry/engagement moves finish before optional entry responses. */
function orderEntryEffects(s: GameState, effects: Effect[]) {
  const own = effects.filter((e) => e.kind.startsWith("roadRivendell")),
    other = effects.filter((e) => !e.kind.startsWith("roadRivendell"));
  const passive = own.filter(
      (e) => e.kind === "roadRivendellImmediateAttack" && e.flag,
    ),
    after = own.filter((e) => !passive.includes(e));
  prepend(
    s,
    ...passive,
    ...(after.length
      ? [
          fx("roadRivendellOrderEffects", {
            ids: after.map(encodeOrderedEffect),
            player: s.table?.first ?? 0,
          }),
        ]
      : []),
    ...other,
  );
}
export function roadRivendellEncounter(s: GameState, code: string) {
  if (code === ROAD.night) {
    selectSeat(s, s.table?.first ?? 0);
    choose(s, "Followed by Night · Choose one", [
      {
        id: "damage",
        label: "Deal one damage to every ally, then reveal another card",
        effects: [fx("roadRivendellDamageAllies"), fx("reveal")],
      },
      {
        id: "attacks",
        label: "Each engaged enemy makes an immediate attack",
        effects: [
          fx("roadRivendellAllAttacks", {
            ids: allEngaged(s).map((u) => u.id),
          }),
        ],
      },
    ]);
  } else if (code === ROAD.ambush) {
    const orcs = s.staging.filter(
      (u) => card(u.code).type_code === "enemy" && hasTrait(u, "Orc"),
    );
    if (orcs.length)
      prepend(
        s,
        fx("roadRivendellEngageOrcs", {
          ids: orcs.map((u) => u.id),
          player: s.table?.first ?? 0,
        }),
      );
    else {
      const codes = s.encounterDiscard.filter(
        (c) =>
          card(c).type_code === "enemy" &&
          (card(c).traits ?? "").split(".").some((t) => t.trim() === "Orc"),
      );
      s.encounterDiscard = s.encounterDiscard.filter((c) => !codes.includes(c));
      // Returning discard cards enters play; printed Ambush applies, while surge does not.
      const remaining = s.queue.splice(0);
      for (const c of codes) placeEncounter(s, c, true);
      const entered = s.queue.splice(0);
      s.queue = remaining;
      orderEntryEffects(s, entered);
    }
  } else if (code === ROAD.sentry) {
    const remaining = s.queue.splice(0),
      cancelled = frodoCancellations(s),
      exhausted = allCharacters(s).filter((u) => u.exhausted);
    for (const u of exhausted) {
      if (s.status !== "playing") break;
      damage(s, u.id, 1);
    }
    if (s.status === "playing") {
      const responses = s.queue.splice(0);
      s.queue = remaining;
      prepend(
        s,
        ...responses,
        fx("roadRivendellSentryExhaust", {
          ids: cancelled,
          count: exhausted.length,
        }),
      );
    }
  } else return false;
  s.encounterDiscard.push(code);
  return true;
}
export function roadRivendellShadow(s: GameState, code: string) {
  if ([ROAD.hills, ROAD.crebain, ROAD.night, ROAD.road].includes(code)) {
    if (s.combat) s.combat.returnToStaging = true;
  } else if (code === ROAD.country) damageAllies(s);
  else if (code === ROAD.sentry) {
    const enemy = get(s, s.combat?.enemyId);
    if (!enemy) return true;
    const player = ownerOf(s, enemy);
    for (const u of [...allCharacters(s)].filter(
      (u) => ownerOf(s, u) === player && u.exhausted,
    )) {
      if (s.status !== "playing") break;
      discardCharacter(s, u);
    }
  } else return false;
  return true;
}
const controlledAttachments = (s: GameState) =>
  units(s).flatMap((host) =>
    host.attachments
      .filter((a) => attachmentController(s, host, a) === activeSeat(s))
      .map((a) => ({ host, a })),
  );
export function roadRivendellEffect(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "roadRivendellArwenResponse":
      choosePlayerResponse(
        s,
        e.source ?? ROAD.arwen,
        ROAD.arwen,
        "Arwen Undómiel · Add a resource?",
        [
          ...opts(
            allHeroes(s).filter((h) => !isSacked(h)),
            (h) => [fx("resource", { target: h.id, value: 1 })],
          ),
          skip,
        ],
      );
      break;
    case "roadRivendellAmbush": {
      if (druadanPlayerNoEngagementChecks(s)) break;
      if (
        !u ||
        !s.staging.some((enemy) => enemy.id === u.id) ||
        active(s, ROAD.hills)
      )
        break;
      const player = playerOrder(s).find(
        (p) =>
          amonPlayerCanEngage(s, u, p) &&
          seatView(s, p).threat >= engagementCost(s, u) &&
          !longDarkPlayerIgnoreEngagement(s, u),
      );
      if (player !== undefined) forOwner(s, player, () => engage(s, u));
      break;
    }
    case "roadRivendellTaskmaster":
      if (!u || u.code !== ROAD.taskmaster || u.blanked) break;
      choose(
        s,
        "Goblin Taskmaster · Deal two damage",
        opts(
          allCharacters(s).filter((c) => ownerOf(s, c) === activeSeat(s)),
          (c) => [fx("damage", { target: c.id, value: 2 })],
        ),
      );
      break;
    case "roadRivendellRaiders": {
      if (!u || u.code !== ROAD.raiders || u.blanked) break;
      const attachments = controlledAttachments(s);
      if (attachments.length < 2) break;
      choose(
        s,
        "Orc Raiders · Choose the first attachment",
        attachments.map(({ host, a }) => ({
          id: a.id,
          label: `${card(a.code).name} on ${name(host)}`,
          code: a.code,
          effects: [fx("roadRivendellRaiderSecond", { source: a.id })],
        })),
      );
      break;
    }
    case "roadRivendellRaiderSecond":
      choose(
        s,
        "Orc Raiders · Choose the second attachment",
        controlledAttachments(s)
          .filter(({ a }) => a.id !== e.source)
          .map(({ host, a }) => ({
            id: a.id,
            label: `${card(a.code).name} on ${name(host)}`,
            code: a.code,
            effects: [
              fx("roadRivendellRaiderDiscard", { ids: [e.source!, a.id] }),
            ],
          })),
      );
      break;
    case "roadRivendellRaiderDiscard":
      for (const id of e.ids ?? []) {
        const candidate = controlledAttachments(s).find(({ a }) => a.id === id);
        if (candidate) discardAttachment(s, candidate.host, candidate.a);
      }
      break;
    case "roadRivendellDamageAllies":
      damageAllies(s);
      break;
    case "roadRivendellAllAttacks":
      if ((e.ids ?? []).length)
        choose(
          s,
          "Choose the next enemy to attack",
          (e.ids ?? []).flatMap((id) => {
            const enemy = get(s, id);
            return enemy && allEngaged(s).some((a) => a.id === id)
              ? [
                  {
                    id,
                    label: name(enemy),
                    code: enemy.code,
                    effects: [
                      fx("roadRivendellImmediateAttack", {
                        target: id,
                        player: ownerOf(s, enemy),
                      }),
                      fx("roadRivendellAllAttacks", {
                        ids: e.ids!.filter((x) => x !== id),
                        player: s.table?.first ?? 0,
                      }),
                    ],
                  },
                ]
              : [];
          }),
        );
      break;
    case "roadRivendellEngageOrcs": {
      const ids = (e.ids ?? []).filter((id) =>
        s.staging.some((u) => u.id === id),
      );
      if (!ids.length) break;
      const remaining = s.queue.splice(0);
      for (const id of ids) {
        const enemy = get(s, id);
        if (enemy) engage(s, enemy);
      }
      const triggered = s.queue.splice(0);
      s.queue = remaining;
      orderEntryEffects(s, triggered);
      break;
    }
    case "roadRivendellOrderEffects": {
      const effects = (e.ids ?? [])
        .map(decodeOrderedEffect)
        .filter((effect): effect is Effect => !!effect);
      if (!effects.length) break;
      if (effects.length === 1) {
        prepend(s, effects[0]);
        break;
      }
      choose(
        s,
        "Choose the next encounter effect",
        effects.map((effect, i) => ({
          id: String(i),
          label: effect.target
            ? `${name(get(s, effect.target) ?? ({ code: ROAD.ambush } as Unit))} · ${effect.kind === "roadRivendellAmbush" ? "Ambush" : effect.kind === "roadRivendellTaskmaster" ? "Deal damage" : effect.kind === "roadRivendellRaiders" ? "Discard attachments" : "Immediate attack"}`
            : "Encounter effect",
          effects: [
            effect,
            fx("roadRivendellOrderEffects", {
              ids: effects.filter((_, j) => j !== i).map(encodeOrderedEffect),
              player: s.table?.first ?? 0,
            }),
          ],
        })),
      );
      break;
    }
    case "roadRivendellSentryExhaust":
      if (
        (e.count ?? 0) > 0 &&
        !frodoCancellations(s).some((key) => !(e.ids ?? []).includes(key))
      )
        for (const character of [...allCharacters(s)].filter(
          (c) => !c.exhausted,
        ))
          exhaustCharacter(s, character);
      break;
    case "roadRivendellImmediateAttack": {
      if (
        !u ||
        !allEngaged(s).some((enemy) => enemy.id === u.id) ||
        !roadRivendellEnemyCanAttack(s, u)
      )
        break;
      // Immediate attacks have no action window before declaring the defender.
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      delete u.shadowCancelsDamage;
      delete u.shadowCancelsCombatDamage;
      const shadow = encounterDraw(s, true);
      if (shadow) {
        u.shadows.push(shadow);
        heirsShadowDealt(s, u);
      }
      choose(s, `${name(u)} · Immediate attack`, [
        ...opts(defendersFor(s, u), (d) => [
          fx("roadRivendellImmediateDefend", { target: u.id, source: d.id }),
        ]),
        {
          id: "undefended",
          label: "Leave the attack undefended",
          effects: [fx("roadRivendellImmediateDefend", { target: u.id })],
        },
      ]);
      break;
    }
    case "roadRivendellImmediateDefend":
      if (u) {
        if (s.combat) s.suspendedCombats.push(s.combat);
        beginEnemyAttack(s, u, e.source ? [e.source] : []);
        if (s.combat) {
          s.combat.immediate = true;
          s.combat.immediatePreviousAttacked = !!u.attacked;
        }
      }
      break;
    case "roadRivendellRuinedRoad":
      if (u && allActiveLocations(s).some((l) => l.id === u.id))
        choosePlayerResponse(s, u.id, u.code, "Ruined Road · Respond?", [
          {
            id: "progress",
            label: "Place two progress on Ruined Road",
            effects: [fx("roadRivendellRoadProgress", { target: u.id })],
          },
          ...opts(
            allHeroes(s).filter(
              (h) => ownerOf(s, h) === activeSeat(s) && h.exhausted,
            ),
            (h) => [fx("ready", { target: h.id })],
          ),
          skip,
        ]);
      break;
    case "roadRivendellRoadProgress":
      if (u) progressLocation(s, u, 2);
      break;
    case "roadRivendellOutpost": {
      let found = false;
      for (const pile of [s.encounterDeck, s.encounterDiscard]) {
        const index = pile.indexOf(ROAD.gate);
        if (index < 0) continue;
        pile.splice(index, 1);
        placeEncounter(s, ROAD.gate, true);
        found = true;
        break;
      }
      shuffle(s, s.encounterDeck);
      if (found && !allActiveLocations(s).length) {
        const gate = s.staging.find((u) => u.code === ROAD.gate)!;
        s.staging = s.staging.filter((u) => u.id !== gate.id);
        s.activeLocation = gate;
        log(s, "Goblin Gate becomes the active location.");
      }
      break;
    }
    case "roadRivendellStageReady":
      s.stageRevealing = false;
      check(s);
      break;
    default:
      return false;
  }
  return true;
}
