/**
 * The Core Set Nightmare Decks (docs/NIGHTMARE.md): each setup card's rules
 * and the Nightmare encounter cards, composed with the scenario's own rules
 * through batch4Scenario while a Nightmare mode game is played.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  enqueue,
  fx,
  get,
  inPlay,
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
  discardCharacter,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  raiseThreat,
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
import {
  NIGHTMARE_CORE as N,
  nightmareCardOf,
  nightmareLive,
  nightmareRefillsEncounterDeck,
} from "./nightmare";
import { surgeEffects } from "./surge";
import { encodeDamageContext, type DamageContext } from "./damage-context";

type Combat = NonNullable<GameState["combat"]>;

/** Lasting effects of the Nightmare cards. */
export interface NightmareCoreState {
  /** Ungoliant's Brood: the players whose cards cannot ready this round. */
  noReady?: { player: number; round: number }[];
  /** Smoking Blood's shadow on an undefended attack: the hero it damaged. */
  smoking?: { enemyId: string; heroId?: string }[];
  /** Marshland Outlaws' shadow: the defending player raises their threat by the attack's damage. */
  attackThreat?: { enemyId: string; player: number }[];
  /**
   * Troll Attack's shadow: the attack resolves against each other player
   * (the origin attack, then one undefended attack per other player with the
   * origin's attack bonus).
   */
  sweep?: {
    enemyId: string;
    player: number;
    origin?: boolean;
    started?: boolean;
    bonus?: number;
  }[];
}
const state = (s: GameState) => (s.nightmare ??= {});
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const seatLabel = (s: GameState, p: number) =>
  several(s) ? ` · ${seatName(s, p)}` : "";
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const traitOf = (code: string, t: string) =>
  (card(code).traits ?? "").split(".").some((x) => x.trim() === t);
const live = (s: GameState, u: Unit, code: string) =>
  u.code === code && !u.blanked && nightmareLive(s);
const undefended = (s: GameState) =>
  !(s.combat?.defenderIds?.length ?? (s.combat?.defenderId ? 1 : 0));
const defendingPlayer = (s: GameState) =>
  s.combat?.attackPlayer ?? firstPlayer(s);

// ------------------------------------------------------------- setup

/**
 * Passage Through Mirkwood (Nightmare): "Forced: During setup, each player
 * reveals 1 card from the encounter deck and adds it to the staging area."
 */
export function nightmareSetup(s: GameState) {
  if (!nightmareLive(s)) return;
  log(
    s,
    `Nightmare mode: ${card(nightmareCardOf(s)!).name}'s Nightmare Deck replaces the cards its setup card removes.`,
    "chapter",
  );
  if (s.scenarioId === "mirkwood")
    enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
}

// ------------------------------------------------------------- passives

/**
 * Spiders of Mirkwood: "While it is engaged with you, Spiders of Mirkwood gets
 * +1 [attack] for each exhausted character you control."
 */
function nmStats(s: GameState, u: Unit) {
  if (!live(s, u, N.spiders)) return {};
  const p = playerOrder(s).find((x) =>
    seatView(s, x).engaged.some((e) => e.id === u.id),
  );
  return {
    attack: p === undefined ? 0 : own(s, p).filter((c) => c.exhausted).length,
  };
}
/** Ungoliant's Brood: "your cards cannot ready for the remainder of the round." */
const nmCannotReady = (s: GameState, u: Unit) =>
  nightmareLive(s) &&
  !!s.nightmare?.noReady?.some(
    (m) => m.round === s.round && m.player === ownerOf(s, u),
  );

// ------------------------------------------------------------- triggers

function nmEngaged(s: GameState, u: Unit) {
  if (!nightmareLive(s)) return;
  const p = ownerOf(s, u);
  // Forest Flies: "Forced: After you engage Forest Flies, deal 1 damage to
  // each exhausted character you control."
  if (live(s, u, N.flies))
    prepend(
      s,
      ...own(s, p)
        .filter((c) => c.exhausted)
        .map((c) => fx("damage", { target: c.id, value: 1, player: p })),
    );
  // Ungoliant's Brood: "Forced: After you engage Ungoliant's Brood, your
  // cards cannot ready for the remainder of the round."
  if (live(s, u, N.brood)) {
    const q = state(s);
    q.noReady = [
      ...(q.noReady ?? []).filter((m) => m.round === s.round),
      { player: p, round: s.round },
    ];
    log(
      s,
      `Ungoliant's Brood: ${several(s) ? `${seatName(s, p)}'s` : "your"} cards cannot ready for the remainder of the round.`,
      "danger",
    );
  }
}
/**
 * Glade of the Spawn (the active location): "Forced: After a Spider enemy
 * enters play, each player must choose and exhaust 1 character he controls."
 */
function spiderEntered(s: GameState, u: Unit) {
  const glade = s.activeLocation;
  if (
    !glade ||
    !live(s, glade, N.glade) ||
    card(u.code).type_code !== "enemy" ||
    !traitOf(u.code, "Spider")
  )
    return;
  log(s, `Glade of the Spawn: ${name(u)} enters play.`, "danger");
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("chooseExhaust", { count: 1, player }),
    ),
  );
}
function nmCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  if (!nightmareLive(s) || cancelled) return;
  spiderEntered(s, u);
  // Ungoliant's Spawn: "When Revealed: Until the end of the phase, each
  // character currently committed to the quest gets -2 [willpower] and is
  // discarded if its [willpower] is 0."
  if (fromReveal && live(s, u, N.spawn))
    prepend(s, fx("nmSpawn", { player: firstPlayer(s) }));
}
/** The Spider's Web (Condition): "Each time attached hero readies, deal it 1 damage." */
function nmCharacterReadied(s: GameState, u: Unit) {
  if (!nightmareLive(s)) return;
  const webs = u.attachments.filter((a) => a.code === N.web && !a.blanked);
  if (webs.length)
    prepend(
      s,
      fx("damage", { target: u.id, value: webs.length, player: ownerOf(s, u) }),
    );
}
/**
 * Abandoned Camp: "Forced: After Abandoned Camp leaves play, each player must
 * deal 2 damage to each exhausted character he controls."
 */
function campLeft(s: GameState, u: Unit) {
  if (!live(s, u, N.camp)) return;
  log(s, "Abandoned Camp leaves play.", "danger");
  prepend(
    s,
    ...allCharacters(s)
      .filter((c) => c.exhausted)
      .map((c) =>
        fx("damage", { target: c.id, value: 2, player: ownerOf(s, c) }),
      ),
  );
}
function nmHostLeaves(s: GameState, u: Unit) {
  if (card(u.code).type_code === "location") campLeft(s, u);
}

// ------------------------------------------------------------- Journey Along the Anduin

const anduinLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "anduin";
const HILL_TROLL = "01082";
const OUTLAWS = "Marshland Outlaws";
const isEnemyUnit = (u: Unit) => card(u.code).type_code === "enemy";
const outlawsEngaged = (s: GameState, p: number) =>
  seatView(s, p).engaged.some((e) => live(s, e, N.outlaws));
/** The player an enemy is engaged with (undefined in the staging area). */
const engagedPlayer = (s: GameState, u: Unit) =>
  playerOrder(s).find((x) => seatView(s, x).engaged.some((e) => e.id === u.id));

/** The setup card: "All Troll enemies gain the text: 'Cannot have attachments.'" */
const nmCannotAttach = (s: GameState, u: Unit) =>
  anduinLive(s) && isEnemyUnit(u) && traitOf(u.code, "Troll");
/**
 * The setup card: "If the encounter deck is empty (at any time), shuffle the
 * encounter discard pile back into the encounter deck."
 */
function anduinRefill(s: GameState) {
  if (
    !nightmareRefillsEncounterDeck(s) ||
    s.encounterDeck.length ||
    !s.encounterDiscard.length
  )
    return;
  s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
  log(
    s,
    "Journey Along the Anduin · Nightmare: the encounter deck is empty, so the encounter discard pile is shuffled back into it.",
  );
}
/**
 * A Flooded Ford: "Each card revealed by the encounter deck gains doomed X. X
 * is the number of progress tokens on this card."
 */
function nmRevealedDoomed(
  s: GameState,
  _code: string,
  revealOrigin: Effect["revealOrigin"],
) {
  if (!anduinLive(s) || (revealOrigin && revealOrigin !== "encounter"))
    return 0;
  return [...s.staging, ...allActiveLocations(s)]
    .filter((u) => live(s, u, N.ford))
    .reduce((n, u) => n + (u.progress ?? 0), 0);
}
/** Anduin Troll Spawn: "If there is no Hill Troll in play, Anduin Troll Spawn gains surge." */
const nmRevealedSurge = (s: GameState, code: string) =>
  code === N.trollSpawn && anduinLive(s) && !inPlay(s, HILL_TROLL);
/**
 * Anduin Troll Spawn: "Forced: At the beginning of the combat phase, Anduin
 * Troll Spawn engages a player engaged with a Hill Troll."
 */
function nmCombatBegin(s: GameState) {
  if (!anduinLive(s)) return;
  const p = playerOrder(s).find((x) =>
    seatView(s, x).engaged.some((e) => e.code === HILL_TROLL),
  );
  if (p === undefined) return;
  for (const u of [...s.staging, ...allEngaged(s)])
    if (live(s, u, N.trollSpawn) && engagedPlayer(s, u) !== p) {
      log(
        s,
        `Anduin Troll Spawn engages ${several(s) ? seatName(s, p) : "you"}: the Hill Troll is engaged there.`,
        "danger",
      );
      forOwner(s, p, () => engage(s, u));
    }
}
/** Brown Water Rats has no hit points and "cannot be damaged": it is never destroyed. */
const nmIndestructible = (s: GameState, u: Unit) => live(s, u, N.rats);
function nmDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!anduinLive(s) || amount <= 0) return amount;
  // Brown Water Rats: "Brown Water Rats cannot be damaged."
  if (live(s, u, N.rats)) {
    log(s, "Brown Water Rats cannot be damaged.");
    return 0;
  }
  // Marshland Outlaws: "If you are engaged with this enemy, you cannot ...
  // deal damage (through effects) to enemies with a title other than
  // Marshland Outlaws."
  const source = s.playerAbilitySources?.at(-1);
  if (
    source &&
    !context.combatDamage &&
    !context.cost &&
    isEnemyUnit(u) &&
    card(u.code).name !== OUTLAWS
  ) {
    const holder = get(s, source.source);
    const p = holder ? ownerOf(s, holder) : activeSeat(s);
    if (outlawsEngaged(s, p)) {
      log(
        s,
        `Marshland Outlaws: ${several(s) ? `${seatName(s, p)} cannot` : "you cannot"} deal damage to ${name(u)} through effects.`,
      );
      return 0;
    }
  }
  return amount;
}
/**
 * Marshland Outlaws: "If you are engaged with this enemy, you cannot attack
 * ... enemies with a title other than Marshland Outlaws."
 */
const nmCannotAttack = (s: GameState, character: Unit, enemy: Unit) =>
  anduinLive(s) &&
  card(enemy.code).name !== OUTLAWS &&
  outlawsEngaged(s, ownerOf(s, character));
/**
 * Brown Water Rats: "Forced: If the players are on stage 3 and all remaining
 * enemies have the printed Rat trait, discard Brown Water Rats from play."
 */
function ratsCheck(s: GameState) {
  if (!anduinLive(s) || s.stage !== 3 || s.combat) return;
  const enemies = [...s.staging, ...allEngaged(s)].filter(isEnemyUnit);
  const rats = enemies.filter((u) => live(s, u, N.rats));
  if (!rats.length || !enemies.every((u) => traitOf(u.code, "Rat"))) return;
  log(
    s,
    `Brown Water Rats: only Rat enemies remain on stage 3, so ${rats.length === 1 ? "it is" : `${rats.length} copies are`} discarded from play.`,
    "good",
  );
  for (const u of rats) destroy(s, u, false);
}
/** Attack-scoped records left by an attack that ended without finishing. */
function staleAttackRecords(s: GameState) {
  const q = s.nightmare;
  if (!q || s.combat) return;
  delete q.smoking;
  delete q.attackThreat;
  if (!q.sweep) return;
  const queued = new Set(
    s.queue
      .filter((e) => e.kind === "immediateAttack")
      .map((e) => `${e.target}:${e.player}`),
  );
  const rest = q.sweep.filter(
    (x) => !x.origin && !x.started && queued.has(`${x.enemyId}:${x.player}`),
  );
  if (rest.length) q.sweep = rest;
  else delete q.sweep;
}
function nmCheck(s: GameState) {
  if (!nightmareLive(s)) return;
  staleAttackRecords(s);
  anduinRefill(s);
  ratsCheck(s);
}
/** Gladden Marshlands' Action, which any player may trigger. */
const nmAbilityLabel = (code: string) =>
  code === N.marshlands
    ? "Deal 1 damage to a hero to reduce its threat"
    : undefined;
const marshlandsHeroes = (s: GameState, p: number) =>
  seatView(s, p).heroes.filter((h) => !h.roundCannotTakeDamage);
function nmAbilityProblem(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || !live(s, u, N.marshlands)) return null;
  return !marshlandsHeroes(s, activeSeat(s)).length
    ? "Deal 1 damage to a hero you control to pay this cost."
    : threatOf(s, u) <= 0
      ? "Gladden Marshlands' threat is already 0."
      : null;
}
/**
 * Gladden Marshlands: "Action: Deal 1 damage to a hero you control to reduce
 * Gladden Marshlands' [threat] by 1 until the end of the phase. Any player
 * may trigger this effect."
 */
function nmAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || !live(s, u, N.marshlands)) return false;
  const p = activeSeat(s);
  choose(
    s,
    `Gladden Marshlands · Deal 1 damage to a hero you control${seatLabel(s, p)}`,
    marshlandsHeroes(s, p).map((h): Option => ({
      id: h.id,
      code: h.code,
      label: name(h),
      effects: [
        fx("damage", {
          target: h.id,
          value: 1,
          player: p,
          text: encodeDamageContext({ cost: true }),
        }),
        fx("nmMarshReduce", { target: u.id, player: p }),
      ],
    })),
    card(N.marshlands).text,
  );
  return true;
}
/** Smoking Blood's shadow on an undefended attack: the hero this attack damaged. */
function nmDamageDealt(
  s: GameState,
  u: Unit,
  _amount: number,
  context: DamageContext,
) {
  const pending = s.nightmare?.smoking;
  if (
    !pending?.length ||
    !context.combatDamage ||
    !context.enemyId ||
    card(u.code).type_code !== "hero"
  )
    return;
  for (const m of pending)
    if (m.enemyId === context.enemyId && !m.heroId) m.heroId = u.id;
}
/** Troll Attack's shadow: the attacks against the other players carry the origin's attack bonus. */
function nmEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  const m = s.nightmare?.sweep?.find(
    (x) =>
      !x.origin && !x.started && x.enemyId === enemy.id && x.player === player,
  );
  if (!m || !s.combat) return;
  m.started = true;
  s.combat.attackBonus += m.bonus ?? 0;
}
/** Troll Attack's shadow: "Attack is undefended against each player not engaged with this enemy." */
const nmCannotDefend = (s: GameState, enemy: Unit) =>
  !!s.nightmare?.sweep?.some(
    (x) =>
      !x.origin &&
      x.started &&
      x.enemyId === enemy.id &&
      x.player === s.combat?.attackPlayer,
  );
function nmAttackFinished(s: GameState, c: Combat): Effect[] {
  const q = s.nightmare;
  if (!q || !nightmareLive(s)) return [];
  const out: Effect[] = [];
  const attacked = c.attackPlayer ?? firstPlayer(s);
  // Marshland Outlaws: "Raise your threat by X. X is the amount of damage
  // dealt by this attack."
  for (const m of q.attackThreat ?? [])
    if (m.enemyId === c.enemyId) {
      const value = c.damageDealt ?? 0;
      log(
        s,
        `Marshland Outlaws: the attack dealt ${value} damage, and ${several(s) ? `${seatName(s, m.player)} raises their` : "you raise your"} threat by ${value}.`,
        value ? "danger" : "normal",
      );
      if (value) out.push(fx("nmThreat", { player: m.player, value }));
    }
  if (q.attackThreat)
    q.attackThreat = q.attackThreat.filter((m) => m.enemyId !== c.enemyId);
  // Smoking Blood (undefended): "move the damage to the hero damaged by this
  // attack."
  for (const m of q.smoking ?? [])
    if (m.enemyId === c.enemyId) {
      if (m.heroId)
        out.push(fx("nmSmokingMove", { target: m.heroId, source: c.enemyId }));
      else log(s, "Smoking Blood · No hero was damaged by this attack.");
    }
  if (q.smoking) q.smoking = q.smoking.filter((m) => m.enemyId !== c.enemyId);
  // Troll Attack: "resolve this attack against each player."
  const sweep = q.sweep ?? [];
  const origin = sweep.find((x) => x.origin && x.enemyId === c.enemyId);
  let rest = sweep.filter(
    (x) =>
      x !== origin &&
      !(x.started && x.enemyId === c.enemyId && x.player === attacked),
  );
  if (origin && get(s, c.enemyId)) {
    const others = playerOrder(s).filter((p) => p !== attacked);
    if (others.length)
      log(
        s,
        `Troll Attack: ${name(get(s, c.enemyId)!)}'s attack resolves against each other player, undefended.`,
        "danger",
      );
    for (const p of others) {
      rest.push({ enemyId: c.enemyId, player: p, bonus: c.attackBonus ?? 0 });
      out.push(
        fx("immediateAttack", { target: c.enemyId, player: p, noShadow: true }),
      );
    }
  }
  // An attacker that left play attacks no one else.
  rest = rest.filter((x) => get(s, x.enemyId));
  if (rest.length) q.sweep = rest;
  else delete q.sweep;
  return out;
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [
  N.backtrack,
  N.web,
  N.pursuit,
  N.smoking,
  N.trollAttack,
];
/** Each treachery's When Revealed effect, after it goes to the discard pile. */
const DISCARDED_FIRST: Record<string, string> = {
  [N.backtrack]: "nmBacktrack",
  [N.pursuit]: "nmPursuit",
  [N.smoking]: "nmSmoking",
  [N.trollAttack]: "nmTrollAttack",
};
function nmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nightmareLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Backtrack!: "Surge. When Revealed: The topmost enemy or location card in
  // the encounter discard pile is returned to the staging area." (Surge is a
  // printed keyword.) Pursuit on the Shore, Smoking Blood and Troll Attack
  // gain surge from their own effects.
  if (DISCARDED_FIRST[code]) {
    s.encounterDiscard.push(code);
    prepend(s, fx(DISCARDED_FIRST[code], { player: firstPlayer(s) }));
  } else prepend(s, fx("nmWeb", { player: firstPlayer(s) }));
  return true;
}

// ------------------------------------------------------------- shadows

function nmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nightmareLive(s)) return false;
  const p = defendingPlayer(s),
    enemy = get(s, c.enemyId);
  // Abandoned Camp: "If this attack is undefended, discard all attachment
  // cards players control."
  if (code === N.camp) {
    if (undefended(s)) prepend(s, fx("nmDiscardAttachments", { player: p }));
    else log(s, "Abandoned Camp · The attack is defended.");
  }
  // Backtrack!: "Deal and resolve the topmost Shadow effect in the encounter
  // discard pile for this attack."
  else if (code === N.backtrack)
    prepend(s, fx("nmBacktrackShadow", { target: c.enemyId, player: p }));
  // Forest Flies: "If attacking enemy is an Insect, deal it 2 additional
  // Shadow cards."
  else if (code === N.flies) {
    if (enemy && traitOf(enemy.code, "Insect"))
      prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 2 }));
    else log(s, "Forest Flies · The attacking enemy is not an Insect.");
  }
  // Spiders of Mirkwood: "Choose and exhaust 1 character you control. If this
  // attack was undefended, also deal that character 2 damage."
  else if (code === N.spiders)
    prepend(s, fx("nmSpidersShadow", { player: p, flag: undefended(s) }));
  // Ungoliant's Brood: "If this attack is undefended, exhaust all characters
  // you control."
  else if (code === N.brood) {
    if (undefended(s)) for (const u of own(s, p)) exhaustCharacter(s, u);
    else log(s, "Ungoliant's Brood · The attack is defended.");
  }
  // Ungoliant's Spawn: "Raise defending player's threat by 5. (Raise
  // defending player's threat by 10 instead if undefended.)"
  else if (code === N.spawn)
    prepend(s, fx("nmThreat", { player: p, value: undefended(s) ? 10 : 5 }));
  else if (anduinShadow(s, code, p, enemy)) return true;
  else return false;
  return true;
}
/** Journey Along the Anduin's Nightmare shadows. */
function anduinShadow(
  s: GameState,
  code: string,
  p: number,
  enemy: Unit | undefined,
) {
  const q = state(s);
  // A Flooded Ford: "If this attack is undefended, put A Flooded Ford into
  // the staging area with 1 progress token on it."
  if (code === N.ford) {
    if (!undefended(s) || !enemy) {
      log(s, "A Flooded Ford · The attack is defended.");
      return true;
    }
    const at = Math.max(0, (enemy.revealedShadowCount ?? 1) - 1);
    removeShadowCard(
      enemy,
      enemy.shadows[at] === code ? at : enemy.shadows.indexOf(code),
    );
    const ford = make(s, code);
    ford.progress = 1;
    s.staging.push(ford);
    log(
      s,
      "A Flooded Ford: the attack is undefended, and it enters the staging area with 1 progress token on it.",
      "danger",
    );
  }
  // Brown Water Rats: "Attacking enemy cannot be damaged this round."
  else if (code === N.rats) {
    if (enemy) {
      enemy.roundCannotTakeDamage = true;
      log(
        s,
        `Brown Water Rats: ${name(enemy)} cannot be damaged this round.`,
        "danger",
      );
    }
  }
  // Gladden Marshlands: "Each enemy engaged with the defending player gets +1
  // [attack] until the end of the phase. (+2 [attack] instead if this attack
  // is undefended.)"
  else if (code === N.marshlands) {
    const n = undefended(s) ? 2 : 1;
    const engaged = seatView(s, p).engaged.filter(isEnemyUnit);
    for (const e of engaged) e.tempAttack = (e.tempAttack ?? 0) + n;
    log(
      s,
      `Gladden Marshlands: ${engaged.length} engaged ${engaged.length === 1 ? "enemy gets" : "enemies get"} +${n} [attack] until the end of the phase.`,
      "danger",
    );
  }
  // Marshland Outlaws: "Raise your threat by X. X is the amount of damage
  // dealt by this attack." (After the attack.)
  else if (code === N.outlaws) {
    if (enemy) (q.attackThreat ??= []).push({ enemyId: enemy.id, player: p });
    log(
      s,
      "Marshland Outlaws: after this attack, the defending player raises their threat by the damage it dealt.",
      "danger",
    );
  }
  // Smoking Blood: "Move all damage on this enemy to the defending
  // character. (If undefended, move the damage to the hero damaged by this
  // attack.)"
  else if (code === N.smoking) {
    if (!enemy) return true;
    const defender = (s.combat?.defenderIds ??
      (s.combat?.defenderId ? [s.combat.defenderId] : []))[0];
    if (defender)
      prepend(s, fx("nmSmokingMove", { target: defender, source: enemy.id }));
    else {
      (q.smoking ??= []).push({ enemyId: enemy.id });
      log(
        s,
        `Smoking Blood: after this attack, the damage on ${name(enemy)} moves to the hero it damaged.`,
        "danger",
      );
    }
  }
  // Troll Attack: "If attacking enemy is a Troll, resolve this attack against
  // each player. (Attack is undefended against each player not engaged with
  // this enemy.)"
  else if (code === N.trollAttack) {
    if (enemy && traitOf(enemy.code, "Troll")) {
      (q.sweep ??= []).push({ enemyId: enemy.id, player: p, origin: true });
      if (several(s))
        log(
          s,
          `Troll Attack: ${name(enemy)}'s attack will resolve against each player.`,
          "danger",
        );
    } else log(s, "Troll Attack · The attacking enemy is not a Troll.");
  } else return false;
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareCoreEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nmThreat":
      if ((e.value ?? 0) > 0) {
        raiseThreat(s, e.value!, "encounter");
        log(
          s,
          `${several(s) ? `${seatName(s, p)} raises their` : "You raise your"} threat by ${e.value}.`,
          "danger",
        );
      }
      return true;
    case "nmBacktrack": {
      const pile = s.encounterDiscard;
      let i = pile.length - 1;
      while (i >= 0 && !["enemy", "location"].includes(card(pile[i]).type_code))
        i--;
      if (i < 0) {
        log(
          s,
          "Backtrack! · There is no enemy or location in the encounter discard pile.",
        );
        return true;
      }
      const [code] = pile.splice(i, 1);
      const u = make(s, code);
      s.staging.push(u);
      log(
        s,
        `Backtrack! returns ${name(u)} to the staging area from the encounter discard pile.`,
        "danger",
      );
      if (card(code).type_code === "enemy") {
        enemyAddedToStaging(s, u);
        spiderEntered(s, u);
      }
      return true;
    }
    case "nmBacktrackShadow": {
      const u = get(s, e.target);
      const pile = s.encounterDiscard;
      let i = pile.length - 1;
      while (i >= 0 && !card(pile[i]).shadow) i--;
      if (!u || i < 0) {
        log(
          s,
          "Backtrack! · There is no Shadow effect in the encounter discard pile.",
        );
        return true;
      }
      const [code] = pile.splice(i, 1);
      u.faceupShadows ??= u.shadows.map(() => false);
      const at = u.revealedShadowCount ?? 0;
      u.faceupShadows.splice(at, 0, false);
      u.shadows.splice(at, 0, code);
      log(
        s,
        `Backtrack! deals ${card(code).name} from the encounter discard pile to ${name(u)} and resolves its Shadow effect.`,
        "danger",
      );
      prepend(s, fx("shadowReveal", { code }));
      return true;
    }
    case "nmWeb": {
      // "The player with the highest threat exhausts all heroes he controls.
      // Then, attach this card to one of that player's heroes."
      const order = playerOrder(s);
      const top = Math.max(...order.map((x) => seatView(s, x).threat));
      const target = order.find((x) => seatView(s, x).threat === top)!;
      const heroes = seatView(s, target).heroes;
      forOwner(s, target, () => {
        for (const h of s.heroes) exhaustCharacter(s, h);
      });
      log(
        s,
        `The Spider's Web: ${several(s) ? `${seatName(s, target)} has` : "you have"} the highest threat (${top}) and exhausts each hero.`,
        "danger",
      );
      if (!heroes.length) {
        s.encounterDiscard.push(N.web);
        return true;
      }
      choose(
        s,
        `The Spider's Web · Attach it to one of your heroes${seatLabel(s, target)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("nmWebAttach", { target: h.id, player: target })],
        })),
        card(N.web).text,
      );
      return true;
    }
    case "nmWebAttach": {
      const h = get(s, e.target);
      if (!h) {
        s.encounterDiscard.push(N.web);
        return true;
      }
      h.attachments.push({
        id: `a${s.nextId++}`,
        code: N.web,
        exhausted: false,
      });
      log(
        s,
        `The Spider's Web is attached to ${name(h)}: each time it readies, it takes 1 damage.`,
        "danger",
      );
      return true;
    }
    case "nmSpawn": {
      // (As the Core Set's Ungoliant's Spawn: the quest phase's willpower
      // penalty for committed characters.)
      const ids = allCharacters(s)
        .filter((u) => u.committed)
        .map((u) => u.id);
      s.questDebuff += 2;
      const gone = allCharacters(s).filter(
        (u) => ids.includes(u.id) && stats(s, u).will <= 0,
      );
      log(
        s,
        `Ungoliant's Spawn: ${ids.length} committed ${ids.length === 1 ? "character gets" : "characters get"} -2 [willpower] until the end of the phase${gone.length ? `; ${gone.map((u) => name(u)).join(", ")} ${gone.length === 1 ? "is" : "are"} discarded at 0 [willpower]` : ""}.`,
        "danger",
      );
      for (const u of gone) discardCharacter(s, u);
      return true;
    }
    case "nmSpidersShadow": {
      const targets = own(s, p).filter((u) => !u.exhausted);
      if (!targets.length) return true;
      choose(
        s,
        `Spiders of Mirkwood · Choose and exhaust 1 character you control${e.flag ? " (the attack was undefended: it also takes 2 damage)" : ""}${seatLabel(s, p)}`,
        targets.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("exhaust", { target: u.id, player: p }),
            ...(e.flag
              ? [fx("damage", { target: u.id, value: 2, player: p })]
              : []),
          ],
        })),
      );
      return true;
    }
    case "nmMarshReduce": {
      const l = get(s, e.target);
      if (l) {
        l.tempThreat = (l.tempThreat ?? 0) - 1;
        log(
          s,
          "Gladden Marshlands gets -1 [threat] until the end of the phase.",
          "good",
        );
      }
      return true;
    }
    case "nmPursuit": {
      // "Search the victory display and encounter discard pile for the enemy
      // with the most hit points. Return that enemy to the staging area. If
      // no enemy is returned by this effect, Pursuit on the Shore gains
      // surge."
      const pool = [
        ...(s.victoryCards ?? []).map((code) => ({ code, from: "victory" })),
        ...s.encounterDiscard.map((code) => ({ code, from: "discard" })),
      ].filter((x) => card(x.code).type_code === "enemy");
      if (!pool.length) {
        log(
          s,
          "Pursuit on the Shore finds no enemy in the victory display or the encounter discard pile, and gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(N.pursuit));
        return true;
      }
      const top = Math.max(...pool.map((x) => card(x.code).health ?? 0));
      const tied = [
        ...new Map(
          pool
            .filter((x) => (card(x.code).health ?? 0) === top)
            .map((x) => [`${x.from}:${x.code}`, x]),
        ).values(),
      ];
      const back = (x: { code: string; from: string }) =>
        fx("nmPursuitReturn", { code: x.code, text: x.from, player: p });
      if (tied.length === 1) prepend(s, back(tied[0]));
      else
        choose(
          s,
          "Pursuit on the Shore · Choose the enemy with the most hit points to return to the staging area",
          tied.map((x) => ({
            id: `${x.from}:${x.code}`,
            code: x.code,
            label: `${card(x.code).name} (${x.from === "victory" ? "victory display" : "encounter discard pile"})`,
            effects: [back(x)],
          })),
          card(N.pursuit).text,
        );
      return true;
    }
    case "nmPursuitReturn": {
      const code = e.code!;
      if (e.text === "victory") {
        const i = s.victoryCards?.indexOf(code) ?? -1;
        if (i < 0) return true;
        s.victoryCards!.splice(i, 1);
        s.victory = Math.max(0, s.victory - (card(code).victory ?? 0));
      } else {
        const i = s.encounterDiscard.lastIndexOf(code);
        if (i < 0) return true;
        s.encounterDiscard.splice(i, 1);
      }
      const u = make(s, code);
      s.staging.push(u);
      log(
        s,
        `Pursuit on the Shore returns ${name(u)} (${card(code).health ?? 0} hit points) to the staging area from the ${e.text === "victory" ? "victory display" : "encounter discard pile"}.`,
        "danger",
      );
      enemyAddedToStaging(s, u);
      return true;
    }
    case "nmSmoking": {
      // "Remove all damage from all enemies. Then, each player raises his
      // threat by the amount of damage just removed from his engaged
      // enemies. If no damage is removed by this effect, Smoking Blood gains
      // surge."
      let removed = 0;
      for (const u of s.staging.filter(isEnemyUnit)) {
        removed += u.damage;
        u.damage = 0;
      }
      const raises: Effect[] = [];
      for (const x of playerOrder(s)) {
        let own = 0;
        for (const u of seatView(s, x).engaged.filter(isEnemyUnit)) {
          own += u.damage;
          u.damage = 0;
        }
        removed += own;
        if (own) raises.push(fx("nmThreat", { player: x, value: own }));
      }
      if (!removed) {
        log(
          s,
          "Smoking Blood removes no damage from the enemies, and gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(N.smoking));
      } else {
        log(
          s,
          `Smoking Blood removes ${removed} damage from the enemies.`,
          "danger",
        );
        prepend(s, ...raises);
      }
      return true;
    }
    case "nmSmokingMove": {
      const to = get(s, e.target),
        enemy = get(s, e.source);
      if (!to || !enemy || !enemy.damage) {
        log(s, "Smoking Blood · There is no damage to move.");
        return true;
      }
      if (to.roundCannotTakeDamage) {
        log(s, `Smoking Blood · ${name(to)} cannot be damaged.`);
        return true;
      }
      const n = enemy.damage;
      enemy.damage = 0;
      to.damage += n;
      log(
        s,
        `Smoking Blood moves ${n} damage from ${name(enemy)} to ${name(to)}.`,
        "danger",
      );
      return true;
    }
    case "nmTrollAttack": {
      // "All engaged Troll enemies attack. If no Troll enemies are engaged,
      // Troll Attack gains surge."
      const attacks = playerOrder(s).flatMap((x) =>
        seatView(s, x)
          .engaged.filter((u) => isEnemyUnit(u) && traitOf(u.code, "Troll"))
          .map((u) => fx("immediateAttack", { target: u.id, player: x })),
      );
      if (!attacks.length) {
        log(
          s,
          "Troll Attack: no Troll enemy is engaged, so it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(N.trollAttack));
      } else {
        log(
          s,
          `Troll Attack: ${attacks.length === 1 ? "the engaged Troll attacks" : `${attacks.length} engaged Trolls attack`}.`,
          "danger",
        );
        prepend(s, ...attacks);
      }
      return true;
    }
    case "nmDiscardAttachments": {
      // "Discard all attachment cards players control."
      const hosts = [
        ...allCharacters(s),
        ...allEngaged(s),
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ];
      let n = 0;
      for (const h of hosts)
        for (const a of [...h.attachments])
          if (
            card(a.code).type_code === "attachment" &&
            !["encounter", "burden"].includes(card(a.code).sphere_code ?? "")
          ) {
            discardAttachment(s, h, a);
            n++;
          }
      log(
        s,
        `Abandoned Camp: the attack is undefended, and ${n} attachment ${n === 1 ? "card is" : "cards are"} discarded.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** A composed hook that changes nothing (the Ered Campaign Pool's composer calls each one). */
export const NEUTRAL_LAYER: Batch4ScenarioHooks = {
  stats: () => ({}),
  threatBonus: () => 0,
  stagingThreat: () => 0,
  locationQuestBonus: () => 0,
  locationProgressAmount: (_s, _u, amount) => amount,
  locationProgressBlocked: () => false,
  cannotReady: () => false,
  cannotPlayerReady: () => false,
  cannotPlayerReadyCharacter: () => false,
  characterBlanked: () => false,
  willpowerOverride: () => undefined,
  cannotCancel: () => false,
  cannotOptionallyEngage: () => false,
  immune: () => false,
  cannotAttach: () => false,
  damageAmount: (_s, _u, amount) => amount,
  damageDealt: () => {},
  engaged: () => {},
  encounterBegin: () => {},
  endQuest: () => {},
  characterDestroyed: () => {},
  enemyAttackStarted: () => {},
  shadowResolved: () => {},
  attackFinished: () => [],
  hostLeaves: () => {},
  explored: () => {},
  travelProblem: () => null,
  mustTravel: () => false,
  travelEffects: () => undefined,
  travelEntered: () => {},
  allyEntered: () => false,
  eventPlayed: () => {},
  playerCardPlayed: () => {},
  characterReadied: () => {},
  revealedSurge: () => false,
  cardEntered: () => {},
  committed: () => {},
  encounterEnd: () => [],
  cannotDiscardHand: () => false,
  handDiscardDestination: () => false,
  locationProgressPlaced: () => {},
  threatReduction: (_s, amount) => amount,
  enemyDestination: () => false,
  encounter: () => false,
  shadow: () => false,
  effect: () => false,
  abilityLabel: () => undefined,
  abilityProblem: () => null,
  ability: () => false,
};
/** Nightmare effects resolved in a player's own seat (a threat raise is that player's). */
const PLAYER_EFFECTS = new Set(["nmSpidersShadow", "nmWebAttach", "nmThreat"]);
export const NIGHTMARE_CORE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: nmStats,
  cannotReady: nmCannotReady,
  engaged: nmEngaged,
  cardEntered: nmCardEntered,
  characterReadied: nmCharacterReadied,
  hostLeaves: nmHostLeaves,
  explored: (s, u) => campLeft(s, u),
  encounter: nmEncounter,
  shadow: nmShadow,
  effect: nightmareCoreEffect,
  // Journey Along the Anduin.
  cannotAttach: nmCannotAttach,
  cannotCancel: (s, shadow, code) =>
    !shadow && code === N.pursuit && anduinLive(s),
  revealedDoomed: nmRevealedDoomed,
  revealedSurge: nmRevealedSurge,
  combatBegin: nmCombatBegin,
  indestructible: nmIndestructible,
  damageAmount: nmDamageAmount,
  damageDealt: nmDamageDealt,
  cannotAttack: nmCannotAttack,
  cannotDefend: nmCannotDefend,
  enemyAttackStarted: nmEnemyAttackStarted,
  attackFinished: nmAttackFinished,
  check: nmCheck,
  abilityLabel: nmAbilityLabel,
  abilityProblem: nmAbilityProblem,
  ability: nmAbility,
  sharedEffect: (e) => e.kind.startsWith("nm") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareCore(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const seats = s.table?.seats.length ?? 1;
  const player = (p: unknown) =>
    Number.isInteger(p) && (p as number) >= 0 && (p as number) < seats;
  return (
    !!q &&
    typeof q === "object" &&
    nightmareLive(s) &&
    (q.noReady === undefined ||
      (Array.isArray(q.noReady) &&
        q.noReady.every((m) => !!m && round(m.round) && player(m.player)))) &&
    (q.smoking === undefined ||
      (Array.isArray(q.smoking) &&
        q.smoking.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            (m.heroId === undefined || typeof m.heroId === "string"),
        ))) &&
    (q.attackThreat === undefined ||
      (Array.isArray(q.attackThreat) &&
        q.attackThreat.every(
          (m) => !!m && typeof m.enemyId === "string" && player(m.player),
        ))) &&
    (q.sweep === undefined ||
      (Array.isArray(q.sweep) &&
        q.sweep.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            player(m.player) &&
            [m.origin, m.started].every(
              (f) => f === undefined || typeof f === "boolean",
            ) &&
            (m.bonus === undefined || Number.isInteger(m.bonus)),
        )))
  );
}
