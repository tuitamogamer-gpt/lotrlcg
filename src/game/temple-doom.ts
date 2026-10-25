import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  enemyAttackPrevented,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
  putPlayerDeck,
  reorderPlayerDeck,
} from "./core";
import {
  addVictoryCard,
  damage,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
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
  seatView,
} from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { isHero, isAlly } from "./card-types";
import {
  SHADOW_EAST_SHARED_HOOKS as SHARED,
  shadowEastEnemies,
  shadowEastTrait,
} from "./shadow-east-encounters";
import {
  TEMPLE_DOOM as T,
  TEMPLE_DOOM_RECIPES,
  TEMPLE_DOOM_STAGE_TWOS,
  templeDoomQuestCount,
  templeDoomX,
  templeDoomStageInfo,
} from "./temple-doom-support";
export * from "./temple-doom-support";

type Combat = NonNullable<GameState["combat"]> & {
  doomUlchor?: boolean;
  doomTributeOnKill?: number;
  doomKilledCharacter?: boolean;
};
const live = (s: GameState, code: string) =>
  s.staging.some((u) => u.code === code && !u.blanked);
const tribute = (s: GameState) => s.staging.find((u) => u.code === T.tribute);
const ulchor = (s: GameState) =>
  shadowEastEnemies(s).find((u) => u.code === T.ulchor);
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const stage = (s: GameState, code: string) =>
  s.templeDoom?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const fanatics = (u: Unit) =>
  u.attachments.filter((a) => a.code === T.fanaticism && !a.blanked).length;
const trait = shadowEastTrait;
const options = (units: Unit[], effect: Effect): Option[] =>
  units.map((u) => ({
    id: u.id,
    code: u.code,
    label: name(u),
    effects: [{ ...effect, target: u.id }],
  }));
const restrictions = (s: GameState, u: Unit, healing = false) =>
  !!s.templeDoom?.restrictions.some(
    (r) =>
      r.id === u.id &&
      r.round === s.round &&
      (r.until === "round" ? !healing : s.phase !== "refresh"),
  );

function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  log(s, reason, "danger");
}
function addTribute(s: GameState, count = 1) {
  const u = tribute(s);
  if (!u || count <= 0) return;
  u.damage += count;
  log(s, `Tribute to Mordor gains ${count} damage (${u.damage}).`, "danger");
}
function takeTop(s: GameState) {
  const c = encounterDraw(s);
  if (c) s.encounterDiscard.push(c);
  return c;
}
function addDiscardedEnemy(s: GameState, code: string) {
  const i = s.encounterDiscard.lastIndexOf(code);
  if (i < 0) return;
  s.encounterDiscard.splice(i, 1);
  const u = make(s, code);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function finishTreachery(s: GameState, id: string, discard = true) {
  const q = s.templeDoom!,
    i = q.resolving.findIndex((u) => u.id === id);
  if (i < 0) return;
  const u = q.resolving.splice(i, 1)[0];
  if (discard) s.encounterDiscard.push(u.code);
  return u;
}
function forcedEngagements(s: GameState) {
  const boss = ulchor(s),
    bossPlayer =
      boss && allEngaged(s).some((u) => u.id === boss.id)
        ? ownerOf(s, boss)
        : undefined;
  for (const u of shadowEastEnemies(s)) {
    const p =
      !u.blanked && u.code === T.khamul
        ? firstPlayer(s)
        : !u.blanked && u.code === T.guard
          ? bossPlayer
          : undefined;
    if (p !== undefined && !seatView(s, p).engaged.some((e) => e.id === u.id))
      forOwner(s, p, () => engage(s, u));
  }
}
function returnDial(s: GameState, questId: string) {
  const q = s.templeDoom!,
    groups = q.underDial.filter((g) => g.questId === questId);
  q.underDial = q.underDial.filter((g) => g.questId !== questId);
  for (const group of groups)
    forOwner(s, group.player, () => {
      if (s.table?.seats[group.player].eliminated) {
        for (const u of group.cards)
          forOwner(s, u.owner ?? group.player, () => s.discard.push(u.code));
        return;
      }
      for (const u of group.cards) putPlayerDeck(s, u);
      reorderPlayerDeck(
        s,
        0,
        shuffle(
          s,
          s.deck.map((_, i) => i),
        ),
      );
    });
}

/** Eliminated players' archived cards cannot return to their empty decks. */
export function templeDoomPlayerEliminated(s: GameState, player: number) {
  const q = s.templeDoom;
  if (!q) return;
  const groups = q.underDial.filter((g) => g.player === player);
  q.underDial = q.underDial.filter((g) => g.player !== player);
  for (const group of groups)
    for (const u of group.cards)
      forOwner(s, u.owner ?? player, () => s.discard.push(u.code));
}

export function setupTempleDoom(s: GameState) {
  const recipe = TEMPLE_DOOM_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.templeDoom = {
    initialized: false,
    advancing: false,
    currentQuest: T.first,
    questDeck: shuffle(s, [...TEMPLE_DOOM_STAGE_TWOS]),
    powerDeck: shuffle(s, pile("sharedEncounterDeck2")),
    questResources: 0,
    enteredEnemies: [],
    resolving: [],
    underDial: [],
    memoryThreat: { round: 0, value: 0 },
    lordLimit: { round: 0, value: 0, placed: 0 },
    restrictions: [],
    blankRound: -1,
    played: { round: 0, counts: {} },
    protected: [],
    reduced: { round: 0, counts: {} },
  };
  for (const code of pile("sharedStagingArea")) {
    const u = make(s, code);
    s.staging.push(u);
    if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  }
}
export function templeDoomOpeningHandsKept(s: GameState) {
  if (!s.templeDoom || s.templeDoom.initialized) return false;
  prepend(s, fx("doomSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function templeDoomCheck(s: GameState) {
  if (!s.templeDoom || s.status !== "playing") return;
  forcedEngagements(s);
}
export function templeDoomAdvance(s: GameState) {
  const q = s.templeDoom;
  if (!q) return false;
  const goal = templeDoomStageInfo(s)?.quest ?? 0;
  if (
    q.initialized &&
    !q.advancing &&
    q.currentQuest !== T.first &&
    !s.stageRevealing &&
    templeDoomQuestCount(s) < 4 &&
    goal > 0 &&
    s.progress >= goal
  ) {
    q.advancing = true;
    prepend(
      s,
      fx("doomDefeatQuest", { code: q.currentQuest, player: firstPlayer(s) }),
    );
  }
  return true;
}
export function templeDoomPlanningEnd(s: GameState) {
  const q = s.templeDoom;
  if (!q || !stage(s, T.first)) return;
  q.questResources++;
  if (q.questResources === 2) {
    q.advancing = true;
    prepend(
      s,
      fx("doomDefeatQuest", {
        code: q.currentQuest,
        flag: true,
        player: firstPlayer(s),
      }),
    );
  }
}
export function templeDoomQuestBegin(s: GameState): Effect[] {
  const q = s.templeDoom;
  if (!q) return [];
  q.memoryThreat = { round: s.round, value: 0 };
  q.lordLimit = { round: s.round, value: 0, placed: 0 };
  if (stage(s, T.memory)) return [fx("doomMemory")];
  if (stage(s, T.shrine))
    return playerOrder(s).map((player) => fx("doomShrine", { player }));
  if (stage(s, T.lord))
    return playerOrder(s).map((player) => fx("doomLord", { player }));
  if (stage(s, T.legacy))
    return playerOrder(s).map((player) => fx("doomLegacy", { player }));
  return [];
}
export function templeDoomProgress(s: GameState, amount: number, quest: Unit) {
  const q = s.templeDoom;
  if (!q || quest.code !== q.currentQuest) return amount;
  if (
    s.stageRevealing ||
    q.currentQuest === T.first ||
    (!quest.blanked && templeDoomQuestCount(s) === 4)
  )
    return 0;
  if (
    q.currentQuest === T.lord &&
    !quest.blanked &&
    q.lordLimit.round === s.round
  )
    return Math.min(
      amount,
      Math.max(0, q.lordLimit.value - q.lordLimit.placed),
    );
  return amount;
}
export function templeDoomStats(s: GameState, u: Unit) {
  const base = SHARED.stats?.(s, u) ?? {};
  return {
    ...base,
    attack: (base.attack ?? 0) + fanatics(u),
    defense: (base.defense ?? 0) + fanatics(u),
  };
}
export function templeDoomThreatBonus(s: GameState, u: Unit) {
  return (
    (SHARED.threatBonus?.(s, u) ?? 0) +
    fanatics(u) +
    (!u.blanked && [T.ulchor, T.hall].includes(u.code) ? templeDoomX(s) : 0)
  );
}
export function templeDoomCannotEngage(s: GameState, u: Unit) {
  if (u.blanked) return false;
  if (u.code === T.ulchor) return templeDoomX(s) !== 5;
  if (u.code === T.khamul) return activeSeat(s) !== firstPlayer(s);
  const boss = ulchor(s);
  return (
    u.code === T.guard &&
    !!boss &&
    allEngaged(s).some((e) => e.id === boss.id) &&
    ownerOf(s, boss) !== activeSeat(s)
  );
}
export function templeDoomCanSelectSideQuest(s: GameState, u: Unit) {
  if (u.code !== T.tribute || u.blanked) return true;
  const boss = ulchor(s);
  return !boss || boss.damage >= stats(s, boss).health;
}
export function templeDoomHostLeaves(s: GameState, u: Unit) {
  if (!s.templeDoom || u.blanked || card(u.code).type_code !== "location")
    return;
  if (u.code === T.temple) prepend(s, fx("doomTribute", { value: 1 }));
  if (u.code === T.opening)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("doomRandomDiscard", { player })),
    );
  if (u.code === T.passage)
    prepend(
      s,
      ...allCharacters(s)
        .filter((c) => c.exhausted)
        .map((c) => fx("damage", { target: c.id, value: 1 })),
    );
  if (u.code === T.hall)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("doomHall", { player, value: templeDoomX(s) }),
      ),
    );
}
export function templeDoomCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancelled: boolean,
) {
  if (!s.templeDoom || !fromReveal || cancelled || u.blanked) return;
  if (u.code === T.passage) {
    const old = allActiveLocations(s).filter((l) => l.id !== u.id);
    s.staging = s.staging.filter((l) => l.id !== u.id);
    s.staging.push(...old);
    s.activeLocation = u;
    s.extraActiveLocations = [];
  }
  if (u.code === T.tunnel) {
    while (s.encounterDeck.length) {
      const code = takeTop(s)!;
      if (card(code).type_code === "enemy") {
        addDiscardedEnemy(s, code);
        break;
      }
    }
  }
  if (u.code === T.eye)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("doomEyeDiscard", { player })),
    );
  if (u.code === T.lost)
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        const units: Unit[] = [];
        while (units.length < 10 && s.deck.length) {
          const physical = takePlayerDeck(s);
          physical.owner ??= p;
          units.push(physical);
        }
        s.templeDoom!.underDial.push({
          questId: u.id,
          player: p,
          cards: units,
        });
      });
}
export function templeDoomEngaged(s: GameState, u: Unit) {
  if (!s.templeDoom) return;
  if (!card(u.code).is_unique && live(s, T.armies))
    prepend(s, fx("doomArmyProtect", { target: u.id, value: s.round }));
  forcedEngagements(s);
}
export function templeDoomThreatRaised(
  s: GameState,
  player: number,
  _amount: number,
) {
  if (!s.templeDoom) return;
  for (const g of s.templeDoom.underDial.filter(
    (g) =>
      g.player === player &&
      s.staging.some((u) => u.id === g.questId && !u.blanked),
  )) {
    prepend(s, fx("doomLostDiscard", { source: g.questId, player }));
  }
}
export function templeDoomCardsDrawn(
  s: GameState,
  player: number,
  amount: number,
) {
  if (s.templeDoom && amount > 0 && live(s, T.eye))
    prepend(s, fx("doomEyeRaise", { player }));
}
export function templeDoomThreatReduction(
  s: GameState,
  amount: number,
  reason?: string,
) {
  const q = s.templeDoom;
  if (!q || reason !== "player-card") return amount;
  if (q.reduced.round !== s.round) q.reduced = { round: s.round, counts: {} };
  const key = String(activeSeat(s));
  const allowed = live(s, T.darkness)
    ? Math.min(amount, Math.max(0, 1 - (q.reduced.counts[key] ?? 0)))
    : amount;
  q.reduced.counts[key] =
    (q.reduced.counts[key] ?? 0) + Math.min(s.threat, allowed);
  return allowed;
}
export function templeDoomPlayerCardPlayed(s: GameState) {
  const q = s.templeDoom;
  if (!q) return;
  if (q.played.round !== s.round) q.played = { round: s.round, counts: {} };
  const key = String(activeSeat(s));
  q.played.counts[key] = (q.played.counts[key] ?? 0) + 1;
}
export function templeDoomEnemyAttackStarted(
  s: GameState,
  u: Unit,
  player: number,
) {
  SHARED.enemyAttackStarted?.(s, u, player);
  if (s.combat && u.code === T.ulchor && !u.blanked)
    (s.combat as Combat).doomUlchor = true;
}
export function templeDoomCharacterDestroyed(
  s: GameState,
  _u: Unit,
  context: DamageContext,
) {
  if (
    s.templeDoom &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId
  )
    (s.combat as Combat).doomKilledCharacter = true;
}
export function templeDoomAttackFinished(
  s: GameState,
  c: Combat,
  skipped = false,
): Effect[] {
  if (!s.templeDoom || skipped || !c.attackResolved || !c.doomKilledCharacter)
    return [];
  const attacker = get(s, c.enemyId);
  const isUlchor = attacker
    ? attacker.code === T.ulchor && !attacker.blanked
    : !!c.doomUlchor;
  const count = (isUlchor ? 1 : 0) + (c.doomTributeOnKill ?? 0);
  return count ? [fx("doomTribute", { value: count })] : [];
}
export function templeDoomShadow(s: GameState, code: string) {
  const c = s.combat as Combat | null;
  if (!s.templeDoom || !c) return false;
  const u = get(s, c.enemyId),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  if (code === T.temple) c.attackBonus += templeDoomQuestCount(s);
  else if (code === T.shadows)
    for (const id of defenders)
      s.templeDoom.restrictions.push({ id, round: s.round, until: "round" });
  else if (code === T.tunnel) {
    const top = takeTop(s);
    if (top && card(top).type_code === "enemy") addDiscardedEnemy(s, top);
  } else if (code === T.rage)
    prepend(
      s,
      ...defenders.map((id) => fx("damage", { target: id, value: 1 })),
    );
  else if (code === T.evil) {
    c.attackBonus++;
    c.doomTributeOnKill = (c.doomTributeOnKill ?? 0) + 1;
  } else if (code === T.guard) {
    if (u) u.tempDefense = (u.tempDefense ?? 0) + 2;
  } else return SHARED.shadow?.(s, code) ?? false;
  return true;
}
export function templeDoomEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.templeDoom) return false;
  if (![T.shadows, T.fanaticism, T.rage, T.evil].includes(code))
    return SHARED.encounter?.(s, code, replay, fromReveal) ?? false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  s.templeDoom.resolving.push(u);
  prepend(
    s,
    fx("doomTreachery", { code, source: u.id, player: firstPlayer(s) }),
  );
  return true;
}

export function templeDoomEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("doom")) return SHARED.effect?.(s, e) ?? false;
  const q = s.templeDoom;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target) ?? seatView(s, p).hand.find((h) => h.id === e.target);
  switch (e.kind) {
    case "doomSetup":
      q.initialized = true;
      log(
        s,
        "The forgotten temple conceals four chambers. Mordor's power grows with every tribute.",
        "chapter",
      );
      break;
    case "doomDefeatQuest": {
      if (q.currentQuest !== e.code) break;
      if (!(s.victoryCards ?? []).includes(q.currentQuest))
        addVictoryCard(s, q.currentQuest);
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("doomNextQuest", { player: firstPlayer(s) }));
      break;
    }
    case "doomNextQuest": {
      const code = q.questDeck.shift();
      q.advancing = false;
      if (!code) break;
      discardQuestAttachments(s, q.currentQuest);
      q.currentQuest = code;
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      log(
        s,
        `${card(code).name} · Reveal one encounter card per player.`,
        "chapter",
      );
      prepend(
        s,
        ...playerOrder(s).map(() => fx("reveal", { player: firstPlayer(s) })),
        fx("doomFinishStage"),
      );
      break;
    }
    case "doomFinishStage":
      s.stageRevealing = false;
      break;
    case "doomTribute":
      addTribute(s, e.value ?? 1);
      break;
    case "doomRoundEnd": {
      const t = tribute(s);
      if (!t || t.blanked) break;
      addTribute(s);
      if (t.damage >= 4) {
        t.damage -= 4;
        const code = q.powerDeck.shift();
        if (code)
          prepend(
            s,
            fx("revealCard", {
              code,
              revealOrigin: "power",
              player: firstPlayer(s),
            }),
          );
        else
          lose(
            s,
            "The Power of Mordor overwhelms the temple. No card remains to reveal.",
          );
      }
      break;
    }
    case "doomMemory": {
      const types = new Set<string>();
      for (let n = 0; n < templeDoomX(s); n++) {
        const code = takeTop(s);
        if (code) types.add(card(code).type_code);
      }
      q.memoryThreat = { round: s.round, value: 2 * types.size };
      break;
    }
    case "doomShrine": {
      const codes = discardPlayerDeck(s, templeDoomX(s), p),
        titles = new Set(codes.map((c) => card(c).name));
      // The forced discard is one effect: later discard responses cannot rescue
      // an in-play copy before the comparison has completed.
      forOwner(s, p, () => {
        for (const h of [...s.hand])
          if (titles.has(card(h.code).name))
            discardHandCard(s, h.id, { encounterEffect: true });
        const hosts = [
          ...allCharacters(s),
          ...shadowEastEnemies(s),
          ...allActiveLocations(s),
          ...s.staging,
          ...allQuestUnits(s),
        ];
        const seen = new Set<string>();
        for (const host of hosts)
          for (const a of [...host.attachments])
            if (
              !seen.has(a.id) &&
              attachmentController(s, host, a) === p &&
              titles.has(card(a.code).name)
            ) {
              seen.add(a.id);
              discardAttachment(s, host, a);
            }
        for (const c of [...own(s, p)])
          if (titles.has(card(c.code).name)) discardCharacter(s, c);
      });
      break;
    }
    case "doomLord": {
      const hand = seatView(s, p).hand;
      if (hand.length)
        choose(
          s,
          "The Lord of Middle-earth · Discard a card",
          options(hand, fx("doomLordDiscard", { player: p })),
        );
      break;
    }
    case "doomLordDiscard":
      if (u && seatView(s, p).hand.some((h) => h.id === u.id))
        forOwner(s, p, () => {
          const cost = Number(card(u.code).cost);
          discardHandCard(s, u.id, { encounterEffect: true });
          q.lordLimit.value += Number.isFinite(cost) ? Math.max(0, cost) : 0;
        });
      break;
    case "doomLegacy": {
      const heroes = own(s, p).filter(isHero);
      if (heroes.length)
        choose(
          s,
          "The Legacy of Mordor · Damage and exhaust a hero",
          options(heroes, fx("doomLegacyChoose", { player: p })),
        );
      break;
    }
    case "doomLegacyChoose":
      if (u && own(s, p).some((h) => h.id === u.id) && isHero(u)) {
        q.restrictions.push({ id: u.id, round: s.round, until: "refresh" });
        damage(s, u.id, 1, { questEffect: true });
        if (get(s, u.id)) exhaustCharacter(s, u);
      }
      break;
    case "doomRandomDiscard":
      forOwner(s, p, () => {
        if (s.hand.length)
          discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id, {
            encounterEffect: true,
          });
      });
      break;
    case "doomHall":
      if (own(s, p).length)
        choose(
          s,
          "Hall of Horrors · Choose a character to take damage",
          options(
            own(s, p),
            fx("doomHallDamage", { player: p, value: e.value }),
          ),
        );
      break;
    case "doomHallDamage":
      if (u && own(s, p).some((c) => c.id === u.id))
        damage(s, u.id, e.value ?? 0);
      break;
    case "doomEyeDiscard": {
      const hand = seatView(s, p).hand;
      if (hand.length > 5)
        choose(
          s,
          "Under the Watchful Eye · Discard down to five cards",
          options(hand, fx("doomEyeTake", { player: p })),
        );
      break;
    }
    case "doomEyeTake":
      if (u && seatView(s, p).hand.some((c) => c.id === u.id))
        forOwner(s, p, () =>
          discardHandCard(s, u.id, { encounterEffect: true }),
        );
      prepend(s, fx("doomEyeDiscard", { player: p }));
      break;
    case "doomEyeRaise":
      forOwner(s, p, () => raiseThreat(s, 1, "encounter"));
      break;
    case "doomArmyProtect":
      if (u) q.protected.push({ id: u.id, round: e.value ?? s.round });
      break;
    case "doomLostDiscard": {
      const group = q.underDial.find(
        (g) => g.questId === e.source && g.player === p,
      );
      const physical = group?.cards.shift();
      if (physical)
        forOwner(s, physical.owner ?? p, () => {
          s.discard.push(physical.code);
        });
      break;
    }
    case "doomTreachery": {
      const held = q.resolving.find((u) => u.id === e.source);
      if (!held) break;
      if (held.code === T.shadows) {
        q.blankRound = s.round;
        finishTreachery(s, held.id);
      } else if (held.code === T.rage) {
        finishTreachery(s, held.id);
        const boss = ulchor(s);
        if (boss && !enemyAttackPrevented(s, boss, firstPlayer(s)))
          prepend(
            s,
            fx("immediateAttack", { target: boss.id, player: firstPlayer(s) }),
          );
        else prepend(s, fx("reveal", { player: firstPlayer(s) }));
      } else if (held.code === T.evil) {
        addTribute(s);
        choose(s, "Place of Evil · Add another damage or reveal a card", [
          {
            id: "tribute",
            label: "Place 1 additional damage on Tribute to Mordor",
            effects: [fx("doomEvilChoose", { source: held.id, flag: true })],
          },
          {
            id: "surge",
            label: "Place of Evil gains surge",
            effects: [fx("doomEvilChoose", { source: held.id, flag: false })],
          },
        ]);
      } else if (held.code === T.fanaticism) {
        const eligible = shadowEastEnemies(s).filter(
          (u) =>
            trait(u, "Easterling") &&
            !u.attachments.some((a) => a.code === T.fanaticism),
        );
        const lowest = Math.min(...eligible.map((u) => stats(s, u).defense));
        const targets = eligible.filter((u) => stats(s, u).defense === lowest);
        if (!targets.length) {
          finishTreachery(s, held.id);
          prepend(s, fx("reveal", { player: firstPlayer(s) }));
        } else if (targets.length === 1)
          prepend(
            s,
            fx("doomFanaticism", { source: held.id, target: targets[0].id }),
          );
        else
          choose(
            s,
            "Fanaticism · Choose a tied enemy with the lowest defense",
            options(targets, fx("doomFanaticism", { source: held.id })),
          );
      }
      break;
    }
    case "doomEvilChoose":
      if (finishTreachery(s, e.source!)) {
        if (e.flag) addTribute(s);
        else prepend(s, fx("reveal", { player: firstPlayer(s) }));
      }
      break;
    case "doomFanaticism": {
      const held = finishTreachery(s, e.source!, !u);
      if (held && u)
        u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      break;
    }
  }
  return true;
}

export const TEMPLE_DOOM_HOOKS: Batch4ScenarioHooks = {
  ...SHARED,
  setup: setupTempleDoom,
  openingHandsKept: templeDoomOpeningHandsKept,
  check: templeDoomCheck,
  playerEliminated: templeDoomPlayerEliminated,
  advance: templeDoomAdvance,
  stageInfo: templeDoomStageInfo,
  skipQuestPhase: (s) => stage(s, T.first),
  planningEnd: templeDoomPlanningEnd,
  questBegin: templeDoomQuestBegin,
  progress: templeDoomProgress,
  questProgressPlaced: (s, quest, amount) => {
    if (
      s.templeDoom?.currentQuest === T.lord &&
      quest.code === T.lord &&
      s.templeDoom.lordLimit.round === s.round
    )
      s.templeDoom.lordLimit.placed += amount;
  },
  stats: templeDoomStats,
  threatBonus: templeDoomThreatBonus,
  stagingThreat: (s) =>
    s.templeDoom?.memoryThreat.round === s.round &&
    ["quest", "staging"].includes(s.phase)
      ? s.templeDoom.memoryThreat.value
      : 0,
  characterBlanked: (s, u) =>
    (isHero(u) || isAlly(u)) && s.templeDoom?.blankRound === s.round,
  cannotReady: (s, u) => restrictions(s, u),
  cannotHeal: (s, u) => restrictions(s, u, true),
  immune: (_s, u) =>
    (!u.blanked && [T.ulchor, T.khamul, T.tower].includes(u.code)) ||
    fanatics(u) > 0,
  indestructible: (_s, u) => u.code === T.ulchor && !u.blanked,
  cannotEngage: templeDoomCannotEngage,
  canSelectSideQuest: templeDoomCanSelectSideQuest,
  sideDefeated: (s, u) => {
    if (u.code === T.lost) returnDial(s, u.id);
    if (u.code === T.tribute) {
      win(s);
      s.reason =
        "Thane Ulchor lies defeated and the tribute to Mordor is ended.";
    }
  },
  cannotDefend: (s, enemy, defender) =>
    enemy.code === T.khamul &&
    !enemy.blanked &&
    !!defender &&
    ownerOf(s, defender) !== ownerOf(s, enemy),
  cannotAttack: (s, character, enemy) =>
    enemy.code === T.khamul &&
    !enemy.blanked &&
    ownerOf(s, character) !== ownerOf(s, enemy),
  hostLeaves: templeDoomHostLeaves,
  cardEntered: templeDoomCardEntered,
  engaged: templeDoomEngaged,
  damageAmount: (s, u, amount, context) =>
    s.templeDoom?.protected.some((m) => m.id === u.id && m.round === s.round)
      ? 0
      : (SHARED.damageAmount?.(s, u, amount, context) ?? amount),
  playerCardPlayed: templeDoomPlayerCardPlayed,
  playProblem: (s) =>
    allActiveLocations(s).some((u) => u.code === T.opening && !u.blanked) &&
    s.templeDoom?.played.round === s.round &&
    (s.templeDoom.played.counts[String(activeSeat(s))] ?? 0) >= 1
      ? "Narrow Opening allows each player to play only one card each round."
      : null,
  travelProblem: (_s, u) =>
    u.code === T.tower && !u.blanked
      ? "The players cannot travel to The Tower of Barad-dûr."
      : null,
  locationProgressBlocked: (_s, u) => u.code === T.tower,
  threatEliminationReduction: (s) => (live(s, T.tower) ? 5 : 0),
  threatReduction: templeDoomThreatReduction,
  threatRaised: templeDoomThreatRaised,
  cardsDrawn: templeDoomCardsDrawn,
  enemyAttackStarted: templeDoomEnemyAttackStarted,
  characterDestroyed: templeDoomCharacterDestroyed,
  attackFinished: templeDoomAttackFinished,
  shadow: templeDoomShadow,
  encounter: templeDoomEncounter,
  roundEnd: (s) => [
    ...(SHARED.roundEnd?.(s) ?? []),
    fx("doomRoundEnd", { player: firstPlayer(s) }),
  ],
  effect: templeDoomEffect,
  sharedEffect: (e) =>
    [
      "doomSetup",
      "doomDefeatQuest",
      "doomNextQuest",
      "doomFinishStage",
      "doomTribute",
      "doomRoundEnd",
      "doomMemory",
      "doomTreachery",
      "doomEvilChoose",
      "doomFanaticism",
    ].includes(e.kind) ||
    (SHARED.sharedEffect?.(e) ?? false),
};
