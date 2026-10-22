import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardLocation,
  discardQuestAttachments,
  enemyAddedToStaging,
  exhaustCharacter,
  questDefeated,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  attachmentController,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { reduceThreat } from "./threat-reduction";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { heirsCannotHaveAttachments } from "./heirs-numenor";
import {
  GUNDABAD as G,
  MOUNT_GUNDABAD_RECIPES,
  MOUNT_GUNDABAD_STAGE_TWOS,
  gundabadDragon,
  gundabadQuestCount,
  gundabadX,
  mountGundabadStageInfo,
} from "./mount-gundabad-support";
export * from "./mount-gundabad-support";

type Combat = NonNullable<GameState["combat"]> & {
  gundabadRandomDiscard?: number;
  gundabadKilledCharacter?: boolean;
};
const live = (s: GameState) => !!s.mountGundabad;
const own = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const trait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((v) => v.trim() === t);
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const dark = (s: GameState) =>
  allActiveLocations(s).some((l) => trait(l, "Dark"));
const stage = (s: GameState, code: string) =>
  !!s.mountGundabad &&
  !s.mountGundabad.questFront &&
  s.mountGundabad.currentQuest === code &&
  !mainQuestUnit(s)?.blanked;
const phase = (s: GameState) =>
  ["quest", "staging"].includes(s.phase)
    ? "quest"
    : ["defense", "attack"].includes(s.phase)
      ? "combat"
      : s.phase;
const heroTargets = (s: GameState) =>
  allHeroes(s).filter((u) => !heirsCannotHaveAttachments(u));
const sword = (s: GameState) =>
  allCharacters(s).flatMap((host) =>
    host.attachments
      .filter((a) => a.code === G.sword)
      .map((a) => ({ host, a })),
  )[0];
const optional = (
  s: GameState,
  title: string,
  effects: Effect[],
  _player = firstPlayer(s),
) => {
  choose(s, title, [
    { id: "use", label: "Use the response", effects },
    { id: "skip", label: "Continue without the response", effects: [] },
  ]);
};
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  log(s, reason, "danger");
}
function detach(s: GameState, u: Unit) {
  s.staging = s.staging.filter((v) => v.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = s.extraActiveLocations?.filter((v) => v.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((v) => v.id !== u.id);
    });
}
function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
function returnDragon(s: GameState) {
  const u = gundabadDragon(s);
  if (!u) return undefined;
  detach(s, u);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  return u;
}
function discardUntil(s: GameState, accepts: (c: string) => boolean) {
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    if (accepts(c)) return c;
    s.encounterDiscard.push(c);
  }
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function questVictory(s: GameState) {
  const q = s.mountGundabad!;
  if (!q.completedQuests.includes(q.currentQuest))
    q.completedQuests.push(q.currentQuest);
  addVictoryCard(s, q.currentQuest);
}
function changeQuest(s: GameState, code: string, front = true) {
  const q = s.mountGundabad!;
  discardQuestAttachments(s, q.currentQuest);
  q.currentQuest = code;
  q.questFront = front;
  q.advancing = false;
  s.stage = 2;
  s.progress = 0;
  s.stageRevealing = false;
  returnDragon(s);
  log(
    s,
    front
      ? "Exploring Gundabad: the next main quest remains on side 2A until the quest phase."
      : `The main quest is ${card(code).back_name ?? card(code).name}.`,
    "chapter",
  );
}
function nextQuest(s: GameState, front = true) {
  const q = s.mountGundabad!,
    code = q.questDeck.shift();
  if (code) changeQuest(s, code, front);
}
function active(s: GameState, u: Unit) {
  // Moving to the Caves location is not travel; none of its Deep keywords retrigger.
  s.activeLocation = u;
  mountGundabadTravelEntered(s, u, false);
}
function characterOptions(
  s: GameState,
  p: number,
  e: Effect,
  predicate = (_u: Unit) => true,
): Option[] {
  return own(s, p)
    .filter(predicate)
    .map((u) => ({
      id: u.id,
      code: u.code,
      label: name(u),
      effects: [{ ...e, target: u.id, player: p }],
    }));
}
function finish(s: GameState, id: string, discard = true) {
  const pile = s.mountGundabad!.resolving,
    i = pile.findIndex((u) => u.id === id);
  if (i < 0) return undefined;
  const u = pile.splice(i, 1)[0];
  if (discard) s.encounterDiscard.push(u.code);
  return u;
}

export function setupMountGundabad(s: GameState) {
  const r = MOUNT_GUNDABAD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    r.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.staging.push(make(s, G.dagnir));
  s.mountGundabad = {
    initialized: false,
    advancing: false,
    currentQuest: G.door,
    questFront: false,
    questDeck: shuffle(s, [...MOUNT_GUNDABAD_STAGE_TWOS]),
    completedQuests: [],
    cavesDeck: shuffle(
      s,
      pile("sharedEncounterDeck2").map((c) => make(s, c)),
    ),
    setAside: [make(s, G.forge), make(s, G.sword)],
    resolving: [],
    removed: [],
    guardedPlayerCards: [],
    reforged: false,
    damageRound: 0,
    damageTaken: 0,
    firstTreacheryRound: -1,
    phasePlays: [],
    noPlayerReady: [],
    darkPlaces: [],
    usedResponses: [],
  };
}
export function mountGundabadOpeningHandsKept(s: GameState) {
  if (!live(s) || s.mountGundabad!.initialized) return false;
  prepend(
    s,
    fx("gundabadSetupSword", { player: firstPlayer(s) }),
    fx("gundabadSetupLocations"),
    fx("nextRound"),
  );
  return true;
}
export function mountGundabadCheck(s: GameState) {
  // Dagnir is Indestructible. Winning is exclusively the optional Great Worm response.
  if (!live(s)) return;
  const q = s.mountGundabad!;
  q.phasePlays = q.phasePlays.filter((m) => m.round === s.round);
  q.noPlayerReady = q.noPlayerReady.filter((m) => m.round === s.round);
  q.darkPlaces = q.darkPlaces.filter((m) => m.round === s.round);
}
export function mountGundabadAdvance(s: GameState) {
  if (!live(s)) return false;
  const q = s.mountGundabad!,
    goal = mountGundabadStageInfo(s)?.quest ?? 0;
  if (
    q.initialized &&
    !q.advancing &&
    !q.questFront &&
    !s.stageRevealing &&
    s.status === "playing" &&
    goal > 0 &&
    s.progress >= goal
  ) {
    q.advancing = true;
    prepend(
      s,
      fx("gundabadDefeatQuest", {
        code: q.currentQuest,
        player: firstPlayer(s),
      }),
    );
  }
  return true;
}
export function mountGundabadStats(s: GameState, u: Unit) {
  let attack = 0,
    defense = 0;
  if (!live(s)) return { attack, defense };
  if (!u.blanked && u.code === G.guardian && gundabadQuestCount(s) >= 3)
    defense += 2;
  if (!u.blanked && u.code === G.hobgoblin) {
    const held = s.mountGundabad!.guardedPlayerCards.find(
      (g) => g.guardId === u.id,
    );
    if (held) {
      const n = Number(card(held.card.code).cost);
      if (Number.isFinite(n)) {
        attack += n;
        defense += n;
      }
    }
  }
  if (u.attachments.some((a) => a.code === G.sword && !a.blanked))
    attack += s.mountGundabad!.reforged ? gundabadX(s) : 1;
  return { attack, defense };
}
export function mountGundabadThreatBonus(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return 0;
  if (u.code === G.dagnir) return gundabadX(s);
  if (u.code === G.ruins && gundabadQuestCount(s) >= 3) return 2;
  if (u.code === G.lake)
    return Math.max(0, ...playerOrder(s).map((p) => own(s, p).length));
  if (u.code === G.hobgoblin) {
    const held = s.mountGundabad!.guardedPlayerCards.find(
      (g) => g.guardId === u.id,
    );
    return held ? Number(card(held.card.code).cost) || 0 : 0;
  }
  return 0;
}
export function mountGundabadEngagementBonus(s: GameState, u: Unit) {
  if (!live(s) || u.code !== G.dagnir) return 0;
  return (
    -10 * locations(s).filter((l) => l.code === G.mines && !l.blanked).length -
    (stage(s, G.worm) ? 5 * own(s, firstPlayer(s)).length : 0)
  );
}
export const mountGundabadStagingThreat = (s: GameState) =>
  s.mountGundabad?.darkPlaces
    .filter(
      (m) =>
        m.round === s.round &&
        phase(s) === (m.phase === "staging" ? "quest" : m.phase),
    )
    .reduce((n, m) => n + m.amount, 0) ?? 0;
export const mountGundabadLocationQuestBonus = (s: GameState, u: Unit) =>
  live(s) && u.code === G.lake && !u.blanked
    ? Math.max(0, ...playerOrder(s).map((p) => own(s, p).length))
    : 0;
export const mountGundabadLocationProgressBlocked = (s: GameState, u: Unit) =>
  live(s) &&
  trait(u, "Dark") &&
  s.staging.some((l) => l.id === u.id) &&
  s.staging.some((l) => l.code === G.tunnel && !l.blanked);
export function mountGundabadCannotReady(s: GameState, u: Unit) {
  return (
    live(s) &&
    u.attachments.some((a) => a.code === G.sword) &&
    allActiveLocations(s).some((l) => l.code === G.forge && !l.blanked)
  );
}
export const mountGundabadCharacterBlanked = (s: GameState, u: Unit) =>
  live(s) &&
  dark(s) &&
  u.attachments.some((a) => a.code === G.afraid && !a.blanked);
export const mountGundabadWillpowerOverride = (s: GameState, u: Unit) =>
  mountGundabadCharacterBlanked(s, u) ? 0 : undefined;
export const mountGundabadCannotPlayerReadyCharacter = (
  s: GameState,
  u: Unit,
) =>
  !!s.mountGundabad?.noPlayerReady.some(
    (m) => m.id === u.id && m.round === s.round,
  );
export const mountGundabadImmune = (_s: GameState, u: Unit) =>
  [G.dagnir, G.forge].includes(u.code) && !u.blanked;
export const mountGundabadIndestructible = (_s: GameState, u: Unit) =>
  u.code === G.dagnir && !u.blanked;
export const mountGundabadCannotLeave = (s: GameState, u: Unit) =>
  live(s) && u.code === G.dagnir && !u.blanked && gundabadQuestCount(s) >= 5;
export const mountGundabadCannotEngage = mountGundabadCannotLeave;
export const mountGundabadConsideredEngaged = (
  s: GameState,
  u: Unit,
  _p: number,
) => mountGundabadCannotLeave(s, u);
export function mountGundabadCannotAttach(
  _s: GameState,
  u: Unit,
  code?: string,
) {
  return (
    u.code === G.troll &&
    !u.blanked &&
    !!code &&
    !card(code).type_code.startsWith("objective")
  );
}
export function mountGundabadRevealed(
  s: GameState,
  code: string,
  _origin?: Effect["revealOrigin"],
) {
  const q = s.mountGundabad;
  if (!q || card(code).type_code !== "treachery") return;
  const first = q.firstTreacheryRound !== s.round;
  q.firstTreacheryRound = s.round;
  q.protectedTreachery = first && stage(s, G.lower) ? code : undefined;
}
export const mountGundabadCannotCancel = (
  s: GameState,
  shadow = false,
  code?: string,
) => !shadow && !!code && s.mountGundabad?.protectedTreachery === code;
export function mountGundabadPlayProblem(s: GameState, _code: string) {
  return stage(s, G.darkness) &&
    s.mountGundabad!.phasePlays.some(
      (m) =>
        m.player === activeSeat(s) &&
        m.round === s.round &&
        m.phase === phase(s) &&
        m.count >= 1,
    )
    ? "Foreboding Darkness allows each player to play only 1 card each phase."
    : null;
}
export function mountGundabadPlayerCardPlayed(s: GameState, _u: Unit) {
  const q = s.mountGundabad;
  if (!q) return;
  const p = activeSeat(s),
    m = q.phasePlays.find(
      (m) => m.player === p && m.round === s.round && m.phase === phase(s),
    );
  if (m) m.count++;
  else
    q.phasePlays.push({ player: p, round: s.round, phase: phase(s), count: 1 });
}
export function mountGundabadDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!live(s) || amount <= 0) return amount;
  if (u.code === G.dagnir && !u.blanked) {
    if (
      !context.questEffect &&
      enemies(s).some((e) => e.code === G.slave && !e.blanked)
    )
      return 0;
    if (!context.questEffect) {
      const q = s.mountGundabad!;
      amount = Math.min(
        amount,
        Math.max(
          0,
          gundabadX(s) - (q.damageRound === s.round ? q.damageTaken : 0),
        ),
      );
    }
  }
  if (amount > 0) {
    const a = u.attachments.find((a) => a.code === G.scales && !a.blanked);
    if (a) {
      discardAttachment(s, u, a, true);
      return 0;
    }
  }
  return amount;
}
export function mountGundabadDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!live(s) || amount <= 0) return;
  if (u.code === G.dagnir && !context.questEffect) {
    const q = s.mountGundabad!;
    if (q.damageRound !== s.round) {
      q.damageRound = s.round;
      q.damageTaken = 0;
    }
    q.damageTaken += amount;
  }
  if (u.code === G.dweller && !u.blanked && u.damage < stats(s, u).health)
    prepend(s, fx("gundabadReturnEnemy", { target: u.id }));
  if (context.combatDamage && context.enemyId) {
    const enemy = get(s, context.enemyId);
    if (
      allCharacters(s).some((c) => c.id === u.id) &&
      enemy?.code === G.troll &&
      !enemy.blanked &&
      u.damage > stats(s, u).health
    )
      prepend(
        s,
        fx("gundabadDiscardHand", {
          player: ownerOf(s, u),
          value: u.damage - stats(s, u).health,
        }),
      );
  }
}
export function mountGundabadAttachmentLeaves(
  s: GameState,
  _host: Unit,
  a: Attachment,
  leaving = false,
) {
  if (live(s) && a.code === G.sword && leaving)
    lose(s, "The hero carrying Wormsbane has left play.");
  return false;
}
export function mountGundabadHostLeaves(s: GameState, u: Unit) {
  if (!live(s)) return;
  const q = s.mountGundabad!;
  for (const g of q.guardedPlayerCards.filter((g) => g.guardId === u.id))
    forOwner(s, g.player, () => {
      s.hand.push(g.card);
    });
  q.guardedPlayerCards = q.guardedPlayerCards.filter((g) => g.guardId !== u.id);
}
export function mountGundabadEngaged(s: GameState, u: Unit) {
  if (live(s) && u.code === G.dweller && !u.blanked)
    prepend(s, fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }));
}
export function mountGundabadEnemyAttackStarted(
  s: GameState,
  u: Unit,
  p: number,
) {
  if (!live(s)) return;
  const effects: Effect[] = [];
  for (const a of u.attachments.filter(
    (a) => a.code === G.breath && !a.blanked,
  ))
    effects.push(
      ...own(s, p).map((c) =>
        fx("damage", { target: c.id, value: 1, player: p }),
      ),
      fx("discardAttachment", { target: u.id, source: a.id, player: p }),
    );
  prepend(s, ...effects);
}
export function mountGundabadAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  const combat = c as Combat;
  return live(s) &&
    combat.gundabadRandomDiscard &&
    combat.gundabadKilledCharacter
    ? Array.from({ length: combat.gundabadRandomDiscard }, () =>
        playerOrder(s).map((player) => fx("gundabadRandomDiscard", { player })),
      ).flat()
    : [];
}
export function mountGundabadCharacterDestroyed(
  s: GameState,
  _u: Unit,
  context: DamageContext,
) {
  if (
    live(s) &&
    context.combatDamage &&
    s.combat &&
    context.enemyId === s.combat.enemyId
  )
    (s.combat as Combat).gundabadKilledCharacter = true;
}
export function mountGundabadPlayerAttackResolved(
  s: GameState,
  enemy: Unit,
  _ids: string[],
  _amount: number,
  _remaining: number,
) {
  if (
    !stage(s, G.worm) ||
    enemy.code !== G.dagnir ||
    enemy.damage < stats(s, enemy).health ||
    !s.mountGundabad!.reforged
  )
    return;
  const p = activeSeat(s),
    held = own(s, p).some((u) => u.attachments.some((a) => a.code === G.sword));
  if (held)
    prepend(s, fx("gundabadVictoryResponse", { target: enemy.id, player: p }));
}
export function mountGundabadPlanningEnd(s: GameState) {
  if (stage(s, G.door))
    prepend(
      s,
      fx("gundabadQuestPeek", { text: "door", player: firstPlayer(s) }),
    );
}
export function mountGundabadBeginQuest(s: GameState): Effect[] {
  return s.mountGundabad?.questFront ? [fx("gundabadFlipQuest")] : [];
}
export function mountGundabadCommitted(s: GameState) {
  if (!live(s)) return;
  const effects: Effect[] = [];
  if (stage(s, G.upper))
    effects.push(
      ...playerOrder(s).map((player) => fx("threat", { player, value: 1 })),
    );
  if (stage(s, G.warriors)) effects.push(fx("gundabadWarriors"));
  if (stage(s, G.wrath))
    effects.push(
      fx("gundabadWrathAttacks", {
        ids: playerOrder(s)
          .filter((p) => own(s, p).length >= 6)
          .map(String),
        player: firstPlayer(s),
      }),
    );
  if (stage(s, G.pursuit))
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("gundabadPursuitDamage", { player }),
      ),
    );
  effects.push(
    ...locations(s)
      .filter((u) => u.code === G.grotto && !u.blanked)
      .map((u) =>
        fx("gundabadGrotto", { target: u.id, player: firstPlayer(s) }),
      ),
  );
  prepend(s, ...effects);
}
export function mountGundabadCombatEnd(s: GameState) {
  if (!live(s) || s.mountGundabad!.questFront || s.stage !== 2) return;
  const q = s.mountGundabad!;
  if (q.currentQuest === G.worm) {
    if (gundabadQuestCount(s) <= 4) prepend(s, fx("gundabadBypass"));
  } else prepend(s, fx("gundabadBypassOffer", { player: firstPlayer(s) }));
}
export function mountGundabadTravelProblem(s: GameState, u: Unit) {
  return live(s) &&
    u.code !== G.stairs &&
    s.staging.some((l) => l.code === G.stairs && !l.blanked)
    ? "The players must travel to Narrow Stair."
    : null;
}
export function mountGundabadTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel = true,
) {
  if (!live(s) || u.blanked) return;
  const q = s.mountGundabad!,
    effects: Effect[] = [];
  if (u.code === G.forge) effects.push(fx("gundabadForgeExhaust"));
  if (u.code === G.cavern)
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("gundabadAssignDamage", { player, value: own(s, player).length }),
      ),
    );
  if (u.code === G.den) effects.push(fx("gundabadDen"));
  if (
    [G.armory, G.treasury].includes(u.code) &&
    !q.usedResponses.includes(u.code)
  )
    effects.push(
      fx("gundabadLocationResponse", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (actualTravel && u.code === G.fork)
    effects.push(
      fx("gundabadForkResponse", { target: u.id, player: firstPlayer(s) }),
    );
  if (
    actualTravel &&
    [G.fork, G.tunnel, G.ruins, G.mines, G.stairs].includes(u.code)
  )
    effects.push(
      fx("gundabadDeep", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  prepend(s, ...effects);
}
export function mountGundabadAllyEntered(s: GameState, u: Unit) {
  if (live(s) && locations(s).some((l) => l.code === G.lake && !l.blanked))
    exhaustCharacter(s, u);
  return false;
}
export function mountGundabadExplored(
  s: GameState,
  u: Unit,
  _wasActive: boolean,
) {
  if (!live(s) || u.blanked) return;
  const effects: Effect[] = [];
  if (u.code === G.hoard)
    effects.push(
      fx("gundabadHoardAttacks"),
      fx("gundabadHoardResponse", { player: firstPlayer(s) }),
    );
  if (u.code === G.throat)
    effects.push(fx("gundabadThroatResponse", { player: firstPlayer(s) }));
  if (u.code === G.forge)
    effects.push(fx("gundabadForgeResponse", { player: firstPlayer(s) }));
  prepend(s, ...effects);
}
export function mountGundabadCardEntered(
  s: GameState,
  u: Unit,
  _revealed: boolean,
  _cancelled: boolean,
) {
  if (live(s) && u.code === G.hobgoblin && !u.blanked)
    prepend(
      s,
      fx("gundabadHobgoblin", { target: u.id, player: firstPlayer(s) }),
    );
}
export function mountGundabadEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !live(s) ||
    ![
      G.bane,
      G.shadows,
      G.afraid,
      G.eyes,
      G.darkPlaces,
      G.breath,
      G.scales,
    ].includes(code)
  )
    return false;
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.indexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  s.mountGundabad!.resolving.push(u);
  prepend(
    s,
    fx("gundabadTreachery", { source: u.id, code, player: firstPlayer(s) }),
  );
  return true;
}
export function mountGundabadShadow(s: GameState, code: string) {
  const c = s.combat as Combat | null;
  if (!live(s) || !c) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  if (code === G.guardian) {
    if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
  } else if (code === G.slave)
    c.attackBonus +=
      (gundabadDragon(s) &&
        seatView(s, p).engaged.some((u) => u.code === G.dagnir)) ||
      (gundabadDragon(s) && gundabadQuestCount(s) >= 5)
        ? 2
        : 1;
  else if (code === G.ruins) {
    c.attackBonus++;
    c.gundabadRandomDiscard = (c.gundabadRandomDiscard ?? 0) + 1;
  } else if (code === G.mines) {
    if (enemy?.code === G.dagnir)
      prepend(
        s,
        fx("gundabadAssignDamage", { player: p, value: gundabadX(s) }),
      );
  } else if (code === G.stairs)
    for (const id of defenders)
      s.mountGundabad!.noPlayerReady.push({ id, round: s.round });
  else if (code === G.shadows)
    c.attackBonus += gundabadQuestCount(s) >= 3 ? 3 : 1;
  else if (code === G.bane) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === G.darkPlaces) c.attackBonus++;
  else if (code === G.troll)
    prepend(s, fx("gundabadDiscardAttachment", { player: p }));
  else if (code === G.eyes) {
    if (!defenders.length) prepend(s, fx("gundabadDiscardAlly", { player: p }));
  } else return false;
  return true;
}

export function mountGundabadEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("gundabad")) return false;
  const q = s.mountGundabad;
  if (!q) return true;
  const p = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "gundabadSetupSword": {
      const opts = heroTargets(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: `Attach Broken Wormsbane to ${name(h)}`,
        effects: [fx("gundabadAttachSword", { target: h.id })],
      }));
      if (opts.length) choose(s, "Wormsbane · Choose its bearer", opts);
      else lose(s, "There is no eligible hero to carry Wormsbane.");
      break;
    }
    case "gundabadAttachSword": {
      if (!u) break;
      let a = sword(s)?.a;
      for (const h of allCharacters(s))
        h.attachments = h.attachments.filter((x) => x.code !== G.sword);
      if (!a) {
        const i = q.setAside.findIndex((v) => v.code === G.sword);
        if (i >= 0) {
          const v = q.setAside.splice(i, 1)[0];
          a = {
            id: v.id,
            code: v.code,
            exhausted: false,
            owner: ownerOf(s, u),
          };
        }
      }
      if (a) u.attachments.push(a);
      break;
    }
    case "gundabadSetupLocations":
      for (let n = 1; n < playerOrder(s).length; n++) {
        const code = discardUntil(s, (c) => card(c).type_code === "location");
        if (code) add(s, code);
      }
      q.initialized = true;
      break;
    case "gundabadQuestPeek": {
      const top = q.questDeck.slice(0, 2);
      if (top.length < 2) {
        prepend(s, fx("gundabadQuestPeekTake", { code: top[0], text: e.text }));
        break;
      }
      choose(
        s,
        "Quest deck · Choose a quest to place on the bottom",
        top.map((code) => ({
          id: code,
          code,
          label: `Put ${card(code).back_name ?? card(code).name} on the bottom`,
          effects: [fx("gundabadQuestPeekTake", { code, text: e.text })],
        })),
      );
      break;
    }
    case "gundabadQuestPeekTake": {
      const i = q.questDeck.findIndex((c) => c === e.code);
      if (i >= 0) q.questDeck.push(q.questDeck.splice(i, 1)[0]);
      if (e.text === "door") {
        questVictory(s);
        nextQuest(s, true);
      } else nextQuest(s, false);
      break;
    }
    case "gundabadFlipQuest":
      discardQuestAttachments(s, q.currentQuest);
      q.questFront = false;
      s.progress = 0;
      log(
        s,
        `Exploring Gundabad turns over: ${card(q.currentQuest).back_name}.`,
        "chapter",
      );
      break;
    case "gundabadDefeatQuest": {
      if (q.currentQuest !== e.code || q.questFront) break;
      questVictory(s);
      // Printed WHEN-defeated Forced effects precede the optional attachment
      // responses. Capture their physical last-known information before any
      // effect (notably Foreboding Darkness) replaces the current quest.
      const queuedBefore = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - queuedBefore);
      const after: Effect[] = [];
      if (e.code === G.upper) {
        const i = q.setAside.findIndex((v) => v.code === G.forge);
        if (i >= 0)
          q.cavesDeck = shuffle(s, [
            ...q.cavesDeck,
            q.setAside.splice(i, 1)[0],
          ]);
      }
      if (e.code === G.lower)
        after.push(fx("gundabadLowerCave", { player: firstPlayer(s) }));
      if (e.code === G.warriors)
        after.push(
          ...playerOrder(s).map((player) =>
            fx("gundabadReduceThreat", { value: 5, player }),
          ),
        );
      if (e.code === G.wrath) {
        const d = gundabadDragon(s);
        if (d)
          after.push(
            fx("damage", {
              target: d.id,
              value: 5,
              text: encodeDamageContext({ questEffect: true }),
            }),
          );
      }
      if (e.code === G.pursuit)
        after.push(fx("gundabadDiscardEnemy", { player: firstPlayer(s) }));
      if (e.code === G.darkness)
        after.push(
          fx("gundabadQuestPeek", {
            text: "darkness",
            player: firstPlayer(s),
          }),
          ...responses,
        );
      else after.push(...responses, fx("gundabadNextQuest"));
      prepend(s, ...after);
      break;
    }
    case "gundabadNextQuest":
      nextQuest(s, true);
      break;
    case "gundabadBypassOffer":
      choose(s, "Bypass the current stage?", [
        {
          id: "bypass",
          label: "Bypass this stage",
          effects: [fx("gundabadBypass")],
        },
        { id: "stay", label: "Stay at this stage", effects: [] },
      ]);
      break;
    case "gundabadBypass":
      q.questDeck.push(q.currentQuest);
      nextQuest(s, true);
      break;
    case "gundabadLowerCave":
      if (q.cavesDeck.length)
        choose(
          s,
          "The Lower Deeps · Choose a Caves location",
          q.cavesDeck.map((v) => ({
            id: v.id,
            code: v.code,
            label: card(v.code).name,
            effects: [fx("gundabadLowerCaveTake", { target: v.id })],
          })),
        );
      break;
    case "gundabadLowerCaveTake": {
      const i = q.cavesDeck.findIndex((v) => v.id === e.target);
      if (i < 0) break;
      const v = q.cavesDeck.splice(i, 1)[0];
      // FAQ 1.34: a card effect can make another location active. This text
      // gives no instruction to discard or return the previous active card.
      if (s.activeLocation) {
        const previous = s.activeLocation;
        if (!(s.extraActiveLocations ??= []).some((u) => u.id === previous.id))
          s.extraActiveLocations.push(previous);
        s.activeLocation = null;
      }
      q.cavesDeck = shuffle(s, q.cavesDeck);
      active(s, v);
      break;
    }
    case "gundabadWarriors": {
      const cards = s.encounterDeck.splice(0, 5);
      s.encounterDiscard.push(...cards);
      const eligible = cards.filter((c) => card(c).type_code === "enemy");
      if (eligible.length) {
        const code = eligible[Math.floor(random(s) * eligible.length)],
          i = s.encounterDiscard.lastIndexOf(code);
        s.encounterDiscard.splice(i, 1);
        add(s, code);
      }
      break;
    }
    case "gundabadWrathAttacks": {
      const ids = (e.ids ?? []).filter(
        (id) => !s.table?.seats[Number(id)]?.eliminated,
      );
      if (!ids.length) break;
      choose(
        s,
        `${e.text ?? "Dagnir's Wrath"} · Choose the next player attacked`,
        ids.map((id) => ({
          id,
          label: `Player ${Number(id) + 1}`,
          effects: [
            fx("gundabadWrathAttack", { player: Number(id) }),
            fx("gundabadWrathAttacks", {
              ids: ids.filter((v) => v !== id),
              player: firstPlayer(s),
              text: e.text,
            }),
          ],
        })),
      );
      break;
    }
    case "gundabadWrathAttack": {
      const d = gundabadDragon(s);
      if (d) prepend(s, fx("immediateAttack", { target: d.id, player: p }));
      break;
    }
    case "gundabadPursuitDamage": {
      const opts = characterOptions(
        s,
        p,
        fx("damage", { value: 2 }),
        (u) => u.committed,
      );
      if (opts.length)
        choose(
          s,
          "Imminent Pursuit · Deal 2 damage to a questing character",
          opts,
        );
      break;
    }
    case "gundabadDiscardEnemy": {
      const opts = enemies(s)
        .filter((u) => !card(u.code).is_unique)
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("gundabadDiscardCharacter", { target: u.id })],
        }));
      if (opts.length)
        choose(s, "Imminent Pursuit · Discard a non-unique enemy", opts);
      break;
    }
    case "gundabadReturnEnemy":
      if (u) {
        detach(s, u);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    case "gundabadDeep": {
      // Forked Passage's response removes the source before its already
      // triggered Deep keyword. The Caves replacement still resolves.
      if (!q.cavesDeck.length) break;
      if (u && s.activeLocation?.id === u.id) discardLocation(s, u);
      const next = q.cavesDeck.shift()!;
      active(s, next);
      break;
    }
    case "gundabadForkResponse":
      if (u && q.cavesDeck.length)
        optional(
          s,
          "Forked Passage · Raise each player's threat by 2 to inspect the Caves deck?",
          [
            ...playerOrder(s).map((player) =>
              fx("threat", { value: 2, player }),
            ),
            fx("gundabadForkPeek", { target: u.id }),
          ],
        );
      break;
    case "gundabadForkPeek": {
      if (!u) break;
      const top = q.cavesDeck.slice(0, 2);
      if (top.length === 2)
        choose(
          s,
          "Forked Passage · Choose the location to leave on top",
          top.map((v) => ({
            id: v.id,
            code: v.code,
            label: `Leave ${card(v.code).name} on top`,
            effects: [fx("gundabadForkTake", { target: u.id, source: v.id })],
          })),
        );
      else
        prepend(
          s,
          fx("gundabadForkTake", { target: u.id, source: top[0]?.id }),
        );
      break;
    }
    case "gundabadForkTake": {
      if (!u) break;
      const top = q.cavesDeck.splice(0, 2),
        keep = top.find((v) => v.id === e.source);
      if (keep) q.cavesDeck.unshift(keep);
      q.cavesDeck.push(...top.filter((v) => v.id !== keep?.id));
      detach(s, u);
      addVictoryCard(s, u.code);
      break;
    }
    case "gundabadForgeExhaust": {
      const h = sword(s)?.host;
      if (h) exhaustCharacter(s, h);
      break;
    }
    case "gundabadForgeResponse":
      if (sword(s))
        optional(s, "The First Forge · Reforge Wormsbane?", [
          fx("gundabadForgeChoose", { player: firstPlayer(s) }),
        ]);
      break;
    case "gundabadForgeChoose": {
      const opts = heroTargets(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: `Attach Reforged Wormsbane to ${name(h)}`,
        effects: [fx("gundabadForgeReforge", { target: h.id })],
      }));
      if (opts.length) choose(s, "Reforged Wormsbane · Choose any hero", opts);
      break;
    }
    case "gundabadForgeReforge":
      q.reforged = true;
      prepend(s, fx("gundabadAttachSword", { target: e.target }));
      break;
    case "gundabadHoardAttacks": {
      const d = returnDragon(s);
      if (d)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("immediateAttack", { target: d.id, player }),
          ),
        );
      break;
    }
    case "gundabadHoardResponse":
      optional(
        s,
        "Dagnir's Hoard · Search for Item attachments?",
        playerOrder(s).map((player) =>
          fx("gundabadSearchAttachment", { player, text: "Item" }),
        ),
      );
      break;
    case "gundabadThroatResponse":
      if (q.questDeck.length)
        optional(s, "Throat of the Mountain · Choose a new main quest?", [
          fx("gundabadThroatChoose", { player: firstPlayer(s) }),
        ]);
      break;
    case "gundabadThroatChoose":
      choose(
        s,
        "Throat of the Mountain · Choose the next main quest",
        q.questDeck.map((code) => ({
          id: code,
          code,
          label: card(code).back_name ?? card(code).name,
          effects: [fx("gundabadThroatTake", { code })],
        })),
      );
      break;
    case "gundabadThroatTake": {
      const i = q.questDeck.indexOf(e.code!);
      if (i >= 0) {
        q.questDeck.splice(i, 1);
        q.questDeck.push(q.currentQuest);
        q.questDeck = shuffle(s, q.questDeck);
        changeQuest(s, e.code!, false);
      }
      break;
    }
    case "gundabadDen":
      shuffleDiscard(s);
      for (const _p of playerOrder(s)) {
        const code = discardUntil(s, (c) => card(c).type_code === "enemy");
        if (code) add(s, code);
      }
      break;
    case "gundabadLocationResponse":
      if (!q.usedResponses.includes(e.code!))
        optional(
          s,
          `${card(e.code!).name} · Use the once-per-game group response?`,
          [fx("gundabadLocationUse", { code: e.code })],
        );
      break;
    case "gundabadLocationUse":
      if (q.usedResponses.includes(e.code!)) break;
      q.usedResponses.push(e.code!);
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx(
            e.code === G.treasury
              ? "gundabadTreasury"
              : "gundabadSearchAttachment",
            { player, text: "Weapon|Armor" },
          ),
        ),
      );
      break;
    case "gundabadTreasury":
      choose(s, "Ancient Treasury · Choose one", [
        {
          id: "threat",
          label: "Reduce your threat by 3",
          effects: [fx("gundabadReduceThreat", { value: 3, player: p })],
        },
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { value: 2, player: p })],
        },
        {
          id: "resource",
          label: "Add 1 resource to a hero",
          effects: [fx("gundabadTreasuryHero", { player: p })],
        },
      ]);
      break;
    case "gundabadTreasuryHero": {
      const opts = characterOptions(s, p, fx("resource", { value: 1 }), isHero);
      if (opts.length) choose(s, "Ancient Treasury · Choose a hero", opts);
      break;
    }
    case "gundabadSearchAttachment": {
      const deck = seatView(s, p).deck,
        types = (e.text ?? "Item").split("|");
      const codes = [
        ...new Set(
          deck.filter(
            (c) =>
              card(c).type_code === "attachment" &&
              types.some((t) => trait(c, t)),
          ),
        ),
      ];
      choose(s, "Search your deck for an attachment", [
        ...codes.map((code) => ({
          id: code,
          code,
          label: `Add ${card(code).name} to your hand`,
          effects: [fx("gundabadSearchTake", { code, player: p })],
        })),
        {
          id: "skip",
          label: "Finish without taking a card",
          effects: [fx("gundabadShufflePlayer", { player: p })],
        },
      ]);
      break;
    }
    case "gundabadSearchTake":
      forOwner(s, p, () => {
        const i = s.deck.indexOf(e.code!);
        if (i >= 0) {
          const v = takePlayerDeck(s, i);
          if (v) s.hand.push(v);
        }
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "gundabadShufflePlayer":
      forOwner(s, p, () => {
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "gundabadReduceThreat":
      forOwner(s, p, () => {
        reduceThreat(s, e.value ?? 0, "encounter");
      });
      break;
    case "gundabadGrotto": {
      const code = discardUntil(s, (c) => card(c).type_code === "treachery");
      if (code) mountGundabadEncounter(s, code, false, true);
      break;
    }
    case "gundabadHobgoblin":
      if (u)
        forOwner(s, p, () => {
          if (!s.deck.length) return;
          const v = takePlayerDeck(s, 0);
          if (v)
            q.guardedPlayerCards.push({ guardId: u.id, player: p, card: v });
        });
      break;
    case "gundabadTreachery": {
      const code = e.code!;
      if (code === G.bane) {
        const d = gundabadDragon(s),
          engaged = playerOrder(s).filter(
            (p) =>
              seatView(s, p).engaged.some((u) => u.code === G.dagnir) ||
              gundabadQuestCount(s) >= 5,
          );
        finish(s, e.source!);
        if (d) {
          if (engaged.length)
            prepend(
              s,
              fx("gundabadWrathAttacks", {
                ids: engaged.map(String),
                player: firstPlayer(s),
                text: "Wilderland's Bane",
              }),
            );
          else d.tempEngagement = (d.tempEngagement ?? 0) - 30;
        }
      }
      if (code === G.shadows) {
        finish(s, e.source!);
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("gundabadAssignDamage", {
              player,
              value: gundabadX(s),
              flag: true,
            }),
          ),
        );
      }
      if (code === G.afraid) {
        const heroes = allHeroes(s).filter(
          (u) => u.committed && !u.attachments.some((a) => a.code === G.afraid),
        );
        if (heroes.length)
          choose(
            s,
            "Afraid of the Dark · Attach to a questing hero",
            heroes.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("gundabadCondition", {
                  target: u.id,
                  source: e.source,
                  code,
                }),
                fx("gundabadRemoveQuest", { target: u.id }),
              ],
            })),
          );
        else finish(s, e.source!);
      }
      if (code === G.eyes) {
        finish(s, e.source!);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("gundabadEyes", { player })),
        );
      }
      if (code === G.darkPlaces) {
        finish(s, e.source!);
        if (s.activeLocation)
          q.darkPlaces.push({
            round: s.round,
            phase: s.phase,
            amount: threatOf(s, s.activeLocation),
          });
        else {
          const c = discardUntil(s, (c) => card(c).type_code === "location");
          if (c) add(s, c);
        }
      }
      if (code === G.breath || code === G.scales) {
        const targets = enemies(s).filter(
          (u) =>
            trait(u, "Dragon") && !u.attachments.some((a) => a.code === code),
        );
        if (targets.length)
          choose(
            s,
            `${card(code).name} · Attach to a Dragon`,
            targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: name(u),
              effects: [
                fx("gundabadCondition", {
                  target: u.id,
                  source: e.source,
                  code,
                }),
              ],
            })),
          );
        else finish(s, e.source!);
      }
      break;
    }
    case "gundabadCondition": {
      const v = finish(s, e.source!, false);
      if (v && u)
        u.attachments.push({ id: v.id, code: v.code, exhausted: false });
      else if (v) s.encounterDiscard.push(v.code);
      break;
    }
    case "gundabadRemoveQuest":
      if (u) removeFromQuest(s, u);
      break;
    case "gundabadEyes": {
      const questers = own(s, p).filter((u) => u.committed),
        options: Option[] = [
          {
            id: "threat",
            label: `Raise your threat by ${questers.length}`,
            effects: [fx("threat", { value: questers.length, player: p })],
          },
        ];
      for (const u of questers)
        options.push({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [
            fx("gundabadDiscardCharacter", { target: u.id, player: p }),
          ],
        });
      choose(s, "Eyes in the Dark · Choose one", options);
      break;
    }
    case "gundabadAssignDamage": {
      const remaining = e.value ?? 0,
        alloc = e.effects ?? [];
      const targets = own(s, p).filter(
        (u) =>
          (!e.flag || isAlly(u)) &&
          u.damage +
            alloc
              .filter((a) => a.target === u.id)
              .reduce((n, a) => n + (a.value ?? 0), 0) <
            stats(s, u).health,
      );
      if (remaining <= 0 || !targets.length) {
        const totals = new Map<string, number>();
        for (const a of alloc)
          totals.set(a.target!, (totals.get(a.target!) ?? 0) + (a.value ?? 0));
        prepend(
          s,
          ...[...totals].map(([target, value]) =>
            fx("damage", { target, value, player: p }),
          ),
        );
        break;
      }
      choose(
        s,
        `Assign ${remaining} damage among your ${e.flag ? "allies" : "characters"}`,
        targets.flatMap((u) => {
          const assigned = alloc
              .filter((a) => a.target === u.id)
              .reduce((n, a) => n + (a.value ?? 0), 0),
            max = Math.min(remaining, stats(s, u).health - u.damage - assigned);
          return Array.from({ length: max }, (_, i) => ({
            id: `${u.id}:${i + 1}`,
            code: u.code,
            label: `Assign ${i + 1} damage to ${name(u)}`,
            effects: [
              {
                ...e,
                value: remaining - i - 1,
                effects: [
                  ...alloc,
                  fx("damage", { target: u.id, value: i + 1, player: p }),
                ],
              },
            ],
          }));
        }),
      );
      break;
    }
    case "gundabadDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "gundabadRandomDiscard":
      forOwner(s, p, () => {
        if (s.hand.length)
          discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      });
      break;
    case "gundabadDiscardHand":
      if ((e.value ?? 1) > 0 && seatView(s, p).hand.length)
        choose(
          s,
          `Discard ${e.value ?? 1} card(s) from your hand`,
          seatView(s, p).hand.map((v) => ({
            id: v.id,
            code: v.code,
            label: name(v),
            effects: [
              fx("gundabadDiscardHandTake", { target: v.id, player: p }),
              fx("gundabadDiscardHand", {
                value: (e.value ?? 1) - 1,
                player: p,
              }),
            ],
          })),
        );
      break;
    case "gundabadDiscardHandTake":
      forOwner(s, p, () => {
        discardHandCard(s, e.target!);
      });
      break;
    case "gundabadDiscardAlly": {
      const options = characterOptions(
        s,
        p,
        fx("gundabadDiscardCharacter"),
        isAlly,
      );
      if (options.length) choose(s, "Choose an ally to discard", options);
      break;
    }
    case "gundabadDiscardAttachment": {
      const hosts = [
        ...allCharacters(s),
        ...enemies(s),
        ...locations(s),
        ...allQuestUnits(s),
        ...playerOrder(s)
          .map((player) => get(s, `threat:${player}`))
          .filter((u): u is Unit => !!u),
      ];
      const options = hosts
        .filter((u, i, a) => a.findIndex((v) => v.id === u.id) === i)
        .flatMap((u) =>
          u.attachments
            .filter((a) => !a.facedown && attachmentController(s, u, a) === p)
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `Discard ${card(a.code).name}`,
              effects: [
                fx("discardAttachment", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            })),
        );
      if (options.length)
        choose(s, "Discard an attachment you control", options);
      break;
    }
    case "gundabadVictoryResponse":
      if (
        stage(s, G.worm) &&
        q.reforged &&
        u &&
        u.damage >= stats(s, u).health &&
        own(s, p).some((h) => h.attachments.some((a) => a.code === G.sword))
      )
        optional(
          s,
          "The Great Worm · Discard Reforged Wormsbane to defeat Dagnir?",
          [fx("gundabadWin", { target: u.id, player: p })],
          p,
        );
      break;
    case "gundabadWin": {
      const held = own(s, p).flatMap((h) =>
        h.attachments.filter((a) => a.code === G.sword).map((a) => ({ h, a })),
      )[0];
      if (
        held &&
        u &&
        q.reforged &&
        stage(s, G.worm) &&
        u.damage >= stats(s, u).health
      ) {
        discardAttachment(s, held.h, held.a);
        detach(s, u);
        addVictoryCard(s, u.code);
        win(s);
        s.reason =
          "Reforged Wormsbane slays Dagnir in the heart of Mount Gundabad.";
      }
      break;
    }
  }
  return true;
}

export const MOUNT_GUNDABAD_HOOKS: Batch4ScenarioHooks = {
  setup: setupMountGundabad,
  openingHandsKept: mountGundabadOpeningHandsKept,
  check: mountGundabadCheck,
  advance: mountGundabadAdvance,
  stageInfo: mountGundabadStageInfo,
  stats: mountGundabadStats,
  threatBonus: mountGundabadThreatBonus,
  stagingThreat: mountGundabadStagingThreat,
  engagementBonus: mountGundabadEngagementBonus,
  locationQuestBonus: mountGundabadLocationQuestBonus,
  locationProgressBlocked: mountGundabadLocationProgressBlocked,
  cannotReady: mountGundabadCannotReady,
  characterBlanked: mountGundabadCharacterBlanked,
  willpowerOverride: mountGundabadWillpowerOverride,
  cannotPlayerReadyCharacter: mountGundabadCannotPlayerReadyCharacter,
  immune: mountGundabadImmune,
  indestructible: mountGundabadIndestructible,
  cannotLeave: mountGundabadCannotLeave,
  cannotEngage: mountGundabadCannotEngage,
  consideredEngaged: mountGundabadConsideredEngaged,
  cannotAttach: mountGundabadCannotAttach,
  cannotCancel: mountGundabadCannotCancel,
  revealed: mountGundabadRevealed,
  playProblem: mountGundabadPlayProblem,
  playerCardPlayed: mountGundabadPlayerCardPlayed,
  playerAttackResolved: mountGundabadPlayerAttackResolved,
  planningEnd: mountGundabadPlanningEnd,
  questBegin: mountGundabadBeginQuest,
  committed: mountGundabadCommitted,
  combatEnd: mountGundabadCombatEnd,
  damageAmount: mountGundabadDamageAmount,
  damageDealt: mountGundabadDamageDealt,
  attachmentLeaves: mountGundabadAttachmentLeaves,
  hostLeaves: mountGundabadHostLeaves,
  engaged: mountGundabadEngaged,
  enemyAttackStarted: mountGundabadEnemyAttackStarted,
  attackFinished: mountGundabadAttackFinished,
  characterDestroyed: mountGundabadCharacterDestroyed,
  travelProblem: mountGundabadTravelProblem,
  mustTravel: (s) =>
    live(s) &&
    !allActiveLocations(s).length &&
    s.staging.some((l) => l.code === G.stairs && !l.blanked),
  travelEntered: mountGundabadTravelEntered,
  explored: mountGundabadExplored,
  allyEntered: mountGundabadAllyEntered,
  cardEntered: mountGundabadCardEntered,
  encounter: mountGundabadEncounter,
  shadow: mountGundabadShadow,
  effect: mountGundabadEffect,
};
