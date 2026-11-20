/**
 * The Road to Isengard's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (Ent of Fangorn is removed from the game when it leaves play) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/road-isengard.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario's Wizardry (its list of locations with a
 * Wizardry effect includes the Nightmare Deck's, so they trigger when
 * explored, through Machines of Isengard and through Saruman's and Wolf of
 * Isengard's shadow cards) and its archery total (Orthanc Archer's printed
 * Archery) serve the Nightmare cards. Effects use the "nri" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  stats,
  threatOf,
} from "./core";
import {
  destroy,
  discardHandCard,
  enemyAddedToStaging,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { engagedEnemies } from "./considered-engagement";
import {
  RI,
  ROAD_ISENGARD_SCENARIO,
  roadIsengardSaruman,
} from "./road-isengard-support";
import { NIGHTMARE_TOS as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

export interface NightmareIsengardState {
  /** Daunting Power: the round in which characters cannot be declared as attackers. */
  isengardDaunting?: number;
  /** Daunting Power's shadow: characters that cannot ready until the end of the round. */
  isengardNoReady?: { id: string; round: number }[];
}

const riLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === ROAD_ISENGARD_SCENARIO &&
  !!s.roadIsengard;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isOrcEnemy = (u: Unit) => isEnemy(u) && traitOf(u.code, "Orc");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
/** A discarded player card's printed cost (an X or a dash counts as 0). */
const printedCost = (code: string) => {
  const n = Number(card(code).cost);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Resolve a lone option directly; let the player choose between two. */
function either(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  text?: string,
) {
  if (!options.length) return;
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () =>
    choose(s, `${title}${seatLabel(s, p)} · Choose one`, options, text),
  );
}
/** "Discard 1 random card from your hand": an option only with a card in hand. */
const discardOption = (s: GameState, p: number, code: string): Option[] =>
  seatView(s, p).hand.length
    ? [
        {
          id: "discard",
          label: "Discard 1 random card from your hand",
          effects: [fx("nriRandomDiscard", { code, player: p })],
        },
      ]
    : [];

// ------------------------------------------------------------- the cards

/** The setup card: "Forced: When Ent of Fangorn leaves play, remove it from the game." */
function riCheck(s: GameState) {
  if (!riLive(s)) return;
  const n = s.encounterDiscard.filter((c) => c === RI.ent).length;
  if (!n) return;
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== RI.ent);
  (s.removedEncounter ??= []).push(...Array<string>(n).fill(RI.ent));
  log(
    s,
    `The Road to Isengard's Nightmare setup card: Ent of Fangorn left play, so ${n === 1 ? "it is" : `all ${n} are`} removed from the game.`,
    "danger",
  );
}
/** Fortress of Isengard (staged): "each Orc enemy gets +1 [threat], +1 [attack] and +1 [defense]." */
function riStats(s: GameState, u: Unit) {
  if (!riLive(s) || !isOrcEnemy(u)) return {};
  const n = staged(s, N.fortress).length;
  return n ? { attack: n, defense: n } : {};
}
const riThreatBonus = (s: GameState, u: Unit) =>
  riLive(s) && isOrcEnemy(u) ? staged(s, N.fortress).length : 0;
/** Poisonous Shaft (staged): "damaged characters cannot be readied by player card effects." */
const riCannotPlayerReadyCharacter = (s: GameState, u: Unit) =>
  riLive(s) && isCharacter(u) && u.damage > 0 && staged(s, N.shaft).length > 0;
/** Daunting Power: "Until the end of the round, characters cannot be declared as attackers." */
const riCannotAttack = (s: GameState) =>
  riLive(s) && s.nightmare?.isengardDaunting === s.round;
/** Daunting Power's shadow: "Until the end of the round, defending character cannot ready." */
const riCannotReady = (s: GameState, u: Unit) =>
  riLive(s) &&
  (s.nightmare?.isengardNoReady ?? []).some(
    (m) => m.id === u.id && m.round === s.round,
  );
/**
 * Half-orc of Isengard: "Forced: When Half-orc of Isengard attacks, either
 * discard 1 random card from your hand, or Half-orc of Isengard gets +3
 * [attack] for this attack."
 */
function riEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (!riLive(s) || !live(s, enemy, N.halfOrc)) return;
  if (s.combat?.enemyId !== enemy.id) return;
  prepend(s, fx("nriHalfOrc", { target: enemy.id, player }));
}
/** Half-orc of Isengard's shadow: "If this attack destroys a character, discard 1 random card from your hand." */
function riCharacterDestroyed(s: GameState, u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (
    !riLive(s) ||
    !c?.nmHandDiscardOnKill ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !isCharacter(u)
  )
    return;
  const copies = c.nmHandDiscardOnKill;
  c.nmHandDiscardOnKill = 0;
  const p = c.attackPlayer ?? firstPlayer(s);
  prepend(
    s,
    ...Array.from({ length: copies }, () =>
      fx("nriRandomDiscard", { code: N.halfOrc, player: p }),
    ),
  );
}

function riEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!riLive(s)) return false;
  const p = activeSeat(s);
  // Orthanc Archer: "Peril. When Revealed: Discard 1 random card from your
  // hand and assign X damage among characters you control. X is the
  // discarded card's printed cost."
  if (code === N.archer) {
    if (fromReveal) prepend(s, fx("nriArcher", { player: p }));
    return true;
  }
  if (![N.fumes, N.traitor, N.daunting].includes(code as never)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  switch (code) {
    // Fire and Foul Fumes: "When Revealed: Each player assigns X damage among
    // questing characters he controls, where X is the [threat] of the active
    // location. If there is no active location, Fire and Foul Fumes gains
    // surge."
    case N.fumes: {
      const [location] = allActiveLocations(s);
      if (!location) {
        log(
          s,
          "Fire and Foul Fumes: there is no active location, so it gains surge.",
          "danger",
        );
        prepend(
          s,
          fx("amonSurgeWindow", { code, player: p }),
          fx("reveal", { player: p }),
        );
        return true;
      }
      const x = threatOf(s, location);
      log(
        s,
        `Fire and Foul Fumes: each player assigns ${x} damage among questing characters they control (the [threat] of ${name(location)}).`,
        "danger",
      );
      if (x > 0)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("nriAssign", { value: x, code, flag: true, player }),
          ),
        );
      return true;
    }
    // Traitor of Many Colors: "Peril. Surge. When Revealed: If Saruman is in
    // play, he makes an immediate attack against you." (Its surge is the
    // printed keyword.)
    case N.traitor: {
      const saruman = roadIsengardSaruman(s);
      if (!saruman) {
        log(s, "Traitor of Many Colors: Saruman is not in play.");
        return true;
      }
      log(
        s,
        `Traitor of Many Colors: Saruman makes an immediate attack against ${who(s, p)}.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: saruman.id, player: p }));
      return true;
    }
    // Daunting Power: "When Revealed: Until the end of the round, characters
    // cannot be declared as attackers. If there are no engaged enemies,
    // raise each player's threat by 4."
    default: {
      (s.nightmare ??= {}).isengardDaunting = s.round;
      const engaged = playerOrder(s).some(
        (player) => engagedEnemies(s, player).length > 0,
      );
      log(
        s,
        `Daunting Power: until the end of the round, characters cannot be declared as attackers${engaged ? "" : "; no enemy is engaged, so each player raises their threat by 4"}.`,
        "danger",
      );
      if (!engaged)
        for (const player of playerOrder(s))
          forOwner(s, player, () => raiseThreat(s, 4, "encounter"));
      return true;
    }
  }
}

function riShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !riLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Half-orc of Isengard: "If this attack destroys a character, discard 1
    // random card from your hand."
    case N.halfOrc:
      c.nmHandDiscardOnKill = (c.nmHandDiscardOnKill ?? 0) + 1;
      log(
        s,
        "Half-orc of Isengard: if this attack destroys a character, the defending player discards 1 random card from their hand.",
        "danger",
      );
      return true;
    // Fire and Foul Fumes: "Assign X damage among characters you control. X
    // is the [threat] of the active location."
    case N.fumes: {
      const [location] = allActiveLocations(s);
      const x = location ? threatOf(s, location) : 0;
      log(
        s,
        location
          ? `Fire and Foul Fumes: the defending player assigns ${x} damage among characters they control (the [threat] of ${name(location)}).`
          : "Fire and Foul Fumes: there is no active location, so X is 0.",
        "danger",
      );
      if (x > 0) prepend(s, fx("nriAssign", { value: x, code, player: p }));
      return true;
    }
    // Traitor of Many Colors: "Either discard 1 random card from your hand,
    // or attacking enemy makes an additional attack against you after this
    // one."
    case N.traitor:
      either(
        s,
        p,
        "Traitor of Many Colors",
        [
          ...discardOption(s, p, code),
          {
            id: "attack",
            label:
              "The attacking enemy makes an additional attack against you after this one",
            effects: [
              fx("nriExtraAttack", { target: c.enemyId, code, player: p }),
            ],
          },
        ],
        card(code).shadow,
      );
      return true;
    // Daunting Power: "Until the end of the round, defending character
    // cannot ready."
    case N.daunting: {
      const ids = c.defenderIds?.length
        ? c.defenderIds
        : c.defenderId
          ? [c.defenderId]
          : [];
      const q = (s.nightmare ??= {});
      q.isengardNoReady = [
        ...(q.isengardNoReady ?? []).filter((m) => m.round === s.round),
        ...ids.map((id) => ({ id, round: s.round })),
      ];
      log(
        s,
        ids.length
          ? `Daunting Power: ${ids.map((id) => name(get(s, id)!)).join(", ")} cannot ready until the end of the round.`
          : "Daunting Power: the attack is undefended.",
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareIsengardEffect(s: GameState, e: Effect): boolean {
  // Poisonous Shaft's and Fortress of Isengard's Wizardry, through the
  // scenario's trigger: explored, Machines of Isengard, or a shadow card
  // dealt to Saruman ("as if he is the only player in the game").
  if (
    e.kind === "riWizardry" &&
    riLive(s) &&
    (e.code === N.shaft || e.code === N.fortress)
  ) {
    const solo = !!e.flag;
    const p = e.player ?? firstPlayer(s);
    const label = card(e.code).name;
    log(
      s,
      solo
        ? `Saruman is dealt ${label}: ${who(s, p)} ${verb(s, "resolve")} its Wizardry effect as if ${s.table ? "they were" : "you were"} the only player in the game.`
        : `${label}'s Wizardry effect is triggered.`,
      "danger",
    );
    if (e.code === N.shaft)
      prepend(
        s,
        ...(solo ? [p] : playerOrder(s)).map((player) =>
          fx("nriShaft", { player }),
        ),
      );
    else prepend(s, fx("nriFortress", { player: p }));
    return true;
  }
  if (!e.kind.startsWith("nri")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nriArcher":
      forOwner(s, p, () => {
        if (!s.hand.length) {
          log(
            s,
            `Orthanc Archer: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand, so X is 0.`,
          );
          return;
        }
        const h = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, h.id, { encounterEffect: true });
        if (s.hand.some((x) => x.id === h.id)) return;
        const x = printedCost(h.code);
        log(
          s,
          `Orthanc Archer: ${name(h)} is discarded at random${seatLabel(s, p)}; ${who(s, p)} ${verb(s, "assign")} ${x} damage among characters ${s.table ? "they control" : "you control"}.`,
          "danger",
        );
        if (x > 0)
          prepend(s, fx("nriAssign", { value: x, code: N.archer, player: p }));
      });
      return true;
    case "nriAssign": {
      const remaining = e.value ?? 0;
      const questing = !!e.flag;
      const view = seatView(s, p);
      const targets = [...view.heroes, ...view.allies].filter(
        (x) =>
          isCharacter(x) &&
          (!questing || x.committed) &&
          x.damage < stats(s, x).health,
      );
      if (remaining <= 0 || !targets.length) return true;
      const deal = (x: Unit) => [
        fx("damage", { target: x.id, value: 1, player: p }),
        fx("nriAssign", {
          value: remaining - 1,
          code: e.code,
          flag: e.flag,
          player: p,
        }),
      ];
      if (targets.length === 1) {
        prepend(s, ...deal(targets[0]));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name}${seatLabel(s, p)} · Assign damage · ${remaining} remaining`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: deal(x),
          })),
          questing
            ? "Assign X damage among questing characters you control, where X is the [threat] of the active location."
            : e.code === N.archer
              ? "Assign X damage among characters you control. X is the discarded card's printed cost."
              : "Assign X damage among characters you control. X is the [threat] of the active location.",
        ),
      );
      return true;
    }
    case "nriRandomDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const h = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `${card(e.code!).name}: ${name(h)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, h.id, { encounterEffect: true });
      });
      return true;
    case "nriHalfOrc":
      either(
        s,
        p,
        "Half-orc of Isengard",
        [
          ...discardOption(s, p, N.halfOrc),
          ...(s.combat?.enemyId === e.target
            ? [
                {
                  id: "attack",
                  label:
                    "Half-orc of Isengard gets +3 [attack] for this attack",
                  effects: [
                    fx("nriHalfOrcAttack", { target: e.target, player: p }),
                  ],
                },
              ]
            : []),
        ],
        card(N.halfOrc).text,
      );
      return true;
    case "nriHalfOrcAttack":
      if (s.combat && s.combat.enemyId === e.target) {
        s.combat.attackBonus += 3;
        log(
          s,
          "Half-orc of Isengard gets +3 [attack] for this attack.",
          "danger",
        );
      }
      return true;
    case "nriExtraAttack":
      if (s.combat && s.combat.enemyId === e.target) {
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
        log(
          s,
          `${card(e.code!).name}: the attacking enemy makes an additional attack after this one.`,
          "danger",
        );
      }
      return true;
    case "nriShaft": {
      const view = seatView(s, p);
      const damaged = [...view.heroes, ...view.allies].filter(
        (x) => isCharacter(x) && x.damage > 0,
      );
      if (!damaged.length) {
        log(
          s,
          `Poisonous Shaft: ${who(s, p)} control${s.table ? "s" : ""} no damaged character.`,
        );
        return true;
      }
      const drop = (x: Unit) =>
        fx("nriShaftDiscard", { target: x.id, player: p });
      if (damaged.length === 1) {
        prepend(s, drop(damaged[0]));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Poisonous Shaft${seatLabel(s, p)} · Discard a damaged character you control`,
          damaged.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: [drop(x)],
          })),
          "Wizardry: Each player discards a damaged character he controls.",
        ),
      );
      return true;
    }
    case "nriShaftDiscard":
      if (u && isCharacter(u))
        forOwner(s, p, () => {
          log(s, `Poisonous Shaft: ${name(u)} is discarded.`, "danger");
          destroy(s, u, false, "discard", false);
        });
      return true;
    case "nriFortress": {
      let i = s.encounterDiscard.length - 1;
      while (i >= 0 && card(s.encounterDiscard[i]).type_code !== "enemy") i--;
      if (i < 0) {
        log(
          s,
          "Fortress of Isengard: there is no enemy in the encounter discard pile.",
        );
        return true;
      }
      const x = make(s, s.encounterDiscard.splice(i, 1)[0]);
      s.staging.push(x);
      enemyAddedToStaging(s, x);
      log(
        s,
        `Fortress of Isengard: ${name(x)}, the topmost enemy in the encounter discard pile, returns to the staging area.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_ISENGARD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  check: riCheck,
  stats: riStats,
  threatBonus: riThreatBonus,
  cannotPlayerReadyCharacter: riCannotPlayerReadyCharacter,
  cannotAttack: riCannotAttack,
  cannotReady: riCannotReady,
  enemyAttackStarted: riEnemyAttackStarted,
  characterDestroyed: riCharacterDestroyed,
  encounter: riEncounter,
  shadow: riShadow,
  effect: nightmareIsengardEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareIsengard(s: GameState) {
  const q = s.nightmare;
  if (q?.isengardDaunting === undefined && q?.isengardNoReady === undefined)
    return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    riLive(s) &&
    (q.isengardDaunting === undefined || round(q.isengardDaunting)) &&
    (q.isengardNoReady === undefined ||
      (Array.isArray(q.isengardNoReady) &&
        q.isengardNoReady.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        )))
  );
}
