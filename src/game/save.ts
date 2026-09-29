// Save validation and restoration.
import { card, SCRIPTED, STARTERS } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import { SCENARIOS } from "./scenarios";

import {
  allEngaged,
  eachSeat,
  ownerOf,
  seatIndices,
  seatView,
  syncSeat,
} from "./table";

import { validFlow } from "./presentation";
import { characters, hasGondor, units } from "./core";

export function validateSave(value: unknown): value is GameState {
  try {
    if (!value || typeof value !== "object") return false;
    const s = value as GameState;
    if (!validFlow(s.flow)) return false;
    const integer = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && Number.isFinite(n);
    const codes = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.every((c) => typeof c === "string" && SCRIPTED.has(c));
    const validUnit = (u: Unit) =>
      u &&
      typeof u.id === "string" &&
      (u.owner === undefined ||
        (integer(u.owner) && u.owner >= 0 && u.owner <= 3)) &&
      (u.attackedBy === undefined ||
        (Array.isArray(u.attackedBy) &&
          u.attackedBy.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      (u.preventedAttacks === undefined ||
        (Array.isArray(u.preventedAttacks) &&
          new Set(u.preventedAttacks).size === u.preventedAttacks.length &&
          u.preventedAttacks.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      [u.tempWill, u.tempAttack, u.tempDefense, u.tempThreat].every(
        (n) => n === undefined || integer(n),
      ) &&
      SCRIPTED.has(u.code) &&
      [u.damage, u.progress, u.resources, u.boost].every(integer) &&
      u.damage >= 0 &&
      u.progress >= 0 &&
      u.resources >= 0 &&
      typeof u.exhausted === "boolean" &&
      typeof u.committed === "boolean" &&
      typeof u.attacked === "boolean" &&
      Array.isArray(u.attachments) &&
      u.attachments.every(
        (a) =>
          typeof a.id === "string" &&
          SCRIPTED.has(a.code) &&
          typeof a.exhausted === "boolean" &&
          (a.owner === undefined ||
            (integer(a.owner) && a.owner >= 0 && a.owner <= 3)),
      ) &&
      codes(u.shadows) &&
      (u.guarding === undefined || typeof u.guarding === "string") &&
      (u.facedownCard === undefined ||
        (SCRIPTED.has(u.facedownCard) &&
          card(u.facedownCard).sphere_code !== "encounter"));
    if (
      s.version !== 2 ||
      (s.fog !== undefined && (!integer(s.fog) || s.fog < 0)) ||
      (s.pendingWolfReturns !== undefined &&
        (!Array.isArray(s.pendingWolfReturns) ||
          !s.pendingWolfReturns.every((code) => code === "01081"))) ||
      (!STARTERS.some((d) => d.id === s.deckId) && s.deckId !== "custom") ||
      (s.easyMode !== undefined && typeof s.easyMode !== "boolean") ||
      (s.customDeck !== undefined &&
        (!s.customDeck ||
          typeof s.customDeck !== "object" ||
          Array.isArray(s.customDeck) ||
          !Object.entries(s.customDeck).every(
            ([code, n]) =>
              SCRIPTED.has(code) &&
              card(code).type_code !== "hero" &&
              card(code).sphere_code !== "encounter" &&
              integer(n) &&
              n >= 0 &&
              n <= 3,
          ))) ||
      !Array.isArray(s.used) ||
      !s.used.every((x) => typeof x === "string") ||
      typeof s.standTogether !== "boolean"
    )
      return false;
    if (
      !SCENARIOS.some((q) => q.id === s.scenarioId) ||
      !["normal", "campaign"].includes(s.playMode) ||
      !codes(s.startingHeroes) ||
      s.startingHeroes.length < 1 ||
      s.startingHeroes.length > 3 ||
      !s.startingHeroes.every((c) => card(c).type_code === "hero") ||
      ![s.alliesPlayed, s.threatModifier, s.shackles].every(integer) ||
      s.alliesPlayed < 0 ||
      s.shackles < 0 ||
      ![
        s.nazgulDefeated,
        s.stageRevealing,
        s.mendorBoost,
        s.campaignScarred,
        s.includeSupport,
      ].every((x) => typeof x === "boolean") ||
      (s.prisoner !== null &&
        (!validUnit(s.prisoner) ||
          card(s.prisoner.code).type_code !== "hero")) ||
      (s.captiveMendor !== null &&
        (!validUnit(s.captiveMendor) || s.captiveMendor.code !== "rc135")) ||
      !Array.isArray(s.suspendedCombats) ||
      !s.suspendedCombats.every(
        (c) => c && typeof c.enemyId === "string" && integer(c.attackBonus),
      )
    )
      return false;
    if (s.playMode === "normal" && s.campaign !== null) return false;
    if (s.playMode === "campaign") {
      const c = s.campaign;
      if (
        !c ||
        !codes(c.heroes) ||
        c.heroes.length < 1 ||
        c.heroes.length > (s.table ? 12 : 3) ||
        new Set(c.heroes).size !== c.heroes.length ||
        !c.heroes.every((h) => card(h).type_code === "hero") ||
        !codes(c.fallen) ||
        !c.fallen.every((h) => card(h).type_code === "hero") ||
        !integer(c.threatPenalty) ||
        c.threatPenalty < 0 ||
        !codes(c.boons) ||
        !c.boons.every((x) => ["rc132", "rc133", "rc135"].includes(x)) ||
        !codes(c.burdens) ||
        !c.burdens.every((x) => ["rc136", "rc137", "rc138"].includes(x)) ||
        !c.permanent ||
        typeof c.permanent !== "object" ||
        Array.isArray(c.permanent) ||
        !Object.entries(c.permanent).every(
          ([h, cs]) =>
            card(h).type_code === "hero" &&
            codes(cs) &&
            cs.every((x) => ["rc133", "rc138"].includes(x)),
        ) ||
        (c.prisoner !== null &&
          (!SCRIPTED.has(c.prisoner) ||
            card(c.prisoner).type_code !== "hero")) ||
        typeof c.mendorSaved !== "boolean" ||
        !Array.isArray(c.completed) ||
        c.completed.length > 3 ||
        !c.completed.every(
          (q, i) =>
            q.scenarioId === SCENARIOS[i].id &&
            integer(q.score) &&
            integer(q.rounds) &&
            q.rounds >= 0,
        )
      )
        return false;
    }
    if (
      s.campaign &&
      s.campaign.completed.length !==
        SCENARIOS.findIndex((q) => q.id === s.scenarioId) +
          (s.status === "won" ? 1 : 0)
    )
      return false;
    if (
      ![
        "setup",
        "planning",
        "quest",
        "staging",
        "travel",
        "encounter",
        "defense",
        "attack",
        "refresh",
      ].includes(s.phase) ||
      !["playing", "won", "lost"].includes(s.status)
    )
      return false;
    if (
      ![
        s.seed,
        s.originalSeed,
        s.round,
        s.nextId,
        s.threat,
        s.progress,
        s.victory,
        s.fallenThreat,
        s.questDebuff,
        s.faramir,
      ].every(integer) ||
      s.round < 0 ||
      s.threat < 0 ||
      s.nextId < 1 ||
      ![1, 2, 3].includes(s.stage) ||
      !["unknown", "beorn", "spider"].includes(s.branch)
    )
      return false;
    if (
      ![
        s.deck,
        s.discard,
        s.removed,
        s.encounterDeck,
        s.encounterDiscard,
      ].every(codes)
    )
      return false;
    if (
      ![s.heroes, s.allies, s.hand, s.staging, s.engaged].every(
        (a) => Array.isArray(a) && a.every(validUnit),
      ) ||
      (s.activeLocation !== null && !validUnit(s.activeLocation))
    )
      return false;
    if (
      !s.heroes.every((u) => card(u.code).type_code === "hero") ||
      !s.allies.every((u) => card(u.code).type_code === "ally") ||
      !s.engaged.every((u) => card(u.code).type_code === "enemy")
    )
      return false;
    if (
      !Array.isArray(s.committedIds) ||
      !s.committedIds.every((x) => typeof x === "string") ||
      ![s.eowynUsed, s.mulled, s.optionalEngagement, s.gondor].every(
        (b) => typeof b === "boolean",
      )
    )
      return false;
    const validEffect = (e: Effect) =>
      e && typeof e.kind === "string" && (!e.code || SCRIPTED.has(e.code));
    if (!Array.isArray(s.queue) || !s.queue.every(validEffect)) return false;
    if (
      s.choice !== null &&
      (!s.choice ||
        typeof s.choice.title !== "string" ||
        !Array.isArray(s.choice.options) ||
        !s.choice.options.length ||
        !s.choice.options.every(
          (o) =>
            typeof o.id === "string" &&
            typeof o.label === "string" &&
            (!o.code || SCRIPTED.has(o.code)) &&
            Array.isArray(o.effects) &&
            o.effects.every(validEffect),
        ))
    )
      return false;
    if (
      !Array.isArray(s.log) ||
      !s.log.every(
        (l) =>
          integer(l.id) &&
          integer(l.round) &&
          typeof l.text === "string" &&
          ["normal", "good", "danger", "chapter"].includes(l.kind),
      )
    )
      return false;
    if (
      s.combat !== null &&
      (!s.combat ||
        typeof s.combat.enemyId !== "string" ||
        !integer(s.combat.attackBonus))
    )
      return false;
    if (
      (s.lastReveal !== null && !SCRIPTED.has(s.lastReveal)) ||
      (s.peek !== null && !SCRIPTED.has(s.peek))
    )
      return false;
    if (s.table) {
      const t = s.table;
      if (
        !Array.isArray(t.seats) ||
        t.seats.length < 1 ||
        t.seats.length > 4 ||
        ![t.active, t.first, t.turn].every(
          (i) => integer(i) && i >= 0 && i < t.seats.length,
        ) ||
        !Array.isArray(t.passed) ||
        !t.passed.every((i) => integer(i) && i >= 0 && i < t.seats.length) ||
        new Set(t.passed).size !== t.passed.length
      )
        return false;
      if (
        new Set(t.seats.flatMap((p) => p.startingHeroes)).size !==
        t.seats.flatMap((p) => p.startingHeroes).length
      )
        return false;
      for (const p of t.seats) {
        if (
          typeof p.eliminated !== "boolean" ||
          p.startingHeroes.length < 1 ||
          p.startingHeroes.length > 3 ||
          !validateSave({
            ...s,
            ...p,
            table: undefined,
            playMode: "normal",
            campaign: null,
          })
        )
          return false;
      }
      if (
        s.campaign?.seatPenalties &&
        (s.campaign.seatPenalties.length !== t.seats.length ||
          !s.campaign.seatPenalties.every((n) => integer(n) && n >= 0))
      )
        return false;
      const effects = [
        ...s.queue,
        ...(s.choice?.options.flatMap((o) => o.effects) ?? []),
      ];
      if (
        effects.some(
          (e) =>
            e.player !== undefined &&
            (!integer(e.player) || e.player < 0 || e.player >= t.seats.length),
        )
      )
        return false;
    }
    if (
      s.table &&
      units(s).some(
        (u) =>
          (u.owner !== undefined && u.owner >= s.table!.seats.length) ||
          u.preventedAttacks?.some((i) => i >= s.table!.seats.length) ||
          u.attachments.some(
            (a) => a.owner !== undefined && a.owner >= s.table!.seats.length,
          ),
      )
    )
      return false;
    const ids = [
      ...units(s),
      ...seatIndices(s).flatMap((i) => seatView(s, i).hand),
      ...(s.prisoner ? [s.prisoner] : []),
      ...(s.captiveMendor ? [s.captiveMendor] : []),
    ].map((u) => u.id);
    return new Set(ids).size === ids.length;
  } catch {
    return false;
  }
}

export function restoreSave(value: unknown): GameState | null {
  try {
    if (!value || typeof value !== "object") return null;
    const s = structuredClone(value) as GameState;
    if ((s.version as number) === 1) {
      Object.assign(s, {
        version: 2,
        scenarioId: "mirkwood",
        playMode: "normal",
        campaign: null,
        startingHeroes: STARTERS.find((d) => d.id === s.deckId)?.heroes ?? [
          ...s.heroes.map((h) => h.code),
          ...s.discard.filter((c) => card(c).type_code === "hero"),
        ],
        prisoner: null,
        captiveMendor: null,
        nazgulDefeated: false,
        stageRevealing: false,
        alliesPlayed: 0,
        threatModifier: 0,
        shackles: 0,
        mendorBoost: false,
        campaignScarred: false,
        includeSupport: true,
        suspendedCombats: [],
      });
    }
    if (!validateSave(s)) return null;
    // Legacy version-two saves used player/global modifiers. Bind those bonuses
    // to the characters present at restore, then use the same snapshot rules.
    const gondor = s.gondor;
    eachSeat(s, () => {
      for (const u of characters(s)) {
        if (s.faramir) u.tempWill = (u.tempWill ?? 0) + s.faramir;
        if (gondor) {
          u.tempAttack = (u.tempAttack ?? 0) + 1;
          if (hasGondor(u)) u.tempDefense = (u.tempDefense ?? 0) + 1;
        }
      }
      s.faramir = 0;
    });
    s.gondor = false;
    for (const u of allEngaged(s))
      if (u.feinted && u.preventedAttacks === undefined)
        u.preventedAttacks = [ownerOf(s, u)];
    syncSeat(s);
    return s;
  } catch {
    return null;
  }
}
