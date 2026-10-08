import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  units,
} from "./core";
import {
  addVictoryCard,
  damage,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  questDefeated,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, mainQuestCode } from "./quest-state";
import { choosePlayerResponse } from "./player-ability-triggers";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  ETTEN as E,
  ETTEN_RECIPES,
  ETTEN_SAFE,
  ETTEN_SIDES,
} from "./ettenmoors-support";

const isEtten = (s: GameState) => !!s.ettenmoors;
const safe = (u: Unit) => ETTEN_SAFE.includes(u.code);
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const hero = (u: Unit) => card(u.code).type_code === "hero";
const ally = (s: GameState) =>
  allCharacters(s).find((u) => u.code === E.amarthiul);
const exhaustedCharacters = (s: GameState) =>
  allCharacters(s).filter((u) => u.exhausted);
const enemies = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "enemy");
const damaged = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player && u.damage > 0)
    .length;
const trait = (code: string, value: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === value);
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);

export const ettenSafeActive = (s: GameState) =>
  isEtten(s) && allActiveLocations(s).some(safe);
export const ettenNoEngagementChecks = ettenSafeActive;
export const ettenSideQuestBlanked = (s: GameState, u: Unit) =>
  ettenSafeActive(s) && card(u.code).type_code === "encounter-side-quest";
/** Safe cancels only treachery When Revealed text; Surge and Doomed still resolve. */
export const ettenIgnoreWhenRevealed = (s: GameState, code: string) =>
  ettenSafeActive(s) && card(code).type_code === "treachery";
export const ettenExtraReveals = (s: GameState) =>
  isEtten(s) && s.stage === 2 && !ettenSafeActive(s) ? 1 : 0;
export const ettenWillPenalty = (s: GameState, u: Unit) =>
  isEtten(s) && s.stage === 3 && u.damage > 0 && !ettenSafeActive(s) ? -2 : 0;
export const ettenPlayCost = (s: GameState, _c?: Card) =>
  isEtten(s) ? live(s, E.scavenge).length : 0;
export const ettenCannotReady = (_s: GameState, u: Unit) =>
  u.attachments.some((a) => a.code === E.noRest && !a.blanked);
export const ettenCannotCollectResources = ettenCannotReady;
export const ettenCanAttack = (_s: GameState, enemy: Unit, character: Unit) =>
  enemy.blanked || enemy.code !== E.goblin || character.damage === 0;
export const ettenCanDefend = ettenCanAttack;
export const ettenEngagementModifier = (s: GameState) =>
  isEtten(s) && s.ettenmoors!.lowEngagementRound === s.round
    ? -s.ettenmoors!.lowEngagementPenalty
    : 0;
export function ettenStats(s: GameState, u: Unit) {
  const ruthless = !u.blanked && u.code === E.ruthless && u.damage >= 3 ? 2 : 0;
  return {
    attack:
      ruthless +
      (!u.blanked &&
      u.code === E.spawn &&
      allEngaged(s).some((e) => e.id === u.id)
        ? damaged(s, ownerOf(s, u))
        : 0),
    defense: ruthless,
  };
}
export const ettenRevealDoomed = (s: GameState, code: string) =>
  isEtten(s) && trait(code, "Weather")
    ? allActiveLocations(s).filter((u) => u.code === E.fells && !u.blanked)
        .length
    : 0;
export function ettenTravelProblem(s: GameState, u: Unit) {
  return isEtten(s) &&
    safe(u) &&
    units(s).some((guard) => guard.guarding === u.id)
    ? "This Safe objective-location is still guarded by an encounter card."
    : null;
}
/** Barren Moorland's Travel is a cost, paid before becoming active. */
export function ettenTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (isEtten(s) && u.code === E.moorland && !u.blanked)
    return exhaustedCharacters(s).map((c) =>
      fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
    );
  return undefined;
}
export function ettenCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  guarding?: string,
) {
  if (isEtten(s) && safe(u) && fromReveal && !guarding)
    prepend(s, fx("guardObjective", { target: u.id, player: firstPlayer(s) }));
}

export function setupEttenmoors(s: GameState) {
  const recipe = ETTEN_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  // DragnCards separates all four Trollspawn for setup convenience. Only the
  // copies added to staging leave the deck; unused copies stay in the deck.
  s.encounterDeck.push(...Array<string>(4).fill(E.spawn));
  s.ettenmoors = {
    initialized: false,
    lieLowProgressRound: {},
    lowEngagementRound: -1,
    lowEngagementPenalty: 0,
  };
}
export function ettenOpeningHandsKept(s: GameState) {
  if (!s.ettenmoors || s.ettenmoors.initialized) return false;
  prepend(s, fx("ettenSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function ettenCheck(s: GameState) {
  if (!s.ettenmoors?.initialized || s.status !== "playing") return;
  if (!ally(s)) {
    s.status = "lost";
    s.reason = "Amarthiúl has left play. The Rangers' journey has failed.";
    s.queue = [];
    s.choice = null;
  }
}
export function ettenQuestStart(s: GameState) {
  if (
    isEtten(s) &&
    s.stage === 1 &&
    !s.staging.some((u) => card(u.code).type_code === "encounter-side-quest")
  )
    prepend(s, fx("ettenFindSide", { flag: false, player: firstPlayer(s) }));
}
export function ettenProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (s.ettenmoors && amount > 0 && quest.code === E.lieLow)
    s.ettenmoors.lieLowProgressRound[quest.id] = s.round;
}
export function ettenEndQuest(s: GameState) {
  if (!isEtten(s)) return;
  const effects = live(s, E.lieLow)
    .filter((u) => s.ettenmoors!.lieLowProgressRound[u.id] !== s.round)
    .map((u) =>
      fx("ettenLieLowPenalty", { source: u.id, player: firstPlayer(s) }),
    );
  effects.push(
    ...allActiveLocations(s)
      .filter(safe)
      .map((u) =>
        fx("ettenSafeVictory", { target: u.id, player: firstPlayer(s) }),
      ),
  );
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        effects,
        player: firstPlayer(s),
        text: "End of quest phase · Choose the next Forced effect",
      }),
    );
  else prepend(s, ...effects);
}
/** Safe's keyword acts immediately, before travel Responses are offered. */
export function ettenTravelEntered(s: GameState, u: Unit) {
  if (!isEtten(s) || !safe(u)) return;
  for (const enemy of [...allEngaged(s)]) {
    forOwner(s, ownerOf(s, enemy), () => {
      s.engaged = s.engaged.filter((x) => x.id !== enemy.id);
    });
    delete enemy.owner;
    s.staging.push(enemy);
    enemyAddedToStaging(s, enemy);
  }
  for (const character of allCharacters(s))
    for (const attachment of [...character.attachments].filter(
      (a) => a.code === E.noRest,
    ))
      discardAttachment(s, character, attachment, true);
  prepend(
    s,
    fx("ettenSafeResponse", {
      source: u.id,
      code: u.code,
      player: firstPlayer(s),
    }),
  );
}
export function ettenEngaged(s: GameState, u: Unit) {
  if (!isEtten(s)) return;
  const player = ownerOf(s, u),
    effects: Effect[] = [];
  if (u.code === E.giant && !u.blanked)
    effects.push(
      fx("ettenGiantDamage", { source: u.id, player, count: 3, ids: [] }),
    );
  const ranger = ally(s);
  if (ranger && !ranger.blanked && ownerOf(s, ranger) !== player)
    effects.push(
      fx("ettenAmarthiulResponse", {
        source: ranger.id,
        player: ownerOf(s, ranger),
        value: player,
      }),
    );
  prepend(s, ...effects);
}
export function ettenAllyEntered(s: GameState, u: Unit) {
  if (
    !isEtten(s) ||
    !["ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const effects = live(s, E.moorland).map((l) =>
    fx("ettenMoorland", { source: l.id, target: u.id, player: ownerOf(s, u) }),
  );
  if (effects.length > 1)
    prepend(s, fx("fangornOrder", { effects, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
export function ettenResourcesSpent(s: GameState, u: Unit, amount: number) {
  if (!isEtten(s) || !hero(u) || amount <= 0) return;
  prepend(
    s,
    ...live(s, E.forage).map((q) =>
      fx("ettenForageDamage", {
        source: q.id,
        code: q.code,
        target: u.id,
        value: 1,
        player: ownerOf(s, u),
      }),
    ),
  );
}
export function ettenDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const enemy = context.enemyId ? get(s, context.enemyId) : undefined;
  if (
    !isEtten(s) ||
    !context.combatDamage ||
    !enemy ||
    enemy.code !== E.cruel ||
    enemy.blanked
  )
    return;
  // The board invokes this after replacements and actual damage placement,
  // before destruction; tokens above remaining hit points are still dealt.
  const before = u.damage - value;
  const excess = Math.max(0, value - Math.max(0, stats(s, u).health - before));
  if (excess)
    prepend(
      s,
      fx("ettenRemoveAllQuestProgress", {
        value: excess,
        player: firstPlayer(s),
      }),
    );
}
export function ettenSideDefeated(
  s: GameState,
  u: Unit,
  goal = card(u.code).quest ?? 0,
) {
  if (!isEtten(s)) return;
  const effects: Effect[] = [];
  if (s.stage === 1)
    effects.push(
      fx("ettenMainProgress", { value: goal, player: firstPlayer(s) }),
    );
  if (!u.blanked && u.code === E.scavenge)
    effects.push(
      fx("ettenScavengeTroll", { source: u.id, player: firstPlayer(s) }),
      ...playerOrder(s).map((player) => fx("ettenFreePlay", { player })),
    );
  if (!u.blanked && [E.lieLow, E.forage].includes(u.code))
    effects.push(
      fx("ettenSideResponse", {
        source: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  prepend(s, ...effects);
}
export function ettenAdvance(s: GameState) {
  if (!isEtten(s)) return false;
  if (
    !s.ettenmoors!.initialized ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice
  )
    return true;
  const goal = s.stage === 1 ? 10 : s.stage === 2 ? 20 : 17;
  if (s.progress < goal) return true;
  if (questDefeated(s, mainQuestCode(s)!)) return true;
  if (s.stage === 3) win(s);
  else {
    s.stage = (s.stage + 1) as 2 | 3;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("ettenStageReveal", { player: firstPlayer(s) }));
  }
  return true;
}
export function ettenEncounter(s: GameState, code: string, replay = false) {
  if (!isEtten(s)) return false;
  if (code === E.noRest) {
    const heroes = allCharacters(s).filter(hero),
      exhausted = heroes.filter((u) => u.exhausted);
    const targets = (exhausted.length ? exhausted : heroes).filter(
      (u) => !u.attachments.some((a) => a.code === code),
    );
    if (targets.length)
      choose(
        s,
        "No Rest · Attach to a hero",
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("ettenAttachNoRest", { target: u.id, code })],
        })),
      );
    else if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (code === E.arador)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("ettenArador", { player })),
    );
  else if (code === E.fells) {
    const location = [...s.staging].reverse().find((u) => u.code === code);
    if (location && !location.guarding)
      prepend(
        s,
        fx("ettenFellsSearch", { target: location.id, player: firstPlayer(s) }),
      );
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function ettenShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!isEtten(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  if (code === E.spawn) c.attackBonus += damaged(s, player);
  else if (code === E.giant) {
    if (defenders.some((u) => u.damage > 0))
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else if (code === E.goblin) c.attackBonus += defenders.length ? 1 : 3;
  else if (code === E.ruthless)
    prepend(s, fx("ettenShuffleSafe", { player: firstPlayer(s) }));
  else return false;
  return true;
}
function searchOptions(
  s: GameState,
  predicate: (code: string) => boolean,
  effect: string,
  target?: string,
): Option[] {
  return (["deck", "discard"] as const).flatMap((zone) =>
    (zone === "deck" ? s.encounterDeck : s.encounterDiscard).flatMap(
      (code, index) =>
        predicate(code)
          ? [
              {
                id: `${zone}-${index}`,
                code,
                label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
                effects: [
                  fx(effect, {
                    code,
                    value: index,
                    text: zone,
                    target,
                    player: activeSeat(s),
                  }),
                ],
              },
            ]
          : [],
    ),
  );
}
function takeEncounter(s: GameState, e: Effect) {
  const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
  return e.value !== undefined && pile[e.value] === e.code
    ? pile.splice(e.value, 1)[0]
    : undefined;
}
function highestThreat(s: GameState) {
  const players = playerOrder(s),
    high = Math.max(...players.map((p) => seatView(s, p).threat));
  return players.filter((p) => seatView(s, p).threat === high);
}
export function ettenEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("etten")) return false;
  if (!s.ettenmoors) return true;
  const q = s.ettenmoors,
    u = get(s, e.target);
  switch (e.kind) {
    case "ettenForageDamage":
      if (u) damage(s, u.id, e.value ?? 1);
      break;
    case "ettenSetup": {
      const sides = shuffle(s, [...ETTEN_SIDES]),
        safes = shuffle(s, [...ETTEN_SAFE]);
      const side = make(s, sides.shift()!),
        location = make(s, safes.shift()!);
      side.guarding = location.id;
      s.staging.push(side, location);
      for (const _player of playerOrder(s)) {
        const index = s.encounterDeck.indexOf(E.spawn);
        if (index >= 0) {
          const enemy = make(s, s.encounterDeck.splice(index, 1)[0]);
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
        }
      }
      s.encounterDeck.push(...sides, ...safes);
      shuffle(s, s.encounterDeck);
      const ranger = make(s, E.amarthiul);
      ranger.controller = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(ranger));
      q.initialized = true;
      log(
        s,
        `${name(location)} is guarded by ${name(side)}. Amarthiúl joins the first player.`,
        "chapter",
      );
      break;
    }
    case "ettenStageReveal":
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        fx("ettenFindSide", { flag: true, player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "ettenFindSide": {
      let found: string | undefined;
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "encounter-side-quest") {
          found = code;
          break;
        }
        s.encounterDiscard.push(code);
      }
      if (found) {
        if (e.flag) revealed(s, found);
        else {
          const side = make(s, found);
          s.staging.push(side);
          log(s, `${name(side)} is added to staging without being revealed.`);
        }
      }
      break;
    }
    case "ettenMainProgress":
      s.progress += e.value ?? 0;
      break;
    case "ettenLieLowPenalty":
      if (q.lowEngagementRound !== s.round) {
        q.lowEngagementRound = s.round;
        q.lowEngagementPenalty = 0;
      }
      q.lowEngagementPenalty += 20;
      break;
    case "ettenSafeVictory":
      if (u && safe(u) && allActiveLocations(s).some((l) => l.id === u.id)) {
        removeActiveLocation(s, u.id);
        addVictoryCard(s, u.code);
        for (const attachment of [...u.attachments])
          discardAttachment(s, u, attachment, true);
        log(
          s,
          `${name(u)} is added to the victory display at the end of the quest phase.`,
          "good",
        );
      }
      break;
    case "ettenSafeResponse": {
      if (!e.source || !e.code || !get(s, e.source)) break;
      let effects: Effect[];
      if (e.code === E.camp)
        effects = playerOrder(s).map((player) =>
          fx("ettenCampRecover", { player }),
        );
      else if (e.code === E.cave)
        effects = playerOrder(s).map((player) =>
          fx("draw", { value: 3, player }),
        );
      else if (e.code === E.woods)
        effects = allCharacters(s)
          .filter(hero)
          .map((h) =>
            fx("resource", { target: h.id, value: 1, player: ownerOf(s, h) }),
          );
      else
        effects = allCharacters(s)
          .filter((c) => c.damage > 0)
          .map((c) =>
            fx("heal", { target: c.id, value: 1, player: ownerOf(s, c) }),
          );
      choosePlayerResponse(
        s,
        e.source,
        e.code,
        `${card(e.code).name} · Travel response`,
        [
          {
            id: "use",
            label: "Use the travel response",
            code: e.code,
            effects,
          },
          skip,
        ],
        undefined,
        e.player ?? firstPlayer(s),
      );
      break;
    }
    case "ettenCampRecover":
      if (!s.discard.length) break;
      choose(s, "Abandoned Camp · Return a card to your hand", [
        ...s.discard.map((code, index) => ({
          id: `card-${index}`,
          code,
          label: card(code).name,
          effects: [fx("ettenCampTake", { code, value: index })],
        })),
        { id: "skip", label: "Do not return a card", effects: [] },
      ]);
      break;
    case "ettenCampTake":
      if (e.value !== undefined && s.discard[e.value] === e.code)
        s.hand.push(make(s, s.discard.splice(e.value, 1)[0]));
      break;
    case "ettenAmarthiulResponse": {
      const ranger = e.source ? get(s, e.source) : undefined;
      if (
        !ranger ||
        ranger.blanked ||
        e.value === undefined ||
        ownerOf(s, ranger) === e.value
      )
        break;
      choosePlayerResponse(
        s,
        ranger.id,
        ranger.code,
        "Amarthiúl · Follow the engaged player?",
        [
          {
            id: "give",
            label: `Give control to ${seatName(s, e.value)}`,
            code: ranger.code,
            effects: [
              fx("ettenGiveAmarthiul", { target: ranger.id, value: e.value }),
            ],
          },
          skip,
        ],
        undefined,
        e.player ?? ownerOf(s, ranger),
      );
      break;
    }
    case "ettenGiveAmarthiul":
      if (u && e.value !== undefined && playerOrder(s).includes(e.value)) {
        forOwner(s, ownerOf(s, u), () => {
          s.allies = s.allies.filter((x) => x.id !== u.id);
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
        u.controller = e.value;
        forOwner(s, e.value, () => s.allies.push(u));
      }
      break;
    case "ettenGiantDamage": {
      const used = e.ids ?? [],
        remaining = e.count ?? 0;
      const targets = allCharacters(s).filter(
        (c) => ownerOf(s, c) === activeSeat(s) && !used.includes(c.id),
      );
      if (!remaining || !targets.length) break;
      choose(
        s,
        "Coldfell Giant · Damage a different character",
        targets.map((c) => ({
          id: c.id,
          code: c.code,
          label: `${name(c)} · 1 damage`,
          effects: [
            fx("damage", { target: c.id, value: 1 }),
            fx("ettenGiantDamage", {
              source: e.source,
              count: remaining - 1,
              ids: [...used, c.id],
            }),
          ],
        })),
      );
      break;
    }
    case "ettenMoorland":
      if (u)
        choose(s, "Barren Moorland · Exhaust the entering ally or damage it", [
          ...(canExhaust(u)
            ? [
                {
                  id: "exhaust",
                  label: `Exhaust ${name(u)}`,
                  code: u.code,
                  effects: [fx("exhaust", { target: u.id })],
                },
              ]
            : []),
          {
            id: "damage",
            label: `Deal 1 damage to ${name(u)}`,
            code: u.code,
            effects: [fx("damage", { target: u.id, value: 1 })],
          },
        ]);
      break;
    case "ettenRemoveAllQuestProgress":
      for (const quest of allQuestUnits(s)) {
        if (quest.id.startsWith("quest:"))
          s.progress = Math.max(0, s.progress - (e.value ?? 0));
        else quest.progress = Math.max(0, quest.progress - (e.value ?? 0));
      }
      break;
    case "ettenAttachNoRest":
      if (u && hero(u) && !u.attachments.some((a) => a.code === E.noRest))
        u.attachments.push({
          id: make(s, E.noRest).id,
          code: E.noRest,
          exhausted: false,
        });
      else s.encounterDiscard.push(E.noRest);
      break;
    case "ettenFellsSearch": {
      const options = searchOptions(
        s,
        (code) => ETTEN_SAFE.includes(code),
        "ettenFellsTake",
        e.target,
      );
      if (options.length)
        choose(s, "Troll-fells · Choose a Safe location", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "ettenFellsTake": {
      const code = takeEncounter(s, e);
      if (code && u) {
        const location = make(s, code);
        u.guarding = location.id;
        s.staging.push(location);
      } else if (code) s.encounterDiscard.push(code);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "ettenArador": {
      const options: Option[] = enemies(s)
        .filter((enemy) => engagementCost(s, enemy) > s.threat)
        .map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: `Engage ${name(enemy)} · deal 2 shadow cards`,
          effects: [fx("ettenAradorEngage", { target: enemy.id })],
        }));
      if (
        [...s.encounterDeck, ...s.encounterDiscard].some(
          (code) => trait(code, "Troll") || trait(code, "Giant"),
        )
      )
        options.push({
          id: "search",
          label: "Search for a Troll or Giant and add it to staging",
          effects: [fx("ettenAradorSearch")],
        });
      if (options.length)
        choose(s, "Arador's Bane · Engage or search", options);
      break;
    }
    case "ettenAradorEngage":
      if (u && s.staging.some((enemy) => enemy.id === u.id)) {
        const continuation = s.queue;
        s.queue = [];
        engage(s, u);
        s.queue.push(
          fx("ettenAradorShadows", { target: u.id, player: activeSeat(s) }),
          ...continuation,
        );
      }
      break;
    case "ettenAradorShadows":
      if (u)
        for (let n = 0; n < 2; n++) {
          const code = encounterDraw(s, true);
          if (code) u.shadows.push(code);
        }
      break;
    case "ettenAradorSearch": {
      const options = searchOptions(
        s,
        (code) => trait(code, "Troll") || trait(code, "Giant"),
        "ettenAradorTake",
      );
      if (options.length)
        choose(s, "Arador's Bane · Choose a Troll or Giant", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "ettenAradorTake": {
      const code = takeEncounter(s, e);
      if (code) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "ettenShuffleSafe": {
      const locations = [...s.staging, ...allActiveLocations(s)].filter(safe);
      if (locations.length)
        choose(
          s,
          "Ruthless Hill-troll · Shuffle a Safe location into the deck",
          locations.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("ettenShuffleSafeTake", { target: l.id })],
          })),
        );
      break;
    }
    case "ettenShuffleSafeTake":
      if (u && safe(u)) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        removeActiveLocation(s, u.id);
        for (const guard of units(s))
          if (guard.guarding === u.id) delete guard.guarding;
        for (const attachment of [...u.attachments])
          discardAttachment(s, u, attachment, true);
        s.encounterDeck.push(u.code);
        shuffle(s, s.encounterDeck);
      }
      break;
    case "ettenSideResponse": {
      if (!e.source || !e.code) break;
      const effects =
        e.code === E.forage
          ? allCharacters(s)
              .filter((c) => hero(c) && c.damage > 0)
              .map((c) =>
                fx("heal", { target: c.id, value: 1, player: ownerOf(s, c) }),
              )
          : [fx("ettenLieLowShuffle", { player: firstPlayer(s) })];
      if (e.code === E.lieLow && !enemies(s).length) break;
      choosePlayerResponse(
        s,
        e.source,
        e.code,
        `${card(e.code).name} · Defeated response`,
        [
          {
            id: "use",
            label:
              e.code === E.forage
                ? "Heal 1 damage from each hero"
                : "Shuffle a staging enemy into the encounter deck",
            effects,
          },
          skip,
        ],
        undefined,
        e.player ?? firstPlayer(s),
      );
      break;
    }
    case "ettenLieLowShuffle":
      if (enemies(s).length)
        choose(
          s,
          "Lie Low · Choose a staging enemy",
          enemies(s).map((enemy) => ({
            id: enemy.id,
            code: enemy.code,
            label: name(enemy),
            effects: [fx("ettenLieLowTake", { target: enemy.id })],
          })),
        );
      break;
    case "ettenLieLowTake":
      if (u && enemies(s).some((enemy) => enemy.id === u.id)) {
        s.staging = s.staging.filter((enemy) => enemy.id !== u.id);
        s.encounterDiscard.push(...u.shadows);
        for (const attachment of [...u.attachments])
          discardAttachment(s, u, attachment, true);
        s.encounterDeck.push(u.code);
        shuffle(s, s.encounterDeck);
      }
      break;
    case "ettenScavengeTroll": {
      const options = searchOptions(
        s,
        (code) => trait(code, "Troll"),
        "ettenScavengeTake",
      );
      if (options.length)
        choose(s, "Scavenge for Supplies · Choose a Troll", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "ettenScavengeTake": {
      const code = takeEncounter(s, e);
      shuffle(s, s.encounterDeck);
      if (!code) break;
      const enemy = make(s, code),
        players = highestThreat(s);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      if (players.length === 1)
        prepend(
          s,
          fx("ettenScavengeEngage", { target: enemy.id, player: players[0] }),
        );
      else
        choose(
          s,
          "Scavenge for Supplies · Highest threat is tied",
          players.map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [fx("ettenScavengeEngage", { target: enemy.id, player })],
          })),
        );
      break;
    }
    case "ettenScavengeEngage":
      if (u) engage(s, u);
      break;
    // The central free-hand-play helper is dispatched by effects.ts so this
    // scenario never fabricates a deck card or bypasses printed play limits.
    case "ettenFreePlay":
      prepend(s, fx("freeHandPlay", { player: activeSeat(s) }));
      break;
    default:
      return false;
  }
  return true;
}
