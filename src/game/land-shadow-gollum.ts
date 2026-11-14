import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  spendResources,
} from "./core";
import {
  characterLeftPlay,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  removeFromQuest,
} from "./board";
import {
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  seatName,
  seatView,
} from "./table";
import { isHero } from "./card-types";
import { oneRing, oneRingExhausted } from "./lotr-saga";
import { isMorgul } from "./black-riders-hunted";
import { encounterCharacterEntered } from "./encounter-character-uniqueness";
import { batch4Scenario } from "./batch4-scenarios";
import { POM } from "./passage-marshes-support";

/**
 * Gollum, Sméagol and the Nazgûl of The Land of Shadow, shared by The Passage
 * of the Marshes and Shelob's Lair: the double-sided Gollum/Sméagol card, We
 * Hates Them!, Call of the Ring and Morgul Wraith. The effect kinds keep the
 * "pom" prefix they had when only The Passage of the Marshes used them.
 */
export const gollumScenario = (s: GameState) =>
  !!(s.passageMarshes || s.shelobLair);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const traitOf = (c: string, trait: string) =>
  (card(c).traits ?? "").split(".").some((t) => t.trim() === trait);
export const isNazgulCode = (c: string) =>
  card(c).type_code === "enemy" && traitOf(c, "Nazgûl");
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const players = (s: GameState) => globalPlayerOrder(s).length;

/** Sméagol, the objective-ally the first player controls. */
export const lsSmeagol = (s: GameState) =>
  gollumScenario(s)
    ? globalCharacters(s).find((u) => u.code === POM.smeagol)
    : undefined;
/** Gollum, the enemy side of the card. */
export const lsGollum = (s: GameState) =>
  gollumScenario(s)
    ? [...globalEngaged(s), ...s.staging].find((u) => u.code === POM.gollum)
    : undefined;
/** The Fellowship heroes able to pay a Fellowship resource. */
export const fellowshipPayers = (s: GameState) =>
  globalCharacters(s).filter(
    (u) =>
      isHero(u) && card(u.code).sphere_code === "fellowship" && u.resources > 0,
  );

/** Take a card out of the victory display. */
export function takeVictory(s: GameState, code: string) {
  const i = (s.victoryCards ?? []).indexOf(code);
  if (i < 0) return false;
  s.victoryCards!.splice(i, 1);
  s.victory -= card(code).victory ?? 0;
  return true;
}
/** "Search ... for ...": one option per card and zone. */
export function searchOptions(
  s: GameState,
  match: (code: string) => boolean,
  kind: string,
  player: number,
  zones: readonly ("deck" | "discard" | "victory")[] = ["deck", "discard"],
): Option[] {
  const piles = {
    deck: s.encounterDeck,
    discard: s.encounterDiscard,
    victory: s.victoryCards ?? [],
  } as const;
  const label = {
    deck: "encounter deck",
    discard: "discard pile",
    victory: "victory display",
  } as const;
  const options: Option[] = [];
  for (const zone of zones)
    for (const code of [...new Set(piles[zone].filter(match))])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${label[zone]}`,
        effects: [fx(kind, { code, text: zone, player })],
      });
  return options;
}
export function takeFrom(s: GameState, zone: string | undefined, code: string) {
  if (zone === "victory") return takeVictory(s, code);
  const pile = zone === "discard" ? s.encounterDiscard : s.encounterDeck;
  const i = pile.lastIndexOf(code);
  if (i < 0) return false;
  pile.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Gollum and Sméagol.

/** Forced: when Gollum is defeated, flip him to Sméagol and exhaust Sméagol. */
export function gollumDefeated(s: GameState, u: Unit) {
  const first = firstPlayer(s);
  const smeagol: Unit = {
    ...make(s, POM.smeagol),
    id: u.id,
    owner: first,
    controller: first,
    exhausted: true,
  };
  forOwner(s, first, () => s.allies.push(smeagol));
  if (s.passageMarshes) delete s.passageMarshes.gollumDefense;
  log(
    s,
    `Gollum is defeated: he flips to Sméagol, exhausted, and ${s.table ? seatName(s, first) : "the first player"} gains control of Sméagol.`,
    "good",
  );
  encounterCharacterEntered(s, smeagol);
}
/** Flip Sméagol to Gollum: Gollum enters play engaged with the first player. */
export function flipToGollum(s: GameState, text: string) {
  const smeagol = lsSmeagol(s);
  if (!smeagol) return false;
  const owner = ownerOf(s, smeagol);
  const first = firstPlayer(s);
  removeFromQuest(s, smeagol);
  forOwner(s, owner, () => {
    s.allies = s.allies.filter((x) => x.id !== smeagol.id);
    s.committedIds = s.committedIds.filter((id) => id !== smeagol.id);
  });
  for (const a of [...smeagol.attachments])
    discardAttachment(s, smeagol, a, true);
  characterLeftPlay(s, smeagol, owner, { zone: "captured", player: owner });
  // Damage is discarded and Gollum is ready.
  const gollum: Unit = {
    ...make(s, POM.gollum),
    id: smeagol.id,
    owner: first,
    exhausted: false,
  };
  log(
    s,
    `${text}: Sméagol flips to Gollum, who engages ${s.table ? seatName(s, first) : "the first player"}.`,
    "danger",
  );
  forOwner(s, first, () => {
    s.staging.push(gollum);
    engage(s, gollum);
  });
  return true;
}
/**
 * "Gollum engages the first player": while he is in play, Gollum is engaged
 * with the first player. Returns true if he just engaged that player.
 */
export function gollumFollows(s: GameState) {
  const gollum = lsGollum(s);
  if (!gollum || gollum.blanked || s.status !== "playing") return false;
  const first = firstPlayer(s);
  const engagedWithFirst = seatView(s, first).engaged.some(
    (u) => u.id === gollum.id,
  );
  if (engagedWithFirst) return false;
  forOwner(s, first, () => engage(s, gollum));
  return seatView(s, first).engaged.some((u) => u.id === gollum.id);
}
/** "The first player gains control of Sméagol." */
export function smeagolFollows(s: GameState) {
  const smeagol = lsSmeagol(s);
  if (!smeagol || !s.table) return;
  const from = ownerOf(s, smeagol),
    to = firstPlayer(s);
  if (from === to || !globalPlayerOrder(s).includes(to)) return;
  removeFromQuest(s, smeagol);
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== smeagol.id);
    s.committedIds = s.committedIds.filter((id) => id !== smeagol.id);
  });
  smeagol.owner = to;
  smeagol.controller = to;
  forOwner(s, to, () => s.allies.push(smeagol));
  log(s, `${seatName(s, to)} gains control of Sméagol.`);
}

// ---------------------------------------------------------------------------
// We Hates Them!, Call of the Ring and Morgul Wraith.

/** The When Revealed effects of We Hates Them! and Call of the Ring. */
export function gollumTreachery(s: GameState, code: string) {
  const first = firstPlayer(s);
  if (code === POM.hates) {
    prepend(s, fx("pomHates", { player: first }));
    return true;
  }
  if (code === POM.call) {
    prepend(s, fx("pomCall", { player: first }));
    return true;
  }
  return false;
}
/** The shadow effects of We Hates Them! and Call of the Ring. */
export function gollumShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if (code === POM.hates) {
    const enemy = get(s, c.enemyId);
    const bonus = enemy && live(enemy, POM.gollum) ? 3 : 1;
    c.attackBonus += bonus;
    log(
      s,
      `We Hates Them!: the attacking enemy gets +${bonus} attack.`,
      "danger",
    );
    return true;
  }
  if (code === POM.call) {
    c.extraAttacks = (c.extraAttacks ?? 0) + 1;
    log(
      s,
      "Call of the Ring: the attacking enemy makes an additional attack after this one.",
      "danger",
    );
    return true;
  }
  return false;
}
/** Morgul Wraith: -30 engagement cost while The One Ring is exhausted. */
export const morgulWraithEngagement = (s: GameState, u: Unit) =>
  gollumScenario(s) && live(u, POM.wraith) && oneRingExhausted(s) ? -30 : 0;
/** Morgul Wraith: immune to player card effects while The One Ring is exhausted. */
export const morgulWraithImmune = (s: GameState, u: Unit) =>
  gollumScenario(s) && live(u, POM.wraith) && oneRingExhausted(s);
/** Morgul Wraith cannot have non-Morgul attachments. */
export const morgulWraithCannotAttach = (s: GameState, u: Unit, code: string) =>
  gollumScenario(s) && live(u, POM.wraith) && !isMorgul(code);
function ringExhausted(s: GameState) {
  batch4Scenario(s).oneRingExhausted?.(s);
}
/** Effects shared by every scenario with Gollum and the Nazgûl. */
export const GOLLUM_SHARED_EFFECTS: readonly string[] = [
  "pomShuffle",
  "pomExhaustSmeagol",
  "pomSmeagolFlips",
  "pomGollumFollows",
];

export function gollumEffect(s: GameState, e: Effect): boolean {
  if (!gollumScenario(s)) return false;
  const first = firstPlayer(s);
  switch (e.kind) {
    case "pomShuffle":
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.text ?? (s.shelobLair ? "Shelob's Lair" : "The Passage of the Marshes")}: the encounter deck is shuffled.`,
      );
      return true;
    case "pomExhaustSmeagol": {
      const smeagol = lsSmeagol(s);
      if (!smeagol || smeagol.exhausted) return true;
      forOwner(s, ownerOf(s, smeagol), () => exhaustCharacter(s, smeagol));
      log(s, `Sméagol is exhausted to travel to ${e.text}.`);
      return true;
    }
    case "pomSmeagolFlips":
      flipToGollum(s, e.text ?? "Sméagol");
      return true;
    case "pomGollumFollows":
      if (gollumFollows(s) && e.flag && players(s) > 1) {
        const gollum = lsGollum(s);
        if (gollum) {
          log(
            s,
            "Gollum engages the first player during the refresh phase and makes an immediate attack.",
            "danger",
          );
          prepend(
            s,
            fx("immediateAttack", { target: gollum.id, player: first }),
          );
        }
      }
      return true;
    case "pomHates": {
      const ring = oneRing(s);
      const payer = fellowshipPayers(s).find((x) => ownerOf(s, x) === first);
      const resolve = fx("pomHatesResolve", { player: first });
      if (!ring || ring.exhausted || ring.blanked || !payer) {
        prepend(s, resolve);
        return true;
      }
      choose(
        s,
        `We Hates Them! · Cancel this effect?${seatLabel(s, first)}`,
        [
          {
            id: "cancel",
            label:
              "Spend 1 Fellowship resource and exhaust The One Ring to cancel this effect",
            effects: [fx("pomHatesCancel", { player: first })],
          },
          { id: "resolve", label: "Do not cancel", effects: [resolve] },
        ],
        "When Revealed: either flip Sméagol to Gollum, or Gollum makes an immediate attack. The first player may spend 1 Fellowship resource and exhaust The One Ring to cancel this effect.",
      );
      return true;
    }
    case "pomHatesCancel": {
      const ring = oneRing(s);
      const payer = fellowshipPayers(s).find((x) => ownerOf(s, x) === first);
      if (!ring || ring.exhausted || !payer) {
        prepend(s, fx("pomHatesResolve", { player: first }));
        return true;
      }
      spendResources(s, payer, 1);
      ring.exhausted = true;
      log(
        s,
        `We Hates Them!: ${name(payer)} spends 1 Fellowship resource and The One Ring is exhausted to cancel its effect.`,
        "good",
      );
      ringExhausted(s);
      batch4Scenario(s).whenRevealedCancelled?.(s, POM.hates);
      return true;
    }
    case "pomHatesResolve": {
      if (lsSmeagol(s)) {
        flipToGollum(s, "We Hates Them!");
        return true;
      }
      const gollum = lsGollum(s);
      if (!gollum) return true;
      log(s, "We Hates Them!: Gollum makes an immediate attack.", "danger");
      prepend(
        s,
        fx("immediateAttack", {
          target: gollum.id,
          player: ownerOf(s, gollum),
        }),
      );
      return true;
    }
    case "pomCall": {
      const search = searchOptions(s, isNazgulCode, "pomCallAdd", first, [
        "deck",
        "discard",
        "victory",
      ]);
      const ring = oneRing(s);
      const options: Option[] = [];
      if (search.length)
        options.push({
          id: "search",
          label:
            "Search the encounter deck, discard pile and victory display for a Nazgûl enemy and add it to the staging area",
          effects: [fx("pomCallSearch", { player: first })],
        });
      if (ring && !ring.exhausted && !ring.blanked)
        options.push({
          id: "ring",
          label:
            "Exhaust The One Ring and reveal the top card of the encounter deck",
          effects: [fx("pomCallRing", { player: first })],
        });
      if (!options.length) {
        log(
          s,
          "Call of the Ring: there is no Nazgûl enemy to find and The One Ring cannot be exhausted.",
        );
        return true;
      }
      choose(
        s,
        `Call of the Ring · The first player must choose${seatLabel(s, first)}`,
        options,
        "When Revealed: the first player must choose: either search the encounter deck, discard pile, and victory display for a Nazgûl enemy and add it to the staging area, or exhaust The One Ring and reveal the top card of the encounter deck.",
      );
      return true;
    }
    case "pomCallSearch": {
      const options = searchOptions(s, isNazgulCode, "pomCallAdd", first, [
        "deck",
        "discard",
        "victory",
      ]);
      if (options.length === 1) prepend(s, ...options[0].effects);
      else if (options.length)
        choose(
          s,
          `Call of the Ring · Add a Nazgûl enemy to the staging area${seatLabel(s, first)}`,
          options,
          "The first player searches the encounter deck, discard pile and victory display for a Nazgûl enemy and adds it to the staging area.",
        );
      return true;
    }
    case "pomCallAdd": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const enemy = make(s, e.code);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      log(
        s,
        `Call of the Ring: ${name(enemy)} is added to the staging area from the ${e.text === "victory" ? "victory display" : e.text === "discard" ? "discard pile" : "encounter deck"}.`,
        "danger",
      );
      prepend(s, fx("pomShuffle", { text: "Call of the Ring", player: first }));
      return true;
    }
    case "pomCallRing": {
      const ring = oneRing(s);
      if (!ring || ring.exhausted) return true;
      ring.exhausted = true;
      log(
        s,
        "Call of the Ring: The One Ring is exhausted, and the first player reveals the top card of the encounter deck.",
        "danger",
      );
      ringExhausted(s);
      prepend(s, fx("reveal", { player: first }));
      return true;
    }
  }
  return false;
}
