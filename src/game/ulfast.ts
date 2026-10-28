import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  enterEnemyEngaged,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { discardQuestAttachments } from "./board";
import { currentQuestUnit, mainQuestUnit } from "./quest-state";
import { stormcallerEffectiveThreat } from "./threat-read";
import { reduceThreat } from "./threat-reduction";
import { choosePlayerResponse } from "./player-ability-triggers";
import {
  ULFAST as U,
  ULFAST_ENCOUNTERS,
  ULFAST_QUESTS,
  ULFAST_RECIPES,
  ulfastPhase as phase,
  ulfastStageInfo,
} from "./ulfast-support";

const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const guard = (s: GameState) => s.staging.find((u) => u.code === U.guard);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const x = (s: GameState) => 1 + s.ulfast!.resources;
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const threats = (s: GameState, value: number) =>
  playerOrder(s).map((player) => fx("ulfastThreat", { value, player }));
function order(s: GameState, effects: Effect[], text: string) {
  if (effects.length > 1)
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
function resource(s: GameState) {
  s.ulfast!.resources++;
  log(s, `The main quest gains a resource (${s.ulfast!.resources}).`, "danger");
}
function add(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (card(code).type_code === "enemy" && player !== undefined)
    enterEnemyEngaged(s, u, player);
  else {
    s.staging.push(u);
    if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  }
  ulfastCardEntered(s, u);
  return u;
}
function find(s: GameState, type: string) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === type) return code;
    s.encounterDiscard.push(code);
  }
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function transferServant(s: GameState, u: Unit) {
  const p = firstPlayer(s);
  if (seatView(s, p).engaged.some((e) => e.id === u.id)) return;
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.engaged = s.engaged.filter((e) => e.id !== u.id);
    });
  s.staging = s.staging.filter((e) => e.id !== u.id);
  enterEnemyEngaged(s, u, p);
}
export function setupUlfast(s: GameState) {
  const r = ULFAST_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((r) =>
      ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section),
    )
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.ulfast = {
    initialized: false,
    currentQuest: ULFAST_QUESTS[0].code,
    resources: 0,
    setupChosen: [],
    resolving: [],
    servantAttacks: {},
    overwhelmed: [],
    prevented: [],
  };
  s.encounterDeck.splice(s.encounterDeck.indexOf(U.guard), 1);
  add(s, U.guard);
  shuffle(s, s.encounterDeck);
}
export function ulfastAdvance(s: GameState) {
  if (!s.ulfast || s.stageRevealing || s.progress < 5 * s.stage) return true;
  if (
    s.stage === 4 &&
    stageLive(s) &&
    (!guard(s) || stats(s, guard(s)!).health > guard(s)!.damage)
  )
    return true;
  if (questDefeated(s, s.ulfast.currentQuest)) return true;
  discardQuestAttachments(s, s.ulfast.currentQuest);
  if (s.stage === 4) {
    win(s);
    return true;
  }
  s.stage++;
  s.ulfast.currentQuest = ULFAST_QUESTS[s.stage - 1].code;
  s.ulfast.resources = 0;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(s, fx("ulfastStage", { player: firstPlayer(s) }));
  log(
    s,
    `${ULFAST_QUESTS[s.stage - 1].name} · Your search advances.`,
    "chapter",
  );
  return true;
}
export function ulfastConsideredEngaged(s: GameState, u: Unit, player: number) {
  return (
    u.code === U.guard &&
    !u.blanked &&
    s.staging.some((e) => e.id === u.id) &&
    playerOrder(s).includes(player) &&
    stormcallerEffectiveThreat(s, player) >= engagementCost(s, u)
  );
}
export function ulfastCardEntered(s: GameState, u: Unit) {
  if (u.code === U.servant && !u.blanked)
    prepend(s, fx("ulfastFollow", { target: u.id, player: firstPlayer(s) }));
}
function ulfastThreatRaised(s: GameState, player: number, amount: number) {
  if (amount <= 0) return;
  const q = s.ulfast!,
    effects: Effect[] = [];
  for (const u of seatView(s, player).engaged.filter(
    (u) => u.code === U.servant && !u.blanked,
  )) {
    const previous = q.servantAttacks[u.id];
    if (previous?.round === s.round && previous.phase === phase(s)) continue;
    q.servantAttacks[u.id] = { round: s.round, phase: phase(s) };
    effects.push(fx("immediateAttack", { target: u.id, player }));
  }
  order(s, effects, "Threat raised · Choose the next Servant of Sauron attack");
}
export function ulfastTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  const player = firstPlayer(s),
    g = guard(s);
  if (u.code === U.lawn) return [fx("ulfastResource", { player })];
  if (u.code === U.archway)
    return g ? [fx("immediateAttack", { target: g.id, player })] : [];
  if (u.code === U.streets) return threats(s, x(s));
  if (u.code === U.market)
    return [fx("ulfastFind", { text: "enemy", flag: true, player })];
  if (u.code === U.street)
    return [fx("ulfastFind", { text: "location", flag: true, player })];
  if (u.code === U.catacombs)
    return playerOrder(s).map((player) => fx("ulfastCatacombs", { player }));
}
export function ulfastEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ULFAST_ENCOUNTERS.some((c) => c.code === code)) return false;
  if (!fromReveal) return true;
  if (card(code).type_code === "treachery") {
    if (replay) {
      prepend(s, fx("ulfastTreachery", { code, player: firstPlayer(s) }));
      return true;
    }
    const physical = make(s, code);
    // Revealed treacheries are not discarded by the generic resolver after a scenario handles them.
    s.ulfast!.resolving.push(physical);
    prepend(
      s,
      fx("ulfastTreachery", {
        source: physical.id,
        code,
        player: firstPlayer(s),
      }),
      fx("ulfastTreacheryDone", {
        source: physical.id,
        player: firstPlayer(s),
      }),
    );
  } else if (code === U.agent) prepend(s, ...threats(s, 3));
  else if (code === U.messenger) {
    const u = [...s.staging].reverse().find((u) => u.code === code);
    if (u)
      prepend(
        s,
        fx("ulfastMessenger", { target: u.id, player: firstPlayer(s) }),
      );
  }
  return true;
}
export function ulfastShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === U.elite) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === U.patrol) c.attackBonus += s.ulfast!.resources;
  else if (code === U.agent) {
    c.attackBonus++;
    c.ulfastAgent = (c.ulfastAgent ?? 0) + 1;
  } else if (code === U.seen) {
    c.attackBonus++;
    c.ulfastExcess = (c.ulfastExcess ?? 0) + 1;
  } else if (code === U.streets) c.returnToStaging = true;
  else if (code === U.underGuard)
    c.ulfastUnderGuard = (c.ulfastUnderGuard ?? 0) + 1;
  else if (code === U.messenger) c.attackBonus++;
  else if (code === U.overwhelmed)
    prepend(s, fx("ulfastOverwhelmed", { target: c.enemyId, player }));
  else if (code === U.vigil) {
    const u = get(s, c.enemyId);
    if (u?.code === U.guard) {
      const index = Math.max(0, (u.revealedShadowCount ?? 1) - 1);
      if (u.shadows[index] === code) {
        removeShadowCard(u, index);
        const a = make(s, code);
        u.attachments.push({ id: a.id, code, exhausted: false });
      }
    }
  } else return false;
  return true;
}
export function ulfastEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ulfast")) return false;
  const q = s.ulfast!,
    player = e.player ?? activeSeat(s),
    u = get(s, e.target),
    g = guard(s);
  switch (e.kind) {
    case "ulfastSetup": {
      const ps = playerOrder(s),
        i = e.value ?? 0;
      if (i >= ps.length) {
        q.initialized = true;
        shuffle(s, s.encounterDeck);
        break;
      }
      choose(
        s,
        "Searching for Ulchor · Choose a different starting location",
        [...new Set(s.encounterDeck)]
          .filter(
            (code) =>
              card(code).type_code === "location" &&
              !q.setupChosen.includes(code),
          )
          .map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("ulfastSetupAdd", { code, value: i, player: ps[i] })],
          })),
      );
      break;
    }
    case "ulfastSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        q.setupChosen.push(e.code!);
        add(s, e.code!);
      }
      const next = (e.value ?? 0) + 1;
      prepend(
        s,
        fx("ulfastSetup", {
          value: next,
          player: playerOrder(s)[next] ?? firstPlayer(s),
        }),
      );
      break;
    }
    case "ulfastStage":
      if (s.stage === 2 || s.stage === 3)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("ulfastStageChoice", { value: s.stage, player }),
          ),
          fx("stageRevealed", { player }),
        );
      else {
        shuffleDiscard(s);
        prepend(
          s,
          ...playerOrder(s).map(() =>
            fx("ulfastFind", { text: "enemy", player }),
          ),
          fx("stageRevealed", { player }),
        );
      }
      break;
    case "ulfastStageChoice":
      choose(s, `${ULFAST_QUESTS[(e.value ?? 2) - 1].name} · Choose`, [
        {
          id: "threat",
          label: "Raise your threat by 5",
          effects: [fx("ulfastThreat", { value: 5, player })],
        },
        {
          id: "encounter",
          label:
            e.value === 2
              ? "Reveal an encounter card"
              : "City Guard attacks you",
          effects:
            e.value === 2
              ? [fx("reveal", { player })]
              : g
                ? [fx("immediateAttack", { target: g.id, player })]
                : [],
        },
      ]);
      break;
    case "ulfastResource":
      if (!e.flag || stageLive(s)) resource(s);
      break;
    case "ulfastThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "ulfastFollow":
      if (u && !u.blanked) transferServant(s, u);
      break;
    case "ulfastFind": {
      if (e.flag) shuffleDiscard(s);
      const code = find(s, e.text!);
      if (code) add(s, code, e.count === 1 ? player : undefined);
      break;
    }
    case "ulfastCatacombs": {
      const code = encounterDraw(s);
      if (code) {
        if (card(code).type_code === "enemy") add(s, code, player);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "ulfastSentry":
      if (u)
        choose(s, "Ulfast Sentry · Choose", [
          {
            id: "resource",
            label: "Place 1 resource on the main quest",
            effects: [fx("ulfastResource", { player })],
          },
          {
            id: "attack",
            label: "Ulfast Sentry attacks you",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
        ]);
      break;
    case "ulfastMessenger":
      if (u)
        choose(s, "Messenger from Mordor · Choose", [
          {
            id: "threat",
            label: "Raise each player's threat by the active location's threat",
            effects: threats(
              s,
              allActiveLocations(s).reduce((n, l) => n + threatOf(s, l), 0),
            ),
          },
          {
            id: "attack",
            label: "Messenger from Mordor attacks the first player",
            effects: [
              fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
            ],
          },
        ]);
      break;
    case "ulfastTravelAgain": {
      const ls = allActiveLocations(s);
      if (ls.length > 1)
        choose(
          s,
          "Under Guard · Choose an active location",
          ls.map((l) => option(l, ulfastTravelEffects(s, l) ?? [])),
        );
      else if (ls[0]) prepend(s, ...(ulfastTravelEffects(s, ls[0]) ?? []));
      else if (e.flag)
        prepend(s, fx("ulfastFind", { text: "location", player }));
      break;
    }
    case "ulfastTreachery":
      if (e.code === U.vigil && g) {
        const i = q.resolving.findIndex((c) => c.id === e.source);
        if (i >= 0) {
          const a = q.resolving.splice(i, 1)[0];
          g.attachments.push({ id: a.id, code: a.code, exhausted: false });
        }
      } else if (e.code === U.seen)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("ulfastSeen", { player })),
        );
      else if (e.code === U.patrol) {
        resource(s);
        prepend(s, fx("ulfastPatrol", { player }));
      } else if (e.code === U.overwhelmed)
        q.overwhelmed.push({ player: firstPlayer(s), round: s.round });
      else if (e.code === U.underGuard)
        prepend(s, fx("ulfastTravelAgain", { flag: true, player }));
      break;
    case "ulfastTreacheryDone": {
      const i = q.resolving.findIndex((c) => c.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      break;
    }
    case "ulfastSeen":
      choose(s, "We've Been Seen · Choose", [
        {
          id: "attack",
          label: "City Guard attacks you",
          effects: g ? [fx("immediateAttack", { target: g.id, player })] : [],
        },
        {
          id: "threat",
          label: `Raise your threat by ${1 + seatView(s, player).allies.length}`,
          effects: [
            fx("ulfastThreat", {
              value: 1 + seatView(s, player).allies.length,
              player,
            }),
          ],
        },
      ]);
      break;
    case "ulfastPatrol":
      choose(s, "Patrolling the Streets · Choose", [
        {
          id: "progress",
          label: "No progress on the current quest this phase",
          effects: [fx("ulfastBlock", { player })],
        },
        {
          id: "threat",
          label: `Raise each player's threat by ${x(s)}`,
          effects: threats(s, x(s)),
        },
      ]);
      break;
    case "ulfastBlock":
      q.blockedProgress = { round: s.round, phase: phase(s) };
      break;
    case "ulfastOverwhelmed":
      choose(s, "Overwhelmed · Shadow", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("ulfastThreat", { value: 2, player })],
        },
        {
          id: "prevent",
          label: "Attacking enemy cannot take damage this round",
          effects: [fx("ulfastPrevent", { target: e.target, player })],
        },
      ]);
      break;
    case "ulfastPrevent":
      if (u) q.prevented.push({ id: u.id, round: s.round });
      break;
    case "ulfastVigilResponse": {
      const a = g?.attachments.find((a) => a.id === e.source);
      if (g && a && !a.blanked)
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Extra Vigil · After attacking and damaging City Guard",
          [
            {
              id: "discard",
              label: "Raise your threat by 1 to discard Extra Vigil",
              effects: [fx("ulfastVigilPay", { source: a.id, player })],
            },
            skip,
          ],
        );
      break;
    }
    case "ulfastVigilPay":
      if (g?.attachments.some((a) => a.id === e.source)) {
        raiseThreat(s, 1, "cost");
        prepend(s, fx("ulfastVigilDiscard", { source: e.source, player }));
      }
      break;
    case "ulfastVigilDiscard": {
      const a = g?.attachments.find((a) => a.id === e.source);
      if (g && a) discardAttachment(s, g, a);
      break;
    }
    case "ulfastFearResponse":
      choosePlayerResponse(s, e.source!, U.fear, "Shadow of Fear · Defeated", [
        {
          id: "reduce",
          label: "Reduce each player's threat by 3",
          effects: playerOrder(s).map((player) =>
            fx("ulfastReduce", { player }),
          ),
        },
        skip,
      ]);
      break;
    case "ulfastReduce":
      reduceThreat(s, 3, U.fear, "encounter");
      break;
    case "ulfastCatResponse": {
      const targets = seatView(s, player).engaged.filter(
        (u) => !card(u.code).is_unique,
      );
      if (targets.length)
        choosePlayerResponse(
          s,
          e.source!,
          U.cat,
          "Cat and Mouse · Defeated",
          [
            ...targets.map((u) =>
              option(u, [fx("ulfastDiscardEnemy", { target: u.id, player })]),
            ),
            skip,
          ],
          undefined,
          player,
        );
      break;
    }
    case "ulfastDiscardEnemy":
      if (u) destroy(s, u, false);
      break;
    case "ulfastAssign": {
      if ((e.value ?? 0) <= 0) break;
      const targets = allCharacters(s).filter(
        (u) => ownerOf(s, u) === player && u.damage < stats(s, u).health,
      );
      if (targets.length)
        choose(
          s,
          "We've Been Seen · Assign excess damage",
          targets.map((u) =>
            option(u, [
              fx("damage", { target: u.id, value: 1, player }),
              fx("ulfastAssign", { value: e.value! - 1, player }),
            ]),
          ),
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
export const ULFAST_HOOKS: Batch4ScenarioHooks = {
  setup: setupUlfast,
  openingHandsKept: (s) => {
    if (s.ulfast!.initialized) return false;
    prepend(
      s,
      fx("ulfastSetup", { value: 0, player: firstPlayer(s) }),
      fx("nextRound"),
    );
    return true;
  },
  check: (s) => {
    const g = guard(s);
    if (g && stageLive(s)) g.damage = Math.min(g.damage, 5 * s.stage);
    for (const u of [...s.staging, ...allEngaged(s)].filter(
      (u) => u.code === U.servant && !u.blanked,
    ))
      if (!seatView(s, firstPlayer(s)).engaged.some((e) => e.id === u.id))
        transferServant(s, u);
  },
  advance: ulfastAdvance,
  stageInfo: ulfastStageInfo,
  stats: (s, u) => ({ attack: !u.blanked && u.code === U.sentry ? x(s) : 0 }),
  threatBonus: (s, u) =>
    (!u.blanked && [U.guard, U.streets].includes(u.code) ? x(s) : 0) +
    (card(u.code).type_code === "location" &&
    s.staging.some((l) => l.id === u.id)
      ? live(s, U.unwelcome).length
      : 0),
  engagementBonus: (s, u) =>
    (u.code === U.guard
      ? (stageLive(s) ? -5 * s.ulfast!.resources : 0) +
        20 *
          allActiveLocations(s).filter((l) => l.code === U.market && !l.blanked)
            .length -
        10 *
          u.attachments.filter((a) => a.code === U.vigil && !a.blanked).length
      : 0) -
    (s.staging.some((e) => e.id === u.id) ? 10 * live(s, U.cat).length : 0),
  immune: (_s, u) => u.code === U.guard && !u.blanked,
  indestructible: (_s, u) => u.code === U.guard && !u.blanked,
  cannotLeave: (_s, u) => u.code === U.guard && !u.blanked,
  cannotEngage: (_s, u) => u.code === U.guard && !u.blanked,
  consideredEngaged: ulfastConsideredEngaged,
  skipShadowDeal: (_s, u) => u.code === U.guard && !u.blanked,
  cannotAttach: (_s, u) => u.code === U.elite && !u.blanked,
  cannotReduceThreat: (s) =>
    !!live(s, U.archway).length &&
    !!guard(s) &&
    ulfastConsideredEngaged(s, guard(s)!, activeSeat(s)),
  refreshThreatBonus: (s) => live(s, U.lawn).length,
  locationProgressBlocked: (s, u) =>
    s.staging.some((l) => l.id === u.id) &&
    live(s, U.street).some((l) => l.id !== u.id),
  progress: (s, n, u) =>
    (s.stageRevealing && u.id === mainQuestUnit(s)?.id) ||
    (u.id === currentQuestUnit(s)?.id &&
      s.ulfast!.blockedProgress?.round === s.round &&
      s.ulfast!.blockedProgress.phase === phase(s))
      ? 0
      : n,
  damageAmount: (s, u, n) => {
    const q = s.ulfast!;
    if (q.prevented.some((p) => p.id === u.id && p.round === s.round)) return 0;
    if (card(u.code).type_code === "enemy") {
      if (live(s, U.catacombs).length && s.staging.some((e) => e.id === u.id))
        return 0;
      if (
        q.overwhelmed.some(
          (p) =>
            p.round === s.round &&
            (seatView(s, p.player).engaged.some((e) => e.id === u.id) ||
              ulfastConsideredEngaged(s, u, p.player)),
        )
      )
        return 0;
    }
    return u.code === U.guard && stageLive(s)
      ? Math.min(n, Math.max(0, 5 * s.stage - u.damage))
      : n;
  },
  damageDealt: (s, u, n, context) => {
    const c = s.combat;
    if (
      !c ||
      !context.combatDamage ||
      context.enemyId !== c.enemyId ||
      !allCharacters(s).some((a) => a.id === u.id)
    )
      return;
    if (u.damage >= stats(s, u).health) c.ulfastKilled = true;
    const excess = Math.max(
      0,
      n - Math.max(0, stats(s, u).health - (u.damage - n)),
    );
    if (excess && c.ulfastExcess)
      prepend(
        s,
        ...Array.from({ length: c.ulfastExcess }, () =>
          fx("ulfastAssign", {
            value: excess,
            player: c.attackPlayer ?? activeSeat(s),
          }),
        ),
      );
  },
  characterDestroyed: (s, _u, context) => {
    if (
      s.combat &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.ulfastKilled = true;
  },
  playerAttackResolved: (s, u, _ids, n) => {
    if (u.code === U.guard && n > 0)
      prepend(
        s,
        ...u.attachments
          .filter((a) => a.code === U.vigil && !a.blanked)
          .map((a) =>
            fx("ulfastVigilResponse", { source: a.id, player: activeSeat(s) }),
          ),
      );
  },
  attackFinished: (s, c) =>
    c.ulfastKilled
      ? [
          ...Array.from({ length: c.ulfastAgent ?? 0 }, () =>
            threats(s, 1),
          ).flat(),
          ...Array.from({ length: c.ulfastUnderGuard ?? 0 }, () =>
            fx("ulfastTravelAgain", { player: firstPlayer(s) }),
          ),
        ]
      : [],
  enemyAttackStarted: (s, u) => {
    if (u.code === U.elite && !u.blanked)
      prepend(s, fx("ulfastResource", { player: firstPlayer(s) }));
  },
  engaged: (s, u) => {
    const p = ownerOf(s, u),
      effects: Effect[] = live(s, U.fear).map(() =>
        fx("ulfastThreat", { value: 1, player: p }),
      );
    if (u.code === U.sentry && !u.blanked)
      effects.push(fx("ulfastSentry", { target: u.id, player: p }));
    order(s, effects, "Enemy engaged · Choose the next Forced effect");
  },
  threatRaised: ulfastThreatRaised,
  cardEntered: ulfastCardEntered,
  travelEffects: ulfastTravelEffects,
  sideQuestChosen: (s, u) => {
    if (u.code === U.unwelcome && !u.blanked)
      prepend(
        s,
        fx("ulfastFind", { text: "enemy", count: 1, player: firstPlayer(s) }),
      );
  },
  sideDefeated: (s, u) => {
    if (u.blanked) return;
    if (u.code === U.fear)
      prepend(
        s,
        fx("ulfastFearResponse", { source: u.id, player: firstPlayer(s) }),
      );
    if (u.code === U.cat)
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("ulfastCatResponse", { source: u.id, player }),
        ),
      );
  },
  roundEnd: (s) =>
    stageLive(s)
      ? [fx("ulfastResource", { flag: true, player: firstPlayer(s) })]
      : [],
  encounter: ulfastEncounter,
  shadow: ulfastShadow,
  effect: ulfastEffect,
  sharedEffect: (e) =>
    ["ulfastStage", "ulfastTreacheryDone", "ulfastResource"].includes(e.kind),
};
