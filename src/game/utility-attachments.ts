import { playerCardImmune } from "./card-immunity";
import type { GameState, Unit } from "./types";
import { card } from "./cards";
import {
  allActiveLocations,
  allCharacters,
  attachmentController,
  ownerOf,
} from "./table";
import { choose, fx, opts, requireRule } from "./core";
import { rhosgobelHealingAllowed } from "./rhosgobel";

const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !playerCardImmune(u),
  );
export function utilityAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId: string,
): string | null {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (!a || !["04109", "04110"].includes(a.code)) return null;
  if (a.blanked) return "This attachment's text is blank.";
  if (a.exhausted) return "This attachment is exhausted.";
  if (
    a.code === "04109" &&
    (u.exhausted ||
      !allCharacters(s).some((h) => rhosgobelHealingAllowed(s, h)))
  )
    return "Healing Herbs needs a ready attached hero and a damaged character that can be healed.";
  if (a.code === "04110" && !locations(s).length)
    return "There is no eligible location to explore.";
  return null;
}
export function useUtilityAttachment(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (!a || !["04109", "04110"].includes(a.code)) return false;
  requireRule(
    !utilityAbilityProblem(s, u, a.id),
    utilityAbilityProblem(s, u, a.id) ?? "Unavailable attachment ability.",
  );
  const player = attachmentController(s, u, a) ?? ownerOf(s, u);
  if (a.code === "04109") {
    choose(
      s,
      "Healing Herbs",
      opts(
        allCharacters(s).filter((h) => rhosgobelHealingAllowed(s, h)),
        (h) => [
          fx("exhaust", { target: u.id }),
          fx("discardAttachment", { target: u.id, source: a.id }),
          fx("heal", {
            target: h.id,
            source: a.id,
            code: a.code,
            player,
            owner: a.owner ?? ownerOf(s, u),
            value: h.damage,
          }),
        ],
      ),
      "Discard the Herbs and exhaust their hero to heal all damage on one character.",
    );
  } else {
    a.exhausted = true;
    choose(
      s,
      "Asfaloth",
      opts(locations(s), (l) => [
        fx("locationProgress", {
          target: l.id,
          value: card(u.code).name === "Glorfindel" ? 2 : 1,
        }),
      ]),
      "Place progress directly on an eligible location.",
    );
  }
  return true;
}

/** Rivendell Blade is a continuous attack modifier, rather than an optional response. */
export function utilityAttackDeclared(
  _s: GameState,
  enemy: Unit,
  attackers: Unit[],
) {
  if (playerCardImmune(enemy)) return;
  const blades = attackers.reduce(
    (n, u) =>
      n + u.attachments.filter((a) => !a.blanked && a.code === "04031").length,
    0,
  );
  enemy.tempDefense = (enemy.tempDefense ?? 0) - 2 * blades;
}
