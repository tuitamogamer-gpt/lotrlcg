import type { Attachment, Effect, GameState, Option, Unit } from "./types";
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
  random,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  removeFromQuest,
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
  seatView,
} from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { surgeEffects } from "./surge";
import { resolveDoomed } from "./voice-isengard";
import { isAlly, unitType } from "./card-types";
import { reduceThreat } from "./threat-reduction";
import { choosePlayerResponse } from "./player-ability-triggers";
import { dealEnemyShadows } from "./considered-engagement";
import {
  DANGER_DORWINION as D,
  DANGER_DORWINION_ENCOUNTERS,
  DANGER_DORWINION_RECIPES,
  dangerDorwinionCultists,
  dangerDorwinionPlots,
  dangerDorwinionPhase as phase,
  dangerDorwinionPlayers as players,
  dangerDorwinionStageInfo,
} from "./danger-dorwinion-support";
export * from "./danger-dorwinion-support";

type Combat = NonNullable<GameState["combat"]>;
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) =>
    ["enemy", "ship-enemy"].includes(unitType(u)),
  );
const stageLive = (s: GameState, stage: number) =>
  !!s.dangerDorwinion && s.stage === stage && !mainQuestUnit(s)?.blanked;
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const secret = (u: Unit) =>
  u.attachments.some((a) => a.code === D.secret && !a.blanked && !a.facedown);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.choice = null;
  s.queue = [];
  if (s.flow) s.flow.pending = null;
  log(s, reason, "danger");
}
function order(s: GameState, effects: Effect[], title: string) {
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", { effects, text: title, player: firstPlayer(s) }),
    );
  else prepend(s, ...effects);
}
function add(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") {
    enemyAddedToStaging(s, u);
    if (player !== undefined) forOwner(s, player, () => engage(s, u));
  }
  dangerDorwinionCardEntered(s, u, false, false);
  return u;
}
function findDiscard(s: GameState, predicate: (code: string) => boolean) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (predicate(code)) return code;
    s.encounterDiscard.push(code);
  }
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function resource(s: GameState) {
  if (!s.dangerDorwinion) return;
  s.dangerDorwinion.resources++;
  log(
    s,
    `The investigation gains 1 resource (${s.dangerDorwinion.resources}).`,
    "good",
  );
}
function evidenceFreed(s: GameState, clue: Unit) {
  s.staging = s.staging.filter((u) => u.id !== clue.id);
  for (const a of [...clue.attachments]) discardAttachment(s, clue, a, true);
  addVictoryCard(s, clue.code);
  resource(s);
}
function transferEnemy(s: GameState, u: Unit, player: number) {
  if (seatView(s, player).engaged.some((e) => e.id === u.id)) return;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((e) => e.id !== u.id);
    });
  s.staging = s.staging.filter((e) => e.id !== u.id);
  // engage() preserves the actual enemy instance and all its attachments.
  s.staging.push(u);
  forOwner(s, player, () => engage(s, u));
}
export function setupDangerDorwinion(s: GameState) {
  const r = DANGER_DORWINION_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.dangerDorwinion = {
    initialized: false,
    currentQuest: D.first,
    resources: 0,
    cultistDefeated: false,
    setAside: r.cards
      .filter((r) =>
        ["sharedEncounterDeck2", "sharedEncounterDeck3"].includes(r.section),
      )
      .flatMap((r) =>
        Array.from({ length: r.quantity }, () => make(s, r.code)),
      ),
    looked: [],
    storedCards: [],
    resolving: [],
    resolvingTreacheries: [],
    cultistDamage: { round: s.round, amount: 0 },
    threatRaised: {},
    servantAttacks: {},
    prevented: [],
    overwhelmed: [],
    manorReduction: { round: s.round, players: {} },
    secretCultists: [],
  };
}
export function dangerDorwinionOpeningHandsKept(s: GameState) {
  if (!s.dangerDorwinion || s.dangerDorwinion.initialized) return false;
  prepend(
    s,
    fx("dorSetupLocation", { value: 0, ids: [], player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function dangerDorwinionCheck(s: GameState) {
  const q = s.dangerDorwinion;
  if (!q) return;
  if (q.cultistDefeated && s.status === "playing") {
    win(s);
    s.reason =
      "The leader of the cult is defeated. Dorwinion is free of its hidden enemy.";
    return;
  }
  for (const clue of live(s, D.evidence))
    if (
      !enemies(s).some((u) => u.guarding === clue.id) &&
      !s.queue.some(
        (e) =>
          ["guardObjective", "dorGuardEvidence"].includes(e.kind) &&
          e.target === clue.id,
      )
    )
      evidenceFreed(s, clue);
  for (const guard of q.secretCultists) {
    const u = get(s, guard.id);
    if (
      u &&
      s.table?.seats[guard.owner]?.eliminated &&
      !s.queue.some((e) => e.kind === "dorDiscardSecret" && e.target === u.id)
    )
      prepend(
        s,
        fx("dorDiscardSecret", { target: u.id, player: firstPlayer(s) }),
      );
  }
  for (const g of q.storedCards.filter((g) => !get(s, g.locationId))) {
    s.encounterDiscard.push(...g.cards.map((u) => u.code));
    q.storedCards = q.storedCards.filter((x) => x !== g);
  }
  for (const u of enemies(s).filter(
    (u) => u.code === D.servant && !u.blanked,
  )) {
    if (
      !seatView(s, firstPlayer(s)).engaged.some((e) => e.id === u.id) &&
      !s.queue.some((e) => e.kind === "dorFollowFirst" && e.target === u.id)
    )
      prepend(
        s,
        fx("dorFollowFirst", { target: u.id, player: firstPlayer(s) }),
      );
  }
}
export function dangerDorwinionAdvance(s: GameState) {
  const q = s.dangerDorwinion;
  if (!q) return false;
  if (
    !q.initialized ||
    s.stage === 3 ||
    s.progress < (dangerDorwinionStageInfo(s)?.quest ?? 0)
  )
    return true;
  if (
    !mainQuestUnit(s)?.blanked &&
    q.resources < (s.stage === 1 ? 2 : 3 + players(s))
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  discardQuestAttachments(s, q.currentQuest);
  s.stage = s.stage === 1 ? 2 : 3;
  q.currentQuest = s.stage === 2 ? D.second : D.third;
  q.resources = 0;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(s, fx("dorStage", { player: firstPlayer(s) }));
  log(
    s,
    `${dangerDorwinionStageInfo(s)!.name} · The investigation advances.`,
    "chapter",
  );
  return true;
}
export function dangerDorwinionStats(s: GameState, u: Unit) {
  if (!s.dangerDorwinion) return {};
  const guarded =
    !!u.guarding && live(s, D.evidence).some((g) => g.id === u.guarding);
  let attack = guarded ? 1 : 0,
    defense = guarded ? 1 : 0;
  if (u.code === D.easterling && !u.blanked) {
    attack += Math.min(3, u.resources);
    defense += Math.min(3, u.resources);
  }
  if (unitType(u) === "enemy" && !card(u.code).is_unique)
    attack += live(s, D.submit).length;
  return { attack, defense };
}
export function dangerDorwinionThreatBonus(s: GameState, u: Unit) {
  if (!s.dangerDorwinion) return 0;
  return (
    (u.code === D.forum && !u.blanked ? u.resources : 0) +
    (u.guarding && live(s, D.evidence).some((g) => g.id === u.guarding)
      ? 1
      : 0) +
    (card(u.code).type_code === "location" &&
    s.staging.some((l) => l.id === u.id)
      ? live(s, D.unwelcome).length
      : 0)
  );
}
export const dangerDorwinionStagingThreat = (s: GameState) =>
  live(s, D.bribes).reduce((n, u) => n + u.resources, 0);
export const dangerDorwinionImmune = (s: GameState, u: Unit) =>
  !!s.dangerDorwinion &&
  !u.blanked &&
  [D.tavern, ...dangerDorwinionCultists].includes(u.code);
export const dangerDorwinionCannotOptionallyEngage = (s: GameState, u: Unit) =>
  !!s.dangerDorwinion && u.code === D.priest && !u.blanked;
export const dangerDorwinionCharacterBlanked = (s: GameState, u: Unit) =>
  !!s.dangerDorwinion && secret(u);
export const dangerDorwinionLocationProgressBlocked = (s: GameState, u: Unit) =>
  !!s.dangerDorwinion &&
  u.code !== D.street &&
  s.staging.some((x) => x.id === u.id) &&
  live(s, D.street).length > 0;
export function dangerDorwinionThreatReduction(
  s: GameState,
  amount: number,
  reason?: string,
) {
  const q = s.dangerDorwinion;
  if (!q || reason !== "player-card") return amount;
  if (q.manorReduction.round !== s.round)
    q.manorReduction = { round: s.round, players: {} };
  const p = activeSeat(s),
    n = Math.max(
      0,
      Math.min(
        amount,
        s.threat,
        live(s, D.manor).length
          ? 1 - (q.manorReduction.players[p] ?? 0)
          : Infinity,
      ),
    );
  q.manorReduction.players[p] = (q.manorReduction.players[p] ?? 0) + n;
  return n;
}
export function dangerDorwinionThreatRaised(
  s: GameState,
  player: number,
  amount: number,
) {
  const q = s.dangerDorwinion;
  if (!q || amount <= 0) return;
  q.threatRaised[player] = s.round;
  const effects: Effect[] = [];
  for (const u of seatView(s, player).engaged.filter((u) => !u.blanked)) {
    if (u.code === D.easterling)
      effects.push(fx("dorEasterlingResource", { target: u.id, player }));
    if (
      u.code === D.servant &&
      !(
        q.servantAttacks[u.id]?.round === s.round &&
        q.servantAttacks[u.id]?.phase === phase(s)
      )
    ) {
      q.servantAttacks[u.id] = { round: s.round, phase: phase(s) };
      effects.push(fx("immediateAttack", { target: u.id, player }));
    }
  }
  order(s, effects, "Threat raised · Choose the next Forced effect");
}
export function dangerDorwinionDamageAmount(
  s: GameState,
  u: Unit,
  n: number,
  _context: DamageContext,
) {
  const q = s.dangerDorwinion;
  if (!q) return n;
  if (q.prevented.some((p) => p.id === u.id && p.round === s.round)) return 0;
  if (unitType(u) === "enemy") {
    if (s.staging.some((e) => e.id === u.id) && live(s, D.catacombs).length)
      return 0;
    if (
      q.overwhelmed.some(
        (p) =>
          p.round === s.round &&
          seatView(s, p.player).engaged.some((e) => e.id === u.id),
      )
    )
      return 0;
  }
  if (stageLive(s, 3) && dangerDorwinionCultists.includes(u.code)) {
    const limit = Math.max(
      0,
      ...allActiveLocations(s).map((l) => card(l.code).quest ?? 0),
    );
    return Math.min(
      n,
      Math.max(
        0,
        limit -
          (q.cultistDamage.round === s.round ? q.cultistDamage.amount : 0),
      ),
    );
  }
  return n;
}
export function dangerDorwinionDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
) {
  const q = s.dangerDorwinion;
  if (q && stageLive(s, 3) && dangerDorwinionCultists.includes(u.code)) {
    if (q.cultistDamage.round !== s.round)
      q.cultistDamage = { round: s.round, amount: 0 };
    q.cultistDamage.amount += amount;
  }
}
export function dangerDorwinionHostLeaves(
  s: GameState,
  u: Unit,
  destroyed = false,
) {
  const q = s.dangerDorwinion;
  if (!q) return;
  if (destroyed && stageLive(s, 3) && dangerDorwinionCultists.includes(u.code))
    q.cultistDefeated = true;
  if (u.guarding) {
    const clue = live(s, D.evidence).find((g) => g.id === u.guarding);
    if (clue) evidenceFreed(s, clue);
    delete u.guarding;
  }
  delete q.servantAttacks[u.id];
}
export function dangerDorwinionEnemyDestination(s: GameState, u: Unit) {
  const q = s.dangerDorwinion;
  const saved = q?.secretCultists.find((x) => x.id === u.id);
  if (!q || !saved) return false;
  seatView(s, saved.owner).discard.push(u.code);
  q.secretCultists = q.secretCultists.filter((x) => x.id !== u.id);
  return true;
}
export function dangerDorwinionAttachmentLeaves(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving = false,
) {
  if (!s.dangerDorwinion || a.code !== D.secret) return false;
  s.encounterDiscard.push(a.code);
  if (!leaving) discardSecret(s, u);
  return true;
}
function discardSecret(s: GameState, u: Unit) {
  const q = s.dangerDorwinion!;
  const record = q.secretCultists.find((r) => r.id === u.id);
  if (!record) return;
  // This mandatory discard is atomic: removing the Condition cannot leave a
  // printed ally stranded in an enemy zone at a save/decision boundary.
  const ps = s.table ? s.table.seats.map((_, p) => p) : [0];
  for (const p of ps) {
    // Mutate the physical zone arrays without selecting an eliminated seat:
    // forOwner restores a living seat during an elimination transaction.
    const seat = seatView(s, p);
    seat.engaged.splice(
      0,
      seat.engaged.length,
      ...seat.engaged.filter((c) => c.id !== u.id),
    );
    seat.allies.splice(
      0,
      seat.allies.length,
      ...seat.allies.filter((c) => c.id !== u.id),
    );
  }
  s.staging = s.staging.filter((c) => c.id !== u.id);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  seatView(s, record.owner).discard.push(u.code);
  q.secretCultists = q.secretCultists.filter((r) => r.id !== u.id);
}
export function dangerDorwinionPlayerEliminated(s: GameState, player: number) {
  if (!s.dangerDorwinion) return;
  for (const r of [...s.dangerDorwinion.secretCultists].filter(
    (r) => r.owner === player,
  )) {
    const u = get(s, r.id);
    if (u) discardSecret(s, u);
  }
}
export function dangerDorwinionCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !s.dangerDorwinion ||
    !s.combat ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId
  )
    return;
  if (["hero", "ally", "objective-ally"].includes(unitType(u)))
    s.combat.dorwinionKilledCharacter = true;
  if (isAlly(u)) s.combat.dorwinionKilledAlly = true;
}
export function dangerDorwinionAttackFinished(
  s: GameState,
  c: Combat,
  skipped = false,
) {
  if (!s.dangerDorwinion || skipped || !c.attackResolved) return [];
  const effects: Effect[] = [],
    p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId);
  if (c.dorwinionKilledCharacter) {
    effects.push(
      ...live(s, D.submit).map((u) =>
        fx("dorSubmit", { target: u.id, player: firstPlayer(s) }),
      ),
    );
    for (let i = 0; i < (c.dorwinionUnderGuard ?? 0); i++)
      effects.push(fx("dorTravelAgain", { player: p }));
  }
  if (c.dorwinionKilledAlly && enemy?.code === D.priest && !enemy.blanked)
    effects.push(
      ...playerOrder(s).map((player) => fx("dorThreat", { value: 2, player })),
    );
  return effects;
}
export function dangerDorwinionEngaged(s: GameState, u: Unit) {
  if (!s.dangerDorwinion) return;
  const p = ownerOf(s, u),
    effects: Effect[] = [];
  if (u.code === D.backstabber && !u.blanked)
    effects.push(fx("dorBackstabber", { target: u.id, player: p }));
  effects.push(
    ...live(s, D.fear).map(() => fx("dorThreat", { value: 1, player: p })),
  );
  order(s, effects, "Enemy engaged · Choose the next Forced effect");
}
export function dangerDorwinionCardEntered(
  s: GameState,
  u: Unit,
  _fromReveal: boolean,
  _cancelled: boolean,
) {
  if (s.dangerDorwinion && u.code === D.servant && !u.blanked)
    prepend(s, fx("dorFollowFirst", { target: u.id, player: firstPlayer(s) }));
}
export function dangerDorwinionRevealed(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"],
) {
  if (
    !s.dangerDorwinion ||
    origin !== "encounter" ||
    card(code).type_code !== "location"
  )
    return;
  prepend(
    s,
    ...enemies(s)
      .filter((u) => u.code === D.governor && !u.blanked)
      .map((u) => fx("dorGovernor", { target: u.id, player: firstPlayer(s) })),
  );
}
export function dangerDorwinionExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  const q = s.dangerDorwinion;
  if (!q) return;
  const effects: Effect[] = [];
  for (const l of live(s, D.forum))
    effects.push(
      fx("dorForumResource", { target: l.id, player: firstPlayer(s) }),
    );
  if (u.code === D.tavern && !u.blanked) {
    const groups = q.storedCards.filter((g) => g.locationId === u.id);
    q.storedCards = q.storedCards.filter((g) => g.locationId !== u.id);
    for (const g of groups)
      for (const c of g.cards) {
        q.resolving.push(c);
        effects.push(
          fx("dorRevealStored", { source: c.id, player: firstPlayer(s) }),
        );
      }
  }
  if (wasActive) {
    for (const b of live(s, D.bribes))
      effects.push(
        fx("dorBribes", {
          target: b.id,
          value: threatOf(s, u),
          player: firstPlayer(s),
        }),
      );
    if (stageLive(s, 1))
      effects.push(fx("dorResource", { player: firstPlayer(s) }));
    if (stageLive(s, 2))
      effects.push(fx("dorExploreStageTwo", { player: firstPlayer(s) }));
  }
  order(s, effects, "Location explored · Choose the next Forced effect");
}
export function dangerDorwinionTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!s.dangerDorwinion || u.blanked) return undefined;
  const player = firstPlayer(s);
  if (u.code === D.forum)
    return playerOrder(s).map((p) =>
      fx("dorThreat", { value: u.resources, player: p }),
    );
  if (u.code === D.tavern) return [fx("dorTavern", { target: u.id, player })];
  if (u.code === D.manor)
    return playerOrder(s).map((p) => fx("dorRandomDiscard", { player: p }));
  if (u.code === D.catacombs)
    return playerOrder(s).map((p) => fx("dorCatacombs", { player: p }));
  if (u.code === D.street) return [fx("dorStreet", { player })];
  return undefined;
}
export function dangerDorwinionSideQuestChosen(s: GameState, u: Unit) {
  if (s.dangerDorwinion && u.code === D.unwelcome && !u.blanked)
    prepend(s, fx("dorUnwelcome", { player: firstPlayer(s) }));
}
export function dangerDorwinionSideDefeated(s: GameState, u: Unit) {
  if (s.dangerDorwinion && u.code === D.fear && !u.blanked)
    prepend(s, fx("dorFearResponse", { source: u.id, player: firstPlayer(s) }));
}
export const dangerDorwinionRoundEnd = (s: GameState): Effect[] =>
  s.dangerDorwinion
    ? live(s, D.worship).map((u) =>
        fx("dorWorship", { target: u.id, player: firstPlayer(s) }),
      )
    : [];
export const dangerDorwinionUsesExistingShadows = (s: GameState, u: Unit) =>
  !!s.dangerDorwinion && u.code === D.black && !u.blanked;
export const dangerDorwinionCannotDiscardShadow = (
  s: GameState,
  u: Unit,
  code: string,
) => dangerDorwinionUsesExistingShadows(s, u) && !!card(code).shadow;
export function dangerDorwinionImmediateShadows(
  s: GameState,
  u: Unit,
  noDeal = false,
) {
  if (!dangerDorwinionUsesExistingShadows(s, u)) return false;
  if (!noDeal) dealEnemyShadows(s, u);
  u.revealedShadowCount = u.faceupShadows?.filter(Boolean).length ?? 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
export function dangerDorwinionBeginShadows(s: GameState, u: Unit) {
  if (!dangerDorwinionUsesExistingShadows(s, u)) return false;
  u.revealedShadowCount = u.faceupShadows?.filter(Boolean).length ?? 0;
  return true;
}
export function dangerDorwinionEnemyAttackStarted(
  s: GameState,
  u: Unit,
  player: number,
) {
  if (!dangerDorwinionUsesExistingShadows(s, u)) return;
  prepend(
    s,
    ...u.shadows
      .filter((_, i) => u.faceupShadows?.[i])
      .flatMap((code) => [
        fx("shadowResponse", { code, player, shadowEnemyId: u.id }),
        fx("shadowResolved", {
          code,
          source: u.id,
          flag: true,
          player,
          shadowEnemyId: u.id,
        }),
      ]),
  );
}
export function dangerDorwinionShadowResolved(
  s: GameState,
  u: Unit,
  _code: string,
) {
  if (!dangerDorwinionUsesExistingShadows(s, u)) return;
  u.faceupShadows = u.shadows.map(
    (_, i) => i < (u.revealedShadowCount ?? 0) || !!u.faceupShadows?.[i],
  );
}
export function dangerDorwinionFinishShadows(s: GameState, u: Unit) {
  if (!dangerDorwinionUsesExistingShadows(s, u)) return false;
  const kept = u.shadows
    .map((code, i) => ({
      code,
      faceup: !!u.faceupShadows?.[i] || i < (u.revealedShadowCount ?? 0),
    }))
    .filter((v) => {
      if (card(v.code).shadow) return true;
      s.encounterDiscard.push(v.code);
      return false;
    });
  u.shadows = kept.map((v) => v.code);
  u.faceupShadows = kept.map((v) => v.faceup);
  u.revealedShadowCount = kept.filter((v) => v.faceup).length;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  return true;
}
export const dangerDorwinionCombatEndShadows = dangerDorwinionFinishShadows;
export function dangerDorwinionShadow(s: GameState, code: string) {
  if (!s.dangerDorwinion || !s.combat) return false;
  const c = s.combat,
    player = c.attackPlayer ?? activeSeat(s);
  if (code === D.darkness)
    c.attackBonus += s.dangerDorwinion.threatRaised[player] === s.round ? 2 : 1;
  else if (code === D.overwhelmed)
    prepend(s, fx("dorOverwhelmedShadow", { target: c.enemyId, player }));
  else if (code === D.backstabber)
    prepend(
      s,
      fx("dorThreat", { value: seatView(s, player).engaged.length, player }),
    );
  else if (code === D.guard)
    c.dorwinionUnderGuard = (c.dorwinionUnderGuard ?? 0) + 1;
  else if (code === D.messenger) c.attackBonus++;
  else if (code === D.disappearances)
    prepend(s, fx("dorDiscardAttachment", { player }));
  else return false;
  return true;
}
export function dangerDorwinionEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.dangerDorwinion;
  if (!q || !DANGER_DORWINION_ENCOUNTERS.some((c) => c.code === code))
    return false;
  if (!fromReveal) return true;
  if (card(code).type_code === "treachery") {
    if (!replay) q.resolvingTreacheries.push(code);
    prepend(
      s,
      fx("dorTreachery", { code, player: firstPlayer(s) }),
      ...(!replay
        ? [fx("dorTreacheryDone", { code, player: firstPlayer(s) })]
        : []),
    );
  } else if (code === D.messenger) {
    const u = [...s.staging].reverse().find((u) => u.code === code);
    if (u)
      prepend(s, fx("dorMessenger", { target: u.id, player: firstPlayer(s) }));
  }
  return true;
}
export function dangerDorwinionEffect(s: GameState, e: Effect): boolean {
  const q = s.dangerDorwinion;
  if (!q) return false;
  if (e.kind === "guardObjective" && get(s, e.target)?.code === D.evidence) {
    prepend(
      s,
      fx("dorGuardEvidence", { target: e.target, player: firstPlayer(s) }),
    );
    return true;
  }
  if (!e.kind.startsWith("dor")) return false;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "dorSetupLocation": {
      const ps = playerOrder(s),
        index = e.value ?? 0,
        chosen = e.ids ?? [];
      if (index >= ps.length) {
        shuffle(s, s.encounterDeck);
        q.initialized = true;
        break;
      }
      const needStreet = index === ps.length - 1 && !chosen.includes(D.street);
      const codes = [...new Set(s.encounterDeck)].filter(
        (code) =>
          card(code).type_code === "location" &&
          !chosen.includes(code) &&
          (!needStreet || code === D.street),
      );
      choose(
        s,
        "A City in Turmoil · Choose a different starting location",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("dorSetupAdd", {
              code,
              value: index,
              ids: chosen,
              player: ps[index],
            }),
          ],
        })),
        "Each player adds a different location. One must be Side Street.",
      );
      break;
    }
    case "dorSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        add(s, e.code!);
      }
      const index = (e.value ?? 0) + 1;
      prepend(
        s,
        fx("dorSetupLocation", {
          value: index,
          ids: [...(e.ids ?? []), e.code!],
          player: playerOrder(s)[index] ?? firstPlayer(s),
        }),
      );
      break;
    }
    case "dorStage": {
      const candidates = q.setAside.filter((u) =>
        (s.stage === 2
          ? dangerDorwinionPlots
          : dangerDorwinionCultists
        ).includes(u.code),
      );
      if (candidates.length) {
        const selected = candidates[Math.floor(random(s) * candidates.length)];
        q.setAside = q.setAside.filter((u) => u.id !== selected.id);
        s.staging.push(selected);
        if (selected.code === D.worship) selected.damage = 1;
        if (s.stage === 3) enemyAddedToStaging(s, selected);
      }
      if (s.stage === 2)
        prepend(
          s,
          ...playerOrder(s).map((p) => fx("reveal", { player: p })),
          fx("stageRevealed", { player }),
        );
      else {
        shuffleDiscard(s);
        for (let i = 0; i < players(s) - 1; i++) {
          const code = findDiscard(
            s,
            (code) => card(code).type_code === "enemy",
          );
          if (code) add(s, code);
        }
        prepend(s, fx("stageRevealed", { player }));
      }
      break;
    }
    case "dorResource":
      resource(s);
      break;
    case "dorExploreStageTwo":
      prepend(s, fx("reveal", { player }), fx("dorResource", { player }));
      break;
    case "dorWorship":
      if (u && !u.blanked) u.damage++;
      break;
    case "dorSubmit":
      if (u && !u.blanked) {
        u.damage++;
        if (u.damage >= 4 + players(s))
          lose(
            s,
            "Submit or Die claims too many lives. The cult has broken the heroes.",
          );
      }
      break;
    case "dorBribes": {
      if (!u || u.blanked) break;
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          const discarded = discardPlayerDeck(s, e.value ?? 0);
          u.resources += discarded.filter(
            (code) => card(code).type_code === "event",
          ).length;
        });
      break;
    }
    case "dorForumResource":
      if (u && !u.blanked && s.staging.some((l) => l.id === u.id))
        u.resources++;
      break;
    case "dorFollowFirst":
      if (u && !u.blanked) transferEnemy(s, u, firstPlayer(s));
      break;
    case "dorGovernor":
      if (u && !u.blanked) {
        transferEnemy(s, u, firstPlayer(s));
        prepend(
          s,
          fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
        );
      }
      break;
    case "dorEasterlingResource":
      if (u && !u.blanked) u.resources++;
      break;
    case "dorThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "dorRandomDiscard":
      if (s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id, {
          encounterEffect: true,
        });
      break;
    case "dorCatacombs": {
      const code = encounterDraw(s);
      if (code) {
        if (card(code).type_code === "enemy") add(s, code, player);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "dorStreet": {
      shuffleDiscard(s);
      const code = findDiscard(s, (c) => card(c).type_code === "location");
      if (code) add(s, code);
      break;
    }
    case "dorUnwelcome": {
      const code = findDiscard(s, (c) => card(c).type_code === "enemy");
      if (code) add(s, code, firstPlayer(s));
      break;
    }
    case "dorTravelAgain": {
      const active = allActiveLocations(s);
      if (active.length > 1)
        choose(
          s,
          "Under Guard · Choose an active location",
          active.map((l) =>
            option(l, dangerDorwinionTravelEffects(s, l) ?? []),
          ),
        );
      else if (active[0])
        prepend(s, ...(dangerDorwinionTravelEffects(s, active[0]) ?? []));
      else if (e.flag) {
        const code = findDiscard(s, (c) => card(c).type_code === "location");
        if (code) add(s, code);
      }
      break;
    }
    case "dorTavern": {
      if (!u) break;
      q.looked = s.encounterDeck.splice(0, 5).map((c) => make(s, c));
      choose(
        s,
        "Seedy Tavern · Choose a facedown card",
        q.looked.map((c) =>
          option(c, [fx("dorStore", { target: u.id, source: c.id, player })]),
        ),
        "Look at the top five cards. The chosen card is revealed when this location is explored.",
      );
      break;
    }
    case "dorStore": {
      const i = q.looked.findIndex((c) => c.id === e.source);
      if (i >= 0 && u) {
        const c = q.looked.splice(i, 1)[0];
        let g = q.storedCards.find((g) => g.locationId === u.id);
        if (!g) q.storedCards.push((g = { locationId: u.id, cards: [] }));
        g.cards.push(c);
      }
      s.encounterDeck.push(...q.looked.splice(0).map((c) => c.code));
      shuffle(s, s.encounterDeck);
      break;
    }
    case "dorRevealStored": {
      const i = q.resolving.findIndex((c) => c.id === e.source);
      if (i < 0) break;
      const c = q.resolving.splice(i, 1)[0];
      s.encounterDeck.unshift(c.code);
      prepend(s, fx("reveal", { player }));
      break;
    }
    case "dorGuardEvidence": {
      if (!u || u.blanked) break;
      const hasEnemy = [...s.encounterDeck, ...s.encounterDiscard].some(
        (c) => card(c).type_code === "enemy",
      );
      if (!hasEnemy) {
        evidenceFreed(s, u);
        break;
      }
      let code: string | undefined;
      while (!code) {
        // Guarded(X) explicitly refills an empty encounter deck in any phase.
        if (!s.encounterDeck.length && s.encounterDiscard.length)
          shuffleDiscard(s);
        const c = encounterDraw(s);
        if (!c) break;
        if (card(c).type_code === "enemy") code = c;
        else s.encounterDiscard.push(c);
      }
      if (code) {
        const guard = add(s, code);
        guard.guarding = u.id;
      } else evidenceFreed(s, u);
      break;
    }
    case "dorBackstabber": {
      const allies = seatView(s, player).allies.filter(
        (a) => isAlly(a) && Number(card(a.code).cost) >= 2,
      );
      choose(s, "Rhûn Backstabber · Raise threat or discard an ally", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("dorThreat", { value: 2, player })],
        },
        ...allies.map((a) => ({
          ...option(a, [fx("dorDiscardAlly", { target: a.id, player })]),
          label: `Discard ${name(a)}`,
        })),
      ]);
      break;
    }
    case "dorDiscardAlly":
      if (u && isAlly(u)) discardCharacter(s, u);
      break;
    case "dorMessenger": {
      if (!u) break;
      const n = allActiveLocations(s).reduce((n, l) => n + threatOf(s, l), 0);
      choose(s, "Messenger from Mordor · Choose", [
        {
          id: "threat",
          label: `Raise each player's threat by ${n}`,
          effects: playerOrder(s).map((p) =>
            fx("dorThreat", { value: n, player: p }),
          ),
        },
        {
          id: "attack",
          label: "Immediate attack against the first player",
          effects: [
            fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
          ],
        },
      ]);
      break;
    }
    case "dorFearResponse":
      choosePlayerResponse(s, e.source!, D.fear, "Shadow of Fear · Defeated", [
        {
          id: "reduce",
          label: "Reduce each player's threat by 3",
          effects: playerOrder(s).map((p) =>
            fx("dorReduceThreat", { value: 3, player: p }),
          ),
        },
        skip,
      ]);
      break;
    case "dorReduceThreat":
      reduceThreat(s, e.value ?? 0, D.fear, "encounter");
      break;
    case "dorOverwhelmedShadow":
      choose(s, "Overwhelmed · Shadow", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("dorThreat", { value: 2, player })],
        },
        {
          id: "prevent",
          label: "Attacking enemy cannot take damage this round",
          effects: [fx("dorPreventDamage", { target: e.target, player })],
        },
      ]);
      break;
    case "dorPreventDamage":
      if (u) q.prevented.push({ id: u.id, round: s.round });
      break;
    case "dorDiscardAttachment": {
      const hosts = [
        ...new Map(
          [
            ...allCharacters(s),
            ...allEngaged(s),
            ...s.staging,
            ...allActiveLocations(s),
            ...allQuestUnits(s),
            ...playerOrder(s)
              .map((p) => get(s, `threat:${p}`)!)
              .filter(Boolean),
          ].map((h) => [h.id, h]),
        ).values(),
      ];
      const choices = hosts.flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              (h.id.startsWith("threat:")
                ? (a.controller ?? a.owner ?? Number(h.id.slice(7)))
                : attachmentController(s, h, a)) === player &&
              card(a.code).sphere_code !== "encounter" &&
              !card(a.code).text?.includes("Immune to non-Master") &&
              !card(a.code).text?.includes("Permanent"),
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${h.id.startsWith("threat:") ? "Threat dial" : name(h)}`,
            effects: [
              fx("dorDiscardAttachmentTake", {
                target: h.id,
                source: a.id,
                player,
              }),
            ],
          })),
      );
      choose(s, "Disappearances · Discard an attachment you control", choices);
      break;
    }
    case "dorDiscardAttachmentTake": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) {
        if (u.id.startsWith("threat:")) {
          forOwner(s, Number(u.id.slice(7)), () => {
            s.threatAttachments = s.threatAttachments?.filter(
              (x) => x.id !== a.id,
            );
          });
          seatView(s, a.owner ?? player).discard.push(a.code);
        } else discardAttachment(s, u, a);
      }
      break;
    }
    case "dorTreachery": {
      if (e.code === D.darkness) {
        const active = allActiveLocations(s),
          n = active.reduce((n, l) => n + threatOf(s, l), 0);
        prepend(
          s,
          ...(active.length
            ? playerOrder(s).map((p) =>
                fx("dorThreat", { value: n, player: p }),
              )
            : surgeEffects(e.code)),
        );
      } else if (e.code === D.overwhelmed)
        q.overwhelmed.push({ player: firstPlayer(s), round: s.round });
      else if (e.code === D.guard)
        prepend(s, fx("dorTravelAgain", { flag: true, player }));
      else if (e.code === D.disappearances) {
        const count = playerOrder(s).reduce(
          (n, p) =>
            n +
            seatView(s, p).hand.filter((c) => card(c.code).type_code === "ally")
              .length,
          0,
        );
        for (const p of playerOrder(s))
          forOwner(s, p, () => {
            for (const a of [...s.hand].filter(
              (a) => card(a.code).type_code === "ally",
            ))
              discardHandCard(s, a.id, { encounterEffect: true });
          });
        if (!count) resolveDoomed(s, 2, "encounter");
      } else if (e.code === D.secret) {
        const allies = allCharacters(s).filter(isAlly);
        const maximum = Math.max(-1, ...allies.map((a) => stats(s, a).attack));
        choose(
          s,
          "Secret Cultist · Choose the highest-attack ally",
          allies
            .filter((a) => stats(s, a).attack === maximum)
            .map((a) =>
              option(a, [
                fx("dorSecretAttach", { target: a.id, code: e.code, player }),
              ]),
            ),
        );
      }
      break;
    }
    case "dorSecretAttach": {
      if (!u || !isAlly(u)) break;
      const controller = ownerOf(s, u),
        owner = u.owner ?? controller;
      removeFromQuest(s, u);
      forOwner(s, controller, () => {
        s.allies = s.allies.filter((a) => a.id !== u.id);
      });
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: D.secret,
        exhausted: false,
      });
      q.secretCultists.push({ id: u.id, owner });
      // Changing type/control is not leaving play; the physical ally and its attachments remain.
      s.staging.push(u);
      forOwner(s, owner, () => engage(s, u));
      const i = q.resolvingTreacheries.indexOf(D.secret);
      if (i >= 0) q.resolvingTreacheries.splice(i, 1);
      break;
    }
    case "dorDiscardSecret": {
      if (!u) break;
      discardSecret(s, u);
      break;
    }
    case "dorTreacheryDone": {
      const i = q.resolvingTreacheries.indexOf(e.code!);
      if (i >= 0) {
        q.resolvingTreacheries.splice(i, 1);
        s.encounterDiscard.push(e.code!);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}

export const DANGER_DORWINION_HOOKS: Batch4ScenarioHooks = {
  setup: setupDangerDorwinion,
  openingHandsKept: dangerDorwinionOpeningHandsKept,
  check: dangerDorwinionCheck,
  advance: dangerDorwinionAdvance,
  stageInfo: dangerDorwinionStageInfo,
  stats: dangerDorwinionStats,
  threatBonus: dangerDorwinionThreatBonus,
  stagingThreat: dangerDorwinionStagingThreat,
  immune: dangerDorwinionImmune,
  cannotOptionallyEngage: dangerDorwinionCannotOptionallyEngage,
  characterBlanked: dangerDorwinionCharacterBlanked,
  locationProgressBlocked: dangerDorwinionLocationProgressBlocked,
  threatReduction: dangerDorwinionThreatReduction,
  damageAmount: dangerDorwinionDamageAmount,
  damageDealt: dangerDorwinionDamageDealt,
  hostLeaves: dangerDorwinionHostLeaves,
  enemyDestination: dangerDorwinionEnemyDestination,
  attachmentLeaves: dangerDorwinionAttachmentLeaves,
  characterDestroyed: dangerDorwinionCharacterDestroyed,
  attackFinished: dangerDorwinionAttackFinished,
  engaged: dangerDorwinionEngaged,
  cardEntered: dangerDorwinionCardEntered,
  revealed: dangerDorwinionRevealed,
  explored: dangerDorwinionExplored,
  travelEffects: dangerDorwinionTravelEffects,
  sideQuestChosen: dangerDorwinionSideQuestChosen,
  sideDefeated: dangerDorwinionSideDefeated,
  roundEnd: dangerDorwinionRoundEnd,
  beginShadows: dangerDorwinionBeginShadows,
  finishShadows: dangerDorwinionFinishShadows,
  threatRaised: dangerDorwinionThreatRaised,
  usesExistingShadows: dangerDorwinionUsesExistingShadows,
  immediateShadows: dangerDorwinionImmediateShadows,
  combatEndShadows: dangerDorwinionCombatEndShadows,
  playerEliminating: dangerDorwinionPlayerEliminated,
  cannotDiscardShadow: dangerDorwinionCannotDiscardShadow,
  enemyAttackStarted: dangerDorwinionEnemyAttackStarted,
  shadowResolved: dangerDorwinionShadowResolved,
  shadow: dangerDorwinionShadow,
  encounter: dangerDorwinionEncounter,
  effect: dangerDorwinionEffect,
};
