import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { check, revealed, shadow, win } from "../src/game/board";
import { flush } from "../src/game/effects";
import { draw, make, stats, threatOf } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { continueCampaign } from "../src/game/campaign";
import {
  ERED,
  applyEredResolution,
  cunningLeft,
  eredResolutionQuestions,
  newEredCampaign,
  urdugUnit,
} from "../src/game/ered-campaign";
import { eredCampaignCannotAttach } from "../src/game/ered-campaign-cards";
import { playerCardImmune } from "../src/game/card-immunity";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
import { forOwner, seatView } from "../src/game/table";
import type { CampaignState, GameState } from "../src/game/types";
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
/** The first four chapters are recorded: Roam Across Rhovanion is next. */
function afterHeath(): CampaignState {
  const c = newEredCampaign(d.heroes);
  c.completed = (
    [
      "journey-up-the-anduin",
      "lost-in-mirkwood",
      "the-kings-quest",
      "the-withered-heath",
    ] as const
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 6 }));
  c.burdens = [ERED.growing, ERED.ruin, ERED.spawn];
  return c;
}
const roam = (campaign = afterHeath(), seed = 5) =>
  createGame(seed, d.cards, d.heroes, d.id, {
    scenarioId: "roam-across-rhovanion",
    playMode: "campaign",
    campaign,
  });
/** Answer each choice titled like `title` with the option `id`. */
const answer =
  (title: RegExp, id: string, seen: string[] = []) =>
  (s: GameState) => {
    seen.push(s.choice!.title);
    return title.test(s.choice!.title) ? id : undefined;
  };
const count = (codes: string[], code: string) =>
  codes.filter((c) => c === code).length;
/** A set-aside objective of Roam Across Rhovanion (Tiny, Durin's Key, Urdug's Horn). */
function aside(s: GameState, code: string) {
  const q = s.roamRhovanion!;
  const i = q.setAside.findIndex((u) => u.code === code);
  assert.ok(i >= 0, card(code).name);
  return q.setAside.splice(i, 1)[0];
}

test("Ered Mithrin: Roam Across Rhovanion's campaign card, Urdug's Cunning and Misplaced Trust carry their scans' texts", () => {
  const c = card(ERED.roamCard);
  assert.deepEqual(
    [c.type_code, c.subtitle, c.position],
    ["campaign", "Ered Mithrin Part 5", 183],
  );
  assert.match(
    c.text!,
    /search the encounter deck for 3 non-unique enemies not named Grey Mountain Giant and remove them from the game\. The first player may put their trust in Urdug by placing a resource on him \(from the token pool\)\./,
  );
  assert.match(
    c.back_text!,
    /^Forced: After the first player claims an objective, they may put their trust in Urdug/,
  );
  assert.match(
    c.back_text!,
    /Ignore the deep keyword\. Urdug gets \+1 \[willpower\], \+1 \[threat\], \+1 \[attack\], and \+1 \[defense\] for each resource on him\./,
  );
  assert.match(
    c.back_text!,
    /Players must choose different locations, if able\.$/,
  );
  const cunning = card(ERED.cunning);
  assert.deepEqual(
    [
      cunning.type_code,
      cunning.sphere_code,
      cunning.quantity,
      cunning.position,
    ],
    ["treachery", "burden", 4, 184],
  );
  assert.match(
    cunning.text!,
    /^Doomed 1\. Surge\.\nWhen Revealed: Discard the top 5 cards of the encounter deck\. For each enemy discarded this way, each player must deal 1 damage to a character they control\.$/,
  );
  assert.equal(
    cunning.shadow,
    "Shadow: Attacking enemy gets +2 [defense] this phase.",
  );
  const trust = card(ERED.misplaced);
  assert.deepEqual(
    [trust.type_code, trust.sphere_code, trust.quantity, trust.position],
    ["treachery", "burden", 4, 185],
  );
  assert.match(
    trust.text!,
    /^Setup: Shuffle Misplaced Trust into your deck\. \(Do this after drawing your starting hand\.\)\nForced: After you draw this card, attach it to a hero you control\./,
  );
  for (const code of [ERED.roamCard, ERED.cunning, ERED.misplaced])
    assert.ok(
      art.some((a) => a.code === code),
      card(code).name,
    );
});

test("Ered Mithrin: Roam Across Rhovanion's setup removes 3 non-unique enemies other than Grey Mountain Giants and offers the first player's trust in Urdug", () => {
  const c = afterHeath();
  c.notes = ["melanwar"];
  const titles: string[] = [];
  const removed: string[][] = [];
  const s = opening(roam(c), (x) => {
    titles.push(x.choice!.title);
    if (
      /Remove a non-unique enemy not named Grey Mountain Giant/.test(
        x.choice!.title,
      )
    )
      removed.push(x.choice!.options.map((o) => o.code!));
    return undefined;
  });
  assert.equal(removed.length, 3);
  for (const options of removed) {
    assert.ok(options.length > 0);
    assert.ok(options.every((code) => card(code).type_code === "enemy"));
    assert.ok(!options.includes(R.giant));
    assert.ok(options.every((code) => !card(code).is_unique));
  }
  assert.equal(s.removed.length, 3);
  assert.ok(s.encounterDeck.includes(R.giant));
  // Once the scenario's setup gives the first player control of Urdug, the
  // campaign card offers their trust (the first option: a resource on him).
  assert.ok(
    titles.some((t) =>
      /^Roam Across Rhovanion · Setup: put your trust in Urdug\?/.test(t),
    ),
  );
  const urdug = s.allies.find((u) => u.code === R.urdug)!;
  assert.equal(urdug.resources, 1);
  // "Urdug gets +1 [willpower], +1 [threat], +1 [attack], and +1 [defense]
  // for each resource on him."
  assert.deepEqual(
    [stats(s, urdug).will, stats(s, urdug).attack, stats(s, urdug).defense],
    [3, 4, 3],
  );
  urdug.resources = 3;
  assert.deepEqual(
    [stats(s, urdug).will, stats(s, urdug).attack, stats(s, urdug).defense],
    [5, 6, 5],
  );
  assert.deepEqual(s.eredCampaign!.claimed, [R.urdug]);
  assert.ok(valid(s));
  // As an enemy (Urdug's Gambit) he keeps his resources and their threat.
  const enemy = make(s, R.urdugEnemy);
  s.staging.push(enemy);
  const base = threatOf(s, enemy);
  enemy.resources = 2;
  assert.equal(threatOf(s, enemy), base + 2);
  // Outside the campaign the resources give nothing.
  const normal = opening(
    createGame(5, d.cards, d.heroes, d.id, {
      scenarioId: "roam-across-rhovanion",
    }),
  );
  const plain = normal.allies.find((u) => u.code === R.urdug)!;
  plain.resources = 2;
  assert.equal(stats(normal, plain).will, 2);
});

test("Ered Mithrin: declining to trust Urdug shuffles a copy of Urdug's Cunning into the encounter deck, while copies remain", () => {
  let s = opening(roam(), answer(/put your trust in Urdug\?/, "cunning"));
  assert.equal(s.allies.find((u) => u.code === R.urdug)!.resources, 0);
  assert.equal(count(s.encounterDeck, ERED.cunning), 1);
  assert.equal(s.eredCampaign!.cunning, 1);
  assert.equal(cunningLeft(s), 3);
  // Each claim offers it again: the 4 printed copies are the limit.
  s = calm(s);
  s.eredCampaign!.cunning = 4;
  s.encounterDeck.push(ERED.cunning, ERED.cunning, ERED.cunning);
  const tiny = aside(s, R.tiny);
  tiny.owner = 0;
  s.allies.push(tiny);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Tiny is claimed: put your trust in Urdug\?/);
  assert.match(
    s.choice!.options.find((o) => o.id === "cunning")!.label,
    /no copy of Urdug's Cunning is left/,
  );
  s = choose(s, "cunning");
  assert.equal(count(s.encounterDeck, ERED.cunning), 4);
  assert.ok(valid(s));
});

test("Ered Mithrin: each objective the first player claims in Roam Across Rhovanion offers their trust in Urdug again", () => {
  let s = calm(opening(roam()));
  const urdug = s.allies.find((u) => u.code === R.urdug)!;
  assert.equal(urdug.resources, 1);
  // Rescue Tiny: Tiny is free of encounters and the first player gains
  // control of him.
  const tiny = aside(s, R.tiny);
  tiny.owner = 0;
  s.allies.push(tiny);
  check(s);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Roam Across Rhovanion · Tiny is claimed: put your trust in Urdug\?/,
  );
  s = choose(s, "trust");
  assert.equal(urdugUnit(s)!.resources, 2);
  // Find Durin's Key: the first player attaches it to a hero they control.
  const key = aside(s, R.key);
  s.heroes[0].attachments.push({ id: key.id, code: R.key, exhausted: false });
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Durin's Key is claimed/);
  s = choose(s, "cunning");
  assert.equal(urdugUnit(s)!.resources, 2);
  assert.equal(count(s.encounterDeck, ERED.cunning), 1);
  // Sneaking Off: Urdug becomes a guarded objective (no claim), and his Horn
  // is attached to him there; when he is free again, the first player claims
  // him.
  const guard = make(s, R.moor);
  s.staging.push(guard);
  const u = urdugUnit(s)!;
  s.allies = s.allies.filter((x) => x.id !== u.id);
  s.roamRhovanion!.guarded.push({ card: u, guardId: guard.id });
  check(s);
  flush(s);
  assert.equal(s.choice, null);
  assert.deepEqual(s.eredCampaign!.claimed, [R.tiny, R.key]);
  const horn = aside(s, R.horn);
  u.attachments.push({ id: horn.id, code: R.horn, exhausted: false });
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Urdug's Horn is claimed/);
  s = choose(s, "trust");
  const g = s.roamRhovanion!.guarded.find((x) => x.card.code === R.urdug)!;
  s.roamRhovanion!.guarded = s.roamRhovanion!.guarded.filter((x) => x !== g);
  s.allies.push(g.card);
  check(s);
  flush(s);
  assert.match(s.choice!.title, /Urdug is claimed/);
  s = choose(s, "trust");
  assert.equal(urdugUnit(s)!.resources, 4);
  assert.deepEqual(
    [...s.eredCampaign!.claimed!].sort(),
    [R.horn, R.key, R.tiny, R.urdug].sort(),
  );
  assert.ok(valid(s));
});

test("Ered Mithrin: Urdug's Cunning discards the top 5 encounter cards and makes each player deal 1 damage per enemy; its shadow gives +2 defense", () => {
  let s = calm(opening(roam()), "staging");
  const top = [R.eagle, R.ravine, R.bear, R.slopes, R.ravine];
  s.encounterDeck = [
    ...top,
    R.moor,
    ...s.encounterDeck.filter((c) => c !== R.moor),
  ];
  const threat = s.threat;
  const damage = (x: GameState) =>
    [...x.heroes, ...x.allies].reduce((n, c) => n + c.damage, 0);
  const before = damage(s);
  revealed(s, ERED.cunning);
  flush(s);
  for (let i = 0; i < 10 && s.choice; i++)
    s = choose(s, s.choice!.options[0].id);
  // Doomed 1 and 2 enemies discarded: 2 damage among your characters.
  assert.equal(s.threat, threat + 1);
  assert.equal(damage(s), before + 2);
  assert.deepEqual(s.encounterDiscard.slice(-6), [...top, ERED.cunning]);
  // Surge: Grey Moorland was revealed next.
  assert.ok(s.staging.some((u) => u.code === R.moor));
  assert.ok(valid(s));
  // Shadow: the attacking enemy gets +2 defense this phase.
  const t = calm(opening(roam()), "defense");
  const enemy = make(t, R.bear);
  t.engaged.push(enemy);
  const defense = stats(t, enemy).defense;
  t.combat = {
    enemyId: enemy.id,
    defenderId: t.heroes[0].id,
    defenderIds: [t.heroes[0].id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  shadow(t, ERED.cunning);
  assert.equal(stats(t, enemy).defense, defense + 2);
});

test("Ered Mithrin: Misplaced Trust joins its player's deck after the starting hand, stays out of a mulligan and attaches to a hero when drawn", () => {
  const c = afterHeath();
  c.burdens.push(ERED.misplaced);
  c.misplaced = [0];
  c.boons = [ERED.hunt];
  c.permanent = { [d.heroes[0]]: [ERED.hunt] };
  let s = roam(c);
  assert.ok(!s.hand.some((u) => u.code === ERED.misplaced));
  assert.equal(count(s.deck, ERED.misplaced), 1);
  s = applyAction(reload(s), { type: "MULLIGAN" });
  assert.ok(!s.hand.some((u) => u.code === ERED.misplaced));
  assert.equal(count(s.deck, ERED.misplaced), 1);
  s = calm(opening(s));
  // A player card attachment is discarded when it attaches; the Permanent
  // Accolade stays.
  const hero = s.heroes[0];
  hero.attachments.push({
    id: `a${s.nextId++}`,
    code: "01026",
    exhausted: false,
    owner: 0,
  });
  s.deck = [ERED.misplaced, ...s.deck.filter((x) => x !== ERED.misplaced)];
  draw(s, 1);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Misplaced Trust · Attach it to a hero you control/,
  );
  s = choose(s, hero.id);
  const h = s.heroes[0];
  assert.ok(!s.hand.some((u) => u.code === ERED.misplaced));
  assert.deepEqual(
    h.attachments.map((a) => a.code).sort(),
    [ERED.hunt, ERED.misplaced].sort(),
  );
  assert.ok(s.discard.includes("01026"));
  // "Attached character cannot have player card attachments and is immune
  // to player card effects."
  assert.equal(eredCampaignCannotAttach(h, "01027"), true);
  assert.equal(eredCampaignCannotAttach(s.heroes[1], "01027"), false);
  assert.equal(playerCardImmune(h), true);
  assert.equal(playerCardImmune(s.heroes[1]), false);
  assert.ok(valid(s));
});

test("Ered Mithrin: Roam Across Rhovanion's resolution adds Misplaced Trust (3+ resources on Urdug) or Urdug's Cunning, and a staging location", () => {
  const s = calm(opening(roam()));
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "location");
  s.staging.push(make(s, R.slopes), make(s, R.ravine), make(s, R.slopes));
  const trusting = structuredClone(s);
  urdugUnit(trusting)!.resources = 3;
  win(trusting);
  const c = trusting.campaign!;
  assert.ok(c.burdens.includes(ERED.misplaced));
  assert.deepEqual(c.misplaced, [0]);
  assert.equal(c.encounterPool?.[ERED.cunning], undefined);
  const questions = eredResolutionQuestions(trusting);
  assert.deepEqual(
    questions.map((q) => [q.id, q.options.map((o) => o.id)]),
    [["location-0", [R.slopes, R.ravine]]],
  );
  const done = applyEredResolution(trusting, { "location-0": R.slopes });
  assert.equal(done.campaign!.encounterPool?.[R.slopes], 1);
  assert.equal(done.campaign!.resolution, null);
  assert.ok(valid(done));
  // Fewer than 3 resources: a copy of Urdug's Cunning for each player.
  const wary = structuredClone(s);
  urdugUnit(wary)!.resources = 2;
  win(wary);
  assert.equal(wary.campaign!.encounterPool?.[ERED.cunning], 1);
  assert.ok(!wary.campaign!.burdens.includes(ERED.misplaced));
  assert.ok(valid(wary));
  // With no location in the staging area there is nothing to choose.
  const empty = structuredClone(s);
  empty.staging = empty.staging.filter(
    (u) => card(u.code).type_code !== "location",
  );
  win(empty);
  assert.equal(empty.campaign!.resolution ?? null, null);
  assert.deepEqual(eredResolutionQuestions(empty), []);
  // The campaign continues with Fire in the Night.
  const next = continueCampaign(
    done,
    done.campaign!.heroes,
    done.deckId,
    true,
    9,
  );
  assert.equal(next.scenarioId, "fire-in-the-night");
  assert.equal(count(next.deck, ERED.misplaced), 1);
});

test("Ered Mithrin: in a two-player Roam Across Rhovanion players choose different locations, and passing Urdug to a new first player is no claim", () => {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  const c = newEredCampaign(
    seats.flatMap((p) => p.heroes),
    [3, 3],
  );
  c.completed = afterHeath().completed;
  let s = calm(
    opening(
      createGame(5, d.cards, d.heroes, d.id, {
        scenarioId: "roam-across-rhovanion",
        playMode: "campaign",
        campaign: c,
        seats,
      }),
    ),
  );
  const urdug = urdugUnit(s)!;
  assert.equal(urdug.resources, 1);
  // Control passes to the other player: not a claim.
  const from = seatView(s, 0).allies.some((u) => u.id === urdug.id) ? 0 : 1;
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== urdug.id);
  });
  urdug.owner = 1 - from;
  urdug.controller = 1 - from;
  forOwner(s, 1 - from, () => s.allies.push(urdug));
  check(s);
  flush(s);
  assert.equal(s.choice, null);
  // The resolution: two different staging locations are available, so the
  // players must choose different ones.
  s.staging = s.staging.filter((u) => card(u.code).type_code !== "location");
  s.staging.push(make(s, R.slopes), make(s, R.ravine));
  win(s);
  assert.deepEqual(s.campaign!.encounterPool?.[ERED.cunning], 2);
  assert.deepEqual(
    eredResolutionQuestions(s).map((q) => q.id),
    ["location-0", "location-1"],
  );
  assert.throws(
    () =>
      applyEredResolution(s, {
        "location-0": R.slopes,
        "location-1": R.slopes,
      }),
    /Players must choose different locations, if able\./,
  );
  const t = applyEredResolution(s, {
    "location-0": R.slopes,
    "location-1": R.ravine,
  });
  assert.deepEqual(
    [
      t.campaign!.encounterPool?.[R.slopes],
      t.campaign!.encounterPool?.[R.ravine],
    ],
    [1, 1],
  );
  assert.ok(valid(t));
  // With one title in the staging area, both may choose it.
  const u = structuredClone(s);
  u.campaign!.resolution = "roam-across-rhovanion";
  u.staging = u.staging.filter((x) => x.code !== R.ravine);
  const v = applyEredResolution(u, {
    "location-0": R.slopes,
    "location-1": R.slopes,
  });
  assert.equal(v.campaign!.encounterPool?.[R.slopes], 2);
});
