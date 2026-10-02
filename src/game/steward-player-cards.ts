// The Steward's Fear: Outlands auras and explicit resource-payment permissions.
import { card } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import { choose, draw, fx, requireRule } from "./core";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { ownerOf, seatView } from "./table";
import { gondorResourcesGained } from "./gondor-player-cards";
const regularSpheres = ["leadership", "tactics", "spirit", "lore"];
const cardHasTrait = (c: Card, trait: string) =>
  (c.traits ?? "").split(".").some((t) => t.trim() === trait);
const resourceTargets = (s: GameState) =>
  s.heroes.filter((h) => h.resources >= 2 && !isSacked(h));
export function stewardPlayerStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0, health: 0 };
  if (!hasTrait(u, "Outlands")) return result;
  for (const source of seatView(s, ownerOf(s, u)).allies.filter(
    (a) => !a.blanked,
  )) {
    if (source.code === "06002") result.defense++;
    if (source.code === "06004") result.attack++;
    if (source.code === "06006") result.will++;
    if (source.code === "06008") result.health++;
  }
  return result;
}
/** Paying any sphere is distinct from gaining its resource icon. */
export function stewardPlayerCanPay(
  s: GameState,
  h: Unit,
  c: Card,
  cost: number,
): boolean {
  return (
    (cost > 0 &&
      h.code === "06001" &&
      !h.blanked &&
      c.type_code === "ally" &&
      cardHasTrait(c, "Outlands")) ||
    (cost > 0 && s.used.includes(`phase:good-harvest:${c.sphere_code}`))
  );
}
export function stewardPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "06003" && !resourceTargets(s).length)
    return "Gaining Strength needs one of your heroes with 2 resources who can gain card-effect resources.";
  if (
    code === "06009" &&
    (!s.heroes.some((h) => card(h.code).sphere_code === "lore") ||
      !s.deck.length)
  )
    return "Mithrandir's Advice needs a hero with a printed Lore icon and a card to draw.";
  return null;
}
export const stewardPlayerPlayTargets = (
  s: GameState,
  code: string,
): Unit[] | null => (code === "06003" ? resourceTargets(s) : null);
export function stewardPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["06003", "06009", "06010"].includes(code)) return false;
  requireRule(
    !stewardPlayerPlayProblem(s, code),
    stewardPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "06003") {
    const hero = resourceTargets(s).find((h) => h.id === target);
    requireRule(
      hero,
      "Choose a hero you control with 2 resources and permission to gain resources.",
    );
    hero.resources -= 2;
    hero.resources += 3;
    gondorResourcesGained(s, hero, 3, true);
  } else if (code === "06009")
    draw(s, s.heroes.filter((h) => card(h.code).sphere_code === "lore").length);
  else
    choose(
      s,
      "A Good Harvest · Name a sphere",
      regularSpheres.map((sphere) => ({
        id: sphere,
        label: sphere[0].toUpperCase() + sphere.slice(1),
        effects: [fx("stewardHarvestSphere", { text: sphere })],
      })),
    );
  return true;
}
export function handleStewardPlayerEffect(s: GameState, e: Effect): boolean {
  if (e.kind !== "stewardHarvestSphere") return false;
  requireRule(
    regularSpheres.includes(e.text ?? ""),
    "Name one of the four regular player-card spheres.",
  );
  s.used.push(`phase:good-harvest:${e.text}`);
  return true;
}
