/**
 * Return to Mirkwood's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules and Nightmare encounter cards, composed with the scenario's own rules
 * (Gollum's guard, the Tantrum cards) through batch4Scenario while a
 * Nightmare mode game is played. Effects use the "nrm" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardAttachment,
  engage,
  enemyAddedToStaging,
  revealed,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
} from "./table";
import { NIGHTMARE_SOM as G, nightmareLive } from "./nightmare";
import { RETURN, returnMirkwoodGuard } from "./return-mirkwood";
import { currentQuestUnit, attachToQuest, mainQuestCode } from "./quest-state";
import { isPlayerCardSource } from "./player-effect-immunity";
import { surgeEffects } from "./surge";
import {
  NEUTRAL_LAYER,
  live,
  seatLabel,
  several,
  traitOf,
} from "./nightmare-core";

const rtmLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "return-to-mirkwood";
const tantrum = (code: string) => traitOf(code, "Tantrum");
const topTantrum = (s: GameState) =>
  [...s.encounterDiscard].reverse().find(tantrum);
const inPlay = (s: GameState) => [...s.staging, ...allEngaged(s)];
const guardOf = (s: GameState) => returnMirkwoodGuard(s) ?? firstPlayer(s);
/** Isolation, on the current quest. */
const isolated = (s: GameState) =>
  rtmLive(s) &&
  !!currentQuestUnit(s)?.attachments.some(
    (a) => a.code === G.isolation && !a.blanked,
  );
/** Ambushing Orcs: "When dealt a shadow card that targets the player guarding Gollum, that shadow card also targets each other player." */
const ambushed = (s: GameState) => {
  const enemy = s.combat ? get(s, s.combat.enemyId) : undefined;
  return rtmLive(s) && !!enemy && live(s, enemy, G.ambushing);
};
/** The players a shadow card targeting the player guarding Gollum targets. */
const shadowTargets = (s: GameState) =>
  ambushed(s) ? playerOrder(s) : [guardOf(s)];
/** The players a treachery card's effect on the player guarding Gollum targets (Dry Watercourse, Ambushing Orcs). */
const treacheryTargets = (s: GameState) =>
  ambushed(s) ||
  allActiveLocations(s).some((u) => u.code === RETURN.watercourse)
    ? playerOrder(s)
    : [guardOf(s)];

// ------------------------------------------------------------- the setup card

/**
 * "Forced: At the beginning of the quest phase, the player who is guarding
 * Gollum must either exhaust a hero he controls or resolve the "when
 * revealed" effect of the topmost Tantrum card in the encounter discard
 * pile."
 */
function rtmQuestBegin(s: GameState): Effect[] {
  if (!rtmLive(s) || returnMirkwoodGuard(s) === undefined) return [];
  return [fx("nrmQuestBegin", { player: guardOf(s) })];
}
/**
 * "Forced: When Stage 4A is revealed, search the encounter deck and discard
 * pile for 1 copy of Attercop, Attercop and add it to the staging area, if
 * able. Shuffle the encounter deck."
 */
function rtmStageRevealed(s: GameState, stage: number) {
  if (!rtmLive(s) || stage !== 4) return;
  let at = s.encounterDeck.indexOf(RETURN.attercop);
  let found = false;
  if (at >= 0) {
    s.encounterDeck.splice(at, 1);
    found = true;
  } else {
    at = s.encounterDiscard.lastIndexOf(RETURN.attercop);
    if (at >= 0) {
      s.encounterDiscard.splice(at, 1);
      found = true;
    }
  }
  if (found) {
    const u = make(s, RETURN.attercop);
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
  shuffle(s, s.encounterDeck);
  log(
    s,
    found
      ? "Return to Mirkwood · Nightmare: Attercop, Attercop is added to the staging area as stage 4A is revealed."
      : "Return to Mirkwood · Nightmare: no Attercop, Attercop is left to add to the staging area.",
    found ? "danger" : "normal",
  );
}

// ------------------------------------------------------------- passives

/** Isolation (Condition): "All characters lose the ranged and sentinel keywords." */
const rtmLosesKeyword = (s: GameState, _u: Unit, keyword: string) =>
  isolated(s) && ["ranged", "sentinel"].includes(keyword.toLowerCase());
/** Pursuing Warg-rider: "Cannot be optionally engaged." */
const rtmCannotOptionallyEngage = (s: GameState, u: Unit) =>
  rtmLive(s) && live(s, u, G.wargRider);
/** Deceptive Path: "Progress cannot be placed on Deceptive Path while it is in the staging area." */
const rtmProgressBlocked = (s: GameState, u: Unit) =>
  rtmLive(s) && live(s, u, G.deceptive) && s.staging.some((x) => x.id === u.id);
/**
 * Pursuing Warg-rider: "Forced: After the player guarding Gollum changes,
 * Pursuing Warg-rider engages the player guarding Gollum and makes an
 * immediate attack against that player."
 */
function rtmGuardChanged(s: GameState, _from: number, to: number) {
  if (!rtmLive(s)) return;
  const riders = inPlay(s).filter((u) => live(s, u, G.wargRider));
  for (const u of riders) {
    forOwner(s, to, () => engage(s, u));
    log(
      s,
      `Pursuing Warg-rider engages ${seatName(s, to)}, the new guard of Gollum, and makes an immediate attack.`,
      "danger",
    );
  }
  prepend(
    s,
    ...riders.map((u) => fx("immediateAttack", { target: u.id, player: to })),
  );
}
/** Web-spinner's and Web-wall's "When Revealed" effects. */
function rtmCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancelled: boolean,
) {
  if (!rtmLive(s) || !fromReveal || cancelled) return;
  // Web-spinner: "The player guarding Gollum must either exhaust a hero he
  // controls, or Web-spinner gains surge."
  if (live(s, u, G.webSpinner))
    prepend(s, fx("nrmSpinner", { player: guardOf(s), target: u.id }));
  // Web-wall: "Reveal the topmost Spider enemy in the encounter discard pile
  // and add it to the staging area."
  else if (live(s, u, G.webWall))
    prepend(s, fx("nrmWebWall", { player: firstPlayer(s) }));
}
/**
 * Deceptive Path: "Forced: After Deceptive Path becomes the active location,
 * shuffle the encounter discard pile into the encounter deck and discard cards
 * from the top of the encounter deck until a location is discarded. Reveal
 * that location and make it the active location. Then, discard Deceptive
 * Path."
 */
function rtmTravelEntered(s: GameState, u: Unit) {
  if (rtmLive(s) && live(s, u, G.deceptive))
    prepend(s, fx("nrmDeceptive", { target: u.id, player: firstPlayer(s) }));
}

// ------------------------------------------------------------- treacheries

const TREACHERIES: string[] = [G.isolation, G.befouled, G.wickedness];
function rtmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!rtmLive(s) || !TREACHERIES.includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Isolation: "Attach Isolation to the current quest."
  if (code === G.isolation) {
    const quest = currentQuestUnit(s);
    const done =
      !!quest &&
      attachToQuest(s, quest.code ?? mainQuestCode(s), {
        id: `a${s.nextId++}`,
        code,
        exhausted: false,
      });
    if (done)
      log(
        s,
        "Isolation is attached to the current quest: characters lose the ranged and sentinel keywords, and Gollum's guard cannot choose a new guard.",
        "danger",
      );
    else s.encounterDiscard.push(code);
  }
  // Befouled Equipment: "Discard all attachments controlled by the player
  // guarding Gollum. Then, remove all cards in that player's discard pile
  // from the game. If no attachments are discarded as a result of this
  // effect, Befouled Equipment gains surge."
  // (Each card is discarded once its effect has resolved.)
  else if (code === G.befouled)
    prepend(
      s,
      fx("nrmBefouled", {
        player: firstPlayer(s),
        ids: treacheryTargets(s).map(String),
        flag: true,
      }),
      fx("returnDiscardTreachery", { code }),
    );
  // Wickedness and Mischief: "The player guarding Gollum must either reveal
  // the topmost Tantrum card in the encounter discard pile, or reveal 2
  // additional encounter cards from the encounter deck."
  else
    prepend(
      s,
      ...treacheryTargets(s).map((player) => fx("nrmWickedness", { player })),
      fx("returnDiscardTreachery", { code }),
    );
  return true;
}

// ------------------------------------------------------------- shadows

function rtmShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !rtmLive(s)) return false;
  // Web-spinner: "The player guarding Gollum must exhaust a character he
  // controls."
  if (code === G.webSpinner)
    prepend(
      s,
      ...shadowTargets(s).map((player) => fx("nrmSpinnerShadow", { player })),
    );
  // Web-wall: "The player guarding Gollum must discard all resources from
  // each of his heroes' resource pools."
  else if (code === G.webWall)
    for (const player of shadowTargets(s)) {
      const heroes = seatView(s, player).heroes;
      const lost = heroes.reduce((n, h) => n + h.resources, 0);
      for (const h of heroes) h.resources = 0;
      log(
        s,
        `Web-wall: ${several(s) ? `${seatName(s, player)} discards` : "you discard"} ${lost} ${lost === 1 ? "resource" : "resources"} from the heroes' pools.`,
        lost ? "danger" : "normal",
      );
    }
  // Befouled Equipment: "Discard all attachments controlled by the player
  // guarding Gollum."
  else if (code === G.befouled)
    prepend(
      s,
      fx("nrmBefouled", {
        player: firstPlayer(s),
        ids: treacheryTargets(s).map(String),
      }),
    );
  // Wickedness and Mischief: "Deal the topmost Tantrum card in the encounter
  // discard pile as a new shadow card for this attack, if able."
  else if (code === G.wickedness) {
    const enemy = get(s, c.enemyId);
    const top = topTantrum(s);
    if (!enemy || !top) {
      log(
        s,
        "Wickedness and Mischief · No Tantrum card is in the discard pile.",
      );
      return true;
    }
    s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(top), 1);
    enemy.faceupShadows ??= enemy.shadows.map(() => false);
    enemy.faceupShadows.splice(enemy.revealedShadowCount ?? 0, 0, false);
    enemy.shadows.splice(enemy.revealedShadowCount ?? 0, 0, top);
    log(
      s,
      `Wickedness and Mischief: ${card(top).name} is dealt to ${name(enemy)} as a new shadow card.`,
      "danger",
    );
    prepend(s, fx("shadowReveal", { code: top }));
  } else return false;
  return true;
}

// ------------------------------------------------------------- effects

const readyHeroes = (s: GameState, p: number) =>
  seatView(s, p).heroes.filter((h) => !h.exhausted);
/** The player-card attachments a player controls, wherever they are attached. */
function controlledAttachments(s: GameState, player: number) {
  const characters = allCharacters(s);
  const out: [Unit, Attachment][] = [];
  for (const u of [
    ...characters,
    ...s.staging,
    ...allEngaged(s),
    ...allActiveLocations(s),
  ]) {
    const host = characters.some((c) => c.id === u.id)
      ? ownerOf(s, u)
      : firstPlayer(s);
    for (const a of u.attachments)
      if (
        isPlayerCardSource(a.code) &&
        (a.controller ?? a.owner ?? host) === player
      )
        out.push([u, a]);
  }
  return out;
}
export function nightmareRtmEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrm")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nrmQuestBegin": {
      const top = topTantrum(s);
      const heroes = readyHeroes(s, p);
      if (!top && !heroes.length) {
        log(
          s,
          "Return to Mirkwood · Nightmare: Gollum's guard has no ready hero and no Tantrum card is in the discard pile.",
        );
        return true;
      }
      choose(
        s,
        `Return to Mirkwood · Exhaust a hero, or resolve the topmost Tantrum${seatLabel(s, p)}`,
        [
          ...heroes.map((h): Option => ({
            id: h.id,
            code: h.code,
            label: `Exhaust ${name(h)}`,
            effects: [fx("exhaust", { target: h.id })],
          })),
          ...(top
            ? [
                {
                  id: "tantrum",
                  code: top,
                  label: `Resolve ${card(top).name}'s "when revealed" effect`,
                  effects: [
                    fx("resolvePrintedWhenRevealed", { code: top, player: p }),
                  ],
                } as Option,
              ]
            : []),
        ],
        card(G.rtmCard).back_text,
      );
      return true;
    }
    case "nrmSpinner": {
      const heroes = readyHeroes(s, p);
      choose(
        s,
        `Web-spinner · Exhaust a hero, or Web-spinner gains surge${seatLabel(s, p)}`,
        [
          ...heroes.map((h): Option => ({
            id: h.id,
            code: h.code,
            label: `Exhaust ${name(h)}`,
            effects: [fx("exhaust", { target: h.id })],
          })),
          {
            id: "surge",
            label: "Web-spinner gains surge",
            effects: surgeEffects(G.webSpinner),
          },
        ],
        card(G.webSpinner).text,
      );
      return true;
    }
    case "nrmSpinnerShadow": {
      const ready = allCharacters(s).filter(
        (u) => ownerOf(s, u) === p && !u.exhausted,
      );
      if (!ready.length) return true;
      choose(
        s,
        `Web-spinner · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("exhaust", { target: u.id })],
        })),
        card(G.webSpinner).shadow,
      );
      return true;
    }
    case "nrmWebWall": {
      const top = [...s.encounterDiscard]
        .reverse()
        .find((c) => card(c).type_code === "enemy" && traitOf(c, "Spider"));
      if (!top) {
        log(s, "Web-wall · No Spider enemy is in the encounter discard pile.");
        return true;
      }
      s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(top), 1);
      log(
        s,
        `Web-wall reveals ${card(top).name} from the discard pile.`,
        "danger",
      );
      revealed(s, top);
      return true;
    }
    case "nrmDeceptive": {
      const path = get(s, e.target);
      if (!path || !allActiveLocations(s).some((u) => u.id === path.id))
        return true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      let found: string | undefined;
      while (s.encounterDeck.length) {
        const c = s.encounterDeck.shift()!;
        if (card(c).type_code === "location") {
          found = c;
          break;
        }
        s.encounterDiscard.push(c);
      }
      removeActiveLocation(s, path.id);
      for (const a of [...path.attachments]) discardAttachment(s, path, a);
      s.encounterDiscard.push(path.code);
      if (!found) {
        log(
          s,
          "Deceptive Path: no location is left in the encounter deck; Deceptive Path is discarded.",
          "danger",
        );
        return true;
      }
      const next = make(s, found);
      if (!s.activeLocation) s.activeLocation = next;
      else (s.extraActiveLocations ??= []).push(next);
      log(
        s,
        `Deceptive Path: ${card(found).name} is revealed and becomes the active location; Deceptive Path is discarded.`,
        "danger",
      );
      if (found === G.webWall)
        prepend(s, fx("nrmWebWall", { player: firstPlayer(s) }));
      return true;
    }
    case "nrmBefouled": {
      let discarded = 0;
      for (const player of (e.ids ?? []).map(Number)) {
        for (const [u, a] of controlledAttachments(s, player)) {
          discardAttachment(s, u, a);
          discarded++;
        }
        if (e.flag) {
          const seat = seatView(s, player);
          const removed = seat.discard.splice(0);
          seat.removed.push(...removed);
          if (removed.length)
            log(
              s,
              `Befouled Equipment: ${removed.length} ${removed.length === 1 ? "card leaves" : "cards leave"} ${several(s) ? `${seatName(s, player)}'s` : "your"} discard pile for good.`,
              "danger",
            );
        }
      }
      log(
        s,
        `Befouled Equipment: ${discarded} ${discarded === 1 ? "attachment is" : "attachments are"} discarded.`,
        discarded ? "danger" : "normal",
      );
      if (e.flag && !discarded) {
        log(
          s,
          "Befouled Equipment discards no attachment, and gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(G.befouled));
      }
      return true;
    }
    case "nrmWickedness": {
      const top = topTantrum(s);
      const options: Option[] = [
        ...(top
          ? [
              {
                id: "tantrum",
                code: top,
                label: `Reveal ${card(top).name} from the discard pile`,
                effects: [fx("nrmRevealTantrum", { player: p, code: top })],
              },
            ]
          : []),
        {
          id: "reveal",
          label: "Reveal 2 encounter cards",
          effects: [fx("reveal", { player: p }), fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Wickedness and Mischief · Reveal the topmost Tantrum, or 2 encounter cards${seatLabel(s, p)}`,
        options,
        card(G.wickedness).text,
      );
      return true;
    }
    case "nrmRevealTantrum": {
      const at = e.code ? s.encounterDiscard.lastIndexOf(e.code) : -1;
      if (at < 0) return true;
      s.encounterDiscard.splice(at, 1);
      revealed(s, e.code!);
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

/** Nightmare effects resolved in a player's own seat. */
const PLAYER_EFFECTS = new Set([
  "nrmQuestBegin",
  "nrmSpinner",
  "nrmSpinnerShadow",
  "nrmWickedness",
  "nrmRevealTantrum",
]);
export const NIGHTMARE_RTM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  questBegin: rtmQuestBegin,
  stageRevealed: rtmStageRevealed,
  losesKeyword: rtmLosesKeyword,
  guardLocked: isolated,
  guardTargetsEveryone: ambushed,
  guardChanged: rtmGuardChanged,
  cannotOptionallyEngage: rtmCannotOptionallyEngage,
  locationProgressBlocked: rtmProgressBlocked,
  cardEntered: rtmCardEntered,
  travelEntered: rtmTravelEntered,
  encounter: rtmEncounter,
  shadow: rtmShadow,
  effect: nightmareRtmEffect,
  sharedEffect: (e) => e.kind.startsWith("nrm") && !PLAYER_EFFECTS.has(e.kind),
};
