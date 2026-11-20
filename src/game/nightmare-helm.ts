/**
 * Helm's Deep's Nightmare Deck (docs/NIGHTMARE.md): its Nightmare encounter
 * cards (the setup card has no rule of its own), composed with the
 * scenario's own rules (src/game/helms-deep.ts) through batch4Scenario while
 * a Nightmare mode game is played. The scenario's active-location progress
 * ("hdActiveProgress"), its Toughness and its archery total (which adds the
 * archery a layer gives a card) serve the Nightmare cards. Effects use the
 * "nhd" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardAttachment,
  enemyAddedToStaging,
  exhaustCharacter,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
  startPhase,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import { addCurrentQuestProgress } from "./side-quests";
import { HD, helmsDeepDefense } from "./helms-deep-support";
import { NIGHTMARE_TOS as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

export interface NightmareHelmState {
  /** Rain of Arrows: the locations that gained archery 1 until the end of the round. */
  helmArrows?: { round: number; ids: string[] }[];
  /** Crippling Weariness: the round in which characters cannot be readied by player card effects. */
  helmWeariness?: number;
  /** Crippling Weariness's shadow: characters that cannot ready until the end of the round. */
  helmNoReady?: { id: string; round: number }[];
}

const hdLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "helms-deep" && !!s.helmsDeep;
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter((u) => live(s, u, code));
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const activeOf = (s: GameState, code: string) =>
  allActiveLocations(s).filter((u) => live(s, u, code));
const isLocation = (u: Unit) => card(u.code).type_code === "location";
/** Stage 4B, The Wall is Breached!'s back side. */
const atStageFourB = (s: GameState) =>
  s.helmsDeep?.currentQuest === HD.breached && !s.stageRevealing;

// ------------------------------------------------------------- the cards

/** Host of Isengard: "Cannot have attachments." */
const hdCannotAttach = (s: GameState, u: Unit) =>
  hdLive(s) && live(s, u, N.host);
/**
 * Host of Isengard (staged): "Forced: At the end of the round, place 1
 * progress on the current quest (bypassing any active location)."
 * Glittering Caves (active): "Forced: At the end of the round, add
 * Glittering Caves to the victory display and raise each player's threat by
 * 2."
 */
function hdRoundEnd(s: GameState): Effect[] {
  if (!hdLive(s)) return [];
  const p = firstPlayer(s);
  return [
    ...staged(s, N.host).map((u) => fx("nhdHost", { target: u.id, player: p })),
    ...activeOf(s, N.caves).map((u) =>
      fx("nhdCaves", { target: u.id, player: p }),
    ),
  ];
}
/**
 * Bloodied Berserker: "Forced: When Bloodied Berserker is dealt a shadow
 * card with no effect, either place 2 progress on the active location, or
 * Bloodied Berserker makes an additional attack against you."
 */
function hdShadowResolved(s: GameState, enemy: Unit, code: string) {
  const c = s.combat;
  if (!hdLive(s) || !c || card(code).shadow || !live(s, enemy, N.berserker))
    return;
  prepend(
    s,
    fx("nhdBerserker", {
      target: enemy.id,
      player: c.attackPlayer ?? activeSeat(s),
    }),
  );
}
/** Hornburg Wall: "Each enemy gains Toughness 1." (For each copy in play, with the scenario's Toughness.) */
function hdDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _ctx: DamageContext,
) {
  if (!hdLive(s) || amount <= 0 || !isEnemy(u)) return amount;
  const walls = inPlay(s, N.hornburgWall).length;
  if (!walls) return amount;
  const reduced = Math.max(0, amount - walls);
  log(
    s,
    `Hornburg Wall: ${name(u)} has Toughness ${walls} more; the damage dealt to it is reduced to ${reduced}.`,
  );
  return reduced;
}
/**
 * Hornburg Wall: "Forced: When Hornburg Wall is explored, exhaust each ally
 * in play." Helm's Dike: "Forced: When Helm's Dike is explored, shuffle the
 * encounter discard pile into the encounter deck and discard cards from the
 * top until an enemy is discarded. Add the discarded enemy to the staging
 * area."
 */
function hdExplored(s: GameState, u: Unit) {
  if (!hdLive(s)) return;
  if (live(s, u, N.hornburgWall))
    prepend(s, fx("nhdWallExhaust", { player: firstPlayer(s) }));
  if (live(s, u, N.helmsDike))
    prepend(s, fx("nhdDike", { player: firstPlayer(s) }));
}
/** Glittering Caves: "Immune to player card effects." */
const hdImmune = (s: GameState, u: Unit) => hdLive(s) && live(s, u, N.caves);
/** Glittering Caves: "The players cannot travel here unless they are at stage 4B." */
const hdTravelProblem = (s: GameState, u: Unit) =>
  hdLive(s) && live(s, u, N.caves) && !atStageFourB(s)
    ? "Glittering Caves: the players cannot travel here unless they are at stage 4B."
    : null;
/** Helm's Dike (active): "each enemy gets –10 engagement cost." */
const hdEngagementBonus = (s: GameState, u: Unit) =>
  hdLive(s) && isEnemy(u) ? -10 * activeOf(s, N.helmsDike).length : 0;
/** Rain of Arrows: "each location in the staging area gains archery 1 until the end of the round." */
const hdUnitArchery = (s: GameState, u: Unit) =>
  hdLive(s) && isLocation(u) && s.staging.some((x) => x.id === u.id)
    ? (s.nightmare?.helmArrows ?? []).filter(
        (m) => m.round === s.round && m.ids.includes(u.id),
      ).length
    : 0;
/** Crippling Weariness: "Until the end of the round, characters cannot be readied by player card effects." */
const hdCannotPlayerReady = (s: GameState) =>
  hdLive(s) && s.nightmare?.helmWeariness === s.round;
/** Crippling Weariness's shadow: "Until the end of the round, defending character cannot ready." */
const hdCannotReady = (s: GameState, u: Unit) =>
  hdLive(s) &&
  (s.nightmare?.helmNoReady ?? []).some(
    (m) => m.id === u.id && m.round === s.round,
  );

function hdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!hdLive(s) || (code !== N.arrows && code !== N.crippling)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  const p = firstPlayer(s);
  if (code === N.arrows) {
    // Rain of Arrows: "When Revealed: Either remove 1 resource token from
    // The Defense of Helm's Deep, or each location in the staging area
    // gains archery 1 until the end of the round."
    prepend(s, fx("nhdArrows", { player: p }));
    return true;
  }
  // Crippling Weariness: "When Revealed: Each player exhausts a character he
  // controls. Until the end of the round, characters cannot be readied by
  // player card effects."
  (s.nightmare ??= {}).helmWeariness = s.round;
  log(
    s,
    "Crippling Weariness: until the end of the round, characters cannot be readied by player card effects.",
    "danger",
  );
  prepend(s, ...playerOrder(s).map((player) => fx("nhdExhaust", { player })));
  return true;
}

function hdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !hdLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Bloodied Berserker: "Attacking enemy gets +1 [attack]."
    case N.berserker:
      c.attackBonus += 1;
      log(
        s,
        "Bloodied Berserker: the attacking enemy gets +1 [attack].",
        "danger",
      );
      return true;
    // Hornburg Wall: "Discard a non-objective attachment you control."
    case N.hornburgWall:
      prepend(s, fx("nhdAttachment", { player: p }));
      return true;
    // Rain of Arrows: "Attacking enemy makes an additional attack against
    // you after this one."
    case N.arrows:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Rain of Arrows: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    // Crippling Weariness: "Until the end of the round, defending character
    // cannot ready."
    case N.crippling: {
      const ids = c.defenderIds?.length
        ? c.defenderIds
        : c.defenderId
          ? [c.defenderId]
          : [];
      const q = (s.nightmare ??= {});
      q.helmNoReady = [
        ...(q.helmNoReady ?? []).filter((m) => m.round === s.round),
        ...ids.map((id) => ({ id, round: s.round })),
      ];
      log(
        s,
        ids.length
          ? `Crippling Weariness: ${ids.map((id) => name(get(s, id)!)).join(", ")} cannot ready until the end of the round.`
          : "Crippling Weariness: the attack is undefended.",
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareHelmEffect(s: GameState, e: Effect): boolean {
  // Glittering Caves (active): "Skip the combat phase."
  if (e.kind === "startCombat" && hdLive(s) && activeOf(s, N.caves).length) {
    log(
      s,
      "Glittering Caves is the active location: the players skip the combat phase.",
    );
    startPhase(s, "defense");
    prepend(s, fx("phaseEnd"), fx("endCombat"));
    return true;
  }
  if (!e.kind.startsWith("nhd")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nhdHost":
      if (u && s.staging.some((x) => x.id === u.id)) {
        log(
          s,
          "Host of Isengard: at the end of the round, 1 progress is placed on the current quest, bypassing the active location.",
          "danger",
        );
        addCurrentQuestProgress(s, 1);
      }
      return true;
    case "nhdCaves": {
      if (!u || !allActiveLocations(s).some((x) => x.id === u.id)) return true;
      if (s.activeLocation?.id === u.id) s.activeLocation = null;
      else
        s.extraActiveLocations = (s.extraActiveLocations ?? []).filter(
          (x) => x.id !== u.id,
        );
      s.encounterDiscard.push(...u.attachments.map((a) => a.code));
      (s.victoryCards ??= []).push(u.code);
      s.victory += card(u.code).victory ?? 0;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 2, "encounter"));
      log(
        s,
        "Glittering Caves: at the end of the round, it is added to the victory display, and each player raises their threat by 2.",
        "danger",
      );
      return true;
    }
    case "nhdBerserker": {
      const enemy = u;
      const options: Option[] = [];
      if (allActiveLocations(s).length)
        options.push({
          id: "progress",
          label: "Place 2 progress on the active location",
          effects: [
            fx("hdActiveProgress", {
              value: 2,
              text: "Bloodied Berserker",
              player: firstPlayer(s),
            }),
          ],
        });
      if (enemy && s.combat?.enemyId === enemy.id)
        options.push({
          id: "attack",
          code: enemy.code,
          label: "Bloodied Berserker makes an additional attack against you",
          effects: [fx("nhdExtraAttack", { target: enemy.id, player: p })],
        });
      if (!options.length) return true;
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Bloodied Berserker${seatLabel(s, p)} · 2 progress on the active location, or an additional attack`,
            options,
            card(N.berserker).text,
          ),
        );
      return true;
    }
    case "nhdExtraAttack":
      if (s.combat && s.combat.enemyId === e.target) {
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
        log(
          s,
          "Bloodied Berserker: it makes an additional attack after this one.",
          "danger",
        );
      }
      return true;
    case "nhdWallExhaust": {
      const names: string[] = [];
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          for (const a of s.allies.filter((x) => isAlly(x) && !x.exhausted)) {
            exhaustCharacter(s, a);
            names.push(name(a));
          }
        });
      log(
        s,
        `Hornburg Wall is explored: ${names.length ? `${names.join(", ")} ${names.length === 1 ? "is" : "are"} exhausted` : "no ready ally is in play"}.`,
        "danger",
      );
      return true;
    }
    case "nhdDike": {
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      let enemy: string | undefined;
      let discarded = 0;
      while (s.encounterDeck.length) {
        const c = s.encounterDeck.shift()!;
        if (card(c).type_code === "enemy") {
          enemy = c;
          break;
        }
        s.encounterDiscard.push(c);
        discarded++;
      }
      if (enemy) {
        const x = make(s, enemy);
        s.staging.push(x);
        enemyAddedToStaging(s, x);
      }
      log(
        s,
        `Helm's Dike is explored: the encounter discard pile is shuffled into the encounter deck; ${enemy ? `${card(enemy).name} is added to the staging area` : "no enemy is found"}${discarded ? ` (${discarded} other card${discarded === 1 ? "" : "s"} discarded)` : ""}.`,
        "danger",
      );
      return true;
    }
    case "nhdArrows": {
      const defense = helmsDeepDefense(s);
      const locations = s.staging.filter((x) => isLocation(x));
      const options: Option[] = [];
      if (defense && defense.resources > 0)
        options.push({
          id: "token",
          code: HD.defense,
          label: `Remove 1 resource token from The Defense of Helm's Deep (${defense.resources})`,
          effects: [fx("nhdArrowsToken", { player: p })],
        });
      if (locations.length)
        options.push({
          id: "archery",
          label: `Each location in the staging area gains archery 1 until the end of the round (${locations.length})`,
          effects: [fx("nhdArrowsArchery", { player: p })],
        });
      if (!options.length) {
        log(
          s,
          "Rain of Arrows: The Defense of Helm's Deep has no resource token, and no location is in the staging area.",
        );
        return true;
      }
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Rain of Arrows${seatLabel(s, p)} · A Defense token, or archery 1 for each staged location`,
            options,
            card(N.arrows).text,
          ),
        );
      return true;
    }
    case "nhdArrowsToken": {
      const defense = helmsDeepDefense(s);
      if (defense && defense.resources > 0) {
        defense.resources -= 1;
        log(
          s,
          `Rain of Arrows: 1 resource token is removed from The Defense of Helm's Deep (${defense.resources} left).`,
          "danger",
        );
      }
      return true;
    }
    case "nhdArrowsArchery": {
      const ids = s.staging.filter((x) => isLocation(x)).map((x) => x.id);
      const q = (s.nightmare ??= {});
      q.helmArrows = [
        ...(q.helmArrows ?? []).filter((m) => m.round === s.round),
        { round: s.round, ids },
      ];
      log(
        s,
        `Rain of Arrows: ${ids.length} location${ids.length === 1 ? "" : "s"} in the staging area gain${ids.length === 1 ? "s" : ""} archery 1 until the end of the round.`,
        "danger",
      );
      return true;
    }
    case "nhdExhaust": {
      const view = seatView(s, p);
      const ready = [...view.heroes, ...view.allies].filter(
        (x) => (isHero(x) || isAlly(x)) && !x.exhausted,
      );
      if (!ready.length) {
        log(
          s,
          `Crippling Weariness: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      const exhaust = (x: Unit) =>
        fx("nhdExhaustCharacter", {
          target: x.id,
          player: p,
        });
      if (ready.length === 1) {
        prepend(s, exhaust(ready[0]));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Crippling Weariness${seatLabel(s, p)} · Exhaust a character you control`,
          ready.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [exhaust(x)],
          })),
          card(N.crippling).text,
        ),
      );
      return true;
    }
    case "nhdExhaustCharacter":
      if (u) forOwner(s, p, () => exhaustCharacter(s, u));
      return true;
    case "nhdAttachment": {
      const options: Option[] = [];
      const view = seatView(s, p);
      for (const host of [...view.heroes, ...view.allies, ...view.engaged])
        for (const a of host.attachments)
          if (
            card(a.code).type_code !== "objective" &&
            !card(a.code).text?.includes("Permanent") &&
            attachmentController(s, host, a) === p
          )
            options.push({
              id: a.id,
              code: a.code,
              label: `${card(a.code).name} · ${name(host)}`,
              effects: [
                fx("nhdDiscardAttachment", {
                  target: host.id,
                  source: a.id,
                  player: p,
                }),
              ],
            });
      if (!options.length)
        log(
          s,
          `Hornburg Wall: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
      else if (options.length === 1) prepend(s, ...options[0].effects);
      else
        forOwner(s, p, () =>
          choose(
            s,
            `Hornburg Wall${seatLabel(s, p)} · Discard a non-objective attachment you control`,
            options,
            card(N.hornburgWall).shadow,
          ),
        );
      return true;
    }
    case "nhdDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `Hornburg Wall: ${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_HELM_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotAttach: hdCannotAttach,
  roundEnd: hdRoundEnd,
  shadowResolved: hdShadowResolved,
  damageAmount: hdDamageAmount,
  explored: hdExplored,
  immune: hdImmune,
  travelProblem: hdTravelProblem,
  engagementBonus: hdEngagementBonus,
  unitArchery: hdUnitArchery,
  cannotPlayerReady: hdCannotPlayerReady,
  cannotReady: hdCannotReady,
  encounter: hdEncounter,
  shadow: hdShadow,
  effect: nightmareHelmEffect,
  sharedEffect: () => false,
};

// ------------------------------------------------------------- saves

export function validNightmareHelm(s: GameState) {
  const q = s.nightmare;
  if (
    q?.helmArrows === undefined &&
    q?.helmWeariness === undefined &&
    q?.helmNoReady === undefined
  )
    return true;
  const round = (n: unknown) =>
    Number.isInteger(n) && (n as number) >= 0 && (n as number) <= s.round;
  return (
    hdLive(s) &&
    (q.helmArrows === undefined ||
      (Array.isArray(q.helmArrows) &&
        q.helmArrows.every(
          (m) =>
            !!m &&
            round(m.round) &&
            Array.isArray(m.ids) &&
            m.ids.every((id) => typeof id === "string"),
        ))) &&
    (q.helmWeariness === undefined || round(q.helmWeariness)) &&
    (q.helmNoReady === undefined ||
      (Array.isArray(q.helmNoReady) &&
        q.helmNoReady.every(
          (m) => !!m && typeof m.id === "string" && round(m.round),
        )))
  );
}
