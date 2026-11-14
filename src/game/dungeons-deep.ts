import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  damage,
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
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import {
  HOBBIT_BILBO,
  bagginsBilbo,
  hobbitTreasureDefense,
  hobbitTreasureEffect,
  hobbitTreasureKill,
  loseBilbo,
  spendBaggins,
} from "./hobbit-saga";
import { holdTreachery, hobbitResolving, wmaEffect } from "./we-must-away";
import {
  goblinEncounter,
  goblinShadow,
  goblinStats,
  goblinThreat,
  goblinTreachery,
  ommEffect,
} from "./misty-mountains";
import {
  DDCD as D,
  DDCD_QUESTS,
  DDCD_RECIPES,
  RIDDLES,
  RIDDLE_COSTS,
  RIDDLE_SPHERES,
  RIDDLE_TYPES,
  ddcdStageInfo,
  hasRiddle,
  riddleMatch,
  type RiddleItem,
} from "./dungeons-deep-support";
export * from "./dungeons-deep-support";

const typeOf = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code;
const traitOf = (code: string, trait: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === trait);
const isCreature = (u: Unit | string) =>
  typeOf(u) === "enemy" &&
  traitOf(typeof u === "string" ? u : u.code, "Creature");
const players = (s: GameState) => playerOrder(s).length;
const RIDDLE_GOAL = DDCD_QUESTS[1].back_quest ?? 9;
const inRiddle = (s: GameState, u: Unit) =>
  !!s.dungeonsDeep?.bilboInRiddleArea && u.code === HOBBIT_BILBO;
const gollum = (s: GameState) =>
  s.dungeonsDeep?.riddleArea.find((u) => u.code === D.gollum) ??
  allEngaged(s).find((u) => u.code === D.gollum) ??
  s.staging.find((u) => u.code === D.gollum);
/** Riddles are answered in stages 1 and 2; stage 3B ignores them. */
const riddlesActive = (s: GameState) =>
  !!s.dungeonsDeep && s.stage === 1 && !s.stageRevealing;
const livePlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => u.code === code && !u.blanked,
  );
const parseNamed = (text?: string) =>
  Object.fromEntries(
    (text ?? "")
      .split(";")
      .filter(Boolean)
      .map((pair) => pair.split("=") as [RiddleItem, string]),
  ) as Partial<Record<RiddleItem, string>>;
const encodeNamed = (named: Partial<Record<RiddleItem, string>>) =>
  Object.entries(named)
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
const label = (item: RiddleItem, value: string) =>
  item === "cost" ? `Cost ${value}` : value[0].toUpperCase() + value.slice(1);

export function setupDungeonsDeep(s: GameState) {
  const r = DDCD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = shuffle(
    s,
    r.cards
      .filter((c) => c.section === "sharedEncounterDeck")
      .flatMap((c) => Array<string>(c.quantity).fill(c.code)),
  );
  s.staging.push(make(s, D.lake));
  s.dungeonsDeep = {
    currentQuest: D.pan,
    advancing: false,
    riddleProgress: 0,
    riddleArea: [make(s, D.gollum)],
    bilboInRiddleArea: true,
    resolving: [],
    hiding: [],
    wolfReturn: false,
    lastRevealOrigin: null,
  };
  const bilbo = bagginsBilbo(s);
  bilbo?.attachments.push({
    id: `a${s.nextId++}`,
    code: D.ring,
    exhausted: false,
  });
  log(
    s,
    "Out of the Frying Pan: Lake in the Cavern enters the staging area; Gollum and Bilbo Baggins, with Bilbo's Magic Ring, wait in the riddle area beside stage 2.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.dungeonsDeep;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = ddcdStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Players cannot advance to stage 3A unless both 1B and 2B are complete.
  if (s.stage === 1 && q.riddleProgress < RIDDLE_GOAL) return true;
  q.advancing = true;
  prepend(s, fx("ddcdDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
/** Hold an answered enemy or location card while its riddle resolves. */
function holdAnswered(s: GameState, unitId: string) {
  const u = s.staging.find((x) => x.id === unitId);
  if (!u) return undefined;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  s.dungeonsDeep!.resolving.push(u);
  return u;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.dungeonsDeep;
  if (!q) return false;
  const first = firstPlayer(s);
  const answerable =
    hasRiddle(code) &&
    fromReveal &&
    q.lastRevealOrigin === "encounter" &&
    riddlesActive(s);
  q.lastRevealOrigin = null;
  if (goblinEncounter(s, code, replay, fromReveal)) return true;
  if (answerable && typeOf(code) !== "treachery") {
    const u = [...s.staging].reverse().find((x) => x.code === code);
    if (u)
      choose(
        s,
        `${card(code).name} · Answer its riddle or resolve the card normally?`,
        [
          {
            id: "answer",
            label: "Answer the riddle (the card is discarded)",
            effects: [fx("ddcdAnswerUnit", { target: u.id, player: first })],
          },
          {
            id: "resolve",
            label: "Resolve the card normally",
            effects: [],
          },
        ],
        card(code)
          .text?.split("\n")
          .find((l) => l.startsWith("Riddle")),
      );
    return true;
  }
  if (![D.bird, D.likes, D.hiding, D.pocket, D.notFair].includes(code))
    return false;
  holdTreachery(s, code, replay, fromReveal);
  if (answerable) {
    const held = hobbitResolving(s).at(-1)!;
    // Replace the queued normal resolution with the riddle decision.
    const i = s.queue.findIndex(
      (e) => e.kind === "wmaTreachery" && e.source === held.id,
    );
    if (i >= 0) s.queue.splice(i, 1);
    const forced = code === D.likes || code === D.pocket;
    if (forced)
      prepend(s, fx("ddcdAnswer", { code, source: held.id, player: first }));
    else
      choose(
        s,
        `${card(code).name} · Answer its riddle or resolve the card normally?`,
        [
          {
            id: "answer",
            label: "Answer the riddle",
            effects: [
              fx("ddcdAnswer", { code, source: held.id, player: first }),
            ],
          },
          {
            id: "resolve",
            label: "Resolve the card normally",
            effects: [
              fx("wmaTreachery", { code, source: held.id, player: first }),
            ],
          },
        ],
        card(code)
          .text?.split("\n")
          .find((l) => l.startsWith("Riddle")),
      );
  }
  return true;
}
function shadow(s: GameState, code: string) {
  if (!s.combat || !s.dungeonsDeep) return false;
  return goblinShadow(s, code);
}
/** Gollum attacks Bilbo Baggins in the riddle area (no shadow card). */
function gollumAttack(s: GameState, defended: boolean) {
  const g = gollum(s),
    bilbo = bagginsBilbo(s);
  if (!g || !bilbo) return;
  const power = stats(s, g).attack;
  let amount = power;
  if (defended && exhaustCharacter(s, bilbo)) {
    amount = Math.max(0, power - stats(s, bilbo).defense);
    prepend(s, ...hobbitTreasureDefense(s, g, [bilbo]));
  }
  log(
    s,
    `Gollum attacks Bilbo Baggins for ${power}${defended ? " (Bilbo defends)" : " (undefended)"}: ${amount} damage.`,
    "danger",
  );
  if (amount > 0)
    damage(s, bilbo.id, amount, { combatDamage: true, enemyId: g.id });
}
export function ddcdEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("ddcd")) return false;
  const q = s.dungeonsDeep;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    first = firstPlayer(s);
  switch (e.kind) {
    case "ddcdDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("ddcdNextStage", { player: first }));
      break;
    }
    case "ddcdNextStage":
      q.advancing = false;
      if (s.stage === 3) {
        win(
          s,
          "Rescued by the Eagles from the wargs' burning pines, the company escapes the Misty Mountains with Bilbo and his ring.",
        );
        break;
      }
      s.stage = 3;
      q.currentQuest = D.fire;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, "Into the Fire begins.", "chapter");
      prepend(s, fx("ddcdStageThree", { player: first }));
      break;
    case "ddcdStageThree": {
      // Forced: after the players advance to stage 3, remove Lake in the Cavern.
      for (const lake of [...s.staging, ...allActiveLocations(s)].filter(
        (u) => u.code === D.lake,
      )) {
        s.staging = s.staging.filter((u) => u.id !== lake.id);
        if (s.activeLocation?.id === lake.id) s.activeLocation = null;
        (s.removedEncounter ??= []).push(lake.code);
      }
      q.bilboInRiddleArea = false;
      const bilbo = bagginsBilbo(s);
      if (bilbo && ownerOf(s, bilbo) !== first) {
        forOwner(s, ownerOf(s, bilbo), () => {
          s.heroes = s.heroes.filter((u) => u.id !== bilbo.id);
        });
        bilbo.owner = first;
        bilbo.controller = first;
        forOwner(s, first, () => s.heroes.push(bilbo));
      }
      const g = q.riddleArea.splice(0)[0];
      if (g) {
        s.staging.push(g);
        forOwner(s, first, () => engage(s, g));
      }
      s.stageRevealing = false;
      log(
        s,
        "Into the Fire: Bilbo Baggins rejoins the first player and Gollum engages them; riddles are ignored and treacheries gain surge.",
        "danger",
      );
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      break;
    }
    case "ddcdAnswerUnit": {
      const held = holdAnswered(s, e.target!);
      if (held)
        prepend(
          s,
          fx("ddcdAnswer", { code: held.code, source: held.id, player: first }),
        );
      break;
    }
    case "ddcdAnswer": {
      const riddle = RIDDLES[e.code!];
      if (!riddle) break;
      prepend(
        s,
        fx("ddcdName", {
          code: e.code,
          source: e.source,
          text: "",
          flag: e.flag,
          player: first,
        }),
        fx("ddcdDone", { source: e.source, player: first }),
      );
      break;
    }
    case "ddcdName": {
      const riddle = RIDDLES[e.code!];
      const named = parseNamed(e.text);
      const item = riddle.items.find((i) => named[i] === undefined);
      if (!item) {
        prepend(
          s,
          fx("ddcdRing", {
            code: e.code,
            source: e.source,
            text: e.text,
            flag: e.flag,
            player: first,
          }),
        );
        break;
      }
      const values =
        item === "type"
          ? RIDDLE_TYPES
          : item === "sphere"
            ? RIDDLE_SPHERES
            : RIDDLE_COSTS.map(String);
      choose(
        s,
        `${card(e.code!).name} · The first player names a ${item === "type" ? "card type" : item}`,
        values.map((value) => ({
          id: `${item}-${value}`,
          label: label(item, value),
          effects: [
            fx("ddcdName", {
              code: e.code,
              source: e.source,
              text: encodeNamed({ ...named, [item]: value }),
              flag: e.flag,
              player: first,
            }),
          ],
        })),
        card(e.code!)
          .text?.split("\n")
          .find((l) => l.startsWith("Riddle")),
      );
      break;
    }
    case "ddcdRing": {
      const bilbo = bagginsBilbo(s);
      const ring = bilbo?.attachments.find(
        (a) => a.code === D.ring && !a.blanked,
      );
      const max = ring ? (bilbo?.resources ?? 0) : 0;
      const discard = (extra: number) =>
        fx("ddcdDiscard", {
          code: e.code,
          source: e.source,
          text: e.text,
          flag: e.flag,
          value: extra,
          player: first,
        });
      if (!max) {
        prepend(s, discard(0));
        break;
      }
      choose(
        s,
        "Bilbo's Magic Ring · Spend Baggins resources to discard additional cards?",
        Array.from({ length: max + 1 }, (_, x) => ({
          id: `ring-${x}`,
          label: x
            ? `Spend ${x} Baggins resource${x === 1 ? "" : "s"}: discard ${x} more`
            : "Spend nothing",
          effects: [discard(x)],
        })),
      );
      break;
    }
    case "ddcdDiscard": {
      const riddle = RIDDLES[e.code!];
      const named = parseNamed(e.text);
      const extra = e.value ?? 0;
      if (extra) spendBaggins(s, extra);
      let matches = 0;
      const discarded: string[] = [];
      forOwner(s, first, () => {
        shuffle(s, s.deck);
        discarded.push(...s.deck.splice(0, riddle.cards + extra));
        s.discard.push(...discarded);
      });
      matches = discarded.filter((c) => riddleMatch(card(c), named)).length;
      q.riddleProgress += matches;
      const what = Object.entries(named)
        .map(([k, v]) => label(k as RiddleItem, v))
        .join(", ");
      log(
        s,
        `Riddle (${what}): ${discarded.map((c) => card(c).name).join(", ") || "no cards"} — ${matches} match${matches === 1 ? "" : "es"}; stage 2 has ${q.riddleProgress} progress.`,
        matches ? "good" : "danger",
      );
      if (!matches && q.riddleArea.some((u) => u.code === D.gollum))
        prepend(s, fx("ddcdGollum", { player: first }));
      else if (e.code === D.likes && matches && e.flag !== true)
        prepend(s, fx("ddcdLikesChain", { player: first }));
      break;
    }
    case "ddcdLikesChain": {
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (hasRiddle(code)) {
          log(
            s,
            `It Likes Riddles?: ${card(code).name} is discarded; its riddle is answered.`,
          );
          prepend(s, fx("ddcdAnswer", { code, flag: true, player: first }));
          return true;
        }
      }
      log(
        s,
        "It Likes Riddles?: no other riddle remains in the encounter deck.",
      );
      break;
    }
    case "ddcdGollum": {
      const bilbo = bagginsBilbo(s);
      if (!bilbo || !gollum(s)) break;
      if (bilbo.exhausted) {
        gollumAttack(s, false);
        break;
      }
      choose(
        s,
        "Gollum attacks Bilbo Baggins · Defend with Bilbo?",
        [
          {
            id: "defend",
            label: "Bilbo Baggins exhausts to defend",
            effects: [fx("ddcdGollumResolve", { flag: true, player: first })],
          },
          {
            id: "undefended",
            label: "Leave the attack undefended",
            effects: [fx("ddcdGollumResolve", { flag: false, player: first })],
          },
        ],
        "Forced: after the first player answers a riddle and fails to find at least 1 match.",
      );
      break;
    }
    case "ddcdGollumResolve":
      gollumAttack(s, !!e.flag);
      break;
    case "ddcdDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      break;
    }
    case "ddcdBird": {
      const options = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter((c) =>
            isCreature(c),
          ),
        ),
      ];
      if (!options.length) break;
      choose(
        s,
        "Come down little bird · Put a Creature enemy into play engaged with you",
        options.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("ddcdBirdTake", { code, player: p })],
        })),
      );
      break;
    }
    case "ddcdBirdTake": {
      const fromDeck = s.encounterDeck.indexOf(e.code!);
      if (fromDeck >= 0) s.encounterDeck.splice(fromDeck, 1);
      else {
        const i = s.encounterDiscard.lastIndexOf(e.code!);
        if (i < 0) break;
        s.encounterDiscard.splice(i, 1);
      }
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      forOwner(s, p, () => engage(s, enemy));
      break;
    }
    case "ddcdShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "ddcdNotFair":
      choose(
        s,
        "Not fair! Not fair! · The first player names a card type",
        ["enemy", "location", "treachery", "objective"].map((type) => ({
          id: type,
          label: type[0].toUpperCase() + type.slice(1),
          effects: [fx("ddcdNotFairDiscard", { text: type, player: first })],
        })),
        "Each of the top 3 encounter cards that does not match removes 1 progress from stage 2.",
      );
      break;
    case "ddcdNotFairDiscard": {
      const discarded = s.encounterDeck.splice(0, 3);
      s.encounterDiscard.push(...discarded);
      const misses = discarded.filter((c) => typeOf(c) !== e.text).length;
      const removed = Math.min(misses, q.riddleProgress);
      q.riddleProgress -= removed;
      log(
        s,
        `Not fair! Not fair! (${e.text}): ${discarded.map((c) => card(c).name).join(", ")} — ${removed} progress removed from stage 2.`,
        "danger",
      );
      break;
    }
    case "ddcdRingAction": {
      const bilbo = bagginsBilbo(s);
      const ring = bilbo?.attachments.find((a) => a.code === D.ring);
      if (!bilbo || !ring || ring.exhausted) break;
      ring.exhausted = true;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      bilbo.resources++;
      log(
        s,
        "Bilbo's Magic Ring: each player raises their threat by 2 and Bilbo Baggins gains 1 Baggins resource.",
      );
      break;
    }
    case "ddcdRoundEnd":
      q.hiding = q.hiding.filter((r) => r > s.round);
      break;
    default:
      return false;
  }
  return true;
}
/** Treacheries resolved normally (not answered). */
function ddcdTreachery(s: GameState, e: Effect) {
  if (e.kind !== "wmaTreachery" || !s.dungeonsDeep) return false;
  const held = hobbitResolving(s).find((x) => x.id === e.source);
  if (!held) return false;
  const q = s.dungeonsDeep;
  switch (held.code) {
    case D.bird:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("ddcdBird", { player })),
        fx("ddcdShuffle", { player: firstPlayer(s) }),
      );
      return true;
    case D.hiding:
      if (!q.hiding.includes(s.round)) q.hiding.push(s.round);
      log(
        s,
        "Hiding in the Trees: characters get -1 willpower and cannot attack until the end of the round.",
        "danger",
      );
      return true;
    case D.notFair:
      prepend(s, fx("ddcdNotFair", { player: firstPlayer(s) }));
      return true;
    case D.likes:
    case D.pocket:
      // With riddles ignored their When Revealed effects do nothing.
      return true;
  }
  return false;
}
function ringProblem(s: GameState, u: Unit, attachmentId?: string) {
  const ring = u.attachments.find(
    (a) => a.id === attachmentId && a.code === D.ring,
  );
  if (!ring) return "No action.";
  if (ring.exhausted) return "Bilbo's Magic Ring is exhausted.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "Only the player who controls Bilbo Baggins can use the ring.";
  return null;
}
export const DDCD_HOOKS: Batch4ScenarioHooks = {
  setup: setupDungeonsDeep,
  advance,
  stageInfo: ddcdStageInfo,
  travelProblem: (s, u) =>
    s.dungeonsDeep && u.code === D.lake
      ? "Players cannot travel to Lake in the Cavern."
      : null,
  immune: (s, u) =>
    !!s.dungeonsDeep && ((u.code === D.lake && !u.blanked) || inRiddle(s, u)),
  threatBonus: (s, u) => {
    if (!s.dungeonsDeep || u.blanked) return 0;
    return (u.code === D.lake ? 2 * players(s) : 0) + goblinThreat(s, u);
  },
  stats: (s, u) => {
    const goblin = goblinStats(s, u);
    const character = ["hero", "ally"].includes(typeOf(u));
    return {
      ...goblin,
      attack:
        (goblin.attack ?? 0) +
        (u.code === D.wargs && !u.blanked && u.shadows.some((c) => hasRiddle(c))
          ? 2
          : 0),
      will: character && s.dungeonsDeep?.hiding.includes(s.round) ? -1 : 0,
    };
  },
  cannotAttack: (s, character) =>
    !!s.dungeonsDeep &&
    (inRiddle(s, character) || s.dungeonsDeep.hiding.includes(s.round)),
  cannotDefend: (s, enemy, defender) =>
    !!defender && inRiddle(s, defender) && enemy.code !== D.gollum,
  cannotCommit: (s, u) => inRiddle(s, u),
  cannotAttach: (s, u, code) =>
    inRiddle(s, u) && card(code).sphere_code !== "encounter",
  damageAmount: (s, u, amount, ctx) =>
    inRiddle(s, u) && ctx.enemyId !== gollum(s)?.id ? 0 : amount,
  cannotEngage: (s, u) =>
    !!s.dungeonsDeep?.riddleArea.some((x) => x.id === u.id),
  cannotCancel: (s, _shadow, code) =>
    !!s.dungeonsDeep && (code === D.notFair || code === D.pocket),
  extraStagingReveals: (s) =>
    s.dungeonsDeep && s.stage === 1 && !s.stageRevealing ? players(s) : 0,
  revealed: (s, _code, revealOrigin) => {
    if (s.dungeonsDeep)
      s.dungeonsDeep.lastRevealOrigin = revealOrigin ?? "encounter";
  },
  revealedSurge: (s, code) =>
    !!s.dungeonsDeep &&
    s.stage === 3 &&
    !s.stageRevealing &&
    typeOf(code) === "treachery",
  shadowDealt: (s, enemy, code) => {
    if (
      s.dungeonsDeep &&
      enemy.code === D.wolf &&
      !enemy.blanked &&
      hasRiddle(code)
    )
      s.dungeonsDeep.wolfReturn = true;
  },
  combatEnd: (s) => {
    const q = s.dungeonsDeep;
    if (!q || !q.wolfReturn) return;
    q.wolfReturn = false;
    for (const enemy of allEngaged(s).filter((u) => isCreature(u))) {
      forOwner(s, ownerOf(s, enemy), () => {
        s.engaged = s.engaged.filter((x) => x.id !== enemy.id);
      });
      s.encounterDiscard.push(...enemy.shadows);
      enemy.shadows = [];
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
    }
    log(
      s,
      "Great Gray Wolf: every Creature enemy returns to the staging area.",
      "danger",
    );
  },
  enemyAttackStarted: (s, u) => {
    // Into the Fire: undefended damage from Gollum must be placed on Bilbo.
    const bilbo = bagginsBilbo(s);
    if (s.dungeonsDeep && s.combat && u.code === D.gollum && bilbo)
      s.combat.undefendedTargetId = bilbo.id;
  },
  damageDealt: (s, u, amount, ctx) => {
    if (!s.dungeonsDeep || !ctx.combatDamage || !ctx.enemyId || amount <= 0)
      return;
    if (!["hero", "ally"].includes(typeOf(u))) return;
    const enemy = get(s, ctx.enemyId);
    if (!enemy || !isCreature(enemy) || enemy.blanked) return;
    const glades = livePlay(s, D.glade).length;
    if (glades && s.progress > 0) {
      const removed = Math.min(glades, s.progress);
      s.progress -= removed;
      log(
        s,
        `The Wargs' Glade removes ${removed} progress from the quest.`,
        "danger",
      );
    }
  },
  defendersDeclared: (s, enemy, defenders) =>
    hobbitTreasureDefense(s, enemy, defenders),
  playerAttackResolved: (s, enemy, ids, amount, remainingHealth) =>
    prepend(s, ...hobbitTreasureKill(s, enemy, ids, amount, remainingHealth)),
  roundEnd: (s) =>
    s.dungeonsDeep ? [fx("ddcdRoundEnd", { player: firstPlayer(s) })] : [],
  characterLeft: (s, u) => {
    if (u.code === HOBBIT_BILBO) loseBilbo(s);
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  abilityLabel: (code) =>
    code === D.ring
      ? "Exhaust Bilbo's Magic Ring: raise each threat by 2, Bilbo gains 1 Baggins resource"
      : undefined,
  abilityProblem: (s, u, attachmentId) => ringProblem(s, u, attachmentId),
  ability: (s, u, attachmentId) => {
    if (ringProblem(s, u, attachmentId)) return false;
    prepend(s, fx("ddcdRingAction", { player: firstPlayer(s) }));
    return true;
  },
  encounter,
  shadow,
  effect: (s, e) =>
    ddcdTreachery(s, e) ||
    goblinTreachery(s, e) ||
    ddcdEffect(s, e) ||
    ommEffect(s, e) ||
    hobbitTreasureEffect(s, e) ||
    wmaEffect(s, e),
  sharedEffect: (e) =>
    [
      "ddcdDefeatQuest",
      "ddcdNextStage",
      "ddcdStageThree",
      "ddcdAnswerUnit",
      "ddcdAnswer",
      "ddcdName",
      "ddcdRing",
      "ddcdDiscard",
      "ddcdLikesChain",
      "ddcdGollum",
      "ddcdGollumResolve",
      "ddcdDone",
      "ddcdShuffle",
      "ddcdNotFair",
      "ddcdNotFairDiscard",
      "ddcdRingAction",
      "ddcdRoundEnd",
    ].includes(e.kind),
};
