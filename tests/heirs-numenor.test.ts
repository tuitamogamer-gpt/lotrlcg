import assert from "node:assert/strict";
import test from "node:test";
import { applyAction as act } from "./pass-resource-window.ts";
import {
  createGame,
  restoreSave,
  validateSave,
  optionalEngagementProblem,
  canPlay,
  playTargets,
  availableAbilities,
  canTravel,
} from "../src/game/engine";
import { STARTERS, card, SCRIPTED } from "../src/game/cards";
import {
  advanceQuest,
  check,
  damage,
  discardCharacter,
  discardAttachment,
  engage,
  phaseEnd,
  placeEncounter,
  progressLocation,
  raiseThreat,
  resolveReveal,
  shadow,
} from "../src/game/board";
import {
  combatDamage,
  beginEnemyAttack,
  playerAttack,
  resolvePlayerAttack,
} from "../src/game/combat";
import {
  fx,
  get,
  make,
  stats,
  questWill,
  threatOf,
  engagementCost,
  stagingThreat,
  canPay,
} from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  playerOrder,
  seatView,
  selectSeat,
  syncSeat,
  defendersFor,
} from "../src/game/table";
import {
  HEIRS_NUMENOR as H,
  HEIRS_NUMENOR_ENCOUNTERS,
  HEIRS_NUMENOR_QUESTS,
} from "../src/game/heirs-numenor-support";
import type { GameState, ScenarioId, Unit } from "../src/game/types";
import { KHAZAD } from "../src/game/khazad-dum";
const choose = (s: GameState, id: string) => act(s, { type: "CHOOSE", id });
function settle(s: GameState) {
  for (let i = 0; i < 500 && s.status === "playing"; i++) {
    if (s.choice)
      s = choose(
        s,
        s.choice.options.find((o) => ["skip", "resolve", "done"].includes(o.id))
          ?.id ?? s.choice.options[0].id,
      );
    else if (s.phase === "setup") s = act(s, { type: "KEEP" });
    else break;
  }
  return s;
}
function start(
  id: ScenarioId = "peril-in-pelargir",
  players = 1,
  easy = false,
) {
  const d = STARTERS[0];
  return createGame(3, d.cards, d.heroes, d.id, {
    scenarioId: id,
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
}
function base(players = 1, scenario: ScenarioId = "peril-in-pelargir") {
  let s = settle(start(scenario, players));
  Object.assign(s, {
    phase: "planning",
    status: "playing",
    stage: 1,
    stageRevealing: false,
    progress: 0,
    queue: [],
    choice: null,
    staging: [],
    activeLocation: null,
    extraActiveLocations: [],
    encounterDeck: Array(20).fill(H.bandit),
    encounterDiscard: [],
    victory: 0,
    victoryCards: [],
    heirsNumenor: { removedStages: [], mumakDamage: {} },
  });
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.threat = 20;
      s.hand = [];
      s.allies = [];
      s.engaged = [];
      s.used = [];
      s.committedIds = [];
      for (const h of s.heroes)
        Object.assign(h, {
          damage: 0,
          resources: 10,
          exhausted: false,
          committed: false,
          attachments: [],
          tempAttack: 0,
          tempDefense: 0,
          tempWill: 0,
        });
    });
  selectSeat(s, 0);
  syncSeat(s);
  return s;
}
function attach(s: GameState, host: Unit, code: string) {
  const a = { id: `a${s.nextId++}`, code, exhausted: false };
  host.attachments.push(a);
  return a;
}
function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
function engaged(s: GameState, code: string, player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.engaged.push(u);
  });
  return u;
}
function reveal(s: GameState, code: string) {
  resolveReveal(s, code);
  flush(s);
  if (s.choice?.options.some((o) => o.id === "resolve"))
    s = choose(s, "resolve");
  return s;
}
function saved(s: GameState) {
  syncSeat(s);
  assert.ok(validateSave(s));
  const restored = restoreSave(JSON.parse(JSON.stringify(s)));
  assert.ok(restored);
  return restored!;
}
function scrollCount(s: GameState) {
  return (
    s.staging.filter((u) => u.code === H.scroll).length +
    [...allHeroes(s), ...allEngaged(s), ...s.staging].reduce(
      (n, u) => n + u.attachments.filter((a) => a.code === H.scroll).length,
      0,
    )
  );
}

test("Heirs definitions preserve twelve printed quest backs, Battle/Siege/Archery and official easy quantities", () => {
  assert.equal(HEIRS_NUMENOR_QUESTS.length, 12);
  assert.equal(HEIRS_NUMENOR_ENCOUNTERS.length, 41);
  assert.match(card(H.fishQuest).back_text!, /^Battle\./);
  assert.match(card(H.fighting).back_text!, /^Battle\./);
  assert.match(card(H.counterAttack).back_text!, /^Siege\. Archery X/);
  assert.ok(!card(H.power).text!.includes("Then"));
  for (const c of [...HEIRS_NUMENOR_ENCOUNTERS, ...HEIRS_NUMENOR_QUESTS])
    assert.ok(SCRIPTED.has(c.code), c.name);
});
for (const easy of [false, true])
  for (const players of [1, 2, 3, 4])
    test(`${players}-player ${easy ? "easy" : "normal"} Peril setup attaches one physical Scroll and searches exactly one Thug per player`, () => {
      let s = start("peril-in-pelargir", players, easy);
      assert.match(s.choice!.title, /Alcaron's Scroll/);
      s = choose(s, s.choice!.options[0].id);
      s = settle(s);
      assert.equal(s.activeLocation?.code, H.fish);
      assert.equal(s.staging.filter((u) => u.code === H.thug).length, players);
      assert.equal(
        s.encounterDeck.filter((c) => c === H.thug).length,
        5 - players,
      );
      assert.equal(scrollCount(s), 1);
      assert.equal(
        s.encounterDeck.filter((c) => c === H.assassin).length,
        easy ? 0 : 1,
      );
      assert.equal(
        s.encounterDeck.filter((c) => c === H.docks).length,
        easy ? 0 : 2,
      );
      assert.ok(validateSave(s));
    });
test("Scroll claims exhaust a controlled ready hero, transfer after actual enemy damage before lethal departure, and retain physical identity", () => {
  let s = base(2);
  const scroll = staged(s, H.scroll),
    hero = s.heroes[0];
  s = act(s, { type: "CLAIM", id: scroll.id, heroId: hero.id });
  assert.equal(s.heroes[0].exhausted, true);
  assert.equal(s.threat, 20);
  assert.equal(s.heroes[0].attachments[0].id, scroll.id);
  const enemy = engaged(s, H.thug);
  combatDamage(s, s.heroes[0], enemy, 20);
  assert.equal(enemy.attachments[0].id, scroll.id);
  assert.equal(scrollCount(s), 1);
  damage(s, enemy.id, 20);
  flush(s);
  assert.equal(s.staging.find((u) => u.code === H.scroll)?.id, scroll.id);
  assert.equal(scrollCount(s), 1);
  s = saved(s);
  assert.equal(scrollCount(s), 1);
});
test("Scroll ignores prevented damage and returns when its hero or attachment leaves without an enemy attack", () => {
  const s = base(),
    h = s.heroes[0],
    a = attach(s, h, H.scroll),
    e = engaged(s, H.thug);
  h.shadowCancelsCombatDamage = true;
  combatDamage(s, h, e, 2);
  assert.equal(h.attachments[0].id, a.id);
  discardAttachment(s, h, a);
  assert.equal(s.staging[0].id, a.id);
  s.staging = [];
  const b = attach(s, h, H.scroll);
  discardCharacter(s, h);
  assert.equal(s.staging[0].id, b.id);
});
test("Harbor Thug follows threat increases of the Scroll bearer across seats and blanked Thugs do not trigger", () => {
  const s = base(2),
    bearer = seatView(s, 1).heroes[0];
  attach(s, bearer, H.scroll);
  const a = staged(s, H.thug),
    b = engaged(s, H.thug, 0),
    blank = staged(s, H.thug);
  attach(s, blank, KHAZAD.fear);
  raiseThreat(s, 1, "cost");
  flush(s);
  assert.ok(s.staging.some((u) => u.id === a.id));
  forOwner(s, 1, () => raiseThreat(s, 1, "framework"));
  flush(s);
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === a.id));
  assert.ok(seatView(s, 1).engaged.some((u) => u.id === b.id));
  assert.ok(s.staging.some((u) => u.id === blank.id));
});
test("Collateral Damage counts copies after its initial two discards, each top-discarded location triggers Storehouse, and source remains outside discard", () => {
  let s = base(2);
  staged(s, H.storehouse);
  staged(s, H.storehouse);
  s.encounterDiscard = [H.collateral];
  s.encounterDeck = [
    H.collateral,
    H.docks,
    H.bandit,
    H.fish,
    H.bandit,
    H.docks,
    H.bandit,
  ];
  s = reveal(s, H.collateral);
  assert.equal(s.encounterDeck.length, 1);
  assert.equal(s.encounterDiscard.filter((c) => c === H.collateral).length, 3);
  assert.equal(seatView(s, 0).threat, 32);
  assert.equal(seatView(s, 1).threat, 32);
});
test("Leaping Fish top-discard is not revelation and adds enemies once while Storehouse triggers for discarded locations", () => {
  let s = base(2);
  attach(s, s.heroes[0], H.scroll);
  s.activeLocation = make(s, H.fish);
  staged(s, H.storehouse);
  s.encounterDeck = [H.bandit, H.docks, H.thug];
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  assert.ok(s.staging.some((u) => u.code === H.bandit));
  assert.deepEqual(s.encounterDeck, [H.thug]);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  assert.deepEqual(s.encounterDiscard, [H.docks]);
});
test("Peril stage two first-player tie choice takes Scroll, progress gate requires a hero, stage-three search is not revelation", () => {
  let s = base(2);
  attach(s, s.heroes[0], H.scroll);
  const e = staged(s, H.bandit),
    f = staged(s, H.bandit);
  s.phase = "quest";
  s.progress = 6;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  assert.match(s.choice!.title, /highest engagement/);
  s = saved(s);
  s = choose(s, f.id);
  assert.equal(get(s, f.id)?.attachments[0].code, H.scroll);
  s.progress = 13;
  advanceQuest(s);
  assert.equal(s.stage, 2);
  damage(s, f.id, 20);
  flush(s);
  const scroll = s.staging.find((u) => u.code === H.scroll)!;
  s = act(s, { type: "CLAIM", id: scroll.id, heroId: s.heroes[0].id });
  assert.equal(s.stage, 3);
  assert.ok(
    s.choice,
    JSON.stringify({
      queue: s.queue,
      log: s.log.slice(-7),
      staging: s.staging.map((u) => u.code),
    }),
  );
  assert.match(s.choice!.title, /enemy/);
  s = saved(s);
  s = choose(s, s.choice!.options[0].id);
  s = choose(s, s.choice!.options[0].id);
  assert.equal(s.stageRevealing, false);
  assert.equal(s.combat, null);
  s.phase = "encounter";
  assert.match(
    optionalEngagementProblem(
      s,
      s.staging.find((u) => u.id === e.id)!,
    ),
    /optional/,
  );
});
test("Peril stage-three first revealed enemy attacks Scroll controller once per round and saves the pending defender decision", () => {
  let s = base(2);
  s.stage = 3;
  attach(s, seatView(s, 1).heroes[0], H.scroll);
  s = reveal(s, H.bandit);
  assert.equal(s.combat?.attackPlayer, 1);
  assert.match(s.choice!.title, /Immediate attack/);
  const id = s.combat!.enemyId;
  s = saved(s);
  s = choose(s, s.choice!.options.find((o) => o.id !== "undefended")!.id);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.id === id));
  s = reveal(s, H.bandit);
  assert.equal(s.choice, null);
  assert.equal(s.combat, null);
});
test("Pelargir Docks active continuous enemy attack/defense respects active location departure and blanking", () => {
  const s = base(),
    e = staged(s, H.bandit);
  s.activeLocation = make(s, H.docks);
  assert.equal(stats(s, e).attack, 4);
  assert.equal(stats(s, e).defense, 4);
  attach(s, s.activeLocation, KHAZAD.fear);
  assert.equal(stats(s, e).attack, 3);
  s.activeLocation = null;
  assert.equal(stats(s, e).defense, 3);
});
test("Brigands optional and forced engagement costs affect only the engaged seat, with capped resource discards", () => {
  const s = base(2);
  const b = staged(s, H.bandit);
  s.heroes[0].resources = 0;
  s.heroes[1].resources = 1;
  engage(s, b, true);
  flush(s);
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [0, 0, 9],
  );
  const forced = staged(s, H.bandit);
  forOwner(s, 1, () => engage(s, forced, false));
  flush(s);
  assert.deepEqual(
    seatView(s, 1).heroes.map((h) => h.resources),
    [8, 8, 8],
  );
});
test("Umbar Assassin distinguishes optional hero damage from forced hero discard, preserving a reloadable owner decision", () => {
  let s = base(2);
  const a = staged(s, H.assassin);
  forOwner(s, 1, () => engage(s, a, true));
  flush(s);
  assert.equal(s.table?.active, 1);
  s = saved(s);
  const h = s.heroes[0];
  s = choose(s, h.id);
  assert.equal(get(s, h.id)?.damage, 3);
  const b = staged(s, H.assassin);
  engage(s, b, false);
  flush(s);
  const doomed = s.heroes[1];
  s = choose(s, doomed.id);
  assert.ok(!get(s, doomed.id));
  assert.ok(s.discard.includes(doomed.code));
});
test("Zealous Traitor deals one or two damage to controlled allies and Lurking returns actual Brigands, then gains surge only when none returned", () => {
  let s = base(2);
  const ally = make(s, "01014");
  s.allies.push(ally);
  const traitor = staged(s, H.traitor);
  engage(s, traitor, true);
  flush(s);
  assert.equal(ally.damage, 1);
  const traitor2 = staged(s, H.traitor);
  engage(s, traitor2, false);
  flush(s);
  assert.equal(ally.damage, 3);
  const other = engaged(s, H.thug);
  s = reveal(s, H.lurking);
  assert.ok(s.staging.some((u) => u.id === traitor.id));
  assert.ok(s.engaged.some((u) => u.id === other.id));
  s.encounterDeck = [H.bandit];
  s = reveal(s, H.lurking);
  assert.equal(s.encounterDeck.length, 0);
  assert.ok(s.staging.some((u) => u.code === H.bandit));
});
test("Archery adds all sources in staging and engagement and splits actual damage across both seats through save/reload", () => {
  let s = base(2);
  s.phase = "encounter";
  staged(s, H.assassin);
  engaged(s, H.assassin, 1);
  staged(s, H.mercenaries);
  s.encounterDeck = [];
  s = act(s, { type: "NEXT" });
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Archery.*6 remaining/);
  s = saved(s);
  const h0 = seatView(s, 0).heroes[0].id,
    h1 = seatView(s, 1).heroes[0].id;
  for (let i = 0; i < 6; i++) s = choose(s, i % 2 ? h1 : h0);
  assert.equal(get(s, h0)?.damage, 3);
  assert.equal(get(s, h1)?.damage, 3);
});
test("staging objective allies contribute Battle attack, are damageable quest characters, and controlled Rangers become ordinary uncommitted allies", () => {
  let s = base(1, "into-ithilien");
  const c = staged(s, H.celador),
    g = staged(s, H.guardian);
  check(s);
  assert.equal(c.committed, true);
  assert.equal(g.committed, true);
  assert.equal(questWill(s), stats(s, c).attack + stats(s, g).attack);
  s = reveal(s, H.wargs);
  assert.equal(get(s, c.id)?.damage, 1);
  assert.equal(get(s, g.id)?.damage, 1);
  s.queue = [];
  s.choice = null;
  s.progress = 15;
  s.phase = "quest";
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  assert.ok(s.allies.some((u) => u.id === c.id));
  assert.equal(get(s, c.id)?.committed, false);
});
test("Mumak damage cap counts actual damage across packets and save/reload, resets at round end, and disallows attachments", () => {
  let s = base(1, "into-ithilien"),
    m = staged(s, H.mumak);
  damage(s, m.id, 2);
  damage(s, m.id, 4);
  assert.equal(m.damage, 3);
  s = saved(s);
  m = get(s, m.id)!;
  damage(s, m.id, 1);
  assert.equal(m.damage, 3);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  damage(s, m.id, 4);
  assert.equal(get(s, m.id)?.damage, 6);
  assert.ok(!playTargets(s, make(s, "01056")).some((u) => u.id === m.id));
});
test("Battleground damage removes only its threshold location without victory and immediately advances Defense when none remain", () => {
  const s = base(1, "siege-of-cair-andros");
  s.phase = "quest";
  const b = staged(s, H.banks),
    a = staged(s, H.approach),
    c = staged(s, H.citadel);
  damage(s, b.id, 3);
  assert.ok(!get(s, b.id));
  assert.equal(s.victory, 0);
  assert.equal(s.stage, 1);
  damage(s, a.id, 7);
  damage(s, c.id, 11);
  assert.equal(s.stage, 2);
  assert.equal(s.victory, 0);
  assert.ok(s.removed.includes(H.banks));
  assert.ok(s.removed.includes(H.approach));
  assert.ok(s.removed.includes(H.citadel));
});
test("Forest Bat gives the first player a questing hero choice across seats and deals damage while removing only that hero", () => {
  let s = base(2, "into-ithilien");
  for (const h of allHeroes(s)) h.committed = h.code !== "01006";
  const victim = seatView(s, 1).heroes[0];
  s = reveal(s, H.bat);
  assert.ok(
    s.choice,
    JSON.stringify({
      queue: s.queue,
      log: s.log.slice(-7),
      heroes: allHeroes(s).map((h) => [h.code, h.committed]),
    }),
  );
  assert.match(s.choice!.title, /Forest Bat/);
  s = saved(s);
  s = choose(s, victim.id);
  assert.equal(get(s, victim.id)?.damage, 2);
  assert.equal(get(s, victim.id)?.committed, false);
  assert.equal(allHeroes(s).filter((h) => h.committed).length, 4);
});
test("Lost Companion resolves separate controller choices and its final empty-player condition removes all remaining player questers", () => {
  let s = base(2, "into-ithilien");
  s.heroes[0].committed = true;
  for (const h of seatView(s, 1).heroes) h.committed = true;
  s = reveal(s, H.lostCompanion);
  s = saved(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.table?.active, 1);
  s = choose(s, s.heroes[0].id);
  assert.ok(allHeroes(s).every((h) => !h.committed));
});
test("Watcher in the Wood counts all questing characters for every player and surges only under Battle or Siege", () => {
  let s = base(2, "into-ithilien");
  for (const h of allHeroes(s)) h.committed = true;
  s.encounterDeck = [H.bandit];
  s = reveal(s, H.watcher);
  assert.equal(seatView(s, 0).threat, 26);
  assert.equal(seatView(s, 1).threat, 26);
  assert.equal(s.encounterDeck.length, 0);
  s = base(2, "into-ithilien");
  s.stage = 3;
  s.heroes[0].committed = true;
  s.encounterDeck = [H.bandit];
  s = reveal(s, H.watcher);
  assert.equal(seatView(s, 0).threat, 21);
  assert.equal(seatView(s, 1).threat, 21);
  assert.equal(s.encounterDeck.length, 1);
});
test("Morgul Spider recalculates its encounter lasting attack value as commitment and characters change and the bonus expires at round end", () => {
  let s = base(1, "into-ithilien");
  s.heroes[0].committed = true;
  s = reveal(s, H.spider);
  const spider = s.staging.find((u) => u.code === H.spider)!;
  assert.equal(stats(s, spider).attack, (card(H.spider).attack ?? 0) + 2);
  s.heroes[1].committed = true;
  assert.equal(stats(s, spider).attack, (card(H.spider).attack ?? 0) + 1);
  s.allies.push(make(s, "01014"));
  assert.equal(stats(s, spider).attack, (card(H.spider).attack ?? 0) + 2);
  s = saved(s);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, get(s, spider.id)!).attack, card(H.spider).attack);
});
test("Ithilien Road changes only staging enemy engagement costs; Southron Company uses current Battle/Siege including conditional Siege", () => {
  const s = base(2, "into-ithilien"),
    e = staged(s, H.company),
    eng = engaged(s, H.bandit);
  s.activeLocation = make(s, H.road);
  assert.equal(engagementCost(s, e), 0);
  assert.equal(engagementCost(s, eng), 24);
  assert.equal(threatOf(s, e), (card(H.company).threat ?? 0) + 2);
  assert.equal(stats(s, e).attack, (card(H.company).attack ?? 0) + 2);
  s.stage = 4;
  assert.equal(threatOf(s, e), card(H.company).threat);
  forOwner(s, 1, () => {
    s.threat = 37;
  });
  assert.equal(threatOf(s, e), (card(H.company).threat ?? 0) + 2);
  s.activeLocation = null;
  assert.equal(engagementCost(s, e), card(H.company).engagement);
});
test("Haradrim Elite Forced attack triggers when put into staging without revelation and remains separate from normal attacks", () => {
  let s = base(2, "into-ithilien");
  placeEncounter(s, H.elite, true);
  flush(s);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.equal(s.combat?.attackPlayer, 0);
  const id = s.combat!.enemyId;
  s = saved(s);
  s = choose(s, s.choice!.options.find((o) => o.id !== "undefended")!.id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(get(s, id)?.attacked, false);
  assert.ok(s.staging.some((u) => u.id === id));
});
test("Into Ithilien branches through Siege/Archery stage two when Celador leaves, then skips Hidden Way and applies each player's end-round threat", () => {
  let s = base(2, "into-ithilien"),
    c = staged(s, H.celador);
  check(s);
  damage(s, c.id, 3);
  flush(s);
  assert.ok(s.removed.includes(H.celador));
  assert.ok(!s.encounterDiscard.includes(H.celador));
  s.phase = "quest";
  s.progress = 15;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 2);
  s.progress = 9;
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 4);
  for (const h of allHeroes(s)) h.committed = true;
  s.phase = "staging";
  forOwner(s, 1, () => {
    s.threat = 37;
  });
  assert.equal(
    questWill(s),
    allHeroes(s).reduce((n, h) => n + stats(s, h).defense, 0),
  );
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 39);
});
test("Celador suffers one damage for each actual character leaving play and survives saved controlled-ally state", () => {
  let s = base(2, "into-ithilien"),
    c = staged(s, H.celador);
  check(s);
  const a = make(s, "01014");
  s.allies.push(a);
  discardCharacter(s, a);
  flush(s);
  assert.equal(c.damage, 1);
  s.progress = 15;
  s.phase = "quest";
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 3);
  s = saved(s);
  const hero = seatView(s, 1).heroes[0];
  forOwner(s, 1, () => discardCharacter(s, hero));
  flush(s);
  assert.equal(get(s, c.id)?.damage, 2);
});
test("Orc Assault's encounter lasting penalty affects characters entering later, survives source discard, and expires at round end", () => {
  let s = base(1, "siege-of-cair-andros");
  s.stage = 2;
  s = reveal(s, H.assault);
  const h = s.heroes[0];
  assert.equal(stats(s, h).attack, Math.max(0, (card(h.code).attack ?? 0) - 2));
  const ally = make(s, "01014");
  s.allies.push(ally);
  assert.equal(
    stats(s, ally).attack,
    Math.max(0, (card(ally.code).attack ?? 0) - 2),
  );
  assert.equal(
    stats(s, ally).defense,
    Math.max(0, (card(ally.code).defense ?? 0) - 2),
  );
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(stats(s, get(s, ally.id)!).attack, card(ally.code).attack);
});
test("Siege Battleground exploration offers an optional saved future-stage removal and skips only selected stages", () => {
  let s = base(1, "siege-of-cair-andros"),
    banks = staged(s, H.banks),
    approach = staged(s, H.approach),
    citadel = staged(s, H.citadel);
  s.phase = "quest";
  progressLocation(s, banks, 3);
  flush(s);
  assert.match(s.choice!.title, /Remove stage 2/);
  s = saved(s);
  s = choose(s, "remove");
  progressLocation(s, get(s, approach.id)!, 7);
  flush(s);
  s = choose(s, "skip");
  damage(s, get(s, citadel.id)!.id, 11);
  flush(s);
  assert.equal(s.stage, 3);
  assert.equal(s.victory, 3);
  assert.deepEqual(s.heirsNumenor?.removedStages, [2]);
});
test("Siege stage three replaces failed-quest threat with each controller discarding one character and stage four adds five staging threat", () => {
  let s = base(2, "siege-of-cair-andros");
  s.stage = 3;
  s.phase = "staging";
  staged(s, H.bandit);
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Discard a character/);
  s = saved(s);
  s = choose(s, s.heroes[0].id);
  assert.equal(s.table?.active, 1);
  s = choose(s, s.heroes[0].id);
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(seatView(s, 1).threat, 20);
  s.stage = 4;
  assert.equal(stagingThreat(s), 8);
});
test("Last Battle switches from Siege to Battle at four victory points and stage arrival reveals one card per player", () => {
  let s = base(2, "siege-of-cair-andros");
  s.stage = 4;
  s.phase = "quest";
  s.progress = 5;
  s.encounterDeck = [H.bandit, H.bandit, H.bandit];
  advanceQuest(s);
  flush(s);
  assert.equal(s.stage, 5);
  assert.equal(s.staging.length, 2);
  assert.equal(s.encounterDeck.length, 1);
  for (const h of allHeroes(s)) h.committed = true;
  assert.equal(
    questWill(s),
    allHeroes(s).reduce((n, h) => n + stats(s, h).defense, 0),
  );
  s.victory = 4;
  assert.equal(
    questWill(s),
    allHeroes(s).reduce((n, h) => n + stats(s, h).attack, 0),
  );
});

test("neutral Heirs hooks leave unrelated games and their round changes free of Heirs state", () => {
  const d = STARTERS[0];
  let s = settle(createGame(3, d.cards, d.heroes, d.id));
  stats(s, s.heroes[0]);
  check(s);
  phaseEnd(s);
  assert.equal(s.heirsNumenor, undefined);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.equal(s.heirsNumenor, undefined);
  assert.ok(validateSave(s));
});

for (const easy of [false, true])
  for (const players of [1, 2, 3, 4]) {
    test(`${players}-player ${easy ? "easy" : "normal"} Ithilien setup preserves committed Celador, one Road and exactly one Company per player`, () => {
      const s = start("into-ithilien", players, easy);
      assert.equal(s.activeLocation?.code, H.road);
      assert.equal(s.staging.filter((u) => u.code === H.celador).length, 1);
      assert.equal(
        s.staging.find((u) => u.code === H.celador)?.committed,
        true,
      );
      assert.equal(
        s.staging.filter((u) => u.code === H.company).length,
        players,
      );
      assert.equal(s.encounterDeck.filter((c) => c === H.celador).length, 0);
      assert.equal(
        s.encounterDeck.filter((c) => c === H.company).length,
        4 - players,
      );
      assert.ok(validateSave(s));
    });
    test(`${players}-player ${easy ? "easy" : "normal"} Siege setup retains one of each physical Battleground outside the shuffled deck`, () => {
      const s = start("siege-of-cair-andros", players, easy);
      for (const code of [H.banks, H.approach, H.citadel]) {
        assert.equal(s.staging.filter((u) => u.code === code).length, 1);
        assert.equal(s.encounterDeck.filter((c) => c === code).length, 0);
      }
      assert.equal(s.victory, 0);
      assert.ok(validateSave(s));
    });
  }

test("Thalin's defeated first revealed enemy consumes Peril's once-per-round attack trigger without making the second enemy attack", () => {
  let s = base(2);
  s.stage = 3;
  s.phase = "staging";
  attach(s, s.heroes[0], H.scroll);
  allHeroes(s).find((h) => h.code === "01006")!.committed = true;
  s = reveal(s, "01115");
  assert.equal(s.heirsNumenor?.firstEnemyRound, s.round);
  assert.equal(s.combat, null);
  s = reveal(s, H.bandit);
  assert.equal(s.combat, null);
  assert.ok(!s.choice);
});
test("Lieutenant prohibits controlled and Sentinel ally defenders, permits heroes, and loses the restriction when blanked", () => {
  const s = base(2, "siege-of-cair-andros");
  s.stage = 2;
  s.phase = "defense";
  const e = engaged(s, H.lieutenant),
    a = make(s, "01028");
  s.allies.push(a);
  assert.ok(!defendersFor(s, e).some((u) => u.id === a.id));
  assert.ok(defendersFor(s, e).some((u) => u.id === s.heroes[0].id));
  assert.throws(() => beginEnemyAttack(s, e, [a.id]), /defend/);
  attach(s, e, KHAZAD.fear);
  check(s);
  assert.ok(defendersFor(s, e).some((u) => u.id === a.id));
});
test("Scroll shadow assigns defended damage to its hero without subtracting that hero's defense and transfers the physical attachment", () => {
  let s = base();
  s.phase = "defense";
  const hero = s.heroes[0],
    defender = s.heroes[1],
    scroll = attach(s, hero, H.scroll),
    e = engaged(s, H.bandit);
  e.shadows = [H.collateral];
  e.tempAttack = 5;
  const amount = stats(s, e).attack - stats(s, defender).defense;
  beginEnemyAttack(s, e, [defender.id]);
  flush(s);
  s = settle(s);
  assert.equal(get(s, defender.id)?.damage, 0);
  assert.equal(get(s, e.id)?.attachments[0]?.id, scroll.id);
  assert.equal(get(s, hero.id)?.damage ?? amount, amount);
});
test("Scroll shadow suppresses an undefended hero choice and its assigned hero survives save/reload", () => {
  let s = base(2);
  s.phase = "defense";
  const hero = seatView(s, 1).heroes[0],
    e = engaged(s, H.bandit),
    scroll = attach(s, hero, H.scroll);
  e.shadows = [H.thug];
  beginEnemyAttack(s, e, []);
  flush(s);
  assert.equal(s.choice, null);
  assert.equal(get(s, hero.id)?.damage, card(H.bandit).attack);
  assert.equal(get(s, e.id)?.attachments[0]?.id, scroll.id);
  s = saved(s);
  assert.equal(scrollCount(s), 1);
});
test("Siege undefended damage is one packet on the lowest-threat Battleground with no overflow onto heroes", () => {
  let s = base(2, "siege-of-cair-andros");
  s.phase = "defense";
  const banks = staged(s, H.banks),
    approach = staged(s, H.approach),
    citadel = staged(s, H.citadel),
    e = engaged(s, H.bandit);
  e.tempAttack = 8;
  beginEnemyAttack(s, e, []);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(!get(s, banks.id));
  assert.equal(get(s, approach.id)?.damage, 0);
  assert.equal(get(s, citadel.id)?.damage, 0);
  assert.ok(allHeroes(s).every((h) => h.damage === 0));
  assert.equal(s.victory, 0);
});
test("Elite shadow gives a fresh attack and a new shadow without consuming the enemy's normal attack twice", () => {
  let s = base();
  s.phase = "defense";
  const e = engaged(s, H.bandit);
  e.shadows = [H.elite];
  s.encounterDeck = [H.bandit];
  beginEnemyAttack(s, e, []);
  flush(s);
  s = choose(s, s.heroes[0].id);
  assert.match(s.choice!.title, /Immediate attack/);
  assert.deepEqual(get(s, e.id)?.shadows, [H.bandit]);
  s = saved(s);
  s = choose(s, s.choice!.options.find((o) => o.id !== "undefended")!.id);
  s = settle(s);
  assert.equal(s.combat, null);
  assert.equal(s.phase, "attack");
  assert.deepEqual(get(s, e.id)?.shadows, [H.elite]);
  assert.equal(
    s.encounterDiscard.filter((code) => code === H.bandit).length,
    1,
  );
});
test("Rabble gains two attack per actual normal and engagement shadow and the phase bonus expires", () => {
  let s = base(1, "siege-of-cair-andros");
  s.stage = 2;
  s.phase = "encounter";
  const r = engaged(s, H.rabble),
    arsonist = staged(s, H.arsonist);
  engage(s, arsonist, true);
  flush(s);
  assert.equal(r.shadows.length, 1);
  assert.equal(stats(s, r).attack, (card(H.rabble).attack ?? 0) + 2);
  s = act(s, { type: "NEXT" });
  assert.equal(get(s, r.id)?.shadows.length, 2);
  assert.equal(
    stats(s, get(s, r.id)!).attack,
    (card(H.rabble).attack ?? 0) + 2,
  );
  phaseEnd(s);
  assert.equal(stats(s, get(s, r.id)!).attack, card(H.rabble).attack);
});
test("Vanguard stops blocked resource pools including gained icons and permits only Tactics heroes without a forbidden icon", () => {
  const s = base(2, "siege-of-cair-andros"),
    v = staged(s, H.vanguard);
  assert.equal(canPay(s, card("01014")), false);
  selectSeat(s, 1);
  assert.equal(canPay(s, card("01028")), true);
  for (const h of s.heroes) attach(s, h, "02034");
  assert.equal(canPay(s, card("01028")), false);
  attach(s, get(s, v.id)!, KHAZAD.fear);
  check(s);
  assert.equal(canPay(s, card("01028")), true);
});
test("Overgrown Trail's staging action exhausts an actual controlled Ranger and adds exactly three progress through a saved decision", () => {
  let s = base(2, "into-ithilien");
  const trail = staged(s, H.trail),
    ranger = make(s, "01014");
  s.allies.push(ranger);
  s.heroes.forEach((h) => {
    h.exhausted = true;
  });
  assert.equal(availableAbilities(s, trail)[0].disabled, false);
  s = act(s, { type: "ABILITY", id: trail.id });
  assert.match(s.choice!.title, /Ranger/);
  s = saved(s);
  s = choose(s, ranger.id);
  assert.equal(get(s, ranger.id)?.exhausted, true);
  assert.equal(get(s, trail.id)?.progress, 3);
  assert.equal(availableAbilities(s, get(s, trail.id)!)[0].disabled, true);
});
test("War Camp blocks staging progress with any Orc in play, permits progress after its departure, and Glade rejects player attachments", () => {
  const s = base(1, "siege-of-cair-andros");
  s.stage = 2;
  const camp = staged(s, H.camp),
    orc = engaged(s, H.rabble),
    glade = staged(s, H.glade);
  progressLocation(s, camp, 2);
  assert.equal(camp.progress, 0);
  damage(s, orc.id, 20);
  progressLocation(s, camp, 2);
  assert.equal(camp.progress, 2);
  assert.ok(!playTargets(s, make(s, "01056")).some((u) => u.id === glade.id));
});

test("Vanguard rejects Blood/Fire hero-pool attachment costs and Glorfindel's ability before target choice without spending or healing", () => {
  let s = base(1, "siege-of-cair-andros");
  s.stage = 2;
  const v = staged(s, H.vanguard),
    h = s.heroes[0],
    blood = attach(s, h, "05013"),
    fire = attach(s, h, "06085");
  for (const attachmentId of [blood.id, fire.id]) {
    assert.throws(
      () => act(s, { type: "ABILITY", id: h.id, attachmentId }),
      /Vanguard/,
    );
    assert.equal(h.resources, 10);
    assert.equal(h.tempAttack, 0);
    assert.equal(h.tempDefense, 0);
  }
  h.code = "01011";
  s.heroes[1].damage = 2;
  assert.equal(availableAbilities(s, h)[0].disabled, true);
  assert.throws(() => act(s, { type: "ABILITY", id: h.id }), /Vanguard/);
  assert.equal(get(s, h.id)?.resources, 10);
  assert.equal(s.heroes[1].damage, 2);
  s.choice = null;
  s.queue = [];
  attach(s, get(s, v.id)!, KHAZAD.fear);
  check(s);
  s = act(s, { type: "ABILITY", id: h.id });
  s = choose(s, s.heroes[1].id);
  assert.equal(get(s, h.id)?.resources, 9);
  assert.equal(s.heroes[1].damage, 1);
});

test("Vanguard permits Elladan's Tactics-only Response but a gained Lore icon prevents its offer", () => {
  for (const gained of [false, true]) {
    let s = base(1, "siege-of-cair-andros");
    s.stage = 2;
    s.phase = "attack";
    staged(s, H.vanguard);
    const h = s.heroes[0],
      enemy = engaged(s, H.bandit);
    h.code = "04028";
    if (gained) attach(s, h, "02034");
    playerAttack(s, enemy, [h.id], true);
    flush(s);
    if (gained) {
      assert.equal(s.choice, null);
      assert.equal(get(s, h.id)?.resources, 10);
      assert.equal(get(s, h.id)?.exhausted, true);
    } else {
      assert.match(s.choice!.title, /Elladan/);
      s = choose(s, "ready");
      assert.equal(get(s, h.id)?.resources, 9);
      assert.equal(get(s, h.id)?.exhausted, false);
    }
  }
});

for (const players of [1, 2, 3, 4])
  for (const variable of [false, true])
    test(`Scourge of Mordor discards one actual card from each of ${players} players and sums ${variable ? "numeric string and X" : "numeric string"} printed costs until phase end`, () => {
      let s = base(players, "siege-of-cair-andros");
      s.stage = 2;
      s.phase = "staging";
      const top = playerOrder(s).map((p) =>
        variable && p === players - 1 ? "06083" : "01043",
      );
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          s.deck = [top[p], "01028"];
          s.discard = [];
        });
      const initialThreat = stagingThreat(s);
      assert.equal(card("01043").cost, "2");
      s = reveal(s, H.scourge);
      for (const p of playerOrder(s)) {
        assert.deepEqual(seatView(s, p).deck, ["01028"]);
        assert.deepEqual(seatView(s, p).discard, [top[p]]);
      }
      const sum = 2 * (players - (variable ? 1 : 0));
      assert.equal(s.threatModifier, sum);
      assert.equal(stagingThreat(s), initialThreat + sum);
      s = saved(s);
      assert.equal(s.threatModifier, sum);
      phaseEnd(s);
      assert.equal(s.threatModifier, 0);
    });

test("Power of Mordor holds its physical source outside discard while replacement reveals resolve and removes Celador without shuffling him", () => {
  let s = base(1, "into-ithilien");
  s.phase = "staging";
  const celador = staged(s, H.celador);
  check(s);
  s.encounterDeck = [];
  s.encounterDiscard = [];
  s = reveal(s, H.power);
  assert.ok(s.removed.includes(H.celador));
  assert.ok(!get(s, celador.id));
  assert.equal(s.threat, 23);
  assert.equal(s.status, "playing");
  assert.equal(
    [...s.encounterDiscard, ...s.encounterDeck].filter(
      (code) => code === H.power,
    ).length,
    1,
  );
  assert.equal(s.queue.length, 0);
});
