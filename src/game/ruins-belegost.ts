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
  random,
  removeShadowCard,
  shuffle,
  skip,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { canTravel } from "./actions";
import { mainQuestUnit } from "./quest-state";
import { dealEnemyShadows } from "./considered-engagement";
import { mordorOrcCharacterDestroyed } from "./mordor-orcs";
import {
  RB,
  RB_LOOT_POOL,
  RB_STAGE,
  isHazard,
  isLoot,
  printedDiscover,
  rbRecipe,
  rbStageInfo,
} from "./ruins-belegost-support";
export * from "./ruins-belegost-support";

/**
 * The Ruins of Belegost (2015 Fellowship event, print-on-demand Q99.06). A
 * location with the Discover keyword reveals a Hazard and may hide a Loot
 * objective when it becomes the active location; the Loot the players claim
 * decides where the quest deck branches at stages 2 and 3. Stalking the Ruins
 * gathers resources until Naurlhûg comes out, and the dragon must be defeated
 * at The Beast of Belegost to win.
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
/** The current quest card, unless its text is blank. */
const at = (s: GameState, code: string) =>
  s.ruinsBelegost?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isLocationCode = (c: string) => card(c).type_code === "location";
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter((u) => isEnemy(u)),
  ...globalEngaged(s),
];
/** Combat and quest phases span two engine phases. */
const phaseKey = (s: GameState) =>
  s.phase === "defense" || s.phase === "attack"
    ? "combat"
    : s.phase === "staging"
      ? "quest"
      : s.phase;
/** Loot objectives attached to heroes, with their hosts and controllers. */
export function claimedLoot(s: GameState) {
  return playerOrder(s).flatMap((p) =>
    seatView(s, p).heroes.flatMap((h) =>
      h.attachments
        .filter((a) => isLoot(a.code))
        .map((a) => ({ hero: h, a, player: p })),
    ),
  );
}
export const lootCount = (s: GameState, p?: number) =>
  claimedLoot(s).filter((x) => p === undefined || x.player === p).length;
const lootAttached = (s: GameState, code: string) =>
  claimedLoot(s).some((x) => x.a.code === code);
const stalkingUnit = (s: GameState) =>
  s.staging.find((u) => u.code === RB.stalking);
/** Naurlhûg, in the staging area or engaged with a player. */
const naurlhugUnit = (s: GameState) =>
  enemiesInPlay(s).find((u) => u.code === RB.naurlhug);
const stalkingResources = (s: GameState) => stalkingUnit(s)?.resources ?? 0;
/** The Discover value of the active location; The Roots of Ered Luin adds 1. */
export function discoverValue(s: GameState) {
  const loc = allActiveLocations(s)[0];
  if (!loc || loc.blanked) return 0;
  const printed = printedDiscover(loc.code);
  return printed ? printed + (at(s, RB.roots) ? 1 : 0) : 0;
}
function fromAside(s: GameState, c: string) {
  const q = s.ruinsBelegost!;
  const i = q.setAside.indexOf(c);
  if (i < 0) return false;
  q.setAside.splice(i, 1);
  return true;
}
function toStaging(s: GameState, c: string) {
  const u = make(s, c);
  s.staging.push(u);
  if (isEnemy(u)) enemyAddedToStaging(s, u);
  return u;
}
/** Return an engaged enemy to the staging area; its shadow cards are discarded. */
function returnToStaging(s: GameState, u: Unit) {
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
  if (owner === undefined) return;
  forOwner(s, owner, () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
/** Stalking the Ruins: Naurlhûg leaves play and is set aside (no damage stays). */
function setNaurlhugAside(s: GameState) {
  const q = s.ruinsBelegost!;
  const u = naurlhugUnit(s);
  if (!u) return;
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
  if (owner !== undefined)
    forOwner(s, owner, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  else s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  q.setAside.push(RB.naurlhug);
  log(s, "Stalking the Ruins: Naurlhûg is set aside, out of play.", "good");
}
/** Add Naurlhûg from out of play, or return him from a player, to the staging area. */
function naurlhugToStaging(s: GameState, source: string) {
  const u = naurlhugUnit(s);
  if (u) {
    if (s.staging.some((x) => x.id === u.id)) return;
    returnToStaging(s, u);
    log(s, `${source}: Naurlhûg returns to the staging area.`, "danger");
    return;
  }
  if (!fromAside(s, RB.naurlhug)) return;
  toStaging(s, RB.naurlhug);
  log(s, `${source}: Naurlhûg is added to the staging area.`, "danger");
}
function addStalkingResources(s: GameState, n: number, source: string) {
  const st = stalkingUnit(s);
  if (!st || n <= 0) return;
  st.resources += n;
  log(
    s,
    `${source}: ${n} resource${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} placed on Stalking the Ruins (${st.resources}).`,
    "danger",
  );
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupRuinsBelegost(s: GameState) {
  const r = rbRecipe(!!s.easyMode);
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const players = playerOrder(s).length;
  const mines = section("sharedStagingArea").filter((c) => c === RB.mine);
  const aside = section("sharedSetAside");
  // 1A: one random Loot facedown under Stalking the Ruins; the other four,
  // and the copies of Abandoned Mine beyond one per player, join the deck.
  const pool = aside.filter((c) => RB_LOOT_POOL.includes(c));
  const under = pool[Math.floor(random(s) * pool.length)];
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...mines.slice(players),
    ...pool.filter((c) => c !== under),
  ]);
  s.staging.push(make(s, RB.stalking));
  for (const c of mines.slice(0, players)) s.staging.push(make(s, c));
  s.ruinsBelegost = {
    currentQuest: RB.first,
    advancing: false,
    setAside: aside.filter((c) => !RB_LOOT_POOL.includes(c)),
    under,
    questResources: 0,
    hazardSurgeRound: null,
    lurkerDamage: null,
    echoes: null,
    weakened: [],
    resolving: [],
    looking: [],
    discovering: null,
    discoveredHazards: 0,
  };
  log(
    s,
    `Ruins of the First Age: Stalking the Ruins and ${players === 1 ? "an Abandoned Mine" : `${players} copies of Abandoned Mine`} are added to the staging area; Lurker of the Depths, Naurlhûg, Naurlhûg's Lair and Sword of Belegost are set aside, and a random Loot objective lies facedown under Stalking the Ruins.`,
    "chapter",
  );
}
/** What a stage needs before it can be defeated. */
function advanceProblem(s: GameState) {
  const q = s.ruinsBelegost!;
  if (s.stageRevealing || mainQuestUnit(s)?.blanked) return null;
  const loot = lootCount(s);
  switch (q.currentQuest) {
    case RB.first:
      return loot >= 1 ? null : "1 Loot objective";
    case RB.evils:
      return loot >= 2 && (s.victoryCards ?? []).includes(RB.lurker)
        ? null
        : "2 Loot objectives and Lurker of the Depths in the victory display";
    case RB.deeper:
      return loot >= 2 && q.questResources >= 3
        ? null
        : "2 Loot objectives and 3 resources on the stage";
  }
  return null;
}
function advance(s: GameState) {
  const q = s.ruinsBelegost;
  if (!q) return false;
  const goal = rbStageInfo(s)?.quest ?? 0;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    goal <= 0 ||
    s.progress < goal ||
    advanceProblem(s)
  )
    return true;
  q.advancing = true;
  prepend(s, fx("rbDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
/** The branch each stage's Forced effect takes when it is defeated. */
export function nextQuest(s: GameState, c: string) {
  switch (c) {
    case RB.first:
      return lootAttached(s, RB.keys) ? RB.deeper : RB.evils;
    case RB.evils:
      return lootAttached(s, RB.book) ? RB.roots : RB.servants;
    case RB.deeper:
      return lootAttached(s, RB.book) ? RB.mines : RB.roots;
    case RB.servants:
      return lootAttached(s, RB.torch) ? RB.beast : RB.roots;
    case RB.roots:
      return lootAttached(s, RB.map) ? RB.beast : RB.mines;
    case RB.mines:
      return lootAttached(s, RB.gem) ? RB.beast : RB.servants;
  }
  return c;
}
/** The When Revealed effect of each A side. */
function stageEntry(s: GameState): Effect[] {
  const q = s.ruinsBelegost!;
  const first = firstPlayer(s);
  switch (q.currentQuest) {
    case RB.evils:
      return [fx("rbLurker", { player: first })];
    case RB.deeper:
      return [fx("rbDeeper", { player: first })];
    case RB.beast:
      return [fx("rbBeast", { player: first })];
    default:
      return [
        fx("rbReshuffle", { player: first }),
        ...playerOrder(s).map((player) => fx("reveal", { player })),
      ];
  }
}

// ---------------------------------------------------------------------------
// The Discover keyword and the Loot objectives.

/** Look at X cards from the encounter deck, reshuffling the discard pile when short. */
function lookAt(s: GameState, x: number) {
  const out: string[] = [];
  while (out.length < x) {
    if (!s.encounterDeck.length) {
      if (!s.encounterDiscard.length) break;
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      log(
        s,
        "Discover: the encounter discard pile is shuffled into the encounter deck.",
      );
    }
    out.push(s.encounterDeck.shift()!);
  }
  return out;
}
const discovering = (s: GameState) => {
  const id = s.ruinsBelegost?.discovering;
  return id
    ? [...allActiveLocations(s), ...s.staging].find((u) => u.id === id)
    : undefined;
};
/** Claim a Loot objective in the staging area: the first player attaches it to a hero. */
function claimOptions(s: GameState, loot: Unit): Option[] {
  const first = firstPlayer(s);
  return seatView(s, first).heroes.map((h) => ({
    id: h.id,
    code: h.code,
    label: `Attach ${name(loot)} to ${name(h)}`,
    effects: [
      fx("rbAttachToHero", { target: h.id, source: loot.id, player: first }),
    ],
  }));
}
/** Loot attached to a card that leaves play goes to the staging area to be claimed. */
function releaseLoot(s: GameState, c: string, id: string) {
  const u = make(s, c);
  u.id = id;
  s.staging.push(u);
  prepend(s, fx("rbClaim", { target: u.id, player: firstPlayer(s) }));
}

// ---------------------------------------------------------------------------
// Encounter cards.

const TREACHERIES: readonly string[] = [RB.spikes, RB.pit, RB.echoes, RB.spawn];
function encounter(s: GameState, c: string, replay = false, fromReveal = true) {
  const q = s.ruinsBelegost;
  if (!q) return false;
  const player = activeSeat(s);
  // Loot: a revealed Loot objective is discarded and another card revealed.
  if (isLoot(c)) {
    if (!fromReveal) return true;
    const placed = [...s.staging].reverse().find((u) => u.code === c);
    if (placed) s.staging = s.staging.filter((u) => u.id !== placed.id);
    s.encounterDiscard.push(c);
    log(
      s,
      `${card(c).name} has the Loot keyword: it is discarded and another encounter card is revealed.`,
    );
    prepend(s, fx("reveal", { player }));
    return true;
  }
  if (c === RB.orc) {
    if (!fromReveal) return true;
    const orc = [...s.staging].reverse().find((u) => u.code === c);
    if (!orc) return true;
    const targets = playerOrder(s).filter((p) => lootCount(s, p) > 0);
    if (targets.length)
      prepend(
        s,
        ...targets.map((p) =>
          fx("immediateAttack", { target: orc.id, player: p }),
        ),
      );
    else log(s, "Orc of Ered Luin: no player controls a Loot objective.");
    return true;
  }
  if (!TREACHERIES.includes(c)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(c);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(c);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, c);
  q.resolving.push(u);
  prepend(
    s,
    fx("rbTreachery", { code: c, source: u.id, player }),
    fx("rbTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const q = s.ruinsBelegost!;
  const first = firstPlayer(s);
  switch (held.code) {
    // Each player assigns X damage; X is 1 more than the active Discover value.
    case RB.spikes: {
      const x = 1 + discoverValue(s);
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("rbAssign", { value: x, text: "Concealed Spikes", player }),
        ),
      );
      return;
    }
    case RB.pit:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("rbDiscardAlly", { player })),
      );
      return;
    // Doomed 1 resolves first; then the first player's characters add threat.
    case RB.echoes: {
      const value = charactersOf(s, first).length;
      q.echoes = { phase: phaseKey(s), round: s.round, value };
      log(
        s,
        `Echoes in the Dark: +${value} threat in the staging area until the end of the phase, 1 for each character the first player controls.`,
        "danger",
      );
      return;
    }
    case RB.spawn: {
      const dragon = naurlhugUnit(s);
      if (dragon) {
        log(
          s,
          "Spawn of Thangorodrim: Naurlhûg makes an immediate attack against the first player.",
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: dragon.id, player: first }));
        return;
      }
      addStalkingResources(s, 1, "Spawn of Thangorodrim");
      if (stalkingResources(s) >= 3)
        naurlhugToStaging(s, "Spawn of Thangorodrim");
      return;
    }
  }
}

/** The shadow effects of this encounter deck. */
function shadow(s: GameState, c: string) {
  const combat = s.combat;
  if (!combat || !s.ruinsBelegost) return false;
  const p = combat.attackPlayer ?? activeSeat(s);
  const enemy = get(s, combat.enemyId);
  const defenders = (
    combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
  )
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (c) {
    case RB.spikes:
      prepend(s, fx("rbSpikesShadow", { player: p }));
      return true;
    case RB.orc:
      combat.rbNextPlayer = true;
      log(
        s,
        "Orc of Ered Luin: after this attack, the attacking enemy engages the next player and makes an immediate attack.",
        "danger",
      );
      return true;
    case RB.treasury:
      prepend(s, fx("rbExhaust", { text: "Sunken Treasury", player: p }));
      return true;
    case RB.goblin:
      if (lootCount(s, p) > 0)
        prepend(s, fx("rbGoblinShadow", { target: enemy?.id, player: p }));
      else log(s, "Blue Mountain Goblin: you control no Loot objective.");
      return true;
    case RB.spawn:
      combat.extraAttacks = (combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "Spawn of Thangorodrim: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case RB.echoes:
      prepend(s, fx("rbEchoesShadow", { player: p }));
      return true;
    case RB.dweller: {
      const bonus = lootCount(s, p) > 0 ? 2 : 1;
      combat.attackBonus += bonus;
      log(
        s,
        `Nameless Cave Dweller: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case RB.pit:
      if (enemy && !card(enemy.code).is_unique && lootCount(s, p) > 0)
        prepend(s, fx("rbPitShadow", { target: enemy.id, player: p }));
      combat.cuReturnOnKill = true;
      log(
        s,
        "Covered Pit: if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      void defenders;
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Loot actions.

const LOOT_LABELS: Record<string, string> = {
  [RB.book]:
    "Book of Aulë's Children · Action: exhaust to have a player draw 1 card",
  [RB.gem]:
    "Blue Mountain Gem · Action: exhaust to reduce a player's threat by 1",
  [RB.torch]:
    "Dwarven Torch · Action: exhaust to give a non-unique enemy -1 attack and -1 defense",
  [RB.keys]:
    "Keys of Belegost · Action: exhaust to add 1 resource to a hero's pool",
  [RB.map]:
    "Map of Ered Luin · Action: exhaust to give a non-unique location -2 threat",
};
function lootTargets(s: GameState, c: string): Option[] {
  const p = activeSeat(s);
  switch (c) {
    case RB.book:
    case RB.gem:
      return playerOrder(s).map((player) => ({
        id: `player-${player}`,
        label: s.table ? seatName(s, player) : "You",
        effects: [
          c === RB.book
            ? fx("draw", { value: 1, player })
            : fx("threat", { value: -1, code: RB.gem, player }),
        ],
      }));
    case RB.torch:
      return enemiesInPlay(s)
        .filter((u) => !card(u.code).is_unique)
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("rbWeaken", { target: u.id, text: "torch", player: p })],
        }));
    case RB.keys:
      return playerOrder(s).flatMap((player) =>
        seatView(s, player).heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("resource", { target: h.id, value: 1, player })],
        })),
      );
    case RB.map:
      return [...s.staging, ...allActiveLocations(s)]
        .filter(
          (u) =>
            card(u.code).type_code === "location" && !card(u.code).is_unique,
        )
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("rbWeaken", { target: u.id, text: "map", player: p })],
        }));
  }
  return [];
}
function lootProblem(s: GameState, u: Unit, attachmentId?: string) {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (!a || !LOOT_LABELS[a.code]) return null;
  if (a.blanked) return `${card(a.code).name}'s text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s))
    return `You do not control ${card(a.code).name}.`;
  if (a.exhausted) return `${card(a.code).name} is exhausted.`;
  if (!lootTargets(s, a.code).length) return "There is no target.";
  return null;
}

// ---------------------------------------------------------------------------
// Effects.

function rbEffect(s: GameState, e: Effect): boolean {
  const q = s.ruinsBelegost;
  if (!q || !e.kind.startsWith("rb")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "rbDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("rbNextStage", { player: first }));
      return true;
    }
    case "rbNextStage": {
      q.advancing = false;
      const next = nextQuest(s, q.currentQuest);
      if (next === q.currentQuest) return true;
      // Stalking the Ruins: discard its tokens and set Naurlhûg aside.
      const st = stalkingUnit(s);
      if (st?.resources) {
        st.resources = 0;
        log(s, "Stalking the Ruins: its resources are discarded.", "good");
      }
      setNaurlhugAside(s);
      q.currentQuest = next;
      q.questResources = 0;
      s.stage = RB_STAGE[next];
      s.progress = 0;
      log(s, `${card(next).name} begins.`, "chapter");
      prepend(s, ...stageEntry(s));
      return true;
    }
    case "rbLurker":
      if (fromAside(s, RB.lurker)) {
        toStaging(s, RB.lurker);
        log(
          s,
          "Ancient Evils Disturbed: Lurker of the Depths is added to the staging area.",
          "danger",
        );
      }
      return true;
    case "rbReshuffle":
      if (s.encounterDiscard.length) {
        s.encounterDeck = shuffle(s, [
          ...s.encounterDeck,
          ...s.encounterDiscard.splice(0),
        ]);
        log(
          s,
          "The encounter discard pile is shuffled into the encounter deck.",
        );
      }
      return true;
    case "rbDeeper": {
      const lurker = fromAside(s, RB.lurker);
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
        ...(lurker ? [RB.lurker] : []),
      ]);
      log(
        s,
        `Deeper into the Past: ${lurker ? "Lurker of the Depths and " : ""}the encounter discard pile are shuffled into the encounter deck.`,
      );
      while (s.encounterDeck.length) {
        const top = s.encounterDeck.shift()!;
        if (isLocationCode(top)) {
          toStaging(s, top);
          log(
            s,
            `Deeper into the Past: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
            "danger",
          );
          break;
        }
        s.encounterDiscard.push(top);
      }
      return true;
    }
    case "rbBeast": {
      const added = [RB.naurlhug, RB.lair].filter((c) => fromAside(s, c));
      for (const c of added) toStaging(s, c);
      const sword = fromAside(s, RB.sword);
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
        ...(sword ? [RB.sword] : []),
      ]);
      log(
        s,
        `The Beast of Belegost: ${added.map((c) => card(c).name).join(" and ") || "nothing"} ${added.length === 1 ? "is" : "are"} added to the staging area; ${sword ? "Sword of Belegost and " : ""}the encounter discard pile ${sword ? "are" : "is"} shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "rbStalking": {
      if (!stalkingUnit(s)) return true;
      addStalkingResources(s, 1, "Stalking the Ruins");
      if (stalkingResources(s) >= 3) naurlhugToStaging(s, "Stalking the Ruins");
      return true;
    }
    case "rbTravelReturn": {
      for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
        if (isLocationCode(s.encounterDiscard[i])) {
          const [c] = s.encounterDiscard.splice(i, 1);
          toStaging(s, c);
          log(
            s,
            `Ruins of the First Age: ${card(c).name}, the topmost location in the encounter discard pile, returns to the staging area.`,
          );
          return true;
        }
      return true;
    }
    // Discover X.
    case "rbDiscover": {
      const loc = allActiveLocations(s).find((u) => u.id === e.target);
      if (!loc || loc.blanked) return true;
      let x = printedDiscover(loc.code) + (at(s, RB.roots) ? 1 : 0);
      if (live(loc, RB.mine)) x += playerOrder(s).length;
      q.looking = lookAt(s, x);
      q.discovering = loc.id;
      q.discoveredHazards = 0;
      log(
        s,
        `Discover ${x} (${name(loc)}): the first player looks at ${q.looking.map((c) => card(c).name).join(", ") || "no card"}.`,
      );
      prepend(
        s,
        fx("rbDiscoverLoot", { player: first }),
        fx("rbDiscoverHazard", { player: first }),
        fx("rbDiscoverEnd", { player: first }),
      );
      return true;
    }
    case "rbDiscoverLoot": {
      const loot = [...new Set(q.looking.filter(isLoot))];
      if (!loot.length) return true;
      if (loot.length === 1) {
        prepend(s, fx("rbAttachLoot", { text: loot[0], player: first }));
        return true;
      }
      choose(
        s,
        `Discover · Choose a Loot objective to attach to the active location${seatLabel(s, first)}`,
        loot.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("rbAttachLoot", { text: c, player: first })],
        })),
        "Choose 1 looked at objective with the Loot keyword and attach it to the active location as a guarded objective.",
      );
      return true;
    }
    case "rbAttachLoot": {
      const c = e.text ?? "";
      const i = q.looking.indexOf(c);
      if (i < 0) return true;
      q.looking.splice(i, 1);
      const host = discovering(s);
      const id = `a${s.nextId++}`;
      if (!host) {
        releaseLoot(s, c, id);
        return true;
      }
      host.attachments.push({ id, code: c, exhausted: false });
      log(
        s,
        `Discover: ${card(c).name} is attached to ${name(host)} as a guarded objective.`,
        "good",
      );
      return true;
    }
    case "rbDiscoverHazard": {
      const host = discovering(s);
      const hazards = q.looking.filter(isHazard);
      let n = 1 + (host && live(host, RB.hall) ? playerOrder(s).length - 1 : 0);
      const picks: string[] = [];
      while (n-- > 0 && hazards.length)
        picks.push(
          hazards.splice(Math.floor(random(s) * hazards.length), 1)[0],
        );
      for (const c of picks) q.looking.splice(q.looking.indexOf(c), 1);
      q.discoveredHazards = picks.length;
      if (!picks.length) {
        log(s, "Discover: no Hazard card was looked at.");
        return true;
      }
      log(
        s,
        `Discover: ${picks.map((c) => card(c).name).join(", ")} ${picks.length === 1 ? "is" : "are"} selected at random and revealed.`,
        "danger",
      );
      prepend(
        s,
        ...picks.map((c) => fx("revealCard", { code: c, player: first })),
      );
      return true;
    }
    case "rbDiscoverEnd": {
      const rest = q.looking.splice(0);
      s.encounterDiscard.push(...rest);
      q.discovering = null;
      if (rest.length)
        log(
          s,
          `Discover: ${rest.map((c) => card(c).name).join(", ")} ${rest.length === 1 ? "is" : "are"} placed in the encounter discard pile.`,
        );
      // 3F: no Hazard was revealed, so the top encounter card is.
      if (at(s, RB.mines) && q.discoveredHazards === 0) {
        log(
          s,
          "The Mines of Belegost: no Hazard card was revealed, so the top card of the encounter deck is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: first }));
      }
      q.discoveredHazards = 0;
      return true;
    }
    // Claiming Loot.
    case "rbClaim": {
      const loot = s.staging.find((u) => u.id === e.target);
      if (!loot) return true;
      const options = claimOptions(s, loot);
      if (!options.length) {
        log(
          s,
          `${name(loot)}: the first player controls no hero; it stays in the staging area.`,
        );
        return true;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `${name(loot)} · Attach it to a hero you control${seatLabel(s, first)}`,
        options,
        "If unattached, the first player claims this Loot objective and attaches it to a hero he controls.",
      );
      return true;
    }
    case "rbAttachToHero": {
      const loot = s.staging.find((u) => u.id === e.source);
      const hero = get(s, e.target);
      if (!loot || !hero) return true;
      s.staging = s.staging.filter((u) => u.id !== loot.id);
      hero.attachments.push({
        id: loot.id,
        code: loot.code,
        exhausted: false,
      });
      log(s, `${name(hero)} claims ${name(loot)}.`, "good");
      return true;
    }
    case "rbLairLoot": {
      if (!q.under) return true;
      const c = q.under;
      q.under = null;
      const u = toStaging(s, c);
      log(
        s,
        `Naurlhûg's Lair: ${card(c).name}, the Loot objective under Stalking the Ruins, is added to the staging area faceup.`,
        "good",
      );
      prepend(s, fx("rbClaim", { target: u.id, player: first }));
      return true;
    }
    case "rbChamber": {
      const chamber = allActiveLocations(s).find((u) => u.id === e.target);
      if (!chamber || chamber.attachments.some((a) => isLoot(a.code)))
        return true;
      const loot = [...new Set(s.encounterDiscard.filter(isLoot))];
      if (!loot.length) return true;
      choose(
        s,
        `Secret Chamber · Attach a Loot objective from the encounter discard pile${seatLabel(s, first)}`,
        [
          ...loot.map((c) => ({
            id: c,
            code: c,
            label: `Attach ${card(c).name} to Secret Chamber`,
            effects: [
              fx("rbChamberLoot", { target: chamber.id, text: c, player: p }),
            ],
          })),
          skip,
        ],
        "Response: after the players travel to Secret Chamber, if no Loot objective is attached to it, search the encounter discard pile for a Loot objective and attach it to Secret Chamber as a guarded objective.",
      );
      return true;
    }
    case "rbChamberLoot": {
      const chamber = allActiveLocations(s).find((u) => u.id === e.target);
      const c = e.text ?? "";
      const i = s.encounterDiscard.lastIndexOf(c);
      if (!chamber || i < 0) return true;
      s.encounterDiscard.splice(i, 1);
      chamber.attachments.push({
        id: `a${s.nextId++}`,
        code: c,
        exhausted: false,
      });
      log(
        s,
        `Secret Chamber: ${card(c).name} is attached to it as a guarded objective.`,
        "good",
      );
      return true;
    }
    // Travel costs.
    case "rbTravelResources":
      addStalkingResources(s, e.value ?? 0, e.text ?? "Travel");
      return true;
    case "rbTravelThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(s, "Secret Chamber: each player raises his threat by 2.", "danger");
      return true;
    case "rbTreasuryDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `Sunken Treasury: ${who(s, p)} ${verb(s, "discard")} ${card(pick.code).name} at random.`,
        );
        discardHandCard(s, pick.id);
      });
      return true;
    // Treacheries.
    case "rbTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "rbTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // Assign X damage among characters you control, one at a time.
    case "rbAssign": {
      const left = e.value ?? 0;
      const targets = charactersOf(s, p);
      if (left <= 0 || !targets.length) return true;
      choose(
        s,
        `${e.text} · Assign damage among characters you control · ${left} remaining${seatLabel(s, p)}`,
        targets.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: 1, player: p }),
            ...(left > 1
              ? [fx("rbAssign", { value: left - 1, text: e.text, player: p })]
              : []),
          ],
        })),
      );
      return true;
    }
    case "rbDiscardAlly": {
      const allies = seatView(s, p).allies;
      if (!allies.length) {
        log(s, `Covered Pit: ${who(s, p)} ${verb(s, "control")} no ally.`);
        return true;
      }
      choose(
        s,
        `Covered Pit · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("rbDiscardCharacter", { target: u.id, player: p })],
        })),
        "When Revealed: each player discards an ally he controls.",
      );
      return true;
    }
    case "rbDiscardCharacter": {
      const u = get(s, e.target);
      if (!u || !charactersOf(s, p).some((x) => x.id === u.id)) return true;
      log(s, `${name(u)} is discarded.`, "danger");
      forOwner(s, p, () => discardCharacter(s, u));
      return true;
    }
    case "rbExhaust": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("rbExhaustCharacter", { target: u.id, player: p })],
        })),
        "Shadow: exhaust a character you control.",
      );
      return true;
    }
    case "rbExhaustCharacter": {
      const u = get(s, e.target);
      if (u) exhaustCharacter(s, u);
      return true;
    }
    // Shadows.
    case "rbSpikesShadow": {
      const own = charactersOf(s, p).flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              (card(a.code).type_code === "attachment" || isLoot(a.code)) &&
              (a.controller ?? ownerOf(s, h)) === p,
          )
          .map((a) => ({ h, a })),
      );
      const x = own.length;
      if (!x) {
        log(s, "Concealed Spikes: you control no attachment.");
        return true;
      }
      const cost = (c: string) => Number(card(c).cost) || 0;
      const top = Math.max(...own.map((o) => cost(o.a.code)));
      choose(
        s,
        `Concealed Spikes · Assign ${x} damage or discard your highest cost attachment${seatLabel(s, p)}`,
        [
          {
            id: "damage",
            label: `Assign ${x} damage among characters you control`,
            effects: [
              fx("rbAssign", { value: x, text: "Concealed Spikes", player: p }),
            ],
          },
          ...own
            .filter((o) => cost(o.a.code) === top)
            .map((o) => ({
              id: o.a.id,
              code: o.a.code,
              label: `Discard ${card(o.a.code).name} from ${name(o.h)} to cancel`,
              effects: [
                fx("rbDiscardAttachment", {
                  target: o.h.id,
                  source: o.a.id,
                  player: p,
                }),
              ],
            })),
        ],
        "Shadow: assign X damage among characters you control. X is the number of attachments you control. You may discard the highest cost attachment you control to cancel this effect.",
      );
      return true;
    }
    case "rbDiscardAttachment": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!host || !a) return true;
      log(s, `${card(a.code).name} is discarded.`, "danger");
      discardAttachment(s, host, a);
      return true;
    }
    case "rbGoblinShadow": {
      const attacker = get(s, e.target);
      if (!attacker) return true;
      // Take the revealed copy off the attacker, keeping its shadow bookkeeping.
      const revealed = attacker.revealedShadowCount ?? attacker.shadows.length;
      let i = -1;
      for (let k = Math.min(revealed, attacker.shadows.length) - 1; k >= 0; k--)
        if (attacker.shadows[k] === RB.goblin) {
          i = k;
          break;
        }
      if (i < 0) i = attacker.shadows.lastIndexOf(RB.goblin);
      if (i < 0) return true;
      removeShadowCard(attacker, i);
      const goblin = make(s, RB.goblin);
      log(
        s,
        `Blue Mountain Goblin: it is put into play engaged with ${who(s, p)} and dealt a shadow card.`,
        "danger",
      );
      enterEnemyEngaged(s, goblin, p);
      dealEnemyShadows(s, goblin, 1);
      return true;
    }
    case "rbEchoesShadow": {
      let event = false;
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        event = card(pick.code).type_code === "event";
        log(
          s,
          `Echoes in the Dark: ${who(s, p)} ${verb(s, "discard")} ${card(pick.code).name} at random.`,
        );
        discardHandCard(s, pick.id);
      });
      if (event && s.combat) {
        s.combat.attackBonus += 2;
        log(
          s,
          "Echoes in the Dark: it was an event, so the attacking enemy gets +2 attack.",
          "danger",
        );
      }
      return true;
    }
    case "rbPitShadow": {
      const attacker = get(s, e.target);
      const own = claimedLoot(s).filter((x) => x.player === p);
      if (!attacker || !own.length) return true;
      choose(
        s,
        `Covered Pit · Attach a Loot objective you control to ${name(attacker)}${seatLabel(s, p)}`,
        own.map((x) => ({
          id: x.a.id,
          code: x.a.code,
          label: `${card(x.a.code).name} (${name(x.hero)})`,
          effects: [
            fx("rbPitLoot", {
              target: attacker.id,
              source: x.a.id,
              player: p,
            }),
          ],
        })),
        "Shadow: if attacking enemy is non-unique, attach a Loot objective you control to it as a guarded objective.",
      );
      return true;
    }
    case "rbPitLoot": {
      const attacker = get(s, e.target);
      const held = claimedLoot(s).find((x) => x.a.id === e.source);
      if (!attacker || !held) return true;
      held.hero.attachments = held.hero.attachments.filter(
        (a) => a.id !== held.a.id,
      );
      attacker.attachments.push({ ...held.a, exhausted: false });
      log(
        s,
        `Covered Pit: ${card(held.a.code).name} is attached to ${name(attacker)} as a guarded objective.`,
        "danger",
      );
      return true;
    }
    case "rbNextAttack": {
      const u = get(s, e.target);
      if (!u || !globalEngaged(s).some((x) => x.id === u.id)) return true;
      const order = playerOrder(s);
      const from = e.value ?? p;
      const next = order[(order.indexOf(from) + 1) % order.length] ?? from;
      if (next !== from) forOwner(s, next, () => engage(s, u));
      log(
        s,
        `${e.text}: ${name(u)} engages ${who(s, next)} and makes an immediate attack.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", {
          target: u.id,
          player: next,
          ...(e.flag ? { noShadow: true } : {}),
        }),
      );
      return true;
    }
    case "rbWeaken": {
      const u = get(s, e.target);
      if (!u) return true;
      q.weakened.push({
        id: u.id,
        phase: phaseKey(s),
        round: s.round,
        kind: e.text === "map" ? "map" : "torch",
      });
      log(
        s,
        e.text === "map"
          ? `Map of Ered Luin: ${name(u)} gets -2 threat until the end of the phase.`
          : `Dwarven Torch: ${name(u)} gets -1 attack and -1 defense until the end of the phase.`,
        "good",
      );
      return true;
    }
  }
  return false;
}
const weakened = (s: GameState, u: Unit, kind: "torch" | "map") =>
  (s.ruinsBelegost?.weakened ?? []).filter(
    (w) =>
      w.id === u.id &&
      w.kind === kind &&
      w.round === s.round &&
      w.phase === phaseKey(s),
  ).length;

// ---------------------------------------------------------------------------
// Hooks.

export const RUINS_BELEGOST_HOOKS: Batch4ScenarioHooks = {
  setup: setupRuinsBelegost,
  advance,
  stageInfo: rbStageInfo,
  encounter,
  shadow,
  // Stalking the Ruins: a resource at the beginning of each quest phase.
  questBegin: (s) =>
    s.ruinsBelegost && stalkingUnit(s)
      ? [fx("rbStalking", { player: firstPlayer(s) })]
      : [],
  // 1B: with no location in play, the topmost discarded location returns.
  travelBegin: (s) => {
    if (!s.ruinsBelegost || !at(s, RB.first)) return;
    const inPlay =
      allActiveLocations(s).length ||
      s.staging.some((u) => isLocationCode(u.code));
    if (!inPlay) prepend(s, fx("rbTravelReturn", { player: firstPlayer(s) }));
  },
  // 3B, 3D and 3F: the players must travel to a location, if able.
  mustTravel: (s) =>
    !!s.ruinsBelegost &&
    (at(s, RB.servants) || at(s, RB.roots) || at(s, RB.mines)) &&
    !allActiveLocations(s).length &&
    s.staging.some((u) => isLocationCode(u.code) && !canTravel(s, u)),
  // 3B: the first Hazard card revealed each round gains surge; Blue
  // Mountain Goblin gains surge while a Loot objective is attached to a hero.
  revealedSurge: (s, c) => {
    const q = s.ruinsBelegost;
    if (!q) return false;
    if (c === RB.goblin && lootCount(s) > 0) return true;
    if (at(s, RB.servants) && isHazard(c) && q.hazardSurgeRound !== s.round) {
      q.hazardSurgeRound = s.round;
      log(
        s,
        `The Servants of Morgoth: ${card(c).name} is the first Hazard card revealed this round and gains surge.`,
        "danger",
      );
      return true;
    }
    return false;
  },
  stats: (s, u) => {
    if (!s.ruinsBelegost || u.blanked) return {};
    let attack = 0,
      defense = 0;
    if (u.code === RB.dweller) {
      const x = 1 + discoverValue(s);
      attack += x;
      defense += x;
    }
    const torch = weakened(s, u, "torch");
    attack -= torch;
    defense -= torch;
    // Sword of Belegost: the attached hero gets +4 attack.
    if (u.attachments.some((a) => a.code === RB.sword && !a.blanked))
      attack += 4;
    return attack || defense ? { attack, defense } : {};
  },
  threatBonus: (s, u) => {
    if (!s.ruinsBelegost || u.blanked) return 0;
    let bonus = -2 * weakened(s, u, "map");
    if (u.code === RB.naurlhug) bonus += stalkingResources(s);
    if (u.code === RB.dweller) bonus += 1 + discoverValue(s);
    if (u.code === RB.treasury) bonus += lootCount(s);
    return bonus;
  },
  // Echoes in the Dark: the first player's characters add threat for the phase.
  stagingThreat: (s) => {
    const e = s.ruinsBelegost?.echoes;
    return e && e.round === s.round && e.phase === phaseKey(s) ? e.value : 0;
  },
  // Old Stone Troll: -10 engagement cost for each Loot attached to a hero.
  engagementBonus: (s, u) =>
    s.ruinsBelegost && live(u, RB.troll) ? -10 * lootCount(s) : 0,
  // Naurlhûg cannot take damage until 4B with his lair in the victory
  // display; Lurker of the Depths takes no more than 4 damage each round.
  damageAmount: (s, u, amount) => {
    const q = s.ruinsBelegost;
    if (!q || u.blanked) return amount;
    if (u.code === RB.naurlhug)
      return at(s, RB.beast) && (s.victoryCards ?? []).includes(RB.lair)
        ? amount
        : 0;
    if (u.code === RB.lurker) {
      const taken =
        q.lurkerDamage?.round === s.round ? q.lurkerDamage.damage : 0;
      return Math.max(0, Math.min(amount, 4 - taken));
    }
    return amount;
  },
  damageDealt: (s, u, amount) => {
    const q = s.ruinsBelegost;
    if (!q || u.code !== RB.lurker || amount <= 0) return;
    const taken = q.lurkerDamage?.round === s.round ? q.lurkerDamage.damage : 0;
    q.lurkerDamage = { round: s.round, damage: taken + amount };
  },
  // Lurker of the Depths: considered engaged with each player in the staging area.
  consideredEngaged: (s, u, player) =>
    !!s.ruinsBelegost &&
    live(u, RB.lurker) &&
    s.staging.some((x) => x.id === u.id) &&
    playerOrder(s).includes(player),
  cannotEngage: (s, u) => !!s.ruinsBelegost && live(u, RB.lurker),
  cannotOptionallyEngage: (s, u) => !!s.ruinsBelegost && live(u, RB.lurker),
  immune: (s, u) =>
    !!s.ruinsBelegost && (live(u, RB.naurlhug) || live(u, RB.lair)),
  cannotAttach: (s, u, c) => {
    if (!s.ruinsBelegost || u.blanked) return false;
    if (u.code === RB.lurker) return true;
    const playerCard = !["encounter", undefined].includes(
      card(c).sphere_code as string | undefined,
    );
    return (
      playerCard &&
      [RB.troll, RB.dweller, RB.naurlhug, RB.lair].includes(u.code)
    );
  },
  // Old Stone Troll: only the engaged player can declare attackers against it.
  attackProblem: (s, enemy, ids) => {
    if (!s.ruinsBelegost || !live(enemy, RB.troll)) return null;
    const engagedWith = playerOrder(s).find((p) =>
      seatView(s, p).engaged.some((x) => x.id === enemy.id),
    );
    return ids.some((id) => {
      const u = get(s, id);
      return !u || ownerOf(s, u) !== engagedWith;
    })
      ? "Only the engaged player can declare attackers against Old Stone Troll."
      : null;
  },
  // Flooded Hall: each ally costs 1 more to play.
  allyCost: (s) =>
    s.ruinsBelegost ? s.staging.filter((u) => live(u, RB.hall)).length : 0,
  // Abandoned Mine: no progress on other staging locations.
  locationProgressBlocked: (s, u) =>
    !!s.ruinsBelegost &&
    s.staging.some((x) => x.id === u.id) &&
    u.code !== RB.mine &&
    s.staging.some((x) => live(x, RB.mine)),
  // Darkened Tunnel: a cancelled 'when revealed' effect discards the top
  // encounter card; a Hazard resolves its staging as if revealed.
  whenRevealedCancelled: (s) => {
    if (!s.ruinsBelegost) return;
    for (const _tunnel of s.staging.filter((u) => live(u, RB.tunnel))) {
      const top = s.encounterDeck.shift();
      if (!top) return;
      if (isHazard(top)) {
        log(
          s,
          `Darkened Tunnel: ${card(top).name} is discarded from the encounter deck and resolved as if it was just revealed.`,
          "danger",
        );
        prepend(s, fx("revealCard", { code: top, player: firstPlayer(s) }));
      } else {
        s.encounterDiscard.push(top);
        log(
          s,
          `Darkened Tunnel: ${card(top).name} is discarded from the encounter deck.`,
        );
      }
    }
  },
  // Naurlhûg's Forced: the defending player assigns X damage.
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.ruinsBelegost || !live(enemy, RB.naurlhug)) return;
    const x = stalkingResources(s);
    if (x > 0)
      prepend(s, fx("rbAssign", { value: x, text: "Naurlhûg", player }));
  },
  attackFinished: (s, combat) => {
    if (!s.ruinsBelegost) return [];
    const enemy = get(s, combat.enemyId);
    if (!enemy) return [];
    const p = combat.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    if (combat.rbNextPlayer)
      effects.push(
        fx("rbNextAttack", {
          target: enemy.id,
          value: p,
          text: "Orc of Ered Luin",
          player: p,
        }),
      );
    // 4B: a shadow card with no shadow effect sends Naurlhûg to the next player.
    if (
      at(s, RB.beast) &&
      live(enemy, RB.naurlhug) &&
      enemy.shadows.some((c) => !card(c).shadow)
    )
      effects.push(
        fx("rbNextAttack", {
          target: enemy.id,
          value: p,
          text: "The Beast of Belegost",
          flag: true,
          player: p,
        }),
      );
    return effects;
  },
  characterDestroyed: (s, _u, context) =>
    mordorOrcCharacterDestroyed(s, context),
  // Loot leaving with its guard is claimed by the first player; Naurlhûg's
  // defeat at 4B wins the game.
  attachmentLeaves: (s, host, a) => {
    if (!s.ruinsBelegost || !isLoot(a.code)) return false;
    if (card(host.code).type_code === "hero") return false;
    releaseLoot(s, a.code, a.id);
    return true;
  },
  hostLeaves: (s, u, defeated) => {
    if (!s.ruinsBelegost) return;
    if (defeated && u.code === RB.naurlhug && at(s, RB.beast))
      win(
        s,
        "Naurlhûg is defeated: the heroes claim the treasure of Belegost and the players win the game.",
      );
  },
  travelProblem: (s, u) =>
    s.ruinsBelegost &&
    live(u, RB.treasury) &&
    playerOrder(s).some((p) => !seatView(s, p).hand.length)
      ? "Sunken Treasury: each player must discard 1 random card from his hand to travel here."
      : null,
  travelEffects: (s, u) => {
    if (!s.ruinsBelegost || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === RB.tunnel)
      return [
        fx("rbTravelResources", {
          value: 1,
          text: "Darkened Tunnel",
          player: first,
        }),
      ];
    if (u.code === RB.lair)
      return [
        fx("rbTravelResources", {
          value: playerOrder(s).length,
          text: "Naurlhûg's Lair",
          player: first,
        }),
      ];
    if (u.code === RB.chamber) return [fx("rbTravelThreat", { player: first })];
    if (u.code === RB.treasury)
      return playerOrder(s).map((player) =>
        fx("rbTreasuryDiscard", { player }),
      );
    return undefined;
  },
  // Discover X when a location becomes active; then Secret Chamber's Response.
  travelEntered: (s, u, actualTravel) => {
    if (!s.ruinsBelegost || u.blanked) return;
    const first = firstPlayer(s);
    prepend(
      s,
      ...(printedDiscover(u.code)
        ? [fx("rbDiscover", { target: u.id, player: first })]
        : []),
      ...(actualTravel && u.code === RB.chamber
        ? [fx("rbChamber", { target: u.id, player: first })]
        : []),
    );
  },
  explored: (s, u, wasActive) => {
    const q = s.ruinsBelegost;
    if (!q) return;
    // 2D: a resource on the stage for each explored active location.
    if (wasActive && at(s, RB.deeper)) {
      q.questResources += 1;
      log(
        s,
        `Deeper into the Past: a resource is placed on the stage (${q.questResources}).`,
        "good",
      );
    }
    if (u.code === RB.lair && !u.blanked)
      prepend(s, fx("rbLairLoot", { player: firstPlayer(s) }));
  },
  abilityLabel: (c) => LOOT_LABELS[c],
  abilityProblem: (s, u, attachmentId) => lootProblem(s, u, attachmentId),
  ability: (s, u, attachmentId) => {
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || !LOOT_LABELS[a.code] || lootProblem(s, u, attachmentId))
      return false;
    const p = activeSeat(s);
    a.exhausted = true;
    choose(
      s,
      `${card(a.code).name} · Choose a target${seatLabel(s, p)}`,
      lootTargets(s, a.code),
      card(a.code).text,
    );
    return true;
  },
  effect: rbEffect,
  sharedEffect: (e) =>
    [
      "rbDefeatQuest",
      "rbNextStage",
      "rbLurker",
      "rbReshuffle",
      "rbDeeper",
      "rbBeast",
      "rbStalking",
      "rbTravelReturn",
      "rbDiscover",
      "rbDiscoverLoot",
      "rbDiscoverHazard",
      "rbDiscoverEnd",
      "rbAttachLoot",
      "rbClaim",
      "rbLairLoot",
      "rbChamber",
      "rbTravelResources",
      "rbTravelThreat",
      "rbTreacheryDone",
    ].includes(e.kind),
};

/** Sword of Belegost: exhaust it to cancel a shadow effect just triggered. */
export function ruinsBelegostShadowOptions(
  s: GameState,
  shadowCode: string,
  effectiveShadow = !!card(shadowCode).shadow,
): Option[] {
  if (!s.ruinsBelegost || !effectiveShadow) return [];
  return playerOrder(s).flatMap((p) =>
    seatView(s, p).heroes.flatMap((h) =>
      h.attachments
        .filter((a) => a.code === RB.sword && !a.exhausted && !a.blanked)
        .map((a) => ({
          id: `sword-${a.id}`,
          label: `Exhaust Sword of Belegost · ${name(h)}`,
          code: RB.sword,
          effects: [
            fx("exhaustAttachment", {
              target: h.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
    ),
  );
}
