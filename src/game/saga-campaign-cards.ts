// The Lord of the Rings campaign's boons and burdens: Mr. Underhill, Gildor
// Inglorion and The Ring Draws Them (the Permanent stat boons are attachment
// rules in expansion-passives.ts; Gandalf's Delay is resolved at setup).
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  engage,
  progressLocation,
} from "./board";
import {
  activeSeat,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { oneRingExhausted } from "./lotr-saga";
import { hasResourceIcon } from "./expansion-passives";
import { isSagaCampaign, SAGA } from "./saga-campaign";
import { FF } from "./flight-ford-support";

type SagaCardsState = NonNullable<GameState["sagaCards"]>;
const state = (s: GameState): SagaCardsState =>
  (s.sagaCards ??= { ringDraws: 0, underhill: [] });
const first = (s: GameState) => s.table?.first ?? 0;
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");

/** Revealed campaign cards: Gildor Inglorion and The Ring Draws Them. */
export function sagaCampaignEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
): boolean {
  if (code === SAGA.gildor) {
    if (!fromReveal) {
      if (!replay) s.encounterDiscard.push(code);
      return true;
    }
    // "The first player gains control of Gildor Inglorion."
    const p = first(s);
    forOwner(s, p, () => {
      const u = make(s, code);
      u.owner = p;
      s.allies.push(u);
    });
    log(
      s,
      `Gildor Inglorion: ${s.table ? `${who(s, p)} gains` : "the first player gains"} control of him.`,
      "good",
    );
    return true;
  }
  if (code === SAGA.ringDraws) {
    if (!replay) s.encounterDiscard.push(code);
    if (!fromReveal) return true;
    // When Revealed: at the end of the phase each staging enemy engages the first player.
    state(s).ringDraws += 1;
    log(
      s,
      "The Ring Draws Them: at the end of the phase, each enemy in the staging area engages the first player.",
      "danger",
    );
    return true;
  }
  return false;
}
/** "If The One Ring is exhausted, this effect cannot be canceled." */
export const sagaCampaignCannotCancel = (s: GameState, code?: string) =>
  code === SAGA.ringDraws && oneRingExhausted(s);

/** The end of the phase: The Ring Draws Them's delayed engagement. */
export function sagaCampaignPhaseEnd(s: GameState): Effect[] {
  const q = s.sagaCards;
  if (!q?.ringDraws) return [];
  q.ringDraws = 0;
  return [fx("sagaRingDraws", { player: first(s) })];
}
/** Gildor Inglorion's Forced at the end of the round. */
export function sagaCampaignRoundEnd(s: GameState): Effect[] {
  return globalCharacters(s)
    .filter((u) => u.code === SAGA.gildor && !u.blanked)
    .map((u) => fx("sagaGildorEnd", { target: u.id, player: first(s) }));
}
/** Heroes of the first player with a [fellowship] resource to spend. */
const fellowshipPayers = (s: GameState) =>
  seatView(s, first(s)).heroes.filter(
    (h) => hasResourceIcon(h, "fellowship") && h.resources > 0,
  );

/** Mr. Underhill's Action: the enemies engaged with you that it can choose. */
const underhillTargets = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter((e) =>
    ["enemy", "ship-enemy"].includes(card(e.code).type_code),
  );
/** The campaign cards' Actions; The Old Road's is offered in campaign mode only. */
export const sagaCampaignAbilityLabel = (code: string, s?: GameState) =>
  code === SAGA.underhill
    ? "Mr. Underhill · Add to the victory display: an engaged enemy cannot attack you this round"
    : code === FF.oldRoad && s && isSagaCampaign(s.campaign)
      ? "The Old Road · Place the top burden on the encounter deck to place 4 progress here"
      : undefined;
/** The Old Road (Flight to the Ford) in play: the staging area or active. */
const oldRoadInPlay = (s: GameState, u: Unit) =>
  u.code === FF.oldRoad &&
  (s.staging.some((x) => x.id === u.id) || s.activeLocation?.id === u.id);
export function sagaCampaignAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  if (!attachmentId && u.code === FF.oldRoad) {
    if (!isSagaCampaign(s.campaign))
      return "Use this action only if you are playing campaign mode.";
    if (u.blanked) return "The Old Road's text is blank.";
    if (!oldRoadInPlay(s, u)) return "The Old Road is not in play.";
    if (!s.flightFord?.burdens.length) return "The burden deck is empty.";
    return null;
  }
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || a.code !== SAGA.underhill) return "No campaign card ability.";
  if (a.blanked) return "Mr. Underhill's text is blank.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "Mr. Underhill belongs to another player.";
  if (!underhillTargets(s, activeSeat(s)).length)
    return "Choose an enemy engaged with you.";
  return null;
}
export function sagaCampaignAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!attachmentId && u.code === FF.oldRoad) {
    if (!isSagaCampaign(s.campaign)) return false;
    const problem = sagaCampaignAbilityProblem(s, u);
    requireRule(!problem, problem ?? "");
    const burden = s.flightFord!.burdens.shift()!;
    s.encounterDeck.unshift(burden);
    log(
      s,
      `The Old Road: ${card(burden).name} is placed from the burden deck on top of the encounter deck to place 4 progress on The Old Road.`,
    );
    progressLocation(s, u, 4);
    return true;
  }
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || a.code !== SAGA.underhill) return false;
  const problem = sagaCampaignAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  choose(
    s,
    "Mr. Underhill · Choose an enemy engaged with you",
    underhillTargets(s, p).map((e) => ({
      id: e.id,
      code: e.code,
      label: name(e),
      effects: [fx("sagaUnderhill", { source: a.id, target: e.id, player: p })],
    })),
  );
  return true;
}
/**
 * Flight to the Ford's campaign card: "Response: After an enemy is declared as
 * an attacker, shuffle the top card of the burden deck into the encounter
 * deck to cancel that attack." The attacked player is offered it.
 */
export function sagaCampaignAttackStarted(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  if (
    isSagaCampaign(s.campaign) &&
    s.scenarioId === "flight-to-the-ford" &&
    s.flightFord?.burdens.length
  )
    prepend(s, fx("sagaFordOffer", { target: enemy.id, player }));
}
/** Mr. Underhill: the chosen enemy cannot attack that player this round. */
export const sagaCampaignEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) =>
  !!s.sagaCards?.underhill.some(
    (m) => m.enemy === enemy.id && m.player === player && m.round === s.round,
  );

export function sagaCampaignEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "sagaUnderhill": {
      const host = globalCharacters(s).find((h) =>
        h.attachments.some((a) => a.id === e.source),
      );
      const a = host?.attachments.find((x) => x.id === e.source);
      const enemy = get(s, e.target);
      if (!host || !a || !enemy) return true;
      // Added to the victory display (not discarded: Permanent allows it).
      host.attachments = host.attachments.filter((x) => x.id !== a.id);
      addVictoryCard(s, a.code);
      state(s).underhill.push({
        enemy: enemy.id,
        player: e.player ?? activeSeat(s),
        round: s.round,
      });
      log(
        s,
        `Mr. Underhill is added to the victory display: ${name(enemy)} cannot attack ${who(s, e.player ?? activeSeat(s))} until the end of the round.`,
        "good",
      );
      return true;
    }
    case "sagaFordOffer": {
      const enemy = get(s, e.target);
      if (!enemy || s.combat?.enemyId !== enemy.id) return true;
      if (!s.flightFord?.burdens.length) return true;
      choose(
        s,
        `Flight to the Ford · Campaign: cancel ${name(enemy)}'s attack?`,
        [
          {
            id: "cancel",
            code: SAGA.fordCard,
            label:
              "Shuffle the top card of the burden deck into the encounter deck to cancel that attack",
            effects: [{ ...e, kind: "sagaFordCancel" }],
          },
          { id: "skip", label: "Let the attack proceed", effects: [] },
        ],
        card(SAGA.fordCard).text,
      );
      return true;
    }
    case "sagaFordCancel": {
      const enemy = get(s, e.target);
      const c = s.combat;
      if (!enemy || !c || c.enemyId !== enemy.id) return true;
      const burden = s.flightFord?.burdens.shift();
      if (!burden) return true;
      s.encounterDeck.push(burden);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Flight to the Ford · Campaign: ${card(burden).name} is shuffled from the burden deck into the encounter deck, and ${name(enemy)}'s attack is canceled.`,
        "good",
      );
      const done = fx("enemyDone", {
        flag: true,
        player: c.attackPlayer ?? activeSeat(s),
      });
      if (c.immediate) {
        s.queue = s.queue.filter(
          (x) =>
            !(x.kind === "immediateChooseDefender" && x.target === enemy.id),
        );
        prepend(s, done);
        return true;
      }
      // The canceled attack ends (as Terrible to Behold).
      const end = s.queue.findIndex((x) => x.kind === "enemyDone");
      if (end >= 0) s.queue.splice(0, end + 1, done);
      else prepend(s, done);
      return true;
    }
    case "sagaRingDraws": {
      const enemies = s.staging.filter((u) =>
        ["enemy", "ship-enemy"].includes(card(u.code).type_code),
      );
      const p = first(s);
      for (const enemy of enemies)
        forOwner(s, p, () => engage(s, enemy, false));
      log(
        s,
        enemies.length
          ? `The Ring Draws Them: ${enemies.map((u) => name(u)).join(", ")} ${enemies.length === 1 ? "engages" : "engage"} the first player.`
          : "The Ring Draws Them: no enemy is in the staging area.",
        "danger",
      );
      return true;
    }
    case "sagaGildorEnd": {
      const gildor = get(s, e.target);
      if (!gildor) return true;
      const discard = fx("sagaGildorDiscard", { target: gildor.id });
      const payers = fellowshipPayers(s);
      if (!payers.length) {
        prepend(s, discard);
        return true;
      }
      choose(
        s,
        "Gildor Inglorion · Forced: discard him at the end of the round?",
        [
          ...payers.map((h) => ({
            id: h.id,
            code: h.code,
            label: `Spend 1 [fellowship] resource from ${name(h)} to keep Gildor Inglorion`,
            effects: [
              fx("sagaGildorKeep", { target: gildor.id, source: h.id }),
            ],
          })),
          {
            id: "discard",
            label: "Discard Gildor Inglorion",
            effects: [discard],
          },
        ],
      );
      return true;
    }
    case "sagaGildorKeep": {
      const hero = get(s, e.source);
      if (!hero || hero.resources < 1) return true;
      hero.resources -= 1;
      log(
        s,
        `Gildor Inglorion stays: 1 [fellowship] resource is spent from ${name(hero)}.`,
        "good",
      );
      return true;
    }
    case "sagaGildorDiscard": {
      const gildor = get(s, e.target);
      if (!gildor) return true;
      const p = playerOrder(s).find((i) =>
        seatView(s, i).allies.some((x) => x.id === gildor.id),
      );
      if (p === undefined) return true;
      forOwner(s, p, () => {
        for (const a of [...gildor.attachments])
          discardAttachment(s, gildor, a, true);
        s.allies = s.allies.filter((x) => x.id !== gildor.id);
        s.encounterDiscard.push(gildor.code);
      });
      log(s, "Gildor Inglorion is discarded at the end of the round.");
      return true;
    }
  }
  return false;
}
export function validateSagaCards(s: GameState) {
  const q = s.sagaCards;
  if (q === undefined) return true;
  return (
    !!q &&
    Number.isSafeInteger(q.ringDraws) &&
    q.ringDraws >= 0 &&
    Array.isArray(q.underhill) &&
    q.underhill.every(
      (m) =>
        !!m &&
        typeof m.enemy === "string" &&
        Number.isSafeInteger(m.player) &&
        Number.isSafeInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round,
    ) &&
    (isSagaCampaign(s.campaign) || (!q.ringDraws && !q.underhill.length))
  );
}
