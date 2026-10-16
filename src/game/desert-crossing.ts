import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, units } from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardLocation,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
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
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { rhosgobelHeal } from "./rhosgobel";
import {
  DESERT_CROSSING as D,
  DESERT_CROSSING_MAIN_QUESTS,
  DESERT_CROSSING_RECIPES,
  desertCrossingTens as tens,
} from "./desert-crossing-support";

const live = (s: GameState) => !!s.desertCrossing;
const activeStage = (s: GameState, stage: number) =>
  live(s) && s.stage === stage && !mainQuestUnit(s)?.blanked;
const own = (s: GameState, player: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === player);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const creature = (u: Unit) =>
  (card(u.code).traits ?? "").split(".").some((x) => x.trim() === "Creature");
const sideLive = (s: GameState, code: string) =>
  live(s) && s.staging.some((u) => u.code === code && !u.blanked);
const printedCost = (code: string) => {
  const n = Number(card(code).cost);
  return Number.isFinite(n) ? n : 0;
};

export function setupDesertCrossing(s: GameState) {
  const recipe = DESERT_CROSSING_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  // Four Burnt Sands are a recipe convenience for the setup search. Return all
  // four to the physical deck, then remove exactly one per participating player.
  s.encounterDeck = recipe.cards
    .filter((c) =>
      ["sharedEncounterDeck", "sharedStagingArea"].includes(c.section),
    )
    .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.desertCrossing = {
    initialized: false,
    advancing: false,
    currentQuest: D.desert,
    questDeck: DESERT_CROSSING_MAIN_QUESTS.slice(1),
    completedQuests: [],
    temperature: 10,
    resolving: [],
    poisoned: [],
  };
}
export function desertCrossingOpeningHandsKept(s: GameState) {
  if (!s.desertCrossing || s.desertCrossing.initialized) return false;
  prepend(s, fx("desertSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function desertCrossingCheck(s: GameState) {
  if (
    !s.desertCrossing ||
    s.status !== "playing" ||
    s.desertCrossing.temperature < 60
  )
    return;
  s.status = "lost";
  s.reason =
    "The temperature reaches 60. The fellowship perishes in the desert.";
  s.queue = [];
  s.choice = null;
  if (s.flow) s.flow.pending = null;
  log(s, s.reason, "danger");
}
function heat(s: GameState, amount: number) {
  if (!s.desertCrossing) return;
  s.desertCrossing.temperature = Math.max(
    0,
    s.desertCrossing.temperature + amount,
  );
  log(
    s,
    `Temperature ${amount < 0 ? "falls" : "rises"} to ${s.desertCrossing.temperature}.`,
    amount < 0 ? "good" : "danger",
  );
  desertCrossingCheck(s);
}
export function desertCrossingAdvance(s: GameState) {
  const q = s.desertCrossing;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  const goal = [8, 14, 16][s.stage - 1];
  if (
    s.progress < goal ||
    (activeStage(s, 3) && enemies(s).some((u) => u.code === D.worm))
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 3) {
    win(s);
    s.reason =
      "The Were-worms are defeated and the fellowship crosses the desert.";
  } else {
    q.advancing = true;
    prepend(s, fx("desertAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function desertCrossingStats(s: GameState, u: Unit) {
  if (!live(s)) return { attack: 0, defense: 0 };
  return {
    attack:
      (u.code === D.worm && !u.blanked ? tens(s) : 0) +
      (creature(u)
        ? s.staging.filter((l) => l.code === D.wadi && !l.blanked).length
        : 0),
    defense: u.code === D.worm && !u.blanked ? tens(s) : 0,
  };
}
export function desertCrossingThreatBonus(s: GameState, u: Unit) {
  if (!live(s)) return 0;
  return (
    ([D.worm, D.hamada].includes(u.code) && !u.blanked ? tens(s) : 0) +
    (u.code === D.sands && !u.blanked && s.desertCrossing!.temperature >= 40
      ? 2
      : 0) +
    (creature(u)
      ? s.staging.filter((l) => l.code === D.wadi && !l.blanked).length
      : 0)
  );
}
export const desertCrossingStagingThreat = (s: GameState) =>
  activeStage(s, 3) && ["quest", "staging"].includes(s.phase) ? tens(s) : 0;
export function desertCrossingEngagementBonus(s: GameState, u: Unit) {
  return live(s) && u.code === D.bird && !u.blanked
    ? -allCharacters(s).filter((c) => c.damage > 0).length
    : 0;
}
export const desertCrossingCannotDefend = (s: GameState, enemy: Unit) =>
  live(s) && enemy.code === D.viper && !enemy.blanked;
export const desertCrossingCannotReady = (s: GameState, u: Unit) =>
  !!s.desertCrossing?.poisoned.some(
    (p) => p.id === u.id && p.round === s.round,
  );
export const desertCrossingCannotPlayerReady = (s: GameState) =>
  sideLive(s, D.water) ||
  (!!s.raceHarad && s.staging.some((q) => q.code === D.water && !q.blanked));
export const desertCrossingCharacterBlanked = (s: GameState, u: Unit) =>
  u.damage > 0 &&
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code) &&
  sideLive(s, D.remedy);
export const desertCrossingLocationProgressBlocked = (s: GameState, u: Unit) =>
  u.code !== D.dunes &&
  card(u.code).type_code === "location" &&
  s.staging.some((l) => l.id === u.id) &&
  sideLive(s, D.dunes);
export function desertCrossingEngaged(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return;
  if (u.code === D.worm)
    prepend(
      s,
      fx("immediateAttack", {
        target: u.id,
        player: ownerOf(s, u),
        text: "desert-no-shadow",
      }),
    );
  if (u.code === D.bird)
    prepend(s, fx("desertBird", { player: ownerOf(s, u) }));
}
export function desertCrossingAllyEntered(
  s: GameState,
  u: Unit,
  played = false,
  fromHand = false,
) {
  if (!activeStage(s, 1) || card(u.code).type_code !== "ally") return false;
  prepend(
    s,
    fx("desertAllyHeat", { target: u.id, player: ownerOf(s, u) }),
    fx("allyEntryResponses", {
      target: u.id,
      flag: played,
      value: fromHand ? 1 : 0,
      text: "desert-resolved",
      player: ownerOf(s, u),
    }),
  );
  return true;
}
/** Any entry as active resolves these passives; only actual travel draws Vipers. */
export function desertCrossingTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel = true,
) {
  if (!live(s)) return;
  const effects: Effect[] = [];
  if (!u.blanked) {
    if (u.code === D.sands) effects.push(fx("desertHeat", { value: 2 }));
    if (u.code === D.hamada)
      effects.push(
        fx("desertAssignDamage", {
          value: tens(s),
          text: "Scorched Hamada",
          player: firstPlayer(s),
          flag: true,
        }),
      );
    if (u.code === D.wadi)
      effects.push(fx("desertWadi", { player: firstPlayer(s) }));
    if (u.code === D.dunes)
      effects.push(fx("reveal", { player: firstPlayer(s) }));
    if (u.code === D.oasis)
      effects.push(
        ...playerOrder(s).map((player) =>
          fx("desertExhaust", { player, text: "Desert Oasis" }),
        ),
      );
  }
  if (actualTravel)
    effects.push(
      ...enemies(s)
        .filter(
          (e) =>
            e.code === D.viper &&
            !e.blanked &&
            !(
              allEngaged(s).some((x) => x.id === e.id) &&
              ownerOf(s, e) === firstPlayer(s)
            ),
        )
        .map((e) =>
          fx("desertViperEngage", { target: e.id, player: firstPlayer(s) }),
        ),
    );
  prepend(s, ...effects);
}
export function desertCrossingExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  if (live(s) && wasActive && u.code === D.oasis && !u.blanked)
    prepend(s, fx("desertOasisResponse", { player: firstPlayer(s) }));
}
export function desertCrossingSideDefeated(s: GameState, u: Unit) {
  if (!live(s) || u.blanked) return;
  const kind =
    u.code === D.shade
      ? "desertShadeResponse"
      : u.code === D.water
        ? "desertWaterResponse"
        : u.code === D.remedy
          ? "desertRemedyResponse"
          : undefined;
  if (kind) prepend(s, fx(kind, { player: firstPlayer(s) }));
}
export function desertCrossingRoundEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  const ids = [
    ...(mainQuestUnit(s)?.blanked ? [] : ["heat"]),
    ...s.staging
      .filter((q) => q.code === D.shade && !q.blanked)
      .map((q) => q.id),
  ];
  return ids.length
    ? [fx("desertRoundEnd", { ids, player: firstPlayer(s) })]
    : [];
}
export function desertCrossingDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (
    !live(s) ||
    amount <= 0 ||
    !context.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const enemy = get(s, context.enemyId);
  const c = s.combat as
    | (NonNullable<GameState["combat"]> & { desertPoisonShadow?: boolean })
    | null;
  const poison = (target: Unit) => {
    const q = s.desertCrossing!;
    q.poisoned = q.poisoned.filter((p) => p.id !== target.id);
    q.poisoned.push({ id: target.id, round: s.round });
    log(
      s,
      `${name(target)} cannot ready until the end of this round.`,
      "danger",
    );
  };
  if (enemy?.code === D.scorpion && !enemy.blanked) poison(u);
  // The shadow names the defender, even when a replacement redirects the
  // attack's actual damage to another character.
  if (
    context.combatDamage &&
    c?.enemyId === context.enemyId &&
    c.desertPoisonShadow
  )
    for (const id of c.defenderIds?.length
      ? c.defenderIds
      : c.defenderId
        ? [c.defenderId]
        : []) {
      const defender = get(s, id);
      if (defender) poison(defender);
    }
}
export function desertCrossingEncounter(
  s: GameState,
  code: string,
  replay = false,
) {
  if (!live(s)) return false;
  const kind =
    code === D.mirage
      ? "desertMirage"
      : code === D.heat
        ? "desertAllHeatDamage"
        : code === D.scorch
          ? "desertHeat"
          : code === D.sandstorm
            ? "desertSandstormAll"
            : code === D.exhaustion
              ? "desertExhaustAll"
              : undefined;
  if (!kind) return false;
  if (!replay) {
    if (code === D.mirage) s.desertCrossing!.resolving.push(code);
    else s.encounterDiscard.push(code);
  }
  prepend(
    s,
    fx(kind, { code, value: 4, player: firstPlayer(s), flag: replay }),
    ...(code === D.mirage && !replay
      ? [fx("desertFinishMirage", { code })]
      : []),
  );
  return true;
}
export function desertCrossingShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  const c = s.combat as NonNullable<GameState["combat"]> & {
      desertPoisonShadow?: boolean;
    },
    player = c.attackPlayer ?? activeSeat(s);
  if (code === D.worm)
    c.attackBonus += s.desertCrossing!.temperature >= 40 ? 2 : 1;
  else if (code === D.heat) c.attackBonus += tens(s);
  else if (code === D.hamada)
    prepend(s, fx("threat", { value: tens(s), player }));
  else if (code === D.scorpion) c.desertPoisonShadow = true;
  else if (code === D.exhaustion)
    prepend(s, fx("desertExhaust", { player, text: "Heat Exhaustion" }));
  else if (code === D.sandstorm)
    prepend(s, fx("desertSandstormShadow", { player }));
  else if (code === D.scorch)
    choose(s, "Scorching Sun · Choose a shadow effect", [
      {
        id: "heat",
        label: "Increase the temperature by 2",
        effects: [fx("desertHeat", { value: 2 })],
      },
      {
        id: "return",
        label: "Return attacking enemy to staging after this attack",
        effects: [fx("desertReturnAfterAttack")],
      },
    ]);
  else return false;
  return true;
}
export const desertCrossingSharedEffect = (e: Effect) =>
  e.kind.startsWith("desert") &&
  [
    "desertHeat",
    "desertRoundEnd",
    "desertEndRoundHeat",
    "desertAdvance",
    "desertStageReady",
    "desertSetup",
    "desertFinishMirage",
  ].includes(e.kind);

function shuffleDiscard(s: GameState) {
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
}
function discardUntil(s: GameState, match: (code: string) => boolean) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (match(code)) return code;
    s.encounterDiscard.push(code);
  }
  return undefined;
}
function wormOptions(s: GameState, player: number) {
  return (["deck", "discard", "victory"] as const).flatMap((pile) => {
    const cards =
      pile === "deck"
        ? s.encounterDeck
        : pile === "discard"
          ? s.encounterDiscard
          : (s.victoryCards ?? []);
    const i = cards.indexOf(D.worm);
    return i < 0
      ? []
      : [
          {
            id: pile,
            code: D.worm,
            label: `Were-worm · ${pile === "victory" ? "victory display" : `encounter ${pile}`}`,
            effects: [fx("desertTakeWorm", { text: pile, value: i, player })],
          },
        ];
  });
}
export function desertCrossingEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("desert")) return false;
  const q = s.desertCrossing!;
  if (
    !q &&
    ![
      "desertExhaustAll",
      "desertExhaust",
      "desertExhaustChosen",
      "desertSandstormAll",
      "desertSandstorm",
      "desertDiscardHand",
      "desertSandstormShadow",
      "desertDiscardAttachment",
      "desertAssignDamage",
      "desertOasisResponse",
      "desertHealAmong",
      "desertHealOne",
      "desertWaterResponse",
      "desertReadyHero",
      "desertReadyChosen",
      "desertRemedyResponse",
      "desertRemedyHeal",
    ].includes(e.kind)
  )
    return true;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "desertSetup":
      for (const _player of playerOrder(s)) {
        const i = s.encounterDeck.indexOf(D.sands);
        if (i >= 0) s.staging.push(make(s, s.encounterDeck.splice(i, 1)[0]));
      }
      shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    case "desertHeat":
      heat(s, e.value ?? 0);
      break;
    case "desertAdvance": {
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      s.stageRevealing = true;
      heat(s, 2);
      if (s.status !== "playing") break;
      if (s.stage === 2) {
        shuffleDiscard(s);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("reveal", { player })),
          fx("desertStageReady"),
        );
      } else
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("desertSearchWorm", { player })),
          fx("desertShuffleDeck"),
          fx("desertStageReady"),
        );
      break;
    }
    case "desertStageReady":
      q.advancing = false;
      s.stageRevealing = false;
      break;
    case "desertShuffleDeck":
      shuffle(s, s.encounterDeck);
      break;
    case "desertSearchWorm": {
      const options = wormOptions(s, player);
      if (options.length)
        choose(s, `${seatName(s, player)} · Search for a Were-worm`, options);
      break;
    }
    case "desertTakeWorm": {
      const pile =
          e.text === "deck"
            ? s.encounterDeck
            : e.text === "discard"
              ? s.encounterDiscard
              : (s.victoryCards ??= []),
        index = pile.indexOf(D.worm);
      if (index >= 0) {
        pile.splice(index, 1);
        if (e.text === "victory")
          s.victory = Math.max(0, s.victory - (card(D.worm).victory ?? 0));
        const enemy = make(s, D.worm);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "desertAllyHeat":
      if (u)
        choose(
          s,
          "The Desert of Harad · Exhaust the ally or deal it 1 damage",
          [
            ...(!u.exhausted
              ? [
                  {
                    id: "exhaust",
                    label: `Exhaust ${name(u)}`,
                    effects: [fx("exhaust", { target: u.id, player })],
                  },
                ]
              : []),
            {
              id: "damage",
              label: `Deal 1 damage to ${name(u)}`,
              effects: [fx("damage", { target: u.id, value: 1, player })],
            },
          ],
        );
      break;
    case "desertAssignDamage": {
      const chars = e.flag ? allCharacters(s) : own(s, player),
        left = e.value ?? 0;
      if (left > 0 && chars.length)
        choose(
          s,
          `${e.text ?? "Desert heat"} · Assign ${left} damage`,
          chars.map((c) => ({
            id: c.id,
            code: c.code,
            label: `Deal 1 damage to ${name(c)}`,
            effects: [
              fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
              { ...e, value: left - 1 },
            ],
          })),
        );
      break;
    }
    case "desertAllHeatDamage":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("desertAssignDamage", {
            player,
            value: tens(s),
            text: e.text ?? "Unbearable Heat",
          }),
        ),
      );
      break;
    case "desertBird": {
      const options = own(s, player)
        .filter((c) => c.damage > 0)
        .map((c) => ({
          id: c.id,
          code: c.code,
          label: `Discard ${name(c)}`,
          effects: [fx("desertDiscardCharacter", { target: c.id, player })],
        }));
      if (options.length)
        choose(s, "Carrion Bird · Discard a damaged character", options);
      break;
    }
    case "desertDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "desertViperEngage":
      if (u) forOwner(s, player, () => engage(s, u));
      break;
    case "desertWadi": {
      shuffleDiscard(s);
      const code = discardUntil(
        s,
        (code) =>
          card(code).type_code === "enemy" && creature({ code } as Unit),
      );
      if (code) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "desertMirage": {
      const old = s.activeLocation;
      if (old) discardLocation(s, old);
      shuffleDiscard(s);
      const code = discardUntil(
        s,
        (code) => card(code).type_code === "location",
      );
      if (code) {
        const location = make(s, code);
        s.activeLocation = location;
        desertCrossingTravelEntered(s, location, false);
      }
      break;
    }
    case "desertFinishMirage": {
      const i = q.resolving.indexOf(D.mirage);
      if (i >= 0) {
        q.resolving.splice(i, 1);
        s.encounterDiscard.push(D.mirage);
      }
      break;
    }
    case "desertExhaustAll":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("desertExhaust", { player, flag: true, text: "Heat Exhaustion" }),
        ),
      );
      break;
    case "desertExhaust": {
      const choices = own(s, player)
        .filter((c) => e.flag || !c.exhausted)
        .map((c) => ({
          id: c.id,
          code: c.code,
          label: `Exhaust ${name(c)}${e.flag ? " and deal it 1 damage" : ""}`,
          effects: [
            fx("desertExhaustChosen", { target: c.id, player, flag: e.flag }),
          ],
        }));
      // The damage instruction still resolves if the chosen character is
      // already exhausted; this is an effect, rather than an exhaustion cost.
      if (choices.length)
        choose(s, `${e.text ?? "Desert"} · Exhaust a character`, choices);
      break;
    }
    case "desertExhaustChosen":
      if (u) {
        exhaustCharacter(s, u);
        if (e.flag)
          prepend(s, fx("damage", { target: u.id, value: 1, player }));
      }
      break;
    case "desertSandstormAll":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("desertSandstorm", { player })),
      );
      break;
    case "desertSandstorm": {
      const count = seatView(s, player).hand.length;
      choose(s, `${seatName(s, player)} · Sandstorm`, [
        {
          id: "hand",
          label: `Discard your hand (${count})`,
          effects: [fx("desertDiscardHand", { player })],
        },
        {
          id: "damage",
          label: `Assign ${count} damage among your characters`,
          effects: [
            fx("desertAssignDamage", {
              player,
              value: count,
              text: "Sandstorm",
            }),
          ],
        },
      ]);
      break;
    }
    case "desertDiscardHand":
      forOwner(s, player, () => {
        for (const c of [...s.hand]) discardHandCard(s, c.id);
      });
      break;
    case "desertSandstormShadow": {
      const hosts = [...units(s), ...allQuestUnits(s)];
      const attached = hosts.flatMap((host) =>
          host.attachments
            .filter((a) => (a.owner ?? ownerOf(s, host)) === player)
            .map((a) => ({ host, a })),
        ),
        highest = Math.max(0, ...attached.map(({ a }) => printedCost(a.code)));
      choose(
        s,
        "Sandstorm · Discard the highest cost attachment or assign damage",
        [
          ...attached
            .filter(({ a }) => printedCost(a.code) === highest)
            .map(({ host, a }) => ({
              id: a.id,
              code: a.code,
              label: `Discard ${card(a.code).name} (cost ${highest})`,
              effects: [
                fx("desertDiscardAttachment", {
                  target: host.id,
                  source: a.id,
                  player,
                }),
              ],
            })),
          {
            id: "damage",
            label: `Assign ${attached.length} damage among your characters`,
            effects: [
              fx("desertAssignDamage", {
                player,
                value: attached.length,
                text: "Sandstorm",
              }),
            ],
          },
        ],
      );
      break;
    }
    case "desertDiscardAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      break;
    }
    case "desertReturnAfterAttack":
      if (s.combat) s.combat.returnToStaging = true;
      break;
    case "desertRoundEnd": {
      const ids = e.ids ?? [];
      if (!ids.length) break;
      const options = ids.map((id) => ({
        id,
        label:
          id === "heat"
            ? "Main quest · Increase temperature by 4"
            : "Seek Shade · Remove progress",
        effects: [
          id === "heat"
            ? fx("desertEndRoundHeat", { player })
            : fx("desertShadeRemove", { target: id }),
          { ...e, ids: ids.filter((v) => v !== id) },
        ],
      }));
      if (options.length === 1) prepend(s, ...options[0].effects);
      else choose(s, "End of round · Choose the next forced effect", options);
      break;
    }
    case "desertEndRoundHeat":
      heat(s, 4);
      if (s.status === "playing" && activeStage(s, 2))
        prepend(
          s,
          fx("desertAllHeatDamage", { text: "Under the Merciless Sun" }),
        );
      break;
    case "desertShadeRemove":
      if (u && !u.blanked) {
        const amount = Math.min(s.progress, tens(s));
        s.progress -= amount;
        log(
          s,
          `Seek Shade removes ${amount} progress from the main quest.`,
          "danger",
        );
      }
      break;
    case "desertOasisResponse":
      choose(s, "Desert Oasis · Heal 4 damage among characters in play?", [
        {
          id: "heal",
          label: "Heal up to 4 damage",
          effects: [fx("desertHealAmong", { value: 4, player })],
        },
        { id: "skip", label: "Skip response", effects: [] },
      ]);
      break;
    case "desertHealAmong": {
      const choices = allCharacters(s)
        .filter((c) => c.damage > 0)
        .map((c) => ({
          id: c.id,
          code: c.code,
          label: `Heal 1 damage from ${name(c)}`,
          effects: [
            fx("desertHealOne", { target: c.id, player: ownerOf(s, c) }),
            { ...e, value: (e.value ?? 0) - 1 },
          ],
        }));
      if ((e.value ?? 0) > 0 && choices.length)
        choose(s, `Desert Oasis · Heal ${e.value} remaining damage`, choices);
      break;
    }
    case "desertHealOne":
      if (u) rhosgobelHeal(s, u, 1, { code: D.oasis, player });
      break;
    case "desertShadeResponse":
      choose(s, "Seek Shade · Reduce the temperature by 10?", [
        {
          id: "reduce",
          label: "Reduce the temperature by 10",
          effects: [fx("desertHeat", { value: -10 })],
        },
        { id: "skip", label: "Skip response", effects: [] },
      ]);
      break;
    case "desertWaterResponse":
      choose(s, "Find Water · Each player readies 1 hero?", [
        {
          id: "ready",
          label: "Ready 1 hero per player",
          effects: playerOrder(s).map((player) =>
            fx("desertReadyHero", { player }),
          ),
        },
        { id: "skip", label: "Skip response", effects: [] },
      ]);
      break;
    case "desertReadyHero": {
      const choices = own(s, player)
        .filter(
          (h) =>
            card(h.code).type_code === "hero" &&
            h.exhausted &&
            !desertCrossingCannotReady(s, h),
        )
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: `Ready ${name(h)}`,
          effects: [fx("desertReadyChosen", { target: h.id, player })],
        }));
      if (choices.length)
        choose(s, `${seatName(s, player)} · Ready 1 hero`, choices);
      break;
    }
    case "desertReadyChosen":
      if (u) readyCharacter(s, u, false);
      break;
    case "desertRemedyResponse":
      choose(s, "Craft Remedy · Heal 1 damage from each character?", [
        {
          id: "heal",
          label: "Heal each character",
          effects: [fx("desertRemedyHeal")],
        },
        { id: "skip", label: "Skip response", effects: [] },
      ]);
      break;
    case "desertRemedyHeal":
      for (const c of allCharacters(s))
        rhosgobelHeal(s, c, 1, { code: D.remedy, player: ownerOf(s, c) });
      break;
    default:
      return false;
  }
  return true;
}
