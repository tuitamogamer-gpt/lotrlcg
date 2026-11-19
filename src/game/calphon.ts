// Calphon's Action, shared by The Fate of Númenor and, in the Dream-chaser
// campaign, Raid on the Grey Havens: "Exhaust Calphon to look at the bottom
// card of your deck. Then, you may switch that card with a card in your
// hand." His Upgraded side looks at the bottom 5 cards and may switch one.
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, log, putPlayerDeck, takePlayerDeck } from "./core";
import { forOwner } from "./table";
import { dcBackFace } from "./dreamchaser-campaign-support";

/** The effect kinds a scenario module uses for Calphon's choices. */
export interface CalphonKinds {
  /** Choose one of the bottom 5 cards (Upgraded). */
  pick: string;
  /** Switch that card with a hand card, in its place (Upgraded). */
  swap: string;
  /** Switch the bottom card with a hand card. */
  switch: string;
}

/** The choice after Calphon is exhausted (`u` is Calphon). */
export function calphonLook(
  s: GameState,
  u: Unit | undefined,
  player: number,
  kinds: CalphonKinds,
) {
  const bottom = s.deck.at(-1);
  if (!bottom) return;
  if (u && dcBackFace(u)) {
    const seen = s.deck.slice(-5);
    choose(
      s,
      "Calphon · Your bottom 5 cards",
      [
        ...seen.map((code, i) => {
          const fromBottom = seen.length - 1 - i;
          return {
            id: `bottom-${fromBottom}`,
            label: `Switch ${card(code).name} (${fromBottom ? `${fromBottom + 1} from the bottom` : "bottom card"}) with a card in your hand`,
            code,
            effects: [fx(kinds.pick, { code, count: fromBottom, player })],
          };
        }),
        {
          id: "skip",
          label: "Leave the bottom cards where they are",
          effects: [],
        },
      ],
      `From the bottom: ${[...seen]
        .reverse()
        .map((code) => card(code).name)
        .join(", ")}.`,
    );
    return;
  }
  choose(s, "Calphon · Bottom card", [
    ...s.hand.map((h) => ({
      id: h.id,
      label: `Switch ${card(bottom).name} with ${name(h)}`,
      code: h.code,
      effects: [fx(kinds.switch, { target: h.id, code: bottom })],
    })),
    {
      id: "skip",
      label: `Leave ${card(bottom).name} on the bottom`,
      code: bottom,
      effects: [],
    },
  ]);
}
/** Upgraded: the chosen card among the bottom 5 is switched with a hand card. */
export function calphonPick(
  s: GameState,
  e: Effect,
  player: number,
  kinds: CalphonKinds,
) {
  const at = s.deck.length - 1 - (e.count ?? 0);
  if (s.deck[at] !== e.code || !s.hand.length) return;
  choose(s, `Calphon · Switch ${card(e.code!).name} with`, [
    ...s.hand.map((h) => ({
      id: h.id,
      label: `Switch ${card(e.code!).name} with ${name(h)}`,
      code: h.code,
      effects: [
        fx(kinds.swap, {
          target: h.id,
          code: e.code,
          count: e.count,
          player,
        }),
      ],
    })),
    {
      id: "skip",
      label: `Leave ${card(e.code!).name} in your deck`,
      code: e.code,
      effects: [],
    },
  ]);
}
/** The hand card `u` takes the place of the chosen card, which joins the hand. */
export function calphonSwap(s: GameState, e: Effect, u: Unit | undefined) {
  const at = s.deck.length - 1 - (e.count ?? 0);
  if (!u || !s.hand.some((h) => h.id === u.id) || s.deck[at] !== e.code) return;
  const taken = takePlayerDeck(s, at);
  s.hand = s.hand.filter((h) => h.id !== u.id);
  putPlayerDeck(s, u, at);
  s.hand.push(taken);
  log(
    s,
    `Calphon switches a card in hand with ${card(e.code!).name} from the bottom of the deck.`,
    "good",
  );
}
/** The hand card `u` goes to the bottom of its owner's deck; the bottom card joins the hand. */
export function calphonSwitch(
  s: GameState,
  e: Effect,
  u: Unit | undefined,
  player: number,
) {
  if (!u || !s.hand.some((h) => h.id === u.id) || s.deck.at(-1) !== e.code)
    return;
  const bottom = takePlayerDeck(s, s.deck.length - 1);
  forOwner(s, player, () => (s.hand = s.hand.filter((h) => h.id !== u.id)));
  forOwner(s, u.owner ?? player, () => putPlayerDeck(s, u));
  s.hand.push(bottom);
}
