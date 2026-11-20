/**
 * A Knife in the Dark's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (while Bill Ferny is in the staging area, he is immune to player card
 * effects) and its Nightmare encounter cards, composed with the scenario's own
 * rules (src/game/knife-dark.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario's out of play Ringwraiths and The One Ring
 * serve the Nightmare cards; its Weathertop is set aside in place of the
 * scenario's. Effects use the "nkd" prefix.
 */
import type { Attachment, Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import { engage, raiseThreat } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { nextPlayer, who } from "./black-riders-hunted";
import {
  isOneRing,
  oneRing,
  oneRingExhausted,
  oneRingExhaustedForced,
} from "./lotr-saga";
import { KD, kdTrait } from "./knife-dark-support";
import { NIGHTMARE_TBR as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

const kdLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "a-knife-in-the-dark";
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const inPlay = (s: GameState, code: string) =>
  locationsInPlay(s).filter((u) => live(s, u, code));
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const wraithsAside = (s: GameState) =>
  s.knifeDark?.setAside.filter((c) => c === KD.ringwraith).length ?? 0;
const weathertopActive = (s: GameState) =>
  allActiveLocations(s).some((l) => live(s, l, N.weathertop));
const CHARACTER = ["hero", "ally", "objective-ally"];

// ------------------------------------------------------------- the setup card

/** "While Bill Ferny is in the staging area, he gains: 'Immune to player card effects.'" Weathertop: "Immune to player card effects." */
const kdImmune = (s: GameState, u: Unit) =>
  kdLive(s) &&
  ((live(s, u, KD.ferny) && s.staging.some((x) => x.id === u.id)) ||
    live(s, u, N.weathertop));

// ------------------------------------------------------------- the cards

/** Menacing Wraith: "Forced: After The One Ring is exhausted, Menacing Wraith engages the first player and makes an immediate attack." */
function kdOneRingExhausted(s: GameState) {
  if (!kdLive(s)) return;
  const wraiths = enemiesInPlay(s).filter((u) => live(s, u, N.wraith));
  prepend(
    s,
    ...wraiths.map((u) =>
      fx("nkdWraith", { target: u.id, player: firstPlayer(s) }),
    ),
  );
}
/**
 * Weathertop: "The Witch-king cannot be damaged." Weather Hills: "+2 [threat]
 * while The One Ring is exhausted." Forsaken Inn: "X is the number of
 * characters the first player controls." (Its printed [threat] is X.)
 */
function kdThreatBonus(s: GameState, u: Unit) {
  if (!kdLive(s)) return 0;
  if (live(s, u, N.hills)) return oneRingExhausted(s) ? 2 : 0;
  if (live(s, u, N.inn)) {
    const v = seatView(s, firstPlayer(s));
    return v.heroes.length + v.allies.length;
  }
  return 0;
}
function kdDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (
    !kdLive(s) ||
    amount <= 0 ||
    !live(s, u, KD.witchKing) ||
    !inPlay(s, N.weathertop).length
  )
    return amount;
  log(s, "Weathertop: The Witch-king cannot be damaged.");
  return 0;
}
/** Weather Hills: "While the players are at stage 1, progress cannot be placed here." */
const kdProgressBlocked = (s: GameState, u: Unit) =>
  kdLive(s) && live(s, u, N.hills) && s.stage === 1;
/** The Old Road: "enters play with 3 resource tokens on it." */
function kdCardEntered(s: GameState, u: Unit) {
  if (kdLive(s) && live(s, u, N.oldRoad)) u.resources = 3;
}
/** The Old Road: "Forced: At the end of the round, discard 1 resource token here. Then, if there are no resource tokens here, shuffle 1 out of play Ringwraith into the encounter deck." */
const kdRoundEnd = (s: GameState): Effect[] =>
  kdLive(s)
    ? inPlay(s, N.oldRoad).map((u) =>
        fx("nkdOldRoad", { target: u.id, player: firstPlayer(s) }),
      )
    : [];
/** Forsaken Inn: "Travel: The first player searches the encounter deck and discard pile for a Spy enemy, reveals it, and adds it to the staging area." */
const kdTravelEffects = (s: GameState, u: Unit) =>
  kdLive(s) && live(s, u, N.inn)
    ? [fx("nkdInn", { player: firstPlayer(s) })]
    : undefined;
/** Weathertop: "Forced: After Weathertop becomes the active location, exhaust The One Ring." */
function kdTravelEntered(s: GameState, u: Unit) {
  if (kdLive(s) && live(s, u, N.weathertop))
    prepend(s, fx("nkdWeathertop", { player: firstPlayer(s) }));
}
/** Weathertop: "The One Ring cannot ready while Weathertop is the active location." */
const kdAttachmentCannotReady = (s: GameState, _host: Unit, a: Attachment) =>
  kdLive(s) && isOneRing(a.code) && weathertopActive(s);
/** The Ring's Will: "This effect cannot be canceled ... if The One Ring is exhausted." (The Ring-bearer's effect never cancels it.) */
const kdCannotCancel = (s: GameState, shadow?: boolean, code?: string) =>
  kdLive(s) && !shadow && code === N.ringsWill && oneRingExhausted(s);
/** Blade Tip's shadow: "If the defending character is damaged by this attack, attach Blade Tip to that character." */
function kdDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  ctx: DamageContext,
) {
  const c = s.combat;
  if (
    !kdLive(s) ||
    !c?.nmBladeTip ||
    amount <= 0 ||
    !ctx.combatDamage ||
    ctx.enemyId !== c.enemyId ||
    !CHARACTER.includes(card(u.code).type_code) ||
    !(c.defenderId === u.id || (c.defenderIds ?? []).includes(u.id))
  )
    return;
  c.nmBladeTip--;
  prepend(
    s,
    fx("nkdBladeTip", {
      target: u.id,
      source: c.enemyId,
      player: ownerOf(s, u),
    }),
  );
}
/** Blade Tip, attached: "Forced: At the end of the refresh phase, raise your threat by 2." */
const kdRefreshEndForced = (s: GameState): Effect[] =>
  kdLive(s)
    ? globalCharacters(s).flatMap((h) =>
        h.attachments
          .filter((a) => a.code === N.bladeTip && !a.blanked)
          .map(() =>
            fx("nkdThreat", {
              value: 2,
              code: N.bladeTip,
              player: ownerOf(s, h),
            }),
          ),
      )
    : [];
/** The Ring's Will's shadow: "After this attack, attacking enemy engages the next player then makes an immediate attack." */
function kdAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!kdLive(s) || skipped || !c.nmEngageNext) return [];
  const enemy = get(s, c.enemyId);
  // With one player there is no next player (as Pathless Country's shadow).
  const next = nextPlayer(s, c.attackPlayer ?? firstPlayer(s));
  if (!enemy || next === undefined) return [];
  return Array.from({ length: c.nmEngageNext }, () =>
    fx("nkdEngageNext", { target: enemy.id, player: next }),
  );
}

function kdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !kdLive(s) ||
    !([N.spy, N.ringsWill, N.bladeTip] as readonly string[]).includes(code)
  )
    return false;
  const p = activeSeat(s);
  if (code === N.spy) {
    // Southern Spy (already in the staging area): "Either shuffle an out of
    // play Ringwraith into the encounter deck, or Southern Spy makes an
    // immediate attack against you."
    if (fromReveal) {
      const spy = [...s.staging].reverse().find((u) => u.code === code);
      prepend(s, fx("nkdSpy", { target: spy?.id, player: p }));
    }
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  // Blade Tip: its surge and doomed 1 are printed.
  if (!fromReveal || code === N.bladeTip) return true;
  // The Ring's Will: "Raise each player's threat by 5."
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("nkdThreat", { value: 5, code, player }),
    ),
  );
  return true;
}

function kdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !kdLive(s)) return false;
  switch (code) {
    // Southern Spy: "Defending character gets -1 [defense] (-3 [defense]
    // instead if The One Ring is exhausted)."
    case N.spy:
      c.defensePenalty =
        (c.defensePenalty ?? 0) + (oneRingExhausted(s) ? 3 : 1);
      return true;
    // Weather Hills: "Attacking enemy gets +2 [attack]."
    case N.hills:
      c.attackBonus += 2;
      return true;
    // The Ring's Will: "After this attack, attacking enemy engages the next
    // player then makes an immediate attack."
    case N.ringsWill:
      c.nmEngageNext = (c.nmEngageNext ?? 0) + 1;
      return true;
    // Blade Tip: "If the defending character is damaged by this attack,
    // attach Blade Tip to that character."
    case N.bladeTip:
      c.nmBladeTip = (c.nmBladeTip ?? 0) + 1;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareKnifeDarkEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nkd")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nkdWraith":
      if (u && enemiesInPlay(s).some((x) => x.id === u.id)) {
        if (!seatView(s, p).engaged.some((x) => x.id === u.id))
          forOwner(s, p, () => engage(s, u));
        if (!seatView(s, p).engaged.some((x) => x.id === u.id)) return true;
        log(
          s,
          `Menacing Wraith: The One Ring is exhausted; it engages ${who(s, p)} and makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
    case "nkdSpy": {
      const spy = u && s.staging.some((x) => x.id === u.id) ? u : undefined;
      const shuffleWraith = fx("kdShuffleWraith", { code: N.spy, player: p });
      const attack = spy
        ? fx("immediateAttack", { target: spy.id, player: p })
        : undefined;
      if (!wraithsAside(s)) {
        if (attack) prepend(s, attack);
        return true;
      }
      if (!attack) {
        prepend(s, shuffleWraith);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Southern Spy${seatLabel(s, p)} · Shuffle an out of play Ringwraith, or it attacks you`,
          [
            {
              id: "ringwraith",
              code: KD.ringwraith,
              label:
                "Shuffle an out of play Ringwraith into the encounter deck",
              effects: [shuffleWraith],
            },
            {
              id: "attack",
              code: N.spy,
              label: "Southern Spy makes an immediate attack against you",
              effects: [attack],
            },
          ],
          card(N.spy).text,
        ),
      );
      return true;
    }
    case "nkdOldRoad":
      if (u && inPlay(s, N.oldRoad).some((x) => x.id === u.id)) {
        if (u.resources > 0) u.resources--;
        log(
          s,
          `The Old Road: a resource token is discarded (${u.resources} left).`,
          "danger",
        );
        if (!u.resources && wraithsAside(s))
          prepend(s, fx("kdShuffleWraith", { code: N.oldRoad, player: p }));
      }
      return true;
    case "nkdInn": {
      const spy = (c: string) =>
        card(c).type_code === "enemy" && kdTrait(c, "Spy");
      let code: string | undefined;
      const i = s.encounterDeck.findIndex(spy);
      if (i >= 0) code = s.encounterDeck.splice(i, 1)[0];
      else
        for (let j = s.encounterDiscard.length - 1; j >= 0 && !code; j--)
          if (spy(s.encounterDiscard[j]))
            code = s.encounterDiscard.splice(j, 1)[0];
      shuffle(s, s.encounterDeck);
      log(
        s,
        code
          ? `Forsaken Inn: ${card(code).name} is revealed from the encounter ${i >= 0 ? "deck" : "discard pile"}; the encounter deck is shuffled.`
          : "Forsaken Inn: no Spy enemy is in the encounter deck or discard pile; the encounter deck is shuffled.",
        "danger",
      );
      if (code)
        prepend(
          s,
          fx("revealCard", { code, revealOrigin: "encounter", player: p }),
        );
      return true;
    }
    case "nkdWeathertop": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) return true;
      ring.exhausted = true;
      log(s, "Weathertop: The One Ring is exhausted.", "danger");
      oneRingExhaustedForced(s);
      return true;
    }
    case "nkdThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      log(
        s,
        `${card(e.code ?? N.ringsWill).name}${seatLabel(s, p)}: threat raised by ${e.value}.`,
        "danger",
      );
      return true;
    case "nkdBladeTip": {
      const enemy = get(s, e.source);
      const at = enemy?.shadows.indexOf(N.bladeTip) ?? -1;
      if (!u || !globalCharacters(s).some((x) => x.id === u.id) || at < 0)
        return true;
      removeShadowCard(enemy!, at);
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: N.bladeTip,
        exhausted: false,
      });
      log(s, `Blade Tip is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "nkdEngageNext":
      if (u && enemiesInPlay(s).some((x) => x.id === u.id)) {
        forOwner(s, p, () => engage(s, u));
        if (!seatView(s, p).engaged.some((x) => x.id === u.id)) return true;
        log(
          s,
          `The Ring's Will: ${name(u)} engages ${who(s, p)} and makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_KNIFE_DARK_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  immune: kdImmune,
  oneRingExhausted: kdOneRingExhausted,
  threatBonus: kdThreatBonus,
  damageAmount: kdDamageAmount,
  locationProgressBlocked: kdProgressBlocked,
  cardEntered: kdCardEntered,
  roundEnd: kdRoundEnd,
  travelEffects: kdTravelEffects,
  travelEntered: kdTravelEntered,
  attachmentCannotReady: kdAttachmentCannotReady,
  cannotCancel: kdCannotCancel,
  damageDealt: kdDamageDealt,
  refreshEndForced: kdRefreshEndForced,
  attackFinished: kdAttackFinished,
  encounter: kdEncounter,
  shadow: kdShadow,
  effect: nightmareKnifeDarkEffect,
  sharedEffect: (e) =>
    ["nkdOldRoad", "nkdWeathertop", "nkdInn"].includes(e.kind),
};
