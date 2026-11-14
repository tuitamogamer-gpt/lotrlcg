import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  fx,
  get,
  log,
  requireRule,
  spendResources,
} from "./core";
import { readyCharacter } from "./board";
import { activeSeat, globalCharacters, ownerOf, seatName } from "./table";
import { isHero } from "./card-types";
import { TOS_ARAGORN } from "./lotr-saga-codes";

/**
 * The Lord of the Rings: The Treason of Saruman player cards. The scenario
 * places the Fellowship-sphere Aragorn with the first player; his Action
 * spends 2 resources from his own pool to ready a hero.
 */
export const TREASON_PLAYER = { aragorn: TOS_ARAGORN } as const;
const P = TREASON_PLAYER;
const live = (u: Unit) => !u.blanked;
const readyTargets = (s: GameState) =>
  globalCharacters(s).filter(
    (h) => isHero(h) && h.exhausted && !cannotReady(h, s),
  );
export const treasonPlayerAbilityLabel = (code: string) =>
  code === P.aragorn
    ? "Aragorn · Spend 2 resources from Aragorn's resource pool: ready a hero"
    : undefined;
export function treasonPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId || u.code !== P.aragorn) return undefined;
  if (!live(u)) return "Aragorn's printed text is blank.";
  if (ownerOf(s, u) !== activeSeat(s)) return "You do not control Aragorn.";
  if (u.resources < 2) return "Aragorn needs 2 resources in his resource pool.";
  if (!readyTargets(s).length) return "No exhausted hero can be readied.";
  return undefined;
}
export function useTreasonPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || u.code !== P.aragorn) return false;
  const problem = treasonPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  spendResources(s, u, 2);
  choose(
    s,
    "Aragorn · Ready a hero",
    readyTargets(s).map((h) => ({
      id: h.id,
      code: h.code,
      label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
      effects: [fx("tspAragornReady", { source: u.id, target: h.id, player })],
    })),
    "Aragorn spends 2 resources from his resource pool to ready a hero.",
  );
  return true;
}
export function treasonPlayerEffect(s: GameState, e: Effect): boolean {
  if (e.kind !== "tspAragornReady") return false;
  const h = get(s, e.target);
  if (h && h.exhausted && !cannotReady(h, s)) {
    readyCharacter(s, h);
    log(s, `Aragorn readies ${name(h)}.`, "good");
  } else if (h) log(s, `${card(h.code).name} cannot be readied.`);
  return true;
}
