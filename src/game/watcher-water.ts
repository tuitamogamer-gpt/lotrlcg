import { addCurrentQuestProgress } from "./side-quests";
import { removeCurrentQuestProgress } from "./side-quests";
// Original Watcher in the Water. Its shared Misty Mountains cards are independent.
import type { Effect, GameState, Unit } from "./types";
import { WATCHER_WATER } from "./watcher-water-support";
export {
  WATCHER_WATER,
  WATCHER_WATER_ENCOUNTERS,
  WATCHER_WATER_QUESTS,
} from "./watcher-water-support";
import { card, name, plain } from "./cards";
import {
  choose,
  encounterDraw,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  threatOf,
  units,
} from "./core";
import {
  addVictoryCard,
  advanceQuest,
  check,
  damage,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  engage,
  enemyAddedToStaging,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
  selectSeat,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { beginEnemyAttack, playerAttackResolved } from "./combat";
import { watcherPlayerLocationEntered } from "./watcher-player-cards";

export interface WatcherWaterState {
  setAside: string[];
  /** Actual tokens placed this round, including placements made while text was blank. */
  swampPlaced: Record<string, number>;
  doorsUsedRound?: number;
  /** Declaration-time players survive a later attacker's removal. */
  thrashing?: { enemyId: string; attackerIds: string[]; players: number[] };
}
const state = (s: GameState) =>
  ((s as GameState & { watcherWater?: WatcherWaterState }).watcherWater ??= {
    setAside: [],
    swampPlaced: {},
  });
const isWatcher = (s: GameState) =>
  (s.scenarioId as string) === "watcher-in-the-water";
const tentacleCode = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Tentacle");
const triggerDiscard = (s: GameState) => {
  const code = encounterDraw(s);
  if (code) {
    s.encounterDiscard.push(code);
    log(s, `Tentacle test discards ${card(code).name}.`);
  }
  return !!code && (!!card(code).shadow || tentacleCode(code));
};
const aliveEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const stagedCardThreat = (s: GameState) =>
  s.staging
    .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
    .reduce((n, u) => n + threatOf(s, u), 0);
const wrapped = (u: Unit) =>
  u.attachments.some(
    (a) => a.code === WATCHER_WATER.wrapped && !a.blanked && !a.facedown,
  );
const tentacleAttached = (u: Unit) =>
  u.attachments.some(
    (a) =>
      !a.blanked &&
      !a.facedown &&
      (card(a.code).traits ?? "")
        .split(".")
        .some((t) => t.trim() === "Tentacle"),
  );
const rescuers = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      ownerOf(s, h) === activeSeat(s) &&
      !h.exhausted &&
      !tentacleAttached(h) &&
      !khazadCannotExhaust(h),
  );
const doorsInPlay = (s: GameState, id?: string) =>
  units(s).find((u) => u.code === WATCHER_WATER.doors && (!id || u.id === id));

export function setupWatcherWater(s: GameState) {
  const w = state(s);
  w.setAside = s.encounterDeck.filter((c) =>
    [WATCHER_WATER.watcher, WATCHER_WATER.doors].includes(c),
  );
  s.encounterDeck = s.encounterDeck.filter((c) => !w.setAside.includes(c));
  shuffle(s, s.encounterDeck);
  enqueue(
    s,
    fx("watcherWaterSetupReveal", {
      count: 2 * playerOrder(s).length,
      player: s.table?.first ?? 0,
    }),
  );
}
export function advanceWatcherWater(s: GameState): boolean {
  if (!isWatcher(s)) return false;
  if (s.stageRevealing || s.choice || s.queue.length) return true;
  if (s.stage === 1 && s.progress >= 13) {
    if (questDefeated(s, WATCHER_WATER.west)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(
      s,
      fx("watcherWaterLake", { player: s.table?.first ?? 0 }),
      fx("watcherWaterStageReady", { player: s.table?.first ?? 0 }),
    );
    log(s, "Stage 2 · The Seething Lake", "chapter");
  } else if (s.stage === 2 && s.progress >= 5 && s.victory >= 3) win(s);
  return true;
}
/** Unbounded replacement avoids treating the printed zero-point Doors as explored. */
export function watcherWaterLocationQuest(
  _s: GameState,
  u: Unit,
): number | undefined {
  return u.code === WATCHER_WATER.doors && !u.blanked ? Infinity : undefined;
}
export function watcherWaterProgressCapacity(
  s: GameState,
  u: Unit,
): number | undefined {
  if (u.code === WATCHER_WATER.doors && !u.blanked) return Infinity;
  if (u.code === WATCHER_WATER.swamp && !u.blanked)
    return Math.max(
      0,
      Math.min(
        (card(u.code).quest ?? 0) - u.progress,
        1 - (state(s).swampPlaced[u.id] ?? 0),
      ),
    );
  return undefined;
}
/** Called before ordinary progress/exploration, including card-effect progress. */
export function watcherWaterProgressLocation(
  s: GameState,
  u: Unit,
  value: number,
): boolean {
  if (u.code !== WATCHER_WATER.doors || u.blanked) return false;
  if (value > 0) {
    addCurrentQuestProgress(s, value);
    log(s, `Doors of Durin redirects ${value} progress to the quest.`);
    advanceQuest(s);
  }
  return true;
}
export function watcherWaterProgressPlaced(
  s: GameState,
  u: Unit,
  value: number,
) {
  if (u.code === WATCHER_WATER.swamp && value > 0)
    state(s).swampPlaced[u.id] = (state(s).swampPlaced[u.id] ?? 0) + value;
}
export const watcherWaterProgressBlocked = (s: GameState) =>
  allActiveLocations(s).some(
    (u) =>
      u.code === WATCHER_WATER.swamp &&
      !u.blanked &&
      u.progress < (card(u.code).quest ?? 0),
  );
export function watcherWaterOptionalEngageProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  return u.code === WATCHER_WATER.watcher &&
    !u.blanked &&
    aliveEnemies(s).some((e) => e.id !== u.id && hasTrait(e, "Tentacle"))
    ? "The Watcher cannot be optionally engaged while another Tentacle enemy is in play."
    : undefined;
}
export const watcherWaterCannotExhaust = (u: Unit) => wrapped(u);
export const watcherWaterCannotReady = (u: Unit) => wrapped(u);
export const watcherWaterZeroCombatStats = (u: Unit) =>
  u.attachments.some(
    (a) => a.code === WATCHER_WATER.grasping && !a.blanked && !a.facedown,
  );
export const watcherWaterAbilityLabel = (u: Unit, attachmentId?: string) =>
  attachmentId &&
  u.attachments.some(
    (a) => a.id === attachmentId && a.code === WATCHER_WATER.wrapped,
  )
    ? "Exhaust an unwrapped hero · rescue this hero"
    : u.code === WATCHER_WATER.doors && !attachmentId
      ? "Speak friend · discard cards to open Doors"
      : undefined;
export function watcherWaterAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === WATCHER_WATER.wrapped,
    );
    if (!a || a.blanked || a.facedown)
      return "Choose an active Wrapped! attachment.";
    if (!["defense", "attack"].includes(s.phase))
      return "Rescuing a Wrapped hero is a Combat Action.";
    if (!rescuers(s).length)
      return "You need a ready hero you control without a Tentacle attachment.";
    return undefined;
  }
  if (!doorsInPlay(s, u.id) || u.blanked)
    return "Doors of Durin must be in play with its text active.";
  if (state(s).doorsUsedRound === s.round)
    return "Doors of Durin can be attempted once per round.";
  if (
    !s.encounterDeck.length &&
    !playerOrder(s).some((p) => seatView(s, p).hand.length)
  )
    return "The Doors action needs a card it can discard.";
  return undefined;
}
export function watcherWaterAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!watcherWaterAbilityLabel(u, attachmentId)) return false;
  requireRule(
    !watcherWaterAbilityProblem(s, u, attachmentId),
    watcherWaterAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (attachmentId)
    choose(
      s,
      "Rescue the Wrapped hero · Pay with your hero",
      opts(rescuers(s), (h) => [
        fx("watcherWaterRescue", {
          target: u.id,
          source: attachmentId,
          text: h.id,
          player: activeSeat(s),
        }),
      ]),
    );
  else {
    state(s).doorsUsedRound = s.round;
    prepend(
      s,
      fx("watcherWaterDoorsChoose", {
        source: u.id,
        value: 0,
        ids: [],
        player: s.table?.first ?? 0,
      }),
    );
  }
  return true;
}
export function watcherWaterTravelProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (
    u.code === WATCHER_WATER.falls &&
    allCharacters(s).filter(
      (c) =>
        ownerOf(s, c) === (s.table?.first ?? 0) &&
        !c.exhausted &&
        !khazadCannotExhaust(c) &&
        !watcherWaterCannotExhaust(c),
    ).length < 2
  )
    return "Stair Falls requires two ready characters controlled by the first player.";
  return undefined;
}
export function watcherWaterTravelCost(s: GameState, u: Unit): Effect[] | null {
  return u.code === WATCHER_WATER.falls
    ? [
        fx("watcherWaterFallsCost", {
          target: u.id,
          count: 2,
          player: s.table?.first ?? 0,
        }),
      ]
    : null;
}
export function watcherWaterTravelEntered(s: GameState, u: Unit) {
  if (u.code === WATCHER_WATER.passage && !u.blanked)
    prepend(s, fx("watcherWaterPassage", { player: s.table?.first ?? 0 }));
}
export function watcherWaterCombatEnd(s: GameState) {
  if (s.staging.some((u) => u.code === WATCHER_WATER.watcher && !u.blanked))
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("watcherWaterEndDamage", { player }),
      ),
    );
}
export function watcherWaterRoundEnd(s: GameState) {
  for (const h of [...allHeroes(s)].filter(wrapped)) {
    if (s.status !== "playing") break;
    if (get(s, h.id)) discardCharacter(s, h);
  }
}
/** Regenerate resolves after the first-player token passes, before player actions. */
export function watcherWaterRefresh(s: GameState) {
  if (isWatcher(s)) state(s).swampPlaced = {};
  for (const enemy of aliveEnemies(s)) {
    const amount =
      !enemy.blanked &&
      /\bRegenerate\s+(\d+)/i.exec(plain(card(enemy.code).text))?.[1];
    if (amount) {
      const before = enemy.damage;
      enemy.damage = Math.max(0, enemy.damage - Number(amount));
      if (before !== enemy.damage)
        log(s, `${name(enemy)} regenerates ${before - enemy.damage} damage.`);
    }
  }
}
/** Insert before optional declaration/exhaustion responses and damage calculation. */
export function watcherWaterPlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  ids: string[],
): Effect[] {
  return !enemy.blanked &&
    [WATCHER_WATER.grasping, WATCHER_WATER.thrashing].includes(enemy.code)
    ? [
        fx("watcherWaterTentacleAttacked", {
          target: enemy.id,
          ids,
          player: s.table?.first ?? 0,
        }),
      ]
    : [];
}
/** Return true to defer normal attack completion; its callbacks run after redirected damage. */
export function watcherWaterRedirectAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  amount: number,
  remainingHealth: number,
): boolean {
  if (!isWatcher(s)) return false;
  const pending = state(s).thrashing;
  if (
    !pending ||
    pending.enemyId !== enemy.id ||
    pending.attackerIds.join("|") !== ids.join("|")
  )
    return false;
  delete state(s).thrashing;
  const targets = allCharacters(s).filter((u) =>
    pending.players.includes(ownerOf(s, u)),
  );
  if (amount > 0 && targets.length)
    choose(
      s,
      "Thrashing Tentacle · Redirect the attack damage",
      opts(targets, (u) => [
        fx("watcherWaterAttackDamage", {
          target: u.id,
          source: enemy.id,
          value: amount,
          ids,
        }),
        fx("playerAttackResolved", {
          target: enemy.id,
          ids,
          value: 0,
          count: remainingHealth,
        }),
      ]),
      "Choose a character controlled by an attacking player. Its defense does not reduce this damage.",
    );
  else
    prepend(
      s,
      fx("playerAttackResolved", {
        target: enemy.id,
        ids,
        value: 0,
        count: remainingHealth,
      }),
    );
  return true;
}
/** The forced test precedes choosing any defender. Root skips this hook on resume. */
export function watcherWaterEnemyAttackStart(
  s: GameState,
  enemy: Unit,
  returnWolf = false,
): boolean {
  if (enemy.code !== WATCHER_WATER.striking || enemy.blanked) return false;
  prepend(
    s,
    fx("watcherWaterStrikingStart", {
      target: enemy.id,
      flag: returnWolf,
      player: activeSeat(s),
    }),
  );
  return true;
}
export function watcherWaterEncounter(s: GameState, code: string): boolean {
  if (code === WATCHER_WATER.creek) {
    const top = encounterDraw(s);
    if (top) {
      s.encounterDiscard.push(top);
      if (tentacleCode(top)) {
        s.encounterDiscard.pop();
        placeEncounter(s, top, true);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("threat", { value: 5, player })),
        );
      }
    }
    return true;
  }
  if (code === WATCHER_WATER.ill) {
    const order = playerOrder(s),
      high = Math.max(...order.map((p) => seatView(s, p).threat)),
      tied = order.filter((p) => seatView(s, p).threat === high);
    const effects = (player: number) => [
      fx("watcherWaterIllEngage", { player }),
    ];
    if (
      tied.length > 1 &&
      s.staging.some((u) => card(u.code).type_code === "enemy")
    ) {
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "Ill Purpose · Choose a player tied for highest threat",
        tied.map((player) => ({
          id: String(player),
          label: seatName(s, player),
          effects: effects(player),
        })),
      );
    } else prepend(s, ...effects(tied[0] ?? activeSeat(s)));
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === WATCHER_WATER.wrapped) {
    const first = s.table?.first ?? 0;
    selectSeat(s, first);
    const heroes = s.heroes.filter(
      (h) => !h.attachments.some((a) => a.code === code),
    );
    if (heroes.length)
      choose(
        s,
        "Wrapped! · Attach to your hero",
        opts(heroes, (h) => [
          fx("watcherWaterWrap", { target: h.id, code, player: first }),
        ]),
      );
    else s.encounterDiscard.push(code);
    return true;
  }
  return false;
}
export function watcherWaterShadow(s: GameState, code: string): boolean {
  if ([WATCHER_WATER.swamp, WATCHER_WATER.falls].includes(code))
    removeCurrentQuestProgress(s, 1);
  else if (code === WATCHER_WATER.ill) {
    const enemy = get(s, s.combat?.enemyId);
    if (s.combat && enemy)
      s.combat.attackBonus += hasTrait(enemy, "Tentacle") ? 3 : 1;
  } else return false;
  return true;
}
export function watcherWaterEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "watcherWaterSetupReveal":
      if (stagedCardThreat(s) < (e.count ?? 0) && s.encounterDeck.length)
        prepend(
          s,
          fx("reveal", { player: s.table?.first ?? 0 }),
          fx(e.kind, { count: e.count, player: s.table?.first ?? 0 }),
        );
      break;
    case "watcherWaterLake": {
      const w = state(s);
      for (const old of allActiveLocations(s)) s.staging.push(old);
      s.activeLocation = null;
      s.extraActiveLocations = [];
      if (w.setAside.includes(WATCHER_WATER.watcher)) {
        const enemy = make(s, WATCHER_WATER.watcher);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      if (w.setAside.includes(WATCHER_WATER.doors)) {
        const doors = make(s, WATCHER_WATER.doors);
        s.activeLocation = doors;
        watcherPlayerLocationEntered(s, doors);
      }
      w.setAside = w.setAside.filter(
        (c) => ![WATCHER_WATER.watcher, WATCHER_WATER.doors].includes(c),
      );
      const recovered = s.encounterDiscard.filter(tentacleCode);
      s.encounterDiscard = s.encounterDiscard.filter((c) => !tentacleCode(c));
      s.encounterDeck.push(...recovered);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "watcherWaterStageReady":
      s.stageRevealing = false;
      check(s);
      break;
    case "watcherWaterDoorsChoose": {
      const door = doorsInPlay(s, e.source),
        order = playerOrder(s),
        cursor = e.value ?? 0;
      if (!door) break;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("watcherWaterDoorsResolve", {
            source: e.source,
            ids: e.ids,
            player: s.table?.first ?? 0,
          }),
        );
        break;
      }
      const player = order[cursor];
      selectSeat(s, player);
      choose(
        s,
        "Doors of Durin · Discard any number from your hand",
        [
          ...opts(s.hand, (c) => [
            fx("watcherWaterDoorsDiscard", {
              target: c.id,
              source: e.source,
              ids: e.ids,
              value: cursor,
              player,
            }),
          ]),
          {
            id: "done",
            label: "Finish discarding for this fellowship",
            effects: [
              fx("watcherWaterDoorsChoose", {
                source: e.source,
                ids: e.ids,
                value: cursor + 1,
                player: s.table?.first ?? 0,
              }),
            ],
          },
        ],
        "The initial letter of any discarded player's card may match the discarded encounter card. Articles count as part of the title.",
      );
      break;
    }
    case "watcherWaterDoorsDiscard": {
      const discarded = discardHandCard(s, e.target!).code;
      prepend(
        s,
        fx("watcherWaterDoorsChoose", {
          source: e.source,
          ids: [...(e.ids ?? []), discarded],
          value: e.value,
          player: s.table?.first ?? 0,
        }),
      );
      break;
    }
    case "watcherWaterDoorsResolve": {
      const door = doorsInPlay(s, e.source),
        top = encounterDraw(s);
      if (!top) break;
      s.encounterDiscard.push(top);
      log(s, `Doors of Durin discards ${card(top).name}.`);
      const first = (title: string) =>
        title
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .slice(0, 1)
          .toLocaleUpperCase();
      if (
        door &&
        (e.ids ?? []).some((c) => first(card(c).name) === first(card(top).name))
      ) {
        if (allActiveLocations(s).some((l) => l.id === door.id))
          removeActiveLocation(s, door.id);
        else s.staging = s.staging.filter((l) => l.id !== door.id);
        for (const a of [...door.attachments]) discardAttachment(s, door, a);
        addVictoryCard(s, door.code);
        log(
          s,
          "The word matches: Doors of Durin enters the victory display.",
          "good",
        );
        check(s);
      }
      break;
    }
    case "watcherWaterWrap":
      if (
        u &&
        ownerOf(s, u) === activeSeat(s) &&
        card(u.code).type_code === "hero" &&
        !u.attachments.some((a) => a.code === WATCHER_WATER.wrapped)
      )
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: WATCHER_WATER.wrapped,
          exhausted: false,
        });
      else s.encounterDiscard.push(WATCHER_WATER.wrapped);
      break;
    case "watcherWaterRescue": {
      const payer = rescuers(s).find((h) => h.id === e.text),
        attachment = u?.attachments.find(
          (a) =>
            a.id === e.source && a.code === WATCHER_WATER.wrapped && !a.blanked,
        );
      requireRule(
        u && payer && attachment,
        "Choose your ready hero without a Tentacle attachment and an active Wrapped!.",
      );
      requireRule(exhaustCharacter(s, payer), "That hero cannot exhaust.");
      discardAttachment(s, u, attachment);
      break;
    }
    case "watcherWaterFallsCost": {
      const ready = allCharacters(s).filter(
        (c) =>
          ownerOf(s, c) === activeSeat(s) &&
          !c.exhausted &&
          !khazadCannotExhaust(c) &&
          !watcherWaterCannotExhaust(c),
      );
      if ((e.count ?? 0) <= 0) break;
      choose(
        s,
        "Stair Falls · Exhaust a character",
        opts(ready, (c) => [
          fx("watcherWaterFallsExhaust", {
            target: c.id,
            source: e.target,
            count: e.count,
            player: activeSeat(s),
          }),
        ]),
      );
      break;
    }
    case "watcherWaterFallsExhaust":
      requireRule(
        u &&
          ownerOf(s, u) === activeSeat(s) &&
          !u.exhausted &&
          exhaustCharacter(s, u),
        "Choose your ready character.",
      );
      if ((e.count ?? 0) > 1)
        prepend(
          s,
          fx("watcherWaterFallsCost", {
            target: e.source,
            count: (e.count ?? 0) - 1,
            player: activeSeat(s),
          }),
        );
      break;
    case "watcherWaterPassage":
      addCurrentQuestProgress(s, 2);
      advanceQuest(s);
      break;
    case "watcherWaterEndDamage":
      choose(
        s,
        "The Watcher · Deal three damage to your character",
        opts(
          allCharacters(s).filter((c) => ownerOf(s, c) === activeSeat(s)),
          (c) => [fx("damage", { target: c.id, value: 3 })],
        ),
      );
      break;
    case "watcherWaterIllEngage": {
      const enemies = s.staging.filter(
          (c) => card(c.code).type_code === "enemy",
        ),
        remaining = s.queue.splice(0);
      for (const enemy of enemies) engage(s, enemy);
      const triggered = s.queue.splice(0);
      s.queue = remaining;
      // The Then clause follows the whole staging-area engagement effect, before optional responses.
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("threat", { value: stagedCardThreat(s), player }),
        ),
        ...triggered,
      );
      break;
    }
    case "watcherWaterTentacleAttacked": {
      if (
        !u ||
        u.blanked ||
        ![WATCHER_WATER.grasping, WATCHER_WATER.thrashing].includes(u.code) ||
        !triggerDiscard(s)
      )
        break;
      const attackers = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((c): c is Unit => !!c);
      if (u.code === WATCHER_WATER.grasping) {
        if (attackers.length)
          choose(
            s,
            "Grasping Tentacle · Attach to an attacking character",
            opts(attackers, (c) => [
              fx("watcherWaterGrasp", { target: u.id, source: c.id }),
            ]),
          );
      } else
        state(s).thrashing = {
          enemyId: u.id,
          attackerIds: e.ids ?? [],
          players: [...new Set(attackers.map((c) => ownerOf(s, c)))],
        };
      break;
    }
    case "watcherWaterGrasp": {
      const host = get(s, e.source);
      if (!u || !host) break;
      s.staging = s.staging.filter((c) => c.id !== u.id);
      forOwner(
        s,
        ownerOf(s, u),
        () => (s.engaged = s.engaged.filter((c) => c.id !== u.id)),
      );
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      for (const a of [...u.attachments]) discardAttachment(s, u, a);
      host.attachments.push({ id: u.id, code: u.code, exhausted: false });
      // Declared attackers still participated. Complete at the original resolution
      // point, after declaration responses, without dealing damage to an enemy.
      s.queue = s.queue.map((pending) =>
        pending.kind === "resolvePlayerAttack" && pending.target === u.id
          ? fx("watcherWaterGraspComplete", {
              target: u.id,
              code: u.code,
              ids: pending.ids,
              player: pending.player,
            })
          : pending,
      );
      log(
        s,
        `${name(u)} grasps ${name(host)}: attack and defense become zero.`,
      );
      break;
    }
    case "watcherWaterGraspComplete": {
      if (!e.code) break;
      const formerEnemy: Unit = {
        id: e.target ?? "grasped-tentacle",
        code: e.code,
        exhausted: false,
        damage: 0,
        progress: 0,
        resources: 0,
        committed: false,
        attachments: [],
        boost: 0,
        attacked: true,
        shadows: [],
      };
      playerAttackResolved(s, formerEnemy, e.ids ?? [], 0, 0);
      break;
    }
    case "watcherWaterAttackDamage":
      if (u) damage(s, u.id, e.value ?? 0, { combatDamage: true });
      break;
    case "watcherWaterStrikingStart": {
      if (!u) break;
      if (triggerDiscard(s))
        prepend(
          s,
          fx("watcherWaterStrikingDefend", { target: u.id, flag: e.flag }),
        );
      else
        choose(s, "Striking Tentacle · Declare a defender", [
          ...opts(defendersFor(s, u), (d) => [
            fx("watcherWaterStrikingDefend", {
              target: u.id,
              source: d.id,
              flag: e.flag,
            }),
          ]),
          {
            id: "undefended",
            label: "Leave the attack undefended",
            effects: [
              fx("watcherWaterStrikingDefend", { target: u.id, flag: e.flag }),
            ],
          },
        ]);
      break;
    }
    case "watcherWaterStrikingDefend":
      if (u)
        (
          beginEnemyAttack as (
            s: GameState,
            u: Unit,
            ids: string[],
            returnWolf?: boolean,
            watcherResolved?: boolean,
          ) => void
        )(s, u, e.source ? [e.source] : [], !!e.flag, true);
      break;
    default:
      return false;
  }
  return true;
}
