import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  skip,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  allyCanEnter,
  discardCharacter,
  discardPlayerDeck,
  enemyAddedToStaging,
  enterAlly,
  exhaustCharacter,
  progressLocation,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attackersFor,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import {
  goblinCannotAttach,
  goblinCannotCancel,
  goblinEffect,
  goblinEncounter,
  goblinEngaged,
  goblinShadow,
  goblinStats,
  isGoblin,
  takeEncounterTitle,
} from "./goblins-set";
import {
  CAVES,
  CAVES_STAGES,
  CAVES_TREACHERIES,
  CAVES_2018_SCENARIO,
  cavesRecipe,
  cavesStageInfo,
  isCavesEnemy,
  isCavesLocation,
  isDarkLocation,
} from "./caves-nibin-dum-support";
export * from "./caves-nibin-dum-support";

/**
 * The Caves of Nibin-Dûm, the second scenario of the Two-Player Limited
 * Edition Starter (2018), reprinted with Crumbling Stairs (and the Goblins
 * set's Wild Wargs and Obsidian Arrows) in The Dark of Mirkwood (2022). The
 * players follow the Goblins into the caves with a Cave Torch, fight off a
 * surprise attack led by Goblin Chieftain, break Cracked Pillar to cross the
 * chasm and defeat the Chieftain to rescue the captives. The Goblins set is
 * The Oath's (goblins-set.ts).
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const his = (s: GameState) => (s.table ? "his" : "your");
const at = (s: GameState, code: string) =>
  s.caves?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const stageNumber = (s: GameState) =>
  s.caves
    ? (CAVES_STAGES as readonly string[]).indexOf(s.caves.currentQuest) + 1
    : 0;
const phaseKey = (s: GameState) =>
  s.phase === "defense" || s.phase === "attack"
    ? "combat"
    : s.phase === "staging"
      ? "quest"
      : s.phase;
const isEnemy = (u: Unit) => isCavesEnemy(u.code);
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const staged = (s: GameState, c: string) => s.staging.some((u) => live(u, c));
/** Goblin Chieftain in play: in the staging area or engaged with a player. */
const chieftainInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].some((u) => u.code === CAVES.chieftain);
/** Cave Torch: the hero it is attached to, the attachment and its player. */
function torch(s: GameState) {
  for (const p of playerOrder(s))
    for (const hero of charactersOf(s, p)) {
      const a = hero.attachments.find((x) => x.code === CAVES.torch);
      if (a) return { hero, a, player: p };
    }
  return undefined;
}
function fromAside(s: GameState, c: string) {
  const q = s.caves!;
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
/** Remove progress from the current quest; true if any was removed. */
function removeProgress(s: GameState, n: number, source: string) {
  const removed = Math.min(s.progress, n);
  if (removed <= 0) return false;
  s.progress -= removed;
  log(
    s,
    `${source}: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the quest.`,
    "danger",
  );
  return true;
}
/** Take an enemy out of the engaged area or the staging area. */
function liftEnemy(s: GameState, u: Unit) {
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
  if (owner !== undefined)
    forOwner(s, owner, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  return owner;
}
const isEngaged = (s: GameState, u: Unit) =>
  globalEngaged(s).some((x) => x.id === u.id);
/**
 * Return an engaged enemy to the staging area. An additional attack it was
 * to make against the player (Goblin Runners' shadow) is not made from the
 * staging area.
 */
function returnToStaging(s: GameState, u: Unit) {
  if (!isEngaged(s, u)) return false;
  liftEnemy(s, u);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  s.queue = s.queue.filter(
    (e) => !(e.kind === "immediateAttack" && e.target === u.id),
  );
  return true;
}
/** Exhaust Cave Torch: its Forced effect follows. */
function exhaustTorch(s: GameState, source: string) {
  const t = torch(s);
  if (!t || t.a.exhausted) return false;
  t.a.exhausted = true;
  log(s, `${source}: Cave Torch is exhausted.`);
  prepend(s, fx("cavesTorchForced", { player: firstPlayer(s) }));
  return true;
}
/** Cracked Pillar's attack: a player attacks it as if it were an enemy engaged with him. */
const pillar = (s: GameState) => s.staging.find((u) => u.code === CAVES.pillar);
function pillarProblem(s: GameState, u: Unit): string | null {
  const q = s.caves;
  if (!q || !pillar(s) || pillar(s)!.id !== u.id)
    return "Cracked Pillar can only be attacked in the staging area.";
  if (u.blanked) return "Cracked Pillar's text is blank.";
  if (s.phase !== "attack")
    return "Cracked Pillar is attacked during the combat phase.";
  if (activeSeat(s) !== firstPlayer(s))
    return "Only the first player may attack Cracked Pillar.";
  if (q.pillarAttacked === s.round)
    return "Cracked Pillar was already attacked this round.";
  if (!attackersFor(s, u, undefined, true).length)
    return "No ready character can attack.";
  return null;
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupCaves(s: GameState) {
  const r = cavesRecipe(s.scenarioId, !!s.easyMode);
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // The recipe lists one copy of each location in the staging area: they are
  // the encounter deck's own copies, which 1B's searches find.
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...section("sharedStagingArea"),
  ]);
  s.caves = {
    currentQuest: CAVES.dark,
    advancing: false,
    edition: s.scenarioId === CAVES_2018_SCENARIO ? "2018" : "2022",
    setAside: section("sharedSetAside"),
    questProgress: null,
    dark: null,
    pillarAttacked: null,
    noDamage: [],
    resolving: [],
  };
  log(
    s,
    "The Dark of Nibin-Dûm: Goblin Chieftain and Cracked Pillar are set aside, out of play, and the first player attaches Cave Torch to one of his heroes.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.caves;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 3B: "–" quest points; Cracked Pillar's exploration advances.
  if (q.currentQuest === CAVES.chasm) return true;
  const goal = cavesStageInfo(s)?.quest ?? 0;
  // 2B has 0 quest points and +4 for each enemy in play.
  if (q.currentQuest !== CAVES.surprise && goal <= 0) return true;
  if (s.progress < goal) return true;
  if (q.currentQuest === CAVES.oathkeepers) {
    if (chieftainInPlay(s)) return true;
    win(
      s,
      "Oathkeepers is defeated: the heroes rescue the captives, fulfilling their oaths, and the players win the game!",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("cavesDefeatQuest", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.caves;
  if (!q) return false;
  if (goblinEncounter(s, code, replay, fromReveal)) return true;
  // Cave Torch goes to the encounter discard pile when its hero leaves play;
  // revealed again from the encounter deck, it is attached to a hero.
  if (code === CAVES.torch && fromReveal && !replay) {
    const i = s.staging.map((u) => u.code).lastIndexOf(CAVES.torch);
    if (i >= 0) s.staging.splice(i, 1);
    q.setAside.push(CAVES.torch);
    prepend(
      s,
      fx("cavesTorchSetup", { text: "revealed", player: firstPlayer(s) }),
    );
    return true;
  }
  if (!CAVES_TREACHERIES.includes(code)) return false;
  const player = activeSeat(s);
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
  const first = firstPlayer(s);
  const effects: Effect[] =
    code === CAVES.ruin
      ? playerOrder(s).map((p) => fx("cavesRuin", { player: p }))
      : code === CAVES.lost
        ? [fx("cavesLost", { player: torch(s)?.player ?? first })]
        : [fx("cavesEyes", { source: u.id, player: first })];
  prepend(s, ...effects, fx("cavesTreacheryDone", { source: u.id, player }));
  return true;
}

/** The shadow effects of the Caves set (the Goblins set's are shared). */
function shadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.caves;
  if (!c || !q) return false;
  if (goblinShadow(s, code)) return true;
  const enemy = get(s, c.enemyId);
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (code) {
    case CAVES.warg:
      c.cavesReturnOnKill = true;
      log(
        s,
        "Cavern Warg: if this attack destroys a character, the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
    case CAVES.mine:
      c.cavesThreat = true;
      log(
        s,
        "Collapsed Mine: the defending player raises his threat by 1 for each point of damage dealt by this attack.",
        "danger",
      );
      return true;
    case CAVES.tunnels: {
      const value = enemy && isGoblin(enemy.code) ? 3 : 1;
      c.attackBonus += value;
      log(
        s,
        `Goblin Tunnels: the attacking enemy gets +${value} attack.`,
        "danger",
      );
      return true;
    }
    case CAVES.passage:
      if (enemy)
        q.noDamage.push({ id: enemy.id, round: s.round, phase: "combat" });
      log(
        s,
        "Lightless Passage: all combat damage dealt to the attacking enemy is canceled this phase.",
        "danger",
      );
      return true;
    case CAVES.lost:
      if (defenders.length)
        prepend(
          s,
          ...defenders.map((d) => fx("damage", { target: d.id, value: 1 })),
        );
      log(
        s,
        defenders.length
          ? "Lost in the Dark: 1 damage to the defending character."
          : "Lost in the Dark: there is no defending character.",
        "danger",
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

function cavesEffect(s: GameState, e: Effect): boolean {
  const q = s.caves;
  if (!q || !e.kind.startsWith("caves")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "cavesShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    // 1A: the first player attaches Cave Torch to one of his heroes; revealed
    // from the encounter deck, the first player attaches it to a hero.
    case "cavesTorchSetup": {
      if (!q.setAside.includes(CAVES.torch)) return true;
      const revealed = e.text === "revealed";
      const heroes = (revealed ? playerOrder(s) : [first]).flatMap((owner) =>
        seatView(s, owner).heroes.map((hero) => ({ hero, owner })),
      );
      if (!heroes.length) {
        fromAside(s, CAVES.torch);
        s.encounterDiscard.push(CAVES.torch);
        log(
          s,
          "Cave Torch: there is no hero to attach it to; it is discarded.",
        );
        return true;
      }
      if (heroes.length === 1) {
        prepend(
          s,
          fx("cavesTorchAttach", { target: heroes[0].hero.id, player: first }),
        );
        return true;
      }
      choose(
        s,
        revealed
          ? `Cave Torch · Attach it to a hero${seatLabel(s, first)}`
          : `The Dark of Nibin-Dûm · Attach Cave Torch to one of your heroes${seatLabel(s, first)}`,
        heroes.map(({ hero, owner }) => ({
          id: hero.id,
          code: hero.code,
          label: `Attach Cave Torch to ${name(hero)}${revealed && s.table ? ` (${seatName(s, owner)})` : ""}`,
          effects: [fx("cavesTorchAttach", { target: hero.id, player: first })],
        })),
        revealed ? card(CAVES.torch).text : card(CAVES.dark).text,
      );
      return true;
    }
    case "cavesTorchAttach": {
      const hero = get(s, e.target);
      if (!hero || !fromAside(s, CAVES.torch)) return true;
      const a: Attachment = {
        id: make(s, CAVES.torch).id,
        code: CAVES.torch,
        exhausted: false,
      };
      hero.attachments.push(a);
      log(s, `Cave Torch is attached to ${name(hero)}.`, "good");
      return true;
    }
    // 1B: each player adds a different location; 2A: a different enemy.
    case "cavesSearch": {
      const enemy = e.text === "enemy";
      const chosen = new Set(e.ids ?? []);
      const pool = enemy
        ? [...s.encounterDeck, ...s.encounterDiscard]
        : s.encounterDeck;
      const options = [
        ...new Set(
          pool.filter(
            (c) =>
              (enemy ? isCavesEnemy(c) : isCavesLocation(c)) &&
              !chosen.has(card(c).name),
          ),
        ),
      ].sort((a, b) => card(a).name.localeCompare(card(b).name));
      if (!options.length) {
        log(
          s,
          `${card(q.currentQuest).name}: there is no different ${enemy ? "enemy" : "location"} for ${who(s, p)}.`,
        );
        prepend(
          s,
          ...(e.effects ?? []).map((next) => ({ ...next, ids: [...chosen] })),
        );
        return true;
      }
      choose(
        s,
        `${card(q.currentQuest).name} · Add a different ${enemy ? "enemy" : "location"} to the staging area${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to the staging area`,
          effects: [
            fx("cavesSearchTake", { code: c, player: p }),
            ...(e.effects ?? []).map((next) => ({
              ...next,
              ids: [...chosen, card(c).name],
            })),
          ],
        })),
        enemy ? card(CAVES.surprise).text : card(CAVES.dark).back_text,
      );
      return true;
    }
    case "cavesSearchTake": {
      const u = takeEncounterTitle(s, card(e.code ?? "").name);
      if (!u) return true;
      s.staging.push(u);
      if (isEnemy(u)) enemyAddedToStaging(s, u);
      log(s, `${name(u)} is added to the staging area.`, "danger");
      return true;
    }
    case "cavesDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("cavesNextStage", { player: first }));
      return true;
    }
    case "cavesNextStage": {
      q.advancing = false;
      const next = CAVES_STAGES[stageNumber(s)];
      if (!next) return true;
      q.currentQuest = next;
      s.stage = stageNumber(s);
      s.progress = 0;
      q.questProgress = null;
      log(s, `${card(next).name} begins.`, "chapter");
      if (next === CAVES.surprise)
        prepend(
          s,
          fx("cavesChieftain", { player: first }),
          ...searches(s, "enemy"),
          fx("cavesShuffle", { player: first }),
        );
      else if (next === CAVES.chasm)
        prepend(
          s,
          fx("cavesChieftainAside", { player: first }),
          fx("cavesPillar", { player: first }),
        );
      else prepend(s, fx("cavesChieftain", { player: first }));
      return true;
    }
    case "cavesChieftain":
      if (!fromAside(s, CAVES.chieftain)) return true;
      toStaging(s, CAVES.chieftain);
      log(s, "Goblin Chieftain is added to the staging area.", "danger");
      return true;
    case "cavesChieftainAside": {
      const u = [...s.staging, ...globalEngaged(s)].find(
        (x) => x.code === CAVES.chieftain,
      );
      if (!u) return true;
      // It cannot have attachments; its damage leaves with it.
      liftEnemy(s, u);
      q.setAside.push(CAVES.chieftain);
      log(s, "The Chasm: Goblin Chieftain is set aside, out of play.");
      return true;
    }
    case "cavesPillar":
      if (!fromAside(s, CAVES.pillar)) return true;
      toStaging(s, CAVES.pillar);
      log(
        s,
        "The Chasm: Cracked Pillar is added to the staging area.",
        "danger",
      );
      return true;
    case "cavesTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    // Cave Torch.
    case "cavesTorchForced": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (isCavesEnemy(top)) {
        toStaging(s, top);
        log(
          s,
          `Cave Torch: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
        return true;
      }
      s.encounterDiscard.push(top);
      log(
        s,
        `Cave Torch: ${card(top).name} is discarded from the encounter deck.`,
      );
      return true;
    }
    case "cavesTorchLight": {
      const target = [...s.staging, ...allActiveLocations(s)].find(
        (u) => u.id === e.target,
      );
      if (!target) return true;
      const left = Math.max(
        0,
        (card(target.code).quest ?? 0) - target.progress,
      );
      const value = Math.min(3, Math.max(1, left));
      log(s, `Cave Torch: ${value} progress on ${name(target)}.`, "good");
      progressLocation(s, target, value);
      return true;
    }
    // Lost in the Dark.
    case "cavesLost": {
      const t = torch(s);
      if (!t || t.a.exhausted) {
        prepend(s, fx("cavesDark", { player: p }));
        return true;
      }
      choose(
        s,
        `Lost in the Dark · Exhaust Cave Torch, or no progress on the quest this phase${seatLabel(s, p)}`,
        [
          {
            id: "torch",
            label: "Exhaust Cave Torch",
            code: CAVES.torch,
            effects: [
              fx("cavesExhaustTorch", { text: "Lost in the Dark", player: p }),
            ],
          },
          {
            id: "dark",
            label:
              "Progress cannot be placed on the quest until the end of the phase",
            effects: [fx("cavesDark", { player: p })],
          },
        ],
        card(CAVES.lost).text,
      );
      return true;
    }
    case "cavesExhaustTorch":
      exhaustTorch(s, e.text ?? "Cave Torch");
      return true;
    case "cavesDark":
      q.dark = { round: s.round, phase: phaseKey(s) };
      log(
        s,
        "Lost in the Dark: progress cannot be placed on the quest until the end of the phase.",
        "danger",
      );
      return true;
    // Watchful Eyes: the first player attaches it to one of his heroes.
    case "cavesEyes": {
      const heroes = seatView(s, first).heroes.filter(
        (h) => !h.attachments.some((a) => a.code === CAVES.eyes),
      );
      if (!heroes.length) {
        log(
          s,
          "Watchful Eyes: no hero of the first player can take it; it is discarded.",
        );
        return true;
      }
      choose(
        s,
        `Watchful Eyes · Attach it to one of your heroes${seatLabel(s, first)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Attach Watchful Eyes to ${name(h)}`,
          effects: [
            fx("cavesEyesAttach", {
              target: h.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(CAVES.eyes).text,
      );
      return true;
    }
    case "cavesEyesAttach": {
      const hero = get(s, e.target);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!hero || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      hero.attachments.push({
        id: held.id,
        code: CAVES.eyes,
        exhausted: false,
      });
      log(s, `Watchful Eyes is attached to ${name(hero)}.`, "danger");
      return true;
    }
    case "cavesEyesReveal":
      log(
        s,
        "Watchful Eyes: the attached hero is exhausted at the end of the combat phase; an encounter card is revealed.",
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
    // Crumbling Ruin: each player exhausts a character and discards his top card.
    case "cavesRuin": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) {
        prepend(s, fx("cavesRuinDiscard", { player: p }));
        return true;
      }
      choose(
        s,
        `Crumbling Ruin · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [fx("cavesRuinDiscard", { target: u.id, player: p })],
        })),
        card(CAVES.ruin).text,
      );
      return true;
    }
    case "cavesRuinDiscard": {
      const u = e.target ? get(s, e.target) : undefined;
      if (u) exhaustCharacter(s, u);
      const [top] = discardPlayerDeck(s, 1, p);
      const cost = top ? Number(card(top).cost) || 0 : 0;
      const left = u ? stats(s, u).health - u.damage : Infinity;
      log(
        s,
        `Crumbling Ruin: ${top ? `${card(top).name} (cost ${cost})` : "no card"} is discarded from ${s.table ? `${seatName(s, p)}'s` : "your"} deck.`,
        "danger",
      );
      if (
        u &&
        top &&
        cost >= left &&
        charactersOf(s, p).some((x) => x.id === u.id)
      ) {
        log(s, `Crumbling Ruin: ${name(u)} is discarded.`, "danger");
        forOwner(s, p, () => discardCharacter(s, u));
      }
      return true;
    }
    // Goblin Chieftain: after it attacks, remove X progress or it returns.
    case "cavesChieftainForced": {
      const u = get(s, e.target);
      if (!u) return true;
      const x = stageNumber(s);
      // It can only return to the staging area from engagement; with no
      // progress to remove, only the other option is offered.
      const options: Option[] = [
        ...(s.progress > 0
          ? [
              {
                id: "progress",
                label: `Remove ${x} progress from the quest`,
                effects: [
                  fx("cavesRemoveProgress", {
                    value: x,
                    text: "Goblin Chieftain",
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        ...(isEngaged(s, u)
          ? [
              {
                id: "return",
                label: "Goblin Chieftain returns to the staging area",
                effects: [fx("cavesReturn", { target: u.id, player: p })],
              },
            ]
          : []),
      ];
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Goblin Chieftain · Remove ${x} progress from the quest, or return it to the staging area${seatLabel(s, p)}`,
        options,
        card(CAVES.chieftain).text,
      );
      return true;
    }
    case "cavesRemoveProgress":
      removeProgress(s, e.value ?? 0, e.text ?? "");
      return true;
    case "cavesReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
    // Cavern Warg: exhaust Cave Torch to cancel its attack and return it.
    case "cavesWargOffer": {
      const u = get(s, e.target);
      const t = torch(s);
      if (!u || !t || t.a.exhausted || t.player !== p) return true;
      choose(
        s,
        `Cavern Warg · Exhaust Cave Torch to cancel the attack and return Cavern Warg to the staging area?${seatLabel(s, p)}`,
        [
          {
            id: "torch",
            label:
              "Exhaust Cave Torch: cancel the attack and return Cavern Warg",
            code: CAVES.torch,
            effects: [fx("cavesWargCancel", { target: u.id, player: p })],
          },
          skip,
        ],
        card(CAVES.warg).text,
      );
      return true;
    }
    case "cavesWargCancel": {
      const u = get(s, e.target);
      if (!u || s.combat?.enemyId !== u.id) return true;
      if (!exhaustTorch(s, "Cavern Warg")) return true;
      if (!returnToStaging(s, u)) return true;
      log(
        s,
        "Cavern Warg's attack is canceled and it returns to the staging area.",
        "good",
      );
      // The canceled attack ends: skip to its end (as Terrible to Behold).
      const end = s.queue.findIndex((effect) => effect.kind === "enemyDone");
      if (end >= 0) {
        const torchForced = s.queue.findIndex(
          (effect) => effect.kind === "cavesTorchForced",
        );
        const start =
          torchForced >= 0 && torchForced < end ? torchForced + 1 : 0;
        s.queue.splice(
          start,
          end - start + 1,
          fx("enemyDone", {
            flag: true,
            player: s.combat.attackPlayer ?? activeSeat(s),
          }),
        );
      }
      return true;
    }
    // Branching Paths: look at the top 3; one is revealed, the others go to the bottom.
    case "cavesBranching": {
      const top = s.encounterDeck.slice(0, 3);
      if (!top.length) return true;
      choose(
        s,
        `Branching Paths · Choose 1 of the top ${top.length} encounter cards to reveal; the others go to the bottom${seatLabel(s, first)}`,
        top.map((c, i) => ({
          id: String(i),
          code: c,
          label: `Reveal ${card(c).name}`,
          effects: [
            fx("cavesBranchingTake", {
              value: i,
              count: top.length,
              player: first,
            }),
          ],
        })),
        card(CAVES.branching).text,
      );
      return true;
    }
    case "cavesBranchingTake": {
      const n = Math.min(e.count ?? 3, s.encounterDeck.length);
      const top = s.encounterDeck.splice(0, n);
      const [chosen] = top.splice(e.value ?? 0, 1);
      s.encounterDeck.push(...top);
      if (chosen) prepend(s, fx("revealCard", { code: chosen, player: first }));
      return true;
    }
    // Crumbling Stairs: the top card; a location becomes the active location.
    case "cavesStairs": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (isCavesLocation(top) && !s.activeLocation) {
        s.activeLocation = make(s, top);
        log(
          s,
          `Crumbling Stairs: ${card(top).name} is discarded and put into play as the active location.`,
          "danger",
        );
        return true;
      }
      s.encounterDiscard.push(top);
      log(s, `Crumbling Stairs: ${card(top).name} is discarded.`);
      return true;
    }
    // Goblin Dungeon: the first player searches the top 5 cards for an ally.
    case "cavesDungeon": {
      const top = seatView(s, first).deck.slice(0, 5);
      const allies = [
        ...new Set(
          top.filter((c) => card(c).type_code === "ally" && allyCanEnter(s, c)),
        ),
      ].sort((a, b) => card(a).name.localeCompare(card(b).name));
      if (!allies.length) {
        forOwner(s, first, () => (s.deck = shuffle(s, s.deck)));
        log(
          s,
          `Goblin Dungeon: ${who(s, first)} ${s.table ? "finds" : "find"} no ally.`,
        );
        return true;
      }
      choose(
        s,
        `Goblin Dungeon · Put an ally from the top 5 cards of ${his(s)} deck into play${seatLabel(s, first)}`,
        [
          ...allies.map((c) => ({
            id: c,
            code: c,
            label: `Put ${card(c).name} into play`,
            effects: [fx("cavesDungeonTake", { code: c, player: first })],
          })),
          {
            id: "skip",
            label: "Put no ally into play",
            effects: [fx("cavesDungeonTake", { player: first })],
          },
        ],
        card(CAVES.dungeon).text,
      );
      return true;
    }
    case "cavesDungeonTake":
      forOwner(s, first, () => {
        const i = e.code ? s.deck.slice(0, 5).indexOf(e.code) : -1;
        if (i >= 0) {
          const u = takePlayerDeck(s, i);
          s.deck = shuffle(s, s.deck);
          u.owner = first;
          enterAlly(s, u);
          log(s, `Goblin Dungeon: ${name(u)} is put into play.`, "good");
        } else s.deck = shuffle(s, s.deck);
      });
      return true;
    // Cracked Pillar: choose the attackers, then the attack resolves.
    case "cavesPillarPick": {
      const u = pillar(s);
      if (!u) return true;
      // The first player's characters, and Ranged characters of the others,
      // as against an enemy engaged with him.
      const chosen = new Set(e.ids ?? []);
      const ready = attackersFor(s, u, undefined, true).filter(
        (x) => !chosen.has(x.id),
      );
      const total = [...chosen]
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x)
        .reduce((n, x) => n + stats(s, x).attack, 0);
      const options: Option[] = [
        ...ready.map((x) => ({
          id: x.id,
          code: x.code,
          label: `Add ${name(x)} (${stats(s, x).attack} attack)`,
          effects: [
            fx("cavesPillarPick", { ids: [...chosen, x.id], player: p }),
          ],
        })),
        ...(chosen.size
          ? [
              {
                id: "attack",
                label: `Attack Cracked Pillar with ${total} attack against ${threatOf(s, u)} defense`,
                effects: [
                  fx("cavesPillarAttack", { ids: [...chosen], player: p }),
                ],
              },
            ]
          : []),
        { id: "skip", label: "Do not attack Cracked Pillar", effects: [] },
      ];
      choose(
        s,
        `Cracked Pillar · Declare attackers${seatLabel(s, p)}`,
        options,
        card(CAVES.pillar).text,
      );
      return true;
    }
    case "cavesPillarAttack": {
      const u = pillar(s);
      if (!u) return true;
      const attackers = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x && !x.exhausted);
      if (!attackers.length) return true;
      q.pillarAttacked = s.round;
      const total = attackers.reduce((n, x) => n + stats(s, x).attack, 0);
      for (const x of attackers) exhaustCharacter(s, x);
      const dealt = Math.max(0, total - threatOf(s, u));
      u.damage += dealt;
      log(
        s,
        `${attackers.map((x) => name(x)).join(" + ")} attack Cracked Pillar: ${total} attack − ${threatOf(s, u)} defense = ${dealt} damage (${u.damage} on it).`,
        "good",
      );
      return true;
    }
  }
  return false;
}
/** 1B and 2A: each player in turn order adds a different card. */
function searches(s: GameState, text: "location" | "enemy"): Effect[] {
  const order = playerOrder(s);
  // Each search carries the titles already chosen to the next player.
  let chain: Effect[] = [];
  for (const player of [...order].reverse())
    chain = [fx("cavesSearch", { text, player, effects: chain })];
  return chain;
}

// ---------------------------------------------------------------------------
// Hooks.

export const CAVES_HOOKS: Batch4ScenarioHooks = {
  setup: setupCaves,
  // 1A: the first player attaches Cave Torch; 1B: each player adds a
  // different location to the staging area.
  openingHandsKept: (s) => {
    if (!s.caves || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      fx("cavesTorchSetup", { player: first }),
      ...searches(s, "location"),
      fx("cavesShuffle", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: cavesStageInfo,
  encounter,
  shadow,
  // 3B: an additional encounter card during the quest phase.
  extraStagingReveals: (s) => (at(s, CAVES.chasm) ? 1 : 0),
  progress: (s, amount, quest) => {
    const q = s.caves;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    // Lost in the Dark: no progress on the quest this phase.
    if (q.dark?.round === s.round && q.dark.phase === phaseKey(s)) return 0;
    // Collapsed Mine: no more than 4 progress on the quest each round.
    if (staged(s, CAVES.mine)) {
      const placed =
        q.questProgress?.round === s.round ? q.questProgress.amount : 0;
      return Math.max(0, Math.min(amount, 4 - placed));
    }
    return amount;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.caves;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    const placed =
      q.questProgress?.round === s.round ? q.questProgress.amount : 0;
    q.questProgress = { round: s.round, amount: placed + amount };
  },
  stats: (s, u) => {
    if (!s.caves) return {};
    // Goblin Chieftain: X attack and X defense, X the stage number.
    if (live(u, CAVES.chieftain)) {
      const x = stageNumber(s);
      return { attack: x, defense: x };
    }
    return goblinStats(s, u);
  },
  threatBonus: (s, u) => {
    if (!s.caves || u.blanked) return 0;
    if (u.code === CAVES.chieftain) return stageNumber(s);
    // Branching Paths: each Dark location gets +1 threat.
    if (isDarkLocation(u.code))
      return s.staging.filter((x) => live(x, CAVES.branching)).length;
    return 0;
  },
  // 2B: during the encounter phase each enemy's engagement cost is 0.
  engagementBonus: (s) =>
    s.caves && at(s, CAVES.surprise) && s.phase === "encounter" ? -999 : 0,
  damageAmount: (s, u, amount, context) => {
    const q = s.caves;
    if (!q) return amount;
    // Goblin Chieftain cannot take damage, except at 4B with 8 progress.
    if (
      live(u, CAVES.chieftain) &&
      !(at(s, CAVES.oathkeepers) && s.progress >= 8)
    )
      return 0;
    // Lightless Passage's shadow: no combat damage to the attacker this phase.
    if (
      context.combatDamage &&
      q.noDamage.some(
        (m) => m.id === u.id && m.round === s.round && m.phase === phaseKey(s),
      )
    )
      return 0;
    return amount;
  },
  cannotAttach: (s, u) =>
    !!s.caves &&
    (live(u, CAVES.chieftain) ||
      live(u, CAVES.troll) ||
      goblinCannotAttach(s, u)),
  cannotCancel: (s, _shadow, code) => !!s.caves && goblinCannotCancel(s, code),
  // 3B: no progress on Cracked Pillar in the staging area; Crumbling Stairs.
  locationProgressBlocked: (s, u) =>
    !!s.caves &&
    s.staging.some((x) => x.id === u.id) &&
    ((u.code === CAVES.pillar && at(s, CAVES.chasm)) || live(u, CAVES.stairs)),
  // Goblin Tunnels: after a Goblin is revealed, 1 progress is removed.
  revealed: (s, code, revealOrigin) => {
    if (!s.caves || revealOrigin !== "encounter" || !isGoblin(code)) return;
    prepend(
      s,
      ...s.staging
        .filter((u) => live(u, CAVES.tunnels))
        .map(() =>
          fx("cavesRemoveProgress", {
            value: 1,
            text: "Goblin Tunnels",
            player: firstPlayer(s),
          }),
        ),
    );
  },
  engaged: (s, u) => {
    if (!s.caves) return;
    goblinEngaged(s, u);
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.caves || !live(enemy, CAVES.warg)) return;
    const t = torch(s);
    if (t && !t.a.exhausted && t.player === player)
      prepend(s, fx("cavesWargOffer", { target: enemy.id, player }));
  },
  attackFinished: (s, c, skipped = false) => {
    if (!s.caves || skipped) return [];
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    if (c.cavesThreat && (c.damageDealt ?? 0) > 0)
      effects.push(
        fx("cavesMineThreat", { value: c.damageDealt ?? 0, player: p }),
      );
    if (enemy && live(enemy, CAVES.chieftain))
      effects.push(fx("cavesChieftainForced", { target: enemy.id, player: p }));
    return effects;
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.caves || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    // Great Cave-troll: 1 progress for each excess point of damage.
    if (enemy && live(enemy, CAVES.troll)) {
      const excess = u.damage - stats(s, u).health;
      if (excess > 0)
        prepend(
          s,
          fx("cavesRemoveProgress", {
            value: excess,
            text: "Great Cave-troll",
            player: p,
          }),
        );
    }
    if (c.cavesReturnOnKill) {
      c.cavesReturnOnKill = false;
      c.returnToStaging = true;
    }
  },
  combatEnd: (s) => {
    if (!s.caves) return;
    for (const p of playerOrder(s))
      for (const hero of seatView(s, p).heroes)
        for (const a of hero.attachments)
          if (a.code === CAVES.eyes && hero.exhausted)
            prepend(s, fx("cavesEyesReveal", { player: firstPlayer(s) }));
  },
  travelProblem: (s, u) => {
    if (!s.caves || u.blanked) return null;
    if (u.code === CAVES.pillar && u.damage < 4)
      return "Cracked Pillar: remove 4 damage from it to travel here.";
    if (u.code === CAVES.passage) {
      const t = torch(s);
      if (!t || t.a.exhausted)
        return "Lightless Passage: the players must exhaust a Cave Torch to travel here.";
    }
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.caves || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === CAVES.pillar) {
      u.damage = Math.max(0, u.damage - 4);
      return [];
    }
    if (u.code === CAVES.passage)
      return [
        fx("cavesExhaustTorch", { text: "Lightless Passage", player: first }),
      ];
    if (u.code === CAVES.dungeon) return [fx("reveal", { player: first })];
    return undefined;
  },
  explored: (s, u) => {
    if (!s.caves || u.blanked) return;
    const first = firstPlayer(s);
    // 3B: after Cracked Pillar leaves play as an explored location, stage 4A.
    if (u.code === CAVES.pillar && at(s, CAVES.chasm)) {
      s.caves.advancing = true;
      prepend(s, fx("cavesDefeatQuest", { player: first }));
    }
    if (u.code === CAVES.branching)
      prepend(s, fx("cavesBranching", { player: first }));
    if (u.code === CAVES.stairs)
      prepend(s, fx("cavesStairs", { player: first }));
    if (u.code === CAVES.dungeon)
      prepend(s, fx("cavesDungeonResponse", { player: first }));
  },
  abilityLabel: (code) =>
    code === CAVES.torch
      ? "Cave Torch · Action: exhaust it to place up to 3 progress on a Dark location"
      : code === CAVES.pillar
        ? "Cracked Pillar · Attack it as if it were an enemy engaged with you"
        : undefined,
  abilityProblem: (s, u, attachmentId) => {
    if (!s.caves) return "Not in play.";
    if (u.code === CAVES.pillar && !attachmentId) return pillarProblem(s, u);
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || a.code !== CAVES.torch) return null;
    if (a.exhausted) return "Cave Torch is exhausted.";
    if (
      ![...s.staging, ...allActiveLocations(s)].some(
        (x) => isDarkLocation(x.code) && !x.blanked,
      )
    )
      return "There is no Dark location in play.";
    return null;
  },
  ability: (s, u, attachmentId) => {
    if (!s.caves) return false;
    const p = activeSeat(s);
    if (u.code === CAVES.pillar && !attachmentId) {
      if (pillarProblem(s, u)) return false;
      prepend(s, fx("cavesPillarPick", { ids: [], player: p }));
      return true;
    }
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || a.code !== CAVES.torch || a.exhausted) return false;
    const targets = [...s.staging, ...allActiveLocations(s)].filter(
      (x) => isDarkLocation(x.code) && !x.blanked,
    );
    if (!targets.length) return false;
    exhaustTorch(s, "Cave Torch");
    choose(
      s,
      `Cave Torch · Place up to 3 progress on a Dark location${seatLabel(s, p)}`,
      targets.map((x) => ({
        id: x.id,
        code: x.code,
        label: `${name(x)} · ${x.progress}/${card(x.code).quest ?? 0} progress`,
        effects: [fx("cavesTorchLight", { target: x.id, player: p })],
      })),
      card(CAVES.torch).text,
    );
    return true;
  },
  effect: (s, e) => goblinEffect(s, e) || cavesEffect(s, e) || cavesMore(s, e),
  sharedEffect: (e) =>
    [
      "cavesShuffle",
      "cavesTorchSetup",
      "cavesDefeatQuest",
      "cavesNextStage",
      "cavesChieftain",
      "cavesChieftainAside",
      "cavesPillar",
      "cavesTreacheryDone",
      "cavesTorchForced",
      "cavesEyesReveal",
      "cavesBranching",
      "cavesBranchingTake",
      "cavesStairs",
      "cavesDungeonResponse",
    ].includes(e.kind),
};
/** Small effects that need no state beyond the game. */
function cavesMore(s: GameState, e: Effect): boolean {
  if (!s.caves) return false;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "cavesMineThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `Collapsed Mine: ${who(s, p)} ${s.table ? "raises" : "raise"} ${his(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "cavesDungeonResponse":
      choose(
        s,
        `Goblin Dungeon · Search the top 5 cards of ${his(s)} deck for an ally?${seatLabel(s, firstPlayer(s))}`,
        [
          {
            id: "use",
            label: "Search the top 5 cards for an ally and put it into play",
            effects: [fx("cavesDungeon", { player: firstPlayer(s) })],
          },
          skip,
        ],
        card(CAVES.dungeon).text,
      );
      return true;
  }
  return false;
}
