import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, readyCharacter, revealed } from "../src/game/board";
import { engagementCost, fx, get, make } from "../src/game/core";
import { flush } from "../src/game/effects";
import { canTravel } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { syncAttachmentText } from "../src/game/attachment-text";
import { HD } from "../src/game/helms-deep-support";
import {
  NIGHTMARE,
  NIGHTMARE_TOS as N,
  nightmareCardOf,
  nightmareEncounterDecks,
  nightmareStatus,
} from "../src/game/nightmare";
import { seatView } from "../src/game/table";
import type { Effect, GameState } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  pick,
  shadow,
  valid,
} from "./nightmare-fixtures";
import {
  activate,
  allies,
  base,
  choose,
  engaged,
  reload,
  stage,
} from "./helms-deep-fixtures";

const ID = "helms-deep";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1, stageNumber = 2) {
  const s = base(players, stageNumber);
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
}
/** Resolve queued effects, answering each choice with `answer` (or the first option). */
function run(
  s: GameState,
  answer: (s: GameState) => string | undefined = () => undefined,
) {
  flush(s);
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 60, "decisions terminate");
    s = choose(s, answer(s) ?? s.choice.options[0].id);
  }
  return s;
}
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const defense = (s: GameState) => s.staging.find((u) => u.code === HD.defense)!;

test("Nightmare: Helm's Deep's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.helmCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    ["Helm's Deep", "nightmare", "nightmare", "Helm's Deep - Nightmare", true],
  );
  assert.match(
    c.text!,
    /from the standard encounter deck:\n1x Isengard Uruk\n3x Uruk-hai Fighter\n3x Wild Hillman\n3x The Hornburg\n1x Deeping Wall\n2x Postern Door\n2x Reckless Hate\nThen, shuffle .*\nFinally, flip this setup card over and place it next to the quest deck\. Its effect remains active throughout the game/,
  );
  assert.equal(c.back_text, "You are playing Nightmare mode.");
  const stat = (code: string) => {
    const x = card(code);
    return [
      x.name,
      x.traits,
      x.engagement,
      x.threat,
      x.attack,
      x.defense,
      x.health,
      x.quantity,
    ];
  };
  assert.deepEqual(stat(N.host), [
    "Host of Isengard",
    "Orc. Uruk-hai.",
    48,
    4,
    8,
    2,
    8,
    3,
  ]);
  assert.deepEqual(
    stat(N.berserker),
    ["Bloodied Berserker", "Dunland.", 28, 3, 4, 2, 4, 4],
    "the scan's title (the catalogue had 'Blooded Berserker')",
  );
  const where = (code: string) => {
    const x = card(code);
    return [x.type_code, x.traits, x.threat, x.quest, x.victory, x.quantity];
  };
  assert.deepEqual(where(N.helmsDike), [
    "location",
    "Helm's Deep.",
    3,
    2,
    undefined,
    2,
  ]);
  assert.deepEqual(where(N.hornburgWall), [
    "location",
    "Helm's Deep.",
    3,
    3,
    undefined,
    3,
  ]);
  assert.deepEqual(where(N.caves), ["location", "Helm's Deep.", 2, 2, 2, 2]);
  assert.match(
    card(N.caves).text!,
    /^Immune to player card effects\.\nThe players cannot travel here unless they are at stage 4B\./,
    "the scan's 'Immune' (the catalogue had 'Immmune')",
  );
  assert.match(card(N.arrows).text!, /from The Defense of Helm's Deep/);
  assert.match(card(N.crippling).text!, /^Doomed 1\.\nWhen Revealed/);
  for (const code of [N.berserker, N.hornburgWall, N.arrows, N.crippling])
    assert.match(card(code).shadow!, /^Shadow: /, card(code).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Helm's Deep - Nightmare",
  );
  assert.equal(set.length, 8);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(art.filter((x) => set.some((y) => y.code === x.code)).length, 9);
});

test("Nightmare: Helm's Deep's Nightmare encounter deck matches its source recipe", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const count = (list: string[]) =>
    list.reduce<Record<string, number>>(
      (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
      {},
    );
  const pile = (
    r: { cards: { code: string; quantity: number; section: string }[] },
    section: string,
  ) =>
    r.cards
      .filter((c) => c.section === section && c.code !== N.helmCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.08")!;
  const standard = recipes.find((r) => r.id === "Q0B.08")!;
  const [deck] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck")],
    () => 0,
  );
  assert.deepEqual(count(deck), count(pile(nightmare, "sharedEncounterDeck")));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.helmCard).text!.includes(`${n}x ${title}`),
      `${n}x ${title}`,
    );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.helmCard);
    assert.ok(valid(s));
    assert.ok(
      ![...s.encounterDeck, ...s.encounterDiscard].includes(HD.hornburg),
      "no The Hornburg",
    );
    assert.equal(s.helmsDeep!.setAside.filter((c) => c === HD.wall).length, 1);
    assert.match(nightmareStatus(s)[0], /^Helm's Deep · Nightmare mode/);
  }
});

test("Nightmare: Host of Isengard cannot have attachments and, in the staging area, places 1 progress on the current quest at the end of the round, bypassing the active location", () => {
  const s = board(1, 3);
  const host = stage(s, N.host);
  assert.equal(hooks(s).cannotAttach!(s, host, "01040"), true);
  activate(s, HD.culvert);
  queue(s, ...hooks(s).roundEnd!(s));
  flush(s);
  assert.equal(s.progress, 1);
  assert.equal(s.activeLocation!.progress, 0, "bypassing the active location");
  // Engaged, it has no such effect; its Toughness 2 is the scenario's.
  const t = board();
  const engagedHost = engaged(t, N.host);
  assert.deepEqual(
    hooks(t).roundEnd!(t).filter((e) => e.kind === "nhdHost"),
    [],
  );
  damage(t, engagedHost.id, 5);
  assert.equal(engagedHost.damage, 3);
});

test("Nightmare: Bloodied Berserker dealt a shadow card with no effect places 2 progress on the active location or attacks again, and its shadow gives +1 attack", () => {
  const s = board();
  const berserker = engaged(s, N.berserker);
  const location = activate(s, HD.wall);
  s.combat = {
    enemyId: berserker.id,
    defenderId: s.heroes[0].id,
    defenderIds: [s.heroes[0].id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  hooks(s).shadowResolved!(s, berserker, N.arrows);
  flush(s);
  assert.equal(s.choice, null, "a shadow card with an effect");
  hooks(s).shadowResolved!(s, berserker, N.caves);
  flush(s);
  assert.deepEqual(options(s), ["progress", "attack"]);
  pick(s, "progress");
  assert.equal(location.progress, 2);
  hooks(s).shadowResolved!(s, berserker, N.caves);
  flush(s);
  pick(s, "attack");
  assert.equal(s.combat!.extraAttacks, 1);
  // Without an active location, it attacks again.
  const t = board();
  const other = engaged(t, N.berserker);
  t.combat = { enemyId: other.id, attackBonus: 0, attackPlayer: 0 } as never;
  hooks(t).shadowResolved!(t, other, N.caves);
  flush(t);
  assert.equal(t.choice, null);
  assert.equal(t.combat!.extraAttacks, 1);
  // Its shadow.
  const u = board();
  shadow(u, engaged(u, N.host), N.berserker, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
});

test("Nightmare: each Hornburg Wall in play gives each enemy Toughness 1, exhausts each ally when explored, and its shadow discards a non-objective attachment", () => {
  const s = board(2);
  const host = engaged(s, N.host);
  stage(s, N.hornburgWall);
  damage(s, host.id, 6);
  assert.equal(host.damage, 3, "Toughness 2 + 1");
  activate(s, N.hornburgWall);
  host.damage = 0;
  damage(s, host.id, 6);
  assert.equal(host.damage, 2, "Toughness 2 + 2");
  // Explored: each ally in play is exhausted.
  const [a] = allies(s, ["01016"]);
  const [b] = allies(s, ["01017"], 1);
  hooks(s).explored!(s, s.activeLocation!, true);
  flush(s);
  assert.equal(get(s, a.id)!.exhausted, true);
  assert.equal(
    seatView(s, 1).allies.find((x) => x.id === b.id)!.exhausted,
    true,
  );
  // Its shadow.
  const t = board();
  const hero = t.heroes[0];
  hero.attachments.push(
    { id: `a${t.nextId++}`, code: "01040", exhausted: false },
    { id: `a${t.nextId++}`, code: "01041", exhausted: false },
  );
  shadow(t, engaged(t, N.berserker), N.hornburgWall, hero);
  flush(t);
  pick(t, t.choice!.options[1].id);
  assert.equal(hero.attachments.length, 1);
});

test("Nightmare: Glittering Caves is immune to player card effects, can be travelled to only at stage 4B, skips the combat phase while active and leaves for the victory display at the end of the round", () => {
  const s = board(2);
  const caves = stage(s, N.caves);
  syncAttachmentText(s);
  assert.equal(caves.immuneToPlayerEffects, true);
  s.phase = "travel";
  assert.match(canTravel(s, caves)!, /stage 4B/);
  const t = board(2, 4);
  const there = stage(t, N.caves);
  t.phase = "travel";
  assert.equal(canTravel(t, there), null);
  // While active: the combat phase is skipped.
  const u = board(2, 4);
  activate(u, N.caves);
  assert.equal(hooks(u).effect!(u, fx("startCombat")), true);
  assert.equal(u.phase, "defense");
  assert.deepEqual(
    u.queue.slice(0, 2).map((e) => e.kind),
    ["phaseEnd", "endCombat"],
  );
  // At the end of the round: the victory display and +2 threat.
  const v = board(2, 4);
  activate(v, N.caves);
  queue(v, ...hooks(v).roundEnd!(v));
  flush(v);
  assert.equal(v.activeLocation, null);
  assert.ok(v.victoryCards!.includes(N.caves));
  assert.equal(v.victory, 2);
  assert.deepEqual([seatView(v, 0).threat, seatView(v, 1).threat], [22, 22]);
});

test("Nightmare: while Helm's Dike is active each enemy gets −10 engagement cost, and exploring it shuffles the discard pile in and adds the first enemy discarded from the top to the staging area", () => {
  const s = board();
  const host = stage(s, N.host);
  const before = engagementCost(s, host);
  activate(s, N.helmsDike);
  assert.equal(engagementCost(s, host), before - 10);
  s.encounterDeck = [];
  s.encounterDiscard = [HD.postern, N.berserker];
  hooks(s).explored!(s, s.activeLocation!, true);
  flush(s);
  assert.ok(s.staging.some((u) => u.code === N.berserker));
  assert.deepEqual(
    [...s.encounterDeck, ...s.encounterDiscard],
    [HD.postern],
    "the other card is discarded if it came first",
  );
});

test("Nightmare: Rain of Arrows removes a Defense token or gives each staged location archery 1 for the round, and its shadow makes the attacker attack again", () => {
  let s = board();
  defense(s).resources = 2;
  stage(s, HD.culvert);
  stage(s, N.caves);
  revealed(s, N.arrows);
  flush(s);
  assert.deepEqual(options(s), ["token", "archery"]);
  s = choose(s, "token");
  s = run(s);
  assert.equal(defense(s).resources, 1);
  let t = board();
  stage(t, HD.culvert);
  stage(t, N.caves);
  revealed(t, N.arrows);
  t = run(t);
  assert.equal(t.nightmare!.helmArrows![0].ids.length, 2, "no token: archery");
  hooks(t).combatBegin!(t);
  assert.equal(
    t.queue.find((e) => e.kind === "heirsArchery")?.value,
    2,
    "the scenario's archery total adds it",
  );
  t.round += 1;
  t.queue = [];
  hooks(t).combatBegin!(t);
  assert.equal(
    t.queue.find((e) => e.kind === "heirsArchery"),
    undefined,
  );
  // Its shadow.
  const u = board();
  shadow(u, engaged(u, N.host), N.arrows, u.heroes[0]);
  assert.equal(u.combat!.extraAttacks, 1);
});

test("Nightmare: Crippling Weariness has each player exhaust a character and blocks player card readying for the round, and its shadow keeps the defender from readying", () => {
  let s = board(2);
  revealed(s, N.crippling);
  s = run(s);
  assert.equal(seatView(s, 0).heroes.filter((h) => h.exhausted).length, 1);
  assert.equal(seatView(s, 1).heroes.filter((h) => h.exhausted).length, 1);
  const tired = s.heroes.find((h) => h.exhausted)!;
  readyCharacter(s, tired, true);
  assert.equal(tired.exhausted, true, "no player card ready this round");
  readyCharacter(s, tired, false);
  assert.equal(tired.exhausted, false, "the framework still readies it");
  // Its shadow: the defender cannot ready this round.
  const t = board();
  const hero = t.heroes[0];
  shadow(t, engaged(t, N.host), N.crippling, hero);
  hero.exhausted = true;
  readyCharacter(t, hero, false);
  assert.equal(hero.exhausted, true);
  t.round += 1;
  readyCharacter(t, hero, false);
  assert.equal(hero.exhausted, false);
});

test("Nightmare: Helm's Deep's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board();
  stage(s, HD.culvert);
  revealed(s, N.arrows);
  s = run(s);
  revealed(s, N.crippling);
  s = run(s);
  shadow(s, engaged(s, N.host), N.crippling, s.heroes[0]);
  s.combat = null;
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken((x) => (x.nightmare!.helmWeariness = 99)),
    false,
  );
  assert.equal(
    broken(
      (x) => (x.nightmare!.helmArrows = [{ round: 1, ids: [3 as never] }]),
    ),
    false,
  );
  assert.equal(
    broken((x) => delete x.nightmareMode),
    false,
    "only a Nightmare game holds the Nightmare Deck's state",
  );
  for (const seed of [1, 2]) {
    const g = autoplay(game(seed), 3000);
    assert.notEqual(g.status, "playing", `${ID} seed ${seed}`);
    assert.ok(valid(g));
  }
  const g2 = autoplay(two(7), 4000);
  assert.notEqual(g2.status, "playing", `two-player ${ID}`);
  assert.ok(valid(g2));
});
