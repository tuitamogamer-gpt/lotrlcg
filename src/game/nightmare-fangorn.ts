/**
 * Into Fangorn's Nightmare Deck (docs/NIGHTMARE.md): its setup card's rules
 * (each player puts a Huorn enemy from the encounter deck into play engaged
 * with them; the players cannot defeat stage 1B or 2B unless Edge of Fangorn
 * is in the victory display) and its Nightmare encounter cards, composed with
 * the scenario's own rules (src/game/fangorn.ts) through batch4Scenario while
 * a Nightmare mode game is played. The scenario's Huorn searches, Hinder,
 * time counters, beginning-of-resource ordering and Mugash serve the
 * Nightmare cards. Effects use the "nfg" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  stats,
  threatOf,
} from "./core";
import { damage, engage, enemyAddedToStaging, exhaustCharacter } from "./board";
import {
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { canRemoveQuestTime } from "./quest-time";
import { currentQuestProgress } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import { fangornResourceEffects } from "./fangorn";
import { FANGORN as F } from "./fangorn-support";
import { NIGHTMARE_VOI as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareFangornState {
  /** Wicked Huorn's shadow: the attacking enemy cannot take damage until the end of the round. */
  fangornShield?: { enemy: string; round: number }[];
}

const fgLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "into-fangorn";
const isHuorn = (u: Unit) =>
  card(u.code).type_code === "enemy" &&
  /\bHuorn\b/.test(card(u.code).traits ?? "");
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const carrier = (s: GameState) =>
  allHeroes(s).find((h) =>
    h.attachments.some((a) => a.code === F.mugash && !a.blanked),
  );
const characterTypes = ["hero", "ally", "objective-ally"];

// ------------------------------------------------------------- the setup card

/** "Setup: Each player searches the encounter deck for a Huorn enemy and puts it into play engaged with him. Shuffle the encounter deck." */
const fgSetupFollowUp = (s: GameState): Effect[] =>
  fgLive(s)
    ? [
        ...playerOrder(s).map((player) => fx("nfgSetupSearch", { player })),
        fx("fangornShuffle"),
      ]
    : [];
/** "The players cannot defeat stage 1B or 2B unless Edge of Fangorn is in the victory display." */
const fgCannotDefeatStage = (s: GameState, stage: number) =>
  fgLive(s) &&
  (stage === 1 || stage === 2) &&
  !(s.victoryCards ?? []).includes(F.edge);

// ------------------------------------------------------------- the cards

/**
 * Huorn of Fangorn: "Forced: At the beginning of each resource phase, the
 * engaged player discards 1 attachment he controls." Wicked Huorn: "Forced:
 * At the beginning of each resource phase, the engaged player exhausts a hero
 * he controls." They join the scenario's own Huorns in one first-player order.
 */
function fgResourceStart(s: GameState): Effect[] {
  if (!fgLive(s)) return [];
  const nightmare = allEngaged(s)
    .filter((u) => live(s, u, N.huornOfFangorn) || live(s, u, N.wicked))
    .map((u) =>
      fx(u.code === N.wicked ? "nfgWicked" : "nfgHuorn", {
        target: u.id,
        code: u.code,
        text: `${card(u.code).name}${seatLabel(s, ownerOf(s, u))}`,
        player: ownerOf(s, u),
      }),
    );
  if (!nightmare.length) return [];
  return [
    fx("fangornOrder", {
      effects: [...fangornResourceEffects(s), ...nightmare],
      player: firstPlayer(s),
    }),
  ];
}
/** Blocking Huorn: "While Blocking Huorn is engaged with a player, it adds its [threat] to the staging area." */
const fgStagingThreat = (s: GameState) =>
  fgLive(s)
    ? allEngaged(s)
        .filter((u) => live(s, u, N.blocking))
        .reduce((n, u) => n + threatOf(s, u), 0)
    : 0;
/** Entwood: "While Entwood is in the staging area, each Huorn enemy in the staging area gains: 'Immune to player card effects.'" */
const fgImmune = (s: GameState, u: Unit) =>
  fgLive(s) && isHuorn(u) && inStaging(s, u) && staged(s, N.entwood).length > 0;
/** Dark Corner of Fangorn: "While Dark Corner of Fangorn is in the staging area, each Huorn enemy loses the hinder keyword." */
const fgLosesKeyword = (s: GameState, u: Unit, keyword: string) =>
  fgLive(s) &&
  keyword.toLowerCase() === "hinder" &&
  isHuorn(u) &&
  staged(s, N.darkCorner).length > 0;
/** Entwood: "Travel: The first player engages the highest engagement cost Huorn enemy in the staging area." */
const fgTravelProblem = (s: GameState, u: Unit) =>
  fgLive(s) && live(s, u, N.entwood) && !s.staging.some(isHuorn)
    ? "Entwood requires a Huorn enemy in the staging area to engage."
    : null;
const fgTravelEffects = (s: GameState, u: Unit): Effect[] | undefined =>
  fgLive(s) && live(s, u, N.entwood)
    ? [fx("nfgEntwood", { player: firstPlayer(s) })]
    : undefined;
/** Dark Corner of Fangorn: "Forced: After Dark Corner of Fangorn becomes the active location, each engaged Huorn enemy makes an immediate attack." */
function fgTravelEntered(s: GameState, u: Unit) {
  if (!fgLive(s) || !live(s, u, N.darkCorner)) return;
  if (!allActiveLocations(s).some((l) => l.id === u.id)) return;
  const huorns = allEngaged(s).filter(isHuorn);
  if (!huorns.length) return;
  log(
    s,
    "Dark Corner of Fangorn becomes the active location: each engaged Huorn enemy attacks.",
    "danger",
  );
  prepend(
    s,
    fx("fangornOrder", {
      text: "Choose the next Huorn to attack",
      effects: huorns.map((h) =>
        fx("immediateAttack", {
          target: h.id,
          code: h.code,
          player: ownerOf(s, h),
        }),
      ),
      player: firstPlayer(s),
    }),
  );
}
/**
 * Tangled Forest, in the staging area: "Forced: After any amount of progress
 * is removed from the current quest, assign X damage among characters in
 * play. X is the number of progress just removed. This ability does not
 * stack with other copies of Tangled Forest."
 */
function fgQuestProgressRemoved(s: GameState, amount: number) {
  if (!fgLive(s) || amount <= 0 || !staged(s, N.tangledForest).length) return;
  log(
    s,
    `Tangled Forest: ${amount} progress left the current quest; ${amount} damage is assigned among characters in play.`,
    "danger",
  );
  prepend(s, fx("nfgTangled", { value: amount, player: firstPlayer(s) }));
}
/** Stifling Woods' shadow: "If this attack destroys a character, remove all progress from the current quest." */
function fgCharacterDestroyed(s: GameState, u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (
    !fgLive(s) ||
    !c?.nmClearOnKill ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !characterTypes.includes(card(u.code).type_code)
  )
    return;
  const copies = c.nmClearOnKill;
  c.nmClearOnKill = 0;
  prepend(
    s,
    ...Array.from({ length: copies }, () =>
      fx("nfgClear", { player: firstPlayer(s) }),
    ),
  );
}
/** Fangorn's Anger's shadow: "After this attack, if Mugash is attached to a hero, attacking enemy engages the player who controls that hero." */
function fgAttackFinished(s: GameState, combat: Combat): Effect[] {
  if (!fgLive(s) || !combat.nmEngageCarrier) return [];
  const hero = carrier(s);
  if (!hero) return [];
  return [
    fx("nfgEngageCarrier", {
      target: combat.enemyId,
      player: ownerOf(s, hero),
    }),
  ];
}
/** Wicked Huorn's shadow: "Attacking enemy cannot take damage until the end of the round." */
function fgDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !fgLive(s) ||
    amount <= 0 ||
    !(s.nightmare?.fangornShield ?? []).some(
      (r) => r.enemy === u.id && r.round === s.round,
    )
  )
    return amount;
  log(s, `${name(u)} cannot take damage this round (Wicked Huorn).`);
  return 0;
}
function fgRoundEnd(s: GameState): Effect[] {
  const q = s.nightmare;
  if (fgLive(s) && q?.fangornShield)
    q.fangornShield = q.fangornShield.filter((r) => r.round > s.round);
  return [];
}
/** Fangorn's Anger: "If Mugash is not attached to a hero, Fangorn's Anger gains surge and doomed 2." (read as it is revealed) */
const angerFree = (s: GameState, code: string) =>
  fgLive(s) && code === N.anger && !carrier(s);
const fgRevealedDoomed = (s: GameState, code: string) =>
  angerFree(s, code) ? 2 : 0;
const fgRevealedSurge = (s: GameState, code: string) => angerFree(s, code);

function fgEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!fgLive(s) || (code !== N.stifling && code !== N.anger)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Stifling Woods: "Either remove 6 progress from the current quest, or
  // remove 1 time counter from the current quest."
  if (code === N.stifling) {
    prepend(s, fx("nfgStifling", { player: firstPlayer(s) }));
    return true;
  }
  // Fangorn's Anger: "If Mugash is attached to a hero, deal 2 damage to that
  // hero." Without a captive, its surge and doomed 2 came with the reveal.
  const hero = carrier(s);
  if (hero)
    prepend(s, fx("nfgAnger", { target: hero.id, player: ownerOf(s, hero) }));
  else
    log(
      s,
      "Fangorn's Anger: Mugash is not attached to a hero, so it has surge and doomed 2.",
      "danger",
    );
  return true;
}

function fgShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !fgLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (code) {
    // Huorn of Fangorn: "Deal 1 damage to defending character."
    case N.huornOfFangorn:
      for (const d of defenders) damage(s, d.id, 1);
      return true;
    // Blocking Huorn: "Put Blocking Huorn into play engaged with you."
    case N.blocking: {
      const attacker = get(s, c.enemyId);
      const index =
        attacker?.shadows
          .slice(0, attacker.revealedShadowCount ?? 0)
          .lastIndexOf(code) ?? -1;
      if (!attacker || index < 0) return true;
      removeShadowCard(attacker, index);
      const huorn = make(s, code);
      forOwner(s, attacked, () => engage(s, huorn));
      if (!allEngaged(s).some((x) => x.id === huorn.id)) {
        s.staging.push(huorn);
        enemyAddedToStaging(s, huorn);
      } else
        log(
          s,
          `Blocking Huorn comes into play engaged${seatLabel(s, attacked)}.`,
          "danger",
        );
      return true;
    }
    // Wicked Huorn: "Attacking enemy cannot take damage until the end of the
    // round."
    case N.wicked: {
      const q = (s.nightmare ??= {});
      q.fangornShield = [
        ...(q.fangornShield ?? []),
        { enemy: c.enemyId, round: s.round },
      ];
      return true;
    }
    // Stifling Woods: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, remove all progress from the current quest."
    case N.stifling:
      c.attackBonus += 1;
      c.nmClearOnKill = (c.nmClearOnKill ?? 0) + 1;
      return true;
    // Fangorn's Anger: "After this attack, if Mugash is attached to a hero,
    // attacking enemy engages the player who controls that hero."
    case N.anger:
      c.nmEngageCarrier = (c.nmEngageCarrier ?? 0) + 1;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareFangornEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfg")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nfgSetupSearch": {
      const options = [...new Set(s.encounterDeck)]
        .filter((code) => card(code).type_code === "enemy")
        .filter((code) => /\bHuorn\b/.test(card(code).traits ?? ""))
        .map((code): Option => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("fangornTakeHuorn", {
              code,
              text: "deck",
              flag: true,
              player: p,
            }),
          ],
        }));
      if (!options.length) {
        log(
          s,
          "Into Fangorn · Nightmare: no Huorn is left in the encounter deck.",
        );
        return true;
      }
      choose(
        s,
        `Into Fangorn · Nightmare: choose a Huorn from the encounter deck to engage${seatLabel(s, p)}`,
        options,
        card(N.fangornCard).back_text,
      );
      return true;
    }
    case "nfgHuorn":
      log(
        s,
        `Huorn of Fangorn: the engaged player discards an attachment they control${seatLabel(s, p)}.`,
        "danger",
      );
      prepend(s, fx("fordsDiscardAttachments", { player: p }));
      return true;
    case "nfgWicked": {
      const heroes = seatView(s, p).heroes.filter((h) => !h.exhausted);
      if (!heroes.length) return true;
      choose(
        s,
        `Wicked Huorn · Exhaust a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Exhaust ${name(h)}`,
          effects: [fx("nfgExhaust", { target: h.id, player: p })],
        })),
        card(N.wicked).text,
      );
      return true;
    }
    case "nfgExhaust":
      if (u) exhaustCharacter(s, u);
      return true;
    case "nfgEntwood": {
      const huorns = s.staging.filter(isHuorn);
      if (!huorns.length) return true;
      const top = Math.max(...huorns.map((h) => engagementCost(s, h)));
      const highest = huorns.filter((h) => engagementCost(s, h) === top);
      if (highest.length === 1) {
        prepend(s, fx("nfgEngage", { target: highest[0].id, player: p }));
        return true;
      }
      choose(
        s,
        "Entwood · Engage the highest engagement cost Huorn enemy in the staging area",
        highest.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Engage ${name(h)}`,
          effects: [fx("nfgEngage", { target: h.id, player: p })],
        })),
        card(N.entwood).text,
      );
      return true;
    }
    case "nfgEngage":
      if (u && inStaging(s, u)) {
        engage(s, u);
        log(s, `Entwood: ${name(u)} engages the first player.`, "danger");
      }
      return true;
    case "nfgTangled": {
      const remaining = e.value ?? 0;
      const assignments = e.effects ?? [];
      const assigned = (x: Unit) =>
        assignments
          .filter((a) => a.target === x.id)
          .reduce((n, a) => n + (a.value ?? 0), 0);
      const eligible = globalCharacters(s)
        .map((x) => ({
          x,
          capacity: stats(s, x).health - x.damage - assigned(x),
        }))
        .filter((o) => o.capacity > 0);
      if (remaining <= 0 || !eligible.length) {
        // Damage is dealt after every assignment is chosen.
        const totals = new Map<string, Effect>();
        for (const a of assignments) {
          const prior = totals.get(a.target!);
          if (prior) prior.value = (prior.value ?? 0) + (a.value ?? 0);
          else totals.set(a.target!, { ...a });
        }
        prepend(s, ...totals.values());
        return true;
      }
      choose(
        s,
        `Tangled Forest · Assign ${remaining} damage among characters in play`,
        eligible.flatMap(({ x, capacity }) =>
          Array.from({ length: Math.min(remaining, capacity) }, (_v, i) => ({
            id: `${x.id}:${i + 1}`,
            code: x.code,
            label: `${name(x)}${seatLabel(s, ownerOf(s, x))} · ${i + 1} damage`,
            effects: [
              fx("nfgTangled", {
                value: remaining - i - 1,
                player: p,
                effects: [
                  ...assignments,
                  fx("damage", {
                    target: x.id,
                    value: i + 1,
                    player: ownerOf(s, x),
                  }),
                ],
              }),
            ],
          })),
        ),
        "Divide the damage among characters in play. Damage is dealt after all assignments are chosen.",
      );
      return true;
    }
    case "nfgStifling": {
      // Either option must be fully resolvable when one is.
      const progress = currentQuestProgress(s);
      const options: Option[] = [
        ...(progress >= 6
          ? [
              {
                id: "progress",
                label: "Remove 6 progress from the current quest",
                effects: [fx("nfgRemoveProgress", { value: 6, player: p })],
              },
            ]
          : []),
        ...(canRemoveQuestTime(s)
          ? [
              {
                id: "time",
                label: "Remove 1 time counter from the current quest",
                effects: [fx("removeQuestTime", { player: p })],
              },
            ]
          : []),
      ];
      if (options.length === 2) {
        choose(
          s,
          "Stifling Woods · Remove 6 progress or 1 time counter from the current quest",
          options,
          card(N.stifling).text,
        );
        return true;
      }
      const forced = options[0] ?? {
        id: "progress",
        label: `Remove ${progress} progress from the current quest`,
        effects: progress
          ? [fx("nfgRemoveProgress", { value: progress, player: p })]
          : [],
      };
      log(s, `Stifling Woods: ${forced.label.toLowerCase()}.`, "danger");
      prepend(s, ...forced.effects);
      return true;
    }
    case "nfgRemoveProgress":
      removeCurrentQuestProgress(s, e.value ?? 0);
      return true;
    case "nfgClear": {
      const removed = removeCurrentQuestProgress(s, currentQuestProgress(s));
      log(
        s,
        `Stifling Woods: a character fell, and ${removed} progress ${removed === 1 ? "leaves" : "leave"} the current quest.`,
        "danger",
      );
      return true;
    }
    case "nfgAnger":
      if (u) {
        log(s, `Fangorn's Anger deals 2 damage to ${name(u)}.`, "danger");
        damage(s, u.id, 2);
      }
      return true;
    case "nfgEngageCarrier":
      if (
        u &&
        carrier(s) &&
        !seatView(s, p).engaged.some((x) => x.id === u.id)
      ) {
        engage(s, u);
        log(
          s,
          `Fangorn's Anger: ${name(u)} engages the player whose hero holds Mugash${seatLabel(s, p)}.`,
          "danger",
        );
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_FANGORN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  setupFollowUp: fgSetupFollowUp,
  cannotDefeatStage: fgCannotDefeatStage,
  resourceStart: fgResourceStart,
  stagingThreat: fgStagingThreat,
  immune: fgImmune,
  losesKeyword: fgLosesKeyword,
  travelProblem: fgTravelProblem,
  travelEffects: fgTravelEffects,
  travelEntered: fgTravelEntered,
  questProgressRemoved: fgQuestProgressRemoved,
  characterDestroyed: fgCharacterDestroyed,
  attackFinished: fgAttackFinished,
  damageAmount: fgDamageAmount,
  roundEnd: fgRoundEnd,
  revealedDoomed: fgRevealedDoomed,
  revealedSurge: fgRevealedSurge,
  encounter: fgEncounter,
  shadow: fgShadow,
  effect: nightmareFangornEffect,
  sharedEffect: (e) =>
    [
      "nfgEntwood",
      "nfgEngage",
      "nfgTangled",
      "nfgStifling",
      "nfgRemoveProgress",
      "nfgClear",
    ].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareFangorn(s: GameState) {
  const list = s.nightmare?.fangornShield;
  return (
    list === undefined ||
    (Array.isArray(list) &&
      list.every(
        (r) =>
          !!r &&
          typeof r.enemy === "string" &&
          Number.isInteger(r.round) &&
          r.round >= 0,
      ))
  );
}
