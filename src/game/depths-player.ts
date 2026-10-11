import { DEPTHS_PLAYER as P } from "./depths-player-support";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  cannotReady,
  choose,
  fx,
  get,
  log,
  prepend,
  requireRule,
  skip,
  spendResources,
  units,
} from "./core";
import {
  exhaustCharacter,
  progressLocation,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isHero } from "./card-types";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import {
  watcherWaterCannotExhaust,
  watcherWaterProgressCapacity,
} from "./watcher-water";
import {
  heirsCanSpendResources,
  heirsLocationProgressBlocked,
} from "./heirs-numenor";
import { raidLocationProgressBlocked } from "./raid-grey-havens";
import { dreadLocationProgressBlocked } from "./dread-realm";
import { tharbadLocationBlocked } from "./tharbad";
import { catchLocationProgressBlocked } from "./catch-orc";
import { shadowFlameLocationProgressBlocked } from "./shadow-flame";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { movableHand } from "./hand-rules";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  resolvePlayerCard,
} from "./actions";
import { choosePlayerResponse } from "./player-ability-triggers";
import { reduceThreat } from "./threat-reduction";

export { depthsPlayerStats } from "./depths-player-support";
export const DEPTHS_ATTACHMENT_ACTIONS = [P.guarded];
const PHASE = "phase:depths:";
const ROUND = "round:depths:";
const affected = (u: Unit) => !playerCardImmune(u);
const active = (a: Attachment) => !a.blanked && !a.facedown;
const allUsed = (s: GameState) => [
  ...s.used,
  ...(s.table?.seats.flatMap((p, i) => (i === activeSeat(s) ? [] : p.used)) ??
    []),
];
const count = (s: GameState, key: string) =>
  allUsed(s).filter((k) => k === key).length;
const usable = (u: Unit) => !u.blanked && !isSacked(u) && affected(u);
const exhaustible = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const owned = (s: GameState, u: Unit) => ownerOf(s, u) === activeSeat(s);
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
/** Mandatory responses to actual costs finish before the ability's effects. */
function payThen(s: GameState, payCost: () => void, effect: Effect) {
  const continuation = s.queue;
  const player = activeSeat(s);
  s.queue = [];
  payCost();
  s.queue.push({ ...effect, player: effect.player ?? player }, ...continuation);
}
const payers = (s: GameState, sphere: string) =>
  allHeroes(s).filter(
    (h) =>
      owned(s, h) &&
      h.resources > 0 &&
      hasResourceIcon(h, sphere) &&
      heirsCanSpendResources(s, h),
  );
const locations = (s: GameState) =>
  units(s).filter((u) => card(u.code).type_code === "location" && affected(u));
const explorerTargets = (s: GameState) =>
  locations(s).filter(
    (u) =>
      !raidLocationProgressBlocked(s, u) &&
      !dreadLocationProgressBlocked(s, u) &&
      !tharbadLocationBlocked(s, u) &&
      !catchLocationProgressBlocked(s, u) &&
      !heirsLocationProgressBlocked(s, u) &&
      !shadowFlameLocationProgressBlocked(s, u) &&
      (watcherWaterProgressCapacity(s, u) ?? Infinity) > 0,
  );
const guardedAttachment = (s: GameState, u: Unit, id?: string) =>
  u.attachments.find(
    (a) =>
      a.id === id &&
      a.code === P.guarded &&
      active(a) &&
      attachmentController(s, u, a) === activeSeat(s),
  );
const scouts = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      owned(s, u) &&
      affected(u) &&
      exhaustible(u) &&
      (hasTrait(u, "Ranger") || hasTrait(u, "Scout")),
  );
const nobleHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      owned(s, h) &&
      hasTrait(h, "Noble") &&
      affected(h) &&
      exhaustible(h) &&
      canGainResources(s, h),
  );
const hobbits = (s: GameState) =>
  allCharacters(s).filter(
    (u) => owned(s, u) && affected(u) && u.committed && hasTrait(u, "Hobbit"),
  );
const shadows = (s: GameState) =>
  allEngaged(s).flatMap((enemy) =>
    enemy.shadows.flatMap((code, i) =>
      enemy.faceupShadows?.[i] ||
      (!enemy.faceupShadows && i < (enemy.revealedShadowCount ?? 0))
        ? []
        : [{ enemy, code, index: i }],
    ),
  );

export function depthsPlayerCostReduction(s: GameState, code: string) {
  return code === P.sam &&
    allCharacters(s).some(
      (u) => owned(s, u) && card(u.code).name === "Frodo Baggins",
    )
    ? 2
    : 0;
}
export function depthsPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.wisdom) return nobleHeroes(s);
  if (code === P.guarded) return locations(s);
  return undefined;
}
export function depthsPlayerPlayProblem(
  s: GameState,
  u: Unit,
  _origin: "hand" | "deck" | "discard" = "hand",
) {
  if (u.code === P.wisdom && !nobleHeroes(s).length)
    return "Captain's Wisdom needs a ready Noble hero you control that can gain resources.";
  if (u.code === P.elevenses) {
    if (s.phase !== "staging")
      return "Elevenses can only be played after the staging step.";
    if (!hobbits(s).length)
      return "Elevenses needs a questing Hobbit character you control.";
  }
  return null;
}
export function depthsPlayerAbilityAnyPlayer(code: string) {
  return code === P.eldahir;
}
export function depthsPlayerAbilityLabel(code: string): string | undefined {
  if (code === P.eldahir)
    return "Spend 1 Lore resource · Look at a shadow · Once per phase";
  if (code === P.explorer) return "Exhaust · Move all progress to a location";
  if (code === P.guarded)
    return "Exhaust a Ranger or Scout · Location −2 threat";
  return undefined;
}
export function depthsPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    if (!guardedAttachment(s, u, attachmentId))
      return "Choose your active Guarded Ceaselessly attachment.";
    if (!affected(u)) return "This location is immune to player card effects.";
    if (!scouts(s).length)
      return "You need a ready Ranger or Scout character you control.";
    return null;
  }
  if (!usable(u)) return "This character's printed ability is unavailable.";
  if (u.code === P.eldahir) {
    if (count(s, PHASE + "eldahir:" + u.id))
      return "Eldahir has already acted this phase.";
    if (!payers(s, "lore").length || !shadows(s).length)
      return "You need a spendable Lore resource and a facedown shadow on an engaged enemy.";
  } else if (u.code === P.explorer) {
    if (!owned(s, u)) return "Choose a Mirkwood Explorer you control.";
    if (!exhaustible(u) || u.progress <= 0 || !explorerTargets(s).length)
      return "Mirkwood Explorer needs to exhaust and move progress to an eligible location.";
  }
  return null;
}
export function useDepthsPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (
    attachmentId
      ? !u.attachments.some(
          (a) => a.id === attachmentId && a.code === P.guarded,
        )
      : ![P.eldahir, P.explorer].some((c) => c === u.code)
  )
    return false;
  const problem = depthsPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  if (attachmentId) {
    choose(
      s,
      "Guarded Ceaselessly · Exhaust a Ranger or Scout",
      scouts(s).map((h) =>
        option(h, [
          fx("depthsPlayerGuarded", {
            source: attachmentId,
            target: u.id,
            text: h.id,
          }),
        ]),
      ),
    );
  } else if (u.code === P.eldahir) {
    choose(
      s,
      "Eldahir · Choose a Lore resource payer",
      payers(s, "lore").map((h) =>
        option(h, [
          fx("depthsPlayerEldahirTarget", {
            source: u.id,
            target: h.id,
          }),
        ]),
      ),
    );
  } else {
    choose(
      s,
      "Mirkwood Explorer · Move all progress",
      explorerTargets(s).map((l) =>
        option(l, [
          fx("depthsPlayerExplorerMove", {
            source: u.id,
            target: l.id,
          }),
        ]),
      ),
    );
  }
  return true;
}

/** Exhaustion is an additional event cost and survives cancellation of its effects. */
export function depthsPlayerEventCost(
  s: GameState,
  code: string,
  target?: string,
) {
  if (code !== P.wisdom) return;
  const h = get(s, target);
  requireRule(
    h && nobleHeroes(s).some((u) => u.id === h.id),
    "Exhaust a ready Noble hero you control.",
  );
  requireRule(
    exhaustCharacter(s, h),
    "The Noble hero must exhaust to pay Captain's Wisdom.",
  );
}
export function depthsPlayerEvent(s: GameState, code: string, target?: string) {
  if (code === P.wisdom) {
    const h = get(s, target);
    if (h && owned(s, h) && isHero(h) && affected(h) && canGainResources(s, h))
      h.resources += 2;
    return true;
  }
  if (code === P.elevenses) {
    prepend(
      s,
      fx("depthsPlayerElevensesChoose", { ids: [], player: activeSeat(s) }),
    );
    return true;
  }
  return false;
}

export function depthsPlayerSurgeRevealed(s: GameState, code: string) {
  prepend(
    s,
    ...allCharacters(s)
      .filter(
        (u) =>
          u.code === P.lanwyn &&
          usable(u) &&
          count(s, PHASE + "lanwyn:" + u.id) < 2,
      )
      .map((u) =>
        fx("depthsPlayerLanwynOffer", {
          source: u.id,
          code,
          player: ownerOf(s, u),
        }),
      ),
  );
}
export function depthsPlayerThreatRaised(
  s: GameState,
  raiser: number,
  amount: number,
) {
  if (amount <= 0) return;
  prepend(
    s,
    ...allCharacters(s)
      .filter(
        (u) =>
          u.code === P.sam && usable(u) && !count(s, ROUND + "sam:" + u.id),
      )
      .map((u) => fx("depthsPlayerSamOffer", { source: u.id, player: raiser })),
  );
}
export function depthsPlayerQuestSucceeded(s: GameState) {
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.code === P.explorer && usable(u) && u.committed)
      .map((u) =>
        fx("depthsPlayerExplorerOffer", {
          source: u.id,
          player: ownerOf(s, u),
        }),
      ),
  );
}

/** Actual positive spending is retained through Forage/Carn taxes and ally Doomed choices. */
export function depthsPlayerCardPaid(
  s: GameState,
  u: Unit,
  payment: Record<string, number>,
  played: boolean,
  fromHand: boolean,
) {
  if (u.code !== P.ironsmith || !played || !fromHand) return;
  const positive = Object.entries(payment).filter(([, n]) => n > 0);
  const payer = positive.length === 1 ? get(s, positive[0][0]) : undefined;
  if (!payer || !isHero(payer)) return;
  s.used.push(PHASE + "ironsmith-paid:" + u.id + ":" + positive[0][0]);
}
export function depthsPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (u.code !== P.ironsmith) return;
  const prefix = PHASE + "ironsmith-paid:" + u.id + ":";
  let hero: string | undefined;
  for (const p of playerOrder(s)) {
    const state = seatView(s, p);
    const marker = state.used.find((k) => k.startsWith(prefix));
    if (marker) hero = marker.slice(prefix.length);
    state.used.splice(
      0,
      state.used.length,
      ...state.used.filter((k) => !k.startsWith(prefix)),
    );
  }
  if (played && fromHand && hero)
    prepend(
      s,
      fx("depthsPlayerIronsmithOffer", {
        source: u.id,
        target: hero,
        player: activeSeat(s),
      }),
    );
}
/** A new play instance does not inherit the departed instance's limits or lasting effects. */
export function depthsPlayerCharacterLeft(s: GameState, u: Unit) {
  const exact = new Set([
    PHASE + "lanwyn:" + u.id,
    PHASE + "eldahir:" + u.id,
    ROUND + "sam:" + u.id,
    ROUND + "sam-bonus:" + u.id,
  ]);
  const paidPrefix = PHASE + "ironsmith-paid:" + u.id + ":";
  const markerLists = new Set([
    s.used,
    ...(s.table?.seats.map((p) => p.used) ?? []),
  ]);
  for (const used of markerLists) {
    used.splice(
      0,
      used.length,
      ...used.filter((k) => !exact.has(k) && !k.startsWith(paidPrefix)),
    );
  }
}

function ironsmithCards(s: GameState, hero: Unit) {
  const attachable = (u: Unit) =>
    card(u.code).type_code === "attachment" &&
    (hasTrait(u, "Weapon") || hasTrait(u, "Armor")) &&
    !effectCardPlayProblem(s, u, { putIntoPlay: true }) &&
    effectCardPlayTargets(s, u, { putIntoPlay: true }).some(
      (h) => h.id === hero.id,
    );
  const hand = movableHand(s)
    .filter(attachable)
    .map((u) => ({
      u,
      index: -1,
      id: u.id,
      label: name(u) + " · From hand",
    }));
  const discard = dikeCannotLeaveDiscard(s)
    ? []
    : s.discard.flatMap((code, index) => {
        const u: Unit = {
          id: "depths-discard:" + index,
          code,
          exhausted: false,
          damage: 0,
          progress: 0,
          resources: 0,
          committed: false,
          attachments: [],
          boost: 0,
          attacked: false,
          shadows: [],
          owner: activeSeat(s),
        };
        return attachable(u)
          ? [
              {
                u,
                index,
                id: "discard-" + index,
                label: name(u) + " · From discard",
              },
            ]
          : [];
      });
  return [...hand, ...discard];
}

export function depthsPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("depthsPlayer")) return false;
  const u = get(s, e.source);
  const target = get(s, e.target);
  switch (e.kind) {
    case "depthsPlayerLanwynOffer": {
      if (
        !u ||
        u.code !== P.lanwyn ||
        !usable(u) ||
        count(s, PHASE + "lanwyn:" + u.id) >= 2
      )
        break;
      const options: Option[] = [];
      if (u.exhausted && !cannotReady(u, s))
        options.push({
          id: "ready",
          label: "Ready Lanwyn",
          code: u.code,
          effects: [fx("depthsPlayerLanwyn", { source: u.id, text: "ready" })],
        });
      options.push({
        id: "will",
        label: "+2 willpower until the end of the phase",
        code: u.code,
        effects: [fx("depthsPlayerLanwyn", { source: u.id, text: "will" })],
      });
      choosePlayerResponse(
        s,
        u.id,
        u.code,
        "Lanwyn · Card with surge revealed",
        [...options, skip],
        e.code ? card(e.code).name + " has surge." : undefined,
      );
      break;
    }
    case "depthsPlayerLanwyn":
      requireRule(
        u &&
          u.code === P.lanwyn &&
          usable(u) &&
          count(s, PHASE + "lanwyn:" + u.id) < 2,
        "Lanwyn may respond twice per phase.",
      );
      if (e.text === "ready") {
        requireRule(
          u.exhausted && !cannotReady(u, s),
          "Lanwyn must be able to ready.",
        );
        readyCharacter(s, u);
      } else u.tempWill = (u.tempWill ?? 0) + 2;
      s.used.push(PHASE + "lanwyn:" + u.id);
      break;
    case "depthsPlayerSamOffer":
      if (
        !u ||
        u.code !== P.sam ||
        !usable(u) ||
        count(s, ROUND + "sam:" + u.id) ||
        !payers(s, "spirit").length
      )
        break;
      choosePlayerResponse(
        s,
        u.id,
        u.code,
        "Sam Gamgee · Your threat was raised",
        [
          {
            id: "pay",
            code: u.code,
            label:
              "Spend 1 Spirit resource · Ready and give Sam +1 to all stats",
            effects: [fx("depthsPlayerSamPayer", { source: u.id })],
          },
          skip,
        ],
      );
      break;
    case "depthsPlayerSamPayer":
      if (
        !u ||
        u.code !== P.sam ||
        !usable(u) ||
        count(s, ROUND + "sam:" + u.id)
      )
        break;
      choose(
        s,
        "Sam Gamgee · Choose your Spirit resource payer",
        payers(s, "spirit").map((h) =>
          option(h, [
            fx("depthsPlayerSamPay", {
              source: u.id,
              target: h.id,
            }),
          ]),
        ),
      );
      break;
    case "depthsPlayerSamPay":
      requireRule(
        u &&
          u.code === P.sam &&
          usable(u) &&
          !count(s, ROUND + "sam:" + u.id) &&
          target &&
          payers(s, "spirit").some((h) => h.id === target.id),
        "The player whose threat rose must spend one Spirit resource.",
      );
      payThen(
        s,
        () => {
          spendResources(s, target, 1);
          s.used.push(ROUND + "sam:" + u.id);
        },
        fx("depthsPlayerSamResolve", { source: u.id }),
      );
      break;
    case "depthsPlayerSamResolve":
      if (
        u &&
        u.code === P.sam &&
        affected(u) &&
        count(s, ROUND + "sam:" + u.id)
      ) {
        readyCharacter(s, u);
        s.used.push(ROUND + "sam-bonus:" + u.id);
      }
      break;
    case "depthsPlayerEldahirTarget":
      requireRule(
        u &&
          u.code === P.eldahir &&
          !depthsPlayerAbilityProblem(s, u) &&
          target &&
          payers(s, "lore").some((h) => h.id === target.id),
        "Choose a legal Lore payer.",
      );
      choose(
        s,
        "Eldahir · Choose a facedown shadow",
        shadows(s).map(({ enemy, code, index }) => ({
          id: enemy.id + ":" + index,
          code: enemy.code,
          label: name(enemy) + " · Facedown shadow " + (index + 1),
          effects: [
            fx("depthsPlayerEldahirLook", {
              source: u.id,
              target: enemy.id,
              code,
              count: index,
              text: target.id,
            }),
          ],
        })),
      );
      break;
    case "depthsPlayerEldahirLook": {
      const payer = get(s, e.text);
      requireRule(
        u &&
          u.code === P.eldahir &&
          !depthsPlayerAbilityProblem(s, u) &&
          target &&
          payer &&
          payers(s, "lore").some((h) => h.id === payer.id) &&
          shadows(s).some(
            (x) =>
              x.enemy.id === target.id &&
              x.index === e.count &&
              x.code === e.code,
          ),
        "Choose the same actual facedown shadow and an eligible payer.",
      );
      payThen(
        s,
        () => {
          spendResources(s, payer, 1);
          s.used.push(PHASE + "eldahir:" + u.id);
        },
        fx("depthsPlayerEldahirShow", {
          source: u.id,
          target: target.id,
          code: e.code,
          count: e.count,
        }),
      );
      break;
    }
    case "depthsPlayerEldahirShow": {
      if (
        !target ||
        !shadows(s).some(
          (x) =>
            x.enemy.id === target.id &&
            x.index === e.count &&
            x.code === e.code,
        )
      )
        break;
      if (
        u &&
        u.code === P.eldahir &&
        count(s, PHASE + "eldahir:" + u.id) &&
        affected(u) &&
        (card(e.code!).shadow ?? "").trim()
      )
        u.tempDefense = (u.tempDefense ?? 0) + 2;
      choose(
        s,
        "Eldahir · Look at the shadow card",
        [
          {
            id: "continue",
            code: e.code,
            label: "Continue · Shadow stays facedown",
            effects: [],
          },
        ],
        card(e.code!).shadow || "This card has no shadow effect.",
      );
      log(
        s,
        "Eldahir looks at a facedown shadow without revealing or resolving it.",
      );
      break;
    }
    case "depthsPlayerExplorerOffer":
      if (u && u.code === P.explorer && usable(u) && u.committed)
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Mirkwood Explorer · Quested successfully",
          [
            {
              id: "progress",
              label: "Place 1 progress on Mirkwood Explorer",
              code: u.code,
              effects: [fx("depthsPlayerExplorerProgress", { source: u.id })],
            },
            skip,
          ],
        );
      break;
    case "depthsPlayerExplorerProgress":
      if (u && u.code === P.explorer && usable(u) && u.committed) u.progress++;
      break;
    case "depthsPlayerExplorerMove": {
      requireRule(
        u &&
          u.code === P.explorer &&
          !depthsPlayerAbilityProblem(s, u) &&
          target &&
          explorerTargets(s).some((l) => l.id === target.id),
        "Move progress to a location that can receive it.",
      );
      payThen(
        s,
        () =>
          requireRule(
            exhaustCharacter(s, u),
            "Mirkwood Explorer must exhaust.",
          ),
        fx("depthsPlayerExplorerMoveResolve", {
          source: u.id,
          target: target.id,
        }),
      );
      break;
    }
    case "depthsPlayerExplorerMoveResolve":
      if (
        u &&
        u.code === P.explorer &&
        target &&
        explorerTargets(s).some((l) => l.id === target.id)
      ) {
        const amount = Math.min(
          u.progress,
          watcherWaterProgressCapacity(s, target) ?? Infinity,
        );
        u.progress -= amount;
        progressLocation(s, target, amount);
      }
      break;
    case "depthsPlayerGuarded": {
      const payer = get(s, e.text);
      requireRule(
        target &&
          guardedAttachment(s, target, e.source) &&
          affected(target) &&
          payer &&
          scouts(s).some((h) => h.id === payer.id),
        "Choose your Ranger or Scout to pay Guarded Ceaselessly's exhaustion cost.",
      );
      payThen(
        s,
        () =>
          requireRule(
            exhaustCharacter(s, payer),
            "The Ranger or Scout must exhaust.",
          ),
        fx("depthsPlayerGuardedResolve", { target: target.id }),
      );
      break;
    }
    case "depthsPlayerGuardedResolve":
      if (target && affected(target))
        target.tempThreat = (target.tempThreat ?? 0) - 2;
      break;
    case "depthsPlayerElevensesChoose": {
      const ids = e.ids ?? [];
      const candidates = hobbits(s).filter((h) => !ids.includes(h.id));
      const options = candidates.map((h) =>
        option(h, [
          fx("depthsPlayerElevensesChoose", {
            ids: [...ids, h.id],
            player: activeSeat(s),
          }),
        ]),
      );
      if (ids.length)
        options.push({
          id: "finish",
          label:
            "Ready and remove " +
            ids.length +
            " Hobbit(s) · Reduce threat by " +
            ids.length,
          effects: [
            fx("depthsPlayerElevensesResolve", { ids, player: activeSeat(s) }),
          ],
        });
      if (!options.length) break;
      choose(
        s,
        "Elevenses · Choose questing Hobbits (" + ids.length + " selected)",
        options,
      );
      break;
    }
    case "depthsPlayerElevensesResolve": {
      const chosen = (e.ids ?? []).map((id) => get(s, id));
      requireRule(
        chosen.length > 0 &&
          new Set(e.ids).size === chosen.length &&
          chosen.every((h) => h && hobbits(s).some((u) => u.id === h.id)),
        "Choose distinct Hobbit characters you control that are still questing.",
      );
      let complete = (chosen as Unit[]).every(
        (h) => h.exhausted && !cannotReady(h, s),
      );
      for (const h of chosen as Unit[]) {
        readyCharacter(s, h);
        if (h.exhausted) complete = false;
        h.committed = false;
        s.committedIds = s.committedIds.filter((id) => id !== h.id);
      }
      if (complete)
        reduceThreat(s, chosen.length, {
          code: P.elevenses,
          owner: activeSeat(s),
        });
      break;
    }
    case "depthsPlayerIronsmithOffer": {
      if (
        !u ||
        u.code !== P.ironsmith ||
        !usable(u) ||
        !target ||
        !isHero(target) ||
        !affected(target)
      )
        break;
      const candidates = ironsmithCards(s, target);
      if (!candidates.length) break;
      choosePlayerResponse(
        s,
        u.id,
        u.code,
        "Master Ironsmith · Attach Weapon or Armor to paying hero",
        [
          ...candidates.map((c): Option => ({
            id: c.id,
            code: c.u.code,
            label: c.label,
            effects: [
              fx("depthsPlayerIronsmithAttach", {
                source: u.id,
                target: target.id,
                code: c.u.code,
                value: c.index,
                text: c.index < 0 ? c.u.id : undefined,
              }),
            ],
          })),
          skip,
        ],
      );
      break;
    }
    case "depthsPlayerIronsmithAttach": {
      requireRule(
        u &&
          u.code === P.ironsmith &&
          usable(u) &&
          target &&
          isHero(target) &&
          affected(target),
        "The paying hero must still be in play.",
      );
      const selected = ironsmithCards(s, target).find(
        (c) =>
          c.u.code === e.code &&
          c.index === e.value &&
          (c.index >= 0 || c.u.id === e.text),
      );
      requireRule(selected, "Choose the same legal physical Weapon or Armor.");
      const physical =
        selected.index < 0 ? selected.u : takePlayerDiscard(s, selected.index);
      if (selected.index < 0)
        s.hand = s.hand.filter((h) => h.id !== physical.id);
      resolvePlayerCard(s, physical, target.id, 0, false, false);
      break;
    }
    default:
      return false;
  }
  return true;
}
