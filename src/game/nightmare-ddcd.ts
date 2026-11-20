/**
 * Dungeons Deep and Caverns Dim's Nightmare Deck (docs/NIGHTMARE.md): its
 * setup card's rules (Gollum cannot take damage; The Lower Gate is set aside
 * at setup, in nightmareSetup, and enters the staging area when stage 3B is
 * revealed) and its Nightmare encounter cards, composed with the scenario's
 * own rules (src/game/dungeons-deep.ts) through batch4Scenario while a
 * Nightmare mode game is played. The scenario builds its encounter deck with
 * the setup card's removals and answers the Nightmare riddles (a card title,
 * a sphere, cost and type, a Trait) through its own riddle flow. Effects use
 * the "ndd" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, log, prepend } from "./core";
import { placeEncounter } from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { batch4Scenario } from "./batch4-scenarios";
import { mainQuestUnit } from "./quest-state";
import { bagginsBilbo, spendBaggins } from "./hobbit-saga";
import { NIGHTMARE_OHUH as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";
import { DDCD, hasRiddle } from "./dungeons-deep-support";

export interface NightmareDdcdState {
  /** The Lower Gate, set aside until stage 3B is revealed. */
  lowerGateAside?: number;
  /** The Lower Gate: the progress placed on the current quest this round. */
  ddcdGate?: { round: number; quest: string; placed: number };
}

const ddLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "dungeons-deep-and-caverns-dim";
const printed = (code: string, trait: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === trait);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const gateInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => live(s, u, N.lowerGate));
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s), ...allEngaged(s)].filter((u) =>
    live(s, u, code),
  );
const gollum = (s: GameState) =>
  s.dungeonsDeep?.riddleArea.find((u) => u.code === DDCD.gollum) ??
  allEngaged(s).find((u) => u.code === DDCD.gollum) ??
  s.staging.find((u) => u.code === DDCD.gollum);
/** A riddle answered now: revealed from the encounter deck in stage 1. */
function answerable(s: GameState, code: string, fromReveal: boolean) {
  const q = s.dungeonsDeep;
  const ok =
    !!q &&
    hasRiddle(code) &&
    fromReveal &&
    q.lastRevealOrigin === "encounter" &&
    s.stage === 1 &&
    !s.stageRevealing;
  if (q) q.lastRevealOrigin = null;
  return ok;
}

// ------------------------------------------------------------- the setup card

/** "Gollum cannot take damage." */
function ddDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!ddLive(s) || amount <= 0 || u.code !== DDCD.gollum) return amount;
  log(s, "Gollum cannot take damage (Nightmare mode).");
  return 0;
}
/** "Forced: When stage 3B is revealed, add The Lower Gate to the staging area." */
function ddStageRevealed(s: GameState, stage: number) {
  const q = s.nightmare;
  if (!ddLive(s) || stage !== 3 || !q?.lowerGateAside) return;
  delete q.lowerGateAside;
  placeEncounter(s, N.lowerGate);
  log(
    s,
    "Stage 3B is revealed: The Lower Gate is added to the staging area.",
    "danger",
  );
}

// ------------------------------------------------------------- the cards

/** The Lower Gate: "No more than 4 progress can be placed on the current quest each round." */
function ddProgress(s: GameState, amount: number, quest: Unit) {
  if (!ddLive(s) || !gateInPlay(s) || quest.id !== mainQuestUnit(s)?.id)
    return amount;
  const g = s.nightmare?.ddcdGate;
  const placed =
    g && g.round === s.round && g.quest === quest.code ? g.placed : 0;
  const allowed = Math.max(0, 4 - placed);
  if (amount > allowed)
    log(
      s,
      `The Lower Gate: no more than 4 progress can be placed on the current quest this round (${allowed} more).`,
    );
  return Math.min(amount, allowed);
}
function ddQuestProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (!ddLive(s) || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return;
  const q = (s.nightmare ??= {});
  const g =
    q.ddcdGate?.round === s.round && q.ddcdGate.quest === quest.code
      ? q.ddcdGate
      : { round: s.round, quest: quest.code, placed: 0 };
  g.placed += amount;
  q.ddcdGate = g;
}
/**
 * The Lower Gate: "Creature enemies get +1 [attack]. Goblin enemies get +1
 * [defense]." We Hates It!, attached to Gollum: "If the players are on stage
 * 3, Gollum gets +2 [attack]."
 */
function ddStats(s: GameState, u: Unit) {
  if (!ddLive(s) || !isEnemy(u)) return {};
  let attack = 0,
    defense = 0;
  if (gateInPlay(s)) {
    if (printed(u.code, "Creature")) attack += 1;
    if (printed(u.code, "Goblin")) defense += 1;
  }
  if (u.code === DDCD.gollum && s.stage === 3)
    attack += 2 * u.attachments.filter((a) => a.code === N.weHates).length;
  return {
    ...(attack ? { attack } : {}),
    ...(defense ? { defense } : {}),
  };
}
/** Wicked Wolf: "Forced: If Wicked Wolf is dealt a shadow card with a riddle, the defending player must exhaust a character he controls." */
function ddShadowDealt(s: GameState, enemy: Unit, code: string) {
  if (!ddLive(s) || !live(s, enemy, N.wickedWolf) || !hasRiddle(code)) return;
  const engaged = allEngaged(s).some((u) => u.id === enemy.id);
  prepend(
    s,
    fx("nddWolf", {
      player: engaged ? ownerOf(s, enemy) : firstPlayer(s),
    }),
  );
}
/** Lower Gate Sentries: "Bilbo's Magic Ring does not ready during the refresh phase." */
const ddAttachmentCannotReady = (s: GameState, _host: Unit, a: Attachment) =>
  ddLive(s) && a.code === DDCD.ring && inPlay(s, N.sentries).length > 0;
/** Pine Slopes: "Forced: Each time a [baggins] resource is spent or discarded, raise each player's threat by 1." */
function ddResourcesSpent(s: GameState, hero: Unit, amount: number) {
  if (!ddLive(s) || amount <= 0 || bagginsBilbo(s)?.id !== hero.id) return;
  const slopes = [...s.staging, ...allActiveLocations(s)].filter((u) =>
    live(s, u, N.pine),
  ).length;
  if (!slopes) return;
  log(
    s,
    `Pine Slopes: ${amount} Baggins resource${amount === 1 ? "" : "s"} spent or discarded; each player raises their threat by ${amount * slopes}.`,
    "danger",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("heirsThreat", { value: amount * slopes, player }),
    ),
  );
}
/** Fallen Stones: "Travel: Deal 3 damage to each ready character. The first player may spend up to 3 [baggins] resources to reduce the damage dealt to each character by 1 for each [baggins] resource spent." */
const ddTravelEffects = (s: GameState, u: Unit) =>
  ddLive(s) && live(s, u, N.stones)
    ? [fx("nddStones", { player: firstPlayer(s) })]
    : undefined;

function ddEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ddLive(s) || (code !== N.whereIsIt && code !== N.weHates)) return false;
  const first = firstPlayer(s);
  const answer = answerable(s, code, fromReveal);
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  // Where isss It?: "Discard 2 resources from Bilbo Baggins's resource pool,
  // or Gollum makes an attack against Bilbo Baggins." We Hates It!: "Attach
  // We Hates It! to Gollum."
  const normal =
    code === N.whereIsIt
      ? [fx("nddWhere", { player: first })]
      : [fx("nddWeHates", { player: first })];
  if (!answer) {
    prepend(s, ...normal);
    return true;
  }
  choose(
    s,
    `${card(code).name} · Answer its riddle or resolve the card normally?`,
    [
      {
        id: "answer",
        label: "Answer the riddle (the card is discarded)",
        effects: [
          fx("nddDiscard", { code, player: first }),
          fx("ddcdAnswer", { code, player: first }),
        ],
      },
      { id: "resolve", label: "Resolve the card normally", effects: normal },
    ],
    card(code)
      .text?.split("\n")
      .find((l) => l.startsWith("Riddle")),
  );
  return true;
}

function ddShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !ddLive(s)) return false;
  // Wicked Wolf: "Return attacking enemy to the staging area after this
  // attack."
  if (code === N.wickedWolf) {
    c.returnToStaging = true;
    return true;
  }
  // Lower Gate Sentries: "Attacking enemy gets +1 [attack]. (+3 [attack]
  // instead if Bilbo's Magic Ring is exhausted.)"
  if (code === N.sentries) {
    const ring = bagginsBilbo(s)?.attachments.find((a) => a.code === DDCD.ring);
    c.attackBonus += ring?.exhausted ? 3 : 1;
    return true;
  }
  // Pine Slopes: "Deal attacking enemy 2 additional shadow cards for this
  // attack."
  if (code === N.pine) {
    prepend(s, fx("khazadExtraShadows", { target: c.enemyId, count: 2 }));
    return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareDdcdEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ndd")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nddDiscard":
      if (e.code) s.encounterDiscard.push(e.code);
      return true;
    case "nddWhere": {
      s.encounterDiscard.push(N.whereIsIt);
      const bilbo = bagginsBilbo(s);
      const attack = fx("ddcdGollum", { player: p });
      // Discarding needs the 2 resources; otherwise Gollum attacks.
      if (!bilbo || bilbo.resources < 2 || !gollum(s)) {
        if (gollum(s)) prepend(s, attack);
        else if (bilbo && bilbo.resources >= 2)
          prepend(s, fx("nddWhereDiscard", { player: p }));
        return true;
      }
      choose(
        s,
        "Where isss It? · Discard 2 Baggins resources, or Gollum attacks Bilbo Baggins",
        [
          {
            id: "discard",
            label: "Discard 2 resources from Bilbo Baggins's resource pool",
            effects: [fx("nddWhereDiscard", { player: p })],
          },
          {
            id: "attack",
            label: "Gollum makes an attack against Bilbo Baggins",
            effects: [attack],
          },
        ],
        card(N.whereIsIt).text,
      );
      return true;
    }
    case "nddWhereDiscard": {
      const bilbo = bagginsBilbo(s);
      if (!bilbo) return true;
      const n = Math.min(2, bilbo.resources);
      bilbo.resources -= n;
      log(
        s,
        `Where isss It?: ${n} resource${n === 1 ? " is" : "s are"} discarded from Bilbo Baggins's resource pool.`,
        "danger",
      );
      batch4Scenario(s).resourcesSpent?.(s, bilbo, n);
      return true;
    }
    case "nddWeHates": {
      const g = gollum(s);
      if (!g) {
        s.encounterDiscard.push(N.weHates);
        return true;
      }
      g.attachments.push({
        id: `a${s.nextId++}`,
        code: N.weHates,
        exhausted: false,
      });
      log(s, "We Hates It! is attached to Gollum.", "danger");
      return true;
    }
    case "nddWolf": {
      const ready = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (u) => !u.exhausted,
      );
      if (!ready.length) return true;
      choose(
        s,
        `Wicked Wolf · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("exhaust", { target: u.id, player: p })],
        })),
        card(N.wickedWolf).text,
      );
      return true;
    }
    case "nddStones": {
      const bilbo = bagginsBilbo(s);
      const max = Math.min(3, bilbo?.resources ?? 0);
      const deal = (x: number) =>
        fx("nddStonesDamage", { value: 3 - x, count: x, player: p });
      if (!max) {
        prepend(s, deal(0));
        return true;
      }
      choose(
        s,
        "Fallen Stones · Spend Baggins resources to reduce the damage to each ready character?",
        Array.from({ length: max + 1 }, (_, x) => ({
          id: `spend-${x}`,
          label: x
            ? `Spend ${x} Baggins resource${x === 1 ? "" : "s"}: ${3 - x} damage to each ready character`
            : "Spend nothing: 3 damage to each ready character",
          effects: [deal(x)],
        })),
        card(N.stones).text,
      );
      return true;
    }
    case "nddStonesDamage": {
      if (e.count) spendBaggins(s, e.count);
      const amount = e.value ?? 0;
      const ready = allCharacters(s).filter((u) => !u.exhausted);
      log(
        s,
        `Fallen Stones: ${amount} damage to each ready character (${ready.length}).`,
        "danger",
      );
      if (amount > 0)
        prepend(
          s,
          ...ready.map((u) =>
            fx("damage", {
              target: u.id,
              value: amount,
              player: ownerOf(s, u),
            }),
          ),
        );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_DDCD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  damageAmount: ddDamageAmount,
  stageRevealed: ddStageRevealed,
  progress: ddProgress,
  questProgressPlaced: ddQuestProgressPlaced,
  stats: ddStats,
  shadowDealt: ddShadowDealt,
  attachmentCannotReady: ddAttachmentCannotReady,
  resourcesSpent: ddResourcesSpent,
  travelEffects: ddTravelEffects,
  encounter: ddEncounter,
  shadow: ddShadow,
  effect: nightmareDdcdEffect,
  sharedEffect: (e) => e.kind.startsWith("ndd"),
};

// ------------------------------------------------------------- saves

export function validNightmareDdcd(s: GameState) {
  const q = s.nightmare;
  const g = q?.ddcdGate;
  return (
    (q?.lowerGateAside === undefined || q.lowerGateAside === 1) &&
    (g === undefined ||
      (!!g &&
        Number.isInteger(g.round) &&
        g.round >= 0 &&
        typeof g.quest === "string" &&
        Number.isInteger(g.placed) &&
        g.placed >= 0))
  );
}
