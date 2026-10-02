import { reorderPlayerDeck } from "./core";
// Foundations of Stone: exact active rules beyond shared Dwarf/Elf attachments.
import { card } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  opts,
  prepend,
  requireRule,
  skip,
} from "./core";
import {
  damage,
  discardCharacter,
  discardHandCard,
  exhaustCharacter,
  raiseThreat,
  spendEvent,
} from "./board";
import { hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { ownerOf, playerOrder, seatName, seatView } from "./table";
const heavyCopy = (s: GameState) =>
  s.hand.find(
    (u) => u.code === "04105" && !s.used.includes(`phase:heavy-stroke:${u.id}`),
  );
const discardIdentityPrefix = "phase:heavy-discard:";
/** Occurrences distinguish identical printed events while the discard pile stores codes. */
export function foundationsPlayerCardDiscarded(s: GameState, u: Unit) {
  if (u.code !== "04105" || !s.used.includes(`phase:heavy-stroke:${u.id}`))
    return;
  const ordinal = s.discard.filter((code) => code === u.code).length - 1;
  s.used = s.used.filter(
    (key) =>
      !key.startsWith(discardIdentityPrefix) ||
      JSON.parse(key.slice(discardIdentityPrefix.length)).id !== u.id,
  );
  s.used.push(discardIdentityPrefix + JSON.stringify({ ordinal, id: u.id }));
}
export function foundationsPlayerDiscardTaken(
  s: GameState,
  index: number,
): string | undefined {
  if (s.discard[index] !== "04105") return undefined;
  const ordinal = s.discard
    .slice(0, index)
    .filter((code) => code === "04105").length;
  let identity: string | undefined;
  s.used = s.used.flatMap((key) => {
    if (!key.startsWith(discardIdentityPrefix)) return [key];
    const binding = JSON.parse(key.slice(discardIdentityPrefix.length)) as {
      ordinal: number;
      id: string;
    };
    if (binding.ordinal === ordinal) {
      identity = binding.id;
      return [];
    }
    if (binding.ordinal > ordinal) binding.ordinal--;
    return [discardIdentityPrefix + JSON.stringify(binding)];
  });
  return identity;
}
const heavyEnemy = (s: GameState, id?: string) => {
  const u = get(s, id);
  return u &&
    card(u.code).type_code === "enemy" &&
    !/immune to (?:player )?card effects/i.test(card(u.code).text ?? "")
    ? u
    : undefined;
};
export const foundationsPlayerNoAttackExhaust = (u: Unit) =>
  u.code === "04104" && !u.blanked;
export function foundationsPlayerCharactersCommitted(
  s: GameState,
  committed: Unit[],
  exhaustedIds: string[],
) {
  prepend(
    s,
    ...committed
      .filter(
        (u) => u.code === "04101" && !u.blanked && exhaustedIds.includes(u.id),
      )
      .map((u) =>
        fx("foundationsGlorfindelForced", {
          source: u.id,
          player: ownerOf(s, u),
        }),
      ),
  );
}
export function foundationsPlayerAttackResolved(s: GameState, ids: string[]) {
  prepend(
    s,
    ...ids
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u && u.code === "04104" && !u.blanked)
      .map((u) =>
        fx("foundationsScoutForced", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
/** Individual contributions preserve the legal allocation of combined attack damage. */
export function foundationsPlayerCombatDamage(
  s: GameState,
  enemy: Unit,
  ids: string[],
  amount: number,
  contributions: Record<string, number>,
) {
  if (amount <= 0 || !heavyEnemy(s, enemy.id)) return;
  const dwarves = ids
    .map((id) => get(s, id))
    .filter(
      (u): u is Unit =>
        !!u && hasTrait(u, "Dwarf") && (contributions[u.id] ?? 0) > 0,
    );
  if (!dwarves.length) return;
  const total = Object.values(contributions).reduce((n, v) => n + v, 0);
  const allocations = dwarves.flatMap((u) => {
    const attack = contributions[u.id],
      min = Math.max(0, amount - (total - attack)),
      max = Math.min(amount, attack);
    return max > 0 ? [{ id: u.id, code: u.code, min, max }] : [];
  });
  if (!allocations.length) return;
  const text = JSON.stringify(allocations);
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((u) => u.code === "04105") && canPay(p, card("04105"))
        );
      })
      .map((player) =>
        fx("foundationsHeavyResponse", { target: enemy.id, text, player }),
      ),
  );
}
export const foundationsPlayerPlayProblem = (_s: GameState, code: string) =>
  code === "04105"
    ? "Heavy Stroke responds to a Dwarf's combat damage; use its response window."
    : null;
export const foundationsPlayerAbilityLabel = (code: string) =>
  code === "04106" ? "Exhaust · order a player's top five" : undefined;
export function foundationsPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (
    u.code === "04106" &&
    (u.exhausted ||
      khazadCannotExhaust(u) ||
      !playerOrder(s).some((i) => seatView(s, i).deck.length))
  )
    return "Imladris Stargazer must be ready and a player's deck must contain a card.";
  return undefined;
}
export function useFoundationsPlayerAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "04106") return false;
  requireRule(
    !foundationsPlayerAbilityProblem(s, u),
    foundationsPlayerAbilityProblem(s, u) ?? "",
  );
  requireRule(exhaustCharacter(s, u), "Stargazer cannot exhaust.");
  choose(
    s,
    "Imladris Stargazer · Choose a player",
    playerOrder(s).map((player) => ({
      id: `player-${player}`,
      label: seatName(s, player),
      effects: [fx("foundationsStargazerLook", { player })],
    })),
  );
  return true;
}
function stargazerOrder(s: GameState, remaining: string[], ordered: string[]) {
  if (!remaining.length) {
    const available = s.deck.slice(0, ordered.length),
      order = ordered.map((code) => {
        const i = available.indexOf(code);
        available[i] = "";
        return i;
      });
    reorderPlayerDeck(s, 0, order);
    return;
  }
  choose(
    s,
    "Imladris Stargazer · Next card on top",
    remaining.map((code, index) => ({
      id: `card-${index}`,
      label: card(code).name,
      code,
      effects: [
        fx("foundationsStargazerOrder", {
          ids: remaining,
          text: JSON.stringify(ordered),
          value: index,
        }),
      ],
    })),
    `${ordered.length} already ordered; choose from the original top five only.`,
  );
}
export function handleFoundationsPlayerEffect(
  s: GameState,
  e: Effect,
): boolean {
  switch (e.kind) {
    case "foundationsGlorfindelForced": {
      const hero = get(s, e.source);
      if (hero?.code === "04101" && !hero.blanked)
        raiseThreat(s, 1, "player-card");
      return true;
    }
    case "foundationsScoutForced": {
      const scout = get(s, e.source);
      if (scout?.code !== "04104" || scout.blanked) return true;
      if (!s.hand.length) {
        discardCharacter(s, scout);
        return true;
      }
      choose(s, "Trollshaw Scout · After attacking", [
        {
          id: "discard-ally",
          label: "Discard Trollshaw Scout",
          code: scout.code,
          effects: [fx("foundationsScoutDiscard", { source: scout.id })],
        },
        ...opts(s.hand, (u) => [fx("foundationsScoutHand", { target: u.id })]),
      ]);
      return true;
    }
    case "foundationsScoutDiscard": {
      const u = get(s, e.source);
      if (u) discardCharacter(s, u);
      return true;
    }
    case "foundationsScoutHand": {
      discardHandCard(s, e.target!);
      return true;
    }
    case "foundationsHeavyResponse": {
      const copy = heavyCopy(s);
      if (copy && heavyEnemy(s, e.target) && canPay(s, card("04105")))
        choose(s, "Heavy Stroke · Dwarf combat damage", [
          {
            id: "play",
            label: "Double one Dwarf's dealt combat damage",
            code: "04105",
            effects: [{ ...e, source: copy.id, kind: "foundationsHeavyDwarf" }],
          },
          skip,
        ]);
      return true;
    }
    case "foundationsHeavyDwarf": {
      const allocations = JSON.parse(e.text ?? "[]") as {
        id: string;
        code: string;
        min: number;
        max: number;
      }[];
      choose(
        s,
        "Heavy Stroke · Dwarf damage contribution",
        allocations.map((u) => ({
          id: u.id,
          label: card(u.code).name,
          code: u.code,
          effects: [
            fx("foundationsHeavyAmount", {
              source: e.source,
              target: e.target,
              text: e.text,
              value: u.min,
              count: u.max,
            }),
          ],
        })),
      );
      return true;
    }
    case "foundationsHeavyAmount": {
      const min = Math.max(1, e.value ?? 1),
        max = e.count ?? 0;
      requireRule(
        max >= min,
        "The Dwarf must have dealt positive combat damage.",
      );
      choose(
        s,
        "Heavy Stroke · Allocate Dwarf damage",
        Array.from({ length: max - min + 1 }, (_, index) => ({
          id: `damage-${index + min}`,
          label: `${index + min} damage from that Dwarf`,
          effects: [
            fx("foundationsHeavyDamage", {
              source: e.source,
              target: e.target,
              text: e.text,
              value: index + min,
              count: max,
            }),
          ],
        })),
      );
      return true;
    }
    case "foundationsHeavyDamage": {
      const enemy = heavyEnemy(s, e.target),
        copy = s.hand.find((u) => u.id === e.source && u.code === "04105");
      requireRule(
        enemy &&
          copy &&
          !s.used.includes(`phase:heavy-stroke:${copy.id}`) &&
          (e.value ?? 0) > 0 &&
          (e.value ?? 0) <= (e.count ?? 0),
        "The enemy and this unused Heavy Stroke copy must remain available.",
      );
      s.used.push(`phase:heavy-stroke:${copy.id}`);
      if (!spendEvent(s, "04105", copy.id)) return true;
      damage(s, enemy.id, e.value ?? 0);
      // Published limits are per ability instance; another physical event copy may respond.
      prepend(
        s,
        fx("foundationsHeavyResponse", { target: e.target, text: e.text }),
      );
      return true;
    }
    case "foundationsStargazerLook":
      stargazerOrder(s, s.deck.slice(0, 5), []);
      return true;
    case "foundationsStargazerOrder": {
      const remaining = e.ids ?? [],
        ordered = JSON.parse(e.text ?? "[]") as string[],
        index = e.value ?? -1;
      requireRule(
        index >= 0 && index < remaining.length,
        "Choose an original viewed card.",
      );
      ordered.push(remaining.splice(index, 1)[0]);
      stargazerOrder(s, remaining, ordered);
      return true;
    }
    default:
      return false;
  }
}
