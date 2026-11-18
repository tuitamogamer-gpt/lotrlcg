import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, optionalEngagementProblem } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, get, stagingThreat, stats, threatOf } from "../src/game/core";
import { progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { forOwner, seatView } from "../src/game/table";
import { MINES_MORIA_HOOKS, MM } from "../src/game/mines-moria";
import {
  activate,
  allies,
  atQuest,
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./mines-moria-fixtures";
import type { GameState, Unit } from "../src/game/types";

const H = MINES_MORIA_HOOKS;
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
const exhaustedCount = (s: GameState, p = 0) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => u.exhausted,
  ).length;
const totalDamage = (s: GameState, p = 0) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].reduce(
    (n, u) => n + u.damage,
    0,
  );
const GUARD = "01013",
  SNOWBOURN = "01016",
  ARCHER = "01017",
  STEWARD = "01026",
  BLADE = "01039",
  COURAGE = "01057",
  SNEAK_ATTACK = "01023";
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

test("Set 1: Savage Werewolf attacks again after a blank shadow card; Many-pillared Hall; Shadow of Fear blanks a hero's text box", () => {
  let s = base();
  const savage = engaged(s, MM.savage);
  savage.shadows = [MM.forge];
  s.encounterDeck = [MM.foul];
  const [chump, second] = allies(s, [GUARD, SNOWBOURN]);
  s = defend(s, savage, chump);
  assert.ok(
    logged(s, /Savage Werewolf is dealt a shadow card with no shadow effect/),
  );
  assert.match(s.choice?.title ?? "", /Savage Werewolf · Immediate attack/);
  s = choose(s, second.id);
  s = settle(s);
  assert.deepEqual(
    s.encounterDeck,
    [MM.foul],
    "no shadow card for the additional attack",
  );
  // Shadow: an additional attack (dealt a shadow card as usual).
  s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.savage];
  s.encounterDeck = [MM.forge, MM.forge];
  s = defend(s, sneak, s.heroes[0]);
  assert.ok(
    logged(
      s,
      /Savage Werewolf: the attacking enemy makes an additional attack/,
    ),
  );
  assert.match(s.choice?.title ?? "", /Goblin Sneak · Immediate attack/);
  s = settle(s);
  // Many-pillared Hall: +1 threat per copy in the staging area.
  s = base();
  const hall = stage(s, MM.hall);
  stage(s, MM.hall);
  assert.equal(threatOf(s, hall), 1 + 2);
  // Shadow: discard an attachment from the defending character.
  s = base();
  const goblin = engaged(s, MM.sneak);
  goblin.shadows = [MM.hall];
  s.encounterDeck = [];
  attach(s.heroes[0], BLADE);
  s = defend(s, goblin, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Many-pillared Hall · Shadow: discard an attachment from Aragorn/,
  );
  s = settle(s);
  assert.equal(s.heroes[0].attachments.length, 0);
  assert.ok(s.discard.includes(BLADE));
  // Shadow of Fear: the opposing team attaches it to a hero.
  s = base();
  reveal(s, MM.fear);
  assert.match(
    s.choice!.title,
    /^Shadow of Fear · The opposing team attaches it to a hero/,
  );
  s = choose(s, s.heroes[1].id);
  s = settle(s);
  const hero = s.heroes[1];
  assert.ok(hero.attachments.some((a) => a.code === MM.fear));
  assert.equal(H.characterBlanked!(s, hero), true);
  assert.equal(H.characterBlanked!(s, s.heroes[0]), false);
  assert.ok(!s.encounterDiscard.includes(MM.fear));
  reload(s);
});

test("Set 2: Deep-dweller returns the engaged Spiders; Darkened Stairway punishes canceled 'when revealed' effects and resolves a treachery on travel; We Cannot Get Out", () => {
  let s = base();
  engaged(s, MM.broodling);
  engaged(s, MM.sneak);
  reveal(s, MM.dweller);
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [MM.dweller, MM.broodling].sort(),
  );
  assert.deepEqual(
    s.engaged.map((u) => u.code),
    [MM.sneak],
  );
  // Shadow: +1 attack, +2 for a Spider.
  for (const [code, bonus] of [
    [MM.sneak, 1],
    [MM.broodling, 2],
  ] as const) {
    s = base();
    const enemy = engaged(s, code);
    enemy.shadows = [MM.dweller];
    s.encounterDeck = [];
    s = defend(s, enemy, s.heroes[0]);
    s = settle(s);
    assert.ok(
      logged(
        s,
        new RegExp(`Deep-dweller: the attacking enemy gets \\+${bonus} attack`),
      ),
    );
  }
  // Darkened Stairway: a canceled 'when revealed' effect reveals the top card.
  s = base();
  const stairway = stage(s, MM.stairway);
  s.encounterDeck = [MM.forge];
  H.whenRevealedCancelled!(s, MM.foul);
  flush(s);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === MM.forge).length, 1);
  // Travel: the top card is discarded; a treachery resolves its 'when revealed' effect.
  s.encounterDeck = [MM.cannot, MM.forge];
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: stairway.id });
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Darkened Stairway: We Cannot Get Out is discarded from the encounter deck and its 'when revealed' effect resolves/,
    ),
  );
  assert.ok(s.encounterDiscard.includes(MM.cannot));
  assert.equal(s.minesMoria!.stagingBonus.length, 1);
  // We Cannot Get Out: X threat, the most characters controlled by a player.
  s = base(2);
  allies(s, [GUARD, SNOWBOURN], 1);
  s.phase = "staging";
  const before = stagingThreat(s);
  reveal(s, MM.cannot);
  s = settle(s);
  assert.equal(stagingThreat(s), before + 5);
  s.phase = "travel";
  assert.equal(stagingThreat(s), before, "until the end of the phase");
  // Shadow: X damage among your characters, X the enemies engaged with you.
  s = base();
  const sneak = engaged(s, MM.sneak);
  engaged(s, MM.werewolf);
  sneak.shadows = [MM.cannot];
  s.encounterDeck = [];
  s = defend(s, sneak, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^We Cannot Get Out · Assign 1 damage \(2 left\)/,
  );
  s = settle(s);
  assert.equal(totalDamage(s), 2 + 1, "2 from the shadow, 1 from the attack");
  reload(s);
});

test("Set 3: Spider Broodling removes 2 progress after it engages; Spider Burrow strengthens the Spiders and brings one when explored; Grabbed by Spiders removes questing characters", () => {
  let s = base();
  const brood = stage(s, MM.broodling);
  s.progress = 3;
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: brood.id });
  s = settle(s);
  assert.equal(s.progress, 1);
  // Shadow: +1 attack; if the attack destroys a character, 2 progress are removed.
  s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.broodling];
  s.encounterDeck = [];
  s.progress = 4;
  const [chump] = allies(s, [GUARD]);
  s = defend(s, sneak, chump);
  s = settle(s);
  assert.ok(!s.allies.some((u) => u.id === chump.id));
  assert.equal(s.progress, 2);
  // Spider Burrow.
  s = base();
  stage(s, MM.burrow);
  const spider = engaged(s, MM.broodling);
  const goblin = engaged(s, MM.sneak);
  assert.equal(stats(s, spider).defense, 1 + 1);
  assert.equal(stats(s, goblin).defense, 1);
  s = base();
  activate(s, MM.burrow);
  s.encounterDeck = [MM.forge, MM.broodling];
  s.encounterDiscard = [MM.hive, MM.spinner];
  progress(s, 4);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Spider Burrow · The opposing team adds a Spider enemy with cost 1 or less/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Spider Broodling", "Web-spinner"],
  );
  s = choose(s, MM.spinner);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === MM.spinner));
  // Grabbed by Spiders: X questing characters, X the Spider enemies in play.
  s = base();
  s.phase = "staging";
  const [a, b, c] = s.heroes;
  quest(a, s);
  quest(b, s);
  quest(c, s);
  engaged(s, MM.broodling);
  stage(s, MM.spinner);
  reveal(s, MM.grabbed);
  assert.match(
    s.choice!.title,
    /^Grabbed by Spiders · Remove a character from the quest \(2 left\)/,
  );
  s = settle(s);
  assert.equal(s.heroes.filter((h) => h.committed).length, 1);
  s = base();
  s.encounterDeck = [MM.grabbed, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Grabbed by Spiders: there is no Spider enemy in play; it gains surge/,
    ),
  );
  // Shadow: the defending character cannot ready until the end of the round.
  s = base();
  const g = engaged(s, MM.sneak);
  g.shadows = [MM.grabbed];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(H.cannotReady!(s, s.heroes[0]), true);
  s.round++;
  assert.equal(H.cannotReady!(s, s.heroes[0]), false);
  reload(s);
});

test("Set 4: Moria Bats surge and shuffle back as a shadow; Ancient Guardroom grows with each event and damages on travel; Denizen of the Deep", () => {
  let s = base();
  s.encounterDeck = [MM.bats, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === MM.bats));
  assert.ok(
    s.staging.some((u) => u.code === MM.forge),
    "surge",
  );
  s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.bats];
  s.encounterDeck = [MM.forge];
  s = defend(s, sneak, s.heroes[0]);
  s = settle(s);
  assert.ok(s.encounterDeck.includes(MM.bats));
  // Ancient Guardroom: +1 threat per resource; events add resources.
  s = base();
  const room = stage(s, MM.guardroom);
  assert.equal(threatOf(s, room), 2);
  H.eventPlayed!(s, room);
  H.eventPlayed!(s, room);
  assert.equal(room.resources, 2);
  assert.equal(threatOf(s, room), 4);
  // Travel: X damage among characters in play, X its threat.
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: room.id });
  assert.match(
    s.choice!.title,
    /^Ancient Guardroom · Assign 1 damage \(4 left\) to a character in play/,
  );
  s = settle(s);
  assert.equal(totalDamage(s), 4);
  // Denizen of the Deep: on a non-unique enemy, which returns to the staging area.
  s = base();
  const wolf = engaged(s, MM.werewolf);
  engaged(s, MM.brood);
  reveal(s, MM.denizen);
  assert.match(
    s.choice!.title,
    /^Denizen of the Deep · The opposing team attaches it to a non-unique enemy/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [wolf.id],
    "Brood Mother is unique",
  );
  s = choose(s, wolf.id);
  s = settle(s);
  const staged = s.staging.find((u) => u.id === wolf.id)!;
  assert.ok(staged.attachments.some((a) => a.code === MM.denizen));
  assert.equal(threatOf(s, staged), 2 + 1);
  assert.equal(stats(s, staged).attack, 4 + 1);
  assert.equal(stats(s, staged).defense, 1 + 1);
  assert.equal(H.immune!(s, staged), true);
  s = base();
  s.encounterDeck = [MM.denizen, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(
      s,
      /Denizen of the Deep: there is no non-unique enemy in play; it gains surge/,
    ),
  );
  reload(s);
});

test("Set 5: Werewolf engages sooner with an active location; Fouled Well stops player card readying and exhausts on travel; Cave In returns the active location", () => {
  let s = base();
  const wolf = stage(s, MM.werewolf);
  assert.equal(H.engagementBonus!(s, wolf), 0);
  activate(s, MM.forge);
  assert.equal(H.engagementBonus!(s, wolf), -10);
  // Fouled Well.
  s = base(2);
  const well = stage(s, MM.well);
  assert.equal(H.cannotPlayerReady!(s), true);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: well.id });
  assert.match(
    s.choice!.title,
    /^Fouled Well · Exhaust a character you control/,
  );
  s = settle(s);
  assert.equal(exhaustedCount(s, 0), 1);
  assert.equal(exhaustedCount(s, 1), 1);
  assert.equal(H.cannotPlayerReady!(s), false, "no longer staged");
  // Cave In: the active location returns; each player assigns its threat as damage.
  s = base(2);
  activate(s, MM.forge);
  reveal(s, MM.caveIn);
  assert.match(s.choice!.title, /^Cave In · Assign 1 damage \(3 left\)/);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.code === MM.forge));
  assert.equal(totalDamage(s, 0), 3);
  assert.equal(totalDamage(s, 1), 3);
  s = base();
  s.encounterDeck = [MM.caveIn, MM.hall];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(logged(s, /Cave In: there is no active location; it gains surge/));
  // Shadow: if the attack destroys a character, the active location returns.
  s = base();
  activate(s, MM.forge);
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.caveIn];
  s.encounterDeck = [];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, sneak, chump);
  s = settle(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.staging.some((u) => u.code === MM.forge));
  reload(s);
});

test("Set 6: Hive Guardian returns after it destroys an ally; Abandoned Mines takes no progress in the staging area; Sudden Pitfall", () => {
  let s = base();
  const hive = engaged(s, MM.hive);
  s.encounterDeck = [];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, hive, chump);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === hive.id));
  // Shadow: the attacking enemy returns to the staging area.
  s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.hive];
  s.encounterDeck = [];
  s = defend(s, sneak, s.heroes[0]);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === sneak.id));
  // Abandoned Mines.
  s = base();
  const mines = stage(s, MM.mines);
  assert.equal(H.locationProgressBlocked!(s, mines), true);
  s.staging = [];
  s.activeLocation = mines;
  assert.equal(H.locationProgressBlocked!(s, mines), false);
  // Shadow: an enemy that engaged this round cannot take damage this phase.
  s = base();
  const fresh = stage(s, MM.sneak);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: fresh.id });
  s = settle(s);
  get(s, fresh.id)!.shadows = [MM.mines];
  s.encounterDeck = [];
  s = defend(s, get(s, fresh.id)!, s.heroes[0]);
  s = settle(s);
  assert.equal(
    H.damageAmount!(s, get(s, fresh.id)!, 3, { combatDamage: true }),
    0,
  );
  // Sudden Pitfall: the opposing team discards an ally.
  s = base(2);
  allies(s, [GUARD], 0);
  allies(s, [ARCHER], 1);
  reveal(s, MM.pitfall);
  assert.match(
    s.choice!.title,
    /^Sudden Pitfall · The opposing team chooses and discards an ally/,
  );
  assert.equal(s.choice!.options.length, 2);
  s = choose(s, s.choice!.options[1].id);
  s = settle(s);
  assert.equal(seatView(s, 1).allies.length, 0);
  assert.ok(seatView(s, 1).discard.includes(ARCHER));
  s = base();
  s.encounterDeck = [MM.pitfall, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /Sudden Pitfall: there is no ally to discard; it gains surge/),
  );
  // Shadow: discard an ally, or the attacker cannot take damage this phase.
  s = base();
  const rider = engaged(s, MM.sneak);
  rider.shadows = [MM.pitfall];
  s.encounterDeck = [];
  allies(s, [GUARD]);
  s = defend(s, rider, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^Sudden Pitfall · Shadow: discard an ally you control, or the attacking enemy cannot take damage/,
  );
  s = choose(s, "protect");
  s = settle(s);
  assert.equal(
    H.damageAmount!(s, get(s, rider.id)!, 3, { combatDamage: true }),
    0,
  );
  assert.equal(s.allies.length, 1);
  reload(s);
});

test("Set 7: Web-spinner caps the progress or surges; Cobwebbed Cavern removes progress; Foul Air damages the questers or ends the quest phase", () => {
  for (const option of ["cap", "surge"]) {
    let s = base();
    s.phase = "staging";
    s.encounterDeck = [MM.spinner, MM.forge];
    run(s, fx("reveal"));
    assert.match(
      s.choice!.title,
      /^Web-spinner · No more than 4 progress can be placed on the current quest this phase, or Web-spinner gains surge/,
    );
    s = choose(s, option);
    s = settle(s);
    assert.equal(
      s.staging.some((u) => u.code === MM.forge),
      option === "surge",
    );
    if (option === "cap") {
      progress(s, 6);
      assert.equal(s.progress, 4);
    }
  }
  // Shadow: if the attack destroys a character, the attacker returns.
  let s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.spinner];
  s.encounterDeck = [];
  const [chump] = allies(s, [GUARD]);
  s = defend(s, sneak, chump);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === sneak.id));
  // Cobwebbed Cavern: travel and shadow remove 2 progress.
  s = base();
  const cavern = stage(s, MM.cavern);
  s.progress = 3;
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: cavern.id });
  s = settle(s);
  assert.equal(s.progress, 1);
  s = base();
  const g = engaged(s, MM.sneak);
  g.shadows = [MM.cavern];
  s.encounterDeck = [];
  s.progress = 5;
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(s.progress, 3);
  // Foul Air: 1 damage to each questing character...
  s = base();
  s.phase = "staging";
  quest(s.heroes[0], s);
  quest(s.heroes[1], s);
  reveal(s, MM.foul);
  assert.match(
    s.choice!.title,
    /^Foul Air · Deal 1 damage to each character committed to the quest, or raise each player's threat by 1/,
  );
  s = choose(s, "damage");
  s = settle(s);
  assert.equal(totalDamage(s), 2);
  // ...or 1 threat and the quest phase ends without resolving the quest.
  s = base(2);
  s.phase = "quest";
  s.encounterDeck = [MM.foul, MM.forge, MM.forge];
  s = act(s, { type: "COMMIT" });
  while (s.choice?.title.startsWith("Aragorn")) s = choose(s, "skip");
  if (s.phase === "quest") s = act(s, { type: "COMMIT" });
  for (let n = 0; n < 10 && !s.choice?.title.startsWith("Foul Air"); n++)
    s = s.choice
      ? choose(
          s,
          s.choice.options.find((o) => o.id === "skip" || o.id === "resolve")
            ?.id ?? s.choice.options[0].id,
        )
      : s;
  assert.match(s.choice!.title, /^Foul Air · /);
  s = choose(s, "end");
  s = settle(s);
  assert.deepEqual(threats(s), [21, 21]);
  assert.equal(
    s.staging.filter((u) => u.code === MM.forge).length,
    0,
    "no more reveals",
  );
  // Shadow: 1 damage to the defending character.
  s = base();
  const goblin = engaged(s, MM.sneak);
  goblin.shadows = [MM.foul];
  s.encounterDeck = [];
  s = defend(s, goblin, s.heroes[0]);
  s = settle(s);
  assert.equal(s.heroes[0].damage, 1 + 1);
  reload(s);
});

test("Set 8: Brood Mother takes only combat damage and caps the progress on the quest each round; Lightless Passage; Lurking Malice", () => {
  let s = base();
  const brood = stage(s, MM.brood);
  assert.equal(H.cannotAttach!(s, brood, BLADE), true);
  assert.equal(H.damageAmount!(s, brood, 3, {}), 0);
  assert.equal(H.damageAmount!(s, brood, 3, { combatDamage: true }), 3);
  progress(s, 3);
  progress(s, 4);
  assert.equal(s.progress, 5);
  s.round++;
  progress(s, 2);
  assert.equal(s.progress, 7);
  // Lightless Passage: 1 progress on each staged location each round.
  s = base();
  stage(s, MM.lightless);
  const forge = stage(s, MM.forge);
  assert.equal(H.locationProgressCapacity!(s, forge), 1);
  H.locationProgressPlaced!(s, forge, 1);
  assert.equal(H.locationProgressCapacity!(s, forge), 0);
  // Travel: each player discards 1 random card.
  s = base(2);
  const passage = stage(s, MM.lightless);
  hand(s, [GUARD, ARCHER], 0);
  hand(s, [SNOWBOURN], 1);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: passage.id });
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 0);
  // Lurking Malice: every resource discarded adds 1 to the staging threat.
  s = base(2);
  for (const p of [0, 1])
    forOwner(s, p, () => s.heroes.forEach((h, i) => (h.resources = i)));
  s.phase = "staging";
  const before = stagingThreat(s);
  reveal(s, MM.malice);
  s = settle(s);
  assert.equal(stagingThreat(s), before + 6);
  for (const p of [0, 1])
    assert.ok(seatView(s, p).heroes.every((h) => h.resources === 0));
  s = base();
  for (const h of s.heroes) h.resources = 0;
  s.encounterDeck = [MM.malice, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /Lurking Malice: no resource was discarded; it gains surge/),
  );
  // Shadow: discard a resource from a hero's pool.
  s = base();
  const g = engaged(s, MM.sneak);
  g.shadows = [MM.malice];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.resources, 0),
    29,
  );
  reload(s);
});

test("Set 9: Dark and Dreadful adds the discarded cards' costs to the staging threat; Great Cave-troll raises the threat after the encounter phase; Zigil Mineshaft's Quest Action", () => {
  let s = base(2);
  hand(s, [STEWARD], 0);
  hand(s, [ARCHER], 1);
  s.phase = "staging";
  const before = stagingThreat(s);
  reveal(s, MM.dreadful);
  s = settle(s);
  assert.equal(stagingThreat(s), before + 2 + 3);
  // Shadow: a random card from the defending player's hand.
  s = base();
  hand(s, [GUARD, SNOWBOURN]);
  const g = engaged(s, MM.sneak);
  g.shadows = [MM.dreadful];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(s.hand.length, 1);
  // Great Cave-troll.
  s = base(2);
  const troll = stage(s, MM.troll);
  assert.equal(H.cannotAttach!(s, troll, COURAGE), true);
  run(s, ...H.encounterEnd!(s));
  assert.deepEqual(threats(s), [22, 22]);
  // Zigil Mineshaft: the first player raises each threat by 1 for -1 threat.
  s = base(2);
  const zigil = stage(s, MM.zigil);
  assert.equal(threatOf(s, zigil), 5);
  s.phase = "planning";
  assert.match(H.abilityProblem!(s, zigil)!, /during the quest phase/);
  s.phase = "staging";
  assert.equal(H.abilityProblem!(s, zigil), null);
  s = act(s, { type: "ABILITY", id: zigil.id });
  s = settle(s);
  s = act(s, { type: "ABILITY", id: zigil.id });
  s = settle(s);
  assert.deepEqual(threats(s), [22, 22]);
  assert.equal(threatOf(s, get(s, zigil.id)!), 3);
  s.phase = "travel";
  assert.equal(threatOf(s, get(s, zigil.id)!), 5, "until the end of the phase");
  reload(s);
});

test("Set 10: Goblin Follower joins each engagement; Stairs of Náin makes the first treachery surge and stay uncanceled; Hidden Threat waits under the quest", () => {
  let s = base();
  const follower = stage(s, MM.follower);
  const wolf = stage(s, MM.werewolf);
  s.phase = "encounter";
  assert.ok(optionalEngagementProblem(s, follower));
  s = act(s, { type: "ENGAGE", id: wolf.id });
  s = settle(s);
  assert.deepEqual(
    s.engaged.map((u) => u.code).sort(),
    [MM.werewolf, MM.follower].sort(),
  );
  // Stairs of Náin: the first treachery revealed each round gains surge and cannot be canceled.
  s = base();
  stage(s, MM.stairs);
  s.phase = "staging";
  s.encounterDeck = [MM.signs, MM.forge, MM.signs, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === MM.forge).length, 1, "surge");
  assert.equal(
    H.revealedSurge!(s, MM.signs),
    false,
    "only the first treachery",
  );
  // Explored: each player raises his threat by 4.
  s = base(2);
  activate(s, MM.stairs);
  progress(s, 6);
  flush(s);
  s = settle(s);
  assert.deepEqual(threats(s), [24, 24]);
  // Hidden Threat: facedown under the quest, revealed after a successful quest.
  s = base();
  s.encounterDeck = [MM.hidden, MM.hall, MM.brood, MM.forge];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^Hidden Threat · The opposing team places a card with cost 1 or less from the top 5/,
  );
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Dwarven Forge",
    "Many-pillared Hall",
  ]);
  s = choose(s, MM.hall);
  s = settle(s);
  assert.deepEqual(s.minesMoria!.hidden, [MM.hall]);
  H.questSucceeded!(s, 3);
  flush(s);
  s = settle(s);
  assert.deepEqual(s.minesMoria!.hidden, []);
  assert.ok(s.staging.some((u) => u.code === MM.hall));
  reload(s);
});

test("Set 11: Goblin Warlord brings a 0 cost Goblin as it enters play; Dwarven Forge lets each player draw; Signs of Conflict", () => {
  let s = base();
  s.encounterDeck = [MM.warlord, MM.forge, MM.swarming];
  s.encounterDiscard = [MM.follower, MM.sneak];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^Goblin Warlord · The opposing team adds a Goblin enemy with cost 0/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Goblin Follower", "Swarming Goblins"],
  );
  s = choose(s, MM.follower);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === MM.follower));
  const warlord = s.staging.find((u) => u.code === MM.warlord)!;
  assert.equal(H.damageAmount!(s, warlord, 2, {}), 0);
  assert.equal(H.cannotAttach!(s, warlord, BLADE), true);
  // A return to the staging area is not an entry into play.
  forOwner(s, 0, () => s.engaged.push(warlord));
  s.staging = s.staging.filter((u) => u.id !== warlord.id);
  run(s, fx("immediateAttack", { target: warlord.id }));
  H.enemyEntered!(s, warlord);
  assert.equal(s.queue.filter((e) => e.kind === "mmTraitSearch").length, 0);
  // Dwarven Forge: explored as the active location, each player may draw.
  s = base(2);
  activate(s, MM.forge);
  deck(s, [GUARD, GUARD], 0);
  deck(s, [GUARD, GUARD], 1);
  progress(s, 5);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Dwarven Forge · Response: each player draws 1 card\?/,
  );
  s = choose(s, "use");
  s = settle(s);
  assert.equal(seatView(s, 0).hand.length, 1);
  assert.equal(seatView(s, 1).hand.length, 1);
  // Signs of Conflict: staged enemies and locations get +1 threat this phase.
  s = base();
  s.phase = "staging";
  const forge = stage(s, MM.forge);
  const sneak = stage(s, MM.sneak);
  reveal(s, MM.signs);
  s = settle(s);
  assert.equal(threatOf(s, forge), 3 + 1);
  assert.equal(threatOf(s, sneak), 2 + 1);
  s.phase = "travel";
  assert.equal(threatOf(s, forge), 3);
  // Shadow: +1 attack, +2 if the defending player is engaged with another enemy.
  for (const [extra, bonus] of [
    [false, 1],
    [true, 2],
  ] as const) {
    s = base();
    const g = engaged(s, MM.sneak);
    if (extra) engaged(s, MM.werewolf);
    g.shadows = [MM.signs];
    s.encounterDeck = [];
    s = defend(s, g, s.heroes[0]);
    s = settle(s);
    assert.ok(
      logged(
        s,
        new RegExp(
          `Signs of Conflict: the attacking enemy gets \\+${bonus} attack`,
        ),
      ),
    );
  }
  reload(s);
});

test("Set 12: Goblin Archer damages after the encounter phase; Narrow Fissure stops healing and damages on travel; Crumbling Ruin", () => {
  let s = base();
  stage(s, MM.archer);
  engaged(s, MM.sneak);
  run(s, ...H.encounterEnd!(s));
  assert.match(
    s.choice!.title,
    /^Goblin Archer · Assign 1 damage \(2 left\) to a character in play/,
  );
  s = settle(s);
  assert.equal(totalDamage(s), 2);
  // Narrow Fissure.
  s = base(2);
  const fissure = stage(s, MM.fissure);
  assert.equal(H.cannotHeal!(s, s.heroes[0]), true);
  s.phase = "travel";
  s = act(s, { type: "TRAVEL", id: fissure.id });
  assert.match(
    s.choice!.title,
    /^Narrow Fissure · Deal 1 damage to a hero you control/,
  );
  s = settle(s);
  assert.equal(totalDamage(s, 0), 1);
  assert.equal(totalDamage(s, 1), 1);
  assert.equal(H.cannotHeal!(s, s.heroes[0]), false);
  // Crumbling Ruin: each player assigns 1 damage per character he controls.
  s = base(2);
  allies(s, [GUARD], 1);
  reveal(s, MM.ruin);
  s = settle(s);
  assert.equal(totalDamage(s, 0), 3);
  assert.equal(totalDamage(s, 1), 4);
  // Shadow: exhaust a character you control.
  s = base();
  const g = engaged(s, MM.sneak);
  g.shadows = [MM.ruin];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(exhaustedCount(s), 2, "the defender and one more character");
  reload(s);
});

test("Set 13: Goblin Sneak brings a cheap Goblin from the top 5; Plundered Armoury stages an enemy from the top; They Are Coming!", () => {
  let s = base();
  s.encounterDeck = [
    MM.sneak,
    MM.forge,
    MM.warlord,
    MM.swarming,
    MM.archer,
    MM.forge,
    MM.follower,
  ];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^Goblin Sneak · The opposing team adds a Goblin enemy of cost 1 or less from the top 5/,
  );
  // Goblin Warlord costs 3; Goblin Follower is sixth.
  assert.deepEqual(s.choice!.options.map((o) => card(o.code!).name).sort(), [
    "Goblin Archer",
    "Swarming Goblins",
  ]);
  s = choose(s, MM.archer);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === MM.archer));
  // Shadow: +1 attack.
  s = base();
  const g = engaged(s, MM.werewolf);
  g.shadows = [MM.sneak];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.ok(logged(s, /Goblin Sneak: the attacking enemy gets \+1 attack/));
  // Plundered Armoury.
  s = base();
  s.encounterDeck = [MM.armoury, MM.werewolf];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === MM.werewolf));
  s = base();
  s.encounterDeck = [MM.armoury, MM.foul];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(MM.foul));
  // They Are Coming!: one different 0 cost enemy per player.
  s = base(2);
  s.encounterDeck = [MM.coming, MM.werewolf, MM.forge];
  s.encounterDiscard = [MM.follower, MM.werewolf];
  run(s, fx("reveal"));
  assert.match(
    s.choice!.title,
    /^They Are Coming! · The opposing team adds a different 0 cost enemy/,
  );
  s = choose(s, MM.werewolf);
  assert.ok(!s.choice!.options.some((o) => o.code === MM.werewolf));
  s = settle(s);
  assert.deepEqual(
    s.staging.map((u) => u.code).sort(),
    [MM.follower, MM.werewolf].sort(),
  );
  // Shadow: the opposing team shuffles an enemy from the discard pile into the deck.
  s = base();
  const sneak = engaged(s, MM.sneak);
  sneak.shadows = [MM.coming];
  s.encounterDeck = [];
  s.encounterDiscard = [MM.brood, MM.foul];
  s = defend(s, sneak, s.heroes[0]);
  assert.match(
    s.choice!.title,
    /^They Are Coming! · Shadow: the opposing team shuffles an enemy/,
  );
  s = settle(s);
  assert.ok(s.encounterDeck.includes(MM.brood));
  void SNEAK_ATTACK;
  reload(s);
});

test("Set 14: Swarming Goblins return from the discard pile and join Goblin attacks; Goblin Tunnels; Massing in the Deep", () => {
  let s = base();
  s.encounterDiscard = [MM.swarming, MM.foul, MM.swarming];
  s.encounterDeck = [MM.swarming];
  run(s, fx("reveal"));
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === MM.swarming).length, 3);
  assert.deepEqual(s.encounterDiscard, [MM.foul]);
  // Shadow: a Goblin attacker brings Swarming Goblins engaged with you.
  for (const [code, joins] of [
    [MM.sneak, true],
    [MM.werewolf, false],
  ] as const) {
    s = base();
    const enemy = engaged(s, code);
    enemy.shadows = [MM.swarming];
    s.encounterDeck = [];
    s = defend(s, enemy, s.heroes[0]);
    s = settle(s);
    assert.equal(
      s.engaged.some((u) => u.code === MM.swarming),
      joins,
    );
  }
  // Goblin Tunnels: Goblins get +1 attack; explored, a cheap Goblin.
  s = base();
  stage(s, MM.tunnels);
  const sneak = engaged(s, MM.sneak);
  const wolf = engaged(s, MM.werewolf);
  assert.equal(stats(s, sneak).attack, 3 + 1);
  assert.equal(stats(s, wolf).attack, 4);
  s = base();
  activate(s, MM.tunnels);
  s.encounterDeck = [MM.forge, MM.sneak];
  s.encounterDiscard = [MM.warlord, MM.follower];
  progress(s, 6);
  flush(s);
  assert.match(
    s.choice!.title,
    /^Goblin Tunnels · The opposing team adds a Goblin enemy with cost 1 or less/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => card(o.code!).name),
    ["Goblin Follower", "Goblin Sneak"],
  );
  s = settle(s);
  // Massing in the Deep: each engaged enemy attacks, else surge.
  s = base();
  engaged(s, MM.sneak);
  engaged(s, MM.werewolf);
  reveal(s, MM.massing);
  assert.ok(
    logged(s, /Massing in the Deep: each engaged enemy makes an attack/),
  );
  s = settle(s);
  s = base();
  s.encounterDeck = [MM.massing, MM.forge];
  run(s, fx("reveal"));
  s = settle(s);
  assert.ok(
    logged(s, /Massing in the Deep: no enemy is engaged; it gains surge/),
  );
  // Shadow: each enemy engaged with the defending player gets +1 attack this phase.
  s = base();
  const g = engaged(s, MM.sneak);
  const other = engaged(s, MM.werewolf);
  g.shadows = [MM.massing];
  s.encounterDeck = [];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(stats(s, get(s, other.id)!).attack, 4 + 1);
  s.phase = "refresh";
  assert.equal(stats(s, get(s, other.id)!).attack, 4);
  void atQuest;
  reload(s);
});
