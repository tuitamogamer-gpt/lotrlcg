import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { card, encounterCards } from "../src/game/cards";
import { damage, revealed } from "../src/game/board";
import { fx, get, make, stats } from "../src/game/core";
import { flush, shadowResponse } from "../src/game/effects";
import { applyAction, canTravel } from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { UH } from "../src/game/uruk-hai-support";
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
} from "./uruk-hai-fixtures";

const ID = "the-uruk-hai";
const game = (seed = 5) => nightmareGame(ID, seed);
const two = (seed = 5) => nightmareForTwo(ID, seed);
const hooks = (s: GameState) => batch4Scenario(s);
/** A quiet Nightmare table (the scenario's own fixture). */
function board(players = 1, stageNumber = 1) {
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
const pursuitOf = (s: GameState) => s.urukHai!.pursuit;

test("Nightmare: The Uruk-hai's setup card and Nightmare Deck carry their scans' texts and stats", () => {
  const c = card(N.urukCard);
  assert.deepEqual(
    [c.name, c.type_code, c.back_type_code, c.encounter_set, c.nightmare],
    [
      "The Uruk-hai",
      "nightmare",
      "nightmare",
      "The Uruk-hai - Nightmare",
      true,
    ],
  );
  assert.match(
    c.text!,
    /^Begin with the standard quest deck and encounter deck for The Uruk-hai scenario\.\nRemove the following cards, in the specified quantities, from the standard encounter deck:\n3x Uruk-hai Fighter\n1x Snaga\n2x Eastemnet\n2x Plains of Rohan\n3x The Wold\n2x Unseen Barrier\nThen, shuffle .*\nFinally, flip this setup card over and place it next to the quest deck\. Its effect remains active throughout the game/,
    "the scan's removals (the catalogue had 'The Uruk-hai Fighter') and wording",
  );
  assert.equal(
    c.back_text,
    "You are playing Nightmare mode.\nEach Captive is immune to player card effects.\nSetup: Set Mauhúr aside, out of play.\nForced: When the players advance to stage 2A, add Mauhúr to the staging area.",
  );
  const stat = (code: string) => {
    const x = card(code);
    return [
      x.is_unique,
      x.traits,
      x.engagement,
      x.threat,
      x.attack,
      x.defense,
      x.health,
      x.victory,
      x.quantity,
    ];
  };
  assert.deepEqual(stat(N.mauhur), [
    true,
    "Orc. Uruk-hai.",
    24,
    4,
    5,
    2,
    4,
    4,
    1,
  ]);
  assert.equal(
    card(N.mauhur).text,
    "Toughness 1. Archery 2.\nForced: After Mauhúr attacks, increase the pursuit value by 1.",
  );
  assert.deepEqual(stat(N.lugdush), [
    true,
    "Orc. Uruk-hai.",
    32,
    3,
    4,
    2,
    5,
    3,
    1,
  ]);
  assert.deepEqual(stat(N.whiteHand), [
    false,
    "Orc. Uruk-hai.",
    28,
    3,
    3,
    1,
    3,
    undefined,
    4,
  ]);
  const where = (code: string) => {
    const x = card(code);
    return [x.type_code, x.traits, x.threat, x.quest, x.quantity];
  };
  assert.deepEqual(where(N.wold), ["location", "Plains. Hills.", 5, 5, 2]);
  assert.deepEqual(where(N.enchanted), ["location", "Plains.", 3, 4, 3]);
  assert.deepEqual(where(N.trail), ["location", "Plains.", 3, 6, 3]);
  assert.match(card(N.trail).text!, /^While The Uruk's Trail is the active/);
  assert.deepEqual(
    [card(N.command).name, card(N.command).quantity],
    ["Uglúk's Command", 3],
    "the scan's accent (the catalogue had 'Ugluk's Command')",
  );
  assert.match(card(N.command).text!, /Uglúk makes an immediate attack/);
  assert.match(card(N.draught).text!, /^Peril\. Surge\.\nWhen Revealed/);
  for (const code of [N.lugdush, N.whiteHand, N.wold, N.enchanted])
    assert.match(card(code).shadow!, /^Shadow: /, card(code).name);
  const set = encounterCards.filter(
    (x) => x.encounter_set === "The Uruk-hai - Nightmare",
  );
  assert.equal(set.length, 9);
  assert.equal(
    set.reduce(
      (n, x) => n + (x.type_code === "nightmare" ? 0 : (x.quantity ?? 1)),
      0,
    ),
    19,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    10,
  );
});

test("Nightmare: The Uruk-hai's Nightmare deck matches its source recipe, with Mauhúr set aside until the players advance to stage 2A", () => {
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
      .filter((c) => c.section === section && c.code !== N.urukCard)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const nightmare = recipes.find((r) => r.id === "N0B.07")!;
  const standard = recipes.find((r) => r.id === "Q0B.07")!;
  const [deck, aside] = nightmareEncounterDecks(
    ID,
    [pile(standard, "sharedEncounterDeck"), []],
    (c) => (c === N.mauhur ? 1 : 0),
  );
  assert.deepEqual(count(deck), count(pile(nightmare, "sharedEncounterDeck")));
  assert.deepEqual(aside, pile(nightmare, "sharedSetAside"));
  for (const [title, n] of Object.entries(NIGHTMARE[ID]!.removals))
    assert.ok(
      card(N.urukCard).text!.includes(`${n}x ${title}`),
      `${n}x ${title}`,
    );
  for (const s of [opening(game()), opening(two())]) {
    assert.equal(nightmareCardOf(s), N.urukCard);
    assert.ok(valid(s));
    assert.equal(s.nightmare!.urukMauhur!.code, N.mauhur);
    assert.equal(s.activeLocation?.code, UH.eastemnet, "the setup's Eastemnet");
    assert.ok(![...s.encounterDeck, ...s.encounterDiscard].includes(N.mauhur));
    assert.match(nightmareStatus(s)[0], /Mauhúr is added .*set aside now/);
  }
});

test("Nightmare: Mauhúr joins the staging area as the players advance to stage 2A, and its attacks raise the pursuit value", () => {
  let s = board();
  s.nightmare!.urukMauhur = make(s, N.mauhur);
  s.encounterDeck = [UH.plains, N.whiteHand];
  queue(s, fx("uhStageTwo", { player: 0 }));
  flush(s);
  assert.equal(s.stage, 2);
  assert.ok(s.staging.some((u) => u.code === N.mauhur));
  assert.equal(s.nightmare!.urukMauhur, undefined);
  assert.match(s.choice?.title ?? "", /Rescue the Captives/);
  assert.ok(valid(s));
  // Mauhúr: "Forced: After Mauhúr attacks, increase the pursuit value by 1."
  const t = board(1, 2);
  const mauhur = engaged(t, N.mauhur);
  const before = pursuitOf(t);
  queue(t, ...hooks(t).attackFinished!(t, { enemyId: mauhur.id } as never));
  flush(t);
  assert.equal(pursuitOf(t), before + 1);
  // Orc of the White Hand: only after its attack destroys a character.
  const orc = engaged(t, N.whiteHand);
  assert.deepEqual(
    hooks(t).attackFinished!(t, { enemyId: orc.id } as never),
    [],
  );
  queue(
    t,
    ...hooks(t).attackFinished!(t, {
      enemyId: orc.id,
      uhKilled: true,
    } as never),
  );
  flush(t);
  assert.equal(pursuitOf(t), before + 2);
});

test("Nightmare: while Lugdush is engaged no other enemy can take damage, and its shadow protects a unique attacker until the end of the round", () => {
  const s = board(1, 2);
  const orc = engaged(s, N.whiteHand);
  const lugdush = make(s, N.lugdush);
  s.staging.push(lugdush);
  damage(s, orc.id, 5);
  assert.equal(orc.damage, 3, "Toughness 2 only, while Lugdush is staged");
  orc.damage = 0;
  s.staging = s.staging.filter((u) => u.id !== lugdush.id);
  s.engaged.push(lugdush);
  damage(s, orc.id, 5);
  assert.equal(orc.damage, 0, "Lugdush is engaged");
  damage(s, lugdush.id, 5);
  assert.equal(lugdush.damage, 3, "Lugdush itself, less its Toughness 2");
  // Its shadow: a unique attacking enemy cannot take damage this round.
  const t = board(1, 2);
  const mauhur = engaged(t, N.mauhur);
  assert.ok(shadow(t, mauhur, N.lugdush));
  damage(t, mauhur.id, 5);
  assert.equal(mauhur.damage, 0);
  t.round += 1;
  damage(t, mauhur.id, 5);
  assert.equal(mauhur.damage, 4, "the next round, less its Toughness 1");
  const u = board(1, 2);
  const plain = engaged(u, N.whiteHand);
  shadow(u, plain, N.lugdush);
  damage(u, plain.id, 5);
  assert.equal(plain.damage, 3, "a non-unique attacker is not protected");
});

test("Nightmare: Wold of Rohan's Action raises the pursuit value by 1 to place 1 progress on it, and its shadow discards a non-objective attachment", () => {
  let s = board();
  const wold = stage(s, N.wold);
  assert.equal(hooks(s).abilityProblem!(s, wold), null);
  s = applyAction(reload(s), { type: "ABILITY", id: wold.id });
  s = run(s);
  assert.equal(pursuitOf(s), 11);
  assert.equal(get(s, wold.id)!.progress, 1);
  s = applyAction(reload(s), { type: "ABILITY", id: wold.id });
  s = run(s);
  assert.deepEqual([pursuitOf(s), get(s, wold.id)!.progress], [12, 2]);
  // Its shadow.
  const t = board();
  const hero = t.heroes[0];
  hero.attachments.push(
    { id: `a${t.nextId++}`, code: "01040", exhausted: false },
    { id: `a${t.nextId++}`, code: "01041", exhausted: false },
  );
  const orc = engaged(t, N.whiteHand);
  shadow(t, orc, N.wold, hero);
  flush(t);
  assert.equal(t.choice!.options.length, 2);
  pick(t, t.choice!.options[0].id);
  assert.equal(hero.attachments.length, 1);
});

test("Nightmare: Enchanted Land raises the pursuit value after an encounter card effect is canceled, and its shadow raises it or protects the attacker", () => {
  let s = board(1, 2);
  stage(s, N.enchanted);
  stage(s, N.enchanted);
  hooks(s).whenRevealedCancelled!(s, UH.rest);
  flush(s);
  assert.equal(pursuitOf(s), 12, "for each copy");
  // A shadow canceled by Hasty Stroke.
  const spirit = make(s, "01008");
  spirit.resources = 10;
  s.heroes.push(spirit);
  s.hand = [make(s, "01048")];
  const orc = engaged(s, N.whiteHand);
  s.combat = {
    enemyId: orc.id,
    defenderId: spirit.id,
    defenderIds: [spirit.id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  shadowResponse(s, N.draught);
  assert.ok(options(s).includes("cancel"));
  pick(s, "cancel");
  s = run(s);
  assert.equal(pursuitOf(s), 14);
  // Its shadow: the defending player chooses.
  const t = board(1, 2);
  const enemy = engaged(t, N.whiteHand);
  shadow(t, enemy, N.enchanted, t.heroes[0]);
  flush(t);
  assert.deepEqual(options(t), ["pursuit", "no-damage"]);
  pick(t, "no-damage");
  damage(t, enemy.id, 6);
  assert.equal(enemy.damage, 0);
  const u = board(1, 2);
  shadow(u, engaged(u, N.whiteHand), N.enchanted, u.heroes[0]);
  flush(u);
  pick(u, "pursuit");
  assert.equal(pursuitOf(u), 11);
});

test("Nightmare: travelling to The Uruk's Trail adds a non-unique Uruk-hai enemy from the encounter deck or discard pile, and exploring it as the active location lowers the pursuit value by 3", () => {
  let s = board();
  const trail = stage(s, N.trail);
  s.encounterDeck = [UH.plains, N.whiteHand, UH.plains];
  s.encounterDiscard = [N.mauhur, UH.uruk];
  s.phase = "travel";
  assert.equal(canTravel(s, trail), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: trail.id });
  flush(s);
  assert.deepEqual(options(s).sort(), [
    `deck-${N.whiteHand}`,
    `discard-${UH.uruk}`,
  ]);
  s = choose(s, `deck-${N.whiteHand}`);
  s = run(s);
  assert.equal(s.activeLocation!.id, trail.id);
  assert.ok(s.staging.some((u) => u.code === N.whiteHand));
  assert.deepEqual(s.encounterDeck.sort(), [UH.plains, UH.plains]);
  // Without one, the players still travel.
  let t = board();
  const other = stage(t, N.trail);
  t.encounterDiscard = [N.lugdush];
  t.phase = "travel";
  t = applyAction(reload(t), { type: "TRAVEL", id: other.id });
  t = run(t);
  assert.equal(t.activeLocation!.id, other.id);
  // Explored as the active location: −3 pursuit.
  const u = board();
  const active = activate(u, N.trail);
  hooks(u).explored!(u, active, true);
  flush(u);
  assert.equal(pursuitOf(u), 7);
  hooks(u).explored!(u, make(u, N.trail), false);
  flush(u);
  assert.equal(pursuitOf(u), 7, "not from the staging area");
});

test("Nightmare: Uglúk's Command raises the pursuit value by 4 or has Uglúk attack the revealing player, and its shadow adds the pursuit value's tens digit", () => {
  let s = board();
  revealed(s, N.command);
  flush(s);
  assert.deepEqual(options(s), ["pursuit", "attack"]);
  s = choose(s, "pursuit");
  s = run(s);
  assert.equal(pursuitOf(s), 14);
  assert.ok(s.encounterDiscard.includes(N.command));
  let t = board();
  revealed(t, N.command);
  flush(t);
  t = choose(t, "attack");
  assert.ok(
    t.combat?.enemyId === t.staging.find((u) => u.code === UH.ugluk)!.id ||
      /Uglúk|attack/i.test(t.choice?.title ?? ""),
    "Uglúk attacks",
  );
  // Without Uglúk in play, only the pursuit value.
  let u = board();
  u.staging = u.staging.filter((x) => x.code !== UH.ugluk);
  revealed(u, N.command);
  u = run(u);
  assert.equal(pursuitOf(u), 14);
  // Its shadow: +X, the tens digit of the pursuit value.
  const v = board();
  v.urukHai!.pursuit = 23;
  const orc = engaged(v, N.whiteHand);
  shadow(v, orc, N.command, v.heroes[0]);
  assert.equal(v.combat!.attackBonus, 2);
  const w = board();
  w.urukHai!.pursuit = 9;
  shadow(w, engaged(w, N.whiteHand), N.command, w.heroes[0]);
  assert.equal(w.combat!.attackBonus, 0);
});

test("Nightmare: Orc-draught discards an ally of the revealing player or raises the pursuit value by 1, gains its surge, and its shadow exhausts a character", () => {
  let s = board();
  const [ally] = allies(s, ["01016"]);
  s.encounterDeck = [UH.plains, UH.plains];
  revealed(s, N.draught);
  flush(s);
  assert.deepEqual(options(s), [ally.id, "pursuit"]);
  s = choose(s, ally.id);
  s = run(s);
  assert.ok(!s.allies.some((u) => u.id === ally.id));
  assert.ok(s.discard.includes("01016"));
  assert.equal(pursuitOf(s), 10);
  assert.ok(
    s.staging.some((u) => u.code === UH.plains),
    "Surge reveals the next card",
  );
  let t = board();
  t.encounterDeck = [UH.plains];
  revealed(t, N.draught);
  t = run(t);
  assert.equal(pursuitOf(t), 11, "no ally: only the pursuit value");
  // Its shadow.
  const u = board();
  const orc = engaged(u, N.whiteHand);
  shadow(u, orc, N.draught, u.heroes[0]);
  flush(u);
  pick(u, u.choice!.options[1].id);
  assert.equal(u.heroes.filter((h) => h.exhausted).length, 1);
});

test("Nightmare: The Uruk-hai's Captives stay out of player card effects' reach, and stats still follow the scenario's Toughness", () => {
  const s = board();
  const captive = s.urukHai!.captives[0];
  assert.ok(captive);
  assert.ok(
    !seatView(s, 0).heroes.some((h) => h.id === captive.unit.id),
    "a Captive is not a character any player controls",
  );
  const orc = engaged(s, N.whiteHand);
  assert.equal(stats(s, orc).attack, 3);
  damage(s, orc.id, 3);
  assert.equal(orc.damage, 1, "Toughness 2");
});

test("Nightmare: The Uruk-hai's Nightmare state survives saves, malformed state is refused, and seeded games finish with valid saves", () => {
  let s = board(1, 2);
  delete s.nightmare!.urukMauhur;
  const mauhur = engaged(s, N.mauhur);
  shadow(s, mauhur, N.lugdush);
  s.combat = null;
  const back = reload(s);
  assert.deepEqual(back.nightmare, s.nightmare);
  const broken = (f: (x: GameState) => void) => {
    const x = JSON.parse(JSON.stringify(s));
    f(x);
    return valid(x);
  };
  assert.equal(
    broken(
      (x) => (x.nightmare!.urukNoDamage = [{ enemy: 3 as never, round: 1 }]),
    ),
    false,
  );
  assert.equal(
    broken(
      (x) => (x.nightmare!.urukMauhur = { ...make(x, N.whiteHand) } as never),
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
