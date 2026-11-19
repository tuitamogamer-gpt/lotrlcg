/**
 * A Journey to Rhosgobel's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rules and Nightmare encounter cards, composed with the scenario's
 * own rules through batch4Scenario while a Nightmare mode game is played.
 * Effects use the "nrh" prefix (the setup step is in nightmareSetup).
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  shuffle,
} from "./core";
import { discardAttachment, engage } from "./board";
import {
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { hasKeyword } from "./table";
import { hasTrait } from "./expansion-passives";
import { NIGHTMARE_SOM as G, nightmareLive } from "./nightmare";
import { RHOS, type HealSource } from "./rhosgobel";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  several,
  state,
  traitOf,
} from "./nightmare-core";

/** Lasting effects of A Journey to Rhosgobel's Nightmare cards. */
export interface NightmareRhosState {
  /** The Creature enemies revealed during the quest phase of a round (the first gains surge). */
  creatures?: { round: number; count: number };
  /** Athelas cards in the encounter discard pile the setup card's Response has been offered for. */
  athelasDiscard?: number;
  /** Additional attacks due after an enemy's attack (Dark-wood Grove's and Labyrinthine Woods' shadows). */
  again?: { enemyId: string; round: number; next: boolean }[];
  /** Pitch-dark Thicket's shadow: enemies characters with ranged cannot attack until the end of the phase. */
  thicket?: { enemyId: string; round: number; phase: string }[];
}

const rhosLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "journey-to-rhosgobel";
const isEnemyCode = (code: string) => card(code).type_code === "enemy";
const creatureEnemy = (code: string) =>
  isEnemyCode(code) && traitOf(code, "Creature");
const wilyador = (s: GameState) =>
  allCharacters(s).find((u) => u.code === RHOS.wilyador);
const inPlay = (s: GameState) => [...s.staging, ...allEngaged(s)];
const questPhase = (s: GameState) => ["quest", "staging"].includes(s.phase);
/** The phase a lasting "until the end of the phase" effect belongs to. */
const phaseOf = (s: GameState) =>
  ["defense", "attack"].includes(s.phase)
    ? "combat"
    : questPhase(s)
      ? "quest"
      : s.phase;
/** Athelas cards in play: objectives in the staging area and those the heroes hold. */
export const athelasInPlay = (s: GameState) =>
  s.staging.filter((u) => u.code === RHOS.athelas).length +
  allCharacters(s).reduce(
    (n, u) => n + u.attachments.filter((a) => a.code === RHOS.athelas).length,
    0,
  );
const controlsAthelas = (s: GameState, player: number) =>
  allCharacters(s).some(
    (u) =>
      ownerOf(s, u) === player &&
      u.attachments.some((a) => a.code === RHOS.athelas),
  );
const woodsInStaging = (s: GameState) =>
  s.staging.filter((u) => live(s, u, G.labyrinth)).length;
/** Pitch-dark Thicket: "While Pitch-dark Thicket is the active location, all characters lose the ranged keyword." */
const thicketActive = (s: GameState) =>
  !!s.activeLocation && live(s, s.activeLocation, G.thicket);
const ranged = (s: GameState, u: Unit) =>
  hasKeyword(u, "Ranged") && !thicketActive(s);
/** Black Forest Bats and Mirkwood Flock: "Only Eagle characters or characters with ranged can attack or defend against" them. */
const skyEnemy = (u: Unit) =>
  ([RHOS.bats, RHOS.flock] as string[]).includes(u.code) && !u.blanked;

// ------------------------------------------------------------- the setup card

/** "Forced: The first Creature enemy revealed during each quest phase gains surge." */
function rhosRevealed(s: GameState, code: string) {
  if (!rhosLive(s) || !questPhase(s) || !creatureEnemy(code)) return;
  const q = state(s);
  q.creatures = {
    round: s.round,
    count: q.creatures?.round === s.round ? q.creatures.count + 1 : 1,
  };
}
function rhosRevealedSurge(s: GameState, code: string) {
  if (!rhosLive(s) || !questPhase(s) || !creatureEnemy(code)) return false;
  const q = s.nightmare?.creatures;
  if (q?.round !== s.round || q.count !== 1) return false;
  log(
    s,
    `A Journey to Rhosgobel · Nightmare: ${card(code).name} is the first Creature enemy revealed this quest phase, and gains surge.`,
    "danger",
  );
  return true;
}
/**
 * "Response: After an Athelas card is placed in the discard pile, you may
 * shuffle it into the encounter deck." (Offered once for each Athelas that
 * reaches the encounter discard pile, at the next state check.)
 */
function rhosCheck(s: GameState) {
  if (!rhosLive(s) || s.phase === "setup" || s.status !== "playing") return;
  if (s.choice || s.flow?.pending) return;
  const n = s.encounterDiscard.filter((c) => c === RHOS.athelas).length;
  const q = state(s);
  const seen = q.athelasDiscard ?? 0;
  if (n === seen) return;
  q.athelasDiscard = n;
  if (n > seen)
    prepend(
      s,
      ...Array.from({ length: n - seen }, () =>
        fx("nrhAthelas", { player: firstPlayer(s) }),
      ),
    );
}

// ------------------------------------------------------------- passives

function rhosStats(s: GameState, u: Unit) {
  if (!rhosLive(s) || !isEnemyCode(u.code)) return {};
  return {
    // Goblin Eagle-hunter: "+1 hit point per player."
    ...(live(s, u, G.eagleHunter) ? { health: livingSeats(s).length } : {}),
    // Labyrinthine Woods: "While in the staging area, Creature enemies get
    // +1 [threat] and +1 [attack]."
    ...(traitOf(u.code, "Creature") && woodsInStaging(s)
      ? { attack: woodsInStaging(s) }
      : {}),
  };
}
function rhosThreatBonus(s: GameState, u: Unit) {
  if (!rhosLive(s)) return 0;
  // Dark-wood Grove: "+1 [threat] and +1 quest point for each Athelas card in
  // play."
  if (live(s, u, G.darkwood)) return athelasInPlay(s);
  return isEnemyCode(u.code) && traitOf(u.code, "Creature")
    ? woodsInStaging(s)
    : 0;
}
const rhosQuestBonus = (s: GameState, u: Unit) =>
  rhosLive(s) && live(s, u, G.darkwood) ? athelasInPlay(s) : 0;
/** Pitch-dark Thicket (active): every character loses the ranged keyword. */
const rhosLosesKeyword = (s: GameState, _u: Unit, keyword: string) =>
  rhosLive(s) && keyword.toLowerCase() === "ranged" && thicketActive(s);
function rhosCannotAttack(s: GameState, u: Unit, enemy: Unit) {
  if (!rhosLive(s)) return false;
  // Pitch-dark Thicket's shadow: "Attacking enemy cannot be attacked by
  // characters with the ranged keyword until the end of the phase."
  const marked = !!s.nightmare?.thicket?.some(
    (m) =>
      m.enemyId === enemy.id && m.round === s.round && m.phase === phaseOf(s),
  );
  if (marked && ranged(s, u)) return true;
  // Without ranged, only Eagles fight Black Forest Bats and Mirkwood Flock.
  return thicketActive(s) && skyEnemy(enemy) && !hasTrait(u, "Eagle");
}
const rhosCannotDefend = (s: GameState, enemy: Unit, u?: Unit) =>
  rhosLive(s) &&
  !!u &&
  thicketActive(s) &&
  skyEnemy(enemy) &&
  !hasTrait(u, "Eagle");
/** Treetop Bird-eater: "While engaged with a player, characters controlled by that player cannot be healed." */
const rhosCannotHeal = (s: GameState, u: Unit) =>
  rhosLive(s) &&
  allEngaged(s).some(
    (e) => live(s, e, G.birdEater) && ownerOf(s, e) === ownerOf(s, u),
  );
/** Noxious Supplies: healing by a card effect other than Athelas (stage 3's Athelas treatment) is reduced to 1. */
const athelasHeal = (source?: HealSource) =>
  !!source &&
  (source.code === RHOS.athelas ||
    source.code === RHOS.return ||
    !!source.source?.includes(RHOS.return));
const noxiousOn = (u: Unit) =>
  u.attachments.filter((a) => a.code === G.noxious && !a.blanked);
const rhosHealLimit = (s: GameState, u: Unit, source?: HealSource) =>
  rhosLive(s) && noxiousOn(u).length && !athelasHeal(source) ? 1 : undefined;
function rhosHealed(
  s: GameState,
  u: Unit,
  _amount: number,
  source?: HealSource,
) {
  if (!rhosLive(s) || athelasHeal(source)) return;
  const supplies = noxiousOn(u);
  if (!supplies.length) return;
  for (const a of supplies) discardAttachment(s, u, a);
  log(
    s,
    `Noxious Supplies: ${name(u)} is healed of only 1 damage, and Noxious Supplies is discarded.`,
    "danger",
  );
}
/** Shot from the Sky (Condition): "takes 1 damage each time it readies." */
function rhosCharacterReadied(s: GameState, u: Unit) {
  if (!rhosLive(s)) return;
  const shots = u.attachments.filter((a) => a.code === G.shot && !a.blanked);
  if (shots.length)
    prepend(
      s,
      fx("damage", {
        target: u.id,
        value: shots.length,
        player: ownerOf(s, u),
      }),
    );
}
/** Goblin Eagle-hunter: "Forced: At the end of the combat phase, deal 1 damage to Wilyador." (each copy in play) */
function rhosCombatEnd(s: GameState) {
  if (!rhosLive(s)) return;
  const eagle = wilyador(s);
  const hunters = inPlay(s).filter((u) => live(s, u, G.eagleHunter));
  if (!eagle || !hunters.length) return;
  log(
    s,
    `Goblin Eagle-hunter: Wilyador takes 1 damage from each copy in play (${hunters.length}).`,
    "danger",
  );
  prepend(
    s,
    ...hunters.map(() =>
      fx("damage", { target: eagle.id, value: 1, player: ownerOf(s, eagle) }),
    ),
  );
}
/**
 * Treetop Bird-eater: "Forced: At the beginning of the encounter phase,
 * Treetop Bird-eater engages the player who controls Wilyador (regardless
 * of threat)."
 */
function rhosEncounterBegin(s: GameState) {
  if (!rhosLive(s)) return;
  const eagle = wilyador(s);
  if (!eagle) return;
  const p = ownerOf(s, eagle);
  for (const u of inPlay(s).filter((x) => live(s, x, G.birdEater))) {
    if (allEngaged(s).some((x) => x.id === u.id) && ownerOf(s, u) === p)
      continue;
    forOwner(s, p, () => engage(s, u));
    log(
      s,
      `Treetop Bird-eater engages ${several(s) ? seatName(s, p) : "you"}, who controls Wilyador.`,
      "danger",
    );
  }
}

// ------------------------------------------------------------- treacheries

function rhosEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!rhosLive(s) || ![G.shot, G.noxious].includes(code as never))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  prepend(
    s,
    fx(code === G.shot ? "nrhShot" : "nrhNoxious", { player: firstPlayer(s) }),
  );
  return true;
}

// ------------------------------------------------------------- shadows

function rhosShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !rhosLive(s)) return false;
  const enemy = get(s, c.enemyId);
  // Goblin Eagle-hunter: "If Wilyador has 10 or less damage on him, deal 2
  // damage to Wilyador."
  if (code === G.eagleHunter) {
    const eagle = wilyador(s);
    if (eagle && eagle.damage <= 10) {
      log(s, "Goblin Eagle-hunter: Wilyador takes 2 damage.", "danger");
      prepend(
        s,
        fx("damage", { target: eagle.id, value: 2, player: ownerOf(s, eagle) }),
      );
    } else log(s, "Goblin Eagle-hunter · Wilyador has more than 10 damage.");
  }
  // Shot from the Sky: "Resolve the "when revealed" effect of Shot from the
  // Sky."
  else if (code === G.shot)
    prepend(s, fx("nrhShot", { player: firstPlayer(s), source: enemy?.id }));
  // Dark-wood Grove: "If defending player controls at least 1 Athelas card,
  // attacking enemy makes an additional attack after this one."
  else if (code === G.darkwood) {
    if (enemy && controlsAthelas(s, defendingPlayer(s))) {
      again(s, enemy, false);
      log(
        s,
        `Dark-wood Grove: the defending player controls Athelas, so ${name(enemy)} makes an additional attack after this one.`,
        "danger",
      );
    } else
      log(s, "Dark-wood Grove · The defending player controls no Athelas.");
  }
  // Labyrinthine Woods: "After this attack, attacking enemy engages the next
  // player and makes an additional attack."
  else if (code === G.labyrinth) {
    if (enemy) {
      again(s, enemy, true);
      log(
        s,
        `Labyrinthine Woods: after this attack, ${name(enemy)} engages the next player and makes an additional attack.`,
        "danger",
      );
    }
  }
  // Pitch-dark Thicket: "Attacking enemy cannot be attacked by characters
  // with the ranged keyword until the end of the phase."
  else if (code === G.thicket) {
    if (enemy) {
      const q = state(s);
      q.thicket = [
        ...(q.thicket ?? []).filter((m) => m.round === s.round),
        { enemyId: enemy.id, round: s.round, phase: phaseOf(s) },
      ];
      log(
        s,
        `Pitch-dark Thicket: characters with ranged cannot attack ${name(enemy)} until the end of the phase.`,
        "danger",
      );
    }
  } else return false;
  return true;
}
function again(s: GameState, enemy: Unit, next: boolean) {
  const q = state(s);
  q.again = [
    ...(q.again ?? []).filter((m) => m.round === s.round),
    { enemyId: enemy.id, round: s.round, next },
  ];
}
/** The additional attacks due after this one. */
function rhosAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!rhosLive(s) || !s.nightmare?.again?.length) return [];
  const q = state(s);
  const due = q.again!.filter(
    (m) => m.enemyId === c.enemyId && m.round === s.round,
  );
  if (!due.length) return [];
  q.again = q.again!.filter((m) => !due.includes(m));
  if (!q.again.length) delete q.again;
  const p = c.attackPlayer ?? firstPlayer(s);
  const order = playerOrder(s);
  return due.map((m) =>
    fx("nrhAgain", {
      target: c.enemyId,
      player: m.next ? order[(order.indexOf(p) + 1) % order.length] : p,
      flag: m.next,
    }),
  );
}

// ------------------------------------------------------------- effects

export function nightmareRhosEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrh")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nrhShot": {
      // "Attach to an Eagle character. (Limit 1 per character.)" Wilyador
      // has "No attachments".
      const eagles = allCharacters(s).filter(
        (u) =>
          u.code !== RHOS.wilyador &&
          hasTrait(u, "Eagle") &&
          !u.attachments.some((a) => a.code === G.shot),
      );
      if (!eagles.length) {
        log(s, "Shot from the Sky · No Eagle character can be shot.");
        if (!e.source) s.encounterDiscard.push(G.shot);
        return true;
      }
      if (eagles.length === 1)
        prepend(
          s,
          fx("nrhShotAttach", {
            target: eagles[0].id,
            source: e.source,
            player: p,
          }),
        );
      else
        choose(
          s,
          "Shot from the Sky · Choose an Eagle character to attach it to",
          eagles.map((u): Option => ({
            id: u.id,
            code: u.code,
            label: `${name(u)}${several(s) ? ` · ${seatName(s, ownerOf(s, u))}` : ""}`,
            effects: [
              fx("nrhShotAttach", {
                target: u.id,
                source: e.source,
                player: p,
              }),
            ],
          })),
          card(G.shot).text,
        );
      return true;
    }
    case "nrhShotAttach": {
      const u = get(s, e.target);
      if (!u || !allCharacters(s).some((x) => x.id === u.id)) {
        if (!e.source) s.encounterDiscard.push(G.shot);
        return true;
      }
      // From an attacking enemy's shadow cards, the card leaves them.
      const enemy = e.source ? get(s, e.source) : undefined;
      if (enemy) {
        const at = enemy.shadows.indexOf(G.shot);
        if (at >= 0) removeShadowCard(enemy, at);
      }
      u.attachments.push({
        id: `a${s.nextId++}`,
        code: G.shot,
        exhausted: false,
      });
      log(
        s,
        `Shot from the Sky is attached to ${name(u)}: it loses the Eagle trait and takes 1 damage each time it readies.`,
        "danger",
      );
      return true;
    }
    case "nrhNoxious": {
      // "Attach to Wilyador." (Its own instruction overrides his "No
      // attachments".)
      const eagle = wilyador(s);
      if (!eagle) {
        s.encounterDiscard.push(G.noxious);
        return true;
      }
      eagle.attachments.push({
        id: `a${s.nextId++}`,
        code: G.noxious,
        exhausted: false,
      });
      log(
        s,
        "Noxious Supplies is attached to Wilyador: the next healing by a card effect other than Athelas heals only 1 damage.",
        "danger",
      );
      return true;
    }
    case "nrhAgain": {
      const enemy = get(s, e.target);
      if (!enemy || s.status !== "playing") return true;
      if (e.flag) forOwner(s, p, () => engage(s, enemy));
      log(
        s,
        `${name(enemy)} ${e.flag ? `engages ${several(s) ? seatName(s, p) : "you"} and ` : ""}makes an additional attack.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: enemy.id, player: p }));
      return true;
    }
    case "nrhAthelas":
      if (!s.encounterDiscard.includes(RHOS.athelas)) return true;
      choose(
        s,
        "A Journey to Rhosgobel · An Athelas reached the encounter discard pile: shuffle it into the encounter deck?",
        [
          {
            id: "shuffle",
            code: RHOS.athelas,
            label: "Shuffle Athelas into the encounter deck",
            effects: [fx("nrhAthelasShuffle", { player: p })],
          },
          { id: "keep", label: "Leave it in the discard pile", effects: [] },
        ],
        card(G.rhosCard).back_text,
      );
      return true;
    case "nrhAthelasShuffle": {
      const at = s.encounterDiscard.lastIndexOf(RHOS.athelas);
      if (at >= 0) {
        s.encounterDiscard.splice(at, 1);
        s.encounterDeck.push(RHOS.athelas);
        shuffle(s, s.encounterDeck);
        log(s, "Athelas is shuffled into the encounter deck.", "good");
      }
      state(s).athelasDiscard = s.encounterDiscard.filter(
        (c) => c === RHOS.athelas,
      ).length;
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_RHOS_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stats: rhosStats,
  threatBonus: rhosThreatBonus,
  locationQuestBonus: rhosQuestBonus,
  losesKeyword: rhosLosesKeyword,
  cannotAttack: rhosCannotAttack,
  cannotDefend: rhosCannotDefend,
  cannotHeal: rhosCannotHeal,
  healLimit: rhosHealLimit,
  healed: rhosHealed,
  characterReadied: rhosCharacterReadied,
  combatEnd: rhosCombatEnd,
  encounterBegin: rhosEncounterBegin,
  revealed: rhosRevealed,
  revealedSurge: rhosRevealedSurge,
  check: rhosCheck,
  attackFinished: rhosAttackFinished,
  encounter: rhosEncounter,
  shadow: rhosShadow,
  effect: nightmareRhosEffect,
  sharedEffect: (e) => e.kind.startsWith("nrh"),
};

// ------------------------------------------------------------- saves

const PHASES = [
  "setup",
  "resource",
  "planning",
  "quest",
  "travel",
  "encounter",
  "combat",
  "refresh",
];
export function validNightmareRhos(s: GameState) {
  const q = s.nightmare;
  if (q === undefined) return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    (q.creatures === undefined ||
      (!!q.creatures &&
        round(q.creatures.round) &&
        count(q.creatures.count))) &&
    (q.athelasDiscard === undefined || count(q.athelasDiscard)) &&
    (q.again === undefined ||
      (Array.isArray(q.again) &&
        q.again.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            round(m.round) &&
            typeof m.next === "boolean",
        ))) &&
    (q.thicket === undefined ||
      (Array.isArray(q.thicket) &&
        q.thicket.every(
          (m) =>
            !!m &&
            typeof m.enemyId === "string" &&
            round(m.round) &&
            PHASES.includes(m.phase),
        )))
  );
}
