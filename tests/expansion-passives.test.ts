import { applyAction } from "./pass-resource-window.ts";
import { CARROCK } from "../src/game/carrock.ts";
import { KHAZAD } from "../src/game/khazad-dum.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { card, STARTERS, SCRIPTED } from "../src/game/cards";
import {
  createGame,
  stats,
  canPlay,
  playTargets,
  restoreSave,
} from "../src/game/engine";
import { make, pay, eligiblePayers } from "../src/game/core";
import { defendersFor, attackersFor, selectSeat } from "../src/game/table";
import { damage, discardAttachment, check } from "../src/game/board";
import {
  hasResourceIcon,
  effectiveTraits,
  restrictedSlots,
} from "../src/game/expansion-passives";

const tactics = STARTERS.find((d) => d.id === "tactics")!;
function fixture() {
  let s = createGame(9, tactics.cards, tactics.heroes, tactics.id);
  s = applyAction(s, { type: "KEEP" });
  s.heroes.forEach((h) => (h.resources = 10));
  s.hand = [];
  s.staging = [];
  s.encounterDeck = [];
  s.encounterDiscard = [];
  return s;
}
function attach(
  s: ReturnType<typeof fixture>,
  code: string,
  host = s.heroes[0],
) {
  const u = make(s, code);
  s.hand.push(u);
  return applyAction(s, { type: "PLAY", id: u.id, target: host.id });
}
test("expansion registration leaves all four printed Core learning recipes unchanged", () => {
  for (const d of STARTERS) {
    assert.equal(
      Object.values(d.cards).reduce((n, v) => n + v, 0),
      30,
    );
    assert.ok(Object.keys(d.cards).every((code) => code.startsWith("01")));
  }
  assert.ok(SCRIPTED.has("05007"));
  assert.ok(SCRIPTED.has("05001"));
});
test("Song resource icons immediately permit payment and disappear with the attachment", () => {
  let s = fixture();
  const hero = s.heroes[0];
  // Song of Wisdom is neutral and can be paid by any hero.
  s = attach(s, "02034", hero);
  assert.equal(hasResourceIcon(s.heroes[0], "lore"), true);
  assert.ok(eligiblePayers(s, card("02057")).some((h) => h.id === hero.id));
  const ally = make(s, "02057");
  s.hand.push(ally);
  assert.equal(canPlay(s, ally), null);
  s = applyAction(s, { type: "PLAY", id: ally.id });
  assert.ok(s.allies.some((u) => u.code === "02057"));
  const h = s.heroes[0];
  discardAttachment(s, h, h.attachments[0]);
  assert.equal(hasResourceIcon(h, "lore"), false);
  assert.deepEqual(eligiblePayers(s, card("02057")), []);
});
test("Elf-friend enables trait-limited armor and its keyword, with exact attachment limits", () => {
  let s = fixture();
  s = attach(s, "10093");
  assert.ok(effectiveTraits(s.heroes[0]).includes("Silvan"));
  s = attach(s, "08029");
  assert.equal(stats(s, s.heroes[0]).health, 7);
  s = attach(s, "02034");
  s = attach(s, "08120");
  assert.equal(stats(s, s.heroes[0]).defense, 3);
  const duplicate = make(s, "08120");
  assert.ok(!playTargets(s, duplicate).some((u) => u.id === s.heroes[0].id));
  assert.throws(
    () =>
      applyAction(
        { ...s, hand: [duplicate] },
        { type: "PLAY", id: duplicate.id, target: s.heroes[0].id },
      ),
    /legal target/,
  );
  assert.ok(restoreSave(JSON.parse(JSON.stringify(s))));
});
test("trait grants change Gondorian Shield's continuous defense, including after removal", () => {
  let s = fixture();
  s = attach(s, "06005");
  assert.equal(stats(s, s.heroes[0]).defense, 3);
  s = attach(s, "02010");
  s = attach(s, "12003");
  assert.equal(stats(s, s.heroes[0]).defense, 4);
  const h = s.heroes[0];
  discardAttachment(
    s,
    h,
    h.attachments.find((a) => a.code === "12003")!,
  );
  assert.equal(stats(s, h).defense, 3);
});
test("Raiment of War occupies two restricted slots and Golden Belt increases the allowance", () => {
  let s = fixture();
  s = attach(s, "12034");
  assert.equal(restrictedSlots(s.heroes[0]), 2);
  assert.equal(stats(s, s.heroes[0]).health, 7);
  s = attach(s, "22060");
  s = attach(s, "06005");
  assert.equal(s.choice, null);
  assert.equal(restrictedSlots(s.heroes[0]), 3);
  discardAttachment(
    s,
    s.heroes[0],
    s.heroes[0].attachments.find((a) => a.code === "22060")!,
  );
  check(s);
  assert.match(s.choice!.title, /Restricted/);
  const raiment = s.choice!.options.find((o) => o.code === "12034")!;
  s = applyAction(s, { type: "CHOOSE", id: raiment.id });
  assert.equal(restrictedSlots(s.heroes[0]), 1);
});
test("continuous armor loss immediately defeats a character exceeding its remaining health", () => {
  let s = fixture();
  s = attach(s, "03013");
  const h = s.heroes[0];
  damage(s, h.id, 5);
  assert.ok(s.heroes.some((u) => u.id === h.id));
  discardAttachment(s, h, h.attachments[0]);
  check(s);
  assert.ok(!s.heroes.some((u) => u.id === h.id));
});
test("secrecy is a play-cost discount only at threat twenty or less", () => {
  let s = fixture();
  s.threat = 20;
  s = attach(s, "02010");
  s.heroes.forEach((h) => (h.resources = h === s.heroes[0] ? 2 : 0));
  const wanderer = make(s, "04029");
  s.hand = [wanderer];
  assert.equal(canPlay(s, wanderer), null);
  const higher = { ...s, threat: 21 };
  assert.match(canPlay(higher, wanderer)!, /resources/);
  s = applyAction(s, { type: "PLAY", id: wanderer.id });
  assert.equal(s.heroes[0].resources, 0);
  assert.ok(s.allies.some((u) => u.code === "04029"));
});
test("Knight of the White Tower cannot combine pools and never spends an invalid payment", () => {
  let s = fixture();
  s = attach(s, "02010");
  s = attach(s, "02010", s.heroes[1]);
  s.heroes.forEach((h) => (h.resources = 2));
  // Its Leadership sphere and single-pool restriction both apply.
  const knight = make(s, "12139");
  s.hand = [knight];
  assert.match(canPlay(s, knight)!, /single hero/);
  const before = JSON.stringify(s);
  assert.throws(
    () =>
      pay(s, card(knight.code), { [s.heroes[0].id]: 2, [s.heroes[1].id]: 2 }),
    /single hero|resource cost/,
  );
  assert.equal(JSON.stringify(s), before);
  s.heroes[0].resources = Number(card(knight.code).cost);
  assert.equal(canPlay(s, knight), null);
  s = applyAction(s, { type: "PLAY", id: knight.id });
  assert.equal(s.heroes[0].resources, 0);
  assert.equal(s.heroes[1].resources, 2);
});
test("Valiant Determination commits an ally without exhausting it or permitting a duplicate commitment", () => {
  let s = fixture();
  const ally = make(s, "05007");
  s.allies.push(ally);
  s = attach(s, "02081");
  s = attach(s, "19092", s.allies[0]);
  s.phase = "quest";
  s = applyAction(s, { type: "TOGGLE_QUEST", id: ally.id });
  s = applyAction(s, { type: "COMMIT" });
  const committed = s.allies.find((u) => u.id === ally.id)!;
  assert.equal(committed.exhausted, false);
  assert.equal(committed.committed, true);
});
test("attachment-granted Sentinel and Ranged work for other seats and stop after removal", () => {
  let s = createGame(8, tactics.cards, tactics.heroes, tactics.id, {
    seats: [
      { heroes: tactics.heroes, deckId: tactics.id },
      { heroes: ["01001", "01002", "01003"], deckId: "leadership" },
    ],
  });
  s.phase = "planning";
  s.heroes.forEach((h) => (h.resources = 10));
  s = attach(s, "22143", s.heroes[0]);
  const rangedId = s.heroes[0].id;
  selectSeat(s, 1);
  const enemy = make(s, "01082");
  s.engaged = [enemy];
  assert.ok(defendersFor(s).some((u) => u.id === rangedId));
  assert.ok(attackersFor(s, enemy).some((u) => u.id === rangedId));
  selectSeat(s, 0);
  const host = s.heroes.find((h) => h.id === rangedId)!;
  discardAttachment(s, host, host.attachments[0]);
  selectSeat(s, 1);
  assert.ok(!defendersFor(s).some((u) => u.id === rangedId));
  assert.ok(!attackersFor(s, enemy).some((u) => u.id === rangedId));
});

test("Sacked preserves Boromir's constant aura and Elrond's existing ally-payment permission", () => {
  const s = fixture(),
    hero = s.heroes[0];
  hero.code = "05002";
  hero.attachments.push({
    id: "sacked",
    code: CARROCK.sacked,
    exhausted: false,
  });
  const ally = make(s, "05007");
  s.allies.push(ally);
  assert.equal(stats(s, ally).attack, (card(ally.code).attack ?? 0) + 1);
  hero.attachments.push({ id: "fear", code: KHAZAD.fear, exhausted: false });
  assert.equal(stats(s, ally).attack, card(ally.code).attack ?? 0);
  hero.attachments = hero.attachments.filter((a) => a.id !== "fear");
  hero.code = "04128";
  assert.ok(eligiblePayers(s, card("02004")).some((h) => h.id === hero.id));
  hero.attachments.push({ id: "fear2", code: KHAZAD.fear, exhausted: false });
  assert.ok(!eligiblePayers(s, card("02004")).some((h) => h.id === hero.id));
});
