import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  enterEnemyEngaged,
  progressLocation,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { activePlayerAbilityCode } from "./player-ability-triggers";
import { isAlly, unitType } from "./card-types";
import { isEnemy } from "./ships";
import { surgeEffects } from "./surge";
import {
  WRATH_RUIN as W,
  WRATH_RUIN_ENCOUNTERS,
  WRATH_RUIN_RECIPES,
  wrathRuinControlled as controlled,
  wrathRuinPhase as phase,
  wrathRuinStageInfo,
  wrathRuinStaged as staged,
} from "./wrath-ruin-support";
import {
  SHADOW_EAST_SHARED_HOOKS,
  shadowEastEffect,
  shadowEastEncounter,
  shadowEastSharedEffect,
  shadowEastStats,
  shadowEastShadow,
  shadowEastTrait,
} from "./shadow-east-encounters";
export * from "./wrath-ruin-support";
type Combat = NonNullable<GameState["combat"]>;
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemy);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const host = (s: GameState, id?: string) =>
  get(s, id) ?? s.wrathRuin?.pendingExplored.find((u) => u.id === id);
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const encounterProgress = new WeakSet<GameState>();
function ordered(s: GameState, effects: Effect[], title: string) {
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", { effects, text: title, player: firstPlayer(s) }),
    );
  else prepend(s, ...effects);
}
function add(s: GameState, code: string, player?: number) {
  const u = make(s, code);
  if (isEnemy(u) && player !== undefined) enterEnemyEngaged(s, u, player);
  else {
    s.staging.push(u);
    if (isEnemy(u)) enemyAddedToStaging(s, u);
  }
  return u;
}
function topEnemy(s: GameState) {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (card(s.encounterDiscard[i]).type_code === "enemy") return i;
  return -1;
}
function find(s: GameState, type: string) {
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    if (card(c).type_code === type) return c;
    s.encounterDiscard.push(c);
  }
}
function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function takeControl(s: GameState, u: Unit, player: number) {
  const q = s.wrathRuin!;
  const previous = q.controlled.find((x) => x.id === u.id)?.owner;
  q.pendingExplored = q.pendingExplored.filter((x) => x.id !== u.id);
  q.controlled = q.controlled.filter((x) => x.id !== u.id);
  s.staging = s.staging.filter((x) => x.id !== u.id);
  removeActiveLocation(s, u.id);
  u.progress = 0;
  u.owner = player;
  q.controlled.push(u);
  log(s, `Player ${player + 1} takes control of ${name(u)}.`, "good");
  if (previous !== undefined && previous !== player) lostControl(s, previous);
  if (!u.blanked && u.code === W.fortification)
    prepend(
      s,
      fx("wrathFortification", { target: u.id, player, code: u.code }),
    );
  if (!u.blanked && u.code === W.tower)
    prepend(s, fx("wrathTower", { target: u.id, player, code: u.code }));
}
function lostControl(s: GameState, player: number) {
  const effects = controlled(s, player)
    .filter((u) => u.code === W.house && !u.blanked)
    .map((u) =>
      fx("wrathReturn", {
        target: u.id,
        player,
        code: u.code,
        text: `Return ${name(u)} to staging`,
      }),
    );
  ordered(
    s,
    effects,
    "Lost control of a location · Choose the next Forced effect",
  );
}
export function wrathRuinReturn(s: GameState, u: Unit) {
  const q = s.wrathRuin;
  if (!q || !q.controlled.some((x) => x.id === u.id)) return;
  const player = u.owner ?? 0;
  q.controlled = q.controlled.filter((x) => x.id !== u.id);
  u.progress = 0;
  delete u.owner;
  s.staging.push(u);
  log(s, `${name(u)} returns to the staging area.`, "danger");
  lostControl(s, player);
}
export function setupWrathRuin(s: GameState) {
  const r = WRATH_RUIN_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((r) =>
      ["sharedEncounterDeck", "sharedStagingArea"].includes(r.section),
    )
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  for (const code of [W.ulchor, W.gate]) {
    const i = s.encounterDeck.indexOf(code);
    if (i >= 0) s.encounterDeck.splice(i, 1);
    s.staging.push(make(s, code));
  }
  s.wrathRuin = {
    initialized: false,
    currentQuest: W.first,
    controlled: [],
    pendingExplored: [],
    resolving: [],
    looked: [],
    storedCards: [],
    setupChosen: [],
    enteredEnemies: [],
    threatRaised: {},
    phaseThreat: [],
  };
  shuffle(s, s.encounterDeck);
}
export function wrathRuinOpeningHandsKept(s: GameState) {
  if (!s.wrathRuin || s.wrathRuin.initialized) return false;
  prepend(
    s,
    fx("wrathSetup", { value: 0, player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function wrathRuinStats(s: GameState, u: Unit) {
  const shared = shadowEastStats(s, u),
    n = u.code === W.easterling && !u.blanked ? Math.min(3, u.resources) : 0;
  return { attack: shared.attack + n, defense: shared.defense + n };
}
export function wrathRuinThreatBonus(s: GameState, u: Unit) {
  if (u.blanked) return 0;
  if (u.code === W.gate)
    return 1 + controlled(s).length - (card(u.code).threat ?? 0);
  if (u.code === W.forum) return u.resources;
  return 0;
}
export function wrathRuinCombatBegin(s: GameState) {
  const n =
    enemies(s).reduce(
      (n, u) =>
        n +
        (!u.blanked && [W.raider, W.skirmisher].includes(u.code) ? 1 : 0) +
        2 * u.attachments.filter((a) => a.code === W.bow && !a.blanked).length,
      0,
    ) +
    3 *
      allActiveLocations(s).filter(
        (u) => u.code === W.fortification && !u.blanked,
      ).length;
  if (n) prepend(s, fx("heirsArchery", { value: n, player: firstPlayer(s) }));
}
export function wrathRuinThreatRaised(
  s: GameState,
  player: number,
  amount: number,
) {
  if (!s.wrathRuin || amount <= 0) return;
  s.wrathRuin.threatRaised[player] = s.round;
  prepend(
    s,
    ...seatView(s, player)
      .engaged.filter((u) => u.code === W.easterling && !u.blanked)
      .map((u) => fx("wrathEasterling", { target: u.id, player })),
  );
}
export function wrathRuinBeforeDestroy(
  s: GameState,
  u: Unit,
  destruction: boolean,
  _context: DamageContext,
) {
  if (!destruction || !isEnemy(u)) return false;
  const a = u.attachments.find((a) => a.code === W.fury && !a.blanked);
  if (!a) return false;
  u.damage = 0;
  discardAttachment(s, u, a);
  log(
    s,
    `${name(u)} survives: Fury heals all damage and is discarded.`,
    "danger",
  );
  return true;
}
export function wrathRuinCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (isEnemy(u)) {
    prepend(
      s,
      ...live(s, W.square).map((l) =>
        fx("wrathSquareProgress", {
          target: l.id,
          player: firstPlayer(s),
          code: l.code,
        }),
      ),
    );
    return;
  }
  if (!["hero", "ally", "objective-ally"].includes(unitType(u))) return;
  const player = ownerOf(s, u);
  prepend(
    s,
    ...controlled(s, player)
      .filter((l) => l.code === W.square && !l.blanked)
      .map((l) => fx("wrathReturn", { target: l.id, player, code: l.code })),
  );
  if (s.combat && context.combatDamage && context.enemyId === s.combat.enemyId)
    (s.combat.wrathKilledPlayers ??= []).push(player);
}
export function wrathRuinAttackFinished(
  s: GameState,
  c: Combat,
  skipped = false,
) {
  if (skipped || !c.attackResolved) return [];
  const u = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  if (u?.code === W.skirmisher && !u.blanked)
    for (const owner of c.wrathKilledPlayers ?? [])
      effects.push(
        fx("wrathReturnHighest", { player: owner, code: W.skirmisher }),
      );
  if (c.wrathKilledPlayers?.length)
    for (let i = 0; i < (c.wrathReturnHighest ?? 0); i++)
      effects.push(fx("wrathReturnHighest", { player, code: W.siege }));
  for (let i = 0; i < (c.wrathExtraAttacks ?? 0); i++)
    effects.push(fx("immediateAttack", { target: c.enemyId, player }));
  return effects;
}
export function wrathRuinEngaged(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === W.champion)
    prepend(s, fx("wrathChampion", { target: u.id, player: ownerOf(s, u) }));
  if (u.code === W.backstabber)
    prepend(s, fx("wrathBackstabber", { target: u.id, player: ownerOf(s, u) }));
}
export function wrathRuinLocationDestination(s: GameState, u: Unit) {
  if (!s.wrathRuin || !stageLive(s)) return false;
  if (!s.wrathRuin.controlled.some((l) => l.id === u.id))
    s.wrathRuin.pendingExplored.push(u);
  return true;
}
export function wrathRuinExplorationWhen(
  s: GameState,
  u: Unit,
  wasActive: boolean,
  playerWhenEffects: Effect[] = [],
) {
  const q = s.wrathRuin!;
  const effects: Effect[] = [...playerWhenEffects];
  if (
    q.pendingExplored.some((l) => l.id === u.id) ||
    q.controlled.some((l) => l.id === u.id)
  )
    effects.push(
      fx("wrathCapture", {
        target: u.id,
        player: firstPlayer(s),
        code: q.currentQuest,
        text: `Take control of ${name(u)}`,
      }),
    );
  if (
    u.code === W.tavern &&
    !u.blanked &&
    q.storedCards.some((g) => g.locationId === u.id)
  )
    effects.push(
      fx("wrathTavernReveal", {
        target: u.id,
        player: firstPlayer(s),
        code: u.code,
        text: "Reveal the cards beneath Seedy Tavern",
      }),
    );
  prepend(
    s,
    fx("wrathExploredAfter", {
      target: u.id,
      flag: wasActive,
      player: firstPlayer(s),
    }),
  );
  ordered(s, effects, "Location explored · Choose the next When effect");
  return true;
}
export function wrathRuinTravelProblem(s: GameState, u: Unit) {
  if (u.blanked || u.code !== W.gate) return null;
  if (s.stage !== 2 || s.stageRevealing || s.progress < 12)
    return "Gate of Dorwinion requires at least 12 progress on stage 2B.";
  if (stageLive(s) && controlled(s).length <= staged(s).length)
    return "The players must control more locations than remain in staging.";
  return null;
}
export function wrathRuinTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (u.code === W.gate)
    return playerOrder(s).map((player) =>
      fx("immediateAttack", {
        target: enemies(s).find((x) => x.code === W.ulchor)?.id,
        player,
      }),
    );
  if (u.code === W.forum)
    return playerOrder(s).map((player) =>
      fx("wrathThreat", { value: u.resources, player }),
    );
  if (u.code === W.tavern)
    return [fx("wrathTavern", { target: u.id, player: firstPlayer(s) })];
  return undefined;
}
export function wrathRuinAbilityProblem(s: GameState, u: Unit) {
  if (u.code !== W.house) return null;
  if (u.blanked || !s.staging.some((l) => l.id === u.id))
    return "Use Ransacked House while it is in the staging area.";
  if (s.phase !== "encounter") return "Ransacked House is an Encounter Action.";
  if (topEnemy(s) < 0)
    return "There is no enemy in the encounter discard pile.";
  return null;
}
export function wrathRuinAbility(s: GameState, u: Unit) {
  if (u.code !== W.house) return false;
  const player = activeSeat(s);
  prepend(s, fx("wrathHouse", { target: u.id, player }));
  return true;
}
export function wrathRuinShadow(s: GameState, code: string) {
  if (shadowEastShadow(s, code)) return true;
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === W.champion) {
    if (c.defenderId)
      prepend(s, fx("damage", { target: c.defenderId, value: 1, player }));
  } else if (code === W.caught)
    c.wrathExtraAttacks = (c.wrathExtraAttacks ?? 0) + 1;
  else if (code === W.fighting)
    prepend(
      s,
      fx("wrathAssignDamage", {
        value: 1 + controlled(s, player).length,
        player,
      }),
    );
  else if (code === W.siege) {
    c.attackBonus++;
    c.wrathReturnHighest = (c.wrathReturnHighest ?? 0) + 1;
  } else if (code === W.revenge) c.attackBonus += controlled(s, player).length;
  else if (code === W.backstabber)
    prepend(
      s,
      fx("wrathThreat", { value: seatView(s, player).engaged.length, player }),
    );
  else if (code === W.darkness)
    c.attackBonus += s.wrathRuin!.threatRaised[player] === s.round ? 2 : 1;
  else return false;
  return true;
}
export function wrathRuinEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (shadowEastEncounter(s, code, replay, fromReveal)) return true;
  if (!WRATH_RUIN_ENCOUNTERS.some((c) => c.code === code)) return false;
  if (card(code).type_code !== "treachery") return true;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i < 0) return true;
    s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  s.wrathRuin!.resolving.push(u);
  prepend(
    s,
    fx("wrathTreachery", { source: u.id, code, player: firstPlayer(s) }),
    fx("wrathTreacheryDone", { source: u.id, player: firstPlayer(s) }),
  );
  return true;
}
export function wrathRuinEffect(s: GameState, e: Effect) {
  if (shadowEastEffect(s, e)) return true;
  if (
    !e.kind.startsWith("wrath") ||
    e.kind.startsWith("wrathPlayer") ||
    !s.wrathRuin
  )
    return false;
  const q = s.wrathRuin,
    player = e.player ?? activeSeat(s),
    u = host(s, e.target);
  switch (e.kind) {
    case "wrathSetup": {
      const index = e.value ?? 0,
        ps = playerOrder(s);
      if (index >= ps.length) {
        const i = s.encounterDeck.indexOf(W.fortification);
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          s.activeLocation = make(s, W.fortification);
        }
        shuffle(s, s.encounterDeck);
        q.initialized = true;
        break;
      }
      const codes = [...new Set(s.encounterDeck)].filter(
        (c) =>
          card(c).type_code === "location" &&
          !q.setupChosen.includes(c) &&
          (c !== W.fortification ||
            s.encounterDeck.filter((x) => x === c).length > 1),
      );
      choose(
        s,
        "Inside the Walls · Choose a different starting location",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("wrathSetupAdd", { code, value: index, player: ps[index] }),
          ],
        })),
      );
      break;
    }
    case "wrathSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        q.setupChosen.push(e.code!);
        add(s, e.code!);
      }
      const index = (e.value ?? 0) + 1;
      prepend(
        s,
        fx("wrathSetup", {
          value: index,
          player: playerOrder(s)[index] ?? firstPlayer(s),
        }),
      );
      break;
    }
    case "wrathEndRound": {
      if (!stageLive(s)) break;
      if (s.stage === 2) {
        if (controlled(s).some((u) => u.code === W.gate)) {
          win(s);
          s.reason =
            "The fellowship holds the Gate of Dorwinion and drives Ulchor’s army from the city.";
        }
        break;
      }
      if (
        s.progress < (wrathRuinStageInfo(s)?.quest ?? Infinity) ||
        controlled(s).length <= staged(s).length
      )
        break;
      const before = s.queue.length;
      if (questDefeated(s, q.currentQuest))
        s.queue.splice(
          s.queue.length - before,
          0,
          fx("wrathStageTwo", { player: firstPlayer(s) }),
        );
      else prepend(s, fx("wrathStageTwo", { player: firstPlayer(s) }));
      break;
    }
    case "wrathStageTwo":
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = W.second;
      s.stageRevealing = true;
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("wrathReturnHighest", { player })),
        fx("wrathShuffle", { player: firstPlayer(s) }),
        ...playerOrder(s).map((player) => fx("wrathFindEnemy", { player })),
        fx("wrathFinishStage", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "wrathFinishStage":
      s.stageRevealing = false;
      break;
    case "wrathShuffle":
      shuffleDiscard(s);
      break;
    case "wrathReturnHighest": {
      const ls = controlled(s, player),
        highest = Math.max(...ls.map((l) => threatOf(s, l))),
        targets = ls.filter((l) => threatOf(s, l) === highest);
      if (targets.length === 1) wrathRuinReturn(s, targets[0]);
      else if (targets.length)
        choose(
          s,
          "Return your highest-threat location",
          targets.map((l) =>
            option(l, [fx("wrathReturn", { target: l.id, player })]),
          ),
        );
      break;
    }
    case "wrathReturn":
      if (u) wrathRuinReturn(s, u);
      break;
    case "wrathFindEnemy": {
      const code = find(s, "enemy");
      if (code) add(s, code, player);
      break;
    }
    case "wrathCapture":
      if (u) takeControl(s, u, firstPlayer(s));
      break;
    case "wrathFortification": {
      const i = topEnemy(s);
      if (i >= 0) add(s, s.encounterDiscard.splice(i, 1)[0]);
      break;
    }
    case "wrathTower":
      shuffleDiscard(s);
      prepend(s, fx("wrathFindEnemy", { player }));
      break;
    case "wrathHouse": {
      if (!u || !s.staging.some((l) => l.id === u.id)) break;
      const i = topEnemy(s);
      if (i < 0) break;
      // Pay the engagement cost and finish its mandatory effects before the
      // separate control benefit, preserving the suspended action in saves.
      const before = s.queue.length;
      add(s, s.encounterDiscard.splice(i, 1)[0], player);
      s.queue.splice(
        s.queue.length - before,
        0,
        fx("wrathHouseTake", { target: u.id, player }),
      );
      break;
    }
    case "wrathHouseTake":
      if (u && s.staging.some((l) => l.id === u.id)) takeControl(s, u, player);
      break;
    case "wrathExploredAfter": {
      const effects = live(s, W.forum).map((l) =>
        fx("wrathForum", {
          target: l.id,
          code: l.code,
          player: firstPlayer(s),
          text: `Place a resource on ${name(l)}`,
        }),
      );
      if (e.flag)
        for (const enemy of live(s, W.ulchor))
          effects.push(
            fx("wrathUlchor", {
              target: enemy.id,
              code: enemy.code,
              player: firstPlayer(s),
              text: "Resolve Thane Ulchor",
            }),
          );
      ordered(s, effects, "Location explored · Choose the next After effect");
      break;
    }
    case "wrathForum":
      if (u && !u.blanked && s.staging.some((l) => l.id === u.id))
        u.resources++;
      break;
    case "wrathUlchor":
      if (u && !u.blanked)
        choose(s, "Thane Ulchor · Choose", [
          {
            id: "location",
            label: "Discard to a location and add it to staging",
            effects: [fx("wrathFindLocation", { player })],
          },
          {
            id: "attack",
            label: "Thane Ulchor attacks the first player",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
        ]);
      break;
    case "wrathFindLocation": {
      const code = find(s, "location");
      if (code) add(s, code);
      break;
    }
    case "wrathSquareProgress":
      if (u && !u.blanked && s.staging.some((l) => l.id === u.id)) {
        encounterProgress.add(s);
        try {
          progressLocation(s, u, 1);
        } finally {
          encounterProgress.delete(s);
        }
      }
      break;
    case "wrathTavern":
      if (u) {
        q.looked = s.encounterDeck.splice(0, 5).map((c) => make(s, c));
        if (q.looked.length)
          choose(
            s,
            "Seedy Tavern · Choose a facedown card",
            q.looked.map((c, i) => ({
              ...option(c, [
                fx("wrathStore", { target: u.id, source: c.id, player }),
              ]),
              label: `Choose looked card ${i + 1}`,
            })),
            "Only the choosing player sees these cards.",
          );
      }
      break;
    case "wrathStore": {
      const i = q.looked.findIndex((c) => c.id === e.source);
      if (i >= 0 && u) {
        const c = q.looked.splice(i, 1)[0];
        let g = q.storedCards.find((g) => g.locationId === u.id);
        if (!g) q.storedCards.push((g = { locationId: u.id, cards: [] }));
        g.cards.push(c);
      }
      s.encounterDeck.push(...q.looked.splice(0).map((c) => c.code));
      shuffle(s, s.encounterDeck);
      break;
    }
    case "wrathTavernReveal": {
      const groups = q.storedCards.filter((g) => g.locationId === e.target);
      q.storedCards = q.storedCards.filter((g) => g.locationId !== e.target);
      const cards = groups.flatMap((g) => g.cards);
      q.resolving.push(...cards);
      prepend(
        s,
        ...cards.map((c) =>
          fx("wrathRevealStored", { source: c.id, player: firstPlayer(s) }),
        ),
      );
      break;
    }
    case "wrathRevealStored": {
      const i = q.resolving.findIndex((c) => c.id === e.source);
      if (i < 0) break;
      s.encounterDeck.unshift(q.resolving.splice(i, 1)[0].code);
      prepend(s, fx("reveal", { player: firstPlayer(s) }));
      break;
    }
    case "wrathChampion":
      if (u && !u.blanked)
        choose(s, "Champion of Rhûn · Return a location or suffer an attack", [
          ...controlled(s, player).map((l) => ({
            ...option(l, [fx("wrathReturn", { target: l.id, player })]),
            label: `Return ${name(l)} to staging`,
          })),
          {
            id: "attack",
            label: "Champion of Rhûn attacks",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
        ]);
      break;
    case "wrathBackstabber":
      choose(s, "Rhûn Backstabber · Raise threat or discard an ally", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("wrathThreat", { value: 2, player })],
        },
        ...seatView(s, player)
          .allies.filter((a) => isAlly(a) && Number(card(a.code).cost) >= 2)
          .map((a) => ({
            ...option(a, [fx("wrathDiscardAlly", { target: a.id, player })]),
            label: `Discard ${name(a)}`,
          })),
      ]);
      break;
    case "wrathDiscardAlly":
      if (u && isAlly(u)) discardCharacter(s, u);
      break;
    case "wrathEasterling":
      if (u && !u.blanked) u.resources++;
      break;
    case "wrathThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "wrathAssignDamage": {
      const n = e.value ?? 0;
      if (n <= 0) break;
      const targets = allCharacters(s).filter(
        (u) => ownerOf(s, u) === player && u.damage < stats(s, u).health,
      );
      if (targets.length)
        choose(
          s,
          `Street Fighting · Assign ${n} damage`,
          targets.map((u) =>
            option(u, [
              fx("damage", { target: u.id, value: 1, player }),
              fx("wrathAssignDamage", { value: n - 1, player }),
            ]),
          ),
        );
      break;
    }
    case "wrathTreachery": {
      const held = q.resolving.find((c) => c.id === e.source);
      if (!held) break;
      if (e.code === W.fury) {
        const eligible = enemies(s).filter(
            (u) =>
              shadowEastTrait(u, "Easterling") &&
              !u.attachments.some((a) => a.code === W.fury),
          ),
          lowest = Math.min(...eligible.map((u) => engagementCost(s, u))),
          targets = eligible.filter((u) => engagementCost(s, u) === lowest);
        if (targets.length === 1)
          prepend(
            s,
            fx("wrathAttachFury", {
              target: targets[0].id,
              source: held.id,
              player,
            }),
          );
        else if (targets.length)
          choose(
            s,
            "Fury · Choose the lowest-engagement Easterling",
            targets.map((u) =>
              option(u, [
                fx("wrathAttachFury", {
                  target: u.id,
                  source: held.id,
                  player,
                }),
              ]),
            ),
          );
      } else if (e.code === W.caught)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("wrathCaught", { player })),
        );
      else if (e.code === W.fighting)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("wrathAssignDamage", {
              value: 1 + controlled(s, player).length,
              player,
            }),
          ),
        );
      else if (e.code === W.siege)
        q.phaseThreat.push({
          round: s.round,
          phase: phase(s),
          value: 1 + controlled(s).length,
        });
      else if (e.code === W.revenge) {
        const ulchor = enemies(s).find((u) => u.code === W.ulchor);
        if (ulchor)
          prepend(
            s,
            ...playerOrder(s)
              .filter((p) => controlled(s, p).length)
              .map((player) =>
                fx("immediateAttack", { target: ulchor.id, player }),
              ),
          );
      } else if (e.code === W.darkness) {
        const active = allActiveLocations(s);
        if (active.length)
          prepend(
            s,
            ...playerOrder(s).map((player) =>
              fx("wrathThreat", {
                value: active.reduce((n, u) => n + threatOf(s, u), 0),
                player,
              }),
            ),
          );
        else prepend(s, ...surgeEffects(W.darkness));
      }
      break;
    }
    case "wrathTreacheryDone": {
      const i = q.resolving.findIndex((c) => c.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      break;
    }
    case "wrathAttachFury": {
      const i = q.resolving.findIndex((c) => c.id === e.source);
      if (u && i >= 0) {
        const a = q.resolving.splice(i, 1)[0];
        u.attachments.push({ id: a.id, code: a.code, exhausted: false });
      }
      break;
    }
    case "wrathCaught":
      choose(s, "Caught Off Guard · Choose", [
        ...controlled(s, player).map((l) => ({
          ...option(l, [fx("wrathReturn", { target: l.id, player })]),
          label: `Return ${name(l)} to staging`,
        })),
        {
          id: "enemy",
          label: "Discard to an enemy and engage it",
          effects: [fx("wrathFindEnemy", { player })],
        },
      ]);
      break;
    default:
      return false;
  }
  return true;
}
export const WRATH_RUIN_HOOKS: Batch4ScenarioHooks = {
  ...SHADOW_EAST_SHARED_HOOKS,
  setup: setupWrathRuin,
  openingHandsKept: wrathRuinOpeningHandsKept,
  advance: () => true,
  stageInfo: wrathRuinStageInfo,
  stats: wrathRuinStats,
  threatBonus: wrathRuinThreatBonus,
  stagingThreat: (s) =>
    s.wrathRuin?.phaseThreat
      .filter((m) => m.round === s.round && m.phase === phase(s))
      .reduce((n, m) => n + m.value, 0) ?? 0,
  locationProgressBlocked: (s, u) =>
    !!activePlayerAbilityCode(s) &&
    !encounterProgress.has(s) &&
    stageLive(s) &&
    s.staging.some((l) => l.id === u.id),
  progress: (s, amount) => (s.stageRevealing ? 0 : amount),
  immune: (_s, u) =>
    !u.blanked && [W.ulchor, W.gate, W.tavern].includes(u.code),
  cannotLeave: (_s, u) => u.code === W.ulchor && !u.blanked,
  cannotEngage: (_s, u) => u.code === W.ulchor && !u.blanked,
  cannotCancel: (s) =>
    allActiveLocations(s).some((u) => u.code === W.tower && !u.blanked),
  beforeDestroy: wrathRuinBeforeDestroy,
  characterDestroyed: wrathRuinCharacterDestroyed,
  combatBegin: wrathRuinCombatBegin,
  attackFinished: wrathRuinAttackFinished,
  engaged: wrathRuinEngaged,
  threatRaised: wrathRuinThreatRaised,
  locationDestination: wrathRuinLocationDestination,
  explorationWhen: wrathRuinExplorationWhen,
  travelProblem: wrathRuinTravelProblem,
  travelEffects: wrathRuinTravelEffects,
  roundEnd: (s) => [fx("wrathEndRound", { player: firstPlayer(s) })],
  playerEliminated: (s, p) => {
    for (const u of [...controlled(s, p)]) wrathRuinReturn(s, u);
  },
  abilityLabel: (code) =>
    code === W.house
      ? "Engage the top discarded enemy to control Ransacked House"
      : undefined,
  abilityProblem: wrathRuinAbilityProblem,
  ability: wrathRuinAbility,
  encounter: wrathRuinEncounter,
  shadow: wrathRuinShadow,
  effect: wrathRuinEffect,
  sharedEffect: (e) =>
    shadowEastSharedEffect(e) ||
    [
      "wrathEndRound",
      "wrathStageTwo",
      "wrathFinishStage",
      "wrathExploredAfter",
      "wrathCapture",
      "wrathTavernReveal",
      "wrathRevealStored",
      "wrathTreacheryDone",
      "wrathShuffle",
      "wrathForum",
    ].includes(e.kind),
};
