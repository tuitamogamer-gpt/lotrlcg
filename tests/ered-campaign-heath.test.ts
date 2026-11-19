import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import {
  check,
  damage,
  enemyAddedToStaging,
  revealed,
  win,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, prepend, fx, stats } from "../src/game/core";
import {
  applyAction,
  availableAbilities,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  ERED,
  ERED_ACCOLADES,
  ERED_SONGS,
  applyEredResolution,
  eredResolutionQuestions,
  newEredCampaign,
} from "../src/game/ered-campaign";
import {
  eredCampaignCommitted,
  eredCampaignPlayerAttackBonus,
  eredLayOfCourageOptions,
} from "../src/game/ered-campaign-cards";
import { WITHERED_HEATH } from "../src/game/withered-heath-support";
import type { CampaignState, GameState, Unit } from "../src/game/types";
import art from "./ered-campaign-art.json";

const d = STARTERS[0];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState, phase: GameState["phase"] = "planning") {
  Object.assign(s, { phase, choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
function opening(
  s: GameState,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  for (let i = 0; i < 160; i++) {
    if (s.choice) s = choose(s, pick(s) ?? s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  return s;
}
/** The first three chapters are recorded: The Withered Heath is next. */
function afterKings(): CampaignState {
  const c = newEredCampaign(d.heroes);
  c.completed = (
    ["journey-up-the-anduin", "lost-in-mirkwood", "the-kings-quest"] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  c.burdens = [ERED.growing, ERED.ruin, ERED.spawn];
  return c;
}
const heath = (campaign = afterKings(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "the-withered-heath",
    playMode: "campaign",
    campaign,
  });
/** A boon or Accolade attached to a hero (as its setup or the Forced effect attaches it). */
function accolade(s: GameState, code: string, hero: Unit = s.heroes[0]) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false, owner: 0 };
  hero.attachments.push(a);
  return a;
}
/** All 4 Dragon Signs reach the victory display (from wherever they are). */
function signsToVictory(s: GameState) {
  const q = s.witheredHeath!;
  const sign = WITHERED_HEATH.sign;
  q.setAside = q.setAside.filter((u) => u.code !== sign);
  q.cavesDeck = q.cavesDeck.filter((u) => u.code !== sign);
  q.removed = q.removed.filter((u) => u.code !== sign);
  q.guards = q.guards.filter((g) => g.sign.code !== sign);
  s.staging = s.staging.filter((u) => u.code !== sign);
  s.victoryCards = [
    ...(s.victoryCards ?? []).filter((c) => c !== sign),
    ...Array(4).fill(sign),
  ];
}
function inHand(s: GameState, code: string) {
  const u = make(s, code);
  u.owner = 0;
  s.hand.push(u);
  return u;
}

test("Ered Mithrin: The Withered Heath's campaign card, its four Accolades and four Songs carry their scans' texts", () => {
  const c = card(ERED.heathCard);
  assert.deepEqual([c.subtitle, c.position], ["Ered Mithrin Part 4", 174]);
  assert.match(
    c.text!,
    /^You are playing campaign mode\.\nSetup: A player may search their deck for a unique boon ally/,
  );
  assert.match(
    c.back_text!,
    /^Forced: After a main quest stage is defeated, any player who does not control an Accolade boon may attach/,
  );
  assert.match(c.back_text!, /Stage 4: Attach Dragon-slayer to a hero\./);
  assert.match(c.back_text!, /If there are 4 Dragon Sign objectives/);
  for (const [i, code] of ERED_ACCOLADES.entries()) {
    const a = card(code);
    assert.deepEqual(
      [a.type_code, a.is_unique, a.cost, a.traits, a.position],
      ["attachment", true, "0", "Accolade. Title.", 175 + i],
    );
    assert.match(a.text!, /^Permanent\.\nSetup: Attach to a hero\.\n/);
  }
  for (const [i, code] of ERED_SONGS.entries()) {
    const e = card(code);
    assert.deepEqual(
      [e.type_code, e.cost, e.traits, e.position],
      ["event", "1", "Song.", 179 + i],
    );
  }
  for (const code of [ERED.heathCard, ...ERED_ACCOLADES, ...ERED_SONGS])
    assert.ok(
      art.some((a) => a.code === code),
      card(code).name,
    );
});

test("Ered Mithrin: The Withered Heath's setup returns the Accolades to their heroes, offers the boon ally search, applies the notes and puts Abandoned Ruin into the Caves deck", () => {
  const c = afterKings();
  c.boons = [ERED.isolde, ERED.hunt];
  c.permanent = { [d.heroes[1]]: [ERED.hunt] };
  c.deckBoons = { [ERED.isolde]: 0 };
  c.notes = ["melanwar", "isolde"];
  const s = heath(c);
  // The Accolade (Permanent) returns to the hero it was earned with.
  const hero = s.heroes.find((h) => h.code === d.heroes[1])!;
  assert.ok(hero.attachments.some((a) => a.code === ERED.hunt));
  assert.equal(stats(s, hero).health, card(hero.code).health! + 1);
  // Abandoned Ruin joins The Withered Heath's Caves deck; Dagnir's Spawn the
  // encounter deck.
  assert.ok(s.witheredHeath!.cavesDeck.some((u) => u.code === ERED.ruin));
  assert.ok(s.encounterDeck.includes(ERED.spawn));
  assert.ok(valid(s));
  // The setup choices: the boon ally search, then the notes' removals.
  let t = s;
  const titles: string[] = [];
  for (let i = 0; i < 40 && (t.choice || t.phase === "setup"); i++) {
    if (!t.choice) {
      t = applyAction(reload(t), { type: "KEEP" });
      continue;
    }
    titles.push(t.choice.title);
    const take = t.choice.options.find((o) => o.code === ERED.isolde);
    t = choose(t, take?.id ?? t.choice.options[0].id);
  }

  assert.equal(
    titles.filter((x) =>
      /Remove a non-unique location from the encounter deck/.test(x),
    ).length,
    2,
  );
  assert.equal(
    titles.filter((x) => /Remove a location from the Caves deck/.test(x))
      .length,
    1,
  );
  assert.equal(
    titles.filter((x) =>
      /Remove a non-unique enemy from the encounter deck/.test(x),
    ).length,
    3,
  );
  // Isolde, assigned to the deck, is drawn or found by the search.
  assert.ok(
    t.hand.some((u) => u.code === ERED.isolde) ||
      titles.some((x) => /search their deck for a unique boon ally/.test(x)),
  );
  assert.equal(t.removed.length, 6);
  assert.ok(valid(t));
  // The search: a unique boon ally in a deck joins its player's hand.
  let u = calm(opening(heath()));
  u.deck.unshift(ERED.melanwar);
  prepend(u, fx("emcBoonAllySearch", { player: 0 }));
  flush(u);
  assert.match(u.choice!.title, /search their deck for a unique boon ally/);
  u = choose(u, u.choice!.options.find((o) => o.code === ERED.melanwar)!.id);
  assert.ok(u.hand.some((x) => x.code === ERED.melanwar));
  assert.ok(!u.deck.includes(ERED.melanwar));
  assert.ok(valid(u));
});

test("Ered Mithrin: after each of The Withered Heath's first three stages is defeated, a player without an Accolade may attach its Accolade", () => {
  /** The current main quest stage is defeated (the scenario's own advance). */
  const defeat = (g: GameState) => {
    calm(g);
    g.witheredHeath!.advancing = true;
    prepend(g, fx("heathAdvance", { player: 0 }));
    flush(g);
    check(g);
    flush(g);
    for (let i = 0; i < 10 && g.choice && !/Accolade/.test(g.choice.title); i++)
      g = choose(g, g.choice.options[0].id);
    return g;
  };
  let s = defeat(calm(opening(heath())));
  assert.equal(s.stage, 2);
  assert.match(
    s.choice!.title,
    /Stage 1 is defeated: a player without an Accolade may attach Master of the Hunt/,
  );
  const hero = s.heroes[2];
  s = choose(s, hero.id);
  assert.ok(s.heroes[2].attachments.some((a) => a.code === ERED.hunt));
  assert.ok(valid(s));
  // Stage 2: the only player already controls an Accolade, so no one can.
  s = defeat(s);
  assert.ok(!s.choice || !/Accolade/.test(s.choice.title));
  assert.deepEqual(s.eredCampaign!.accolades, [1, 2]);
});

test("Ered Mithrin: The Withered Heath's resolution adds the Accolades in play to the Campaign Pool, offers Dragon-slayer, a Song for each player and, with 4 Dragon Signs, a treasure", () => {
  const s = calm(opening(heath()));
  signsToVictory(s);
  assert.ok(valid(s));
  win(s);
  assert.equal(s.campaign!.resolution, "the-withered-heath");
  const q = eredResolutionQuestions(s);
  assert.deepEqual(
    q.map((x) => x.id),
    ["slayer", "song-0", "treasure"],
  );
  assert.equal(q[2].options.length, 3);
  const r = applyEredResolution(s, {
    slayer: s.heroes[0].code,
    "song-0": ERED.lay,
    treasure: q[2].options[0].id,
  });
  assert.ok(r.campaign!.boons.includes(ERED.slayer));
  assert.ok(r.campaign!.boons.includes(ERED.lay));
  assert.deepEqual(r.campaign!.permanent[s.heroes[0].code], [ERED.slayer]);
  assert.ok(r.campaign!.treasures!.includes(q[2].options[0].id));
  assert.ok(valid(r));
  // An Accolade in play joins the Campaign Pool with its hero.
  const t = calm(opening(heath()));
  accolade(t, ERED.unbroken, t.heroes[1]);
  win(t);
  assert.deepEqual(t.campaign!.permanent[t.heroes[1].code], [ERED.unbroken]);
  assert.ok(t.campaign!.boons.includes(ERED.unbroken));
  // Its hero's player controls an Accolade: no one may attach Dragon-slayer.
  assert.deepEqual(
    eredResolutionQuestions(t).map((x) => x.id),
    ["song-0"],
  );
  // A fallen hero's Accolade leaves the campaign with it.
  const f = calm(opening(heath()));
  accolade(f, ERED.steadfast, f.heroes[2]);
  const fallen = f.heroes[2].code;
  f.heroes = f.heroes.filter((h) => h.code !== fallen);
  f.discard.push(fallen);
  win(f);
  assert.equal(f.campaign!.permanent[fallen], undefined);
  assert.ok(!f.campaign!.boons.includes(ERED.steadfast));
  // The campaign continues with Roam Across Rhovanion.
  const u = applyEredResolution(t, { "song-0": ERED.canny });
  const next = continueCampaign(u, u.campaign!.heroes, u.deckId, true, 9);
  assert.equal(next.scenarioId, "roam-across-rhovanion");
  assert.ok(next.campaign!.boons.includes(ERED.canny));
});

test("Ered Mithrin: in a two-player game each player chooses a different Song", () => {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  const c = newEredCampaign(
    seats.flatMap((p) => p.heroes),
    [3, 3],
  );
  c.completed = (
    ["journey-up-the-anduin", "lost-in-mirkwood", "the-kings-quest"] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  const s = calm(
    opening(
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "the-withered-heath",
        playMode: "campaign",
        campaign: c,
        seats,
      }),
    ),
  );
  win(s);
  const ids = eredResolutionQuestions(s).map((x) => x.id);
  assert.ok(ids.includes("song-0") && ids.includes("song-1"));
  assert.throws(
    () =>
      applyEredResolution(s, {
        slayer: "none",
        "song-0": ERED.tale,
        "song-1": ERED.tale,
      }),
    /different Song/,
  );
  const r = applyEredResolution(s, {
    slayer: "none",
    "song-0": ERED.tale,
    "song-1": ERED.rhyme,
  });
  assert.ok(
    ERED_SONGS.filter((x) => r.campaign!.boons.includes(x)).length === 2,
  );
});

test("Ered Mithrin: Master of the Hunt and The Steadfast respond after their hero commits to the quest", () => {
  let s = calm(opening(heath()), "quest");
  const hero = s.heroes[0];
  accolade(s, ERED.hunt, hero);
  accolade(s, ERED.steadfast, s.heroes[1]);
  hero.committed = true;
  s.heroes[1].committed = true;
  s.threat = 40;
  const top = s.deck.slice(0, 3);
  const progress = s.progress;
  eredCampaignCommitted(s);
  flush(s);
  // The Steadfast: 1 progress on the current quest at 40 threat.
  assert.equal(s.progress, progress + 1);
  assert.match(s.choice!.title, /Master of the Hunt · Choose a player/);
  s = choose(s, "0");
  assert.match(s.choice!.title, /Put 1 of these cards on top/);
  s = choose(s, "2");
  assert.equal(s.deck[0], top[2]);
  if (s.choice) s = choose(s, s.choice.options[0].id);
  assert.deepEqual(new Set(s.deck.slice(-2)), new Set([top[0], top[1]]));
  // Below 40 threat, The Steadfast places nothing.
  const t = calm(opening(heath()), "quest");
  accolade(t, ERED.steadfast);
  t.heroes[0].committed = true;
  t.threat = 39;
  const p = t.progress;
  eredCampaignCommitted(t);
  flush(t);
  assert.equal(t.progress, p);
});

test("Ered Mithrin: Unbroken heals 1 for a discarded card once each round, and Dragon-slayer engages a non-unique enemy added to the staging area", () => {
  let s = calm(opening(heath()));
  const hero = s.heroes[0];
  const a = accolade(s, ERED.unbroken, hero);
  hero.damage = 2;
  const ability = availableAbilities(s, hero).find((x) => x.id === a.id);
  assert.ok(ability && !ability.disabled, JSON.stringify(ability));
  s = applyAction(reload(s), {
    type: "ABILITY",
    id: hero.id,
    attachmentId: a.id,
  } as never);
  const hand = s.hand.length;
  s = choose(s, s.hand[0].id);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.hand.length, hand - 1);
  assert.ok(
    availableAbilities(s, s.heroes[0]).find((x) => x.id === a.id)!.disabled,
    "once each round",
  );
  // Dragon-slayer: exhaust it to engage the enemy, which attacks.
  const t = calm(opening(heath()), "staging");
  const slayer = accolade(t, ERED.slayer);
  const enemy = make(t, "octgn:9b3c0e2a-c874-41b7-9ccd-2798a4884b34"); // Giant Spider
  t.staging.push(enemy);
  enemyAddedToStaging(t, enemy);
  flush(t);
  assert.match(
    t.choice!.title,
    /Dragon-slayer · Exhaust it to engage Giant Spider/,
  );
  const u = choose(t, "use");
  assert.ok(u.engaged.some((x) => x.id === enemy.id) || !!u.combat);
  assert.equal(
    u.heroes[0].attachments.find((x) => x.id === slayer.id)!.exhausted,
    true,
  );
  assert.equal(
    stats(u, u.heroes[0]).attack,
    card(u.heroes[0].code).attack! + 1,
  );
});

test("Ered Mithrin: The Canny Huntsman, A Tale of Victories, Lay of Courage and Rhyme of the Slayer resolve as printed", () => {
  // The Canny Huntsman: look at the top 5, put them on top or the bottom;
  // the hero with Master of the Hunt gets +3 willpower this phase.
  let s = calm(opening(heath()), "quest");
  accolade(s, ERED.hunt);
  for (const h of s.heroes) h.resources = 3;
  const canny = inHand(s, ERED.canny);
  const top5 = s.encounterDeck.slice(0, 5);
  const will = stats(s, s.heroes[0]).will;
  s = applyAction(reload(s), { type: "PLAY", id: canny.id } as never);
  for (let i = 0; i < 6 && s.choice; i++)
    s = choose(
      s,
      s.choice.options.find((o) => o.id.startsWith(i < 2 ? "top:" : "bottom:"))!
        .id,
    );
  assert.equal(stats(s, s.heroes[0]).will, will + 3);
  assert.equal(
    s.encounterDeck.length,
    top5.length + (s.encounterDeck.length - 5),
  );
  assert.deepEqual(
    new Set([...s.encounterDeck.slice(0, 2), ...s.encounterDeck.slice(-3)]),
    new Set(top5),
  );
  // A Tale of Victories: draw a card for each engaged enemy, heal 3 from the
  // Unbroken hero and cancel 3 of its next damage this phase.
  let t = calm(opening(heath()), "defense");
  const unbroken = t.heroes[1];
  accolade(t, ERED.unbroken, unbroken);
  unbroken.damage = 3;
  for (const h of t.heroes) h.resources = 3;
  t.engaged.push(make(t, "01111"));
  const tale = inHand(t, ERED.tale);
  const hand = t.hand.length;
  t = applyAction(reload(t), { type: "PLAY", id: tale.id } as never);
  assert.equal(t.heroes[1].damage, 0);
  assert.equal(t.hand.length, hand - 1 + 1);
  damage(t, t.heroes[1].id, 4);
  flush(t);
  assert.equal(t.heroes[1].damage, 1);
  // Rhyme of the Slayer: the enemy gets −4 attack; the Dragon-slayer hero +4
  // attacking it this phase.
  let r = calm(opening(heath()), "attack");
  accolade(r, ERED.slayer);
  for (const h of r.heroes) h.resources = 3;
  const goblin = make(r, "octgn:23fb0422-0e54-4064-bb76-e5bf3c214709"); // Stone-troll (6 attack)
  r.engaged.push(goblin);
  const before = stats(r, goblin).attack;
  const rhyme = inHand(r, ERED.rhyme);
  r = applyAction(reload(r), { type: "PLAY", id: rhyme.id } as never);
  r = choose(r, goblin.id);
  const g = r.engaged.find((x) => x.id === goblin.id)!;
  assert.equal(stats(r, g).attack, before - 4);
  assert.equal(eredCampaignPlayerAttackBonus(r, r.heroes[0], g), 4);
  assert.equal(eredCampaignPlayerAttackBonus(r, r.heroes[1], g), 0);
  // Lay of Courage: offered when a card is revealed in the quest phase; it
  // cancels the when-revealed effects, readies The Steadfast's hero and goes
  // to the victory display.
  let l = calm(opening(heath()), "staging");
  accolade(l, ERED.steadfast);
  l.heroes[0].exhausted = true;
  for (const h of l.heroes) h.resources = 3;
  inHand(l, ERED.lay);
  assert.equal(
    eredLayOfCourageOptions(l, fx("placeEncounter", { code: "01112" })).length,
    1,
  );
  l.encounterDeck.unshift("01112");
  revealed(l, "01112");
  flush(l);
  assert.match(l.choice!.title, /Revealed: Massing at Night/);
  l = choose(l, "lay");
  for (let i = 0; i < 5 && l.choice; i++) l = choose(l, l.choice.options[0].id);
  assert.ok(l.victoryCards?.includes(ERED.lay));
  assert.equal(l.heroes[0].exhausted, false);
  // Outside the quest phase it is not offered.
  const o = calm(opening(heath()), "encounter");
  inHand(o, ERED.lay);
  assert.equal(
    eredLayOfCourageOptions(o, fx("placeEncounter", { code: "01112" })).length,
    0,
  );
});
