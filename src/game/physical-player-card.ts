import type { GameState, Unit } from "./types";

// Hidden zones retain per-copy limits, lost hero identities and borrowed ownership.
const deckPrefix = "phase:heavy-deck:";
const heroPrefix = "game:foundations-hero-deck:";
const borrowedPrefix = "game:borrowed-deck:";
type Binding = {
  index: number;
  id: string;
  hero?: boolean;
  owner?: number;
  code?: string;
};
function bindings(s: GameState): Binding[] {
  return s.used
    .filter(
      (key) =>
        key.startsWith(deckPrefix) ||
        key.startsWith(heroPrefix) ||
        key.startsWith(borrowedPrefix),
    )
    .map((key) =>
      key.startsWith(heroPrefix)
        ? ({
            ...JSON.parse(key.slice(heroPrefix.length)),
            hero: true,
          } as Binding)
        : (JSON.parse(
            key.slice(
              key.startsWith(borrowedPrefix)
                ? borrowedPrefix.length
                : deckPrefix.length,
            ),
          ) as Binding),
    );
}
function save(s: GameState, values: Binding[]) {
  s.used = s.used.filter(
    (key) =>
      !key.startsWith(deckPrefix) &&
      !key.startsWith(heroPrefix) &&
      !key.startsWith(borrowedPrefix),
  );
  s.used.push(
    ...values.map(
      ({ hero, ...value }) =>
        (value.owner !== undefined
          ? borrowedPrefix
          : hero
            ? heroPrefix
            : deckPrefix) + JSON.stringify(value),
    ),
  );
}
export function deckCardTaken(
  s: GameState,
  index: number,
): Binding | undefined {
  const values = bindings(s),
    identity = values.find((value) => value.index === index);
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
  u: Pick<Unit, "id" | "code" | "owner">,
) {
  const values = bindings(s).map((value) => ({
    ...value,
    index: value.index >= index ? value.index + 1 : value.index,
  }));
  if (u.owner !== undefined && u.owner !== (s.table?.active ?? 0))
    values.push({ index, id: u.id, owner: u.owner, code: u.code });
  else if (u.code === "04105" && s.used.includes(`phase:heavy-stroke:${u.id}`))
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
  // Moving a Message card to a hidden deck ends that delayed instance.
  if (s.ringMaker)
    s.ringMaker.returns = s.ringMaker.returns.filter((r) => r.id !== u.id);
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

export function hiddenPlayerCardIds(
  s: GameState,
  seatCount = s.table?.seats.length ?? 1,
): string[] | null {
  const result: string[] = [],
    positions = new Set<string>();
  for (const key of s.used) {
    const prefix = key.startsWith(borrowedPrefix)
      ? borrowedPrefix
      : key.startsWith(heroPrefix)
        ? heroPrefix
        : key.startsWith(deckPrefix)
          ? deckPrefix
          : key.startsWith("phase:heavy-discard:")
            ? "phase:heavy-discard:"
            : undefined;
    if (!prefix) continue;
    let value: {
      index?: number;
      ordinal?: number;
      id?: unknown;
      owner?: number;
      code?: string;
    };
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
        prefix !== borrowedPrefix &&
        !s.used.includes(`phase:heavy-stroke:${value.id}`))
    )
      return null;
    if (prefix === borrowedPrefix) {
      if (
        !Number.isInteger(value.index) ||
        value.index! < 0 ||
        typeof value.code !== "string" ||
        s.deck[value.index!] !== value.code ||
        !Number.isInteger(value.owner) ||
        value.owner! < 0 ||
        value.owner! >= seatCount
      )
        return null;
    } else if (prefix === heroPrefix) {
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
      (prefix !== "phase:heavy-discard:" ? "deck:" : "discard:") +
      String(prefix !== "phase:heavy-discard:" ? value.index : value.ordinal);
    if (positions.has(position)) return null;
    positions.add(position);
    result.push(value.id);
  }
  return new Set(result).size === result.length ? result : null;
}
