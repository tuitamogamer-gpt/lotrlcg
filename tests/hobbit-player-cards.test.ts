import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, canPlay, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { canPay, eligiblePayers, fx, get, make, stats } from "../src/game/core";
import { collectResources, phaseEnd } from "../src/game/board";
import { flush, handle } from "../src/game/effects";
import { availableAbilities, needsTarget } from "../src/game/actions";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner, selectSeat, seatView, syncSeat } from "../src/game/table";
import {
  effectiveKeyword,
  questExhausts,
} from "../src/game/expansion-passives";
import { playerEffectImmune } from "../src/game/player-effect-immunity";
import {
  HOBBIT_PLAYER as P,
  hobbitPlayerEnemyRevealed,
} from "../src/game/hobbit-player-cards";
import { HOBBIT_BILBO, bagginsBilbo } from "../src/game/hobbit-saga";
import { base, choose, reload, settle } from "./we-must-away-fixtures";
import { sackTargets } from "../src/game/we-must-away";
import { WMA as W } from "../src/game/we-must-away-support";
import { base as nurnBase } from "./fortress-nurn-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./hobbit-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const hand = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.hand.push(u);
  });
  return u;
};
const ally = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.allies.push(u);
  });
  return u;
};
const hero = (s: GameState, code: string, slot: number) => {
  const u = make(s, code);
  u.owner = 0;
  u.resources = 0;
  s.heroes[slot] = u;
  return u;
};
const enemy = (s: GameState, code: string) => {
  const u = make(s, code);
  s.engaged.push(u);
  return u;
};
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
const AXE = "01041",
  BLADE = "01039",
  AXEHAND = "01028",
  ORCS = "01089",
  SPIDER = "01074",
  SPAWN = "01076";
const icons = (s: GameState, sphere: string) => {
  for (const h of s.heroes) h.phaseResourceIcons = [sphere];
};

test("Every Over Hill and Under Hill player card is scripted, deckable and pinned to a reviewed scan", () => {
  for (let n = 1; n <= 22; n++)
    assert.ok(SCRIPTED.has(`1310${String(n).padStart(2, "0")}`));
  const heroes = HERO_CARDS.map((c) => c.code),
    deck = DECK_CARDS.map((c) => c.code);
  assert.ok(heroes.includes(P.thorin) && heroes.includes(P.beorn));
  assert.ok(!heroes.includes(HOBBIT_BILBO));
  for (const code of [
    P.bofur,
    P.gandalf,
    P.hood,
    P.cleaver,
    P.late,
    P.mischief,
    P.burglar,
  ])
    assert.ok(deck.includes(code), code);
  assert.ok(!deck.includes("131020"));
  assert.equal(art.length, 9);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath);
    // The scans were reviewed against the RingsDB text.
    assert.equal(
      card(a.code).text,
      (official as { code: string; text?: string }[]).find(
        (c) => c.code === a.code,
      )!.text,
    );
  }
  for (const code of [P.cleaver, P.late, "22139", "18015"])
    assert.ok(needsTarget({ code } as Unit), code);
  assert.deepEqual(
    deckWarnings({
      heroes: [P.thorin, P.beorn],
      cards: { [P.burglar]: 3, [P.bofur]: 3 },
    }),
    [
      "Burglar Baggins is paid with Bilbo Baggins' Baggins resources, so it can only be played in The Hobbit scenarios.",
    ],
  );
});

test("Thorin Oakenshield collects 1 additional resource while his controller has 5 Dwarf characters", () => {
  const s = base();
  const thorin = hero(s, P.thorin, 0);
  // Thorin and Glóin are Dwarves; two Veteran Axehands make four.
  ally(s, AXEHAND);
  ally(s, AXEHAND);
  collectResources(s);
  assert.equal(thorin.resources, 1);
  ally(s, AXEHAND);
  collectResources(s);
  assert.equal(thorin.resources, 3);
  thorin.blanked = true;
  collectResources(s);
  assert.equal(thorin.resources, 4);
});

test("Beorn is a Sentinel that cannot have attachments, is immune to player card effects and does not exhaust to defend", () => {
  let s = base();
  const beorn = hero(s, P.beorn, 1);
  assert.ok(effectiveKeyword(beorn, "Sentinel"));
  assert.ok(playerEffectImmune(s, beorn, P.hood));
  const blade = hand(s, BLADE);
  assert.ok(playTargets(s, blade).length > 0);
  assert.ok(!playTargets(s, blade).some((u) => u.id === beorn.id));
  assert.ok(!playTargets(s, hand(s, P.hood)).some((u) => u.id === beorn.id));
  // He is never stuffed into a Sack, even with the highest printed hit points.
  assert.ok(!sackTargets(s, W.large).some((u) => u.id === beorn.id));
  assert.ok(sackTargets(s, W.large).length > 0);
  const first = enemy(s, SPAWN),
    second = enemy(s, SPIDER);
  s.phase = "defense";
  s = act(s, { type: "DEFEND", enemyId: first.id, defenderId: beorn.id });
  s = settle(s, "undefended");
  const b = get(s, beorn.id)!;
  assert.equal(b.exhausted, false);
  assert.equal(b.damage, 5 - 1);
  // Still ready, he may defend the next attack too.
  s = act(s, { type: "DEFEND", enemyId: second.id, defenderId: beorn.id });
  s = settle(s, "undefended");
  assert.equal(get(s, beorn.id)!.exhausted, false);
  assert.equal(get(s, beorn.id)!.damage, 4 + 3 - 1);
});

test("Bofur exhausts to search the top 5 cards for a Weapon attachment and shuffles the others back", () => {
  let s = base();
  const bofur = ally(s, P.bofur);
  s.deck = [AXEHAND, BLADE, "01073", AXE, "01014", AXE, "01023"];
  const label = availableAbilities(s, bofur).find((a) =>
    a.label.startsWith("Bofur"),
  )!;
  assert.equal(label.disabled, false);
  s = act(s, { type: "ABILITY", id: bofur.id });
  assert.deepEqual(
    s.choice!.options.map((o) => o.code ?? o.id),
    [BLADE, AXE, "none"],
  );
  s = choose(s, s.choice!.options.find((o) => o.code === AXE)!.id);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [AXE],
  );
  assert.equal(s.deck.length, 6);
  assert.equal(s.deck.filter((c) => c === AXE).length, 1);
  assert.equal(get(s, bofur.id)!.exhausted, true);
  assert.match(
    availableAbilities(s, get(s, bofur.id)!).find((a) =>
      a.label.startsWith("Bofur"),
    )!.disabled
      ? "disabled"
      : "",
    /disabled/,
  );
  s.deck = [];
  get(s, bofur.id)!.exhausted = false;
  assert.ok(
    availableAbilities(s, get(s, bofur.id)!).find((a) =>
      a.label.startsWith("Bofur"),
    )!.disabled,
  );
});

test("Gandalf commits without exhausting and is discarded at the end of the refresh phase unless his controller raises threat by 2", () => {
  let s = base();
  const g = ally(s, P.gandalf);
  assert.equal(questExhausts(s, g), false);
  s.phase = "quest";
  s.committedIds = [g.id];
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, g.id)!.committed, true);
  assert.equal(get(s, g.id)!.exhausted, false);

  s = base();
  const kept = ally(s, P.gandalf);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  assert.match(s.choice!.title, /Gandalf/);
  const threat = s.threat;
  s = choose(s, "keep");
  assert.ok(get(s, kept.id));
  assert.equal(seatView(s, 0).threat, threat + 2);

  s = base();
  const gone = ally(s, P.gandalf);
  s.phase = "refresh";
  s = act(s, { type: "NEXT" });
  s = choose(s, "discard");
  assert.equal(get(s, gone.id), undefined);
  assert.ok(s.discard.includes(P.gandalf));
  assert.equal(s.threat, 20);
});

test("Spare Hood and Cloak exhausts itself and its character to ready another character, then moves to that character", () => {
  let s = base();
  const [from, to] = s.heroes;
  from.attachments.push({ id: "hood", code: P.hood, exhausted: false });
  const ability = () =>
    availableAbilities(s, get(s, from.id)!).find((a) => a.id === "hood")!;
  assert.match(ability().label, /Spare Hood and Cloak/);
  // No other exhausted character can be readied yet.
  assert.equal(ability().disabled, true);
  to.exhausted = true;
  assert.equal(ability().disabled, false);
  s = act(s, { type: "ABILITY", id: from.id, attachmentId: "hood" });
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [to.id],
  );
  s = choose(s, to.id);
  const a = get(s, from.id)!,
    b = get(s, to.id)!;
  assert.equal(a.exhausted, true);
  assert.equal(b.exhausted, false);
  assert.deepEqual(a.attachments, []);
  assert.deepEqual(b.attachments, [
    { id: "hood", code: P.hood, exhausted: true },
  ]);
  // It attaches to any character, including allies.
  const axehand = ally(s, AXEHAND);
  assert.ok(playTargets(s, hand(s, P.hood)).some((u) => u.id === axehand.id));
});

test("Goblin-cleaver exhausts a Weapon on a hero you control to deal 2 damage, 3 to an Orc", () => {
  let s = base();
  icons(s, "tactics");
  const cleaver = hand(s, P.cleaver);
  const orcs = enemy(s, ORCS),
    spider = enemy(s, SPIDER);
  s.phase = "defense";
  assert.match(canPlay(s, cleaver)!, /ready Weapon/);
  s.heroes[0].attachments.push({ id: "axe", code: AXE, exhausted: false });
  assert.equal(canPlay(s, cleaver), null);
  s.phase = "planning";
  assert.match(canPlay(s, cleaver)!, /Combat Action/);
  s.phase = "defense";
  assert.deepEqual(
    playTargets(s, cleaver).map((u) => u.id),
    [orcs.id, spider.id],
  );
  s = act(s, { type: "PLAY", id: cleaver.id, target: spider.id });
  s = settle(s);
  assert.equal(get(s, spider.id)!.damage, 2);
  assert.equal(s.heroes[0].attachments[0].exhausted, true);
  // Two ready Weapons: the player chooses which one pays.
  const second = hand(s, P.cleaver);
  s.heroes[0].attachments[0].exhausted = false;
  s.heroes[1].attachments.push({ id: "blade", code: BLADE, exhausted: false });
  s = act(s, { type: "PLAY", id: second.id, target: orcs.id });
  assert.match(s.choice!.title, /Exhaust a Weapon/);
  s = choose(s, "blade");
  s = settle(s);
  assert.equal(get(s, orcs.id), undefined, "3 damage destroys the Orc");
  assert.ok(s.encounterDiscard.includes(ORCS));
  assert.equal(s.heroes[1].attachments[0].exhausted, true);
  assert.equal(s.heroes[0].attachments[0].exhausted, false);
});

test("Late Adventurer exhausts a ready, uncommitted character you control to commit it to the quest", () => {
  let s = base();
  icons(s, "spirit");
  const late = hand(s, P.late);
  const axehand = ally(s, AXEHAND);
  assert.match(canPlay(s, late)!, /Quest Action/);
  s.phase = "staging";
  const tired = ally(s, AXEHAND);
  tired.exhausted = true;
  const targets = playTargets(s, late).map((u) => u.id);
  assert.ok(targets.includes(axehand.id));
  assert.ok(!targets.includes(tired.id));
  s = act(s, { type: "PLAY", id: late.id, target: axehand.id });
  s = settle(s);
  const a = get(s, axehand.id)!;
  assert.equal(a.exhausted, true);
  assert.equal(a.committed, true);
  assert.ok(!playTargets(s, hand(s, P.late)).some((u) => u.id === a.id));

  // Played during the commit step, the committed character stays committed
  // when the rest of the fellowship commits.
  s = base();
  icons(s, "spirit");
  s.phase = "quest";
  const early = ally(s, AXEHAND);
  s = act(s, { type: "PLAY", id: hand(s, P.late).id, target: early.id });
  s = settle(s);
  assert.equal(get(s, early.id)!.committed, true);
  s.committedIds = [s.heroes[0].id];
  s = act(s, { type: "COMMIT" });
  assert.equal(get(s, early.id)!.committed, true);
  assert.equal(get(s, early.id)!.exhausted, true);
  assert.equal(s.heroes[0].committed, true);
  assert.ok(s.log.some((l) => /2 characters commit to the quest/.test(l.text)));
});

test("Expecting Mischief deals 2 damage to the first enemy revealed from the encounter deck this quest phase", () => {
  let s = base();
  icons(s, "lore");
  const one = hand(s, P.mischief),
    two = hand(s, P.mischief);
  s.phase = "planning";
  assert.match(canPlay(s, one)!, /before the staging step/);
  s.phase = "quest";
  s = act(s, { type: "PLAY", id: one.id });
  s = settle(s);
  s = act(s, { type: "PLAY", id: two.id });
  s = settle(s);
  s.encounterDeck = [SPAWN, SPAWN, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.deepEqual(
    s.staging.filter((u) => u.code === SPAWN).map((u) => u.damage),
    [4, 0],
  );
  assert.match(canPlay(s, hand(s, P.mischief))!, /already been revealed/);
  phaseEnd(s);
  assert.ok(!s.used.some((k) => k.startsWith(`phase:${P.mischief}`)));

  // A destroyed enemy is still the first enemy revealed this phase.
  s = base();
  icons(s, "lore");
  s.phase = "quest";
  s = act(s, { type: "PLAY", id: hand(s, P.mischief).id });
  s = settle(s);
  s.encounterDeck = ["01083", SPAWN, ...s.encounterDeck];
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  handle(s, fx("reveal", { player: 0 }));
  flush(s);
  assert.ok(!s.staging.some((u) => u.code === "01083"));
  assert.ok(s.encounterDiscard.includes("01083"));
  assert.equal(s.staging.find((u) => u.code === SPAWN)!.damage, 0);

  // An enemy immune to player card effects takes no damage.
  s = base();
  s.phase = "quest";
  s.used.push(`phase:${P.mischief}`);
  const immune = make(s, SPAWN);
  immune.immuneToPlayerEffects = true;
  s.staging.push(immune);
  hobbitPlayerEnemyRevealed(s, immune);
  flush(s);
  assert.equal(immune.damage, 0);
  assert.ok(s.used.includes(`phase:${P.mischief}:revealed`));
  assert.ok(!s.used.includes(`phase:${P.mischief}`));
});

test("Burglar Baggins can be paid from Bilbo's pool by any player and boosts Bilbo until the end of the phase", () => {
  let s = base(2);
  const bilbo = bagginsBilbo(s)!;
  bilbo.resources = 2;
  const before = { ...stats(s, bilbo) };
  selectSeat(s, 1);
  syncSeat(s);
  const burglar = hand(s, P.burglar, 1);
  assert.ok(eligiblePayers(s, card(P.burglar)).some((u) => u.id === bilbo.id));
  assert.ok(canPay(s, card(P.burglar)));
  assert.equal(canPlay(s, burglar), null);
  s = act(s, { type: "PLAY", id: burglar.id, payment: { [bilbo.id]: 1 } });
  s = settle(s);
  const b = bagginsBilbo(s)!;
  assert.equal(b.resources, 1);
  assert.deepEqual(
    [stats(s, b).will, stats(s, b).attack, stats(s, b).defense],
    [before.will + 2, before.attack + 2, before.defense + 2],
  );
  phaseEnd(s);
  assert.equal(stats(s, bagginsBilbo(s)!).will, before.will);
  // Without Bilbo Baggins it cannot be played.
  const t = nurnBase();
  const lost = hand(t, P.burglar);
  assert.match(canPlay(t, lost)!, /Bilbo Baggins in play/);
});
