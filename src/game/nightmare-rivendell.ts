/**
 * Road to Rivendell's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (an enemy with ambush engaging during the quest phase still counts its
 * [threat] in the staging area), its new stage 2 (Ambush in the Night, in
 * place of Orc Outpost) and its Nightmare encounter cards, composed with the
 * scenario's own rules through batch4Scenario while a Nightmare mode game is
 * played. Effects use the "nrr" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, imageUrl, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  engage,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  revealed,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
} from "./table";
import { mainQuestCode } from "./quest-state";
import { engagementCheckThreat } from "./threat-read";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { ROAD } from "./road-rivendell";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareRivendellState {
  /** Enemies with ambush that engaged a player this quest phase: their [threat] still counts in the staging area. */
  ambushers?: string[];
  /** Treacherous Bluffs' +2 [threat] until the end of the phase: the phase, and each copy's bonus. */
  bluffs?: { key: string; bonus: Record<string, number> };
  /** The round whose first enemy with ambush has been revealed (Concealed Woods). */
  firstAmbushRound?: number;
  /** Treacherous Bluffs' shadow: the attacking enemy whose excess damage goes to Arwen Undómiel. */
  excess?: string;
  /** Arwen Undómiel while Goblin Gate guards her (stage 2B). */
  arwen?: Unit;
}

const rivendellLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "road-to-rivendell";
/** Ambush in the Night is the current stage. */
const nightStage = (s: GameState) => rivendellLive(s) && s.stage === 2;
const printedAmbush = (code: string) =>
  card(code).type_code === "enemy" && /^Ambush\b/m.test(card(code).text ?? "");
/** An enemy with the ambush keyword (printed, or gained from Goblin Gate). */
const ambush = (s: GameState, u: Unit) =>
  card(u.code).type_code === "enemy" &&
  !u.blanked &&
  (printedAmbush(u.code) ||
    (s.roadRivendell?.gateEnemyId === u.id &&
      allActiveLocations(s).some((l) => l.code === ROAD.gate && !l.blanked)));
const arwen = (s: GameState) =>
  allCharacters(s).find((u) => u.code === ROAD.arwen);
/** Arwen Undómiel attached to Goblin Gate. */
const guarded = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some((l) =>
    l.attachments.some((a) => a.code === ROAD.arwen),
  );
/** The phase "until the end of the phase" lasts (the quest and combat phases have two steps here). */
const phaseKey = (s: GameState) =>
  `${s.round}:${s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase}`;

// ------------------------------------------------------------- the setup card

/**
 * "Forced: When an enemy with the ambush keyword engages a player during the
 * quest phase, it contributes its [threat] to the total [threat] in the
 * staging area until the end of the phase."
 */
const rivendellStagingThreat = (s: GameState) =>
  rivendellLive(s)
    ? allEngaged(s)
        .filter((u) => s.nightmare?.ambushers?.includes(u.id))
        .reduce((n, u) => n + Math.max(0, threatOf(s, u)), 0)
    : 0;
function rivendellEndQuest(s: GameState) {
  if (s.nightmare?.ambushers) delete s.nightmare.ambushers;
}

// ------------------------------------------------------------- Ambush in the Night

const NIGHT_QUEST = () => card(D.night).back_quest ?? 12;
/** The stages: Ambush in the Night replaces Orc Outpost. */
function rivendellAdvance(s: GameState) {
  if (!rivendellLive(s) || s.stageRevealing || s.stage > 2) return false;
  if (s.stage === 1) {
    if (s.progress < 20) return false;
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(
      s,
      fx("nrrNight", { player: firstPlayer(s) }),
      fx("nrrNightB", { player: firstPlayer(s) }),
      fx("roadRivendellStageReady"),
    );
    log(s, "Stage 2 · Ambush in the Night", "chapter");
    return true;
  }
  if (s.progress < NIGHT_QUEST()) return true;
  if (questDefeated(s, mainQuestCode(s)!)) return true;
  s.stage = 3;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("reveal", { player })),
    fx("roadRivendellStageReady"),
  );
  log(s, "Stage 3 · Approaching Rivendell", "chapter");
  return true;
}
function rivendellStageInfo(s: GameState) {
  if (!nightStage(s)) return undefined;
  const c = card(D.night);
  return {
    name: c.back_name ?? c.name,
    cardCode: D.night,
    quest: NIGHT_QUEST(),
    story: c.back_text ?? "",
    side: "B" as const,
    questImage: imageUrl({ ...c, imagesrc: c.back_imagesrc }),
  };
}
/** "Progress cannot be placed on this stage unless the players control Arwen Undómiel." */
function rivendellProgress(s: GameState, amount: number, quest: Unit) {
  if (!nightStage(s) || quest.code !== D.night || amount <= 0 || !guarded(s))
    return amount;
  log(
    s,
    "Ambush in the Night: no progress can be placed on this stage while Goblin Gate guards Arwen Undómiel.",
  );
  return 0;
}
/** "Goblin Gate gets +1 quest point for each enemy engaged with a player." */
const rivendellLocationQuestBonus = (s: GameState, u: Unit) =>
  nightStage(s) && live(s, u, ROAD.gate)
    ? allEngaged(s).filter((e) => card(e.code).type_code === "enemy").length
    : 0;
/** Goblin Gate leaves play: Arwen Undómiel is no longer guarded, and the first player controls her again. */
function rivendellAttachmentLeaves(s: GameState, _host: Unit, a: Attachment) {
  if (!rivendellLive(s) || a.code !== ROAD.arwen) return false;
  const stored = s.nightmare?.arwen;
  if (s.nightmare) delete s.nightmare.arwen;
  const u = stored ?? make(s, ROAD.arwen);
  forOwner(s, firstPlayer(s), () => s.allies.push(u));
  log(
    s,
    "Goblin Gate leaves play: Arwen Undómiel is no longer guarded, and the first player controls her again.",
    "good",
  );
  return true;
}

// ------------------------------------------------------------- the cards

function rivendellEngaged(s: GameState, u: Unit) {
  if (!rivendellLive(s)) return;
  const player = ownerOf(s, u);
  if (ambush(s, u)) {
    // The setup card's Forced effect.
    if (s.phase === "quest" || s.phase === "staging") {
      const q = (s.nightmare ??= {});
      q.ambushers = [...new Set([...(q.ambushers ?? []), u.id])];
    }
    // Treacherous Bluffs: "Forced: When an enemy with the ambush keyword
    // engages a player, Treacherous Bluffs gets +2 [threat] until the end of
    // the phase."
    const bluffs = [...s.staging, ...allActiveLocations(s)].filter((l) =>
      live(s, l, D.bluffs),
    );
    if (bluffs.length) {
      const q = (s.nightmare ??= {});
      const key = phaseKey(s);
      const bonus = q.bluffs?.key === key ? { ...q.bluffs.bonus } : {};
      for (const l of bluffs) bonus[l.id] = (bonus[l.id] ?? 0) + 2;
      q.bluffs = { key, bonus };
      log(
        s,
        `Treacherous Bluffs gets +2 [threat] until the end of the phase (${name(u)} engages).`,
        "danger",
      );
    }
  }
  if (u.blanked) return;
  // Goblin Trapper: "Forced: After Goblin Trapper engages a player, that
  // player must exhaust a character he controls."
  if (u.code === D.trapper) prepend(s, fx("nrrTrapper", { player }));
  // Raiding Party: "Forced: After Raiding Party engages a player, each player
  // discards the top card of the encounter deck, starting with the first
  // player. Each player who discards an enemy with the ambush keyword must
  // make an engagement check against that enemy."
  if (u.code === D.raiding)
    prepend(s, ...playerOrder(s).map((p) => fx("nrrRaiding", { player: p })));
}
/** Treacherous Bluffs' +2 [threat] this phase. */
const rivendellThreatBonus = (s: GameState, u: Unit) =>
  live(s, u, D.bluffs) && s.nightmare?.bluffs?.key === phaseKey(s)
    ? (s.nightmare.bluffs.bonus[u.id] ?? 0)
    : 0;
/**
 * Concealed Woods: "While Concealed Woods is the active location, the first
 * enemy with the ambush keyword revealed from the encounter deck each round
 * gains surge." Tumultuous Assault: "If there are no enemies with the ambush
 * keyword in play, Tumultuous Assault gains surge."
 */
function rivendellRevealedSurge(s: GameState, code: string) {
  if (!rivendellLive(s)) return false;
  if (code === D.assault)
    return ![...s.staging, ...allEngaged(s)].some((u) => ambush(s, u));
  if (!printedAmbush(code) || s.nightmare?.firstAmbushRound === s.round)
    return false;
  (s.nightmare ??= {}).firstAmbushRound = s.round;
  return allActiveLocations(s).some((l) => live(s, l, D.woods));
}
/** Uruk Elf-stalker: "Forced: When Uruk Elf-stalker attacks and destroys a character, deal 1 damage to Arwen Undómiel." */
function rivendellCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (!rivendellLive(s) || !context.combatDamage || u.code === ROAD.arwen)
    return;
  const enemy = get(s, context.enemyId);
  const a = arwen(s);
  if (!enemy || !live(s, enemy, D.stalker) || !a) return;
  log(
    s,
    `Uruk Elf-stalker destroys ${name(u)}: 1 damage to Arwen Undómiel.`,
    "danger",
  );
  prepend(s, fx("damage", { target: a.id, value: 1, player: ownerOf(s, a) }));
}
/** Treacherous Bluffs' shadow: "Excess damage dealt by this attack must be assigned to Arwen Undómiel." */
function rivendellDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const id = s.nightmare?.excess;
  if (
    !rivendellLive(s) ||
    !id ||
    !context.combatDamage ||
    context.enemyId !== id ||
    u.code === ROAD.arwen
  )
    return;
  const excess = Math.min(value, u.damage - stats(s, u).health);
  const a = arwen(s);
  if (excess <= 0 || !a) return;
  log(
    s,
    `Treacherous Bluffs: ${excess} excess damage is assigned to Arwen Undómiel.`,
    "danger",
  );
  prepend(
    s,
    fx("damage", { target: a.id, value: excess, player: ownerOf(s, a) }),
  );
}

function rivendellEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!rivendellLive(s) || code !== D.assault) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Tumultuous Assault: "When Revealed: Return each engaged enemy with the
  // ambush keyword to the staging area. Each player makes engagement checks
  // against each enemy in the staging area, as if it were the encounter
  // phase."
  let n = 0;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const back = s.engaged.filter((u) => ambush(s, u));
      s.engaged = s.engaged.filter((u) => !back.includes(u));
      s.staging.push(...back);
      n += back.length;
    });
  log(
    s,
    `Tumultuous Assault returns ${n} engaged ${n === 1 ? "enemy" : "enemies"} with ambush to the staging area; each player makes engagement checks.`,
    "danger",
  );
  prepend(s, fx("engagementRound", { player: firstPlayer(s) }));
  return true;
}

function rivendellShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !rivendellLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Uruk Elf-stalker: "Attacking enemy gets +2 [attack]."
    case D.stalker:
      c.attackBonus += 2;
      return true;
    // Goblin Trapper: "Add Goblin Trapper to the staging area."
    case D.trapper: {
      const at = enemy?.shadows.lastIndexOf(D.trapper) ?? -1;
      if (enemy && at >= 0) removeShadowCard(enemy, at);
      log(s, "Goblin Trapper's shadow adds it to the staging area.", "danger");
      placeEncounter(s, D.trapper, true);
      return true;
    }
    // Treacherous Bluffs: "Excess damage dealt by this attack must be
    // assigned to Arwen Undómiel."
    case D.bluffs:
      if (enemy) (s.nightmare ??= {}).excess = enemy.id;
      return true;
    // Concealed Woods: "Attacking enemy gets +2 [attack] if engaged with the
    // first player."
    case D.woods:
      if (
        enemy &&
        allEngaged(s).some((u) => u.id === enemy.id) &&
        ownerOf(s, enemy) === firstPlayer(s)
      )
        c.attackBonus += 2;
      return true;
  }
  return false;
}
const rivendellAttackFinished = (s: GameState) => {
  if (s.nightmare?.excess) delete s.nightmare.excess;
  return [];
};

// ------------------------------------------------------------- effects

export function nightmareRivendellEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrr")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    // Ambush in the Night, 2A: "When Revealed: Search the encounter deck,
    // discard pile, and victory display for Goblin Gate and add it to the
    // staging area, if able. Shuffle the encounter discard pile into the
    // encounter deck. Discard cards from the top of the encounter deck until
    // X enemies have been discarded, where X is the number of players in the
    // game. Reveal all enemies discarded by this effect."
    case "nrrNight": {
      let found = false;
      for (const pile of [s.encounterDeck, s.encounterDiscard]) {
        const i = pile.indexOf(ROAD.gate);
        if (i < 0) continue;
        pile.splice(i, 1);
        found = true;
        break;
      }
      const v = s.victoryCards?.indexOf(ROAD.gate) ?? -1;
      if (!found && v >= 0) {
        s.victoryCards!.splice(v, 1);
        s.victory = Math.max(0, s.victory - (card(ROAD.gate).victory ?? 0));
        found = true;
      }
      if (found) placeEncounter(s, ROAD.gate, true);
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const x = livingSeats(s).length;
      const enemies: string[] = [];
      const discarded: string[] = [];
      while (enemies.length < x && s.encounterDeck.length) {
        const c = s.encounterDeck.shift()!;
        s.encounterDiscard.push(c);
        discarded.push(c);
        if (card(c).type_code === "enemy") enemies.push(c);
      }
      log(
        s,
        `Ambush in the Night: ${found ? "Goblin Gate enters the staging area; " : ""}${discarded.length} ${discarded.length === 1 ? "card is" : "cards are"} discarded, and ${enemies.map((c) => card(c).name).join(", ") || "no enemy"} ${enemies.length === 1 ? "is" : "are"} revealed.`,
        "danger",
      );
      prepend(
        s,
        ...enemies.map((code) => fx("nrrRevealEnemy", { code, player: p })),
      );
      return true;
    }
    case "nrrRevealEnemy": {
      const i = s.encounterDiscard.lastIndexOf(e.code!);
      if (i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      revealed(s, e.code!);
      return true;
    }
    // 2B: "When Revealed: The first player loses control of Arwen Undómiel
    // and attaches her to Goblin Gate (she is now guarded by Goblin Gate).
    // While she is guarded, the first player cannot gain control of Arwen
    // Undómiel."
    case "nrrNightB": {
      const gate = [...s.staging, ...allActiveLocations(s)].find(
        (l) => l.code === ROAD.gate,
      );
      const a = arwen(s);
      if (!gate || !a) {
        log(
          s,
          "Ambush in the Night: Goblin Gate is not in play to guard Arwen Undómiel.",
        );
        return true;
      }
      const owner = ownerOf(s, a);
      for (const q of playerOrder(s))
        forOwner(s, q, () => {
          s.allies = s.allies.filter((u) => u.id !== a.id);
          s.committedIds = s.committedIds.filter((id) => id !== a.id);
        });
      a.committed = false;
      (s.nightmare ??= {}).arwen = a;
      gate.attachments.push({
        id: `a${s.nextId++}`,
        code: ROAD.arwen,
        exhausted: false,
      });
      log(
        s,
        `Ambush in the Night: ${seatLabel(s, owner) ? `${seatLabel(s, owner).slice(3)} loses` : "the first player loses"} control of Arwen Undómiel; Goblin Gate guards her.`,
        "danger",
      );
      return true;
    }
    case "nrrTrapper": {
      const ready = allCharacters(s).filter(
        (u) => ownerOf(s, u) === p && !u.exhausted,
      );
      if (!ready.length) {
        log(s, "Goblin Trapper: no ready character to exhaust.");
        return true;
      }
      choose(
        s,
        `Goblin Trapper · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("nrrExhaust", { target: u.id, player: p })],
        })),
        card(D.trapper).text,
      );
      return true;
    }
    case "nrrExhaust": {
      const u = get(s, e.target);
      if (u && !u.exhausted) exhaustCharacter(s, u);
      return true;
    }
    case "nrrRaiding": {
      if (!s.encounterDeck.length) {
        log(s, "Raiding Party: the encounter deck is empty.");
        return true;
      }
      const c = s.encounterDeck.shift()!;
      s.encounterDiscard.push(c);
      if (!printedAmbush(c)) {
        log(
          s,
          `Raiding Party: ${card(c).name} is discarded${seatLabel(s, p)}.`,
        );
        return true;
      }
      const u = make(s, c);
      const engages = engagementCheckThreat(s, p) >= engagementCost(s, u);
      log(
        s,
        `Raiding Party: ${card(c).name} is discarded${seatLabel(s, p)}; its engagement check ${engages ? "engages" : "does not engage"}.`,
        engages ? "danger" : "normal",
      );
      if (!engages) return true;
      s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(c), 1);
      s.staging.push(u);
      forOwner(s, p, () => engage(s, u));
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set(["nrrTrapper", "nrrExhaust"]);
export const NIGHTMARE_RIVENDELL_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  advance: rivendellAdvance,
  stageInfo: rivendellStageInfo,
  progress: rivendellProgress,
  locationQuestBonus: rivendellLocationQuestBonus,
  attachmentLeaves: rivendellAttachmentLeaves,
  stagingThreat: rivendellStagingThreat,
  endQuest: rivendellEndQuest,
  engaged: rivendellEngaged,
  threatBonus: rivendellThreatBonus,
  revealedSurge: rivendellRevealedSurge,
  characterDestroyed: rivendellCharacterDestroyed,
  damageDealt: rivendellDamageDealt,
  encounter: rivendellEncounter,
  shadow: rivendellShadow,
  attackFinished: rivendellAttackFinished,
  effect: nightmareRivendellEffect,
  sharedEffect: (e) => e.kind.startsWith("nrr") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareRivendell(
  s: GameState,
  validUnit: (value: unknown) => boolean,
) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const ids = (v: unknown) =>
    Array.isArray(v) && v.every((id) => typeof id === "string");
  return (
    (q.ambushers === undefined || ids(q.ambushers)) &&
    (q.bluffs === undefined ||
      (!!q.bluffs &&
        typeof q.bluffs.key === "string" &&
        !!q.bluffs.bonus &&
        typeof q.bluffs.bonus === "object" &&
        Object.values(q.bluffs.bonus).every(
          (n) => Number.isInteger(n) && n >= 0,
        ))) &&
    (q.firstAmbushRound === undefined ||
      (Number.isInteger(q.firstAmbushRound) &&
        q.firstAmbushRound >= 0 &&
        q.firstAmbushRound <= s.round)) &&
    (q.excess === undefined || typeof q.excess === "string") &&
    (q.arwen === undefined ||
      (validUnit(q.arwen) && q.arwen.code === ROAD.arwen))
  );
}
