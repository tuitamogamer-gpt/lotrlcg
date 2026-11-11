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
  discardCharacter,
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
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  HOBBIT_BILBO,
  HOBBIT_TREASURES,
  bagginsBilbo,
  hobbitTreasureDefense,
  hobbitTreasureEffect,
  hobbitTreasureKill,
  loseBilbo,
  spendBaggins,
} from "./hobbit-saga";
import {
  holdTreachery,
  hobbitResolving,
  westernAttackFinished,
  westernAttackStarted,
  westernDamageDealt,
  westernEncounter,
  westernExplored,
  westernLocationProgress,
  westernRoundEnd,
  westernShadow,
  wmaEffect,
} from "./we-must-away";
import {
  OMM as O,
  OMM_QUESTS,
  OMM_RECIPES,
  ommPhase,
  ommStageInfo,
  ommTrait,
} from "./misty-mountains-support";
export * from "./misty-mountains-support";

type Combat = NonNullable<GameState["combat"]>;
const typeOf = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code;
const isGoblin = (u: Unit | string) =>
  typeOf(u) === "enemy" && ommTrait(u, "Goblin");
const isGiant = (u: Unit) => typeOf(u) === "enemy" && ommTrait(u, "Giant");
const players = (s: GameState) => playerOrder(s).length;
const greatGoblinDefeated = (s: GameState) =>
  !!s.victoryCards?.includes(O.greatGoblin);
/** "Cave location in play": the staging area and the active location. */
const hasTraitText = (u: Unit, trait: string) =>
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === trait);
const caves = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => typeOf(u) === "location" && hasTraitText(u, "Cave"),
  ).length;
/** The Misty Mountain Goblins set appears in two Hobbit scenarios. */
export const goblinActive = (s: GameState) =>
  !!s.mistyMountains || !!s.dungeonsDeep;
const GOBLIN_EFFECTS = [
  "ommExhaustOwn",
  "ommExhaust",
  "ommSpreadDamage",
  "ommGrip",
  "ommGripTake",
  "ommThreat",
];
/** Misty Mountain Goblins When Revealed effects. */
export function goblinEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!goblinActive(s)) return false;
  if (code === O.driver) {
    if (fromReveal) prepend(s, fx("ommExhaustOwn", { player: firstPlayer(s) }));
    return true;
  }
  if (code !== O.grip) return false;
  holdTreachery(s, code, replay, fromReveal);
  return true;
}
/** Misty Mountain Goblins shadow effects. */
export function goblinShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !goblinActive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  if (code === O.axeman) c.defensePenalty = (c.defensePenalty ?? 0) + 1;
  else if (code === O.driver) prepend(s, fx("ommExhaustOwn", { player: p }));
  else if (code === O.miners) c.attackBonus += 1;
  else if (code === O.runners) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === O.grip) {
    const n = goblinsEngagedWith(s, p);
    if (n) prepend(s, fx("ommSpreadDamage", { value: n, player: p }));
  } else if (code === O.caves) {
    const n = goblinsEngagedWith(s, p);
    if (n) prepend(s, fx("ommThreat", { value: n, player: p }));
  } else return false;
  return true;
}
export const goblinStats = (s: GameState, u: Unit) =>
  u.blanked || !goblinActive(s)
    ? {}
    : {
        attack: u.code === O.axeman ? caves(s) : 0,
        defense: u.code === O.miners ? caves(s) : 0,
      };
/** The Goblins' Caves: while active, Goblin enemies get +1 threat. */
export const goblinThreat = (s: GameState, u: Unit) =>
  goblinActive(s) && !u.blanked && isGoblin(u) && activeLive(s, O.caves)
    ? 1
    : 0;
/** Grip, grab! Pinch, nab! held in the shared Hobbit resolving zone. */
export function goblinTreachery(s: GameState, e: Effect) {
  if (e.kind !== "wmaTreachery" || !goblinActive(s)) return false;
  const held = hobbitResolving(s).find((x) => x.id === e.source);
  if (held?.code !== O.grip) return false;
  prepend(s, ...playerOrder(s).map((player) => fx("ommGrip", { player })));
  return true;
}
const porchBlank = (s: GameState, u: Unit) =>
  !!s.mistyMountains?.porchBlank.some(
    (m) => m.id === u.id && m.round === s.round,
  );
const activeLive = (s: GameState, code: string) =>
  allActiveLocations(s).some(
    (u) =>
      u.code === code && !u.blanked && !(code === O.porch && porchBlank(s, u)),
  );
const inPlayLive = (s: GameState, code: string) =>
  [...s.staging, ...allEngaged(s), ...allActiveLocations(s)].some(
    (u) => u.code === code && !u.blanked,
  );
const stagingGiants = (s: GameState) =>
  s.staging.filter((u) => isGiant(u) && !u.blanked);
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const skip: Option = { id: "skip", label: "Decline", effects: [] };
const takeShadow = (enemy: Unit, code: string) => {
  const i = Math.max(0, (enemy.revealedShadowCount ?? 1) - 1);
  const index = enemy.shadows[i] === code ? i : enemy.shadows.indexOf(code);
  if (index < 0) return false;
  removeShadowCard(enemy, index);
  return true;
};
const goblinsEngagedWith = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter((u) => isGoblin(u)).length;

export function setupMistyMountains(s: GameState) {
  const r = OMM_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Stage 2B, not setup, adds the first Stone-giant to the staging area.
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...section("sharedStagingArea"),
  ]);
  s.mistyMountains = {
    currentQuest: O.rest,
    advancing: false,
    initialized: false,
    goblinTown: false,
    inactiveDeck: shuffle(s, section("sharedEncounterDeck2")),
    resolving: [],
    guffawing: [],
    chaos: [],
    porchBlank: [],
  };
  log(
    s,
    "A Short Rest: the first encounter deck is active; The Great Goblin and the Misty Mountain Goblins wait in a second deck, inactive.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.mistyMountains;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    s.stage < 2
  )
    return true;
  const goal = ommStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Stage 3B cannot be defeated until The Great Goblin is in the victory display.
  if (s.stage === 3 && !greatGoblinDefeated(s)) return true;
  q.advancing = true;
  prepend(s, fx("ommDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
function travelProblem(s: GameState, u: Unit) {
  if (!s.mistyMountains || typeOf(u) !== "location") return null;
  if (
    u.code !== O.cavern &&
    greatGoblinDefeated(s) &&
    s.staging.some((l) => l.code === O.cavern && !l.blanked)
  )
    return "Great Cavern Room: with The Great Goblin in the victory display the players must travel to Great Cavern Room.";
  return null;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!s.mistyMountains) return false;
  if (westernEncounter(s, code, replay, fromReveal)) return true;
  if (goblinEncounter(s, code, replay, fromReveal)) return true;
  if (![O.boulders, O.guffawing, O.chaos].includes(code)) return false;
  holdTreachery(s, code, replay, fromReveal);
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.mistyMountains) return false;
  if (westernShadow(s, code)) return true;
  if (goblinShadow(s, code)) return true;
  const enemy = get(s, c.enemyId);
  if (code === O.boulders) {
    if (enemy && takeShadow(enemy, code)) {
      s.encounterDeck.unshift(code);
      log(s, "Galloping Boulders returns to the top of the encounter deck.");
    }
  } else if (code === O.chaos) c.ommChaosReturn = true;
  else if (code === O.bentSwords)
    c.attackBonus += greatGoblinDefeated(s) ? 2 : 1;
  else return false;
  return true;
}
function returnToStaging(s: GameState, u: Unit) {
  forOwner(s, ownerOf(s, u), () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
/** Stage 3A: every encounter card in play or discarded joins the first deck. */
function goblinTown(s: GameState) {
  const q = s.mistyMountains!;
  const first: string[] = [];
  const sweep = (u: Unit) => {
    first.push(u.code, ...u.shadows);
    for (const a of u.attachments)
      if (card(a.code).sphere_code === "encounter") first.push(a.code);
      else seatView(s, a.owner ?? firstPlayer(s)).discard.push(a.code);
  };
  const encounterUnit = (u: Unit) => card(u.code).sphere_code === "encounter";
  for (const u of s.staging.filter(encounterUnit)) sweep(u);
  s.staging = s.staging.filter((u) => !encounterUnit(u));
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const u of s.engaged) sweep(u);
      s.engaged = [];
    });
  for (const u of allActiveLocations(s).filter(encounterUnit)) sweep(u);
  s.activeLocation = null;
  s.extraActiveLocations = [];
  first.push(...s.encounterDiscard.splice(0), ...s.encounterDeck.splice(0));
  s.encounterDeck = q.inactiveDeck.splice(0);
  q.inactiveDeck = shuffle(s, first);
  q.goblinTown = true;
  q.guffawing = [];
  q.chaos = [];
  q.porchBlank = [];
  const i = s.encounterDeck.indexOf(O.greatGoblin);
  if (i >= 0) {
    s.encounterDeck.splice(i, 1);
    const gg = make(s, O.greatGoblin);
    s.staging.push(gg);
    enemyAddedToStaging(s, gg);
  }
  shuffle(s, s.encounterDeck);
  log(
    s,
    "Down, Down to Goblin Town: the first encounter deck is set aside and the Goblin deck becomes active; The Great Goblin enters the staging area.",
    "danger",
  );
}
function abilityProblem(s: GameState, u: Unit) {
  const bilbo = bagginsBilbo(s);
  if (u.code === O.rock) {
    if (!activeLive(s, O.rock))
      return "Overhanging Rock must be the active location.";
    if (!bilbo || ownerOf(s, bilbo) !== activeSeat(s))
      return "Only the player who controls Bilbo Baggins can spend his Baggins resources.";
    if (bilbo.resources < 1) return "Bilbo Baggins needs 1 Baggins resource.";
    if (!s.deck.length) return "Your deck is empty.";
    return null;
  }
  if (u.code === O.porch) {
    if (!inPlayLive(s, O.porch) || porchBlank(s, u))
      return "Front Porch's text box is already blank this round.";
    if (activeSeat(s) !== firstPlayer(s))
      return "Only the first player may spend the resources.";
    if (!bilbo || bilbo.resources < 2)
      return "Bilbo Baggins needs 2 Baggins resources.";
    return null;
  }
  return "No action.";
}
/** Misty Mountain Goblins effects, in either scenario. */
function goblinEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "ommExhaustOwn": {
      const ready = allCharacters(s).filter(
        (c) => ownerOf(s, c) === p && !c.exhausted,
      );
      if (!ready.length) break;
      choose(
        s,
        "Goblin Driver · Exhaust 1 character you control",
        ready.map((c) =>
          option(c, [fx("ommExhaust", { target: c.id, player: p })]),
        ),
      );
      break;
    }
    case "ommExhaust":
      if (u) exhaustCharacter(s, u);
      break;
    case "ommSpreadDamage": {
      const remaining = e.value ?? 0;
      const own = allCharacters(s).filter((c) => ownerOf(s, c) === p);
      if (remaining <= 0 || !own.length) break;
      choose(
        s,
        `Grip, grab! Pinch, nab! · Deal 1 damage to a character you control (${remaining} remaining)`,
        own.map((c) =>
          option(c, [
            fx("damage", { target: c.id, value: 1, player: p }),
            fx("ommSpreadDamage", { value: remaining - 1, player: p }),
          ]),
        ),
      );
      break;
    }
    case "ommGrip": {
      const goblins = [
        ...new Set(s.encounterDiscard.filter((c) => isGoblin(c))),
      ];
      if (!goblins.length) break;
      choose(
        s,
        "Grip, grab! Pinch, nab! · Choose a Goblin enemy in the discard pile",
        goblins.map((code) => ({
          id: code,
          code,
          label: `Add ${card(code).name} to the staging area`,
          effects: [fx("ommGripTake", { code, player: p })],
        })),
      );
      break;
    }
    case "ommGripTake": {
      const i = s.encounterDiscard.lastIndexOf(e.code!);
      if (i < 0) break;
      s.encounterDiscard.splice(i, 1);
      const goblin = make(s, e.code!);
      s.staging.push(goblin);
      enemyAddedToStaging(s, goblin);
      log(
        s,
        `${card(e.code!).name} returns from the discard pile to the staging area.`,
        "danger",
      );
      break;
    }
    case "ommThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    default:
      return false;
  }
  return true;
}
export function ommEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("omm")) return false;
  if (GOBLIN_EFFECTS.includes(e.kind) && goblinActive(s))
    return goblinEffect(s, e);
  const q = s.mistyMountains;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    first = firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "ommShortRest":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("ommTreasureSearch", { player })),
        fx("ommStageTwo", { player: first }),
      );
      break;
    case "ommTreasureSearch": {
      const found = [
        ...new Set(
          seatView(s, p).deck.filter((c) => HOBBIT_TREASURES.includes(c)),
        ),
      ];
      if (!found.length) break;
      choose(s, "A Short Rest · Search your deck for 1 treasure card?", [
        ...found.map((code) => ({
          id: code,
          code,
          label: `Add ${card(code).name} to your hand`,
          effects: [fx("ommTakeTreasure", { code, player: p })],
        })),
        { ...skip, label: "Do not search" },
      ]);
      break;
    }
    case "ommTakeTreasure":
      forOwner(s, p, () => {
        const i = s.deck.indexOf(e.code!);
        if (i < 0) return;
        s.deck.splice(i, 1);
        s.hand.push(make(s, e.code!));
        shuffle(s, s.deck);
        log(
          s,
          `${card(e.code!).name} is added to the hand; the deck is shuffled.`,
          "good",
        );
      });
      break;
    case "ommStageTwo":
      s.stage = 2;
      q.currentQuest = O.pass;
      s.progress = 0;
      log(s, "The Mountain Pass begins.", "chapter");
      {
        const i = s.encounterDeck.indexOf(O.giant);
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          const giant = make(s, O.giant);
          s.staging.push(giant);
          enemyAddedToStaging(s, giant);
          log(s, "A Stone-Giant enters the staging area.", "danger");
        }
        shuffle(s, s.encounterDeck);
      }
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      break;
    case "ommDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("ommNextStage", { player: first }));
      break;
    }
    case "ommNextStage":
      q.advancing = false;
      if (s.stage >= OMM_QUESTS.length) {
        win(s);
        s.reason =
          "The Great Goblin is slain and the company escapes Goblin Town into the dark beneath the mountains.";
        break;
      }
      s.stage = 3;
      q.currentQuest = O.town;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, "Down, Down to Goblin Town begins.", "chapter");
      prepend(s, fx("ommStageThree", { player: first }));
      break;
    case "ommStageThree": {
      goblinTown(s);
      s.stageRevealing = false;
      const total = 3 * players(s);
      const bilbo = bagginsBilbo(s);
      const max = Math.min(bilbo?.resources ?? 0, total - 1);
      if (!max) {
        prepend(s, fx("ommTownReveal", { value: total, player: first }));
        break;
      }
      choose(
        s,
        "Down, Down to Goblin Town · Bilbo Baggins may spend resources to reveal fewer cards",
        Array.from({ length: max + 1 }, (_, x) => ({
          id: `spend-${x}`,
          label: x
            ? `Spend ${x} Baggins resource${x === 1 ? "" : "s"}: reveal ${total - x}`
            : `Spend nothing: reveal ${total}`,
          effects: [
            fx("ommTownReveal", { value: total - x, count: x, player: first }),
          ],
        })),
        "Reveal 3 encounter cards per player, reduced by X to a minimum of 1.",
      );
      break;
    }
    case "ommTownReveal": {
      if (e.count) spendBaggins(s, e.count);
      const total = e.value ?? 0;
      prepend(
        s,
        ...Array.from({ length: total }, (_, i) =>
          fx("reveal", { player: playerOrder(s)[i % players(s)] }),
        ),
      );
      break;
    }
    case "ommBoulderTarget": {
      if (!u || !u.committed) break;
      prepend(
        s,
        fx("damage", { target: u.id, value: 3, player: ownerOf(s, u) }),
      );
      u.committed = false;
      forOwner(s, ownerOf(s, u), () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(
        s,
        `${name(u)} is removed from the quest by Galloping Boulders.`,
        "danger",
      );
      break;
    }
    case "ommMarkGiant":
      if (u && s.staging.some((x) => x.id === u.id)) q.guffawing.push(u.id);
      break;
    case "ommGiantEngage": {
      const giant = get(s, e.target);
      if (!giant || !s.staging.some((x) => x.id === giant.id)) break;
      const threats = playerOrder(s).map((player) => ({
        player,
        threat: seatView(s, player).threat,
      }));
      const high = Math.max(...threats.map((t) => t.threat));
      const tied = threats
        .filter((t) => t.threat === high)
        .map((t) => t.player);
      const target = e.value ?? (tied.length === 1 ? tied[0] : undefined);
      if (target === undefined)
        choose(
          s,
          "Guffawing of Giants · The first player chooses the player with the highest threat",
          tied.map((player) => ({
            id: `player-${player}`,
            label: `Player ${player + 1} (${high} threat)`,
            effects: [
              fx("ommGiantEngage", {
                target: giant.id,
                value: player,
                player: first,
              }),
            ],
          })),
        );
      else forOwner(s, target, () => engage(s, giant));
      break;
    }
    case "ommDiscardAlly": {
      const allies = seatView(s, p).allies;
      if (!allies.length) break;
      choose(
        s,
        "Stone-Giant · Choose and discard 1 ally you control",
        allies.map((a) =>
          option(a, [fx("ommDiscardTarget", { target: a.id, player: p })]),
        ),
      );
      break;
    }
    case "ommDiscardTarget":
      if (u) forOwner(s, ownerOf(s, u), () => discardCharacter(s, u));
      break;
    case "ommCavernDamage": {
      const own = allCharacters(s).filter((c) => ownerOf(s, c) === p);
      if (!own.length) break;
      choose(
        s,
        "Great Cavern Room · Deal 1 damage to a character you control",
        own.map((c) =>
          option(c, [fx("damage", { target: c.id, value: 1, player: p })]),
        ),
      );
      break;
    }
    case "ommGreatGoblin": {
      const n = players(s);
      const discarded = s.encounterDeck.splice(0, n);
      for (const code of discarded) {
        if (isGoblin(code)) {
          const goblin = make(s, code);
          s.staging.push(goblin);
          enemyAddedToStaging(s, goblin);
        } else s.encounterDiscard.push(code);
      }
      if (discarded.length)
        log(
          s,
          `The Great Goblin discards ${discarded.length} encounter card${discarded.length === 1 ? "" : "s"}; ${discarded.filter((c) => isGoblin(c)).length} Goblin enem${discarded.filter((c) => isGoblin(c)).length === 1 ? "y joins" : "ies join"} the staging area.`,
          "danger",
        );
      break;
    }
    case "ommReturnAttacker": {
      const enemy = get(s, e.target);
      if (enemy && allEngaged(s).some((x) => x.id === enemy.id)) {
        returnToStaging(s, enemy);
        log(s, `${name(enemy)} returns to the staging area.`, "danger");
      }
      break;
    }
    case "ommRockPick": {
      forOwner(s, p, () => {
        const top = s.deck.splice(0, 2);
        const keep = top.indexOf(e.code!);
        if (keep < 0) {
          s.deck.unshift(...top);
          return;
        }
        s.hand.push(make(s, top.splice(keep, 1)[0]));
        s.discard.push(...top);
        log(
          s,
          `Overhanging Rock: ${card(e.code!).name} is added to the hand.`,
          "good",
        );
      });
      break;
    }
    case "ommRoundEnd":
      q.chaos = q.chaos.filter((m) => m.round > s.round);
      q.porchBlank = q.porchBlank.filter((m) => m.round > s.round);
      if (inPlayLive(s, O.highPass) && s.progress > 0) {
        const x = Math.min(players(s), s.progress);
        s.progress -= x;
        log(
          s,
          `The High Pass removes ${x} progress from the current quest.`,
          "danger",
        );
      }
      break;
    default:
      return false;
  }
  return true;
}
/** Treacheries held in the shared Hobbit resolving zone. */
function ommTreachery(s: GameState, e: Effect) {
  if (e.kind !== "wmaTreachery" || !s.mistyMountains) return false;
  const held = hobbitResolving(s).find((x) => x.id === e.source);
  if (!held) return false;
  const first = firstPlayer(s),
    q = s.mistyMountains;
  switch (held.code) {
    case O.boulders: {
      const questing = allCharacters(s).filter((u) => u.committed);
      if (questing.length)
        choose(
          s,
          "Galloping Boulders · The first player chooses a questing character",
          questing.map((u) =>
            option(u, [
              fx("ommBoulderTarget", { target: u.id, player: first }),
            ]),
          ),
          "That character takes 3 damage and is removed from the quest.",
        );
      return true;
    }
    case O.guffawing: {
      const giants = stagingGiants(s);
      if (!giants.length) {
        const i = s.encounterDeck.indexOf(O.giant);
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          const giant = make(s, O.giant);
          s.staging.push(giant);
          enemyAddedToStaging(s, giant);
          shuffle(s, s.encounterDeck);
          log(
            s,
            "Guffawing of Giants: a Stone-Giant is added to the staging area.",
            "danger",
          );
        }
      } else if (giants.length === 1) q.guffawing.push(giants[0].id);
      else
        choose(
          s,
          "Guffawing of Giants · Choose the Stone-giant that engages at the end of the quest phase",
          giants.map((g) =>
            option(g, [fx("ommMarkGiant", { target: g.id, player: first })]),
          ),
        );
      return true;
    }
    case O.chaos: {
      for (const enemy of [...allEngaged(s)]) returnToStaging(s, enemy);
      q.chaos.push({ round: s.round, phase: ommPhase(s) });
      log(
        s,
        "Chaos in the Cavern: every engaged enemy returns to the staging area.",
        "danger",
      );
      return true;
    }
  }
  return false;
}
export const OMM_HOOKS: Batch4ScenarioHooks = {
  setup: setupMistyMountains,
  openingHandsKept: (s) => {
    const q = s.mistyMountains;
    if (!q || q.initialized) return false;
    q.initialized = true;
    prepend(s, fx("ommShortRest", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: ommStageInfo,
  travelProblem,
  mustTravel: (s) =>
    !!s.mistyMountains &&
    greatGoblinDefeated(s) &&
    !allActiveLocations(s).length &&
    s.staging.some((l) => l.code === O.cavern && !l.blanked),
  stats: (s, u) => goblinStats(s, u),
  threatBonus: (s, u) => {
    if (!s.mistyMountains || u.blanked) return 0;
    let bonus = u.code === O.highPass ? players(s) : 0;
    bonus += goblinThreat(s, u);
    if (isGoblin(u)) {
      bonus += s.mistyMountains.chaos.filter(
        (m) => m.round === s.round && m.phase === ommPhase(s),
      ).length;
    }
    return bonus;
  },
  cannotAttack: (s, _character, enemy) =>
    !!s.mistyMountains && isGoblin(enemy) && activeLive(s, O.porch),
  revealedSurge: (s, code) =>
    (code === O.boulders && stagingGiants(s).length > 0) ||
    (code === O.bentSwords && greatGoblinDefeated(s)),
  engaged: (s, u) => {
    if (!s.mistyMountains || u.blanked) return;
    const p = activeSeat(s);
    if (isGiant(u)) prepend(s, fx("ommDiscardAlly", { player: p }));
    if (isGoblin(u) && activeLive(s, O.cavern))
      prepend(s, fx("ommCavernDamage", { player: p }));
  },
  endQuest: (s) => {
    const q = s.mistyMountains;
    if (!q || !q.guffawing.length) return;
    const ids = q.guffawing.splice(0);
    prepend(
      s,
      ...ids.map((id) =>
        fx("ommGiantEngage", { target: id, player: firstPlayer(s) }),
      ),
    );
  },
  locationProgressPlaced: (s, u, amount) =>
    westernLocationProgress(s, u, amount),
  explored: (s, u) => westernExplored(s, u),
  enemyAttackStarted: (s, u) => {
    westernAttackStarted(s);
    if (!s.combat) return;
    s.combat.ommEnemy = u.blanked ? undefined : u.code;
    s.combat.ommChaosReturn = false;
  },
  damageDealt: (s, u, amount, ctx) => westernDamageDealt(s, u, amount, ctx),
  attackFinished: (s, c: Combat, skipped = false) => {
    westernAttackFinished(s, c);
    if (!s.mistyMountains || skipped) return [];
    const effects: Effect[] = [];
    if (c.ommEnemy === O.greatGoblin && c.attackResolved)
      effects.push(fx("ommGreatGoblin", { player: firstPlayer(s) }));
    if (c.ommChaosReturn)
      effects.push(
        fx("ommReturnAttacker", { target: c.enemyId, player: firstPlayer(s) }),
      );
    return effects;
  },
  roundEnd: (s) =>
    s.mistyMountains
      ? [...westernRoundEnd(s), fx("ommRoundEnd", { player: firstPlayer(s) })]
      : [],
  characterLeft: (s, u) => {
    if (u.code === HOBBIT_BILBO) loseBilbo(s);
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  abilityLabel: (code) =>
    code === O.rock
      ? "Spend 1 Baggins resource: look at the top 2 cards of your deck"
      : code === O.porch
        ? "Spend 2 Baggins resources: blank Front Porch until the end of the round"
        : undefined,
  abilityProblem: (s, u) => abilityProblem(s, u),
  ability: (s, u) => {
    if (abilityProblem(s, u)) return false;
    const p = activeSeat(s),
      q = s.mistyMountains!;
    if (u.code === O.porch) {
      spendBaggins(s, 2);
      q.porchBlank.push({ id: u.id, round: s.round });
      log(
        s,
        "Front Porch's printed text box is blank until the end of the round.",
        "good",
      );
      return true;
    }
    spendBaggins(s, 1);
    const top = s.deck.slice(0, 2);
    choose(
      s,
      "Overhanging Rock · Add 1 card to your hand and discard the other",
      top.map((code, i) => ({
        id: `top-${i}`,
        code,
        label: `Add ${card(code).name} to your hand`,
        effects: [fx("ommRockPick", { code, player: p })],
      })),
    );
    return true;
  },
  encounter,
  shadow,
  defendersDeclared: (s, enemy, defenders) =>
    hobbitTreasureDefense(s, enemy, defenders),
  playerAttackResolved: (s, enemy, ids, amount, remainingHealth) =>
    prepend(s, ...hobbitTreasureKill(s, enemy, ids, amount, remainingHealth)),
  effect: (s, e) =>
    ommTreachery(s, e) ||
    goblinTreachery(s, e) ||
    ommEffect(s, e) ||
    hobbitTreasureEffect(s, e) ||
    wmaEffect(s, e),
  sharedEffect: (e) =>
    [
      "ommShortRest",
      "ommStageTwo",
      "ommDefeatQuest",
      "ommNextStage",
      "ommStageThree",
      "ommTownReveal",
      "ommBoulderTarget",
      "ommMarkGiant",
      "ommGiantEngage",
      "ommGrip",
      "ommGripTake",
      "ommGreatGoblin",
      "ommReturnAttacker",
      "ommRoundEnd",
    ].includes(e.kind),
};
