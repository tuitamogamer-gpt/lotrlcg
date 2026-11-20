/**
 * Assault on Osgiliath's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rules (Palace Remains in the staging area at setup; while more
 * Osgiliath locations are in the staging area than there are players, a
 * Response that places the quest's remaining progress on a chosen location)
 * and its Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/assault-osgiliath.ts) through batch4Scenario while a Nightmare
 * mode game is played. Effects use the "nao" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  shuffle,
  skip,
  stagingThreat,
  threatOf,
  units,
} from "./core";
import {
  discardHandCard,
  engage,
  placeEncounter,
  progressLocation,
  questResolutionProgress,
  raiseThreat,
} from "./board";
import {
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { attachToQuest, mainQuestUnit } from "./quest-state";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
} from "./nightmare-core";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareOsgiliathState {
  /** The setup card's Response: the location that takes the quest's remaining progress this quest phase. */
  chosen?: { round: number; locationId: string };
  /** Haradrim Warrior: +X [attack] and +X [defense] until the end of the round after it engages. */
  warriors?: { enemyId: string; round: number; x: number }[];
  /** Overrun Defenses: X added to the staging area's [threat] this phase. */
  overrun?: { round: number; phase: string; x: number }[];
  /** Invading Orc's shadow: a location returns if this attack destroys a character. */
  invading?: { enemyId: string; player: number; done?: boolean }[];
}

const aoLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "assault-on-osgiliath";
const isEnemy = (code: string) => card(code).type_code === "enemy";
const osgiliath = (code: string) =>
  card(code).type_code === "location" &&
  /\bOsgiliath\b/.test(card(code).traits ?? "");
/** The locations a player controls (all players' without one). */
const controlled = (s: GameState, player?: number) =>
  (s.assaultOsgiliath?.controlled ?? []).filter(
    (u) => player === undefined || (u.owner ?? 0) === player,
  );
const firstX = (s: GameState) => controlled(s, firstPlayer(s)).length;
const relentless = (s: GameState) =>
  (mainQuestUnit(s)?.attachments ?? []).filter(
    (a) => a.code === N.relentless && !a.blanked,
  ).length;

// ------------------------------------------------------------- the setup card

/**
 * "If there are more Osgiliath locations in the staging area than players in
 * the game, this card gains: "Response: At the beginning of the quest phase,
 * choose 1 non-unique location. If the players quest successfully this phase,
 * remaining progress made beyond the active location's quest points is placed
 * on the chosen location.""
 */
function aoQuestBegin(s: GameState): Effect[] {
  if (!aoLive(s)) return [];
  const staged = s.staging.filter((u) => osgiliath(u.code)).length;
  if (staged <= playerOrder(s).length) return [];
  return [fx("naoChoose", { player: firstPlayer(s) })];
}
function aoProgress(s: GameState, amount: number, quest: Unit) {
  const q = s.nightmare?.chosen;
  if (
    !aoLive(s) ||
    amount <= 0 ||
    !q ||
    q.round !== s.round ||
    s.phase !== "quest" ||
    !questResolutionProgress() ||
    quest.code !== mainQuestUnit(s)?.code
  )
    return amount;
  const target = s.staging.find((u) => u.id === q.locationId);
  if (!target) return amount;
  log(
    s,
    `Assault on Osgiliath · Nightmare: ${amount} remaining progress is placed on ${name(target)}.`,
    "good",
  );
  progressLocation(s, target, amount);
  return 0;
}

// ------------------------------------------------------------- the cards

/** Haradrim Warrior's [threat] X and Palace Remains' resource tokens. */
function aoThreatBonus(s: GameState, u: Unit) {
  if (!aoLive(s)) return 0;
  if (live(s, u, N.haradrim)) return firstX(s);
  if (live(s, u, N.palace)) return u.resources;
  return 0;
}
/** Haradrim Warrior: "Archery X. X is the number of locations controlled by the first player." */
const aoArcheryBonus = (s: GameState) =>
  aoLive(s)
    ? units(s).filter((u) => live(s, u, N.haradrim)).length * firstX(s)
    : 0;
/** Haradrim Warrior's engagement bonus: "+X [attack] and +X [defense] until the end of the round." */
function aoStats(s: GameState, u: Unit) {
  if (!aoLive(s) || !live(s, u, N.haradrim)) return {};
  const x = (s.nightmare?.warriors ?? [])
    .filter((w) => w.enemyId === u.id && w.round === s.round)
    .reduce((n, w) => n + w.x, 0);
  return x ? { attack: x, defense: x } : {};
}
/** Relentless Attack: "Each enemy gets -X engagement cost. X is the number of locations controlled by players." */
const aoEngagementBonus = (s: GameState) =>
  aoLive(s) ? -relentless(s) * controlled(s).length : 0;
/** Overrun Defenses: "Add X to the total [threat] in the staging area this phase." */
const aoStagingThreat = (s: GameState) =>
  aoLive(s)
    ? (s.nightmare?.overrun ?? [])
        .filter((o) => o.round === s.round && o.phase === s.phase)
        .reduce((n, o) => n + o.x, 0)
    : 0;
/** Overrun Defenses: "If X is less than 4, Overrun Defenses gains doomed 2." */
const aoRevealedDoomed = (s: GameState, code: string) =>
  aoLive(s) && code === N.overrun && controlled(s).length < 4 ? 2 : 0;
/** Palace Remains: "Immune to player card effects." */
const aoImmune = (s: GameState, u: Unit) => aoLive(s) && live(s, u, N.palace);
/** Palace Remains: "The players cannot travel here unless there are at least 5 resource tokens on Palace Remains." */
const aoTravelProblem = (s: GameState, u: Unit) =>
  aoLive(s) && live(s, u, N.palace) && u.resources < 5
    ? "Palace Remains needs at least 5 resource tokens before the players can travel here."
    : null;
/** Haradrim Warrior: "Forced: After Haradrim Warrior engages a player, it gets +X [attack] and +X [defense] until the end of the round." */
function aoEngaged(s: GameState, u: Unit) {
  if (!aoLive(s) || !live(s, u, N.haradrim)) return;
  const x = firstX(s);
  const q = (s.nightmare ??= {});
  q.warriors = [
    ...(q.warriors ?? []).filter((w) => w.round === s.round),
    { enemyId: u.id, round: s.round, x },
  ];
  if (x)
    log(
      s,
      `Haradrim Warrior gets +${x} [attack] and +${x} [defense] until the end of the round.`,
      "danger",
    );
}
/** Relentless Attack: "Forced: At the beginning of the encounter phase, if there are fewer than X enemies in the staging area, reveal an encounter card." */
function aoEncounterBegin(s: GameState) {
  if (!aoLive(s)) return;
  const copies = relentless(s);
  if (!copies) return;
  const x = controlled(s).length;
  const enemies = s.staging.filter((u) => isEnemy(u.code)).length;
  if (enemies >= x) return;
  log(
    s,
    `Relentless Attack: fewer than ${x} enemies in the staging area (${enemies}), so an encounter card is revealed${copies > 1 ? ` for each copy (${copies})` : ""}.`,
    "danger",
  );
  prepend(
    s,
    ...Array.from({ length: copies }, () =>
      fx("reveal", { player: firstPlayer(s) }),
    ),
  );
}
/**
 * After a player takes control of a location: Palace Remains' resource
 * token, and the "When you take control" effects of Crumbled Battlements,
 * Eastern Quarter and Western Quarter.
 */
function aoLocationControlled(s: GameState, u: Unit, player: number) {
  if (!aoLive(s)) return;
  const effects: Effect[] = [];
  if (live(s, u, N.battlements)) effects.push(fx("naoBattlements", { player }));
  if (live(s, u, N.eastern)) effects.push(fx("naoEastern", { player }));
  if (live(s, u, N.western)) effects.push(fx("naoWestern", { player }));
  for (const palace of s.staging.filter((l) => live(s, l, N.palace))) {
    palace.resources += 1;
    log(
      s,
      `Palace Remains: a resource token is placed on it (${palace.resources}).`,
      "danger",
    );
  }
  prepend(s, ...effects);
}
/** Eastern and Western Quarter: "Forced: After the 'when revealed' effect of a treachery is canceled, return it to the staging area." */
function aoWhenRevealedCancelled(s: GameState, code: string) {
  if (!aoLive(s) || card(code).type_code !== "treachery") return;
  const quarters = controlled(s).filter(
    (l) => live(s, l, N.eastern) || live(s, l, N.western),
  );
  prepend(s, ...quarters.map((l) => fx("osgiliathReturn", { target: l.id })));
}
/** Invading Orc: "Forced: After Invading Orc attacks and destroys a character, that character's controller returns a location he controls to the staging area." Its shadow: "If this attack destroys a character, return a location you control to the staging area." */
function aoCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  const c = s.combat;
  if (
    !aoLive(s) ||
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId
  )
    return;
  const enemy = get(s, c.enemyId);
  const effects: Effect[] = [];
  if (enemy && live(s, enemy, N.invading))
    effects.push(fx("naoReturn", { player: ownerOf(s, u), code: N.invading }));
  for (const m of s.nightmare?.invading ?? [])
    if (m.enemyId === c.enemyId && !m.done) {
      m.done = true;
      effects.push(fx("naoReturn", { player: m.player, code: N.invading }));
    }
  prepend(s, ...effects);
}
function aoAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  if (q?.invading?.length) {
    q.invading = q.invading.filter((m) => m.enemyId !== combat.enemyId);
    if (!q.invading.length) delete q.invading;
  }
  return [];
}

function aoEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!aoLive(s)) return false;
  if (code !== N.relentless && code !== N.overrun && code !== N.pressed)
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (code !== N.relentless || !fromReveal) s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  prepend(
    s,
    fx(
      code === N.relentless
        ? "naoRelentless"
        : code === N.overrun
          ? "naoOverrun"
          : "naoPressed",
      { player: firstPlayer(s) },
    ),
  );
  return true;
}

function aoShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !aoLive(s)) return false;
  const p = defendingPlayer(s);
  switch (code) {
    // Invading Orc: "If this attack destroys a character, return a location
    // you control to the staging area."
    case N.invading: {
      const q = (s.nightmare ??= {});
      q.invading = [...(q.invading ?? []), { enemyId: c.enemyId, player: p }];
      return true;
    }
    // Haradrim Warrior: "Deal 1 damage to defending character."
    case N.haradrim: {
      const d = get(s, c.defenderIds?.[0] ?? c.defenderId ?? undefined);
      if (d) prepend(s, fx("damage", { target: d.id, value: 1, player: p }));
      return true;
    }
    // Overrun Defenses: "Exhaust a character you control (2 characters
    // instead if you control 4 or more locations)."
    case N.overrun:
      prepend(
        s,
        fx("naoExhaust", {
          value: controlled(s, p).length >= 4 ? 2 : 1,
          player: p,
        }),
      );
      return true;
    // Pressed on All Sides: "Attacking enemy gets +1 [attack] for each
    // location you control."
    case N.pressed:
      c.attackBonus += controlled(s, p).length;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareOsgiliathEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nao")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "naoChoose": {
      const options = s.staging.filter(
        (u) => card(u.code).type_code === "location" && !card(u.code).is_unique,
      );
      if (!options.length) return true;
      choose(
        s,
        `Assault on Osgiliath · Nightmare: choose a non-unique location for the quest's remaining progress${seatLabel(s, p)}`,
        [
          ...options.map((l): Option => ({
            id: l.id,
            code: l.code,
            label: `${name(l)} (${l.progress} progress)`,
            effects: [fx("naoChosen", { target: l.id, player: p })],
          })),
          skip,
        ],
        card(N.osgiliathCard).back_text,
      );
      return true;
    }
    case "naoChosen":
      if (e.target)
        (s.nightmare ??= {}).chosen = { round: s.round, locationId: e.target };
      return true;
    case "naoReturn": {
      const mine = controlled(s, p);
      if (!mine.length) return true;
      if (mine.length === 1) {
        prepend(s, fx("osgiliathReturn", { target: mine[0].id }));
        return true;
      }
      choose(
        s,
        `${card(e.code ?? N.invading).name} · Return a location you control to the staging area${seatLabel(s, p)}`,
        mine.map((l): Option => ({
          id: l.id,
          code: l.code,
          label: name(l),
          effects: [fx("osgiliathReturn", { target: l.id })],
        })),
      );
      return true;
    }
    case "naoBattlements": {
      // Crumbled Battlements: "shuffle the encounter discard pile into the
      // encounter deck and discard cards from the encounter deck until an
      // enemy is discarded. Put the discarded enemy into play engaged with
      // you."
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      let found: string | undefined;
      while (s.encounterDeck.length && !found) {
        const code = s.encounterDeck.shift()!;
        if (isEnemy(code)) found = code;
        else s.encounterDiscard.push(code);
      }
      if (!found) {
        log(s, "Crumbled Battlements: no enemy is discarded.");
        return true;
      }
      log(
        s,
        `Crumbled Battlements: ${card(found).name} is discarded and engages${seatLabel(s, p)}.`,
        "danger",
      );
      const before = s.staging.length;
      placeEncounter(s, found, true);
      const fresh = s.staging.slice(before).find((u) => u.code === found);
      if (fresh) forOwner(s, p, () => engage(s, fresh));
      return true;
    }
    case "naoEastern": {
      // Eastern Quarter: "discard each event card in your hand."
      forOwner(s, p, () => {
        const events = s.hand.filter((u) => card(u.code).type_code === "event");
        for (const u of events)
          discardHandCard(s, u.id, { encounterEffect: true });
        log(
          s,
          `Eastern Quarter: ${events.length} event ${events.length === 1 ? "card is" : "cards are"} discarded${seatLabel(s, p)}.`,
          "danger",
        );
      });
      return true;
    }
    case "naoWestern": {
      // Western Quarter: "discard the highest cost attachment you control."
      const mine = units(s).flatMap((host) =>
        host.attachments
          .filter((a) => !a.facedown && attachmentController(s, host, a) === p)
          .map((a) => ({ host, a, cost: Number(card(a.code).cost ?? 0) || 0 })),
      );
      if (!mine.length) return true;
      const top = Math.max(...mine.map((m) => m.cost));
      const highest = mine.filter((m) => m.cost === top);
      choose(
        s,
        `Western Quarter · Discard the highest cost attachment you control${seatLabel(s, p)}`,
        highest.map(({ host, a }): Option => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} · ${name(host)}`,
          effects: [fx("discardAttachment", { target: host.id, source: a.id })],
        })),
        card(N.western).text,
      );
      return true;
    }
    case "naoRelentless": {
      // Relentless Attack: "Attach to the current quest."
      const quest = mainQuestUnit(s);
      if (
        !quest ||
        !attachToQuest(s, quest.code, {
          id: `${quest.code}:relentless:${s.nextId++}`,
          code: N.relentless,
          exhausted: false,
        } as Attachment)
      ) {
        s.encounterDiscard.push(N.relentless);
        return true;
      }
      log(s, "Relentless Attack attaches to the current quest.", "danger");
      return true;
    }
    case "naoOverrun": {
      // Overrun Defenses: "Add X to the total [threat] in the staging area
      // this phase. X is the number of locations the players control."
      const x = controlled(s).length;
      const q = (s.nightmare ??= {});
      q.overrun = [
        ...(q.overrun ?? []).filter((o) => o.round === s.round),
        { round: s.round, phase: s.phase, x },
      ];
      log(
        s,
        `Overrun Defenses: +${x} [threat] in the staging area this phase${x < 4 ? "; it gained doomed 2" : ""}.`,
        "danger",
      );
      return true;
    }
    case "naoPressed": {
      // Pressed on All Sides: "If the total [threat] of locations controlled
      // by the players is greater than the total [threat] in the staging
      // area, raise each player's threat by 2 and immediately end the quest
      // phase without resolving the quest."
      const held = controlled(s).reduce((n, l) => n + threatOf(s, l), 0);
      const staged = stagingThreat(s);
      if (held <= staged) {
        log(
          s,
          `Pressed on All Sides: the controlled locations' [threat] (${held}) is not greater than the staging area's (${staged}).`,
        );
        return true;
      }
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        `Pressed on All Sides: the controlled locations' [threat] (${held}) exceeds the staging area's (${staged}); each player raises their threat by 2${s.phase === "quest" ? " and the quest phase ends without resolving the quest" : ""}.`,
        "danger",
      );
      if (s.phase === "quest") {
        s.queue = s.queue.filter(
          (x) => !["reveal", "khazadStagingEnd", "questReady"].includes(x.kind),
        );
        s.queue.push(fx("finishQuestPhase", { player: firstPlayer(s) }));
      }
      return true;
    }
    case "naoExhaust": {
      const left = e.value ?? 1;
      const ready = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (c) => !c.exhausted,
      );
      if (left <= 0 || !ready.length) return true;
      choose(
        s,
        `Overrun Defenses · Exhaust a character you control (${left} left)${seatLabel(s, p)}`,
        ready.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [
            fx("exhaust", { target: c.id, player: p }),
            fx("naoExhaust", { value: left - 1, player: p }),
          ],
        })),
        card(N.overrun).shadow,
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_OSGILIATH_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  questBegin: aoQuestBegin,
  progress: aoProgress,
  threatBonus: aoThreatBonus,
  archeryBonus: aoArcheryBonus,
  stats: aoStats,
  engagementBonus: aoEngagementBonus,
  stagingThreat: aoStagingThreat,
  revealedDoomed: aoRevealedDoomed,
  immune: aoImmune,
  travelProblem: aoTravelProblem,
  engaged: aoEngaged,
  encounterBegin: aoEncounterBegin,
  locationControlled: aoLocationControlled,
  whenRevealedCancelled: aoWhenRevealedCancelled,
  characterDestroyed: aoCharacterDestroyed,
  attackFinished: aoAttackFinished,
  encounter: aoEncounter,
  shadow: aoShadow,
  effect: nightmareOsgiliathEffect,
  sharedEffect: (e) => e.kind.startsWith("nao"),
};

// ------------------------------------------------------------- saves

export function validNightmareOsgiliath(s: GameState) {
  const q = s.nightmare;
  if (!q) return true;
  const int = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  const list = (v: unknown, ok: (x: never) => boolean) =>
    v === undefined ||
    (Array.isArray(v) && v.every((x) => !!x && ok(x as never)));
  return (
    (q.chosen === undefined ||
      (!!q.chosen &&
        int(q.chosen.round) &&
        typeof q.chosen.locationId === "string")) &&
    list(
      q.warriors,
      (w: { enemyId: unknown; round: unknown; x: unknown }) =>
        typeof w.enemyId === "string" && int(w.round) && int(w.x),
    ) &&
    list(
      q.overrun,
      (o: { round: unknown; phase: unknown; x: unknown }) =>
        int(o.round) && typeof o.phase === "string" && int(o.x),
    ) &&
    list(
      q.invading,
      (m: { enemyId: unknown; player: unknown; done?: unknown }) =>
        typeof m.enemyId === "string" &&
        int(m.player) &&
        (m.done === undefined || typeof m.done === "boolean"),
    )
  );
}
