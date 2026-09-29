// Player actions, legality checks and the public state projection.
import { card, name } from "./cards";
import type { Action, GameState, Unit } from "./types";
import { OBJECTIVES } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allHeroes,
  allEngaged,
  eachSeat,
  livingSeats,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
  selectSeat,
  syncSeat,
  passSeat,
  attackersFor,
  attachmentController,
} from "./table";

import { recordObservation, REVIEW_MODES } from "./presentation";
import {
  RuleError,
  canFight,
  characters,
  draw,
  eligiblePayers,
  enqueue,
  fx,
  get,
  has,
  log,
  objectiveFree,
  observation,
  pay,
  prepend,
  questWill,
  requireRule,
  resources,
  shuffle,
  stageInfo,
  stagingThreat,
  stats,
  threatOf,
  units,
  playCost,
  hasClue,
} from "./core";
import { check, engage, enterAlly, nextRound, progress } from "./board";
import { flush } from "./effects";
import { beginEnemyAttack, playerAttack } from "./combat";
import { eventEffect, useAbility } from "./player-cards";

export function canPlay(s: GameState, u: Unit): string | null {
  const c = card(u.code);
  if (s.flow?.pending)
    return "Review the current event before playing another card.";
  if (s.choice || s.status !== "playing")
    return "Resolve the current choice first.";
  if (s.table?.seats[activeSeat(s)].eliminated)
    return "This fellowship has been eliminated.";
  if (s.phase === "setup") return "Continue to the next action window.";
  if (
    ["ally", "attachment"].includes(c.type_code) &&
    s.table &&
    activeSeat(s) !== s.table.turn
  )
    return "Wait for this hero’s planning turn.";
  if (!eligiblePayers(s, c).length)
    return "A matching sphere hero is required.";
  if (["ally", "attachment"].includes(c.type_code) && s.phase !== "planning")
    return "Play allies and attachments during planning.";
  if (
    c.type_code === "ally" &&
    s.scenarioId === "dol-guldur" &&
    s.stage < 3 &&
    s.alliesPlayed >= 1
  )
    return "Only one ally may be played each round at this quest stage.";
  if (
    u.code === "rc132" &&
    (s.mendorBoost || !allCharacters(s).some((a) => a.code === "rc135"))
  )
    return "Mendor must be free, and his Support can be played once per round.";
  if (["01024", "01037", "01047", "01048", "01050"].includes(u.code))
    return "This response is offered automatically when its trigger occurs.";
  if (u.code === "01036" && s.heroes.length < 3)
    return "Thicket of Spears needs 3 heroes’ resource pools in the same deck.";
  if (resources(s, c.sphere_code) < playCost(s, c))
    return "Not enough matching resources.";
  if (
    c.is_unique &&
    units(s).some(
      (x) => x.code === c.code || x.attachments.some((a) => a.code === c.code),
    )
  )
    return "A unique card with this name is already in play.";
  return null;
}

export function discardTarget(s: GameState, target: string) {
  const parts = target.split("-").slice(1).map(Number);
  return {
    player: parts.length > 1 ? parts[0] : activeSeat(s),
    index: parts.at(-1)!,
  };
}

export function playTargets(s: GameState, u: Unit): Unit[] {
  const c = card(u.code);
  if (c.type_code === "attachment") {
    if (u.code === "01056")
      return [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ].filter((x) => card(x.code).type_code === "location");
    if (u.code === "01069")
      return allEngaged(s).filter((e) => e.code !== "01102");
    if (u.code === "01072") return allCharacters(s);
    return allHeroes(s);
  }
  if (u.code === "01020")
    return allCharacters(s).filter(
      (a) => card(a.code).type_code === "ally" && a.exhausted,
    );
  if (u.code === "01021")
    return s.heroes.filter(
      (a) =>
        !a.exhausted && allHeroes(s).some((h) => h.id !== a.id && h.exhausted),
    );
  if (u.code === "01032") return allCharacters(s);
  if (u.code === "01033")
    return characters(s).filter(
      (a) => !a.exhausted && card(a.code).text?.includes("Ranged"),
    );
  if (u.code === "01035")
    return characters(s).filter(
      (a) =>
        !a.exhausted &&
        canFight(a) &&
        [
          ...allEngaged(s),
          ...s.staging.filter((e) => card(e.code).type_code === "enemy"),
        ].some((enemy) => attackersFor(s, enemy).some((x) => x.id === a.id)),
    );
  if (["01034", "01052"].includes(u.code)) return allEngaged(s);
  if (u.code === "01063") return allCharacters(s).filter((a) => a.damage > 0);
  if (u.code === "01065")
    return s.staging.filter((a) => card(a.code).type_code === "enemy");
  if (u.code === "01066")
    return s.staging.filter((a) => card(a.code).type_code === "location");
  if (["01051", "01053", "01054"].includes(u.code))
    return (
      s.table && u.code !== "01053" ? livingSeats(s) : [activeSeat(s)]
    ).flatMap((player) =>
      seatView(s, player)
        .discard.map((code, i) => ({
          ...s.heroes[0],
          code,
          id: s.table ? `discard-${player}-${i}` : `discard-${i}`,
        }))
        .filter((a) =>
          u.code === "01051"
            ? card(a.code).type_code === "ally" &&
              card(a.code).sphere_code !== "neutral" &&
              (!card(a.code).is_unique ||
                !units(s).some((x) => x.code === a.code))
            : u.code === "01053"
              ? card(a.code).sphere_code === "spirit"
              : card(a.code).type_code === "hero",
        ),
    );
  return [];
}

export const needsTarget = (u: Unit) =>
  card(u.code).type_code === "attachment" ||
  [
    "01020",
    "01021",
    "01032",
    "01033",
    "01034",
    "01035",
    "01051",
    "01052",
    "01053",
    "01054",
    "01063",
    "01065",
    "01066",
  ].includes(u.code);

export const responseCards = ["01024", "01037", "01047", "01048", "01050"];

export function availableAbilities(s: GameState, u: Unit) {
  const results: { id?: string; label: string; disabled: boolean }[] = [];
  const heroAbility: Record<string, string> = {
    "01007": "Strength of spirit",
    "01010": "Look ahead",
    "01011": "Healing touch",
    "01012": "Draw 2 cards",
    "01014": "Rally fellowship",
    "01031": "Beorn’s fury",
    "01058": "Heal a hero",
    "01060": "Scout the path",
    "01062": "Draw a card",
    ...(s.table ? { "01043": "Visit another fellowship" } : {}),
  };
  if (heroAbility[u.code])
    results.push({
      label: heroAbility[u.code],
      disabled:
        u.code === "01007"
          ? s.eowynUsed || !s.hand.length
          : u.code === "01011"
            ? s.used.includes(u.id) ||
              u.resources < 1 ||
              !allCharacters(s).some((h) => h.damage > 0)
            : u.code === "01031"
              ? s.used.includes(u.id)
              : u.code === "01058"
                ? u.exhausted || !allHeroes(s).some((h) => h.damage > 0)
                : s.used.includes(u.id) || u.exhausted,
    });
  for (const a of u.attachments) {
    const active = ["01026", "01057", "01070", "01071", "01072"].includes(
      a.code,
    );
    if (active && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: card(a.code).name,
        disabled: a.exhausted,
      });
  }
  return results;
}

export function applyAction(input: GameState, action: Action): GameState {
  const s = structuredClone(input);
  if (action.type === "CONTINUE") {
    requireRule(
      s.flow?.pending && s.flow.pending.id === action.stepId,
      "This event is no longer waiting for confirmation.",
    );
    s.flow.pending = null;
    flush(s);
    syncSeat(s);
    return s;
  }
  if (action.type === "SET_REVIEW_MODE") {
    requireRule(
      REVIEW_MODES.includes(action.mode),
      "Choose a supported event review mode.",
    );
    requireRule(!!s.flow, "This game does not use event reviews.");
    // A pending review stays until it is confirmed; only later events follow the new mode.
    s.flow!.mode = action.mode;
    return s;
  }
  if (action.type === "SELECT_SEAT") {
    requireRule(
      s.table &&
        Number.isInteger(action.seat) &&
        action.seat >= 0 &&
        action.seat < s.table.seats.length,
      "Choose an existing hero seat.",
    );
    requireRule(!s.choice, "Resolve the current choice first.");
    selectSeat(s, action.seat);
    syncSeat(s);
    return s;
  }
  requireRule(!s.flow?.pending, "Review the current event before continuing.");
  const before = observation(s);
  requireRule(s.status === "playing", "This adventure has ended.");
  requireRule(
    !s.table?.seats[activeSeat(s)].eliminated,
    "This hero's seat has been eliminated. Switch to a surviving hero.",
  );
  if (
    s.table &&
    ([
      "KEEP",
      "MULLIGAN",
      "COMMIT",
      "TOGGLE_QUEST",
      "END_ATTACKS",
      "DEFEND",
    ].includes(action.type) ||
      (action.type === "NEXT" && ["planning", "encounter"].includes(s.phase)))
  )
    requireRule(
      activeSeat(s) === s.table.turn,
      `It is ${seatName(s, s.table.turn)}’s turn.`,
    );
  if (action.type === "CHOOSE") {
    requireRule(s.choice, "There is no pending choice.");
    const option = s.choice.options.find((o) => o.id === action.id);
    requireRule(option, "Invalid choice.");
    log(s, option.label);
    s.choice = null;
    prepend(s, ...option.effects);
    flush(s);
    return s;
  }
  requireRule(!s.choice, "Resolve the current choice first.");
  switch (action.type) {
    case "MULLIGAN":
      requireRule(
        s.phase === "setup" && !s.mulled,
        "You may mulligan once before the first round.",
      );
      s.deck.push(...s.hand.map((u) => u.code));
      s.hand = [];
      shuffle(s, s.deck);
      draw(s, 6);
      s.mulled = true;
      log(s, "You take your one mulligan.");
      break;
    case "KEEP":
      requireRule(s.phase === "setup", "Your opening hand is already kept.");
      if (passSeat(s)) nextRound(s);
      break;
    case "TOGGLE_QUEST": {
      requireRule(
        s.phase === "quest",
        "Choose questers during the quest phase.",
      );
      const u = get(s, action.id);
      requireRule(
        u && characters(s).some((x) => x.id === u.id) && !u.exhausted,
        "Only ready characters may commit.",
      );
      requireRule(
        s.scenarioId !== "hunt-for-gollum" ||
          s.stage !== 3 ||
          s.heroes.some(hasClue),
        "On the Trail: only a player whose hero holds a Clue may commit characters.",
      );
      s.committedIds = s.committedIds.includes(u.id)
        ? s.committedIds.filter((x) => x !== u.id)
        : [...s.committedIds, u.id];
      break;
    }
    case "COMMIT": {
      requireRule(s.phase === "quest", "Not at the commit step.");
      for (const u of characters(s).filter((u) =>
        s.committedIds.includes(u.id),
      )) {
        requireRule(!u.exhausted, "A selected character is exhausted.");
        u.exhausted = true;
        u.committed = true;
      }
      const committed = characters(s).filter((u) => u.committed);
      s.committedIds = [];
      log(s, `${committed.length} characters commit to the quest.`);
      enqueue(
        s,
        ...(committed.some((u) => u.code === "01002") ? [fx("theodred")] : []),
        ...(committed.some((u) => u.code === "01001") ? [fx("aragorn")] : []),
      );
      for (const u of committed) {
        if (u.code === "01044" && s.activeLocation)
          enqueue(
            s,
            fx("locationProgress", { target: s.activeLocation.id, value: 1 }),
          );
        if (u.code === "01045")
          enqueue(
            s,
            ...s.staging
              .filter((x) => card(x.code).type_code === "location")
              .map((x) => fx("locationProgress", { target: x.id, value: 1 })),
          );
      }
      enqueue(s, fx("commitSeat"));
      break;
    }
    case "NEXT": {
      if (s.phase === "planning") {
        if (!passSeat(s)) break;
        enqueue(s, fx("phaseEnd"), fx("startQuest"));
      } else if (s.phase === "staging") {
        const will = questWill(s),
          threat = stagingThreat(s),
          net = will - threat;
        s.lastQuest = { will, threat, net };
        if (net > 0) {
          log(
            s,
            `Quest succeeds: ${will} willpower − ${threat} threat = ${net} progress.`,
            "good",
          );
          const stageBefore = s.stage;
          progress(s, net);
          if (s.scenarioId === "hunt-for-gollum" && s.status === "playing") {
            const first = s.table?.first ?? 0;
            enqueue(s, fx("huntClaim", { player: first }));
            if (stageBefore === 1)
              enqueue(s, fx("huntLook", { count: 3, player: first }));
          }
        } else if (net < 0) {
          eachSeat(s, () => {
            s.threat -= net;
          });
          for (const jailor of s.staging.filter((u) => u.code === "01101"))
            enqueue(s, fx("jailor", { source: jailor.id }));
          log(
            s,
            `Quest fails by ${-net}. Threat rises to ${s.threat}.`,
            "danger",
          );
        } else
          log(s, "Willpower matches threat. No progress or threat increase.");
        enqueue(s, fx("finishQuestPhase"));
      } else if (s.phase === "travel") {
        requireRule(
          s.activeLocation || !s.staging.some((u) => u.code === "01088"),
          "You must travel to The East Bight.",
        );
        enqueue(s, fx("phaseEnd"), fx("startEncounter"));
      } else if (s.phase === "encounter") {
        if (!passSeat(s)) break;
        enqueue(s, fx("engagementRound"));
        enqueue(s, fx("phaseEnd"), fx("startCombat"));
      } else if (s.phase === "refresh") {
        enqueue(s, fx("phaseEnd"), fx("endRound"));
      } else throw new RuleError("Finish the current phase action first.");
      break;
    }
    case "PLAY": {
      const u = s.hand.find((u) => u.id === action.id);
      requireRule(u, "Card is not in your hand.");
      const reason = canPlay(s, u);
      requireRule(!reason, reason ?? "");
      const c = card(u.code);
      if (needsTarget(u))
        requireRule(
          playTargets(s, u).some((x) => x.id === action.target),
          "Choose a legal target.",
        );
      if (u.code === "01034")
        requireRule(
          ["defense", "attack"].includes(s.phase),
          "Feint is a Combat Action.",
        );
      if (["01065", "01066"].includes(u.code))
        requireRule(
          ["quest", "staging"].includes(s.phase),
          "This is a Quest Action.",
        );
      if (u.code === "01023")
        requireRule(
          s.hand.some(
            (a) =>
              card(a.code).type_code === "ally" &&
              (!card(a.code).is_unique ||
                !allCharacters(s).some((x) => x.code === a.code)),
          ),
          "You need an eligible ally in hand.",
        );
      if (u.code === "01036")
        requireRule(
          action.payment &&
            Object.values(action.payment).filter((v) => v > 0).length === 3,
          "Thicket of Spears must use 3 different heroes’ resource pools.",
        );
      let effectiveCost = Number(c.cost) || 0;
      if (u.code === "01051") {
        const target = discardTarget(s, action.target!);
        effectiveCost =
          Number(card(seatView(s, target.player).discard[target.index]).cost) ||
          0;
      }
      if (u.code === "01067") {
        effectiveCost = action.amount ?? 0;
        requireRule(
          Number.isInteger(effectiveCost) &&
            effectiveCost > 0 &&
            effectiveCost <=
              Math.max(
                ...livingSeats(s).map((i) => seatView(s, i).deck.length),
              ),
          "Choose a positive X no larger than an available player deck.",
        );
      }
      pay(s, { ...c, cost: effectiveCost }, action.payment);
      s.hand = s.hand.filter((x) => x.id !== u.id);
      log(s, `Played ${c.name}.`, "good");
      if (c.type_code === "ally") {
        s.alliesPlayed++;
        enterAlly(s, u, false, true);
      } else if (c.type_code === "attachment") {
        get(s, action.target)!.attachments.push({
          id: u.id,
          code: u.code,
          exhausted: false,
          ...(s.table ? { owner: activeSeat(s) } : {}),
        });
      } else {
        s.discard.push(u.code);
        eventEffect(s, u.code, action.target, effectiveCost);
      }
      break;
    }
    case "ABILITY": {
      requireRule(s.phase !== "setup", "Wait for an action window.");
      const u = get(s, action.id);
      requireRule(
        u &&
          (action.attachmentId
            ? u.attachments.some(
                (a) =>
                  a.id === action.attachmentId &&
                  attachmentController(s, u, a) === activeSeat(s),
              )
            : characters(s).some((x) => x.id === u.id) || u.code === "01007"),
        "Choose a character or attachment you control.",
      );
      useAbility(s, u, action.attachmentId);
      break;
    }
    case "CLAIM": {
      requireRule(s.phase !== "setup", "Wait for an action window.");
      const objective = s.staging.find((u) => u.id === action.id);
      const hero = s.heroes.find((h) => h.id === action.heroId);
      requireRule(
        objective && objectiveFree(s, objective) && hero,
        "Choose an unguarded objective and a free hero.",
      );
      s.threat += 2;
      s.staging = s.staging.filter((u) => u.id !== objective.id);
      hero.attachments.push({
        id: objective.id,
        code: objective.code,
        exhausted: false,
      });
      log(
        s,
        `${name(hero)} claims ${name(objective)}. Threat rises by 2.`,
        "good",
      );
      if (s.captiveMendor) {
        const m = s.captiveMendor;
        s.captiveMendor = null;
        m.damage = 1;
        s.allies.push(m);
        log(s, "Mendor is rescued with 1 damage.", "good");
      }
      break;
    }
    case "TRAVEL": {
      requireRule(
        s.phase === "travel" && !s.activeLocation,
        "You may travel only when there is no active location.",
      );
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "location",
      );
      requireRule(u, "Choose a location in staging.");
      requireRule(
        u.code === "01088" || !s.staging.some((x) => x.code === "01088"),
        "You must travel to The East Bight.",
      );
      if (u.code === "01077")
        requireRule(
          livingSeats(s).every((i) =>
            seatView(s, i).heroes.some((h) => !h.exhausted),
          ),
          "Great Forest Web requires a ready hero.",
        );
      if (u.code === "01094")
        requireRule(
          seatView(s, s.table?.first ?? 0).hand.length >= 2,
          "Necromancer’s Pass requires 2 cards to discard.",
        );
      if (u.code === "01078")
        requireRule(
          s.encounterDeck.length > 0,
          "There is no encounter card to reveal for this travel cost.",
        );
      if (u.code === "01077")
        enqueue(
          s,
          ...playerOrder(s).map((player) => fx("travelExhaust", { player })),
        );
      if (u.code === "01094")
        enqueue(s, fx("payPass", { player: s.table?.first ?? 0 }));
      if (u.code === "01078")
        enqueue(s, fx("reveal", { player: s.table?.first ?? 0 }));
      enqueue(
        s,
        fx("travelEnter", { target: u.id, player: s.table?.first ?? 0 }),
      );
      break;
    }
    case "ENGAGE": {
      requireRule(
        !s.table || activeSeat(s) === s.table.turn,
        "Wait for this fellowship’s engagement turn.",
      );
      requireRule(
        s.phase === "encounter" && !s.optionalEngagement,
        "You may optionally engage one enemy per round.",
      );
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "enemy",
      );
      requireRule(u, "Choose an enemy in staging.");
      requireRule(
        u.code !== "01083" ||
          !s.staging.some(
            (e) => e.id !== u.id && card(e.code).type_code === "enemy",
          ),
        "Goblin Sniper cannot be optionally engaged while another enemy is in staging.",
      );
      s.optionalEngagement = true;
      engage(s, u);
      break;
    }
    case "DEFEND": {
      requireRule(
        s.phase === "defense" && !s.combat,
        "Resolve attacks one at a time.",
      );
      const enemy = s.engaged.find(
        (u) =>
          u.id === action.enemyId &&
          !u.attacked &&
          !u.feinted &&
          !has(u, "01069"),
      );
      requireRule(enemy, "This enemy cannot attack again.");
      beginEnemyAttack(
        s,
        enemy,
        action.defenderIds ?? (action.defenderId ? [action.defenderId] : []),
      );
      break;
    }
    case "ATTACK": {
      requireRule(
        !s.table || activeSeat(s) === s.table.turn,
        "Wait for this fellowship’s attack turn.",
      );
      requireRule(s.phase === "attack", "Enemies must finish attacking first.");
      const enemy = [
        ...allEngaged(s),
        ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
      ].find(
        (u) =>
          u.id === action.enemyId &&
          (s.table ? !u.attackedBy?.includes(activeSeat(s)) : !u.attacked),
      );
      requireRule(enemy, "You may attack each enemy once per round.");
      playerAttack(s, enemy, action.attackerIds, true);
      break;
    }
    case "END_ATTACKS":
      requireRule(s.phase === "attack", "Finish enemy attacks first.");
      if (!passSeat(s)) break;
      enqueue(s, fx("phaseEnd"), fx("endCombat"));
      break;
    default:
      throw new RuleError("Unknown action.");
  }
  if (before) {
    if (!s.queue.length) check(s);
    recordObservation(s, before, observation(s)!, action);
  }
  flush(s);
  if (!s.flow?.pending) check(s);
  syncSeat(s);
  return s;
}

export function score(s: GameState) {
  return (
    (s.round - 1) * 10 +
    seatIndices(s).reduce((n, i) => {
      const p = seatView(s, i);
      return (
        n +
        p.threat +
        p.fallenThreat +
        p.heroes.reduce((n, h) => n + h.damage, 0)
      );
    }, 0) -
    s.victory
  );
}

export function publicState(s: GameState) {
  return {
    awaitingConfirmation: !!s.flow?.pending,
    easyMode: !!s.easyMode,
    reviewMode: s.flow ? (s.flow.mode ?? "all") : null,
    resolution: s.flow?.pending ?? null,
    recentEvents: s.flow?.history.slice(-8) ?? [],
    mode: s.status,
    table: s.table
      ? {
          active: s.table.active,
          first: s.table.first,
          turn: s.table.turn,
          seats: seatIndices(s).map((i) => {
            const p = seatView(s, i);
            return {
              name: seatName(s, i),
              hero: p.startingHeroes[0],
              startingHeroes: p.startingHeroes,
              deckId: p.deckId,
              eliminated: s.table!.seats[i].eliminated,
              threat: p.threat,
              hand: p.hand.map((u) => ({ id: u.id, code: u.code })),
              deckCount: p.deck.length,
              heroes: p.heroes,
              allies: p.allies,
              engaged: p.engaged.map(
                ({ shadows, facedownCard: _facedown, ...u }) => ({
                  ...u,
                  shadowCount: shadows.length,
                }),
              ),
              passed: s.table!.passed.includes(i),
            };
          }),
        }
      : null,
    playMode: s.playMode,
    scenario: s.scenarioId,
    campaign: s.campaign,
    prisoner: s.prisoner ? name(s.prisoner) : null,
    captiveMendor: !!s.captiveMendor,
    objectives: s.staging
      .filter((u) => OBJECTIVES.includes(u.code))
      .map((u) => ({ id: u.id, name: name(u), free: objectiveFree(s, u) })),
    deck: s.deckId,
    peek: s.peek ? card(s.peek).name : null,
    round: s.round,
    phase: s.phase,
    threat: s.threat,
    quest: { ...stageInfo(s), stage: s.stage, progress: s.progress },
    heroes: s.heroes.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    allies: s.allies.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    hand: s.hand.map((u) => ({
      id: u.id,
      code: u.code,
      name: name(u),
      playable: canPlay(s, u) === null,
    })),
    deckCount: s.deck.length,
    encounterCount: s.encounterDeck.length,
    pendingWolfReturns: s.pendingWolfReturns?.length ?? 0,
    staging: s.staging.map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      threat: threatOf(s, u),
      progress: u.progress,
    })),
    engaged: s.engaged.map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      damage: u.damage,
      attacked: u.attacked,
    })),
    activeLocation: s.activeLocation
      ? {
          name: name(s.activeLocation),
          progress: s.activeLocation.progress,
          quest: card(s.activeLocation.code).quest,
        }
      : null,
    willpower: questWill(s),
    stagingThreat: stagingThreat(s),
    choice: s.choice
      ? {
          title: s.choice.title,
          options: s.choice.options.map((o) => ({ id: o.id, label: o.label })),
        }
      : null,
    lastQuest: s.lastQuest,
    lastLog: s.log.slice(-5),
    coordinateSystem:
      "DOM card table; origin top-left, x right, y down. No spatial movement.",
  };
}
