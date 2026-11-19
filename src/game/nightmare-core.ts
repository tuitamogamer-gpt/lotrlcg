/**
 * The Core Set Nightmare Decks (docs/NIGHTMARE.md): each setup card's rules
 * and the Nightmare encounter cards, composed with the scenario's own rules
 * through batch4Scenario while a Nightmare mode game is played.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, enqueue, fx, get, log, make, prepend, stats } from "./core";
import {
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  exhaustCharacter,
  raiseThreat,
} from "./board";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import {
  NIGHTMARE_CORE as N,
  nightmareCardOf,
  nightmareLive,
} from "./nightmare";

/** Lasting effects of the Nightmare cards. */
export interface NightmareCoreState {
  /** Ungoliant's Brood: the players whose cards cannot ready this round. */
  noReady?: { player: number; round: number }[];
}
const state = (s: GameState) => (s.nightmare ??= {});
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const seatLabel = (s: GameState, p: number) =>
  several(s) ? ` · ${seatName(s, p)}` : "";
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const traitOf = (code: string, t: string) =>
  (card(code).traits ?? "").split(".").some((x) => x.trim() === t);
const live = (s: GameState, u: Unit, code: string) =>
  u.code === code && !u.blanked && nightmareLive(s);
const undefended = (s: GameState) =>
  !(s.combat?.defenderIds?.length ?? (s.combat?.defenderId ? 1 : 0));
const defendingPlayer = (s: GameState) =>
  s.combat?.attackPlayer ?? firstPlayer(s);

// ------------------------------------------------------------- setup

/**
 * Passage Through Mirkwood (Nightmare): "Forced: During setup, each player
 * reveals 1 card from the encounter deck and adds it to the staging area."
 */
export function nightmareSetup(s: GameState) {
  if (!nightmareLive(s)) return;
  log(
    s,
    `Nightmare mode: ${card(nightmareCardOf(s)!).name}'s Nightmare Deck replaces the cards its setup card removes.`,
    "chapter",
  );
  if (s.scenarioId === "mirkwood")
    enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
}

// ------------------------------------------------------------- passives

/**
 * Spiders of Mirkwood: "While it is engaged with you, Spiders of Mirkwood gets
 * +1 [attack] for each exhausted character you control."
 */
function nmStats(s: GameState, u: Unit) {
  if (!live(s, u, N.spiders)) return {};
  const p = playerOrder(s).find((x) =>
    seatView(s, x).engaged.some((e) => e.id === u.id),
  );
  return {
    attack: p === undefined ? 0 : own(s, p).filter((c) => c.exhausted).length,
  };
}
/** Ungoliant's Brood: "your cards cannot ready for the remainder of the round." */
const nmCannotReady = (s: GameState, u: Unit) =>
  nightmareLive(s) &&
  !!s.nightmare?.noReady?.some(
    (m) => m.round === s.round && m.player === ownerOf(s, u),
  );

// ------------------------------------------------------------- triggers

function nmEngaged(s: GameState, u: Unit) {
  if (!nightmareLive(s)) return;
  const p = ownerOf(s, u);
  // Forest Flies: "Forced: After you engage Forest Flies, deal 1 damage to
  // each exhausted character you control."
  if (live(s, u, N.flies))
    prepend(
      s,
      ...own(s, p)
        .filter((c) => c.exhausted)
        .map((c) => fx("damage", { target: c.id, value: 1, player: p })),
    );
  // Ungoliant's Brood: "Forced: After you engage Ungoliant's Brood, your
  // cards cannot ready for the remainder of the round."
  if (live(s, u, N.brood)) {
    const q = state(s);
    q.noReady = [
      ...(q.noReady ?? []).filter((m) => m.round === s.round),
      { player: p, round: s.round },
    ];
    log(
      s,
      `Ungoliant's Brood: ${several(s) ? `${seatName(s, p)}'s` : "your"} cards cannot ready for the remainder of the round.`,
      "danger",
    );
  }
}
/**
 * Glade of the Spawn (the active location): "Forced: After a Spider enemy
 * enters play, each player must choose and exhaust 1 character he controls."
 */
function spiderEntered(s: GameState, u: Unit) {
  const glade = s.activeLocation;
  if (
    !glade ||
    !live(s, glade, N.glade) ||
    card(u.code).type_code !== "enemy" ||
    !traitOf(u.code, "Spider")
  )
    return;
  log(s, `Glade of the Spawn: ${name(u)} enters play.`, "danger");
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("chooseExhaust", { count: 1, player }),
    ),
  );
}
function nmCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  cancelled = false,
) {
  if (!nightmareLive(s) || cancelled) return;
  spiderEntered(s, u);
  // Ungoliant's Spawn: "When Revealed: Until the end of the phase, each
  // character currently committed to the quest gets -2 [willpower] and is
  // discarded if its [willpower] is 0."
  if (fromReveal && live(s, u, N.spawn))
    prepend(s, fx("nmSpawn", { player: firstPlayer(s) }));
}
/** The Spider's Web (Condition): "Each time attached hero readies, deal it 1 damage." */
function nmCharacterReadied(s: GameState, u: Unit) {
  if (!nightmareLive(s)) return;
  const webs = u.attachments.filter((a) => a.code === N.web && !a.blanked);
  if (webs.length)
    prepend(
      s,
      fx("damage", { target: u.id, value: webs.length, player: ownerOf(s, u) }),
    );
}
/**
 * Abandoned Camp: "Forced: After Abandoned Camp leaves play, each player must
 * deal 2 damage to each exhausted character he controls."
 */
function campLeft(s: GameState, u: Unit) {
  if (!live(s, u, N.camp)) return;
  log(s, "Abandoned Camp leaves play.", "danger");
  prepend(
    s,
    ...allCharacters(s)
      .filter((c) => c.exhausted)
      .map((c) =>
        fx("damage", { target: c.id, value: 2, player: ownerOf(s, c) }),
      ),
  );
}
function nmHostLeaves(s: GameState, u: Unit) {
  if (card(u.code).type_code === "location") campLeft(s, u);
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [N.backtrack, N.web];
function nmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nightmareLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.backtrack) {
    // "Surge. When Revealed: The topmost enemy or location card in the
    // encounter discard pile is returned to the staging area." (Surge is a
    // printed keyword.)
    s.encounterDiscard.push(code);
    prepend(s, fx("nmBacktrack", { player: firstPlayer(s) }));
  } else prepend(s, fx("nmWeb", { player: firstPlayer(s) }));
  return true;
}

// ------------------------------------------------------------- shadows

function nmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nightmareLive(s)) return false;
  const p = defendingPlayer(s),
    enemy = get(s, c.enemyId);
  // Abandoned Camp: "If this attack is undefended, discard all attachment
  // cards players control."
  if (code === N.camp) {
    if (undefended(s)) prepend(s, fx("nmDiscardAttachments", { player: p }));
    else log(s, "Abandoned Camp · The attack is defended.");
  }
  // Backtrack!: "Deal and resolve the topmost Shadow effect in the encounter
  // discard pile for this attack."
  else if (code === N.backtrack)
    prepend(s, fx("nmBacktrackShadow", { target: c.enemyId, player: p }));
  // Forest Flies: "If attacking enemy is an Insect, deal it 2 additional
  // Shadow cards."
  else if (code === N.flies) {
    if (enemy && traitOf(enemy.code, "Insect"))
      prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 2 }));
    else log(s, "Forest Flies · The attacking enemy is not an Insect.");
  }
  // Spiders of Mirkwood: "Choose and exhaust 1 character you control. If this
  // attack was undefended, also deal that character 2 damage."
  else if (code === N.spiders)
    prepend(s, fx("nmSpidersShadow", { player: p, flag: undefended(s) }));
  // Ungoliant's Brood: "If this attack is undefended, exhaust all characters
  // you control."
  else if (code === N.brood) {
    if (undefended(s)) for (const u of own(s, p)) exhaustCharacter(s, u);
    else log(s, "Ungoliant's Brood · The attack is defended.");
  }
  // Ungoliant's Spawn: "Raise defending player's threat by 5. (Raise
  // defending player's threat by 10 instead if undefended.)"
  else if (code === N.spawn)
    prepend(s, fx("nmThreat", { player: p, value: undefended(s) ? 10 : 5 }));
  else return false;
  return true;
}

// ------------------------------------------------------------- effects

export function nightmareCoreEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nmThreat":
      if ((e.value ?? 0) > 0) {
        raiseThreat(s, e.value!, "encounter");
        log(
          s,
          `${several(s) ? `${seatName(s, p)} raises their` : "You raise your"} threat by ${e.value}.`,
          "danger",
        );
      }
      return true;
    case "nmBacktrack": {
      const pile = s.encounterDiscard;
      let i = pile.length - 1;
      while (i >= 0 && !["enemy", "location"].includes(card(pile[i]).type_code))
        i--;
      if (i < 0) {
        log(
          s,
          "Backtrack! · There is no enemy or location in the encounter discard pile.",
        );
        return true;
      }
      const [code] = pile.splice(i, 1);
      const u = make(s, code);
      s.staging.push(u);
      log(
        s,
        `Backtrack! returns ${name(u)} to the staging area from the encounter discard pile.`,
        "danger",
      );
      if (card(code).type_code === "enemy") {
        enemyAddedToStaging(s, u);
        spiderEntered(s, u);
      }
      return true;
    }
    case "nmBacktrackShadow": {
      const u = get(s, e.target);
      const pile = s.encounterDiscard;
      let i = pile.length - 1;
      while (i >= 0 && !card(pile[i]).shadow) i--;
      if (!u || i < 0) {
        log(
          s,
          "Backtrack! · There is no Shadow effect in the encounter discard pile.",
        );
        return true;
      }
      const [code] = pile.splice(i, 1);
      u.faceupShadows ??= u.shadows.map(() => false);
      const at = u.revealedShadowCount ?? 0;
      u.faceupShadows.splice(at, 0, false);
      u.shadows.splice(at, 0, code);
      log(
        s,
        `Backtrack! deals ${card(code).name} from the encounter discard pile to ${name(u)} and resolves its Shadow effect.`,
        "danger",
      );
      prepend(s, fx("shadowReveal", { code }));
      return true;
    }
    case "nmWeb": {
      // "The player with the highest threat exhausts all heroes he controls.
      // Then, attach this card to one of that player's heroes."
      const order = playerOrder(s);
      const top = Math.max(...order.map((x) => seatView(s, x).threat));
      const target = order.find((x) => seatView(s, x).threat === top)!;
      const heroes = seatView(s, target).heroes;
      forOwner(s, target, () => {
        for (const h of s.heroes) exhaustCharacter(s, h);
      });
      log(
        s,
        `The Spider's Web: ${several(s) ? `${seatName(s, target)} has` : "you have"} the highest threat (${top}) and exhausts each hero.`,
        "danger",
      );
      if (!heroes.length) {
        s.encounterDiscard.push(N.web);
        return true;
      }
      choose(
        s,
        `The Spider's Web · Attach it to one of your heroes${seatLabel(s, target)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("nmWebAttach", { target: h.id, player: target })],
        })),
        card(N.web).text,
      );
      return true;
    }
    case "nmWebAttach": {
      const h = get(s, e.target);
      if (!h) {
        s.encounterDiscard.push(N.web);
        return true;
      }
      h.attachments.push({
        id: `a${s.nextId++}`,
        code: N.web,
        exhausted: false,
      });
      log(
        s,
        `The Spider's Web is attached to ${name(h)}: each time it readies, it takes 1 damage.`,
        "danger",
      );
      return true;
    }
    case "nmSpawn": {
      // (As the Core Set's Ungoliant's Spawn: the quest phase's willpower
      // penalty for committed characters.)
      const ids = allCharacters(s)
        .filter((u) => u.committed)
        .map((u) => u.id);
      s.questDebuff += 2;
      const gone = allCharacters(s).filter(
        (u) => ids.includes(u.id) && stats(s, u).will <= 0,
      );
      log(
        s,
        `Ungoliant's Spawn: ${ids.length} committed ${ids.length === 1 ? "character gets" : "characters get"} -2 [willpower] until the end of the phase${gone.length ? `; ${gone.map((u) => name(u)).join(", ")} ${gone.length === 1 ? "is" : "are"} discarded at 0 [willpower]` : ""}.`,
        "danger",
      );
      for (const u of gone) discardCharacter(s, u);
      return true;
    }
    case "nmSpidersShadow": {
      const targets = own(s, p).filter((u) => !u.exhausted);
      if (!targets.length) return true;
      choose(
        s,
        `Spiders of Mirkwood · Choose and exhaust 1 character you control${e.flag ? " (the attack was undefended: it also takes 2 damage)" : ""}${seatLabel(s, p)}`,
        targets.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("exhaust", { target: u.id, player: p }),
            ...(e.flag
              ? [fx("damage", { target: u.id, value: 2, player: p })]
              : []),
          ],
        })),
      );
      return true;
    }
    case "nmDiscardAttachments": {
      // "Discard all attachment cards players control."
      const hosts = [
        ...allCharacters(s),
        ...allEngaged(s),
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ];
      let n = 0;
      for (const h of hosts)
        for (const a of [...h.attachments])
          if (
            card(a.code).type_code === "attachment" &&
            !["encounter", "burden"].includes(card(a.code).sphere_code ?? "")
          ) {
            discardAttachment(s, h, a);
            n++;
          }
      log(
        s,
        `Abandoned Camp: the attack is undefended, and ${n} attachment ${n === 1 ? "card is" : "cards are"} discarded.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** A composed hook that changes nothing (the Ered Campaign Pool's composer calls each one). */
export const NEUTRAL_LAYER: Batch4ScenarioHooks = {
  stats: () => ({}),
  threatBonus: () => 0,
  stagingThreat: () => 0,
  locationQuestBonus: () => 0,
  locationProgressAmount: (_s, _u, amount) => amount,
  locationProgressBlocked: () => false,
  cannotReady: () => false,
  cannotPlayerReady: () => false,
  cannotPlayerReadyCharacter: () => false,
  characterBlanked: () => false,
  willpowerOverride: () => undefined,
  cannotCancel: () => false,
  cannotOptionallyEngage: () => false,
  immune: () => false,
  cannotAttach: () => false,
  damageAmount: (_s, _u, amount) => amount,
  damageDealt: () => {},
  engaged: () => {},
  encounterBegin: () => {},
  endQuest: () => {},
  characterDestroyed: () => {},
  enemyAttackStarted: () => {},
  shadowResolved: () => {},
  attackFinished: () => [],
  hostLeaves: () => {},
  explored: () => {},
  travelProblem: () => null,
  mustTravel: () => false,
  travelEffects: () => undefined,
  travelEntered: () => {},
  allyEntered: () => false,
  eventPlayed: () => {},
  playerCardPlayed: () => {},
  characterReadied: () => {},
  revealedSurge: () => false,
  cardEntered: () => {},
  committed: () => {},
  encounterEnd: () => [],
  cannotDiscardHand: () => false,
  handDiscardDestination: () => false,
  locationProgressPlaced: () => {},
  threatReduction: (_s, amount) => amount,
  enemyDestination: () => false,
  encounter: () => false,
  shadow: () => false,
  effect: () => false,
  abilityLabel: () => undefined,
  abilityProblem: () => null,
  ability: () => false,
};
/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set(["nmSpidersShadow", "nmWebAttach"]);
export const NIGHTMARE_CORE_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: nmStats,
  cannotReady: nmCannotReady,
  engaged: nmEngaged,
  cardEntered: nmCardEntered,
  characterReadied: nmCharacterReadied,
  hostLeaves: nmHostLeaves,
  explored: (s, u) => campLeft(s, u),
  encounter: nmEncounter,
  shadow: nmShadow,
  effect: nightmareCoreEffect,
  sharedEffect: (e) => e.kind.startsWith("nm") && !PLAYER_EFFECTS.has(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareCore(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const seats = s.table?.seats.length ?? 1;
  return (
    !!q &&
    typeof q === "object" &&
    nightmareLive(s) &&
    (q.noReady === undefined ||
      (Array.isArray(q.noReady) &&
        q.noReady.every(
          (m) =>
            !!m &&
            round(m.round) &&
            Number.isInteger(m.player) &&
            m.player >= 0 &&
            m.player < seats,
        ))) &&
    true
  );
}
