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
  removeShadowCard,
  shuffle,
  stats,
} from "./core";
import {
  addVictoryCard,
  discardAttachment,
  discardHandCard,
  enemyAddedToStaging,
  engage,
  enterEnemyEngaged,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import { reduceThreat } from "./threat-reduction";
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
import { mainQuestUnit } from "./quest-state";
import {
  PP,
  PP_HIDEOUTS,
  PP_STAGE,
  PP_SUSPECTS,
  isBrigand,
  isHideout,
  isSuspect,
  ppRecipe,
  ppStageInfo,
  printedInvestigate,
} from "./prancing-pony-support";
export * from "./prancing-pony-support";

/**
 * Murder at the Prancing Pony (2015 Fellowship event, print-on-demand Q99.07).
 * One Suspect and one Hideout are set aside facedown at setup; the others form
 * the Investigation deck, which the Investigate keyword lets the first player
 * look at. At Running out of Time the first player names a Suspect and a
 * Hideout; the real ones come out and must be defeated at Apprehending the
 * Killer, where no Suspect can take damage while a Hideout is in play.
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
/** The current quest card, unless its text is blank. */
const at = (s: GameState, code: string) =>
  s.prancingPony?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isLocationCode = (c: string) => card(c).type_code === "location";
const isEnemyCode = (c: string) => card(c).type_code === "enemy";
/** Combat and quest phases span two engine phases. */
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
const locationsInPlay = (s: GameState) => [
  ...s.staging.filter((u) => isLocationCode(u.code)),
  ...allActiveLocations(s),
];
/** Cards in play by printed title (staging area, engaged or active). */
const inPlay = (s: GameState, c: string) =>
  [...enemiesInPlay(s), ...locationsInPlay(s)].some((u) => u.code === c);
const anyLive = (s: GameState, c: string) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => live(u, c));
const hideoutInVictory = (s: GameState, c: string) =>
  (s.victoryCards ?? []).includes(c);
/** The Investigate value of the active location. */
export function investigateValue(s: GameState) {
  const loc = allActiveLocations(s)[0];
  if (!loc || loc.blanked) return 0;
  return printedInvestigate(loc.code);
}
function toStaging(s: GameState, c: string) {
  const u = make(s, c);
  s.staging.push(u);
  if (isEnemy(u)) enemyAddedToStaging(s, u);
  return u;
}
/** Take a card out of a list, from the end (the most recent copy). */
function takeFrom(list: string[], c: string) {
  const i = list.lastIndexOf(c);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
/** Shuffle the encounter discard pile into the encounter deck. */
function reshuffle(s: GameState) {
  if (!s.encounterDiscard.length) return;
  s.encounterDeck = shuffle(s, [
    ...s.encounterDeck,
    ...s.encounterDiscard.splice(0),
  ]);
  log(s, "The encounter discard pile is shuffled into the encounter deck.");
}
/** Discard from the top of the encounter deck until a card matches. */
function discardUntil(s: GameState, match: (c: string) => boolean) {
  while (s.encounterDeck.length) {
    const c = s.encounterDeck.shift()!;
    s.encounterDiscard.push(c);
    if (match(c)) return c;
  }
  return null;
}
/** Mark Suspects and Hideouts the players have seen on the Investigation List. */
function check(s: GameState, codes: string[]) {
  const q = s.prancingPony!;
  for (const c of codes)
    if ((isSuspect(c) || isHideout(c)) && !q.checked.includes(c))
      q.checked.push(c);
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupPrancingPony(s: GameState) {
  const r = ppRecipe(!!s.easyMode);
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const aside = section("sharedSetAside");
  const suspects = aside.filter(isSuspect);
  const hideouts = aside.filter(isHideout);
  // 1A: 1 random Suspect and 1 random Hideout are set aside facedown; the
  // others and each Taken by Surprise form the Investigation deck.
  const suspect = suspects[Math.floor(random(s) * suspects.length)];
  const hideout = hideouts[Math.floor(random(s) * hideouts.length)];
  const investigation = shuffle(s, [
    ...suspects.filter((c) => c !== suspect),
    ...hideouts.filter((c) => c !== hideout),
    ...aside.filter((c) => c === PP.surprise),
  ]);
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.activeLocation = make(s, PP.pony);
  for (const c of section("sharedStagingArea")) s.staging.push(make(s, c));
  s.prancingPony = {
    currentQuest: PP.crime,
    advancing: false,
    setAside: aside.filter((c) => card(c).type_code === "rules"),
    guilty: { suspect, hideout },
    investigation,
    removed: [],
    checked: [],
    accusation: null,
    naming: null,
    stageProgress: null,
    extraReveals: 0,
    looking: [],
    resolving: [],
    smoke: null,
    billing: null,
    suspectDamage: [],
  };
  log(
    s,
    `Investigating the Crime: a Suspect and a Hideout are set aside facedown; the other ${investigation.length} cards form the Investigation deck. The Prancing Pony is the active location and Ramshackle Manor is added to the staging area.`,
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.prancingPony;
  if (!q) return false;
  const goal = ppStageInfo(s)?.quest ?? 0;
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
  prepend(s, fx("ppDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
const NEXT: Record<string, string> = {
  [PP.crime]: PP.time,
  [PP.time]: PP.killer,
};
/** The When Revealed effect of each A side. */
function stageEntry(s: GameState): Effect[] {
  const q = s.prancingPony!;
  const first = firstPlayer(s);
  if (q.currentQuest === PP.time)
    return [fx("ppRunningOutOfTime", { player: first })];
  if (q.currentQuest === PP.killer)
    return [
      ...playerOrder(s)
        .filter((p) => p !== first)
        .map((player) => fx("ppBrigandSearch", { player })),
      fx("ppShuffle", { player: first }),
    ];
  return [];
}

// ---------------------------------------------------------------------------
// The Investigation deck.

/**
 * The players look at Investigation cards: Suspects and Hideouts are checked
 * off the Investigation List and Taken by Surprise springs its ambush.
 */
function lookAt(s: GameState, codes: string[], source: string) {
  const first = firstPlayer(s);
  check(s, codes);
  log(
    s,
    `${source}: the first player looks at ${codes.map((c) => card(c).name).join(", ") || "no card"} from the Investigation deck.`,
  );
  // Each looked-at copy of Taken by Surprise springs its own ambush.
  const ambushes = codes.filter((c) => c === PP.surprise).length;
  if (ambushes)
    prepend(
      s,
      ...Array.from({ length: ambushes }, () =>
        fx("ppSurprise", { player: first }),
      ),
    );
}

// ---------------------------------------------------------------------------
// Encounter cards.

const TREACHERIES: readonly string[] = [
  PP.muscle,
  PP.smoke,
  PP.body,
  PP.accusations,
];
function encounter(s: GameState, c: string, replay = false, fromReveal = true) {
  const q = s.prancingPony;
  if (!q) return false;
  const player = activeSeat(s);
  if (c === PP.footpad) {
    if (!fromReveal) return true;
    const footpad = [...s.staging].reverse().find((u) => u.code === c);
    // The first player makes the choice for the players.
    if (footpad)
      prepend(
        s,
        fx("ppFootpad", { target: footpad.id, player: firstPlayer(s) }),
      );
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
    fx("ppTreachery", { code: c, source: u.id, player }),
    fx("ppTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const q = s.prancingPony!;
  const p = activeSeat(s);
  switch (held.code) {
    case PP.muscle: {
      const targets = enemiesInPlay(s).filter(
        (u) =>
          isBrigand(u.code) &&
          // Suspects cannot have attachments.
          !isSuspect(u.code) &&
          !u.blanked &&
          !u.attachments.some((a) => a.code === PP.muscle),
      );
      if (!targets.length) {
        log(s, "Hired Muscle: no Brigand enemy can take it.");
        return;
      }
      if (targets.length === 1) {
        prepend(
          s,
          fx("ppMuscle", { target: targets[0].id, source: held.id, player: p }),
        );
        return;
      }
      choose(
        s,
        `Hired Muscle · Attach to a Brigand enemy${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          label: name(u),
          code: u.code,
          effects: [
            fx("ppMuscle", { target: u.id, source: held.id, player: p }),
          ],
        })),
        card(PP.muscle).text,
      );
      return;
    }
    case PP.smoke: {
      const x = 1 + investigateValue(s);
      const discarded = s.encounterDeck.splice(0, x);
      s.encounterDiscard.push(...discarded);
      const value = discarded.reduce((n, c) => n + (card(c).threat ?? 0), 0);
      q.smoke = {
        phase: phaseKey(s),
        round: s.round,
        value:
          (q.smoke?.round === s.round && q.smoke.phase === phaseKey(s)
            ? q.smoke.value
            : 0) + value,
      };
      log(
        s,
        `Smoke and Mirrors: ${discarded.map((c) => card(c).name).join(", ") || "no card"} ${discarded.length === 1 ? "is" : "are"} discarded; +${value} threat in the staging area until the end of the phase.`,
        "danger",
      );
      return;
    }
    case PP.body:
      prepend(
        s,
        fx("ppBodyCount", { source: held.id, player: firstPlayer(s) }),
      );
      return;
    case PP.accusations: {
      const x = 1 + investigateValue(s);
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, x, "encounter"));
      log(
        s,
        `Deadly Accusations: each player raises his threat by ${x}.`,
        "danger",
      );
      return;
    }
  }
}

/** The shadow effects of this encounter deck. */
function shadow(s: GameState, c: string) {
  const combat = s.combat;
  if (!combat || !s.prancingPony) return false;
  const p = combat.attackPlayer ?? activeSeat(s);
  const enemy = get(s, combat.enemyId);
  switch (c) {
    case PP.ferny:
      prepend(s, fx("ppFernyShadow", { player: p }));
      return true;
    case PP.ruffian:
      combat.extraAttacks = (combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "Lawless Ruffian: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case PP.footpad: {
      const bonus = seatView(s, p).threat >= 35 ? 2 : 1;
      combat.attackBonus += bonus;
      log(
        s,
        `Greenway Footpad: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case PP.outlaw:
      prepend(s, fx("ppOutlawShadow", { target: enemy?.id, player: p }));
      return true;
    case PP.smoke:
      prepend(
        s,
        fx("ppDiscardAttachment", { text: "Smoke and Mirrors", player: p }),
      );
      return true;
    case PP.body:
      combat.ppBodyCount = true;
      log(
        s,
        "Rising Body Count: if this attack destroys a character, the defending player raises his threat by 2 or shuffles it into the Investigation deck.",
        "danger",
      );
      return true;
    case PP.accusations: {
      const x = investigateValue(s);
      combat.attackBonus += x;
      log(
        s,
        `Deadly Accusations: the attacking enemy gets +${x} attack.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

function ppEffect(s: GameState, e: Effect): boolean {
  const q = s.prancingPony;
  if (!q || !e.kind.startsWith("pp")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "ppDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("ppNextStage", { player: first }));
      return true;
    }
    case "ppNextStage": {
      q.advancing = false;
      const next = NEXT[q.currentQuest];
      if (!next) return true;
      q.currentQuest = next;
      s.stage = PP_STAGE[next];
      s.progress = 0;
      log(s, `${card(next).name} begins.`, "chapter");
      prepend(s, ...stageEntry(s));
      return true;
    }
    // 2A: discard until X locations are discarded; they enter the staging area.
    case "ppRunningOutOfTime": {
      reshuffle(s);
      const x = playerOrder(s).length;
      const found: string[] = [];
      while (found.length < x) {
        const c = discardUntil(s, isLocationCode);
        if (!c) break;
        takeFrom(s.encounterDiscard, c);
        found.push(c);
      }
      for (const c of found) toStaging(s, c);
      log(
        s,
        `Running out of Time: ${found.map((c) => card(c).name).join(", ") || "no location"} ${found.length === 1 ? "is" : "are"} added to the staging area.`,
        "danger",
      );
      return true;
    }
    // 3A: each player besides the first searches for a Brigand enemy.
    case "ppBrigandSearch": {
      const options = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(
            (c) => isEnemyCode(c) && isBrigand(c),
          ),
        ),
      ];
      if (!options.length) {
        log(s, "Apprehending the Killer: no Brigand enemy is left to find.");
        return true;
      }
      choose(
        s,
        `Apprehending the Killer · Search for a Brigand enemy${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("ppSearchTake", { text: c, player: p })],
        })),
        card(PP.killer).text,
      );
      return true;
    }
    case "ppSearchTake": {
      const c = e.text ?? "";
      if (!takeFrom(s.encounterDeck, c) && !takeFrom(s.encounterDiscard, c))
        return true;
      toStaging(s, c);
      log(s, `${card(c).name} is added to the staging area.`, "danger");
      return true;
    }
    case "ppShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    // 1B: each player raises his threat by 2 or reveals an additional card.
    case "ppHurry":
      choose(
        s,
        `Investigating the Crime · Raise your threat by 2, or reveal an additional encounter card this phase${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [fx("ppHurryThreat", { player: p })],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card this phase",
            effects: [fx("ppHurryReveal", { player: p })],
          },
        ],
        card(PP.crime).back_text,
      );
      return true;
    case "ppHurryThreat":
      forOwner(s, p, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        `Investigating the Crime: ${who(s, p)} ${verb(s, "raise")} threat by 2.`,
        "danger",
      );
      return true;
    case "ppHurryReveal":
      q.extraReveals += 1;
      log(
        s,
        `Investigating the Crime: ${who(s, p)} ${verb(s, "choose")} to reveal an additional encounter card this phase.`,
        "danger",
      );
      return true;
    // Investigate X: shuffle the Investigation deck and look at the top X.
    case "ppInvestigate": {
      const x = e.value ?? 0;
      q.investigation = shuffle(s, q.investigation);
      const looked = q.investigation.slice(0, x);
      lookAt(s, looked, `Investigate ${x} (${card(e.code ?? "").name})`);
      // Village Stable: a looked-at Suspect or Hideout can be brought out.
      if (e.code === PP.stable && looked.length) {
        const top = looked[0];
        if (isSuspect(top) || isHideout(top))
          prepend(
            s,
            fx("ppStable", { text: top, target: e.target, player: first }),
          );
      }
      return true;
    }
    case "ppWarehouse":
      choose(
        s,
        `Old Warehouse · Look at 2 additional cards, or reduce each player's threat by 3${seatLabel(s, first)}`,
        [
          {
            id: "look",
            label: "Look at 2 additional cards",
            effects: [
              fx("ppInvestigate", {
                value: 3,
                code: PP.warehouse,
                target: e.target,
                player: first,
              }),
            ],
          },
          {
            id: "threat",
            label: "Reduce each player's threat by 3",
            effects: [
              fx("ppWarehouseThreat", { player: first }),
              fx("ppInvestigate", {
                value: 1,
                code: PP.warehouse,
                target: e.target,
                player: first,
              }),
            ],
          },
        ],
        card(PP.warehouse).text,
      );
      return true;
    case "ppWarehouseThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () =>
          reduceThreat(s, 3, PP.warehouse, "encounter"),
        );
      log(s, "Old Warehouse: each player reduces his threat by 3.", "good");
      return true;
    case "ppInvestigateDone":
      return true;
    case "ppStable":
      choose(
        s,
        `Village Stable · Add it to the victory display to add ${card(e.text ?? "").name} to the staging area?${seatLabel(s, first)}`,
        [
          {
            id: "stable",
            label: `Add Village Stable to the victory display and ${card(e.text ?? "").name} to the staging area`,
            effects: [fx("ppStableTake", { text: e.text, player: first })],
          },
          { id: "skip", label: "Do not use Village Stable", effects: [] },
        ],
        card(PP.stable).text,
      );
      return true;
    case "ppStableTake": {
      const c = e.text ?? "";
      if (!takeFrom(q.investigation, c)) return true;
      // The explored Village Stable goes to the victory display.
      if (takeFrom(s.encounterDiscard, PP.stable)) addVictoryCard(s, PP.stable);
      toStaging(s, c);
      log(
        s,
        `Village Stable is added to the victory display: ${card(c).name} is added to the staging area.`,
        "danger",
      );
      return true;
    }
    // The Prancing Pony: look at 2 Investigation cards, or each player draws 2.
    case "ppPony":
      choose(
        s,
        `The Prancing Pony · Look at the top 2 cards of the Investigation deck, or each player draws 2 cards${seatLabel(s, first)}`,
        [
          {
            id: "look",
            label: "Look at the top 2 cards of the Investigation deck",
            effects: [fx("ppLookTop", { value: 2, player: first })],
          },
          {
            id: "draw",
            label: "Each player draws 2 cards",
            effects: playerOrder(s).map((player) =>
              fx("draw", { value: 2, player }),
            ),
          },
        ],
        card(PP.pony).text,
      );
      return true;
    case "ppLookTop":
      lookAt(s, q.investigation.slice(0, e.value ?? 0), "The Prancing Pony");
      return true;
    case "ppLookBottom": {
      const bottom = q.investigation.slice(-1);
      lookAt(s, bottom, e.text ?? "Investigation");
      return true;
    }
    // Taken by Surprise: an enemy from the encounter deck ambushes the first player.
    case "ppSurprise": {
      if (!takeFrom(q.investigation, PP.surprise)) return true;
      q.removed.push(PP.surprise);
      reshuffle(s);
      const c = discardUntil(s, isEnemyCode);
      log(
        s,
        `Taken by Surprise: ${c ? `${card(c).name} is put into play engaged with the first player` : "no enemy is discarded"}; Taken by Surprise is removed from the game.`,
        "danger",
      );
      if (c) {
        takeFrom(s.encounterDiscard, c);
        enterEnemyEngaged(s, make(s, c), first);
      }
      return true;
    }
    // 2B: a random Investigation card is removed from the game unseen.
    case "ppRemoveRandom": {
      if (!q.investigation.length) return true;
      const i = Math.floor(random(s) * q.investigation.length);
      const [c] = q.investigation.splice(i, 1);
      q.removed.push(c);
      log(
        s,
        "Running out of Time: a random card from the Investigation deck is removed from the game without looking at it.",
        "danger",
      );
      return true;
    }
    // 2B: reveal an encounter card and remain, or make the accusation.
    case "ppAccuseChoice":
      choose(
        s,
        `Running out of Time · Reveal an encounter card, or make the accusation${seatLabel(s, first)}`,
        [
          {
            id: "reveal",
            label: "Reveal an encounter card and remain at this stage",
            effects: [fx("reveal", { player: first })],
          },
          {
            id: "accuse",
            label: "Make the accusation and advance to stage 3A",
            effects: [fx("ppAccuse", { player: first })],
          },
        ],
        card(PP.time).back_text,
      );
      return true;
    case "ppAccuse":
      choose(
        s,
        `The accusation · Name a Suspect${seatLabel(s, first)}`,
        PP_SUSPECTS.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("ppNameSuspect", { text: c, player: first })],
        })),
        "The first player names 1 Suspect and 1 Hideout.",
      );
      return true;
    case "ppNameSuspect":
      q.naming = e.text ?? null;
      choose(
        s,
        `The accusation · Name a Hideout${seatLabel(s, first)}`,
        PP_HIDEOUTS.map((c) => ({
          id: c,
          code: c,
          label: card(c).name,
          effects: [fx("ppAccusation", { text: c, player: first })],
        })),
        `Suspect named: ${card(e.text ?? "").name}.`,
      );
      return true;
    case "ppAccusation": {
      const suspect = q.naming ?? "";
      const hideout = e.text ?? "";
      q.naming = null;
      const guilty = q.guilty;
      if (!guilty || !isSuspect(suspect) || !isHideout(hideout)) return true;
      q.guilty = null;
      toStaging(s, guilty.suspect);
      toStaging(s, guilty.hideout);
      check(s, [guilty.suspect, guilty.hideout]);
      const correct = guilty.suspect === suspect && guilty.hideout === hideout;
      q.accusation = { suspect, hideout, correct };
      log(
        s,
        `The accusation: ${card(suspect).name} at ${card(hideout).name}. The facedown cards are ${card(guilty.suspect).name} and ${card(guilty.hideout).name}: the accusation is ${correct ? "correct" : "not correct"}.`,
        correct ? "good" : "danger",
      );
      if (!correct) {
        for (const c of [suspect, hideout])
          if (!inPlay(s, c) && takeFrom(q.investigation, c)) {
            toStaging(s, c);
            check(s, [c]);
            log(
              s,
              `${card(c).name} is found in the Investigation deck and added to the staging area.`,
              "danger",
            );
          }
        for (const player of playerOrder(s))
          forOwner(s, player, () => raiseThreat(s, 3, "encounter"));
        log(
          s,
          "The accusation is not correct: each player raises his threat by 3.",
          "danger",
        );
      }
      prepend(s, fx("ppDefeatQuest", { player: first }));
      return true;
    }
    // Treacheries.
    case "ppTreachery": {
      const held = q.resolving.find((u) => u.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "ppTreacheryDone": {
      const i = q.resolving.findIndex((u) => u.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    case "ppMuscle": {
      const enemy = get(s, e.target);
      const held = q.resolving.find((u) => u.id === e.source);
      if (!enemy || !held) return true;
      // Hired Muscle stays attached instead of going to the discard pile.
      q.resolving = q.resolving.filter((u) => u.id !== held.id);
      enemy.attachments.push({
        id: held.id,
        code: PP.muscle,
        exhausted: false,
      });
      // Return the enemy to the staging area.
      const owner = playerOrder(s).find((x) =>
        seatView(s, x).engaged.some((u) => u.id === enemy.id),
      );
      if (owner !== undefined) {
        forOwner(s, owner, () => {
          s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
        });
        s.encounterDiscard.push(...enemy.shadows);
        enemy.shadows = [];
        delete enemy.faceupShadows;
        enemy.revealedShadowCount = 0;
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      log(
        s,
        `Hired Muscle is attached to ${name(enemy)}${owner !== undefined ? ", which returns to the staging area" : ""}.`,
        "danger",
      );
      return true;
    }
    case "ppBodyCount":
      choose(
        s,
        `Rising Body Count · Raise each player's threat by 2, or shuffle it into the Investigation deck${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise each player's threat by 2",
            effects: [
              fx("ppEachThreat", {
                value: 2,
                text: "Rising Body Count",
                player: p,
              }),
            ],
          },
          {
            id: "shuffle",
            label: "Shuffle Rising Body Count into the Investigation deck",
            effects: [fx("ppBodyShuffle", { source: e.source, player: p })],
          },
        ],
        card(PP.body).text,
      );
      return true;
    case "ppEachThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "ppBodyShuffle": {
      const held = q.resolving.find((u) => u.id === e.source);
      if (held) q.resolving = q.resolving.filter((u) => u.id !== held.id);
      else if (e.target) {
        // The shadow copy leaves the attacking enemy.
        const enemy = get(s, e.target);
        const i = enemy?.shadows.lastIndexOf(PP.body) ?? -1;
        if (!enemy || i < 0) return true;
        removeShadowCard(enemy, i);
      } else return true;
      q.investigation = shuffle(s, [...q.investigation, PP.body]);
      log(
        s,
        "Rising Body Count is shuffled into the Investigation deck.",
        "danger",
      );
      return true;
    }
    case "ppBodyShadow":
      choose(
        s,
        `Rising Body Count · Raise your threat by 2, or shuffle it into the Investigation deck${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [
              fx("ppThreat", {
                value: 2,
                text: "Rising Body Count",
                player: p,
              }),
            ],
          },
          {
            id: "shuffle",
            label: "Shuffle Rising Body Count into the Investigation deck",
            effects: [fx("ppBodyShuffle", { target: e.target, player: p })],
          },
        ],
        card(PP.body).shadow,
      );
      return true;
    case "ppFootpad":
      choose(
        s,
        `Greenway Footpad · Raise each player's threat by 2, or it attacks the first player${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise each player's threat by 2",
            effects: [
              fx("ppEachThreat", {
                value: 2,
                text: "Greenway Footpad",
                player: p,
              }),
            ],
          },
          {
            id: "attack",
            label:
              "Greenway Footpad makes an immediate attack against the first player",
            effects: [
              fx("immediateAttack", { target: e.target, player: first }),
            ],
          },
        ],
        card(PP.footpad).text,
      );
      return true;
    case "ppFernyShadow":
      choose(
        s,
        `Bill Ferny · Raise your threat by 4, or this attack is considered undefended${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 4",
            effects: [
              fx("ppThreat", { value: 4, text: "Bill Ferny", player: p }),
            ],
          },
          {
            id: "undefended",
            label: "This attack is considered undefended",
            effects: [fx("ppUndefended", { player: p })],
          },
        ],
        card(PP.ferny).shadow,
      );
      return true;
    case "ppThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "ppUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, "Bill Ferny: this attack is considered undefended.", "danger");
      }
      return true;
    case "ppOutlawShadow":
      choose(
        s,
        `Chetwood Outlaw · Raise your threat by 2, or the attacking enemy returns to the staging area after this attack${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [
              fx("ppThreat", { value: 2, text: "Chetwood Outlaw", player: p }),
            ],
          },
          {
            id: "return",
            label:
              "Return the attacking enemy to the staging area after this attack",
            effects: [fx("ppOutlawReturn", { player: p })],
          },
        ],
        card(PP.outlaw).shadow,
      );
      return true;
    case "ppOutlawReturn":
      if (s.combat) s.combat.returnToStaging = true;
      return true;
    case "ppDiscardAttachment": {
      const owned = [
        ...seatView(s, p).heroes,
        ...seatView(s, p).allies,
      ].flatMap((u) => u.attachments.map((a) => ({ u, a })));
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
            fx("ppDiscardOne", { target: u.id, source: a.id, player: p }),
          ],
        })),
        card(PP.smoke).shadow,
      );
      return true;
    }
    case "ppDiscardOne": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    // Johnny Goblin-fingers: a random card from hand raises threat by its cost.
    case "ppJohnny":
      forOwner(s, p, () => {
        if (!s.hand.length) {
          log(
            s,
            `Johnny Goblin-fingers: ${who(s, p)} ${verb(s, "have")} no card in hand.`,
          );
          return;
        }
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        const cost = Number(card(pick.code).cost ?? 0) || 0;
        discardHandCard(s, pick.id, { encounterEffect: true });
        raiseThreat(s, cost, "encounter");
        log(
          s,
          `Johnny Goblin-fingers: ${card(pick.code).name} is discarded at random; ${who(s, p)} ${verb(s, "raise")} threat by ${cost}.`,
          "danger",
        );
      });
      return true;
    // Bree-land Informant: raise threat by 1 and spend 1 resource to look.
    case "ppInformant": {
      const informant = get(s, e.target);
      const heroes = seatView(s, p).heroes.filter((h) => h.resources > 0);
      if (!informant || !heroes.length) return true;
      choose(
        s,
        `Bree-land Informant · Raise your threat by 1 and spend 1 resource to look at the bottom card of the Investigation deck?${seatLabel(s, p)}`,
        [
          ...heroes.map((h) => ({
            id: h.id,
            label: `Spend 1 resource from ${name(h)}`,
            effects: [
              fx("ppInformantPay", {
                target: informant.id,
                source: h.id,
                player: p,
              }),
            ],
          })),
          { id: "skip", label: "Do not respond", effects: [] },
        ],
        card(PP.informant).text,
      );
      return true;
    }
    case "ppInformantPay": {
      const informant = get(s, e.target);
      const hero = get(s, e.source);
      if (!informant || !hero || hero.resources < 1) return true;
      hero.resources -= 1;
      forOwner(s, p, () => raiseThreat(s, 1, "encounter"));
      prepend(
        s,
        fx("ppLookBottom", { text: "Bree-land Informant", player: p }),
        fx("ppDiscardEnemy", { target: informant.id, player: p }),
      );
      return true;
    }
    case "ppDiscardEnemy": {
      const u = get(s, e.target);
      if (!u) return true;
      const owner = playerOrder(s).find((x) =>
        seatView(s, x).engaged.some((v) => v.id === u.id),
      );
      if (owner !== undefined)
        forOwner(s, owner, () => {
          s.engaged = s.engaged.filter((v) => v.id !== u.id);
        });
      else s.staging = s.staging.filter((v) => v.id !== u.id);
      s.encounterDiscard.push(...u.shadows, u.code);
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      log(s, `${name(u)} is discarded.`);
      return true;
    }
    // Hideout travel: search for a named enemy and add it to the staging area.
    case "ppHideoutSearch": {
      const c = e.text ?? "";
      const zones = [s.encounterDeck, s.encounterDiscard];
      if (e.flag) zones.push(s.victoryCards ?? []);
      const zone = zones.find((z) => z.includes(c));
      if (!zone) {
        log(s, `${card(e.code ?? "").name}: no ${card(c).name} is found.`);
      } else {
        takeFrom(zone, c);
        if (zone === s.victoryCards) s.victory -= card(c).victory ?? 0;
        if (e.value === 1) {
          // Staddle Hiding Hole reveals the Greenway Footpad.
          prepend(s, fx("revealCard", { code: c, player: first }));
        } else {
          toStaging(s, c);
          log(
            s,
            `${card(e.code ?? "").name}: ${card(c).name} is added to the staging area.`,
            "danger",
          );
        }
      }
      s.encounterDeck = shuffle(s, s.encounterDeck);
      return true;
    }
    case "ppTravelThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      log(
        s,
        "Ramshackle Manor: each player raises his threat by 1 to travel here.",
        "danger",
      );
      return true;
    case "ppDarkAlley": {
      reshuffle(s);
      const c = discardUntil(s, isEnemyCode);
      if (c) {
        takeFrom(s.encounterDiscard, c);
        toStaging(s, c);
      }
      log(
        s,
        `Dark Alley: ${c ? `${card(c).name} is added to the staging area` : "no enemy is discarded"}.`,
        "danger",
      );
      return true;
    }
    case "ppMarketPay": {
      forOwner(s, p, () => {
        const hero = [...s.heroes].sort((a, b) => b.resources - a.resources)[0];
        if (hero && hero.resources > 0) {
          hero.resources -= 1;
          log(s, `Market Square: ${name(hero)} spends 1 resource.`);
        }
      });
      return true;
    }
    case "ppStableDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, pick.id, { encounterEffect: true });
        log(
          s,
          `Village Stable: ${who(s, p)} ${verb(s, "discard")} ${card(pick.code).name} at random.`,
        );
      });
      return true;
    case "ppWarehouseReveal":
      prepend(s, fx("reveal", { player: first }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

const suspectsInPlay = (s: GameState) =>
  enemiesInPlay(s).filter((u) => isSuspect(u.code));
const hideoutInPlay = (s: GameState) =>
  locationsInPlay(s).some((u) => isHideout(u.code));
const brigandsInPlay = (s: GameState) =>
  enemiesInPlay(s).filter((u) => isBrigand(u.code) && !u.blanked);
const muscled = (u: Unit) =>
  u.attachments.some((a) => a.code === PP.muscle && !a.blanked);
const engagedPlayer = (s: GameState, u: Unit) =>
  playerOrder(s).find((p) => seatView(s, p).engaged.some((x) => x.id === u.id));
const blankShadow = (u: Unit) => u.shadows.some((c) => !card(c).shadow);

export const PRANCING_PONY_HOOKS: Batch4ScenarioHooks = {
  setup: setupPrancingPony,
  advance,
  stageInfo: ppStageInfo,
  encounter,
  shadow,
  // 1B: each player raises his threat by 2 or reveals an additional card.
  questBegin: (s) => {
    const q = s.prancingPony;
    if (!q) return [];
    q.extraReveals = 0;
    return at(s, PP.crime)
      ? playerOrder(s).map((player) => fx("ppHurry", { player }))
      : [];
  },
  extraStagingReveals: (s) =>
    s.prancingPony && at(s, PP.crime) ? s.prancingPony.extraReveals : 0,
  // 1B: no more than 4 progress on this stage each round.
  progress: (s, amount, quest) => {
    const q = s.prancingPony;
    if (!q || !at(s, PP.crime) || quest.id !== mainQuestUnit(s)?.id)
      return amount;
    const placed =
      q.stageProgress?.round === s.round ? q.stageProgress.amount : 0;
    return Math.max(0, Math.min(amount, 4 - placed));
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.prancingPony;
    if (!q || !at(s, PP.crime) || quest.id !== mainQuestUnit(s)?.id) return;
    const placed =
      q.stageProgress?.round === s.round ? q.stageProgress.amount : 0;
    q.stageProgress = { round: s.round, amount: placed + amount };
  },
  // 2B: an unsuccessful quest removes a random Investigation card unseen.
  failedQuest: (s) => {
    if (s.prancingPony && at(s, PP.time))
      prepend(s, fx("ppRemoveRandom", { player: firstPlayer(s) }));
    return false;
  },
  // 2B: progress from a successful quest leads to the first player's choice,
  // after the explored active location's Investigate keyword.
  successfulQuestProgress: (s, amount) => {
    if (!s.prancingPony || !at(s, PP.time) || amount <= 0) return;
    const effect = fx("ppAccuseChoice", { player: firstPlayer(s) });
    const i = s.queue.map((e) => e.kind).lastIndexOf("ppInvestigateDone");
    if (i >= 0) s.queue.splice(i + 1, 0, effect);
    else prepend(s, effect);
  },
  // 3B: each Suspect in play engages the first player.
  encounterBegin: (s) => {
    if (!s.prancingPony || !at(s, PP.killer)) return;
    const first = firstPlayer(s);
    for (const u of suspectsInPlay(s)) {
      if (engagedPlayer(s, u) === first) continue;
      const owner = engagedPlayer(s, u);
      if (owner !== undefined)
        forOwner(s, owner, () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
      if (owner !== undefined) s.staging.push(u);
      forOwner(s, first, () => engage(s, u));
      log(
        s,
        `Apprehending the Killer: ${name(u)} engages the first player.`,
        "danger",
      );
    }
  },
  stats: (s, u) => {
    if (!s.prancingPony || u.blanked) return {};
    let attack = 0,
      defense = 0;
    if (u.code === PP.ruffian) {
      const p = engagedPlayer(s, u);
      if (p !== undefined && seatView(s, p).threat >= 35) attack += 2;
    }
    if (muscled(u)) {
      attack += 1;
      defense += 1;
    }
    if (isSuspect(u.code) && hideoutInVictory(s, PP.campsite)) {
      attack += 1;
      defense += 1;
    }
    return attack || defense ? { attack, defense } : {};
  },
  threatBonus: (s, u) => {
    if (!s.prancingPony || u.blanked) return 0;
    let bonus = 0;
    if (u.code === PP.susie) bonus += brigandsInPlay(s).length;
    if (muscled(u)) bonus += 1;
    if (isSuspect(u.code) && hideoutInVictory(s, PP.campsite)) bonus += 1;
    return bonus;
  },
  // Smoke and Mirrors: the discarded cards' threat for the phase.
  stagingThreat: (s) => {
    const m = s.prancingPony?.smoke;
    return m && m.round === s.round && m.phase === phaseKey(s) ? m.value : 0;
  },
  damageAmount: (s, u, amount) => {
    const q = s.prancingPony;
    if (!q) return amount;
    // Dark Alley: enemies in the staging area cannot take damage.
    if (
      isEnemy(u) &&
      s.staging.some((x) => x.id === u.id) &&
      anyLive(s, PP.alley)
    )
      return 0;
    if (u.blanked) return amount;
    if (u.code === PP.susie && brigandsInPlay(s).some((x) => x.id !== u.id))
      return 0;
    if (isSuspect(u.code)) {
      // 3B: no damage to Suspects while a Hideout is in play.
      if (at(s, PP.killer) && hideoutInPlay(s)) return 0;
      // Archet Trading Post: no more than 5 damage each round.
      if (hideoutInVictory(s, PP.archet)) {
        const taken =
          q.suspectDamage.find((d) => d.id === u.id && d.round === s.round)
            ?.damage ?? 0;
        return Math.max(0, Math.min(amount, 5 - taken));
      }
    }
    return amount;
  },
  damageDealt: (s, u, amount, context) => {
    const q = s.prancingPony;
    if (!q || amount <= 0) return;
    if (isSuspect(u.code)) {
      const d = q.suspectDamage.find((x) => x.id === u.id);
      if (d && d.round === s.round) d.damage += amount;
      else {
        q.suspectDamage = q.suspectDamage.filter((x) => x.id !== u.id);
        q.suspectDamage.push({ id: u.id, round: s.round, damage: amount });
      }
    }
    // Todd the Troll: excess combat damage raises the defending player's threat.
    const attacker = context.enemyId ? get(s, context.enemyId) : undefined;
    if (context.combatDamage && attacker && live(attacker, PP.todd)) {
      const excess = u.damage - stats(s, u).health;
      if (excess > 0) {
        const p = ownerOf(s, u);
        forOwner(s, p, () =>
          raiseThreat(s, Math.min(excess, amount), "encounter"),
        );
        log(
          s,
          `Todd the Troll: ${Math.min(excess, amount)} excess damage raises ${s.table ? `${seatName(s, p)}'s` : "your"} threat.`,
          "danger",
        );
      }
    }
  },
  immune: (s, u) =>
    !!s.prancingPony &&
    !u.blanked &&
    (isHideout(u.code) ||
      (isSuspect(u.code) && hideoutInVictory(s, PP.ferneyHouse))),
  shadowImmune: (s, enemy) =>
    !!s.prancingPony &&
    isSuspect(enemy.code) &&
    hideoutInVictory(s, PP.ferneyHouse),
  cannotAttach: (s, u) => !!s.prancingPony && !u.blanked && isSuspect(u.code),
  cannotOptionallyEngage: (s, u) => !!s.prancingPony && live(u, PP.ferny),
  // Staddle Hiding Hole: only the engaged player declares attackers against a Suspect.
  attackProblem: (s, enemy, ids) => {
    if (
      !s.prancingPony ||
      !isSuspect(enemy.code) ||
      !hideoutInVictory(s, PP.staddle)
    )
      return null;
    const engagedWith = engagedPlayer(s, enemy);
    return ids.some((id) => {
      const u = get(s, id);
      return !u || ownerOf(s, u) !== engagedWith;
    })
      ? "Staddle Hiding Hole: only a player engaged with a Suspect can declare attackers against it."
      : null;
  },
  engaged: (s, u, optional) => {
    if (!s.prancingPony || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === PP.outlaw && optional)
      prepend(
        s,
        fx("ppThreat", { value: 4, text: "Chetwood Outlaw", player: p }),
      );
    if (isSuspect(u.code) && hideoutInVictory(s, PP.combe))
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
  },
  // Johnny Goblin-fingers: the defending player discards a random card.
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.prancingPony || !live(enemy, PP.johnny)) return;
    prepend(s, fx("ppJohnny", { player }));
  },
  attackFinished: (s, combat) => {
    if (!s.prancingPony) return [];
    const enemy = get(s, combat.enemyId);
    if (!enemy) return [];
    const p = combat.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    // Old Orc-eyes: a shadow card with no shadow effect brings another attack.
    if (live(enemy, PP.orcEyes) && blankShadow(enemy))
      effects.push(
        fx("immediateAttack", { target: enemy.id, player: p, noShadow: true }),
      );
    // Bree-land Informant: a blank shadow lets the player look at the bottom card.
    if (live(enemy, PP.informant) && blankShadow(enemy))
      effects.push(fx("ppInformant", { target: enemy.id, player: p }));
    return effects;
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.prancingPony || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    // Wolf-pelt Jake returns to the staging area after destroying an ally.
    if (enemy && live(enemy, PP.jake) && card(u.code).type_code === "ally")
      c.returnToStaging = true;
    // Rising Body Count's shadow.
    if (c.ppBodyCount) {
      c.ppBodyCount = false;
      prepend(
        s,
        fx("ppBodyShadow", {
          target: c.enemyId,
          player: c.attackPlayer ?? activeSeat(s),
        }),
      );
    }
  },
  hostLeaves: (s, u, defeated) => {
    if (!s.prancingPony) return;
    // Hired Muscle: when the attached enemy is defeated, look at the bottom card.
    if (defeated && muscled(u))
      prepend(
        s,
        fx("ppLookBottom", { text: "Hired Muscle", player: firstPlayer(s) }),
      );
    if (
      at(s, PP.killer) &&
      isSuspect(u.code) &&
      !suspectsInPlay(s).some((x) => x.id !== u.id)
    )
      win(
        s,
        "No Suspect remains in play: the killer is brought to justice and the players win the game.",
      );
  },
  // Ramshackle Manor: a player card effect reduces threat by no more than 1.
  threatReduction: (s, amount, reason) =>
    s.prancingPony && reason === "player-card" && anyLive(s, PP.manor)
      ? Math.min(amount, 1)
      : amount,
  // Bill Ferny: the first treachery revealed each round gains doomed 1 and
  // cannot be canceled.
  revealedDoomed: (s, code) => {
    const q = s.prancingPony;
    if (
      !q ||
      card(code).type_code !== "treachery" ||
      q.billing?.round === s.round ||
      !enemiesInPlay(s).some((u) => live(u, PP.ferny))
    )
      return 0;
    q.billing = { round: s.round, code };
    log(
      s,
      `Bill Ferny: ${card(code).name} is the first treachery revealed this round; it gains doomed 1 and cannot be canceled.`,
      "danger",
    );
    return 1;
  },
  cannotCancel: (s, shadowEffect, code) => {
    const b = s.prancingPony?.billing;
    return (
      !!b &&
      !shadowEffect &&
      b.round === s.round &&
      b.code === code &&
      !!s.prancingPony?.resolving.some((u) => u.code === code)
    );
  },
  // Market Square: progress on a staging location raises the player's threat.
  locationProgressPlaced: (s, u, amount) => {
    if (
      !s.prancingPony ||
      amount <= 0 ||
      !s.staging.some((x) => x.id === u.id) ||
      !anyLive(s, PP.market)
    )
      return;
    const p = activeSeat(s);
    forOwner(s, p, () => raiseThreat(s, 1, "encounter"));
    log(
      s,
      `Market Square: ${who(s, p)} ${verb(s, "raise")} threat by 1.`,
      "danger",
    );
  },
  travelProblem: (s, u) => {
    if (!s.prancingPony || u.blanked) return null;
    if (
      u.code === PP.market &&
      playerOrder(s).some(
        (p) => !seatView(s, p).heroes.some((h) => h.resources > 0),
      )
    )
      return "Market Square: each player must spend 1 resource to travel here.";
    if (
      u.code === PP.stable &&
      playerOrder(s).some((p) => !seatView(s, p).hand.length)
    )
      return "Village Stable: each player must discard 1 random card from his hand to travel here.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.prancingPony || u.blanked) return undefined;
    const first = firstPlayer(s);
    const search = (c: string, extra: Partial<Effect> = {}) => [
      fx("ppHideoutSearch", { text: c, code: u.code, player: first, ...extra }),
    ];
    switch (u.code) {
      case PP.manor:
        return [fx("ppTravelThreat", { player: first })];
      case PP.alley:
        return [fx("ppDarkAlley", { player: first })];
      case PP.market:
        return playerOrder(s).map((player) => fx("ppMarketPay", { player }));
      case PP.warehouse:
        return [fx("ppWarehouseReveal", { player: first })];
      case PP.stable:
        return playerOrder(s).map((player) =>
          fx("ppStableDiscard", { player }),
        );
      case PP.ferneyHouse:
        return search(PP.ferny, { flag: true });
      case PP.staddle:
        return search(PP.footpad, { value: 1 });
      case PP.combe:
        return search(PP.ruffian);
      case PP.archet:
        return search(PP.informant);
      case PP.campsite:
        return search(PP.outlaw);
    }
    return undefined;
  },
  explored: (s, u, wasActive) => {
    const q = s.prancingPony;
    if (!q || !wasActive || u.blanked) return;
    const first = firstPlayer(s);
    const chain: Effect[] = [];
    if (u.code === PP.pony) chain.push(fx("ppPony", { player: first }));
    const x = printedInvestigate(u.code);
    if (x > 0 && !at(s, PP.killer))
      chain.push(
        u.code === PP.warehouse
          ? fx("ppWarehouse", { target: u.id, player: first })
          : fx("ppInvestigate", {
              value: x,
              code: u.code,
              target: u.id,
              player: first,
            }),
      );
    if (chain.length)
      prepend(s, ...chain, fx("ppInvestigateDone", { player: first }));
  },
  effect: ppEffect,
  sharedEffect: (e) =>
    [
      "ppDefeatQuest",
      "ppNextStage",
      "ppRunningOutOfTime",
      "ppShuffle",
      "ppInvestigate",
      "ppWarehouse",
      "ppWarehouseThreat",
      "ppInvestigateDone",
      "ppStable",
      "ppStableTake",
      "ppPony",
      "ppLookTop",
      "ppSurprise",
      "ppRemoveRandom",
      "ppAccuseChoice",
      "ppAccuse",
      "ppNameSuspect",
      "ppAccusation",
      "ppTreacheryDone",
      "ppEachThreat",
      "ppHideoutSearch",
      "ppTravelThreat",
      "ppDarkAlley",
      "ppWarehouseReveal",
    ].includes(e.kind),
};
