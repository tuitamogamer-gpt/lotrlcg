import { card } from "./cards";
import { selectedSideQuest, selectedSideQuestUnit } from "./side-quest-support";
import { ninCurrentQuest } from "./nin-eilph-support";
import { trialsCurrentQuest } from "./three-trials-support";
// Physical player attachments on the current encounter quest.
import type { Attachment, GameState, Unit } from "./types";
import { scenario } from "./scenarios";
import { foundationsCurrentQuest } from "./foundations-stone-support";
import { gramCurrentQuest, gramQuestUnit } from "./mount-gram-support";

type QuestAttachmentState = GameState & {
  questAttachments?: Record<string, Attachment[]>;
};
const coreQuests: Record<string, readonly string[]> = {
  mirkwood: ["01119", "01120"],
  anduin: ["01126", "01127", "01128"],
  "dol-guldur": ["01123", "01124", "01125"],
  "hunt-for-gollum": ["02011", "02012", "02013"],
};

export function mainQuestCode(s: GameState): string | undefined {
  const nin = ninCurrentQuest(s);
  if (nin) return nin;
  const trial = trialsCurrentQuest(s);
  if (trial) return trial;
  const gram = gramCurrentQuest(s);
  if (gram) return gram;
  const foundations = foundationsCurrentQuest(s);
  if (foundations) return foundations;
  if (s.scenarioId === "flight-from-moria") return s.khazad?.activeQuest;
  if (s.scenarioId === "mirkwood" && s.stage === 3)
    return s.branch === "beorn" ? "01122" : "01121";
  const stage = scenario(s.scenarioId).stages[s.stage - 1];
  return stage && "cardCode" in stage
    ? stage.cardCode
    : coreQuests[s.scenarioId]?.[s.stage - 1];
}

/** This view never increments card IDs or changes the hidden quest deck. */
export function mainQuestUnit(s: GameState): Unit | undefined {
  const gram = gramQuestUnit(s);
  if (gram) {
    gram.progress = s.progress;
    return gram;
  }
  const code = mainQuestCode(s);
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
  const side = selectedSideQuestUnit(s);
  if (side?.code === code) {
    side.attachments.push(attachment);
    return true;
  }
  if (mainQuestCode(s) !== code) return false;
  const gram = gramQuestUnit(s);
  if (gram) {
    gram.attachments.push(attachment);
    return true;
  }
  const state = s as QuestAttachmentState;
  (state.questAttachments ??= {})[code] ??= [];
  state.questAttachments[code].push(attachment);
  return true;
}

export const currentQuestCode = (s: GameState) =>
  selectedSideQuest(s)?.code ?? mainQuestCode(s);
export const currentQuestUnit = (s: GameState) =>
  selectedSideQuest(s) ? selectedSideQuestUnit(s) : mainQuestUnit(s);
export const currentQuestProgress = (s: GameState) => {
  const side = selectedSideQuest(s);
  return side
    ? side.defeated
      ? (card(side.code).quest ?? 0)
      : (selectedSideQuestUnit(s)?.progress ?? 0)
    : s.progress;
};
export const allQuestUnits = (s: GameState): Unit[] => [
  ...[mainQuestUnit(s)].filter((u): u is Unit => !!u),
  ...s.staging.filter((u) =>
    ["player-side-quest", "encounter-side-quest"].includes(
      card(u.code).type_code,
    ),
  ),
];
