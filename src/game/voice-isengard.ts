import { currentQuestUnit } from "./quest-state";
// Doomed applies when a player card is played or put into play (Voice of Isengard rulesheet).
import type { Card, Effect, GameState, Unit } from "./types";
import { card, name, plain } from "./cards";
import {
  canGainResources,
  choose,
  fx,
  get,
  globalUnits,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
  takePlayerDeck,
  units,
} from "./core";
import { discardCharacter, raiseThreat, readyCharacter } from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isSacked } from "./carrock";
import { morgulCannotLeave } from "./morgul-vale";
const GRIMA = "round:grima-next";
// Optional grants mention Doomed in their ability text but have no printed keyword.
const printedDoomed = (code: string) =>
  /(?:^|[.\n]\s*)Doomed\s+(\d+|X)\b/i.exec(plain(card(code).text))?.[1];
const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
export interface IsengardState {
  outOfPlay: { source: string; cards: Unit[] }[];
}
const state = (s: GameState) => (s.isengard ??= { outOfPlay: [] });
const count = (s: GameState, u: Unit) =>
  seatView(s, ownerOf(s, u)).used.filter((k) => k === `round:messenger:${u.id}`)
    .length;
export const isengardWill = (s: GameState, u: Unit) => count(s, u);
export const isengardCost = (s: GameState, c: Card, value: number) =>
  Math.max(
    0,
    value -
      (s.used.includes(GRIMA) &&
      c.playOrigin !== "discard" &&
      c.playOrigin !== "deck"
        ? 1
        : 0),
  );
export const isengardAbilityLabel = (code: string) =>
  code === "07002" ? "Reduce your next card's cost by 1 · Doomed 1" : null;
export function isengardAbilityProblem(s: GameState, u: Unit) {
  if (
    u.blanked ||
    isSacked(u) ||
    ownerOf(s, u) !== activeSeat(s) ||
    !s.heroes.some((h) => h.id === u.id)
  )
    return "Gríma must be an active hero you control.";
  return s.used.includes(`round:grima:${u.id}`)
    ? "Gríma has been used this round."
    : null;
}
export function useIsengardAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (u.code !== "07002" || attachmentId) return false;
  requireRule(
    !isengardAbilityProblem(s, u),
    isengardAbilityProblem(s, u) ?? "",
  );
  s.used.push(`round:grima:${u.id}`, GRIMA);
  return true;
}
export function isengardPlayerPlayed(
  s: GameState,
  u: Unit,
  fromHand: boolean,
  after?: Effect,
  doomedX = 0,
  gainedDoomed = 0,
) {
  const extra = fromHand && s.used.includes(GRIMA) ? 1 : 0;
  if (extra) s.used = s.used.filter((k) => k !== GRIMA);
  const n =
    (u.blanked
      ? 0
      : printedDoomed(u.code) === "X"
        ? doomedX
        : Number(printedDoomed(u.code) ?? 0)) +
    extra +
    gainedDoomed;
  if (n)
    prepend(
      s,
      fx("isengardDoomed", { value: n, code: u.code }),
      ...(after ? [after] : []),
    );
  return n > 0;
}
/** Threat is raised for all players before any optional keyword responses resolve. */
export function resolveDoomed(
  s: GameState,
  value: number,
  source: "encounter" | "player-card",
) {
  const effects: Effect[] = [];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const before = s.threat;
      raiseThreat(s, value, source);
      if (
        s.threat <= before ||
        s.table?.seats[p]?.eliminated ||
        s.status !== "playing"
      )
        return;
      for (const u of s.allies) {
        if (u.blanked || isSacked(u)) continue;
        if (u.code === "07004" && u.exhausted)
          effects.push(
            fx("isengardResponse", { target: u.id, player: p, text: "guard" }),
          );
        if (u.code === "07005" && count(s, u) < 2)
          effects.push(
            fx("isengardResponse", {
              target: u.id,
              player: p,
              text: "messenger",
            }),
          );
      }
      for (const h of allHeroes(s))
        for (const a of h.attachments)
          if (
            a.code === "07010" &&
            !a.blanked &&
            !a.facedown &&
            !a.exhausted &&
            attachmentController(s, h, a) === p &&
            canGainResources(s, h)
          )
            effects.push(
              fx("isengardResponse", {
                target: h.id,
                source: a.id,
                player: p,
                text: "keys",
              }),
            );
    });
  prepend(s, ...effects);
}
export function isengardAllyEntered(s: GameState, u: Unit) {
  if (u.code === "07003" && !u.blanked)
    prepend(
      s,
      fx("isengardSarumanOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function isengardCharacterLeft(s: GameState, u: Unit) {
  const q = s.isengard;
  if (!q) return;
  const returning = q.outOfPlay.filter((group) => group.source === u.id);
  q.outOfPlay = q.outOfPlay.filter((group) => group.source !== u.id);
  for (const group of returning) s.staging.push(...group.cards);
}
export const isengardRoundEnd = (s: GameState): Effect[] =>
  allCharacters(s)
    .filter((u) => u.code === "07003" && !u.blanked)
    .map((u) => fx("isengardDepart", { target: u.id, player: ownerOf(s, u) }));
export function isengardAttackKilled(s: GameState, ids: string[]) {
  for (const id of ids) {
    const u = get(s, id);
    if (!u || !u.exhausted) continue;
    for (const a of u.attachments)
      if (a.code === "07008" && !a.exhausted && !a.blanked && !a.facedown)
        prepend(
          s,
          fx("isengardResponse", {
            target: u.id,
            source: a.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
            text: "warhorse",
          }),
        );
  }
}
export function hasSilverLamp(s: GameState, enemy: Unit) {
  const player = ownerOf(s, enemy);
  if (!seatView(s, player).engaged.some((e) => e.id === enemy.id)) return false;
  return seatView(s, player).heroes.some(
    (h) =>
      !h.exhausted &&
      h.attachments.some(
        (a) => a.code === "07009" && !a.blanked && !a.facedown,
      ),
  );
}
export function isengardShadowDealt(s: GameState, u: Unit) {
  if (!u.faceupShadows && !hasSilverLamp(s, u)) return;
  const old = u.faceupShadows ?? [];
  u.faceupShadows = u.shadows.map(
    (_c, i) => old[i] ?? (i === u.shadows.length - 1 && hasSilverLamp(s, u)),
  );
}
export const faceupShadowCards = (u: Unit) =>
  u.shadows.flatMap((code, index) =>
    u.faceupShadows?.[index] ? [{ index, code, name: card(code).name }] : [],
  );
const conditions = (s: GameState) =>
  [...units(s), ...[currentQuestUnit(s)].filter((u): u is Unit => !!u)].flatMap(
    (u) =>
      u.attachments
        .filter(
          (a) =>
            !a.blanked &&
            !a.facedown &&
            !/Permanent/i.test(card(a.code).text ?? "") &&
            /\bCondition\b/i.test(
              `${card(a.code).traits ?? ""} ${card(a.code).text ?? ""}`,
            ),
        )
        .map((a) => ({ u, a })),
  );
export function isengardEventProblem(s: GameState, code: string) {
  if (code === "07011" && !allHeroes(s).some((h) => canGainResources(s, h)))
    return "No hero can gain resources.";
  if (
    code === "07012" &&
    !playerOrder(s).some((p) => seatView(s, p).deck.length)
  )
    return "No player has cards to draw.";
  if (
    code === "07013" &&
    !playerOrder(s).some((p) => seatView(s, p).engaged.some((u) => !immune(u)))
  )
    return "No engaged enemy can be chosen.";
  if (
    code === "07014" &&
    !conditions(s).length &&
    !playerOrder(s).some((p) => seatView(s, p).shackles > 0)
  )
    return "No Condition attachment in play.";
  if (code === "07015" && !s.deck.length) return "Your deck is empty.";
  return null;
}
export function isengardEvent(s: GameState, code: string) {
  if (code === "07011")
    prepend(
      s,
      ...allHeroes(s).map((h) =>
        fx("resource", { target: h.id, value: 1, player: ownerOf(s, h) }),
      ),
    );
  else if (code === "07012")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 2, player })),
    );
  else if (code === "07013")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("isengardVoice", { player })),
    );
  else if (code === "07014")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("isengardCondition", { player })),
    );
  else if (code === "07015") prepend(s, fx("isengardSearch"));
  else return false;
  return true;
}
export function isengardEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("isengard")) return false;
  const u = get(s, e.target),
    a = u?.attachments.find((a) => a.id === e.source);
  switch (e.kind) {
    case "isengardDoomed":
      resolveDoomed(s, e.value ?? 0, "player-card");
      break;
    case "isengardResponse": {
      if (!u) return true;
      if (e.text === "guard" && (!u.exhausted || u.blanked)) break;
      if (e.text === "messenger" && (u.blanked || count(s, u) >= 2)) break;
      if (
        ["keys", "warhorse"].includes(e.text ?? "") &&
        (!a ||
          a.blanked ||
          a.exhausted ||
          (e.text === "keys" && !canGainResources(s, u)) ||
          (e.text === "warhorse" && !u.exhausted))
      )
        break;
      choose(
        s,
        `${e.text === "guard" ? "Orthanc Guard" : e.text === "messenger" ? "Isengard Messenger" : e.text === "keys" ? "Keys of Orthanc" : "Rohan Warhorse"} · Response`,
        [
          {
            id: "use",
            label:
              e.text === "keys"
                ? "Exhaust Keys · Gain 1 resource"
                : e.text === "messenger"
                  ? "Gain +1 willpower this round"
                  : e.text === "warhorse"
                    ? "Exhaust Warhorse · Ready hero"
                    : "Ready Orthanc Guard",
            effects: [{ ...e, kind: "isengardResolveResponse" }],
          },
          skip,
        ],
      );
      break;
    }
    case "isengardResolveResponse":
      if (!u) break;
      if (e.text === "messenger" && !u.blanked && count(s, u) < 2)
        s.used.push(`round:messenger:${u.id}`);
      else if (e.text === "guard" && !u.blanked) readyCharacter(s, u);
      else if (a && !a.blanked && !a.exhausted) {
        if (e.text === "keys" && canGainResources(s, u)) {
          a.exhausted = true;
          prepend(s, fx("resource", { target: u.id, value: 1 }));
        }
        if (e.text === "warhorse" && u.exhausted) {
          a.exhausted = true;
          readyCharacter(s, u);
        }
      }
      break;
    case "isengardSarumanOffer": {
      const source = get(s, e.source);
      if (!source || source.blanked) break;
      const targets = s.staging.filter(
        (u) =>
          ["enemy", "location"].includes(card(u.code).type_code) &&
          !card(u.code).is_unique &&
          !immune(u) &&
          !morgulCannotLeave(s, u),
      );
      if (targets.length)
        choose(s, "Saruman · Consider a card out of play", [
          ...opts(targets, (u) => [
            fx("isengardSetAside", { source: source.id, target: u.id }),
          ]),
          skip,
        ]);
      break;
    }
    case "isengardSetAside": {
      if (!u || !get(s, e.source) || immune(u) || card(u.code).is_unique) break;
      const ids = new Set([u.id]);
      if (u.guarding) ids.add(u.guarding);
      let added = true;
      while (added) {
        added = false;
        for (const x of s.staging)
          if (x.guarding && ids.has(x.id) && !ids.has(x.guarding)) {
            ids.add(x.guarding);
            added = true;
          }
      }
      const cards = s.staging.filter((c) => ids.has(c.id));
      s.staging = s.staging.filter((c) => !ids.has(c.id));
      state(s).outOfPlay.push({ source: e.source!, cards });
      break;
    }
    case "isengardDepart":
      if (u) discardCharacter(s, u);
      break;
    case "isengardVoice": {
      const enemies = s.engaged.filter((u) => !immune(u));
      if (enemies.length)
        choose(
          s,
          "The Wizard's Voice · Choose an enemy",
          opts(enemies, (u) => [
            fx("isengardPrevent", { target: u.id, player: activeSeat(s) }),
          ]),
        );
      break;
    }
    case "isengardPrevent":
      if (u) {
        const p = e.player ?? activeSeat(s);
        u.preventedAttacks = [...new Set([...(u.preventedAttacks ?? []), p])];
        if (ownerOf(s, u) === p) u.feinted = true;
      }
      break;
    case "isengardCondition": {
      const options = conditions(s).map(({ u, a }) => ({
        id: a.id,
        code: a.code,
        label: `Discard ${card(a.code).name} from ${name(u)}`,
        effects: [fx("discardAttachment", { target: u.id, source: a.id })],
      }));
      options.push(
        ...playerOrder(s)
          .filter((p) => seatView(s, p).shackles > 0)
          .map((player) => ({
            id: `shackles-${player}`,
            code: "01105",
            label: `Discard Iron Shackles · Player ${player + 1}`,
            effects: [fx("discardShackles", { player })],
          })),
      );
      if (options.length)
        choose(s, "Power of Orthanc · Discard a Condition", [...options, skip]);
      break;
    }
    case "isengardSearch": {
      const options = s.deck.flatMap((code, index) =>
        printedDoomed(code)
          ? [
              {
                id: `deck-${index}`,
                code,
                label: card(code).name,
                effects: [fx("isengardSearchTake", { value: index, code })],
              },
            ]
          : [],
      );
      choose(s, "The Seeing-stone · Search your deck", [
        ...options,
        {
          id: "skip",
          label: "Finish and shuffle",
          effects: [fx("isengardShuffle")],
        },
      ]);
      break;
    }
    case "isengardSearchTake":
      if (s.deck[e.value ?? -1] === e.code)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "isengardShuffle":
      shuffle(s, s.deck);
      break;
    default:
      return false;
  }
  return true;
}
export function validateIsengard(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  if (s.isengard === undefined) return true;
  if (!s.isengard || !Array.isArray(s.isengard.outOfPlay)) return false;
  const groups = s.isengard.outOfPlay,
    all = groups.flatMap((g) => g?.cards ?? []),
    inPlay = globalUnits(s);
  return (
    new Set(all.map((u) => u.id)).size === all.length &&
    groups.every(
      (g) =>
        g &&
        typeof g.source === "string" &&
        allCharacters(s).some((u) => u.id === g.source && u.code === "07003") &&
        Array.isArray(g.cards) &&
        g.cards.length > 0 &&
        g.cards.every(
          (u) => validUnit(u) && !inPlay.some((x) => x.id === u.id),
        ),
    )
  );
}
