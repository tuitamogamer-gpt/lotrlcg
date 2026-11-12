import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, draw, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardCharacter,
  enemyAddedToStaging,
  engage,
  progressLocation,
  questDefeated,
  raiseThreat,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { surgeEffects } from "./surge";
import { hideFailed, hideKeyword } from "./hide-test";
import { lotrSagaCheck, oneRing, oneRingExhausted } from "./lotr-saga";
import {
  SHADOW_PAST_QUESTS,
  SHADOW_PAST_RECIPES,
  SP,
  isNazgul,
  shadowPastStageInfo,
  spLocations,
} from "./shadow-past-support";
export * from "./shadow-past-support";

const TREACHERIES = [
  SP.crawling,
  SP.hunting,
  SP.baggins,
  SP.cry,
  SP.steed,
  SP.gale,
  SP.lure,
];
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const isMorgul = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Morgul");
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
function nextPlayer(s: GameState, p: number) {
  const order = playerOrder(s);
  if (order.length < 2) return undefined;
  return order[(order.indexOf(p) + 1) % order.length];
}
/** Return an engaged enemy to the staging area; its shadow cards are discarded. */
function returnToStaging(s: GameState, u: Unit) {
  if (!allEngaged(s).some((x) => x.id === u.id)) return false;
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  log(s, `${name(u)} returns to the staging area.`, "danger");
  return true;
}
/** Take a card out of the encounter deck, else the discard pile. */
function search(s: GameState, test: (code: string) => boolean) {
  const i = s.encounterDeck.findIndex(test);
  if (i >= 0) return s.encounterDeck.splice(i, 1)[0];
  for (let j = s.encounterDiscard.length - 1; j >= 0; j--)
    if (test(s.encounterDiscard[j])) return s.encounterDiscard.splice(j, 1)[0];
  return undefined;
}
const steedOf = (u: Unit) =>
  u.attachments.some((a) => a.code === SP.steed && !a.blanked);

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupShadowPast(s: GameState) {
  const r = SHADOW_PAST_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const code of section("sharedStagingArea"))
    s.staging.push(make(s, code));
  const [bagEnd] = section("sharedActiveLocation");
  if (bagEnd) s.activeLocation = make(s, bagEnd);
  s.shadowPast = {
    currentQuest: SP.company,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    noCancel: false,
  };
  log(
    s,
    "Three is Company: Bucklebury Ferry is set aside, a Black Rider waits in the staging area and Bag End is the active location.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.shadowPast;
  if (!q) return false;
  const goal = shadowPastStageInfo(s)?.quest ?? 0;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    s.hideTest ||
    goal <= 0 ||
    s.progress < goal
  )
    return true;
  // 1B: the players cannot advance unless Bag End is in the victory display.
  if (s.stage === 1 && !(s.victoryCards ?? []).includes(SP.bagEnd)) return true;
  q.advancing = true;
  prepend(s, fx("spDefeatQuest", { player: firstPlayer(s) }));
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
  const q = s.shadowPast;
  if (!q) return false;
  const player = activeSeat(s),
    first = firstPlayer(s);
  if (code === SP.rider) {
    if (fromReveal)
      prepend(s, fx("hideBegin", { value: hideKeyword(code), code, player }));
    return true;
  }
  if (code === SP.stockBrook) {
    if (fromReveal) prepend(s, fx("spStockBrook", { player: first }));
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
  const hide = hideKeyword(code);
  prepend(
    s,
    // Hide X resolves before the rest of the card.
    ...(hide ? [fx("hideBegin", { value: hide, code, player })] : []),
    fx("spTreachery", { code, source: u.id, player }),
    fx("spTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.shadowPast) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case SP.crawling:
    case SP.gale:
      c.spReturn = true;
      return true;
    case SP.pathless:
      c.spPathless = true;
      return true;
    case SP.marish:
    case SP.greenHill:
      c.attackBonus += hideFailed(s, p, "round") ? 2 : 1;
      return true;
    case SP.crow:
      if (hideFailed(s, p, "round")) {
        c.defenderId = null;
        c.defenderIds = [];
        log(s, "Evil Crow: this attack is considered undefended.", "danger");
      }
      return true;
    case SP.cry:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      return true;
    case SP.lure:
      c.attackBonus += oneRingExhausted(s) ? 2 : 1;
      return true;
  }
  return false;
}
function treachery(s: GameState, code: string, source: string, p: number) {
  const first = firstPlayer(s);
  switch (code) {
    case SP.crawling:
      if (!hideFailed(s, p, "phase")) return;
      prepend(s, fx("spRemoveFromQuest", { player: p }));
      return;
    case SP.hunting:
      prepend(
        s,
        ...[...playerOrder(s)]
          .reverse()
          .map((player) => fx("spHunting", { player })),
      );
      return;
    case SP.baggins: {
      const heroes = globalCharacters(s).filter(
        (h) =>
          card(h.code).type_code === "hero" &&
          !h.attachments.some((a) => a.code === SP.baggins),
      );
      if (!heroes.length) return;
      choose(
        s,
        "Have you seen Baggins? · Attach to a hero",
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [fx("spAttach", { target: h.id, source, player: p })],
        })),
        "Forced: After a player fails a Hide test, discard attached hero.",
      );
      return;
    }
    case SP.cry: {
      const found = [...s.encounterDeck, ...s.encounterDiscard].some((c) =>
        isNazgul(c),
      );
      if (!found) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Piercing Cry: no Nazgûl enemy is in the encounter deck or discard pile.",
        );
        return;
      }
      choose(
        s,
        "Piercing Cry · Where does the Nazgûl enemy go?",
        [
          {
            id: "staging",
            label: "Add it to the staging area",
            effects: [fx("spCry", { flag: false, player: p })],
          },
          {
            id: "engaged",
            label: `Put it into play engaged with ${who(s, first)}`,
            effects: [fx("spCry", { flag: true, player: p })],
          },
        ],
        "Search the encounter deck and discard pile for a Nazgûl enemy, then shuffle the encounter deck.",
      );
      return;
    }
    case SP.steed: {
      const riders = [...s.staging, ...allEngaged(s)].filter(
        (u) => isNazgul(u) && !steedOf(u),
      );
      if (!riders.length) {
        log(s, "Black Steed: no Nazgûl enemy in play can take it.");
        return;
      }
      choose(
        s,
        "Black Steed · Attach to a Nazgûl enemy",
        riders.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${allEngaged(s).some((x) => x.id === u.id) ? ` · engaged with ${who(s, ownerOf(s, u))}` : " · staging area"}`,
          effects: [fx("spAttach", { target: u.id, source, player: p })],
        })),
        "Attached enemy gets −10 engagement cost and returns to the staging area at the end of the refresh phase.",
      );
      return;
    }
    case SP.gale: {
      const riders = allEngaged(s).filter((u) => isNazgul(u));
      for (const u of riders) returnToStaging(s, u);
      if (!riders.length) {
        log(
          s,
          "Rode Like a Gale: no Nazgûl enemy was engaged. It gains surge.",
        );
        prepend(s, ...surgeEffects(SP.gale));
      }
      return;
    }
    case SP.lure: {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) {
        prepend(s, fx("spLureThreat", { player: first }));
        return;
      }
      choose(s, "Lure of the Ring · The first player chooses", [
        {
          id: "exhaust",
          label: "Exhaust The One Ring",
          code: ring.code,
          effects: [fx("spLureExhaust", { player: first })],
        },
        {
          id: "threat",
          label: "Raise your threat by 3",
          effects: [fx("spLureThreat", { player: first })],
        },
      ]);
      return;
    }
  }
}
/** After a failed Hide test: Black Riders attack, then The Marish, then Baggins. */
function failForced(s: GameState, player: number) {
  const first = firstPlayer(s);
  const riders = seatView(s, player).engaged.filter(
    (u) => u.code === SP.rider && !u.blanked,
  );
  const marishes = spLocations(s).filter(
    (l) => l.code === SP.marish && !l.blanked,
  ).length;
  const marked = globalCharacters(s).filter((h) =>
    h.attachments.some((a) => a.code === SP.baggins && !a.blanked),
  );
  prepend(
    s,
    ...riders.map((u) => fx("immediateAttack", { target: u.id, player })),
    ...Array.from({ length: marishes }, () =>
      fx("spMarish", { player: first }),
    ),
    ...marked.map((h) =>
      fx("spBagginsDiscard", { target: h.id, player: ownerOf(s, h) }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Effects.

export function shadowPastEffect(s: GameState, e: Effect): boolean {
  const q = s.shadowPast;
  if (!q || !e.kind.startsWith("sp")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "spDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("spNextStage", { player: first }));
      return true;
    }
    case "spNextStage": {
      q.advancing = false;
      if (s.stage >= SHADOW_PAST_QUESTS.length) return true;
      s.stage += 1;
      q.currentQuest = SHADOW_PAST_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      prepend(
        s,
        ...(s.stage === 3 ? [fx("spFerry", { player: first })] : []),
        fx("spRevealRider", { player: first }),
      );
      return true;
    }
    case "spFerry": {
      const i = q.setAside.indexOf(SP.ferry);
      if (i < 0) return true;
      q.setAside.splice(i, 1);
      s.staging.push(make(s, SP.ferry));
      log(
        s,
        "Escape to Buckland: Bucklebury Ferry is added to the staging area.",
        "chapter",
      );
      return true;
    }
    case "spRevealRider": {
      const code = search(s, (c) => c === SP.rider);
      if (!code) {
        shuffle(s, s.encounterDeck);
        log(s, "No Black Rider is in the encounter deck or discard pile.");
        return true;
      }
      q.noCancel = true;
      log(
        s,
        `${card(q.currentQuest).name}: ${who(s, first)} reveal${s.table ? "s" : ""} a Black Rider (it cannot be canceled).`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", { code, revealOrigin: "encounter", player: first }),
        fx("spRevealRiderDone", { player: first }),
      );
      return true;
    }
    case "spRevealRiderDone":
      q.noCancel = false;
      shuffle(s, s.encounterDeck);
      return true;
    case "spTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id, p);
      return true;
    }
    case "spTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "spAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u) return true;
      const held = q.resolving.splice(i, 1)[0];
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "spRemoveFromQuest":
      forOwner(s, p, () => {
        for (const c of [...s.heroes, ...s.allies].filter((x) => x.committed))
          removeFromQuest(s, c);
        s.committedIds = [];
      });
      log(
        s,
        `Crawling Towards Him: ${who(s, p)} failed a Hide test this phase; ${s.table ? "their" : "your"} characters are removed from the quest.`,
        "danger",
      );
      return true;
    case "spHunting": {
      const riders = seatView(s, p).engaged.filter((x) => isNazgul(x));
      const hide = fx("hideBegin", { value: 2, code: SP.hunting, player: p });
      if (!riders.length) {
        prepend(s, hide);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Hunting for the Ring${s.table ? ` · ${seatName(s, p)}` : ""}`,
          [
            ...riders.map((x) => ({
              id: x.id,
              code: x.code,
              label: `Return ${name(x)} to the staging area`,
              effects: [fx("spReturn", { target: x.id, player: p })],
            })),
            { id: "hide", label: "Make a Hide 2 test", effects: [hide] },
          ],
          "Return a Nazgûl enemy engaged with you to the staging area, or make a Hide 2 test.",
        ),
      );
      return true;
    }
    case "spReturn":
      if (u) returnToStaging(s, u);
      return true;
    case "spCry": {
      const code = search(s, (c) => isNazgul(c));
      shuffle(s, s.encounterDeck);
      if (!code) return true;
      const rider = make(s, code);
      s.staging.push(rider);
      if (e.flag) {
        forOwner(s, first, () => engage(s, rider));
        log(
          s,
          `Piercing Cry: ${card(code).name} enters play engaged with ${who(s, first)}.`,
          "danger",
        );
      } else {
        enemyAddedToStaging(s, rider);
        log(
          s,
          `Piercing Cry: ${card(code).name} is added to the staging area.`,
          "danger",
        );
      }
      return true;
    }
    case "spLureExhaust": {
      const ring = oneRing(s);
      if (ring && !ring.exhausted) {
        ring.exhausted = true;
        log(s, "Lure of the Ring: The One Ring is exhausted.", "danger");
      } else prepend(s, fx("spLureThreat", { player: first }));
      return true;
    }
    case "spLureThreat":
      raiseThreat(s, 3, "encounter");
      log(
        s,
        "Lure of the Ring: the first player raises their threat by 3.",
        "danger",
      );
      return true;
    case "spNazgulEngage": {
      const riders = s.staging.filter(
        (x) => isNazgul(x) && card(x.code).type_code === "enemy",
      );
      for (const x of riders) forOwner(s, p, () => engage(s, x));
      if (riders.length)
        log(
          s,
          `Failed Hide test: ${riders.map((x) => name(x)).join(", ")} engage${riders.length === 1 ? "s" : ""} ${who(s, p)}.`,
          "danger",
        );
      return true;
    }
    case "spFailForced":
      failForced(s, p);
      return true;
    case "spMarish": {
      const i = s.encounterDiscard.findIndex((c) => isNazgul(c));
      if (i < 0) return true;
      const code = s.encounterDiscard.splice(i, 1)[0];
      s.encounterDeck.push(code);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `The Marish: ${card(code).name} is shuffled from the discard pile into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "spBagginsDiscard":
      if (u && u.attachments.some((a) => a.code === SP.baggins && !a.blanked)) {
        log(s, `Have you seen Baggins?: ${name(u)} is discarded.`, "danger");
        discardCharacter(s, u);
      }
      return true;
    case "spBucklandOffer": {
      const x = 2 * playerOrder(s).length;
      const locations = spLocations(s).filter((l) => !card(l.code).is_unique);
      if (!locations.length) return true;
      choose(
        s,
        `Escape to Buckland · Place ${x} progress on a non-unique location?`,
        [
          ...locations.map((l): Option => ({
            id: l.id,
            code: l.code,
            label: `${name(l)} (${l.progress} progress)`,
            effects: [
              fx("spBucklandProgress", { target: l.id, value: x, player: p }),
            ],
          })),
          { id: "skip", label: "Decline", effects: [] },
        ],
        "Response: after a player makes a successful Hide test.",
      );
      return true;
    }
    case "spBucklandProgress":
      if (u && spLocations(s).some((l) => l.id === u.id)) {
        log(
          s,
          `Escape to Buckland: ${e.value} progress is placed on ${name(u)}.`,
          "good",
        );
        progressLocation(s, u, e.value ?? 0);
      }
      return true;
    case "spStockBrook": {
      const brook = s.staging.find((x) => x.code === SP.stockBrook);
      if (!brook) return true;
      for (const l of allActiveLocations(s)) {
        s.staging.push(l);
        log(s, `${name(l)} returns to the staging area.`);
      }
      s.activeLocation = null;
      s.extraActiveLocations = [];
      log(s, "Stock-brook: the players immediately travel there.", "danger");
      prepend(
        s,
        fx("travelEnter", {
          target: brook.id,
          text: "strider-replace",
          flag: true,
        }),
      );
      return true;
    }
    case "spBamfurlong": {
      const players = playerOrder(s).filter((player) =>
        seatView(s, player).engaged.some((x) => isNazgul(x)),
      );
      prepend(
        s,
        ...players.map((player) => fx("spBamfurlongReady", { player })),
      );
      return true;
    }
    case "spBamfurlongReady": {
      const heroes = seatView(s, p).heroes.filter((h) => h.exhausted);
      if (!heroes.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Bamfurlong · Ready a hero${s.table ? ` · ${seatName(s, p)}` : ""}?`,
          [
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Ready ${name(h)}`,
              effects: [fx("ready", { target: h.id, player: p })],
            })),
            { id: "skip", label: "Decline", effects: [] },
          ],
        ),
      );
      return true;
    }
    case "spBagEnd":
      for (const player of playerOrder(s)) {
        const n = seatView(s, player).heroes.filter((h) =>
          /\bHobbit\b/.test(card(h.code).traits ?? ""),
        ).length;
        if (n) forOwner(s, player, () => draw(s, n));
      }
      log(
        s,
        "Bag End: each player draws 1 card for each Hobbit hero they control.",
        "good",
      );
      return true;
    case "spSteedReturn":
      if (u && steedOf(u)) returnToStaging(s, u);
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

export const SHADOW_PAST_HOOKS: Batch4ScenarioHooks = {
  setup: setupShadowPast,
  advance,
  stageInfo: shadowPastStageInfo,
  check: (s) => {
    if (s.shadowPast) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  whenRevealedCancelled: (s, code) => {
    // A canceled When Revealed effect leaves the Hide X keyword.
    const x = hideKeyword(code);
    if (s.shadowPast && x && TREACHERIES.includes(code))
      prepend(s, fx("hideBegin", { value: x, code, player: activeSeat(s) }));
  },
  cannotCancel: (s, shadowEffect) => !!s.shadowPast?.noCancel && !shadowEffect,
  hideWillpower: (s) => (s.shadowPast && activeIs(s, SP.greenHill) ? 1 : 0),
  hideValueBonus: (s, player) =>
    !s.shadowPast
      ? 0
      : (activeIs(s, SP.woody) ? -1 : 0) +
        seatView(s, player).engaged.filter(
          (u) => u.code === SP.crow && !u.blanked,
        ).length,
  hideThreatBonus: (s, player) =>
    !s.shadowPast
      ? 0
      : 2 *
          s.staging.filter((l) => l.code === SP.stockRoad && !l.blanked)
            .length +
        (s.stage === 2 && stageLive(s) ? seatView(s, player).allies.length : 0),
  hideFailed: (s, player) =>
    s.shadowPast
      ? [fx("spNazgulEngage", { player }), fx("spFailForced", { player })]
      : [],
  hidePassed: (s, player) =>
    s.shadowPast && s.stage === 3 && stageLive(s)
      ? [fx("spBucklandOffer", { player })]
      : [],
  engagementBonus: (s, u) => (s.shadowPast && steedOf(u) ? -10 : 0),
  cannotAttach: (s, u, code) =>
    !!s.shadowPast && u.code === SP.rider && !u.blanked && !isMorgul(code),
  immune: (s, u) => !!s.shadowPast && u.code === SP.ferry,
  locationQuestBonus: (s, u) =>
    s.shadowPast &&
    u.code === SP.pathless &&
    !u.blanked &&
    s.staging.some((x) => x.id === u.id)
      ? 4
      : 0,
  travelProblem: (s, u) => {
    if (!s.shadowPast || u.code !== SP.ferry) return null;
    return spLocations(s).some((l) => l.id !== u.id)
      ? "Bucklebury Ferry: the players cannot travel here while there is another location in play."
      : null;
  },
  travelEffects: (s, u) =>
    !s.shadowPast || u.blanked
      ? undefined
      : u.code === SP.ferry
        ? [
            fx("hideBegin", {
              value: 3,
              code: SP.ferry,
              player: firstPlayer(s),
            }),
          ]
        : u.code === SP.stockRoad
          ? [
              fx("hideBegin", {
                value: 1,
                code: SP.stockRoad,
                player: firstPlayer(s),
              }),
            ]
          : undefined,
  travelEntered: (s, u) => {
    if (s.shadowPast && u.code === SP.bamfurlong && !u.blanked)
      prepend(s, fx("spBamfurlong", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (!s.shadowPast) return;
    if (u.code === SP.ferry) {
      win(s);
      s.reason =
        "Bucklebury Ferry is explored: the hobbits cross the Brandywine and escape the Black Riders.";
    } else if (u.code === SP.bagEnd && !u.blanked)
      prepend(s, fx("spBagEnd", { player: firstPlayer(s) }));
  },
  roundEnd: (s) =>
    !s.shadowPast
      ? []
      : allEngaged(s)
          .filter((u) => steedOf(u))
          .map((u) =>
            fx("spSteedReturn", { target: u.id, player: ownerOf(s, u) }),
          ),
  attackFinished: (s, combat, skipped = false) => {
    if (!s.shadowPast || skipped) return [];
    const enemy = get(s, combat.enemyId);
    if (!enemy) return [];
    const p = combat.attackPlayer ?? firstPlayer(s);
    const effects: Effect[] = [];
    if (combat.spReturn)
      effects.push(fx("spReturn", { target: enemy.id, player: p }));
    const next = nextPlayer(s, p);
    if (combat.spPathless && next !== undefined)
      effects.push(fx("spPathlessEngage", { target: enemy.id, player: next }));
    return effects;
  },
  effect: (s, e) => {
    if (e.kind === "spPathlessEngage") {
      const u = get(s, e.target);
      if (!u || !s.shadowPast) return true;
      if (
        s.staging.some((x) => x.id === u.id) ||
        allEngaged(s).some((x) => x.id === u.id)
      ) {
        forOwner(s, e.player ?? activeSeat(s), () => engage(s, u));
        log(
          s,
          `Pathless Country: ${name(u)} engages ${who(s, e.player ?? activeSeat(s))} and attacks.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: e.player }));
      }
      return true;
    }
    return shadowPastEffect(s, e);
  },
  sharedEffect: (e) =>
    [
      "spDefeatQuest",
      "spNextStage",
      "spFerry",
      "spRevealRiderDone",
      "spMarish",
      "spBamfurlong",
      "spBagEnd",
    ].includes(e.kind),
};
