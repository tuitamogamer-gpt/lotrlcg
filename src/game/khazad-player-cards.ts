import { playerCardImmune } from "./card-immunity";
import { canGainResources } from "./core";
// Exact Khazad-dûm player mechanics beyond the existing Dwarf/Song/passive rules.
import { card, playerCards } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  skip,
} from "./core";
import {
  check,
  exhaustCharacter,
  discardPlayerDeck,
  progressLocation,
  spendEvent,
} from "./board";
import { khazadCannotExhaust } from "./khazad-dum";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  firstPlayer,
  allActiveLocations,
  allCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
const affected = (u: Unit) => !playerCardImmune(u);
const ownDwarves = (s: GameState) =>
  [...s.heroes, ...s.allies].filter((u) => hasTrait(u, "Dwarf"));
const active = (s: GameState) => allActiveLocations(s).filter(affected);
const boostedLocation = (u: Unit, traits: string[]) =>
  traits.some((t) => hasTrait(u, t));
const heroes = (s: GameState) => s.heroes.filter((u) => canGainResources(s, u));
const protection = (s: GameState, player: number) =>
  playerOrder(s).some((i) =>
    seatView(s, i).used.includes(`phase:ever-onward:${player}`),
  );
const unprotected = (s: GameState) =>
  playerOrder(s).filter((i) => !protection(s, i));
const maxPrintedCost = () =>
  Math.max(
    0,
    ...playerCards.map((c) => Number(c.cost)).filter(Number.isFinite),
  );
const printedCost = (code: string) => {
  const cost = card(code).cost;
  return cost === "X" ? 0 : cost === undefined ? undefined : Number(cost);
};

export function khazadPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "03005")
    return "Ever Onward is a response to an unsuccessful quest; use its response window.";
  if (code === "03008" && !allCharacters(s).some((u) => hasTrait(u, "Dwarf")))
    return "Khazâd! Khazâd! requires a Dwarf character.";
  if (code === "03010" && !allCharacters(s).some((u) => hasTrait(u, "Dwarf")))
    return "Untroubled by Darkness requires a Dwarf character.";
  if (
    code === "03012" &&
    (!ownDwarves(s).some((u) => !u.exhausted && !khazadCannotExhaust(u)) ||
      !active(s).length)
  )
    return "Ancestral Knowledge requires a ready Dwarf you control and an active location.";
  return null;
}
export function khazadPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "03008")
    return allCharacters(s).filter((u) => hasTrait(u, "Dwarf"));
  if (code === "03012")
    return ownDwarves(s).filter((u) => !u.exhausted && !khazadCannotExhaust(u));
  return null;
}
export function khazadPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["03008", "03010", "03012"].includes(code)) return false;
  requireRule(
    !khazadPlayerPlayProblem(s, code),
    khazadPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "03008") {
    const dwarf = allCharacters(s).find(
      (u) => u.id === target && hasTrait(u, "Dwarf"),
    );
    requireRule(dwarf, "Choose a Dwarf character.");
    dwarf.tempAttack = (dwarf.tempAttack ?? 0) + 3;
  }
  if (code === "03010") {
    const bonus = allActiveLocations(s).some((u) =>
      boostedLocation(u, ["Underground", "Dark"]),
    )
      ? 2
      : 1;
    for (const u of allCharacters(s).filter((u) => hasTrait(u, "Dwarf")))
      u.tempWill = (u.tempWill ?? 0) + bonus;
    log(
      s,
      `Untroubled by Darkness grants Dwarf characters +${bonus} willpower this phase.`,
      "good",
    );
  }
  if (code === "03012") {
    const dwarf = ownDwarves(s).find(
      (u) => u.id === target && !u.exhausted && !khazadCannotExhaust(u),
    );
    requireRule(dwarf, "Exhaust a Dwarf character you control.");
    requireRule(exhaustCharacter(s, dwarf), "This Dwarf cannot exhaust.");
    prepend(s, fx("khazadAncestralLocation", { player: firstPlayer(s) }));
  }
  return true;
}
export function khazadPlayerStats(_s: GameState, _u: Unit) {
  return { will: 0, attack: 0, defense: 0 };
}
export const khazadPlayerAbilityLabel = (code: string) =>
  code === "03009" ? "Exhaust · name cost and mine 2 cards" : undefined;
export function khazadPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code === "03009" && (u.exhausted || !s.deck.length))
    return "Zigil Miner must be ready and your deck must contain a card.";
  return undefined;
}
export function useKhazadPlayerAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "03009") return false;
  requireRule(
    !khazadPlayerAbilityProblem(s, u),
    khazadPlayerAbilityProblem(s, u) ?? "",
  );
  choose(
    s,
    "Zigil Miner · Name a printed cost",
    Array.from({ length: maxPrintedCost() + 2 }, (_, value) => ({
      id: `cost-${value}`,
      label: `${value}`,
      effects: [fx("khazadMinerDiscard", { source: u.id, value })],
    })),
    "Name before looking. X costs are 0 outside play; numbers above this range cannot match any registered printed cost.",
  );
  return true;
}
export function khazadPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code === "03006") {
    // 'Enters play with' establishes a counter, rather than dealing/assigning damage.
    u.damage++;
    log(s, "Veteran of Nanduhirion enters play with one damage.");
    check(s);
  }
}
export function khazadPlayerAttackKilled(
  s: GameState,
  enemy: Unit,
  attackerIds: string[],
) {
  if (!hasTrait(enemy, "Orc")) return;
  prepend(
    s,
    ...attackerIds
      .map((id) => get(s, id))
      .filter(
        (u): u is Unit =>
          !!u && u.code === "03001" && !u.blanked && !isSacked(u),
      )
      .map((u) =>
        fx("khazadDwalinResponse", { player: ownerOf(s, u), source: u.id }),
      ),
  );
}
export function khazadPlayerAttackResolved(
  s: GameState,
  enemy: Unit,
  attackerIds: string[],
) {
  if (!get(s, enemy.id) || !affected(enemy)) return;
  prepend(
    s,
    ...attackerIds.flatMap((id) => {
      const u = get(s, id);
      return u
        ? u.attachments
            .filter((a) => a.code === "03007" && !a.blanked && !a.facedown)
            .map((a) =>
              fx("khazadAxeResponse", {
                player: ownerOf(s, u),
                source: u.id,
                target: enemy.id,
                text: a.id,
              }),
            )
        : [];
    }),
  );
}
/** Delay only failed-quest threat, preserving Return's earlier instant-loss check. */
export function khazadPlayerFailedQuest(s: GameState, value: number): boolean {
  const offers = playerOrder(s).filter((player) => {
    const p = seatView(s, player);
    return p.hand.some((u) => u.code === "03005") && canPay(p, card("03005"));
  });
  if (!offers.length || value <= 0) return false;
  prepend(
    s,
    ...offers.map((player) => fx("khazadEverWindow", { player })),
    fx("failedQuest", { value, flag: true, player: firstPlayer(s) }),
  );
  return true;
}
export const khazadPlayerQuestFailureAmount = (
  s: GameState,
  player: number,
  value: number,
) => (protection(s, player) ? 0 : value);
export function handleKhazadPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "khazadAncestralLocation":
      choose(
        s,
        "Ancestral Knowledge · Active location",
        opts(active(s), (location) => [
          fx("khazadAncestralProgress", { target: location.id }),
        ]),
      );
      return true;
    case "khazadAncestralProgress": {
      const location = active(s).find((u) => u.id === e.target);
      requireRule(location, "Choose an eligible active location.");
      progressLocation(
        s,
        location,
        boostedLocation(location, ["Underground", "Mountain"]) ? 4 : 2,
      );
      return true;
    }
    case "khazadMinerDiscard": {
      const miner = get(s, e.source),
        number = e.value ?? -1;
      requireRule(
        miner?.code === "03009" &&
          !miner.exhausted &&
          s.deck.length &&
          Number.isSafeInteger(number) &&
          number >= 0,
        "Name a number with a ready Zigil Miner.",
      );
      exhaustCharacter(s, miner);
      const discarded = discardPlayerDeck(s, 2),
        matches = discarded.filter(
          (code) => printedCost(code) === number,
        ).length;
      log(
        s,
        `Zigil Miner names ${number} and discards ${discarded.map((c) => card(c).name).join(", ")}; ${matches} matching card(s).`,
      );
      if (matches && heroes(s).length)
        choose(
          s,
          "Zigil Miner · Hero resource pool",
          opts(heroes(s), (hero) => [
            fx("khazadMinerResources", { target: hero.id, value: matches }),
          ]),
        );
      return true;
    }
    case "khazadMinerResources": {
      const hero = heroes(s).find((u) => u.id === e.target);
      requireRule(hero, "Choose a hero you control that may gain resources.");
      hero.resources += e.value ?? 0;
      gondorResourcesGained(s, hero, e.value ?? 0, true);
      return true;
    }
    case "khazadDwalinResponse": {
      const dwalin = get(s, e.source);
      if (
        dwalin?.code === "03001" &&
        !dwalin.blanked &&
        !isSacked(dwalin) &&
        s.threat > 0
      )
        choose(s, "Dwalin · Orc destroyed by attack", [
          {
            id: "reduce",
            label: "Lower your threat by 2",
            code: "03001",
            effects: [
              fx("threat", { value: -2, source: dwalin.id, code: dwalin.code }),
            ],
          },
          skip,
        ]);
      return true;
    }
    case "khazadAxeResponse": {
      const host = get(s, e.source),
        enemy = get(s, e.target),
        a = host?.attachments.find(
          (a) =>
            a.id === e.text && a.code === "03007" && !a.blanked && !a.facedown,
        );
      if (a && enemy && affected(enemy))
        choose(s, "Dwarrowdelf Axe · After attack", [
          {
            id: "damage",
            label: "Deal 1 damage to the defending enemy",
            code: a.code,
            effects: [fx("damage", { target: enemy.id, value: 1 })],
          },
          skip,
        ]);
      return true;
    }
    case "khazadEverWindow":
      if (
        unprotected(s).length &&
        s.hand.some((u) => u.code === "03005") &&
        canPay(s, card("03005"))
      )
        choose(s, "Ever Onward · Unsuccessful quest", [
          {
            id: "play",
            label: "Pay to prevent one player's quest-failure threat",
            code: "03005",
            effects: [fx("khazadEverPlayer")],
          },
          skip,
        ]);
      return true;
    case "khazadEverPlayer":
      requireRule(
        unprotected(s).length &&
          s.hand.some((u) => u.code === "03005") &&
          canPay(s, card("03005")),
        "Ever Onward can no longer be played.",
      );
      choose(
        s,
        "Ever Onward · Protect a player",
        unprotected(s).map((player) => ({
          id: `player-${player}`,
          label: seatName(s, player),
          effects: [fx("khazadEverProtect", { value: player })],
        })),
      );
      return true;
    case "khazadEverProtect":
      requireRule(
        unprotected(s).includes(e.value ?? -1),
        "Choose a player whose quest-failure threat is not already prevented.",
      );
      // Another physical event may protect a different player in this same window.
      prepend(s, fx("khazadEverWindow"));
      if (!spendEvent(s, "03005")) return true;
      s.used.push(`phase:ever-onward:${e.value}`);
      return true;
    default:
      return false;
  }
}
