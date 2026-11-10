import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  canPay,
  choose,
  fx,
  get,
  make,
  prepend,
  requireRule,
  shuffle,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import { exhaustCharacter, progressLocation, readyCharacter } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { playerCardImmune } from "./card-immunity";
import { isSacked } from "./carrock";
import { batch4Scenario } from "./batch4-scenarios";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
export const NURN_PLAYER = {
  aragorn: "22137",
  knowledge: "22139",
  haleth: "22140",
  lore: "22141",
  journeyman: "22144",
  path: "22145",
  bond: "22147",
} as const;
const P = NURN_PLAYER;
const SPHERES = ["leadership", "lore", "spirit", "tactics"] as const;
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const live = (u: Unit) => !u.blanked && !isSacked(u);
const state = (s: GameState) => (s.fortressNurnPlayers ??= { contracts: [] });
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const readyable = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  live(u) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !batch4Scenario(s).cannotPlayerReadyCharacter?.(s, u) &&
  !playerEffectImmune(s, u, code);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";

/** Bond of Friendship allows a fourth starting hero. */
export const bondHeroLimit = (cards: Record<string, number> | undefined) =>
  (cards?.[P.bond] ?? 0) > 0 ? 4 : 3;
/** Bond of Friendship's printed deckbuilding restrictions. */
export function bondDeckProblems(
  heroes: string[],
  cards: Record<string, number>,
) {
  if (!cards[P.bond]) return [];
  const problems: string[] = [];
  const entries = Object.entries(cards).filter(
    ([code, n]) => n > 0 && card(code).type_code !== "contract",
  );
  const size = entries.reduce((n, [, v]) => n + v, 0);
  if (size !== 50)
    problems.push("Bond of Friendship needs exactly 50 player cards.");
  for (const sphere of SPHERES) {
    const n = entries
      .filter(([code]) => card(code).sphere_code === sphere)
      .reduce((total, [, v]) => total + v, 0);
    if (n !== 10)
      problems.push(
        `Bond of Friendship needs exactly 10 ${sphere} cards (${n} now).`,
      );
  }
  const titles = new Map<string, number>();
  for (const [code, n] of entries)
    titles.set(card(code).name, (titles.get(card(code).name) ?? 0) + n);
  for (const [title, n] of titles)
    if (n > 2)
      problems.push(`Bond of Friendship: at most 2 copies of ${title}.`);
  const spheres = heroes.map((h) => card(h).sphere_code);
  if (new Set(spheres).size !== spheres.length)
    problems.push(
      "Bond of Friendship: each hero must belong to a different sphere.",
    );
  return problems;
}
export function bondSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count = s.deck.filter((c) => c === P.bond).length;
      if (!count) return;
      const cards: Record<string, number> = {};
      for (const code of s.deck) cards[code] = (cards[code] ?? 0) + 1;
      const problems = bondDeckProblems(
        s.heroes.map((h) => h.code),
        cards,
      );
      requireRule(
        count === 1 && s.heroes.length <= 4 && !problems.length,
        problems[0] ??
          "Bond of Friendship allows one contract and up to four heroes.",
      );
      s.deck = s.deck.filter((c) => c !== P.bond);
      const unit = make(s, P.bond);
      unit.owner = player;
      state(s).contracts.push({ player, unit });
    });
}
export function bondPlayerEliminated(s: GameState, p: number) {
  const q = s.fortressNurnPlayers;
  if (!q) return;
  for (const c of q.contracts.filter((c) => c.player === p))
    forOwner(s, p, () => s.removed.push(c.unit.code));
  q.contracts = q.contracts.filter((c) => c.player !== p);
}
export function validateFortressNurnPlayers(
  s: GameState,
  unit: (v: unknown) => boolean,
) {
  const q = s.fortressNurnPlayers;
  if (q === undefined) return true;
  return (
    !!q &&
    Array.isArray(q.contracts) &&
    q.contracts.every(
      (c) =>
        !!c &&
        seatIndices(s).includes(c.player) &&
        unit(c.unit) &&
        c.unit.code === P.bond,
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length
  );
}
export const fortressNurnPlayerUnit = (s: GameState, id?: string) =>
  s.fortressNurnPlayers?.contracts.find((c) => c.unit.id === id)?.unit;
export const fortressNurnBondPlayers = (s: GameState) =>
  s.fortressNurnPlayers?.contracts.map((c) => c.player) ?? [];

/** Locations with at least one player card attached to them. */
export const woodmanLocations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (l) =>
      card(l.code).type_code === "location" &&
      l.attachments.some(
        (a) => !a.facedown && card(a.code).sphere_code !== "encounter",
      ),
  ).length;
const aragornTargets = (s: GameState) =>
  s.staging.filter(
    (l) =>
      card(l.code).type_code === "location" &&
      !playerCardImmune(l) &&
      !playerEffectImmune(s, l, P.aragorn),
  );
const aragornKey = (u: Unit) => `round:${P.aragorn}:${u.id}`;
const aragornProblem = (s: GameState, u: Unit) =>
  u.code !== P.aragorn || !live(u)
    ? "Aragorn's ability is not active."
    : u.exhausted || khazadCannotExhaust(u) || watcherWaterCannotExhaust(u)
      ? "Exhaust Aragorn to use his ability."
      : s.used.includes(aragornKey(u))
        ? "Aragorn's ability is limited to once per round."
        : !aragornTargets(s).length
          ? "Choose a location in the staging area."
          : null;
export const fortressNurnPlayerAbilityLabel = (code: string) =>
  code === P.aragorn
    ? "Aragorn · Exhaust to lower a location's threat"
    : undefined;
export const fortressNurnPlayerAbilityProblem = (s: GameState, u: Unit) =>
  u.code === P.aragorn ? aragornProblem(s, u) : "No ability.";
export function useFortressNurnPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId || u.code !== P.aragorn) return false;
  const problem = aragornProblem(s, u);
  requireRule(!problem, problem ?? "");
  requireRule(exhaustCharacter(s, u), "Exhaust Aragorn to use his ability.");
  s.used.push(aragornKey(u));
  choose(
    s,
    "Aragorn · Choose a location in the staging area",
    aragornTargets(s).map((l) =>
      option(
        l,
        [
          fx("nurnPlayerAragorn", {
            target: l.id,
            source: u.id,
            player: activeSeat(s),
          }),
        ],
        `${name(l)} · ${threatOf(s, l)} threat`,
      ),
    ),
  );
  return true;
}
export function fortressNurnPlayerPlayProblem(
  s: GameState,
  u: Unit,
  playOrigin: string,
) {
  if (u.code === P.knowledge) {
    if (s.phase !== "planning")
      return "Knowledge of the Enemy is a Planning Action.";
    if (s.used.includes(`round:${P.knowledge}`))
      return "You can only play 1 Knowledge of the Enemy each round.";
  }
  if (
    u.code === P.journeyman &&
    playOrigin === "hand" &&
    !s.engaged.some(isEnemy)
  )
    return "You cannot play Misty Mountain Journeyman from your hand unless you are engaged with an enemy.";
  if (u.code === P.path)
    return "Play A Desperate Path in its response window at the end of the staging step.";
  return null;
}
export function fortressNurnPlayerTargets(s: GameState, code: string) {
  if (code !== P.knowledge) return undefined;
  return allHeroes(s).filter(
    (h) => ownerOf(s, h) === activeSeat(s) && live(h) && canGainResources(s, h),
  );
}
export function fortressNurnPlayerCardPlayed(s: GameState, c: Card) {
  if (c.code === P.knowledge) s.used.push(`round:${P.knowledge}`);
}
export function fortressNurnPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
) {
  if (code === P.knowledge) {
    const hero = get(s, target);
    const n = s.engaged.filter(isEnemy).length;
    if (hero && n && canGainResources(s, hero)) hero.resources += n;
    return true;
  }
  if (code === P.lore) {
    const x = woodmanLocations(s);
    if (x)
      prepend(s, fx("nurnPlayerWoodman", { value: x, player: activeSeat(s) }));
    return true;
  }
  return false;
}
export function fortressNurnPlayerQuestSucceeded(s: GameState) {
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.code === P.haleth && u.committed && live(u))
      .map((u) =>
        fx("nurnPlayerHaleth", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
/** A Desperate Path: its window opens at the end of each staging step. */
export function fortressNurnPlayerStagingEnd(s: GameState) {
  const effects: Effect[] = [];
  for (const player of playerOrder(s))
    if (seatView(s, player).hand.some((h) => h.code === P.path))
      effects.push(fx("nurnPlayerPathOffer", { player }));
  prepend(s, ...effects);
}
export function fortressNurnPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nurnPlayer")) return false;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "nurnPlayerAragorn": {
      const hero = get(s, e.source);
      if (!u || !hero || !s.staging.some((l) => l.id === u.id)) break;
      const x = Math.max(0, stats(s, hero).will);
      const before = threatOf(s, u);
      u.tempThreat = (u.tempThreat ?? 0) - x;
      if (before > 0 && threatOf(s, u) === 0) progressLocation(s, u, 1);
      break;
    }
    case "nurnPlayerWoodman": {
      const remaining = e.value ?? 0;
      const targets = own(s, p).filter(
        (c) => hasTrait(c, "Woodman") && readyable(s, c, P.lore),
      );
      if (remaining > 0 && targets.length)
        choose(s, `Woodman Lore · Ready a Woodman (${remaining} left)`, [
          ...targets.map((c) =>
            option(c, [
              fx("ready", { target: c.id, player: p }),
              fx("nurnPlayerWoodman", { value: remaining - 1, player: p }),
            ]),
          ),
          { id: "done", label: "Ready no more characters", effects: [] },
        ]);
      break;
    }
    case "nurnPlayerHaleth":
      if (u && u.code === P.haleth && live(u) && s.deck.length)
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Haleth · After Haleth quests successfully",
          [
            {
              id: "search",
              label: "Search the top 5 cards for an attachment",
              effects: [fx("nurnPlayerHalethSearch", { player: p })],
            },
            skip,
          ],
        );
      break;
    case "nurnPlayerHalethSearch":
      choose(s, "Haleth · Add an attachment to your hand", [
        ...s.deck
          .slice(0, 5)
          .map((code, i) => ({ code, i }))
          .filter(({ code }) => card(code).type_code === "attachment")
          .map(({ code, i }) => ({
            id: `haleth-${i}`,
            code,
            label: card(code).name,
            effects: [
              fx("nurnPlayerHalethTake", { value: i, code, player: p }),
            ],
          })),
        {
          id: "none",
          label: "Take nothing · Shuffle your deck",
          effects: [fx("nurnPlayerShuffle", { player: p })],
        },
      ]);
      break;
    case "nurnPlayerHalethTake":
      if (e.value !== undefined && e.value < 5 && s.deck[e.value] === e.code)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "nurnPlayerShuffle":
      shuffle(s, s.deck);
      break;
    case "nurnPlayerPathOffer": {
      const event = s.hand.find((h) => h.code === P.path);
      if (!event || !canPay(s, card(event.code))) break;
      choosePlayerResponse(
        s,
        event.id,
        P.path,
        "A Desperate Path · At the end of the staging step",
        [
          {
            id: event.id,
            code: event.code,
            label: "Play A Desperate Path",
            effects: [
              fx("eventPlay", {
                source: event.id,
                code: event.code,
                effects: [fx("nurnPlayerPath", { player: p })],
              }),
              fx("nurnPlayerPathOffer", { player: p }),
            ],
          },
          skip,
        ],
      );
      break;
    }
    case "nurnPlayerPath": {
      let found: string | undefined;
      let reshuffled = false;
      for (;;) {
        if (!s.encounterDeck.length) {
          if (reshuffled || !s.encounterDiscard.length) break;
          reshuffled = true;
          s.encounterDeck.push(...s.encounterDiscard.splice(0));
          shuffle(s, s.encounterDeck);
        }
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "treachery") {
          found = code;
          break;
        }
        s.encounterDiscard.push(code);
      }
      if (!found) break;
      // The treachery resolves its When Revealed effects; it then reaches the
      // discard pile through its own resolution.
      prepend(
        s,
        fx("placeEncounter", { text: "revealed", code: found, player: p }),
        fx("nurnPlayerPathReady", { player: p }),
      );
      break;
    }
    case "nurnPlayerPathReady":
      for (const c of own(s, p).filter((c) => c.committed && live(c))) {
        if (readyable(s, c, P.path)) readyCharacter(s, c);
        if (!playerEffectImmune(s, c, P.path))
          c.tempWill = (c.tempWill ?? 0) + 1;
      }
      break;
    default:
      return false;
  }
  return true;
}
export const fortressNurnPlayerPublic = (s: GameState) =>
  s.fortressNurnPlayers
    ? {
        contracts: s.fortressNurnPlayers.contracts.map((c) => ({
          player: c.player,
          id: c.unit.id,
        })),
      }
    : undefined;
