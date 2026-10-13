import { COBAS_PLAYER as P } from "./cobas-player-support";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext, readDamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  canGainResources,
  canPay,
  choose,
  fx,
  get,
  prepend,
  requireRule,
  skip,
  stats,
} from "./core";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  attachmentController,
  forOwner,
  ownerOf,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { isHero } from "./card-types";
import { playerCardImmune } from "./card-immunity";
import { canCommit } from "./actions";
import {
  charactersCommitted,
  damage,
  discardAttachment,
  enemyAddedToStaging,
} from "./board";
import { choosePlayerResponse } from "./player-ability-triggers";
import { shadowFlameCanMove } from "./shadow-flame";
import { morgulCannotLeave } from "./morgul-vale";
import { applyCombatDamageConsequences } from "./combat";

const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const attachment = (
  host: Unit | undefined,
  id: string | undefined,
  code: string,
) =>
  host?.attachments.find((a) => a.id === id && a.code === code && enabled(a));
const sources = (s: GameState, code: string) =>
  allCharacters(s).flatMap((host) =>
    host.attachments
      .filter((a) => a.code === code && enabled(a))
      .map((a) => ({ host, a })),
  );

/** Attaching includes moving an existing Signal between heroes. */
export function cobasReactiveAttachmentEntered(
  s: GameState,
  host: Unit,
  a: Attachment,
) {
  if (
    !isHero(host) ||
    !attachmentHasTrait(a, "Signal") ||
    !canGainResources(s, host) ||
    playerCardImmune(host)
  )
    return;
  prepend(
    s,
    ...sources(s, P.rune)
      .filter(({ a }) => !a.exhausted)
      .map(({ host: bearer, a }) =>
        fx("cobasRuneOffer", {
          source: a.id,
          target: host.id,
          ids: [bearer.id],
          player: attachmentController(s, bearer, a) ?? ownerOf(s, bearer),
        }),
      ),
  );
}

export function cobasReactiveDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  if (!allEngaged(s).some((u) => u.id === enemy.id)) return [];
  return [
    ...new Set(
      defenders.filter((u) => hasTrait(u, "Noble")).map((u) => ownerOf(s, u)),
    ),
  ].map((player) =>
    fx("cobasTerribleOffer", {
      target: enemy.id,
      ids: defenders
        .filter((u) => ownerOf(s, u) === player && hasTrait(u, "Noble"))
        .map((u) => u.id),
      player,
    }),
  );
}
const canReturn = (s: GameState, enemy: Unit) =>
  allEngaged(s).some((u) => u.id === enemy.id) &&
  !playerCardImmune(enemy) &&
  shadowFlameCanMove(s, enemy) &&
  !morgulCannotLeave(s, enemy);

const guardPrefix = (token: string) => `cobas-guard:${token}:`;
const guardUsed = (
  s: GameState,
  token: string,
  id: string,
  recipient: string,
) => {
  const key = guardPrefix(token) + `${id}:${recipient}`;
  return (
    s.used.includes(key) ||
    !!s.table?.seats.some((seat) => seat.used.includes(key))
  );
};
const guards = (s: GameState, target: Unit, context: DamageContext) =>
  sources(s, P.guard).filter(
    ({ host, a }) =>
      host.id !== target.id &&
      !playerCardImmune(host) &&
      !guardUsed(s, context.cobasGuardToken ?? "", a.id, target.id),
  );
function resumeDamage(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext,
) {
  const remaining = stats(s, target).health - target.damage,
    enemy = get(s, context.enemyId);
  if (damage(s, target.id, value, context) && enemy && context.combatDamage)
    applyCombatDamageConsequences(s, target, enemy, value, remaining);
}

/** A physical response is available once per recipient in one damage chain.
 * Returning to a previously handled recipient cannot start a circular redirect. */
export function cobasReactiveDamageAssigned(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext,
): boolean {
  if (
    context.cost ||
    value <= 0 ||
    !allCharacters(s).some((u) => u.id === target.id) ||
    !guards(s, target, context).length
  )
    return false;
  const token = context.cobasGuardToken ?? `g${s.nextId++}`;
  prepend(
    s,
    fx("cobasGuardOffer", {
      target: target.id,
      value,
      text: encodeDamageContext({ ...context, cobasGuardToken: token }),
    }),
    ...(!context.cobasGuardToken
      ? [fx("cobasGuardFinish", { text: token })]
      : []),
  );
  return true;
}

function windfolaCanCommit(s: GameState, u: Unit) {
  if (
    playerCardImmune(u) ||
    u.committed ||
    !["quest", "staging"].includes(s.phase)
  )
    return false;
  let legal = false;
  // The response commits directly and does not exhaust the character.
  forOwner(s, ownerOf(s, u), () => {
    legal = canCommit(s, u, true);
  });
  return legal;
}
export function cobasReactiveRemovedFromQuest(s: GameState, u: Unit) {
  if (!windfolaCanCommit(s, u)) return;
  prepend(
    s,
    ...u.attachments
      .filter((a) => a.code === P.windfola && enabled(a) && !a.exhausted)
      .map((a) =>
        fx("cobasWindfolaOffer", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}

export function handleCobasReactiveEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "cobasRuneOffer": {
      const host = get(s, e.ids?.[0]),
        a = attachment(host, e.source, P.rune);
      if (
        u &&
        isHero(u) &&
        a &&
        !a.exhausted &&
        !playerCardImmune(u) &&
        canGainResources(s, u)
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          `Rune-master · Add a resource to ${name(u)}?`,
          [
            {
              id: "use",
              label: "Exhaust Rune-master to add 1 resource",
              effects: [{ ...e, kind: "cobasRuneResolve" }],
            },
            skip,
          ],
        );
      return true;
    }
    case "cobasRuneResolve": {
      const host = get(s, e.ids?.[0]),
        a = attachment(host, e.source, P.rune);
      requireRule(
        u && a && !a.exhausted && canGainResources(s, u),
        "Rune-master needs a ready attachment and an eligible hero.",
      );
      a.exhausted = true;
      prepend(s, fx("resource", { target: u.id, value: 1 }));
      return true;
    }
    case "cobasTerribleOffer": {
      if (!u || s.combat?.enemyId !== u.id || !canReturn(s, u)) return true;
      const copies = s.hand.filter(
        (h) =>
          h.code === P.terrible &&
          canPay(s, { ...card(h.code), playOwner: h.owner ?? activeSeat(s) }),
      );
      const options: Option[] = copies.map((h) => ({
        id: h.id,
        code: h.code,
        label: "Play Terrible to Behold",
        ability: {
          player: activeSeat(s),
          source: h.id,
          code: h.code,
          type: "response",
        },
        effects: [
          fx("eventPlay", {
            source: h.id,
            code: h.code,
            player: activeSeat(s),
            effects: [
              fx("cobasTerribleResolve", {
                target: u.id,
                player: activeSeat(s),
              }),
            ],
          }),
        ],
      }));
      if (options.length)
        choose(
          s,
          "Terrible to Behold · Return the enemy and cancel its attack?",
          [...options, skip],
        );
      return true;
    }
    case "cobasTerribleResolve": {
      if (!u || s.combat?.enemyId !== u.id || !canReturn(s, u)) return true;
      const controller = ownerOf(s, u);
      forOwner(s, controller, () => {
        s.engaged = s.engaged.filter((enemy) => enemy.id !== u.id);
      });
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      // A facedown Orc Guard is discarded instead of returning to staging;
      // that replacement does not satisfy the preceding part of Then.
      if (u.facedownCard) {
        forOwner(s, u.owner ?? controller, () =>
          s.discard.push(u.facedownCard!),
        );
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      } else {
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      if (!s.staging.some((enemy) => enemy.id === u.id)) return true;
      const end = s.queue.findIndex((effect) => effect.kind === "enemyDone");
      if (end >= 0) {
        const boundary = s.queue.findIndex(
          (effect) => effect.kind === "playerAbilityFinish",
        );
        const start = boundary >= 0 && boundary < end ? boundary + 1 : 0;
        s.queue.splice(
          start,
          end - start + 1,
          fx("enemyDone", {
            flag: true,
            player: s.combat.attackPlayer ?? activeSeat(s),
          }),
        );
      }
      return true;
    }
    case "cobasGuardOffer": {
      if (!u) return true;
      const context = readDamageContext(e),
        candidates = guards(s, u, context);
      if (!candidates.length) {
        resumeDamage(s, u, e.value ?? 0, context);
        return true;
      }
      const options: Option[] = candidates.map(({ host, a }) => ({
        id: a.id,
        code: a.code,
        label: `Place 1 damage on ${name(host)} instead`,
        ability: {
          player: attachmentController(s, host, a) ?? ownerOf(s, host),
          source: a.id,
          code: a.code,
          type: "response",
        },
        effects: [
          {
            ...e,
            kind: "cobasGuardResolve",
            source: a.id,
            ids: [host.id],
            player: attachmentController(s, host, a) ?? ownerOf(s, host),
          },
        ],
      }));
      choose(
        s,
        `Vigilant Guard · Redirect 1 of ${e.value} damage from ${name(u)}?`,
        [
          ...options,
          {
            id: "skip",
            label: "Assign the damage normally",
            effects: [
              {
                ...e,
                kind: "cobasGuardDecline",
                ids: candidates.map(({ a }) => a.id),
              },
            ],
          },
        ],
      );
      return true;
    }
    case "cobasGuardDecline": {
      const context = readDamageContext(e);
      for (const id of e.ids ?? [])
        s.used.push(
          guardPrefix(context.cobasGuardToken!) + `${id}:${u?.id ?? e.target}`,
        );
      if (u) resumeDamage(s, u, e.value ?? 0, context);
      return true;
    }
    case "cobasGuardResolve": {
      const context = readDamageContext(e),
        host = get(s, e.ids?.[0]),
        a = attachment(host, e.source, P.guard);
      requireRule(
        u && host && a && !guardUsed(s, context.cobasGuardToken!, a.id, u.id),
        "This physical Vigilant Guard may respond once to this character’s damage assignment.",
      );
      s.used.push(guardPrefix(context.cobasGuardToken!) + `${a.id}:${u.id}`);
      prepend(
        s,
        // The reassigned point is damage from this attachment's effect, not
        // combat damage (Caleb Grace ruling, 14 December 2018).
        fx("cobasGuardDamage", {
          target: host.id,
          value: 1,
          text: encodeDamageContext({
            cobasGuardToken: context.cobasGuardToken,
            drownedThenToken: context.drownedThenToken,
          }),
          player: ownerOf(s, host),
        }),
        ...((e.value ?? 0) > 1
          ? [
              fx("cobasGuardDamage", {
                target: u.id,
                value: e.value! - 1,
                text: encodeDamageContext(context),
                player: ownerOf(s, u),
              }),
            ]
          : []),
      );
      return true;
    }
    case "cobasGuardDamage":
      if (u) resumeDamage(s, u, e.value ?? 0, readDamageContext(e));
      return true;
    case "cobasGuardFinish":
      s.used = s.used.filter((key) => !key.startsWith(guardPrefix(e.text!)));
      for (const seat of s.table?.seats ?? [])
        seat.used = seat.used.filter(
          (key) => !key.startsWith(guardPrefix(e.text!)),
        );
      return true;
    case "cobasWindfolaOffer": {
      const a = attachment(u, e.source, P.windfola);
      if (u && a && !a.exhausted && windfolaCanCommit(s, u))
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          `Windfola · Recommit ${name(u)}?`,
          [
            {
              id: "use",
              label: "Exhaust Windfola to commit its character",
              effects: [{ ...e, kind: "cobasWindfolaResolve" }],
            },
            skip,
          ],
        );
      return true;
    }
    case "cobasWindfolaResolve": {
      const a = attachment(u, e.source, P.windfola);
      requireRule(
        u && a && !a.exhausted && windfolaCanCommit(s, u),
        "Windfola requires a surviving character that can be committed.",
      );
      a.exhausted = true;
      u.committed = true;
      forOwner(s, ownerOf(s, u), () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      charactersCommitted(s, [u]);
      return true;
    }
    default:
      return false;
  }
}
