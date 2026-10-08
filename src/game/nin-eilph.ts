import type { DamageContext } from "./damage-context";
import type { Effect, GameState, Unit } from "./types";
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
  shuffle,
  requireRule,
  enqueue,
} from "./core";
import {
  discardHandCard,
  discardQuestAttachments,
  questDefeated,
  enemyAddedToStaging,
  engage,
  raiseThreat,
  win,
} from "./board";
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
import {
  NIN as N,
  NIN_QUESTS,
  NIN_STAGE_TWO,
  NIN_STAGE_THREE,
  NIN_LOCATIONS,
  ninCurrentQuest,
  ninNoCardEconomy,
} from "./nin-eilph-support";
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const staging = (s: GameState, code: string) =>
  s.staging.some((u) => u.code === code && !u.blanked);
export const ninDweller = (s: GameState) =>
  enemies(s).find((u) => u.code === N.dweller);
export function setupNin(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![N.nalir, N.dweller].includes(c),
  );
  s.ninEilph = {
    initialized: false,
    activeQuest: N.fleeing,
    time: 0,
    setAside: [make(s, N.dweller)],
    setupLocations: [],
  };
}
export function ninOpeningHandsKept(s: GameState) {
  if (!s.ninEilph || s.ninEilph.initialized) return false;
  prepend(s, fx("ninSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function ninStatPenalty(s: GameState, u: Unit) {
  if (
    !staging(s, N.bog) ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return 0;
  return u.attachments.filter(
    (a) => !a.facedown && /\bItem\b/.test(card(a.code).traits ?? ""),
  ).length;
}
export function ninThreatBonus(s: GameState, u: Unit) {
  return (
    (u.code === N.dweller && !u.blanked ? u.resources : 0) +
    (ninCurrentQuest(s) === N.impassable &&
    card(u.code).type_code === "location"
      ? 1
      : 0)
  );
}
export const ninAttackBonus = (u: Unit) =>
  u.code === N.dweller && !u.blanked ? u.resources : 0;
export const ninEngagementModifier = (s: GameState, u: Unit) =>
  ninCurrentQuest(s) === N.creatures && s.staging.some((x) => x.id === u.id)
    ? -20
    : 0;
const economyEvents = new Set([
  "01024",
  "01064",
  "07012",
  "02003",
  "131015",
  "06143",
  "04129",
  "04108",
  "04135",
  "06009",
]);
export const ninPlayProblem = (s: GameState, code?: string) =>
  ninCurrentQuest(s) === N.forgotten && s.used.includes("nin:played")
    ? "A Forgotten Land: each player can play only one card each round."
    : ninNoCardEconomy(s) && code && economyEvents.has(code)
      ? "No End in Sight prevents this card from drawing cards or generating resources."
      : null;
export const ninCommitProblem = (s: GameState) =>
  ninCurrentQuest(s) === N.weary && s.committedIds.length > 0 && !s.hand.length
    ? "A Weary Passage requires a random card from your hand before committing characters."
    : null;
export function advanceNin(s: GameState) {
  const q = s.ninEilph;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.choice ||
    ![2, 3].includes(s.stage)
  )
    return true;
  const target = NIN_QUESTS.find((c) => c.code === q.activeQuest)!.back_quest!;
  if (s.progress >= target) {
    q.advancing = true;
    prepend(
      s,
      fx("ninAdvance", {
        value: s.stage + 1,
        flag: true,
        player: firstPlayer(s),
      }),
    );
  }
  return true;
}
function dwellerToStaging(s: GameState) {
  const q = s.ninEilph!;
  let u = ninDweller(s);
  if (u) {
    if (!s.staging.some((x) => x.id === u!.id)) {
      for (const p of playerOrder(s))
        forOwner(
          s,
          p,
          () => (s.engaged = s.engaged.filter((e) => e.id !== u!.id)),
        );
      s.staging.push(u);
      enemyAddedToStaging(s, u);
    }
  } else {
    u = q.setAside.pop();
    if (!u) {
      const victory = s.victoryCards?.indexOf(N.dweller) ?? -1;
      if (victory >= 0) {
        s.victoryCards!.splice(victory, 1);
        s.victory -= card(N.dweller).victory ?? 0;
      }
      for (const pile of [s.encounterDeck, s.encounterDiscard]) {
        const i = pile.indexOf(N.dweller);
        if (i >= 0) pile.splice(i, 1);
      }
      u = make(s, N.dweller);
    }
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
  u.damage = 0;
  return u;
}
export function ninEnemyDefeated(s: GameState, u: Unit, destruction: boolean) {
  if (s.ninEilph && s.stage === 4 && u.code === N.dweller && destruction)
    win(s);
}
export function ninTimeRemoved(s: GameState): Effect[] {
  if (!s.ninEilph) return [];
  return enemies(s).flatMap((u) => {
    if (u.blanked) return [];
    if (u.code === N.dweller)
      return [
        fx("ninDwellerResource", {
          target: u.id,
          code: u.code,
          player: firstPlayer(s),
        }),
      ];
    if (!allEngaged(s).some((e) => e.id === u.id)) return [];
    const player = ownerOf(s, u);
    if (u.code === N.adder)
      return [fx("immediateAttack", { target: u.id, code: u.code, player })];
    if (u.code === N.neeker)
      return [fx("ninNeekerDamage", { target: u.id, code: u.code, player })];
    return [];
  });
}
export function ninEndRound(s: GameState) {
  const count = s.staging.filter(
    (u) => u.code === N.finger && !u.blanked,
  ).length;
  for (const l of locations(s)) l.progress = Math.max(0, l.progress - count);
}
export function ninExplored(s: GameState, u: Unit) {
  if (s.ninEilph && u.code === N.eyot && !u.blanked)
    prepend(s, fx("ninEyotResponse", { player: firstPlayer(s) }));
}
export function ninTravelProblem(s: GameState, u: Unit) {
  return u.code === N.eyot &&
    !u.blanked &&
    playerOrder(s).some(
      (p) =>
        ![...seatView(s, p).heroes, ...seatView(s, p).allies].some(
          (c) => !c.exhausted,
        ),
    )
    ? "Hidden Eyot requires every player to exhaust a ready character."
    : null;
}
export function ninTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (u.code !== N.eyot || u.blanked) return undefined;
  return playerOrder(s).map((player) =>
    fx("ninExhaust", { player, code: u.code, flag: true }),
  );
}
export function ninEncounter(s: GameState, code: string, replay = false) {
  if (code === N.shifting)
    prepend(s, fx("removeQuestTime", { code, player: firstPlayer(s) }));
  else if (code === N.remnants)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("ninCreatureSearch", { player })),
    );
  else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function ninShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if (code === N.bog) {
    const defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
    for (const id of defenders) {
      const u = get(s, id);
      if (u) {
        c.ninDefensePenalties ??= {};
        c.ninDefensePenalties[u.id] =
          (c.ninDefensePenalties[u.id] ?? 0) + u.attachments.length;
      }
    }
  } else if (code === N.reeds) c.attackBonus += s.ninEilph?.time ?? 0;
  else if (code === N.neeker) {
    const defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
    prepend(
      s,
      ...defenders.flatMap((target) => {
        const defender = get(s, target);
        return defender
          ? [fx("damage", { target, value: 1, player: ownerOf(s, defender) })]
          : [];
      }),
    );
  } else if (code === N.finger) c.ninLoseProgressOnKill = true;
  else if (code === N.shifting) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else return false;
  return true;
}
export function ninCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    s.combat?.ninLoseProgressOnKill &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    s.combat.ninKilledCharacter = true;
}
export function ninPayCommit(s: GameState) {
  if (ninCurrentQuest(s) !== N.weary || !s.committedIds.length) return false;
  requireRule(s.phase === "quest", "Commit during the quest phase.");
  const problem = ninCommitProblem(s);
  requireRule(!problem, problem ?? "");
  const u = s.hand[Math.floor(random(s) * s.hand.length)];
  discardHandCard(s, u.id);
  enqueue(s, fx("ninCommitAfterCost", { player: activeSeat(s) }));
  return true;
}
export function ninAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (s.ninEilph && c.ninLoseProgressOnKill && c.ninKilledCharacter)
    s.progress = 0;
}
export function ninEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("nin")) return false;
  const q = s.ninEilph;
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "ninSetup":
      q.initialized = true;
      forOwner(s, firstPlayer(s), () => s.allies.push(make(s, N.nalir)));
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("ninSetupLocation", { player })),
        fx("ninAdvance", { value: 2, player: firstPlayer(s) }),
      );
      break;
    case "ninSetupLocation": {
      const choices = NIN_LOCATIONS.filter(
        (c) => !q.setupLocations.includes(c) && s.encounterDeck.includes(c),
      );
      choose(
        s,
        "Fleeing from Tharbad · Choose a different location",
        choices.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("ninTakeSetupLocation", { code })],
        })),
      );
      break;
    }
    case "ninTakeSetupLocation": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        q.setupLocations.push(e.code!);
        s.staging.push(make(s, e.code!));
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "ninAdvance": {
      const pending = s.queue.length;
      if (e.flag && questDefeated(s, q.activeQuest)) {
        s.queue.splice(s.queue.length - pending, 0, e);
        break;
      }
      if (!e.flag) discardQuestAttachments(s, q.activeQuest);
      const candidates =
        e.value === 2
          ? NIN_STAGE_TWO
          : e.value === 3
            ? NIN_STAGE_THREE
            : [N.out];
      const remaining = candidates.filter((c) => c !== q.activeQuest);
      q.activeQuest = remaining[Math.floor(random(s) * remaining.length)];
      s.stage = e.value!;
      s.progress = 0;
      s.stageRevealing = true;
      q.advancing = false;
      q.time = 0;
      log(
        s,
        card(q.activeQuest).back_name ?? card(q.activeQuest).name,
        "chapter",
      );
      const effects: Effect[] = [];
      if (s.stage < 4)
        effects.push(
          ...playerOrder(s).map((player) =>
            fx("ninThreat", { player, value: 1 }),
          ),
        );
      if (s.stage >= 3)
        effects.push(
          fx("ninReturnDweller", {
            flag: s.stage === 4,
            player: firstPlayer(s),
          }),
        );
      effects.push(fx("ninStageReady", { player: firstPlayer(s) }));
      prepend(s, ...effects);
      break;
    }
    case "ninThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "ninReturnDweller": {
      const boss = dwellerToStaging(s);
      if (e.flag)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("immediateAttack", { target: boss.id, player }),
          ),
        );
      break;
    }
    case "ninStageReady":
      q.time = s.stage === 4 ? 2 : 3;
      s.stageRevealing = false;
      prepend(
        s,
        ...s.staging
          .filter((u) => u.code === N.reeds && !u.blanked)
          .flatMap((u) =>
            playerOrder(s).map((player) =>
              fx("ninExhaust", { player, code: u.code }),
            ),
          ),
      );
      break;
    case "ninExhaust": {
      const options = characters(s)
        .filter((u) => !u.exhausted)
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("exhaust", { target: u.id })],
        }));
      if (options.length)
        choose(
          s,
          `${card(e.code ?? N.reeds).name} · Exhaust a character`,
          options,
        );
      break;
    }
    case "ninTimeExpired":
      if (e.code !== q.activeQuest || q.time !== 0) break;
      if (s.stage < 4) {
        q.advancing = true;
        prepend(
          s,
          fx("ninAdvance", { value: s.stage, player: firstPlayer(s) }),
        );
      } else {
        const boss = ninDweller(s);
        prepend(
          s,
          ...(boss
            ? playerOrder(s).map((player) =>
                fx("immediateAttack", { target: boss.id, player }),
              )
            : []),
          fx("ninResetTime"),
        );
      }
      break;
    case "ninResetTime":
      q.time = s.stage === 4 ? 2 : 3;
      break;
    case "ninDwellerResource":
      if (u) u.resources++;
      break;
    case "ninNeekerDamage":
      if (u) {
        const options = s.allies.map((a) => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("damage", { target: a.id, value: 2 })],
        }));
        if (options.length)
          choose(s, "Neekerbreekers · Deal 2 damage to an ally", options);
      }
      break;
    case "ninEyotResponse":
      choose(s, "Hidden Eyot · Add 2 time counters?", [
        {
          id: "time",
          label: "Add 2 time counters to the current quest",
          effects: [fx("ninAddTime", { value: 2 })],
        },
        { id: "skip", label: "Continue without adding time", effects: [] },
      ]);
      break;
    case "ninAddTime":
      q.time += e.value ?? 0;
      break;
    case "ninCreatureSearch": {
      const options = ["deck", "discard"].flatMap((source) =>
        [
          ...new Set(
            (source === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (c) =>
                card(c).type_code === "enemy" &&
                /\bCreature\b/.test(card(c).traits ?? ""),
            ),
          ),
        ].map((code) => ({
          id: `${source}:${code}`,
          code,
          label: `${card(code).name} · encounter ${source}`,
          effects: [fx("ninTakeCreature", { code, text: source })],
        })),
      );
      if (options.length)
        choose(s, "Remnants of Elder Days · Choose a Creature", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "ninTakeCreature": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) {
        pile.splice(i, 1);
        const enemy = make(s, e.code!);
        s.staging.push(enemy);
        engage(s, enemy);
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}
