/**
 * The Uruk-hai's Nightmare Deck (docs/NIGHTMARE.md): its setup card's rules
 * and its Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/uruk-hai.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's pursuit value ("uhPursuit"), its after-kill
 * shadow pursuit and its Toughness and Archery serve the Nightmare cards;
 * its Captives are already out of player card effects' reach. The setup
 * sets Mauhúr aside, and the scenario's stage 2 asks the stage-revealed hook.
 * Effects use the "nuh" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  progressLocation,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalEngaged,
  ownerOf,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { isUrukHaiEnemyCode } from "./white-hand";
import { UH } from "./uruk-hai-support";
import { NIGHTMARE_TOS as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareUrukState {
  /** Mauhúr, set aside out of play until the players advance to stage 2A. */
  urukMauhur?: Unit;
  /** Enemies that cannot take damage until the end of the round (Lugdush's and Enchanted Land's shadows). */
  urukNoDamage?: { enemy: string; round: number }[];
}

const ukLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-uruk-hai" && !!s.urukHai;
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code));
const pursuit = (value: number, text: string, player: number) =>
  fx("uhPursuit", { value, text, player });
const uglukOf = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].find(
    (u) => u.code === UH.ugluk && !u.blanked,
  );
/** "Cannot take damage until the end of the round." */
function noDamage(s: GameState, enemy: Unit, source: string) {
  const q = (s.nightmare ??= {});
  q.urukNoDamage = [
    ...(q.urukNoDamage ?? []).filter((m) => m.round === s.round),
    { enemy: enemy.id, round: s.round },
  ];
  log(
    s,
    `${source}: ${name(enemy)} cannot take damage until the end of the round.`,
    "danger",
  );
}

// ------------------------------------------------------------- the cards

/** The setup card: "Forced: When the players advance to stage 2A, add Mauhúr to the staging area." */
function ukStageRevealed(s: GameState, stage: number) {
  const q = s.nightmare;
  if (!ukLive(s) || stage !== 2 || !q?.urukMauhur) return;
  const u = q.urukMauhur;
  delete q.urukMauhur;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  log(
    s,
    "The Uruk-hai · Nightmare: the players advance to stage 2A, and Mauhúr is added to the staging area.",
    "danger",
  );
}
/**
 * Mauhúr: "Forced: After Mauhúr attacks, increase the pursuit value by 1."
 * Orc of the White Hand: "Forced: After Orc of the White Hand attacks and
 * destroys a character, increase the pursuit value by 1."
 */
function ukAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
): Effect[] {
  const enemy = get(s, c.enemyId);
  if (!ukLive(s) || !enemy) return [];
  const p = firstPlayer(s);
  if (live(s, enemy, N.mauhur)) return [pursuit(1, "Mauhúr attacked", p)];
  if (live(s, enemy, N.whiteHand) && c.uhKilled)
    return [
      pursuit(1, "Orc of the White Hand's attack destroyed a character", p),
    ];
  return [];
}
/**
 * Lugdush: "While Lugdush is engaged with a player, each other enemy cannot
 * take damage." Lugdush's and Enchanted Land's shadows: the attacking enemy
 * "cannot take damage until the end of the round".
 */
function ukDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _ctx: DamageContext,
) {
  if (!ukLive(s) || amount <= 0 || !isEnemy(u)) return amount;
  if (
    (s.nightmare?.urukNoDamage ?? []).some(
      (m) => m.enemy === u.id && m.round === s.round,
    )
  ) {
    log(s, `${name(u)} cannot take damage until the end of the round.`);
    return 0;
  }
  const lugdush = globalEngaged(s).find(
    (x) => x.id !== u.id && live(s, x, N.lugdush),
  );
  if (lugdush) {
    log(s, `Lugdush is engaged with a player: ${name(u)} cannot take damage.`);
    return 0;
  }
  return amount;
}
/** Wold of Rohan: "Action: Increase the pursuit value by 1 to place 1 progress on Wold of Rohan." */
const ukAbilityLabel = (code: string) =>
  code === N.wold
    ? "Increase the pursuit value by 1: place 1 progress on Wold of Rohan"
    : undefined;
function ukAbilityProblem(s: GameState, u: Unit): string | null {
  if (!ukLive(s) || u.code !== N.wold) return null;
  if (u.blanked) return "Wold of Rohan's text box is blank.";
  if (![...s.staging, ...allActiveLocations(s)].some((x) => x.id === u.id))
    return "Wold of Rohan must be in play.";
  return null;
}
function ukAbility(s: GameState, u: Unit) {
  if (!ukLive(s) || u.code !== N.wold || ukAbilityProblem(s, u)) return false;
  const p = activeSeat(s);
  prepend(
    s,
    pursuit(1, "Wold of Rohan's Action", p),
    fx("nuhWold", { target: u.id, player: p }),
  );
  return true;
}
/** Enchanted Land: "Forced: After an encounter card effect is canceled, increase the pursuit value by 1." */
function ukCancelled(s: GameState) {
  if (!ukLive(s)) return;
  const n = inPlay(s, N.enchanted).length;
  if (n)
    prepend(
      s,
      pursuit(
        n,
        `Enchanted Land: an encounter card effect was canceled${n > 1 ? `, for each of ${n} copies` : ""}`,
        firstPlayer(s),
      ),
    );
}
/**
 * The Uruk's Trail: while it is the active location, "Response: After The
 * Uruk's Trail is explored, reduce the pursuit value by 3." (No drawback:
 * always taken.)
 */
function ukExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (ukLive(s) && wasActive && live(s, u, N.trail))
    prepend(s, pursuit(-3, "The Uruk's Trail is explored", firstPlayer(s)));
}
/**
 * The Uruk's Trail: "Travel: Search the encounter deck and discard pile for
 * a non-unique Uruk-hai enemy and add it to the staging area. Shuffle the
 * encounter deck." (The players travel whether or not one is found.)
 */
const ukTravelEffects = (s: GameState, u: Unit): Effect[] | undefined =>
  ukLive(s) && live(s, u, N.trail)
    ? [fx("nuhTrail", { player: firstPlayer(s) })]
    : undefined;

function ukEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ukLive(s) || (code !== N.command && code !== N.draught)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Uglúk's Command: "When Revealed: Either increase the pursuit value by
  // 4, or Uglúk makes an immediate attack against you." Orc-draught: "When
  // Revealed: Either discard an ally you control, or increase the pursuit
  // value by 1." (Peril: the revealing player chooses.)
  prepend(
    s,
    fx(code === N.command ? "nuhCommand" : "nuhDraught", {
      player: activeSeat(s),
    }),
  );
  return true;
}

function ukShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ukLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Lugdush: "If attacking enemy is unique, it cannot take damage until
    // the end of the round."
    case N.lugdush:
      if (enemy && card(enemy.code).is_unique) noDamage(s, enemy, "Lugdush");
      else log(s, "Lugdush: the attacking enemy is not unique.");
      return true;
    // Orc of the White Hand: "If this attack destroys a character, increase
    // the pursuit value by 1." (The scenario's after-kill pursuit.)
    case N.whiteHand:
      c.uhKillPursuit = (c.uhKillPursuit ?? 0) + 1;
      log(
        s,
        "Orc of the White Hand: if this attack destroys a character, the pursuit value increases by 1.",
        "danger",
      );
      return true;
    // Wold of Rohan: "Discard a non-objective attachment you control."
    case N.wold:
      prepend(s, fx("nuhWoldShadow", { player: p }));
      return true;
    // Enchanted Land: "Either increase the pursuit value by 1, or attacking
    // enemy cannot take damage until the end of the round."
    case N.enchanted:
      prepend(s, fx("nuhEnchantedShadow", { target: c.enemyId, player: p }));
      return true;
    // Uglúk's Command: "Attacking enemy gets +X [attack], where X is the
    // tens digit of the pursuit value."
    case N.command: {
      const x = Math.floor((s.urukHai?.pursuit ?? 0) / 10) % 10;
      c.attackBonus += x;
      log(
        s,
        `Uglúk's Command: the pursuit value is ${s.urukHai?.pursuit ?? 0}; the attacking enemy gets +${x} [attack].`,
        "danger",
      );
      return true;
    }
    // Orc-draught: "Exhaust a character you control."
    case N.draught:
      prepend(s, fx("nuhDraughtShadow", { player: p }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareUrukEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nuh")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nuhWold":
      if (
        u &&
        [...s.staging, ...allActiveLocations(s)].some((x) => x.id === u.id)
      ) {
        log(s, "Wold of Rohan: 1 progress is placed on it.", "good");
        progressLocation(s, u, 1);
      }
      return true;
    case "nuhTrail": {
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of new Set(
          cards.filter((c) => isUrukHaiEnemyCode(c) && !card(c).is_unique),
        ))
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("nuhTrailAdd", { code, text: zone, player: p })],
          });
      prepend(s, fx("nuhShuffle", { player: p }));
      if (!options.length)
        log(
          s,
          "The Uruk's Trail: no non-unique Uruk-hai enemy is in the encounter deck or discard pile.",
        );
      else if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          "The Uruk's Trail · Add a non-unique Uruk-hai enemy to the staging area",
          options,
          card(N.trail).text,
        );
      return true;
    }
    case "nuhTrailAdd": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = pile.lastIndexOf(e.code!);
      if (i < 0) return true;
      const enemy = make(s, pile.splice(i, 1)[0]);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      log(
        s,
        `The Uruk's Trail: ${name(enemy)} is added to the staging area from the ${e.text === "discard" ? "encounter discard pile" : "encounter deck"}.`,
        "danger",
      );
      return true;
    }
    case "nuhShuffle":
      shuffle(s, s.encounterDeck);
      return true;
    case "nuhCommand": {
      const ugluk = uglukOf(s);
      const options: Option[] = [
        {
          id: "pursuit",
          label: "Increase the pursuit value by 4",
          effects: [pursuit(4, "Uglúk's Command", p)],
        },
      ];
      if (ugluk)
        options.push({
          id: "attack",
          code: ugluk.code,
          label: "Uglúk makes an immediate attack against you",
          effects: [fx("immediateAttack", { target: ugluk.id, player: p })],
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Uglúk's Command${seatLabel(s, p)} · +4 pursuit, or Uglúk attacks you`,
            options,
            card(N.command).text,
          ),
        );
      return true;
    }
    case "nuhDraught": {
      const allies = seatView(s, p).allies.filter((x) => isAlly(x));
      const options: Option[] = allies.map((x) => ({
        id: x.id,
        code: x.code,
        label: `Discard ${name(x)}`,
        effects: [fx("nuhDiscardAlly", { target: x.id, player: p })],
      }));
      options.push({
        id: "pursuit",
        label: "Increase the pursuit value by 1",
        effects: [pursuit(1, "Orc-draught", p)],
      });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Orc-draught${seatLabel(s, p)} · Discard an ally you control, or +1 pursuit`,
            options,
            card(N.draught).text,
          ),
        );
      return true;
    }
    case "nuhDiscardAlly":
      if (u && isAlly(u)) {
        log(s, `Orc-draught: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => discardCharacter(s, u));
      }
      return true;
    case "nuhWoldShadow": {
      const options: Option[] = [];
      const view = seatView(s, p);
      for (const host of [...view.heroes, ...view.allies, ...view.engaged])
        for (const a of host.attachments)
          if (
            card(a.code).type_code !== "objective" &&
            !card(a.code).text?.includes("Permanent") &&
            attachmentController(s, host, a) === p
          )
            options.push({
              id: a.id,
              code: a.code,
              label: `${card(a.code).name} · ${name(host)}`,
              effects: [
                fx("nuhDiscardAttachment", {
                  target: host.id,
                  source: a.id,
                  player: p,
                }),
              ],
            });
      if (!options.length)
        log(
          s,
          `Wold of Rohan: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
      else if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Wold of Rohan${seatLabel(s, p)} · Discard a non-objective attachment you control`,
            options,
            card(N.wold).shadow,
          ),
        );
      return true;
    }
    case "nuhDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `Wold of Rohan: ${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
    case "nuhEnchantedShadow": {
      const enemy = get(s, e.target);
      const options: Option[] = [
        {
          id: "pursuit",
          label: "Increase the pursuit value by 1",
          effects: [pursuit(1, "Enchanted Land", p)],
        },
      ];
      if (enemy)
        options.push({
          id: "no-damage",
          code: enemy.code,
          label: `${name(enemy)} cannot take damage until the end of the round`,
          effects: [fx("nuhNoDamage", { target: enemy.id, player: p })],
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Enchanted Land${seatLabel(s, p)} · +1 pursuit, or the attacking enemy cannot take damage this round`,
            options,
            card(N.enchanted).shadow,
          ),
        );
      return true;
    }
    case "nuhNoDamage":
      if (u) noDamage(s, u, "Enchanted Land");
      return true;
    case "nuhDraughtShadow": {
      const view = seatView(s, p);
      const targets = [...view.heroes, ...view.allies].filter(
        (x) => (isHero(x) || isAlly(x)) && !x.exhausted,
      );
      if (!targets.length) {
        log(
          s,
          `Orc-draught: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      if (targets.length === 1) {
        prepend(s, fx("exhaust", { target: targets[0].id, player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Orc-draught${seatLabel(s, p)} · Exhaust a character you control`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("exhaust", { target: x.id, player: p })],
          })),
          card(N.draught).shadow,
        ),
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_URUK_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: ukStageRevealed,
  attackFinished: ukAttackFinished,
  damageAmount: ukDamageAmount,
  abilityLabel: ukAbilityLabel,
  abilityProblem: ukAbilityProblem,
  ability: ukAbility,
  whenRevealedCancelled: ukCancelled,
  shadowCancelled: ukCancelled,
  explored: ukExplored,
  travelEffects: ukTravelEffects,
  encounter: ukEncounter,
  shadow: ukShadow,
  effect: nightmareUrukEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareUruk(s: GameState) {
  const q = s.nightmare;
  if (q?.urukMauhur === undefined && q?.urukNoDamage === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    ukLive(s) &&
    (q.urukMauhur === undefined ||
      (!!q.urukMauhur &&
        typeof q.urukMauhur.id === "string" &&
        q.urukMauhur.code === N.mauhur &&
        s.stage === 1)) &&
    (q.urukNoDamage === undefined ||
      (Array.isArray(q.urukNoDamage) &&
        q.urukNoDamage.every(
          (m) => !!m && typeof m.enemy === "string" && round(m.round),
        )))
  );
}
