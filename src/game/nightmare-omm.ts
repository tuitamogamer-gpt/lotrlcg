/**
 * Over the Misty Mountains Grim's Nightmare Deck (docs/NIGHTMARE.md): its
 * setup card's rule (stage 3B's When Revealed effect spends no more Baggins
 * resources than there are players, in src/game/misty-mountains.ts) and its
 * Nightmare encounter cards, composed with the scenario's own rules through
 * batch4Scenario while a Nightmare mode game is played. The scenario builds
 * both encounter decks with the setup card's removals and puts each
 * Nightmare card in the deck its encounter set icon names. Effects use the
 * "nom" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
} from "./core";
import {
  discardCharacter,
  discardHandCard,
  engage,
  exhaustCharacter,
  progressLocation,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { dealEnemyShadows } from "./considered-engagement";
import { bagginsBilbo, spendBaggins } from "./hobbit-saga";
import { NIGHTMARE_OHUH as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { OMM } from "./misty-mountains-support";

export interface NightmareOmmState {
  /** Swish, smack! Whip crack!'s shadow: attacking enemies that cannot take damage this round. */
  ommNoDamage?: { round: number; ids: string[] };
}

const omLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "over-the-misty-mountains-grim";
const printed = (code: string, trait: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === trait);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isGoblin = (u: Unit) => isEnemy(u) && printed(u.code, "Goblin");
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const locationsInPlay = (s: GameState) => [
  ...s.staging.filter(isLocation),
  ...allActiveLocations(s),
];
const greatGoblinInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].some((u) => live(s, u, N.greatGoblin));
const greatGoblinDefeated = (s: GameState) =>
  !!s.victoryCards?.some((c) => card(c).name === "The Great Goblin");
const characters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];

// ------------------------------------------------------------- the cards

/** Narrow Ledge: "While Narrow Ledge is the active location, each player cannot commit more than 3 characters to the quest." */
function omCannotCommit(s: GameState, u: Unit) {
  if (!omLive(s) || !allActiveLocations(s).some((l) => live(s, l, N.ledge)))
    return false;
  const committed = new Set([
    ...s.committedIds,
    ...[...s.heroes, ...s.allies].filter((c) => c.committed).map((c) => c.id),
  ]);
  return committed.size >= 3 && !committed.has(u.id);
}
/** Dim Valley: "Action: Exhaust Bilbo Baggins and spend 1 [baggins] resource to place 5 progress on Dim Valley." */
const omAbilityLabel = (code: string) =>
  code === N.valley
    ? "Exhaust Bilbo Baggins and spend 1 Baggins resource: place 5 progress on Dim Valley"
    : undefined;
function omAbilityProblem(s: GameState, u: Unit) {
  if (!omLive(s) || u.code !== N.valley) return undefined;
  if (u.blanked) return "Dim Valley's text box is blank.";
  const bilbo = bagginsBilbo(s);
  if (!bilbo || ownerOf(s, bilbo) !== activeSeat(s))
    return "Only the player who controls Bilbo Baggins can exhaust him.";
  if (bilbo.exhausted) return "Bilbo Baggins is exhausted.";
  if (bilbo.resources < 1) return "Bilbo Baggins needs 1 Baggins resource.";
  return null;
}
function omAbility(s: GameState, u: Unit) {
  if (!omLive(s) || u.code !== N.valley || omAbilityProblem(s, u)) return false;
  const bilbo = bagginsBilbo(s)!;
  exhaustCharacter(s, bilbo);
  spendBaggins(s, 1);
  log(
    s,
    "Dim Valley: Bilbo Baggins exhausts and spends 1 Baggins resource to place 5 progress on it.",
    "good",
  );
  progressLocation(s, u, 5);
  return true;
}
/** Dim Valley: "Forced: At the end of the round, each player must discard a random card from his hand." */
const omRoundEnd = (s: GameState): Effect[] =>
  omLive(s)
    ? locationsInPlay(s)
        .filter((u) => live(s, u, N.valley))
        .flatMap(() => playerOrder(s).map((player) => fx("nomDim", { player })))
    : [];
/** The Great Goblin: "Progress cannot be placed on the current quest." */
const omProgress = (s: GameState, amount: number) =>
  omLive(s) && greatGoblinInPlay(s) ? 0 : amount;
/** The Great Goblin: "Forced: When The Great Goblin attacks, discard the top card of the encounter deck. If it is a Goblin enemy, put it into play engaged with the defending player and deal it a shadow card." */
function omEnemyAttackStarted(s: GameState, u: Unit, player: number) {
  if (omLive(s) && live(s, u, N.greatGoblin))
    prepend(s, fx("nomGreatGoblin", { player }));
}
/** Goblin Prowler: "Goblin Prowler gets -30 engagement cost if The Great Goblin is in the victory display." */
const omEngagementBonus = (s: GameState, u: Unit) =>
  omLive(s) && live(s, u, N.prowler) && greatGoblinDefeated(s) ? -30 : 0;
/** Goblin Prowler: "Forced: When Goblin Prowler engages you, discard a character you control." */
function omEngaged(s: GameState, u: Unit) {
  if (omLive(s) && live(s, u, N.prowler))
    prepend(s, fx("nomProwler", { player: activeSeat(s) }));
}
/** Dark Passages: "Travel: Raise each player's threat by X to travel here, where X is the number of Cave locations in the staging area." */
function omTravelEffects(s: GameState, u: Unit) {
  if (!omLive(s) || !live(s, u, N.passages)) return undefined;
  const x = s.staging.filter(
    (l) => isLocation(l) && printed(l.code, "Cave"),
  ).length;
  return x
    ? playerOrder(s).map((player) => fx("heirsThreat", { value: x, player }))
    : [];
}
/** Swish, smack! Whip crack!'s shadow: "Attacking enemy cannot take damage this round." */
function omDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  const q = s.nightmare?.ommNoDamage;
  if (
    !omLive(s) ||
    amount <= 0 ||
    !q ||
    q.round !== s.round ||
    !q.ids.includes(u.id)
  )
    return amount;
  log(
    s,
    `${name(u)} cannot take damage this round (Swish, smack! Whip crack!).`,
  );
  return 0;
}

function omEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!omLive(s)) return false;
  const first = firstPlayer(s);
  // Dark Passages: "When Revealed: Choose a location in the staging area
  // with a title other than Dark Passages and make it the active location."
  if (code === N.passages) {
    if (fromReveal) prepend(s, fx("nomPassages", { player: first }));
    return true;
  }
  if (code !== N.splinters && code !== N.swish) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.splinters)
    // Lightning Splinters: "Each player must choose and discard 3 cards from
    // his hand. Each player assigns X damage among characters he controls,
    // where X is the combined printed cost of the cards he discarded."
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("nomSplinters", { player, value: 3, count: 0 }),
      ),
    );
  // Swish, smack! Whip crack!: "Each player must assign damage among
  // characters he controls equal to the total number of Goblin enemies
  // engaged with him and in the staging area."
  else
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("nomAssign", {
          player,
          value:
            seatView(s, player).engaged.filter(isGoblin).length +
            s.staging.filter(isGoblin).length,
          ids: [],
          text: "Swish, smack! Whip crack!",
        }),
      ),
    );
  return true;
}

function omShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !omLive(s)) return false;
  // Narrow Ledge: "Shuffle all copies of Galloping Boulders from the
  // encounter discard pile into the encounter deck."
  if (code === N.ledge) {
    const boulders = s.encounterDiscard.filter((x) => x === OMM.boulders);
    if (boulders.length) {
      s.encounterDiscard = s.encounterDiscard.filter((x) => x !== OMM.boulders);
      s.encounterDeck.push(...boulders);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Narrow Ledge: ${boulders.length} Galloping Boulders ${boulders.length === 1 ? "is" : "are"} shuffled into the encounter deck.`,
        "danger",
      );
    }
    return true;
  }
  if (code === N.swish) {
    const q = (s.nightmare ??= {});
    const r =
      q.ommNoDamage?.round === s.round
        ? q.ommNoDamage
        : { round: s.round, ids: [] as string[] };
    if (!r.ids.includes(c.enemyId)) r.ids.push(c.enemyId);
    q.ommNoDamage = r;
    log(
      s,
      "Swish, smack! Whip crack!: the attacking enemy cannot take damage this round.",
      "danger",
    );
    return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareOmmEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nom")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nomDim":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, pick.id, { encounterEffect: true });
        log(
          s,
          `Dim Valley${seatLabel(s, p)}: ${name(pick)} is discarded at random.`,
          "danger",
        );
      });
      return true;
    case "nomGreatGoblin": {
      const code = encounterDraw(s, true);
      if (!code) return true;
      if (card(code).type_code === "enemy" && printed(code, "Goblin")) {
        log(
          s,
          `The Great Goblin discards ${card(code).name} from the encounter deck: it enters play engaged with ${seatLabel(s, p) ? `Player ${p + 1}` : "the defending player"} and is dealt a shadow card.`,
          "danger",
        );
        forOwner(s, p, () => {
          const u = make(s, code);
          engage(s, u);
          dealEnemyShadows(s, u, 1);
        });
      } else {
        s.encounterDiscard.push(code);
        log(
          s,
          `The Great Goblin discards ${card(code).name} from the encounter deck.`,
        );
      }
      return true;
    }
    case "nomProwler": {
      const own = characters(s, p);
      if (!own.length) return true;
      if (own.length === 1) {
        prepend(s, fx("nomDiscard", { target: own[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `Goblin Prowler · Discard a character you control${seatLabel(s, p)}`,
        own.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("nomDiscard", { target: u.id, player: p })],
        })),
        card(N.prowler).text,
      );
      return true;
    }
    case "nomDiscard": {
      const u = get(s, e.target);
      if (u && characters(s, ownerOf(s, u)).some((x) => x.id === u.id)) {
        log(s, `Goblin Prowler: ${name(u)} is discarded.`, "danger");
        discardCharacter(s, u);
      }
      return true;
    }
    case "nomPassages": {
      const options = s.staging.filter(
        (u) => isLocation(u) && card(u.code).name !== "Dark Passages",
      );
      if (!options.length) {
        log(s, "Dark Passages: no other location is in the staging area.");
        return true;
      }
      const activate = (u: Unit) => [
        fx("travelEnter", {
          target: u.id,
          flag: true,
          text: "osgiliath-second",
          player: p,
        }),
      ];
      if (options.length === 1) {
        log(
          s,
          `Dark Passages: ${name(options[0])} becomes the active location.`,
          "danger",
        );
        prepend(s, ...activate(options[0]));
        return true;
      }
      choose(
        s,
        "Dark Passages · Choose a location in the staging area to make it the active location",
        options.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: activate(u),
        })),
        card(N.passages).text,
      );
      return true;
    }
    case "nomSplinters": {
      const left = e.value ?? 0,
        total = e.count ?? 0;
      const hand = seatView(s, p).hand;
      const done = fx("nomAssign", {
        player: p,
        value: total,
        ids: [],
        text: "Lightning Splinters",
      });
      if (left <= 0 || !hand.length) {
        prepend(s, done);
        return true;
      }
      const discard = (u: Unit) => [
        fx("nomSplintersDiscard", { target: u.id, player: p }),
        fx("nomSplinters", {
          player: p,
          value: left - 1,
          count: total + (Number(card(u.code).cost) || 0),
        }),
      ];
      if (hand.length <= left) {
        prepend(s, ...discard(hand[0]));
        return true;
      }
      choose(
        s,
        `Lightning Splinters · Choose and discard a card from your hand (${left} left)${seatLabel(s, p)}`,
        hand.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (cost ${Number(card(u.code).cost) || 0})`,
          effects: discard(u),
        })),
        card(N.splinters).text,
      );
      return true;
    }
    case "nomSplintersDiscard":
      forOwner(s, p, () => {
        const u = s.hand.find((x) => x.id === e.target);
        if (!u) return;
        discardHandCard(s, u.id, { encounterEffect: true });
        log(
          s,
          `Lightning Splinters${seatLabel(s, p)}: ${name(u)} is discarded.`,
          "danger",
        );
      });
      return true;
    case "nomAssign": {
      // Each point is assigned first, then the damage is dealt together.
      const total = e.value ?? 0;
      const assigned = e.ids ?? [];
      const own = characters(s, p);
      const source = e.text ?? "Damage";
      if (total <= 0 || !own.length) return true;
      const done =
        assigned.length >= total
          ? assigned
          : own.length === 1
            ? [
                ...assigned,
                ...Array<string>(total - assigned.length).fill(own[0].id),
              ]
            : undefined;
      if (done) {
        const counts = new Map<string, number>();
        for (const id of done) counts.set(id, (counts.get(id) ?? 0) + 1);
        log(
          s,
          `${source}${seatLabel(s, p)}: ${[...counts]
            .map(([id, n]) => `${name(get(s, id)!)} takes ${n}`)
            .join(", ")} damage.`,
          "danger",
        );
        prepend(
          s,
          ...[...counts].map(([target, value]) =>
            fx("damage", { target, value, player: p }),
          ),
        );
        return true;
      }
      const left = total - assigned.length;
      choose(
        s,
        `${source} · Assign 1 damage to a character you control (${left} of ${total} left)${seatLabel(s, p)}`,
        own.map((c): Option => {
          const pending = assigned.filter((id) => id === c.id).length;
          return {
            id: c.id,
            code: c.code,
            label: `${name(c)} (${c.damage}${pending ? ` + ${pending}` : ""} damage)`,
            effects: [
              fx("nomAssign", {
                player: p,
                value: total,
                ids: [...assigned, c.id],
                text: source,
              }),
            ],
          };
        }),
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_OMM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotCommit: omCannotCommit,
  abilityLabel: omAbilityLabel,
  abilityProblem: omAbilityProblem as Batch4ScenarioHooks["abilityProblem"],
  ability: omAbility,
  roundEnd: omRoundEnd,
  progress: omProgress,
  enemyAttackStarted: omEnemyAttackStarted,
  engagementBonus: omEngagementBonus,
  engaged: omEngaged,
  travelEffects: omTravelEffects,
  damageAmount: omDamageAmount,
  encounter: omEncounter,
  shadow: omShadow,
  effect: nightmareOmmEffect,
  sharedEffect: (e) => e.kind.startsWith("nom"),
};

// ------------------------------------------------------------- saves

export function validNightmareOmm(s: GameState) {
  const q = s.nightmare?.ommNoDamage;
  return (
    q === undefined ||
    (!!q &&
      Number.isInteger(q.round) &&
      q.round >= 0 &&
      Array.isArray(q.ids) &&
      q.ids.every((id) => typeof id === "string"))
  );
}
