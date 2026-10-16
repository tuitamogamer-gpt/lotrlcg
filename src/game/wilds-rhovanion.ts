import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  make,
  prepend,
  removeShadowCard,
  restrictAttachments,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  engage,
} from "./board";
import { isAlly } from "./card-types";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  WILDS_RHOVANION as W,
  WILDS_RHOVANION_RECIPES,
  WILDS_RHOVANION_IDS,
  WILDS_KINGS_QUESTS,
  wildsRhovanionStageInfo,
} from "./wilds-rhovanion-support";
import {
  wildsLive,
  wildsAnduin,
  wildsKings,
  wildsMirkwood,
  wildsEnemies,
  wildsLocations,
  wildsOwn,
  wildsTrait,
  wildsObjective,
  wildsDark,
  wildsQuestLive,
  wildsAdd,
  wildsShuffleDiscard,
  wildsDiscardUntil,
  wildsEvil,
  wildsGuard,
  wildsGuarded,
  wildsNoReady,
} from "./wilds-rhovanion-helpers";
import { playTargets } from "./actions";
import * as Anduin from "./wilds-anduin";
import * as Kings from "./wilds-kingsquest";
import * as Mirkwood from "./wilds-mirkwood";
export * from "./wilds-rhovanion-support";
type Combat = NonNullable<GameState["combat"]> & {
  wildsBlankShadow?: boolean;
  wildsDiscardAlly?: boolean;
  wildsCannotReady?: boolean;
  wildsGuardDefense?: number;
};
const attachmentLive = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && !a.blanked && !a.facedown);
const maxCharacters = (s: GameState) =>
  Math.max(0, ...playerOrder(s).map((p) => wildsOwn(s, p).length));
const phaseMatches = (s: GameState, m: { round: number; phase: string }) =>
  m.round === s.round && m.phase === s.phase;
export function setupWildsRhovanion(s: GameState) {
  if (!WILDS_RHOVANION_IDS.includes(s.scenarioId)) return;
  const prefix =
    s.scenarioId === "journey-up-the-anduin"
      ? "08.1"
      : s.scenarioId === "lost-in-mirkwood"
        ? "08.2"
        : "08.3";
  const recipe = WILDS_RHOVANION_RECIPES.find(
    (r) => r.id === (s.easyMode ? "E" : "Q") + prefix,
  )!;
  const codes = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = codes("sharedEncounterDeck");
  s.wildsRhovanion = {
    initialized: false,
    advancing: false,
    currentQuest: "",
    questDeck: [],
    completedQuests: [],
    setAside: codes("sharedSetAside").map((code) => make(s, code)),
    evilDeck: [],
    evilDiscard: [],
    cavesDeck: [],
    storedCards: [],
    guardedHeroes: [],
    guardedPlayerCards: [],
    pendingGuarded: [],
    resolving: [],
    removed: [],
    noReady: [],
    locationProgress: [],
    questResources: 0,
    firstTraitRevealedRound: 0,
    vastness: [],
    darkPlaces: [],
    noDamage: [],
    usedResponses: [],
  };
  if (s.scenarioId === "journey-up-the-anduin") {
    Anduin.wildsAnduinSetup(s);
    s.wildsRhovanion.evilDeck = shuffle(s, codes("sharedEncounterDeck2"));
  } else if (s.scenarioId === "the-kings-quest") {
    s.wildsRhovanion.currentQuest = W.iron;
    s.wildsRhovanion.questDeck = WILDS_KINGS_QUESTS.slice(1);
    s.wildsRhovanion.cavesDeck = shuffle(
      s,
      codes("sharedEncounterDeck2").map((code) => make(s, code)),
    );
  } else Mirkwood.wildsMirkwoodSetup(s, recipe);
  s.encounterDeck = shuffle(s, s.encounterDeck);
}
export function wildsRhovanionOpeningHandsKept(s: GameState) {
  if (!s.wildsRhovanion || s.wildsRhovanion.initialized) return false;
  prepend(
    s,
    fx(
      wildsAnduin(s)
        ? "wildsAnduinSetup"
        : wildsKings(s)
          ? "wildsKingsSetup"
          : "wildsMirkwoodSetup",
      { player: firstPlayer(s) },
    ),
    fx("nextRound"),
  );
  return true;
}
export function wildsRhovanionCheck(s: GameState) {
  if (!wildsLive(s) || s.status !== "playing") return;
  Anduin.wildsAnduinCheck(s);
  Mirkwood.wildsMirkwoodCheck(s);
}
export const wildsRhovanionAdvance = (s: GameState) =>
  Anduin.wildsAnduinAdvance(s) ||
  Kings.wildsKingsAdvance(s) ||
  Mirkwood.wildsMirkwoodAdvance(s);
export function wildsRhovanionStats(s: GameState, u: Unit) {
  let attack = 0,
    defense = 0;
  if (!wildsLive(s)) return { attack, defense };
  const frenzy = u.attachments.filter(
    (a) => a.code === W.frenzied && !a.blanked && !a.facedown,
  ).length;
  attack += frenzy;
  defense += frenzy;
  if (u.id === s.wildsRhovanion!.nemesisId) {
    attack += 2;
    defense += 2;
  }
  if (!u.blanked && u.code === W.werewolf) attack += u.damage;
  if (!u.blanked && u.code === W.drake) defense += playerOrder(s).length + 1;
  if (wildsTrait(u, "Goblin") && allEngaged(s).some((e) => e.id === u.id)) {
    const n = allEngaged(s).filter(
      (e) =>
        e.id !== u.id &&
        e.code === W.troop &&
        !e.blanked &&
        ownerOf(s, e) === ownerOf(s, u),
    ).length;
    attack += n;
    defense += n;
  }
  if (!u.blanked && u.code === W.hobgoblin) {
    const guarded = s.wildsRhovanion!.guardedPlayerCards.find(
      (c) => c.guardId === u.id,
    );
    const n = guarded ? Number(card(guarded.card.code).cost) || 0 : 0;
    attack += n;
    defense += n;
  }
  const c = s.combat as Combat | null;
  if (c?.enemyId === u.id) defense += c.wildsGuardDefense ?? 0;
  return { attack, defense };
}
export function wildsRhovanionThreatBonus(s: GameState, u: Unit) {
  if (!wildsLive(s)) return 0;
  const q = s.wildsRhovanion!;
  let n = u.attachments.filter(
    (a) => a.code === W.frenzied && !a.blanked && !a.facedown,
  ).length;
  if (u.id === q.nemesisId) n += 2;
  if (!u.blanked && (u.code === W.hills || u.code === W.lake))
    n += maxCharacters(s);
  if (!u.blanked && u.code === W.lonely)
    n +=
      2 *
      q.storedCards
        .filter((c) => c.locationId === u.id)
        .reduce((n, c) => n + c.cards.length, 0);
  if (!u.blanked && u.code === W.twilight) n += 2 * u.resources;
  if (!u.blanked && u.code === W.contested)
    n += (s.victoryCards ?? []).filter(
      (c) => card(c).type_code === "location",
    ).length;
  if (!u.blanked && u.code === W.drake) n += playerOrder(s).length + 1;
  if (!u.blanked && u.code === W.hobgoblin) {
    const g = q.guardedPlayerCards.find((g) => g.guardId === u.id);
    if (g) n += Number(card(g.card.code).cost) || 0;
  }
  if (
    card(u.code).type_code === "location" &&
    !wildsObjective(u) &&
    s.staging.some((l) => l.id === u.id)
  )
    n += q.vastness
      .filter((m) => phaseMatches(s, m))
      .reduce((n, m) => n + m.amount * (u.progress > 0 ? 2 : 1), 0);
  return n;
}
export const wildsRhovanionStagingThreat = (s: GameState) =>
  s.wildsRhovanion?.darkPlaces
    .filter((m) => phaseMatches(s, m))
    .reduce((n, m) => n + m.amount, 0) ?? 0;
export function wildsRhovanionLocationQuestBonus(s: GameState, u: Unit) {
  if (!wildsLive(s)) return 0;
  let n = u.blanked
    ? 0
    : [W.hills, W.lake].includes(u.code)
      ? maxCharacters(s)
      : u.code === W.ford
        ? 5 * wildsEnemies(s).length
        : 0;
  if (wildsQuestLive(s, W.trulyLost))
    n += s
      .wildsRhovanion!.storedCards.filter((c) => c.locationId === u.id)
      .reduce((n, c) => n + c.cards.length, 0);
  return n;
}
const capped = (s: GameState, u: Unit) =>
  s.staging.some((l) => l.id === u.id) &&
  ((wildsAnduin(s) && s.stage === 2) ||
    (wildsTrait(u, "Forest") &&
      s.staging.some((l) => l.code === W.darkWoods && !l.blanked)));
export function wildsRhovanionLocationProgressAmount(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (!wildsLive(s)) return amount;
  if (
    wildsKings(s) &&
    s.staging.some((l) => l.id === u.id) &&
    wildsTrait(u, "Dark") &&
    s.staging.some((l) => l.code === W.tunnel && !l.blanked)
  )
    return 0;
  if (!capped(s, u)) return amount;
  const q = s.wildsRhovanion!,
    m = q.locationProgress.find((m) => m.id === u.id && m.round === s.round);
  const placed = Math.min(amount, Math.max(0, 1 - (m?.amount ?? 0)));
  if (placed > 0) {
    if (m) m.amount += placed;
    else q.locationProgress.push({ id: u.id, round: s.round, amount: placed });
  }
  return placed;
}
export function wildsRhovanionProgress(
  s: GameState,
  amount: number,
  quest: Unit,
) {
  return Mirkwood.wildsMirkwoodProgress(s, amount, quest);
}
export function wildsRhovanionQuestProgressPlaced(
  s: GameState,
  quest: Unit,
  _amount: number,
) {
  if (quest.code !== s.wildsRhovanion?.currentQuest)
    return; /* Printed successful-quest responses are dispatched by questSucceeded. */
}
export function wildsRhovanionQuestSucceeded(s: GameState, amount: number) {
  Anduin.wildsAnduinQuestProgressPlaced(s, amount);
  Kings.wildsKingsQuestProgressPlaced(s, amount);
}
export function wildsRhovanionBeginQuest(s: GameState) {
  Anduin.wildsAnduinBeginQuest(s);
  Kings.wildsKingsBeginQuest(s);
}
export function wildsRhovanionCommitted(s: GameState) {
  if (
    wildsKings(s) &&
    s.activeLocation?.code === W.grotto &&
    !s.activeLocation.blanked
  )
    prepend(s, fx("wildsRhovanionGrotto", { player: firstPlayer(s) }));
}
export const wildsRhovanionBeginEncounter = (s: GameState) =>
  Anduin.wildsAnduinBeginEncounter(s);
export const wildsRhovanionEndEncounter = (s: GameState): Effect[] =>
  Mirkwood.wildsMirkwoodEndEncounter(s);
export function wildsRhovanionRoundEnd(s: GameState): Effect[] {
  return Mirkwood.wildsMirkwoodRoundEnd(s);
}
export const wildsRhovanionCannotReady = (s: GameState, u: Unit) =>
  !!s.wildsRhovanion?.noReady.some((m) => m.id === u.id && m.round === s.round);
export const wildsRhovanionCharacterBlanked = (s: GameState, u: Unit) =>
  wildsLive(s) && wildsDark(s) && attachmentLive(u, W.afraid);
export const wildsRhovanionWillpowerOverride = (s: GameState, u: Unit) =>
  wildsRhovanionCharacterBlanked(s, u) ? 0 : undefined;
export const wildsRhovanionCannotCancel = (s: GameState, shadow = false) =>
  wildsLive(s) &&
  !shadow &&
  s.staging.some((u) => u.code === W.accursed && !u.blanked);
export const wildsRhovanionCannotReduceThreat = (s: GameState) =>
  wildsQuestLive(s, W.ambushed);
export const wildsRhovanionCannotEngage = (s: GameState, u: Unit) =>
  wildsKings(s) && s.stage === 2 && u.code === W.drake;
export const wildsRhovanionCannotLeave = (s: GameState, u: Unit) =>
  wildsRhovanionCannotEngage(s, u);
export const wildsRhovanionCannotOptionallyEngage = (s: GameState, u: Unit) =>
  wildsLive(s) && !u.blanked && u.code === W.stray;
export const wildsRhovanionDoesNotExhaustToQuest = (s: GameState, u: Unit) =>
  wildsLive(s) && u.code === W.haldan && !!s.activeLocation && !u.blanked;
export function wildsRhovanionImmune(s: GameState, u: Unit) {
  if (!wildsLive(s)) return false;
  if (attachmentLive(u, W.frenzied) || u.id === s.wildsRhovanion!.nemesisId)
    return true;
  return (
    wildsMirkwood(s) &&
    s.staging.some((o) => o.code === W.searching && !o.blanked) &&
    (wildsObjective(u) ||
      [...(u.guarding ? [u.guarding] : []), ...(u.cobasGuarding ?? [])].some(
        (id) => s.staging.some((o) => o.id === id && wildsObjective(o)),
      ))
  );
}
export function wildsRhovanionCannotAttach(
  s: GameState,
  u: Unit,
  code?: string,
) {
  if (!wildsLive(s) || u.blanked) return false;
  if (u.code === W.troop) return true;
  if (u.code === W.troll)
    return (
      !code ||
      ["hero", "ally", "attachment", "event", "player-side-quest"].includes(
        card(code).type_code,
      )
    );
  if (u.code === W.drake) return !code || !wildsTrait(code, "Dragon");
  return false;
}
export function wildsRhovanionDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!wildsLive(s) || amount <= 0) return amount;
  if (
    s.wildsRhovanion!.noDamage.some((m) => m.id === u.id && phaseMatches(s, m))
  )
    return 0;
  if (u.code === W.blackBats && !u.blanked && wildsDark(s)) return 0;
  if (
    u.code === W.drake &&
    ((wildsKings(s) && s.stage === 2) ||
      wildsLocations(s).some((l) => l.code === W.hoard && !l.blanked))
  )
    return 0;
  if (u.id === s.wildsRhovanion!.nemesisId && s.progress < 8) return 0;
  if (
    wildsQuestLive(s, W.carried) &&
    s.wildsRhovanion!.guardedHeroes.some((h) => h.guardId === u.id) &&
    !context.combatDamage
  )
    return 0;
  const scales = u.attachments.find((a) => a.code === W.scales && !a.blanked);
  if (scales) {
    discardAttachment(s, u, scales, true);
    return 0;
  }
  return amount;
}
export function wildsRhovanionDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (
    !wildsLive(s) ||
    amount <= 0 ||
    !context.combatDamage ||
    !context.enemyId ||
    !allCharacters(s).some((c) => c.id === u.id)
  )
    return;
  const enemy = get(s, context.enemyId);
  if (!enemy || enemy.blanked) return;
  if (
    enemy.code === W.giantSpider ||
    (wildsQuestLive(s, W.spiders) && wildsTrait(enemy, "Spider"))
  )
    wildsNoReady(s, u.id);
  if (enemy.code === W.troll && u.damage > stats(s, u).health)
    prepend(
      s,
      fx("wildsRhovanionDiscardHand", {
        player: ownerOf(s, u),
        value: u.damage - stats(s, u).health,
      }),
    );
  if (wildsQuestLive(s, W.orcs) && wildsTrait(enemy, "Orc"))
    prepend(
      s,
      fx("wildsRhovanionDiscardHand", { player: ownerOf(s, u), value: 1 }),
    );
}
export function wildsRhovanionEngaged(s: GameState, u: Unit) {
  if (!wildsLive(s)) return;
  const p = ownerOf(s, u);
  const effects: Effect[] = [];
  if (wildsQuestLive(s, W.ambushed))
    effects.push(fx("threat", { player: p, value: 1 }));
  if (u.code === W.spider && !u.blanked)
    effects.push(fx("immediateAttack", { target: u.id, player: p }));
  for (const stray of s.staging.filter(
    (e) => e.code === W.stray && !e.blanked && e.id !== u.id,
  ))
    effects.push(
      fx("wildsRhovanionStrayEngage", { target: stray.id, player: p }),
    );
  prepend(s, ...effects);
}
export function wildsRhovanionEnemyAttackStarted(
  s: GameState,
  u: Unit,
  player: number,
) {
  if (!wildsLive(s) || u.blanked) return;
  for (const breath of u.attachments.filter(
    (a) => a.code === W.breath && !a.blanked,
  ))
    prepend(
      s,
      ...wildsOwn(s, player).map((c) =>
        fx("damage", { target: c.id, value: 1, player }),
      ),
      fx("discardAttachment", { target: u.id, source: breath.id, player }),
    );
}
export function wildsRhovanionShadowResolved(
  s: GameState,
  u: Unit,
  code: string,
) {
  if (!wildsLive(s) || u.blanked || !s.combat || card(code).shadow) return;
  const c = s.combat as Combat;
  if (u.code === W.wargs) c.wildsBlankShadow = true;
  if (u.code === W.werewolf)
    prepend(
      s,
      fx("damage", { target: u.id, value: 1 }),
      ...(c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).map((target) =>
        fx("damage", { target, value: 1 }),
      ),
    );
}
export function wildsRhovanionFinishShadows(_s: GameState, _u: Unit) {
  return false;
}
export function wildsRhovanionAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!wildsLive(s) || skipped) return [];
  const c = combat as Combat,
    u = get(s, c.enemyId),
    p = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  if (u && c.wildsBlankShadow && !u.blanked && u.code === W.wargs)
    effects.push(
      fx("immediateAttack", {
        target: u.id,
        player: p,
        text: "desert-no-shadow",
      }),
    );
  if (
    c.wildsDiscardAlly &&
    (c.damageDealt ?? 0) > 0 &&
    c.defenderId &&
    !get(s, c.defenderId)
  )
    effects.push(fx("wildsRhovanionDiscardAlly", { player: p }));

  return effects;
}
export const wildsRhovanionAttackDeclared = (
  s: GameState,
  u: Unit,
  ids: string[],
) => Kings.wildsKingsAttackDeclared(s, u, ids);
export function wildsRhovanionHostLeaves(
  s: GameState,
  u: Unit,
  defeated = true,
) {
  if (!wildsLive(s)) return;
  const q = s.wildsRhovanion!;
  Mirkwood.wildsMirkwoodHostLeaves(s, u, defeated);
  Kings.wildsKingsEnemyLeaves(s, u, defeated);
  for (const g of q.guardedPlayerCards.filter((g) => g.guardId === u.id)) {
    if (u.code === W.hoard) {
      g.guardId = "";
      prepend(
        s,
        fx("wildsRhovanionArtifactClaim", {
          source: g.card.id,
          player: g.player,
        }),
      );
    } else
      forOwner(s, g.player, () => {
        s.hand.push(g.card);
      });
  }
  q.guardedPlayerCards = q.guardedPlayerCards.filter((g) => g.guardId !== u.id);
  if (q.haldanGuardId === u.id) delete q.haldanGuardId;
}
export const wildsRhovanionEnemyDestination = (s: GameState, u: Unit) =>
  Anduin.wildsAnduinEnemyDestination(s, u);
export function wildsRhovanionCharacterLeft(s: GameState, u: Unit) {
  if (wildsLive(s) && u.code === W.haldan) {
    s.status = "lost";
    s.reason = "Haldan has left play.";
  }
}
export function wildsRhovanionExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  if (!wildsLive(s)) return;
  Anduin.wildsAnduinExplored(s, u);
  Kings.wildsKingsExplored(s, u, wasActive);
  Mirkwood.wildsMirkwoodExplored(s, u);
  if (wildsTrait(u, "Forest"))
    for (const l of wildsLocations(s).filter(
      (l) => l.code === W.twilight && !l.blanked,
    ))
      l.resources++;
}
export function wildsRhovanionTravelProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (!wildsLive(s)) return null;
  if (wildsObjective(u) && wildsGuarded(s, u))
    return "A guarded objective-location cannot be travelled to.";
  if (u.code === W.twilight && !u.blanked && u.resources === 0)
    return "Twilight Hall needs at least 1 resource before the players can travel there.";
  return (
    Anduin.wildsAnduinTravelProblem(s, u) ??
    Kings.wildsKingsTravelProblem(s, u) ??
    null
  );
}
export function wildsRhovanionTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!wildsLive(s) || u.blanked) return;
  const kings = Kings.wildsKingsTravelEffects(s, u);
  if (kings) return kings;
  if (u.code === W.accursed) return [fx("reveal", { player: firstPlayer(s) })];
  if (u.code === W.twilight)
    return playerOrder(s).map((player) =>
      fx("threat", { player, value: u.resources }),
    );
  if (u.code === W.darkWoods)
    return playerOrder(s).map((player) =>
      fx("wildsRhovanionDiscardAdd", { player, text: "enemy" }),
    );
  if (wildsObjective(u))
    return [
      fx("wildsRhovanionShuffle"),
      ...playerOrder(s).map((player) =>
        fx("wildsRhovanionObjectiveTravel", { player, code: u.code }),
      ),
    ];
}
export function wildsRhovanionTravelEntered(
  s: GameState,
  u: Unit,
  actual = true,
) {
  Anduin.wildsAnduinTravelEntered(s, u, actual);
  Kings.wildsKingsTravelEntered(s, u, actual);
  Mirkwood.wildsMirkwoodTravelEntered(s, u, actual);
}
export const wildsRhovanionMustTravel = (s: GameState) =>
  Kings.wildsKingsMustTravel(s);
export function wildsRhovanionAllyEntered(s: GameState, u: Unit) {
  if (
    wildsKings(s) &&
    wildsLocations(s).some((l) => l.code === W.lake && !l.blanked)
  )
    u.exhausted = true;
  return false;
}
export function wildsRhovanionPlayerCardPlayed(s: GameState, _u: Unit) {
  if (!wildsLive(s)) return;
  const player = activeSeat(s);
  if (seatView(s, player).hand.some((c) => c.code === W.lostWild))
    prepend(s, fx("wildsRhovanionDiscardWholeHand", { player }));
}
export function wildsRhovanionEventPlayed(s: GameState, u: Unit) {
  if (!wildsLive(s) || s.phase !== "quest") return;
  const lands = s.staging.filter((l) => l.code === W.lonely && !l.blanked);
  if (!lands.length) return;
  prepend(
    s,
    fx("wildsRhovanionCaptureEvent", {
      source: u.id,
      code: u.code,
      player: activeSeat(s),
    }),
  );
}
export function wildsRhovanionCharacterReadied(s: GameState, u: Unit) {
  if (wildsLive(s) && attachmentLive(u, W.weighed))
    prepend(
      s,
      fx("wildsRhovanionWeighedDiscard", {
        target: u.id,
        player: ownerOf(s, u),
      }),
    );
}
export function wildsRhovanionRevealSurge(s: GameState, code: string) {
  if (!wildsLive(s)) return false;
  if (code === W.crossing)
    return !s.activeLocation || threatOf(s, s.activeLocation) < 3;
  if (code === W.vastness)
    return (
      s.staging.filter(
        (l) => card(l.code).type_code === "location" && !wildsObjective(l),
      ).length < playerOrder(s).length
    );
  if (code === W.swarm) return allHeroes(s).every((h) => h.resources === 0);
  if (code === W.denizen)
    return !s.staging.some((e) => card(e.code).type_code === "enemy");
  return Mirkwood.wildsMirkwoodRevealSurge(s, code);
}
export function wildsRhovanionCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  if (!wildsLive(s)) return;
  if (wildsObjective(u) && !cancelled)
    wildsGuard(
      s,
      u,
      [W.path, W.abandoned].includes(u.code) ? "location" : "enemy",
    );
  if (u.code === W.hobgoblin && !u.blanked)
    prepend(
      s,
      fx("wildsRhovanionHobgoblin", { target: u.id, player: firstPlayer(s) }),
    );
  Mirkwood.wildsMirkwoodCardEntered(s, u, fromReveal, cancelled);
}
const treacheries = [
  W.frenzied,
  W.crossing,
  W.supplies,
  W.lostWild,
  W.weighed,
  W.unseen,
  W.vastness,
  W.gloom,
  W.swarm,
  W.denizen,
  W.afraid,
  W.eyes,
  W.darkPlaces,
  W.breath,
  W.scales,
];
export function wildsRhovanionEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!wildsLive(s) || !treacheries.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (!replay) s.wildsRhovanion!.resolving.push(code);
  else {
    const i = s.encounterDiscard.indexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
    s.wildsRhovanion!.resolving.push(code);
  }
  prepend(s, fx("wildsRhovanionTreachery", { code, player: firstPlayer(s) }));
  return true;
}
export function wildsRhovanionShadow(s: GameState, code: string) {
  const c = s.combat as Combat | null;
  if (!wildsLive(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []),
    defender = defenders[0] ? get(s, defenders[0]) : undefined;
  if (code === W.crossing)
    c.attackBonus += defender && defender.damage > 0 ? 2 : 1;
  else if (code === W.troop) c.attackBonus += 2;
  else if (code === W.stray) {
    const enemy = get(s, c.enemyId);
    const i = enemy?.shadows
      .slice(0, enemy.revealedShadowCount ?? 0)
      .lastIndexOf(code);
    if (enemy && i !== undefined && i >= 0) {
      removeShadowCard(enemy, i);
      wildsAdd(s, code);
    }
  } else if (code === W.wargs) c.returnToStaging = true;
  else if (code === W.riverbank || code === W.werewolf)
    prepend(
      s,
      ...defenders.map((target) => fx("damage", { target, value: 1, player })),
    );
  else if (code === W.frenzied) {
    const enemy = get(s, c.enemyId);
    const i = enemy?.shadows
      .slice(0, enemy.revealedShadowCount ?? 0)
      .lastIndexOf(code);
    if (enemy && i !== undefined && i >= 0) {
      removeShadowCard(enemy, i);
      const a = make(s, code);
      enemy.attachments.push({ id: a.id, code, exhausted: false });
    }
  } else if (code === W.supplies)
    prepend(
      s,
      fx("threat", { player, value: seatView(s, player).engaged.length }),
    );
  else if (code === W.unseen) {
    const enemy = get(s, c.enemyId);
    if (
      enemy &&
      (!!enemy.guarding ||
        s.wildsRhovanion!.guardedHeroes.some((h) => h.guardId === enemy.id) ||
        s.wildsRhovanion!.guardedPlayerCards.some(
          (g) => g.guardId === enemy.id,
        ))
    ) {
      enemy.tempAttack = (enemy.tempAttack ?? 0) + 2;
      enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
    }
  } else if ([W.patrol, W.giantSpider].includes(code))
    for (const id of defenders) wildsNoReady(s, id);
  else if ([W.spider, W.denizen].includes(code))
    c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === W.gloom) {
    c.attackBonus++;
    c.wildsDiscardAlly = true;
  } else if (code === W.swarm)
    c.attackBonus += defender && defender.attachments.length > 0 ? 2 : 1;
  else if (code === W.troll)
    prepend(s, fx("wildsRhovanionDiscardAttachment", { player }));
  else if (code === W.blackBats) {
    if (wildsDark(s))
      s.wildsRhovanion!.noDamage.push({
        id: c.enemyId,
        round: s.round,
        phase: s.phase,
      });
  } else if (code === W.darkPlaces) c.attackBonus++;
  else if (code === W.eyes) {
    if (!defenders.length)
      prepend(s, fx("wildsRhovanionDiscardAlly", { player }));
  } else return false;
  return true;
}
function consume(s: GameState, code: string, discard = true) {
  const q = s.wildsRhovanion!,
    i = q.resolving.indexOf(code);
  if (i < 0) return false;
  q.resolving.splice(i, 1);
  if (discard) s.encounterDiscard.push(code);
  return true;
}
function condition(s: GameState, u: Unit, code: string) {
  if (!consume(s, code, false)) return;
  const a = make(s, code);
  u.attachments.push({ id: a.id, code, exhausted: false });
}
function discardWholeHand(s: GameState, player: number) {
  forOwner(s, player, () => {
    for (const u of [...s.hand]) {
      if (u.code === W.lostWild) {
        s.hand = s.hand.filter((c) => c.id !== u.id);
        s.encounterDiscard.push(u.code);
      } else discardHandCard(s, u.id);
    }
  });
}
function characterOptions(
  s: GameState,
  p: number,
  e: Effect,
  predicate = (_u: Unit) => true,
) {
  return wildsOwn(s, p)
    .filter(predicate)
    .map((u) => ({
      id: u.id,
      code: u.code,
      label: name(u),
      effects: [{ ...e, target: u.id, player: p }],
    }));
}
export const wildsRhovanionSharedEffect = (e: Effect) =>
  /^(wildsRhovanion|wildsAnduin|wildsKings|wildsMirkwood)/.test(e.kind) &&
  ![
    "wildsRhovanionAssignDamage",
    "wildsRhovanionDamageNext",
    "wildsRhovanionDiscardHand",
    "wildsRhovanionDiscardAlly",
    "wildsRhovanionDiscardAttachment",
    "wildsRhovanionDiscardWholeHand",
    "wildsRhovanionUnseen",
    "wildsRhovanionEyes",
  ].includes(e.kind);
export function wildsRhovanionEffect(s: GameState, e: Effect) {
  if (
    Anduin.wildsAnduinEffect(s, e) ||
    Kings.wildsKingsEffect(s, e) ||
    Mirkwood.wildsMirkwoodEffect(s, e)
  )
    return true;
  if (!e.kind.startsWith("wildsRhovanion")) return false;
  const q = s.wildsRhovanion;
  if (!q) return true;
  const player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "wildsRhovanionArtifactClaim": {
      const g = q.guardedPlayerCards.find((g) => g.card.id === e.source);
      if (!g) break;
      const targets = playTargets(s, g.card, { putIntoPlay: true });
      if (targets.length)
        choose(
          s,
          `${card(g.card.code).name} · Attach the freed Artifact`,
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("wildsRhovanionArtifactAttach", {
                source: g.card.id,
                target: u.id,
                player: g.player,
              }),
            ],
          })),
        );
      else {
        q.guardedPlayerCards = q.guardedPlayerCards.filter((v) => v !== g);
        forOwner(s, g.player, () => s.discard.push(g.card.code));
      }
      break;
    }
    case "wildsRhovanionArtifactAttach": {
      const g = q.guardedPlayerCards.find((g) => g.card.id === e.source);
      if (g && u) {
        q.guardedPlayerCards = q.guardedPlayerCards.filter((v) => v !== g);
        u.attachments.push({
          id: g.card.id,
          code: g.card.code,
          exhausted: false,
          owner: g.card.owner ?? g.player,
          controller: g.player,
        });
        restrictAttachments(s, u);
      }
      break;
    }
    case "wildsRhovanionHills": {
      if (u && s.phase === "quest" && player === firstPlayer(s)) {
        const opts = characterOptions(
          s,
          player,
          fx("wildsRhovanionHillsPay", { source: u.id }),
          (c) => !c.exhausted,
        );
        if (opts.length)
          choose(s, "Hills of Wilderland · Exhaust a character", opts);
      }
      break;
    }
    case "wildsRhovanionHillsPay":
      if (u) {
        prepend(
          s,
          fx("exhaust", { target: u.id, player }),
          fx("wildsRhovanionHillsReduce", { target: e.source, player }),
        );
      }
      break;
    case "wildsRhovanionHillsReduce":
      if (u) u.tempThreat = (u.tempThreat ?? 0) - 1;
      break;
    case "wildsRhovanionGuard": {
      const objective = get(s, e.target);
      if (!objective) break;
      const code = wildsDiscardUntil(
        s,
        (c) => card(c).type_code === e.text,
        true,
      );
      q.pendingGuarded = q.pendingGuarded.filter((id) => id !== objective.id);
      if (code) {
        const guard = wildsAdd(s, code);
        guard.guarding = objective.id;
      }
      break;
    }
    case "wildsRhovanionTreachery": {
      const code = e.code!;
      if (code === W.frenzied) {
        const enemy = wildsEvil(s);
        if (enemy) condition(s, enemy, code);
        else consume(s, code);
      } else if (code === W.crossing) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wildsRhovanionAssignDamage", {
              player,
              value: s.activeLocation ? threatOf(s, s.activeLocation) : 0,
            }),
          ),
        );
      } else if (code === W.supplies) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wildsRhovanionSupplies", { player }),
          ),
        );
      } else if (code === W.lostWild) {
        const players = playerOrder(s).filter(
          (p) => !seatView(s, p).hand.some((c) => c.code === code),
        );
        const max = Math.max(
          -1,
          ...players.map((p) => seatView(s, p).hand.length),
        );
        const targets = players.filter(
          (p) => seatView(s, p).hand.length === max,
        );
        if (targets.length)
          choose(
            s,
            "Lost in the Wild · Choose the player with the most cards",
            targets.map((p) => ({
              id: String(p),
              label: `Player ${p + 1} · ${max} cards`,
              effects: [fx("wildsRhovanionLostHand", { player: p, code })],
            })),
          );
        else consume(s, code);
      } else if (code === W.weighed) {
        const heroes = allHeroes(s).filter(
            (u) => !u.attachments.some((a) => a.code === code),
          ),
          max = Math.max(-1, ...heroes.map((u) => u.attachments.length)),
          targets = heroes.filter((u) => u.attachments.length === max);
        if (targets.length)
          choose(
            s,
            "Weighed Down · Choose a hero with the most attachments",
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("wildsRhovanionCondition", { target: u.id, code }),
                fx("exhaust", { target: u.id, player: ownerOf(s, u) }),
              ],
            })),
          );
        else consume(s, code);
      } else if (code === W.unseen) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wildsRhovanionUnseen", { player }),
          ),
        );
      } else if (code === W.vastness) {
        consume(s, code);
        q.vastness.push({ round: s.round, phase: s.phase, amount: 1 });
      } else if (code === W.gloom) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wildsRhovanionGloom", { player }),
          ),
        );
      } else if (code === W.swarm) {
        consume(s, code);
        for (const player of playerOrder(s)) {
          const heroes = seatView(s, player).heroes,
            n = heroes.reduce((n, h) => n + h.resources, 0);
          for (const h of heroes) h.resources = 0;
          if (n) prepend(s, fx("threat", { player, value: n }));
        }
      } else if (code === W.denizen) {
        consume(s, code);
        const enemies = s.staging.filter(
            (u) => card(u.code).type_code === "enemy",
          ),
          max = Math.max(-1, ...enemies.map((u) => stats(s, u).attack)),
          targets = enemies.filter((u) => stats(s, u).attack === max);
        if (targets.length)
          choose(
            s,
            "Denizen of the Deep · Highest attack enemy",
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
              ],
            })),
          );
      } else if (code === W.afraid) {
        const targets = allHeroes(s).filter(
          (u) => u.committed && !u.attachments.some((a) => a.code === code),
        );
        if (targets.length)
          choose(
            s,
            "Afraid of the Dark · Attach to a questing hero",
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("wildsRhovanionCondition", { target: u.id, code }),
                fx("wildsRhovanionRemoveQuest", { target: u.id }),
              ],
            })),
          );
        else consume(s, code);
      } else if (code === W.eyes) {
        consume(s, code);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wildsRhovanionEyes", { player }),
          ),
        );
      } else if (code === W.darkPlaces) {
        consume(s, code);
        if (s.activeLocation)
          q.darkPlaces.push({
            round: s.round,
            phase: s.phase,
            amount: threatOf(s, s.activeLocation),
          });
        else {
          const found = wildsDiscardUntil(
            s,
            (c) => card(c).type_code === "location",
          );
          if (found) wildsAdd(s, found);
        }
      } else if (code === W.breath || code === W.scales) {
        const targets = wildsEnemies(s).filter(
          (u) =>
            wildsTrait(u, "Dragon") &&
            !u.attachments.some((a) => a.code === code),
        );
        if (targets.length)
          choose(
            s,
            `${card(code).name} · Attach to a Dragon`,
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [fx("wildsRhovanionCondition", { target: u.id, code })],
            })),
          );
        else consume(s, code);
      }
      break;
    }
    case "wildsRhovanionCondition":
      if (u) condition(s, u, e.code!);
      else consume(s, e.code!);
      break;
    case "wildsRhovanionLostHand":
      if (consume(s, e.code!, false))
        forOwner(s, player, () => {
          s.hand.push(make(s, e.code!));
        });
      break;
    case "wildsRhovanionRemoveQuest":
      if (u) {
        u.committed = false;
        forOwner(s, ownerOf(s, u), () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
      }
      break;
    case "wildsRhovanionAssignDamage": {
      const remaining = e.value ?? 0;
      if (remaining <= 0) break;
      const targets = wildsOwn(s, player).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (targets.length)
        choose(
          s,
          `Assign ${remaining} damage among your characters`,
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Deal 1 damage to ${name(u)}`,
            effects: [
              fx("damage", { target: u.id, value: 1, player }),
              fx("wildsRhovanionAssignDamage", {
                player,
                value: remaining - 1,
              }),
            ],
          })),
        );
      break;
    }
    case "wildsRhovanionSupplies": {
      const allies = wildsOwn(s, player).filter(isAlly);
      choose(s, "Ruined Supplies · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${allies.length}`,
          effects: [fx("threat", { player, value: allies.length })],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each ally you control",
          effects: allies.map((u) =>
            fx("damage", { target: u.id, value: 1, player }),
          ),
        },
      ]);
      break;
    }
    case "wildsRhovanionGloom": {
      const n = wildsOwn(s, player).filter(isAlly).length;
      choose(s, "Gathering Gloom · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${n}`,
          effects: [fx("threat", { player, value: n })],
        },
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player })],
        },
      ]);
      break;
    }
    case "wildsRhovanionUnseen": {
      const opts = characterOptions(
        s,
        player,
        fx("wildsRhovanionUnseenTake"),
        (u) => u.committed,
      );
      if (opts.length)
        choose(s, "Unseen Danger · Remove a character from the quest", opts);
      else {
        const code = s.encounterDeck.shift();
        if (code) s.encounterDiscard.push(code);
      }
      break;
    }
    case "wildsRhovanionUnseenTake": {
      const code = s.encounterDeck.shift();
      if (code) s.encounterDiscard.push(code);
      if (u) {
        u.committed = false;
        forOwner(s, player, () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
        if (code && (card(code).threat ?? 0) > stats(s, u).will)
          discardCharacter(s, u);
      }
      break;
    }
    case "wildsRhovanionEyes": {
      const questers = wildsOwn(s, player).filter((u) => u.committed);
      choose(s, "Eyes in the Dark · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${questers.length}`,
          effects: [fx("threat", { player, value: questers.length })],
        },
        ...questers.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [
            fx("wildsRhovanionDiscardCharacter", { target: u.id, player }),
          ],
        })),
      ]);
      break;
    }
    case "wildsRhovanionDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "wildsRhovanionDiscardWholeHand":
      discardWholeHand(s, player);
      break;
    case "wildsRhovanionDiscardHand": {
      if ((e.value ?? 1) <= 0) break;
      const hand = seatView(s, player).hand;
      if (hand.length)
        choose(
          s,
          `Discard ${e.value ?? 1} card${e.value === 1 ? "" : "s"} from your hand`,
          hand.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("wildsRhovanionDiscardHandTake", { target: u.id, player }),
              fx("wildsRhovanionDiscardHand", {
                player,
                value: (e.value ?? 1) - 1,
              }),
            ],
          })),
        );
      break;
    }
    case "wildsRhovanionDiscardHandTake":
      forOwner(s, player, () => {
        const u = s.hand.find((u) => u.id === e.target);
        if (u) {
          if (u.code === W.lostWild) {
            s.hand = s.hand.filter((c) => c.id !== u.id);
            s.encounterDiscard.push(u.code);
          } else discardHandCard(s, u.id);
        }
      });
      break;
    case "wildsRhovanionDiscardAlly": {
      const allies = wildsOwn(s, player).filter(isAlly);
      if (allies.length)
        choose(
          s,
          "Choose an ally to discard",
          allies.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("wildsRhovanionDiscardCharacter", { target: u.id, player }),
            ],
          })),
        );
      break;
    }
    case "wildsRhovanionDiscardAttachment": {
      const targets = wildsOwn(s, player).flatMap((u) =>
        u.attachments
          .filter((a) => !a.facedown)
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name}`,
            effects: [
              fx("discardAttachment", { target: u.id, source: a.id, player }),
            ],
          })),
      );
      if (targets.length)
        choose(s, "Discard an attachment you control", targets);
      break;
    }
    case "wildsRhovanionWeighedDiscard":
      if (u) {
        const other = u.attachments.filter(
          (a) =>
            a.code !== W.weighed &&
            !card(a.code).type_code.startsWith("objective"),
        );
        const targets = other.length
          ? other
          : u.attachments.filter((a) => a.code === W.weighed);
        if (targets.length)
          choose(
            s,
            "Weighed Down · Discard an attachment from this hero",
            targets.map((a) => ({
              id: a.id,
              code: a.code,
              label: card(a.code).name,
              effects: [
                fx("discardAttachment", { target: u.id, source: a.id, player }),
              ],
            })),
          );
      }
      break;
    case "wildsRhovanionStrayEngage":
      if (u && s.staging.some((e) => e.id === u.id))
        forOwner(s, player, () => engage(s, u));
      break;
    case "wildsRhovanionShuffle":
      wildsShuffleDiscard(s);
      break;
    case "wildsRhovanionDiscardAdd": {
      const code = s.encounterDeck.shift();
      if (code) {
        if (card(code).type_code === e.text) wildsAdd(s, code);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "wildsRhovanionObjectiveTravel": {
      const code = s.encounterDeck.shift();
      if (!code) break;
      s.encounterDiscard.push(code);
      if (e.code === W.path)
        prepend(
          s,
          fx("wildsRhovanionAssignDamage", {
            player,
            value: card(code).threat ?? 0,
          }),
        );
      else if (e.code === W.clearing)
        prepend(s, fx("threat", { player, value: card(code).threat ?? 0 }));
      else if (
        card(code).type_code === (e.code === W.abandoned ? "enemy" : "location")
      ) {
        s.encounterDiscard.pop();
        wildsAdd(s, code);
      }
      break;
    }
    case "wildsRhovanionGrotto": {
      const code = wildsDiscardUntil(
        s,
        (c) => card(c).type_code === "treachery",
      );
      if (code) {
        s.encounterDiscard.push(code);
        wildsRhovanionEncounter(s, code, true, true);
      }
      break;
    }
    case "wildsRhovanionHobgoblin":
      if (u) {
        forOwner(s, player, () => {
          const code = s.deck.shift();
          if (code) {
            const physical = make(s, code);
            physical.owner = player;
            q.guardedPlayerCards.push({
              guardId: u.id,
              player,
              card: physical,
            });
          }
        });
      }
      break;
    case "wildsRhovanionCaptureEvent": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (!event) break;
      const lands = s.staging.filter((l) => l.code === W.lonely && !l.blanked);
      if (lands.length)
        choose(
          s,
          "Lonely Lands · Place this event facedown under a location",
          lands.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("wildsRhovanionCaptureEventTake", {
                target: l.id,
                source: e.source,
                player: event.player,
              }),
            ],
          })),
        );
      break;
    }
    case "wildsRhovanionCaptureEventTake": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (u && event) {
        event.destination = "spent";
        q.storedCards.push({
          locationId: u.id,
          player: event.player,
          cards: [event.unit],
        });
      }
      break;
    }
  }
  return true;
}
export const wildsRhovanionCannotDiscardHand = (
  s: GameState,
  u: Unit,
  byPlayerCardEffect = true,
) => wildsLive(s) && u.code === W.lostWild && byPlayerCardEffect;
export function wildsRhovanionHandDiscardDestination(s: GameState, u: Unit) {
  if (!wildsLive(s) || u.code !== W.lostWild) return false;
  s.encounterDiscard.push(u.code);
  return true;
}
export const wildsRhovanionAbilityLabel = (code: string) =>
  code === W.hills ? "Exhaust a character to reduce threat" : undefined;
export const wildsRhovanionAbilityProblem = (s: GameState, u: Unit) =>
  u.code !== W.hills
    ? null
    : s.phase !== "quest"
      ? "Use Hills of Wilderland during the quest phase."
      : activeSeat(s) !== firstPlayer(s)
        ? "Only the first player can trigger this ability."
        : !wildsOwn(s, firstPlayer(s)).some((c) => !c.exhausted)
          ? "Exhaust a ready character to pay this cost."
          : null;
export function wildsRhovanionAbility(s: GameState, u: Unit) {
  if (!wildsLive(s) || u.code !== W.hills) return false;
  prepend(
    s,
    fx("wildsRhovanionHills", { target: u.id, player: activeSeat(s) }),
  );
  return true;
}
export const WILDS_RHOVANION_HOOKS: Batch4ScenarioHooks = {
  setup: setupWildsRhovanion,
  abilityLabel: wildsRhovanionAbilityLabel,
  abilityProblem: wildsRhovanionAbilityProblem,
  ability: wildsRhovanionAbility,
  openingHandsKept: wildsRhovanionOpeningHandsKept,
  check: wildsRhovanionCheck,
  advance: wildsRhovanionAdvance,
  stageInfo: wildsRhovanionStageInfo,
  stats: wildsRhovanionStats,
  willpowerOverride: wildsRhovanionWillpowerOverride,
  threatBonus: wildsRhovanionThreatBonus,
  stagingThreat: wildsRhovanionStagingThreat,
  locationQuestBonus: wildsRhovanionLocationQuestBonus,
  locationProgressAmount: wildsRhovanionLocationProgressAmount,
  progress: wildsRhovanionProgress,
  questProgressPlaced: wildsRhovanionQuestProgressPlaced,
  cannotReady: wildsRhovanionCannotReady,
  characterBlanked: wildsRhovanionCharacterBlanked,
  immune: wildsRhovanionImmune,
  cannotLeave: wildsRhovanionCannotLeave,
  cannotEngage: wildsRhovanionCannotEngage,
  cannotOptionallyEngage: wildsRhovanionCannotOptionallyEngage,
  cannotCancel: wildsRhovanionCannotCancel,
  cannotReduceThreat: wildsRhovanionCannotReduceThreat,
  questBegin: wildsRhovanionBeginQuest,
  encounterBegin: wildsRhovanionBeginEncounter,
  encounterEnd: wildsRhovanionEndEncounter,
  roundEnd: wildsRhovanionRoundEnd,
  engaged: wildsRhovanionEngaged,
  hostLeaves: wildsRhovanionHostLeaves,
  characterLeft: wildsRhovanionCharacterLeft,
  damageAmount: wildsRhovanionDamageAmount,
  damageDealt: wildsRhovanionDamageDealt,
  explored: wildsRhovanionExplored,
  travelEffects: wildsRhovanionTravelEffects,
  travelEntered: wildsRhovanionTravelEntered,
  travelProblem: wildsRhovanionTravelProblem,
  allyEntered: wildsRhovanionAllyEntered,
  eventPlayed: wildsRhovanionEventPlayed,
  playerCardPlayed: wildsRhovanionPlayerCardPlayed,
  playerAttackDeclared: wildsRhovanionAttackDeclared,
  enemyAttackStarted: wildsRhovanionEnemyAttackStarted,
  attackFinished: wildsRhovanionAttackFinished,
  finishShadows: wildsRhovanionFinishShadows,
  cardEntered: wildsRhovanionCardEntered,
  encounter: wildsRhovanionEncounter,
  shadow: wildsRhovanionShadow,
  effect: wildsRhovanionEffect,
  enemyDestination: wildsRhovanionEnemyDestination,
  cannotAttach: (s, u, code) => wildsRhovanionCannotAttach(s, u, code),
  doesNotExhaustToQuest: wildsRhovanionDoesNotExhaustToQuest,
  mustTravel: wildsRhovanionMustTravel,
  revealedSurge: wildsRhovanionRevealSurge,
  characterReadied: wildsRhovanionCharacterReadied,
  committed: wildsRhovanionCommitted,
  shadowResolved: wildsRhovanionShadowResolved,
  cannotDiscardHand: wildsRhovanionCannotDiscardHand,
  handDiscardDestination: wildsRhovanionHandDiscardDestination,
  successfulQuestProgress: wildsRhovanionQuestSucceeded,
  missingHeroAllowed: (s, p) =>
    !!s.wildsRhovanion?.guardedHeroes.some((g) => g.player === p),
  sharedEffect: wildsRhovanionSharedEffect,
};
