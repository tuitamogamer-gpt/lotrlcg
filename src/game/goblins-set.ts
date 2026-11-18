import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardCharacter,
  discardPlayerDeck,
  enterEnemyEngaged,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { OATH } from "./the-oath-support";

/**
 * The Goblins encounter set of the Two-Player Limited Edition Starter (and
 * The Dark of Mirkwood's Wild Wargs and Obsidian Arrows), shared by The Oath
 * and The Caves of Nibin-Dûm. Its effect kinds keep their "oath" names so
 * that saves stay valid. Goblin Sniper is the Core Set's card and follows its
 * rules (core-reprints.ts).
 */
export type GoblinHolder = { resolving: Unit[] };
/** The scenario state that holds the Goblin treacheries being resolved. */
export const goblinHolder = (s: GameState): GoblinHolder | undefined =>
  s.oath ?? s.caves;
export const GOBLIN_TREACHERIES: readonly string[] = [
  OATH.upon,
  OATH.eyes,
  OATH.arrows,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const his = (s: GameState) => (s.table ? "his" : "your");
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const traitsOf = (c: string) =>
  (card(c).traits ?? "").split(".").map((t) => t.trim());
/** A Goblin enemy of either scenario (Goblin Chieftain included). */
export const isGoblin = (c: string) =>
  card(c).type_code === "enemy" && traitsOf(c).includes("Goblin");
/** The player an enemy is engaged with, if any. */
function engagedWith(s: GameState, u: Unit) {
  for (const p of playerOrder(s))
    if (seatView(s, p).engaged.some((x) => x.id === u.id)) return p;
  return undefined;
}
const titles = (codes: string[]) => [
  ...new Set(codes.map((c) => card(c).name)),
];
/** The encounter deck and discard pile cards matching a test, by title. */
export const goblinSearchable = (s: GameState, test: (c: string) => boolean) =>
  titles([...s.encounterDeck, ...s.encounterDiscard].filter(test));
/** Take the first copy of a title out of the encounter deck, else the discard pile. */
export function takeEncounterTitle(s: GameState, title: string) {
  for (const zone of [s.encounterDeck, s.encounterDiscard]) {
    const i = zone.findIndex((c) => card(c).name === title);
    if (i >= 0) return make(s, zone.splice(i, 1)[0]);
  }
  return undefined;
}

/** Goblintown Scavengers and the Goblin treacheries, when revealed. */
export function goblinEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = goblinHolder(s);
  if (!q) return false;
  const player = activeSeat(s);
  if (code === OATH.scavengers) {
    if (!fromReveal) return true;
    const target = [...s.staging].reverse().find((u) => u.code === code);
    prepend(s, fx("oathScavengers", { target: target?.id, player }));
    return true;
  }
  if (!GOBLIN_TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  prepend(
    s,
    fx("oathTreachery", { code, source: u.id, player }),
    fx("oathTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function goblinTreachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    // Each player puts a Goblin enemy from the deck or discard pile into play
    // engaged with him, then the deck is shuffled (cannot be canceled).
    case OATH.upon:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("oathUpon", { player })),
        fx("oathShuffle", { player: firstPlayer(s) }),
      );
      return true;
    // Each player raises his threat for his questers or discards one.
    case OATH.eyes:
      prepend(s, ...playerOrder(s).map((player) => fx("oathEyes", { player })));
      return true;
    // Deal 2 damage to a character the revealing player controls.
    case OATH.arrows:
      prepend(s, fx("oathArrows", { value: 2, player: p }));
      return true;
  }
  return false;
}

/** The shadow effects of the Goblins set. */
export function goblinShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !goblinHolder(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const undefended = !defenders.length;
  switch (code) {
    case OATH.troop:
      c.attackBonus += 2;
      log(s, "Goblin Troop: the attacking enemy gets +2 attack.", "danger");
      return true;
    case OATH.runners:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Goblin Runners: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case OATH.upon: {
      const goblins = seatView(s, p).engaged.filter((u) =>
        isGoblin(u.code),
      ).length;
      c.attackBonus += goblins;
      log(
        s,
        `Goblins are Upon You!: the attacking enemy gets +${goblins} attack, 1 for each Goblin enemy engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    case OATH.eyes:
      if (undefended) prepend(s, fx("oathEyesShadow", { player: p }));
      else log(s, "Eyes in the Dark: the attack was defended; no effect.");
      return true;
    case OATH.arrows:
      prepend(s, fx("oathArrows", { value: 1, player: p }));
      return true;
  }
  return false;
}

/** The Goblins set's effects (and the shared treachery bookkeeping). */
export function goblinEffect(s: GameState, e: Effect): boolean {
  const q = goblinHolder(s);
  if (!q || !e.kind.startsWith("oath")) return false;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "oathTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      return !!held && goblinTreachery(s, held);
    }
    case "oathTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const [held] = q.resolving.splice(i, 1);
        s.encounterDiscard.push(held.code);
      }
      return true;
    }
    case "oathShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    case "oathUpon": {
      const options = goblinSearchable(s, isGoblin);
      if (!options.length) {
        log(
          s,
          `Goblins are Upon You!: there is no Goblin enemy for ${who(s, p)}.`,
        );
        return true;
      }
      choose(
        s,
        `Goblins are Upon You! · Put a Goblin enemy into play engaged with ${who(s, p)}${seatLabel(s, p)}`,
        options.map((title) => ({
          id: title,
          label: title,
          effects: [fx("oathUponEnemy", { text: title, player: p })],
        })),
        "When Revealed: each player must search the encounter deck and discard pile for a Goblin enemy and put it into play, engaged with him. (This effect cannot be canceled.)",
      );
      return true;
    }
    case "oathUponEnemy": {
      const u = takeEncounterTitle(s, e.text ?? "");
      if (!u) return true;
      log(
        s,
        `Goblins are Upon You!: ${name(u)} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, u, p);
      return true;
    }
    case "oathEyes": {
      const questing = charactersOf(s, p).filter((u) => u.committed);
      if (!questing.length) {
        log(
          s,
          `Eyes in the Dark: ${who(s, p)} ${s.table ? "controls" : "control"} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `Eyes in the Dark · Choose${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise ${his(s)} threat by ${questing.length} (1 for each questing character)`,
            effects: [
              fx("oathEyesThreat", { value: questing.length, player: p }),
            ],
          },
          ...questing.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Discard ${name(u)}`,
            effects: [fx("oathDiscardCharacter", { target: u.id, player: p })],
          })),
        ],
        "When Revealed: each player must choose: either raise your threat by 1 for each questing character you control, or discard a questing character you control.",
      );
      return true;
    }
    case "oathEyesThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `Eyes in the Dark: ${who(s, p)} ${s.table ? "raises" : "raise"} ${his(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "oathDiscardCharacter":
    case "oathEyesAlly": {
      const u = get(s, e.target);
      if (!u || !charactersOf(s, p).some((x) => x.id === u.id)) return true;
      log(s, `${name(u)} is discarded.`, "danger");
      forOwner(s, p, () => discardCharacter(s, u));
      return true;
    }
    case "oathEyesShadow": {
      const allies = seatView(s, p).allies;
      if (!allies.length) return true;
      choose(
        s,
        `Eyes in the Dark · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("oathEyesAlly", { target: u.id, player: p })],
        })),
        "Shadow: if this attack is undefended, discard an ally you control.",
      );
      return true;
    }
    case "oathArrows": {
      const targets = charactersOf(s, p);
      if (!targets.length) return true;
      choose(
        s,
        `Obsidian Arrows · Deal ${e.value} damage to a character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("damage", { target: u.id, value: e.value, player: p })],
        })),
        e.value === 1
          ? "Shadow: deal 1 damage to a character you control."
          : "When Revealed: deal 2 damage to a character you control.",
      );
      return true;
    }
    case "oathWargs": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (isGoblin(top)) {
        const u = make(s, top);
        log(
          s,
          `Wild Wargs: ${name(u)} is discarded from the encounter deck and put into play engaged with ${who(s, p)}.`,
          "danger",
        );
        enterEnemyEngaged(s, u, p);
        return true;
      }
      s.encounterDiscard.push(top);
      log(
        s,
        `Wild Wargs: ${card(top).name} is discarded from the encounter deck.`,
      );
      return true;
    }
    case "oathScavengers": {
      const u = get(s, e.target);
      const discarded = playerOrder(s).flatMap((player) =>
        discardPlayerDeck(s, 1, player),
      );
      const total = discarded.reduce(
        (n, c) => n + (Number(card(c).cost) || 0),
        0,
      );
      if (u) u.tempThreat = (u.tempThreat ?? 0) + total;
      log(
        s,
        `Goblintown Scavengers: ${discarded.length ? discarded.map((c) => card(c).name).join(", ") : "no card"} discarded; it gets +${total} threat until the end of the phase.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

/** Goblin Troop: each other Goblin enemy engaged with its player gets +1/+1. */
export function goblinStats(s: GameState, u: Unit) {
  if (!goblinHolder(s) || u.code === OATH.troop || !isGoblin(u.code)) return {};
  const p = engagedWith(s, u);
  return p !== undefined &&
    seatView(s, p).engaged.some((x) => live(x, OATH.troop))
    ? { attack: 1, defense: 1 }
    : {};
}
/** Goblins are Upon You!'s When Revealed cannot be canceled. */
export const goblinCannotCancel = (s: GameState, code?: string) =>
  !!goblinHolder(s) && code === OATH.upon;
/** Goblin Troop cannot have attachments. */
export const goblinCannotAttach = (s: GameState, u: Unit) =>
  !!goblinHolder(s) && u.code === OATH.troop;
/** Wild Wargs: after it engages you, the top card may bring a Goblin. */
export function goblinEngaged(s: GameState, u: Unit) {
  if (!goblinHolder(s) || !live(u, OATH.wargs)) return;
  prepend(s, fx("oathWargs", { player: activeSeat(s) }));
}
/** Effect kinds every player may resolve (the first player's bookkeeping). */
export const GOBLIN_SHARED_EFFECTS: readonly string[] = [
  "oathShuffle",
  "oathTreacheryDone",
];
