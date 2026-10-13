import { DROWNED_PLAYER as P } from "./drowned-player-support";
import { cobasReactiveAttachmentEntered } from "./cobas-reactive";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  locationQuest,
  prepend,
  requireRule,
  skip,
  spendResources,
  stats,
  threatOf,
  units,
} from "./core";
import {
  charactersCommitted,
  damage,
  exhaustCharacter,
  progressLocation,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  attackersFor,
  firstPlayer,
  forOwner,
  ownerOf,
  seatName,
} from "./table";
import {
  expansionPlayTargets,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { isHero } from "./card-types";
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
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerAttack } from "./combat";
import { canCommit, playTargets } from "./actions";
import { amonPlayerCannotDeclareAttack } from "./amon-din-player-cards";
import { stormcallerCanAttackEnemy } from "./stormcaller";

const ROUND = "round:drowned:";
const affected = (u: Unit) => !playerCardImmune(u);
const usable = (u: Unit) => !u.blanked && !isSacked(u) && affected(u);
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const exhaustible = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const owned = (s: GameState, u: Unit) => ownerOf(s, u) === activeSeat(s);
const used = (s: GameState, key: string) =>
  s.used.includes(key) ||
  !!s.table?.seats.some((p, i) => i !== activeSeat(s) && p.used.includes(key));
const enemy = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(enemy);
const stagingEnemies = (s: GameState) =>
  s.staging.filter((u) => enemy(u) && affected(u));
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const payers = (s: GameState, sphere: string, player?: number) =>
  allHeroes(s).filter(
    (h) =>
      (player === undefined || ownerOf(s, h) === player) &&
      h.resources > 0 &&
      hasResourceIcon(h, sphere) &&
      heirsCanSpendResources(s, h),
  );
const progressTargets = (s: GameState) =>
  units(s).filter(
    (u) =>
      card(u.code).type_code === "location" &&
      affected(u) &&
      !raidLocationProgressBlocked(s, u) &&
      !dreadLocationProgressBlocked(s, u) &&
      !tharbadLocationBlocked(s, u) &&
      !catchLocationProgressBlocked(s, u) &&
      !heirsLocationProgressBlocked(s, u) &&
      !shadowFlameLocationProgressBlocked(s, u) &&
      (watcherWaterProgressCapacity(s, u) ?? Infinity) > 0,
  );
const trappedEnemies = (s: GameState) =>
  enemies(s).filter(
    (u) =>
      affected(u) &&
      u.attachments.some(
        (a) =>
          !a.facedown &&
          (card(a.code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Trap"),
      ),
  );

/** Mandatory reactions to actual payment finish before its purchased effect. */
function payThen(s: GameState, cost: () => void, effects: Effect[]) {
  const continuation = s.queue,
    player = activeSeat(s);
  s.queue = [];
  cost();
  s.queue.push(
    ...effects.map((e) => ({ ...e, player: e.player ?? player })),
    ...continuation,
  );
}
function remedy(s: GameState, host: Unit, id?: string) {
  return host.attachments.find(
    (a) =>
      a.id === id &&
      a.code === P.remedy &&
      enabled(a) &&
      attachmentController(s, host, a) === activeSeat(s),
  );
}
const remedyTargets = (s: GameState, host: Unit) =>
  (expansionPlayTargets(s, card(P.remedy)) ?? []).filter(
    (h) =>
      h.id !== host.id &&
      playTargets(s, { code: P.remedy } as Unit).some((x) => x.id === h.id),
  );
export function drownedPlayerFuryEnemies(
  s: GameState,
  hero: Unit,
  paid = false,
) {
  if (amonPlayerCannotDeclareAttack(s, activeSeat(s))) return [];
  return enemies(s).filter(
    (u) =>
      stormcallerCanAttackEnemy(s, u, hero) &&
      attackersFor(s, u, paid ? hero.id : undefined).some(
        (h) => h.id === hero.id,
      ),
  );
}
const furyHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      owned(s, h) &&
      affected(h) &&
      exhaustible(h) &&
      drownedPlayerFuryEnemies(s, h).length,
  );

export function drownedPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.fury) return furyHeroes(s);
  if (code === P.interrogation) return trappedEnemies(s);
  return undefined;
}
export function drownedPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.fury) {
    if (s.phase !== "quest")
      return "Battle-fury can only be played before the staging step.";
    if (!furyHeroes(s).length)
      return "Battle-fury needs a ready hero you control and an eligible attack target.";
  }
  if (u.code === P.interrogation && !trappedEnemies(s).length)
    return "Interrogation needs an enemy with an attached Trap.";
  return null;
}
export function drownedPlayerAbilityLabel(code: string): string | undefined {
  if (code === P.argalad)
    return "Exhaust · Reduce a staging enemy's threat · Once per round";
  if (code === P.remedy)
    return "Spend 1 attached hero resource · Move Dúnedain Remedy";
  return undefined;
}
export function drownedPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    if (!remedy(s, u, attachmentId))
      return "Choose your active Dúnedain Remedy.";
    if (!isHero(u) || u.resources < 1 || !heirsCanSpendResources(s, u))
      return "The attached hero needs a spendable resource.";
    if (!remedyTargets(s, u).length) return "Choose another eligible hero.";
    return null;
  }
  if (u.code !== P.argalad) return null;
  if (!owned(s, u) || !usable(u) || !exhaustible(u))
    return "Argalad must be ready and able to exhaust.";
  if (used(s, ROUND + "argalad:" + u.id))
    return "Argalad has already acted this round.";
  if (!stagingEnemies(s).length) return "Choose an enemy in the staging area.";
  return null;
}
export function useDrownedPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (
    attachmentId
      ? !u.attachments.some((a) => a.id === attachmentId && a.code === P.remedy)
      : u.code !== P.argalad
  )
    return false;
  const problem = drownedPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  choose(
    s,
    attachmentId
      ? "Dúnedain Remedy · Choose another hero"
      : "Argalad · Choose a staging enemy",
    (attachmentId ? remedyTargets(s, u) : stagingEnemies(s)).map((target) =>
      option(target, [
        fx(
          attachmentId ? "drownedPlayerRemedyPay" : "drownedPlayerArgaladPay",
          { source: u.id, target: target.id, text: attachmentId },
        ),
      ]),
    ),
  );
  return true;
}
export function drownedPlayerEventCost(
  s: GameState,
  code: string,
  target?: string,
) {
  if (code !== P.fury) return;
  const hero = get(s, target);
  requireRule(
    hero && furyHeroes(s).some((h) => h.id === hero.id),
    "Choose a ready hero with a legal attack target.",
  );
  requireRule(
    exhaustCharacter(s, hero),
    "Battle-fury exhausts the chosen hero as its cost.",
  );
}
export function drownedPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
) {
  const u = get(s, target);
  if (code === P.fury) {
    if (u && isHero(u) && owned(s, u) && affected(u)) {
      const targets = drownedPlayerFuryEnemies(s, u, true);
      if (targets.length)
        choose(
          s,
          "Battle-fury · Attack an eligible enemy",
          targets.map((e) =>
            option(e, [
              fx("drownedPlayerFuryAttack", { source: u.id, target: e.id }),
            ]),
          ),
        );
    }
    return true;
  }
  if (code === P.interrogation) {
    if (u && trappedEnemies(s).some((e) => e.id === u.id)) {
      const looked = s.encounterDeck.slice(
        0,
        Math.max(0, Number(card(u.code).threat) || 0),
      );
      if (looked.length)
        choose(s, "Interrogation · Discard up to one viewed card", [
          ...looked.map((code, index) => ({
            id: "card-" + index,
            code,
            label: `${index + 1}. ${card(code).name}`,
            effects: [
              fx("drownedPlayerInterrogationReturn", {
                ids: looked,
                value: index,
              }),
            ],
          })),
          {
            id: "none",
            label: "Return all cards in the same order",
            effects: [
              fx("drownedPlayerInterrogationReturn", {
                ids: looked,
                value: -1,
              }),
            ],
          },
        ]);
    }
    return true;
  }
  return false;
}
export function drownedPlayerAttachmentEntered(
  s: GameState,
  host: Unit,
  a: Attachment,
) {
  if (a.code === P.remedy && enabled(a) && isHero(host))
    prepend(
      s,
      fx("drownedPlayerRemedyOffer", {
        source: host.id,
        target: a.id,
        player: attachmentController(s, host, a) ?? ownerOf(s, host),
      }),
    );
}
export function drownedPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  const effects: Effect[] = [];
  if (u.code === P.marksman && usable(u))
    effects.push(
      fx("drownedPlayerMarksmanOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (played && fromHand && hasTrait(u, "Silvan"))
    for (const host of progressTargets(s))
      for (const a of host.attachments) {
        if (a.code === P.hithlain && enabled(a))
          effects.push(
            fx("drownedPlayerHithlainOffer", {
              source: host.id,
              target: a.id,
              player: attachmentController(s, host, a) ?? ownerOf(s, u),
            }),
          );
      }
  prepend(s, ...effects);
}
export function drownedPlayerTraveled(s: GameState, location: Unit) {
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.code === P.robin && usable(u))
      .map((u) =>
        fx("drownedPlayerRobinOffer", {
          source: u.id,
          target: location.id,
          value: locationQuest(s, location),
          player: firstPlayer(s),
        }),
      ),
  );
}
/** Leave-play removes physical-instance limits and enemy-lasting modifiers. */
export function drownedPlayerUnitLeft(s: GameState, u: Unit) {
  const markers = new Set([
    ROUND + "argalad:" + u.id,
    ROUND + "marksman:" + u.id,
  ]);
  for (const list of new Set([
    s.used,
    ...(s.table?.seats.map((p) => p.used) ?? []),
  ]))
    list.splice(0, list.length, ...list.filter((x) => !markers.has(x)));
}

export function drownedPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("drownedPlayer")) return false;
  const u = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "drownedPlayerArgaladPay": {
      requireRule(
        u?.code === P.argalad &&
          !drownedPlayerAbilityProblem(s, u) &&
          target &&
          stagingEnemies(s).some((x) => x.id === target.id),
        "Choose an eligible staging enemy for Argalad.",
      );
      payThen(s, () => {
        requireRule(exhaustCharacter(s, u), "Argalad must exhaust.");
        s.used.push(ROUND + "argalad:" + u.id);
      }, [
        fx("drownedPlayerArgaladResolve", { source: u.id, target: target.id }),
      ]);
      break;
    }
    case "drownedPlayerArgaladResolve":
      if (u && target && stagingEnemies(s).some((x) => x.id === target.id)) {
        const before = threatOf(s, target),
          reduction = stats(s, u).attack;
        target.tempThreat = (target.tempThreat ?? 0) - reduction;
        if (before > 0 && threatOf(s, target) === 0) damage(s, target.id, 1);
      }
      break;
    case "drownedPlayerRemedyPay": {
      const a = u && remedy(s, u, e.text);
      requireRule(
        u &&
          a &&
          !drownedPlayerAbilityProblem(s, u, a.id) &&
          target &&
          remedyTargets(s, u).some((h) => h.id === target.id),
        "The attached hero must pay to move Remedy to another eligible hero.",
      );
      payThen(s, () => spendResources(s, u, 1), [
        fx("drownedPlayerRemedyMove", {
          source: u.id,
          target: target.id,
          text: a.id,
        }),
      ]);
      break;
    }
    case "drownedPlayerRemedyMove": {
      const a = u?.attachments.find(
        (a) => a.id === e.text && a.code === P.remedy,
      );
      if (
        !u ||
        !a ||
        !target ||
        !remedyTargets(s, u).some((h) => h.id === target.id)
      )
        break;
      a.owner ??= ownerOf(s, u);
      u.attachments = u.attachments.filter((x) => x.id !== a.id);
      target.attachments.push(a);
      drownedPlayerAttachmentEntered(s, target, a);
      cobasReactiveAttachmentEntered(s, target, a);
      break;
    }
    case "drownedPlayerRemedyOffer": {
      const a = u?.attachments.find(
        (a) => a.id === e.target && a.code === P.remedy && enabled(a),
      );
      if (u && a && affected(u) && rhosgobelHealingAllowed(s, u))
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Dúnedain Remedy · Heal attached hero",
          [
            {
              id: "heal",
              label: `Heal 1 damage on ${name(u)}`,
              code: u.code,
              effects: [
                fx("drownedPlayerRemedyHeal", { source: u.id, target: a.id }),
              ],
            },
            skip,
          ],
        );
      break;
    }
    case "drownedPlayerRemedyHeal": {
      const a = u?.attachments.find(
        (a) => a.id === e.target && a.code === P.remedy,
      );
      if (u && a && affected(u))
        rhosgobelHeal(s, u, 1, {
          source: a.id,
          code: a.code,
          player: activeSeat(s),
        });
      break;
    }
    case "drownedPlayerMarksmanOffer":
      if (u?.code === P.marksman && usable(u) && enemies(s).some(affected))
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Marksman of Lórien · Choose an enemy",
          [
            ...enemies(s)
              .filter(affected)
              .map((t) =>
                option(t, [
                  fx("drownedPlayerMarksmanReduce", { target: t.id }),
                ]),
              ),
            skip,
          ],
        );
      break;
    case "drownedPlayerMarksmanReduce":
      if (target && enemy(target) && affected(target))
        s.used.push(ROUND + "marksman:" + target.id);
      break;
    case "drownedPlayerHithlainOffer": {
      const a = u?.attachments.find(
        (a) => a.id === e.target && a.code === P.hithlain && enabled(a),
      );
      if (u && a && progressTargets(s).some((l) => l.id === u.id))
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Hithlain · Silvan ally played from hand",
          [
            {
              id: "progress",
              label: `Place 1 progress on ${name(u)}`,
              code: u.code,
              effects: [
                fx("drownedPlayerHithlainProgress", {
                  source: u.id,
                  target: a.id,
                }),
              ],
            },
            skip,
          ],
        );
      break;
    }
    case "drownedPlayerHithlainProgress":
      if (u && progressTargets(s).some((l) => l.id === u.id))
        progressLocation(s, u, 1);
      break;
    case "drownedPlayerRobinOffer": {
      if (u?.code !== P.robin || !usable(u) || !enemies(s).some(affected))
        break;
      const options = payers(s, "spirit").map((h) => ({
        ...option(h, [
          fx("drownedPlayerRobinPay", {
            source: u.id,
            target: h.id,
            value: e.value,
            player: ownerOf(s, h),
          }),
        ]),
        label: `Spend 1 Spirit from ${name(h)} · ${seatName(s, ownerOf(s, h))}`,
        ability: {
          player: ownerOf(s, h),
          source: u.id,
          code: u.code,
          type: "response" as const,
        },
      }));
      if (options.length)
        choose(s, "Robin Smallburrow · After traveling", [...options, skip]);
      break;
    }
    case "drownedPlayerRobinPay":
      requireRule(
        u?.code === P.robin &&
          usable(u) &&
          target &&
          payers(s, "spirit", activeSeat(s)).some((h) => h.id === target.id),
        "The responding player must pay a spendable Spirit resource.",
      );
      payThen(s, () => spendResources(s, target, 1), [
        fx("drownedPlayerRobinRaise", { value: e.value }),
      ]);
      break;
    case "drownedPlayerRobinRaise":
      for (const enemy of enemies(s).filter(affected))
        enemy.tempEngagement = (enemy.tempEngagement ?? 0) + (e.value ?? 0);
      break;
    case "drownedPlayerFuryAttack": {
      if (
        !u ||
        !isHero(u) ||
        !owned(s, u) ||
        !affected(u) ||
        !target ||
        !drownedPlayerFuryEnemies(s, u, true).some(
          (enemy) => enemy.id === target.id,
        )
      )
        break;
      const continuation = s.queue;
      s.queue = [];
      playerAttack(s, target, [u.id], false, "battle-fury");
      s.queue.push(
        fx("drownedPlayerFuryOffer", { source: u.id, player: activeSeat(s) }),
        ...continuation,
      );
      break;
    }
    case "drownedPlayerFuryOffer":
      if (
        u &&
        isHero(u) &&
        owned(s, u) &&
        affected(u) &&
        !u.committed &&
        canCommit(s, { ...u, exhausted: false }) &&
        payers(s, "spirit").length
      )
        choose(s, "Battle-fury · Group Spirit payment", [
          ...payers(s, "spirit").map((h) => ({
            ...option(h, [
              fx("drownedPlayerFuryPay", { source: u.id, target: h.id }),
            ]),
            label: `Spend 1 Spirit from ${name(h)} · ${seatName(s, ownerOf(s, h))}`,
          })),
          skip,
        ]);
      break;
    case "drownedPlayerFuryPay":
      requireRule(
        u &&
          isHero(u) &&
          owned(s, u) &&
          !u.committed &&
          target &&
          payers(s, "spirit").some((h) => h.id === target.id),
        "Choose one group Spirit resource to commit the attacking hero.",
      );
      payThen(
        s,
        () =>
          forOwner(s, ownerOf(s, target), () => spendResources(s, target, 1)),
        [fx("drownedPlayerFuryCommit", { source: u.id })],
      );
      break;
    case "drownedPlayerFuryCommit":
      if (
        u &&
        isHero(u) &&
        owned(s, u) &&
        affected(u) &&
        !u.committed &&
        canCommit(s, { ...u, exhausted: false })
      ) {
        u.committed = true;
        charactersCommitted(s, [u]);
      }
      break;
    case "drownedPlayerInterrogationReturn": {
      const looked = [...(e.ids ?? [])],
        index = e.value ?? -1;
      requireRule(
        index === -1 ||
          (Number.isInteger(index) && index >= 0 && index < looked.length),
        "Choose one of the viewed physical cards or return them all.",
      );
      requireRule(
        looked.every((code, i) => s.encounterDeck[i] === code),
        "The viewed physical encounter cards must remain in their original order.",
      );
      if (index >= 0)
        s.encounterDiscard.push(...s.encounterDeck.splice(index, 1));
      break;
    }
    default:
      throw new Error(`Unknown Drowned Ruins player effect: ${e.kind}`);
  }
  return true;
}
