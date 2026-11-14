import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
} from "./core";
import {
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  progressLocation,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { dealEnemyShadows } from "./considered-engagement";
import { whiteHandArchery } from "./white-hand";
import { UH } from "./uruk-hai-support";
import {
  snagaOrcsCharacterDestroyed,
  snagaOrcsEffect,
  snagaOrcsEnemyRevealed,
  snagaOrcsShadow,
  snagaOrcsTreachery,
} from "./snaga-orcs";
import {
  RI,
  RI_BREAKING_DAMAGE,
  RI_ENT_RESOURCES,
  RI_ORTHANC_LOOK,
  RI_VOICE_HAND,
  ROAD_ISENGARD_RECIPES,
  hasWizardry,
  roadIsengardSaruman,
  roadIsengardStaff,
  roadIsengardStageInfo,
} from "./road-isengard-support";
export * from "./road-isengard-support";

const TREACHERIES: readonly string[] = [
  RI.blast,
  RI.machines,
  RI.vapour,
  // Saruman's Orders, of the Snaga Orcs.
  UH.orders,
];
/** The current quest's text is in effect (not while a stage resolves its When Revealed effects). */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.roadIsengard?.advancing;
const at = (s: GameState, quest: string) =>
  s.roadIsengard?.currentQuest === quest && stageLive(s);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const players = (s: GameState) => globalPlayerOrder(s).length;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code));
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const orthancActive = (s: GameState) =>
  allActiveLocations(s).some((l) => l.code === RI.orthanc);
const questPhase = (s: GameState) =>
  s.phase === "quest" || s.phase === "staging";
/** The quest phase spans the commit, staging and resolution steps. */
const phaseKey = (s: GameState) => (questPhase(s) ? "quest" : s.phase);
const unit = (s: GameState, id?: string) =>
  id
    ? (get(s, id) ??
      [
        ...globalCharacters(s),
        ...globalEngaged(s),
        ...s.staging,
        ...allActiveLocations(s),
      ].find((x) => x.id === id))
    : undefined;
/** Saruman's Staff keeps the players from winning while it is attached and not blank. */
const staffLive = (s: GameState) => {
  const staff = roadIsengardStaff(s);
  return !!staff && !staff.blanked;
};
function sarumanHitPoints(s: GameState) {
  const saruman = roadIsengardSaruman(s);
  return saruman ? Math.max(0, stats(s, saruman).health - saruman.damage) : 0;
}
const nonUniqueLocations = (s: GameState) =>
  [...allActiveLocations(s), ...s.staging].filter(
    (u) => isLocation(u) && !card(u.code).is_unique,
  );
/** A discarded card's printed threat; Plain of Isengard's X is the number of players. */
const discardedThreat = (s: GameState, code: string) =>
  code === RI.plain ? players(s) : (card(code).threat ?? 0);
function takeSetAside(s: GameState, code: string) {
  const q = s.roadIsengard!;
  const i = q.setAside.indexOf(code);
  if (i < 0) return false;
  q.setAside.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupRoadIsengard(s: GameState) {
  const r = ROAD_ISENGARD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: each copy of Ent of Fangorn is added to the staging area.
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.roadIsengard = {
    currentQuest: RI.rouse,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    rouse: 0,
    breaking: 0,
  };
  log(
    s,
    "Rouse the Ents: Gates of Isengard, Orthanc, Saruman and Saruman's Staff are set aside, out of play, and each Ent of Fangorn is added to the staging area.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.roadIsengard;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // Stages 1B and 2B advance through their own Forced effects.
  if (!at(s, RI.voice)) return true;
  const goal = roadIsengardStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Saruman's Staff: while Saruman has any hit points remaining, the players cannot win.
  if (staffLive(s) && sarumanHitPoints(s) > 0) return true;
  win(s);
  s.reason =
    "The Voice of Saruman is defeated and Saruman has no hit points remaining: the Ents hold Isengard, and the players win the game.";
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.roadIsengard;
  if (!q) return false;
  const player = activeSeat(s);
  if (snagaOrcsEnemyRevealed(s, code, fromReveal)) return true;
  if (code === RI.orc) {
    if (fromReveal) prepend(s, fx("riOrc", { player }));
    return true;
  }
  if (!TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  prepend(
    s,
    fx("riTreachery", { code, source: u.id, player }),
    fx("riTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function surge(s: GameState, code: string, p: number, reason: string) {
  log(s, `${card(code).name}: ${reason}, so it gains surge.`, "danger");
  prepend(
    s,
    fx("amonSurgeWindow", { code, player: p }),
    fx("reveal", { player: p }),
  );
}
function treachery(s: GameState, code: string) {
  const q = s.roadIsengard!;
  const p = activeSeat(s);
  const first = firstPlayer(s);
  switch (code) {
    case RI.blast:
      if (!globalCharacters(s).some((u) => u.committed)) {
        log(s, "Blast of Sorcery: no character is committed to the quest.");
        return;
      }
      prepend(
        s,
        fx("riAssign", { value: players(s) + 1, code, player: first }),
      );
      return;
    case RI.machines: {
      const [location] = allActiveLocations(s);
      if (location && !location.blanked && hasWizardry(location.code)) {
        log(
          s,
          `Machines of Isengard: the Wizardry effect of ${name(location)} is triggered.`,
          "danger",
        );
        prepend(s, fx("riWizardry", { code: location.code, player: first }));
        return;
      }
      surge(s, code, p, "no Wizardry effect was triggered");
      return;
    }
    case RI.vapour: {
      const damaged = globalCharacters(s).filter((u) => u.damage > 0);
      for (const u of damaged)
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
      const ids = q.vapour?.ids ?? [];
      q.vapour = {
        round: s.round,
        ids: [...new Set([...ids, ...damaged.map((u) => u.id)])],
      };
      log(
        s,
        damaged.length
          ? `Poisoned Vapour: ${damaged.map((u) => name(u)).join(", ")} ${damaged.length === 1 ? "is" : "are"} exhausted, and ${damaged.length === 1 ? "its text box is" : "their text boxes are"} treated as blank (except for Traits) until the end of the combat phase.`
          : "Poisoned Vapour: no character is damaged.",
        "danger",
      );
      return;
    }
    default:
      snagaOrcsTreachery(s, code);
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.roadIsengard;
  if (!c || !q) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = unit(s, c.enemyId);
  switch (code) {
    case RI.grima:
      c.defenderId = null;
      c.defenderIds = [];
      log(s, "Gríma: this attack is considered undefended.", "danger");
      return true;
    case RI.orc:
      if (enemy) {
        const ids = q.orcDefense?.round === s.round ? q.orcDefense.ids : [];
        q.orcDefense = { round: s.round, ids: [...ids, enemy.id] };
      }
      log(
        s,
        "Isengard Orc: the attacking enemy gets +2 defense until the end of the round.",
        "danger",
      );
      return true;
    case RI.blast: {
      const bonus = seatView(s, p).hand.length <= 1 ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Blast of Sorcery: the attacking enemy gets +${bonus} attack${bonus === 2 ? " (the defending player has 1 or fewer cards in hand)" : ""}.`,
        "danger",
      );
      return true;
    }
    case RI.machines:
      c.attackBonus += 1;
      c.riKillDiscard = [...(c.riKillDiscard ?? []), p];
      log(
        s,
        "Machines of Isengard: the attacking enemy gets +1 attack; if this attack destroys a character, the defending player discards 1 random card from his hand.",
        "danger",
      );
      return true;
    case RI.vapour:
      prepend(s, fx("riDiscardAttachment", { player: p }));
      return true;
    case RI.wolf: {
      const defender = unit(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      if (!defender) {
        log(s, "Wolf of Isengard: there is no defending character.");
        return true;
      }
      log(
        s,
        `Wolf of Isengard: 1 damage is dealt to ${name(defender)}.`,
        "danger",
      );
      prepend(
        s,
        fx("damage", {
          target: defender.id,
          value: 1,
          player: ownerOf(s, defender),
        }),
      );
      return true;
    }
  }
  return snagaOrcsShadow(s, code);
}
function attackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped?: boolean,
) {
  const q = s.roadIsengard;
  if (!q || skipped) return [];
  const enemy = unit(s, c.enemyId);
  // Gríma: after it attacks a player, that player shuffles it back into the
  // encounter deck and reveals an encounter card.
  if (enemy && live(enemy, RI.grima))
    return [
      fx("riGrima", {
        target: enemy.id,
        player: c.attackPlayer ?? firstPlayer(s),
      }),
    ];
  return [];
}
/** The Ent of Fangorn's Quest Action in the staging area, or Breaking Isengard's on one the player controls. */
function entProblem(s: GameState, u: Unit) {
  if (u.code !== RI.ent || !s.roadIsengard) return null;
  if (!questPhase(s)) return "Use this Quest Action during the quest phase.";
  if (inStaging(s, u)) {
    if (u.blanked) return "This Ent of Fangorn's text box is blank.";
    return s.heroes.some((h) => !h.exhausted)
      ? null
      : "Exhaust a ready hero you control to trigger this effect.";
  }
  if (!at(s, RI.breaking))
    return "Only Breaking Isengard lets the players exhaust an Ent of Fangorn they control.";
  if (!s.allies.some((x) => x.id === u.id))
    return "Only the player who controls this Ent of Fangorn can exhaust it.";
  if (u.exhausted) return "This Ent of Fangorn is exhausted.";
  return nonUniqueLocations(s).length
    ? null
    : "There is no non-unique location in play.";
}

// ---------------------------------------------------------------------------
// Effects.

export function roadIsengardEffect(s: GameState, e: Effect): boolean {
  const q = s.roadIsengard;
  if (!q) return false;
  if (snagaOrcsEffect(s, e)) return true;
  if (!e.kind.startsWith("ri")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s);
  const u = unit(s, e.target);
  switch (e.kind) {
    case "riTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code);
      return true;
    }
    case "riTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // Stage 1B.
    case "riRouseRound":
      if (!at(s, RI.rouse)) return true;
      q.rouse += 1;
      log(
        s,
        `Rouse the Ents: at the end of the round, 1 resource is placed here (${q.rouse}).`,
      );
      choose(
        s,
        `Rouse the Ents · The players may advance to stage 2${seatLabel(s, first)}`,
        [
          {
            id: "advance",
            label: `Advance to stage 2 and reveal ${q.rouse} encounter card${q.rouse === 1 ? "" : "s"}`,
            effects: [fx("riRouseAdvance", { player: first })],
          },
          {
            id: "stay",
            label: "Stay at stage 1 for another round",
            effects: [],
          },
        ],
        "If the players advance, the first player shuffles the encounter discard pile into the encounter deck and reveals 1 encounter card for each resource here. Then, each Ent objective in the staging area is removed from the game.",
      );
      return true;
    case "riRouseAdvance":
      q.advancing = true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Rouse the Ents: the players advance. The encounter discard pile is shuffled into the encounter deck, and the first player reveals ${q.rouse} encounter card${q.rouse === 1 ? "" : "s"}.`,
        "danger",
      );
      prepend(
        s,
        ...Array.from({ length: q.rouse }, () =>
          fx("reveal", { player: first }),
        ),
        fx("riRemoveEnts", { player: first }),
        fx("riStageTwo", { player: first }),
      );
      return true;
    case "riRemoveEnts": {
      const ents = s.staging.filter((x) => x.code === RI.ent);
      if (!ents.length) return true;
      s.staging = s.staging.filter((x) => x.code !== RI.ent);
      (s.removedEncounter ??= []).push(...ents.map((x) => x.code));
      log(
        s,
        `Rouse the Ents: ${ents.length} Ent${ents.length === 1 ? "" : "s"} of Fangorn in the staging area ${ents.length === 1 ? "is" : "are"} removed from the game.`,
      );
      return true;
    }
    case "riStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = RI.breaking;
      log(s, "Breaking Isengard begins.", "chapter");
      if (takeSetAside(s, RI.gates)) {
        if (s.activeLocation) s.staging.push(s.activeLocation);
        s.activeLocation = make(s, RI.gates);
      }
      for (const code of [RI.saruman, RI.orthanc])
        if (takeSetAside(s, code)) {
          const x = make(s, code);
          s.staging.push(x);
          if (code === RI.saruman) enemyAddedToStaging(s, x);
        }
      log(
        s,
        "Breaking Isengard: Gates of Isengard is the active location, and Saruman and Orthanc are added to the staging area.",
        "danger",
      );
      return true;
    }
    // Stage 2B.
    case "riBreakingDamage":
      if (!at(s, RI.breaking)) return true;
      q.breaking += 1;
      log(
        s,
        `Breaking Isengard: a non-unique location was explored, so 1 damage is placed here (${q.breaking} of ${RI_BREAKING_DAMAGE}).`,
        "good",
      );
      if (q.breaking >= RI_BREAKING_DAMAGE) {
        q.advancing = true;
        prepend(s, fx("riStageThree", { player: first }));
      }
      return true;
    case "riStageThree":
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = RI.voice;
      log(s, "The Voice of Saruman begins.", "chapter");
      log(
        s,
        "The Voice of Saruman: each player draws 6 cards and discards down to 6, and Saruman's Staff is attached to Saruman.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("riVoiceDraw", { player })),
        ...playerOrder(s).map((player) => fx("riVoiceDiscard", { player })),
        fx("riStaffAttach", { player: first }),
      );
      return true;
    case "riVoiceDraw":
      // An encounter card effect: Open Pit counts only player card effects.
      draw(s, RI_VOICE_HAND, false);
      return true;
    case "riVoiceDiscard": {
      const excess = s.hand.length - RI_VOICE_HAND;
      if (excess <= 0) return true;
      choose(
        s,
        `The Voice of Saruman · Discard down to 6 cards · ${excess} to discard${seatLabel(s, p)}`,
        s.hand.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("riDiscardCard", {
              target: h.id,
              text: "The Voice of Saruman",
              player: p,
            }),
            fx("riVoiceDiscard", { player: p }),
          ],
        })),
        "Each player with more than 6 cards in his hand discards cards from his hand until he has only 6.",
      );
      return true;
    }
    case "riStaffAttach": {
      q.advancing = false;
      const saruman = roadIsengardSaruman(s);
      if (!saruman || !takeSetAside(s, RI.staff)) return true;
      saruman.attachments.push({
        id: make(s, RI.staff).id,
        code: RI.staff,
        exhausted: false,
      });
      log(s, "Saruman's Staff is attached to Saruman.", "danger");
      return true;
    }
    // Saruman's Staff.
    case "riStaffAttacks": {
      const pending = q.staffPending ?? [];
      delete q.staffPending;
      const saruman = roadIsengardSaruman(s);
      if (!saruman || !staffLive(s)) return true;
      prepend(
        s,
        ...pending.flatMap((player) => [
          fx("riStaffAttack", { target: saruman.id, player }),
          fx("riStaffRemove", { target: saruman.id, player }),
        ]),
      );
      return true;
    }
    case "riStaffAttack":
      if (!u || !staffLive(s)) return true;
      q.staff = true;
      log(
        s,
        `Saruman's Staff: ${who(s, p)} drew cards, so Saruman attacks ${s.table ? "them" : "you"} with 2 shadow cards.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      return true;
    case "riStaffRemove":
      delete q.staff;
      if (u && u.damage > 0) {
        u.damage -= 1;
        log(
          s,
          `Saruman's Staff: 1 damage is removed from Saruman (${u.damage} left).`,
          "danger",
        );
      }
      return true;
    // Wizardry.
    case "riWizardry": {
      const code = e.code!;
      const solo = !!e.flag;
      const targets = solo ? [p] : playerOrder(s);
      const label = card(code).name;
      log(
        s,
        solo
          ? `Saruman is dealt ${label}: ${who(s, p)} ${verb(s, "resolve")} its Wizardry effect as if ${s.table ? "they were" : "you were"} the only player in the game.`
          : `${label}'s Wizardry effect is triggered.`,
        "danger",
      );
      switch (code) {
        case RI.vent:
          prepend(
            s,
            fx("riAssign", {
              value: (solo ? 1 : players(s)) + 1,
              code,
              flag: solo,
              player: solo ? p : first,
            }),
          );
          break;
        case RI.pit:
          prepend(
            s,
            ...targets.map((player) =>
              fx("riThreat", { value: 2, text: label, player }),
            ),
          );
          break;
        case RI.plain:
          prepend(
            s,
            ...targets.map((player) => fx("riDiscardAlly", { player })),
          );
          break;
        case RI.armoury:
          prepend(s, ...targets.map((player) => fx("riExhaust", { player })));
          break;
        case RI.ringWall:
          prepend(
            s,
            ...targets.map((player) =>
              fx("riRandomDiscard", { text: label, player }),
            ),
          );
          break;
      }
      return true;
    }
    case "riAssign": {
      const remaining = e.value ?? 0;
      const solo = !!e.flag;
      const pool =
        e.code === RI.blast
          ? globalCharacters(s).filter((x) => x.committed)
          : solo
            ? [...s.heroes, ...s.allies]
            : globalCharacters(s);
      const targets = pool.filter((x) => x.damage < stats(s, x).health);
      if (remaining <= 0 || !targets.length) return true;
      choose(
        s,
        `${card(e.code!).name} · Assign damage · ${remaining} remaining${seatLabel(s, p)}`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)}${s.table && !solo ? ` · ${seatName(s, ownerOf(s, x))}` : ""} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: 1, player: ownerOf(s, x) }),
            fx("riAssign", {
              value: remaining - 1,
              code: e.code,
              flag: e.flag,
              player: p,
            }),
          ],
        })),
        e.code === RI.blast
          ? "When Revealed: assign X damage among characters committed to the quest, X being 1 more than the number of players."
          : solo
            ? "Wizardry, resolved as if the defending player was the only player: assign 2 damage among characters he controls."
            : "Wizardry: assign X damage among characters in play, X being 1 more than the number of players.",
      );
      return true;
    }
    case "riThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "their" : "your"} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "riDiscardAlly": {
      const allies = [...s.allies];
      if (!allies.length) {
        log(
          s,
          `Plain of Isengard: ${who(s, p)} control${s.table ? "s" : ""} no ally.`,
        );
        return true;
      }
      choose(
        s,
        `Plain of Isengard · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((a) => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("riDropAlly", { target: a.id, player: p })],
        })),
        "Wizardry: each player discards 1 ally he controls.",
      );
      return true;
    }
    case "riDropAlly":
      if (u && s.allies.some((x) => x.id === u.id)) {
        log(s, `Plain of Isengard: ${name(u)} is discarded.`, "danger");
        destroy(s, u, false, "discard", false);
      }
      return true;
    case "riExhaust": {
      const ready = [...s.heroes, ...s.allies].filter((x) => !x.exhausted);
      if (!ready.length) {
        log(
          s,
          `Underground Armoury: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      choose(
        s,
        `Underground Armoury · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("riExhaustCharacter", { target: x.id, player: p })],
        })),
        "Wizardry: each player exhausts a character he controls.",
      );
      return true;
    }
    case "riExhaustCharacter":
      if (u) exhaustCharacter(s, u);
      return true;
    case "riRandomDiscard": {
      if (!s.hand.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      const i = Math.floor(random(s) * s.hand.length);
      const [discarded] = s.hand.splice(i, 1);
      s.discard.push(discarded.code);
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "discard")} a random card (${name(discarded)}).`,
        "danger",
      );
      return true;
    }
    case "riDiscardChoice":
      if (!s.hand.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      choose(
        s,
        `${e.text} · Discard 1 card from your hand${seatLabel(s, p)}`,
        s.hand.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("riDiscardCard", { target: h.id, text: e.text, player: p }),
          ],
        })),
      );
      return true;
    case "riDiscardCard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (!h) return true;
      s.hand = s.hand.filter((x) => x.id !== h.id);
      s.discard.push(h.code);
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "discard")} ${name(h)}.`,
        "danger",
      );
      return true;
    }
    case "riOrc": {
      const options: Option[] = [
        ...(s.hand.length
          ? [
              {
                id: "discard",
                label: "Discard 1 random card from your hand",
                effects: [
                  fx("riRandomDiscard", { text: "Isengard Orc", player: p }),
                ],
              },
            ]
          : []),
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Isengard Orc · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: either discard 1 random card from your hand, or reveal an encounter card.",
      );
      return true;
    }
    case "riVent": {
      const questing = [...s.heroes, ...s.allies].filter((x) => x.committed);
      if (!questing.length) return true;
      choose(
        s,
        `Steaming Vent · Deal 1 damage to a questing character you control${seatLabel(s, p)}`,
        questing.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [fx("damage", { target: x.id, value: 1, player: p })],
        })),
        "Forced: after a player commits characters to the quest, he deals 1 damage to a questing character he controls.",
      );
      return true;
    }
    case "riWolf": {
      const options: Option[] = [
        ...(s.hand.length
          ? [
              {
                id: "discard",
                label: "Discard 1 card from your hand",
                effects: [
                  fx("riDiscardChoice", {
                    text: "Wolf of Isengard",
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        {
          id: "attack",
          label:
            "Wolf of Isengard makes an additional attack against you after this one",
          effects: [fx("riWolfAttack", { target: e.target, player: p })],
        },
      ];
      choose(
        s,
        `Wolf of Isengard · Choose one${seatLabel(s, p)}`,
        options,
        `Forced: Wolf of Isengard is dealt ${card(e.code!).name}, a shadow card with a Wizardry effect.`,
      );
      return true;
    }
    case "riWolfAttack": {
      const c = s.combat;
      if (c && c.enemyId === e.target) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          "Wolf of Isengard makes an additional attack after this one.",
          "danger",
        );
      }
      return true;
    }
    case "riDiscardAttachment": {
      const hosts = [...globalCharacters(s), ...s.staging, ...globalEngaged(s)];
      const choices = hosts.flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!choices.length) {
        log(
          s,
          `Poisoned Vapour: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      choose(
        s,
        `Poisoned Vapour · Discard a non-objective attachment you control${seatLabel(s, p)}`,
        choices.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} · ${name(host)}`,
          effects: [
            fx("riDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
        "Shadow: discard a non-objective attachment you control.",
      );
      return true;
    }
    case "riDropAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `${card(a.code).name} is discarded.`, "danger");
        discardAttachment(s, u, a);
      }
      return true;
    }
    // Locations.
    case "riGates": {
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of [
          ...new Set(cards.filter((c) => card(c).type_code === "enemy")),
        ])
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("riGatesEnemy", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `Gates of Isengard: ${who(s, p)} find${s.table ? "s" : ""} no enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `Gates of Isengard · Put an enemy into play engaged with you${seatLabel(s, p)}`,
        options,
        "Forced: when Gates of Isengard is explored, each player searches the encounter deck and discard pile for an enemy and puts it into play engaged with him. Then, the encounter deck is shuffled.",
      );
      return true;
    }
    case "riGatesEnemy": {
      const zone = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = zone.lastIndexOf(e.code!);
      if (i < 0) return true;
      zone.splice(i, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      log(
        s,
        `Gates of Isengard: ${card(e.code!).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      engage(s, enemy);
      return true;
    }
    case "riShuffle":
      shuffle(s, s.encounterDeck);
      log(s, `${e.text}: the encounter deck is shuffled.`);
      return true;
    case "riOrthancLook": {
      if (!s.encounterDeck.length && s.encounterDiscard.length) {
        s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        log(s, "The encounter discard pile is shuffled back into its deck.");
      }
      const top = s.encounterDeck.splice(0, RI_ORTHANC_LOOK);
      if (!top.length) {
        log(s, "Orthanc: the encounter deck is empty.");
        return true;
      }
      q.looking = top;
      choose(
        s,
        `Orthanc · Reveal 1 of the top ${top.length} encounter cards${seatLabel(s, first)}`,
        top.map((code, i) => ({
          id: `look-${i}`,
          code,
          label: card(code).name,
          effects: [fx("riOrthancReveal", { value: i, player: first })],
        })),
        "Forced: after the players quest successfully, the first player looks at the top 3 cards of the encounter deck, reveals 1, and discards the others.",
      );
      return true;
    }
    case "riOrthancReveal": {
      const looked = q.looking ?? [];
      delete q.looking;
      const i = e.value ?? 0;
      const chosen = looked[i];
      s.encounterDiscard.push(...looked.filter((_, j) => j !== i));
      if (!chosen) return true;
      log(
        s,
        `Orthanc: the first player reveals ${card(chosen).name}${looked.length > 1 ? " and discards the others" : ""}.`,
        "danger",
      );
      revealed(s, chosen, undefined, "encounter");
      return true;
    }
    // Enemies.
    case "riGrima":
      if (!u || !live(u, RI.grima)) return true;
      q.grima = u.id;
      forOwner(s, ownerOf(s, u), () => destroy(s, u, false, "discard", false));
      log(
        s,
        `Gríma: ${who(s, p)} ${verb(s, "shuffle")} Gríma back into the encounter deck and ${verb(s, "reveal")} an encounter card.`,
        "danger",
      );
      prepend(s, fx("reveal", { player: p }));
      return true;
    // Ent of Fangorn.
    case "riEntHero": {
      const heroes = s.heroes.filter((h) => !h.exhausted);
      if (!u || !inStaging(s, u) || !heroes.length) return true;
      choose(
        s,
        `Ent of Fangorn · Exhaust a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} · ${stats(s, h).will} willpower`,
          effects: [
            fx("riEntRouse", { target: u.id, source: h.id, player: p }),
          ],
        })),
        "Quest Action: exhaust a hero you control to discard the top card of the encounter deck. If that hero's willpower is greater than the discarded card's threat, place 1 resource on Ent of Fangorn; at 3, discard them to take control of it.",
      );
      return true;
    }
    case "riEntRouse": {
      const hero = s.heroes.find((h) => h.id === e.source);
      if (!u || !hero || hero.exhausted || !inStaging(s, u)) return true;
      exhaustCharacter(s, hero);
      const top = encounterDraw(s);
      if (!top) {
        log(s, "Ent of Fangorn: the encounter deck is empty.");
        return true;
      }
      s.encounterDiscard.push(top);
      const will = stats(s, hero).will;
      const threat = discardedThreat(s, top);
      if (will <= threat) {
        log(
          s,
          `Ent of Fangorn: ${name(hero)} (${will} willpower) discards ${card(top).name} (${threat} threat); no resource is placed.`,
        );
        return true;
      }
      u.resources += 1;
      log(
        s,
        `Ent of Fangorn: ${name(hero)} (${will} willpower) discards ${card(top).name} (${threat} threat); 1 resource is placed on Ent of Fangorn (${u.resources} of ${RI_ENT_RESOURCES}).`,
        "good",
      );
      if (u.resources >= RI_ENT_RESOURCES) {
        u.resources = 0;
        s.staging = s.staging.filter((x) => x.id !== u.id);
        if (s.table) u.owner = p;
        s.allies.push(u);
        log(
          s,
          `Ent of Fangorn: the resources are discarded, and ${who(s, p)} ${s.table ? "takes" : "take"} control of Ent of Fangorn.`,
          "good",
        );
      }
      return true;
    }
    case "riEntProgress": {
      const locations = nonUniqueLocations(s);
      if (!u || u.exhausted || !locations.length) return true;
      exhaustCharacter(s, u);
      choose(
        s,
        `Breaking Isengard · Place 2 progress on a non-unique location${seatLabel(s, p)}`,
        locations.map((l) => ({
          id: l.id,
          code: l.code,
          label: `${name(l)} · ${l.progress} progress${allActiveLocations(s).some((x) => x.id === l.id) ? " · active" : ""}`,
          effects: [fx("riEntPlace", { target: l.id, player: p })],
        })),
        "Quest Action: exhaust Ent of Fangorn to place 2 progress on a non-unique location.",
      );
      return true;
    }
    case "riEntPlace":
      if (u && isLocation(u)) {
        log(
          s,
          `Breaking Isengard: Ent of Fangorn places 2 progress on ${name(u)}.`,
          "good",
        );
        progressLocation(s, u, 2);
      }
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

export const ROAD_ISENGARD_HOOKS: Batch4ScenarioHooks = {
  setup: setupRoadIsengard,
  advance,
  stageInfo: roadIsengardStageInfo,
  check: (s) => {
    if (s.roadIsengard) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  attackFinished,
  // 1B: players cannot draw cards or gain resources.
  drawBlocked: (s) => at(s, RI.rouse) && s.round > 0,
  cannotCollectResources: (s) => at(s, RI.rouse),
  cannotGainResources: (s) => at(s, RI.rouse),
  // 1B: do not commit characters to the quest or reveal encounter cards.
  cannotCommit: (s) => at(s, RI.rouse),
  beginStaging: (s) => {
    if (!at(s, RI.rouse)) return false;
    log(
      s,
      "Rouse the Ents: the players do not reveal encounter cards during the quest phase.",
    );
    const player = firstPlayer(s);
    enqueue(
      s,
      fx("khazadStagingEnd", { player }),
      fx("questReady", { player }),
    );
    return true;
  },
  roundEnd: (s) => {
    const q = s.roadIsengard;
    if (!q) return [];
    // Shadow cards of enemies that did not attack lose their pending Wizardry.
    delete q.wizardry;
    return at(s, RI.rouse)
      ? [fx("riRouseRound", { player: firstPlayer(s) })]
      : [];
  },
  // Open Pit (player card draws) and Saruman's Staff (any draw).
  cardsDrawn: (s, player, count, cardEffect) => {
    const q = s.roadIsengard;
    if (!q || count <= 0) return;
    const pits = staged(s, RI.pit).length;
    if (cardEffect && pits)
      prepend(s, fx("riThreat", { value: 2 * pits, text: "Open Pit", player }));
    if (!staffLive(s)) return;
    (q.staffPending ??= []).push(player);
    if (!s.queue.some((e) => e.kind === "riStaffAttacks"))
      prepend(s, fx("riStaffAttacks", { player: firstPlayer(s) }));
  },
  // Steaming Vent: after a player commits characters, 1 damage to a questing character.
  committed: (s) => {
    if (!s.roadIsengard) return;
    const vents = staged(s, RI.vent).length;
    if (!vents) return;
    prepend(
      s,
      ...playerOrder(s)
        .filter((p) =>
          [...seatView(s, p).heroes, ...seatView(s, p).allies].some(
            (u) => u.committed,
          ),
        )
        .flatMap((player) =>
          Array.from({ length: vents }, () => fx("riVent", { player })),
        ),
    );
  },
  // Orthanc in the staging area: after the players quest successfully.
  questSucceeded: (s) => {
    if (!s.roadIsengard || !staged(s, RI.orthanc).length) return;
    const look = fx("riOrthancLook", { player: firstPlayer(s) });
    const i = s.queue.findIndex((e) => e.kind === "successfulQuestProgress");
    if (i >= 0) s.queue.splice(i + 1, 0, look);
    else prepend(s, look);
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.roadIsengard;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    const key = phaseKey(s);
    const prior =
      q.phaseProgress?.round === s.round && q.phaseProgress.phase === key
        ? q.phaseProgress.amount
        : 0;
    q.phaseProgress = { round: s.round, phase: key, amount: prior + amount };
  },
  // 3B: after Orthanc is explored, progress on the quest is canceled this phase.
  progress: (s, amount, quest) => {
    const q = s.roadIsengard;
    if (!q?.orthanc || quest.id !== mainQuestUnit(s)?.id) return amount;
    if (q.orthanc.round !== s.round || q.orthanc.phase !== phaseKey(s))
      return amount;
    if (amount > 0)
      log(
        s,
        `Orthanc was explored this phase: ${amount} progress placed on the quest ${amount === 1 ? "is" : "are"} canceled.`,
      );
    return 0;
  },
  // 3B: Orthanc returns to the staging area instead of the discard pile.
  locationDestination: (s, u) => {
    const q = s.roadIsengard;
    if (!q || u.code !== RI.orthanc || !at(s, RI.voice)) return false;
    const key = phaseKey(s);
    const placed =
      q.phaseProgress?.round === s.round && q.phaseProgress.phase === key
        ? q.phaseProgress.amount
        : 0;
    const canceled = Math.min(s.progress, placed);
    s.progress -= canceled;
    delete q.phaseProgress;
    q.orthanc = { round: s.round, phase: key };
    u.progress = 0;
    s.staging.push(u);
    log(
      s,
      `The Voice of Saruman: Orthanc is explored, so ${canceled} progress placed on the quest this phase ${canceled === 1 ? "is" : "are"} canceled, and Orthanc returns to the staging area.`,
      "danger",
    );
    return true;
  },
  explored: (s, u) => {
    const q = s.roadIsengard;
    if (!q) return;
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    // Wizardry: when the location leaves play as an explored location, active or not.
    if (!u.blanked && hasWizardry(u.code))
      effects.push(fx("riWizardry", { code: u.code, player: first }));
    if (!u.blanked && u.code === RI.gates)
      effects.push(
        ...playerOrder(s).map((player) => fx("riGates", { player })),
        fx("riShuffle", { text: "Gates of Isengard", player: first }),
      );
    // 2B: after a non-unique location is explored, 1 damage here.
    if (at(s, RI.breaking) && isLocation(u) && !card(u.code).is_unique)
      effects.push(fx("riBreakingDamage", { player: first }));
    prepend(s, ...effects);
  },
  travelProblem: (s, u) =>
    at(s, RI.breaking) && u.code === RI.orthanc
      ? "Breaking Isengard: the players cannot travel to Orthanc."
      : null,
  // 3B: while Orthanc is the active location, Saruman is engaged with the first player.
  consideredEngaged: (s, u, player) =>
    at(s, RI.voice) &&
    u.code === RI.saruman &&
    orthancActive(s) &&
    inStaging(s, u) &&
    player === firstPlayer(s),
  // Saruman: Indestructible; cannot leave the staging area.
  indestructible: (s, u) => !!s.roadIsengard && live(u, RI.saruman),
  cannotLeave: (s, u, destruction) =>
    !!s.roadIsengard && live(u, RI.saruman) && !destruction && inStaging(s, u),
  cannotEngage: (s, u) => !!s.roadIsengard && live(u, RI.saruman),
  cannotOptionallyEngage: (s, u) => !!s.roadIsengard && live(u, RI.saruman),
  // Saruman and Wolf of Isengard react to shadow cards with a Wizardry effect.
  shadowDealt: (s, enemy, code) => {
    const q = s.roadIsengard;
    if (!q || enemy.blanked || !hasWizardry(code)) return;
    if (enemy.code !== RI.saruman && enemy.code !== RI.wolf) return;
    (q.wizardry ??= []).push({ enemy: enemy.id, code });
  },
  enemyAttackStarted: (s, enemy, player) => {
    const q = s.roadIsengard;
    const mine = q?.wizardry?.filter((w) => w.enemy === enemy.id) ?? [];
    if (!q || !mine.length) return;
    q.wizardry = q.wizardry!.filter((w) => w.enemy !== enemy.id);
    if (!q.wizardry.length) delete q.wizardry;
    prepend(
      s,
      ...mine.map((w) =>
        enemy.code === RI.saruman
          ? fx("riWizardry", { code: w.code, flag: true, player })
          : fx("riWolf", { target: enemy.id, code: w.code, player }),
      ),
    );
  },
  // Saruman's Staff: 2 shadow cards for Saruman's attack.
  shadowCards: (s, u, amount) => {
    const q = s.roadIsengard;
    if (!q?.staff || u.code !== RI.saruman) return amount;
    delete q.staff;
    return amount + 1;
  },
  // Underground Armoury: after an enemy engages a player, deal it a shadow card.
  engaged: (s, u) => {
    if (!s.roadIsengard || !isEnemy(u)) return;
    const armouries = staged(s, RI.armoury).length;
    if (!armouries) return;
    const dealt = dealEnemyShadows(s, u, armouries);
    if (dealt.length)
      log(
        s,
        `Underground Armoury: ${name(u)} is dealt ${dealt.length} shadow card${dealt.length === 1 ? "" : "s"}.`,
        "danger",
      );
  },
  // Ring-wall of Isengard: after damage is healed from a character.
  healed: (s, u) => {
    if (!s.roadIsengard || !isCharacter(u)) return;
    const walls = staged(s, RI.ringWall).length;
    if (!walls) return;
    const owner = u.owner ?? ownerOf(s, u);
    prepend(
      s,
      ...Array.from({ length: walls }, () =>
        fx("riDiscardChoice", { text: "Ring-wall of Isengard", player: owner }),
      ),
    );
  },
  // Plain of Isengard: archery damage must be assigned to allies, if able.
  archeryTargets: (s, characters) => {
    if (!s.roadIsengard || !staged(s, RI.plain).length) return undefined;
    const allies = characters.filter((u) => isAlly(u));
    return allies.length ? allies : undefined;
  },
  // Archery X from the staging area (Isengard Orc and Snaga).
  combatBegin: (s) => {
    if (!s.roadIsengard) return;
    const archery = s.staging.reduce(
      (n, x) => n + (x.blanked ? 0 : whiteHandArchery(x.code)),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  // Poisoned Vapour lasts until the end of the combat phase.
  combatEnd: (s) => {
    if (s.roadIsengard) delete s.roadIsengard.vapour;
  },
  characterBlanked: (s, u) =>
    !!s.roadIsengard?.vapour?.ids.includes(u.id) && isCharacter(u),
  // Isengard Orc's shadow: +2 defense until the end of the round.
  stats: (s, u) => {
    const o = s.roadIsengard?.orcDefense;
    if (!o || o.round !== s.round || !isEnemy(u)) return {};
    const n = o.ids.filter((id) => id === u.id).length;
    return n ? { defense: 2 * n } : {};
  },
  // Plain of Isengard: X is the number of players.
  threatBonus: (s, u) => (s.roadIsengard && live(u, RI.plain) ? players(s) : 0),
  // 3B: a player with 0 cards in hand is eliminated.
  playerEliminationReason: (s, player) => {
    if (!at(s, RI.voice) || seatView(s, player).hand.length > 0)
      return undefined;
    return s.table
      ? `The Voice of Saruman: ${seatName(s, player)} has no cards in hand and is eliminated from the game.`
      : "The Voice of Saruman: you have no cards in hand and are eliminated from the game.";
  },
  // Gríma is shuffled back into the encounter deck.
  enemyDestination: (s, u) => {
    const q = s.roadIsengard;
    if (!q?.grima || q.grima !== u.id) return false;
    delete q.grima;
    s.encounterDeck.push(u.code);
    shuffle(s, s.encounterDeck);
    return true;
  },
  characterDestroyed: (s, u, context) => {
    const q = s.roadIsengard;
    if (!q || !isCharacter(u)) return;
    snagaOrcsCharacterDestroyed(s, u, context);
    const c = s.combat;
    if (!c || !context.combatDamage || context.enemyId !== c.enemyId) return;
    const enemy = unit(s, c.enemyId);
    // Lieutenant of Orthanc: the destroyed character's controller discards a random card.
    if (enemy && live(enemy, RI.lieutenant))
      prepend(
        s,
        fx("riRandomDiscard", {
          text: "Lieutenant of Orthanc",
          player: ownerOf(s, u),
        }),
      );
    // Machines of Isengard's shadow, once for this attack.
    const discarding = c.riKillDiscard ?? [];
    if (discarding.length) {
      delete c.riKillDiscard;
      prepend(
        s,
        ...discarding.map((player) =>
          fx("riRandomDiscard", { text: "Machines of Isengard", player }),
        ),
      );
    }
  },
  abilityLabel: (code) =>
    code === RI.ent ? "Ent of Fangorn · Quest Action" : undefined,
  abilityProblem: (s, u) => entProblem(s, u),
  ability: (s, u) => {
    if (u.code !== RI.ent || !s.roadIsengard || entProblem(s, u)) return false;
    const player = activeSeat(s);
    prepend(
      s,
      fx(inStaging(s, u) ? "riEntHero" : "riEntProgress", {
        target: u.id,
        player,
      }),
    );
    return true;
  },
  effect: roadIsengardEffect,
  sharedEffect: (e) =>
    [
      "riTreacheryDone",
      "riRouseAdvance",
      "riRemoveEnts",
      "riStageTwo",
      "riBreakingDamage",
      "riStageThree",
      "riStaffAttach",
      "riStaffAttacks",
      "riStaffRemove",
      "riShuffle",
    ].includes(e.kind),
};
