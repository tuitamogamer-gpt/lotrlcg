import type { Effect, GameState, Option } from "./types";
import { choose, fx, prepend } from "./core";
import { activeSeat } from "./table";

/** Printed Action/Response initiation, independent of later target and cost choices. */
export interface PlayerAbilityTrigger {
  player: number;
  source: string;
  code: string;
  type: "action" | "response";
}

/**
 * Keep the ability's complete, possibly suspended resolution ahead of the
 * framework it interrupted. The serializable boundary credits its initiating
 * player even if its targets, nested responses or restoration change seats.
 */
export function resolvePlayerAbility(
  s: GameState,
  ability: PlayerAbilityTrigger,
  resolve: () => void,
) {
  const continuation = s.queue;
  s.queue = [];
  resolve();
  s.queue.push(
    fx("playerAbilityFinish", {
      player: ability.player,
      source: ability.source,
      code: ability.code,
    }),
    ...continuation,
  );
}

/** Resume an interrupted framework event only after this printed ability finishes. */
export function afterPlayerAbility(s: GameState, ...effects: Effect[]) {
  const boundary = s.queue.findIndex(
    (effect) => effect.kind === "playerAbilityFinish",
  );
  if (boundary < 0) prepend(s, ...effects);
  else s.queue.splice(boundary + 1, 0, ...effects);
}

/** Explicit response options: declining does not initiate the printed ability. */
export function responseOptions(
  s: GameState,
  source: string,
  code: string,
  options: Option[],
  player = activeSeat(s),
): Option[] {
  return options.map((option) =>
    option.id === "skip"
      ? option
      : {
          ...option,
          ability: { player, source, code, type: "response" },
        },
  );
}

/** Use only at the initiation of a printed Response, never at continuation choices. */
export function choosePlayerResponse(
  s: GameState,
  source: string,
  code: string,
  title: string,
  options: Option[],
  description?: string,
  player = activeSeat(s),
) {
  choose(
    s,
    title,
    responseOptions(s, source, code, options, player),
    description,
  );
}

/** Explicit queued mandatory responses without an optional initiation prompt. */
export function mandatoryPlayerResponse(
  s: GameState,
  source: string,
  code: string,
  effects: Effect[],
  player = activeSeat(s),
): Effect {
  return fx("playerAbilityResolve", {
    player,
    source,
    code,
    effects,
  });
}
