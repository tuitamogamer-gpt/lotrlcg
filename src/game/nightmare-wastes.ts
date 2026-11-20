/**
 * The Wastes of Eriador's Nightmare Deck (docs/NIGHTMARE.md): its Nightmare
 * encounter cards (the setup card has no rule of its own), composed with the
 * scenario's own rules (src/game/wastes-eriador.ts) through batch4Scenario
 * while a Nightmare mode game is played. Day and Night follow the scenario's
 * Time objective (its "wastesFlip" effect flips it, and Make a Stand holds
 * back the flip to Daybreak); the scenario's stage goals add the quest points
 * a layer gives the main quest. Effects use the "nwe" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  addVictoryCard,
  destroy,
  discardAttachment,
  discardQuestAttachments,
  engage,
} from "./board";
import {
  allActiveLocations,
  activeSeat,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { who } from "./black-riders-hunted";
import {
  allQuestUnits,
  attachToQuest,
  currentQuestUnit,
  mainQuestUnit,
} from "./quest-state";
import { selectedSideQuest } from "./side-quest-support";
import { syncAttachmentText } from "./attachment-text";
import { wastesIsNight } from "./wastes-eriador";
import { NIGHTMARE_AA as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel, traitOf } from "./nightmare-core";

const weLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "wastes-of-eriador" && !!s.wastesEriador;
const night = (s: GameState) => wastesIsNight(s);
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(s, u, code));
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isWarg = (u: Unit) => isEnemy(u) && traitOf(u.code, "Warg");
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter(isEnemy);
const discardable = (code: string) =>
  !/\bPermanent\b/.test(card(code).text ?? "");
/** Cunning Wolves attached to a quest card (its text box not blank). */
const wolvesOn = (quest: Unit | undefined) =>
  (quest?.attachments ?? []).filter((a) => a.code === N.wolves && !a.blanked)
    .length;
const sideQuests = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "encounter-side-quest");
const wolvesInPlay = (s: GameState) =>
  [...allQuestUnits(s), ...sideQuests(s)].reduce((n, q) => n + wolvesOn(q), 0);
const standOf = (s: GameState) => staged(s, N.stand)[0];
/** Resolve a lone option directly; let the player choose between several. */
function pick(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  text?: string,
) {
  if (!options.length) return;
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () => choose(s, `${title}${seatLabel(s, p)}`, options, text));
}

// ------------------------------------------------------------- the cards

/** Pack Hunters: "While it is Night, Pack Hunters gets –30 engagement cost." */
const weEngagementBonus = (s: GameState, u: Unit) =>
  weLive(s) && night(s) && live(s, u, N.packHunters) ? -30 : 0;
/**
 * Pack Hunters: "Forced: When you engage Pack Hunters, search the top 5 cards
 * of the encounter deck for a Warg enemy, and put it into play engaged with
 * you (top 10 cards instead if it is Night). Shuffle the encounter deck."
 */
function weEngaged(s: GameState, u: Unit) {
  if (!weLive(s) || !live(s, u, N.packHunters)) return;
  prepend(
    s,
    fx("nweHunters", {
      target: u.id,
      value: night(s) ? 10 : 5,
      player: ownerOf(s, u),
    }),
  );
}
/** Shrouded Wilderness: "While it is Night, progress cannot be placed on Shrouded Wilderness." */
const weLocationProgressBlocked = (s: GameState, u: Unit) =>
  weLive(s) && night(s) && live(s, u, N.wilderness);
/**
 * Snowy Badlands: "Travel: Each player deals 1 damage to an exhausted
 * character he controls to travel here (2 damage instead if it is Night)."
 */
function weTravelProblem(s: GameState, u: Unit) {
  if (!weLive(s) || !live(s, u, N.badlands)) return null;
  return playerOrder(s).every((p) =>
    [...seatView(s, p).heroes, ...seatView(s, p).allies].some(
      (x) => isCharacter(x) && x.exhausted,
    ),
  )
    ? null
    : "Snowy Badlands: each player must deal damage to an exhausted character they control to travel here.";
}
/** Shrouded Wilderness: "Travel: Flip the Time objective from Daybreak to Nightfall." */
function weTravelEffects(s: GameState, u: Unit): Effect[] | undefined {
  if (!weLive(s)) return undefined;
  if (live(s, u, N.wilderness))
    return [fx("wastesFlip", { flag: true, player: firstPlayer(s) })];
  if (live(s, u, N.badlands)) {
    const value = night(s) ? 2 : 1;
    return playerOrder(s).map((player) => fx("nweBadlands", { value, player }));
  }
  return undefined;
}
/** Snowy Badlands: "While Snowy Badlands is in the staging area, each enemy in the staging area cannot take damage." */
function weDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _ctx: DamageContext,
) {
  if (
    !weLive(s) ||
    amount <= 0 ||
    !isEnemy(u) ||
    !s.staging.some((x) => x.id === u.id) ||
    !staged(s, N.badlands).length
  )
    return amount;
  log(
    s,
    `Snowy Badlands: ${name(u)} is in the staging area and cannot take damage.`,
  );
  return 0;
}
/** Cunning Wolves: "Each Warg enemy cannot be optionally engaged." */
const weCannotOptionallyEngage = (s: GameState, u: Unit) =>
  weLive(s) && isWarg(u) && wolvesInPlay(s) > 0;
/** Cunning Wolves: "Attached quest gets +3 quest points." */
const weMainQuestGoalBonus = (s: GameState) =>
  weLive(s) ? 3 * wolvesOn(mainQuestUnit(s)) : 0;
const weSideQuestGoalBonus = (s: GameState, quest: Unit) =>
  weLive(s) ? 3 * wolvesOn(quest) : 0;
/** Make a Stand has no quest points ("–"): progress cannot defeat it. */
const weSideDefeatBlocked = (s: GameState, u: Unit) =>
  weLive(s) && u.code === N.stand;
/** Forced off Track: "Response: When this quest is defeated, discard a non-unique Warg enemy in the staging area." */
function weSideDefeated(s: GameState, u: Unit) {
  if (!weLive(s) || !live(s, u, N.track)) return;
  prepend(s, fx("nweTrackDiscard", { player: firstPlayer(s) }));
}
/**
 * Forced off Track: "Forced: At the end of the round, remove X progress from
 * the main quest, where X is the number of Warg enemies in play."
 */
function weRoundEnd(s: GameState): Effect[] {
  if (!weLive(s)) return [];
  return staged(s, N.track).map((u) =>
    fx("nweTrack", { target: u.id, player: firstPlayer(s) }),
  );
}
/**
 * Make a Stand: "Response: After an enemy is defeated, place 1 resource
 * token on Make a Stand. Then, if there are 2 resource tokens per player on
 * Make a Stand, or if there are no enemies in play, add Make a Stand to the
 * victory display." (Always taken; it resolves once the enemy has left play.)
 */
function weCharacterDestroyed(s: GameState, u: Unit) {
  if (!weLive(s) || !isEnemy(u)) return;
  const stand = standOf(s);
  if (stand)
    prepend(s, fx("nweStand", { target: stand.id, player: firstPlayer(s) }));
}

function weEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!weLive(s)) return false;
  // Make a Stand: "When Revealed: If it is Day, flip the Time objective to
  // Nightfall."
  if (code === N.stand) {
    if (fromReveal && !night(s)) {
      log(
        s,
        "Make a Stand: it is Day, so the Time objective flips to Nightfall.",
        "danger",
      );
      prepend(s, fx("wastesFlip", { flag: true, player: firstPlayer(s) }));
    }
    return true;
  }
  if (code !== N.wolves && code !== N.hail) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (code === N.wolves) {
    // Cunning Wolves: "When Revealed: Attach to the current quest."
    const quest = currentQuestUnit(s);
    const attachment = { id: make(s, code).id, code, exhausted: false };
    if (quest && attachToQuest(s, quest.code, attachment)) {
      log(
        s,
        `Cunning Wolves is attached to ${name(quest)}: it gets +3 quest points, and each Warg enemy cannot be optionally engaged.`,
        "danger",
      );
      syncAttachmentText(s);
    } else s.encounterDiscard.push(code);
    return true;
  }
  // Torrent of Hail: "When Revealed: Deal 1 damage to each questing
  // character. If it is Night, discard an attachment from each character
  // damaged by this effect."
  s.encounterDiscard.push(code);
  const questing = globalCharacters(s).filter(
    (u) => isCharacter(u) && u.committed,
  );
  const dark = night(s);
  log(
    s,
    questing.length
      ? `Torrent of Hail: 1 damage is dealt to each questing character${dark ? "; it is Night, so each one damaged discards an attachment" : ""}.`
      : "Torrent of Hail: no character is questing.",
    "danger",
  );
  prepend(
    s,
    ...questing.flatMap((u) => [
      fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
      ...(dark
        ? [
            fx("nweHailCheck", {
              target: u.id,
              value: u.damage,
              player: ownerOf(s, u),
            }),
          ]
        : []),
    ]),
  );
  return true;
}

function weShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !weLive(s)) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    // Shrouded Wilderness: "Attacking enemy gets +1 [attack]. Then, if it is
    // Night, deal attacking enemy another shadow card."
    case N.wilderness:
      c.attackBonus += 1;
      log(
        s,
        `Shrouded Wilderness: the attacking enemy gets +1 [attack]${night(s) ? " and, at Night, another shadow card" : ""}.`,
        "danger",
      );
      if (night(s))
        prepend(s, fx("khazadExtraShadows", { target: c.enemyId, count: 1 }));
      return true;
    // Cunning Wolves: "If it is Night, deal attacking enemy 2 additional
    // shadow cards."
    case N.wolves:
      log(
        s,
        night(s)
          ? "Cunning Wolves: it is Night, so the attacking enemy is dealt 2 additional shadow cards."
          : "Cunning Wolves: it is Day, so its shadow has no effect.",
        night(s) ? "danger" : undefined,
      );
      if (night(s))
        prepend(s, fx("khazadExtraShadows", { target: c.enemyId, count: 2 }));
      return true;
    // Torrent of Hail: "Discard 1 attachment you control (2 attachments
    // instead if it is Night)."
    case N.hail:
      prepend(
        s,
        fx("nweAttachments", { value: night(s) ? 2 : 1, code, player: p }),
      );
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareWastesEffect(s: GameState, e: Effect): boolean {
  // Make a Stand: "The Time objective cannot flip to Daybreak."
  if (e.kind === "wastesFlip" && !e.flag && weLive(s) && standOf(s)) {
    log(s, "Make a Stand: the Time objective cannot flip to Daybreak.");
    return true;
  }
  if (!e.kind.startsWith("nwe")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "nweHunters": {
      const n = e.value ?? 5;
      const top = s.encounterDeck.slice(0, n);
      const found = [
        ...new Set(top.filter((c) => isWarg({ code: c } as Unit))),
      ];
      if (!found.length) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          `Pack Hunters: ${who(s, p)} ${s.table ? "finds" : "find"} no Warg enemy in the top ${n} cards of the encounter deck; it is shuffled.`,
        );
        return true;
      }
      pick(
        s,
        p,
        `Pack Hunters · Put a Warg enemy from the top ${n} cards into play engaged with you`,
        found.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("nweHuntersEngage", { code, value: n, player: p })],
        })),
        card(N.packHunters).text,
      );
      return true;
    }
    case "nweHuntersEngage": {
      const n = e.value ?? 5;
      const i = s.encounterDeck.slice(0, n).indexOf(e.code!);
      if (i >= 0) {
        const [code] = s.encounterDeck.splice(i, 1);
        const x = make(s, code);
        s.staging.push(x);
        log(
          s,
          `Pack Hunters: ${card(code).name} is put into play engaged with ${who(s, p)}.`,
          "danger",
        );
        forOwner(s, p, () => engage(s, x));
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "nweBadlands": {
      const view = seatView(s, p);
      const exhausted = [...view.heroes, ...view.allies].filter(
        (x) => isCharacter(x) && x.exhausted,
      );
      pick(
        s,
        p,
        `Snowy Badlands · Deal ${e.value} damage to an exhausted character you control`,
        exhausted.map((x) => ({
          id: x.id,
          code: x.code,
          label: `${name(x)} · ${x.damage} damage`,
          effects: [
            fx("damage", { target: x.id, value: e.value ?? 1, player: p }),
          ],
        })),
        card(N.badlands).text,
      );
      return true;
    }
    case "nweHailCheck": {
      if (!u || !isCharacter(u) || u.damage <= (e.value ?? 0)) return true;
      const owner = ownerOf(s, u);
      pick(
        s,
        owner,
        `Torrent of Hail · Discard an attachment from ${name(u)}`,
        u.attachments
          .filter((a) => discardable(a.code))
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: card(a.code).name,
            effects: [
              fx("nweDiscardAttachment", {
                target: u.id,
                source: a.id,
                code: N.hail,
                player: owner,
              }),
            ],
          })),
        card(N.hail).text,
      );
      return true;
    }
    case "nweAttachments": {
      const remaining = e.value ?? 1;
      if (remaining <= 0) return true;
      const options: Option[] = [];
      for (const host of [
        ...globalCharacters(s),
        ...globalEngaged(s),
        ...s.staging,
        ...allActiveLocations(s),
      ])
        for (const a of host.attachments)
          if (attachmentController(s, host, a) === p && discardable(a.code))
            options.push({
              id: a.id,
              code: a.code,
              label: `${card(a.code).name} · ${name(host)}`,
              effects: [
                fx("nweDiscardAttachment", {
                  target: host.id,
                  source: a.id,
                  code: e.code,
                  player: p,
                }),
                fx("nweAttachments", {
                  value: remaining - 1,
                  code: e.code,
                  player: p,
                }),
              ],
            });
      if (!options.length) {
        log(
          s,
          `${card(e.code!).name}: ${who(s, p)} control${s.table ? "s" : ""} no attachment.`,
        );
        return true;
      }
      pick(
        s,
        p,
        `${card(e.code!).name} · Discard an attachment you control (${remaining} left)`,
        options,
        card(e.code!).shadow,
      );
      return true;
    }
    case "nweDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(
          s,
          `${card(e.code!).name}: ${card(a.code).name} is discarded.`,
          "danger",
        );
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
    case "nweStand": {
      const stand = standOf(s);
      if (!stand || stand.id !== e.target) return true;
      stand.resources += 1;
      const goal = 2 * playerOrder(s).length;
      const clear = !enemiesInPlay(s).length;
      log(
        s,
        `Make a Stand: an enemy is defeated, so 1 resource token is placed on it (${stand.resources} of ${goal}).`,
        "good",
      );
      if (stand.resources < goal && !clear) return true;
      const selected = selectedSideQuest(s);
      if (selected?.id === stand.id) selected.defeated = true;
      discardQuestAttachments(s, stand.code, stand.id);
      s.staging = s.staging.filter((x) => x.id !== stand.id);
      addVictoryCard(s, stand.code);
      log(
        s,
        `Make a Stand is added to the victory display (${clear ? "no enemy is in play" : `${goal} resource tokens`}).`,
        "good",
      );
      return true;
    }
    case "nweTrack": {
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      const x = enemiesInPlay(s).filter(isWarg).length;
      const removed = Math.min(s.progress, x);
      s.progress -= removed;
      log(
        s,
        `Forced off Track: at the end of the round, ${removed} progress ${removed === 1 ? "is" : "are"} removed from the main quest (${x} Warg ${x === 1 ? "enemy" : "enemies"} in play).`,
        removed ? "danger" : undefined,
      );
      return true;
    }
    case "nweTrackDiscard": {
      const wargs = s.staging.filter(
        (x) => isWarg(x) && !card(x.code).is_unique,
      );
      if (!wargs.length) {
        log(
          s,
          "Forced off Track is defeated: no non-unique Warg enemy is in the staging area.",
        );
        return true;
      }
      pick(
        s,
        p,
        "Forced off Track · Discard a non-unique Warg enemy in the staging area",
        wargs.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("nweTrackDrop", { target: x.id, player: p })],
        })),
        card(N.track).text,
      );
      return true;
    }
    case "nweTrackDrop":
      if (u && s.staging.some((x) => x.id === u.id)) {
        log(s, `Forced off Track: ${name(u)} is discarded.`, "good");
        destroy(s, u, false, "discard", false);
      }
      return true;
  }
  return false;
}

export const NIGHTMARE_WASTES_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  engagementBonus: weEngagementBonus,
  engaged: weEngaged,
  locationProgressBlocked: weLocationProgressBlocked,
  travelProblem: weTravelProblem,
  travelEffects: weTravelEffects,
  damageAmount: weDamageAmount,
  cannotOptionallyEngage: weCannotOptionallyEngage,
  mainQuestGoalBonus: weMainQuestGoalBonus,
  sideQuestGoalBonus: weSideQuestGoalBonus,
  sideDefeatBlocked: weSideDefeatBlocked,
  sideDefeated: weSideDefeated,
  roundEnd: weRoundEnd,
  characterDestroyed: weCharacterDestroyed,
  encounter: weEncounter,
  shadow: weShadow,
  effect: nightmareWastesEffect,
  sharedEffect: () => false,
};
