import { dikeSideDefeated } from "./deadmens-dike";
import { choosePlayerResponse } from "./player-ability-triggers";
import { chetwoodProgress, chetwoodSideDefeated } from "./chetwood";
import { weatherSideDefeated } from "./weather-hills";
import { ettenProgressPlaced, ettenSideDefeated } from "./ettenmoors";
import {
  rhudaurFlipSide,
  rhudaurMainQuestAvailable,
  rhudaurQuestPoints,
  rhudaurRedirectProgress,
} from "./rhudaur";
import {
  carnAfterQuestProgress,
  carnProgress,
  carnSideDefeated,
} from "./carn-dum";
import { dreadSideDefeated } from "./dread-realm";
import { gramProgress } from "./mount-gram";
import { wastesProgress } from "./wastes-eriador";
import { angmarSideDefeated } from "./angmar-player";
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  fx,
  log,
  prepend,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  addVictoryCard,
  discardQuestAttachments,
  readyCharacter,
} from "./board";
import {
  allCharacters,
  eachArea,
  eachSeat,
  firstPlayer,
  playerOrder,
} from "./table";
import { collectorQuestDefeated } from "./collector-player-cards";
import { currentQuestUnit, mainQuestCode, mainQuestUnit } from "./quest-state";
import {
  selectedSideQuest,
  selectedSideQuestUnit,
  sideQuestArea,
} from "./side-quest-support";

export function sideQuestStart(s: GameState) {
  delete s.sideQuestSelections;
  const effects: Effect[] = [];
  eachArea(s, () => {
    if (
      s.staging.some((u) =>
        ["player-side-quest", "encounter-side-quest"].includes(
          card(u.code).type_code,
        ),
      )
    )
      effects.push(fx("sideQuestChoose", { player: firstPlayer(s) }));
  });
  prepend(s, ...effects);
}

/** Direct quest progress bypasses the active location, but never the selected quest. */
export function addCurrentQuestProgress(s: GameState, amount: number) {
  const quest = currentQuestUnit(s);
  if (quest) addQuestProgress(s, quest, amount);
}

export const sideQuestGoal = (s: GameState, quest: Unit) =>
  Math.max(0, (card(quest.code).quest ?? 0) + rhudaurQuestPoints(s, quest));

/** Place progress on an explicit physical quest without changing the phase's current quest. */
export function addQuestProgress(s: GameState, quest: Unit, amount: number) {
  if (amount <= 0 || s.status !== "playing") return;
  const main = mainQuestUnit(s),
    isMain = main?.id === quest.id && main.code === quest.code;
  const physical = isMain
    ? main!
    : s.staging.find((u) => u.id === quest.id && u.code === quest.code);
  if (
    !physical ||
    (!isMain &&
      !["player-side-quest", "encounter-side-quest"].includes(
        card(physical.code).type_code,
      ))
  )
    return;
  if (rhudaurRedirectProgress(s, physical, amount)) return;
  const isCurrent = currentQuestUnit(s)?.id === physical.id;
  let placed = isMain
    ? amount
    : Math.max(
        0,
        Math.min(sideQuestGoal(s, physical) - physical.progress, amount),
      );
  if (isCurrent) placed = carnProgress(s, placed);
  placed = wastesProgress(s, placed, physical);
  placed = chetwoodProgress(s, placed, physical);
  if (placed <= 0) return;
  if (isMain && gramProgress(s, placed)) return;
  if (isMain) s.progress += placed;
  else physical.progress += placed;
  ettenProgressPlaced(s, physical, placed);
  carnAfterQuestProgress(s, physical, placed);
  if (!isMain) defeatSideQuest(s, physical);
}

/** Continuous quest-point changes can defeat a side quest without new progress. */
export function checkSideQuestDefeats(s: GameState) {
  for (const quest of [...s.staging].filter((u) =>
    ["player-side-quest", "encounter-side-quest"].includes(
      card(u.code).type_code,
    ),
  ))
    defeatSideQuest(s, quest);
}
function defeatSideQuest(s: GameState, quest: Unit) {
  const goal = sideQuestGoal(s, quest);
  if (quest.progress < goal) return;
  const selected = selectedSideQuest(s);
  if (selected?.id === quest.id) selected.defeated = true;
  const originalCode = quest.code;
  const attachments = discardQuestAttachments(s, quest.code, quest.id);
  const original = { ...quest, attachments: [...quest.attachments] };
  if (!quest.blanked && rhudaurFlipSide(s, quest)) {
    log(
      s,
      `${card(originalCode).name} defeated · Turned over to its Clue.`,
      "good",
    );
  } else {
    s.staging = s.staging.filter((u) => u.id !== quest.id);
    addVictoryCard(s, quest.code);
    log(s, `${name(quest)} defeated · Added to the victory display.`, "good");
  }
  if (quest.code === "09014" && !quest.blanked)
    prepend(
      s,
      fx("sideQuestGatherResponse", {
        source: quest.id,
        player: quest.controller ?? quest.owner ?? firstPlayer(s),
      }),
    );
  collectorQuestDefeated(s, originalCode, attachments);
  chetwoodSideDefeated(s, original);
  weatherSideDefeated(s, original);
  dikeSideDefeated(s, original);
  ettenSideDefeated(s, original, goal);
  carnSideDefeated(s, original);
  dreadSideDefeated(s, original);
  angmarSideDefeated(s, original);
  const mendor = allCharacters(s).find((u) => u.code === "rc135" && !u.blanked);
  if (mendor) {
    readyCharacter(s, mendor);
    eachSeat(s, () => draw(s, 1));
  }
}

/** Returns the number actually removed; a departed side quest has no removable tokens. */
export function removeCurrentQuestProgress(s: GameState, amount: number) {
  const selected = selectedSideQuest(s),
    quest = selectedSideQuestUnit(s);
  const available = selected ? (quest?.progress ?? 0) : s.progress;
  const removed = Math.min(available, Math.max(0, amount));
  if (selected) {
    if (quest) quest.progress -= removed;
  } else s.progress -= removed;
  return removed;
}

export function sideQuestEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("sideQuest")) return false;
  switch (e.kind) {
    case "sideQuestStart":
      sideQuestStart(s);
      break;
    case "sideQuestChoose": {
      const main = mainQuestCode(s);
      choose(
        s,
        "Choose the current quest",
        [
          ...(rhudaurMainQuestAvailable(s)
            ? [
                {
                  id: "main",
                  code: main,
                  label: `Main quest · ${main ? card(main).name : "Continue the adventure"}`,
                  effects: [],
                },
              ]
            : []),
          ...s.staging
            .filter((u) =>
              ["player-side-quest", "encounter-side-quest"].includes(
                card(u.code).type_code,
              ),
            )
            .map((u) => ({
              id: u.id,
              code: u.code,
              label: `${name(u)} · ${u.progress}/${sideQuestGoal(s, u)} progress`,
              effects: [fx("sideQuestSelect", { target: u.id, code: u.code })],
            })),
        ],
        "The first player chooses. Progress goes to this quest for the entire quest phase, after the active location.",
      );
      break;
    }
    case "sideQuestSelect": {
      const u = s.staging.find((x) => x.id === e.target && x.code === e.code);
      if (
        u &&
        ["player-side-quest", "encounter-side-quest"].includes(
          card(u.code).type_code,
        )
      ) {
        (s.sideQuestSelections ??= {})[sideQuestArea(s)] = {
          id: u.id,
          code: u.code,
        };
        log(s, `${name(u)} is the current quest until the quest phase ends.`);
      }
      break;
    }
    case "sideQuestGatherResponse":
      choosePlayerResponse(
        s,
        e.source ?? e.target ?? "09014",
        "09014",
        "Gather Information · Search your decks?",
        [
          {
            id: "search",
            label: "Each player may search their deck",
            effects: playerOrder(s).map((player) =>
              fx("sideQuestGatherSearch", { player }),
            ),
          },
          { id: "skip", label: "Skip the response", effects: [] },
        ],
      );
      break;
    case "sideQuestGatherSearch":
      choose(s, "Gather Information · Choose a card", [
        ...s.deck.map((code, index) => ({
          id: `card-${index}`,
          code,
          label: card(code).name,
          effects: [fx("sideQuestGatherTake", { value: index })],
        })),
        {
          id: "skip",
          label: "Do not take a card · Shuffle deck",
          effects: [fx("sideQuestGatherShuffle")],
        },
      ]);
      break;
    case "sideQuestGatherTake":
      if (e.value !== undefined && e.value >= 0 && e.value < s.deck.length)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "sideQuestGatherShuffle":
      shuffle(s, s.deck);
      break;
    default:
      return false;
  }
  return true;
}
