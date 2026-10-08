import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { applyAction, canTravel, validateSave } from "../src/game/engine";
import { card, imageUrl, SCRIPTED } from "../src/game/cards";
import {
  engagementCost,
  fx,
  get,
  make,
  questStat,
  spendResources,
  stats,
  threatOf,
} from "../src/game/core";
import { currentQuestUnit } from "../src/game/quest-state";
import {
  check,
  damage,
  engage,
  placeEncounter,
  progress,
  revealed,
  shadow,
} from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  forOwner,
  playerOrder,
  seatView,
} from "../src/game/table";
import { addCurrentQuestProgress } from "../src/game/side-quests";
import {
  consideredEngaged,
  engagedEnemies,
  normalAttackPending,
  prepareEnemyShadows,
  finishEnemyShadows,
} from "../src/game/considered-engagement";
import { automatedScenarioId } from "../src/game/support";
import {
  CARN as C,
  CARN_ENCOUNTERS,
  CARN_QUESTS,
  CARN_RECIPES,
} from "../src/game/carn-dum-support";
import { carnCheck, carnShadowText } from "../src/game/carn-dum";
import {
  base,
  second,
  start,
  boss,
  ally,
  enemy,
  staged,
  choose,
  reload,
  finish,
  settle,
  defend,
  target,
  browserFlipChoice,
} from "./carn-dum-fixtures";
import type { GameState, Unit } from "../src/game/types";

function side(s: GameState, code = C.furious) {
  s.phase = "staging";
  placeEncounter(s, code, false, 0, undefined, true);
  const u = s.staging.find((u) => u.code === code)!;
  s.sideQuestSelections = { shared: { id: u.id, code: u.code } };
  return u;
}
function attack(s: GameState, e: Unit, ids: string[]) {
  s.phase = "attack";
  return applyAction(reload(s), {
    type: "ATTACK",
    enemyId: e.id,
    attackerIds: ids,
  });
}
function shadowState(s: GameState, e: Unit, d?: Unit) {
  s.phase = "defense";
  s.combat = {
    enemyId: e.id,
    attackPlayer: 0,
    defenderId: d?.id ?? null,
    defenderIds: d ? [d.id] : [],
    attackBonus: 0,
  };
  return s;
}
function quietBoss(s: GameState) {
  boss(s).flipped = true;
  boss(s).feinted = true;
}

test("Carn Dûm registers every original runtime card and corrects catalog errors against printed faces", () => {
  assert.equal(CARN_ENCOUNTERS.length, 12);
  assert.equal(CARN_QUESTS.length, 2);
  for (const c of [...CARN_ENCOUNTERS, ...CARN_QUESTS]) {
    assert.ok(SCRIPTED.has(c.code), c.name);
    for (const path of [imageUrl(c), c.back_imagesrc].filter(Boolean))
      assert.ok(existsSync(`public${path}`), String(path));
  }
  assert.match(card(C.furious).text!, /^Surge\./);
  assert.match(
    card(C.crux).back_text!,
    /While Midwinter's Crux has 15 or more progress/,
  );
  assert.doesNotMatch(card(C.crux).back_text!, /Sever the Head/);
  assert.match(card(C.thaurdir).back_traits!, /Champion/);
  assert.doesNotMatch(card(C.thaurdir).text!, /Immune to player card effects/);
  for (const r of CARN_RECIPES)
    assert.equal(automatedScenarioId(r), "the-battle-of-carn-dum");
  assert.equal(
    automatedScenarioId({ name: "The Battle of Carn Dûm", mode: "nightmare" }),
    null,
  );
});

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`Carn Dûm ${easy ? "easy" : "normal"} physical setup for ${players} players survives saving`, () => {
      const s = start(players, easy);
      assert.equal(s.phase, "resource");
      assert.equal(s.carnDum?.initialized, true);
      assert.equal(s.activeLocation?.code, C.battlefield);
      assert.equal(boss(s).flipped, undefined);
      assert.equal(
        s.staging.filter((u) => u.code === C.garrison).length,
        Math.min(players, easy ? 3 : 4),
      );
      assert.equal(
        s.encounterDeck.length,
        (easy ? 30 : 46) - Math.min(players, easy ? 3 : 4),
      );
      const r = CARN_RECIPES.find(
        (r) => r.mode === (easy ? "easy" : "standard"),
      )!;
      const expected = r.cards
        .filter((r) =>
          [
            "sharedEncounterDeck",
            "sharedStagingArea",
            "sharedActiveLocation",
          ].includes(r.section),
        )
        .flatMap((r) => Array<string>(r.quantity).fill(r.code))
        .sort();
      assert.deepEqual(
        [
          ...s.encounterDeck,
          ...s.encounterDiscard,
          ...s.staging.map((u) => u.code),
          s.activeLocation!.code,
        ].sort(),
        expected,
      );
      assert.equal(
        allCharacters(s).some((u) => card(u.code).name === "Iarion"),
        false,
      );
      assert.equal(allEngaged(s).length, 0);
      assert.ok(validateSave(reload(s)));
    });

test("Carn save rejects malformed round effects, latch identities and a missing physical boss", () => {
  for (const corrupt of [
    (s: GameState) => {
      s.carnDum!.furiousPenalty = 3;
    },
    (s: GameState) => {
      s.carnDum!.terrorRound = s.round + 1;
    },
    (s: GameState) => {
      s.carnDum!.threeShadowIds = [boss(s).id, boss(s).id];
    },
    (s: GameState) => {
      s.carnDum!.threeShadowIds = ["not-a-card"];
    },
    (s: GameState) => {
      s.staging = [];
    },
    (s: GameState) => {
      s.engaged.push(make(s, C.thaurdir));
    },
    (s: GameState) => {
      s.encounterDeck.push(C.thaurdir);
    },
    (s: GameState) => {
      boss(s).shadows.push(C.thaurdir);
    },
  ]) {
    const s = reload(base());
    corrupt(s);
    assert.equal(validateSave(s), false);
  }
});

test("active Accursed Battlefield gives Battle to the current main or side quest", () => {
  const s = base();
  s.activeLocation = make(s, C.battlefield);
  assert.equal(questStat(s), "attack");
  side(s);
  assert.equal(questStat(s), "attack");
  s.activeLocation.blanked = true;
  assert.equal(questStat(s), "will");
});

test("Orc Grunts reduce each actual quest placement after the active location buffer", () => {
  const s = base();
  staged(s, C.grunts);
  staged(s, C.grunts);
  s.activeLocation = make(s, C.blight);
  progress(s, 4);
  assert.equal(s.activeLocation, null);
  assert.equal(s.progress, 0);
  progress(s, 5);
  assert.equal(s.progress, 3);
  const q = side(s);
  addCurrentQuestProgress(s, 2);
  assert.equal(q.progress, 0);
  assert.equal(s.carnDum!.furiousPenalty, 0);
  addCurrentQuestProgress(s, 3);
  assert.equal(q.progress, 1);
  assert.equal(s.carnDum!.furiousPenalty, 2);
});

test("Furious Charge stacks -2 defense for each progress placement and expires next round", () => {
  const s = base();
  boss(s).blanked = true;
  const q = side(s);
  const h = s.heroes[0];
  const before = stats(s, h).defense;
  addCurrentQuestProgress(s, 1);
  assert.equal(q.progress, 1);
  assert.equal(stats(s, h).defense, Math.max(0, before - 2));
  addCurrentQuestProgress(s, 1);
  assert.equal(s.carnDum!.furiousPenalty, 4);
  assert.equal(stats(s, h).defense, Math.max(0, before - 4));
  s.round++;
  assert.equal(stats(s, h).defense, before);
});

test("Furious Charge defeat resolves Captain flip Forced before optional ten main progress", () => {
  let s = base();
  const q = side(s);
  q.progress = 4;
  addCurrentQuestProgress(s, 1);
  flush(s);
  assert.ok(boss(s).flipped);
  assert.match(s.choice!.title, /Immediate attack/);
  s = settle(s);
  // settle skips the optional response; the defeated side remains current this phase.
  assert.equal(s.progress, 0);
  assert.ok(s.victoryCards?.includes(C.furious));
  s = base();
  boss(s).feinted = true;
  side(s);
  addCurrentQuestProgress(s, 5);
  flush(s);
  assert.match(s.choice!.title, /Furious Charge/);
  s = choose(reload(s), "resolve");
  assert.equal(s.progress, 10);
});

test("Captain and Champion modify every other enemy engagement cost by ten", () => {
  const s = base();
  const g = staged(s, C.garrison),
    w = staged(s, C.wolf);
  assert.equal(engagementCost(s, g), 50);
  assert.equal(engagementCost(s, w), 45);
  boss(s).flipped = true;
  assert.equal(engagementCost(s, g), 30);
  assert.equal(engagementCost(s, w), 25);
  boss(s).blanked = true;
  assert.equal(engagementCost(s, g), 40);
});

test("Thaurdir remains in staging and cannot take damage on quest one even with blank text", () => {
  const s = base();
  boss(s).blanked = true;
  assert.equal(damage(s, boss(s).id, 4), false);
  assert.equal(boss(s).damage, 0);
  engage(s, boss(s));
  assert.equal(s.staging.filter((u) => u.code === C.thaurdir).length, 1);
});

test("flipping preserves physical identity, tokens and existing shadows and heals Champion", () => {
  let s = base();
  const b = boss(s);
  const id = b.id;
  b.damage = 6;
  b.resources = 2;
  b.progress = 1;
  b.shadows = ["01099"];
  handle(s, fx("carnFlip", { target: id }));
  flush(s);
  assert.equal(boss(s).id, id);
  assert.equal(boss(s).resources, 2);
  assert.equal(boss(s).progress, 1);
  assert.equal(boss(s).damage, 3);
  assert.equal(boss(s).shadows.length, 2);
  assert.match(s.choice!.title, /Immediate attack/);
  s = reload(s);
  assert.ok(boss(s).flipped);
});

test("exactly three boss shadows flip once when an immediate attack is prevented", () => {
  const s = base();
  const b = boss(s);
  b.shadows = ["01099", "01099", "01099"];
  b.feinted = true;
  carnCheck(s);
  flush(s);
  assert.equal(b.flipped, true);
  assert.equal(b.shadows.length, 3);
  carnCheck(s);
  flush(s);
  assert.equal(b.flipped, true);
  assert.equal(s.choice, null);
  b.shadows.push("01099");
  carnCheck(s);
  assert.equal(s.carnDum!.threeShadowIds.length, 0);
  b.shadows.pop();
  carnCheck(s);
  flush(s);
  assert.equal(b.flipped, false);
  assert.equal(b.shadows.length, 4);
});

test("Captain Sorcery deals shadows to all enemies; Werewolf at three engages and reuses its three", () => {
  let s = base();
  const w = staged(s, C.wolf);
  w.shadows = ["01099", "01099"];
  const g = enemy(s);
  const before = s.encounterDeck.length;
  revealed(s, C.sky);
  flush(s);
  // Sky has Sorcery; the Captain's Forced shadow deal follows the WR.
  assert.equal(boss(s).shadows.length, 1);
  assert.equal(get(s, g.id)!.shadows.length, 1);
  assert.equal(get(s, w.id)!.shadows.length, 3);
  assert.ok(allEngaged(s).some((u) => u.id === w.id));
  assert.equal(s.encounterDeck.length, before - 3);
  assert.match(s.choice!.title, /Immediate attack/);
  s = settle(s);
  assert.equal(get(s, w.id)!.shadows.length, 0);
});

test("events add a Werewolf shadow after payment and trigger only while it remains in staging", () => {
  let s = base();
  const w = staged(s, C.wolf);
  w.shadows = ["01099", "01099"];
  s.hand = [make(s, "01022")];
  s = applyAction(reload(s), { type: "PLAY", id: s.hand[0].id });
  assert.ok(allEngaged(s).some((u) => u.id === w.id));
  assert.equal(get(s, w.id)!.shadows.length, 3);
});

test("resolved shadows discard after the attack while unresolved shadows survive quest-one combat end", () => {
  let s = base();
  const g = enemy(s);
  g.shadows = ["01099", "01099"];
  g.revealedShadowCount = 1;
  finishEnemyShadows(s, g);
  assert.deepEqual(g.shadows, ["01099"]);
  assert.deepEqual(s.encounterDiscard, ["01099"]);
  boss(s).shadows = ["01099", "01099"];
  handle(s, fx("endCombat"));
  s = finish(s);
  assert.equal(get(s, g.id)!.shadows.length, 1);
  assert.equal(boss(s).shadows.length, 2);
});

test("stage two raises each player's threat by all shadows and does not win merely at fifteen progress", () => {
  let s = base(2);
  boss(s).feinted = true;
  boss(s).shadows = ["01099", "01099"];
  enemy(s).shadows = ["01099"];
  const id = boss(s).id;
  progress(s, 15);
  s = finish(s);
  assert.equal(s.stage, 2);
  assert.equal(boss(s).id, id);
  assert.equal(boss(s).flipped, true);
  for (const p of playerOrder(s)) assert.equal(seatView(s, p).threat, 23);
  progress(s, 15);
  check(s);
  assert.equal(s.status, "playing");
});

test("Thaurdir is physically one enemy, virtually engaged with each seat, and receives a fresh normal-attack shadow", () => {
  let s = second(base(2));
  const b = boss(s);
  b.blanked = true;
  for (const p of playerOrder(s)) {
    assert.ok(consideredEngaged(s, b, p));
    assert.ok(engagedEnemies(s, p).some((u) => u.id === b.id));
  }
  prepareEnemyShadows(s, b);
  assert.equal(b.shadows.length, 0);
  s = defend(s, b, s.heroes[0]);
  s = settle(s);
  assert.equal(boss(s).shadows.length, 0);
  assert.equal(normalAttackPending(s, boss(s), 0), false);
  assert.equal(normalAttackPending(s, boss(s), 1), true);
  assert.equal(s.staging.filter((u) => u.id === b.id).length, 1);
  assert.ok(validateSave(s));
});

test("Thaurdir's Indestructible threshold uses main progress and real player combat defeats him", () => {
  let s = second();
  const b = boss(s);
  b.damage = 8;
  const h = s.heroes[0];
  h.tempAttack = 20;
  s = attack(s, b, [h.id]);
  assert.equal(s.status, "playing");
  assert.ok(boss(s));
  get(s, h.id)!.exhausted = false;
  boss(s).attackedBy = [];
  boss(s).attacked = false;
  s.progress = 15;
  s = attack(s, boss(s), [h.id]);
  assert.equal(s.status, "won");
  assert.equal(
    s.staging.some((u) => u.code === C.thaurdir),
    false,
  );
  assert.ok(validateSave(s));
});

test("Daechanar's Will flips Captain without Surge and Champion with conditional Surge", () => {
  let s = base();
  boss(s).feinted = true;
  s.encounterDeck = [C.garrison];
  revealed(s, C.will);
  s = finish(s);
  assert.equal(boss(s).flipped, true);
  assert.equal(s.staging.filter((u) => u.code === C.garrison).length, 0);
  s = base();
  boss(s).flipped = true;
  boss(s).feinted = true;
  s.encounterDeck = ["01099", C.garrison];
  revealed(s, C.will);
  s = finish(s);
  assert.equal(boss(s).flipped, false);
  assert.equal(s.staging.filter((u) => u.code === C.garrison).length, 1);
});

test("Daechanar's Will shadow flips only after the attacking enemy completes damage", () => {
  let s = base();
  boss(s).feinted = true;
  const g = enemy(s);
  g.shadows = [C.will];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(boss(s).flipped, true);
  assert.ok(s.heroes[0].damage > 0);
});

test("Blight heals the attacker once per in-play copy after every attack", () => {
  let s = base();
  staged(s, C.blight);
  s.activeLocation = make(s, C.blight);
  const g = enemy(s);
  g.damage = 3;
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(get(s, g.id)!.damage, 1);
});

test("Blight travel pays a shadow to every enemy and rejects an unavailable full cost", () => {
  let s = base();
  const l = staged(s, C.blight);
  staged(s, C.garrison);
  s.phase = "travel";
  s.encounterDeck = ["01099"];
  assert.match(canTravel(s, l)!, /shadow card for every enemy/i);
  s.encounterDeck = ["01099", "01099"];
  assert.equal(canTravel(s, l), null);
  s = applyAction(reload(s), { type: "TRAVEL", id: l.id });
  assert.equal(s.activeLocation?.id, l.id);
  assert.equal(boss(s).shadows.length, 1);
  assert.equal(s.staging.find((u) => u.code === C.garrison)!.shadows.length, 1);
});

test("Fortress Walls taxes the fellowship actually spending each resource", () => {
  let s = base(2);
  s.activeLocation = make(s, C.walls);
  forOwner(s, 1, () => spendResources(s, s.heroes[0], 3));
  s = finish(s);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 23);
  forOwner(s, 1, () => {
    s.heroes[0].resources--;
  });
  s = finish(s);
  assert.equal(seatView(s, 1).threat, 23);
});

test("Fortress Walls taxes resources separately so Favor can replace elimination between payments", () => {
  let s = base();
  s.activeLocation = make(s, C.walls);
  s.threat = 49;
  s.threatAttachments = [
    { id: `a${s.nextId++}`, code: "10124", owner: 0, exhausted: false },
  ];
  spendResources(s, s.heroes[0], 3);
  s = finish(s);
  assert.equal(s.status, "playing");
  assert.equal(s.threat, 47);
  assert.equal(s.threatAttachments?.length, 0);
  assert.ok(s.discard.includes("10124"));
  assert.ok(validateSave(s));
});

test("Mountains grants a cancellable +2 threat shadow only to cards lacking printed shadows", () => {
  const s = base();
  s.activeLocation = make(s, C.mountains);
  const e = enemy(s);
  shadowState(s, e);
  assert.match(carnShadowText(s, "01099")!, /Raise.*threat by 2/i);
  shadow(s, "01099");
  flush(s);
  assert.equal(s.threat, 22);
  shadow(s, C.garrison);
  assert.equal(s.combat!.attackBonus, 0);
  assert.equal(s.threat, 22);
});

test("Accursed Battlefield shadow compares strictly higher threat against modified engagement cost", () => {
  const s = base();
  const e = enemy(s);
  shadowState(s, e);
  s.threat = 50;
  shadow(s, C.battlefield);
  assert.equal(s.combat!.attackBonus, 1);
  s.combat!.attackBonus = 0;
  s.threat = 51;
  shadow(s, C.battlefield);
  assert.equal(s.combat!.attackBonus, 3);
});

test("Carn Dûm Garrison threat and shadow attack count every physical shadow", () => {
  const s = base();
  const e = staged(s, C.garrison);
  e.shadows = ["01099", C.garrison, "01099"];
  assert.equal(threatOf(s, e), 4);
  shadowState(s, e);
  shadow(s, C.garrison);
  assert.equal(s.combat!.attackBonus, 3);
});

test("Orc Grunts shadow moves the physical shadow enemy to staging without revealing Doomed or Surge", () => {
  let s = base();
  const g = enemy(s);
  g.shadows = [C.grunts, C.grunts];
  s = defend(s, g, s.heroes[0]);
  s = settle(s);
  assert.equal(s.staging.filter((u) => u.code === C.grunts).length, 2);
  assert.equal(s.threat, 20);
  assert.equal(s.encounterDiscard.filter((c) => c === C.grunts).length, 0);
});

test("The Sky Darkens discards a random hand title and every own deck copy, separately per seat", () => {
  let s = base(2);
  quietBoss(s);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.hand = [make(s, p ? "01016" : "01057")];
      s.deck = ["01057", "01016", "01057", "01016", "01066"];
    });
  revealed(s, C.sky);
  s = finish(s);
  assert.deepEqual(seatView(s, 0).discard.sort(), ["01057", "01057", "01057"]);
  assert.deepEqual(seatView(s, 1).discard.sort(), ["01016", "01016", "01016"]);
  assert.equal(seatView(s, 0).deck.filter((c) => c === "01016").length, 2);
  assert.equal(seatView(s, 1).deck.filter((c) => c === "01057").length, 2);
});

test("Vile Affliction uses each player's own highest printed discard cost and own committed characters", () => {
  let s = base(2);
  quietBoss(s);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.discard = [p ? "01066" : "01016"];
      const h = s.heroes[0];
      h.committed = true;
      s.committedIds = [h.id];
    });
  revealed(s, C.vile);
  s = finish(s);
  assert.equal(seatView(s, 0).heroes[0].damage, Number(card("01016").cost));
  assert.equal(seatView(s, 1).heroes[0].damage, Number(card("01066").cost));
});

test("Vile Affliction shadow searches only the defending player's deck after an actual ally kill", () => {
  let s = base(2);
  const a = ally(s),
    g = enemy(s);
  a.damage = (card(a.code).health ?? 0) - 1;
  g.shadows = [C.vile];
  forOwner(s, 0, () => {
    s.deck = [a.code, a.code, "01057"];
  });
  forOwner(s, 1, () => {
    s.deck = [a.code, a.code];
  });
  s = defend(s, g, a);
  s = settle(s);
  assert.equal(seatView(s, 0).deck.filter((c) => c === a.code).length, 1);
  assert.equal(seatView(s, 1).deck.filter((c) => c === a.code).length, 2);
});

test("reused Dark Sorcery discards matching-title allies without damage or destroyed-character triggers", () => {
  let s = base(2);
  quietBoss(s);
  const a = ally(s),
    other = ally(s, "01018", 1);
  forOwner(s, 0, () => s.discard.push(a.code));
  revealed(s, C.sorcery);
  s = finish(s);
  assert.equal(get(s, a.id), undefined);
  assert.ok(get(s, other.id));
});

test("Terror of the North counts distinct discarded types across all players and stacks only this round", () => {
  let s = base(2);
  quietBoss(s);
  forOwner(s, 0, () => {
    s.deck = ["01016", "01057", "01057"];
  });
  forOwner(s, 1, () => {
    s.deck = ["01066", "01016", "01057"];
  });
  revealed(s, C.terror);
  s = finish(s);
  assert.equal(s.carnDum!.terrorThreat, 6);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.deck = ["01057", "01057", "01057"];
    });
  revealed(s, C.terror);
  s = finish(s);
  assert.equal(s.carnDum!.terrorThreat, 8);
});

test("browser Captain-to-Champion choice is a real save-valid immediate defense window", () => {
  const s = browserFlipChoice();
  assert.equal(boss(s).flipped, true);
  assert.equal(boss(s).shadows.length, 2);
  assert.ok(validateSave(s));
});

test("canceling a Sorcery When Revealed still triggers Captain's revealed-card Forced", () => {
  let s = base();
  const spirit = make(s, "01008");
  spirit.resources = 10;
  s.heroes[2] = spirit;
  s.hand = [make(s, "01050")];
  const g = staged(s, C.garrison);
  revealed(s, C.sky);
  flush(s);
  const cancel = s.choice!.options.find((o) => o.code === "01050")!;
  assert.ok(cancel, JSON.stringify(s.choice));
  s = choose(reload(s), cancel.id);
  assert.equal(boss(s).shadows.length, 1);
  assert.equal(get(s, g.id)!.shadows.length, 1);
  assert.equal(boss(s).flipped, undefined);
  assert.ok(s.discard.includes("01050"));
});

test("Captain's Sorcery Forced flip and four-shadow attack resolve before Heavy Curse Surge", () => {
  let s = base();
  boss(s).shadows = ["01099", "01099"];
  s.encounterDeck = ["01099", "01099", C.garrison];
  revealed(s, C.curse);
  flush(s);
  assert.ok(currentQuestUnit(s)!.attachments.some((a) => a.code === C.curse));
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(boss(s).shadows.length, 4);
  assert.equal(s.staging.filter((u) => u.code === C.garrison).length, 0);
  s = settle(s);
  assert.equal(boss(s).shadows.length, 0);
  assert.equal(s.staging.filter((u) => u.code === C.garrison).length, 1);
});

test("Hasty Stroke can cancel a shadow granted by Mountains of Angmar", () => {
  let s = base();
  s.activeLocation = make(s, C.mountains);
  const spirit = make(s, "01008");
  spirit.resources = 10;
  s.heroes[2] = spirit;
  s.hand = [make(s, "01048")];
  const g = enemy(s);
  g.shadows = ["01099"];
  s = defend(s, g, s.heroes[0]);
  assert.equal(s.choice?.title, "A shadow falls");
  assert.ok(s.choice?.options.some((o) => o.id === "cancel"));
  s = choose(reload(s), "cancel");
  s = settle(s);
  assert.equal(s.threat, 20);
  assert.ok(s.discard.includes("01048"));
  assert.equal(get(s, g.id)!.shadows.length, 0);
});

test("Fortress Walls shadow attacks again at forty threat after finishing the first attack", () => {
  let s = base();
  s.threat = 40;
  s.heroes[0].tempDefense = 20;
  const g = enemy(s);
  g.shadows = [C.walls];
  const before = s.encounterDeck.length;
  s = defend(s, g, s.heroes[0]);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.encounterDiscard.filter((c) => c === C.walls).length, 1);
  assert.equal(s.encounterDeck.length, before - 1);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(get(s, g.id)!.shadows.length, 0);
});

test("each fellowship actually defends its own stage-two Thaurdir normal attack", () => {
  let s = second(base(2));
  for (const p of playerOrder(s))
    forOwner(s, p, () => (s.heroes[0].tempDefense = 20));
  const id = boss(s).id,
    before = s.encounterDeck.length;
  s = defend(s, boss(s), s.heroes[0]);
  s = settle(s);
  assert.equal(s.table!.turn, 1);
  assert.equal(normalAttackPending(s, boss(s), 0), false);
  s = defend(s, boss(s), seatView(s, 1).heroes[0]);
  s = settle(s);
  assert.equal(normalAttackPending(s, boss(s), 1), false);
  assert.equal(s.encounterDeck.length, before - 2);
  assert.equal(s.encounterDiscard.filter((c) => c === "01099").length, 2);
  assert.equal(s.staging.filter((u) => u.id === id).length, 1);
  assert.ok(validateSave(s));
});

test("stage-two round-end flip attacks before old-round Furious penalties expire", () => {
  let s = second();
  boss(s).flipped = false;
  boss(s).damage = 6;
  s.phase = "refresh";
  s.carnDum!.furiousRound = s.round;
  s.carnDum!.furiousPenalty = 2;
  const round = s.round;
  handle(s, fx("endRoundAfterCollector"));
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.round, round);
  assert.equal(boss(s).damage, 3);
  assert.equal(stats(s, s.heroes[0]).defense, 0);
  assert.ok(s.queue.some((e) => e.kind === "endRoundScenarioDone"));
  s = settle(s);
  assert.equal(s.round, round + 1);
  assert.equal(s.phase, "resource");
  assert.equal(stats(s, s.heroes[0]).defense, card(s.heroes[0].code).defense);
});
