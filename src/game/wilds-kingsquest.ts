import type { Effect, GameState, Unit } from "./types";
import { card } from "./cards";
import { choose, fx, get, make, prepend, shuffle } from "./core";
import { questDefeated, win, enemyAddedToStaging } from "./board";
import { firstPlayer, forOwner, playerOrder, seatView } from "./table";
import { WILDS_RHOVANION as W } from "./wilds-rhovanion-support";
import {
  wildsKings,
  wildsEnemies,
  wildsTrait,
  wildsTakeAside,
  wildsDiscardUntil,
  wildsAdd,
  wildsShuffleDiscard,
  wildsOwn,
  wildsDetachUnit,
} from "./wilds-rhovanion-helpers";
const victoryLocations = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => card(c).type_code === "location").length;
const scoredVictoryLocations = (s: GameState) =>
  (s.victoryCards ?? []).filter(
    (c) => card(c).type_code === "location" && (card(c).victory ?? 0) > 0,
  ).length;
export function wildsKingsAdvance(s: GameState) {
  if (!wildsKings(s)) return false;
  const q = s.wildsRhovanion!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (s.stage !== 1 || scoredVictoryLocations(s) < 3) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  q.advancing = true;
  prepend(s, fx("wildsKingsAdvance", { player: firstPlayer(s) }));
  return true;
}
export function wildsKingsBeginQuest(s: GameState) {
  if (wildsKings(s) && s.stage === 1)
    prepend(s, fx("wildsKingsFindLocation", { player: firstPlayer(s) }));
}
export function wildsKingsQuestProgressPlaced(
  s: GameState,
  amount: number,
  fromQuesting = true,
) {
  if (
    !wildsKings(s) ||
    s.stage !== 2 ||
    !fromQuesting ||
    amount <= 0 ||
    s.progress < 5 ||
    s.wildsRhovanion!.cavesDeck.length < 2
  )
    return;
  prepend(s, fx("wildsKingsLowerResponse", { player: firstPlayer(s) }));
}
export function wildsKingsTravelProblem(s: GameState, u: Unit) {
  if (!wildsKings(s) || s.activeLocation) return;
  const chasm = s.staging.find((l) => l.code === W.chasm && !l.blanked);
  if (chasm && u.id !== chasm.id)
    return "The players must travel to Deep Chasm while there is no active location.";
}
export const wildsKingsMustTravel = (s: GameState) =>
  wildsKings(s) &&
  !s.activeLocation &&
  s.staging.some((l) => l.code === W.chasm && !l.blanked);
export function wildsKingsTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!wildsKings(s) || u.blanked) return;
  if (u.code === W.mine)
    return playerOrder(s).map((player) => fx("wildsKingsMineCost", { player }));
}
export function wildsKingsTravelEntered(s: GameState, u: Unit, actual = true) {
  if (!wildsKings(s) || u.blanked) return;
  const q = s.wildsRhovanion!,
    effects: Effect[] = [];
  if (u.code === W.cavern)
    effects.push(
      ...playerOrder(s).map((player) =>
        fx("wildsRhovanionAssignDamage", {
          player,
          value: wildsOwn(s, player).length,
        }),
      ),
    );
  if (u.code === W.den)
    effects.push(fx("wildsKingsDen", { player: firstPlayer(s) }));
  if (
    [W.armory, W.treasury].includes(u.code) &&
    !q.usedResponses.includes(u.code)
  )
    effects.push(
      fx("wildsKingsLocationResponse", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (u.code === W.hoard && s.stage === 2) {
    q.advancing = true;
    effects.push(fx("wildsKingsAdvance", { player: firstPlayer(s) }));
  }
  if (u.code === W.hoard)
    effects.push(
      fx("wildsKingsHoardResponse", { target: u.id, player: firstPlayer(s) }),
    );
  if (actual && u.code === W.contested)
    effects.push(
      fx("wildsKingsContested", { target: u.id, player: firstPlayer(s) }),
    );
  if (
    actual &&
    s.stage !== 3 &&
    [W.chasm, W.tunnel, W.fork].includes(u.code) &&
    q.cavesDeck.length
  ) {
    if (u.code === W.fork)
      effects.push(
        fx("wildsKingsForkResponse", { target: u.id, player: firstPlayer(s) }),
      );
    effects.push(
      fx("wildsKingsDeep", { target: u.id, player: firstPlayer(s) }),
    );
  }
  prepend(s, ...effects);
}
export function wildsKingsExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (!wildsKings(s)) return;
  if (u.code === W.mine && !u.blanked && wasActive)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("wildsKingsMineResponse", { player }),
      ),
    );
  const drake = wildsEnemies(s).find((e) => e.code === W.drake && !e.blanked);
  if (drake && wasActive)
    prepend(
      s,
      fx("wildsKingsDrakeStaging", { target: drake.id }),
      ...playerOrder(s).map((player) =>
        fx("immediateAttack", { target: drake.id, player }),
      ),
    );
}
export function wildsKingsEnemyLeaves(
  s: GameState,
  u: Unit,
  destruction = true,
) {
  if (wildsKings(s) && u.code === W.drake && s.stage === 3 && destruction) {
    win(s);
    s.reason =
      "The Fire-drake is defeated, securing a new home for the Haradrim in Dale.";
  }
}
export function wildsKingsAttackDeclared(
  s: GameState,
  u: Unit,
  attackers: Unit[] | string[],
) {
  if (!wildsKings(s) || s.stage !== 3 || u.code !== W.drake) return true;
  const n = attackers.length;
  if (s.progress < n) return false;
  s.progress -= n;
  return true;
}
function reorder(s: GameState) {
  const q = s.wildsRhovanion!;
  if (q.cavesDeck.length < 2) return;
  const top = q.cavesDeck.slice(0, 2);
  choose(
    s,
    "Caves deck · Choose the card to leave on top",
    top.map((u, i) => ({
      id: u.id,
      code: u.code,
      label: `Keep ${card(u.code).name} on top`,
      effects: [fx("wildsKingsReorder", { value: i })],
    })),
  );
}
function replace(s: GameState, id: string, discard = true) {
  const q = s.wildsRhovanion!,
    old = s.activeLocation;
  if (!q.cavesDeck.length) return;
  if (old?.id === id) {
    s.activeLocation = null;
    if (discard) s.encounterDiscard.push(old.code);
  }
  const next = q.cavesDeck.shift()!;
  s.activeLocation = next;
  wildsKingsTravelEntered(s, next, false);
}
export function wildsKingsEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("wildsKings")) return false;
  const q = s.wildsRhovanion;
  if (!q) return true;
  const player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "wildsKingsSetup":
      for (const _p of playerOrder(s)) {
        const code = wildsDiscardUntil(s, (c) =>
          ["enemy", "location"].includes(card(c).type_code),
        );
        if (code) wildsAdd(s, code);
      }
      q.initialized = true;
      break;
    case "wildsKingsAdvance":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("wildsKingsReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "wildsKingsReveal": {
      if (s.stage === 2) {
        const hoard = wildsTakeAside(s, W.hoard);
        if (hoard) q.cavesDeck.push(hoard);
        const drake = wildsTakeAside(s, W.drake);
        if (drake) {
          s.staging.push(drake);
          enemyAddedToStaging(s, drake);
        }
        const dragon = q.setAside.filter((u) =>
          [W.scales, W.breath].includes(u.code),
        );
        q.setAside = q.setAside.filter((u) => !dragon.includes(u));
        s.encounterDeck = shuffle(s, [
          ...s.encounterDeck,
          ...dragon.map((u) => u.code),
        ]);
      }
      if (s.stage === 3)
        prepend(s, fx("wildsKingsDragonSearch", { player: firstPlayer(s) }));
      break;
    }
    case "wildsKingsFindLocation": {
      const code = wildsDiscardUntil(
        s,
        (c) => card(c).type_code === "location",
      );
      if (code) {
        q.resolving.push(code);
        choose(s, "The Iron Hills · Add the location or raise threat", [
          {
            id: "add",
            code,
            label: `Add ${card(code).name} to staging`,
            effects: [fx("wildsKingsFound", { code, flag: true })],
          },
          {
            id: "threat",
            label: `Raise each player's threat by ${card(code).threat ?? 0}`,
            effects: [
              fx("wildsKingsFound", { code }),
              ...playerOrder(s).map((player) =>
                fx("threat", { player, value: card(code).threat ?? 0 }),
              ),
            ],
          },
        ]);
      }
      break;
    }
    case "wildsKingsFound": {
      const i = q.resolving.indexOf(e.code!);
      if (i >= 0) {
        const code = q.resolving.splice(i, 1)[0];
        if (e.flag) wildsAdd(s, code);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "wildsKingsDeep":
      replace(s, e.target!, s.activeLocation?.id === e.target);
      break;
    case "wildsKingsForkResponse":
      choose(s, "Forked Passage · Look at the Caves deck?", [
        {
          id: "use",
          label:
            "Raise each player's threat by 2; choose the next cave; add Forked Passage to victory",
          effects: [
            ...playerOrder(s).map((player) =>
              fx("threat", { player, value: 2 }),
            ),
            fx("wildsKingsForkUse", { target: e.target }),
          ],
        },
        { id: "skip", label: "Continue into the caves", effects: [] },
      ]);
      break;
    case "wildsKingsForkUse":
      if (u) {
        if (s.activeLocation?.id === u.id) s.activeLocation = null;
        s.victoryCards ??= [];
        s.victoryCards.push(u.code);
        s.victory += card(u.code).victory ?? 0;
      }
      reorder(s);
      break;
    case "wildsKingsLowerResponse":
      if (s.progress >= 5 && q.cavesDeck.length >= 2)
        choose(
          s,
          "The Lower Depths · Spend 5 progress to look at the Caves deck?",
          [
            {
              id: "use",
              label: "Remove 5 progress and order the next two caves",
              effects: [fx("wildsKingsLowerUse")],
            },
            { id: "skip", label: "Keep the progress", effects: [] },
          ],
        );
      break;
    case "wildsKingsLowerUse":
      if (s.progress >= 5) {
        s.progress -= 5;
        reorder(s);
      }
      break;
    case "wildsKingsReorder": {
      const i = e.value ?? 0;
      if (i < 2 && q.cavesDeck.length >= 2) {
        const pair = q.cavesDeck.splice(0, 2);
        q.cavesDeck.unshift(pair[i]);
        q.cavesDeck.push(pair[1 - i]);
      }
      break;
    }
    case "wildsKingsContested":
      if (u)
        choose(s, "Contested Depths · Raise threat or enter a cave", [
          {
            id: "threat",
            label: `Raise each player's threat by ${victoryLocations(s)}`,
            effects: playerOrder(s).map((player) =>
              fx("threat", { player, value: victoryLocations(s) }),
            ),
          },
          ...(q.cavesDeck.length
            ? [
                {
                  id: "replace",
                  label:
                    "Discard Contested Depths and replace it with the next cave",
                  effects: [fx("wildsKingsDeep", { target: u.id })],
                },
              ]
            : []),
        ]);
      break;
    case "wildsKingsMineCost":
      forOwner(s, player, () => {
        s.discard.push(...s.deck.splice(0, 4));
      });
      break;
    case "wildsKingsMineResponse": {
      const pile = seatView(s, player).discard;
      if (pile.length)
        choose(s, "Iron Hills Mine · Return a card from your discard pile?", [
          ...pile.map((code, i) => ({
            id: String(i),
            code,
            label: card(code).name,
            effects: [
              fx("wildsKingsReturnDiscard", { player, value: i, code }),
            ],
          })),
          { id: "skip", label: "Decline", effects: [] },
        ]);
      break;
    }
    case "wildsKingsReturnDiscard":
      forOwner(s, player, () => {
        if (s.discard[e.value!] === e.code)
          s.hand.push(make(s, s.discard.splice(e.value!, 1)[0]));
      });
      break;
    case "wildsKingsDen":
      wildsShuffleDiscard(s);
      for (const _p of playerOrder(s)) {
        const code = wildsDiscardUntil(s, (c) => card(c).type_code === "enemy");
        if (code) wildsAdd(s, code);
      }
      break;
    case "wildsKingsLocationResponse":
      if (!q.usedResponses.includes(e.code!))
        choose(s, `${card(e.code!).name} · Use the group response?`, [
          {
            id: "use",
            label:
              e.code === W.armory
                ? "Each player may search for a Weapon or Armor"
                : "Each player may reduce threat, draw cards, or gain a resource",
            effects: [fx("wildsKingsLocationUse", { code: e.code })],
          },
          { id: "skip", label: "Decline", effects: [] },
        ]);
      break;
    case "wildsKingsLocationUse":
      q.usedResponses.push(e.code!);
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx(e.code === W.armory ? "wildsKingsArmory" : "wildsKingsTreasury", {
            player,
          }),
        ),
      );
      break;
    case "wildsKingsArmory": {
      const deck = seatView(s, player).deck;
      const options = deck.flatMap((code, i) =>
        card(code).type_code === "attachment" &&
        /\b(Weapon|Armor)\./.test(card(code).traits ?? "")
          ? [
              {
                id: String(i),
                code,
                label: card(code).name,
                effects: [
                  fx("wildsKingsSearchTake", { player, code, value: i }),
                ],
              },
            ]
          : [],
      );
      choose(s, "Lost Armory · Search your deck", [
        ...options,
        {
          id: "skip",
          label: "Decline",
          effects: [fx("wildsKingsSearchShuffle", { player })],
        },
      ]);
      break;
    }
    case "wildsKingsSearchTake":
      forOwner(s, player, () => {
        if (s.deck[e.value!] === e.code)
          s.hand.push(make(s, s.deck.splice(e.value!, 1)[0]));
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "wildsKingsSearchShuffle":
      forOwner(s, player, () => {
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "wildsKingsTreasury":
      choose(s, "Ancient Treasury · Choose a benefit", [
        {
          id: "threat",
          label: "Reduce your threat by 3",
          effects: [fx("threat", { player, value: -3 })],
        },
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { player, value: 2 })],
        },
        ...seatView(s, player).heroes.map((hero) => ({
          id: hero.id,
          code: hero.code,
          label: `Add 1 resource to ${card(hero.code).name}`,
          effects: [fx("resource", { target: hero.id, value: 1, player })],
        })),
        { id: "skip", label: "Decline", effects: [] },
      ]);
      break;
    case "wildsKingsDrakeStaging":
      if (u) {
        wildsDetachUnit(s, u);
        s.staging.push(u);
      }
      break;
    case "wildsKingsDragonSearch": {
      const drake = wildsEnemies(s).find((u) => u.code === W.drake);
      const options = (["deck", "discard"] as const).flatMap((zone) =>
        (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
          (code, i) =>
            [W.scales, W.breath].includes(code) &&
            !drake?.attachments.some((a) => a.code === code)
              ? [
                  {
                    id: `${zone}:${i}`,
                    code,
                    label: `Attach ${card(code).name} from encounter ${zone}`,
                    effects: [
                      fx("wildsKingsDragonTake", {
                        code,
                        text: zone,
                        value: i,
                        target: drake?.id,
                      }),
                    ],
                  },
                ]
              : [],
        ),
      );
      if (options.length)
        choose(s, "The Fire Worm · Find a Dragon treachery", options);
      else s.encounterDeck = shuffle(s, s.encounterDeck);
      break;
    }
    case "wildsKingsDragonTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      if (u && pile[e.value!] === e.code) {
        const code = pile.splice(e.value!, 1)[0],
          a = make(s, code);
        u.attachments.push({ id: a.id, code, exhausted: false });
      }
      s.encounterDeck = shuffle(s, s.encounterDeck);
      break;
    }
    case "wildsKingsHoardResponse": {
      const options = playerOrder(s).flatMap((p) =>
        seatView(s, p)
          .hand.filter(
            (c) =>
              card(c.code).type_code === "attachment" &&
              wildsTrait(c, "Artifact"),
          )
          .map((c) => ({
            id: c.id,
            code: c.code,
            label: `Guard ${card(c.code).name} with Dragon Hoard`,
            effects: [
              fx("wildsKingsHoardAttach", {
                player: p,
                source: c.id,
                target: e.target,
              }),
            ],
          })),
      );
      if (options.length)
        choose(s, "Dragon Hoard · Guard an Artifact from a player's hand?", [
          ...options,
          { id: "skip", label: "Decline", effects: [] },
        ]);
      break;
    }
    case "wildsKingsHoardAttach":
      if (u)
        forOwner(s, player, () => {
          const i = s.hand.findIndex((c) => c.id === e.source);
          if (i >= 0) {
            q.guardedPlayerCards.push({
              guardId: u.id,
              player,
              card: s.hand.splice(i, 1)[0],
            });
          }
        });
      break;
  }
  return true;
}
