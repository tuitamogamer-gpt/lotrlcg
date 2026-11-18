import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { HuntDreadnaughtState } from "./hunt-dreadnaught-types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  putPlayerDeck,
  random,
  shuffle,
  stats,
} from "./core";
import {
  enemyAddedToStaging,
  enterEnemyEngaged,
  questDefeated,
  readyCharacter,
  win,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  globalEngaged,
  ownerOf,
  playerOrder,
} from "./table";
import { normalAttackPending } from "./considered-engagement";
import { attachToQuest, mainQuestUnit } from "./quest-state";
import { isShipEnemy, isShipObjective } from "./ships";
import { reduceThreat } from "./threat-reduction";
import { rhosgobelHeal } from "./rhosgobel";
import { unitType } from "./card-types";
import {
  HD,
  HD_CORSAIR_DECK,
  HD_DAMAGED,
  HD_MODES,
  HD_SCENARIO,
  HD_SHIPS,
  HD_UNIQUES,
  hdBack,
  hdDreadnaughtHealth,
  hdPhysical,
  hdPlayers,
  hdQuestPoints,
  hdRoundCap,
  hdSection,
  hdStageInfo,
} from "./hunt-dreadnaught-support";
import {
  byPlayerCard,
  charactersOf,
  controllerOf,
  dreadnaughtOf,
  enemiesInPlay,
  isDread,
  live,
  raiseFor,
  roundMarked,
  seatLabel,
  shipOf,
  shipsOf,
  stageLocation,
  takeFrom,
  their,
  upgraded,
  verb,
  who,
  zones,
} from "./hunt-dreadnaught-lib";
import {
  HD_CARD_SHARED,
  hdAttackFinished,
  hdCardEffect,
  hdEncounter,
  hdEngaged,
  hdShadow,
} from "./hunt-dreadnaught-cards";
export * from "./hunt-dreadnaught-support";

/**
 * The Hunt for the Dreadnaught (2019 Fellowship event, print-on-demand
 * Q99.15) for one group: each player commands one of six ships, Corsairs
 * board the fleet from a separate Corsair deck, and at stage 2 the Massive
 * Dreadnaught (considered engaged with each player, never leaving the staging
 * area) must be destroyed. The global values count the players of the group.
 */
const SETUP_CARDS = new Set(Object.values(HD_MODES).map(hdBack));
const freshState = (): HuntDreadnaughtState => ({
  mode: null,
  currentQuest: HD.search,
  fleet: [],
  fleetReady: false,
  corsairDeck: [],
  corsairDiscard: [],
  setAside: [],
  removed: [],
  questProgress: null,
  dreadDamage: null,
  questActionUsed: false,
  boarding: [],
  ballista: null,
  overworked: null,
  ramming: [],
  cove: [],
  hydraken: null,
  ophidian: [],
  threatReduced: [],
  cancelled: [],
  extraShadows: [],
  ranged: [],
  traits: [],
  eliminated: [],
  resolving: [],
  capture: [],
});
const at = (s: GameState, c: string) =>
  s.huntDreadnaught?.currentQuest === c && !s.stageRevealing;
const roundAmount = (
  s: GameState,
  v: { round: number; amount: number } | null,
) => (v?.round === s.round ? v.amount : 0);
const isHero = (u: Unit) => unitType(u) === "hero";
const heroOwner = (s: GameState, u: Unit) =>
  isHero(u) ? controllerOf(s, u) : undefined;
const SHIP_SUMMARY: Record<string, string> = {
  [HD.eithiliant]:
    "heroes +1 willpower; setup: a hero gains another hero's printed Traits",
  [HD.goldenWing]:
    "heroes +1 hit point; setup: reduce your threat by 3 and a hero gains ranged",
  [HD.pride]:
    "heroes +1 defense; your starting hand draws 5 more, then 5 return to the deck",
  [HD.silentMist]: "starting hand of 8; events costing 3 or more cost 1 less",
  [HD.swan]:
    "setup: 1 resource on each hero; spend 2 resources to ready a character each round",
  [HD.twilight]:
    "the first card each round needs no resource match; play an ally or attachment outside planning each round",
};

// ---------------------------------------------------------------------------
// Preparing the fleet (before the starting hands) and the Setup card.

/** Each player chooses a ship before drawing a starting hand (Silent Mist, Pride of Lebennin). */
export function huntDreadnaughtFleetSetup(s: GameState) {
  if (s.scenarioId !== HD_SCENARIO) return;
  s.huntDreadnaught = freshState();
  enqueue(s, ...playerOrder(s).map((player) => fx("hdFleet", { player })));
}
/** Silent Mist: "Your starting hand size is 8 cards." */
export function huntDreadnaughtStartingHand(s: GameState) {
  return s.huntDreadnaught && shipOf(s, activeSeat(s), HD.silentMist)
    ? 8
    : undefined;
}
export function setupHuntDreadnaught(s: GameState) {
  const q = (s.huntDreadnaught ??= freshState());
  const first = firstPlayer(s);
  const chosen = q.fleet.map((f) => f.code);
  const modes = Object.values(HD_MODES);
  q.setAside = hdSection("sharedSetAside").filter(
    (c) => !modes.includes(c) && !chosen.includes(c),
  );
  q.corsairDeck = shuffle(s, [...HD_CORSAIR_DECK]);
  s.encounterDeck = hdSection("sharedEncounterDeck");
  log(
    s,
    "The Corsair deck is prepared with the 13 non-Ship Corsair enemies. The 7 unique enemies (including the Dreadnaught), the unused ship-objectives and the 4 Gondorian Warships are set aside.",
    "chapter",
  );
  prepend(
    s,
    ...playerOrder(s)
      .filter((p) => shipOf(s, p, HD.pride))
      .map((player) => fx("hdPrideDraw", { player })),
    s.easyMode
      ? fx("hdMode", { text: "easy", player: first })
      : fx("hdChooseMode", { player: first }),
  );
}

// ---------------------------------------------------------------------------
// Ship abilities: costs, stats and the Upgraded side.

const readyTargets = (s: GameState, cardsToo: boolean) =>
  playerOrder(s).flatMap((p) =>
    charactersOf(s, p).flatMap((u) => [
      ...(u.exhausted
        ? [{ u, attachment: undefined as string | undefined }]
        : []),
      ...(cardsToo
        ? u.attachments
            .filter((a) => a.exhausted && !a.facedown)
            .map((a) => ({ u, attachment: a.id as string | undefined }))
        : []),
    ]),
  );
function flipShip(s: GameState, u: Unit, p: number) {
  if (upgraded(u) || !HD_SHIPS.includes(u.code)) return false;
  u.code = hdBack(u.code);
  log(s, `${name(u)} flips to its Upgraded side.`, "good");
  const c = hdPhysical(u.code);
  const response =
    c === HD.eithiliant
      ? "hdEithiliantFlip"
      : c === HD.goldenWing
        ? "hdWingFlip"
        : c === HD.pride
          ? "hdPrideFlip"
          : c === HD.silentMist
            ? "hdMistFlip"
            : c === HD.swan
              ? "hdSwanFlip"
              : "hdTwilightFlip";
  prepend(s, fx(response, { source: u.id, player: p }));
  return true;
}
// ---------------------------------------------------------------------------
// Effects.

function hdEffect(s: GameState, e: Effect): boolean {
  const q = s.huntDreadnaught;
  if (!q) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "hdFleet": {
      const taken = q.fleet.map((f) => f.code);
      if (q.fleet.some((f) => f.player === p)) return true;
      choose(
        s,
        `Prepare your fleet · Choose your ship${seatLabel(s, p)}`,
        HD_SHIPS.filter((c) => !taken.includes(c)).map((c) => ({
          id: c,
          code: c,
          label: `${card(c).name} · ${SHIP_SUMMARY[c]}`,
          effects: [fx("hdTakeShip", { code: c, player: p })],
        })),
        "Each player chooses and takes control of one of the six unique ship-objectives, Basic side faceup. The others are set aside.",
      );
      return true;
    }
    case "hdTakeShip": {
      const c = e.code!;
      if (q.fleet.some((f) => f.code === c || f.player === p)) return true;
      const u = make(s, c);
      u.owner = p;
      u.controller = p;
      s.allies.push(u);
      q.fleet.push({ player: p, code: c });
      q.fleetReady = q.fleet.length === playerOrder(s).length;
      log(
        s,
        `${who(s, p)} ${verb(s, "take")} control of ${card(c).name}, Basic side faceup.`,
        "good",
      );
      return true;
    }
    // Pride of Lebennin: 5 additional cards, then 5 return; no mulligan.
    case "hdPrideDraw":
      draw(s, 5, false);
      s.mulled = true;
      log(
        s,
        `Pride of Lebennin: ${who(s, p)} ${verb(s, "draw")} 5 additional cards, then ${verb(s, "shuffle")} 5 cards from ${their(s)} hand into ${their(s)} deck (no mulligan).`,
      );
      prepend(s, fx("hdPrideReturn", { count: 5, player: p }));
      return true;
    case "hdPrideReturn": {
      const left = e.count ?? 0;
      if (left <= 0 || !s.hand.length) {
        shuffle(s, s.deck);
        return true;
      }
      choose(
        s,
        `Pride of Lebennin · Shuffle a card from your hand into your deck (${left} left)${seatLabel(s, p)}`,
        s.hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Shuffle ${card(u.code).name} into your deck`,
          effects: [
            fx("hdPrideBack", { target: u.id, player: p }),
            fx("hdPrideReturn", { count: left - 1, player: p }),
          ],
        })),
      );
      return true;
    }
    case "hdPrideBack": {
      const u = s.hand.find((x) => x.id === e.target);
      if (!u) return true;
      s.hand = s.hand.filter((x) => x.id !== u.id);
      putPlayerDeck(s, u);
      return true;
    }
    case "hdChooseMode":
      choose(
        s,
        `The Hunt for the Dreadnaught · Choose a difficulty mode${seatLabel(s, p)}`,
        (["standard", "hard"] as const).map((mode) => ({
          id: mode,
          code: HD_MODES[mode],
          label: `${card(HD_MODES[mode]).name}`,
          effects: [fx("hdMode", { text: mode, player: p })],
        })),
        "Use the chosen Setup card; the other two are removed from the game. Easy Mode is played with the easy mode option.",
      );
      return true;
    case "hdMode": {
      const mode = e.text as "easy" | "standard" | "hard";
      if (q.mode) return true;
      q.mode = mode;
      q.removed = Object.values(HD_MODES).filter((c) => c !== HD_MODES[mode]);
      const n = hdPlayers(s);
      if (mode === "easy") {
        for (const c of [HD.blackSails, HD.blackSails, HD.corsairWarship])
          if (takeFrom(s.encounterDeck, c)) q.setAside.push(c);
        if (takeFrom(s.encounterDeck, HD.cobas)) stageLocation(s, HD.cobas);
        s.encounterDeck = shuffle(s, s.encounterDeck);
        log(
          s,
          "Easy Mode: 2 Black Sails and 1 Corsair Warship are set aside, and Cobas Haven is added to the staging area.",
          "chapter",
        );
      } else if (mode === "standard") {
        s.encounterDeck = shuffle(s, s.encounterDeck);
        const wanted = n >= 3 ? 3 : 2;
        const found: string[] = [];
        while (found.length < wanted && s.encounterDeck.length) {
          const c = s.encounterDeck.shift()!;
          if (card(c).type_code === "location") found.push(c);
          else s.encounterDiscard.push(c);
        }
        for (const c of found) stageLocation(s, c);
        log(
          s,
          `Standard Mode: cards are discarded from the encounter deck until ${wanted} locations are discarded; ${found.map((c) => card(c).name).join(", ")} ${found.length === 1 ? "is" : "are"} added to the staging area.`,
          "chapter",
        );
      } else {
        const staged = [
          HD.tolfalas,
          HD.tolfalas,
          HD.tolfalas,
          ...(n >= 3 ? [HD.cove, HD.cove] : []),
        ];
        for (const c of staged)
          if (takeFrom(s.encounterDeck, c)) stageLocation(s, c);
        s.encounterDeck = shuffle(s, s.encounterDeck);
        log(
          s,
          `Hard Mode: 3 Tolfalas Landing${n >= 3 ? " and 2 Wicked Cove" : ""} are added to the staging area.`,
          "chapter",
        );
      }
      // The Setup card is flipped over and placed next to the quest deck.
      attachToQuest(s, q.currentQuest, {
        id: `a${s.nextId++}`,
        code: hdBack(HD_MODES[mode]),
        exhausted: false,
      });
      prepend(
        s,
        ...playerOrder(s).flatMap((player) => [
          ...(shipOf(s, player, HD.eithiliant)
            ? [fx("hdEithiliantSetup", { player })]
            : []),
          ...(shipOf(s, player, HD.goldenWing)
            ? [fx("hdWingSetup", { player })]
            : []),
          ...(shipOf(s, player, HD.swan)
            ? [fx("hdSwanSetup", { player })]
            : []),
        ]),
      );
      return true;
    }
    case "hdEithiliantSetup": {
      if (s.heroes.length < 2) {
        log(s, "Eithiliant: there is no other hero to take Traits from.");
        return true;
      }
      choose(
        s,
        `Eithiliant · Setup: choose a hero to gain another hero's printed Traits${seatLabel(s, p)}`,
        s.heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} gains the printed Traits of another hero`,
          effects: [fx("hdEithiliantFrom", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "hdEithiliantFrom": {
      const target = get(s, e.target);
      if (!target) return true;
      choose(
        s,
        `Eithiliant · ${name(target)} gains the printed Traits of${seatLabel(s, p)}`,
        s.heroes
          .filter((h) => h.id !== target.id)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)} (${card(h.code).traits ?? "no Traits"})`,
            effects: [
              fx("hdTraits", { target: target.id, source: h.id, player: p }),
            ],
          })),
      );
      return true;
    }
    case "hdTraits": {
      const target = get(s, e.target),
        from = get(s, e.source);
      if (!target || !from) return true;
      const traits = (card(from.code).traits ?? "")
        .split(".")
        .map((t) => t.trim())
        .filter(Boolean);
      q.traits.push({ id: target.id, traits });
      log(
        s,
        `Eithiliant: until the end of the game, ${name(target)} gains the printed Traits of ${name(from)} (${traits.join(", ") || "none"}).`,
        "good",
      );
      return true;
    }
    case "hdWingSetup": {
      const reduced = reduceThreat(s, 3, HD.goldenWing, "encounter");
      log(
        s,
        `Golden Wing: ${who(s, p)} ${verb(s, "reduce")} ${their(s)} threat by ${reduced}.`,
        "good",
      );
      if (!s.heroes.length) return true;
      choose(
        s,
        `Golden Wing · Setup: choose a hero to gain ranged until the end of the game${seatLabel(s, p)}`,
        s.heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} gains ranged`,
          effects: [fx("hdRanged", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "hdRanged": {
      const h = get(s, e.target);
      if (!h) return true;
      if (!q.ranged.includes(h.id)) q.ranged.push(h.id);
      log(s, `Golden Wing: ${name(h)} gains ranged until the end of the game.`);
      return true;
    }
    case "hdSwanSetup":
      for (const h of s.heroes) h.resources += 1;
      log(
        s,
        `Swan Ship of Dol Amroth: each of ${who(s, p) === "you" ? "your" : `${who(s, p)}'s`} heroes adds 1 resource to its resource pool.`,
        "good",
      );
      return true;
    // Pay X resources from your heroes, one at a time, then resolve the effects.
    case "hdPay": {
      const left = e.value ?? 0;
      if (left <= 0) {
        prepend(s, ...(e.effects ?? []));
        return true;
      }
      const payers = s.heroes.filter((h) => h.resources > 0);
      if (!payers.length) return true;
      if (payers.length === 1 && payers[0].resources >= left) {
        payers[0].resources -= left;
        prepend(s, ...(e.effects ?? []));
        return true;
      }
      choose(
        s,
        `Spend a resource (${left} left)${seatLabel(s, p)}`,
        payers.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Spend 1 resource from ${name(h)} (${h.resources})`,
          effects: [
            fx("hdSpend", { target: h.id, player: p }),
            fx("hdPay", { value: left - 1, player: p, effects: e.effects }),
          ],
        })),
      );
      return true;
    }
    case "hdSpend": {
      const h = get(s, e.target);
      if (h && h.resources > 0) h.resources -= 1;
      return true;
    }
    // Swan Ship of Dol Amroth: ready a character (Basic) or a card (Upgraded).
    case "hdReadyChoice": {
      const targets = readyTargets(s, !!e.flag);
      if (!targets.length) return true;
      choose(
        s,
        `${e.text} · Ready ${e.flag ? "a card" : "a character"}${seatLabel(s, p)}`,
        targets.map(({ u, attachment }) => ({
          id: attachment ?? u.id,
          code: attachment
            ? u.attachments.find((a) => a.id === attachment)!.code
            : u.code,
          label: attachment
            ? `Ready ${card(u.attachments.find((a) => a.id === attachment)!.code).name} (on ${name(u)})`
            : `Ready ${name(u)}`,
          effects: [
            fx("hdReady", { target: u.id, source: attachment, player: p }),
          ],
        })),
      );
      return true;
    }
    case "hdReady": {
      const u = get(s, e.target);
      if (!u) return true;
      if (e.source) {
        const a = u.attachments.find((x) => x.id === e.source);
        if (a) a.exhausted = false;
      } else readyCharacter(s, u, false);
      return true;
    }
    // Belfalas Shipyard and the Upgraded sides' Responses.
    case "hdFlip": {
      const u = get(s, e.target);
      if (!u) return true;
      rhosgobelHeal(s, u, 5);
      readyCharacter(s, u, false);
      const owner = controllerOf(s, u) ?? p;
      if (!flipShip(s, u, owner))
        log(s, `${name(u)} has no Upgraded side to flip to.`);
      return true;
    }
    case "hdEithiliantFlip":
      prepend(
        s,
        fx("hdShuffleBack", { count: 6, player: p }),
        fx("hdPlaceProgress", { value: 6, text: "Eithiliant", player: p }),
      );
      return true;
    case "hdShuffleBack": {
      const left = e.count ?? 0;
      const done = () => shuffle(s, s.deck);
      if (left <= 0 || !s.discard.length) {
        done();
        return true;
      }
      const seen = new Set<string>();
      const options: Option[] = s.discard.flatMap((c, i) => {
        if (seen.has(c)) return [];
        seen.add(c);
        return [
          {
            id: `${c}#${i}`,
            code: c,
            label: `Shuffle ${card(c).name} into your deck`,
            effects: [
              fx("hdDiscardToDeck", { code: c, player: p }),
              fx("hdShuffleBack", { count: left - 1, player: p }),
            ],
          },
        ];
      });
      options.push({
        id: "done",
        label: "Shuffle no more cards",
        effects: [fx("hdShuffleBack", { count: 0, player: p })],
      });
      choose(
        s,
        `Eithiliant · Shuffle up to ${left} more cards from your discard pile into your deck${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "hdDiscardToDeck":
      if (takeFrom(s.discard, e.code!)) s.deck.push(e.code!);
      return true;
    case "hdPlaceProgress": {
      const locations = [
        ...s.staging.filter((u) => card(u.code).type_code === "location"),
        ...(s.activeLocation ? [s.activeLocation] : []),
      ];
      if (!locations.length) return true;
      choose(
        s,
        `${e.text} · Place ${e.value} progress on a location${seatLabel(s, p)}`,
        locations.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Place ${e.value} progress on ${name(u)}`,
          effects: [
            fx("placeLocationProgress", { target: u.id, value: e.value }),
          ],
        })),
      );
      return true;
    }
    case "hdWingFlip": {
      const targets = enemiesInPlay(s);
      if (!targets.length) return true;
      choose(
        s,
        `Golden Wing · Deal 6 damage to an enemy${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Deal 6 damage to ${name(u)}`,
          effects: [fx("damage", { target: u.id, value: 6, player: p })],
        })),
      );
      return true;
    }
    case "hdPrideFlip": {
      const damaged = playerOrder(s).flatMap((o) =>
        charactersOf(s, o).filter((u) => u.damage > 0),
      );
      prepend(
        s,
        ...(damaged.length ? [fx("hdHealChoice", { player: p })] : []),
        fx("hdVictoryChoice", { count: 2, player: p }),
      );
      return true;
    }
    case "hdHealChoice": {
      const damaged = playerOrder(s).flatMap((o) =>
        charactersOf(s, o).filter((u) => u.damage > 0),
      );
      if (!damaged.length) return true;
      choose(
        s,
        `Pride of Lebennin · Heal 2 damage from a character${seatLabel(s, p)}`,
        damaged.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Heal 2 damage from ${name(u)} (${u.damage})`,
          effects: [fx("hdHeal", { target: u.id, value: 2, player: p })],
        })),
      );
      return true;
    }
    case "hdHeal": {
      const u = get(s, e.target);
      if (u) rhosgobelHeal(s, u, e.value ?? 0);
      return true;
    }
    case "hdVictoryChoice": {
      const left = e.count ?? 0;
      if (left <= 0 || !s.encounterDiscard.length) return true;
      const options: Option[] = [...new Set(s.encounterDiscard)]
        .sort((a, b) => card(a).name.localeCompare(card(b).name))
        .map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to the victory display`,
          effects: [
            fx("hdToVictory", { code: c, player: p }),
            fx("hdVictoryChoice", { count: left - 1, player: p }),
          ],
        }));
      options.push({ id: "done", label: "Choose no more cards", effects: [] });
      choose(
        s,
        `Pride of Lebennin · Add up to ${left} more cards from the encounter discard pile to the victory display${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "hdToVictory":
      if (takeFrom(s.encounterDiscard, e.code!)) {
        (s.victoryCards ??= []).push(e.code!);
        s.victory += card(e.code!).victory ?? 0;
        log(
          s,
          `Pride of Lebennin: ${card(e.code!).name} is added to the victory display.`,
          "good",
        );
      }
      return true;
    case "hdMistFlip": {
      const left = e.count ?? 2;
      const events = [
        ...new Set(s.discard.filter((c) => card(c).type_code === "event")),
      ];
      if (left <= 0 || !events.length) return true;
      choose(
        s,
        `Silent Mist · Add up to ${left} more events from your discard pile to your hand${seatLabel(s, p)}`,
        [
          ...events.map((c) => ({
            id: c,
            code: c,
            label: `Add ${card(c).name} to your hand`,
            effects: [
              fx("hdEventToHand", { code: c, player: p }),
              fx("hdMistFlip", { count: left - 1, player: p }),
            ],
          })),
          { id: "done", label: "Add no more events", effects: [] },
        ],
      );
      return true;
    }
    case "hdEventToHand":
      if (takeFrom(s.discard, e.code!)) {
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
      }
      return true;
    case "hdSwanFlip": {
      if (!s.heroes.length) return true;
      choose(
        s,
        `Swan of Dol Amroth · Add 2 resources to a hero's resource pool${seatLabel(s, p)}`,
        s.heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Add 2 resources to ${name(h)}`,
          effects: [
            fx("hdResources", { target: h.id, value: 2, player: p }),
            fx("hdReadyChoice", {
              flag: true,
              text: "Swan of Dol Amroth",
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "hdResources": {
      const h = get(s, e.target);
      if (h) h.resources += e.value ?? 0;
      return true;
    }
    case "hdTwilightFlip":
      draw(s, 3, false);
      log(
        s,
        `Twilight's Call: ${who(s, p)} ${verb(s, "draw")} 3 cards.`,
        "good",
      );
      return true;
    // Searching the High Seas is defeated at the end of the quest phase.
    case "hdAdvance": {
      if (!at(s, HD.search)) return true;
      const before = s.queue.length;
      questDefeated(s, HD.search);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("hdStageTwo", { player: first }));
      return true;
    }
    case "hdStageTwo": {
      q.currentQuest = HD.destroy;
      q.questProgress = null;
      // The Setup card stays next to the quest deck.
      const attachments = s.questAttachments?.[HD.search] ?? [];
      const questAttachments = (s.questAttachments ??= {});
      questAttachments[HD.destroy] = [
        ...(questAttachments[HD.destroy] ?? []),
        ...attachments.filter((a) => SETUP_CARDS.has(a.code)),
      ];
      delete questAttachments[HD.search];
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      log(
        s,
        "Searching the High Seas is defeated. Destroy the Dreadnaught (2A).",
        "chapter",
      );
      prepend(
        s,
        fx("hdDreadnaughtArrives", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    case "hdDreadnaughtArrives": {
      if (!takeFrom(q.setAside, HD.dreadnaught)) return true;
      const u = make(s, HD.dreadnaught);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      log(
        s,
        `The Dreadnaught is added to the staging area, Elite side faceup (${hdDreadnaughtHealth(s)} hit points).`,
        "danger",
      );
      return true;
    }
    // 2B's Action: a set-aside Gondorian Warship joins the encounter deck.
    case "hdWarshipAction":
      if (!at(s, HD.destroy) || s.progress < hdRoundCap(s)) return true;
      if (!takeFrom(q.setAside, HD.warship)) return true;
      s.progress -= hdRoundCap(s);
      s.encounterDeck.push(HD.warship);
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(
        s,
        `Destroy the Dreadnaught: ${hdRoundCap(s)} progress are removed and a set-aside Gondorian Warship is shuffled into the encounter deck.`,
        "good",
      );
      return true;
    // 2B's Response: raise your threat by 4 to cancel the Dreadnaught's attack.
    case "hdCancelAttack": {
      raiseFor(s, p, 4);
      q.cancelled = [
        ...q.cancelled.filter((m) => m.round === s.round),
        { player: p, round: s.round },
      ];
      log(
        s,
        `Destroy the Dreadnaught: ${who(s, p)} ${verb(s, "raise")} ${their(s)} threat by 4 to cancel the Dreadnaught's attack.`,
        "good",
      );
      return true;
    }
    case "hdCancelImmediate": {
      const dread = get(s, e.target);
      raiseFor(s, p, 4);
      log(
        s,
        `Destroy the Dreadnaught: ${who(s, p)} ${verb(s, "raise")} ${their(s)} threat by 4 to cancel the Dreadnaught's attack.`,
        "good",
      );
      s.queue = s.queue.filter(
        (x) =>
          !(x.kind === "immediateChooseDefender" && x.target === dread?.id),
      );
      prepend(s, fx("enemyDone", { flag: true }));
      return true;
    }
    // The Setup card's Quest Action (Easy and Standard Mode).
    case "hdQuestAction": {
      const targets = globalEngaged(s).filter(
        (u) => !card(u.code).is_unique && !isDread(u),
      );
      if (!targets.length || q.questActionUsed) return true;
      choose(
        s,
        `${card(HD_MODES[q.mode!]).name} · Quest Action: deal 10 damage to a non-unique engaged enemy${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Deal 10 damage to ${name(u)}`,
          effects: [
            fx("hdQuestActionUse", { player: p }),
            fx("damage", { target: u.id, value: 10, player: p }),
            ...(q.mode === "standard" ? [fx("reveal", { player: first })] : []),
          ],
        })),
      );
      return true;
    }
    case "hdQuestActionUse":
      q.questActionUsed = true;
      log(
        s,
        `${card(HD_MODES[q.mode!]).name}: the Quest Action is used (group limit once per game).`,
      );
      return true;
    // The Dreadnaught flips at the end of the round below half its hit points.
    case "hdFlipCheck": {
      const u = dreadnaughtOf(s);
      if (!u || u.code !== HD.dreadnaught || u.blanked) return true;
      const health = hdDreadnaughtHealth(s);
      if ((health - u.damage) * 2 >= health) return true;
      u.code = HD_DAMAGED;
      log(
        s,
        `The Dreadnaught has less than half of its ${health} hit points left (${health - u.damage}): it flips over to its Damaged side.`,
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("hdUniqueCorsair", { player })),
      );
      return true;
    }
    case "hdUniqueCorsair": {
      const aside = HD_UNIQUES.filter((c) => q.setAside.includes(c));
      if (!aside.length) {
        log(
          s,
          "The Dreadnaught: there is no set-aside unique Corsair enemy left.",
        );
        return true;
      }
      const c =
        aside[Math.min(aside.length - 1, Math.floor(random(s) * aside.length))];
      takeFrom(q.setAside, c);
      const u = make(s, c);
      enterEnemyEngaged(s, u, p);
      log(
        s,
        `The Dreadnaught: ${card(c).name} is put into play at random engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    // Corsair Skirmisher: discard allies with 3 willpower to capture it.
    case "hdCaptureOffer": {
      const enemy = q.capture.find((u) => u.id === e.target);
      if (!enemy) return true;
      const allies = zones(s, p).allies;
      const total = allies.reduce((n, u) => n + stats(s, u).will, 0);
      choose(
        s,
        `Corsair Skirmisher · Response: discard allies with at least 3 willpower to take control of it as a ship-objective?${seatLabel(s, p)}`,
        [
          ...(total >= 3
            ? [
                {
                  id: "capture",
                  code: enemy.code,
                  label:
                    "Discard allies with at least 3 willpower to capture Corsair Skirmisher",
                  effects: [
                    fx("hdCaptureSelect", {
                      target: enemy.id,
                      ids: [],
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
          {
            id: "decline",
            label: "Do not capture Corsair Skirmisher",
            effects: [fx("hdCaptureDecline", { target: enemy.id, player: p })],
          },
        ],
      );
      return true;
    }
    case "hdCaptureSelect": {
      const enemy = q.capture.find((u) => u.id === e.target);
      if (!enemy) return true;
      const selected = e.ids ?? [];
      const allies = zones(s, p).allies;
      const total = allies
        .filter((u) => selected.includes(u.id))
        .reduce((n, u) => n + stats(s, u).will, 0);
      const options: Option[] = allies
        .filter((u) => !selected.includes(u.id))
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: `Select ${name(u)} (${stats(s, u).will} willpower) · ${total}/3 selected`,
          effects: [
            fx("hdCaptureSelect", {
              target: enemy.id,
              ids: [...selected, u.id],
              player: p,
            }),
          ],
        }));
      if (total >= 3)
        options.unshift({
          id: "pay",
          label: `Discard the selected allies (${total} willpower) and capture Corsair Skirmisher`,
          effects: [
            fx("hdCapturePay", { target: enemy.id, ids: selected, player: p }),
          ],
        });
      options.push({
        id: "decline",
        label: "Do not capture Corsair Skirmisher",
        effects: [fx("hdCaptureDecline", { target: enemy.id, player: p })],
      });
      choose(s, "Corsair Skirmisher · Choose allies to discard", options);
      return true;
    }
    case "hdCapturePay": {
      const i = q.capture.findIndex((u) => u.id === e.target);
      if (i < 0) return true;
      const selected = zones(s, p).allies.filter((u) =>
        (e.ids ?? []).includes(u.id),
      );
      if (selected.reduce((n, u) => n + stats(s, u).will, 0) < 3) {
        prepend(s, fx("hdCaptureDecline", { target: e.target, player: p }));
        return true;
      }
      const [enemy] = q.capture.splice(i, 1);
      for (const ally of selected)
        prepend(s, fx("hdDiscardAlly", { target: ally.id, player: p }));
      const captured = make(s, enemy.code);
      captured.cobasShipObjective = true;
      captured.owner = p;
      captured.controller = p;
      s.allies.push(captured);
      log(
        s,
        `${who(s, p)} ${verb(s, "take")} control of Corsair Skirmisher as a ship-objective (willpower 3).`,
        "good",
      );
      return true;
    }
    case "hdCaptureDecline": {
      const i = q.capture.findIndex((u) => u.id === e.target);
      if (i >= 0) s.encounterDiscard.push(q.capture.splice(i, 1)[0].code);
      return true;
    }
    case "hdWin":
      win(s, "The Dreadnaught is destroyed: the players win the game!");
      return true;
    default:
      return hdCardEffect(s, e);
  }
}

// ---------------------------------------------------------------------------
// Abilities.

const SWAN = [HD.swan, hdBack(HD.swan)];
const CONDITIONS = [HD.grappled, HD.water];
function abilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const q = s.huntDreadnaught;
  if (!q) return "No action.";
  const p = activeSeat(s);
  if (s.phase === "setup") return "Wait for an action window.";
  if (attachmentId) {
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a) return "No action.";
    if (SETUP_CARDS.has(a.code)) {
      if (q.mode === "hard") return "Hard Mode has no Quest Action.";
      if (q.questActionUsed)
        return "The Quest Action was already used this game.";
      if (!["quest", "staging"].includes(s.phase))
        return "This is a Quest Action.";
      if (!globalEngaged(s).some((x) => !card(x.code).is_unique && !isDread(x)))
        return "There is no non-unique enemy engaged with a player.";
      return null;
    }
    if (CONDITIONS.includes(a.code)) {
      if (charactersOf(s, p).filter((x) => !x.exhausted).length < 3)
        return "Exhaust 3 ready characters you control.";
      return null;
    }
    return "No action.";
  }
  if (u.code === HD.destroy) {
    if (!at(s, HD.destroy))
      return "Destroy the Dreadnaught is not the current quest.";
    if (s.progress < hdRoundCap(s))
      return `Remove ${hdRoundCap(s)} progress from the stage.`;
    if (!q.setAside.includes(HD.warship))
      return "There is no set-aside Gondorian Warship.";
    return null;
  }
  if (isDread(u)) {
    if (!at(s, HD.destroy))
      return "Destroy the Dreadnaught is not the current quest.";
    if (s.phase !== "defense" || s.combat)
      return "Use it when the Dreadnaught attacks you.";
    if (!normalAttackPending(s, u, p) || dreadCancelled(s, p))
      return "The Dreadnaught is not about to attack you.";
    return null;
  }
  if (SWAN.includes(u.code)) {
    if (ownerOf(s, u) !== p) return "You do not control this ship.";
    if (u.blanked) return "Its text box is blank.";
    if (s.used.includes(`round:hd-swan:${u.id}`))
      return "Limit once per round.";
    const cost = upgraded(u) ? 1 : 2;
    if (s.heroes.reduce((n, h) => n + h.resources, 0) < cost)
      return `Spend ${cost} resources.`;
    if (!readyTargets(s, upgraded(u)).length)
      return `There is no exhausted ${upgraded(u) ? "card" : "character"}.`;
    return null;
  }
  return "No action.";
}
const dreadCancelled = (s: GameState, p: number) =>
  !!s.huntDreadnaught?.cancelled.some(
    (m) => m.player === p && m.round === s.round,
  );
function ability(s: GameState, u: Unit, attachmentId?: string) {
  if (abilityProblem(s, u, attachmentId)) return false;
  const p = activeSeat(s);
  if (attachmentId) {
    const a = u.attachments.find((x) => x.id === attachmentId)!;
    if (SETUP_CARDS.has(a.code)) {
      prepend(s, fx("hdQuestAction", { player: p }));
      return true;
    }
    prepend(
      s,
      fx("hdcExhaustForCondition", {
        target: u.id,
        source: a.id,
        count: 3,
        player: p,
      }),
    );
    return true;
  }
  if (u.code === HD.destroy) {
    prepend(s, fx("hdWarshipAction", { player: p }));
    return true;
  }
  if (isDread(u)) {
    prepend(s, fx("hdCancelAttack", { player: p }));
    return true;
  }
  if (SWAN.includes(u.code)) {
    s.used.push(`round:hd-swan:${u.id}`);
    const label = upgraded(u)
      ? "Swan of Dol Amroth"
      : "Swan Ship of Dol Amroth";
    // Pay the resources from your heroes (you choose each hero), then ready.
    prepend(
      s,
      fx("hdPay", {
        value: upgraded(u) ? 1 : 2,
        player: p,
        effects: [
          fx("hdReadyChoice", { flag: upgraded(u), text: label, player: p }),
        ],
      }),
    );
    return true;
  }
  return false;
}
const abilityLabel = (code: string) =>
  code === HD.destroy
    ? "Destroy the Dreadnaught · Action: remove 5 progress per player to shuffle a set-aside Gondorian Warship into the encounter deck"
    : code === HD.dreadnaught || code === HD_DAMAGED
      ? "Destroy the Dreadnaught · Response: raise your threat by 4 to cancel the Dreadnaught's attack against you"
      : code === hdBack(HD.easy) || code === hdBack(HD.standard)
        ? `${card(hdPhysical(code)).name} · Quest Action: deal 10 damage to a non-unique engaged enemy${code === hdBack(HD.standard) ? ", then reveal an encounter card" : ""} (once per game)`
        : code === HD.swan
          ? "Swan Ship of Dol Amroth · Action: spend 2 resources to ready a character (once per round)"
          : code === hdBack(HD.swan)
            ? "Swan of Dol Amroth · Action: spend 1 resource to ready a card (once per round)"
            : code === HD.grappled
              ? "Grappled! · Action: exhaust 3 characters to discard Grappled!"
              : code === HD.water
                ? "Taking on Water · Action: exhaust 3 characters to discard Taking on Water"
                : undefined;

// ---------------------------------------------------------------------------
// Silent Mist and Twilight's Call.

const printedCost = (code: string) => Number(card(code).cost);
const playOwner = (s: GameState, c: { playOwner?: number }) =>
  c.playOwner ?? activeSeat(s);
/** Silent Mist: events with an Action and a cost of 3 or more cost 1 less (2 Upgraded). */
function playCostReduction(
  s: GameState,
  c: {
    code: string;
    type_code: string;
    text?: string;
    playOwner?: number;
    playOrigin?: string;
  },
) {
  if (!s.huntDreadnaught || c.type_code !== "event") return 0;
  if (c.playOrigin && c.playOrigin !== "hand") return 0;
  if (!(printedCost(c.code) >= 3)) return 0;
  if (!/Action:/.test(c.text ?? "")) return 0;
  const mist = shipOf(s, playOwner(s, c), HD.silentMist);
  return mist ? (upgraded(mist) ? 2 : 1) : 0;
}
const twilightKey = (p: number) => `round:hd-twilight-first:${p}`;
const twilightActionKey = (p: number) => `round:hd-twilight-action:${p}`;
/** Twilight's Call: the first card each round (each card, Upgraded) needs no resource match. */
function noResourceMatch(s: GameState, c: { playOwner?: number }) {
  if (!s.huntDreadnaught) return false;
  const p = playOwner(s, c);
  const call = shipOf(s, p, HD.twilight);
  if (!call) return false;
  return upgraded(call) || !s.used.includes(twilightKey(p));
}
/** Twilight's Call: play an ally or attachment outside the planning phase (once per round, Basic). */
function playTimingAllowed(
  s: GameState,
  c: { type_code: string; playOwner?: number },
) {
  if (!s.huntDreadnaught) return false;
  if (!["ally", "attachment"].includes(c.type_code)) return false;
  if (s.phase === "setup") return false;
  const p = playOwner(s, c);
  const call = shipOf(s, p, HD.twilight);
  if (!call) return false;
  return upgraded(call) || !s.used.includes(twilightActionKey(p));
}
function playerCardPlayed(s: GameState, u: Unit) {
  const q = s.huntDreadnaught;
  if (!q) return;
  const p = u.owner ?? activeSeat(s);
  if (!s.used.includes(twilightKey(p))) s.used.push(twilightKey(p));
  const c = card(u.code);
  if (
    ["ally", "attachment"].includes(c.type_code) &&
    (s.phase !== "planning" || (s.table && s.table.turn !== p)) &&
    shipOf(s, p, HD.twilight) &&
    !s.used.includes(twilightActionKey(p))
  ) {
    s.used.push(twilightActionKey(p));
    log(s, `Twilight's Call: ${card(u.code).name} is played with its Action.`);
  }
}

// ---------------------------------------------------------------------------
// The hooks.

const stagingHasLive = (s: GameState, code: string) =>
  s.staging.some((u) => live(u, code));
export const HUNT_DREADNAUGHT_HOOKS: Batch4ScenarioHooks = {
  setup: setupHuntDreadnaught,
  startingHandSize: huntDreadnaughtStartingHand,
  // The players advance only at the end of the quest phase (1B); 2B has no quest points.
  advance: (s) => !!s.huntDreadnaught,
  endQuest: (s) => {
    if (
      at(s, HD.search) &&
      s.status === "playing" &&
      s.progress >= hdQuestPoints(s)
    )
      prepend(s, fx("hdAdvance", { player: firstPlayer(s) }));
  },
  stageInfo: hdStageInfo,
  encounter: hdEncounter,
  shadow: hdShadow,
  progress: (s, amount, quest) => {
    const q = s.huntDreadnaught;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    return Math.max(
      0,
      Math.min(amount, hdRoundCap(s) - roundAmount(s, q.questProgress)),
    );
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.huntDreadnaught;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    q.questProgress = {
      round: s.round,
      amount: roundAmount(s, q.questProgress) + amount,
    };
  },
  // Massive: never leaves the staging area, considered engaged with each player.
  consideredEngaged: (s, u, player) =>
    !!s.huntDreadnaught &&
    isDread(u) &&
    s.staging.some((x) => x.id === u.id) &&
    !s.table?.seats[player]?.eliminated,
  cannotEngage: (s, u) => !!s.huntDreadnaught && isDread(u),
  enemyCannotAttack: (s, enemy, player) =>
    !!s.huntDreadnaught && isDread(enemy) && dreadCancelled(s, player),
  stats: (s, u) => {
    const q = s.huntDreadnaught;
    if (!q) return {};
    let will = 0,
      attack = 0,
      defense = 0,
      health = 0;
    if (isDread(u)) health += hdDreadnaughtHealth(s);
    if (roundMarked(q.ramming, s, u.id) && live(u, HD.ramming)) attack += 4;
    if (roundMarked(q.cove, s, u.id)) defense += 2;
    const p = heroOwner(s, u);
    if (p !== undefined) {
      const eith = shipOf(s, p, HD.eithiliant);
      if (eith) will += upgraded(eith) ? 2 : 1;
      const wing = shipOf(s, p, HD.goldenWing);
      if (wing) health += upgraded(wing) ? 2 : 1;
      const pride = shipOf(s, p, HD.pride);
      if (pride) defense += upgraded(pride) ? 2 : 1;
    }
    return will || attack || defense || health
      ? { will, attack, defense, health }
      : {};
  },
  // Southron Sailor: Ship enemies engaged with its player add their threat.
  stagingThreat: (s) => {
    if (!s.huntDreadnaught) return 0;
    let total = 0;
    for (const p of playerOrder(s)) {
      const engaged = zones(s, p).engaged;
      if (!engaged.some((u) => live(u, HD.sailor))) continue;
      total += engaged
        .filter((u) => isShipEnemy(u))
        .reduce((n, u) => n + (Number(card(u.code).threat) || 0), 0);
    }
    return total;
  },
  // The Dreadnaught takes no more than 5 damage per player each round; Corsair
  // Warship cannot be damaged in the staging area.
  damageAmount: (s, u, amount) => {
    const q = s.huntDreadnaught;
    if (!q) return amount;
    if (isDread(u))
      return Math.max(
        0,
        Math.min(amount, hdRoundCap(s) - roundAmount(s, q.dreadDamage)),
      );
    if (live(u, HD.corsairWarship) && s.staging.some((x) => x.id === u.id))
      return 0;
    return amount;
  },
  damageDealt: (s, u, amount, context) => {
    const q = s.huntDreadnaught;
    if (!q || amount <= 0) return;
    if (isDread(u))
      q.dreadDamage = {
        round: s.round,
        amount: roundAmount(s, q.dreadDamage) + amount,
      };
    // Slave Ship: as much damage to a non-Ship character of the defending player.
    const c = s.combat;
    if (!c || !context.combatDamage || context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    if (enemy && live(enemy, HD.slave) && isShipObjective(u))
      prepend(
        s,
        fx("hdcAssign", {
          count: amount,
          flag: true,
          text: "Slave Ship",
          player: p,
        }),
      );
    // Varjax: excess combat damage is dealt to the defender's Ships.
    if (enemy && live(enemy, HD.varjax)) {
      const excess = Math.max(0, u.damage - stats(s, u).health);
      if (excess)
        prepend(
          s,
          fx("hdcShipDamage", { count: excess, text: "Varjax", player: p }),
        );
    }
  },
  roundEnd: (s) =>
    s.huntDreadnaught ? [fx("hdFlipCheck", { player: firstPlayer(s) })] : [],
  hostLeaves: (s, u, destruction) => {
    if (s.huntDreadnaught && destruction && isDread(u))
      prepend(s, fx("hdWin", { player: firstPlayer(s) }));
  },
  enemyDestination: (s, u, destruction) => {
    const q = s.huntDreadnaught;
    if (!q) return false;
    // Corsair Skirmisher: the engaged player may capture it.
    if (destruction && live(u, HD.skirmisher) && !u.cobasShipObjective) {
      const p = u.owner ?? activeSeat(s);
      const held = make(s, u.code);
      q.capture.push(held);
      prepend(s, fx("hdCaptureOffer", { target: held.id, player: p }));
      return true;
    }
    // A non-Ship Corsair enemy goes to the Corsair discard pile.
    if (
      HD_CORSAIR_DECK.includes(u.code) &&
      !(destruction && (card(u.code).victory ?? 0) > 0)
    ) {
      q.corsairDiscard.push(u.code);
      return true;
    }
    return false;
  },
  cannotAttack: (s, character, enemy) => {
    if (!s.huntDreadnaught) return false;
    const p = controllerOf(s, character);
    if (p === undefined) return false;
    const engaged = zones(s, p).engaged;
    if (
      isDread(enemy) &&
      engaged.some((u) => HD_UNIQUES.includes(u.code) && !u.blanked)
    )
      return true;
    if (isShipEnemy(enemy) && engaged.some((u) => live(u, HD.umbarCaptain)))
      return true;
    return false;
  },
  attackProblem: (s, enemy, ids) => {
    const q = s.huntDreadnaught;
    if (!q || !live(enemy, HD.ophidian)) return null;
    if (ids.length > 1 || roundMarked(q.ophidian, s, enemy.id))
      return "No more than 1 character can attack Ophidian each round.";
    return null;
  },
  playerAttackDeclared: (s, enemy, ids) => {
    const q = s.huntDreadnaught;
    if (q && live(enemy, HD.ophidian) && ids.length)
      q.ophidian = [
        ...q.ophidian.filter((m) => m.round === s.round),
        { id: enemy.id, round: s.round },
      ];
    return true;
  },
  cannotAttach: (s, u) =>
    !!s.huntDreadnaught &&
    [
      HD.blackSails,
      HD.skiff,
      HD.corsairWarship,
      HD.ramming,
      HD.slave,
      HD.galley,
    ].some((c) => live(u, c)),
  cannotReady: (s, u) =>
    !!s.huntDreadnaught &&
    u.attachments.some((a) => a.code === HD.grappled && !a.blanked),
  immune: (s, u) => {
    const q = s.huntDreadnaught;
    if (!q) return false;
    // Wicked Cove: each location in the staging area.
    if (
      card(u.code).type_code === "location" &&
      s.staging.some((x) => x.id === u.id) &&
      stagingHasLive(s, HD.cove)
    )
      return true;
    return roundMarked(q.cove, s, u.id);
  },
  // Overworked: each non-Ship ally's text box is blank this round.
  characterBlanked: (s, u) =>
    s.huntDreadnaught?.overworked === s.round &&
    ["ally", "objective-ally"].includes(unitType(u)) &&
    !isShipObjective(u),
  // Hard Mode: no more than 1 threat reduced each round.
  threatReduction: (s, amount) => {
    const q = s.huntDreadnaught;
    if (!q || q.mode !== "hard" || s.round < 1) return amount;
    const p = activeSeat(s);
    const entry = q.threatReduced.find(
      (m) => m.player === p && m.round === s.round,
    );
    const allowed = Math.max(0, Math.min(amount, 1 - (entry?.amount ?? 0)));
    if (allowed < amount)
      log(
        s,
        "Hard Mode: each player's threat cannot be reduced by more than 1 each round.",
      );
    q.threatReduced = q.threatReduced.filter((m) => m.round === s.round);
    const kept = q.threatReduced.find((m) => m.player === p);
    if (kept) kept.amount += allowed;
    else if (allowed)
      q.threatReduced.push({ player: p, round: s.round, amount: allowed });
    return allowed;
  },
  healed: (s, u, amount) => {
    const q = s.huntDreadnaught;
    if (!q || q.mode !== "hard" || amount <= 0 || !byPlayerCard(s)) return;
    const p = controllerOf(s, u);
    if (p !== undefined)
      prepend(s, fx("hdcThreat", { value: 1, text: "Hard Mode", player: p }));
  },
  characterReadied: (s, u) => {
    const q = s.huntDreadnaught;
    if (!q || q.mode !== "hard" || !byPlayerCard(s)) return;
    const p = controllerOf(s, u);
    if (p !== undefined)
      prepend(s, fx("hdcThreat", { value: 1, text: "Hard Mode", player: p }));
  },
  characterExhausted: (s, u) => {
    const q = s.huntDreadnaught;
    if (!q || !isShipObjective(u)) return;
    const p = controllerOf(s, u);
    if (p === undefined) return;
    // Taking on Water: deal 2 damage to the exhausted ship.
    for (const a of u.attachments)
      if (a.code === HD.water && !a.blanked)
        prepend(s, fx("damage", { target: u.id, value: 2, player: p }));
    // Brash Corsair: attacks the player who exhausted a Ship objective.
    for (const b of zones(s, p).engaged.filter((x) => live(x, HD.brash)))
      prepend(s, fx("immediateAttack", { target: b.id, player: p }));
  },
  // Easy Mode: each player draws 1 additional card in the resource phase.
  resourceStart: (s) =>
    s.huntDreadnaught?.mode === "easy"
      ? playerOrder(s).map((player) => fx("hdcEasyDraw", { player }))
      : [],
  cardsDrawn: (s, player, count, cardEffect) => {
    // Tolfalas Landing: drawing from a player card effect raises the threat.
    if (!s.huntDreadnaught || !cardEffect || s.phase === "setup") return;
    if (!byPlayerCard(s)) return;
    const landings = s.staging.filter((u) => live(u, HD.tolfalas)).length;
    if (landings && count > 0)
      prepend(
        s,
        ...Array.from({ length: landings }, () =>
          fx("hdcThreat", { value: count, text: "Tolfalas Landing", player }),
        ),
      );
  },
  // Mouths of Anduin: a canceled 'when revealed' effect reveals another card.
  whenRevealedCancelled: (s) => {
    if (!s.huntDreadnaught) return;
    prepend(
      s,
      ...s.staging
        .filter((u) => live(u, HD.mouths))
        .map(() => fx("reveal", { player: firstPlayer(s) })),
    );
  },
  combatBegin: (s) => {
    const q = s.huntDreadnaught;
    if (!q) return;
    const ballista = q.ballista?.round === s.round ? 2 * q.ballista.count : 0;
    let archery = 0;
    for (const u of enemiesInPlay(s)) {
      const staged = s.staging.some((x) => x.id === u.id);
      if (isShipEnemy(u)) archery += ballista;
      if (u.blanked) continue;
      if (u.code === HD.dreadnaught) archery += hdPlayers(s);
      if (u.code === HD.blackSails && staged) archery += 3;
      if (u.code === HD.corsairWarship && staged) archery += 4;
      if (u.code === HD.galley) archery += 2;
      if (u.code === HD.varjax) archery += 3;
    }
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  combatEnd: (s) => {
    const q = s.huntDreadnaught;
    if (!q) return;
    // Captain of the Haven: an engaged player with no cards in deck is eliminated.
    for (const p of playerOrder(s))
      if (
        zones(s, p).engaged.some((u) => live(u, HD.captain)) &&
        !zones(s, p).deck.length &&
        !q.eliminated.includes(p)
      ) {
        q.eliminated.push(p);
        log(
          s,
          `Captain of the Haven: ${who(s, p)} ${s.table ? "has" : "have"} no cards in ${their(s)} deck.`,
          "danger",
        );
      }
  },
  enemyAttackStarted: (s, enemy, player) => {
    const q = s.huntDreadnaught;
    if (!q) return;
    const extra = q.extraShadows.find((m) => m.id === enemy.id);
    if (extra) {
      q.extraShadows = q.extraShadows.filter((m) => m.id !== enemy.id);
      prepend(
        s,
        fx("hdcExtraShadows", { target: enemy.id, count: extra.count, player }),
      );
    }
    // 2B: an immediate attack by the Dreadnaught may be canceled for 4 threat.
    if (isDread(enemy) && at(s, HD.destroy) && s.combat?.immediate)
      prepend(s, fx("hdcCancelOffer", { target: enemy.id, player }));
  },
  attackFinished: (s, combat) => hdAttackFinished(s, combat),
  engaged: (s, u, _optional, fromStaging) => hdEngaged(s, u, !!fromStaging),
  defendersDeclared: (s, enemy, defenders) =>
    s.huntDreadnaught && live(enemy, HD.ophidian)
      ? defenders.map((d) =>
          fx("damage", {
            target: d.id,
            value: 2,
            player: controllerOf(s, d) ?? activeSeat(s),
          }),
        )
      : [],
  enemyEntered: (s, u) => {
    if (!s.huntDreadnaught || !isShipEnemy(u)) return;
    // Isle of Fortune: a resource is discarded after a Ship enemy enters play.
    for (const isle of [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
    ])
      if (live(isle, HD.isle) && isle.resources > 0) {
        isle.resources -= 1;
        log(
          s,
          "Isle of Fortune: a Ship enemy enters play and a resource is discarded from it.",
        );
      }
  },
  cardEntered: (s, u) => {
    if (s.huntDreadnaught && u.code === HD.isle) u.resources = hdPlayers(s);
  },
  explored: (s, u, wasActive) => {
    if (!s.huntDreadnaught || !wasActive || u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === HD.shipyard)
      prepend(s, fx("hdcShipyard", { player: first }));
    if (u.code === HD.isle && u.resources > 0)
      prepend(s, fx("hdcIsle", { count: u.resources, player: first }));
  },
  characterLeft: (s, u, _controller, destination) => {
    const q = s.huntDreadnaught;
    if (!q) return;
    // Gondorian Warship: when destroyed, it is set aside, out of play.
    if (u.code === HD.warship && destination === "discard") {
      if (takeFrom(s.encounterDiscard, HD.warship)) {
        q.setAside.push(HD.warship);
        log(s, "Gondorian Warship is destroyed and set aside, out of play.");
      }
    }
  },
  playerEliminationReason: (s, player) => {
    const q = s.huntDreadnaught;
    if (!q) return undefined;
    if (q.eliminated.includes(player))
      return s.table
        ? `Captain of the Haven: ${who(s, player)} has no cards in their deck and is eliminated from the game.`
        : "Captain of the Haven: you have no cards in your deck and are eliminated from the game.";
    if (q.fleetReady && s.phase !== "setup" && !shipsOf(s, player).length)
      return s.table
        ? `${who(s, player)} controls no ship-objective and is eliminated from the game.`
        : "You control no ship-objective and are eliminated from the game.";
    return undefined;
  },
  check: (s) => {
    const q = s.huntDreadnaught;
    if (!q) return;
    // Each other side's physical card is its front.
    if (s.encounterDiscard.some((c) => c.endsWith(":B")))
      s.encounterDiscard = s.encounterDiscard.map(hdPhysical);
  },
  // Eithiliant's Setup: the chosen hero gains another hero's printed Traits.
  dynamicTraits: (s, u) =>
    s.huntDreadnaught?.traits
      .filter((m) => m.id === u.id)
      .flatMap((m) => m.traits) ?? [],
  // Golden Wing: its Setup hero, and with its Upgraded side each hero of its controller, gains ranged.
  dynamicKeywords: (s, u) => {
    const q = s.huntDreadnaught;
    if (!q) return [];
    if (q.ranged.includes(u.id)) return ["Ranged"];
    const p = heroOwner(s, u);
    if (p === undefined) return [];
    const wing = shipOf(s, p, HD.goldenWing);
    return wing && upgraded(wing) ? ["Ranged"] : [];
  },
  // The Setup card stays next to the quest deck when 1B is defeated.
  preserveQuestAttachment: (s, _code, a) =>
    !!s.huntDreadnaught && SETUP_CARDS.has(a.code),
  playCostReduction,
  noResourceMatch,
  playTimingAllowed,
  playerCardPlayed,
  abilityLabel,
  abilityProblem,
  ability,
  effect: hdEffect,
  sharedEffect: (e) =>
    [
      "hdAdvance",
      "hdStageTwo",
      "hdDreadnaughtArrives",
      "hdFlipCheck",
      "hdWin",
      "hdMode",
      "hdChooseMode",
      ...HD_CARD_SHARED,
    ].includes(e.kind),
};
