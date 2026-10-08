import { playerCardImmune } from "./card-immunity";
import { movableHand } from "./hand-rules";
import { takePlayerDeck, putPlayerDeck, reorderPlayerDeck } from "./core";
// Exact active and triggered rules from The Hills of Emyn Muil.
import { card } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import { choose, fx, get, log, opts, prepend, requireRule, skip } from "./core";
import {
  discardCharacter,
  exhaustCharacter,
  discardPlayerDeck,
  progressLocation,
  returnAlly,
} from "./board";
import { CARROCK, isSacked } from "./carrock";
import { hasTrait } from "./expansion-passives";
import {
  allActiveLocations,
  allCharacters,
  allHeroes,
  eachSeat,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";

const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" &&
      u.code !== CARROCK.carrock &&
      !playerCardImmune(u),
  );
const stagingEnemies = (s: GameState) =>
  s.staging.filter(
    (u) => card(u.code).type_code === "enemy" && !playerCardImmune(u),
  );
const leadershipAllies = (s: GameState) =>
  s.allies.filter(
    (u) =>
      card(u.code).type_code === "ally" &&
      card(u.code).sphere_code === "leadership",
  );
const rohanAllies = (s: GameState) =>
  s.allies.filter(
    (u) => card(u.code).type_code === "ally" && hasTrait(u, "Rohan"),
  );
const eagleAllies = (s: GameState) =>
  allCharacters(s).filter(
    (u) => card(u.code).type_code === "ally" && hasTrait(u, "Eagle"),
  );
const anyDeck = (s: GameState) =>
  playerOrder(s).some((i) => seatView(s, i).deck.length > 0);

export function emynPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "02074") {
    if (!["quest", "staging"].includes(s.phase))
      return "Rear Guard is a Quest Action.";
    if (!leadershipAllies(s).length)
      return "Rear Guard requires a Leadership ally you control to discard.";
    if (!allHeroes(s).some((u) => u.committed))
      return "A hero must be committed to the quest.";
  }
  if (code === "02076" && !eagleAllies(s).length)
    return "Meneldor's Flight requires an Eagle ally.";
  if (code === "02078" && (!rohanAllies(s).length || !locations(s).length))
    return "Ride to Ruin needs a Rohan ally you control and a location that can receive progress.";
  if (code === "02080") {
    if (
      s.phase !== "quest" ||
      allCharacters(s).some((u) => u.committed) ||
      playerOrder(s).some((i) =>
        seatView(s, i).used.includes("phase:quest-committed"),
      )
    )
      return "Play Gildor's Counsel in the Quest phase before characters are committed.";
    const base =
      s.scenarioId === "anduin" && s.stage === 3
        ? 0
        : playerOrder(s).length +
          (s.scenarioId === "anduin" && s.stage === 2 ? 1 : 0);
    if (emynPlayerRevealReduction(s, base) <= 1)
      return "Gildor's Counsel cannot reduce the current staging reveal below one card.";
  }
  return null;
}
export function emynPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  return code === "02074"
    ? leadershipAllies(s)
    : code === "02076"
      ? eagleAllies(s)
      : code === "02078"
        ? rohanAllies(s)
        : null;
}
export function emynPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (["02074", "02076", "02078", "02080"].includes(code))
    requireRule(
      !emynPlayerPlayProblem(s, code),
      emynPlayerPlayProblem(s, code) ?? "",
    );
  switch (code) {
    case "02074": {
      const ally = leadershipAllies(s).find((u) => u.id === target);
      requireRule(ally, "Discard a Leadership ally you control.");
      discardCharacter(s, ally);
      for (const hero of allHeroes(s).filter((u) => u.committed))
        hero.tempWill = (hero.tempWill ?? 0) + 1;
      log(
        s,
        "Rear Guard grants +1 willpower to every currently committed hero this phase.",
        "good",
      );
      return true;
    }
    case "02076": {
      const eagle = eagleAllies(s).find((u) => u.id === target);
      requireRule(eagle, "Choose an Eagle ally to return to its owner's hand.");
      returnAlly(s, eagle);
      return true;
    }
    case "02078": {
      const ally = rohanAllies(s).find((u) => u.id === target);
      requireRule(ally, "Discard a Rohan ally you control.");
      discardCharacter(s, ally);
      choose(
        s,
        "Ride to Ruin · Location",
        opts(locations(s), (u) => [
          fx("emynPlayerLocationProgress", { target: u.id, value: 3 }),
        ]),
      );
      return true;
    }
    case "02080":
      s.used.push("phase:gildor-counsel");
      log(
        s,
        "Gildor's Counsel reduces this phase's staging reveal by one, to a minimum of one.",
        "good",
      );
      return true;
    default:
      return false;
  }
}
export function emynPlayerRevealReduction(s: GameState, base: number): number {
  const copies = playerOrder(s).reduce(
    (n, i) =>
      n +
      seatView(s, i).used.filter((key) => key === "phase:gildor-counsel")
        .length,
    0,
  );
  return copies && base > 1 ? Math.max(1, base - copies) : base;
}
export const emynPlayerAbilityLabel = (code: string) =>
  code === "02073"
    ? "Return to hand · discard each deck's top card"
    : code === "02077"
      ? "Exhaust and discard · place 2 progress"
      : code === "02079"
        ? "Look at 3 · exchange and reorder"
        : undefined;
export function emynPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code === "02073" && !anyDeck(s))
    return "At least one player deck must have a top card.";
  if (u.code === "02077" && (u.exhausted || !locations(s).length))
    return "The Riddermark's Finest must be ready and needs a location.";
  if (u.code === "02079" && (u.exhausted || !s.deck.length))
    return "Gildor must be ready and your deck must contain a card.";
  return undefined;
}
export function useEmynPlayerAbility(s: GameState, u: Unit): boolean {
  if (!["02073", "02077", "02079"].includes(u.code)) return false;
  requireRule(
    !emynPlayerAbilityProblem(s, u),
    emynPlayerAbilityProblem(s, u) ?? "",
  );
  if (u.code === "02073") {
    returnAlly(s, u);
    eachSeat(s, () => {
      const code = discardPlayerDeck(s, 1)[0];
      if (code)
        log(
          s,
          `Keen-eyed Took discards ${card(code).name} from the top of the deck.`,
        );
    });
  } else if (u.code === "02077") {
    exhaustCharacter(s, u);
    discardCharacter(s, u);
    choose(
      s,
      "The Riddermark's Finest · Location",
      opts(locations(s), (location) => [
        fx("emynPlayerLocationProgress", { target: location.id, value: 2 }),
      ]),
    );
  } else {
    exhaustCharacter(s, u);
    const count = Math.min(3, s.deck.length);
    choose(
      s,
      "Gildor Inglorion · Top of your deck",
      s.deck.slice(0, count).map((code, index) => ({
        id: `deck-${index}`,
        label: card(code).name,
        code,
        effects: [fx("emynGildorHand", { value: index, count })],
      })),
      "Choose one card to switch with a card from your hand. Then order these cards on top.",
    );
  }
  return true;
}
function gildorOrder(s: GameState, count: number, selected: string[] = []) {
  if (selected.length === count) {
    reorderPlayerDeck(s, 0, selected.map(Number));
    log(
      s,
      "Gildor returns the viewed cards to the top of the deck in the chosen order.",
    );
    return;
  }
  choose(
    s,
    "Gildor Inglorion · Order top cards",
    s.deck.slice(0, count).flatMap((code, index) =>
      selected.includes(String(index))
        ? []
        : [
            {
              id: `order-${index}`,
              label: `${selected.length + 1}. ${card(code).name}`,
              code,
              effects: [
                fx("emynGildorOrder", {
                  count,
                  ids: [...selected, String(index)],
                }),
              ],
            },
          ],
    ),
    "Choose the next card from top to bottom. The rest of your deck stays in place.",
  );
}

export function emynPlayerAllyEntered(s: GameState, u: Unit, _played: boolean) {
  if (u.code === "02073" && anyDeck(s))
    prepend(s, fx("emynTookResponse", { player: ownerOf(s, u) }));
  if (u.code === "02075" && stagingEnemies(s).length)
    prepend(s, fx("emynThorondorResponse", { player: ownerOf(s, u) }));
}
export function emynPlayerLeavesPlay(
  s: GameState,
  u: Unit,
  controller: number,
) {
  if (u.code === "02075" && stagingEnemies(s).length)
    prepend(s, fx("emynThorondorResponse", { player: controller }));
}
export function emynPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  attackerIds: string[],
  engagedPlayer: number | undefined,
) {
  if (engagedPlayer === undefined) return;
  const targets = [
    ...seatView(s, engagedPlayer).heroes,
    ...seatView(s, engagedPlayer).allies,
  ].filter((u) => u.exhausted);
  if (!targets.length) return;
  const brands = attackerIds
    .map((id) => get(s, id))
    .filter(
      (u): u is Unit =>
        !!u &&
        u.code === "02072" &&
        !u.blanked &&
        !isSacked(u) &&
        ownerOf(s, u) !== engagedPlayer,
    );
  prepend(
    s,
    ...brands.map((u) =>
      fx("emynBrandResponse", {
        target: u.id,
        value: engagedPlayer,
        player: ownerOf(s, u),
      }),
    ),
  );
}

export function handleEmynPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "emynPlayerLocationProgress": {
      const location = locations(s).find((u) => u.id === e.target);
      requireRule(location, "Choose an eligible location.");
      progressLocation(s, location, e.value ?? 0);
      return true;
    }
    case "emynTookResponse":
      if (anyDeck(s))
        choose(s, "Keen-eyed Took · Entered play", [
          {
            id: "reveal",
            label: "Reveal every player deck's top card",
            code: "02073",
            effects: [fx("emynTookReveal")],
          },
          skip,
        ]);
      return true;
    case "emynTookReveal": {
      const tops = playerOrder(s).flatMap((player) => {
        const code = seatView(s, player).deck[0];
        if (!code) return [];
        log(
          s,
          `Keen-eyed Took reveals ${card(code).name} from ${seatName(s, player)}'s deck.`,
        );
        return [
          {
            id: `revealed-${player}`,
            label: `${seatName(s, player)} · ${card(code).name}`,
            code,
            effects: [],
          },
        ];
      });
      if (tops.length)
        choose(
          s,
          "Keen-eyed Took · Revealed deck cards",
          tops,
          "All displayed cards have been revealed. Select a card to close this view; each stays on top of its deck.",
        );
      return true;
    }
    case "emynThorondorResponse":
      if (stagingEnemies(s).length)
        choose(
          s,
          "Descendant of Thorondor · Response",
          [
            ...opts(stagingEnemies(s), (u) => [
              fx("damage", { target: u.id, value: 2 }),
            ]),
            skip,
          ],
          "Deal 2 damage to one enemy in the staging area.",
        );
      return true;
    case "emynBrandResponse": {
      const brand = get(s, e.target),
        player = e.value ?? 0;
      if (
        brand?.code !== "02072" ||
        brand.blanked ||
        isSacked(brand) ||
        ownerOf(s, brand) === player
      )
        return true;
      const targets = [
        ...seatView(s, player).heroes,
        ...seatView(s, player).allies,
      ].filter((u) => u.exhausted);
      if (targets.length)
        choose(
          s,
          "Brand son of Bain · Defeated enemy",
          [
            ...opts(targets, (u) => [
              fx("ready", { target: u.id, source: brand.id, code: brand.code }),
            ]),
            skip,
          ],
          "Ready one character controlled by the player engaged with the defeated enemy.",
        );
      return true;
    }
    case "emynGildorHand": {
      requireRule(
        (e.value ?? -1) >= 0 &&
          (e.value ?? Infinity) < (e.count ?? 0) &&
          (e.count ?? Infinity) <= s.deck.length,
        "Choose one of the viewed top cards.",
      );
      if (!movableHand(s).length) {
        gildorOrder(s, e.count!);
        return true;
      }
      choose(
        s,
        "Gildor Inglorion · Card from hand",
        opts(movableHand(s), (hand) => [
          fx("emynGildorSwap", {
            source: hand.id,
            value: e.value,
            count: e.count,
          }),
        ]),
        `Switch a hand card with ${card(s.deck[e.value!]).name}.`,
      );
      return true;
    }
    case "emynGildorSwap": {
      const index = s.hand.findIndex(
          (u) => u.id === e.source && movableHand(s).includes(u),
        ),
        deckIndex = e.value ?? -1;
      requireRule(
        index >= 0 &&
          deckIndex >= 0 &&
          deckIndex < (e.count ?? 0) &&
          (e.count ?? Infinity) <= s.deck.length,
        "The selected cards cannot be switched.",
      );
      const [hand] = s.hand.splice(index, 1),
        physical = takePlayerDeck(s, deckIndex),
        deckCode = physical.code;
      putPlayerDeck(s, hand, deckIndex);
      s.hand.push(physical);
      log(
        s,
        `Gildor exchanges ${card(deckCode).name} with ${card(hand.code).name}.`,
      );
      gildorOrder(s, e.count!);
      return true;
    }
    case "emynGildorOrder":
      requireRule(
        (e.count ?? Infinity) <= s.deck.length &&
          e.ids &&
          new Set(e.ids).size === e.ids.length &&
          e.ids.every((i) => /^\d+$/.test(i) && Number(i) < e.count!),
        "Choose only the original viewed cards, once each.",
      );
      gildorOrder(s, e.count!, e.ids);
      return true;
    default:
      return false;
  }
}
