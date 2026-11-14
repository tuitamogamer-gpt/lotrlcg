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
  shuffle,
  stagingThreat,
  takePlayerDeck,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  discardHandCard,
  destroy,
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
import { deckCardInserted } from "./physical-player-card";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  needsTarget,
  playCardFromEffect,
  canTravel,
} from "./actions";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { lotrSagaCheck, ringBearer } from "./lotr-saga";
import {
  RING_SOUTH_RECIPES,
  RS,
  RS_DOORS_DAMAGE,
  RS_WATCHER_DAMAGE,
  isRsWarg,
  ringSouthStageInfo,
} from "./ring-south-support";
export * from "./ring-south-support";

const TREACHERIES: readonly string[] = [
  RS.crows,
  RS.snow,
  RS.cold,
  RS.storm,
  RS.lust,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const isEnemyCard = (code: string) => card(code).type_code === "enemy";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(l, code));
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const lusted = (u: Unit) => u.attachments.some((a) => a.code === RS.lust);
const snowed = (u: Unit) => u.attachments.some((a) => a.code === RS.snow);
const doorsUnit = (s: GameState) =>
  [...allActiveLocations(s), ...s.staging].find((u) => u.code === RS.doors);
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** "Make X the active location": a previous active location returns to the staging area. */
function makeActive(s: GameState, u: Unit) {
  const old = allActiveLocations(s).filter((l) => l.id !== u.id);
  s.staging = s.staging.filter((l) => l.id !== u.id);
  s.staging.push(...old);
  s.activeLocation = u;
  s.extraActiveLocations = [];
  return old;
}
/** Place damage tokens on a location. */
function damageLocation(s: GameState, u: Unit, amount: number, why: string) {
  if (amount <= 0) return;
  u.damage += amount;
  log(
    s,
    `${why}: ${amount} damage ${amount === 1 ? "is" : "are"} placed on ${name(u)} (${u.damage}).`,
    "danger",
  );
}
/** Stage 2B, 3B and 4B: the players must travel to a location, if able. */
const mustTravelStage = (s: GameState) =>
  !!s.ringSouth && s.stage >= 2 && stageLive(s);

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupRingSouth(s: GameState) {
  const r = RING_SOUTH_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.ringSouth = {
    currentQuest: RS.council,
    advancing: false,
    // Stage 1A sets these aside; the recipe stages Lust for the Ring and
    // makes Redhorn Pass active for convenience.
    setAside: [
      ...section("sharedStagingArea"),
      ...section("sharedActiveLocation"),
      ...section("sharedSetAside"),
    ],
    resolving: [],
    council: [],
    underWatcher: null,
    lustZero: [],
    snow: [],
    engagedRound: 0,
    engagedIds: [],
  };
  log(
    s,
    "The Council of Elrond: Lust for the Ring, Redhorn Pass, Doors of Durin and Watcher in the Water are set aside, out of play.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.ringSouth;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = ringSouthStageInfo(s)?.quest ?? 0;
  // Stage 1 advances at the end of the planning phase, stage 4 when Doors of
  // Durin is explored.
  if (goal <= 0 || s.progress < goal || ![2, 3].includes(s.stage)) return true;
  q.advancing = true;
  prepend(s, fx("rgsDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
function check(s: GameState) {
  const q = s.ringSouth;
  if (!q || s.status !== "playing") return;
  // The Ring-bearer facedown under the Watcher stays in play.
  if (!q.underWatcher) lotrSagaCheck(s);
  const doors = doorsUnit(s);
  if (doors && !doors.blanked && doors.damage >= RS_DOORS_DAMAGE)
    lose(
      s,
      "There are 9 damage tokens on Doors of Durin. The players lose the game.",
    );
}

// ---------------------------------------------------------------------------
// The Council of Elrond.

/** A faceup Council card its owner can play now, at no cost. */
function councilPlayable(s: GameState, owner: number, u: Unit) {
  let ok = false;
  forOwner(s, owner, () => {
    ok =
      !effectCardPlayProblem(s, u, { putIntoPlay: false }) &&
      (!needsTarget(u) || effectCardPlayTargets(s, u).length > 0);
  });
  return ok;
}
function councilOptions(
  s: GameState,
  kind: string,
  filter: (owner: number, u: Unit) => boolean = () => true,
): Option[] {
  const q = s.ringSouth!;
  return q.council
    .filter((c) => filter(c.owner, c.unit))
    .map((c) => ({
      id: c.unit.id,
      code: c.unit.code,
      label: `${card(c.unit.code).name}${s.table ? ` · ${seatName(s, c.owner)}` : ""}`,
      effects: [fx(kind, { target: c.unit.id, player: firstPlayer(s) })],
    }));
}
function takeCouncil(s: GameState, id: string | undefined) {
  const q = s.ringSouth!;
  const i = q.council.findIndex((c) => c.unit.id === id);
  return i < 0 ? undefined : q.council.splice(i, 1)[0];
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.ringSouth;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === RS.crebain) {
    if (!fromReveal) return true;
    const target = [...s.staging].reverse().find((u) => u.code === code);
    if (target) prepend(s, fx("rgsCrebain", { target: target.id, player }));
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
    fx("rgsTreachery", { code, source: u.id, player }),
    fx("rgsTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.ringSouth) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const q = s.ringSouth;
  switch (code) {
    case RS.hound: {
      const enemy = get(s, c.enemyId);
      const fresh =
        !!enemy &&
        q.engagedRound === s.round &&
        q.engagedIds.includes(enemy.id);
      c.attackBonus += fresh ? 2 : 1;
      log(
        s,
        `Hound of Sauron: the attacking enemy gets +${fresh ? 2 : 1} attack${fresh ? " (it engaged this round)" : ""}.`,
        "danger",
      );
      return true;
    }
    case RS.howling:
      c.attackBonus += 1;
      c.rgsHowling = true;
      log(
        s,
        "Howling Warg: the attacking enemy gets +1 attack; if this attack destroys a character, 1 damage is placed on an active location.",
        "danger",
      );
      return true;
    case RS.eregion:
      prepend(s, fx("rgsDiscardAttachment", { player: p }));
      return true;
    case RS.crows: {
      const undefended = !(
        c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
      ).length;
      const locations = allActiveLocations(s);
      if (!undefended || !locations.length) {
        log(
          s,
          "Regiments of Crows: the attack is defended or there is no active location; the shadow has no effect.",
        );
        return true;
      }
      if (locations.length === 1) {
        c.undefendedTargetId = locations[0].id;
        log(
          s,
          `Regiments of Crows: the undefended damage is assigned to ${name(locations[0])}.`,
          "danger",
        );
        return true;
      }
      forOwner(s, firstPlayer(s), () =>
        choose(
          s,
          "Regiments of Crows · Assign the undefended damage to an active location",
          locations.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("rgsCrowsTarget", { target: l.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case RS.cold:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Bitter Cold: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
  }
  return false;
}
function treachery(s: GameState, code: string, source: string) {
  const p = activeSeat(s);
  switch (code) {
    case RS.crows: {
      const locations = allActiveLocations(s);
      if (!locations.length)
        log(s, "Regiments of Crows: there is no active location.");
      for (const l of locations) damageLocation(s, l, 3, "Regiments of Crows");
      return;
    }
    case RS.snow: {
      const targets = allActiveLocations(s).filter((l) => !snowed(l));
      if (!targets.length) {
        log(
          s,
          "Snowdrifts: it cannot attach to the active location, so it gains surge.",
          "danger",
        );
        prepend(
          s,
          fx("amonSurgeWindow", { code, player: p }),
          fx("reveal", { player: p }),
        );
        return;
      }
      if (targets.length === 1) {
        prepend(
          s,
          fx("rgsAttach", { target: targets[0].id, source, player: p }),
        );
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Snowdrifts · Attach to an active location${seatLabel(s, p)}`,
          targets.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("rgsAttach", { target: l.id, source, player: p })],
          })),
        ),
      );
      return;
    }
    case RS.cold:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("rgsBitterCold", { player })),
      );
      return;
    case RS.storm: {
      const wargs = s.staging.filter(
        (u) => isEnemyCard(u.code) && isRsWarg(u.code),
      );
      if (!wargs.length) {
        log(
          s,
          "Storm of Howls: no Warg enemy is in the staging area, so it gains surge.",
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
          `Storm of Howls · Choose${seatLabel(s, p)}`,
          [
            {
              id: "attack",
              label:
                "The Warg enemy in the staging area with the highest engagement cost attacks you",
              effects: [fx("rgsStormAttack", { player: p })],
            },
            {
              id: "engage",
              label:
                "Each Warg enemy gets -20 engagement cost until the end of the round",
              effects: [fx("rgsStormEngage", { player: p })],
            },
          ],
          "Peril.",
        ),
      );
      return;
    }
    case RS.lust: {
      const heroes = globalCharacters(s).filter(
        (u) => isHero(u) && card(u.code).sphere_code !== "fellowship",
      );
      if (!heroes.length) {
        log(s, "Lust for the Ring: there is no non-Fellowship hero in play.");
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Lust for the Ring · Attach to a non-Fellowship hero in play${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
            effects: [fx("rgsAttach", { target: h.id, source, player: p })],
          })),
          "Peril. After The One Ring exhausts, each player raises his threat by 1 and the attached hero's willpower is 0 until the end of the round.",
        ),
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function ringSouthEffect(s: GameState, e: Effect): boolean {
  const q = s.ringSouth;
  if (!q || !e.kind.startsWith("rgs")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "rgsCouncil": {
      const order = playerOrder(s);
      let placed = q.council.length,
        moved = true;
      while (placed < 4 && moved) {
        moved = false;
        for (const player of order) {
          if (placed >= 4) break;
          let top: Unit | undefined;
          forOwner(s, player, () => {
            if (s.deck.length) top = takePlayerDeck(s);
          });
          if (!top) continue;
          top.owner = player;
          q.council.push({ owner: player, unit: top });
          placed++;
          moved = true;
        }
      }
      log(
        s,
        `The Council of Elrond: ${q.council.map((c) => card(c.unit.code).name).join(", ") || "no card"} ${q.council.length === 1 ? "is" : "are"} placed faceup.`,
        "chapter",
      );
      prepend(s, fx("rgsCouncilPlay", { player: first }));
      return true;
    }
    case "rgsCouncilPlay": {
      const options = councilOptions(s, "rgsCouncilPlayCard", (owner, x) =>
        councilPlayable(s, owner, x),
      );
      if (!options.length) {
        log(
          s,
          "The Council of Elrond: no faceup card can be played, so none is played.",
        );
        prepend(s, fx("rgsCouncilHand", { player: first }));
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          "The Council of Elrond · Choose a card to be played for 0 cost",
          options,
          "Its owner plays it at no cost.",
        ),
      );
      return true;
    }
    case "rgsCouncilPlayCard": {
      const entry = q.council.find((c) => c.unit.id === e.target);
      if (!entry) return true;
      const owner = entry.owner;
      prepend(s, fx("rgsCouncilHand", { player: first }));
      let targets: Unit[] = [];
      forOwner(s, owner, () => {
        if (needsTarget(entry.unit))
          targets = effectCardPlayTargets(s, entry.unit);
      });
      if (!needsTarget(entry.unit)) {
        prepend(
          s,
          fx("rgsCouncilResolve", { target: entry.unit.id, player: owner }),
        );
        return true;
      }
      forOwner(s, owner, () =>
        choose(
          s,
          `${card(entry.unit.code).name} · Choose a target${seatLabel(s, owner)}`,
          targets.map((t) => ({
            id: t.id,
            code: t.code,
            label: name(t),
            effects: [
              fx("rgsCouncilResolve", {
                target: entry.unit.id,
                source: t.id,
                player: owner,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "rgsCouncilResolve": {
      const entry = takeCouncil(s, e.target);
      if (!entry) return true;
      const owner = entry.owner;
      log(
        s,
        `The Council of Elrond: ${card(entry.unit.code).name} is played for 0 cost.`,
        "good",
      );
      forOwner(s, owner, () => {
        // The card goes back on top of its owner's deck, where the
        // card-effect play takes the physical card.
        s.deck.unshift(entry.unit.code);
        deckCardInserted(s, 0, entry.unit);
        playCardFromEffect(s, entry.unit, {
          putIntoPlay: false,
          target: e.source,
        });
      });
      return true;
    }
    case "rgsCouncilHand": {
      const options = councilOptions(s, "rgsCouncilToHand");
      if (!options.length) return true;
      prepend(s, fx("rgsCouncilDiscard", { player: first }));
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          "The Council of Elrond · Choose a card to add to its owner's hand",
          options,
        ),
      );
      return true;
    }
    case "rgsCouncilToHand": {
      const entry = takeCouncil(s, e.target);
      if (!entry) return true;
      forOwner(s, entry.owner, () => s.hand.push(entry.unit));
      log(
        s,
        `The Council of Elrond: ${card(entry.unit.code).name} is added to its owner's hand.`,
      );
      return true;
    }
    case "rgsCouncilDiscard": {
      const options = councilOptions(s, "rgsCouncilToDiscard");
      if (!options.length) return true;
      prepend(s, fx("rgsCouncilShuffle", { player: first }));
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, first, () =>
        choose(s, "The Council of Elrond · Choose a card to discard", options),
      );
      return true;
    }
    case "rgsCouncilToDiscard": {
      const entry = takeCouncil(s, e.target);
      if (!entry) return true;
      forOwner(s, entry.owner, () => s.discard.push(entry.unit.code));
      log(
        s,
        `The Council of Elrond: ${card(entry.unit.code).name} is discarded.`,
      );
      return true;
    }
    case "rgsCouncilShuffle": {
      for (const entry of q.council.splice(0)) {
        forOwner(s, entry.owner, () => {
          s.deck.push(entry.unit.code);
          deckCardInserted(s, s.deck.length - 1, entry.unit);
          shuffle(s, s.deck);
        });
        log(
          s,
          `The Council of Elrond: ${card(entry.unit.code).name} is shuffled into its owner's deck.`,
        );
      }
      prepend(s, fx("rgsCouncilLust", { player: first }));
      return true;
    }
    case "rgsCouncilLust": {
      const lust = q.setAside.includes(RS.lust);
      choose(
        s,
        "The Council of Elrond · The players choose",
        [
          ...(lust
            ? [
                {
                  id: "lust",
                  label: "Shuffle Lust for the Ring into the encounter deck",
                  effects: [fx("rgsLustShuffle", { player: first })],
                },
              ]
            : []),
          {
            id: "threat",
            label: "Each player raises his threat by 5",
            effects: [fx("rgsCouncilThreat", { player: first })],
          },
        ],
        "Then the players advance to stage 2.",
      );
      return true;
    }
    case "rgsLustShuffle": {
      const i = q.setAside.indexOf(RS.lust);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        s.encounterDeck.push(RS.lust);
        shuffle(s, s.encounterDeck);
        log(
          s,
          "The Council of Elrond: Lust for the Ring is shuffled into the encounter deck.",
          "danger",
        );
      }
      prepend(s, fx("rgsStageTwo", { player: first }));
      return true;
    }
    case "rgsCouncilThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 5, "encounter"));
      log(
        s,
        "The Council of Elrond: each player raises his threat by 5.",
        "danger",
      );
      prepend(s, fx("rgsStageTwo", { player: first }));
      return true;
    case "rgsDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(s.stage === 2 ? "rgsStageThree" : "rgsStageFour", { player: first }),
      );
      return true;
    }
    case "rgsStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = RS.walkers;
      log(s, "The Nine Walkers begins.", "chapter");
      const i = q.setAside.indexOf(RS.pass);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        const pass = make(s, RS.pass);
        const old = makeActive(s, pass);
        log(
          s,
          `The Nine Walkers: Redhorn Pass becomes the active location${old.length ? `; ${old.map((l) => name(l)).join(" and ")} return${old.length === 1 ? "s" : ""} to the staging area` : ""}.`,
          "danger",
        );
      }
      prepend(s, fx("rgsNineWalkers", { player: first }));
      return true;
    }
    case "rgsNineWalkers": {
      const goal = 2 * playerOrder(s).length;
      if (stagingThreat(s) >= goal) {
        log(
          s,
          `The Nine Walkers: there is ${stagingThreat(s)} threat in the staging area (at least ${goal}).`,
        );
        return true;
      }
      if (!s.encounterDeck.length && !s.encounterDiscard.length) return true;
      prepend(
        s,
        fx("reveal", { player: first }),
        fx("rgsNineWalkers", { player: first }),
      );
      return true;
    }
    case "rgsStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = RS.hunt;
      log(s, "The Hunt is Up! begins.", "chapter");
      const chief = [...s.encounterDeck, ...s.encounterDiscard].includes(
        RS.chief,
      );
      prepend(
        s,
        ...playerOrder(s).map((player, i) =>
          fx("rgsHuntSearch", { player, flag: i === 0 && chief }),
        ),
        fx("rgsShuffle", { player: first }),
      );
      return true;
    }
    case "rgsHuntSearch": {
      // One of those enemies must be Great Warg Chief, if able.
      const chief =
        !!e.flag &&
        [...s.encounterDeck, ...s.encounterDiscard].includes(RS.chief);
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of [
          ...new Set(
            cards.filter((c) => isEnemyCard(c) && (!chief || c === RS.chief)),
          ),
        ])
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("rgsHuntFound", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `The Hunt is Up!: ${who(s, p)} find${s.table ? "s" : ""} no enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Hunt is Up! · Search for an enemy${seatLabel(s, p)}`,
          options,
          chief
            ? "One of the enemies must be Great Warg Chief, if able."
            : "Add it to the staging area.",
        ),
      );
      return true;
    }
    case "rgsHuntFound": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const i = pile.lastIndexOf(e.code!);
      if (i < 0) return true;
      pile.splice(i, 1);
      const x = make(s, e.code!);
      s.staging.push(x);
      enemyAddedToStaging(s, x);
      log(
        s,
        `The Hunt is Up!: ${card(e.code!).name} is added to the staging area from the ${e.text === "deck" ? "encounter deck" : "discard pile"}.`,
        "danger",
      );
      return true;
    }
    case "rgsShuffle":
      shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    case "rgsStageFour": {
      q.advancing = false;
      s.stage = 4;
      s.progress = 0;
      q.currentQuest = RS.gates;
      log(s, "The Gates of Moria begins.", "chapter");
      const takeAside = (code: string) => {
        const i = q.setAside.indexOf(code);
        if (i < 0) return undefined;
        q.setAside.splice(i, 1);
        return make(s, code);
      };
      const doors = takeAside(RS.doors);
      if (doors) makeActive(s, doors);
      const watcher = takeAside(RS.watcher);
      if (watcher) {
        s.staging.push(watcher);
        enemyAddedToStaging(s, watcher);
      }
      log(
        s,
        "The Gates of Moria: Doors of Durin becomes the active location and Watcher in the Water is added to the staging area.",
        "danger",
      );
      const bearer = ringBearer(s);
      if (bearer) {
        const owner = ownerOf(s, bearer);
        forOwner(s, owner, () => {
          s.heroes = s.heroes.filter((h) => h.id !== bearer.id);
          s.committedIds = s.committedIds.filter((id) => id !== bearer.id);
        });
        bearer.damage = 0;
        bearer.resources = 0;
        bearer.committed = false;
        q.underWatcher = bearer;
        log(
          s,
          `The Gates of Moria: the Watcher seizes the Ring-bearer. ${name(bearer)} loses all tokens and is placed facedown under Watcher in the Water with The One Ring; no player controls him.`,
          "danger",
        );
      }
      return true;
    }
    case "rgsFreeRingBearer": {
      const bearer = q.underWatcher;
      if (!bearer) return true;
      q.underWatcher = null;
      bearer.exhausted = true;
      bearer.damage = 1;
      bearer.owner = first;
      bearer.controller = first;
      forOwner(s, first, () => s.heroes.push(bearer));
      log(
        s,
        `Watcher in the Water has 6 damage: ${who(s, first)} take${s.table ? "s" : ""} control of the Ring-bearer, ${name(bearer)}, exhausted with 1 damage on it.`,
        "good",
      );
      return true;
    }
    case "rgsTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "rgsTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "rgsAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u) return true;
      const held = q.resolving.splice(i, 1)[0];
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "rgsCrebain": {
      if (!u || !inStaging(s, u)) return true;
      const heroes = seatView(s, p).heroes.filter(canExhaust);
      forOwner(s, p, () =>
        choose(
          s,
          `Crebain from Dunland · Choose${seatLabel(s, p)}`,
          [
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Exhaust ${name(h)}`,
              effects: [fx("rgsExhaust", { target: h.id, player: p })],
            })),
            {
              id: "engage",
              label: "Engage Crebain from Dunland",
              effects: [fx("rgsEngage", { target: u.id, player: p })],
            },
          ],
          "Peril. Either exhaust a hero you control, or engage Crebain from Dunland.",
        ),
      );
      return true;
    }
    case "rgsExhaust":
      if (u && !u.exhausted) {
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
        log(s, `${name(u)} is exhausted.`);
      }
      return true;
    case "rgsEngage":
      if (u && inStaging(s, u)) forOwner(s, p, () => engage(s, u));
      return true;
    case "rgsReveal":
      prepend(s, fx("reveal", { player: p }));
      return true;
    case "rgsChief": {
      let found: string | undefined;
      let discarded = 0;
      while (!found && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        discarded++;
        if (isEnemyCard(code) && isRsWarg(code)) found = code;
        else s.encounterDiscard.push(code);
      }
      if (!found) {
        log(
          s,
          `Great Warg Chief: ${discarded} card${discarded === 1 ? " is" : "s are"} discarded and no Warg enemy is found.`,
        );
        return true;
      }
      const x = make(s, found);
      log(
        s,
        `Great Warg Chief: ${discarded - 1} card${discarded - 1 === 1 ? " is" : "s are"} discarded before ${card(found).name}, which enters play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, x, p);
      return true;
    }
    case "rgsLocationDamage": {
      const locations = allActiveLocations(s);
      const all = e.flag;
      if (!locations.length) return true;
      if (all || locations.length === 1) {
        for (const l of all ? locations : locations.slice(0, 1))
          damageLocation(s, l, 1, e.text ?? "The Road Darkens");
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `${e.text ?? "Damage"} · Place 1 damage on an active location`,
          locations.map((l) => ({
            id: l.id,
            code: l.code,
            label: `${name(l)} (${l.damage} damage)`,
            effects: [
              fx("rgsDamageOne", { target: l.id, text: e.text, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "rgsDamageOne":
      if (u) damageLocation(s, u, 1, e.text ?? "Damage");
      return true;
    case "rgsCrowsTarget":
      if (s.combat && u) {
        s.combat.undefendedTargetId = u.id;
        log(
          s,
          `Regiments of Crows: the undefended damage is assigned to ${name(u)}.`,
          "danger",
        );
      }
      return true;
    case "rgsDiscardAttachment": {
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
          `Eregion: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Eregion · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          choices.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("rgsDropAttachment", {
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
    case "rgsDropAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
    case "rgsBitterCold": {
      const allies = seatView(s, p).allies;
      if (!allies.length) {
        log(
          s,
          `Bitter Cold: ${who(s, p)} control${s.table ? "s" : ""} no ally.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(s, `Bitter Cold · Choose${seatLabel(s, p)}`, [
          {
            id: "discard",
            label: `Discard each ally you control (${allies.length})`,
            effects: [fx("rgsColdDiscard", { player: p })],
          },
          {
            id: "threat",
            label: `Raise your threat by ${allies.length}`,
            effects: [fx("rgsColdThreat", { value: allies.length, player: p })],
          },
        ]),
      );
      return true;
    }
    case "rgsColdDiscard":
      forOwner(s, p, () => {
        for (const a of [...s.allies]) destroy(s, a, false);
      });
      log(
        s,
        `Bitter Cold: ${who(s, p)} discard${s.table ? "s" : ""} each ally.`,
        "danger",
      );
      return true;
    case "rgsColdThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `Bitter Cold: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${e.value ?? 0}.`,
        "danger",
      );
      return true;
    case "rgsStormAttack": {
      const wargs = s.staging.filter(
        (x) => isEnemyCard(x.code) && isRsWarg(x.code),
      );
      if (!wargs.length) return true;
      const top = Math.max(...wargs.map((x) => engagementOf(s, x)));
      const highest = wargs.filter((x) => engagementOf(s, x) === top);
      if (highest.length === 1) {
        prepend(s, fx("immediateAttack", { target: highest[0].id, player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Storm of Howls · Choose the attacking Warg${seatLabel(s, p)}`,
          highest.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("immediateAttack", { target: x.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "rgsStormEngage": {
      const wargs = [...s.staging, ...globalEngaged(s)].filter(
        (x) => isEnemyCard(x.code) && isRsWarg(x.code),
      );
      for (const x of wargs) x.tempEngagement = (x.tempEngagement ?? 0) - 20;
      log(
        s,
        "Storm of Howls: each Warg enemy gets -20 engagement cost until the end of the round.",
        "danger",
      );
      return true;
    }
    case "rgsExploreHill": {
      const x = e.value ?? 0;
      const ready = globalCharacters(s).filter(canExhaust);
      if (x <= 0 || !ready.length) return true;
      if (ready.length <= x) {
        for (const c of ready)
          forOwner(s, ownerOf(s, c), () => exhaustCharacter(s, c));
        log(
          s,
          `Tree-crowned Hill: the players exhaust ${ready.map((c) => name(c)).join(", ")}.`,
          "danger",
        );
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Tree-crowned Hill · The players exhaust a character in play (${x} left)`,
          ready.map((c) => ({
            id: c.id,
            code: c.code,
            label: `${name(c)}${s.table ? ` · ${seatName(s, ownerOf(s, c))}` : ""}`,
            effects: [
              fx("rgsExhaust", { target: c.id, player: first }),
              ...(x > 1
                ? [fx("rgsExploreHill", { value: x - 1, player: first })]
                : []),
            ],
          })),
        ),
      );
      return true;
    }
    case "rgsExploreEregion": {
      const x = e.value ?? 0;
      const allies = globalCharacters(s).filter((c) => isAlly(c));
      if (x <= 0 || !allies.length) return true;
      if (allies.length <= x) {
        for (const a of allies)
          forOwner(s, ownerOf(s, a), () => destroy(s, a, false));
        log(s, "Eregion: the players discard every ally in play.", "danger");
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Eregion · The players discard an ally from play (${x} left)`,
          allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: `${name(a)}${s.table ? ` · ${seatName(s, ownerOf(s, a))}` : ""}`,
            effects: [
              fx("rgsDiscardAlly", { target: a.id, player: first }),
              ...(x > 1
                ? [fx("rgsExploreEregion", { value: x - 1, player: first })]
                : []),
            ],
          })),
        ),
      );
      return true;
    }
    case "rgsDiscardAlly":
      if (u) {
        log(s, `Eregion: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    case "rgsExploreFoothills": {
      const x = e.value ?? 0;
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          const count = Math.min(x, s.hand.length);
          for (let n = 0; n < count; n++) {
            const pick = s.hand[Math.floor(random(s) * s.hand.length)];
            discardHandCard(s, pick.id, { encounterEffect: true });
          }
          if (count)
            log(
              s,
              `Redhorn Foothills: ${who(s, player)} discard${s.table ? "s" : ""} ${count} card${count === 1 ? "" : "s"} at random.`,
              "danger",
            );
        });
      return true;
    }
    case "rgsExploreHollin": {
      const x = e.value ?? 0;
      if (x <= 0) return true;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, x, "encounter"));
      log(
        s,
        `Hills of Hollin: each player raises his threat by ${x}.`,
        "danger",
      );
      return true;
    }
    case "rgsExplorePass": {
      const x = e.value ?? 0;
      if (x <= 0) return true;
      log(
        s,
        `Redhorn Pass: each player assigns ${x} damage among characters he controls.`,
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).flatMap((player) =>
          Array.from({ length: x }, () =>
            fx("chooseDamage", { value: 1, player }),
          ),
        ),
      );
      return true;
    }
    case "rgsHowlingThreat":
      prepend(s, fx("rgsLocationDamage", { text: "Howling Warg", player: p }));
      return true;
    default:
      return true;
  }
}
const engagementOf = (s: GameState, u: Unit) =>
  (card(u.code).engagement ?? 0) +
  (u.tempEngagement ?? 0) +
  engagementBonus(s, u);

// ---------------------------------------------------------------------------
// Hooks.

function engagementBonus(s: GameState, u: Unit) {
  if (!s.ringSouth || card(u.code).type_code !== "enemy") return 0;
  let bonus = 0;
  // Hound of Sauron: -5 engagement cost for each enemy in the staging area.
  if (live(u, RS.hound))
    bonus -= 5 * s.staging.filter((x) => isEnemyCard(x.code)).length;
  // Hills of Hollin: +5 engagement cost to enemies in the staging area.
  if (activeIs(s, RS.hollin) && inStaging(s, u)) bonus += 5;
  return bonus;
}
function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.ringSouth || skipped || !combat.rgsHowling || !combat.rgsDestroyed)
    return [];
  return [
    fx("rgsLocationDamage", {
      text: "Howling Warg",
      player: combat.attackPlayer ?? firstPlayer(s),
    }),
  ];
}
/** Snowdrifts: progress already placed this round on a location. */
const snowPlaced = (s: GameState, u: Unit) =>
  s.ringSouth?.snow.find((x) => x.id === u.id && x.round === s.round)?.amount ??
  0;

export const RING_SOUTH_HOOKS: Batch4ScenarioHooks = {
  setup: setupRingSouth,
  advance,
  stageInfo: ringSouthStageInfo,
  check,
  encounter,
  shadow,
  planningEnd: (s) => {
    const q = s.ringSouth;
    if (q && s.stage === 1 && stageLive(s) && !q.advancing) {
      q.advancing = true;
      prepend(s, fx("rgsCouncil", { player: firstPlayer(s) }));
    }
  },
  mustTravel: (s) => {
    if (!mustTravelStage(s)) return false;
    const slots = s.stage === 4 ? 2 : 1;
    if (allActiveLocations(s).length >= slots) return false;
    return s.staging.some((u) => isLocation(u) && !canTravel(s, u));
  },
  // 4B: travelling while Doors of Durin is active makes a second active
  // location (no travel cost in this encounter deck).
  travelEffects: (s, u) =>
    s.ringSouth &&
    s.stage === 4 &&
    stageLive(s) &&
    isLocation(u) &&
    allActiveLocations(s).length === 1
      ? []
      : undefined,
  // 4B: there can be 2 active locations.
  secondActiveLocation: (s, u) =>
    !!s.ringSouth &&
    s.stage === 4 &&
    stageLive(s) &&
    isLocation(u) &&
    allActiveLocations(s).length === 1,
  engaged: (s, u) => {
    const q = s.ringSouth;
    if (!q) return;
    const p = activeSeat(s);
    if (q.engagedRound !== s.round) {
      q.engagedRound = s.round;
      q.engagedIds = [];
    }
    if (!q.engagedIds.includes(u.id)) q.engagedIds.push(u.id);
    const effects: Effect[] = [];
    if (s.stage >= 2 && stageLive(s) && allActiveLocations(s).length)
      effects.push(
        fx("rgsLocationDamage", {
          text: card(q.currentQuest).name,
          flag: s.stage === 4,
          player: p,
        }),
      );
    if (live(u, RS.chief)) effects.push(fx("rgsChief", { player: p }));
    if (live(u, RS.crebain)) effects.push(fx("rgsReveal", { player: p }));
    if (effects.length) prepend(s, ...effects);
  },
  enemyEntered: (s, u) => {
    // Redhorn Foothills: an enemy added to the staging area gets -5
    // engagement cost until the end of the round.
    if (s.ringSouth && activeIs(s, RS.foothills) && inStaging(s, u)) {
      u.tempEngagement = (u.tempEngagement ?? 0) - 5;
      log(
        s,
        `Redhorn Foothills: ${name(u)} gets -5 engagement cost until the end of the round.`,
        "danger",
      );
    }
  },
  // 3B: after a location enters play, place 1 damage on it.
  cardEntered: (s, u, _fromReveal, cancelled) => {
    if (
      s.ringSouth &&
      !cancelled &&
      s.stage === 3 &&
      stageLive(s) &&
      isLocation(u) &&
      (inStaging(s, u) || allActiveLocations(s).some((l) => l.id === u.id))
    )
      damageLocation(s, u, 1, "The Hunt is Up!");
  },
  engagementBonus,
  threatBonus: (s, u) =>
    s.ringSouth && activeIs(s, RS.hill) && card(u.code).type_code === "enemy"
      ? -1
      : 0,
  explored: (s, u) => {
    if (!s.ringSouth) return;
    const x = u.damage;
    const p = firstPlayer(s);
    if (live(u, RS.doors)) {
      win(
        s,
        "Doors of Durin is explored: the Company of the Ring enters the Mines of Moria.",
      );
      return;
    }
    const kind = live(u, RS.hill)
      ? "rgsExploreHill"
      : live(u, RS.hollin)
        ? "rgsExploreHollin"
        : live(u, RS.foothills)
          ? "rgsExploreFoothills"
          : live(u, RS.eregion)
            ? "rgsExploreEregion"
            : live(u, RS.pass)
              ? "rgsExplorePass"
              : undefined;
    if (kind && x > 0) prepend(s, fx(kind, { value: x, player: p }));
  },
  // Doors of Durin takes progress after each other active location, and only
  // while the first player controls the Ring-bearer.
  progressLocations: (s, locations) => {
    if (!s.ringSouth || !locations.some((l) => l.code === RS.doors))
      return undefined;
    const others = locations.filter((l) => l.code !== RS.doors);
    const bearer = ringBearer(s);
    const open = !!bearer && ownerOf(s, bearer) === firstPlayer(s);
    return [
      ...others,
      ...(open ? locations.filter((l) => l.code === RS.doors) : []),
    ];
  },
  locationProgressBlocked: (s, u) => {
    if (!s.ringSouth || !live(u, RS.doors)) return false;
    const bearer = ringBearer(s);
    return !bearer || ownerOf(s, bearer) !== firstPlayer(s);
  },
  locationProgressCapacity: (s, u) =>
    s.ringSouth && snowed(u) ? Math.max(0, 3 - snowPlaced(s, u)) : undefined,
  locationProgressPlaced: (s, u, amount) => {
    const q = s.ringSouth;
    if (!q || !snowed(u) || amount <= 0) return;
    q.snow = q.snow.filter((x) => x.round === s.round);
    const entry = q.snow.find((x) => x.id === u.id);
    if (entry) entry.amount += amount;
    else q.snow.push({ id: u.id, round: s.round, amount });
  },
  indestructible: (s, u) => !!s.ringSouth && live(u, RS.watcher),
  cannotLeave: (s, u, destruction) =>
    !!s.ringSouth && !destruction && live(u, RS.watcher) && inStaging(s, u),
  cannotEngage: (s, u) => !!s.ringSouth && live(u, RS.watcher),
  cannotOptionallyEngage: (s, u) => !!s.ringSouth && live(u, RS.watcher),
  consideredEngaged: (s, u, player) =>
    !!s.ringSouth &&
    live(u, RS.watcher) &&
    inStaging(s, u) &&
    playerOrder(s).includes(player),
  // Great Warg Chief cannot have attachments.
  cannotAttach: (s, u) => !!s.ringSouth && live(u, RS.chief),
  damageDealt: (s, u, amount) => {
    const q = s.ringSouth;
    if (
      !q ||
      !q.underWatcher ||
      !live(u, RS.watcher) ||
      u.damage < RS_WATCHER_DAMAGE ||
      u.damage - amount >= RS_WATCHER_DAMAGE
    )
      return;
    prepend(s, fx("rgsFreeRingBearer", { player: firstPlayer(s) }));
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (s.ringSouth && live(enemy, RS.howling) && allActiveLocations(s).length)
      prepend(s, fx("rgsHowlingThreat", { player }));
  },
  oneRingExhausted: (s) => {
    const q = s.ringSouth;
    if (!q) return;
    const lust = globalCharacters(s).filter((u) => isHero(u) && lusted(u));
    for (const hero of lust) {
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      q.lustZero = q.lustZero.filter((x) => x.round === s.round);
      if (!q.lustZero.some((x) => x.id === hero.id))
        q.lustZero.push({ id: hero.id, round: s.round });
      log(
        s,
        `Lust for the Ring: each player raises his threat by 1 and ${name(hero)}'s willpower is 0 until the end of the round.`,
        "danger",
      );
    }
  },
  willpowerOverride: (s, u) =>
    s.ringSouth?.lustZero.some((x) => x.id === u.id && x.round === s.round)
      ? 0
      : undefined,
  characterDestroyed: (s, u, context) => {
    if (
      s.ringSouth &&
      s.combat &&
      isCharacter(u) &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.rgsDestroyed = true;
  },
  attackFinished,
  effect: ringSouthEffect,
  sharedEffect: (e) =>
    [
      "rgsCouncilLust",
      "rgsLustShuffle",
      "rgsCouncilThreat",
      "rgsDefeatQuest",
      "rgsStageTwo",
      "rgsNineWalkers",
      "rgsStageThree",
      "rgsShuffle",
      "rgsStageFour",
      "rgsFreeRingBearer",
      "rgsExploreHollin",
      "rgsExplorePass",
      "rgsExploreFoothills",
    ].includes(e.kind),
};
