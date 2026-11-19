// The Ered Mithrin campaign's boons, burdens and treasures: Turayn, A
// Growing Threat and the nine treasures (their stat bonuses, keywords and
// targets are in expansion-passives.ts).
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
  choose,
  draw,
  fx,
  get,
  log,
  pay,
  playCost,
  prepend,
  requireRule,
  shuffle,
  spendResources,
  takePlayerDeck,
} from "./core";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { discardHandCard, exhaustCharacter, takePlayerDiscard } from "./board";
import { reduceThreat } from "./threat-reduction";
import { canPlay, playTargets, resolvePaidPlayerCard } from "./actions";
import { effectiveTraits } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import {
  ERED,
  eredCampaignFrameworkEffect,
  eredState,
  growingThreatTarget,
} from "./ered-campaign";

const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const seatLabel = (s: GameState, p: number) =>
  several(s) ? ` · ${seatName(s, p)}` : "";
const decline = (label = "Do not use it"): Option => ({
  id: "decline",
  label,
  effects: [],
});
const traitsOf = (code: string) =>
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const isItemAttachment = (code: string) =>
  card(code).type_code === "attachment" && traitsOf(code).includes("Item");
/** The attachment and its host, wherever it is in play. */
function findAttachment(s: GameState, id?: string) {
  for (const host of allCharacters(s)) {
    const a = host.attachments.find((x) => x.id === id);
    if (a) return { host, a };
  }
  return undefined;
}
/** The engaged enemies of a player. */
const engagedWith = (s: GameState, p: number) => seatView(s, p).engaged;

// ------------------------------------------------------------- A Growing Threat

/**
 * A Growing Threat: "Surge. When Revealed: Set aside the topmost non-unique,
 * non-objective, non-burden encounter card in the encounter discard pile.
 * During quest resolution, add a copy of that card to the campaign pool, if
 * able. Remove A Growing Threat from the game." (Surge is a printed keyword.)
 */
export function eredCampaignEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (code !== ERED.growing) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  const q = eredState(s);
  const i = growingThreatTarget(s);
  if (i >= 0) {
    const [aside] = s.encounterDiscard.splice(i, 1);
    q.growing = [...(q.growing ?? []), aside];
    log(
      s,
      `A Growing Threat sets aside ${card(aside).name} from the encounter discard pile: a copy joins the Campaign Pool if this chapter is won.`,
      "danger",
    );
  } else
    log(
      s,
      "A Growing Threat: the encounter discard pile has no non-unique, non-objective, non-burden card to set aside.",
    );
  log(s, "A Growing Threat is removed from the game.");
  return true;
}

// ------------------------------------------------------------- Turayn

/**
 * Turayn: "Response: After Turayn exhausts, choose another character. The
 * next time that character would be dealt damage this round, cancel 1 of that
 * damage."
 */
export function eredCampaignCharacterExhausted(s: GameState, u: Unit) {
  if (u.code !== ERED.turayn || u.blanked || !s.campaign) return;
  if (!allCharacters(s).some((x) => x.id !== u.id)) return;
  prepend(s, fx("emcTurayn", { source: u.id, player: ownerOf(s, u) }));
}
/** Turayn's lasting effect: cancel 1 of the next damage this round (not a cost's). */
export function eredCampaignDamageAmount(
  s: GameState,
  u: Unit,
  value: number,
  context: { cost?: boolean } = {},
) {
  const q = s.eredCampaign;
  if (!q?.shields?.length || value <= 0 || context.cost) return value;
  q.shields = q.shields.filter((x) => x.round === s.round);
  const mine = q.shields.filter((x) => x.target === u.id);
  if (!mine.length) return value;
  q.shields = q.shields.filter((x) => x.target !== u.id);
  const n = Math.min(value, mine.length);
  log(s, `Turayn: ${n} of the damage dealt to ${name(u)} is canceled.`, "good");
  return value - n;
}

// ------------------------------------------------------------- treasures

/** "After you play" Responses: Anvil of Gundabad, Axe of the Edain, Glittering Lute. */
export function eredCampaignAttachmentPlayed(
  s: GameState,
  host: Unit,
  a: Attachment,
) {
  const p = attachmentController(s, host, a) ?? activeSeat(s);
  if (a.code === ERED.anvil)
    prepend(s, fx("emcAnvilSearch", { source: a.id, player: p }));
  else if (a.code === ERED.axe) {
    if (
      engagedWith(s, p).some(
        (e) => !card(e.code).is_unique && !playerCardImmune(e),
      )
    )
      prepend(s, fx("emcAxe", { source: a.id, player: p }));
  } else if (a.code === ERED.lute)
    prepend(s, fx("emcLute", { source: a.id, player: p }));
}
/**
 * Helm of Heroes: "Response: After attached character takes 1 or more damage
 * from an enemy's attack, add 1 resource to any hero's resource pool."
 */
export function eredCampaignDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: { enemyId?: string; combatDamage?: boolean } = {},
) {
  if (value <= 0 || !context.enemyId || !context.combatDamage) return;
  for (const a of u.attachments)
    if (a.code === ERED.helm && !a.blanked)
      prepend(
        s,
        fx("emcHelm", {
          source: a.id,
          target: u.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
}
/**
 * Masterwork Bow: "Response: After attached character attacks and defeats an
 * enemy, place 1 progress on a location in the staging area."
 */
export function eredCampaignAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  for (const id of ids) {
    const u = get(s, id);
    if (!u) continue;
    for (const a of u.attachments)
      if (
        a.code === ERED.bow &&
        !a.blanked &&
        s.staging.some((l) => card(l.code).type_code === "location")
      )
        prepend(
          s,
          fx("emcBow", {
            source: a.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          }),
        );
  }
}
/**
 * Gondolin Shield: "Response: Exhaust Gondolin Shield and spend 1 resource to
 * cancel a shadow effect just triggered during an attack that attached
 * character is defending. Then, deal the attacking enemy another shadow card."
 */
export function eredCampaignShadowOptions(
  s: GameState,
  code: string,
  hasShadow: boolean,
): Option[] {
  if (!hasShadow || !s.combat) return [];
  const defenders =
    s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : []);
  return defenders.flatMap((id) => {
    const host = get(s, id);
    if (!host) return [];
    return host.attachments
      .filter((a) => a.code === ERED.shield && !a.exhausted && !a.blanked)
      .flatMap((a) => {
        const p = attachmentController(s, host, a) ?? ownerOf(s, host);
        const payers = seatView(s, p).heroes.filter((h) => h.resources > 0);
        return payers.map((h) => ({
          id: `ered-shield-${a.id}-${h.id}`,
          label: `Exhaust Gondolin Shield · ${name(host)} · spend 1 resource from ${name(h)}${seatLabel(s, p)}`,
          code: ERED.shield,
          effects: [
            fx("emcShieldCost", {
              source: a.id,
              target: h.id,
              player: p,
            }),
            fx("emcShieldDeal", {
              target: s.combat!.enemyId,
              code,
              player: p,
            }),
          ],
        }));
      });
  });
}
/** Durin's Dagger: "You may play Durin's Dagger from your discard pile." */
export function eredDaggerDiscardProblem(
  s: GameState,
  index: number,
  target?: string,
): string | null {
  if (s.discard[index] !== ERED.dagger)
    return "Choose Durin's Dagger in your own discard pile.";
  const preview = daggerPreview(s, index);
  const problem = canPlay(s, preview, { playOrigin: "discard" });
  if (problem) return problem;
  if (
    target !== undefined &&
    !playTargets(s, preview).some((x) => x.id === target)
  )
    return "Choose a legal target.";
  return null;
}
const daggerPreview = (s: GameState, index: number): Unit =>
  ({
    id: `discard-play:${index}`,
    code: ERED.dagger,
    owner: activeSeat(s),
    exhausted: false,
    damage: 0,
    progress: 0,
    resources: 0,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  }) as Unit;
/** Play Durin's Dagger from the discard pile (the PLAY_DISCARD action). */
export function eredPlayDaggerFromDiscard(
  s: GameState,
  index: number,
  target: string | undefined,
  payment?: Record<string, number>,
) {
  if (s.discard[index] !== ERED.dagger) return false;
  const problem = eredDaggerDiscardProblem(s, index, target);
  requireRule(!problem, problem ?? "");
  requireRule(target, "Choose a character for Durin's Dagger.");
  const host = get(s, target)!;
  const c: Card = {
    ...card(ERED.dagger),
    playOrigin: "discard" as const,
    playOwner: activeSeat(s),
  };
  const cost = playCost(s, c, host);
  pay(s, c, payment, host);
  const physical = takePlayerDiscard(s, index);
  physical.owner = activeSeat(s);
  resolvePaidPlayerCard(s, physical, target, cost, true, false);
  return true;
}
/** Anvil of Gundabad's one-shot discount for the Item attachment it plays. */
export function eredCampaignCostReduction(s: GameState, c: Card) {
  return s.eredCampaign?.anvil === c.code && isItemAttachment(c.code) ? 1 : 0;
}

// ------------------------------------------------------------- abilities

const ABILITY: Record<string, string> = {
  [ERED.anvil]: "Exhaust Anvil of Gundabad · Play an Item attachment (−1 cost)",
  [ERED.crown]:
    "Exhaust Dwarf-Lord's Crown · Allies sharing a Trait get +1 each",
  [ERED.jewels]: "Exhaust Jewels of Wilderland · Discard a card to draw a card",
};
export const eredCampaignAbilityLabel = (code: string) => ABILITY[code];
/** The Item attachments in hand Anvil of Gundabad can play, with their targets. */
function anvilPlays(s: GameState, a: Attachment) {
  const q = eredState(s);
  const before = q.anvil;
  try {
    return s.hand
      .filter((u) => isItemAttachment(u.code))
      .flatMap((u) => {
        q.anvil = u.code;
        if (canPlay(s, u, { resolvingEffect: true })) return [];
        const targets = playTargets(s, u).filter((t) => t.id !== a.id);
        return targets.length ? [{ u, targets }] : [];
      });
  } finally {
    if (before === undefined) delete q.anvil;
    else q.anvil = before;
  }
}
export function eredCampaignAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !ABILITY[a.code]) return null;
  if (a.blanked) return "This attachment's text is blank.";
  if (attachmentController(s, u, a) !== activeSeat(s))
    return "Choose an attachment you control.";
  if (s.phase === "setup") return "Continue to the next action window.";
  if (s.choice || s.flow?.pending) return "Resolve the current choice first.";
  if (a.exhausted) return `${card(a.code).name} is exhausted.`;
  if (a.code === ERED.anvil) {
    if (u.exhausted) return "The attached character is exhausted.";
    if (!anvilPlays(s, a).length)
      return "No Item attachment in your hand can be played and paid for.";
  }
  if (a.code === ERED.crown) {
    const traits = effectiveTraits(u);
    if (
      !allCharacters(s).some(
        (x) =>
          card(x.code).type_code === "ally" &&
          effectiveTraits(x).some((t) => traits.includes(t)),
      )
    )
      return "No ally shares a Trait with the attached hero.";
  }
  if (a.code === ERED.jewels && !s.hand.length)
    return "Discard a card from your hand to use Jewels of Wilderland.";
  return null;
}
/** Use a treasure's Action (true when this module handled it). */
export function eredCampaignAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !ABILITY[a.code]) return false;
  const problem = eredCampaignAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  if (a.code === ERED.anvil) {
    // Cost: exhaust Anvil of Gundabad and the attached character.
    a.exhausted = true;
    exhaustCharacter(s, u);
    prepend(s, fx("emcAnvilPick", { source: a.id, player: p }));
    return true;
  }
  if (a.code === ERED.crown) {
    a.exhausted = true;
    const traits = effectiveTraits(u);
    const allies = allCharacters(s).filter(
      (x) =>
        card(x.code).type_code === "ally" &&
        !playerCardImmune(x) &&
        effectiveTraits(x).some((t) => traits.includes(t)),
    );
    for (const x of allies) {
      x.tempWill = (x.tempWill ?? 0) + 1;
      x.tempAttack = (x.tempAttack ?? 0) + 1;
      x.tempDefense = (x.tempDefense ?? 0) + 1;
    }
    log(
      s,
      `Dwarf-Lord's Crown: ${allies.map(name).join(", ")} ${allies.length === 1 ? "gets" : "get"} +1 willpower, +1 attack and +1 defense until the end of the phase.`,
      "good",
    );
    return true;
  }
  // Jewels of Wilderland: discard a card from your hand (a cost) to draw a card.
  choose(
    s,
    `Jewels of Wilderland · Discard a card from your hand${seatLabel(s, p)}`,
    s.hand.map((h) => ({
      id: h.id,
      code: h.code,
      label: name(h),
      effects: [fx("emcJewels", { source: a.id, target: h.id, player: p })],
    })),
    card(ERED.jewels).text,
  );
  return true;
}

// ------------------------------------------------------------- effects

/** The campaign's effects: its framework and its cards. */
export function eredCampaignEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("emc")) return false;
  if (eredCampaignFrameworkEffect(s, e)) return true;
  const p = e.player ?? firstPlayer(s);
  const q = eredState(s);
  switch (e.kind) {
    case "emcTurayn": {
      const turayn = get(s, e.source);
      if (!turayn) return true;
      const others = allCharacters(s).filter((x) => x.id !== turayn.id);
      choose(
        s,
        `Turayn exhausted · Choose another character: the next time it would be dealt damage this round, cancel 1 of that damage${seatLabel(s, p)}`,
        [
          ...others.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)}${several(s) ? ` · ${seatName(s, ownerOf(s, x))}` : ""}`,
            effects: [fx("emcTuraynShield", { target: x.id, player: p })],
          })),
          decline("Do not use Turayn's Response"),
        ],
        card(ERED.turayn).text,
      );
      return true;
    }
    case "emcTuraynShield": {
      const x = get(s, e.target);
      if (!x) return true;
      q.shields = [
        ...(q.shields ?? []).filter((y) => y.round === s.round),
        { target: x.id, round: s.round },
      ];
      log(
        s,
        `Turayn: the next time ${name(x)} would be dealt damage this round, 1 of that damage is canceled.`,
        "good",
      );
      return true;
    }
    case "emcAnvilSearch": {
      // "Search the top 5 cards of your deck for any number of Item
      // attachments and add them to your hand. Shuffle your deck."
      const found = findAttachment(s, e.source);
      if (!found) return true;
      forOwner(s, p, () => {
        if (!s.deck.length) return;
        choose(
          s,
          `Anvil of Gundabad · Search the top 5 cards of your deck for Item attachments${seatLabel(s, p)}`,
          [
            {
              id: "search",
              code: ERED.anvil,
              label: "Search the top 5 cards",
              effects: [fx("emcAnvilTake", { player: p, count: 5 })],
            },
            decline("Do not use Anvil of Gundabad's Response"),
          ],
          card(ERED.anvil).text,
        );
      });
      return true;
    }
    case "emcAnvilTake": {
      // One Item attachment at a time from the top cards searched; the rest
      // stay in the deck, which is shuffled when the search ends.
      forOwner(s, p, () => {
        const top = Math.min(e.count ?? 5, s.deck.length);
        const items = s.deck
          .slice(0, top)
          .map((code, index) => ({ code, index }))
          .filter((x) => isItemAttachment(x.code));
        choose(
          s,
          `Anvil of Gundabad · Add any number of Item attachments to your hand${seatLabel(s, p)}`,
          [
            ...items.map((x) => ({
              id: `item-${x.index}`,
              code: x.code,
              label: card(x.code).name,
              effects: [
                fx("emcAnvilAdd", { value: x.index, player: p, count: top }),
              ],
            })),
            {
              id: "done",
              label: items.length
                ? "Done · shuffle your deck"
                : "No Item attachment · shuffle your deck",
              effects: [fx("emcAnvilShuffle", { player: p })],
            },
          ],
          `Top ${top}: ${s.deck
            .slice(0, top)
            .map((code) => card(code).name)
            .join(", ")}.`,
        );
      });
      return true;
    }
    case "emcAnvilAdd":
      forOwner(s, p, () => {
        const index = e.value ?? -1;
        if (index < 0 || index >= s.deck.length) return;
        const u = takePlayerDeck(s, index);
        s.hand.push(u);
        log(s, `Anvil of Gundabad: ${name(u)} is added to the hand.`, "good");
        prepend(
          s,
          fx("emcAnvilTake", {
            player: p,
            count: Math.max(0, (e.count ?? 5) - 1),
          }),
        );
      });
      return true;
    case "emcAnvilShuffle":
      forOwner(s, p, () => {
        shuffle(s, s.deck);
        log(s, "Anvil of Gundabad: the deck is shuffled.");
      });
      return true;
    case "emcAnvilPick": {
      const found = findAttachment(s, e.source);
      if (!found) return true;
      const plays = anvilPlays(s, found.a);
      if (!plays.length) {
        log(s, "Anvil of Gundabad: no Item attachment can be played.");
        return true;
      }
      choose(
        s,
        `Anvil of Gundabad · Play an Item attachment from your hand, reducing its cost by 1${seatLabel(s, p)}`,
        plays.map(({ u }) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("emcAnvilHost", { source: e.source, target: u.id, player: p }),
          ],
        })),
        card(ERED.anvil).text,
      );
      return true;
    }
    case "emcAnvilHost": {
      const found = findAttachment(s, e.source);
      const play = found
        ? anvilPlays(s, found.a).find(({ u }) => u.id === e.target)
        : undefined;
      if (!play) return true;
      choose(
        s,
        `${name(play.u)} · Choose where to attach it${seatLabel(s, p)}`,
        play.targets.map((t) => ({
          id: t.id,
          code: t.code,
          label: name(t),
          effects: [
            fx("emcAnvilPlay", {
              source: e.source,
              ids: [play.u.id],
              target: t.id,
              player: p,
            }),
          ],
        })),
        card(play.u.code).text,
      );
      return true;
    }
    case "emcAnvilPlay": {
      const u = s.hand.find((x) => x.id === e.ids?.[0]);
      const host = get(s, e.target);
      if (!u || !host) return true;
      const c: Card = { ...card(u.code), playOwner: u.owner ?? activeSeat(s) };
      q.anvil = u.code;
      try {
        const cost = playCost(s, c, host);
        pay(s, c, undefined, host);
        s.hand = s.hand.filter((x) => x.id !== u.id);
        log(
          s,
          `Anvil of Gundabad: ${name(u)} is played on ${name(host)}, its cost reduced by 1.`,
          "good",
        );
        resolvePaidPlayerCard(s, u, host.id, cost, true, true);
      } finally {
        delete q.anvil;
      }
      return true;
    }
    case "emcAxe": {
      const targets = engagedWith(s, p).filter(
        (x) => !card(x.code).is_unique && !playerCardImmune(x),
      );
      if (!targets.length) return true;
      choose(
        s,
        `Axe of the Edain · Deal 2 damage to a non-unique enemy engaged with you${seatLabel(s, p)}`,
        [
          ...targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("damage", { target: x.id, value: 2, player: p })],
          })),
          decline("Do not use Axe of the Edain's Response"),
        ],
        card(ERED.axe).text,
      );
      return true;
    }
    case "emcLute":
      // "Each player may discard a card from their hand. Each player who
      // does so reduces their threat by 2."
      choose(
        s,
        `Glittering Lute · Each player may discard a card to reduce their threat by 2${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: ERED.lute,
            label: "Use Glittering Lute's Response",
            effects: playerOrder(s).map((player) =>
              fx("emcLuteDiscard", { player }),
            ),
          },
          decline("Do not use Glittering Lute's Response"),
        ],
        card(ERED.lute).text,
      );
      return true;
    case "emcLuteDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        choose(
          s,
          `Glittering Lute · Discard a card from your hand to reduce your threat by 2?${seatLabel(s, p)}`,
          [
            ...s.hand.map((h) => ({
              id: h.id,
              code: h.code,
              label: name(h),
              effects: [fx("emcLuteThreat", { target: h.id, player: p })],
            })),
            decline("Keep your hand"),
          ],
          card(ERED.lute).text,
        );
      });
      return true;
    case "emcLuteThreat":
      forOwner(s, p, () => {
        if (!s.hand.some((h) => h.id === e.target)) return;
        discardHandCard(s, e.target!);
        reduceThreat(s, 2, ERED.lute);
        log(
          s,
          `Glittering Lute: ${several(s) ? `${seatName(s, p)} reduces their` : "you reduce your"} threat by 2.`,
          "good",
        );
      });
      return true;
    case "emcHelm": {
      const heroes = allHeroes(s);
      if (!heroes.length) return true;
      choose(
        s,
        `Helm of Heroes · Add 1 resource to any hero's resource pool${seatLabel(s, p)}`,
        [
          ...heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${several(s) ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
            effects: [fx("emcHelmResource", { target: h.id, player: p })],
          })),
          decline("Do not use Helm of Heroes' Response"),
        ],
        card(ERED.helm).text,
      );
      return true;
    }
    case "emcHelmResource": {
      const h = get(s, e.target);
      if (!h) return true;
      h.resources++;
      log(s, `Helm of Heroes: ${name(h)} gains 1 resource.`, "good");
      return true;
    }
    case "emcBow": {
      const locations = s.staging.filter(
        (l) => card(l.code).type_code === "location" && !playerCardImmune(l),
      );
      if (!locations.length) return true;
      choose(
        s,
        `Masterwork Bow · Place 1 progress on a location in the staging area${seatLabel(s, p)}`,
        [
          ...locations.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("locationProgress", { target: l.id, value: 1, player: p }),
            ],
          })),
          decline("Do not use Masterwork Bow's Response"),
        ],
        card(ERED.bow).text,
      );
      return true;
    }
    case "emcShieldCost": {
      const found = findAttachment(s, e.source);
      const h = get(s, e.target);
      if (found) found.a.exhausted = true;
      if (h && h.resources > 0) spendResources(s, h, 1);
      log(
        s,
        "Gondolin Shield cancels the shadow effect and the attacking enemy is dealt another shadow card.",
        "good",
      );
      return true;
    }
    case "emcShieldDeal":
      if (get(s, e.target))
        prepend(s, fx("khazadExtraShadows", { target: e.target, count: 1 }));
      return true;
    case "emcJewels": {
      const found = findAttachment(s, e.source);
      if (!found) return true;
      found.a.exhausted = true;
      forOwner(s, p, () => {
        if (!s.hand.some((h) => h.id === e.target)) return;
        discardHandCard(s, e.target!);
        draw(s, 1);
        log(
          s,
          "Jewels of Wilderland: a card is discarded and 1 is drawn.",
          "good",
        );
      });
      return true;
    }
  }
  return false;
}
