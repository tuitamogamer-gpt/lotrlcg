// The Dream-chaser campaign's boons and burdens in play: the Modification
// boons, the two new ships, Ominous Fate, Thunderstruck, Crowley, and the
// Hard and Expert Mode card.
import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  removePlayerShadowCard,
  removeShadowCard,
  RuleError,
  shuffle,
} from "./core";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  globalLivingSeats,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import {
  addVictoryCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  raiseThreat,
} from "./board";
import { returnToStaging } from "./fellowship-event-lib";
import { isShipObjective } from "./ships";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isPlayerCardSource } from "./player-effect-immunity";
import { playerCardImmune } from "./card-immunity";
import {
  DC,
  backFace,
  dcBackFace,
  dcBase,
  dcIs,
  fleetShip,
  isDreamchaserGame,
  isUncharted,
} from "./dreamchaser-campaign-support";
import { dreamchaserOminousX, dreamchaserState } from "./dreamchaser-campaign";

const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) =>
    ["enemy", "ship-enemy"].includes(card(u.code).type_code),
  );
const attached = (u: Unit, code: string) =>
  u.attachments.filter((a) => dcBase(a.code) === code && !a.blanked);
const players = (s: GameState) => globalLivingSeats(s).length;

// ------------------------------------------------------------- burdens

/** Ominous Fate "cannot be canceled". */
export const dreamchaserCannotCancel = (s: GameState, code: string) =>
  isDreamchaserGame(s) && code === DC.ominous;

/**
 * Ominous Fate: "When Revealed: Each player must either reveal an encounter
 * card, raise their threat by X, or deal X damage divided among characters
 * they control. X is the campaign card's part number. The players may add
 * Ominous Fate to the victory display."
 */
export function dreamchaserCampaignEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!isDreamchaserGame(s) || code !== DC.ominous) return false;
  if (!replay) s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("dcOminous", { player })),
    fx("dcOminousVictory", { player: firstPlayer(s) }),
  );
  return true;
}

/** Shadow effects: Ominous Fate's reveal and Thunderstruck's choice. */
export function dreamchaserCampaignShadow(s: GameState, code: string) {
  if (!isDreamchaserGame(s)) return false;
  if (code === DC.ominous) {
    // "Shadow: Reveal an encounter card."
    prepend(s, fx("reveal", { player: firstPlayer(s) }));
    return true;
  }
  if (code === DC.thunderstruck) {
    // "Shadow: Either add Thunderstruck to the staging area or deal 2 damage
    // to the defending character."
    const c = s.combat;
    const p = c?.attackPlayer ?? activeSeat(s);
    const defender = get(s, c?.defenderId ?? undefined);
    forOwner(s, p, () =>
      choose(
        s,
        "Thunderstruck · Shadow",
        [
          {
            id: "staging",
            label: "Add Thunderstruck to the staging area",
            effects: [
              fx("dcThunderStaging", { source: c?.enemyId, player: p }),
            ],
          },
          ...(defender
            ? [
                {
                  id: "damage",
                  label: `Deal 2 damage to ${name(defender)}`,
                  effects: [
                    fx("damage", { target: defender.id, value: 2, player: p }),
                  ],
                },
              ]
            : []),
        ],
        card(code).text,
      ),
    );
    return true;
  }
  return false;
}

/** Archery: Thunderstruck's "Archery 1". */
export const dreamchaserArchery = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) && dcIs(u, DC.thunderstruck) && !u.blanked ? 1 : 0;

/** Stat changes of the campaign's enemies, boons and burdens. */
export function dreamchaserStats(s: GameState, u: Unit) {
  const out = { will: 0, attack: 0, defense: 0, health: 0 };
  if (!isDreamchaserGame(s)) return out;
  // Thunderstruck "gets +2 hit points per player".
  if (dcIs(u, DC.thunderstruck) && !u.blanked) out.health += 2 * players(s);
  // Crowley: "For each resource on Crowley, he gets +1 [threat], +1 [attack],
  // +1 [defense], and +1 hit points."
  if (dcIs(u, DC.crowley) && !u.blanked) {
    out.attack += u.resources;
    out.defense += u.resources;
    out.health += u.resources;
  }
  // Revenant "gets +2 [attack] and +2 [defense] for each resource on the
  // campaign card".
  if (dcIs(u, DC.revenant) && !u.blanked) {
    const n = s.dreamchaser?.resources ?? 0;
    out.attack += 2 * n;
    out.defense += 2 * n;
  }
  // The Modification boons on a Ship.
  for (const a of u.attachments) {
    if (a.blanked || !isShipObjective(u)) continue;
    const code = dcBase(a.code);
    if (code === DC.armor) out.defense += 1;
    if (code === DC.ballista) out.attack += 1;
    if (code === DC.quarters) out.health += 3;
    if (code === DC.sails) out.will += 1;
  }
  return out;
}
/** Crowley's threat: +1 for each resource on him. */
export const dreamchaserThreatBonus = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) && dcIs(u, DC.crowley) && !u.blanked ? u.resources : 0;

/**
 * Thunderstruck "cannot take more than 4 damage each round"; Revenant:
 * "Forced: When 3 or more damage would be placed on Revenant, place 2 damage
 * instead."
 */
export function dreamchaserDamageAmount(s: GameState, u: Unit, value: number) {
  if (!isDreamchaserGame(s) || u.blanked) return value;
  if (dcIs(u, DC.revenant)) return value >= 3 ? 2 : value;
  if (!dcIs(u, DC.thunderstruck)) return value;
  const q = dreamchaserState(s);
  const taken = q.damage?.round === s.round ? (q.damage.byId[u.id] ?? 0) : 0;
  return Math.min(value, Math.max(0, 4 - taken));
}
export function dreamchaserDamageDealt(s: GameState, u: Unit, value: number) {
  if (!isDreamchaserGame(s) || !dcIs(u, DC.thunderstruck) || value <= 0) return;
  const q = dreamchaserState(s);
  if (q.damage?.round !== s.round) q.damage = { round: s.round, byId: {} };
  q.damage.byId[u.id] = (q.damage.byId[u.id] ?? 0) + value;
}

/** Crowley: "Forced: When Crowley engages you, place 1 resource on him." */
export function dreamchaserEnemyEngaged(s: GameState, u: Unit) {
  if (!isDreamchaserGame(s) || !dcIs(u, DC.crowley) || u.blanked) return;
  u.resources += 1;
  log(s, `Crowley engages and gains a resource (${u.resources}).`, "danger");
}
/** Crowley: "At the end of the combat phase, return him to the staging area." */
export function dreamchaserCombatEnd(s: GameState): Effect[] {
  if (!isDreamchaserGame(s)) return [];
  return allEngaged(s)
    .filter((u) => dcIs(u, DC.crowley) && !u.blanked)
    .map((u) => fx("dcCrowleyReturn", { target: u.id }));
}
/**
 * The campaign's enemies leaving play. Crowley "gains victory 3" with 3 or
 * more resources; otherwise he returns to the Corsair discard pile.
 */
export function dreamchaserEnemyDestination(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (!isDreamchaserGame(s)) return false;
  if (dcIs(u, DC.crowley) && destruction && u.resources >= 3 && !u.blanked) {
    addVictoryCard(s, u.code);
    s.victory += 3;
    log(s, "Crowley goes to the victory display (victory 3).", "good");
    return true;
  }
  // Revenant: "Forced: After Revenant is destroyed, shuffle it into the
  // encounter deck. Place 1 resource on the campaign card."
  if (dcIs(u, DC.revenant) && destruction && !u.blanked) {
    s.encounterDeck.push(u.code);
    shuffle(s, s.encounterDeck);
    const q = dreamchaserState(s);
    q.resources = (q.resources ?? 0) + 1;
    log(
      s,
      `Revenant is shuffled back into the encounter deck; the campaign card has ${q.resources} resource${q.resources === 1 ? "" : "s"}.`,
      "danger",
    );
    return true;
  }
  return false;
}

// ---------------------------------------------------------- the fleet

/** Hits the Sailing test counts for a committed character. */
export function dreamchaserSailingWeight(u: Unit) {
  let weight = 1;
  if (
    card(u.code).name === "Dream-chaser" &&
    card(u.code).type_code === "ship-objective"
  )
    // "counts as 2 characters" (3 on its Upgraded side).
    weight = dcBackFace(u) ? 3 : 2;
  // Enlarged Quarters (Upgraded): "It counts as 1 additional character."
  for (const a of attached(u, DC.quarters)) if (dcBackFace(a)) weight += 1;
  return weight;
}
/** Enlarged Quarters: attached Ship "can be committed to any Sailing test". */
export const dreamchaserAnySailing = (u: Unit) =>
  attached(u, DC.quarters).length > 0;

/**
 * Duskbringer: "Response: After you play a card with an odd printed cost,
 * add 1 resource to a hero's resource pool. (Limit once per round.)" Twice
 * per round on its Upgraded side.
 */
export function dreamchaserCardPlayed(s: GameState, c: Card) {
  if (!isDreamchaserGame(s)) return;
  const cost = Number(c.cost);
  if (!Number.isInteger(cost) || cost % 2 === 0) return;
  const p = activeSeat(s);
  const dusk = seatView(s, p).allies.find(
    (u) => fleetShip(u.code) === "dusk" && !u.blanked,
  );
  if (!dusk) return;
  const key = `dc-dusk:${s.round}`;
  const used = s.used.filter((k) => k === key).length;
  if (used >= (dcBackFace(dusk) ? 2 : 1)) return;
  prepend(s, fx("dcDusk", { source: dusk.id, player: p }));
}

/** Glórinaith's Action (and its once-per-round limit). */
export const dreamchaserAbilityLabel = (code: string) =>
  dcBase(code) === DC.glorinaith
    ? dcBackFace(code)
      ? "Glórinaith · Name a card, then discard the top 3 cards of any deck to deal 1 damage to a non-unique enemy (2 if the named card is discarded; once per round)"
      : "Glórinaith · Discard the top 2 cards of any deck to deal 1 damage to an engaged non-unique enemy (once per round)"
    : undefined;
const glorinaithTargets = (s: GameState, u: Unit) =>
  (dcBackFace(u) ? enemiesInPlay(s) : allEngaged(s)).filter(
    (e) => !card(e.code).is_unique && !isImmune(e),
  );
const isImmune = (e: Unit) =>
  /Immune to player card effects/.test(card(e.code).text ?? "") && !e.blanked;
export function dreamchaserAbilityProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (!isDreamchaserGame(s) || !dreamchaserAbilityLabel(u.code))
    return "No campaign ability.";
  if (u.blanked) return `${name(u)}'s text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s))
    return `${name(u)} belongs to another player.`;
  if (s.used.includes(`dc-glorinaith:${s.round}:${u.id}`))
    return `${name(u)}'s Action was used this round.`;
  if (!glorinaithTargets(s, u).length)
    return dcBackFace(u)
      ? "No non-unique enemy can take the damage."
      : "No engaged non-unique enemy can take the damage.";
  return null;
}
export function dreamchaserAbility(s: GameState, u: Unit): boolean {
  if (!isDreamchaserGame(s) || !dreamchaserAbilityLabel(u.code)) return false;
  const problem = dreamchaserAbilityProblem(s, u);
  if (problem) throw new RuleError(problem);
  s.used.push(`dc-glorinaith:${s.round}:${u.id}`);
  prepend(s, fx("dcGlorinaithDeck", { source: u.id, player: activeSeat(s) }));
  return true;
}
/** The decks Glórinaith can discard from. */
function decksFor(s: GameState): Option[] {
  return [
    ...(s.encounterDeck.length
      ? [
          {
            id: "encounter",
            label: `The encounter deck (${s.encounterDeck.length})`,
            effects: [],
          },
        ]
      : []),
    ...seatIndices(s)
      .filter((p) => seatView(s, p).deck.length)
      .map((p) => ({
        id: `seat:${p}`,
        label: `${several(s) ? `${seatName(s, p)}'s` : "Your"} deck (${seatView(s, p).deck.length})`,
        effects: [],
      })),
  ];
}

// --------------------------------------------- Hard and Expert Mode card

/**
 * Hard Mode: "Each player's threat cannot be reduced by more than 1 each
 * round." Expert Mode: "Each player's threat cannot be reduced."
 */
export function dreamchaserThreatReductionLimit(s: GameState, amount: number) {
  const mode = isDreamchaserGame(s) ? s.dreamchaser?.mode : undefined;
  if (!mode || amount <= 0) return amount;
  if (mode === "expert") return 0;
  const key = `${s.round}:${activeSeat(s)}`;
  const reduced = s.dreamchaser?.reduced?.[key] ?? 0;
  return Math.min(amount, Math.max(0, 1 - reduced));
}
export function dreamchaserThreatReduced(s: GameState, amount: number) {
  if (!isDreamchaserGame(s) || s.dreamchaser?.mode !== "hard" || amount <= 0)
    return;
  const q = dreamchaserState(s);
  const key = `${s.round}:${activeSeat(s)}`;
  q.reduced = Object.fromEntries(
    Object.entries(q.reduced ?? {}).filter(([k]) =>
      k.startsWith(`${s.round}:`),
    ),
  );
  q.reduced[key] = (q.reduced[key] ?? 0) + amount;
}
/** "Forced: After a player draws any number of cards, that player raises their threat by that number." */
export function dreamchaserCardsDrawn(s: GameState, n: number) {
  if (!isDreamchaserGame(s) || !s.dreamchaser?.mode || n <= 0) return;
  if (s.phase === "setup") return;
  raiseThreat(s, n, "encounter");
  log(
    s,
    `${s.dreamchaser.mode === "hard" ? "Hard Mode" : "Expert Mode"}: drawing ${n} card${n === 1 ? "" : "s"} raises ${several(s) ? `${seatName(s, activeSeat(s))}'s` : "your"} threat by ${n}.`,
    "danger",
  );
}
/** Expert Mode: "After a character is healed or readied by a player card effect, its controller raises their threat by 1." */
export function dreamchaserPlayerCardHealedOrReadied(
  s: GameState,
  u: Unit,
  sourceCode?: string,
) {
  if (!isDreamchaserGame(s) || s.dreamchaser?.mode !== "expert") return;
  const code = sourceCode ?? activePlayerAbilityCode(s);
  if (!code || !isPlayerCardSource(code)) return;
  forOwner(s, ownerOf(s, u), () => raiseThreat(s, 1, "encounter"));
  log(
    s,
    `Expert Mode: ${name(u)} is healed or readied by a player card effect (+1 threat).`,
    "danger",
  );
}

// --------------------------------------------------------------- effects

// ------------------------------------------------------------- Spyglass

/** The facedown shadow cards dealt to enemies. */
const facedownShadows = (s: GameState) =>
  allEngaged(s).flatMap((enemy) =>
    enemy.shadows.flatMap((code, index) =>
      enemy.faceupShadows?.[index] ||
      (!enemy.faceupShadows && index < (enemy.revealedShadowCount ?? 0))
        ? []
        : [{ enemy, code, index }],
    ),
  );
/** The locations in play a player card effect can place progress on. */
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !playerCardImmune(u),
  );
/** The attachment with this id, wherever it is attached. */
const attachmentById = (s: GameState, id?: string) =>
  [...allCharacters(s), ...s.staging, ...allActiveLocations(s)]
    .flatMap((u) => u.attachments)
    .find((a) => a.id === id);
/** The campaign boons' attachment Actions: Spyglass. */
export const dreamchaserAttachmentLabel = (code: string) =>
  dcIs(code, DC.spyglass)
    ? `Spyglass · Exhaust: look at a shadow card or a deck, or place progress${dcBackFace(code) ? " (Upgraded)" : ""}`
    : undefined;
export function dreamchaserAttachmentProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !dreamchaserAttachmentLabel(a.code))
    return "No campaign card ability.";
  if (a.blanked) return `${card(a.code).name}'s text is blank.`;
  if (attachmentController(s, u, a) !== activeSeat(s))
    return `${card(a.code).name} is controlled by another player.`;
  if (a.exhausted) return `${card(a.code).name} is exhausted.`;
  return null;
}
/**
 * Spyglass: "Action: Exhaust Spyglass to choose one: • Look at a shadow card.
 * • Look at the top and bottom card of your deck. • Place 1 progress on a
 * location (2 progress instead if it is Uncharted)." Upgraded: the shadow
 * card may be discarded, any deck may be looked at, and an Uncharted
 * location takes 4 progress.
 */
export function dreamchaserAttachmentAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !dreamchaserAttachmentLabel(a.code)) return false;
  const problem = dreamchaserAttachmentProblem(s, u, attachmentId);
  if (problem) throw new RuleError(problem);
  a.exhausted = true;
  const p = activeSeat(s);
  const upgraded = dcBackFace(a);
  const options: Option[] = [];
  if (facedownShadows(s).length)
    options.push({
      id: "shadow",
      label: upgraded
        ? "Look at a shadow card (you may discard it)"
        : "Look at a shadow card",
      effects: [fx("dcSpyShadow", { source: a.id, player: p })],
    });
  options.push({
    id: "deck",
    label: upgraded
      ? "Look at the top and bottom card of any deck"
      : "Look at the top and bottom card of your deck",
    effects: [fx("dcSpyDeck", { source: a.id, player: p })],
  });
  if (locationsInPlay(s).length)
    options.push({
      id: "progress",
      label: `Place 1 progress on a location (${upgraded ? 4 : 2} if it is Uncharted)`,
      effects: [fx("dcSpyProgress", { source: a.id, player: p })],
    });
  log(s, `${name(u)}'s Spyglass is exhausted.`);
  choose(s, "Spyglass · Choose one", options, card(a.code).text);
  return true;
}
/** Spyglass's choices after it is exhausted. */
function spyglassEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s);
  const upgraded = dcBackFace(attachmentById(s, e.source)?.code ?? "");
  switch (e.kind) {
    case "dcSpyShadow":
      choose(
        s,
        "Spyglass · Choose a facedown shadow card",
        facedownShadows(s).map(({ enemy, code, index }) => ({
          id: `${enemy.id}:${index}`,
          code: enemy.code,
          label: `${name(enemy)} · Facedown shadow ${index + 1}`,
          effects: [
            fx("dcSpyShadowLook", {
              source: e.source,
              target: enemy.id,
              code,
              count: index,
              player: p,
            }),
          ],
        })),
      );
      return true;
    case "dcSpyShadowLook": {
      const enemy = get(s, e.target);
      const still = facedownShadows(s).some(
        (x) =>
          x.enemy.id === e.target && x.index === e.count && x.code === e.code,
      );
      if (!enemy || !still) return true;
      choose(
        s,
        "Spyglass · The shadow card",
        [
          {
            id: "continue",
            code: e.code,
            label: "Continue · The shadow card stays facedown",
            effects: [],
          },
          ...(upgraded
            ? [
                {
                  id: "discard",
                  code: e.code,
                  label: `Discard ${card(e.code!).name}`,
                  effects: [
                    fx("dcSpyShadowDiscard", {
                      target: enemy.id,
                      code: e.code,
                      count: e.count,
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
        ],
        card(e.code!).shadow || "This card has no shadow effect.",
      );
      log(
        s,
        `Spyglass looks at a facedown shadow card dealt to ${name(enemy)}.`,
      );
      return true;
    }
    case "dcSpyShadowDiscard": {
      const enemy = get(s, e.target);
      if (!enemy || enemy.shadows[e.count ?? -1] !== e.code) return true;
      const code = removePlayerShadowCard(s, enemy, e.count!);
      if (code) {
        s.encounterDiscard.push(code);
        log(s, `Spyglass discards a shadow card from ${name(enemy)}.`, "good");
      }
      return true;
    }
    case "dcSpyDeck": {
      if (!upgraded) {
        prepend(s, fx("dcSpyShow", { text: `player:${p}`, player: p }));
        return true;
      }
      choose(s, "Spyglass · Choose a deck", [
        ...playerOrder(s).map((seat) => ({
          id: `player:${seat}`,
          label: seat === p ? "Your deck" : `${seatName(s, seat)}'s deck`,
          effects: [fx("dcSpyShow", { text: `player:${seat}`, player: p })],
        })),
        {
          id: "encounter",
          label: "The encounter deck",
          effects: [fx("dcSpyShow", { text: "encounter", player: p })],
        },
      ]);
      return true;
    }
    case "dcSpyShow": {
      const key = e.text ?? `player:${p}`;
      const deck =
        key === "encounter"
          ? s.encounterDeck
          : seatView(s, Number(key.slice("player:".length))).deck;
      const label =
        key === "encounter"
          ? "the encounter deck"
          : Number(key.slice(7)) === p
            ? "your deck"
            : `${seatName(s, Number(key.slice(7)))}'s deck`;
      if (!deck.length) {
        log(s, `Spyglass: ${label} is empty.`);
        return true;
      }
      const top = deck[0],
        bottom = deck.at(-1)!;
      choose(
        s,
        `Spyglass · The top and bottom card of ${label}`,
        [
          {
            id: "top",
            code: top,
            label: `Top: ${card(top).name}`,
            effects: [],
          },
          ...(deck.length > 1
            ? [
                {
                  id: "bottom",
                  code: bottom,
                  label: `Bottom: ${card(bottom).name}`,
                  effects: [],
                },
              ]
            : []),
        ],
        deck.length > 1
          ? `The top card is ${card(top).name}; the bottom card is ${card(bottom).name}.`
          : `${card(top).name} is the only card.`,
      );
      log(s, `Spyglass looks at the top and bottom card of ${label}.`);
      return true;
    }
    case "dcSpyProgress":
      choose(
        s,
        "Spyglass · Choose a location",
        locationsInPlay(s).map((l) => {
          const n = isUncharted(card(l.code).text) ? (upgraded ? 4 : 2) : 1;
          return {
            id: l.id,
            code: l.code,
            label: `Place ${n} progress on ${name(l)}`,
            effects: [fx("locationProgress", { target: l.id, value: n })],
          };
        }),
      );
      return true;
  }
  return false;
}

export function dreamchaserCardEffect(s: GameState, e: Effect): boolean {
  if (e.kind.startsWith("dcSpy")) return spyglassEffect(s, e);
  switch (e.kind) {
    case "dcOminous": {
      const p = e.player ?? firstPlayer(s);
      const x = dreamchaserOminousX(s);
      forOwner(s, p, () =>
        choose(
          s,
          `Ominous Fate · ${several(s) ? `${seatName(s, p)} chooses` : "Choose"} (X is ${x})`,
          [
            {
              id: "reveal",
              label: "Reveal an encounter card",
              effects: [fx("reveal", { player: p })],
            },
            {
              id: "threat",
              label: `Raise your threat by ${x}`,
              effects: [fx("dcThreat", { value: x, player: p })],
            },
            {
              id: "damage",
              label: `Deal ${x} damage divided among characters you control`,
              effects: [
                fx("dcDivideDamage", {
                  value: x,
                  player: p,
                  text: "Ominous Fate",
                }),
              ],
            },
          ],
          card(DC.ominous).text,
        ),
      );
      return true;
    }
    case "dcOminousVictory": {
      const i = s.encounterDiscard.lastIndexOf(DC.ominous);
      if (i < 0) return true;
      forOwner(s, e.player ?? firstPlayer(s), () =>
        choose(
          s,
          "Ominous Fate · Add it to the victory display?",
          [
            {
              id: "victory",
              label: "Add Ominous Fate to the victory display (–1 XP)",
              effects: [fx("dcOminousTake")],
            },
            {
              id: "skip",
              label: "Leave it in the encounter discard pile",
              effects: [],
            },
          ],
          "The players may add Ominous Fate to the victory display. The campaign card's resolution then gives 1 XP less.",
        ),
      );
      return true;
    }
    case "dcOminousTake": {
      const i = s.encounterDiscard.lastIndexOf(DC.ominous);
      if (i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      addVictoryCard(s, DC.ominous);
      log(s, "Ominous Fate goes to the victory display.");
      return true;
    }
    case "dcThunderStaging": {
      const enemy = get(s, e.source);
      if (!enemy) return true;
      const i = enemy.shadows.lastIndexOf(DC.thunderstruck);
      if (i < 0) return true;
      removeShadowCard(enemy, i);
      const ship = make(s, DC.thunderstruck);
      s.staging.push(ship);
      enemyAddedToStaging(s, ship);
      log(s, "Thunderstruck is added to the staging area.", "danger");
      return true;
    }
    case "dcCrowleyReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, "Crowley returns to the staging area.", "danger");
      return true;
    }
    case "dcDusk": {
      const p = e.player ?? activeSeat(s);
      const dusk = get(s, e.source);
      if (!dusk) return true;
      const heroes = seatView(s, p).heroes;
      forOwner(s, p, () =>
        choose(
          s,
          "Duskbringer · Add 1 resource to a hero's resource pool?",
          [
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Add 1 resource to ${name(h)}`,
              effects: [
                fx("used", { text: `dc-dusk:${s.round}` }),
                fx("dcAddResource", { target: h.id, player: p }),
              ],
            })),
            { id: "skip", label: "Do not use Duskbringer", effects: [] },
          ],
          card(dusk.code).text,
        ),
      );
      return true;
    }
    case "dcGlorinaithDeck": {
      const ship = get(s, e.source);
      const p = e.player ?? activeSeat(s);
      if (!ship) return true;
      const upgraded = dcBackFace(ship);
      forOwner(s, p, () =>
        choose(
          s,
          `Glórinaith · Discard the top ${upgraded ? 3 : 2} cards of which deck?`,
          decksFor(s).map((o) => ({
            ...o,
            effects: [
              fx(upgraded ? "dcGlorinaithName" : "dcGlorinaithDiscard", {
                source: ship.id,
                text: o.id,
                player: p,
              }),
            ],
          })),
          card(ship.code).text,
        ),
      );
      return true;
    }
    case "dcGlorinaithName": {
      const p = e.player ?? activeSeat(s);
      const deck = deckOf(s, e.text!);
      const names = [...new Set(deck.map((code) => card(code).name))].sort();
      forOwner(s, p, () =>
        choose(
          s,
          "Glórinaith · Name a card",
          names.map((n) => ({
            id: n,
            label: n,
            effects: [
              fx("dcGlorinaithDiscard", {
                source: e.source,
                text: e.text,
                code: n,
                player: p,
              }),
            ],
          })),
          "Name a card, then discard the top 3 cards of the chosen deck: 1 damage to a non-unique enemy, 2 if the named card is discarded.",
        ),
      );
      return true;
    }
    case "dcGlorinaithDiscard": {
      const ship = get(s, e.source);
      const p = e.player ?? activeSeat(s);
      if (!ship) return true;
      const upgraded = dcBackFace(ship);
      const discarded = discardTop(s, e.text!, upgraded ? 3 : 2);
      const named =
        !!e.code && discarded.some((code) => card(code).name === e.code);
      const value = upgraded && named ? 2 : 1;
      log(
        s,
        `Glórinaith discards ${discarded.map((code) => card(code).name).join(", ") || "nothing"}${e.code ? ` (named ${e.code})` : ""}.`,
      );
      const targets = glorinaithTargets(s, ship);
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Glórinaith · Deal ${value} damage to a non-unique enemy`,
          targets.map((t) => ({
            id: t.id,
            code: t.code,
            label: `Deal ${value} damage to ${name(t)}`,
            effects: [
              fx("damage", { target: t.id, value, player: p, source: ship.id }),
            ],
          })),
          card(ship.code).text,
        ),
      );
      return true;
    }
    case "dcArmor": {
      const p = e.player ?? activeSeat(s);
      const targets = enemiesInPlay(s).filter(
        (u) => u.id !== e.target && u.shadows.length,
      );
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          "Armor Plating · Discard 1 shadow card from another enemy?",
          [
            ...targets.map((t) => ({
              id: t.id,
              code: t.code,
              label: `Discard a shadow card from ${name(t)}`,
              effects: [fx("dcArmorDiscard", { target: t.id })],
            })),
            { id: "skip", label: "Do not use Armor Plating", effects: [] },
          ],
          card(backFace(DC.armor)).text,
        ),
      );
      return true;
    }
    case "dcArmorDiscard": {
      const t = get(s, e.target);
      if (!t || !t.shadows.length) return true;
      const code = removeShadowCard(t, t.shadows.length - 1);
      if (code) s.encounterDiscard.push(code);
      log(s, `Armor Plating discards a shadow card from ${name(t)}.`, "good");
      return true;
    }
    case "dcBallista": {
      const p = e.player ?? activeSeat(s);
      const targets = enemiesInPlay(s).filter(
        (u) => !card(u.code).is_unique && !isImmune(u),
      );
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          "Ballista · Deal 1 damage to a non-unique enemy and remove 1 resource from it?",
          [
            ...targets.map((t) => ({
              id: t.id,
              code: t.code,
              label: `Deal 1 damage to ${name(t)}${t.resources ? " and remove 1 resource" : ""}`,
              effects: [
                fx("dcBallistaHit", {
                  target: t.id,
                  player: p,
                  source: e.source,
                }),
              ],
            })),
            { id: "skip", label: "Do not use Ballista", effects: [] },
          ],
          card(backFace(DC.ballista)).text,
        ),
      );
      return true;
    }
    case "dcBallistaHit": {
      const t = get(s, e.target);
      if (!t) return true;
      if (t.resources > 0) t.resources -= 1;
      prepend(
        s,
        fx("damage", {
          target: t.id,
          value: 1,
          player: e.player,
          source: e.source,
        }),
      );
      return true;
    }
    case "dcSails": {
      const p = e.player ?? activeSeat(s);
      const boarding = e.effects ?? [];
      const enemy = get(s, e.target);
      forOwner(s, p, () =>
        choose(
          s,
          `Extra Sails · Spend 1 resource and exhaust Extra Sails to reduce ${enemy ? `${name(enemy)}'s` : "the"} Boarding value by 1?`,
          [
            ...seatView(s, p)
              .heroes.filter((h) => h.resources > 0)
              .map((h) => ({
                id: h.id,
                code: h.code,
                label: `Spend 1 resource from ${name(h)}`,
                effects: [
                  fx("dcSailsPay", { target: h.id, source: e.source }),
                  ...boarding.slice(1),
                ],
              })),
            { id: "skip", label: "Do not use Extra Sails", effects: boarding },
          ],
          card(backFace(DC.sails)).text,
        ),
      );
      return true;
    }
    case "dcSailsPay": {
      const h = get(s, e.target);
      if (h && h.resources > 0) h.resources -= 1;
      for (const u of allEngagedOrAllies(s))
        for (const a of u.attachments)
          if (a.id === e.source) a.exhausted = true;
      log(s, "Extra Sails reduces the Boarding value by 1.", "good");
      return true;
    }
    default:
      return false;
  }
}
const allEngagedOrAllies = (s: GameState) =>
  seatIndices(s).flatMap((p) => seatView(s, p).allies);
const deckOf = (s: GameState, id: string): string[] =>
  id === "encounter" ? s.encounterDeck : seatView(s, Number(id.slice(5))).deck;
/** Discard the top cards of the encounter deck or a player's deck. */
function discardTop(s: GameState, id: string, n: number): string[] {
  if (id === "encounter") {
    const cards = s.encounterDeck.splice(0, n);
    s.encounterDiscard.push(...cards);
    return cards;
  }
  const p = Number(id.slice(5));
  let cards: string[] = [];
  forOwner(s, p, () => {
    cards = s.deck.slice(0, n);
    discardPlayerDeck(s, cards.length);
  });
  return cards;
}

/**
 * "When [this card] leaves play, remove it from the game." (The Modification
 * boons and the campaign's other boon and burden attachments.)
 */
export function dreamchaserAttachmentLeaves(
  s: GameState,
  host: Unit,
  a: { id: string; code: string },
) {
  if (!isDreamchaserGame(s) || !LEAVE_TO_REMOVED.includes(dcBase(a.code)))
    return false;
  host.attachments = host.attachments.filter((x) => x.id !== a.id);
  log(s, `${card(a.code).name} is removed from the game.`);
  return true;
}
const LEAVE_TO_REMOVED: readonly string[] = [
  DC.armor,
  DC.ballista,
  DC.quarters,
  DC.sails,
  DC.spyglass,
  DC.keyBoon,
  DC.keyBurden,
];

// ------------------------------------------ the Upgraded Modification boons

/** Armor Plating (Upgraded): "After attached Ship defends against an enemy, discard 1 shadow card from another enemy." */
export function dreamchaserEnemyAttackResolved(
  s: GameState,
  enemy: Unit,
  defenderIds: string[],
) {
  if (!isDreamchaserGame(s)) return;
  for (const id of defenderIds) {
    const ship = get(s, id);
    if (!ship) continue;
    for (const a of attached(ship, DC.armor))
      if (
        dcBackFace(a) &&
        enemiesInPlay(s).some((e) => e.id !== enemy.id && e.shadows.length)
      )
        prepend(
          s,
          fx("dcArmor", {
            source: a.id,
            target: enemy.id,
            player: ownerOf(s, ship),
          }),
        );
  }
}
/** Ballista (Upgraded): "After attached Ship attacks, deal 1 damage to a non-unique enemy and remove 1 resource from that enemy." */
export function dreamchaserPlayerAttackResolved(s: GameState, ids: string[]) {
  if (!isDreamchaserGame(s)) return;
  for (const id of ids) {
    const ship = get(s, id);
    if (!ship) continue;
    for (const a of attached(ship, DC.ballista))
      if (
        dcBackFace(a) &&
        enemiesInPlay(s).some((e) => !card(e.code).is_unique)
      )
        prepend(
          s,
          fx("dcBallista", { source: a.id, player: ownerOf(s, ship) }),
        );
  }
}
/**
 * Extra Sails (Upgraded): "Response: When a non-unique Ship enemy engages
 * you, spend 1 resource and exhaust Extra Sails to reduce that enemy's
 * Boarding value by 1." The boarding resolves through this offer.
 */
export function dreamchaserBoardingOffer(
  s: GameState,
  enemy: Unit,
  player: number,
  boarding: Effect[],
): Effect[] {
  if (
    !isDreamchaserGame(s) ||
    !boarding.length ||
    card(enemy.code).is_unique ||
    card(enemy.code).type_code !== "ship-enemy"
  )
    return boarding;
  const sails = seatView(s, player)
    .allies.flatMap((u) => attached(u, DC.sails))
    .find((a) => dcBackFace(a) && !a.exhausted);
  if (!sails || !seatView(s, player).heroes.some((h) => h.resources > 0))
    return boarding;
  return [
    fx("dcSails", {
      source: sails.id,
      target: enemy.id,
      player,
      effects: boarding,
    }),
  ];
}
