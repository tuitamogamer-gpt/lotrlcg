/**
 * Into the Pit's Nightmare Deck (docs/NIGHTMARE.md): its setup card's rule
 * (the damage tokens Cave Torch puts on it), its new stage 2 (Goblin Ambush,
 * in place of Goblin Patrol) and its Nightmare encounter cards, composed with
 * the Khazad-dûm scenario's own rules through batch4Scenario while a
 * Nightmare mode game is played. Effects use the "npt" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, imageUrl, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import { discardAttachment, placeEncounter } from "./board";
import {
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  livingSeats,
  ownerOf,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { NIGHTMARE_KD as K, nightmareLive } from "./nightmare";
import { KHAZAD } from "./khazad-dum";
import { NEUTRAL_LAYER, live, traitOf } from "./nightmare-core";

export interface NightmarePitState {
  /** The damage tokens on Into the Pit's setup card (1 each time Cave Torch exhausts). */
  torchDamage?: number;
}

const pitLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "into-the-pit";
/** Goblin Ambush, the Nightmare Deck's stage 2. */
const ambushStage = (s: GameState) => pitLive(s) && s.stage === 2;
/** Goblin Ambush: "X is 1 plus the number of players in the game." */
const ambushX = (s: GameState) => livingSeats(s).length + 1;
const torches = (s: GameState) =>
  allHeroes(s).flatMap((u) =>
    u.attachments.filter((a) => a.code === KHAZAD.torch).map((a) => ({ u, a })),
  );
const torchReady = (s: GameState) => torches(s).some(({ a }) => !a.exhausted);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const shadowFalls = (u: Unit) =>
  u.attachments.filter((a) => a.code === K.shadowFall && !a.blanked).length;
/** A Dark location (its printed trait, or Shadow-Fall's). */
const isDark = (u: Unit) => hasTrait(u, "Dark") || shadowFalls(u) > 0;
const darkLocations = (s: GameState) => locationsInPlay(s).filter(isDark);
const activeDark = (s: GameState) => allActiveLocations(s).some(isDark);
const fissures = (s: GameState) =>
  locationsInPlay(s).filter((u) => live(s, u, K.fissure)).length;

// ------------------------------------------------------------- the setup card

/**
 * "Forced: After Cave Torch exhausts, place 1 damage token on this card.
 * Then, if there are 5 or more damage tokens on this card, remove Cave Torch
 * from the game." (Patrol Sentry's Forced effect follows.)
 */
function pitAttachmentExhausted(
  s: GameState,
  host: Unit,
  a: Attachment,
): Effect[] {
  if (!pitLive(s) || a.code !== KHAZAD.torch) return [];
  return [fx("nptTorch", { target: host.id, player: firstPlayer(s) })];
}

// ------------------------------------------------------------- Goblin Ambush

/**
 * Goblin Ambush 2A: "When Revealed: The first player must search the
 * encounter deck and discard pile for X Orc enemies and add them to the
 * staging area, where X is 1 plus the number of players in the game. One of
 * these choices must be Patrol Sentry and one must be Patrol Leader, if
 * able."
 */
const pitStageEffects = (s: GameState, stage: number) =>
  pitLive(s) && stage === 2
    ? [fx("nptAmbush", { player: firstPlayer(s) })]
    : undefined;
/** Goblin Ambush 2B: X quest points. */
const pitStageDefeated = (s: GameState) =>
  ambushStage(s) ? s.progress >= ambushX(s) : undefined;
function pitStageInfo(s: GameState) {
  if (!ambushStage(s)) return undefined;
  const c = card(K.ambush);
  return {
    name: c.back_name ?? c.name,
    cardCode: K.ambush,
    quest: ambushX(s),
    story: c.back_text ?? "",
    side: "B" as const,
    questImage: imageUrl({ ...c, imagesrc: c.back_imagesrc }),
  };
}
/** "Progress cannot be placed on Goblin Ambush except by the above effect." */
function pitProgress(s: GameState, amount: number, quest: Unit) {
  if (!ambushStage(s) || quest.code !== K.ambush || amount <= 0) return amount;
  log(
    s,
    "Goblin Ambush: progress can be placed on this stage only as enemies are defeated.",
  );
  return 0;
}
/** "Forced: After an enemy is defeated, place 1 progress on this stage." */
function pitCharacterDestroyed(s: GameState, u: Unit) {
  if (!ambushStage(s) || card(u.code).type_code !== "enemy") return;
  s.progress += 1;
  log(
    s,
    `Goblin Ambush: ${name(u)} is defeated · 1 progress on the stage (${s.progress} of ${ambushX(s)}).`,
    "good",
  );
}

// ------------------------------------------------------------- passives

/** Goblin Lurker: "Cannot be optionally engaged." */
const pitCannotOptionallyEngage = (s: GameState, u: Unit) =>
  live(s, u, K.lurker);
/** Goblin Lurker: "If the active location is a Dark location, Goblin Lurker gets +3 [attack] and -40 engagement cost." */
const pitStats = (s: GameState, u: Unit) =>
  live(s, u, K.lurker) && activeDark(s) ? { attack: 3 } : {};
const pitEngagementBonus = (s: GameState, u: Unit) =>
  live(s, u, K.lurker) && activeDark(s) ? -40 : 0;
/** Shadow Dweller: "Shadow Dweller does not make engagement checks while Cave Torch is in play." */
const pitNoEngagementCheck = (s: GameState, u: Unit) =>
  live(s, u, K.dweller) && torches(s).length > 0;
/** Twisting Shadows: "X is the number of Dark locations in play." ([threat]) */
const pitThreatBonus = (s: GameState, u: Unit) =>
  live(s, u, K.twisting) ? darkLocations(s).length : 0;
/**
 * Twisting Shadows' X quest points; Narrow Fissure: "Each Dark location in
 * play gets +2 quest points."; Shadow-Fall: "Attached location ... gets +3
 * quest points."
 */
function pitLocationQuestBonus(s: GameState, u: Unit) {
  if (!pitLive(s)) return 0;
  return (
    (live(s, u, K.twisting) ? darkLocations(s).length : 0) +
    (isDark(u) ? 2 * fissures(s) : 0) +
    3 * shadowFalls(u)
  );
}
/** Narrow Fissure: "While Cave Torch is ready, progress cannot be placed on Narrow Fissure." */
const pitProgressBlocked = (s: GameState, u: Unit) =>
  live(s, u, K.fissure) && torchReady(s);
/** Shadow-Fall: "Attached location gains the Dark trait." */
const pitDynamicTraits = (s: GameState, u: Unit) =>
  pitLive(s) && shadowFalls(u) > 0 ? ["Dark"] : [];
/** Twisting Shadows: "When Revealed: Remove all progress from each Dark location in play." */
function pitCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancelled: boolean,
) {
  if (!fromReveal || cancelled || !live(s, u, K.twisting)) return;
  const lost = darkLocations(s).reduce((n, l) => n + l.progress, 0);
  for (const l of darkLocations(s)) l.progress = 0;
  log(
    s,
    `Twisting Shadows removes ${lost} progress from the Dark locations in play.`,
    lost ? "danger" : "normal",
  );
}

// ------------------------------------------------------------- Shadow-Fall

function pitEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!pitLive(s) || code !== K.shadowFall) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // "When Revealed: Attach to a non-Dark location in play."
  prepend(s, fx("nptShadowFall", { player: firstPlayer(s) }));
  return true;
}

// ------------------------------------------------------------- shadows

function pitShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !pitLive(s)) return false;
  const enemy = get(s, c.enemyId);
  /** Take this shadow card from the attacking enemy. */
  const take = () => {
    if (!enemy) return;
    const at = enemy.shadows
      .slice(0, enemy.revealedShadowCount ?? enemy.shadows.length)
      .lastIndexOf(code);
    if (at >= 0) removeShadowCard(enemy, at);
  };
  switch (code) {
    // Patrol Sentry: "Add Patrol Sentry to the staging area."
    case K.sentry:
      take();
      placeEncounter(s, code, true);
      log(s, "Patrol Sentry's shadow: it joins the staging area.", "danger");
      return true;
    // Goblin Lurker: "Attacking enemy gets +1 [attack]. (+3 [attack] instead
    // if the active location is a Dark location.)"
    case K.lurker:
      c.attackBonus += activeDark(s) ? 3 : 1;
      return true;
    // Shadow Dweller: "Shuffle Shadow Dweller back into the encounter deck."
    case K.dweller:
      take();
      s.encounterDeck.push(code);
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Shadow Dweller's shadow: it is shuffled into the encounter deck.",
      );
      return true;
    // Twisting Shadows: "Attacking enemy gets +1 [attack] for each Dark
    // location in play."
    case K.twisting:
      c.attackBonus += darkLocations(s).length;
      return true;
    // Shadow-Fall: "Attacking enemy gets +3 [defense] this phase."
    case K.shadowFall:
      if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 3;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmarePitEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("npt")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nptTorch": {
      const q = (s.nightmare ??= {});
      q.torchDamage = (q.torchDamage ?? 0) + 1;
      log(
        s,
        `Into the Pit · Nightmare: Cave Torch exhausts · ${q.torchDamage} ${q.torchDamage === 1 ? "damage token" : "damage tokens"} on the setup card.`,
        q.torchDamage >= 5 ? "danger" : "normal",
      );
      if (q.torchDamage >= 5 && torches(s).length) {
        log(
          s,
          "Into the Pit · Nightmare: 5 damage tokens · Cave Torch is removed from the game.",
          "danger",
        );
        for (const { u, a } of torches(s)) discardAttachment(s, u, a);
      }
      // Patrol Sentry: "Forced: After Cave Torch exhausts, Patrol Sentry
      // makes an immediate attack against the engaged player, if able."
      prepend(
        s,
        ...allEngaged(s)
          .filter((u) => live(s, u, K.sentry))
          .map((u) =>
            fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
          ),
      );
      return true;
    }
    case "nptAmbush": {
      const x = ambushX(s);
      const pool = [...s.encounterDeck, ...s.encounterDiscard];
      const forced = [K.sentry, KHAZAD.leader]
        .filter((c) => pool.includes(c))
        .slice(0, x);
      log(
        s,
        `Goblin Ambush: the first player searches for ${x} Orc enemies (Patrol Sentry and Patrol Leader among them, if able).`,
        "danger",
      );
      prepend(
        s,
        ...forced.map((code) => fx("khazadSearchEnemy", { code })),
        ...Array.from({ length: x - forced.length }, () =>
          fx("nptAmbushPick", { player: p }),
        ),
      );
      return true;
    }
    case "nptAmbushPick": {
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(
            (c) => card(c).type_code === "enemy" && traitOf(c, "Orc"),
          ),
        ),
      ];
      if (!codes.length) {
        log(s, "Goblin Ambush · No Orc enemy is left to search for.");
        return true;
      }
      choose(
        s,
        "Goblin Ambush · Choose an Orc enemy",
        codes.map((c): Option => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("khazadSearchEnemy", { code: c })],
        })),
        card(K.ambush).text,
      );
      return true;
    }
    case "nptShadowFall": {
      const targets = locationsInPlay(s).filter((u) => !isDark(u));
      if (!targets.length) {
        s.encounterDiscard.push(K.shadowFall);
        log(
          s,
          "Shadow-Fall · No non-Dark location is in play; it is discarded.",
        );
        return true;
      }
      choose(
        s,
        "Shadow-Fall · Attach to a non-Dark location",
        targets.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("nptAttachShadowFall", { target: u.id })],
        })),
        card(K.shadowFall).text,
      );
      return true;
    }
    case "nptAttachShadowFall": {
      const u = get(s, e.target);
      if (!u) {
        s.encounterDiscard.push(K.shadowFall);
        return true;
      }
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: K.shadowFall,
        exhausted: false,
      });
      log(
        s,
        `Shadow-Fall is attached to ${name(u)}: it gains the Dark trait and +3 quest points.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set(["nptAmbushPick", "nptShadowFall"]);
export const NIGHTMARE_PIT_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageEffects: pitStageEffects,
  stageDefeated: pitStageDefeated,
  stageInfo: pitStageInfo,
  progress: pitProgress,
  characterDestroyed: pitCharacterDestroyed,
  attachmentExhausted: pitAttachmentExhausted,
  cannotOptionallyEngage: pitCannotOptionallyEngage,
  stats: pitStats,
  engagementBonus: pitEngagementBonus,
  noEngagementCheck: pitNoEngagementCheck,
  threatBonus: pitThreatBonus,
  locationQuestBonus: pitLocationQuestBonus,
  locationProgressBlocked: pitProgressBlocked,
  dynamicTraits: pitDynamicTraits,
  cardEntered: pitCardEntered,
  encounter: pitEncounter,
  shadow: pitShadow,
  effect: nightmarePitEffect,
  sharedEffect: (e) => e.kind.startsWith("npt") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmarePit(s: GameState) {
  const n = s.nightmare?.torchDamage;
  return n === undefined || (Number.isInteger(n) && n >= 0);
}
