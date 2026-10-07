// The Blood of Gondor: actual discard cards, player choices and delayed effects.
import { card, name, plain } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  skip,
  takePlayerDeck,
} from "./core";
import {
  allyCanEnter,
  damage,
  discardAttachment,
  discardCharacter,
  discardPlayerDeck,
  engage,
  enterAlly,
  exhaustCharacter,
  returnAlly,
  takePlayerDiscard,
} from "./board";
import {
  firstPlayer,
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
} from "./table";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { shadowFlameCanMove } from "./shadow-flame";
import { amonPlayerCanEngage } from "./amon-din-player-cards";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  eventReplayPayments,
  needsTarget,
  playEventFromDiscardEffect,
  playTargets,
  replayEventProblem,
} from "./actions";
import { dwarfDeckDiscarded } from "./dwarf-player-cards";
import { foundationsPlayerCardDiscarded } from "./foundations-player-cards";
import { roadPlayerAttachmentEntered } from "./road-player-cards";

const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const rawTrait = (c: Card, trait: string) =>
  (c.traits ?? "").split(".").some((t) => t.trim() === trait);
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const children = (s: GameState) =>
  s.allies.filter(
    (u) => !immune(u) && (hasTrait(u, "Silvan") || hasTrait(u, "Noldor")),
  );
const outsiders = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) =>
      card(u.code).type_code === "enemy" &&
      !seatView(s, activeSeat(s)).engaged.some((enemy) => enemy.id === u.id) &&
      !immune(u) &&
      shadowFlameCanMove(s, u) &&
      amonPlayerCanEngage(s, u, activeSeat(s)),
  );
const printedSpiritOthers = (s: GameState, u: Unit) =>
  s.heroes.filter((h) => h.id !== u.id && card(h.code).sphere_code === "spirit")
    .length;
const caldaraUsed = (s: GameState, u: Unit) =>
  playerOrder(s).some((p) =>
    seatView(s, p).used.some(
      (key) =>
        key === `game:caldara-owner:${u.owner ?? ownerOf(s, u)}` ||
        key === `game:caldara-source:${u.id}`,
    ),
  );
const caldaraAllies = (s: GameState, selected: number[] = []) =>
  s.discard.flatMap((code, index) =>
    card(code).type_code === "ally" &&
    card(code).sphere_code === "spirit" &&
    allyCanEnter(s, code) &&
    !selected.includes(index) &&
    (!card(code).is_unique ||
      !selected.some((i) => card(s.discard[i]).name === card(code).name))
      ? [{ code, index }]
      : [],
  );
const trapCards = (s: GameState) =>
  s.discard.flatMap((code, index) =>
    card(code).type_code === "attachment" && rawTrait(card(code), "Trap")
      ? [{ code, index }]
      : [],
  );

export const BLOOD_ATTACHMENT_ACTIONS = ["06109"];
const tome = (s: GameState, u: Unit, id?: string) =>
  u.attachments.find(
    (a) =>
      a.id === id &&
      a.code === "06109" &&
      !a.blanked &&
      !a.facedown &&
      attachmentController(s, u, a) === activeSeat(s),
  );
const tomeEvents = (s: GameState) =>
  s.discard
    .map((code, index) => ({
      code,
      index,
      unit: { ...s.heroes[0], code } as Unit,
    }))
    .filter(
      ({ unit }) =>
        card(unit.code).type_code === "event" &&
        card(unit.code).sphere_code === "leadership" &&
        !replayEventProblem(s, unit),
    );

export function bloodPlayerCost(s: GameState, c: Card, cost: number): number {
  return c.code === "06109"
    ? Math.max(
        0,
        cost -
          s.heroes.filter((h) => card(h.code).sphere_code === "leadership")
            .length,
      )
    : cost;
}
export function bloodPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "06111" && !outsiders(s).length)
    return "The Hammer-stroke needs an enemy you can engage.";
  if (code === "06113" && !children(s).length)
    return "Children of the Sea needs a Silvan or Noldor ally you control.";
  if (code === "06116" && !s.deck.length)
    return "Well-Equipped needs a card in your player deck.";
  return null;
}
export function bloodPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "06115") return [];
  if (code === "06109")
    return allHeroes(s).filter(
      (u) => !immune(u) && hasResourceIcon(u, "leadership"),
    );
  return code === "06113" ? children(s) : null;
}
export const bloodPlayerAbilityLabel = (code: string) =>
  ({
    "06107": "Discard Caldara · put Spirit allies into play",
    "06109": "Discard Tome · play a Leadership event",
    "06114": "Exhaust Anborn · recover a Trap",
  })[code as "06107" | "06109" | "06114"];
export function bloodPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    if (!u.attachments.some((a) => a.id === attachmentId && a.code === "06109"))
      return undefined;
    if (!tome(s, u, attachmentId))
      return "The Tome must be faceup, unblanked and controlled by you.";
    if (!tomeEvents(s).length)
      return "Your discard pile needs a playable, affordable Leadership event.";
    return undefined;
  }
  if (!["06107", "06114"].includes(u.code)) return undefined;
  if (ownerOf(s, u) !== activeSeat(s) || u.blanked || isSacked(u))
    return "You must control this character and its printed ability must be active.";
  if (u.code === "06107") {
    if (caldaraUsed(s, u))
      return "Caldara's ability can be used only once per game.";
    if (!printedSpiritOthers(s, u))
      return "Caldara needs another hero you control with a printed Spirit icon.";
    if (!caldaraAllies(s).length)
      return "Your discard pile needs a Spirit ally that can enter play.";
  } else {
    if (!canExhaust(u)) return "Anborn must be able to exhaust.";
    if (!trapCards(s).length)
      return "Your discard pile needs a Trap attachment.";
  }
  return undefined;
}
function caldaraSelection(s: GameState, e: Effect) {
  const source = get(s, e.source),
    selected = (e.ids ?? []).map(Number);
  requireRule(
    source?.code === "06107" && !bloodPlayerAbilityProblem(s, source),
    "Caldara and eligible Spirit allies must remain available.",
  );
  const remaining = caldaraAllies(s, selected),
    count = printedSpiritOthers(s, source);
  if (selected.length >= count || !remaining.length) {
    prepend(s, { ...e, kind: "bloodCaldaraResolve" });
    return;
  }
  choose(
    s,
    "Caldara · Choose Spirit allies",
    remaining.map(({ code, index }) => ({
      id: `ally-${index}`,
      code,
      label: card(code).name,
      effects: [
        {
          ...e,
          kind: "bloodCaldaraSelect",
          ids: [...(e.ids ?? []), String(index)],
        },
      ],
    })),
    `Choose ${count - selected.length} more Spirit ${count - selected.length === 1 ? "ally" : "allies"}, if available. Caldara is discarded as the cost after the full choice.`,
  );
}
export function useBloodPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const isTome =
    !!attachmentId &&
    u.attachments.some((a) => a.id === attachmentId && a.code === "06109");
  if (!isTome && (attachmentId || !["06107", "06114"].includes(u.code)))
    return false;
  const problem = bloodPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  if (isTome)
    choose(
      s,
      "Tome of Atanatar · Leadership event",
      [
        ...tomeEvents(s).map(({ code, index }) => ({
          id: `discard-${index}`,
          code,
          label: card(code).name,
          effects: [
            fx("bloodTomeTarget", {
              source: u.id,
              text: attachmentId,
              code,
              value: index,
            }),
          ],
        })),
        skip,
      ],
      "Choose the actual event, its legal targets and normal payment. The Tome is the discard cost, and the event finishes on the bottom of your deck.",
    );
  else if (u.code === "06107")
    caldaraSelection(s, fx("bloodCaldaraSelect", { source: u.id, ids: [] }));
  else
    choose(
      s,
      "Anborn · Recover a Trap",
      trapCards(s).map(({ code, index }) => ({
        id: `trap-${index}`,
        code,
        label: card(code).name,
        effects: [
          fx("bloodAnbornRecover", { source: u.id, code, value: index }),
        ],
      })),
    );
  return true;
}

export const bloodPlayerHandAbilityLabel = (code: string) =>
  code === "06112" ? "Discard top 3 · put Emery into play" : undefined;
export function bloodPlayerHandAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== "06112") return undefined;
  if (!s.hand.some((h) => h.id === u.id))
    return "Choose Emery in your own hand.";
  if (s.deck.length < 3)
    return "Emery requires three cards in your deck to pay the full discard cost.";
  if (!allyCanEnter(s, u.code))
    return "Emery's unique title or a scenario restriction prevents entry.";
  return undefined;
}
export function useBloodPlayerHandAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "06112") return false;
  const problem = bloodPlayerHandAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  choose(
    s,
    "Emery · Choose a controller",
    playerOrder(s).map((player) => ({
      id: `player-${player}`,
      label: seatName(s, player),
      code: u.code,
      effects: [fx("bloodEmeryEnter", { source: u.id, value: player })],
    })),
    "Discard the top three cards of your own deck; put Emery under the selected player's control. Any discarded Leadership, Tactics or Lore card then discards her.",
  );
  return true;
}

interface DiscardedCard {
  index: number;
  code: string;
  id: string;
  owner?: number;
}
function equippedTargets(s: GameState, entry: DiscardedCard) {
  const u = { ...s.heroes[0], code: entry.code, id: entry.id } as Unit;
  if (
    card(entry.code).type_code !== "attachment" ||
    effectCardPlayProblem(s, u, { putIntoPlay: true })
  )
    return [];
  return effectCardPlayTargets(s, u, { putIntoPlay: true }).filter((target) =>
    hasTrait(target, "Dwarf"),
  );
}
export function bloodPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["06111", "06113", "06116"].includes(code)) return false;
  const problem = bloodPlayerPlayProblem(s, code);
  requireRule(!problem, problem ?? "");
  if (code === "06111") {
    for (const enemy of outsiders(s)) engage(s, enemy, false);
  } else if (code === "06113") {
    const ally = children(s).find((u) => u.id === target);
    requireRule(ally, "Choose a Silvan or Noldor ally you control.");
    ally.tempWill = (ally.tempWill ?? 0) + 2;
    s.used.push(`phase:children-sea:${ally.id}`);
  } else {
    const entries: DiscardedCard[] = [];
    for (let i = 0; i < 2 && s.deck.length; i++) {
      const u = takePlayerDeck(s);
      const owner = u.owner ?? activeSeat(s);
      forOwner(s, owner, () => {
        s.discard.push(u.code);
        foundationsPlayerCardDiscarded(s, u);
        entries.push({
          index: s.discard.length - 1,
          code: u.code,
          id: u.id,
          owner,
        });
      });
    }
    log(
      s,
      `Well-Equipped discards ${entries.map((entry) => card(entry.code).name).join(", ")}.`,
    );
    const choices = entries.filter((entry) => equippedTargets(s, entry).length);
    if (choices.length)
      choose(
        s,
        "Well-Equipped · Discarded attachment",
        [
          ...choices.map((entry) => ({
            id: `attachment-${entry.owner !== activeSeat(s) ? `${entry.owner}-` : ""}${entry.index}`,
            code: entry.code,
            label: card(entry.code).name,
            effects: [
              fx("bloodEquippedTarget", {
                text: JSON.stringify(entry),
                ids: entries.map((entry) => entry.code),
              }),
            ],
          })),
          {
            ...skip,
            effects: [
              fx("bloodEquippedFinish", {
                ids: entries.map((entry) => entry.code),
              }),
            ],
          },
        ],
        "You may attach one of these actual discarded cards to any eligible Dwarf character in play.",
      );
    else
      dwarfDeckDiscarded(
        s,
        entries.map((entry) => entry.code),
        activeSeat(s),
      );
  }
  return true;
}

export function bloodPlayerSpecialAttachmentEntry(
  s: GameState,
  u: Unit,
): boolean {
  if (u.code !== "06115") return false;
  requireRule(
    !s.staging.some((other) => other.id === u.id),
    "The same physical Trap is already in staging.",
  );
  u.owner ??= activeSeat(s);
  s.staging.push(u);
  return true;
}
export function bloodPlayerEnemyAddedToStaging(s: GameState, enemy: Unit) {
  if (
    card(enemy.code).type_code !== "enemy" ||
    immune(enemy) ||
    /cannot have attachments/i.test(plain(card(enemy.code).text))
  )
    return;
  const traps = s.staging.filter((u) => u.code === "06115" && !u.blanked);
  for (const trap of traps) {
    s.staging = s.staging.filter((u) => u.id !== trap.id);
    enemy.attachments.push({
      id: trap.id,
      code: trap.code,
      owner: trap.owner ?? activeSeat(s),
      ...(trap.controller !== undefined ? { controller: trap.controller } : {}),
      exhausted: trap.exhausted,
    });
  }
}
/** Capture the delayed effects before generic phase markers and bonuses are cleared. */
export function bloodPlayerPhaseEndEffects(s: GameState): Effect[] {
  const ids = new Set<string>();
  for (const p of playerOrder(s)) {
    const view = seatView(s, p);
    for (const key of view.used)
      if (key.startsWith("phase:children-sea:"))
        ids.add(key.slice("phase:children-sea:".length));
    view.used = view.used.filter(
      (key) => !key.startsWith("phase:children-sea:"),
    );
  }
  return [...ids].flatMap((id) => {
    const ally = allCharacters(s).find((u) => u.id === id);
    return ally
      ? [fx("bloodChildrenShuffle", { target: id, player: ownerOf(s, ally) })]
      : [];
  });
}
export function bloodPlayerRoundEndEffects(s: GameState): Effect[] {
  return [...s.staging, ...allEngaged(s)].flatMap((enemy) =>
    card(enemy.code).type_code !== "enemy"
      ? []
      : enemy.attachments
          .filter((a) => a.code === "06115" && !a.blanked && !a.facedown)
          .map((a) =>
            fx("bloodPoisonDamage", {
              target: enemy.id,
              source: a.id,
              player: attachmentController(s, enemy, a) ?? activeSeat(s),
            }),
          ),
  );
}

export function handleBloodPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "bloodCaldaraSelect":
      caldaraSelection(s, e);
      return true;
    case "bloodCaldaraResolve": {
      const source = get(s, e.source),
        selected = (e.ids ?? []).map(Number);
      requireRule(
        source?.code === "06107" && !bloodPlayerAbilityProblem(s, source),
        "Caldara's action must remain legal at its discard cost.",
      );
      const count = printedSpiritOthers(s, source);
      requireRule(
        selected.length > 0 &&
          selected.length <= count &&
          new Set(selected).size === selected.length,
        "Choose the proper number of distinct Spirit allies.",
      );
      for (let i = 0; i < selected.length; i++)
        requireRule(
          caldaraAllies(s, selected.slice(0, i)).some(
            (entry) => entry.index === selected[i],
          ),
          "Each selected actual Spirit ally must still be eligible.",
        );
      requireRule(
        selected.length === count || !caldaraAllies(s, selected).length,
        "Resolve as many of Caldara's eligible Spirit allies as possible.",
      );
      s.used.push(
        `game:caldara-owner:${source.owner ?? activeSeat(s)}`,
        `game:caldara-source:${source.id}`,
      );
      const allies = selected.map((index) => ({
        index,
        code: s.discard[index],
      }));
      discardCharacter(s, source);
      const physical: Unit[] = [];
      for (const entry of [...allies].sort((a, b) => b.index - a.index))
        physical.push(takePlayerDiscard(s, entry.index));
      for (const entry of allies) {
        const index = physical.findIndex((u) => u.code === entry.code),
          ally = physical.splice(index, 1)[0];
        ally.owner ??= activeSeat(s);
        enterAlly(s, ally, false, false, false);
      }
      return true;
    }
    case "bloodAnbornRecover": {
      const source = get(s, e.source),
        entry = trapCards(s).find(
          (entry) => entry.index === e.value && entry.code === e.code,
        );
      requireRule(
        source?.code === "06114" &&
          !bloodPlayerAbilityProblem(s, source) &&
          entry,
        "Anborn needs a legal Trap and must be able to exhaust.",
      );
      exhaustCharacter(s, source);
      s.hand.push(takePlayerDiscard(s, entry.index));
      return true;
    }
    case "bloodEmeryEnter": {
      const emery = s.hand.find((u) => u.id === e.source);
      requireRule(
        emery &&
          !bloodPlayerHandAbilityProblem(s, emery) &&
          playerOrder(s).includes(e.value!),
        "Choose Emery from your hand and an active player's control.",
      );
      const player = activeSeat(s),
        codes = discardPlayerDeck(s, 3, player, false);
      s.hand = s.hand.filter((u) => u.id !== emery.id);
      emery.owner ??= player;
      forOwner(s, e.value!, () => {
        enterAlly(s, emery, false, false, false);
        // The whole printed action resolves before deck-discard responses.
        if (
          codes.some((code) =>
            ["leadership", "tactics", "lore"].includes(card(code).sphere_code),
          )
        )
          discardCharacter(s, emery);
      });
      dwarfDeckDiscarded(s, codes, player);
      return true;
    }
    case "bloodChildrenShuffle": {
      const ally = allCharacters(s).find((u) => u.id === e.target);
      if (ally && card(ally.code).type_code === "ally")
        if (ally.temporary) {
          const controller = ownerOf(s, ally);
          selectSeat(s, firstPlayer(s));
          choose(
            s,
            "Children of the Sea · Choose the first end-of-phase effect",
            [
              {
                id: "hand",
                label: "Sneak Attack · Return this ally to its owner's hand",
                code: ally.code,
                effects: [
                  fx("bloodChildrenDeparture", {
                    target: ally.id,
                    flag: false,
                    player: controller,
                  }),
                ],
              },
              {
                id: "deck",
                label:
                  "Children of the Sea · Shuffle this ally into its owner's deck",
                code: ally.code,
                effects: [
                  fx("bloodChildrenDeparture", {
                    target: ally.id,
                    flag: true,
                    player: controller,
                  }),
                ],
              },
            ],
            "Both effects are due now. The first player chooses which resolves first; leaving play ends the other effect.",
          );
        } else returnAlly(s, ally, true);
      return true;
    }
    case "bloodChildrenDeparture": {
      const ally = allCharacters(s).find((u) => u.id === e.target);
      if (ally && card(ally.code).type_code === "ally")
        returnAlly(s, ally, !!e.flag);
      return true;
    }
    case "bloodPoisonDamage": {
      const enemy = get(s, e.target),
        trap = enemy?.attachments.find(
          (a) =>
            a.id === e.source &&
            a.code === "06115" &&
            !a.blanked &&
            !a.facedown,
        );
      if (enemy && trap && !immune(enemy)) damage(s, enemy.id, 2);
      return true;
    }
    case "bloodEquippedTarget": {
      const entry = JSON.parse(e.text!) as DiscardedCard;
      requireRule(
        seatView(s, entry.owner ?? activeSeat(s)).discard[entry.index] ===
          entry.code,
        "Choose the actual attachment discarded by Well-Equipped.",
      );
      choose(
        s,
        "Well-Equipped · Dwarf character",
        opts(equippedTargets(s, entry), (u) => [
          { ...e, kind: "bloodEquippedAttach", target: u.id },
        ]),
      );
      return true;
    }
    case "bloodEquippedAttach": {
      const entry = JSON.parse(e.text!) as DiscardedCard,
        target = equippedTargets(s, entry).find((u) => u.id === e.target);
      requireRule(
        seatView(s, entry.owner ?? activeSeat(s)).discard[entry.index] ===
          entry.code && target,
        "The discarded attachment and an eligible Dwarf target must remain available.",
      );
      let physical: Unit | undefined;
      forOwner(s, entry.owner ?? activeSeat(s), () => {
        physical = takePlayerDiscard(s, entry.index);
      });
      const attachment = {
        id: entry.id,
        code: physical!.code,
        exhausted: false,
        owner: entry.owner ?? activeSeat(s),
      };
      target.attachments.push(attachment);
      roadPlayerAttachmentEntered(s, target, attachment);
      dwarfDeckDiscarded(s, e.ids ?? [], activeSeat(s));
      return true;
    }
    case "bloodEquippedFinish":
      dwarfDeckDiscarded(s, e.ids ?? [], activeSeat(s));
      return true;
    case "bloodTomeTarget": {
      const host = get(s, e.source),
        entry = tomeEvents(s).find(
          (entry) => entry.index === e.value && entry.code === e.code,
        );
      requireRule(
        host && tome(s, host, e.text) && entry,
        "The Tome and actual legal Leadership event must remain available.",
      );
      if (needsTarget(entry.unit))
        choose(
          s,
          "Tome of Atanatar · Event target",
          playTargets(s, entry.unit)
            .filter((u) => !replayEventProblem(s, entry.unit, u.id))
            .map((u) => ({
              id: u.id,
              label: name(u),
              code: u.code,
              effects: [{ ...e, kind: "bloodTomeAmount", target: u.id }],
            })),
        );
      else prepend(s, { ...e, kind: "bloodTomeAmount" });
      return true;
    }
    case "bloodTomeAmount": {
      const entry = tomeEvents(s).find(
        (entry) => entry.index === e.value && entry.code === e.code,
      );
      requireRule(entry, "The actual Leadership event must remain available.");
      if (entry.code === "06083") {
        const maximum = s.discard.filter(
          (code) =>
            card(code).type_code === "ally" && rawTrait(card(code), "Outlands"),
        ).length;
        choose(
          s,
          "Tome of Atanatar · Choose X",
          Array.from({ length: maximum }, (_, i) => i + 1)
            .filter(
              (amount) => !replayEventProblem(s, entry.unit, e.target, amount),
            )
            .map((amount) => ({
              id: `x-${amount}`,
              label: `X = ${amount}`,
              effects: [{ ...e, kind: "bloodTomePayment", count: amount }],
            })),
        );
      } else prepend(s, { ...e, kind: "bloodTomePayment" });
      return true;
    }
    case "bloodTomePayment": {
      const host = get(s, e.source),
        entry = tomeEvents(s).find(
          (entry) => entry.index === e.value && entry.code === e.code,
        );
      requireRule(
        host &&
          tome(s, host, e.text) &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target, e.count),
        "Choose a legal event, target and resource cost.",
      );
      choose(
        s,
        "Tome of Atanatar · Pay event cost",
        eventReplayPayments(s, entry.unit, e.target, e.count).map(
          (payment, index) => ({
            id: `pay-${index}`,
            label:
              Object.entries(payment)
                .map(([id, amount]) => `${amount} from ${name(get(s, id)!)}`)
                .join(" + ") || "Play at cost 0",
            effects: [
              {
                ...e,
                kind: "bloodTomePlay",
                ids: Object.entries(payment).map(
                  ([id, amount]) => `${id}=${amount}`,
                ),
              },
            ],
          }),
        ),
      );
      return true;
    }
    case "bloodTomePlay": {
      const host = get(s, e.source),
        attachment = host && tome(s, host, e.text),
        entry = tomeEvents(s).find(
          (entry) => entry.index === e.value && entry.code === e.code,
        );
      requireRule(
        host &&
          attachment &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target, e.count),
        "The Tome, event, target and payment must still be legal.",
      );
      const payment = Object.fromEntries(
        (e.ids ?? []).map((value) => {
          const split = value.lastIndexOf("=");
          return [value.slice(0, split), Number(value.slice(split + 1))];
        }),
      );
      requireRule(
        eventReplayPayments(s, entry.unit, e.target, e.count).some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(payment),
        ),
        "Choose the event's full legal payment.",
      );
      discardAttachment(s, host, attachment);
      playEventFromDiscardEffect(s, entry.index, {
        target: e.target,
        payment,
        bottom: true,
        amount: e.count,
      });
      return true;
    }
    default:
      return false;
  }
}
