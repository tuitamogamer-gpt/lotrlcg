import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyAction, playTargets } from "../src/game/engine";
import { card, SCRIPTED } from "../src/game/cards";
import { get, make, stats } from "../src/game/core";
import { damage, destroy, phaseEnd } from "../src/game/board";
import { flush } from "../src/game/effects";
import {
  availableAbilities,
  canPlay,
  gandalfDeckPlayReason,
  needsTarget,
  publicState,
} from "../src/game/actions";
import { combatDefenderDefense } from "../src/game/combat";
import { DECK_CARDS, HERO_CARDS, deckWarnings } from "../src/game/decks";
import { forOwner, seatView } from "../src/game/table";
import { ringBearer } from "../src/game/lotr-saga";
import {
  GANDALF_DECK_KEY,
  ROAD_DARKENS_PLAYER as R,
  gandalfFaceupCard,
} from "../src/game/road-darkens-player-cards";
import {
  base,
  choose,
  deck,
  engaged,
  hand,
  reload,
  settle,
  stage,
} from "./shadow-past-fixtures";
import type { GameState, Unit } from "../src/game/types";
import art from "./road-darkens-player-art.json";
import official from "../src/data/official-player-cards.json";

const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const act = (s: GameState, action: Parameters<typeof applyAction>[1]) =>
  applyAction(reload(s), action);
/** Replace one of a player's starting heroes (Frodo stays in slot 3). */
const hero = (s: GameState, code: string, slot: number, p = 0) => {
  let u!: Unit;
  forOwner(s, p, () => {
    u = make(s, code);
    u.owner = p;
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
const GALADRIEL = "142003",
  ELROND = "142005",
  CORE_GANDALF = "01073",
  AXEHAND = "01028",
  SPEARMAN = "01029",
  TOOK = "01043",
  GUARD = "01013",
  SWIFT = "01037",
  FEINT = "01034",
  COURAGE = "01057",
  HASTY = "01048",
  HOBBIT_PIPE = "141015",
  DWARF_PIPE = "17007",
  TROLL = "01082",
  SPIDER = "01096",
  ORCS = "01089",
  RIDER = "01081",
  GIMLI = "01004",
  EOWYN = "01007",
  LOUIS = "octgn:51223bd0-ffd1-11df-a976-0801202c9015";

test("The Road Darkens player cards are scripted, deckable and pinned to reviewed scans", () => {
  const codes = Object.values(R);
  assert.equal(codes.length, 7);
  for (const code of [...codes, GALADRIEL, ELROND])
    assert.ok(SCRIPTED.has(code), code);
  const heroes = HERO_CARDS.map((c) => c.code),
    deckable = DECK_CARDS.map((c) => c.code);
  assert.ok(heroes.includes(R.gandalf));
  for (const code of codes.filter((c) => c !== R.gandalf))
    assert.ok(deckable.includes(code), code);
  // The campaign boons need the Saga campaign mode, which is not imported.
  for (const code of ["142011", "142012", "142013", "142014", "142015"])
    assert.ok(!SCRIPTED.has(code), code);
  assert.equal(art.length, 9);
  for (const a of art) {
    assert.equal(readFileSync(`public${a.localPath}`).length, a.bytes);
    assert.equal(hash(`public${a.localPath}`), a.sha256);
    assert.equal(card(a.code).imagesrc, a.localPath);
  }
  // The printed cards: Flame of Anor has Victory 1 and Elrond heals "from"
  // a hero; every other text is the catalog's.
  for (const code of [...codes, GALADRIEL, ELROND]) {
    const catalog = (official as { code: string; text?: string }[]).find(
      (c) => c.code === code,
    )!.text;
    if (code === ELROND) {
      assert.ok(card(code).text!.includes("heal all damage from a hero"));
      assert.equal(
        card(code).text,
        catalog!.replace("damage on a hero", "damage from a hero"),
      );
    } else assert.equal(card(code).text, catalog, code);
  }
  assert.equal(card(R.flame).victory, 1);
  assert.ok(needsTarget({ code: R.flame } as Unit));
  assert.deepEqual(
    deckWarnings({
      heroes: [R.gandalf, "01001", "01002"],
      cards: { [R.fellowship]: 1, [R.staff]: 1 },
    }),
    [
      "Fellowship of the Ring is paid with the Ring-bearer's Fellowship resources, so it can only be played in The Lord of the Rings scenarios.",
    ],
  );
});

test("Gandalf plays with the top card of the deck faceup, for every player to see", () => {
  const s = base(2);
  deck(s, [AXEHAND, TOOK, GUARD]);
  deck(s, [SPEARMAN, TOOK], 1);
  assert.equal(gandalfFaceupCard(s), null);
  assert.equal(
    "deckTop" in (publicState(s) as Record<string, unknown>),
    false,
    "the top card is facedown without Gandalf",
  );
  hero(s, R.gandalf, 0);
  const view = publicState(s) as unknown as {
    deckTop: string;
    table: { seats: { deckTop?: string }[] };
  };
  assert.equal(gandalfFaceupCard(s), AXEHAND);
  assert.equal(view.deckTop, AXEHAND);
  assert.equal(view.table.seats[0].deckTop, AXEHAND);
  // The second player's deck stays facedown.
  assert.equal(view.table.seats[1].deckTop, undefined);
  assert.equal(gandalfFaceupCard(s, 1), null);
  // The rest of the deck order stays private.
  const swapped = structuredClone(s);
  forOwner(swapped, 0, () => {
    [swapped.deck[1], swapped.deck[2]] = [swapped.deck[2], swapped.deck[1]];
  });
  assert.deepEqual(publicState(swapped), publicState(s));
  // A blank Gandalf turns the card facedown again.
  s.heroes[0].blanked = true;
  assert.equal(gandalfFaceupCard(s), null);
});

test("Gandalf plays the top card of the deck once per phase, paying any sphere with his resources", () => {
  let s = base();
  const gandalf = hero(s, R.gandalf, 0);
  // Only Gandalf can pay for a tactics card: no other hero has the icon.
  for (const h of s.heroes) h.resources = h.id === gandalf.id ? 2 : 0;
  deck(s, [AXEHAND, SPEARMAN, TOOK]);
  const preview = { ...make(s, AXEHAND) };
  assert.equal(canPlay(s, preview), "A matching sphere hero is required.");
  assert.equal(gandalfDeckPlayReason(s), null);
  s = act(s, { type: "PLAY_DECK", payment: { [gandalf.id]: 2 } });
  s = settle(s);
  assert.deepEqual(
    s.allies.map((u) => u.code),
    [AXEHAND],
  );
  assert.equal(get(s, gandalf.id)!.resources, 0);
  assert.deepEqual(s.deck, [SPEARMAN, TOOK]);
  assert.ok(s.used.includes(GANDALF_DECK_KEY));
  // Once per phase: the next top card waits for the next phase.
  get(s, gandalf.id)!.resources = 5;
  assert.equal(
    gandalfDeckPlayReason(s),
    "Gandalf's ability is limited to once per phase.",
  );
  assert.throws(() => act(s, { type: "PLAY_DECK" }), /once per phase/);
  phaseEnd(s);
  flush(s);
  s.phase = "planning";
  assert.equal(gandalfDeckPlayReason(s), null);
  // Without matching resources the play is refused and nothing moves.
  for (const h of s.heroes) h.resources = 0;
  assert.equal(gandalfDeckPlayReason(s), "Not enough matching resources.");
  assert.throws(() => act(s, { type: "PLAY_DECK" }), /matching resources/);
  // A hero with the printed icon may pay as for a card in the hand.
  const gimli = hero(s, GIMLI, 1);
  gimli.resources = 2;
  s = act(s, { type: "PLAY_DECK", payment: { [gimli.id]: 2 } });
  s = settle(s);
  assert.deepEqual(
    s.allies.map((u) => u.code),
    [AXEHAND, SPEARMAN],
  );
  assert.deepEqual(s.deck, [TOOK]);
});

test("Gandalf's deck play follows the card's own timing, targets and payment", () => {
  let s = base();
  const gandalf = hero(s, R.gandalf, 0);
  gandalf.resources = 5;
  // An event outside its action window and a response are refused.
  deck(s, [FEINT, AXEHAND]);
  assert.equal(gandalfDeckPlayReason(s), "This is a Combat Action.");
  // In its window it still needs a target: no enemy is engaged.
  s.phase = "defense";
  assert.equal(gandalfDeckPlayReason(s), "No eligible target is available.");
  s.phase = "planning";
  deck(s, [HASTY]);
  assert.match(gandalfDeckPlayReason(s)!, /offered automatically/);
  // An attachment needs its own legal target and is paid like a hand card.
  deck(s, [COURAGE, AXEHAND]);
  assert.equal(gandalfDeckPlayReason(s), null);
  const frodo = ringBearer(s)!;
  s = act(s, {
    type: "PLAY_DECK",
    target: frodo.id,
    payment: { [gandalf.id]: 2 },
  });
  s = settle(s);
  assert.ok(get(s, frodo.id)!.attachments.some((a) => a.code === COURAGE));
  assert.deepEqual(s.deck, [AXEHAND]);
  // A blank Gandalf cannot play from the deck.
  s.used = [];
  get(s, gandalf.id)!.blanked = true;
  assert.equal(gandalfDeckPlayReason(s), "Gandalf's printed text is blank.");
  // An empty deck has no top card.
  get(s, gandalf.id)!.blanked = false;
  deck(s, []);
  assert.equal(gandalfDeckPlayReason(s), "Your deck has no top card.");
});

test("A card played with Gandalf is played as if it was in the hand: Galadriel's response searches", () => {
  let s = base();
  const gandalf = hero(s, R.gandalf, 0);
  gandalf.resources = 3;
  deck(s, [GALADRIEL, COURAGE, AXEHAND, TOOK]);
  s = act(s, { type: "PLAY_DECK", payment: { [gandalf.id]: 3 } });
  assert.ok(offered(s, GALADRIEL), JSON.stringify(s.choice));
});

test("Boromir gets +2 defense against a more threatening enemy and readies after he takes damage", () => {
  let s = base();
  const boromir = ally(s, R.boromir);
  const troll = engaged(s, TROLL); // engagement cost 30
  const rider = engaged(s, RIDER); // engagement cost 10
  const combat = { defensePenalty: 0 } as NonNullable<GameState["combat"]>;
  assert.equal(combatDefenderDefense(s, boromir, troll, combat), 3);
  assert.equal(combatDefenderDefense(s, boromir, rider, combat), 1);
  // He is ready: taking damage offers nothing.
  damage(s, boromir.id, 1);
  flush(s);
  assert.equal(s.choice, null);
  // Exhausted, he may ready after any amount of damage.
  boromir.exhausted = true;
  damage(s, boromir.id, 1);
  flush(s);
  assert.ok(offered(s, R.boromir), JSON.stringify(s.choice));
  s = choose(s, "use");
  assert.equal(get(s, boromir.id)!.exhausted, false);
  assert.equal(get(s, boromir.id)!.damage, 2);
  // Lethal damage destroys him before the response.
  get(s, boromir.id)!.exhausted = true;
  damage(s, boromir.id, 2);
  flush(s);
  assert.equal(get(s, boromir.id), undefined);
  assert.equal(s.choice, null);
});

test("Bilbo Baggins searches the deck for a Pipe attachment and shuffles it", () => {
  let s = base();
  hero(s, EOWYN, 0).resources = 5;
  deck(s, [AXEHAND, R.pipe, TOOK, HOBBIT_PIPE, R.pipe, GUARD]);
  hand(s, [R.bilbo]);
  s = act(s, { type: "PLAY", id: s.hand[0].id });
  assert.ok(offered(s, R.bilbo), JSON.stringify(s.choice));
  s = choose(s, "use");
  // Two different Pipes: the player chooses.
  assert.deepEqual(
    s.choice!.options.map((o) => o.code),
    [R.pipe, HOBBIT_PIPE],
  );
  s = choose(s, s.choice!.options[1].id);
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [HOBBIT_PIPE],
  );
  assert.equal(s.deck.length, 5);
  assert.deepEqual(
    [...s.deck].sort(),
    [AXEHAND, GUARD, R.pipe, R.pipe, TOOK].sort(),
  );
  // Bilbo put into play by an effect responds too; with one kind of Pipe it
  // is taken directly, and with none the deck is just shuffled.
  s = base();
  deck(s, [AXEHAND, DWARF_PIPE, TOOK]);
  const bilbo = make(s, R.bilbo);
  forOwner(s, 0, () => s.allies.push(bilbo));
  s.queue.push({ kind: "rdpBilboOffer", source: bilbo.id, player: 0 });
  flush(s);
  s = choose(s, "use");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [DWARF_PIPE],
  );
  s.queue.push({ kind: "rdpBilboOffer", source: bilbo.id, player: 0 });
  flush(s);
  s = choose(s, "use");
  assert.deepEqual(
    s.hand.map((u) => u.code),
    [DWARF_PIPE],
  );
  assert.deepEqual([...s.deck].sort(), [AXEHAND, TOOK].sort());
});

test("Flame of Anor goes to the victory display, discards the top card and readies an Istari character with +X attack", () => {
  let s = base();
  hand(s, [R.flame]);
  s.phase = "attack";
  // No Istari character yet.
  assert.equal(
    canPlay(s, s.hand[0]),
    "Flame of Anor needs an Istari character you control.",
  );
  const gandalf = hero(s, R.gandalf, 0);
  gandalf.exhausted = true;
  gandalf.resources = 1;
  deck(s, []);
  assert.equal(
    canPlay(s, s.hand[0]),
    "Flame of Anor must discard the top card of your deck.",
  );
  deck(s, [SPEARMAN, TOOK]);
  const core = ally(s, CORE_GANDALF);
  assert.deepEqual(
    playTargets(s, s.hand[0])
      .map((u) => u.id)
      .sort(),
    [gandalf.id, core.id].sort(),
  );
  const attack = stats(s, gandalf).attack;
  s = act(s, {
    type: "PLAY",
    id: s.hand[0].id,
    target: gandalf.id,
    payment: { [gandalf.id]: 1 },
  });
  s = settle(s);
  const now = get(s, gandalf.id)!;
  assert.equal(now.exhausted, false);
  // X is the discarded Gondorian Spearman's cost, 2.
  assert.equal(stats(s, now).attack, attack + 2);
  assert.deepEqual(s.discard, [SPEARMAN]);
  assert.deepEqual(s.deck, [TOOK]);
  assert.deepEqual(s.victoryCards, [R.flame]);
  assert.equal(s.victory, 1);
  // The bonus lasts until the end of the phase.
  phaseEnd(s);
  flush(s);
  assert.equal(stats(s, get(s, gandalf.id)!).attack, attack);
});

test("Gandalf's Staff attaches to Gandalf and exhausts to draw, add a resource or discard a shadow card", () => {
  let s = base(2);
  const gandalf = hero(s, R.gandalf, 0);
  gandalf.resources = 5;
  hand(s, [R.staff, R.staff]);
  const staff = s.hand[0];
  // Attach to Gandalf: any character named Gandalf, here the hero.
  assert.deepEqual(
    playTargets(s, staff).map((u) => u.id),
    [gandalf.id],
  );
  s = act(s, {
    type: "PLAY",
    id: staff.id,
    target: gandalf.id,
    payment: { [gandalf.id]: 2 },
  });
  s = settle(s);
  // Unique: the second copy cannot be played.
  assert.match(
    canPlay(s, s.hand[0]) ?? "",
    /unique card with this name is already in play/,
  );
  const host = get(s, gandalf.id)!;
  const a = host.attachments.find((x) => x.code === R.staff)!;
  // Draw: choose a player.
  deck(s, [TOOK], 1);
  const abilities = availableAbilities(s, host);
  assert.ok(abilities.some((x) => x.id === a.id && !x.disabled));
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: a.id });
  assert.ok(s.choice!.options.some((o) => o.id === "draw-1"));
  s = choose(s, "draw-1");
  assert.deepEqual(
    seatView(s, 1).hand.map((u) => u.code),
    [TOOK],
  );
  assert.equal(
    get(s, gandalf.id)!.attachments.find((x) => x.id === a.id)!.exhausted,
    true,
  );
  // Exhausted: no second use this round.
  assert.equal(
    availableAbilities(s, get(s, gandalf.id)!).find((x) => x.id === a.id)!
      .disabled,
    true,
  );
  // A resource for another player's hero.
  get(s, gandalf.id)!.attachments.find((x) => x.id === a.id)!.exhausted = false;
  const other = seatView(s, 1).heroes[0];
  const before = other.resources;
  s = act(s, { type: "ABILITY", id: gandalf.id, attachmentId: a.id });
  s = choose(s, `resource-${other.id}`);
  assert.equal(seatView(s, 1).heroes[0].resources, before + 1);
  // A shadow card from a non-unique enemy only.
  get(s, gandalf.id)!.attachments.find((x) => x.id === a.id)!.exhausted = false;
  const orcs = engaged(s, ORCS);
  const louis = engaged(s, LOUIS);
  orcs.shadows = [SPIDER];
  louis.shadows = [TROLL];
  s = act(s, { type: "ABILITY", id: gandalf.id, attachmentId: a.id });
  const ids = s.choice!.options.map((o) => o.id);
  assert.ok(ids.includes(`shadow-${orcs.id}-0`));
  assert.ok(!ids.some((id) => id.startsWith(`shadow-${louis.id}`)));
  s = choose(s, `shadow-${orcs.id}-0`);
  assert.deepEqual(get(s, orcs.id)!.shadows, []);
  assert.ok(s.encounterDiscard.includes(SPIDER));
});

test("Wizard Pipe attaches to an Istari character and exchanges a card in hand with the top card of the deck", () => {
  let s = base();
  const gandalf = hero(s, R.gandalf, 0);
  gandalf.resources = 5;
  const core = ally(s, CORE_GANDALF);
  hand(s, [R.pipe, R.pipe, SWIFT]);
  assert.deepEqual(
    playTargets(s, s.hand[0])
      .map((u) => u.id)
      .sort(),
    [gandalf.id, core.id].sort(),
  );
  s = act(s, {
    type: "PLAY",
    id: s.hand[0].id,
    target: gandalf.id,
    payment: { [gandalf.id]: 1 },
  });
  s = settle(s);
  // Limit 1 per character: the second copy can only go on the other Istari.
  assert.deepEqual(
    playTargets(s, s.hand[0]).map((u) => u.id),
    [core.id],
  );
  deck(s, [AXEHAND, TOOK]);
  const host = get(s, gandalf.id)!;
  const pipe = host.attachments.find((x) => x.code === R.pipe)!;
  const swift = s.hand.find((u) => u.code === SWIFT)!;
  s = act(s, { type: "ABILITY", id: host.id, attachmentId: pipe.id });
  s = choose(s, swift.id);
  assert.deepEqual(s.deck, [SWIFT, TOOK]);
  assert.ok(s.hand.some((u) => u.code === AXEHAND));
  assert.ok(!s.hand.some((u) => u.code === SWIFT));
  assert.equal(
    get(s, gandalf.id)!.attachments.find((x) => x.id === pipe.id)!.exhausted,
    true,
  );
  // With Gandalf the new top card is faceup.
  assert.equal(gandalfFaceupCard(s), SWIFT);
});

test("Fellowship of the Ring gives each hero +1 willpower and is discarded after a character is destroyed", () => {
  let s = base(2);
  const frodo = ringBearer(s)!;
  frodo.resources = 2;
  hand(s, [R.fellowship]);
  // Attach to the Ring-bearer only.
  assert.deepEqual(
    playTargets(s, s.hand[0]).map((u) => u.id),
    [frodo.id],
  );
  const own = s.heroes[0],
    other = seatView(s, 1).heroes[0];
  const will = [stats(s, own).will, stats(s, other).will];
  s = act(s, {
    type: "PLAY",
    id: s.hand[0].id,
    target: frodo.id,
    payment: { [frodo.id]: 2 },
  });
  s = settle(s);
  assert.deepEqual(
    [stats(s, get(s, own.id)!).will, stats(s, seatView(s, 1).heroes[0]).will],
    [will[0] + 1, will[1] + 1],
  );
  // Allies do not get the bonus.
  const took = ally(s, TOOK);
  assert.equal(stats(s, took).will, card(TOOK).willpower);
  // A character leaving play another way does not discard it.
  const guard = ally(s, GUARD);
  destroy(s, guard, false);
  flush(s);
  assert.ok(get(s, frodo.id)!.attachments.some((a) => a.code === R.fellowship));
  // Destroyed: Forced, discard Fellowship of the Ring.
  damage(s, took.id, 5);
  flush(s);
  assert.equal(get(s, took.id), undefined);
  assert.ok(
    !get(s, frodo.id)!.attachments.some((a) => a.code === R.fellowship),
  );
  assert.ok(s.discard.includes(R.fellowship));
  assert.equal(stats(s, get(s, own.id)!).will, will[0]);
  // A stage enemy stays unaffected throughout.
  stage(s, SPIDER);
});
