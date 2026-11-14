import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, createGame, playTargets } from "../src/game/engine";
import { card, SCRIPTED, STARTERS } from "../src/game/cards";
import { startingThreat } from "../src/game/starting-threat";
import {
  engagementCost,
  fx,
  get,
  make,
  playCost,
  stats,
} from "../src/game/core";
import { check, collectResources, destroy } from "../src/game/board";
import { flush } from "../src/game/effects";
import { availableAbilities } from "../src/game/actions";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { unitType } from "../src/game/card-types";
import {
  effectiveKeyword,
  hasResourceIcon,
} from "../src/game/expansion-passives";
import { forOwner, seatView } from "../src/game/table";
import { FLAME_WEST_ARAGORN, fellowshipAragorn } from "../src/game/lotr-saga";
import {
  FLAME_WEST_PLAYER as P,
  flameWestPlayerSetup,
} from "../src/game/flame-west-player-cards";
import { SG } from "../src/game/siege-gondor-support";
import { base, engaged, reload, settle, stage } from "./siege-gondor-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./flame-west-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Replace a player's first non-Aragorn hero with a fresh copy of a hero. */
const hero = (s: GameState, code: string, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    const slot = s.heroes.findIndex((h) => h.code !== FLAME_WEST_ARAGORN);
    u = make(s, code);
    u.owner = p;
    u.resources = 10;
    s.heroes[slot] = u;
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
/** Attach a fresh copy of a player attachment to a character. */
const attach = (s: GameState, host: Unit, code: string, p = 0) => {
  const a = { id: `c${s.nextId++}`, code, exhausted: false, owner: p };
  host.attachments.push(a);
  return a;
};
const offered = (s: GameState, code: string) =>
  !!s.choice?.options.some((o) => o.ability?.code === code);
/** An engaged enemy attacks with the given facedown shadow cards. */
const defend = (
  s: GameState,
  enemy: Unit,
  defender: Unit | null,
  shadows: string[] = [],
) => {
  s.phase = "defense";
  s.combat = null;
  enemy.shadows = [...shadows];
  enemy.faceupShadows = shadows.map(() => false);
  return act(s, {
    type: "DEFEND",
    enemyId: enemy.id,
    defenderId: defender?.id ?? null,
  });
};
/** Answer every unrelated decision until the given card's ability is offered. */
const until = (s: GameState, code: string) => {
  for (let n = 0; n < 20 && s.choice && !offered(s, code); n++)
    s = act(s, {
      type: "CHOOSE",
      id: (
        s.choice.options.find((o) => o.id === "skip") ??
        s.choice.options.find((o) => o.id === "resolve") ??
        s.choice.options[0]
      ).id,
    });
  assert.ok(offered(s, code), JSON.stringify(s.choice));
  return s;
};
/** Choose the option of the given card's ability (its "use" option if any). */
const use = (s: GameState, code: string, id?: string) =>
  act(s, {
    type: "CHOOSE",
    id: (s.choice!.options.find(
      (o) => o.ability?.code === code && (!id || o.id === id),
    ) ?? s.choice!.options.find((o) => o.ability?.code === code))!.id,
  });
const CODES = [
  P.eowyn,
  P.beregond,
  P.grimbold,
  P.imrahil,
  P.halbarad,
  P.ghan,
  P.sterner,
  P.shield,
  P.livery,
  P.roheryn,
  P.banner,
] as const;
/** A legal custom deck: the first three starter decks, three copies at most. */
const DECK: Record<string, number> = {};
for (const d of STARTERS.slice(0, 3))
  for (const [code, n] of Object.entries(d.cards))
    DECK[code] = Math.min(3, (DECK[code] ?? 0) + n);
/** Gimli (Tactics) and Glóin (a starter hero). */
const GIMLI = "01004",
  GLOIN = "01003";
/** Mountains of Mirkwood: "Travel: Reveal the top card of the encounter deck." */
const MOUNTAINS = "01078";
/** Blade of Gondolin: an Item. Weapon. attachment. */
const BLADE = "01039";

test("The Flame of the West player cards are scripted, pinned to their reviewed scans and corrected from them", () => {
  for (const code of CODES) assert.ok(SCRIPTED.has(code), card(code).name);
  for (const code of [P.eowyn, P.beregond])
    assert.ok(
      HERO_CARDS.some((c) => c.code === code),
      card(code).name,
    );
  for (const code of CODES.filter((c) => c !== P.eowyn && c !== P.beregond))
    assert.ok(
      DECK_CARDS.some((c) => c.code === code),
      card(code).name,
    );
  assert.equal(art.length, 11);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath);
  }
  const printed = (code: string) =>
    (official as { code: string; text?: string }[]).find(
      (c) => c.code === code,
    )!.text!;
  assert.match(printed(P.imrahil), /a hero in your discard pile/);
  assert.match(
    card(P.imrahil).text!,
    /^While there is a hero card in your discard pile/,
  );
  assert.match(printed(P.shield), /it's/);
  assert.match(card(P.shield).text!, /to its \[defense\] for this attack/);
  assert.match(printed(P.roheryn), /declare attached hero as an attacker/);
  assert.match(card(P.roheryn).text!, /declare that hero as an attacker/);
  assert.match(printed(P.banner), /commited/);
  assert.match(card(P.banner).text!, /While Aragorn is committed to the quest/);
  for (const code of CODES)
    assert.ok(!/<\/?[bi]>/.test(card(code).text ?? ""), card(code).name);
  assert.match(
    deckWarnings({ heroes: ["01001"], cards: { [P.banner]: 1 } }).join(" "),
    /Banner of Elendil is paid with the Fellowship Aragorn's resources, so it can only be played in The Flame of the West scenarios/,
  );
});

test("Éowyn: Setup reduces your threat by 3; her Action raises it by 3 to ready her with +9 attack until the end of the phase, once per game for the group", () => {
  const heroes = [P.eowyn, ...STARTERS[0].heroes.slice(1)];
  const created = createGame(41, DECK, heroes, "custom", {
    scenarioId: "the-siege-of-gondor",
  });
  assert.equal(created.threat, startingThreat(heroes) - 3);
  assert.equal(created.startingThreat, created.threat);
  assert.ok(
    created.log.some((l) => /Éowyn: you reduce your threat by 3/.test(l.text)),
  );
  let s = base(2);
  const eowyn = hero(s, P.eowyn, 0);
  flameWestPlayerSetup(s);
  assert.equal(s.threat, 17);
  flameWestPlayerSetup(s);
  assert.equal(s.threat, 17, "the Setup resolves once for each Éowyn");
  s.threat = 20;
  eowyn.exhausted = true;
  s.phase = "attack";
  const label = /^Éowyn · Raise your threat by 3/;
  assert.ok(
    !availableAbilities(s, eowyn).find((a) => label.test(a.label))!.disabled,
  );
  s = act(s, { type: "ABILITY", id: eowyn.id });
  const ready = get(s, eowyn.id)!;
  assert.equal(s.threat, 23);
  assert.equal(ready.exhausted, false);
  assert.equal(stats(s, ready).attack, card(P.eowyn).attack! + 9);
  assert.ok(
    availableAbilities(s, ready).find((a) => label.test(a.label))!.disabled,
  );
  // Once per game for the group: another player's Éowyn cannot use it again.
  forOwner(s, 0, () => {
    s.heroes = s.heroes.filter((h) => h.id !== ready.id);
  });
  const second = hero(s, P.eowyn, 1);
  forOwner(s, 1, () => {
    const problem = availableAbilities(s, second).find((a) =>
      label.test(a.label),
    );
    assert.ok(problem?.disabled, "limited to once per game for the group");
  });
});

test("Beregond: Sentinel; after he defends an attack and takes no damage, the defending player's threat is reduced by 1 (limit once per round)", () => {
  let s = base(2);
  const beregond = hero(s, P.beregond, 1);
  assert.ok(effectiveKeyword(beregond, "Sentinel"));
  // He defends player 1's attack from Corsair of Umbar (2 attack, defense 4).
  const corsair = engaged(s, SG.corsair, 0);
  s = defend(s, corsair, beregond);
  s = until(s, P.beregond);
  assert.match(s.choice!.title, /^Beregond · Defended and took no damage/);
  s = use(s, P.beregond, "use");
  s = settle(s);
  assert.equal(seatView(s, 0).threat, 19, "the defending player's threat");
  assert.equal(seatView(s, 1).threat, 20);
  // Limit once per round (he is readied to defend again).
  const second = engaged(s, SG.corsair, 0);
  get(s, beregond.id)!.exhausted = false;
  s = defend(s, second, get(s, beregond.id)!);
  for (let n = 0; n < 20 && s.choice; n++) {
    assert.ok(!offered(s, P.beregond), "limit once per round");
    s = act(s, {
      type: "CHOOSE",
      id: (s.choice.options.find((o) => o.id === "skip") ?? s.choice.options[0])
        .id,
    });
  }
  assert.equal(seatView(s, 0).threat, 19);
  // He takes damage: no Response.
  s = base(1);
  const hurt = hero(s, P.beregond);
  const crew = engaged(s, SG.crew);
  s = defend(s, crew, hurt);
  for (let n = 0; n < 20 && s.choice; n++) {
    assert.ok(!offered(s, P.beregond));
    s = act(s, {
      type: "CHOOSE",
      id: (s.choice.options.find((o) => o.id === "skip") ?? s.choice.options[0])
        .id,
    });
  }
  assert.equal(get(s, hurt.id)!.damage, 2);
  assert.equal(s.threat, 20);
});

test("Grimbold: Combat Action, discard him to choose an enemy engaged with a player; that enemy cannot attack that player this phase", () => {
  let s = base(2);
  const grimbold = ally(s, P.grimbold, 0);
  const corsair = engaged(s, SG.corsair, 1);
  const label = /^Grimbold · Discard him/;
  s.phase = "planning";
  assert.ok(
    availableAbilities(s, grimbold).find((a) => label.test(a.label))!.disabled,
  );
  s.phase = "defense";
  assert.ok(
    !availableAbilities(s, grimbold).find((a) => label.test(a.label))!.disabled,
  );
  s = act(s, { type: "ABILITY", id: grimbold.id });
  assert.match(
    s.choice!.title,
    /^Grimbold · Choose an enemy engaged with a player/,
  );
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [`${corsair.id}:1`],
  );
  s = act(s, { type: "CHOOSE", id: `${corsair.id}:1` });
  assert.ok(!seatView(s, 0).allies.some((u) => u.id === grimbold.id));
  assert.ok(seatView(s, 0).discard.includes(P.grimbold));
  assert.deepEqual(get(s, corsair.id)!.preventedAttacks, [1]);
});

test("Prince Imrahil is a hero while a hero card is in your discard pile: he collects resources and keeps his fellowship from elimination", () => {
  let s = base(1);
  const imrahil = ally(s, P.imrahil);
  check(s);
  assert.equal(unitType(get(s, imrahil.id)!), "ally");
  s.discard.push("01005");
  check(s);
  s = reload(s);
  let prince = get(s, imrahil.id)!;
  assert.equal(unitType(prince), "hero");
  assert.ok(s.heroes.some((h) => h.id === imrahil.id));
  assert.ok(!s.allies.some((u) => u.id === imrahil.id));
  assert.ok(prince.fwpImrahilHero);
  collectResources(s);
  prince = get(s, imrahil.id)!;
  assert.equal(prince.resources, 1, "he collects a resource as a hero");
  assert.ok(hasResourceIcon(prince, "spirit"));
  // The hero card leaves the discard pile: he is an ally again.
  s.discard = s.discard.filter((c) => c !== "01005");
  check(s);
  assert.equal(unitType(get(s, imrahil.id)!), "ally");
  assert.ok(s.allies.some((u) => u.id === imrahil.id));
  // The last hero of a fellowship is destroyed: Imrahil keeps it in the game.
  s = base(2);
  const keeper = ally(s, P.imrahil, 1);
  let last!: Unit;
  forOwner(s, 1, () => {
    s.heroes = s.heroes.slice(0, 1);
    last = s.heroes[0];
  });
  forOwner(s, 1, () => destroy(s, last));
  flush(s);
  check(s);
  assert.equal(s.status, "playing");
  assert.ok(!s.table!.seats[1].eliminated, "the fellowship is not eliminated");
  assert.ok(seatView(s, 1).heroes.some((h) => h.id === keeper.id));
  assert.ok(seatView(s, 1).discard.includes(last.code));
});

test("Halbarad costs 1 less for each enemy engaged with you, and each enemy engaged with you gets +10 engagement cost", () => {
  const s = base(2);
  const printed = Number(card(P.halbarad).cost);
  assert.equal(playCost(s, card(P.halbarad)), printed);
  const a = engaged(s, SG.corsair, 0);
  const b = engaged(s, SG.pirate, 0);
  const other = engaged(s, SG.corsair, 1);
  assert.equal(playCost(s, card(P.halbarad)), printed - 2);
  const before = [a, b, other].map((u) => engagementCost(s, u));
  ally(s, P.halbarad, 0);
  assert.deepEqual(
    [a, b, other].map((u) => engagementCost(s, u)),
    [before[0] + 10, before[1] + 10, before[2]],
    "only the enemies engaged with Halbarad's controller",
  );
  const staged = stage(s, SG.corsair);
  assert.equal(engagementCost(s, staged), card(SG.corsair).engagement);
});

test("Ghân-buri-Ghân: willpower X is the threat of the active location; Travel Action, discard him to travel without resolving the Travel effect", () => {
  let s = base(1);
  const ghan = ally(s, P.ghan);
  assert.equal(stats(s, ghan).will, 0);
  // Mountains of Mirkwood: its Travel effect reveals an encounter card. The
  // Ship locations in the staging area are immune to player card effects.
  const mountains = stage(s, MOUNTAINS);
  const galley = stage(s, SG.galley);
  s.encounterDeck = [SG.corsair, SG.port, SG.port];
  const label = /^Ghân-buri-Ghân · Discard him/;
  s.phase = "planning";
  assert.ok(
    availableAbilities(s, ghan).find((a) => label.test(a.label))!.disabled,
  );
  s.phase = "travel";
  assert.ok(
    !availableAbilities(s, ghan).find((a) => label.test(a.label))!.disabled,
  );
  s = act(s, { type: "ABILITY", id: ghan.id });
  assert.match(s.choice!.title, /^Ghân-buri-Ghân · Travel to a location/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    [mountains.id],
    "immune Ship locations cannot be chosen",
  );
  void galley;
  s = act(s, { type: "CHOOSE", id: mountains.id });
  s = settle(s);
  assert.equal(s.activeLocation?.id, mountains.id);
  assert.ok(s.discard.includes(P.ghan));
  assert.deepEqual(s.encounterDeck, [SG.corsair, SG.port, SG.port]);
  assert.ok(!s.staging.some((u) => u.code === SG.corsair), "no card revealed");
  // With an active location his willpower is its threat.
  const again = ally(s, P.ghan);
  assert.equal(stats(s, again).will, card(MOUNTAINS).threat);
});

test("Sterner than Steel: exhaust a Weapon or Armor attached to the defending character to cancel a shadow effect just triggered", () => {
  let s = base(1);
  const gimli = hero(s, GIMLI);
  const blade = attach(s, gimli, BLADE);
  s.hand = [make(s, P.sterner)];
  s.hand[0].owner = 0;
  const corsair = engaged(s, SG.corsair);
  s = defend(s, corsair, gimli, [SG.corsair]);
  assert.match(s.choice!.title, /^A shadow falls/);
  assert.ok(offered(s, P.sterner));
  s = use(s, P.sterner);
  s = settle(s);
  assert.ok(
    get(s, gimli.id)!.attachments.find((a) => a.id === blade.id)!.exhausted,
  );
  assert.ok(s.discard.includes(P.sterner));
  assert.ok(!s.hand.some((u) => u.code === P.sterner));
  // Corsair of Umbar's shadow (+1 attack) was canceled: 2 attack against Gimli's 2 defense.
  assert.equal(get(s, gimli.id)!.damage, 0);
  // Without a ready Weapon or Armor on the defender, it is not offered.
  s = base(1);
  const bare = hero(s, GIMLI);
  s.hand = [make(s, P.sterner)];
  s.hand[0].owner = 0;
  s = defend(s, engaged(s, SG.corsair), bare, [SG.corsair]);
  assert.ok(!offered(s, P.sterner));
});

test("Golden Shield: attach to a Rohan hero; after it is declared as a defender, exhaust the Shield to add its willpower to its defense for this attack", () => {
  let s = base(1);
  const eowyn = hero(s, P.eowyn);
  const gloin = s.heroes.find((h) => h.code === GLOIN)!;
  s.hand = [make(s, P.shield)];
  s.hand[0].owner = 0;
  const targets = playTargets(s, s.hand[0]).map((u) => u.code);
  assert.ok(targets.includes(P.eowyn), "a Rohan hero");
  assert.ok(!targets.includes(GLOIN), "not a Dwarf hero");
  void gloin;
  const shield = attach(s, eowyn, P.shield);
  const crew = engaged(s, SG.crew);
  s = defend(s, crew, eowyn);
  s = until(s, P.shield);
  s = use(s, P.shield, "use");
  s = settle(s);
  const after = get(s, eowyn.id)!;
  assert.ok(after.attachments.find((a) => a.id === shield.id)!.exhausted);
  // Umbar Pirate Crew attacks 6 against 1 defense + 4 willpower.
  assert.equal(after.damage, 1);
});

test("Livery of the Tower: spend X resources from the attached Gondor hero's pool to cancel X damage just dealt to it", () => {
  let s = base(1);
  const beregond = hero(s, P.beregond);
  attach(s, beregond, P.livery);
  s.queue.push(fx("damage", { target: beregond.id, value: 3, player: 0 }));
  flush(s);
  s = until(s, P.livery);
  assert.match(s.choice!.title, /^Livery of the Tower · 3 damage to Beregond/);
  assert.deepEqual(
    s.choice!.options.map((o) => o.id),
    ["cancel-1", "cancel-2", "cancel-3", "skip"],
  );
  s = use(s, P.livery, "cancel-2");
  s = settle(s);
  assert.equal(get(s, beregond.id)!.damage, 1);
  assert.equal(get(s, beregond.id)!.resources, 8);
  // In combat: all the damage canceled, Beregond took no damage.
  s = base(1);
  const guard = hero(s, P.beregond);
  attach(s, guard, P.livery);
  s = defend(s, engaged(s, SG.crew), guard);
  s = until(s, P.livery);
  s = use(s, P.livery, "cancel-2");
  s = until(s, P.beregond);
  s = use(s, P.beregond, "use");
  s = settle(s);
  assert.equal(get(s, guard.id)!.damage, 0);
  assert.equal(get(s, guard.id)!.resources, 8);
  assert.equal(s.threat, 19);
});

test("Roheryn: Aragorn gains the Tactics icon; after you optionally engage an enemy, exhaust Roheryn and the hero to attack that enemy", () => {
  let s = base(1);
  const aragorn = fellowshipAragorn(s)!;
  assert.ok(!hasResourceIcon(aragorn, "tactics"));
  const roheryn = attach(s, aragorn, P.roheryn);
  assert.ok(hasResourceIcon(aragorn, "tactics"));
  const corsair = stage(s, SG.corsair);
  s.phase = "encounter";
  s = act(s, { type: "ENGAGE", id: corsair.id });
  s = until(s, P.roheryn);
  s = use(s, P.roheryn, "use");
  s = settle(s);
  const rider = get(s, aragorn.id)!;
  assert.ok(rider.exhausted);
  assert.ok(rider.attachments.find((a) => a.id === roheryn.id)!.exhausted);
  // Aragorn's attack against Corsair of Umbar's defense.
  assert.equal(
    get(s, corsair.id)!.damage,
    card(FLAME_WEST_ARAGORN).attack! - card(SG.corsair).defense!,
  );
  assert.ok(s.engaged.some((u) => u.id === corsair.id));
  // An engagement that is not optional does not trigger it.
  s = base(1);
  const horse = fellowshipAragorn(s)!;
  attach(s, horse, P.roheryn);
  const pirate = stage(s, SG.pirate);
  s.queue.push(fx("engage", { target: pirate.id, player: 0 }));
  flush(s);
  assert.ok(!offered(s, P.roheryn));
});

test("Banner of Elendil: while Aragorn quests each other questing character you control gets +1 willpower; while he attacks each other attacker gets +1 attack", () => {
  let s = base(1);
  const aragorn = fellowshipAragorn(s)!;
  s.hand = [make(s, P.banner)];
  s.hand[0].owner = 0;
  assert.deepEqual(
    playTargets(s, s.hand[0]).map((u) => u.code),
    [FLAME_WEST_ARAGORN],
  );
  attach(s, aragorn, P.banner);
  assert.ok(effectiveKeyword(aragorn, "Sentinel"), "an Artifact arms Aragorn");
  const [theodred, gloin] = s.heroes.filter(
    (h) => h.code !== FLAME_WEST_ARAGORN,
  );
  const will = stats(s, theodred).will;
  theodred.committed = true;
  assert.equal(stats(s, theodred).will, will, "Aragorn is not questing");
  aragorn.committed = true;
  assert.equal(stats(s, theodred).will, will + 1);
  assert.equal(stats(s, gloin).will, card(GLOIN).willpower, "not questing");
  assert.equal(stats(s, aragorn).will, card(FLAME_WEST_ARAGORN).willpower);
  // Aragorn and Glóin attack Umbar Pirate Crew (2 defense, 8 hit points).
  s = base(1);
  const king = fellowshipAragorn(s)!;
  attach(s, king, P.banner);
  const dwarf = s.heroes.find((h) => h.code === GLOIN)!;
  const crew = engaged(s, SG.crew);
  s.phase = "attack";
  s = act(s, {
    type: "ATTACK",
    enemyId: crew.id,
    attackerIds: [king.id, dwarf.id],
  });
  s = settle(s);
  assert.equal(
    get(s, crew.id)!.damage,
    card(FLAME_WEST_ARAGORN).attack! +
      card(GLOIN).attack! +
      1 -
      card(SG.crew).defense!,
  );
});
