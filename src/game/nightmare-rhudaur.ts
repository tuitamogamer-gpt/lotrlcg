/**
 * The Treachery of Rhudaur's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rules (the Sift through the Debris, Decipher Ancient Texts and
 * Quiet the Spirits encounter sets are set aside, out of play, by the
 * scenario's setup; after the players advance to stage 2B, the set of each
 * investigation side quest that was not defeated is shuffled into the
 * encounter deck with its discard pile) and its Nightmare encounter cards,
 * composed with the scenario's own rules (src/game/rhudaur.ts) through
 * batch4Scenario while a Nightmare mode game is played. Effects use the
 * "nrh" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { ThreatReason } from "./board";
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
  stats,
} from "./core";
import { enterEnemyEngaged, raiseThreat, removeFromQuest } from "./board";
import { beginEnemyAttack, enemyAttackStarted } from "./combat";
import {
  activeSeat,
  allActiveLocations,
  defendersFor,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { canRemoveQuestTime, removeQuestTime } from "./quest-time";
import { dealEnemyShadows } from "./considered-engagement";
import { RHUDAUR as R } from "./rhudaur-support";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
  traitOf,
  undefended,
} from "./nightmare-core";

export interface NightmareRhudaurState {
  /** The Sift through the Debris, Decipher Ancient Texts and Quiet the Spirits encounter sets, set aside out of play (their cards' codes). */
  rhudaurAside?: string[];
  /** The progress placed on the main quest this round (Secret Antechamber's limit). */
  rhudaurMainProgress?: { round: number; placed: number };
  /** The Undead enemies in play that have entered play (a return to the staging area is not an entry): Forgotten Courtyard. */
  rhudaurEntered?: string[];
}

const nrhLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "the-treachery-of-rhudaur" &&
  !!s.rhudaur;
/** Each investigation side quest's encounter set (the icons on the setup card's back). */
export const RHUDAUR_NIGHTMARE_SETS: Record<string, string> = {
  [R.debris]: N.antechamber,
  [R.texts]: N.drain,
  [R.spirits]: N.apostate,
};
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const undead = (code: string) => traitOf(code, "Undead");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter(isEnemy);
const thaurdir = (s: GameState) =>
  enemiesInPlay(s).find((u) => u.code === R.thaurdir);
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
/** Secret Antechamber: "no more than 5 progress can be placed on the main quest each round." */
const ANTECHAMBER_CAP = 5;
/** Resolve a lone option directly; let the player choose between several. */
function pick(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  text?: string,
) {
  if (!options.length) return;
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () => choose(s, title, options, text));
}

// ------------------------------------------------------------- the cards

/** Undead Thrall: "Indestructible." */
const nrhIndestructible = (s: GameState, u: Unit) =>
  nrhLive(s) && live(s, u, N.thrall);
/** Secret Antechamber: "Immune to player card effects." */
const nrhImmune = (s: GameState, u: Unit) =>
  nrhLive(s) && live(s, u, N.antechamber);
/** Forgotten Courtyard: "Forgotten Courtyard gets +1 [threat] for each resource on it." */
const nrhThreatBonus = (s: GameState, u: Unit) =>
  nrhLive(s) && live(s, u, N.courtyard) ? u.resources : 0;
/** Forgotten Courtyard: "Forced: After an Undead enemy enters play, place 1 resource on Forgotten Courtyard." */
function nrhEnemyEntered(s: GameState, u: Unit) {
  if (!nrhLive(s) || !undead(u.code)) return;
  // An enemy returning to the staging area from engagement is already in play.
  const q = (s.nightmare ??= {});
  if (q.rhudaurEntered?.includes(u.id)) return;
  const inPlay = new Set(enemiesInPlay(s).map((x) => x.id));
  q.rhudaurEntered = [
    ...(q.rhudaurEntered ?? []).filter((id) => inPlay.has(id)),
    u.id,
  ];
  const yards = [...s.staging, ...allActiveLocations(s)].filter((l) =>
    live(s, l, N.courtyard),
  );
  for (const yard of yards) yard.resources++;
  if (yards.length)
    log(
      s,
      `Forgotten Courtyard: ${name(u)} enters play, so 1 resource is placed on ${yards.length === 1 ? "it" : "each copy"}.`,
      "danger",
    );
}
/** Secret Antechamber's limit on the main quest's progress each round. */
function nrhProgress(s: GameState, amount: number, quest: Unit) {
  if (!nrhLive(s) || amount <= 0 || quest.id !== mainQuestUnit(s)?.id)
    return amount;
  if (!staged(s, N.antechamber).length) return amount;
  const q = s.nightmare?.rhudaurMainProgress;
  const placed = q?.round === s.round ? q.placed : 0;
  const allowed = Math.min(amount, Math.max(0, ANTECHAMBER_CAP - placed));
  if (allowed < amount)
    log(
      s,
      `Secret Antechamber: no more than ${ANTECHAMBER_CAP} progress can be placed on the main quest this round (${allowed} of ${amount}).`,
      "danger",
    );
  return allowed;
}
function nrhQuestProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (!nrhLive(s) || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return;
  const n = (s.nightmare ??= {});
  const placed =
    n.rhudaurMainProgress?.round === s.round ? n.rhudaurMainProgress.placed : 0;
  n.rhudaurMainProgress = { round: s.round, placed: placed + amount };
}
/** Secret Antechamber: "Travel: Raise each player's threat by 3 to travel here." */
function nrhTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!nrhLive(s) || !live(s, u, N.antechamber)) return undefined;
  return playerOrder(s).map((player) =>
    fx("heirsThreat", { value: 3, player }),
  );
}
/** Apostate of Angmar: "While you are engaged with Apostate of Angmar, you cannot attack Thaurdir." */
function nrhCannotAttack(s: GameState, character: Unit, enemy: Unit) {
  if (!nrhLive(s) || enemy.code !== R.thaurdir) return false;
  return seatView(s, ownerOf(s, character)).engaged.some((x) =>
    live(s, x, N.apostate),
  );
}
/** Thaurdir's Hunter: its attack treated as undefended. */
const nrhCannotDefend = (s: GameState, enemy: Unit) =>
  nrhLive(s) && !!s.combat?.nmUndefended && s.combat.enemyId === enemy.id;
/** Life Drain, attached: "Thaurdir gets +3 hit points." */
function nrhStats(s: GameState, u: Unit) {
  if (!nrhLive(s) || u.code !== R.thaurdir) return {};
  const drains = u.attachments.filter(
    (a) => a.code === N.drain && !a.blanked,
  ).length;
  return drains ? { health: 3 * drains } : {};
}
/**
 * Charred Cellar (active): "Forced: After a player's threat is increased by
 * an encounter card effect, that player must deal 2 damage to a character
 * he controls."
 */
function nrhThreatRaised(
  s: GameState,
  player: number,
  amount: number,
  reason?: ThreatReason,
) {
  if (!nrhLive(s) || amount <= 0 || reason !== "encounter") return;
  const cellars = allActiveLocations(s).filter((l) =>
    live(s, l, N.cellar),
  ).length;
  for (let i = 0; i < cellars; i++) prepend(s, fx("nrhCellar", { player }));
}
/**
 * Thaurdir's Hunter: "Forced: When Thaurdir's Hunter attacks, either remove
 * 1 time counter from the main quest, or treat this attack as undefended."
 * A normal attack is suspended before its defenders are declared, so the
 * choice comes first; an immediate attack asks for its defender afterwards.
 */
function nrhBeforeNormalDefense(s: GameState, enemy: Unit, ids: string[]) {
  if (!nrhLive(s) || !live(s, enemy, N.hunter)) return false;
  const player = activeSeat(s);
  prepend(s, fx("nrhHunter", { target: enemy.id, ids, flag: true, player }));
  enemyAttackStarted(s, enemy, player);
  return true;
}
function nrhEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (!nrhLive(s) || !live(s, enemy, N.hunter)) return;
  if (!s.combat?.immediate || s.combat.enemyId !== enemy.id) return;
  prepend(s, fx("nrhHunter", { target: enemy.id, player }));
}
/**
 * Malevolent Forces' shadow: "If this attack destroys a character, heal all
 * damage from each Undead enemy in play." Life Drain's: "If this attack
 * destroys a character, attach Life Drain to Thaurdir."
 */
function nrhCharacterDestroyed(
  s: GameState,
  u: Unit,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (
    !nrhLive(s) ||
    !c ||
    !isCharacter(u) ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId
  )
    return;
  if (c.nmUndeadHealOnKill) {
    c.nmUndeadHealOnKill = 0;
    prepend(s, fx("nrhHealUndead"));
  }
  if (c.nmLifeDrain) {
    const copies = c.nmLifeDrain;
    c.nmLifeDrain = 0;
    prepend(
      s,
      ...Array.from({ length: copies }, () =>
        fx("nrhDrainAttach", { source: c.enemyId }),
      ),
    );
  }
}

function nrhEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nrhLive(s) || (code !== N.forces && code !== N.drain)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.drain) {
    // Life Drain: "When Revealed: Deal Life Drain to Thaurdir, as a shadow
    // card."
    const boss = thaurdir(s);
    if (!boss) {
      log(s, "Life Drain: Thaurdir is not in play.");
      s.encounterDiscard.push(code);
      return true;
    }
    boss.shadows.push(code);
    if (boss.faceupShadows) boss.faceupShadows.push(false);
    log(s, "Life Drain is dealt to Thaurdir as a shadow card.", "danger");
    return true;
  }
  // Malevolent Forces: "When Revealed: Remove the questing character with
  // the highest [willpower] from the quest. The player who controls that
  // character raises his threat by an amount equal to that character's
  // [willpower]."
  s.encounterDiscard.push(code);
  const questing = globalCharacters(s).filter(
    (u) => isCharacter(u) && u.committed,
  );
  if (!questing.length) {
    log(s, "Malevolent Forces: no character is questing.");
    return true;
  }
  const high = Math.max(...questing.map((u) => stats(s, u).will));
  const highest = questing.filter((u) => stats(s, u).will === high);
  pick(
    s,
    firstPlayer(s),
    "Malevolent Forces · Remove the questing character with the highest [willpower]",
    highest.map((u) => ({
      id: u.id,
      code: u.code,
      label: `${name(u)} · ${high} [willpower]`,
      effects: [fx("nrhRemove", { target: u.id, player: ownerOf(s, u) })],
    })),
    card(code).text,
  );
  return true;
}

function nrhShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nrhLive(s)) return false;
  const p = defendingPlayer(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Thaurdir's Hunter: "If this attack is undefended, either remove 1 time
    // counter or 5 progress from a quest."
    case N.hunter:
      if (!undefended(s)) {
        log(s, "Thaurdir's Hunter: this attack is defended.");
        return true;
      }
      prepend(s, fx("nrhHunterShadow", { player: p }));
      return true;
    // Undead Thrall: "Put Undead Thrall into play engaged with the defending
    // player and deal it a shadow card."
    case N.thrall: {
      const at = enemy?.shadows.lastIndexOf(code) ?? -1;
      if (!enemy || at < 0) return true;
      removeShadowCard(enemy, at);
      const thrall = make(s, code);
      enterEnemyEngaged(s, thrall, p);
      if (!globalEngaged(s).some((x) => x.id === thrall.id)) {
        s.encounterDiscard.push(code);
        return true;
      }
      dealEnemyShadows(s, thrall, 1);
      log(
        s,
        `Undead Thrall enters play engaged with ${who(s, p)} and is dealt a shadow card.`,
        "danger",
      );
      return true;
    }
    // Malevolent Forces: "If this attack destroys a character, heal all
    // damage from each Undead enemy in play."
    case N.forces:
      c.nmUndeadHealOnKill = (c.nmUndeadHealOnKill ?? 0) + 1;
      return true;
    // Apostate of Angmar: "Discard the top card of the encounter deck.
    // Attacking enemy gets +X [attack], where X is that card's printed
    // [threat]."
    case N.apostate: {
      const top = encounterDraw(s, true);
      if (!top) return true;
      s.encounterDiscard.push(top);
      const x = card(top).threat ?? 0;
      c.attackBonus += x;
      log(
        s,
        `Apostate of Angmar: ${card(top).name} is discarded; the attacking enemy gets +${x} [attack].`,
        x ? "danger" : undefined,
      );
      return true;
    }
    // Life Drain: "If attacking enemy is Thaurdir, he gets +3 [attack] for
    // this attack. If this attack destroys a character, attach Life Drain to
    // Thaurdir."
    case N.drain:
      if (enemy?.code === R.thaurdir) {
        c.attackBonus += 3;
        log(
          s,
          "Life Drain: Thaurdir gets +3 [attack] for this attack.",
          "danger",
        );
      }
      c.nmLifeDrain = (c.nmLifeDrain ?? 0) + 1;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareRhudaurEffect(s: GameState, e: Effect): boolean {
  if (!nrhLive(s)) return false;
  // After stage 2A resolves (the players advance to stage 2B).
  if (e.kind === "rhudaurStageTwo") {
    prepend(s, fx("nrhStageTwoB", { player: firstPlayer(s) }));
    return false;
  }
  if (!e.kind.startsWith("nrh")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nrhStageTwoB": {
      // "For each of the above sidequests that was not defeated, shuffle the
      // encounter set that matches its title into the encounter deck, and
      // shuffle the encounter discard pile into the encounter deck."
      const q = (s.nightmare ??= {});
      const removed = s.removedEncounter ?? [];
      const sets = Object.entries(RHUDAUR_NIGHTMARE_SETS)
        .filter(([side]) => removed.includes(side))
        .map(([, code]) => code);
      const aside = q.rhudaurAside ?? [];
      const joining = aside.filter((code) => sets.includes(code));
      q.rhudaurAside = aside.filter((code) => !sets.includes(code));
      s.encounterDeck.push(...joining, ...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      log(
        s,
        sets.length
          ? `The Treachery of Rhudaur: the ${sets.map((c) => card(c).name).join(", ")} set${sets.length === 1 ? " is" : "s are"} shuffled into the encounter deck with the encounter discard pile (${sets.length === 1 ? "its side quest was" : "their side quests were"} not defeated).`
          : "The Treachery of Rhudaur: each side quest was defeated; the encounter discard pile is shuffled into the encounter deck.",
        sets.length ? "danger" : undefined,
      );
      return true;
    }
    case "nrhHunter": {
      // A normal attack resumes with the defenders chosen for it (none when
      // it is treated as undefended).
      const normal = e.flag === true;
      const resume = (ids: string[]) =>
        normal ? [fx("nrhDefend", { target: e.target, ids, player: p })] : [];
      const options: Option[] = [];
      if (canRemoveQuestTime(s))
        options.push({
          id: "time",
          label: "Remove 1 time counter from the main quest",
          effects: [fx("nrhTime", { code: N.hunter }), ...resume(e.ids ?? [])],
        });
      options.push({
        id: "undefended",
        label: "Treat this attack as undefended",
        effects: [
          fx("nrhUndefended", { target: e.target, flag: normal }),
          ...resume([]),
        ],
      });
      pick(
        s,
        p,
        `Thaurdir's Hunter${seatLabel(s, p)} · Choose one`,
        options,
        card(N.hunter).text,
      );
      return true;
    }
    case "nrhUndefended": {
      log(
        s,
        "Thaurdir's Hunter: this attack is treated as undefended.",
        "danger",
      );
      // An immediate attack's defender is chosen after this.
      const c = s.combat;
      if (!e.flag && c && c.enemyId === e.target) {
        c.nmUndefended = true;
        c.defenderId = null;
        c.defenderIds = [];
      }
      return true;
    }
    case "nrhDefend": {
      if (!u) return true;
      const ids = (e.ids ?? []).filter((id) =>
        defendersFor(s, u).some((d) => d.id === id),
      );
      beginEnemyAttack(s, u, ids, false, false, true);
      return true;
    }
    case "nrhTime":
      log(
        s,
        `${card(e.code ?? N.hunter).name}: 1 time counter is removed from the main quest.`,
        "danger",
      );
      removeQuestTime(s, 1);
      return true;
    case "nrhHunterShadow": {
      const options: Option[] = [];
      if (canRemoveQuestTime(s))
        options.push({
          id: "time",
          label: "Remove 1 time counter from the main quest",
          effects: [fx("nrhTime", { code: N.hunter })],
        });
      for (const quest of allQuestUnits(s).filter((x) => x.progress > 0))
        options.push({
          id: `progress-${quest.id}`,
          code: quest.code,
          label: `Remove 5 progress from ${name(quest)}`,
          effects: [fx("nrhProgressLoss", { target: quest.id, value: 5 })],
        });
      if (!options.length) {
        log(s, "Thaurdir's Hunter: no quest has a time counter or progress.");
        return true;
      }
      pick(
        s,
        p,
        `Thaurdir's Hunter${seatLabel(s, p)} · Remove 1 time counter or 5 progress from a quest`,
        options,
        card(N.hunter).shadow,
      );
      return true;
    }
    case "nrhProgressLoss": {
      const quest = allQuestUnits(s).find((x) => x.id === e.target);
      if (!quest) return true;
      const n = Math.min(quest.progress, e.value ?? 0);
      if (quest.id === mainQuestUnit(s)?.id) s.progress -= n;
      else quest.progress -= n;
      log(
        s,
        `Thaurdir's Hunter: ${n} progress is removed from ${name(quest)}.`,
        "danger",
      );
      return true;
    }
    case "nrhCellar": {
      const view = seatView(s, p);
      const targets = [...view.heroes, ...view.allies].filter(isCharacter);
      pick(
        s,
        p,
        `Charred Cellar${seatLabel(s, p)} · Deal 2 damage to a character you control`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [fx("damage", { target: x.id, value: 2, player: p })],
        })),
        card(N.cellar).text,
      );
      return true;
    }
    case "nrhRemove": {
      if (!u || !u.committed) return true;
      const will = Math.max(0, stats(s, u).will);
      forOwner(s, ownerOf(s, u), () => removeFromQuest(s, u));
      log(
        s,
        `Malevolent Forces: ${name(u)} is removed from the quest; ${who(s, p)} raise${s.table ? "s their" : " your"} threat by ${will}.`,
        "danger",
      );
      if (will) forOwner(s, p, () => raiseThreat(s, will, "encounter"));
      return true;
    }
    case "nrhHealUndead": {
      const hurt = enemiesInPlay(s).filter(
        (x) => undead(x.code) && x.damage > 0,
      );
      for (const x of hurt) x.damage = 0;
      log(
        s,
        hurt.length
          ? `Malevolent Forces: all damage is healed from ${hurt.map(name).join(", ")}.`
          : "Malevolent Forces: no Undead enemy is damaged.",
        hurt.length ? "danger" : undefined,
      );
      return true;
    }
    case "nrhDrainAttach": {
      // Attached to Thaurdir despite his "Cannot have attachments": the
      // Nightmare card names him.
      const boss = thaurdir(s);
      const host = get(s, e.source);
      const at = host?.shadows.indexOf(N.drain) ?? -1;
      if (!boss || !host || at < 0) return true;
      removeShadowCard(host, at);
      // It counts as a Condition attachment (attachmentHasTrait reads its
      // shadow text).
      boss.attachments.push({
        id: `a${s.nextId++}`,
        code: N.drain,
        exhausted: false,
      });
      log(
        s,
        "Life Drain is attached to Thaurdir: he gets +3 hit points.",
        "danger",
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_RHUDAUR_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  indestructible: nrhIndestructible,
  immune: nrhImmune,
  threatBonus: nrhThreatBonus,
  enemyEntered: nrhEnemyEntered,
  progress: nrhProgress,
  questProgressPlaced: nrhQuestProgressPlaced,
  travelEffects: nrhTravelEffects,
  cannotAttack: nrhCannotAttack,
  cannotDefend: nrhCannotDefend,
  stats: nrhStats,
  threatRaised: nrhThreatRaised,
  enemyAttackStarted: nrhEnemyAttackStarted,
  beforeNormalDefense: nrhBeforeNormalDefense,
  characterDestroyed: nrhCharacterDestroyed,
  encounter: nrhEncounter,
  shadow: nrhShadow,
  effect: nightmareRhudaurEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareRhudaur(s: GameState) {
  const q = s.nightmare;
  if (
    q?.rhudaurAside === undefined &&
    q?.rhudaurMainProgress === undefined &&
    q?.rhudaurEntered === undefined
  )
    return true;
  const sets = Object.values(RHUDAUR_NIGHTMARE_SETS);
  return (
    nrhLive(s) &&
    (q.rhudaurAside === undefined ||
      (Array.isArray(q.rhudaurAside) &&
        q.rhudaurAside.every((code) => sets.includes(code)) &&
        sets.every(
          (code) => q.rhudaurAside!.filter((c) => c === code).length <= 3,
        ))) &&
    (q.rhudaurMainProgress === undefined ||
      (!!q.rhudaurMainProgress &&
        Number.isInteger(q.rhudaurMainProgress.round) &&
        q.rhudaurMainProgress.round >= 0 &&
        q.rhudaurMainProgress.round <= s.round &&
        Number.isInteger(q.rhudaurMainProgress.placed) &&
        q.rhudaurMainProgress.placed >= 0)) &&
    (q.rhudaurEntered === undefined ||
      (Array.isArray(q.rhudaurEntered) &&
        q.rhudaurEntered.every((id) => typeof id === "string") &&
        new Set(q.rhudaurEntered).size === q.rhudaurEntered.length))
  );
}
