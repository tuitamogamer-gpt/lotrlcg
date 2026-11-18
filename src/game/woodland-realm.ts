import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
} from "./core";
import type { WoodlandRealmState } from "./woodland-realm-types";
import { depositInFlightEncounterCards, enterEnemyEngaged } from "./board";
import { dealEnemyShadows } from "./considered-engagement";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { canTravel } from "./actions";
import {
  WR,
  WR_EVENT_CARDS,
  wrCost,
  wrHasTrait,
  wrRecipe,
  wrStageInfo,
} from "./woodland-realm-support";
import { wrCardEffect, wrEncounter, wrShadow } from "./woodland-realm-cards";
import {
  fellowshipEventComplete,
  fellowshipEventDefeat,
  fellowshipEventEffect,
  fellowshipEventOpening,
  fellowshipEventSharedKinds,
  type FellowshipEventConfig,
} from "./fellowship-event";
import { fellowshipEventState } from "./fellowship-event-support";
import {
  charactersOf,
  engagedWith,
  inPlay,
  isEnemy,
  isLocation,
  live,
  phaseKey,
  players,
  searchable,
  seatLabel,
  stageNumber,
  takeSearched,
  toStaging,
  who,
} from "./fellowship-event-lib";
export * from "./woodland-realm-support";

/**
 * The Woodland Realm (2018 Fellowship event), played cooperatively. The
 * players build the quest deck from Captured by Spiders and one stage 2 and
 * one stage 3 card, and the encounter deck from 7 of the 14 encounter sets
 * (the quick build); the first player resolves each 'opposing team' effect.
 * They rescue Mendor from the Spider Den and follow him to the Elvenking's
 * halls; if Mendor leaves play, they lose.
 */
const at = (s: GameState, code: string) =>
  s.woodlandRealm?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const atStage2B = (s: GameState) => stageNumber(s) === 2 && !s.stageRevealing;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
const isCharacter = (u: Unit) =>
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code);
const mendor = (s: GameState) =>
  playerOrder(s)
    .flatMap((p) => seatView(s, p).allies)
    .find((u) => u.code === WR.mendor);
const mendorSeat = (s: GameState) =>
  playerOrder(s).find((p) =>
    seatView(s, p).allies.some((u) => u.code === WR.mendor),
  );
const hasWeb = (u: Unit) => u.attachments.some((a) => a.code === WR.web);
const enemies = (s: GameState) => [
  ...s.staging.filter(isEnemy),
  ...globalEngaged(s),
];
/** Lost in the Dark: the first treachery revealed this round, while it resolves. */
const firstTreachery = (s: GameState, q: WoodlandRealmState, code: string) =>
  at(s, WR.dark) &&
  q.firstTreachery?.round === s.round &&
  q.firstTreachery.open &&
  q.firstTreachery.code === code;
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}

/** The shared quick build, with this scenario's stage effects. */
const WR_EVENT: FellowshipEventConfig = {
  ...WR_EVENT_CARDS,
  prefix: "wr",
  state: (s) => s.woodlandRealm,
  stageRevealed: (s, code) =>
    code === WR.fear ? [fx("wrFearSearch", { player: firstPlayer(s) })] : [],
};

// ---------------------------------------------------------------------------
// Setup.

export function setupWoodlandRealm(s: GameState) {
  const r = wrRecipe();
  const cards = r.cards.flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = [];
  s.woodlandRealm = {
    ...fellowshipEventState(cards, WR.request),
    mendorId: null,
    markedId: null,
    cap: null,
    firstTreachery: null,
    hallsProgress: null,
    reduced: [],
    despairRound: null,
    blankShadow: [],
    noPlayerReady: null,
    noReady: [],
    streamHeroes: [],
    labyrinth: null,
    labyrinthShadow: [],
    defenseBoosts: [],
    noDamage: [],
    eaves: [],
    engagedRound: [],
    webPaid: [],
    uncancelable: [],
    resolving: [],
  };
  log(
    s,
    "The Woodland Realm: the players choose a stage 2 and a stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.woodlandRealm;
  if (!q) return false;
  if (!fellowshipEventComplete(s, q, wrStageInfo(s)?.quest ?? 0)) return true;
  // 1B: the first player must control Mendor.
  if (q.currentQuest === WR.request && mendorSeat(s) !== firstPlayer(s))
    return true;
  // The Forest of Great Fear: the enemy with a resource must leave play.
  if (q.currentQuest === WR.fear && q.markedId && inPlay(s, q.markedId))
    return true;
  fellowshipEventDefeat(
    s,
    WR_EVENT,
    "Mendor leads the players into the Elvenking's halls: they win the game!",
  );
  return true;
}

function wrStageEffect(s: GameState, e: Effect): boolean {
  const q = s.woodlandRealm;
  if (!q || !e.kind.startsWith("wr")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    // Spider Den's travel: a 0 cost enemy (1 or less with two or more players).
    case "wrDenTravel": {
      const max = players(s) >= 2 ? 1 : 0;
      const options = searchable(
        s,
        (c) => card(c).type_code === "enemy" && wrCost(c) <= max,
      );
      if (!options.length) {
        log(s, `Spider Den: there is no enemy with cost ${max} or less.`);
        prepend(s, fx("wrShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Spider Den · The opposing team adds an enemy with cost ${max} or less to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${wrCost(c)})`,
          effects: [
            fx("wrSearchStage", { code: c, text: "Spider Den", player: first }),
            fx("wrShuffle", { player: first }),
          ],
        })),
        card(WR.den).text,
      );
      return true;
    }
    // 1B: explored, Spider Den is flipped over to Mendor.
    case "wrMendor": {
      const u = make(s, WR.mendor);
      forOwner(s, first, () => s.allies.push(u));
      q.mendorId = u.id;
      log(
        s,
        `Captured by Spiders: Spider Den is flipped over and Mendor is put into play under ${who(s, first)}${s.table ? "'s" : "r"} control, ready.`,
        "good",
      );
      return true;
    }
    // The Forest of Great Fear: an enemy, then a resource on a costly enemy.
    case "wrFearSearch": {
      const options = searchable(s, (c) => card(c).type_code === "enemy");
      const next = fx("wrFearMark", { player: first });
      if (!options.length) {
        log(
          s,
          "The Forest of Great Fear: there is no enemy in the encounter deck or discard pile.",
        );
        prepend(s, next);
        return true;
      }
      choose(
        s,
        `The Forest of Great Fear · The opposing team adds an enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wrSearchStage", {
              code: c,
              text: "The Forest of Great Fear",
              player: first,
            }),
            next,
          ],
        })),
        card(WR.fear).back_text,
      );
      return true;
    }
    case "wrFearMark": {
      const options = enemies(s).filter((u) => wrCost(u.code) >= 2);
      if (!options.length) {
        log(
          s,
          "The Forest of Great Fear: there is no enemy in play with cost 2 or higher.",
        );
        return true;
      }
      choose(
        s,
        `The Forest of Great Fear · The opposing team places a resource on an enemy in play with cost 2 or higher${seatLabel(s, first)}`,
        options.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (cost ${wrCost(u.code)})`,
          effects: [fx("wrFearTake", { target: u.id, player: first })],
        })),
        card(WR.fear).back_text,
      );
      return true;
    }
    case "wrFearTake": {
      const u = get(s, e.target);
      if (!u) return true;
      u.resources += 1;
      q.markedId = u.id;
      log(
        s,
        `The Forest of Great Fear: a resource is placed on ${name(u)}: +2 attack, +2 defense and immune to player card effects.`,
        "danger",
      );
      return true;
    }
    // Escape from Taur-nu-Fuin: a location from the encounter deck.
    case "wrEscape": {
      let reshuffled = false;
      for (;;) {
        if (!s.encounterDeck.length) {
          if (reshuffled || !s.encounterDiscard.length) {
            log(
              s,
              "Escape from Taur-nu-Fuin: there is no location in the encounter deck.",
            );
            return true;
          }
          s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
          reshuffled = true;
          log(s, "The encounter discard pile is shuffled back into its deck.");
        }
        const top = s.encounterDeck.shift()!;
        if (card(top).type_code === "location") {
          toStaging(s, top);
          log(
            s,
            `Escape from Taur-nu-Fuin: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
            "danger",
          );
          return true;
        }
        s.encounterDiscard.push(top);
      }
    }
    // Chieftain Ufthak: an Orc enemy of cost 1 or less engages too.
    case "wrUfthak": {
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          wrHasTrait(c, "Orc") &&
          wrCost(c) <= 1,
      );
      if (!options.length) {
        log(s, "Chieftain Ufthak: there is no Orc enemy of cost 1 or less.");
        prepend(s, fx("wrShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Chieftain Ufthak · The opposing team puts an Orc enemy of cost 1 or less into play engaged with ${who(s, p)}${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `${card(c).name} (cost ${wrCost(c)})`,
          effects: [
            fx("wrEngageSearched", {
              code: c,
              text: "Chieftain Ufthak",
              player: p,
            }),
            fx("wrShuffle", { player: first }),
          ],
        })),
        card(WR.ufthak).text,
      );
      return true;
    }
    case "wrEngageSearched": {
      if (!e.code || !takeSearched(s, e.code)) return true;
      const u = make(s, e.code);
      log(
        s,
        `${e.text}: ${name(u)} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, u, p);
      return true;
    }
    // Abandoned Camp: a card from the discard pile returns to the deck.
    case "wrCamp": {
      const pile = [...s.encounterDiscard];
      const own = pile.lastIndexOf(WR.camp);
      if (own >= 0) pile.splice(own, 1);
      const options = [...new Set(pile)].sort((a, b) =>
        card(a).name.localeCompare(card(b).name),
      );
      if (!options.length) {
        log(s, "Abandoned Camp: the encounter discard pile is empty.");
        return true;
      }
      choose(
        s,
        `Abandoned Camp · The opposing team shuffles a card from the encounter discard pile into the encounter deck${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Shuffle ${card(c).name} into the encounter deck`,
          effects: [fx("wrCampTake", { code: c, player: first })],
        })),
        card(WR.camp).text,
      );
      return true;
    }
    case "wrCampTake": {
      // The explored Abandoned Camp is the last copy in the discard pile.
      const own = s.encounterDiscard.lastIndexOf(WR.camp);
      let i = -1;
      for (let k = s.encounterDiscard.length - 1; k >= 0 && i < 0; k--)
        if (s.encounterDiscard[k] === e.code && k !== own) i = k;
      if (i < 0) return true;
      const [c] = s.encounterDiscard.splice(i, 1);
      s.encounterDeck = shuffle(s, [...s.encounterDeck, c]);
      log(
        s,
        `Abandoned Camp: ${card(c).name} is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    // The Spiders' Ring and The Goblins' Caves: a non-unique Spider or Orc enemy.
    case "wrTraitSearch": {
      const trait = e.text === "The Spiders' Ring" ? "Spider" : "Orc";
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          !card(c).is_unique &&
          wrHasTrait(c, trait),
      );
      if (!options.length) {
        log(s, `${e.text}: there is no non-unique ${trait} enemy.`);
        return true;
      }
      choose(
        s,
        `${e.text} · The opposing team adds a non-unique ${trait} enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wrSearchStage", { code: c, text: e.text, player: first }),
          ],
        })),
        card(e.text === "The Spiders' Ring" ? WR.ring : WR.caves).text,
      );
      return true;
    }
    // Dark Black Woods' travel: 1 card per staged copy from each hand.
    case "wrHandDiscards": {
      const left = e.count ?? 0;
      const hand = seatView(s, p).hand;
      if (left <= 0 || !hand.length) return true;
      choose(
        s,
        `${e.text} · Discard a card from your hand (${left} left)${seatLabel(s, p)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [
            fx("wrHandDiscard", { target: u.id, player: p }),
            fx("wrHandDiscards", { count: left - 1, text: e.text, player: p }),
          ],
        })),
      );
      return true;
    }
    // The Eaves of Mirkwood's travel: a random card from each hand.
    case "wrRandomDiscard": {
      const hand = seatView(s, p).hand;
      if (!hand.length) return true;
      const pick = shuffle(s, [...hand])[0];
      prepend(s, fx("wrHandDiscard", { target: pick.id, player: p }));
      return true;
    }
    // Old Forest Road's travel: an enemy from the top of the deck.
    case "wrRoadTravel": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "enemy") {
        toStaging(s, top);
        log(
          s,
          `Old Forest Road: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
      } else {
        s.encounterDiscard.push(top);
        log(
          s,
          `Old Forest Road: ${card(top).name} is discarded from the encounter deck.`,
        );
      }
      return true;
    }
    case "wrRoadResponse":
      choose(
        s,
        `Old Forest Road · Response: discard the top card of your deck and put it into play if it is an ally?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label: "Use Old Forest Road's Response",
            effects: [fx("wrRoadAlly", { player: first })],
          },
          {
            id: "skip",
            label: "Continue without using this ability",
            effects: [],
          },
        ],
        card(WR.road).text,
      );
      return true;
    case "wrRoadAlly":
      forOwner(s, first, () => {
        const top = s.deck.shift();
        if (!top) return;
        if (card(top).type_code === "ally") {
          const ally = make(s, top);
          ally.owner = first;
          s.allies.push(ally);
          log(
            s,
            `Old Forest Road: ${card(top).name} is put into play.`,
            "good",
          );
        } else {
          s.discard.push(top);
          log(
            s,
            `Old Forest Road: ${card(top).name} is discarded from the top of the deck.`,
          );
        }
      });
      return true;
    // Mirkwood Path: explored, a location from the top of the deck.
    case "wrTrail": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "location") {
        toStaging(s, top);
        log(
          s,
          `Mirkwood Path: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
      } else {
        s.encounterDiscard.push(top);
        log(
          s,
          `Mirkwood Path: ${card(top).name} is discarded from the encounter deck.`,
        );
      }
      return true;
    }
    // Caught in a Web: 2 resources from the hero's pool let it ready.
    case "wrWebPay": {
      const hero = get(s, e.target);
      if (!hero || hero.resources < 2) return true;
      hero.resources -= 2;
      if (!q.webPaid.includes(hero.id)) q.webPaid.push(hero.id);
      log(
        s,
        `Caught in a Web: 2 resources are spent from ${name(hero)}'s pool; it can ready.`,
        "good",
      );
      return true;
    }
    // Before the refresh phase: pay so the webbed hero readies with the others.
    case "wrWebOffer": {
      const hero = get(s, e.target);
      if (
        !hero ||
        !hero.exhausted ||
        hero.resources < 2 ||
        !hasWeb(hero) ||
        q.webPaid.includes(hero.id)
      )
        return true;
      choose(
        s,
        `Caught in a Web · Spend 2 resources from ${name(hero)}'s pool so it readies in the refresh phase?${seatLabel(s, p)}`,
        [
          {
            id: "use",
            label: `Spend 2 resources (${hero.resources} in the pool)`,
            effects: [fx("wrWebPay", { target: hero.id, player: p })],
          },
          { id: "skip", label: "Leave it exhausted", effects: [] },
        ],
        card(WR.web).text,
      );
      return true;
    }
    // Wicked Spider: discard an exhausted character you control.
    case "wrWicked": {
      const exhausted = charactersOf(s, p).filter((u) => u.exhausted);
      if (!exhausted.length) {
        log(
          s,
          `Wicked Spider: ${who(s, p)} ${s.table ? "controls" : "control"} no exhausted character.`,
        );
        return true;
      }
      choose(
        s,
        `Wicked Spider · Discard an exhausted character you control${seatLabel(s, p)}`,
        exhausted.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("wrDiscardCharacter", { target: u.id, player: p })],
        })),
        card(WR.wicked).text,
      );
      return true;
    }
    // Ambushing Orcs' shadow: the lowest engagement cost enemy engages.
    case "wrOrcsEngage": {
      const staged = s.staging.filter(isEnemy);
      if (!staged.length) {
        log(s, "Ambushing Orcs: there is no enemy in the staging area.");
        return true;
      }
      const lowest = Math.min(...staged.map((u) => engagementCost(s, u)));
      const tied = staged.filter((u) => engagementCost(s, u) === lowest);
      const engageOne = (u: Unit) => [
        fx("wrOrcsTake", { target: u.id, player: p }),
      ];
      if (tied.length === 1) {
        prepend(s, ...engageOne(tied[0]));
        return true;
      }
      choose(
        s,
        `Ambushing Orcs · Choose the lowest engagement cost enemy that engages ${who(s, p)}${seatLabel(s, first)}`,
        tied.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (engagement cost ${lowest})`,
          effects: engageOne(u),
        })),
        card(WR.orcs).shadow,
      );
      return true;
    }
    case "wrOrcsTake": {
      const u = get(s, e.target);
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      log(
        s,
        `Ambushing Orcs: ${name(u)} engages ${who(s, p)} and is dealt a shadow card.`,
        "danger",
      );
      enterEnemyEngaged(s, u, p);
      if (engagedWith(s, u) !== undefined) dealEnemyShadows(s, u, 1);
      return true;
    }
    // Mendor left play with a blank text box: the card returns to its Spider Den side.
    case "wrMendorGone": {
      const i = s.encounterDiscard.lastIndexOf(WR.mendor);
      if (i >= 0) s.encounterDiscard[i] = WR.den;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const WOODLAND_REALM_HOOKS: Batch4ScenarioHooks = {
  setup: setupWoodlandRealm,
  openingHandsKept: (s) => fellowshipEventOpening(s, WR_EVENT),
  advance,
  stageInfo: wrStageInfo,
  encounter: wrEncounter,
  shadow: wrShadow,
  effect: (s, e) =>
    fellowshipEventEffect(s, e, WR_EVENT) ||
    wrStageEffect(s, e) ||
    wrCardEffect(s, e),
  stats: (s, u) => {
    const q = s.woodlandRealm;
    if (!q || u.blanked) return {};
    const key = phaseKey(s);
    let attack = 0,
      defense = 0;
    if (isEnemy(u)) {
      // Beast of Taur-nu-Fuin: +1 attack for each damage on it.
      if (u.code === WR.beast) attack += u.damage;
      // Wild Bear: X defense, X one more than the stage number.
      if (u.code === WR.bear) defense += stageNumber(s) + 1;
      if (wrHasTrait(u.code, "Orc")) attack += staged(s, WR.caves);
      if (u.attachments.some((a) => a.code === WR.driven)) {
        attack += 2;
        defense += 2;
      }
      if (u.id === q.markedId && at(s, WR.fear)) {
        attack += 2;
        defense += 2;
      }
      for (const b of q.defenseBoosts)
        if (b.id === u.id && b.key === key) defense += b.value;
      const owner = engagedWith(s, u);
      if (
        owner !== undefined &&
        q.labyrinthShadow.some((x) => x.player === owner && x.key === key)
      )
        attack += 1;
    }
    return { attack, defense };
  },
  threatBonus: (s, u) => {
    const q = s.woodlandRealm;
    if (!q || u.blanked) return 0;
    let bonus = 0;
    // Forest Grove and Wild Bear: X is 1 more than the stage number.
    if (u.code === WR.grove || u.code === WR.bear) bonus += stageNumber(s) + 1;
    if (isEnemy(u) && wrHasTrait(u.code, "Spider")) bonus += staged(s, WR.ring);
    if (u.code === WR.woods) bonus += staged(s, WR.woods);
    if (u.attachments.some((a) => a.code === WR.driven)) bonus += 2;
    if (
      q.labyrinth?.key === phaseKey(s) &&
      isLocation(u) &&
      s.staging.some((x) => x.id === u.id)
    )
      bonus += q.labyrinth.count;
    return bonus;
  },
  // Forest Grove: X quest points.
  locationQuestBonus: (s, u) =>
    s.woodlandRealm && live(u, WR.grove) ? stageNumber(s) + 1 : 0,
  // Ambushed at Night: -10 engagement cost for each staged enemy.
  engagementBonus: (s, u) =>
    u && at(s, WR.ambush) && s.staging.some((x) => x.id === u.id) ? -10 : 0,
  cannotOptionallyEngage: (s, u) =>
    !!s.woodlandRealm &&
    ((at(s, WR.ambush) && s.staging.some((x) => x.id === u.id)) ||
      staged(s, WR.patrol) > 0),
  immune: (s, u) => {
    const q = s.woodlandRealm;
    if (!q) return false;
    if (u.attachments.some((a) => a.code === WR.driven)) return true;
    return u.id === q.markedId && at(s, WR.fear);
  },
  damageAmount: (s, u, amount, context) => {
    const q = s.woodlandRealm;
    if (!q) return amount;
    if (
      !context.combatDamage &&
      [WR.spawn, WR.ufthak, WR.pack].some((c) => live(u, c))
    )
      return 0;
    if (at(s, WR.ambush) && isEnemy(u) && s.staging.some((x) => x.id === u.id))
      return 0;
    if (q.noDamage.some((x) => x.id === u.id && x.key === phaseKey(s)))
      return 0;
    return amount;
  },
  // No non-objective player card attachments.
  cannotAttach: (s, u, code) =>
    !!s.woodlandRealm &&
    [WR.spawn, WR.ufthak, WR.pack].some((c) => live(u, c)) &&
    card(code).type_code === "attachment",
  cannotPlayerReady: (s) =>
    !!s.woodlandRealm &&
    (staged(s, WR.spawn) > 0 || s.woodlandRealm.noPlayerReady === s.round),
  cannotReady: (s, u) => {
    const q = s.woodlandRealm;
    if (!q) return false;
    if (q.noReady.some((x) => x.id === u.id && x.round === s.round))
      return true;
    // Enchanted Stream: the exhausted heroes, while it is the active location.
    if (
      q.streamHeroes.includes(u.id) &&
      !!s.activeLocation &&
      live(s.activeLocation, WR.stream)
    )
      return true;
    return hasWeb(u) && !q.webPaid.includes(u.id);
  },
  characterReadied: (s, u) => {
    const q = s.woodlandRealm;
    // Each payment lets a webbed hero ready once.
    if (q && hasWeb(u)) q.webPaid = q.webPaid.filter((id) => id !== u.id);
  },
  // Despair: each character's printed text box is blank.
  characterBlanked: (s, u) => {
    const q = s.woodlandRealm;
    if (!q || !isCharacter(u)) return false;
    return (
      q.despairRound === s.round ||
      q.blankShadow.some((x) => x.id === u.id && x.key === phaseKey(s))
    );
  },
  // Lost in the Dark: the first treachery revealed each round, until the next reveal.
  revealed: (s, code) => {
    const q = s.woodlandRealm;
    if (!q) return;
    if (q.firstTreachery?.round === s.round) q.firstTreachery.open = false;
    else if (card(code).type_code === "treachery")
      q.firstTreachery = { round: s.round, code, open: true };
  },
  cannotCancel: (s, shadow, code) => {
    const q = s.woodlandRealm;
    if (!q || !code) return false;
    if (shadow) return q.uncancelable.includes(code);
    return q.noCancel === code || firstTreachery(s, q, code);
  },
  revealedDoomed: (s, code) =>
    s.woodlandRealm && firstTreachery(s, s.woodlandRealm, code) ? 1 : 0,
  // Wolf Rider: surge if another Orc enemy is in the staging area.
  revealedSurge: (s, code) =>
    !!s.woodlandRealm &&
    code === WR.wolf &&
    s.staging.some((u) => isEnemy(u) && wrHasTrait(u.code, "Orc")),
  // Dark-wood Grove: a canceled 'when revealed' raises each threat by 3.
  whenRevealedCancelled: (s) => {
    const n = staged(s, WR.darkwood);
    if (!s.woodlandRealm || !n) return;
    prepend(
      s,
      fx("wrEachThreat", {
        value: 3 * n,
        text: "Dark-wood Grove",
        player: firstPlayer(s),
      }),
    );
  },
  // Dry Watercourse and To the Elvenking's Halls: 1 threat reduced each round.
  threatReduction: (s, amount) => {
    const q = s.woodlandRealm;
    if (!q || (!staged(s, WR.watercourse) && !at(s, WR.halls))) return amount;
    const p = activeSeat(s);
    const row = q.reduced.find((x) => x.player === p && x.round === s.round);
    const allowed = Math.max(0, Math.min(amount, 1 - (row?.amount ?? 0)));
    const actual = Math.min(allowed, s.threat);
    if (actual) {
      if (row) row.amount += actual;
      else q.reduced.push({ player: p, round: s.round, amount: actual });
    }
    if (allowed < amount)
      log(
        s,
        "Each player's threat cannot be reduced by more than 1 each round.",
      );
    return allowed;
  },
  // "Don't Leave the Path": the players must travel to a location, if able.
  mustTravel: (s) =>
    !!s.woodlandRealm &&
    at(s, WR.path) &&
    !s.activeLocation &&
    !(s.extraActiveLocations ?? []).length &&
    s.staging.some((u) => isLocation(u) && !canTravel(s, u)),
  locationProgressBlocked: (s, u) =>
    !!s.woodlandRealm && at(s, WR.path) && s.staging.some((x) => x.id === u.id),
  // The Eaves of Mirkwood: no more than 1 progress on each staged location.
  locationProgressCapacity: (s, u) => {
    const q = s.woodlandRealm;
    if (!q || !staged(s, WR.eaves) || !s.staging.some((x) => x.id === u.id))
      return undefined;
    const placed =
      q.eaves.find((x) => x.id === u.id && x.round === s.round)?.amount ?? 0;
    return Math.max(0, 1 - placed);
  },
  locationProgressPlaced: (s, u, amount) => {
    const q = s.woodlandRealm;
    if (!q || !s.staging.some((x) => x.id === u.id)) return;
    const row = q.eaves.find((x) => x.id === u.id && x.round === s.round);
    if (row) row.amount += amount;
    else q.eaves.push({ id: u.id, round: s.round, amount });
  },
  progress: (s, amount, quest) => {
    const q = s.woodlandRealm;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    // Enchanted Stream: no progress on the main quest.
    if (staged(s, WR.stream)) return 0;
    // Stage 2: no more than 5 (or 10) progress this round after the commit.
    if (q.cap?.round === s.round)
      return Math.max(0, Math.min(amount, q.cap.limit - q.cap.placed));
    return amount;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.woodlandRealm;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    if (q.cap?.round === s.round) q.cap.placed += amount;
    if (at(s, WR.halls) && phaseKey(s) === `${s.round}:quest`) {
      const key = phaseKey(s);
      q.hallsProgress = {
        key,
        amount:
          (q.hallsProgress?.key === key ? q.hallsProgress.amount : 0) + amount,
      };
    }
  },
  committed: (s) => {
    const q = s.woodlandRealm;
    if (!q || !atStage2B(s)) return;
    const m = mendor(s);
    const limit = m?.committed && !m.blanked ? 10 : 5;
    q.cap = { round: s.round, limit, placed: 0 };
    log(
      s,
      `${card(q.currentQuest).back_name}: no more than ${limit} progress can be placed on the stage this round.`,
      "danger",
    );
  },
  // Escape from Taur-nu-Fuin.
  questBegin: (s) =>
    s.woodlandRealm && at(s, WR.escape)
      ? [fx("wrEscape", { player: firstPlayer(s) })]
      : [],
  // To the Elvenking's Halls: 10 progress in a quest phase reveal a card.
  successfulQuestProgress: (s) => {
    const q = s.woodlandRealm;
    if (
      !q ||
      !at(s, WR.halls) ||
      q.hallsProgress?.key !== phaseKey(s) ||
      q.hallsProgress.amount < 10
    )
      return;
    log(
      s,
      "To the Elvenking's Halls: 10 or more progress were placed this phase; the top encounter card is revealed.",
      "danger",
    );
    prepend(s, fx("reveal", { player: firstPlayer(s) }));
  },
  engaged: (s, u) => {
    const q = s.woodlandRealm;
    if (!q) return;
    const p = activeSeat(s);
    q.engagedRound.push({ id: u.id, round: s.round });
    if (live(u, WR.ufthak)) prepend(s, fx("wrUfthak", { player: p }));
    if (live(u, WR.spiders))
      prepend(
        s,
        fx("wrExhaustOne", { text: "Spiders of Mirkwood", player: p }),
      );
    if (live(u, WR.wicked)) prepend(s, fx("wrWicked", { player: p }));
  },
  shadowResolved: (s, enemy, code) => {
    const q = s.woodlandRealm;
    const c = s.combat;
    if (!q || !c || card(code).shadow || enemy.blanked) return;
    // Beast of Taur-nu-Fuin: 1 damage to it and the defending character.
    if (enemy.code === WR.beast) {
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x);
      prepend(
        s,
        fx("damage", { target: enemy.id, value: 1 }),
        ...defenders.map((d) => fx("damage", { target: d.id, value: 1 })),
      );
      log(
        s,
        "Beast of Taur-nu-Fuin is dealt a shadow card with no shadow effect: 1 damage to it and the defending character.",
        "danger",
      );
    }
    // Wild Wargs: it returns to the staging area.
    if (enemy.code === WR.wargs) {
      c.returnToStaging = true;
      log(
        s,
        "Wild Wargs is dealt a shadow card with no shadow effect: it returns to the staging area.",
        "danger",
      );
    }
    // Pack of Wargs: an additional attack, with no shadow card.
    if (enemy.code === WR.pack) {
      c.wrPackAttack = true;
      log(
        s,
        "Pack of Wargs is dealt a shadow card with no shadow effect: it makes an additional attack after this one.",
        "danger",
      );
    }
  },
  attackFinished: (s, c, skipped = false) => {
    const q = s.woodlandRealm;
    if (!q) return [];
    q.uncancelable = [];
    const enemy = get(s, c.enemyId);
    if (skipped || !enemy || !c.wrPackAttack) return [];
    const p = c.attackPlayer ?? activeSeat(s);
    if (engagedWith(s, enemy) === undefined) return [];
    return [
      fx("immediateAttack", { target: enemy.id, player: p, noShadow: true }),
    ];
  },
  characterDestroyed: (s, _u, context) => {
    const c = s.combat;
    if (!s.woodlandRealm || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (c.wrRevealOnKill) {
      c.wrRevealOnKill = false;
      effects.push(fx("wrReveal", { player: first }));
    }
    if (c.wrThreatOnKill) {
      c.wrThreatOnKill = false;
      effects.push(
        fx("wrEachThreat", {
          value: 1,
          text: "A Frightened Beast",
          player: first,
        }),
      );
    }
    if (c.wrExtraOnKill) {
      c.wrExtraOnKill = false;
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
    }
    if (effects.length) prepend(s, ...effects);
  },
  // Mendor: if it leaves play, the players lose.
  characterLeft: (s, u) => {
    if (!s.woodlandRealm || u.code !== WR.mendor) return;
    if (!u.blanked) lose(s, "Mendor leaves play: the players lose the game.");
    else prepend(s, fx("wrMendorGone", { player: firstPlayer(s) }));
  },
  // An eliminated player's cards leave play, Mendor with them.
  playerEliminating: (s, i) => {
    if (!s.woodlandRealm) return;
    const m = seatView(s, i).allies.find((u) => u.code === WR.mendor);
    if (m && !m.blanked)
      lose(
        s,
        "Mendor leaves play with the eliminated player's cards: the players lose the game.",
      );
  },
  // Mendor follows the first player.
  firstPlayerChanged: (s) => {
    const m = mendor(s);
    const from = mendorSeat(s);
    const to = firstPlayer(s);
    if (
      !s.woodlandRealm ||
      !m ||
      m.blanked ||
      from === undefined ||
      from === to
    )
      return;
    forOwner(s, from, () => {
      s.allies = s.allies.filter((u) => u.id !== m.id);
      s.committedIds = s.committedIds.filter((id) => id !== m.id);
    });
    forOwner(s, to, () => s.allies.push(m));
    log(s, `The first player gains control of Mendor: ${seatName(s, to)}.`);
  },
  combatEnd: (s) => {
    const q = s.woodlandRealm;
    if (!q) return;
    // Caught in a Web: before the refresh phase, a webbed hero may pay to ready.
    const offers = playerOrder(s).flatMap((owner) =>
      seatView(s, owner)
        .heroes.filter((h) => hasWeb(h) && h.exhausted && h.resources >= 2)
        .map((h) => fx("wrWebOffer", { target: h.id, player: owner })),
    );
    if (offers.length) prepend(s, ...offers);
  },
  roundEnd: (s) => {
    const q = s.woodlandRealm;
    if (!q) return [];
    const first = firstPlayer(s);
    q.noReady = q.noReady.filter((x) => x.round > s.round);
    q.engagedRound = q.engagedRound.filter((x) => x.round > s.round);
    q.eaves = q.eaves.filter((x) => x.round > s.round);
    q.reduced = q.reduced.filter((x) => x.round > s.round);
    q.blankShadow = [];
    q.labyrinthShadow = [];
    q.defenseBoosts = [];
    q.noDamage = [];
    const n = staged(s, WR.mountains);
    return n
      ? [
          fx("wrEachThreat", {
            value: 2 * n,
            text: "Mountains of Mirkwood",
            player: first,
          }),
        ]
      : [];
  },
  travelEffects: (s, u) => {
    if (!s.woodlandRealm || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === WR.den) return [fx("wrDenTravel", { player: first })];
    if (u.code === WR.grove)
      return playerOrder(s).map((owner) =>
        fx("wrDamageOne", {
          value: stageNumber(s) + 1,
          text: "Forest Grove",
          player: owner,
        }),
      );
    if (u.code === WR.stream) {
      s.woodlandRealm.streamHeroes = [];
      return playerOrder(s).map((owner) =>
        fx("wrExhaustOne", {
          text: "Enchanted Stream",
          flag: true,
          player: owner,
        }),
      );
    }
    if (u.code === WR.woods) {
      const count =
        staged(s, WR.woods) + (s.staging.some((x) => x.id === u.id) ? 0 : 1);
      return playerOrder(s).map((owner) =>
        fx("wrHandDiscards", {
          count,
          text: "Dark Black Woods",
          player: owner,
        }),
      );
    }
    if (u.code === WR.eaves)
      return playerOrder(s).map((owner) =>
        fx("wrRandomDiscard", { player: owner }),
      );
    if (u.code === WR.watercourse)
      return [
        fx("wrEachThreat", {
          value: 1,
          text: "Dry Watercourse",
          player: first,
        }),
      ];
    if (u.code === WR.darkwood) return [fx("reveal", { player: first })];
    if (u.code === WR.road) return [fx("wrRoadTravel", { player: first })];
    return undefined;
  },
  travelEntered: (s, u, actualTravel) => {
    if (!s.woodlandRealm || !actualTravel || u.blanked) return;
    if (u.code === WR.road)
      prepend(s, fx("wrRoadResponse", { player: firstPlayer(s) }));
  },
  // 1B: Spider Den is flipped over to Mendor.
  locationDestination: (s, u) => {
    if (!s.woodlandRealm || u.code !== WR.den) return false;
    prepend(s, fx("wrMendor", { code: WR.den, player: firstPlayer(s) }));
    return true;
  },
  explored: (s, u) => {
    if (!s.woodlandRealm) return;
    if (u.code === WR.stream) s.woodlandRealm.streamHeroes = [];
    if (u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === WR.camp) prepend(s, fx("wrCamp", { player: first }));
    if (u.code === WR.ring)
      prepend(
        s,
        fx("wrTraitSearch", { text: "The Spiders' Ring", player: first }),
      );
    if (u.code === WR.caves)
      prepend(
        s,
        fx("wrTraitSearch", { text: "The Goblins' Caves", player: first }),
      );
    if (u.code === WR.trail) prepend(s, fx("wrTrail", { player: first }));
  },
  // Caught in a Web: spend 2 resources from the hero's pool so it may ready.
  abilityLabel: (code) =>
    code === WR.web
      ? "Caught in a Web · Spend 2 resources from the hero's pool so it can ready"
      : undefined,
  abilityProblem: (s, u, attachmentId) => {
    if (!s.woodlandRealm) return "Not this scenario.";
    const web = u.attachments.find(
      (a) => a.id === attachmentId && a.code === WR.web,
    );
    if (!web) return "Caught in a Web is not attached here.";
    if (s.woodlandRealm.webPaid.includes(u.id))
      return "The hero can already ready.";
    if (u.resources < 2) return "The hero needs 2 resources in its pool.";
    return null;
  },
  ability: (s, u, attachmentId) => {
    if (!s.woodlandRealm) return false;
    if (!u.attachments.some((a) => a.id === attachmentId && a.code === WR.web))
      return false;
    prepend(s, fx("wrWebPay", { target: u.id, player: activeSeat(s) }));
    return true;
  },
  sharedEffect: (e) =>
    [
      ...fellowshipEventSharedKinds("wr"),
      "wrTreacheryDone",
      "wrMendor",
      "wrEachThreat",
      "wrEscape",
    ].includes(e.kind),
};
