import type { Effect, GameState, Unit } from "./types";
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
  shuffle,
  stagingThreat,
  stats,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
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
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import {
  SA,
  SA_ARCHERY,
  SA_STAGE,
  SA_TEAM_QUESTS,
  saCityStrength,
  saRecipe,
  saStageInfo,
  saTeams,
  saVictory,
} from "./annuminas-support";
export * from "./annuminas-support";

/**
 * The Siege of Annúminas (2016 Gen Con event, print-on-demand Q99.08), in
 * standard game mode: the players rebuild the defenses while the forces of
 * Angmar gather, defend the city until enough of the host lies in the
 * victory display, and lead a sortie to defeat the Lieutenant of Angmar. The
 * city strength of Annúminas, 20 at the start, falls with every enemy and
 * siege engine at the end of each round; at 0 the players lose.
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
const at = (s: GameState, code: string) =>
  s.annuminas?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isEnemyCode = (c: string) => card(c).type_code === "enemy";
const isLocationCode = (c: string) => card(c).type_code === "location";
const phaseKey = (s: GameState) =>
  s.phase === "defense" || s.phase === "attack"
    ? "combat"
    : s.phase === "staging"
      ? "quest"
      : s.phase;
const enemiesInPlay = (s: GameState) => [
  ...s.staging.filter((u) => isEnemy(u)),
  ...globalEngaged(s),
];
const anyLive = (s: GameState, c: string) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => live(u, c));
/** In epic multiplayer mode, a card is in a victory display if it is in any team's. */
const inVictory = (s: GameState, c: string) => saVictory(s).includes(c);
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** Annúminas takes damage: the city strength falls; at 0 the players lose. */
function damageCity(s: GameState, n: number, source: string) {
  if (n <= 0 || s.status !== "playing") return;
  const strength = Math.max(0, saCityStrength(s) - n);
  setCity(s, strength);
  log(
    s,
    `${source}: Annúminas takes ${n} damage (city strength ${strength}).`,
    "danger",
  );
  if (strength <= 0)
    lose(
      s,
      "The city strength of Annúminas reaches 0: the city is overrun by the forces of Angmar and the players lose the game.",
    );
}
function fromAside(s: GameState, c: string) {
  const q = s.annuminas!;
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
function takeFrom(list: string[], c: string) {
  const i = list.lastIndexOf(c);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
function reshuffle(s: GameState) {
  if (!s.encounterDiscard.length) return;
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
  log(s, "The encounter discard pile is shuffled into the encounter deck.");
}
function discardUntil(s: GameState, match: (c: string) => boolean) {
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    s.encounterDiscard.push(c);
    if (match(c)) return c;
  }
  return null;
}
/** Remove progress from the main quest; true if any was removed. */
function removeProgress(s: GameState, n: number, source: string) {
  const removed = Math.min(s.progress, n);
  if (removed <= 0) return false;
  s.progress -= removed;
  log(
    s,
    `${source}: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the main quest.`,
    "danger",
  );
  return true;
}
/** Return an engaged enemy to the staging area; its shadow cards are discarded. */
function returnToStaging(s: GameState, u: Unit) {
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
  if (owner === undefined) return false;
  forOwner(s, owner, () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  return true;
}

// ---------------------------------------------------------------------------
// Epic multiplayer mode: three teams at stages A, C and E (src/game/epic.ts).

const epic = (s: GameState) => s.epicTeam !== undefined;
/** A team's stage as its back side reads (1B, 2D, 3F…). */
const sideOf = (t: GameState) => `${t.stage}${"BDF"[t.epicTeam ?? 0]}`;
/** The city strength of Annúminas: one for every team in epic multiplayer mode. */
function setCity(s: GameState, value: number) {
  if (s.epic) s.epic.cityStrength = value;
  else s.annuminas!.cityStrength = value;
}
/** Effects for a team's players: at once for the active team, at another team's next turn. */
function queueFor(s: GameState, team: GameState, effects: Effect[]) {
  if (!effects.length) return;
  if (team === s) prepend(s, ...effects);
  else team.queue = [...effects, ...team.queue];
}
/** An encounter card moves to another team's staging area (its damage and resources stay). */
function moveToTeam(team: GameState, u: Unit) {
  const moved: Unit = {
    ...structuredClone(u),
    id: `c${team.nextId++}`,
    attachments: u.attachments.map((a) => ({
      ...structuredClone(a),
      id: `a${team.nextId++}`,
    })),
    shadows: [],
    revealedShadowCount: 0,
    ...(team.table ? { owner: firstPlayer(team) } : {}),
  };
  delete moved.faceupShadows;
  if (!team.table) delete moved.owner;
  team.staging.push(moved);
  enemyAddedToStaging(team, moved);
  return moved;
}
/** An encounter card leaves its team's staging area or engaged player (its shadow cards are discarded). */
function removeFromPlay(t: GameState, u: Unit) {
  if (t.staging.some((x) => x.id === u.id))
    t.staging = t.staging.filter((x) => x.id !== u.id);
  else {
    const owner = playerOrder(t).find((x) =>
      seatView(t, x).engaged.some((e) => e.id === u.id),
    );
    if (owner === undefined) return false;
    forOwner(t, owner, () => {
      t.engaged = t.engaged.filter((e) => e.id !== u.id);
    });
  }
  t.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  return true;
}
const teamEnemies = (t: GameState) => [
  ...t.staging.filter((u) => isEnemy(u)),
  ...playerOrder(t).flatMap((x) => seatView(t, x).engaged),
];
/** The non-unique enemies worth no victory points at the other stages. */
const otherEnemies = (s: GameState) =>
  saTeams(s)
    .filter((team) => team !== s && team.status === "playing")
    .flatMap((team) =>
      teamEnemies(team)
        .filter((u) => !card(u.code).is_unique && !card(u.code).victory)
        .map((u) => ({ team, u })),
    );
/** The stage-1 quests whose Forced effect places a resource at the beginning of each round. */
const STAGE_ONE: readonly string[] = [SA.rebuild, SA.levee, SA.delay];

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupAnnuminas(s: GameState) {
  const r = saRecipe();
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const aside = section("sharedSetAside");
  const deck = section("sharedEncounterDeck");
  if (epic(s)) return setupEpicTeam(s, aside, deck);
  // 1A: the first player's location is Gate of Annúminas; the other players
  // search for a different location once the opening hands are kept.
  takeFrom(deck, SA.gate);
  s.encounterDeck = shuffle(s, deck);
  s.staging.push(make(s, SA.city));
  s.staging.push(make(s, SA.gate));
  s.annuminas = {
    currentQuest: SA.rebuild,
    advancing: false,
    setAside: [SA.mode, ...aside.filter((c) => c !== SA.city)],
    cityStrength: 20,
    questResources: 0,
    questProgress: null,
    resolving: [],
    weakened: [],
    braced: [],
    pressed: [],
    weary: null,
    unready: [],
  };
  log(
    s,
    "Standard game mode: Annúminas is added to the staging area with a city strength of 20; Gate of Annúminas is added to the staging area. Lieutenant of Angmar, Battering Ram, Enemy Camp, Siege Tunnel, each Host of Angmar and each Dúnedain of Annúminas are set aside.",
    "chapter",
  );
}
/**
 * Epic multiplayer mode: each team sets up its own copy of the scenario. The
 * team at stage 1A adds Annúminas to its staging area (city strength 50);
 * the other teams remove their copies. 1A's first player adds Gate of
 * Annúminas, 1C's players each discard until an enemy or location, and 1E's
 * first player adds Vanguard of Carn Dûm (the other players choose once the
 * opening hands are kept).
 */
function setupEpicTeam(s: GameState, aside: string[], deck: string[]) {
  const team = s.epicTeam!;
  const quest = SA_TEAM_QUESTS[team][0];
  const staged: string[] = [];
  if (team === 0) {
    takeFrom(deck, SA.gate);
    staged.push(SA.city, SA.gate);
    s.encounterDeck = shuffle(s, deck);
  } else if (team === 2) {
    takeFrom(deck, SA.vanguard);
    staged.push(SA.vanguard);
    s.encounterDeck = shuffle(s, deck);
  } else {
    s.encounterDeck = shuffle(s, deck);
    for (const _ of playerOrder(s)) {
      void _;
      const c = discardUntil(s, (x) => isEnemyCode(x) || isLocationCode(x));
      if (!c) break;
      takeFrom(s.encounterDiscard, c);
      staged.push(c);
    }
  }
  for (const c of staged) toStaging(s, c);
  s.annuminas = {
    currentQuest: quest,
    advancing: false,
    setAside: [SA.epicMode, ...aside.filter((c) => c !== SA.city)],
    cityStrength: team === 0 ? 50 : 0,
    questResources: 0,
    questProgress: null,
    resolving: [],
    weakened: [],
    braced: [],
    pressed: [],
    weary: null,
    unready: [],
    captives: [],
  };
  log(
    s,
    `Epic multiplayer mode · stage 1${"ACE"[team]}, ${card(quest).name}: ${
      team === 0
        ? "Annúminas is added to the staging area with a city strength of 50, and Gate of Annúminas is added to the staging area"
        : team === 2
          ? "Vanguard of Carn Dûm is added to the staging area"
          : `each player discards until an enemy or location: ${staged.map((c) => card(c).name).join(", ") || "none"} ${staged.length === 1 ? "is" : "are"} added to the staging area`
    }. Lieutenant of Angmar, Battering Ram, Enemy Camp, Siege Tunnel, each Host of Angmar and each Dúnedain of Annúminas are set aside.`,
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.annuminas;
  if (!q) return false;
  // Epic multiplayer mode: each stage 2 is defeated only at the beginning of
  // the round, once every stage 2 is complete.
  if (epic(s) && SA_STAGE[q.currentQuest] === 2) return true;
  const goal = saStageInfo(s)?.quest ?? 0;
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
  prepend(s, fx("saDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
const NEXT: Record<string, string> = Object.fromEntries(
  SA_TEAM_QUESTS.flatMap((deck) =>
    deck.slice(0, -1).map((c, i) => [c, deck[i + 1]] as const),
  ),
);
function stageEntry(s: GameState): Effect[] {
  const q = s.annuminas!;
  const first = firstPlayer(s);
  const others = playerOrder(s)
    .filter((p) => p !== first)
    .map((player) => fx("reveal", { player }));
  // Stage 2: the Standard Game Mode card's reinforcements, then X enemies.
  if (SA_STAGE[q.currentQuest] === 2)
    return [
      ...(epic(s) ? [] : [fx("saReinforce", { player: first })]),
      fx("saDefendCity", { player: first }),
    ];
  if (q.currentQuest === SA.sortie)
    return [fx("saSortie", { player: first }), ...others];
  // 3C: Enemy Camp; then each player at each stage puts a hero under the
  // main quest at their stage.
  if (q.currentQuest === SA.captives)
    return [
      fx("saCaptivesEntry", { player: first }),
      ...others,
      fx("saCaptiveAll", { player: first }),
    ];
  // 3E: Siege Tunnel.
  if (q.currentQuest === SA.stopAttack)
    return [fx("saStopAttackEntry", { player: first }), ...others];
  return [];
}

// ---------------------------------------------------------------------------
// Encounter cards.

const TREACHERIES: readonly string[] = [
  SA.hordes,
  SA.sorcery,
  SA.press,
  SA.weary,
];
function encounter(s: GameState, c: string, replay = false, fromReveal = true) {
  const q = s.annuminas;
  if (!q) return false;
  const player = activeSeat(s);
  // Dúnedain of Annúminas: a player may spend 1 resource to take control.
  if (c === SA.dunedain) {
    if (!fromReveal) return true;
    const placed = [...s.staging].reverse().find((u) => u.code === c);
    if (placed) s.staging = s.staging.filter((u) => u.id !== placed.id);
    // The card waits among the resolving cards until a player pays for it.
    const held = placed ?? make(s, c);
    q.resolving.push(held);
    prepend(s, fx("saDunedain", { source: held.id, player }));
    return true;
  }
  if (!TREACHERIES.includes(c)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(c);
    return true;
  }
  if (replay) takeFrom(s.encounterDiscard, c);
  const u = make(s, c);
  q.resolving.push(u);
  prepend(
    s,
    ...playerOrder(s).map((p) =>
      fx("saTreachery", { code: c, source: u.id, player: p }),
    ),
    fx("saTreacheryDone", { source: u.id, player }),
  );
  return true;
}

/** The shadow effects of this encounter deck. */
function shadow(s: GameState, c: string) {
  const combat = s.combat;
  if (!combat || !s.annuminas) return false;
  const p = combat.attackPlayer ?? activeSeat(s);
  const q = s.annuminas;
  const defenders = (
    combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
  )
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (c) {
    case SA.dunedain:
      for (const d of defenders) d.exhausted = false;
      if (defenders.length) combat.saDefense = (combat.saDefense ?? 0) + 2;
      log(
        s,
        defenders.length
          ? "Dúnedain of Annúminas: the defending character readies and gets +2 defense for this attack."
          : "Dúnedain of Annúminas: there is no defending character.",
        "good",
      );
      return true;
    case SA.orc:
      for (const d of defenders) q.weakened.push({ id: d.id, round: s.round });
      log(
        s,
        "Orc of Angmar: the defender gets -2 defense until the end of the round.",
        "danger",
      );
      return true;
    case SA.rider:
      prepend(s, fx("saExhaust", { text: "Angmar Warg-rider", player: p }));
      return true;
    case SA.werewolf:
      combat.extraAttacks = (combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "Savage Werewolf: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case SA.vanguard:
      for (const d of defenders) q.unready.push({ id: d.id, round: s.round });
      log(
        s,
        "Vanguard of Carn Dûm: the defender cannot ready this round.",
        "danger",
      );
      return true;
    case SA.hordes:
      combat.saRevealOnKill = true;
      log(
        s,
        "The Hordes of Angmar: if this attack destroys a character, the top encounter card is revealed.",
        "danger",
      );
      return true;
    case SA.sorcery:
      prepend(
        s,
        fx("saDiscardAttachment", { text: "Sorcery of Carn Dûm", player: p }),
      );
      return true;
    case SA.press:
      prepend(s, fx("saPressShadow", { target: combat.enemyId, player: p }));
      return true;
    case SA.weary: {
      const damaged = defenders.some((d) => d.damage > 0);
      combat.attackBonus += damaged ? 2 : 1;
      log(
        s,
        `Weary Warriors: the attacking enemy gets +${damaged ? 2 : 1} attack.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

function saEffect(s: GameState, e: Effect): boolean {
  const q = s.annuminas;
  if (!q || !e.kind.startsWith("sa")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "saSetupSearch": {
      const taken = new Set(s.staging.map((u) => u.code));
      const options = [
        ...new Set(
          s.encounterDeck.filter((c) => isLocationCode(c) && !taken.has(c)),
        ),
      ];
      if (!options.length) return true;
      choose(
        s,
        `Rebuild the Defenses · Search for a different location${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("saSearchTake", { text: c, player: p })],
        })),
        card(SA.rebuild).text,
      );
      return true;
    }
    case "saSearchTake": {
      const c = e.text ?? "";
      if (!takeFrom(s.encounterDeck, c) && !takeFrom(s.encounterDiscard, c))
        return true;
      toStaging(s, c);
      log(s, `${card(c).name} is added to the staging area.`);
      return true;
    }
    case "saShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      return true;
    case "saDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("saNextStage", { player: first }));
      return true;
    }
    case "saNextStage": {
      q.advancing = false;
      const next = NEXT[q.currentQuest];
      if (!next) return true;
      q.currentQuest = next;
      q.questResources = 0;
      s.stage = SA_STAGE[next];
      s.progress = 0;
      log(s, `${card(next).name} begins.`, "chapter");
      prepend(s, ...stageEntry(s));
      return true;
    }
    // 1B (1D, 1F): a resource at the beginning of each round; at 4, stage 2.
    case "saRebuild": {
      if (!STAGE_ONE.includes(q.currentQuest)) return true;
      q.questResources += 1;
      log(
        s,
        `${card(q.currentQuest).name}: a resource is placed on the stage (${q.questResources} of 4).`,
      );
      if (q.questResources >= 4) {
        q.advancing = true;
        prepend(s, fx("saDefeatQuest", { player: first }));
      }
      return true;
    }
    // Standard Game Mode: the Dúnedain and X Hosts of Angmar join the deck.
    case "saReinforce": {
      const dunedain = q.setAside.filter((c) => c === SA.dunedain);
      for (const c of dunedain) fromAside(s, c);
      const x = Math.max(1, playerOrder(s).length - 1);
      const hosts: string[] = [];
      for (let i = 0; i < x; i++)
        if (fromAside(s, SA.host)) hosts.push(SA.host);
      s.encounterDeck = shuffle(s, [...s.encounterDeck, ...dunedain, ...hosts]);
      log(
        s,
        `Standard Game Mode: ${dunedain.length} Dúnedain of Annúminas and ${hosts.length} Host${hosts.length === 1 ? "" : "s"} of Angmar are shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    // 2A: discard until X enemies; they enter the staging area.
    case "saDefendCity": {
      reshuffle(s);
      const x = Math.max(1, playerOrder(s).length - 1);
      const found: string[] = [];
      while (found.length < x) {
        const c = discardUntil(s, isEnemyCode);
        if (!c) break;
        takeFrom(s.encounterDiscard, c);
        found.push(c);
      }
      for (const c of found) toStaging(s, c);
      log(
        s,
        `${card(q.currentQuest).name}: ${found.map((c) => card(c).name).join(", ") || "no enemy"} ${found.length === 1 ? "is" : "are"} added to the staging area.`,
        "danger",
      );
      return true;
    }
    // 3A: Battering Ram and Lieutenant of Angmar enter the staging area.
    case "saSortie": {
      reshuffle(s);
      for (const c of [SA.ram, SA.lieutenant])
        if (fromAside(s, c)) toStaging(s, c);
      log(
        s,
        "Lead the Sortie: Battering Ram and Lieutenant of Angmar are added to the staging area.",
        "danger",
      );
      return true;
    }
    // 2B: the highest-attack enemy in the staging area attacks each player.
    case "saStagingAttacks": {
      const enemy = [...s.staging]
        .filter((u) => isEnemy(u) && !u.blanked)
        .sort((a, b) => stats(s, b).attack - stats(s, a).attack)[0];
      if (!enemy) {
        log(
          s,
          "Defend the City: no enemy in the staging area attacks, so the top encounter card is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: first }));
        return true;
      }
      log(
        s,
        `Defend the City: ${name(enemy)} makes an attack against each player.`,
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("immediateAttack", { target: enemy.id, player }),
        ),
      );
      return true;
    }
    // End of the round.
    // Annúminas: 1 damage for each enemy at each stage.
    case "saCityDamage": {
      const n = epic(s)
        ? saTeams(s).reduce((sum, t) => sum + teamEnemies(t).length, 0)
        : enemiesInPlay(s).length;
      if (n) damageCity(s, n, "Annúminas");
      return true;
    }
    case "saRam": {
      const ram = s.staging
        .concat(allActiveLocations(s))
        .find((u) => live(u, SA.ram));
      if (!ram) return true;
      ram.resources += 1;
      damageCity(s, 1 + ram.resources, "Battering Ram");
      return true;
    }
    case "saWall": {
      const wall = [...s.staging, ...allActiveLocations(s)].find(
        (u) => u.id === e.target,
      );
      if (!wall) return true;
      wall.resources += 1;
      log(s, `City Wall: a resource is placed on it (${wall.resources} of 3).`);
      if (wall.resources >= 3) {
        if (s.activeLocation?.id === wall.id) s.activeLocation = null;
        s.staging = s.staging.filter((u) => u.id !== wall.id);
        s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
          (u) => u.id !== wall.id,
        );
        s.encounterDiscard.push(wall.code);
        log(s, "City Wall is discarded.", "danger");
        damageCity(s, 4, "City Wall");
        if (s.status === "playing") prepend(s, fx("reveal", { player: first }));
      }
      return true;
    }
    // Siege Tunnel: each team discards until an enemy, which it stages.
    case "saTunnel": {
      for (const t of saTeams(s)) {
        const c = discardUntil(t, isEnemyCode);
        if (c) {
          takeFrom(t.encounterDiscard, c);
          toStaging(t, c);
        }
        log(
          s,
          `Siege Tunnel${epic(s) ? ` · stage ${sideOf(t)}` : ""}: ${c ? `${card(c).name} is added to the staging area` : "no enemy is discarded"}.`,
          "danger",
        );
      }
      return true;
    }
    case "saLieutenant": {
      const lt = enemiesInPlay(s).find((u) => live(u, SA.lieutenant));
      if (!lt) return true;
      // Epic multiplayer mode: he moves once a round, to the staging area
      // with the lowest total threat at any stage (this one when tied).
      if (s.epic) {
        if (s.epic.lieutenantRound === s.round) return true;
        s.epic.lieutenantRound = s.round;
        const teams = saTeams(s);
        const threat = teams.map((t) => stagingThreat(t));
        const low = Math.min(...threat);
        const to =
          threat[s.epicTeam!] === low ? s.epicTeam! : threat.indexOf(low);
        if (to !== s.epicTeam) {
          const target = teams[to];
          removeFromPlay(s, lt);
          const moved = moveToTeam(target, lt);
          log(
            s,
            `Lieutenant of Angmar moves to the staging area at stage ${sideOf(target)} (the lowest total threat, ${low}) and makes an immediate attack against its first player.`,
            "danger",
          );
          log(
            target,
            `Lieutenant of Angmar moves here from stage ${sideOf(s)} and makes an immediate attack against the first player.`,
            "danger",
          );
          queueFor(s, target, [
            fx("immediateAttack", {
              target: moved.id,
              player: firstPlayer(target),
            }),
          ]);
          return true;
        }
      }
      returnToStaging(s, lt);
      log(
        s,
        "Lieutenant of Angmar moves to the staging area and makes an immediate attack against the first player.",
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: lt.id, player: first }));
      return true;
    }
    case "saRebuildResponse":
      choose(
        s,
        `Rebuild the Defenses · Remove 10 progress to increase the city strength by 10?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label: "Remove 10 progress: Annúminas gains 10 city strength",
            effects: [fx("saStrengthen", { player: first })],
          },
          { id: "skip", label: "Keep the progress", effects: [] },
        ],
        card(SA.rebuild).back_text,
      );
      return true;
    case "saStrengthen":
      if (s.progress < 10) return true;
      s.progress -= 10;
      setCity(s, saCityStrength(s) + 10);
      log(
        s,
        `Rebuild the Defenses: 10 progress is removed; the city strength of Annúminas rises to ${saCityStrength(s)}.`,
        "good",
      );
      return true;
    case "saHeal": {
      const damaged = charactersOf(s, p).filter((u) => u.damage > 0);
      if (!damaged.length) return true;
      choose(
        s,
        `Defend the City · Heal 1 damage from a character you control${seatLabel(s, p)}`,
        [
          ...damaged.map((u) => ({
            id: u.id,
            label: `${name(u)} · ${u.damage} damage`,
            effects: [fx("heal", { target: u.id, value: 1, player: p })],
          })),
          { id: "skip", label: "Do not heal", effects: [] },
        ],
        card(SA.defend).back_text,
      );
      return true;
    }
    case "saSortieWin":
      if (inVictory(s, SA.lieutenant))
        win(
          s,
          epic(s)
            ? "Lieutenant of Angmar is in a victory display at the end of the round: the players have routed the enemy and won the game."
            : "Lieutenant of Angmar is in the victory display at the end of the round: the players have routed the enemy and win the game.",
        );
      return true;
    // -----------------------------------------------------------------------
    // Epic multiplayer mode.
    // 1E Setup: each other player searches for a different enemy.
    case "saSetupEnemy": {
      const taken = new Set(s.staging.map((u) => u.code));
      const options = [
        ...new Set(
          s.encounterDeck.filter((c) => isEnemyCode(c) && !taken.has(c)),
        ),
      ];
      if (!options.length) return true;
      choose(
        s,
        `Delay the Enemy · Search for a different enemy${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("saSearchTake", { text: c, player: p })],
        })),
        card(SA.delay).text,
      );
      return true;
    }
    // Each stage 2 is defeated at the beginning of the round, and only once
    // every stage 2 is complete (a stage already past it counts as complete).
    case "saEpicDefeat": {
      if (SA_STAGE[q.currentQuest] !== 2 || q.advancing || s.stageRevealing)
        return true;
      const hosts = saVictory(s).filter((c) => c === SA.host).length;
      const goal = Math.max(0, 50 - 10 * hosts);
      const complete = (team: GameState) =>
        team.stage > 2 || (team.stage === 2 && team.progress >= goal);
      if (!saTeams(s).every(complete)) return true;
      log(
        s,
        `Each stage 2 is complete (${goal} quest points): ${card(q.currentQuest).name} is defeated at the beginning of the round.`,
        "good",
      );
      q.advancing = true;
      prepend(s, fx("saDefeatQuest", { player: first }));
      return true;
    }
    // 2F: a set-aside Host of Angmar (from any stage's set aside area).
    case "saManWalls": {
      if (!at(s, SA.manWalls)) return true;
      const from = [s, ...saTeams(s).filter((team) => team !== s)].find(
        (team) => team.annuminas?.setAside.includes(SA.host),
      );
      if (!from) return true;
      takeFrom(from.annuminas!.setAside, SA.host);
      toStaging(s, SA.host);
      log(
        s,
        `Man the Walls: a set-aside Host of Angmar${from === s ? "" : ` (from stage ${sideOf(from)})`} is added to the staging area.`,
        "danger",
      );
      return true;
    }
    // 3C: Enemy Camp enters the staging area.
    case "saCaptivesEntry": {
      reshuffle(s);
      if (fromAside(s, SA.camp)) toStaging(s, SA.camp);
      log(
        s,
        "Rescue the Captives: Enemy Camp is added to the staging area.",
        "danger",
      );
      return true;
    }
    // 3C: each player at each stage puts a hero under their stage's main quest.
    case "saCaptiveAll":
      for (const team of saTeams(s))
        queueFor(
          s,
          team,
          playerOrder(team).map((player) => fx("saCaptive", { player })),
        );
      return true;
    case "saCaptive": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Rescue the Captives · Choose a hero to place facedown under the main quest${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("saCaptiveTake", { target: h.id, player: p })],
        })),
        card(SA.captives).text,
      );
      return true;
    }
    case "saCaptiveTake": {
      const hero = seatView(s, p).heroes.find((h) => h.id === e.target);
      if (!hero) return true;
      for (const a of [...hero.attachments])
        discardAttachment(s, hero, a, true);
      forOwner(s, p, () => {
        s.heroes = s.heroes.filter((h) => h.id !== hero.id);
      });
      (q.captives ??= []).push({ code: hero.code, owner: p });
      log(
        s,
        `${name(hero)} is placed facedown under the main quest (its tokens and attachments are discarded).`,
        "danger",
      );
      return true;
    }
    // 3E: Siege Tunnel enters the staging area.
    case "saStopAttackEntry": {
      reshuffle(s);
      if (fromAside(s, SA.tunnel)) toStaging(s, SA.tunnel);
      log(
        s,
        "Stop the Attack: Siege Tunnel is added to the staging area.",
        "danger",
      );
      return true;
    }
    // Enemy Camp: a random captive hero at each stage 3 is discarded, or,
    // with Enemy Camp in a victory display, each captive returns.
    case "saCamp": {
      const freed = inVictory(s, SA.camp);
      for (const team of saTeams(s)) {
        const held = team.annuminas?.captives ?? [];
        if (!held.length) continue;
        if (freed) {
          for (const h of held.splice(0))
            forOwner(team, h.owner, () => {
              const hero = make(team, h.code);
              hero.owner = team.table ? h.owner : hero.owner;
              team.heroes.push(hero);
            });
          log(
            s,
            `Enemy Camp is in a victory display: each hero under stage ${sideOf(team)} returns to its owner's control.`,
            "good",
          );
        } else {
          const [h] = held.splice(Math.floor(random(s) * held.length), 1);
          forOwner(team, h.owner, () => team.discard.push(h.code));
          log(
            s,
            `Enemy Camp: ${card(h.code).name} is discarded from under stage ${sideOf(team)}.`,
            "danger",
          );
        }
      }
      return true;
    }
    // 1D: remove 10 progress; the first player at each stage takes control
    // of a set-aside Dúnedain of Annúminas.
    case "saLeveeResponse":
      choose(
        s,
        `Raise the Levee · Remove 10 progress to give each stage's first player a Dúnedain of Annúminas?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label:
              "Remove 10 progress: the first player at each stage takes control of a set-aside Dúnedain of Annúminas",
            effects: [fx("saLevee", { player: first })],
          },
          { id: "skip", label: "Keep the progress", effects: [] },
        ],
        card(SA.levee).back_text,
      );
      return true;
    case "saLevee": {
      if (s.progress < 10) return true;
      s.progress -= 10;
      for (const team of saTeams(s)) {
        if (!team.annuminas || !takeFrom(team.annuminas.setAside, SA.dunedain))
          continue;
        const lead = firstPlayer(team);
        forOwner(team, lead, () => {
          const ally = make(team, SA.dunedain);
          if (team.table) ally.owner = lead;
          team.allies.push(ally);
        });
        log(
          s,
          `Raise the Levee: the first player at stage ${sideOf(team)} takes control of a set-aside Dúnedain of Annúminas.`,
          "good",
        );
      }
      return true;
    }
    // 1F: remove 10 progress; the players at each other stage reveal 1 fewer
    // encounter card during their next quest phase.
    case "saDelayResponse":
      choose(
        s,
        `Delay the Enemy · Remove 10 progress so that each other stage reveals 1 fewer encounter card?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label:
              "Remove 10 progress: the players at each other stage reveal 1 fewer encounter card during their next quest phase",
            effects: [fx("saDelayFewer", { player: first })],
          },
          { id: "skip", label: "Keep the progress", effects: [] },
        ],
        card(SA.delay).back_text,
      );
      return true;
    case "saDelayFewer": {
      if (s.progress < 10) return true;
      s.progress -= 10;
      for (const team of saTeams(s).filter((x) => x !== s))
        if (team.annuminas)
          team.annuminas.fewerReveals = { round: s.round + 1, value: 1 };
      log(
        s,
        "Delay the Enemy: 10 progress is removed; the players at each other stage reveal 1 fewer encounter card during their next quest phase.",
        "good",
      );
      return true;
    }
    // 2B, 2D and 2F: choose a stage; each player at that stage heals 1
    // damage, adds 1 resource to a hero or draws 1 card.
    case "saChooseStage": {
      const kind = e.text ?? "heal";
      const what =
        kind === "heal"
          ? "each player heals 1 damage from a character he controls"
          : kind === "resource"
            ? "each player adds 1 resource to a hero he controls"
            : "each player draws 1 card";
      choose(
        s,
        `${card(q.currentQuest).name} · Choose a stage: ${what}${seatLabel(s, first)}`,
        [
          ...saTeams(s)
            .filter((team) => team.status === "playing")
            .map((team) => ({
              id: `stage-${team.epicTeam}`,
              label: `Stage ${sideOf(team)}${team === s ? " (this stage)" : ""}: ${what}`,
              effects: [
                fx("saStageReward", {
                  text: kind,
                  value: team.epicTeam,
                  player: first,
                }),
              ],
            })),
          { id: "skip", label: "Choose no stage", effects: [] },
        ],
        card(q.currentQuest).back_text,
      );
      return true;
    }
    case "saStageReward": {
      const team = saTeams(s)[e.value ?? 0];
      if (!team) return true;
      const kind = e.text ?? "heal";
      queueFor(
        s,
        team,
        playerOrder(team).map((player) =>
          kind === "heal"
            ? fx("saHeal", { player })
            : kind === "resource"
              ? fx("saGateResource", { player })
              : fx("draw", { value: 1, player }),
        ),
      );
      log(
        s,
        `${card(q.currentQuest).name}: stage ${sideOf(team)} is chosen.`,
        "good",
      );
      return true;
    }
    case "saGateResource": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Guard the Gate · Add 1 resource to a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("resource", { target: h.id, value: 1, player: p })],
        })),
        card(SA.guard).back_text,
      );
      return true;
    }
    // Epic Multiplayer Mode (stage 2): each Host of Angmar in the staging
    // area moves to the next staging area (2F to 2D, 2D to 2B); at 2B it is
    // discarded and Annúminas takes 9 damage.
    case "saHostsMove": {
      const hosts = s.staging.filter((u) => u.code === SA.host);
      if (!hosts.length) return true;
      const team = s.epicTeam!;
      const target = team > 0 ? saTeams(s)[team - 1] : undefined;
      for (const host of hosts) {
        removeFromPlay(s, host);
        if (!target) {
          s.encounterDiscard.push(host.code);
          damageCity(s, 9, "Host of Angmar cannot move and is discarded");
        } else {
          moveToTeam(target, host);
          log(
            s,
            `Host of Angmar moves to the staging area at stage ${sideOf(target)}.`,
            "danger",
          );
          log(
            target,
            `Host of Angmar moves here from stage ${sideOf(s)}.`,
            "danger",
          );
        }
      }
      return true;
    }
    // 3B, 3D and 3F: raise each player's threat by 1 and reveal an encounter
    // card to discard a non-unique enemy worth no victory points at another
    // stage.
    case "saThreeResponse": {
      if (!otherEnemies(s).length) return true;
      choose(
        s,
        `${card(q.currentQuest).name} · Raise each player's threat by 1 and reveal an encounter card to discard an enemy at another stage?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label:
              "Raise each player's threat by 1 and reveal an encounter card, then discard a non-unique enemy worth no victory points at another stage",
            effects: [fx("saThreeUse", { player: first })],
          },
          { id: "skip", label: "Do not use it", effects: [] },
        ],
        card(q.currentQuest).back_text,
      );
      return true;
    }
    case "saThreeUse":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      prepend(
        s,
        fx("reveal", { player: first }),
        fx("saDiscardOther", { player: first }),
      );
      return true;
    case "saDiscardOther": {
      const candidates = otherEnemies(s);
      if (!candidates.length) return true;
      choose(
        s,
        `${card(q.currentQuest).name} · Discard a non-unique enemy worth no victory points at another stage${seatLabel(s, first)}`,
        candidates.map(({ team, u }) => ({
          id: `${team.epicTeam}-${u.id}`,
          code: u.code,
          label: `${name(u)} · stage ${sideOf(team)}`,
          effects: [
            fx("saDiscardOtherTake", {
              value: team.epicTeam,
              target: u.id,
              player: first,
            }),
          ],
        })),
        card(q.currentQuest).back_text,
      );
      return true;
    }
    case "saDiscardOtherTake": {
      const team = saTeams(s)[e.value ?? -1];
      const u = team && teamEnemies(team).find((x) => x.id === e.target);
      if (!team || !u || !removeFromPlay(team, u)) return true;
      team.encounterDiscard.push(u.code);
      log(s, `${name(u)} is discarded from stage ${sideOf(team)}.`, "good");
      log(
        team,
        `${name(u)} is discarded by the players at stage ${sideOf(s)}.`,
        "good",
      );
      return true;
    }
    // Dúnedain of Annúminas.
    case "saDunedain": {
      const payers = playerOrder(s).filter((x) =>
        seatView(s, x).heroes.some((h) => h.resources > 0),
      );
      choose(
        s,
        `Dúnedain of Annúminas · Spend 1 resource to take control of it?${seatLabel(s, first)}`,
        [
          ...payers.flatMap((x) =>
            seatView(s, x)
              .heroes.filter((h) => h.resources > 0)
              .map((h) => ({
                id: h.id,
                label: `Spend 1 resource from ${name(h)}${s.table ? ` (${seatName(s, x)})` : ""}`,
                effects: [
                  fx("saDunedainJoin", {
                    source: h.id,
                    target: e.source,
                    player: x,
                  }),
                ],
              })),
          ),
          {
            id: "skip",
            label: "Discard Dúnedain of Annúminas",
            effects: [
              fx("saDunedainDiscard", { target: e.source, player: first }),
            ],
          },
        ],
        card(SA.dunedain).text,
      );
      return true;
    }
    case "saDunedainJoin": {
      const held = q.resolving.find((u) => u.id === e.target);
      if (!held) return true;
      q.resolving = q.resolving.filter((u) => u.id !== held.id);
      const hero = get(s, e.source);
      if (!hero || hero.resources < 1) {
        s.encounterDiscard.push(SA.dunedain);
        return true;
      }
      hero.resources -= 1;
      forOwner(s, p, () => {
        held.owner = p;
        s.allies.push(held);
      });
      log(
        s,
        `${who(s, p)} ${verb(s, "take")} control of Dúnedain of Annúminas.`,
        "good",
      );
      return true;
    }
    case "saDunedainDiscard": {
      const held = q.resolving.find((u) => u.id === e.target);
      if (!held) return true;
      q.resolving = q.resolving.filter((u) => u.id !== held.id);
      s.encounterDiscard.push(SA.dunedain);
      log(s, "Dúnedain of Annúminas is discarded.");
      return true;
    }
    // Treacheries: each player's part, then the card goes to the discard pile.
    case "saTreachery": {
      switch (e.code) {
        case SA.hordes:
          prepend(s, fx("saHordes", { player: p }));
          return true;
        case SA.sorcery:
          prepend(s, fx("saSorcery", { player: p }));
          return true;
        case SA.press:
          prepend(s, fx("saPress", { player: p }));
          return true;
        case SA.weary:
          prepend(s, fx("saWeary", { player: p }));
          return true;
      }
      return true;
    }
    case "saTreacheryDone": {
      const i = q.resolving.findIndex((u) => u.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    case "saHordes": {
      const engaged = seatView(s, p).engaged.filter((u) => isEnemy(u));
      const highest = [...engaged].sort(
        (a, b) => (card(b.code).threat ?? 0) - (card(a.code).threat ?? 0),
      )[0];
      const searchable = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(isEnemyCode),
        ),
      ];
      choose(
        s,
        `The Hordes of Angmar · Return your highest threat enemy, or put an enemy into play engaged with you${seatLabel(s, p)}`,
        [
          ...(highest
            ? [
                {
                  id: "return",
                  label: `Return ${name(highest)} to the staging area`,
                  effects: [fx("saReturn", { target: highest.id, player: p })],
                },
              ]
            : []),
          ...searchable.map((c) => ({
            id: c,
            code: c,
            label: `Put ${card(c).name} into play engaged with you`,
            effects: [fx("saEngageFromDeck", { text: c, player: p })],
          })),
        ],
        card(SA.hordes).text,
      );
      return true;
    }
    case "saReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, `${name(u)} returns to the staging area.`);
      return true;
    }
    case "saEngageFromDeck": {
      const c = e.text ?? "";
      if (!takeFrom(s.encounterDeck, c) && !takeFrom(s.encounterDiscard, c))
        return true;
      s.encounterDeck = shuffle(s, s.encounterDeck);
      enterEnemyEngaged(s, make(s, c), p);
      log(
        s,
        `${card(c).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    case "saSorcery": {
      const owned = charactersOf(s, p).flatMap((u) =>
        u.attachments.map((a) => ({ u, a })),
      );
      const x = owned.length;
      const highest = [...owned].sort(
        (a, b) =>
          (Number(card(b.a.code).cost) || 0) -
          (Number(card(a.a.code).cost) || 0),
      )[0];
      if (!x) {
        log(
          s,
          `Sorcery of Carn Dûm: ${who(s, p)} ${verb(s, "control")} no attachment.`,
        );
        return true;
      }
      choose(
        s,
        `Sorcery of Carn Dûm · Discard your highest cost attachment, or assign ${x} damage${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: `Discard ${card(highest.a.code).name}`,
            effects: [
              fx("saDiscardOne", {
                target: highest.u.id,
                source: highest.a.id,
                player: p,
              }),
            ],
          },
          {
            id: "damage",
            label: `Assign ${x} damage among characters you control`,
            effects: [
              fx("saAssign", {
                value: x,
                text: "Sorcery of Carn Dûm",
                player: p,
              }),
            ],
          },
        ],
        card(SA.sorcery).text,
      );
      return true;
    }
    case "saAssign": {
      const left = e.value ?? 0;
      if (left <= 0) return true;
      const targets = charactersOf(s, p).filter(
        (u) => u.damage < stats(s, u).health,
      );
      if (!targets.length) return true;
      choose(
        s,
        `${e.text} · Assign damage among characters you control · ${left} remaining${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          label: `${name(u)} · ${u.damage} damage`,
          effects: [
            fx("damage", { target: u.id, value: 1 }),
            fx("saAssign", { value: left - 1, text: e.text, player: p }),
          ],
        })),
        card(SA.sorcery).text,
      );
      return true;
    }
    case "saDiscardAttachment": {
      const owned = charactersOf(s, p).flatMap((u) =>
        u.attachments.map((a) => ({ u, a })),
      );
      if (!owned.length) {
        log(s, `${e.text}: ${who(s, p)} ${verb(s, "control")} no attachment.`);
        return true;
      }
      choose(
        s,
        `${e.text} · Discard an attachment you control${seatLabel(s, p)}`,
        owned.map(({ u, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} (${name(u)})`,
          effects: [
            fx("saDiscardOne", { target: u.id, source: a.id, player: p }),
          ],
        })),
        card(SA.sorcery).shadow,
      );
      return true;
    }
    case "saDiscardOne": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    case "saPress": {
      const questing = charactersOf(s, p).filter((u) => u.committed);
      if (!questing.length) {
        log(
          s,
          `Caught in the Press: ${who(s, p)} ${verb(s, "have")} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `Caught in the Press · 1 damage to each questing character, or -1 willpower for each until the end of the phase${seatLabel(s, p)}`,
        [
          {
            id: "damage",
            label: "Deal 1 damage to each questing character you control",
            effects: questing.map((u) =>
              fx("damage", { target: u.id, value: 1 }),
            ),
          },
          {
            id: "willpower",
            label: "Each questing character you control gets -1 willpower",
            effects: [fx("saPressWill", { player: p })],
          },
        ],
        card(SA.press).text,
      );
      return true;
    }
    case "saPressWill":
      for (const u of charactersOf(s, p).filter((x) => x.committed))
        q.pressed.push({ id: u.id, round: s.round, phase: phaseKey(s) });
      return true;
    case "saPressShadow":
      choose(
        s,
        `Caught in the Press · Remove 2 progress from the main quest, or the attacking enemy returns to the staging area after this attack${seatLabel(s, p)}`,
        [
          {
            id: "progress",
            label: "Remove 2 progress from the main quest",
            effects: [
              fx("saRemoveProgress", {
                value: 2,
                text: "Caught in the Press",
                player: p,
              }),
            ],
          },
          {
            id: "return",
            label:
              "Return the attacking enemy to the staging area after this attack",
            effects: [fx("saReturnAfter", { player: p })],
          },
        ],
        card(SA.press).shadow,
      );
      return true;
    case "saRemoveProgress":
      removeProgress(s, e.value ?? 0, e.text ?? "");
      return true;
    case "saReturnAfter":
      if (s.combat) s.combat.returnToStaging = true;
      return true;
    case "saWeary": {
      const heroes = seatView(s, p).heroes.filter(
        (h) => h.damage < stats(s, h).health,
      );
      if (!heroes.length) return true;
      choose(
        s,
        `Weary Warriors · Deal 1 damage to a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          label: `${name(h)} · ${h.damage} damage`,
          effects: [fx("saWearyHit", { target: h.id, player: p })],
        })),
        card(SA.weary).text,
      );
      return true;
    }
    case "saWearyHit": {
      const h = get(s, e.target);
      if (!h) return true;
      prepend(
        s,
        fx("damage", { target: h.id, value: 1 }),
        fx("saWearyBlank", { target: h.id, player: p }),
      );
      return true;
    }
    case "saWearyBlank": {
      const h = get(s, e.target);
      if (h?.committed) {
        h.committed = false;
        log(
          s,
          `Weary Warriors: ${name(h)} is removed from the quest.`,
          "danger",
        );
      }
      // Each damaged character's text box is blank until the end of the round.
      const ids = [
        ...playerOrder(s).flatMap((x) =>
          charactersOf(s, x)
            .filter((u) => u.damage > 0)
            .map((u) => u.id),
        ),
      ];
      q.weary = {
        round: s.round,
        ids: [
          ...new Set([
            ...(q.weary?.round === s.round ? q.weary.ids : []),
            ...ids,
          ]),
        ],
      };
      return true;
    }
    case "saExhaust": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          label: name(u),
          effects: [fx("saExhaustOne", { target: u.id, player: p })],
        })),
        card(SA.rider).shadow,
      );
      return true;
    }
    case "saExhaustOne": {
      const u = get(s, e.target);
      if (u) exhaustCharacter(s, u);
      return true;
    }
    // Warg of Carn Dûm, Angmar Warg-rider, Orc of Angmar, Host of Angmar.
    case "saEngageChoice": {
      const u = get(s, e.target);
      if (!u) return true;
      const n = e.value ?? 1;
      const options = [
        ...(s.progress > 0
          ? [
              {
                id: "progress",
                label: `Remove ${n} progress from the main quest`,
                effects: [
                  fx("saRemoveProgress", {
                    value: n,
                    text: card(u.code).name,
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        {
          id: "other",
          label: e.text ?? "",
          effects: e.effects ?? [],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `${card(u.code).name} · Remove ${n} progress from the main quest, or ${(e.text ?? "").toLowerCase()}${seatLabel(s, p)}`,
        options,
        card(u.code).text,
      );
      return true;
    }
    case "saBrace": {
      const u = get(s, e.target);
      if (u) q.braced.push({ id: u.id, round: s.round, phase: phaseKey(s) });
      return true;
    }
    case "saHostReturn": {
      const u = get(s, e.target);
      if (u && s.combat?.enemyId === u.id) s.combat.returnToStaging = true;
      else if (u) returnToStaging(s, u);
      return true;
    }
    // Gate of Annúminas: each player engages an enemy in the staging area.
    case "saGateEngage": {
      const enemies = s.staging.filter((u) => isEnemy(u));
      if (!enemies.length) return true;
      choose(
        s,
        `Gate of Annúminas · Engage an enemy in the staging area${seatLabel(s, p)}`,
        enemies.map((u) => ({
          id: u.id,
          label: name(u),
          code: u.code,
          effects: [fx("saGateTake", { target: u.id, player: p })],
        })),
        card(SA.gate).text,
      );
      return true;
    }
    case "saGateTake": {
      const u = s.staging.find((x) => x.id === e.target);
      if (u) forOwner(s, p, () => engage(s, u));
      return true;
    }
    case "saTravelThreat":
      for (const x of playerOrder(s))
        forOwner(s, x, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "saTravelDamage": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Arnor Battlefield · Deal 1 damage to a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          label: `${name(h)} · ${h.damage} damage`,
          effects: [fx("damage", { target: h.id, value: 1 })],
        })),
        card(SA.battlefield).text,
      );
      return true;
    }
    case "saEvendim": {
      reshuffle(s);
      const c = discardUntil(s, isEnemyCode);
      if (c) {
        takeFrom(s.encounterDiscard, c);
        toStaging(s, c);
      }
      log(
        s,
        `Hills of Evendim: ${c ? `${card(c).name} is added to the staging area` : "no enemy is discarded"}.`,
        "danger",
      );
      return true;
    }
    case "saRevealOnKill":
      prepend(s, fx("reveal", { player: first }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

const marked = (
  list: { id: string; round: number; phase?: string }[],
  s: GameState,
  u: Unit,
  phase = false,
) =>
  list.some(
    (m) =>
      m.id === u.id &&
      m.round === s.round &&
      (!phase || m.phase === phaseKey(s)),
  );

export const ANNUMINAS_HOOKS: Batch4ScenarioHooks = {
  setup: setupAnnuminas,
  // 1A Setup: each other player searches for a different location.
  // Epic multiplayer mode: 1C has nothing left to do; 1E's other players
  // each search for a different enemy.
  openingHandsKept: (s) => {
    if (!s.annuminas || s.round > 0) return false;
    const first = firstPlayer(s);
    const search =
      s.epicTeam === 1
        ? undefined
        : s.epicTeam === 2
          ? "saSetupEnemy"
          : "saSetupSearch";
    prepend(
      s,
      ...(search
        ? [
            ...playerOrder(s)
              .filter((p) => p !== first)
              .map((player) => fx(search, { player })),
            fx("saShuffle", { player: first }),
          ]
        : []),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: saStageInfo,
  encounter,
  shadow,
  // 1B (1D, 1F): a resource at the beginning of each round. Epic multiplayer
  // mode: each stage 2 can be defeated then, 2F adds a Host of Angmar, and
  // each team waits for the others before the resource phase.
  resourceStart: (s) => {
    const q = s.annuminas;
    if (!q) return [];
    const first = firstPlayer(s);
    const effects: Effect[] = STAGE_ONE.some((c) => at(s, c))
      ? [fx("saRebuild", { player: first })]
      : [];
    if (!epic(s)) return effects;
    if (s.stage === 2) effects.push(fx("saEpicDefeat", { player: first }));
    if (at(s, SA.manWalls)) effects.push(fx("saManWalls", { player: first }));
    return [...effects, fx("epicRoundBegun")];
  },
  // 2D: 1 additional card; 1F's Response: 1 fewer at the other stages.
  extraStagingReveals: (s) => {
    const q = s.annuminas;
    if (!q) return 0;
    return (
      (at(s, SA.guard) ? 1 : 0) -
      (q.fewerReveals?.round === s.round ? q.fewerReveals.value : 0)
    );
  },
  // 2B: after the commitments, the strongest staged enemy attacks each player.
  committed: (s) => {
    if (s.annuminas && at(s, SA.defend))
      prepend(s, fx("saStagingAttacks", { player: firstPlayer(s) }));
  },
  // Archery: Host of Angmar 2, Orc of Angmar and Angmar Warg-rider 1.
  combatBegin: (s) => {
    if (!s.annuminas) return;
    const archery = enemiesInPlay(s).reduce(
      (n, u) => n + (u.blanked ? 0 : (SA_ARCHERY[u.code] ?? 0)),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  roundEnd: (s) => {
    const q = s.annuminas;
    if (!q) return [];
    const first = firstPlayer(s);
    // Epic multiplayer mode: Annúminas is at stage A only.
    const effects: Effect[] =
      !epic(s) || s.epicTeam === 0
        ? [fx("saCityDamage", { player: first })]
        : [];
    if (anyLive(s, SA.ram)) effects.push(fx("saRam", { player: first }));
    for (const wall of [...s.staging, ...allActiveLocations(s)].filter((u) =>
      live(u, SA.wall),
    ))
      effects.push(fx("saWall", { target: wall.id, player: first }));
    if (anyLive(s, SA.tunnel)) effects.push(fx("saTunnel", { player: first }));
    if (enemiesInPlay(s).some((u) => live(u, SA.lieutenant)))
      effects.push(fx("saLieutenant", { player: first }));
    // Enemy Camp, in play here or in this team's victory display.
    if (
      epic(s) &&
      (anyLive(s, SA.camp) || (s.victoryCards ?? []).includes(SA.camp))
    )
      effects.push(fx("saCamp", { player: first }));
    if (at(s, SA.rebuild) && s.progress >= 10)
      effects.push(fx("saRebuildResponse", { player: first }));
    if (at(s, SA.levee) && s.progress >= 10)
      effects.push(fx("saLeveeResponse", { player: first }));
    if (at(s, SA.delay) && s.progress >= 10)
      effects.push(fx("saDelayResponse", { player: first }));
    // 2B, 2D, 2F: choose a stage (standard mode has only this one).
    if (at(s, SA.defend) && !epic(s))
      effects.push(...playerOrder(s).map((player) => fx("saHeal", { player })));
    else if (at(s, SA.defend))
      effects.push(fx("saChooseStage", { text: "heal", player: first }));
    if (at(s, SA.guard))
      effects.push(fx("saChooseStage", { text: "resource", player: first }));
    if (at(s, SA.manWalls))
      effects.push(fx("saChooseStage", { text: "draw", player: first }));
    // Epic Multiplayer Mode: at stage 2, each staged Host of Angmar moves on.
    const stageTwo = [SA.defend, SA.guard, SA.manWalls].some((c) => at(s, c));
    const stageThree = [SA.sortie, SA.captives, SA.stopAttack].some((c) =>
      at(s, c),
    );
    if (epic(s) && stageTwo) effects.push(fx("saHostsMove", { player: first }));
    if (epic(s) && stageThree)
      effects.push(fx("saThreeResponse", { player: first }));
    if (stageThree) effects.push(fx("saSortieWin", { player: first }));
    return effects;
  },
  // Standard Game Mode: a player eliminated from the game deals Annúminas 9
  // damage (the epic card has its own rule for the last player at a stage).
  playerEliminated: (s) => {
    if (s.annuminas && !epic(s)) damageCity(s, 9, "A player is eliminated");
  },
  progress: (s, amount, quest) => {
    const q = s.annuminas;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    // 3B: no progress while Battering Ram is in play; 3D while Enemy Camp
    // is; 3F while Siege Tunnel is.
    if (at(s, SA.sortie) && anyLive(s, SA.ram)) return 0;
    if (at(s, SA.captives) && anyLive(s, SA.camp)) return 0;
    if (at(s, SA.stopAttack) && anyLive(s, SA.tunnel)) return 0;
    // Vanguard of Carn Dûm: no more than 5 progress on the main quest each round.
    if (s.staging.some((u) => live(u, SA.vanguard))) {
      const placed =
        q.questProgress?.round === s.round ? q.questProgress.amount : 0;
      return Math.max(0, Math.min(amount, 5 - placed));
    }
    return amount;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.annuminas;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    const placed =
      q.questProgress?.round === s.round ? q.questProgress.amount : 0;
    q.questProgress = { round: s.round, amount: placed + amount };
  },
  stats: (s, u) => {
    const q = s.annuminas;
    if (!q) return {};
    let defense = 0,
      will = 0;
    // Dúnedain of Annúminas' shadow: +2 defense to the defender for this attack.
    const c = s.combat;
    if (
      c?.saDefense &&
      (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).includes(u.id)
    )
      defense += c.saDefense;
    if (marked(q.weakened, s, u)) defense -= 2;
    if (marked(q.braced, s, u, true)) defense += 2;
    if (marked(q.pressed, s, u, true)) will -= 1;
    return defense || will ? { defense, will } : {};
  },
  threatBonus: (s, u) => {
    if (!s.annuminas || u.blanked) return 0;
    if (u.code === SA.gate) return 1 + enemiesInPlay(s).length;
    if (u.code === SA.ram) return 1 + u.resources;
    return 0;
  },
  engagementBonus: (s, u) =>
    s.annuminas &&
    !card(u.code).is_unique &&
    s.staging.some((x) => live(x, SA.battlefield))
      ? -5
      : 0,
  damageAmount: (s, u, amount) => {
    if (!s.annuminas || u.blanked) return amount;
    // Lieutenant of Angmar: no damage below 10 progress on the main quest.
    if (u.code === SA.lieutenant && s.progress < 10) return 0;
    return amount;
  },
  immune: (s, u) =>
    !!s.annuminas &&
    !u.blanked &&
    [SA.lieutenant, SA.ram, SA.camp, SA.tunnel, SA.host, SA.wall].includes(
      u.code,
    ),
  cannotAttach: (s, u) => !!s.annuminas && live(u, SA.vanguard),
  cannotCancel: (s, shadowEffect) =>
    !!s.annuminas &&
    !shadowEffect &&
    s.staging.some((u) => live(u, SA.evendim)),
  locationProgressBlocked: (s, u) =>
    !!s.annuminas &&
    s.staging.some((x) => x.id === u.id) &&
    u.code !== SA.nenuial &&
    s.staging.some((x) => live(x, SA.nenuial)),
  cannotReady: (s, u) => !!s.annuminas && marked(s.annuminas.unready, s, u),
  characterBlanked: (s, u) =>
    !!s.annuminas?.weary &&
    s.annuminas.weary.round === s.round &&
    s.annuminas.weary.ids.includes(u.id),
  engaged: (s, u) => {
    if (!s.annuminas || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === SA.warg)
      prepend(
        s,
        fx("saEngageChoice", {
          target: u.id,
          value: 1,
          text: "Exhaust a character you control",
          effects: [fx("saExhaust", { text: "Warg of Carn Dûm", player: p })],
          player: p,
        }),
      );
    if (u.code === SA.rider)
      prepend(
        s,
        fx("saEngageChoice", {
          target: u.id,
          value: 2,
          text: "It makes an immediate attack",
          effects: [fx("immediateAttack", { target: u.id, player: p })],
          player: p,
        }),
      );
  },
  // Orc of Angmar: remove 1 progress, or +2 defense for the phase.
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.annuminas || !live(enemy, SA.orc)) return;
    prepend(
      s,
      fx("saEngageChoice", {
        target: enemy.id,
        value: 1,
        text: "It gets +2 defense until the end of the phase",
        effects: [fx("saBrace", { target: enemy.id, player })],
        player,
      }),
    );
  },
  characterDestroyed: (s, _u, context) => {
    const c = s.combat;
    if (!s.annuminas || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    if (enemy && live(enemy, SA.werewolf))
      prepend(
        s,
        fx("saRemoveProgress", {
          value: 3,
          text: "Savage Werewolf",
          player: p,
        }),
      );
    if (enemy && live(enemy, SA.host))
      prepend(
        s,
        fx("saEngageChoice", {
          target: enemy.id,
          value: 2,
          text: "Return Host of Angmar to the staging area",
          effects: [fx("saHostReturn", { target: enemy.id, player: p })],
          player: p,
        }),
      );
    if (c.saRevealOnKill) {
      c.saRevealOnKill = false;
      prepend(s, fx("saRevealOnKill", { player: p }));
    }
  },
  travelProblem: (s, u) => {
    if (!s.annuminas || u.blanked) return null;
    if (
      u.code === SA.gate &&
      s.staging.filter((x) => isEnemy(x)).length < playerOrder(s).length
    )
      return "Gate of Annúminas: each player must engage an enemy in the staging area to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.annuminas || u.blanked) return undefined;
    const first = firstPlayer(s);
    const revealEach = () =>
      playerOrder(s).map((player) => fx("reveal", { player }));
    switch (u.code) {
      case SA.ram:
      case SA.camp:
      case SA.tunnel:
        return revealEach();
      case SA.gate:
        return playerOrder(s).map((player) => fx("saGateEngage", { player }));
      case SA.wall:
        return [fx("reveal", { player: first })];
      case SA.battlefield:
        return playerOrder(s).map((player) => fx("saTravelDamage", { player }));
      case SA.evendim:
        return [fx("saEvendim", { player: first })];
      case SA.nenuial:
        return [
          fx("saTravelThreat", {
            value: 2,
            text: "Shores of Lake Nenuial",
            player: first,
          }),
        ];
    }
    return undefined;
  },
  effect: saEffect,
  sharedEffect: (e) =>
    [
      "saShuffle",
      "saDefeatQuest",
      "saNextStage",
      "saRebuild",
      "saReinforce",
      "saDefendCity",
      "saSortie",
      "saStagingAttacks",
      "saCityDamage",
      "saRam",
      "saWall",
      "saTunnel",
      "saLieutenant",
      "saRebuildResponse",
      "saStrengthen",
      "saSortieWin",
      "saTreacheryDone",
      "saDunedain",
      "saDunedainDiscard",
      "saTravelThreat",
      "saEvendim",
      "saRevealOnKill",
      "saEpicDefeat",
      "saManWalls",
      "saCaptivesEntry",
      "saCaptiveAll",
      "saStopAttackEntry",
      "saCamp",
      "saLeveeResponse",
      "saLevee",
      "saDelayResponse",
      "saDelayFewer",
      "saChooseStage",
      "saStageReward",
      "saHostsMove",
      "saThreeResponse",
      "saThreeUse",
      "saDiscardOther",
      "saDiscardOtherTake",
    ].includes(e.kind),
};
