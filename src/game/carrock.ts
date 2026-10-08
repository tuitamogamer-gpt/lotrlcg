import { choosePlayerResponse } from "./player-ability-triggers";
import { mainQuestCode } from "./quest-state";
// Complete original Conflict at the Carrock rules; Nightmare is a separate quest.
import definitions from "../data/carrock-encounter-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  eachSeat,
  forOwner,
  livingSeats,
  ownerOf,
  removeActiveLocation,
  selectSeat,
} from "./table";
import {
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  removeShadowCard,
  shuffle,
  spendResources,
  skip,
  threatOf,
} from "./core";
import {
  questDefeated,
  destroy,
  discardAttachment,
  win,
  raiseThreat,
  placeEncounter,
} from "./board";
import { hasResourceIcon } from "./expansion-passives";

export const CARROCK_ENCOUNTERS = definitions as Card[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801202c${suffix}`;
export const CARROCK = {
  louis: code("9015"),
  morris: code("9016"),
  stuart: code("9026"),
  rupert: code("9022"),
  grimbeorn: code("9011"),
  muckAdder: code("9017"),
  carrock: code("9027"),
  langflood: code("9020"),
  beePastures: code("9005"),
  oakGrove: code("9019"),
  frightenedBeast: code("9002"),
  sacked: code("9023"),
  roastedSlowly: code("9021"),
} as const;
export const CARROCK_TROLLS: readonly string[] = [
  CARROCK.louis,
  CARROCK.morris,
  CARROCK.stuart,
  CARROCK.rupert,
];
export const isSacked = (u: Unit) =>
  u.attachments.some((a) => a.code === CARROCK.sacked && !a.blanked);
const hasSackAttached = (u: Unit) =>
  u.attachments.some((a) => a.code === CARROCK.sacked);
export const isTroll = (u: Unit) =>
  card(u.code).traits?.includes("Troll") ?? false;
const trollsInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isTroll);

export function carrockStatBonus(s: GameState, u: Unit) {
  if (!isTroll(u)) return { attack: 0, defense: 0 };
  const carrock = allActiveLocations(s).filter(
    (u) => u.code === CARROCK.carrock,
  ).length;
  return {
    attack:
      carrock + allEngaged(s).filter((x) => x.code === CARROCK.morris).length,
    defense:
      carrock + allEngaged(s).filter((x) => x.code === CARROCK.stuart).length,
  };
}
export const carrockThreatBonus = (s: GameState, u: Unit) =>
  u.code === CARROCK.langflood && s.staging.some((x) => x.id === u.id)
    ? trollsInPlay(s).length
    : 0;
export const carrockPaysLeadership = (s: GameState, hero: Unit) =>
  allActiveLocations(s).some((u) => u.code === CARROCK.oakGrove) ||
  hasResourceIcon(hero, "leadership");
export const carrockNoExhaustDefender = (enemy: Unit, defender: Unit) =>
  defender.code === CARROCK.grimbeorn && isTroll(enemy);

export function setupCarrock(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => !CARROCK_TROLLS.includes(c) && c !== CARROCK.carrock,
  );
  // Normal includes five Sacked! cards. Easy mode removes one before setup.
  let removed = 0;
  s.encounterDeck = s.encounterDeck.filter(
    (c) => c !== CARROCK.sacked || removed++ >= 4,
  );
  s.encounterDeck.push(
    ...Array<string>(livingSeats(s).length).fill(CARROCK.sacked),
  );
  placeEncounter(s, CARROCK.carrock, true);
  shuffle(s, s.encounterDeck);
  log(
    s,
    "The Carrock enters staging. Four unique Trolls and the unused Sacked! cards are set aside.",
    "chapter",
  );
}

/** The complete two-stage quest. Return true to bypass generic three-stage logic. */
export function advanceCarrock(s: GameState) {
  if (s.scenarioId !== "conflict-at-the-carrock") return false;
  if (s.status !== "playing" || s.stageRevealing || s.phase === "setup")
    return true;
  if (s.stage === 1 && s.progress >= 7) {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    const carrock = s.staging.find((u) => u.code === CARROCK.carrock);
    requireRule(
      carrock,
      "The Carrock must remain in staging until Grimbeorn’s Quest advances.",
    );
    const active = allActiveLocations(s);
    if (active.length > 1) {
      s.stageRevealing = true;
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "The Carrock · Discard an active location",
        opts(active, (u) => [
          fx("carrockStageTwo", { target: carrock.id, source: u.id }),
        ]),
        "The first player chooses the single active location discarded by the quest effect.",
      );
    } else carrockStageTwo(s, carrock, active[0]);
  } else if (s.stage === 2 && s.progress >= 1 && !trollsInPlay(s).length)
    win(s);
  return true;
}
function carrockStageTwo(s: GameState, carrock: Unit, previous?: Unit) {
  if (previous) {
    removeActiveLocation(s, previous.id);
    s.encounterDiscard.push(previous.code);
    for (const a of [...previous.attachments])
      discardAttachment(s, previous, a);
    log(s, `${name(previous)} is discarded as The Carrock becomes active.`);
  }
  const remaining = allActiveLocations(s);
  s.staging = s.staging.filter((u) => u.id !== carrock.id);
  s.activeLocation = carrock;
  s.extraActiveLocations = remaining;
  s.stage = 2;
  s.progress = 0;
  s.stageRevealing = false;
  for (const code of CARROCK_TROLLS) placeEncounter(s, code, true);
  log(
    s,
    "Against the Trolls · The Carrock becomes active and four unique Trolls enter staging.",
    "chapter",
  );
}

export function carrockCanContribute(s: GameState, u: Unit) {
  return (
    u.code === CARROCK.grimbeorn &&
    (s.staging.some((x) => x.id === u.id) || ownerOf(s, u) === activeSeat(s)) &&
    s.heroes.some((h) => h.resources > 0 && carrockPaysLeadership(s, h))
  );
}

/** Handled treacheries own their discard/shuffle/attachment destination. */
export function carrockEncounter(s: GameState, encounterCode: string) {
  switch (encounterCode) {
    case CARROCK.frightenedBeast: {
      const creatures = allCharacters(s).filter(
        (u) =>
          ["ally", "objective-ally"].includes(card(u.code).type_code) &&
          card(u.code).traits?.includes("Creature"),
      );
      s.encounterDiscard.push(encounterCode);
      if (creatures.length) {
        choose(
          s,
          "A Frightened Beast",
          [
            ...opts(
              creatures,
              (u) => [
                fx("discardCharacter", { target: u.id, player: ownerOf(s, u) }),
              ],
              () =>
                "Discard this Creature ally to cancel the threat increase for every player",
            ),
            {
              id: "raise",
              label: "Raise every player’s threat",
              effects: [fx("carrockFrightenedThreat")],
            },
          ],
          "Any player may discard a Creature ally they control. Otherwise each player raises threat by the staging area’s total threat.",
        );
      } else prepend(s, fx("carrockFrightenedThreat"));
      return true;
    }
    case CARROCK.sacked:
      sackChoice(s);
      return true;
    case CARROCK.roastedSlowly:
      prepend(
        s,
        ...allHeroes(s)
          .filter(hasSackAttached)
          .map((h) =>
            fx("carrockRoastHero", { target: h.id, player: ownerOf(s, h) }),
          ),
        fx("carrockRoastShuffle"),
      );
      return true;
    default:
      return false;
  }
}

function sackChoice(s: GameState) {
  selectSeat(s, s.table?.first ?? 0);
  const heroes = s.heroes.filter((h) => !hasSackAttached(h));
  if (!heroes.length) {
    s.encounterDiscard.push(CARROCK.sacked);
    log(
      s,
      "Sacked! finds no eligible hero controlled by the first player and is discarded.",
    );
    return;
  }
  choose(
    s,
    "Sacked! · First player",
    opts(heroes, (h) => [fx("carrockSack", { target: h.id })]),
    "Attach to a hero without Sacked! This cannot be canceled. The hero cannot attack, defend, commit, trigger its own effect or collect resources. A hero already questing remains committed.",
  );
}

export function carrockShadow(s: GameState, shadowCode: string) {
  if (!s.combat) return false;
  const enemy = get(s, s.combat.enemyId);
  switch (shadowCode) {
    case CARROCK.muckAdder:
      s.combat.defensePenalty = (s.combat.defensePenalty ?? 0) + 1;
      return true;
    case CARROCK.roastedSlowly:
      if (enemy && isTroll(enemy)) enemy.damage = Math.max(0, enemy.damage - 2);
      return true;
    case CARROCK.sacked:
      if (enemy && isTroll(enemy)) {
        const index = enemy.shadows.indexOf(CARROCK.sacked);
        if (index >= 0) removeShadowCard(enemy, index);
        sackChoice(s);
      }
      return true;
    default:
      return false;
  }
}

export function carrockAfterAttack(s: GameState, enemy: Unit) {
  if (isTroll(enemy) && allEngaged(s).some((u) => u.code === CARROCK.louis)) {
    raiseThreat(s, 3, "encounter");
    log(
      s,
      "Louis: the defending player raises threat by 3 after the Troll’s attack.",
      "danger",
    );
  }
  if (enemy.code === CARROCK.rupert) {
    const sacks = s.encounterDiscard.filter((c) => c === CARROCK.sacked);
    s.encounterDiscard = s.encounterDiscard.filter((c) => c !== CARROCK.sacked);
    if (sacks.length) {
      s.encounterDeck.push(...sacks);
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Rupert shuffles discarded Sacked! cards back into the encounter deck.",
        "danger",
      );
    }
  }
}

export function carrockDefeated(s: GameState, enemy: Unit) {
  if (CARROCK_TROLLS.includes(enemy.code)) prepend(s, fx("carrockFreeHero"));
}
export function carrockCombatDamage(
  s: GameState,
  target: Unit,
  enemy: Unit,
  amount: number,
) {
  if (enemy.code === CARROCK.muckAdder && amount > 0 && get(s, target.id))
    prepend(
      s,
      fx("discardCharacter", { target: target.id, player: ownerOf(s, target) }),
    );
}
export function carrockTravel(s: GameState, location: Unit) {
  if (location.code === CARROCK.beePastures)
    prepend(s, fx("carrockBeeResponse", { source: location.id }));
}

export function carrockEffect(s: GameState, effect: Effect) {
  const target = get(s, effect.target);
  switch (effect.kind) {
    case "carrockStageTwo":
      if (target) carrockStageTwo(s, target, get(s, effect.source));
      break;
    case "carrockContribute":
      requireRule(
        target && carrockCanContribute(s, target),
        "Spend a Leadership resource to help Grimbeorn.",
      );
      choose(
        s,
        "Help Grimbeorn the Old",
        opts(
          s.heroes.filter(
            (h) => h.resources > 0 && carrockPaysLeadership(s, h),
          ),
          (h) => [
            fx("carrockPayGrimbeorn", { target: target.id, source: h.id }),
          ],
          (h) => `Spend 1 resource from ${name(h)}`,
        ),
      );
      break;
    case "carrockPayGrimbeorn": {
      const hero = get(s, effect.source);
      requireRule(
        target && hero && hero.resources > 0 && carrockPaysLeadership(s, hero),
        "The chosen Leadership resource is no longer available.",
      );
      spendResources(s, hero, 1);
      target.resources++;
      log(s, `Grimbeorn receives a resource (${target.resources}/8).`, "good");
      if (target.resources >= 8 && s.staging.some((u) => u.id === target.id)) {
        s.staging = s.staging.filter((u) => u.id !== target.id);
        const first = s.table?.first ?? 0;
        forOwner(s, first, () => {
          target.owner = first;
          s.allies.push(target);
        });
        log(s, "Grimbeorn the Old joins the first player as an ally.", "good");
      }
      break;
    }
    case "carrockSack":
      requireRule(
        target &&
          card(target.code).type_code === "hero" &&
          !hasSackAttached(target),
        "Sacked! requires a hero without another Sacked! attachment.",
      );
      target.attachments.push({
        id: `a${s.nextId++}`,
        code: CARROCK.sacked,
        exhausted: false,
      });
      log(s, `${name(target)} is Sacked!`, "danger");
      break;
    case "carrockFrightenedThreat": {
      const amount = s.staging.reduce((n, u) => n + threatOf(s, u), 0);
      eachSeat(s, () => {
        raiseThreat(s, amount, "encounter");
      });
      log(
        s,
        `A Frightened Beast raises every player’s threat by ${amount}.`,
        "danger",
      );
      break;
    }
    case "carrockRoastHero":
      if (target && hasSackAttached(target)) destroy(s, target);
      break;
    case "carrockRoastShuffle":
      s.encounterDeck.push(CARROCK.roastedSlowly);
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Roasted Slowly is shuffled back into the encounter deck.",
        "danger",
      );
      break;
    case "carrockFreeHero": {
      const options = allHeroes(s).flatMap((hero) =>
        hero.attachments
          .filter((a) => a.code === CARROCK.sacked)
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Free ${name(hero)} from Sacked!`,
            effects: [
              fx("discardAttachment", {
                target: hero.id,
                source: a.id,
                player: ownerOf(s, hero),
              }),
            ],
          })),
      );
      if (options.length)
        choose(s, "A Troll is defeated · Free a hero", [...options, skip]);
      break;
    }
    case "carrockBeeResponse":
      if (
        s.encounterDeck.includes(CARROCK.grimbeorn) ||
        s.encounterDiscard.includes(CARROCK.grimbeorn)
      )
        choosePlayerResponse(
          s,
          effect.source ?? CARROCK.beePastures,
          CARROCK.beePastures,
          "Bee Pastures · Find Grimbeorn",
          [
            {
              id: "find",
              code: CARROCK.grimbeorn,
              label: "Search for Grimbeorn the Old",
              effects: [fx("carrockFindGrimbeorn")],
            },
            skip,
          ],
        );
      break;
    case "carrockFindGrimbeorn": {
      const deck = s.encounterDeck.indexOf(CARROCK.grimbeorn);
      const discard = s.encounterDiscard.indexOf(CARROCK.grimbeorn);
      if (deck >= 0) s.encounterDeck.splice(deck, 1);
      else if (discard >= 0) s.encounterDiscard.splice(discard, 1);
      if (deck >= 0 || discard >= 0) placeEncounter(s, CARROCK.grimbeorn, true);
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Bee Pastures finds Grimbeorn the Old; the encounter deck is shuffled.",
        "good",
      );
      break;
    }
    default:
      return false;
  }
  return true;
}
