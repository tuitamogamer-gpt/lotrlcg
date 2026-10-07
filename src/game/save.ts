import { validateIsengard } from "./voice-isengard";
import { validateBloodGondorState } from "./blood-gondor-support";
import { validateMorgulValeState } from "./morgul-vale-support";
import { validateDruadanForestState } from "./druadan-forest-support";
import { validateAmonDinState } from "./amon-din-support";
import { validateAssaultOsgiliathState } from "./assault-osgiliath-support";
import { hiddenPlayerCardIds } from "./physical-player-card";
// Save validation and restoration.
import { card, SCRIPTED, STARTERS } from "./cards";
import { BUILT_IN_DECKS } from "./built-in-decks";
import type { Attachment, Effect, GameState, Unit } from "./types";
import { SCENARIOS } from "./scenarios";

import {
  eachArea,
  globalEngaged,
  globalEachSeat,
  ownerOf,
  seatIndices,
  seatView,
  syncSeat,
} from "./table";

import { validFlow } from "./presentation";
import { characters, hasGondor, globalUnits } from "./core";
import { validateDeckList } from "./setup";
import { syncAttachmentText } from "./attachment-text";
import { DEAD } from "./dead-marshes";
import {
  FOUNDATIONS_STONE as F,
  validateFoundationsState,
} from "./foundations-stone-support";
import { validateStewardFearState } from "./steward-fear-support";
import { validateHeirsState } from "./heirs-numenor";

export function validateSave(
  value: unknown,
  inheritedSeatCount?: number,
): value is GameState {
  try {
    if (!value || typeof value !== "object") return false;
    const s = value as GameState;
    const seatCount = inheritedSeatCount ?? s.table?.seats.length ?? 1;
    if (!validFlow(s.flow)) return false;
    const integer = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && Number.isFinite(n);
    const codes = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.every((c) => typeof c === "string" && SCRIPTED.has(c));
    const customList = (v: unknown) => {
      if (!v || typeof v !== "object" || Array.isArray(v)) return false;
      try {
        validateDeckList(v as Record<string, number>);
        return true;
      } catch {
        return false;
      }
    };
    const knownQuest = (code: unknown) =>
      typeof code === "string" && card(code).type_code === "quest";
    const validAttachment = (a: Attachment) =>
      !!a &&
      typeof a.id === "string" &&
      SCRIPTED.has(a.code) &&
      typeof a.exhausted === "boolean" &&
      (a.resourceTokens === undefined ||
        (integer(a.resourceTokens) && a.resourceTokens >= 0)) &&
      (a.facedown === undefined || typeof a.facedown === "boolean") &&
      a.namelessCard === undefined &&
      (a.blanked === undefined || typeof a.blanked === "boolean") &&
      (a.owner === undefined ||
        (integer(a.owner) &&
          a.owner >= 0 &&
          a.owner < (s.table?.seats.length ?? 1)));
    const validAttackExtension = (c: NonNullable<GameState["combat"]>) =>
      (c.immediatePreviousShadows === undefined ||
        codes(c.immediatePreviousShadows)) &&
      (c.immediatePreviousFaceupShadows === undefined ||
        (Array.isArray(c.immediatePreviousFaceupShadows) &&
          c.immediatePreviousFaceupShadows.length ===
            c.immediatePreviousShadows?.length &&
          c.immediatePreviousFaceupShadows.every(
            (v) => typeof v === "boolean",
          ))) &&
      (c.bloodKilledPlayers === undefined ||
        (Array.isArray(c.bloodKilledPlayers) &&
          c.bloodKilledPlayers.every(
            (v) =>
              v &&
              integer(v.player) &&
              v.player >= 0 &&
              v.player < (s.table?.seats.length ?? 1) &&
              typeof v.shadows === "boolean",
          ))) &&
      (c.immediatePreviousRevealedShadowCount === undefined ||
        (integer(c.immediatePreviousRevealedShadowCount) &&
          c.immediatePreviousRevealedShadowCount >= 0 &&
          c.immediatePreviousRevealedShadowCount <=
            (c.immediatePreviousShadows?.length ?? 0))) &&
      [
        c.redirectedToEnemy,
        c.amonDinKilledCharacter,
        c.bloodTurnOnKill,
        c.morgulProgressOnKill,
        c.morgulKilledCharacter,
        c.osgiliathReturnIfKilled,
        c.osgiliathUndefended,
        c.immediatePendingDeclaration,
        c.immediatePreviousShadowCancelsDamage,
        c.immediatePreviousShadowCancelsCombatDamage,
      ].every((v) => v === undefined || typeof v === "boolean") &&
      ((c as typeof c & { druadanReturnCount?: number }).druadanReturnCount ===
        undefined ||
        (integer(
          (c as typeof c & { druadanReturnCount?: number }).druadanReturnCount,
        ) &&
          (c as typeof c & { druadanReturnCount?: number })
            .druadanReturnCount! >= 0)) &&
      (c.amonDinShadowVillagers === undefined ||
        (integer(c.amonDinShadowVillagers) && c.amonDinShadowVillagers >= 0)) &&
      (c.damageDealt === undefined ||
        (integer(c.damageDealt) && c.damageDealt >= 0)) &&
      (c.defenseBonuses === undefined ||
        (!!c.defenseBonuses &&
          typeof c.defenseBonuses === "object" &&
          !Array.isArray(c.defenseBonuses) &&
          Object.values(c.defenseBonuses).every(
            (n) => integer(n) && n >= 0,
          ))) &&
      (c.desperateDefenderIds === undefined ||
        (Array.isArray(c.desperateDefenderIds) &&
          c.desperateDefenderIds.every((id) => typeof id === "string") &&
          new Set(c.desperateDefenderIds).size ===
            c.desperateDefenderIds.length));
    const validUnit = (u: Unit) =>
      u &&
      typeof u.id === "string" &&
      [u.shadowCancelsDamage, u.shadowCancelsCombatDamage].every(
        (v) => v === undefined || typeof v === "boolean",
      ) &&
      (u.blanked === undefined || typeof u.blanked === "boolean") &&
      (u.owner === undefined ||
        (integer(u.owner) && u.owner >= 0 && u.owner <= 3)) &&
      (u.consideredEnemyAttackedBy === undefined ||
        (Array.isArray(u.consideredEnemyAttackedBy) &&
          new Set(u.consideredEnemyAttackedBy).size ===
            u.consideredEnemyAttackedBy.length &&
          u.consideredEnemyAttackedBy.every(
            (i) => integer(i) && i >= 0 && i < seatCount,
          ))) &&
      (u.attackedBy === undefined ||
        (Array.isArray(u.attackedBy) &&
          u.attackedBy.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      (u.preventedAttacks === undefined ||
        (Array.isArray(u.preventedAttacks) &&
          new Set(u.preventedAttacks).size === u.preventedAttacks.length &&
          u.preventedAttacks.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      (u.phaseResourceIcons === undefined ||
        (Array.isArray(u.phaseResourceIcons) &&
          u.phaseResourceIcons.every((icon) =>
            ["leadership", "spirit", "tactics", "lore"].includes(icon),
          ))) &&
      [u.dynamicTraits, u.dynamicKeywords].every(
        (v) =>
          v === undefined ||
          (Array.isArray(v) &&
            v.every((k) => typeof k === "string" && k.length <= 80)),
      ) &&
      (u.roundKeywords === undefined ||
        (Array.isArray(u.roundKeywords) &&
          u.roundKeywords.every((keyword) =>
            ["Sentinel", "Ranged"].includes(keyword),
          ))) &&
      [
        u.tempWill,
        u.tempAttack,
        u.tempDefense,
        u.tempThreat,
        u.tempEngagement,
      ].every((n) => n === undefined || integer(n)) &&
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
          (a.dynamicTraits === undefined ||
            (Array.isArray(a.dynamicTraits) &&
              a.dynamicTraits.every(
                (t) => typeof t === "string" && t.length <= 80,
              ))) &&
          (a.resourceTokens === undefined ||
            (integer(a.resourceTokens) && a.resourceTokens >= 0)) &&
          (a.facedown === undefined || typeof a.facedown === "boolean") &&
          (a.namelessCard === undefined ||
            (a.namelessCard === true &&
              [F.nameless, F.elder].includes(u.code as typeof F.nameless))) &&
          (a.blanked === undefined || typeof a.blanked === "boolean") &&
          (a.owner === undefined ||
            (integer(a.owner) && a.owner >= 0 && a.owner <= 3)),
      ) &&
      (u.morgulExtraAttacks === undefined ||
        (integer(u.morgulExtraAttacks) && u.morgulExtraAttacks >= 0)) &&
      codes(u.shadows) &&
      (u.faceupShadows === undefined ||
        (Array.isArray(u.faceupShadows) &&
          u.faceupShadows.length === u.shadows.length &&
          u.faceupShadows.every((x) => typeof x === "boolean"))) &&
      (u.revealedShadowCount === undefined ||
        (integer(u.revealedShadowCount) &&
          u.revealedShadowCount >= 0 &&
          u.revealedShadowCount <= u.shadows.length)) &&
      (u.guarding === undefined || typeof u.guarding === "string") &&
      (u.facedownCardId === undefined ||
        (typeof u.facedownCardId === "string" && !!u.facedownCard)) &&
      (u.facedownCard === undefined ||
        (SCRIPTED.has(u.facedownCard) &&
          card(u.facedownCard).sphere_code !== "encounter"));
    if (
      s.resolvingEvents !== undefined &&
      (!Array.isArray(s.resolvingEvents) ||
        !s.resolvingEvents.every(
          (event) =>
            event &&
            validUnit(event.unit) &&
            (event.unit.owner === undefined || event.unit.owner < seatCount) &&
            card(event.unit.code).type_code === "event" &&
            integer(event.player) &&
            event.player >= 0 &&
            event.player < seatCount &&
            ["discard", "bottom", "removed", "victory", "hand"].includes(
              event.destination,
            ),
        ))
    )
      return false;
    if (
      s.version !== 2 ||
      (s.fog !== undefined && (!integer(s.fog) || s.fog < 0)) ||
      (s.emynMuilTreacherySeen !== undefined &&
        typeof s.emynMuilTreacherySeen !== "boolean") ||
      (s.pendingWolfReturns !== undefined &&
        (!Array.isArray(s.pendingWolfReturns) ||
          !s.pendingWolfReturns.every((code) => code === "01081"))) ||
      (!BUILT_IN_DECKS.some((d) => d.id === s.deckId) &&
        s.deckId !== "custom") ||
      (s.easyMode !== undefined && typeof s.easyMode !== "boolean") ||
      (s.customDeck !== undefined && !customList(s.customDeck)) ||
      (s.earlyAttackPlayers !== undefined &&
        (s.phase !== "attack" ||
          !Array.isArray(s.earlyAttackPlayers) ||
          !s.earlyAttackPlayers.length ||
          new Set(s.earlyAttackPlayers).size !== s.earlyAttackPlayers.length ||
          !s.earlyAttackPlayers.every(
            (i) => integer(i) && i >= 0 && i < (s.table?.seats.length ?? 1),
          ))) ||
      (s.startingThreat !== undefined &&
        (!integer(s.startingThreat) || s.startingThreat < 0)) ||
      (s.victoryCards !== undefined && !codes(s.victoryCards)) ||
      !Array.isArray(s.used) ||
      !s.used.every((x) => typeof x === "string") ||
      typeof s.standTogether !== "boolean"
    )
      return false;
    if (
      inheritedSeatCount === undefined &&
      (!validateFoundationsState(s, validUnit as (value: unknown) => boolean) ||
        !validateStewardFearState(s) ||
        !validateHeirsState(s) ||
        !validateDruadanForestState(s) ||
        !validateAmonDinState(s) ||
        !validateIsengard(s, validUnit as (u: unknown) => boolean) ||
        !validateBloodGondorState(s, validUnit as (u: unknown) => boolean) ||
        !validateMorgulValeState(s) ||
        !validateAssaultOsgiliathState(
          s,
          validUnit as (value: unknown) => boolean,
        ))
    )
      return false;
    if (
      !SCENARIOS.some((q) => q.id === s.scenarioId) ||
      !["normal", "campaign"].includes(s.playMode) ||
      !codes(s.startingHeroes) ||
      s.startingHeroes.length < 1 ||
      s.startingHeroes.length > 3 ||
      new Set(s.startingHeroes).size !== s.startingHeroes.length ||
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
        (c) =>
          c &&
          typeof c.enemyId === "string" &&
          integer(c.attackBonus) &&
          validAttackExtension(c) &&
          (c.attackPlayer === undefined ||
            (integer(c.attackPlayer) &&
              c.attackPlayer >= 0 &&
              c.attackPlayer < (s.table?.seats.length ?? 1))) &&
          (c.undefendedTargetId === undefined ||
            typeof c.undefendedTargetId === "string") &&
          (c.defensePenalty === undefined ||
            (integer(c.defensePenalty) && c.defensePenalty >= 0)) &&
          (c.cancelEnemyDamage === undefined ||
            typeof c.cancelEnemyDamage === "boolean") &&
          (c.cancelCombatDamage === undefined ||
            typeof c.cancelCombatDamage === "boolean") &&
          (c.immediate === undefined || typeof c.immediate === "boolean") &&
          (c.immediatePreviousAttacked === undefined ||
            typeof c.immediatePreviousAttacked === "boolean"),
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
        "resource",
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
      !integer(s.stage) ||
      s.stage < 1 ||
      s.stage > SCENARIOS.find((q) => q.id === s.scenarioId)!.stages.length ||
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
      (s.activeLocation !== null &&
        (!validUnit(s.activeLocation) ||
          card(s.activeLocation.code).type_code !== "location")) ||
      (s.extraActiveLocations !== undefined &&
        (!Array.isArray(s.extraActiveLocations) ||
          (!s.activeLocation && s.extraActiveLocations.length > 0) ||
          !s.extraActiveLocations.every(
            (l) => validUnit(l) && card(l.code).type_code === "location",
          )))
    )
      return false;
    if (
      !s.heroes.every((u) => card(u.code).type_code === "hero") ||
      !s.allies.every((u) =>
        ["ally", "objective-ally"].includes(card(u.code).type_code),
      ) ||
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
    if (
      s.questAttachments !== undefined &&
      (!s.questAttachments ||
        typeof s.questAttachments !== "object" ||
        Array.isArray(s.questAttachments) ||
        !Object.entries(s.questAttachments).every(
          ([code, attachments]) =>
            knownQuest(code) &&
            Array.isArray(attachments) &&
            attachments.every(validAttachment),
        ))
    )
      return false;
    if (s.pendingQuestDefeat !== undefined && !knownQuest(s.pendingQuestDefeat))
      return false;
    if (s.watcherWater !== undefined) {
      const w = s.watcherWater;
      if (
        s.scenarioId !== "watcher-in-the-water" ||
        !w ||
        !codes(w.setAside) ||
        !w.swampPlaced ||
        typeof w.swampPlaced !== "object" ||
        Array.isArray(w.swampPlaced) ||
        !Object.values(w.swampPlaced).every((n) => integer(n) && n >= 0) ||
        (w.doorsUsedRound !== undefined &&
          (!integer(w.doorsUsedRound) ||
            w.doorsUsedRound < 0 ||
            w.doorsUsedRound > s.round)) ||
        (w.thrashing !== undefined &&
          (!w.thrashing ||
            typeof w.thrashing.enemyId !== "string" ||
            !Array.isArray(w.thrashing.attackerIds) ||
            !w.thrashing.attackerIds.every((id) => typeof id === "string") ||
            !Array.isArray(w.thrashing.players) ||
            !w.thrashing.players.every(
              (i) => integer(i) && i >= 0 && i < (s.table?.seats.length ?? 1),
            )))
      )
        return false;
    }
    if (s.roadRivendell !== undefined) {
      const r = s.roadRivendell;
      if (
        s.scenarioId !== "road-to-rivendell" ||
        !r ||
        (r.gateSeenRound !== undefined &&
          (!integer(r.gateSeenRound) ||
            r.gateSeenRound < 0 ||
            r.gateSeenRound > s.round)) ||
        (r.gateEnemyId !== undefined && typeof r.gateEnemyId !== "string")
      )
        return false;
    }
    if (s.redhorn !== undefined) {
      const r = s.redhorn;
      if (
        s.scenarioId !== "redhorn-gate" ||
        !r ||
        !codes(r.setAside) ||
        !integer(r.snowstorms) ||
        r.snowstorms < 0 ||
        (r.fanuidholResolved !== undefined &&
          typeof r.fanuidholResolved !== "boolean") ||
        [r.fanuidholPaid, r.snowShadowIds].some(
          (ids) =>
            ids !== undefined &&
            (!Array.isArray(ids) ||
              new Set(ids).size !== ids.length ||
              !ids.every((id) => typeof id === "string")),
        )
      )
        return false;
    }
    if (s.khazad !== undefined) {
      const k = s.khazad;
      if (
        !["into-the-pit", "the-seventh-level", "flight-from-moria"].includes(
          s.scenarioId,
        ) ||
        !k ||
        !codes(k.victoryCards) ||
        !codes(k.questDeck) ||
        (k.activeQuest !== undefined &&
          (!SCRIPTED.has(k.activeQuest) ||
            card(k.activeQuest).type_code !== "quest")) ||
        (k.questSide !== undefined && !["A", "B"].includes(k.questSide)) ||
        (k.narrowIds !== undefined &&
          (!Array.isArray(k.narrowIds) ||
            !k.narrowIds.every((id) => typeof id === "string") ||
            new Set(k.narrowIds).size !== k.narrowIds.length)) ||
        (k.toolsFound !== undefined && typeof k.toolsFound !== "boolean")
      )
        return false;
    }
    const validEffect = (e: Effect): boolean =>
      [e?.effects, e?.cancelledEffects, e?.costEffects].every(
        (list) =>
          list === undefined ||
          (Array.isArray(list) && list.every(validEffect)),
      ) &&
      e &&
      (e.player === undefined ||
        (integer(e.player) &&
          e.player >= 0 &&
          e.player < (s.table?.seats.length ?? 1))) &&
      typeof e.kind === "string" &&
      (!e.code || SCRIPTED.has(e.code) || knownQuest(e.code)) &&
      (e.owner === undefined ||
        (integer(e.owner) &&
          e.owner >= 0 &&
          e.owner < (s.table?.seats.length ?? 1)));
    if (s.shadowFlame !== undefined) {
      const f = s.shadowFlame;
      if (
        s.scenarioId !== "shadow-and-flame" ||
        !f ||
        !integer(f.roundAttackBonus) ||
        f.roundAttackBonus < 0 ||
        (f.heroCommittedRound !== undefined &&
          (!integer(f.heroCommittedRound) ||
            f.heroCommittedRound < 0 ||
            f.heroCommittedRound > s.round))
      )
        return false;
    }
    if (s.longDark !== undefined) {
      const d = s.longDark,
        l = d?.locate;
      if (
        s.scenarioId !== "the-long-dark" ||
        !d ||
        !Array.isArray(d.adderDamagedIds) ||
        !d.adderDamagedIds.every((id) => typeof id === "string") ||
        new Set(d.adderDamagedIds).size !== d.adderDamagedIds.length ||
        (l !== undefined &&
          (!l ||
            !integer(l.player) ||
            l.player < 0 ||
            l.player >= (s.table?.seats.length ?? 1) ||
            typeof l.source !== "string" ||
            !Array.isArray(l.pass) ||
            !l.pass.every(validEffect) ||
            !Array.isArray(l.fail) ||
            !l.fail.every(validEffect)))
      )
        return false;
    }
    if (!Array.isArray(s.queue) || !s.queue.every(validEffect)) return false;
    if (s.escapeTest !== undefined) {
      const e = s.escapeTest;
      if (
        !e ||
        s.scenarioId !== "dead-marshes" ||
        !["preparing", "committing", "actions"].includes(e.phase) ||
        ![
          DEAD.gollum,
          DEAD.nightfall,
          DEAD.mist,
          DEAD.lights,
          DEAD.capture,
        ].includes(e.source as typeof DEAD.gollum) ||
        !SCRIPTED.has(e.source) ||
        !integer(e.count) ||
        e.count < 0 ||
        e.count > 7 ||
        e.attack !== (e.source === DEAD.mist) ||
        e.capture !== (e.source === DEAD.capture) ||
        (e.source === DEAD.gollum
          ? e.count < 1 || e.count > 4
          : e.source !== DEAD.capture && e.count !== 2) ||
        (e.phase === "preparing" &&
          (e.source !== DEAD.gollum || e.cursor !== 0)) ||
        !Array.isArray(e.participants) ||
        !e.participants.length ||
        new Set(e.participants).size !== e.participants.length ||
        !e.participants.every(
          (p) => integer(p) && p >= 0 && p < (s.table?.seats.length ?? 1),
        ) ||
        !integer(e.cursor) ||
        e.cursor < 0 ||
        e.cursor > e.participants.length ||
        (e.phase === "committing" && e.cursor >= e.participants.length) ||
        (e.phase === "actions" && e.cursor !== e.participants.length) ||
        !Array.isArray(e.committedIds) ||
        !e.committedIds.every((id) => typeof id === "string") ||
        new Set(e.committedIds).size !== e.committedIds.length ||
        typeof e.attack !== "boolean" ||
        typeof e.capture !== "boolean" ||
        !Array.isArray(e.continuation) ||
        !e.continuation.every(validEffect)
      )
        return false;
    }
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
            (!o.code || SCRIPTED.has(o.code) || knownQuest(o.code)) &&
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
        !integer(s.combat.attackBonus) ||
        !validAttackExtension(s.combat) ||
        (s.combat.attackPlayer !== undefined &&
          (!integer(s.combat.attackPlayer) ||
            s.combat.attackPlayer < 0 ||
            s.combat.attackPlayer >= (s.table?.seats.length ?? 1))) ||
        (s.combat.undefendedTargetId !== undefined &&
          typeof s.combat.undefendedTargetId !== "string") ||
        (s.combat.defensePenalty !== undefined &&
          (!integer(s.combat.defensePenalty) || s.combat.defensePenalty < 0)) ||
        (s.combat.cancelEnemyDamage !== undefined &&
          typeof s.combat.cancelEnemyDamage !== "boolean") ||
        (s.combat.cancelCombatDamage !== undefined &&
          typeof s.combat.cancelCombatDamage !== "boolean") ||
        (s.combat.immediate !== undefined &&
          typeof s.combat.immediate !== "boolean") ||
        (s.combat.immediatePreviousAttacked !== undefined &&
          typeof s.combat.immediatePreviousAttacked !== "boolean"))
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
          !validateSave(
            {
              ...s,
              ...p,
              used: p.used.filter(
                (key) => !key.startsWith("game:foundations-hero-deck:"),
              ),
              table: undefined,
              escapeTest: undefined,
              earlyAttackPlayers: undefined,
              combat: null,
              suspendedCombats: [],
              longDark: undefined,
              shadowFlame: undefined,
              resolvingEvents: undefined,
              watcherWater: undefined,
              questAttachments: undefined,
              pendingQuestDefeat: undefined,
              queue: [],
              choice: null,
              playMode: "normal",
              campaign: null,
            },
            t.seats.length,
          )
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
        ...(s.escapeTest?.continuation ?? []),
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
      globalUnits(s).some(
        (u) =>
          (u.owner !== undefined && u.owner >= s.table!.seats.length) ||
          u.preventedAttacks?.some((i) => i >= s.table!.seats.length) ||
          u.attachments.some(
            (a) => a.owner !== undefined && a.owner >= s.table!.seats.length,
          ),
      )
    )
      return false;
    const hiddenIds = seatIndices(s).flatMap(
      (i) => hiddenPlayerCardIds(seatView(s, i)) ?? [null],
    );
    if (hiddenIds.includes(null)) return false;
    const ids = [
      ...globalUnits(s),
      ...seatIndices(s).flatMap((i) => seatView(s, i).hand),
      ...(s.prisoner ? [s.prisoner] : []),
      ...(s.captiveMendor ? [s.captiveMendor] : []),
      ...(s.resolvingEvents?.map((event) => event.unit) ?? []),
    ]
      .flatMap((u) => [
        u.id,
        ...u.attachments.map((a) => a.id),
        ...(u.facedownCardId ? [u.facedownCardId] : []),
      ])
      .concat(
        Object.values(s.questAttachments ?? {})
          .flat()
          .map((a) => a.id),
        hiddenIds as string[],
      );
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
    eachArea(s, () => syncAttachmentText(s));
    // Legacy version-two saves used player/global modifiers. Bind those bonuses
    // to the characters present at restore, then use the same snapshot rules.
    const gondor = s.gondor;
    globalEachSeat(s, () => {
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
    for (const u of globalEngaged(s))
      if (u.feinted && u.preventedAttacks === undefined)
        u.preventedAttacks = [ownerOf(s, u)];
    syncSeat(s);
    return s;
  } catch {
    return null;
  }
}
