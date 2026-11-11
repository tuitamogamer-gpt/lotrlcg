import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  removeShadowCard,
  shuffle,
} from "./core";
import {
  discardAttachment,
  discardHandCard,
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
import { mainQuestUnit } from "./quest-state";
import {
  HOBBIT_BILBO,
  bagginsBilbo,
  bagginsResources,
  loseBilbo,
  spendBaggins,
} from "./hobbit-saga";
import {
  WMA as W,
  WMA_QUESTS,
  WMA_RECIPES,
  WMA_SACKS,
  WMA_TREASURES,
  wmaStageInfo,
  wmaTrait,
} from "./we-must-away-support";
export * from "./we-must-away-support";

type Combat = NonNullable<GameState["combat"]>;
const typeOf = (u: Unit | string) =>
  card(typeof u === "string" ? u : u.code).type_code;
const isTroll = (u: Unit) => typeOf(u) === "enemy" && wmaTrait(u, "Troll");
const trolls = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(isTroll);
const stagingTrolls = (s: GameState) => s.staging.filter(isTroll);
/** A printed ability of an encounter card in play is live unless blanked. */
const live = (s: GameState, code: string) =>
  [...s.staging, ...allEngaged(s), ...allActiveLocations(s)].some(
    (u) => u.code === code && !u.blanked,
  );
const stagingCount = (s: GameState, code: string) =>
  s.staging.filter((u) => u.code === code && !u.blanked).length;
const hasSack = (u: Unit) => u.attachments.some((a) => isSackCode(a.code));
const isSackCode = (code: string) => WMA_SACKS.includes(code);
const players = (s: GameState) => playerOrder(s).length;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const skip: Option = { id: "skip", label: "Decline", effects: [] };
const bilboHas = (s: GameState, code: string) =>
  !!bagginsBilbo(s)?.attachments.some((a) => a.code === code);
const caveCost = (s: GameState) => (bilboHas(s, W.purse) ? 2 : 5);
const takeShadow = (enemy: Unit, code: string) => {
  const i = Math.max(0, (enemy.revealedShadowCount ?? 1) - 1);
  const index = enemy.shadows[i] === code ? i : enemy.shadows.indexOf(code);
  if (index < 0) return false;
  removeShadowCard(enemy, index);
  return true;
};
const isGandalf = (u: Unit) => card(u.code).name === "Gandalf";
/** The Western Lands encounter set appears in two Hobbit scenarios. */
export const westernActive = (s: GameState) =>
  !!s.weMustAway || !!s.mistyMountains;
/** The resolving zone of the Hobbit scenario in play. */
export const hobbitResolving = (s: GameState): Unit[] =>
  s.weMustAway?.resolving ?? s.mistyMountains?.resolving ?? [];
const WESTERN_TREACHERIES = [W.grocer, W.campfire, W.rain];
const WESTERN_EFFECTS = [
  "wmaTreachery",
  "wmaTreacheryDone",
  "wmaThreat",
  "wmaGrocer",
  "wmaCampfire",
  "wmaCrow",
  "wmaDreary",
  "wmaLoneLands",
  "wmaRemoveResource",
  "wmaBilboResponse",
  "wmaBilboGains",
  "wmaCaveEntrance",
];
/** Hold a revealed treachery physically until its effects finish. */
export function holdTreachery(
  s: GameState,
  code: string,
  replay: boolean,
  fromReveal: boolean,
) {
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  hobbitResolving(s).push(u);
  const player = firstPlayer(s);
  prepend(
    s,
    fx("wmaTreachery", { code, source: u.id, player }),
    fx("wmaTreacheryDone", { source: u.id, player }),
  );
}
/** Western Lands When Revealed effects. */
export function westernEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!westernActive(s)) return false;
  if (code === W.crow) {
    if (fromReveal) prepend(s, fx("wmaCrow", { player: firstPlayer(s) }));
    return true;
  }
  if (!WESTERN_TREACHERIES.includes(code)) return false;
  holdTreachery(s, code, replay, fromReveal);
  return true;
}
/** Western Lands shadow effects. */
export function westernShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !westernActive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  if (code === W.crow) c.wmaCrow = (c.wmaCrow ?? 0) + 1;
  else if (code === W.grocer)
    prepend(s, fx("wmaGrocer", { player: firstPlayer(s) }));
  else if (code === W.campfire)
    prepend(s, fx("wmaThreat", { value: 2, player: p }));
  else if (code === W.rain) c.defensePenalty = (c.defensePenalty ?? 0) + 1;
  else return false;
  return true;
}
/** Western Lands "after placing progress" and explored responses. */
export function westernLocationProgress(s: GameState, u: Unit, amount: number) {
  if (!westernActive(s) || amount <= 0 || u.blanked) return;
  if (u.code === W.drearyHills)
    prepend(s, ...playerOrder(s).map((player) => fx("wmaDreary", { player })));
  else if (u.code === W.loneLands)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("wmaLoneLands", { player })),
    );
}
export function westernExplored(s: GameState, u: Unit) {
  if (!westernActive(s) || u.blanked) return;
  if (u.code === W.drearyHills || u.code === W.loneLands)
    prepend(
      s,
      fx("wmaBilboResponse", { code: u.code, player: firstPlayer(s) }),
    );
}
export const westernRoundEnd = (s: GameState): Effect[] =>
  westernActive(s)
    ? s.staging
        .filter((u) => u.code === W.caveEntrance && !u.blanked)
        .map(() =>
          fx("wmaCaveEntrance", { value: players(s), player: firstPlayer(s) }),
        )
    : [];
/** A Suspicious Crow's shadow returns it to the deck after damage. */
export function westernAttackStarted(s: GameState) {
  if (!s.combat) return;
  s.combat.wmaCrow = 0;
  s.combat.wmaDamaged = false;
}
export function westernDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  ctx: { combatDamage?: boolean; enemyId?: string },
) {
  const c = s.combat;
  if (!c || !ctx.combatDamage || ctx.enemyId !== c.enemyId || amount <= 0)
    return;
  if (["hero", "ally"].includes(typeOf(u))) c.wmaDamaged = true;
}
export function westernAttackFinished(s: GameState, c: Combat) {
  if (!westernActive(s) || !c.wmaCrow || !c.wmaDamaged) return;
  const enemy = get(s, c.enemyId);
  for (let i = 0; i < c.wmaCrow; i++) {
    if (enemy && takeShadow(enemy, W.crow)) s.encounterDeck.push(W.crow);
    else {
      const at = s.encounterDiscard.lastIndexOf(W.crow);
      if (at < 0) continue;
      s.encounterDiscard.splice(at, 1);
      s.encounterDeck.push(W.crow);
    }
    shuffle(s, s.encounterDeck);
    log(
      s,
      "A Suspicious Crow is shuffled back into the encounter deck.",
      "danger",
    );
  }
  c.wmaCrow = 0;
}
/** The characters a Sack card targets; ties are chosen by the first player. */
export function sackTargets(s: GameState, code: string) {
  const open = allCharacters(s).filter(
    (u) => ["hero", "ally"].includes(typeOf(u)) && !hasSack(u) && !isGandalf(u),
  );
  const printed = (u: Unit) => card(u.code);
  const value: Record<string, (u: Unit) => number> = {
    [W.deep]: (u) => printed(u).willpower ?? 0,
    [W.foul]: (u) => u.attachments.length,
    [W.large]: (u) => printed(u).health ?? 0,
    [W.smelly]: (u) => Number(printed(u).cost ?? 0),
    [W.strong]: (u) => printed(u).attack ?? 0,
    [W.tough]: (u) => printed(u).defense ?? 0,
    [W.worn]: (u) => u.resources,
  };
  const named =
    code === W.smelly
      ? open.filter((u) => typeOf(u) === "ally")
      : code === W.worn
        ? open.filter((u) => typeOf(u) === "hero")
        : open;
  // A Sack naming an ineligible target lets the first player choose any
  // eligible character instead.
  if (!named.length) return open;
  const best = Math.max(...named.map(value[code]));
  return named.filter((u) => value[code](u) === best);
}

export function setupWeMustAway(s: GameState) {
  const r = WMA_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.weMustAway = {
    currentQuest: W.party,
    advancing: false,
    sackDeck: shuffle(s, section("sharedEncounterDeck2")),
    drawn: [],
    setAside: section("sharedSetAside").map((code) => make(s, code)),
    resolving: [],
    treasures: [],
  };
  log(
    s,
    "An Unexpected Party: the seven Sacks form the sack deck; Bert, Tom, William and Troll Cave are set aside.",
    "chapter",
  );
  enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
}
function forcedAdvance(s: GameState) {
  const q = s.weMustAway;
  return (
    !!q &&
    s.stage === 2 &&
    stageLive(s) &&
    (!trolls(s).length || !s.encounterDeck.length)
  );
}
function startAdvance(s: GameState) {
  const q = s.weMustAway!;
  q.advancing = true;
  prepend(s, fx("wmaDefeatQuest", { player: firstPlayer(s) }));
}
function advance(s: GameState) {
  const q = s.weMustAway;
  if (!q) return false;
  if (q.advancing || s.stageRevealing || s.status !== "playing") return true;
  if (forcedAdvance(s)) startAdvance(s);
  else if (
    s.stage === 1 &&
    !s.choice &&
    !s.queue.length &&
    s.progress >= (wmaStageInfo(s)?.quest ?? 0)
  )
    startAdvance(s);
  return true;
}
function check(s: GameState) {
  const q = s.weMustAway;
  if (!q || q.advancing || s.status !== "playing") return;
  // Roast Mutton's Forced effect: no Trolls left in play or an empty
  // encounter deck advances the quest before the deck could be refilled.
  if (forcedAdvance(s)) startAdvance(s);
  if (s.encounterDiscard.some((c) => c === W.key || c === W.purse)) {
    for (const code of [W.key, W.purse]) {
      const i = s.encounterDiscard.indexOf(code);
      if (i < 0) continue;
      s.encounterDiscard.splice(i, 1);
      objectiveToStaging(s, code);
    }
  }
  const loose = s.staging.some((u) => u.code === W.key || u.code === W.purse);
  if (
    loose &&
    trolls(s).length &&
    !s.queue.some((e) => e.kind === "wmaAttachObjectives")
  )
    prepend(s, fx("wmaAttachObjectives", { player: firstPlayer(s) }));
}
/** "If discarded, add it to the staging area." */
function objectiveToStaging(s: GameState, code: string) {
  s.staging.push(make(s, code));
  log(s, `${card(code).name} is added to the staging area.`);
}
function travelProblem(s: GameState, u: Unit) {
  if (!s.weMustAway || u.code !== W.cave || u.blanked) return null;
  if (!bilboHas(s, W.key))
    return "Players cannot travel to Troll Cave unless Bilbo Baggins has the Troll Key attached.";
  const cost = caveCost(s);
  if (bagginsResources(s) < cost)
    return `The first player must spend ${cost} Baggins resources from Bilbo Baggins to travel to Troll Cave.`;
  return null;
}
function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.weMustAway;
  if (!q) return false;
  if (westernEncounter(s, code, replay, fromReveal)) return true;
  if (code === W.key || code === W.purse) {
    prepend(s, fx("wmaAttachObjectives", { player: firstPlayer(s) }));
    return true;
  }
  if (![W.hungry, W.lots, W.roast, W.pickle].includes(code)) return false;
  holdTreachery(s, code, replay, fromReveal);
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.weMustAway) return false;
  if (westernShadow(s, code)) return true;
  const first = firstPlayer(s),
    enemy = get(s, c.enemyId);
  if (code === W.pickle) {
    if (enemy && takeShadow(enemy, code)) {
      s.encounterDeck.push(code);
      shuffle(s, s.encounterDeck);
      log(s, "A Nice Pickle is shuffled into the encounter deck.", "danger");
    }
  } else if (code === W.hobbitLands) {
    const top = s.encounterDiscard.pop();
    if (top) {
      s.encounterDeck.unshift(top);
      log(
        s,
        `Hobbit-lands: ${card(top).name} returns to the top of the encounter deck.`,
        "danger",
      );
    }
  } else if (code === W.hungry) {
    if (allCharacters(s).some(hasSack))
      prepend(
        s,
        fx("wmaBagginsCancel", {
          code,
          value: 2,
          player: first,
          effects: [fx("wmaHungryShadow", { player: first })],
        }),
      );
  } else if (code === W.lots) {
    if (enemy && isTroll(enemy))
      prepend(
        s,
        fx("wmaBagginsCancel", {
          code,
          value: 1,
          player: first,
          effects: [fx("wmaSack", { value: 1, player: first })],
        }),
      );
  } else if (code === W.roast) prepend(s, fx("wmaFindCamp", { player: first }));
  else return false;
  return true;
}
function trollReturnEffects(s: GameState) {
  if (!s.weMustAway) return;
  const engaged = allEngaged(s).filter((u) => isTroll(u) && !u.blanked);
  prepend(
    s,
    ...engaged.map((u) =>
      fx("wmaTrollReturn", { target: u.id, player: ownerOf(s, u) }),
    ),
  );
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
function locationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!s.weMustAway || amount <= 0 || u.blanked) return;
  westernLocationProgress(s, u, amount);
  if (u.code === W.hobbitLands)
    prepend(s, fx("wmaHobbitLands", { player: firstPlayer(s) }));
}
/** Remove the Sack from a character and shuffle it into the sack deck. */
function removeSack(s: GameState, u: Unit) {
  const q = s.weMustAway!;
  const sack = u.attachments.find((a) => isSackCode(a.code));
  if (!sack) return;
  u.attachments = u.attachments.filter((a) => a.id !== sack.id);
  q.sackDeck.push(sack.code);
  shuffle(s, q.sackDeck);
  log(
    s,
    `${card(sack.code).name} is removed from ${name(u)} and shuffled into the sack deck.`,
    "good",
  );
}
function attachSack(s: GameState, u: Unit, code: string) {
  u.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  log(s, `${name(u)} is stuffed into ${card(code).name}.`, "danger");
}
function attachmentLeaves(
  s: GameState,
  host: Unit,
  a: Attachment,
  leaving = false,
) {
  const q = s.weMustAway;
  if (!q) return false;
  if (isSackCode(a.code)) {
    q.sackDeck.push(a.code);
    shuffle(s, q.sackDeck);
    log(s, `${card(a.code).name} is shuffled into the sack deck.`);
    return true;
  }
  if (a.code === W.purse && leaving && isTroll(host)) {
    // Response: after the attached Troll is destroyed the first player may
    // spend 1 Baggins resource to claim the Purse.
    const purse = make(s, W.purse);
    q.resolving.push(purse);
    prepend(
      s,
      fx("wmaPurseClaim", { source: purse.id, player: firstPlayer(s) }),
    );
    return true;
  }
  if (a.code === W.key || a.code === W.purse) {
    objectiveToStaging(s, a.code);
    return true;
  }
  return false;
}
function campAbilityProblem(s: GameState, u: Unit) {
  if (u.code !== HOBBIT_BILBO) return "Only Bilbo Baggins has this action.";
  if (!live(s, W.camp)) return "Troll Camp is not in play.";
  if (u.exhausted) return "Bilbo Baggins is exhausted.";
  if (u.resources < 1)
    return "Bilbo Baggins needs 1 Baggins resource in his pool.";
  if (!allCharacters(s).some(hasSack))
    return "No character has a Sack card attached.";
  return null;
}
/** Effects of the Western Lands and shared treachery handling, in either scenario. */
function westernEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s),
    first = firstPlayer(s);
  switch (e.kind) {
    case "wmaTreachery": {
      const held = hobbitResolving(s).find((x) => x.id === e.source);
      if (!held) break;
      const code = held.code;
      if (code === W.hungry) {
        const options = stagingTrolls(s);
        if (options.length)
          choose(
            s,
            "Hungry Troll · The first player engages a Troll",
            options.map((t) =>
              option(t, [fx("wmaEngage", { target: t.id, player: first })]),
            ),
          );
      } else if (code === W.lots) {
        if (stagingTrolls(s).length)
          prepend(s, fx("wmaSack", { value: 1, player: first }));
      } else if (code === W.grocer)
        prepend(s, fx("wmaGrocer", { player: first }));
      else if (code === W.campfire)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("wmaCampfire", { player })),
        );
      else if (code === W.roast) {
        const value = stagingTrolls(s).length ? 2 : 1;
        prepend(
          s,
          ...allCharacters(s)
            .filter((u) => typeOf(u) === "ally")
            .map((u) =>
              fx("damage", { target: u.id, value, player: ownerOf(s, u) }),
            ),
        );
      } else if (code === W.rain) {
        let discarded = 0;
        for (const u of [
          ...allCharacters(s),
          ...s.staging,
          ...allEngaged(s),
          ...allActiveLocations(s),
        ])
          for (const a of [...u.attachments])
            if (typeOf(a.code) !== "objective" && !card(a.code).treasure) {
              discardAttachment(s, u, a);
              discarded++;
            }
        log(
          s,
          `Wind-whipped Rain discards ${discarded} attachment${discarded === 1 ? "" : "s"}.`,
          "danger",
        );
      } else if (code === W.pickle) {
        const n = 2 * players(s);
        let moved = 0;
        while (moved < n && s.encounterDiscard.length) {
          s.encounterDeck.push(s.encounterDiscard.pop()!);
          moved++;
        }
        if (moved)
          log(
            s,
            `A Nice Pickle places ${moved} card${moved === 1 ? "" : "s"} from the encounter discard pile on the bottom of the encounter deck.`,
            "danger",
          );
      }
      break;
    }
    case "wmaTreacheryDone": {
      const i = hobbitResolving(s).findIndex((x) => x.id === e.source);
      if (i >= 0)
        s.encounterDiscard.push(hobbitResolving(s).splice(i, 1)[0].code);
      break;
    }
    case "wmaThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "wmaGrocer": {
      const bilbo = bagginsBilbo(s);
      if (bilbo && bilbo.resources) {
        log(
          s,
          `More Like a Grocer discards ${bilbo.resources} Baggins resource${bilbo.resources === 1 ? "" : "s"}.`,
          "danger",
        );
        bilbo.resources = 0;
      }
      break;
    }
    case "wmaCampfire":
      choose(
        s,
        "No Campfire · Raise your threat by 4 or reveal an encounter card",
        [
          {
            id: "threat",
            label: "Raise your threat by 4",
            effects: [fx("wmaThreat", { value: 4, player: p })],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
      );
      break;
    case "wmaCrow": {
      const top = s.encounterDiscard.pop();
      if (!top) break;
      log(
        s,
        `A Suspicious Crow reveals ${card(top).name} from the encounter discard pile.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", { code: top, revealOrigin: "discard", player: p }),
      );
      break;
    }
    case "wmaDreary":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const pick = s.hand[Math.floor(random(s) * s.hand.length)];
        discardHandCard(s, pick.id, { encounterEffect: true });
        log(s, `Dreary Hills: ${name(pick)} is discarded at random.`, "danger");
      });
      break;
    case "wmaLoneLands": {
      const heroes = seatView(s, p).heroes.filter((h) => h.resources > 0);
      if (heroes.length === 1)
        prepend(
          s,
          fx("wmaRemoveResource", { target: heroes[0].id, player: p }),
        );
      else if (heroes.length > 1)
        choose(
          s,
          "Lone-Lands · Remove 1 resource from one of your heroes",
          heroes.map((h) =>
            option(h, [fx("wmaRemoveResource", { target: h.id, player: p })]),
          ),
        );
      break;
    }
    case "wmaRemoveResource": {
      const h = get(s, e.target);
      if (h && h.resources > 0) {
        h.resources--;
        log(s, `Lone-Lands removes 1 resource from ${name(h)}.`, "danger");
      }
      break;
    }
    case "wmaBilboResponse": {
      if (!bagginsBilbo(s)) break;
      choose(s, `${card(e.code!).name} · Bilbo Baggins gains 1 resource?`, [
        {
          id: "gain",
          label: "Bilbo Baggins gains 1 resource",
          effects: [fx("wmaBilboGains", { player: first })],
        },
        skip,
      ]);
      break;
    }
    case "wmaBilboGains": {
      const bilbo = bagginsBilbo(s);
      if (bilbo) {
        bilbo.resources++;
        log(s, "Bilbo Baggins gains 1 resource.", "good");
      }
      break;
    }
    case "wmaCaveEntrance": {
      const n = e.value ?? 0;
      let moved = 0;
      while (moved < n && s.encounterDiscard.length) {
        s.encounterDeck.push(s.encounterDiscard.pop()!);
        moved++;
      }
      if (moved)
        log(
          s,
          `Cave Entrance places ${moved} card${moved === 1 ? "" : "s"} from the encounter discard pile on the bottom of the encounter deck.`,
          "danger",
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
export function wmaEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("wma")) return false;
  if (WESTERN_EFFECTS.includes(e.kind) && westernActive(s))
    return westernEffect(s, e);
  const q = s.weMustAway;
  if (!q) return true;
  const p = e.player ?? activeSeat(s),
    first = firstPlayer(s);
  switch (e.kind) {
    case "wmaDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("wmaNextStage", { player: first }));
      break;
    }
    case "wmaNextStage": {
      q.advancing = false;
      s.stage++;
      q.currentQuest = WMA_QUESTS[s.stage - 1].code;
      s.progress = 0;
      s.stageRevealing = true;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      prepend(
        s,
        fx(s.stage === 2 ? "wmaStageTwo" : "wmaStageThree", { player: first }),
      );
      break;
    }
    case "wmaStageTwo": {
      for (const u of q.setAside.splice(0)) {
        s.staging.push(u);
        if (isTroll(u)) enemyAddedToStaging(s, u);
      }
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      s.stageRevealing = false;
      log(
        s,
        "Roast Mutton: Bert, Tom, William and Troll Cave enter the staging area, and the encounter discard pile is shuffled into the encounter deck.",
        "danger",
      );
      prepend(s, fx("wmaAttachObjectives", { player: first }));
      break;
    }
    case "wmaStageThree": {
      // Remove all Troll enemies and Sack cards from the game.
      const removed = (s.removedEncounter ??= []);
      for (const t of trolls(s)) {
        s.staging = s.staging.filter((x) => x.id !== t.id);
        forOwner(s, ownerOf(s, t), () => {
          s.engaged = s.engaged.filter((x) => x.id !== t.id);
        });
        s.encounterDiscard.push(...t.shadows);
        t.shadows = [];
        for (const a of t.attachments)
          if (a.code === W.key || a.code === W.purse)
            s.staging.push(make(s, a.code));
          else if (card(a.code).sphere_code === "encounter")
            s.encounterDiscard.push(a.code);
          else seatView(s, a.owner ?? first).discard.push(a.code);
        removed.push(t.code);
      }
      for (const u of allCharacters(s)) {
        const sacks = u.attachments.filter((a) => isSackCode(a.code));
        u.attachments = u.attachments.filter((a) => !isSackCode(a.code));
        removed.push(...sacks.map((a) => a.code));
      }
      removed.push(...q.sackDeck.splice(0), ...q.drawn.splice(0));
      if (s.victoryCards?.includes(W.cave)) q.treasures = [...WMA_TREASURES];
      s.stageRevealing = false;
      win(s);
      s.reason = q.treasures.length
        ? "Dawn turns the Trolls to stone. The company has discovered Sting, Glamdring and Orcrist in the Troll Cave."
        : "Dawn turns the Trolls to stone, and the company escapes the Trollshaws.";
      log(s, s.reason, "good");
      break;
    }
    case "wmaEngage": {
      const t = get(s, e.target);
      if (t && s.staging.some((x) => x.id === t.id))
        forOwner(s, first, () => engage(s, t));
      break;
    }
    case "wmaSack": {
      const n = Math.min(e.value ?? 1, q.sackDeck.length);
      if (n <= 0) {
        log(s, "The sack deck is empty; the Sack effect is ignored.");
        break;
      }
      q.drawn.push(...q.sackDeck.splice(0, n));
      prepend(s, fx("wmaSackNext", { player: first }));
      break;
    }
    case "wmaSackNext": {
      const code = q.drawn[0];
      if (!code) break;
      const targets = sackTargets(s, code);
      if (!targets.length) {
        q.sackDeck.push(q.drawn.shift()!);
        shuffle(s, q.sackDeck);
        log(
          s,
          `${card(code).name} has no eligible character and is shuffled back into the sack deck.`,
        );
        prepend(s, fx("wmaSackNext", { player: first }));
      } else if (targets.length === 1) {
        attachSack(s, targets[0], q.drawn.shift()!);
        prepend(s, fx("wmaSackNext", { player: first }));
      } else
        choose(
          s,
          `${card(code).name} · Choose the character it sacks`,
          targets.map((u) =>
            option(u, [
              fx("wmaSackTo", { code, target: u.id, player: first }),
              fx("wmaSackNext", { player: first }),
            ]),
          ),
          card(code).text?.split("\n")[0],
        );
      break;
    }
    case "wmaSackTo": {
      const u = get(s, e.target);
      if (q.drawn[0] !== e.code) break;
      if (u && sackTargets(s, e.code!).some((x) => x.id === u.id))
        attachSack(s, u, q.drawn.shift()!);
      break;
    }
    case "wmaAttachObjectives": {
      const loose = s.staging.find(
        (u) => u.code === W.key || u.code === W.purse,
      );
      const hosts = trolls(s);
      if (!loose || !hosts.length) break;
      const rest = fx("wmaAttachObjectives", { player: first });
      if (hosts.length === 1)
        prepend(
          s,
          fx("wmaAttachTo", {
            source: loose.id,
            target: hosts[0].id,
            player: first,
          }),
          rest,
        );
      else
        choose(
          s,
          `${name(loose)} · Attach it to a Troll`,
          hosts.map((t) =>
            option(t, [
              fx("wmaAttachTo", {
                source: loose.id,
                target: t.id,
                player: first,
              }),
              rest,
            ]),
          ),
          "An unattached Troll Key or Troll Purse in the staging area attaches to a Troll enemy.",
        );
      break;
    }
    case "wmaAttachTo": {
      const obj = s.staging.find((u) => u.id === e.source);
      const troll = get(s, e.target);
      if (!obj || !troll || !trolls(s).some((t) => t.id === troll.id)) break;
      s.staging = s.staging.filter((u) => u.id !== obj.id);
      troll.attachments.push({
        id: `a${s.nextId++}`,
        code: obj.code,
        exhausted: false,
      });
      log(s, `${name(obj)} is attached to ${name(troll)}.`);
      break;
    }
    case "wmaKeyClaim": {
      const troll = get(s, e.target);
      const bilbo = bagginsBilbo(s);
      if (
        !troll ||
        !bilbo ||
        bilbo.exhausted ||
        !troll.attachments.some((a) => a.code === W.key)
      )
        break;
      choose(
        s,
        "Troll Key · Exhaust Bilbo Baggins to claim it",
        [
          {
            id: "claim",
            label: "Exhaust Bilbo Baggins and attach Troll Key to him",
            effects: [fx("wmaClaimKey", { target: troll.id, player: first })],
          },
          skip,
        ],
        "Response: after the attached Troll takes damage as the result of an attack.",
      );
      break;
    }
    case "wmaClaimKey": {
      const troll = get(s, e.target);
      const bilbo = bagginsBilbo(s);
      const key = troll?.attachments.find((a) => a.code === W.key);
      if (!troll || !bilbo || !key || !exhaustCharacter(s, bilbo)) break;
      troll.attachments = troll.attachments.filter((a) => a.id !== key.id);
      bilbo.attachments.push({
        id: key.id,
        code: key.code,
        exhausted: false,
      });
      log(s, "Bilbo Baggins claims the Troll Key.", "good");
      break;
    }
    case "wmaPurseClaim": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!held) break;
      const bilbo = bagginsBilbo(s);
      const settle = fx("wmaPurseSettle", { source: held.id, player: first });
      if (!bilbo || bilbo.resources < 1) {
        prepend(s, settle);
        break;
      }
      choose(
        s,
        "Troll Purse · Spend 1 Baggins resource to claim it",
        [
          {
            id: "claim",
            label: "Spend 1 Baggins resource and attach Troll Purse to Bilbo",
            effects: [
              fx("wmaPurseSettle", {
                source: held.id,
                flag: true,
                player: first,
              }),
            ],
          },
          { ...skip, effects: [settle] },
        ],
        "Response: after the attached Troll enemy is destroyed. Otherwise the discarded Purse is added to the staging area.",
      );
      break;
    }
    case "wmaPurseSettle": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) break;
      const [purse] = q.resolving.splice(i, 1);
      const bilbo = bagginsBilbo(s);
      if (e.flag && bilbo && spendBaggins(s, 1)) {
        bilbo.attachments.push({
          id: `a${s.nextId++}`,
          code: purse.code,
          exhausted: false,
        });
        log(s, "Bilbo Baggins claims the Troll Purse.", "good");
      } else {
        s.staging.push(purse);
        log(s, "Troll Purse is added to the staging area.");
        prepend(s, fx("wmaAttachObjectives", { player: first }));
      }
      break;
    }
    case "wmaTrollReturn": {
      const t = get(s, e.target);
      if (!t || !allEngaged(s).some((x) => x.id === t.id)) break;
      choose(
        s,
        `${name(t)} · Raise your threat by 1 or it returns to the staging area`,
        [
          {
            id: "threat",
            label: "Raise your threat by 1 to keep it engaged",
            effects: [fx("wmaThreat", { value: 1, player: p })],
          },
          {
            id: "return",
            label: `${name(t)} returns to the staging area`,
            effects: [fx("wmaReturn", { target: t.id, player: p })],
          },
        ],
        "Forced: at the end of the combat phase each Troll returns to the staging area unless the engaged player raises his threat by 1.",
      );
      break;
    }
    case "wmaReturn": {
      const t = get(s, e.target);
      if (!t || !allEngaged(s).some((x) => x.id === t.id)) break;
      returnToStaging(s, t);
      log(s, `${name(t)} returns to the staging area.`, "danger");
      break;
    }
    case "wmaFindCamp": {
      const i = s.encounterDeck.indexOf(W.camp);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        s.staging.push(make(s, W.camp));
        log(s, "Troll Camp is added to the staging area.", "danger");
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "wmaBagginsCancel": {
      const cost = e.value ?? 1;
      if (bagginsResources(s) < cost) {
        prepend(s, ...(e.effects ?? []));
        break;
      }
      choose(
        s,
        `${card(e.code!).name} · Spend ${cost} Baggins resource${cost === 1 ? "" : "s"} to cancel the shadow effect?`,
        [
          {
            id: "cancel",
            label: `Spend ${cost} Baggins resource${cost === 1 ? "" : "s"} from Bilbo Baggins`,
            effects: [fx("wmaSpendBaggins", { value: cost, player: first })],
          },
          {
            id: "resolve",
            label: "Let the shadow effect resolve",
            effects: e.effects ?? [],
          },
        ],
        card(e.code!).shadow,
      );
      break;
    }
    case "wmaSpendBaggins":
      if (spendBaggins(s, e.value ?? 0))
        log(s, "Bilbo Baggins cancels the shadow effect.", "good");
      break;
    case "wmaHungryShadow":
      prepend(
        s,
        ...allCharacters(s)
          .filter(hasSack)
          .map((u) =>
            fx("damage", { target: u.id, value: 4, player: ownerOf(s, u) }),
          ),
      );
      break;
    case "wmaHobbitLands":
      choose(s, "Hobbit-lands · The first player draws 1 card?", [
        {
          id: "draw",
          label: "Draw 1 card",
          effects: [fx("draw", { value: 1, player: first })],
        },
        skip,
      ]);
      break;
    case "wmaCaveCost":
      if (!spendBaggins(s, e.value ?? 0))
        log(s, "Bilbo Baggins cannot pay for Troll Cave.", "danger");
      break;
    case "wmaCampSack": {
      const u = get(s, e.target);
      if (u && hasSack(u)) removeSack(s, u);
      break;
    }
    case "wmaMuttonDiscard": {
      const n = e.value ?? 0;
      const discarded = s.encounterDeck.splice(0, n);
      s.encounterDiscard.push(...discarded);
      if (discarded.length)
        log(
          s,
          `Roast Mutton discards ${discarded.length} card${discarded.length === 1 ? "" : "s"} from the encounter deck instead of placing progress.`,
        );
      if (!q.advancing && forcedAdvance(s)) startAdvance(s);
      break;
    }
    default:
      return false;
  }
  return true;
}
export const WMA_HOOKS: Batch4ScenarioHooks = {
  setup: setupWeMustAway,
  advance,
  check,
  stageInfo: wmaStageInfo,
  travelProblem,
  travelEffects: (s, u) =>
    s.weMustAway && u.code === W.cave
      ? [fx("wmaCaveCost", { value: caveCost(s), player: firstPlayer(s) })]
      : undefined,
  immune: (s, u) => !!s.weMustAway && u.code === W.cave && !u.blanked,
  threatBonus: (s, u) =>
    isTroll(u) ? stagingCount(s, W.camp) * players(s) : 0,
  cannotAttach: (s, u, code) =>
    isTroll(u) && live(s, W.bert) && card(code).sphere_code !== "encounter",
  attackProblem: (s, enemy, ids) =>
    isTroll(enemy) && live(s, W.tom) && ids.length > 1
      ? "Tom: Troll enemies can only be attacked by one character at a time."
      : null,
  damageAmount: (s, u, amount) =>
    isTroll(u) && live(s, W.william) && s.staging.some((x) => x.id === u.id)
      ? 0
      : amount,
  cannotReady: (_s, u) => hasSack(u),
  printedDoomed: (_s, code) => (code === W.lots ? 0 : undefined),
  revealedDoomed: (s, code) =>
    code === W.lots && !stagingTrolls(s).length ? 2 : 0,
  revealedSurge: (s, code) => code === W.hungry && !stagingTrolls(s).length,
  // The deck may empty during a reveal; advance before another reveal could
  // refill it, even when a guided pause defers the framework check.
  revealed: (s) => {
    if (s.weMustAway && !s.weMustAway.advancing && forcedAdvance(s))
      startAdvance(s);
  },
  engaged: (s, u) => {
    if (!s.weMustAway || !isTroll(u) || u.blanked) return;
    const n =
      u.code === W.william ? 2 : u.code === W.bert || u.code === W.tom ? 1 : 0;
    if (n) prepend(s, fx("wmaSack", { value: n, player: firstPlayer(s) }));
  },
  combatEnd: trollReturnEffects,
  progress: (s, amount, quest) => {
    if (
      !s.weMustAway ||
      s.stage !== 2 ||
      s.stageRevealing ||
      quest.id !== mainQuestUnit(s)?.id ||
      amount <= 0
    )
      return amount;
    prepend(
      s,
      fx("wmaMuttonDiscard", { value: amount, player: firstPlayer(s) }),
    );
    return 0;
  },
  locationProgressPlaced,
  explored: (s, u) => westernExplored(s, u),
  attachmentLeaves,
  playerAttackResolved: (s, enemy, _ids, amount) => {
    if (
      !s.weMustAway ||
      amount <= 0 ||
      !get(s, enemy.id) ||
      !enemy.attachments.some((a) => a.code === W.key) ||
      !bagginsBilbo(s) ||
      bagginsBilbo(s)!.exhausted
    )
      return;
    prepend(s, fx("wmaKeyClaim", { target: enemy.id, player: firstPlayer(s) }));
  },
  enemyAttackStarted: (s) => westernAttackStarted(s),
  damageDealt: (s, u, amount, ctx) => westernDamageDealt(s, u, amount, ctx),
  attackFinished: (s, c: Combat) => {
    westernAttackFinished(s, c);
    return [];
  },
  roundEnd: (s) => (s.weMustAway ? westernRoundEnd(s) : []),
  characterLeft: (s, u) => {
    if (u.code === HOBBIT_BILBO) loseBilbo(s);
  },
  playerEliminating: (s, player) => {
    const bilbo = bagginsBilbo(s);
    if (bilbo && ownerOf(s, bilbo) === player) loseBilbo(s);
  },
  abilityLabel: (code) =>
    code === HOBBIT_BILBO ? "Remove a Sack (Troll Camp)" : undefined,
  abilityProblem: (s, u) => campAbilityProblem(s, u),
  abilitySackExempt: (s, u) => u.code === HOBBIT_BILBO && live(s, W.camp),
  ability: (s, u) => {
    if (u.code !== HOBBIT_BILBO || campAbilityProblem(s, u)) return false;
    exhaustCharacter(s, u);
    spendBaggins(s, 1);
    const sacked = allCharacters(s).filter(hasSack);
    choose(
      s,
      "Troll Camp · Remove 1 Sack card from a character",
      sacked.map((x) =>
        option(x, [
          fx("wmaCampSack", { target: x.id, player: firstPlayer(s) }),
        ]),
      ),
    );
    return true;
  },
  encounter,
  shadow,
  effect: wmaEffect,
  sharedEffect: (e) =>
    [
      "wmaDefeatQuest",
      "wmaNextStage",
      "wmaStageTwo",
      "wmaStageThree",
      "wmaTreachery",
      "wmaTreacheryDone",
      "wmaSack",
      "wmaSackNext",
      "wmaSackTo",
      "wmaAttachObjectives",
      "wmaAttachTo",
      "wmaKeyClaim",
      "wmaClaimKey",
      "wmaPurseClaim",
      "wmaPurseSettle",
      "wmaEngage",
      "wmaCrow",
      "wmaFindCamp",
      "wmaBagginsCancel",
      "wmaSpendBaggins",
      "wmaHungryShadow",
      "wmaGrocer",
      "wmaHobbitLands",
      "wmaBilboResponse",
      "wmaBilboGains",
      "wmaCaveCost",
      "wmaCampSack",
      "wmaCaveEntrance",
      "wmaMuttonDiscard",
    ].includes(e.kind),
};
