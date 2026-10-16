import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, publicState, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, make } from "../src/game/core";
import {
  damage,
  discardAttachment,
  destroy,
  placeEncounter,
  progressLocation,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import { addQuestProgress } from "../src/game/side-quests";
import { mainQuestUnit } from "../src/game/quest-state";
import {
  allEngaged,
  allHeroes,
  forOwner,
  playerOrder,
  syncSeat,
} from "../src/game/table";
import * as S from "../src/game/black-serpent";
import {
  BLACK_SERPENT as B,
  blackSerpentObjectives,
  validateBlackSerpent,
} from "../src/game/black-serpent-support";
import {
  base,
  claim,
  reload,
  setStage,
  settle,
  start,
} from "./black-serpent-fixtures";
for (const players of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Black Serpent native setup ${players} players ${easy ? "easy" : "standard"}`, () => {
      const s = start(players, easy);
      assert.equal(s.blackSerpent!.initialized, true);
      assert.equal(s.blackSerpent!.setAside.length, 2);
      assert.equal(s.staging.filter((u) => u.code === B.serpent).length, 1);
      assert.equal(blackSerpentObjectives(s).length, 1);
      assert.equal(
        s.encounterDeck.length +
          s.encounterDiscard.length +
          s.staging.filter((u) => u.code !== B.serpent).length,
        easy ? 29 : 37,
      );
      assert.ok(validateSave(s));
      const p = publicState(s) as unknown as {
        blackSerpent: { setAside: unknown };
      };
      assert.equal(p.blackSerpent.setAside, 2);
      assert.equal(JSON.stringify(p).includes('"questDeck":['), false);
    });
test("Guarded(X) adds matching type without resolving its When Revealed and conserves objective id", () => {
  let s = base();
  const objective = s.blackSerpent!.setAside.find((u) => u.code === B.summons)!;
  s.blackSerpent!.setAside = s.blackSerpent!.setAside.filter(
    (u) => u.id !== objective.id,
  );
  s.heroes[0].attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
  });
  const now = card(B.bold).code;
  s.encounterDeck = [now, B.bastion];
  S.blackSerpentEffect(
    s,
    fx("blackSerpentReguard", { source: s.heroes[0].id, target: objective.id }),
  );
  assert.deepEqual(s.encounterDiscard, [B.bold]);
  assert.equal(
    s.staging.find((u) => u.code === B.bastion)!.attachments[0].id,
    objective.id,
  );
  assert.equal(s.heroes[0].damage, 0);
  assert.equal(s.queue.length, 0);
  assert.ok(validateSave(s));
});
test("Guard release claims the same physical objective through a serialized first-player hero decision", () => {
  let s = base(2);
  const objective = claim(s, B.banner);
  const a = s.heroes[0].attachments.pop()!;
  const enemy = make(s, B.guard);
  enemy.attachments.push(a);
  s.staging.push(enemy);
  destroy(s, enemy);
  flush(s);
  assert.match(s.choice?.title ?? "", /First player/);
  s = settle(s);
  assert.ok(
    allHeroes(s).some((h) => h.attachments.some((a) => a.id === objective.id)),
  );
  assert.equal(blackSerpentObjectives(s).length, 1);
  assert.ok(validateSave(s));
});
test("Original stages require every in-play objective and stage2 uses five progress", () => {
  let s = base();
  claim(s, B.banner);
  s.encounterDeck = [B.guard, B.bastion];
  s.progress = 6;
  S.blackSerpentAdvance(s);
  flush(s);
  s = settle(s);
  assert.equal(s.stage, 2);
  assert.equal(s.blackSerpent!.setAside.length, 1);
  assert.equal(blackSerpentObjectives(s).length, 2);
  s.progress = 5;
  S.blackSerpentAdvance(s);
  assert.equal(
    s.blackSerpent!.advancing,
    false,
    "guarded objective blocks advancing",
  );
});
test("Serpent protection falls only at six progress on final stage and objectives gate victory", () => {
  let s = base();
  const boss = s.staging[0];
  damage(s, boss.id, 20);
  assert.equal(boss.damage, 0);
  setStage(s, 3);
  s.progress = 5;
  damage(s, boss.id, 20);
  assert.equal(boss.damage, 0);
  s.progress = 6;
  for (const objective of [...s.blackSerpent!.setAside]) {
    s.blackSerpent!.setAside = s.blackSerpent!.setAside.filter(
      (u) => u.id !== objective.id,
    );
    boss.attachments.push({
      id: objective.id,
      code: objective.code,
      exhausted: false,
    });
  }
  assert.equal(S.blackSerpentCannotEngage(s, boss), false);
  damage(s, boss.id, 8);
  flush(s);
  s = settle(s);
  S.blackSerpentAdvance(s);
  assert.equal(s.status, "won");
});
test("Stage2 considered engagements keep one boss and one normal attack per objective controller", () => {
  const s = base(4);
  setStage(s, 2);
  claim(s, B.banner, 0);
  claim(s, B.garb, 2);
  const boss = s.staging[0];
  assert.deepEqual(
    playerOrder(s).filter((p) => S.blackSerpentConsideredEngaged(s, boss, p)),
    [0, 2],
  );
  assert.equal(allEngaged(s).filter((e) => e.code === B.serpent).length, 0);
  assert.equal(s.staging.filter((e) => e.code === B.serpent).length, 1);
  assert.equal(S.blackSerpentSkipShadowDeal(s, boss), true);
  s.encounterDeck = [B.bold, B.chaos];
  assert.equal(S.blackSerpentBeginShadows(s, boss), true);
  assert.deepEqual(boss.shadows, [B.bold]);
  S.blackSerpentFinishShadows(s, boss);
  S.blackSerpentBeginShadows(s, boss);
  assert.deepEqual(boss.shadows, [B.chaos]);
  assert.deepEqual(s.encounterDiscard, [B.bold]);
});
test("Broken Courtyard caps main progress; Chaos blocks main and side quests only this round", () => {
  const s = base();
  s.staging.push(make(s, B.courtyard));
  addQuestProgress(s, mainQuestUnit(s)!, 30);
  assert.equal(s.progress, 6);
  const side = make(s, B.escape);
  s.staging.push(side);
  S.blackSerpentEffect(s, fx("blackSerpentBlockProgress"));
  addQuestProgress(s, side, 3);
  assert.equal(side.progress, 0);
  s.round++;
  addQuestProgress(s, side, 3);
  assert.equal(side.progress, 3);
});
test("Southron Camp clears active and staged location progress while escape side quest clears main progress", () => {
  const s = base();
  s.staging.push(make(s, B.camp), make(s, B.escape));
  const loc = make(s, B.bastion);
  loc.progress = 2;
  s.activeLocation = loc;
  s.staging.find((u) => u.code === B.camp)!.progress = 1;
  s.progress = 4;
  for (const e of S.blackSerpentRoundEnd(s)) S.blackSerpentEffect(s, e);
  assert.equal(s.progress, 0);
  assert.equal(loc.progress, 0);
  assert.equal(s.staging.find((u) => u.code === B.camp)!.progress, 0);
});
test("Serpent Guard shields the engaged player only for its recorded round", () => {
  let s = base(2);
  const guard = make(s, B.guard);
  s.engaged.push(guard);
  S.blackSerpentEngaged(s, guard);
  flush(s);
  assert.equal(
    s.choice!.options.some((o) => o.id === "progress"),
    false,
  );
  s = settle(s, "other");
  const target = s.engaged.find((u) => u.id === guard.id)!;
  assert.equal(S.blackSerpentDamageAmount(s, target, 3), 0);
  s.round++;
  assert.equal(S.blackSerpentDamageAmount(s, target, 3), 3);
});
test("Encounter cancellation bypasses Bold damage, No Quarter and Chaos effects", () => {
  for (const code of [B.bold, B.quarter, B.chaos]) {
    const s = base();
    claim(s);
    const hp = s.heroes[0].damage;
    placeEncounter(s, code, true, 0, undefined, true);
    assert.equal(s.queue.length, 0);
    assert.equal(s.heroes[0].damage, hp);
    assert.ok(s.encounterDiscard.includes(code));
  }
});
test("Southron Champion marks a physical Harad guard and blocks its damage/quest until four side progress", () => {
  let s = base();
  s.encounterDeck = [B.bold, B.guard];
  placeEncounter(s, B.champion, false, 0, undefined, true);
  flush(s);
  s = settle(s);
  const enemy = s.staging.find((u) => u.code === B.guard)!,
    quest = s.staging.find((u) => u.code === B.champion)!;
  assert.equal(enemy.resources, 1);
  damage(s, enemy.id, 10);
  assert.equal(enemy.damage, 0);
  quest.progress = 4;
  assert.equal(S.blackSerpentDamageAmount(s, enemy, 3), 3);
  assert.equal(S.blackSerpentImmune(s, enemy), true);
  assert.equal(S.blackSerpentSideDefeatBlocked(s, quest), true);
});
test("Save validator rejects duplicate objective identity, malformed markers and reordered quest chain", () => {
  const s = base();
  assert.ok(validateSave(s));
  for (const mutate of [
    (s: typeof s) => {
      s.blackSerpent!.setAside[1].id = s.blackSerpent!.setAside[0].id;
    },
    (s: typeof s) => {
      s.blackSerpent!.questDeck.reverse();
    },
    (s: typeof s) => {
      s.blackSerpent!.noProgressRound = s.round + 1;
    },
    (s: typeof s) => {
      s.blackSerpent!.modifiers.push({
        kind: "banner",
        target: "0",
        round: s.round,
        phase: "invalid" as never,
      });
    },
  ]) {
    const bad = structuredClone(s);
    mutate(bad);
    assert.equal(
      validateBlackSerpent(bad, () => true),
      false,
    );
    assert.equal(validateSave(bad), false);
  }
});

import { serpentShadow } from "./black-serpent-browser-fixtures";
for (const code of [
  B.guard,
  B.bastion,
  B.courtyard,
  B.bold,
  B.quarter,
  B.chaos,
])
  test(`Native defense resolves ${card(code).name} shadow with reloadable continuations`, () => {
    const f = serpentShadow(code);
    let s = applyAction(reload(f.s), {
      type: "DEFEND",
      enemyId: f.enemy.id,
      defenderId: f.defender.id,
    });
    s = settle(s);
    assert.equal(s.status, "playing");
    assert.ok(validateSave(s));
  });
test("Chaos and No Quarter shadow riders trigger only on actual combat destruction", () => {
  let s = base();
  claim(s, B.banner);
  const enemy = make(s, B.guard),
    location = make(s, B.bastion);
  s.engaged.push(enemy);
  s.staging.push(location);
  s.phase = "defense";
  s.progress = 4;
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: s.heroes[0].id,
    attackBonus: 0,
  };
  S.blackSerpentShadow(s, B.chaos);
  S.blackSerpentShadow(s, B.quarter);
  const completed = s.combat!;
  S.blackSerpentAttackFinished(s, completed);
  assert.equal(s.progress, 4);
  assert.equal(s.queue.length, 0);
  S.blackSerpentCharacterDestroyed(s, s.heroes[1], {
    combatDamage: true,
    enemyId: enemy.id,
  });
  S.blackSerpentAttackFinished(s, completed);
  assert.equal(s.progress, 0);
  flush(s);
  s = settle(s);
  const held = s.staging.find((u) => u.id === location.id)!;
  assert.equal(held.attachments.length, 1);
  assert.equal(held.attachments[0].code, B.banner);
});

for (const code of [B.quarter, B.chaos])
  test(`Native lethal defense resolves ${card(code).name} after-attack rider`, () => {
    const f = serpentShadow(code);
    f.defender.tempDefense = -(card(f.defender.code).defense ?? 0);
    f.defender.damage = (card(f.defender.code).health ?? 1) - 1;
    f.s.progress = 4;
    const location = make(f.s, B.bastion);
    f.s.staging.push(location);
    syncSeat(f.s);
    let s = applyAction(reload(f.s), {
      type: "DEFEND",
      enemyId: f.enemy.id,
      defenderId: f.defender.id,
    });
    s = settle(s);
    assert.equal(
      allHeroes(s).some((u) => u.id === f.defender.id),
      false,
    );
    if (code === B.chaos) assert.equal(s.progress, 0);
    else
      assert.equal(
        s.staging.find((u) => u.id === location.id)!.attachments[0].code,
        B.banner,
      );
    assert.ok(validateSave(s));
  });

test("Stage2 virtual boss receives Captain and Banner modifiers only for the player being attacked", () => {
  const s = base(3);
  setStage(s, 2);
  claim(s, B.banner, 0);
  claim(s, B.garb, 2);
  const boss = s.staging.find((u) => u.code === B.serpent)!;
  forOwner(s, 2, () => s.engaged.push(make(s, B.captain)));
  s.combat = {
    enemyId: boss.id,
    attackPlayer: 2,
    defenderId: null,
    attackBonus: 0,
  };
  assert.equal(S.blackSerpentStats(s, boss).attack, 3);
  s.blackSerpent!.modifiers.push({
    kind: "banner",
    target: "0",
    round: s.round,
    phase: s.phase,
  });
  assert.equal(S.blackSerpentStats(s, boss).attack, 3);
  s.combat.attackPlayer = 0;
  assert.equal(S.blackSerpentStats(s, boss).attack, 1);
});

test("Claimed Garb protects no hero; encounter-held objectives apply their text on a side quest too", () => {
  const s = base();
  claim(s, B.garb);
  const hero = s.heroes[0];
  assert.equal(S.blackSerpentImmune(s, hero), false);
  assert.equal(S.blackSerpentThreatBonus(s, hero), 0);
  const side = make(s, B.escape);
  s.staging.push(side);
  const attachment = hero.attachments.find((a) => a.code === B.garb)!;
  hero.attachments = hero.attachments.filter((a) => a.id !== attachment.id);
  side.attachments.push(attachment);
  assert.equal(S.blackSerpentImmune(s, side), true);
  assert.equal(S.blackSerpentThreatBonus(s, side), 2);
  const summon = claim(s, B.summons);
  const a = hero.attachments.find((a) => a.id === summon.id)!;
  hero.attachments = hero.attachments.filter((b) => b.id !== a.id);
  side.attachments.push(a);
  assert.equal(S.blackSerpentThreatReductionBlocked(s), true);
});
