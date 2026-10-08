import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stagingThreat,
  stats,
} from "./core";
import {
  discardPlayerDeck,
  discardCharacter,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  readyCharacter,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { enemyAttackPrevented, globalUnits } from "./core";
import { resolveDoomed } from "./voice-isengard";
import { canLeaveHand } from "./hand-rules";
import { khazadCannotExhaust } from "./khazad-dum";
import { currentQuestUnit, allQuestUnits } from "./quest-state";
import { selectedSideQuest, sideQuestArea } from "./side-quest-support";
import {
  CHETWOOD as C,
  CHETWOOD_RECIPES,
  chetwoodSideTime,
} from "./chetwood-support";

const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const enemies = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "enemy");
export const chetwoodQuestCount = (s: GameState) => allQuestUnits(s).length;
const iarion = (s: GameState) =>
  allCharacters(s).find((u) => u.code === C.iarion);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
}
export function setupChetwood(s: GameState) {
  const recipe = CHETWOOD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.chetwood = {
    initialized: false,
    setupLocations: [],
    hiddenHands: {},
    progressRound: 0,
    progressPlaced: {},
  };
}
export function chetwoodOpeningHandsKept(s: GameState) {
  if (!s.chetwood || s.chetwood.initialized) return false;
  prepend(s, fx("chetSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function chetwoodCheck(s: GameState) {
  const q = s.chetwood;
  if (!q?.initialized || s.status !== "playing") return;
  for (const [id, hand] of Object.entries(q.hiddenHands)) {
    q.hiddenHands[id] = hand.filter((u) => {
      if (!s.table?.seats[u.owner!]?.eliminated) return true;
      forOwner(s, u.owner!, () => s.removed.push(u.code));
      return false;
    });
  }
  const ally = iarion(s);
  if (!ally && !q.captive) {
    lose(s, "Iârion has left play. The Rangers' mission has failed.");
    return;
  }
  if (ally && !ally.blanked && ownerOf(s, ally) !== firstPlayer(s)) {
    forOwner(s, ownerOf(s, ally), () => {
      s.allies = s.allies.filter((u) => u.id !== ally.id);
    });
    ally.controller = firstPlayer(s);
    forOwner(s, firstPlayer(s), () => s.allies.push(ally));
  }
}
/** The encounter objective is not owned by the eliminated player. Its control follows the first-player token. */
export function chetwoodPlayerEliminated(s: GameState, player: number) {
  if (!s.chetwood) return;
  const ally = s.allies.find((u) => u.code === C.iarion && !u.blanked);
  const next = playerOrder(s).find((p) => p !== player);
  if (!ally || next === undefined) return;
  s.allies = s.allies.filter((u) => u.id !== ally.id);
  ally.controller = next;
  forOwner(s, next, () => s.allies.push(ally));
}
export function advanceChetwood(s: GameState) {
  if (!s.chetwood) return false;
  if (
    s.chetwood.initialized &&
    !s.queue.length &&
    !s.choice &&
    s.progress >= 30 &&
    iarion(s) &&
    ![...s.staging, ...allEngaged(s)].some(
      (u) => u.code === C.party && !u.blanked,
    )
  ) {
    if (!questDefeated(s, C.quest)) win(s);
  }
  return true;
}
export const chetwoodNoEngagementChecks = (s: GameState) => !!s.chetwood;
export function chetwoodStats(s: GameState, u: Unit) {
  const ally = u.code === C.iarion && !u.blanked ? chetwoodQuestCount(s) : 0;
  const orc =
    card(u.code).type_code === "enemy" && hasTrait(u, "Orc")
      ? live(s, C.ambush).length
      : 0;
  return { will: ally, attack: ally + orc, defense: ally + orc };
}
export function chetwoodThreatBonus(s: GameState, u: Unit) {
  return (
    (u.code === C.hills && !u.blanked ? chetwoodQuestCount(s) : 0) +
    (u.code === C.country && !u.blanked && selectedSideQuest(s) ? 2 : 0) +
    (card(u.code).type_code === "enemy" && hasTrait(u, "Orc")
      ? live(s, C.ambush).length
      : 0)
  );
}
export const chetwoodCannotDamage = (s: GameState, u: Unit) =>
  card(u.code).type_code === "enemy" &&
  s.staging.some((x) => x.id === u.id) &&
  live(s, C.party).length > 0;
/** Count actual progress on each physical quest; removing tokens or switching quests does not reset it. */
export function chetwoodProgress(s: GameState, amount: number) {
  const q = s.chetwood;
  if (!q) return amount;
  if (q.progressRound !== s.round) {
    q.progressRound = s.round;
    q.progressPlaced = {};
  }
  const id = currentQuestUnit(s)?.id;
  if (!id) return 0;
  const before = q.progressPlaced[id] ?? 0;
  const placed = live(s, C.rearguard).length
    ? Math.min(amount, Math.max(0, 3 - before))
    : amount;
  q.progressPlaced[id] = before + placed;
  return placed;
}
export function chetwoodCardEntered(
  _s: GameState,
  u: Unit,
  fromReveal: boolean,
) {
  if (chetwoodSideTime(u.code))
    u.timeCounters = fromReveal ? chetwoodSideTime(u.code) : 0;
}
export function chetwoodAfterReveal(s: GameState, code: string) {
  if (card(code).type_code !== "encounter-side-quest") return;
  const ally = iarion(s);
  if (ally && ally.exhausted && !ally.blanked)
    prepend(
      s,
      fx("chetReadyIarion", { target: ally.id, player: ownerOf(s, ally) }),
    );
}
export function chetwoodQuestStart(s: GameState) {
  const effects = live(s, C.borders).map((u) =>
    fx("chetBorders", { target: u.id, code: u.code, player: firstPlayer(s) }),
  );
  if (effects.length)
    prepend(
      s,
      fx("fangornOrder", {
        effects,
        player: firstPlayer(s),
        text: "Borders of Bree-land · Choose the next Forced effect",
      }),
    );
}
export function chetwoodEndStaging(s: GameState) {
  const u = currentQuestUnit(s);
  if (u?.code !== C.rearguard || u.blanked) return false;
  prepend(
    s,
    fx("reveal", { player: firstPlayer(s) }),
    fx("questReady", { flag: true, player: firstPlayer(s) }),
  );
  return true;
}
export function chetwoodRefreshEnd(s: GameState) {
  if (!s.chetwood) return;
  const effects: Effect[] = [
    fx("chetRefreshThreat", { code: C.quest, player: firstPlayer(s) }),
  ];
  for (const u of s.staging) {
    if (u.blanked || !chetwoodSideTime(u.code) || !u.timeCounters) continue;
    u.timeCounters--;
    if (!u.timeCounters)
      effects.push(
        fx("chetRescueExpired", {
          target: u.id,
          code: u.code,
          player: firstPlayer(s),
        }),
      );
  }
  prepend(
    s,
    fx("fangornOrder", {
      effects,
      player: firstPlayer(s),
      text: "Choose the next end-of-refresh effect",
    }),
  );
}
export function chetwoodSideDefeated(s: GameState, u: Unit) {
  if ([C.rescue, C.wilderness].includes(u.code))
    prepend(
      s,
      fx("chetRescueCards", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
}
function returnEnemy(s: GameState, u: Unit) {
  if (!allEngaged(s).some((e) => e.id === u.id)) return;
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
export function chetwoodCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["ally", "objective-ally"].includes(card(u.code).type_code)
  )
    s.combat.chetwoodAllyKilled = true;
}
export function chetwoodAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  const enemy = get(s, c.enemyId);
  if (!enemy) return;
  const player = c.attackPlayer ?? activeSeat(s);
  const effects: Effect[] = [];
  if (
    c.chetwoodReturnAfterAttack ||
    (c.chetwoodAllyKilled &&
      ((!enemy.blanked && enemy.code === C.marauder) ||
        c.chetwoodReturnOnAllyKill))
  )
    effects.push(
      fx("chetReturn", {
        target: enemy.id,
        code: enemy.code,
        player,
        text: `Return ${name(enemy)} to staging`,
      }),
    );
  if (c.chetwoodAllyKilled && !enemy.blanked && enemy.code === C.captain)
    effects.push(
      fx("chetCaptain", {
        target: enemy.id,
        code: enemy.code,
        player,
        text: "Angmar Captain · Discard a deck card and check for another attack",
      }),
    );
  if (effects.length)
    prepend(s, fx("chetAttackEffects", { effects, player: firstPlayer(s) }));
}
export function chetwoodTravelProblem(s: GameState, u: Unit) {
  if (u.blanked) return null;
  if (u.code === C.forest && !enemies(s).length)
    return "Chetwood Forest requires a staging enemy to engage.";
  if (
    u.code === C.homestead &&
    !s.encounterDeck.length &&
    !s.encounterDiscard.length
  )
    return "Outlying Homestead requires an encounter card to reveal.";
  return null;
}
export function chetwoodTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (u.code === C.forest)
    return [fx("chetTravelEngage", { player: firstPlayer(s) })];
  if (u.code === C.homestead) return [fx("reveal", { player: firstPlayer(s) })];
  return undefined;
}
export function chetwoodEncounter(s: GameState, code: string, replay = false) {
  if (!s.chetwood) return false;
  const newest = [...s.staging].reverse().find((u) => u.code === code);
  if (code === C.orc) {
    choose(s, "Angmar Orc · Discard an ally or reveal a card", [
      ...allCharacters(s)
        .filter((u) =>
          ["ally", "objective-ally"].includes(card(u.code).type_code),
        )
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("chetDiscardAlly", { target: u.id })],
        })),
      {
        id: "reveal",
        label: "Reveal an additional encounter card",
        effects: [fx("reveal")],
      },
    ]);
  } else if (code === C.rescue && newest) {
    const ally = iarion(s);
    if (ally) {
      s.chetwood.captive = { questId: newest.id, unit: ally };
      forOwner(s, ownerOf(s, ally), () => {
        s.allies = s.allies.filter((u) => u.id !== ally.id);
        s.committedIds = s.committedIds.filter((id) => id !== ally.id);
      });
      ally.committed = false;
      log(s, "Iârion is placed facedown beneath Rescue Iârion.", "danger");
    }
  } else if (code === C.wilderness && newest) {
    const hidden = (s.chetwood.hiddenHands[newest.id] ??= []);
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        const cards = s.hand.filter(canLeaveHand);
        s.hand = s.hand.filter((u) => !canLeaveHand(u));
        for (const u of cards) {
          u.owner ??= p;
          hidden.push(u);
        }
      });
    log(
      s,
      `${hidden.length} hand cards are placed facedown beneath Lost in the Wilderness.`,
      "danger",
    );
  } else if (code === C.ambush) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("chetSearchOrc", { player })),
      fx("chetShuffle"),
    );
  } else if (code === C.weight) {
    prepend(
      s,
      ...Array.from({ length: chetwoodQuestCount(s) }, () =>
        fx("reveal", { player: firstPlayer(s) }),
      ),
    );
  } else if (code === C.needs) {
    const options: Option[] = [];
    if (
      [...s.encounterDeck, ...s.encounterDiscard].some(
        (c) => card(c).type_code === "encounter-side-quest",
      )
    )
      options.push({
        id: "search",
        label: "Search for an encounter side quest and reveal it",
        effects: [fx("chetSearchSide"), fx("chetShuffle")],
      });
    for (const u of allQuestUnits(s).filter(
      (u) => u.id !== currentQuestUnit(s)?.id,
    ))
      options.push({
        id: u.id,
        code: u.code,
        label: `Make ${name(u)} the current quest`,
        effects: [
          fx("chetSwitchQuest", { target: u.id, code: u.code }),
          fx("chetShuffle"),
        ],
      });
    if (!options.length) prepend(s, fx("chetShuffle"));
    else
      choose(s, "Pressing Needs · Search or change the current quest", options);
  } else if (code === C.speed) {
    const players = playerOrder(s).filter(
      (p) => seatView(s, p).engaged.length > 0,
    );
    if (!players.length) prepend(s, fx("chetSpeedKeywords"));
    else
      prepend(
        s,
        ...players.map((player) => fx("chetReturnChoice", { player })),
      );
  } else if (code === C.assault) {
    const will = allCharacters(s)
      .filter(
        (u) =>
          u.committed || seatView(s, ownerOf(s, u)).committedIds.includes(u.id),
      )
      .reduce((sum, u) => sum + stats(s, u).will, 0);
    prepend(
      s,
      fx("chetAssault", {
        ids: will > stagingThreat(s) ? enemies(s).map((u) => u.id) : [],
        value: 0,
        player: firstPlayer(s),
      }),
    );
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function chetwoodShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if (code === C.country) c.attackBonus += chetwoodQuestCount(s);
  else if (code === C.borders)
    c.defensePenalty = (c.defensePenalty ?? 0) + chetwoodQuestCount(s);
  else if (code === C.weight)
    prepend(
      s,
      fx("chetDiscardAttachments", {
        count: chetwoodQuestCount(s),
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  else if (code === C.orc) {
    c.attackBonus++;
    c.chetwoodReturnOnAllyKill = true;
  } else if (code === C.marauder)
    c.attackBonus += seatView(s, c.attackPlayer ?? activeSeat(s)).allies.length;
  else if (code === C.speed) {
    c.attackBonus++;
    c.chetwoodReturnAfterAttack = true;
  } else if (code === C.forest)
    prepend(
      s,
      fx("chetExhaustOrReturn", { player: c.attackPlayer ?? activeSeat(s) }),
    );
  else return false;
  return true;
}
function searchOptions(s: GameState, type: "orc" | "side"): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) =>
    (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
      (code, index) => {
        const c = card(code);
        if (
          type === "orc"
            ? c.type_code !== "enemy" ||
              !(c.traits ?? "")
                .split(".")
                .map((s) => s.trim())
                .includes("Orc")
            : c.type_code !== "encounter-side-quest"
        )
          return [];
        return [
          {
            id: `${zone}-${index}`,
            code,
            label: `${c.name} · encounter ${zone}`,
            effects: [
              fx(type === "orc" ? "chetTakeOrc" : "chetTakeSide", {
                text: zone,
                value: index,
                code,
              }),
            ],
          },
        ];
      },
    ),
  );
}
export function chetwoodEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("chet")) return false;
  const q = s.chetwood,
    u = get(s, e.target);
  if (!q) return true;
  switch (e.kind) {
    case "chetSetup": {
      const ally = make(s, C.iarion);
      ally.controller = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(ally));
      const party = make(s, C.party);
      s.staging.push(party);
      enemyAddedToStaging(s, party);
      q.initialized = true;
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("chetSetupLocation", { player })),
        fx("chetShuffle"),
      );
      break;
    }
    case "chetSetupLocation":
      choose(
        s,
        "Add a different setup location",
        [...new Set(s.encounterDeck)]
          .filter(
            (code) =>
              card(code).type_code === "location" &&
              !q.setupLocations.includes(code),
          )
          .map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("chetAddLocation", { code })],
          })),
      );
      break;
    case "chetAddLocation": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0 && !q.setupLocations.includes(e.code!)) {
        s.encounterDeck.splice(i, 1);
        q.setupLocations.push(e.code!);
        s.staging.push(make(s, e.code!));
      }
      break;
    }
    case "chetShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "chetReadyIarion":
      if (u && u.exhausted && !u.blanked)
        choose(s, "Iârion · Ready after the side quest?", [
          {
            id: "ready",
            label: "Ready Iârion",
            effects: [fx("chetReady", { target: u.id })],
          },
          { id: "skip", label: "Skip the response", effects: [] },
        ]);
      break;
    case "chetReady":
      if (u) readyCharacter(s, u);
      break;
    case "chetBorders":
      if (u && !u.blanked && s.staging.some((x) => x.id === u.id))
        choose(
          s,
          "Borders of Bree-land · Return an engaged enemy",
          allEngaged(s).map((enemy) => ({
            id: enemy.id,
            code: enemy.code,
            label: `${name(enemy)} · ${seatName(s, ownerOf(s, enemy))}`,
            effects: [fx("chetReturn", { target: enemy.id })],
          })),
        );
      break;
    case "chetReturnChoice":
      choose(
        s,
        "Surprising Speed · Return an enemy",
        s.engaged.map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: name(enemy),
          effects: [fx("chetReturn", { target: enemy.id })],
        })),
      );
      break;
    case "chetReturn":
      if (u) returnEnemy(s, u);
      break;
    case "chetRefreshThreat": {
      const amount = enemies(s).length;
      for (const p of playerOrder(s))
        forOwner(s, p, () => raiseThreat(s, amount, "encounter"));
      break;
    }
    case "chetRescueExpired":
      if (u && !u.blanked && !u.timeCounters && q.captive?.questId === u.id) {
        s.encounterDiscard.push(q.captive.unit.code);
        delete q.captive;
        lose(
          s,
          "Rescue Iârion runs out of time. Iârion is discarded and the players lose.",
        );
      }
      break;
    case "chetRescueCards": {
      if (q.captive && q.captive.questId === e.target) {
        const ally = q.captive.unit;
        delete q.captive;
        ally.controller = firstPlayer(s);
        ally.committed = false;
        ally.exhausted = true;
        forOwner(s, firstPlayer(s), () => s.allies.push(ally));
        log(s, "Iârion is rescued exhausted by the first player.", "good");
      }
      const hidden = q.hiddenHands[e.target!] ?? [];
      delete q.hiddenHands[e.target!];
      for (const c of hidden) {
        const owner = c.owner!;
        if (s.table?.seats[owner]?.eliminated)
          forOwner(s, owner, () => s.removed.push(c.code));
        else forOwner(s, owner, () => s.hand.push(c));
      }
      break;
    }
    case "chetDiscardAlly":
      if (u) discardCharacter(s, u);
      break;
    case "chetTravelEngage":
      choose(
        s,
        "Chetwood Forest · Choose a player and enemy",
        playerOrder(s).flatMap((player) =>
          enemies(s).map((enemy) => ({
            id: `${player}-${enemy.id}`,
            code: enemy.code,
            label: `${seatName(s, player)} engages ${name(enemy)}`,
            effects: [fx("engage", { target: enemy.id, player })],
          })),
        ),
      );
      break;
    case "chetSearchOrc":
      choose(s, "Orc Ambush · Search for an Orc", searchOptions(s, "orc"));
      break;
    case "chetSearchSide":
      choose(
        s,
        "Pressing Needs · Reveal a side quest",
        searchOptions(s, "side"),
      );
      break;
    case "chetTakeOrc":
    case "chetTakeSide": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value === undefined || pile[e.value] !== e.code) break;
      const [code] = pile.splice(e.value, 1);
      if (e.kind === "chetTakeSide") revealed(s, code);
      else engage(s, make(s, code));
      break;
    }
    case "chetSwitchQuest":
      if (e.target?.startsWith("quest:")) {
        if (s.sideQuestSelections)
          delete s.sideQuestSelections[sideQuestArea(s)];
      } else if (u && card(u.code).type_code.endsWith("side-quest")) {
        (s.sideQuestSelections ??= {})[sideQuestArea(s)] = {
          id: u.id,
          code: u.code,
          phase: s.phase,
        };
      }
      log(
        s,
        `${card(e.code!).name} is now the current quest until this phase ends.`,
      );
      break;
    case "chetSpeedKeywords":
      prepend(s, fx("amonSurgeWindow", { code: C.speed }), fx("reveal"));
      resolveDoomed(s, 1, "encounter");
      break;
    case "chetAssault": {
      const [id, ...ids] = e.ids ?? [],
        enemy = get(s, id);
      if (!id) {
        if (!e.value) {
          s.encounterDeck.push(...s.encounterDiscard.splice(0));
          shuffle(s, s.encounterDeck);
        }
      } else if (
        enemy &&
        s.staging.some((u) => u.id === id) &&
        !enemyAttackPrevented(s, enemy)
      ) {
        prepend(
          s,
          fx("immediateAttack", { target: id, player: firstPlayer(s) }),
          fx("chetAssault", {
            ids,
            value: (e.value ?? 0) + 1,
            player: firstPlayer(s),
          }),
        );
      } else
        prepend(
          s,
          fx("chetAssault", { ids, value: e.value, player: firstPlayer(s) }),
        );
      break;
    }
    case "chetCaptain": {
      if (!u) break;
      const before = s.queue.length;
      const [code] = discardPlayerDeck(s, 1);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        ...(code && card(code).type_code === "ally"
          ? [fx("immediateAttack", { target: u.id, player: activeSeat(s) })]
          : []),
      );
      break;
    }
    case "chetAttackEffects":
      prepend(
        s,
        fx("fangornOrder", {
          effects: e.effects,
          player: firstPlayer(s),
          text: "Choose the next after-attack effect",
        }),
        fx("chetAttackFinished"),
      );
      break;
    case "chetAttackFinished":
      break; // Keeps the defense phase open until every Forced effect resolves.
    case "chetDiscardAttachments": {
      const options = [
        ...globalUnits(s),
        ...allQuestUnits(s).filter((u) => u.id.startsWith("quest:")),
      ].flatMap((host) =>
        host.attachments
          .filter((a) => attachmentController(s, host, a) === activeSeat(s))
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("discardAttachment", { target: host.id, source: a.id }),
              ...((e.count ?? 1) > 1
                ? [fx("chetDiscardAttachments", { count: e.count! - 1 })]
                : []),
            ],
          })),
      );
      choose(s, "Weight of Responsibility · Discard an attachment", options);
      break;
    }
    case "chetExhaustOrReturn":
      choose(s, "Chetwood Forest · Exhaust a hero or return the attacker", [
        ...s.heroes
          .filter((h) => !h.exhausted && !khazadCannotExhaust(h))
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: `Exhaust ${name(h)}`,
            effects: [fx("exhaust", { target: h.id })],
          })),
        {
          id: "return",
          label: "Return the attacker to staging after this attack",
          effects: [fx("chetReturnAfterAttack")],
        },
      ]);
      break;
    case "chetReturnAfterAttack":
      if (s.combat) s.combat.chetwoodReturnAfterAttack = true;
      break;
    default:
      return false;
  }
  return true;
}
