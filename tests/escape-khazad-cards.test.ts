import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, optionalEngagementProblem } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stagingThreat, stats, threatOf } from "../src/game/core";
import { damage, progress, readyCharacter } from "../src/game/board";
import { flush } from "../src/game/effects";
import { reduceThreat } from "../src/game/threat-reduction";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import { forOwner, seatView } from "../src/game/table";
import { mainQuestCode } from "../src/game/quest-state";
import { ESCAPE_KHAZAD_HOOKS, EK } from "../src/game/escape-khazad";
import {
  activate,
  allies,
  atQuest,
  bane,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./escape-khazad-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = ESCAPE_KHAZAD_HOOKS;
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const run = (s: GameState, ...effects: ReturnType<typeof fx>[]) => {
  s.queue.push(...effects);
  flush(s);
  return s;
};
/** Reveal the given encounter cards from the top of the deck, one after another. */
const reveal = (s: GameState, ...codes: string[]) => {
  s.encounterDeck = [...codes, ...s.encounterDeck.slice(codes.length)];
  return run(s, fx("reveal"));
};
const defend = (s: GameState, enemy: Unit, defender?: Unit) => {
  s.phase = "defense";
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
const threats = (s: GameState) =>
  (s.table?.seats ?? [{ threat: s.threat }]).map((x) => x.threat);
const logged = (s: GameState, pattern: RegExp) =>
  s.log.some((l) => pattern.test(l.text));
const quest = (u: Unit, s: GameState) => {
  u.committed = true;
  u.exhausted = true;
  s.committedIds.push(u.id);
};
const GUARD = "01013",
  SNOWBOURN = "01016",
  ARCHER = "01017",
  FARAMIR = "01014",
  STEWARD = "01026",
  BLADE = "01039",
  COURAGE = "01057",
  TEST_OF_WILL = "01050",
  BROK = "01019";
/** Attach a player attachment from the core set to a character. */
const attach = (u: Unit, code: string) => {
  const a = {
    id: `att-${code}-${u.attachments.length}-${u.id}`,
    code,
    exhausted: false,
    owner: 0,
  } as Unit["attachments"][number];
  u.attachments.push(a);
  return a;
};

test("Set 15: Black Bats raises each threat by 2 or reveals another card, and as a shadow raises yours or leaves the attack undefended; Nest of Vermin gives Creatures +1 threat and adds one when explored; Swarm of Bats", () => {
  let s = base(2);
  reveal(s, EK.blackBats);
  assert.match(
    s.choice!.title,
    /^Black Bats · Raise each player's threat by 2, or reveal an additional encounter card/,
  );
  s = choose(s, "threat");
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  s = base();
  reveal(s, EK.blackBats);
  s = choose(s, "reveal");
  s = settle(s);
  assert.equal(
    s.staging.filter((u) => u.code === EK.mithril).length,
    1,
    "an additional card is revealed",
  );
  // Shadow: raise your threat by 2, or the attack is considered undefended.
  s = base();
  let raider = engaged(s, EK.raiders);
  raider.shadows = [EK.blackBats];
  s = defend(s, raider, s.heroes[0]);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["threat", "undefended"],
  );
  s = choose(s, "undefended");
  s = settle(s);
  assert.ok(logged(s, /^Black Bats: this attack is considered undefended\.$/));
  assert.ok(
    logged(s, /^Orc Raiders attacks for 2 damage \(undefended\)\.$/),
    "Aragorn's 2 defense no longer counts",
  );
  s = base();
  raider = engaged(s, EK.raiders);
  raider.shadows = [EK.blackBats];
  s = defend(s, raider);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["threat"],
    "an undefended attack offers only the threat",
  );
  s = settle(s, "threat");
  assert.equal(s.threat, 22);
  // Nest of Vermin: +1 threat to each Creature enemy; explored, a Creature of cost 1 or less.
  s = base();
  const bats = stage(s, EK.blackBats);
  const raiders = stage(s, EK.raiders);
  stage(s, EK.nest);
  assert.equal(threatOf(s, bats), 1 + 1);
  assert.equal(threatOf(s, raiders), 2, "an Orc is no Creature");
  s.staging = s.staging.filter((u) => u.code !== EK.nest);
  activate(s, EK.nest);
  s.encounterDeck = [EK.mithril, EK.adder, EK.elder];
  s.encounterDiscard = [EK.unspeakable];
  progress(s, 5);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Nest of Vermin · The opposing team adds a Creature enemy with cost 1 or less/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Black Bats", "Rock Adder", "Unspeakable Thing"].filter((n) =>
      n !== "Black Bats" ? true : false,
    ),
    "Elder Nameless Thing costs 3",
  );
  s = choose(s, EK.adder);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === EK.adder));
  // Swarm of Bats: each character gets -1 willpower this phase.
  s = base();
  s.phase = "quest";
  const will = stats(s, s.heroes[0]).will;
  reveal(s, EK.swarm);
  s = settle(s);
  assert.equal(stats(s, s.heroes[0]).will, will - 1);
  s.phase = "travel";
  assert.equal(stats(s, s.heroes[0]).will, will, "until the end of the phase");
  // Shadow: each character you control gets -1 attack and -1 defense this phase.
  s = base();
  const goblin = engaged(s, EK.raiders);
  goblin.shadows = [EK.swarm];
  const attack = stats(s, s.heroes[1]).attack;
  s = defend(s, goblin, s.heroes[0]);
  s = settle(s);
  assert.equal(stats(s, s.heroes[1]).attack, attack - 1);
  assert.ok(logged(s, /^Swarm of Bats: each character/));
  reload(s);
});

test("Set 16: Cave Spider removes 2 progress or gets +2 attack when it attacks; The Mountain's Roots has X threat and discards the top X cards of each deck on travel; Watchful Eyes reveals a card when its hero is exhausted at the end of combat", () => {
  let s = base();
  const spider = engaged(s, EK.caveSpider);
  spider.shadows = [EK.mithril];
  s.progress = 4;
  s = defend(s, spider, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Cave Spider · Remove 2 progress from the main quest, or the attacking enemy gets \+2 attack/,
  );
  s = choose(s, "progress");
  s = settle(s);
  assert.equal(s.progress, 2);
  s = base();
  const second = engaged(s, EK.caveSpider);
  second.shadows = [EK.mithril];
  s = defend(s, second, s.heroes[0]);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["attack"],
    "with no progress, only the attack bonus",
  );
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Cave Spider: the attacking enemy gets \+2 attack for this attack\.$/,
    ),
  );
  // Shadow.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.caveSpider];
  s.progress = 3;
  s = defend(s, raider, s.heroes[0]);
  assert.match(s.choice!.title, /^Cave Spider \(shadow\) · /);
  s = choose(s, "progress");
  s = settle(s);
  assert.equal(s.progress, 1);
  // The Mountain's Roots: X is 1 more than the stage number.
  s = base(2);
  const roots = stage(s, EK.roots);
  assert.equal(threatOf(s, roots), 2);
  atQuest(s, EK.lair);
  assert.equal(threatOf(s, roots), 3);
  deck(s, ["01013", "01016", "01017", "01020"], 0);
  deck(s, ["01028", "01029"], 1);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: roots.id });
  s = settle(s);
  assert.deepEqual(seatView(s, 0).deck, ["01020"]);
  assert.deepEqual(seatView(s, 1).deck, []);
  assert.deepEqual(seatView(s, 0).discard, ["01013", "01016", "01017"]);
  // Watchful Eyes: on a hero; exhausted at the end of combat, a card is revealed.
  s = base();
  reveal(s, EK.eyes);
  assert.match(
    s.choice!.title,
    /^Watchful Eyes · The opposing team attaches it to a hero/,
  );
  s = choose(s, s.heroes[0].id);
  s = settle(s);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === EK.eyes));
  reveal(s, EK.eyes);
  assert.ok(
    !s.choice!.options.some((o) => o.id === s.heroes[0].id),
    "limit 1 per hero",
  );
  s = settle(s);
  s.heroes[0].exhausted = true;
  s.encounterDeck = [EK.mithril];
  H.combatEnd!(s);
  flush(s);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Watchful Eyes: Aragorn is exhausted at the end of the combat phase/,
    ),
  );
  assert.ok(s.staging.some((u) => u.code === EK.mithril));
  reload(s);
});

test("Set 17: Cave-troll has no player attachments and cannot be attacked or defended by allies; Twisting Passage stages a discarded location; Undisturbed Bones is discarded instead of a 'when revealed' effect being canceled", () => {
  let s = base();
  const troll = engaged(s, EK.caveTroll);
  const [ally] = allies(s, [GUARD]);
  assert.equal(H.cannotAttach!(s, troll, BLADE), true);
  assert.equal(H.cannotDefend!(s, troll, ally), true);
  assert.equal(H.cannotDefend!(s, troll, s.heroes[0]), false);
  assert.equal(H.cannotAttack!(s, ally, troll), true);
  assert.equal(H.cannotAttack!(s, s.heroes[0], troll), false);
  // Twisting Passage: the top card, staged if it is a location.
  s = base();
  s.encounterDeck = [EK.twisting, EK.roots, EK.raiders];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === EK.roots));
  s.encounterDeck = [EK.twisting, EK.raiders];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(EK.raiders));
  // Undisturbed Bones: surge, attached to the main quest.
  s = base();
  s.encounterDeck = [EK.bones, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  const code = mainQuestCode(s)!;
  assert.deepEqual(
    (s.questAttachments?.[code] ?? []).map((a) => a.code),
    [EK.bones],
  );
  assert.ok(
    s.staging.some((u) => u.code === EK.mithril),
    "surge",
  );
  assert.equal(H.revealCancelCountered!(s, EK.deepDark), true);
  assert.deepEqual(s.questAttachments?.[code] ?? [], []);
  assert.ok(s.encounterDiscard.includes(EK.bones));
  assert.equal(H.revealCancelCountered!(s, EK.deepDark), false);
  reload(s);
  // Eleanor's cancel and A Test of Will: Bones is discarded, the card resolves.
  for (const cancel of ["eleanor-2", "cancel-2"]) {
    s = base(3);
    s.encounterDeck = [EK.bones, EK.mithril];
    s = run(s, fx("reveal"));
    s = settle(s);
    hand(s, [TEST_OF_WILL], 2);
    s.encounterDeck = [EK.deepDark, EK.mithril];
    s = run(s, fx("reveal"));
    assert.match(s.choice!.title, /^Revealed: Deep Deep Dark/);
    assert.ok(
      s.choice!.options.some((o) => o.id === cancel),
      JSON.stringify(s.choice!.options.map((o) => o.id)),
    );
    s = choose(s, cancel);
    s = settle(s);
    assert.ok(
      logged(s, /^Undisturbed Bones is discarded instead/),
      `${cancel}: Undisturbed Bones is discarded`,
    );
    assert.deepEqual(
      threats(s),
      [23, 23, 23],
      `${cancel}: Deep Deep Dark resolves for each player`,
    );
    assert.deepEqual(s.questAttachments?.[mainQuestCode(s)!] ?? [], []);
    reload(s);
  }
});

test("Set 18: Old Stone-troll raises its victim's controller's threat by the excess damage; Frightful Den gives Trolls -10 engagement cost and adds one when explored; Deep Deep Dark", () => {
  let s = base();
  const troll = engaged(s, EK.stoneTroll);
  troll.shadows = [EK.mithril];
  assert.equal(H.cannotAttach!(s, troll, BLADE), true);
  const [guard] = allies(s, [GUARD]);
  // Guard of the Citadel: 0 defense, 2 hit points; 6 damage, 4 excess.
  assert.deepEqual([stats(s, guard).defense, stats(s, guard).health], [0, 2]);
  s = defend(s, troll, guard);
  s = settle(s);
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === guard.id));
  assert.equal(s.threat, 24);
  assert.ok(logged(s, /^Old Stone-troll: you raise your threat by 4\.$/));
  // Frightful Den: -10 engagement cost; explored, a Troll of cost 1 or less.
  s = base();
  const cave = stage(s, EK.caveTroll);
  stage(s, EK.den);
  assert.equal(H.engagementBonus!(s, cave), -10);
  s.staging = s.staging.filter((u) => u.code !== EK.den);
  assert.equal(H.engagementBonus!(s, cave), 0);
  activate(s, EK.den);
  s.encounterDeck = [EK.mithril, EK.stoneTroll];
  s.encounterDiscard = [EK.caveTroll];
  progress(s, 4);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Frightful Den · The opposing team adds a Troll enemy with cost 1 or less/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Cave-troll", "Old Stone-troll"],
  );
  s = choose(s, EK.caveTroll);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === EK.caveTroll));
  // Deep Deep Dark: 1 threat per character, or discard a character.
  s = base(2);
  allies(s, [GUARD], 1);
  reveal(s, EK.deepDark);
  assert.match(
    s.choice!.title,
    /^Deep Deep Dark · Raise your threat by 1 for each character you control, or discard a character you control/,
  );
  s = choose(s, "threat");
  const ally = seatView(s, 1).allies[0];
  s = choose(s, ally.id);
  s = settle(s);
  assert.deepEqual(threats(s), [23, 20]);
  assert.equal(seatView(s, 1).allies.length, 0);
  // Shadow: 1 threat per enemy engaged with you.
  s = base();
  const raider = engaged(s, EK.raiders);
  engaged(s, EK.adder);
  raider.shadows = [EK.deepDark];
  s = defend(s, raider, s.heroes[0]);
  s = settle(s);
  assert.equal(s.threat, 22);
  reload(s);
});

test("Set 19: Rock Adder cannot be defended and, as a shadow, boosts an undefended attack; Bottomless Chasm must be traveled to; Lost and Alone removes a questing character of each player", () => {
  let s = base();
  const adder = engaged(s, EK.adder);
  assert.equal(H.cannotDefend!(s, adder, s.heroes[0]), true);
  assert.equal(H.cannotDefend!(s, adder), true);
  // Shadow: +2 attack if undefended.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.adder];
  s = defend(s, raider);
  s = settle(s);
  assert.ok(logged(s, /^Rock Adder: the attacking enemy gets \+2 attack\.$/));
  s = base();
  const second = engaged(s, EK.raiders);
  second.shadows = [EK.adder];
  s = defend(s, second, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /^Rock Adder: this attack is defended\.$/));
  // Bottomless Chasm: the players must travel there, if able.
  s = base();
  const chasm = stage(s, EK.chasm);
  const lode = stage(s, EK.mithril);
  s.phase = "travel";
  assert.equal(H.mustTravel!(s), true);
  assert.match(
    H.travelProblem!(s, lode) ?? "",
    /must travel to Bottomless Chasm/,
  );
  assert.equal(H.travelProblem!(s, chasm), null);
  // Shadow: +2 defense this phase.
  s = base();
  const goblin = engaged(s, EK.raiders);
  goblin.shadows = [EK.chasm];
  const defense = stats(s, goblin).defense;
  s = defend(s, goblin, s.heroes[0]);
  s = settle(s);
  assert.equal(stats(s, goblin).defense, defense + 2);
  // Lost and Alone: a questing character of each player leaves the quest.
  s = base(2);
  s.phase = "quest";
  forOwner(s, 0, () => quest(s.heroes[0], s));
  forOwner(s, 1, () => quest(s.heroes[1], s));
  reveal(s, EK.lost);
  assert.match(
    s.choice!.title,
    /^Lost and Alone · The opposing team removes a questing character controlled by/,
  );
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[0].committed, false);
  assert.equal(seatView(s, 1).heroes[1].committed, false);
  // Shadow: the defending character cannot ready this round.
  s = base();
  const orc = engaged(s, EK.raiders);
  orc.shadows = [EK.lost];
  s = defend(s, orc, s.heroes[0]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, s.heroes[0]), true);
  reload(s);
});

test("Set 20: Hobgoblin cannot take damage the round it engages; Western Hall raises each threat by the printed threat of the top card; New Devilry blanks text boxes", () => {
  let s = base();
  const hob = stage(s, EK.hobgoblin);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: hob.id });
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Hobgoblin engaged: it cannot take damage until the end of the round\.$/,
    ),
  );
  const u = s.engaged.find((x) => x.code === EK.hobgoblin)!;
  damage(s, u.id, 3, { combatDamage: true });
  flush(s);
  assert.equal(u.damage, 0);
  s.round += 1;
  damage(s, u.id, 3, { combatDamage: true });
  flush(s);
  assert.equal(u.damage, 3);
  // Shadow: the attacker cannot take damage this phase.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.hobgoblin];
  s = defend(s, raider, s.heroes[0]);
  s = settle(s);
  damage(s, raider.id, 2, { combatDamage: true });
  flush(s);
  assert.equal(raider.damage, 0);
  // Western Hall: the top card's printed threat.
  s = base(2);
  const hall = stage(s, EK.hall);
  s.encounterDeck = [EK.greatBridge, EK.mithril];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: hall.id });
  s = settle(s);
  assert.deepEqual(threats(s), [24, 24]);
  assert.ok(s.encounterDiscard.includes(EK.greatBridge));
  // Shadow: a destroyed character reveals the top card.
  s = base();
  const troll = engaged(s, EK.stoneTroll);
  troll.shadows = [EK.hall];
  const [guard] = allies(s, [GUARD]);
  s.encounterDeck = [EK.mithril];
  s = defend(s, troll, guard);
  s = settle(s);
  assert.ok(s.staging.some((x) => x.code === EK.mithril));
  // New Devilry: each character's text box is blank this round.
  s = base();
  reveal(s, EK.devilry);
  s = settle(s);
  assert.ok(H.characterBlanked!(s, s.heroes[0]));
  s.round += 1;
  assert.ok(!H.characterBlanked!(s, s.heroes[0]));
  // Shadow: the defender's text box is blank this phase.
  s = base();
  const orc = engaged(s, EK.raiders);
  orc.shadows = [EK.devilry];
  s = defend(s, orc, s.heroes[0]);
  s = settle(s);
  assert.ok(H.characterBlanked!(s, s.heroes[0]));
  assert.ok(!H.characterBlanked!(s, s.heroes[1]));
  reload(s);
});

test("Set 21: Unspeakable Thing gets +X attack from the top card of the defending player's deck; Lightless Grotto protects staged non-unique enemies and engages one on travel; Many Roads", () => {
  let s = base();
  const thing = engaged(s, EK.unspeakable);
  thing.shadows = [EK.mithril];
  deck(s, [BROK, GUARD]);
  s = defend(s, thing, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Unspeakable Thing: Brok Ironfist is discarded from the top of your deck; it gets \+6 attack for this attack\.$/,
    ),
  );
  // 2 + 6 attack against Aragorn's 2 defense: 6 damage destroys him.
  assert.deepEqual(s.discard, [BROK, "01001"]);
  // Shadow: +1 attack.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.unspeakable];
  s = defend(s, raider, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(s, /^Unspeakable Thing: the attacking enemy gets \+1 attack\.$/),
  );
  // Lightless Grotto: non-unique staged enemies cannot take damage.
  s = base();
  const adder = stage(s, EK.adder);
  const elder = stage(s, EK.elder);
  stage(s, EK.grotto);
  damage(s, adder.id, 1);
  damage(s, elder.id, 1);
  flush(s);
  assert.deepEqual([adder.damage, elder.damage], [0, 1]);
  // Travel: the first player engages a staged enemy.
  s = base();
  const grotto = stage(s, EK.grotto);
  const target = stage(s, EK.adder);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: grotto.id });
  assert.match(
    s.choice!.title,
    /^Lightless Grotto · Choose an enemy in the staging area to engage/,
  );
  s = choose(s, target.id);
  s = settle(s);
  assert.ok(s.engaged.some((x) => x.id === target.id));
  // Many Roads: one different 0 cost location per player.
  s = base(2);
  s.encounterDeck = [EK.roads, EK.mithril, EK.gap, EK.hall];
  s.encounterDiscard = [EK.roots];
  s = run(s, fx("reveal"));
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Dreadful Gap", "Mithril Lode", "The Mountain's Roots"],
    "Western Hall costs 1",
  );
  s = choose(s, EK.roots);
  s = choose(s, EK.gap);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === EK.roots));
  assert.ok(s.staging.some((u) => u.code === EK.gap));
  // Shadow: a location from the discard pile is shuffled into the deck.
  s = base();
  const orc = engaged(s, EK.raiders);
  orc.shadows = [EK.roads];
  s.encounterDiscard = [EK.hall, EK.raiders];
  s = defend(s, orc, s.heroes[0]);
  s = settle(s);
  assert.ok(!s.encounterDiscard.includes(EK.hall));
  assert.ok(s.encounterDeck.includes(EK.hall));
  reload(s);
});

test("Set 22: Shadow Dweller takes only combat damage and deals X damage from the top card of the defending player's deck; Branching Paths; Fatigue stops player-card readying and, as a shadow, removes the defender", () => {
  let s = base();
  const dweller = engaged(s, EK.dweller);
  assert.equal(H.cannotAttach!(s, dweller, BLADE), true);
  damage(s, dweller.id, 2);
  flush(s);
  assert.equal(dweller.damage, 0, "no non-combat damage");
  damage(s, dweller.id, 2, { combatDamage: true });
  flush(s);
  assert.equal(dweller.damage, 2);
  dweller.shadows = [EK.mithril];
  deck(s, [STEWARD]);
  s = defend(s, dweller, s.heroes[0]);
  assert.match(s.choice!.title, /^Shadow Dweller · Assign 1 damage \(2 left\)/);
  s = settle(s);
  assert.ok(logged(s, /^Shadow Dweller: Steward of Gondor is discarded/));
  // Branching Paths: +1 threat per staged location (limit +3).
  s = base();
  const paths = stage(s, EK.branching);
  assert.equal(threatOf(s, paths), 1);
  stage(s, EK.mithril);
  stage(s, EK.mithril);
  stage(s, EK.mithril);
  assert.equal(threatOf(s, paths), 3);
  // Fatigue: each player exhausts a character; no readying by player card effects.
  s = base(2);
  reveal(s, EK.fatigue);
  s = settle(s);
  assert.equal(s.escapeKhazad!.fatigue, s.round);
  assert.ok(H.cannotPlayerReady!(s));
  assert.ok(seatView(s, 0).heroes.some((h) => h.exhausted));
  assert.ok(seatView(s, 1).heroes.some((h) => h.exhausted));
  // Shadow: the defender is removed; a different one may be declared.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.fatigue];
  const first = s.heroes[0];
  s = defend(s, raider, first);
  assert.match(
    s.choice!.title,
    /^Fatigue · Declare a different defending character, or leave the attack undefended/,
  );
  assert.ok(!s.choice!.options.some((o) => o.id === first.id));
  const next = s.heroes[1];
  s = choose(s, next.id);
  s = settle(s);
  assert.ok(get(s, next.id)?.exhausted);
  assert.ok(logged(s, /is declared as the defending character/));
  reload(s);
});

test("Set 23: Elder Nameless Thing cannot be optionally engaged and attacks the first player after the commit; Silent Caverns limits threat reduction and raises each threat on travel; Dark Places", () => {
  let s = base();
  const elder = stage(s, EK.elder);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, elder));
  s = base();
  stage(s, EK.elder);
  s.phase = "quest";
  s.encounterDeck = Array(6).fill(EK.mithril);
  s = act(s, { type: "TOGGLE_QUEST", id: s.heroes[2].id });
  s = act(s, { type: "COMMIT" });
  assert.match(s.choice!.title, /^Elder Nameless Thing · Immediate attack/);
  s = settle(s, "undefended");
  // Silent Caverns: no more than 1 threat reduced each round; travel: +2 threat.
  s = base();
  stage(s, EK.caverns);
  assert.equal(reduceThreat(s, 3, undefined, "player-card"), 1);
  assert.equal(reduceThreat(s, 1, undefined, "player-card"), 0);
  s.round += 1;
  assert.equal(reduceThreat(s, 2, undefined, "player-card"), 1);
  s = base(2);
  const caverns = stage(s, EK.caverns);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: caverns.id });
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  // Dark Places: X threat, the active location's; without one, surge.
  s = base(2);
  activate(s, EK.greatBridge);
  reveal(s, EK.darkPlaces);
  s = settle(s);
  assert.deepEqual(threats(s), [24, 24]);
  s = base();
  s.encounterDeck = [EK.darkPlaces, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /^Dark Places: there is no active location; it gains surge\.$/),
  );
  assert.ok(s.staging.some((u) => u.code === EK.mithril));
  // Shadow: +X attack, X the stage number.
  s = base();
  atQuest(s, EK.lair);
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.darkPlaces];
  s = defend(s, raider, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /^Dark Places: the attacking enemy gets \+2 attack\.$/));
  reload(s);
});

test("Set 24: Orc Horn Blower deals each engaged enemy an additional shadow card at the beginning of combat and, as a shadow, 2 more; Goblin Dungeon guards an ally until explored; Deep Fissure", () => {
  let s = base();
  stage(s, EK.horn);
  const a = engaged(s, EK.raiders);
  const b = engaged(s, EK.adder);
  s.encounterDeck = Array(6).fill(EK.mithril);
  H.combatBegin!(s);
  assert.deepEqual([a.shadows.length, b.shadows.length], [1, 1]);
  assert.ok(
    logged(
      s,
      /^Orc Horn Blower: each engaged enemy is dealt an additional shadow card\.$/,
    ),
  );
  // Shadow: 2 additional shadow cards, resolved in this attack.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.horn];
  s.encounterDeck = [EK.unspeakable, EK.branching, EK.mithril];
  s = defend(s, raider, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Orc Horn Blower: the attacking enemy is dealt 2 additional shadow cards\.$/,
    ),
  );
  assert.ok(
    logged(s, /^Unspeakable Thing: the attacking enemy gets \+1 attack\.$/),
  );
  assert.ok(
    logged(s, /^Branching Paths: the attacking enemy gets \+1 attack\.$/),
  );
  // Goblin Dungeon: an ally is guarded under it; explored, it returns exhausted.
  s = base(2);
  const [faramir] = allies(s, [FARAMIR], 1);
  faramir.damage = 1;
  attach(faramir, STEWARD);
  reveal(s, EK.dungeon);
  assert.match(
    s.choice!.title,
    /^Goblin Dungeon · The opposing team chooses an ally to guard under Goblin Dungeon/,
  );
  s = choose(s, faramir.id);
  s = settle(s);
  assert.equal(seatView(s, 1).allies.length, 0);
  assert.equal(s.escapeKhazad!.dungeon.length, 1);
  assert.equal(
    s.escapeKhazad!.dungeon[0].ally.damage,
    0,
    "its tokens are discarded",
  );
  const dungeon = s.staging.find((u) => u.code === EK.dungeon)!;
  s.staging = s.staging.filter((u) => u.id !== dungeon.id);
  s.activeLocation = dungeon;
  progress(s, 5);
  flush(s);
  s = settle(s);
  assert.ok(
    logged(s, /^Goblin Dungeon: Faramir returns to .* control, exhausted\.$/),
  );
  const back = seatView(s, 1).allies.find((u) => u.code === FARAMIR)!;
  assert.ok(back, "the ally returns to its owner's control");
  assert.equal(back.exhausted, true);
  assert.equal(s.escapeKhazad!.dungeon.length, 0);
  // Deep Fissure: each player damages a questing character and removes it from the quest.
  s = base();
  s.phase = "quest";
  quest(s.heroes[0], s);
  reveal(s, EK.fissure);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1);
  assert.equal(s.heroes[0].committed, false);
  // Shadow: 1 damage to a character you control.
  s = base();
  const orc = engaged(s, EK.adder);
  orc.shadows = [EK.fissure];
  s = defend(s, orc);
  assert.match(s.choice?.title ?? "", /^Deep Fissure · Assign 1 damage/);
  s = settle(s);
  reload(s);
});

test("Set 25: Black Uruks get +1 attack for each shadow card and, as a shadow, are dealt one from the top 5; Dreadful Gap; Orcish Howls exhausts a character for each Uruk", () => {
  let s = base();
  const uruks = engaged(s, EK.uruks);
  uruks.shadows = [EK.mithril, EK.mithril];
  s.combat = {
    enemyId: uruks.id,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
  } as unknown as NonNullable<GameState["combat"]>;
  assert.equal(stats(s, uruks).attack, 3 + 2);
  s.combat = null;
  assert.equal(stats(s, uruks).attack, 3);
  // Shadow: the opposing team deals a card from the top 5 as a shadow card.
  s = base();
  const raider = engaged(s, EK.raiders);
  raider.shadows = [EK.uruks];
  s.encounterDeck = [EK.mithril, EK.unspeakable, EK.mithril];
  s = defend(s, raider, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Black Uruks · The opposing team deals a card from the top 5 encounter cards to the attacking enemy as a shadow card/,
  );
  s = choose(s, EK.unspeakable);
  s = settle(s);
  assert.ok(
    logged(s, /^Unspeakable Thing: the attacking enemy gets \+1 attack\.$/),
  );
  // Dreadful Gap: no progress on other staged locations; travel shuffles a discard back.
  s = base();
  const gap = stage(s, EK.gap);
  const lode = stage(s, EK.mithril);
  assert.equal(H.locationProgressBlocked!(s, lode), true);
  assert.equal(H.locationProgressBlocked!(s, gap), false);
  s.encounterDiscard = [EK.raiders];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: gap.id });
  s = settle(s);
  assert.ok(s.encounterDeck.includes(EK.raiders));
  assert.ok(!s.encounterDiscard.includes(EK.raiders));
  // Orcish Howls: X characters exhausted, X the Uruk enemies; without Uruks, surge.
  s = base();
  stage(s, EK.horn);
  engaged(s, EK.raiders);
  reveal(s, EK.howls);
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.exhausted).length, 2);
  s = base();
  s.encounterDeck = [EK.howls, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Orcish Howls: there is no Uruk enemy in play; it gains surge\.$/,
    ),
  );
  // Shadow: +2 attack for an Uruk attacker.
  s = base();
  const orc = engaged(s, EK.raiders);
  orc.shadows = [EK.howls];
  s = defend(s, orc, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /^Orcish Howls: the attacking enemy gets \+2 attack\.$/));
  reload(s);
});

test("Set 26: Orc Raiders are dealt a shadow card when they engage and, as a shadow, deal another; The Great Bridge allows one attacker per enemy and reveals a card per player when explored; Vast and Intricate", () => {
  let s = base();
  const raider = stage(s, EK.raiders);
  s.encounterDeck = Array(4).fill(EK.mithril);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: raider.id });
  s = settle(s);
  const engagedRaider = s.engaged.find((u) => u.code === EK.raiders)!;
  assert.equal(engagedRaider.shadows.length, 1);
  // Shadow: +1 attack and an additional shadow card.
  s = base();
  const orc = engaged(s, EK.adder);
  orc.shadows = [EK.raiders];
  s.encounterDeck = [EK.branching];
  s = defend(s, orc);
  s = settle(s);
  assert.ok(logged(s, /^Orc Raiders: the attacking enemy gets \+1 attack\.$/));
  assert.ok(
    logged(s, /^Branching Paths: the attacking enemy gets \+1 attack\.$/),
  );
  // The Great Bridge: no more than 1 attacker against each enemy.
  s = base();
  const bridge = stage(s, EK.greatBridge);
  const enemy = engaged(s, EK.raiders);
  assert.match(
    H.attackProblem!(s, enemy, ["a", "b"]) ?? "",
    /no more than 1 character/,
  );
  assert.equal(H.attackProblem!(s, enemy, ["a"]), null);
  // Explored: 1 encounter card per player.
  s = base(2);
  s.activeLocation = bridge;
  s.encounterDeck = [EK.mithril, EK.mithril, EK.mithril];
  progress(s, 5);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === EK.mithril).length, 2);
  // Vast and Intricate: on a non-unique staged location; else surge.
  s = base();
  const lode = stage(s, EK.mithril);
  stage(s, EK.greatBridge);
  reveal(s, EK.vast);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [lode.id],
    "The Great Bridge is unique",
  );
  s = choose(s, lode.id);
  s = settle(s);
  const vast = s.staging.find((u) => u.id === lode.id)!;
  assert.ok(vast.attachments.some((a) => a.code === EK.vast));
  assert.equal(threatOf(s, vast), 3 + 2);
  assert.equal(playerEffectImmune(s, vast), true);
  s = base();
  s.encounterDeck = [EK.vast, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Vast and Intricate: there is no non-unique location in the staging area; it gains surge\.$/,
    ),
  );
  reload(s);
});

test("Set 27: Chieftain of the Pit takes only combat damage, keeps shadow effects from being canceled and is dealt an additional shadow card when it attacks; Forked Passage; Chance Encounter", () => {
  let s = base();
  const chief = engaged(s, EK.chieftain);
  assert.equal(H.cannotAttach!(s, chief, BLADE), true);
  assert.equal(H.cannotCancel!(s, true), true);
  assert.equal(H.cannotCancel!(s, false, EK.deepDark), false);
  damage(s, chief.id, 2);
  flush(s);
  assert.equal(chief.damage, 0);
  chief.shadows = [EK.mithril];
  s.encounterDeck = [EK.unspeakable, EK.mithril];
  s = defend(s, chief, s.heroes[0]);
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Chieftain of the Pit attacks: it is dealt an additional shadow card\.$/,
    ),
  );
  assert.ok(
    logged(s, /^Unspeakable Thing: the attacking enemy gets \+1 attack\.$/),
  );
  // Forked Passage: +1 threat in the refresh phase per copy; travel: +1 threat.
  s = base(2);
  const forked = stage(s, EK.forked);
  stage(s, EK.forked);
  assert.equal(H.refreshThreatBonus!(s), 2);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: forked.id });
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  // Chance Encounter: the highest attack staged enemy attacks the first player.
  s = base();
  stage(s, EK.adder);
  const troll = stage(s, EK.stoneTroll);
  s.encounterDeck = [EK.chance, EK.mithril, EK.mithril];
  s = run(s, fx("reveal"));
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [troll.id],
  );
  s = choose(s, troll.id);
  assert.match(s.choice!.title, /^Old Stone-troll · Immediate attack/);
  s = settle(s, "undefended");
  s = base();
  s.encounterDeck = [EK.chance, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^Chance Encounter: there is no enemy in the staging area; it gains surge\.$/,
    ),
  );
  // Shadow: a unique attacker attacks again.
  s = base();
  const elder = engaged(s, EK.elder);
  elder.shadows = [EK.chance];
  s.encounterDeck = Array(4).fill(EK.mithril);
  s = defend(s, elder, s.heroes[0]);
  assert.match(
    s.choice?.title ?? "",
    /^Elder Nameless Thing · Immediate attack/,
  );
  s = settle(s, "undefended");
  reload(s);
});

test("Set 28: Nameless Thing holds the top card of the first player's deck and gets +X threat, attack and defense; Mithril Lode gives each player a resource when explored as the active location; A Foe Beyond", () => {
  let s = base();
  deck(s, [BROK, GUARD]);
  s.encounterDeck = [EK.nameless, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  const thing = s.staging.find((u) => u.code === EK.nameless)!;
  assert.deepEqual(s.escapeKhazad!.nameless, [
    { enemyId: thing.id, player: 0, code: BROK },
  ]);
  assert.deepEqual(seatView(s, 0).deck, [GUARD]);
  assert.deepEqual(
    [threatOf(s, thing), stats(s, thing).attack, stats(s, thing).defense],
    [1 + 6, 1 + 6, 1 + 6],
  );
  damage(s, thing.id, 4);
  flush(s);
  s = settle(s);
  assert.ok(!s.staging.some((u) => u.id === thing.id));
  assert.deepEqual(s.discard, [BROK], "the card is discarded");
  assert.deepEqual(s.escapeKhazad!.nameless, []);
  // Mithril Lode: explored as the active location, each player adds a resource to a hero.
  s = base(2);
  activate(s, EK.mithril);
  progress(s, 5);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Mithril Lode · Response: each player adds 1 resource/,
  );
  s = choose(s, "use");
  const h0 = seatView(s, 0).heroes[0];
  s = choose(s, h0.id);
  const h1 = seatView(s, 1).heroes[1];
  s = choose(s, h1.id);
  s = settle(s);
  assert.equal(seatView(s, 0).heroes[0].resources, 11);
  assert.equal(seatView(s, 1).heroes[1].resources, 11);
  // A Foe Beyond: an attachment controlled by a player is discarded; else surge.
  s = base();
  const blade = attach(s.heroes[0], BLADE);
  reveal(s, EK.foe);
  s = choose(s, blade.id);
  s = settle(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.ok(s.discard.includes(BLADE));
  s = base();
  s.encounterDeck = [EK.foe, EK.mithril];
  s = run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /^A Foe Beyond: no player controls an attachment; it gains surge\.$/,
    ),
  );
  // Shadow: discard an attachment you control.
  s = base();
  attach(s.heroes[1], COURAGE);
  const orc = engaged(s, EK.raiders);
  orc.shadows = [EK.foe];
  s = defend(s, orc, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[1].attachments.length, 0);
  void hand;
  void readyCharacter;
  void stagingThreat;
  void bane;
  void TEST_OF_WILL;
  void ARCHER;
  void SNOWBOURN;
});
