import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  engage,
  exhaustCharacter,
  readyCharacter,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { hasTrait } from "./expansion-passives";
import { whiteHandArchery } from "./white-hand";
import { returnToStaging } from "./black-riders-hunted";
import {
  CROSS_ROADS_RECIPES,
  JTC,
  JTC_BLACK_GATE_BASE,
  JTC_CROSSROADS_PROGRESS,
  JTC_OLIPHAUNT_DAMAGE,
  crossRoadsStageInfo,
} from "./cross-roads-support";
export * from "./cross-roads-support";

/**
 * Journey to the Cross-roads, the second scenario of The Land of Shadow.
 * The Men of Harad lie facedown under The Cross-roads, one revealed at the
 * beginning of each quest phase; Harad enemies left in the staging area at
 * the end of the planning phase go facedown under The Black Gate, and with 3
 * more of them than there are players the players lose. With 20 progress on
 * its only stage and no card left under it, the players travel to The
 * Cross-roads and win when they explore it.
 */
const TREACHERIES: readonly string[] = [
  JTC.summons,
  JTC.arrows,
  JTC.marching,
  JTC.southrons,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const traitOf = (c: string, trait: string) =>
  (card(c).traits ?? "").split(".").some((t) => t.trim() === trait);
const isHaradCode = (c: string) =>
  card(c).type_code === "enemy" && traitOf(c, "Harad");
const isHarad = (u: Unit) => isEnemy(u) && hasTrait(u, "Harad");
const isLocationCode = (c: string) => card(c).type_code === "location";
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const Who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "You");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const players = (s: GameState) => globalPlayerOrder(s).length;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(l, code));
/** Henneth Annûn: the Forced effects of 1B and The Black Gate are ignored. */
const refuge = (s: GameState) => activeIs(s, JTC.henneth);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
export const blackGateLimit = (s: GameState) =>
  JTC_BLACK_GATE_BASE + players(s);
const blackGate = (s: GameState) =>
  s.staging.find((u) => u.code === JTC.blackGate);
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** The round's counters: Arrows Thick in the Air and Captain of Harad. */
const roundCount = (s: GameState, m?: { round: number; count: number }) =>
  m && m.round === s.round ? m.count : 0;
/** An enemy in play, wherever it is. */
const enemyUnit = (s: GameState, id?: string) =>
  id
    ? (get(s, id) ??
      [...s.staging, ...globalEngaged(s)].find((u) => u.id === id))
    : undefined;
/**
 * Place an enemy in play facedown under The Black Gate: it leaves play, its
 * shadow cards are discarded and its attachments go to their owners.
 */
function underGate(s: GameState, u: Unit, text: string) {
  const q = s.crossRoads!;
  const staged = s.staging.some((x) => x.id === u.id);
  const owner = staged ? undefined : ownerOf(s, u);
  if (!staged && !globalEngaged(s).some((x) => x.id === u.id)) return false;
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  if (staged) s.staging = s.staging.filter((x) => x.id !== u.id);
  else
    forOwner(s, owner!, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  q.underBlackGate.push(u.code);
  log(
    s,
    `${text}: ${name(u)} is placed facedown under The Black Gate (${q.underBlackGate.length} of ${blackGateLimit(s)}).`,
    "danger",
  );
  return true;
}
/** Reveal the top facedown card from under The Cross-roads. */
function takeUnderCrossroads(s: GameState) {
  return s.crossRoads!.underCrossroads.shift();
}

// ---------------------------------------------------------------------------
// Setup and the quest.

export function setupCrossRoads(s: GameState) {
  const r = CROSS_ROADS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: The Black Gate and The Cross-roads are added to the staging area,
  // and the Men of Harad lie facedown under The Cross-roads.
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.crossRoads = {
    currentQuest: JTC.ambush,
    resolving: [],
    underCrossroads: shuffle(s, section("sharedEncounterDeck2")),
    underBlackGate: [],
  };
  log(
    s,
    "Ambush the Men of Harad: The Black Gate and The Cross-roads are added to the staging area, with the Men of Harad facedown under The Cross-roads.",
    "chapter",
  );
}
/** The stage is never defeated: exploring The Cross-roads wins the game. */
function advance(s: GameState) {
  return !!s.crossRoads;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.crossRoads;
  if (!q || !TREACHERIES.includes(code)) return false;
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
  const player = activeSeat(s);
  prepend(
    s,
    fx("jtcTreachery", { code, source: u.id, player }),
    fx("jtcTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, code: string) {
  const q = s.crossRoads!;
  const p = activeSeat(s);
  const first = firstPlayer(s);
  switch (code) {
    case JTC.summons:
      prepend(s, fx("jtcSummons", { player: p }));
      return;
    case JTC.arrows: {
      const count = roundCount(s, q.arrows) + 1;
      q.arrows = { round: s.round, count };
      log(
        s,
        "Arrows Thick in the Air: each Harad enemy gains Archery 2 until the end of the round.",
        "danger",
      );
      return;
    }
    case JTC.marching:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("jtcMarching", { player })),
        fx("jtcShuffle", { text: "Marching Up the Road", player: first }),
      );
      return;
    case JTC.southrons:
      prepend(s, fx("jtcSouthrons", { player: p }));
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.crossRoads) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case JTC.oliphaunt:
      c.attackBonus += 3;
      log(s, "Oliphaunt: the attacking enemy gets +3 attack.", "danger");
      return true;
    case JTC.soldier:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Haradrim Soldier: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case JTC.archer: {
      const defender = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      if (!defender) {
        log(s, "Haradrim Archer: there is no defending character.");
        return true;
      }
      log(
        s,
        `Haradrim Archer: 1 damage is dealt to ${name(defender)}.`,
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
    case JTC.man:
      prepend(s, fx("jtcRandomDiscard", { text: "Man of Harad", player: p }));
      return true;
    case JTC.captain:
      c.jtcReturnOnKill = true;
      log(
        s,
        "Captain of Harad: if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
    case JTC.arrows:
      prepend(s, fx("jtcArrowsShadow", { target: c.enemyId, player: p }));
      return true;
    case JTC.marching:
      c.attackBonus += 1;
      c.jtcGateOnKill = true;
      log(
        s,
        "Marching Up the Road: the attacking enemy gets +1 attack; if this attack destroys a character, it is placed facedown under The Black Gate.",
        "danger",
      );
      return true;
    case JTC.hills:
      prepend(s, fx("jtcDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}
function attackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped?: boolean,
) {
  const q = s.crossRoads;
  if (!q || skipped) return [];
  const effects: Effect[] = [];
  const enemy = enemyUnit(s, c.enemyId);
  if (c.jtcGateAfter && enemy)
    effects.push(
      fx("jtcUnderGate", {
        target: enemy.id,
        text: "Arrows Thick in the Air",
        player: c.attackPlayer ?? firstPlayer(s),
      }),
    );
  if (c.jtcKilled && enemy) {
    if (c.jtcGateOnKill)
      effects.push(
        fx("jtcUnderGate", {
          target: enemy.id,
          text: "Marching Up the Road",
          player: c.attackPlayer ?? firstPlayer(s),
        }),
      );
    else if (c.jtcReturnOnKill)
      effects.push(
        fx("jtcReturn", {
          target: enemy.id,
          text: "Captain of Harad",
          player: c.attackPlayer ?? firstPlayer(s),
        }),
      );
  }
  return effects;
}

// ---------------------------------------------------------------------------
// Effects.

/** "Search the encounter deck for ...": one option per card. */
function searchOptions(
  s: GameState,
  match: (code: string) => boolean,
  kind: string,
  player: number,
): Option[] {
  return [...new Set(s.encounterDeck.filter(match))].map((code) => ({
    id: `deck-${code}`,
    code,
    label: `${card(code).name} · encounter deck`,
    effects: [fx(kind, { code, player })],
  }));
}
function takeFromDeck(s: GameState, code?: string) {
  if (!code) return false;
  const i = s.encounterDeck.lastIndexOf(code);
  if (i < 0) return false;
  s.encounterDeck.splice(i, 1);
  return true;
}
/** The Harad enemies with the lowest value of a statistic. */
function lowest(units: Unit[], value: (u: Unit) => number) {
  const min = Math.min(...units.map(value));
  return units.filter((u) => value(u) === min);
}

export function crossRoadsEffect(s: GameState, e: Effect): boolean {
  const q = s.crossRoads;
  if (!q || !e.kind.startsWith("jtc")) return false;
  const p = e.player ?? activeSeat(s);
  const u = enemyUnit(s, e.target) ?? (e.target ? get(s, e.target) : undefined);
  switch (e.kind) {
    case "jtcTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code);
      return true;
    }
    case "jtcTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "jtcShuffle":
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.text ?? "Journey to the Cross-roads"}: the encounter deck is shuffled.`,
      );
      return true;
    // Setup (1A): each player but the first adds a different non-unique location.
    case "jtcSetupSearch": {
      const staged = new Set(s.staging.map((x) => card(x.code).name));
      const options = searchOptions(
        s,
        (c) =>
          isLocationCode(c) && !card(c).is_unique && !staged.has(card(c).name),
        "jtcSetupAdd",
        p,
      );
      if (!options.length) {
        log(
          s,
          `Ambush the Men of Harad: ${who(s, p)} find${s.table ? "s" : ""} no different non-unique location.`,
        );
        return true;
      }
      choose(
        s,
        `Ambush the Men of Harad · Add a location to the staging area${seatLabel(s, p)}`,
        options,
        "Setup: each player, except the first player, searches the encounter deck for a different non-unique location and adds it to the staging area.",
      );
      return true;
    }
    case "jtcSetupAdd": {
      if (!takeFromDeck(s, e.code)) return true;
      s.staging.push(make(s, e.code!));
      log(
        s,
        `${Who(s, p)} ${verb(s, "add")} ${card(e.code!).name} to the staging area.`,
        "danger",
      );
      return true;
    }
    // 1B and Southward Road: the top facedown card under The Cross-roads.
    case "jtcRevealUnder": {
      const code = takeUnderCrossroads(s);
      if (!code) {
        log(
          s,
          `${e.text ?? "The Cross-roads"}: there is no facedown card under The Cross-roads.`,
        );
        return true;
      }
      log(
        s,
        `${e.text ?? "The Cross-roads"}: ${card(code).name} is revealed from under The Cross-roads (${q.underCrossroads.length} left).`,
        "danger",
      );
      revealed(s, code, undefined, "power");
      return true;
    }
    // The Black Gate, at the end of the planning phase.
    case "jtcBlackGate": {
      if (refuge(s) || !blackGate(s)) return true;
      const harad = s.staging.filter(isHarad);
      if (!harad.length) {
        log(s, "The Black Gate: no Harad enemy is in the staging area.");
        return true;
      }
      for (const x of harad) underGate(s, x, "The Black Gate");
      return true;
    }
    case "jtcUnderGate":
      if (u) underGate(s, u, e.text ?? "The Black Gate");
      return true;
    case "jtcReturn":
      if (u) returnToStaging(s, u);
      return true;
    // Travel costs.
    case "jtcEngageStaged": {
      const enemies = s.staging.filter((x) => isEnemy(x));
      if (!enemies.length) return true;
      choose(
        s,
        `Foothills of Ephel Dúath · Engage an enemy in the staging area${seatLabel(s, p)}`,
        enemies.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("jtcEngage", { target: x.id, player: p })],
        })),
        "Travel: the first player engages an enemy in the staging area to travel here.",
      );
      return true;
    }
    case "jtcEngage":
      if (u && s.staging.some((x) => x.id === u.id)) engage(s, u);
      return true;
    // Henneth Annûn: each engaged enemy returns to the staging area.
    case "jtcRefuge": {
      const engaged = globalEngaged(s);
      if (!engaged.length) {
        log(s, "Henneth Annûn: no enemy is engaged.");
        return true;
      }
      for (const x of engaged) returnToStaging(s, x);
      return true;
    }
    // Engagement Forced effects.
    case "jtcRandomDiscard": {
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
    case "jtcExhaustAllies": {
      const allies = s.allies.filter((x) => !x.exhausted);
      for (const x of allies) exhaustCharacter(s, x);
      log(
        s,
        allies.length
          ? `Oliphaunt: ${allies.map((x) => name(x)).join(", ")} ${allies.length === 1 ? "is" : "are"} exhausted.`
          : `Oliphaunt: ${who(s, p)} ${s.table ? "controls" : "control"} no ready ally.`,
        "danger",
      );
      return true;
    }
    case "jtcAssign": {
      const remaining = e.value ?? 0;
      const targets = [...s.heroes, ...s.allies].filter(
        (x) => x.damage < stats(s, x).health,
      );
      if (remaining <= 0 || !targets.length) return true;
      choose(
        s,
        `Haradrim Archer · Assign damage · ${remaining} remaining${seatLabel(s, p)}`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: 1, player: p }),
            fx("jtcAssign", { value: remaining - 1, player: p }),
          ],
        })),
        "Forced: after Haradrim Archer engages you, assign X damage among characters you control, X being the number of players.",
      );
      return true;
    }
    case "jtcReadyCharacter": {
      const exhausted = [...s.heroes, ...s.allies].filter((x) => x.exhausted);
      if (!exhausted.length) {
        log(
          s,
          `Ithilien Woods: ${who(s, p)} ${s.table ? "has" : "have"} no exhausted character.`,
        );
        return true;
      }
      choose(
        s,
        `Ithilien Woods · Ready a character you control${seatLabel(s, p)}`,
        exhausted.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("jtcReady", { target: x.id, player: p })],
        })),
        "Forced: after a player engages a Harad enemy, he readies a character he controls.",
      );
      return true;
    }
    case "jtcReady": {
      const x = e.target ? get(s, e.target) : undefined;
      if (x && x.exhausted) readyCharacter(s, x, false);
      return true;
    }
    // Treacheries.
    case "jtcSummons": {
      const engaged = s.engaged.filter(isHarad);
      const options: Option[] = [];
      if (engaged.length)
        options.push({
          id: "gate",
          label:
            "Place the lowest-attack Harad enemy engaged with you facedown under The Black Gate",
          effects: [fx("jtcSummonsGate", { player: p })],
        });
      if (q.underCrossroads.length)
        options.push({
          id: "cross-roads",
          label:
            "Reveal the top facedown card under The Cross-roads and put it into play engaged with you",
          effects: [fx("jtcSummonsEngage", { player: p })],
        });
      if (!options.length) {
        log(
          s,
          "The Dark Lord's Summons: no Harad enemy is engaged with the player and no card is under The Cross-roads.",
        );
        return true;
      }
      choose(
        s,
        `The Dark Lord's Summons · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: either place the lowest-attack Harad enemy engaged with you facedown under The Black Gate, or reveal the top facedown card from under The Cross-roads and put it into play engaged with you.",
      );
      return true;
    }
    case "jtcSummonsGate": {
      const candidates = lowest(
        s.engaged.filter(isHarad),
        (x) => stats(s, x).attack,
      );
      if (candidates.length === 1)
        prepend(
          s,
          fx("jtcUnderGate", {
            target: candidates[0].id,
            text: "The Dark Lord's Summons",
            player: p,
          }),
        );
      else if (candidates.length)
        choose(
          s,
          `The Dark Lord's Summons · Lowest-attack Harad enemy${seatLabel(s, p)}`,
          candidates.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("jtcUnderGate", {
                target: x.id,
                text: "The Dark Lord's Summons",
                player: p,
              }),
            ],
          })),
          "Several Harad enemies share the lowest attack.",
        );
      return true;
    }
    case "jtcSummonsEngage": {
      const code = takeUnderCrossroads(s);
      if (!code) return true;
      const enemy = make(s, code);
      s.staging.push(enemy);
      log(
        s,
        `The Dark Lord's Summons: ${name(enemy)} is revealed from under The Cross-roads and put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      engage(s, enemy);
      return true;
    }
    case "jtcMarching": {
      const engaged = [...s.engaged];
      const harad = searchOptions(s, isHaradCode, "jtcMarchingEngage", p);
      const options: Option[] = [
        ...engaged.map((x) => ({
          id: `return-${x.id}`,
          code: x.code,
          label: `Return ${name(x)} to the staging area`,
          effects: [fx("jtcReturn", { target: x.id, player: p })],
        })),
        ...harad.map((o) => ({
          ...o,
          label: `Put ${card(o.code!).name} into play engaged with you · encounter deck`,
        })),
      ];
      if (!options.length) {
        log(
          s,
          `Marching Up the Road: ${who(s, p)} ${s.table ? "is" : "are"} engaged with no enemy and the encounter deck has no Harad enemy.`,
        );
        return true;
      }
      choose(
        s,
        `Marching Up the Road · Choose one${seatLabel(s, p)}`,
        options,
        "When Revealed: each player must either return an enemy engaged with him to the staging area, or search the encounter deck for a Harad enemy and put it into play engaged with him.",
      );
      return true;
    }
    case "jtcMarchingEngage": {
      if (!takeFromDeck(s, e.code)) return true;
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      log(
        s,
        `Marching Up the Road: ${name(enemy)} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      engage(s, enemy);
      return true;
    }
    case "jtcSouthrons": {
      const harad = s.staging.filter(isHarad);
      const enemies = s.staging.filter((x) => isEnemy(x));
      const options: Option[] = [];
      if (harad.length)
        options.push({
          id: "gate",
          label:
            "Place the lowest-threat Harad enemy in the staging area facedown under The Black Gate and reveal an additional encounter card",
          effects: [fx("jtcSouthronsGate", { player: p })],
        });
      options.push({
        id: "attack",
        label: enemies.length
          ? `Each enemy in the staging area (${enemies.length}) makes an immediate attack against you`
          : "Each enemy in the staging area makes an immediate attack against you (there is none)",
        effects: [fx("jtcSouthronsAttack", { player: p })],
      });
      choose(
        s,
        `Fierce Southrons · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: either place the lowest-threat Harad enemy in the staging area facedown under The Black Gate and reveal an additional encounter card, or each enemy in the staging area makes an immediate attack against you.",
      );
      return true;
    }
    case "jtcSouthronsGate": {
      const candidates = lowest(s.staging.filter(isHarad), (x) =>
        threatOf(s, x),
      );
      const reveal = fx("reveal", { player: p });
      if (candidates.length === 1) {
        underGate(s, candidates[0], "Fierce Southrons");
        prepend(s, reveal);
      } else if (candidates.length)
        choose(
          s,
          `Fierce Southrons · Lowest-threat Harad enemy${seatLabel(s, p)}`,
          candidates.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("jtcUnderGate", {
                target: x.id,
                text: "Fierce Southrons",
                player: p,
              }),
              reveal,
            ],
          })),
          "Several Harad enemies share the lowest threat.",
        );
      return true;
    }
    case "jtcSouthronsAttack": {
      const enemies = s.staging.filter((x) => isEnemy(x));
      if (enemies.length)
        log(
          s,
          `Fierce Southrons: each enemy in the staging area makes an immediate attack against ${who(s, p)}.`,
          "danger",
        );
      prepend(
        s,
        ...enemies.map((x) =>
          fx("immediateAttack", { target: x.id, player: p }),
        ),
      );
      return true;
    }
    case "jtcArrowsShadow": {
      const enemy = u;
      if (!enemy || !s.combat || s.combat.enemyId !== enemy.id) return true;
      choose(
        s,
        `Arrows Thick in the Air · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "gate",
            label: `Place ${name(enemy)} facedown under The Black Gate after this attack`,
            effects: [fx("jtcArrowsGate", { target: enemy.id, player: p })],
          },
          {
            id: "again",
            label: `${name(enemy)} makes an additional attack against you after this one`,
            effects: [fx("jtcArrowsAgain", { target: enemy.id, player: p })],
          },
        ],
        "Shadow: either place attacking enemy facedown under The Black Gate after this attack, or it makes an additional attack against you after this one.",
      );
      return true;
    }
    case "jtcArrowsGate":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.jtcGateAfter = true;
      return true;
    case "jtcArrowsAgain":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      return true;
    case "jtcDiscardAttachment": {
      const attachments = [...s.heroes, ...s.allies].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              card(a.code).type_code !== "objective" &&
              card(a.code).sphere_code !== "encounter",
          )
          .map((a) => ({ host, a })),
      );
      if (!attachments.length) {
        log(
          s,
          `Hills of Ithilien: ${who(s, p)} ${s.table ? "controls" : "control"} no non-objective attachment.`,
        );
        return true;
      }
      choose(
        s,
        `Hills of Ithilien · Discard a non-objective attachment you control${seatLabel(s, p)}`,
        attachments.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} · ${name(host)}`,
          effects: [
            fx("jtcDiscard", { target: host.id, source: a.id, player: p }),
          ],
        })),
        "Shadow: discard a non-objective attachment you control.",
      );
      return true;
    }
    case "jtcDiscard": {
      const host = e.target ? get(s, e.target) : undefined;
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) {
        discardAttachment(s, host, a);
        log(
          s,
          `Hills of Ithilien: ${card(a.code).name} is discarded.`,
          "danger",
        );
      }
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const CROSS_ROADS_HOOKS: Batch4ScenarioHooks = {
  setup: setupCrossRoads,
  openingHandsKept: (s) => {
    if (!s.crossRoads || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      ...playerOrder(s)
        .filter((player) => player !== first)
        .map((player) => fx("jtcSetupSearch", { player })),
      fx("jtcShuffle", { text: "Ambush the Men of Harad", player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: crossRoadsStageInfo,
  check: (s) => {
    const q = s.crossRoads;
    if (!q || s.status !== "playing") return;
    lotrSagaCheck(s);
    // The Black Gate: at least X facedown cards lose the game.
    if (blackGate(s) && q.underBlackGate.length >= blackGateLimit(s))
      lose(
        s,
        `${q.underBlackGate.length} Harad enemies are under The Black Gate: the hosts of the Dark Tower are swelled, and the players lose the game.`,
      );
  },
  encounter,
  shadow,
  attackFinished,
  // 1B: at the beginning of the quest phase, a card from under The Cross-roads.
  questBegin: (s) =>
    s.crossRoads && stageLive(s) && !refuge(s)
      ? [
          fx("jtcRevealUnder", {
            text: "Ambush the Men of Harad",
            player: firstPlayer(s),
          }),
        ]
      : [],
  // The Black Gate: at the end of the planning phase.
  planningEnd: (s) => {
    if (s.crossRoads && blackGate(s) && !refuge(s))
      prepend(s, fx("jtcBlackGate", { player: firstPlayer(s) }));
  },
  // Henneth Annûn: skip the encounter and combat phases.
  skipPhase: (s) => !!s.crossRoads && refuge(s),
  // Henneth Annûn: "After Henneth Annûn becomes the active location", by
  // travel or by any other effect.
  travelEntered: (s, u) => {
    if (s.crossRoads && live(u, JTC.henneth))
      prepend(s, fx("jtcRefuge", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (!s.crossRoads || u.code !== JTC.crossroads) return;
    win(
      s,
      "The Cross-roads is explored: the Men of Harad are ambushed, and the players win the game.",
    );
  },
  travelProblem: (s, u) => {
    const q = s.crossRoads;
    if (!q) return null;
    if (u.code === JTC.crossroads) {
      if (q.underCrossroads.length)
        return "The Cross-roads: the players cannot travel here while facedown cards are under it.";
      if (s.progress < JTC_CROSSROADS_PROGRESS)
        return `The Cross-roads: the players cannot travel here until stage 1B has ${JTC_CROSSROADS_PROGRESS} progress.`;
      return null;
    }
    if (u.blanked) return null;
    if (u.code === JTC.southward && !q.underCrossroads.length)
      return "Southward Road: there is no facedown card under The Cross-roads to reveal.";
    if (u.code === JTC.foothills && !s.staging.some((x) => isEnemy(x)))
      return "Foothills of Ephel Dúath: there is no enemy in the staging area to engage.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.crossRoads || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === JTC.southward)
      return [fx("jtcRevealUnder", { text: "Southward Road", player: first })];
    if (u.code === JTC.woods) return [fx("reveal", { player: first })];
    if (u.code === JTC.foothills)
      return [fx("jtcEngageStaged", { player: first })];
    return undefined;
  },
  // Southward Road: an additional optional engagement.
  extraOptionalEngagements: (s) =>
    s.crossRoads && activeIs(s, JTC.southward) ? 1 : 0,
  // Engagement Forced effects, the enemies' and the active location's.
  engaged: (s, u) => {
    const q = s.crossRoads;
    if (!q || !isEnemy(u)) return;
    const p = activeSeat(s);
    const effects: Effect[] = [];
    if (!u.blanked)
      switch (u.code) {
        case JTC.man:
          effects.push(
            fx("jtcRandomDiscard", { text: "Man of Harad", player: p }),
          );
          break;
        case JTC.captain: {
          q.captain = { round: s.round, count: roundCount(s, q.captain) + 1 };
          log(
            s,
            "Captain of Harad: each Harad enemy gets +1 attack and -10 engagement cost until the end of the round.",
            "danger",
          );
          break;
        }
        case JTC.oliphaunt:
          effects.push(fx("jtcExhaustAllies", { player: p }));
          break;
        case JTC.soldier:
          log(s, "Haradrim Soldier makes an immediate attack.", "danger");
          effects.push(fx("immediateAttack", { target: u.id, player: p }));
          break;
        case JTC.archer:
          effects.push(fx("jtcAssign", { value: players(s), player: p }));
          break;
      }
    if (isHarad(u)) {
      if (activeIs(s, JTC.woods))
        effects.push(fx("jtcReadyCharacter", { player: p }));
      if (activeIs(s, JTC.hills)) {
        log(s, `Hills of Ithilien: 1 damage is dealt to ${name(u)}.`, "danger");
        effects.push(fx("damage", { target: u.id, value: 1, player: p }));
      }
    }
    prepend(s, ...effects);
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.crossRoads || !isCharacter(u) || !c) return;
    if (context.combatDamage && context.enemyId === c.enemyId)
      c.jtcKilled = true;
  },
  // Archery from the staging area, Arrows Thick in the Air included.
  combatBegin: (s) => {
    const q = s.crossRoads;
    if (!q) return;
    const arrows = roundCount(s, q.arrows);
    const archery = s.staging.reduce((n, x) => {
      if (!isEnemy(x)) return n;
      const printed = x.blanked
        ? 0
        : x.code === JTC.archer
          ? players(s)
          : whiteHandArchery(x.code);
      return n + printed + (isHarad(x) ? 2 * arrows : 0);
    }, 0);
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  stats: (s, u) => {
    const q = s.crossRoads;
    if (!q || !isHarad(u)) return {};
    const count = roundCount(s, q.captain);
    return count ? { attack: count } : {};
  },
  engagementBonus: (s, u) => {
    const q = s.crossRoads;
    if (!q || !isHarad(u)) return 0;
    return -10 * roundCount(s, q.captain);
  },
  threatBonus: (s, u) => {
    const q = s.crossRoads;
    if (!q) return 0;
    if (live(u, JTC.crossroads)) return -q.underCrossroads.length;
    let bonus = 0;
    // Haradrim Archer: X is the number of players.
    if (live(u, JTC.archer)) bonus += players(s);
    // Foothills of Ephel Dúath: each Harad enemy gets -1 threat.
    if (isHarad(u) && activeIs(s, JTC.foothills)) bonus -= 1;
    return bonus;
  },
  // Oliphaunt: no attachments, and at most 3 damage each round.
  cannotAttach: (s, u) => !!s.crossRoads && live(u, JTC.oliphaunt),
  damageAmount: (s, u, amount) => {
    const q = s.crossRoads;
    if (!q || !live(u, JTC.oliphaunt)) return amount;
    const taken =
      q.oliphaunt?.round === s.round ? (q.oliphaunt.damage[u.id] ?? 0) : 0;
    return Math.min(amount, Math.max(0, JTC_OLIPHAUNT_DAMAGE - taken));
  },
  damageDealt: (s, u, amount) => {
    const q = s.crossRoads;
    if (!q || !live(u, JTC.oliphaunt) || amount <= 0) return;
    if (q.oliphaunt?.round !== s.round)
      q.oliphaunt = { round: s.round, damage: {} };
    q.oliphaunt.damage[u.id] = (q.oliphaunt.damage[u.id] ?? 0) + amount;
  },
  roundEnd: (s) => {
    const q = s.crossRoads;
    if (q) {
      delete q.arrows;
      delete q.captain;
      delete q.oliphaunt;
    }
    return [];
  },
  effect: crossRoadsEffect,
  sharedEffect: (e) =>
    [
      "jtcTreacheryDone",
      "jtcShuffle",
      "jtcRevealUnder",
      "jtcBlackGate",
      "jtcUnderGate",
      "jtcRefuge",
    ].includes(e.kind),
};
