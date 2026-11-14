import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  enemyAttackPrevented,
  fx,
  get,
  log,
  make,
  prepend,
  putPlayerDeck,
  random,
  removeShadowCard,
  reorderPlayerDeck,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardQuestAttachments,
  enemyAddedToStaging,
  enterEnemyEngaged,
  engage,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { allQuestUnits, currentQuestUnit, mainQuestUnit } from "./quest-state";
import { sideQuestArea } from "./side-quest-support";
import { canLeaveHand } from "./hand-rules";
import { choosePlayerResponse } from "./player-ability-triggers";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { surgeEffects } from "./surge";
import { shadowEastEnemies, shadowEastTrait } from "./shadow-east-encounters";
import {
  FORTRESS_NURN_RECIPES,
  NURN as N,
  NURN_BACKS,
  QUEST_DECK,
  nurnCastleWins,
  nurnCastles,
  nurnIsCastle,
  nurnIsStormFront,
  nurnPhase,
  nurnPlayers,
  nurnStageInfo,
  nurnX,
} from "./fortress-nurn-support";
export * from "./fortress-nurn-support";

type Combat = NonNullable<GameState["combat"]>;
const isEnemy = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code === "enemy";
const isLocation = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code === "location";
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const ulchor = (s: GameState) =>
  shadowEastEnemies(s).find((u) => u.code === N.ulchor);
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const fanatics = (u: Unit) =>
  u.attachments.filter((a) => a.code === N.fanaticism && !a.blanked).length;
const exhaustable = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const engagedPlayer = (s: GameState, enemy: Unit) =>
  allEngaged(s).some((e) => e.id === enemy.id) ? ownerOf(s, enemy) : undefined;
const phaseEntries = <T extends { round: number; phase: string }>(
  s: GameState,
  list: T[],
) => list.filter((m) => m.round === s.round && m.phase === nurnPhase(s));
/** Facedown player cards a player holds under one physical quest card. */
const pile = (s: GameState, questId: string, player: number) =>
  s.fortressNurn!.under.find(
    (g) => g.questId === questId && g.player === player,
  );
function bury(s: GameState, questId: string, player: number, u: Unit) {
  const q = s.fortressNurn!;
  const group = pile(s, questId, player);
  if (group) group.cards.push(u);
  else q.under.push({ questId, player, cards: [u] });
}

function add(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (isEnemy(code) && player !== undefined) {
    enterEnemyEngaged(s, u, player);
    // An engagement can be refused; the physical card still enters play.
    if (!allEngaged(s).some((e) => e.id === u.id)) {
      s.staging.push(u);
      enemyAddedToStaging(s, u);
    }
  } else {
    s.staging.push(u);
    if (isEnemy(code)) enemyAddedToStaging(s, u);
  }
  return u;
}
/** Discard from the encounter deck until a card of the type appears, reshuffling once. */
function discardUntil(s: GameState, type: string) {
  let reshuffled = false;
  for (;;) {
    if (!s.encounterDeck.length) {
      if (reshuffled || !s.encounterDiscard.length) return undefined;
      reshuffled = true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === type) return code;
    s.encounterDiscard.push(code);
  }
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck.push(...s.encounterDiscard.splice(0));
  shuffle(s, s.encounterDeck);
}
function forcedEngagements(s: GameState) {
  const boss = ulchor(s),
    bossPlayer = boss && !boss.blanked ? engagedPlayer(s, boss) : undefined;
  for (const u of shadowEastEnemies(s)) {
    const p =
      !u.blanked && u.code === N.khamul
        ? firstPlayer(s)
        : !u.blanked && u.code === N.guard
          ? bossPlayer
          : undefined;
    if (p !== undefined && !seatView(s, p).engaged.some((e) => e.id === u.id))
      forOwner(s, p, () => engage(s, u));
  }
}
/** Every player card under a quest returns to its owner's deck, which is then shuffled. */
function returnUnder(s: GameState, questId: string) {
  const q = s.fortressNurn!,
    groups = q.under.filter((g) => g.questId === questId);
  q.under = q.under.filter((g) => g.questId !== questId);
  for (const group of groups)
    forOwner(s, group.player, () => {
      if (s.table?.seats[group.player].eliminated) {
        for (const u of group.cards) s.discard.push(u.code);
        return;
      }
      for (const u of group.cards) putPlayerDeck(s, u);
      reorderPlayerDeck(
        s,
        0,
        shuffle(
          s,
          s.deck.map((_, i) => i),
        ),
      );
    });
}
export function fortressNurnPlayerEliminated(s: GameState, player: number) {
  const q = s.fortressNurn;
  if (!q) return;
  const groups = q.under.filter((g) => g.player === player);
  q.under = q.under.filter((g) => g.player !== player);
  for (const g of groups)
    forOwner(s, player, () => s.discard.push(...g.cards.map((u) => u.code)));
}
export function setupFortressNurn(s: GameState) {
  const r = FORTRESS_NURN_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Ulchor's Guard is part of the encounter deck; setup takes one copy per player from it.
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...section("sharedSetAside"),
  ]);
  s.fortressNurn = {
    initialized: false,
    currentQuest: N.first,
    advancing: false,
    powerDeck: shuffle(s, section("sharedEncounterDeck2")),
    powered: [],
    under: [],
    resolving: [],
    phaseThreat: [],
    noProgress: [],
    dungeons: { round: 0, placed: 0 },
    protected: [],
    reduced: { round: 0, counts: {} },
  };
  for (const code of section("sharedStagingArea")) add(s, code);
  // The four fronts are identical; their order must not reveal their reverses.
  for (const code of shuffle(s, section("sharedMap")))
    s.staging.push(make(s, code));
}
function setupStage(s: GameState) {
  const q = s.fortressNurn!;
  q.initialized = true;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const excess = s.deck.length + s.hand.length - 50;
      if (excess > 0) {
        const removed = s.deck.splice(s.deck.length - excess, excess);
        s.removed.push(...removed);
        log(
          s,
          `Player decks cannot exceed 50 cards: ${excess} card${excess === 1 ? "" : "s"} set out of the game.`,
        );
      }
    });
  for (const quest of nurnCastles(s)) {
    const code = q.powerDeck.shift();
    if (code) q.powered.push({ questId: quest.id, code });
  }
  for (const p of playerOrder(s)) {
    const i = s.encounterDeck.indexOf(N.guard);
    if (i < 0) break;
    s.encounterDeck.splice(i, 1);
    add(s, N.guard, p);
  }
  const piles = [
    QUEST_DECK,
    ...s.staging
      .filter((u) => card(u.code).type_code === "encounter-side-quest")
      .map((u) => u.id),
  ];
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      // Deal one card at a time so a short deck spreads evenly across the piles.
      for (let round = 0; round < 8; round++)
        for (const questId of piles) {
          if (!s.deck.length) break;
          const physical = takePlayerDeck(s);
          physical.owner ??= p;
          bury(s, questId, p, physical);
        }
    });
  shuffle(s, s.encounterDeck);
  log(
    s,
    "Assault on Dol Rhugar: four Castles stand between you and Thane Ulchor.",
    "chapter",
  );
}
function flipStorm(s: GameState, u: Unit) {
  const back = `${u.code}:B`;
  if (!nurnIsStormFront(u) || !NURN_BACKS.includes(back)) return;
  const front = u.code;
  u.code = back;
  u.progress = 0;
  const selected = s.sideQuestSelections?.[sideQuestArea(s)];
  if (selected && selected.id === u.id && selected.code === front)
    selected.code = back;
  log(s, `Storm the Castle turns over: ${card(back).name}.`, "danger");
  const players = nurnPlayers(s),
    p = firstPlayer(s);
  if (back === N.quarter)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("nurnQuarter", { source: u.id, player }),
      ),
    );
  else if (back === N.stronghold)
    prepend(
      s,
      fx("nurnDiscardFor", { text: "location", value: players, player: p }),
    );
  else if (back === N.garrison)
    prepend(
      s,
      fx("nurnDiscardFor", { text: "enemy", value: players, player: p }),
    );
  else if (back === N.counterattack)
    prepend(
      s,
      ...allCharacters(s).map((c) =>
        fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
      ),
    );
}
function sideQuestChosen(s: GameState, u: Unit) {
  const q = s.fortressNurn;
  if (!q || u.blanked) return;
  const p = firstPlayer(s);
  if (nurnIsStormFront(u)) {
    const i = q.powered.findIndex((x) => x.questId === u.id);
    const power = i >= 0 ? q.powered.splice(i, 1)[0] : undefined;
    prepend(
      s,
      ...(power
        ? [
            fx("revealCard", {
              code: power.code,
              revealOrigin: "power",
              player: p,
            }),
          ]
        : []),
      fx("nurnFlip", { target: u.id, player: p }),
    );
  } else if (u.code === N.unwelcome)
    prepend(s, fx("nurnFind", { text: "enemy", count: 1, player: p }));
}
function sideDefeated(s: GameState, u: Unit) {
  if (u.blanked || !s.fortressNurn) return;
  if (nurnIsCastle(u) && !nurnIsStormFront(u)) {
    returnUnder(s, u.id);
    log(
      s,
      `${name(u)} is defeated: the cards beneath it return to their owners' decks.`,
      "good",
    );
    for (const p of playerOrder(s)) forOwner(s, p, () => draw(s, 1, false));
  } else if (u.code === N.dungeons)
    prepend(s, fx("nurnDungeons", { source: u.id, player: firstPlayer(s) }));
}
function advance(s: GameState) {
  // Stage 1B is only defeated at the end of the round; stage 2B is won by defeating Thane Ulchor.
  return !!s.fortressNurn;
}
function check(s: GameState) {
  const q = s.fortressNurn;
  if (!q || s.status !== "playing") return;
  forcedEngagements(s);
  if (
    s.stage === 2 &&
    !s.stageRevealing &&
    (s.victoryCards ?? []).includes(N.ulchor)
  ) {
    win(
      s,
      "Thane Ulchor falls in the great hall of Dol Rhugar, and his fortress is broken.",
    );
  }
}
function threatBonus(s: GameState, u: Unit) {
  if (!s.fortressNurn) return 0;
  return (
    fanatics(u) +
    (!u.blanked && [N.ulchor, N.plaza].includes(u.code) ? nurnX(s) : 0) +
    (isLocation(u) && s.staging.some((l) => l.id === u.id)
      ? live(s, N.unwelcome).length
      : 0)
  );
}
function cannotEngage(s: GameState, u: Unit) {
  if (u.blanked) return false;
  if (u.code === N.ulchor) return s.stage === 1 && stageLive(s);
  if (u.code === N.khamul) return activeSeat(s) !== firstPlayer(s);
  const boss = ulchor(s),
    p = boss && !boss.blanked ? engagedPlayer(s, boss) : undefined;
  return u.code === N.guard && p !== undefined && p !== activeSeat(s);
}
function progress(s: GameState, amount: number, quest: Unit) {
  const q = s.fortressNurn;
  if (!q) return amount;
  const current = currentQuestUnit(s);
  if (!current || current.id !== quest.id) return amount;
  if (phaseEntries(s, q.noProgress).length) return 0;
  if (live(s, N.dungeons).length) {
    const placed = q.dungeons.round === s.round ? q.dungeons.placed : 0;
    return Math.min(amount, Math.max(0, 4 - placed));
  }
  return amount;
}
function questProgressPlaced(s: GameState, quest: Unit, amount: number) {
  const q = s.fortressNurn;
  if (!q || currentQuestUnit(s)?.id !== quest.id) return;
  if (q.dungeons.round !== s.round) q.dungeons = { round: s.round, placed: 0 };
  q.dungeons.placed += amount;
}
function damageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  const q = s.fortressNurn;
  if (!q) return amount;
  if (q.protected.some((m) => m.id === u.id && m.round === s.round)) return 0;
  if (
    isEnemy(u) &&
    live(s, N.catacombs).length &&
    s.staging.some((e) => e.id === u.id)
  )
    return 0;
  if (
    u.code === N.ulchor &&
    !u.blanked &&
    s.stage === 2 &&
    !s.stageRevealing &&
    !mainQuestUnit(s)?.blanked
  )
    return Math.min(amount, Math.max(0, s.progress - u.damage));
  return amount;
}
function threatReduction(s: GameState, amount: number, reason?: string) {
  const q = s.fortressNurn;
  if (!q || reason !== "player-card") return amount;
  if (q.reduced.round !== s.round) q.reduced = { round: s.round, counts: {} };
  const key = String(activeSeat(s));
  const allowed = live(s, N.darkness).length
    ? Math.min(amount, Math.max(0, 1 - (q.reduced.counts[key] ?? 0)))
    : amount;
  q.reduced.counts[key] =
    (q.reduced.counts[key] ?? 0) + Math.min(s.threat, allowed);
  return allowed;
}
function travelProblem(s: GameState, u: Unit) {
  if (u.blanked) return null;
  if (u.code === N.barad)
    return "The players cannot travel to The Tower of Barad-dûr.";
  if (
    u.code === N.tower &&
    playerOrder(s).some((p) => !own(s, p).some(exhaustable))
  )
    return "Guard Tower's Travel cost needs a ready character for each player.";
  if (
    u.code === N.walls &&
    (!nurnCastles(s).length ||
      playerOrder(s).some((p) => !seatView(s, p).hand.some(canLeaveHand)))
  )
    return "Fortress Walls' Travel cost needs a Castle side quest and a card in each player's hand.";
  return null;
}
export function fortressNurnTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  const p = firstPlayer(s);
  if (u.code === N.walls)
    return playerOrder(s).map((player) => fx("nurnPlaceUnder", { player }));
  if (u.code === N.tower)
    return playerOrder(s).map((player) => fx("nurnExhaust", { player }));
  if (u.code === N.plaza)
    return playerOrder(s).map((player) =>
      fx("nurnAssign", { value: nurnX(s), player }),
    );
  if (u.code === N.street)
    return [fx("nurnFind", { text: "location", flag: true, player: p })];
  if (u.code === N.catacombs)
    return playerOrder(s).map((player) => fx("nurnCatacombs", { player }));
  return undefined;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.fortressNurn;
  if (!q) return false;
  if (code === N.mercenary) {
    if (fromReveal) prepend(s, fx("nurnMercenary", { player: firstPlayer(s) }));
    return true;
  }
  if (code === N.eye) {
    if (fromReveal)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("nurnEyeDiscard", { player })),
      );
    return true;
  }
  if (![N.defense, N.reach, N.rage, N.fanaticism, N.underGuard].includes(code))
    return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  prepend(
    s,
    fx("nurnTreachery", { code, source: u.id, player: firstPlayer(s) }),
    ...(code === N.fanaticism
      ? []
      : [fx("nurnTreacheryDone", { source: u.id, player: firstPlayer(s) })]),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.fortressNurn) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId),
    defenders = c.defenderIds?.length
      ? c.defenderIds
      : c.defenderId
        ? [c.defenderId]
        : [];
  if (code === N.soldier) {
    c.attackBonus += 1;
    c.nurnSoldier = (c.nurnSoldier ?? 0) + 1;
  } else if (code === N.mercenary) c.attackBonus += nurnCastleWins(s);
  else if (code === N.olog) c.attackBonus += 2;
  else if (code === N.dogs) {
    if (enemy) {
      const index = enemy.shadows.indexOf(code);
      if (index >= 0) {
        removeShadowCard(enemy, index);
        const dogs = make(s, code);
        enterEnemyEngaged(s, dogs, p);
        if (!allEngaged(s).some((e) => e.id === dogs.id)) {
          s.staging.push(dogs);
          enemyAddedToStaging(s, dogs);
        }
        log(s, "Guard Dogs enters play from the shadows.", "danger");
      }
    }
  } else if (code === N.defense) prepend(s, fx("nurnExhaust", { player: p }));
  else if (code === N.reach) prepend(s, fx("nurnShadowDiscard", { player: p }));
  else if (code === N.guard) {
    if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
  } else if (code === N.rage)
    prepend(
      s,
      ...defenders.map((id) =>
        fx("damage", { target: id, value: 1, player: p }),
      ),
    );
  else if (code === N.underGuard)
    c.nurnUnderGuard = (c.nurnUnderGuard ?? 0) + 1;
  else return false;
  return true;
}
function takeResolving(s: GameState, id?: string) {
  const q = s.fortressNurn!,
    i = q.resolving.findIndex((u) => u.id === id);
  return i >= 0 ? q.resolving.splice(i, 1)[0] : undefined;
}
/** Each card a player controls or holds that shares a title with the discarded cards. */
function discardTitles(s: GameState, p: number, titles: Set<string>) {
  forOwner(s, p, () => {
    for (const h of [...s.hand])
      if (titles.has(card(h.code).name))
        discardHandCard(s, h.id, { encounterEffect: true });
    const hosts = [
      ...allCharacters(s),
      ...shadowEastEnemies(s),
      ...allActiveLocations(s),
      ...s.staging,
      ...allQuestUnits(s),
    ];
    const seen = new Set<string>();
    for (const host of hosts)
      for (const a of [...host.attachments])
        if (
          !seen.has(a.id) &&
          attachmentController(s, host, a) === p &&
          titles.has(card(a.code).name)
        ) {
          seen.add(a.id);
          discardAttachment(s, host, a);
        }
    for (const c of [...own(s, p)])
      if (titles.has(card(c.code).name)) discardCharacter(s, c);
  });
}
/** Attachments a player controls, wherever they are attached. */
function controlledAttachments(s: GameState, p: number) {
  const hosts = [
    ...allCharacters(s),
    ...shadowEastEnemies(s),
    ...allActiveLocations(s),
    ...s.staging,
  ];
  const seen = new Set<string>();
  const found: { host: Unit; id: string; code: string }[] = [];
  for (const host of hosts)
    for (const a of host.attachments)
      if (
        !seen.has(a.id) &&
        !a.facedown &&
        attachmentController(s, host, a) === p
      ) {
        seen.add(a.id);
        found.push({ host, id: a.id, code: a.code });
      }
  return found;
}
export function fortressNurnEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nurn") || e.kind.startsWith("nurnPlayer"))
    return false;
  const q = s.fortressNurn;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "nurnSetup":
      setupStage(s);
      break;
    case "nurnFlip": {
      const quest = s.staging.find((x) => x.id === e.target);
      if (quest) flipStorm(s, quest);
      break;
    }
    case "nurnQuarter": {
      const group = pile(s, e.source!, p);
      const picks: Unit[] = [];
      while (group && picks.length < 4 && group.cards.length)
        picks.push(
          group.cards.splice(Math.floor(random(s) * group.cards.length), 1)[0],
        );
      if (group && !group.cards.length)
        q.under = q.under.filter((g) => g !== group);
      if (!picks.length) break;
      forOwner(s, p, () => s.discard.push(...picks.map((c) => c.code)));
      log(
        s,
        `No Quarter discards ${picks.map((c) => card(c.code).name).join(", ")}.`,
        "danger",
      );
      discardTitles(s, p, new Set(picks.map((c) => card(c.code).name)));
      break;
    }
    case "nurnDiscardFor": {
      const found: string[] = [];
      for (let n = 0; n < (e.value ?? 0); n++) {
        const code = discardUntil(s, e.text!);
        if (!code) break;
        found.push(code);
      }
      for (const code of found) add(s, code);
      break;
    }
    case "nurnDungeons": {
      const castles = nurnCastles(s);
      if (castles.length)
        choosePlayerResponse(
          s,
          e.source ?? N.dungeons,
          N.dungeons,
          "The Dungeons of Dol Rhugar · Choose a Castle side quest",
          [
            ...castles.map((c) =>
              option(
                c,
                playerOrder(s).map((player) =>
                  fx("nurnDungeonsPick", { target: c.id, player }),
                ),
                `${name(c)} · ${q.under
                  .filter((g) => g.questId === c.id)
                  .reduce((n, g) => n + g.cards.length, 0)} cards beneath`,
              ),
            ),
            skip,
          ],
          "Each player looks at their facedown cards under that quest and adds 1 to their hand.",
        );
      break;
    }
    case "nurnDungeonsPick": {
      const group = pile(s, e.target!, p);
      if (group?.cards.length)
        choose(
          s,
          "The Dungeons of Dol Rhugar · Add 1 of your cards to your hand",
          group.cards.map((c) =>
            option(c, [
              fx("nurnDungeonsTake", {
                target: e.target,
                source: c.id,
                player: p,
              }),
            ]),
          ),
        );
      break;
    }
    case "nurnDungeonsTake": {
      const group = pile(s, e.target!, p);
      const i = group?.cards.findIndex((c) => c.id === e.source) ?? -1;
      if (group && i >= 0) {
        const physical = group.cards.splice(i, 1)[0];
        if (!group.cards.length) q.under = q.under.filter((g) => g !== group);
        forOwner(s, p, () => s.hand.push(physical));
      }
      break;
    }
    case "nurnRoundEnd": {
      q.phaseThreat = q.phaseThreat.filter((m) => m.round > s.round);
      q.noProgress = q.noProgress.filter((m) => m.round > s.round);
      q.protected = q.protected.filter((m) => m.round > s.round);
      if (
        s.stage === 1 &&
        stageLive(s) &&
        !q.advancing &&
        s.progress >= 3 &&
        nurnCastleWins(s) >= 3
      ) {
        q.advancing = true;
        prepend(s, fx("nurnDefeatQuest", { player: firstPlayer(s) }));
      }
      break;
    }
    case "nurnDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("nurnStageTwo", { player: firstPlayer(s) }));
      break;
    }
    case "nurnStageTwo": {
      discardQuestAttachments(s, q.currentQuest);
      s.stage = 2;
      q.currentQuest = N.last;
      s.progress = 0;
      s.stageRevealing = true;
      log(
        s,
        "The Final Confrontation: Thane Ulchor rises in the great hall of Dol Rhugar.",
        "chapter",
      );
      const code = q.powerDeck.shift();
      prepend(
        s,
        ...(code
          ? [
              fx("revealCard", {
                code,
                revealOrigin: "power",
                player: firstPlayer(s),
              }),
            ]
          : []),
        fx("nurnShuffleDiscard", { player: firstPlayer(s) }),
        ...playerOrder(s).map((player) =>
          fx("nurnUlchorAttack", { player, flag: true }),
        ),
        fx("nurnStageRevealed", { player: firstPlayer(s) }),
      );
      break;
    }
    case "nurnShuffleDiscard":
      shuffleDiscard(s);
      log(s, "The encounter discard pile is shuffled into the encounter deck.");
      break;
    case "nurnUlchorAttack": {
      const boss = ulchor(s);
      if (boss && !enemyAttackPrevented(s, boss, p))
        prepend(s, fx("immediateAttack", { target: boss.id, player: p }));
      else if (!e.flag) prepend(s, ...surgeEffects(N.rage));
      break;
    }
    case "nurnStageRevealed":
      s.stageRevealing = false;
      q.advancing = false;
      break;
    case "nurnTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!held) break;
      const first = firstPlayer(s);
      if (held.code === N.defense)
        q.phaseThreat.push({
          round: s.round,
          phase: nurnPhase(s),
          value: 2 + 2 * nurnCastleWins(s),
        });
      else if (held.code === N.reach) {
        const hit = allCharacters(s).filter((c) => c.exhausted);
        prepend(
          s,
          ...hit.map((c) =>
            fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
          ),
          fx("nurnReachAfter", {
            ids: hit.map((c) => `${c.id}:${c.damage}`),
            player: first,
          }),
        );
      } else if (held.code === N.rage)
        prepend(s, fx("nurnUlchorAttack", { player: first }));
      else if (held.code === N.underGuard)
        prepend(s, fx("nurnTravelAgain", { flag: true, player: first }));
      else if (held.code === N.fanaticism) {
        const eligible = shadowEastEnemies(s).filter(
          (x) =>
            shadowEastTrait(x, "Easterling") &&
            !x.attachments.some((a) => a.code === N.fanaticism),
        );
        const low = Math.min(...eligible.map((x) => stats(s, x).defense));
        const targets = eligible.filter((x) => stats(s, x).defense === low);
        if (!targets.length) {
          const physical = takeResolving(s, held.id);
          if (physical) s.encounterDiscard.push(physical.code);
          prepend(s, ...surgeEffects(N.fanaticism));
        } else if (targets.length === 1)
          prepend(
            s,
            fx("nurnFanaticism", { source: held.id, target: targets[0].id }),
          );
        else
          choose(
            s,
            "Fanaticism · Choose a tied enemy with the lowest defense",
            targets.map((x) =>
              option(x, [
                fx("nurnFanaticism", { source: held.id, target: x.id }),
              ]),
            ),
          );
      }
      break;
    }
    case "nurnTreacheryDone": {
      const physical = takeResolving(s, e.source);
      if (physical) s.encounterDiscard.push(physical.code);
      break;
    }
    case "nurnFanaticism": {
      const physical = takeResolving(s, e.source);
      if (physical && u && isEnemy(u))
        u.attachments.push({
          id: physical.id,
          code: physical.code,
          exhausted: false,
        });
      else if (physical) s.encounterDiscard.push(physical.code);
      break;
    }
    case "nurnReachAfter":
      for (const entry of e.ids ?? []) {
        const [id, before] = entry.split(":");
        const c = get(s, id);
        if (
          !c ||
          !allCharacters(s).some((x) => x.id === id) ||
          c.damage <= Number(before) ||
          !c.attachments.length
        )
          continue;
        prepend(
          s,
          fx("nurnReachDiscard", { target: id, player: ownerOf(s, c) }),
        );
      }
      break;
    case "nurnReachDiscard": {
      if (!u) break;
      const attachments = u.attachments.filter((a) => !a.facedown);
      if (attachments.length === 1) discardAttachment(s, u, attachments[0]);
      else if (attachments.length)
        choose(
          s,
          `The Dark Lord's Reach · Discard an attachment from ${name(u)}`,
          attachments.map((a) => ({
            id: a.id,
            code: a.code,
            label: card(a.code).name,
            effects: [
              fx("discardAttachment", {
                target: u.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        );
      break;
    }
    case "nurnShadowDiscard": {
      const found = controlledAttachments(s, p);
      if (found.length)
        choose(
          s,
          "The Dark Lord's Reach · Discard an attachment you control",
          found.map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(a.host)}`,
            effects: [
              fx("discardAttachment", {
                target: a.host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        );
      break;
    }
    case "nurnMercenary":
      choose(s, "Easterling Mercenary · Choose", [
        {
          id: "reveal",
          label: "Reveal an additional encounter card",
          effects: [fx("reveal", { player: p })],
        },
        {
          id: "progress",
          label: "No progress can be placed on the current quest this phase",
          effects: [fx("nurnBlockProgress", { player: p })],
        },
      ]);
      break;
    case "nurnBlockProgress":
      q.noProgress.push({ round: s.round, phase: nurnPhase(s) });
      log(s, "No progress can be placed on the current quest this phase.");
      break;
    case "nurnPlaceUnder": {
      const castles = nurnCastles(s);
      const cards = seatView(s, p).hand.filter(canLeaveHand);
      if (!castles.length || !cards.length) break;
      choose(
        s,
        "Place 1 card from your hand facedown under a Castle side quest",
        cards.map((c) =>
          option(c, [fx("nurnPlaceUnderCard", { source: c.id, player: p })]),
        ),
      );
      break;
    }
    case "nurnPlaceUnderCard": {
      const castles = nurnCastles(s);
      if (!castles.length) break;
      if (castles.length === 1)
        prepend(
          s,
          fx("nurnPlaceUnderQuest", {
            source: e.source,
            target: castles[0].id,
            player: p,
          }),
        );
      else
        choose(
          s,
          "Choose the Castle side quest",
          castles.map((c) =>
            option(c, [
              fx("nurnPlaceUnderQuest", {
                source: e.source,
                target: c.id,
                player: p,
              }),
            ]),
          ),
        );
      break;
    }
    case "nurnPlaceUnderQuest": {
      if (!s.staging.some((c) => c.id === e.target && nurnIsCastle(c))) break;
      forOwner(s, p, () => {
        const i = s.hand.findIndex((c) => c.id === e.source);
        if (i < 0 || !canLeaveHand(s.hand[i])) return;
        const physical = s.hand.splice(i, 1)[0];
        physical.owner ??= p;
        bury(s, e.target!, p, physical);
        log(s, "A card is placed facedown under a Castle side quest.");
      });
      break;
    }
    case "nurnExhaust": {
      const ready = own(s, p).filter(exhaustable);
      if (ready.length)
        choose(
          s,
          "Exhaust a character you control",
          ready.map((c) =>
            option(c, [fx("exhaust", { target: c.id, player: p })]),
          ),
        );
      break;
    }
    case "nurnAssign": {
      const remaining = e.value ?? 0;
      const targets = own(s, p).filter((c) => c.damage < stats(s, c).health);
      if (remaining > 0 && targets.length)
        choose(
          s,
          `Plaza of Nurn · Assign damage among your characters (${remaining} remaining)`,
          targets.map((c) =>
            option(c, [
              fx("damage", { target: c.id, value: 1, player: p }),
              fx("nurnAssign", { value: remaining - 1, player: p }),
            ]),
          ),
        );
      break;
    }
    case "nurnDogs": {
      const targets = own(s, p);
      if (targets.length)
        choose(
          s,
          "Guard Dogs · Deal 1 damage to a character you control",
          targets.map((c) =>
            option(c, [fx("damage", { target: c.id, value: 1, player: p })]),
          ),
        );
      break;
    }
    case "nurnTravelAgain": {
      const locations = allActiveLocations(s);
      if (locations.length > 1)
        choose(
          s,
          "Under Guard · Choose an active location",
          locations.map((l) =>
            option(l, fortressNurnTravelEffects(s, l) ?? []),
          ),
        );
      else if (locations[0])
        prepend(s, ...(fortressNurnTravelEffects(s, locations[0]) ?? []));
      else if (e.flag)
        prepend(s, fx("nurnFind", { text: "location", player: p }));
      break;
    }
    case "nurnFind": {
      if (e.flag) shuffleDiscard(s);
      const code = discardUntil(s, e.text!);
      if (code) add(s, code, e.count === 1 ? p : undefined);
      break;
    }
    case "nurnCatacombs": {
      const code = encounterDraw(s);
      if (code) {
        if (isEnemy(code)) add(s, code, p);
        else s.encounterDiscard.push(code);
      }
      break;
    }
    case "nurnEyeDiscard": {
      const hand = seatView(s, p).hand;
      if (hand.length > 5)
        choose(
          s,
          "Under the Watchful Eye · Discard down to five cards",
          hand.map((c) =>
            option(c, [fx("nurnEyeTake", { target: c.id, player: p })]),
          ),
        );
      break;
    }
    case "nurnEyeTake": {
      const card0 = seatView(s, p).hand.find((c) => c.id === e.target);
      if (card0)
        forOwner(s, p, () =>
          discardHandCard(s, card0.id, { encounterEffect: true }),
        );
      prepend(s, fx("nurnEyeDiscard", { player: p }));
      break;
    }
    case "nurnThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 1, "encounter"));
      break;
    case "nurnArmyProtect":
      if (u) q.protected.push({ id: u.id, round: s.round });
      break;
    default:
      return false;
  }
  return true;
}
export const FORTRESS_NURN_HOOKS: Batch4ScenarioHooks = {
  setup: setupFortressNurn,
  openingHandsKept: (s) => {
    if (!s.fortressNurn || s.fortressNurn.initialized) return false;
    prepend(s, fx("nurnSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  check,
  playerEliminated: fortressNurnPlayerEliminated,
  advance,
  stageInfo: nurnStageInfo,
  mainQuestUnavailable: (s) => s.stage === 1 && stageLive(s) && s.progress >= 3,
  stats: (_s, u) => ({ attack: fanatics(u), defense: fanatics(u) }),
  threatBonus,
  stagingThreat: (s) =>
    s.fortressNurn
      ? phaseEntries(s, s.fortressNurn.phaseThreat).reduce(
          (n, m) => n + m.value,
          0,
        )
      : 0,
  immune: (_s, u) =>
    (!u.blanked && [N.ulchor, N.khamul, N.barad].includes(u.code)) ||
    fanatics(u) > 0,
  cannotLeave: (s, u) =>
    u.code === N.ulchor && !u.blanked && s.stage === 1 && stageLive(s),
  cannotEngage,
  cannotOptionallyEngage: (s, u) => cannotEngage(s, u),
  cannotDefend: (s, enemy, defender) =>
    enemy.code === N.khamul &&
    !enemy.blanked &&
    !!defender &&
    ownerOf(s, defender) !== ownerOf(s, enemy),
  cannotAttack: (s, character, enemy) =>
    enemy.code === N.khamul &&
    !enemy.blanked &&
    ownerOf(s, character) !== ownerOf(s, enemy),
  cannotAttach: (_s, u) => u.code === N.olog && !u.blanked,
  cannotCancel: (s) => s.stage === 2 && stageLive(s),
  sideDefeatBlocked: (_s, u) => nurnIsStormFront(u),
  sideQuestChosen,
  sideDefeated,
  progress,
  questProgressPlaced,
  damageAmount,
  threatReduction,
  threatEliminationReduction: (s) => (live(s, N.barad).length ? 5 : 0),
  playerCardEconomyBlocked: (s) => live(s, N.tower).length > 0,
  allyCost: (s) => live(s, N.walls).length,
  locationProgressBlocked: (s, u) =>
    u.code === N.barad ||
    (s.staging.some((l) => l.id === u.id) &&
      live(s, N.street).some((l) => l.id !== u.id)),
  travelProblem,
  travelEffects: fortressNurnTravelEffects,
  engaged: (s, u) => {
    if (!s.fortressNurn) return;
    if (!card(u.code).is_unique && live(s, N.armies).length)
      prepend(s, fx("nurnArmyProtect", { target: u.id }));
    if (u.code === N.dogs && !u.blanked)
      prepend(s, fx("nurnDogs", { player: ownerOf(s, u) }));
    forcedEngagements(s);
  },
  cardsDrawn: (s, player, amount) => {
    if (s.fortressNurn && amount > 0 && live(s, N.eye).length)
      prepend(s, fx("nurnThreat", { value: 1, player }));
  },
  enemyAttackStarted: (s, u) => {
    if (!s.combat) return;
    s.combat.nurnEnemy = u.blanked ? undefined : u.code;
    s.combat.nurnKilled = false;
  },
  characterDestroyed: (s, _u, ctx) => {
    const c = s.combat;
    if (c && ctx.combatDamage && ctx.enemyId === c.enemyId) c.nurnKilled = true;
  },
  attackFinished: (s, c: Combat, skipped = false) => {
    if (!s.fortressNurn || skipped || !c.attackResolved) return [];
    const p = c.attackPlayer ?? activeSeat(s),
      effects: Effect[] = [];
    if (c.nurnEnemy === N.ulchor) effects.push(fx("reveal", { player: p }));
    if (c.nurnEnemy === N.soldier)
      effects.push(fx("nurnPlaceUnder", { player: p }));
    if (c.nurnEnemy === N.olog && c.nurnKilled)
      effects.push(fx("nurnExhaust", { player: p }));
    if (c.nurnKilled) {
      for (let n = 0; n < (c.nurnSoldier ?? 0); n++)
        effects.push(fx("nurnPlaceUnder", { player: p }));
      for (let n = 0; n < (c.nurnUnderGuard ?? 0); n++)
        effects.push(fx("nurnTravelAgain", { player: firstPlayer(s) }));
    }
    return effects;
  },
  roundEnd: (s) =>
    s.fortressNurn ? [fx("nurnRoundEnd", { player: firstPlayer(s) })] : [],
  encounter,
  shadow,
  effect: fortressNurnEffect,
  sharedEffect: (e) =>
    [
      "nurnSetup",
      "nurnFlip",
      "nurnDiscardFor",
      "nurnRoundEnd",
      "nurnDefeatQuest",
      "nurnStageTwo",
      "nurnShuffleDiscard",
      "nurnStageRevealed",
      "nurnTreachery",
      "nurnTreacheryDone",
      "nurnFanaticism",
      "nurnReachAfter",
      "nurnBlockProgress",
      "nurnFind",
      "nurnArmyProtect",
    ].includes(e.kind),
};
