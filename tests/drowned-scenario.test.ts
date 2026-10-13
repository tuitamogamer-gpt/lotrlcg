import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, validateSave } from "../src/game/engine";
import { card } from "../src/game/cards";
import { fx, playCost, prepend, stats, threatOf } from "../src/game/core";
import {
  addVictoryCard,
  advanceQuest,
  check,
  damage,
  destroy,
  engage,
  shadow,
  discardCharacter,
  discardLocation,
  progressLocation,
  readyCharacter,
  revealed,
} from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  allCharacters,
  allEngaged,
  attackersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "../src/game/table";
import { canPlay, optionalEngagementProblem } from "../src/game/actions";
import { syncAttachmentText } from "../src/game/attachment-text";
import {
  DROWNED as D,
  DROWNED_GROTTO_CODES,
  DROWNED_ENCOUNTERS,
  drownedUnderwater,
} from "../src/game/drowned-support";
import {
  drownedFlip,
  drownedQuestStart,
  drownedQuestEnd,
  drownedEncounterStart,
  drownedCannotEngage,
  drownedEffect,
  drownedPublicState,
} from "../src/game/drowned";
import {
  drownedAbilityProblem,
  useDrownedAbility,
  drownedCannotSearch,
} from "../src/game/drowned-companions";
import {
  start,
  base,
  add,
  setActive,
  stage2,
  settle,
  choose,
  reload,
} from "./drowned-fixtures";

const physical = (back: string) =>
  DROWNED_ENCOUNTERS.find(
    (c) => c.back_name === back && c.type_code === "location",
  )!.code;
for (const p of [1, 2, 3, 4])
  for (const easy of [false, true])
    test(`Drowned setup ${p} players ${easy ? "easy" : "normal"} preserves physical decks and companions`, () => {
      const s = reload(start(p, easy)),
        q = s.drowned!;
      assert.equal(s.encounterDeck.length, easy ? 21 : 30);
      assert.equal(s.staging.length, p >= 3 ? 3 : 2);
      assert.equal(q.grottoDeck.length, p >= 3 ? 5 : 6);
      assert.equal(q.setAside.length, 1);
      assert.equal(
        allCharacters(s).filter((u) => u.code === D.sahirAlly).length,
        1,
      );
      assert.equal(
        ownerOf(
          s,
          allCharacters(s).find((u) => u.code === D.naasiyahAlly)!,
        ),
        p - 1,
      );
      assert.equal(Object.values(q.originalCodes).length, 9);
      assert.ok(
        [...q.grottoDeck, ...s.staging].every((u) =>
          u.code.startsWith("drowned-"),
        ),
      );
      const view = JSON.stringify(drownedPublicState(s));
      assert.ok(!view.includes("originalCodes"));
      assert.ok(!view.includes(":B"));
    });
test("Drowned opaque initial physical IDs cannot predict hidden back pair", () => {
  const a = start(1, false, 11).drowned!.originalCodes,
    b = start(1, false, 12).drowned!.originalCodes;
  assert.notDeepEqual(
    Object.entries(a).slice(0, 8),
    Object.entries(b).slice(0, 8),
  );
});
test("Drowned recycling reseals every shuffled card handle while retaining exact face pairs", () => {
  let s = base();
  const u = setActive(s, physical("Dark Abyss"), true);
  drownedFlip(s, u);
  const previous = new Set([...s.drowned!.grottoDeck, u].map((x) => x.id));
  const expected = Object.values(s.drowned!.originalCodes).sort();
  progressLocation(s, u, 99);
  s = settle(s);
  assert.ok(
    [...s.drowned!.grottoDeck, ...s.staging].every((x) => !previous.has(x.id)),
  );
  assert.deepEqual(Object.values(s.drowned!.originalCodes).sort(), expected);
  reload(s);
});
test("Drowned actual travel offers a saved optional flip, clearing progress and restoring front", () => {
  let s = base();
  const u = s.staging[0];
  u.progress = 2;
  s.phase = "travel";
  s = applyAction(s, { type: "TRAVEL", id: u.id });
  assert.match(s.choice!.title, /Flip/);
  s = choose(reload(s), "flip");
  assert.equal(s.activeLocation!.id, u.id);
  assert.equal(s.activeLocation!.progress, 0);
  assert.ok(drownedUnderwater(s));
  s.activeLocation!.progress = 3;
  assert.ok(drownedFlip(s, s.activeLocation!));
  assert.equal(s.activeLocation!.progress, 0);
  assert.equal(s.activeLocation!.code, u.code);
});
test("Drowned Grotto recycle and Underwater victory each replenish exactly one physical location", () => {
  let s = base();
  let u = setActive(s, DROWNED_GROTTO_CODES[0]);
  const q = s.drowned!,
    before = q.grottoDeck.length;
  progressLocation(s, u, 99);
  s = settle(s);
  assert.equal(s.drowned!.grottoDeck.length, before);
  assert.equal(s.drowned!.victoryLocations.length, 0);
  assert.ok(!s.encounterDiscard.includes(u.code));
  u = setActive(s, DROWNED_GROTTO_CODES[0], true);
  const n = s.drowned!.grottoDeck.length;
  progressLocation(s, u, 99);
  s = settle(s);
  assert.equal(s.drowned!.victoryLocations.length, 1);
  assert.equal(s.drowned!.grottoDeck.length, n - 1);
  assert.ok(s.victoryCards!.includes(u.code));
  reload(s);
});
test("Drowned double-sided locations cannot be discarded or lose physical identity on reload", () => {
  const s = base(),
    u = setActive(s, DROWNED_GROTTO_CODES[0]);
  assert.throws(() => discardLocation(s, u));
  const bad = structuredClone(s);
  bad.drowned!.originalCodes[u.id] = "01099";
  assert.equal(validateSave(bad), false);
  reload(s);
});
test("Drowned Underwater play restrictions and Dark Abyss attacks are continuous", () => {
  const s = base(),
    u = setActive(s, physical("Dark Abyss"), true),
    ally = add(s, "01018", "hand"),
    attachment = add(s, "01026", "hand"),
    enemy = add(s, D.scorpion, "engaged");
  assert.match(canPlay(s, ally)!, /Underwater/);
  assert.match(canPlay(s, attachment)!, /Underwater/);
  assert.deepEqual(attackersFor(s, enemy), []);
  assert.equal(stats(s, enemy).attack, (card(enemy.code).attack ?? 0) + 2);
  drownedFlip(s, u);
  assert.equal(drownedUnderwater(s), false);
  assert.ok(attackersFor(s, enemy).length);
  assert.equal(canPlay(s, ally), null);
});
test("Drowned Twisting Hollow stops effect readying while ordinary refresh readies", () => {
  const s = base();
  setActive(s, physical("Twisting Hollow"), true);
  const h = s.heroes[0];
  h.exhausted = true;
  readyCharacter(s, h);
  assert.equal(h.exhausted, true);
  readyCharacter(s, h, false);
  assert.equal(h.exhausted, false);
});
test("Drowned Sunken Temple blanks physical attachments and restores them after flip", () => {
  const s = base(),
    u = setActive(s, physical("Sunken Temple"), true);
  s.heroes[0].attachments.push({
    id: `a${s.nextId++}`,
    code: "01026",
    exhausted: false,
  });
  syncAttachmentText(s);
  assert.equal(s.heroes[0].attachments[0].blanked, true);
  drownedFlip(s, u);
  syncAttachmentText(s);
  assert.equal(s.heroes[0].attachments[0].blanked, undefined);
});
test("Drowned Undersea first ally discount is shared and Halls reduce Undead threat", () => {
  const s = base(2);
  setActive(s, D.undersea);
  assert.equal(
    playCost(s, card("01018")),
    Math.max(0, Number(card("01018").cost) - 1),
  );
  s.drowned!.firstAllyRound = s.round;
  assert.equal(playCost(s, card("01018")), Number(card("01018").cost));
  setActive(s, D.halls);
  const enemy = add(s, D.drowned);
  assert.equal(threatOf(s, enemy), (card(enemy.code).threat ?? 0) - 1);
});
test("Drowned Cave returns every engaged Undead, blocks engagements; Eel surfaces at encounter start", () => {
  const s = base(2);
  s.activeLocation = add(s, D.cave);
  s.staging = s.staging.filter((u) => u.id !== s.activeLocation!.id);
  const a = add(s, D.drowned, "engaged", 0),
    b = add(s, D.cadaver, "engaged", 1);
  check(s);
  assert.equal(allEngaged(s).length, 0);
  assert.ok(s.staging.some((u) => u.id === a.id));
  assert.ok(drownedCannotEngage(s, b));
  assert.ok(optionalEngagementProblem(s, b));
  s.staging.push(s.activeLocation);
  s.activeLocation = null;
  const eel = add(s, D.eel, "engaged", 1);
  drownedEncounterStart(s);
  assert.ok(s.staging.some((u) => u.id === eel.id));
});
test("Drowned Ancient Depths cannot be canceled and reveals exactly one hidden Underwater face", () => {
  let s = base();
  const before = s.drowned!.grottoDeck.length;
  revealed(s, D.ancient);
  s = settle(s);
  assert.equal(s.drowned!.grottoDeck.length, before - 1);
  assert.equal(s.staging.filter((u) => u.code.endsWith(":B")).length, 1);
  reload(s);
});
test("Drowned Undertow locks flips for this round and immediately resolves the active Forced", () => {
  let s = base();
  const u = setActive(s, physical("Sunken Temple"), true);
  allCharacters(s).forEach((c) => (c.resources = 3));
  revealed(s, D.undertow);
  s = settle(s);
  assert.equal(s.drowned!.flipLockedRound, s.round);
  assert.equal(s.heroes[0].resources, 2);
  assert.equal(drownedFlip(s, s.activeLocation!), false);
  s.round++;
  assert.ok(drownedFlip(s, s.activeLocation!));
  assert.equal(s.activeLocation!.id, u.id);
});
test("Drowned Tangling removes each player's committed character and deals underwater damage", () => {
  let s = base(2);
  setActive(s, physical("Sunken Temple"), true);
  for (const p of playerOrder(s)) {
    const h = seatView(s, p).heroes[0];
    h.committed = true;
    seatView(s, p).committedIds = [h.id];
  }
  revealed(s, D.tangling);
  s = settle(s);
  for (const p of playerOrder(s)) {
    assert.equal(seatView(s, p).heroes[0].damage, 2);
    assert.equal(seatView(s, p).heroes[0].committed, false);
  }
});
test("Drowned Into the Abyss supports side quests and surges only if nobody discards", () => {
  let s = base(2);
  add(s, "01018", "hand", 0);
  add(s, "01026", "hand", 1);
  revealed(s, D.abyss);
  flush(s);
  assert.ok(s.choice!.options.some((o) => o.id === "player-side-quest"));
  s = choose(reload(s), "ally");
  s = choose(reload(s), "attachment");
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === "01099"));
});
test("Drowned stage advancement requires three victories; betrayal attacks and removes exact Captain", () => {
  const s = base();
  s.progress = 99;
  advanceQuest(s);
  assert.equal(s.stage, 1);
  const next = stage2(2);
  assert.equal(next.stage, 2);
  assert.equal(next.activeLocation!.code, D.shrine);
  assert.equal(
    allCharacters(next).some((u) => u.code === D.sahirAlly),
    false,
  );
  assert.equal(
    next.drowned!.removedUnits.filter((u) => u.code === D.sahir).length,
    1,
  );
  assert.equal(next.stageRevealing, false);
  reload(next);
});
test("Drowned Shrine keeps progress during forced dive, threatens each player and wins on exploration", () => {
  let s = stage2(2);
  s.activeLocation!.progress = 7;
  drownedQuestStart(s);
  assert.equal(s.activeLocation!.progress, 7);
  assert.equal(s.activeLocation!.code, D.shrine + ":B");
  const threats = playerOrder(s).map((p) => seatView(s, p).threat);
  drownedQuestEnd(s);
  s = settle(s);
  playerOrder(s).forEach((p, i) =>
    assert.equal(seatView(s, p).threat, threats[i] + 5),
  );
  progressLocation(s, s.activeLocation!, 11);
  assert.equal(s.status, "won");
  reload(s);
});
test("Drowned Shrine printed Victory allows escaping before the forced dive", () => {
  const s = stage2();
  progressLocation(s, s.activeLocation!, 18);
  assert.equal(s.status, "won");
  assert.ok(s.victoryCards!.includes(D.shrine));
  reload(s);
});
test("Drowned objective companions keep controller actions, search denial and mandatory loss", () => {
  let s = base(2);
  const sahir = allCharacters(s).find((u) => u.code === D.sahirAlly)!;
  sahir.resources = 0;
  assert.equal(drownedAbilityProblem(s, sahir), null);
  useDrownedAbility(s, sahir);
  s = settle(s);
  assert.equal(allCharacters(s).find((u) => u.id === sahir.id)!.resources, 1);
  const cadaver = add(s, D.cadaver, "engaged", 1);
  assert.ok(drownedCannotSearch(s, 1));
  assert.equal(drownedCannotSearch(s, 0), false);
  cadaver.blanked = true;
  assert.equal(drownedCannotSearch(s, 1), false);
  discardCharacter(
    s,
    allCharacters(s).find((u) => u.code === D.naasiyahAlly)!,
  );
  assert.equal(s.status, "lost");
});
test("Drowned Cadaver bottoms low-cost cards of the engaged player in chosen order", () => {
  let s = base(2);
  const a = add(s, "01026", "hand", 1),
    b = add(s, "01018", "hand", 1),
    enemy = add(s, D.cadaver);
  forOwner(s, 1, () => engage(s, enemy));
  s = settle(s);
  assert.equal(
    seatView(s, 1).hand.some((u) => u.id === a.id),
    false,
  );
  assert.equal(seatView(s, 1).deck.at(-1), a.code);
  assert.equal(
    seatView(s, 1).hand.some((u) => u.id === b.id),
    true,
  );
  reload(s);
});
test("Drowned Throngs destruction reads the engaged owner's bottom card and recycles only low cost", () => {
  let s = base(2);
  forOwner(s, 1, () => (s.deck = ["01073", "01026"]));
  const enemy = add(s, D.throngs, "engaged", 1);
  destroy(s, enemy);
  s = settle(s);
  assert.equal(s.encounterDeck[0], D.throngs);
  assert.ok(seatView(s, 1).discard.includes("01026"));
  forOwner(s, 1, () => (s.deck = ["01026", "01073"]));
  const other = add(s, D.throngs, "engaged", 1);
  destroy(s, other);
  s = settle(s);
  assert.ok(s.encounterDiscard.includes(D.throngs));
});
test("Drowned Dead attack destruction and Curse damage preserve the physical ally on bottom", () => {
  let s = base();
  const enemy = add(s, D.drowned, "engaged"),
    ally = add(s, "01013", "allies");
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: ally.id,
    defenderIds: [ally.id],
    attackBonus: 0,
    damageDealt: 0,
  };
  damage(s, ally.id, 99, { combatDamage: true, enemyId: enemy.id });
  assert.equal(s.deck.at(-1), ally.code);
  assert.ok(!s.discard.includes(ally.code));
  s.combat = null;
  const another = add(s, "01013", "allies");
  another.damage = (card(another.code).health ?? 1) - 1;
  revealed(s, D.curse);
  s = settle(s);
  assert.equal(s.deck.at(-1), another.code);
  reload(s);
});
test("Drowned shadows use Underwater attack bonus and discard a controlled location attachment", () => {
  let s = base();
  const enemy = add(s, D.scorpion, "engaged");
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    damageDealt: 0,
  };
  shadow(s, D.ancient);
  assert.equal(s.combat.attackBonus, 1);
  const location = setActive(s, physical("Sunken Temple"), true);
  shadow(s, D.scorpion);
  assert.equal(s.combat.attackBonus, 3);
  drownedFlip(s, location);
  location.attachments.push({
    id: `a${s.nextId++}`,
    code: "02056",
    exhausted: false,
    owner: 0,
    controller: 0,
  });
  shadow(s, D.tangling);
  s = settle(s);
  assert.equal(s.activeLocation!.attachments.length, 0);
});
test("Drowned Abyss shadow searches Creature without revealing its text and Curse schedules additional attack", () => {
  let s = base();
  setActive(s, physical("Dark Abyss"), true);
  const enemy = add(s, D.scorpion, "engaged");
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: 0,
    defenderId: null,
    defenderIds: [],
    attackBonus: 0,
    damageDealt: 0,
  };
  s.encounterDeck = [D.eel];
  shadow(s, D.abyss);
  s = settle(s);
  assert.ok(s.staging.some((u) => u.code === D.eel));
  s.deck = ["01026"];
  shadow(s, D.curse);
  assert.equal(s.combat!.extraAttacks, 1);
  assert.ok(s.discard.includes("01026"));
  shadow(s, D.drowned);
  assert.equal(s.combat!.fateBottomOnAllyKill, true);
});
