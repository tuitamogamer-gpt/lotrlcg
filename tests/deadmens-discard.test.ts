import assert from "node:assert/strict";
import test from "node:test";
import { base } from "./against-shadow-final-fixtures.ts";
import { make, fx } from "../src/game/core.ts";
import { DIKE } from "../src/game/deadmens-dike-support.ts";
import { dikeCannotLeaveDiscard } from "../src/game/deadmens-discard.ts";
import {
  bloodPlayerAbilityProblem,
  bloodPlayerEventEffect,
  useBloodPlayerAbility,
} from "../src/game/blood-gondor-player-cards.ts";
import { handleElfPlayerEffect } from "../src/game/elf-player-cards.ts";
import { handleLongDarkPlayerEffect } from "../src/game/long-dark-player-cards.ts";
import { ringMakerEffect } from "../src/game/ring-maker-player.ts";
import { handleDwarfPlayerEffect } from "../src/game/dwarf-player-cards.ts";
import {
  rhosgobelCharacterDestroyed,
  handleRhosgobelPlayerEffect,
} from "../src/game/rhosgobel-player-cards.ts";
import { useShadowFlamePlayerAbility } from "../src/game/shadow-flame-player-cards.ts";
import { dunlandEffect } from "../src/game/dunland-trap-player.ts";
import { expansionEventEffect } from "../src/game/expansion-player-cards.ts";
import { osgiliathPlayerPlayProblem } from "../src/game/osgiliath-player-cards.ts";
import {
  holdPlayedEvent,
  finishPlayedEvent,
  returnPlayedEventToHand,
} from "../src/game/event-resolution.ts";
import { seatView } from "../src/game/table.ts";
import {
  discardCharacter,
  returnAlly,
  takePlayerDiscard,
} from "../src/game/board.ts";
import { flush } from "../src/game/effects.ts";
import type { GameState } from "../src/game/types.ts";

function fixture(players = 1) {
  const s = base("mirkwood", players);
  s.deck = Array(20).fill("01016");
  s.staging.push(make(s, DIKE.power));
  return s;
}
function removePower(s: GameState) {
  s.staging = s.staging.filter((u) => u.code !== DIKE.power);
}

test("Power protects every player's discard while another quest is current", () => {
  const s = fixture(2);
  assert.ok(dikeCannotLeaveDiscard(s, 0));
  assert.ok(dikeCannotLeaveDiscard(s, 1));
  s.staging[0].blanked = true;
  assert.equal(dikeCannotLeaveDiscard(s, 0), false);
  s.staging[0].blanked = false;
  removePower(s);
  assert.equal(dikeCannotLeaveDiscard(s, 1), false);
});

test("Caldara and Anborn cannot spend their costs on protected discard targets", () => {
  const s = fixture();
  const caldara = make(s, "06107");
  s.heroes = [caldara, make(s, "01007"), make(s, "01009")];
  s.discard = ["01045", "06115"];
  const anborn = make(s, "06114");
  s.allies.push(anborn);
  assert.ok(bloodPlayerAbilityProblem(s, caldara));
  assert.ok(bloodPlayerAbilityProblem(s, anborn));
  assert.throws(() => useBloodPlayerAbility(s, caldara));
  assert.throws(() => useBloodPlayerAbility(s, anborn));
  assert.ok(s.heroes.includes(caldara));
  assert.equal(anborn.exhausted, false);
  assert.deepEqual(s.used, []);
  removePower(s);
  assert.equal(bloodPlayerAbilityProblem(s, caldara), undefined);
  assert.equal(bloodPlayerAbilityProblem(s, anborn), undefined);
});

test("Orophin, Gwaihir and Háma do not offer protected recovery Responses", () => {
  const s = fixture();
  const orophin = make(s, "08114");
  const gwaihir = make(s, "08059");
  const hama = make(s, "04076");
  s.allies.push(orophin, gwaihir);
  s.heroes.push(hama);
  s.discard = ["02102", "02004", "01034"];
  handleElfPlayerEffect(s, fx("elfAllyResponse", { target: orophin.id }));
  assert.equal(s.choice, null);
  ringMakerEffect(s, fx("ringGwaihirOffer", { source: gwaihir.id }));
  assert.equal(s.choice, null);
  handleLongDarkPlayerEffect(
    s,
    fx("longDarkHamaResponse", { source: hama.id }),
  );
  assert.equal(s.choice, null);
  removePower(s);
  ringMakerEffect(s, fx("ringGwaihirOffer", { source: gwaihir.id }));
  assert.equal(s.choice?.title, "Gwaihir · Return an Eagle from discard");
});

test("A Very Good Tale still discards cards but cannot put them into play", () => {
  const s = fixture();
  const a = make(s, "01016");
  const b = make(s, "09004");
  s.allies = [a, b];
  handleDwarfPlayerEffect(s, fx("dwarfTaleMine", { ids: [a.id, b.id] }));
  assert.equal(s.discard.length, 5);
  assert.deepEqual(s.allies, [a, b]);
  assert.ok(a.exhausted && b.exhausted);
  assert.equal(s.choice, null);
});

test("Prospector discards three without offering illegal recovery; Hidden Cache still works", () => {
  const s = fixture();
  s.deck = ["06143", "12066", "01016", ...s.deck];
  handleDwarfPlayerEffect(s, fx("dwarfProspectorMine"));
  assert.equal(s.choice, null);
  assert.deepEqual(s.discard, ["06143", "12066", "01016"]);
  handleDwarfPlayerEffect(s, fx("dwarfMiningResponse", { code: "12066" }));
  assert.equal(s.choice, null);
  handleDwarfPlayerEffect(s, fx("dwarfMiningResponse", { code: "06143" }));
  assert.equal(s.choice?.title, "Hidden Cache · Discarded from deck");
  const hero = s.heroes[0];
  const resources = hero.resources;
  handleDwarfPlayerEffect(s, fx("dwarfCacheResources", { target: hero.id }));
  assert.equal(hero.resources, resources + 2);
  assert.ok(s.discard.includes("06143"));
});

test("Well-Equipped discards its actual cards without attaching protected cards", () => {
  const s = fixture();
  s.heroes.push(make(s, "01004"));
  s.deck = ["04031", "01016", ...s.deck];
  bloodPlayerEventEffect(s, "06116");
  assert.deepEqual(s.discard, ["04031", "01016"]);
  assert.equal(s.choice, null);
  assert.ok(s.heroes.every((h) => h.attachments.length === 0));
});

test("Landroval and To the Eyrie cannot recover a different player's protected discard", () => {
  const s = fixture(2);
  const hero = make(s, "01004");
  const ally = make(s, "01016");
  hero.owner = 1;
  ally.owner = 1;
  seatView(s, 1).discard.push(hero.code, ally.code);
  s.allies.push(make(s, "02053"), make(s, "02004"));
  s.hand.push(make(s, "02054"));
  rhosgobelCharacterDestroyed(s, hero, 1);
  rhosgobelCharacterDestroyed(s, ally, 1);
  assert.equal(s.queue.length, 0);
  handleRhosgobelPlayerEffect(
    s,
    fx("rhosEyrieResponse", {
      code: ally.code,
      count: 1,
      target: ally.id,
    }),
  );
  assert.equal(s.choice, null);
  assert.ok(s.allies.every((u) => !u.exhausted));
  assert.ok(s.hand.some((u) => u.code === "02054"));
});

test("Miruvor can grant its other benefits while its discard-to-deck choice is absent", () => {
  const s = fixture();
  const hero = s.heroes[0];
  hero.attachments.push({
    id: "protected-miruvor",
    code: "04133",
    exhausted: false,
  });
  useShadowFlamePlayerAbility(s, hero, "protected-miruvor");
  assert.ok(s.discard.includes("04133"));
  assert.deepEqual(s.choice?.options.map((o) => o.id).sort(), [
    "resource",
    "will",
  ]);
});

test("White Council excludes protected shuffle but retains other effects", () => {
  const s = fixture();
  s.discard = ["01016"];
  dunlandEffect(s, fx("dunlandCouncilStep", { ids: ["0"], text: "[]" }));
  assert.ok(s.choice?.options.some((o) => o.id === "resource"));
  assert.ok(!s.choice?.options.some((o) => o.id === "shuffle"));
  assert.throws(() =>
    dunlandEffect(
      s,
      fx("dunlandCouncilShuffle", {
        value: 0,
        code: "01016",
      }),
    ),
  );
  assert.deepEqual(s.discard, ["01016"]);
});

test("Second Breakfast leaves each player's actual attachments in discard", () => {
  const s = fixture(2);
  s.discard.push("04031");
  seatView(s, 1).discard.push("04133");
  expansionEventEffect(s, "02027");
  assert.deepEqual(s.discard, ["04031"]);
  assert.deepEqual(seatView(s, 1).discard, ["04133"]);
  assert.equal(s.hand.length, 0);
  assert.equal(seatView(s, 1).hand.length, 0);
});

test("Men of the West has no legal protected Outlands targets", () => {
  const s = fixture();
  s.discard = ["06008"];
  assert.ok(osgiliathPlayerPlayProblem(s, "06083"));
});

test("Power allows a resolving event to return itself before entering discard", () => {
  const s = fixture();
  const event = make(s, "02124");
  s.discard = [event.code];
  assert.equal(returnPlayedEventToHand(s, event.code, undefined, 0), false);
  assert.deepEqual(s.discard, [event.code]);
  holdPlayedEvent(s, event);
  assert.ok(returnPlayedEventToHand(s, event.code, event.id));
  finishPlayedEvent(s, event.id);
  assert.ok(s.hand.some((u) => u.id === event.id));
  assert.deepEqual(s.discard, [event.code]);
});

test("Power blocks Eagles of the Misty Mountains from discard but permits hand attachment", () => {
  const s = fixture();
  const collector = make(s, "02119");
  const departed = make(s, "02004");
  s.allies.push(collector, departed);
  discardCharacter(s, departed);
  flush(s);
  assert.equal(s.choice, null);
  assert.ok(s.discard.includes(departed.code));
  const returned = make(s, "02004");
  s.allies.push(returned);
  returnAlly(s, returned);
  flush(s);
  assert.equal(
    s.choice?.title,
    "Eagles of the Misty Mountains · Eagle left play",
  );
  assert.ok(s.choice?.options.some((o) => o.id === collector.id));
});

test("a player card's pure discard-zone movement cost remains legal", () => {
  const s = fixture();
  s.discard = ["08007"];
  const threat = s.threat;
  dunlandEffect(
    s,
    fx("dunlandFallOffer", {
      source: "fallen-song",
      owner: 0,
      value: 0,
      count: 9,
    }),
  );
  assert.ok(s.choice?.options.some((o) => o.id === "victory"));
  s.choice = null;
  dunlandEffect(
    s,
    fx("dunlandFallVictory", {
      source: "fallen-song",
      owner: 0,
      value: 0,
      count: 9,
    }),
  );
  assert.equal(s.threat, threat - 9);
  assert.deepEqual(s.discard, []);
  assert.ok(s.victoryCards?.includes("08007"));
});

test("generic discard removal guards player effects and permits encounter recovery", () => {
  const s = fixture();
  s.discard = ["01016"];
  assert.throws(() => takePlayerDiscard(s, 0));
  assert.deepEqual(s.discard, ["01016"]);
  assert.equal(
    takePlayerDiscard(s, 0, { encounterEffect: true }).code,
    "01016",
  );
  assert.deepEqual(s.discard, []);
});
