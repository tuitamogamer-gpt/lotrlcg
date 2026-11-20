/**
 * The Battle of Five Armies' Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rule (at stage 5B each instruction to remove progress from a quest
 * stage places 1 progress on the setup card instead, and with 3 + 2 × the
 * players' number of them the players lose) and its Nightmare encounter
 * cards, composed with the scenario's own rules
 * (src/game/battle-five-armies.ts) through batch4Scenario while a Nightmare
 * mode game is played. The scenario builds its encounter deck with the setup
 * card's removals and removes the progress the Nightmare cards remove
 * through its own rule. Effects use the "nbf" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { damage, discardAttachment, exhaustCharacter } from "./board";
import {
  allActiveLocations,
  allCharacters,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { NIGHTMARE_OTD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, lose, seatLabel } from "./nightmare-core";
import {
  BOFA,
  bofaEmptyStages,
  bofaStageProgress,
  bofaStagesInPlay,
} from "./battle-five-armies-support";

export interface NightmareBofaState {
  /** The setup card's progress tokens (placed at stage 5B). */
  bofaProgress?: number;
  /** Dread Has Come!: Bolg's attacks are resolving. */
  bofaDread?: number;
  /** Dread Has Come!: the round in which no progress can be placed on the current quest. */
  bofaNoProgress?: number;
  /** Eastern Ridge's shadow: an attacking enemy's defense until the end of the phase. */
  bofaRidge?: { enemy: string; amount: number; round: number; phase: string }[];
}

const bfLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-battle-of-five-armies";
const atStageFive = (s: GameState) =>
  s.battleFiveArmies?.currentQuest === BOFA.clouds;
/** The setup card's X: 5, 7, 9 or 11 for one to four players. */
const doomLimit = (s: GameState) => 3 + 2 * (s.table?.seats.length ?? 1);
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code))
    .length;
/** Group the engine's phase steps into the printed phases. */
const printedPhase = (phase: string) =>
  phase === "staging"
    ? "quest"
    : phase === "attack" || phase === "defense"
      ? "combat"
      : phase;
const currentQuest = (s: GameState) => s.battleFiveArmies?.currentQuest;
const removeFx = (s: GameState, value: number, text: string, code?: string) =>
  fx("bofaRemoveProgress", {
    code: code ?? currentQuest(s),
    value,
    text,
    player: firstPlayer(s),
  });

// ------------------------------------------------------------- the setup card

/**
 * "While the players are at stage 5b, this card gains: "Forced: When the
 * players are instructed to remove any amount of progress from a quest stage,
 * place 1 progress here instead." If there are X progress tokens here, the
 * players lose the game."
 */
function bfProgressRemovalReplaced(s: GameState) {
  if (!bfLive(s) || !atStageFive(s)) return false;
  const q = (s.nightmare ??= {});
  q.bofaProgress = (q.bofaProgress ?? 0) + 1;
  const limit = doomLimit(s);
  log(
    s,
    `The Battle of Five Armies · Nightmare: 1 progress is placed on the setup card instead (${q.bofaProgress} of ${limit}).`,
    "danger",
  );
  if (q.bofaProgress >= limit)
    lose(
      s,
      `The setup card has ${q.bofaProgress} progress tokens: the Goblin host overwhelms the battle and the players lose the game.`,
    );
  return true;
}

// ------------------------------------------------------------- the cards

/** Gundabad Elite: "Cannot be optionally engaged." */
const bfCannotOptionallyEngage = (s: GameState, u: Unit) =>
  bfLive(s) && live(s, u, N.elite);
/** Frenzied Warg-Rider: "Forced: When Frenzied Warg-Rider attacks, remove 1 progress from each quest stage." */
function bfEnemyAttackStarted(s: GameState, enemy: Unit) {
  if (!bfLive(s) || !live(s, enemy, N.frenzied)) return;
  prepend(
    s,
    ...bofaStagesInPlay(s).map((stage) =>
      removeFx(s, 1, "Frenzied Warg-Rider", stage),
    ),
  );
}
/**
 * Great Warg: "Forced: After Great Warg attacks and destroys a character,
 * remove all progress from the current quest." Dread Has Come!: "If at least
 * 1 character is destroyed by one of these attacks, the players cannot place
 * progress on the current quest this round."
 */
function bfCharacterDestroyed(s: GameState, _u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (!bfLive(s) || !c || !ctx.combatDamage || ctx.enemyId !== c.enemyId)
    return;
  const enemy = get(s, c.enemyId);
  if (enemy && live(s, enemy, N.greatWarg) && !c.nmKillResolved) {
    c.nmKillResolved = true;
    prepend(s, removeFx(s, 99, "Great Warg"));
  }
  if (s.nightmare?.bofaDread && enemy?.code === BOFA.bolg) {
    s.nightmare.bofaNoProgress = s.round;
    log(
      s,
      "Dread Has Come!: Bolg's attack destroyed a character; the players cannot place progress on the current quest this round.",
      "danger",
    );
  }
}
/** Dread Has Come!: no progress on the current quest this round. */
function bfProgress(s: GameState, amount: number, quest: Unit) {
  return bfLive(s) &&
    s.nightmare?.bofaNoProgress === s.round &&
    quest.code === currentQuest(s)
    ? 0
    : amount;
}
/** Eastern Ridge's shadow: +1 [defense] for each empty quest stage until the end of the phase. */
function bfStats(s: GameState, u: Unit) {
  if (!bfLive(s)) return {};
  const defense = (s.nightmare?.bofaRidge ?? [])
    .filter(
      (r) =>
        r.enemy === u.id &&
        r.round === s.round &&
        r.phase === printedPhase(s.phase),
    )
    .reduce((n, r) => n + r.amount, 0);
  return defense ? { defense } : {};
}
/**
 * At the end of the round: Gundabad Elite ("if Gundabad Elite is in the
 * staging area, either remove 2 progress from the current quest, or Gundabad
 * Elite makes an attack against the first player"), Embattled Valley ("each
 * player assigns X damage among heroes he controls") and Eastern Ridge
 * ("raise each player's threat by 1 for each quest stage with no progress on
 * it").
 */
function bfRoundEnd(s: GameState): Effect[] {
  if (!bfLive(s)) return [];
  const first = firstPlayer(s);
  const empty = bofaEmptyStages(s);
  const effects: Effect[] = s.staging
    .filter((u) => live(s, u, N.elite))
    .map((u) => fx("nbfElite", { target: u.id, player: first }));
  for (let i = 0; i < inPlay(s, N.valley); i++)
    if (empty)
      effects.push(
        ...playerOrder(s).map((player) =>
          fx("nbfAssign", {
            player,
            value: empty,
            ids: [],
            text: "Embattled Valley",
          }),
        ),
      );
  const ridges = inPlay(s, N.ridge);
  if (ridges && empty)
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("heirsThreat", { value: ridges * empty, player }),
      ),
    );
  // Eastern Ridge's bonuses last until the end of the phase.
  if (s.nightmare?.bofaRidge)
    s.nightmare.bofaRidge = s.nightmare.bofaRidge.filter(
      (r) => r.round > s.round,
    );
  return effects;
}
/** Embattled Valley: "Travel: The players (as a group) exhaust X characters." */
const readyCharacters = (s: GameState) =>
  allCharacters(s).filter((u) => !u.exhausted);
function bfTravelProblem(s: GameState, u: Unit) {
  if (!bfLive(s) || !live(s, u, N.valley)) return null;
  const x = bofaEmptyStages(s);
  return readyCharacters(s).length >= x
    ? null
    : `Travel to Embattled Valley: the players must exhaust ${x} characters.`;
}
const bfTravelEffects = (s: GameState, u: Unit) =>
  bfLive(s) && live(s, u, N.valley) && bofaEmptyStages(s)
    ? [
        fx("nbfValleyExhaust", {
          value: bofaEmptyStages(s),
          player: firstPlayer(s),
        }),
      ]
    : undefined;

function bfEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!bfLive(s) || code !== N.dread) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Dread Has Come!: "Bolg makes an attack against each player in turn
  // order."
  const bolg = s.staging.find((u) => u.code === BOFA.bolg && !u.blanked);
  if (!bolg) {
    log(s, "Dread Has Come!: Bolg is not in play.");
    return true;
  }
  const q = (s.nightmare ??= {});
  q.bofaDread = (q.bofaDread ?? 0) + 1;
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("immediateAttack", { target: bolg.id, player }),
    ),
    fx("nbfDreadDone", { player: firstPlayer(s) }),
  );
  return true;
}

function bfShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !bfLive(s)) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const attacked = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Great Warg: "Defending player discards 1 attachment he controls."
    case N.greatWarg:
      prepend(s, fx("nbfWargShadow", { player: attacked }));
      return true;
    // Frenzied Warg-Rider: "Deal 1 damage to the defending character (2
    // damage instead if the current quest has no progress on it)."
    case N.frenzied: {
      const stage = currentQuest(s);
      const amount = stage && bofaStageProgress(s, stage) > 0 ? 1 : 2;
      for (const d of defenders) damage(s, d.id, amount);
      return true;
    }
    // Eastern Ridge: "Until the end of the phase, attacking enemy gets +1
    // [defense] for each quest stage with no progress on it."
    case N.ridge: {
      const amount = bofaEmptyStages(s);
      if (amount) {
        const q = (s.nightmare ??= {});
        q.bofaRidge = [
          ...(q.bofaRidge ?? []),
          {
            enemy: c.enemyId,
            amount,
            round: s.round,
            phase: printedPhase(s.phase),
          },
        ];
        log(
          s,
          `Eastern Ridge: the attacking enemy gets +${amount} [defense] until the end of the phase.`,
        );
      }
      return true;
    }
    // Dread Has Come!: "Attacking enemy gets +2 [attack]."
    case N.dread:
      c.attackBonus += 2;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareBofaEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nbf")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nbfElite": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      const stage = currentQuest(s);
      // Either option must be fully resolvable: 2 progress to remove (at
      // stage 5B the setup card replaces the instruction).
      const canRemove =
        atStageFive(s) || (!!stage && bofaStageProgress(s, stage) >= 2);
      const attack = fx("immediateAttack", { target: u.id, player: p });
      if (!canRemove) {
        log(
          s,
          "Gundabad Elite: the current quest has fewer than 2 progress; it attacks the first player.",
          "danger",
        );
        prepend(s, attack);
        return true;
      }
      choose(
        s,
        "Gundabad Elite · Remove 2 progress from the current quest, or it attacks the first player",
        [
          {
            id: "progress",
            label: "Remove 2 progress from the current quest",
            effects: [removeFx(s, 2, "Gundabad Elite")],
          },
          {
            id: "attack",
            label: "Gundabad Elite makes an attack against the first player",
            effects: [attack],
          },
        ],
        card(N.elite).text,
      );
      return true;
    }
    case "nbfAssign": {
      // Each point is assigned first, then the damage is dealt together.
      const total = e.value ?? 0;
      const assigned = e.ids ?? [];
      const heroes = seatView(s, p).heroes;
      const source = e.text ?? "Damage";
      if (total <= 0 || !heroes.length) return true;
      const done =
        assigned.length >= total
          ? assigned
          : heroes.length === 1
            ? [
                ...assigned,
                ...Array<string>(total - assigned.length).fill(heroes[0].id),
              ]
            : undefined;
      if (done) {
        const counts = new Map<string, number>();
        for (const id of done) counts.set(id, (counts.get(id) ?? 0) + 1);
        log(
          s,
          `${source}${seatLabel(s, p)}: ${[...counts]
            .map(([id, n]) => `${name(get(s, id)!)} takes ${n}`)
            .join(", ")} damage.`,
          "danger",
        );
        prepend(
          s,
          ...[...counts].map(([target, value]) =>
            fx("damage", { target, value, player: p }),
          ),
        );
        return true;
      }
      const left = total - assigned.length;
      choose(
        s,
        `${source} · Assign 1 damage to a hero you control (${left} of ${total} left)${seatLabel(s, p)}`,
        heroes.map((h): Option => {
          const pending = assigned.filter((id) => id === h.id).length;
          return {
            id: h.id,
            code: h.code,
            label: `${name(h)} (${h.damage}${pending ? ` + ${pending}` : ""} damage)`,
            effects: [
              fx("nbfAssign", {
                player: p,
                value: total,
                ids: [...assigned, h.id],
                text: source,
              }),
            ],
          };
        }),
      );
      return true;
    }
    case "nbfValleyExhaust": {
      const left = e.value ?? 0;
      const ready = readyCharacters(s);
      if (left <= 0 || !ready.length) return true;
      choose(
        s,
        `Embattled Valley · The players exhaust a character (${left} left)`,
        ready.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: `Exhaust ${name(c)}${seatLabel(s, ownerOf(s, c))}`,
          effects: [
            fx("nbfValleyExhaustOne", { target: c.id, value: left, player: p }),
          ],
        })),
        card(N.valley).text,
      );
      return true;
    }
    case "nbfValleyExhaustOne":
      if (u) exhaustCharacter(s, u);
      prepend(
        s,
        fx("nbfValleyExhaust", { value: (e.value ?? 1) - 1, player: p }),
      );
      return true;
    case "nbfWargShadow": {
      const owned = allCharacters(s)
        .filter((c) => ownerOf(s, c) === p)
        .flatMap((c) =>
          c.attachments
            .filter(
              (a) =>
                !a.poison &&
                !a.facedown &&
                card(a.code).type_code === "attachment" &&
                (a.controller ?? a.owner ?? ownerOf(s, c)) === p,
            )
            .map((a) => ({ host: c, a })),
        );
      if (!owned.length) return true;
      choose(
        s,
        `Great Warg · Discard 1 attachment you control${seatLabel(s, p)}`,
        owned.map(({ host, a }): Option => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} (on ${name(host)})`,
          effects: [
            fx("nbfDiscardAttachment", { target: host.id, source: a.id }),
          ],
        })),
        card(N.greatWarg).shadow,
      );
      return true;
    }
    case "nbfDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        discardAttachment(s, u, a, true);
        log(s, `Great Warg: ${card(a.code).name} is discarded.`, "danger");
      }
      return true;
    }
    case "nbfDreadDone": {
      const q = s.nightmare;
      if (q?.bofaDread) {
        q.bofaDread -= 1;
        if (!q.bofaDread) delete q.bofaDread;
      }
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_BOFA_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  progressRemovalReplaced: bfProgressRemovalReplaced,
  cannotOptionallyEngage: bfCannotOptionallyEngage,
  enemyAttackStarted: bfEnemyAttackStarted,
  characterDestroyed: bfCharacterDestroyed,
  progress: bfProgress,
  stats: bfStats,
  roundEnd: bfRoundEnd,
  travelProblem: bfTravelProblem,
  travelEffects: bfTravelEffects,
  encounter: bfEncounter,
  shadow: bfShadow,
  effect: nightmareBofaEffect,
  sharedEffect: (e) =>
    [
      "nbfElite",
      "nbfValleyExhaust",
      "nbfValleyExhaustOne",
      "nbfDreadDone",
    ].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareBofa(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.bofaProgress === undefined || n(q.bofaProgress)) &&
    (q?.bofaDread === undefined || (n(q.bofaDread) && q.bofaDread > 0)) &&
    (q?.bofaNoProgress === undefined || n(q.bofaNoProgress)) &&
    (q?.bofaRidge === undefined ||
      (Array.isArray(q.bofaRidge) &&
        q.bofaRidge.every(
          (r) =>
            !!r &&
            typeof r.enemy === "string" &&
            n(r.amount) &&
            n(r.round) &&
            typeof r.phase === "string",
        )))
  );
}
