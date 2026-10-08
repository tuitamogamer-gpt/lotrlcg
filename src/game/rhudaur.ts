import type { Attachment, Effect, GameState, Option, Unit } from "./types";
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
  spendResources,
  stats,
  threatOf,
} from "./core";
import {
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  progressLocation,
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
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, currentQuestUnit } from "./quest-state";
import { addQuestProgress } from "./side-quests";
import { sideQuestArea } from "./side-quest-support";
import { choosePlayerResponse } from "./player-ability-triggers";
import {
  heirsCanSpendResources,
  heirsCannotHaveAttachments,
} from "./heirs-numenor";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  RHUDAUR as R,
  RHUDAUR_CLUES,
  RHUDAUR_FLIPS,
  RHUDAUR_RECIPES,
  RHUDAUR_SIDES,
} from "./rhudaur-support";
import { WEATHER } from "./weather-hills-support";

const isRhudaur = (s: GameState) => !!s.rhudaur;
const undead = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Undead");
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const ranger = (s: GameState) =>
  allCharacters(s).find((u) => u.code === R.amarthiul);
const boss = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].find((u) => u.code === R.thaurdir);
const ownCharacters = (s: GameState) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === activeSeat(s));
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const heroesToPay = (s: GameState) =>
  s.heroes.filter((h) => h.resources > 0 && heirsCanSpendResources(s, h));
const clueBearers = (s: GameState) =>
  ownCharacters(s).filter(
    (u) =>
      canExhaust(u) &&
      !heirsCannotHaveAttachments(u) &&
      (card(u.code).type_code === "hero" || u.code === R.amarthiul),
  );
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const samePhase = (a: string, b: string) =>
  a === b || [a, b].every((p) => ["quest", "staging"].includes(p));
const highestThreat = (s: GameState) => {
  const players = playerOrder(s),
    highest = Math.max(...players.map((p) => seatView(s, p).threat));
  return players.filter((p) => seatView(s, p).threat === highest);
};
const controlledClue = (s: GameState, player: number) =>
  allCharacters(s).some(
    (u) =>
      ownerOf(s, u) === player &&
      u.attachments.some((a) => RHUDAUR_CLUES.includes(a.code)),
  );
const printedSide = (u: Unit) => RHUDAUR_SIDES.includes(u.code);
const lastIndex = (codes: string[], predicate: (code: string) => boolean) => {
  for (let i = codes.length - 1; i >= 0; i--) if (predicate(codes[i])) return i;
  return -1;
};
export const rhudaurMainQuestAvailable = (s: GameState) =>
  !isRhudaur(s) || s.stage !== 1 || !["quest", "staging"].includes(s.phase);
export const rhudaurIndestructible = (s: GameState, u: Unit) =>
  isRhudaur(s) && u.code === R.thaurdir && !u.blanked;
export const rhudaurCannotAttach = rhudaurIndestructible;
export const rhudaurMainQuestReduction = (s: GameState) =>
  isRhudaur(s) && s.stage === 2
    ? -5 *
      allCharacters(s).reduce(
        (n, u) =>
          n +
          u.attachments.filter((a) => RHUDAUR_CLUES.includes(a.code)).length,
        0,
      )
    : 0;
export function rhudaurQuestPoints(s: GameState, u: Unit) {
  if (!isRhudaur(s)) return 0;
  return (
    6 * u.attachments.filter((a) => a.code === R.fog && !a.blanked).length +
    (s.staging.some((q) => q.id === u.id) ? 2 * live(s, R.remains).length : 0)
  );
}
export const rhudaurLocationQuestBonus = (s: GameState, u: Unit) =>
  isRhudaur(s) && s.staging.some((l) => l.id === u.id)
    ? 2 * live(s, R.remains).length
    : 0;
export const rhudaurThreatBonus = (s: GameState, u: Unit) =>
  isRhudaur(s) &&
  card(u.code).type_code === "location" &&
  !currentQuestUnit(s)?.blanked &&
  currentQuestUnit(s)?.code === R.debris &&
  s.staging.some((l) => l.id === u.id)
    ? 1
    : 0;
export const rhudaurStats = (s: GameState, u: Unit) => ({
  will: isRhudaur(s)
    ? u.attachments.filter((a) => a.code === R.heirloom && !a.blanked).length +
      (["ally", "objective-ally"].includes(card(u.code).type_code) &&
      currentQuestUnit(s)?.code === R.texts &&
      !currentQuestUnit(s)?.blanked
        ? -2
        : 0)
    : 0,
});
export const rhudaurAttackBonus = (s: GameState, enemy: Unit, u: Unit) =>
  isRhudaur(s) && undead(enemy.code)
    ? u.attachments.filter((a) => a.code === R.brand && !a.blanked).length
    : 0;
export const rhudaurDefenseBonus = (s: GameState, enemy: Unit, u: Unit) =>
  isRhudaur(s) && undead(enemy.code)
    ? u.attachments.filter((a) => a.code === R.orders && !a.blanked).length
    : 0;
export function rhudaurStagingThreat(s: GameState) {
  if (!s.rhudaur) return 0;
  return Object.entries(s.rhudaur.quietThreat).reduce((total, [id, entry]) => {
    const enemy = get(s, id);
    return (
      total +
      (samePhase(entry.phase, s.phase) &&
      enemy &&
      !s.staging.some((u) => u.id === id)
        ? threatOf(s, enemy)
        : 0)
    );
  }, 0);
}

export function setupRhudaur(s: GameState) {
  const recipe = RHUDAUR_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  // The recipe's one staged Causeway belongs to the original setup search.
  s.encounterDeck.push(WEATHER.causeway);
  s.rhudaur = {
    initialized: false,
    time: 5,
    setAside: [make(s, R.thaurdir)],
    forbiddenProgressRound: -1,
    forbiddenProgress: {},
    quietThreat: {},
    textActionsRound: -1,
    textActions: {},
    deckEmptyHandled: false,
  };
}
export function rhudaurOpeningHandsKept(s: GameState) {
  if (!s.rhudaur || s.rhudaur.initialized) return false;
  prepend(s, fx("rhudaurSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function rhudaurCheck(s: GameState) {
  const q = s.rhudaur;
  if (!q?.initialized || s.status !== "playing") return;
  if (!ranger(s)) {
    s.status = "lost";
    s.reason = "Amarthiúl has left play. The investigation has failed.";
    s.queue = [];
    s.choice = null;
    return;
  }
  if (s.encounterDeck.length) q.deckEmptyHandled = false;
  else rhudaurBeforeEncounterReset(s);
  rhudaurAdvance(s);
}
export function rhudaurAdvance(s: GameState) {
  if (!s.rhudaur) return false;
  if (
    !s.rhudaur.initialized ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.phase === "setup"
  )
    return true;
  if (s.stage === 1) {
    if (s.staging.some(printedSide) && s.rhudaur.time > 0) return true;
    for (const side of [...s.staging].filter(printedSide)) {
      discardQuestAttachments(s, side.code, side.id);
      s.staging = s.staging.filter((u) => u.id !== side.id);
      s.removedEncounter ??= [];
      s.removedEncounter.push(side.code);
    }
    discardQuestAttachments(s, R.secrets);
    s.stage = 2;
    s.progress = 0;
    s.rhudaur.time = 0;
    s.stageRevealing = true;
    prepend(s, fx("rhudaurStageTwo", { player: firstPlayer(s) }));
    log(
      s,
      "Thaurdir's Pursuit · The sorcerer has reached the ruins.",
      "chapter",
    );
  } else if (
    !s.queue.length &&
    !s.choice &&
    s.progress >=
      Math.max(
        0,
        30 +
          rhudaurMainQuestReduction(s) +
          rhudaurQuestPoints(s, allQuestUnits(s)[0]),
      )
  ) {
    const enemy = boss(s);
    if (
      enemy &&
      enemy.damage >= stats(s, enemy).health &&
      !questDefeated(s, R.pursuit)
    )
      win(s);
  }
  return true;
}
/** The physical quest turns into its original back; it never enters victory. */
export function rhudaurFlipSide(s: GameState, u: Unit) {
  const back = RHUDAUR_FLIPS[u.code];
  if (!isRhudaur(s) || !back) return false;
  u.code = back;
  u.progress = 0;
  u.damage = 0;
  delete u.guarding;
  log(s, `${name(u)} is now an unclaimed Clue objective.`, "good");
  return true;
}
export function rhudaurAttachmentLeaves(
  s: GameState,
  _host: Unit,
  a: Attachment,
) {
  if (!isRhudaur(s) || !RHUDAUR_CLUES.includes(a.code)) return false;
  const objective = make(s, a.code);
  objective.id = a.id;
  delete objective.owner;
  s.staging.push(objective);
  log(s, `${card(a.code).name} returns to staging, unclaimed.`);
  return true;
}
export function rhudaurQuestStart(_s: GameState) {}
export function rhudaurEnemyAdded(s: GameState, u: Unit) {
  if (
    !isRhudaur(s) ||
    !undead(u.code) ||
    currentQuestUnit(s)?.code !== R.spirits ||
    currentQuestUnit(s)?.blanked
  )
    return;
  const players = highestThreat(s);
  if (players.length === 1)
    prepend(s, fx("rhudaurQuietEngage", { target: u.id, player: players[0] }));
  else
    prepend(
      s,
      fx("rhudaurQuietChoose", { target: u.id, player: firstPlayer(s) }),
    );
}
export function rhudaurEnemyDestroyed(s: GameState, _u: Unit) {
  if (!isRhudaur(s)) return;
  for (const side of live(s, R.spirits))
    prepend(
      s,
      fx("rhudaurAddProgress", {
        target: side.id,
        value: 2,
        player: firstPlayer(s),
      }),
    );
}
export function rhudaurExplored(s: GameState, u: Unit, _wasActive: boolean) {
  if (!isRhudaur(s)) return;
  const effects: Effect[] = [];
  if (u.code === R.hall && !u.blanked)
    effects.push(fx("rhudaurHall", { player: firstPlayer(s) }));
  effects.push(
    ...live(s, R.debris).map((side) =>
      fx("rhudaurAddProgress", {
        target: side.id,
        value: 2,
        player: firstPlayer(s),
      }),
    ),
  );
  if (effects.length > 1)
    prepend(s, fx("fangornOrder", { effects, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
export function rhudaurLocationLeft(s: GameState, u: Unit, wasActive: boolean) {
  if (isRhudaur(s) && u.code === R.descent && !u.blanked && !wasActive)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("rhudaurThreat", { value: 2, player }),
      ),
    );
}
/** One depleted deck is one trigger, including depletion during combat. */
export function rhudaurBeforeEncounterReset(s: GameState) {
  const q = s.rhudaur;
  if (!q || q.deckEmptyHandled || s.encounterDeck.length) return;
  q.deckEmptyHandled = true;
  for (const _ruin of live(s, R.ghostly)) {
    const index = lastIndex(s.encounterDiscard, undead);
    if (index >= 0) {
      const enemy = make(s, s.encounterDiscard.splice(index, 1)[0]);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
    }
  }
}
/** Resolve replacements before the original progress placement, preserving its target. */
export function rhudaurRedirectProgress(
  s: GameState,
  quest: Unit,
  amount: number,
) {
  const q = s.rhudaur;
  if (!q || amount <= 0) return false;
  if (q.forbiddenProgressRound !== s.round) {
    q.forbiddenProgressRound = s.round;
    q.forbiddenProgress = {};
  }
  const locations = live(s, R.descent).filter(
    (u) => (q.forbiddenProgress[u.id] ?? 0) < 2,
  );
  if (!locations.length) return false;
  const options = locations.map((location) => {
    const n = Math.min(amount, 2 - (q.forbiddenProgress[location.id] ?? 0));
    return {
      id: location.id,
      code: location.code,
      label: `${name(location)} · Replace ${n} progress`,
      effects: [
        fx("rhudaurDescentProgress", {
          target: location.id,
          source: quest.id,
          code: quest.code,
          value: n,
          count: amount - n,
          player: firstPlayer(s),
        }),
      ],
    };
  });
  if (options.length === 1) prepend(s, ...options[0].effects);
  else choose(s, "Forbidden Descent · Choose a progress replacement", options);
  return true;
}
export function rhudaurEngaged(s: GameState, u: Unit) {
  if (!isRhudaur(s)) return;
  const player = ownerOf(s, u),
    effects: Effect[] = [];
  if (u.code === R.traitor && !u.blanked)
    effects.push(
      fx("rhudaurRemoveQuestProgress", { value: 2, player: firstPlayer(s) }),
    );
  const ally = ranger(s);
  if (ally && !ally.blanked && ownerOf(s, ally) !== player)
    effects.push(
      fx("rhudaurAmarthiulResponse", {
        source: ally.id,
        value: player,
        player: ownerOf(s, ally),
      }),
    );
  prepend(s, ...effects);
}
export function rhudaurAfterReveal(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
) {
  const enemy = boss(s);
  if (
    isRhudaur(s) &&
    enemy &&
    !enemy.blanked &&
    origin === "encounter" &&
    card(code).type_code === "treachery" &&
    (card(code).traits ?? "").split(".").some((t) => t.trim() === "Sorcery")
  )
    prepend(
      s,
      fx("rhudaurThaurdirSorcery", {
        target: enemy.id,
        player: firstPlayer(s),
      }),
    );
}
export function rhudaurDamageDealt(
  s: GameState,
  _u: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    isRhudaur(s) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    (s.combat.rhudaurProgressPerDamage ?? 0) > 0
  )
    prepend(
      s,
      fx("rhudaurRemoveQuestProgress", {
        value: value * s.combat.rhudaurProgressPerDamage!,
        player: firstPlayer(s),
      }),
    );
}
export function rhudaurCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    isRhudaur(s) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    (s.combat.rhudaurCovenantShadows ?? 0) > 0
  )
    s.combat.rhudaurDestroyedWill =
      (s.combat.rhudaurDestroyedWill ?? 0) + stats(s, u).will;
}
export function rhudaurAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (isRhudaur(s) && c.rhudaurDestroyedWill && c.rhudaurCovenantShadows)
    prepend(
      s,
      fx("rhudaurThreat", {
        value: c.rhudaurDestroyedWill * c.rhudaurCovenantShadows,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
}
export function rhudaurTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (isRhudaur(s) && u.code === R.ghostly && !u.blanked)
    return [fx("rhudaurReturnUndead", { player: firstPlayer(s) })];
  return undefined;
}
export function rhudaurTravelProblem(s: GameState, u: Unit) {
  return isRhudaur(s) &&
    u.code === R.ghostly &&
    !u.blanked &&
    !s.encounterDiscard.some(undead)
    ? "Ghostly Ruins requires an Undead enemy in the encounter discard pile."
    : null;
}
export function rhudaurAbilityLabel(s: GameState, u: Unit) {
  if (!isRhudaur(s) || u.blanked || !s.staging.some((q) => q.id === u.id))
    return null;
  if (u.code === R.halls)
    return "Raise threat by 1 · Lower Eerie Halls' threat";
  if (
    u.code === R.texts &&
    heroesToPay(s).length &&
    (s.rhudaur!.textActionsRound !== s.round ||
      (s.rhudaur!.textActions[u.id] ?? 0) < 3)
  )
    return "Pay 1 resource · Place 1 progress";
  if (RHUDAUR_CLUES.includes(u.code) && clueBearers(s).length)
    return "Exhaust a hero or Amarthiúl · Claim this Clue";
  return null;
}
export function rhudaurAbility(s: GameState, u: Unit) {
  if (!rhudaurAbilityLabel(s, u)) return false;
  if (u.code === R.halls) {
    raiseThreat(s, 1, "cost");
    u.tempThreat = (u.tempThreat ?? 0) - 1;
  } else if (u.code === R.texts) {
    choose(
      s,
      "Decipher Ancient Texts · Pay 1 resource",
      heroesToPay(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: name(h),
        effects: [fx("rhudaurTextsPay", { target: u.id, source: h.id })],
      })),
    );
  } else {
    const targets = clueBearers(s);
    choose(
      s,
      `${name(u)} · Claim this Clue`,
      targets.map((c) => ({
        id: c.id,
        code: c.code,
        label: `Exhaust ${name(c)}`,
        effects: [fx("rhudaurClaim", { target: u.id, source: c.id })],
      })),
    );
  }
  return true;
}
export function rhudaurEncounter(s: GameState, code: string, replay = false) {
  if (!isRhudaur(s)) return false;
  if (code === R.years) {
    const exhausted = allCharacters(s).filter((u) => u.exhausted);
    prepend(
      s,
      ...exhausted.map((u) =>
        fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
      ),
      ...playerOrder(s)
        .filter((p) => seatView(s, p).threat >= 35)
        .map((player) => fx("rhudaurYearsAttachments", { player })),
    );
  } else if (code === R.covenant)
    prepend(s, fx("rhudaurCovenantDiscard", { player: firstPlayer(s) }));
  else if (code === R.sorrow)
    prepend(s, fx("rhudaurSwitchQuest", { player: firstPlayer(s) }));
  else if (code === R.fog) {
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("chooseExhaust", { count: 1, player }),
      ),
      fx("rhudaurAttachFog", { code, player: firstPlayer(s) }),
    );
    return true;
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export const rhudaurRevealSurge = (s: GameState, code: string) =>
  isRhudaur(s) && code === R.wight && (currentQuestUnit(s)?.progress ?? 0) > 0;
export const rhudaurRevealDoomed = (s: GameState, code: string) =>
  isRhudaur(s) && code === R.wight && (currentQuestUnit(s)?.progress ?? 0) === 0
    ? 2
    : 0;
export function rhudaurShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!isRhudaur(s) || !c) return false;
  const clue = controlledClue(s, c.attackPlayer ?? activeSeat(s));
  if (code === R.years) c.attackBonus += clue ? 1 : 3;
  else if (code === R.covenant)
    c.rhudaurCovenantShadows = (c.rhudaurCovenantShadows ?? 0) + 1;
  else if (code === R.sorrow) {
    if (!clue) {
      c.defenderId = null;
      c.defenderIds = [];
    }
  } else if (code === R.halls) {
    if (!clue) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else if ([R.traitor, R.remains].includes(code))
    c.rhudaurProgressPerDamage = (c.rhudaurProgressPerDamage ?? 0) + 1;
  else return false;
  return true;
}
function discardEncounter(s: GameState, count: number) {
  const codes: string[] = [];
  while (count-- > 0) {
    if (!s.encounterDeck.length && ["quest", "staging"].includes(s.phase)) {
      rhudaurBeforeEncounterReset(s);
      if (s.encounterDiscard.length) {
        s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        s.rhudaur!.deckEmptyHandled = false;
        log(s, "The encounter discard pile is shuffled back into its deck.");
      }
    }
    if (!s.encounterDeck.length) break;
    const code = s.encounterDeck.shift()!;
    codes.push(code);
    s.encounterDiscard.push(code);
    // Discarding is one atomic move: the last card is already in discard when
    // Ghostly Ruins chooses the topmost Undead, before a later draw can reset.
    rhudaurBeforeEncounterReset(s);
  }
  return codes;
}
function searchOptions(s: GameState): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) =>
    (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
      (code, index) =>
        undead(code)
          ? [
              {
                id: `${zone}-${index}`,
                code,
                label: `${card(code).name} · ${zone}`,
                effects: [
                  fx("rhudaurSearchTake", { code, value: index, text: zone }),
                ],
              },
            ]
          : [],
    ),
  );
}
export function rhudaurEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("rhudaur")) return false;
  if (!s.rhudaur) return true;
  const q = s.rhudaur,
    u = get(s, e.target);
  switch (e.kind) {
    case "rhudaurThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "rhudaurHall":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("rhudaurHallDiscard", { player })),
      );
      break;
    case "rhudaurSetup": {
      s.activeLocation = make(s, R.hall);
      s.staging.push(...RHUDAUR_SIDES.map((code) => make(s, code)));
      for (let n = 0; n < (playerOrder(s).length >= 3 ? 2 : 1); n++) {
        const i = s.encounterDeck.indexOf(WEATHER.causeway);
        if (i >= 0) s.staging.push(make(s, s.encounterDeck.splice(i, 1)[0]));
      }
      const ally = make(s, R.amarthiul);
      ally.controller = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(ally));
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    }
    case "rhudaurStageTwo": {
      const enemy = q.setAside.pop();
      if (enemy) {
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("rhudaurSearchUndead", { player }),
        ),
        fx("rhudaurShuffle"),
        fx("stageRevealed"),
      );
      break;
    }
    case "rhudaurTimeExpired":
      rhudaurAdvance(s);
      break;
    case "rhudaurShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "rhudaurSearchUndead": {
      const options = searchOptions(s);
      if (options.length)
        choose(s, "Thaurdir's Pursuit · Add an Undead enemy", options);
      break;
    }
    case "rhudaurSearchTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (e.value !== undefined && pile[e.value] === e.code) {
        const enemy = make(s, pile.splice(e.value, 1)[0]);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "rhudaurQuietChoose":
      if (u)
        choose(
          s,
          "Quiet the Spirits · Highest threat is tied",
          highestThreat(s).map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [fx("rhudaurQuietEngage", { target: u.id, player })],
          })),
        );
      break;
    case "rhudaurQuietEngage":
      if (u && s.staging.some((enemy) => enemy.id === u.id)) {
        q.quietThreat[u.id] = { phase: s.phase, threat: threatOf(s, u) };
        engage(s, u);
      }
      break;
    case "rhudaurAddProgress":
      if (u) addQuestProgress(s, u, e.value ?? 0);
      break;
    case "rhudaurDescentProgress":
      if (u) {
        q.forbiddenProgress[u.id] =
          (q.forbiddenProgress[u.id] ?? 0) + (e.value ?? 0);
        const continuation = s.queue;
        s.queue = [];
        progressLocation(s, u, e.value ?? 0);
        s.queue.push(
          fx("rhudaurResumeProgress", {
            target: e.source,
            code: e.code,
            value: e.count ?? 0,
            player: firstPlayer(s),
          }),
          ...continuation,
        );
      }
      break;
    case "rhudaurResumeProgress":
      if (u && u.code === e.code) addQuestProgress(s, u, e.value ?? 0);
      break;
    case "rhudaurHallDiscard": {
      const discarded = discardEncounter(s, 5),
        choices = [
          ...new Set(
            discarded.filter(
              (code) => undead(code) && s.encounterDiscard.includes(code),
            ),
          ),
        ];
      if (choices.length)
        choose(
          s,
          "The Great Hall · Add one discarded Undead enemy",
          choices.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("rhudaurHallTake", { code })],
          })),
        );
      break;
    }
    case "rhudaurHallTake": {
      const i = lastIndex(s.encounterDiscard, (code) => code === e.code);
      if (i >= 0) {
        const enemy = make(s, s.encounterDiscard.splice(i, 1)[0]);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "rhudaurReturnUndead": {
      const i = lastIndex(s.encounterDiscard, undead);
      if (i >= 0) {
        const enemy = make(s, s.encounterDiscard.splice(i, 1)[0]);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "rhudaurAmarthiulResponse": {
      const ally = e.source ? get(s, e.source) : undefined;
      if (
        !ally ||
        ally.blanked ||
        e.value === undefined ||
        ownerOf(s, ally) === e.value
      )
        break;
      choosePlayerResponse(
        s,
        ally.id,
        ally.code,
        "Amarthiúl · Follow the engaged player?",
        [
          {
            id: "give",
            label: `Give control to ${seatName(s, e.value)}`,
            effects: [
              fx("rhudaurGiveAmarthiul", { target: ally.id, value: e.value }),
            ],
          },
          skip,
        ],
        undefined,
        e.player ?? ownerOf(s, ally),
      );
      break;
    }
    case "rhudaurGiveAmarthiul":
      if (u && e.value !== undefined && playerOrder(s).includes(e.value)) {
        forOwner(s, ownerOf(s, u), () => {
          s.allies = s.allies.filter((c) => c.id !== u.id);
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
        u.controller = e.value;
        forOwner(s, e.value, () => s.allies.push(u));
      }
      break;
    case "rhudaurThaurdirSorcery":
      if (u) {
        u.damage = Math.max(0, u.damage - 3);
        prepend(
          s,
          fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
        );
      }
      break;
    case "rhudaurRemoveQuestProgress":
      for (const quest of allQuestUnits(s)) {
        if (quest.id.startsWith("quest:"))
          s.progress = Math.max(0, s.progress - (e.value ?? 0));
        else quest.progress = Math.max(0, quest.progress - (e.value ?? 0));
      }
      break;
    case "rhudaurYearsAttachments":
      for (const host of [
        ...allCharacters(s),
        ...s.staging,
        ...allEngaged(s),
        ...allActiveLocations(s),
        ...allQuestUnits(s),
      ])
        for (const a of [...host.attachments].filter(
          (a) =>
            a.exhausted &&
            (a.controller ?? a.owner ?? ownerOf(s, host)) === activeSeat(s),
        ))
          prepend(
            s,
            fx("discardAttachment", { target: host.id, source: a.id }),
          );
      break;
    case "rhudaurCovenantDiscard": {
      const discarded = discardEncounter(s, 3),
        total = discarded.reduce((n, code) => n + (card(code).threat ?? 0), 0);
      if (total <= 0) break;
      const quests = allQuestUnits(s),
        progress = quests.reduce((n, quest) => n + quest.progress, 0),
        characters = ownCharacters(s);
      const options: Option[] = [];
      if (progress >= total)
        options.push({
          id: "progress",
          label: `Remove ${total} progress among quests`,
          effects: [fx("rhudaurCovenantProgress", { value: total })],
        });
      if (characters.length)
        options.push({
          id: "damage",
          label: `Assign ${total} damage among your characters`,
          effects: [fx("rhudaurCovenantDamage", { value: total, effects: [] })],
        });
      if (!options.length && progress > 0)
        options.push({
          id: "progress",
          label: "Remove all remaining quest progress",
          effects: [
            fx("rhudaurCovenantProgress", { value: Math.min(progress, total) }),
          ],
        });
      choose(s, "Dark Covenant · Progress or damage", options);
      break;
    }
    case "rhudaurCovenantProgress": {
      const remaining = e.value ?? 0,
        quests = allQuestUnits(s).filter((quest) => quest.progress > 0);
      if (!remaining || !quests.length) break;
      choose(
        s,
        "Dark Covenant · Remove progress",
        quests.flatMap((quest) =>
          Array.from(
            { length: Math.min(remaining, quest.progress) },
            (_, i) => ({
              id: `${quest.id}:${i + 1}`,
              code: quest.code,
              label: `${name(quest)} · Remove ${i + 1}`,
              effects: [
                fx("rhudaurCovenantRemove", { target: quest.id, value: i + 1 }),
                fx("rhudaurCovenantProgress", { value: remaining - i - 1 }),
              ],
            }),
          ),
        ),
      );
      break;
    }
    case "rhudaurCovenantRemove":
      if (u) {
        if (u.id.startsWith("quest:"))
          s.progress = Math.max(0, s.progress - (e.value ?? 0));
        else u.progress = Math.max(0, u.progress - (e.value ?? 0));
      }
      break;
    case "rhudaurCovenantDamage": {
      const remaining = e.value ?? 0,
        assigned = e.effects ?? [];
      if (remaining <= 0) {
        const merged: Effect[] = [];
        for (const effect of assigned) {
          const existing = merged.find((e) => e.target === effect.target);
          if (existing)
            existing.value = (existing.value ?? 0) + (effect.value ?? 0);
          else merged.push(effect);
        }
        prepend(s, ...merged);
        break;
      }
      const targets = ownCharacters(s);
      if (targets.length)
        choose(
          s,
          "Dark Covenant · Assign damage",
          targets.flatMap((c) =>
            Array.from({ length: remaining }, (_, i) => ({
              id: `${c.id}:${i + 1}`,
              code: c.code,
              label: `${name(c)} · ${i + 1} damage`,
              effects: [
                fx("rhudaurCovenantDamage", {
                  value: remaining - i - 1,
                  effects: [
                    ...assigned,
                    fx("damage", {
                      target: c.id,
                      value: i + 1,
                      player: ownerOf(s, c),
                    }),
                  ],
                }),
              ],
            })),
          ),
        );
      break;
    }
    case "rhudaurSwitchQuest": {
      const current = currentQuestUnit(s),
        options = allQuestUnits(s).filter(
          (quest) =>
            quest.id !== current?.id &&
            (quest.code !== R.secrets || rhudaurMainQuestAvailable(s)),
        );
      if (options.length)
        choose(
          s,
          "Centuries of Sorrow · Choose a new current quest",
          options.map((quest) => ({
            id: quest.id,
            code: quest.code,
            label: name(quest),
            effects: [
              fx("rhudaurSelectQuest", { target: quest.id, code: quest.code }),
            ],
          })),
        );
      break;
    }
    case "rhudaurSelectQuest":
      if (u && u.code === e.code) {
        if (u.id.startsWith("quest:")) {
          if (s.sideQuestSelections)
            delete s.sideQuestSelections[sideQuestArea(s)];
        } else
          (s.sideQuestSelections ??= {})[sideQuestArea(s)] = {
            id: u.id,
            code: u.code,
            phase: s.phase,
          };
      }
      break;
    case "rhudaurAttachFog": {
      const quest = currentQuestUnit(s);
      if (quest) {
        const attachment = {
          id: make(s, R.fog).id,
          code: R.fog,
          exhausted: false,
        };
        if (quest.id.startsWith("quest:"))
          ((s.questAttachments ??= {})[quest.code] ??= []).push(attachment);
        else quest.attachments.push(attachment);
      } else s.encounterDiscard.push(R.fog);
      break;
    }
    case "rhudaurTextsPay": {
      const payer = e.source ? get(s, e.source) : undefined;
      if (
        !u ||
        u.code !== R.texts ||
        !payer ||
        payer.resources < 1 ||
        !heirsCanSpendResources(s, payer)
      )
        break;
      if (q.textActionsRound !== s.round) {
        q.textActionsRound = s.round;
        q.textActions = {};
      }
      if ((q.textActions[u.id] ?? 0) >= 3) break;
      spendResources(s, payer, 1);
      q.textActions[u.id] = (q.textActions[u.id] ?? 0) + 1;
      prepend(
        s,
        fx("rhudaurAddProgress", {
          target: u.id,
          value: 1,
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "rhudaurClaim": {
      const character = e.source ? get(s, e.source) : undefined;
      if (
        u &&
        RHUDAUR_CLUES.includes(u.code) &&
        character &&
        ownerOf(s, character) === activeSeat(s) &&
        canExhaust(character) &&
        !heirsCannotHaveAttachments(character) &&
        exhaustCharacter(s, character)
      ) {
        s.staging = s.staging.filter((obj) => obj.id !== u.id);
        character.attachments.push({
          id: u.id,
          code: u.code,
          exhausted: false,
          controller: activeSeat(s),
        });
      }
      break;
    }
    default:
      return false;
  }
  return true;
}
