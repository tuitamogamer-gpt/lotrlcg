import type { GameState } from "../game/types";
import { card } from "../game/cards";
import { get } from "../game/core";
import { seatName } from "../game/table";
import { sorrowPublicState } from "../game/land-sorrow-support";
import {
  sorrowCaptives,
  sorrowCampsInStaging,
  sorrowWardens,
} from "../game/land-sorrow";
import { landSorrowPlayerPublic } from "../game/land-sorrow-player";
import type { InspectedCard } from "./quest-inspection";
import "./shadow-east.css";
type Props = { s: GameState; inspect: (c: InspectedCard) => void };
export function LandSorrowState({ s, inspect }: Props) {
  const q = sorrowPublicState(s);
  if (!q) return null;
  const captives = sorrowCaptives(s).length,
    wardens = sorrowWardens(s).length;
  return (
    <section
      className="shadow-east-state"
      data-scenario-panel="the-land-of-sorrow"
      aria-label="The Land of Sorrow camps"
    >
      <div className="shadow-east-summary">
        <strong>
          {s.stage === 1 ? "Free Ulchor’s captives" : "Lead the revolt"}
        </strong>
        {s.stage === 1 ? (
          <>
            <span>
              Captives under your control: {captives} / 3. The stage cannot be
              defeated until all three are freed.
            </span>
            <span>
              {sorrowCampsInStaging(s).length} Camp
              {sorrowCampsInStaging(s).length === 1 ? "" : "s"} in staging ·
              each raises every player’s threat by 1 at the end of the round.
              {wardens
                ? " Travel to a Camp is blocked while a Warden is in play."
                : ""}
            </span>
          </>
        ) : (
          <>
            <span>
              Quest points: {q.questPoints} · {wardens} Warden
              {wardens === 1 ? "" : "s"} in play. The stage cannot be defeated
              while a Warden remains.
            </span>
            <span>
              After committing characters, each player not engaged with a Warden
              reveals an encounter card.
            </span>
          </>
        )}
      </div>
      {q.camps.map((c) => {
        const camp = get(s, c.location),
          captive = camp?.attachments.find((a) =>
            ["objective-ally"].includes(card(a.code).type_code),
          );
        return (
          <div className="shadow-east-summary" key={c.location}>
            <strong>{card(c.code).name}</strong>
            <span>
              Guards {captive ? card(captive.code).name : "no captive"}
              {c.warden
                ? ` · ${card(c.warden).name} waits beneath it, faceup and not in play.`
                : " · Its Warden has entered play."}
            </span>
            <span>
              {captive && (
                <button onClick={() => inspect(card(captive.code))}>
                  Inspect {card(captive.code).name}
                </button>
              )}
              {c.warden && (
                <button onClick={() => inspect(card(c.warden!))}>
                  Inspect {card(c.warden).name}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </section>
  );
}
export function MessengerOfTheKingState({ s, inspect }: Props) {
  const q = landSorrowPlayerPublic(s);
  if (!q?.contracts.length) return null;
  return (
    <section
      className="shadow-east-state"
      data-messenger-contract
      aria-label="Messenger of the King contracts"
    >
      {q.contracts.map((c) => {
        const ally = c.ally ? get(s, c.ally) : undefined;
        return (
          <div className="shadow-east-summary" key={c.id}>
            <strong>Messenger of the King · {seatName(s, c.player)}</strong>
            <span>
              {c.side === "B" && ally
                ? `${card(ally.code).name} is a hero and cannot be readied more than once per phase.`
                : "Side A · no eligible ally was put into play."}
            </span>
            <button onClick={() => inspect(card("22134"))}>
              Inspect Messenger of the King
            </button>
          </div>
        );
      })}
    </section>
  );
}
