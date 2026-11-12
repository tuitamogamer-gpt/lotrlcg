import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { ringBearer, oneRing } from "../game/lotr-saga";
import { KD, knifeDarkPublicState } from "../game/knife-dark-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
import "./fortress-nurn.css";
type Props = {
  s: GameState;
  inspect: (c: InspectedCard) => void;
};
export function KnifeDarkState({ s, inspect }: Props) {
  const q = knifeDarkPublicState(s);
  if (!q) return null;
  const link = (code: string, label = card(code).name) => (
    <button
      className="fortress-nurn-link"
      aria-label={`Inspect ${card(code).name}`}
      onClick={() => inspect(card(code))}
    >
      {label}
    </button>
  );
  const bearer = ringBearer(s);
  const ring = oneRing(s);
  return (
    <section
      className="shadow-east-state fortress-nurn-state"
      data-scenario-panel="a-knife-in-the-dark"
      aria-label="A Knife in the Dark"
    >
      <div className="shadow-east-summary">
        <strong>
          {bearer ? link(bearer.code, "The Ring-bearer") : "The Ring-bearer"}
          {": "}
          {ring
            ? ring.exhausted
              ? "The One Ring is exhausted"
              : "The One Ring is ready"
            : "The One Ring has left play"}
          {bearer
            ? ` · ${bearer.resources} resource${bearer.resources === 1 ? "" : "s"}`
            : ""}
        </strong>
        <span data-ring-exhausted={ring?.exhausted ? "true" : "false"}>
          If The One Ring leaves play, the players lose. While it is exhausted,
          the Nazgûl hunt harder: lower engagement costs and extra shadow cards.
        </span>
        <span data-ringwraiths={q.ringwraithsAside}>
          {link(KD.ringwraith, "Ringwraiths")} out of play: {q.ringwraithsAside}
          . Bill Ferny, Squint-eyed Southerner, Unwanted Attention and Into the
          Wild may shuffle one into the encounter deck.
        </span>
        <span data-pony={q.ponyInPlay ? "in-play" : "gone"}>
          {link(KD.pony)}:{" "}
          {q.ponyInPlay
            ? "in play. The players cannot advance from stage 1 while it remains."
            : "has left play."}
        </span>
        <span data-midgewater={q.midgewater}>
          {link(KD.midgewater)}:{" "}
          {q.midgewater === "aside"
            ? "set aside until stage 2B."
            : q.midgewater === "in-play"
              ? "in play. While it is active, enemies cannot attack, take damage or be engaged."
              : "explored."}
        </span>
        <span data-weathertop={q.weathertop}>
          {link(KD.weathertop)}:{" "}
          {q.weathertop === "aside"
            ? "set aside until stage 3A."
            : q.weathertop === "in-play"
              ? "in play. Exhaust The One Ring to travel here."
              : "in the victory display: each enemy gets −1 threat."}
        </span>
        <span data-nazgul={q.nazgul} data-hidden={q.hidden}>
          Nazgûl in play: {q.nazgul}.
          {q.hidden ? ` Under Weather Hills, out of play: ${q.hidden}.` : ""}
          {q.finale
            ? " The players win as soon as no Nazgûl enemy is in play."
            : ""}
        </span>
      </div>
    </section>
  );
}
