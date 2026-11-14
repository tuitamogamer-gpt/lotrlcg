import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { canGainResources, choose, fx, get, log, requireRule } from "./core";
import {
  activeSeat,
  attachmentController,
  globalCharacters,
  ownerOf,
  seatName,
} from "./table";
import { MOUNTAIN_FIRE_FRODO, isOneRing } from "./lotr-saga-codes";
import { batch4Scenario } from "./batch4-scenarios";
import { isHero } from "./card-types";

/**
 * The Lord of the Rings: The Mountain of Fire player cards. The Saga places
 * the Fellowship-sphere Frodo Baggins; his Planning Action exhausts The One
 * Ring to add 1 resource to a hero's pool. In The Tower of Cirith Ungol The
 * One Ring rides with the hero carrying Last of the Company until 3A, so the
 * cost is paid wherever the Ring is attached, by the player who controls it.
 */
export const MOUNTAIN_FIRE_PLAYER = {
  frodo: MOUNTAIN_FIRE_FRODO,
} as const;
const P = MOUNTAIN_FIRE_PLAYER;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
/** The One Ring in play, with the character it is attached to. */
function theOneRing(s: GameState) {
  for (const host of globalCharacters(s)) {
    const ring = host.attachments.find((a) => isOneRing(a.code));
    if (ring) return { host, ring };
  }
  return undefined;
}
/** The heroes whose pool can take the resource. */
const recipients = (s: GameState) =>
  globalCharacters(s).filter((u) => isHero(u) && canGainResources(s, u));

export const mountainFirePlayerAbilityLabel = (code: string) =>
  code === P.frodo
    ? "Frodo Baggins · Exhaust The One Ring to add 1 resource to a hero's pool"
    : undefined;
export function mountainFirePlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== P.frodo) return undefined;
  const title = card(u.code).name;
  if (u.blanked) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  if (s.phase !== "planning")
    return "Frodo Baggins' ability is a Planning Action.";
  const held = theOneRing(s);
  if (!held) return "The One Ring is not in play.";
  if (
    (attachmentController(s, held.host, held.ring) ?? ownerOf(s, held.host)) !==
    activeSeat(s)
  )
    return "You do not control The One Ring.";
  if (held.ring.exhausted) return "The One Ring is exhausted.";
  if (!recipients(s).length) return "No hero can gain resources.";
  return undefined;
}
export function useMountainFirePlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || u.code !== P.frodo) return false;
  const problem = mountainFirePlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  theOneRing(s)!.ring.exhausted = true;
  log(s, "Frodo Baggins exhausts The One Ring.", "good");
  batch4Scenario(s).oneRingExhausted?.(s);
  choose(
    s,
    `Frodo Baggins · Add 1 resource to a hero's pool${seatLabel(s, p)}`,
    recipients(s).map((hero) => ({
      id: hero.id,
      code: hero.code,
      label: s.table
        ? `${name(hero)} · ${seatName(s, ownerOf(s, hero))}`
        : name(hero),
      effects: [fx("mfpFrodoResource", { target: hero.id, player: p })],
    })),
    "Planning Action: exhaust The One Ring to add 1 resource to a hero's pool.",
  );
  return true;
}
export function mountainFirePlayerEffect(s: GameState, e: Effect): boolean {
  if (e.kind !== "mfpFrodoResource") return false;
  const hero = get(s, e.target);
  if (hero && canGainResources(s, hero)) {
    hero.resources += 1;
    log(
      s,
      `Frodo Baggins: 1 resource is added to ${name(hero)}'s pool.`,
      "good",
    );
  }
  return true;
}
