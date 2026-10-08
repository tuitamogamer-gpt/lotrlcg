import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, SCRIPTED, imageUrl } from "../src/game/cards";
import {
  fx,
  get,
  make,
  stats,
  engagementCost,
  stageInfo,
  threatOf,
} from "../src/game/core";
import {
  damage,
  check,
  discardCharacter,
  engage,
  placeEncounter,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import {
  addCurrentQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { syncAttachmentText } from "../src/game/attachment-text";
import {
  ETTEN as E,
  ETTEN_ENCOUNTERS,
  ETTEN_QUESTS,
  ETTEN_RECIPES,
  ETTEN_SAFE,
} from "../src/game/ettenmoors-support";
import { CHETWOOD as C } from "../src/game/chetwood-support";
import { WEATHER as W } from "../src/game/weather-hills-support";
import { ettenEndQuest, ettenResourcesSpent } from "../src/game/ettenmoors";
import { base, choose, reload, settle, start } from "./ettenmoors-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finished = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
function target(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) => o.id === id || o.effects.some((e) => e.target === id),
  );
  assert.ok(o, JSON.stringify(s.choice));
  return o.id;
}
function selected(s: GameState, u: Unit) {
  s.phase = "quest";
  sideQuestStart(s);
  flush(s);
  return choose(reload(s), u.id);
}
function accepted(s: GameState) {
  assert.ok(s.choice);
  const o = s.choice.options.find((o) => o.id === "use");
  assert.ok(o, JSON.stringify(s.choice));
  return choose(reload(s), o.id);
}
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Across the Ettenmoors ${easy ? "easy" : "normal"} ${players} players: original setup and serialized guards`, () => {
      const s = start(players, easy);
      assert.equal(s.status, "playing");
      assert.ok(s.ettenmoors?.initialized);
      const safes = s.staging.filter((u) => ETTEN_SAFE.includes(u.code)),
        side = s.staging.find((u) => u.guarding === safes[0]?.id);
      assert.equal(safes.length, 1);
      assert.ok(side);
      assert.equal(card(side.code).type_code, "encounter-side-quest");
      assert.equal(s.staging.filter((u) => u.code === E.spawn).length, players);
      assert.equal(
        s.encounterDeck.filter((code) => code === E.spawn).length,
        4 - players,
      );
      assert.equal(s.encounterDeck.length, (easy ? 32 : 45) - players);
      assert.equal(
        allCharacters(s).find((u) => u.code === E.amarthiul)?.controller,
        firstPlayer(s),
      );
      assert.ok(validateSave(reload(s)));
    });
test("Ettenmoors exact printed definitions and normal/easy recipes reuse shared canonical IDs", () => {
  assert.equal(ETTEN_ENCOUNTERS.length, 17);
  assert.equal(ETTEN_QUESTS.length, 3);
  assert.deepEqual(
    ETTEN_RECIPES.map((r) => r.id),
    ["E05.6", "Q05.6"],
  );
  for (const c of [...ETTEN_ENCOUNTERS, ...ETTEN_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.ok(existsSync(`public${imageUrl(c)}`), c.name);
  }
  for (const code of [
    W.cold,
    W.wind,
    W.blast,
    C.wilderness,
    C.needs,
    C.country,
  ])
    assert.ok(ETTEN_RECIPES.every((r) => r.cards.some((c) => c.code === code)));
  assert.ok(!ETTEN_ENCOUNTERS.some((c) => c.code === W.cold));
  assert.ok(!card(W.cold).text?.includes("Then"));
  for (const code of ETTEN_SAFE) {
    assert.equal(card(code).type_code, "location");
    assert.ok(card(code).objectiveLocation);
    assert.equal(card(code).threat, 0);
    assert.equal(card(code).victory, 5);
  }
});
test("Safe objective-location cannot be travelled to until its physical side-quest guard is defeated", () => {
  let s = base();
  const l = staged(s, E.camp),
    q = staged(s, E.forage);
  q.guarding = l.id;
  s.phase = "travel";
  assert.match(canTravel(s, l)!, /guard/i);
  s = selected(s, q);
  addCurrentQuestProgress(s, 6);
  s = finished(s);
  s.phase = "travel";
  assert.equal(canTravel(s, get(s, l.id)!), null);
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: l.id }));
  assert.equal(s.activeLocation?.id, l.id);
});
test("revealing a Safe location creates one ordinary guard and Troll-fells already guarding it creates no second Safe", () => {
  let s = base();
  s.encounterDeck = [E.fells, E.hoarwell, "01099"];
  revealed(s, E.camp);
  s = finished(s);
  const l = s.staging.find((u) => u.code === E.camp)!,
    f = s.staging.find((u) => u.code === E.fells)!;
  assert.equal(f.guarding, l.id);
  assert.equal(s.staging.filter((u) => ETTEN_SAFE.includes(u.code)).length, 1);
  assert.ok(s.encounterDeck.includes(E.hoarwell));
});
test("Troll-fells search preserves a Safe in staging and its exact guarding location", () => {
  let s = base();
  s.encounterDeck = [E.hoarwell, "01099"];
  revealed(s, E.fells);
  flush(s);
  assert.match(s.choice!.title, /Troll-fells/);
  s = choose(reload(s), s.choice!.options[0].id);
  const l = s.staging.find((u) => u.code === E.hoarwell)!,
    f = s.staging.find((u) => u.code === E.fells)!;
  assert.equal(f.guarding, l.id);
  assert.equal(threatOf(s, l), 0);
  assert.ok(validateSave(reload(s)));
});
test("Safe travel immediately returns every player's engaged enemies, removes No Rest and blanks all encounter side quests", () => {
  let s = base(3);
  const l = staged(s, E.hoarwell);
  const q = staged(s, C.wilderness);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged.push(make(s, E.spawn));
      s.heroes[0].attachments.push({
        id: `rest-${p}`,
        code: E.noRest,
        exhausted: false,
      });
    });
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.equal(allEngaged(s).length, 0);
  assert.equal(s.staging.filter((u) => u.code === E.spawn).length, 3);
  assert.ok(
    allCharacters(s).every((u) =>
      u.attachments.every((a) => a.code !== E.noRest),
    ),
  );
  assert.ok(get(s, q.id)!.blanked);
  s = settle(s);
  assert.ok(validateSave(reload(s)));
});
test("Safe ignores treachery When Revealed while retaining printed Doomed and Surge", () => {
  let s = base();
  s.activeLocation = make(s, E.cave);
  const hp = s.heroes.map((h) => h.damage),
    threat = s.threat;
  revealed(s, W.blast);
  s = finished(s);
  assert.equal(s.threat, threat + 2);
  assert.deepEqual(
    s.heroes.map((h) => h.damage),
    hp,
  );
  s.hand = [make(s, "01057")];
  const q = staged(s, C.wilderness);
  syncAttachmentText(s);
  assert.ok(q.blanked);
  // A reveal of the shared side quest is ignored only through blanking its text.
  placeEncounter(s, C.wilderness, false, 0, undefined, true);
  s = finished(s);
  assert.equal(s.hand.length, 1);
});
test("Safe active is added to victory at quest phase end and side-quest text becomes live again", () => {
  let s = base();
  const l = make(s, E.cave),
    q = staged(s, E.scavenge);
  s.activeLocation = l;
  syncAttachmentText(s);
  assert.ok(q.blanked);
  s.phase = "staging";
  handle(s, fx("finishQuestPhase"));
  s = finished(s);
  assert.equal(s.activeLocation, null);
  assert.ok(s.victoryCards?.includes(E.cave));
  assert.equal(s.victory, 5);
  assert.ok(!get(s, q.id)!.blanked);
});
test("normal location progress explores Safe and keeps its printed Victory 5", () => {
  const s = base();
  const l = staged(s, E.camp);
  progressLocation(s, l, 1);
  assert.ok(!s.staging.some((u) => u.id === l.id));
  assert.ok(s.victoryCards?.includes(E.camp));
  assert.equal(s.victory, 5);
});
test("No Rest prefers globally exhausted heroes, survives saving and stops readying and resource collection", () => {
  let s = base(2);
  forOwner(s, 1, () => {
    s.heroes[0].exhausted = true;
  });
  const h = seatView(s, 1).heroes[0];
  revealed(s, E.noRest);
  flush(s);
  assert.equal(s.choice!.options.length, 1);
  s = choose(reload(s), target(s, h.id));
  const before = get(s, h.id)!.resources;
  handle(s, fx("ready", { target: h.id, player: 1 }));
  handle(s, fx("resourceCollect"));
  assert.ok(get(s, h.id)!.exhausted);
  assert.equal(get(s, h.id)!.resources, before);
  assert.equal(s.encounterDiscard.filter((c) => c === E.noRest).length, 0);
});
test("Patch of Woods travel response grants every hero exactly one resource", () => {
  let s = base(2);
  const l = staged(s, E.woods);
  const resources = allCharacters(s)
    .filter((u) => card(u.code).type_code === "hero")
    .map((h) => [h.id, h.resources] as const);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = accepted(s);
  s = settle(s);
  for (const [id, n] of resources) assert.equal(get(s, id)!.resources, n + 1);
});
test("Secluded Cave optional travel response draws three per living player", () => {
  let s = base(2);
  const l = staged(s, E.cave);
  const before = playerOrder(s).map((p) => seatView(s, p).hand.length);
  s.phase = "travel";
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  s = accepted(s);
  s = settle(s);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).hand.length, before[p] + 3);
});
test("Amarthiúl transfer is optional after engagement and does not follow the first-player token", () => {
  let s = base(2);
  const a = allCharacters(s).find((u) => u.code === E.amarthiul)!;
  const enemy = staged(s, E.goblin);
  forOwner(s, 1, () => engage(s, enemy));
  flush(s);
  assert.match(s.choice!.title, /Amarthiúl/);
  s = choose(reload(s), "skip");
  assert.equal(ownerOf(s, get(s, a.id)!), 0);
  const other = staged(s, E.spawn);
  forOwner(s, 1, () => engage(s, other));
  flush(s);
  s = choose(reload(s), "give");
  assert.equal(ownerOf(s, get(s, a.id)!), 1);
  s.table!.first = 0;
  handle(s, fx("phaseEnd"));
  assert.equal(ownerOf(s, get(s, a.id)!), 1);
});
test("Amarthiúl leaving play loses even when his printed text is blank", () => {
  let s = base();
  const a = s.allies[0];
  s.questAttachments = {
    [E.into]: [{ id: "cold", code: W.cold, exhausted: false }],
  };
  a.damage = 1;
  syncAttachmentText(s);
  assert.ok(a.blanked);
  discardCharacter(s, a);
  s = finished(s);
  assert.equal(s.status, "lost");
  assert.match(s.reason!, /Amarthiúl/);
});
test("Coldfell Giant damages three different owned characters through serialized choices", () => {
  let s = base(2);
  const enemy = staged(s, E.giant);
  forOwner(s, 1, () => engage(s, enemy));
  flush(s);
  const heroes = seatView(s, 1).heroes.map((h) => h.id);
  for (const id of heroes) {
    assert.match(s.choice!.title, /Coldfell/);
    s = choose(reload(s), target(s, id));
  }
  s = settle(s);
  for (const id of heroes) assert.equal(get(s, id)!.damage, 1);
  assert.ok(seatView(s, 0).heroes.every((h) => h.damage === 0));
});
test("Savage Trollspawn counts the engaged player's damaged characters and Ruthless Troll bonuses begin at three damage", () => {
  const s = base(2);
  const enemy = make(s, E.spawn);
  forOwner(s, 1, () => {
    s.engaged.push(enemy);
    s.heroes[0].damage = 1;
    s.heroes[1].damage = 1;
  });
  assert.equal(stats(s, enemy).attack, 4);
  forOwner(s, 0, () => {
    s.heroes[0].damage = 1;
  });
  assert.equal(stats(s, enemy).attack, 4);
  const troll = staged(s, E.ruthless);
  troll.damage = 2;
  assert.equal(stats(s, troll).attack, 4);
  troll.damage = 3;
  assert.equal(stats(s, troll).attack, 6);
  assert.equal(stats(s, troll).defense, 3);
});
test("Cruel Mountain-troll excess combat damage removes progress from every physical quest", () => {
  let s = base();
  const enemy = make(s, E.cruel);
  s.engaged.push(enemy);
  const q = staged(s, E.lieLow);
  s.progress = 6;
  q.progress = 5;
  const h = s.heroes[0];
  const remaining = stats(s, h).health - h.damage;
  damage(s, h.id, remaining + 2, { enemyId: enemy.id, combatDamage: true });
  s = finished(s);
  assert.equal(s.progress, 4);
  assert.equal(get(s, q.id)!.progress, 3);
});
test("Lie Low records actual progress even if all tokens are later removed", () => {
  let s = base();
  const q = staged(s, E.lieLow),
    enemy = staged(s, E.spawn);
  s = selected(s, q);
  addCurrentQuestProgress(s, 1);
  get(s, q.id)!.progress = 0;
  ettenEndQuest(s);
  s = finished(s);
  assert.equal(engagementCost(s, get(s, enemy.id)!), 36);
  s.round++;
  s.phase = "staging";
  ettenEndQuest(s);
  s = finished(s);
  assert.equal(engagementCost(s, get(s, enemy.id)!), 16);
  s.round++;
  assert.equal(engagementCost(s, get(s, enemy.id)!), 36);
});
test("Forage resource spending damages each actual payer once but transfers and resource gains do not", () => {
  let s = base();
  staged(s, E.forage);
  const h = s.heroes[0];
  ettenResourcesSpent(s, h, 3);
  s = finished(s);
  assert.equal(get(s, h.id)!.damage, 1);
  handle(s, fx("resource", { target: h.id, value: 2 }));
  s = finished(s);
  assert.equal(get(s, h.id)!.damage, 1);
});
test("side-quest defeat places progress on stage one even when Safe blanked that side quest", () => {
  let s = base();
  s.activeLocation = make(s, E.hoarwell);
  const q = staged(s, E.forage);
  s = selected(s, q);
  assert.ok(get(s, q.id)!.blanked);
  addCurrentQuestProgress(s, 6);
  s = finished(s);
  assert.equal(s.progress, 6);
  assert.ok(s.victoryCards?.includes(E.forage));
});
test("stage-one beginning adds a discarded side quest without executing its When Revealed", () => {
  let s = base();
  s.hand = [make(s, "01057")];
  s.encounterDeck = ["01099", C.wilderness];
  handle(s, fx("startQuest"));
  s = finished(s);
  assert.ok(s.staging.some((u) => u.code === C.wilderness));
  assert.equal(s.hand.length, 1);
  assert.match(s.phase, /quest/);
});
test("stage-two transition reshuffles and genuinely reveals the found side quest", () => {
  let s = base();
  s.hand = [make(s, "01057")];
  s.encounterDeck = [C.wilderness];
  s.progress = 10;
  s = finished(s);
  assert.equal(s.stage, 2);
  assert.equal(s.hand.length, 0);
  assert.equal(Object.values(s.encounterHiddenHands ?? {})[0]?.length, 1);
  assert.equal(stageInfo(s).quest, 20);
});
test("Journey's End penalizes damaged characters until Safe becomes active and wins only at seventeen progress", () => {
  let s = base();
  s.stage = 3;
  const h = s.heroes[0],
    will = card(h.code).willpower!;
  h.damage = 1;
  assert.equal(stats(s, h).will, Math.max(0, will - 2));
  s.activeLocation = make(s, E.hoarwell);
  assert.equal(stats(s, h).will, will);
  s.activeLocation = null;
  s.progress = 16;
  s = finished(s);
  assert.equal(s.status, "playing");
  s.progress = 17;
  s = finished(s);
  assert.equal(s.status, "won");
});

test("Scavenge's defeated Forced finds a Troll then plays the actual hand card for free with its entry Response", () => {
  let s = base();
  const q = staged(s, E.scavenge),
    physical = make(s, "01016");
  s.hand = [physical];
  s.encounterDeck = [E.ruthless];
  for (const h of s.heroes) h.resources = 0;
  s = selected(s, q);
  addCurrentQuestProgress(s, 7);
  flush(s);
  assert.match(s.choice!.title, /Scavenge/);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.ok(s.engaged.some((u) => u.code === E.ruthless));
  assert.match(s.choice!.title, /no cost/);
  s = choose(reload(s), physical.id);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.id === physical.id && u.code === "01016"));
  assert.ok(s.heroes.every((h) => h.resources === 0));
  assert.equal(s.hand.length, 0);
});
test("Forage's actual paid card cost resolves damage before the played ally's optional Response", () => {
  let s = base();
  staged(s, E.forage);
  staged(s, "01099");
  const h = s.heroes[0],
    physical = make(s, "01016");
  s.hand = [physical];
  h.damage = stats(s, h).health - 1;
  h.resources = 1;
  const id = h.id;
  s = applyAction(reload(s), {
    type: "PLAY",
    id: physical.id,
    payment: { [id]: 1 },
  });
  assert.ok(
    !get(s, id),
    "payer destroyed by the spend-triggered Forced effect before the ally Response window",
  );
  assert.match(s.choice!.title, /Snowbourn/);
  s = settle(s);
  assert.ok(s.allies.some((u) => u.id === physical.id));
});
test("Forage damage from a hero Action's resource cost resolves before its healing effect", () => {
  let s = base();
  staged(s, E.forage);
  const h = make(s, "01011");
  s.heroes[0] = h;
  h.damage = stats(s, h).health - 1;
  h.resources = 1;
  const id = h.id;
  s = applyAction(reload(s), { type: "ABILITY", id });
  assert.match(s.choice!.title, /Glorfindel/);
  s = choose(reload(s), target(s, id));
  assert.ok(
    !get(s, id),
    "Forage destroys Glorfindel before his effect can heal him",
  );
  assert.ok(s.discard.includes("01011"));
});
test("a paid Honour Guard cannot cancel the Forage damage from its own resource cost", () => {
  let s = base();
  staged(s, E.forage);
  const h = make(s, "01004"),
    guard = make(s, "10004");
  s.heroes[0] = h;
  s.hand = [guard];
  h.damage = stats(s, h).health - 1;
  h.resources = 2;
  const id = h.id;
  s = applyAction(reload(s), {
    type: "PLAY",
    id: guard.id,
    payment: { [id]: 2 },
  });
  assert.ok(
    !get(s, id),
    "Honour Guard was outside play during the cost's damage",
  );
  assert.ok(s.allies.some((u) => u.id === guard.id));
  assert.equal(s.choice, null);
});
test("Forage resolves an actual event's payment before its suspended printed Action", () => {
  let s = base(2);
  staged(s, E.forage);
  const h = make(s, "01007"),
    event = make(s, "01046");
  s.heroes[0] = h;
  s.hand = [event];
  h.damage = stats(s, h).health - 1;
  h.resources = 3;
  const id = h.id;
  s = applyAction(reload(s), {
    type: "PLAY",
    id: event.id,
    payment: { [id]: 3 },
  });
  assert.ok(
    !get(s, id),
    "payer destroyed before the event's threat-reduction choice",
  );
  assert.match(s.choice!.title, /Galadhrim/);
  assert.ok(s.resolvingEvents?.some((pending) => pending.unit.id === event.id));
  s = settle(s);
  assert.equal(s.threat, 14);
  assert.ok(s.discard.includes("01046"));
});
test("Arador's Bane engages by actual engagement cost and deals exactly two physical shadows after engagement effects", () => {
  let s = base();
  const enemy = staged(s, E.spawn);
  s.encounterDeck = ["01099", "01099", "01099"];
  revealed(s, E.arador);
  flush(s);
  assert.match(s.choice!.title, /Arador/);
  s = choose(reload(s), enemy.id);
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
  assert.equal(get(s, enemy.id)!.shadows.length, 2);
  assert.equal(s.encounterDeck.length, 1);
});
test("Barren Moorland travel cost damages every exhausted character before the active slot changes", () => {
  let s = base(2);
  const l = staged(s, E.moorland);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes[0].exhausted = true;
    });
  s.phase = "travel";
  s = settle(applyAction(reload(s), { type: "TRAVEL", id: l.id }));
  assert.equal(s.activeLocation?.id, l.id);
  for (const p of playerOrder(s))
    assert.equal(seatView(s, p).heroes[0].damage, 1);
});
test("Safe immunity excludes player progress targets and its side-quest blanking removes printed Surge", () => {
  let s = base();
  const l = staged(s, E.camp),
    physical = make(s, "01016");
  s.hand = [physical];
  s = applyAction(reload(s), { type: "PLAY", id: physical.id });
  assert.ok(
    s.choice!.options.every((o) => !o.effects.some((e) => e.target === l.id)),
    "immune Safe is not an ally Response target",
  );
  s = settle(s);
  s.activeLocation = get(s, l.id)!;
  s.staging = s.staging.filter((u) => u.id !== l.id);
  s.encounterDeck = ["01099"];
  revealed(s, W.camp);
  s = finished(s);
  assert.equal(s.encounterDeck.length, 1);
});
