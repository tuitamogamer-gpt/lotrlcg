import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS } from "../src/game/cards";
import { damage, engage, revealed } from "../src/game/board";
import { flush } from "../src/game/effects";
import { make, prepend, stats, threatOf } from "../src/game/core";
import {
  applyAction,
  createGame,
  restoreSave,
  validateSave,
} from "../src/game/engine";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import {
  ERED,
  ERED_CAMPAIGN_ORDER,
  newEredCampaign,
} from "../src/game/ered-campaign";
import {
  ERED_POOL_HOOKS,
  ERED_POOL_PORTABLE,
  eredForeign,
  eredPoolLive,
} from "../src/game/ered-campaign-pool";
import { WILDS_RHOVANION as W } from "../src/game/wilds-rhovanion-support";
import { WITHERED_HEATH as H } from "../src/game/withered-heath-support";
import { ROAM_RHOVANION as R } from "../src/game/roam-rhovanion-support";
import { FIRE_NIGHT as F } from "../src/game/fire-night-support";
import { syncAttachmentText } from "../src/game/attachment-text";
import { seatView } from "../src/game/table";
import type { GameState, ScenarioId, Unit } from "../src/game/types";

const d = STARTERS[0];
const LATER: ScenarioId[] = [
  "the-withered-heath",
  "roam-across-rhovanion",
  "fire-in-the-night",
  "the-ghost-of-framsburg",
  "mount-gundabad",
  "the-fate-of-wilderland",
];
const reload = (s: GameState) => restoreSave(JSON.parse(JSON.stringify(s)))!;
const choose = (s: GameState, id: string) =>
  applyAction(reload(s), { type: "CHOOSE", id });
const valid = (s: GameState) => validateSave(JSON.parse(JSON.stringify(s)));
function calm(s: GameState, phase: GameState["phase"] = "planning") {
  Object.assign(s, { phase, choice: null, queue: [] });
  if (s.flow) s.flow.pending = null;
  return s;
}
/**
 * A game of a later Ered Mithrin scenario in the campaign, after the chapters
 * before it: its encounter deck is its own, and the Campaign Pool's foreign
 * cards are added by each test.
 */
function chapter(id: ScenarioId, seed = 5) {
  let s = createGame(seed, d.cards, d.heroes, d.id, { scenarioId: id });
  const c = newEredCampaign(d.heroes);
  c.completed = ERED_CAMPAIGN_ORDER.slice(
    0,
    ERED_CAMPAIGN_ORDER.indexOf(id),
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 5 }));
  s.campaign = c;
  s.playMode = "campaign";
  for (let i = 0; i < 160; i++) {
    if (s.choice) s = choose(s, s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  return calm(s);
}
/** A foreign encounter card revealed from the encounter deck (its choices answered by `pick`). */
function reveal(
  s: GameState,
  code: string,
  pick: (s: GameState) => string | undefined = () => undefined,
) {
  revealed(s, code);
  flush(s);
  for (let i = 0; i < 40 && s.choice; i++)
    s = choose(s, pick(s) ?? s.choice!.options[0].id);
  return s;
}
const unit = (s: GameState, code: string) =>
  [
    ...s.staging,
    ...s.engaged,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].find((u) => u.code === code)!;
/** An attack against the first hero, with the given shadow card's effect resolved. */
function shadow(s: GameState, enemy: Unit, code: string, defender?: Unit) {
  s.combat = {
    enemyId: enemy.id,
    defenderId: defender?.id,
    defenderIds: defender ? [defender.id] : [],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  enemy.shadows = [code];
  enemy.revealedShadowCount = 1;
  return batch4Scenario(s).shadow!(s, code);
}

test("Ered Mithrin Campaign Pool: the 60 cards of the first five chapters are foreign wherever the later chapters' own modules do not script them", () => {
  assert.equal(ERED_POOL_PORTABLE.length, 60);
  assert.equal(new Set(ERED_POOL_PORTABLE).size, 60);
  const counts = LATER.map((id) => {
    const s = chapter(id);
    assert.ok(eredPoolLive(s));
    return ERED_POOL_PORTABLE.filter((c) => eredForeign(s, c)).length;
  });
  assert.deepEqual(counts, [39, 43, 54, 55, 45, 53]);
  // Every card is foreign in at least one later chapter.
  const heath = chapter("the-withered-heath"),
    roam = chapter("roam-across-rhovanion");
  for (const code of ERED_POOL_PORTABLE)
    assert.ok(
      LATER.some((id) => eredForeign({ ...heath, scenarioId: id }, code)),
      card(code).name,
    );
  // Lost Caves cards are The Withered Heath's own; Fell Beasts are Roam's.
  assert.equal(eredForeign(heath, W.armory), false);
  assert.equal(eredForeign(roam, W.armory), true);
  assert.equal(eredForeign(roam, W.troll), false);
  assert.equal(eredForeign(heath, W.troll), true);
  // The Withered Heath's own cards are foreign from Roam Across Rhovanion on.
  assert.equal(eredForeign(heath, H.troll), false);
  assert.equal(eredForeign(roam, H.troll), true);
  // Roam Across Rhovanion's own cards are foreign from Fire in the Night on.
  const fire = chapter("fire-in-the-night");
  assert.equal(eredForeign(roam, R.giant), false);
  assert.equal(eredForeign(fire, R.giant), true);
  // Outside the campaign the layer does nothing.
  const normal = createGame(5, d.cards, d.heroes, d.id, {
    scenarioId: "the-withered-heath",
  });
  assert.equal(eredPoolLive(normal), false);
  assert.equal(eredForeign(normal, W.crossing), false);
});

test("Ered Mithrin Campaign Pool: each foreign card revealed in each later chapter resolves and leaves a valid save", () => {
  for (const id of LATER) {
    const base = chapter(id);
    assert.ok(valid(base), id);
    for (const code of ERED_POOL_PORTABLE.filter((c) => eredForeign(base, c))) {
      const s = reveal(calm(structuredClone(base), "staging"), code);
      assert.ok(valid(s), `${id}: ${card(code).name}`);
      const t = card(code).type_code;
      if (t === "treachery")
        assert.ok(
          s.encounterDiscard.includes(code) ||
            // Sneaking Off removes itself from the game.
            s.removed.includes(code) ||
            // Wild Creatures can discard the whole encounter deck looking
            // for a Creature enemy; the empty deck is then refilled from
            // the discard pile.
            s.encounterDeck.includes(code) ||
            [...s.heroes, ...s.allies, ...s.staging, ...s.engaged].some((u) =>
              u.attachments.some((a) => a.code === code),
            ) ||
            s.hand.some((u) => u.code === code) ||
            !!s.choice,
          `${id}: ${card(code).name} resolved`,
        );
      else
        assert.ok(
          [...s.staging, ...s.engaged].some((u) => u.code === code),
          `${id}: ${card(code).name} in play`,
        );
    }
  }
});

test("Ered Mithrin Campaign Pool: Dangerous Crossing, Swarm of Bats, Vastness of Mirkwood and Denizen of the Deep resolve and surge as printed", () => {
  // Dangerous Crossing: each player assigns X damage, X the active
  // location's threat; under 3 it surges.
  let s = chapter("the-withered-heath");
  s.activeLocation = make(s, W.contested); // 1 threat
  const deck = s.encounterDeck.length;
  s = reveal(calm(s, "staging"), W.crossing);
  assert.equal(
    s.heroes.reduce((n, h) => n + h.damage, 0),
    1,
  );
  // It surged: another encounter card was revealed.
  assert.ok(s.encounterDeck.length < deck);
  assert.ok(s.encounterDiscard.includes(W.crossing));
  // Swarm of Bats: each player discards their heroes' resources and raises
  // their threat by that much (surging when none are discarded).
  const t = chapter("the-withered-heath");
  for (const h of t.heroes) h.resources = 2;
  const before = t.threat;
  const swarm = reveal(calm(t, "staging"), W.swarm);
  assert.equal(swarm.threat, before + 6);
  assert.ok(swarm.heroes.every((h) => h.resources === 0));
  // Vastness of Mirkwood: until the end of the phase, each non-objective
  // location in the staging area gets +1 threat (+2 with progress).
  const v = calm(chapter("the-withered-heath"), "staging");
  const plain = make(v, W.contested);
  const worn = make(v, W.mine);
  worn.progress = 1;
  v.staging.push(plain, worn);
  const [a, b] = [threatOf(v, plain), threatOf(v, worn)];
  const vast = reveal(v, W.vastness);
  assert.equal(threatOf(vast, unit(vast, W.contested)), a + 1);
  assert.equal(threatOf(vast, unit(vast, W.mine)), b + 2);
  // Denizen of the Deep: the highest attack enemy in the staging area attacks
  // the first player.
  const w = calm(chapter("the-withered-heath"), "staging");
  w.staging = w.staging.filter((u) => card(u.code).type_code !== "enemy");
  const troll = make(w, W.troll);
  w.staging.push(troll);
  revealed(w, W.denizen);
  flush(w);
  assert.ok(
    w.log.some((l) => /Stone-troll/.test(l.text)) ||
      w.queue.some((e) => e.kind === "immediateAttack") ||
      !!w.combat ||
      !!w.choice,
  );
});

test("Ered Mithrin Campaign Pool: Frenzied Creature finds no Evil Creatures deck, but as a shadow it attaches to the attacker, giving +1 threat, attack and defense and immunity", () => {
  const s = reveal(calm(chapter("the-withered-heath"), "staging"), W.frenzied);
  assert.ok(s.encounterDiscard.includes(W.frenzied));
  assert.ok(s.log.some((l) => /no Evil Creatures deck/.test(l.text)));
  const t = calm(chapter("the-withered-heath"), "defense");
  const enemy = make(t, W.troll);
  t.engaged.push(enemy);
  const before = { ...stats(t, enemy), threat: threatOf(t, enemy) };
  assert.ok(shadow(t, enemy, W.frenzied, t.heroes[0]));
  assert.ok(enemy.attachments.some((a) => a.code === W.frenzied));
  assert.equal(stats(t, enemy).attack, before.attack + 1);
  assert.equal(stats(t, enemy).defense, before.defense + 1);
  assert.equal(threatOf(t, enemy), before.threat + 1);
  syncAttachmentText(t);
  assert.equal(enemy.immuneToPlayerEffects, true);
  assert.ok(valid(t));
});

test("Ered Mithrin Campaign Pool: Goblin Troop, Stray Goblin, Pack of Wargs, Stone-troll and Ravenous Spider keep their printed abilities", () => {
  const s = calm(chapter("the-withered-heath"));
  // Goblin Troop: no player card attachments; other Goblins engaged with
  // its player get +1 attack and +1 defense.
  const troop = make(s, W.troop);
  const stray = make(s, W.stray);
  s.engaged.push(troop, stray);
  const base = stats(s, make(s, W.stray));
  assert.equal(stats(s, stray).attack, base.attack + 1);
  assert.equal(stats(s, stray).defense, base.defense + 1);
  assert.equal(batch4Scenario(s).cannotAttach!(s, troop, "01069"), true);
  // Stray Goblin cannot be optionally engaged, and engages a player who
  // engages another enemy.
  const t = calm(chapter("the-withered-heath"), "encounter");
  t.staging = [];
  const goblin = make(t, W.stray),
    other = make(t, W.troll);
  t.staging.push(goblin, other);
  assert.equal(batch4Scenario(t).cannotOptionallyEngage!(t, goblin), true);
  engage(t, other);
  flush(t);
  assert.ok(
    t.engaged.some((u) => u.id === goblin.id),
    "Stray Goblin engages",
  );
  // Ravenous Spider makes an immediate attack after it engages you.
  const r = calm(chapter("the-withered-heath"), "encounter");
  const spider = make(r, W.spider);
  r.staging.push(spider);
  engage(r, spider);
  assert.ok(
    r.queue.some((e) => e.kind === "immediateAttack" && e.target === spider.id),
  );
  // Pack of Wargs: a shadow card with no effect gives it an additional attack;
  // its shadow returns the attacker to the staging area.
  const u = calm(chapter("the-withered-heath"), "defense");
  const wargs = make(u, W.wargs);
  u.engaged.push(wargs);
  u.combat = { enemyId: wargs.id, attackBonus: 0, attackPlayer: 0 } as never;
  batch4Scenario(u).shadowResolved!(u, wargs, W.mine); // no shadow effect
  const extra = batch4Scenario(u).attackFinished!(u, u.combat!, false);
  assert.ok(
    extra.some((e) => e.kind === "immediateAttack" && e.target === wargs.id),
  );
  assert.ok(shadow(u, wargs, W.wargs, u.heroes[0]));
  assert.equal(u.combat!.returnToStaging, true);
  // Stone-troll: no player card attachments; its shadow discards an
  // attachment you control.
  const v = calm(chapter("the-withered-heath"), "defense");
  const troll = make(v, W.troll);
  v.engaged.push(troll);
  assert.equal(batch4Scenario(v).cannotAttach!(v, troll, "01069"), true);
  assert.ok(shadow(v, troll, W.troll, v.heroes[0]));
  assert.ok(v.queue.some((e) => e.kind === "eredPoolDiscardAttachment"));
});

test("Ered Mithrin Campaign Pool: Hobgoblin guards the first player's top card, gets +X from its cost, and returns it to hand when it leaves play", () => {
  let s = calm(chapter("the-withered-heath"), "staging");
  s.deck.unshift("01069"); // Forest Snare (cost 3)
  const top = s.deck[0];
  s = reveal(s, W.hobgoblin);
  const hob = unit(s, W.hobgoblin);
  const g = s.eredPool!.guarded.find((g) => g.guardId === hob.id)!;
  assert.equal(g.card.code, top);
  const x = Number(card(top).cost) || 0;
  assert.equal(stats(s, hob).attack, 1 + x);
  assert.equal(threatOf(s, hob), 1 + x);
  assert.ok(valid(s));
  // It leaves play: the card returns to its owner's hand.
  const hand = s.hand.length;
  batch4Scenario(s).hostLeaves!(s, hob, true);
  assert.equal(s.hand.length, hand + 1);
  assert.equal(s.eredPool!.guarded.length, 0);
});

test("Ered Mithrin Campaign Pool: Werewolf, Giant Spider and Black Bats fight as printed in Roam Across Rhovanion", () => {
  const s = calm(chapter("roam-across-rhovanion"), "defense");
  // Werewolf gets +1 attack for each damage on it; a shadow card with no
  // effect deals 1 damage to it and the defender.
  const wolf = make(s, W.werewolf);
  s.engaged.push(wolf);
  const base = stats(s, wolf).attack;
  wolf.damage = 2;
  assert.equal(stats(s, wolf).attack, base + 2);
  s.combat = {
    enemyId: wolf.id,
    defenderId: s.heroes[0].id,
    defenderIds: [s.heroes[0].id],
    attackBonus: 0,
    attackPlayer: 0,
  } as never;
  batch4Scenario(s).shadowResolved!(s, wolf, W.mine); // no shadow effect
  flush(s);
  assert.equal(wolf.damage, 3);
  assert.equal(s.heroes[0].damage, 1);
  // Giant Spider: a character it damages cannot ready this round.
  const t = calm(chapter("roam-across-rhovanion"), "defense");
  const spider = make(t, W.giantSpider);
  t.engaged.push(spider);
  damage(t, t.heroes[1].id, 1, { enemyId: spider.id, combatDamage: true });
  flush(t);
  assert.equal(batch4Scenario(t).cannotReady!(t, t.heroes[1]), true);
  // Black Bats cannot take damage while the active location is Dark.
  const u = calm(chapter("roam-across-rhovanion"), "attack");
  const bats = make(u, W.blackBats);
  u.engaged.push(bats);
  u.activeLocation = make(u, W.tunnel); // Underground. Dark.
  assert.equal(batch4Scenario(u).damageAmount!(u, bats, 2, {} as never), 0);
  u.activeLocation = make(u, W.mine); // Underground
  assert.equal(batch4Scenario(u).damageAmount!(u, bats, 2, {} as never), 2);
});

test("Ered Mithrin Campaign Pool: Lonely Lands keeps events played during the quest phase facedown under it until it leaves play", () => {
  const s = calm(chapter("the-withered-heath"), "quest");
  const lands = make(s, W.lonely);
  s.staging.push(lands);
  const base = threatOf(s, lands);
  const event = make(s, "01023"); // an event card from the starter deck
  event.owner = 0;
  s.resolvingEvents = [
    { unit: event, player: 0, destination: "discard" },
  ] as never;
  batch4Scenario(s).eventPlayed!(s, event);
  flush(s);
  if (s.choice) {
    const t = choose(s, lands.id);
    Object.assign(s, t);
  }
  assert.equal(s.eredPool!.stored.length, 1);
  assert.equal(threatOf(s, unit(s, W.lonely)), base + 2);
  // Explored, it releases the event to its owner's discard pile.
  const discard = s.discard.length;
  batch4Scenario(s).explored!(s, unit(s, W.lonely), false);
  assert.equal(s.eredPool!.stored.length, 0);
  assert.equal(s.discard.length, discard + 1);
});

test("Ered Mithrin Campaign Pool: Lost in the Wild, Weighed Down and Ruined Supplies resolve in Fire in the Night", () => {
  // Lost in the Wild joins the hand of the player with the most cards; it
  // cannot be discarded by player card effects, and playing a card discards
  // the hand.
  let s = calm(chapter("fire-in-the-night"), "staging");
  s = reveal(s, W.lostWild);
  const lost = s.hand.find((u) => u.code === W.lostWild)!;
  assert.ok(lost);
  assert.equal(batch4Scenario(s).cannotDiscardHand!(s, lost, true), true);
  assert.ok(valid(s));
  batch4Scenario(s).playerCardPlayed!(s, s.hand[0]);
  flush(s);
  assert.equal(s.hand.length, 0);
  assert.ok(s.encounterDiscard.includes(W.lostWild));
  // Weighed Down attaches to the hero with the most attachments and exhausts
  // it; when that hero readies, it discards an attachment.
  let t = calm(chapter("fire-in-the-night"), "staging");
  const hero = t.heroes[1];
  hero.attachments.push({
    id: `a${t.nextId++}`,
    code: "01069",
    exhausted: false,
  });
  t = reveal(t, W.weighed);
  const weighed = t.heroes[1];
  assert.ok(weighed.attachments.some((a) => a.code === W.weighed));
  assert.equal(weighed.exhausted, true);
  batch4Scenario(t).characterReadied!(t, weighed);
  flush(t);
  assert.match(t.choice!.title, /Weighed Down · Discard an attachment/);
  // Ruined Supplies: each player chooses threat per ally or 1 damage to each ally.
  const u = calm(chapter("fire-in-the-night"), "staging");
  revealed(u, W.supplies);
  flush(u);
  assert.match(u.choice!.title, /Ruined Supplies · Choose one|Doomed/);
});

test("Ered Mithrin Campaign Pool: Twilight Hall, Accursed Forest and Dark Black Woods keep their travel rules", () => {
  const s = calm(chapter("the-withered-heath"), "travel");
  const hall = make(s, W.twilight);
  s.staging.push(hall);
  // No resources: the players cannot travel there.
  assert.match(
    batch4Scenario(s).travelProblem!(s, hall) ?? "",
    /Twilight Hall needs at least 1 resource/,
  );
  // A Forest location explored places a resource here (+2 threat each).
  const base = threatOf(s, hall);
  const woods = make(s, W.darkWoods); // Forest. Dark.
  batch4Scenario(s).explored!(s, woods, false);
  assert.equal(hall.resources, 1);
  assert.equal(threatOf(s, hall), base + 2);
  assert.equal(batch4Scenario(s).travelProblem!(s, hall), null);
  // Travel: each player raises their threat by 1 for each resource.
  assert.deepEqual(
    batch4Scenario(s).travelEffects!(s, hall)!.map((e) => [e.kind, e.value]),
    [["threat", 1]],
  );
  // Accursed Forest: 'when revealed' effects cannot be canceled while it is
  // in the staging area; Travel: reveal an encounter card.
  const forest = make(s, W.accursed);
  s.staging.push(forest);
  assert.equal(batch4Scenario(s).cannotCancel!(s, false), true);
  assert.equal(batch4Scenario(s).travelEffects!(s, forest)![0].kind, "reveal");
  // Dark Black Woods: at most 1 progress on each Forest location in the
  // staging area each round.
  const t = calm(chapter("the-withered-heath"), "quest");
  const dark = make(t, W.darkWoods),
    forest2 = make(t, W.accursed);
  t.staging.push(dark, forest2);
  assert.equal(batch4Scenario(t).locationProgressAmount!(t, forest2, 3), 1);
  assert.equal(batch4Scenario(t).locationProgressAmount!(t, forest2, 3), 0);
});

test("Ered Mithrin Campaign Pool: Unseen Danger, Gathering Gloom and Eyes in the Dark give each player their printed choice", () => {
  const s = calm(chapter("the-withered-heath"), "quest");
  for (const h of s.heroes) h.committed = true;
  s.committedIds = s.heroes.map((h) => h.id);
  revealed(s, W.unseen);
  flush(s);
  assert.match(
    s.choice!.title,
    /Unseen Danger · Remove a character from the quest/,
  );
  const removed = s.choice!.options[0].id;
  const t = choose(s, removed);
  assert.equal(
    t.heroes.find((h) => h.id === removed)?.committed ?? false,
    false,
  );
  // Gathering Gloom (doomed 1): threat per ally or reveal an encounter card.
  const u = calm(chapter("the-withered-heath"), "staging");
  revealed(u, W.gloom);
  flush(u);
  for (
    let i = 0;
    i < 5 && u.choice && !/Gathering Gloom/.test(u.choice.title);
    i++
  )
    Object.assign(u, choose(u, u.choice.options[0].id));
  assert.match(u.choice!.title, /Gathering Gloom · Choose one/);
  // Eyes in the Dark: threat per questing character or discard one.
  const v = calm(chapter("the-withered-heath"), "quest");
  v.heroes[0].committed = true;
  revealed(v, W.eyes);
  flush(v);
  for (
    let i = 0;
    i < 5 && v.choice && !/Eyes in the Dark/.test(v.choice.title);
    i++
  )
    Object.assign(v, choose(v, v.choice.options[0].id));
  assert.match(v.choice!.title, /Eyes in the Dark · Choose one/);
});

test("Ered Mithrin Campaign Pool: Deep Chasm, Dark Tunnel, Forked Passage and Contested Depths use The Withered Heath's Caves deck", () => {
  const s = calm(chapter("the-withered-heath"), "travel");
  const caves = s.witheredHeath!.cavesDeck;
  assert.ok(caves.length >= 2);
  // Deep Chasm: the players must travel there with no active location.
  s.activeLocation = null;
  const chasm = make(s, W.chasm),
    other = make(s, W.mine);
  s.staging.push(chasm, other);
  assert.equal(batch4Scenario(s).mustTravel!(s), true);
  assert.match(
    batch4Scenario(s).travelProblem!(s, other) ?? "",
    /must travel to Deep Chasm/,
  );
  // Deep: traveling there replaces it with the top card of the Caves deck.
  const next = caves[0];
  s.staging = s.staging.filter((u) => u.id !== chasm.id);
  s.activeLocation = chasm;
  batch4Scenario(s).travelEntered!(s, chasm, true);
  flush(s);
  assert.notEqual(s.activeLocation?.id, chasm.id);
  assert.ok(
    s.activeLocation?.id === next.id ||
      s.witheredHeath!.guards.some((g) => g.sign.id === next.id),
  );
  // Dark Tunnel: no progress on Dark locations in the staging area.
  const t = calm(chapter("the-withered-heath"), "quest");
  const tunnel = make(t, W.tunnel),
    dark = make(t, W.chasm);
  t.staging.push(tunnel, dark);
  assert.equal(batch4Scenario(t).locationProgressAmount!(t, dark, 2), 0);
  // Forked Passage: raise threat by 2 to order the top 2 Caves cards; it
  // goes to the victory display and the next cave becomes active.
  let u = calm(chapter("the-withered-heath"), "travel");
  const fork = make(u, W.fork);
  u.activeLocation = fork;
  const threat = u.threat;
  batch4Scenario(u).travelEntered!(u, fork, true);
  flush(u);
  assert.match(u.choice!.title, /Forked Passage · Look at the Caves deck/);
  u = choose(u, "use");
  if (u.choice && /Caves deck · Choose/.test(u.choice.title))
    u = choose(u, u.choice.options[1].id);
  for (let i = 0; i < 5 && u.choice; i++) u = choose(u, u.choice.options[0].id);
  assert.equal(u.threat, threat + 2);
  assert.ok(u.victoryCards!.includes(W.fork));
  assert.ok(valid(u));
  // Contested Depths: raise threat by the victory display's locations, or
  // replace it with the next cave.
  const v = calm(chapter("the-withered-heath"), "travel");
  const depths = make(v, W.contested);
  v.activeLocation = depths;
  batch4Scenario(v).travelEntered!(v, depths, true);
  flush(v);
  assert.deepEqual(
    v.choice!.options.map((o) => o.id),
    ["threat", "replace"],
  );
  // Without a Caves deck (Roam Across Rhovanion), only the threat remains.
  const w = calm(chapter("roam-across-rhovanion"), "travel");
  const depths2 = make(w, W.contested);
  w.activeLocation = depths2;
  batch4Scenario(w).travelEntered!(w, depths2, true);
  flush(w);
  assert.deepEqual(
    w.choice!.options.map((o) => o.id),
    ["threat"],
  );
});

test("Ered Mithrin Campaign Pool: Afraid of the Dark, Dark Places and the Dragon Might conditions follow their printed text", () => {
  // Afraid of the Dark: attached to a questing hero, removed from the quest;
  // while the active location is Dark, its willpower is 0 and its text blank.
  let s = calm(chapter("the-withered-heath"), "quest");
  s.heroes[0].committed = true;
  s.committedIds = [s.heroes[0].id];
  s = reveal(s, W.afraid);
  const hero = s.heroes[0];
  assert.ok(hero.attachments.some((a) => a.code === W.afraid));
  assert.equal(hero.committed, false);
  s.activeLocation = make(s, W.tunnel);
  assert.equal(stats(s, hero).will, 0);
  assert.equal(batch4Scenario(s).characterBlanked!(s, hero), true);
  // Dark Places: the active location's threat is added to the staging area
  // this phase.
  const t = calm(chapter("the-withered-heath"), "staging");
  t.activeLocation = make(t, W.mine);
  const before = batch4Scenario(t).stagingThreat!(t);
  reveal(t, W.darkPlaces);
  assert.equal(
    batch4Scenario(t).stagingThreat!(t),
    before + threatOf(t, t.activeLocation!),
  );
  // Dragon Breath and Dragon Scales attach to a Dragon enemy.
  let u = calm(chapter("the-withered-heath"), "staging");
  const dragon = make(u, ERED.spawn);
  u.staging.push(dragon);
  u = reveal(u, W.scales);
  const d1 = unit(u, ERED.spawn);
  assert.ok(d1.attachments.some((a) => a.code === W.scales));
  // Scales cancel all of the next damage, then leave.
  assert.equal(batch4Scenario(u).damageAmount!(u, d1, 4, {} as never), 0);
  assert.ok(!d1.attachments.some((a) => a.code === W.scales));
  u = reveal(calm(u, "staging"), W.breath);
  const d2 = unit(u, ERED.spawn);
  assert.ok(d2.attachments.some((a) => a.code === W.breath));
  // Breath: when the Dragon attacks you, 1 damage to each of your characters.
  batch4Scenario(u).enemyAttackStarted!(u, d2, 0);
  flush(u);
  assert.ok(u.heroes.every((h) => h.damage >= 1));
});

test("Ered Mithrin Campaign Pool: the Lost Caves locations resolve as the active location in Roam Across Rhovanion", () => {
  // Crumbling Cavern: each player assigns X damage, X their characters.
  let s = calm(chapter("roam-across-rhovanion"), "travel");
  const cavern = make(s, W.cavern);
  s.activeLocation = cavern;
  batch4Scenario(s).travelEntered!(s, cavern, true);
  flush(s);
  for (let i = 0; i < 10 && s.choice; i++)
    s = choose(s, s.choice.options[0].id);
  const characters = s.heroes.length + s.allies.length;
  assert.equal(
    [...s.heroes, ...s.allies].reduce((n, u) => n + u.damage, 0),
    characters,
  );
  // Lost Armory and Ancient Treasury: once per game for the group.
  let t = calm(chapter("roam-across-rhovanion"), "travel");
  const treasury = make(t, W.treasury);
  t.activeLocation = treasury;
  batch4Scenario(t).travelEntered!(t, treasury, true);
  flush(t);
  assert.match(t.choice!.title, /Ancient Treasury · Use the group response/);
  t = choose(t, "use");
  const threat = t.threat;
  t = choose(t, "threat");
  assert.equal(t.threat, threat - 3);
  assert.deepEqual(t.eredPool!.usedResponses, [W.treasury]);
  batch4Scenario(t).travelEntered!(t, treasury, false);
  flush(t);
  assert.equal(t.choice, null);
  // Underground Lake: X is the most characters; allies entering play exhaust.
  const u = calm(chapter("roam-across-rhovanion"));
  const lake = make(u, W.lake);
  u.staging.push(lake);
  assert.equal(threatOf(u, lake), u.heroes.length + u.allies.length);
  const ally = make(u, "01016");
  batch4Scenario(u).allyEntered!(u, ally, true, true);
  assert.equal(ally.exhausted, true);
  // Lightless Grotto: after commit, discard until a treachery and resolve it.
  const v = calm(chapter("roam-across-rhovanion"), "quest");
  v.staging.push(make(v, W.grotto));
  v.encounterDeck.unshift(W.swarm);
  for (const h of v.heroes) h.resources = 1;
  const before = v.threat;
  batch4Scenario(v).committed!(v);
  flush(v);
  assert.equal(v.threat, before + 3);
  // Frightful Den: discard until X enemies are discarded; add them.
  const w = calm(chapter("roam-across-rhovanion"), "travel");
  const den = make(w, W.den);
  w.activeLocation = den;
  const enemies = w.staging.filter(
    (x) => card(x.code).type_code === "enemy",
  ).length;
  batch4Scenario(w).travelEntered!(w, den, true);
  flush(w);
  assert.equal(
    w.staging.filter((x) => card(x.code).type_code === "enemy").length,
    enemies + 1,
  );
  assert.ok(valid(w));
});

test("Ered Mithrin Campaign Pool: Hills of Wilderland and Iron Hills Mine keep their actions and travel costs", () => {
  let s = calm(chapter("the-withered-heath"), "quest");
  const hills = make(s, W.hills);
  s.staging.push(hills);
  const x = Math.max(s.heroes.length + s.allies.length, 0);
  assert.equal(threatOf(s, hills), x);
  assert.equal(batch4Scenario(s).abilityProblem!(s, hills), null);
  batch4Scenario(s).ability!(s, hills);
  assert.match(s.choice!.title, /Hills of Wilderland · Exhaust a character/);
  s = choose(s, s.heroes[0].id);
  assert.equal(threatOf(s, unit(s, W.hills)), x - 1);
  assert.equal(s.heroes[0].exhausted, true);
  // Iron Hills Mine: each player discards the top 4 cards of their deck to
  // travel there; explored while active, each player may return a card.
  const t = calm(chapter("the-withered-heath"), "travel");
  const mine = make(t, W.mine);
  const effects = batch4Scenario(t).travelEffects!(t, mine)!;
  const deck = t.deck.length;
  prepend(t, ...effects);
  flush(t);
  assert.equal(t.deck.length, deck - 4);
  t.activeLocation = mine;
  batch4Scenario(t).explored!(t, mine, true);
  flush(t);
  assert.match(t.choice!.title, /Iron Hills Mine · Return a card/);
  assert.ok(valid(t));
});

test("Ered Mithrin Campaign Pool: the foreign cards' shadow effects resolve in a later chapter", () => {
  const s = calm(chapter("the-withered-heath"), "defense");
  const enemy = make(s, W.troll);
  s.engaged.push(enemy);
  const hero = s.heroes[0];
  hero.damage = 1;
  assert.ok(shadow(s, enemy, W.crossing, hero));
  assert.equal(s.combat!.attackBonus, 2);
  assert.ok(shadow(s, enemy, W.troop, hero));
  assert.equal(s.combat!.attackBonus, 2);
  assert.ok(shadow(s, enemy, W.spider, hero));
  assert.equal(s.combat!.extraAttacks, 1);
  assert.ok(shadow(s, enemy, W.giantSpider, hero));
  assert.equal(batch4Scenario(s).cannotReady!(s, hero), true);
  assert.ok(shadow(s, enemy, W.stray, hero));
  assert.ok(s.staging.some((u) => u.code === W.stray));
  assert.ok(shadow(s, enemy, W.riverbank, hero));
  flush(s);
  assert.equal(hero.damage, 2);
  // A native card's shadow is left to the chapter's own module.
  assert.equal(ERED_POOL_HOOKS.shadow!(s, W.armory), false);
});

test("Ered Mithrin Campaign Pool: a Lightless Grotto or Grey Moorland that discards a Campaign Pool treachery from another scenario resolves it through the ordinary scripts", () => {
  // The Withered Heath's own Lightless Grotto, with a Core Set treachery
  // (Eyes of the Forest, from Lost in Mirkwood's resolution) on top.
  for (const id of ["the-withered-heath", "mount-gundabad"] as ScenarioId[]) {
    const s = calm(chapter(id), "quest");
    s.staging.push(make(s, W.grotto));
    s.encounterDeck.unshift("01079");
    const discards = s.encounterDiscard.filter((c) => c === "01079").length;
    assert.doesNotThrow(() => {
      batch4Scenario(s).committed!(s);
      flush(s);
    }, id);
    assert.equal(
      s.encounterDiscard.filter((c) => c === "01079").length,
      discards + 1,
      id,
    );
    assert.ok(valid(s), id);
  }
  // The pool's own Lightless Grotto in Roam Across Rhovanion resolves the
  // Core Set card the same way.
  const r = calm(chapter("roam-across-rhovanion"), "quest");
  r.staging.push(make(r, W.grotto));
  r.encounterDeck.unshift("01079");
  batch4Scenario(r).committed!(r);
  flush(r);
  assert.ok(r.encounterDiscard.includes("01079"));
  assert.ok(valid(r));
});

test("Ered Mithrin Campaign Pool: in a two-player game each player resolves the foreign treacheries in their own seat", () => {
  const seats = [STARTERS[0], STARTERS[1]].map((deck) => ({
    heroes: [...deck.heroes],
    deckId: deck.id,
  }));
  let s = createGame(7, d.cards, d.heroes, d.id, {
    scenarioId: "fire-in-the-night",
    seats,
  });
  const c = newEredCampaign(seats.flatMap((p) => p.heroes));
  c.completed = ERED_CAMPAIGN_ORDER.slice(
    0,
    ERED_CAMPAIGN_ORDER.indexOf("fire-in-the-night"),
  ).map((scenarioId) => ({ scenarioId, score: 10, rounds: 5 }));
  s.campaign = c;
  s.playMode = "campaign";
  for (let i = 0; i < 200; i++) {
    if (s.choice) s = choose(s, s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else if (s.phase === "setup") s = applyAction(reload(s), { type: "KEEP" });
    else break;
  }
  calm(s, "staging");
  assert.ok(valid(s));
  // Dangerous Crossing: each player assigns X damage among their own
  // characters (X 3, the active location's threat: no surge).
  s.activeLocation = make(s, W.mine); // 4 threat
  const damageOf = (g: GameState, p: number) =>
    seatView(g, p).heroes.reduce((n, h) => n + h.damage, 0);
  const damageBefore = [0, 1].map((p) => damageOf(s, p));
  // Each player spreads the damage over their heroes (none is destroyed).
  const spread = (g: GameState) => {
    if (!/Assign \d+ damage/.test(g.choice!.title)) return undefined;
    const all = [0, 1].flatMap((p) => seatView(g, p).heroes);
    return [...g.choice!.options].sort(
      (a, b) =>
        (all.find((h) => h.id === a.id)?.damage ?? 0) -
        (all.find((h) => h.id === b.id)?.damage ?? 0),
    )[0].id;
  };
  s = reveal(s, W.crossing, spread);
  const after = [0, 1].map((p) => damageOf(s, p));
  assert.deepEqual(
    after.map((n, i) => n - damageBefore[i]),
    [4, 4],
  );
  assert.ok(valid(s));
  // Lost in the Wild joins the hand of a player with the most cards.
  const t = reveal(calm(s, "staging"), W.lostWild);
  const hands = [0, 1].map((p) => seatView(t, p).hand);
  assert.equal(
    hands.filter((h) => h.some((u) => u.code === W.lostWild)).length,
    1,
  );
  assert.ok(valid(t));
});

test("Ered Mithrin Campaign Pool: The Withered Heath's nine cards keep their printed text in Roam Across Rhovanion", () => {
  // Snow-troll: "Cannot have player card attachments. Forced: After
  // Snow-troll attacks and destroys a character, return it to the staging
  // area." Shadow: an additional attack.
  const s = calm(chapter("roam-across-rhovanion"), "defense");
  const troll = make(s, H.troll);
  s.engaged.push(troll);
  assert.equal(batch4Scenario(s).cannotAttach!(s, troll, "01026"), true);
  const hero = s.heroes[0];
  assert.equal(shadow(s, troll, H.troll, hero), true);
  assert.equal((s.combat as never as { extraAttacks: number }).extraAttacks, 1);
  hero.damage = stats(s, hero).health;
  batch4Scenario(s).damageDealt!(s, hero, 1, {
    enemyId: troll.id,
    combatDamage: true,
  } as never);
  assert.equal(s.combat!.returnToStaging, true);
  // Dragon Hatchling: +1 threat and +1 attack for each Dragon Sign in the
  // victory display (none outside The Withered Heath); its shadow adds them
  // to the attacker this phase.
  const t = calm(chapter("roam-across-rhovanion"), "defense");
  const hatch = make(t, H.hatchling);
  t.staging.push(hatch);
  assert.deepEqual([stats(t, hatch).attack, threatOf(t, hatch)], [2, 2]);
  t.victoryCards = [H.sign, H.sign];
  assert.deepEqual([stats(t, hatch).attack, threatOf(t, hatch)], [4, 4]);
  const orc = make(t, W.stray);
  t.engaged.push(orc);
  const [atk, def] = [stats(t, orc).attack, stats(t, orc).defense];
  shadow(t, orc, H.hatchling, t.heroes[0]);
  assert.deepEqual(
    [stats(t, orc).attack, stats(t, orc).defense],
    [atk + 2, def + 2],
  );
  // Mountain Pass: the 'when revealed' effects of Weather treacheries cannot
  // be canceled while it is in the staging area.
  const u = calm(chapter("roam-across-rhovanion"), "staging");
  assert.equal(batch4Scenario(u).cannotCancel!(u, false, H.snow), false);
  u.staging.push(make(u, H.pass));
  assert.equal(batch4Scenario(u).cannotCancel!(u, false, H.snow), true);
  assert.equal(batch4Scenario(u).cannotCancel!(u, false, H.cold), true);
  assert.equal(batch4Scenario(u).cannotCancel!(u, true, H.snow), false);
  assert.equal(batch4Scenario(u).cannotCancel!(u, false, W.supplies), false);
  // Dwarven Door: no progress while it is in the staging area.
  const door = make(u, H.door);
  u.staging.push(door);
  assert.equal(batch4Scenario(u).locationProgressBlocked!(u, door), true);
  u.staging = u.staging.filter((l) => l.id !== door.id);
  u.activeLocation = door;
  assert.equal(batch4Scenario(u).locationProgressBlocked!(u, door), false);
  // Cave Entrance: +1 threat for each Dragon Sign; Travel: each player
  // raises their threat by 1.
  const v = calm(chapter("roam-across-rhovanion"), "travel");
  const entrance = make(v, H.entrance);
  v.staging.push(entrance);
  assert.equal(threatOf(v, entrance), 1);
  v.victoryCards = [H.sign];
  assert.equal(threatOf(v, entrance), 2);
  const threat = v.threat;
  prepend(v, ...batch4Scenario(v).travelEffects!(v, entrance)!);
  flush(v);
  assert.equal(v.threat, threat + 1);
  // Creature Den's Travel: the discard pile is shuffled in, and the first
  // enemy discarded from the top is added to the staging area.
  const w = calm(chapter("roam-across-rhovanion"), "travel");
  w.staging = w.staging.filter((l) => card(l.code).type_code !== "enemy");
  w.encounterDeck = [W.mine, W.contested];
  w.encounterDiscard = [H.hatchling];
  const den = make(w, H.creatureDen);
  prepend(w, ...batch4Scenario(w).travelEffects!(w, den)!);
  flush(w);
  assert.ok(w.staging.some((e) => e.code === H.hatchling));
  assert.equal(w.encounterDeck.length + w.encounterDiscard.length, 2);
  // High Falls: X is the number of staging locations; its Travel cost
  // assigns X damage among characters in play.
  let x = calm(chapter("roam-across-rhovanion"), "travel");
  x.staging = x.staging.filter((l) => card(l.code).type_code !== "location");
  const falls = make(x, H.falls);
  x.staging.push(falls, make(x, W.mine), make(x, W.contested));
  assert.equal(threatOf(x, falls), 3);
  assert.equal(batch4Scenario(x).travelProblem!(x, falls), null);
  prepend(x, ...batch4Scenario(x).travelEffects!(x, falls)!);
  flush(x);
  for (let i = 0; i < 3 && x.choice; i++)
    x = choose(x, x.choice!.options[0].id);
  assert.equal(
    [...x.heroes, ...x.allies].reduce((n, c) => n + c.damage, 0),
    3,
  );
  assert.ok(valid(x));
});

test("Ered Mithrin Campaign Pool: Heavy Snow and Deadly Cold resolve as Weather treacheries in Roam Across Rhovanion", () => {
  // Heavy Snow: "Doomed 1. When Revealed: Exhaust a character. Until the end
  // of the round, characters cannot be readied by player card effects."
  const base = chapter("roam-across-rhovanion");
  const before = base.threat;
  const s = reveal(calm(structuredClone(base), "staging"), H.snow);
  assert.equal(s.threat, before + 1);
  assert.equal([...s.heroes, ...s.allies].filter((c) => c.exhausted).length, 1);
  assert.equal(batch4Scenario(s).cannotPlayerReady!(s), true);
  assert.ok(s.encounterDiscard.includes(H.snow));
  assert.ok(valid(s));
  // Its shadow: exhaust a character you control.
  const t = calm(structuredClone(base), "defense");
  const orc = make(t, W.stray);
  t.engaged.push(orc);
  shadow(t, orc, H.snow, t.heroes[0]);
  flush(t);
  let u = t;
  for (let i = 0; i < 3 && u.choice; i++)
    u = choose(u, u.choice!.options[0].id);
  assert.equal([...u.heroes, ...u.allies].filter((c) => c.exhausted).length, 1);
  // Deadly Cold: each player chooses, for each ready character, to exhaust
  // it or deal 1 damage to it.
  let v = calm(structuredClone(base), "staging");
  const ready = [...v.heroes, ...v.allies].filter((c) => !c.exhausted).length;
  v = reveal(v, H.cold, (x) =>
    x.choice?.title.startsWith("Deadly Cold")
      ? x.choice.options.find((o) => o.id === "damage")?.id
      : undefined,
  );
  assert.equal(
    [...v.heroes, ...v.allies].reduce((n, c) => n + c.damage, 0),
    ready,
  );
  assert.ok(valid(v));
  // Its shadow: +1 attack, or +2 if the defending character is damaged.
  const w = calm(structuredClone(base), "defense");
  const enemy = make(w, W.stray);
  w.engaged.push(enemy);
  shadow(w, enemy, H.cold, w.heroes[0]);
  assert.equal(w.combat!.attackBonus, 1);
  w.heroes[1].damage = 1;
  shadow(w, enemy, H.cold, w.heroes[1]);
  assert.equal(w.combat!.attackBonus, 2);
});

test("Ered Mithrin Campaign Pool: Roam Across Rhovanion's enemies keep their printed text in Fire in the Night", () => {
  // Grey Mountain Giant: no non-objective attachments; when it engages you,
  // the top 5 cards of your deck are discarded and you assign 1 damage for
  // each ally among them.
  let s = calm(chapter("fire-in-the-night"), "encounter");
  const giant = make(s, R.giant);
  s.staging.push(giant);
  assert.equal(batch4Scenario(s).cannotAttach!(s, giant, "01026"), true);
  const allies = s.deck.filter((c) => card(c).type_code === "ally");
  const others = s.deck.filter((c) => card(c).type_code !== "ally");
  s.deck = [
    allies[0],
    others[0],
    allies[1],
    others[1],
    others[2],
    ...others.slice(3),
  ];
  const damage = (x: GameState) =>
    [...x.heroes, ...x.allies].reduce((n, c) => n + c.damage, 0);
  const before = damage(s);
  engage(s, giant);
  flush(s);
  for (let i = 0; i < 4 && s.choice; i++)
    s = choose(s, s.choice!.options[0].id);
  assert.equal(damage(s), before + 2);
  assert.ok(valid(s));
  // Hunting Eagle cannot be optionally engaged, engages the first player
  // when the encounter phase begins, and its shadow adds +1 attack (+2 for a
  // Creature).
  const t = calm(chapter("fire-in-the-night"), "encounter");
  const eagle = make(t, R.eagle);
  t.staging.push(eagle);
  assert.equal(batch4Scenario(t).cannotOptionallyEngage!(t, eagle), true);
  batch4Scenario(t).encounterBegin!(t);
  flush(t);
  assert.ok(t.engaged.some((e) => e.id === eagle.id));
  const u = calm(chapter("fire-in-the-night"), "defense");
  const orc = make(u, W.stray);
  u.engaged.push(orc);
  shadow(u, orc, R.eagle, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
  const bear = make(u, R.bear);
  u.engaged.push(bear);
  shadow(u, bear, R.eagle, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 2);
  // Wilderland Bear: the first player chooses its immediate attack or a
  // random discard for each player.
  let v = calm(chapter("fire-in-the-night"), "staging");
  const hand = v.hand.length;
  v = reveal(v, R.bear, (x) =>
    x.choice?.title.startsWith("Wilderland Bear") ? "discard" : undefined,
  );
  assert.equal(v.hand.length, hand - 1);
  assert.ok(v.staging.some((e) => e.code === R.bear));
  assert.ok(valid(v));
});

test("Ered Mithrin Campaign Pool: Roam Across Rhovanion's locations keep their printed text in Fire in the Night", () => {
  // Grey Moorland: after it becomes the active location, the discard pile is
  // shuffled in and the first treachery discarded resolves.
  let s = calm(chapter("fire-in-the-night"), "travel");
  s.encounterDeck = [W.mine, W.contested];
  s.encounterDiscard = [H.cold];
  const moor = make(s, R.moor);
  s.activeLocation = moor;
  batch4Scenario(s).travelEntered!(s, moor, true);
  flush(s);
  const titles: string[] = [];
  for (let i = 0; i < 12 && s.choice; i++) {
    titles.push(s.choice!.title);
    s = choose(s, s.choice!.options[0].id);
  }
  assert.ok(titles.some((t) => t.startsWith("Deadly Cold")));
  assert.ok(s.encounterDiscard.includes(H.cold));
  assert.ok(valid(s));
  // Its shadow returns the attacking enemy to the staging area.
  const t = calm(chapter("fire-in-the-night"), "defense");
  const orc = make(t, W.stray);
  t.engaged.push(orc);
  shadow(t, orc, R.moor, t.heroes[0]);
  assert.equal(t.combat!.returnToStaging, true);
  // Deep Ravine: no more than 1 progress on each staging location each
  // round; its Travel cost raises each player's threat by 2 (no Urdug here).
  const u = calm(chapter("fire-in-the-night"), "quest");
  const ravine = make(u, R.ravine);
  const mine = make(u, W.mine);
  u.staging.push(ravine, mine);
  assert.equal(batch4Scenario(u).locationProgressAmount!(u, mine, 3), 1);
  assert.equal(batch4Scenario(u).locationProgressAmount!(u, mine, 2), 0);
  const threat = u.threat;
  prepend(u, ...batch4Scenario(u).travelEffects!(u, ravine)!);
  flush(u);
  assert.equal(u.threat, threat + 2);
  // Slopes of Ered Mithrin: after the players travel there, the first player
  // may ready a character; its shadow finds no Urdug to exhaust.
  let v = calm(chapter("fire-in-the-night"), "travel");
  v.heroes[0].exhausted = true;
  const slopes = make(v, R.slopes);
  v.activeLocation = slopes;
  batch4Scenario(v).travelEntered!(v, slopes, true);
  flush(v);
  assert.match(v.choice!.title, /^Slopes of Ered Mithrin/);
  v = choose(v, v.heroes[0].id);
  assert.equal(v.heroes[0].exhausted, false);
  const w = calm(chapter("fire-in-the-night"), "defense");
  const enemy = make(w, W.stray);
  w.engaged.push(enemy);
  assert.equal(shadow(w, enemy, R.slopes, w.heroes[0]), true);
  assert.equal(w.combat!.attackBonus, 0);
});

test("Ered Mithrin Campaign Pool: Sneaking Off, Harsh Weather and Wild Creatures resolve in Fire in the Night", () => {
  // Sneaking Off finds no Urdug: +5 threat in the staging area this phase,
  // and it is removed from the game.
  const base = chapter("fire-in-the-night");
  const s = reveal(calm(structuredClone(base), "staging"), R.sneaking);
  assert.equal(batch4Scenario(s).stagingThreat!(s) >= 5, true);
  assert.ok(s.removed.includes(R.sneaking));
  assert.ok(!s.encounterDiscard.includes(R.sneaking));
  assert.ok(valid(s));
  // Harsh Weather: each ready character is exhausted or its player raises
  // their threat by 1.
  let t = calm(structuredClone(base), "staging");
  const ready = [...t.heroes, ...t.allies].filter((c) => !c.exhausted).length;
  const threat = t.threat;
  t = reveal(t, R.weather, (x) =>
    x.choice?.title.startsWith("Harsh Weather") ? "threat" : undefined,
  );
  assert.equal(t.threat, threat + ready);
  // Its shadow: +1 attack, and when the attack destroys a character, the
  // defending player exhausts a character.
  let u = calm(structuredClone(base), "defense");
  const orc = make(u, W.stray);
  u.engaged.push(orc);
  shadow(u, orc, R.weather, u.heroes[0]);
  assert.equal(u.combat!.attackBonus, 1);
  u.heroes = u.heroes.slice(1);
  prepend(u, ...batch4Scenario(u).attackFinished!(u, u.combat!, false));
  flush(u);
  assert.match(u.choice!.title, /^Harsh Weather · Exhaust a character/);
  u = choose(u, u.choice!.options[0].id);
  assert.equal([...u.heroes, ...u.allies].filter((c) => c.exhausted).length, 1);
  // Wild Creatures: each player engages an enemy in the staging area (Dagnir
  // cannot be engaged); a player who cannot brings out a Creature enemy.
  let v = calm(structuredClone(base), "staging");
  const hatch = make(v, H.hatchling);
  v.staging.push(hatch);
  const offered: string[][] = [];
  v = reveal(v, R.creatures, (x) => {
    if (x.choice?.title.startsWith("Wild Creatures"))
      offered.push(x.choice.options.map((o) => o.code!));
    return undefined;
  });
  assert.deepEqual(offered, [[H.hatchling]]);
  assert.ok(v.engaged.some((e) => e.id === hatch.id));
  // Only Dagnir is in the staging area: no one engages, so a Creature enemy
  // is discarded from the encounter deck and added to the staging area.
  let w = calm(structuredClone(base), "staging");
  w.staging = w.staging.filter(
    (e) => card(e.code).type_code !== "enemy" || e.code === F.dagnir,
  );
  assert.ok(w.staging.some((e) => e.code === F.dagnir));
  w.encounterDeck = [W.mine, R.eagle, ...w.encounterDeck];
  w = reveal(w, R.creatures);
  assert.ok(w.staging.some((e) => e.code === R.eagle));
  assert.ok(w.staging.some((e) => e.code === F.dagnir));
  assert.ok(w.encounterDiscard.includes(W.mine));
  assert.ok(valid(w));
});
