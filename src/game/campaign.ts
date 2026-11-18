// Mirkwood Paths campaign log, rewards and chapter continuation.
import { card, STARTERS } from "./cards";
import { BUILT_IN_DECKS } from "./built-in-decks";
import type { GameState, CampaignState } from "./types";
import { SCENARIOS } from "./scenarios";

import { allCharacters, allHeroes, seatIndices, seatView } from "./table";

import { log, random, requireRule } from "./core";

import { createGame } from "./setup";
import { score } from "./actions";
import { fellowshipAragornCode } from "./lotr-saga-codes";
import {
  ARAGORN_KEY,
  COPY_BOONS,
  isSagaCampaign,
  LOS_CHAPTERS,
  nextSagaChapter,
  resolveSagaCampaign,
  SAGA_FREE_CHANGES,
  sagaChapterComplete,
  sagaChapterOptions,
  sagaForbiddenTitle,
  sagaChapterSupported,
  TOS_CHAPTERS,
} from "./saga-campaign";
import type { ScenarioId } from "./types";
import {
  angmarChapterComplete,
  angmarChapterSupported,
  angmarForbiddenTitle,
  isAngmarCampaign,
  nextAngmarChapter,
  resolveAngmarCampaign,
} from "./angmar-campaign";

export function newCampaign(
  heroes: string[],
  mendorLegacy = false,
): CampaignState {
  return {
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: mendorLegacy ? ["rc132", "rc135"] : [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: [],
    mendorSaved: false,
  };
}

export function resolveCampaign(s: GameState) {
  const c = s.campaign!;
  if (isSagaCampaign(c)) return resolveSagaCampaign(s);
  if (isAngmarCampaign(c)) return resolveAngmarCampaign(s);
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) delete c.permanent[code];
  if (s.scenarioId === "mirkwood") {
    if (!c.boons.includes("rc132")) c.boons.push("rc132");
    c.burdens.push(s.branch === "beorn" ? "rc136" : "rc137");
  }
  if (s.scenarioId === "anduin") {
    for (const h of allHeroes(s)) {
      const permanent = h.attachments
        .filter((a) => ["rc133", "rc138"].includes(a.code))
        .map((a) => a.code);
      if (permanent.length) c.permanent[h.code] = permanent;
    }
    const highest = Math.max(...allHeroes(s).map((h) => h.damage));
    const candidates = allHeroes(s).filter((h) => h.damage === highest);
    c.prisoner =
      candidates[Math.floor(random(s) * candidates.length)]?.code ?? null;
    log(
      s,
      `${c.prisoner ? card(c.prisoner).name : "A hero"} will be the prisoner in Dol Guldur.`,
    );
  }
  c.boons = c.boons.filter((code) => code !== "rc133");
  c.burdens = c.burdens.filter((code) => code !== "rc138");
  for (const codes of Object.values(c.permanent))
    for (const code of codes)
      (code === "rc133" ? c.boons : c.burdens).push(code);
  if (s.scenarioId === "dol-guldur") {
    c.mendorSaved = allCharacters(s).some((a) => a.code === "rc135");
    if (c.mendorSaved && !c.boons.includes("rc135")) c.boons.push("rc135");
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  log(s, "The campaign log has been updated.", "good");
}

export function continueCampaign(
  s: GameState,
  heroes = s.campaign?.heroes ?? [],
  deckId = s.deckId,
  includeSupport = true,
  seed = Date.now(),
  seatDeckIds?: string[],
  /** The Lord of the Rings campaign: an optional chapter chosen instead of the next. */
  nextScenario?: ScenarioId,
  /**
   * The Lord of the Rings campaign: the deck (seat) each earned player-card
   * boon joins, or null; a boon earned copy by copy (Brace of Coneys) is keyed
   * "code#copy" for each earned copy.
   */
  deckBoons?: Record<string, number | null>,
): GameState {
  const saga = isSagaCampaign(s.campaign);
  const angmar = isAngmarCampaign(s.campaign);
  requireRule(
    (saga
      ? sagaChapterComplete(s)
      : angmar
        ? angmarChapterComplete(s)
        : s.status === "won") && s.campaign,
    "Win the current chapter before continuing.",
  );
  requireRule(
    saga
      ? sagaChapterOptions(s.campaign!).length > 0
      : angmar
        ? !!nextAngmarChapter(s.campaign!)
        : s.campaign!.completed.length < 3,
    "The campaign is complete.",
  );
  requireRule(
    !(saga || angmar) || !s.campaign!.resolution,
    "Record the campaign card's resolution before continuing.",
  );
  const c = structuredClone(s.campaign);
  const next = saga
    ? (nextScenario ?? nextSagaChapter(c)!)
    : angmar
      ? nextAngmarChapter(c)!
      : SCENARIOS[c.completed.length].id;
  // The Treason of Saruman and The Flame of the West: a fallen Aragorn leaves
  // the list of fallen heroes (each player takes a permanent +1 threat
  // penalty), and the Permanent cards of a recorded Aragorn are transferred to
  // the Fellowship Aragorn.
  if (saga && fellowshipAragornCode(next)) {
    const fallenAragorn = c.fallen.filter((h) => card(h).name === "Aragorn");
    if (fallenAragorn.length) {
      c.fallen = c.fallen.filter((h) => !fallenAragorn.includes(h));
      c.threatPenalty += 1;
      log(
        s,
        "The Fellowship Aragorn: Aragorn leaves the list of fallen heroes, and each player takes a permanent +1 threat penalty.",
      );
    }
    for (const h of c.heroes.filter(
      (code) =>
        card(code).name === "Aragorn" &&
        card(code).sphere_code !== "fellowship",
    )) {
      const moved = c.permanent[h] ?? [];
      if (!moved.length) continue;
      c.permanent[ARAGORN_KEY] = [
        ...new Set([...(c.permanent[ARAGORN_KEY] ?? []), ...moved]),
      ];
      delete c.permanent[h];
    }
  }
  // The Campaign Log keeps each player's hero count (a recorded Aragorn set
  // aside for the Fellowship Aragorn still counts).
  const counts =
    (saga || angmar ? c.seatHeroes : undefined) ??
    s.table?.seats.map((p) => p.startingHeroes.length);
  // The Road Darkens FAQ: no version of a fallen hero can be used.
  const fallen = saga || angmar ? c.fallen.map((h) => card(h).name) : [];
  requireRule(
    heroes.length === (counts?.reduce((n, x) => n + x, 0) ?? 3) &&
      new Set(heroes).size === heroes.length &&
      heroes.every(
        (h) =>
          card(h).type_code === "hero" &&
          !c.fallen.includes(h) &&
          !fallen.includes(card(h).name),
      ),
    "Choose different heroes who have not fallen, keeping each player's hero count.",
  );
  // The Ring Goes South's campaign card: "Each player may change hero cards he
  // controls without incurring the +1 threat penalty." Helm's Deep's and The
  // Passage of the Marshes' campaign cards say the same.
  const free = saga && SAGA_FREE_CHANGES.includes(next);
  // The Treason of Saruman and The Flame of the West: no card titled "Frodo
  // Baggins" can be used, and a recorded Aragorn gives way to the Fellowship
  // Aragorn without the penalty. The Land of Shadow: no card titled
  // "Aragorn", and a recorded Aragorn is replaced without the penalty.
  const title = saga
    ? sagaForbiddenTitle(next)
    : angmar
      ? angmarForbiddenTitle(next)
      : undefined;
  requireRule(
    !title || !heroes.some((h) => card(h).name === title),
    angmar
      ? "The Amarthiúl hero cannot be used until a campaign card allows it (The Battle of Carn Dûm)."
      : `No card titled ${title} can be used in ${TOS_CHAPTERS.includes(next) ? "The Treason of Saruman" : LOS_CHAPTERS.includes(next) ? "The Land of Shadow" : "The Flame of the West"}'s chapters.`,
  );
  const aragornFree =
    saga && (!!fellowshipAragornCode(next) || LOS_CHAPTERS.includes(next));
  let offset = 0;
  const seats = s.table?.seats.map((p, i) => {
    const next = heroes.slice(offset, offset + counts![i]);
    offset += counts![i];
    const nextDeckId =
      seatDeckIds?.[i] ??
      (counts![i] === 1
        ? STARTERS.find((d) => d.heroes.includes(next[0]))!.id
        : p.deckId);
    return {
      heroes: next,
      deckId: nextDeckId,
      ...(nextDeckId === "custom" && p.customDeck
        ? { cards: { ...p.customDeck } }
        : {}),
    };
  });
  let logOffset = 0;
  const groups = s.table
    ? s.table.seats.map((p, i) => {
        const before =
          (saga || angmar) && c.seatHeroes
            ? c.heroes.slice(logOffset, logOffset + counts![i])
            : p.startingHeroes;
        logOffset += counts![i];
        return { before, after: seats![i].heroes };
      })
    : [{ before: c.heroes, after: heroes }];
  const replaced = groups.flatMap(({ before, after }) => {
    let removed = before.filter((h) => !after.includes(h));
    if (saga || angmar) {
      // The Road Darkens FAQ: a hero replaced by another version of the same
      // hero (the same title) is not a replacement.
      const added = after.filter((h) => !before.includes(h));
      removed = removed.filter((h) => {
        const same = added.findIndex((x) => card(x).name === card(h).name);
        if (same < 0) return true;
        added.splice(same, 1);
        return false;
      });
    }
    if (aragornFree)
      removed = removed.filter((h) => card(h).name !== "Aragorn");
    requireRule(
      free || removed.filter((h) => !c.fallen.includes(h)).length <= 1,
      "Between quests, each player may replace fallen heroes and voluntarily change one other hero.",
    );
    return removed;
  });
  requireRule(
    !saga || sagaChapterOptions(c).includes(next),
    "The Lord of the Rings campaign follows its chapters in order.",
  );
  requireRule(
    !saga || sagaChapterSupported(next),
    "The next chapter of The Lord of the Rings campaign is not available yet.",
  );
  requireRule(
    !angmar || angmarChapterSupported(next),
    "The next chapter of the Angmar Awakened campaign is not available in campaign mode yet.",
  );
  requireRule(
    next !== "dol-guldur" || !c.prisoner || heroes.includes(c.prisoner),
    "The recorded prisoner must remain in this fellowship.",
  );
  c.threatPenalty += free ? 0 : replaced.length;
  if (saga && deckBoons) {
    requireRule(
      Object.values(deckBoons).every(
        (seat) =>
          seat === null ||
          (Number.isSafeInteger(seat) &&
            seat >= 0 &&
            seat < (s.table?.seats.length ?? 1)),
      ),
      "Choose a player's deck for each earned boon card.",
    );
    const single = Object.entries(deckBoons).filter(
      ([key]) => !key.includes("#"),
    );
    c.deckBoons = Object.fromEntries(
      single.filter(
        (entry): entry is [string, number] =>
          entry[1] !== null && c.boons.includes(entry[0]),
      ),
    );
    // Brace of Coneys: each earned copy's deck, keyed "code#copy".
    for (const [key, seat] of Object.entries(deckBoons)) {
      const [code, copy] = key.split("#");
      if (copy === undefined) continue;
      const decks = c.boonCopies?.[code];
      const i = Number(copy);
      requireRule(
        COPY_BOONS.includes(code) &&
          !!decks &&
          Number.isSafeInteger(i) &&
          i >= 0 &&
          i < decks.length,
        "Each earned copy of a boon card can join one deck.",
      );
      decks![i] = seat;
    }
  }
  if (s.table) c.seatPenalties = s.table.seats.map(() => c.threatPenalty);
  c.heroes = [...heroes];
  const d = BUILT_IN_DECKS.find((d) => d.id === deckId);
  const cards = d?.cards ?? (deckId === "custom" ? s.customDeck : undefined);
  requireRule(cards, "Choose a preconstructed deck or keep the custom deck.");
  return createGame(
    seed,
    cards,
    seats?.[0].heroes ?? heroes,
    d?.id ?? "custom",
    {
      ...(seats ? { seats } : {}),
      scenarioId: next,
      playMode: "campaign",
      campaign: c,
      includeSupport,
      guided: !!s.flow,
      reviewMode: s.flow?.mode,
      easy: s.easyMode,
    },
  );
}

export function retryAdventure(s: GameState, seed = Date.now()): GameState {
  const d = BUILT_IN_DECKS.find((d) => d.id === s.deckId);
  const cards = d?.cards ?? s.customDeck;
  requireRule(cards, "Choose a starter deck to start again.");
  requireRule(
    s.status !== "won",
    "A won campaign chapter cannot be retried from its resolved log.",
  );
  return createGame(seed, cards, s.startingHeroes, d?.id ?? "custom", {
    ...(s.table
      ? {
          seats: s.table.seats.map((p) => ({
            heroes: [...p.startingHeroes],
            deckId: p.deckId,
            ...(p.customDeck ? { cards: { ...p.customDeck } } : {}),
          })),
        }
      : {}),
    scenarioId: s.scenarioId,
    playMode: s.playMode,
    campaign: s.campaign ?? undefined,
    includeSupport: s.includeSupport,
    guided: !!s.flow,
    reviewMode: s.flow?.mode,
    easy: s.easyMode,
  });
}
