/**
 * The Thing in the Depths' Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card (removals from the encounter deck and the set aside The Thing in the
 * Depths encounter set, the boss's attacks as it enters play, Aft Cabin's
 * threat and detachment, Crashing Arm's detachment, Captain's Quarters'
 * resources and the new Grapple criteria are the scenario's own checks, in
 * src/game/depths.ts) and its Nightmare encounter cards, composed with the
 * scenario's rules through batch4Scenario while a Nightmare mode game is
 * played. Effects use the "ndp" prefix.
 */
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
  removeShadowCard,
  shuffle,
  stats,
} from "./core";
import { discardAttachment, exhaustCharacter } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { resolveDoomed } from "./voice-isengard";
import { depthsGrapple, grappleLocations } from "./depths";
import {
  DEPTHS as D,
  DEPTHS_NIGHTMARE as N,
  DEPTHS_TENTACLES,
  depthsGrappledWith,
  depthsState,
} from "./depths-support";
import { nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareDepthsState {
  /** Aft Cabin: the enemies detached from it get +3 [defense] until the end of this round. */
  depthsAft?: { round: number; ids: string[] };
}

const ndpLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "the-thing-in-the-depths" &&
  !!depthsState(s);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
/** Stage 3B's gained Forced effects (the setup card), while its text is active. */
const stageThree = (s: GameState) =>
  ndpLive(s) && s.stage === 3 && !mainQuestUnit(s)?.blanked;
const defenders = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};

// ------------------------------------------------------------- passives

/** Aft Cabin: "+3 [defense] until the end of the round" for each enemy detached from it. */
function ndpStats(s: GameState, u: Unit) {
  const aft = s.nightmare?.depthsAft;
  if (!ndpLive(s) || !aft || aft.round !== s.round) return {};
  const n = aft.ids.filter((id) => id === u.id).length;
  return n ? { defense: 3 * n } : {};
}
/** Deep Maelstrom: "Cannot be canceled." */
const ndpCannotCancel = (s: GameState, shadow?: boolean, code?: string) =>
  ndpLive(s) && !shadow && code === N.maelstrom;
/** Deep Maelstrom "gains Doomed 5" only when it reveals no card: it has no printed Doomed keyword. */
const ndpPrintedDoomed = (s: GameState, code: string) =>
  ndpLive(s) && code === N.maelstrom ? 0 : undefined;

// ------------------------------------------------------------- the cards

function ndpEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ndpLive(s) || (code !== N.maelstrom && code !== N.tumultuous))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (fromReveal)
    prepend(
      s,
      fx(code === N.maelstrom ? "ndpMaelstrom" : "ndpTumultuous", {
        player: activeSeat(s),
      }),
    );
  return true;
}

function ndpShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ndpLive(s)) return false;
  const enemy = get(s, c.enemyId);
  const player = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Slithering Arm: "Either resolve Slithering Arm's grapple keyword, or
    // treat this attack as undefended."
    case N.slithering: {
      const index = enemy ? (enemy.revealedShadowCount ?? 0) - 1 : -1;
      prepend(
        s,
        fx("ndpSlithering", { target: enemy?.id, value: index, player }),
      );
      return true;
    }
    // Crashing Arm: "Attacking enemy makes an additional attack after this
    // one."
    case N.crashing:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Crashing Arm: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    // Deep Maelstrom: "Attacking enemy gets +1 [attack] for each enemy
    // grappled with a location."
    case N.maelstrom: {
      const n = depthsState(s)!.grappled.length;
      c.attackBonus += n;
      log(
        s,
        `Deep Maelstrom: the attacking enemy gets +${n} [attack] (1 for each enemy grappled with a location).`,
        n ? "danger" : undefined,
      );
      return true;
    }
    // Tumultuous Waters: "If the defending character has 1 or less
    // [willpower], treat this attack as undefended."
    case N.tumultuous:
      if (defenders(s).some((u) => stats(s, u).will <= 1)) {
        c.defenderId = null;
        c.defenderIds = [];
        log(
          s,
          "Tumultuous Waters: the defending character has 1 or less [willpower], so this attack is undefended.",
          "danger",
        );
      } else log(s, "Tumultuous Waters: no effect on this attack.");
      return true;
    // Corsair Duelist: "Attacking enemy gets +1 [attack] for each resource
    // on it."
    case N.duelist: {
      const n = enemy?.resources ?? 0;
      c.attackBonus += n;
      log(
        s,
        `Corsair Duelist: the attacking enemy gets +${n} [attack] (1 for each resource on it).`,
        n ? "danger" : undefined,
      );
      return true;
    }
  }
  return false;
}

/** Slithering Arm: "Forced: After Slithering Arm engages a player, it makes an immediate attack against that player." */
function ndpEngaged(s: GameState, u: Unit) {
  if (!ndpLive(s) || !live(s, u, N.slithering)) return;
  log(
    s,
    "Slithering Arm engages and makes an immediate attack against that player.",
    "danger",
  );
  prepend(s, fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }));
}
/** Corsair Duelist: "Corsair Duelist enters play with 2 resources on it." */
function ndpCardEntered(s: GameState, u: Unit) {
  if (!ndpLive(s) || !live(s, u, N.duelist)) return;
  u.resources += 2;
}
/**
 * Corsair Duelist: "Forced: When Corsair Duelist would be defeated, remove
 * 1 resource and all damage from it instead" (while it has a resource).
 */
function ndpBeforeDestroy(s: GameState, u: Unit, destruction: boolean) {
  if (!ndpLive(s) || !destruction || !live(s, u, N.duelist) || u.resources < 1)
    return false;
  u.resources--;
  u.damage = 0;
  log(
    s,
    `Corsair Duelist is not defeated: 1 resource and all damage are removed from it (${u.resources} left).`,
    "danger",
  );
  return true;
}
/**
 * Stage 3B gains (the setup card): "Forced: At the beginning of the quest
 * phase, if there are fewer locations in play than the number of players,
 * discard cards from the top of the encounter deck until a location is
 * discarded. Reveal that location."
 */
function ndpQuestBegin(s: GameState): Effect[] {
  if (!stageThree(s) || locationsInPlay(s).length >= playerOrder(s).length)
    return [];
  return [fx("ndpLocation", { player: firstPlayer(s) })];
}
/**
 * Stage 3B gains (the setup card): "Forced: At the end of the refresh
 * phase, resolve the grapple keyword on each Tentacle enemy in play" (in the
 * staging area or engaged; the first player orders them).
 */
function ndpRefreshEnd(s: GameState): Effect[] {
  if (!stageThree(s)) return [];
  const tentacles = [...s.staging, ...allEngaged(s)].filter(
    (u) =>
      DEPTHS_TENTACLES.includes(u.code) &&
      (!u.blanked || u.printedKeywordsPreserved),
  );
  const effects = tentacles.map((u) =>
    fx("ndpGrapple", {
      target: u.id,
      code: u.code,
      text: `${name(u)} · resolve Grapple`,
      player: firstPlayer(s),
    }),
  );
  return effects.length > 1
    ? [
        fx("fangornOrder", {
          effects,
          text: "Choose the next Tentacle enemy's Grapple keyword",
          player: firstPlayer(s),
        }),
      ]
    : effects;
}

// ------------------------------------------------------------- effects

export function nightmareDepthsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndp")) return false;
  if (!ndpLive(s)) return true;
  const q = depthsState(s)!;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    // Captain's Quarters: "Travel: Add 2 resources to Captain Sahír (even if
    // he is out of play) and 1 resource to each other Raider card in play."
    case "ndpQuarters": {
      const sahir = [
        ...q.setAside,
        ...s.staging,
        ...allEngaged(s),
        ...allCharacters(s),
      ].find((u) => u.code === D.sahir || u.code === D.sahirAlly);
      if (sahir) sahir.resources += 2;
      const others = [
        ...s.staging,
        ...allEngaged(s),
        ...allCharacters(s),
      ].filter((u) => u.id !== sahir?.id && trait(u, "Raider"));
      for (const u of others) u.resources += 1;
      log(
        s,
        `Captain's Quarters: ${sahir ? "Captain Sahír gets 2 resources" : "Captain Sahír is not in the game"}${others.length ? ` and ${others.map((u) => name(u)).join(", ")} ${others.length === 1 ? "gets" : "each get"} 1` : ""}.`,
        "danger",
      );
      return true;
    }
    // Deep Maelstrom: "For each location in play that is not grappled,
    // reveal the top card of the encounter deck. If no cards are revealed by
    // this effect, Deep Maelstrom gains Doomed 5."
    case "ndpMaelstrom": {
      const n = locationsInPlay(s).filter(
        (l) => !depthsGrappledWith(s, l.id).length,
      ).length;
      if (!n || (!s.encounterDeck.length && !s.encounterDiscard.length)) {
        log(
          s,
          "Deep Maelstrom reveals no card, so it gains Doomed 5.",
          "danger",
        );
        resolveDoomed(s, 5, "encounter");
        return true;
      }
      log(
        s,
        `Deep Maelstrom: ${n} location${n === 1 ? " is" : "s are"} not grappled, so ${n === 1 ? "1 encounter card is" : `${n} encounter cards are`} revealed.`,
        "danger",
      );
      prepend(
        s,
        ...Array.from({ length: n }, () => fx("reveal", { player: p })),
      );
      return true;
    }
    // Tumultuous Waters: "Exhaust each character with 1 or less
    // [willpower]. Remove all resources from each ready hero and
    // objective-ally."
    case "ndpTumultuous": {
      const low = allCharacters(s).filter(
        (u) => !u.exhausted && stats(s, u).will <= 1,
      );
      for (const u of low)
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
      const ready = allCharacters(s).filter(
        (u) =>
          !u.exhausted &&
          (isHero(u) || card(u.code).type_code === "objective-ally") &&
          u.resources > 0,
      );
      for (const u of ready) u.resources = 0;
      log(
        s,
        `Tumultuous Waters: ${low.length ? `${low.map((u) => name(u)).join(", ")} ${low.length === 1 ? "is" : "are"} exhausted` : "no character has 1 or less [willpower]"}; ${ready.length ? `${ready.map((u) => name(u)).join(", ")} ${ready.length === 1 ? "loses its" : "lose their"} resources` : "no ready hero or objective-ally has resources"}.`,
        "danger",
      );
      return true;
    }
    case "ndpSlithering": {
      const enemy = get(s, e.target);
      const options: Option[] = [];
      if (enemy && enemy.shadows[e.value ?? -1] === N.slithering)
        options.push({
          id: "grapple",
          code: N.slithering,
          label: "Resolve Slithering Arm's Grapple keyword",
          effects: [
            fx("ndpSlitheringGrapple", {
              target: enemy.id,
              value: e.value,
              player: firstPlayer(s),
            }),
          ],
        });
      if (defenders(s).length)
        options.push({
          id: "undefended",
          label: "Treat this attack as undefended",
          effects: [fx("ndpUndefended", { player: p })],
        });
      if (!options.length) return true;
      choose(
        s,
        `Slithering Arm · Shadow${seatLabel(s, p)}`,
        options,
        "Shadow: Either resolve Slithering Arm's grapple keyword, or treat this attack as undefended.",
      );
      return true;
    }
    case "ndpSlitheringGrapple": {
      const enemy = get(s, e.target);
      const index = e.value ?? -1;
      if (!enemy || enemy.shadows[index] !== N.slithering) return true;
      removeShadowCard(enemy, index);
      const u = make(s, N.slithering);
      q.pendingEnemies.push(u);
      log(s, "Slithering Arm leaves the shadow cards to grapple a location.");
      prepend(
        s,
        fx("depthsGrappleHeld", { target: u.id, player: firstPlayer(s) }),
      );
      return true;
    }
    case "ndpUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, "Slithering Arm: this attack is undefended.", "danger");
      }
      return true;
    case "ndpLocation": {
      let found: string | undefined;
      let reshuffled = false;
      const discarded: string[] = [];
      for (;;) {
        if (!s.encounterDeck.length) {
          if (!reshuffled && s.encounterDiscard.length) {
            s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
            reshuffled = true;
          } else break;
        }
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        discarded.push(code);
        if (card(code).type_code === "location") {
          found = code;
          break;
        }
      }
      if (!found) {
        log(
          s,
          `Defend the Ship!: ${discarded.length} encounter cards are discarded without a location.`,
        );
        return true;
      }
      s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(found), 1);
      log(
        s,
        `Defend the Ship!: fewer locations than players are in play; ${discarded.length} encounter card${discarded.length === 1 ? " is" : "s are"} discarded and ${card(found).name} is revealed.`,
        "danger",
      );
      prepend(s, fx("revealCard", { code: found, player: firstPlayer(s) }));
      return true;
    }
    case "ndpGrapple": {
      const u = [...s.staging, ...allEngaged(s)].find((x) => x.id === e.target);
      if (!u) return true;
      if (!grappleLocations(s, u).length) {
        log(
          s,
          `${name(u)} finds no location in the staging area to grapple and stays where it is.`,
        );
        return true;
      }
      s.staging = s.staging.filter((x) => x.id !== u.id);
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      depthsGrapple(s, u);
      return true;
    }
  }
  return false;
}

export function validNightmareDepths(s: GameState) {
  const aft = s.nightmare?.depthsAft;
  if (aft === undefined) return true;
  return (
    ndpLive(s) &&
    !!aft &&
    Number.isInteger(aft.round) &&
    aft.round >= 0 &&
    aft.round <= s.round &&
    Array.isArray(aft.ids) &&
    aft.ids.length > 0 &&
    aft.ids.every((id) => typeof id === "string" && id.length > 0)
  );
}

export const NIGHTMARE_DEPTHS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: ndpStats,
  cannotCancel: ndpCannotCancel,
  printedDoomed: ndpPrintedDoomed,
  encounter: ndpEncounter,
  shadow: ndpShadow,
  engaged: ndpEngaged,
  cardEntered: ndpCardEntered,
  beforeDestroy: ndpBeforeDestroy,
  questBegin: ndpQuestBegin,
  refreshEndForced: ndpRefreshEnd,
  effect: nightmareDepthsEffect,
  sharedEffect: () => false,
};
