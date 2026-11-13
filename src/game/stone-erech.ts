import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  damage,
  depositInFlightEncounterCards,
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
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { dealEnemyShadows } from "./considered-engagement";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  NIGHT_LIMIT,
  SE,
  SE_NIGHTS,
  STONE_ERECH_QUESTS,
  STONE_ERECH_RECIPES,
  isMidnight,
  isOathbreaker,
  isUndead,
  nightLevel,
  printedSpectral,
  stoneErechStageInfo,
} from "./stone-erech-support";
export * from "./stone-erech-support";

const TREACHERIES: readonly string[] = [
  SE.deadRide,
  SE.groping,
  SE.throng,
  SE.driven,
  SE.gloaming,
  SE.murmurs,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code && !l.blanked);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const neckInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some((l) => l.code === SE.neck);
const stoneUnit = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].find((l) => l.code === SE.stone);
const derufinUnit = (s: GameState) =>
  globalCharacters(s).find((u) => u.code === SE.derufin);
const engagedWithLord = (s: GameState, p: number) =>
  seatView(s, p).engaged.some((e) => live(e, SE.lord));
const driven = (u: Unit) =>
  u.attachments.some((a) => a.code === SE.driven && !a.blanked);
const NIGHT_NAMES = ["Eventide", "Dusk", "Midnight"];
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** The last (topmost) Undead enemy in the encounter discard pile. */
function topmostUndead(s: GameState) {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (isUndead(s.encounterDiscard[i]))
      return s.encounterDiscard.splice(i, 1)[0];
  return undefined;
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupStoneErech(s: GameState) {
  const r = STONE_ERECH_RECIPES.find((r) => r.mode === "standard")!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  const aside = section("sharedSetAside");
  s.activeLocation = make(s, SE.neck);
  s.stoneErech = {
    currentQuest: SE.disappearance,
    advancing: false,
    setAside: aside.filter((c) => c !== SE.neck && c !== SE.eventide),
    night: make(s, SE.eventide),
    derufin: "aside",
    resolving: [],
    noEventsRound: null,
    skipTravel: false,
    skipPlanning: false,
    noResourcesRound: null,
    unspectral: [],
  };
  log(
    s,
    "The Disappearance: Tarlang's Neck is the active location; Derufin, The Lord of the Dead, The Stone of Erech, Dusk and Midnight are set aside, and Eventide is put into play next to the quest.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.stoneErech;
  if (!q) return false;
  const goal = stoneErechStageInfo(s)?.quest ?? 0;
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
  // 1B: the players cannot defeat this stage while Tarlang's Neck is in play.
  if (s.stage === 1 && stageLive(s) && neckInPlay(s)) return true;
  if (s.stage === STONE_ERECH_QUESTS.length) {
    win(s);
    s.reason =
      "The Shadow Host is defeated: the players have escaped the Blackroot Vale with Derufin.";
    return true;
  }
  q.advancing = true;
  prepend(s, fx("seDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
/** Eventide and Dusk move on as soon as they have 4 progress. */
function nightCheck(s: GameState) {
  const q = s.stoneErech;
  if (!q || s.status !== "playing") return;
  const index = SE_NIGHTS.indexOf(q.night.code);
  if (index < 0 || index >= SE_NIGHTS.length - 1) return;
  if (q.night.progress < NIGHT_LIMIT) return;
  const next = SE_NIGHTS[index + 1];
  (s.victoryCards ??= []).push(q.night.code);
  q.setAside = q.setAside.filter((c) => c !== next);
  q.night = make(s, next);
  log(
    s,
    `${NIGHT_NAMES[index]} has ${NIGHT_LIMIT} progress: it is added to the victory display and ${NIGHT_NAMES[index + 1]} is put into play.`,
    "chapter",
  );
}
function addNightProgress(s: GameState, amount: number, why: string) {
  const q = s.stoneErech;
  if (!q || amount <= 0) return;
  q.night.progress += amount;
  log(
    s,
    `${why}: ${amount} progress ${amount === 1 ? "is" : "are"} added to ${card(q.night.code).name} (${q.night.progress}).`,
    "danger",
  );
  nightCheck(s);
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.stoneErech;
  if (!q) return false;
  const player = activeSeat(s);
  if (code === SE.restless || code === SE.shadowMan || code === SE.vale) {
    if (!fromReveal) return true;
    const target = [...s.staging].reverse().find((u) => u.code === code);
    prepend(
      s,
      fx(
        code === SE.restless
          ? "seRestless"
          : code === SE.shadowMan
            ? "seShadowMan"
            : "seVale",
        { target: target?.id, player },
      ),
    );
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
    fx("seTreachery", { code, source: u.id, player }),
    fx("seTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.stoneErech) return false;
  const level = nightLevel(s);
  switch (code) {
    case SE.banks:
      c.seBanks = true;
      return true;
    case SE.graves: {
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u && stats(s, u).will === 0);
      for (const u of defenders) {
        log(
          s,
          `Blackroot Graves: ${name(u)} has no willpower and takes 2 damage.`,
          "danger",
        );
        forOwner(s, ownerOf(s, u), () => damage(s, u.id, 2, {}));
      }
      return true;
    }
    case SE.shadowMan:
    case SE.throng:
      c.attackBonus += 1 + level;
      log(
        s,
        `${card(code).name}: the attacking enemy gets +${1 + level} attack.`,
        "danger",
      );
      return true;
    case SE.shade: {
      const enemy = get(s, c.enemyId);
      if (!enemy) return true;
      const dealt = dealEnemyShadows(s, enemy, 1 + level);
      log(
        s,
        `Regretful Shade: the attacking enemy is dealt ${dealt.length} additional shadow card${dealt.length === 1 ? "" : "s"}.`,
        "danger",
      );
      prepend(s, ...dealt.map((x) => fx("shadowReveal", { code: x })));
      return true;
    }
    case SE.murmurs:
      if (level >= 1) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          "Murmurs of Dread: the attacking enemy makes an additional attack after this one.",
          "danger",
        );
      }
      return true;
  }
  return false;
}
/** "Starting with the first player, each player searches ... reveals it." */
function searchEffects(s: GameState, kind: "oathbreaker" | "undead") {
  return playerOrder(s).map((player) => fx("seSearch", { text: kind, player }));
}
function treachery(s: GameState, code: string, source: string) {
  const first = firstPlayer(s);
  switch (code) {
    case SE.deadRide: {
      const limit = 2 + nightLevel(s);
      const victims = globalCharacters(s).filter(
        (u) => stats(s, u).will < limit,
      );
      log(
        s,
        `The Dead Ride Behind: each character with less than ${limit} willpower takes 1 damage${victims.length ? ` (${victims.map((u) => name(u)).join(", ")})` : ""}.`,
        "danger",
      );
      for (const u of victims)
        forOwner(s, ownerOf(s, u), () => damage(s, u.id, 1, {}));
      return;
    }
    case SE.groping: {
      const solo = playerOrder(s).length === 1;
      choose(s, "Groping Horror · The first player chooses", [
        {
          id: "travel",
          label: "Skip the next travel phase",
          effects: [fx("seSkipTravel", { player: first })],
        },
        {
          id: "hands",
          label: solo
            ? "Discard your hand"
            : "Each player passes his hand to the player on his left",
          effects: [fx("seHands", { player: first })],
        },
      ]);
      return;
    }
    case SE.throng:
      prepend(
        s,
        ...searchEffects(s, "undead"),
        fx("seShuffle", { player: first }),
      );
      return;
    case SE.driven: {
      const heroes = seatView(s, first).heroes;
      if (!heroes.length) return;
      forOwner(s, first, () =>
        choose(
          s,
          `Driven by Fear · Attach to a hero you control${seatLabel(s, first)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("seAttach", { target: h.id, source, player: first })],
          })),
          "Attached character's willpower is reduced to 0 and its text box is blank.",
        ),
      );
      return;
    }
    case SE.gloaming:
      addNightProgress(s, 1, "The Gloaming");
      return;
    case SE.murmurs: {
      const characters = globalCharacters(s);
      for (const u of characters) u.roundWill = (u.roundWill ?? 0) - 1;
      log(
        s,
        "Murmurs of Dread: all characters get -1 willpower until the end of the round.",
        "danger",
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function stoneErechEffect(s: GameState, e: Effect): boolean {
  const q = s.stoneErech;
  if (!q || !e.kind.startsWith("se")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "seStageOne":
      log(
        s,
        "The Disappearance: 1 encounter card per player is revealed.",
        "chapter",
      );
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      return true;
    case "seDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("seNextStage", { player: first }));
      return true;
    }
    case "seNextStage":
      q.advancing = false;
      if (s.stage >= STONE_ERECH_QUESTS.length) return true;
      s.stage += 1;
      q.currentQuest = STONE_ERECH_QUESTS[s.stage - 1].code;
      s.progress = 0;
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      prepend(
        s,
        fx(s.stage === 2 ? "seTerrorReveal" : "seHostReveal", {
          player: first,
        }),
      );
      return true;
    case "seTerrorReveal": {
      const i = q.setAside.indexOf(SE.stone);
      if (i < 0) return true;
      q.setAside.splice(i, 1);
      const stone = make(s, SE.stone);
      s.staging.push(stone);
      const j = q.setAside.indexOf(SE.derufin);
      if (j >= 0) {
        q.setAside.splice(j, 1);
        const d = make(s, SE.derufin);
        stone.attachments.push({
          id: d.id,
          code: SE.derufin,
          exhausted: false,
        });
        q.derufin = "attached";
      }
      log(
        s,
        "Terror of the Dead: The Stone of Erech is added to the staging area with Derufin attached.",
        "chapter",
      );
      return true;
    }
    case "seHostReveal":
      prepend(
        s,
        ...searchEffects(s, "oathbreaker"),
        fx("seLord", { player: first }),
      );
      return true;
    case "seLord": {
      const i = q.setAside.indexOf(SE.lord);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        const lord = make(s, SE.lord);
        s.staging.push(lord);
        enemyAddedToStaging(s, lord);
        log(
          s,
          "The Shadow Host: The Lord of the Dead is added to the staging area.",
          "chapter",
        );
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "seShuffle":
      shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    case "seSearch": {
      const match = e.text === "undead" ? isUndead : isOathbreaker;
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
            effects: [fx("seSearchReveal", { code, text: zone, player: p })],
          });
      const kind = e.text === "undead" ? "Undead" : "Oathbreaker";
      if (!options.length) {
        log(
          s,
          `${who(s, p)} find${s.table ? "s" : ""} no ${kind} enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Search for an ${kind} enemy${seatLabel(s, p)}`,
          options,
          "Reveal it and add it to the staging area.",
        ),
      );
      return true;
    }
    case "seSearchReveal": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const i = pile.lastIndexOf(e.code!);
      if (i < 0) return true;
      pile.splice(i, 1);
      log(
        s,
        `${who(s, p)} reveal${s.table ? "s" : ""} ${card(e.code!).name} from the ${e.text === "deck" ? "encounter deck" : "discard pile"}.`,
        "danger",
      );
      prepend(
        s,
        fx("revealCard", {
          code: e.code,
          revealOrigin: "encounter",
          player: p,
        }),
      );
      return true;
    }
    case "seTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code, held.id);
      return true;
    }
    case "seTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "seAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0 || !u) return true;
      const held = q.resolving.splice(i, 1)[0];
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(u)}.`, "danger");
      return true;
    }
    case "seRestless": {
      const code = topmostUndead(s);
      if (!code) {
        log(
          s,
          "Restless Dead: no Undead enemy is in the encounter discard pile.",
        );
        return true;
      }
      const x = make(s, code);
      s.staging.push(x);
      enemyAddedToStaging(s, x);
      log(
        s,
        `Restless Dead: ${name(x)} returns from the encounter discard pile to the staging area.`,
        "danger",
      );
      return true;
    }
    case "seShadowMan":
      q.noEventsRound = s.round;
      log(
        s,
        "Shadow-man: the players cannot play events until the end of the round.",
        "danger",
      );
      return true;
    case "seVale": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      const old = allActiveLocations(s).filter((l) => l.id !== u.id);
      s.staging = s.staging.filter((l) => l.id !== u.id);
      s.staging.push(...old);
      s.activeLocation = u;
      s.extraActiveLocations = [];
      log(
        s,
        `Vale of Shadows becomes the active location${old.length ? `; ${old.map((l) => name(l)).join(" and ")} return${old.length === 1 ? "s" : ""} to the staging area` : ""}.`,
        "danger",
      );
      return true;
    }
    case "seSkipTravel":
      q.skipTravel = true;
      log(s, "Groping Horror: the players will skip the next travel phase.");
      return true;
    case "seHands": {
      const order = playerOrder(s);
      if (order.length === 1) {
        forOwner(s, order[0], () => {
          const count = s.hand.length;
          for (const h of [...s.hand])
            discardHandCard(s, h.id, { encounterEffect: true });
          log(
            s,
            `Groping Horror: you discard your hand (${count} card${count === 1 ? "" : "s"}).`,
            "danger",
          );
        });
        return true;
      }
      // Read and write each hand in its own seat: the active seat's hand
      // lives on the live state until it is synced back to the table.
      const hands = order.map((player) => {
        let cards: Unit[] = [];
        forOwner(s, player, () => {
          cards = [...s.hand];
        });
        return cards;
      });
      order.forEach((_player, i) =>
        forOwner(s, order[(i + 1) % order.length], () => {
          s.hand = hands[i];
        }),
      );
      log(
        s,
        "Groping Horror: each player passes his hand to the player on his left.",
        "danger",
      );
      return true;
    }
    case "seNeck":
      choose(
        s,
        "Tarlang's Neck · The players choose",
        [
          {
            id: "end",
            label: "Immediately end the encounter phase",
            effects: [fx("seNeckEnd", { player: first })],
          },
          {
            id: "engage",
            label: "The first player engages every enemy in the staging area",
            effects: [fx("seNeckEngage", { player: first })],
          },
        ],
        "Forced: at the beginning of the encounter phase, while Tarlang's Neck is the active location.",
      );
      return true;
    case "seNeckEnd":
      log(s, "Tarlang's Neck: the encounter phase ends immediately.", "danger");
      s.queue = s.queue.filter(
        (x) =>
          ![
            "automaticEngagement",
            "engagementRound",
            "engagementAllAreas",
          ].includes(x.kind),
      );
      prepend(s, fx("phaseEnd"), fx("startCombat"));
      return true;
    case "seNeckEngage": {
      const enemies = s.staging.filter(
        (x) => card(x.code).type_code === "enemy",
      );
      log(
        s,
        `Tarlang's Neck: ${who(s, first)} engage${s.table ? "s" : ""} every enemy in the staging area${enemies.length ? "" : " (there is none)"}.`,
        "danger",
      );
      forOwner(s, first, () => {
        for (const x of enemies)
          if (s.staging.some((y) => y.id === x.id)) engage(s, x);
      });
      return true;
    }
    case "seTerror":
      choose(
        s,
        "Terror of the Dead · The players choose",
        [
          {
            id: "planning",
            label: "Each player skips the next planning phase",
            effects: [fx("seSkipPlanning", { player: first })],
          },
          {
            id: "resources",
            label: "Heroes do not collect resources this round",
            effects: [fx("seNoResources", { player: first })],
          },
        ],
        "Forced: at the beginning of each round.",
      );
      return true;
    case "seSkipPlanning":
      q.skipPlanning = true;
      log(
        s,
        "Terror of the Dead: each player will skip the next planning phase.",
      );
      return true;
    case "seNoResources":
      q.noResourcesRound = s.round;
      log(s, "Terror of the Dead: heroes do not collect resources this round.");
      return true;
    case "seNightProgress": {
      const night = q.night;
      night.progress += 1;
      log(
        s,
        `${card(night.code).name}: 1 progress is placed at the end of the round (${night.progress}).`,
      );
      if (night.code === SE.midnight) {
        const amount = night.progress;
        for (const player of playerOrder(s))
          forOwner(s, player, () => raiseThreat(s, amount, "encounter"));
        log(
          s,
          `Midnight: each player raises their threat by ${amount}.`,
          "danger",
        );
      } else nightCheck(s);
      return true;
    }
    case "seNightAdd":
      addNightProgress(s, 1, e.code ? card(e.code).name : "The Night");
      return true;
    case "seDerufin": {
      const stone = (u && u.code === SE.stone ? u : undefined) ?? stoneUnit(s);
      const a = stone?.attachments.find((x) => x.code === SE.derufin);
      if (!stone || !a) return true;
      stone.attachments = stone.attachments.filter((x) => x.id !== a.id);
      forOwner(s, first, () => {
        const d = make(s, SE.derufin);
        d.id = a.id;
        d.owner = first;
        s.allies.push(d);
      });
      q.derufin = "controlled";
      log(
        s,
        `Derufin: ${who(s, first)} gain${s.table ? "s" : ""} control of Derufin.`,
        "good",
      );
      return true;
    }
    case "seStoneTravel": {
      const tired = globalCharacters(s).filter(
        (x) => !x.exhausted && stats(s, x).will < 2,
      );
      for (const x of tired)
        forOwner(s, ownerOf(s, x), () => exhaustCharacter(s, x));
      log(
        s,
        `The Stone of Erech: each character with less than 2 willpower is exhausted${tired.length ? ` (${tired.map((x) => name(x)).join(", ")})` : ""}.`,
        "danger",
      );
      return true;
    }
    case "seGraves": {
      const code = topmostUndead(s);
      if (!code) {
        log(
          s,
          "Blackroot Graves: no Undead enemy is in the encounter discard pile.",
        );
        return true;
      }
      const x = make(s, code);
      s.staging.push(x);
      log(
        s,
        `Blackroot Graves: ${name(x)} returns to play engaged with ${who(s, first)}.`,
        "danger",
      );
      forOwner(s, first, () => engage(s, x));
      return true;
    }
    case "seHaunted":
      if (u && !u.exhausted) {
        forOwner(s, p, () => exhaustCharacter(s, u));
        log(s, `Haunted Valley: ${name(u)} is exhausted.`);
      }
      return true;
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

function hauntedProblem(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || u.code !== SE.haunted) return null;
  if (!s.stoneErech) return "No action.";
  if (s.phase !== "planning")
    return "Haunted Valley's action is a Planning Action.";
  if (u.blanked || !s.staging.some((x) => x.id === u.id))
    return "Haunted Valley must be in the staging area.";
  if (!s.heroes.some((h) => canExhaust(h)))
    return "You control no ready hero to exhaust.";
  return null;
}
function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.stoneErech || skipped || !combat.seBanks || !combat.seDestroyed)
    return [];
  return [
    fx("seNightAdd", {
      code: SE.banks,
      player: combat.attackPlayer ?? firstPlayer(s),
    }),
  ];
}

export const STONE_ERECH_HOOKS: Batch4ScenarioHooks = {
  setup: setupStoneErech,
  openingHandsKept: (s) => {
    if (!s.stoneErech || s.round > 0) return false;
    prepend(s, fx("seStageOne", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: stoneErechStageInfo,
  check: nightCheck,
  encounter,
  shadow,
  encounterBegin: (s) => {
    if (s.stoneErech && activeIs(s, SE.neck))
      prepend(s, fx("seNeck", { player: firstPlayer(s) }));
  },
  resourceStart: (s) =>
    s.stoneErech && s.stage === 2 && stageLive(s)
      ? [fx("seTerror", { player: firstPlayer(s) })]
      : [],
  planningBegin: (s) => {
    const q = s.stoneErech;
    if (!q?.skipPlanning) return;
    q.skipPlanning = false;
    log(s, "Terror of the Dead: each player skips this planning phase.");
    prepend(s, fx("phaseEnd"), fx("startQuest"));
  },
  cannotCollectResources: (s) =>
    !!s.stoneErech && s.stoneErech.noResourcesRound === s.round,
  travelBegin: (s) => {
    const q = s.stoneErech;
    if (!q?.skipTravel) return;
    q.skipTravel = false;
    log(s, "Groping Horror: the players skip this travel phase.");
    prepend(s, fx("phaseEnd"), fx("startEncounter"));
  },
  stats: (s, u) => {
    if (!s.stoneErech) return {};
    const level = nightLevel(s);
    if (live(u, SE.captain)) return { attack: level, defense: level };
    if (live(u, SE.derufin)) return { will: -level };
    return {};
  },
  willpowerOverride: (s, u) =>
    s.stoneErech && isHero(u) && driven(u) ? 0 : undefined,
  threatBonus: (s, u) => {
    if (!s.stoneErech) return 0;
    const level = nightLevel(s);
    // The Stone of Erech: X is twice the number of players in the game.
    if (live(u, SE.stone)) return 2 * playerOrder(s).length;
    if (live(u, SE.dwimorberg)) return 2 * level;
    if (live(u, SE.whisperer)) return level;
    if (
      activeIs(s, SE.banks) &&
      isLocation(u) &&
      s.staging.some((x) => x.id === u.id)
    )
      return -1;
    return 0;
  },
  locationQuestBonus: (s, u) =>
    s.stoneErech && live(u, SE.vale) ? 2 * nightLevel(s) : 0,
  immune: (s, u) => !!s.stoneErech && live(u, SE.stone),
  cannotReady: (s, u) =>
    !!s.stoneErech &&
    activeIs(s, SE.stone) &&
    isCharacter(u) &&
    stats(s, u).will < 2,
  characterBlanked: (s, u) =>
    !!s.stoneErech &&
    isCharacter(u) &&
    ((isHero(u) && driven(u)) || engagedWithLord(s, ownerOf(s, u))),
  resourceIconsLost: (s, u) =>
    !!s.stoneErech &&
    isHero(u) &&
    !u.exhausted &&
    s.staging.some((l) => live(l, SE.haunted)),
  travelEffects: (s, u) =>
    s.stoneErech && live(u, SE.stone)
      ? [fx("seStoneTravel", { player: firstPlayer(s) })]
      : undefined,
  travelEntered: (s, u, actualTravel) => {
    if (
      s.stoneErech &&
      actualTravel &&
      u.code === SE.stone &&
      s.stoneErech.derufin === "attached"
    )
      prepend(s, fx("seDerufin", { target: u.id, player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (s.stoneErech && live(u, SE.graves))
      prepend(s, fx("seGraves", { player: firstPlayer(s) }));
  },
  roundEnd: (s) =>
    s.stoneErech ? [fx("seNightProgress", { player: firstPlayer(s) })] : [],
  // 3B: no progress unless the players control Derufin.
  progress: (s, amount, quest) =>
    s.stoneErech &&
    s.stage === 3 &&
    quest.code === s.stoneErech.currentQuest &&
    !derufinUnit(s)
      ? 0
      : amount,
  // 3B: Midnight. Battle.
  questStat: (s) =>
    s.stoneErech && s.stage === 3 && stageLive(s) && isMidnight(s)
      ? "attack"
      : undefined,
  attackStat: (s, enemy) =>
    s.stoneErech &&
    !enemy.blanked &&
    printedSpectral(enemy) &&
    !s.stoneErech.unspectral.includes(enemy.id)
      ? "will"
      : undefined,
  attackersDeclared: (s, enemy, ids) => {
    const q = s.stoneErech;
    if (
      q &&
      isOathbreaker(enemy) &&
      !q.unspectral.includes(enemy.id) &&
      ids.some((id) =>
        get(s, id)?.attachments.some((a) => a.code === SE.relic && !a.blanked),
      )
    ) {
      q.unspectral.push(enemy.id);
      log(
        s,
        `Relic from the Dark Years: ${name(enemy)} loses the Spectral keyword until the end of the phase.`,
        "good",
      );
    }
    return [];
  },
  combatEnd: (s) => {
    if (s.stoneErech) s.stoneErech.unspectral = [];
  },
  playProblem: (s, code) =>
    s.stoneErech &&
    s.stoneErech.noEventsRound === s.round &&
    card(code).type_code === "event"
      ? "Shadow-man: the players cannot play events until the end of the round."
      : null,
  revealedSurge: (s, code) =>
    !!s.stoneErech && code === SE.groping && isMidnight(s),
  revealedDoomed: (s, code) =>
    s.stoneErech && code === SE.whisperer && isMidnight(s) ? 2 : 0,
  cannotCancel: (s, shadowEffect, code) =>
    !!s.stoneErech &&
    isMidnight(s) &&
    ((!shadowEffect && code === SE.throng) ||
      (!!shadowEffect && code === SE.murmurs)),
  claimableObjective: (s, u) =>
    !!s.stoneErech &&
    u.code === SE.relic &&
    isMidnight(s) &&
    s.staging.some((x) => x.id === u.id),
  claim: (s, objective, hero) => {
    if (!s.stoneErech || objective.code !== SE.relic) return false;
    s.staging = s.staging.filter((x) => x.id !== objective.id);
    hero.attachments.push({
      id: objective.id,
      code: objective.code,
      exhausted: false,
    });
    log(s, `${name(hero)} claims Relic from the Dark Years.`, "good");
    return true;
  },
  abilityLabel: (code) =>
    code === SE.haunted
      ? "Haunted Valley · Planning Action: exhaust a hero you control"
      : undefined,
  abilityProblem: hauntedProblem,
  ability: (s, u, attachmentId) => {
    if (u.code !== SE.haunted || hauntedProblem(s, u, attachmentId))
      return false;
    const p = activeSeat(s);
    choose(
      s,
      `Haunted Valley · Exhaust a hero you control${seatLabel(s, p)}`,
      s.heroes
        .filter((h) => canExhaust(h))
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("seHaunted", { target: h.id, player: p })],
        })),
      "An exhausted hero keeps its resource icons while Haunted Valley is in the staging area.",
    );
    return true;
  },
  characterLeft: (s, u) => {
    const q = s.stoneErech;
    if (!q || u.code !== SE.derufin || q.derufin !== "controlled") return;
    if (u.blanked) {
      q.derufin = "lost";
      log(
        s,
        "Derufin leaves play while his text box is blank: the players can no longer place progress on The Shadow Host.",
        "danger",
      );
      return;
    }
    lose(s, "Derufin has left play. The players lose the game.");
  },
  characterDestroyed: (s, u, context) => {
    if (
      s.stoneErech &&
      s.combat &&
      isCharacter(u) &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.seDestroyed = true;
  },
  attackFinished,
  effect: stoneErechEffect,
  sharedEffect: (e) =>
    [
      "seStageOne",
      "seDefeatQuest",
      "seNextStage",
      "seTerrorReveal",
      "seHostReveal",
      "seLord",
      "seShuffle",
      "seGloaming",
      "seShadowMan",
      "seSkipTravel",
      "seNeckEnd",
      "seSkipPlanning",
      "seNoResources",
      "seNightProgress",
      "seNightAdd",
      "seStoneTravel",
    ].includes(e.kind),
};
