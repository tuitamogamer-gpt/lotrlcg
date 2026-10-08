import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
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
  removeShadowCard,
  shuffle,
  locationQuest,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  discardCharacter,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  progress,
  progressLocation,
  questDefeated,
  revealed,
  win,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { heirsShadowDealt, heirsCannotHaveAttachments } from "./heirs-numenor";
import { fangornTravel } from "./fangorn";
import { currentQuestCode } from "./quest-state";
import {
  TRIALS as T,
  TRIAL_QUESTS,
  TRIAL_KEYS,
  TRIAL_GUARDIANS,
  TRIAL_BARROWS,
  TRIAL_SET_ASIDE,
  guardianTimeLimit,
} from "./three-trials-support";
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const guardians = (s: GameState) =>
  enemies(s).filter((u) => hasTrait(u, "Guardian"));
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const barrows = (s: GameState) =>
  locations(s).filter((u) => hasTrait(u, "Barrow"));
const present = (s: GameState, code: string) =>
  locations(s).some((u) => u.code === code && !u.blanked);
export const trialsKeys = (s: GameState) =>
  allHeroes(s).flatMap((hero) =>
    hero.attachments
      .filter((a) => TRIAL_KEYS.includes(a.code))
      .map((key) => ({ hero, key })),
  );
export const trialsEnemyTime = (s: GameState) =>
  enemies(s).filter((u) => !u.blanked && (u.timeCounters ?? 0) > 0);
export const trialsGuardian = (u: Unit) => hasTrait(u, "Guardian");
export const trialsCannotLeave = (s: GameState, u: Unit) =>
  s.threeTrials?.activeQuest === T.perseverance && trialsGuardian(u);
export const trialsCannotDamage = trialsCannotLeave;
export const trialsCannotMakeActive = (s: GameState, u: Unit) =>
  s.threeTrials?.activeQuest === T.strength && hasTrait(u, "Barrow");
export const trialsCanAttach = (u: Unit, code: string) =>
  u.blanked ||
  !TRIAL_GUARDIANS.includes(u.code) ||
  /\bKey\b/.test(card(code).traits ?? "");
export const trialsAttackBonus = (s: GameState, u: Unit) =>
  u.code === T.spirit && !u.blanked ? trialsKeys(s).length : 0;
export const trialsThreatBonus = (s: GameState, u: Unit) =>
  u.blanked
    ? 0
    : [T.circle, T.foothills].includes(u.code)
      ? (s.table?.seats.length ?? 1)
      : trialsAttackBonus(s, u);
export function setupThreeTrials(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (code) => !TRIAL_SET_ASIDE.includes(code),
  );
  s.threeTrials = {
    initialized: false,
    activeQuest: T.begin,
    completed: [],
    setAside: TRIAL_SET_ASIDE.map((code) => make(s, code)),
    revealing: [],
  };
}
export function trialsOpeningHandsKept(s: GameState) {
  if (!s.threeTrials || s.threeTrials.initialized) return false;
  s.threeTrials.initialized = true;
  prepend(s, fx("trialsChoose", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
function takeAside(s: GameState, code: string) {
  const q = s.threeTrials!,
    i = q.setAside.findIndex((u) => u.code === code);
  return i < 0 ? undefined : q.setAside.splice(i, 1)[0];
}
function randomAside(s: GameState, codes: string[]) {
  const candidates = s.threeTrials!.setAside.filter((u) =>
    codes.includes(u.code),
  );
  return candidates.length
    ? candidates[Math.floor(random(s) * candidates.length)]
    : undefined;
}
export function trialsRevealedUnit(s: GameState, code: string) {
  const q = s.threeTrials,
    i = q?.revealing.findIndex((u) => u.code === code) ?? -1;
  return q && i >= 0 ? q.revealing.splice(i, 1)[0] : undefined;
}
export function trialsCardEntered(_s: GameState, u: Unit, fromReveal: boolean) {
  if (guardianTimeLimit(u.code))
    u.timeCounters = fromReveal ? guardianTimeLimit(u.code) : 0;
}
function releaseKey(s: GameState, a: Attachment) {
  const u = make(s, a.code);
  u.id = a.id;
  u.exhausted = a.exhausted;
  delete u.owner;
  s.staging.push(u);
  log(s, `${name(u)} returns to staging and must be claimed.`);
}
export function trialsAttachmentLeaves(s: GameState, a: Attachment) {
  if (!TRIAL_KEYS.includes(a.code)) return false;
  releaseKey(s, a);
  return true;
}
export function trialsDiscardedKeys(s: GameState) {
  if (!s.threeTrials) return;
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (TRIAL_KEYS.includes(s.encounterDiscard[i])) {
      const code = s.encounterDiscard.splice(i, 1)[0];
      s.staging.push(make(s, code));
      log(s, `${card(code).name} is found in the discard pile.`);
    }
}
export function trialsCheck(s: GameState) {
  const q = s.threeTrials;
  if (!q || s.status !== "playing") return;
  trialsDiscardedKeys(s);
  for (const u of enemies(s))
    for (const a of [...u.attachments])
      if (!trialsCanAttach(u, a.code)) discardAttachment(s, u, a);
  for (const l of allActiveLocations(s))
    if (trialsCannotMakeActive(s, l)) {
      removeActiveLocation(s, l.id);
      s.staging.push(l);
    }
  if (
    present(s, T.cave) &&
    allCharacters(s).filter((u) =>
      ["ally", "objective-ally"].includes(card(u.code).type_code),
    ).length > 5
  ) {
    if (!s.choice)
      forOwner(s, firstPlayer(s), () =>
        choose(
          s,
          "Cave Barrow: keep at most five allies in play",
          allCharacters(s)
            .filter((u) =>
              ["ally", "objective-ally"].includes(card(u.code).type_code),
            )
            .map((u) => ({
              id: u.id,
              code: u.code,
              label: `Discard ${name(u)}`,
              effects: [
                fx("trialsDiscardCharacter", {
                  target: u.id,
                  player: ownerOf(s, u),
                }),
              ],
            })),
        ),
      );
    return;
  }
  const key = s.staging.find((u) => TRIAL_KEYS.includes(u.code));
  if (key && !s.choice) {
    const heroes = seatView(s, firstPlayer(s)).heroes.filter(
      (h) => !heirsCannotHaveAttachments(h),
    );
    if (heroes.length) {
      forOwner(s, firstPlayer(s), () =>
        choose(
          s,
          `Claim ${name(key)} on a hero`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("trialsClaim", {
                target: key.id,
                source: h.id,
                player: firstPlayer(s),
              }),
            ],
          })),
        ),
      );
      return;
    }
  }
  if (s.stageRevealing) return;
  for (const guardian of guardians(s)) {
    const keyCode = TRIAL_KEYS[TRIAL_GUARDIANS.indexOf(guardian.code)],
      holder = trialsKeys(s).find((x) => x.key.code === keyCode);
    const controller =
      s.stage === 3
        ? holder
          ? ownerOf(s, holder.hero)
          : undefined
        : firstPlayer(s);
    if (
      controller !== undefined &&
      !seatView(s, controller).engaged.some((u) => u.id === guardian.id)
    )
      forOwner(s, controller, () => engage(s, guardian));
  }
}
export function advanceThreeTrials(s: GameState) {
  const q = s.threeTrials;
  if (!q) return false;
  if (s.choice || s.stageRevealing || s.status !== "playing") return true;
  if (
    s.stage === 2 &&
    !q.advancing &&
    trialsKeys(s).some((x) => x.key.code === q.currentKey)
  ) {
    q.advancing = true;
    prepend(s, fx("trialsComplete", { player: firstPlayer(s) }));
  } else if (
    s.stage === 3 &&
    s.progress >= 1 &&
    s.victoryCards?.includes(T.circle) &&
    !s.queue.length
  )
    win(s);
  return true;
}
function victory(s: GameState, u: Unit) {
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.encounterDiscard.push(...u.shadows);
  s.staging = s.staging.filter((x) => x.id !== u.id);
  removeActiveLocation(s, u.id);
  for (const player of playerOrder(s))
    forOwner(
      s,
      player,
      () => (s.engaged = s.engaged.filter((x) => x.id !== u.id)),
    );
  addVictoryCard(s, u.code);
  log(s, `${name(u)} enters the victory display.`, "good");
}
export function trialsRemoveTime(s: GameState, u: Unit, count = 1): Effect[] {
  if (u.blanked || !u.timeCounters || count <= 0) return [];
  u.timeCounters = Math.max(0, u.timeCounters - count);
  log(s, `${name(u)} · Time ${u.timeCounters}.`, "danger");
  return u.timeCounters === 0
    ? [
        fx("trialsTimeExpired", {
          target: u.id,
          code: u.code,
          player: ownerOf(s, u),
        }),
      ]
    : [];
}
export function trialsRemoveEnemyTime(s: GameState, count = 1) {
  const effects = trialsEnemyTime(s).flatMap((u) =>
    trialsRemoveTime(s, u, count),
  );
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        text: "Choose the next Guardian deadline",
        effects,
        player: firstPlayer(s),
      }),
    );
  else prepend(s, ...effects);
}
export function trialsTimeOptions(s: GameState) {
  return trialsEnemyTime(s).map((u) => ({
    id: `time:${u.id}`,
    code: u.code,
    label: `Remove 1 time counter from ${name(u)}`,
    effects: [
      fx("trialsRemoveTime", {
        target: u.id,
        value: 1,
        player: firstPlayer(s),
      }),
    ],
  }));
}
export function trialsAttackStarted(s: GameState, u: Unit) {
  if (!trialsGuardian(u)) return;
  if (present(s, T.hill)) {
    const code = encounterDraw(s, true);
    if (code) {
      u.shadows.push(code);
      heirsShadowDealt(s, u);
    }
  }
}
export function trialsAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (c.trialsGuardianThreat === undefined || !present(s, T.stone)) return;
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("trialsThreat", { value: c.trialsGuardianThreat, player }),
    ),
  );
}
export function trialsCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !s.combat?.trialsTimeOnKill ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const n = s.combat.trialsTimeOnKill;
  s.combat.trialsTimeOnKill = 0;
  prepend(
    s,
    ...Array.from({ length: n }, () =>
      fx("trialsChooseTime", { player: firstPlayer(s) }),
    ),
  );
}
export function trialsRedirectProgress(
  s: GameState,
  n: number,
  target?: Unit,
  playerEffect = false,
  fromSuccessfulQuest = false,
) {
  if (
    !s.threeTrials ||
    n <= 0 ||
    !(target
      ? allActiveLocations(s).some((u) => u.id === target.id)
      : allActiveLocations(s).length)
  )
    return false;
  const hills = s.staging.filter((u) => u.code === T.foothills && !u.blanked);
  if (!hills.length) return false;
  const effect = (hill: Unit) =>
    fx("trialsFoothillsProgress", {
      target: hill.id,
      value: n,
      source: target?.id,
      flag: playerEffect,
      count: fromSuccessfulQuest ? 1 : 0,
    });
  if (hills.length === 1) prepend(s, effect(hills[0]));
  else
    forOwner(s, firstPlayer(s), () =>
      choose(
        s,
        "Grim Foothills: choose where to place progress first",
        hills.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [effect(u)],
        })),
      ),
    );
  return true;
}
export function trialsQuestProgress(s: GameState, n: number) {
  if (!s.threeTrials || s.stage !== 2) return false;
  if (s.threeTrials.activeQuest === T.intuition) {
    const cards = s.encounterDeck.splice(0, n);
    s.encounterDiscard.push(...cards);
    log(
      s,
      `Intuition discards ${cards.length} encounter cards instead of placing quest progress.`,
    );
    trialsDiscardedKeys(s);
    trialsCheck(s);
  }
  return true;
}
export function trialsTravelProblem(s: GameState, u: Unit) {
  if (trialsCannotMakeActive(s, u))
    return "Barrows cannot be active during the Trial of Strength.";
  if (u.blanked) return null;
  if (
    u.code === T.circle &&
    trialsKeys(s).filter((x) => !x.key.exhausted).length < 3
  )
    return "Hallowed Circle requires three ready Key objectives.";
  if (
    u.code === T.forest &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (c) =>
        card(c).type_code === "enemy" &&
        /\bSpirit\b/.test(card(c).traits ?? ""),
    )
  )
    return "Cursed Forest requires a Spirit enemy in the encounter deck or discard pile.";
  return null;
}
export function trialsTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (u.blanked || ![T.circle, T.forest].includes(u.code)) return undefined;
  return [
    ...(fangornTravel(s, u) ?? []),
    fx(u.code === T.circle ? "trialsExhaustKeys" : "trialsSearchSpirit", {
      player: firstPlayer(s),
    }),
  ];
}
export function trialsTravelEntered(s: GameState, u: Unit) {
  if (u.code === T.circle && !u.blanked)
    prepend(
      s,
      fx("fangornOrder", {
        text: "Choose the next Guardian travel attack",
        effects: allEngaged(s)
          .filter(trialsGuardian)
          .map((g) =>
            fx("immediateAttack", {
              target: g.id,
              code: g.code,
              player: ownerOf(s, g),
            }),
          ),
        player: firstPlayer(s),
      }),
    );
}
export function trialsEncounter(s: GameState, code: string, replay = false) {
  if (code === T.curse)
    prepend(
      s,
      ...allCharacters(s)
        .filter((u) => !card(u.code).is_unique)
        .map((u) =>
          fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
        ),
      fx("trialsCurseSurge", { player: firstPlayer(s) }),
    );
  else if (code === T.tenacity)
    trialsRemoveEnemyTime(s, s.table?.seats.length ?? 1);
  else if (code === T.fury) {
    const found = guardians(s);
    if (found.length)
      prepend(
        s,
        fx("fangornOrder", {
          text: "Choose the next Guardian attack",
          effects: found.map((u) =>
            fx("immediateAttack", {
              target: u.id,
              code: u.code,
              player: ownerOf(s, u),
            }),
          ),
          player: firstPlayer(s),
        }),
      );
    else {
      const fallen = (s.victoryCards ?? []).filter((c) =>
        TRIAL_GUARDIANS.includes(c),
      );
      if (fallen.length)
        prepend(
          s,
          fx("trialsReturnGuardian", {
            code: fallen[Math.floor(random(s) * fallen.length)],
          }),
        );
    }
  } else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function trialsShadow(s: GameState, code: string) {
  const c = s.combat,
    u = c ? get(s, c.enemyId) : undefined;
  if (!c || !u) return false;
  if ([T.spirit, T.curse].includes(code)) c.attackBonus += trialsKeys(s).length;
  else if (code === T.fury) {
    if (trialsGuardian(u)) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  } else if (code === T.tenacity) {
    if (trialsGuardian(u))
      prepend(s, fx("khazadExtraShadows", { target: u.id, count: 2 }));
  } else if (code === T.forest)
    c.trialsTimeOnKill = (c.trialsTimeOnKill ?? 0) + 1;
  else if (TRIAL_KEYS.includes(code)) {
    const i = u.shadows.indexOf(code);
    if (i >= 0) {
      removeShadowCard(u, i);
      s.encounterDeck.push(code);
      shuffle(s, s.encounterDeck);
    }
  } else return false;
  return true;
}
export function trialsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("trials")) return false;
  const q = s.threeTrials,
    u = get(s, e.target);
  switch (e.kind) {
    case "trialsDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "trialsThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "trialsChoose": {
      if (!q) break;
      const available = TRIAL_QUESTS.filter((c) => !q.completed.includes(c));
      if (available.length)
        choose(
          s,
          "Choose the next trial",
          available.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("trialsStart", { code, player: firstPlayer(s) })],
          })),
        );
      else prepend(s, fx("trialsFinal", { player: firstPlayer(s) }));
      break;
    }
    case "trialsStart": {
      if (
        !q ||
        !e.code ||
        !TRIAL_QUESTS.includes(e.code) ||
        q.completed.includes(e.code)
      )
        break;
      discardQuestAttachments(s, currentQuestCode(s)!);
      q.activeQuest = e.code;
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      let guardian: Unit | undefined,
        barrow: Unit | undefined,
        key: Unit | undefined;
      if (e.code === T.perseverance) {
        barrow = randomAside(s, TRIAL_BARROWS);
        key = randomAside(s, TRIAL_KEYS);
        guardian = q.setAside.find(
          (u) => u.code === TRIAL_GUARDIANS[TRIAL_KEYS.indexOf(key!.code)],
        );
      } else {
        guardian = randomAside(s, TRIAL_GUARDIANS);
        barrow = randomAside(s, TRIAL_BARROWS);
        key = q.setAside.find(
          (u) => u.code === TRIAL_KEYS[TRIAL_GUARDIANS.indexOf(guardian!.code)],
        );
      }
      if (!guardian || !barrow || !key) break;
      q.currentKey = key.code;
      const reveal = (code: string) =>
        fx("trialsReveal", { code, player: firstPlayer(s) });
      if (e.code === T.perseverance)
        prepend(
          s,
          fx("trialsAddAside", { code: barrow.code }),
          fx("trialsAttachKey", { code: key.code, target: barrow.id }),
          reveal(guardian.code),
          fx("trialsStageReady"),
        );
      else
        prepend(
          s,
          reveal(guardian.code),
          reveal(barrow.code),
          fx(e.code === T.strength ? "trialsAttachKey" : "trialsBuryKey", {
            code: key.code,
            target: guardian.id,
          }),
          fx("trialsStageReady"),
        );
      log(s, card(e.code).name, "chapter");
      break;
    }
    case "trialsAddAside": {
      const u = q && e.code ? takeAside(s, e.code) : undefined;
      if (u) {
        s.staging.push(u);
        if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
      }
      break;
    }
    case "trialsReveal": {
      if (!q || !e.code) break;
      const u = takeAside(s, e.code);
      if (u) q.revealing.push(u);
      prepend(s, fx("trialsRevealDone", { target: u?.id }));
      revealed(s, e.code);
      break;
    }
    case "trialsRevealDone":
      if (q) q.revealing = q.revealing.filter((u) => u.id !== e.target);
      break;
    case "trialsAttachKey": {
      const key = q && e.code ? takeAside(s, e.code) : undefined;
      if (!key) break;
      if (u)
        u.attachments.push({
          id: key.id,
          code: key.code,
          exhausted: key.exhausted,
        });
      else s.staging.push(key);
      break;
    }
    case "trialsBuryKey": {
      const key = q && e.code ? takeAside(s, e.code) : undefined;
      if (!key) break;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const bottom = s.encounterDeck.splice(
        Math.max(0, s.encounterDeck.length - 10),
      );
      bottom.push(key.code);
      shuffle(s, bottom);
      s.encounterDeck.push(...bottom);
      break;
    }
    case "trialsStageReady":
      s.stageRevealing = false;
      break;
    case "trialsClaim": {
      const hero = get(s, e.source);
      if (
        u &&
        TRIAL_KEYS.includes(u.code) &&
        hero &&
        seatView(s, firstPlayer(s)).heroes.some((h) => h.id === hero.id) &&
        !heirsCannotHaveAttachments(hero)
      ) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        hero.attachments.push({
          id: u.id,
          code: u.code,
          exhausted: u.exhausted,
        });
        log(s, `${name(hero)} claims ${name(u)}.`, "good");
      }
      break;
    }
    case "trialsComplete": {
      if (!q || s.stage !== 2) break;
      const code = q.activeQuest,
        pending = s.queue.length;
      if (questDefeated(s, code)) {
        s.queue.splice(s.queue.length - pending, 0, e);
        break;
      }
      if (!q.completed.includes(code)) q.completed.push(code);
      const leaving = [
        ...(code !== T.strength ? guardians(s) : []),
        ...(code !== T.perseverance ? barrows(s) : []),
      ];
      for (const u of leaving) victory(s, u);
      prepend(
        s,
        fx(q.completed.length === 3 ? "trialsFinal" : "trialsChoose", {
          player: firstPlayer(s),
        }),
      );
      break;
    }
    case "trialsFinal": {
      if (!q) break;
      q.activeQuest = T.crown;
      q.advancing = false;
      s.stage = 3;
      s.stageRevealing = true;
      s.progress = 0;
      const circle = takeAside(s, T.circle);
      if (circle) s.staging.push(circle);
      const effects = (s.victoryCards ?? [])
        .filter((c) => TRIAL_GUARDIANS.includes(c))
        .map((code) =>
          fx("trialsReturnGuardian", {
            code,
            flag: true,
            player: firstPlayer(s),
          }),
        );
      prepend(
        s,
        fx("fangornOrder", {
          text: "Choose the next Guardian to reveal",
          effects,
          player: firstPlayer(s),
        }),
        fx("trialsStageReady"),
      );
      break;
    }
    case "trialsReturnGuardian": {
      if (!e.code) break;
      const i = s.victoryCards?.indexOf(e.code) ?? -1;
      if (i < 0) break;
      s.victoryCards!.splice(i, 1);
      s.victory -= card(e.code).victory ?? 0;
      if (e.flag) revealed(s, e.code);
      else {
        const u = make(s, e.code);
        trialsCardEntered(s, u, false);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    }
    case "trialsRemoveTime":
      if (u) prepend(s, ...trialsRemoveTime(s, u, e.value ?? 1));
      break;
    case "trialsChooseTime": {
      const options = trialsTimeOptions(s);
      if (options.length)
        choose(s, "Choose an enemy to lose a time counter", options);
      break;
    }
    case "trialsTimeExpired": {
      if (!u || u.timeCounters !== 0) break;
      const player = ownerOf(s, u);
      const reset = fx("trialsResetTime", { target: u.id });
      if (u.code === T.boar)
        prepend(s, fx("trialsDiscardAlly", { player }), reset);
      else if (u.code === T.wolf)
        prepend(
          s,
          fx("immediateAttack", { target: u.id, code: u.code, player }),
          reset,
        );
      else if (u.code === T.raven)
        prepend(
          s,
          ...[...seatView(s, player).heroes, ...seatView(s, player).allies].map(
            (c) => fx("damage", { target: c.id, value: 1, player }),
          ),
          reset,
        );
      break;
    }
    case "trialsResetTime":
      if (u) u.timeCounters = guardianTimeLimit(u.code);
      break;
    case "trialsDiscardAlly":
      if (s.allies.length)
        choose(
          s,
          "Boar's Guardian: discard an ally",
          s.allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [
              fx("trialsDiscardCharacter", {
                target: a.id,
                player: activeSeat(s),
              }),
            ],
          })),
        );
      break;
    case "trialsFoothillsProgress": {
      const count = e.value ?? 0;
      if (u && s.staging.some((x) => x.id === u.id) && u.code === T.foothills) {
        const placed = Math.min(
            count,
            Math.max(0, locationQuest(s, u) - u.progress),
          ),
          pending = s.queue.length;
        progressLocation(s, u, placed);
        s.queue.splice(
          s.queue.length - pending,
          0,
          fx("trialsContinueProgress", {
            target: e.source,
            value: count - placed,
            flag: e.flag,
            count: e.count,
          }),
        );
      } else
        prepend(
          s,
          fx("trialsContinueProgress", {
            target: e.source,
            value: count,
            flag: e.flag,
            count: e.count,
          }),
        );
      break;
    }
    case "trialsContinueProgress":
      if ((e.value ?? 0) > 0) {
        if (e.target) {
          if (u) progressLocation(s, u, e.value!);
        } else progress(s, e.value!, !!e.flag, e.count === 1);
      }
      break;
    case "trialsExhaustKeys":
      for (const { key } of trialsKeys(s)) key.exhausted = true;
      break;
    case "trialsSearchSpirit": {
      const options = ["deck", "discard"].flatMap((source) =>
        [
          ...new Set(
            (source === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (c) =>
                card(c).type_code === "enemy" &&
                /\bSpirit\b/.test(card(c).traits ?? ""),
            ),
          ),
        ].map((code) => ({
          id: `${source}:${code}`,
          code,
          label: `${card(code).name} · encounter ${source}`,
          effects: [fx("trialsTakeSpirit", { code, text: source })],
        })),
      );
      if (options.length)
        choose(s, "Cursed Forest: choose a Spirit enemy", options);
      break;
    }
    case "trialsTakeSpirit": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) {
        pile.splice(i, 1);
        const u = make(s, e.code!);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "trialsCurseSurge":
      if (trialsKeys(s).length === 3)
        prepend(s, fx("amonSurgeWindow", { code: T.curse }), fx("reveal"));
      break;
    default:
      return false;
  }
  return true;
}
