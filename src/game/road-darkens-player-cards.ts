import type {
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  canChoosePlayerShadowDiscard,
  canGainResources,
  canPlayerAffectShadow,
  cannotReady,
  choose,
  draw,
  engagementCost,
  fx,
  get,
  log,
  noPlayerCardEconomy,
  prepend,
  putPlayerDeck,
  removePlayerShadowCard,
  requireRule,
  shuffle,
  skip,
  stats,
  takePlayerDeck,
} from "./core";
import { discardAttachment, discardPlayerDeck, readyCharacter } from "./board";
import {
  activeSeat,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isHero } from "./card-types";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import { isEnemy } from "./ships";
import { isSacked } from "./carrock";
import { fateCannotSearch } from "./fate-numenor";
import { putPlayedEventInVictory } from "./event-resolution";
import { gondorResourcesGained } from "./gondor-player-cards";
import { canLeaveHand } from "./hand-rules";

/**
 * The player cards of The Lord of the Rings: The Road Darkens other than
 * Frodo Baggins (the Saga framework) and Galadriel and Elrond, which the
 * collector module already scripts for their Two-Player Limited Edition
 * Starter reprint. Gandalf's Staff, Wizard Pipe and Fellowship of the Ring
 * register their attach restrictions in the attachment rules of
 * `expansion-passives.ts`; their abilities and bonuses live here.
 */
export const ROAD_DARKENS_PLAYER = {
  gandalf: "142002",
  boromir: "142004",
  bilbo: "142006",
  flame: "142007",
  staff: "142008",
  pipe: "142009",
  fellowship: "142010",
} as const;
const P = ROAD_DARKENS_PLAYER;

/** Gandalf's deck play is limited to once per phase for his controller. */
export const GANDALF_DECK_KEY = "phase:rdp:gandalf-deck";
/** The preview id of the faceup top card the play dialog offers. */
export const GANDALF_DECK_PREVIEW = "deck-play:";
const SPHERES = ["leadership", "lore", "tactics", "spirit"];
/**
 * These cards open a cost choice from the hand when they are played, and the
 * choice continues with the card in the hand; Gandalf cannot play them.
 */
const HAND_COST_CHOICES = ["16004", "12010", "12118"];

const live = (u: Unit) => !u.blanked && !isSacked(u);
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
/** "An enemy with an engagement cost higher than your threat." */
const higher = (s: GameState, enemy: Unit, p: number) =>
  engagementCost(s, enemy) > effectiveThreat(s, p);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) => isEnemy(u));
function attachmentById(s: GameState, id?: string) {
  for (const host of globalCharacters(s)) {
    const a = host.attachments.find((x) => x.id === id);
    if (a) return { host, a };
  }
  return undefined;
}
const use = (label: string, effects: Effect[]): Option => ({
  id: "use",
  label,
  effects,
});

// ------------------------------------------------------------------ Gandalf

/** Gandalf: his controller plays with the top card of their deck faceup. */
export const gandalfDeckFaceup = (s: GameState, p = activeSeat(s)) =>
  seatView(s, p).heroes.some((h) => h.code === P.gandalf && !h.blanked);
/** The faceup top card of a player's deck, or null while it is facedown. */
export const gandalfFaceupCard = (s: GameState, p = activeSeat(s)) =>
  gandalfDeckFaceup(s, p) ? (seatView(s, p).deck[0] ?? null) : null;

/**
 * Gandalf's own conditions for playing the top card of the deck. The card's
 * timing, target and payment are checked by the play itself, as for a card in
 * the hand.
 */
export function gandalfDeckProblem(s: GameState): string | null {
  const gandalf = s.heroes.find((h) => h.code === P.gandalf);
  if (!gandalf) return "You do not control Gandalf.";
  if (!live(gandalf)) return "Gandalf's printed text is blank.";
  if (!s.deck.length) return "Your deck has no top card.";
  if (s.used.includes(GANDALF_DECK_KEY))
    return "Gandalf's ability is limited to once per phase.";
  if (HAND_COST_CHOICES.includes(s.deck[0]))
    return `${card(s.deck[0]).name} chooses its cost from your hand, so Gandalf cannot play it from your deck.`;
  return null;
}
/**
 * When a card is played from the top of the deck with Gandalf, Gandalf has
 * the printed leadership, lore, tactics and spirit icons and can pay for it.
 */
export const gandalfDeckPayer = (h: Unit, c: Card) =>
  !!c.gandalfDeckPlay &&
  h.code === P.gandalf &&
  !h.blanked &&
  SPHERES.includes(c.sphere_code);

// ----------------------------------------------------------------- passives

/** Boromir: +2 defense against an enemy with a higher engagement cost. */
export const roadDarkensPlayerDefenseBonus = (
  s: GameState,
  defender: Unit,
  enemy: Unit,
) =>
  defender.code === P.boromir &&
  live(defender) &&
  higher(s, enemy, ownerOf(s, defender))
    ? 2
    : 0;
/** Fellowship of the Ring: each hero in play gets +1 willpower. */
export function roadDarkensPlayerWillBonus(s: GameState, u: Unit) {
  if (!isHero(u)) return 0;
  const inPlay = globalCharacters(s);
  const copies = inPlay.reduce(
    (n, host) =>
      n +
      host.attachments.filter((a) => a.code === P.fellowship && enabled(a))
        .length,
    0,
  );
  return copies && inPlay.some((x) => x.id === u.id) ? copies : 0;
}

// ------------------------------------------------------------------- events

const flameTargets = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => hasTrait(u, "Istari") && !playerEffectImmune(s, u, P.flame),
  );
export const roadDarkensPlayerTargets = (s: GameState, code: string) =>
  code === P.flame ? flameTargets(s) : undefined;
export function roadDarkensPlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.code !== P.flame) return null;
  if (!flameTargets(s).length)
    return "Flame of Anor needs an Istari character you control.";
  if (!s.deck.length)
    return "Flame of Anor must discard the top card of your deck.";
  return null;
}
/**
 * Flame of Anor's cost: it goes to the victory display instead of the discard
 * pile and the top card of the deck is discarded. Returns X, the discarded
 * card's cost, for the ability.
 */
export function roadDarkensPlayerEventCost(
  s: GameState,
  u: Unit,
): number | undefined {
  if (u.code !== P.flame) return undefined;
  requireRule(
    s.deck.length > 0,
    "Flame of Anor must discard the top card of your deck.",
  );
  putPlayedEventInVictory(s, u.code);
  const [discarded] = discardPlayerDeck(s, 1);
  const x = Number(card(discarded).cost) || 0;
  log(
    s,
    `Flame of Anor is added to the victory display and ${card(discarded).name} is discarded from the top of the deck (X = ${x}).`,
  );
  return x;
}
export function roadDarkensPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
  x = 0,
): boolean {
  if (code !== P.flame) return false;
  const u = get(s, target);
  if (!u || !flameTargets(s).some((t) => t.id === u.id)) {
    log(s, "Flame of Anor's Istari character is no longer a legal target.");
    return true;
  }
  readyCharacter(s, u);
  if (x) u.tempAttack = (u.tempAttack ?? 0) + x;
  log(
    s,
    `Flame of Anor readies ${name(u)}, who gets +${x} attack until the end of the phase.`,
    "good",
  );
  return true;
}

// ---------------------------------------------------------------- abilities

const staffAbility = (a: Attachment) => a.code === P.staff;
const pipeAbility = (a: Attachment) => a.code === P.pipe;
export const roadDarkensPlayerAbilityLabel = (code: string) =>
  code === P.staff
    ? "Gandalf's Staff · Exhaust: a player draws, a hero gains a resource or a shadow card is discarded"
    : code === P.pipe
      ? "Wizard Pipe · Exhaust: exchange a card in your hand with the top card of your deck"
      : undefined;
function staffOptions(s: GameState, staffId: string, player: number) {
  const draws: Option[] = noPlayerCardEconomy(s)
    ? []
    : playerOrder(s)
        .filter((p) => seatView(s, p).deck.length > 0)
        .map((p) => ({
          id: `draw-${p}`,
          label: s.table ? `${seatName(s, p)} draws 1 card` : "Draw 1 card",
          effects: [fx("rdpStaffDraw", { source: staffId, value: p, player })],
        }));
  const resources: Option[] = allHeroes(s)
    .filter((h) => canGainResources(s, h) && !playerEffectImmune(s, h, P.staff))
    .map((h) => ({
      id: `resource-${h.id}`,
      code: h.code,
      label: `Add 1 resource to ${name(h)}${seatLabel(s, ownerOf(s, h))}`,
      effects: [
        fx("rdpStaffResource", { source: staffId, target: h.id, player }),
      ],
    }));
  const shadows: Option[] = enemiesInPlay(s)
    .filter(
      (x) =>
        !card(x.code).is_unique &&
        canPlayerAffectShadow(s, x) &&
        !playerEffectImmune(s, x, P.staff),
    )
    .flatMap((x) =>
      x.shadows.flatMap((_code, index) =>
        canChoosePlayerShadowDiscard(s, x, index)
          ? [
              {
                id: `shadow-${x.id}-${index}`,
                code: x.code,
                label: `Discard shadow card ${index + 1} from ${name(x)}`,
                effects: [
                  fx("rdpStaffShadow", {
                    source: staffId,
                    target: x.id,
                    value: index,
                    player,
                  }),
                ],
              },
            ]
          : [],
      ),
    );
  return [...draws, ...resources, ...shadows];
}
export function roadDarkensPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (!attachmentId) return undefined;
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || (!staffAbility(a) && !pipeAbility(a))) return undefined;
  const title = card(a.code).name;
  if (!enabled(a)) return `${title}'s text is inactive.`;
  if (attachmentController(s, u, a) !== activeSeat(s))
    return `You do not control ${title}.`;
  if (a.exhausted) return `${title} must be ready.`;
  if (staffAbility(a) && !staffOptions(s, a.id, activeSeat(s)).length)
    return "No player can draw, no hero can gain a resource and no shadow card can be discarded.";
  if (pipeAbility(a)) {
    if (!s.hand.some(canLeaveHand))
      return "Wizard Pipe needs a card in your hand.";
    if (!s.deck.length) return "Wizard Pipe needs a card on top of your deck.";
  }
  return undefined;
}
export function useRoadDarkensPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = attachmentId
    ? u.attachments.find((x) => x.id === attachmentId)
    : undefined;
  if (!a || (!staffAbility(a) && !pipeAbility(a))) return false;
  const problem = roadDarkensPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  if (staffAbility(a)) {
    const options = staffOptions(s, a.id, player);
    a.exhausted = true;
    choose(
      s,
      "Gandalf's Staff · Choose one",
      options,
      "Choose a player to draw 1 card, add 1 resource to a hero's resource pool, or discard a shadow card from a non-unique enemy.",
    );
    return true;
  }
  a.exhausted = true;
  choose(
    s,
    "Wizard Pipe · Choose a card in your hand",
    s.hand.filter(canLeaveHand).map((h) => ({
      id: h.id,
      code: h.code,
      label: `Put ${name(h)} on top of your deck`,
      effects: [fx("rdpPipeSwap", { source: a.id, target: h.id, player })],
    })),
    "The chosen card goes on top of your deck and the top card of your deck goes to your hand.",
  );
  return true;
}

// ---------------------------------------------------------------- responses

/** Boromir: after he takes any amount of damage, his controller may ready him. */
export function roadDarkensPlayerDamageTaken(
  s: GameState,
  u: Unit,
  value: number,
) {
  if (
    u.code !== P.boromir ||
    value <= 0 ||
    !live(u) ||
    !u.exhausted ||
    cannotReady(u, s) ||
    u.damage >= stats(s, u).health
  )
    return;
  prepend(s, fx("rdpBoromirOffer", { source: u.id, player: ownerOf(s, u) }));
}
/** Bilbo Baggins: after he enters play, however he entered. */
export function roadDarkensPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code !== P.bilbo || !live(u)) return;
  const p = ownerOf(s, u);
  if (seatView(s, p).deck.length && !fateCannotSearch(s, p))
    prepend(s, fx("rdpBilboOffer", { source: u.id, player: p }));
}
/** Fellowship of the Ring: after a character is destroyed, discard it. */
export function roadDarkensPlayerCharacterDestroyed(s: GameState, u: Unit) {
  if (
    globalCharacters(s).some(
      (host) =>
        host.id !== u.id &&
        host.attachments.some((a) => a.code === P.fellowship && enabled(a)),
    )
  )
    prepend(s, fx("rdpFellowshipDiscard", { source: u.id, text: name(u) }));
}
/** The Pipe attachments in the deck, one entry for each different card. */
function deckPipes(s: GameState) {
  const seen = new Set<string>();
  return s.deck.flatMap((code, index) => {
    if (
      seen.has(code) ||
      card(code).type_code !== "attachment" ||
      !(card(code).traits ?? "").split(".").some((t) => t.trim() === "Pipe")
    )
      return [];
    seen.add(code);
    return [{ code, index }];
  });
}

export function roadDarkensPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("rdp")) return false;
  const p = e.player ?? activeSeat(s);
  const source = get(s, e.source);
  const target = get(s, e.target);
  switch (e.kind) {
    case "rdpBoromirOffer":
      if (
        !source ||
        source.code !== P.boromir ||
        !live(source) ||
        !source.exhausted ||
        cannotReady(source, s)
      )
        return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Boromir · Ready him after he takes damage",
        [
          use("Ready Boromir", [
            fx("rdpBoromirReady", { source: source.id, player: p }),
          ]),
          skip,
        ],
        undefined,
        p,
      );
      return true;
    case "rdpBoromirReady":
      if (source?.exhausted) {
        readyCharacter(s, source);
        log(s, "Boromir readies after taking damage.", "good");
      }
      return true;
    case "rdpBilboOffer":
      if (
        !source ||
        source.code !== P.bilbo ||
        !live(source) ||
        !s.deck.length ||
        fateCannotSearch(s, p)
      )
        return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Bilbo Baggins · Search your deck for a Pipe attachment",
        [
          use("Search your deck for a Pipe, then shuffle it", [
            fx("rdpBilboSearch", { source: source.id, player: p }),
          ]),
          skip,
        ],
        "Add a Pipe attachment from your deck to your hand. Shuffle your deck.",
        p,
      );
      return true;
    case "rdpBilboSearch": {
      const pipes = deckPipes(s);
      if (pipes.length > 1) {
        choose(
          s,
          "Bilbo Baggins · Choose a Pipe attachment",
          pipes.map(({ code, index }) => ({
            id: `deck-${index}`,
            code,
            label: `Add ${card(code).name} to your hand`,
            effects: [fx("rdpBilboTake", { value: index, code, player: p })],
          })),
          "Then your deck is shuffled.",
        );
        return true;
      }
      if (pipes.length)
        prepend(
          s,
          fx("rdpBilboTake", {
            value: pipes[0].index,
            code: pipes[0].code,
            player: p,
          }),
        );
      else {
        shuffle(s, s.deck);
        log(s, "Bilbo Baggins finds no Pipe attachment; the deck is shuffled.");
      }
      return true;
    }
    case "rdpBilboTake": {
      const index = e.value ?? -1;
      if (index >= 0 && index < s.deck.length && s.deck[index] === e.code) {
        s.hand.push(takePlayerDeck(s, index));
        log(
          s,
          `Bilbo Baggins adds ${card(e.code!).name} to the hand; the deck is shuffled.`,
          "good",
        );
      }
      shuffle(s, s.deck);
      return true;
    }
    case "rdpFellowshipDiscard":
      for (const host of globalCharacters(s))
        for (const a of host.attachments.filter(
          (x) => x.code === P.fellowship && enabled(x),
        )) {
          log(
            s,
            `Fellowship of the Ring is discarded because ${e.text ?? "a character"} was destroyed.`,
            "danger",
          );
          discardAttachment(s, host, a);
        }
      return true;
    case "rdpStaffDraw": {
      const drawer = e.value ?? p;
      if (!playerOrder(s).includes(drawer)) return true;
      log(
        s,
        `Gandalf's Staff: ${s.table ? seatName(s, drawer) : "the player"} draws 1 card.`,
        "good",
      );
      forOwner(s, drawer, () => draw(s, 1));
      return true;
    }
    case "rdpStaffResource":
      if (
        target &&
        isHero(target) &&
        canGainResources(s, target) &&
        !playerEffectImmune(s, target, P.staff)
      ) {
        target.resources++;
        gondorResourcesGained(s, target, 1, true);
        log(s, `Gandalf's Staff adds 1 resource to ${name(target)}.`, "good");
      }
      return true;
    case "rdpStaffShadow": {
      if (!target || card(target.code).is_unique) return true;
      const code = removePlayerShadowCard(s, target, e.value ?? -1);
      if (code) {
        s.encounterDiscard.push(code);
        log(
          s,
          `Gandalf's Staff discards a shadow card from ${name(target)}.`,
          "good",
        );
      }
      return true;
    }
    case "rdpPipeSwap": {
      const found = attachmentById(s, e.source);
      const index = s.hand.findIndex((h) => h.id === e.target);
      if (!found || index < 0 || !s.deck.length) return true;
      const top = takePlayerDeck(s, 0);
      const [chosen] = s.hand.splice(index, 1);
      putPlayerDeck(s, chosen, 0);
      s.hand.push(top);
      log(
        s,
        "Wizard Pipe exchanges a card in the hand with the top card of the deck.",
        "good",
      );
      return true;
    }
  }
  return false;
}
