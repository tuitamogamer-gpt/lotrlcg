import type { GameState, Unit } from "./types";

// Only a used per-copy event needs an identity while a code-only hidden zone holds it.
// The binding expires with the phase, alongside the event's printed usage limit.
const deckPrefix = "phase:heavy-deck:";
const heroPrefix = "game:foundations-hero-deck:";
type Binding = { index: number; id: string; hero?: boolean };
function bindings(s: GameState): Binding[] {
  return s.used
    .filter((key) => key.startsWith(deckPrefix) || key.startsWith(heroPrefix))
    .map((key) =>
      key.startsWith(heroPrefix)
        ? ({
            ...JSON.parse(key.slice(heroPrefix.length)),
            hero: true,
          } as Binding)
        : (JSON.parse(key.slice(deckPrefix.length)) as Binding),
    );
}
function save(s: GameState, values: Binding[]) {
  s.used = s.used.filter(
    (key) => !key.startsWith(deckPrefix) && !key.startsWith(heroPrefix),
  );
  s.used.push(
    ...values.map(
      ({ hero, ...value }) =>
        (hero ? heroPrefix : deckPrefix) + JSON.stringify(value),
    ),
  );
}
export function deckCardTaken(s: GameState, index: number): string | undefined {
  const values = bindings(s),
    identity = values.find((value) => value.index === index)?.id;
  save(
    s,
    values
      .filter((value) => value.index !== index)
      .map((value) => ({
        ...value,
        index: value.index > index ? value.index - 1 : value.index,
      })),
  );
  return identity;
}
export function deckCardInserted(
  s: GameState,
  index: number,
  u: Pick<Unit, "id" | "code">,
) {
  const values = bindings(s).map((value) => ({
    ...value,
    index: value.index >= index ? value.index + 1 : value.index,
  }));
  if (u.code === "04105" && s.used.includes(`phase:heavy-stroke:${u.id}`))
    values.push({ index, id: u.id });
  if (
    s.foundationsStone?.lostHeroes.some(
      (h) =>
        h.player === (s.table?.active ?? 0) &&
        h.id === u.id &&
        h.code === u.code,
    )
  )
    values.push({ index, id: u.id, hero: true });
  save(s, values);
}
export function deckCardsSwapped(s: GameState, a: number, b: number) {
  save(
    s,
    bindings(s).map((value) => ({
      ...value,
      index: value.index === a ? b : value.index === b ? a : value.index,
    })),
  );
}
export function deckCardsReordered(
  s: GameState,
  start: number,
  order: number[],
) {
  save(
    s,
    bindings(s).map((value) =>
      value.index >= start && value.index < start + order.length
        ? { ...value, index: start + order.indexOf(value.index - start) }
        : value,
    ),
  );
}

export function hiddenPlayerCardIds(s: GameState): string[] | null {
  const result: string[] = [],
    positions = new Set<string>();
  for (const key of s.used) {
    const prefix = key.startsWith(heroPrefix)
      ? heroPrefix
      : key.startsWith(deckPrefix)
        ? deckPrefix
        : key.startsWith("phase:heavy-discard:")
          ? "phase:heavy-discard:"
          : undefined;
    if (!prefix) continue;
    let value: { index?: number; ordinal?: number; id?: unknown };
    try {
      value = JSON.parse(key.slice(prefix.length));
    } catch {
      return null;
    }
    if (
      !value ||
      typeof value.id !== "string" ||
      !value.id.length ||
      (prefix !== heroPrefix &&
        !s.used.includes(`phase:heavy-stroke:${value.id}`))
    )
      return null;
    if (prefix === heroPrefix) {
      const hero = s.foundationsStone?.lostHeroes.find(
        (h) => h.player === (s.table?.active ?? 0) && h.id === value.id,
      );
      if (
        !hero ||
        !Number.isInteger(value.index) ||
        value.index! < 0 ||
        s.deck[value.index!] !== hero.code
      )
        return null;
    } else if (prefix === deckPrefix) {
      if (
        !Number.isInteger(value.index) ||
        value.index! < 0 ||
        s.deck[value.index!] !== "04105"
      )
        return null;
    } else if (
      !Number.isInteger(value.ordinal) ||
      value.ordinal! < 0 ||
      value.ordinal! >= s.discard.filter((code) => code === "04105").length
    )
      return null;
    const position =
      (prefix === heroPrefix || prefix === deckPrefix ? "deck:" : "discard:") +
      String(
        prefix === heroPrefix || prefix === deckPrefix
          ? value.index
          : value.ordinal,
      );
    if (positions.has(position)) return null;
    positions.add(position);
    result.push(value.id);
  }
  return new Set(result).size === result.length ? result : null;
}
