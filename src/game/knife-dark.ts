import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, random, shuffle } from "./core";
import {
  allyCanEnter,
  discardAttachment,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  enterAlly,
  questDefeated,
  raiseThreat,
  removeFromQuest,
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
  seatName,
  seatView,
} from "./table";
import { currentQuestProgress, mainQuestUnit } from "./quest-state";
import {
  addCurrentQuestProgress,
  removeCurrentQuestProgress,
} from "./side-quests";
import { lotrSagaCheck, oneRing, oneRingExhausted } from "./lotr-saga";
import {
  huntedAttackFinished,
  huntedEffect,
  huntedShadow,
  huntedTreachery,
  pathlessQuestBonus,
  returnToStaging,
  who,
} from "./black-riders-hunted";
import {
  nazgulAttackBonus,
  nazgulAttackStarted,
  nazgulCannotAttach,
  nazgulCannotDefend,
  nazgulEffect,
  nazgulEngagementBonus,
  nazgulImmune,
  nazgulNoDamage,
  nazgulShadow,
  nazgulTreachery,
} from "./black-riders-nazgul";
import {
  KD,
  KNIFE_DARK_QUESTS,
  KNIFE_DARK_RECIPES,
  isKdNazgul,
  kdLocations,
  kdNazgulInPlay,
  kdTrait,
  knifeDarkStageInfo,
} from "./knife-dark-support";
export * from "./knife-dark-support";

const TREACHERIES: readonly string[] = [
  KD.unwanted,
  KD.breath,
  KD.blade,
  KD.terror,
  KD.cry,
  KD.lure,
];
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const isEnemyUnit = (u: Unit) => card(u.code).type_code === "enemy";
const isAllyUnit = (u: Unit) => card(u.code).type_code === "ally";
const isHeroUnit = (u: Unit) => card(u.code).type_code === "hero";
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const attached = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && !a.blanked);
const midgewaterActive = (s: GameState) => activeIs(s, KD.midgewater);
const wraithsAside = (s: GameState) =>
  s.knifeDark?.setAside.filter((c) => c === KD.ringwraith).length ?? 0;
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isEnemyUnit);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const where = (s: GameState, u: Unit) =>
  allEngaged(s).some((x) => x.id === u.id)
    ? ` · engaged with ${who(s, ownerOf(s, u))}`
    : " · staging area";
/** Shuffle an out of play Ringwraith into the encounter deck. */
const shuffleWraithOption = (source: string, p: number): Option => ({
  id: "ringwraith",
  code: KD.ringwraith,
  label: "Shuffle an out of play Ringwraith into the encounter deck",
  effects: [fx("kdShuffleWraith", { code: source, player: p })],
});

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupKnifeDark(s: GameState) {
  const r = KNIFE_DARK_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const code of section("sharedStagingArea"))
    s.staging.push(make(s, code));
  s.knifeDark = {
    currentQuest: KD.bree,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    hills: [],
    finale: false,
  };
  log(
    s,
    "Trouble in Bree: the Ringwraiths, The Witch-king, Midgewater and Weathertop are set aside. The Prancing Pony and Bill Ferny wait in the staging area.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.knifeDark;
  if (!q) return false;
  const goal = knifeDarkStageInfo(s)?.quest ?? 0;
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
  // 1B and 2B: the players cannot advance while their location is in play.
  const blocker = s.stage === 1 ? KD.pony : s.stage === 2 ? KD.midgewater : "";
  if (stageLive(s) && kdLocations(s).some((l) => l.code === blocker))
    return true;
  q.advancing = true;
  prepend(s, fx("kdDefeatQuest", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.knifeDark;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === KD.squint) {
    if (fromReveal) prepend(s, fx("kdSquint", { player }));
    return true;
  }
  if (!TREACHERIES.includes(code)) return false;
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
    fx("kdTreachery", { code, source: u.id, player }),
    fx("kdTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.knifeDark) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case KD.shady:
      c.defensePenalty =
        (c.defensePenalty ?? 0) + (oneRingExhausted(s) ? 2 : 1);
      return true;
    case KD.chetwood:
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const hand = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `Chetwood: ${who(s, p)} discard${s.table ? "s" : ""} ${card(hand.code).name} at random.`,
          "danger",
        );
        discardHandCard(s, hand.id, { encounterEffect: true });
      });
      return true;
    case KD.unwanted:
      c.spReturn = true;
      return true;
  }
  return nazgulShadow(s, code) || huntedShadow(s, code);
}
function treachery(s: GameState, code: string, source: string, p: number) {
  switch (code) {
    case KD.unwanted: {
      const heroes = seatView(s, p).heroes.filter((h) => h.committed);
      const options: Option[] = [
        ...(heroes.length >= 2
          ? [
              {
                id: "remove",
                label: "Remove 2 heroes you control from the quest",
                effects: [fx("kdRemoveHeroes", { value: 2, player: p })],
              },
            ]
          : []),
        ...(wraithsAside(s) ? [shuffleWraithOption(code, p)] : []),
      ];
      // An option that can be fully resolved must be chosen when one exists.
      if (!options.length) {
        if (heroes.length)
          prepend(s, fx("kdRemoveHeroes", { value: heroes.length, player: p }));
        return;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Unwanted Attention${seatLabel(s, p)}`,
          options,
          "Remove 2 heroes you control from the quest, or shuffle an out of play Ringwraith into the encounter deck.",
        ),
      );
      return;
    }
    case KD.breath: {
      const heroes = seatView(s, p).heroes.filter(
        (h) => !attached(h, KD.breath),
      );
      if (!heroes.length) {
        log(s, "Black Breath: no hero can take it.");
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Black Breath · Attach to a hero you control${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("kdAttach", { target: h.id, source, player: p })],
          })),
          "Reduce attached hero's willpower, attack and defense to 0.",
        ),
      );
      return;
    }
    default:
      if (
        !nazgulTreachery(s, code, p, (target) =>
          fx("kdAttach", { target, source, player: p }),
        )
      )
        huntedTreachery(s, code, p);
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function knifeDarkEffect(s: GameState, e: Effect): boolean {
  const q = s.knifeDark;
  if (!q || !e.kind.startsWith("kd")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "kdDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("kdNextStage", { player: first }));
      return true;
    }
    case "kdNextStage": {
      q.advancing = false;
      if (s.stage >= KNIFE_DARK_QUESTS.length) return true;
      s.stage += 1;
      q.currentQuest = KNIFE_DARK_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      prepend(
        s,
        ...(s.stage === 2
          ? [
              fx("kdMidgewater", { player: first }),
              fx("kdWildProgress", { player: first }),
            ]
          : [fx("kdRingwraithsAttack", { player: first })]),
      );
      return true;
    }
    case "kdMidgewater": {
      const i = q.setAside.indexOf(KD.midgewater);
      if (i < 0) return true;
      q.setAside.splice(i, 1);
      s.staging.push(make(s, KD.midgewater));
      log(
        s,
        "Into the Wild: Midgewater is added to the staging area.",
        "chapter",
      );
      return true;
    }
    case "kdWildProgress": {
      const x = playerOrder(s).length;
      addCurrentQuestProgress(s, x);
      log(
        s,
        `Into the Wild: each player places 1 progress on the current quest (${x}).`,
        "good",
      );
      return true;
    }
    case "kdRingwraithsAttack": {
      const added: Unit[] = [];
      for (const code of [KD.weathertop, KD.witchKing]) {
        const i = q.setAside.indexOf(code);
        if (i < 0) continue;
        q.setAside.splice(i, 1);
        added.push(make(s, code));
      }
      const found = [...s.encounterDeck, ...s.encounterDiscard].filter((c) =>
        isKdNazgul(c),
      );
      s.encounterDeck = s.encounterDeck.filter((c) => !isKdNazgul(c));
      s.encounterDiscard = s.encounterDiscard.filter((c) => !isKdNazgul(c));
      added.push(...found.map((c) => make(s, c)));
      for (const x of added) {
        s.staging.push(x);
        if (isEnemyUnit(x)) enemyAddedToStaging(s, x);
      }
      shuffle(s, s.encounterDeck);
      q.finale = true;
      log(
        s,
        `The Ringwraiths Attack: ${added.map((x) => name(x)).join(", ")} ${added.length === 1 ? "is" : "are"} added to the staging area. Drive off every Nazgûl enemy to win.`,
        "chapter",
      );
      return true;
    }
    case "kdTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id, p);
      return true;
    }
    case "kdTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "kdAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u) return true;
      const held = q.resolving.splice(i, 1)[0];
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "kdShuffleWraith": {
      const i = q.setAside.indexOf(KD.ringwraith);
      if (i < 0) return true;
      q.setAside.splice(i, 1);
      s.encounterDeck.push(KD.ringwraith);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.code ? `${card(e.code).name}: ` : ""}an out of play Ringwraith is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "kdRemoveHeroes": {
      const n = e.value ?? 0;
      const heroes = seatView(s, p).heroes.filter((h) => h.committed);
      if (n <= 0 || !heroes.length) return true;
      if (heroes.length <= n) {
        forOwner(s, p, () => {
          for (const h of heroes) removeFromQuest(s, h);
        });
        log(
          s,
          `Unwanted Attention: ${heroes.map((h) => name(h)).join(" and ")} ${heroes.length === 1 ? "is" : "are"} removed from the quest.`,
          "danger",
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Unwanted Attention · Remove a hero from the quest (${n} to remove)${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("kdRemoveHero", { target: h.id, player: p }),
              fx("kdRemoveHeroes", { value: n - 1, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "kdRemoveHero":
      if (u?.committed) {
        forOwner(s, p, () => removeFromQuest(s, u));
        log(
          s,
          `Unwanted Attention: ${name(u)} is removed from the quest.`,
          "danger",
        );
      }
      return true;
    case "kdSquint":
      if (!wraithsAside(s)) {
        log(
          s,
          "Squint-eyed Southerner: an additional encounter card is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Squint-eyed Southerner${seatLabel(s, p)}`,
          [
            shuffleWraithOption(KD.squint, p),
            {
              id: "reveal",
              label: "Reveal an additional encounter card",
              effects: [fx("reveal", { player: p })],
            },
          ],
          "Shuffle an out of play Ringwraith into the encounter deck, or reveal an additional encounter card.",
        ),
      );
      return true;
    case "kdFerny": {
      const ferny = enemiesInPlay(s).find((x) => live(x, KD.ferny));
      if (!ferny) return true;
      const threat = fx("kdFernyThreat", { player: first });
      if (!wraithsAside(s)) {
        prepend(s, threat);
        return true;
      }
      choose(
        s,
        "Bill Ferny · The first player chooses",
        [
          shuffleWraithOption(KD.ferny, first),
          {
            id: "threat",
            label:
              "Each player raises their threat by 1 for each non-Fellowship hero they committed to the quest",
            effects: [threat],
          },
        ],
        "Forced: at the beginning of the staging step.",
      );
      return true;
    }
    case "kdFernyThreat": {
      const raised: string[] = [];
      for (const player of playerOrder(s)) {
        const n = seatView(s, player).heroes.filter(
          (h) => h.committed && card(h.code).sphere_code !== "fellowship",
        ).length;
        if (!n) continue;
        forOwner(s, player, () => raiseThreat(s, n, "encounter"));
        raised.push(`${who(s, player)} +${n}`);
      }
      log(
        s,
        `Bill Ferny: each player raises their threat for each non-Fellowship hero they committed${raised.length ? ` (${raised.join(", ")})` : " (no threat is raised)"}.`,
        "danger",
      );
      return true;
    }
    case "kdWildForced": {
      const x = playerOrder(s).length;
      const progress = currentQuestProgress(s);
      const remove = fx("kdWildRemove", { value: x, player: first });
      const options: Option[] = [
        ...(progress >= x
          ? [
              {
                id: "progress",
                label: `Remove ${x} progress from the current quest`,
                effects: [remove],
              },
            ]
          : []),
        ...(wraithsAside(s) ? [shuffleWraithOption(KD.wild, first)] : []),
      ];
      if (!options.length) {
        prepend(s, remove);
        return true;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        "Into the Wild · The first player chooses",
        options,
        "Forced: at the end of the round.",
      );
      return true;
    }
    case "kdWildRemove": {
      const removed = removeCurrentQuestProgress(s, e.value ?? 0);
      log(
        s,
        `Into the Wild: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest.`,
        "danger",
      );
      return true;
    }
    case "kdMidgewaterReturn": {
      const engaged = allEngaged(s).filter(isEnemyUnit);
      for (const x of engaged) returnToStaging(s, x);
      if (engaged.length)
        log(
          s,
          "Midgewater: each engaged enemy returns to the staging area.",
          "danger",
        );
      return true;
    }
    case "kdHillsOffer": {
      const hills = kdLocations(s).find((l) => l.id === e.target);
      const enemies = enemiesInPlay(s).filter((x) => !card(x.code).is_unique);
      if (!hills || !enemies.length) return true;
      choose(
        s,
        "Weather Hills · Place a non-unique enemy facedown under it?",
        [
          ...enemies.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)}${where(s, x)}`,
            effects: [
              fx("kdHillsPlace", { target: x.id, source: hills.id, player: p }),
            ],
          })),
          { id: "skip", label: "Decline", effects: [] },
        ],
        "Response: while an enemy is under this location, it is out of play. It returns to the staging area when the location leaves play.",
      );
      return true;
    }
    case "kdHillsPlace": {
      const hills = kdLocations(s).find((l) => l.id === e.source);
      if (!hills || !u || !enemiesInPlay(s).some((x) => x.id === u.id))
        return true;
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      forOwner(s, ownerOf(s, u), () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      const entry = q.hills.find((h) => h.location === hills.id);
      if (entry) entry.codes.push(u.code);
      else q.hills.push({ location: hills.id, codes: [u.code] });
      log(
        s,
        `Weather Hills: ${name(u)} is placed facedown under it, out of play.`,
        "good",
      );
      return true;
    }
    case "kdPonyAlly": {
      const allies = seatView(s, first).hand.filter(
        (x) => card(x.code).type_code === "ally" && allyCanEnter(s, x.code),
      );
      if (!allies.length) return true;
      forOwner(s, first, () =>
        choose(
          s,
          `The Prancing Pony · Put an ally into play from your hand?${seatLabel(s, first)}`,
          [
            ...allies.map((x) => ({
              id: x.id,
              code: x.code,
              label: name(x),
              effects: [fx("kdPonyEnter", { source: x.id, player: first })],
            })),
            { id: "skip", label: "Decline", effects: [] },
          ],
          "Response: after the players travel here.",
        ),
      );
      return true;
    }
    case "kdPonyEnter":
      forOwner(s, p, () => {
        const ally = s.hand.find((x) => x.id === e.source);
        if (!ally || !allyCanEnter(s, ally.code)) return;
        s.hand = s.hand.filter((x) => x.id !== ally.id);
        log(s, `The Prancing Pony: ${name(ally)} is put into play.`, "good");
        enterAlly(s, ally, false, false, true);
      });
      return true;
    case "kdPonyForced": {
      const x = playerOrder(s).length;
      const found: string[] = [];
      let discarded = 0;
      // Discarding stops when the encounter deck runs out: the discard pile is
      // not shuffled back, or the same cards would be discarded forever.
      while (found.length < x && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (card(code).type_code === "enemy") found.push(code);
        else {
          s.encounterDiscard.push(code);
          discarded++;
        }
      }
      log(
        s,
        `The Prancing Pony leaves play: ${discarded} card${discarded === 1 ? " is" : "s are"} discarded from the encounter deck${found.length ? `; ${found.map((c) => card(c).name).join(", ")} ${found.length === 1 ? "enters" : "enter"} play engaged with ${who(s, first)}` : ""}.`,
        "danger",
      );
      for (const code of found) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        forOwner(s, first, () => engage(s, enemy));
        if (s.staging.some((y) => y.id === enemy.id))
          enemyAddedToStaging(s, enemy);
      }
      return true;
    }
    case "kdWeathertopTravel": {
      const ring = oneRing(s);
      if (ring && !ring.exhausted) {
        ring.exhausted = true;
        log(
          s,
          "Weathertop: the first player exhausts The One Ring to travel here.",
          "danger",
        );
      }
      return true;
    }
    case "kdHillsReturn":
      returnHidden(s);
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Continuous effects.

/** Enemies under a Weather Hills that left play return to the staging area. */
function returnHidden(s: GameState) {
  const q = s.knifeDark;
  if (!q) return;
  const locations = kdLocations(s);
  for (const h of [...q.hills]) {
    if (locations.some((l) => l.id === h.location)) continue;
    q.hills = q.hills.filter((x) => x !== h);
    const back = h.codes.map((code) => make(s, code));
    for (const x of back) {
      s.staging.push(x);
      enemyAddedToStaging(s, x);
    }
    log(
      s,
      `Weather Hills leaves play: ${back.map((x) => name(x)).join(", ")} ${back.length === 1 ? "returns" : "return"} to the staging area.`,
      "danger",
    );
  }
}
function check(s: GameState) {
  const q = s.knifeDark;
  if (!q) return;
  lotrSagaCheck(s);
  if (s.status !== "playing") return;
  returnHidden(s);
  // 3B: if there are no Nazgûl enemies in play, the players win the game.
  if (q.finale && s.stage === 3 && stageLive(s) && !kdNazgulInPlay(s).length) {
    win(
      s,
      "No Nazgûl enemy remains in play: the Ringwraiths are driven from Weathertop.",
    );
  }
}
const spies = (s: GameState, u: Unit) =>
  isEnemyUnit(u) && kdTrait(u, "Spy")
    ? s.staging.filter((l) => live(l, KD.chetwood)).length
    : 0;
/** Rider of Mordor: characters of its engaged player get −1 willpower. */
function riderPenalty(s: GameState, u: Unit) {
  if (!isHeroUnit(u) && !isAllyUnit(u)) return 0;
  const player = ownerOf(s, u);
  return seatView(s, player).engaged.filter((x) => live(x, KD.rider)).length;
}

// ---------------------------------------------------------------------------
// Hooks.

export const KNIFE_DARK_HOOKS: Batch4ScenarioHooks = {
  setup: setupKnifeDark,
  advance,
  stageInfo: knifeDarkStageInfo,
  check,
  encounter,
  shadow,
  committed: (s) => {
    if (s.knifeDark && enemiesInPlay(s).some((u) => live(u, KD.ferny)))
      prepend(s, fx("kdFerny", { player: firstPlayer(s) }));
  },
  stats: (s, u) => {
    if (!s.knifeDark) return {};
    if (isEnemyUnit(u))
      return { attack: spies(s, u) + nazgulAttackBonus(s, u) };
    const breath = isHeroUnit(u) && attached(u, KD.breath);
    return {
      will: -riderPenalty(s, u),
      attack: breath ? -1000 : 0,
      defense: breath ? -1000 : 0,
    };
  },
  willpowerOverride: (s, u) =>
    s.knifeDark && isHeroUnit(u) && attached(u, KD.breath) ? 0 : undefined,
  threatBonus: (s, u) =>
    !s.knifeDark || !isEnemyUnit(u)
      ? 0
      : spies(s, u) - ((s.victoryCards ?? []).includes(KD.weathertop) ? 1 : 0),
  engagementBonus: (s, u) =>
    !s.knifeDark
      ? 0
      : (live(u, KD.rider) && oneRingExhausted(s) ? -10 : 0) +
        nazgulEngagementBonus(s, u),
  locationQuestBonus: pathlessQuestBonus,
  immune: (s, u) =>
    !!s.knifeDark && (live(u, KD.weathertop) || nazgulImmune(s, u)),
  cannotAttach: (s, u, code) => !!s.knifeDark && nazgulCannotAttach(s, u, code),
  cannotOptionallyEngage: (s, u) =>
    !!s.knifeDark &&
    (live(u, KD.ferny) || (live(u, KD.shady) && oneRingExhausted(s))),
  cannotDefend: (s, enemy, defender) =>
    !!s.knifeDark && nazgulCannotDefend(s, enemy, defender),
  // Midgewater: while it is the active location, enemies cannot attack, take
  // damage, or be engaged.
  enemyCannotAttack: (s, u) =>
    !!s.knifeDark && isEnemyUnit(u) && midgewaterActive(s),
  cannotEngage: (s, u) =>
    !!s.knifeDark && isEnemyUnit(u) && midgewaterActive(s),
  damageAmount: (s, u, amount, context) => {
    if (!s.knifeDark || !isEnemyUnit(u)) return amount;
    if (midgewaterActive(s)) return 0;
    if (nazgulNoDamage(s, u, context)) return 0;
    return amount;
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (s.knifeDark) nazgulAttackStarted(s, enemy, player);
  },
  travelProblem: (s, u) => {
    if (!s.knifeDark || !live(u, KD.weathertop)) return null;
    const ring = oneRing(s);
    return !ring || ring.exhausted
      ? "Weathertop: the first player must exhaust The One Ring to travel here."
      : null;
  },
  travelEffects: (s, u) =>
    s.knifeDark && live(u, KD.weathertop)
      ? [fx("kdWeathertopTravel", { player: firstPlayer(s) })]
      : undefined,
  travelEntered: (s, u) => {
    if (!s.knifeDark || u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === KD.midgewater)
      prepend(s, fx("kdMidgewaterReturn", { player: first }));
    else if (u.code === KD.hills)
      prepend(s, fx("kdHillsOffer", { target: u.id, player: first }));
    else if (u.code === KD.pony)
      prepend(s, fx("kdPonyAlly", { player: first }));
  },
  explored: (s, u) => {
    if (!s.knifeDark) return;
    if (live(u, KD.pony))
      prepend(s, fx("kdPonyForced", { player: firstPlayer(s) }));
    // Forced: after this location leaves play, its enemies return.
    if (s.knifeDark.hills.some((h) => h.location === u.id))
      prepend(s, fx("kdHillsReturn", { player: firstPlayer(s) }));
  },
  roundEnd: (s) =>
    s.knifeDark && s.stage === 2 && stageLive(s)
      ? [fx("kdWildForced", { player: firstPlayer(s) })]
      : [],
  attackFinished: huntedAttackFinished,
  effect: (s, e) =>
    huntedEffect(s, e) || nazgulEffect(s, e) || knifeDarkEffect(s, e),
  sharedEffect: (e) =>
    [
      "kdDefeatQuest",
      "kdNextStage",
      "kdMidgewater",
      "kdWildProgress",
      "kdRingwraithsAttack",
      "kdShuffleWraith",
      "kdFernyThreat",
      "kdWildRemove",
      "kdMidgewaterReturn",
      "kdPonyForced",
      "kdHillsReturn",
      "kdWeathertopTravel",
    ].includes(e.kind),
};
