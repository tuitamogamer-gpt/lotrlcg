import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards, STARTERS } from "../src/game/cards";
import { win } from "../src/game/board";
import { createGame, validateSave } from "../src/game/engine";
import { continueCampaign, retryAdventure } from "../src/game/campaign";
import { automatedScenarioId } from "../src/game/support";
import { ringBearer } from "../src/game/lotr-saga";
import { RS } from "../src/game/ring-south-support";
import { scenario } from "../src/game/scenarios";
import {
  NIGHTMARE,
  nightmareCardOf,
  nightmareSupported,
} from "../src/game/nightmare";
import {
  applySagaResolution,
  newSagaCampaign,
  SAGA,
  SAGA_CAMPAIGN_CARDS,
  SAGA_CAMPAIGN_ORDER,
  sagaCampaignCard,
  sagaResolutionQuestions,
  SOUTH_BOONS,
} from "../src/game/saga-campaign";
import type { GameState, ScenarioId } from "../src/game/types";
import {
  autoplay,
  calm,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";

type Recipe = {
  id: string;
  name: string;
  mode: string;
  campaign: boolean;
  sections: Record<string, Record<string, number>>;
};
const recipes = JSON.parse(
  readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
) as Recipe[];
const recipe = (id: string) => recipes.find((r) => r.id === id)!;
/** The chapters whose Nightmare Decks are supported, in campaign order (N0C.01–12). */
const CHAPTERS = SAGA_CAMPAIGN_ORDER.filter((id) => nightmareSupported(id));
const number = (i: number) => String(i + 1).padStart(2, "0");
/** Starter decks without a Frodo Baggins or an Aragorn (The Treason of Saruman and The Land of Shadow forbid them). */
const DECKS = STARTERS.filter((d) =>
  d.heroes.every((h) => !["Frodo Baggins", "Aragorn"].includes(card(h).name)),
);
const d = STARTERS[0];
const ENCOUNTER = new Set(encounterCards.map((c) => c.code));
type Mode = "standard" | "nightmare" | "campaign" | "nightmare campaign";
/**
 * A chapter set up in one of the four ways, its Campaign Log blank but for
 * the chapters before it.
 */
function chapter(id: ScenarioId, mode: Mode, seed = 7, players = 1) {
  const decks: (typeof DECKS)[number][] = [];
  for (const x of DECKS)
    if (
      decks.length < players &&
      !x.heroes.some((h) =>
        decks.some((y) => y.heroes.some((z) => card(z).name === card(h).name)),
      )
    )
      decks.push(x);
  const seats =
    players > 1
      ? decks.map((x) => ({ heroes: [...x.heroes], deckId: x.id }))
      : undefined;
  const i = SAGA_CAMPAIGN_ORDER.indexOf(id);
  const campaign = mode === "campaign" || mode === "nightmare campaign";
  const nightmare = mode === "nightmare" || mode === "nightmare campaign";
  return createGame(seed, decks[0].cards, decks[0].heroes, decks[0].id, {
    scenarioId: id,
    ...(seats ? { seats } : {}),
    ...(campaign ? { playMode: "campaign" as const } : {}),
    // A Shadow of the Past begins the campaign; a later chapter continues one.
    ...(campaign && i > 0
      ? {
          campaign: {
            ...newSagaCampaign(
              decks.flatMap((x) => x.heroes),
              seats?.map((p) => p.heroes.length),
            ),
            ...(nightmare ? { nightmare: true } : {}),
            completed: SAGA_CAMPAIGN_ORDER.slice(0, i).map((scenarioId) => ({
              scenarioId,
              score: 0,
              rounds: 1,
            })),
          },
        }
      : nightmare
        ? { nightmare: true }
        : {}),
  });
}
/** Every encounter card in play, set aside or in an encounter pile (the log and pending choices aside). */
function encounterCount(s: GameState) {
  const rest: Record<string, unknown> = { ...s };
  for (const key of [
    "log",
    "flow",
    "choice",
    "queue",
    "lastReveal",
    "lastQuest",
    "peek",
    "used",
    "campaign",
    "startingHeroes",
  ])
    delete rest[key];
  const out: Record<string, number> = {};
  for (const m of JSON.stringify(rest).matchAll(
    /"((?:octgn:)?[0-9a-f-]{5,})"/g,
  ))
    if (ENCOUNTER.has(m[1])) out[m[1]] = (out[m[1]] ?? 0) + 1;
  return out;
}
const minus = (a: Record<string, number>, b: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const v = (a[k] ?? 0) - (b[k] ?? 0);
    if (v) out[k] = v;
  }
  return out;
};
/** Win the current chapter and record its resolution (each question's first answer unless given). */
function finish(s: GameState, answers: Record<string, string> = {}) {
  calm(s);
  win(s);
  return s.campaign!.resolution
    ? applySagaResolution(s, {
        ...Object.fromEntries(
          sagaResolutionQuestions(s).map((q) => [q.id, q.options[0].id]),
        ),
        ...answers,
      })
    : s;
}

test("Nightmare campaign: each campaign mode Nightmare recipe (N0C) is its scenario's Nightmare recipe with the campaign mode recipe's own cards, and the audit counts all twelve", () => {
  assert.equal(CHAPTERS.length, 12);
  assert.deepEqual(CHAPTERS, SAGA_CAMPAIGN_ORDER.slice(0, 12));
  const delta = (a: Recipe, b: Recipe) => {
    const out: Record<string, number> = {};
    for (const section of new Set([
      ...Object.keys(a.sections),
      ...Object.keys(b.sections),
    ]))
      for (const code of new Set([
        ...Object.keys(a.sections[section] ?? {}),
        ...Object.keys(b.sections[section] ?? {}),
      ])) {
        const v =
          (b.sections[section]?.[code] ?? 0) -
          (a.sections[section]?.[code] ?? 0);
        if (v) out[`${section} ${code}`] = v;
      }
    return out;
  };
  CHAPTERS.forEach((id, i) => {
    const nightmare = recipe(`N0B.${number(i)}`),
      campaign = recipe(`N0C.${number(i)}`);
    assert.equal(campaign.mode, "nightmare");
    assert.equal(campaign.campaign, true);
    for (const r of [nightmare, campaign])
      assert.equal(automatedScenarioId(r), id, r.id);
    const own = delta(recipe(`Q0B.${number(i)}`), recipe(`Q0C.${number(i)}`));
    const added = delta(nightmare, campaign);
    // The Ring Goes South's standard Nightmare recipe omits Lust for the
    // Ring, which stage 1A sets aside in every mode; its campaign mode
    // Nightmare recipe keeps it, as the engine does in both.
    if (id === "the-ring-goes-south") {
      assert.equal(card(RS.lust).name, "Lust for the Ring");
      assert.equal(added[`sharedStagingArea ${RS.lust}`], 1);
      delete added[`sharedStagingArea ${RS.lust}`];
    }
    assert.deepEqual(added, own, id);
    assert.ok(Object.keys(own).length > 0, id);
  });
});

test("Nightmare campaign: each chapter's setup adds its campaign card's cards to its Nightmare Deck exactly as the campaign adds them to the standard deck", () => {
  /** The campaign mode cards each chapter brings with a blank Campaign Log (the players' choices aside). */
  const CAMPAIGN: Partial<Record<ScenarioId, string[]>> = {
    "a-shadow-of-the-past": [
      SAGA.gildor,
      SAGA.ringDraws,
      SAGA.delay,
      SAGA.underhill,
    ],
    "the-ring-goes-south": [...SOUTH_BOONS],
    "journey-in-the-dark": [
      SAGA.pursued,
      SAGA.shadowFear,
      SAGA.wound,
      SAGA.grief,
    ],
    "breaking-of-the-fellowship": [SAGA.night, SAGA.illFate],
    "the-road-to-isengard": [SAGA.voice],
    "the-passage-of-the-marshes": [SAGA.searchingEye],
    "shelobs-lair": [SAGA.heavy],
  };
  for (const id of CHAPTERS)
    for (const players of id === "flight-to-the-ford" ||
    id === "the-passage-of-the-marshes"
      ? [1, 2]
      : [1]) {
      const [standard, nightmare, campaign, both] = (
        ["standard", "nightmare", "campaign", "nightmare campaign"] as const
      ).map((mode) => opening(chapter(id, mode, 7, players)));
      const label = `${id} (${players})`;
      assert.equal(both.nightmareMode, true, label);
      assert.equal(both.campaign!.nightmare, true, label);
      assert.equal(nightmareCardOf(both), NIGHTMARE[id]!.card, label);
      assert.equal(sagaCampaignCard(both), SAGA_CAMPAIGN_CARDS[id], label);
      assert.ok(valid(both), label);
      assert.ok(
        both.log.some(
          (l) =>
            l.text ===
            `${scenario(id).name} · The Lord of the Rings campaign · Nightmare mode.`,
        ),
        label,
      );
      const added = minus(encounterCount(both), encounterCount(nightmare));
      assert.deepEqual(
        added,
        minus(encounterCount(campaign), encounterCount(standard)),
        label,
      );
      for (const code of CAMPAIGN[id] ?? [])
        assert.ok((added[code] ?? 0) >= 1, `${label}: ${card(code).name}`);
    }
  // A Shadow of the Past's campaign card beside its Nightmare Deck: Mr.
  // Underhill on the Ring-bearer, Gandalf's Delay in the staging area, Gildor
  // Inglorion and The Ring Draws Them in the encounter deck.
  const s = opening(chapter("a-shadow-of-the-past", "nightmare campaign"));
  assert.ok(ringBearer(s)!.attachments.some((a) => a.code === SAGA.underhill));
  assert.ok(s.staging.some((u) => u.code === SAGA.delay));
  for (const code of [SAGA.gildor, SAGA.ringDraws])
    assert.equal(s.encounterDeck.filter((c) => c === code).length, 1);
  // Shelob's Lair: A Heavy Burden on the Ring-bearer.
  const lair = opening(chapter("shelobs-lair", "nightmare campaign"));
  assert.ok(ringBearer(lair)!.attachments.some((a) => a.code === SAGA.heavy));
});

test("Nightmare campaign: chosen as The Lord of the Rings campaign begins, it follows each chapter with a Nightmare Deck, leaves the others as they are, and a retried chapter keeps it", () => {
  let s = createGame(11, d.cards, d.heroes, d.id, {
    scenarioId: "a-shadow-of-the-past",
    playMode: "campaign",
    nightmare: true,
  });
  assert.equal(s.campaign!.nightmare, true);
  assert.equal(s.nightmareMode, true);
  assert.equal(nightmareCardOf(s), NIGHTMARE["a-shadow-of-the-past"]!.card);
  assert.equal(sagaCampaignCard(s), SAGA.shadowCard);
  assert.ok(valid(s));
  const retried = retryAdventure(s, 3);
  assert.equal(retried.nightmareMode, true);
  assert.equal(retried.campaign!.nightmare, true);
  s = finish(opening(s), { burden: SAGA.delay, boon: SAGA.underhill });
  // The Old Forest has no Nightmare Deck: it is played as usual.
  let o = continueCampaign(
    s,
    d.heroes,
    d.id,
    true,
    2,
    undefined,
    "the-old-forest",
  );
  assert.equal(o.nightmareMode, undefined);
  assert.equal(o.campaign!.nightmare, true);
  assert.equal(nightmareCardOf(o), undefined);
  assert.ok(valid(o));
  assert.ok(
    o.log.some(
      (l) =>
        l.text ===
        "The Old Forest · The Lord of the Rings campaign · no Nightmare Deck for this chapter.",
    ),
  );
  assert.equal(retryAdventure(o, 4).nightmareMode, undefined);
  o = finish(opening(o));
  // A Knife in the Dark returns to its Nightmare Deck.
  const k = continueCampaign(
    o,
    d.heroes,
    d.id,
    true,
    3,
    undefined,
    "a-knife-in-the-dark",
  );
  assert.equal(k.nightmareMode, true);
  assert.equal(nightmareCardOf(k), NIGHTMARE["a-knife-in-the-dark"]!.card);
  assert.equal(sagaCampaignCard(k), SAGA.knifeCard);
  assert.ok(valid(opening(k)));
  // Outside campaign mode a retried Nightmare game keeps its Nightmare Deck.
  const lost = opening(nightmareGame("a-knife-in-the-dark", 4));
  lost.status = "lost";
  assert.equal(retryAdventure(lost, 5).nightmareMode, true);
  const normal = opening(chapter("a-knife-in-the-dark", "standard"));
  normal.status = "lost";
  assert.equal(retryAdventure(normal, 5).nightmareMode, undefined);
});

test("Nightmare campaign: only The Lord of the Rings campaign takes the Nightmare Decks, chosen as it begins and never with easy mode; saves keep each chapter in step with the Campaign Log", () => {
  // The Angmar Awakened campaign (Intruders in Chetwood has a Nightmare Deck).
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "intruders-in-chetwood",
        playMode: "campaign",
        nightmare: true,
      }),
    /Nightmare Deck is not available in this game mode/,
  );
  // A campaign in progress keeps the choice its Campaign Log records.
  const begun = finish(
    opening(
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "a-shadow-of-the-past",
        playMode: "campaign",
      }),
    ),
  );
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "a-knife-in-the-dark",
        playMode: "campaign",
        campaign: begun.campaign!,
        nightmare: true,
      }),
    /Nightmare Deck is not available in this game mode/,
  );
  assert.throws(
    () =>
      createGame(1, d.cards, d.heroes, d.id, {
        scenarioId: "a-shadow-of-the-past",
        playMode: "campaign",
        nightmare: true,
        easy: true,
      }),
    /never with easy mode/,
  );
  const s = chapter("journey-in-the-dark", "nightmare campaign");
  const changed = (f: (t: GameState) => void) => {
    const t = structuredClone(s);
    f(t);
    return validateSave(JSON.parse(JSON.stringify(t)));
  };
  assert.ok(changed(() => {}));
  assert.equal(
    changed((t) => delete t.nightmareMode),
    false,
  );
  assert.equal(
    changed((t) => delete t.campaign!.nightmare),
    false,
  );
  assert.equal(
    changed((t) => (t.campaign!.nightmare = false)),
    false,
  );
  assert.equal(
    changed((t) => (t.easyMode = true)),
    false,
  );
  // A standard campaign chapter cannot claim Nightmare mode.
  const plain = chapter("journey-in-the-dark", "campaign");
  assert.ok(valid(plain));
  plain.nightmareMode = true;
  assert.equal(valid(plain), false);
  // Nor can another campaign record the Nightmare Decks.
  const angmar = createGame(1, d.cards, d.heroes, d.id, {
    scenarioId: "intruders-in-chetwood",
    playMode: "campaign",
  });
  assert.ok(valid(angmar));
  angmar.campaign!.nightmare = true;
  assert.equal(valid(angmar), false);
});

test("Nightmare campaign: each chapter's seeded solo and two-player games keep valid saves", () => {
  CHAPTERS.forEach((id, i) => {
    for (const players of [1, 2]) {
      let s = opening(chapter(id, "nightmare campaign", 201 + i, players));
      let ok = valid(s);
      for (let step = 0; step < 4 && s.status === "playing" && ok; step++) {
        s = autoplay(s, 500);
        ok = valid(s);
      }
      assert.ok(ok, `${id} (${players}) at round ${s.round}`);
    }
  });
});
