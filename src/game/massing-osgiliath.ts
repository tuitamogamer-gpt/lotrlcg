import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import {
  destroy,
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
  questResolutionProgress,
  raiseThreat,
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
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { surgeEffects } from "./surge";
import { choosePlayerResponse } from "./player-ability-triggers";
import {
  MASSING as M,
  MASSING_QUESTS,
  MASSING_RECIPES,
  MASSING_SCOUTS,
  massingPhase,
  massingStageInfo,
  massingTrait,
} from "./massing-osgiliath-support";
export * from "./massing-osgiliath-support";

type Combat = NonNullable<GameState["combat"]>;
const isEnemy = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code === "enemy";
const isLocation = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code === "location";
const isScout = (u: Unit | string) => isEnemy(u) && massingTrait(u, "Scout");
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const crossed = (s: GameState) => !!s.massing?.crossed;
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const exhaustable = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const entries = <T extends { round: number; phase: string }>(
  s: GameState,
  list: T[],
) => list.filter((m) => m.round === s.round && m.phase === massingPhase(s));
const allies = (s: GameState, p: number) =>
  seatView(s, p).hand.filter((h) => card(h.code).type_code === "ally");
/** Shadow cards resolve one at a time; the resolving copy is the last revealed. */
function takeShadow(enemy: Unit, code: string) {
  const i = Math.max(0, (enemy.revealedShadowCount ?? 1) - 1);
  const index = enemy.shadows[i] === code ? i : enemy.shadows.indexOf(code);
  if (index < 0) return false;
  removeShadowCard(enemy, index);
  return true;
}
function handCount(s: GameState, p = activeSeat(s)) {
  const q = s.massing!;
  return q.handCards.round === s.round
    ? (q.handCards.counts[String(p)] ?? 0)
    : 0;
}
function countHandCard(s: GameState) {
  const q = s.massing;
  if (!q || s.stage !== 2) return;
  if (q.handCards.round !== s.round)
    q.handCards = { round: s.round, counts: {} };
  const key = String(activeSeat(s));
  q.handCards.counts[key] = (q.handCards.counts[key] ?? 0) + 1;
}
const handLimited = (s: GameState) =>
  !!s.massing && s.stage === 2 && stageLive(s) && handCount(s) >= 1;

export function setupMassing(s: GameState) {
  const r = MASSING_RECIPES.find((r) => r.mode === "standard")!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const aside = section("sharedSetAside");
  const players = playerOrder(s).length;
  const staged: string[] = [];
  // Three Scouts per player, one of each title; unused Scouts join the deck.
  for (let p = 0; p < players; p++)
    for (const scout of MASSING_SCOUTS) {
      const i = aside.indexOf(scout);
      if (i >= 0) staged.push(...aside.splice(i, 1));
    }
  const witchKing = aside.splice(aside.indexOf(M.witchKing), 1);
  s.encounterDeck = shuffle(s, [...section("sharedEncounterDeck"), ...aside]);
  s.massing = {
    currentQuest: M.first,
    advancing: false,
    crossed: false,
    setAside: witchKing.map((code) => make(s, code)),
    resolving: [],
    phaseThreat: [],
    doomed: [],
    scoutRound: -1,
    overlook: null,
    handCards: { round: 0, counts: {} },
  };
  for (const code of staged) {
    const u = make(s, code);
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
  log(
    s,
    `Beyond Expectations: ${staged.length} Scouts wait in the staging area; The Witch-king is set aside.`,
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.massing;
  if (!q) return false;
  const goal = massingStageInfo(s)?.quest ?? 0;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    goal <= 0 ||
    s.progress < goal
  )
    return true;
  q.advancing = true;
  prepend(s, fx("massingDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
function travelProblem(s: GameState, u: Unit) {
  if (!s.massing || !isLocation(u)) return null;
  const east = massingTrait(u, "East Bank"),
    west = massingTrait(u, "West Bank");
  if (s.stage <= 2 && west)
    return "Players cannot travel to West Bank locations before the Anduin Crossing.";
  if (s.stage === 3 && (east || west))
    return "Anduin Crossing: players cannot travel to East Bank or West Bank locations.";
  if (s.stage === 4 && east)
    return "Race to Minas Tirith: players cannot travel to East Bank locations.";
  return null;
}
function revealed(s: GameState, code: string) {
  const q = s.massing;
  if (!q || !isScout(code) || q.scoutRound === s.round) return;
  q.scoutRound = s.round;
  q.overlook = [...s.staging, ...allActiveLocations(s)].some(
    (l) => l.code === M.overlook && !l.blanked,
  )
    ? code
    : null;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.massing;
  if (!q) return false;
  const first = firstPlayer(s);
  if (code === M.captain) {
    if (fromReveal)
      prepend(
        s,
        fx("massingCaptain", { value: crossed(s) ? 2 : 1, player: first }),
      );
    return true;
  }
  if (code === M.ranger) {
    if (fromReveal) prepend(s, fx("massingRanger", { player: first }));
    return true;
  }
  if (![M.cutOff, M.pursuit, M.massing].includes(code)) return false;
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
    fx("massingTreachery", { code, source: u.id, player: first }),
    fx("massingTreacheryDone", { source: u.id, player: first }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.massing) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId),
    defenders = c.defenderIds?.length
      ? c.defenderIds
      : c.defenderId
        ? [c.defenderId]
        : [];
  if (code === M.wolves)
    prepend(
      s,
      ...defenders.map((id) =>
        fx("damage", { target: id, value: 2, player: p }),
      ),
    );
  else if (code === M.captain) {
    if (!defenders.length && enemy && isScout(enemy)) c.attackBonus += 2;
  } else if (code === M.uruk) c.attackBonus += crossed(s) ? 2 : 1;
  else if (code === M.watchtower) {
    c.defenderId = null;
    c.defenderIds = [];
    log(
      s,
      "Captured Watchtower: this attack is considered undefended.",
      "danger",
    );
  } else if (code === M.morgulduin) {
    if (!crossed(s) && enemy && takeShadow(enemy, code)) {
      const old = allActiveLocations(s);
      s.staging.push(...old);
      s.extraActiveLocations = [];
      s.activeLocation = make(s, code);
      log(s, "Morgulduin becomes the active location.", "danger");
    }
  } else if (code === M.cutOff)
    prepend(
      s,
      fx("massingCutOffShadow", {
        value: defenders.length ? 1 : 2,
        target: c.enemyId,
        player: p,
      }),
    );
  else if (code === M.ranger)
    prepend(
      s,
      ...(enemy
        ? [fx("damage", { target: enemy.id, value: 2, player: p })]
        : []),
      fx("massingRangerShadow", { target: c.enemyId, player: p }),
    );
  else return false;
  return true;
}
function payCommit(s: GameState) {
  if (
    !s.massing ||
    s.stage !== 3 ||
    !stageLive(s) ||
    !s.committedIds.length ||
    s.phase !== "quest"
  )
    return false;
  const p = activeSeat(s);
  const cards = own(s, p).filter(
    (u) =>
      card(u.code).type_code === "hero" || (u.code === M.ranger && !u.blanked),
  );
  if (!cards.length) return false;
  choose(
    s,
    "Anduin Crossing · Discard a hero or Ranger of Ithilien to commit",
    cards.map((u) =>
      option(u, [
        fx("massingCommitCost", { target: u.id, player: p }),
        fx("paidCommit", { player: p }),
      ]),
    ),
    "The bravest turn back so the rest may cross. The chosen card is discarded before your characters commit.",
  );
  return true;
}
export function massingEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("massing")) return false;
  const q = s.massing;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "massingDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx("massingNextStage", { player: firstPlayer(s) }),
      );
      break;
    }
    case "massingNextStage": {
      q.advancing = false;
      if (s.stage >= MASSING_QUESTS.length) {
        win(s);
        s.reason =
          "The heroes outrun the horde across the Pelennor Fields and reach the gates of Minas Tirith.";
        break;
      }
      s.stage++;
      q.currentQuest = MASSING_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      if (s.stage === 4) {
        s.stageRevealing = true;
        prepend(s, fx("massingStageFour", { player: firstPlayer(s) }));
      }
      break;
    }
    case "massingStageFour": {
      const witchKing = q.setAside.splice(0);
      for (const w of witchKing) {
        s.staging.push(w);
        enemyAddedToStaging(s, w);
      }
      q.crossed = true;
      s.stageRevealing = false;
      log(
        s,
        "Race to Minas Tirith: the players have crossed the Anduin, and The Witch-king joins the pursuit.",
        "danger",
      );
      break;
    }
    case "massingTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!held) break;
      if (held.code === M.cutOff)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("massingCutOff", { player })),
        );
      else if (held.code === M.pursuit) {
        const scouts = [...s.staging, ...allEngaged(s)].filter(isScout).length;
        if (scouts)
          q.phaseThreat.push({
            round: s.round,
            phase: massingPhase(s),
            value: scouts,
          });
        else prepend(s, ...surgeEffects(M.pursuit));
      } else if (held.code === M.massing)
        q.doomed.push({
          round: s.round,
          phase: massingPhase(s),
          value: crossed(s) ? 3 : 1,
        });
      break;
    }
    case "massingTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      break;
    }
    case "massingCutOff":
      forOwner(s, p, () => {
        for (const h of allies(s, p))
          discardHandCard(s, h.id, { encounterEffect: true });
      });
      break;
    case "massingCutOffShadow": {
      const need = e.value ?? 1;
      const cards = allies(s, p);
      if (cards.length < need) {
        prepend(s, fx("massingAttackBonus", { value: 3, player: p }));
        break;
      }
      choose(s, "Cut Off · Discard allies or strengthen the attack", [
        {
          id: "discard",
          label: `Discard ${need} ${need === 1 ? "ally" : "allies"} from your hand`,
          effects: [fx("massingCutOffDiscard", { value: need, player: p })],
        },
        {
          id: "attack",
          label: "Attacking enemy gets +3 attack",
          effects: [fx("massingAttackBonus", { value: 3, player: p })],
        },
      ]);
      break;
    }
    case "massingCutOffDiscard": {
      const remaining = e.value ?? 0;
      const cards = allies(s, p);
      if (remaining > 0 && cards.length)
        choose(
          s,
          `Cut Off · Discard an ally (${remaining} remaining)`,
          cards.map((h) =>
            option(h, [
              fx("massingDiscardHand", { target: h.id, player: p }),
              fx("massingCutOffDiscard", { value: remaining - 1, player: p }),
            ]),
          ),
        );
      break;
    }
    case "massingDiscardHand":
      forOwner(s, p, () => {
        if (s.hand.some((h) => h.id === e.target))
          discardHandCard(s, e.target!, { encounterEffect: true });
      });
      break;
    case "massingAttackBonus":
      if (s.combat) s.combat.attackBonus += e.value ?? 0;
      break;
    case "massingCaptain": {
      let moved = 0;
      for (
        let i = s.encounterDiscard.length - 1;
        i >= 0 && moved < (e.value ?? 1);
        i--
      ) {
        const code = s.encounterDiscard[i];
        if (!isScout(code)) continue;
        s.encounterDiscard.splice(i, 1);
        const scout = make(s, code);
        s.staging.push(scout);
        enemyAddedToStaging(s, scout);
        moved++;
      }
      if (moved)
        log(
          s,
          `Wainrider Captain returns ${moved} Scout${moved === 1 ? "" : "s"} to the staging area.`,
          "danger",
        );
      break;
    }
    case "massingRanger": {
      const ranger = [...s.staging].reverse().find((x) => x.code === M.ranger);
      if (!ranger) break;
      s.staging = s.staging.filter((x) => x.id !== ranger.id);
      ranger.owner = p;
      ranger.controller = p;
      ranger.exhausted = true;
      const questing = ["quest", "staging"].includes(s.phase);
      ranger.committed = questing;
      forOwner(s, p, () => {
        s.allies.push(ranger);
        if (questing && !s.committedIds.includes(ranger.id))
          s.committedIds.push(ranger.id);
      });
      log(
        s,
        "Ranger of Ithilien joins the first player, exhausted and committed.",
        "good",
      );
      if (
        questing &&
        allActiveLocations(s).some((l) => l.code === M.morgulduin && !l.blanked)
      )
        prepend(s, fx("damage", { target: ranger.id, value: 1, player: p }));
      prepend(s, ...surgeEffects(M.ranger));
      break;
    }
    case "massingRangerShadow": {
      const enemy = get(s, e.target);
      const ready = own(s, p).filter(exhaustable);
      if (!enemy || !ready.length || !enemy.shadows.includes(M.ranger)) break;
      choosePlayerResponse(
        s,
        enemy.id,
        M.ranger,
        "Ranger of Ithilien · Take control of the Ranger?",
        [
          ...ready.map((c) =>
            option(
              c,
              [
                fx("massingRangerTake", {
                  target: enemy.id,
                  source: c.id,
                  player: p,
                }),
              ],
              `Exhaust ${name(c)} to take control of Ranger of Ithilien`,
            ),
          ),
          skip,
        ],
        undefined,
        p,
      );
      break;
    }
    case "massingRangerTake": {
      const enemy = get(s, e.target),
        payer = get(s, e.source);
      if (!enemy || !payer || !exhaustCharacter(s, payer)) break;
      if (!takeShadow(enemy, M.ranger)) break;
      const ranger = make(s, M.ranger);
      ranger.owner = p;
      ranger.controller = p;
      forOwner(s, p, () => s.allies.push(ranger));
      log(
        s,
        "Ranger of Ithilien leaves the shadows and joins the fellowship.",
        "good",
      );
      break;
    }
    case "massingCommitCost": {
      if (!u || !own(s, p).some((c) => c.id === u.id)) break;
      forOwner(s, p, () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(
        s,
        `${name(u)} turns back so the others may cross the Anduin.`,
        "danger",
      );
      discardCharacter(s, u);
      break;
    }
    case "massingSnaga": {
      const scouts = [...s.staging, ...allEngaged(s)].filter(
        (x) => x.code === M.snaga && !x.blanked,
      );
      if (!scouts.length) break;
      const threats = playerOrder(s).map((player) => ({
        player,
        threat: seatView(s, player).threat,
      }));
      const low = Math.min(...threats.map((t) => t.threat));
      const tied = threats.filter((t) => t.threat === low).map((t) => t.player);
      if (tied.length > 1 && e.value === undefined)
        choose(s, "Snaga Scouts · Choose the player with the lowest threat", [
          ...tied.map((player) => ({
            id: `player-${player}`,
            label: `Player ${player + 1} (${low} threat)`,
            effects: [
              fx("massingSnaga", { value: player, player: firstPlayer(s) }),
            ],
          })),
        ]);
      else {
        const target = e.value ?? tied[0];
        for (const scout of scouts)
          if (!seatView(s, target).engaged.some((x) => x.id === scout.id))
            forOwner(s, target, () => engage(s, scout));
      }
      break;
    }
    case "massingWitchKing": {
      const wk = get(s, e.target);
      if (!wk || !allEngaged(s).some((x) => x.id === wk.id)) break;
      choose(
        s,
        "The Witch-king · Raise your threat by 3 or he returns to the staging area",
        [
          {
            id: "threat",
            label: "Raise your threat by 3",
            effects: [fx("massingThreat", { value: 3, player: p })],
          },
          {
            id: "return",
            label: "The Witch-king returns to the staging area",
            effects: [fx("massingReturn", { target: wk.id, player: p })],
          },
        ],
      );
      break;
    }
    case "massingReturn": {
      const wk = get(s, e.target);
      if (!wk || !allEngaged(s).some((x) => x.id === wk.id)) break;
      forOwner(s, ownerOf(s, wk), () => {
        s.engaged = s.engaged.filter((x) => x.id !== wk.id);
      });
      s.encounterDiscard.push(...wk.shadows);
      wk.shadows = [];
      delete wk.faceupShadows;
      wk.revealedShadowCount = 0;
      s.staging.push(wk);
      enemyAddedToStaging(s, wk);
      log(s, "The Witch-king returns to the staging area.", "danger");
      break;
    }
    case "massingWolves": {
      const wolves = get(s, e.target);
      if (
        !wolves ||
        ![...s.staging, ...allEngaged(s)].some((x) => x.id === wolves.id)
      )
        break;
      s.massingShuffle = wolves.id;
      destroy(s, wolves, false);
      delete s.massingShuffle;
      log(
        s,
        "Wolves from Mordor are shuffled back into the encounter deck.",
        "danger",
      );
      break;
    }
    case "massingThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "massingPelennor": {
      const fields = s.staging.filter(
        (l) => l.code === M.pelennor && !l.blanked,
      );
      if (!fields.length || allActiveLocations(s).length) break;
      choose(
        s,
        "Pelennor Fields · Travel there or raise each player's threat",
        [
          ...fields.map((l) =>
            option(
              l,
              [fx("travelEnter", { target: l.id, player: firstPlayer(s) })],
              `Travel to ${name(l)}`,
            ),
          ),
          {
            id: "threat",
            label: `Raise each player's threat by ${3 * fields.length}`,
            effects: playerOrder(s).map((player) =>
              fx("massingThreat", { value: 3 * fields.length, player }),
            ),
          },
        ],
        "When faced with the option to travel after crossing the Anduin, the players must travel to Pelennor Fields or raise threat.",
      );
      break;
    }
    case "massingRoundEnd":
      q.phaseThreat = q.phaseThreat.filter((m) => m.round > s.round);
      q.doomed = q.doomed.filter((m) => m.round > s.round);
      break;
    default:
      return false;
  }
  return true;
}
export const MASSING_HOOKS: Batch4ScenarioHooks = {
  setup: setupMassing,
  advance,
  stageInfo: massingStageInfo,
  travelProblem,
  travelBegin: (s) => {
    if (
      crossed(s) &&
      !allActiveLocations(s).length &&
      s.staging.some((l) => l.code === M.pelennor && !l.blanked)
    )
      prepend(s, fx("massingPelennor", { player: firstPlayer(s) }));
  },
  stats: (s, u) => {
    const type = card(u.code).type_code;
    return {
      attack: u.code === M.uruk && !u.blanked && crossed(s) ? 3 : 0,
      will:
        ["hero", "ally", "objective-ally"].includes(type) &&
        live(s, M.witchKing).length
          ? -live(s, M.witchKing).length
          : 0,
    };
  },
  threatBonus: (s, u) =>
    u.blanked
      ? 0
      : u.code === M.watchtower && crossed(s)
        ? 3
        : u.code === M.ruins && !crossed(s)
          ? 3
          : 0,
  stagingThreat: (s) =>
    s.massing
      ? entries(s, s.massing.phaseThreat).reduce((n, m) => n + m.value, 0)
      : 0,
  cannotAttach: (_s, u, code) =>
    u.code === M.witchKing &&
    !u.blanked &&
    card(code).sphere_code !== "encounter",
  revealed: (s, code) => revealed(s, code),
  revealedSurge: (s, code) => {
    const q = s.massing;
    if (!q || q.overlook !== code) return false;
    q.overlook = null;
    return true;
  },
  revealedDoomed: (s, code) => {
    const q = s.massing;
    if (!q) return 0;
    return (
      (q.overlook === code ? 2 : 0) +
      entries(s, q.doomed).reduce((n, m) => n + m.value, 0)
    );
  },
  encounterBegin: (s) => {
    if (
      s.massing &&
      [...s.staging, ...allEngaged(s)].some((u) => u.code === M.snaga)
    )
      prepend(s, fx("massingSnaga", { player: firstPlayer(s) }));
  },
  committed: (s) => {
    if (
      !allActiveLocations(s).some((l) => l.code === M.morgulduin && !l.blanked)
    )
      return;
    prepend(
      s,
      ...allCharacters(s)
        .filter((u) => u.committed)
        .map((u) =>
          fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
        ),
    );
  },
  payCommit,
  playProblem: (s) =>
    handLimited(s)
      ? "Through the Ruins: each player can play or put into play only 1 card from his hand each round."
      : null,
  playerCardPlayed: (s, _u, fromHand) => {
    if (fromHand !== false) countHandCard(s);
  },
  allyEntered: (s, _u, played, fromHand) => {
    if (fromHand && !played) countHandCard(s);
    return false;
  },
  handEntryBlocked: (s) => handLimited(s),
  locationProgressBlocked: (s, u) =>
    !!s.massing &&
    s.stage === 3 &&
    stageLive(s) &&
    allActiveLocations(s).some((l) => l.id === u.id) &&
    !questResolutionProgress(),
  progress: (s, amount, quest) =>
    s.massing &&
    s.stage === 3 &&
    stageLive(s) &&
    quest.id === mainQuestUnit(s)?.id &&
    !questResolutionProgress()
      ? 0
      : amount,
  enemyAttackStarted: (s, u) => {
    if (!s.combat) return;
    s.combat.massingEnemy = u.blanked ? undefined : u.code;
    s.combat.massingKilled = false;
  },
  characterDestroyed: (s, _u, ctx) => {
    const c = s.combat;
    if (c && ctx.combatDamage && ctx.enemyId === c.enemyId)
      c.massingKilled = true;
  },
  damageDealt: (s, u, amount, ctx) => {
    if (!s.massing || !ctx.combatDamage || !ctx.enemyId || amount <= 0) return;
    const enemy = get(s, ctx.enemyId);
    const enemyCode = enemy?.code ?? s.combat?.massingEnemy;
    if (enemyCode !== M.wainriders || enemy?.blanked) return;
    if (!["hero", "ally", "objective-ally"].includes(card(u.code).type_code))
      return;
    prepend(
      s,
      fx("massingThreat", {
        value: amount,
        player: s.combat?.attackPlayer ?? ownerOf(s, u),
      }),
    );
  },
  attackFinished: (s, c: Combat, skipped = false) => {
    if (!s.massing || skipped || !c.attackResolved) return [];
    const p = c.attackPlayer ?? activeSeat(s),
      effects: Effect[] = [];
    if (c.massingEnemy === M.witchKing)
      effects.push(fx("massingWitchKing", { target: c.enemyId, player: p }));
    if (c.massingEnemy === M.wolves && c.massingKilled)
      effects.push(
        fx("massingWolves", { target: c.enemyId, player: firstPlayer(s) }),
      );
    return effects;
  },
  enemyDestination: (s, u) => {
    if (s.massingShuffle !== u.id) return false;
    s.encounterDeck.push(u.code);
    shuffle(s, s.encounterDeck);
    return true;
  },
  roundEnd: (s) =>
    s.massing ? [fx("massingRoundEnd", { player: firstPlayer(s) })] : [],
  encounter,
  shadow,
  effect: massingEffect,
  sharedEffect: (e) =>
    [
      "massingDefeatQuest",
      "massingNextStage",
      "massingStageFour",
      "massingTreachery",
      "massingTreacheryDone",
      "massingCaptain",
      "massingRanger",
      "massingSnaga",
      "massingWolves",
      "massingPelennor",
      "massingRoundEnd",
    ].includes(e.kind),
};
