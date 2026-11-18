import type { Effect, GameState } from "./types";
import { card, name } from "./cards";
import { choose, fx, log, prepend, shuffle } from "./core";
import { questDefeated, win } from "./board";
import { firstPlayer } from "./table";
import type {
  FellowshipEventCards,
  FellowshipEventState,
} from "./fellowship-event-support";
import {
  players,
  searchable,
  seatLabel,
  stageNumber,
  takeFrom,
  takeSearched,
  toStaging,
} from "./fellowship-event-lib";

/**
 * The Fellowship event scenarios (The Wizard's Quest, The Woodland Realm and
 * The Mines of Moria) share their structure: the players build the quest deck
 * from stage 1 and one of three stage 2 and one of three stage 3 cards, and
 * the encounter deck from 7 of the 14 encounter sets (the quick build); 1A
 * stages a set-aside card and (unless the scenario sets it up otherwise) one
 * different 0 cost card per player; each A side of stages 2 and 3 reveals a
 * card from the top 5 within a cost; defeating the stage 3 card wins. The
 * first player resolves each 'opposing team' effect, as the cooperative rules
 * ask.
 */
export interface FellowshipEventConfig extends FellowshipEventCards {
  /** The prefix of the scenario's effect kinds. */
  prefix: string;
  state: (s: GameState) => FellowshipEventState | undefined;
  /** After a stage is defeated, before the next one is revealed. */
  stageDefeated?: (s: GameState, code: string) => void;
  /** The B side's 'when revealed' effects, after the A side's search. */
  stageRevealed?: (s: GameState, code: string) => Effect[];
  /**
   * 1A's setup after the set-aside card is staged; by default the opposing
   * team adds one different 0 cost enemy or location per player.
   */
  requestSetup?: (s: GameState) => Effect[];
}
/** The effect kinds the shared rules resolve, without the scenario's prefix. */
const KINDS = [
  "ChooseStage",
  "TakeStage",
  "ChooseSet",
  "PickSet",
  "RandomSets",
  "Build",
  "RequestSetup",
  "ZeroSetup",
  "DefeatQuest",
  "NextStage",
  "TopSearch",
  "TopTake",
  "NoCancelDone",
  "StageBack",
  "SearchStage",
  "Shuffle",
] as const;
/** The shared effects resolved for the whole table, whoever is active. */
export const fellowshipEventSharedKinds = (prefix: string) =>
  KINDS.map((k) => `${prefix}${k}`);
const questName = (code: string) => card(code).back_name ?? card(code).name;

/** After the opening hands: the quick build and 1A's setup, then the first round. */
export function fellowshipEventOpening(
  s: GameState,
  cfg: FellowshipEventConfig,
) {
  const q = cfg.state(s);
  if (!q || !q.building || s.round > 0) return false;
  const first = firstPlayer(s);
  const k = (n: string) => `${cfg.prefix}${n}`;
  prepend(
    s,
    fx(k("ChooseStage"), { value: 2, player: first }),
    fx(k("ChooseStage"), { value: 3, player: first }),
    fx(k("ChooseSet"), { player: first }),
    fx(k("RequestSetup"), { player: first }),
    fx("nextRound"),
  );
  return true;
}
/** Nothing is pending and the current stage holds its quest points. */
export function fellowshipEventComplete(
  s: GameState,
  q: FellowshipEventState,
  goal: number,
) {
  return (
    !q.building &&
    !q.advancing &&
    !s.stageRevealing &&
    s.status === "playing" &&
    !s.choice &&
    !s.queue.length &&
    goal > 0 &&
    s.progress >= goal
  );
}
/** The stage is defeated: stage 3 wins, an earlier stage reveals the next. */
export function fellowshipEventDefeat(
  s: GameState,
  cfg: FellowshipEventConfig,
  winText: string,
) {
  const q = cfg.state(s);
  if (!q) return;
  if (stageNumber(s) === 3) {
    win(s, winText);
    return;
  }
  q.advancing = true;
  prepend(s, fx(`${cfg.prefix}DefeatQuest`, { player: firstPlayer(s) }));
}

export function fellowshipEventEffect(
  s: GameState,
  e: Effect,
  cfg: FellowshipEventConfig,
): boolean {
  const q = cfg.state(s);
  if (!q || !e.kind.startsWith(cfg.prefix)) return false;
  const kind = e.kind.slice(cfg.prefix.length);
  if (!(KINDS as readonly string[]).includes(kind)) return false;
  const k = (n: string) => `${cfg.prefix}${n}`;
  const first = firstPlayer(s);
  switch (kind) {
    case "ChooseStage": {
      const stage = e.value ?? 2;
      const list = stage === 2 ? cfg.stage2 : cfg.stage3;
      choose(
        s,
        `${cfg.title} · Choose the stage ${stage} quest card${seatLabel(s, first)}`,
        [
          ...list.map((c) => ({
            id: c,
            code: c,
            label: `${card(c).back_name} (${card(c).name} ${stage}B)`,
            effects: [
              fx(k("TakeStage"), { code: c, value: stage, player: first }),
            ],
          })),
          {
            id: "random",
            label: "Choose at random",
            effects: [fx(k("TakeStage"), { value: stage, player: first })],
          },
        ],
        "Create your quest deck by choosing one stage 2 and one stage 3 and placing them in numerical order under stage 1.",
      );
      return true;
    }
    case "TakeStage": {
      const stage = e.value ?? 2;
      const list = [...(stage === 2 ? cfg.stage2 : cfg.stage3)];
      const code = e.code ?? shuffle(s, list)[0];
      if (!q.building || !takeFrom(q.box, code)) return true;
      if (stage === 2) q.building.stage2 = code;
      else q.building.stage3 = code;
      q.questDeck = [q.building.stage2, q.building.stage3].filter(
        (c): c is string => !!c,
      );
      log(
        s,
        `${cfg.title}: ${card(code).back_name} is the stage ${stage} quest card.`,
      );
      return true;
    }
    case "ChooseSet": {
      if (!q.building) return true;
      if (q.sets.length >= 7) {
        prepend(s, fx(k("Build"), { player: first }));
        return true;
      }
      const left = cfg.sets.filter((x) => !q.sets.includes(x.number));
      choose(
        s,
        `${cfg.title} · Choose encounter set ${q.sets.length + 1} of 7${seatLabel(s, first)}`,
        [
          ...left.map((x) => ({
            id: `set:${x.number}`,
            label: cfg.setLabel(x.number),
            effects: [
              fx(k("PickSet"), { value: x.number, player: first }),
              fx(k("ChooseSet"), { player: first }),
            ],
          })),
          {
            id: "random",
            label: `Choose the remaining ${7 - q.sets.length} sets at random`,
            effects: [
              fx(k("RandomSets"), { player: first }),
              fx(k("ChooseSet"), { player: first }),
            ],
          },
        ],
        "Create your encounter deck by choosing 7 different encounter sets and shuffling them together.",
      );
      return true;
    }
    case "PickSet":
      if (e.value && !q.sets.includes(e.value)) q.sets.push(e.value);
      return true;
    case "RandomSets": {
      const left = cfg.sets
        .map((x) => x.number)
        .filter((n) => !q.sets.includes(n));
      q.sets.push(...shuffle(s, left).slice(0, 7 - q.sets.length));
      return true;
    }
    case "Build": {
      if (!q.building) return true;
      q.sets.sort((a, b) => a - b);
      const deck = q.sets.flatMap(
        (n) => cfg.sets.find((x) => x.number === n)?.cards ?? [],
      );
      for (const c of deck) takeFrom(q.box, c);
      s.encounterDeck = shuffle(s, deck);
      q.building = null;
      log(
        s,
        `${cfg.title}: the encounter deck holds sets ${q.sets.join(", ")} (${deck.length} cards).`,
        "chapter",
      );
      return true;
    }
    // 1A's setup: the set-aside location and one different 0 cost card per player.
    case "RequestSetup": {
      if (!takeFrom(q.box, cfg.special)) return true;
      toStaging(s, cfg.special);
      log(
        s,
        `${questName(cfg.request)}: ${card(cfg.special).name} is added to the staging area.`,
      );
      prepend(
        s,
        ...(cfg.requestSetup?.(s) ?? [
          fx(k("ZeroSetup"), { ids: [], count: players(s), player: first }),
        ]),
      );
      return true;
    }
    case "ZeroSetup": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx(k("Shuffle"), { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          ["enemy", "location"].includes(card(c).type_code) &&
          cfg.cost(c) === 0 &&
          !taken.has(card(c).name),
        false,
      );
      if (!options.length) {
        log(
          s,
          `${questName(cfg.request)}: there is no different 0 cost enemy or location in the encounter deck.`,
        );
        prepend(s, fx(k("Shuffle"), { player: first }));
        return true;
      }
      choose(
        s,
        `${questName(cfg.request)} · The opposing team adds a different 0 cost enemy or location to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx(k("SearchStage"), {
              code: c,
              text: questName(cfg.request),
              player: first,
            }),
            fx(k("ZeroSetup"), {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(cfg.request).text,
      );
      return true;
    }
    case "DefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      q.defeated.push(q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      cfg.stageDefeated?.(s, q.currentQuest);
      prepend(s, ...responses, fx(k("NextStage"), { player: first }));
      return true;
    }
    case "NextStage": {
      const next = q.questDeck.shift();
      if (!next) {
        q.advancing = false;
        return true;
      }
      q.currentQuest = next;
      s.stage = cfg.stageOf(next);
      s.progress = 0;
      s.stageRevealing = true;
      log(s, `${card(next).name} (stage ${s.stage}) begins.`, "chapter");
      prepend(
        s,
        fx(k("TopSearch"), { player: first }),
        fx(k("StageBack"), { player: first }),
      );
      return true;
    }
    // 2A and 3A: a card from the top 5, revealed; its 'when revealed' cannot be canceled.
    case "TopSearch": {
      const max =
        stageNumber(s) === 2
          ? players(s) >= 2
            ? 2
            : 1
          : players(s) >= 2
            ? 3
            : 2;
      const top = s.encounterDeck.slice(0, 5);
      const eligible = [...new Set(top.filter((c) => cfg.cost(c) <= max))];
      if (!eligible.length) {
        s.encounterDeck = shuffle(s, s.encounterDeck);
        log(
          s,
          `${card(q.currentQuest).name}: no card with cost ${max} or less among the top 5 encounter cards; the deck is shuffled.`,
        );
        return true;
      }
      choose(
        s,
        `${card(q.currentQuest).name} · The opposing team chooses a card with cost ${max} or less from the top 5 encounter cards to reveal${seatLabel(s, first)}`,
        eligible.map((c) => ({
          id: c,
          code: c,
          label: `Reveal ${card(c).name} (cost ${cfg.cost(c)})`,
          effects: [fx(k("TopTake"), { code: c, player: first })],
        })),
        card(q.currentQuest).text,
      );
      return true;
    }
    case "TopTake": {
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      s.encounterDeck = shuffle(s, s.encounterDeck);
      q.noCancel = c;
      log(
        s,
        `${card(q.currentQuest).name}: ${card(c).name} is set aside, the encounter deck is shuffled and it is revealed.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", { code: c, player: first }),
        fx(k("NoCancelDone"), { player: first }),
      );
      return true;
    }
    case "NoCancelDone":
      q.noCancel = null;
      return true;
    case "StageBack": {
      s.stageRevealing = false;
      q.advancing = false;
      const effects = cfg.stageRevealed?.(s, q.currentQuest) ?? [];
      if (effects.length) prepend(s, ...effects);
      return true;
    }
    case "SearchStage": {
      if (!e.code || !takeSearched(s, e.code)) return true;
      const u = toStaging(s, e.code);
      log(s, `${e.text}: ${name(u)} is added to the staging area.`, "danger");
      return true;
    }
    case "Shuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
  }
  return false;
}
