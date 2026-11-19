/**
 * Foundations of Stone's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (when stage 3B is revealed, Mount and Artifact cards are discarded and
 * each player's allies are cut to a total printed cost of 6) and its
 * Nightmare encounter cards, composed with the scenario's own rules through
 * batch4Scenario while a Nightmare mode game is played. The setup card's
 * removals and its two encounter set icons shape the scenario's recipe
 * (foundationsRecipe). Effects use the "nfs" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  prepend,
  putPlayerDeck,
  shuffle,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  raiseThreat,
  revealed,
} from "./board";
import {
  activeSeat,
  allEngaged,
  firstPlayer,
  forOwner,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { foundationsArea, foundationsState } from "./foundations-stone-support";
import { foundationsAttachTop } from "./foundations-stone";
import { NIGHTMARE_DD as D, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

export interface NightmareFoundationsState {
  /** Primeval Thing's entries into play already fed, by unit (a return to the staging area is not one). */
  primevalFed?: string[];
}

const fsLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "foundations-of-stone";
const cost = (code: string) => {
  const n = Number(card(code).cost);
  return Number.isFinite(n) ? n : 0;
};
const nameless = (u: Unit) => traitOf(u.code, "Nameless");
const attachedCost = (u: Unit) =>
  u.attachments.reduce((n, a) => n + cost(a.code), 0);
/** The first player, table-wide (stage 4's separate staging areas keep one). */
const tableFirst = (s: GameState) =>
  globalPlayerOrder(s)[0] ?? s.table?.first ?? 0;

// ------------------------------------------------------------- the setup card

/**
 * "Forced: When stage 3b is revealed, discard all Mount and Artifact cards
 * from play. Each player must also discard allies he controls until the total
 * printed cost of allies he controls is 6 or less."
 */
function fsStageRevealed(s: GameState, stage: number) {
  if (!fsLive(s) || stage !== 3) return;
  prepend(s, fx("nfsWashed", { player: tableFirst(s) }));
}

// ------------------------------------------------------------- the cards

/** Mithril Seeker: "Mithril Seeker gets +1 [attack] for each resource on it." */
function fsStats(s: GameState, u: Unit) {
  return fsLive(s) && live(s, u, D.seeker) && u.resources
    ? { attack: u.resources }
    : {};
}
/**
 * Mithril Seeker: "Forced: When Mithril Seeker attacks, move 1 resource from
 * each of the defending player's heroes to Mithril Seeker." Unspeakable
 * Thing: "Forced: When Unspeakable Thing engages a player or attacks a
 * player, attach the top card of that player's deck to it."
 */
function fsEnemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (!fsLive(s)) return;
  if (live(s, enemy, D.seeker)) {
    let moved = 0;
    for (const h of seatView(s, player).heroes)
      if (h.resources > 0) {
        h.resources--;
        moved++;
      }
    enemy.resources += moved;
    log(
      s,
      `Mithril Seeker attacks: ${moved} ${moved === 1 ? "resource moves" : "resources move"} from the defending player's heroes to it${seatLabel(s, player)}.`,
      moved ? "danger" : "normal",
    );
  }
  if (live(s, enemy, D.unspeakable)) feed(s, enemy, player, 1);
}
function feed(s: GameState, enemy: Unit, player: number, count: number) {
  const n = foundationsAttachTop(s, enemy, player, count);
  log(
    s,
    `${name(enemy)}: ${n} ${n === 1 ? "card" : "cards"} attached from the top of the deck${seatLabel(s, player)}.`,
    "danger",
  );
}
function fsEngaged(s: GameState, u: Unit) {
  if (fsLive(s) && live(s, u, D.unspeakable)) feed(s, u, ownerOf(s, u), 1);
}
/**
 * Primeval Thing: "Forced: When Primeval Thing enters play, attach cards from
 * the top of the first player's deck to it until the total printed cost of all
 * attached cards is 6 or higher."
 */
function fsEnemyEntered(s: GameState, u: Unit) {
  if (!fsLive(s) || !live(s, u, D.primeval)) return;
  const q = (s.nightmare ??= {});
  if (q.primevalFed?.includes(u.id)) return;
  q.primevalFed = [...(q.primevalFed ?? []), u.id];
  const player = tableFirst(s);
  let n = 0;
  while (attachedCost(u) < 6 && seatView(s, player).deck.length) {
    if (!foundationsAttachTop(s, u, player, 1, true)) break;
    n++;
  }
  log(
    s,
    `Primeval Thing enters play: ${n} ${n === 1 ? "card" : "cards"} from the first player's deck (total printed cost ${attachedCost(u)}).`,
    "danger",
  );
  // The batch of cards attached from the top of a deck (Nest of Horrors).
  if (n) fsNamelessFed(s, u, player);
}
/**
 * Nest of Horrors: "While Nest of Horrors is in the staging area, it gains:
 * "Forced: When one or more cards are attached to a Nameless enemy from the
 * top of a player's deck, attach an additional card from the top of that
 * player's deck."" (Each copy; the additional cards do not trigger it again.)
 */
function fsNamelessFed(s: GameState, enemy: Unit, player: number) {
  if (!fsLive(s) || !nameless(enemy)) return;
  const nests = s.staging.filter((l) => live(s, l, D.nest)).length;
  if (!nests) return;
  const n = foundationsAttachTop(s, enemy, player, nests, true);
  if (n)
    log(
      s,
      `Nest of Horrors: ${n} additional ${n === 1 ? "card" : "cards"} attached to ${name(enemy)}${seatLabel(s, player)}.`,
      "danger",
    );
}
/**
 * Giant Cave Centipede: "Forced: At the end of the combat phase, if Giant Cave
 * Centipede is engaged with a player, that player chooses and adds it to a
 * different player's staging area."
 */
function fsCombatEnd(s: GameState) {
  if (!fsLive(s)) return;
  for (const u of allEngaged(s))
    if (live(s, u, D.centipede))
      prepend(
        s,
        fx("nfsCentipedeMove", { target: u.id, player: ownerOf(s, u) }),
      );
}
/**
 * Shivering River: "While Shivering River is in the staging area, it
 * contributes its [threat] to the total [threat] in each other player's
 * staging area." (Only stage 4's separate staging areas are other players'.)
 */
function fsStagingThreat(s: GameState) {
  const d = foundationsState(s);
  if (!fsLive(s) || !d?.split) return 0;
  const here = foundationsArea(s, activeSeat(s));
  return d.areas
    .filter((a) => a !== here)
    .flatMap((a) => a.staging)
    .filter((u) => live(s, u, D.river))
    .reduce((n, u) => n + threatOf(s, u), 0);
}
/** Nest of Horrors: "Travel: Each player at this stage discards the top card of the encounter deck to travel here. Reveal each Nameless enemy discarded by this effect." */
const fsTravelEffects = (s: GameState, u: Unit) =>
  fsLive(s) && live(s, u, D.nest)
    ? [fx("nfsNestTravel", { player: firstPlayer(s) })]
    : undefined;

function fsEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!fsLive(s)) return false;
  // Giant Cave Centipede: "When Revealed: Each player at this stage shuffles
  // the card in his hand with the highest printed cost back into his deck."
  if (code === D.centipede) {
    if (fromReveal)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("nfsCentipede", { player })),
      );
    return true;
  }
  if (code !== D.chill) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Chill of the Roots: "When Revealed: Each player must either discard his
  // hand, or raise his threat by the number of cards in his hand. If no cards
  // were discarded by this effect, Chill of the Roots gains surge."
  prepend(s, fx("nfsChill", { value: 0, flag: false, player: firstPlayer(s) }));
  return true;
}

function fsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !fsLive(s)) return false;
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Shivering River: "Attacking enemy gets +1 [attack]. (+3 [attack]
    // instead if there is more than one player at this staging area.)"
    case D.river:
      c.attackBonus += playerOrder(s).length > 1 ? 3 : 1;
      return true;
    // Chill of the Roots: "If attacking enemy is Nameless, attach the top
    // card of the defending player's deck to it."
    case D.chill:
      if (enemy && nameless(enemy))
        feed(s, enemy, c.attackPlayer ?? ownerOf(s, enemy), 1);
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareFoundationsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfs")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nfsWashed": {
      // All Mount and Artifact cards in play.
      const gone: string[] = [];
      for (const player of globalPlayerOrder(s))
        forOwner(s, player, () => {
          for (const c of [...s.heroes, ...s.allies]) {
            for (const a of [...c.attachments])
              if (
                !a.facedown &&
                (traitOf(a.code, "Mount") || traitOf(a.code, "Artifact"))
              ) {
                gone.push(card(a.code).name);
                discardAttachment(s, c, a);
              }
            if (
              card(c.code).type_code === "ally" &&
              (traitOf(c.code, "Mount") || traitOf(c.code, "Artifact"))
            ) {
              gone.push(name(c));
              discardCharacter(s, c);
            }
          }
        });
      log(
        s,
        `Foundations of Stone · Stage 3B: Mount and Artifact cards are discarded${gone.length ? ` (${gone.join(", ")})` : " (none in play)"}; each player keeps allies of total printed cost 6 or less.`,
        "danger",
      );
      prepend(
        s,
        ...globalPlayerOrder(s).map((player) => fx("nfsAllies", { player })),
      );
      return true;
    }
    case "nfsAllies": {
      const total = s.allies.reduce((n, a) => n + cost(a.code), 0);
      if (total <= 6) return true;
      choose(
        s,
        `Foundations of Stone · Discard an ally (total printed cost ${total}, at most 6)${seatLabel(s, p)}`,
        s.allies.map((a): Option => ({
          id: a.id,
          code: a.code,
          label: `${name(a)} (cost ${cost(a.code)})`,
          effects: [
            fx("nfsDiscardAlly", { target: a.id, player: p }),
            fx("nfsAllies", { player: p }),
          ],
        })),
        card(D.foundationsCard).back_text,
      );
      return true;
    }
    case "nfsDiscardAlly":
      if (u && s.allies.some((a) => a.id === u.id)) discardCharacter(s, u);
      return true;
    case "nfsCentipede": {
      const costs = s.hand.map((h) => cost(h.code));
      if (!costs.length) return true;
      const top = Math.max(...costs);
      const highest = s.hand.filter((h) => cost(h.code) === top);
      if (highest.length === 1) {
        prepend(s, fx("nfsShuffleBack", { target: highest[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `Giant Cave Centipede · Shuffle your highest-cost card back into your deck${seatLabel(s, p)}`,
        highest.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `${card(h.code).name} (cost ${top})`,
          effects: [fx("nfsShuffleBack", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "nfsShuffleBack": {
      const i = s.hand.findIndex((h) => h.id === e.target);
      if (i < 0) return true;
      const [c] = s.hand.splice(i, 1);
      putPlayerDeck(s, c);
      shuffle(s, s.deck);
      log(
        s,
        `Giant Cave Centipede: ${card(c.code).name} is shuffled back into its owner's deck${seatLabel(s, p)}.`,
        "danger",
      );
      return true;
    }
    case "nfsCentipedeMove": {
      if (!u || !allEngaged(s).some((x) => x.id === u.id)) return true;
      const others = globalPlayerOrder(s).filter((x) => x !== p);
      if (!others.length) {
        log(s, "Giant Cave Centipede: there is no other player.");
        return true;
      }
      if (others.length === 1 || !foundationsState(s)?.split) {
        prepend(
          s,
          fx("nfsCentipedeTo", { target: u.id, value: others[0], player: p }),
        );
        return true;
      }
      choose(
        s,
        `Giant Cave Centipede · Add it to a different player's staging area${seatLabel(s, p)}`,
        others.map((x): Option => ({
          id: `seat-${x}`,
          label: `Player ${x + 1}'s staging area`,
          effects: [
            fx("nfsCentipedeTo", { target: u.id, value: x, player: p }),
          ],
        })),
        card(D.centipede).text,
      );
      return true;
    }
    case "nfsCentipedeTo": {
      if (!u || !allEngaged(s).some((x) => x.id === u.id)) return true;
      const to = e.value ?? 0;
      forOwner(s, ownerOf(s, u), () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      const area = foundationsArea(s, to);
      if (
        foundationsState(s)?.split &&
        area &&
        area !== foundationsArea(s, activeSeat(s))
      )
        area.staging.push(u);
      else s.staging.push(u);
      log(
        s,
        `Giant Cave Centipede is added to ${foundationsState(s)?.split ? `Player ${to + 1}'s` : "the"} staging area.`,
        "danger",
      );
      return true;
    }
    case "nfsNestTravel": {
      const found: string[] = [];
      for (const player of playerOrder(s)) {
        const code = encounterDraw(s);
        if (!code) break;
        s.encounterDiscard.push(code);
        log(
          s,
          `Nest of Horrors: ${card(code).name} is discarded${seatLabel(s, player)}.`,
        );
        if (card(code).type_code === "enemy" && traitOf(code, "Nameless"))
          found.push(code);
      }
      for (const code of found) {
        const i = s.encounterDiscard.lastIndexOf(code);
        if (i >= 0) s.encounterDiscard.splice(i, 1);
        log(s, `Nest of Horrors reveals ${card(code).name}.`, "danger");
        revealed(s, code);
      }
      return true;
    }
    case "nfsChill": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        if (!e.flag) {
          log(
            s,
            "Chill of the Roots: no cards were discarded; it gains surge.",
          );
          prepend(
            s,
            ...surgeEffects(D.chill).map((x) => ({
              ...x,
              player: firstPlayer(s),
            })),
          );
        }
        return true;
      }
      prepend(
        s,
        fx("nfsChillChoice", {
          value: cursor,
          flag: e.flag,
          player: order[cursor],
        }),
      );
      return true;
    }
    case "nfsChillChoice": {
      const cursor = e.value ?? 0,
        n = s.hand.length;
      const next = (discarded: boolean) =>
        fx("nfsChill", {
          value: cursor + 1,
          flag: !!e.flag || discarded,
          player: firstPlayer(s),
        });
      if (!n) {
        prepend(s, next(false));
        return true;
      }
      choose(
        s,
        `Chill of the Roots · Discard your hand or raise your threat by ${n}${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: `Discard your hand (${n} ${n === 1 ? "card" : "cards"})`,
            effects: [fx("nfsDiscardHand", { player: p }), next(true)],
          },
          {
            id: "threat",
            label: `Raise your threat by ${n}`,
            effects: [
              fx("nfsChillThreat", { value: n, player: p }),
              next(false),
            ],
          },
        ],
        card(D.chill).text,
      );
      return true;
    }
    case "nfsDiscardHand":
      for (const h of [...s.hand])
        discardHandCard(s, h.id, { encounterEffect: true });
      return true;
    case "nfsChillThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nfsAllies",
  "nfsDiscardAlly",
  "nfsCentipede",
  "nfsShuffleBack",
  "nfsCentipedeMove",
  "nfsCentipedeTo",
  "nfsChillChoice",
  "nfsDiscardHand",
  "nfsChillThreat",
]);
export const NIGHTMARE_FOUNDATIONS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: fsStageRevealed,
  stats: fsStats,
  enemyAttackStarted: fsEnemyAttackStarted,
  engaged: fsEngaged,
  enemyEntered: fsEnemyEntered,
  namelessFed: fsNamelessFed,
  combatEnd: fsCombatEnd,
  stagingThreat: fsStagingThreat,
  travelEffects: fsTravelEffects,
  encounter: fsEncounter,
  shadow: fsShadow,
  effect: nightmareFoundationsEffect,
  sharedEffect: (e) => e.kind.startsWith("nfs") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareFoundations(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  return (
    q.primevalFed === undefined ||
    (Array.isArray(q.primevalFed) &&
      q.primevalFed.every((id) => typeof id === "string"))
  );
}
