/**
 * Escape from Mount Gram's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rule (the players cannot win while a hero is captured; the captured
 * deck setup lives in the scenario's setup) and its Nightmare encounter
 * cards, composed with the scenario's own rules (src/game/mount-gram.ts)
 * through batch4Scenario while a Nightmare mode game is played. The
 * scenario's capture and rescue (its printed Capture X for the Nightmare
 * cards, the captured-, rescued- and rescue-destination hooks), its private
 * dungeons and its captured decks serve the Nightmare cards. Effects use the
 * "ngm" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend } from "./core";
import { discardHandCard, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  eachArea,
  firstPlayer,
  forOwner,
  globalEngaged,
  globalPlayerOrder,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { who } from "./black-riders-hunted";
import { attachToQuest, currentQuestUnit, mainQuestUnit } from "./quest-state";
import {
  gramArea,
  gramCaptureDeckHeroes,
  gramCaptureFromHand,
  gramCardLeaves,
  gramDiscardCaptured,
  gramRescueRandom,
  gramState,
} from "./mount-gram";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

export interface NightmareGramState {
  /** Prison Cell's and Prison Guard's Planning Actions used this round (once per round for each card). */
  gramUsed?: { id: string; round: number }[];
}

const gmLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "escape-from-mount-gram" &&
  !!gramState(s);
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const printedCost = (code: string) => {
  const n = Number(card(code).cost);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const capturedUnder = (s: GameState, u: Unit) =>
  gramState(s)?.captured[u.id] ?? [];
/** The players cannot win while a hero is captured (underneath a card, or in a captured deck). */
function heroCaptured(s: GameState) {
  const q = gramState(s);
  if (!q) return false;
  return [
    ...Object.values(q.captured).flat(),
    ...Object.values(q.capturedDecks).flat(),
  ].some((u) => card(u.code).type_code === "hero");
}
/** The quest a player's Cruel Torment applies through: their dungeon's, or the final stage. */
function tormented(s: GameState, player: number) {
  const q = gramState(s);
  const quest = q?.split ? gramArea(s, player)?.quest : mainQuestUnit(s);
  return (quest?.attachments ?? []).some(
    (a) => a.code === N.torment && !a.blanked,
  );
}
const usedThisRound = (s: GameState, u: Unit) =>
  (s.nightmare?.gramUsed ?? []).some(
    (m) => m.id === u.id && m.round === s.round,
  );

// ------------------------------------------------------------- the cards

/** Jailor Gornákh: "Forced: After Jailor Gornákh enters play, each player searches his captured deck for each hero and captures them underneath Jailor Gornákh." */
function gmCardEntered(s: GameState, u: Unit) {
  if (!gmLive(s) || !live(s, u, N.jailor)) return;
  if (!gramCaptureDeckHeroes(s, u))
    log(s, "Jailor Gornákh: no hero is left in the captured decks.");
}
/** Jailor Gornákh: "Forced: After a player rescues any number of cards, Jailor Gornákh attacks that player." */
function gmCardsRescued(
  s: GameState,
  source: Unit,
  _count: number,
  player: number,
) {
  if (!gmLive(s)) return;
  const jailors = [...s.staging, ...globalEngaged(s)].filter(
    (u) => live(s, u, N.jailor) && u.id !== source.id,
  );
  for (const u of jailors) {
    log(
      s,
      `Jailor Gornákh: ${seatName(s, player)} rescued cards, so Jailor Gornákh attacks them.`,
      "danger",
    );
    prepend(s, fx("immediateAttack", { target: u.id, player }));
  }
}
/**
 * Raid Golfimbul's Vault: "Forced: When the captured cards underneath Raid
 * Golfimbul's Vault are rescued, put each rescued Item card into its owner's
 * hand and discard the rest."
 */
function gmRescueDestination(s: GameState, source: Unit, u: Unit) {
  if (!gmLive(s) || !live(s, source, N.vault)) return false;
  const owner = u.owner ?? activeSeat(s);
  const item = traitOf(u.code, "Item");
  if (item) seatView(s, owner).hand.push(u);
  else seatView(s, owner).discard.push(u.code);
  log(
    s,
    `Raid Golfimbul's Vault: ${card(u.code).name} is ${item ? `put into ${seatName(s, owner)}'s hand` : "discarded"}.`,
    item ? "good" : "danger",
  );
  return true;
}
/** Raid Golfimbul's Vault: "Forced: After a card is captured by another card effect, capture a random card from each player's hand underneath Raid Golfimbul's Vault." */
function gmCardsCaptured(s: GameState, host: Unit) {
  if (!gmLive(s) || host.code === N.vault) return;
  for (const vault of s.staging.filter((u) => live(s, u, N.vault)))
    prepend(s, fx("ngmVault", { target: vault.id, player: firstPlayer(s) }));
}
/** Raid Golfimbul's Vault, defeated: its captured cards are rescued as it leaves play. */
function gmSideDefeated(s: GameState, u: Unit) {
  if (gmLive(s) && u.code === N.vault) gramCardLeaves(s, u);
}
/** Torture Chamber: "X is twice number of cards captured underneath Torture Chamber." (Its quest points.) */
const gmLocationQuestBonus = (s: GameState, u: Unit) =>
  gmLive(s) && live(s, u, N.chamber) ? 2 * capturedUnder(s, u).length : 0;
/**
 * Torture Chamber: "Forced: At the end of the combat phase, if Torture
 * Chamber is in the staging area, deal 1 damage to each exhausted
 * character." (In each dungeon, for each copy there.)
 */
function gmCombatEnd(s: GameState) {
  if (!gmLive(s)) return;
  const effects: Effect[] = [];
  eachArea(s, () => {
    const n = s.staging.filter((u) => live(s, u, N.chamber)).length;
    if (!n) return;
    for (const p of playerOrder(s))
      for (const u of [...seatView(s, p).heroes, ...seatView(s, p).allies])
        if (isCharacter(u) && u.exhausted)
          effects.push(fx("damage", { target: u.id, value: n, player: p }));
  });
  if (!effects.length) return;
  log(
    s,
    "Torture Chamber: at the end of the combat phase, each exhausted character takes 1 damage.",
    "danger",
  );
  prepend(s, ...effects);
}
/**
 * Prison Cell (active): "Planning Action: Rescue a random card from
 * underneath Prison Cell. Then, raise each player's threat by X, where X is
 * that card's printed cost. (Limit once per round)." Prison Guard (while you
 * are engaged with it): the same.
 */
const gmAbilityLabel = (code: string) =>
  code === N.prisonCell
    ? "Prison Cell · Planning Action: rescue a random captured card (each player raises their threat by its cost)"
    : code === N.prisonGuard
      ? "Prison Guard · Planning Action: rescue a random captured card (each player raises their threat by its cost)"
      : undefined;
function gmAbilityProblem(s: GameState, u: Unit): string | null {
  if (!gmLive(s) || (u.code !== N.prisonCell && u.code !== N.prisonGuard))
    return null;
  if (u.blanked) return `${name(u)}'s text box is blank.`;
  if (s.phase !== "planning") return "This is a Planning Action.";
  if (
    u.code === N.prisonCell &&
    !allActiveLocations(s).some((x) => x.id === u.id)
  )
    return "Prison Cell has this Action only while it is the active location.";
  if (
    u.code === N.prisonGuard &&
    !seatView(s, activeSeat(s)).engaged.some((x) => x.id === u.id)
  )
    return "Only the player engaged with Prison Guard can trigger this Action.";
  if (usedThisRound(s, u)) return "This Action is limited to once per round.";
  return capturedUnder(s, u).length
    ? null
    : `No card is captured underneath ${name(u)}.`;
}
function gmAbility(s: GameState, u: Unit) {
  if (!gmLive(s) || !gmAbilityLabel(u.code) || gmAbilityProblem(s, u))
    return false;
  const q = (s.nightmare ??= {});
  q.gramUsed = [
    ...(q.gramUsed ?? []).filter((m) => m.round === s.round),
    { id: u.id, round: s.round },
  ];
  prepend(s, fx("ngmRescue", { target: u.id, player: activeSeat(s) }));
  return true;
}
/** Cruel Torment: "Each player cannot have more than 6 cards in his hand." */
function gmCheck(s: GameState) {
  if (!gmLive(s) || s.status !== "playing") return;
  for (const p of globalPlayerOrder(s)) {
    if (seatView(s, p).hand.length <= 6 || !tormented(s, p)) continue;
    const queued =
      s.queue.some((e) => e.kind === "ngmTorment" && e.player === p) ||
      s.choice?.options.some((o) =>
        o.effects.some((e) => e.kind === "ngmTormentDiscard" && e.player === p),
      );
    if (!queued) prepend(s, fx("ngmTorment", { player: p }));
  }
}
/**
 * Orc of Thaurdir: "Forced: When Orc of Thaurdir attacks you, either discard
 * the top 2 cards of your captured deck, or deal Orc of Thaurdir 2
 * additional shadow cards."
 */
function gmEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (!gmLive(s) || !live(s, enemy, N.thaurdir)) return;
  if (s.combat?.enemyId !== enemy.id) return;
  prepend(s, fx("ngmThaurdir", { target: enemy.id, player }));
}
/** Orc of Thaurdir's shadow: "For each damage dealt by this attack, discard the top card of your captured deck." */
function gmAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped?: boolean,
): Effect[] {
  if (!gmLive(s) || skipped || !c.nmDiscardPerDamage) return [];
  const n = c.nmDiscardPerDamage * (c.damageDealt ?? 0);
  if (!n) return [];
  return [
    fx("ngmCapturedDiscard", {
      value: n,
      code: N.thaurdir,
      player: c.attackPlayer ?? activeSeat(s),
    }),
  ];
}

function gmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!gmLive(s) || (code !== N.torment && code !== N.goblinPatrol))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.torment) {
    // Cruel Torment: "When Revealed: Attach to the current quest." (Its
    // surge is the printed keyword.)
    const quest = currentQuestUnit(s);
    const attachment = { id: make(s, code).id, code, exhausted: false };
    if (quest && attachToQuest(s, quest.code, attachment))
      log(
        s,
        `Cruel Torment is attached to ${name(quest)}: each player cannot have more than 6 cards in their hand.`,
        "danger",
      );
    else s.encounterDiscard.push(code);
    return true;
  }
  // Goblin Patrol: "When Revealed: Each player may capture any number of
  // random cards from his hand underneath the current quest. Each player
  // raises his threat by the number of cards in his hand."
  s.encounterDiscard.push(code);
  prepend(s, ...playerOrder(s).map((player) => fx("ngmPatrol", { player })));
  return true;
}

function gmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !gmLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  // Goblin Patrol: "Capture 3 random cards from your hand underneath
  // attacking enemy."
  if (code === N.goblinPatrol) {
    const enemy = get(s, c.enemyId);
    if (enemy && !gramCaptureFromHand(s, enemy, p, 3))
      log(
        s,
        `Goblin Patrol: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
      );
    return true;
  }
  // Orc of Thaurdir: "For each damage dealt by this attack, discard the top
  // card of your captured deck."
  if (code === N.thaurdir) {
    c.nmDiscardPerDamage = (c.nmDiscardPerDamage ?? 0) + 1;
    log(
      s,
      "Orc of Thaurdir: for each damage dealt by this attack, the defending player discards the top card of their captured deck.",
      "danger",
    );
    return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareGramEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ngm")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "ngmRescue": {
      if (!u) return true;
      const rescued = gramRescueRandom(s, u);
      if (!rescued) return true;
      const x = printedCost(rescued.code);
      log(
        s,
        `${name(u)}: ${card(rescued.code).name} is rescued; each player raises their threat by ${x} (its printed cost).`,
        x ? "danger" : undefined,
      );
      if (x)
        for (const player of playerOrder(s))
          forOwner(s, player, () => raiseThreat(s, x, "encounter"));
      return true;
    }
    case "ngmVault":
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      for (const player of playerOrder(s)) gramCaptureFromHand(s, u, player, 1);
      return true;
    case "ngmTorment": {
      const view = seatView(s, p);
      if (view.hand.length <= 6 || !tormented(s, p)) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Cruel Torment${seatLabel(s, p)} · Discard down to 6 cards (${s.hand.length - 6} to discard)`,
          s.hand.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("ngmTormentDiscard", { target: h.id, player: p }),
              fx("ngmTorment", { player: p }),
            ],
          })),
          card(N.torment).text,
        ),
      );
      return true;
    }
    case "ngmTormentDiscard":
      forOwner(s, p, () => {
        const h = s.hand.find((x) => x.id === e.target);
        if (!h) return;
        log(
          s,
          `Cruel Torment: ${name(h)} is discarded${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, h.id, { encounterEffect: true });
      });
      return true;
    case "ngmPatrol": {
      const hand = seatView(s, p).hand.length;
      const quest = currentQuestUnit(s);
      if (!quest || !hand) {
        prepend(s, fx("ngmPatrolThreat", { player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Goblin Patrol${seatLabel(s, p)} · Capture random cards from your hand underneath ${name(quest)}`,
          Array.from({ length: hand + 1 }, (_, n) => ({
            id: `capture-${n}`,
            label: `Capture ${n} random card${n === 1 ? "" : "s"} (raise your threat by ${hand - n})`,
            effects: [
              fx("ngmPatrolCapture", { target: quest.id, value: n, player: p }),
              fx("ngmPatrolThreat", { player: p }),
            ],
          })),
          card(N.goblinPatrol).text,
        ),
      );
      return true;
    }
    case "ngmPatrolCapture": {
      const quest = currentQuestUnit(s);
      if (quest && quest.id === e.target && (e.value ?? 0) > 0)
        gramCaptureFromHand(s, quest, p, e.value ?? 0);
      return true;
    }
    case "ngmPatrolThreat": {
      const n = seatView(s, p).hand.length;
      if (n) forOwner(s, p, () => raiseThreat(s, n, "encounter"));
      log(
        s,
        `Goblin Patrol: ${who(s, p)} ${s.table ? "raises their" : "raise your"} threat by ${n} (the cards in hand).`,
        n ? "danger" : undefined,
      );
      return true;
    }
    case "ngmThaurdir": {
      const deck = gramState(s)?.capturedDecks[p] ?? [];
      const extra = {
        id: "shadows",
        label: "Deal Orc of Thaurdir 2 additional shadow cards",
        effects: [fx("khazadExtraShadows", { target: e.target, count: 2 })],
      };
      if (!deck.length) {
        prepend(s, ...extra.effects);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Orc of Thaurdir${seatLabel(s, p)} · Choose one`,
          [
            {
              id: "discard",
              label: "Discard the top 2 cards of your captured deck",
              effects: [
                fx("ngmCapturedDiscard", {
                  value: 2,
                  code: N.thaurdir,
                  player: p,
                }),
              ],
            },
            extra,
          ],
          card(N.thaurdir).text,
        ),
      );
      return true;
    }
    case "ngmCapturedDiscard": {
      const cards = gramDiscardCaptured(s, p, e.value ?? 0);
      log(
        s,
        cards.length
          ? `${card(e.code!).name}: ${cards.map((x) => card(x.code).name).join(", ")} ${cards.length === 1 ? "is" : "are"} discarded from ${who(s, p)}'s captured deck.`
          : `${card(e.code!).name}: ${who(s, p)}'s captured deck is empty.`,
        cards.length ? "danger" : undefined,
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_GRAM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotWin: (s) => gmLive(s) && heroCaptured(s),
  cardEntered: gmCardEntered,
  cardsRescued: gmCardsRescued,
  rescueDestination: gmRescueDestination,
  cardsCaptured: gmCardsCaptured,
  sideDefeated: gmSideDefeated,
  locationQuestBonus: gmLocationQuestBonus,
  combatEnd: gmCombatEnd,
  abilityLabel: gmAbilityLabel,
  abilityProblem: gmAbilityProblem,
  ability: gmAbility,
  check: gmCheck,
  enemyAttackStarted: gmEnemyAttackStarted,
  attackFinished: gmAttackFinished,
  encounter: gmEncounter,
  shadow: gmShadow,
  effect: nightmareGramEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareGram(s: GameState) {
  const q = s.nightmare;
  if (q?.gramUsed === undefined) return true;
  return (
    gmLive(s) &&
    Array.isArray(q.gramUsed) &&
    q.gramUsed.every(
      (m) =>
        !!m &&
        typeof m.id === "string" &&
        Number.isInteger(m.round) &&
        m.round >= 0 &&
        m.round <= s.round,
    )
  );
}
