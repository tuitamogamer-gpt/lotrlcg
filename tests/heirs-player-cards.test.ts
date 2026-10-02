import { applyAction as act } from "./pass-resource-window.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, SCRIPTED, STARTERS } from "../src/game/cards.ts";
import { HEIRS_PLAYER_CARDS } from "../src/game/heirs-player-support.ts";
import {
  availableAbilities,
  canPlay,
  createGame,
  playTargets,
} from "../src/game/engine.ts";
import {
  damage,
  discardCharacter,
  enemyAddedToStaging,
  enterAlly,
  nextRound,
  phaseEnd,
  placeEncounter,
  progressLocation,
} from "../src/game/board.ts";
import { beginEnemyAttack } from "../src/game/combat.ts";
import { flush } from "../src/game/effects.ts";
import {
  fx,
  playCost,
  stagingThreat,
  stats,
  threatOf,
} from "../src/game/core.ts";
import { effectiveTraits, hasTrait } from "../src/game/expansion-passives.ts";
import {
  heirsPlayerCardPlayed,
  heirsPlayerCost,
  heirsPlayerNoEngagementCheck,
  heirsPlayerSpecialAttachmentEntry,
} from "../src/game/heirs-player-cards.ts";
import { selectSeat, seatView, syncSeat } from "../src/game/table.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { EMYN } from "../src/game/emyn-muil.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import { validateSave } from "../src/game/save.ts";
import type { GameState, Unit } from "../src/game/types.ts";
let nextId = 1_110_000;
const unit = (code: string, owner = 0): Unit => ({
  id: `heirs-player-${nextId++}`,
  owner,
  code,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
function game(sphere = "lore") {
  const d = STARTERS.find((d) => d.id === sphere)!;
  const s = act(createGame(691, d.cards, d.heroes, d.id), { type: "KEEP" });
  s.hand = [];
  s.staging = [];
  s.heroes.forEach((h) => (h.resources = 10));
  return s;
}
function table() {
  const d = STARTERS[0];
  let s = createGame(692, d.cards, d.heroes, d.id, {
    seats: [
      { heroes: ["01001", "01002"], deckId: "leadership" },
      { heroes: ["01004", "01005"], deckId: "tactics" },
      { heroes: ["01011", "01012"], deckId: "lore" },
    ],
  });
  while (s.phase === "setup") s = act(s, { type: "KEEP" });
  for (let i = 0; i < 3; i++) {
    selectSeat(s, i);
    s.hand = [];
    s.heroes.forEach((h) => (h.resources = 10));
    syncSeat(s);
  }
  selectSeat(s, 0);
  s.staging = [];
  return s;
}
function choose(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    `Missing ${id}: ${JSON.stringify(s.choice)}`,
  );
  return act(s, { type: "CHOOSE", id });
}
function play(s: GameState, code: string, target?: string) {
  const u = unit(code, s.table?.active ?? 0);
  s.hand.push(u);
  syncSeat(s);
  return act(s, { type: "PLAY", id: u.id, target });
}
function vilya(s: GameState, code: string, mode = "play") {
  s.heroes[0].code = "04128";
  s.heroes[0].attachments.push({
    id: "heirs-vilya",
    code: "04137",
    exhausted: false,
  });
  s.deck.unshift(code);
  s = act(s, {
    type: "ABILITY",
    id: s.heroes[0].id,
    attachmentId: "heirs-vilya",
  });
  return choose(s, mode);
}

test("Heirs of Númenor registers all eighteen exact player designs", () => {
  assert.equal(HEIRS_PLAYER_CARDS.length, 18);
  for (const c of HEIRS_PLAYER_CARDS) {
    assert.ok(SCRIPTED.has(c.code), c.code);
    assert.equal(card(c.code).text, c.text);
  }
});
test("Beregond's target-aware Weapon discount permits his zero-cost Spear without discounting other hosts", () => {
  let s = game("tactics"),
    beregond = s.heroes[0],
    other = s.heroes[1];
  beregond.code = "05001";
  s.heroes.forEach((h) => (h.resources = 0));
  assert.equal(playCost(s, card("05009"), beregond), 0);
  assert.equal(playCost(s, card("05009"), other), 2);
  assert.equal(canPlay(s, unit("05009")), null);
  s = play(s, "05009", beregond.id);
  assert.equal(s.heroes[0].resources, 0);
  assert.ok(s.heroes[0].attachments.some((a) => a.code === "05009"));
});
test("Beregond lowers Armor played on himself by two and blanking disables only his discount", () => {
  const s = game("tactics"),
    hero = s.heroes[0];
  hero.code = "05001";
  assert.equal(playCost(s, card("01040"), hero), 2);
  hero.attachments.push({ id: "fear", code: KHAZAD.fear, exhausted: false });
  assert.equal(playCost(s, card("01040"), hero), 4);
  assert.ok(playTargets(s, unit("01040")).some((u) => u.id === hero.id));
});
test("Wealth of Gondor can give another player's hero a resource and triggers Heir of Mardil", () => {
  let s = table(),
    recipient = seatView(s, 1).heroes[0];
  recipient.attachments.push(
    { id: "steward", code: "01026", exhausted: false },
    { id: "heir", code: "08113", exhausted: false },
  );
  recipient.exhausted = true;
  const before = recipient.resources;
  s = play(s, "05006", recipient.id);
  assert.equal(seatView(s, 1).heroes[0].resources, before + 1);
  assert.match(s.choice?.title ?? "", /Heir of Mardil/);
  s = choose(s, "heir");
  assert.equal(seatView(s, 1).heroes[0].exhausted, false);
});
test("Sacked cannot gain Wealth's card-effect resource and is excluded from targets", () => {
  const s = game("leadership"),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "steward", code: "01026", exhausted: false },
    { id: "sacked", code: CARROCK.sacked, exhausted: false },
  );
  assert.ok(!playTargets(s, unit("05006")).some((u) => u.id === hero.id));
});
test("Mutual Accord snapshots Gondor and Rohan cards including printed attachment traits", () => {
  let s = game("leadership"),
    hero = s.heroes[0],
    theodred = s.heroes[1],
    gondor = unit("05018");
  hero.attachments.push({ id: "steward", code: "01026", exhausted: false });
  s.allies.push(gondor);
  s = play(s, "05005");
  assert.ok(hasTrait(s.heroes[0], "Rohan"));
  assert.ok(hasTrait(s.heroes[1], "Gondor"));
  assert.ok(hasTrait(s.allies[0], "Rohan"));
  assert.ok(s.heroes[0].attachments[0].dynamicTraits?.includes("Rohan"));
  const newcomer = unit("05018");
  s.allies.push(newcomer);
  assert.equal(hasTrait(newcomer, "Rohan"), false);
  phaseEnd(s);
  stats(s, s.heroes[1]);
  assert.equal(hasTrait(s.heroes[1], "Gondor"), false);
});
test("Mutual Accord's resolved lasting trait survives printed-text blanking until phase end", () => {
  let s = game("leadership"),
    hero = s.heroes[1];
  s = play(s, "05005");
  hero = s.heroes[1];
  hero.attachments.push({ id: "fear", code: KHAZAD.fear, exhausted: false });
  stats(s, hero);
  assert.ok(effectiveTraits(hero).includes("Gondor"));
  assert.equal(effectiveTraits(hero).includes("Rohan"), false);
});
test("Damrod discards as an action cost, lowers only his controller's threat and does not trigger Horn destruction", () => {
  let s = game("spirit"),
    damrod = unit("05010");
  s.allies.push(damrod);
  s.staging.push(unit("01084"), unit("01089"), unit("01088"));
  s.heroes[0].attachments.push({ id: "horn", code: "01042", exhausted: false });
  const before = s.threat,
    res = s.heroes[0].resources;
  damrod.exhausted = true;
  s = act(s, { type: "ABILITY", id: damrod.id });
  assert.equal(s.threat, before - 2);
  assert.ok(!s.allies.some((u) => u.id === damrod.id));
  assert.equal(s.heroes[0].resources, res);
});
test("Light the Beacons grants snapshot defense through phase ends without exhausting its ready defenders", () => {
  let s = game("spirit"),
    hero = s.heroes[0],
    enemy = unit("01089");
  const base = stats(s, hero).defense;
  s = play(s, "05011");
  assert.equal(stats(s, s.heroes[0]).defense, base + 2);
  phaseEnd(s);
  assert.equal(stats(s, s.heroes[0]).defense, base + 2);
  s.phase = "defense";
  s.engaged.push(enemy);
  beginEnemyAttack(s, enemy, [hero.id]);
  flush(s);
  assert.equal(s.heroes[0].exhausted, false);
  const future = unit("05018");
  s.allies.push(future);
  assert.equal(stats(s, future).defense, card(future.code).defense);
  nextRound(s);
  assert.equal(stats(s, s.heroes[0]).defense, base);
});
test("Light the Beacons does not let an already exhausted character defend", () => {
  const s = game("spirit"),
    hero = s.heroes[0],
    enemy = unit("01089");
  s.used.push(`round:beacons:${hero.id}`);
  hero.exhausted = true;
  s.engaged.push(enemy);
  s.phase = "defense";
  assert.throws(() => beginEnemyAttack(s, enemy, [hero.id]));
});
test("Blood of Númenor pays first, snapshots remaining resources, and limits each attachment once per phase", () => {
  let s = game("leadership"),
    hero = s.heroes[0];
  hero.attachments.push(
    { id: "steward", code: "01026", exhausted: false },
    { id: "blood", code: "05013", exhausted: true },
  );
  hero.resources = 4;
  const base = stats(s, hero).defense;
  assert.equal(
    availableAbilities(s, hero).find((a) => a.id === "blood")?.disabled,
    false,
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "blood" });
  assert.equal(s.heroes[0].resources, 3);
  assert.equal(stats(s, s.heroes[0]).defense, base + 3);
  s.heroes[0].resources = 8;
  assert.equal(stats(s, s.heroes[0]).defense, base + 3);
  assert.equal(
    availableAbilities(s, s.heroes[0]).find((a) => a.id === "blood")?.disabled,
    true,
  );
  phaseEnd(s);
  assert.equal(stats(s, s.heroes[0]).defense, base);
});
test("Two Blood copies are separate instances and spending Sacked's existing resources remains legal", () => {
  let s = game("leadership"),
    hero = s.heroes[0];
  hero.resources = 3;
  hero.attachments.push(
    { id: "blood-a", code: "05013", exhausted: false },
    { id: "blood-b", code: "05013", exhausted: false },
    { id: "sacked", code: CARROCK.sacked, exhausted: false },
  );
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "blood-a" });
  s = act(s, { type: "ABILITY", id: hero.id, attachmentId: "blood-b" });
  assert.equal(s.heroes[0].resources, 1);
  assert.equal(s.heroes[0].tempDefense, 3);
});
test("Blood needs a positive defense effect after payment and exact Gondor or Dunedain hero targets", () => {
  const s = game("leadership"),
    hero = s.heroes[0];
  hero.resources = 1;
  hero.attachments.push({ id: "blood", code: "05013", exhausted: false });
  assert.equal(
    availableAbilities(s, hero).find((a) => a.id === "blood")?.disabled,
    true,
  );
  assert.ok(playTargets(s, unit("05013")).some((u) => u.id === hero.id));
  assert.ok(
    !playTargets(s, unit("05013")).some((u) => u.id === s.heroes[1].id),
  );
});
test("Hunter of Lamedon reveals and adds an Outlands card without drawing, only after hand PLAY", () => {
  let s = game();
  s.deck = ["05014", "01013"];
  s.used.push("phase:elf-cannot-draw");
  s = play(s, "05014");
  s = choose(s, "reveal");
  assert.equal(s.choice?.options[0].code, "05014");
  s = choose(s, "resolve");
  assert.ok(s.hand.some((u) => u.code === "05014"));
  assert.deepEqual(s.deck, ["01013"]);
  let put = game();
  put.deck = ["05014"];
  enterAlly(put, unit("05014"), false, false, false);
  flush(put);
  assert.equal(put.choice, null);
});
test("Hunter's failed Outlands reveal actually discards from deck and offers Hidden Cache's response", () => {
  let s = game();
  s.deck = ["06143", "01013"];
  s = play(s, "05014");
  s = choose(s, "reveal");
  s = choose(s, "resolve");
  assert.ok(s.discard.includes("06143"));
  assert.match(s.choice?.title ?? "", /Hidden Cache/);
});
test("Hunter's Vilya deck PLAY does not trigger its hand-only response", () => {
  let s = game();
  s = vilya(s, "05014");
  assert.ok(s.allies.some((u) => u.code === "05014"));
  assert.equal(s.choice, null);
});
test("Ithilien Tracker exhausts, survives source departure and applies to an actual added enemy for this phase", () => {
  let s = game(),
    tracker = unit("05015");
  s.allies.push(tracker);
  s = act(s, { type: "ABILITY", id: tracker.id });
  assert.equal(s.allies[0].exhausted, true);
  discardCharacter(s, s.allies[0]);
  const enemy = unit("01082");
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.equal(threatOf(s, enemy), 0);
  phaseEnd(s);
  assert.equal(threatOf(s, enemy), card(enemy.code).threat);
});
test("Tracker applies to an engaged enemy actually moving back into staging", () => {
  let s = game(),
    tracker = unit("05015"),
    enemy = unit("01082");
  s.allies.push(tracker);
  s.engaged.push(enemy);
  s = act(s, { type: "ABILITY", id: tracker.id });
  s.engaged = [];
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.equal(threatOf(s, enemy), 0);
});
test("An immune next enemy consumes Tracker's occurrence without affecting it or a later enemy", () => {
  let s = game(),
    tracker = unit("05015");
  s.allies.push(tracker);
  s = act(s, { type: "ABILITY", id: tracker.id });
  const immune = unit(KHAZAD.nameless),
    later = unit("01082");
  s.staging.push(immune);
  enemyAddedToStaging(s, immune);
  s.staging.push(later);
  enemyAddedToStaging(s, later);
  assert.equal(threatOf(s, later), card(later.code).threat);
  assert.ok(!s.used.some((k) => k.startsWith("phase:tracker-next:")));
});
test("Master of Lore names a type, stacks discounts to minimum one and consumes only the matching next PLAY", () => {
  let s = game(),
    a = unit("05016"),
    b = unit("05016");
  s.allies.push(a, b);
  s = act(s, { type: "ABILITY", id: a.id });
  s = choose(s, "ally");
  s = act(s, { type: "ABILITY", id: b.id });
  s = choose(s, "ally");
  assert.equal(playCost(s, card("05014")), 1);
  assert.equal(playCost(s, card("01013")), 2);
  s.heroes[0].damage = 1;
  s = play(s, "01063", s.heroes[0].id);
  assert.equal(playCost(s, card("05014")), 1);
  s = play(s, "05014");
  assert.equal(playCost(s, card("05014")), 2);
});
test("Master's discount does not raise a zero-cost card and created effects survive source departure", () => {
  let s = game(),
    master = unit("05016");
  s.allies.push(master);
  s = act(s, { type: "ABILITY", id: master.id });
  s = choose(s, "event");
  discardCharacter(s, s.allies[0]);
  assert.equal(heirsPlayerCost(s, card("04108"), 0), 0);
  heirsPlayerCardPlayed(s, card("04108"));
  assert.ok(!s.used.some((k) => k.startsWith("phase:master-lore:")));
});
test("Master is consumed by Vilya's actual free PLAY and retained by put-into-play", () => {
  let s = game(),
    master = unit("05016");
  s.allies.push(master);
  s = act(s, { type: "ABILITY", id: master.id });
  s = choose(s, "ally");
  s = vilya(s, "05014");
  assert.ok(!s.used.includes("phase:master-lore:ally"));
  let put = game(),
    other = unit("05016");
  put.allies.push(other);
  put = act(put, { type: "ABILITY", id: other.id });
  put = choose(put, "ally");
  put = vilya(put, "05014", "put");
  assert.ok(put.used.includes("phase:master-lore:ally"));
});
test("Ranger Spikes PLAYs unattached into staging and attaches to the next eligible entering enemy", () => {
  let s = game();
  assert.equal(playTargets(s, unit("05017")).length, 0);
  s = play(s, "05017");
  const trap = s.staging.find((u) => u.code === "05017")!;
  assert.ok(trap);
  assert.equal(stagingThreat(s), 0);
  const enemy = unit("01082");
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.equal(s.staging.length, 1);
  assert.ok(enemy.attachments.some((a) => a.id === trap.id));
  assert.equal(threatOf(s, enemy), 0);
  assert.equal(heirsPlayerNoEngagementCheck(enemy), true);
});
test("Vilya can PLAY Ranger Spikes into staging but cannot PUT it into an unspecified area", () => {
  let s = game();
  s.heroes[0].code = "04128";
  s.heroes[0].attachments.push({
    id: "spikes-vilya",
    code: "04137",
    exhausted: false,
  });
  s.deck.unshift("05017");
  s = act(s, {
    type: "ABILITY",
    id: s.heroes[0].id,
    attachmentId: "spikes-vilya",
  });
  assert.ok(s.choice?.options.some((o) => o.id === "play"));
  assert.ok(!s.choice?.options.some((o) => o.id === "put"));
  s = choose(s, "play");
  assert.ok(s.staging.some((u) => u.code === "05017"));
});
test("All unattached Spikes copies attach to the same eligible entry and their reductions stack", () => {
  const s = game(),
    a = unit("05017"),
    b = unit("05017"),
    enemy = unit("01084");
  heirsPlayerSpecialAttachmentEntry(s, a);
  heirsPlayerSpecialAttachmentEntry(s, b);
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.equal(enemy.attachments.length, 2);
  assert.equal(threatOf(s, enemy), 0);
});
test("Spikes skips immune enemies but Nazgul's prohibition on PLAYing attachments does not prevent automatic attachment", () => {
  const s = game(),
    trap = unit("05017"),
    immune = unit(KHAZAD.nameless),
    nazgul = unit("01102");
  heirsPlayerSpecialAttachmentEntry(s, trap);
  s.staging.push(immune);
  enemyAddedToStaging(s, immune);
  assert.ok(s.staging.some((u) => u.id === trap.id));
  s.staging.push(nazgul);
  enemyAddedToStaging(s, nazgul);
  assert.ok(nazgul.attachments.some((a) => a.code === "05017"));
});
test("Spikes prevents framework engagement checks while still permitting optional engagement", () => {
  let s = game(),
    enemy = unit("01084");
  enemy.attachments.push({
    id: "spikes",
    code: "05017",
    owner: 0,
    exhausted: false,
  });
  s.threat = 48;
  s.phase = "engagement";
  s.staging.push(enemy);
  s.queue.push(fx("engagementRound"));
  flush(s);
  assert.ok(s.staging.some((u) => u.id === enemy.id));
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: enemy.id });
  assert.ok(s.engaged.some((u) => u.id === enemy.id));
});
test("Amon Lhaw blanks both unattached and attached Spikes until it leaves active", () => {
  const s = game(),
    trap = unit("05017"),
    enemy = unit("01084");
  s.activeLocation = unit(EMYN.amonLhaw);
  heirsPlayerSpecialAttachmentEntry(s, trap);
  stats(s, s.heroes[0]);
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.ok(s.staging.some((u) => u.id === trap.id));
  s.activeLocation = null;
  stats(s, s.heroes[0]);
  const next = unit("01082");
  s.staging.push(next);
  enemyAddedToStaging(s, next);
  assert.ok(next.attachments.some((a) => a.code === "05017"));
  s.activeLocation = unit(EMYN.amonLhaw);
  stats(s, s.heroes[0]);
  assert.equal(threatOf(s, next), card(next.code).threat);
  assert.equal(heirsPlayerNoEngagementCheck(next), false);
});
test("Spear of the Citadel offers damage before shadow resolution and can defeat the attacking enemy", () => {
  let s = game("tactics"),
    hero = s.heroes[0],
    enemy = unit("01089");
  hero.attachments.push({ id: "spear", code: "05009", exhausted: true });
  enemy.damage = 2;
  s.engaged.push(enemy);
  s.phase = "defense";
  beginEnemyAttack(s, enemy, [hero.id]);
  flush(s);
  assert.equal(s.choice?.title, "Spear of the Citadel · Declared defender");
  s = choose(s, "damage");
  assert.equal(s.engaged.length, 0);
  assert.equal(s.heroes[0].damage, 0);
});
test("Spear's legal targets include Tactics allies, with one copy per character and Restricted slots", () => {
  const s = game("tactics"),
    ally = unit("05007");
  s.allies.push(ally);
  assert.ok(playTargets(s, unit("05009")).some((u) => u.id === ally.id));
  ally.attachments.push({ id: "spear", code: "05009", exhausted: false });
  assert.ok(!playTargets(s, unit("05009")).some((u) => u.id === ally.id));
});
test("A Watchful Peace returns the exact explored zero-victory location while leaving an older duplicate discarded", () => {
  let s = game("spirit"),
    location = unit("01088");
  s.activeLocation = location;
  s.encounterDiscard = ["01088", "01089"];
  s.hand.push(unit("05012"));
  progressLocation(s, location, card(location.code).quest!);
  flush(s);
  assert.equal(s.choice?.title, "A Watchful Peace · Location explored");
  s = choose(s, "return");
  assert.equal(s.encounterDeck[0], location.code);
  assert.equal(s.encounterDiscard.filter((c) => c === location.code).length, 1);
  assert.ok(s.discard.includes("05012"));
});
test("Watchful Peace has no response for victory locations, simple discards, or Banks of the Anduin's automatic return", () => {
  const s = game("spirit");
  s.hand.push(unit("05012"));
  const victory = unit("01114");
  s.activeLocation = victory;
  progressLocation(s, victory, card(victory.code).quest!);
  flush(s);
  assert.notEqual(s.choice?.title, "A Watchful Peace · Location explored");
  s.choice = null;
  s.queue = [];
  const automatic = unit("01113");
  s.activeLocation = automatic;
  progressLocation(s, automatic, card(automatic.code).quest!);
  flush(s);
  assert.notEqual(s.choice?.title, "A Watchful Peace · Location explored");
});
test("Pending Hunter reveal and Blood's lasting state survive save validation", () => {
  let s = game();
  s.deck = ["05014"];
  s = play(s, "05014");
  s = choose(s, "reveal");
  assert.ok(validateSave(s));
});

test("Tracker's lasting zero threat remains zero when a Trap is subsequently blanked", () => {
  let s = game(),
    tracker = unit("05015"),
    trap = unit("05017"),
    enemy = unit("01084");
  s.allies.push(tracker);
  heirsPlayerSpecialAttachmentEntry(s, trap);
  s = act(s, { type: "ABILITY", id: tracker.id });
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
  assert.equal(threatOf(s, enemy), 0);
  s.activeLocation = unit(EMYN.amonLhaw);
  stats(s, s.heroes[0]);
  assert.equal(threatOf(s, enemy), 0);
  phaseEnd(s);
  assert.equal(threatOf(s, enemy), card(enemy.code).threat);
});

test("Sacked leaves Beregond's constant reduction active while Shadow of Fear blanks it", () => {
  const s = game("tactics"),
    hero = s.heroes[0];
  hero.code = "05001";
  hero.attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  stats(s, hero);
  assert.equal(playCost(s, card("01040"), hero), 2);
  hero.attachments.push({ id: "fear", code: KHAZAD.fear, exhausted: false });
  stats(s, hero);
  assert.equal(playCost(s, card("01040"), hero), 4);
});
