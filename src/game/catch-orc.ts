import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  characters,
  choose,
  encounterDraw,
  fx,
  get,
  locationQuest,
  log,
  make,
  opts,
  prepend,
  questWill,
  random,
  shuffle,
  stagingThreat,
  takePlayerDeck,
} from "./core";
import {
  engage,
  enemyAddedToStaging,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { currentQuestCode } from "./quest-state";
import { hasTrait } from "./expansion-passives";
import { foundationsPlayerCardDiscarded } from "./foundations-player-cards";
import { ringMakerCharacterLeft } from "./ring-maker-player";
import { finalRingReplacesQuestProgress } from "./ring-maker-final-player";
import { canLeaveHand } from "./hand-rules";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { questTime } from "./quest-time";
import { CATCH_ORC as C } from "./catch-orc-support";

const liveEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
export const mugashCarrier = (s: GameState) =>
  allHeroes(s).find((h) => h.attachments.some((a) => a.code === C.mugash));
const mugashInPlay = (s: GameState) =>
  !!mugashCarrier(s) || liveEnemies(s).some((u) => u.code === C.mugash);
const isOrc = (u: Unit) =>
  card(u.code).type_code === "enemy" && hasTrait(u, "Orc");
const lose = (s: GameState, reason: string) => {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
};

export function setupCatchOrc(s: GameState) {
  s.catchOrc = {
    initialized: false,
    time: 0,
    decks: {},
    searched: [],
    setAside: [],
  };
}
/** Scenario setup follows every player's keep/mulligan decision. */
export function catchOpeningHandsKept(s: GameState) {
  if (!s.catchOrc || s.catchOrc.initialized) return false;
  prepend(s, fx("catchSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
function addHiddenEnemy(s: GameState, enemy: Unit) {
  delete enemy.owner;
  s.staging.push(enemy);
  log(s, `${name(enemy)} is found and added to the staging area.`, "danger");
  enemyAddedToStaging(s, enemy);
}
function discardSearched(s: GameState, u: Unit, searchingPlayer: number) {
  forOwner(s, u.owner ?? searchingPlayer, () => {
    s.discard.push(u.code);
    foundationsPlayerCardDiscarded(s, u);
  });
}
export function catchPlayerEliminated(s: GameState, player: number) {
  if (!s.catchOrc) return;
  const q = s.catchOrc;
  for (const u of q.decks[player] ?? []) {
    if (card(u.code).sphere_code === "encounter") q.setAside.push(u);
    else discardSearched(s, u, player);
  }
  q.decks[player] = [];
  // Revealed search cards belong to the active choice and are settled before elimination continues.
  if (activeSeat(s) === player) {
    for (const u of q.searched) discardSearched(s, u, player);
    q.searched = [];
  }
}
export function catchCheck(s: GameState) {
  if (!s.catchOrc || s.status !== "playing") return;
  const hero = mugashCarrier(s);
  if (!hero) return;
  const player = ownerOf(s, hero);
  for (const enemy of liveEnemies(s).filter(
    (u) => u.code === C.guard && !u.blanked,
  ))
    if (!seatView(s, player).engaged.some((u) => u.id === enemy.id))
      forOwner(s, player, () => engage(s, enemy));
}
export function advanceCatchOrc(s: GameState) {
  if (!s.catchOrc) return false;
  if (
    s.stage !== 3 ||
    s.progress < 15 ||
    !mugashCarrier(s) ||
    s.queue.length ||
    s.choice ||
    s.stageRevealing
  )
    return true;
  if (questDefeated(s, currentQuestCode(s)!)) return true;
  win(s);
  s.reason =
    "Mugash is captured. You carry the Wizard's prize back to Isengard.";
  return true;
}
export const catchProgressBlocked = (s: GameState) =>
  !!s.catchOrc && s.stage === 3 && !mugashCarrier(s);
export const catchLocationProgressBlocked = (s: GameState, u: Unit) =>
  s.staging.some((l) => l.id === u.id) &&
  s.staging.some((l) => l.code === C.lands && !l.blanked);
export const catchCannotReady = (u: Unit) =>
  u.attachments.some((a) => a.code === C.mugash && !a.blanked);
export function catchAttachmentLeaves(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving: boolean,
) {
  if (
    a.code === C.mugash &&
    leaving &&
    !a.blanked &&
    card(u.code).type_code === "hero"
  )
    lose(
      s,
      `${name(u)} has left play while guarding Mugash. The captive escapes.`,
    );
}
export function catchEnemyDefeated(s: GameState, u: Unit, defeated: boolean) {
  if (!s.catchOrc || u.code !== C.mugash || u.blanked || !defeated)
    return false;
  s.catchOrc.capturing = { ...u, shadows: [], damage: 0, attachments: [] };
  prepend(s, fx("catchCapture", { player: firstPlayer(s) }));
  return true;
}
export function catchCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const enemy = get(s, context.enemyId);
  if (
    context.combatDamage &&
    enemy?.code === C.guard &&
    !enemy.blanked &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
    mugashCarrier(s)
  )
    prepend(s, fx("catchEscape", { player: firstPlayer(s) }));
}
export function catchAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (enemy.code === C.methedrasOrc && !enemy.blanked && s.catchOrc)
    prepend(s, fx("catchRandomHand", { player }));
}
export const catchAttackBonus = (s: GameState, u: Unit) =>
  u.code === C.wolf && !u.blanked && allEngaged(s).some((e) => e.id === u.id)
    ? s.staging.filter((l) => card(l.code).type_code === "location").length
    : 0;
export const catchThreatBonus = (s: GameState, u: Unit) =>
  card(u.code).type_code === "location" && s.staging.some((l) => l.id === u.id)
    ? allActiveLocations(s).filter((l) => l.code === C.methedras && !l.blanked)
        .length
    : 0;
export function catchExplored(s: GameState, u: Unit) {
  if (u.blanked || !s.catchOrc) return;
  if (u.code === C.methedras)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("catchSearch", { player, value: 3 }),
      ),
    );
  if (u.code === C.cave)
    prepend(s, fx("catchSearch", { player: firstPlayer(s), value: 5 }));
}
export function catchEncounterStart(s: GameState) {
  if (!s.catchOrc) return;
  const effects = locations(s)
    .filter((u) => u.code === C.lair && !u.blanked)
    .flatMap(() =>
      playerOrder(s).map((player) =>
        fx("catchSearch", { value: 1, flag: true, player }),
      ),
    );
  prepend(s, ...effects);
}
export function catchTravel(s: GameState, u: Unit): Effect[] | undefined {
  return u.code === C.cave && !u.blanked
    ? [fx("catchCaveTravel", { player: firstPlayer(s) })]
    : undefined;
}
export function catchEngaged(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === C.hound)
    prepend(s, fx("catchExhaust", { player: activeSeat(s), code: u.code }));
  if (u.code === C.skirmisher)
    prepend(s, fx("catchSkirmisher", { player: activeSeat(s) }));
}
export function catchEncounter(s: GameState, code: string, replay = false) {
  if (code === C.hunter)
    prepend(s, fx("catchHunter", { player: firstPlayer(s) }));
  else if (code === C.cover)
    prepend(s, fx("catchCover", { player: firstPlayer(s) }));
  else if (code === C.territory)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("catchLocationSearch", { player })),
      fx("catchTerritoryAttacks", { player: firstPlayer(s) }),
    );
  else if (code === C.party) {
    // This conditional Surge is part of the When Revealed effect and is cancelled with it.
    if (!s.staging.some(isOrc))
      prepend(s, fx("amonSurgeWindow", { code }), fx("reveal"));
    for (const u of liveEnemies(s).filter(isOrc)) {
      const shadow = encounterDraw(s, true);
      if (shadow) u.shadows.push(shadow);
      u.tempEngagement = (u.tempEngagement ?? 0) - 15;
    }
  } else return false;
  if (card(code).type_code === "treachery" && !replay)
    s.encounterDiscard.push(code);
  return true;
}
export function catchShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === C.methedrasOrc) c.timeOnKill = (c.timeOnKill ?? 0) + 1;
  else if (code === C.skirmisher) c.attackBonus++;
  else if (code === C.hunter) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === C.lair)
    prepend(s, fx("fordsDiscardAttachments", { player }));
  else if (code === C.wolf) prepend(s, fx("catchExhaust", { player, code }));
  else if (code === C.lands)
    c.attackBonus += s.staging.filter(
      (l) => card(l.code).type_code === "location",
    ).length;
  else return false;
  return true;
}

export function catchEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("catch")) return false;
  const q = s.catchOrc;
  switch (e.kind) {
    case "catchSetup": {
      if (!q || q.initialized) break;
      q.initialized = true;
      s.encounterDeck = s.encounterDeck.filter(
        (code) => ![C.mugash, C.guard].includes(code),
      );
      const players = playerOrder(s),
        enemies = shuffle(s, [
          make(s, C.mugash),
          ...players.slice(1).map(() => make(s, C.guard)),
        ]);
      q.setAside = Array.from({ length: 4 - players.length }, () =>
        make(s, C.guard),
      );
      for (const [i, player] of players.entries())
        forOwner(s, player, () => {
          q.decks[player] = Array.from(
            { length: Math.min(20, s.deck.length) },
            () => takePlayerDeck(s),
          );
          q.decks[player].push(enemies[i]);
          shuffle(s, q.decks[player]);
        });
      prepend(
        s,
        ...players.map((player) =>
          fx("catchLocationSearch", { flag: true, player }),
        ),
        fx("catchStageTwo", { player: firstPlayer(s) }),
      );
      log(
        s,
        "Each fellowship sets aside twenty cards and one unknown enemy in its out-of-play deck.",
      );
      break;
    }
    case "catchStageTwo":
      if (q) {
        shuffle(s, s.encounterDeck);
        s.stage = 2;
        s.progress = 0;
        q.time = 2;
      }
      break;
    case "catchLocationSearch": {
      const options = (
        ["deck", ...(e.flag ? [] : ["discard"])] as string[]
      ).flatMap((zone) => {
        const pool = zone === "deck" ? s.encounterDeck : s.encounterDiscard;
        return [...new Set(pool)]
          .filter(
            (code) =>
              card(code).type_code === "location" &&
              (!e.flag || /\bMountain\b/.test(card(code).traits ?? "")),
          )
          .map((code) => ({
            id: `${zone}:${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("catchTakeLocation", { code, text: zone })],
          }));
      });
      if (options.length)
        choose(
          s,
          e.flag
            ? "Orders from Orthanc · Choose a Mountain"
            : "Orc Territory · Choose a location",
          options,
        );
      break;
    }
    case "catchTakeLocation": {
      const pool = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const index = pool.indexOf(e.code!);
      if (index >= 0) {
        pool.splice(index, 1);
        placeEncounter(s, e.code!, true);
      }
      break;
    }
    case "catchSearch": {
      if (!q) break;
      const player = activeSeat(s),
        found = (q.decks[player] ?? []).splice(0, e.value ?? 0);
      const enemies = found.filter((u) => card(u.code).type_code === "enemy");
      q.searched = found.filter((u) => card(u.code).type_code !== "enemy");
      prepend(s, fx("catchSearchChoose", { player, flag: e.flag }));
      for (const enemy of enemies) addHiddenEnemy(s, enemy);
      log(
        s,
        `${e.flag ? "Mugash's Lair reveals" : "Search reveals"} ${found.length} cards from player ${player + 1}'s out-of-play deck.`,
      );
      break;
    }
    case "catchSearchChoose":
      if (!q) break;
      if (e.flag || !q.searched.length) {
        for (const u of q.searched) discardSearched(s, u, activeSeat(s));
        q.searched = [];
      } else
        choose(
          s,
          "Search · Take one player card into your hand",
          opts(q.searched, (u) => [fx("catchSearchTake", { target: u.id })]),
        );
      break;
    case "catchSearchTake":
      if (q) {
        for (const u of q.searched) {
          if (u.id === e.target) s.hand.push(u);
          else discardSearched(s, u, activeSeat(s));
        }
        q.searched = [];
      }
      break;
    case "catchQuestResponse": {
      if (!q || s.stage !== 2 || finalRingReplacesQuestProgress(s)) break;
      const buffer = allActiveLocations(s).reduce(
        (n, u) => n + Math.max(0, locationQuest(s, u) - u.progress),
        0,
      );
      if ((e.value ?? 0) <= buffer) break;
      choose(
        s,
        "Searching for Mugash · Successful quest",
        [
          {
            id: "time",
            label: "Cancel quest progress and add 1 time counter",
            effects: [fx("catchQuestTime")],
          },
          ...(mugashInPlay(s)
            ? [
                {
                  id: "advance",
                  label: "Cancel quest progress and advance to stage 3",
                  effects: [fx("catchAdvance")],
                },
              ]
            : []),
          { id: "skip", label: "Do not use the quest response", effects: [] },
        ],
        "Active locations still receive progress. Mugash must already be in play to advance now.",
      );
      break;
    }
    case "catchQuestTime":
      if (q) {
        q.cancelQuestProgress = true;
        q.time++;
      }
      break;
    case "catchAdvance":
      if (q && s.stage === 2 && mugashInPlay(s)) {
        const pending = s.queue.length;
        if (questDefeated(s, currentQuestCode(s)!)) {
          s.queue.splice(s.queue.length - pending, 0, e);
          break;
        }
        s.stage = 3;
        s.progress = 0;
        q.time = 3;
        q.cancelQuestProgress = true;
        log(
          s,
          "The Wizard's Prize · Capture Mugash and return to Isengard.",
          "chapter",
        );
      }
      break;
    case "catchQuestProgressDone":
      if (q) delete q.cancelQuestProgress;
      break;
    case "catchTimeExpired":
      if (!q || s.stage !== e.value || q.time) break;
      if (s.stage === 2) {
        s.encounterDeck.push(...s.encounterDiscard.splice(0));
        shuffle(s, s.encounterDeck);
        prepend(
          s,
          ...Array.from({ length: 2 * playerOrder(s).length }, () =>
            fx("reveal", { player: firstPlayer(s) }),
          ),
          fx("catchResetTime", { value: s.stage, player: firstPlayer(s) }),
        );
      } else if (s.stage === 3)
        prepend(
          s,
          fx("catchEscape"),
          ...Array.from(
            { length: Math.max(0, playerOrder(s).length - 1) },
            () => fx("reveal", { player: firstPlayer(s) }),
          ),
          fx("catchResetTime", { value: s.stage, player: firstPlayer(s) }),
        );
      break;
    case "catchResetTime":
      if (q && s.stage === e.value) q.time = s.stage === 2 ? 2 : 3;
      break;
    case "catchCapture":
      if (q?.capturing)
        choose(
          s,
          "Capture Mugash · Choose a hero",
          opts(s.heroes, (u) => [fx("catchAttach", { target: u.id })]),
          "The first player's hero guards the captive and cannot ready. Losing that hero loses the game.",
        );
      break;
    case "catchAttach": {
      const hero = get(s, e.target);
      if (q?.capturing && hero && card(hero.code).type_code === "hero") {
        hero.attachments.push({
          id: q.capturing.id,
          code: C.mugash,
          exhausted: false,
        });
        delete q.capturing;
        exhaustCharacter(s, hero);
        log(s, `${name(hero)} captures Mugash.`, "good");
      }
      break;
    }
    case "catchEscape": {
      const hero = mugashCarrier(s);
      if (hero) {
        const attached = hero.attachments.find((a) => a.code === C.mugash)!;
        hero.attachments = hero.attachments.filter((a) => a.id !== attached.id);
        const enemy = make(s, C.mugash);
        enemy.id = attached.id;
        addHiddenEnemy(s, enemy);
        log(
          s,
          "Mugash escapes his captor and returns to the staging area.",
          "danger",
        );
      } else {
        const enemy = allEngaged(s).find((u) => u.code === C.mugash);
        if (enemy) {
          forOwner(
            s,
            ownerOf(s, enemy),
            () => (s.engaged = s.engaged.filter((u) => u.id !== enemy.id)),
          );
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
        }
      }
      break;
    }
    case "catchRandomHand": {
      if (!q || !s.hand.length) break;
      const index = Math.floor(random(s) * s.hand.length),
        u = s.hand[index];
      if (!canLeaveHand(u)) break;
      s.hand.splice(index, 1);
      ringMakerCharacterLeft(s, u.id);
      (q.decks[activeSeat(s)] ??= []).push(u);
      shuffle(s, q.decks[activeSeat(s)]);
      log(
        s,
        "Methedras Orc shuffles a random hand card into the out-of-play deck.",
        "danger",
      );
      break;
    }
    case "catchTerritoryAttacks":
      shuffle(s, s.encounterDeck);
      if (stagingThreat(s) < questWill(s))
        prepend(
          s,
          ...allEngaged(s)
            .filter(isOrc)
            .map((u) =>
              fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
            ),
        );
      break;
    case "catchCaveTravel": {
      const discarded = s.encounterDeck.splice(0, playerOrder(s).length);
      for (const code of discarded) {
        if (
          card(code).type_code === "enemy" &&
          /\bOrc\b/.test(card(code).traits ?? "")
        )
          placeEncounter(s, code, true);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "catchHunter":
      choose(s, "Orc Hunter", [
        {
          id: "reveal",
          label: "Reveal another encounter card",
          effects: [fx("reveal")],
        },
        ...(questTime(s)?.time
          ? [
              {
                id: "time",
                label: "Remove 1 time counter",
                effects: [fx("removeQuestTime")],
              },
            ]
          : []),
      ]);
      break;
    case "catchSkirmisher":
      choose(s, "Orc Skirmisher", [
        ...opts(
          characters(s),
          (u) => [fx("damage", { target: u.id, value: 3 })],
          () => "Deal 3 damage",
        ),
        ...(questTime(s)?.time
          ? [
              {
                id: "time",
                label: "Remove 1 time counter",
                effects: [fx("removeQuestTime")],
              },
            ]
          : []),
      ]);
      break;
    case "catchCover":
      choose(s, "Take Cover!", [
        {
          id: "damage",
          label: "Deal 1 damage to each exhausted character",
          effects: [fx("catchCoverDamage")],
        },
        ...(questTime(s)?.time
          ? [
              {
                id: "time",
                label: "Remove 1 time counter",
                effects: [fx("removeQuestTime")],
              },
            ]
          : []),
      ]);
      break;
    case "catchCoverDamage":
      prepend(
        s,
        ...allCharacters(s)
          .filter((u) => u.exhausted)
          .map((u) =>
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
          ),
      );
      break;
    case "catchExhaust": {
      const ready = characters(s).filter(
        (u) =>
          !u.exhausted &&
          !khazadCannotExhaust(u) &&
          !watcherWaterCannotExhaust(u),
      );
      if (ready.length)
        choose(
          s,
          `${card(e.code ?? C.hound).name} · Exhaust a character`,
          opts(ready, (u) => [fx("catchExhaustChosen", { target: u.id })]),
        );
      break;
    }
    case "catchExhaustChosen": {
      const u = get(s, e.target);
      if (u) exhaustCharacter(s, u);
      break;
    }
    default:
      return false;
  }
  return true;
}
