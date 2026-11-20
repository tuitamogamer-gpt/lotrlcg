/**
 * Flies and Spiders' Nightmare Deck (docs/NIGHTMARE.md): its setup card's rule
 * (each player gives 1 poison to a hero they control, once the scenario's own
 * setup has resolved) and its Nightmare encounter cards, composed with the
 * scenario's own rules (src/game/flies-spiders.ts) through batch4Scenario
 * while a Nightmare mode game is played. The scenario builds its encounter
 * deck with the setup card's removals; poison, Venom, unconsciousness and the
 * separate staging areas are its own. Effects use the "nfs" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { discardAttachment } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  firstPlayer,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { NIGHTMARE_OTD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { givePoison, makeUnconscious, poisonOf } from "./flies-spiders";

const fsLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "flies-and-spiders";
/** "The number of poison in play": every poison attached to a character. */
const poisonInPlay = (s: GameState) =>
  globalCharacters(s).reduce((n, u) => n + poisonOf(u), 0);
const poisoned = (u: Unit) => poisonOf(u) > 0;
/** The characters a player controls that have poison. */
const poisonedOf = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(poisoned);
/** A hero can be given poison: it is conscious and its controller's deck has a card. */
const canPoison = (s: GameState, u: Unit) =>
  !u.unconscious && seatView(s, ownerOf(s, u)).deck.length > 0;
/** The active locations of a player's staging area (while Flies and Spiders' areas are separate). */
function activeLocationsOf(s: GameState, player: number): Unit[] {
  const q = s.fliesSpiders;
  if (!q?.split) return allActiveLocations(s);
  const area = q.areas.find((a) => a.players.includes(player));
  if (!area) return [];
  const projected =
    area.id === q.activeArea && area.players.includes(activeSeat(s));
  return projected
    ? allActiveLocations(s)
    : [
        ...(area.activeLocation ? [area.activeLocation] : []),
        ...area.extraActiveLocations,
      ];
}
const activeFor = (s: GameState, u: Unit, code: string) =>
  activeLocationsOf(s, ownerOf(s, u)).some((l) => live(s, l, code));
const poisonFx = (s: GameState, u: Unit, value = 1) =>
  fx("fasPoison", { target: u.id, value, player: ownerOf(s, u) });

// ------------------------------------------------------------- the setup card

/** "Setup: Each player gives 1 poison to a hero he controls." */
const fsSetupFollowUp = (s: GameState): Effect[] =>
  fsLive(s)
    ? playerOrder(s).map((player) => fx("nfsSetupPoison", { player }))
    : [];

// ------------------------------------------------------------- the cards

/** Attercop: "Attercop gets -1 engagement cost for each poison in play." */
const fsEngagementBonus = (s: GameState, u: Unit) =>
  fsLive(s) && live(s, u, N.attercop) ? -poisonInPlay(s) : 0;
/** Attercop: "Poisoned characters cannot be declared as attackers or defenders against Attercop." */
const fsCannotAttack = (s: GameState, character: Unit, enemy: Unit) =>
  fsLive(s) && live(s, enemy, N.attercop) && poisoned(character);
const fsCannotDefend = (s: GameState, enemy: Unit, defender?: Unit) =>
  fsLive(s) && !!defender && live(s, enemy, N.attercop) && poisoned(defender);
/** Venomous Spider: "Forced: After a character is declared as a defender against Venomous Spider, give it 1 poison." */
const fsDefendersDeclared = (s: GameState, enemy: Unit, defenders: Unit[]) =>
  fsLive(s) && live(s, enemy, N.venomous)
    ? defenders.map((d) => poisonFx(s, d))
    : [];
/**
 * Dark Colony: "While Dark Colony is the active location, poisoned
 * characters cannot ready." Patch of Midnight: "While Patch of Midnight is
 * the active location, treat the text box of each poisoned character as if
 * it were blank (except for Traits)."
 */
const fsCannotReady = (s: GameState, u: Unit) =>
  fsLive(s) && poisoned(u) && activeFor(s, u, N.colony);
const fsCharacterBlanked = (s: GameState, u: Unit) =>
  fsLive(s) &&
  ["hero", "ally"].includes(card(u.code).type_code) &&
  poisoned(u) &&
  activeFor(s, u, N.patch);
/** Dark Colony: "Travel: A player at this stage must give 1 poison to a hero he controls to travel here." */
const colonyHeroes = (s: GameState) =>
  allHeroes(s).filter((h) => canPoison(s, h));
const fsTravelProblem = (s: GameState, u: Unit) =>
  fsLive(s) && live(s, u, N.colony) && !colonyHeroes(s).length
    ? "Travel to Dark Colony: a player at this stage must give 1 poison to a hero they control."
    : null;
const fsTravelEffects = (s: GameState, u: Unit) =>
  fsLive(s) && live(s, u, N.colony)
    ? [fx("nfsColony", { player: firstPlayer(s) })]
    : undefined;
/** Mirkwood Path: "X is the number of poison in play." */
const fsThreatBonus = (s: GameState, u: Unit) =>
  fsLive(s) && live(s, u, N.path) ? poisonInPlay(s) : 0;
/** Mirkwood Path: "Forced: When this location is explored, make 1 hero unconscious." */
function fsExplored(s: GameState, u: Unit) {
  if (fsLive(s) && live(s, u, N.path))
    prepend(s, fx("nfsPathOut", { player: firstPlayer(s) }));
}
/** Spider Bite: "Forced: At the end of the refresh phase, give attached hero 1 poison." */
const bitten = (u: Unit) =>
  u.attachments.some((a) => a.code === N.bite && !a.blanked);
const fsRoundEnd = (s: GameState) =>
  fsLive(s)
    ? allHeroes(s)
        .filter((h) => bitten(h) && !h.unconscious)
        .map((h) => poisonFx(s, h))
    : [];
/** Spider Bite: "When attached hero becomes unconscious, discard Spider Bite." */
function fsCheck(s: GameState) {
  if (!fsLive(s)) return;
  for (const u of globalCharacters(s))
    if (u.unconscious)
      for (const a of u.attachments.filter((a) => a.code === N.bite)) {
        discardAttachment(s, u, a, true);
        log(s, `${name(u)} is unconscious: Spider Bite is discarded.`);
      }
}

function fsEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!fsLive(s) || (code !== N.battle && code !== N.bite)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.battle) {
    // A Horrible Battle: "Each player must either give 1 poison to each
    // hero he controls, or reveal an encounter card."
    s.encounterDiscard.push(code);
    prepend(s, ...playerOrder(s).map((player) => fx("nfsBattle", { player })));
  } else
    // Spider Bite: "Attach to a hero that is not unconscious."
    prepend(s, fx("nfsBite", { player: firstPlayer(s) }));
  return true;
}

function fsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !fsLive(s)) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const attacked = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Venomous Spider: "Give 2 poison to the defending character."
    case N.venomous:
      for (const d of defenders) givePoison(s, d, 2);
      return true;
    // Mirkwood Path: "Attacking enemy gets +1 [attack] for each poisoned
    // character you control."
    case N.path: {
      const n = poisonedOf(s, attacked).length;
      c.attackBonus += n;
      log(s, `Mirkwood Path: the attacking enemy gets +${n} [attack].`);
      return true;
    }
    // Patch of Midnight: "Raise your threat by 1 for each poisoned character
    // you control."
    case N.patch: {
      const n = poisonedOf(s, attacked).length;
      log(
        s,
        `Patch of Midnight: the defending player raises their threat by ${n}.`,
        n ? "danger" : undefined,
      );
      if (n) prepend(s, fx("heirsThreat", { value: n, player: attacked }));
      return true;
    }
    // A Horrible Battle: "Attacking enemy makes an additional attack
    // against the defending player after this one."
    case N.battle:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "A Horrible Battle: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareFasEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nfs")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nfsSetupPoison": {
      const heroes = seatView(s, p).heroes.filter((h) => canPoison(s, h));
      if (!heroes.length) return true;
      choose(
        s,
        `Flies and Spiders · Nightmare: give 1 poison to a hero you control${seatLabel(s, p)}`,
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `Give 1 poison to ${name(h)}`,
          effects: [poisonFx(s, h)],
        })),
        card(N.fasCard).back_text,
      );
      return true;
    }
    case "nfsBattle": {
      const heroes = seatView(s, p).heroes;
      // Either option must be fully resolvable: each hero takes its poison.
      const able =
        heroes.length > 0 &&
        heroes.every((h) => !h.unconscious) &&
        seatView(s, p).deck.length >= heroes.length;
      const reveal = fx("reveal", { player: p });
      if (!able) {
        log(
          s,
          `A Horrible Battle: not every hero can be given poison, so an encounter card is revealed${seatLabel(s, p)}.`,
          "danger",
        );
        prepend(s, reveal);
        return true;
      }
      choose(
        s,
        `A Horrible Battle · Give 1 poison to each hero you control, or reveal an encounter card${seatLabel(s, p)}`,
        [
          {
            id: "poison",
            label: "Give 1 poison to each hero you control",
            effects: heroes.map((h) => poisonFx(s, h)),
          },
          {
            id: "reveal",
            label: "Reveal an encounter card",
            effects: [reveal],
          },
        ],
        card(N.battle).text,
      );
      return true;
    }
    case "nfsBite": {
      const heroes = allHeroes(s).filter((h) => !h.unconscious && !bitten(h));
      if (!heroes.length) {
        s.encounterDiscard.push(N.bite);
        log(s, "Spider Bite: no hero can take it; it is discarded.");
        return true;
      }
      choose(
        s,
        "Spider Bite · Attach it to a hero that is not unconscious",
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `Attach Spider Bite to ${name(h)}`,
          effects: [fx("nfsBiteAttach", { target: h.id, player: p })],
        })),
        card(N.bite).text,
      );
      return true;
    }
    case "nfsBiteAttach":
      if (!u || u.unconscious) {
        s.encounterDiscard.push(N.bite);
        return true;
      }
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: N.bite,
        exhausted: false,
      });
      log(s, `Spider Bite is attached to ${name(u)}.`, "danger");
      return true;
    case "nfsColony": {
      const heroes = colonyHeroes(s);
      if (!heroes.length) return true;
      choose(
        s,
        "Dark Colony · A player at this stage gives 1 poison to a hero they control",
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `Give 1 poison to ${name(h)}${seatLabel(s, ownerOf(s, h))}`,
          effects: [poisonFx(s, h)],
        })),
        card(N.colony).text,
      );
      return true;
    }
    case "nfsPathOut": {
      const heroes = allHeroes(s).filter((h) => !h.unconscious);
      if (!heroes.length) return true;
      choose(
        s,
        "Mirkwood Path · Make 1 hero unconscious",
        heroes.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: `Make ${name(h)} unconscious${seatLabel(s, ownerOf(s, h))}`,
          effects: [fx("nfsUnconscious", { target: h.id, player: p })],
        })),
        card(N.path).text,
      );
      return true;
    }
    case "nfsUnconscious":
      if (u) makeUnconscious(s, u);
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_FAS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  setupFollowUp: fsSetupFollowUp,
  engagementBonus: fsEngagementBonus,
  cannotAttack: fsCannotAttack,
  cannotDefend: fsCannotDefend,
  defendersDeclared: fsDefendersDeclared,
  cannotReady: fsCannotReady,
  characterBlanked: fsCharacterBlanked,
  travelProblem: fsTravelProblem,
  travelEffects: fsTravelEffects,
  threatBonus: fsThreatBonus,
  explored: fsExplored,
  roundEnd: fsRoundEnd,
  check: fsCheck,
  encounter: fsEncounter,
  shadow: fsShadow,
  effect: nightmareFasEffect,
  sharedEffect: (e) =>
    [
      "nfsBite",
      "nfsBiteAttach",
      "nfsColony",
      "nfsPathOut",
      "nfsUnconscious",
    ].includes(e.kind),
};
