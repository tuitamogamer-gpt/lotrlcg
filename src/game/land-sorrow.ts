import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
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
} from "./core";
import {
  damage,
  depositInFlightEncounterCards,
  enemyAddedToStaging,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  readyCharacter,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { isAlly } from "./card-types";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { choosePlayerResponse } from "./player-ability-triggers";
import { surgeEffects } from "./surge";
import * as Isengard from "./voice-isengard";
import {
  SHADOW_EAST_SHARED_HOOKS,
  shadowEastAttach,
  shadowEastEffect,
  shadowEastEncounter,
  shadowEastEngagementBonus,
  shadowEastRevealedSurge,
  shadowEastRoundEnd,
  shadowEastShadow,
  shadowEastSharedEffect,
  shadowEastStats,
  shadowEastThreatBonus,
  shadowEastTrait,
} from "./shadow-east-encounters";
import {
  plainsCannotReady,
  plainsEffect,
  plainsRefreshCharacters,
  plainsSideDefeated,
} from "./rolling-plains";
import {
  LAND_SORROW_RECIPES,
  SORROW as S,
  SORROW_CAMPS,
  SORROW_CAPTIVES,
  SORROW_WARDENS,
  sorrowPhase,
  sorrowPlayers,
  sorrowQuestPoints,
  sorrowStageInfo,
} from "./land-sorrow-support";
type Combat = NonNullable<GameState["combat"]>;
const live = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked);
const characters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
export const sorrowIsWarden = (u: Unit | string) =>
  shadowEastTrait(u, "Warden");
/** Warden enemies anywhere in play: the staging area or engaged with a player. */
export const sorrowWardens = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => isEnemy(u) && sorrowIsWarden(u),
  );
export const sorrowCampsInStaging = (s: GameState) =>
  s.staging.filter((u) => SORROW_CAMPS.includes(u.code));
export const sorrowCaptives = (s: GameState) =>
  allCharacters(s).filter((u) => SORROW_CAPTIVES.includes(u.code));
export const sorrowVictoryCamps = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => SORROW_CAMPS.includes(c)).length;
/** Watch Tower's X counts Captive objective-allies controlled by the players. */
export const sorrowTowerX = (s: GameState) => 1 + sorrowCaptives(s).length;
const stageLive = (s: GameState) => !mainQuestUnit(s)?.blanked;
const phases = (s: GameState) =>
  s.landSorrow?.phaseEffects.filter(
    (m) => m.round === s.round && m.phase === sorrowPhase(s),
  ) ?? [];
/** The current archery total: printed and attached archery on enemies in play plus Watch Tower in staging. */
export function sorrowArcheryTotal(s: GameState) {
  let n = 0;
  for (const u of [...s.staging, ...allEngaged(s)].filter(isEnemy)) {
    if (!u.blanked && u.code === S.guard) n += 2;
    if (!u.blanked && u.code === S.raider) n += 1;
    n += 2 * u.attachments.filter((a) => a.code === S.bow && !a.blanked).length;
  }
  n += live(s, S.tower).length * sorrowTowerX(s);
  return n;
}
function add(s: GameState, u: Unit) {
  s.staging.push(u);
  if (isEnemy(u)) enemyAddedToStaging(s, u);
  return u;
}
function loseGame(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  log(s, reason, "danger");
}
/** Discard from the encounter deck until an enemy, reshuffling the discard pile when the deck runs out. */
function discardUntilEnemy(s: GameState) {
  let reshuffled = false;
  for (;;) {
    if (!s.encounterDeck.length) {
      if (reshuffled || !s.encounterDiscard.length) return undefined;
      reshuffled = true;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
    }
    const code = s.encounterDeck.shift()!;
    if (isEnemy({ code } as Unit)) return code;
    s.encounterDiscard.push(code);
  }
}
export function setupLandSorrow(s: GameState) {
  const r = LAND_SORROW_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = r.cards
    .filter((c) => c.section === "sharedEncounterDeck")
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.landSorrow = {
    initialized: false,
    currentQuest: S.first,
    advancing: false,
    setAside: [...SORROW_CAMPS, ...SORROW_CAPTIVES, ...SORROW_WARDENS].map(
      (code) => make(s, code),
    ),
    camps: [],
    freed: [],
    resolving: [],
    enteredEnemies: [],
    phaseEffects: [],
    noReady: [],
    storehouse: [],
  };
  shuffle(s, s.encounterDeck);
}
function setupStage(s: GameState) {
  const q = s.landSorrow!;
  q.initialized = true;
  const take = (codes: string[]) =>
    q.setAside.filter((u) => codes.includes(u.code));
  const camps = take(SORROW_CAMPS),
    captives = shuffle(s, take(SORROW_CAPTIVES)),
    wardens = shuffle(s, take(SORROW_WARDENS));
  q.setAside = [];
  camps.forEach((camp, i) => {
    const captive = captives[i],
      warden = wardens[i];
    if (captive)
      camp.attachments.push({
        id: captive.id,
        code: captive.code,
        exhausted: false,
      });
    q.camps.push({ location: camp.id, code: camp.code, warden });
    s.staging.push(camp);
    log(
      s,
      `${name(camp)} guards ${captive ? name(captive) : "no captive"}; ${warden ? name(warden) : "no Warden"} waits beneath it.`,
      "danger",
    );
  });
  shuffle(s, s.encounterDeck);
  let remaining = playerOrder(s).length - 1;
  while (remaining > 0 && s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === "location") {
      s.staging.push(make(s, code));
      remaining--;
    } else s.encounterDiscard.push(code);
  }
}
function sorrowAdvance(s: GameState) {
  const q = s.landSorrow;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.pendingQuestDefeat ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    s.progress < sorrowQuestPoints(s)
  )
    return true;
  if (s.stage === 1) {
    if (stageLive(s) && sorrowCaptives(s).length < 3) return true;
    q.advancing = true;
    prepend(s, fx("sorrowDefeatQuest", { player: firstPlayer(s) }));
  } else if (!stageLive(s) || !sorrowWardens(s).length) {
    win(s);
    s.reason =
      "The captives of Nurn win their freedom, and Ulchor’s lieutenants are driven from the fields.";
  }
  return true;
}
function checkCaptives(s: GameState) {
  const q = s.landSorrow;
  if (!q || s.status !== "playing") return;
  for (const f of q.freed)
    if (!allCharacters(s).some((u) => u.id === f.id)) {
      loseGame(
        s,
        `${card(f.code).name} has left play. The revolt fails and the players lose the game.`,
      );
      return;
    }
}
function campActivated(s: GameState, u: Unit) {
  if (!SORROW_CAMPS.includes(u.code) || u.blanked) return;
  const camp = s.landSorrow!.camps.find((c) => c.location === u.id);
  if (camp?.warden)
    prepend(s, fx("sorrowWarden", { target: u.id, player: firstPlayer(s) }));
}
function campExplored(s: GameState, u: Unit) {
  const q = s.landSorrow!;
  const i = q.camps.findIndex((c) => c.location === u.id);
  if (i < 0) return;
  const camp = q.camps.splice(i, 1)[0];
  // The Warden normally entered play when the Camp became active; never lose its physical card.
  if (camp.warden) add(s, camp.warden);
  const a = u.attachments.find((a) => SORROW_CAPTIVES.includes(a.code));
  if (!a) return;
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  const player = firstPlayer(s);
  const captive = make(s, a.code);
  captive.id = a.id;
  captive.owner = player;
  captive.controller = player;
  forOwner(s, player, () => s.allies.push(captive));
  q.freed.push({ id: captive.id, code: captive.code });
  log(
    s,
    `${name(u)} is explored. The first player gains control of ${name(captive)}.`,
    "good",
  );
}
const engagedPlayer = (s: GameState, enemy: Unit) =>
  allEngaged(s).some((e) => e.id === enemy.id) ? ownerOf(s, enemy) : undefined;
function wardenCannotDefend(s: GameState, enemy: Unit, defender?: Unit) {
  if (!sorrowIsWarden(enemy) || enemy.blanked || !defender) return false;
  const p = engagedPlayer(s, enemy) ?? s.combat?.attackPlayer;
  if (p !== undefined && ownerOf(s, defender) !== p) return true;
  return enemy.code === S.ulwarth && isAlly(defender);
}
function wardenCannotAttack(s: GameState, character: Unit, enemy: Unit) {
  if (!sorrowIsWarden(enemy) || enemy.blanked) return false;
  const p = engagedPlayer(s, enemy);
  if (p === undefined || ownerOf(s, character) !== p) return true;
  return enemy.code === S.ulwarth && isAlly(character);
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (shadowEastEncounter(s, code, replay, fromReveal)) return true;
  const q = s.landSorrow!;
  if ([S.plains, S.weary, S.fatigue].includes(code)) {
    if (!replay && card(code).type_code === "treachery")
      s.encounterDiscard.push(code);
    if (!fromReveal) return true;
    if (code === S.fatigue)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("plainsFatigue", { player })),
      );
    else
      q.phaseEffects.push({
        round: s.round,
        phase: sorrowPhase(s),
        plains: code === S.plains ? 1 : 0,
        weary: code === S.weary ? 1 : 0,
      });
    return true;
  }
  if (code === S.guard) {
    if (fromReveal)
      prepend(s, fx("sorrowGuardArchery", { player: firstPlayer(s) }));
    return true;
  }
  if (![S.whip, S.cruelty, S.broken].includes(code)) return false;
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
    fx("sorrowTreachery", { code, source: u.id, player: firstPlayer(s) }),
    ...(code === S.whip
      ? []
      : [fx("sorrowTreacheryDone", { source: u.id, player: firstPlayer(s) })]),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  if (shadowEastShadow(s, code)) return true;
  const c = s.combat;
  if (!c) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId),
    defenders = c.defenderIds?.length
      ? c.defenderIds
      : c.defenderId
        ? [c.defenderId]
        : [];
  if (code === S.weary) {
    if (c.defenderId)
      prepend(s, fx("damage", { target: c.defenderId, value: 1, player: p }));
  } else if (code === S.fatigue)
    prepend(s, fx("plainsFatigueShadow", { player: p }));
  else if (code === S.guard)
    for (const id of defenders)
      s.landSorrow!.noReady.push({ id, round: s.round });
  else if (code === S.slaver) c.attackBonus += sorrowVictoryCamps(s);
  else if (code === S.cruelty) {
    if (enemy) enemy.tempDefense = (enemy.tempDefense ?? 0) + 2;
  } else if (code === S.broken) {
    if (enemy && sorrowIsWarden(enemy))
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else return false;
  return true;
}
const takeResolving = (s: GameState, id?: string) => {
  const q = s.landSorrow!,
    i = q.resolving.findIndex((u) => u.id === id);
  return i >= 0 ? q.resolving.splice(i, 1)[0] : undefined;
};
const exhaustable = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
export function landSorrowEffect(s: GameState, e: Effect) {
  if (shadowEastEffect(s, e) || plainsEffect(s, e)) return true;
  if (!e.kind.startsWith("sorrow") || e.kind.startsWith("sorrowPlayer"))
    return false;
  const q = s.landSorrow;
  if (!q) return false;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "sorrowSetup":
      setupStage(s);
      break;
    case "sorrowDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx("sorrowNextQuest", { player: firstPlayer(s) }),
      );
      break;
    }
    case "sorrowNextQuest":
      s.stage = 2;
      q.currentQuest = S.last;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, "Lead the Revolt: Ulchor’s lieutenants return.", "danger");
      prepend(s, fx("sorrowStageTwo", { player: firstPlayer(s) }));
      break;
    case "sorrowStageTwo": {
      const victory = s.victoryCards ?? [];
      for (const code of victory.filter((c) => SORROW_WARDENS.includes(c))) {
        const i = s.victoryCards!.indexOf(code);
        s.victoryCards!.splice(i, 1);
        s.victory -= card(code).victory ?? 0;
        add(s, make(s, code));
        log(
          s,
          `${card(code).name} returns from the victory display.`,
          "danger",
        );
      }
      const found: string[] = [];
      for (const _player of playerOrder(s).slice(1)) {
        const code = discardUntilEnemy(s);
        if (code) found.push(code);
      }
      for (const code of found) add(s, make(s, code));
      s.stageRevealing = false;
      q.advancing = false;
      break;
    }
    case "sorrowRoundEnd": {
      const n = sorrowCampsInStaging(s).length;
      if (n)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("sorrowThreat", { value: n, text: "quest", player }),
          ),
        );
      q.phaseEffects = q.phaseEffects.filter((m) => m.round > s.round);
      break;
    }
    case "sorrowWarden": {
      const camp = q.camps.find((c) => c.location === e.target);
      const warden = camp?.warden;
      if (!camp || !warden) break;
      delete camp.warden;
      if (camp.code === S.quarters) {
        const first = firstPlayer(s);
        enterEnemyEngaged(s, warden, first);
        log(s, `${name(warden)} engages the first player.`, "danger");
        prepend(s, fx("immediateAttack", { target: warden.id, player: first }));
        break;
      }
      add(s, warden);
      if (camp.code === S.barracks) warden.roundCannotTakeDamage = true;
      if (camp.code === S.storehouse) {
        warden.roundAttack = (warden.roundAttack ?? 0) + 3;
        q.storehouse.push({ id: warden.id, round: s.round });
      }
      log(s, `${name(warden)} enters the staging area.`, "danger");
      break;
    }
    case "sorrowGuardArchery": {
      const value = sorrowArcheryTotal(s);
      if (value)
        prepend(s, fx("heirsArchery", { value, player: firstPlayer(s) }));
      break;
    }
    case "sorrowTreachery":
      if (e.code === S.whip) {
        const enemies = [...s.staging, ...allEngaged(s)].filter(
          (u) => isEnemy(u) && shadowEastTrait(u, "Easterling"),
        );
        const low = Math.min(...enemies.map((u) => engagementCost(s, u)));
        const targets = enemies.filter((u) => engagementCost(s, u) === low);
        if (!targets.length) {
          const physical = takeResolving(s, e.source);
          if (physical) s.encounterDiscard.push(physical.code);
          break;
        }
        choose(
          s,
          "Overseer's Whip · Attach to the lowest engagement cost Easterling",
          targets.map((u) =>
            option(u, [
              fx("sorrowWhipAttach", {
                target: u.id,
                source: e.source,
                player: firstPlayer(s),
              }),
            ]),
          ),
        );
      } else if (e.code === S.cruelty) {
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("sorrowCrueltyDamage", { player }),
          ),
          ...playerOrder(s).map((player) =>
            fx("sorrowCrueltyChoice", { player }),
          ),
        );
      } else if (e.code === S.broken) {
        let exhausted = 0;
        for (const c of allCharacters(s).filter(
          (u) => u.damage > 0 && exhaustable(u),
        ))
          if (exhaustCharacter(s, c)) exhausted++;
        if (!exhausted) {
          log(s, "Broken Captives gains surge and doomed 1.", "danger");
          prepend(s, ...surgeEffects(S.broken));
          Isengard.resolveDoomed(s, 1, "encounter");
        }
      }
      break;
    case "sorrowWhipAttach": {
      const physical = takeResolving(s, e.source);
      if (physical && u && isEnemy(u))
        shadowEastAttach(s, u, physical.code, physical);
      else if (physical) s.encounterDiscard.push(physical.code);
      break;
    }
    case "sorrowTreacheryDone": {
      const physical = takeResolving(s, e.source);
      if (physical) s.encounterDiscard.push(physical.code);
      break;
    }
    case "sorrowCrueltyDamage": {
      const chars = characters(s, p).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (chars.length)
        choose(
          s,
          "Cruelty of Mordor · Deal 1 damage to a character you control",
          chars.map((u) =>
            option(u, [fx("damage", { target: u.id, value: 1, player: p })]),
          ),
        );
      break;
    }
    case "sorrowCrueltyChoice": {
      const damaged = characters(s, p).filter((u) => u.damage > 0);
      if (!damaged.length) break;
      choose(s, "Cruelty of Mordor · Choose your punishment", [
        {
          id: "damage",
          label: `Deal 1 damage to each of your ${damaged.length} damaged characters`,
          effects: [fx("sorrowCrueltyWound", { player: p })],
        },
        {
          id: "threat",
          label: `Raise your threat by ${damaged.length}`,
          effects: [fx("sorrowThreat", { value: damaged.length, player: p })],
        },
      ]);
      break;
    }
    case "sorrowThreat":
      forOwner(s, p, () =>
        raiseThreat(
          s,
          e.value ?? 0,
          e.text === "quest" ? "quest-card" : "encounter",
        ),
      );
      break;
    case "sorrowCrueltyWound":
      for (const c of characters(s, p).filter((u) => u.damage > 0))
        damage(s, c.id, 1);
      break;
    case "sorrowWhipDamage": {
      const chars = characters(s, p).filter((u) => u.exhausted);
      if (chars.length)
        choose(
          s,
          "Overseer's Whip · Deal 1 damage to an exhausted character you control",
          chars.map((u) =>
            option(u, [fx("damage", { target: u.id, value: 1, player: p })]),
          ),
        );
      break;
    }
    case "sorrowFieldsDamage": {
      const chars = characters(s, p);
      if (chars.length)
        choose(
          s,
          "Working Fields · Deal 1 damage to a character you control",
          chars.map((u) =>
            option(u, [fx("damage", { target: u.id, value: 1, player: p })]),
          ),
        );
      break;
    }
    case "sorrowOutcrop":
      choose(
        s,
        "Rocky Outcrop · Exhaust a hero",
        seatView(s, p)
          .heroes.filter(exhaustable)
          .map((u) => option(u, [fx("exhaust", { target: u.id, player: p })])),
      );
      break;
    case "sorrowExcess": {
      const remaining = e.value ?? 0;
      const chars = characters(s, p).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (remaining > 0 && chars.length)
        choose(
          s,
          `Borlach · Assign excess damage (${remaining} remaining)`,
          chars.map((u) =>
            option(u, [
              fx("damage", { target: u.id, value: 1, player: p }),
              fx("sorrowExcess", { value: remaining - 1, player: p }),
            ]),
          ),
        );
      break;
    }
    case "sorrowEdrahil":
      if (u && !u.blanked && allCharacters(s).some((c) => c.id === u.id))
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Edrahil · Choose a player to draw 1 card",
          [
            ...playerOrder(s)
              .filter((player) => seatView(s, player).deck.length)
              .map((player) => ({
                id: `draw-${player}`,
                label: `Player ${player + 1} draws 1 card`,
                effects: [fx("draw", { value: 1, player })],
              })),
            skip,
          ],
        );
      break;
    case "sorrowArador":
      if (
        u &&
        !u.blanked &&
        u.exhausted &&
        !seatView(s, p).used.includes(`round:sorrow-arador:${u.id}`)
      )
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Arador · Ready after defending",
          [
            {
              id: "ready",
              label: "Ready Arador (limit once per round)",
              effects: [fx("sorrowAradorReady", { target: u.id, player: p })],
            },
            skip,
          ],
        );
      break;
    case "sorrowAradorReady":
      if (u && !seatView(s, p).used.includes(`round:sorrow-arador:${u.id}`)) {
        forOwner(s, p, () => s.used.push(`round:sorrow-arador:${u.id}`));
        readyCharacter(s, u, false);
      }
      break;
    case "sorrowFarin": {
      const targets = allEngaged(s).filter(isEnemy);
      if (u && !u.blanked && targets.length)
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Farin · Deal 1 damage to an engaged enemy",
          [
            ...targets.map((t) =>
              option(t, [fx("damage", { target: t.id, value: 1, player: p })]),
            ),
            skip,
          ],
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
export const LAND_SORROW_HOOKS: Batch4ScenarioHooks = {
  ...SHADOW_EAST_SHARED_HOOKS,
  setup: setupLandSorrow,
  openingHandsKept: (s) => {
    if (s.landSorrow!.initialized) return false;
    prepend(s, fx("sorrowSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance: sorrowAdvance,
  stageInfo: sorrowStageInfo,
  check: checkCaptives,
  characterLeft: (s) => checkCaptives(s),
  stats: (s, u) => ({
    ...shadowEastStats(s, u),
    will: u.exhausted ? -phases(s).reduce((n, m) => n + m.weary, 0) : 0,
  }),
  threatBonus: (s, u) =>
    shadowEastThreatBonus(s, u) +
    (u.code === S.tower && !u.blanked ? sorrowTowerX(s) : 0) +
    (u.code === S.plains ? 2 * phases(s).reduce((n, m) => n + m.plains, 0) : 0),
  engagementBonus: (s, u) =>
    shadowEastEngagementBonus(s, u) +
    (s.landSorrow!.storehouse.some((x) => x.id === u.id && x.round === s.round)
      ? -30
      : 0),
  combatBegin: (s) => {
    const value = sorrowArcheryTotal(s);
    if (value)
      prepend(s, fx("heirsArchery", { value, player: firstPlayer(s) }));
  },
  immune: (s, u) =>
    s.stage === 1 && stageLive(s) && SORROW_CAMPS.includes(u.code),
  cannotHeal: (s, u) =>
    live(s, S.fields).length > 0 &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code),
  travelProblem: (s, u) => {
    if (
      SORROW_CAMPS.includes(u.code) &&
      s.stage === 1 &&
      stageLive(s) &&
      sorrowWardens(s).length
    )
      return "Players cannot travel to a Camp while a Warden enemy is in play.";
    if (
      u.code === S.outcrop &&
      !u.blanked &&
      !seatView(s, firstPlayer(s)).heroes.some(exhaustable)
    )
      return "Rocky Outcrop requires a ready hero controlled by the first player.";
    return null;
  },
  travelEffects: (s, u) =>
    u.blanked
      ? undefined
      : u.code === S.fields
        ? playerOrder(s).map((player) => fx("sorrowFieldsDamage", { player }))
        : u.code === S.tower
          ? [fx("reveal", { player: firstPlayer(s) })]
          : u.code === S.plains
            ? playerOrder(s).map((player) =>
                fx("sorrowThreat", { value: 2, player }),
              )
            : u.code === S.outcrop
              ? [fx("sorrowOutcrop", { player: firstPlayer(s) })]
              : undefined,
  travelEntered: (s, u) => campActivated(s, u),
  explored: (s, u) => campExplored(s, u),
  cannotDefend: wardenCannotDefend,
  cannotAttack: wardenCannotAttack,
  cannotPlayerReady: (s) => live(s, S.outcrop).length > 0,
  cannotReady: (s, u) =>
    plainsCannotReady(s, u) ||
    s.landSorrow!.noReady.some((x) => x.id === u.id && x.round === s.round),
  refreshCharacters: plainsRefreshCharacters,
  sideDefeated: plainsSideDefeated,
  revealedSurge: (s, code) =>
    shadowEastRevealedSurge(s, code) ||
    (code === S.slaver && sorrowCampsInStaging(s).length < sorrowPlayers(s)),
  committed: (s) => {
    if (s.stage !== 2 || s.stageRevealing || !stageLive(s)) return;
    prepend(
      s,
      ...playerOrder(s)
        .filter(
          (p) =>
            characters(s, p).some((u) => u.committed) &&
            !seatView(s, p).engaged.some(
              (u) => isEnemy(u) && sorrowIsWarden(u),
            ),
        )
        .map((player) => fx("reveal", { player })),
    );
  },
  questSucceeded: (s) => {
    for (const u of sorrowCaptives(s).filter(
      (u) => u.code === S.edrahil && u.committed && !u.blanked,
    ))
      prepend(s, fx("sorrowEdrahil", { target: u.id, player: ownerOf(s, u) }));
  },
  attackersDeclared: (s, _enemy, ids) =>
    sorrowCaptives(s)
      .filter((u) => u.code === S.farin && ids.includes(u.id) && !u.blanked)
      .map((u) => fx("sorrowFarin", { target: u.id, player: ownerOf(s, u) })),
  defendersDeclared: (s, _enemy, defenders) =>
    defenders
      .filter((u) => u.code === S.arador && !u.blanked)
      .map((u) => fx("sorrowArador", { target: u.id, player: ownerOf(s, u) })),
  enemyAttackStarted: (s, u, p) => {
    SHADOW_EAST_SHARED_HOOKS.enemyAttackStarted?.(s, u, p);
    if (s.combat) {
      s.combat.sorrowEnemy = u.blanked ? undefined : u.code;
      s.combat.sorrowKilled = false;
      s.combat.sorrowExcess = 0;
    }
    for (const _a of u.attachments.filter(
      (a) => a.code === S.whip && !a.blanked,
    ))
      prepend(s, fx("sorrowWhipDamage", { player: p }));
  },
  damageDealt: (s, u, _n, ctx) => {
    const c = s.combat;
    if (ctx.combatDamage && c && ctx.enemyId === c.enemyId)
      c.sorrowExcess =
        (c.sorrowExcess ?? 0) + Math.max(0, u.damage - stats(s, u).health);
  },
  characterDestroyed: (s, _u, ctx) => {
    const c = s.combat;
    if (ctx.combatDamage && c && ctx.enemyId === c.enemyId)
      c.sorrowKilled = true;
  },
  attackFinished: (s, c: Combat, skipped = false) => {
    if (skipped || !c.attackResolved) return [];
    const p = c.attackPlayer,
      effects: Effect[] = [];
    if (c.sorrowEnemy === S.lorgan)
      effects.push(
        ...playerOrder(s).map((player) =>
          fx("sorrowThreat", { value: c.sorrowKilled ? 2 : 1, player }),
        ),
      );
    if (
      c.sorrowEnemy === S.borlach &&
      c.sorrowKilled &&
      (c.sorrowExcess ?? 0) > 0
    )
      effects.push(fx("sorrowExcess", { value: c.sorrowExcess, player: p }));
    return effects;
  },
  roundEnd: (s) => [
    ...shadowEastRoundEnd(s),
    ...(s.stage === 1 && stageLive(s)
      ? [fx("sorrowRoundEnd", { player: firstPlayer(s) })]
      : []),
  ],
  encounter,
  shadow,
  effect: landSorrowEffect,
  sharedEffect: (e) =>
    shadowEastSharedEffect(e) ||
    [
      "sorrowSetup",
      "sorrowDefeatQuest",
      "sorrowNextQuest",
      "sorrowStageTwo",
      "sorrowRoundEnd",
      "sorrowWarden",
      "sorrowGuardArchery",
      "sorrowTreachery",
      "sorrowWhipAttach",
      "sorrowTreacheryDone",
    ].includes(e.kind),
};
