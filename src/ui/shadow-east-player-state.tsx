import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { allCharacters, ownerOf, seatName } from "../game/table";
import { threatEliminationLevel } from "../game/tharbad-support";
import {
  SHADOW_EAST_PLAYER,
  shadowEastGollum,
  shadowEastRing,
} from "../game/shadow-east-player-support";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";

export function ShadowEastPlayerState({
  s,
  inspect,
}: {
  s: GameState;
  inspect: (c: InspectedCard) => void;
}) {
  const q = s.shadowEastPlayers;
  if (!q) return null;
  const ring = shadowEastRing(s);
  const gollum = shadowEastGollum(s);
  const characters = allCharacters(s);
  const smeagolInPlay = characters.some((u) => u.id === q.smeagol?.id);
  if (!ring && !q.contracts.length && !q.smeagol) return null;
  return (
    <section
      className="shadow-east-state"
      aria-label="Ring and fellowship"
      data-shadow-east-players
    >
      {ring && (
        <div className="shadow-east-summary" data-one-ring-state>
          <strong>
            The One Ring · {ring.attachment.exhausted ? "Exhausted" : "Ready"}
          </strong>
          <span>
            {card(ring.host.code).name} · {seatName(s, ring.player)}
          </span>
          <span>
            Threat elimination level · {threatEliminationLevel(s, ring.player)}
          </span>
          <span>If The One Ring leaves play, the players lose.</span>
          <button onClick={() => inspect(card(SHADOW_EAST_PLAYER.ring))}>
            Inspect The One Ring
          </button>
        </div>
      )}
      {q.contracts.map((contract) => {
        const count = characters.filter(
          (u) => ownerOf(s, u) === contract.player && card(u.code).is_unique,
        ).length;
        return (
          <div
            className="shadow-east-summary"
            data-fellowship-contract={contract.side}
            key={contract.unit.id}
          >
            <strong>Fellowship · Side {contract.side}</strong>
            <span>
              {seatName(s, contract.player)} · {count} unique characters
            </span>
            <span>
              {contract.side === "A"
                ? "Only unique allies may enter play. At exactly nine unique characters, the contract turns over."
                : "Each character gets +1 willpower, attack and defense. Allies cannot enter play. The contract turns back when a character leaves."}
            </span>
            <button
              onClick={() =>
                inspect({
                  ...card(contract.unit.code),
                  initialReverse: contract.side === "B",
                })
              }
            >
              Inspect Fellowship · Side {contract.side}
            </button>
          </div>
        );
      })}
      {q.smeagol && (
        <div
          className="shadow-east-summary"
          data-smeagol-state={
            gollum ? "Gollum" : smeagolInPlay ? "Sméagol" : "Out of play"
          }
        >
          <strong>
            {gollum
              ? "Gollum · Enemy"
              : smeagolInPlay
                ? "Sméagol · Hero"
                : "Sméagol · Out of play"}
          </strong>
          <span>Original owner · {seatName(s, q.smeagol.owner)}</span>
          <span>
            {gollum
              ? "Gollum engages the first player. Defeat him to return Sméagol exhausted to his owner."
              : smeagolInPlay
                ? "Stinker can turn Sméagol into Gollum."
                : "Sméagol is no longer in the fellowship."}
          </span>
          <button
            onClick={() =>
              inspect({
                ...card(SHADOW_EAST_PLAYER.smeagol),
                initialReverse: !!gollum,
              })
            }
          >
            Inspect Sméagol / Gollum
          </button>
        </div>
      )}
    </section>
  );
}
