// The Dark of Mirkwood in campaign mode (its rulebook, "Campaign Mode", page
// 7): The Oath and The Caves of Nibin-Dûm are Parts 4 and 5 of the Mirkwood
// Paths campaign begun in the Revised Core Set, or a two-scenario mini
// campaign with a blank Campaign Log. Their campaign cards, boons and burdens;
// Ranger Sense also joins the decks of the players' next campaign.
import type {
  Attachment,
  CampaignState,
  Effect,
  GameState,
  Option,
  ScenarioId,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  reorderPlayerDeck,
  requireRule,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import {
  discardHandCard,
  enemyAddedToStaging,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import { playerCardImmune } from "./card-immunity";
import { removePlayedEvent } from "./event-resolution";

export const DOM = {
  oathCard: "octgn:75c3ac9e-b4e2-4c26-95a3-df99e6f22c6d",
  cavesCard: "octgn:5642b7b9-b194-46e3-bf69-7aa7ec9efc62",
  stalking: "41041",
  shiny: "41042",
  guilty: "41043",
  lore: "41044",
  tactics: "41045",
  spirit: "41046",
  leadership: "41047",
  noTime: "41048",
  ranger: "41049",
} as const;
/** The four Adaptation boon attachments (one copy of each). */
export const ADAPTATIONS: readonly string[] = [
  DOM.lore,
  DOM.tactics,
  DOM.spirit,
  DOM.leadership,
];
/** The burdens with an encounter card back the Campaign Pool can hold. */
const ENCOUNTER_BURDENS: readonly string[] = [
  "rc136",
  "rc137",
  DOM.stalking,
  DOM.shiny,
  DOM.guilty,
];
/** The Goblin Sniper of The Oath's and The Caves' Goblins set. */
const SNIPER = "octgn:e8db9cc7-d53f-4ce9-991d-31078b2d507a";

export const CORE_CHAPTERS: readonly ScenarioId[] = [
  "mirkwood",
  "anduin",
  "dol-guldur",
];
/** The Dark of Mirkwood's chapters: Parts 4 and 5, or the mini campaign. */
export const DARK_MIRKWOOD_CHAPTERS: readonly ScenarioId[] = [
  "the-oath",
  "the-caves-of-nibin-dum",
];
/** The Mirkwood Paths campaign with The Dark of Mirkwood's extension. */
export const MIRKWOOD_PATHS_ORDER: readonly ScenarioId[] = [
  ...CORE_CHAPTERS,
  ...DARK_MIRKWOOD_CHAPTERS,
];
export const DARK_MIRKWOOD_CAMPAIGN_CARDS: Partial<Record<ScenarioId, string>> =
  {
    "the-oath": DOM.oathCard,
    "the-caves-of-nibin-dum": DOM.cavesCard,
  };

/** The per-game state of The Dark of Mirkwood's campaign cards and boons. */
export interface DarkMirkwoodGame {
  /** The Oath's campaign card: the resource tokens placed on it. */
  tokens?: number;
  /** The Adaptation boons this chapter's Setup attached, with the seat of the player who chose each. */
  adaptations?: Record<string, number>;
  /** The Adaptations whose once-per-campaign Action was used this game. */
  used?: string[];
  /** The Caves of Nibin-Dûm: the seats that added "No Time to Waste!" to their hand at setup. */
  noTime?: number[];
  /** The cards the campaign card's Setup added to a hand (kept through a mulligan). */
  setupHand?: string[];
  /** The seats whose "No Time to Waste!" was removed from the game and the Campaign Pool. */
  noTimeSpent?: number[];
  /** The seats whose Ranger Sense was removed from the game and the Campaign Pool. */
  rangerSpent?: number[];
}

// ------------------------------------------------------------ the campaign

/** The Mirkwood Paths campaign: the campaign without a kind. */
export const isMirkwoodPathsCampaign = (
  c?: CampaignState | null,
): c is CampaignState => !!c && !c.kind;
/** The chapters of a Mirkwood Paths campaign, in order. */
export const mirkwoodPathsOrder = (c: Pick<CampaignState, "mini">) =>
  c.mini ? DARK_MIRKWOOD_CHAPTERS : MIRKWOOD_PATHS_ORDER;
/** The chapter a Mirkwood Paths campaign continues with, or undefined once it is complete. */
export const nextMirkwoodChapter = (
  c: Pick<CampaignState, "mini" | "completed">,
): ScenarioId | undefined => mirkwoodPathsOrder(c)[c.completed.length];
/** The part number printed for a chapter (The Oath is part 4 of Mirkwood Paths). */
export const mirkwoodPart = (c: Pick<CampaignState, "mini">, id: ScenarioId) =>
  mirkwoodPathsOrder(c).indexOf(id) + 1;
/** A Dark of Mirkwood chapter played in campaign mode. */
export const darkMirkwoodChapter = (s: GameState) =>
  s.playMode === "campaign" &&
  isMirkwoodPathsCampaign(s.campaign) &&
  DARK_MIRKWOOD_CHAPTERS.includes(s.scenarioId);
const state = (s: GameState) => (s.darkMirkwood ??= {});
/** Several players share the table (the wording names each player). */
const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const seatLabel = (s: GameState, p: number) =>
  several(s) ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (several(s) ? seatName(s, p) : "you");
const names = (codes: readonly string[]) =>
  codes.map((code) => card(code).name).join(", ");

// ------------------------------------------------------------------ setup

/** Before the starting hands: Ranger Sense joins the deck of each player who took it into this campaign. */
export function darkMirkwoodDeckSetup(s: GameState) {
  const c = s.campaign;
  if (s.playMode !== "campaign" || !c?.rangerSense?.length) return;
  const seats = seatIndices(s);
  for (const seat of c.rangerSense)
    if (seats.includes(seat)) forOwner(s, seat, () => s.deck.push(DOM.ranger));
}

/**
 * The campaign card's Setup and the Campaign Pool, after the scenario's own
 * setup (The Oath and The Caves of Nibin-Dûm build their encounter decks from
 * their recipes, so the Campaign Pool's burdens join them here).
 */
export function darkMirkwoodCampaignSetup(s: GameState) {
  if (!darkMirkwoodChapter(s)) return;
  const c = s.campaign!;
  const oath = s.scenarioId === "the-oath";
  // Campaign Mode setup: "Shuffle any boon or burden encounter cards listed
  // in the Campaign Pool into the encounter deck." The Oath: "Shuffle the
  // Stalking Goblin burden enemy into the encounter deck." The Caves:
  // "Shuffle the Shiny Distraction burden into the encounter deck."
  const pool = c.burdens.filter((code) => ENCOUNTER_BURDENS.includes(code));
  const added = oath ? DOM.stalking : DOM.shiny;
  if (!pool.includes(added)) pool.push(added);
  s.encounterDeck.push(...pool);
  shuffle(s, s.encounterDeck);
  log(
    s,
    `${names(pool)} ${pool.length === 1 ? "is" : "are"} shuffled into the encounter deck.`,
  );
  if (oath) {
    // "Each player chooses 1 Adaptation boon attachment and attaches it to
    // one of their heroes."
    for (const player of playerOrder(s))
      enqueue(s, fx("domAdaptation", { player }));
    return;
  }
  // An Adaptation in the Campaign Pool: "Setup. Attach to a hero." Each
  // returns to a hero of the player who chose it.
  const seats = seatIndices(s);
  for (const code of ADAPTATIONS) {
    const seat = c.adaptations?.[code];
    if (seat !== undefined && c.boons.includes(code) && seats.includes(seat))
      enqueue(s, fx("domAdaptationHero", { code, player: seat }));
  }
  // "Each player adds 1 copy of the 'No Time to Waste!' boon to their hand
  // after drawing their starting hand (including taking a mulligan). Add each
  // copy of 'No Time to Waste!' in a player's hand to the Campaign Pool."
  const q = state(s);
  for (const p of seats)
    forOwner(s, p, () => {
      const u = make(s, DOM.noTime);
      if (s.table) u.owner = p;
      s.hand.push(u);
      (q.setupHand ??= []).push(u.id);
      (q.noTime ??= []).push(p);
    });
  log(
    s,
    `${several(s) ? "Each player adds" : "You add"} "No Time to Waste!" to ${several(s) ? "their" : "your"} hand (kept through a mulligan).`,
    "good",
  );
}
/** "No Time to Waste!" added by the campaign card: kept through a mulligan. */
export const darkMirkwoodSetupHandIds = (s: GameState) =>
  (s.darkMirkwood?.setupHand ?? []).filter((id) =>
    s.hand.some((u) => u.id === id),
  );
/** Mendor joins Parts 1–3, and Parts 4–5 while he is in the Campaign Pool (a designer's ruling). */
export const mendorStarts = (c: CampaignState, id: ScenarioId) =>
  CORE_CHAPTERS.includes(id) || c.boons.includes("rc135");
/** "If Mendor leaves play, the players lose the game": Parts 1 and 2 only. */
export const mendorLossChapter = (s: GameState) =>
  !!s.campaign && (s.scenarioId === "mirkwood" || s.scenarioId === "anduin");

// ------------------------------------------------------------- round end

/**
 * The Oath's campaign card: "Forced: At the end of each round, place 1
 * resource token here." Guilty Conscience: "Forced: Raise your threat by 2 at
 * the end of each round."
 */
export function darkMirkwoodRoundEnd(s: GameState): Effect[] {
  const effects: Effect[] = [];
  if (darkMirkwoodChapter(s) && s.scenarioId === "the-oath")
    effects.push(fx("domOathToken", { player: firstPlayer(s) }));
  for (const h of allHeroes(s))
    for (const a of h.attachments)
      if (a.code === DOM.guilty && !a.blanked)
        effects.push(
          fx("domGuilty", {
            target: h.id,
            source: a.id,
            player: ownerOf(s, h),
          }),
        );
  return effects;
}

// ------------------------------------------------------------ encounters

/** When Revealed: Shiny Distraction and Guilty Conscience. */
export function darkMirkwoodEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (code !== DOM.shiny && code !== DOM.guilty) return false;
  if (code === DOM.shiny) {
    if (!replay) s.encounterDiscard.push(code);
    if (!fromReveal) return true;
    // "Each player may add 1 resource to each of their heroes' pools. Each
    // player that does raises their threat by 5."
    prepend(s, ...playerOrder(s).map((player) => fx("domShiny", { player })));
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  prepend(s, fx("domGuiltyAttach", { player: firstPlayer(s) }));
  return true;
}
/** The heroes Guilty Conscience can attach to: the highest printed threat cost. */
function guiltyTargets(s: GameState) {
  const heroes = allHeroes(s);
  const top = Math.max(...heroes.map((h) => card(h.code).threat ?? 0));
  return heroes.filter((h) => (card(h.code).threat ?? 0) === top);
}
function attachGuilty(s: GameState, h: Unit) {
  h.attachments.push({
    id: `a${s.nextId++}`,
    code: DOM.guilty,
    exhausted: false,
  });
  log(s, `Guilty Conscience is attached to ${name(h)}.`, "danger");
}

/** "Forced: After Stalking Goblin engages you, search … for a Goblin Sniper." */
export function darkMirkwoodEngaged(s: GameState, u: Unit) {
  if (u.code !== DOM.stalking || u.blanked) return;
  prepend(s, fx("domStalking", { player: activeSeat(s) }));
}
/** Stalking Goblin's "Shadow: Add Stalking Goblin to the staging area." */
export function darkMirkwoodShadow(s: GameState, code: string) {
  if (code !== DOM.stalking) return false;
  const enemy = get(s, s.combat?.enemyId ?? undefined);
  const i = enemy?.shadows.indexOf(code) ?? -1;
  if (enemy && i >= 0) enemy.shadows.splice(i, 1);
  const goblin = make(s, code);
  s.staging.push(goblin);
  enemyAddedToStaging(s, goblin);
  log(s, "Stalking Goblin is added to the staging area.", "danger");
  return true;
}
/** Guilty Conscience leaves play to the encounter discard pile. */
export function darkMirkwoodAttachmentLeaves(
  s: GameState,
  u: Unit,
  a: Attachment,
) {
  if (a.code !== DOM.guilty) return false;
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  s.encounterDiscard.push(a.code);
  log(s, `Guilty Conscience is discarded from ${name(u)}.`);
  return true;
}

// --------------------------------------------------------- the abilities

const LABELS: Record<string, string> = {
  [DOM.lore]:
    "The Fervor of Lore · Action: discard 3 cards from your hand to heal all damage from a hero (once per campaign)",
  [DOM.tactics]:
    "The Might of Tactics · Action: deal 1 damage to the attached hero to deal 3 damage to an enemy engaged with you (once per campaign)",
  [DOM.spirit]:
    "The Power of Spirit · Action: exhaust the attached hero to place 3 progress on a location (once per campaign)",
  [DOM.leadership]:
    "The Secret of Leadership · Action: spend 1 resource from the attached hero's pool to ready a hero (once per campaign)",
  [DOM.guilty]:
    "Guilty Conscience · Action: spend 2 resources from the attached hero's pool to discard this card",
};
export const darkMirkwoodAbilityLabel = (code: string) => LABELS[code];
/** "(Limit once per campaign. Record in Campaign Log when used.)" */
export const adaptationUsed = (s: GameState, code: string) =>
  !!s.campaign?.adaptationsUsed?.includes(code) ||
  !!s.darkMirkwood?.used?.includes(code);
const enemiesEngaged = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter(
    (e) => card(e.code).type_code === "enemy" && !playerCardImmune(e),
  );
const progressTargets = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (l) => card(l.code).type_code === "location" && !playerCardImmune(l),
  );
export function darkMirkwoodAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !LABELS[a.code]) return "This card has no such ability.";
  const title = card(a.code).name;
  if (a.blanked) return `${title}'s text is blank.`;
  if (s.phase === "setup") return "Continue to the next action window.";
  if (s.choice || s.status !== "playing")
    return "Resolve the current choice first.";
  const p = attachmentController(s, u, a) ?? ownerOf(s, u);
  if (p !== activeSeat(s)) return `${seatName(s, p)} controls ${title}.`;
  if (a.code !== DOM.guilty && adaptationUsed(s, a.code))
    return `${title}'s Action was already used in this campaign.`;
  switch (a.code) {
    case DOM.lore:
      if (s.hand.length < 3) return "Discard 3 cards from your hand.";
      if (!allHeroes(s).some((h) => h.damage > 0))
        return "No hero has damage to heal.";
      return null;
    case DOM.tactics:
      return enemiesEngaged(s, p).length
        ? null
        : "No enemy is engaged with you.";
    case DOM.spirit:
      if (u.exhausted) return `${name(u)} must be ready.`;
      return progressTargets(s).length
        ? null
        : "There is no location to place progress on.";
    case DOM.leadership:
      if (u.resources < 1) return `${name(u)} needs 1 resource.`;
      return allHeroes(s).some((h) => h.exhausted)
        ? null
        : "No hero is exhausted.";
    case DOM.guilty:
      return u.resources < 2 ? `${name(u)} needs 2 resources.` : null;
  }
  return null;
}
export function darkMirkwoodAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !LABELS[a.code]) return false;
  const problem = darkMirkwoodAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  if (a.code === DOM.guilty) {
    // "Spend 2 resources from attached hero's pool to discard this card."
    u.resources -= 2;
    log(
      s,
      `${name(u)} spends 2 resources to discard Guilty Conscience.`,
      "good",
    );
    darkMirkwoodAttachmentLeaves(s, u, a);
    return true;
  }
  const q = state(s);
  (q.used ??= []).push(a.code);
  log(
    s,
    `${card(a.code).name}: its once-per-campaign Action is used (recorded in the Campaign Log when the scenario is won).`,
  );
  switch (a.code) {
    case DOM.lore:
      // "Choose and discard 3 cards from your hand to heal all damage from a hero."
      prepend(s, fx("domFervorDiscard", { count: 3, player: p }));
      return true;
    case DOM.tactics:
      // "Deal 1 damage to the attached hero to deal 3 damage to an enemy engaged with you."
      prepend(
        s,
        fx("damage", { target: u.id, value: 1, player: p }),
        fx("domMight", { player: p }),
      );
      return true;
    case DOM.spirit:
      // "Exhaust the attached hero to place 3 progress on a location."
      exhaustCharacter(s, u);
      prepend(s, fx("domPower", { player: p }));
      return true;
    case DOM.leadership:
      // "Spend 1 resource from the attached hero's resource pool to ready a hero."
      u.resources -= 1;
      prepend(s, fx("domSecret", { player: p }));
      return true;
  }
  return true;
}

// --------------------------------------------------------- boon events

/** "No Time to Waste!" is a Quest Action whichever option is chosen. */
export function darkMirkwoodPlayProblem(s: GameState, u: Unit): string | null {
  if (u.code === DOM.noTime && !["quest", "staging"].includes(s.phase))
    return '"No Time to Waste!" is a Quest Action.';
  return null;
}
/** The player's copy of a boon event is still in the Campaign Pool. */
function pooled(s: GameState, code: string, p: number) {
  const q = s.darkMirkwood;
  if (code === DOM.noTime)
    return !!q?.noTime?.includes(p) && !(q.noTimeSpent ?? []).includes(p);
  return (
    !!s.campaign?.rangerSense?.includes(p) &&
    !(q?.rangerSpent ?? []).includes(p)
  );
}
/** "When playing this card, choose one:" */
export function darkMirkwoodPlayerEvent(s: GameState, code: string): boolean {
  if (code !== DOM.noTime && code !== DOM.ranger) return false;
  const p = activeSeat(s);
  const noTime = code === DOM.noTime;
  const options: Option[] = [];
  if (pooled(s, code, p))
    options.push({
      id: "remove",
      code,
      label: noTime
        ? "Remove it from the game and the Campaign Pool: each player reduces their threat by 3, then reveal the top card of the encounter deck"
        : "Remove it from the game and the Campaign Pool: look at the top 4 cards of your deck, add 1 to your hand and put the rest back in any order",
      effects: [fx(noTime ? "domNoTime" : "domRanger", { code, player: p })],
    });
  options.push({
    id: "draw",
    code,
    label: "Draw 1 card",
    effects: [fx("draw", { value: 1, player: p })],
  });
  choose(s, `${card(code).name} · Choose one`, options, card(code).text);
  return true;
}

// ----------------------------------------------------------------- effects

export function darkMirkwoodEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("dom")) return false;
  const p = e.player ?? activeSeat(s);
  const q = state(s);
  switch (e.kind) {
    case "domAdaptation": {
      const taken = Object.keys(q.adaptations ?? {});
      const left = ADAPTATIONS.filter((code) => !taken.includes(code));
      if (!left.length || !seatView(s, p).heroes.length) return true;
      choose(
        s,
        `The Oath · Choose an Adaptation boon to attach to one of your heroes${seatLabel(s, p)}`,
        left.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("domAdaptationHero", { code, player: p, flag: true })],
        })),
        card(DOM.oathCard).text,
      );
      return true;
    }
    case "domAdaptationHero": {
      const heroes = seatView(s, p).heroes;
      if (!e.code || !heroes.length) return true;
      if (heroes.length === 1) {
        attachAdaptation(s, heroes[0], e.code, p, !!e.flag);
        return true;
      }
      choose(
        s,
        `${card(e.code).name} · Attach to one of your heroes${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("domAttach", {
              code: e.code,
              target: h.id,
              player: p,
              flag: e.flag,
            }),
          ],
        })),
        card(e.code).text,
      );
      return true;
    }
    case "domAttach": {
      const h = get(s, e.target);
      if (h && e.code) attachAdaptation(s, h, e.code, p, !!e.flag);
      return true;
    }
    case "domOathToken":
      q.tokens = (q.tokens ?? 0) + 1;
      log(
        s,
        `The Oath: 1 resource token is placed on the campaign card (${q.tokens}).`,
        q.tokens >= 6 ? "danger" : "normal",
      );
      return true;
    case "domGuilty": {
      const h = get(s, e.target);
      const a = h?.attachments.find((x) => x.id === e.source);
      if (!h || !a || a.blanked) return true;
      raiseThreat(s, 2, "encounter");
      log(
        s,
        `Guilty Conscience: ${who(s, p)} ${several(s) ? "raises" : "raise"} ${several(s) ? "their" : "your"} threat by 2.`,
        "danger",
      );
      return true;
    }
    case "domShiny":
      choose(
        s,
        `Shiny Distraction${seatLabel(s, p)}`,
        [
          {
            id: "take",
            code: DOM.shiny,
            label:
              "Add 1 resource to each of your heroes' pools and raise your threat by 5",
            effects: [fx("domShinyTake", { player: p })],
          },
          { id: "decline", label: "Decline", effects: [] },
        ],
        card(DOM.shiny).text,
      );
      return true;
    case "domShinyTake":
      for (const h of s.heroes) h.resources += 1;
      raiseThreat(s, 5, "encounter");
      log(
        s,
        `Shiny Distraction: ${who(s, p)} ${several(s) ? "adds" : "add"} 1 resource to each hero and ${several(s) ? "raises" : "raise"} threat by 5.`,
        "danger",
      );
      return true;
    case "domGuiltyAttach": {
      const targets = guiltyTargets(s);
      if (!targets.length) {
        s.encounterDiscard.push(DOM.guilty);
        return true;
      }
      if (targets.length === 1) {
        attachGuilty(s, targets[0]);
        return true;
      }
      // The first player breaks the tie.
      choose(
        s,
        `Guilty Conscience · Attach to the hero with the highest threat cost${seatLabel(s, p)}`,
        targets.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${several(s) ? ` (${seatName(s, ownerOf(s, h))})` : ""}`,
          effects: [fx("domGuiltyOn", { target: h.id, player: p })],
        })),
        card(DOM.guilty).text,
      );
      return true;
    }
    case "domGuiltyOn": {
      const h = get(s, e.target);
      if (h) attachGuilty(s, h);
      return true;
    }
    case "domStalking": {
      // "Search the encounter deck, discard pile, and your collection (in
      // that order) for a Goblin Sniper and add it to the staging area.
      // Shuffle the encounter deck."
      const sniper = (c: string) => card(c).name === "Goblin Sniper";
      let code: string | undefined;
      let from = "the encounter deck";
      for (const [pile, where] of [
        [s.encounterDeck, "the encounter deck"],
        [s.encounterDiscard, "the encounter discard pile"],
      ] as const) {
        const i = pile.findIndex(sniper);
        if (i >= 0) {
          code = pile.splice(i, 1)[0];
          from = where;
          break;
        }
      }
      if (!code) {
        code = SNIPER;
        from = "the collection";
      }
      const u = make(s, code);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Stalking Goblin: a Goblin Sniper from ${from} is added to the staging area; the encounter deck is shuffled.`,
        "danger",
      );
      return true;
    }
    case "domFervorDiscard": {
      const left = e.count ?? 0;
      if (left <= 0 || !s.hand.length) {
        prepend(s, fx("domFervorHeal", { player: p }));
        return true;
      }
      choose(
        s,
        `The Fervor of Lore · Choose a card to discard (${left} left)`,
        s.hand.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Discard ${card(h.code).name}`,
          effects: [
            fx("domFervorDrop", { target: h.id, count: left, player: p }),
          ],
        })),
      );
      return true;
    }
    case "domFervorDrop": {
      const u = s.hand.find((h) => h.id === e.target);
      if (u) {
        discardHandCard(s, u.id);
        log(s, `${card(u.code).name} is discarded for The Fervor of Lore.`);
      }
      prepend(
        s,
        fx("domFervorDiscard", { count: (e.count ?? 1) - 1, player: p }),
      );
      return true;
    }
    case "domFervorHeal": {
      const heroes = allHeroes(s).filter((h) => h.damage > 0);
      if (!heroes.length) return true;
      choose(
        s,
        "The Fervor of Lore · Heal all damage from a hero",
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Heal ${h.damage} from ${name(h)}`,
          effects: [
            fx("heal", {
              target: h.id,
              value: h.damage,
              code: DOM.lore,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "domMight": {
      const enemies = enemiesEngaged(s, p);
      if (!enemies.length) return true;
      choose(
        s,
        "The Might of Tactics · Deal 3 damage to an enemy engaged with you",
        enemies.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Deal 3 damage to ${name(x)}`,
          effects: [fx("damage", { target: x.id, value: 3, player: p })],
        })),
      );
      return true;
    }
    case "domPower": {
      const targets = progressTargets(s);
      if (!targets.length) return true;
      choose(
        s,
        "The Power of Spirit · Place 3 progress on a location",
        targets.map((l) => ({
          id: l.id,
          code: l.code,
          label: `Place 3 progress on ${name(l)}`,
          effects: [fx("locationProgress", { target: l.id, value: 3 })],
        })),
      );
      return true;
    }
    case "domSecret": {
      const heroes = allHeroes(s).filter((h) => h.exhausted);
      if (!heroes.length) return true;
      choose(
        s,
        "The Secret of Leadership · Ready a hero",
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Ready ${name(h)}${several(s) ? ` (${seatName(s, ownerOf(s, h))})` : ""}`,
          effects: [fx("domReady", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "domReady": {
      const h = get(s, e.target);
      if (h) readyCharacter(s, h);
      return true;
    }
    case "domNoTime":
      // "Remove 'No Time to Waste!' from the game and from the Campaign Pool
      // to reduce each player's threat by 3. Reveal the top card of the
      // encounter deck."
      removePlayedEvent(s, DOM.noTime);
      (q.noTimeSpent ??= []).push(p);
      log(
        s,
        '"No Time to Waste!" is removed from the game and from the Campaign Pool (recorded when the scenario is won).',
      );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("threat", { value: -3, code: DOM.noTime, player }),
        ),
        fx("reveal", { player: p }),
      );
      return true;
    case "domRanger":
      // "Remove Ranger Sense from the game and from the Campaign Pool to look
      // at the top 4 cards of your deck. Add 1 to your hand and put the rest
      // back in any order."
      removePlayedEvent(s, DOM.ranger);
      (q.rangerSpent ??= []).push(p);
      log(
        s,
        "Ranger Sense is removed from the game and from the Campaign Pool (recorded when the scenario is won).",
      );
      prepend(s, fx("domRangerLook", { player: p }));
      return true;
    case "domRangerLook": {
      const n = Math.min(4, s.deck.length);
      if (!n) return true;
      choose(
        s,
        `Ranger Sense · Add 1 of the top ${n} cards of your deck to your hand`,
        s.deck.slice(0, n).map((code, i) => ({
          id: `take-${i}`,
          code,
          label: `Add ${card(code).name} to your hand`,
          effects: [
            fx("domRangerTake", { value: i, count: n, code, player: p }),
          ],
        })),
      );
      return true;
    }
    case "domRangerTake": {
      const i = e.value ?? -1;
      if (s.deck[i] !== e.code) return true;
      s.hand.push(takePlayerDeck(s, i));
      log(s, `Ranger Sense adds ${card(e.code!).name} to the hand.`, "good");
      const rest = (e.count ?? 1) - 1;
      if (rest > 1)
        prepend(s, fx("domRangerOrder", { count: rest, text: "", player: p }));
      return true;
    }
    case "domRangerOrder": {
      // "… put the rest back in any order": the top card is chosen first.
      const n = e.count ?? 0;
      const placed = e.text ? e.text.split(",").map(Number) : [];
      const left = Array.from({ length: n }, (_, i) => i).filter(
        (i) => !placed.includes(i),
      );
      if (left.length <= 1) {
        reorderPlayerDeck(s, 0, [...placed, ...left]);
        log(s, `Ranger Sense puts ${n} cards back on top of the deck.`);
        return true;
      }
      choose(
        s,
        `Ranger Sense · Put the rest back in any order: choose card ${placed.length + 1} from the top`,
        left.map((i) => ({
          id: `put-${i}`,
          code: s.deck[i],
          label: card(s.deck[i]).name,
          effects: [
            fx("domRangerOrder", {
              count: n,
              text: [...placed, i].join(","),
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    default:
      return false;
  }
}
function attachAdaptation(
  s: GameState,
  h: Unit,
  code: string,
  p: number,
  chosen: boolean,
) {
  h.attachments.push({
    id: `a${s.nextId++}`,
    code,
    exhausted: false,
    owner: p,
  });
  if (chosen) (state(s).adaptations ??= {})[code] = p;
  log(s, `${card(code).name} is attached to ${name(h)}.`, "good");
}

// ------------------------------------------------------------ resolution

/**
 * A won game records the copies of Ranger Sense removed from the game and
 * from the Campaign Pool (in any campaign: they joined it as a legacy).
 */
export function darkMirkwoodRecordSpent(s: GameState) {
  const c = s.campaign;
  const spent = s.darkMirkwood?.rangerSpent ?? [];
  if (!c?.rangerSense || !spent.length) return;
  c.rangerSense = c.rangerSense.filter((seat) => !spent.includes(seat));
}
/** The campaign cards' Resolutions (Parts 4 and 5, or the mini campaign). */
export function resolveDarkMirkwood(s: GameState) {
  if (!darkMirkwoodChapter(s)) return;
  const c = s.campaign!;
  const q = s.darkMirkwood ?? {};
  if (q.used?.length)
    c.adaptationsUsed = [...new Set([...(c.adaptationsUsed ?? []), ...q.used])];
  if (s.scenarioId === "the-oath") {
    // Setup: "Add Stalking Goblin and each attached Adaptation to the
    // Campaign Pool."
    if (!c.burdens.includes(DOM.stalking)) c.burdens.push(DOM.stalking);
    for (const code of ADAPTATIONS) {
      const seat = q.adaptations?.[code];
      if (seat === undefined) continue;
      if (!c.boons.includes(code)) c.boons.push(code);
      (c.adaptations ??= {})[code] = seat;
    }
    // Resolution: "If there are 6 or more resource tokens here, … Add the
    // Guilty Conscience treachery burden to the Campaign Pool."
    const tokens = q.tokens ?? 0;
    if (tokens >= 6 && !c.burdens.includes(DOM.guilty))
      c.burdens.push(DOM.guilty);
    log(
      s,
      tokens >= 6
        ? `The Oath · Resolution: ${tokens} resource tokens are on the campaign card; Guilty Conscience is added to the Campaign Pool.`
        : `The Oath · Resolution: ${tokens} resource token${tokens === 1 ? " is" : "s are"} on the campaign card; the Campaign Pool takes Stalking Goblin and the Adaptations.`,
      tokens >= 6 ? "danger" : "good",
    );
    return;
  }
  // Setup: "Add each copy of 'No Time to Waste!' in a player's hand to the
  // Campaign Pool. … add [Shiny Distraction] to the Campaign Pool."
  if (!c.burdens.includes(DOM.shiny)) c.burdens.push(DOM.shiny);
  const spent = q.noTimeSpent ?? [];
  c.noTimeToWaste = (q.noTime ?? []).filter((seat) => !spent.includes(seat));
  // Resolution: "Check the final threat of the player with the highest
  // threat: If it is under 40, you have rescued a retired Ranger …"
  const highest = Math.max(...seatIndices(s).map((p) => seatView(s, p).threat));
  if (highest < 40) {
    c.rangerRescued = true;
    c.resolution = s.scenarioId;
    log(
      s,
      `The Caves of Nibin-Dûm · Resolution: the highest final threat is ${highest}; a retired Ranger is rescued.`,
      "good",
    );
  } else
    log(
      s,
      `The Caves of Nibin-Dûm · Resolution: the highest final threat is ${highest}, not under 40.`,
    );
}
/** The Caves of Nibin-Dûm's resolution: "Each player may add 1 copy of Ranger Sense to their deck and to the Campaign Pool." */
export function mirkwoodResolutionQuestions(s: GameState) {
  const c = s.campaign;
  if (
    !isMirkwoodPathsCampaign(c) ||
    c.resolution !== "the-caves-of-nibin-dum" ||
    s.status !== "won"
  )
    return [];
  return seatIndices(s).map((p) => ({
    id: `ranger-${p}`,
    label: `Ranger Sense${several(s) ? ` · ${seatName(s, p)}` : ""}: add 1 copy to ${several(s) ? "their" : "your"} deck and to the Campaign Pool?`,
    options: [
      { id: "add", label: "Add Ranger Sense" },
      { id: "decline", label: "Decline" },
    ],
  }));
}
export function applyMirkwoodResolution(
  game: GameState,
  answers: Record<string, string>,
): GameState {
  const questions = mirkwoodResolutionQuestions(game);
  requireRule(questions.length, "There is no resolution to record.");
  const s = structuredClone(game);
  const c = s.campaign!;
  c.rangerSense = seatIndices(s).filter(
    (p) => answers[`ranger-${p}`] === "add",
  );
  c.resolution = null;
  log(
    s,
    c.rangerSense.length
      ? `Ranger Sense joins the Campaign Pool for ${c.rangerSense.map((p) => (several(s) ? seatName(s, p) : "you")).join(", ")}.`
      : "No copy of Ranger Sense is added to the Campaign Pool.",
    "good",
  );
  return s;
}
/** A finished Mirkwood Paths campaign's legacy for the players' next campaign. */
export const mirkwoodLegacy = (c?: CampaignState | null) => ({
  // Escape from Dol Guldur: "put Mendor into play at the start of each
  // scenario during your next campaign. Each player may include 1 copy of
  // Mendor's Support in their deck during that campaign."
  mendor:
    isMirkwoodPathsCampaign(c) &&
    c.mendorSaved &&
    c.completed.some((q) => q.scenarioId === "dol-guldur"),
  // The Caves of Nibin-Dûm: "At the start of your next campaign, each player
  // may also shuffle 1 copy of Ranger Sense into their deck and add it to the
  // Campaign Pool."
  ranger:
    isMirkwoodPathsCampaign(c) &&
    !!c.rangerRescued &&
    c.completed.at(-1)?.scenarioId === "the-caves-of-nibin-dum",
});

// ------------------------------------------------------------------ saves

const seatList = (v: unknown, seats: number): v is number[] =>
  Array.isArray(v) &&
  new Set(v).size === v.length &&
  v.every((x) => Number.isSafeInteger(x) && x >= 0 && x < seats);
const codeList = (v: unknown, allowed: readonly string[]): v is string[] =>
  Array.isArray(v) &&
  new Set(v).size === v.length &&
  v.every((x) => typeof x === "string" && allowed.includes(x));
const seatRecord = (v: unknown, seats: number) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.entries(v).every(
    ([code, seat]) =>
      ADAPTATIONS.includes(code) &&
      Number.isSafeInteger(seat) &&
      seat >= 0 &&
      seat < seats,
  );
/** The Dark of Mirkwood's entries in a Mirkwood Paths Campaign Log. */
export function validMirkwoodLog(c: CampaignState, seats: number) {
  const done = (id: ScenarioId) =>
    Array.isArray(c.completed) && c.completed.some((q) => q.scenarioId === id);
  const adaptations = c.boons.filter((code) => ADAPTATIONS.includes(code));
  return (
    (c.mini === undefined || typeof c.mini === "boolean") &&
    (c.adaptations === undefined || seatRecord(c.adaptations, seats)) &&
    adaptations.every((code) => c.adaptations?.[code] !== undefined) &&
    Object.keys(c.adaptations ?? {}).every((code) => c.boons.includes(code)) &&
    (c.adaptationsUsed === undefined ||
      codeList(c.adaptationsUsed, ADAPTATIONS)) &&
    (c.noTimeToWaste === undefined || seatList(c.noTimeToWaste, seats)) &&
    (c.rangerRescued === undefined || typeof c.rangerRescued === "boolean") &&
    (c.resolution === undefined ||
      c.resolution === null ||
      (c.resolution === "the-caves-of-nibin-dum" && !!c.rangerRescued)) &&
    // The Oath's resolution records its boons and burdens; The Caves' its own.
    (!adaptations.length || done("the-oath")) &&
    (!c.burdens.some((code) => code === DOM.stalking || code === DOM.guilty) ||
      done("the-oath")) &&
    (!c.burdens.includes(DOM.shiny) || done("the-caves-of-nibin-dum")) &&
    (c.noTimeToWaste === undefined || done("the-caves-of-nibin-dum")) &&
    (!c.rangerRescued || done("the-caves-of-nibin-dum"))
  );
}
/** Ranger Sense in any campaign, and the per-game state. */
export function validDarkMirkwoodState(
  s: GameState,
  seats = s.table?.seats.length ?? 1,
) {
  const c = s.campaign;
  if (c?.rangerSense !== undefined && !seatList(c.rangerSense, seats))
    return false;
  const q = s.darkMirkwood;
  if (q === undefined) return true;
  return (
    !!q &&
    typeof q === "object" &&
    (q.tokens === undefined ||
      (Number.isSafeInteger(q.tokens) && q.tokens >= 0)) &&
    (q.adaptations === undefined || seatRecord(q.adaptations, seats)) &&
    (q.used === undefined || codeList(q.used, ADAPTATIONS)) &&
    (q.noTime === undefined || seatList(q.noTime, seats)) &&
    (q.noTimeSpent === undefined ||
      (seatList(q.noTimeSpent, seats) &&
        q.noTimeSpent.every((p) => q.noTime?.includes(p)))) &&
    // A won game has already taken its spent copies out of the Campaign Log.
    (q.rangerSpent === undefined ||
      (seatList(q.rangerSpent, seats) &&
        (s.status === "won" ||
          q.rangerSpent.every((p) => c?.rangerSense?.includes(p))))) &&
    (q.setupHand === undefined ||
      (Array.isArray(q.setupHand) &&
        q.setupHand.every((id) => typeof id === "string")))
  );
}

/** The campaign card's state, shown with it in the quest inspector. */
export function darkMirkwoodCampaignStatus(s: GameState): string[] {
  if (!darkMirkwoodChapter(s)) return [];
  const c = s.campaign!;
  const part = c.mini
    ? `The Dark of Mirkwood mini campaign · Part ${mirkwoodPart(c, s.scenarioId)}`
    : `Mirkwood Paths · Part ${mirkwoodPart(c, s.scenarioId)}`;
  if (s.scenarioId === "the-oath") {
    const tokens = s.darkMirkwood?.tokens ?? 0;
    return [
      part,
      `Resource tokens: ${tokens} (6 or more add Guilty Conscience to the Campaign Pool).`,
    ];
  }
  const highest = Math.max(...seatIndices(s).map((p) => seatView(s, p).threat));
  return [
    part,
    `Highest threat: ${highest} (under 40 at the end rescues the retired Ranger).`,
  ];
}
