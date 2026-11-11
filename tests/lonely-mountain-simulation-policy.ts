import { card } from "../src/game/cards";
import {
  canCommit,
  canTravel,
  characters,
  playTargets,
  stats,
} from "../src/game/engine";
import { get } from "../src/game/core";
import { allCharacters } from "../src/game/table";
import { availableAbilities } from "../src/game/actions";
import { isBagginsBilbo } from "../src/game/hobbit-codes";
import { EREBOR } from "../src/game/erebor-treasures";
import { TLM } from "../src/game/lonely-mountain-support";
import type { Action, GameState, Option, ScenarioId } from "../src/game/types";

export const TLM_SCENARIOS = [
  "the-lonely-mountain",
] as const satisfies readonly ScenarioId[];
export type TlmScenario = (typeof TLM_SCENARIOS)[number];
export const isTlmScenario = (id: ScenarioId): id is TlmScenario =>
  TLM_SCENARIOS.some((scenario) => scenario === id);

const room = (s: GameState, id: string) => {
  const u = get(s, id);
  return u ? stats(s, u).health - u.damage : -99;
};
/** Bilbo Baggins is protected: losing him loses the game. */
const notBilbo = (s: GameState, o: Option) =>
  !isBagginsBilbo(get(s, o.id)?.code ?? "");

/** Deterministic policy uses the visible board and currently offered legal choices. */
export function tlmSimulationChoice(s: GameState): Option | undefined {
  if (!isTlmScenario(s.scenarioId) || !s.choice) return;
  const { title, options } = s.choice;
  const units = allCharacters(s);
  const pick = (...ids: string[]) =>
    ids.map((id) => options.find((o) => o.id === id)).find(Boolean);
  const safest = (list: Option[]) => {
    const pool = list.filter((o) => notBilbo(s, o));
    return [...(pool.length ? pool : list)].sort(
      (a, b) => room(s, b.id) - room(s, a.id),
    )[0];
  };
  if (/Assign.*damage|damage.*hero|damage.*character/i.test(title))
    return options.some((o) => get(s, o.id))
      ? safest(options.filter((o) => get(s, o.id)))
      : undefined;
  if (/defend|Immediate attack/i.test(title))
    return [...options].sort((a, b) => {
      const ua = units.find((u) => u.id === a.id);
      const ub = units.find((u) => u.id === b.id);
      return (
        (ub ? stats(s, ub).defense : -1) - (ua ? stats(s, ua).defense : -1)
      );
    })[0];
  if (/Burgle attempt: the revealed card/.test(title))
    return pick("discard", "mountain", "fail");
  if (/Advance to stage 3/.test(title)) return pick("advance");
  if (/Pretending to Sleep/.test(title)) return pick("spend", "advance");
  if (/A Bare Patch · Make a burgle attempt/.test(title)) return pick("burgle");
  if (/Western Slopes/.test(title)) return pick("progress", "draw");
  if (/Dragon-Spell/.test(title))
    return options.find((o) => notBilbo(s, o)) ?? options[0];
  if (/Secret Entrance · Name a card type/.test(title))
    return pick("treachery");
  if (/Secret Entrance · The first player exhausts/.test(title))
    return options.find((o) => notBilbo(s, o)) ?? options[0];
  if (/Bilbo's Magic Ring · Raise your threat/i.test(title))
    return options.find((o) => o.id === (s.threat < 38 ? "use" : "skip"));
  if (/The Arkenstone · Raise your threat/.test(title)) return pick("x-1");
  if (/Thrór's Battle Axe/.test(title))
    return options.find((o) => o.id !== "skip") ?? options[0];
  for (const id of ["ring", "use", "gain", "draw"]) {
    const preferred = options.find((o) => o.id === id);
    if (preferred) return preferred;
  }
  if (/treasure/i.test(title))
    return options.find((o) => o.id.startsWith("card-")) ?? options[0];
  return (
    options.find((o) => o.id === "skip") ??
    options.find((o) => o.id === "resolve") ??
    options[0]
  );
}

export function tlmSimulationAction(s: GameState): Action | undefined {
  if (!isTlmScenario(s.scenarioId) || s.choice || s.flow?.pending) return;
  if (s.phase === "planning") {
    // Play burgled treasures and drink from Thrór's Golden Cup.
    const treasure = s.hand.find(
      (u) => card(u.code).treasure && playTargets(s, u).length,
    );
    if (treasure) {
      const targets = playTargets(s, treasure);
      const target = targets.find((t) => !isBagginsBilbo(t.code)) ?? targets[0];
      return { type: "PLAY", id: treasure.id, target: target.id };
    }
    for (const u of [...s.heroes])
      for (const a of u.attachments.filter((a) => a.code === EREBOR.cup))
        if (availableAbilities(s, u).some((x) => x.id === a.id && !x.disabled))
          return { type: "ABILITY", id: u.id, attachmentId: a.id };
    return;
  }
  if (s.phase === "quest" && s.staging.some((u) => u.code === TLM.golden)) {
    // Each committed non-Burglar character adds 1 to Smaug the Golden's
    // threat, so only Bilbo and characters with 2 or more willpower quest.
    const ready = characters(s).find(
      (u) =>
        canCommit(s, u) &&
        !s.committedIds.includes(u.id) &&
        (isBagginsBilbo(u.code) || stats(s, u).will >= 2),
    );
    return ready ? { type: "TOGGLE_QUEST", id: ready.id } : { type: "COMMIT" };
  }
  if (s.phase !== "travel") return;
  if (s.activeLocation) return { type: "NEXT" };
  const location = s.staging
    .filter((u) => !canTravel(s, u))
    .sort((a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0))[0];
  return location ? { type: "TRAVEL", id: location.id } : { type: "NEXT" };
}
