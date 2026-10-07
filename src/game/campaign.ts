// Mirkwood Paths campaign log, rewards and chapter continuation.
import { card, STARTERS } from "./cards";
import { BUILT_IN_DECKS } from "./built-in-decks";
import type { GameState, CampaignState } from "./types";
import { SCENARIOS } from "./scenarios";

import { allCharacters, allHeroes, seatIndices, seatView } from "./table";

import { log, random, requireRule } from "./core";

import { createGame } from "./setup";
import { score } from "./actions";

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
): GameState {
  requireRule(
    s.status === "won" && s.campaign && s.campaign.completed.length < 3,
    "Win the current chapter before continuing.",
  );
  const c = structuredClone(s.campaign);
  requireRule(
    heroes.length ===
      (s.table?.seats.flatMap((p) => p.startingHeroes).length ?? 3) &&
      new Set(heroes).size === heroes.length &&
      heroes.every(
        (h) => card(h).type_code === "hero" && !c.fallen.includes(h),
      ),
    "Choose different heroes who have not fallen, keeping each player's hero count.",
  );
  let offset = 0;
  const seats = s.table?.seats.map((p, i) => {
    const next = heroes.slice(offset, offset + p.startingHeroes.length);
    offset += p.startingHeroes.length;
    const nextDeckId =
      seatDeckIds?.[i] ??
      (p.startingHeroes.length === 1
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
  const groups = s.table
    ? s.table.seats.map((p, i) => ({
        before: p.startingHeroes,
        after: seats![i].heroes,
      }))
    : [{ before: c.heroes, after: heroes }];
  const replaced = groups.flatMap(({ before, after }) => {
    const removed = before.filter((h) => !after.includes(h));
    requireRule(
      removed.filter((h) => !c.fallen.includes(h)).length <= 1,
      "Between quests, each player may replace fallen heroes and voluntarily change one other hero.",
    );
    return removed;
  });
  const next = SCENARIOS[c.completed.length].id;
  requireRule(
    next !== "dol-guldur" || !c.prisoner || heroes.includes(c.prisoner),
    "The recorded prisoner must remain in this fellowship.",
  );
  c.threatPenalty += replaced.length;
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
