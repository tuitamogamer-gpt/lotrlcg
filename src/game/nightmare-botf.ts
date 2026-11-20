/**
 * Breaking of the Fellowship's Nightmare Deck (docs/NIGHTMARE.md): its
 * Nightmare encounter cards (the setup card has no rule beyond the
 * removals), composed with the scenario's own rules
 * (src/game/breaking-fellowship.ts) through batch4Scenario while a Nightmare
 * mode game is played. The scenario's separate stages, Toughness, archery
 * for each stage and its "first player's staging area" serve the Nightmare
 * cards. Effects use the "nbf" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random } from "./core";
import { damage, discardHandCard, engage, raiseThreat } from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalCharacters,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { who } from "./black-riders-hunted";
import { bfArea, bfCurrentQuest } from "./breaking-fellowship-support";
import {
  bfAddToStaging,
  bfAreaFirst,
  bfGlobalFirst,
  bfLeftPlayer,
  bfStagingFor,
  bfToughness,
} from "./breaking-fellowship";
import { NIGHTMARE_TRD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

export interface NightmareBreakingState {
  /** Langflood River: progress placed on each stage this round. */
  breakingProgress?: { area: string; round: number; placed: number }[];
  /** Arrows in the Night: archery added to a stage this round, less the cards discarded. */
  breakingArrows?: { area: string; round: number; value: number }[];
  /** Hunting the Ring: copies attached to a stage's quest card. */
  breakingHunting?: { area: string; quest: string }[];
  /** Discord and Distrust: the round in which players cannot trigger Actions or Responses. */
  breakingDiscord?: number;
  /** Discord and Distrust's shadow: characters that cannot ready this round. */
  breakingNoReady?: { id: string; round: number }[];
}

type Combat = NonNullable<GameState["combat"]>;

const bfLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "breaking-of-the-fellowship";
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
/** The active player's stage, by its staging area's id ("shared" before the players separate). */
const areaId = (s: GameState) => bfArea(s)?.id ?? "shared";
const ownCharacters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** Langflood River: "no more than 4 progress can be placed on this quest stage each round." */
const LANGFLOOD_CAP = 4;

// ------------------------------------------------------------- the cards

/** Western Emyn Muil: "While Western Emyn Muil is in the staging area, each Uruk-hai enemy at this stage gains Toughness 1." */
function bfToughnessBonus(s: GameState, u: Unit) {
  if (!bfLive(s) || !isEnemy(u) || !traitOf(u.code, "Uruk-hai")) return 0;
  return bfStagingFor(s, u).filter((x) => live(s, x, N.emynMuil)).length;
}
/** Isengard Archer: "Archery 2." Isengard Tracker: "Archery 1." (While in the staging area.) */
const bfUnitArchery = (s: GameState, u: Unit) =>
  !bfLive(s)
    ? 0
    : live(s, u, N.isengardArcher)
      ? 2
      : live(s, u, N.isengardTracker)
        ? 1
        : 0;
/** Arrows in the Night: "add 6 to the archery total at this stage", less the cards discarded. */
const bfAreaArchery = (s: GameState, area: string) =>
  bfLive(s)
    ? (s.nightmare?.breakingArrows ?? [])
        .filter((x) => x.area === area && x.round === s.round)
        .reduce((n, x) => n + x.value, 0)
    : 0;
/** Isengard Archer: "Forced: After Isengard Archer enters the staging area, each player at this stage deals 2 damage to a character he controls." */
function bfEnemyEntered(s: GameState, u: Unit) {
  if (
    !bfLive(s) ||
    !live(s, u, N.isengardArcher) ||
    !s.staging.some((x) => x.id === u.id)
  )
    return;
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("nbfHurt", { value: 2, code: N.isengardArcher, player }),
    ),
  );
}
/** Isengard Tracker: "Forced: After Isengard Tracker destroys a character ..." (the attack's kill is recorded). */
function bfCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: { combatDamage?: boolean; enemyId?: string },
) {
  if (
    bfLive(s) &&
    s.combat &&
    isCharacter(u) &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId
  )
    s.combat.nmDestroyed = true;
}
/** Isengard Tracker: "... move it to the first player's staging area." (Its shadow's move, the scenario's Growing Threat's, takes it there already.) */
function bfAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!bfLive(s) || skipped || !c.nmDestroyed || c.btfGrowing) return [];
  const enemy = get(s, c.enemyId);
  return enemy && live(s, enemy, N.isengardTracker)
    ? [
        fx("btfMoveToFirst", {
          target: enemy.id,
          player: c.attackPlayer ?? firstPlayer(s),
        }),
      ]
    : [];
}
/** Langflood River: "While Langflood River is in the staging area, no more than 4 progress can be placed on this quest stage each round." */
function bfProgress(s: GameState, amount: number, quest: Unit) {
  if (!bfLive(s) || amount <= 0 || quest.id !== mainQuestUnit(s)?.id)
    return amount;
  const q = (s.nightmare ??= {});
  const area = areaId(s);
  const entry = q.breakingProgress?.find(
    (x) => x.area === area && x.round === s.round,
  ) ?? { area, round: s.round, placed: 0 };
  const capped = s.staging.some((u) => live(s, u, N.langflood));
  const placed = capped
    ? Math.min(amount, Math.max(0, LANGFLOOD_CAP - entry.placed))
    : amount;
  if (placed < amount)
    log(
      s,
      `Langflood River: no more than ${LANGFLOOD_CAP} progress can be placed on this stage this round (${placed} of ${amount}).`,
      "danger",
    );
  q.breakingProgress = [
    ...(q.breakingProgress ?? []).filter(
      (x) => x.round === s.round && x.area !== area,
    ),
    { ...entry, placed: entry.placed + placed },
  ];
  return placed;
}
/** Langflood River: "Forced: When Langflood River leaves play as an explored location, add it to the staging area to the left, if able." */
function bfExplored(s: GameState, u: Unit) {
  if (bfLive(s) && live(s, u, N.langflood))
    prepend(s, fx("nbfLangflood", { player: activeSeat(s) }));
}
/** Western Emyn Muil: "Travel: A player at this stage must engage the highest toughness enemy in the staging area to travel here." */
function bfTravelProblem(s: GameState, u: Unit) {
  if (!bfLive(s) || !live(s, u, N.emynMuil)) return null;
  return s.staging.some((x) => isEnemy(x))
    ? null
    : "A player at this stage must engage the highest toughness enemy in the staging area to travel to Western Emyn Muil.";
}
function bfTravelEffects(s: GameState, u: Unit) {
  if (!bfLive(s) || !live(s, u, N.emynMuil)) return undefined;
  return [fx("nbfEmyn", { player: activeSeat(s) })];
}
/** Hunting the Ring, attached to a stage: "Forced: At the end of the round ..." */
function bfRoundEnd(s: GameState): Effect[] {
  if (!bfLive(s)) return [];
  return (s.nightmare?.breakingHunting ?? []).map((x) =>
    fx("nbfHunting", { text: x.area, player: bfAreaFirst(s, x.area) }),
  );
}
/** Discord and Distrust: "Until the end of the round, players cannot trigger Action or Response effects." */
const bfAbilitiesBlocked = (s: GameState) =>
  bfLive(s) && s.nightmare?.breakingDiscord === s.round;
/** Discord and Distrust's shadow: "Until the end of the round, defending character cannot ready." */
const bfCannotReady = (s: GameState, u: Unit) =>
  bfLive(s) &&
  (s.nightmare?.breakingNoReady ?? []).some(
    (x) => x.id === u.id && x.round === s.round,
  );

function bfEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !bfLive(s) ||
    !([N.arrowsNight, N.huntingRing, N.discord] as readonly string[]).includes(
      code,
    )
  )
    return false;
  const p = activeSeat(s);
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  const q = (s.nightmare ??= {});
  if (code === N.huntingRing) {
    // Hunting the Ring: "Attach to the current quest." Its surge is printed.
    q.breakingHunting = [
      ...(q.breakingHunting ?? []),
      { area: areaId(s), quest: bfCurrentQuest(s) ?? "" },
    ];
    log(
      s,
      `Hunting the Ring is attached to ${card(bfCurrentQuest(s) ?? code).name}.`,
      "danger",
    );
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.discord) {
    // Discord and Distrust: its doomed 2 is printed.
    q.breakingDiscord = s.round;
    log(
      s,
      "Discord and Distrust: until the end of the round, players cannot trigger Action or Response effects.",
      "danger",
    );
    return true;
  }
  // Arrows in the Night: "Until the end of the round, add 6 to the archery
  // total at this stage. You may discard X cards from hand to reduce the
  // archery total at this stage by X until the end of the round."
  q.breakingArrows = [
    ...(q.breakingArrows ?? []).filter((x) => x.round === s.round),
    { area: areaId(s), round: s.round, value: 6 },
  ];
  log(
    s,
    "Arrows in the Night: the archery total at this stage gets +6 until the end of the round.",
    "danger",
  );
  prepend(s, fx("nbfArrows", { text: areaId(s), player: p }));
  return true;
}

function bfShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !bfLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Isengard Archer: "Deal 2 damage to an ally you control."
    case N.isengardArcher:
      prepend(s, fx("nbfHurt", { value: 2, flag: true, code, player: p }));
      return true;
    // Isengard Tracker: "After this attack, move attacking enemy to the first
    // player's staging area." (The scenario's Growing Threat's shadow.)
    case N.isengardTracker:
      c.btfGrowing = true;
      log(
        s,
        "Isengard Tracker: after this attack, the attacking enemy moves to the first player's staging area.",
        "danger",
      );
      return true;
    // Arrows in the Night: "Discard 1 random card from your hand."
    case N.arrowsNight:
      prepend(s, fx("nbfDiscard", { code, player: p }));
      return true;
    // Discord and Distrust: "Until the end of the round, defending character
    // cannot ready."
    case N.discord: {
      const defenders = c.defenderIds?.length
        ? c.defenderIds
        : c.defenderId
          ? [c.defenderId]
          : [];
      const q = (s.nightmare ??= {});
      q.breakingNoReady = [
        ...(q.breakingNoReady ?? []).filter((x) => x.round === s.round),
        ...defenders.map((id) => ({ id, round: s.round })),
      ];
      if (defenders.length)
        log(
          s,
          "Discord and Distrust: the defending character cannot ready until the end of the round.",
          "danger",
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareBreakingEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nbf")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  const q = (s.nightmare ??= {});
  switch (e.kind) {
    case "nbfHurt": {
      // A player deals X damage to a character (an ally, with the flag) they control.
      const value = e.value ?? 0;
      const targets = ownCharacters(s, p).filter((x) => !e.flag || isAlly(x));
      if (!targets.length) {
        log(
          s,
          `${card(e.code!).name}: ${who(s, p)} control${s.table ? "s" : ""} no ${e.flag ? "ally" : "character"}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name}${seatLabel(s, p)} · Deal ${value} damage to ${e.flag ? "an ally" : "a character"} you control`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("nbfDamage", { target: x.id, value, code: e.code, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "nbfDamage":
      if (u && globalCharacters(s).some((x) => x.id === u.id)) {
        log(
          s,
          `${card(e.code!).name}: ${e.value} damage ${e.value === 1 ? "is" : "are"} dealt to ${name(u)}.`,
          "danger",
        );
        damage(s, u.id, e.value ?? 0);
      }
      return true;
    case "nbfArrows": {
      const options: Option[] = [
        ...s.hand.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Discard ${name(x)} to reduce the archery by 1`,
          effects: [
            fx("nbfArrowsDiscard", { target: x.id, text: e.text, player: p }),
          ],
        })),
        { id: "done", label: "Discard no more cards", effects: [] },
      ];
      if (options.length === 1) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Arrows in the Night${seatLabel(s, p)} · Discard cards to reduce the archery at this stage`,
          options,
          `The archery total at this stage is +${bfAreaArchery(s, e.text ?? "shared")} from Arrows in the Night this round.`,
        ),
      );
      return true;
    }
    case "nbfArrowsDiscard":
      forOwner(s, p, () => {
        if (!s.hand.some((x) => x.id === e.target)) return;
        discardHandCard(s, e.target!, { encounterEffect: true });
        q.breakingArrows = [
          ...(q.breakingArrows ?? []),
          { area: e.text ?? "shared", round: s.round, value: -1 },
        ];
        log(
          s,
          "Arrows in the Night: a card is discarded; the archery total at this stage is reduced by 1.",
          "good",
        );
      });
      prepend(s, fx("nbfArrows", { text: e.text, player: p }));
      return true;
    case "nbfDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const discarded = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `${card(e.code!).name}: ${name(discarded)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, discarded.id, { encounterEffect: true });
      });
      return true;
    case "nbfEmyn": {
      const enemies = s.staging.filter((x) => isEnemy(x));
      if (!enemies.length) return true;
      const top = Math.max(...enemies.map((x) => bfToughness(s, x)));
      const highest = enemies.filter((x) => bfToughness(s, x) === top);
      forOwner(s, p, () =>
        choose(
          s,
          `Western Emyn Muil${seatLabel(s, p)} · Engage the highest toughness enemy`,
          highest.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} (Toughness ${top})`,
            effects: [fx("nbfEngage", { target: x.id, player: p })],
          })),
          "Travel cost.",
        ),
      );
      return true;
    }
    case "nbfEngage":
      if (u && s.staging.some((x) => x.id === u.id)) {
        forOwner(s, p, () => engage(s, u));
        log(
          s,
          `Western Emyn Muil: ${who(s, p)} engage${s.table ? "s" : ""} ${name(u)}.`,
          "danger",
        );
      }
      return true;
    case "nbfLangflood": {
      const i = s.encounterDiscard.lastIndexOf(N.langflood);
      const target = bfLeftPlayer(s, p);
      if (i < 0 || target === undefined) {
        log(
          s,
          "Langflood River: there is no staging area to the left, so it stays in the discard pile.",
        );
        return true;
      }
      s.encounterDiscard.splice(i, 1);
      bfAddToStaging(s, make(s, N.langflood), target);
      log(
        s,
        `Langflood River is added to the staging area to the left${s.table ? ` (${who(s, target)})` : ""}.`,
        "danger",
      );
      return true;
    }
    case "nbfHunting": {
      const area = e.text ?? "shared";
      const at = (q.breakingHunting ?? []).findIndex((x) => x.area === area);
      if (at < 0) return true;
      const [entry] = q.breakingHunting!.splice(at, 1);
      s.encounterDiscard.push(N.huntingRing);
      // The stage it was attached to has left play: it is discarded with it.
      if (areaId(s) !== area || (bfCurrentQuest(s) ?? "") !== entry.quest) {
        log(s, "Hunting the Ring is discarded with its stage.");
        return true;
      }
      const enemies = s.staging.filter((x) => isEnemy(x));
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, enemies.length, "encounter"));
      log(
        s,
        `Hunting the Ring: each player at this stage raises their threat by ${enemies.length}; it is discarded.`,
        "danger",
      );
      // "Move each enemy in this staging area to the first player's staging area."
      if (!playerOrder(s).includes(bfGlobalFirst(s)))
        prepend(
          s,
          ...enemies.map((x) =>
            fx("btfMoveToFirst", { target: x.id, player: p }),
          ),
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_BREAKING_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  toughnessBonus: bfToughnessBonus,
  unitArchery: bfUnitArchery,
  areaArchery: bfAreaArchery,
  enemyEntered: bfEnemyEntered,
  characterDestroyed: bfCharacterDestroyed,
  attackFinished: bfAttackFinished,
  progress: bfProgress,
  explored: bfExplored,
  travelProblem: bfTravelProblem,
  travelEffects: bfTravelEffects,
  roundEnd: bfRoundEnd,
  abilitiesBlocked: bfAbilitiesBlocked,
  cannotReady: bfCannotReady,
  encounter: bfEncounter,
  shadow: bfShadow,
  effect: nightmareBreakingEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareBreaking(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.breakingProgress === undefined ||
      (Array.isArray(q.breakingProgress) &&
        q.breakingProgress.every(
          (x) => !!x && typeof x.area === "string" && n(x.round) && n(x.placed),
        ))) &&
    (q?.breakingArrows === undefined ||
      (Array.isArray(q.breakingArrows) &&
        q.breakingArrows.every(
          (x) =>
            !!x &&
            typeof x.area === "string" &&
            n(x.round) &&
            Number.isInteger(x.value),
        ))) &&
    (q?.breakingHunting === undefined ||
      (Array.isArray(q.breakingHunting) &&
        q.breakingHunting.every(
          (x) =>
            !!x && typeof x.area === "string" && typeof x.quest === "string",
        ))) &&
    (q?.breakingDiscord === undefined || n(q.breakingDiscord)) &&
    (q?.breakingNoReady === undefined ||
      (Array.isArray(q.breakingNoReady) &&
        q.breakingNoReady.every(
          (x) => !!x && typeof x.id === "string" && n(x.round),
        )))
  );
}
