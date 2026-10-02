// Physical player attachments on the current encounter quest.
import type { Attachment, GameState, Unit } from "./types";
import { scenario } from "./scenarios";

type QuestAttachmentState = GameState & {
  questAttachments?: Record<string, Attachment[]>;
};
const coreQuests: Record<string, readonly string[]> = {
  mirkwood: ["01119", "01120"],
  anduin: ["01126", "01127", "01128"],
  "dol-guldur": ["01123", "01124", "01125"],
  "hunt-for-gollum": ["02011", "02012", "02013"],
};

export function currentQuestCode(s: GameState): string | undefined {
  if (s.scenarioId === "flight-from-moria") return s.khazad?.activeQuest;
  if (s.scenarioId === "mirkwood" && s.stage === 3)
    return s.branch === "beorn" ? "01122" : "01121";
  const stage = scenario(s.scenarioId).stages[s.stage - 1];
  return stage && "cardCode" in stage
    ? stage.cardCode
    : coreQuests[s.scenarioId]?.[s.stage - 1];
}

/** This view never increments card IDs or changes the hidden quest deck. */
export function currentQuestUnit(s: GameState): Unit | undefined {
  const code = currentQuestCode(s);
  if (!code) return undefined;
  return {
    id: `quest:${code}`,
    code,
    exhausted: false,
    damage: 0,
    progress: s.progress,
    resources: 0,
    committed: false,
    boost: 0,
    attacked: false,
    shadows: [],
    attachments: (s as QuestAttachmentState).questAttachments?.[code] ?? [],
  };
}

export function attachToQuest(
  s: GameState,
  code: string,
  attachment: Attachment,
): boolean {
  if (currentQuestCode(s) !== code) return false;
  const state = s as QuestAttachmentState;
  (state.questAttachments ??= {})[code] ??= [];
  state.questAttachments[code].push(attachment);
  return true;
}
