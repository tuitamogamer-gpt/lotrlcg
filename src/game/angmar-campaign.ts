// The Angmar Awakened campaign (its Campaign Expansion): the Campaign Log,
// the Campaign Pool and each scenario's campaign card.
import type {
  CampaignState,
  Effect,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  RuleError,
  shuffle,
  stats,
} from "./core";
import {
  activeSeat,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { canPlay, playHandCard, playTargets, score } from "./actions";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import { check, damage, readyCharacter } from "./board";
import { applyCombatDamageConsequences } from "./combat";
import {
  DIKE_DISCARD_REASON,
  dikeCannotLeaveDiscard,
} from "./deadmens-discard";
import { angmarPhase } from "./angmar-campaign-boost";

/** The campaign's cards. */
export const ANGMAR = {
  chetwoodCard: "octgn:81f744b1-aa0e-4326-bd18-d701390141bf",
  weatherCard: "octgn:b8c49f35-4f52-48eb-ae3f-456b7daea4a7",
  dikeCard: "octgn:0f039a53-c92a-4ac0-b7db-c1506d7b96e5",
  wastesCard: "octgn:cb628fb0-b66a-49b0-8063-12dd39f564ce",
  gramCard: "octgn:85afcf03-9776-4f05-b9c0-346e6e39b1b1",
  ettenCard: "octgn:cf9443b5-735d-4c8f-bd88-8643345f9632",
  rhudaurCard: "octgn:d060f58b-3067-43c0-a480-d55c68c33305",
  carnCard: "octgn:e7020edb-aebd-44c2-8c5a-37fc744b7b9f",
  dreadCard: "octgn:64a91e39-51e9-42d4-9445-d8bbaca95314",
  /** Iârion's Pendant (boon attachment). */
  pendant: "10157",
  /** Protect the Innocent (side quest), Arnor Ravaged on its other side. */
  innocent: "10158",
  /** Mysterious Omens (side quest). */
  omens: "10160",
  /** The Permanent boons Mysterious Omens offers. */
  cunning: "10161",
  hardy: "10162",
  resolute: "10163",
  ruthless: "10164",
  stalwart: "10165",
} as const;
/** Cunning, Hardy, Resolute, Ruthless and Stalwart (Permanent Condition boons). */
export const SKILL_BOONS: readonly string[] = [
  ANGMAR.cunning,
  ANGMAR.hardy,
  ANGMAR.resolute,
  ANGMAR.ruthless,
  ANGMAR.stalwart,
];
/** The campaign's nine chapters in order. */
export const ANGMAR_CAMPAIGN_ORDER: readonly ScenarioId[] = [
  "intruders-in-chetwood",
  "the-weather-hills",
  "deadmens-dike",
  "wastes-of-eriador",
  "escape-from-mount-gram",
  "across-the-ettenmoors",
  "the-treachery-of-rhudaur",
  "the-battle-of-carn-dum",
  "the-dread-realm",
];
/** The chapters whose campaign cards are scripted so far. */
export const ANGMAR_CAMPAIGN_SUPPORTED: readonly ScenarioId[] = [
  "intruders-in-chetwood",
  "the-weather-hills",
];
/** Each chapter's campaign card. */
export const ANGMAR_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> = {
  "intruders-in-chetwood": ANGMAR.chetwoodCard,
  "the-weather-hills": ANGMAR.weatherCard,
  "deadmens-dike": ANGMAR.dikeCard,
  "wastes-of-eriador": ANGMAR.wastesCard,
  "escape-from-mount-gram": ANGMAR.gramCard,
  "across-the-ettenmoors": ANGMAR.ettenCard,
  "the-treachery-of-rhudaur": ANGMAR.rhudaurCard,
  "the-battle-of-carn-dum": ANGMAR.carnCard,
  "the-dread-realm": ANGMAR.dreadCard,
};
export const isAngmarCampaign = (c?: CampaignState | null) =>
  c?.kind === "angmar";
/** A new Angmar Awakened campaign: the heroes are recorded at its start. */
export function newAngmarCampaign(
  heroes: string[],
  seatHeroes?: number[],
): CampaignState {
  return {
    kind: "angmar",
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: [],
    mendorSaved: false,
    resolution: null,
    ...(seatHeroes && seatHeroes.length > 1 ? { seatHeroes } : {}),
  };
}
/** The chapter the campaign continues with, or undefined once it is complete. */
export const nextAngmarChapter = (
  c: Pick<CampaignState, "completed">,
): ScenarioId | undefined => ANGMAR_CAMPAIGN_ORDER[c.completed.length];
export const angmarChapterSupported = (id?: ScenarioId) =>
  !!id && ANGMAR_CAMPAIGN_SUPPORTED.includes(id);
/**
 * "When playing campaign mode, the Amarthiúl hero cannot be used until
 * indicated by a campaign card" (The Battle of Carn Dûm's).
 */
export const angmarForbiddenTitle = (id: ScenarioId) =>
  ANGMAR_CAMPAIGN_ORDER.indexOf(id) <
  ANGMAR_CAMPAIGN_ORDER.indexOf("the-battle-of-carn-dum")
    ? "Amarthiúl"
    : undefined;
/** Has the current chapter been recorded in the Campaign Log? */
export const angmarChapterComplete = (s: GameState) =>
  isAngmarCampaign(s.campaign) &&
  s.campaign!.completed.at(-1)?.scenarioId === s.scenarioId;

const first = (s: GameState) => s.table?.first ?? 0;
const state = (s: GameState) => (s.angmarCards ??= {});
/** Several players share the table (one seat reads "you"). */
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const who = (s: GameState, p: number) => (several(s) ? seatName(s, p) : "you");
/** Protect the Innocent (or Arnor Ravaged) in the staging area. */
export const angmarInnocent = (s: GameState): Unit | undefined =>
  s.staging.find(
    (u) =>
      u.code === ANGMAR.innocent &&
      (!s.angmarCards?.innocent || u.id === s.angmarCards.innocent),
  );
/** "If Protect the Innocent has 10 or more damage on it (20 or more damage if there are 3 or 4 players in the game), the players lose the game." */
export const innocentLimit = (s: GameState) =>
  (s.table?.seats.length ?? 1) >= 3 ? 20 : 10;

/** The campaign card's Setup, after the scenario's own setup. */
export function angmarCampaignSetup(s: GameState) {
  const c = s.campaign;
  if (!isAngmarCampaign(c)) return;
  const code = ANGMAR_CAMPAIGN_CARDS[s.scenarioId];
  log(
    s,
    `${code ? card(code).name : "Angmar Awakened"} · The Angmar Awakened campaign.`,
  );
  // The Permanent boons recorded in the Campaign Log return to their heroes
  // ("Setup: Attach to a hero"); Cunning adds 2 resources to that hero's pool.
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      for (const h of s.heroes)
        for (const code of c!.permanent[h.code] ?? []) {
          if (h.attachments.some((a) => a.code === code)) continue;
          h.attachments.push({
            id: `a${s.nextId++}`,
            code,
            exhausted: false,
            owner: p,
          });
          if (code === ANGMAR.cunning) h.resources += 2;
        }
    });
  // The Weather Hills' campaign card adds Mysterious Omens to the Campaign
  // Log; while it stays in the Campaign Pool it is shuffled into each later
  // encounter deck.
  if (
    s.scenarioId === "the-weather-hills" &&
    !c!.burdens.includes(ANGMAR.omens)
  )
    c!.burdens.push(ANGMAR.omens);
  if (c!.burdens.includes(ANGMAR.omens)) {
    s.encounterDeck.push(ANGMAR.omens);
    shuffle(s, s.encounterDeck);
  }
  // The Weather Hills: "Add the Protect the Innocent side quest to the
  // staging area and place damage on it equal to the amount of damage noted
  // for it in the Campaign Log."
  if (s.scenarioId === "the-weather-hills") {
    const quest = make(s, ANGMAR.innocent);
    quest.damage = c!.innocent ?? 0;
    s.staging.push(quest);
    state(s).innocent = quest.id;
  }
  if (s.scenarioId === "intruders-in-chetwood") {
    // "Add the Protect the Innocent side quest to the staging area. Starting
    // with the first player, each player may place 4 damage on Protect the
    // Innocent to add 1 resource to each of their heroes' resource pools."
    // (Iârion's Pendant waits for Iârion, who enters play with the
    // scenario's setup.)
    const quest = make(s, ANGMAR.innocent);
    s.staging.push(quest);
    state(s).innocent = quest.id;
    for (const player of playerOrder(s))
      enqueue(s, fx("angmarInnocentResources", { player }));
  }
}
/** Mysterious Omens: "Forced: After Mysterious Omens becomes the current quest, each player discards 1 random card from their hand." */
export function angmarCampaignSideChosen(s: GameState, quest: Unit) {
  if (
    !isAngmarCampaign(s.campaign) ||
    quest.code !== ANGMAR.omens ||
    quest.blanked
  )
    return;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("angmarOmensDiscard", { player })),
  );
}
/**
 * Mysterious Omens: "Forced: When Mysterious Omens is defeated, remove it
 * from the Campaign Pool. Then, each player may choose 1 of the following
 * boons and attach it to a hero they control: Cunning, Hardy, Resolute,
 * Ruthless, or Stalwart." The Campaign Log changes once the chapter is won.
 */
export function angmarCampaignSideDefeated(s: GameState, quest: Unit) {
  if (!isAngmarCampaign(s.campaign) || quest.code !== ANGMAR.omens) return;
  state(s).omens = true;
  log(
    s,
    "Mysterious Omens is defeated: it leaves the Campaign Pool once this chapter is won.",
    "good",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("angmarSkillChoice", { player })),
  );
}
/** The Permanent boons still available to Mysterious Omens. */
const freeSkills = (s: GameState) =>
  SKILL_BOONS.filter(
    (code) =>
      !s.campaign!.boons.includes(code) &&
      !(s.angmarCards?.skills ?? []).some((x) => x.code === code),
  );
/** A campaign boon's once-per-game ability has been used. */
const spent = (s: GameState, id: string) =>
  (s.angmarCards?.spent ?? []).includes(id);
/** The campaign boons' Actions. */
export const angmarCampaignAbilityLabel = (code: string) =>
  code === ANGMAR.cunning
    ? "Cunning · Attached hero gets +2 willpower, +2 attack and +2 defense until the end of the phase (once per game)"
    : code === ANGMAR.hardy
      ? "Hardy · Ready attached hero (once per game)"
      : code === ANGMAR.ruthless
        ? "Ruthless · Move damage from attached hero to an enemy engaged with you (once per game)"
        : code === ANGMAR.stalwart
          ? "Stalwart · Play an attachment from your discard pile on attached hero (once per game)"
          : undefined;
/** Attachments in a player's discard pile that Stalwart can play on its hero. */
function stalwartChoices(s: GameState, hero: Unit, p: number) {
  return [...new Set(seatView(s, p).discard)].filter((code) => {
    if (card(code).type_code !== "attachment") return false;
    // Probe a copy of the game, as if the card were in the hand.
    const t = structuredClone(s);
    let ok = false;
    forOwner(t, p, () => {
      const probe = make(t, code);
      probe.owner = p;
      t.hand.push(probe);
      try {
        ok =
          !canPlay(t, probe, { playOrigin: "discard" }) &&
          playTargets(t, probe).some((x) => x.id === hero.id);
      } catch {
        ok = false;
      }
    });
    return ok;
  });
}
export function angmarCampaignAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !angmarCampaignAbilityLabel(a.code))
    return "No campaign card ability.";
  if (a.blanked) return `${card(a.code).name}'s text is blank.`;
  const p = activeSeat(s);
  if (ownerOf(s, u) !== p)
    return `${card(a.code).name} belongs to another player.`;
  if (spent(s, a.id)) return `${card(a.code).name} was used this game.`;
  if (a.code === ANGMAR.hardy) {
    if (!u.exhausted) return `${name(u)} is already ready.`;
    if (cannotReady(u, s)) return `${name(u)} cannot ready.`;
  }
  if (a.code === ANGMAR.ruthless) {
    if (!u.damage) return `${name(u)} has no damage to move.`;
    if (!seatView(s, p).engaged.some(isEnemyUnit))
      return "No enemy is engaged with you.";
  }
  if (a.code === ANGMAR.stalwart) {
    if (s.phase !== "planning") return "This is a Planning Action.";
    if (dikeCannotLeaveDiscard(s)) return DIKE_DISCARD_REASON;
    if (!stalwartChoices(s, u, p).length)
      return "No attachment in your discard pile can be played on this hero.";
  }
  return null;
}
const isEnemyUnit = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code);
export function angmarCampaignAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !angmarCampaignAbilityLabel(a.code)) return false;
  const problem = angmarCampaignAbilityProblem(s, u, attachmentId);
  if (problem) throw new RuleError(problem);
  const p = activeSeat(s);
  (state(s).spent ??= []).push(a.id);
  if (a.code === ANGMAR.cunning) {
    (state(s).boosts ??= []).push({
      target: u.id,
      phase: angmarPhase(s.phase),
      round: s.round,
    });
    log(
      s,
      `Cunning: ${name(u)} gets +2 willpower, +2 attack and +2 defense until the end of the phase.`,
      "good",
    );
  } else if (a.code === ANGMAR.hardy) {
    readyCharacter(s, u);
    log(s, `Hardy: ${name(u)} readies.`, "good");
  } else if (a.code === ANGMAR.ruthless) {
    choose(
      s,
      "Ruthless · Choose an enemy engaged with you",
      seatView(s, p)
        .engaged.filter(isEnemyUnit)
        .map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: name(enemy),
          effects: [
            fx("angmarRuthlessAmount", {
              source: u.id,
              target: enemy.id,
              player: p,
            }),
          ],
        })),
      card(ANGMAR.ruthless).text,
    );
  } else if (a.code === ANGMAR.stalwart) {
    choose(
      s,
      "Stalwart · Play an attachment from your discard pile",
      stalwartChoices(s, u, p).map((code) => ({
        id: code,
        code,
        label: `${card(code).name} (cost ${card(code).cost ?? 0})`,
        effects: [fx("angmarStalwartPlay", { code, target: u.id, player: p })],
      })),
      card(ANGMAR.stalwart).text,
    );
  }
  return true;
}
/** Resolute: "Response: Cancel up to 2 points of damage just dealt to attached hero. (Limit once per game.)" */
export function angmarOfferResolute(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    !isAngmarCampaign(s.campaign) ||
    context.bypassResolute ||
    context.cost ||
    value <= 0
  )
    return false;
  const a = u.attachments.find(
    (x) => x.code === ANGMAR.resolute && !x.blanked && !spent(s, x.id),
  );
  if (!a) return false;
  prepend(
    s,
    fx("angmarResoluteWindow", {
      target: u.id,
      source: a.id,
      value,
      text: encodeDamageContext(context),
      player: ownerOf(s, u),
    }),
  );
  return true;
}
/** Iârion enters play: the campaign card attaches Iârion's Pendant to him. */
export function angmarIarionEntered(s: GameState, iarion: Unit) {
  if (
    !isAngmarCampaign(s.campaign) ||
    !["intruders-in-chetwood", "deadmens-dike"].includes(s.scenarioId)
  )
    return;
  prepend(s, fx("angmarPendantAttach", { target: iarion.id }));
}

/** Protect the Innocent's Forced effect and Arnor Ravaged's, after an attack damages a character. */
export function angmarCampaignDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (!isAngmarCampaign(s.campaign) || value <= 0 || !context.combatDamage)
    return;
  const quest = angmarInnocent(s);
  if (!quest || quest.blanked) return;
  quest.damage += 1;
  log(
    s,
    `Protect the Innocent: an attack damaged ${name(u)}; 1 damage is placed on it (${quest.damage} in all).`,
    "danger",
  );
  angmarInnocentCheck(s);
}
/** The players lose with 10 (or 20) damage on Protect the Innocent. */
export function angmarInnocentCheck(s: GameState) {
  const quest = angmarInnocent(s);
  if (!quest || s.status !== "playing" || quest.damage < innocentLimit(s))
    return;
  s.status = "lost";
  s.reason = `Protect the Innocent has ${quest.damage} damage on it: the players lose the game.`;
  s.choice = null;
  s.queue = [];
}
/** "When progress would be placed on Protect the Innocent, remove that much damage from it instead." */
export function angmarInnocentProgress(
  s: GameState,
  quest: Unit,
  amount: number,
) {
  if (quest.code !== ANGMAR.innocent || !isAngmarCampaign(s.campaign))
    return false;
  const removed = Math.min(quest.damage, amount);
  quest.damage -= removed;
  log(
    s,
    `Protect the Innocent: ${amount} progress would be placed on it; ${removed} damage is removed instead (${quest.damage} left).`,
    "good",
  );
  return true;
}
/** Protect the Innocent's quest points are "–": progress never defeats it. */
export const angmarSideDefeatBlocked = (s: GameState, quest: Unit) =>
  quest.code === ANGMAR.innocent && isAngmarCampaign(s.campaign);

/** Iârion's Pendant: the Response that cancels a revealed card's "when revealed" effects. */
export function angmarPendantRevealOptions(
  s: GameState,
  continuation: Effect,
): Option[] {
  return pendants(s).map(({ host, a, player }) => ({
    id: `pendant-${a.id}`,
    label: `Add Iârion's Pendant to the victory display to cancel the "when revealed" effects${several(s) ? ` · ${seatName(s, player)}` : ""}`,
    code: ANGMAR.pendant,
    ability: { player, source: a.id, code: ANGMAR.pendant, type: "response" },
    effects: [
      fx("angmarPendantSpend", { target: host.id, source: a.id, player }),
      { ...continuation, flag: true },
    ],
  }));
}
/** Iârion's Pendant: the Response that cancels a shadow effect just triggered. */
export function angmarPendantShadowOptions(
  s: GameState,
  effectiveShadow: boolean,
): Option[] {
  if (!effectiveShadow) return [];
  return pendants(s).map(({ host, a, player }) => ({
    id: `pendant-${a.id}`,
    label: `Add Iârion's Pendant to the victory display to cancel the shadow effect${several(s) ? ` · ${seatName(s, player)}` : ""}`,
    code: ANGMAR.pendant,
    ability: { player, source: a.id, code: ANGMAR.pendant, type: "response" },
    effects: [
      fx("angmarPendantSpend", { target: host.id, source: a.id, player }),
    ],
  }));
}
/** Each Iârion's Pendant in play, with its host and its controller. */
function pendants(s: GameState) {
  if (!isAngmarCampaign(s.campaign)) return [];
  return seatIndices(s).flatMap((player) =>
    [...seatView(s, player).heroes, ...seatView(s, player).allies].flatMap(
      (host) =>
        host.attachments
          .filter((a) => a.code === ANGMAR.pendant && !a.blanked)
          .map((a) => ({ host, a, player })),
    ),
  );
}

/** The campaign card's Resolution, once the chapter is won. */
export function resolveAngmarCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  // A hero in its controller's discard pile is a fallen hero.
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) {
    const lost = c.permanent[code] ?? [];
    delete c.permanent[code];
    c.boons = c.boons.filter((x) => !lost.includes(x));
  }
  // Mysterious Omens, defeated in this chapter, leaves the Campaign Pool, and
  // the boons it attached are earned (Permanent, on their heroes).
  const q = s.angmarCards;
  if (q?.omens) c.burdens = c.burdens.filter((x) => x !== ANGMAR.omens);
  for (const { code, hero } of q?.skills ?? []) {
    if (c.fallen.includes(hero) || c.boons.includes(code)) continue;
    c.boons.push(code);
    c.permanent[hero] = [...(c.permanent[hero] ?? []), code];
  }
  if ((q?.skills ?? []).length)
    log(
      s,
      `Mysterious Omens: ${q!.skills!.map((x) => `${card(x.code).name} (${card(x.hero).name})`).join(", ")} ${q!.skills!.length === 1 ? "is" : "are"} earned.`,
      "good",
    );
  if (s.scenarioId === "the-weather-hills") {
    // "Note the amount of damage on Protect the Innocent in the Campaign Log
    // (replacing the previous number)."
    c.innocent = angmarInnocent(s)?.damage ?? 0;
    log(
      s,
      `The Weather Hills · Resolution: Protect the Innocent's ${c.innocent} damage is noted in the Campaign Log.`,
      "good",
    );
  }
  if (s.scenarioId === "intruders-in-chetwood") {
    // "Note the amount of damage on Protect the Innocent in the Campaign Log
    // and add Protect the Innocent to the Campaign Pool."
    c.innocent = angmarInnocent(s)?.damage ?? 0;
    if (!c.burdens.includes(ANGMAR.innocent)) c.burdens.push(ANGMAR.innocent);
    log(
      s,
      `Intruders in Chetwood · Resolution: Protect the Innocent's ${c.innocent} damage is noted in the Campaign Log, and it joins the Campaign Pool.`,
      "good",
    );
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  log(s, "The Campaign Log has been updated.", "good");
}

/** The campaign card's live state, for the quest inspector. */
export function angmarCampaignStatus(s: GameState): string[] {
  if (!isAngmarCampaign(s.campaign)) return [];
  const out: string[] = [];
  const quest = angmarInnocent(s);
  if (quest)
    out.push(
      `Protect the Innocent has ${quest.damage} damage: each attack that damages a character adds 1, progress placed on it removes damage instead, and the players lose at ${innocentLimit(s)}.`,
    );
  const q = s.angmarCards;
  if (s.campaign!.burdens.includes(ANGMAR.omens) && !q?.omens)
    out.push(
      "Mysterious Omens is shuffled into the encounter deck: defeating it removes it from the Campaign Pool and lets each player attach Cunning, Hardy, Resolute, Ruthless or Stalwart to a hero.",
    );
  if (q?.skills?.length)
    out.push(
      `Earned once this chapter is won (Permanent): ${q.skills.map((x) => `${card(x.code).name} on ${card(x.hero).name}`).join(", ")}.`,
    );
  return out;
}

/** The campaign's effects. */
export function angmarCampaignEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "angmarInnocentResources": {
      const p = e.player ?? first(s);
      const quest = angmarInnocent(s);
      if (!quest) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Intruders in Chetwood · ${several(s) ? `${seatName(s, p)} may` : "You may"} place 4 damage on Protect the Innocent`,
          [
            {
              id: "damage",
              label: `Place 4 damage on Protect the Innocent to add 1 resource to each of ${several(s) ? "their" : "your"} heroes`,
              code: ANGMAR.innocent,
              effects: [fx("angmarInnocentTake", { player: p })],
            },
            { id: "skip", label: "Do not place damage", effects: [] },
          ],
          card(ANGMAR.chetwoodCard).text,
        ),
      );
      return true;
    }
    case "angmarInnocentTake": {
      const p = e.player ?? first(s);
      const quest = angmarInnocent(s);
      if (!quest) return true;
      quest.damage += 4;
      forOwner(s, p, () => {
        for (const h of s.heroes) h.resources += 1;
      });
      log(
        s,
        `Intruders in Chetwood: ${who(s, p)} ${several(s) ? "places" : "place"} 4 damage on Protect the Innocent (${quest.damage} in all) and each of ${several(s) ? "their" : "your"} heroes gains 1 resource.`,
      );
      angmarInnocentCheck(s);
      return true;
    }
    case "angmarPendantAttach": {
      // "Attach Iârion's Pendant to Iârion."
      const iarion = get(s, e.target);
      if (!iarion || iarion.attachments.some((a) => a.code === ANGMAR.pendant))
        return true;
      iarion.attachments.push({
        id: `a${s.nextId++}`,
        code: ANGMAR.pendant,
        exhausted: false,
      });
      log(s, `Iârion's Pendant is attached to ${name(iarion)}.`, "good");
      return true;
    }
    case "angmarOmensDiscard": {
      const p = e.player ?? first(s);
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const i = Math.floor(random(s) * s.hand.length);
        const [u] = s.hand.splice(i, 1);
        s.discard.push(u.code);
        log(
          s,
          `Mysterious Omens: ${who(s, p)} ${several(s) ? "discards" : "discard"} ${name(u)} at random.`,
          "danger",
        );
      });
      return true;
    }
    case "angmarSkillChoice": {
      const p = e.player ?? first(s);
      const skills = freeSkills(s);
      if (!skills.length || !seatView(s, p).heroes.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Mysterious Omens · ${several(s) ? `${seatName(s, p)} may` : "You may"} attach a boon to a hero`,
          [
            ...skills.map((code) => ({
              id: code,
              code,
              label: card(code).name,
              effects: [fx("angmarSkillHero", { code, player: p })],
            })),
            { id: "skip", label: "Do not attach a boon", effects: [] },
          ],
          card(ANGMAR.omens).text,
        ),
      );
      return true;
    }
    case "angmarSkillHero": {
      const p = e.player ?? first(s);
      const heroes = seatView(s, p).heroes;
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name} · Attach to a hero ${several(s) ? `${seatName(s, p)} controls` : "you control"}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("angmarSkillAttach", {
                code: e.code,
                target: h.id,
                player: p,
              }),
            ],
          })),
          card(e.code!).text,
        ),
      );
      return true;
    }
    case "angmarSkillAttach": {
      const p = e.player ?? first(s);
      const hero = get(s, e.target);
      if (!hero || !freeSkills(s).includes(e.code!)) return true;
      hero.attachments.push({
        id: `a${s.nextId++}`,
        code: e.code!,
        exhausted: false,
        owner: p,
      });
      (state(s).skills ??= []).push({ code: e.code!, hero: hero.code });
      log(
        s,
        `Mysterious Omens: ${card(e.code!).name} is attached to ${name(hero)} (Permanent).`,
        "good",
      );
      return true;
    }
    case "angmarRuthlessAmount": {
      const hero = get(s, e.source);
      const enemy = get(s, e.target);
      if (!hero || !enemy || !hero.damage) return true;
      choose(
        s,
        `Ruthless · Move damage from ${name(hero)} to ${name(enemy)}`,
        Array.from({ length: hero.damage }, (_, i) => i + 1).map((n) => ({
          id: String(n),
          label: `Move ${n} damage`,
          effects: [
            fx("angmarRuthlessMove", {
              source: hero.id,
              target: enemy.id,
              value: n,
              player: e.player,
            }),
          ],
        })),
      );
      return true;
    }
    case "angmarRuthlessMove": {
      const hero = get(s, e.source);
      const enemy = get(s, e.target);
      const n = Math.min(e.value ?? 0, hero?.damage ?? 0);
      if (!hero || !enemy || n <= 0) return true;
      hero.damage -= n;
      enemy.damage += n;
      log(
        s,
        `Ruthless: ${n} damage moves from ${name(hero)} to ${name(enemy)}.`,
        "good",
      );
      // Moving damage is not dealing it; a destroyed enemy leaves play as usual.
      check(s);
      return true;
    }
    case "angmarStalwartPlay": {
      const p = e.player ?? first(s);
      const hero = get(s, e.target);
      if (!hero) return true;
      forOwner(s, p, () => {
        const i = s.discard.indexOf(e.code!);
        if (i < 0) return;
        s.discard.splice(i, 1);
        const u = make(s, e.code!);
        u.owner = p;
        s.hand.push(u);
        try {
          playHandCard(s, { type: "PLAY", id: u.id, target: hero.id });
          log(
            s,
            `Stalwart: ${name(u)} is played from the discard pile on ${name(hero)}.`,
            "good",
          );
        } catch (error) {
          s.hand = s.hand.filter((x) => x.id !== u.id);
          s.discard.push(e.code!);
          throw error;
        }
      });
      return true;
    }
    case "angmarResoluteWindow": {
      const hero = get(s, e.target);
      if (!hero) return true;
      const context = readDamageContext(e);
      const value = e.value ?? 0;
      forOwner(s, e.player ?? ownerOf(s, hero), () =>
        choose(
          s,
          `Resolute · ${value} damage is dealt to ${name(hero)}`,
          [
            {
              id: "cancel",
              code: ANGMAR.resolute,
              label: `Cancel ${Math.min(2, value)} damage (once per game)`,
              effects: [
                fx("angmarResoluteResume", {
                  target: hero.id,
                  source: e.source,
                  value: value - Math.min(2, value),
                  text: encodeDamageContext({
                    ...context,
                    bypassResolute: true,
                  }),
                  flag: true,
                }),
              ],
            },
            {
              id: "skip",
              label: "Do not cancel",
              effects: [
                fx("angmarResoluteResume", {
                  target: hero.id,
                  value,
                  text: encodeDamageContext({
                    ...context,
                    bypassResolute: true,
                  }),
                }),
              ],
            },
          ],
          card(ANGMAR.resolute).text,
        ),
      );
      return true;
    }
    case "angmarResoluteResume": {
      const hero = get(s, e.target);
      if (!hero) return true;
      if (e.flag && e.source) {
        (state(s).spent ??= []).push(e.source);
        log(s, `Resolute: damage dealt to ${name(hero)} is canceled.`, "good");
      }
      const context = readDamageContext(e);
      const value = e.value ?? 0;
      if (!value) {
        check(s);
        return true;
      }
      const remaining = stats(s, hero).health - hero.damage;
      const enemy = get(s, context.enemyId);
      if (damage(s, hero.id, value, context) && enemy && context.combatDamage)
        applyCombatDamageConsequences(s, hero, enemy, value, remaining);
      return true;
    }
    case "angmarPendantSpend": {
      const host = get(s, e.target);
      if (!host) return true;
      host.attachments = host.attachments.filter((a) => a.id !== e.source);
      (s.victoryCards ??= []).push(ANGMAR.pendant);
      s.victory += card(ANGMAR.pendant).victory ?? 0;
      log(
        s,
        "Iârion's Pendant is added to the victory display, and the effect is canceled.",
        "good",
      );
      return true;
    }
  }
  return false;
}

/** The Campaign Pool's cards this campaign can hold so far. */
export const ANGMAR_BOONS: readonly string[] = [...SKILL_BOONS];
export const ANGMAR_BURDENS: readonly string[] = [
  ANGMAR.innocent,
  ANGMAR.omens,
];
/** The Angmar Awakened Campaign Log in a saved game. */
export function validateAngmarCampaign(s: GameState): boolean {
  const c = s.campaign;
  if (!c || c.kind !== "angmar") return false;
  const codes = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string" && !!x);
  const integer = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
  const hero = (code: string) => {
    try {
      return card(code).type_code === "hero";
    } catch {
      return false;
    }
  };
  const q = s.angmarCards;
  return (
    ANGMAR_CAMPAIGN_ORDER.includes(s.scenarioId) &&
    codes(c.heroes) &&
    c.heroes.length >= 1 &&
    c.heroes.length <= (s.table ? 12 : 3) &&
    new Set(c.heroes).size === c.heroes.length &&
    c.heroes.every(hero) &&
    codes(c.fallen) &&
    c.fallen.every(hero) &&
    integer(c.threatPenalty) &&
    codes(c.boons) &&
    c.boons.every((x) => ANGMAR_BOONS.includes(x)) &&
    new Set(c.boons).size === c.boons.length &&
    codes(c.burdens) &&
    c.burdens.every((x) => ANGMAR_BURDENS.includes(x)) &&
    new Set(c.burdens).size === c.burdens.length &&
    !!c.permanent &&
    typeof c.permanent === "object" &&
    !Array.isArray(c.permanent) &&
    Object.entries(c.permanent).every(
      ([h, cs]) => hero(h) && codes(cs) && cs.every((x) => c.boons.includes(x)),
    ) &&
    c.prisoner === null &&
    typeof c.mendorSaved === "boolean" &&
    (c.resolution === undefined || c.resolution === null) &&
    (c.seatHeroes === undefined ||
      (Array.isArray(c.seatHeroes) &&
        c.seatHeroes.length === (s.table?.seats.length ?? 1) &&
        c.seatHeroes.every((n) => Number.isSafeInteger(n) && n >= 1) &&
        c.seatHeroes.reduce((n, x) => n + x, 0) === c.heroes.length)) &&
    (c.innocent === undefined || integer(c.innocent)) &&
    (c.ravaged === undefined || typeof c.ravaged === "boolean") &&
    Array.isArray(c.completed) &&
    c.completed.every(
      (r, i) =>
        ANGMAR_CAMPAIGN_ORDER[i] === r.scenarioId &&
        integer(r.score) &&
        integer(r.rounds),
    ) &&
    (c.completed.at(-1)?.scenarioId === s.scenarioId ||
      (nextAngmarChapter(c) === s.scenarioId && s.status !== "won")) &&
    (q === undefined ||
      (!!q &&
        typeof q === "object" &&
        (q.innocent === undefined || typeof q.innocent === "string") &&
        (q.omens === undefined || typeof q.omens === "boolean") &&
        (q.skills === undefined ||
          (Array.isArray(q.skills) &&
            q.skills.every(
              (x) =>
                !!x &&
                SKILL_BOONS.includes(x.code) &&
                typeof x.hero === "string" &&
                hero(x.hero),
            ))) &&
        (q.spent === undefined || codes(q.spent)) &&
        (q.boosts === undefined ||
          (Array.isArray(q.boosts) &&
            q.boosts.every(
              (b) =>
                !!b &&
                typeof b.target === "string" &&
                typeof b.phase === "string" &&
                integer(b.round),
            )))))
  );
}
