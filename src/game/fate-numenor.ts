import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
import type { LeaveDestination } from "./mirkwood-player-cards";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  reorderPlayerDeck,
  shuffle,
  skip,
  stats,
  takePlayerDeck,
} from "./core";
import {
  addVictoryCard,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
} from "./table";
import {
  FATE as F,
  FATE_RECIPES,
  FATE_UNCHARTED,
} from "./fate-numenor-support";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { unitType } from "./card-types";

const isFate = (s: GameState) => !!s.fateNumenor;
const undead = (code: string) =>
  card(code).type_code === "enemy" &&
  /(?:^|\.\s*)Undead\./.test(card(code).traits ?? "");
const cost = (code: string) => Number(card(code).cost) || 0;
const lost = (s: GameState) => s.staging.filter((u) => u.code === F.lost);
const active = (s: GameState, code: string) =>
  isFate(s) && allActiveLocations(s).some((u) => u.code === code && !u.blanked);
const samePhase = (a: string | null, b: string) =>
  a === b || (!!a && [a, b].every((p) => ["quest", "staging"].includes(p)));
export const fateLocationQuest = (s: GameState, u: Unit) =>
  isFate(s) && u.code === F.lost ? Infinity : null;
export const fateCannotAttach = (s: GameState, u: Unit) =>
  isFate(s) && u.code === F.lost && !u.blanked;
export const fateQuestProgressBlocked = (s: GameState) =>
  isFate(s) && s.stage === 1;
export function fatePhaseEnd(s: GameState) {
  if (s.fateNumenor) {
    s.fateNumenor.fogPhase = null;
    s.fateNumenor.fogThreat = 0;
  }
}
export const fateStats = (s: GameState, u: Unit) => ({
  attack:
    isFate(s) &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
      ? -s.staging.filter((l) => l.code === F.jungle && !l.blanked).length
      : 0,
});
export const fateLoseRanged = (s: GameState, u: Unit) =>
  fateStats(s, u).attack < 0;
export const fateThreatBonus = (s: GameState, u: Unit) =>
  isFate(s) &&
  u.code === F.lost &&
  s.staging.some((l) => l.id === u.id) &&
  samePhase(s.fateNumenor!.fogPhase, s.phase)
    ? s.fateNumenor!.fogThreat
    : 0;
export const fateStagingThreat = (s: GameState) =>
  active(s, F.flooded)
    ? allActiveLocations(s)
        .filter((u) => u.code === F.flooded && !u.blanked)
        .reduce(
          (n, u) =>
            n + Math.max(0, (card(u.code).threat ?? 0) + (u.tempThreat ?? 0)),
          0,
        )
    : 0;
export const fateCannotDraw = (s: GameState) => active(s, F.shrine);
export const fateCannotSearch = (s: GameState, player = activeSeat(s)) =>
  active(s, F.shrine) ||
  (isFate(s) &&
    seatView(s, player).engaged.some(
      (u) => u.code === F.cadaver && !u.blanked,
    ));
export const fateCannotRefreshReady = (s: GameState, u: Unit) =>
  s.phase === "refresh" && active(s, F.temple) && stats(s, u).will < 2;

export function setupFateNumenor(s: GameState) {
  const recipe = FATE_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.fateNumenor = {
    initialized: false,
    unchartedDeck: shuffle(
      s,
      recipe.cards
        .filter((r) => r.section === "sharedEncounterDeck2")
        .flatMap((r) => Array<string>(r.quantity).fill(r.code)),
    ),
    setAside: [make(s, F.shrine)],
    hiddenBacks: {},
    lookedBy: {},
    fogPhase: null,
    fogThreat: 0,
    bottomOnDestroy: [],
    curseDamageIds: [],
  };
}
export function fateOpeningHandsKept(s: GameState) {
  if (!s.fateNumenor || s.fateNumenor.initialized) return false;
  prepend(s, fx("fateSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function fateAddIsland(s: GameState, code?: string) {
  const q = s.fateNumenor;
  if (!q) return;
  const back = code ?? q.unchartedDeck.shift();
  if (!back) return;
  const u = make(s, F.lost);
  q.hiddenBacks[u.id] = back;
  s.staging.push(u);
  log(s, "A Lost Island is added to the staging area.");
  return u;
}
/** Shuffle the physical islands and erase every association the players could track. */
export function fateShuffleIslands(s: GameState) {
  const q = s.fateNumenor;
  if (!q) return;
  const islands = lost(s),
    backs = shuffle(
      s,
      islands.map((u) => q.hiddenBacks[u.id]),
    );
  islands.forEach((u, i) => {
    delete q.hiddenBacks[u.id];
    delete q.lookedBy[u.id];
    u.id = `c${s.nextId++}`;
    u.progress = 0;
    q.hiddenBacks[u.id] = backs[i];
  });
  shuffle(s, islands);
  s.staging = [...s.staging.filter((u) => u.code !== F.lost), ...islands];
  log(
    s,
    "The Lost Islands are shuffled; their hidden sides can no longer be tracked.",
  );
}
export function fateActiveLocation(s: GameState, u: Unit) {
  if (!s.fateNumenor || u.code !== F.lost) return;
  const q = s.fateNumenor,
    back = q.hiddenBacks[u.id];
  if (!back) return;
  if (s.stage === 1) fateAddIsland(s);
  delete q.hiddenBacks[u.id];
  delete q.lookedBy[u.id];
  u.code = back;
  u.progress = 0;
  log(s, `Lost Island is turned over: ${name(u)}.`, "chapter");
  prepend(
    s,
    fx("fateFlipped", { target: u.id, code: back, player: firstPlayer(s) }),
  );
}
function removeOne(codes: string[], code: string) {
  const index = codes.lastIndexOf(code);
  if (index >= 0) codes.splice(index, 1);
}
export function fateLocationLeft(s: GameState, u: Unit, explored = false) {
  const q = s.fateNumenor;
  if (!q) return false;
  const original = u.code === F.lost ? q.hiddenBacks[u.id] : u.code;
  if (!FATE_UNCHARTED.includes(original)) return false;
  delete q.hiddenBacks[u.id];
  delete q.lookedBy[u.id];
  removeOne(s.encounterDeck, u.code);
  removeOne(s.encounterDiscard, u.code);
  if (explored && s.stage === 2) {
    addVictoryCard(s, original);
    if (original === F.shrine) win(s);
  } else {
    q.unchartedDeck.push(original);
    shuffle(s, q.unchartedDeck);
  }
  return true;
}
export function fateExplored(s: GameState, u: Unit, _wasActive: boolean) {
  if (!s.fateNumenor) return;
  if (s.stage === 1) {
    s.progress += card(u.code).quest ?? 0;
    log(
      s,
      `Explore the Island gains ${card(u.code).quest ?? 0} progress from the explored location.`,
      "good",
    );
  }
  fateLocationLeft(s, u, true);
  if (u.code === F.plateau && !u.blanked && lost(s).length)
    prepend(s, fx("fatePlateau", { player: firstPlayer(s) }));
  fateAdvance(s);
}
export function fateAdvance(s: GameState) {
  if (!s.fateNumenor) return false;
  if (
    !s.fateNumenor.initialized ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 20) {
    if (questDefeated(s, F.explore)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("fateStageTwo", { player: firstPlayer(s) }));
    log(
      s,
      "A Fateful Discovery · Find the hidden Shrine to Morgoth.",
      "chapter",
    );
  }
  return true;
}
export function fateCheck(s: GameState) {
  const q = s.fateNumenor;
  if (!q?.initialized || s.status !== "playing") return;
  // Player effects can make a location active without using the travel action.
  for (const location of allActiveLocations(s))
    if (location.code === F.lost) fateActiveLocation(s, location);
  for (const codes of [s.encounterDeck, s.encounterDiscard]) {
    for (let i = codes.length - 1; i >= 0; i--)
      if (FATE_UNCHARTED.includes(codes[i])) {
        q.unchartedDeck.push(codes.splice(i, 1)[0]);
        shuffle(s, q.unchartedDeck);
      }
  }
  if (!allCharacters(s).some((u) => u.code === F.calphon)) {
    s.status = "lost";
    s.reason = "Calphon has left play. The expedition is lost.";
    s.queue = [];
    s.choice = null;
    return;
  }
  const guide = allCharacters(s).find((u) => u.code === F.calphon);
  if (guide && ownerOf(s, guide) !== firstPlayer(s)) {
    const prior = ownerOf(s, guide);
    forOwner(
      s,
      prior,
      () => (s.allies = s.allies.filter((u) => u.id !== guide.id)),
    );
    guide.owner = firstPlayer(s);
    forOwner(s, firstPlayer(s), () => s.allies.push(guide));
  }
  fateAdvance(s);
}
function bottomDiscard(s: GameState, player: number) {
  let code: string | undefined;
  forOwner(s, player, () => {
    const n = s.deck.length;
    if (!n) return;
    reorderPlayerDeck(s, 0, [
      n - 1,
      ...Array.from({ length: n - 1 }, (_, i) => i),
    ]);
    code = discardPlayerDeck(s, 1, player)[0];
  });
  return code;
}
function handToBottom(s: GameState, u: Unit, player: number) {
  forOwner(s, player, () => (s.hand = s.hand.filter((h) => h.id !== u.id)));
  forOwner(s, u.owner ?? player, () => putPlayerDeck(s, u));
}
export function fateEngaged(s: GameState, u: Unit) {
  if (!isFate(s) || u.blanked) return;
  const player = ownerOf(s, u);
  if (u.code === F.servant)
    prepend(s, fx("fateServant", { target: u.id, player }));
  if (u.code === F.cadaver)
    prepend(s, fx("fateCadaver", { target: u.id, player }));
}
export function fateEnemyDestroyed(s: GameState, u: Unit, wasEngaged = true) {
  if (!isFate(s) || !wasEngaged || u.blanked || u.code !== F.throngs) return;
  prepend(s, fx("fateThrongs", { code: u.code, player: ownerOf(s, u) }));
}
export function fateCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const q = s.fateNumenor;
  if (!q || unitType(u) !== "ally") return;
  const enemy = get(s, context.enemyId);
  if (
    context.fateBottomOnDestroy ||
    (context.combatDamage &&
      ((enemy?.code === F.drowned && !enemy.blanked) ||
        !!s.combat?.fateBottomOnAllyKill))
  )
    if (!q.bottomOnDestroy.includes(u.id)) q.bottomOnDestroy.push(u.id);
}
/** Apply the replacement before any leave-play response sees a recoverable discard. */
export function fateCharacterLeft(
  s: GameState,
  u: Unit,
  destination: LeaveDestination,
) {
  const q = s.fateNumenor;
  if (!q?.bottomOnDestroy.includes(u.id) || destination.zone !== "discard")
    return;
  q.bottomOnDestroy = q.bottomOnDestroy.filter((id) => id !== u.id);
  forOwner(s, destination.player, () => {
    const index = destination.index ?? s.discard.lastIndexOf(u.code);
    if (s.discard[index] !== u.code) return;
    s.discard.splice(index, 1);
    putPlayerDeck(s, u);
    destination.zone = "deck";
    destination.index = s.deck.length - 1;
    destination.id = u.id;
    log(s, `${name(u)} is placed on the bottom of its owner's deck.`, "danger");
  });
}
export function fateAbilityLabel(s: GameState, u: Unit) {
  if (!isFate(s) || u.blanked) return null;
  if (u.code === F.lost && s.staging.some((l) => l.id === u.id))
    return "Remove 4 progress · Look at this island";
  if (u.code === F.calphon && ownerOf(s, u) === activeSeat(s))
    return "Exhaust · Look at your bottom card";
  return null;
}
export function fateAbilityProblem(s: GameState, u: Unit) {
  if (u.code === F.lost && u.progress < 4)
    return "Looking at Lost Island costs 4 progress.";
  if (
    u.code === F.calphon &&
    (u.exhausted || !seatView(s, ownerOf(s, u)).deck.length)
  )
    return "Calphon must be ready and your deck must contain a card.";
  return null;
}
export function fateAbility(s: GameState, u: Unit) {
  if (!fateAbilityLabel(s, u) || fateAbilityProblem(s, u)) return false;
  if (u.code === F.lost) {
    u.progress -= 4;
    prepend(s, fx("fateLook", { target: u.id, player: activeSeat(s) }));
  } else if (exhaustCharacter(s, u))
    prepend(s, fx("fateCalphon", { target: u.id, player: ownerOf(s, u) }));
  return true;
}
export function fateEncounter(s: GameState, code: string, replay = false) {
  if (!isFate(s)) return false;
  const player = firstPlayer(s);
  if (code === F.fog) prepend(s, fx("fateFog", { player }));
  else if (code === F.malevolence)
    prepend(s, fx("fateMalevolence", { player }));
  else if (code === F.ruins) prepend(s, fx("fateRuins", { player }));
  else if (code === F.curse) prepend(s, fx("fateCurse", { player }));
  else if (code === F.wandering)
    prepend(s, fx("fateWandering", { player, value: lost(s).length }));
  else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function fateShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!isFate(s) || !c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if ([F.plateau, F.malevolence].includes(code))
    prepend(s, fx("fateBottomShadow", { player, text: "attack" }));
  else if (code === F.fog)
    prepend(s, fx("fateBottomShadow", { player, text: "exhaust" }));
  else if (code === F.curse)
    prepend(s, fx("fateBottomShadow", { player, text: "extra" }));
  else if (code === F.drowned) c.fateBottomOnAllyKill = true;
  else return false;
  return true;
}

export function fatePublicState(s: GameState) {
  const q = s.fateNumenor;
  if (!q) return undefined;
  return {
    initialized: q.initialized,
    unchartedDeck: q.unchartedDeck.length,
    islands: lost(s).map((u) => ({
      id: u.id,
      progress: u.progress,
      ...(q.lookedBy[u.id]?.includes(activeSeat(s))
        ? { looked: q.hiddenBacks[u.id] }
        : {}),
    })),
    shrineFound: (s.victoryCards ?? []).includes(F.shrine),
  };
}
function lookOptions(s: GameState, effect = "fateLook"): Option[] {
  return lost(s).map((u, i) => ({
    id: u.id,
    label: `Lost Island ${i + 1} · ${u.progress} progress`,
    code: F.lost,
    effects: [fx(effect, { target: u.id })],
  }));
}
function chooseLook(s: GameState, title: string) {
  choose(s, title, lookOptions(s));
}
const playerSearchKinds = new Set([
  "huntMinstrelSearch",
  "huntSearchTake",
  "gondorSoldierSearch",
  "gondorSoldierTake",
  "sideQuestGatherSearch",
  "sideQuestGatherTake",
  "realmWatchmanSearch",
  "realmWatchmanTake",
  "isengardSearch",
  "isengardSearchTake",
  "rohanBreederSearch",
  "rohanBreederTake",
  "rohanArrowSearch",
  "rohanArrowAlly",
  "rohanMusterSearch",
  "rohanMusterResolve",
  "angmarHopeSearch",
  "longDarkCommandTake",
  "shadowFlameForgeTake",
  "mountainReward",
  "takeSearched",
  "collectorPartnerSearch",
  "collectorGaladrielSearch",
  "collectorGaladrielTarget",
  "elfTreeSearch",
  "elfSearchTake",
]);
const searchEvents = new Set(["02005", "02007", "04084"]);
/** Intercept serialized search continuations; looking/revealing are still permitted. */
export function fateBlocksSearchEffect(s: GameState, e: Effect) {
  if (!fateCannotSearch(s, e.player ?? activeSeat(s))) return false;
  return (
    playerSearchKinds.has(e.kind) ||
    (e.kind === "playerEventAbility" && searchEvents.has(e.code ?? "")) ||
    (e.kind === "elfAllyResolve" && get(s, e.target)?.code === "08063")
  );
}
export const fateForbiddenSearchAbility = (s: GameState, u: Unit) =>
  u.code === "04134" && fateCannotSearch(s);
export function fateEffect(s: GameState, e: Effect) {
  if (fateBlocksSearchEffect(s, e)) {
    log(
      s,
      "The active encounter effect prevents searching this player deck.",
      "danger",
    );
    return true;
  }
  if (!e.kind.startsWith("fate") || !s.fateNumenor) return false;
  const q = s.fateNumenor,
    u = get(s, e.target) ?? s.hand.find((h) => h.id === e.target),
    player = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "fateSetup": {
      q.initialized = true;
      const guide = make(s, F.calphon);
      guide.owner = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(guide));
      for (let i = 0; i < (playerOrder(s).length >= 3 ? 3 : 2); i++)
        fateAddIsland(s);
      break;
    }
    case "fateStageTwo":
      fateAddIsland(s);
      fateAddIsland(s);
      if (q.setAside.length) fateAddIsland(s, q.setAside.shift()!.code);
      fateShuffleIslands(s);
      s.stageRevealing = false;
      break;
    case "fateRuins":
      fateAddIsland(s);
      fateShuffleIslands(s);
      break;
    case "fateLook": {
      if (!u || u.code !== F.lost || !q.hiddenBacks[u.id]) break;
      q.lookedBy[u.id] ??= [];
      if (!q.lookedBy[u.id].includes(player)) q.lookedBy[u.id].push(player);
      const back = q.hiddenBacks[u.id];
      choose(
        s,
        "Lost Island · Facedown side",
        [
          {
            id: "close",
            label: `Remember ${card(back).name}`,
            code: back,
            effects: [],
          },
        ],
        "Looking does not turn the island over or resolve its forced effect.",
      );
      break;
    }
    case "fatePlateau":
      choose(s, "Steep Plateau · Look at an island?", [
        {
          id: "look",
          label: "Look at a facedown side",
          effects: [fx("fateChooseLook")],
        },
        skip,
      ]);
      break;
    case "fateChooseLook":
      chooseLook(s, "Choose an Uncharted location to look at");
      break;
    case "fateFlipped":
      if (!u || !allActiveLocations(s).some((l) => l.id === u.id) || u.blanked)
        break;
      if (u.code === F.jungle)
        choose(s, "Lush Jungle · Exhaust the heroes?", [
          ...(allHeroes(s)
            .filter((h) => !h.exhausted)
            .every(
              (h) => !khazadCannotExhaust(h) && !watcherWaterCannotExhaust(h),
            )
            ? [
                {
                  id: "exhaust",
                  label: "Each player exhausts every ready hero",
                  effects: [fx("fateJungleExhaust", { target: u.id })],
                },
              ]
            : []),
          {
            id: "return",
            label: "Return Lush Jungle to the staging area",
            effects: [fx("fateJungleReturn", { target: u.id })],
          },
        ]);
      if (u.code === F.coast)
        prepend(
          s,
          ...playerOrder(s).map((p) => fx("fateCoastDraw", { player: p })),
        );
      if (u.code === F.graves)
        prepend(
          s,
          fx("fateGravesDiscard", { value: playerOrder(s).length + 2 }),
        );
      if (u.code === F.shrine) {
        for (const ally of allCharacters(s).filter(
          (a) =>
            ["ally", "objective-ally"].includes(unitType(a)) &&
            cost(a.code) <= 2,
        ))
          exhaustCharacter(s, ally);
        prepend(
          s,
          ...playerOrder(s).map((p) => fx("fateShrineEnemy", { player: p })),
          fx("fateShuffleEncounter"),
        );
      }
      break;
    case "fateJungleExhaust":
      for (const h of allHeroes(s).filter((h) => !h.exhausted))
        exhaustCharacter(s, h);
      break;
    case "fateJungleReturn":
      if (u && allActiveLocations(s).some((l) => l.id === u.id)) {
        removeActiveLocation(s, u.id);
        s.staging.push(u);
      }
      break;
    case "fateCoastDraw":
      choose(s, `${seatName(s, player)} · Forbidden Coast`, [
        {
          id: "draw",
          label: "Draw 1 card",
          effects: [fx("draw", { value: 1 }), fx("fateCoastBottom")],
        },
        { id: "skip", label: "Skip drawing", effects: [fx("fateCoastBottom")] },
      ]);
      break;
    case "fateCoastBottom":
      choose(
        s,
        "Forbidden Coast · Place a card on the bottom",
        opts(s.hand, (h) => [fx("fateHandBottom", { target: h.id })]),
      );
      break;
    case "fateHandBottom":
      if (u && s.hand.some((h) => h.id === u.id)) handToBottom(s, u, player);
      break;
    case "fateGravesDiscard": {
      const discarded: string[] = [];
      for (let i = 0; i < (e.value ?? 0) && s.encounterDeck.length; i++) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (undead(code)) discarded.push(code);
      }
      q.gravesPool = discarded;
      prepend(
        s,
        ...playerOrder(s).map((p) =>
          fx("fateGravesEnemy", { player: p, ids: discarded }),
        ),
        fx("fateGravesEnd"),
      );
      break;
    }
    case "fateGravesEnemy": {
      const available = [...new Set(q.gravesPool ?? e.ids)].filter((code) =>
        s.encounterDiscard.includes(code),
      );
      choose(
        s,
        "Drowned Graves · Add a discarded Undead enemy",
        available.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("fateAddGravesEnemy", { code })],
        })),
      );
      break;
    }
    case "fateAddGravesEnemy":
      if (
        e.code &&
        q.gravesPool?.includes(e.code) &&
        s.encounterDiscard.includes(e.code)
      ) {
        removeOne(q.gravesPool, e.code);
        removeOne(s.encounterDiscard, e.code);
        const enemy = make(s, e.code);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    case "fateGravesEnd":
      delete q.gravesPool;
      break;
    case "fateShrineEnemy": {
      const enemies = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard].filter(undead)),
      ];
      choose(
        s,
        `${seatName(s, player)} · Shrine to Morgoth`,
        enemies.map((code) => ({
          id: code,
          code,
          label: `Engage ${card(code).name}`,
          effects: [fx("fateEngageShrineEnemy", { code })],
        })),
      );
      break;
    }
    case "fateEngageShrineEnemy":
      if (e.code) {
        const codes = s.encounterDeck.includes(e.code)
          ? s.encounterDeck
          : s.encounterDiscard;
        if (!codes.includes(e.code)) break;
        removeOne(codes, e.code);
        const enemy = make(s, e.code);
        s.staging.push(enemy);
        engage(s, enemy);
      }
      break;
    case "fateShuffleEncounter":
      shuffle(s, s.encounterDeck);
      break;
    case "fateServant": {
      if (!u || !s.deck.length) break;
      const top = s.deck[0],
        low = cost(top) <= 2;
      choose(s, "Servant of the Deceiver · Top card", [
        {
          id: "resolve",
          label: low
            ? `Place ${card(top).name} on the bottom · Enemy gets +2 attack`
            : `Leave ${card(top).name} on top`,
          code: top,
          effects: low ? [fx("fateServantBottom", { target: u.id })] : [],
        },
      ]);
      break;
    }
    case "fateServantBottom":
      if (u && s.deck.length && cost(s.deck[0]) <= 2) {
        putPlayerDeck(s, takePlayerDeck(s));
        u.roundAttack = (u.roundAttack ?? 0) + 2;
      }
      break;
    case "fateCadaver": {
      const cards = s.hand.filter((h) => cost(h.code) <= 2);
      if (cards.length)
        choose(
          s,
          "Soulless Cadaver · Put low-cost cards on the bottom",
          opts(cards, (h) => [
            fx("fateHandBottom", { target: h.id }),
            fx("fateCadaver", { target: e.target }),
          ]),
        );
      break;
    }
    case "fateThrongs": {
      const bottom = bottomDiscard(s, player);
      if (
        bottom &&
        cost(bottom) <= 2 &&
        e.code &&
        s.encounterDiscard.includes(e.code)
      ) {
        removeOne(s.encounterDiscard, e.code);
        s.encounterDeck.unshift(e.code);
      }
      break;
    }
    case "fateBottomShadow": {
      const bottom = bottomDiscard(s, player);
      if (!bottom || cost(bottom) > 2 || !s.combat) break;
      if (e.text === "attack") s.combat.attackBonus += 2;
      if (e.text === "exhaust")
        prepend(s, fx("chooseExhaust", { count: 1, player }));
      if (e.text === "extra")
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      break;
    }
    case "fateMalevolence": {
      const bottom = bottomDiscard(s, player);
      if (bottom)
        for (const h of [...s.hand].filter((h) => cost(h.code) > cost(bottom)))
          discardHandCard(s, h.id);
      break;
    }
    case "fateFog": {
      const canExhaust = playerOrder(s).every((p) =>
        allCharacters(s).some(
          (c) =>
            ownerOf(s, c) === p &&
            !c.exhausted &&
            !khazadCannotExhaust(c) &&
            !watcherWaterCannotExhaust(c),
        ),
      );
      choose(s, "Mysterious Fog · Choose one", [
        ...(canExhaust
          ? [
              {
                id: "exhaust",
                label: "Each player exhausts a character",
                effects: playerOrder(s).map((p) =>
                  fx("chooseExhaust", { count: 1, player: p }),
                ),
              },
            ]
          : []),
        {
          id: "threat",
          label: "Each Lost Island gets +1 threat for this phase",
          effects: [fx("fateFogThreat")],
        },
      ]);
      break;
    }
    case "fateFogThreat":
      if (!samePhase(q.fogPhase, s.phase)) q.fogThreat = 0;
      q.fogPhase = s.phase;
      q.fogThreat++;
      break;
    case "fateCurse": {
      const allies = allCharacters(s).filter(
        (a) => unitType(a) === "ally" && cost(a.code) <= 2,
      );
      q.curseDamageIds = allies.map((a) => a.id);
      prepend(
        s,
        ...allies.map((a) =>
          fx("damage", {
            target: a.id,
            value: 1,
            player: ownerOf(s, a),
            text: encodeDamageContext({ fateBottomOnDestroy: true }),
          }),
        ),
        fx("fateCurseEnd"),
      );
      break;
    }
    case "fateCurseEnd":
      q.curseDamageIds = [];
      break;
    case "fateWandering": {
      const committed = allCharacters(s).filter((c) => c.committed);
      if ((e.value ?? 0) <= 0 || !committed.length) {
        prepend(s, fx("fateWanderingLook", { player: firstPlayer(s) }));
        break;
      }
      choose(
        s,
        `Aimless Wandering · Remove at least ${e.value} willpower`,
        committed.map((c) => ({
          id: c.id,
          code: c.code,
          label: `Remove ${name(c)} · ${stats(s, c).will} willpower`,
          effects: [
            fx("fateWanderingRemove", {
              target: c.id,
              value: e.value,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "fateWanderingRemove":
      if (u?.committed) {
        const value = stats(s, u).will;
        u.committed = false;
        prepend(
          s,
          fx("fateWandering", {
            value: Math.max(0, (e.value ?? 0) - value),
            player: firstPlayer(s),
          }),
        );
      }
      break;
    case "fateWanderingLook":
      if (lost(s).length)
        choose(s, "Aimless Wandering · Look at an island?", [
          {
            id: "doomed",
            label: "Doomed 2 · Look at a facedown side",
            effects: [fx("fateWanderingDoomed")],
          },
          skip,
        ]);
      break;
    case "fateWanderingDoomed":
      for (const p of playerOrder(s))
        forOwner(s, p, () => raiseThreat(s, 2, "encounter"));
      chooseLook(s, "Aimless Wandering · Choose an island");
      break;
    case "fateCalphon": {
      const bottom = s.deck.at(-1);
      if (!bottom) break;
      choose(s, "Calphon · Bottom card", [
        ...s.hand.map((h) => ({
          id: h.id,
          label: `Switch ${card(bottom).name} with ${name(h)}`,
          code: h.code,
          effects: [fx("fateCalphonSwitch", { target: h.id, code: bottom })],
        })),
        {
          id: "skip",
          label: `Leave ${card(bottom).name} on the bottom`,
          code: bottom,
          effects: [],
        },
      ]);
      break;
    }
    case "fateCalphonSwitch":
      if (u && s.hand.some((h) => h.id === u.id) && s.deck.at(-1) === e.code) {
        const bottom = takePlayerDeck(s, s.deck.length - 1);
        handToBottom(s, u, player);
        s.hand.push(bottom);
      }
      break;
    default:
      return false;
  }
  return true;
}
