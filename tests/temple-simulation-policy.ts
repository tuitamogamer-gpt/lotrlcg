import { card } from "../src/game/cards";
import {
  templeAbilityProblem,
  templeObjectiveFree,
  templePublicState,
  templeTravelCandidates,
} from "../src/game/temple";
import {
  TEMPLE,
  templeCell,
  templeMapUnits,
  templeState,
} from "../src/game/temple-support";
import { khazadCannotExhaust } from "../src/game/khazad-dum";
import { watcherWaterCannotExhaust } from "../src/game/watcher-water";
import type { Action, GameState, Option } from "../src/game/types";

/** Deterministic map decisions inspect public faces and permitted looks only. */
export function templeSimulationChoice(s: GameState): Option | undefined {
  if (!s.temple || !s.choice) return;
  if (s.choice.title === "Choose the starting active location")
    return [...s.choice.options].sort((a, b) => {
      const ac = card(a.code!),
        bc = card(b.code!);
      return (
        Number(a.code === TEMPLE.cursed) - Number(b.code === TEMPLE.cursed) ||
        (ac.quest ?? 0) - (bc.quest ?? 0) ||
        (ac.threat ?? 0) - (bc.threat ?? 0)
      );
    })[0];
  if (s.choice.title.startsWith("Searching the Island · Place ")) {
    const grotto = s.staging.find((u) => u.code === TEMPLE.grotto);
    if (grotto) {
      const amounts = s.choice.options.filter((o) =>
        o.id.startsWith(grotto.id + ":"),
      );
      const needed = Math.max(1, 8 - grotto.progress);
      return (
        amounts.find((o) => o.id === `${grotto.id}:${needed}`) ?? amounts.at(-1)
      );
    }
    const active = s.temple.activeId && templeCell(s, s.temple.activeId);
    const east = s.staging
      .filter(
        (u) =>
          templeCell(s, u.id) &&
          (!active || templeCell(s, u.id)!.column > active.column),
      )
      .sort(
        (a, b) => templeCell(s, b.id)!.column - templeCell(s, a.id)!.column,
      )[0];
    return (
      (east &&
        s.choice.options
          .filter((o) => o.id.startsWith(east.id + ":"))
          .at(-1)) ??
      s.choice.options.find((o) => o.id === "quest")
    );
  }
}

export function templeSimulationAction(s: GameState): Action | undefined {
  const q = templeState(s);
  if (!q?.initialized || s.choice || s.flow?.pending) return;
  if (s.phase === "planning") {
    const key = s.staging.find(
      (u) => u.code === TEMPLE.key && templeObjectiveFree(s, u),
    );
    const hero = s.heroes.find(
      (u) =>
        !u.exhausted &&
        !khazadCannotExhaust(u) &&
        !watcherWaterCannotExhaust(u),
    );
    if (key && hero) return { type: "CLAIM", id: key.id, heroId: hero.id };
  }
  if (s.phase !== "setup") {
    const visible = templePublicState(s)!;
    const island = templeMapUnits(s).find(
      (u) =>
        u.code === TEMPLE.lost &&
        !visible.cells.find((c) => c.id === u.id)?.looked &&
        templeAbilityProblem(s, u) === null,
    );
    if (island) return { type: "ABILITY", id: island.id };
  }
  if (s.phase === "travel") {
    const destination = templeTravelCandidates(s).sort((a, b) => {
      const ac = templeCell(s, a.id)!,
        bc = templeCell(s, b.id)!;
      return (
        bc.column - ac.column ||
        Number(b.code === TEMPLE.grotto) - Number(a.code === TEMPLE.grotto) ||
        (card(a.code).threat ?? 0) - (card(b.code).threat ?? 0) ||
        ac.row - bc.row
      );
    })[0];
    return destination
      ? { type: "TRAVEL", id: destination.id }
      : { type: "NEXT" };
  }
}
