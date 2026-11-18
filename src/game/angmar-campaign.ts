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
import { choose, enqueue, fx, get, log, make, prepend } from "./core";
import {
  forOwner,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { score } from "./actions";
import type { DamageContext } from "./damage-context";

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
} as const;
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
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
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
    label: `Add Iârion's Pendant to the victory display to cancel the "when revealed" effects${s.table ? ` · ${seatName(s, player)}` : ""}`,
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
    label: `Add Iârion's Pendant to the victory display to cancel the shadow effect${s.table ? ` · ${seatName(s, player)}` : ""}`,
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
          `Intruders in Chetwood · ${s.table ? `${seatName(s, p)} may` : "You may"} place 4 damage on Protect the Innocent`,
          [
            {
              id: "damage",
              label: `Place 4 damage on Protect the Innocent to add 1 resource to each of ${s.table ? "their" : "your"} heroes`,
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
        `Intruders in Chetwood: ${who(s, p)} ${s.table ? "places" : "place"} 4 damage on Protect the Innocent (${quest.damage} in all) and each of ${s.table ? "their" : "your"} heroes gains 1 resource.`,
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
export const ANGMAR_BOONS: readonly string[] = [];
export const ANGMAR_BURDENS: readonly string[] = [ANGMAR.innocent];
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
        (q.innocent === undefined || typeof q.innocent === "string")))
  );
}
