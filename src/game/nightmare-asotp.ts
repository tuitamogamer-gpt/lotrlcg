/**
 * A Shadow of the Past's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (when stage 3A is revealed, Khamûl the Easterling joins the staging
 * area if he is not in play) and its Nightmare encounter cards, composed with
 * the scenario's own rules (src/game/shadow-past.ts) through batch4Scenario
 * while a Nightmare mode game is played. The scenario's Hide tests
 * (src/game/hide-test.ts) serve the Nightmare cards. Effects use the "nsh"
 * prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random, shuffle } from "./core";
import {
  discardHandCard,
  engage,
  enemyAddedToStaging,
  raiseThreat,
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
import { allQuestUnits, attachToQuest, currentQuestCode } from "./quest-state";
import { hideFailed, hideKeyword } from "./hide-test";
import { nextPlayer, who } from "./black-riders-hunted";
import { oneRing, oneRingExhausted, oneRingExhaustedForced } from "./lotr-saga";
import { NIGHTMARE_TBR as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

const shLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "a-shadow-of-the-past";
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code));
/** "The player makes a Hide X test", with the test's own consequence of failing. */
const hide = (
  value: number,
  code: string,
  player: number,
  onFail: Effect[] = [],
) =>
  fx("hideBegin", {
    value,
    code,
    player,
    ...(onFail.length ? { effects: onFail } : {}),
  });
const CHARACTER = ["hero", "ally", "objective-ally"];

// ------------------------------------------------------------- the setup card

/** "Forced: When stage 3A is revealed, if Khamûl the Easterling is not in play, the first player searches ... for Khamûl the Easterling and adds it to the staging area." */
function shStageRevealed(s: GameState, stage: number) {
  if (shLive(s) && stage === 3)
    prepend(s, fx("nshKhamulSearch", { player: firstPlayer(s) }));
}

// ------------------------------------------------------------- the cards

/** Khamûl the Easterling: "-30 engagement cost while The One Ring is exhausted." */
const shEngagementBonus = (s: GameState, u: Unit) =>
  shLive(s) && live(s, u, N.khamul) && oneRingExhausted(s) ? -30 : 0;
/**
 * Khamûl the Easterling: "Forced: At the beginning of the refresh phase, the
 * engaged player makes a Hide 2 test. If the engaged player fails the hide
 * test, Khamûl the Easterling makes an immediate attack."
 */
function shRefreshStart(s: GameState): Effect[] {
  if (!shLive(s)) return [];
  return allEngaged(s)
    .filter((u) => live(s, u, N.khamul))
    .map((u) => {
      const p = ownerOf(s, u);
      return hide(2, N.khamul, p, [
        fx("nshKhamulAttack", { target: u.id, player: p }),
      ]);
    });
}
/** Dark Horseman: "While Dark Horseman is engaged with you, characters you control get -1 [willpower] during Hide tests." */
const shHideWillpower = (s: GameState, u: Unit) =>
  shLive(s)
    ? -seatView(s, ownerOf(s, u)).engaged.filter((x) => live(s, x, N.horseman))
        .length
    : 0;
/** Green-Hill Country: "While Green-Hill Country is in the staging area, add 1 to each Hide X value." */
const shHideValueBonus = (s: GameState) =>
  shLive(s) ? staged(s, N.greenHill).length : 0;
/** Stock Woods: "While Stock Woods is in the staging area, players cannot commit more than 2 characters to a Hide test." */
const shHideCommitLimit = (s: GameState) =>
  shLive(s) && staged(s, N.stockWoods).length ? 2 : undefined;
/** Eastfarthing: "+2 [threat] for each resource token on it." */
const shThreatBonus = (s: GameState, u: Unit) =>
  shLive(s) && live(s, u, N.eastfarthing) ? 2 * (u.resources ?? 0) : 0;
/**
 * After a player fails a Hide test: Eastfarthing ("place 1 resource token
 * here") and In the Name of Mordor! ("he discards a random card from his
 * hand"), each copy in play, after the scenario's own Forced effects.
 */
function shHideFailed(s: GameState, player: number): Effect[] {
  if (!shLive(s)) return [];
  const mordor = allQuestUnits(s)
    .flatMap((q) => q.attachments)
    .filter((a) => a.code === N.mordor && !a.blanked);
  return [
    ...inPlay(s, N.eastfarthing).map((u) =>
      fx("nshEastfarthing", { target: u.id, player: firstPlayer(s) }),
    ),
    ...mordor.map(() => fx("nshMordorDiscard", { player })),
  ];
}
/** Green-Hill Country and Stock Woods: "Travel: The first player makes a Hide 1 test." */
function shTravelEffects(s: GameState, u: Unit) {
  if (!shLive(s) || !(live(s, u, N.greenHill) || live(s, u, N.stockWoods)))
    return undefined;
  return [hide(1, u.code, firstPlayer(s))];
}
/** Sniffing and Hissing's shadow: "If this attack destroys a character, raise your threat by 3." */
function shCharacterDestroyed(s: GameState, u: Unit, ctx: DamageContext) {
  const c = s.combat;
  if (
    !shLive(s) ||
    !c?.nmThreatOnKill ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !CHARACTER.includes(card(u.code).type_code)
  )
    return;
  const value = c.nmThreatOnKill;
  c.nmThreatOnKill = 0;
  prepend(
    s,
    fx("nshThreat", {
      value,
      code: N.sniffing,
      player: c.attackPlayer ?? firstPlayer(s),
    }),
  );
}
/** Green-Hill Country's shadow: "After this attack, attacking enemy engages the next player then makes an immediate attack." */
function shAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!shLive(s) || skipped || !c.nmEngageNext) return [];
  const enemy = get(s, c.enemyId);
  // With one player there is no next player (as Pathless Country's shadow).
  const next = nextPlayer(s, c.attackPlayer ?? firstPlayer(s));
  if (!enemy || next === undefined) return [];
  return Array.from({ length: c.nmEngageNext }, () =>
    fx("nshEngageNext", { target: enemy.id, player: next }),
  );
}

function shEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !shLive(s) ||
    !(
      [N.horseman, N.mordor, N.followed, N.sniffing] as readonly string[]
    ).includes(code)
  )
    return false;
  const first = firstPlayer(s);
  if (code === N.horseman) {
    // Dark Horseman (already in the staging area): "Hide 2."
    if (fromReveal) prepend(s, hide(hideKeyword(code), code, activeSeat(s)));
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.mordor) {
    // In the Name of Mordor!: "Attach to the current quest." Its surge is
    // printed.
    const quest = currentQuestCode(s);
    if (
      quest &&
      attachToQuest(s, quest, { id: `a${s.nextId++}`, code, exhausted: false })
    )
      log(
        s,
        `In the Name of Mordor! is attached to ${card(quest).name}.`,
        "danger",
      );
    else s.encounterDiscard.push(code);
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.followed) {
    // Followed by Shadows: "Starting with the first player, each player
    // makes a Hide 2 test. Each player who fails this Hide test raises his
    // threat by 5."
    prepend(
      s,
      ...playerOrder(s).map((p) =>
        hide(2, code, p, [fx("nshThreat", { value: 5, code, player: p })]),
      ),
    );
    return true;
  }
  // Sniffing and Hissing: "The first player must either exhaust The One
  // Ring and reveal an encounter card, or make a Hide 3 test."
  const ring = oneRing(s);
  if (!ring || ring.exhausted || ring.blanked) {
    prepend(s, hide(3, code, first));
    return true;
  }
  choose(
    s,
    `Sniffing and Hissing${seatLabel(s, first)} · Exhaust The One Ring, or make a Hide 3 test`,
    [
      {
        id: "ring",
        code: ring.code,
        label: "Exhaust The One Ring and reveal an encounter card",
        effects: [fx("nshSniffRing", { player: first })],
      },
      {
        id: "hide",
        label: "Make a Hide 3 test",
        effects: [hide(3, code, first)],
      },
    ],
    card(N.sniffing).text,
  );
  return true;
}

function shShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !shLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Green-Hill Country: "After this attack, attacking enemy engages the
    // next player then makes an immediate attack."
    case N.greenHill:
      c.nmEngageNext = (c.nmEngageNext ?? 0) + 1;
      return true;
    // Stock Woods: "Attacking enemy gets +2 [attack] (+3 [attack] instead if
    // you have failed a Hide test this round)."
    case N.stockWoods:
      c.attackBonus += hideFailed(s, p, "round") ? 3 : 2;
      return true;
    // Followed by Shadows: "If the defending player has failed a Hide test
    // this round, this attack is considered undefended."
    case N.followed:
      if (hideFailed(s, p, "round")) {
        c.defenderId = null;
        c.defenderIds = [];
        log(
          s,
          "Followed by Shadows: this attack is considered undefended.",
          "danger",
        );
      }
      return true;
    // Sniffing and Hissing: "Attacking enemy gets +2 [attack]. If this
    // attack destroys a character, raise your threat by 3."
    case N.sniffing:
      c.attackBonus += 2;
      c.nmThreatOnKill = (c.nmThreatOnKill ?? 0) + 3;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareShadowPastEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nsh")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nshKhamulSearch": {
      if ([...s.staging, ...allEngaged(s)].some((x) => x.code === N.khamul)) {
        log(s, "A Shadow of the Past: Khamûl the Easterling is in play.");
        return true;
      }
      let found = false;
      const i = s.encounterDeck.indexOf(N.khamul);
      const j = s.encounterDiscard.lastIndexOf(N.khamul);
      const k = (s.victoryCards ?? []).indexOf(N.khamul);
      if (i >= 0) found = !!s.encounterDeck.splice(i, 1).length;
      else if (j >= 0) found = !!s.encounterDiscard.splice(j, 1).length;
      else if (k >= 0) {
        s.victoryCards!.splice(k, 1);
        s.victory = Math.max(0, s.victory - (card(N.khamul).victory ?? 0));
        found = true;
      }
      if (found) {
        const khamul = make(s, N.khamul);
        s.staging.push(khamul);
        enemyAddedToStaging(s, khamul);
      }
      shuffle(s, s.encounterDeck);
      log(
        s,
        found
          ? "A Shadow of the Past · Stage 3A: Khamûl the Easterling is added to the staging area; the encounter deck is shuffled."
          : "A Shadow of the Past · Stage 3A: Khamûl the Easterling is nowhere to be found; the encounter deck is shuffled.",
        "danger",
      );
      return true;
    }
    case "nshKhamulAttack":
      if (u && seatView(s, p).engaged.some((x) => x.id === u.id)) {
        log(
          s,
          `Khamûl the Easterling: ${who(s, p)} failed the Hide test; he makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    case "nshEastfarthing":
      if (u && inPlay(s, N.eastfarthing).some((x) => x.id === u.id)) {
        u.resources = (u.resources ?? 0) + 1;
        log(
          s,
          `Eastfarthing: a resource token is placed on it (${u.resources}, +${2 * u.resources} [threat]).`,
          "danger",
        );
      }
      return true;
    case "nshMordorDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const lost = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `In the Name of Mordor!: ${name(lost)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, lost.id, { encounterEffect: true });
      });
      return true;
    case "nshThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      log(
        s,
        `${card(e.code ?? N.followed).name}${seatLabel(s, p)}: threat raised by ${e.value}.`,
        "danger",
      );
      return true;
    case "nshSniffRing": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) {
        prepend(s, hide(3, N.sniffing, p));
        return true;
      }
      ring.exhausted = true;
      log(
        s,
        "Sniffing and Hissing: The One Ring is exhausted, and an encounter card is revealed.",
        "danger",
      );
      oneRingExhaustedForced(s);
      prepend(s, fx("reveal", { player: p }));
      return true;
    }
    case "nshEngageNext":
      if (
        u &&
        (s.staging.some((x) => x.id === u.id) ||
          allEngaged(s).some((x) => x.id === u.id))
      ) {
        forOwner(s, p, () => engage(s, u));
        if (!seatView(s, p).engaged.some((x) => x.id === u.id)) return true;
        log(
          s,
          `Green-Hill Country: ${name(u)} engages ${who(s, p)} and makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_SHADOW_PAST_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageRevealed: shStageRevealed,
  engagementBonus: shEngagementBonus,
  refreshStart: shRefreshStart,
  hideWillpower: shHideWillpower,
  hideValueBonus: shHideValueBonus,
  hideCommitLimit: shHideCommitLimit,
  hideFailed: shHideFailed,
  threatBonus: shThreatBonus,
  travelEffects: shTravelEffects,
  characterDestroyed: shCharacterDestroyed,
  attackFinished: shAttackFinished,
  encounter: shEncounter,
  shadow: shShadow,
  effect: nightmareShadowPastEffect,
  sharedEffect: (e) => ["nshKhamulSearch", "nshEastfarthing"].includes(e.kind),
};
