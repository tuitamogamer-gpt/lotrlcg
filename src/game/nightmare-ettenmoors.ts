/**
 * Across the Ettenmoors' Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rule (as stages 2A and 3A reveal their side quest, a safe location found in
 * the encounter deck guards it), its stage 1 (the Nightmare Deck's Into the
 * Ettenmoors, in place of the standard one: its setup sets each side quest
 * and safe location aside and stages the first X enemies discarded from the
 * encounter deck; at the beginning of the quest phase a side quest is
 * revealed when none is in play; a defeated side quest gives it no progress)
 * and its Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/ettenmoors.ts) through batch4Scenario while a Nightmare mode game
 * is played. The scenario's Safe keyword still blanks the side quests' text
 * and ignores treacheries' When Revealed effects. Effects use the "net"
 * prefix.
 */
import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, imageUrl, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  characterLeftPlay,
  discardAttachment,
  engage,
  enemyAddedToStaging,
  exhaustCharacter,
  revealed,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
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
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { allQuestUnits, currentQuestUnit } from "./quest-state";
import { addQuestProgress } from "./side-quests";
import { syncAttachmentText } from "./attachment-text";
import { angmarAmarthiulEntered } from "./angmar-campaign";
import { ettenSideQuestBlanked } from "./ettenmoors";
import { ETTEN as E, ETTEN_SAFE, ETTEN_SIDES } from "./ettenmoors-support";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

export interface NightmareEttenState {
  /** The heroes facedown underneath Rescue from the Trolls, out of play (by the quest's id). */
  ettenRescue?: { questId: string; unit: Unit }[];
  /** The last round progress was placed on a side quest (Vast Troll-fells' shadow). */
  ettenSideProgress?: number;
}

const netLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "across-the-ettenmoors" &&
  !!s.ettenmoors;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isSide = (code: string) =>
  card(code).type_code === "encounter-side-quest";
const isSafe = (code: string) => ETTEN_SAFE.includes(code);
const sideQuests = (s: GameState) => s.staging.filter((u) => isSide(u.code));
/** A side quest's text is blank while a safe location is active. */
const sideLive = (s: GameState, u: Unit, code: string) =>
  live(s, u, code) && !ettenSideQuestBlanked(s, u);
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s), ...globalEngaged(s)].filter((u) =>
    live(s, u, code),
  );
/** The quests in play: the main quest and each side quest. */
const questCount = (s: GameState) => allQuestUnits(s).length;
const newest = (s: GameState, code: string) =>
  [...s.staging].reverse().find((u) => u.code === code);
const hidden = (u: Pick<Unit, "id" | "code">, owner: number): Unit => ({
  id: u.id,
  code: u.code,
  owner,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: [],
  boost: 0,
  attacked: false,
  shadows: [],
});
const rescued = (s: GameState) => s.nightmare?.ettenRescue ?? [];
const heroCode = (code: unknown) => {
  try {
    return typeof code === "string" && card(code).type_code === "hero";
  } catch {
    return false;
  }
};

// ------------------------------------------------------------- stage 1

/** Stage 1 is the Nightmare Deck's Into the Ettenmoors. */
function netStageInfo(s: GameState) {
  if (!netLive(s) || s.stage !== 1) return undefined;
  const c = card(N.ettenQuest);
  return {
    name: c.back_name ?? c.name,
    quest: c.back_quest ?? 0,
    cardCode: N.ettenQuest,
    story: c.back_text ?? "",
    side: "B" as const,
    questImage: imageUrl({ ...c, imagesrc: c.back_imagesrc }),
  };
}
/**
 * Into the Ettenmoors 1A: "Setup: Set aside each side quest and each
 * location with the safe keyword. Reveal 1 of those side quests and 1 of
 * those safe locations at random, adding them to the staging area with the
 * safe location guarded by the side quest. Shuffle the remaining side quests
 * and safe locations into the encounter deck. Discard cards from the top of
 * the encounter deck until X enemies are discarded, where X is the number of
 * players in the game. Add the discarded enemies to the staging area. The
 * first player gains control of Amarthiúl." (The random side quest is
 * revealed once the rest of the setup is done.)
 */
function netSetup(s: GameState) {
  const aside = s.encounterDeck.filter((c) => isSide(c) || isSafe(c));
  s.encounterDeck = s.encounterDeck.filter((c) => !isSide(c) && !isSafe(c));
  const sides = shuffle(s, [...ETTEN_SIDES, ...aside.filter(isSide)]),
    safes = shuffle(s, [...ETTEN_SAFE, ...aside.filter(isSafe)]);
  const side = sides.shift()!,
    location = make(s, safes.shift()!);
  s.staging.push(location);
  s.encounterDeck.push(...sides, ...safes);
  shuffle(s, s.encounterDeck);
  const enemies: string[] = [];
  while (enemies.length < playerOrder(s).length && s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === "enemy") enemies.push(code);
    else s.encounterDiscard.push(code);
  }
  for (const code of enemies) {
    const enemy = make(s, code);
    s.staging.push(enemy);
    enemyAddedToStaging(s, enemy);
  }
  const ranger = make(s, E.amarthiul);
  ranger.controller = firstPlayer(s);
  forOwner(s, firstPlayer(s), () => s.allies.push(ranger));
  angmarAmarthiulEntered(s, ranger);
  s.ettenmoors!.initialized = true;
  log(
    s,
    `Into the Ettenmoors: ${card(side).name} is revealed guarding ${name(location)}; ${enemies.map((c) => card(c).name).join(", ") || "no enemy"} ${enemies.length === 1 ? "is" : "are"} added to the staging area. Amarthiúl joins the first player.`,
    "chapter",
  );
  prepend(
    s,
    fx("netReveal", {
      code: side,
      target: location.id,
      player: firstPlayer(s),
    }),
  );
}
/** Discard from the top of the encounter deck until a side quest; returns it. */
function findSide(s: GameState) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (isSide(code)) return code;
    s.encounterDiscard.push(code);
  }
  return undefined;
}

// ------------------------------------------------------------- the cards

/** Scavenging Stone-troll: "You cannot travel to a safe location while Scavenging Stone-troll has no damage on it." */
const undamagedTroll = (s: GameState) =>
  inPlay(s, N.stoneTroll).some((u) => u.damage === 0);
/** Vast Troll-fells (in play): its copies, each asking 1 resource of each player. */
const vastFells = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) =>
    live(s, u, N.vastFells),
  ).length;
const resourcesOf = (s: GameState, p: number) =>
  seatView(s, p).heroes.reduce((n, h) => n + h.resources, 0);
/** Rocky Foothills: "When faced with the option to travel, the players must travel to Rocky Foothills, if able." */
const foothillsFirst = (s: GameState) =>
  !allActiveLocations(s).length && staged(s, N.foothills).length > 0;
function netTravelProblem(s: GameState, u: Unit): string | null {
  if (!netLive(s)) return null;
  if (u.code !== N.foothills && foothillsFirst(s))
    return "Rocky Foothills: the players must travel to Rocky Foothills.";
  if (!isSafe(u.code)) return null;
  if (undamagedTroll(s))
    return "Scavenging Stone-troll: the players cannot travel to a safe location while it has no damage on it.";
  const fells = vastFells(s);
  if (fells && playerOrder(s).some((p) => resourcesOf(s, p) < fells))
    return `Vast Troll-fells: to travel to a safe location, each player must spend ${fells} resource${fells === 1 ? "" : "s"}.`;
  return null;
}
/**
 * The additional costs to travel to a safe location: Vast Troll-fells (each
 * player spends 1 resource, for each copy), Hoarwell River Serpent (one
 * player engages each staged copy) and Giant Beetle (each engaged copy makes
 * an immediate attack against its engaged player).
 */
function netTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!netLive(s) || !isSafe(u.code)) return undefined;
  const effects: Effect[] = [];
  for (let i = vastFells(s); i > 0; i--)
    effects.push(...playerOrder(s).map((player) => fx("netSpend", { player })));
  for (const serpent of staged(s, N.serpent))
    effects.push(
      fx("netSerpent", { target: serpent.id, player: firstPlayer(s) }),
    );
  for (const beetle of globalEngaged(s).filter((x) => live(s, x, N.beetle)))
    effects.push(
      fx("immediateAttack", { target: beetle.id, player: ownerOf(s, beetle) }),
    );
  return effects.length ? effects : undefined;
}
/** Giant Beetle: "Damaged characters cannot be declared as attackers or defenders against Giant Beetle." */
const netCannotAttack = (s: GameState, character: Unit, enemy: Unit) =>
  netLive(s) && live(s, enemy, N.beetle) && character.damage > 0;
const netCannotDefend = (s: GameState, enemy: Unit, defender?: Unit) =>
  netLive(s) && live(s, enemy, N.beetle) && (defender?.damage ?? 0) > 0;
/** Hoarwell River Serpent: "Forced: When you engage Hoarwell River Serpent, deal 1 damaged to each damaged character you control." */
function netEngaged(s: GameState, u: Unit) {
  if (!netLive(s) || !live(s, u, N.serpent)) return;
  const p = activeSeat(s);
  const hurt = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
    (x) => isCharacter(x) && x.damage > 0,
  );
  log(
    s,
    hurt.length
      ? `Hoarwell River Serpent: 1 damage is dealt to each damaged character ${who(s, p)} control${s.table ? "s" : ""}.`
      : `Hoarwell River Serpent: ${who(s, p)} control${s.table ? "s" : ""} no damaged character.`,
    hurt.length ? "danger" : undefined,
  );
  prepend(
    s,
    ...hurt.map((x) => fx("damage", { target: x.id, value: 1, player: p })),
  );
}
/** Rocky Foothills: "Rocky Foothills gets +2 quest points for each quest in play." */
const netLocationQuestBonus = (s: GameState, u: Unit) =>
  netLive(s) && live(s, u, N.foothills) ? 2 * questCount(s) : 0;
/** Isolated: "Players cannot draw cards by card effects." */
const netCannotDraw = (s: GameState) =>
  netLive(s) && s.staging.some((u) => sideLive(s, u, N.isolated));
/** Vast Troll-fells: "Heroes cannot gain resources by card effects." */
const netCannotGainResources = (s: GameState, u: Unit) =>
  netLive(s) && isHero(u) && vastFells(s) > 0;
/** Scavenging Stone-troll (staged): "cards in each player's discard pile cannot leave that discard pile." */
const netDiscardCardKept = (s: GameState) =>
  netLive(s) && staged(s, N.stoneTroll).length > 0;
/** Vast Troll-fells' shadow reads whether progress was placed on a side quest this round. */
function netQuestProgressPlaced(s: GameState, quest: Unit, amount: number) {
  if (
    !netLive(s) ||
    amount <= 0 ||
    !["encounter-side-quest", "player-side-quest"].includes(
      card(quest.code).type_code,
    )
  )
    return;
  (s.nightmare ??= {}).ettenSideProgress = s.round;
}
/** Barren and Desolate: "While attached quest is the current quest, each character gets -1 [willpower]." */
function netStats(s: GameState, u: Unit) {
  if (!netLive(s) || !isCharacter(u)) return {};
  const barren = (currentQuestUnit(s)?.attachments ?? []).some(
    (a) => a.code === N.barren && !a.blanked,
  );
  return barren ? { will: -1 } : {};
}
/** Rescue from the Trolls: "Response: After a Troll enemy is destroyed, place 3 progress on Rescue from the Trolls." (Always taken.) */
function netCharacterDestroyed(s: GameState, u: Unit) {
  if (!netLive(s) || !isEnemy(u) || !traitOf(u.code, "Troll")) return;
  for (const quest of s.staging.filter((x) => sideLive(s, x, N.rescue)))
    prepend(s, fx("netRescueProgress", { target: quest.id }));
}
/**
 * Isolated: "Forced: When this stage is defeated, each player draws 1 card."
 * (It no longer prevents the draw it gives.) Rescue from the Trolls:
 * "Forced: When Rescue from the Trolls is defeated, each player takes
 * control of each of his heroes underneath it." (With its text blank at a
 * safe location, they are discarded with it.)
 */
function netSideDefeated(s: GameState, u: Unit) {
  if (!netLive(s)) return;
  if (sideLive(s, u, N.isolated)) {
    log(s, "Isolated is defeated: each player draws 1 card.", "good");
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
    );
  }
  // Resolved at once, as the quest is defeated (before it leaves play).
  if (u.code === N.rescue && rescued(s).some((r) => r.questId === u.id))
    returnRescued(s, u.id, !sideLive(s, u, N.rescue));
}
/** The heroes underneath Rescue from the Trolls return to their owners, or are discarded with it. */
function returnRescued(s: GameState, questId: string, discarded: boolean) {
  const q = s.nightmare!;
  const mine = rescued(s).filter((r) => r.questId === questId);
  q.ettenRescue = rescued(s).filter((r) => r.questId !== questId);
  if (!q.ettenRescue.length) delete q.ettenRescue;
  for (const { unit } of mine) {
    const owner = unit.owner ?? firstPlayer(s);
    if (discarded || s.table?.seats[owner]?.eliminated) {
      seatView(s, owner).discard.push(unit.code);
      log(
        s,
        `${card(unit.code).name} is discarded with Rescue from the Trolls.`,
        "danger",
      );
      continue;
    }
    forOwner(s, owner, () => s.heroes.push(hidden(unit, owner)));
    log(
      s,
      `Rescue from the Trolls: ${seatName(s, owner)} takes control of ${card(unit.code).name}.`,
      "good",
    );
  }
  syncAttachmentText(s);
}

function netEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!netLive(s)) return false;
  // Rescue from the Trolls: "When Revealed: Each player places the
  // lowest-threat-cost hero he controls facedown underneath Rescue from the
  // Trolls, out of play."
  if (code === N.rescue) {
    const quest = newest(s, code);
    if (fromReveal && quest)
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("netRescueTake", { target: quest.id, player }),
        ),
      );
    return true;
  }
  if (code !== N.thunder && code !== N.barren) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.barren) {
    // Barren and Desolate: "When Revealed: Attach to a side quest. (Limit 1
    // per quest.)" (Its surge is the printed keyword.)
    const targets = sideQuests(s).filter(
      (q) => !q.attachments.some((a) => a.code === N.barren),
    );
    if (!targets.length) {
      log(s, "Barren and Desolate: no side quest can take it.");
      s.encounterDiscard.push(code);
      return true;
    }
    const attach = (q: Unit) => fx("netBarren", { target: q.id, code });
    if (targets.length === 1) prepend(s, attach(targets[0]));
    else
      forOwner(s, firstPlayer(s), () =>
        choose(
          s,
          "Barren and Desolate · Attach to a side quest",
          targets.map((q) => ({
            id: q.id,
            code: q.code,
            label: name(q),
            effects: [attach(q)],
          })),
          card(code).text,
        ),
      );
    return true;
  }
  // Crashing Thunder: "When Revealed: Each player assigns X damage among
  // characters he controls, where X is the number of quests in play. Exhaust
  // each damaged character in play."
  s.encounterDiscard.push(code);
  const x = questCount(s);
  log(
    s,
    `Crashing Thunder: each player assigns ${x} damage among characters they control (the quests in play); then each damaged character is exhausted.`,
    "danger",
  );
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("netAssign", { value: x, code, player }),
    ),
    fx("netThunderExhaust", { player: firstPlayer(s) }),
  );
  return true;
}

function netShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !netLive(s)) return false;
  // Rocky Foothills: "Attacking enemy gets +1 [attack] for each damage on
  // the defending character."
  if (code === N.foothills) {
    const hurt = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
      .map((id) => get(s, id))
      .reduce((n, u) => n + (u?.damage ?? 0), 0);
    c.attackBonus += hurt;
    log(
      s,
      `Rocky Foothills: the attacking enemy gets +${hurt} [attack] (the defending character's damage).`,
      hurt ? "danger" : undefined,
    );
    return true;
  }
  // Vast Troll-fells: "If no progress was placed on a side quest this round,
  // attacking enemy gets +4 [attack]."
  if (code === N.vastFells) {
    const none = s.nightmare?.ettenSideProgress !== s.round;
    if (none) c.attackBonus += 4;
    log(
      s,
      none
        ? "Vast Troll-fells: no progress was placed on a side quest this round, so the attacking enemy gets +4 [attack]."
        : "Vast Troll-fells: progress was placed on a side quest this round.",
      none ? "danger" : undefined,
    );
    return true;
  }
  // Crashing Thunder: "Shuffle each Weather card from the encounter discard
  // pile into the encounter deck."
  if (code === N.thunder) {
    const weather = s.encounterDiscard.filter((x) => traitOf(x, "Weather"));
    s.encounterDiscard = s.encounterDiscard.filter(
      (x) => !traitOf(x, "Weather"),
    );
    s.encounterDeck.push(...weather);
    shuffle(s, s.encounterDeck);
    log(
      s,
      `Crashing Thunder: ${weather.length} Weather card${weather.length === 1 ? " is" : "s are"} shuffled into the encounter deck.`,
      weather.length ? "danger" : undefined,
    );
    return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

/** A hero placed facedown underneath Rescue from the Trolls leaves play. */
function placeUnder(s: GameState, hero: Unit, quest: Unit) {
  const controller = ownerOf(s, hero),
    owner = hero.owner ?? controller;
  for (const a of [...hero.attachments]) discardAttachment(s, hero, a, true);
  forOwner(s, controller, () => {
    s.heroes = s.heroes.filter((x) => x.id !== hero.id);
    s.committedIds = s.committedIds.filter((id) => id !== hero.id);
  });
  ((s.nightmare ??= {}).ettenRescue ??= []).push({
    questId: quest.id,
    unit: hidden(hero, owner),
  });
  characterLeftPlay(s, hero, controller, {
    zone: "captured",
    player: owner,
    id: quest.id,
  });
  log(
    s,
    `${name(hero)} is placed facedown underneath Rescue from the Trolls, out of play.`,
    "danger",
  );
  syncAttachmentText(s);
}

export function nightmareEttenEffect(s: GameState, e: Effect): boolean {
  if (!netLive(s)) return false;
  if (e.kind === "ettenSetup") {
    netSetup(s);
    return true;
  }
  if (e.kind === "ettenFindSide") {
    // Stage 1B reveals the side quest it finds (the standard stage adds it);
    // stages 2A and 3A then find a safe location to guard it.
    const found = findSide(s);
    if (found) {
      if (e.flag) prepend(s, fx("netSafe", { code: found }));
      revealed(s, found);
    }
    return true;
  }
  // The Nightmare stage 1B gives no progress for a defeated side quest.
  if (e.kind === "ettenMainProgress") return true;
  if (!e.kind.startsWith("net")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "netReveal":
      // The setup's random side quest, revealed guarding its safe location.
      prepend(s, fx("netGuard", { code: e.code, target: e.target }));
      revealed(s, e.code!);
      return true;
    case "netGuard": {
      const location = s.staging.find((x) => x.id === e.target);
      const side = [...s.staging]
        .reverse()
        .find((x) => x.code === e.code && !x.guarding);
      if (location && side) {
        side.guarding = location.id;
        log(s, `${name(location)} is guarded by ${name(side)}.`);
      }
      return true;
    }
    case "netSafe": {
      // The setup card: "...also discard cards from the top of the encounter
      // deck until a location with the safe keyword is discarded. Attach
      // that location to the newly revealed side quest, as a guarded
      // objective."
      const side = [...s.staging]
        .reverse()
        .find((x) => x.code === e.code && !x.guarding);
      if (!side) return true;
      let safe: string | undefined;
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (isSafe(code)) {
          safe = code;
          break;
        }
        s.encounterDiscard.push(code);
      }
      if (!safe) {
        log(s, "Across the Ettenmoors: no safe location is left to discard.");
        return true;
      }
      const location = make(s, safe);
      s.staging.push(location);
      side.guarding = location.id;
      log(
        s,
        `Across the Ettenmoors: ${name(location)} is discarded and attached to ${name(side)} as a guarded objective.`,
        "danger",
      );
      return true;
    }
    case "netSpend": {
      const heroes = seatView(s, p).heroes.filter((h) => h.resources > 0);
      const spend = (h: Unit) =>
        fx("resource", { target: h.id, value: -1, flag: true, player: p });
      if (!heroes.length) return true;
      if (heroes.length === 1) prepend(s, spend(heroes[0]));
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Vast Troll-fells${seatLabel(s, p)} · Spend 1 resource to travel to the safe location`,
            heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `${name(h)} · ${h.resources} resource${h.resources === 1 ? "" : "s"}`,
              effects: [spend(h)],
            })),
            card(N.vastFells).text,
          ),
        );
      return true;
    }
    case "netSerpent": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      const players = playerOrder(s);
      const engageBy = (player: number) =>
        fx("netSerpentEngage", { target: u.id, player });
      if (players.length === 1) prepend(s, engageBy(players[0]));
      else
        forOwner(s, firstPlayer(s), () =>
          choose(
            s,
            "Hoarwell River Serpent · Choose the player who engages it",
            players.map((player) => ({
              id: `player-${player}`,
              label: seatName(s, player),
              effects: [engageBy(player)],
            })),
            card(N.serpent).text,
          ),
        );
      return true;
    }
    case "netSerpentEngage":
      if (u && s.staging.some((x) => x.id === u.id))
        forOwner(s, p, () => engage(s, u));
      return true;
    case "netAssign": {
      const remaining = e.value ?? 0;
      const view = seatView(s, p);
      const targets = [...view.heroes, ...view.allies].filter(
        (x) => isCharacter(x) && x.damage < stats(s, x).health,
      );
      if (remaining <= 0 || !targets.length) return true;
      const deal = (x: Unit) => [
        fx("damage", { target: x.id, value: 1, player: p }),
        fx("netAssign", { value: remaining - 1, code: e.code, player: p }),
      ];
      if (targets.length === 1) {
        prepend(s, ...deal(targets[0]));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(e.code!).name}${seatLabel(s, p)} · Assign damage · ${remaining} remaining`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: deal(x),
          })),
          card(e.code!).text,
        ),
      );
      return true;
    }
    case "netThunderExhaust":
      for (const x of globalCharacters(s).filter(
        (c) => isCharacter(c) && c.damage > 0,
      ))
        exhaustCharacter(s, x);
      return true;
    case "netBarren": {
      if (
        !u ||
        !sideQuests(s).some((q) => q.id === u.id) ||
        u.attachments.some((a) => a.code === N.barren)
      ) {
        s.encounterDiscard.push(e.code ?? N.barren);
        return true;
      }
      u.attachments.push({
        id: make(s, N.barren).id,
        code: N.barren,
        exhausted: false,
      });
      log(
        s,
        `Barren and Desolate is attached to ${name(u)}: while it is the current quest, each character gets -1 [willpower].`,
        "danger",
      );
      syncAttachmentText(s);
      return true;
    }
    case "netRescueTake": {
      const quest = s.staging.find((x) => x.id === e.target);
      const heroes = seatView(s, p).heroes.filter(isHero);
      if (!quest || !heroes.length) return true;
      const low = Math.min(...heroes.map((h) => card(h.code).threat ?? 0));
      const lowest = heroes.filter((h) => (card(h.code).threat ?? 0) === low);
      const take = (h: Unit) =>
        fx("netRescueHero", { target: h.id, source: quest.id, player: p });
      if (lowest.length === 1) prepend(s, take(lowest[0]));
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Rescue from the Trolls${seatLabel(s, p)} · Place your lowest-threat-cost hero underneath it`,
            lowest.map((h) => ({
              id: h.id,
              code: h.code,
              label: `${name(h)} · threat cost ${low}`,
              effects: [take(h)],
            })),
            card(N.rescue).text,
          ),
        );
      return true;
    }
    case "netRescueHero": {
      const quest = s.staging.find((x) => x.id === e.source);
      if (
        quest &&
        u &&
        isHero(u) &&
        seatView(s, p).heroes.some((h) => h.id === u.id)
      )
        placeUnder(s, u, quest);
      return true;
    }
    case "netRescueProgress": {
      const quest = s.staging.find((x) => x.id === e.target);
      if (quest && sideLive(s, quest, N.rescue)) {
        log(
          s,
          "Rescue from the Trolls: a Troll enemy is destroyed, so 3 progress is placed on it.",
          "good",
        );
        addQuestProgress(s, quest, 3);
      }
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_ETTEN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  stageInfo: netStageInfo,
  travelProblem: netTravelProblem,
  travelEffects: netTravelEffects,
  mustTravel: foothillsFirst,
  cannotAttack: netCannotAttack,
  cannotDefend: netCannotDefend,
  engaged: netEngaged,
  locationQuestBonus: netLocationQuestBonus,
  cannotDraw: netCannotDraw,
  cannotGainResources: netCannotGainResources,
  discardCardKept: netDiscardCardKept,
  questProgressPlaced: netQuestProgressPlaced,
  stats: netStats,
  characterDestroyed: netCharacterDestroyed,
  sideDefeated: netSideDefeated,
  encounter: netEncounter,
  shadow: netShadow,
  effect: nightmareEttenEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareEtten(s: GameState) {
  const q = s.nightmare;
  if (q?.ettenRescue === undefined && q?.ettenSideProgress === undefined)
    return true;
  const seats = s.table?.seats.length ?? 1;
  return (
    netLive(s) &&
    (q.ettenSideProgress === undefined ||
      (Number.isInteger(q.ettenSideProgress) &&
        q.ettenSideProgress >= 0 &&
        q.ettenSideProgress <= s.round)) &&
    (q.ettenRescue === undefined ||
      (Array.isArray(q.ettenRescue) &&
        q.ettenRescue.length > 0 &&
        q.ettenRescue.every(
          (r) =>
            !!r &&
            typeof r.questId === "string" &&
            s.staging.some((x) => x.id === r.questId && x.code === N.rescue) &&
            !!r.unit &&
            typeof r.unit.id === "string" &&
            heroCode(r.unit.code) &&
            Number.isInteger(r.unit.owner) &&
            r.unit.owner! >= 0 &&
            r.unit.owner! < seats &&
            Array.isArray(r.unit.attachments) &&
            !r.unit.attachments.length &&
            r.unit.damage === 0 &&
            r.unit.resources === 0,
        )))
  );
}
