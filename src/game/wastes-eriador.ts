import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isHero, isAlly } from "./card-types";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  shuffle,
} from "./core";
import {
  discardCharacter,
  enemyAddedToStaging,
  engage,
  questDefeated,
  revealed,
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
import { currentQuestUnit } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import { choosePlayerResponse } from "./player-ability-triggers";
import { WASTES as W, WASTES_RECIPES } from "./wastes-eriador-support";

const isWastes = (s: GameState) =>
  s.scenarioId === "wastes-of-eriador" && !!s.wastesEriador;
const time = (s: GameState) => s.staging.find((u) => u.code === W.time);
export const wastesIsNight = (s: GameState) =>
  isWastes(s) && time(s)?.flipped === true;
const isWarg = (u: Unit) =>
  card(u.code).type_code === "enemy" &&
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Warg");
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const ordinaryAllies = (s: GameState) =>
  allCharacters(s).filter(
    (u) => isAlly(u) && card(u.code).type_code === "ally",
  );
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
function ordered(s: GameState, effects: Effect[], text: string) {
  if (!effects.length) return;
  if (effects.length === 1) prepend(s, effects[0]);
  else
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
function afterGenerated(s: GameState, before: number, effect: Effect) {
  const effects = s.queue.splice(0, s.queue.length - before);
  prepend(s, ...effects, effect);
}
function returnEnemy(s: GameState, u: Unit) {
  if (!allEngaged(s).some((x) => x.id === u.id)) return;
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function searchCodes(s: GameState) {
  return [
    ...new Set(
      [...s.encounterDeck, ...s.encounterDiscard].filter((code) =>
        isWarg({ code } as Unit),
      ),
    ),
  ];
}
function drawShadow(s: GameState, u: Unit) {
  const code = encounterDraw(s, true);
  if (code) {
    u.shadows.push(code);
    log(s, `${name(u)} receives a shadow card.`);
  }
}
/** Changes of face trigger their printed WHEN effects exactly once. */
function flip(s: GameState, night: boolean) {
  const u = time(s);
  if (!u || !!u.flipped === night) return;
  u.flipped = night;
  log(
    s,
    night ? "Night falls over Eriador." : "Day breaks over Eriador.",
    "chapter",
  );
  const effects: Effect[] = [];
  if (night) {
    if (!u.blanked) effects.push(fx("reveal", { player: firstPlayer(s) }));
    if (s.stage === 1)
      effects.push(fx("wastesAllThreat", { value: 1, player: firstPlayer(s) }));
    if (s.stage === 2)
      effects.push(
        fx("wastesDiscardAllies", {
          count: playerOrder(s).length >= 3 ? 2 : 1,
          player: firstPlayer(s),
        }),
      );
    effects.push(
      ...s.staging
        .filter((x) => x.code === W.blood && !x.blanked)
        .map((x) =>
          fx("wastesBloodAttack", { target: x.id, player: firstPlayer(s) }),
        ),
    );
  } else {
    if (!u.blanked)
      effects.push(fx("wastesReturnEnemies", { player: firstPlayer(s) }));
    if (s.stage === 2)
      effects.push(
        ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
      );
    if (s.stage === 3)
      effects.push(fx("wastesClearStage", { player: firstPlayer(s) }));
  }
  ordered(
    s,
    effects,
    `Choose the next ${night ? "Nightfall" : "Daybreak"} Forced effect`,
  );
}
export function setupWastes(s: GameState) {
  const recipe = WASTES_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  s.wastesEriador = {
    initialized: false,
    setAside: pile("sharedSetAside").map((code) => make(s, code)),
    progressRound: -1,
    progressPlaced: {},
  };
}
export function wastesOpeningHandsKept(s: GameState) {
  if (!isWastes(s) || s.wastesEriador!.initialized) return false;
  prepend(s, fx("wastesSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export const wastesCancelAllowed = (s: GameState) =>
  !wastesIsNight(s) || !!time(s)?.blanked;
export const wastesEngagementChecksAllowed = (s: GameState) =>
  !isWastes(s) || wastesIsNight(s) || !!time(s)?.blanked;
export const wastesOptionalEngagementAllowed = (s: GameState, u: Unit) =>
  !isWastes(s) || u.code !== W.leader || !!u.blanked;
export const wastesCannotAttach = (s: GameState, u: Unit) =>
  isWastes(s) && [W.leader, W.hunting].includes(u.code) && !u.blanked;
export const wastesCannotDamage = (s: GameState, u: Unit) =>
  isWastes(s) && s.stage === 3 && u.code === W.leader && s.progress < 5;
export const wastesWillBonus = (s: GameState, u: Unit) =>
  isWastes(s) && s.stage === 1 && !wastesIsNight(s) && isHero(u) ? 1 : 0;
export const wastesAttackBonus = (s: GameState, u: Unit) =>
  isWastes(s) && wastesIsNight(s) && u.code === W.wolf && !u.blanked ? 2 : 0;
export const wastesLocationThreat = (
  s: GameState,
  u: Unit,
): number | undefined =>
  isWastes(s) && u.code === W.downs && !u.blanked
    ? (card(u.code).threat ?? 0) + (wastesIsNight(s) ? 2 : 0)
    : undefined;
export function wastesEngagementCost(
  s: GameState,
  u: Unit,
  player = activeSeat(s),
): number | undefined {
  if (!isWastes(s) || u.code !== W.hunting || u.blanked) return undefined;
  return Math.max(
    0,
    (card(u.code).engagement ?? 0) -
      [...seatView(s, player).heroes, ...seatView(s, player).allies].filter(
        (c) => c.damage > 0,
      ).length +
      (u.tempEngagement ?? 0),
  );
}
export function wastesProgress(s: GameState, amount: number, target?: Unit) {
  if (!isWastes(s)) return amount;
  if (wastesIsNight(s) && !time(s)?.blanked) return 0;
  const q = s.wastesEriador!;
  if (q.progressRound !== s.round) {
    q.progressRound = s.round;
    q.progressPlaced = {};
  }
  const current = currentQuestUnit(s);
  const quest = target ?? current;
  const cap =
    (!target || target.id === current?.id) &&
    s.staging.some((u) => u.code === W.wastes && !u.blanked);
  const id = quest?.id ?? `quest:${s.stage}`;
  const before = q.progressPlaced[id] ?? 0;
  const placed = cap
    ? Math.min(Math.max(0, amount), Math.max(0, 5 - before))
    : Math.max(0, amount);
  q.progressPlaced[id] = before + placed;
  return placed;
}
export function wastesEndRound(s: GameState) {
  if (isWastes(s) && time(s) && !time(s)!.blanked)
    prepend(
      s,
      fx("wastesFlip", { flag: !wastesIsNight(s), player: firstPlayer(s) }),
    );
}
export function wastesCheck(s: GameState) {
  if (!isWastes(s) || !s.wastesEriador!.initialized || s.status !== "playing")
    return;
  if (!allCharacters(s).some((u) => u.code === W.amarthiul)) {
    s.status = "lost";
    s.reason =
      "Amarthiúl has left play. Your fellowship loses the trail through Eriador.";
    s.choice = null;
    s.queue = [];
  }
}
export function wastesEnemyDefeated(s: GameState, u: Unit) {
  if (isWastes(s) && s.stage === 3 && u.code === W.leader) {
    win(s);
    s.reason =
      "The Pack Leader is destroyed. The Wargs scatter, and your fellowship continues after Iârion's captors.";
  }
}
export function wastesEngaged(s: GameState, u: Unit) {
  if (!isWastes(s)) return;
  const effects: Effect[] = [];
  if (!u.blanked && u.code === W.white)
    effects.push(
      fx("wastesChooseDamage", {
        value: wastesIsNight(s) ? 2 : 1,
        player: ownerOf(s, u),
      }),
    );
  if (!u.blanked && u.code === W.leader)
    effects.push(
      fx("wastesExhaust", {
        count: seatView(s, ownerOf(s, u)).engaged.filter(isWarg).length,
        player: ownerOf(s, u),
      }),
    );
  const a = allCharacters(s).find((x) => x.code === W.amarthiul && !x.blanked);
  if (a && ownerOf(s, a) !== ownerOf(s, u))
    effects.push(
      fx("wastesAmarthiulResponse", {
        source: a.id,
        value: ownerOf(s, u),
        player: ownerOf(s, a),
      }),
    );
  prepend(s, ...effects);
}
export function wastesCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    isWastes(s) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    s.combat.wastesCharacterKilled = true;
}
export function wastesAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (!isWastes(s)) return;
  const effects: Effect[] = [];
  for (let i = 0; i < (c.wastesNextPlayerAttacks ?? 0); i++)
    effects.push(
      fx("wastesNextAttack", {
        target: c.enemyId,
        value: c.attackPlayer ?? activeSeat(s),
        player: firstPlayer(s),
      }),
    );
  for (let i = 0; i < (c.wastesExtraAttacks ?? 0); i++)
    effects.push(
      fx("immediateAttack", {
        target: c.enemyId,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  if (c.wastesCharacterKilled && c.wastesRemoveQuestOnKill)
    effects.push(fx("wastesClearCurrentQuest", { player: firstPlayer(s) }));
  ordered(s, effects, "Choose the next after-attack shadow effect");
}
export function wastesAdvance(s: GameState) {
  if (!isWastes(s)) return false;
  if (
    !s.wastesEriador!.initialized ||
    s.status !== "playing" ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice
  )
    return true;
  if (s.stage < 3 && s.progress >= (s.stage === 1 ? 20 : 15)) {
    const code = s.stage === 1 ? W.across : W.howling;
    if (questDefeated(s, code)) return true;
    s.stage++;
    s.progress = 0;
    s.stageRevealing = true;
    log(
      s,
      s.stage === 2
        ? "Howling at Night · The Wargs close around your fellowship."
        : "Battle with the Pack · The alpha male emerges.",
      "chapter",
    );
    prepend(s, fx("wastesStage", { value: s.stage, player: firstPlayer(s) }));
  } else if (
    s.stage === 3 &&
    s.progress >= 5 &&
    !enemies(s).some((u) => u.code === W.leader) &&
    !questDefeated(s, W.battle)
  )
    win(s);
  return true;
}
export function wastesTravelProblem(s: GameState, u: Unit) {
  if (!isWastes(s) || u.blanked) return null;
  if (u.code === W.wastes && !s.staging.some(isWarg))
    return "Eriador Wastes requires a Warg enemy in staging.";
  if (u.code === W.den && !searchCodes(s).length)
    return "Warg's Den requires a Warg enemy in the encounter deck or discard pile.";
  return null;
}
export function wastesTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (!isWastes(s) || u.blanked) return undefined;
  if (u.code === W.wastes)
    return [fx("wastesTravelEngage", { player: firstPlayer(s) })];
  if (u.code === W.den)
    return [fx("wastesSearch", { flag: true, player: firstPlayer(s) })];
  return undefined;
}
export function wastesEncounter(s: GameState, code: string, replay = false) {
  if (!isWastes(s)) return false;
  if (code === W.northern)
    for (const u of enemies(s).filter(isWarg))
      u.tempThreat = (u.tempThreat ?? 0) + 1;
  else if (code === W.darkness) {
    if (wastesIsNight(s))
      prepend(s, fx("wastesAllThreat", { value: 4, player: firstPlayer(s) }));
    else prepend(s, fx("wastesFlip", { flag: true, player: firstPlayer(s) }));
  } else if (code === W.predatory)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("wastesPredatory", { player })),
    );
  else if (
    ![
      W.blood,
      W.hunting,
      W.white,
      W.wolf,
      W.wastes,
      W.den,
      W.downs,
      W.leader,
      W.time,
      W.amarthiul,
    ].includes(code)
  )
    return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function wastesShadow(s: GameState, code: string) {
  if (!isWastes(s) || !s.combat) return false;
  const c = s.combat;
  if (code === W.northern)
    c.wastesNextPlayerAttacks = (c.wastesNextPlayerAttacks ?? 0) + 1;
  else if (code === W.white) {
    if (wastesIsNight(s))
      c.wastesExtraAttacks = (c.wastesExtraAttacks ?? 0) + 1;
  } else if (code === W.wolf) c.attackBonus += wastesIsNight(s) ? 2 : 1;
  else if (code === W.downs) {
    c.attackBonus++;
    c.wastesRemoveQuestOnKill = (c.wastesRemoveQuestOnKill ?? 0) + 1;
  } else if (code === W.darkness)
    prepend(
      s,
      fx("wastesReturnDiscardWarg", {
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  else if (code === W.predatory)
    prepend(
      s,
      fx("wastesExhaust", {
        count: 1,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  else return false;
  return true;
}
export function wastesEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("wastes")) return false;
  if (!isWastes(s)) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "wastesSetup": {
      if (s.wastesEriador!.initialized) break;
      const t = make(s, W.time),
        a = make(s, W.amarthiul);
      t.flipped = false;
      delete a.owner;
      a.controller = firstPlayer(s);
      s.staging.push(t);
      forOwner(s, firstPlayer(s), () => s.allies.push(a));
      s.activeLocation = make(s, W.hills);
      s.wastesEriador!.initialized = true;
      s.stageRevealing = true;
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        ...playerOrder(s).map(() => fx("reveal", { player: firstPlayer(s) })),
        fx("wastesStageReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "wastesStage": {
      const before = s.queue.length;
      if (e.value === 3) {
        flip(s, true);
        const leader = s.wastesEriador!.setAside.pop();
        if (leader) {
          s.staging.push(leader);
          enemyAddedToStaging(s, leader);
        }
      }
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const added: Unit[] = [];
      let count =
        e.value === 2
          ? playerOrder(s).length
          : Math.max(0, playerOrder(s).length - 1);
      while (count > 0 && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "enemy") {
          const enemy = make(s, code);
          added.push(enemy);
          if (isWarg(enemy)) count--;
        } else s.encounterDiscard.push(code);
      }
      for (const enemy of added) {
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      // Stage setup is one resolving effect. Its newly generated Forced effects
      // remain ahead of the framework, and discarded enemies are never revealed.
      afterGenerated(
        s,
        before,
        fx("wastesStageReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "wastesStageReady":
      s.stageRevealing = false;
      break;
    case "wastesFlip":
      flip(s, !!e.flag);
      break;
    case "wastesAllThreat":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("threat", { value: e.value, player }),
        ),
      );
      break;
    case "wastesReturnEnemies":
      for (const enemy of [...allEngaged(s)]) returnEnemy(s, enemy);
      break;
    case "wastesClearStage":
      s.progress = 0;
      break;
    case "wastesClearCurrentQuest":
      removeCurrentQuestProgress(
        s,
        currentQuestUnit(s)?.progress ?? s.progress,
      );
      break;
    case "wastesBloodAttack":
      if (u) {
        const before = s.queue.length;
        engage(s, u);
        afterGenerated(
          s,
          before,
          fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
        );
      }
      break;
    case "wastesChooseDamage":
      choose(
        s,
        "White Warg · Choose a character you control",
        opts([...s.heroes, ...s.allies], (target) => [
          fx("damage", {
            target: target.id,
            value: e.value,
            player: activeSeat(s),
          }),
        ]),
      );
      break;
    case "wastesDiscardAllies": {
      const targets = ordinaryAllies(s);
      if ((e.count ?? 0) > 0 && targets.length)
        choose(
          s,
          "Howling at Night · Discard a non-objective ally",
          opts(targets, (target) => [
            fx("wastesDiscardAlly", { target: target.id }),
            { ...e, count: (e.count ?? 1) - 1 },
          ]),
        );
      break;
    }
    case "wastesDiscardAlly":
      if (u) discardCharacter(s, u);
      break;
    case "wastesExhaust": {
      const targets = [...s.heroes, ...s.allies].filter((x) => !x.exhausted);
      if ((e.count ?? 0) > 0 && targets.length)
        choose(
          s,
          "Choose a ready character you control to exhaust",
          opts(targets, (target) => [
            fx("exhaust", { target: target.id, player: activeSeat(s) }),
            { ...e, count: (e.count ?? 1) - 1 },
          ]),
        );
      break;
    }
    case "wastesAmarthiulResponse": {
      const a = allCharacters(s).find((x) => x.id === e.source);
      if (a && !a.blanked && ownerOf(s, a) !== e.value)
        choosePlayerResponse(
          s,
          a.id,
          W.amarthiul,
          "Amarthiúl · Follow the engaged enemy?",
          [
            {
              id: "transfer",
              label: `Give control to Player ${(e.value ?? 0) + 1}`,
              effects: [
                fx("wastesAmarthiulTransfer", {
                  target: a.id,
                  value: e.value,
                  player: ownerOf(s, a),
                }),
              ],
            },
            skip,
          ],
          undefined,
          ownerOf(s, a),
        );
      break;
    }
    case "wastesAmarthiulTransfer":
      if (u) {
        forOwner(s, ownerOf(s, u), () => {
          s.allies = s.allies.filter((x) => x.id !== u.id);
        });
        u.controller = e.value;
        delete u.owner;
        forOwner(s, e.value ?? 0, () => s.allies.push(u));
        break;
      }
    case "wastesTravelEngage":
      choose(
        s,
        "Eriador Wastes · Engage a Warg",
        opts(s.staging.filter(isWarg), (target) => [
          fx("wastesEngageAndShadow", {
            target: target.id,
            player: firstPlayer(s),
          }),
        ]),
      );
      break;
    case "wastesEngageAndShadow":
      if (u) {
        engage(s, u);
        drawShadow(s, u);
      }
      break;
    case "wastesSearch":
      choose(
        s,
        "Choose a Warg from the encounter deck or discard pile",
        searchCodes(s).map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [
            fx("wastesSearchReveal", {
              code,
              flag: e.flag,
              player: activeSeat(s),
            }),
          ],
        })),
      );
      break;
    case "wastesSearchReveal": {
      const code = e.code!,
        index = s.encounterDeck.indexOf(code);
      if (index >= 0) s.encounterDeck.splice(index, 1);
      else {
        const discarded = s.encounterDiscard.indexOf(code);
        if (discarded < 0) break;
        s.encounterDiscard.splice(discarded, 1);
      }
      const ids = s.staging.map((x) => x.id),
        before = s.queue.length;
      revealed(s, code);
      afterGenerated(
        s,
        before,
        fx("wastesSearchDone", {
          code,
          ids,
          flag: e.flag,
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "wastesSearchDone": {
      const enemy = s.staging.find(
        (x) => x.code === e.code && !(e.ids ?? []).includes(x.id),
      );
      if (e.flag && enemy) engage(s, enemy);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "wastesShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "wastesPredatory": {
      const allies = s.allies.filter(
        (x) => isAlly(x) && card(x.code).type_code === "ally",
      );
      const cost = Math.max(
          -1,
          ...allies.map((x) => Number(card(x.code).cost) || 0),
        ),
        targets = allies.filter(
          (x) => (Number(card(x.code).cost) || 0) === cost,
        );
      const options: Option[] = [];
      if (targets.length)
        options.push({
          id: "discard",
          label: "Discard your highest-cost ally",
          effects: [
            fx("wastesHighestAlly", {
              ids: targets.map((x) => x.id),
              player: activeSeat(s),
            }),
          ],
        });
      if (searchCodes(s).length)
        options.push({
          id: "search",
          label: "Search for and reveal a Warg enemy",
          effects: [fx("wastesSearch", { player: activeSeat(s) })],
        });
      if (options.length)
        choose(
          s,
          "Predatory Wolves · Discard an ally or reveal a Warg",
          options,
        );
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "wastesHighestAlly": {
      const targets = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x);
      if (targets.length === 1) {
        discardCharacter(s, targets[0]);
        shuffle(s, s.encounterDeck);
      } else if (targets.length)
        choose(
          s,
          "Predatory Wolves · Choose among tied highest-cost allies",
          opts(targets, (target) => [
            fx("wastesDiscardAlly", { target: target.id }),
            fx("wastesShuffle"),
          ]),
        );
      break;
    }
    case "wastesReturnDiscardWarg": {
      let index = -1;
      for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
        if (isWarg({ code: s.encounterDiscard[i] } as Unit)) {
          index = i;
          break;
        }
      if (index >= 0) {
        const enemy = make(s, s.encounterDiscard.splice(index, 1)[0]);
        engage(s, enemy);
        drawShadow(s, enemy);
      }
      break;
    }
    case "wastesNextAttack": {
      if (!u) break;
      const order = playerOrder(s),
        at = order.indexOf(e.value ?? activeSeat(s)),
        player = order[(at + 1) % order.length];
      const before = s.queue.length;
      forOwner(s, player, () => engage(s, u));
      afterGenerated(
        s,
        before,
        fx("immediateAttack", { target: u.id, player }),
      );
      break;
    }
  }
  return true;
}
