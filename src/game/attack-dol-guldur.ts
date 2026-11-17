import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  addVictoryCard,
  allyCanEnter,
  destroy,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  enterAlly,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { dealEnemyShadows } from "./considered-engagement";
import {
  ADG,
  ADG_DOL_GULDUR_LOCATIONS,
  ADG_LIEUTENANTS,
  ADG_SIEGE,
  ADG_STAGE,
  ADG_STAGE3,
  ADG_STAGE3_CODES,
  adgRecipe,
  adgStageInfo,
} from "./attack-dol-guldur-support";
export * from "./attack-dol-guldur-support";

/**
 * Attack on Dol Guldur (2017 Gen Con event, print-on-demand Q99.10), in
 * standard game mode: the players hold the Golden Wood while the power of
 * Lórien gathers, cross the Anduin and then fight around Dol Guldur from one
 * stage 3 to another. Explored locations and destroyed enemies reduce the
 * city strength by their siege values; at 0 the Lieutenants lose
 * indestructible, and with none in play at the end of the round the players
 * capture Dol Guldur.
 */
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
const at = (s: GameState, code: string) =>
  s.attackDolGuldur?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const atStage3 = (s: GameState) =>
  !!s.attackDolGuldur &&
  ADG_STAGE3_CODES.includes(s.attackDolGuldur.currentQuest) &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isEnemyCode = (c: string) => card(c).type_code === "enemy";
const traitsOf = (c: string) =>
  (card(c).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const isOrcCode = (c: string) => isEnemyCode(c) && traitsOf(c).includes("Orc");
const isCharacter = (u: Unit) =>
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code);
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
const lieutenantsInPlay = (s: GameState) =>
  enemiesInPlay(s).filter((u) => ADG_LIEUTENANTS.includes(u.code));
const staged = (s: GameState, c: string) => s.staging.some((u) => live(u, c));
const inVictory = (s: GameState, c: string) =>
  (s.victoryCards ?? []).includes(c);
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const players = (s: GameState) => playerOrder(s).length;
/** The current stage 3's Lieutenant, whose engagement cost falls with progress. */
const stageLieutenant = (s: GameState) =>
  atStage3(s)
    ? ADG_STAGE3[s.attackDolGuldur!.currentQuest].lieutenant
    : undefined;
function fromAside(s: GameState, c: string) {
  const q = s.attackDolGuldur!;
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
/** Dol Guldur's city strength (the siege tracker) changes; it never falls below 0. */
function changeCity(s: GameState, delta: number, source: string) {
  const q = s.attackDolGuldur!;
  const before = q.cityStrength;
  q.cityStrength = Math.max(0, before + delta);
  if (q.cityStrength === before) return;
  log(
    s,
    `${source}: Dol Guldur's city strength ${q.cityStrength > before ? "rises" : "falls"} to ${q.cityStrength}.`,
    q.cityStrength > before ? "danger" : "good",
  );
  if (q.cityStrength === 0)
    log(
      s,
      "Dol Guldur's city strength is 0: each Lieutenant enemy loses indestructible.",
      "good",
    );
}
/** Take an enemy out of play: engaged or staged, its shadow cards discarded. */
function leavePlay(s: GameState, u: Unit) {
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
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true, false);
}
/**
 * Discard from the top of the encounter deck until an enemy is discarded
 * (3F reshuffles the discard pile when the last card goes; the others stop).
 */
function discardUntilEnemy(s: GameState, reshuffle: boolean) {
  for (;;) {
    if (!s.encounterDeck.length) {
      if (
        !reshuffle ||
        !s.encounterDiscard.some((c) => isEnemyCode(c)) ||
        !s.encounterDiscard.length
      )
        return null;
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      log(s, "The encounter discard pile is shuffled into the encounter deck.");
    }
    const c = s.encounterDeck.shift()!;
    s.encounterDiscard.push(c);
    if (isEnemyCode(c)) {
      takeFrom(s.encounterDiscard, c);
      if (reshuffle && !s.encounterDeck.length && s.encounterDiscard.length) {
        s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        log(
          s,
          "The encounter discard pile is shuffled into the encounter deck.",
        );
      }
      return c;
    }
  }
}
const searchable = (s: GameState, match: (c: string) => boolean) =>
  [...new Set([...s.encounterDeck, ...s.encounterDiscard].filter(match))].sort(
    (a, b) => card(a).name.localeCompare(card(b).name),
  );
function takeSearched(s: GameState, c: string) {
  return takeFrom(s.encounterDeck, c) || takeFrom(s.encounterDiscard, c);
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupAttackDolGuldur(s: GameState) {
  const r = adgRecipe();
  const section = (title: string) =>
    r.cards
      .filter((c) => c.section === title)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const n = players(s);
  const marauders = section("sharedStagingArea").filter(
    (c) => c === ADG.marauder,
  );
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...marauders.slice(n),
  ]);
  s.staging.push(make(s, ADG.city), make(s, ADG.power));
  for (const c of marauders.slice(0, n)) s.staging.push(make(s, c));
  s.attackDolGuldur = {
    currentQuest: ADG.golden,
    advancing: false,
    setAside: section("sharedSetAside"),
    removed: [],
    cityStrength: 5 + 5 * n,
    questResources: 0,
    lorien: null,
    siege: { round: 0, value: 0 },
    fastness: null,
    questProgress: null,
    resolving: [],
    threatReduced: [],
    healed: [],
    despair: null,
    unready: [],
    rage: null,
    rageShadow: [],
    fastnessShadow: [],
    shadowRoad: [],
  };
  log(
    s,
    `Standard game mode: Dol Guldur is added to the staging area with a city strength of ${5 + 5 * n}. Host of Lórien and the 4 Lieutenant enemies are set aside; Power of Lórien and ${n === 1 ? "a Dol Guldur Marauder" : `${n} copies of Dol Guldur Marauder`} are added to the staging area.`,
    "chapter",
  );
}
function advance(s: GameState) {
  // Every stage has "–" quest points: progress never advances this quest.
  return !!s.attackDolGuldur;
}
const STAGE3_LABEL = (c: string) =>
  `${ADG_STAGE3[c].front} ${card(c).name} (${card(ADG_STAGE3[c].lieutenant).name})`;
const PENALTY: Record<string, string> = {
  [ADG.siege]: "Increase Dol Guldur's city strength by 3",
  [ADG.tower]: "Each player discards all but 1 card from his hand",
  [ADG.trees]:
    "Each player discards from the encounter deck until an enemy, which engages him",
  [ADG.dungeons]: "Each player discards an ally he controls",
};
const BONUS: Record<string, string> = {
  [ADG.siege]: "Reduce Dol Guldur's city strength by 3",
  [ADG.tower]:
    "Choose a player: he searches his deck for a card and adds it to his hand",
  [ADG.trees]: "Choose a non-unique enemy in play and destroy it",
  [ADG.dungeons]:
    "Choose a player: he searches the top 10 cards of his deck for an ally and puts it into play",
};

// ---------------------------------------------------------------------------
// Encounter cards.

const TREACHERIES: readonly string[] = [
  ADG.servant,
  ADG.sevenfold,
  ADG.rage,
  ADG.despair,
  ADG.fastness,
];
function encounter(s: GameState, c: string, replay = false, fromReveal = true) {
  const q = s.attackDolGuldur;
  if (!q || !TREACHERIES.includes(c)) return false;
  const player = activeSeat(s);
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(c);
    return true;
  }
  if (replay) takeFrom(s.encounterDiscard, c);
  const u = make(s, c);
  q.resolving.push(u);
  const first = firstPlayer(s);
  const each = (kind: string) =>
    playerOrder(s).map((p) => fx(kind, { code: c, source: u.id, player: p }));
  const effects: Effect[] =
    c === ADG.servant
      ? [fx("adgServant", { player: first })]
      : c === ADG.sevenfold
        ? [...each("adgSevenfold"), fx("adgShuffle", { player: first })]
        : c === ADG.rage
          ? [fx("adgRage", { player: first })]
          : c === ADG.despair
            ? [...each("adgDespair"), fx("adgDespairLock", { player: first })]
            : [fx("adgFastness", { player: first })];
  prepend(s, ...effects, fx("adgTreacheryDone", { source: u.id, player }));
  return true;
}

/** The shadow effects of this encounter deck. */
function shadow(s: GameState, c: string) {
  const combat = s.combat;
  const q = s.attackDolGuldur;
  if (!combat || !q) return false;
  const p = combat.attackPlayer ?? activeSeat(s);
  const defenders = (
    combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
  )
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  switch (c) {
    case ADG.olog:
      prepend(s, fx("adgOlogShadow", { target: combat.enemyId, player: p }));
      return true;
    case ADG.archer:
      prepend(s, fx("adgExhaust", { text: "Amon Lanc Archer", player: p }));
      return true;
    case ADG.warg:
      prepend(
        s,
        fx("adgDiscardAttachment", { text: "Battle Warg", player: p }),
      );
      return true;
    case ADG.woods:
      combat.attackBonus += 1;
      combat.adgWoods = true;
      log(
        s,
        "Blackened Woods: the attacking enemy gets +1 attack; if this attack destroys a character, 3 progress are removed from the main quest.",
        "danger",
      );
      return true;
    case ADG.servant:
      combat.extraAttacks = (combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "Servant of Sauron: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case ADG.rage:
      for (const d of defenders)
        q.rageShadow.push({ id: d.id, round: s.round, phase: phaseKey(s) });
      if (defenders.length)
        prepend(
          s,
          ...defenders.map((d) => fx("damage", { target: d.id, value: 1 })),
        );
      log(
        s,
        defenders.length
          ? "The Necromancer's Rage: 1 damage to the defending character, which gets -1 defense for each damage on it until the end of the phase."
          : "The Necromancer's Rage: there is no defending character.",
        "danger",
      );
      return true;
    case ADG.despair:
      for (const d of defenders) q.unready.push({ id: d.id, round: s.round });
      log(
        s,
        "Fear and Despair: the defending character cannot ready until the end of the round.",
        "danger",
      );
      return true;
    case ADG.fastness: {
      const value = s.progress >= 5 ? 2 : 1;
      q.fastnessShadow.push({
        id: combat.enemyId,
        round: s.round,
        phase: phaseKey(s),
        value,
      });
      log(
        s,
        `Fastness of Mirkwood: the attacking enemy gets +${value} attack and +${value} defense until the end of the phase.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

function adgEffect(s: GameState, e: Effect): boolean {
  const q = s.attackDolGuldur;
  if (!q || !e.kind.startsWith("adg")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "adgShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      return true;
    case "adgAdvance": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx(e.text ?? "", { player: first }));
      return true;
    }
    // 1B: a resource and the progress move at the end of each round.
    case "adgGoldenForced": {
      q.questResources += 1;
      const power = s.staging.find((u) => u.code === ADG.power);
      const moved = power ? s.progress : 0;
      if (power && moved > 0) {
        power.progress += moved;
        s.progress = 0;
      }
      log(
        s,
        `Assault on the Golden Wood: a resource is placed on the stage (${q.questResources} of 3)${moved ? ` and ${moved} progress move to Power of Lórien (${power!.progress})` : ""}.`,
      );
      if (q.questResources >= 3) {
        q.advancing = true;
        prepend(s, fx("adgAdvance", { text: "adgCrossing", player: first }));
      }
      return true;
    }
    case "adgGoldenResponse":
      if (!at(s, ADG.golden)) return true;
      choose(
        s,
        `Assault on the Golden Wood · Raise each player's threat by 1: each player draws 1 card and adds 1 resource to a hero?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label:
              "Raise each player's threat by 1: each player draws 1 card and adds 1 resource to a hero's resource pool",
            effects: [fx("adgGoldenAid", { player: first })],
          },
          { id: "skip", label: "Do not use the Response", effects: [] },
        ],
        card(ADG.golden).back_text,
      );
      return true;
    case "adgGoldenAid":
      for (const x of playerOrder(s))
        forOwner(s, x, () => raiseThreat(s, 1, "encounter"));
      log(s, "Assault on the Golden Wood: each player raises his threat by 1.");
      prepend(
        s,
        ...playerOrder(s).flatMap((x) => [
          fx("draw", { value: 1, player: x }),
          fx("adgResource", { player: x }),
        ]),
      );
      return true;
    case "adgResource": {
      const heroes = seatView(s, p).heroes;
      const options = heroes.map((h) => ({
        id: h.id,
        label: `${name(h)} · ${h.resources} resource${h.resources === 1 ? "" : "s"}`,
        effects: [fx("resource", { target: h.id, value: 1, player: p })],
      }));
      if (options.length <= 1) {
        prepend(s, ...(options[0]?.effects ?? []));
        return true;
      }
      choose(
        s,
        `Assault on the Golden Wood · Add 1 resource to a hero's resource pool${seatLabel(s, p)}`,
        options,
        card(ADG.golden).back_text,
      );
      return true;
    }
    // 2A/2B: Crossing the Anduin.
    case "adgCrossing": {
      q.advancing = false;
      q.currentQuest = ADG.anduin;
      q.questResources = 0;
      s.stage = ADG_STAGE[ADG.anduin];
      s.progress = 0;
      log(s, "Crossing the Anduin begins.", "chapter");
      prepend(
        s,
        fx("adgHostOffer", { player: first }),
        ...playerOrder(s).map((player) => fx("adgSearchLocation", { player })),
        fx("adgShuffle", { player: first }),
        fx("adgAdvance", { text: "adgChooseStage3", player: first }),
      );
      return true;
    }
    case "adgHostOffer": {
      const power = s.staging.find((u) => u.code === ADG.power);
      const progress = power?.progress ?? 0;
      const take = progress >= 10 && q.setAside.includes(ADG.host);
      if (!take) {
        prepend(s, fx("adgPowerOffer", { player: first }));
        return true;
      }
      choose(
        s,
        `Crossing the Anduin · Remove 10 progress from Power of Lórien to take control of Host of Lórien?${seatLabel(s, first)}`,
        [
          {
            id: "host",
            label: `Remove 10 progress from Power of Lórien (${progress}): take control of Host of Lórien`,
            code: ADG.host,
            effects: [
              fx("adgTakeHost", { player: first }),
              fx("adgPowerOffer", { player: first }),
            ],
          },
          {
            id: "skip",
            label: "Leave Host of Lórien set aside",
            effects: [fx("adgPowerOffer", { player: first })],
          },
        ],
        card(ADG.anduin).text,
      );
      return true;
    }
    case "adgTakeHost": {
      const power = s.staging.find((u) => u.code === ADG.power);
      if (!power || power.progress < 10 || !fromAside(s, ADG.host)) return true;
      power.progress -= 10;
      const host = make(s, ADG.host);
      forOwner(s, first, () => {
        host.owner = first;
        s.allies.push(host);
      });
      log(
        s,
        `Crossing the Anduin: 10 progress are removed from Power of Lórien and ${who(s, first)} ${verb(s, "take")} control of Host of Lórien.`,
        "good",
      );
      return true;
    }
    case "adgPowerOffer": {
      const power = s.staging.find((u) => u.code === ADG.power);
      if (!power) return true;
      if (power.progress < 20) {
        prepend(s, fx("adgPowerDiscard", { player: first }));
        return true;
      }
      choose(
        s,
        `Crossing the Anduin · Remove 20 more progress from Power of Lórien to place it in your play area?${seatLabel(s, first)}`,
        [
          {
            id: "power",
            label: `Remove 20 progress from Power of Lórien (${power.progress}): place it in your play area under your control`,
            code: ADG.power,
            effects: [fx("adgPowerTake", { player: first })],
          },
          {
            id: "discard",
            label: "Discard Power of Lórien",
            effects: [fx("adgPowerDiscard", { player: first })],
          },
        ],
        card(ADG.anduin).text,
      );
      return true;
    }
    case "adgPowerTake": {
      const power = s.staging.find((u) => u.code === ADG.power);
      if (!power || power.progress < 20) return true;
      s.staging = s.staging.filter((u) => u.id !== power.id);
      q.lorien = { player: first };
      log(
        s,
        `Crossing the Anduin: 20 more progress are removed and ${who(s, first)} ${verb(s, "place")} Power of Lórien in ${s.table ? "his" : "your"} play area.`,
        "good",
      );
      return true;
    }
    case "adgPowerDiscard": {
      const power = s.staging.find((u) => u.code === ADG.power);
      if (!power) return true;
      s.staging = s.staging.filter((u) => u.id !== power.id);
      s.encounterDiscard.push(ADG.power);
      log(s, "Crossing the Anduin: Power of Lórien is discarded.");
      return true;
    }
    case "adgSearchLocation": {
      const options = searchable(s, (c) =>
        ADG_DOL_GULDUR_LOCATIONS.includes(c),
      );
      if (!options.length) {
        log(s, "Crossing the Anduin: there is no Dol Guldur location to find.");
        return true;
      }
      choose(
        s,
        `Crossing the Anduin · Search for a Dol Guldur location${seatLabel(s, p)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to the staging area`,
          effects: [fx("adgSearchTake", { code: c, player: p })],
        })),
        card(ADG.anduin).back_text,
      );
      return true;
    }
    case "adgSearchTake": {
      const c = e.code ?? "";
      if (!takeSearched(s, c)) return true;
      toStaging(s, c);
      log(s, `${card(c).name} is added to the staging area.`, "danger");
      return true;
    }
    case "adgChooseStage3": {
      const options = ADG_STAGE3_CODES.filter((c) => c !== q.currentQuest);
      choose(
        s,
        `${atStage3(s) ? "Standard Game Mode · Advance to a new stage 3" : "Crossing the Anduin · Advance to a stage 3 of your choice"}${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `${STAGE3_LABEL(c)}${inVictory(s, ADG_STAGE3[c].lieutenant) ? " · in the victory display" : ""}`,
          effects: [fx("adgEnterStage3", { code: c, player: first })],
        })),
        atStage3(s) ? card(ADG.mode).back_text : card(ADG.anduin).back_text,
      );
      return true;
    }
    // 3A/3C/3E/3G When Revealed.
    case "adgEnterStage3": {
      const c = e.code ?? "";
      const info = ADG_STAGE3[c];
      if (!info) return true;
      q.advancing = false;
      q.currentQuest = c;
      s.stage = 3;
      s.progress = 0;
      q.questProgress = null;
      log(s, `${info.front} ${card(c).name} begins.`, "chapter");
      for (const lt of lieutenantsInPlay(s)) {
        leavePlay(s, lt);
        q.setAside.push(lt.code);
        log(
          s,
          `${name(lt)} loses all its tokens and is set aside, out of play.`,
        );
      }
      const next = info.lieutenant;
      if (inVictory(s, next)) {
        log(s, `${card(next).name} is in the victory display.`, "good");
        return true;
      }
      if (!fromAside(s, next)) return true;
      const u = toStaging(s, next);
      log(s, `${card(next).name} is added to the staging area.`, "danger");
      if (q.cityStrength <= 5)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("immediateAttack", { target: u.id, player }),
          ),
        );
      return true;
    }
    // End of the round at stage 3.
    case "adgWinCheck":
      if (q.cityStrength === 0 && !lieutenantsInPlay(s).length)
        win(
          s,
          "Dol Guldur's city strength is 0 and no Lieutenant enemy is in play at the end of the round: Dol Guldur is captured and the players win the game.",
        );
      return true;
    case "adgStageForced": {
      const c = q.currentQuest;
      if (!ADG_STAGE3[c]) return true;
      const options: Option[] = [];
      if (s.progress >= 5)
        options.push({
          id: "progress",
          label: "Remove 5 progress from this stage",
          effects: [
            fx("adgPay", { player: first }),
            fx("adgBonusOffer", { code: c, player: first }),
          ],
        });
      options.push({
        id: "penalty",
        label: PENALTY[c],
        effects: [fx("adgPenalty", { code: c, player: first })],
      });
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `${ADG_STAGE3[c].back} ${card(c).name} · Remove 5 progress from this stage, or: ${PENALTY[c].toLowerCase()}${seatLabel(s, first)}`,
        options,
        card(c).back_text,
      );
      return true;
    }
    case "adgPay":
      removeProgress(s, 5, card(q.currentQuest).name);
      return true;
    case "adgBonusOffer": {
      const c = e.code ?? "";
      if (s.progress < 5 || !BONUS[c]) return true;
      choose(
        s,
        `${ADG_STAGE3[c].back} ${card(c).name} · Remove an additional 5 progress?${seatLabel(s, first)}`,
        [
          {
            id: "bonus",
            label: `Remove 5 more progress: ${BONUS[c].charAt(0).toLowerCase()}${BONUS[c].slice(1)}`,
            effects: [
              fx("adgPay", { player: first }),
              fx("adgBonus", { code: c, player: first }),
            ],
          },
          { id: "skip", label: "Keep the progress", effects: [] },
        ],
        card(c).back_text,
      );
      return true;
    }
    case "adgPenalty": {
      const c = e.code ?? "";
      switch (c) {
        case ADG.siege:
          changeCity(s, 3, card(c).name);
          return true;
        case ADG.tower:
          prepend(
            s,
            ...playerOrder(s).map((player) => fx("adgKeepOne", { player })),
          );
          return true;
        case ADG.trees:
          prepend(
            s,
            ...playerOrder(s).map((player) => fx("adgAmbush", { player })),
          );
          return true;
        case ADG.dungeons:
          prepend(
            s,
            ...playerOrder(s).map((player) =>
              fx("adgDiscardAlly", { text: card(c).name, player }),
            ),
          );
          return true;
      }
      return true;
    }
    case "adgBonus": {
      const c = e.code ?? "";
      if (c === ADG.siege) {
        changeCity(s, -3, card(c).name);
        return true;
      }
      if (c === ADG.trees) {
        const targets = enemiesInPlay(s).filter((u) => !card(u.code).is_unique);
        if (!targets.length) {
          log(s, `${card(c).name}: there is no non-unique enemy in play.`);
          return true;
        }
        choose(
          s,
          `${card(c).name} · Choose a non-unique enemy to destroy${seatLabel(s, first)}`,
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Destroy ${name(u)}`,
            effects: [fx("adgSlay", { target: u.id, player: first })],
          })),
          card(c).back_text,
        );
        return true;
      }
      // 3D and 3H: the first player chooses a player at any stage.
      const kind = c === ADG.tower ? "adgTutor" : "adgRecruit";
      const order = playerOrder(s);
      if (order.length === 1) {
        prepend(s, fx(kind, { player: order[0] }));
        return true;
      }
      choose(
        s,
        `${card(c).name} · Choose a player${seatLabel(s, first)}`,
        order.map((x) => ({
          id: String(x),
          label: seatName(s, x),
          effects: [fx(kind, { player: x })],
        })),
        card(c).back_text,
      );
      return true;
    }
    case "adgSlay": {
      const u = get(s, e.target);
      if (!u || !isEnemy(u)) return true;
      log(s, `Battle Under the Trees: ${name(u)} is destroyed.`, "good");
      destroy(s, u, true);
      return true;
    }
    case "adgKeepOne": {
      const hand = seatView(s, p).hand;
      if (hand.length <= 1) return true;
      choose(
        s,
        `The Tower of Sorcery · Keep 1 card; discard the rest of your hand${seatLabel(s, p)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Keep ${name(u)}`,
          effects: [fx("adgDiscardHand", { source: u.id, player: p })],
        })),
        card(ADG.tower).back_text,
      );
      return true;
    }
    case "adgDiscardHand": {
      const rest = seatView(s, p).hand.filter((u) => u.id !== e.source);
      forOwner(s, p, () => {
        for (const u of rest)
          discardHandCard(s, u.id, { encounterEffect: true });
      });
      log(
        s,
        `The Tower of Sorcery: ${who(s, p)} ${verb(s, "discard")} ${rest.length} card${rest.length === 1 ? "" : "s"} from ${s.table ? "his" : "your"} hand.`,
        "danger",
      );
      return true;
    }
    case "adgAmbush": {
      const c = discardUntilEnemy(s, true);
      if (!c) {
        log(s, "Battle Under the Trees: no enemy is discarded.");
        return true;
      }
      enterEnemyEngaged(s, make(s, c), p);
      log(
        s,
        `Battle Under the Trees: ${card(c).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    case "adgDiscardAlly": {
      const allies = seatView(s, p).allies;
      if (!allies.length) return true;
      choose(
        s,
        `${e.text} · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("adgDiscardOneAlly", { target: u.id, player: p })],
        })),
        e.text === card(ADG.dweller).name
          ? card(ADG.dweller).text
          : card(ADG.dungeons).back_text,
      );
      return true;
    }
    case "adgDiscardOneAlly": {
      const u = get(s, e.target);
      if (u && seatView(s, p).allies.some((x) => x.id === u.id))
        forOwner(s, p, () => discardCharacter(s, u));
      return true;
    }
    case "adgTutor": {
      const codes = [...new Set(seatView(s, p).deck)].sort((a, b) =>
        card(a).name.localeCompare(card(b).name),
      );
      if (!codes.length) return true;
      choose(
        s,
        `The Tower of Sorcery · Search your deck for a card${seatLabel(s, p)}`,
        codes.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to your hand`,
          effects: [fx("adgTutorTake", { code: c, player: p })],
        })),
        card(ADG.tower).back_text,
      );
      return true;
    }
    case "adgTutorTake":
      forOwner(s, p, () => {
        const i = s.deck.indexOf(e.code ?? "");
        if (i >= 0) s.hand.push(takePlayerDeck(s, i));
        s.deck = shuffle(s, s.deck);
      });
      log(
        s,
        `The Tower of Sorcery: ${who(s, p)} ${verb(s, "add")} a card to ${s.table ? "his" : "your"} hand and ${verb(s, "shuffle")} ${s.table ? "his" : "your"} deck.`,
        "good",
      );
      return true;
    case "adgRecruit": {
      const top = seatView(s, p).deck.slice(0, 10);
      const codes = [
        ...new Set(
          top.filter((c) => card(c).type_code === "ally" && allyCanEnter(s, c)),
        ),
      ].sort((a, b) => card(a).name.localeCompare(card(b).name));
      if (!codes.length) {
        forOwner(s, p, () => (s.deck = shuffle(s, s.deck)));
        log(
          s,
          `Dungeons of the Necromancer: ${who(s, p)} ${verb(s, "find")} no ally in the top 10 cards.`,
        );
        return true;
      }
      choose(
        s,
        `Dungeons of the Necromancer · Put an ally from the top 10 cards of your deck into play${seatLabel(s, p)}`,
        [
          ...codes.map((c) => ({
            id: c,
            code: c,
            label: `Put ${card(c).name} into play`,
            effects: [fx("adgRecruitTake", { code: c, player: p })],
          })),
          {
            id: "skip",
            label: "Put no ally into play",
            effects: [fx("adgRecruitTake", { player: p })],
          },
        ],
        card(ADG.dungeons).back_text,
      );
      return true;
    }
    case "adgRecruitTake":
      forOwner(s, p, () => {
        const i = e.code ? s.deck.slice(0, 10).indexOf(e.code) : -1;
        if (i >= 0) {
          const u = takePlayerDeck(s, i);
          s.deck = shuffle(s, s.deck);
          enterAlly(s, u);
          log(
            s,
            `Dungeons of the Necromancer: ${name(u)} is put into play.`,
            "good",
          );
        } else s.deck = shuffle(s, s.deck);
      });
      return true;
    case "adgCityForced": {
      const siege = q.siege.round === s.round ? q.siege.value : 0;
      if (siege) changeCity(s, -siege, `Siege value ${siege} this round`);
      else
        log(
          s,
          "Dol Guldur: no location was explored and no enemy with a siege value was destroyed this round.",
        );
      return true;
    }
    // Standard Game Mode: a random stage 3 that was not in play this round.
    case "adgRandomForced": {
      const others = ADG_STAGE3_CODES.filter((c) => c !== q.currentQuest);
      const c = others[Math.floor(random(s) * others.length)];
      log(
        s,
        `Standard Game Mode: ${ADG_STAGE3[c].back} ${card(c).name} is randomly selected; with no progress on it, its Forced effect: ${PENALTY[c].toLowerCase()}.`,
        "danger",
      );
      prepend(s, fx("adgPenalty", { code: c, player: first }));
      return true;
    }
    case "adgRotate":
      if (s.progress > 0)
        log(
          s,
          `Standard Game Mode: ${s.progress} progress ${s.progress === 1 ? "is" : "are"} discarded from ${card(q.currentQuest).name}.`,
        );
      s.progress = 0;
      q.advancing = true;
      prepend(s, fx("adgAdvance", { text: "adgChooseStage3", player: first }));
      return true;
    // Treacheries.
    case "adgTreacheryDone": {
      const i = q.resolving.findIndex((u) => u.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    case "adgServant": {
      const enemies = s.staging.filter((u) => isEnemy(u));
      if (!enemies.length) {
        log(s, "Servant of Sauron: there is no enemy in the staging area.");
        return true;
      }
      const top = Math.max(...enemies.map((u) => engagementCost(s, u)));
      const highest = enemies.filter((u) => engagementCost(s, u) === top);
      if (highest.length === 1) {
        prepend(
          s,
          fx("adgServantAttack", { target: highest[0].id, player: first }),
        );
        return true;
      }
      choose(
        s,
        `Servant of Sauron · Choose the enemy with the highest engagement cost${seatLabel(s, first)}`,
        highest.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} attacks the first player`,
          effects: [fx("adgServantAttack", { target: u.id, player: first })],
        })),
        card(ADG.servant).text,
      );
      return true;
    }
    case "adgServantAttack": {
      const u = get(s, e.target);
      if (!u) return true;
      log(
        s,
        `Servant of Sauron: ${name(u)} makes an immediate attack against the first player.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    case "adgSevenfold": {
      const locations = searchable(s, (c) =>
        ADG_DOL_GULDUR_LOCATIONS.includes(c),
      );
      const orcs = searchable(s, isOrcCode);
      if (!locations.length && !orcs.length) return true;
      choose(
        s,
        `Power Sevenfold · Add a Dol Guldur location to the staging area, or put an Orc enemy into play engaged with you${seatLabel(s, p)}`,
        [
          ...locations.map((c) => ({
            id: `location:${c}`,
            code: c,
            label: `Add ${card(c).name} to the staging area`,
            effects: [fx("adgSearchTake", { code: c, player: p })],
          })),
          ...orcs.map((c) => ({
            id: `orc:${c}`,
            code: c,
            label: `Put ${card(c).name} into play engaged with you`,
            effects: [fx("adgEngageFromDeck", { code: c, player: p })],
          })),
        ],
        card(ADG.sevenfold).text,
      );
      return true;
    }
    case "adgEngageFromDeck": {
      const c = e.code ?? "";
      if (!takeSearched(s, c)) return true;
      enterEnemyEngaged(s, make(s, c), p);
      log(
        s,
        `${card(c).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    case "adgRage": {
      const exhausted = playerOrder(s).flatMap((x) =>
        charactersOf(s, x).filter((u) => u.exhausted),
      );
      q.rage = { round: s.round, phase: phaseKey(s) };
      log(
        s,
        `The Necromancer's Rage: 1 damage to each exhausted character (${exhausted.length}); each damaged character gets -1 willpower until the end of the phase.`,
        "danger",
      );
      prepend(
        s,
        ...exhausted.map((u) => fx("damage", { target: u.id, value: 1 })),
      );
      return true;
    }
    case "adgDespair": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `Fear and Despair · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("adgExhaustOne", { target: u.id, player: p })],
        })),
        card(ADG.despair).text,
      );
      return true;
    }
    case "adgDespairLock":
      q.despair = s.round;
      log(
        s,
        "Fear and Despair: until the end of the round, characters cannot be readied by player card effects.",
        "danger",
      );
      return true;
    case "adgFastness":
      q.fastness = s.round;
      log(
        s,
        "Fastness of Mirkwood: no more than 5 progress can be placed on the current quest this round.",
        "danger",
      );
      return true;
    case "adgExhaust": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("adgExhaustOne", { target: u.id, player: p })],
        })),
        card(ADG.archer).shadow,
      );
      return true;
    }
    case "adgExhaustOne": {
      const u = get(s, e.target);
      if (u) exhaustCharacter(s, u);
      return true;
    }
    case "adgDiscardAttachment": {
      const owned = charactersOf(s, p).flatMap((u) =>
        u.attachments.filter((a) => !a.facedown).map((a) => ({ u, a })),
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
            fx("adgDiscardOne", { target: u.id, source: a.id, player: p }),
          ],
        })),
        card(ADG.warg).text,
      );
      return true;
    }
    case "adgDiscardOne": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    case "adgRemoveProgress":
      removeProgress(s, e.value ?? 0, e.text ?? "");
      return true;
    // A Forced choice: remove progress from the main quest, or the other effect.
    case "adgChoice": {
      const u = get(s, e.target);
      const n = e.value ?? 1;
      const title = e.code ? card(e.code).name : u ? name(u) : "";
      const options: Option[] = [
        ...(s.progress > 0
          ? [
              {
                id: "progress",
                label: `Remove ${n} progress from the main quest`,
                effects: [
                  fx("adgRemoveProgress", {
                    value: n,
                    text: title,
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        ...(e.flag === false
          ? []
          : [{ id: "other", label: e.text ?? "", effects: e.effects ?? [] }]),
      ];
      if (options.length <= 1) {
        prepend(s, ...(options[0]?.effects ?? []));
        return true;
      }
      choose(
        s,
        `${title} · Remove ${n} progress from the main quest, or ${(e.text ?? "").charAt(0).toLowerCase()}${(e.text ?? "").slice(1)}${seatLabel(s, p)}`,
        options,
        e.code ? (card(e.code).text ?? card(e.code).shadow) : undefined,
      );
      return true;
    }
    case "adgMarauder": {
      const u = get(s, e.target);
      if (!u) return true;
      u.resources += 1;
      log(
        s,
        `Dol Guldur Marauder: a resource is placed on it (${u.resources}).`,
        "danger",
      );
      return true;
    }
    case "adgBeastShadow": {
      const u = get(s, e.target);
      if (!u) return true;
      const dealt = dealEnemyShadows(s, u, 1);
      log(
        s,
        dealt.length
          ? "Beast of Taur-nu-Fuin is dealt an additional shadow card."
          : "Beast of Taur-nu-Fuin: the encounter deck is empty.",
        "danger",
      );
      return true;
    }
    case "adgArcherDamage": {
      const allies = seatView(s, p).allies;
      if (!allies.length) return true;
      choose(
        s,
        `Amon Lanc Archer · Deal 2 damage to an ally you control${seatLabel(s, p)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} · ${u.damage} damage`,
          effects: [fx("damage", { target: u.id, value: 2 })],
        })),
        card(ADG.archer).text,
      );
      return true;
    }
    case "adgOlogShadow": {
      const options: Option[] = [
        ...(s.progress > 0
          ? [
              {
                id: "progress",
                label: "Remove 2 progress from the main quest",
                effects: [
                  fx("adgRemoveProgress", {
                    value: 2,
                    text: "Mirkwood Olog-hai",
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        {
          id: "return",
          label:
            "Return the attacking enemy to the staging area after this attack",
          effects: [fx("adgReturnAfter", { player: p })],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Mirkwood Olog-hai · Remove 2 progress from the main quest, or return the attacking enemy to the staging area${seatLabel(s, p)}`,
        options,
        card(ADG.olog).shadow,
      );
      return true;
    }
    case "adgReturnAfter":
      if (s.combat) s.combat.returnToStaging = true;
      return true;
    // Lieutenants' attacks.
    case "adgBane": {
      const hand = seatView(s, p).hand;
      if (!hand.length) {
        log(
          s,
          `Bane of Amon Lanc: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      const u = hand[Math.floor(random(s) * hand.length)];
      const cost = Number(card(u.code).cost);
      const x = Number.isFinite(cost) ? cost : 0;
      const combat = s.combat;
      forOwner(s, p, () => discardHandCard(s, u.id, { encounterEffect: true }));
      if (combat && combat.enemyId === e.target) combat.attackBonus += x;
      log(
        s,
        `Bane of Amon Lanc: ${who(s, p)} ${verb(s, "discard")} ${name(u)} at random; it gets +${x} attack for this attack.`,
        "danger",
      );
      return true;
    }
    case "adgSorcerer": {
      const [c] = discardPlayerDeck(s, 1, p);
      if (!c) {
        log(
          s,
          `Sorcerer of Dol Guldur: ${who(s, p)} ${s.table ? "has" : "have"} no card in ${s.table ? "his" : "your"} deck.`,
        );
        return true;
      }
      const title = card(c).name;
      log(
        s,
        `Sorcerer of Dol Guldur: ${title} is discarded from the top of ${s.table ? `${seatName(s, p)}'s` : "your"} deck; each copy of it is discarded from play.`,
        "danger",
      );
      for (const x of playerOrder(s))
        forOwner(s, x, () => {
          for (const u of charactersOf(s, x))
            for (const a of [...u.attachments])
              if (!a.facedown && card(a.code).name === title)
                discardAttachment(s, u, a, false, false);
          for (const u of charactersOf(s, x).filter(
            (y) => card(y.code).name === title,
          ))
            discardCharacter(s, u);
        });
      return true;
    }
    case "adgMorlug": {
      const c = discardUntilEnemy(s, false);
      if (!c) {
        log(s, "Chieftain Morlug: no enemy is discarded.");
        return true;
      }
      enterEnemyEngaged(s, make(s, c), p);
      log(
        s,
        `Chieftain Morlug: ${card(c).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    // Host of Dol Guldur at the end of the encounter phase.
    case "adgArmyProgress":
      removeProgress(s, players(s), "Host of Dol Guldur");
      return true;
    // Locations.
    case "adgForestSearch": {
      const orcs = searchable(s, isOrcCode);
      if (!orcs.length) return true;
      choose(
        s,
        `Forest Battleground · Search for an Orc enemy and add it to the staging area${seatLabel(s, p)}`,
        orcs.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to the staging area`,
          effects: [fx("adgSearchTake", { code: c, player: p })],
        })),
        card(ADG.forest).text,
      );
      return true;
    }
    case "adgWoods": {
      const c = s.encounterDeck.shift();
      if (!c) return true;
      s.encounterDiscard.push(c);
      const x = Number(card(c).threat) || 0;
      for (const y of playerOrder(s))
        forOwner(s, y, () => raiseThreat(s, x, "encounter"));
      log(
        s,
        `Blackened Woods: ${card(c).name} is discarded from the encounter deck; each player raises his threat by ${x}.`,
        x ? "danger" : undefined,
      );
      return true;
    }
    case "adgTowerReveal":
      if (staged(s, ADG.sorcery)) prepend(s, fx("reveal", { player: first }));
      return true;
    // Power of Lórien's Response: cancel and discard a revealed encounter card.
    case "adgPowerCancel": {
      const c = e.code ?? "";
      if (!q.lorien) return true;
      q.lorien = null;
      addVictoryCard(s, ADG.power);
      s.encounterDiscard.push(c);
      log(
        s,
        `Power of Lórien is added to the victory display: ${card(c).name} is canceled and discarded.`,
        "good",
      );
      if (/When Revealed/i.test(card(c).text ?? ""))
        prepend(
          s,
          ...s.staging
            .filter((u) => live(u, ADG.sorcery))
            .map(() => fx("adgTowerReveal", { player: first })),
        );
      return true;
    }
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
/** A Dol Guldur location in the staging area outside its own stage. */
function sealed(s: GameState, u: Unit) {
  if (!s.attackDolGuldur || u.blanked) return false;
  if (!s.staging.some((x) => x.id === u.id)) return false;
  const stage = ADG_STAGE3_CODES.find((c) => ADG_STAGE3[c].location === u.code);
  return !!stage && !at(s, stage);
}

export const ATTACK_DOL_GULDUR_HOOKS: Batch4ScenarioHooks = {
  setup: setupAttackDolGuldur,
  advance,
  stageInfo: adgStageInfo,
  encounter,
  shadow,
  // Archery: Host of Dol Guldur X (the number of players), Amon Lanc Archer 2.
  combatBegin: (s) => {
    if (!s.attackDolGuldur) return;
    const archery = enemiesInPlay(s).reduce(
      (n, u) =>
        n +
        (u.blanked
          ? 0
          : u.code === ADG.army
            ? players(s)
            : u.code === ADG.archer
              ? 2
              : 0),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  // Host of Dol Guldur: at the end of the encounter phase, if it is staged.
  encounterEnd: (s) =>
    s.attackDolGuldur
      ? s.staging
          .filter((u) => live(u, ADG.army))
          .map(() => fx("adgArmyProgress", { player: firstPlayer(s) }))
      : [],
  roundEnd: (s) => {
    const q = s.attackDolGuldur;
    if (!q) return [];
    const first = firstPlayer(s);
    if (at(s, ADG.golden))
      return [
        fx("adgGoldenForced", { player: first }),
        fx("adgGoldenResponse", { player: first }),
      ];
    if (!atStage3(s)) return [];
    return [
      fx("adgWinCheck", { player: first }),
      fx("adgStageForced", { player: first }),
      fx("adgCityForced", { player: first }),
      fx("adgWinCheck", { player: first }),
      fx("adgRandomForced", { player: first }),
      fx("adgRotate", { player: first }),
    ];
  },
  progress: (s, amount, quest) => {
    const q = s.attackDolGuldur;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    // Fastness of Mirkwood: no more than 5 progress on the current quest this round.
    if (q.fastness === s.round) {
      const placed =
        q.questProgress?.round === s.round ? q.questProgress.amount : 0;
      return Math.max(0, Math.min(amount, 5 - placed));
    }
    return amount;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.attackDolGuldur;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    const placed =
      q.questProgress?.round === s.round ? q.questProgress.amount : 0;
    q.questProgress = { round: s.round, amount: placed + amount };
  },
  stats: (s, u) => {
    const q = s.attackDolGuldur;
    if (!q) return {};
    let attack = 0,
      defense = 0,
      will = 0;
    if (live(u, ADG.marauder)) {
      attack += u.resources;
      defense += u.resources;
    }
    for (const m of q.fastnessShadow)
      if (m.id === u.id && m.round === s.round && m.phase === phaseKey(s)) {
        attack += m.value;
        defense += m.value;
      }
    if (marked(q.rageShadow, s, u, true)) defense -= u.damage;
    if (
      q.rage?.round === s.round &&
      q.rage.phase === phaseKey(s) &&
      isCharacter(u) &&
      u.damage > 0
    )
      will -= 1;
    return attack || defense || will ? { attack, defense, will } : {};
  },
  threatBonus: (s, u) => {
    if (!s.attackDolGuldur || u.blanked) return 0;
    if (u.code === ADG.army) return players(s);
    if (u.code === ADG.forest)
      return Math.max(
        0,
        ...playerOrder(s).map((p) => seatView(s, p).allies.length),
      );
    if (u.code === ADG.road)
      return 2 * u.attachments.filter((a) => a.facedown).length;
    return 0;
  },
  // Each stage 3: its Lieutenant gets -1 engagement cost per progress there.
  engagementBonus: (s, u) =>
    s.attackDolGuldur && !u.blanked && stageLieutenant(s) === u.code
      ? -s.progress
      : 0,
  // Standard Game Mode: indestructible until the city strength is 0.
  indestructible: (s, u) =>
    !!s.attackDolGuldur &&
    !u.blanked &&
    ADG_LIEUTENANTS.includes(u.code) &&
    s.attackDolGuldur.cityStrength > 0,
  // Host of Lórien does not exhaust to quest.
  doesNotExhaustToQuest: (s, u) => !!s.attackDolGuldur && live(u, ADG.host),
  cannotAttach: (s, u) =>
    !!s.attackDolGuldur && (live(u, ADG.army) || live(u, ADG.beast)),
  // Beast of Taur-nu-Fuin: its shadow cards cannot be canceled.
  cannotCancel: (s, shadowEffect) => {
    if (!s.attackDolGuldur || !shadowEffect || !s.combat) return false;
    const enemy = get(s, s.combat.enemyId);
    return !!enemy && live(enemy, ADG.beast);
  },
  cannotReady: (s, u) =>
    !!s.attackDolGuldur && marked(s.attackDolGuldur.unready, s, u),
  cannotPlayerReady: (s) => s.attackDolGuldur?.despair === s.round,
  // Gate of Dol Guldur: no more than 1 threat reduced by player cards a round.
  threatReduction: (s, amount, reason) => {
    const q = s.attackDolGuldur;
    if (!q || reason !== "player-card" || !staged(s, ADG.gate)) return amount;
    const p = activeSeat(s);
    const entry = q.threatReduced.find(
      (m) => m.player === p && m.round === s.round,
    );
    const allowed = Math.max(0, Math.min(amount, 1 - (entry?.amount ?? 0)));
    if (allowed < amount)
      log(
        s,
        "Gate of Dol Guldur: each player's threat cannot be reduced by more than 1 each round by player card effects.",
      );
    if (entry) entry.amount += allowed;
    else if (allowed)
      q.threatReduced.push({ player: p, round: s.round, amount: allowed });
    q.threatReduced = q.threatReduced.filter((m) => m.round === s.round);
    return allowed;
  },
  // Dungeon Door: no more than 1 damage healed from each character each round.
  healLimit: (s, u) => {
    const q = s.attackDolGuldur;
    if (!q || !isCharacter(u) || !staged(s, ADG.door)) return undefined;
    const done =
      q.healed.find((m) => m.id === u.id && m.round === s.round)?.amount ?? 0;
    return Math.max(0, 1 - done);
  },
  healed: (s, u, amount) => {
    const q = s.attackDolGuldur;
    if (!q || !isCharacter(u) || amount <= 0) return;
    q.healed = q.healed.filter((m) => m.round === s.round);
    const entry = q.healed.find((m) => m.id === u.id);
    if (entry) entry.amount += amount;
    else q.healed.push({ id: u.id, round: s.round, amount });
  },
  // The Sorcerer's Tower: after a 'when revealed' effect is canceled.
  whenRevealedCancelled: (s) => {
    if (!s.attackDolGuldur) return;
    prepend(
      s,
      ...s.staging
        .filter((u) => live(u, ADG.sorcery))
        .map(() => fx("adgTowerReveal", { player: firstPlayer(s) })),
    );
  },
  // The Shadow Road: an event played during the quest phase is attached to it.
  eventPlayed: (s, u) => {
    const q = s.attackDolGuldur;
    if (!q || phaseKey(s) !== "quest" || !staged(s, ADG.road)) return;
    q.shadowRoad.push(u.id);
  },
  eventDestination: (s, u, player) => {
    const q = s.attackDolGuldur;
    if (!q || !q.shadowRoad.includes(u.id)) return false;
    q.shadowRoad = q.shadowRoad.filter((id) => id !== u.id);
    const road = s.staging.find((x) => live(x, ADG.road));
    if (!road) return false;
    road.attachments.push({
      id: u.id,
      code: u.code,
      exhausted: false,
      facedown: true,
      owner: u.owner ?? player,
    });
    log(
      s,
      "The Shadow Road: the event played during the quest phase is attached to it facedown (+2 threat).",
      "danger",
    );
    return true;
  },
  // Power of Lórien: cancel and discard an encounter card just revealed.
  revealOptions: (s, code, revealOrigin) => {
    const q = s.attackDolGuldur;
    if (!q?.lorien || revealOrigin !== "encounter") return [];
    if (!playerOrder(s).includes(q.lorien.player)) return [];
    if (/cannot be cancel/i.test(card(code).text ?? "")) return [];
    return [
      {
        id: "adg-power",
        label:
          "Power of Lórien · Add it to the victory display to cancel and discard this card",
        code: ADG.power,
        effects: [fx("adgPowerCancel", { code, player: q.lorien.player })],
      },
    ];
  },
  travelProblem: (s, u) => {
    if (!sealed(s, u)) return null;
    const stage = ADG_STAGE3_CODES.find(
      (c) => ADG_STAGE3[c].location === u.code,
    )!;
    return `${card(u.code).name}: the players cannot travel here unless they are at stage ${ADG_STAGE3[stage].back}.`;
  },
  locationProgressBlocked: (s, u) => sealed(s, u),
  // Siege values: each location explored and enemy destroyed this round.
  explored: (s, u) => {
    const q = s.attackDolGuldur;
    if (!q) return;
    const value = ADG_SIEGE[u.code] ?? 0;
    if (value) {
      q.siege =
        q.siege.round === s.round
          ? { round: s.round, value: q.siege.value + value }
          : { round: s.round, value };
      log(s, `${card(u.code).name} is explored: siege ${value}.`, "good");
    }
    const first = firstPlayer(s);
    if (u.code === ADG.forest && !u.blanked)
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("adgForestSearch", { player })),
        fx("adgShuffle", { player: first }),
      );
    if (u.code === ADG.woods && !u.blanked)
      prepend(s, fx("adgWoods", { player: first }));
  },
  hostLeaves: (s, u, destruction) => {
    const q = s.attackDolGuldur;
    if (!q || !destruction || !isEnemy(u)) return;
    const value = ADG_SIEGE[u.code] ?? 0;
    if (!value) return;
    q.siege =
      q.siege.round === s.round
        ? { round: s.round, value: q.siege.value + value }
        : { round: s.round, value };
    log(s, `${name(u)} is destroyed: siege ${value}.`, "good");
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.attackDolGuldur || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    // Mirkwood Olog-hai: 1 progress for each excess point of damage.
    if (enemy && live(enemy, ADG.olog)) {
      const excess = u.damage - stats(s, u).health;
      if (excess > 0)
        prepend(
          s,
          fx("adgRemoveProgress", {
            value: excess,
            text: "Mirkwood Olog-hai",
            player: p,
          }),
        );
    }
    if (c.adgWoods) {
      c.adgWoods = false;
      prepend(
        s,
        fx("adgRemoveProgress", {
          value: 3,
          text: "Blackened Woods",
          player: p,
        }),
      );
    }
  },
  characterLeft: (s, u, _controller, destination) => {
    const q = s.attackDolGuldur;
    // Host of Lórien leaves play: it is removed from the game.
    if (!q || u.code !== ADG.host) return;
    if (destination === "discard" && takeFrom(s.encounterDiscard, ADG.host)) {
      q.removed.push(ADG.host);
      log(s, "Host of Lórien is removed from the game.");
    }
  },
  engaged: (s, u) => {
    if (!s.attackDolGuldur || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === ADG.warg)
      prepend(
        s,
        fx("adgChoice", {
          target: u.id,
          code: ADG.warg,
          value: 1,
          text: "Discard an attachment you control",
          flag: charactersOf(s, p).some((x) =>
            x.attachments.some((a) => !a.facedown),
          ),
          effects: [
            fx("adgDiscardAttachment", { text: "Battle Warg", player: p }),
          ],
          player: p,
        }),
      );
    if (u.code === ADG.archer)
      prepend(
        s,
        fx("adgChoice", {
          target: u.id,
          code: ADG.archer,
          value: 2,
          text: "Deal 2 damage to an ally you control",
          flag: seatView(s, p).allies.length > 0,
          effects: [fx("adgArcherDamage", { player: p })],
          player: p,
        }),
      );
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.attackDolGuldur || enemy.blanked) return;
    switch (enemy.code) {
      case ADG.bane:
        prepend(s, fx("adgBane", { target: enemy.id, player }));
        return;
      case ADG.sorcerer:
        prepend(s, fx("adgSorcerer", { target: enemy.id, player }));
        return;
      case ADG.morlug:
        prepend(s, fx("adgMorlug", { target: enemy.id, player }));
        return;
      case ADG.dweller:
        prepend(s, fx("adgDiscardAlly", { text: "Dungeon Dweller", player }));
        return;
      case ADG.marauder:
        prepend(
          s,
          fx("adgChoice", {
            target: enemy.id,
            code: ADG.marauder,
            value: 1,
            text: "Place 1 resource on Dol Guldur Marauder",
            effects: [fx("adgMarauder", { target: enemy.id, player })],
            player,
          }),
        );
        return;
      case ADG.beast:
        prepend(
          s,
          fx("adgChoice", {
            target: enemy.id,
            code: ADG.beast,
            value: 2,
            text: "Deal it an additional shadow card",
            flag: s.encounterDeck.length > 0,
            effects: [fx("adgBeastShadow", { target: enemy.id, player })],
            player,
          }),
        );
        return;
    }
  },
  // Fastness of Mirkwood: surge while Dol Guldur's city strength is 5 or lower.
  revealedSurge: (s, code) =>
    !!s.attackDolGuldur &&
    code === ADG.fastness &&
    s.attackDolGuldur.cityStrength <= 5,
  playerEliminated: (s, player) => {
    const q = s.attackDolGuldur;
    // Power of Lórien leaves play with the player who controls it.
    if (q?.lorien?.player === player) {
      q.lorien = null;
      s.encounterDiscard.push(ADG.power);
      log(s, "Power of Lórien is discarded with its controller.");
    }
  },
  effect: adgEffect,
  sharedEffect: (e) =>
    [
      "adgShuffle",
      "adgAdvance",
      "adgGoldenForced",
      "adgGoldenResponse",
      "adgGoldenAid",
      "adgCrossing",
      "adgHostOffer",
      "adgTakeHost",
      "adgPowerOffer",
      "adgPowerTake",
      "adgPowerDiscard",
      "adgChooseStage3",
      "adgEnterStage3",
      "adgWinCheck",
      "adgStageForced",
      "adgPay",
      "adgBonusOffer",
      "adgPenalty",
      "adgBonus",
      "adgSlay",
      "adgCityForced",
      "adgRandomForced",
      "adgRotate",
      "adgTreacheryDone",
      "adgServant",
      "adgServantAttack",
      "adgRage",
      "adgDespairLock",
      "adgFastness",
      "adgArmyProgress",
      "adgWoods",
      "adgTowerReveal",
    ].includes(e.kind),
};
