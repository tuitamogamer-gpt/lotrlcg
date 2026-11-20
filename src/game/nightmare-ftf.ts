/**
 * Flight to the Ford's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (the players cannot win while Ford of Bruinen is in play) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/flight-ford.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's Ring-bearer's life, burden deck and The One Ring
 * serve the Nightmare cards; its Fell Riders are staged and its Ford of
 * Bruinen set aside in place of the scenario's. Effects use the "nff" prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import { engage } from "./board";
import {
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { removeCurrentQuestProgress } from "./side-quests";
import { isNazgulCard, nextPlayer, who } from "./black-riders-hunted";
import {
  oneRing,
  oneRingExhausted,
  oneRingExhaustedForced,
  ringBearer,
} from "./lotr-saga";
import { NIGHTMARE_TBR as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

const ftLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "flight-to-the-ford";
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const inPlay = (s: GameState, code: string) =>
  locationsInPlay(s).filter((u) => live(s, u, code));
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
/** "Reduce the Ring-bearer's life by X" (the scenario's life track). */
const life = (value: number, code: string) => fx("ffLife", { value, code });
const hasWhenRevealed = (code: string) =>
  /\bWhen Revealed\b/.test(card(code).text ?? "");

// ------------------------------------------------------------- the setup card

/** "The players cannot win while Ford of Bruinen is in play." */
const ftCannotWin = (s: GameState) => ftLive(s) && inPlay(s, N.ford).length > 0;

// ------------------------------------------------------------- the cards

/** Ford of Bruinen: "Immune to player card effects." */
const ftImmune = (s: GameState, u: Unit) => ftLive(s) && live(s, u, N.ford);
/**
 * Great East Road: "X is 1 plus the number of Nazgûl enemies in play." (Its
 * printed [threat] is X.)
 */
const ftThreatBonus = (s: GameState, u: Unit) =>
  ftLive(s) && live(s, u, N.eastRoad)
    ? 1 + enemiesInPlay(s).filter((x) => isNazgulCard(x.code)).length
    : 0;
/** Great East Road: "While Great East Road is in the staging area, each Nazgûl enemy gets -5 engagement cost." */
const ftEngagementBonus = (s: GameState, u: Unit) =>
  ftLive(s) && isNazgulCard(u.code) ? -5 * staged(s, N.eastRoad).length : 0;
/** Pathless Wilderness: "enters play with 3 resource tokens on it." */
function ftCardEntered(s: GameState, u: Unit) {
  if (ftLive(s) && live(s, u, N.wilderness)) u.resources = 3;
}
/** Pathless Wilderness: "Forced: At the end of the round, discard 1 resource token here. Then, if there are no resource tokens here, reduce the Ring-bearer's life by 3." */
const ftRoundEnd = (s: GameState): Effect[] =>
  ftLive(s)
    ? inPlay(s, N.wilderness).map((u) =>
        fx("nffWilderness", { target: u.id, player: firstPlayer(s) }),
      )
    : [];
/** Ettendales: "Forced: When Ettendales is explored, shuffle the top card of the burden deck into the encounter deck." */
function ftExplored(s: GameState, u: Unit) {
  if (ftLive(s) && live(s, u, N.ettendales))
    prepend(s, fx("nffEttendales", { player: firstPlayer(s) }));
}
/**
 * Ford of Bruinen: "Travel: Each player searches the encounter deck and
 * discard pile for a Nazgûl enemy and puts it into play engaged with him."
 * Trollshaw Forest: "Travel: Reduce the Ring-bearer's life by 1 to travel
 * here."
 */
function ftTravelEffects(s: GameState, u: Unit) {
  if (!ftLive(s)) return undefined;
  if (live(s, u, N.ford)) return [fx("nffFord", { player: firstPlayer(s) })];
  if (live(s, u, N.trollshaw)) return [life(1, N.trollshaw)];
  return undefined;
}
/** Trollshaw Forest, in the staging area: "Forced: After a 'when revealed' effect is canceled, reduce the Ring-bearer's life by 1." */
function ftWhenRevealedCancelled(s: GameState) {
  if (!ftLive(s)) return;
  prepend(s, ...staged(s, N.trollshaw).map(() => life(1, N.trollshaw)));
}
/** Trollshaw Forest: Frodo Baggins' cancel cancels a card's "when revealed" effect too. */
function ftRingBearerCancelled(s: GameState, code: string) {
  if (hasWhenRevealed(code)) ftWhenRevealedCancelled(s);
}
/** The Twilight World, attached: "Forced: At the beginning of the planning phase, either exhaust The One Ring, or reduce the Ring-bearer's life by 1." */
function ftPlanningBegin(s: GameState) {
  if (!ftLive(s)) return;
  const hosts = globalCharacters(s).flatMap((h) =>
    h.attachments
      .filter((a) => a.code === N.twilight && !a.blanked)
      .map(() => h),
  );
  prepend(s, ...hosts.map((h) => fx("nffTwilight", { player: ownerOf(s, h) })));
}
/**
 * Fell Rider: "Forced: After Fell Rider attacks and destroys a character,
 * reduce the Ring-bearer's life by 1." Ettendales' shadow: "If this attack
 * destroys a character, reduce the Ring-bearer's life by 1." Great East
 * Road's shadow: "After this attack, attacking enemy engages the next player
 * then makes an immediate attack."
 */
function ftAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!ftLive(s) || skipped) return [];
  const enemy = get(s, c.enemyId);
  const effects: Effect[] = [];
  if (c.ffDestroyed) {
    if (enemy && live(s, enemy, N.fellRider))
      effects.push(life(1, N.fellRider));
    if (c.nmLifeOnKill) effects.push(life(c.nmLifeOnKill, N.ettendales));
  }
  // With one player there is no next player (as Pathless Country's shadow).
  const next = nextPlayer(s, c.attackPlayer ?? firstPlayer(s));
  if (enemy && c.nmEngageNext && next !== undefined)
    effects.push(
      ...Array.from({ length: c.nmEngageNext }, () =>
        fx("nffEngageNext", { target: enemy.id, player: next }),
      ),
    );
  return effects;
}

function ftEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ftLive(s) || (code !== N.comeBack && code !== N.twilight)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.comeBack) {
    // Come Back!: "Reduce the Ring-bearer's life by 1 and remove all
    // progress from the current quest." Its doomed 1 is printed.
    s.encounterDiscard.push(code);
    prepend(
      s,
      life(1, N.comeBack),
      fx("nffComeBackProgress", { player: firstPlayer(s) }),
    );
    return true;
  }
  // The Twilight World: "Attach to the Ring-bearer. Limit 1 per hero." Its
  // doomed 2 is printed.
  const bearer = ringBearer(s);
  if (!bearer || bearer.attachments.some((a) => a.code === N.twilight)) {
    s.encounterDiscard.push(code);
    log(s, "The Twilight World: the Ring-bearer cannot take another copy.");
    return true;
  }
  bearer.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  log(s, `The Twilight World is attached to ${name(bearer)}.`, "danger");
  return true;
}

function ftShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ftLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  switch (code) {
    // Fell Rider: "Attacking enemy gets +1 [attack] (+2 [attack] instead if
    // The One Ring is exhausted)."
    case N.fellRider:
      c.attackBonus += oneRingExhausted(s) ? 2 : 1;
      return true;
    // Great East Road: "After this attack, attacking enemy engages the next
    // player then makes an immediate attack."
    case N.eastRoad:
      c.nmEngageNext = (c.nmEngageNext ?? 0) + 1;
      return true;
    // Ettendales: "Attacking enemy gets +2 [attack]. If this attack destroys
    // a character, reduce the Ring-bearer's life by 1."
    case N.ettendales:
      c.attackBonus += 2;
      c.nmLifeOnKill = (c.nmLifeOnKill ?? 0) + 1;
      return true;
    // Come Back!: "Either reduce the Ring-bearer's life by 1, or this attack
    // is considered undefended."
    case N.comeBack:
      prepend(s, fx("nffComeBackShadow", { player: p }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareFlightFordEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nff")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  const q = s.flightFord;
  switch (e.kind) {
    case "nffWilderness":
      if (u && inPlay(s, N.wilderness).some((x) => x.id === u.id)) {
        if (u.resources > 0) u.resources--;
        log(
          s,
          `Pathless Wilderness: a resource token is discarded (${u.resources} left).`,
          "danger",
        );
        if (!u.resources) prepend(s, life(3, N.wilderness));
      }
      return true;
    case "nffEttendales": {
      const burden = q?.burdens.shift();
      if (!burden) {
        log(s, "Ettendales: the burden deck is empty.");
        return true;
      }
      s.encounterDeck.push(burden);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Ettendales: ${card(burden).name} is shuffled from the burden deck into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "nffFord": {
      // Each player, in turn order, finds a Nazgûl enemy that engages them.
      const found: string[] = [];
      for (const player of playerOrder(s)) {
        let code: string | undefined;
        const i = s.encounterDeck.findIndex((c) => isNazgulCard(c));
        if (i >= 0) code = s.encounterDeck.splice(i, 1)[0];
        else
          for (let j = s.encounterDiscard.length - 1; j >= 0 && !code; j--)
            if (isNazgulCard(s.encounterDiscard[j]))
              code = s.encounterDiscard.splice(j, 1)[0];
        if (!code) continue;
        const rider = make(s, code);
        s.staging.push(rider);
        forOwner(s, player, () => engage(s, rider));
        found.push(`${card(code).name} → ${who(s, player)}`);
      }
      shuffle(s, s.encounterDeck);
      log(
        s,
        found.length
          ? `Ford of Bruinen: ${found.join(", ")}; the encounter deck is shuffled.`
          : "Ford of Bruinen: no Nazgûl enemy is in the encounter deck or discard pile; the encounter deck is shuffled.",
        "danger",
      );
      return true;
    }
    case "nffComeBackProgress": {
      const removed = removeCurrentQuestProgress(s, Number.MAX_SAFE_INTEGER);
      log(
        s,
        `Come Back!: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest.`,
        "danger",
      );
      return true;
    }
    case "nffComeBackShadow":
      choose(
        s,
        `Come Back!${seatLabel(s, p)} · Reduce the Ring-bearer's life by 1, or the attack is undefended`,
        [
          {
            id: "life",
            label: "Reduce the Ring-bearer's life by 1",
            effects: [life(1, N.comeBack)],
          },
          {
            id: "undefended",
            label: "This attack is considered undefended",
            effects: [fx("nffUndefended", { player: p })],
          },
        ],
        card(N.comeBack).shadow,
      );
      return true;
    case "nffUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, "Come Back!: this attack is considered undefended.", "danger");
      }
      return true;
    case "nffTwilight": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) {
        prepend(s, life(1, N.twilight));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Twilight World${seatLabel(s, p)} · Exhaust The One Ring, or reduce the Ring-bearer's life by 1`,
          [
            {
              id: "ring",
              code: ring.code,
              label: "Exhaust The One Ring",
              effects: [fx("nffTwilightRing", { player: p })],
            },
            {
              id: "life",
              label: "Reduce the Ring-bearer's life by 1",
              effects: [life(1, N.twilight)],
            },
          ],
          "Forced: at the beginning of the planning phase.",
        ),
      );
      return true;
    }
    case "nffTwilightRing": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) {
        prepend(s, life(1, N.twilight));
        return true;
      }
      ring.exhausted = true;
      log(s, "The Twilight World: The One Ring is exhausted.", "danger");
      oneRingExhaustedForced(s);
      return true;
    }
    case "nffEngageNext":
      if (u && enemiesInPlay(s).some((x) => x.id === u.id)) {
        forOwner(s, p, () => engage(s, u));
        if (!seatView(s, p).engaged.some((x) => x.id === u.id)) return true;
        log(
          s,
          `Great East Road: ${name(u)} engages ${who(s, p)} and makes an immediate attack.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_FLIGHT_FORD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotWin: ftCannotWin,
  immune: ftImmune,
  threatBonus: ftThreatBonus,
  engagementBonus: ftEngagementBonus,
  cardEntered: ftCardEntered,
  roundEnd: ftRoundEnd,
  explored: ftExplored,
  travelEffects: ftTravelEffects,
  whenRevealedCancelled: ftWhenRevealedCancelled,
  ringBearerCancelled: ftRingBearerCancelled,
  planningBegin: ftPlanningBegin,
  attackFinished: ftAttackFinished,
  encounter: ftEncounter,
  shadow: ftShadow,
  effect: nightmareFlightFordEffect,
  sharedEffect: (e) =>
    [
      "nffWilderness",
      "nffEttendales",
      "nffFord",
      "nffComeBackProgress",
    ].includes(e.kind),
};
