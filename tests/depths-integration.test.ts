import assert from "node:assert/strict";
import test from "node:test";
import { applyAction } from "../src/game/engine";
import { get, make, stats } from "../src/game/core";
import { forOwner, ownerOf, seatView, selectSeat } from "../src/game/table";
import { DEPTHS_PLAYER as P } from "../src/game/depths-player-support";
import { CARN as C } from "../src/game/carn-dum-support";
import { ETTEN as E } from "../src/game/ettenmoors-support";
import { DEPTHS as D } from "../src/game/depths-support";
import { EMYN } from "../src/game/emyn-muil";
import { BLOOD_GONDOR as B } from "../src/game/blood-gondor-support";
import { MORGUL_VALE as M } from "../src/game/morgul-vale-support";
import { ASSAULT_OSGILIATH as A } from "../src/game/assault-osgiliath-support";
import { base, choose, reload } from "./against-shadow-final-fixtures";
import { base as carnBase } from "./carn-dum-fixtures";
import { base as ettenBase } from "./ettenmoors-fixtures";
import { stage3 } from "./depths-fixtures";
import type { GameState, Unit } from "../src/game/types";

function hand(s: GameState, code: string, player = s.table?.active ?? 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.hand.push(u);
  });
  return u;
}
function lanwyn(s = base("mirkwood")) {
  const hero = make(s, P.lanwyn);
  hero.resources = 10;
  s.heroes[0] = hero;
  s.startingHeroes = s.heroes.map((h) => h.code);
  s.phase = "quest";
  s.committedIds = [hero.id];
  return { s, hero };
}

test("Emyn's quest and conditional Surge retain two actual reveals with one Lanwyn Response", () => {
  // Rules Reference p17: each separate Surge instance reveals another card.
  // FAQ1.08: one revealed-card trigger permits only one Lanwyn Response.
  for (const code of [EMYN.chasm, "01092"]) {
    let { s, hero } = lanwyn(base("hills-of-emyn-muil"));
    s.emynMuilTreacherySeen = false;
    s.encounterDeck = [code, EMYN.highlands, EMYN.outerRidge, EMYN.falls];
    s = applyAction(reload(s), { type: "COMMIT" });
    assert.match(s.choice?.title ?? "", /Lanwyn/, code);
    assert.deepEqual(
      s.encounterDeck,
      [EMYN.highlands, EMYN.outerRidge, EMYN.falls],
      "The revealed card's one Response precedes both extra encounters",
    );
    s = choose(reload(s), "will");
    assert.equal(
      s.choice,
      null,
      "The same physical reveal cannot offer Lanwyn again",
    );
    assert.deepEqual(
      s.staging.map((u) => u.code),
      [EMYN.highlands, EMYN.outerRidge],
    );
    assert.deepEqual(s.encounterDeck, [EMYN.falls]);
    assert.equal(stats(s, get(s, hero.id)!).will, 4);
    assert.equal(s.used.filter((k) => k.includes("depths:lanwyn:")).length, 1);
    reload(s);
  }
});

test("Crossroads' printed and conditional Surge share one Lanwyn Response before two reveals", () => {
  let { s, hero } = lanwyn(base("the-blood-of-gondor"));
  s.encounterDeck = [B.conflict, B.southern, B.northern, B.eastern];
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.match(s.choice?.title ?? "", /Lanwyn/);
  assert.deepEqual(s.encounterDeck, [B.southern, B.northern, B.eastern]);
  s = choose(reload(s), "will");
  assert.equal(s.choice, null);
  assert.deepEqual(
    s.staging.map((u) => u.code),
    [B.southern, B.northern],
  );
  assert.deepEqual(s.encounterDeck, [B.eastern]);
  assert.equal(stats(s, get(s, hero.id)!).will, 4);
  assert.equal(s.used.filter((k) => k.includes("depths:lanwyn:")).length, 1);
  reload(s);
});

test("Lieutenant repeats a discarded When Revealed without revealing its conditional-Surge card", () => {
  for (const [scenarioId, code] of [
    ["the-morgul-vale", M.city],
    ["assault-on-osgiliath", A.pinned],
  ] as const) {
    let { s, hero } = lanwyn(base(scenarioId));
    // This original Mordor Elite enemy occurs in both printed recipes.
    s.encounterDeck = [
      "octgn:4823aae3-46ef-4a75-89f9-cbd3aa1b9049",
      "01099",
      "01099",
    ];
    s.encounterDiscard = [code];
    s = applyAction(reload(s), { type: "COMMIT" });
    assert.equal(
      s.choice,
      null,
      "Repeating When Revealed does not reveal that discarded card",
    );
    assert.deepEqual(s.encounterDeck, ["01099", "01099"]);
    assert.equal(stats(s, get(s, hero.id)!).will, 2);
    assert.ok(!s.used.some((k) => k.includes("depths:lanwyn:")));
    assert.equal(s.encounterDiscard.filter((c) => c === code).length, 1);
    reload(s);
  }
});

test("North Stair moves Driven by Shadow and resolves its When Revealed without a new reveal", () => {
  let { s, hero } = lanwyn(base("hills-of-emyn-muil"));
  const stair = make(s, EMYN.northStair);
  s.phase = "travel";
  s.staging = [stair];
  s.encounterDiscard = ["01092"];
  s.encounterDeck = [EMYN.highlands, EMYN.falls];
  s = applyAction(reload(s), { type: "TRAVEL", id: stair.id });
  assert.equal(
    s.choice,
    null,
    "Moving the card does not create Lanwyn's revealed-card trigger",
  );
  assert.deepEqual(s.encounterDeck, [EMYN.highlands, EMYN.falls]);
  assert.equal(s.activeLocation?.id, stair.id);
  assert.equal(stats(s, get(s, hero.id)!).will, 2);
  reload(s);
});

test("Lying in Wait turns hidden Crossroads faceup and repeats its When Revealed without Surge", () => {
  let { s, hero } = lanwyn(base("the-blood-of-gondor"));
  const hidden = make(s, B.conflict);
  s.bloodGondor!.hidden[0] = [hidden];
  s.encounterDeck = [B.lying, B.southern, B.northern];
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.equal(s.choice, null);
  assert.deepEqual(s.encounterDeck, [B.southern, B.northern]);
  assert.equal(
    s.bloodGondor!.conflict,
    true,
    "The actual When Revealed effect still resolves",
  );
  assert.deepEqual(s.bloodGondor!.hidden[0], []);
  assert.equal(stats(s, get(s, hero.id)!).will, 2);
  assert.ok(!s.used.some((k) => k.includes("depths:lanwyn:")));
  reload(s);
});

test("Lanwyn sees actual gained Surge, while cancelling that When Revealed prevents the grant", () => {
  for (const cancel of [false, true]) {
    let { s, hero } = lanwyn();
    s.encounterDeck = ["01092", "01099", "01099"];
    if (cancel) hand(s, "01050");
    s = applyAction(reload(s), { type: "COMMIT" });
    if (cancel) {
      assert.match(s.choice!.title, /Driven by Shadow/);
      s = choose(reload(s), "cancel");
      assert.equal(s.choice, null);
      assert.deepEqual(s.encounterDeck, ["01099", "01099"]);
      assert.equal(get(s, hero.id)!.tempWill, undefined);
    } else {
      assert.match(s.choice?.title ?? "", /Lanwyn/);
      assert.deepEqual(
        s.encounterDeck,
        ["01099", "01099"],
        "Response precedes the extra reveal",
      );
      s = choose(reload(s), "will");
      assert.equal(stats(s, get(s, hero.id)!).will, 4);
      assert.deepEqual(s.encounterDeck, ["01099"]);
      assert.equal(s.staging[0].code, "01099");
    }
    reload(s);
  }
});

test("Cancelling printed-Surge Flooding preserves Surge and Lanwyn's actual two-per-phase limit", () => {
  let { s, hero } = lanwyn();
  const river = make(s, "02017");
  river.progress = 1;
  s.staging.push(river);
  hand(s, "01050");
  s.encounterDeck = ["02023", "01115", "01081", "01099", "01099"];
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.match(s.choice!.title, /Flooding/);
  s = choose(reload(s), "cancel");
  assert.equal(get(s, river.id)!.progress, 1, "When Revealed was cancelled");
  assert.match(s.choice?.title ?? "", /Lanwyn/);
  assert.equal(s.threat, 21, "Doomed is not cancelled");
  assert.deepEqual(s.encounterDeck, ["01115", "01081", "01099", "01099"]);
  s = choose(reload(s), "ready");
  assert.equal(get(s, hero.id)!.exhausted, false);
  assert.match(s.choice?.title ?? "", /Lanwyn/);
  assert.deepEqual(s.encounterDeck, ["01081", "01099", "01099"]);
  s = choose(reload(s), "will");
  assert.equal(
    s.choice,
    null,
    "The third actual Surge reveal cannot exceed twice per phase",
  );
  assert.equal(stats(s, get(s, hero.id)!).will, 4);
  assert.equal(s.used.filter((k) => k.includes("depths:lanwyn:")).length, 2);
  assert.deepEqual(s.encounterDeck, ["01099"]);
  assert.ok(s.encounterDiscard.includes("02023"));
  assert.ok(s.staging.some((u) => u.code === "01099"));
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.phase, "travel");
  assert.equal(stats(s, get(s, hero.id)!).will, 2);
  assert.equal(s.used.filter((k) => k.includes("depths:lanwyn:")).length, 0);
  reload(s);
});

test("Thalin destroys a revealed one-hit-point enemy before its Surge can trigger Lanwyn", () => {
  let { s, hero } = lanwyn();
  const thalin = make(s, "01006");
  s.heroes[1] = thalin;
  s.committedIds.push(thalin.id);
  s.encounterDeck = ["01115", "01099"];
  s = applyAction(reload(s), { type: "COMMIT" });
  assert.equal(s.choice, null);
  assert.deepEqual([...s.encounterDeck].sort(), ["01099", "01115"]);
  assert.ok(!s.staging.some((u) => u.code === "01115"));
  assert.equal(get(s, hero.id)!.tempWill, undefined);
  assert.ok(!s.used.some((k) => k.includes("depths:lanwyn:")));
  reload(s);
});

test("A remote Carn payment raises only its payer's threat and Sam responds before Ironsmith enters", () => {
  let s = carnBase(2);
  const sam = make(s, P.sam);
  sam.exhausted = true;
  s.allies.push(sam);
  s.activeLocation = make(s, C.walls);
  let payer!: Unit;
  forOwner(s, 1, () => {
    payer = s.heroes[0];
    payer.resources = 10;
    payer.phaseResourceIcons = ["spirit", "tactics"];
  });
  const smith = hand(s, P.ironsmith, 1);
  const weapon = hand(s, "01039", 1);
  s.table!.turn = 1;
  selectSeat(s, 1);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: smith.id,
    payment: { [payer.id]: 3 },
  });
  assert.match(s.choice!.title, /Sam Gamgee/);
  assert.equal(
    s.choice!.options.find((o) => o.id === "pay")!.ability!.player,
    1,
    "The player whose threat rose controls this Response",
  );
  assert.equal(seatView(s, 0).threat, 20);
  assert.equal(
    seatView(s, 1).threat,
    23,
    "Mandatory taxes on all three spent resources finish before optional Responses",
  );
  assert.equal(
    get(s, smith.id),
    undefined,
    "Ironsmith stays reserved during cost reactions",
  );
  assert.equal(s.pendingPlayerPlays?.[0].unit.id, smith.id);
  s = choose(reload(s), "pay");
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [payer.id],
  );
  s = choose(reload(s), payer.id);
  assert.equal(
    seatView(s, 1).threat,
    24,
    "The three play resources and Sam's resource each pay the actual tax",
  );
  assert.equal(get(s, payer.id)!.resources, 6);
  assert.equal(get(s, sam.id)!.exhausted, false);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
  assert.equal(
    ownerOf(s, get(s, sam.id)!),
    0,
    "Sam remains controlled by the other player",
  );
  assert.match(s.choice!.title, /Master Ironsmith/);
  s = choose(reload(s), weapon.id);
  assert.ok(get(s, payer.id)!.attachments.some((a) => a.id === weapon.id));
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(get(s, smith.id)!.id, smith.id);
  assert.equal(
    get(s, payer.id)!.resources,
    6,
    "The Weapon enters without paying its cost",
  );

  const moved = get(s, sam.id)!;
  forOwner(s, 0, () => {
    s.allies = s.allies.filter((u) => u.id !== moved.id);
  });
  moved.controller = 1;
  forOwner(s, 1, () => s.allies.push(moved));
  let otherPayer!: Unit;
  forOwner(s, 0, () => {
    otherPayer = s.heroes[0];
    otherPayer.phaseResourceIcons = ["spirit", "tactics"];
  });
  const next = hand(s, "01029", 0);
  s = applyAction(reload(s), { type: "NEXT" });
  assert.equal(s.table!.active, 0);
  s = applyAction(reload(s), {
    type: "PLAY",
    id: next.id,
    payment: { [otherPayer.id]: 2 },
  });
  assert.equal(
    s.choice,
    null,
    "Sam's physical once-per-round limit survives a controller change and further positive raises",
  );
  assert.equal(seatView(s, 0).threat, 22);
  assert.equal(seatView(s, 1).threat, 24);
  assert.equal(stats(s, get(s, sam.id)!).will, 3);
  reload(s);
});

test("Ironsmith's actual payer survives a saved Forage prevention choice and attaches the physical discard card", () => {
  let s = ettenBase();
  s.staging.push(make(s, E.forage));
  const payer = make(s, "01004");
  payer.resources = 3;
  s.heroes[0] = payer;
  const guard = make(s, "10004");
  s.allies.push(guard);
  const smith = hand(s, P.ironsmith);
  s.discard = ["01040", "01040"];
  s = applyAction(reload(s), {
    type: "PLAY",
    id: smith.id,
    payment: { [payer.id]: 3 },
  });
  assert.match(s.choice!.title, /Prevent damage/);
  assert.equal(get(s, smith.id), undefined);
  assert.equal(s.pendingPlayerPlays?.[0].unit.id, smith.id);
  s = choose(reload(s), `${guard.id}-normal`);
  assert.match(s.choice!.title, /Master Ironsmith/);
  assert.equal(get(s, payer.id)!.damage, 0);
  assert.equal(get(s, payer.id)!.resources, 0);
  s = choose(reload(s), "discard-1");
  assert.deepEqual(s.discard, ["01040"]);
  assert.equal(
    get(s, payer.id)!.attachments.filter((a) => a.code === "01040").length,
    1,
  );
  assert.equal(s.pendingPlayerPlays, undefined);
  assert.equal(get(s, smith.id)!.id, smith.id);
  reload(s);
});

test("Gríma's gained Doomed and its saved Responses finish before Ironsmith's free attachment", () => {
  let s = base("mirkwood");
  const payer = make(s, "01004"),
    grima = make(s, "07002"),
    guard = make(s, "07004");
  payer.resources = 2;
  grima.resources = 0;
  guard.exhausted = true;
  s.heroes[0] = payer;
  s.heroes[1] = grima;
  s.allies.push(guard);
  const smith = hand(s, P.ironsmith),
    weapon = hand(s, "01039");
  s = applyAction(reload(s), { type: "ABILITY", id: grima.id });
  s = applyAction(reload(s), {
    type: "PLAY",
    id: smith.id,
    payment: { [payer.id]: 2 },
  });
  assert.equal(s.threat, 21);
  assert.equal(get(s, payer.id)!.resources, 0);
  assert.ok(
    get(s, smith.id),
    "The ally entered before its gained keyword resolved",
  );
  assert.match(s.choice!.title, /Orthanc Guard/);
  assert.ok(!get(s, payer.id)!.attachments.length);
  s = choose(reload(s), "use");
  assert.equal(get(s, guard.id)!.exhausted, false);
  assert.match(s.choice!.title, /Master Ironsmith/);
  s = choose(reload(s), weapon.id);
  assert.equal(get(s, payer.id)!.resources, 0);
  assert.ok(get(s, payer.id)!.attachments.some((a) => a.id === weapon.id));
  assert.ok(
    !s.used.some((k) => k.includes("ironsmith-paid")),
    "The physical payment marker is consumed once",
  );
  reload(s);
});

test("Explorer explores a grappled Ship location through its actual Action and releases the same physical enemy", () => {
  let s = stage3();
  const location = make(s, D.forecastle),
    explorer = make(s, P.explorer);
  location.progress = 4;
  explorer.progress = 1;
  s.staging.push(location);
  s.allies.push(explorer);
  const index = s.encounterDeck.indexOf(D.grasping);
  assert.ok(
    index >= 0,
    "The original stage transition supplies the beast deck",
  );
  s.encounterDeck.splice(index, 1);
  s.encounterDeck.unshift(D.grasping);
  s.phase = "quest";
  s.committedIds = [s.heroes[2].id];
  s = applyAction(reload(s), { type: "COMMIT" });
  const grappled = s.depths!.grappled.find((g) => g.locationId === location.id);
  assert.ok(
    grappled,
    "The actual encounter reveal grapples the highest printed threat location",
  );
  assert.equal(grappled.enemy.code, D.grasping);
  const enemyId = grappled.enemy.id;
  assert.ok(!s.staging.some((u) => u.id === enemyId));
  s = applyAction(reload(s), { type: "ABILITY", id: explorer.id });
  assert.ok(s.choice!.options.some((o) => o.id === location.id));
  s = choose(reload(s), location.id);
  assert.equal(get(s, explorer.id)!.exhausted, true);
  assert.equal(get(s, explorer.id)!.progress, 0);
  assert.ok(!s.staging.some((u) => u.id === location.id));
  assert.ok(s.encounterDiscard.includes(D.forecastle));
  assert.ok(s.staging.some((u) => u.id === enemyId && u.code === D.grasping));
  assert.ok(!s.depths!.grappled.some((g) => g.locationId === location.id));
  reload(s);
});
