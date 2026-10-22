import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
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
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { choosePlayerResponse } from "./player-ability-triggers";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isAlly, isHero } from "./card-types";
import {
  FATE_WILDERLAND as F,
  FATE_WILDERLAND_RECIPES,
  fateWilderlandPhase as phase,
  fateWilderlandPlayers as players,
  fateWilderlandStageInfo,
} from "./fate-wilderland-support";
export * from "./fate-wilderland-support";

type Combat = NonNullable<GameState["combat"]>;
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const urdug = (s: GameState) => s.staging.find((u) => u.code === F.urdug);
const assault = (s: GameState) => s.staging.find((u) => u.code === F.assault);
const defense = (s: GameState) => s.staging.find((u) => u.code === F.defense);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const ready = (s: GameState, p: number) =>
  own(s, p).filter(
    (u) =>
      !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u),
  );
const goblin = (u: Unit) =>
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Goblin");
const maxCharacters = (s: GameState) =>
  Math.max(0, ...playerOrder(s).map((p) => own(s, p).length));
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const assaultOption = (n = 1): Option => ({
  id: "assault",
  label: `Place ${n} progress on The Goblins’ Assault`,
  effects: [fx("wilderAssault", { value: n })],
});
const canPlaceDefense = (s: GameState) =>
  !!defense(s) && !live(s, F.gate).length;
const stamps = (s: GameState, m: { round: number; phase?: string }) =>
  m.round === s.round && (m.phase === undefined || m.phase === phase(s));
function placeAssault(s: GameState, n: number) {
  const q = assault(s);
  if (!q || n <= 0) return;
  q.progress += n;
  log(s, `The Goblins’ Assault gains ${n} progress (${q.progress}).`, "danger");
}
function placeDefense(s: GameState) {
  const q = defense(s);
  if (!q || !canPlaceDefense(s)) return;
  q.resources++;
  log(
    s,
    `The Heroes’ Defense gains 1 resource (${q.resources}/${5 * players(s)}).`,
    "good",
  );
}
function addEnemy(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function discardTop(s: GameState) {
  const code = encounterDraw(s);
  if (code) s.encounterDiscard.push(code);
  return code;
}
function takeDiscardedEnemy(s: GameState, code: string) {
  const index = s.encounterDiscard.lastIndexOf(code);
  if (index >= 0) {
    s.encounterDiscard.splice(index, 1);
    addEnemy(s, code);
  }
}
function returnEnemy(s: GameState, u: Unit) {
  if (!allEngaged(s).some((e) => e.id === u.id)) return;
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((e) => e.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  delete u.revealedShadowCount;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  delete u.owner;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  log(s, `${name(u)} returns to staging.`);
}

export function setupFateWilderland(s: GameState) {
  const recipe = FATE_WILDERLAND_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.staging.push(
    ...recipe.cards
      .filter((r) => r.section === "sharedStagingArea")
      .flatMap((r) =>
        Array.from({ length: r.quantity }, () => make(s, r.code)),
      ),
  );
  s.fateWilderland = {
    initialized: false,
    urdugDestroyed: false,
    currentQuest: F.first,
    blankShadows: {},
    modifiers: [],
    preventDamage: [],
    darkClouds: [],
    storedCards: [],
    resolving: [],
  };
}
export function fateWilderlandOpeningHandsKept(s: GameState) {
  if (!s.fateWilderland || s.fateWilderland.initialized) return false;
  prepend(s, fx("wilderSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function fateWilderlandCheck(s: GameState) {
  if (s.fateWilderland?.urdugDestroyed && s.status === "playing") {
    win(s);
    s.reason =
      "Urdug is defeated. The Goblin army breaks, and Wilderland is saved.";
  }
}
export function fateWilderlandStats(s: GameState, u: Unit) {
  const q = s.fateWilderland;
  if (!q) return {};
  let attack = 0,
    defenseBonus = 0;
  for (const m of q.modifiers.filter((m) => m.id === u.id && stamps(s, m))) {
    attack += m.attack;
    defenseBonus += m.defense;
  }
  if (isHero(u))
    defenseBonus += allActiveLocations(s).filter(
      (l) => l.code === F.watchtower && !l.blanked,
    ).length;
  if (u.code === F.urdug && live(s, F.assault).length)
    defenseBonus += 2 * enemies(s).filter((e) => e.id !== u.id).length;
  const physicallyEngaged = allEngaged(s).some((e) => e.id === u.id),
    virtuallyEngaged =
      u.code === F.urdug &&
      fateWilderlandConsideredEngaged(s, u, activeSeat(s));
  if (goblin(u) && (physicallyEngaged || virtuallyEngaged)) {
    const n = allEngaged(s).filter(
      (e) =>
        e.id !== u.id &&
        e.code === F.troop &&
        !e.blanked &&
        (virtuallyEngaged || ownerOf(s, e) === ownerOf(s, u)),
    ).length;
    attack += n;
    defenseBonus += n;
  }
  return { attack, defense: defenseBonus };
}
export function fateWilderlandThreatBonus(s: GameState, u: Unit) {
  const q = s.fateWilderland;
  if (!q) return 0;
  // FAQ 1.55: encounter lasting effects recalculate as eligibility changes.
  const clouds =
    s.staging.some((v) => v.id === u.id) &&
    ["enemy", "location"].includes(card(u.code).type_code)
      ? q.darkClouds
          .filter((m) => stamps(s, m))
          .reduce((n, m) => n + m.count, 0)
      : 0;
  if (u.blanked) return clouds;
  if (u.code === F.hills) return clouds + maxCharacters(s);
  if (u.code === F.lonely)
    return (
      clouds +
      2 *
        q.storedCards
          .filter((g) => g.locationId === u.id)
          .reduce((n, g) => n + g.cards.length, 0)
    );
  return clouds;
}
export const fateWilderlandEngagementBonus = (s: GameState, u: Unit) =>
  !card(u.code).is_unique ? -5 * live(s, F.battlements).length : 0;
export const fateWilderlandConsideredEngaged = (
  s: GameState,
  u: Unit,
  p: number,
) =>
  !!s.fateWilderland &&
  u.code === F.urdug &&
  s.staging.some((e) => e.id === u.id) &&
  live(s, F.defense).some((d) => d.resources >= 5 * players(s)) &&
  playerOrder(s).includes(p);
export const fateWilderlandCannotLeave = (
  s: GameState,
  u: Unit,
  destruction = false,
) => !!s.fateWilderland && u.code === F.urdug && !u.blanked && !destruction;
export const fateWilderlandCannotEngage = (s: GameState, u: Unit) =>
  !!s.fateWilderland && u.code === F.urdug && !u.blanked;
export const fateWilderlandImmune = (s: GameState, u: Unit) =>
  !!s.fateWilderland && !u.blanked && [F.urdug, F.gate].includes(u.code);
export function fateWilderlandDamageAmount(
  s: GameState,
  u: Unit,
  n: number,
  _context: DamageContext,
) {
  const q = s.fateWilderland;
  if (!q) return n;
  if (q.preventDamage.some((m) => m.id === u.id && stamps(s, m))) return 0;
  if (
    u.code === F.urdug &&
    live(s, F.assault).length &&
    !(q.urdugAttack && stamps(s, q.urdugAttack))
  )
    return 0;
  return n;
}
export function fateWilderlandHostLeaves(
  s: GameState,
  u: Unit,
  destroyed = false,
) {
  const q = s.fateWilderland;
  if (!q) return;
  const stored = q.storedCards.filter((g) => g.locationId === u.id);
  q.storedCards = q.storedCards.filter((g) => g.locationId !== u.id);
  for (const g of stored)
    for (const physical of g.cards)
      forOwner(s, physical.owner ?? g.player, () => {
        s.discard.push(physical.code);
      });
  delete q.blankShadows[u.id];
  if (!destroyed || card(u.code).type_code !== "enemy") return;
  if (u.code === F.urdug && !u.blanked) {
    q.urdugDestroyed = true;
    return;
  }
  const d = defense(s);
  if (d && !d.blanked && canPlaceDefense(s))
    prepend(
      s,
      fx("wilderDefenseResponse", { source: d.id, player: firstPlayer(s) }),
    );
}
export function fateWilderlandCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !s.fateWilderland ||
    !s.combat ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  s.combat.wilderKilledCharacter = true;
}
export function fateWilderlandEngaged(s: GameState, u: Unit) {
  if (!s.fateWilderland) return;
  const player = ownerOf(s, u),
    effects: Effect[] = [];
  if (!u.blanked && u.code === F.elite)
    effects.push(fx("wilderElite", { target: u.id, player }));
  if (!u.blanked && u.code === F.vanguard)
    effects.push(fx("wilderVanguard", { target: u.id, player }));
  effects.push(
    ...live(s, F.stray)
      .filter((v) => v.id !== u.id)
      .map((v) => fx("wilderStray", { target: v.id, player })),
  );
  prepend(s, ...effects);
}
export function fateWilderlandShadowDealt(s: GameState, u: Unit, code: string) {
  if (!s.fateWilderland || u.blanked || card(code).shadow) return;
  if (u.code === F.wargs)
    s.fateWilderland.blankShadows[u.id] =
      (s.fateWilderland.blankShadows[u.id] ?? 0) + 1;
  if (u.code === F.rider)
    prepend(s, fx("wilderRider", { target: u.id, player: ownerOf(s, u) }));
}
export function fateWilderlandEnemyAttackStarted(
  s: GameState,
  u: Unit,
  player: number,
) {
  if (!s.fateWilderland) return;
  if (!u.blanked && u.code === F.urdug)
    prepend(s, fx("wilderUrdugBoost", { target: u.id, player }));
  if (!u.blanked && u.code === F.wargs) {
    const n = s.fateWilderland.blankShadows[u.id] ?? 0;
    delete s.fateWilderland.blankShadows[u.id];
    if (n)
      prepend(s, fx("wilderPackBegin", { target: u.id, value: n, player }));
  }
}
export function fateWilderlandAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  const q = s.fateWilderland;
  if (!q || skipped || !c.attackResolved) return [];
  const u = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  if (u?.code === F.urdug) q.urdugAttack = { round: s.round, phase: phase(s) };
  if (s.stage === 2 && !mainQuestUnit(s)?.blanked)
    effects.push(fx("wilderAssault", { value: 1, player: firstPlayer(s) }));
  if (c.wilderAssaultOnKill && c.wilderKilledCharacter)
    effects.push(
      fx("wilderAssault", {
        value: c.wilderAssaultOnKill,
        player: firstPlayer(s),
      }),
    );
  if (u && (c.wilderPackAttacks ?? 0) > 0) {
    // FAQ 1.42: an additional attack discards the previous attack's shadows.
    // Pack of Wargs replaces only the new deal, not this discard.
    s.encounterDiscard.push(...u.shadows);
    u.shadows = [];
    delete u.faceupShadows;
    delete u.revealedShadowCount;
    effects.push(
      ...Array.from({ length: c.wilderPackAttacks! }, () =>
        fx("immediateAttack", { target: u.id, player, noShadow: true }),
      ),
    );
  }
  if ((c as Combat).wilderDiscardAlly && c.wilderKilledCharacter)
    effects.push(
      ...Array.from({ length: c.wilderDiscardAlly! }, () =>
        fx("wilderDiscardAlly", { player }),
      ),
    );
  return effects;
}
export function fateWilderlandFailedQuest(s: GameState, _amount: number) {
  const q = s.fateWilderland;
  if (!q) return false;
  const n =
    (live(s, F.assault).length ? players(s) : 0) +
    q.darkClouds
      .filter((m) => stamps(s, m))
      .reduce((sum, m) => sum + m.count, 0);
  if (n) prepend(s, fx("wilderAssault", { value: n, player: firstPlayer(s) }));
  return false;
}
export function fateWilderlandExplored(
  s: GameState,
  u: Unit,
  _active: boolean,
) {
  fateWilderlandHostLeaves(s, u);
  if (u.blanked) return;
  if (u.code === F.battlements)
    prepend(
      s,
      fx("wilderBattlements", { count: players(s), player: firstPlayer(s) }),
    );
  if (
    u.code === F.watchtower &&
    (canPlaceDefense(s) || (assault(s)?.progress ?? 0) > 0)
  )
    prepend(
      s,
      fx("wilderWatchtowerResponse", { source: u.id, player: firstPlayer(s) }),
    );
}
function troopSearch(s: GameState): Option[] {
  return (["deck", "discard", "victory"] as const).flatMap((zone) => {
    const pile =
      zone === "deck"
        ? s.encounterDeck
        : zone === "discard"
          ? s.encounterDiscard
          : (s.victoryCards ?? []);
    return pile.flatMap((code, index) =>
      code === F.troop
        ? [
            {
              id: `${zone}-${index}`,
              code,
              label: `Goblin Troop · ${zone === "deck" ? "encounter deck" : zone === "discard" ? "discard pile" : "victory display"}`,
              effects: [
                fx("wilderGateTake", { code, value: index, text: zone }),
              ],
            },
          ]
        : [],
    );
  });
}
export const fateWilderlandTravelProblem = (s: GameState, u: Unit) =>
  u.code === F.gate && !u.blanked && !troopSearch(s).length
    ? "Gate of Gundabad requires a Goblin Troop in the encounter deck, discard pile, or victory display."
    : null;
export const fateWilderlandTravelEffects = (
  _s: GameState,
  u: Unit,
): Effect[] | undefined =>
  u.code === F.gate && !u.blanked ? [fx("wilderGate", {})] : undefined;
export function fateWilderlandEventPlayed(s: GameState, u: Unit) {
  if (s.fateWilderland && phase(s) === "quest" && live(s, F.lonely).length)
    prepend(
      s,
      fx("wilderCaptureEvent", { source: u.id, player: firstPlayer(s) }),
    );
}
export const fateWilderlandAbilityLabel = (code: string) =>
  code === F.hills
    ? "Exhaust a character · Lower Hills of Wilderland’s threat"
    : undefined;
export function fateWilderlandAbilityProblem(s: GameState, u: Unit) {
  if (u.code !== F.hills) return null;
  return u.blanked
    ? "This location’s text is blank."
    : phase(s) !== "quest"
      ? "Use this Quest Action during the quest phase."
      : activeSeat(s) !== firstPlayer(s)
        ? "Only the first player can trigger this Action."
        : !ready(s, firstPlayer(s)).length
          ? "Exhaust a ready character to pay this cost."
          : null;
}
export function fateWilderlandAbility(s: GameState, u: Unit) {
  if (u.code !== F.hills || fateWilderlandAbilityProblem(s, u)) return false;
  prepend(s, fx("wilderHills", { target: u.id, player: firstPlayer(s) }));
  return true;
}
const treacheries = [F.fierce, F.command, F.clouds, F.gloom, F.bats];
export function fateWilderlandEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.fateWilderland) return false;
  if (code === F.slopes && fromReveal) {
    choose(s, "Slopes of Gundabad · Choose", [
      assaultOption(),
      {
        id: "reveal",
        label: "Reveal an additional encounter card",
        effects: [fx("reveal", { player: firstPlayer(s) })],
      },
    ]);
    return true;
  }
  if (!treacheries.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const index = s.encounterDiscard.lastIndexOf(code);
    if (index >= 0) s.encounterDiscard.splice(index, 1);
  }
  s.fateWilderland.resolving.push(code);
  prepend(
    s,
    fx("wilderTreachery", { code, player: firstPlayer(s) }),
    fx("wilderTreacheryDone", { code, player: firstPlayer(s) }),
  );
  return true;
}
export function fateWilderlandShadow(s: GameState, code: string) {
  const c = s.combat as Combat | null;
  if (!s.fateWilderland || !c) return false;
  const u = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s),
    defender = get(s, c.defenderId ?? undefined);
  if (code === F.elite) prepend(s, fx("wilderExhaust", { player }));
  else if (code === F.vanguard && u)
    s.fateWilderland.modifiers.push({
      id: u.id,
      round: s.round,
      phase: phase(s),
      attack: 2,
      defense: 2,
    });
  else if (code === F.slopes && u)
    s.fateWilderland.preventDamage.push({
      id: u.id,
      round: s.round,
      phase: phase(s),
    });
  else if (code === F.fierce) c.attackBonus += s.stage;
  else if (code === F.command) {
    c.attackBonus++;
    c.wilderAssaultOnKill = (c.wilderAssaultOnKill ?? 0) + 1;
  } else if (code === F.clouds)
    prepend(s, fx("wilderDiscardAttachment", { player }));
  else if (code === F.troop) c.attackBonus += 2;
  else if (code === F.wargs) c.returnToStaging = true;
  else if (code === F.bats)
    c.attackBonus += defender?.attachments.length ? 2 : 1;
  else if (code === F.gloom) {
    c.attackBonus++;
    c.wilderDiscardAlly = (c.wilderDiscardAlly ?? 0) + 1;
  } else if (code === F.stray && u) {
    const index = u.shadows
      .slice(0, u.revealedShadowCount ?? 0)
      .lastIndexOf(code);
    if (index >= 0) {
      removeShadowCard(u, index);
      addEnemy(s, code);
    }
  } else return false;
  return true;
}
export const fateWilderlandSharedEffect = (e: Effect) =>
  [
    "wilderSetup",
    "wilderSetupDone",
    "wilderStage",
    "wilderFindEnemies",
    "wilderAssault",
    "wilderRoundEnd",
    "wilderRoundThreshold",
    "wilderBattlements",
    "wilderTreachery",
    "wilderTreacheryDone",
    "wilderGate",
    "wilderGateTake",
  ].includes(e.kind);

export function fateWilderlandEffect(s: GameState, e: Effect): boolean {
  if (!s.fateWilderland || !e.kind.startsWith("wilder")) return false;
  const q = s.fateWilderland,
    u = get(s, e.target),
    player = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "wilderSetup":
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        fx("wilderFindEnemies", { count: players(s), player }),
        fx("wilderSetupDone", { player }),
      );
      break;
    case "wilderSetupDone":
      q.initialized = true;
      break;
    case "wilderFindEnemies": {
      let remaining = e.count ?? players(s);
      while (remaining > 0 && s.encounterDeck.length) {
        const code = discardTop(s)!;
        if (card(code).type_code === "enemy") {
          takeDiscardedEnemy(s, code);
          remaining--;
        }
      }
      break;
    }
    case "wilderStage":
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        fx("wilderFindEnemies", { count: players(s), player }),
        fx("stageRevealed", { player }),
      );
      break;
    case "wilderAssault":
      placeAssault(s, e.value ?? 1);
      break;
    case "wilderRoundEnd": {
      q.blankShadows = {};
      q.modifiers = [];
      q.preventDamage = [];
      q.darkClouds = [];
      delete q.urdugAttack;
      if (!mainQuestUnit(s)?.blanked && [1, 3].includes(s.stage))
        placeAssault(
          s,
          enemies(s).filter(
            (enemy) =>
              s.stage === 3 || s.staging.some((u) => u.id === enemy.id),
          ).length,
        );
      prepend(s, fx("wilderRoundThreshold", { value: s.stage, player }));
      break;
    }
    case "wilderRoundThreshold": {
      if (s.stage !== e.value || mainQuestUnit(s)?.blanked) break;
      const limit =
        (s.stage === 1 ? 2 : s.stage === 2 ? 4 : 8) * (1 + players(s));
      if ((assault(s)?.progress ?? 0) < limit) break;
      if (s.stage === 3) {
        s.status = "lost";
        s.reason =
          "The Goblins’ Assault overwhelms the heroes. Wilderland falls to Urdug.";
        s.queue = [];
        s.choice = null;
        if (s.flow) s.flow.pending = null;
        log(s, s.reason, "danger");
      } else {
        discardQuestAttachments(s, q.currentQuest);
        s.stage = (s.stage + 1) as 2 | 3;
        q.currentQuest = s.stage === 2 ? F.second : F.third;
        s.progress = 0;
        s.stageRevealing = true;
        prepend(s, fx("wilderStage", { player: firstPlayer(s) }));
        log(
          s,
          `${s.stage === 2 ? "Outflanked" : "The Final Push"} · The Goblin assault intensifies.`,
          "chapter",
        );
      }
      break;
    }
    case "wilderDefenseResponse":
      if (
        get(s, e.source)?.code === F.defense &&
        !get(s, e.source)?.blanked &&
        canPlaceDefense(s)
      )
        choosePlayerResponse(
          s,
          e.source!,
          F.defense,
          "The Heroes’ Defense · An enemy was destroyed",
          [
            {
              id: "resource",
              label: "Place 1 resource on The Heroes’ Defense",
              effects: [fx("wilderDefense", { player })],
            },
            skip,
          ],
        );
      break;
    case "wilderDefense":
      placeDefense(s);
      break;
    case "wilderWatchtowerResponse": {
      const options: Option[] = [];
      if (canPlaceDefense(s))
        options.push({
          id: "resource",
          label: "Place 1 resource on The Heroes’ Defense",
          effects: [fx("wilderDefense", { player })],
        });
      if ((assault(s)?.progress ?? 0) > 0)
        options.push({
          id: "remove",
          label: "Remove 1 progress from The Goblins’ Assault",
          effects: [fx("wilderRemoveAssault", { player })],
        });
      if (options.length)
        choosePlayerResponse(
          s,
          e.source!,
          F.watchtower,
          "Dwarven Watchtower · Explored response",
          [...options, skip],
        );
      break;
    }
    case "wilderRemoveAssault":
      if (assault(s))
        assault(s)!.progress = Math.max(0, assault(s)!.progress - 1);
      break;
    case "wilderElite":
      choose(s, "Urdug’s Elite · Choose", [
        ...(ready(s, player).length
          ? [
              {
                id: "exhaust",
                label: "Exhaust a character you control",
                effects: [fx("wilderExhaust", { player })],
              },
            ]
          : []),
        assaultOption(),
      ]);
      break;
    case "wilderVanguard":
      choose(s, "Fierce Vanguard · Choose", [
        ...(u
          ? [
              {
                id: "attack",
                label:
                  "Fierce Vanguard gets +2 attack until the end of the round",
                effects: [fx("wilderVanguardBoost", { target: u.id, player })],
              },
            ]
          : []),
        assaultOption(),
      ]);
      break;
    case "wilderVanguardBoost":
      if (u)
        q.modifiers.push({ id: u.id, round: s.round, attack: 2, defense: 0 });
      break;
    case "wilderRider":
      if (u)
        choose(s, "Warg-rider · A shadow card has no effect", [
          ...(allEngaged(s).some((v) => v.id === u.id)
            ? [
                {
                  id: "return",
                  label: "Return Warg-rider to the staging area",
                  effects: [fx("wilderReturn", { target: u.id, player })],
                },
              ]
            : []),
          assaultOption(),
        ]);
      break;
    case "wilderReturn":
      if (u) returnEnemy(s, u);
      break;
    case "wilderStray":
      if (u && s.staging.some((v) => v.id === u.id)) engage(s, u, false);
      break;
    case "wilderExhaust":
      choose(
        s,
        "Exhaust a character you control",
        ready(s, player).map((c) => ({
          id: c.id,
          label: name(c),
          code: c.code,
          effects: [fx("exhaust", { target: c.id, player })],
        })),
      );
      break;
    case "wilderUrdugBoost": {
      const code = discardTop(s);
      const combat = s.combat;
      if (code && combat && combat.enemyId === e.target) {
        const n = card(code).threat ?? 0;
        combat.attackBonus += n;
        log(
          s,
          `Urdug discards ${card(code).name} and gains +${n} attack for this attack.`,
          "danger",
        );
      }
      break;
    }
    case "wilderPackBegin": {
      const combat = s.combat;
      if (combat && combat.enemyId === e.target)
        combat.wilderPackAttacks =
          (combat.wilderPackAttacks ?? 0) + (e.value ?? 1);
      break;
    }
    case "wilderBattlements":
      for (let n = 0; n < (e.count ?? 0); n++) {
        const code = discardTop(s);
        if (!code) break;
        if (card(code).type_code === "enemy") takeDiscardedEnemy(s, code);
      }
      break;
    case "wilderGate":
      choose(s, "Gate of Gundabad · Find a Goblin Troop", troopSearch(s));
      break;
    case "wilderGateTake": {
      const pile =
        e.text === "deck"
          ? s.encounterDeck
          : e.text === "discard"
            ? s.encounterDiscard
            : (s.victoryCards ?? []);
      if (e.value !== undefined && pile[e.value] === F.troop) {
        pile.splice(e.value, 1);
        if (e.text === "victory")
          s.victory = Math.max(0, s.victory - (card(F.troop).victory ?? 0));
        addEnemy(s, F.troop);
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "wilderHills":
      if (u)
        choose(
          s,
          "Hills of Wilderland · Exhaust a character",
          ready(s, firstPlayer(s)).map((c) => ({
            id: c.id,
            label: name(c),
            code: c.code,
            effects: [
              fx("wilderHillsPay", {
                target: c.id,
                source: u.id,
                player: firstPlayer(s),
              }),
            ],
          })),
        );
      break;
    case "wilderHillsPay": {
      const location = get(s, e.source);
      if (
        u &&
        location &&
        ready(s, firstPlayer(s)).some((c) => c.id === u.id) &&
        exhaustCharacter(s, u)
      )
        location.tempThreat = (location.tempThreat ?? 0) - 1;
      break;
    }
    case "wilderCaptureEvent": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source),
        lands = live(s, F.lonely);
      if (event && lands.length)
        choose(
          s,
          "Lonely Lands · Place the event facedown under a location",
          lands.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("wilderCaptureEventTake", {
                target: l.id,
                source: event.unit.id,
                player: event.player,
              }),
            ],
          })),
        );
      break;
    }
    case "wilderCaptureEventTake": {
      const event = s.resolvingEvents?.find((v) => v.unit.id === e.source);
      if (u && u.code === F.lonely && event && event.destination !== "spent") {
        event.destination = "spent";
        q.storedCards.push({
          locationId: u.id,
          player: event.player,
          cards: [event.unit],
        });
      }
      break;
    }
    case "wilderTreachery":
      if (e.code === F.fierce) placeAssault(s, s.stage);
      else if (e.code === F.command && urdug(s))
        prepend(
          s,
          fx("immediateAttack", {
            target: urdug(s)!.id,
            player: firstPlayer(s),
            text: "wilder-command",
          }),
        );
      else if (e.code === F.clouds) {
        q.darkClouds.push({ round: s.round, phase: phase(s), count: 1 });
      } else if (e.code === F.gloom)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("wilderGloom", { player })),
        );
      else if (e.code === F.bats) {
        for (const p of playerOrder(s))
          forOwner(s, p, () => {
            let n = 0;
            for (const h of s.heroes) {
              n += h.resources;
              h.resources = 0;
            }
            prepend(s, fx("wilderThreat", { value: n, player: p }));
          });
      }
      break;
    case "wilderTreacheryDone": {
      const index = q.resolving.lastIndexOf(e.code!);
      if (index >= 0) {
        q.resolving.splice(index, 1);
        s.encounterDiscard.push(e.code!);
      }
      break;
    }
    case "wilderGloom":
      choose(s, `Gathering Gloom · ${seatName(s, player)}`, [
        {
          id: "threat",
          label: `Raise your threat by ${own(s, player).filter(isAlly).length}`,
          effects: [
            fx("wilderThreat", {
              value: own(s, player).filter(isAlly).length,
              player,
            }),
          ],
        },
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player })],
        },
      ]);
      break;
    case "wilderThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "wilderDiscardAlly":
      choose(
        s,
        "Gathering Gloom shadow · Discard an ally you control",
        own(s, player)
          .filter(isAlly)
          .map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [fx("wilderDiscardAllyTake", { target: c.id, player })],
          })),
      );
      break;
    case "wilderDiscardAllyTake":
      if (u && isAlly(u) && ownerOf(s, u) === player) discardCharacter(s, u);
      break;
    case "wilderDiscardAttachment": {
      const hosts = [
        ...new Map(
          [
            ...allCharacters(s),
            ...allEngaged(s),
            ...s.staging,
            ...allActiveLocations(s),
            ...allQuestUnits(s),
            ...playerOrder(s).map((p) => get(s, `threat:${p}`)!),
          ]
            .filter(Boolean)
            .map((host) => [host.id, host]),
        ).values(),
      ];
      choose(
        s,
        "Dark Clouds shadow · Discard a non-objective attachment you control",
        hosts.flatMap((host) =>
          host.attachments
            .filter(
              (a) =>
                card(a.code).type_code !== "objective" &&
                !/\bPermanent\b/.test(card(a.code).text ?? "") &&
                (host.id.startsWith("threat:")
                  ? (a.controller ?? a.owner ?? Number(host.id.slice(7)))
                  : attachmentController(s, host, a)) === player,
            )
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `${card(a.code).name} on ${host.id.startsWith("threat:") ? `${seatName(s, Number(host.id.slice(7)))}’s threat dial` : name(host)}`,
              effects: [
                fx("wilderDiscardAttachmentTake", {
                  target: host.id,
                  source: a.id,
                  player,
                }),
              ],
            })),
        ),
      );
      break;
    }
    case "wilderDiscardAttachmentTake": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a && card(a.code).type_code !== "objective") {
        if (u.id.startsWith("threat:")) {
          forOwner(s, Number(u.id.slice(7)), () => {
            s.threatAttachments = s.threatAttachments?.filter(
              (v) => v.id !== a.id,
            );
          });
          seatView(s, a.owner ?? player).discard.push(a.code);
          log(s, `${card(a.code).name} is discarded from the threat dial.`);
        } else discardAttachment(s, u, a);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

export const FATE_WILDERLAND_HOOKS: Batch4ScenarioHooks = {
  setup: setupFateWilderland,
  openingHandsKept: fateWilderlandOpeningHandsKept,
  check: fateWilderlandCheck,
  advance: (s) => !!s.fateWilderland,
  stageInfo: fateWilderlandStageInfo,
  stats: fateWilderlandStats,
  threatBonus: fateWilderlandThreatBonus,
  engagementBonus: fateWilderlandEngagementBonus,
  locationQuestBonus: (s, u) =>
    u.code === F.hills && !u.blanked ? maxCharacters(s) : 0,
  consideredEngaged: fateWilderlandConsideredEngaged,
  cannotLeave: fateWilderlandCannotLeave,
  cannotEngage: fateWilderlandCannotEngage,
  cannotOptionallyEngage: (s, u) =>
    !u.blanked && (u.code === F.stray || fateWilderlandCannotEngage(s, u)),
  cannotAttach: (_s, u, code) =>
    u.code === F.troop && !u.blanked && card(code).sphere_code !== "encounter",
  immune: fateWilderlandImmune,
  damageAmount: fateWilderlandDamageAmount,
  hostLeaves: fateWilderlandHostLeaves,
  characterDestroyed: fateWilderlandCharacterDestroyed,
  engaged: fateWilderlandEngaged,
  shadowDealt: fateWilderlandShadowDealt,
  enemyAttackStarted: fateWilderlandEnemyAttackStarted,
  attackFinished: fateWilderlandAttackFinished,
  failedQuest: fateWilderlandFailedQuest,
  roundEnd: (s) => [fx("wilderRoundEnd", { player: firstPlayer(s) })],
  explored: fateWilderlandExplored,
  travelEffects: fateWilderlandTravelEffects,
  travelProblem: fateWilderlandTravelProblem,
  eventPlayed: fateWilderlandEventPlayed,
  abilityLabel: fateWilderlandAbilityLabel,
  abilityProblem: fateWilderlandAbilityProblem,
  ability: fateWilderlandAbility,
  encounter: fateWilderlandEncounter,
  shadow: fateWilderlandShadow,
  revealedSurge: (s, code) =>
    code === F.bats &&
    allCharacters(s)
      .filter(isHero)
      .every((h) => h.resources === 0),
  effect: fateWilderlandEffect,
  sharedEffect: fateWilderlandSharedEffect,
};
