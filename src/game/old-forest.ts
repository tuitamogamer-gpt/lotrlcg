import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  random,
  removeShadowCard,
  shuffle,
  stats,
} from "./core";
import {
  addVictoryCard,
  charactersCommitted,
  damage,
  destroy,
  discardAttachment,
  discardHandCard,
  discardQuestAttachments,
  enemyAddedToStaging,
  exhaustCharacter,
  progressLocation,
  raiseThreat,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { lotrSagaCheck } from "./lotr-saga";
import { returnToStaging } from "./black-riders-hunted";
import {
  OF,
  OLD_FOREST_RECIPES,
  OF_STAGE_TWO,
  isOfLocation,
  isOfStageTwo,
  ofVictory,
  ofVictoryGoal,
  ofVictoryLocations,
  ofVictoryTotal,
  oldForestStageInfo,
} from "./old-forest-support";
export * from "./old-forest-support";

const TREACHERIES: readonly string[] = [
  OF.swaying,
  OF.branches,
  OF.song,
  OF.lost,
  OF.ending,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const isEnemyUnit = (u: Unit) => card(u.code).type_code === "enemy";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(l, code));
const currentIs = (s: GameState, code: string) =>
  s.oldForest?.currentQuest === code && stageLive(s);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const sung = (u: Unit) => u.attachments.some((a) => a.code === OF.song);
const withywindleInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some(
    (l) => l.code === OF.withywindle,
  );
const tomUnit = (s: GameState) =>
  globalCharacters(s).find((u) => u.code === OF.tom);
/** 3B: Old Man Willow stays in the staging area, engaged with each player. */
const willowStage = (s: GameState) =>
  !!s.oldForest &&
  s.stage === 3 &&
  s.oldForest.currentQuest === OF.wicked &&
  stageLive(s);
/** Misleading Path: with no active location, the players must travel there. */
const misleadingForced = (s: GameState) =>
  !!s.oldForest &&
  !allActiveLocations(s).length &&
  s.staging.some((l) => live(l, OF.misleading));
const playedThisRound = (s: GameState, p: number) =>
  s.oldForest && s.oldForest.playedRound === s.round
    ? (s.oldForest.played[p] ?? 0)
    : 0;
/** Remove one copy from the victory display, with its victory points. */
function takeFromVictory(s: GameState, code: string) {
  const list = s.victoryCards ?? [];
  const i = list.lastIndexOf(code);
  if (i < 0) return false;
  list.splice(i, 1);
  s.victory -= ofVictory(s, code);
  return true;
}
/** A random location in the victory display. */
function randomVictoryLocation(s: GameState) {
  const locations = ofVictoryLocations(s);
  if (!locations.length) return undefined;
  return locations[Math.floor(random(s) * locations.length)];
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupOldForest(s: GameState) {
  const r = OLD_FOREST_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Stage 1A searches the encounter deck for the setup locations; the
  // recipe's prepared staging area belongs to that deck.
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...section("sharedStagingArea"),
  ]);
  s.oldForest = {
    currentQuest: OF.farewell,
    advancing: false,
    setAside: section("sharedSetAside"),
    stageTwo: [...OF_STAGE_TWO],
    resolving: [],
    endingFailing: 0,
    playedRound: 0,
    played: [0, 0, 0, 0],
    tom: false,
  };
  log(
    s,
    "Farewell to the Shire: Old Man Willow and Withywindle are set aside, out of play. Each player searches the encounter deck for a different location.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.oldForest;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // Stages 1 and 2 have no quest points; only 3B can be defeated.
  if (s.stage !== 3) return true;
  const goal = oldForestStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Withywindle: the players cannot win the game while it is in play.
  if (withywindleInPlay(s)) return true;
  win(
    s,
    "The Wicked Willow is defeated: the hobbits escape Old Man Willow and the Old Forest.",
  );
  return true;
}
/** "Search the encounter deck and discard pile for ...": one option per card and zone. */
function searchOptions(
  s: GameState,
  match: (code: string) => boolean,
  kind: string,
  player: number,
): Option[] {
  const options: Option[] = [];
  for (const [zone, cards] of [
    ["deck", s.encounterDeck],
    ["discard", s.encounterDiscard],
  ] as const)
    for (const code of [...new Set(cards.filter((c) => match(c)))])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
        effects: [fx(kind, { code, text: zone, player })],
      });
  return options;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.oldForest;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === OF.tom) {
    if (!fromReveal) return true;
    const target = [...s.staging].reverse().find((u) => u.code === code);
    if (target) prepend(s, fx("otfTom", { target: target.id, player }));
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
    fx("otfTreachery", { code, source: u.id, player }),
    fx("otfTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.oldForest) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case OF.flies:
      prepend(s, fx("otfFlies", { player: p }));
      return true;
    case OF.misleading:
      forOwner(s, p, () => {
        const allies = s.hand.filter((h) => card(h.code).type_code === "ally");
        for (const a of allies)
          discardHandCard(s, a.id, { encounterEffect: true });
        log(
          s,
          `Misleading Path: ${who(s, p)} discard${s.table ? "s" : ""} each ally card in hand${allies.length ? ` (${allies.map((a) => name(a)).join(", ")})` : " (there is none)"}.`,
          "danger",
        );
      });
      return true;
    case OF.strange:
      c.attackBonus += 1;
      c.otfStrange = true;
      log(
        s,
        "Strange Woods: the attacking enemy gets +1 attack; if this attack destroys a character, each player raises their threat by 2.",
        "danger",
      );
      return true;
    case OF.oppressive: {
      const enemy = get(s, c.enemyId);
      if (!enemy || s.staging.some(isLocation)) {
        log(
          s,
          "Oppressive Forest: there is a location in the staging area, so the shadow has no effect.",
        );
        return true;
      }
      let index = -1;
      for (let i = (enemy.revealedShadowCount ?? 0) - 1; i >= 0; i--)
        if (enemy.shadows[i] === code) {
          index = i;
          break;
        }
      if (index < 0) return true;
      removeShadowCard(enemy, index);
      s.staging.push(make(s, code));
      log(
        s,
        "Oppressive Forest: there is no location in the staging area, so this shadow card is added to the staging area.",
        "danger",
      );
      return true;
    }
    case OF.branches: {
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u);
      const bonus = defenders.some((u) => isAlly(u)) ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Falling Branches: the attacking enemy gets +${bonus} attack${bonus === 2 ? " against an ally" : ""}.`,
        "danger",
      );
      return true;
    }
    case OF.ending:
      c.otfReturn = true;
      log(
        s,
        "Ending and Failing: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
  }
  return false;
}
function treachery(s: GameState, code: string, source: string) {
  const q = s.oldForest!;
  const p = activeSeat(s);
  switch (code) {
    case OF.swaying: {
      const codes = [...new Set(ofVictoryLocations(s))];
      if (!codes.length) {
        log(
          s,
          "Swaying Without Wind: no location is in the victory display, so it gains surge.",
          "danger",
        );
        prepend(
          s,
          fx("amonSurgeWindow", { code, player: p }),
          fx("reveal", { player: p }),
        );
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Swaying Without Wind · Return a location from the victory display${seatLabel(s, p)}`,
          codes.map((c) => ({
            id: c,
            code: c,
            label: `${card(c).name} · ${ofVictory(s, c)} victory point${ofVictory(s, c) === 1 ? "" : "s"}`,
            effects: [fx("otfReturn", { code: c, player: p })],
          })),
          "Peril. The chosen location returns to the staging area.",
        ),
      );
      return;
    }
    case OF.branches:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("otfBranches", { player })),
      );
      return;
    case OF.song: {
      const heroes = seatView(s, p).heroes.filter(
        (h) => h.committed && !sung(h),
      );
      if (!heroes.length) {
        log(
          s,
          `Song of Sleep: ${who(s, p)} control${s.table ? "s" : ""} no questing hero without Song of Sleep; it is discarded.`,
        );
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Song of Sleep · Remove a questing hero you control from the quest${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("otfSong", { target: h.id, source, player: p })],
          })),
          "Peril. The hero leaves the quest; Song of Sleep blanks its text box and it cannot ready.",
        ),
      );
      return;
    }
    case OF.lost: {
      for (const l of s.staging.filter(isLocation)) l.progress = 0;
      log(
        s,
        "Lost and Witless: all progress is discarded from each location in the staging area.",
        "danger",
      );
      const active = s.activeLocation;
      const candidates = s.staging.filter(isLocation);
      if (!active || card(active.code).is_unique || !candidates.length) return;
      const pick = candidates[Math.floor(random(s) * candidates.length)];
      s.staging = s.staging.filter((x) => x.id !== pick.id);
      s.staging.push(active);
      s.activeLocation = pick;
      log(
        s,
        `Lost and Witless: ${name(pick)} is chosen at random and switched with the active location, ${name(active)}.`,
        "danger",
      );
      return;
    }
    case OF.ending:
      q.endingFailing += 1;
      log(
        s,
        "Ending and Failing: at the end of the phase, each player raises their threat by the number of enemies in the staging area.",
        "danger",
      );
      return;
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function oldForestEffect(s: GameState, e: Effect): boolean {
  const q = s.oldForest;
  if (!q || !e.kind.startsWith("otf")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "otfSetupSearch": {
      const taken = new Set(
        s.staging.filter(isLocation).map((l) => card(l.code).name),
      );
      const codes = [
        ...new Set(
          s.encounterDeck.filter(
            (c) => isOfLocation(c) && !taken.has(card(c).name),
          ),
        ),
      ];
      if (!codes.length) {
        log(
          s,
          `Farewell to the Shire: ${who(s, p)} find${s.table ? "s" : ""} no different location in the encounter deck.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Farewell to the Shire · Add a different location to the staging area${seatLabel(s, p)}`,
          codes.map((c) => ({
            id: c,
            code: c,
            label: card(c).name,
            effects: [fx("otfSetupAdd", { code: c, player: p })],
          })),
          "Setup: each player searches the encounter deck and adds 1 different location to the staging area.",
        ),
      );
      return true;
    }
    case "otfSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i < 0) return true;
      s.encounterDeck.splice(i, 1);
      s.staging.push(make(s, e.code!));
      log(
        s,
        `Farewell to the Shire: ${who(s, p)} add${s.table ? "s" : ""} ${card(e.code!).name} to the staging area.`,
      );
      return true;
    }
    case "otfShuffle":
      shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    case "otfStageOne":
      log(
        s,
        "Farewell to the Shire: each player draws 1 card, then the players advance to a random stage 2A.",
        "chapter",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
        fx("otfAdvanceTwo", { player: first }),
      );
      return true;
    case "otfAdvanceTwo": {
      q.advancing = false;
      if (!q.stageTwo.length) return true;
      const previous = q.currentQuest;
      const pick = q.stageTwo[Math.floor(random(s) * q.stageTwo.length)];
      q.stageTwo = q.stageTwo.filter((c) => c !== pick);
      if (isOfStageTwo(previous)) {
        discardQuestAttachments(s, previous);
        q.stageTwo.push(previous);
      }
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = pick;
      log(
        s,
        `${isOfStageTwo(previous) ? "The players advance to a different random stage 2" : "The players advance to a random stage 2"}: The Living Forest · ${card(pick).back_name}.`,
        "chapter",
      );
      prepend(s, fx("otfLivingForest", { player: first }));
      return true;
    }
    case "otfLivingForest": {
      const locations = s.staging.filter(isLocation).length;
      const players = playerOrder(s).length;
      if (locations >= players) {
        log(
          s,
          `The Living Forest: there ${locations === 1 ? "is" : "are"} ${locations} location${locations === 1 ? "" : "s"} in the staging area, at least the number of players; there is no search.`,
        );
        return true;
      }
      const options = searchOptions(s, isOfLocation, "otfLocationFound", first);
      if (!options.length) {
        log(
          s,
          "The Living Forest: no location is in the encounter deck or discard pile.",
        );
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `The Living Forest · Search for a location${seatLabel(s, first)}`,
          options,
          "There are fewer locations in the staging area than players. Add it to the staging area, then shuffle the encounter deck.",
        ),
      );
      return true;
    }
    case "otfLocationFound": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const i = pile.lastIndexOf(e.code!);
      if (i < 0) return true;
      pile.splice(i, 1);
      s.staging.push(make(s, e.code!));
      shuffle(s, s.encounterDeck);
      log(
        s,
        `The Living Forest: ${card(e.code!).name} is added to the staging area from the ${e.text === "deck" ? "encounter deck" : "discard pile"}, and the encounter deck is shuffled.`,
        "danger",
      );
      return true;
    }
    case "otfQuestForced": {
      q.advancing = false;
      if (s.stage !== 2 || !isOfStageTwo(q.currentQuest)) return true;
      const total = ofVictoryTotal(s),
        goal = ofVictoryGoal(s);
      if (total >= goal) {
        log(
          s,
          `${card(q.currentQuest).back_name}: the locations in the victory display are worth ${total} victory points (${goal} needed); the players advance to stage 3A.`,
          "chapter",
        );
        prepend(s, fx("otfStageThree", { player: first }));
      } else {
        log(
          s,
          `${card(q.currentQuest).back_name}: the locations in the victory display are worth ${total} of ${goal} victory points; the players advance to a different random stage 2A.`,
          "chapter",
        );
        prepend(s, fx("otfAdvanceTwo", { player: first }));
      }
      return true;
    }
    case "otfStageThree": {
      const previous = q.currentQuest;
      if (isOfStageTwo(previous)) {
        discardQuestAttachments(s, previous);
        q.stageTwo.push(previous);
      }
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = OF.wicked;
      log(s, "The Wicked Willow begins.", "chapter");
      for (const c of [OF.willow, OF.withywindle]) {
        const i = q.setAside.indexOf(c);
        if (i < 0) continue;
        q.setAside.splice(i, 1);
        const x = make(s, c);
        s.staging.push(x);
        if (c === OF.willow) enemyAddedToStaging(s, x);
      }
      log(
        s,
        "The Wicked Willow: Old Man Willow and Withywindle are added to the staging area.",
        "danger",
      );
      const reveals = playerOrder(s).length - 1;
      if (reveals > 0) {
        log(
          s,
          `The Wicked Willow: ${reveals} encounter card${reveals === 1 ? " is" : "s are"} revealed.`,
          "danger",
        );
        prepend(
          s,
          ...Array.from({ length: reveals }, () =>
            fx("reveal", { player: first }),
          ),
        );
      }
      return true;
    }
    case "otfTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "otfTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "otfReturn": {
      if (!takeFromVictory(s, e.code!)) return true;
      s.staging.push(make(s, e.code!));
      log(
        s,
        `Swaying Without Wind: ${card(e.code!).name} returns from the victory display to the staging area.`,
        "danger",
      );
      return true;
    }
    case "otfBranches": {
      const questers = [
        ...seatView(s, p).heroes,
        ...seatView(s, p).allies,
      ].filter((x) => x.committed);
      if (!questers.length) {
        log(
          s,
          `Falling Branches: ${who(s, p)} control${s.table ? "s" : ""} no questing character.`,
        );
        return true;
      }
      if (questers.length === 1) {
        prepend(s, fx("otfBranchesHit", { target: questers[0].id, player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Falling Branches · Remove a character you control from the quest${seatLabel(s, p)}`,
          questers.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${isAlly(x) ? 3 : 2} damage`,
            effects: [fx("otfBranchesHit", { target: x.id, player: p })],
          })),
          "That character takes 2 damage (3 damage instead if it is an ally).",
        ),
      );
      return true;
    }
    case "otfBranchesHit": {
      if (!u) return true;
      const amount = isAlly(u) ? 3 : 2;
      removeFromQuest(s, u);
      log(
        s,
        `Falling Branches: ${name(u)} is removed from the quest and takes ${amount} damage.`,
        "danger",
      );
      forOwner(s, ownerOf(s, u), () => damage(s, u.id, amount, {}));
      return true;
    }
    case "otfSong": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u || sung(u)) return true;
      const held = q.resolving.splice(i, 1)[0];
      removeFromQuest(s, u);
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(
        s,
        `Song of Sleep: ${name(u)} is removed from the quest; its text box is blank and it cannot ready.`,
        "danger",
      );
      return true;
    }
    case "otfFlies": {
      const hosts = [
        ...globalCharacters(s),
        ...s.staging,
        ...globalEngaged(s),
        ...allActiveLocations(s),
      ];
      const choices = hosts.flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!choices.length) {
        log(
          s,
          `Army of Flies: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      if (choices.length === 1) {
        const [{ host, a }] = choices;
        log(s, `Army of Flies: ${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, host, a));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Army of Flies · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          choices.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("otfDiscardAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "otfDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (!u || !a) return true;
      log(s, `Army of Flies: ${card(a.code).name} is discarded.`, "danger");
      forOwner(s, p, () => discardAttachment(s, u, a));
      return true;
    }
    case "otfRoot": {
      const x = ofVictoryLocations(s).length;
      if (x <= 0) {
        log(
          s,
          "Grasping Root: no location is in the victory display, so there is no damage to assign.",
        );
        return true;
      }
      log(
        s,
        `Grasping Root: ${who(s, p)} assign${s.table ? "s" : ""} ${x} damage among characters ${s.table ? "they control" : "you control"}.`,
        "danger",
      );
      prepend(
        s,
        ...Array.from({ length: x }, () =>
          fx("chooseDamage", { value: 1, player: p }),
        ),
      );
      return true;
    }
    case "otfGulley": {
      const amount = e.value ?? 0;
      if (amount <= 0) return true;
      forOwner(s, p, () => raiseThreat(s, amount, "encounter"));
      log(
        s,
        `Deep Gulley: ${who(s, p)} optionally engaged ${e.code ? card(e.code).name : "an enemy"} and raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${amount}.`,
        "danger",
      );
      return true;
    }
    case "otfDarkBad": {
      const heroes = seatView(s, p).heroes.filter(canExhaust);
      if (!heroes.length) {
        log(
          s,
          `Dark Bad Place: ${who(s, p)} control${s.table ? "s" : ""} no ready hero to exhaust.`,
        );
        return true;
      }
      if (heroes.length === 1) {
        prepend(s, fx("otfExhaust", { target: heroes[0].id, player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Dark Bad Place · Exhaust a hero you control${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("otfExhaust", { target: h.id, player: p })],
          })),
          "Forced: at the end of the planning phase, each player must exhaust a hero he controls.",
        ),
      );
      return true;
    }
    case "otfExhaust":
      if (u && !u.exhausted) {
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
        log(s, `Dark Bad Place: ${name(u)} is exhausted.`, "danger");
      }
      return true;
    case "otfBrambles": {
      const locations = [...s.staging, ...allActiveLocations(s)].filter(
        isLocation,
      );
      for (const l of locations) l.progress = 0;
      log(
        s,
        "Choked with Brambles: all progress is removed from each location in play.",
        "danger",
      );
      return true;
    }
    case "otfShifting": {
      const code = randomVictoryLocation(s);
      if (!code) {
        log(s, "Shifting Trees: no location is in the victory display.");
        return true;
      }
      takeFromVictory(s, code);
      s.encounterDiscard.push(code);
      log(
        s,
        `Shifting Trees: ${card(code).name} is discarded at random from the victory display.`,
        "danger",
      );
      return true;
    }
    case "otfEnding": {
      const copies = e.value ?? 0;
      const enemies = s.staging.filter(isEnemyUnit).length;
      const amount = copies * enemies;
      if (amount <= 0) {
        log(
          s,
          "Ending and Failing: no enemy is in the staging area at the end of the phase.",
        );
        return true;
      }
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, amount, "encounter"));
      log(
        s,
        `Ending and Failing: ${enemies} enem${enemies === 1 ? "y is" : "ies are"} in the staging area; each player raises their threat by ${amount}.`,
        "danger",
      );
      return true;
    }
    case "otfStrangeThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        "Strange Woods: the attack destroyed a character; each player raises their threat by 2.",
        "danger",
      );
      return true;
    case "otfReturnEnemy":
      if (u) returnToStaging(s, u);
      return true;
    case "otfTom": {
      if (!u || !inStaging(s, u)) return true;
      const order = playerOrder(s);
      if (order.length === 1) {
        prepend(s, fx("otfTomControl", { target: u.id, player: order[0] }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Tom Bombadil · Choose a player${seatLabel(s, p)}`,
          order.map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [fx("otfTomControl", { target: u.id, player })],
          })),
          "That player gains control of Tom Bombadil, ready and committed to the quest.",
        ),
      );
      return true;
    }
    case "otfTomControl": {
      if (!u || !inStaging(s, u)) return true;
      s.staging = s.staging.filter((x) => x.id !== u.id);
      forOwner(s, p, () => {
        u.owner = p;
        u.controller = p;
        u.exhausted = false;
        u.committed = true;
        s.allies.push(u);
        charactersCommitted(s, [u]);
      });
      q.tom = true;
      log(
        s,
        `Tom Bombadil: ${who(s, p)} gain${s.table ? "s" : ""} control of Tom Bombadil, ready and committed to the quest.`,
        "good",
      );
      return true;
    }
    case "otfTomLeaves": {
      q.tom = false;
      const tom = tomUnit(s);
      if (tom) forOwner(s, ownerOf(s, tom), () => destroy(s, tom, false));
      const count = s.encounterDiscard.length;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Tom Bombadil: ${tom ? "Tom Bombadil is discarded, then " : ""}the encounter discard pile (${count} card${count === 1 ? "" : "s"}) is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.oldForest || skipped) return [];
  const p = combat.attackPlayer ?? firstPlayer(s);
  const effects: Effect[] = [];
  if (combat.otfStrange && combat.otfDestroyed)
    effects.push(fx("otfStrangeThreat", { player: p }));
  if (combat.otfReturn)
    effects.push(fx("otfReturnEnemy", { target: combat.enemyId, player: p }));
  return effects;
}

export const OLD_FOREST_HOOKS: Batch4ScenarioHooks = {
  setup: setupOldForest,
  openingHandsKept: (s) => {
    if (!s.oldForest || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("otfSetupSearch", { player })),
      fx("otfShuffle", { player: first }),
      fx("otfStageOne", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: oldForestStageInfo,
  check: (s) => {
    if (s.oldForest) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // 2B: after placing progress as the result of questing successfully.
  successfulQuestProgress: (s) => {
    const q = s.oldForest;
    if (
      !q ||
      s.status !== "playing" ||
      s.stage !== 2 ||
      !isOfStageTwo(q.currentQuest) ||
      !stageLive(s)
    )
      return;
    q.advancing = true;
    prepend(s, fx("otfQuestForced", { player: firstPlayer(s) }));
  },
  planningEnd: (s) => {
    if (s.oldForest && currentIs(s, OF.dark))
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("otfDarkBad", { player })),
      );
  },
  roundEnd: (s) => {
    const q = s.oldForest;
    if (!q) return [];
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (currentIs(s, OF.brambles))
      effects.push(fx("otfBrambles", { player: first }));
    if (currentIs(s, OF.shifting))
      effects.push(fx("otfShifting", { player: first }));
    if (q.tom) effects.push(fx("otfTomLeaves", { player: first }));
    return effects;
  },
  endQuest: (s) => {
    const q = s.oldForest;
    if (!q || !q.endingFailing) return;
    const copies = q.endingFailing;
    q.endingFailing = 0;
    prepend(s, fx("otfEnding", { value: copies, player: firstPlayer(s) }));
  },
  extraStagingReveals: (s) =>
    s.oldForest
      ? (currentIs(s, OF.closing) ? 1 : 0) +
        (activeIs(s, OF.withywindle) ? 1 : 0)
      : 0,
  mustTravel: misleadingForced,
  travelProblem: (s, u) =>
    misleadingForced(s) && u.code !== OF.misleading
      ? "Misleading Path: with no active location, the players must travel to Misleading Path."
      : null,
  cannotHeal: (s) =>
    !!s.oldForest && s.staging.some((l) => live(l, OF.strange)),
  playProblem: (s) =>
    s.oldForest &&
    s.staging.some((l) => live(l, OF.oppressive)) &&
    playedThisRound(s, activeSeat(s)) >= 1
      ? "Oppressive Forest: each player cannot play more than 1 card each round."
      : null,
  playerCardPlayed: (s) => {
    const q = s.oldForest;
    if (!q) return;
    if (q.playedRound !== s.round) {
      q.playedRound = s.round;
      q.played = [0, 0, 0, 0];
    }
    const p = activeSeat(s);
    q.played[p] = (q.played[p] ?? 0) + 1;
  },
  engaged: (s, u, optional) => {
    if (!s.oldForest) return;
    const p = activeSeat(s);
    const effects: Effect[] = [];
    if (live(u, OF.root)) effects.push(fx("otfRoot", { player: p }));
    if (live(u, OF.flies)) effects.push(fx("otfFlies", { player: p }));
    if (optional) {
      const gulleys = s.staging.filter((l) => live(l, OF.gulley)).length;
      const x = stats(s, u).attack;
      if (gulleys && x > 0)
        effects.push(
          fx("otfGulley", { value: x * gulleys, code: u.code, player: p }),
        );
    }
    if (effects.length) prepend(s, ...effects);
  },
  explored: (s, _u, wasActive) => {
    if (!s.oldForest || !wasActive) return;
    const trailers = s.staging.filter((x) => live(x, OF.trailer));
    if (!trailers.length) return;
    log(
      s,
      `Long Trailer: the active location is explored, so ${trailers.length === 1 ? "Long Trailer makes" : "each Long Trailer makes"} an immediate attack against the first player.`,
      "danger",
    );
    prepend(
      s,
      ...trailers.map((t) =>
        fx("immediateAttack", { target: t.id, player: firstPlayer(s) }),
      ),
    );
  },
  // Wall of Trees: progress goes on it before it can go on the current quest.
  progress: (s, amount, quest) => {
    if (!s.oldForest || amount <= 0 || quest.id !== mainQuestUnit(s)?.id)
      return amount;
    let left = amount;
    for (const wall of s.staging.filter((l) => live(l, OF.wall))) {
      if (left <= 0) break;
      const n = Math.min(
        left,
        Math.max(0, locationQuest(s, wall) - wall.progress),
      );
      if (n <= 0) continue;
      log(
        s,
        `Wall of Trees: ${n} progress ${n === 1 ? "is" : "are"} placed on Wall of Trees before the current quest.`,
      );
      left -= n;
      progressLocation(s, wall, n);
    }
    return left;
  },
  // Wall of Trees has Victory X.
  locationDestination: (s, u) => {
    if (!s.oldForest || u.code !== OF.wall) return false;
    addVictoryCard(s, u.code);
    s.victory += playerOrder(s).length;
    for (const a of [...u.attachments]) discardAttachment(s, u, a);
    return true;
  },
  threatBonus: (s, u) =>
    s.oldForest && live(u, OF.wall) ? playerOrder(s).length : 0,
  indestructible: (s, u) => !!s.oldForest && live(u, OF.willow),
  cannotLeave: (s, u, destruction) =>
    willowStage(s) && !destruction && u.code === OF.willow && inStaging(s, u),
  cannotEngage: (s, u) => willowStage(s) && u.code === OF.willow,
  cannotOptionallyEngage: (s, u) => willowStage(s) && u.code === OF.willow,
  consideredEngaged: (s, u, player) =>
    willowStage(s) &&
    u.code === OF.willow &&
    inStaging(s, u) &&
    playerOrder(s).includes(player),
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.oldForest || !live(enemy, OF.willow)) return;
    const code = randomVictoryLocation(s);
    if (!code) {
      log(
        s,
        "Old Man Willow attacks: no location is in the victory display to discard.",
      );
      return;
    }
    const x = ofVictory(s, code);
    takeFromVictory(s, code);
    s.encounterDiscard.push(code);
    log(
      s,
      `Old Man Willow attacks: ${card(code).name} is discarded at random from the victory display, and ${who(s, player)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${x}.`,
      "danger",
    );
    if (x > 0) forOwner(s, player, () => raiseThreat(s, x, "encounter"));
  },
  characterBlanked: (s, u) => !!s.oldForest && isHero(u) && sung(u),
  cannotReady: (s, u) => !!s.oldForest && isCharacter(u) && sung(u),
  characterDestroyed: (s, u, context) => {
    if (
      s.oldForest &&
      s.combat &&
      isCharacter(u) &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.otfDestroyed = true;
  },
  attackFinished,
  effect: oldForestEffect,
  sharedEffect: (e) =>
    [
      "otfShuffle",
      "otfStageOne",
      "otfAdvanceTwo",
      "otfQuestForced",
      "otfStageThree",
      "otfBrambles",
      "otfShifting",
      "otfEnding",
      "otfStrangeThreat",
      "otfTomLeaves",
    ].includes(e.kind),
};
