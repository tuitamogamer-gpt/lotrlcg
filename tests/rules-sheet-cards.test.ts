import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import rulesSheet from "../src/data/rules-sheet-cards.json";
import art from "./rules-sheet-art.json";
import { card, plain, SCRIPTED, STARTERS } from "../src/game/cards";
import { createGame } from "../src/game/engine";
import { cachedImageSource } from "../src/game/scenario-image-source";
import { automatedScenarioId, isAutomatedCard } from "../src/game/support";
import { autoplay } from "./nightmare-fixtures";
import type { Card, GameState, ScenarioId } from "../src/game/types";

const catalog = JSON.parse(
  readFileSync(new URL("../public/catalog.json", import.meta.url), "utf8"),
) as Card[];
const recipes = JSON.parse(
  readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
) as { name: string; mode: string }[];
const original = (code: string) => catalog.find((c) => c.code === code)!;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// The publisher's rules PDFs (bytes, SHA-256), at
// https://cdn.svc.asmodee.net/production-fantasyflightgames/uploads/2026/09/.
const PDFS: Record<string, [number, string]> = {
  "mec40-escape-from-mount-gram-rulesheet.pdf": [
    4155145,
    "7b42b4bea1b40b58791ce678e229c15aadb770322e05b8a01de8dfe9e083ca36",
  ],
  "mec41_rules.pdf": [
    866466,
    "de34db06de79ed933ca96f023697d8f34061e0f0ee6c684d92233f0cd2929a08",
  ],
  "mec42_rules.pdf": [
    817754,
    "7a4453cdbd7b7adc73e6521baa1d4d9b957e2c08a6a64081f27731d61d622de7",
  ],
  "mec43_rules.pdf": [
    930171,
    "37318c6d64394e6ca6880b6bd82711d625fbe5226f5d2832131e19044e8e4c5b",
  ],
  "mec44_rules.pdf": [
    685875,
    "4862660c758abb00162c5e8924b06fe7a7ed7343312b96557b05c8519c9c0e3e",
  ],
  "mec47_rules.pdf": [
    7675744,
    "672ec9860bc2693a7bd81c5b9452de403f2e986bea74769ad3ca238db2df3bb2",
  ],
  "mec48_rules.pdf": [
    3327137,
    "b7402186d9092da5fd03d446b888b6a808be9102be93e14eafde04d233bab287",
  ],
  "mec49_rules.pdf": [
    744993,
    "48c07078e3cb7f1b99edd5f79a2840957fa07c159d3ebe6423e5e18fa180435d",
  ],
  "mec50_rules.pdf": [
    4738779,
    "3b11dd6e2cb5d60dbf4a65dacb7d7448cbb1c220ef4f40acb44e443885d7e5e2",
  ],
  "mec51_rules.pdf": [
    659910,
    "36064c53afa3b9d76847a9ac3e9ce0286407261fa1fdeef2dfe008dc0b3d5e09",
  ],
  "mec52_rules.pdf": [
    728608,
    "ecab681920e85d0d0bd9a0dd165666ee9456f8c6f533282c9b79faee0cd1db1c",
  ],
  "mec53_rules.pdf": [
    605953,
    "aa72904f75f3953b790c989120facbfacb063c649576bc781edaa04d80d54761",
  ],
  "mec55_rules_webready.pdf": [
    3678999,
    "dda538cf6c73514cdab24f2df02ddfc05e6cd3ee50d9d31f147e6858b84f2ba4",
  ],
  "mec57_web_race_across_harad-rules.pdf": [
    5502300,
    "60f47b97c765b9535f65d6b369070d2cf91330ed61729801b58e88c902ff7990",
  ],
  "mec58_web_beneath_the_sands-rules.pdf": [
    2716010,
    "1301f6a1b0f3b30520df349ea0226dd35a8d477ce8d58871e3b60b8ad4875d33",
  ],
  "mec59_web_the_black_serpent-rules.pdf": [
    2861729,
    "24c4f78d2eb1e50c0e34c190f0d5061fa76ad24ac1490993d3819d49f911dab1",
  ],
  "mec60_web_the_dungeons_of_cirith-rules.pdf": [
    3202557,
    "68c7d968c1122f34331e31d97117f3cb99ec20a32ded71991525aaef6c5bd480",
  ],
};
// [scenario, first line, difficulty level (null on a card that continues
// another), source: a rules PDF, or "scan" for the reference card's own text,
// whether the card has scans of both faces].
type Row = [string, string, number | null, string, boolean];
const CARDS: Record<string, Row> = {
  "17b3b108-af37-4894-9d09-4b34f995c0a3": [
    "Escape from Mount Gram",
    '"Escape from Mount Gram" is played',
    5,
    "mec40-escape-from-mount-gram-rulesheet.pdf",
    true,
  ],
  "e2a2f3af-8cfe-4038-845c-443246682a81": [
    "Escape from Mount Gram",
    "Creating a Staging Area",
    null,
    "mec40-escape-from-mount-gram-rulesheet.pdf",
    true,
  ],
  "788819a1-c0b5-4dd0-b778-f3011ca05175": [
    "Across the Ettenmoors",
    '"Across the Ettenmoors" is played',
    4,
    "mec41_rules.pdf",
    true,
  ],
  "d0ab3d77-e84b-41b8-bb9b-f9be302ef1ef": [
    "The Treachery of Rhudaur",
    '"The Treachery of Rhudaur" is played',
    5,
    "mec42_rules.pdf",
    true,
  ],
  "9ca8dc18-a6f5-478b-8870-e151d853a28d": [
    "The Battle of Carn Dûm",
    '"The Battle of Carn Dûm" is played',
    8,
    "mec43_rules.pdf",
    true,
  ],
  "74f12c0b-6c63-4b2e-a15f-41b179b9dec9": [
    "The Dread Realm",
    '"The Dread Realm" is played',
    7,
    "mec44_rules.pdf",
    true,
  ],
  "ba62a8f1-1857-4449-8f49-7b584b9aaa7d": [
    "The Passage of the Marshes",
    "Mire X",
    null,
    "scan",
    true,
  ],
  "c59be48d-ccec-4409-92b3-9f2e74f01012": [
    "Voyage Across Belegaer",
    "The Voyage Across Belegaer encounter deck",
    5,
    "mec47_rules.pdf",
    true,
  ],
  "29349448-e37d-4741-a7df-4bb57c195437": [
    "Voyage Across Belegaer",
    "Preparing Your Fleet",
    null,
    "mec47_rules.pdf",
    true,
  ],
  "a1bb437e-1cbc-4780-bbee-f9ad07cb8d7a": [
    "Voyage Across Belegaer",
    "Sailing",
    null,
    "mec47_rules.pdf",
    true,
  ],
  "ac1958aa-f119-423f-ac1e-cb04c58e641b": [
    "The Fate of Númenor",
    "The Fate of Númenor encounter deck",
    5,
    "mec47_rules.pdf",
    true,
  ],
  "24a555aa-6987-4189-ac1d-60a74263bd87": [
    "Raid on the Grey Havens",
    "The Raid on the Grey Havens encounter deck",
    6,
    "mec47_rules.pdf",
    true,
  ],
  "5484e07e-b5a2-470a-84ba-be78062a61f2": [
    "Flight of the Stormcaller",
    '"Flight of the Stormcaller" is played',
    6,
    "mec48_rules.pdf",
    true,
  ],
  "92b2ea69-3f7f-4bbd-b3e0-c6c98cbbde9d": [
    "The Thing in the Depths",
    '"The Thing in the Depths" is played',
    5,
    "mec49_rules.pdf",
    false,
  ],
  "4fcbffac-5e31-4c8f-bf94-d8ad96927e2e": [
    "Temple of the Deceived",
    '"Temple of the Deceived" is played',
    4,
    "mec50_rules.pdf",
    true,
  ],
  "7217415c-c4c1-4e03-8a62-90611f5d6ecf": [
    "Temple of the Deceived",
    "When the players quest successfully",
    null,
    "mec50_rules.pdf",
    true,
  ],
  "d41a03fa-e124-4e40-99b2-2ea4f71930f1": [
    "The Drowned Ruins",
    '"The Drowned Ruins" is played',
    6,
    "mec51_rules.pdf",
    true,
  ],
  "8ed3dcd6-b234-4ab2-b6c4-1eae855d5835": [
    "A Storm on Cobas Haven",
    '"A Storm on Cobas Haven" is played',
    7,
    "mec52_rules.pdf",
    true,
  ],
  "18237a67-26d2-4863-bde7-5ac45b498de2": [
    "The City of Corsairs",
    '"The City of Corsairs" is played',
    8,
    "mec53_rules.pdf",
    true,
  ],
  "aed476de-1dc2-4116-9b53-a01e7b86537e": [
    "Escape from Umbar",
    '"Escape from Umbar" is played',
    5,
    "mec55_rules_webready.pdf",
    false,
  ],
  "668faef5-929f-46d6-90cd-1812edc5d436": [
    "Desert Crossing",
    '"Desert Crossing" is played',
    6,
    "mec55_rules_webready.pdf",
    false,
  ],
  "c8b7732f-8513-4797-a5a3-c579e5d353da": [
    "The Long Arm of Mordor",
    '"The Long Arm of Mordor" is played',
    7,
    "mec55_rules_webready.pdf",
    false,
  ],
  "f1a0f23e-266d-4c2b-8c95-821bf97da6c9": [
    "Race Across Harad",
    '"Race Across Harad" is played',
    6,
    "mec57_web_race_across_harad-rules.pdf",
    false,
  ],
  "47f8f7e5-d5d0-4e11-9c43-22c4bc42b840": [
    "Beneath the Sands",
    '"Beneath the Sands" is played',
    5,
    "mec58_web_beneath_the_sands-rules.pdf",
    false,
  ],
  "6bfd4958-3d16-444d-9fce-d95ed07990b4": [
    "The Black Serpent",
    '"The Black Serpent" is played',
    8,
    "mec59_web_the_black_serpent-rules.pdf",
    false,
  ],
  "2cb311f2-2715-4b0a-a666-0cf0d5dbcf1b": [
    "The Dungeons of Cirith Gurat",
    '"The Dungeons of Cirith Gurat" is played',
    7,
    "mec60_web_the_dungeons_of_cirith-rules.pdf",
    false,
  ],
};
const codes = Object.keys(CARDS).map((g) => `octgn:${g}`);
const difficulty = (text: string) =>
  /\nDifficulty [Ll]evel = (\d+)\.?$/.exec(text)?.[1];

test("the 26 rulesheet cards are registered references with their rules transcribed", () => {
  assert.equal(rulesSheet.length, 26);
  assert.deepEqual(rulesSheet.map((c) => c.code).sort(), [...codes].sort());
  for (const data of rulesSheet as Card[]) {
    const source = original(data.code);
    const [scenario] = CARDS[data.code.slice("octgn:".length)];
    assert.ok(SCRIPTED.has(data.code) && isAutomatedCard(source), data.name);
    assert.deepEqual(card(data.code), data);
    assert.equal(data.name, scenario);
    assert.equal(data.type_code, "rules");
    assert.equal(data.quantity, 0, `${data.name}: never in a deck`);
    // The snapshot's placeholders ("Rulesheet Card 1") are replaced.
    assert.match(source.text!, /^Rulesheet Card (Side )?\d$|^Rules Card$/);
    assert.doesNotMatch(data.text!, /Rulesheet Card|Rules Card/);
    assert.doesNotMatch(data.text! + (data.back_text ?? ""), /[“”’]/);
    for (const field of [
      "octgnid",
      "name",
      "sphere_code",
      "is_unique",
      "pack_code",
      "pack_name",
      "position",
      "encounter_set",
      "packs",
      "source",
      "source_url",
      "official",
      "nightmare",
    ] as const)
      assert.deepEqual(data[field], source[field], `${data.name}: ${field}`);
  }
  // With the ten registered earlier, every rulesheet card in the snapshot is
  // now registered.
  const all = catalog.filter((c) => c.type_code === "rules");
  assert.equal(all.length, 36);
  assert.ok(all.every((c) => SCRIPTED.has(c.code)));
});

test("each card follows its source, face by face", () => {
  for (const [guid, [scenario, first, level, src, scanned]] of Object.entries(
    CARDS,
  )) {
    const c = card(`octgn:${guid}`);
    assert.ok(src === "scan" || PDFS[src], `${scenario}: ${src}`);
    assert.ok(c.text!.startsWith(first), `${scenario}: ${first}`);
    assert.equal(difficulty(c.text!), level?.toString(), `${scenario} level`);
    if (scanned) {
      assert.equal(c.imagesrc, `/cards/${guid}.jpg`);
      assert.equal(c.back_imagesrc, `/cards/${guid}.B.jpg`);
      assert.equal(c.back_type_code, "rules");
      assert.equal(c.back_name, scenario);
    } else {
      // No scan: the snapshot's image address stays, with one face and no
      // placeholder reverse.
      assert.equal(c.imagesrc, original(c.code).imagesrc);
      assert.equal(c.back_text, undefined);
      assert.equal(c.back_imagesrc, undefined);
    }
  }
  assert.equal(Object.keys(PDFS).length, 17);
  for (const [file, [bytes, hash]] of Object.entries(PDFS))
    assert.ok(
      file.endsWith(".pdf") && bytes > 600000 && /^[0-9a-f]{64}$/.test(hash),
    );
  // A blank back carries no text.
  for (const guid of [
    "74f12c0b-6c63-4b2e-a15f-41b179b9dec9",
    "ba62a8f1-1857-4449-8f49-7b584b9aaa7d",
  ])
    assert.equal(card(`octgn:${guid}`).back_text, "");
});

test("the rulesheets' rules replace the reference cards' condensed wording", () => {
  const ettenmoors = card("octgn:788819a1-c0b5-4dd0-b778-f3011ca05175");
  assert.match(
    ettenmoors.back_text!,
    /Amarthiúl also has the text: "If Amarthiúl leaves play, the players lose the game\."/,
  );
  assert.match(ettenmoors.text!, /\nValour\n.*\nBattle\n/s);
  assert.doesNotMatch(
    card("octgn:d0ab3d77-e84b-41b8-bb9b-f9be302ef1ef").back_text!,
    /has has/,
  );
  assert.match(
    card("octgn:9ca8dc18-a6f5-478b-8870-e151d853a28d").text!,
    /Because Thaurdir has no encounter card back, he cannot be placed or shuffled into the encounter deck for any reason\./,
  );
  const fate = card("octgn:ac1958aa-f119-423f-ac1e-cb04c58e641b");
  assert.match(fate.text!, /although progress may still be placed on them/);
  assert.match(
    fate.back_text!,
    /Double-sided locations cannot enter the encounter deck\. If a double-sided location would enter the discard pile/,
  );
  assert.match(fate.back_text!, /\nPreparing the Uncharted Deck\n/);
  const stormcaller = card("octgn:5484e07e-b5a2-470a-84ba-be78062a61f2");
  assert.match(stormcaller.text!, /stage 4C, in that order\./);
  assert.match(
    stormcaller.back_text!,
    /"2B–Full Sail Ahead!" and "2D–Full Sail Ahead!", for example/,
  );
  assert.match(
    card("octgn:18237a67-26d2-4863-bde7-5ac45b498de2").back_text!,
    /^Indestructible\nAn enemy with the indestructible keyword cannot be destroyed by damage/,
  );
  const drowned = card("octgn:d41a03fa-e124-4e40-99b2-2ea4f71930f1");
  assert.doesNotMatch(drowned.text! + drowned.back_text!, /plaers| bac /);
  // Voyage Across Belegaer's first card and A Storm on Cobas Haven's carry
  // the same Grey Havens ship rules; Cobas Haven's insert adds none.
  const voyage = card("octgn:c59be48d-ccec-4409-92b3-9f2e74f01012"),
    cobas = card("octgn:8ed3dcd6-b234-4ab2-b6c4-1eae855d5835");
  assert.equal(voyage.back_text, cobas.back_text);
  const ships = (t: string) =>
    t.slice(t.indexOf("\nShips\n"), t.lastIndexOf("\nDifficulty"));
  assert.equal(ships(voyage.text!), ships(cobas.text!));
  assert.match(
    voyage.text!,
    /\nImportant: Generally, ships can only attack or defend against other ships\./,
  );
  // The Heading symbols are glyphs; card icons render as words.
  const heading = card("octgn:29349448-e37d-4741-a7df-4bb57c195437");
  assert.match(heading.text!, /sets it to ☀\.$/m);
  assert.match(heading.back_text!, /^☀: .*\n☁ \/ 🌧: .*\n⚡: /);
  const sailing = card("octgn:a1bb437e-1cbc-4780-bbee-f9ad07cb8d7a");
  assert.match(sailing.back_text!, /^Some encounter cards have a ☸ symbol/);
  assert.match(
    sailing.back_text!,
    /If no ☸ symbols are found, your heading stays the same\./,
  );
  assert.match(
    plain(card("octgn:74f12c0b-6c63-4b2e-a15f-41b179b9dec9").text),
    /2 threat, 2 attack, 2 defense, and 2 hit points/,
  );
  assert.match(
    plain(card("octgn:9ca8dc18-a6f5-478b-8870-e151d853a28d").back_text),
    /count their total attack instead of their total willpower/,
  );
  // The Passage of the Marshes keeps its reference card's text.
  assert.match(
    card("octgn:ba62a8f1-1857-4449-8f49-7b584b9aaa7d").text!,
    /^Mire X\nMire is a new keyword/,
  );
});

test("all 36 scanned faces are pinned and served locally", () => {
  assert.equal(art.length, 36);
  for (const face of art) {
    const c = card(face.code);
    const bytes = readFileSync(
      new URL(`../public${face.localPath}`, import.meta.url),
    );
    assert.equal(bytes.length, face.bytes, face.localPath);
    assert.equal(sha(bytes), face.sha256, face.localPath);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, `${face.localPath}: JPEG`);
    assert.equal(
      face.face === "back" ? c.back_imagesrc : c.imagesrc,
      face.localPath,
    );
    // The snapshot's image addresses resolve to the same local scans.
    assert.equal(
      face.face === "back"
        ? original(face.code).back_imagesrc
        : original(face.code).imagesrc,
      face.source,
    );
    assert.equal(cachedImageSource(face.source), face.localPath);
  }
});

test("eight cards without scans carry the scenario rules from the publisher's rules PDFs", () => {
  assert.match(
    card("octgn:92b2ea69-3f7f-4bbd-b3e0-c6c98cbbde9d").text!,
    /\nGrapple\nGrapple is a new keyword/,
  );
  assert.match(
    card("octgn:668faef5-929f-46d6-90cd-1812edc5d436").text!,
    /If the temperature reaches 60, the players lose the game\./,
  );
  assert.match(
    card("octgn:c8b7732f-8513-4797-a5a3-c579e5d353da").text!,
    /\nObjective-Heroes\n.*\nHeroes in the Staging Area\n.*\nGuarded Heroes\n.*\nStage Number\n/s,
  );
  for (const guid of [
    "47f8f7e5-d5d0-4e11-9c43-22c4bc42b840",
    "6bfd4958-3d16-444d-9fce-d95ed07990b4",
    "2cb311f2-2715-4b0a-a666-0cf0d5dbcf1b",
  ])
    assert.match(
      card(`octgn:${guid}`).text!,
      /\nValour\nValour is a trigger .* if your threat is 40 or higher\.\nDifficulty/,
    );
});

test("rulesheet cards never enter a game of their scenarios", () => {
  const names = new Set(rulesSheet.map((c) => c.name));
  const scenarios = new Set<ScenarioId>();
  for (const r of recipes) {
    const base = r.name.replace(/ \((Easy|Nightmare|Campaign)\)$/, "");
    const id = automatedScenarioId(r as never);
    if (names.has(base) && id && r.mode === "standard") scenarios.add(id);
  }
  assert.equal(scenarios.size, 22);
  for (const scenarioId of scenarios)
    for (const easy of [false, true]) {
      let s: GameState = createGame(
        7,
        STARTERS[0].cards,
        STARTERS[0].heroes,
        STARTERS[0].id,
        { scenarioId, easy },
      );
      s = autoplay(s, 30);
      const json = JSON.stringify(s);
      for (const code of codes)
        assert.ok(!json.includes(code), `${scenarioId}: ${card(code).name}`);
    }
});
