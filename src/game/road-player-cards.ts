import { choosePlayerResponse } from "./player-ability-triggers";
import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
// Road to Rivendell beyond the shared Dwarf and Rivendell Blade rules.
import { engagedEnemies } from "./considered-engagement";
import { putPlayedEventInVictory } from "./event-resolution";
import { card } from "./cards";
import type { Attachment, Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  opts,
  prepend,
  removeShadowCard,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  addVictoryCard,
  check,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
  spendEvent,
} from "./board";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { isSacked } from "./carrock";
import {
  activeSeat,
  attachmentController,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  syncSeat,
} from "./table";
const readyOwn = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => !u.exhausted && !khazadCannotExhaust(u),
  );
const stagingEnemies = (s: GameState) =>
  s.staging.filter(
    (u) => card(u.code).type_code === "enemy" && !playerCardImmune(u),
  );
const spiritPayers = (s: GameState) =>
  s.heroes.filter(
    (u) =>
      u.resources > 0 &&
      heirsCanSpendResources(s, u) &&
      hasResourceIcon(u, "spirit"),
  );
const riderUsed = (s: GameState, u: Unit) =>
  playerOrder(s).some((i) =>
    seatView(s, i).used.includes(`round:rider:${u.id}`),
  );
const searchEligible = (code: string) =>
  !["objective", "objective-ally", "objective-hero", "ship-objective"].includes(
    card(code).type_code,
  ) && !(card(code).victory ?? 0);

export function roadPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "04032" && (!readyOwn(s).length || !stagingEnemies(s).length))
    return "Hail of Stones needs ready characters you control and a staging enemy.";
  if (code === "04036" && !s.encounterDeck.length)
    return "Out of the Wild needs an encounter deck card to search.";
  if (code === "04037")
    return "The End Comes responds to a Dwarf character leaving play; use its response window.";
  return null;
}
export function roadPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  return code === "04032" ? stagingEnemies(s) : null;
}
export function roadPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["04032", "04036"].includes(code)) return false;
  requireRule(
    !roadPlayerPlayProblem(s, code),
    roadPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "04032") {
    const enemy = stagingEnemies(s).find((u) => u.id === target);
    requireRule(enemy, "Choose an enemy in the staging area.");
    hailSelection(s, enemy.id, []);
  } else {
    const top = s.encounterDeck.slice(0, 5),
      options = top.flatMap((code, index) =>
        searchEligible(code)
          ? [
              {
                id: `encounter-${index}`,
                label: card(code).name,
                code,
                effects: [fx("roadWildRemove", { value: index, ids: top })],
              },
            ]
          : [],
      );
    // Searches permit declining a find; the searched boundary is nevertheless shuffled.
    choose(
      s,
      "Out of the Wild · Search top 5 encounter cards",
      [
        ...options,
        {
          id: "none",
          label: "Find no card",
          effects: [fx("roadWildFinish")],
        },
      ],
      "Find one non-objective card with no victory points. Shuffle the whole encounter deck.",
    );
  }
  return true;
}
function hailSelection(s: GameState, enemy: string, selected: string[]) {
  const ready = readyOwn(s).filter((u) => !selected.includes(u.id));
  choose(
    s,
    "Hail of Stones · Exhaust characters",
    [
      ...opts(ready, (u) => [
        fx("roadHailSelect", { target: enemy, ids: [...selected, u.id] }),
      ]),
      ...(selected.length
        ? [
            {
              id: "exhaust",
              label: `Exhaust ${selected.length} · deal ${selected.length} damage`,
              effects: [
                fx("roadHailResolve", { target: enemy, ids: selected }),
              ],
            },
          ]
        : []),
    ],
    "Select ready characters you control; exhaust all selected characters to resolve the event.",
  );
}
export function roadPlayerAttackerDeclared(s: GameState, u: Unit) {
  if (
    u.code === "04028" &&
    !u.blanked &&
    !isSacked(u) &&
    u.resources > 0 &&
    heirsCanSpendResources(s, u) &&
    u.exhausted
  )
    prepend(
      s,
      fx("roadElladanResponse", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function roadPlayerAttachmentEntered(
  s: GameState,
  host: Unit,
  a: Attachment,
) {
  if (a.code === "04034" && !a.blanked && !a.facedown)
    prepend(
      s,
      fx("roadEarendilEnter", {
        source: host.id,
        target: a.id,
        player: attachmentController(s, host, a) ?? ownerOf(s, host),
      }),
    );
}
export function roadPlayerThreatRaised(
  s: GameState,
  player: number,
  amount: number,
) {
  if (amount <= 0) return;
  prepend(
    s,
    ...allHeroes(s).flatMap((host) =>
      host.attachments
        .filter(
          (a) =>
            a.code === "04034" &&
            !a.blanked &&
            !a.facedown &&
            (attachmentController(s, host, a) ?? ownerOf(s, host)) !== player,
        )
        .map((a) =>
          fx("roadEarendilResponse", {
            source: host.id,
            target: a.id,
            value: player,
            player: attachmentController(s, host, a) ?? ownerOf(s, host),
          }),
        ),
    ),
  );
}
export function roadPlayerLeavesPlay(
  s: GameState,
  u: Unit,
  _controller: number,
) {
  if (
    !hasTrait(u, "Dwarf") ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code) ||
    !s.encounterDiscard.length
  )
    return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((c) => c.code === "04037") && canPay(p, card("04037"))
        );
      })
      .map((player) => fx("roadEndComesResponse", { player })),
  );
}
export const roadPlayerAbilityLabel = (code: string) =>
  code === "04033"
    ? "Pay 1 Spirit · give control to another player"
    : undefined;
export function roadPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (
    u.code === "04033" &&
    (playerOrder(s).length < 2 || !spiritPayers(s).length || riderUsed(s, u))
  )
    return "Rider of the Mark needs another player, a Spirit resource and its unused round limit.";
  return undefined;
}
export function useRoadPlayerAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "04033") return false;
  requireRule(
    !roadPlayerAbilityProblem(s, u),
    roadPlayerAbilityProblem(s, u) ?? "",
  );
  choose(
    s,
    "Rider of the Mark · Pay Spirit resource",
    opts(spiritPayers(s), (payer) => [
      fx("roadRiderPlayer", { source: u.id, target: payer.id }),
    ]),
  );
  return true;
}
function wildFinish(s: GameState) {
  shuffle(s, s.encounterDeck);
  putPlayedEventInVictory(s, "04036");
}
export function handleRoadPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "roadHailSelect": {
      requireRule(
        e.ids &&
          new Set(e.ids).size === e.ids.length &&
          e.ids.every((id) => readyOwn(s).some((u) => u.id === id)),
        "Select only ready characters you control.",
      );
      hailSelection(s, e.target!, e.ids);
      return true;
    }
    case "roadHailResolve": {
      const enemy = stagingEnemies(s).find((u) => u.id === e.target),
        chars = (e.ids ?? []).map((id) => readyOwn(s).find((u) => u.id === id));
      requireRule(
        enemy &&
          chars.length &&
          chars.every(Boolean) &&
          new Set(e.ids).size === chars.length,
        "Pay Hail of Stones with ready controlled characters.",
      );
      for (const u of chars) exhaustCharacter(s, u!);
      prepend(s, fx("damage", { target: enemy.id, value: chars.length }));
      return true;
    }
    case "roadWildRemove": {
      const index = e.value ?? -1;
      requireRule(
        e.ids &&
          index >= 0 &&
          index < e.ids.length &&
          e.ids.every((code, i) => s.encounterDeck[i] === code) &&
          searchEligible(s.encounterDeck[index]),
        "Choose a non-objective worth no victory points from the original top five.",
      );
      addVictoryCard(s, s.encounterDeck.splice(index, 1)[0]);
      wildFinish(s);
      return true;
    }
    case "roadWildFinish":
      wildFinish(s);
      return true;
    case "roadElladanResponse": {
      const hero = get(s, e.target);
      if (
        hero?.code === "04028" &&
        !hero.blanked &&
        !isSacked(hero) &&
        hero.resources > 0 &&
        heirsCanSpendResources(s, hero) &&
        hero.exhausted
      )
        choosePlayerResponse(
          s,
          hero.id,
          hero.code,
          "Elladan · Declared attacker",
          [
            {
              id: "ready",
              label: "Spend Elladan's resource to ready him",
              code: hero.code,
              effects: [fx("roadElladanReady", { target: hero.id })],
            },
            skip,
          ],
        );
      return true;
    }
    case "roadElladanReady": {
      const hero = get(s, e.target);
      requireRule(
        hero?.code === "04028" &&
          !hero.blanked &&
          !isSacked(hero) &&
          hero.resources > 0 &&
          heirsCanSpendResources(s, hero) &&
          hero.exhausted,
        "Elladan cannot pay his attacker response.",
      );
      spendResources(s, hero, 1);
      readyCharacter(s, hero);
      return true;
    }
    case "roadRiderPlayer": {
      const rider = s.allies.find((u) => u.id === e.source),
        payer = spiritPayers(s).find((u) => u.id === e.target);
      requireRule(
        rider?.code === "04033" && payer && !riderUsed(s, rider),
        "Rider of the Mark cannot pay this action.",
      );
      choose(
        s,
        "Rider of the Mark · New controller",
        playerOrder(s)
          .filter((i) => i !== activeSeat(s))
          .map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [{ ...e, kind: "roadRiderTransfer", value: player }],
          })),
      );
      return true;
    }
    case "roadRiderTransfer": {
      const rider = s.allies.find((u) => u.id === e.source),
        payer = spiritPayers(s).find((u) => u.id === e.target),
        player = e.value ?? -1;
      requireRule(
        rider?.code === "04033" &&
          payer &&
          !riderUsed(s, rider) &&
          playerOrder(s).includes(player) &&
          player !== activeSeat(s),
        "Choose another living player.",
      );
      spendResources(s, payer, 1);
      s.allies = s.allies.filter((u) => u.id !== rider.id);
      syncSeat(s);
      forOwner(s, player, () => s.allies.push(rider));
      for (const p of playerOrder(s))
        seatView(s, p).used.push(`round:rider:${rider.id}`);
      prepend(s, fx("roadRiderResponse", { source: rider.id, player }));
      return true;
    }
    case "roadRiderResponse": {
      const rider = get(s, e.source);
      if (rider?.code === "04033" && ownerOf(s, rider) === activeSeat(s)) {
        const options = engagedEnemies(s).flatMap((enemy) =>
          enemy.shadows.map((_code, index) => ({
            id: `${enemy.id}-shadow-${index}`,
            label: `${card(enemy.code).name} · shadow ${index + 1}`,
            effects: [
              fx("roadRiderShadow", { target: enemy.id, value: index }),
            ],
          })),
        );
        if (options.length)
          choosePlayerResponse(
            s,
            rider.id,
            rider.code,
            "Rider of the Mark · Control changed",
            [...options, skip],
          );
      }
      return true;
    }
    case "roadRiderShadow": {
      const enemy = engagedEnemies(s).find((u) => u.id === e.target);
      requireRule(
        enemy && enemy.shadows[e.value ?? -1],
        "Choose a dealt shadow on an enemy engaged with you.",
      );
      const code = removeShadowCard(enemy, e.value!);
      if (code) s.encounterDiscard.push(code);
      return true;
    }
    case "roadEarendilEnter": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) =>
            a.id === e.target &&
            a.code === "04034" &&
            !a.blanked &&
            !a.facedown,
        );
      if (a)
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Song of Eärendil · Entered play",
          [
            {
              id: "draw",
              label: "Draw 1 card",
              code: a.code,
              effects: [fx("draw", { value: 1 })],
            },
            skip,
          ],
        );
      return true;
    }
    case "roadEarendilResponse": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) =>
            a.id === e.target &&
            a.code === "04034" &&
            !a.blanked &&
            !a.facedown,
        ),
        other = e.value ?? -1;
      if (
        a &&
        other !== activeSeat(s) &&
        playerOrder(s).includes(other) &&
        seatView(s, other).threat > 0
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Song of Eärendil · Another player's threat",
          [
            {
              id: "reduce",
              label: `Raise your threat by 1 · lower ${seatName(s, other)} by 1`,
              code: a.code,
              effects: [{ ...e, kind: "roadEarendilReduce" }],
            },
            skip,
          ],
        );
      return true;
    }
    case "roadEarendilReduce": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) =>
            a.id === e.target &&
            a.code === "04034" &&
            !a.blanked &&
            !a.facedown,
        ),
        other = e.value ?? -1;
      requireRule(
        a && other !== activeSeat(s) && playerOrder(s).includes(other),
        "Song of Eärendil cannot resolve for that player.",
      );
      const payer = activeSeat(s);
      raiseThreat(s, 1, "cost");
      check(s);
      if (s.status !== "playing" || s.table?.seats[payer].eliminated)
        return true;
      forOwner(s, other, () => {
        reduceThreat(s, 1, { id: a.id, code: a.code, owner: a.owner ?? payer });
      });
      return true;
    }
    case "roadEndComesResponse":
      if (
        s.encounterDiscard.length &&
        s.hand.some((u) => u.code === "04037") &&
        canPay(s, card("04037"))
      )
        choosePlayerResponse(
          s,
          s.hand.find((u) => u.code === "04037")!.id,
          "04037",
          "The End Comes · Dwarf left play",
          [
            {
              id: "play",
              label: "Shuffle encounter discard into the encounter deck",
              code: "04037",
              effects: [fx("roadEndComesShuffle")],
            },
            skip,
          ],
        );
      return true;
    case "roadEndComesShuffle":
      requireRule(s.encounterDiscard.length, "The encounter discard is empty.");
      if (!spendEvent(s, "04037")) return true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      return true;
    default:
      return false;
  }
}
