import type { GameState } from "./types";
import { THARBAD as T } from "./tharbad-support";
import { card, cards } from "./cards";
import { fx, log, prepend } from "./core";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
export interface ThreatSource {
  id?: string;
  code?: string;
  owner?: number;
  zone?: "discard" | "victory";
  index?: number;
}
export const threatReductionBlocked = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some(
    (u) => u.code === T.mug && !u.blanked,
  );
/** Track the actual source so The Empty Mug removes that physical player card. */
export function reduceThreat(
  s: GameState,
  amount: number,
  source?: ThreatSource | string,
  reason: "player-card" | "quest-card" | "encounter" = "player-card",
) {
  if (amount <= 0 || threatReductionBlocked(s)) {
    if (amount > 0) log(s, "The Empty Mug prevents threat reduction.");
    return 0;
  }
  const reduction = Math.min(s.threat, amount);
  s.threat -= reduction;
  if (
    !reduction ||
    reason !== "player-card" ||
    !s.tharbad ||
    !s.victoryCards?.includes(T.mug)
  )
    return reduction;
  const spec: ThreatSource =
    typeof source === "string"
      ? cards[source]
        ? { code: source }
        : { id: source }
      : (source ?? {});
  const matches = (u: { id: string; code: string }) =>
    spec.id ? u.id === spec.id : !!spec.code && u.code === spec.code;
  const pending = [...(s.resolvingEvents ?? [])]
    .reverse()
    .find((x) => matches(x.unit) || (!spec.id && !spec.code));
  if (pending) {
    pending.destination = "removed";
    log(
      s,
      `The Empty Mug removes ${card(pending.unit.code).name} after it resolves.`,
      "danger",
    );
    return reduction;
  }
  const hosts = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging,
    ...allActiveLocations(s),
  ];
  const unit = hosts.find((u) => matches(u));
  const attachment = hosts
    .flatMap((host) => host.attachments.map((a) => ({ host, a })))
    .find((x) => matches(x.a));
  const hand = playerOrder(s)
    .flatMap((player) => seatView(s, player).hand.map((u) => ({ u, player })))
    .find((x) => x.u.id === spec.id);
  const id = unit?.id ?? attachment?.a.id ?? hand?.u.id ?? spec.id;
  const code = unit?.code ?? attachment?.a.code ?? hand?.u.code ?? spec.code;
  if (!code) return reduction;
  const owner =
    unit?.owner ??
    (unit ? ownerOf(s, unit) : undefined) ??
    attachment?.a.owner ??
    (attachment ? ownerOf(s, attachment.host) : undefined) ??
    hand?.u.owner ??
    hand?.player ??
    spec.owner ??
    activeSeat(s);
  if (id && s.tharbad.removedSources.includes(id)) return reduction;
  if (id) s.tharbad.removedSources.push(id);
  prepend(
    s,
    fx("tharbadRemoveThreatSource", {
      source: id,
      code,
      owner,
      value: spec.index ?? seatView(s, owner).discard.length,
      text: spec.zone,
    }),
  );
  return reduction;
}
