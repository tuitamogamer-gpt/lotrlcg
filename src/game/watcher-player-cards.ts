import { globalPlayerOrder } from "./table";
import { stewardFearLocationLeft } from "./steward-fear";
import { engagedEnemies } from "./considered-engagement";
import { startingThreat as heroesStartingThreat } from "./starting-threat";
// Watcher in the Water: active and triggered rules beyond reviewed Elf/Dwarf/passives.
import { card, plain } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  exhaustCharacter,
  spendEvent,
} from "./board";
import { khazadCannotExhaust } from "./khazad-dum";
import { effectiveKeyword, hasTrait } from "./expansion-passives";
import {
  allActiveLocations,
  allCharacters,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
} from "./table";
const hobbits = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => !u.exhausted && !khazadCannotExhaust(u) && hasTrait(u, "Hobbit"),
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" &&
      !/immune to (?:player )?card effects/i.test(plain(card(u.code).text)),
  );
const roundValue = (s: GameState, prefix: string) =>
  globalPlayerOrder(s).reduce(
    (sum, i) =>
      sum +
      seatView(s, i).used.reduce(
        (n, k) =>
          n + (k.startsWith(prefix) ? Number(k.slice(prefix.length)) : 0),
        0,
      ),
    0,
  );
export function watcherPlayerStats(s: GameState, u: Unit) {
  return {
    will: 0,
    attack: roundValue(s, `round:grave-cairn:${u.id}:`),
    defense: roundValue(s, `round:arwen:${u.id}:`),
  };
}
export function watcherPlayerAttackBonus(
  s: GameState,
  u: Unit,
  enemy: Unit,
): number {
  const ranged =
    !u.blanked &&
    /(?:^|[.\n]\s*)Ranged(?:[.\s]|$)/i.test(plain(card(u.code).text));
  if (
    !ranged ||
    !effectiveKeyword(u, "Ranged") ||
    !playerOrder(s).some(
      (p) =>
        p !== ownerOf(s, u) &&
        engagedEnemies(s, p).some((e) => e.id === enemy.id),
    )
  )
    return 0;
  return u.attachments.filter(
    (a) => a.code === "04057" && !a.blanked && !a.facedown,
  ).length;
}
export const watcherPlayerNoDefenseExhaust = (u: Unit) =>
  u.code === "04056" && !u.blanked;
export function watcherPlayerPlayProblem(
  _s: GameState,
  code: string,
): string | null {
  return code === "04054"
    ? "Grave Cairn responds to a character leaving play; use its response window."
    : code === "04060"
      ? "Short Cut responds to a location entering play; use its response window."
      : null;
}
export const watcherPlayerAbilityLabel = (code: string) =>
  code === "04053" ? "Refresh Action · reset to starting threat" : undefined;
const startingThreat = (s: GameState) =>
  s.startingThreat ??
  heroesStartingThreat(s.startingHeroes) + (s.campaign?.threatPenalty ?? 0);
export function watcherPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== "04053") return undefined;
  if (s.phase !== "refresh")
    return "Aragorn's action requires the refresh phase.";
  if (s.used.includes("game:aragorn-refresh"))
    return "This player has used Aragorn's once-per-game limit.";
  if (s.threat <= startingThreat(s))
    return "Current threat must be above the starting level to reduce it.";
  return undefined;
}
export function useWatcherPlayerAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "04053") return false;
  requireRule(
    !watcherPlayerAbilityProblem(s, u),
    watcherPlayerAbilityProblem(s, u) ?? "",
  );
  s.threat = startingThreat(s);
  s.used.push("game:aragorn-refresh");
  return true;
}
export function watcherPlayerCharacterExhausted(s: GameState, u: Unit) {
  if (u.code === "04058" && !u.blanked)
    prepend(
      s,
      fx("watcherArwenResponse", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function watcherPlayerLeavesPlay(
  s: GameState,
  u: Unit,
  _controller: number,
  lastKnownAttack: number,
) {
  if (
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code) ||
    lastKnownAttack <= 0 ||
    !allCharacters(s).length
  )
    return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((c) => c.code === "04054") && canPay(p, card("04054"))
        );
      })
      .map((player) =>
        fx("watcherGraveResponse", {
          source: u.id,
          value: lastKnownAttack,
          player,
        }),
      ),
  );
}
export function watcherPlayerLocationEntered(s: GameState, u: Unit) {
  if (!locations(s).some((v) => v.id === u.id)) return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((c) => c.code === "04060") &&
          hobbits(p).length &&
          canPay(p, card("04060"))
        );
      })
      .map((player) => fx("watcherShortcutResponse", { target: u.id, player })),
  );
}
export function watcherPlayerDefended(s: GameState, u: Unit) {
  if (u.code === "04056" && !u.blanked && get(s, u.id))
    prepend(
      s,
      fx("watcherBruinenForced", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function handleWatcherPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "watcherArwenResponse": {
      const arwen = get(s, e.source);
      if (arwen?.code === "04058" && !arwen.blanked)
        choose(s, "Arwen Undómiel · Exhausted", [
          ...opts(allCharacters(s), (target) => [
            fx("watcherArwenGrant", { target: target.id }),
          ]),
          skip,
        ]);
      return true;
    }
    case "watcherArwenGrant": {
      const target = get(s, e.target);
      requireRule(target, "Choose a character in play.");
      target.roundKeywords = [
        ...new Set([...(target.roundKeywords ?? []), "Sentinel"]),
      ];
      s.used.push(`round:arwen:${target.id}:1`);
      return true;
    }
    case "watcherBruinenForced": {
      const watcher = s.allies.find((u) => u.id === e.target);
      if (!watcher || watcher.blanked) return true;
      if (!s.hand.length) {
        discardCharacter(s, watcher);
        return true;
      }
      choose(s, "Watcher of the Bruinen · After defending", [
        {
          id: "discard-ally",
          label: "Discard Watcher of the Bruinen",
          code: "04056",
          effects: [fx("watcherBruinenDiscard", { target: watcher.id })],
        },
        ...opts(s.hand, (u) => [fx("watcherBruinenHand", { source: u.id })]),
      ]);
      return true;
    }
    case "watcherBruinenDiscard": {
      const watcher = get(s, e.target);
      if (watcher) discardCharacter(s, watcher);
      return true;
    }
    case "watcherBruinenHand": {
      discardHandCard(s, e.source!);
      return true;
    }
    case "watcherGraveResponse":
      if (
        s.hand.some((u) => u.code === "04054") &&
        canPay(s, card("04054")) &&
        allCharacters(s).some((u) => u.id !== e.source)
      )
        choose(s, "Grave Cairn · Character left play", [
          {
            id: "play",
            label: `Add ${e.value} attack to another character this round`,
            code: "04054",
            effects: [{ ...e, kind: "watcherGraveTarget" }],
          },
          skip,
        ]);
      return true;
    case "watcherGraveTarget":
      choose(
        s,
        "Grave Cairn · Another character",
        opts(
          allCharacters(s).filter((u) => u.id !== e.source),
          (target) => [
            fx("watcherGraveGrant", {
              source: e.source,
              target: target.id,
              value: e.value,
            }),
          ],
        ),
      );
      return true;
    case "watcherGraveGrant":
      requireRule(
        get(s, e.target) && e.target !== e.source,
        "Choose another character in play.",
      );
      if (!spendEvent(s, "04054")) return true;
      s.used.push(`round:grave-cairn:${e.target}:${e.value}`);
      prepend(
        s,
        fx("watcherGraveResponse", { source: e.source, value: e.value }),
      );
      return true;
    case "watcherShortcutResponse":
      if (
        locations(s).some((u) => u.id === e.target) &&
        hobbits(s).length &&
        s.hand.some((u) => u.code === "04060") &&
        canPay(s, card("04060"))
      )
        choose(s, "Short Cut · Location entered play", [
          {
            id: "play",
            label: "Exhaust a Hobbit to shuffle this location back",
            code: "04060",
            effects: [{ ...e, kind: "watcherShortcutHobbit" }],
          },
          skip,
        ]);
      return true;
    case "watcherShortcutHobbit":
      choose(
        s,
        "Short Cut · Exhaust your Hobbit",
        opts(hobbits(s), (u) => [
          fx("watcherShortcutShuffle", { source: u.id, target: e.target }),
        ]),
      );
      return true;
    case "watcherShortcutShuffle": {
      const hobbit = hobbits(s).find((u) => u.id === e.source),
        location = locations(s).find((u) => u.id === e.target);
      requireRule(
        hobbit && location,
        "Choose a ready controlled Hobbit and the entered location.",
      );
      requireRule(
        exhaustCharacter(s, hobbit),
        "Short Cut must exhaust its Hobbit as a cost.",
      );
      if (!spendEvent(s, "04060")) return true;
      s.staging = s.staging.filter((u) => u.id !== location.id);
      removeActiveLocation(s, location.id);
      for (const a of [...location.attachments])
        discardAttachment(s, location, a, true);
      stewardFearLocationLeft(s, location, false, false);
      s.encounterDeck.push(location.code);
      shuffle(s, s.encounterDeck);
      prepend(s, fx("reveal"));
      return true;
    }
    default:
      return false;
  }
}
