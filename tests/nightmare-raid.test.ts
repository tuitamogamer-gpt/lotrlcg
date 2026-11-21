import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAction } from "../src/game/engine";
import { card, encounterCards } from "../src/game/cards";
import { fx, get, make, stats, threatOf } from "../src/game/core";
import { progress } from "../src/game/board";
import { flush } from "../src/game/effects";
import { batch4Scenario } from "../src/game/batch4-scenarios";
import { forOwner } from "../src/game/table";
import { mainQuestCode } from "../src/game/quest-state";
import { RAID as R } from "../src/game/raid-grey-havens-support";
import { raidAdvance } from "../src/game/raid-grey-havens";
import {
  NIGHTMARE,
  NIGHTMARE_GH as G,
  nightmareCardOf,
  nightmareStatus,
} from "../src/game/nightmare";
import type { Effect, GameState, Unit } from "../src/game/types";
import art from "./nightmare-art.json";
import {
  autoplay,
  nightmareForTwo,
  nightmareGame,
  opening,
  valid,
} from "./nightmare-fixtures";
import {
  base,
  pick,
  reload,
  second,
  settle,
} from "./raid-grey-havens-fixtures";

const ID = "raid-on-the-grey-havens";
const hooks = (s: GameState) => batch4Scenario(s);
const nightmare = <T extends GameState>(s: T) => {
  s.nightmareMode = true;
  s.nightmare = {};
  return s;
};
const board = (players = 1) => nightmare(base(players));
const stageTwo = (players = 1) => nightmare(second(players));
const queue = (s: GameState, ...effects: Effect[]) => {
  s.queue.unshift(...effects);
  return s;
};
const options = (s: GameState) => s.choice?.options.map((o) => o.id) ?? [];
const tally = (list: string[]) =>
  list.reduce<Record<string, number>>(
    (m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }),
    {},
  );
const stage = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  return u;
};
function engaged(s: GameState, code: string, p = 0) {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
    s.engaged.push(u);
  });
  return u;
}
const dream = (s: GameState) => s.staging.find((u) => u.code === R.dream)!;

test("Nightmare: Raid on the Grey Havens' setup card, stage 2 and Nightmare Deck carry their scans' texts, stats and faces", () => {
  const setup = card(G.raidCard);
  assert.equal(setup.type_code, "nightmare");
  assert.match(
    setup.text!,
    /^Begin with the standard quest deck and encounter deck for the Raid on the Grey Havens scenario\.\n/,
  );
  assert.ok(setup.text!.includes("1x Sahír's Advance (quest stage 2)\n"));
  assert.equal(setup.back_text!.split("\n").length, 3);
  assert.ok(setup.back_text!.includes("Captain Sahír and Na'asiyah each gain"));
  const advance = card(G.advance);
  assert.equal(advance.name, "Sahír's Advance");
  assert.equal(advance.type_code, "quest");
  assert.ok(
    advance.text!.includes(
      "Captain Sahír equal to the amount of damage on the Dream-chaser",
    ),
  );
  assert.equal(advance.back_text!.split("\n").length, 3);
  assert.ok(
    advance.back_text!.endsWith(
      "If both Captain Sahír and Na'asiyah are in the victory display, the players win the game.",
    ),
  );
  assert.ok(
    card(G.marauder).text!.startsWith("For each excess point of combat damage"),
  );
  assert.equal(card(G.tower).text!.split("\n").length, 3);
  assert.ok(
    card(G.narelenya).text!.endsWith("deal 1 damage to the Nárelenya."),
  );
  for (const code of [G.narelenya, G.dawnStar, G.silverWing]) {
    assert.equal(card(code).is_unique, true);
    assert.equal(card(code).victory, 1);
  }
  assert.deepEqual(
    [G.pillager, G.pyromaniac, G.marauder].map((code) => {
      const c = card(code);
      return [c.engagement, c.threat, c.attack, c.defense, c.health];
    }),
    [
      [16, 3, 2, 3, 3],
      [44, 2, 2, 2, 4],
      [32, 4, 6, 2, 5],
    ],
  );
  const set = encounterCards.filter(
    (x) => x.encounter_set === "Raid on the Grey Havens - Nightmare",
  );
  assert.equal(set.length, 11);
  assert.equal(
    set.reduce(
      (n, x) =>
        n +
        (["nightmare", "quest"].includes(x.type_code) ? 0 : (x.quantity ?? 1)),
      0,
    ),
    17,
  );
  assert.equal(
    art.filter((x) => set.some((y) => y.code === x.code)).length,
    13,
  );
});

test("Nightmare: Raid on the Grey Havens' encounter deck matches the source recipe, the Dream-chaser and the unique Ships in it for the setup search", () => {
  const recipes = JSON.parse(
    readFileSync(new URL("../public/scenarios.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    cards: { code: string; quantity: number; section: string }[];
  }[];
  const recipe = recipes.find((r) => r.id === "N06.3")!;
  const section = (name: string) =>
    recipe.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  for (const [title, n] of Object.entries({
    ...NIGHTMARE[ID]!.removals,
    ...NIGHTMARE[ID]!.questRemovals,
  }))
    assert.ok(card(G.raidCard).text!.includes(`${n}x ${title}`), title);
  // The recipe's staging area holds the setup's unique locations (for four
  // players) and the cards the scenario's setup stages.
  const staged = section("sharedStagingArea");
  const ships = staged.filter((c) => card(c).type_code === "location");
  assert.deepEqual(
    new Set(ships),
    new Set([R.dream, G.narelenya, G.dawnStar, G.silverWing]),
  );
  for (const s of [nightmareGame(ID, 4), nightmareForTwo(ID, 4)]) {
    assert.deepEqual(
      tally(s.encounterDeck),
      tally([...section("sharedEncounterDeck"), ...ships]),
    );
    assert.deepEqual(
      tally(s.raidGreyHavens!.setAside.map((u) => u.code)),
      tally([
        R.sahir,
        R.naasiyah,
        ...staged.filter(
          (c) => card(c).type_code !== "location" && c !== G.raidCard,
        ),
      ]),
    );
    assert.equal(nightmareCardOf(s), G.raidCard);
    assert.match(nightmareStatus(s)[0], /cannot have attachments/);
  }
});

test("Nightmare: each player searches for a different unique location during setup, the Dream-chaser among them", () => {
  let s = opening(nightmareGame(ID, 6));
  assert.ok(valid(s));
  assert.equal(s.staging.filter((u) => u.code === R.dream).length, 1);
  assert.ok(!s.encounterDeck.includes(R.dream));
  // Two players: the second chooses one of the Nightmare Ships.
  s = nightmareForTwo(ID, 6);
  for (let i = 0; i < 80; i++) {
    if (s.choice?.title.startsWith("Setup · Add a unique location")) break;
    if (s.choice) s = pick(s, s.choice.options[0].id);
    else if (s.flow?.pending)
      s = applyAction(reload(s), {
        type: "CONTINUE",
        stepId: s.flow.pending.id,
      });
    else s = applyAction(reload(s), { type: "KEEP" });
  }
  assert.match(s.choice!.title, /^Setup · Add a unique location/);
  assert.deepEqual(
    new Set(options(s)),
    new Set([G.narelenya, G.dawnStar, G.silverWing]),
  );
  s = opening(pick(s, G.dawnStar));
  assert.ok(s.staging.some((u) => u.code === R.dream));
  assert.ok(s.staging.some((u) => u.code === G.dawnStar));
  assert.ok(valid(s));
});

test("Nightmare: Captain Sahír and Na'asiyah cannot have attachments", () => {
  const s = stageTwo();
  const sahir = s.staging.find((u) => u.code === R.sahir)!;
  const naasiyah = s.staging.find((u) => u.code === R.naasiyah)!;
  assert.equal(hooks(s).cannotAttach!(s, sahir, "01040"), true);
  assert.equal(hooks(s).cannotAttach!(s, naasiyah, "01040"), true);
  assert.equal(hooks(s).cannotAttach!(s, stage(s, R.ravager), "01040"), false);
});

test("Nightmare: stage 2 is the Nightmare Deck's Sahír's Advance: progress stays on it, Na'asiyah's resources count for Captain Sahír, and both elites win the game", () => {
  let s = stageTwo();
  assert.equal(mainQuestCode(s), G.advance);
  assert.equal(hooks(s).stageInfo!(s)!.cardCode, G.advance);
  const fire = dream(s);
  fire.damage = 2;
  progress(s, 3);
  flush(s);
  assert.equal(fire.damage, 2, "progress does not remove fire damage");
  // Captain Sahír cancels damage with Na'asiyah's resources.
  const sahir = s.staging.find((u) => u.code === R.sahir)!;
  const naasiyah = s.staging.find((u) => u.code === R.naasiyah)!;
  sahir.resources = 1;
  naasiyah.resources = 2;
  queue(s, fx("damage", { target: sahir.id, value: 4, player: 0 }));
  flush(s);
  assert.equal(sahir.resources, 0);
  assert.equal(naasiyah.resources, 0);
  assert.equal(get(s, sahir.id)!.damage, 1);
  // Both elites in the victory display win the game.
  s = stageTwo();
  s.staging = s.staging.filter((u) => ![R.sahir, R.naasiyah].includes(u.code));
  s.victoryCards = [R.sahir];
  raidAdvance(s);
  assert.equal(s.status, "playing");
  s.victoryCards.push(R.naasiyah);
  raidAdvance(s);
  assert.equal(s.status, "won");
});

test("Nightmare: Corsair Pillager attacks again for each resource and gains resources as the players travel to a damaged Aflame location; Corsair Pyromaniac grows with each burned card", () => {
  let s = board();
  const pillager = engaged(s, G.pillager);
  pillager.resources = 2;
  s.phase = "defense";
  s.combat = { enemyId: pillager.id, attackBonus: 0 } as never;
  hooks(s).enemyAttackStarted!(s, pillager, 0);
  assert.equal(s.combat!.extraAttacks, 2);
  // Its additional (immediate) attacks add none.
  s.combat = { enemyId: pillager.id, attackBonus: 0, immediate: true } as never;
  hooks(s).enemyAttackStarted!(s, pillager, 0);
  assert.equal(s.combat!.extraAttacks, undefined);
  s.combat = null;
  const piers = stage(s, R.piers);
  piers.damage = 3;
  hooks(s).travelEntered!(s, piers, true);
  assert.equal(pillager.resources, 5);
  // Corsair Pyromaniac.
  s = board();
  const pyro = stage(s, G.pyromaniac);
  pyro.resources = 2;
  assert.equal(stats(s, pyro).attack, 4);
  assert.equal(stats(s, pyro).defense, 4);
  assert.equal(threatOf(s, pyro), 4);
  const ship = stage(s, R.pillaged);
  queue(s, fx("raidLocationDamage", { target: ship.id, value: 5, player: 0 }));
  flush(s);
  s = settle(s);
  assert.equal(get(s, pyro.id)!.resources, 3);
  assert.equal(s.raidGreyHavens!.burned.length, 1);
});

test("Nightmare: Elite Marauder's excess combat damage burns an Aflame location in the staging area", () => {
  let s = board();
  const marauder = engaged(s, G.marauder);
  const hero = s.heroes[0];
  hero.damage = stats(s, hero).health - 1;
  s.combat = { enemyId: marauder.id, attackBonus: 0 } as never;
  const piers = stage(s, R.piers);
  hooks(s).damageDealt!(s, ((hero.damage += 3), hero), 3, {
    combatDamage: true,
    enemyId: marauder.id,
  });
  flush(s);
  s = settle(s);
  // Two excess points; with two Aflame locations staged, each point is chosen.
  assert.equal(piers.damage + dream(s).damage, 2);
});

test("Nightmare: Burning Tower stops healing and damages as many characters as its damage", () => {
  let s = board();
  const tower = stage(s, G.tower);
  assert.equal(hooks(s).cannotHeal!(s, s.heroes[0]), true);
  queue(s, fx("raidLocationDamage", { target: tower.id, value: 2, player: 0 }));
  flush(s);
  assert.match(
    s.choice!.title,
    /^Burning Tower · Choose a character \(1 of 2\)/,
  );
  s = pick(s, s.heroes[0].id);
  s = pick(s, s.heroes[1].id);
  assert.deepEqual(
    s.heroes.map((h) => h.damage),
    [1, 1, 0],
  );
  assert.ok(valid(s));
});

test("Nightmare: Nárelenya, the Dawn Star and the Silver Wing burn as the first player plays an ally, draws and attacks", () => {
  const s = board(2);
  const ships = [G.narelenya, G.dawnStar, G.silverWing].map((c) => stage(s, c));
  let ally!: Unit;
  forOwner(s, 0, () => {
    ally = make(s, "01073");
    ally.owner = 0;
    s.allies.push(ally);
  });
  hooks(s).allyEntered!(s, ally, true, true);
  hooks(s).cardsDrawn!(s, 0, 2);
  hooks(s).cardsDrawn!(s, 1, 2);
  hooks(s).playerAttackResolved!(
    s,
    stage(s, R.ravager),
    [s.heroes[0].id],
    3,
    2,
  );
  flush(s);
  assert.deepEqual(
    ships.map((u) => u.damage),
    [1, 1, 1],
  );
  // The second player's ally does not burn the Nárelenya.
  let theirs!: Unit;
  forOwner(s, 1, () => {
    theirs = make(s, "01073");
    theirs.owner = 1;
    s.allies.push(theirs);
  });
  hooks(s).allyEntered!(s, theirs, true, true);
  flush(s);
  assert.equal(ships[0].damage, 1);
});

test("Nightmare: Sudden Assault damages an Aflame location or reveals a card; its shadow damages one or attacks again", () => {
  let s = board();
  hooks(s).encounter!(s, G.sudden);
  flush(s);
  assert.match(s.choice!.title, /^Sudden Assault · Choose one/);
  assert.deepEqual(options(s), ["damage", "reveal"]);
  s = pick(s, "damage");
  assert.equal(dream(s).damage, 2);
  // Its shadow.
  s = board();
  const enemy = engaged(s, R.ravager);
  s.combat = { enemyId: enemy.id, attackBonus: 0 } as never;
  assert.equal(hooks(s).shadow!(s, G.sudden), true);
  flush(s);
  assert.deepEqual(options(s), ["damage", "attack"]);
  s = pick(s, "attack");
  assert.equal(s.combat!.extraAttacks, 1);
});

test("Nightmare: Infiltration moves a resource from each hero to the Raiders, set aside ones included; its shadow sends the defender's damage to an Aflame location", () => {
  let s = board();
  for (const h of s.heroes) h.resources = 1;
  const raider = stage(s, R.ravager);
  hooks(s).encounter!(s, G.infiltration);
  flush(s);
  // 3 resources among Captain Sahír, Na'asiyah (set aside) and the Ravager.
  assert.deepEqual(
    s.heroes.map((h) => h.resources),
    [0, 0, 0],
  );
  assert.deepEqual(
    [raider, ...s.raidGreyHavens!.setAside].map((u) => u.resources),
    [1, 1, 1],
  );
  // Its shadow.
  s = board();
  const enemy = engaged(s, R.ravager);
  const defender = s.heroes[0];
  s.combat = {
    enemyId: enemy.id,
    attackBonus: 0,
    defenderId: defender.id,
  } as never;
  assert.equal(hooks(s).shadow!(s, G.infiltration), true);
  assert.equal(
    hooks(s).replaceDamage!(s, defender, 3, {
      combatDamage: true,
      enemyId: enemy.id,
    }),
    true,
  );
  flush(s);
  assert.equal(dream(s).damage, 3);
  assert.equal(defender.damage, 0);
});

test("Nightmare: Raid on the Grey Havens Nightmare games keep valid saves to their end", () => {
  for (const seed of [1, 2, 3])
    for (const s of [nightmareGame(ID, seed), nightmareForTwo(ID, seed)]) {
      const end = autoplay(s, 2500);
      assert.ok(valid(end), `seed ${seed}`);
    }
});

test("Nightmare: reloading a Raid on the Grey Havens Nightmare board keeps it valid", () => {
  const s = stageTwo(2);
  assert.ok(valid(reload(s)));
});
