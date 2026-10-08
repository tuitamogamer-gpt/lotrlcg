// Original Escape from Mount Gram: physical prisoners and independent dungeon areas.
import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import { isAlly } from "./card-types";
import {
  choose,
  draw,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  questWill,
  random,
  requireRule,
  shuffle,
  stagingThreat,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  characterLeftPlay,
  discardAttachment,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  needsTarget,
  resolvePlayerCard,
} from "./actions";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  eachArea,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
  startPhase,
} from "./table";
import { effectiveTraits, hasTrait } from "./expansion-passives";
import { syncAttachmentText } from "./attachment-text";
import { choosePlayerResponse } from "./player-ability-triggers";
import { khazadBeforeStaging } from "./khazad-dum";
import { rohanRevealReduction } from "./rohan-player-cards";
import { emynPlayerRevealReduction } from "./emyn-player-cards";
import { resolveDoomed } from "./voice-isengard";
import {
  GRAM as G,
  GRAM_ENCOUNTERS,
  gramArea,
  gramCaptureCount,
  gramQuestUnit,
  gramRecipe,
  gramSelectArea,
  gramSideTime,
  gramState,
  gramSyncArea,
  isMountGram,
  type GramArea,
} from "./mount-gram-support";
export * from "./mount-gram-support";

const isGram = (s: GameState) => isMountGram(s) && !!gramState(s);
const q = (s: GameState) => gramState(s)!;
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const hosts = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
  ...allEngaged(s),
  ...(gramQuestUnit(s) ? [gramQuestUnit(s)!] : []),
];
const cost = (code: string) => {
  const n = Number(card(code).cost);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const areaKey = (s: GameState) =>
  q(s).split ? (gramArea(s)?.id ?? "shared") : "shared";
const alarm = (s: GameState) => {
  const a = q(s).alarms[areaKey(s)];
  return a?.round === s.round ? a.copies : 0;
};
const orderedAreas = (s: GameState) => {
  const order = globalPlayerOrder(s);
  return [...q(s).areas].sort(
    (a, b) =>
      Math.min(...a.players.map((p) => order.indexOf(p))) -
      Math.min(...b.players.map((p) => order.indexOf(p))),
  );
};
const areaFirst = (s: GameState, a: GramArea) =>
  globalPlayerOrder(s).find((p) => a.players.includes(p)) ?? a.players[0];
const clean = (
  u: Pick<Unit, "id" | "code" | "owner">,
  owner: number,
): Unit => ({
  id: u.id,
  code: u.code,
  owner,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };

/** Cards remain hidden until a printed effect explicitly permits their inspection. */
export const gramCapturedUnit = (s: GameState, host: string, id: string) =>
  gramState(s)?.captured[host]?.find((u) => u.id === id);
export function gramTakeCaptured(s: GameState, host: string, id: string) {
  const cards = gramState(s)?.captured[host];
  if (!cards) return;
  const index = cards.findIndex((u) => u.id === id);
  if (index < 0) return;
  const [u] = cards.splice(index, 1);
  if (!cards.length) delete q(s).captured[host];
  return u;
}
function captureTop(
  s: GameState,
  host: Unit,
  count: number,
  players = playerOrder(s),
) {
  if (!count) return;
  const cards = players.flatMap((p) =>
    (q(s).capturedDecks[p] ?? []).splice(0, count),
  );
  if (cards.length) (q(s).captured[host.id] ??= []).push(...cards);
  log(
    s,
    `${name(host)} captures ${cards.length} card${cards.length === 1 ? "" : "s"}.`,
    "danger",
  );
}
function captureCharacter(s: GameState, host: Unit, u: Unit) {
  const controller = ownerOf(s, u),
    owner = u.owner ?? controller,
    lastAttack = stats(s, u).attack,
    lastTraits = effectiveTraits(u);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  forOwner(s, controller, () => {
    s.heroes = s.heroes.filter((x) => x.id !== u.id);
    s.allies = s.allies.filter((x) => x.id !== u.id);
    s.committedIds = s.committedIds.filter((id) => id !== u.id);
  });
  const captured = clean(u, owner);
  (q(s).captured[host.id] ??= []).push(captured);
  characterLeftPlay(
    s,
    u,
    controller,
    {
      zone: "captured",
      player: owner,
      id: host.id,
      index: q(s).captured[host.id].length - 1,
    },
    lastAttack,
    lastTraits,
  );
  log(s, `${name(u)} is captured beneath ${name(host)}.`, "danger");
  syncAttachmentText(s);
}
function rescue(
  s: GameState,
  source: Unit,
  cards: Unit[],
  guardResponse = false,
) {
  if (!cards.length) return;
  const rescued: Unit[] = [];
  for (const u of cards) {
    const owner = u.owner ?? activeSeat(s);
    if (s.table?.seats[owner].eliminated) {
      seatView(s, owner).discard.push(u.code);
      continue;
    }
    forOwner(s, owner, () => {
      if (card(u.code).type_code === "hero") s.heroes.push(clean(u, owner));
      else s.hand.push(clean(u, owner));
    });
    rescued.push(u);
    log(s, `${card(u.code).name} is rescued by ${seatName(s, owner)}.`, "good");
  }
  syncAttachmentText(s);
  if (!rescued.length) return;
  const effects: Effect[] = enemies(s)
    .filter((u) => u.id !== source.id && u.code === G.jailor && !u.blanked)
    .map((u) => fx("gramJailor", { target: u.id, player: firstPlayer(s) }));
  if (guardResponse && !source.blanked)
    effects.push(
      fx("gramGuardResponse", {
        source: source.id,
        code: source.code,
        ids: rescued.map((u) => u.id),
        player: firstPlayer(s),
      }),
    );
  prepend(s, ...effects);
}
/** Called after removing the host's visible card, before its final state check. */
export function gramCardLeaves(s: GameState, u: Unit) {
  if (!isGram(s)) return;
  const cards = q(s).captured[u.id];
  if (!cards?.length) return;
  delete q(s).captured[u.id];
  rescue(s, u, cards, u.code === G.guard);
}
export function gramCardEntered(s: GameState, u: Unit, _fromReveal: boolean) {
  if (!isGram(s)) return;
  captureTop(s, u, gramCaptureCount(u.code));
  if (gramSideTime(u.code)) u.timeCounters = gramSideTime(u.code);
}
export function setupMountGram(s: GameState) {
  const r = gramRecipe(!!s.easyMode);
  s.encounterDeck = r.initial;
  (s as GameState & { mountGram: ReturnType<typeof gramState> }).mountGram = {
    initialized: false,
    split: false,
    areas: [],
    capturedDecks: {},
    captured: {},
    setAside: r.setAside.map((c) => make(s, c)),
    orcDeck: r.orcs,
    removedQuests: [],
    removedEncounter: [],
    resolvedAreas: [],
    travelResolvedAreas: [],
    alarms: {},
  };
}
export function gramOpeningHandsKept(s: GameState) {
  if (!isGram(s) || q(s).initialized) return false;
  s.stageRevealing = true;
  prepend(
    s,
    ...globalPlayerOrder(s).map((player) => fx("gramChooseHero", { player })),
    fx("gramCreateAreas", { player: globalPlayerOrder(s)[0] }),
    fx("nextRound", { player: globalPlayerOrder(s)[0] }),
  );
  return true;
}
export function gramHeroMissingAllowed(s: GameState, player: number) {
  return (
    isGram(s) &&
    [
      ...(q(s).capturedDecks[player] ?? []),
      ...Object.values(q(s).captured).flat(),
    ].some((u) => u.owner === player && card(u.code).type_code === "hero")
  );
}
export function gramStats(s: GameState, u: Unit) {
  if (!isGram(s) || card(u.code).type_code !== "enemy") return { attack: 0 };
  const tormentor =
    u.code === G.tormentor && !u.blanked
      ? hosts(s).filter((x) => (q(s).captured[x.id]?.length ?? 0) > 0).length
      : 0;
  return {
    attack:
      tormentor +
      alarm(s) +
      (hasTrait(u, "Orc")
        ? allActiveLocations(s).filter((l) => l.code === G.gate && !l.blanked)
            .length * 2
        : 0),
  };
}
export const gramEngagementCost = (s: GameState, u: Unit) =>
  isGram(s) && card(u.code).type_code === "enemy" ? -10 * alarm(s) : 0;
export const gramLocationThreat = (s: GameState, u: Unit) =>
  isGram(s) && u.code === G.tunnels && !u.blanked
    ? (q(s).captured[u.id]?.length ?? 0)
    : undefined;
export function gramCombatDamage(
  s: GameState,
  target: Unit,
  enemy: Unit,
  amount: number,
) {
  if (!isGram(s) || amount <= 0 || !isAlly(target)) return false;
  if (
    (enemy.code === G.torturer && !enemy.blanked) ||
    s.combat?.gramCaptureDamage
  ) {
    captureCharacter(s, enemy, target);
    return true;
  }
  return false;
}
export function gramProgress(s: GameState, amount: number) {
  const quest = gramQuestUnit(s);
  if (!isGram(s) || !quest || quest.blanked) return false;
  const cards = q(s).captured[quest.id] ?? [],
    rescued: Unit[] = [];
  for (let i = 0; i < amount && cards.length; i++)
    rescued.push(cards.splice(Math.floor(random(s) * cards.length), 1)[0]);
  if (!cards.length) delete q(s).captured[quest.id];
  rescue(s, quest, rescued);
  return true;
}
export function gramAdvance(s: GameState) {
  if (!isGram(s)) return false;
  if (
    q(s).initialized &&
    s.stage === 3 &&
    s.progress >= 16 &&
    !hosts(s).some((u) => u.code === G.gate) &&
    !s.queue.length &&
    !s.choice &&
    !s.stageRevealing
  ) {
    if (!questDefeated(s, G.flight)) win(s);
  }
  return true;
}
export function gramBeginStaging(s: GameState) {
  if (!isGram(s) || !q(s).split) return false;
  q(s).resolvedAreas = [];
  const areas = orderedAreas(s);
  for (const a of areas)
    enqueue(s, fx("gramAreaStaging", { text: a.id, player: areaFirst(s, a) }));
  enqueue(s, fx("questReady", { player: areaFirst(s, areas[0]) }));
  return true;
}
export function gramResolveQuest(s: GameState) {
  if (!isGram(s) || !q(s).split) return false;
  const a = gramArea(s);
  requireRule(
    a && !q(s).resolvedAreas.includes(a.id),
    "This dungeon has already resolved its quest.",
  );
  requireRule(
    activeSeat(s) === firstPlayer(s),
    "The first player in this dungeon resolves its quest.",
  );
  const will = questWill(s),
    threat = stagingThreat(s),
    net = will - threat;
  s.lastQuest = { will, threat, net };
  log(
    s,
    `${card(G.dungeons).name} · ${will} willpower − ${threat} threat = ${net}.`,
    net < 0 ? "danger" : "good",
  );
  if (net > 0)
    enqueue(s, fx("questSucceeded", { value: net, player: firstPlayer(s) }));
  else if (net < 0)
    enqueue(s, fx("failedQuest", { value: -net, player: firstPlayer(s) }));
  enqueue(s, fx("gramAreaQuestDone", { text: a.id, player: firstPlayer(s) }));
  return true;
}
/** Return the completed framework to its decision seat after scoped responses. */
export function gramIdleActor(s: GameState) {
  if (
    !isGram(s) ||
    !q(s).split ||
    s.status !== "playing" ||
    s.queue.length ||
    s.choice ||
    s.flow?.pending ||
    !["staging", "travel"].includes(s.phase)
  )
    return;
  const area =
    s.phase === "staging"
      ? orderedAreas(s).find((a) => !q(s).resolvedAreas.includes(a.id))
      : (gramArea(s, s.table?.turn ?? activeSeat(s)) ?? gramArea(s));
  if (!area) return;
  const player = areaFirst(s, area);
  selectSeat(s, player);
  if (s.table) s.table.turn = player;
}
export function gramTravelStart(s: GameState) {
  if (!isGram(s) || !q(s).split) return false;
  gramSyncArea(s);
  q(s).travelResolvedAreas = [];
  prepend(
    s,
    fx("gramJoinOrder", {
      ids: orderedAreas(s)
        .filter((a) => !q(s).captured[a.quest.id]?.length)
        .map((a) => a.id),
      player: globalPlayerOrder(s)[0],
    }),
  );
  return true;
}
export function gramTravelNext(s: GameState) {
  if (!isGram(s) || !q(s).split) return false;
  const a = gramArea(s);
  requireRule(
    a && activeSeat(s) === firstPlayer(s),
    "The first player in this dungeon makes its travel decision.",
  );
  if (!q(s).travelResolvedAreas.includes(a.id))
    q(s).travelResolvedAreas.push(a.id);
  const next = orderedAreas(s).find(
    (a) => !q(s).travelResolvedAreas.includes(a.id),
  );
  if (next) {
    const p = areaFirst(s, next);
    selectSeat(s, p);
    if (s.table) s.table.turn = p;
  } else
    enqueue(
      s,
      fx("phaseEnd", { player: globalPlayerOrder(s)[0] }),
      fx("startEncounter", { player: globalPlayerOrder(s)[0] }),
    );
  return true;
}
export function gramTravelProblem(s: GameState, u: Unit) {
  if (isGram(s) && u.code === G.gate && s.stage === 3 && s.progress < 16)
    return "Place at least 16 progress on Flight from Mount Gram before travelling to Southern Gate.";
  return null;
}
export function gramTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (isGram(s) && u.code === G.patrol && !u.blanked)
    return playerOrder(s).map((player) => fx("threat", { value: 3, player }));
  return undefined;
}
export function gramTraveled(s: GameState, u: Unit) {
  if (!isGram(s) || u.blanked) return;
  if (u.code === G.cell)
    prepend(
      s,
      fx("gramCellResponse", {
        source: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
}
/** Gate's Forced condition is becoming active, including a location switch. */
export function gramActiveLocationChanged(s: GameState, u: Unit) {
  if (isGram(s) && u.code === G.gate && !u.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("gramGateThreat", { player })),
    );
}
export function gramRefreshEnd(s: GameState) {
  if (!isGram(s)) return;
  const effects: Effect[] = [];
  eachArea(s, () => {
    for (const u of s.staging.filter((u) => u.code === G.executioners)) {
      if (!u.timeCounters) continue;
      u.timeCounters--;
      if (!u.timeCounters && !u.blanked)
        effects.push(
          fx("gramExecutioners", { target: u.id, player: firstPlayer(s) }),
        );
    }
  });
  if (effects.length === 1) prepend(s, effects[0]);
  else if (effects.length)
    prepend(
      s,
      fx("fangornOrder", {
        effects,
        text: "Choose the next executioner Forced effect",
        player: firstPlayer(s),
      }),
    );
}
function discardEncounter(s: GameState, u: Unit, rescueCards = true) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
    (x) => x.id !== u.id,
  );
  forOwner(
    s,
    ownerOf(s, u),
    () => (s.engaged = s.engaged.filter((x) => x.id !== u.id)),
  );
  s.encounterDiscard.push(u.code, ...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  if (rescueCards) gramCardLeaves(s, u);
}
/** FAQ3.246: a solitary eliminated area's cards leave the game area, without merging it. */
export function gramPlayerEliminated(s: GameState, player: number) {
  if (!isGram(s)) return;
  const discardCaptured = (u: Unit) =>
    seatView(s, u.owner ?? player).discard.push(u.code);
  for (const u of q(s).capturedDecks[player] ?? []) discardCaptured(u);
  q(s).capturedDecks[player] = [];
  for (const [host, cards] of Object.entries(q(s).captured)) {
    for (const u of cards.filter((u) => u.owner === player)) discardCaptured(u);
    q(s).captured[host] = cards.filter((u) => u.owner !== player);
    if (!q(s).captured[host].length) delete q(s).captured[host];
  }
  const a = gramArea(s, player);
  if (!q(s).split || !a) return;
  const surviving = a.players.filter(
    (p) => p !== player && !s.table?.seats[p].eliminated,
  );
  if (surviving.length) {
    a.players = surviving;
    return;
  }
  gramSyncArea(s);
  for (const u of [...s.staging, ...allActiveLocations(s), ...s.engaged])
    discardEncounter(s, u);
  gramCardLeaves(s, a.quest);
  q(s).removedQuests.push(a.quest);
  q(s).areas = q(s).areas.filter((x) => x.id !== a.id);
  q(s).resolvedAreas = q(s).resolvedAreas.filter((id) => id !== a.id);
  q(s).travelResolvedAreas = q(s).travelResolvedAreas.filter(
    (id) => id !== a.id,
  );
  delete q(s).alarms[a.id];
  delete q(s).activeArea;
}

export function gramEncounter(s: GameState, code: string, replay = false) {
  if (!isGram(s)) return false;
  if (code === G.alarm) {
    const a = q(s).alarms[areaKey(s)];
    q(s).alarms[areaKey(s)] = {
      round: s.round,
      copies: (a?.round === s.round ? a.copies : 0) + 1,
    };
    if (!enemies(s).length)
      prepend(s, fx("gramAlarmSearch", { player: firstPlayer(s) }));
  } else if (code === G.weary)
    prepend(s, ...playerOrder(s).map((player) => fx("gramWeary", { player })));
  else if (code === G.captives)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("gramChooseCaptive", { player })),
    );
  else if (code === G.interrogation)
    prepend(
      s,
      fx("gramInterrogation", {
        ids: playerOrder(s).map(String),
        text: playerOrder(s).join(","),
        flag: false,
        player: firstPlayer(s),
      }),
    );
  else if (!GRAM_ENCOUNTERS.some((c) => c.code === code)) return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function gramShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!isGram(s) || !c) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  if (code === G.patrol) c.attackBonus += s.threat >= 20 ? 2 : 1;
  else if (code === G.tormentor)
    c.attackBonus += (q(s).captured[c.enemyId]?.length ?? 0) ? 1 : 2;
  else if (code === G.captives) c.gramCaptureDamage = true;
  else if (code === G.interrogation) {
    if (s.hand.length) {
      const u = s.hand[Math.floor(random(s) * s.hand.length)];
      discardHandCard(s, u.id);
      raiseThreat(s, cost(u.code), "encounter");
    }
  } else if (code === G.weary)
    choose(
      s,
      "Feeble and Weary · Exhaust a character",
      opts(
        [...s.heroes, ...s.allies].filter((u) => !u.exhausted),
        (u) => [fx("exhaust", { target: u.id })],
      ),
    );
  else if (code === G.tunnels) {
    const host = get(s, c.enemyId);
    if (host)
      for (const d of defenders)
        for (const a of [...d.attachments]) {
          const owner = a.owner ?? ownerOf(s, d);
          d.attachments = d.attachments.filter((x) => x.id !== a.id);
          (q(s).captured[host.id] ??= []).push(clean(a, owner));
        }
    syncAttachmentText(s);
  } else return false;
  return true;
}

function playable(s: GameState, u: Unit) {
  return card(u.code).type_code === "hero"
    ? !globalCharacters(s).some((x) => card(x.code).name === card(u.code).name)
    : !effectCardPlayProblem(seatView(s, u.owner ?? activeSeat(s)), u, {
        putIntoPlay: true,
      });
}
function freeOptions(s: GameState, cards: Unit[], source: string) {
  return cards
    .filter((u) => playable(s, u))
    .map((u) => ({
      id: u.id,
      code: u.code,
      label: `${name(u)} · ${seatName(s, u.owner ?? activeSeat(s))}`,
      effects: [
        fx("gramFreeCard", {
          source,
          target: u.id,
          player: u.owner ?? activeSeat(s),
        }),
      ],
    }));
}
export function gramEffect(s: GameState, e: Effect) {
  if (!isGram(s)) return e.kind.startsWith("gram");
  if (e.kind === "questReady" && q(s).split) {
    const area = orderedAreas(s).find(
      (a) => !q(s).resolvedAreas.includes(a.id),
    );
    if (area) {
      const player = areaFirst(s, area);
      selectSeat(s, player);
      if (s.table) s.table.turn = player;
    }
  }
  if (e.kind === "startTravel" && q(s).split) return gramTravelStart(s);
  if (e.kind === "travelDone" && q(s).split) return gramTravelNext(s);
  if (e.kind === "finishQuestPhase" && q(s).split) {
    globalCharacters(s).forEach((u) => (u.committed = false));
    prepend(
      s,
      fx("phaseEnd", { player: globalPlayerOrder(s)[0] }),
      fx("startTravel", { player: globalPlayerOrder(s)[0] }),
    );
    return true;
  }
  if (!e.kind.startsWith("gram")) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "gramChooseHero":
      choose(
        s,
        "Unexpected Rescue · Choose your starting hero",
        opts(s.heroes, (u) => [
          fx("gramPrepareDeck", { target: u.id, player: activeSeat(s) }),
        ]),
        "Your other heroes, allies and Item, Mount and Artifact attachments form a separate captured deck. Only this hero starts in play.",
      );
      break;
    case "gramPrepareDeck": {
      if (!u || !s.heroes.some((h) => h.id === u.id)) break;
      for (const h of [...s.hand]) putPlayerDeck(s, h);
      s.hand = [];
      shuffle(s, s.deck);
      const captured: Unit[] = [];
      for (let i = s.deck.length - 1; i >= 0; i--) {
        const c = card(s.deck[i]);
        if (
          c.type_code === "ally" ||
          (c.type_code === "attachment" &&
            (c.traits ?? "")
              .split(".")
              .some((t) => ["Item", "Mount", "Artifact"].includes(t.trim())))
        )
          captured.push(clean(takePlayerDeck(s, i), activeSeat(s)));
      }
      const other = s.heroes.filter((h) => h.id !== u.id),
        top = other.length
          ? other.splice(Math.floor(random(s) * other.length), 1)[0]
          : undefined;
      captured.push(...other.map((h) => clean(h, activeSeat(s))));
      shuffle(s, captured);
      if (top) captured.unshift(clean(top, activeSeat(s)));
      q(s).capturedDecks[activeSeat(s)] = captured;
      s.heroes = [u];
      u.resources += 2;
      s.threat = card(u.code).threat ?? 0;
      draw(s, 3);
      log(
        s,
        `${name(u)} escapes the first cell. Your other companions and equipment are captured.`,
        "chapter",
      );
      break;
    }
    case "gramCreateAreas": {
      const players = globalPlayerOrder(s);
      q(s).initialized = true;
      s.stage = 2;
      s.progress = 0;
      q(s).areas = players.map((p) => {
        const quest = make(s, G.dungeons);
        delete quest.owner;
        return {
          id: `gram-area-${p}`,
          players: [p],
          quest,
          progress: 0,
          staging: [],
          activeLocation: null,
          extraActiveLocations: [],
          questDebuff: 0,
          fog: 0,
          threatModifier: 0,
        };
      });
      q(s).split = true;
      delete q(s).activeArea;
      gramSelectArea(s, activeSeat(s));
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        ...players.map((player) => fx("gramStageTwoSetup", { player })),
        fx("gramStageReady", { player: players[0] }),
      );
      break;
    }
    case "gramStageTwoSetup": {
      const a = gramArea(s);
      if (!a) break;
      captureTop(s, a.quest, 7);
      const index = s.encounterDeck.indexOf(G.cell);
      if (index >= 0) {
        s.encounterDeck.splice(index, 1);
        const before = new Set(s.staging.map((u) => u.id));
        const continuation = s.queue;
        s.queue = [];
        revealed(s, G.cell, undefined, "encounter");
        // Capture 1, reveal cancellation/response windows and any Surge resolve
        // before the printed Then captures two additional cards here.
        s.queue.push(
          fx("gramCellSetupExtra", { ids: [...before], player: activeSeat(s) }),
          ...continuation,
        );
      }
      break;
    }
    case "gramCellSetupExtra": {
      const cell = [...s.staging]
        .reverse()
        .find((u) => u.code === G.cell && !(e.ids ?? []).includes(u.id));
      if (cell) captureTop(s, cell, 2);
      break;
    }
    case "gramStageReady":
      s.stageRevealing = false;
      break;
    case "gramAreaStaging": {
      khazadBeforeStaging(s);
      const count = rohanRevealReduction(
        s,
        emynPlayerRevealReduction(s, playerOrder(s).length),
      );
      prepend(
        s,
        ...Array.from({ length: count }, () =>
          fx("reveal", { player: firstPlayer(s) }),
        ),
        fx("khazadStagingEnd", { player: firstPlayer(s) }),
      );
      break;
    }
    case "gramAreaQuestDone": {
      gramSyncArea(s);
      if (!q(s).resolvedAreas.includes(e.text!))
        q(s).resolvedAreas.push(e.text!);
      const next = orderedAreas(s).find(
        (a) => !q(s).resolvedAreas.includes(a.id),
      );
      if (next) {
        const p = areaFirst(s, next);
        selectSeat(s, p);
        if (s.table) s.table.turn = p;
      } else
        prepend(s, fx("finishQuestPhase", { player: globalPlayerOrder(s)[0] }));
      break;
    }
    case "gramJoinOrder": {
      gramSyncArea(s);
      const ids = (e.ids ?? []).filter((id) =>
        q(s).areas.some(
          (a) => a.id === id && !q(s).captured[a.quest.id]?.length,
        ),
      );
      if (!ids.length) {
        startPhase(s, "travel");
        break;
      }
      const source = q(s).areas.find((a) => a.id === ids[0])!,
        other = orderedAreas(s).filter((a) => a.id !== source.id),
        p = areaFirst(s, source);
      selectSeat(s, p);
      if (!other.length) prepend(s, fx("gramStageThree", { player: p }));
      else
        choose(
          s,
          "Gornákh's Dungeons · Join another staging area",
          other.map((a) => ({
            id: a.id,
            code: a.quest.code,
            label: a.players.map((p) => seatName(s, p)).join("; "),
            effects: [
              fx("gramJoin", {
                source: source.id,
                target: a.id,
                ids: ids.slice(1),
                player: p,
              }),
            ],
          })),
          "Keep your engaged enemies, move your staging cards, and discard your former active location. Its captives are rescued.",
        );
      break;
    }
    case "gramJoin": {
      gramSyncArea(s);
      const from = q(s).areas.find((a) => a.id === e.source),
        to = q(s).areas.find((a) => a.id === e.target);
      requireRule(
        from && to && from !== to && !q(s).captured[from.quest.id]?.length,
        "Complete this dungeon before joining another area.",
      );
      for (const l of [...allActiveLocations(s)]) discardEncounter(s, l);
      gramSyncArea(s);
      to.staging.push(...from.staging);
      to.players.push(...from.players);
      const a = q(s).alarms[from.id],
        b = q(s).alarms[to.id];
      if (a?.round === s.round)
        q(s).alarms[to.id] = {
          round: s.round,
          copies: a.copies + (b?.round === s.round ? b.copies : 0),
        };
      for (const attachment of [...from.quest.attachments])
        discardAttachment(s, from.quest, attachment, true);
      delete q(s).alarms[from.id];
      q(s).removedQuests.push(from.quest);
      q(s).areas = q(s).areas.filter((a) => a.id !== from.id);
      delete s.sideQuestSelections;
      gramSelectArea(s, activeSeat(s));
      log(s, "The escaped companions join another dungeon.", "chapter");
      prepend(
        s,
        fx("gramJoinOrder", { ids: e.ids, player: globalPlayerOrder(s)[0] }),
      );
      break;
    }
    case "gramStageThree": {
      gramSyncArea(s);
      const a = gramArea(s);
      if (a) {
        for (const attachment of [...a.quest.attachments])
          discardAttachment(s, a.quest, attachment, true);
        q(s).removedQuests.push(a.quest);
        const effect = q(s).alarms[a.id];
        if (effect) q(s).alarms.shared = effect;
      }
      q(s).areas = [];
      q(s).split = false;
      delete q(s).activeArea;
      q(s).resolvedAreas = [];
      q(s).travelResolvedAreas = [];
      s.stage = 3;
      s.progress = 0;
      s.stageRevealing = true;
      delete s.sideQuestSelections;
      for (const card of q(s).setAside.splice(0)) {
        s.staging.push(card);
        enemyAddedToStaging(s, card);
        gramCardEntered(s, card, false);
      }
      s.encounterDeck.push(...q(s).orcDeck.splice(0));
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Flight from Mount Gram · Reach Southern Gate and escape.",
        "chapter",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("reveal", { player })),
        fx("gramStageReady", { player: firstPlayer(s) }),
        fx("gramTravelReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "gramTravelReady":
      startPhase(s, "travel");
      break;
    case "gramGateThreat":
      if (s.threat < 35) raiseThreat(s, 35 - s.threat, "encounter");
      break;
    case "gramCellResponse": {
      const cards = q(s).captured[e.source!] ?? [];
      if (cards.length)
        choosePlayerResponse(
          s,
          e.source!,
          G.cell,
          "Prison Cell · Put a captive into play?",
          [...freeOptions(s, cards, e.source!), skip],
          cards
            .map(
              (u) =>
                `${card(u.code).name} (${seatName(s, u.owner ?? activeSeat(s))})`,
            )
            .join("; "),
        );
      break;
    }
    case "gramGuardResponse": {
      const cards = playerOrder(s)
        .flatMap((p) => seatView(s, p).hand)
        .filter(
          (u) =>
            (e.ids ?? []).includes(u.id) && card(u.code).type_code !== "hero",
        );
      if (cards.length)
        choosePlayerResponse(
          s,
          e.source!,
          G.guard,
          "Dungeon Guard · Put a rescued card into play?",
          [...freeOptions(s, cards, "hand"), skip],
        );
      break;
    }
    case "gramFreeCard": {
      const card =
        e.source === "hand"
          ? s.hand.find((u) => u.id === e.target)
          : gramCapturedUnit(s, e.source!, e.target!);
      if (!card || !playable(s, card)) break;
      if (needsTarget(card))
        choose(
          s,
          `Put ${name(card)} into play · Choose a target`,
          opts(
            effectCardPlayTargets(s, card, { putIntoPlay: true }),
            (target) => [
              fx("gramFreeCardTarget", {
                source: e.source,
                target: card.id,
                text: target.id,
                player: activeSeat(s),
              }),
            ],
          ),
        );
      else
        prepend(
          s,
          fx("gramFreeCardTarget", {
            source: e.source,
            target: card.id,
            player: activeSeat(s),
          }),
        );
      break;
    }
    case "gramFreeCardTarget": {
      const physical =
        e.source === "hand"
          ? s.hand.find((u) => u.id === e.target)
          : gramCapturedUnit(s, e.source!, e.target!);
      if (!physical || !playable(s, physical)) break;
      if (
        needsTarget(physical) &&
        !effectCardPlayTargets(s, physical, { putIntoPlay: true }).some(
          (u) => u.id === e.text,
        )
      )
        break;
      if (e.source === "hand")
        s.hand = s.hand.filter((u) => u.id !== physical.id);
      else gramTakeCaptured(s, e.source!, physical.id);
      if (card(physical.code).type_code === "hero")
        s.heroes.push(clean(physical, physical.owner ?? activeSeat(s)));
      else resolvePlayerCard(s, physical, e.text, 0, false, false);
      syncAttachmentText(s);
      break;
    }
    case "gramJailor": {
      if (!u || u.blanked) break;
      const players = playerOrder(s),
        maximum = Math.max(...players.map((p) => seatView(s, p).threat)),
        tied = players.filter((p) => seatView(s, p).threat === maximum);
      if (tied.length === 1)
        prepend(s, fx("gramJailorEngage", { target: u.id, player: tied[0] }));
      else
        choose(
          s,
          "Jailor Gornákh · Highest threat tie",
          tied.map((p) => ({
            id: String(p),
            label: seatName(s, p),
            effects: [fx("gramJailorEngage", { target: u.id, player: p })],
          })),
        );
      break;
    }
    case "gramJailorEngage":
      if (u) {
        if (!s.engaged.some((x) => x.id === u.id)) engage(s, u);
        prepend(
          s,
          fx("immediateAttack", { target: u.id, player: activeSeat(s) }),
        );
      }
      break;
    case "gramExecutioners": {
      if (!u || u.blanked || u.timeCounters) break;
      const cards = q(s).captured[u.id] ?? [];
      delete q(s).captured[u.id];
      const threats = new Map<number, number>();
      for (const c of cards) {
        const p = c.owner ?? activeSeat(s);
        seatView(s, p).discard.push(c.code);
        if (["hero", "ally"].includes(card(c.code).type_code))
          threats.set(p, (threats.get(p) ?? 0) + 3);
      }
      s.staging = s.staging.filter((x) => x.id !== u.id);
      q(s).removedEncounter.push(u.code);
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      prepend(
        s,
        ...[...threats].map(([player, value]) =>
          fx("threat", { player, value }),
        ),
      );
      break;
    }
    case "gramAlarmSearch": {
      const options = [
        ...s.encounterDeck.map((code, index) => ({
          code,
          index,
          source: "deck",
        })),
        ...s.encounterDiscard.map((code, index) => ({
          code,
          index,
          source: "discard",
        })),
      ]
        .filter((x) => card(x.code).type_code === "enemy")
        .map((x) => ({
          id: `${x.source}:${x.index}`,
          code: x.code,
          label: `${card(x.code).name} · ${x.source}`,
          effects: [
            fx("gramAlarmFound", {
              code: x.code,
              text: x.source,
              value: x.index,
              player: firstPlayer(s),
            }),
          ],
        }));
      choose(s, "Sound the Alarm! · Search for an enemy", options);
      break;
    }
    case "gramAlarmFound": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck,
        index = e.value ?? -1;
      if (pile[index] !== e.code) break;
      pile.splice(index, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      gramCardEntered(s, enemy, false);
      enemyAddedToStaging(s, enemy);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "gramWeary": {
      const chars = [...s.heroes, ...s.allies].filter((u) => u.exhausted),
        questers = chars.filter((u) => u.committed);
      if (!chars.length) break;
      const choices: Option[] = [
        {
          id: "damage",
          label: "Deal 1 damage to every exhausted character",
          effects: chars.map((u) => fx("damage", { target: u.id, value: 1 })),
        },
      ];
      if (questers.length === chars.length)
        choices.push({
          id: "remove",
          label: "Remove every exhausted character from the quest",
          effects: questers.map((u) => fx("uncommit", { target: u.id })),
        });
      choose(s, "Feeble and Weary · Choose an effect", choices);
      break;
    }
    case "gramChooseCaptive":
      choose(
        s,
        "Captives of Gornákh · Choose one of your allies",
        opts(s.allies.filter(isAlly), (u) => [
          fx("gramCaptiveHost", {
            source: u.id,
            owner: activeSeat(s),
            player: firstPlayer(s),
          }),
        ]),
      );
      break;
    case "gramCaptiveHost": {
      const ally = get(s, e.source);
      if (!ally) break;
      const choices = hosts(s).filter(
          (u) =>
            card(u.code).sphere_code === "encounter" &&
            card(u.code).type_code !== "quest",
        ),
        maximum = Math.max(...choices.map((u) => threatOf(s, u))),
        targets = choices.filter((u) => threatOf(s, u) === maximum);
      choose(
        s,
        "Captives of Gornákh · Highest threat encounter card",
        opts(targets, (u) => [
          fx("gramCaptureAlly", {
            target: u.id,
            source: ally.id,
            player: e.owner ?? activeSeat(s),
          }),
        ]),
      );
      break;
    }
    case "gramCaptureAlly": {
      const ally = get(s, e.source);
      if (u && ally) captureCharacter(s, u, ally);
      break;
    }
    case "gramInterrogation": {
      const participants = (e.text ?? playerOrder(s).join(","))
          .split(",")
          .map(Number)
          .filter((p) => !s.table?.seats[p]?.eliminated),
        ids = (e.ids ?? []).filter((id) => participants.includes(Number(id))),
        [head, ...rest] = ids;
      // A dying isolated area cannot export its gained keyword to another area.
      if (!participants.length) break;
      if (head !== undefined)
        prepend(
          s,
          fx("gramInterrogationPlayer", {
            player: Number(head),
            ids: rest,
            text: e.text,
            flag: e.flag,
          }),
        );
      else if (e.flag) {
        selectSeat(s, participants[0]);
        resolveDoomed(s, 2, "encounter");
      }
      break;
    }
    case "gramInterrogationPlayer": {
      const c = (q(s).capturedDecks[activeSeat(s)] ?? []).shift();
      if (c) {
        seatView(s, c.owner ?? activeSeat(s)).discard.push(c.code);
        raiseThreat(s, cost(c.code), "encounter");
      }
      prepend(
        s,
        fx("gramInterrogation", {
          ids: e.ids,
          text: e.text,
          flag: !!e.flag || !c,
          player:
            (e.text ?? String(activeSeat(s)))
              .split(",")
              .map(Number)
              .find((p) => !s.table?.seats[p]?.eliminated) ?? activeSeat(s),
        }),
      );
      break;
    }
  }
  return true;
}
