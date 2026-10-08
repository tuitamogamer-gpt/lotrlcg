import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, validateSave } from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import {
  encounterDraw,
  fx,
  get,
  make,
  stageInfo,
  stats,
  threatOf,
  stagingThreat,
} from "../src/game/core";
import {
  damage,
  check,
  discardAttachment,
  discardCharacter,
  engage,
  enemyAddedToStaging,
  placeEncounter,
  progressLocation,
  revealed,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "../src/game/table";
import {
  addCurrentQuestProgress,
  addQuestProgress,
  sideQuestStart,
} from "../src/game/side-quests";
import { currentQuestUnit, mainQuestUnit } from "../src/game/quest-state";
import { removeQuestTime } from "../src/game/quest-time";
import { startGuided } from "../src/game/presentation";
import {
  RHUDAUR as R,
  RHUDAUR_CLUES,
  RHUDAUR_ENCOUNTERS,
  RHUDAUR_FLIPS,
  RHUDAUR_QUESTS,
  RHUDAUR_RECIPES,
  RHUDAUR_SIDES,
} from "../src/game/rhudaur-support";
import { DIKE as D } from "../src/game/deadmens-dike-support";
import { WEATHER as W } from "../src/game/weather-hills-support";
import {
  rhudaurAbilityLabel as abilityLabel,
  rhudaurAttackFinished,
  rhudaurAttackBonus,
  rhudaurDefenseBonus,
} from "../src/game/rhudaur";
import {
  base,
  choose,
  reload,
  second,
  settle,
  start,
} from "./rhudaur-fixtures";
import type { GameState, Unit } from "../src/game/types";

const staged = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
const finish = (s: GameState) => {
  check(s);
  flush(s);
  return settle(s);
};
const side = (s: GameState, code: string) =>
  s.staging.find((u) => u.code === code)!;
function target(s: GameState, id: string) {
  const o = s.choice!.options.find(
    (o) =>
      o.id === id || o.effects.some((e) => e.target === id || e.source === id),
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
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`The Treachery of Rhudaur ${easy ? "easy" : "normal"} ${players} players: original setup and Time`, () => {
      const s = start(players, easy);
      assert.ok(s.rhudaur?.initialized);
      assert.equal(s.stage, 1);
      assert.equal(s.rhudaur.time, 5);
      assert.equal(s.activeLocation?.code, R.hall);
      assert.equal(
        s.staging.filter((u) => RHUDAUR_SIDES.includes(u.code)).length,
        3,
      );
      assert.equal(
        s.staging.filter((u) => u.code === W.causeway).length,
        players >= 3 ? 2 : 1,
      );
      assert.equal(s.rhudaur.setAside.length, 1);
      assert.equal(s.rhudaur.setAside[0].code, R.thaurdir);
      assert.equal(
        s.encounterDeck.length,
        (easy ? 29 : 41) - (players >= 3 ? 1 : 0),
      );
      assert.ok(validateSave(reload(s)));
    });
test("Rhudaur exact definitions include original objective backs and reuse eight existing encounter IDs", () => {
  assert.equal(RHUDAUR_ENCOUNTERS.length, 19);
  assert.equal(RHUDAUR_QUESTS.length, 2);
  assert.equal(RHUDAUR_QUESTS[0].code, R.secrets);
  for (const c of [...RHUDAUR_ENCOUNTERS, ...RHUDAUR_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    assert.ok(existsSync(`public${imageUrl(c)}`), c.name);
  }
  for (const code of [
    D.cursed,
    D.restless,
    D.lord,
    D.seal,
    W.ruins,
    W.causeway,
    W.discovery,
    W.search,
  ])
    assert.ok(
      RHUDAUR_RECIPES.every((r) => r.cards.some((c) => c.code === code)),
    );
  for (const code of RHUDAUR_CLUES)
    assert.equal(card(code).type_code, "objective");
});
test("main quest is unavailable in quest phase and the first player must choose an actual side quest", () => {
  let s = base();
  handle(s, fx("startQuest"));
  flush(s);
  assert.ok(s.choice);
  assert.ok(!s.choice.options.some((o) => o.id === "main"));
  assert.equal(s.choice.options.length, 3);
  s = choose(reload(s), side(s, R.debris).id);
  assert.equal(currentQuestUnit(s)?.code, R.debris);
});
test("defeating each Rhudaur quest flips the same physical card into its own Clue, with no victory entry", () => {
  for (const code of RHUDAUR_SIDES) {
    let s = base();
    const q = side(s, code),
      id = q.id;
    s = selected(s, q);
    addCurrentQuestProgress(s, card(code).quest!);
    s = finish(s);
    assert.equal(get(s, id)!.code, RHUDAUR_FLIPS[code]);
    assert.equal(get(s, id)!.progress, 0);
    assert.ok(!s.victoryCards?.includes(code));
    assert.ok(validateSave(reload(s)));
  }
});
test("claiming a Clue pays exhaustion, retains physical identity and restores it to staging when bearer leaves", () => {
  let s = base();
  const q = side(s, R.debris),
    id = q.id;
  s = selected(s, q);
  addCurrentQuestProgress(s, 18);
  s = finish(s);
  s.phase = "planning";
  const h = s.heroes[0];
  assert.match(abilityLabel(s, get(s, id)!)!, /Claim/);
  s = applyAction(reload(s), { type: "ABILITY", id });
  s = choose(reload(s), target(s, h.id));
  assert.ok(get(s, h.id)!.exhausted);
  assert.ok(!s.staging.some((u) => u.id === id));
  assert.equal(
    get(s, h.id)!.attachments.find((a) => a.code === R.heirloom)?.id,
    id,
  );
  assert.equal(stats(s, get(s, h.id)!).will, card(h.code).willpower! + 1);
  discardCharacter(s, get(s, h.id)!);
  s = finish(s);
  assert.equal(s.staging.find((u) => u.code === R.heirloom)?.id, id);
});
test("Decipher Ancient Texts' paid Action is limited to three collectively across players each round", () => {
  let s = base(2);
  const q = side(s, R.texts),
    id = q.id;
  for (let n = 0; n < 3; n++) {
    const player = n % 2;
    forOwner(s, player, () => {
      s.phase = "planning";
    });
    selectSeat(s, player);
    s = applyAction(reload(s), { type: "ABILITY", id });
    s = choose(reload(s), s.choice!.options[0].id);
  }
  assert.equal(get(s, id)!.progress, 3);
  assert.equal(s.rhudaur!.textActions[id], 3);
  assert.equal(abilityLabel(s, get(s, id)!), null);
  s.round++;
  assert.ok(abilityLabel(s, get(s, id)!));
});
test("Time expiration removes only remaining quest fronts; discovered Clues persist into stage two", () => {
  let s = base();
  const q = side(s, R.debris),
    id = q.id;
  s = selected(s, q);
  addCurrentQuestProgress(s, 18);
  s = finish(s);
  s.phase = "refresh";
  s.rhudaur!.time = 1;
  removeQuestTime(s);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(s.rhudaur!.time, 0);
  assert.equal(get(s, id)!.code, R.heirloom);
  assert.ok(s.removedEncounter?.includes(R.texts));
  assert.ok(s.removedEncounter?.includes(R.spirits));
  assert.ok(!s.removedEncounter?.includes(R.debris));
  assert.ok(s.staging.some((u) => u.code === R.thaurdir));
  assert.ok(validateSave(reload(s)));
});
test("guided Time expiration saves before Thaurdir enters and resumes the exact stage-two setup", () => {
  let s = startGuided(base(2));
  s.phase = "refresh";
  s.rhudaur!.time = 1;
  s.queue.push(fx("removeQuestTime"));
  flush(s);
  assert.equal(s.stage, 2);
  assert.ok(s.stageRevealing);
  assert.ok(s.flow!.pending);
  assert.equal(s.rhudaur!.setAside.length, 1);
  assert.ok(s.queue.some((e) => e.kind === "rhudaurStageTwo"));
  s = reload(s);
  const missingBoundary = structuredClone(s);
  missingBoundary.queue = missingBoundary.queue.filter(
    (e) => e.kind !== "rhudaurStageTwo",
  );
  assert.equal(validateSave(missingBoundary), false);
  const completedBoundary = structuredClone(s);
  completedBoundary.stageRevealing = false;
  assert.equal(validateSave(completedBoundary), false);
  for (let n = 0; s.flow?.pending || s.choice; n++) {
    assert.ok(n < 25, "stage-two guided setup resolves");
    s = reload(s);
    s = applyAction(
      s,
      s.flow!.pending
        ? { type: "CONTINUE", stepId: s.flow!.pending.id }
        : { type: "CHOOSE", id: s.choice!.options[0].id },
    );
  }
  assert.equal(s.rhudaur!.setAside.length, 0);
  assert.equal(s.staging.filter((u) => u.code === R.thaurdir).length, 1);
  assert.equal(s.stageRevealing, false);
  assert.ok(validateSave(reload(s)));
});
test("finding all three Clues immediately advances before any future action window", () => {
  let s = base();
  for (const q of [...s.staging].filter((u) =>
    RHUDAUR_SIDES.includes(u.code),
  )) {
    addQuestProgress(s, q, card(q.code).quest!);
    s = finish(s);
  }
  assert.equal(s.stage, 2);
  assert.equal(s.rhudaur!.time, 0);
  assert.equal(
    s.staging.filter((u) => RHUDAUR_CLUES.includes(u.code)).length,
    3,
  );
});
test("Decrepit Remains modifies staging quest/location points; Haunting Fog adds six to its physical host", () => {
  let s = base();
  const remains = staged(s, R.remains),
    q = side(s, R.debris);
  s = selected(s, q);
  assert.equal(stageInfo(s).quest, 20);
  s.encounterDeck = [];
  placeEncounter(s, R.fog);
  s = finish(s);
  assert.equal(stageInfo(s).quest, 26);
  assert.equal(get(s, q.id)!.attachments[0].code, R.fog);
  s.activeLocation = remains;
  s.staging = s.staging.filter((u) => u.id !== remains.id);
  assert.equal(stageInfo(s).quest, 24);
});
test("Sift Through the Debris grants progress for every explored location even when it is not current", () => {
  let s = base();
  const q = side(s, R.debris),
    l = staged(s, W.causeway);
  s = selected(s, side(s, R.texts));
  progressLocation(s, l, 3);
  s = finish(s);
  assert.equal(get(s, q.id)!.progress, 2);
  assert.equal(currentQuestUnit(s)?.code, R.texts);
  assert.equal(s.threat, 22);
});
test("Quiet the Spirits engages entering Undead with highest threat and preserves their staging contribution until phase end", () => {
  let s = base(2);
  s = selected(s, side(s, R.spirits));
  forOwner(s, 1, () => {
    s.threat = 30;
  });
  const enemy = staged(s, D.cursed);
  enemyAddedToStaging(s, enemy);
  s = finish(s);
  assert.ok(allEngaged(s).some((u) => u.id === enemy.id));
  assert.equal(ownerOf(s, get(s, enemy.id)!), 1);
  assert.equal(stagingThreat(s), 1);
  s.phase = "travel";
  assert.equal(stagingThreat(s), 0);
});
test("Quiet the Spirits progress after enemy destruction targets its own quest without changing the current quest", () => {
  let s = base();
  const q = side(s, R.spirits);
  s = selected(s, side(s, R.texts));
  const enemy = staged(s, D.cursed);
  damage(s, enemy.id, 2);
  s = finish(s);
  assert.equal(get(s, q.id)!.progress, 2);
  assert.equal(currentQuestUnit(s)?.code, R.texts);
});
test("Forbidden Descent redirects only the first two progress per physical copy each round and can be explored from staging", () => {
  let s = base();
  const q = side(s, R.texts),
    l = staged(s, R.descent);
  s = selected(s, q);
  addCurrentQuestProgress(s, 3);
  s = finish(s);
  assert.equal(get(s, l.id)!.progress, 2);
  assert.equal(get(s, q.id)!.progress, 1);
  addCurrentQuestProgress(s, 2);
  s = finish(s);
  assert.equal(get(s, q.id)!.progress, 3);
  s.round++;
  addCurrentQuestProgress(s, 3);
  s = finish(s);
  assert.equal(get(s, l.id)!.progress, 4);
  assert.equal(get(s, q.id)!.progress, 4);
  s.round++;
  addCurrentQuestProgress(s, 3);
  s = finish(s);
  assert.ok(!get(s, l.id));
  assert.equal(s.threat, 22);
  assert.equal(get(s, q.id)!.progress, 5);
});
test("Ghostly Ruins returns topmost Undead once per depletion during combat, before later reset", () => {
  let s = base();
  staged(s, R.ghostly);
  s.phase = "defense";
  s.encounterDeck = ["01099"];
  s.encounterDiscard = [D.cursed, R.traitor];
  assert.equal(encounterDraw(s, true), "01099");
  s = finish(s);
  assert.ok(s.staging.some((u) => u.code === R.traitor));
  assert.ok(s.encounterDiscard.includes(D.cursed));
  encounterDraw(s, true);
  s = finish(s);
  assert.ok(!s.staging.some((u) => u.code === D.cursed));
  s.phase = "staging";
  encounterDraw(s);
  s = finish(s);
  assert.ok(!s.staging.some((u) => u.code === D.cursed));
});
test("The Great Hall discards exactly five per player and lets each add only an enemy they discarded", () => {
  let s = base(2);
  const l = staged(s, R.hall);
  s.encounterDeck = [
    D.cursed,
    "01099",
    "01099",
    "01099",
    "01099",
    R.traitor,
    "01099",
    "01099",
    "01099",
    "01099",
    "01099",
  ];
  progressLocation(s, l, 8);
  flush(s);
  if (!s.choice!.title.includes("The Great Hall")) {
    const hall = s.choice!.options.find((o) =>
      o.effects.some((e) => e.kind === "rhudaurHall"),
    );
    assert.ok(hall, JSON.stringify(s.choice));
    s = choose(reload(s), hall.id);
  }
  assert.equal(s.choice!.options.length, 1);
  assert.equal(s.choice!.options[0].code, D.cursed);
  s = choose(reload(s), s.choice!.options[0].id);
  assert.equal(s.choice!.options[0].code, R.traitor);
  s = choose(reload(s), s.choice!.options[0].id);
  s = settle(s);
  assert.equal(s.encounterDeck.length, 1);
  assert.ok(s.staging.some((u) => u.code === D.cursed));
  assert.ok(s.staging.some((u) => u.code === R.traitor));
});
test("Great Hall continues both players' discards through a quest-phase reset after Ghostly Ruins takes the last discarded Undead", () => {
  let s = base(2);
  s.phase = "quest";
  staged(s, R.ghostly);
  const hall = staged(s, R.hall);
  s.encounterDeck = [R.wight];
  s.encounterDiscard = Array(20).fill("01099");
  progressLocation(s, hall, 8);
  s = finish(s);
  assert.equal(s.encounterDeck.length, 11);
  assert.equal(s.encounterDiscard.length, 9);
  assert.equal(s.staging.filter((u) => u.code === R.wight).length, 1);
  assert.ok(!s.encounterDeck.includes(R.wight));
  assert.ok(!s.encounterDiscard.includes(R.wight));
  assert.ok(validateSave(reload(s)));
});
test("Centuries of Sorrow changes the physical current quest and Wight keywords use the current quest's actual progress", () => {
  let s = base();
  s = selected(s, side(s, R.texts));
  const q = side(s, R.spirits);
  q.progress = 1;
  s.encounterDeck = [];
  placeEncounter(s, R.sorrow);
  flush(s);
  s = choose(reload(s), target(s, q.id));
  assert.equal(currentQuestUnit(s)?.id, q.id);
  s.encounterDeck = ["01099"];
  const threat = s.threat;
  revealed(s, R.wight);
  s = finish(s);
  assert.equal(s.threat, threat);
  assert.equal(s.encounterDeck.length, 0);
});
test("Eerie Halls' any-player Action pays threat and lowers only that physical location until phase end", () => {
  let s = base(2);
  const l = staged(s, R.halls),
    other = staged(s, R.halls);
  const before = s.threat;
  s = applyAction(reload(s), { type: "ABILITY", id: l.id });
  assert.equal(s.threat, before + 1);
  assert.equal(threatOf(s, get(s, l.id)!), 4);
  assert.equal(threatOf(s, get(s, other.id)!), 5);
  handle(s, fx("phaseEnd"));
  assert.equal(threatOf(s, get(s, l.id)!), 5);
});
test("Thaurdir is indestructible and Sorcery forces a real first-player attack even when When Revealed was canceled", () => {
  let s = second(base(2));
  const enemy = s.staging.find((u) => u.code === R.thaurdir)!;
  enemy.damage = 6;
  s.encounterDeck = [];
  revealed(s, R.covenant);
  flush(s);
  assert.ok(s.choice);
  assert.match(s.choice.title, /Thaurdir/);
  assert.equal(get(s, enemy.id)!.damage, 3);
  s = settle(s);
  damage(s, enemy.id, 20);
  s = finish(s);
  assert.ok(get(s, enemy.id));
});
test("Clue combat bonuses apply only against Undead and the victory target falls by five per attached Clue", () => {
  let s = second();
  const h = s.heroes[0];
  for (const code of RHUDAUR_CLUES)
    h.attachments.push({ id: `clue-${code}`, code, exhausted: false });
  const undead = make(s, D.cursed),
    orc = make(s, "01096");
  assert.equal(rhudaurAttackBonus(s, undead, h), 1);
  assert.equal(rhudaurDefenseBonus(s, undead, h), 1);
  assert.equal(rhudaurAttackBonus(s, orc, h), 0);
  assert.equal(stageInfo(s).quest, 15);
  s.progress = 15;
  s = finish(s);
  assert.equal(s.status, "playing");
  s.staging.find((u) => u.code === R.thaurdir)!.damage = 9;
  s = finish(s);
  assert.equal(s.status, "won");
});
test("Amarthiúl optional control transfer belongs to original controller and his departure always loses", () => {
  let s = base(2);
  const ally = allCharacters(s).find((u) => u.code === R.amarthiul)!,
    enemy = staged(s, D.cursed);
  forOwner(s, 1, () => engage(s, enemy));
  flush(s);
  assert.match(s.choice!.title, /Amarthiúl/);
  s = choose(reload(s), "give");
  assert.equal(ownerOf(s, get(s, ally.id)!), 1);
  discardCharacter(s, get(s, ally.id)!);
  s = finish(s);
  assert.equal(s.status, "lost");
});

test("Haunting Fog's removal immediately defeats a quest whose existing progress meets its reduced goal", () => {
  let s = base();
  const q = side(s, R.debris),
    id = q.id;
  q.progress = 18;
  q.attachments = [{ id: "fog-progress", code: R.fog, exhausted: false }];
  s = selected(s, q);
  assert.equal(get(s, id)!.code, R.debris);
  discardAttachment(s, get(s, id)!, get(s, id)!.attachments[0]);
  s = finish(s);
  assert.equal(get(s, id)!.code, R.heirloom);
  assert.ok(!s.victoryCards?.includes(R.debris));
});
test("Dark Covenant assigns its discarded printed threat and groups the full assignment as one damage event", () => {
  let s = base();
  s.encounterDeck = [R.wight, R.remains, R.remains];
  const h = s.heroes[0];
  placeEncounter(s, R.covenant);
  flush(s);
  assert.equal(s.choice!.options[0].id, "damage");
  s = choose(reload(s), "damage");
  const option = s.choice!.options.find((o) => o.id === `${h.id}:4`);
  assert.ok(option, JSON.stringify(s.choice));
  s = choose(reload(s), option.id);
  s = settle(s);
  assert.equal(get(s, h.id)!.damage, 4);
});
test("Rhudaur combat shadows remove progress per actual damage and raise threat by a destroyed character's willpower", () => {
  let s = base();
  const enemy = make(s, D.cursed),
    h = s.heroes[0];
  s.engaged.push(enemy);
  s.phase = "defense";
  side(s, R.texts).progress = 7;
  s.progress = 5;
  s.combat = {
    enemyId: enemy.id,
    defenderId: h.id,
    attackPlayer: 0,
    attackBonus: 0,
  };
  handle(s, fx("shadowEffect", { code: R.traitor }));
  damage(s, h.id, 2, { enemyId: enemy.id, combatDamage: true });
  s = finish(s);
  assert.equal(s.progress, 3);
  assert.equal(side(s, R.texts).progress, 5);
  const ally = make(s, "01014");
  s.allies.push(ally);
  const threat = s.threat;
  handle(s, fx("shadowEffect", { code: R.covenant }));
  damage(s, ally.id, 3, { enemyId: enemy.id, combatDamage: true });
  const completed = s.combat!;
  s.combat = null;
  rhudaurAttackFinished(s, completed);
  s = finish(s);
  assert.equal(s.threat, threat + card("01014").willpower!);
});
