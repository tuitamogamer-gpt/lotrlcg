/**
 * The Weather Hills' Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules and its Nightmare encounter cards, composed with the scenario's own
 * rules (src/game/weather-hills.ts) through batch4Scenario while a Nightmare
 * mode game is played. The scenario's Orc deck, Mission objective, Weather
 * cards and guarded encounters serve the Nightmare cards. Effects use the
 * "nwh" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, isGuarded, log, prepend } from "./core";
import { exhaustCharacter, revealed } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { WEATHER as W } from "./weather-hills-support";
import { NIGHTMARE_TLR as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  live,
  phaseKey,
  seatLabel,
  traitOf,
} from "./nightmare-core";

export interface NightmareWeatherState {
  /** Captive Villagers that have entered play (if one leaves play, the players lose). */
  weatherVillagers?: string[];
  /** Captive Villagers whose guard from the Orc deck is still being revealed. */
  weatherGuarding?: string[];
  /** Rain-washed Tracks: the threat added to the staging area for a phase. */
  weatherTracks?: { round: number; phase: string; value: number }[];
  /** Angmar Raider's shadow: an attacking enemy's defense until the end of the phase. */
  weatherRaider?: { enemy: string; round: number; phase: string }[];
}

const whLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-weather-hills";
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const activeOf = (s: GameState, code: string) =>
  allActiveLocations(s).filter((u) => live(s, u, code));
const mission = (s: GameState) => s.staging.find((u) => u.code === W.mission);
const isOrcEnemy = (code: string) =>
  card(code).type_code === "enemy" && traitOf(code, "Orc");
const ownCharacters = (s: GameState, p: number) =>
  allCharacters(s).filter(
    (u) =>
      (isHero(u) || isAlly(u) || card(u.code).type_code === "objective-ally") &&
      ownerOf(s, u) === p,
  );
/** The Captive Villagers in play: guarded in the staging area, or controlled. */
const villagers = (s: GameState) =>
  [...s.staging, ...allCharacters(s)].filter((u) => u.code === N.villager);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
}

// ------------------------------------------------------------- the cards

/**
 * Captive Villager: "Forced: After Captive Villager enters play, reveal the
 * top card of the Orc deck and attach it to Captive Villager, guarding it."
 */
function whCardEntered(s: GameState, u: Unit) {
  if (!whLive(s) || u.code !== N.villager) return;
  const q = (s.nightmare ??= {});
  q.weatherVillagers = [...new Set([...(q.weatherVillagers ?? []), u.id])];
  if (u.blanked) return;
  // Not free of encounters until its guard has been revealed.
  q.weatherGuarding = [...new Set([...(q.weatherGuarding ?? []), u.id])];
  prepend(s, fx("nwhGuard", { target: u.id, player: firstPlayer(s) }));
}
/**
 * Captive Villager: "While Captive Villager is free of encounters, the first
 * player gains control of it." The setup card: "If a Captive Villager leaves
 * play, the players lose the game."
 */
function whCheck(s: GameState) {
  if (!whLive(s) || s.status !== "playing") return;
  const inPlay = villagers(s);
  const gone = (s.nightmare?.weatherVillagers ?? []).find(
    (id) => !inPlay.some((u) => u.id === id),
  );
  if (gone) {
    lose(
      s,
      "A Captive Villager has left play. The Orcs have carried off the people of Bree-land.",
    );
    return;
  }
  const first = firstPlayer(s);
  const pending = s.nightmare?.weatherGuarding ?? [];
  for (const u of inPlay) {
    if (u.blanked || pending.includes(u.id)) continue;
    const isStaged = s.staging.some((x) => x.id === u.id);
    if (isStaged && isGuarded(s, u)) continue;
    if (!isStaged && ownerOf(s, u) === first) continue;
    if (isStaged) s.staging = s.staging.filter((x) => x.id !== u.id);
    else
      forOwner(s, ownerOf(s, u), () => {
        s.allies = s.allies.filter((x) => x.id !== u.id);
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
    u.committed = false;
    u.controller = first;
    forOwner(s, first, () => s.allies.push(u));
    log(
      s,
      `${name(u)} is free of encounters: ${who(s, first)} gain${s.table ? "s" : ""} control of it.`,
      "good",
    );
  }
}
/** The setup card: "The players cannot win the game while a Captive Villager is guarded by an encounter card." */
const whCannotWin = (s: GameState) =>
  whLive(s) &&
  s.staging.some(
    (u) =>
      u.code === N.villager &&
      (isGuarded(s, u) || (s.nightmare?.weatherGuarding ?? []).includes(u.id)),
  );
/** Rearguard Ambusher: "Forced: After Rearguard Ambusher engages you, exhaust each damaged character you control." */
function whEngaged(s: GameState, u: Unit) {
  if (whLive(s) && live(s, u, N.ambusher))
    prepend(s, fx("nwhAmbush", { code: u.code, player: activeSeat(s) }));
}
/** Rearguard Ambusher: "Cannot be optionally engaged." Track the Orcs: "Each enemy ... cannot be optionally engaged." */
const whCannotOptionallyEngage = (s: GameState, u: Unit) =>
  whLive(s) &&
  (live(s, u, N.ambusher) || (isEnemy(u) && staged(s, N.track).length > 0));
/** Track the Orcs: "Each enemy gets +10 engagement cost." */
const whEngagementBonus = (s: GameState, u: Unit) =>
  whLive(s) && isEnemy(u) ? 10 * staged(s, N.track).length : 0;
/** Angmar Raider: "Forced: After a character the engaged player controls is healed, Angmar Raider makes an immediate attack." */
function whHealed(s: GameState, u: Unit, amount: number) {
  if (!whLive(s) || amount <= 0) return;
  const p = ownerOf(s, u);
  const raiders = seatView(s, p).engaged.filter((x) => live(s, x, N.raider));
  if (raiders.length)
    log(
      s,
      `Angmar Raider: ${name(u)} is healed, and ${raiders.length === 1 ? "the engaged Angmar Raider attacks" : `${raiders.length} engaged Angmar Raiders attack`}${seatLabel(s, p)}.`,
      "danger",
    );
  prepend(
    s,
    ...raiders.map((x) => fx("immediateAttack", { target: x.id, player: p })),
  );
}
/** Ruined Watch-tower (active): "each enemy gets +3 [defense]." Angmar Raider's shadow: "+2 [defense] until the end of the phase." */
function whStats(s: GameState, u: Unit) {
  if (!whLive(s) || !isEnemy(u)) return {};
  const defense =
    3 * activeOf(s, N.tower).length +
    2 *
      (s.nightmare?.weatherRaider ?? []).filter(
        (r) =>
          r.enemy === u.id && r.round === s.round && r.phase === phaseKey(s),
      ).length;
  return defense ? { defense } : {};
}
/** Rain-washed Tracks: "add 8 to the total [threat] in the staging area this phase." */
const whStagingThreat = (s: GameState) =>
  whLive(s)
    ? (s.nightmare?.weatherTracks ?? [])
        .filter((t) => t.round === s.round && t.phase === phaseKey(s))
        .reduce((n, t) => n + t.value, 0)
    : 0;
/** Weather-torn Valley: "Progress cannot be placed on Weather-torn Valley while it is in the staging area." */
const whLocationProgressBlocked = (s: GameState, u: Unit) =>
  whLive(s) && live(s, u, N.valley) && s.staging.some((x) => x.id === u.id);
/** Weather-torn Valley (active): "Weather cards cannot be canceled." */
const whCannotCancel = (s: GameState, _shadow?: boolean, code?: string) =>
  whLive(s) &&
  !!code &&
  traitOf(code, "Weather") &&
  activeOf(s, N.valley).length > 0;
/** Ruined Watch-tower (staged): "Forced: When an Orc enemy is revealed, each player must deal 1 damage to a character he controls." */
function whRevealed(s: GameState, code: string) {
  if (!whLive(s) || !isOrcEnemy(code)) return;
  const towers = staged(s, N.tower);
  if (towers.length)
    log(
      s,
      `Ruined Watch-tower: ${card(code).name} is an Orc enemy; each player deals 1 damage to a character they control${towers.length > 1 ? `, for each of ${towers.length} Watch-towers` : ""}.`,
      "danger",
    );
  prepend(
    s,
    ...towers.flatMap(() =>
      playerOrder(s).map((player) =>
        fx("nwhHurt", { value: 1, code: N.tower, player }),
      ),
    ),
  );
}

function whEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!whLive(s) || ![N.tracks, N.track].includes(code as never)) return false;
  const p = firstPlayer(s);
  if (code === N.track) {
    // Track the Orcs: "When Revealed: Reveal the top card of the Orc deck
    // (reveal the top 2 cards instead if there are 3 or more players in the
    // game)."
    if (!fromReveal) return true;
    const count = (s.table?.seats.length ?? 1) >= 3 ? 2 : 1;
    log(
      s,
      `Track the Orcs: the top ${count === 1 ? "card" : "2 cards"} of the Orc deck ${count === 1 ? "is" : "are"} revealed.`,
      "danger",
    );
    prepend(s, fx("weatherRevealOrcs", { value: count, player: p }));
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Rain-washed Tracks: "Either remove 1 resource token from the Mission
  // objective, or add 8 to the total [threat] in the staging area this
  // phase."
  prepend(s, fx("nwhTracks", { player: p }));
  return true;
}

function whShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !whLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Angmar Raider: "Attacking enemy gets +2 [defense] until the end of the
    // phase."
    case N.raider: {
      const q = (s.nightmare ??= {});
      q.weatherRaider = [
        ...(q.weatherRaider ?? []).filter((r) => r.round === s.round),
        { enemy: c.enemyId, round: s.round, phase: phaseKey(s) },
      ];
      log(
        s,
        "Angmar Raider: the attacking enemy gets +2 [defense] until the end of the phase.",
        "danger",
      );
      return true;
    }
    // Rain-washed Tracks: "Either remove 1 resource token from the Mission
    // objective, or attacking enemy gets +3 [attack]."
    case N.tracks:
      prepend(s, fx("nwhTracksShadow", { player: p }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareWeatherEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nwh")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  const q = (s.nightmare ??= {});
  switch (e.kind) {
    case "nwhGuard": {
      // Captive Villager: "reveal the top card of the Orc deck and attach it
      // to Captive Villager, guarding it." The villager stays unfree until
      // its guard is placed (the guard's own revelation effects follow).
      prepend(s, fx("nwhGuardDone", { target: e.target, player: p }));
      const code = u && s.weatherHills?.orcDeck.shift();
      if (!u || !code) {
        if (u) log(s, `${name(u)}: the Orc deck is empty; nothing guards it.`);
        return true;
      }
      log(
        s,
        `${name(u)}: ${card(code).name} is revealed from the Orc deck to guard it.`,
        "danger",
      );
      revealed(s, code, u.id);
      return true;
    }
    case "nwhGuardDone":
      q.weatherGuarding = (q.weatherGuarding ?? []).filter(
        (id) => id !== e.target,
      );
      if (!q.weatherGuarding.length) delete q.weatherGuarding;
      return true;
    case "nwhAmbush": {
      const damaged = ownCharacters(s, p).filter((x) => x.damage > 0);
      forOwner(s, p, () => {
        for (const x of damaged) exhaustCharacter(s, x);
      });
      log(
        s,
        `Rearguard Ambusher: ${damaged.length ? `${damaged.map((x) => name(x)).join(", ")} ${damaged.length === 1 ? "is" : "are"} exhausted` : "no damaged character to exhaust"}${seatLabel(s, p)}.`,
        "danger",
      );
      return true;
    }
    case "nwhHurt": {
      // A player deals X damage to a character they control.
      const value = e.value ?? 0;
      const targets = ownCharacters(s, p);
      if (!targets.length) {
        log(
          s,
          `${card(e.code!).name}: ${who(s, p)} control${s.table ? "s" : ""} no character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name}${seatLabel(s, p)} · Deal ${value} damage to a character you control`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("damage", { target: x.id, value, player: p })],
          })),
        ),
      );
      return true;
    }
    case "nwhTracks":
    case "nwhTracksShadow": {
      const shadow = e.kind === "nwhTracksShadow";
      const m = mission(s);
      const options: Option[] = [];
      if (m && m.resources > 0)
        options.push({
          id: "token",
          code: m.code,
          label: `Remove 1 resource token from ${name(m)} (${m.resources})`,
          effects: [
            fx("weatherRemoveMission", {
              target: m.id,
              value: 1,
              player: firstPlayer(s),
            }),
          ],
        });
      if (!shadow)
        options.push({
          id: "threat",
          label: "Add 8 to the total [threat] in the staging area this phase",
          effects: [fx("nwhTracksThreat", { player: p })],
        });
      else if (s.combat)
        options.push({
          id: "attack",
          label: "The attacking enemy gets +3 [attack]",
          effects: [fx("nwhTracksAttack", { player: p })],
        });
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        forOwner(s, p, () =>
          choose(
            s,
            `Rain-washed Tracks${seatLabel(s, p)} · ${shadow ? "Remove a Mission token, or +3 [attack]" : "Remove a Mission token, or +8 [threat]"}`,
            options,
            shadow ? card(N.tracks).shadow : card(N.tracks).text,
          ),
        );
      return true;
    }
    case "nwhTracksThreat":
      q.weatherTracks = [
        ...(q.weatherTracks ?? []).filter((t) => t.round === s.round),
        { round: s.round, phase: phaseKey(s), value: 8 },
      ];
      log(
        s,
        "Rain-washed Tracks: the total [threat] in the staging area gets +8 this phase.",
        "danger",
      );
      return true;
    case "nwhTracksAttack":
      if (s.combat) {
        s.combat.attackBonus += 3;
        log(
          s,
          "Rain-washed Tracks: the attacking enemy gets +3 [attack].",
          "danger",
        );
      }
      return true;
  }
  return false;
}

export const NIGHTMARE_WEATHER_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cardEntered: whCardEntered,
  check: whCheck,
  cannotWin: whCannotWin,
  engaged: whEngaged,
  cannotOptionallyEngage: whCannotOptionallyEngage,
  engagementBonus: whEngagementBonus,
  healed: whHealed,
  stats: whStats,
  stagingThreat: whStagingThreat,
  locationProgressBlocked: whLocationProgressBlocked,
  cannotCancel: whCannotCancel,
  revealed: whRevealed,
  encounter: whEncounter,
  shadow: whShadow,
  effect: nightmareWeatherEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareWeather(s: GameState) {
  const q = s.nightmare;
  if (
    q?.weatherVillagers === undefined &&
    q?.weatherGuarding === undefined &&
    q?.weatherTracks === undefined &&
    q?.weatherRaider === undefined
  )
    return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    whLive(s) &&
    (q.weatherVillagers === undefined ||
      (Array.isArray(q.weatherVillagers) &&
        q.weatherVillagers.every((id) => typeof id === "string") &&
        new Set(q.weatherVillagers).size === q.weatherVillagers.length)) &&
    (q.weatherGuarding === undefined ||
      (Array.isArray(q.weatherGuarding) &&
        q.weatherGuarding.every(
          (id) =>
            typeof id === "string" && (q.weatherVillagers ?? []).includes(id),
        ))) &&
    (q.weatherTracks === undefined ||
      (Array.isArray(q.weatherTracks) &&
        q.weatherTracks.every(
          (t) =>
            !!t &&
            round(t.round) &&
            typeof t.phase === "string" &&
            Number.isInteger(t.value) &&
            t.value > 0,
        ))) &&
    (q.weatherRaider === undefined ||
      (Array.isArray(q.weatherRaider) &&
        q.weatherRaider.every(
          (r) =>
            !!r &&
            typeof r.enemy === "string" &&
            round(r.round) &&
            typeof r.phase === "string",
        )))
  );
}
