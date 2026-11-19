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
import {
  discardAttachment,
  discardHandCard,
  engage,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import { addCurrentQuestProgress } from "./side-quests";
import { putPlayedEventInVictory } from "./event-resolution";
import { reduceThreat } from "./threat-reduction";
import { canPlay, playTargets, resolvePaidPlayerCard } from "./actions";
import { effectiveTraits } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { syncAttachmentText } from "./attachment-text";
import {
  ERED,
  eredCampaignFrameworkEffect,
  eredChapter,
  eredPart,
  eredState,
  growingThreatTarget,
  isEredCampaign,
} from "./ered-campaign";
import { ROAM_RHOVANION as R } from "./roam-rhovanion-support";

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
/** The characters a player controls. */
const ownCharacters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];

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
  if (code === ERED.spawn) return spawnRevealed(s, fromReveal);
  if (code === ERED.cunning) return cunningRevealed(s, replay, fromReveal);
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

// ------------------------------------------------------------- Roam Across Rhovanion

/**
 * Urdug's Cunning: "Doomed 1. Surge. When Revealed: Discard the top 5 cards
 * of the encounter deck. For each enemy discarded this way, each player must
 * deal 1 damage to a character they control." (Doomed and Surge are printed
 * keywords.)
 */
function cunningRevealed(s: GameState, replay: boolean, fromReveal: boolean) {
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(ERED.cunning);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(ERED.cunning);
    return true;
  }
  const top = s.encounterDeck.splice(0, 5);
  s.encounterDiscard.push(...top, ERED.cunning);
  const n = top.filter((code) => card(code).type_code === "enemy").length;
  log(
    s,
    `Urdug's Cunning discards ${top.length ? top.map((code) => card(code).name).join(", ") : "no card"} from the encounter deck: ${n} ${n === 1 ? "enemy" : "enemies"}.`,
    n ? "danger" : undefined,
  );
  if (n)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("emcCunningDamage", { player, value: n }),
      ),
    );
  return true;
}
/** Urdug's Cunning: "Shadow: Attacking enemy gets +2 [defense] this phase." */
export function eredCampaignShadow(s: GameState, code: string) {
  if (code !== ERED.cunning || !s.combat) return false;
  const enemy = get(s, s.combat.enemyId);
  if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
  log(s, "Urdug's Cunning: the attacking enemy gets +2 [defense] this phase.");
  return true;
}
/** Roam Across Rhovanion: "Urdug gets +1 [willpower], +1 [threat], +1 [attack], and +1 [defense] for each resource on him." */
const urdugTrust = (s: GameState, u: Unit) =>
  (u.code === R.urdug || u.code === R.urdugEnemy) &&
  eredChapter(s) &&
  s.scenarioId === "roam-across-rhovanion"
    ? u.resources
    : 0;
/**
 * Misplaced Trust: "Forced: After you draw this card, attach it to a hero
 * you control."
 */
export function eredCampaignCardsDrawn(s: GameState, count: number) {
  if (!eredChapter(s) || count <= 0) return;
  const drawn = s.hand.slice(-count).filter((u) => u.code === ERED.misplaced);
  if (drawn.length)
    prepend(
      s,
      ...drawn.map((u) =>
        fx("emcMisplacedTrust", { source: u.id, player: activeSeat(s) }),
      ),
    );
}
/** Misplaced Trust (Condition): "Attached character cannot have player card attachments …" */
const misplacedHost = (u: Unit) =>
  u.attachments.some((a) => a.code === ERED.misplaced && !a.blanked);
/** A player card attachment (boons and treasures included). */
const playerAttachment = (code: string) =>
  card(code).type_code === "attachment" &&
  !["encounter", "burden"].includes(card(code).sphere_code ?? "");

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
  // A Tale of Victories: "The next time that hero would be dealt damage this
  // phase, cancel 3 of that damage."
  if (
    q?.tale &&
    value > 0 &&
    !context.cost &&
    q.tale.target === u.id &&
    q.tale.round === s.round &&
    q.tale.phase === s.phase
  ) {
    const n = Math.min(3, value);
    delete q.tale;
    log(
      s,
      `A Tale of Victories: ${n} of the damage dealt to ${name(u)} is canceled.`,
      "good",
    );
    value -= n;
  }
  if (!q?.shields?.length || value <= 0 || context.cost) return value;
  q.shields = q.shields.filter((x) => x.round === s.round);
  const mine = q.shields.filter((x) => x.target === u.id);
  if (!mine.length) return value;
  q.shields = q.shields.filter((x) => x.target !== u.id);
  const n = Math.min(value, mine.length);
  log(s, `Turayn: ${n} of the damage dealt to ${name(u)} is canceled.`, "good");
  return value - n;
}

// ------------------------------------------------------------- The King's Quest

const hasItem = (u: Unit) =>
  u.attachments.some((a) => !a.blanked && traitsOf(a.code).includes("Item"));
/** X on Dagnir's Spawn: the campaign card's part number. */
const spawnX = (s: GameState) => (eredChapter(s) ? eredPart(s.scenarioId) : 0);
/** Isolde's willpower (+2 with an Item attachment); Dagnir's Spawn's X defense. */
export function eredCampaignStats(s: GameState, u: Unit) {
  const r = { will: 0, attack: 0, defense: 0, health: 0 };
  if (u.code === ERED.isolde && !u.blanked && hasItem(u)) r.will += 2;
  if (u.code === ERED.spawn && !u.blanked) r.defense += spawnX(s);
  const trust = urdugTrust(s, u);
  r.will += trust;
  r.attack += trust;
  r.defense += trust;
  // Rhyme of the Slayer: "That enemy gets –4 [attack] until the end of the phase."
  if (
    s.eredCampaign?.rhyme?.some(
      (x) => x.target === u.id && x.round === s.round && x.phase === s.phase,
    )
  )
    r.attack -= 4;
  return r;
}
/**
 * Rhyme of the Slayer: "The hero with Dragon-slayer attached gets +4
 * [attack] while attacking that enemy this phase."
 */
export function eredCampaignPlayerAttackBonus(
  s: GameState,
  attacker: Unit,
  enemy: Unit,
) {
  return s.eredCampaign?.rhyme?.some(
    (x) => x.target === enemy.id && x.round === s.round && x.phase === s.phase,
  ) && attacker.attachments.some((a) => a.code === ERED.slayer && !a.blanked)
    ? 4
    : 0;
}
/** Dagnir's Spawn's X threat. */
export const eredCampaignThreatBonus = (s: GameState, u: Unit) =>
  (u.code === ERED.spawn && !u.blanked ? spawnX(s) : 0) + urdugTrust(s, u);
/**
 * Dagnir's Spawn: "Cannot have non-Dragon attachments." Misplaced Trust:
 * "Attached character cannot have player card attachments."
 */
export const eredCampaignCannotAttach = (target: Unit, code: string) =>
  (target.code === ERED.spawn &&
    !target.blanked &&
    !traitsOf(code).includes("Dragon")) ||
  (misplacedHost(target) && playerAttachment(code));
/**
 * Isolde: "Response: After you engage an enemy, ready Isolde." (It only
 * helps, so it is always used.)
 */
export function eredCampaignEnemyEngaged(s: GameState, _enemy: Unit) {
  if (!s.campaign) return;
  for (const u of s.allies)
    if (u.code === ERED.isolde && u.exhausted && !u.blanked) {
      readyCharacter(s, u);
      if (!u.exhausted)
        log(s, "Isolde readies after you engage an enemy.", "good");
    }
}
/**
 * The Threat to Wilderland: "Forced: At the beginning of the quest phase,
 * remove a resource from The Threat to Wilderland. Then, either raise each
 * player's threat by 2 or all encounter cards are immune to player card
 * effects until the end of the phase."
 */
export function eredCampaignQuestStart(s: GameState) {
  clearImmunity(s);
  for (const u of s.staging)
    if (u.code === ERED.threat && u.resources > 0 && !u.blanked)
      prepend(s, fx("emcThreatTick", { target: u.id, player: firstPlayer(s) }));
}
/** Encounter cards in play (the staging area, engaged enemies and active locations). */
const encounterCardsInPlay = (s: GameState) =>
  [
    ...s.staging,
    ...playerOrder(s).flatMap((p) => engagedWith(s, p)),
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].filter((u) => card(u.code).sphere_code !== "neutral");
/**
 * The Threat to Wilderland's lasting effect: the encounter cards it covers are
 * immune to player card effects until the quest phase ends (the attachment
 * text sync keeps their flags while it lasts).
 */
export function eredCampaignImmune(s: GameState, u: Unit) {
  const q = s.eredCampaign?.immune;
  // Misplaced Trust: "Attached character … is immune to player card effects."
  return (
    (!!q && q.round === s.round && q.ids.includes(u.id)) ||
    (isEredCampaign(s.campaign) && misplacedHost(u))
  );
}
/** The quest phase's immunity ends with the phase. */
function clearImmunity(s: GameState) {
  const q = s.eredCampaign;
  if (!q?.immune) return;
  delete q.immune;
  syncAttachmentText(s);
}
/** An encounter card entering play while The Threat to Wilderland's immunity lasts. */
export function eredCampaignCardEntered(s: GameState, u: Unit) {
  const q = s.eredCampaign;
  if (
    !q?.immune ||
    q.immune.round !== s.round ||
    !["quest", "staging"].includes(s.phase) ||
    u.immuneToPlayerEffects
  )
    return;
  u.immuneToPlayerEffects = true;
  q.immune.ids.push(u.id);
}
/**
 * Dagnir's Spawn: "When Revealed: Each player may distribute X damage among
 * characters they control. If they do, shuffle Dagnir's Spawn into the
 * encounter deck." (It is shuffled away when every player does.)
 */
function spawnRevealed(s: GameState, fromReveal: boolean) {
  if (!fromReveal) return false;
  const u = [...s.staging].reverse().find((x) => x.code === ERED.spawn);
  if (!u) return true;
  eredState(s).spawn = { id: u.id, accepted: [], asked: [] };
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("emcSpawnOffer", { target: u.id, player }),
    ),
    fx("emcSpawnResult", { target: u.id, player: firstPlayer(s) }),
  );
  return true;
}

// ------------------------------------------------------------- Melanwar

/**
 * Melanwar: "Response: After the travel phase begins, exhaust Melanwar to
 * place 1 progress on the active location. If you quested unsuccessfully this
 * round, place 3 progress on the active location instead."
 */
export function eredCampaignTravelBegin(s: GameState) {
  // The quest phase has ended: The Threat to Wilderland's immunity ends.
  clearImmunity(s);
  if (!s.campaign || !s.activeLocation) return;
  for (const u of allCharacters(s))
    if (u.code === ERED.melanwar && !u.exhausted && !u.blanked)
      prepend(s, fx("emcMelanwar", { source: u.id, player: ownerOf(s, u) }));
}
/** The players quested unsuccessfully this round (Melanwar's 3 progress). */
export function eredCampaignQuestFailed(s: GameState) {
  if (s.campaign?.kind === "ered") eredState(s).failedRound = s.round;
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

// ------------------------------------------------------------- The Withered Heath

/** The hero with this Accolade attached (its text not blank). */
const accoladeHero = (s: GameState, code: string) =>
  allHeroes(s).find((h) =>
    h.attachments.some((a) => a.code === code && !a.blanked),
  );
/**
 * Master of the Hunt and The Steadfast: "Response: After attached hero
 * commits to the quest, …" (The Steadfast only helps, so it is always used.)
 */
export function eredCampaignCommitted(s: GameState) {
  if (!s.campaign) return;
  for (const h of allHeroes(s)) {
    if (!h.committed) continue;
    const p = ownerOf(s, h);
    if (h.attachments.some((a) => a.code === ERED.hunt && !a.blanked))
      prepend(s, fx("emcHunt", { source: h.id, player: p }));
    if (
      h.attachments.some((a) => a.code === ERED.steadfast && !a.blanked) &&
      seatView(s, p).threat >= 40
    )
      prepend(s, fx("emcSteadfast", { source: h.id, player: p }));
  }
}
/**
 * Dragon-slayer: "Response: After a non-unique enemy is added to the staging
 * area, exhaust Dragon-slayer to engage that enemy. It makes an immediate
 * attack against you."
 */
export function eredCampaignEnemyStaged(s: GameState, enemy: Unit) {
  if (!s.campaign || card(enemy.code).is_unique || s.status !== "playing")
    return;
  for (const h of allHeroes(s))
    for (const a of h.attachments)
      if (a.code === ERED.slayer && !a.blanked && !a.exhausted)
        prepend(
          s,
          fx("emcSlayer", {
            target: enemy.id,
            source: a.id,
            player: ownerOf(s, h),
          }),
        );
}
const SONG_TIMING: Record<string, { phases: string[]; label: string }> = {
  [ERED.canny]: { phases: ["quest", "staging"], label: "a Quest Action" },
  [ERED.tale]: { phases: ["defense", "attack"], label: "a Combat Action" },
  [ERED.rhyme]: { phases: ["defense", "attack"], label: "a Combat Action" },
};
/** The Songs' timing (Lay of Courage answers a card revealed from the encounter deck). */
export function eredCampaignPlayProblem(s: GameState, u: Unit): string | null {
  if (u.code === ERED.lay)
    return "Lay of Courage is played when a card is revealed from the encounter deck during the quest phase.";
  const t = SONG_TIMING[u.code];
  if (t && !t.phases.includes(s.phase))
    return `${card(u.code).name} is ${t.label}.`;
  return null;
}
/** The Songs' effects. */
export function eredCampaignPlayerEvent(s: GameState, code: string): boolean {
  const p = activeSeat(s);
  if (code === ERED.lay) return true; // its effects follow its Response window
  if (code === ERED.canny) {
    prepend(s, fx("emcCannyTake", { player: p }));
    return true;
  }
  if (code === ERED.tale) {
    // "Draw a card for each enemy engaged with you. Heal 3 damage from the
    // hero with Unbroken attached. The next time that hero would be dealt
    // damage this phase, cancel 3 of that damage."
    const n = engagedWith(s, p).length;
    if (n) draw(s, n);
    const hero = accoladeHero(s, ERED.unbroken);
    if (hero) {
      prepend(s, fx("heal", { target: hero.id, value: 3, player: p }));
      eredState(s).tale = { target: hero.id, round: s.round, phase: s.phase };
    }
    log(
      s,
      `A Tale of Victories: ${n} ${n === 1 ? "card is" : "cards are"} drawn${hero ? `; ${name(hero)} heals 3 damage and cancels 3 of the next damage dealt to it this phase` : ""}.`,
      "good",
    );
    return true;
  }
  if (code === ERED.rhyme) {
    const enemies = [
      ...s.staging,
      ...playerOrder(s).flatMap((x) => engagedWith(s, x)),
    ].filter((u) => card(u.code).type_code === "enemy");
    if (enemies.length)
      choose(
        s,
        `Rhyme of the Slayer · Choose an enemy${seatLabel(s, p)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("emcRhyme", { target: u.id, player: p })],
        })),
        card(ERED.rhyme).text,
      );
    return true;
  }
  return false;
}
/**
 * Lay of Courage: "Quest Response: Cancel the 'when revealed' effects of a
 * card that was just revealed from the encounter deck. Ready the hero with The
 * Steadfast attached. Add Lay of Courage to the victory display."
 */
export function eredLayOfCourageOptions(
  s: GameState,
  continuation: Effect,
): Option[] {
  if (!s.campaign || !["quest", "staging"].includes(s.phase)) return [];
  return playerOrder(s).flatMap((player) => {
    const lay = seatView(s, player).hand.find((u) => u.code === ERED.lay);
    if (!lay) return [];
    return [
      {
        id: s.table ? `lay-${player}` : "lay",
        label: `Play Lay of Courage${s.table ? ` · ${seatName(s, player)}` : ""}`,
        code: ERED.lay,
        ability: {
          player,
          source: lay.id,
          code: ERED.lay,
          type: "response" as const,
        },
        effects: [
          fx("eventPlay", {
            code: ERED.lay,
            source: lay.id,
            player,
            effects: [
              fx("afterPlayerAbility", {
                effects: [{ ...continuation, flag: true }],
              }),
            ],
            cancelledEffects: [continuation],
          }),
        ],
      },
    ];
  });
}
/** Lay of Courage: the Steadfast hero readies; the event goes to the victory display. */
export function eredCampaignEventPlayed(s: GameState, u: Unit) {
  if (u.code !== ERED.lay) return;
  putPlayedEventInVictory(s, u.code);
  const hero = accoladeHero(s, ERED.steadfast);
  if (hero?.exhausted) readyCharacter(s, hero);
  log(
    s,
    `Lay of Courage is added to the victory display${hero ? `, and ${name(hero)} readies` : ""}.`,
    "good",
  );
}

// ------------------------------------------------------------- abilities

const ABILITY: Record<string, string> = {
  [ERED.anvil]: "Exhaust Anvil of Gundabad · Play an Item attachment (−1 cost)",
  [ERED.crown]:
    "Exhaust Dwarf-Lord's Crown · Allies sharing a Trait get +1 each",
  [ERED.jewels]: "Exhaust Jewels of Wilderland · Discard a card to draw a card",
  [ERED.unbroken]: "Unbroken · Discard a card to heal 1 damage from this hero",
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
  // Unbroken: "This ability may be triggered by each player once each round."
  if (a.code === ERED.unbroken) {
    if (s.phase === "setup") return "Continue to the next action window.";
    if (s.choice || s.flow?.pending) return "Resolve the current choice first.";
    if (u.damage <= 0) return "The attached hero has no damage to heal.";
    if (!s.hand.length) return "Discard a card from your hand to use Unbroken.";
    if (
      s.eredCampaign?.unbroken?.some(
        (x) => x.player === activeSeat(s) && x.round === s.round,
      )
    )
      return "Each player may trigger Unbroken once each round.";
    return null;
  }
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
  if (a.code === ERED.unbroken) {
    // Cost: discard a card from your hand.
    choose(
      s,
      `Unbroken · Discard a card from your hand to heal 1 damage from ${name(u)}${seatLabel(s, p)}`,
      s.hand.map((h) => ({
        id: h.id,
        code: h.code,
        label: name(h),
        effects: [fx("emcUnbroken", { source: u.id, target: h.id, player: p })],
      })),
      card(ERED.unbroken).text,
    );
    return true;
  }
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
    case "emcCunningDamage": {
      // Urdug's Cunning: "each player must deal 1 damage to a character they
      // control" for each enemy discarded.
      const left = e.value ?? 0;
      const own = allCharacters(s).filter((u) => ownerOf(s, u) === p);
      if (left <= 0 || !own.length) return true;
      choose(
        s,
        `Urdug's Cunning · Deal 1 damage to a character you control (${left} left)${several(s) ? ` · ${seatName(s, p)}` : ""}`,
        own.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Deal 1 damage to ${name(u)}`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("emcCunningDamage", { player: p, value: left - 1 }),
          ],
        })),
      );
      return true;
    }
    case "emcMisplacedTrust": {
      // "Forced: After you draw this card, attach it to a hero you control."
      const u = seatView(s, p).hand.find((x) => x.id === e.source);
      if (!u) return true;
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) {
        forOwner(s, p, () => {
          s.hand = s.hand.filter((x) => x.id !== u.id);
          s.discard.push(u.code);
        });
        log(s, "Misplaced Trust has no hero to attach to and is discarded.");
        return true;
      }
      choose(
        s,
        `Misplaced Trust · Attach it to a hero you control${several(s) ? ` · ${seatName(s, p)}` : ""}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("emcMisplacedAttach", { source: u.id, target: h.id, player: p }),
          ],
        })),
        card(ERED.misplaced).text,
      );
      return true;
    }
    case "emcMisplacedAttach": {
      const h = get(s, e.target);
      const u = seatView(s, p).hand.find((x) => x.id === e.source);
      if (!h || !u) return true;
      forOwner(s, p, () => {
        s.hand = s.hand.filter((x) => x.id !== u.id);
      });
      h.attachments.push({
        id: u.id,
        code: u.code,
        exhausted: false,
        owner: p,
      });
      log(
        s,
        `Misplaced Trust is attached to ${name(h)}: it cannot have player card attachments and is immune to player card effects.`,
        "danger",
      );
      // Its player card attachments are discarded (a Permanent card stays
      // with its hero).
      for (const a of h.attachments.filter(
        (a) =>
          a.id !== u.id &&
          playerAttachment(a.code) &&
          !card(a.code).text?.includes("Permanent"),
      ))
        discardAttachment(s, h, a);
      syncAttachmentText(s);
      return true;
    }
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
    case "emcThreatTick": {
      const u = get(s, e.target);
      if (!u || u.resources <= 0) return true;
      u.resources--;
      log(
        s,
        `The Threat to Wilderland: a resource is removed (${u.resources} left).`,
        "danger",
      );
      choose(
        s,
        `The Threat to Wilderland · Raise each player's threat by 2, or all encounter cards are immune to player card effects this phase${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            code: ERED.threat,
            label: "Raise each player's threat by 2",
            effects: [fx("emcThreatRaise", { player: p })],
          },
          {
            id: "immune",
            code: ERED.threat,
            label: "Encounter cards are immune to player card effects",
            effects: [fx("emcThreatImmune", { player: p })],
          },
        ],
        card(ERED.threat).text,
      );
      return true;
    }
    case "emcThreatRaise":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        "The Threat to Wilderland: each player raises their threat by 2.",
        "danger",
      );
      return true;
    case "emcThreatImmune": {
      const ids: string[] = [];
      for (const u of encounterCardsInPlay(s))
        if (!u.immuneToPlayerEffects) {
          u.immuneToPlayerEffects = true;
          ids.push(u.id);
        }
      q.immune = { ids, round: s.round };
      log(
        s,
        "The Threat to Wilderland: all encounter cards are immune to player card effects until the end of the quest phase.",
        "danger",
      );
      return true;
    }
    case "emcSpawnOffer": {
      const spawn = get(s, e.target);
      const own = ownCharacters(s, p);
      const x = spawnX(s);
      if (!spawn || !own.length || x <= 0) return true;
      (q.spawn ??= { id: spawn.id, accepted: [], asked: [] }).asked.push(p);
      choose(
        s,
        `Dagnir's Spawn · Distribute ${x} damage among characters you control to shuffle it into the encounter deck?${seatLabel(s, p)}`,
        [
          {
            id: "accept",
            code: ERED.spawn,
            label: `Distribute ${x} damage`,
            effects: [
              fx("emcSpawnAccept", { target: spawn.id, player: p }),
              fx("emcSpawnDamage", { target: spawn.id, value: x, player: p }),
            ],
          },
          decline("Take no damage"),
        ],
        card(ERED.spawn).text,
      );
      return true;
    }
    case "emcSpawnAccept":
      if (q.spawn && !q.spawn.accepted.includes(p)) q.spawn.accepted.push(p);
      return true;
    case "emcSpawnDamage": {
      const left = e.value ?? 0;
      const own = ownCharacters(s, p);
      if (left <= 0 || !own.length) return true;
      choose(
        s,
        `Dagnir's Spawn · Deal 1 damage to a character you control (${left} left)${seatLabel(s, p)}`,
        own.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("emcSpawnDamage", {
              target: e.target,
              value: left - 1,
              player: p,
            }),
          ],
        })),
        card(ERED.spawn).text,
      );
      return true;
    }
    case "emcSpawnResult": {
      const spawn = get(s, e.target);
      const r = q.spawn;
      delete q.spawn;
      const all = playerOrder(s);
      if (
        spawn &&
        r &&
        all.length &&
        all.every((player) => r.accepted.includes(player)) &&
        s.staging.some((u) => u.id === spawn.id)
      ) {
        s.staging = s.staging.filter((u) => u.id !== spawn.id);
        s.encounterDeck.push(spawn.code);
        shuffle(s, s.encounterDeck);
        log(s, "Dagnir's Spawn is shuffled into the encounter deck.", "good");
      }
      return true;
    }
    case "emcMelanwar": {
      const melanwar = get(s, e.source);
      const location = s.activeLocation;
      if (!melanwar || melanwar.exhausted || !location) return true;
      const n = q.failedRound === s.round ? 3 : 1;
      choose(
        s,
        `Melanwar · Exhaust him to place ${n} progress on ${name(location)}?${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: ERED.melanwar,
            label: `Exhaust Melanwar · ${n} progress`,
            effects: [
              fx("emcMelanwarProgress", {
                source: melanwar.id,
                target: location.id,
                value: n,
                player: p,
              }),
            ],
          },
          decline("Do not use Melanwar's Response"),
        ],
        card(ERED.melanwar).text,
      );
      return true;
    }
    case "emcMelanwarProgress": {
      const melanwar = get(s, e.source);
      if (!melanwar || !exhaustCharacter(s, melanwar)) return true;
      log(
        s,
        `Melanwar places ${e.value} progress on the active location.`,
        "good",
      );
      prepend(
        s,
        fx("locationProgress", {
          target: e.target,
          value: e.value ?? 1,
          player: p,
        }),
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
    case "emcHunt": {
      // Master of the Hunt: "choose a player to look at the top 3 cards of
      // their deck".
      const seats = playerOrder(s).filter((x) => seatView(s, x).deck.length);
      if (!seats.length) return true;
      choose(
        s,
        `Master of the Hunt · Choose a player to look at the top 3 cards of their deck${seatLabel(s, p)}`,
        [
          ...seats.map((x) => ({
            id: String(x),
            label: several(s) ? seatName(s, x) : "Your deck",
            effects: [fx("emcHuntLook", { player: x })],
          })),
          decline(),
        ],
        card(ERED.hunt).text,
      );
      return true;
    }
    case "emcHuntLook": {
      const top = seatView(s, p).deck.slice(0, 3);
      if (!top.length) return true;
      choose(
        s,
        `Master of the Hunt · Put 1 of these cards on top of your deck${seatLabel(s, p)}`,
        top.map((code, i) => ({
          id: String(i),
          code,
          label: `Keep ${card(code).name} on top`,
          effects: [fx("emcHuntTop", { value: i, player: p })],
        })),
      );
      return true;
    }
    case "emcHuntTop":
      forOwner(s, p, () => {
        const top = s.deck.splice(0, Math.min(3, s.deck.length));
        const [kept] = top.splice(e.value ?? 0, 1);
        // The rest go to the bottom (the next choice orders two of them).
        s.deck.unshift(kept);
        s.deck.push(...top);
        log(
          s,
          `Master of the Hunt: 1 card stays on top of the deck and ${top.length} ${top.length === 1 ? "goes" : "go"} to the bottom.`,
          "good",
        );
        if (top.length === 2)
          choose(
            s,
            `Master of the Hunt · Choose the card at the very bottom of your deck${seatLabel(s, p)}`,
            top.map((code, i) => ({
              id: String(i),
              code,
              label: card(code).name,
              effects: [fx("emcHuntBottom", { value: i, player: p })],
            })),
          );
      });
      return true;
    case "emcHuntBottom":
      forOwner(s, p, () => {
        if (s.deck.length < 2 || (e.value ?? 1) !== 0) return;
        const n = s.deck.length;
        [s.deck[n - 2], s.deck[n - 1]] = [s.deck[n - 1], s.deck[n - 2]];
      });
      return true;
    case "emcSteadfast": {
      const hero = get(s, e.source);
      if (!hero || seatView(s, p).threat < 40) return true;
      addCurrentQuestProgress(s, 1);
      log(
        s,
        `The Steadfast: ${name(hero)} commits with your threat at 40 or higher, placing 1 progress on the current quest.`,
        "good",
      );
      return true;
    }
    case "emcUnbroken":
      forOwner(s, p, () => {
        if (!s.hand.some((h) => h.id === e.target)) return;
        discardHandCard(s, e.target!);
      });
      q.unbroken = [
        ...(q.unbroken ?? []).filter((x) => x.round === s.round),
        { player: p, round: s.round },
      ];
      prepend(s, fx("heal", { target: e.source, value: 1, player: p }));
      log(s, "Unbroken: a card is discarded to heal 1 damage.", "good");
      return true;
    case "emcSlayer": {
      const enemy = get(s, e.target);
      const found = findAttachment(s, e.source);
      if (!enemy || !found || found.a.exhausted) return true;
      if (!s.staging.some((u) => u.id === enemy.id)) return true;
      choose(
        s,
        `Dragon-slayer · Exhaust it to engage ${name(enemy)} (it makes an immediate attack against you)?${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: ERED.slayer,
            label: `Engage ${name(enemy)}`,
            effects: [
              fx("emcSlayerUse", {
                target: enemy.id,
                source: found.a.id,
                player: p,
              }),
            ],
          },
          decline(),
        ],
        card(ERED.slayer).text,
      );
      return true;
    }
    case "emcSlayerUse": {
      const enemy = get(s, e.target);
      const found = findAttachment(s, e.source);
      if (!enemy || !found || found.a.exhausted) return true;
      found.a.exhausted = true;
      if (!s.staging.some((u) => u.id === enemy.id)) return true;
      forOwner(s, p, () => engage(s, enemy));
      prepend(s, fx("immediateAttack", { target: enemy.id, player: p }));
      return true;
    }
    case "emcCannyTake": {
      // The Canny Huntsman: the top 5 cards of the encounter deck are looked at.
      const looked = s.encounterDeck.splice(0, 5);
      q.canny = { top: [], bottom: [], left: looked };
      prepend(s, fx("emcCannyPlace", { player: p }));
      const hunt = accoladeHero(s, ERED.hunt);
      if (hunt) {
        hunt.tempWill = (hunt.tempWill ?? 0) + 3;
        log(
          s,
          `The Canny Huntsman: ${name(hunt)} gets +3 willpower until the end of the phase.`,
          "good",
        );
      }
      return true;
    }
    case "emcCannyPlace": {
      const c = q.canny;
      if (!c) return true;
      if (!c.left.length) {
        s.encounterDeck = [...c.top, ...s.encounterDeck, ...c.bottom];
        log(
          s,
          `The Canny Huntsman: ${c.top.length} ${c.top.length === 1 ? "card goes" : "cards go"} back on top of the encounter deck and ${c.bottom.length} to the bottom.`,
          "good",
        );
        delete q.canny;
        return true;
      }
      choose(
        s,
        `The Canny Huntsman · Place the looked-at encounter cards (${c.left.length} left; the first put on top is the topmost)${seatLabel(s, p)}`,
        c.left.flatMap((code, i) => [
          {
            id: `top:${i}`,
            code,
            label: `${card(code).name} · next on top`,
            effects: [fx("emcCannyPut", { value: i, text: "top", player: p })],
          },
          {
            id: `bottom:${i}`,
            code,
            label: `${card(code).name} · on the bottom`,
            effects: [
              fx("emcCannyPut", { value: i, text: "bottom", player: p }),
            ],
          },
        ]),
      );
      return true;
    }
    case "emcCannyPut": {
      const c = q.canny;
      if (!c) return true;
      const [code] = c.left.splice(e.value ?? 0, 1);
      if (code) (e.text === "top" ? c.top : c.bottom).push(code);
      prepend(s, fx("emcCannyPlace", { player: p }));
      return true;
    }
    case "emcRhyme": {
      const enemy = get(s, e.target);
      if (!enemy) return true;
      q.rhyme = [
        ...(q.rhyme ?? []).filter(
          (x) => x.round === s.round && x.phase === s.phase,
        ),
        { target: enemy.id, round: s.round, phase: s.phase },
      ];
      log(
        s,
        `Rhyme of the Slayer: ${name(enemy)} gets −4 attack until the end of the phase.`,
        "good",
      );
      return true;
    }
  }
  return false;
}
