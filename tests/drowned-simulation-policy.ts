import { card } from "../src/game/cards";
import { canTravel, stats } from "../src/game/engine";
import { allCharacters } from "../src/game/table";
import type { Action, GameState, Option } from "../src/game/types";

/** Decisions consult only public faces and currently presented legal options. */
export function drownedSimulationChoice(s: GameState): Option | undefined {
  if (!s.drowned || !s.choice) return;
  const { title, options } = s.choice;
  if (title.endsWith("· Flip to its Underwater side?"))
    return options.find((o) => o.id === "flip");
  if (title.endsWith("· Flip to its Grotto side?"))
    return options.find((o) => o.id === "skip");
  if (title === "Into the Abyss · Keep one card type")
    return [...options].sort(
      (a, b) =>
        Number(a.label.match(/Discard (\d+)/)?.[1] ?? 0) -
        Number(b.label.match(/Discard (\d+)/)?.[1] ?? 0),
    )[0];
  if (
    title === "Twisting Hollow · Discard a character" ||
    title.startsWith("Tangling and Grasping · Remove")
  )
    return [...options].sort((a, b) => {
      const ac = allCharacters(s).find((u) => u.id === a.id)!;
      const bc = allCharacters(s).find((u) => u.id === b.id)!;
      // Protect the loss-condition companions and heroes before expendable allies.
      const rank = (u: typeof ac) =>
        (card(u.code).type_code === "objective-ally"
          ? 100
          : card(u.code).type_code === "hero"
            ? 50
            : 0) + stats(s, u).will;
      return rank(ac) - rank(bc);
    })[0];
  if (title.startsWith("Search for an "))
    return [...options].sort((a, b) => {
      const ac = card(a.code!),
        bc = card(b.code!);
      return (
        (ac.attack ?? 0) +
        (ac.threat ?? 0) -
        (bc.attack ?? 0) -
        (bc.threat ?? 0)
      );
    })[0];
}

export function drownedSimulationAction(s: GameState): Action | undefined {
  if (!s.drowned || s.choice || s.flow?.pending || s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const destination = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => {
      const ac = card(a.code),
        bc = card(b.code);
      const grotto = (code: string) =>
        code.startsWith("drowned-") || code.endsWith(":B");
      return (
        Number(!grotto(a.code)) - Number(!grotto(b.code)) ||
        (ac.quest ?? 0) - (bc.quest ?? 0)
      );
    })[0];
  return destination
    ? { type: "TRAVEL", id: destination.id }
    : { type: "NEXT" };
}
