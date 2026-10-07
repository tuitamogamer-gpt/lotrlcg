// Original/easy Encounter at Amon Dîn. Villager tokens are never spendable resources.
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  shuffle,
  stats,
} from "./core";
import {
  advanceQuest,
  discardCharacter,
  discardHandCard,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  raiseThreat,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import { currentQuestCode } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isSacked } from "./carrock";
import { AMON_DIN as A } from "./amon-din-support";
import type { AmonDinState } from "./amon-din-support";
export { AMON_DIN } from "./amon-din-support";
export interface AmonDinCombat {
  amonDinKilledCharacter?: boolean;
  amonDinShadowVillagers?: number;
}
const isAmon = (s: GameState) =>
  (s.scenarioId as string) === "encounter-at-amon-din";
const first = (s: GameState) => s.table?.first ?? 0;
const state = (s: GameState) =>
  ((s as GameState & { amonDin?: AmonDinState }).amonDin ??= {
    questVillagers: 5,
    ghulatSetAside: true,
  });
const locations = (s: GameState) =>
  [...allActiveLocations(s), ...s.staging].filter(
    (u) => card(u.code).type_code === "location",
  );
const objective = (s: GameState, code: string) =>
  s.staging.find((u) => u.code === code);
const rescued = (s: GameState) => objective(s, A.rescued);
const dead = (s: GameState) => objective(s, A.dead);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function addDead(s: GameState, count: number) {
  const u = dead(s);
  if (u && !u.blanked && count > 0) {
    u.damage += count;
    log(s, `${count} villager(s) die. Dead Villagers: ${u.damage}.`, "danger");
  }
}
function canSave(s: GameState, u: Unit) {
  return (
    !u.blanked &&
    !u.exhausted &&
    !isSacked(u) &&
    !khazadCannotExhaust(u) &&
    !watcherWaterCannotExhaust(u) &&
    locations(s).length > 0
  );
}
/** One simultaneous discard creates one response opportunity, with at most one token saved. */
function discardVillagers(s: GameState, source: Unit, count: number) {
  const removed = Math.min(source.resources, Math.max(0, count));
  if (!removed) return 0;
  source.resources -= removed;
  prepend(s, fx("amonDinAlcaronOffer", { count: removed, player: first(s) }));
  return removed;
}
export function setupAmonDin(s: GameState) {
  state(s);
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![A.ghulat, A.rescued, A.dead, A.alcaron].includes(c),
  );
  const index = s.encounterDeck.indexOf(A.burning);
  if (index >= 0) s.encounterDeck.splice(index, 1);
  placeEncounter(s, A.rescued);
  placeEncounter(s, A.dead);
  forOwner(s, first(s), () => s.allies.push(make(s, A.alcaron)));
  const burning = make(s, A.burning);
  s.activeLocation = burning;
  amonDinLocationEntered(s, burning);
  shuffle(s, s.encounterDeck);
  prepend(s, ...playerOrder(s).map(() => fx("reveal", { player: first(s) })));
  log(
    s,
    "Five villagers need rescuing. Lord Alcaron joins the first player; Burning Farmhouse is active.",
    "chapter",
  );
}
export function amonDinLocationEntered(s: GameState, u: Unit) {
  if (!isAmon(s) || u.blanked) return;
  const match = /Villagers\s+(\d+)/i.exec(card(u.code).text ?? "");
  if (match) u.resources += Number(match[1]);
}
export function amonDinLocationLeft(s: GameState, u: Unit, explored: boolean) {
  if (!isAmon(s) || !u.resources) return;
  const r = rescued(s);
  if (explored && r && !r.blanked) {
    r.resources += u.resources;
    log(s, `${name(u)} rescues ${u.resources} villager(s).`, "good");
    u.resources = 0;
  } else discardVillagers(s, u, u.resources);
}
export function amonDinQuestProgress(s: GameState, count: number) {
  if (!isAmon(s) || s.stage !== 1) return false;
  const q = state(s),
    moved = Math.min(q.questVillagers, Math.max(0, count));
  q.questVillagers -= moved;
  const r = rescued(s);
  if (r) r.resources += moved;
  log(s, `${moved} villager(s) rescued from Savagery of the Orcs.`, "good");
  advanceQuest(s);
  return true;
}
export function advanceAmonDin(s: GameState): boolean {
  if (!isAmon(s)) return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.stage === 1 && state(s).questVillagers === 0) {
    if (questDefeated(s, currentQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("amonDinStageReveal", { player: first(s) }));
  } else if (
    s.stage === 2 &&
    s.progress >= 15 &&
    ![...s.staging, ...allEngaged(s)].some(
      (u) => u.code === A.ghulat && !u.blanked,
    )
  ) {
    if (questDefeated(s, currentQuestCode(s)!)) return true;
    const alive = rescued(s)?.resources ?? 0,
      lost = dead(s)?.damage ?? 0;
    if (alive > lost) {
      s.status = "won";
      s.reason = `Amon Dîn is safe: ${alive} villagers rescued, ${lost} dead.`;
      s.queue = [];
      s.choice = null;
      log(s, s.reason, "chapter");
    } else
      lose(
        s,
        `The rescue fails: ${alive} villagers rescued, ${lost} dead. More villagers must survive than die.`,
      );
  }
  return true;
}
/** Control follows the first player without leaving play, including elimination. */
export function amonDinCheck(s: GameState) {
  if (!isAmon(s) || !s.table) return;
  const u = allCharacters(s).find((c) => c.code === A.alcaron && !c.blanked);
  if (!u || ownerOf(s, u) === first(s)) return;
  const from = ownerOf(s, u);
  forOwner(s, from, () => {
    s.allies = s.allies.filter((a) => a.id !== u.id);
  });
  forOwner(s, first(s), () => s.allies.push(u));
}
export function amonDinCharacterLeftPlay(s: GameState, u: Unit) {
  if (isAmon(s) && u.code === A.alcaron && !u.blanked)
    lose(s, "Lord Alcaron has left play. The rescue is lost.");
}
export const amonDinEnemyAttackBonus = (s: GameState, u: Unit) =>
  isAmon(s) && u.code === A.ghulat && !u.blanked ? (dead(s)?.damage ?? 0) : 0;
export function amonDinAttackStarted(s: GameState, u: Unit) {
  if (isAmon(s) && u.code === A.ghulat && !u.blanked) addDead(s, 1);
}
export function amonDinCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    isAmon(s) &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
    context.combatDamage &&
    context.enemyId === s.combat?.enemyId
  )
    (
      s.combat as NonNullable<GameState["combat"]> & AmonDinCombat
    ).amonDinKilledCharacter = true;
}
export function amonDinAttackFinished(
  s: GameState,
  u: Unit,
  completed: NonNullable<GameState["combat"]> & AmonDinCombat,
) {
  if (!isAmon(s) || !completed.amonDinKilledCharacter) return;
  if (u.code === A.marauder && !u.blanked) addDead(s, 1);
  const r = rescued(s);
  if (r && completed.amonDinShadowVillagers)
    discardVillagers(s, r, completed.amonDinShadowVillagers);
}
export function amonDinUndefendedDamage(
  s: GameState,
  _enemy: Unit,
  amount: number,
) {
  if (!isAmon(s) || s.stage !== 2) return false;
  const r = rescued(s);
  if (r) discardVillagers(s, r, amount);
  return true;
}
export function amonDinTreacheryRevealed(
  s: GameState,
  code: string,
  origin = "encounter",
) {
  if (
    !isAmon(s) ||
    origin !== "encounter" ||
    card(code).type_code !== "treachery"
  )
    return;
  prepend(
    s,
    ...s.staging
      .filter((u) => u.code === A.hamlet && !u.blanked)
      .map((u) =>
        fx("amonDinDiscardLocation", {
          target: u.id,
          count: 1,
          player: first(s),
        }),
      ),
  );
}
export const amonDinRoundEndEffects = (s: GameState): Effect[] =>
  isAmon(s)
    ? locations(s)
        .filter((u) => u.code === A.burning && !u.blanked)
        .map((u) =>
          fx("amonDinDiscardLocation", {
            target: u.id,
            count: 1,
            player: first(s),
          }),
        )
    : [];
export const amonDinTravelEffects = (
  s: GameState,
  u: Unit,
): Effect[] | undefined =>
  isAmon(s) && u.code === A.secluded && !u.blanked
    ? [fx("reveal", { player: first(s) })]
    : undefined;
export function amonDinEncounter(
  s: GameState,
  code: string,
  replay = false,
): boolean {
  if (!isAmon(s)) return false;
  if (code === A.ravager || code === A.trapped) {
    const count = code === A.ravager ? 1 : playerOrder(s).length;
    if (!s.activeLocation || !discardVillagers(s, s.activeLocation, count))
      prepend(s, fx("reveal", { player: first(s) }));
  } else if (code === A.homestead) {
    const amount = dead(s)?.damage ?? 0;
    for (const player of playerOrder(s))
      forOwner(s, player, () => raiseThreat(s, amount, "encounter"));
  } else if (code === A.panicked) {
    prepend(
      s,
      fx("amonDinPanicked", {
        ids: playerOrder(s).map(String),
        count: 0,
        player: first(s),
      }),
    );
  } else if (code === A.eagle) {
    const characters = allCharacters(s),
      lowest = Math.min(
        ...characters.map((u) => stats(s, u).health - u.damage),
      );
    selectSeat(s, first(s));
    choose(
      s,
      "Craven Eagle · Fewest remaining hit points",
      opts(
        characters.filter((u) => stats(s, u).health - u.damage === lowest),
        (u) => [
          fx("amonDinEaglePrevent", { target: u.id, player: ownerOf(s, u) }),
        ],
      ),
    );
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function amonDinShadow(s: GameState, code: string): boolean {
  if (!isAmon(s) || !s.combat) return false;
  const c = s.combat as NonNullable<GameState["combat"]> & AmonDinCombat;
  if (code === A.marauder || code === A.trapped)
    c.amonDinShadowVillagers = (c.amonDinShadowVillagers ?? 0) + 1;
  else if (code === A.ravager) {
    const defended = (
      c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
    ).some((id) => !!get(s, id));
    c.attackBonus += defended ? 1 : 2;
  } else if (code === A.homestead)
    raiseThreat(s, dead(s)?.damage ?? 0, "encounter");
  else if (code === A.panicked) c.attackBonus += dead(s)?.damage ?? 0;
  else return false;
  return true;
}
export function handleAmonDinEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "amonDinStageReveal":
      if (state(s).ghulatSetAside) {
        state(s).ghulatSetAside = false;
        placeEncounter(s, A.ghulat);
      }
      s.stageRevealing = false;
      log(
        s,
        "Stage 2 · Protect the Villagers. Ghulat enters the staging area.",
        "chapter",
      );
      break;
    case "amonDinDiscardLocation":
      if (u && card(u.code).type_code === "location")
        discardVillagers(s, u, e.count ?? 1);
      break;
    case "amonDinAlcaronOffer": {
      const alcaron = allCharacters(s).find(
        (c) => c.code === A.alcaron && canSave(s, c),
      );
      if (!alcaron) {
        addDead(s, e.count ?? 0);
        break;
      }
      const player = ownerOf(s, alcaron);
      selectSeat(s, player);
      choose(
        s,
        "Lord Alcaron · Save one discarded villager?",
        [
          ...opts(
            locations(s),
            (location) => [
              fx("amonDinAlcaronSave", {
                source: alcaron.id,
                target: location.id,
                count: e.count,
                player,
              }),
            ],
            (l) => `${l.resources} villager(s) here`,
          ),
          {
            id: "skip",
            label: "Do not exhaust Lord Alcaron",
            effects: [fx("amonDinDead", { count: e.count })],
          },
        ],
        "Exhaust Lord Alcaron to place one discarded villager on a location instead.",
      );
      break;
    }
    case "amonDinAlcaronSave": {
      const alcaron = get(s, e.source);
      if (
        alcaron &&
        canSave(s, alcaron) &&
        u &&
        locations(s).some((l) => l.id === u.id)
      ) {
        exhaustCharacter(s, alcaron);
        u.resources++;
        addDead(s, Math.max(0, (e.count ?? 1) - 1));
        log(s, `Lord Alcaron saves a villager at ${name(u)}.`, "good");
      } else addDead(s, e.count ?? 0);
      break;
    }
    case "amonDinDead":
      addDead(s, e.count ?? 0);
      break;
    case "amonDinPanicked": {
      const players = e.ids ?? [],
        r = rescued(s),
        locs = s.staging.filter((l) => card(l.code).type_code === "location");
      if (!players.length) {
        if (!e.count) prepend(s, fx("reveal", { player: first(s) }));
        break;
      }
      const player = Number(players[0]);
      if (!r?.resources || !locs.length || !playerOrder(s).includes(player)) {
        prepend(s, { ...e, ids: players.slice(1) });
        break;
      }
      selectSeat(s, player);
      choose(
        s,
        "Panicked! · Move one rescued villager",
        opts(locs, (l) => [
          fx("amonDinPanickedMove", {
            target: l.id,
            ids: players.slice(1),
            count: (e.count ?? 0) + 1,
            player,
          }),
        ]),
      );
      break;
    }
    case "amonDinPanickedMove": {
      const r = rescued(s);
      if (r?.resources && u && s.staging.some((l) => l.id === u.id)) {
        r.resources--;
        u.resources++;
      }
      prepend(
        s,
        fx("amonDinPanicked", { ids: e.ids, count: e.count, player: first(s) }),
      );
      break;
    }
    case "amonDinEaglePrevent":
      if (u) {
        const hand = seatView(s, ownerOf(s, u)).hand;
        choose(s, "Craven Eagle · Prevent the discard?", [
          ...(hand.length >= 3
            ? [
                {
                  id: "prevent",
                  label: "Discard 3 random cards",
                  effects: [fx("amonDinEagleRandom", { target: u.id })],
                },
              ]
            : []),
          {
            id: "discard",
            label: `Discard ${name(u)}`,
            effects: [fx("amonDinEagleDiscard", { target: u.id })],
          },
        ]);
      }
      break;
    case "amonDinEagleRandom":
      if (u)
        forOwner(s, ownerOf(s, u), () => {
          if (s.hand.length < 3) {
            discardCharacter(s, u);
            return;
          }
          for (let i = 0; i < 3; i++)
            discardHandCard(
              s,
              s.hand[Math.floor(random(s) * s.hand.length)].id,
            );
        });
      break;
    case "amonDinEagleDiscard":
      if (u) discardCharacter(s, u);
      break;
    default:
      return false;
  }
  return true;
}
