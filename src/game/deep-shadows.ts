import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { DEEP_SHADOWS } from "./deep-shadows-codes";
export { DEEP_SHADOWS };
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import { destroy, discardAttachment, enterEnemyEngaged } from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { oneRing } from "./lotr-saga";

/**
 * The Deep Shadows encounter set of The Mountain of Fire, shared by The Tower
 * of Cirith Ungol and Mount Doom: Drawn to the Ring, Deep Shadows and Evil
 * Vigilance, with their shadows, and the "discard until" searches both
 * scenarios use. The effect kinds keep their original "cu" names so that
 * saved games resume.
 */
const D = DEEP_SHADOWS;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const questingOf = (s: GameState, p: number) =>
  [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (u) => u.committed,
  );

/**
 * An "either … or …" choice: an option is offered only when it can change the
 * game; with one left it resolves alone.
 */
export function either(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  description: string,
) {
  if (!options.length) {
    log(s, `${title}: nothing can be resolved.`);
    return;
  }
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () =>
    choose(s, `${title} · Choose one${seatLabel(s, p)}`, options, description),
  );
}

/**
 * Discard from the top of the encounter deck until a card that matches; when
 * the deck runs out, the discard pile is shuffled back once. The matching card
 * is returned, not discarded.
 */
export function discardUntil(
  s: GameState,
  text: string,
  match: (code: string) => boolean,
  what = "enemy",
): string | undefined {
  for (let shuffled = false; ;) {
    if (!s.encounterDeck.length) {
      if (shuffled || !s.encounterDiscard.some(match)) break;
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      shuffled = true;
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = s.encounterDeck.shift()!;
    if (match(code)) return code;
    s.encounterDiscard.push(code);
    log(s, `${text}: ${card(code).name} is discarded.`);
  }
  log(s, `${text}: no ${what} is discarded.`);
  return undefined;
}
export const discardUntilEnemy = (s: GameState, text: string) =>
  discardUntil(s, text, (c) => card(c).type_code === "enemy");

/** The Deep Shadows treacheries' 'when revealed' effects. */
export function deepShadowsTreachery(s: GameState, code: string) {
  switch (code) {
    case D.drawn: {
      const first = firstPlayer(s);
      const ring = oneRing(s);
      either(
        s,
        first,
        "Drawn to the Ring",
        [
          ...(ring && !ring.exhausted
            ? [
                {
                  id: "ring",
                  label: "Exhaust The One Ring and reveal an encounter card",
                  effects: [
                    fx("cuDrawnRing", { player: first }),
                    fx("reveal", { player: first }),
                  ],
                },
              ]
            : []),
          ...(s.encounterDeck.some((c) => card(c).type_code === "enemy") ||
          s.encounterDiscard.some((c) => card(c).type_code === "enemy")
            ? [
                {
                  id: "enemy",
                  label:
                    "Discard until an enemy and put it into play engaged with you",
                  effects: [fx("cuDrawnEnemy", { player: first })],
                },
              ]
            : []),
        ],
        "When Revealed: the first player must choose: either exhaust The One Ring and reveal an encounter card, or discard cards from the top of the encounter deck until an enemy is discarded and put it into play engaged with him.",
      );
      return true;
    }
    case D.deep:
      prepend(s, ...playerOrder(s).map((player) => fx("cuDeep", { player })));
      return true;
    case D.vigilance:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("cuVigilance", { player })),
      );
      return true;
  }
  return false;
}
/** The Deep Shadows shadow effects. */
export function deepShadowsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case D.deep:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Deep Shadows: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case D.vigilance:
      c.attackBonus += 1;
      c.cuRevealOnKill = true;
      log(
        s,
        "Evil Vigilance: +1 attack; if this attack destroys a character, the top card of the encounter deck is revealed.",
        "danger",
      );
      return true;
    case D.drawn:
      prepend(s, fx("cuDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}
/** Evil Vigilance's shadow: a destroyed character reveals an encounter card. */
export function deepShadowsCharacterDestroyed(
  s: GameState,
  context: DamageContext,
) {
  const c = s.combat;
  if (!c?.cuRevealOnKill || !context.combatDamage) return;
  if (context.enemyId !== c.enemyId) return;
  c.cuRevealOnKill = false;
  prepend(s, fx("reveal", { player: c.attackPlayer ?? activeSeat(s) }));
}

/**
 * The Deep Shadows effects; `entering` prepares an enemy that enters play
 * (Wounded Uruk's damage in The Tower of Cirith Ungol).
 */
export function deepShadowsEffect(
  s: GameState,
  e: Effect,
  entering?: (s: GameState, u: Unit) => void,
): boolean {
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    // Drawn to the Ring.
    case "cuDrawnRing": {
      const ring = oneRing(s);
      if (ring) {
        ring.exhausted = true;
        log(s, "Drawn to the Ring: The One Ring is exhausted.", "danger");
      }
      return true;
    }
    case "cuDrawnEnemy": {
      const code = discardUntilEnemy(s, "Drawn to the Ring");
      if (!code) return true;
      const enemy = make(s, code);
      entering?.(s, enemy);
      log(
        s,
        `Drawn to the Ring: ${card(code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, p);
      return true;
    }
    // Deep Shadows: discard your hand (at least 3 cards) or reveal an encounter card.
    case "cuDeep": {
      const hand = seatView(s, p).hand;
      either(
        s,
        p,
        "Deep Shadows",
        [
          ...(hand.length >= 3
            ? [
                {
                  id: "hand",
                  label: `Discard your hand (${hand.length} cards)`,
                  effects: [fx("cuDiscardHand", { player: p })],
                },
              ]
            : []),
          {
            id: "reveal",
            label: "Reveal an encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
        "When Revealed: each player must choose: either discard your hand (with at least 3 cards in it), or reveal an encounter card.",
      );
      return true;
    }
    case "cuDiscardHand":
      forOwner(s, p, () => {
        const n = s.hand.length;
        s.discard.push(...s.hand.map((c) => c.code));
        s.hand = [];
        log(
          s,
          `Deep Shadows: ${who(s, p)} discard${s.table ? "s" : ""} ${n} cards from hand.`,
          "danger",
        );
      });
      return true;
    // Evil Vigilance: discard a questing character or raise threat by the questers.
    case "cuVigilance": {
      const questing = questingOf(s, p);
      either(
        s,
        p,
        "Evil Vigilance",
        [
          ...questing.map((c) => ({
            id: `discard-${c.id}`,
            code: c.code,
            label: `Discard ${name(c)}`,
            effects: [fx("cuVigilanceDiscard", { target: c.id, player: p })],
          })),
          ...(questing.length
            ? [
                {
                  id: "threat",
                  label: `Raise your threat by ${questing.length}`,
                  effects: [
                    fx("moThreat", {
                      value: questing.length,
                      text: "Evil Vigilance",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
        ],
        "When Revealed: each player must choose: either discard a questing character you control, or raise your threat by 1 for each questing character you control.",
      );
      return true;
    }
    case "cuVigilanceDiscard":
      if (u && isCharacter(u)) {
        log(s, `Evil Vigilance: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    // Drawn to the Ring's shadow: discard a non-objective attachment you control.
    case "cuDiscardAttachment": {
      const owned = [
        ...globalCharacters(s),
        ...s.staging,
        ...globalEngaged(s),
        ...allActiveLocations(s),
      ].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!owned.length) {
        log(s, "Drawn to the Ring: you control no non-objective attachment.");
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Drawn to the Ring · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          owned.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} on ${name(host)}`,
            effects: [
              fx("cuDiscardThat", { target: host.id, source: a.id, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "cuDiscardThat": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(
          s,
          `Drawn to the Ring: ${card(a.code).name} is discarded.`,
          "danger",
        );
        discardAttachment(s, u, a);
      }
      return true;
    }
  }
  return false;
}
