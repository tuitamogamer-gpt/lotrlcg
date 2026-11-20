/**
 * Journey to the Cross-roads' Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (1 Southron Warrior per player shuffled facedown under The
 * Cross-roads, the others set aside out of play, which the scenario's setup
 * resolves in src/game/cross-roads.ts) and its Nightmare encounter cards,
 * composed with the scenario's own rules through batch4Scenario while a
 * Nightmare mode game is played. Southron Rearguard's protection from The
 * Black Gate is the scenario's own check (gateProof). Effects use the "njc"
 * prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend } from "./core";
import { engage, exhaustCharacter } from "./board";
import { activeSeat, allActiveLocations, firstPlayer, seatName } from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { hasTrait } from "./expansion-passives";
import { dealEnemyShadows } from "./considered-engagement";
import { blackGateLimit } from "./cross-roads";
import { JTC } from "./cross-roads-support";
import { NIGHTMARE_LOS as L, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareCrossroadsState {
  /**
   * Blind Wrath: the Harad enemies that were in the staging area as each copy
   * resolved this round (an id once for each copy), with +2 [threat], -30
   * engagement cost and no optional engagement until the end of the round.
   */
  crossroadsWrath?: { round: number; ids: string[] };
}

const njcLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "journey-to-the-cross-roads" &&
  !!s.crossRoads;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isHarad = (u: Unit) => isEnemy(u) && hasTrait(u, "Harad");
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(s, l, code));
const blackGateInPlay = (s: GameState) =>
  s.staging.some((u) => u.code === JTC.blackGate);
/** The number of Blind Wrath copies that affect an enemy this round. */
const wrathOn = (s: GameState, u: Unit) => {
  const w = s.nightmare?.crossroadsWrath;
  return w && w.round === s.round
    ? w.ids.filter((id) => id === u.id).length
    : 0;
};

// ------------------------------------------------------------- passives

function njcThreatBonus(s: GameState, u: Unit) {
  if (!njcLive(s)) return 0;
  let bonus = 2 * wrathOn(s, u);
  // Shadowy Thicket: "+2 [threat] for each facedown card under The Black Gate."
  if (live(s, u, L.shadowy))
    bonus += 2 * (s.crossRoads?.underBlackGate.length ?? 0);
  return bonus;
}
function njcEngagementBonus(s: GameState, u: Unit) {
  if (!njcLive(s)) return 0;
  let bonus = -30 * wrathOn(s, u);
  // Southron Rearguard: "-1 engagement cost for each progress token on stage 1B."
  if (live(s, u, L.rearguard) && !s.stageRevealing) bonus -= s.progress;
  return bonus;
}
/** Dense Fern-brake: "enemies in the staging area are immune to player card effects." */
const njcImmune = (s: GameState, u: Unit) =>
  njcLive(s) &&
  isEnemy(u) &&
  activeIs(s, L.fern) &&
  s.staging.some((x) => x.id === u.id);
/**
 * Wooded Glade: "treat each non-objective attachment's text box as if it
 * were blank." The One Ring (21001) is immune to non-Master card effects.
 */
const njcAttachmentBlanked = (s: GameState, _host: Unit, a: Attachment) =>
  njcLive(s) &&
  activeIs(s, L.glade) &&
  card(a.code).type_code !== "objective" &&
  a.code !== "21001";

// ------------------------------------------------------------- the cards

/** Southron Warrior: "Forced: After Southron Warrior engages you, discard an ally you control." */
function njcEngaged(s: GameState, u: Unit) {
  if (!njcLive(s) || !live(s, u, L.warrior)) return;
  prepend(s, fx("njcDiscardAlly", { player: activeSeat(s) }));
}
/**
 * Shadowy Thicket: "Travel: The first player reveals the top facedown card
 * under The Cross-roads and adds it to the staging area to travel here."
 */
function njcTravelProblem(s: GameState, u: Unit) {
  if (!njcLive(s) || !live(s, u, L.shadowy)) return null;
  return s.crossRoads?.underCrossroads.length
    ? null
    : "Shadowy Thicket: there is no facedown card under The Cross-roads to reveal.";
}
function njcTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!njcLive(s) || !live(s, u, L.shadowy)) return undefined;
  return [
    fx("jtcRevealUnder", { text: "Shadowy Thicket", player: firstPlayer(s) }),
  ];
}

function njcEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!njcLive(s) || (code !== L.wrath && code !== L.ware)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  const p = activeSeat(s);
  // Blind Wrath: "Until the end of the round, each Harad enemy in the
  // staging area gets +2 [threat], -30 engagement cost, and cannot be
  // optionally engaged."
  if (code === L.wrath) {
    const harad = s.staging.filter(isHarad);
    if (!harad.length) {
      log(s, "Blind Wrath: no Harad enemy is in the staging area.");
      return true;
    }
    const q = (s.nightmare ??= {});
    const w =
      q.crossroadsWrath?.round === s.round
        ? q.crossroadsWrath
        : { round: s.round, ids: [] };
    w.ids.push(...harad.map((x) => x.id));
    q.crossroadsWrath = w;
    log(
      s,
      `Blind Wrath: until the end of the round, ${harad.map((x) => name(x)).join(", ")} ${harad.length === 1 ? "gets" : "get"} +2 [threat] and -30 engagement cost, and cannot be optionally engaged.`,
      "danger",
    );
    return true;
  }
  // Ware! Ware!: "Either place this card facedown under The Black Gate, or
  // put the top card under The Cross-roads into play engaged with you."
  prepend(s, fx("njcWare", { player: p }));
  return true;
}

function njcShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !njcLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Southron Warrior: "Attacking enemy gets +1 [attack] (+2 [attack]
    // instead if the defending character is damaged)."
    case L.warrior: {
      const damaged = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .some((x) => !!x && x.damage > 0);
      c.attackBonus += damaged ? 2 : 1;
      log(
        s,
        damaged
          ? "Southron Warrior: the defending character is damaged, so the attacking enemy gets +2 [attack]."
          : "Southron Warrior: the attacking enemy gets +1 [attack].",
        "danger",
      );
      return true;
    }
    // Southron Rearguard: "Return attacking enemy to staging area."
    case L.rearguard:
      c.returnToStaging = true;
      log(
        s,
        "Southron Rearguard: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
    // Wooded Glade: "Discard a non-objective attachment you control."
    case L.glade:
      prepend(
        s,
        fx("jtcDiscardAttachment", { text: "Wooded Glade", player: p }),
      );
      return true;
    // Dense Fern-brake: "Exhaust a character you control."
    case L.fern:
      prepend(s, fx("njcExhaustCharacter", { player: p }));
      return true;
    // Blind Wrath: "Attacking enemy gets +1 [attack]. If this attack
    // destroys a character, return attacking enemy to the staging area."
    case L.wrath:
      c.attackBonus += 1;
      c.jtcReturnOnKill = true;
      log(
        s,
        "Blind Wrath: the attacking enemy gets +1 [attack]; if this attack destroys a character, it returns to the staging area.",
        "danger",
      );
      return true;
    // Ware! Ware!: "Choose an enemy in the staging area. Engage that enemy
    // and deal it a shadow card."
    case L.ware:
      prepend(s, fx("njcWareShadow", { player: p }));
      return true;
  }
  return false;
}

/** Southron Rearguard: "Cannot have attachments." */
const njcCannotAttach = (s: GameState, u: Unit) =>
  njcLive(s) && live(s, u, L.rearguard);
/** Blind Wrath: "cannot be optionally engaged" until the end of the round. */
const njcCannotOptionallyEngage = (s: GameState, u: Unit) =>
  njcLive(s) && wrathOn(s, u) > 0;
function njcRoundEnd(s: GameState): Effect[] {
  if (s.nightmare?.crossroadsWrath) delete s.nightmare.crossroadsWrath;
  return [];
}

// ------------------------------------------------------------- effects

export function nightmareCrossroadsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("njc")) return false;
  if (!njcLive(s)) return true;
  const q = s.crossRoads!;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "njcDiscardAlly": {
      const allies = s.allies.filter(isAlly);
      if (!allies.length) {
        log(s, `Southron Warrior: ${who(s, p)} ${verb(s, "control")} no ally.`);
        return true;
      }
      choose(
        s,
        `Southron Warrior · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("discardCharacter", { target: x.id, player: p })],
        })),
        "Forced: After Southron Warrior engages you, discard an ally you control.",
      );
      return true;
    }
    case "njcExhaustCharacter": {
      const ready = [...s.heroes, ...s.allies].filter(
        (x) => isCharacter(x) && !x.exhausted,
      );
      if (!ready.length) {
        log(
          s,
          `Dense Fern-brake: ${who(s, p)} ${verb(s, "control")} no ready character.`,
        );
        return true;
      }
      choose(
        s,
        `Dense Fern-brake · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("njcExhaust", { target: x.id, player: p })],
        })),
        "Shadow: Exhaust a character you control.",
      );
      return true;
    }
    case "njcExhaust": {
      const x = e.target ? get(s, e.target) : undefined;
      if (x && exhaustCharacter(s, x))
        log(s, `Dense Fern-brake: ${name(x)} is exhausted.`, "danger");
      return true;
    }
    case "njcWare": {
      const options: Option[] = [];
      if (blackGateInPlay(s)) {
        const n = q.underBlackGate.length + 1;
        options.push({
          id: "gate",
          code: L.ware,
          label: `Place Ware! Ware! facedown under The Black Gate (${n} of ${blackGateLimit(s)}${n >= blackGateLimit(s) ? ": the players lose" : ""})`,
          effects: [fx("njcWareGate", { player: p })],
        });
      }
      if (q.underCrossroads.length)
        options.push({
          id: "cross-roads",
          label: `Put the top card under The Cross-roads into play engaged with you (${q.underCrossroads.length} there)`,
          effects: [fx("njcWareEngage", { player: p })],
        });
      if (!options.length) {
        log(
          s,
          "Ware! Ware!: The Black Gate is not in play and no card is under The Cross-roads.",
        );
        return true;
      }
      choose(
        s,
        `Ware! Ware! · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. Surge. When Revealed: Either place this card facedown under The Black Gate, or put the top card under The Cross-roads into play engaged with you.",
      );
      return true;
    }
    case "njcWareGate": {
      // The card leaves the encounter discard pile for The Black Gate.
      const i = s.encounterDiscard.lastIndexOf(L.ware);
      if (i >= 0) s.encounterDiscard.splice(i, 1);
      q.underBlackGate.push(L.ware);
      log(
        s,
        `Ware! Ware! is placed facedown under The Black Gate (${q.underBlackGate.length} of ${blackGateLimit(s)}).`,
        "danger",
      );
      return true;
    }
    case "njcWareEngage": {
      const code = q.underCrossroads.shift();
      if (!code) return true;
      const enemy = make(s, code);
      s.staging.push(enemy);
      log(
        s,
        `Ware! Ware!: ${name(enemy)} is put into play from under The Cross-roads engaged with ${who(s, p)} (${q.underCrossroads.length} left).`,
        "danger",
      );
      engage(s, enemy);
      return true;
    }
    case "njcWareShadow": {
      const enemies = s.staging.filter((x) => isEnemy(x));
      if (!enemies.length) {
        log(s, "Ware! Ware!: no enemy is in the staging area.");
        return true;
      }
      choose(
        s,
        `Ware! Ware! · Engage an enemy in the staging area and deal it a shadow card${seatLabel(s, p)}`,
        enemies.map((x): Option => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("njcWareShadowEngage", { target: x.id, player: p })],
        })),
        "Shadow: Choose an enemy in the staging area. Engage that enemy and deal it a shadow card.",
      );
      return true;
    }
    case "njcWareShadowEngage": {
      const enemy = s.staging.find((x) => x.id === e.target);
      if (!enemy) return true;
      engage(s, enemy);
      const dealt = dealEnemyShadows(s, enemy);
      log(
        s,
        `Ware! Ware!: ${who(s, p)} ${verb(s, "engage")} ${name(enemy)}${dealt.length ? ", and it is dealt a shadow card" : ""}.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_CROSSROADS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  threatBonus: njcThreatBonus,
  engagementBonus: njcEngagementBonus,
  immune: njcImmune,
  attachmentBlanked: njcAttachmentBlanked,
  engaged: njcEngaged,
  travelProblem: njcTravelProblem,
  travelEffects: njcTravelEffects,
  cannotAttach: njcCannotAttach,
  cannotOptionallyEngage: njcCannotOptionallyEngage,
  roundEnd: njcRoundEnd,
  encounter: njcEncounter,
  shadow: njcShadow,
  effect: nightmareCrossroadsEffect,
  sharedEffect: () => false,
};

/** The Nightmare state a save restores (docs/NIGHTMARE.md). */
export function validNightmareCrossroads(s: GameState) {
  const w = s.nightmare?.crossroadsWrath;
  if (w === undefined) return true;
  return (
    njcLive(s) &&
    !!w &&
    Number.isInteger(w.round) &&
    w.round >= 0 &&
    Array.isArray(w.ids) &&
    w.ids.every((id) => typeof id === "string")
  );
}
