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
  reorderPlayerDeck,
  RuleError,
  shuffle,
  takePlayerDeck,
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
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import { putPlayedEventInVictory } from "./event-resolution";
import {
  calphonLook,
  calphonPick,
  calphonSwap,
  calphonSwitch,
  type CalphonKinds,
} from "./calphon";
import { FATE } from "./fate-numenor-support";
import { DEPTHS } from "./depths-support";
import { effectiveTraits } from "./expansion-passives";
import type { DamageContext } from "./damage-context";
import { returnToStaging } from "./fellowship-event-lib";
import { isShipObjective } from "./ships";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isPlayerCardSource } from "./player-effect-immunity";
import { playerCardImmune } from "./card-immunity";
import {
  DC,
  GALDOR,
  backFace,
  dcBackFace,
  dcBase,
  dcIs,
  dcLevel,
  DREAM_LOCATION,
  fleetShip,
  isDreamchaserGame,
  isUncharted,
} from "./dreamchaser-campaign-support";
import { dreamchaserOminousX, dreamchaserState } from "./dreamchaser-campaign";
import {
  citySahirCheck,
  cityStormcallerDamageCap,
  citySwordAbility,
  citySwordAttack,
  citySwordAttacked,
  citySwordIndestructible,
  citySwordLabel,
  citySwordProblem,
  dreamchaserCityEffect,
} from "./dreamchaser-city";
import {
  borrowedHeroRemoved,
  cobasCampaignEncounter,
  cobasCampaignShadow,
  cobasCardEntered,
  cobasRoundEnd,
  dreamchaserCobasEffect,
  gavinAbility,
  gavinLabel,
  gavinProblem,
  gavinRemoved,
} from "./dreamchaser-cobas";
import {
  cirdanAbility,
  cirdanAttackBonus,
  cirdanAttackers,
  cirdanAttackResolved,
  cirdanDefenders,
  cirdanEntered,
  cirdanLabel,
  cirdanLocationExplored,
  cirdanProblem,
  dreamchaserCommandPlayed,
  dreamchaserDrownedEffect,
  dreamchaserDrownedPhaseEnd,
} from "./dreamchaser-drowned";
import {
  dreamchaserTempleArchery,
  dreamchaserTempleEffect,
  dreamchaserTempleStats,
  nightmareHandCheck,
  nightmareLeavesPlay,
  starlaDiscarded,
  starlaExhausted,
} from "./dreamchaser-temple";

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
  if (!isDreamchaserGame(s)) return false;
  // Gavin and Send for Help (A Storm on Cobas Haven).
  if (fromReveal && cobasCampaignEncounter(s, code)) return true;
  if (code !== DC.ominous) return false;
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
  // Send for Help: "Shadow: Resolve this card's when revealed effect."
  if (cobasCampaignShadow(s, code)) return true;
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

/** Archery: Thunderstruck's "Archery 1"; the Temple Guardian's campaign side: "Archery X". */
export const dreamchaserArchery = (s: GameState, u: Unit) =>
  !isDreamchaserGame(s)
    ? 0
    : (dcIs(u, DC.thunderstruck) && !u.blanked ? 1 : 0) +
      dreamchaserTempleArchery(s, u);

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
  // Graxar "gets +1 [attack] for each damage on him and +1 [defense] for each
  // resource on him".
  if (dcIs(u, DC.graxar) && !u.blanked) {
    out.attack += u.damage;
    out.defense += u.resources;
  }
  // Calaerion: "+1 [willpower], +1 [attack], and +1 [defense] until the end
  // of the phase" (of the round on his Upgraded side).
  for (const b of activeBoosts(s))
    if (b.target === u.id) {
      const plain =
        b.will === undefined &&
        b.attack === undefined &&
        b.defense === undefined;
      out.will += plain ? 1 : (b.will ?? 0);
      out.attack += plain ? 1 : (b.attack ?? 0);
      out.defense += plain ? 1 : (b.defense ?? 0);
    }
  // Sea Serpent: "X is the number of players in the game" (twice the number
  // on its Enraged side) for its defense.
  if (dcIs(u, DC.serpent) && !u.blanked) out.defense += serpentX(s, u);
  // The Black Sword: "Captain Sahír gets +2 [attack]."
  out.attack += citySwordAttack(u);
  // Starla, Recurring Nightmare and the Temple Guardian's campaign side.
  const temple = dreamchaserTempleStats(s, u);
  out.will += temple.will;
  out.attack += temple.attack;
  out.defense += temple.defense;
  for (const a of u.attachments) {
    if (a.blanked) continue;
    const code = dcBase(a.code);
    // Black Key (burden): "Attached enemy gets +1 [threat], +1 [attack], +1
    // [defense], and gains immune to player card effects."
    if (code === DC.keyBurden) {
      out.attack += 1;
      out.defense += 1;
    }
    // Black Key: "Attached character gets +1 [willpower], +1 [attack], and +1 [defense]."
    if (code === DC.keyBoon) {
      out.will += 1;
      out.attack += 1;
      out.defense += 1;
    }
    // Parrying Cutlass: +1 [defense] (+2 with 2 or more resources in its
    // hero's pool); +2 (+3) on its Upgraded side.
    if (code === DC.cutlass)
      out.defense += (dcBackFace(a) ? 2 : 1) + (u.resources >= 2 ? 1 : 0);
    // Throwing Axe: +1 [attack] (+2 with 2 or more damage on its hero); +2
    // (+3) on its Upgraded side.
    if (code === DC.axe)
      out.attack += (dcBackFace(a) ? 2 : 1) + (u.damage >= 2 ? 1 : 0);
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
/** Sea Serpent's X: the number of players (twice it on the Enraged side). */
const serpentX = (s: GameState, u: Unit) =>
  (dcBackFace(u) ? 2 : 1) * players(s);
/** Crowley's threat: +1 for each resource on him; Black Key (burden): +1; Sea Serpent: X. */
export const dreamchaserThreatBonus = (s: GameState, u: Unit) =>
  !isDreamchaserGame(s)
    ? 0
    : (dcIs(u, DC.crowley) && !u.blanked ? u.resources : 0) +
      (dcIs(u, DC.serpent) && !u.blanked ? serpentX(s, u) : 0) +
      u.attachments.filter((a) => dcIs(a.code, DC.keyBurden) && !a.blanked)
        .length;
const phaseKey = (p: string) => (p === "staging" ? "quest" : p);
/** Calaerion's boosts still in effect. */
const activeBoosts = (s: GameState) =>
  (s.dreamchaser?.boosts ?? []).filter(
    (b) =>
      b.round === s.round &&
      (b.until === "round" || phaseKey(b.phase) === phaseKey(s.phase)),
  );

/**
 * Thunderstruck "cannot take more than 4 damage each round"; Revenant:
 * "Forced: When 3 or more damage would be placed on Revenant, place 2 damage
 * instead."
 */
export function dreamchaserDamageAmount(s: GameState, u: Unit, value: number) {
  if (!isDreamchaserGame(s) || u.blanked) return value;
  if (dcIs(u, DC.revenant)) return value >= 3 ? 2 : value;
  // The Stormcaller's campaign side (The City of Corsairs): "cannot take
  // more than 10 damage each round."
  const cap = dcIs(u, DC.thunderstruck) ? 4 : cityStormcallerDamageCap(u);
  if (cap === undefined) return value;
  const q = dreamchaserState(s);
  const taken = q.damage?.round === s.round ? (q.damage.byId[u.id] ?? 0) : 0;
  return Math.min(value, Math.max(0, cap - taken));
}
export function dreamchaserDamageDealt(s: GameState, u: Unit, value: number) {
  if (
    !isDreamchaserGame(s) ||
    (!dcIs(u, DC.thunderstruck) && cityStormcallerDamageCap(u) === undefined) ||
    value <= 0
  )
    return;
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
  return [
    ...allEngaged(s)
      .filter((u) => dcIs(u, DC.crowley) && !u.blanked)
      .map((u) => fx("dcCrowleyReturn", { target: u.id })),
    // The Dream-chaser location's campaign side: "Response: At the end of
    // the combat phase, raise each player's threat by 2 to remove 1 damage
    // from a location."
    ...([...s.staging, ...allActiveLocations(s)].some(
      (u) => dcIs(u, DREAM_LOCATION) && dcBackFace(u) && !u.blanked,
    ) && damagedLocations(s).length
      ? [fx("dcDreamRepair", { player: firstPlayer(s) })]
      : []),
  ];
}
const damagedLocations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && u.damage > 0,
  );
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
  // Recurring Nightmare: "When Recurring Nightmare leaves play, shuffle it
  // into any player's deck."
  if (nightmareLeavesPlay(s, u)) return true;
  if (dcIs(u, DC.crowley) && destruction && u.resources >= 3 && !u.blanked) {
    addVictoryCard(s, u.code);
    s.victory += 3;
    log(s, "Crowley goes to the victory display (victory 3).", "good");
    return true;
  }
  // Sea Serpent (Menacing): "Forced: After Sea Serpent is destroyed, flip it
  // over and put it into play in the staging area."
  if (dcIs(u, DC.serpent) && !dcBackFace(u) && destruction && !u.blanked) {
    const enraged = make(s, backFace(DC.serpent));
    s.staging.push(enraged);
    enemyAddedToStaging(s, enraged);
    log(
      s,
      "Sea Serpent flips to its Enraged side in the staging area.",
      "danger",
    );
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
export const dreamchaserAbilityLabel = (code: string, s?: GameState) =>
  gavinLabel(code) ??
  (s ? citySwordLabel(s, { code } as Unit) : undefined) ??
  (dcBase(code) === DC.glorinaith
    ? dcBackFace(code)
      ? "Glórinaith · Name a card, then discard the top 3 cards of any deck to deal 1 damage to a non-unique enemy (2 if the named card is discarded; once per round)"
      : "Glórinaith · Discard the top 2 cards of any deck to deal 1 damage to an engaged non-unique enemy (once per round)"
    : s && campaignCalphon(s) && dcIs(code, FATE.calphon)
      ? dcBackFace(code)
        ? "Exhaust · Look at your bottom 5 cards"
        : "Exhaust · Look at your bottom card"
      : dcIs(code, DC.calaerion)
        ? dcBackFace(code)
          ? "Calaerion · Spend 2 resources and exhaust: ready another ally (+1/+1/+1 until the end of the round)"
          : "Calaerion · Spend 3 resources and exhaust: ready the Dream-chaser (+1/+1/+1 until the end of the phase)"
        : undefined);
/** Calphon outside The Fate of Númenor: Raid on the Grey Havens' campaign card. */
const campaignCalphon = (s: GameState) =>
  isDreamchaserGame(s) && !s.fateNumenor;
const CALPHON_KINDS: CalphonKinds = {
  pick: "dcCalphonPick",
  swap: "dcCalphonSwap",
  switch: "dcCalphonSwitch",
};
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
  if (!isDreamchaserGame(s) || !dreamchaserAbilityLabel(u.code, s))
    return "No campaign ability.";
  if (u.blanked) return `${name(u)}'s text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s))
    return `${name(u)} belongs to another player.`;
  if (gavinLabel(u.code)) return gavinProblem(s, u);
  if (citySwordLabel(s, u)) return citySwordProblem(s, u);
  if (dcIs(u, FATE.calphon))
    return u.exhausted || !seatView(s, ownerOf(s, u)).deck.length
      ? "Calphon must be ready and your deck must contain a card."
      : null;
  if (dcIs(u, DC.calaerion)) {
    if (u.exhausted) return "Calaerion is exhausted.";
    const cost = dcBackFace(u) ? 2 : 3;
    const pool = seatView(s, ownerOf(s, u)).heroes.reduce(
      (n, h) => n + h.resources,
      0,
    );
    if (pool < cost) return `Calaerion needs ${cost} resources.`;
    if (!calaerionTargets(s, u).length)
      return dcBackFace(u)
        ? "No other ally can be readied."
        : "The Dream-chaser is not in play.";
    return null;
  }
  if (s.used.includes(`dc-glorinaith:${s.round}:${u.id}`))
    return `${name(u)}'s Action was used this round.`;
  if (!glorinaithTargets(s, u).length)
    return dcBackFace(u)
      ? "No non-unique enemy can take the damage."
      : "No engaged non-unique enemy can take the damage.";
  return null;
}
export function dreamchaserAbility(s: GameState, u: Unit): boolean {
  if (!isDreamchaserGame(s) || !dreamchaserAbilityLabel(u.code, s))
    return false;
  const problem = dreamchaserAbilityProblem(s, u);
  if (problem) throw new RuleError(problem);
  if (gavinLabel(u.code)) {
    gavinAbility(s, u);
    return true;
  }
  if (citySwordLabel(s, u)) {
    citySwordAbility(s, u);
    return true;
  }
  if (dcIs(u, FATE.calphon)) {
    if (exhaustCharacter(s, u))
      prepend(s, fx("dcCalphon", { target: u.id, player: ownerOf(s, u) }));
    return true;
  }
  if (dcIs(u, DC.calaerion)) {
    prepend(
      s,
      fx("dcCalaerionPay", {
        source: u.id,
        value: dcBackFace(u) ? 2 : 3,
        ids: [],
        player: ownerOf(s, u),
      }),
    );
    return true;
  }
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
  cirdanLabel(code) ??
  (dcIs(code, DC.spyglass)
    ? `Spyglass · Exhaust: look at a shadow card or a deck, or place progress${dcBackFace(code) ? " (Upgraded)" : ""}`
    : dcIs(code, DC.keyBoon) && dcBackFace(code)
      ? "Black Key · Exhaust and remove 3 resources from attached character to ready them"
      : dcIs(code, DC.axe) && dcBackFace(code)
        ? "Throwing Axe · Deal 1 damage to an enemy, or toss it (once per game)"
        : undefined);
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
  if (cirdanLabel(a.code)) return cirdanProblem(a);
  if (dcIs(a.code, DC.axe)) {
    if ((s.dreamchaser?.spent ?? []).includes(a.id))
      return "Throwing Axe was used this game.";
    if (!axeTargets(s).length) return "No enemy can take the damage.";
    return null;
  }
  if (a.exhausted) return `${card(a.code).name} is exhausted.`;
  if (dcIs(a.code, DC.keyBoon)) {
    if (u.resources < 3) return `${name(u)} needs 3 resources.`;
    if (!u.exhausted) return `${name(u)} is already ready.`;
  }
  return null;
}
/** The enemies a boon's damage can target (not immune to player card effects). */
const axeTargets = (s: GameState) =>
  enemiesInPlay(s).filter((e) => !playerCardImmune(e));
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
  const p = activeSeat(s);
  if (cirdanLabel(a.code)) {
    // Círdan's Blessing (Spirit): "Action: Exhaust Círdan's Blessing and
    // remove 1 resource from it to give attached character +3 [willpower]
    // until the end of the phase."
    cirdanAbility(s, u, a);
    return true;
  }
  if (dcIs(a.code, DC.keyBoon)) {
    // "Action: Exhaust Black Key and remove 3 resources from attached
    // character to ready them."
    a.exhausted = true;
    u.resources -= 3;
    readyCharacter(s, u);
    log(s, `Black Key: ${name(u)} spends 3 resources and readies.`, "good");
    return true;
  }
  if (dcIs(a.code, DC.axe)) {
    // "Action: Either deal 1 damage to an enemy, or toss Throwing Axe. If it
    // travels at least two feet across the playing area and stops on any
    // enemies, deal 4 damage to one of them. Reattach Throwing Axe to its
    // hero. (Limit once per game.)" The toss is made on the real table and
    // its result reported here.
    const q = dreamchaserState(s);
    q.spent = [...(q.spent ?? []), a.id];
    choose(
      s,
      "Throwing Axe · Choose one",
      [
        {
          id: "damage",
          label: "Deal 1 damage to an enemy",
          effects: [fx("dcAxeHit", { value: 1, player: p, source: a.id })],
        },
        {
          id: "toss",
          label: "Toss Throwing Axe across the table",
          effects: [fx("dcAxeToss", { player: p, source: a.id })],
        },
      ],
      card(a.code).text,
    );
    return true;
  }
  a.exhausted = true;
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

// --------------------------------------- Flight of the Stormcaller

/** The allies Calaerion's Action can ready: the Dream-chaser, or (Upgraded) another ally. */
function calaerionTargets(s: GameState, cal: Unit) {
  const allies = seatIndices(s).flatMap((p) => seatView(s, p).allies);
  return dcBackFace(cal)
    ? allies.filter(
        (u) =>
          u.id !== cal.id &&
          ["ally", "objective-ally"].includes(card(u.code).type_code),
      )
    : allies.filter((u) => fleetShip(u.code) === "dream");
}
/** Spend a cost's resources from a hero's pool. */
function spendCardResources(s: GameState, h: Unit, n: number) {
  const spent = Math.min(n, h.resources);
  h.resources -= spent;
  if (spent > 0) h.resourcesSpentRound = s.round;
}
/**
 * Black Key (burden): "Forced: At the end of the quest phase, if Captain
 * Sahír is in play, place 1 resource on him for each player in the game."
 * (Not on its Upgraded side.)
 */
export function dreamchaserQuestEnd(s: GameState) {
  if (!isDreamchaserGame(s)) return;
  const area =
    (s as GameState & { stormcaller?: { area: Unit[] } }).stormcaller?.area ??
    [];
  const keys = [...area, ...s.staging, ...allEngaged(s)].flatMap((u) =>
    u.attachments.filter(
      (a) => dcIs(a.code, DC.keyBurden) && !dcBackFace(a) && !a.blanked,
    ),
  );
  if (
    keys.length &&
    enemiesInPlay(s).some((x) => card(x.code).name === "Captain Sahír")
  )
    prepend(s, ...keys.map(() => fx("dcSahirKey", { player: firstPlayer(s) })));
}
/**
 * Calaerion (Upgraded): "Response: After a card is discarded from the
 * encounter deck, shuffle it into that deck. (Limit once per round.)"
 */
export function dreamchaserEncounterDiscarded(s: GameState, codes: string[]) {
  if (!isDreamchaserGame(s) || !codes.length) return;
  if (s.dreamchaser?.calaerionRound === s.round) return;
  const cal = seatIndices(s)
    .flatMap((p) => seatView(s, p).allies)
    .find((u) => dcIs(u, DC.calaerion) && dcBackFace(u) && !u.blanked);
  if (!cal) return;
  prepend(
    s,
    fx("dcCalaerionOffer", {
      target: cal.id,
      text: [...new Set(codes)].join(","),
      player: ownerOf(s, cal),
    }),
  );
}
/** "When Calaerion leaves play, remove him from the game." */
export function dreamchaserRemoveCharacter(s: GameState, u: Unit) {
  if (!isDreamchaserGame(s)) return false;
  // Send for Help (Tactics): "… if those heroes leave play, remove them
  // from the game."
  if (borrowedHeroRemoved(s, u)) {
    const q = dreamchaserState(s);
    q.borrowed = (q.borrowed ?? []).filter((id) => id !== u.id);
    if (!q.borrowed.length) delete q.borrowed;
    s.removed.push(u.code);
    return true;
  }
  // Calaerion and Gavin are removed from the game when they leave play.
  if (!dcIs(u, DC.calaerion) && !gavinRemoved(s, u)) return false;
  s.removed.push(u.code);
  return true;
}
/** Gavin and Send for Help are revealed without entering the staging area. */
export const dreamchaserCardEntered = (
  s: GameState,
  u: Unit,
  cancel: boolean,
) => cobasCardEntered(s, u, cancel);

// ------------------------------------------- Raid on the Grey Havens

/** The campaign's checks after each step. */
export function dreamchaserCheck(s: GameState) {
  if (!isDreamchaserGame(s) || s.status !== "playing") return;
  depthsKeyCheck(s);
  grantsCleanup(s);
  calphonCheck(s);
  nightmareHandCheck(s);
  citySahirCheck(s);
}
/** The Black Sword: "Captain Sahír … gains indestructible." */
export const dreamchaserIndestructible = (s: GameState, u: Unit) =>
  citySwordIndestructible(s, u);
/** Círdan's Blessing (Tactics): "Response: When attached character attacks, …" */
export const dreamchaserAttackersDeclared = (
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
): Effect[] => (isDreamchaserGame(s) ? cirdanAttackers(s, attackers) : []);
/** "+3 [attack] for this attack" (Círdan's Blessing, Tactics). */
export const dreamchaserPlayerAttackBonus = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) ? cirdanAttackBonus(s, u) : 0;
/** Círdan's Blessing (Lore): after the active location is explored. */
export function dreamchaserLocationExplored(
  s: GameState,
  _u: Unit,
  wasActive: boolean,
) {
  cirdanLocationExplored(s, wasActive);
}
/** "Círdan's Blessing enters play with X resources on it." */
export function dreamchaserAttachmentEntered(
  s: GameState,
  _host: Unit,
  a: { id: string; code: string; exhausted: boolean },
) {
  cirdanEntered(s, a);
}
/** The end of each phase: Command (Leadership)'s allies are discarded. */
export const dreamchaserPhaseEnd = (s: GameState): Effect[] =>
  isDreamchaserGame(s) ? dreamchaserDrownedPhaseEnd(s) : [];
/** Starla: "Response: After Starla exhausts, place 1 progress on a location." */
export function dreamchaserCharacterExhausted(s: GameState, u: Unit) {
  starlaExhausted(s, u);
}
/** A player card discarded from a hand or deck (Starla: "… play her"). */
export function dreamchaserPlayerCardDiscarded(
  s: GameState,
  u: { code: string },
) {
  starlaDiscarded(s, u);
}
/**
 * The Thing in the Depths' campaign card: "Forced: After Captain Sahír
 * (enemy) enters play, attach Black Key (burden) to him."
 */
function depthsKeyCheck(s: GameState) {
  if (s.scenarioId !== "the-thing-in-the-depths") return;
  const q = dreamchaserState(s);
  for (const sahir of enemiesInPlay(s).filter((u) => u.code === DEPTHS.sahir)) {
    if ((q.keyed ?? []).includes(sahir.id)) continue;
    q.keyed = [...(q.keyed ?? []), sahir.id];
    const key =
      (s.campaign?.marks?.[DC.keyBurden] ?? 0) >= 5
        ? backFace(DC.keyBurden)
        : DC.keyBurden;
    sahir.attachments.push({
      id: `a${s.nextId++}`,
      code: key,
      exhausted: false,
    });
    log(s, "Black Key (burden) is attached to Captain Sahír.", "danger");
  }
}
/** Come Together's Traits last until the end of the round. */
function grantsCleanup(s: GameState) {
  const q = s.dreamchaser;
  if (!q?.grants?.some((g) => g.round !== s.round)) return;
  for (const g of q.grants.filter((g) => g.round !== s.round)) {
    const u = get(s, g.target);
    if (u?.dynamicTraits) {
      const i = u.dynamicTraits.indexOf(g.trait);
      if (i >= 0) u.dynamicTraits.splice(i, 1);
    }
  }
  q.grants = q.grants.filter((g) => g.round === s.round);
}
/**
 * Raid on the Grey Havens' campaign card: the first player controls Calphon,
 * and "If Calphon leaves play, the players lose the game" until stage 2B
 * removes him from the game.
 */
function calphonCheck(s: GameState) {
  if (!campaignCalphon(s) || !s.dreamchaser?.calphon) return;
  const guide = allCharacters(s).find((u) => dcIs(u, FATE.calphon));
  if (!guide) {
    s.status = "lost";
    s.reason = "Calphon has left play. The players lose the game.";
    s.queue = [];
    s.choice = null;
    return;
  }
  const first = firstPlayer(s),
    prior = ownerOf(s, guide);
  if (prior === first) return;
  forOwner(
    s,
    prior,
    () => (s.allies = s.allies.filter((u) => u.id !== guide.id)),
  );
  guide.owner = first;
  forOwner(s, first, () => s.allies.push(guide));
}
/** Sea Serpent (Enraged): "Forced: At the end of the round, Sea Serpent makes an attack against the first player." */
export function dreamchaserRoundEnd(s: GameState): Effect[] {
  if (!isDreamchaserGame(s)) return [];
  return [
    ...cobasRoundEnd(s),
    ...enemiesInPlay(s)
      .filter((u) => dcIs(u, DC.serpent) && dcBackFace(u) && !u.blanked)
      .map((u) =>
        fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
      ),
  ];
}
/**
 * Sea Serpent: "Forced: After Sea Serpent attacks and destroys an ally, the
 * defending player deals X damage divided among characters they control."
 */
export function dreamchaserCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (!isDreamchaserGame(s) || !context.combatDamage || !context.enemyId)
    return;
  if (card(u.code).type_code !== "ally") return;
  const enemy = get(s, context.enemyId);
  if (!enemy || !dcIs(enemy, DC.serpent) || enemy.blanked) return;
  prepend(
    s,
    fx("dcDivideDamage", {
      value: serpentX(s, enemy),
      player: ownerOf(s, u),
      text: "Sea Serpent",
    }),
  );
}
/** Graxar: "No more than 1 character can attack Graxar each round." */
export function dreamchaserAttackProblem(
  s: GameState,
  enemy: Unit,
  ids: string[],
): string | null {
  if (!isDreamchaserGame(s) || !dcIs(enemy, DC.graxar) || enemy.blanked)
    return null;
  const marked = s.dreamchaser?.attacked;
  if (
    ids.length > 1 ||
    (marked?.round === s.round && marked.ids.includes(enemy.id))
  )
    return "No more than 1 character can attack Graxar each round.";
  return null;
}
export function dreamchaserAttackDeclared(
  s: GameState,
  enemy: Unit,
  ids: string[],
) {
  if (!isDreamchaserGame(s) || !dcIs(enemy, DC.graxar) || !ids.length) return;
  const q = dreamchaserState(s);
  const ids0 = q.attacked?.round === s.round ? q.attacked.ids : [];
  q.attacked = { round: s.round, ids: [...ids0, enemy.id] };
}
/**
 * Black Key (Upgraded): "Response: After attached character quests
 * successfully, place 1 resource on them."
 */
export function dreamchaserQuestSucceeded(s: GameState) {
  if (!isDreamchaserGame(s)) return;
  prepend(
    s,
    ...allCharacters(s)
      .filter(
        (u) =>
          u.committed &&
          u.attachments.some(
            (a) => dcIs(a.code, DC.keyBoon) && dcBackFace(a) && !a.blanked,
          ),
      )
      .map((u) => fx("dcKeyOffer", { target: u.id, player: ownerOf(s, u) })),
  );
}
/**
 * Parrying Cutlass (Upgraded): "Response: When attached hero defends against
 * an enemy, exhaust Parrying Cutlass to move 1 resource from that enemy to
 * attached hero's resource pool."
 */
export function dreamchaserDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  if (!isDreamchaserGame(s)) return [];
  // Círdan's Blessing (Leadership): "Response: When attached character
  // defends, remove 1 resource from Círdan's Blessing to give that
  // character +3 [defense] for this attack."
  const blessings = cirdanDefenders(s, defenders);
  if (!enemy.resources) return blessings;
  return [
    ...blessings,
    ...defenders.flatMap((d) =>
      d.attachments
        .filter(
          (a) =>
            dcIs(a.code, DC.cutlass) &&
            dcBackFace(a) &&
            !a.blanked &&
            !a.exhausted,
        )
        .map((a) =>
          fx("dcCutlassOffer", {
            target: d.id,
            source: a.id,
            ids: [enemy.id],
            player: ownerOf(s, d),
          }),
        ),
    ),
  ];
}
/** Galdor's Counsel: "Action: … X is its level … Add Galdor's Counsel to the victory display." */
export function dreamchaserPlayerEvent(s: GameState, code: string): boolean {
  // Command: "Add Command to the victory display to choose up to X options."
  if (dreamchaserCommandPlayed(s, code)) return true;
  if (isDreamchaserGame(s) && code === DC.together) {
    // Come Together: "Choose up to X characters. X is the level of Come
    // Together, then add it to the victory display."
    const x = dcLevel(s, code);
    putPlayedEventInVictory(s, code);
    log(s, `Come Together: X is ${x}.`);
    if (x > 0)
      prepend(
        s,
        fx("dcTogetherPick", { value: x, ids: [], player: activeSeat(s) }),
      );
    return true;
  }
  if (
    !isDreamchaserGame(s) ||
    !GALDOR.includes(code as (typeof GALDOR)[number])
  )
    return false;
  const p = activeSeat(s);
  const level = dcLevel(s, code);
  putPlayedEventInVictory(s, code);
  const kind = [
    "dcGaldorLeadership",
    "dcGaldorTactics",
    "dcGaldorSpirit",
    "dcGaldorLore",
  ][GALDOR.indexOf(code as (typeof GALDOR)[number])];
  // Leadership and Lore: "X is half the level …, rounded up."
  const x =
    code === GALDOR[0] || code === GALDOR[3] ? Math.ceil(level / 2) : level;
  log(s, `${card(code).name} (${card(code).boon_sphere}): X is ${x}.`);
  prepend(s, fx(kind, { value: x, player: p, code }));
  return true;
}
/** The current Galdor's Counsel (Lore) window: the cards looked at, still in the deck. */
function loreWindow(s: GameState, side: string, count: number) {
  const n = s.deck.length;
  const start = side === "top" ? 0 : Math.max(0, n - count);
  return Array.from({ length: Math.min(count, n) }, (_, i) => ({
    index: start + i,
    code: s.deck[start + i],
  }));
}
function raidEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "dcCalphon":
      calphonLook(s, u, p, CALPHON_KINDS);
      return true;
    case "dcCalphonPick":
      calphonPick(s, e, p, CALPHON_KINDS);
      return true;
    case "dcCalphonSwap":
      calphonSwap(
        s,
        e,
        s.hand.find((h) => h.id === e.target),
      );
      return true;
    case "dcCalphonSwitch":
      calphonSwitch(
        s,
        e,
        s.hand.find((h) => h.id === e.target),
        p,
      );
      return true;
    case "dcKeyOffer":
      if (!u) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Black Key · ${name(u)} quested successfully`,
          [
            {
              id: "resource",
              label: `Place 1 resource on ${name(u)}`,
              code: u.code,
              effects: [fx("dcKeyResource", { target: u.id, player: p })],
            },
            { id: "skip", label: "Decline", effects: [] },
          ],
          card(backFace(DC.keyBoon)).text,
        ),
      );
      return true;
    case "dcCalaerionPay": {
      // "Spend 3 resources" (2 on his Upgraded side): one at a time, from the
      // heroes his controller chooses.
      const cal = get(s, e.source);
      if (!cal || cal.exhausted) return true;
      const left = e.value ?? 0;
      const chosen = e.ids ?? [];
      if (left <= 0) {
        for (const id of new Set(chosen)) {
          const h = get(s, id);
          if (h)
            spendCardResources(s, h, chosen.filter((x) => x === id).length);
        }
        exhaustCharacter(s, cal);
        const targets = calaerionTargets(s, cal);
        if (targets.length === 1)
          prepend(
            s,
            fx("dcCalaerionReady", {
              source: cal.id,
              target: targets[0].id,
              player: p,
            }),
          );
        else
          choose(
            s,
            dcBackFace(cal)
              ? "Calaerion · Ready another ally"
              : "Calaerion · Ready the Dream-chaser",
            targets.map((x) => ({
              id: x.id,
              code: x.code,
              label: `Ready ${name(x)} (+1 willpower, +1 attack, +1 defense)`,
              effects: [
                fx("dcCalaerionReady", {
                  source: cal.id,
                  target: x.id,
                  player: p,
                }),
              ],
            })),
          );
        return true;
      }
      const payers = seatView(s, p).heroes.filter(
        (h) => h.resources > chosen.filter((id) => id === h.id).length,
      );
      if (!payers.length) return true;
      choose(
        s,
        `Calaerion · Spend ${left} more resource${left === 1 ? "" : "s"}`,
        payers.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Spend 1 resource from ${name(h)}`,
          effects: [
            fx("dcCalaerionPay", {
              source: cal.id,
              value: left - 1,
              ids: [...chosen, h.id],
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "dcCalaerionReady": {
      const cal = get(s, e.source);
      if (!u) return true;
      readyCharacter(s, u);
      const q = dreamchaserState(s);
      q.boosts = [
        ...(q.boosts ?? []).filter((b) => b.round === s.round),
        {
          target: u.id,
          until: cal && dcBackFace(cal) ? "round" : "phase",
          phase: s.phase,
          round: s.round,
        },
      ];
      log(
        s,
        `Calaerion readies ${name(u)}: +1 willpower, +1 attack and +1 defense until the end of the ${cal && dcBackFace(cal) ? "round" : "phase"}.`,
        "good",
      );
      return true;
    }
    case "dcCalaerionOffer": {
      const codes = (e.text ?? "")
        .split(",")
        .filter((code) => code && s.encounterDiscard.includes(code));
      if (!u || !codes.length || s.dreamchaser?.calaerionRound === s.round)
        return true;
      forOwner(s, p, () =>
        choose(
          s,
          "Calaerion · Shuffle a discarded encounter card back into the encounter deck?",
          [
            ...codes.map((code) => ({
              id: code,
              code,
              label: `Shuffle ${card(code).name} into the encounter deck`,
              effects: [fx("dcCalaerionShuffle", { code, player: p })],
            })),
            { id: "skip", label: "Decline", effects: [] },
          ],
          card(u.code).text,
        ),
      );
      return true;
    }
    case "dcCalaerionShuffle": {
      if (!e.code) return true;
      const i = s.encounterDiscard.lastIndexOf(e.code);
      if (i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      s.encounterDeck.push(e.code);
      shuffle(s, s.encounterDeck);
      dreamchaserState(s).calaerionRound = s.round;
      log(
        s,
        `Calaerion shuffles ${card(e.code).name} back into the encounter deck.`,
        "good",
      );
      return true;
    }
    case "dcSahirKey": {
      const sahir = enemiesInPlay(s).find(
        (x) => card(x.code).name === "Captain Sahír" && !x.blanked,
      );
      if (!sahir) return true;
      sahir.resources += players(s);
      log(
        s,
        `Black Key places ${players(s)} resource${players(s) === 1 ? "" : "s"} on Captain Sahír.`,
        "danger",
      );
      return true;
    }
    case "dcTogetherPick": {
      const chosen = e.ids ?? [];
      const left = (e.value ?? 0) - chosen.length;
      const characters = seatIndices(s)
        .flatMap((x) => [...seatView(s, x).heroes, ...seatView(s, x).allies])
        .filter(
          (c) =>
            !chosen.includes(c.id) &&
            ["hero", "ally", "objective-ally"].includes(
              card(c.code).type_code,
            ) &&
            !playerCardImmune(c),
        );
      if (left <= 0 || !characters.length) {
        prepend(s, fx("dcTogetherApply", { ids: chosen, player: p }));
        return true;
      }
      choose(
        s,
        `Come Together · Choose up to ${left} more character${left === 1 ? "" : "s"}`,
        [
          ...characters.map((c) => ({
            id: c.id,
            code: c.code,
            label: `Choose ${name(c)}`,
            effects: [
              fx("dcTogetherPick", {
                value: e.value,
                ids: [...chosen, c.id],
                player: p,
              }),
            ],
          })),
          {
            id: "done",
            label: chosen.length ? "Done choosing" : "Choose no characters",
            effects: [fx("dcTogetherApply", { ids: chosen, player: p })],
          },
        ],
        card(DC.together).text,
      );
      return true;
    }
    case "dcTogetherApply": {
      // "Until the end of the round, each of those characters... get +2
      // [defense] if you control a [leadership] hero, +2 [attack] if you
      // control a [tactics] hero, +2 [willpower] if you control a [spirit]
      // hero, gain a Trait of your choice and heal 2 damage from each of them
      // if you control a [lore] hero."
      const spheres = new Set(
        seatView(s, p).heroes.map((h) => card(h.code).sphere_code),
      );
      const targets = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x);
      const q = dreamchaserState(s);
      const amounts = {
        will: spheres.has("spirit") ? 2 : 0,
        attack: spheres.has("tactics") ? 2 : 0,
        defense: spheres.has("leadership") ? 2 : 0,
      };
      if (amounts.will || amounts.attack || amounts.defense)
        q.boosts = [
          ...(q.boosts ?? []).filter((b) => b.round === s.round),
          ...targets.map((x) => ({
            target: x.id,
            until: "round" as const,
            phase: s.phase,
            round: s.round,
            ...amounts,
          })),
        ];
      log(
        s,
        `Come Together: ${targets.map((x) => name(x)).join(", ") || "no characters"}${amounts.will ? ", +2 willpower" : ""}${amounts.attack ? ", +2 attack" : ""}${amounts.defense ? ", +2 defense" : ""} until the end of the round.`,
        "good",
      );
      if (spheres.has("lore"))
        prepend(
          s,
          ...targets.flatMap((x) => [
            fx("heal", {
              target: x.id,
              value: 2,
              player: p,
              code: DC.together,
            }),
            fx("dcTogetherTrait", { target: x.id, player: p }),
          ]),
        );
      return true;
    }
    case "dcTogetherTrait": {
      if (!u) return true;
      const own = new Set(effectiveTraits(u));
      const pool = new Set<string>();
      for (const x of seatIndices(s)) {
        const v = seatView(s, x);
        for (const code of [
          ...v.deck,
          ...v.discard,
          ...v.hand.map((h) => h.code),
          ...v.heroes.map((h) => h.code),
          ...v.allies.map((a) => a.code),
        ])
          for (const trait of (card(code).traits ?? "").split("."))
            if (trait.trim()) pool.add(trait.trim());
      }
      const traits = [...pool].filter((trait) => !own.has(trait)).sort();
      if (!traits.length) return true;
      choose(
        s,
        `Come Together · Choose a Trait for ${name(u)}`,
        traits.map((trait) => ({
          id: `trait-${trait}`,
          label: trait,
          code: u.code,
          effects: [
            fx("dcTogetherGrant", { target: u.id, text: trait, player: p }),
          ],
        })),
        "The character gains a Trait of your choice until the end of the round.",
      );
      return true;
    }
    case "dcTogetherGrant": {
      if (!u || !e.text) return true;
      u.dynamicTraits = [...(u.dynamicTraits ?? []), e.text];
      const q = dreamchaserState(s);
      q.grants = [
        ...(q.grants ?? []),
        { target: u.id, trait: e.text, round: s.round },
      ];
      log(
        s,
        `Come Together: ${name(u)} gains the ${e.text} Trait until the end of the round.`,
        "good",
      );
      return true;
    }
    case "dcDreamRepair": {
      const targets = damagedLocations(s);
      if (!targets.length) return true;
      choose(
        s,
        "Dream-chaser · Raise each player's threat by 2 to remove 1 damage from a location?",
        [
          ...targets.map((l) => ({
            id: l.id,
            code: l.code,
            label: `Remove 1 damage from ${name(l)} (each player raises their threat by 2)`,
            effects: [
              ...playerOrder(s).map((player) =>
                fx("dcThreat", { value: 2, player }),
              ),
              fx("dcDreamRepairDo", { target: l.id, player: p }),
            ],
          })),
          { id: "skip", label: "Decline", effects: [] },
        ],
        card(backFace(DREAM_LOCATION)).text,
      );
      return true;
    }
    case "dcDreamRepairDo":
      if (u && u.damage > 0) {
        u.damage -= 1;
        log(
          s,
          `The Dream-chaser's crew removes 1 damage from ${name(u)}.`,
          "good",
        );
      }
      return true;
    case "dcKeyResource":
      if (u) {
        u.resources += 1;
        log(s, `Black Key places 1 resource on ${name(u)}.`, "good");
      }
      return true;
    case "dcCutlassOffer": {
      const enemy = get(s, e.ids?.[0]);
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !enemy || !a || a.exhausted || !enemy.resources) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Parrying Cutlass · ${name(u)} defends against ${name(enemy)}`,
          [
            {
              id: "move",
              label: `Exhaust Parrying Cutlass to move 1 resource from ${name(enemy)} to ${name(u)}`,
              code: a.code,
              effects: [
                fx("dcCutlassMove", {
                  target: u.id,
                  source: a.id,
                  ids: [enemy.id],
                  player: p,
                }),
              ],
            },
            { id: "skip", label: "Do not use Parrying Cutlass", effects: [] },
          ],
          card(a.code).text,
        ),
      );
      return true;
    }
    case "dcCutlassMove": {
      const enemy = get(s, e.ids?.[0]);
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !enemy || !a || a.exhausted || !enemy.resources) return true;
      a.exhausted = true;
      enemy.resources -= 1;
      u.resources += 1;
      log(
        s,
        `Parrying Cutlass moves 1 resource from ${name(enemy)} to ${name(u)}.`,
        "good",
      );
      return true;
    }
    case "dcAxeToss":
      choose(
        s,
        "Throwing Axe · Did it travel at least two feet and stop on an enemy?",
        [
          {
            id: "hit",
            label: "It stopped on an enemy: deal 4 damage to one of them",
            effects: [
              fx("dcAxeHit", { value: 4, player: p, source: e.source }),
            ],
          },
          {
            id: "miss",
            label: "It missed",
            effects: [],
          },
        ],
        "Toss the Throwing Axe card on the real table; it is reattached to its hero either way.",
      );
      return true;
    case "dcAxeHit": {
      const targets = axeTargets(s);
      if (!targets.length) return true;
      choose(
        s,
        `Throwing Axe · Deal ${e.value} damage to an enemy`,
        targets.map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: `Deal ${e.value} damage to ${name(enemy)}`,
          effects: [
            fx("damage", { target: enemy.id, value: e.value, player: p }),
          ],
        })),
      );
      return true;
    }
    case "dcGaldorLeadership": {
      const heroes = seatIndices(s).flatMap((x) => seatView(s, x).heroes);
      if (!(e.value ?? 0) || !heroes.length) return true;
      choose(
        s,
        `Galdor's Counsel · Add ${e.value} resource${e.value === 1 ? "" : "s"} to a hero's resource pool`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} gains ${e.value}`,
          effects: [
            fx("dcAddResource", { target: h.id, value: e.value, player: p }),
          ],
        })),
      );
      return true;
    }
    case "dcGaldorTactics": {
      const targets = axeTargets(s).filter((x) => !card(x.code).is_unique);
      if (!(e.value ?? 0) || !targets.length) return true;
      choose(
        s,
        `Galdor's Counsel · Deal ${e.value} damage to a non-unique enemy`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Deal ${e.value} damage to ${name(x)}`,
          effects: [fx("damage", { target: x.id, value: e.value, player: p })],
        })),
      );
      return true;
    }
    case "dcGaldorSpirit": {
      const targets = s.staging.filter(
        (l) =>
          card(l.code).type_code === "location" &&
          !card(l.code).is_unique &&
          !playerCardImmune(l),
      );
      if (!(e.value ?? 0) || !targets.length) return true;
      choose(
        s,
        `Galdor's Counsel · Place ${e.value} progress on a non-unique location in the staging area`,
        targets.map((l) => ({
          id: l.id,
          code: l.code,
          label: `Place ${e.value} progress on ${name(l)}`,
          effects: [fx("locationProgress", { target: l.id, value: e.value })],
        })),
      );
      return true;
    }
    case "dcGaldorLore":
      if (!(e.value ?? 0) || !s.deck.length) return true;
      choose(s, `Galdor's Counsel · Look at ${e.value} cards of your deck`, [
        {
          id: "top",
          label: `The top ${Math.min(e.value!, s.deck.length)}`,
          effects: [
            fx("dcGaldorLook", { text: "top", count: e.value, player: p }),
          ],
        },
        {
          id: "bottom",
          label: `The bottom ${Math.min(e.value!, s.deck.length)}`,
          effects: [
            fx("dcGaldorLook", { text: "bottom", count: e.value, player: p }),
          ],
        },
      ]);
      return true;
    case "dcGaldorLook": {
      // "… add any number of them to your hand …"
      const side = e.text === "bottom" ? "bottom" : "top";
      const looked = loreWindow(s, side, e.count ?? 0);
      if (!looked.length) return true;
      choose(
        s,
        `Galdor's Counsel · Add any number of the ${side} ${looked.length} cards to your hand`,
        [
          ...looked.map((x) => ({
            id: `take-${x.index}`,
            code: x.code,
            label: `Add ${card(x.code).name} to your hand`,
            effects: [
              fx("dcGaldorLookOne", {
                text: side,
                count: looked.length,
                value: x.index,
                code: x.code,
                player: p,
              }),
            ],
          })),
          {
            id: "done",
            label: "Put the rest back",
            effects: [
              fx("dcGaldorArrange", {
                text: `${side}|`,
                count: looked.length,
                player: p,
              }),
            ],
          },
        ],
      );
      return true;
    }
    case "dcGaldorLookOne": {
      const side = e.text === "bottom" ? "bottom" : "top";
      if (s.deck[e.value ?? -1] !== e.code) return true;
      s.hand.push(takePlayerDeck(s, e.value!));
      log(
        s,
        `Galdor's Counsel adds ${card(e.code!).name} to your hand.`,
        "good",
      );
      prepend(
        s,
        fx("dcGaldorLook", {
          text: side,
          count: (e.count ?? 1) - 1,
          player: p,
        }),
      );
      return true;
    }
    case "dcGaldorArrange": {
      // "… and put the rest on the top and/or bottom of your deck in any
      // order." Cards are assigned one at a time: the top sequence from the
      // top down, the bottom sequence from the bottom up.
      const [rawSide, placed = ""] = (e.text ?? "top|").split("|");
      const side = rawSide === "bottom" ? "bottom" : "top";
      const looked = loreWindow(s, side, e.count ?? 0);
      const assigned = placed ? placed.split(",") : [];
      const used = assigned.map((x) => Number(x.slice(2)));
      const left = looked.filter((_, i) => !used.includes(i));
      if (!left.length) {
        const n = s.deck.length;
        const block = looked.map((x) => x.index);
        const rest = Array.from({ length: n }, (_, i) => i).filter(
          (i) => !block.includes(i),
        );
        const top = assigned
          .filter((x) => x.startsWith("t:"))
          .map((x) => block[Number(x.slice(2))]);
        const bottom = assigned
          .filter((x) => x.startsWith("b:"))
          .map((x) => block[Number(x.slice(2))])
          .reverse();
        reorderPlayerDeck(s, 0, [...top, ...rest, ...bottom]);
        log(
          s,
          `Galdor's Counsel puts ${top.length} card${top.length === 1 ? "" : "s"} on top and ${bottom.length} on the bottom of the deck.`,
        );
        return true;
      }
      choose(
        s,
        "Galdor's Counsel · Put the rest on the top and/or bottom of your deck",
        left.flatMap((x) => {
          const i = looked.indexOf(x);
          const next = (tag: string) =>
            fx("dcGaldorArrange", {
              text: `${side}|${[...assigned, `${tag}:${i}`].join(",")}`,
              count: looked.length,
              player: p,
            });
          return [
            {
              id: `t:${i}`,
              code: x.code,
              label: `${card(x.code).name}: next card from the top`,
              effects: [next("t")],
            },
            {
              id: `b:${i}`,
              code: x.code,
              label: `${card(x.code).name}: next card from the bottom`,
              effects: [next("b")],
            },
          ];
        }),
      );
      return true;
    }
  }
  return false;
}

export function dreamchaserCardEffect(s: GameState, e: Effect): boolean {
  if (dreamchaserTempleEffect(s, e)) return true;
  if (dreamchaserDrownedEffect(s, e)) return true;
  if (dreamchaserCobasEffect(s, e)) return true;
  if (dreamchaserCityEffect(s, e)) return true;
  if (e.kind.startsWith("dcSpy")) return spyglassEffect(s, e);
  if (raidEffect(s, e)) return true;
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
    dreamchaserEncounterDiscarded(s, cards);
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
  // The Black Sword: after Captain Sahír's first attack each round.
  citySwordAttacked(s, enemy);
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
  cirdanAttackResolved(s, ids);
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
