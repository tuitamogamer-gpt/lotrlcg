import type { Effect, GameState } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, shuffle, stats } from "./core";
import { discardAttachment, questDefeated, win } from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import {
  WQ,
  WQ_SETS,
  WQ_STAGE2,
  WQ_STAGE3,
  wqCost,
  wqHasTrait,
  wqRecipe,
  wqSetLabel,
  wqStageInfo,
  wqStageOf,
} from "./wizards-quest-support";
import { wqCardEffect, wqEncounter, wqShadow } from "./wizards-quest-cards";
import {
  charactersOf,
  engagedWith,
  enemiesInPlay,
  inPlay,
  isEnemy,
  isLocation,
  live,
  phaseKey,
  players,
  removeProgress,
  searchable,
  seatLabel,
  stageNumber,
  takeFrom,
  takeSearched,
  toStaging,
  who,
} from "./wizards-quest-lib";
export * from "./wizards-quest-support";

/**
 * The Wizard's Quest (2018 Fellowship event), played cooperatively. The
 * players build the quest deck from Radagast's Request and one stage 2 and one
 * stage 3 card, and the encounter deck from 7 of the 14 encounter sets (the
 * quick build); the first player resolves each 'opposing team' effect. They
 * travel to Rhosgobel, cross Mirkwood and scout Dol Guldur.
 */
const at = (s: GameState, code: string) =>
  s.wizardsQuest?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const atStage3B = (s: GameState) => stageNumber(s) === 3 && !s.stageRevealing;
const rider = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].find((u) => u.code === WQ.rider);
const guardInPlay = (s: GameState, id: string) =>
  [...s.staging, ...globalEngaged(s)].some((u) => u.id === id);
const underShadow = (s: GameState) =>
  !!s.wizardsQuest &&
  (s.questAttachments?.[s.wizardsQuest.currentQuest] ?? []).some(
    (a) => a.code === WQ.shadow,
  );

// ---------------------------------------------------------------------------
// Setup and the quick build.

export function setupWizardsQuest(s: GameState) {
  const r = wqRecipe();
  const cards = r.cards.flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = [];
  s.wizardsQuest = {
    currentQuest: WQ.request,
    questDeck: [],
    defeated: [],
    box: cards.filter((c) => c !== WQ.request),
    sets: [],
    building: { stage2: null, stage3: null },
    advancing: false,
    forkId: null,
    carried: [],
    passGuards: [],
    guardedHeroes: [],
    noCancel: null,
    huntingAttack: null,
    nightfall: [],
    plays: [],
    storm: null,
    fog: null,
    pine: null,
    fogShadow: [],
    noReady: [],
    noDamage: [],
    engagedRound: [],
    boosts: [],
    gladeRound: null,
    resolving: [],
  };
  log(
    s,
    "The Wizard's Quest: the players choose a stage 2 and a stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.wizardsQuest;
  if (!q) return false;
  if (
    q.building ||
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = wqStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // The stages that cannot be defeated yet.
  if (
    q.currentQuest === WQ.request &&
    [...s.staging, ...(s.activeLocation ? [s.activeLocation] : [])].some(
      (u) => u.code === WQ.rhosgobel,
    )
  )
    return true;
  if (q.currentQuest === WQ.fork && q.forkId && inPlay(s, q.forkId))
    return true;
  if (q.currentQuest === WQ.dungeons && q.guardedHeroes.length) return true;
  if (q.currentQuest === WQ.return && rider(s)) return true;
  if (stageNumber(s) === 3) {
    win(
      s,
      "The players return from Dol Guldur with news for Rhosgobel: they win the game!",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("wqDefeatQuest", { player: firstPlayer(s) }));
  return true;
}

function wqStageEffect(s: GameState, e: Effect): boolean {
  const q = s.wizardsQuest;
  if (!q || !e.kind.startsWith("wq")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "wqChooseStage": {
      const stage = e.value ?? 2;
      const list = stage === 2 ? WQ_STAGE2 : WQ_STAGE3;
      choose(
        s,
        `The Wizard's Quest · Choose the stage ${stage} quest card${seatLabel(s, first)}`,
        [
          ...list.map((c) => ({
            id: c,
            code: c,
            label: `${card(c).back_name} (${card(c).name} ${stage}B)`,
            effects: [
              fx("wqTakeStage", { code: c, value: stage, player: first }),
            ],
          })),
          {
            id: "random",
            label: "Choose at random",
            effects: [fx("wqTakeStage", { value: stage, player: first })],
          },
        ],
        "Create your quest deck by choosing one stage 2 and one stage 3 and placing them in numerical order under stage 1.",
      );
      return true;
    }
    case "wqTakeStage": {
      const stage = e.value ?? 2;
      const list = [...(stage === 2 ? WQ_STAGE2 : WQ_STAGE3)];
      const code = e.code ?? shuffle(s, list)[0];
      if (!q.building || !takeFrom(q.box, code)) return true;
      if (stage === 2) q.building.stage2 = code;
      else q.building.stage3 = code;
      q.questDeck = [q.building.stage2, q.building.stage3].filter(
        (c): c is string => !!c,
      );
      log(
        s,
        `The Wizard's Quest: ${card(code).back_name} is the stage ${stage} quest card.`,
      );
      return true;
    }
    case "wqChooseSet": {
      if (!q.building) return true;
      if (q.sets.length >= 7) {
        prepend(s, fx("wqBuild", { player: first }));
        return true;
      }
      const left = WQ_SETS.filter((x) => !q.sets.includes(x.number));
      choose(
        s,
        `The Wizard's Quest · Choose encounter set ${q.sets.length + 1} of 7${seatLabel(s, first)}`,
        [
          ...left.map((x) => ({
            id: `set:${x.number}`,
            label: wqSetLabel(x.number),
            effects: [
              fx("wqPickSet", { value: x.number, player: first }),
              fx("wqChooseSet", { player: first }),
            ],
          })),
          {
            id: "random",
            label: `Choose the remaining ${7 - q.sets.length} sets at random`,
            effects: [
              fx("wqRandomSets", { player: first }),
              fx("wqChooseSet", { player: first }),
            ],
          },
        ],
        "Create your encounter deck by choosing 7 different encounter sets and shuffling them together.",
      );
      return true;
    }
    case "wqPickSet":
      if (e.value && !q.sets.includes(e.value)) q.sets.push(e.value);
      return true;
    case "wqRandomSets": {
      const left = WQ_SETS.map((x) => x.number).filter(
        (n) => !q.sets.includes(n),
      );
      q.sets.push(...shuffle(s, left).slice(0, 7 - q.sets.length));
      return true;
    }
    case "wqBuild": {
      if (!q.building) return true;
      q.sets.sort((a, b) => a - b);
      const deck = q.sets.flatMap(
        (n) => WQ_SETS.find((x) => x.number === n)?.cards ?? [],
      );
      for (const c of deck) takeFrom(q.box, c);
      s.encounterDeck = shuffle(s, deck);
      q.building = null;
      log(
        s,
        `The Wizard's Quest: the encounter deck holds sets ${q.sets.join(", ")} (${deck.length} cards).`,
        "chapter",
      );
      return true;
    }
    // 1A's setup: Rhosgobel and one different 0 cost card per player.
    case "wqRequestSetup": {
      if (!takeFrom(q.box, WQ.rhosgobel)) return true;
      toStaging(s, WQ.rhosgobel);
      log(s, "Radagast's Request: Rhosgobel is added to the staging area.");
      prepend(
        s,
        fx("wqZeroSetup", { ids: [], count: players(s), player: first }),
      );
      return true;
    }
    case "wqZeroSetup": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          ["enemy", "location"].includes(card(c).type_code) &&
          wqCost(c) === 0 &&
          !taken.has(card(c).name),
        false,
      );
      if (!options.length) {
        log(
          s,
          "Radagast's Request: there is no different 0 cost enemy or location in the encounter deck.",
        );
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Radagast's Request · The opposing team adds a different 0 cost enemy or location to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wqSearchStage", {
              code: c,
              text: "Radagast's Request",
              player: first,
            }),
            fx("wqZeroSetup", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(WQ.request).text,
      );
      return true;
    }
    case "wqDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      q.defeated.push(q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      // Carried Away: each guarded ally returns to its owner's hand.
      if (q.currentQuest === WQ.carried && q.carried.length) {
        for (const g of q.carried.splice(0)) {
          forOwner(s, g.player, () => s.hand.push(g.ally));
          log(
            s,
            `Carried Away: ${name(g.ally)} returns to ${who(s, g.player)}${s.table ? "'s" : "r"} hand.`,
            "good",
          );
        }
      }
      prepend(s, ...responses, fx("wqNextStage", { player: first }));
      return true;
    }
    case "wqNextStage": {
      const next = q.questDeck.shift();
      if (!next) {
        q.advancing = false;
        return true;
      }
      q.currentQuest = next;
      s.stage = wqStageOf(next);
      s.progress = 0;
      s.stageRevealing = true;
      log(s, `${card(next).name} (stage ${s.stage}) begins.`, "chapter");
      prepend(
        s,
        fx("wqTopSearch", { player: first }),
        fx("wqStageBack", { player: first }),
      );
      return true;
    }
    // 2A and 3A: a card from the top 5, revealed; its 'when revealed' cannot be canceled.
    case "wqTopSearch": {
      const max =
        stageNumber(s) === 2
          ? players(s) >= 2
            ? 2
            : 1
          : players(s) >= 2
            ? 3
            : 2;
      const top = s.encounterDeck.slice(0, 5);
      const eligible = [...new Set(top.filter((c) => wqCost(c) <= max))];
      if (!eligible.length) {
        s.encounterDeck = shuffle(s, s.encounterDeck);
        log(
          s,
          `${card(q.currentQuest).name}: no card with cost ${max} or less among the top 5 encounter cards; the deck is shuffled.`,
        );
        return true;
      }
      choose(
        s,
        `${card(q.currentQuest).name} · The opposing team chooses a card with cost ${max} or less from the top 5 encounter cards to reveal${seatLabel(s, first)}`,
        eligible.map((c) => ({
          id: c,
          code: c,
          label: `Reveal ${card(c).name} (cost ${wqCost(c)})`,
          effects: [fx("wqTopTake", { code: c, player: first })],
        })),
        card(q.currentQuest).text,
      );
      return true;
    }
    case "wqTopTake": {
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      s.encounterDeck = shuffle(s, s.encounterDeck);
      q.noCancel = c;
      log(
        s,
        `${card(q.currentQuest).name}: ${card(c).name} is set aside, the encounter deck is shuffled and it is revealed.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", { code: c, player: first }),
        fx("wqNoCancelDone", { player: first }),
      );
      return true;
    }
    case "wqNoCancelDone":
      q.noCancel = null;
      return true;
    case "wqStageBack": {
      s.stageRevealing = false;
      q.advancing = false;
      if (q.currentQuest === WQ.fork)
        prepend(s, fx("wqForkSearch", { player: first }));
      else if (q.currentQuest === WQ.carried)
        prepend(
          s,
          ...playerOrder(s).map((owner) => fx("wqCarried", { player: owner })),
        );
      else if (q.currentQuest === WQ.dungeons) {
        s.encounterDeck = shuffle(s, [
          ...s.encounterDeck,
          ...s.encounterDiscard.splice(0),
        ]);
        log(
          s,
          "Dungeons of the Necromancer: the encounter discard pile is shuffled into the encounter deck.",
        );
        prepend(
          s,
          ...playerOrder(s).map((owner) => fx("wqDungeons", { player: owner })),
        );
      }
      return true;
    }
    // A Fork in the Road: a location with a resource on it.
    case "wqForkSearch": {
      const options = searchable(
        s,
        (c) => card(c).type_code === "location" && wqCost(c) <= 2,
      );
      if (!options.length) {
        log(s, "A Fork in the Road: there is no location with cost 2 or less.");
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `A Fork in the Road · The opposing team adds a location with cost 2 or less to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${wqCost(c)})`,
          effects: [fx("wqForkTake", { code: c, player: first })],
        })),
        card(WQ.fork).back_text,
      );
      return true;
    }
    case "wqForkTake": {
      if (!e.code || !takeSearched(s, e.code)) return true;
      const u = toStaging(s, e.code);
      u.resources = 1;
      q.forkId = u.id;
      log(
        s,
        `A Fork in the Road: ${name(u)} is added to the staging area with a resource on it.`,
        "danger",
      );
      prepend(s, fx("wqShuffle", { player: first }));
      return true;
    }
    // Carried Away: the opposing team chooses an ally of each player.
    case "wqCarried": {
      const allies = seatView(s, p).allies;
      if (!allies.length) return true;
      choose(
        s,
        `Carried Away · The opposing team chooses an ally of ${who(s, p)} to guard under the stage${seatLabel(s, first)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("wqCarriedTake", { target: u.id, player: p })],
        })),
        card(WQ.carried).back_text,
      );
      return true;
    }
    case "wqCarriedTake": {
      const ally = seatView(s, p).allies.find((u) => u.id === e.target);
      if (!ally) return true;
      for (const a of [...ally.attachments])
        discardAttachment(s, ally, a, true);
      forOwner(s, p, () => {
        s.allies = s.allies.filter((u) => u.id !== ally.id);
        s.committedIds = s.committedIds.filter((id) => id !== ally.id);
      });
      Object.assign(ally, {
        damage: 0,
        resources: 0,
        exhausted: false,
        committed: false,
        attachments: [],
      });
      q.carried.push({ player: p, ally });
      log(
        s,
        `Carried Away: ${name(ally)} is placed under the stage as a guarded objective.`,
        "danger",
      );
      return true;
    }
    // Dungeons of the Necromancer: each player's hero is guarded by an enemy.
    case "wqDungeons": {
      let enemy: string | undefined;
      while (s.encounterDeck.length) {
        const top = s.encounterDeck.shift()!;
        if (card(top).type_code === "enemy") {
          enemy = top;
          break;
        }
        s.encounterDiscard.push(top);
      }
      if (!enemy) {
        log(
          s,
          `Dungeons of the Necromancer: there is no enemy for ${who(s, p)}.`,
        );
        return true;
      }
      const guard = toStaging(s, enemy);
      log(
        s,
        `Dungeons of the Necromancer: ${name(guard)} is added to the staging area.`,
        "danger",
      );
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Dungeons of the Necromancer · Attach a hero you control to ${name(guard)} as a guarded objective${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} is guarded by ${name(guard)}`,
          effects: [
            fx("wqDungeonsGuard", {
              target: h.id,
              source: guard.id,
              player: p,
            }),
          ],
        })),
        card(WQ.dungeons).back_text,
      );
      return true;
    }
    case "wqDungeonsGuard": {
      const hero = seatView(s, p).heroes.find((h) => h.id === e.target);
      const guard = get(s, e.source);
      if (!hero || !guard) return true;
      for (const a of [...hero.attachments])
        discardAttachment(s, hero, a, true);
      Object.assign(hero, {
        damage: 0,
        resources: 0,
        progress: 0,
        committed: false,
        exhausted: false,
        attachments: [],
      });
      forOwner(s, p, () => {
        s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        s.committedIds = s.committedIds.filter((id) => id !== hero.id);
      });
      guard.guarding = hero.id;
      q.guardedHeroes.push({ hero, player: p, guardId: guard.id });
      log(
        s,
        `Dungeons of the Necromancer: ${name(hero)} is guarded by ${name(guard)}.`,
        "danger",
      );
      return true;
    }
    case "wqFlipRhosgobel": {
      const u = toStaging(s, WQ.rider);
      log(
        s,
        `Radagast's Request: Rhosgobel is flipped over and ${name(u)} is added to the staging area.`,
        "danger",
      );
      return true;
    }
    case "wqTerrorAttack": {
      const u = rider(s);
      if (!u) return true;
      log(
        s,
        "A New Terror Abroad: Rider of Mirkwood makes an immediate attack against the first player.",
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    case "wqSorcery": {
      while (s.encounterDeck.length) {
        const top = s.encounterDeck.shift()!;
        if (card(top).type_code === "treachery") {
          log(
            s,
            `The Tower of Sorcery: ${card(top).name} is discarded from the encounter deck and revealed.`,
            "danger",
          );
          prepend(s, fx("revealCard", { code: top, player: first }));
          return true;
        }
        s.encounterDiscard.push(top);
      }
      log(
        s,
        "The Tower of Sorcery: there is no treachery in the encounter deck.",
      );
      return true;
    }
    case "wqRemoveProgress":
      removeProgress(s, e.value ?? 0, e.text ?? "");
      return true;
    case "wqPassCheck":
      passCheck(s);
      return true;
  }
  return false;
}
/** A guarded card whose Pass left play without being explored goes to its owner's discard pile. */
function passCheck(s: GameState) {
  const q = s.wizardsQuest;
  if (!q) return;
  for (const g of [...q.passGuards]) {
    if (inPlay(s, g.locationId)) continue;
    q.passGuards = q.passGuards.filter((x) => x !== g);
    forOwner(s, g.player, () => s.discard.push(g.card.code));
    log(
      s,
      `${name(g.card)} was guarded by a Necromancer's Pass that left play; it is discarded.`,
      "danger",
    );
  }
}

// ---------------------------------------------------------------------------
// Hooks.

export const WIZARDS_QUEST_HOOKS: Batch4ScenarioHooks = {
  setup: setupWizardsQuest,
  // The quick build, then 1A's setup, before the first round.
  openingHandsKept: (s) => {
    const q = s.wizardsQuest;
    if (!q || !q.building || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      fx("wqChooseStage", { value: 2, player: first }),
      fx("wqChooseStage", { value: 3, player: first }),
      fx("wqChooseSet", { player: first }),
      fx("wqRequestSetup", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: wqStageInfo,
  encounter: wqEncounter,
  shadow: wqShadow,
  effect: (s, e) => wqStageEffect(s, e) || wqCardEffect(s, e),
  check: (s) => {
    const q = s.wizardsQuest;
    if (!q || s.status !== "playing") return;
    // An unguarded hero returns to its owner's control, exhausted.
    for (const g of [...q.guardedHeroes]) {
      if (guardInPlay(s, g.guardId)) continue;
      q.guardedHeroes = q.guardedHeroes.filter((x) => x !== g);
      g.hero.exhausted = true;
      forOwner(s, g.player, () => s.heroes.push(g.hero));
      log(
        s,
        `${name(g.hero)} is no longer guarded and returns to ${who(s, g.player)}${s.table ? "'s" : "r"} control, exhausted.`,
        "good",
      );
    }
    if (q.passGuards.length) passCheck(s);
  },
  missingHeroAllowed: (s, p) =>
    !!s.wizardsQuest?.guardedHeroes.some((g) => g.player === p),
  stats: (s, u) => {
    const q = s.wizardsQuest;
    if (!q) return {};
    const key = phaseKey(s);
    let attack = 0,
      defense = 0,
      will = 0;
    // Evil Storm: damaged characters get -1 willpower this phase.
    if (q.storm?.key === key && u.damage > 0 && !isEnemy(u) && !isLocation(u))
      will -= 1;
    for (const b of q.boosts)
      if (b.id === u.id && b.key === key) attack += b.attack;
    if (isEnemy(u)) {
      const owner = engagedWith(s, u);
      if (
        owner !== undefined &&
        q.fogShadow.some((f) => f.player === owner && f.key === key)
      ) {
        attack += 1;
        defense += 1;
      }
    }
    return { attack, defense, will };
  },
  threatBonus: (s, u) => {
    const q = s.wizardsQuest;
    if (!q || u.blanked) return 0;
    let bonus = 0;
    // Rider of Mirkwood: X is 1 more than the stage number.
    if (u.code === WQ.rider) bonus += stageNumber(s) + 1;
    if (u.code === WQ.pine && q.pine?.key === phaseKey(s))
      bonus += 2 * q.pine.count;
    if (u.code === WQ.hall) bonus += charactersOf(s, firstPlayer(s)).length;
    if (u.code === WQ.gate) bonus += s.staging.filter(isEnemy).length;
    if (
      q.fog?.key === phaseKey(s) &&
      s.staging.some((x) => x.id === u.id) &&
      (isEnemy(u) || isLocation(u))
    )
      bonus += 2;
    return bonus;
  },
  // Return to Rhosgobel: Rider of Mirkwood's engagement cost is 0.
  engagementBonus: (s, u) =>
    u && live(u, WQ.rider) && at(s, WQ.return) ? -999 : 0,
  cannotEngage: (s, u) =>
    !!s.wizardsQuest && live(u, WQ.rider) && !atStage3B(s),
  cannotLeave: (s, u) =>
    !!s.wizardsQuest &&
    live(u, WQ.rider) &&
    s.staging.some((x) => x.id === u.id) &&
    !atStage3B(s),
  cannotOptionallyEngage: (s, u) => !!s.wizardsQuest && live(u, WQ.sniper),
  // A Fork in the Road: the location with a resource on it.
  immune: (s, u) =>
    !!s.wizardsQuest && u.id === s.wizardsQuest.forkId && at(s, WQ.fork),
  damageAmount: (s, u, amount, context) => {
    const q = s.wizardsQuest;
    if (!q) return amount;
    if (live(u, WQ.nazgul) && !context.combatDamage) return 0;
    if (
      isEnemy(u) &&
      s.staging.some((x) => x.id === u.id) &&
      s.staging.some((x) => live(x, WQ.thicket))
    )
      return 0;
    if (q.noDamage.some((x) => x.id === u.id && x.round === s.round)) return 0;
    if (live(u, WQ.rider) && at(s, WQ.return))
      return Math.max(0, Math.min(amount, s.progress - u.damage));
    return amount;
  },
  // Smoking Blood: lethal damage is canceled and Smoking Blood discarded.
  replaceDamage: (s, u, amount) => {
    if (!s.wizardsQuest || amount <= 0) return false;
    const blood = u.attachments.find((a) => a.code === WQ.blood);
    if (!blood || u.damage + amount < stats(s, u).health) return false;
    log(
      s,
      `Smoking Blood: the damage that would destroy ${name(u)} is canceled and Smoking Blood is discarded.`,
      "danger",
    );
    discardAttachment(s, u, blood);
    return true;
  },
  defenseOverride: (s, defender, enemy) => {
    const c = s.combat;
    if (!s.wizardsQuest || !c || c.enemyId !== enemy.id) return undefined;
    if (c.wqNoDefense) return 0;
    if (c.wqDamagedDefense) return stats(s, defender).defense - defender.damage;
    return undefined;
  },
  cannotHeal: (s, u) =>
    !!s.wizardsQuest &&
    s.wizardsQuest.storm?.key === phaseKey(s) &&
    u.damage > 0,
  cannotReady: (s, u) =>
    !!s.wizardsQuest?.noReady.some((x) => x.id === u.id && x.round === s.round),
  cannotAttach: (s, u) =>
    !!s.wizardsQuest &&
    [WQ.nazgul, WQ.bane, WQ.troll, WQ.hall].some((c) => live(u, c)),
  cannotCancel: (s, shadow, code) =>
    !!s.wizardsQuest && !shadow && s.wizardsQuest.noCancel === code,
  revealedSurge: (s, code) => {
    const q = s.wizardsQuest;
    if (!q) return false;
    // Eastern Crows: while a copy is in the encounter discard pile.
    if (code === WQ.crows && s.encounterDiscard.includes(WQ.crows)) return true;
    // The Wargs' Glade: the first Warg enemy revealed each round.
    if (
      card(code).type_code === "enemy" &&
      wqHasTrait(code, "Warg") &&
      s.staging.some((u) => live(u, WQ.glade)) &&
      q.gladeRound !== s.round
    ) {
      q.gladeRound = s.round;
      return true;
    }
    return false;
  },
  // The Sorcerer's Tower: each treachery gains Doomed 1.
  revealedDoomed: (s, code) =>
    s.wizardsQuest &&
    card(code).type_code === "treachery" &&
    s.staging.some((u) => live(u, WQ.tower))
      ? 1
      : 0,
  // Under the Shadow, Necromancer's Pass and Carried Away limit the plays.
  playProblem: (s, code) => {
    const q = s.wizardsQuest;
    if (!q) return null;
    const title = card(code).name;
    if (q.passGuards.some((g) => card(g.card.code).name === title))
      return "Necromancer's Pass guards a copy of this card.";
    if (
      card(code).type_code === "ally" &&
      q.carried.some((g) => card(g.ally.code).name === title)
    )
      return "Carried Away guards an ally with this title.";
    if (
      underShadow(s) &&
      q.plays.some(
        (x) =>
          x.player === activeSeat(s) && x.key === phaseKey(s) && x.count >= 1,
      )
    )
      return "Under the Shadow: each player cannot play more than 1 card each phase.";
    return null;
  },
  allyEntryProblem: (s, code) =>
    s.wizardsQuest?.carried.some(
      (g) => card(g.ally.code).name === card(code).name,
    )
      ? "Carried Away guards an ally with this title."
      : null,
  playerCardPlayed: (s) => {
    const q = s.wizardsQuest;
    if (!q) return;
    const key = phaseKey(s);
    const player = activeSeat(s);
    const row = q.plays.find((x) => x.player === player && x.key === key);
    if (row) row.count++;
    else {
      q.plays = q.plays.filter((x) => x.key === key);
      q.plays.push({ player, key, count: 1 });
    }
  },
  // Nightfall: an additional threat in the refresh phase.
  refreshThreatBonus: (s) =>
    s.wizardsQuest?.nightfall.filter((n) => n.player === activeSeat(s))
      .length ?? 0,
  // A New Terror Abroad: Rider of Mirkwood attacks the first player.
  questBegin: (s) =>
    s.wizardsQuest && at(s, WQ.terror) && rider(s)
      ? [fx("wqTerrorAttack", { player: firstPlayer(s) })]
      : [],
  // The Tower of Sorcery, then Patch of Midnight at the beginning of the staging step.
  committed: (s) => {
    const q = s.wizardsQuest;
    if (!q) return;
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (at(s, WQ.sorcery)) effects.push(fx("wqSorcery", { player: first }));
    for (const u of [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
    ].filter((x) => live(x, WQ.patch)))
      effects.push(fx("wqPatch", { target: u.id, player: first }));
    if (effects.length) prepend(s, ...effects);
  },
  engaged: (s, u, optional) => {
    const q = s.wizardsQuest;
    if (!q) return;
    const p = activeSeat(s);
    q.engagedRound.push({ id: u.id, round: s.round });
    const effects: Effect[] = [];
    if (live(u, WQ.warg))
      effects.push(
        fx("wqDamageOne", { value: 1, text: "Necromancer's Warg", player: p }),
      );
    if (live(u, WQ.beastmaster))
      effects.push(fx("wqBeastmaster", { player: p }));
    if (live(u, WQ.hunting))
      effects.push(fx("wqHunting", { target: u.id, player: p }));
    if (optional)
      for (const road of s.staging.filter((x) => live(x, WQ.road)))
        effects.push(
          fx("wqDamageOne", {
            value: 1,
            text: card(road.code).name,
            player: p,
          }),
        );
    if (effects.length) prepend(s, ...effects);
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.wizardsQuest || !live(enemy, WQ.flies)) return;
    prepend(s, fx("wqThreat", { value: 1, text: "Forest Flies", player }));
  },
  shadowResolved: (s, enemy, code) => {
    const q = s.wizardsQuest;
    if (!q || q.huntingAttack !== enemy.id || card(code).shadow) return;
    q.boosts.push({ id: enemy.id, key: phaseKey(s), attack: 2 });
    log(
      s,
      "Hunting Warg is dealt a shadow card with no shadow effect: +2 attack until the end of the phase.",
      "danger",
    );
  },
  damageDealt: (s, u, amount, context) => {
    const q = s.wizardsQuest;
    const c = s.combat;
    if (!q || !c || !context.combatDamage || amount <= 0) return;
    const enemy = get(s, context.enemyId ?? c.enemyId);
    if (!enemy) return;
    // Venomous Spider: the damaged character cannot ready this round.
    if (live(enemy, WQ.venomous)) q.noReady.push({ id: u.id, round: s.round });
    // Dark Bats: after its attack damages a character.
    if (live(enemy, WQ.bats)) c.wqBats = true;
  },
  attackFinished: (s, c, skipped = false) => {
    if (!s.wizardsQuest || skipped) return [];
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    if (enemy && live(enemy, WQ.nazgul))
      effects.push(fx("wqNazgul", { target: enemy.id, player: p }));
    if (enemy && c.wqBats)
      effects.push(fx("wqBats", { target: enemy.id, player: p }));
    return effects;
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.wizardsQuest || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (c.wqRevealOnKill) {
      c.wqRevealOnKill = false;
      effects.push(fx("wqReveal", { player: first }));
    }
    if (c.wqThreatOnKill) {
      c.wqThreatOnKill = false;
      effects.push(
        fx("wqEachThreat", {
          value: 1,
          text: "Eyes in the Dark",
          player: first,
        }),
      );
    }
    if (c.wqExhaustOnKill) {
      c.wqExhaustOnKill = false;
      effects.push(fx("wqExhaustOne", { text: "Ravenous Spider", player: p }));
    }
    if (c.wqActiveOnKill) {
      c.wqActiveOnKill = false;
      effects.push(fx("wqActiveReturns", { player: first }));
    }
    if (c.wqReturnOnKill) {
      c.wqReturnOnKill = false;
      c.returnToStaging = true;
    }
    const ally = card(u.code).type_code === "ally";
    if (enemy && live(enemy, WQ.spider) && ally) c.returnToStaging = true;
    if (enemy && live(enemy, WQ.ravenous))
      effects.push(fx("wqExhaustOne", { text: "Ravenous Spider", player: p }));
    if (enemy && live(enemy, WQ.bane) && ally) {
      const excess = u.damage - stats(s, u).health;
      if (excess > 0)
        effects.push(fx("wqDiscardHand", { count: excess, player: p }));
    }
    if (effects.length) prepend(s, ...effects);
  },
  combatEnd: (s) => {
    if (!s.wizardsQuest) return;
    const snipers = enemiesInPlay(s).filter((u) => live(u, WQ.sniper));
    prepend(
      s,
      ...snipers.flatMap(() =>
        playerOrder(s).map((owner) =>
          fx("wqDamageOne", {
            value: 1,
            code: WQ.sniper,
            text: "Goblin Sniper",
            player: owner,
          }),
        ),
      ),
    );
  },
  roundEnd: (s) => {
    const q = s.wizardsQuest;
    if (!q) return [];
    const first = firstPlayer(s);
    q.noReady = q.noReady.filter((x) => x.round > s.round);
    q.noDamage = q.noDamage.filter((x) => x.round > s.round);
    q.engagedRound = q.engagedRound.filter((x) => x.round > s.round);
    q.boosts = [];
    q.fogShadow = [];
    const effects: Effect[] = [];
    for (const u of s.staging.filter((x) => live(x, WQ.lookout)))
      effects.push(
        fx("wqEachThreat", {
          value: s.staging.filter(isEnemy).length,
          text: card(u.code).name,
          player: first,
        }),
      );
    for (const u of s.staging.filter((x) => live(x, WQ.stream)))
      effects.push(
        fx("wqRemoveProgress", {
          value: 2,
          text: card(u.code).name,
          player: first,
        }),
      );
    for (const owner of playerOrder(s))
      for (const u of charactersOf(s, owner))
        if (u.attachments.some((a) => a.code === WQ.befouled))
          effects.push(fx("wqBefouledRound", { target: u.id, player: owner }));
    return effects;
  },
  // Locations.
  locationProgressBlocked: (s, u) =>
    !!s.wizardsQuest &&
    s.staging.some((x) => x.id === u.id) &&
    s.staging.some((x) => live(x, WQ.grove) && x.id !== u.id),
  travelProblem: (s, u) => {
    const q = s.wizardsQuest;
    if (!q || u.blanked) return null;
    if (
      u.id === q.forkId &&
      at(s, WQ.fork) &&
      s.progress < (wqStageInfo(s)?.quest ?? 0)
    )
      return "A Fork in the Road: the players cannot travel there while the stage has quest points remaining.";
    if (
      u.code === WQ.grove &&
      playerOrder(s).some(
        (owner) => !charactersOf(s, owner).some((x) => !x.exhausted),
      )
    )
      return "Oak-wood Grove: each player must exhaust a character to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.wizardsQuest || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === WQ.grove)
      return playerOrder(s).map((owner) =>
        fx("wqExhaustOne", { text: "Oak-wood Grove", player: owner }),
      );
    if (u.code === WQ.pine) {
      const count =
        s.staging.filter((x) => x.code === WQ.pine).length +
        (s.staging.some((x) => x.id === u.id) ? 0 : 1);
      return [
        fx("wqThreat", { value: count, text: "Pine Slopes", player: first }),
      ];
    }
    if (u.code === WQ.cave) return [fx("wqCaveTravel", { player: first })];
    if (u.code === WQ.lookout)
      return [fx("wqLookoutTravel", { player: first })];
    if (u.code === WQ.road)
      return playerOrder(s).map((owner) =>
        fx("wqDamageOne", { value: 1, text: "The Shadow Road", player: owner }),
      );
    if (u.code === WQ.stream)
      return [
        fx("wqEachThreat", { value: 2, text: "Forest Stream", player: first }),
      ];
    return undefined;
  },
  travelEntered: (s, u, actualTravel) => {
    if (!s.wizardsQuest || !actualTravel || u.blanked) return;
    if (u.code === WQ.rhosgobel || u.code === WQ.cave)
      prepend(s, fx("wqResponse", { code: u.code, player: firstPlayer(s) }));
  },
  // Rhosgobel: explored, it is flipped over to Rider of Mirkwood.
  locationDestination: (s, u) => {
    if (!s.wizardsQuest || u.code !== WQ.rhosgobel) return false;
    prepend(
      s,
      fx("wqFlipRhosgobel", { code: WQ.rhosgobel, player: firstPlayer(s) }),
    );
    return true;
  },
  explored: (s, u) => {
    const q = s.wizardsQuest;
    if (!q) return;
    const first = firstPlayer(s);
    // Necromancer's Pass: the guarded card returns to its owner's hand.
    for (const g of q.passGuards.filter((x) => x.locationId === u.id)) {
      q.passGuards = q.passGuards.filter((x) => x !== g);
      forOwner(s, g.player, () => s.hand.push(g.card));
      log(
        s,
        `Necromancer's Pass is explored: ${name(g.card)} returns to its owner's hand.`,
        "good",
      );
    }
    if (u.blanked) return;
    if (u.code === WQ.hall)
      prepend(s, ...playerOrder(s).map(() => fx("reveal", { player: first })));
    if (u.code === WQ.path) prepend(s, fx("wqWatched", { player: first }));
    if (u.code === WQ.tower)
      prepend(s, fx("wqTowerExplored", { player: first }));
    if (u.code === WQ.glade) prepend(s, fx("wqGlade", { player: first }));
  },
  sharedEffect: (e) =>
    [
      "wqChooseStage",
      "wqTakeStage",
      "wqChooseSet",
      "wqPickSet",
      "wqRandomSets",
      "wqBuild",
      "wqRequestSetup",
      "wqZeroSetup",
      "wqDefeatQuest",
      "wqNextStage",
      "wqTopSearch",
      "wqTopTake",
      "wqNoCancelDone",
      "wqStageBack",
      "wqTreacheryDone",
      "wqShuffle",
      "wqSearchStage",
      "wqFlipRhosgobel",
      "wqPassCheck",
      "wqRemoveProgress",
      "wqEachThreat",
    ].includes(e.kind),
};
