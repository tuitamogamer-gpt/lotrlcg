/**
 * To Catch an Orc's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (each player shuffles a Vigilant Orc into their out-of-play deck;
 * both Mugash's Rage and the other Vigilant Orcs wait set aside, and Mugash's
 * Rage joins the encounter deck as the players advance to stage 3A) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/catch-orc.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's out-of-play decks, searches, set-aside cards,
 * time counters and capture serve the Nightmare cards. Effects use the "ncc"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import { damage, engage, enemyAddedToStaging, exhaustCharacter } from "./board";
import {
  activeSeat,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { attachToQuest, currentQuestCode, mainQuestUnit } from "./quest-state";
import { canRemoveQuestTime } from "./quest-time";
import { surgeEffects } from "./surge";
import { NIGHTMARE_VOI as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { CATCH_ORC as C } from "./catch-orc-support";

export interface NightmareCatchState {
  /** Both copies of Mugash's Rage, set aside until the players advance to stage 3A. */
  catchRageAside?: number;
  /** Mugash's Cunning's shadow: +3 [attack] and +3 [defense] until the end of the round. */
  catchCunning?: { enemy: string; round: number }[];
  /** Mugash's Rage's shadow: no damage until the end of the round. */
  catchRage?: { enemy: string; round: number }[];
}

const ccLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "to-catch-an-orc";
const isOrcEnemy = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Orc");
const carrier = (s: GameState) =>
  allHeroes(s).find((h) => h.attachments.some((a) => a.code === C.mugash));
/** Patrolling Orcs, attached to the current quest (a Condition attachment). */
const patrols = (s: GameState) =>
  (mainQuestUnit(s)?.attachments ?? []).filter(
    (a) => a.code === N.patrolling && !a.blanked,
  );
const ready = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => !u.exhausted,
  );
const roundEffects = (
  list: { enemy: string; round: number }[] | undefined,
  s: GameState,
  u: Unit,
) => (list ?? []).filter((r) => r.enemy === u.id && r.round === s.round).length;
const exhaustOptions = (s: GameState, p: number): Option[] =>
  ready(s, p).map((c) => ({
    id: c.id,
    code: c.code,
    label: `Exhaust ${name(c)}`,
    effects: [fx("nccExhaust", { target: c.id, player: p })],
  }));

// ------------------------------------------------------------- the setup card

/** "Setup: Each player shuffles 1 copy of Vigilant Orc into his out-of-play deck. Set both copies of Mugash's Rage and any remaining copies of Vigilant Orc aside, out of play." */
const ccSetupFollowUp = (s: GameState): Effect[] =>
  ccLive(s) ? [fx("nccSetup", { player: firstPlayer(s) })] : [];
/** "Forced: When the players advance to stage 3A, shuffle both copies of Mugash's Rage into the encounter deck." */
function ccStageRevealed(s: GameState, stage: number) {
  const q = s.nightmare;
  if (!ccLive(s) || stage !== 3 || !q?.catchRageAside) return;
  s.encounterDeck.push(...Array<string>(q.catchRageAside).fill(N.rage));
  delete q.catchRageAside;
  shuffle(s, s.encounterDeck);
  log(
    s,
    "The Wizard's Prize · Nightmare: both copies of Mugash's Rage are shuffled into the encounter deck.",
    "danger",
  );
}

// ------------------------------------------------------------- the cards

/** Vigilant Orc: "Forced: After Vigilant Orc enters the staging area, it makes an immediate attack against the first player. If this attack destroys a character, remove 1 time counter from the current quest." */
function ccEnemyEntered(s: GameState, u: Unit) {
  if (!ccLive(s) || !live(s, u, N.vigilant)) return;
  log(
    s,
    "Vigilant Orc enters the staging area and attacks the first player.",
    "danger",
  );
  prepend(
    s,
    fx("immediateAttack", {
      target: u.id,
      player: firstPlayer(s),
      text: "time-on-kill",
    }),
  );
}
/** Guard Warg: "Forced: After the engaged player discards any number of cards from his out-of-play deck, Guard Warg makes an immediate attack." */
function ccOutOfPlayDiscarded(s: GameState, player: number, count: number) {
  if (!ccLive(s) || count <= 0) return;
  const wargs = seatView(s, player).engaged.filter((u) =>
    live(s, u, N.guardWarg),
  );
  if (!wargs.length) return;
  log(
    s,
    `Guard Warg: cards left the out-of-play deck${seatLabel(s, player)}; it attacks.`,
    "danger",
  );
  prepend(
    s,
    ...wargs.map((u) => fx("immediateAttack", { target: u.id, player })),
  );
}
/**
 * Methedras Lookout, in the staging area: "Forced: At the end of the refresh
 * phase, remove 1 time counter from the current quest." Each Lookout in the
 * staging area as the scenario's Time counter is removed triggers; one that
 * the expiry reveals has missed this timing point.
 */
const ccRefreshEndForced = (s: GameState): Effect[] =>
  ccLive(s)
    ? s.staging
        .filter((u) => live(s, u, N.lookout))
        .map(() => fx("removeQuestTime", { player: firstPlayer(s) }))
    : [];
/** "Until the end of the round" effects end. */
function ccRoundEnd(s: GameState): Effect[] {
  const q = s.nightmare;
  if (!ccLive(s) || !q) return [];
  if (q.catchCunning)
    q.catchCunning = q.catchCunning.filter((r) => r.round > s.round);
  if (q.catchRage) q.catchRage = q.catchRage.filter((r) => r.round > s.round);
  return [];
}
/** Methedras Peak: "X is the number of characters controlled by the first player." */
function ccThreatBonus(s: GameState, u: Unit) {
  if (!ccLive(s) || !live(s, u, N.peak)) return 0;
  const v = seatView(s, firstPlayer(s));
  return v.heroes.length + v.allies.length;
}
/**
 * Methedras Peak: "Forced: After Methedras Peak leaves play as an explored
 * location, each player searches 3." Orc Trail: "Forced: After Orc Trail
 * leaves play as an explored location, choose an out of play Orc enemy,
 * either set aside or in the victory display, and add it to the staging
 * area. Then, the first player searches 4."
 */
function ccExplored(s: GameState, u: Unit) {
  if (!ccLive(s)) return;
  if (live(s, u, N.peak))
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("catchSearch", { value: 3, player }),
      ),
    );
  if (live(s, u, N.trail))
    prepend(
      s,
      fx("nccTrail", { player: firstPlayer(s) }),
      fx("catchSearch", { value: 4, player: firstPlayer(s) }),
    );
}
/** Mugash's Cunning's shadow: +3 [attack] and +3 [defense] until the end of the round. */
function ccStats(s: GameState, u: Unit) {
  if (!ccLive(s)) return {};
  const n = roundEffects(s.nightmare?.catchCunning, s, u);
  return n ? { attack: 3 * n, defense: 3 * n } : {};
}
/** Mugash's Rage's shadow: "Attacking enemy cannot take damage until the end of the round." */
function ccDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!ccLive(s) || amount <= 0 || !roundEffects(s.nightmare?.catchRage, s, u))
    return amount;
  log(s, `${name(u)} cannot take damage this round (Mugash's Rage).`);
  return 0;
}
/** Patrolling Orcs, on the current quest: "Forced: After a player engages an enemy, he must either exhaust a character he controls, or remove 1 time counter from the current quest." */
function ccEngaged(s: GameState, u: Unit) {
  if (!ccLive(s) || card(u.code).type_code !== "enemy") return;
  const n = patrols(s).length;
  if (!n) return;
  const p = activeSeat(s);
  prepend(
    s,
    ...Array.from({ length: n }, () => fx("nccPatrol", { player: p })),
  );
}

function ccEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !ccLive(s) ||
    (code !== N.cunning && code !== N.patrolling && code !== N.rage)
  )
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.patrolling) {
    // "Attach to the current quest."
    const quest = currentQuestCode(s);
    if (
      quest &&
      attachToQuest(s, quest, { id: `a${s.nextId++}`, code, exhausted: false })
    )
      log(s, "Patrolling Orcs is attached to the current quest.", "danger");
    else s.encounterDiscard.push(code);
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.cunning) {
    // "Each player discards the top 3 cards of his out-of-play deck. Add
    // each enemy discarded this way to the staging area. If no enemies are
    // added to the staging area this way, Mugash's Cunning gains surge."
    prepend(
      s,
      fx("nccCunning", {
        ids: playerOrder(s).map(String),
        player: firstPlayer(s),
      }),
    );
    return true;
  }
  // Mugash's Rage: "If Mugash is attached to a hero, the player who
  // controls that hero unattaches Mugash and engages it. Then, Mugash makes
  // an immediate attack."
  const hero = carrier(s);
  if (!hero) {
    log(s, "Mugash's Rage: Mugash is not attached to a hero.");
    return true;
  }
  prepend(s, fx("nccRage", { target: hero.id, player: ownerOf(s, hero) }));
  return true;
}

function ccShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ccLive(s)) return false;
  const attacked = c.attackPlayer ?? firstPlayer(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (code) {
    // Methedras Lookout: "Either exhaust a character you control, or return
    // attacking enemy to the staging area."
    case N.lookout:
      prepend(s, fx("nccLookout", { player: attacked }));
      return true;
    // Guard Warg: "Deal 1 damage to the defending character."
    case N.guardWarg:
      for (const d of defenders) damage(s, d.id, 1);
      return true;
    // Mugash's Cunning: "Attacking enemy gets +3 [attack] and +3 [defense]
    // until the end of the round."
    case N.cunning: {
      const q = (s.nightmare ??= {});
      q.catchCunning = [
        ...(q.catchCunning ?? []),
        { enemy: c.enemyId, round: s.round },
      ];
      return true;
    }
    // Mugash's Rage: "Attacking enemy cannot take damage until the end of
    // the round."
    case N.rage: {
      const q = (s.nightmare ??= {});
      q.catchRage = [
        ...(q.catchRage ?? []),
        { enemy: c.enemyId, round: s.round },
      ];
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareCatchEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ncc")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nccSetup": {
      const q = s.catchOrc;
      if (!q) return true;
      s.encounterDeck = s.encounterDeck.filter(
        (c) => c !== N.vigilant && c !== N.rage,
      );
      const players = playerOrder(s);
      for (const player of players) {
        (q.decks[player] ??= []).push(make(s, N.vigilant));
        shuffle(s, q.decks[player]);
      }
      q.setAside.push(
        ...Array.from({ length: Math.max(0, 4 - players.length) }, () =>
          make(s, N.vigilant),
        ),
      );
      (s.nightmare ??= {}).catchRageAside = 2;
      log(
        s,
        "To Catch an Orc · Nightmare: each player shuffles a Vigilant Orc into their out-of-play deck; both copies of Mugash's Rage and the other Vigilant Orcs are set aside.",
      );
      return true;
    }
    case "nccCunning": {
      // Each player's top 3 cards are checked as that player discards them.
      const [next, ...rest] = (e.ids ?? []).map(Number);
      if (next === undefined) {
        if (!e.flag) {
          log(
            s,
            "Mugash's Cunning: no enemy is added to the staging area; it gains surge.",
            "danger",
          );
          prepend(s, ...surgeEffects(N.cunning));
        }
        return true;
      }
      const found =
        !!e.flag ||
        (s.catchOrc?.decks[next] ?? [])
          .slice(0, 3)
          .some((x) => card(x.code).type_code === "enemy");
      prepend(
        s,
        fx("catchDiscardTop", { value: 3, player: next }),
        fx("nccCunning", { ids: rest.map(String), flag: found, player: p }),
      );
      return true;
    }
    case "nccLookout": {
      const own = exhaustOptions(s, p);
      const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
      // An enemy attacking from the staging area cannot be returned there.
      const canReturn = !!enemy && allEngaged(s).some((x) => x.id === enemy.id);
      const back = fx("nccReturn", { player: p });
      if (!own.length) {
        if (canReturn) prepend(s, back);
        return true;
      }
      choose(
        s,
        `Methedras Lookout · Exhaust a character you control, or return the attacking enemy to the staging area${seatLabel(s, p)}`,
        [
          ...own,
          ...(canReturn
            ? [
                {
                  id: "return",
                  label: "Return the attacking enemy to the staging area",
                  effects: [back],
                },
              ]
            : []),
        ],
        card(N.lookout).shadow,
      );
      return true;
    }
    case "nccReturn":
      if (s.combat) {
        s.combat.returnToStaging = true;
        log(
          s,
          "Methedras Lookout: the attacking enemy returns to the staging area after this attack.",
        );
      }
      return true;
    case "nccExhaust":
      if (u) exhaustCharacter(s, u);
      return true;
    case "nccPatrol": {
      const options: Option[] = [
        ...exhaustOptions(s, p),
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
      if (!options.length) return true;
      choose(
        s,
        `Patrolling Orcs · Exhaust a character you control, or remove 1 time counter${seatLabel(s, p)}`,
        options,
        card(N.patrolling).text,
      );
      return true;
    }
    case "nccTrail": {
      const aside = (s.catchOrc?.setAside ?? []).filter((x) =>
        isOrcEnemy(x.code),
      );
      const display = [...new Set((s.victoryCards ?? []).filter(isOrcEnemy))];
      const options: Option[] = [
        ...aside.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · set aside`,
          effects: [fx("nccTrailTake", { target: x.id, text: "aside" })],
        })),
        ...display.map((code): Option => ({
          id: `victory-${code}`,
          code,
          label: `${card(code).name} · victory display`,
          effects: [fx("nccTrailTake", { code, text: "victory" })],
        })),
      ];
      if (!options.length) {
        log(s, "Orc Trail: no out-of-play Orc enemy can be chosen.");
        return true;
      }
      choose(
        s,
        "Orc Trail · Add an out-of-play Orc enemy to the staging area",
        options,
        card(N.trail).text,
      );
      return true;
    }
    case "nccTrailTake": {
      let enemy: Unit | undefined;
      if (e.text === "aside" && s.catchOrc) {
        const i = s.catchOrc.setAside.findIndex((x) => x.id === e.target);
        if (i >= 0) enemy = s.catchOrc.setAside.splice(i, 1)[0];
      } else if (e.text === "victory" && e.code) {
        const i = (s.victoryCards ?? []).indexOf(e.code);
        if (i >= 0) {
          s.victoryCards!.splice(i, 1);
          s.victory = Math.max(0, s.victory - (card(e.code).victory ?? 0));
          enemy = make(s, e.code);
        }
      }
      if (!enemy) return true;
      delete enemy.owner;
      s.staging.push(enemy);
      log(s, `Orc Trail adds ${name(enemy)} to the staging area.`, "danger");
      enemyAddedToStaging(s, enemy);
      return true;
    }
    case "nccRage": {
      const hero = u;
      const a = hero?.attachments.find((x) => x.code === C.mugash);
      if (!hero || !a) return true;
      hero.attachments = hero.attachments.filter((x) => x.id !== a.id);
      const mugash = make(s, C.mugash);
      mugash.id = a.id;
      forOwner(s, p, () => engage(s, mugash));
      if (!allEngaged(s).some((x) => x.id === mugash.id)) {
        // Mugash cannot engage that player: he enters the staging area.
        s.staging.push(mugash);
        enemyAddedToStaging(s, mugash);
        return true;
      }
      log(
        s,
        `Mugash's Rage: ${name(hero)} loses hold of Mugash, who engages${seatLabel(s, p)} and attacks.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: mugash.id, player: p }));
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_CATCH_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  setupFollowUp: ccSetupFollowUp,
  stageRevealed: ccStageRevealed,
  enemyEntered: ccEnemyEntered,
  outOfPlayDiscarded: ccOutOfPlayDiscarded,
  refreshEndForced: ccRefreshEndForced,
  roundEnd: ccRoundEnd,
  threatBonus: ccThreatBonus,
  explored: ccExplored,
  stats: ccStats,
  damageAmount: ccDamageAmount,
  engaged: ccEngaged,
  encounter: ccEncounter,
  shadow: ccShadow,
  effect: nightmareCatchEffect,
  sharedEffect: (e) =>
    ["nccSetup", "nccCunning", "nccTrail", "nccTrailTake"].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareCatch(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  const rounds = (list: unknown) =>
    Array.isArray(list) &&
    list.every((r) => !!r && typeof r.enemy === "string" && n(r.round));
  return (
    (q?.catchRageAside === undefined ||
      (n(q.catchRageAside) && q.catchRageAside <= 2)) &&
    (q?.catchCunning === undefined || rounds(q.catchCunning)) &&
    (q?.catchRage === undefined || rounds(q.catchRage))
  );
}
