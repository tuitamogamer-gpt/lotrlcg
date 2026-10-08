import { card } from "../game/cards";
import { mainQuestCode } from "../game/quest-state";
import { scenario } from "../game/scenarios";
import { globalHeroes, seatView } from "../game/table";
import type { GameState } from "../game/types";

export type SignificantMomentKind =
  "stage" | "side-quest" | "hero-fall" | "victory" | "defeat";
export interface SignificantMoment {
  kind: SignificantMomentKind;
  title: string;
  subtitle: string;
}

/** Presentation reads committed rules state; it never changes or advances it.
 * When one action has several milestones, the most consequential one takes focus.
 */
export function detectSignificantMoment(
  before: GameState,
  after: GameState,
): SignificantMoment | null {
  if (before.scenarioId !== after.scenarioId) return null;
  const adventure = scenario(after.scenarioId);
  if (before.status === "playing" && after.status !== "playing")
    return {
      kind: after.status === "won" ? "victory" : "defeat",
      title: after.status === "won" ? "Victory" : "The fellowship has fallen",
      subtitle: adventure.name,
    };
  if (after.status !== "playing") return null;
  if (before.phase === "setup") return null;
  const oldQuest = mainQuestCode(before),
    newQuest = mainQuestCode(after);
  // Switching between already established Foundations areas changes the view,
  // including automatic seat handoffs, without opening a new quest stage.
  const knownArea =
    before.foundationsStone?.split &&
    after.foundationsStone?.split &&
    before.foundationsStone.areas.some((a) => a.questCode === newQuest);
  if (before.stage !== after.stage || (oldQuest !== newQuest && !knownArea)) {
    const quest = newQuest ? card(newQuest) : undefined;
    return {
      kind: "stage",
      title:
        quest?.back_name ??
        quest?.name ??
        adventure.stages[after.stage - 1]?.name ??
        adventure.name,
      subtitle: `A new chapter · ${adventure.shortName}`,
    };
  }
  const survivors = new Set(globalHeroes(after).map((u) => u.id));
  const oldLines = new Set(before.log.map((l) => l.id));
  // Leaving the table also includes capture, reshuffling and living removals.
  // Only the engine's committed destruction record establishes a fallen hero.
  const fallen = globalHeroes(before).filter(
    (u) =>
      !survivors.has(u.id) &&
      after.log.some(
        (l) =>
          !oldLines.has(l.id) && l.text === `${card(u.code).name} has fallen.`,
      ),
  );
  // Lost and Alone keeps a living hero in its owner's deck. The printed rule
  // destroys it if later discarded, even though it is already off the table.
  const lostFallen = (before.foundationsStone?.lostHeroes ?? []).filter(
    (h) =>
      !seatView(before, h.player).discard.includes(h.code) &&
      seatView(after, h.player).discard.includes(h.code) &&
      !survivors.has(h.id),
  );
  const deaths = [
    ...new Map([...fallen, ...lostFallen].map((h) => [h.id, h])).values(),
  ];
  if (deaths.length)
    return {
      kind: "hero-fall",
      title:
        deaths.length === 1
          ? `${card(deaths[0].code).name} has fallen`
          : `${deaths.length} heroes have fallen`,
      subtitle:
        deaths.length === 1
          ? adventure.shortName
          : deaths.map((u) => card(u.code).name).join(" · "),
    };
  const prior = new Map<string, number>();
  for (const code of before.victoryCards ?? [])
    prior.set(code, (prior.get(code) ?? 0) + 1);
  const defeated: string[] = [];
  for (const code of after.victoryCards ?? []) {
    const count = prior.get(code) ?? 0;
    if (count) prior.set(code, count - 1);
    else if (
      ["player-side-quest", "encounter-side-quest"].includes(
        card(code).type_code,
      )
    )
      defeated.push(code);
  }
  if (defeated.length)
    return {
      kind: "side-quest",
      title:
        defeated.length === 1
          ? card(defeated[0]).name
          : `${defeated.length} side quests completed`,
      subtitle: "Side quest completed",
    };
  return null;
}
