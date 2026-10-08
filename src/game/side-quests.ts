import { chetwoodProgress, chetwoodSideDefeated } from "./chetwood";
import type { Effect, GameState } from "./types";
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
import { mainQuestCode } from "./quest-state";
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
  if (amount <= 0) return;
  const selected = selectedSideQuest(s);
  if (!selected) {
    s.progress += chetwoodProgress(s, amount);
    return;
  }
  const quest = selectedSideQuestUnit(s);
  if (!quest) return; // A defeated side quest stays current until quest phase end.
  const goal = card(quest.code).quest ?? 0;
  quest.progress += chetwoodProgress(
    s,
    Math.min(goal - quest.progress, amount),
  );
  if (quest.progress < goal) return;
  selected.defeated = true;
  const attachments = discardQuestAttachments(s, quest.code, quest.id);
  s.staging = s.staging.filter((u) => u.id !== quest.id);
  addVictoryCard(s, quest.code);
  log(s, `${name(quest)} defeated · Added to the victory display.`, "good");
  if (quest.code === "09014" && !quest.blanked)
    prepend(
      s,
      fx("sideQuestGatherResponse", {
        player: quest.controller ?? quest.owner ?? firstPlayer(s),
      }),
    );
  collectorQuestDefeated(s, quest.code, attachments);
  chetwoodSideDefeated(s, quest);
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
    case "sideQuestChoose": {
      const main = mainQuestCode(s);
      choose(
        s,
        "Choose the current quest",
        [
          {
            id: "main",
            code: main,
            label: `Main quest · ${main ? card(main).name : "Continue the adventure"}`,
            effects: [],
          },
          ...s.staging
            .filter((u) =>
              ["player-side-quest", "encounter-side-quest"].includes(
                card(u.code).type_code,
              ),
            )
            .map((u) => ({
              id: u.id,
              code: u.code,
              label: `${name(u)} · ${u.progress}/${card(u.code).quest} progress`,
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
      choose(s, "Gather Information · Search your decks?", [
        {
          id: "search",
          label: "Each player may search their deck",
          effects: playerOrder(s).map((player) =>
            fx("sideQuestGatherSearch", { player }),
          ),
        },
        { id: "skip", label: "Skip the response", effects: [] },
      ]);
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
