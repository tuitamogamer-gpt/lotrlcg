import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  depositInFlightEncounterCards,
  enemyAddedToStaging,
  enterAlly,
  exhaustCharacter,
  progress,
  progressLocation,
  questDefeated,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  startPhase,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { addCurrentQuestProgress } from "./side-quests";
import { lotrSagaCheck } from "./lotr-saga";
import {
  HD,
  HD_DEFENSE,
  HD_DEFENSE_TOKENS,
  HELMS_DEEP_RECIPES,
  helmsDeepDefense,
  helmsDeepStageInfo,
} from "./helms-deep-support";
import {
  whiteHandArchery,
  whiteHandCharacterDestroyed,
  whiteHandEffect,
  whiteHandEnemyRevealed,
  whiteHandShadow,
  whiteHandStagingThreat,
  whiteHandToughness,
  whiteHandTreachery,
} from "./white-hand";
import { UH } from "./uruk-hai-support";
export * from "./helms-deep-support";

const TREACHERIES: readonly string[] = [
  HD.ladders,
  HD.devilry,
  HD.hate,
  HD.night,
  // Fighting Uruk-hai, of the Orcs of the White Hand.
  UH.fighting,
];
const NEXT_STAGE: Record<string, string> = {
  [HD.assault]: HD.hosts,
  [HD.hosts]: HD.breached,
};
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
/** The current quest has the Defense keyword. */
const defending = (s: GameState) =>
  !!s.helmsDeep &&
  HD_DEFENSE.includes(s.helmsDeep.currentQuest) &&
  stageLive(s);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(l, code));
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter((u) => isEnemy(u));
const players = (s: GameState) => globalPlayerOrder(s).length;
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/**
 * Defense: progress from the encounter deck or an encounter card is placed on
 * the active location first, unless the card bypasses it.
 */
function encounterProgress(s: GameState, amount: number, bypass = false) {
  if (amount <= 0) return;
  if (bypass) addCurrentQuestProgress(s, amount);
  else progress(s, amount, false, false);
}
/** Discard from the encounter deck until X enemies are discarded; they enter the staging area. */
function enemiesUntil(s: GameState, count: number, reason: string) {
  const enemies: string[] = [],
    discarded: string[] = [];
  while (enemies.length < count && s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    if (card(c).type_code === "enemy") enemies.push(c);
    else {
      s.encounterDiscard.push(c);
      discarded.push(c);
    }
  }
  for (const c of enemies) {
    const u = make(s, c);
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
  log(
    s,
    `${reason}: ${enemies.length ? enemies.map((c) => card(c).name).join(", ") : "no enemy"} ${enemies.length === 1 ? "is" : "are"} added to the staging area${discarded.length ? ` (${discarded.length} other card${discarded.length === 1 ? "" : "s"} discarded)` : ""}.`,
    "danger",
  );
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupHelmsDeep(s: GameState) {
  const r = HELMS_DEEP_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: The Defense of Helm's Deep and a Deeping Wall are set aside, and a
  // Soldier of Isengard for each player; the other Soldiers and the Poisoned
  // Counsels wait for the players' choice.
  const prepared = section("sharedStagingArea");
  const soldiers = prepared.filter((c) => c === HD.soldier);
  const count = s.table?.seats.length ?? 1;
  s.removedEncounter = [
    ...(s.removedEncounter ?? []),
    ...soldiers.slice(count),
    ...prepared.filter((c) => c === HD.counsels),
  ];
  s.helmsDeep = {
    currentQuest: HD.king,
    advancing: false,
    setAside: [...section("sharedSetAside"), ...soldiers.slice(0, count)],
    resolving: [],
    counsels: null,
  };
  log(
    s,
    "The King of the Golden Hall: The Defense of Helm's Deep, a Deeping Wall and a Soldier of Isengard for each player are set aside, out of play.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.helmsDeep;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 5B: if there are no enemies in play, the players win the game.
  if (q.currentQuest === HD.rides && stageLive(s)) {
    if (!enemiesInPlay(s).length) {
      win(
        s,
        "The King Rides Out: the hosts of Isengard are driven from Helm's Deep, and the players win the game.",
      );
    }
    return true;
  }
  if (!defending(s)) return true;
  const goal = helmsDeepStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // 4B: if this stage is defeated, the players lose the game.
  if (q.currentQuest === HD.breached) {
    lose(
      s,
      "The Wall is Breached! is defeated: the army of Saruman captures Helm's Deep, and the players lose the game.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("hdDefeat", { player: firstPlayer(s) }));
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
  const q = s.helmsDeep;
  if (!q) return false;
  const player = activeSeat(s);
  if (whiteHandEnemyRevealed(s, code, fromReveal)) return true;
  if (code === HD.warrior) {
    if (!fromReveal) return true;
    const u = [...s.staging].reverse().find((x) => x.code === code);
    if (u) prepend(s, fx("immediateAttack", { target: u.id, player }));
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
    fx("hdTreachery", { code, source: u.id, player }),
    fx("hdTreacheryDone", { source: u.id, player }),
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
function treachery(s: GameState, code: string, source: string) {
  const q = s.helmsDeep!;
  const p = activeSeat(s);
  switch (code) {
    case HD.ladders: {
      const [location] = allActiveLocations(s);
      if (location) {
        const i = q.resolving.findIndex((x) => x.id === source);
        const [held] = q.resolving.splice(i, 1);
        location.attachments.push({
          id: held.id,
          code: HD.ladders,
          exhausted: false,
        });
        log(
          s,
          `Scaling Ladders attaches to ${name(location)}: each enemy gets +1 threat.`,
          "danger",
        );
      } else log(s, "Scaling Ladders: there is no active location.");
      return;
    }
    case HD.devilry:
      q.devilry = s.round;
      log(
        s,
        "Devilry of Saruman: 3 progress is placed on the main quest, and until the end of the round each character's text box is treated as blank (except for Traits).",
        "danger",
      );
      encounterProgress(s, 3, true);
      return;
    case HD.hate: {
      const enemies = s.staging.filter((u) => isEnemy(u));
      const top = Math.max(-1, ...enemies.map((u) => stats(s, u).attack));
      const strongest = enemies.filter((u) => stats(s, u).attack === top);
      if (!strongest.length) {
        surge(s, code, p, "no attack was made");
        return;
      }
      if (strongest.length === 1) {
        prepend(
          s,
          fx("immediateAttack", { target: strongest[0].id, player: p }),
        );
        return;
      }
      choose(
        s,
        `Reckless Hate · Choose the attacking enemy${seatLabel(s, p)}`,
        strongest.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} · ${top} attack`,
          effects: [fx("immediateAttack", { target: u.id, player: p })],
        })),
        "Peril. The enemy in the staging area with the highest attack makes an immediate attack against you.",
      );
      return;
    }
    case HD.night: {
      const defense = helmsDeepDefense(s);
      const options: Option[] = [
        ...(defense && defense.resources > 0
          ? [
              {
                id: "token",
                label:
                  "Remove 1 resource token from The Defense of Helm's Deep",
                effects: [fx("hdNightToken", { player: p })],
              },
            ]
          : []),
        {
          id: "reveal",
          label: "Reveal 2 additional encounter cards",
          effects: [fx("reveal", { player: p }), fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Night Without End · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. Either remove 1 resource token from The Defense of Helm's Deep, or reveal 2 additional encounter cards.",
      );
      return;
    }
    default:
      whiteHandTreachery(s, code);
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.helmsDeep;
  if (!c || !q) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    case HD.hillman: {
      const [location] = allActiveLocations(s);
      if (location) progressLocation(s, location, 1);
      const bonus = allActiveLocations(s)[0]?.progress ?? 0;
      c.attackBonus += bonus;
      log(
        s,
        `Wild Hillman: 1 progress is placed on the active location; the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case HD.soldier:
      prepend(s, fx("hdExhaust", { player: p }));
      return true;
    case HD.ladders:
      c.attackBonus += 1;
      c.hdKillProgress = (c.hdKillProgress ?? 0) + 1;
      log(
        s,
        "Scaling Ladders: the attacking enemy gets +1 attack; if this attack destroys a character, 1 progress is placed on the current quest.",
        "danger",
      );
      return true;
    case HD.devilry:
      c.attackBonus += 2;
      if (enemy) {
        const ids =
          q.devilryShadow?.round === s.round ? q.devilryShadow.ids : [];
        q.devilryShadow = { round: s.round, ids: [...ids, enemy.id] };
      }
      log(
        s,
        "Devilry of Saruman: the attacking enemy gets +2 attack and gains Toughness 2 until the end of the round.",
        "danger",
      );
      return true;
    case HD.hate:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Reckless Hate: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case HD.night:
      c.returnToStaging = true;
      log(
        s,
        "Night Without End: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
  }
  return whiteHandShadow(s, code);
}
function attackFinished(s: GameState, c: NonNullable<GameState["combat"]>) {
  const q = s.helmsDeep;
  if (!q) return [];
  const effects: Effect[] = [];
  const enemy = get(s, c.enemyId);
  const first = firstPlayer(s);
  if (enemy && live(enemy, HD.hillman))
    effects.push(
      fx("hdActiveProgress", { value: 1, text: "Wild Hillman", player: first }),
    );
  if (c.hdKilled) {
    if (enemy && live(enemy, HD.warrior))
      effects.push(
        fx("hdActiveProgress", {
          value: 3,
          text: "Warrior of Dunland",
          player: first,
        }),
      );
    if (enemy && live(enemy, HD.soldier))
      effects.push(
        fx("hdQuestProgress", {
          value: 1,
          text: "Soldier of Isengard",
          player: first,
        }),
      );
    if (c.hdKillProgress)
      effects.push(
        fx("hdQuestProgress", {
          value: c.hdKillProgress,
          text: "Scaling Ladders",
          player: first,
        }),
      );
  }
  return effects;
}

// ---------------------------------------------------------------------------
// Effects.

export function helmsDeepEffect(s: GameState, e: Effect): boolean {
  const q = s.helmsDeep;
  if (!q) return false;
  const first = firstPlayer(s);
  // Defense: players cannot place progress by questing successfully.
  if (e.kind === "successfulQuestProgress" && defending(s)) {
    log(
      s,
      "Defense: the players cannot place progress on the quest or the active location by questing successfully.",
    );
    return true;
  }
  // 1B: skip the combat phase.
  if (e.kind === "startCombat" && q.currentQuest === HD.king && stageLive(s)) {
    log(s, "The King of the Golden Hall: the players skip the combat phase.");
    startPhase(s, "defense");
    prepend(s, fx("phaseEnd"), fx("endCombat"));
    return true;
  }
  // Helm's Gate: a card at the end of each staging step while a player is not engaged.
  if (
    e.kind === "questReady" &&
    activeIs(s, HD.gate) &&
    q.gateStaging !== s.round &&
    globalPlayerOrder(s).some(
      (p) => !seatView(s, p).engaged.some((u) => isEnemy(u)),
    )
  ) {
    q.gateStaging = s.round;
    log(
      s,
      "Helm's Gate: a player is not engaged with an enemy, so the first player reveals an encounter card at the end of the staging step.",
      "danger",
    );
    prepend(s, fx("reveal", { player: first }), e);
    return true;
  }
  if (whiteHandEffect(s, e)) return true;
  if (!e.kind.startsWith("hd")) return false;
  const p = e.player ?? activeSeat(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...globalCharacters(s), ...globalEngaged(s), ...s.staging].find(
        (x) => x.id === e.target,
      ))
    : undefined;
  switch (e.kind) {
    case "hdCounselsChoice":
      choose(
        s,
        `The King of the Golden Hall · The players must choose${seatLabel(s, first)}`,
        [
          {
            id: "counsels",
            label:
              "Each player shuffles 1 copy of Poisoned Counsels into his deck",
            effects: [fx("hdCounsels", { player: first })],
          },
          {
            id: "advance",
            label: "Advance to stage 2A (bypassing stage 1B)",
            effects: [fx("hdBypass", { player: first })],
          },
        ],
        "Setup: either each player shuffles 1 copy of Poisoned Counsels into his deck, or the players advance to stage 2A, bypassing stage 1B.",
      );
      return true;
    case "hdCounsels": {
      q.counsels = true;
      for (const player of playerOrder(s)) {
        const i = (s.removedEncounter ?? []).indexOf(HD.counsels);
        if (i < 0) break;
        s.removedEncounter!.splice(i, 1);
        forOwner(s, player, () => {
          s.deck.push(HD.counsels);
          shuffle(s, s.deck);
        });
      }
      log(
        s,
        "The King of the Golden Hall: each player shuffles 1 copy of Poisoned Counsels into his deck.",
        "danger",
      );
      prepend(s, ...playerOrder(s).map((player) => fx("hdAlly", { player })));
      return true;
    }
    case "hdAlly": {
      const spheres = new Set(s.heroes.map((h) => card(h.code).sphere_code));
      const allies = s.hand.filter(
        (a) =>
          card(a.code).type_code === "ally" &&
          spheres.has(card(a.code).sphere_code),
      );
      if (!allies.length) {
        log(
          s,
          `The King of the Golden Hall: ${who(s, p)} ${s.table ? "has" : "have"} no ally in hand that matches the sphere of a hero ${s.table ? "they control" : "you control"}.`,
        );
        return true;
      }
      choose(
        s,
        `The King of the Golden Hall · Put an ally into play${seatLabel(s, p)}`,
        allies.map((a) => ({
          id: a.id,
          code: a.code,
          label: name(a),
          effects: [fx("hdAllyEnters", { target: a.id, player: p })],
        })),
        "Each player chooses 1 ally in his hand that matches the sphere of a hero he controls and puts it into play under his control.",
      );
      return true;
    }
    case "hdAllyEnters": {
      const a = s.hand.find((x) => x.id === e.target);
      if (!a) return true;
      s.hand = s.hand.filter((x) => x.id !== a.id);
      enterAlly(s, a, false, false, true);
      log(
        s,
        `The King of the Golden Hall: ${name(a)} is put into play.`,
        "good",
      );
      return true;
    }
    case "hdBypass":
      q.counsels = false;
      log(
        s,
        "The King of the Golden Hall: the players advance to stage 2A, bypassing stage 1B.",
      );
      prepend(s, fx("hdStageTwo", { player: first }));
      return true;
    case "hdStageOneEnd":
      if (q.currentQuest !== HD.king || !stageLive(s)) return true;
      log(
        s,
        "The King of the Golden Hall: at the end of the round, the players advance to stage 2A.",
      );
      prepend(s, fx("hdStageTwo", { player: first }));
      return true;
    case "hdStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = HD.assault;
      log(s, "Assault on Helm's Deep begins.", "chapter");
      const defense = q.setAside.indexOf(HD.defense);
      if (defense >= 0) {
        q.setAside.splice(defense, 1);
        s.staging.push(make(s, HD.defense));
      }
      for (const _ of q.setAside.filter((c) => c === HD.soldier)) {
        q.setAside.splice(q.setAside.indexOf(HD.soldier), 1);
        const soldier = make(s, HD.soldier);
        s.staging.push(soldier);
        enemyAddedToStaging(s, soldier);
      }
      const wall = q.setAside.indexOf(HD.wall);
      if (wall >= 0) {
        q.setAside.splice(wall, 1);
        if (s.activeLocation) s.staging.push(s.activeLocation);
        s.activeLocation = make(s, HD.wall);
      }
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Assault on Helm's Deep: The Defense of Helm's Deep and the Soldiers of Isengard enter the staging area, Deeping Wall is the active location, and each player reveals 1 encounter card.",
        "danger",
      );
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      return true;
    }
    case "hdDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx("hdNextStage", { code: NEXT_STAGE[q.currentQuest], player: first }),
      );
      return true;
    }
    case "hdNextStage": {
      q.advancing = false;
      s.progress = 0;
      if (e.code === HD.hosts) {
        s.stage = 3;
        q.currentQuest = HD.hosts;
        log(s, "The Hosts of Isengard begins.", "chapter");
        // Search the encounter deck, discard pile and victory display for Helm's Gate.
        const zones = [
          s.encounterDeck,
          s.encounterDiscard,
          s.victoryCards ?? [],
        ];
        const zone = zones.find((z) => z.includes(HD.gate));
        if (zone) {
          zone.splice(zone.indexOf(HD.gate), 1);
          if (zone === s.victoryCards) s.victory -= card(HD.gate).victory ?? 0;
          if (s.activeLocation) s.staging.push(s.activeLocation);
          s.activeLocation = make(s, HD.gate);
          log(
            s,
            "The Hosts of Isengard: Helm's Gate is the active location, and any previous active location returns to the staging area.",
            "danger",
          );
        } else log(s, "The Hosts of Isengard: Helm's Gate is not found.");
        shuffle(s, s.encounterDeck);
        return true;
      }
      s.stage = 4;
      q.currentQuest = HD.breached;
      log(s, "The Wall is Breached! begins.", "chapter");
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      enemiesUntil(s, players(s), "The Wall is Breached!");
      return true;
    }
    case "hdStageFive": {
      const defense = helmsDeepDefense(s);
      if (defense) {
        s.staging = s.staging.filter((x) => x.id !== defense.id);
        (s.victoryCards ??= []).push(HD.defense);
        s.victory += card(HD.defense).victory ?? 0;
      }
      q.advancing = false;
      s.stage = 5;
      s.progress = 0;
      q.currentQuest = HD.rides;
      log(
        s,
        "The Defense of Helm's Deep has 8 resource tokens: it goes to the victory display, and The King Rides Out begins.",
        "chapter",
      );
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      enemiesUntil(s, players(s), "The King Rides Out");
      return true;
    }
    case "hdTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "hdTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "hdNightToken": {
      const defense = helmsDeepDefense(s);
      if (defense && defense.resources > 0) {
        defense.resources -= 1;
        log(
          s,
          `Night Without End: 1 resource token is removed from The Defense of Helm's Deep (${defense.resources} left).`,
          "danger",
        );
      }
      return true;
    }
    case "hdDefenseToken": {
      const defense = helmsDeepDefense(s);
      if (!defense || defense.blanked) return true;
      defense.resources += 1;
      log(
        s,
        `The Defense of Helm's Deep: at the end of the quest phase, 1 resource token is placed here (${defense.resources} of ${HD_DEFENSE_TOKENS}).`,
        "good",
      );
      if (
        defense.resources >= HD_DEFENSE_TOKENS &&
        q.currentQuest !== HD.rides
      ) {
        q.advancing = true;
        prepend(s, fx("hdStageFive", { player: first }));
      }
      return true;
    }
    case "hdHostsReveal":
      if (q.currentQuest !== HD.hosts || !stageLive(s)) return true;
      if (q.questProgress === s.round) return true;
      log(
        s,
        "The Hosts of Isengard: the encounter deck did not place progress on this stage as the result of questing, so the first player reveals 1 encounter card.",
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
    case "hdAssaultCombat": {
      if (q.currentQuest !== HD.assault || !stageLive(s)) return true;
      const enemies = s.staging.filter((x) => isEnemy(x)).length;
      if (enemies >= players(s)) return true;
      log(
        s,
        `Assault on Helm's Deep: ${enemies} enem${enemies === 1 ? "y is" : "ies are"} in the staging area, fewer than the players, so the first player reveals an encounter card.`,
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
    }
    case "hdAssaultRound": {
      if (q.currentQuest !== HD.assault || !stageLive(s)) return true;
      const enemies = s.staging.filter((x) => isEnemy(x)).length;
      if (!enemies) return true;
      log(
        s,
        `Assault on Helm's Deep: at the end of the round, ${enemies} progress ${enemies === 1 ? "is" : "are"} placed here for the enemies in the staging area.`,
        "danger",
      );
      encounterProgress(s, enemies, true);
      return true;
    }
    case "hdBreachedProgress":
      if (q.currentQuest !== HD.breached || !stageLive(s)) return true;
      log(
        s,
        "The Wall is Breached!: a character was destroyed, so 1 progress is placed on this stage.",
        "danger",
      );
      encounterProgress(s, 1, true);
      return true;
    case "hdActiveProgress": {
      const [location] = allActiveLocations(s);
      if (!location) return true;
      log(
        s,
        `${e.text}: ${e.value} progress ${e.value === 1 ? "is" : "are"} placed on the active location.`,
        "danger",
      );
      progressLocation(s, location, e.value ?? 0);
      return true;
    }
    case "hdQuestProgress":
      log(
        s,
        `${e.text}: ${e.value} progress ${e.value === 1 ? "is" : "are"} placed on the current quest.`,
        "danger",
      );
      encounterProgress(s, e.value ?? 0);
      return true;
    case "hdExhaust": {
      const ready = [...s.heroes, ...s.allies].filter((x) => !x.exhausted);
      if (!ready.length) {
        log(
          s,
          `Soldier of Isengard: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      choose(
        s,
        `Soldier of Isengard · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("hdExhaustCharacter", { target: x.id, player: p })],
        })),
        "Shadow: exhaust a character you control.",
      );
      return true;
    }
    case "hdExhaustCharacter":
      if (u) exhaustCharacter(s, u);
      return true;
    case "hdHornburg": {
      const remaining = e.value ?? 0;
      const characters = globalCharacters(s).filter(
        (x) => x.damage < stats(s, x).health,
      );
      if (remaining <= 0 || !characters.length) return true;
      choose(
        s,
        `The Hornburg · Assign damage · ${remaining} remaining${seatLabel(s, first)}`,
        characters.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)}${s.table ? ` · ${seatName(s, ownerOf(s, x))}` : ""} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: 1, player: ownerOf(s, x) }),
            fx("hdHornburg", { value: remaining - 1, player: first }),
          ],
        })),
        "Forced: when The Hornburg is explored, assign X damage among characters in play, X being the number of enemies in play.",
      );
      return true;
    }
    case "hdCulvert": {
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
            effects: [fx("hdCulvertReveal", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `Deeping Culvert: ${who(s, p)} find${s.table ? "s" : ""} no enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `Deeping Culvert · Reveal an enemy${seatLabel(s, p)}`,
        options,
        "Each player searches the encounter deck and discard pile for an enemy, reveals it, and adds it to the staging area.",
      );
      return true;
    }
    case "hdCulvertReveal": {
      const zone = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = zone.lastIndexOf(e.code!);
      if (i < 0) return true;
      zone.splice(i, 1);
      log(
        s,
        `Deeping Culvert: ${who(s, p)} ${verb(s, "reveal")} ${card(e.code!).name}.`,
        "danger",
      );
      revealed(s, e.code!, undefined, "encounter");
      return true;
    }
    case "hdShuffle":
      shuffle(s, s.encounterDeck);
      log(s, `${e.text ?? "Helm's Deep"}: the encounter deck is shuffled.`);
      return true;
    case "hdWallThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 4, "encounter"));
      log(
        s,
        "Deeping Wall is explored: each player raises his threat by 4.",
        "danger",
      );
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

const ladders = (s: GameState) =>
  allActiveLocations(s).reduce(
    (n, l) =>
      n +
      l.attachments.filter((a) => a.code === HD.ladders && !a.blanked).length,
    0,
  );

export const HELMS_DEEP_HOOKS: Batch4ScenarioHooks = {
  setup: setupHelmsDeep,
  // 1A: the players choose once the opening hands are kept.
  openingHandsKept: (s) => {
    if (!s.helmsDeep || s.round > 0) return false;
    prepend(
      s,
      fx("hdCounselsChoice", { player: firstPlayer(s) }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: helmsDeepStageInfo,
  check: (s) => {
    if (s.helmsDeep) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  attackFinished,
  // Poisoned Counsels: after you draw it, discard all other cards in your hand.
  cardsDrawn: (s, player, count) => {
    if (!s.helmsDeep) return;
    const drawn = s.hand.slice(-count);
    if (!drawn.some((u) => u.code === HD.counsels)) return;
    const others = s.hand.filter((u) => u.code !== HD.counsels);
    if (!others.length) return;
    s.hand = s.hand.filter((u) => u.code === HD.counsels);
    s.discard.push(...others.map((u) => u.code));
    log(
      s,
      `Poisoned Counsels: ${who(s, player)} ${verb(s, "discard")} all other cards in ${s.table ? "their" : "your"} hand (${others.length}).`,
      "danger",
    );
  },
  // 1B and 5B: skip the quest phase.
  skipQuestPhase: (s) =>
    !!s.helmsDeep &&
    [HD.king, HD.rides].includes(s.helmsDeep.currentQuest as never) &&
    stageLive(s),
  // Defense: a failed quest places progress instead of raising threat.
  failedQuest: (s, amount) => {
    const q = s.helmsDeep;
    if (!q || !defending(s)) return false;
    const before = s.progress;
    log(
      s,
      `Defense: the players do not raise their threat; the first player places ${amount} progress on the current quest.`,
      "danger",
    );
    encounterProgress(s, amount);
    if (s.progress > before) q.questProgress = s.round;
    return true;
  },
  // The Defense of Helm's Deep; 3B after resolving the quest.
  endQuest: (s) => {
    const q = s.helmsDeep;
    if (!q) return;
    const first = firstPlayer(s);
    prepend(
      s,
      ...(q.currentQuest === HD.hosts
        ? [fx("hdHostsReveal", { player: first })]
        : []),
      ...(helmsDeepDefense(s) ? [fx("hdDefenseToken", { player: first })] : []),
    );
  },
  // 2B: at the end of the combat phase, a card if the staging area has fewer enemies than players.
  combatEnd: (s) => {
    const q = s.helmsDeep;
    if (q?.currentQuest === HD.assault && stageLive(s))
      prepend(s, fx("hdAssaultCombat", { player: firstPlayer(s) }));
  },
  roundEnd: (s) => {
    const q = s.helmsDeep;
    if (!q) return [];
    const first = firstPlayer(s);
    return [
      ...(q.currentQuest === HD.assault && stageLive(s)
        ? [fx("hdAssaultRound", { player: first })]
        : []),
      ...(q.currentQuest === HD.king && stageLive(s)
        ? [fx("hdStageOneEnd", { player: first })]
        : []),
    ];
  },
  // The Defense of Helm's Deep: +1 threat for each resource token.
  stagingThreat: (s) =>
    s.helmsDeep
      ? (helmsDeepDefense(s)?.blanked
          ? 0
          : (helmsDeepDefense(s)?.resources ?? 0)) + whiteHandStagingThreat(s)
      : 0,
  // Deeping Culvert: X is 1 more than the first player's allies.
  // Scaling Ladders: each enemy gets +1 threat.
  threatBonus: (s, u) => {
    if (!s.helmsDeep) return 0;
    if (live(u, HD.culvert))
      return 1 + seatView(s, firstPlayer(s)).allies.length;
    if (isEnemy(u)) return ladders(s);
    return 0;
  },
  // Deeping Wall: heroes +1 defense; Postern Door: heroes +1 attack.
  // Helm's Gate explored: each enemy +2 attack until the end of the round.
  stats: (s, u) => {
    const q = s.helmsDeep;
    if (!q) return {};
    if (isEnemy(u)) return q.gate === s.round ? { attack: 2 } : {};
    if (!isHero(u)) return {};
    return {
      ...(activeIs(s, HD.wall) ? { defense: 1 } : {}),
      ...(activeIs(s, HD.postern) ? { attack: 1 } : {}),
    };
  },
  engagementBonus: (s, u) =>
    s.helmsDeep?.gate === s.round && isEnemy(u) ? -20 : 0,
  // Devilry of Saruman: each character's text box is blank until the end of the round.
  characterBlanked: (s, u) =>
    s.helmsDeep?.devilry === s.round && isCharacter(u),
  // Postern Door explored: the players cannot declare attacks this round.
  cannotAttack: (s) => s.helmsDeep?.postern === s.round,
  attackProblem: (s) =>
    s.helmsDeep?.postern === s.round
      ? "Postern Door: until the end of the round, players cannot declare attacks."
      : null,
  // 5B: players cannot reduce their threat.
  cannotReduceThreat: (s) =>
    s.helmsDeep?.currentQuest === HD.rides && stageLive(s),
  // Toughness X (and Devilry of Saruman's shadow).
  damageAmount: (s, u, amount) => {
    const q = s.helmsDeep;
    if (!q || !isEnemy(u) || amount <= 0) return amount;
    const t =
      (u.blanked ? 0 : whiteHandToughness(u.code)) +
      (q.devilryShadow?.round === s.round && q.devilryShadow.ids.includes(u.id)
        ? 2
        : 0);
    if (!t) return amount;
    const reduced = Math.max(0, amount - t);
    log(
      s,
      `Toughness ${t}: the damage dealt to ${name(u)} is reduced to ${reduced}.`,
    );
    return reduced;
  },
  // Archery X from the staging area; The Hornburg reduces it by 1 for each player.
  combatBegin: (s) => {
    if (!s.helmsDeep) return;
    let archery = s.staging.reduce(
      (n, x) => n + (x.blanked ? 0 : whiteHandArchery(x.code)),
      0,
    );
    if (activeIs(s, HD.hornburg)) archery = Math.max(0, archery - players(s));
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  explored: (s, u) => {
    const q = s.helmsDeep;
    if (!q || u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === HD.hornburg) {
      const x = enemiesInPlay(s).length;
      if (x) prepend(s, fx("hdHornburg", { value: x, player: first }));
    }
    if (u.code === HD.wall) prepend(s, fx("hdWallThreat", { player: first }));
    if (u.code === HD.culvert)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("hdCulvert", { player })),
        fx("hdShuffle", { text: "Deeping Culvert", player: first }),
      );
    if (u.code === HD.postern) {
      q.postern = s.round;
      log(
        s,
        "Postern Door is explored: until the end of the round, players cannot declare attacks.",
        "danger",
      );
    }
    if (u.code === HD.gate) {
      q.gate = s.round;
      log(
        s,
        "Helm's Gate is explored: each enemy gets -20 engagement cost and +2 attack until the end of the round.",
        "danger",
      );
    }
  },
  // 4B: after a character is destroyed, 1 progress here.
  characterDestroyed: (s, u, context) => {
    const q = s.helmsDeep;
    if (!q || !isCharacter(u)) return;
    if (q.currentQuest === HD.breached && stageLive(s))
      prepend(s, fx("hdBreachedProgress", { player: firstPlayer(s) }));
    const c = s.combat;
    if (c && context.combatDamage && context.enemyId === c.enemyId)
      c.hdKilled = true;
    whiteHandCharacterDestroyed(s, u, context);
  },
  effect: helmsDeepEffect,
  sharedEffect: (e) =>
    [
      "hdDefeat",
      "hdNextStage",
      "hdStageTwo",
      "hdStageOneEnd",
      "hdStageFive",
      "hdBypass",
      "hdCounsels",
      "hdTreacheryDone",
      "hdNightToken",
      "hdDefenseToken",
      "hdHostsReveal",
      "hdAssaultCombat",
      "hdAssaultRound",
      "hdBreachedProgress",
      "hdActiveProgress",
      "hdQuestProgress",
      "hdShuffle",
      "hdWallThreat",
      "uhShuffle",
    ].includes(e.kind),
};
