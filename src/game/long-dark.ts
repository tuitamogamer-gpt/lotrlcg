import { mainQuestCode } from "./quest-state";
// Original Long Dark: locate choices and explicitly triggered Lost abilities.
import type { Effect, GameState, Unit } from "./types";
import { LONG_DARK as L, LONG_DARK_PASS } from "./long-dark-support";
export {
  LONG_DARK,
  LONG_DARK_ENCOUNTERS,
  LONG_DARK_QUESTS,
  LONG_DARK_PASS,
} from "./long-dark-support";
import { card, name, plain } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  fx,
  get,
  log,
  opts,
  prepend,
  removeShadowCard,
  requireRule,
  shuffle,
  threatOf,
  units,
  locationQuest,
} from "./core";
import {
  check,
  discardCharacter,
  discardHandCard,
  engage,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  questDefeated,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import { khazadCannotExhaust, KHAZAD } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { syncAttachmentText } from "./attachment-text";

export interface LongDarkState {
  adderDamagedIds: string[];
  locate?: { player: number; source: string; pass: Effect[]; fail: Effect[] };
}
const state = (s: GameState) =>
  ((s as GameState & { longDark?: LongDarkState }).longDark ??= {
    adderDamagedIds: [],
  });
const isLong = (s: GameState) => (s.scenarioId as string) === "the-long-dark";
const first = (s: GameState) => s.table?.first ?? 0;
const sourceUnit = (s: GameState, id?: string) =>
  units(s).find((u) => u.id === id);
const readyForExhaustion = (s: GameState, player: number) => {
  syncAttachmentText(s);
  return allCharacters(s).filter(
    (u) =>
      ownerOf(s, u) === player &&
      !u.exhausted &&
      !khazadCannotExhaust(u) &&
      !watcherWaterCannotExhaust(u),
  );
};
const lostCodes = [L.mine, L.forge, L.warlord, L.caverns];
/** Only an explicitly requesting effect starts Lost; new arrivals do not join the snapshot. */
export function longDarkLost(s: GameState) {
  syncAttachmentText(s);
  const ids = units(s)
    .filter((u) => lostCodes.includes(u.code) && !u.blanked)
    .map((u) => u.id);
  if (ids.length)
    prepend(s, fx("longDarkLostOrder", { ids, player: first(s) }));
}
export function setupLongDark(s: GameState) {
  state(s);
  s.encounterDeck = s.encounterDeck.filter((c) => c !== KHAZAD.torch);
  prepend(
    s,
    fx("khazadAttachSetup", { code: KHAZAD.torch, player: first(s) }),
    fx("longDarkSetupLocations", {
      count: Math.max(1, playerOrder(s).length - 1),
      player: first(s),
    }),
  );
}
export function advanceLongDark(s: GameState) {
  if (!isLong(s)) return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length ||
    state(s).locate
  )
    return true;
  if (s.stage === 1 && s.progress >= 13) {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("longDarkEast", { player: first(s) }));
    log(s, "Stage 2 · Continuing Eastward", "chapter");
  } else if (s.stage === 2 && s.progress >= 17) win(s);
  return true;
}
export const longDarkThreatBonus = (s: GameState, u: Unit) =>
  isLong(s) && s.stage === 1 && card(u.code).type_code === "location" ? 1 : 0;
export const longDarkDefenseBonus = (_s: GameState, u: Unit) =>
  u.attachments.filter((a) => a.code === L.greaves && !a.blanked && !a.facedown)
    .length;
export const longDarkCanAttack = (s: GameState, enemy: Unit) =>
  enemy.code !== L.adder ||
  enemy.blanked ||
  state(s).adderDamagedIds.includes(enemy.id);
export function longDarkDamageDealt(
  s: GameState,
  enemyId: string | undefined,
  amount: number,
) {
  if (!enemyId || amount <= 0) return;
  const enemy = get(s, enemyId);
  if (enemy?.code === L.adder && !state(s).adderDamagedIds.includes(enemyId))
    state(s).adderDamagedIds.push(enemyId);
}
export function longDarkRoundEnd(s: GameState) {
  if (isLong(s)) state(s).adderDamagedIds = [];
}
export function longDarkQuestFailed(s: GameState) {
  if (isLong(s)) longDarkLost(s);
}
/** An eliminated tester cannot pay another discard; resolve the original failure continuation. */
export function longDarkCheck(s: GameState) {
  const locate = s.longDark?.locate;
  if (
    isLong(s) &&
    s.status === "playing" &&
    locate &&
    !playerOrder(s).includes(locate.player)
  )
    finishLocate(s, false);
}
/** Gained surge is a revealed-card passive, independent of the When Revealed cancellation. */
export function longDarkRevealSurge(s: GameState, code: string) {
  if (card(code).type_code !== "enemy") return false;
  syncAttachmentText(s);
  return units(s).some(
    (u) =>
      card(u.code).type_code === "location" &&
      u.attachments.some(
        (a) => a.code === L.gathering && !a.blanked && !a.facedown,
      ),
  );
}
export function longDarkEngaged(s: GameState, enemy: Unit) {
  if (enemy.blanked) return;
  if (enemy.code === L.spider)
    prepend(
      s,
      fx("longDarkChooseHand", {
        value: 1,
        text: "Cave Spider · Discard one card",
        player: ownerOf(s, enemy),
      }),
    );
  if (enemy.code === L.sneak)
    prepend(
      s,
      fx("longDarkSneak", { target: enemy.id, player: ownerOf(s, enemy) }),
    );
}
function beginLocate(
  s: GameState,
  source: string,
  pass: Effect[],
  fail: Effect[],
  player = first(s),
) {
  requireRule(
    !state(s).locate,
    "Finish the current locate test before starting another.",
  );
  state(s).locate = { player, source, pass, fail };
  prepend(s, fx("longDarkLocate", { player }));
}
const approvedPlacements = new WeakSet<Unit>();
/** Framework callers supply their remaining-progress continuation and stop on true. */
export function longDarkProgressLocation(
  s: GameState,
  u: Unit,
  value: number,
  after: Effect[] = [],
) {
  if (
    value <= 0 ||
    u.code !== L.twisting ||
    u.blanked ||
    approvedPlacements.has(u)
  )
    return false;
  beginLocate(
    s,
    card(u.code).name,
    [
      fx("longDarkTwistingPlace", { target: u.id, value, player: first(s) }),
      ...after,
    ],
    [fx("longDarkLost", { player: first(s) })],
  );
  return true;
}
function finishLocate(s: GameState, passed: boolean) {
  const locate = state(s).locate;
  if (!locate) return;
  delete state(s).locate;
  log(
    s,
    `${locate.source} · Locate test ${passed ? "passes" : "fails"}.`,
    passed ? "good" : "danger",
  );
  prepend(s, ...(passed ? locate.pass : locate.fail));
}
/** Preserve After-entry/exhaustion responses until the complete Lost instruction finishes. */
function atomicLost(s: GameState, mutate: () => void) {
  const remaining = s.queue.splice(0);
  mutate();
  const responses = s.queue.splice(0);
  const nextLost = remaining.findIndex((e) => e.kind === "longDarkLostOrder");
  if (nextLost >= 0)
    s.queue = [
      ...remaining.slice(0, nextLost + 1),
      ...responses,
      ...remaining.slice(nextLost + 1),
    ];
  else s.queue = [...responses, ...remaining];
}
export function longDarkEncounter(s: GameState, code: string): boolean {
  switch (code) {
    case L.spider:
      prepend(s, fx("longDarkSpiderDraw", { player: first(s) }));
      return true;
    case L.greaves: {
      const objective = [...s.staging].reverse().find((u) => u.code === code);
      if (objective) {
        selectSeat(s, first(s));
        choose(
          s,
          "Durin's Greaves · First player chooses a hero",
          opts(
            allCharacters(s).filter((h) => card(h.code).type_code === "hero"),
            (h) => [
              fx("longDarkGreaves", {
                source: objective.id,
                target: h.id,
                player: first(s),
              }),
            ],
          ),
        );
      }
      return true;
    }
    case L.fatigue:
      prepend(
        s,
        fx("longDarkFatigueChoose", { value: 0, ids: [], player: first(s) }),
      );
      return true;
    case L.air:
      s.encounterDiscard.push(code);
      beginLocate(
        s,
        card(code).name,
        [],
        [fx("longDarkFoulAir", { player: first(s) })],
      );
      return true;
    case L.vast:
      s.encounterDiscard.push(code);
      beginLocate(
        s,
        card(code).name,
        [],
        [
          ...playerOrder(s).map((player) => fx("threat", { value: 7, player })),
          fx("longDarkRemoveProgress", { player: first(s) }),
          fx("longDarkLost", { player: first(s) }),
        ],
      );
      return true;
    case L.gathering: {
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      const weight = (u: Unit) =>
        threatOf(s, u) + Math.max(0, locationQuest(s, u) - u.progress);
      const highest = Math.max(-Infinity, ...locations.map(weight));
      const candidates = locations.filter(
        (u) =>
          weight(u) === highest &&
          !/cannot have attachments/i.test(plain(card(u.code).text)),
      );
      if (candidates.length) {
        selectSeat(s, first(s));
        choose(
          s,
          "Gathering Ground · Highest combined threat and remaining quest points",
          opts(candidates, (u) => [
            fx("longDarkGathering", { target: u.id, player: first(s) }),
          ]),
        );
      } else s.encounterDiscard.push(code);
      return true;
    }
    default:
      return false;
  }
}
export function longDarkShadow(
  s: GameState,
  enemy: Unit,
  code: string,
): boolean {
  switch (code) {
    case L.fatigue:
      prepend(s, fx("longDarkExhaustOne", { player: ownerOf(s, enemy) }));
      return true;
    case L.warlord:
      longDarkLost(s);
      return true;
    case L.adder:
      if (!s.combat?.defenderId && !s.combat?.defenderIds?.length)
        prepend(
          s,
          fx("longDarkDiscardCharacter", { player: ownerOf(s, enemy) }),
        );
      return true;
    case L.sneak: {
      const index =
        enemy.shadows
          .map((c, i) => ({ c, i }))
          .reverse()
          .find(
            ({ c, i }) =>
              c === code &&
              i < (enemy.revealedShadowCount ?? enemy.shadows.length),
          )?.i ?? -1;
      if (index >= 0) {
        removeShadowCard(enemy, index);
        placeEncounter(s, code, true);
      }
      return true;
    }
    default:
      return false;
  }
}
export function longDarkEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "longDarkSetupLocations": {
      const wanted = e.count ?? 1,
        locations: string[] = [],
        others: string[] = [];
      while (locations.length < wanted && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        (card(code).type_code === "location" ? locations : others).push(code);
      }
      for (const code of locations) placeEncounter(s, code, true);
      s.encounterDeck.push(...others);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "longDarkEast":
      beginLocate(
        s,
        "Continuing Eastward",
        [fx("longDarkStageReady", { player: first(s) })],
        [
          fx("longDarkEastReveal", {
            count: playerOrder(s).length,
            player: first(s),
          }),
        ],
      );
      break;
    case "longDarkEastReveal": {
      if ((e.count ?? 0) <= 0)
        prepend(
          s,
          fx("longDarkLost", { player: first(s) }),
          fx("longDarkStageReady", { player: first(s) }),
        );
      else {
        const code = encounterDraw(s);
        if (code) {
          prepend(s, { ...e, count: e.count! - 1, player: first(s) });
          revealed(s, code);
        } else prepend(s, fx("longDarkStageReady", { player: first(s) }));
      }
      break;
    }
    case "longDarkStageReady":
      s.stageRevealing = false;
      check(s);
      break;
    case "longDarkLocate": {
      const locate = state(s).locate;
      if (!locate) break;
      if (!playerOrder(s).includes(locate.player)) {
        finishLocate(s, false);
        break;
      }
      selectSeat(s, locate.player);
      const canDraw =
        s.encounterDeck.length ||
        (["quest", "staging"].includes(s.phase) && s.encounterDiscard.length);
      if (!s.hand.length || !canDraw) {
        finishLocate(s, false);
        break;
      }
      choose(
        s,
        `${locate.source} · Locate test`,
        [
          ...opts(s.hand, (c) => [
            fx("longDarkLocateAttempt", {
              target: c.id,
              player: locate.player,
            }),
          ]),
          {
            id: "fail",
            label: "Fail the locate test · keep your cards",
            effects: [fx("longDarkLocateFail", { player: locate.player })],
          },
        ],
        "Discard one card from your hand to discard the next encounter card. PASS succeeds; otherwise try again or fail.",
      );
      break;
    }
    case "longDarkLocateAttempt": {
      const locate = state(s).locate;
      if (!locate) break;
      selectSeat(s, locate.player);
      discardHandCard(s, e.target!);
      const code = encounterDraw(s);
      if (code) {
        s.encounterDiscard.push(code);
        log(
          s,
          `Locate discards ${card(code).name}${LONG_DARK_PASS.includes(code) ? " · PASS" : ""}.`,
        );
      }
      if (code && LONG_DARK_PASS.includes(code)) finishLocate(s, true);
      else prepend(s, fx("longDarkLocate", { player: locate.player }));
      break;
    }
    case "longDarkLocateFail":
      finishLocate(s, false);
      break;
    case "longDarkTwistingPlace":
      if (u) {
        approvedPlacements.add(u);
        try {
          progressLocation(s, u, e.value ?? 0);
        } finally {
          approvedPlacements.delete(u);
        }
      }
      break;
    case "longDarkLost":
      longDarkLost(s);
      break;
    case "longDarkLostOrder": {
      const remaining = (e.ids ?? []).filter((id) => {
        const source = sourceUnit(s, id);
        return source && !source.blanked;
      });
      if (!remaining.length) break;
      if (remaining.length === 1)
        prepend(
          s,
          fx("longDarkLostResolve", {
            target: remaining[0],
            ids: [],
            player: first(s),
          }),
        );
      else {
        selectSeat(s, first(s));
        choose(
          s,
          "Lost effects · Choose the next printed effect",
          remaining.map((id) => ({
            id,
            label: card(sourceUnit(s, id)!.code).name,
            code: sourceUnit(s, id)!.code,
            effects: [
              fx("longDarkLostResolve", {
                target: id,
                ids: remaining.filter((i) => i !== id),
                player: first(s),
              }),
            ],
          })),
          "Only effects that were in play when Lost triggered participate.",
        );
      }
      break;
    }
    case "longDarkLostResolve": {
      prepend(s, fx("longDarkLostOrder", { ids: e.ids, player: first(s) }));
      if (!u || u.blanked) break;
      if (u.code === L.mine)
        atomicLost(s, () => {
          const goblins = s.encounterDiscard
            .map((code, index) => ({ code, index }))
            .reverse()
            .filter(
              ({ code }) =>
                card(code).type_code === "enemy" &&
                (card(code).traits ?? "")
                  .split(".")
                  .some((t) => t.trim() === "Goblin"),
            )
            .slice(0, 2);
          for (const { index } of goblins) s.encounterDiscard.splice(index, 1);
          for (const { code } of goblins) placeEncounter(s, code, true);
        });
      if (u.code === L.forge)
        prepend(
          s,
          fx("longDarkForgeChoose", { value: 0, ids: [], player: first(s) }),
        );
      if (u.code === L.warlord)
        prepend(
          s,
          fx("longDarkAlliesChoose", { value: 0, ids: [], player: first(s) }),
        );
      if (u.code === L.caverns)
        atomicLost(s, () => {
          for (const c of [...allCharacters(s)]) exhaustCharacter(s, c);
        });
      break;
    }
    case "longDarkSpiderDraw": {
      const before = s.hand.length;
      draw(s, 1);
      if (s.hand.length > before)
        prepend(
          s,
          fx("longDarkChooseHand", {
            value: 4,
            text: "Cave Spider · Choose four cards",
            player: activeSeat(s),
          }),
        );
      break;
    }
    case "longDarkChooseHand": {
      const count = e.value ?? 1,
        selected = e.ids ?? [];
      if (s.hand.length < count) break;
      if (selected.length >= count) {
        for (const id of selected) discardHandCard(s, id);
        break;
      }
      choose(
        s,
        e.text ?? "Discard cards",
        opts(
          s.hand.filter((c) => !selected.includes(c.id)),
          (c) => [{ ...e, ids: [...selected, c.id] }],
        ),
        `Choose ${count - selected.length} more card${count - selected.length === 1 ? "" : "s"}. Cards are discarded together after the full selection.`,
      );
      break;
    }
    case "longDarkGreaves": {
      const objective = get(s, e.source);
      if (u && objective) {
        s.staging = s.staging.filter((c) => c.id !== objective.id);
        u.attachments.push({
          id: objective.id,
          code: L.greaves,
          exhausted: false,
        });
      }
      break;
    }
    case "longDarkGathering":
      if (u && s.staging.some((c) => c.id === u.id))
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: L.gathering,
          exhausted: false,
        });
      else s.encounterDiscard.push(L.gathering);
      break;
    case "longDarkFatigueChoose": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("longDarkFatigueExhaust", { ids: e.ids, player: first(s) }),
        );
        break;
      }
      const player = order[cursor],
        eligible = readyForExhaustion(s, player);
      if (!eligible.length) {
        prepend(s, { ...e, value: cursor + 1, player: first(s) });
        break;
      }
      selectSeat(s, player);
      choose(
        s,
        "Fatigue · Exhaust one character",
        opts(eligible, (c) => [
          {
            ...e,
            ids: [...(e.ids ?? []), c.id],
            value: cursor + 1,
            player: first(s),
          },
        ]),
      );
      break;
    }
    case "longDarkFatigueExhaust": {
      for (const id of e.ids ?? []) {
        const c = get(s, id);
        if (c) exhaustCharacter(s, c);
      }
      s.encounterDiscard.push(L.fatigue);
      if (
        playerOrder(s).some(
          (player) =>
            !allCharacters(s).some(
              (c) => ownerOf(s, c) === player && !c.exhausted,
            ),
        )
      )
        prepend(s, fx("reveal", { player: first(s) }));
      break;
    }
    case "longDarkExhaustOne": {
      const eligible = readyForExhaustion(s, activeSeat(s));
      if (eligible.length)
        choose(
          s,
          "Fatigue shadow · Exhaust one character",
          opts(eligible, (c) => [
            fx("exhaust", { target: c.id, player: activeSeat(s) }),
          ]),
        );
      break;
    }
    case "longDarkFoulAir":
      prepend(
        s,
        ...allCharacters(s).map((c) =>
          fx("damage", { target: c.id, value: 2, player: ownerOf(s, c) }),
        ),
        fx("longDarkLost", { player: first(s) }),
      );
      break;
    case "longDarkRemoveProgress":
      s.progress = 0;
      for (const c of units(s)) c.progress = 0;
      break;
    case "longDarkAlliesChoose": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("longDarkDiscardAllies", { ids: e.ids, player: first(s) }),
        );
        break;
      }
      const player = order[cursor],
        allies = seatView(s, player).allies;
      if (!allies.length) {
        prepend(s, { ...e, value: cursor + 1, player: first(s) });
        break;
      }
      selectSeat(s, player);
      choose(
        s,
        "Goblin Warlord · Discard one controlled ally",
        opts(allies, (c) => [
          {
            ...e,
            ids: [...(e.ids ?? []), c.id],
            value: cursor + 1,
            player: first(s),
          },
        ]),
      );
      break;
    }
    case "longDarkDiscardAllies":
      atomicLost(s, () => {
        for (const id of e.ids ?? []) {
          const c = get(s, id);
          if (c) discardCharacter(s, c);
        }
      });
      break;
    case "longDarkForgeChoose": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("longDarkDiscardHands", { ids: e.ids, player: first(s) }),
        );
        break;
      }
      const player = order[cursor],
        hand = seatView(s, player).hand;
      if (!hand.length) {
        prepend(s, { ...e, value: cursor + 1, player: first(s) });
        break;
      }
      selectSeat(s, player);
      choose(
        s,
        "Dwarven Forge · Discard one card",
        opts(hand, (c) => [
          {
            ...e,
            ids: [...(e.ids ?? []), c.id],
            value: cursor + 1,
            player: first(s),
          },
        ]),
      );
      break;
    }
    case "longDarkDiscardHands":
      atomicLost(s, () => {
        for (const id of e.ids ?? [])
          for (const player of playerOrder(s))
            if (seatView(s, player).hand.some((c) => c.id === id))
              forOwner(s, player, () => discardHandCard(s, id));
      });
      break;
    case "longDarkDiscardCharacter":
      if (allCharacters(s).some((c) => ownerOf(s, c) === activeSeat(s)))
        choose(
          s,
          "Rock Adder shadow · Discard one character",
          opts(
            allCharacters(s).filter((c) => ownerOf(s, c) === activeSeat(s)),
            (c) => [
              fx("discardCharacter", { target: c.id, player: activeSeat(s) }),
            ],
          ),
        );
      break;
    case "longDarkSneak": {
      if (!u || u.blanked) break;
      const code = encounterDraw(s);
      if (code) {
        s.encounterDiscard.push(code);
        log(s, `${name(u)} discards ${card(code).name}.`);
      }
      const order = playerOrder(s),
        current = ownerOf(s, u);
      if (code && card(code).type_code === "treachery" && order.length > 1)
        forOwner(s, order[(order.indexOf(current) + 1) % order.length], () =>
          engage(s, u),
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
