import { addCurrentQuestProgress } from "./side-quests";
import { mainQuestCode } from "./quest-state";
// Shadow and Flame: one physical Balrog, considered engagement and explicit Pit decisions.
import type { Effect, GameState, Unit } from "./types";
import { SHADOW_FLAME as S } from "./shadow-flame-support";
export {
  SHADOW_FLAME,
  SHADOW_FLAME_ENCOUNTERS,
  SHADOW_FLAME_QUESTS,
} from "./shadow-flame-support";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  opts,
  prepend,
  random,
  requireRule,
  shuffle,
  stats,
  units,
} from "./core";
import {
  check,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { syncAttachmentText } from "./attachment-text";
export interface ShadowFlameState {
  roundAttackBonus: number;
  heroCommittedRound?: number;
}
type ShadowState = GameState & { shadowFlame?: ShadowFlameState };
const state = (s: GameState) =>
  ((s as ShadowState).shadowFlame ??= { roundAttackBonus: 0 });
const isShadow = (s: GameState) =>
  (s.scenarioId as string) === "shadow-and-flame";
const first = (s: GameState) => s.table?.first ?? 0;
const bane = (s: GameState) => units(s).find((u) => u.code === S.bane);
const attachmentHosts = (s: GameState) => [
  ...units(s),
  ...(mainQuestUnit(s) ? [mainQuestUnit(s)!] : []),
];
const exhaustive = (s: GameState, player = activeSeat(s)) => {
  syncAttachmentText(s);
  return allCharacters(s).filter(
    (u) =>
      ownerOf(s, u) === player &&
      !u.exhausted &&
      !khazadCannotExhaust(u) &&
      !watcherWaterCannotExhaust(u),
  );
};
export function setupShadowFlame(s: GameState) {
  state(s);
  s.encounterDeck = s.encounterDeck.filter((c) => ![S.pit, S.bane].includes(c));
  placeEncounter(s, S.bane, true);
  s.stageRevealing = true;
  for (const player of playerOrder(s))
    forOwner(s, player, () => (s.threat = 0));
  prepend(
    s,
    ...Array.from({ length: Math.max(0, playerOrder(s).length - 1) }, () =>
      fx("reveal", { player: first(s) }),
    ),
    fx("shadowFlameStageReady", { player: first(s) }),
  );
}
export function advanceShadowFlame(s: GameState) {
  if (!isShadow(s)) return false;
  const b = bane(s);
  const zeroHitPoints = s.stage === 2 && b && b.damage >= stats(s, b).health;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.pendingQuestDefeat ||
    ((s.choice || s.queue.length) && !zeroHitPoints)
  )
    return true;
  if (
    (s.stage === 1 && s.progress >= 9) ||
    (s.stage === 2 &&
      (s.progress >= 16 || (b && b.damage >= stats(s, b).health)))
  ) {
    if (questDefeated(s, mainQuestCode(s)!)) return true;
    s.stage++;
    s.progress = 0;
    log(
      s,
      `Stage ${s.stage} · ${s.stage === 2 ? "The Rear Guard" : "Last Lord of Moria"}`,
      "chapter",
    );
    if (s.stage === 3) {
      s.stageRevealing = true;
      prepend(s, fx("shadowFlameLastLord", { player: first(s) }));
    }
  }
  // Printed Last Lord victory is checked by the Pit effect, even with no quest progress.
  return true;
}
/** Considered engagement does not move the card or trigger After-engagement abilities. */
export function shadowFlameEngagedPlayers(s: GameState, enemy: Unit): number[] {
  return enemy.code === S.bane && !enemy.blanked
    ? playerOrder(s).filter((p) => seatView(s, p).threat >= 1)
    : [];
}
export const shadowFlameCanMove = (_s: GameState, enemy: Unit) =>
  enemy.code !== S.bane || !!enemy.blanked;
export const shadowFlameIndestructible = (enemy: Unit) =>
  enemy.code === S.bane && !enemy.blanked;
export const shadowFlameAttackBonus = (s: GameState, enemy: Unit) =>
  enemy.code === S.bane
    ? enemy.attachments.filter(
        (a) => a.code === S.sword && !a.blanked && !a.facedown,
      ).length *
        3 +
      ((s as ShadowState).shadowFlame?.roundAttackBonus ?? 0)
    : 0;
export const shadowFlameLocationProgressBlocked = (
  s: GameState,
  location: Unit,
) =>
  location.code === S.deep && !location.blanked && (bane(s)?.damage ?? 0) === 0;
export function shadowFlameCharactersCommitted(
  s: GameState,
  committed: Unit[],
) {
  if (isShadow(s) && committed.some((u) => card(u.code).type_code === "hero"))
    state(s).heroCommittedRound = s.round;
}
export function shadowFlameQuestEnd(s: GameState) {
  if (isShadow(s) && s.stage === 2 && state(s).heroCommittedRound === s.round)
    prepend(s, fx("shadowFlameRearProgress", { player: first(s) }));
}
export function shadowFlameRoundEnd(s: GameState) {
  if (isShadow(s)) {
    state(s).roundAttackBonus = 0;
    delete state(s).heroCommittedRound;
  }
}
export function shadowFlameEnemyAttackStart(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  for (const a of enemy.attachments.filter(
    (a) => a.code === S.whip && !a.blanked && !a.facedown,
  ))
    prepend(
      s,
      fx("shadowFlameWhipDiscard", { source: a.id, target: enemy.id, player }),
    );
}
/** Snapshot the cards whose Forced abilities saw the departure before queuing optional responses. */
export function shadowFlameCharactersLeft(s: GameState): Effect[] {
  syncAttachmentText(s);
  const sources = [
    ...units(s).filter((u) => u.code === S.ranging && !u.blanked),
    ...allActiveLocations(s).filter((u) => u.code === S.hall && !u.blanked),
  ];
  return sources.length
    ? [
        fx("shadowFlameLeavesOrder", {
          ids: sources.map((u) => u.id),
          player: first(s),
        }),
      ]
    : [];
}
/** Called after an event's costs are paid and its physical card has reached discard. */
export function shadowFlameEventCancelled(s: GameState): boolean {
  const b = bane(s);
  if (!b) return false;
  syncAttachmentText(s);
  const counters = b.attachments.filter(
    (a) => a.code === S.counter && !a.blanked && !a.facedown,
  );
  let cancelled = false;
  for (const a of counters) {
    const code = encounterDraw(s);
    if (!code) continue;
    s.encounterDiscard.push(code);
    log(s, `Counter-Spell discards ${card(code).name}.`);
    if (card(code).type_code === "treachery") {
      cancelled = true;
      for (const c of [...s.hand]) discardHandCard(s, c.id);
      discardAttachment(s, b, a);
      log(
        s,
        "Counter-Spell cancels the event's effects and discards its player's remaining hand.",
        "danger",
      );
    }
  }
  return cancelled;
}
function attachEncounter(s: GameState, code: string) {
  const b = bane(s),
    c = card(code);
  if (
    !b ||
    (c.is_unique &&
      units(s).some(
        (u) => u.code === code || u.attachments.some((a) => a.code === code),
      ))
  )
    s.encounterDiscard.push(code);
  else b.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
}
export function shadowFlameEncounter(s: GameState, code: string): boolean {
  switch (code) {
    case S.counter:
    case S.sword:
    case S.whip:
      attachEncounter(s, code);
      return true;
    case S.ranging:
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("shadowFlameGoblinDamage", { player }),
        ),
      );
      return true;
    case S.fires:
      prepend(
        s,
        fx("shadowFlameAlliesChoose", {
          ids: [],
          value: 0,
          code,
          player: first(s),
        }),
      );
      return true;
    case S.lash:
      prepend(
        s,
        fx("shadowFlameAttachmentsChoose", {
          ids: [],
          value: 0,
          player: first(s),
        }),
      );
      return true;
    case S.flame:
    case S.shadow: {
      s.encounterDiscard.push(code);
      if (!bane(s)) return true;
      selectSeat(s, first(s));
      choose(s, `${card(code).name} · Remove a questing hero to cancel?`, [
        ...opts(
          s.heroes.filter((h) => h.committed),
          (h) => [
            fx("shadowFlameRemoveHero", { target: h.id, player: first(s) }),
          ],
          (h) => `Remove ${name(h)} from the quest · cancel`,
        ),
        {
          id: "resolve",
          label: `Resolve ${card(code).name}`,
          effects: [fx("shadowFlameInner", { code, player: first(s) })],
        },
      ]);
      return true;
    }
    case S.leaping:
      s.encounterDiscard.push(code);
      if (bane(s))
        prepend(
          s,
          fx("immediateAttack", { target: bane(s)!.id, player: first(s) }),
        );
      return true;
    default:
      return false;
  }
}
export function shadowFlameShadow(s: GameState, code: string): boolean {
  switch (code) {
    case S.fires:
      prepend(
        s,
        fx("shadowFlameShadowAlly", {
          player: s.combat?.attackPlayer ?? activeSeat(s),
        }),
      );
      return true;
    case S.flame:
    case S.leaping:
      if (get(s, s.combat?.enemyId)?.code === S.bane)
        s.combat!.attackBonus += 3;
      return true;
    case S.lash:
      if (get(s, s.combat?.enemyId)?.code === S.bane)
        prepend(
          s,
          fx("shadowFlameDiscardAllAttachments", {
            player: s.combat?.attackPlayer ?? activeSeat(s),
          }),
        );
      return true;
    default:
      return false;
  }
}
export const shadowFlameAbilityLabel = (u: Unit) =>
  u.code === S.pit ? "Dark Pit · Cast down Durin's Bane" : null;
export function shadowFlameAbilityProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.code !== S.pit) return null;
  if (u.blanked) return "Dark Pit's printed ability is blank.";
  if (s.phase !== "refresh") return "Dark Pit has a Refresh Action.";
  if (!allActiveLocations(s).some((l) => l.id === u.id))
    return "Travel to Dark Pit before using this action.";
  if (!bane(s)) return "Durin's Bane must remain in play.";
  if (!s.deck.length) return "There are no cards to discard from your deck.";
  if (!exhaustive(s).length)
    return "Exhaust one to three characters you control.";
  return null;
}
export function shadowFlameAbility(s: GameState, u: Unit): boolean {
  if (u.code !== S.pit) return false;
  requireRule(
    !shadowFlameAbilityProblem(s, u),
    shadowFlameAbilityProblem(s, u) ?? "",
  );
  const eligible = exhaustive(s);
  choose(
    s,
    "Dark Pit · Number of characters",
    Array.from({ length: Math.min(3, eligible.length) }, (_, i) => ({
      id: `pit:${i + 1}`,
      label: `Exhaust ${i + 1} character${i ? "s" : ""} · discard ${i + 1} deck card${i ? "s" : ""}`,
      effects: [
        fx("shadowFlamePitChoose", {
          target: u.id,
          value: i + 1,
          ids: [],
          player: activeSeat(s),
        }),
      ],
    })),
  );
  return true;
}
export function shadowFlameEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "shadowFlameStageReady":
      s.stageRevealing = false;
      check(s);
      break;
    case "shadowFlameLastLord": {
      const b = bane(s);
      prepend(
        s,
        ...(b
          ? [fx("immediateAttack", { target: b.id, player: first(s) })]
          : []),
        fx("shadowFlameLastLordFinish", { player: first(s) }),
      );
      break;
    }
    case "shadowFlameLastLordFinish":
      placeEncounter(s, S.pit, true);
      s.stageRevealing = false;
      check(s);
      break;
    case "shadowFlameRearProgress":
      if (s.stage === 2) {
        addCurrentQuestProgress(s, 4);
        prepend(s, fx("shadowFlameRearAdvance", { player: first(s) }));
      }
      break;
    case "shadowFlameRearAdvance": {
      const continuation = s.queue.splice(0);
      advanceShadowFlame(s);
      const transitions = s.queue.splice(0);
      prepend(
        s,
        ...transitions,
        ...(s.pendingQuestDefeat ? [{ ...e, player: first(s) }] : []),
        ...continuation,
      );
      break;
    }
    case "shadowFlameRemoveHero":
      if (u) {
        u.committed = false;
        forOwner(
          s,
          ownerOf(s, u),
          () => (s.committedIds = s.committedIds.filter((id) => id !== u.id)),
        );
      }
      break;
    case "shadowFlameInner": {
      const b = bane(s);
      if (!b) break;
      if (e.code === S.flame) state(s).roundAttackBonus += 3;
      else if (e.code === S.shadow) b.damage = Math.max(0, b.damage - 5);
      break;
    }
    case "shadowFlameWhipDiscard":
      if (s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      break;
    case "shadowFlameGoblinDamage":
      if (s.heroes.length)
        choose(
          s,
          "Ranging Goblin · Damage one hero",
          opts(s.heroes, (h) => [
            fx("damage", { target: h.id, value: 1, player: activeSeat(s) }),
          ]),
        );
      break;
    case "shadowFlameAlliesChoose": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("shadowFlameDiscardAllies", {
            ids: e.ids,
            code: e.code,
            player: first(s),
          }),
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
        "Fires in the Deep · Discard one ally",
        opts(allies, (a) => [
          {
            ...e,
            ids: [...(e.ids ?? []), a.id],
            value: cursor + 1,
            player: first(s),
          },
        ]),
      );
      break;
    }
    case "shadowFlameDiscardAllies": {
      let discarded = 0;
      const remaining = s.queue.splice(0);
      for (const id of e.ids ?? []) {
        const a = get(s, id);
        if (a) {
          discardCharacter(s, a);
          discarded++;
        }
      }
      const follow = s.queue.splice(0);
      s.encounterDiscard.push(S.fires);
      prepend(
        s,
        ...follow,
        ...(!discarded ? [fx("reveal", { player: first(s) })] : []),
        ...remaining,
      );
      break;
    }
    case "shadowFlameShadowAlly":
      if (s.allies.length)
        choose(
          s,
          "Fires in the Deep shadow · Discard one ally",
          opts(s.allies, (a) => [
            fx("discardCharacter", { target: a.id, player: activeSeat(s) }),
          ]),
        );
      break;
    case "shadowFlameAttachmentsChoose": {
      const order = playerOrder(s),
        cursor = e.value ?? 0;
      if (cursor >= order.length) {
        prepend(
          s,
          fx("shadowFlameDiscardAttachments", { ids: e.ids, player: first(s) }),
        );
        break;
      }
      const player = order[cursor],
        attached = attachmentHosts(s).flatMap((host) =>
          host.attachments
            .filter(
              (a) =>
                attachmentController(s, host, a) === player &&
                !card(a.code).text?.includes("Permanent"),
            )
            .map((a) => ({ host, a })),
        );
      if (!attached.length) {
        prepend(s, { ...e, value: cursor + 1, player: first(s) });
        break;
      }
      selectSeat(s, player);
      choose(
        s,
        "Whip Lash · Discard one controlled attachment",
        attached.map(({ host, a }) => ({
          id: a.id,
          label: `${card(a.code).name} · ${name(host)}`,
          code: a.code,
          effects: [
            {
              ...e,
              ids: [...(e.ids ?? []), a.id],
              value: cursor + 1,
              player: first(s),
            },
          ],
        })),
      );
      break;
    }
    case "shadowFlameDiscardAttachments":
      for (const id of e.ids ?? [])
        for (const host of attachmentHosts(s)) {
          const a = host.attachments.find((a) => a.id === id);
          if (a) {
            discardAttachment(s, host, a);
            if (host.id.startsWith("quest:"))
              (s.questAttachments ??= {})[host.code] = host.attachments;
          }
        }
      s.encounterDiscard.push(S.lash);
      break;
    case "shadowFlameDiscardAllAttachments":
      for (const host of attachmentHosts(s))
        for (const a of [...host.attachments])
          if (
            attachmentController(s, host, a) === activeSeat(s) &&
            !card(a.code).text?.includes("Permanent")
          ) {
            discardAttachment(s, host, a);
            if (host.id.startsWith("quest:"))
              (s.questAttachments ??= {})[host.code] = host.attachments;
          }
      break;
    case "shadowFlameLeavesOrder": {
      const sources = (e.ids ?? []).filter((id) => {
        const source = get(s, id);
        return source && !source.blanked;
      });
      const next = (id: string) => [
        fx("shadowFlameLeavesResolve", { target: id, player: first(s) }),
        fx("shadowFlameLeavesOrder", {
          ids: sources.filter((i) => i !== id),
          player: first(s),
        }),
      ];
      if (sources.length === 1) prepend(s, ...next(sources[0]));
      else if (sources.length > 1) {
        selectSeat(s, first(s));
        choose(
          s,
          "A character leaves play · Order forced effects",
          sources.map((id) => ({
            id,
            label: name(get(s, id)!),
            code: get(s, id)!.code,
            effects: next(id),
          })),
        );
      }
      break;
    }
    case "shadowFlameLeavesResolve": {
      if (!u || u.blanked) break;
      if (u.code === S.hall) {
        if (allActiveLocations(s).some((l) => l.id === u.id))
          prepend(s, fx("reveal", { player: first(s) }));
        break;
      }
      if (u.code !== S.ranging) break;
      const top = s.encounterDiscard.pop();
      s.staging = s.staging.filter((c) => c.id !== u.id);
      for (const player of playerOrder(s))
        forOwner(
          s,
          player,
          () => (s.engaged = s.engaged.filter((c) => c.id !== u.id)),
        );
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      s.encounterDeck.push(u.code, ...(top ? [top] : []));
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${name(u)} and ${top ? card(top).name : "no discarded card"} return to the encounter deck.`,
      );
      break;
    }
    case "shadowFlamePitChoose": {
      if (!u || !allActiveLocations(s).some((l) => l.id === u.id) || u.blanked)
        break;
      const selected = e.ids ?? [],
        wanted = e.value ?? 1;
      if (selected.length >= wanted) {
        prepend(
          s,
          fx("shadowFlamePitDiscard", {
            target: u.id,
            ids: selected,
            player: activeSeat(s),
          }),
        );
        break;
      }
      choose(
        s,
        `Dark Pit · Exhaust ${wanted} characters`,
        opts(
          exhaustive(s).filter((c) => !selected.includes(c.id)),
          (c) => [{ ...e, ids: [...selected, c.id], player: activeSeat(s) }],
        ),
      );
      break;
    }
    case "shadowFlamePitDiscard": {
      const selected = (e.ids ?? []).map((id) => get(s, id));
      requireRule(
        selected.length > 0 &&
          selected.length <= 3 &&
          selected.every((c) => c && exhaustive(s).some((a) => a.id === c.id)),
        "Select one to three ready characters you control.",
      );
      for (const c of selected)
        requireRule(
          exhaustCharacter(s, c!),
          "Pay each Dark Pit exhaustion cost.",
        );
      const codes = discardPlayerDeck(s, selected.length, activeSeat(s));
      const combined = codes.reduce(
        (sum, code) => sum + (Number(card(code).cost) || 0),
        0,
      );
      const b = bane(s),
        remaining = b ? Math.max(0, stats(s, b).health - b.damage) : Infinity;
      log(
        s,
        `Dark Pit · ${codes.length} discarded card${codes.length === 1 ? "" : "s"}, printed cost ${combined} against ${remaining} remaining hit points.`,
      );
      if (b && combined > remaining) {
        s.staging = s.staging.filter((c) => c.id !== b.id);
        for (const player of playerOrder(s))
          forOwner(
            s,
            player,
            () => (s.engaged = s.engaged.filter((c) => c.id !== b.id)),
          );
        for (const a of [...b.attachments]) discardAttachment(s, b, a, true);
        s.encounterDiscard.push(...b.shadows, b.code);
        if (s.stage === 3) win(s);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}
