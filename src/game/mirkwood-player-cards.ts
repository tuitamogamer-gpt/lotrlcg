import {
  choosePlayerResponse,
  responseOptions,
} from "./player-ability-triggers";
import { playerCardImmune } from "./card-immunity";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
import { stewardFearTravelEntered } from "./steward-fear";
// Exact active/triggered Return to Mirkwood player rules; Dáin reuses dwarfStats.
import { engagedEnemies } from "./considered-engagement";
import { card } from "./cards";
import { redhornCanMakeActive } from "./redhorn-gate";
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
  stats,
} from "./core";
import { spendEvent } from "./board";
import { returnPlayedEventToHand } from "./event-resolution";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { consumeLeaveCard, leaveCardAvailable } from "./leave-consumption";
import {
  firstPlayer,
  activeSeat,
  allActiveLocations,
  allCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";

export interface LeaveDestination {
  zone: "discard" | "hand" | "deck" | "removed";
  player: number;
  id?: string;
  index?: number;
}
const affected = (u: Unit) => !playerCardImmune(u);
const locations = (s: GameState) =>
  s.staging.filter(
    (u) =>
      card(u.code).type_code === "location" &&
      affected(u) &&
      redhornCanMakeActive(u),
  );
const activeLocations = (s: GameState) =>
  allActiveLocations(s).filter(affected);
const eagles = (s: GameState) =>
  allCharacters(s).filter(
    (u) => card(u.code).type_code === "ally" && hasTrait(u, "Eagle"),
  );
const collectors = (s: GameState, player?: number) =>
  allCharacters(s).filter(
    (u) =>
      u.code === "02119" && (player === undefined || ownerOf(s, u) === player),
  );
const facedownShadows = (s: GameState) =>
  [
    ...new Map(
      playerOrder(s)
        .flatMap((player) => engagedEnemies(s, player))
        .map((u) => [u.id, u]),
    ).values(),
  ].flatMap((u) => u.shadows.slice(u.revealedShadowCount ?? 0));
const attackResolved = (s: GameState) =>
  playerOrder(s).some((i) =>
    seatView(s, i).used.includes("phase:attack-resolved"),
  );
const dawnLegal = (s: GameState) =>
  ["defense", "attack"].includes(s.phase) &&
  !attackResolved(s) &&
  facedownShadows(s).length > 0;
const lorePayers = (s: GameState) =>
  s.heroes.filter(
    (u) =>
      hasResourceIcon(u, "lore") &&
      u.resources > 0 &&
      heirsCanSpendResources(s, u),
  );

export function mirkwoodPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "02118" && !dawnLegal(s))
    return "Dawn Take You All requires dealt face-down shadows before any attack has resolved.";
  if (code === "02122" && !allCharacters(s).some((u) => hasTrait(u, "Rohan")))
    return "Astonishing Speed requires a Rohan character in play.";
  if (code === "02124" && !s.encounterDeck.length)
    return "Rumour from the Earth needs a top encounter card to look at.";
  if (code === "02125" && !s.encounterDiscard.length)
    return "Shadow of the Past requires the top encounter discard.";
  return null;
}
export function mirkwoodPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "02120")
    return allCharacters(s).filter(
      (u) => card(u.code).type_code === "hero" && hasResourceIcon(u, "tactics"),
    );
  return null;
}
export function mirkwoodPlayerEventEffect(s: GameState, code: string): boolean {
  if (!["02118", "02122", "02124", "02125"].includes(code)) return false;
  requireRule(
    !mirkwoodPlayerPlayProblem(s, code),
    mirkwoodPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "02118")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("mirkwoodDawnChoice", { player })),
    );
  if (code === "02122") {
    for (const u of allCharacters(s).filter((u) => hasTrait(u, "Rohan")))
      u.tempWill = (u.tempWill ?? 0) + 2;
    log(
      s,
      "Astonishing Speed grants all Rohan characters +2 willpower until this phase ends.",
      "good",
    );
  }
  if (code === "02124") {
    const top = s.encounterDeck[0],
      index = s.discard.lastIndexOf(code),
      resolving = [...(s.resolvingEvents ?? [])]
        .reverse()
        .find(
          (event) => event.player === activeSeat(s) && event.unit.code === code,
        );
    const payers = resolving || !dikeCannotLeaveDiscard(s) ? lorePayers(s) : [];
    choose(
      s,
      "Rumour from the Earth · Look at top encounter card",
      [
        {
          id: "leave",
          label: `Leave Rumour in discard · ${card(top).name}`,
          code: top,
          effects: [],
        },
        ...payers.map((u) => ({
          id: u.id,
          label: `Pay 1 Lore from ${card(u.code).name} · return Rumour to hand`,
          code: top,
          effects: [
            fx("mirkwoodRumourReturn", {
              target: u.id,
              value: index,
              source: resolving?.unit.id,
            }),
          ],
        })),
      ],
      "Look only: the encounter card remains on top and is not revealed.",
    );
  }
  if (code === "02125") {
    const top = s.encounterDiscard.pop()!;
    s.encounterDeck.unshift(top);
    log(
      s,
      `Shadow of the Past places ${card(top).name} on top of the encounter deck.`,
      "good",
    );
  }
  return true;
}
export const mirkwoodPlayerAbilityLabel = (code: string) =>
  code === "02120"
    ? "Exhaust · gain an Eagle ally's attack or defense"
    : undefined;
export function mirkwoodPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  const a = u.attachments.find(
    (a) => a.id === attachmentId && a.code === "02120",
  );
  if (!a) return undefined;
  if (a.blanked || a.facedown) return "This attachment's text is inactive.";
  if (a.exhausted) return "Support of the Eagles must be ready.";
  if (!eagles(s).length)
    return "Support of the Eagles requires an Eagle ally in play.";
  return undefined;
}
export function useMirkwoodPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find(
    (a) => a.id === attachmentId && a.code === "02120",
  );
  if (!a) return false;
  requireRule(
    !mirkwoodPlayerAbilityProblem(s, u, attachmentId),
    mirkwoodPlayerAbilityProblem(s, u, attachmentId) ?? "",
  );
  choose(
    s,
    "Support of the Eagles · Choose an Eagle ally",
    opts(eagles(s), (eagle) => [
      fx("mirkwoodSupportStat", { target: u.id, source: eagle.id, text: a.id }),
    ]),
  );
  return true;
}
export function mirkwoodPlayerStats(_s: GameState, u: Unit) {
  const feathers =
    u.code === "02119" ? u.attachments.filter((a) => a.facedown).length : 0;
  return { will: 0, attack: feathers, defense: feathers };
}
export function mirkwoodPlayerAttackDefense(
  s: GameState,
  enemy: Unit,
  attackerIds: string[],
): number {
  return attackerIds.length === 1 && get(s, attackerIds[0])?.code === "02123"
    ? 0
    : stats(s, enemy).defense;
}
export function mirkwoodPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
) {
  if (
    u.code === "02121" &&
    played &&
    activeLocations(s).length &&
    locations(s).length
  )
    prepend(s, fx("mirkwoodTravellerResponse", { player: ownerOf(s, u) }));
}
export function mirkwoodPlayerLeavesPlay(
  s: GameState,
  u: Unit,
  _controller: number,
  destination: LeaveDestination,
) {
  if (
    !hasTrait(u, "Eagle") ||
    !["ally", "hero", "objective-ally"].includes(card(u.code).type_code) ||
    !collectors(s).length
  )
    return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => collectors(s, player).length)
      .map((player) =>
        fx("mirkwoodEagleResponse", {
          player,
          owner: destination.player,
          source: u.id,
          code: u.code,
          text: destination.zone,
          target: destination.id,
          value: destination.index,
        }),
      ),
  );
}
export function mirkwoodPlayerCombatWindow(s: GameState) {
  if (dawnLegal(s))
    prepend(
      s,
      ...playerOrder(s)
        .filter((player) => {
          const p = seatView(s, player);
          return (
            p.hand.some((u) => u.code === "02118") && canPay(p, card("02118"))
          );
        })
        .map((player) => fx("mirkwoodDawnWindow", { player })),
    );
}
function dawnOptions(s: GameState) {
  return engagedEnemies(s).flatMap((enemy) =>
    enemy.shadows.flatMap((code, index) =>
      index < (enemy.revealedShadowCount ?? 0)
        ? []
        : [
            {
              id: `${enemy.id}-shadow-${index}`,
              label: `${card(enemy.code).name} · face-down shadow ${index + 1}`,
              effects: [
                fx("mirkwoodDawnDiscard", {
                  target: enemy.id,
                  value: index,
                  code,
                }),
              ],
            },
          ],
    ),
  );
}
function sourceAvailable(s: GameState, e: Effect): boolean {
  if (!leaveCardAvailable(s, e.source)) return false;
  if (e.text === "discard" && dikeCannotLeaveDiscard(s, e.owner)) return false;
  const p = seatView(s, e.owner ?? 0);
  if (e.text === "hand")
    return p.hand.some((u) => u.id === e.target && u.code === e.code);
  const pile =
    e.text === "deck" ? p.deck : e.text === "removed" ? p.removed : p.discard;
  return e.value !== undefined && pile[e.value] === e.code;
}
function takeLeaveCard(s: GameState, e: Effect) {
  requireRule(
    sourceAvailable(s, e),
    "This exact Eagle card has already left its recorded destination.",
  );
  const p = seatView(s, e.owner ?? 0);
  if (e.text === "hand")
    p.hand.splice(
      p.hand.findIndex((u) => u.id === e.target),
      1,
    );
  else {
    const pile =
      e.text === "deck" ? p.deck : e.text === "removed" ? p.removed : p.discard;
    pile.splice(e.value!, 1);
    // Maintain exact array positions for other pending physical Eagle leave events.
    for (const pending of s.queue)
      if (
        pending.kind.startsWith("mirkwoodEagle") &&
        pending.owner === e.owner &&
        pending.text === e.text &&
        pending.value !== undefined &&
        pending.value > e.value!
      )
        pending.value--;
  }
  consumeLeaveCard(s, e.source!);
}
function travellerActiveChoice(s: GameState) {
  const active = activeLocations(s);
  if (active.length === 1)
    prepend(s, fx("mirkwoodTravellerStaging", { source: active[0].id }));
  else
    choose(
      s,
      "West Road Traveller · Active location",
      opts(active, (u) => [fx("mirkwoodTravellerStaging", { source: u.id })]),
      "The first player chooses which active location to switch.",
    );
}
export function handleMirkwoodPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "mirkwoodDawnWindow":
      if (
        dawnLegal(s) &&
        s.hand.some((u) => u.code === "02118") &&
        canPay(s, card("02118"))
      )
        choose(s, "Dawn Take You All · Before an attack resolves", [
          {
            id: "play",
            label: "Pay to play Dawn Take You All",
            code: "02118",
            ability: {
              player: activeSeat(s),
              source: s.hand.find((u) => u.code === "02118")!.id,
              code: "02118",
              type: "action",
            },
            effects: [fx("mirkwoodDawnPay")],
          },
          skip,
        ]);
      return true;
    case "mirkwoodDawnPay":
      requireRule(
        dawnLegal(s),
        "An attack has already resolved or no face-down shadow remains.",
      );
      if (!spendEvent(s, "02118")) return true;
      mirkwoodPlayerEventEffect(s, "02118");
      return true;
    case "mirkwoodDawnChoice": {
      const options = dawnOptions(s);
      if (options.length)
        choose(
          s,
          `Dawn Take You All · ${seatName(s, activeSeat(s))}`,
          [...options, skip],
          "You may discard one face-down shadow from an enemy engaged with you, without looking at its face.",
        );
      return true;
    }
    case "mirkwoodDawnDiscard": {
      const enemy = engagedEnemies(s).find((u) => u.id === e.target),
        index = e.value ?? -1;
      requireRule(
        enemy &&
          index >= (enemy.revealedShadowCount ?? 0) &&
          enemy.shadows[index] === e.code,
        "Choose a still face-down shadow on an enemy engaged with you.",
      );
      enemy.faceupShadows?.splice(index, 1);
      s.encounterDiscard.push(...enemy.shadows.splice(index, 1));
      log(
        s,
        "Dawn Take You All discards a face-down shadow without resolving its effect.",
        "good",
      );
      return true;
    }
    case "mirkwoodRumourReturn": {
      const payer = lorePayers(s).find((u) => u.id === e.target);
      requireRule(
        payer && returnPlayedEventToHand(s, "02124", e.source, e.value),
        "Pay a Lore hero's resource to return the resolved Rumour.",
      );
      spendResources(s, payer, 1);
      return true;
    }
    case "mirkwoodSupportStat": {
      const host = get(s, e.target),
        eagle = eagles(s).find((u) => u.id === e.source),
        a = host?.attachments.find((a) => a.id === e.text);
      requireRule(
        host &&
          eagle &&
          a?.code === "02120" &&
          !a.exhausted &&
          !a.blanked &&
          !a.facedown,
        "Support of the Eagles needs a ready attachment and an Eagle ally.",
      );
      const values = stats(s, eagle);
      choose(
        s,
        "Support of the Eagles · Stat",
        ["attack", "defense"].map((stat) => ({
          id: stat,
          label: `Gain +${stat === "attack" ? values.attack : values.defense} ${stat} this phase`,
          code: eagle.code,
          effects: [
            fx("mirkwoodSupportGain", {
              target: host.id,
              source: a.id,
              text: stat,
              value: stat === "attack" ? values.attack : values.defense,
            }),
          ],
        })),
      );
      return true;
    }
    case "mirkwoodSupportGain": {
      const host = get(s, e.target),
        a = host?.attachments.find((a) => a.id === e.source);
      requireRule(
        host &&
          a?.code === "02120" &&
          !a.exhausted &&
          !a.blanked &&
          !a.facedown,
        "Support of the Eagles can no longer be exhausted.",
      );
      a.exhausted = true;
      if (e.text === "attack")
        host.tempAttack = (host.tempAttack ?? 0) + (e.value ?? 0);
      else host.tempDefense = (host.tempDefense ?? 0) + (e.value ?? 0);
      return true;
    }
    case "mirkwoodTravellerResponse":
      if (activeLocations(s).length && locations(s).length)
        choosePlayerResponse(
          s,
          e.target ?? "02121",
          "02121",
          "West Road Traveller · Played from hand",
          [
            {
              id: "switch",
              label: "Switch an active location with a staging location",
              code: "02121",
              effects: [
                fx("mirkwoodTravellerActive", { player: firstPlayer(s) }),
              ],
            },
            skip,
          ],
        );
      return true;
    case "mirkwoodTravellerActive":
      travellerActiveChoice(s);
      return true;
    case "mirkwoodTravellerStaging":
      if (
        activeLocations(s).some((u) => u.id === e.source) &&
        locations(s).length
      )
        choose(
          s,
          "West Road Traveller · Staging location",
          opts(locations(s), (u) => [
            fx("mirkwoodTravellerSwap", { source: e.source, target: u.id }),
          ]),
        );
      return true;
    case "mirkwoodTravellerSwap": {
      const old = activeLocations(s).find((u) => u.id === e.source),
        next = locations(s).find((u) => u.id === e.target);
      requireRule(
        old && next,
        "Choose an active and a staging location that can be switched.",
      );
      s.staging = s.staging.filter((u) => u.id !== next.id);
      s.staging.push(old);
      if (s.activeLocation?.id === old.id) s.activeLocation = next;
      else
        s.extraActiveLocations = (s.extraActiveLocations ?? []).map((u) =>
          u.id === old.id ? next : u,
        );
      stewardFearTravelEntered(s, next);
      log(
        s,
        "West Road Traveller switches locations, keeping their progress and attachments; no travel occurs.",
        "good",
      );
      return true;
    }
    case "mirkwoodEagleResponse":
      if (sourceAvailable(s, e) && collectors(s, activeSeat(s)).length)
        choose(
          s,
          "Eagles of the Misty Mountains · Eagle left play",
          [
            ...opts(collectors(s, activeSeat(s)), (u) => [
              {
                ...e,
                kind: "mirkwoodEagleAttach",
                target: u.id,
                ids: [e.target ?? ""],
              },
            ]).map(
              (option) => responseOptions(s, option.id, "02119", [option])[0],
            ),
            skip,
          ],
          "Attach this exact departed Eagle face down. Its owner retains the card.",
        );
      return true;
    case "mirkwoodEagleAttach": {
      const collector = collectors(s, activeSeat(s)).find(
        (u) => u.id === e.target,
      );
      requireRule(
        collector && !isSacked(collector),
        "Choose your Eagles of the Misty Mountains ally.",
      );
      const source = { ...e, target: e.ids?.[0] || undefined };
      takeLeaveCard(s, source);
      collector.attachments.push({
        id: e.source!,
        code: e.code!,
        exhausted: false,
        facedown: true,
        blanked: true,
        owner: e.owner,
      });
      log(
        s,
        "Eagles of the Misty Mountains gains one face-down Eagle attachment.",
        "good",
      );
      return true;
    }
    default:
      return false;
  }
}
