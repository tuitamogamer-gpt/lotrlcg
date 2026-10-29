import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { shadowEastAttachmentImmune } from "./shadow-east-player-support";
import { canTravel } from "./actions";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
  putPlayerDeck,
  reorderPlayerDeck,
} from "./core";
import {
  damage,
  discardAttachment,
  discardHandCard,
  discardPlayerDeck,
  discardQuestAttachments,
  enemyAddedToStaging,
  exhaustCharacter,
  questDefeated,
  takePlayerDiscard,
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
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isAlly, isHero } from "./card-types";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import {
  ASH as A,
  ASH_ENCOUNTERS,
  ASH_RECIPES,
  ashPhase,
  ashStageInfo,
} from "./ash-mountains-support";
export const ashQuestCount = (s: GameState) => allQuestUnits(s).length;
export const ashX = (s: GameState) => 1 + ashQuestCount(s);
export const ashEventShuffleBlocked = (s: GameState) =>
  !!s.ashMountains && !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const own = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const cost = (code?: string) =>
  code ? Math.max(0, Number(card(code).cost) || 0) : 0;
type Combat = NonNullable<GameState["combat"]>;
function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck.push(...s.encounterDiscard.splice(0));
  shuffle(s, s.encounterDeck);
}
function find(s: GameState, type: string) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === type) return code;
    s.encounterDiscard.push(code);
  }
}
function takeEncounter(s: GameState, code: string) {
  for (const pile of [s.encounterDeck, s.encounterDiscard]) {
    const i = pile.indexOf(code);
    if (i >= 0) {
      pile.splice(i, 1);
      return code;
    }
  }
}
function archive(s: GameState, host: Unit, kind: "dial" | "deeps", n: number) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const cards: Unit[] = [];
      while (cards.length < n && s.deck.length) {
        const u = takePlayerDeck(s);
        u.owner ??= p;
        cards.push(u);
      }
      s.ashMountains!.custody.push({ host: host.id, kind, player: p, cards });
    });
}
function release(
  s: GameState,
  host: string,
  recover: boolean,
  onlyPlayer?: number,
) {
  const q = s.ashMountains!,
    groups = q.custody.filter(
      (g) =>
        g.host === host &&
        (onlyPlayer === undefined || g.player === onlyPlayer),
    );
  q.custody = q.custody.filter((g) => !groups.includes(g));
  const decks = new Set<number>();
  for (const g of groups)
    for (const u of g.cards) {
      const owner = u.owner ?? g.player;
      const destination = g.kind === "deeps" ? owner : g.player;
      const returned = recover && !s.table?.seats[destination].eliminated;
      if (returned) {
        forOwner(s, destination, () => putPlayerDeck(s, u));
        decks.add(destination);
      } else forOwner(s, owner, () => s.discard.push(u.code));
    }
  for (const player of decks)
    forOwner(s, player, () =>
      reorderPlayerDeck(
        s,
        0,
        shuffle(
          s,
          s.deck.map((_, i) => i),
        ),
      ),
    );
}
export function setupAsh(s: GameState) {
  const r = ASH_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.ashMountains = {
    initialized: false,
    currentQuest: A.first,
    advancing: false,
    setupChosen: [],
    resolving: [],
    custody: [],
    starved: [],
    writhing: {},
    blankRound: -1,
    noReady: [],
    played: { round: 0, counts: {} },
    progressLimit: { round: 0, placed: 0 },
    damage: { round: 0, counts: {} },
    supplies: [],
  };
  add(s, A.patrol);
  shuffle(s, s.encounterDeck);
}
function stageAdvance(s: GameState) {
  const q = s.ashMountains!;
  if (
    q.initialized &&
    !q.advancing &&
    !s.stageRevealing &&
    !s.pendingQuestDefeat &&
    s.progress >= 25
  ) {
    if (s.stage === 2) {
      win(s);
      s.reason =
        "The fellowship emerges from Torech Gorgor before its supplies run out.";
    } else {
      q.advancing = true;
      prepend(s, fx("ashDefeatQuest", { player: firstPlayer(s) }));
    }
  }
  return true;
}
function onEntered(s: GameState, u: Unit, reveal: boolean, cancelled: boolean) {
  if (!reveal || cancelled || u.blanked) return;
  if (u.code === A.deeps) archive(s, u, "deeps", 3);
  if (u.code === A.lost) archive(s, u, "dial", 10);
  if (u.code === A.tunnel) {
    const code = find(s, "enemy");
    if (code) add(s, code);
  }
  if (u.code === A.passage) {
    const old = allActiveLocations(s).filter((l) => l.id !== u.id);
    s.staging = s.staging.filter((l) => l.id !== u.id);
    s.staging.push(...old);
    s.activeLocation = u;
    s.extraActiveLocations = [];
  }
}
function onLeave(s: GameState, u: Unit) {
  // Wait until exploration has returned the captured cards before cleaning up other departures.
  if (u.code === A.deeps)
    prepend(
      s,
      fx("ashRelease", { source: u.id, flag: false, player: firstPlayer(s) }),
    );
  if (u.blanked) return;
  if (u.code === A.opening)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("ashRandomDiscard", { player })),
    );
  if (u.code === A.passage)
    prepend(
      s,
      ...allCharacters(s)
        .filter((u) => u.exhausted)
        .map((u) => fx("damage", { target: u.id, value: 1 })),
    );
}
function onExplore(s: GameState, u: Unit, active: boolean) {
  if (active) for (const side of live(s, A.tunnels)) side.resources++;
  if (u.blanked) return;
  if (u.code === A.deeps && active) release(s, u.id, true);
  if (u.code === A.chasm)
    prepend(s, fx("ashDiscard", { value: ashX(s), player: firstPlayer(s) }));
  if (u.code === A.orc)
    prepend(s, fx("ashFindPatrol", { player: firstPlayer(s) }));
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  if (code === A.beast) c.attackBonus += cost(seatView(s, p).discard.at(-1));
  else if (code === A.wolf) c.ashDiscardOnKill = (c.ashDiscardOnKill ?? 0) + 2;
  else if (code === A.spawn) prepend(s, fx("ashExhaust", { player: p }));
  else if (code === A.reek) prepend(s, fx("ashReekShadow", { player: p }));
  else if (code === A.supplies) {
    c.ashAttachmentOnKill = (c.ashAttachmentOnKill ?? 0) + 1;
    prepend(s, fx("ashDiscardAttachment", { player: p }));
  } else if (code === A.writhing) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === A.shadows)
    for (const id of defenders)
      s.ashMountains!.noReady.push({ id, round: s.round });
  else if (code === A.tunnel) {
    const top = encounterDraw(s);
    if (top) {
      if (card(top).type_code === "enemy") add(s, top);
      else s.encounterDiscard.push(top);
    }
  } else return false;
  return true;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!ASH_ENCOUNTERS.some((c) => c.code === code)) return false;
  if (card(code).type_code !== "treachery") return true;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  s.ashMountains!.resolving.push(u);
  prepend(
    s,
    fx("ashTreachery", { code, source: u.id, player: firstPlayer(s) }),
    fx("ashTreacheryDone", { source: u.id, player: firstPlayer(s) }),
  );
  return true;
}
export function ashEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("ash") || e.kind.startsWith("ashPlayer")) return false;
  const q = s.ashMountains;
  if (!q) return false;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "ashSetup":
      for (const player of playerOrder(s))
        discardPlayerDeck(
          s,
          Math.max(0, seatView(s, player).deck.length - 40),
          player,
        );
      prepend(
        s,
        ...playerOrder(s)
          .slice(1)
          .map((player) => fx("ashSetupLocation", { player })),
        fx("ashSetupSide", { player: firstPlayer(s) }),
      );
      break;
    case "ashSetupLocation": {
      const codes = [...new Set(s.encounterDeck)].filter(
        (c) => card(c).type_code === "location" && !q.setupChosen.includes(c),
      );
      if (codes.length)
        choose(
          s,
          "Torech Gorgor · Choose a different starting location",
          codes.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("ashSetupTake", { code, player: p })],
          })),
        );
      break;
    }
    case "ashSetupTake":
      if (e.code && takeEncounter(s, e.code)) {
        q.setupChosen.push(e.code);
        add(s, e.code);
      }
      break;
    case "ashSetupSide": {
      q.initialized = true;
      shuffle(s, s.encounterDeck);
      const code = find(s, "encounter-side-quest");
      prepend(
        s,
        ...(code ? [fx("revealCard", { code, player: firstPlayer(s) })] : []),
        fx("ashShuffle", { player: firstPlayer(s) }),
      );
      break;
    }
    case "ashShuffle":
      shuffleDiscard(s);
      break;
    case "ashDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("ashNextQuest", { player: firstPlayer(s) }));
      break;
    }
    case "ashNextQuest":
      discardQuestAttachments(s, q.currentQuest);
      s.stage = 2;
      q.currentQuest = A.last;
      s.progress = 0;
      s.stageRevealing = true;
      prepend(
        s,
        fx("ashChooseSide", { player: firstPlayer(s) }),
        fx("ashStageEnemies", { player: firstPlayer(s) }),
      );
      break;
    case "ashChooseSide": {
      const codes = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard]),
      ].filter((c) => card(c).type_code === "encounter-side-quest");
      if (codes.length)
        choose(
          s,
          "An Evil Place · Reveal an encounter side quest",
          codes.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("ashSideTake", { code, player: p })],
          })),
        );
      break;
    }
    case "ashSideTake":
      if (e.code && takeEncounter(s, e.code))
        prepend(s, fx("revealCard", { code: e.code, player: firstPlayer(s) }));
      break;
    case "ashStageEnemies": {
      shuffleDiscard(s);
      const n = playerOrder(s).length;
      for (let i = 0; i < n; i++) {
        const code = find(s, "enemy");
        if (code) add(s, code);
      }
      s.stageRevealing = false;
      q.advancing = false;
      break;
    }
    case "ashRoundEnd": {
      const n = ashX(s),
        players = playerOrder(s);
      for (const player of players) discardPlayerDeck(s, n, player);
      for (const player of players)
        if (!seatView(s, player).deck.length && !q.starved.includes(player)) {
          q.starved.push(player);
          log(
            s,
            `Player ${player + 1} runs out of supplies and is eliminated.`,
            "danger",
          );
        }
      break;
    }
    case "ashDiscard":
      discardPlayerDeck(s, e.value ?? 1, p);
      break;
    case "ashFindPatrol":
      if (takeEncounter(s, A.patrol)) add(s, A.patrol);
      shuffle(s, s.encounterDeck);
      break;
    case "ashRelease":
      release(s, e.source!, !!e.flag);
      break;
    case "ashLostDiscard": {
      const g = q.custody.find((g) => g.host === e.source && g.player === p),
        c = g?.cards.shift();
      if (c) forOwner(s, c.owner ?? p, () => s.discard.push(c.code));
      break;
    }
    case "ashRandomDiscard": {
      const hand = seatView(s, p).hand;
      if (hand.length)
        forOwner(s, p, () =>
          discardHandCard(s, hand[Math.floor(random(s) * hand.length)].id, {
            encounterEffect: true,
          }),
        );
      break;
    }
    case "ashSpawn":
      if (u && !u.blanked)
        choose(s, "Spawn of Shelob · Discard a card or face its fury", [
          ...(seatView(s, p).deck.length
            ? [
                {
                  id: "discard",
                  label: "Discard the top card of your deck",
                  effects: [fx("ashDiscard", { player: p })],
                },
              ]
            : []),
          {
            id: "attack",
            label: "Spawn gets +2 attack this round",
            effects: [fx("ashSpawnBoost", { target: u.id, player: p })],
          },
        ]);
      break;
    case "ashSpawnBoost":
      if (u) u.roundAttack = (u.roundAttack ?? 0) + 2;
      break;
    case "ashBeast": {
      const top = discardPlayerDeck(s, 1, p)[0];
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.attackBonus += cost(top);
      break;
    }
    case "ashExhaust": {
      const chars = own(s, p).filter(
        (u) =>
          !u.exhausted &&
          !khazadCannotExhaust(u) &&
          !watcherWaterCannotExhaust(u),
      );
      if (chars.length)
        choose(
          s,
          "Spawn of Shelob · Exhaust a character",
          chars.map((u) =>
            option(u, [fx("ashExhaustTake", { target: u.id, player: p })]),
          ),
        );
      break;
    }
    case "ashExhaustTake":
      if (u && !u.exhausted) exhaustCharacter(s, u);
      break;
    case "ashReekShadow":
      choose(s, "Burning Reek · Discard cards or return the attacker", [
        ...(seatView(s, p).deck.length >= 2
          ? [
              {
                id: "discard",
                label: "Discard the top 2 cards of your deck",
                effects: [fx("ashDiscard", { value: 2, player: p })],
              },
            ]
          : []),
        {
          id: "return",
          label: "Return the attacker to staging after this attack",
          effects: [fx("ashReekReturn", { player: p })],
        },
      ]);
      break;
    case "ashReekReturn":
      if (s.combat) s.combat.returnToStaging = true;
      break;
    case "ashDiscardAttachment": {
      const hosts = [
        ...new Map(
          [
            ...allCharacters(s),
            ...s.staging,
            ...allActiveLocations(s),
            ...allEngaged(s),
            ...allQuestUnits(s),
          ].map((u) => [u.id, u]),
        ).values(),
      ];
      const choices = hosts.flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              attachmentController(s, h, a) === p &&
              card(a.code).sphere_code !== "encounter" &&
              !card(a.code).text?.includes("Permanent") &&
              !shadowEastAttachmentImmune(a),
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(h)}`,
            effects: [
              fx("ashAttachmentTake", {
                target: h.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
      );
      if (choices.length)
        choose(
          s,
          "Ransacked Supplies · Discard an attachment you control",
          choices,
        );
      break;
    }
    case "ashAttachmentTake":
      if (u) {
        const a = u.attachments.find((a) => a.id === e.source);
        if (a) discardAttachment(s, u, a);
      }
      break;
    case "ashTreachery":
      if (e.code === A.shadows) q.blankRound = s.round;
      if (e.code === A.reek)
        for (const player of playerOrder(s))
          discardPlayerDeck(s, own(s, player).length, player);
      if (e.code === A.supplies) {
        let amount = 0;
        for (const player of playerOrder(s))
          amount += cost(discardPlayerDeck(s, 1, player)[0]);
        q.supplies.push({ round: s.round, phase: ashPhase(s), amount });
      }
      if (e.code === A.writhing) {
        q.writhing[e.source!] = [];
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("ashAssign", { value: ashX(s), player, source: e.source }),
          ),
          fx("ashExhaustDamaged", { source: e.source, player: firstPlayer(s) }),
        );
      }
      break;
    case "ashTreacheryDone": {
      const i = q.resolving.findIndex((u) => u.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      break;
    }
    case "ashAssign": {
      const units = own(s, p).filter((u) => u.damage < stats(s, u).health);
      if ((e.value ?? 0) > 0 && units.length)
        choose(
          s,
          `Writhing Shadows · Assign ${e.value} damage`,
          units.map((u) =>
            option(u, [
              fx("ashAssignOne", {
                target: u.id,
                player: p,
                value: e.value,
                source: e.source,
              }),
            ]),
          ),
        );
      break;
    }
    case "ashAssignOne": {
      prepend(
        s,
        fx("ashAssign", {
          value: (e.value ?? 0) - 1,
          source: e.source,
          player: p,
        }),
      );
      if (u) damage(s, u.id, 1, { ashWrithingToken: e.source });
      break;
    }
    case "ashExhaustDamaged":
      for (const id of q.writhing[e.source!] ?? []) {
        const unit = get(s, id);
        if (unit && !unit.exhausted) exhaustCharacter(s, unit);
      }
      delete q.writhing[e.source!];
      break;
    case "ashDarknessResponse":
      choose(s, "Overwhelming Darkness · Recover supplies", [
        {
          id: "recover",
          label: "Each player shuffles their top 3 discards into their deck",
          effects: [fx("ashDarknessRecover", { player: firstPlayer(s) })],
        },
        { id: "skip", label: "Skip the response", effects: [] },
      ]);
      break;
    case "ashDarknessRecover":
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          if (dikeCannotLeaveDiscard(s)) return;
          for (let i = 0; i < 3 && s.discard.length; i++)
            putPlayerDeck(s, takePlayerDiscard(s, s.discard.length - 1));
          shuffle(s, s.deck);
        });
      break;
  }
  return true;
}
export const ASH_HOOKS: Batch4ScenarioHooks = {
  setup: setupAsh,
  openingHandsKept: (s) => {
    if (s.ashMountains!.initialized) return false;
    prepend(s, fx("ashSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance: stageAdvance,
  stageInfo: ashStageInfo,
  playerEliminationReason: (s, p) =>
    s.ashMountains!.starved.includes(p)
      ? "Your deck is empty at the end of the round. Your fellowship runs out of supplies."
      : undefined,
  playerEliminated: (s, p) => {
    for (const g of [...s.ashMountains!.custody].filter((g) => g.player === p))
      release(s, g.host, false, p);
  },
  cardEntered: onEntered,
  hostLeaves: onLeave,
  explored: onExplore,
  threatBonus: (s, u) =>
    !u.blanked && [A.patrol, A.chasm].includes(u.code) ? ashX(s) : 0,
  stagingThreat: (s) =>
    s
      .ashMountains!.supplies.filter(
        (x) => x.round === s.round && x.phase === ashPhase(s),
      )
      .reduce((n, x) => n + x.amount, 0),
  progress: (s, n, u) => {
    if (u.code === A.tunnels && !u.blanked && u.resources < 3) return 0;
    if (u.code !== s.ashMountains!.currentQuest) return n;
    if (s.stageRevealing) return 0;
    const q = s.ashMountains!;
    if (q.progressLimit.round !== s.round)
      q.progressLimit = { round: s.round, placed: 0 };
    return live(s, A.patrol).length
      ? Math.min(n, Math.max(0, 5 - q.progressLimit.placed))
      : n;
  },
  questProgressPlaced: (s, u, n) => {
    if (u.code === s.ashMountains!.currentQuest) {
      const q = s.ashMountains!;
      if (q.progressLimit.round !== s.round)
        q.progressLimit = { round: s.round, placed: 0 };
      q.progressLimit.placed += n;
    }
  },
  canSelectSideQuest: (s, u) =>
    u.code !== A.haunt ||
    u.blanked ||
    !s.staging.some((x) => card(x.code).type_code === "enemy"),
  sideDefeated: (s, u) => {
    if (u.code === A.lost) release(s, u.id, !u.blanked);
    if (u.code === A.darkness && !u.blanked)
      prepend(s, fx("ashDarknessResponse", { player: firstPlayer(s) }));
  },
  damageAmount: (s, u, n) => {
    const q = s.ashMountains!;
    if (q.damage.round !== s.round) q.damage = { round: s.round, counts: {} };
    return card(u.code).type_code === "enemy" && live(s, A.haunt).length
      ? Math.min(n, Math.max(0, 4 - (q.damage.counts[u.id] ?? 0)))
      : n;
  },
  damageDealt: (s, u, n, ctx) => {
    const q = s.ashMountains!;
    if (q.damage.round !== s.round) q.damage = { round: s.round, counts: {} };
    if (
      ctx.ashWrithingToken &&
      q.writhing[ctx.ashWrithingToken] &&
      !q.writhing[ctx.ashWrithingToken].includes(u.id)
    )
      q.writhing[ctx.ashWrithingToken].push(u.id);
    if (card(u.code).type_code === "enemy")
      q.damage.counts[u.id] = (q.damage.counts[u.id] ?? 0) + n;
    if (ctx.combatDamage && s.combat && ctx.enemyId === s.combat.enemyId)
      s.combat.ashExcess =
        (s.combat.ashExcess ?? 0) + Math.max(0, u.damage - stats(s, u).health);
  },
  characterDestroyed: (s, _u, ctx) => {
    if (ctx.combatDamage && s.combat && ctx.enemyId === s.combat.enemyId)
      s.combat.ashKilled = true;
  },
  cannotAttach: (_s, u) => u.code === A.troll && !u.blanked,
  cannotCancel: (s) => live(s, A.orc).length > 0,
  engaged: (s, u) => {
    if (u.blanked) return;
    const player = ownerOf(s, u);
    if (u.code === A.patrol)
      prepend(s, fx("immediateAttack", { target: u.id, player }));
    if (u.code === A.spawn)
      prepend(s, fx("ashSpawn", { target: u.id, player }));
  },
  enemyAttackStarted: (s, u, p) => {
    if (u.blanked) return;
    if (u.code === A.beast)
      prepend(s, fx("ashBeast", { target: u.id, player: p }));
    if (s.combat) {
      s.combat.ashWolf = u.code === A.wolf;
      s.combat.ashTroll = u.code === A.troll;
    }
  },
  attackFinished: (_s, c: Combat, skipped = false) => {
    if (skipped || !c.attackResolved) return [];
    const p = c.attackPlayer,
      fxs: Effect[] = [];
    const n =
      (c.ashWolf ? (c.ashKilled ? 2 : 1) : 0) +
      (c.ashKilled
        ? (c.ashDiscardOnKill ?? 0) + (c.ashTroll ? (c.ashExcess ?? 0) : 0)
        : 0);
    if (n) fxs.push(fx("ashDiscard", { value: n, player: p }));
    if (c.ashKilled)
      for (let i = 0; i < (c.ashAttachmentOnKill ?? 0); i++)
        fxs.push(fx("ashDiscardAttachment", { player: p }));
    return fxs;
  },
  characterBlanked: (s, u) =>
    (isHero(u) || isAlly(u)) && s.ashMountains!.blankRound === s.round,
  cannotReady: (s, u) =>
    s.ashMountains!.noReady.some((x) => x.id === u.id && x.round === s.round),
  threatRaised: (s, p, n) => {
    if (n > 0)
      for (const g of s.ashMountains!.custody.filter(
        (g) =>
          g.kind === "dial" &&
          g.player === p &&
          s.staging.some((u) => u.id === g.host && !u.blanked),
      ))
        prepend(s, fx("ashLostDiscard", { source: g.host, player: p }));
  },
  playerCardPlayed: (s) => {
    const q = s.ashMountains!;
    if (q.played.round !== s.round) q.played = { round: s.round, counts: {} };
    const p = activeSeat(s);
    q.played.counts[p] = (q.played.counts[p] ?? 0) + 1;
    for (const _u of live(s, A.darkness))
      prepend(s, fx("ashDiscard", { player: p }));
  },
  playProblem: (s, code) =>
    code === "01049" && ashEventShuffleBlocked(s)
      ? "The main quest prevents events from shuffling discards into player decks."
      : allActiveLocations(s).some((u) => u.code === A.opening && !u.blanked) &&
          s.ashMountains!.played.round === s.round &&
          (s.ashMountains!.played.counts[activeSeat(s)] ?? 0) >= 1
        ? "Narrow Opening allows each player to play only one card each round."
        : null,
  mustTravel: (s) =>
    live(s, A.tunnels).length > 0 && s.staging.some((u) => !canTravel(s, u)),
  roundEnd: (s) =>
    !mainQuestUnit(s)?.blanked
      ? [fx("ashRoundEnd", { player: firstPlayer(s) })]
      : [],
  encounter,
  shadow,
  effect: ashEffect,
  sharedEffect: (e) =>
    [
      "ashSetup",
      "ashSetupSide",
      "ashShuffle",
      "ashDefeatQuest",
      "ashNextQuest",
      "ashStageEnemies",
      "ashRoundEnd",
      "ashTreachery",
      "ashTreacheryDone",
      "ashRelease",
      "ashDarknessRecover",
    ].includes(e.kind),
};
