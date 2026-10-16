import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  canPay,
  cannotReady,
  fx,
  get,
  prepend,
  requireRule,
  skip,
} from "./core";
import { destroy, discardAttachment, readyCharacter } from "./board";
import {
  activeSeat,
  allCharacters,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { effectiveTraits, hasTrait } from "./expansion-passives";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { isEnemy } from "./ships";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { morgulCannotLeave } from "./morgul-vale";
import { dunlandCannotLeave } from "./dunland-trap";
import { trialsCannotLeave } from "./three-trials";
import { depthsCannotLeave } from "./depths";
import { stormcallerAreaCannotLeave } from "./stormcaller";
import { raceHaradCannotLeave } from "./race-harad";
import { BENEATH_SANDS_PLAYER as P } from "./beneath-sands-player-support";

const spearKey = (host: string, attachment: string) =>
  `attack:beneath-sands-spear:${host}:${attachment}`;
const huntingTargets = (s: GameState) =>
  s.staging.filter(
    (u) =>
      isEnemy(u) &&
      !card(u.code).is_unique &&
      !playerEffectImmune(s, u, P.hunting) &&
      !morgulCannotLeave(s, u) &&
      !dunlandCannotLeave(u) &&
      !trialsCannotLeave(s, u) &&
      !depthsCannotLeave(s, u) &&
      !stormcallerAreaCannotLeave(s, u) &&
      !raceHaradCannotLeave(s, u),
  );
const readyTargets = (s: GameState) =>
  drownedCannotReady(s) || desertCrossingCannotPlayerReady(s)
    ? []
    : allCharacters(s).filter(
        (u) =>
          u.exhausted &&
          !cannotReady(u, s) &&
          !playerEffectImmune(s, u, P.peoples),
      );

export function beneathSandsHuntingCondition(
  s: GameState,
  player = activeSeat(s),
) {
  const own = allCharacters(s).filter(
    (u) => ownerOf(s, u) === player && card(u.code).is_unique,
  );
  return own.some(
    (warrior) =>
      hasTrait(warrior, "Warrior") &&
      own.some((scout) => scout.id !== warrior.id && hasTrait(scout, "Scout")),
  );
}
export function beneathSandsFreePeoplesTraitCount(s: GameState) {
  return new Set([...s.heroes, ...s.allies].flatMap(effectiveTraits)).size;
}
export function beneathSandsPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.hunting)
    return "Hunting Party responds after all players commit characters to the quest.";
  if (u.code === P.peoples) {
    if (beneathSandsFreePeoplesTraitCount(s) < 9)
      return "The Free Peoples needs at least 9 different traits among characters you control.";
    if (
      !readyTargets(s).length &&
      ![...s.heroes, ...s.allies].some(
        (u) => !playerEffectImmune(s, u, P.peoples),
      )
    )
      return "The Free Peoples needs a character it can ready or give willpower.";
  }
  return null;
}
export function beneathSandsPlayerEvent(
  s: GameState,
  code: string,
  _target?: string,
) {
  if (code !== P.peoples) return false;
  for (const u of readyTargets(s)) readyCharacter(s, u);
  for (const u of [...s.heroes, ...s.allies])
    if (!playerEffectImmune(s, u, code)) u.tempWill = (u.tempWill ?? 0) + 1;
  return true;
}

/** Called once when all seats have finished their framework quest commitment. */
export function beneathSandsPlayersCommitted(s: GameState) {
  if (!huntingTargets(s).length) return;
  prepend(
    s,
    ...playerOrder(s).flatMap((player) => {
      const p = seatView(s, player);
      return beneathSandsHuntingCondition(s, player)
        ? p.hand
            .filter((u) => u.code === P.hunting && canPay(p, card(u.code)))
            .map((u) =>
              fx("beneathSandsPlayerHuntingOffer", { source: u.id, player }),
            )
        : [];
    }),
  );
}
export function beneathSandsPlayerAttachmentPlayed(
  s: GameState,
  host: Unit,
  a: Attachment,
  played: boolean,
  fromHand: boolean,
) {
  const player = attachmentController(s, host, a);
  if (
    a.code === P.ranger &&
    !a.blanked &&
    !a.facedown &&
    played &&
    fromHand &&
    player === activeSeat(s)
  )
    prepend(
      s,
      fx("beneathSandsPlayerRangerOffer", {
        source: a.id,
        target: host.id,
        player,
      }),
    );
}
export function beneathSandsPlayerAttackersDeclared(
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return attackers.flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          a.code === P.spear &&
          !a.blanked &&
          !a.facedown &&
          !playerEffectImmune(s, host, P.spear),
      )
      .map((a) =>
        fx("beneathSandsPlayerSpearOffer", {
          source: a.id,
          target: host.id,
          player: attachmentController(s, host, a) ?? ownerOf(s, host),
        }),
      ),
  );
}
/** Both the bonus and delayed discard retain the physical attachment identity. */
export function beneathSandsPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const player of playerOrder(s)) {
    const used = seatView(s, player).used;
    for (const host of allCharacters(s).filter((u) => ids.includes(u.id))) {
      const prefix = `attack:beneath-sands-spear:${host.id}:`;
      for (const key of used.filter((key) => key.startsWith(prefix))) {
        const a = host.attachments.find((a) => key === spearKey(host.id, a.id));
        if (a) discardAttachment(s, host, a);
      }
      for (let i = used.length - 1; i >= 0; i--)
        if (used[i].startsWith(prefix)) used.splice(i, 1);
    }
  }
}
export function handleBeneathSandsPlayerEffect(
  s: GameState,
  e: Effect,
): boolean {
  const target = get(s, e.target);
  switch (e.kind) {
    case "beneathSandsPlayerHuntingOffer": {
      const event = s.hand.find(
        (u) => u.id === e.source && u.code === P.hunting,
      );
      if (
        event &&
        beneathSandsHuntingCondition(s) &&
        huntingTargets(s).length &&
        canPay(s, card(event.code))
      )
        choosePlayerResponse(
          s,
          event.id,
          event.code,
          "Hunting Party · Discard a non-unique staging enemy?",
          [
            ...huntingTargets(s).map((u) => ({
              id: u.id,
              code: u.code,
              label: `Play Hunting Party · Discard ${name(u)}, then reveal an encounter card`,
              effects: [
                fx("eventPlay", {
                  source: event.id,
                  code: event.code,
                  effects: [
                    fx("beneathSandsPlayerHuntingDiscard", { target: u.id }),
                  ],
                }),
              ],
            })),
            skip,
          ],
        );
      return true;
    }
    case "beneathSandsPlayerHuntingDiscard": {
      requireRule(
        !!target && huntingTargets(s).some((u) => u.id === target.id),
        "Hunting Party requires a non-unique staging enemy that can be discarded.",
      );
      const continuation = s.queue;
      s.queue = [];
      destroy(s, target!, false);
      if (!get(s, target!.id)) s.queue.push(fx("reveal"));
      s.queue.push(...continuation);
      return true;
    }
    case "beneathSandsPlayerRangerOffer": {
      const a = target?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.ranger && !a.blanked && !a.facedown,
      );
      if (a && attachmentController(s, target!, a) === activeSeat(s))
        choosePlayerResponse(s, a.id, a.code, "Doughty Ranger · Draw a card?", [
          {
            id: "use",
            label: "Draw 1 card",
            effects: [fx("draw", { value: 1 })],
          },
          skip,
        ]);
      return true;
    }
    case "beneathSandsPlayerSpearOffer": {
      const a = target?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.spear && !a.blanked && !a.facedown,
      );
      if (
        a &&
        attachmentController(s, target!, a) === activeSeat(s) &&
        !playerEffectImmune(s, target!, P.spear)
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Haradrim Spear · Gain +3 attack for this attack?",
          [
            {
              id: "use",
              label: `Give ${name(target!)} +3 attack · Discard Haradrim Spear after this attack`,
              effects: [
                fx("beneathSandsPlayerSpearUse", {
                  source: a.id,
                  target: target!.id,
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "beneathSandsPlayerSpearUse": {
      const a = target?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.spear && !a.blanked && !a.facedown,
      );
      requireRule(
        !!a &&
          attachmentController(s, target!, a) === activeSeat(s) &&
          !playerEffectImmune(s, target!, P.spear),
        "The physical Spear and affected attacker must remain in play.",
      );
      s.used.push(spearKey(target!.id, a!.id));
      return true;
    }
    default:
      return false;
  }
}
