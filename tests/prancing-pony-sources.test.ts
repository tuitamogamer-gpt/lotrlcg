import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  PP,
  PP_ENCOUNTERS,
  PP_HIDEOUTS,
  PP_QUESTS,
  PP_RECIPES,
  PP_SUSPECTS,
  ppRecipe,
  printedInvestigate,
} from "../src/game/prancing-pony-support";
import { card } from "../src/game/cards";
import snapshot from "../src/data/pending/murder-at-the-prancing-pony-import.json";
import art from "./prancing-pony-art.json";
import quantities from "./prancing-pony-source-quantities.json";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const original = (code: string) => snapshot.cards.find((c) => c.code === code)!;
const total = (easy: boolean, code: string) =>
  ppRecipe(easy)
    .cards.filter((c) => c.code === code)
    .reduce((n, c) => n + c.quantity, 0);

test("Murder at the Prancing Pony keeps Hall of Beorn's quantities and pins an immutable snapshot", () => {
  assert.equal(snapshot.cards.length, 31);
  assert.equal(snapshot.artwork.length, 36);
  assert.deepEqual(
    [...PP_ENCOUNTERS, ...PP_QUESTS].map((c) => c.code).sort(),
    snapshot.cards.map((c) => c.code).sort(),
  );
  assert.deepEqual(PP_RECIPES, snapshot.recipes);
  assert.deepEqual(
    PP_RECIPES.map((r) => r.id),
    ["E99.07", "Q99.07"],
  );
  assert.equal(quantities.length, 31);
  for (const row of quantities) {
    assert.equal(total(false, row.code), row.normal, row.name);
    assert.equal(total(true, row.code), row.easy, row.name);
    assert.equal(card(row.code).type_code, row.type, row.name);
  }
  // Hall of Beorn: 50 (easy 40) encounter cards, 3 quest cards and the two
  // rules cards.
  const sum = (key: "normal" | "easy", type?: string) =>
    quantities
      .filter((r) => (type ? r.type === type : true))
      .reduce((n, r) => n + r[key], 0);
  assert.deepEqual([sum("normal"), sum("easy")], [50 + 3 + 2, 40 + 3 + 2]);
  assert.deepEqual([sum("normal", "quest"), sum("easy", "quest")], [3, 3]);
  assert.deepEqual([sum("normal", "rules"), sum("easy", "rules")], [2, 2]);
  // Easy mode keeps fewer copies of seven cards.
  assert.deepEqual(
    quantities
      .filter((r) => r.normal !== r.easy)
      .map((r) => [r.name, r.normal, r.easy]),
    [
      ["Taken by Surprise", 2, 1],
      ["Dark Alley", 3, 1],
      ["Market Square", 3, 2],
      ["Greenway Footpad", 4, 2],
      ["Chetwood Outlaw", 3, 2],
      ["Smoke and Mirrors", 3, 1],
      ["Deadly Accusations", 2, 1],
    ],
  );
  // Setup zones: The Prancing Pony is active and a Ramshackle Manor staged;
  // the Suspects, Hideouts, Taken by Surprise and the rules are set aside.
  const sections = snapshot.recipes.find((r) => r.id === "Q99.07")!.sections;
  assert.deepEqual(sections.sharedActiveLocation, { [PP.pony]: 1 });
  assert.deepEqual(sections.sharedStagingArea, { [PP.manor]: 1 });
  assert.deepEqual(
    Object.keys(sections.sharedSetAside).sort(),
    [...PP_SUSPECTS, ...PP_HIDEOUTS, PP.surprise, PP.rules1, PP.rules2].sort(),
  );
  assert.equal(
    hash("src/data/pending/murder-at-the-prancing-pony-import.json"),
    "5fe269f753bb187cb48b0059b111463cbb13a351ff489562214821618d1d5827",
  );
});

test("All 36 faces are pinned and the reviewed scans complete and correct the catalog", () => {
  assert.equal(art.length, 36);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
  }
  assert.deepEqual(
    snapshot.artwork.map((a) => a.sha256).sort(),
    art.map((a) => a.sha256).sort(),
  );
  // The catalog leaves the quest cards and the rules sheet blank.
  assert.deepEqual(
    PP_QUESTS.map((q) => [q.name, q.back_quest ?? null]),
    [
      ["Investigating the Crime", 12],
      ["Running out of Time", null],
      ["Apprehending the Killer", null],
    ],
  );
  for (const q of PP_QUESTS) {
    assert.equal(original(q.code).text ?? "", "");
    assert.ok(q.text && q.back_text, q.name);
  }
  assert.match(
    card(PP.crime).text!,
    /^Setup: Search the encounter deck for the 5 Suspect/,
  );
  assert.match(card(PP.crime).back_text!, /^No more than 4 progress/);
  assert.match(card(PP.time).text!, /until X locations are discarded/);
  assert.match(
    card(PP.time).back_text!,
    /make the accusation \(see rules\) and advance to stage 3A\.$/,
  );
  assert.match(
    card(PP.killer).text!,
    /^When Revealed: Each player besides the first player/,
  );
  assert.match(
    card(PP.killer).back_text!,
    /If there are no Suspect enemies in play, the players win the game\.$/,
  );
  assert.match(card(PP.rules1).text!, /^The Investigation Deck/);
  assert.match(card(PP.rules1).back_text!, /^Investigate X/);
  assert.match(card(PP.rules2).text!, /^Making The Accusation/);
  assert.match(card(PP.rules2).back_text!, /^The Investigation List/);
  assert.equal(original(PP.rules1).text, "Rulesheet Card 1");
  // Victory points the catalog leaves out.
  assert.deepEqual(
    [...PP_SUSPECTS, ...PP_HIDEOUTS, PP.pony, PP.ferny].map((c) => [
      card(c).name,
      card(c).victory,
    ]),
    [
      ...[...PP_SUSPECTS, ...PP_HIDEOUTS].map((c) => [card(c).name, 5]),
      ["The Prancing Pony", 2],
      ["Bill Ferny", 3],
    ],
  );
  assert.ok(
    [...PP_SUSPECTS, ...PP_HIDEOUTS, PP.pony, PP.ferny].every(
      (c) => original(c).victory == null,
    ),
  );
  // Typos the scans correct.
  const fixes: [string, RegExp, RegExp][] = [
    [
      PP.susie,
      /1 other Brigand enemy is in play/,
      /1 other Brigand is in play/,
    ],
    [PP.johnny, /When Johnny Goblin-fingers attacks/, /Goblin-finders/],
    [PP.orcEyes, /a shadow card for this attack/, /shadow cad/],
    [PP.pony, /When The Prancing Pony is explored/, /When the Prancing Pony/],
    [PP.manor, /reduce that amount to 1/, /reducd/],
    [PP.warehouse, /look at 2 additional cards, or/, /additional card, or/],
    [PP.informant, /After Bree-land Informant makes/, /Bree-land Information/],
    [PP.footpad, /threat by 2, or Greenway/, /threat by 2 or Greenway/],
    [PP.outlaw, /optionally engage Chetwood/, /optionally engaged Chetwood/],
    [PP.muscle, /Hired Muscle attached and return/, /Hired Muscle attacked/],
    [
      PP.muscle,
      /look at the bottom card of the Investigation deck/,
      /bottom of the/,
    ],
    [PP.smoke, /^When Revealed: Discard the top X/, /^Surge\./],
  ];
  for (const [code, fixed, typo] of fixes) {
    assert.match(card(code).text!, fixed, card(code).name);
    assert.match(original(code).text!, typo, card(code).name);
  }
  assert.match(card(PP.smoke).text!, /add the \[threat\] of each card/);
  assert.match(card(PP.muscle).text!, /^Surge\./);
  for (const c of [...PP_ENCOUNTERS, ...PP_QUESTS])
    for (const field of ["text", "back_text", "shadow"] as const)
      assert.doesNotMatch(
        c[field] ?? "",
        /  |\s$|`/,
        `${c.name}: tidy ${field}`,
      );
  // Statistics from the scans.
  assert.deepEqual(
    [
      ...PP_SUSPECTS,
      PP.ferny,
      PP.informant,
      PP.ruffian,
      PP.footpad,
      PP.outlaw,
    ].map((code) => {
      const c = card(code);
      const p = c.printed_stats ?? {};
      return [
        c.engagement,
        p.threat ?? c.threat,
        c.attack,
        c.defense,
        c.health,
      ];
    }),
    [
      [45, "2", 7, 2, 10],
      [45, "X", 5, 3, 8],
      [45, "4", 5, 3, 7],
      [45, "3", 4, 4, 6],
      [45, "3", 4, 3, 9],
      [42, "3", 2, 3, 5],
      [30, "3", 2, 1, 3],
      [35, "2", 3, 2, 3],
      [25, "2", 4, 2, 4],
      [40, "4", 4, 3, 5],
    ],
  );
  assert.deepEqual(
    [
      ...PP_HIDEOUTS,
      PP.pony,
      PP.manor,
      PP.alley,
      PP.market,
      PP.warehouse,
      PP.stable,
    ].map((code) => {
      const c = card(code);
      return [c.threat, c.quest, printedInvestigate(code)];
    }),
    [
      ...PP_HIDEOUTS.map(() => [5, 5, 0]),
      [2, 2, 0],
      [2, 3, 2],
      [4, 3, 3],
      [2, 4, 2],
      [3, 4, 1],
      [3, 3, 1],
    ],
  );
});
