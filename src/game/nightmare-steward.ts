/**
 * The Steward's Fear's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (False Accusations in the underworld deck, the hidden Plot chosen
 * among 5, a destroyed enemy shuffled into the underworld deck before stage 3,
 * a Clue in the staging area shuffled back at the beginning of the refresh
 * phase) and its Nightmare encounter cards, composed with the scenario's own
 * rules (src/game/steward-fear.ts) through batch4Scenario while a Nightmare
 * mode game is played. Effects use the "nst" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, shuffle } from "./core";
import {
  engage,
  exhaustCharacter,
  placeEncounter,
  raiseThreat,
  revealed,
} from "./board";
import {
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { engagementCost } from "./core";
import { engagementCheckThreat } from "./threat-read";
import { STEWARD_CLUES } from "./steward-fear-support";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareStewardState {
  /** Assassination: the hero it is attached to. */
  assassinated?: string;
  /** Faithless Conspirator's and False Accusations' attacks: the attacking enemies returned to the staging area afterwards (with engagement checks for False Accusations). */
  returns?: { enemyId: string; checks: boolean }[];
}

const stLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-stewards-fear";
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const plot = (code: string) => traitOf(code, "Plot");
const sf = (s: GameState) => s.stewardFear;
/** The hero Assassination is attached to, while it is. */
export function nightmareStewardAssassinated(s: GameState): Unit | undefined {
  const id = stLive(s) ? s.nightmare?.assassinated : undefined;
  return id
    ? allHeroes(s).find(
        (h) =>
          h.id === id && h.attachments.some((a) => a.code === N.assassination),
      )
    : undefined;
}
const champions = (u: Unit) =>
  u.attachments.filter((a) => a.code === N.champion && !a.blanked).length;

// ------------------------------------------------------------- the setup card

/** "Forced: After an enemy is destroyed, shuffle it into the underworld deck if you are not at stage 3." */
function stEnemyDestination(s: GameState, u: Unit, destruction: boolean) {
  const q = sf(s);
  if (!stLive(s) || !q || !destruction || s.stage >= 3 || !isEnemy(u))
    return false;
  q.underworldDeck = shuffle(s, [...q.underworldDeck, u.code]);
  log(
    s,
    `The Steward's Fear · Nightmare: ${name(u)} is shuffled into the underworld deck.`,
  );
  return true;
}
/** "Forced: At the beginning of the refresh phase, if there is a Clue card in the staging area, shuffle it back into the underworld deck." */
function stRefreshStart(s: GameState): Effect[] {
  const q = sf(s);
  if (!stLive(s) || !q) return [];
  const clues = s.staging.filter((u) => STEWARD_CLUES.includes(u.code));
  if (!clues.length) return [];
  s.staging = s.staging.filter((u) => !clues.includes(u));
  q.underworldDeck = shuffle(s, [
    ...q.underworldDeck,
    ...clues.map((u) => u.code),
  ]);
  log(
    s,
    `The Steward's Fear · Nightmare: ${clues.map((u) => name(u)).join(", ")} ${clues.length === 1 ? "is" : "are"} shuffled back into the underworld deck.`,
  );
  return [];
}

// ------------------------------------------------------------- the cards

/**
 * Assassination: "Each enemy gets +1 [attack]." The Cabal's Champion:
 * "Attached enemy gets +1 [threat], +1 [attack], +1 [defense], and +2 hit
 * points."
 */
function stStats(s: GameState, u: Unit) {
  if (!stLive(s) || !isEnemy(u)) return {};
  const n = champions(u);
  return {
    attack: (nightmareStewardAssassinated(s) ? 1 : 0) + n,
    defense: n,
    health: 2 * n,
  };
}
/** Rise to Power: "contributes X [threat] to the staging area during the quest phase, where X is the number of resources on it." The Cabal's Champion: +1 [threat]. */
function stThreatBonus(s: GameState, u: Unit) {
  if (!stLive(s)) return 0;
  if (live(s, u, N.rise))
    return s.phase === "quest" || s.phase === "staging" ? u.resources : 0;
  return isEnemy(u) ? champions(u) : 0;
}
/** Assassination: "Attached hero cannot be healed." */
const stCannotHeal = (s: GameState, u: Unit) =>
  nightmareStewardAssassinated(s)?.id === u.id;
/** Assassination: "Damage from undefended attacks ... must be assigned to attached hero." */
function stEnemyAttackStarted(s: GameState, _enemy: Unit, player: number) {
  const h = nightmareStewardAssassinated(s);
  if (h && s.combat && ownerOf(s, h) === player)
    s.combat.undefendedTargetId = h.id;
}
/** Faithless Conspirator: "If the active location has at least 1 facedown card underneath it, Faithless Conspirator cannot take damage." */
function stDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  const a = s.activeLocation;
  if (
    !stLive(s) ||
    amount <= 0 ||
    !live(s, u, N.conspirator) ||
    !a ||
    !(sf(s)?.underneath[a.id]?.length ?? 0)
  )
    return amount;
  log(
    s,
    `Faithless Conspirator cannot take damage while ${name(a)} has a facedown card underneath it.`,
  );
  return 0;
}
/** Murderous Turncoat: "Forced: At the end of the combat phase, place Murderous Turncoat facedown underneath the active location if you are not at stage 3." */
function stCombatEnd(s: GameState) {
  const q = sf(s),
    a = s.activeLocation;
  if (!stLive(s) || !q || !a || s.stage >= 3) return;
  const turncoats = enemiesInPlay(s).filter((u) => live(s, u, N.turncoat));
  for (const u of turncoats) {
    s.staging = s.staging.filter((x) => x.id !== u.id);
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
    s.encounterDiscard.push(...u.shadows);
    for (const at of u.attachments)
      if (card(at.code).type_code !== "attachment")
        s.encounterDiscard.push(at.code);
    q.underneath[a.id] = [...(q.underneath[a.id] ?? []), u.code];
  }
  if (turncoats.length)
    log(
      s,
      `Murderous Turncoat: ${turncoats.length} placed facedown underneath ${name(a)}.`,
      "danger",
    );
}
/** Rath Celerdain: "Forced: At the beginning of the encounter phase, reveal the top card of the underworld deck. If it is an objective, discard it." */
function stEncounterBegin(s: GameState) {
  if (!stLive(s)) return;
  const rath = s.staging.filter((l) => live(s, l, N.rath));
  if (rath.length)
    prepend(
      s,
      ...rath.map((l) =>
        fx("nstRath", { target: l.id, player: firstPlayer(s) }),
      ),
    );
}
/**
 * Traitors' Den: "Forced: At the end of the round, place 1 resource token on
 * Traitors' Den. Then, if it has 4 or more resource tokens on it, remove all
 * tokens from it and reveal at random one of the Plot cards removed from the
 * game during setup." Rise to Power: "Forced: At the end of the round, place
 * 2 resources on Rise to Power."
 */
function stRoundEnd(s: GameState): Effect[] {
  if (!stLive(s)) return [];
  for (const u of s.staging.filter((x) => live(s, x, N.rise))) u.resources += 2;
  return [...s.staging, ...allActiveLocations(s)]
    .filter((l) => live(s, l, N.den))
    .map((l) => fx("nstDen", { target: l.id, player: firstPlayer(s) }));
}
/** Arched Tunnel: "Travel: Reveal all facedown cards underneath Arched Tunnel, one at a time. Then, place the top card of the underworld deck facedown underneath Arched Tunnel, if able." */
const stTravelEffects = (s: GameState, u: Unit) =>
  stLive(s) && live(s, u, N.tunnel)
    ? [fx("nstTunnel", { target: u.id, player: firstPlayer(s) })]
    : undefined;
/** Assassination's "When Revealed" as it enters the staging area (from the hidden Plot, Traitors' Den or any reveal). */
function stCardEntered(
  s: GameState,
  u: Unit,
  _fromReveal: boolean,
  cancelled: boolean,
) {
  if (!stLive(s) || cancelled || !live(s, u, N.assassination)) return;
  prepend(s, fx("nstAssassinate", { target: u.id, player: firstPlayer(s) }));
}
/** The Cabal's Champion: "If The Cabal's Champion is unattached and in the staging area, attach it to a Villain enemy, if able." Assassination: "If attached hero leaves play, the players lose the game." */
function stCheck(s: GameState) {
  if (!stLive(s) || s.status !== "playing") return;
  const villain = enemiesInPlay(s).find(
    (u) => !u.blanked && traitOf(u.code, "Villain"),
  );
  if (villain)
    for (const c of s.staging.filter((u) => live(s, u, N.champion))) {
      s.staging = s.staging.filter((x) => x.id !== c.id);
      villain.attachments.push({
        id: c.id,
        code: c.code,
        exhausted: false,
      } as Attachment);
      log(s, `The Cabal's Champion attaches to ${name(villain)}.`, "danger");
    }
  const id = s.nightmare?.assassinated;
  if (!id) return;
  const hero = allHeroes(s).find((h) => h.id === id);
  if (!hero) {
    s.status = "lost";
    s.reason =
      "Assassination: the hero it was attached to left play. The players lose.";
    s.queue = [];
    s.choice = null;
    log(s, s.reason, "danger");
  } else if (!hero.attachments.some((a) => a.code === N.assassination))
    delete s.nightmare!.assassinated;
}

function stEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!stLive(s)) return false;
  // Murderous Turncoat: "When Revealed: Murderous Turncoat makes an
  // immediate attack against the first player."
  if (code === N.turncoat) {
    const fresh = [...s.staging].reverse().find((u) => u.code === code);
    if (fromReveal && fresh)
      prepend(
        s,
        fx("immediateAttack", { target: fresh.id, player: firstPlayer(s) }),
      );
    return true;
  }
  if (code !== N.accusations) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  // False Accusations: "When Revealed: Each player must either raise his
  // threat by 5 or exhaust each ready character he controls."
  if (fromReveal)
    prepend(s, ...playerOrder(s).map((player) => fx("nstAccuse", { player })));
  return true;
}

function stShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !stLive(s)) return false;
  // Faithless Conspirator: "Return attacking enemy to the staging area after
  // this attack." False Accusations: "After this attack, return attacking
  // enemy to the staging area. Then, it makes engagement checks against each
  // player."
  if (code !== N.conspirator && code !== N.accusations) return false;
  const q = (s.nightmare ??= {});
  q.returns = [
    ...(q.returns ?? []),
    { enemyId: c.enemyId, checks: code === N.accusations },
  ];
  return true;
}
function stAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  const mine = (q?.returns ?? []).filter((r) => r.enemyId === combat.enemyId);
  if (!mine.length) return [];
  q!.returns = q!.returns!.filter((r) => r.enemyId !== combat.enemyId);
  if (!q!.returns.length) delete q!.returns;
  return [
    fx("stewardReturnEnemy", { target: combat.enemyId }),
    ...(mine.some((r) => r.checks)
      ? [fx("nstChecks", { target: combat.enemyId })]
      : []),
  ];
}

// ------------------------------------------------------------- effects

export function nightmareStewardEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nst")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  const q = sf(s);
  switch (e.kind) {
    case "nstRath": {
      const code = q?.underworldDeck.shift();
      if (!code) return true;
      if (card(code).type_code === "objective") {
        s.encounterDiscard.push(code);
        log(
          s,
          `Rath Celerdain reveals ${card(code).name} from the underworld deck: an objective, discarded.`,
          "danger",
        );
      } else {
        log(
          s,
          `Rath Celerdain reveals ${card(code).name} from the underworld deck.`,
          "danger",
        );
        revealed(s, code, undefined, "underworld");
      }
      return true;
    }
    case "nstDen": {
      if (!u || !q) return true;
      u.resources += 1;
      if (u.resources < 4) return true;
      u.resources = 0;
      const plots = q.removedHidden.filter(plot);
      if (!plots.length) {
        log(s, "Traitors' Den · No removed Plot card is left to reveal.");
        return true;
      }
      const [pick] = shuffle(s, [...plots]);
      q.removedHidden.splice(q.removedHidden.indexOf(pick), 1);
      log(
        s,
        `Traitors' Den reveals ${card(pick).name}, a Plot removed during setup, and adds it to the staging area.`,
        "danger",
      );
      placeEncounter(s, pick);
      return true;
    }
    case "nstTunnel": {
      if (!u || !q) return true;
      const hidden = q.underneath[u.id] ?? [];
      delete q.underneath[u.id];
      q.pendingUnderworld.unshift(...hidden);
      prepend(
        s,
        ...(hidden.length
          ? [
              fx("stewardUnderworldNext", {
                count: hidden.length,
                player: firstPlayer(s),
              }),
            ]
          : []),
        fx("nstTunnelPlace", { target: u.id }),
      );
      log(
        s,
        `Arched Tunnel: ${hidden.length} facedown ${hidden.length === 1 ? "card is" : "cards are"} revealed.`,
      );
      return true;
    }
    case "nstTunnelPlace": {
      if (!u || !q || !q.underworldDeck.length) return true;
      q.underneath[u.id] = [
        ...(q.underneath[u.id] ?? []),
        q.underworldDeck.shift()!,
      ];
      log(
        s,
        "Arched Tunnel: the top card of the underworld deck is placed facedown underneath it.",
      );
      return true;
    }
    case "nstAssassinate": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      const heroes = allHeroes(s);
      if (!heroes.length) return true;
      const max = Math.max(...heroes.map((h) => card(h.code).threat ?? 0));
      const top = heroes.filter((h) => (card(h.code).threat ?? 0) === max);
      if (top.length === 1) {
        prepend(s, fx("nstAttach", { target: u.id, source: top[0].id }));
        return true;
      }
      choose(
        s,
        `Assassination · Attach it to a hero with threat cost ${max}${seatLabel(s, p)}`,
        top.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("nstAttach", { target: u.id, source: h.id })],
        })),
        card(N.assassination).text,
      );
      return true;
    }
    case "nstAttach": {
      const hero = get(s, e.source);
      if (!u || !hero) return true;
      s.staging = s.staging.filter((x) => x.id !== u.id);
      hero.attachments.push({
        id: u.id,
        code: u.code,
        exhausted: false,
      } as Attachment);
      (s.nightmare ??= {}).assassinated = hero.id;
      log(
        s,
        `Assassination attaches to ${name(hero)}: if that hero leaves play, the players lose.`,
        "danger",
      );
      return true;
    }
    case "nstAccuse": {
      const ready = [...s.heroes, ...s.allies].filter((c) => !c.exhausted);
      choose(
        s,
        `False Accusations · Raise your threat by 5 or exhaust each ready character${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            code: N.accusations,
            label: "Raise your threat by 5",
            effects: [fx("nstAccuseThreat", { player: p })],
          },
          {
            id: "exhaust",
            code: N.accusations,
            label: `Exhaust each ready character you control (${ready.length})`,
            effects: [fx("nstAccuseExhaust", { player: p })],
          },
        ],
        card(N.accusations).text,
      );
      return true;
    }
    case "nstAccuseThreat":
      raiseThreat(s, 5, "encounter");
      log(s, `False Accusations: threat +5${seatLabel(s, p)}.`, "danger");
      return true;
    case "nstAccuseExhaust": {
      const ready = [...s.heroes, ...s.allies].filter((c) => !c.exhausted);
      for (const c of ready) exhaustCharacter(s, c);
      log(
        s,
        `False Accusations: each ready character exhausts${seatLabel(s, p)} (${ready.length}).`,
        "danger",
      );
      return true;
    }
    case "nstChecks": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      for (const player of playerOrder(s))
        if (engagementCheckThreat(s, player) >= engagementCost(s, u)) {
          forOwner(s, player, () => engage(s, u));
          log(
            s,
            `False Accusations: ${name(u)} makes engagement checks and engages${seatLabel(s, player) || " you"}.`,
            "danger",
          );
          return true;
        }
      log(
        s,
        `False Accusations: ${name(u)} makes engagement checks and stays.`,
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nstAccuse",
  "nstAccuseThreat",
  "nstAccuseExhaust",
]);
export const NIGHTMARE_STEWARD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  enemyDestination: stEnemyDestination,
  refreshStart: stRefreshStart,
  stats: stStats,
  threatBonus: stThreatBonus,
  cannotHeal: stCannotHeal,
  enemyAttackStarted: stEnemyAttackStarted,
  damageAmount: stDamageAmount,
  combatEnd: stCombatEnd,
  encounterBegin: stEncounterBegin,
  roundEnd: stRoundEnd,
  travelEffects: stTravelEffects,
  cardEntered: stCardEntered,
  check: stCheck,
  encounter: stEncounter,
  shadow: stShadow,
  attackFinished: stAttackFinished,
  effect: nightmareStewardEffect,
  sharedEffect: (e) => e.kind.startsWith("nst") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareSteward(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    (q.assassinated === undefined || typeof q.assassinated === "string") &&
    (q.returns === undefined ||
      (Array.isArray(q.returns) &&
        q.returns.every(
          (r) =>
            !!r &&
            typeof r.enemyId === "string" &&
            typeof r.checks === "boolean",
        )))
  );
}
