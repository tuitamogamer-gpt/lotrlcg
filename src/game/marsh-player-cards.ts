import { choosePlayerResponse } from "./player-ability-triggers";
import { reduceThreat } from "./threat-reduction";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
// Exact player actions, responses and delayed effects from The Dead Marshes.
import { engagedEnemies } from "./considered-engagement";
import { card, name } from "./cards";
import type { Effect, GameState, Option, Unit } from "./types";
import {
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  skip,
  stats,
} from "./core";
import {
  check,
  damage,
  discardCharacter,
  raiseThreat,
  readyCharacter as ready,
} from "./board";
import { applyCombatDamageConsequences } from "./combat";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import {
  allActiveLocations,
  allCharacters,
  allHeroes,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";

export function marshPlayerEventEffect(s: GameState, code: string): boolean {
  if (code !== "02101") return false;
  s.used.push(
    ...allCharacters(s)
      .filter((u) => hasTrait(u, "Rohan"))
      .map((u) => `phase:we-do-not-sleep:${u.id}`),
  );
  log(
    s,
    "We Do Not Sleep: Rohan characters do not exhaust to commit this phase.",
    "good",
  );
  return true;
}
export const marshPlayerNoQuestExhaust = (s: GameState, u: Unit) =>
  playerOrder(s).some((player) =>
    seatView(s, player).used.includes(`phase:we-do-not-sleep:${u.id}`),
  );
export const marshPlayerAbilityLabel = (code: string) =>
  code === "02095" ? "Boromir · Ready or discard to damage enemies" : undefined;
export function marshPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (a?.code === "02103" && (a.blanked || a.exhausted || !u.exhausted))
      return "Fast Hitch must be ready and its attached character exhausted.";
    if (
      a?.code === "02099" &&
      (a.blanked || a.exhausted || !allHeroes(s).some((h) => h.id !== u.id))
    )
      return "Song of Mocking must be ready and needs another hero.";
    return undefined;
  }
  if (u.code === "02095" && u.blanked)
    return "Boromir has no printed ability while blanked.";
  if (
    u.code === "02095" &&
    !(u.exhausted && !s.used.includes(`phase:boromir:${u.id}`)) &&
    !playerOrder(s).some((player) => engagedEnemies(s, player).length)
  )
    return "Boromir needs to be exhausted with his readying limit available, or an engaged enemy to damage.";
  return undefined;
}
export function useMarshPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (!a || !["02099", "02103"].includes(a.code)) return false;
    requireRule(
      !marshPlayerAbilityProblem(s, u, attachmentId),
      marshPlayerAbilityProblem(s, u, attachmentId) ?? "",
    );
    if (a.code === "02103") {
      a.exhausted = true;
      ready(s, u);
      return true;
    }
    choose(
      s,
      "Song of Mocking · Protect another hero",
      opts(
        allHeroes(s).filter((h) => h.id !== u.id),
        (h) => [
          fx("marshMockingSet", { source: u.id, target: h.id, text: a.id }),
        ],
      ),
      "Until this phase ends, the attached hero takes damage assigned to the chosen hero.",
    );
    return true;
  }
  if (u.code !== "02095") return false;
  requireRule(
    !marshPlayerAbilityProblem(s, u),
    marshPlayerAbilityProblem(s, u) ?? "",
  );
  const options: Option[] = [];
  if (u.exhausted && !s.used.includes(`phase:boromir:${u.id}`))
    options.push({
      id: "ready",
      label: "Raise your threat by 1 to ready Boromir",
      code: u.code,
      effects: [fx("marshBoromirReady", { target: u.id })],
    });
  for (const player of playerOrder(s).filter(
    (player) => engagedEnemies(s, player).length,
  ))
    options.push({
      id: `discard-${player}`,
      label: `Discard Boromir · deal 2 to every enemy engaged with ${seatName(s, player)}`,
      code: u.code,
      effects: [fx("marshBoromirDiscard", { target: u.id, value: player })],
    });
  choose(s, "Boromir · Action", options);
  return true;
}

export function marshPlayerAttackResolved(
  s: GameState,
  ids: string[],
): Effect[] {
  return ids
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && u.code === "02098")
    .map((u) =>
      fx("marshVassalDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function marshPlayerShadowOptions(s: GameState, code: string): Option[] {
  if (
    !card(code).shadow ||
    allActiveLocations(s).some((u) => u.code === "02016")
  )
    return [];
  return playerOrder(s)
    .flatMap((player) => [
      ...seatView(s, player).heroes,
      ...seatView(s, player).allies,
    ])
    .filter((u) => u.code === "02096")
    .map((u) => ({
      id: `watcher-${u.id}`,
      ability: {
        player: ownerOf(s, u),
        source: u.id,
        code: u.code,
        type: "response" as const,
      },
      label: `Discard Dúnedain Watcher · ${seatName(s, ownerOf(s, u))}`,
      code: u.code,
      effects: [
        fx("marshWatcherCancel", { target: u.id, player: ownerOf(s, u) }),
      ],
    }));
}
export function marshPlayerThreatRaised(
  s: GameState,
  player: number,
  amount: number,
  reason: string,
) {
  if (
    amount <= 0 ||
    !["quest-failure", "encounter", "quest-card"].includes(reason)
  )
    return;
  prepend(
    s,
    ...seatView(s, player)
      .allies.filter((u) => u.code === "02100" && !u.exhausted)
      .map((u) => fx("marshElfhelmResponse", { target: u.id, player })),
  );
}
export function marshPlayerCharacterReadied(s: GameState, u: Unit) {
  if (
    s.phase !== "refresh" ||
    !hasTrait(u, "Silvan") ||
    !rhosgobelHealingAllowed(s, u)
  )
    return;
  prepend(
    s,
    ...playerOrder(s)
      .flatMap((player) => [
        ...seatView(s, player).heroes,
        ...seatView(s, player).allies,
      ])
      .filter((tracker) => tracker.code === "02102")
      .map((tracker) =>
        fx("marshSilvanResponse", {
          source: tracker.id,
          target: u.id,
          player: ownerOf(s, tracker),
        }),
      ),
  );
}

/** A lasting replacement is resolved once per original assignment; the newest takes precedence. */
export function offerMarshDamageRedirect(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext = {},
): boolean {
  if (
    value <= 0 ||
    card(target.code).type_code !== "hero" ||
    context.mockingVisited?.includes(target.id)
  )
    return false;
  const records = playerOrder(s)
    .flatMap((player) => seatView(s, player).used)
    .flatMap((key) => {
      const match = /^phase:mocking:(\d+):([^:]+):([^:]+)$/.exec(key);
      if (!match || match[2] !== target.id) return [];
      const recipient = allHeroes(s).find((u) => u.id === match[3]);
      return recipient ? [{ sequence: Number(match[1]), recipient }] : [];
    })
    .sort((a, b) => b.sequence - a.sequence);
  if (!records.length) return false;
  prepend(
    s,
    fx("marshMockingDamage", {
      target: records[0].recipient.id,
      value,
      text: encodeDamageContext({
        ...context,
        mockingVisited: [...(context.mockingVisited ?? []), target.id],
      }),
      player: ownerOf(s, records[0].recipient),
    }),
  );
  return true;
}

export function handleMarshPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "marshBoromirReady": {
      const boromir = s.heroes.find(
        (u) => u.id === e.target && u.code === "02095",
      );
      requireRule(
        boromir &&
          !boromir.blanked &&
          boromir.exhausted &&
          !isSacked(boromir) &&
          !s.used.includes(`phase:boromir:${boromir.id}`),
        "Boromir may ready once per phase while exhausted.",
      );
      s.used.push(`phase:boromir:${boromir.id}`);
      raiseThreat(s, 1, "cost");
      ready(s, boromir);
      return true;
    }
    case "marshBoromirDiscard": {
      const boromir = s.heroes.find(
          (u) => u.id === e.target && u.code === "02095",
        ),
        player = e.value ?? 0;
      requireRule(
        boromir &&
          !boromir.blanked &&
          !isSacked(boromir) &&
          engagedEnemies(s, player).length,
        "Boromir requires enemies engaged with one player.",
      );
      const enemies = engagedEnemies(s, player);
      discardCharacter(s, boromir);
      if (s.status !== "playing") return true;
      for (const enemy of enemies) if (get(s, enemy.id)) damage(s, enemy.id, 2);
      log(
        s,
        "Boromir is discarded to deal 2 damage to every enemy engaged with the chosen player.",
        "good",
      );
      return true;
    }
    case "marshVassalDiscard": {
      const vassal = get(s, e.target);
      if (vassal?.code === "02098") discardCharacter(s, vassal);
      return true;
    }
    case "marshWatcherCancel": {
      const watcher = get(s, e.target);
      requireRule(
        watcher?.code === "02096" &&
          !allActiveLocations(s).some((u) => u.code === "02016"),
        "This shadow cannot be canceled.",
      );
      discardCharacter(s, watcher);
      log(
        s,
        "Dúnedain Watcher is discarded to cancel the triggered shadow.",
        "good",
      );
      return true;
    }
    case "marshElfhelmResponse": {
      const elfhelm = s.allies.find(
        (u) => u.id === e.target && u.code === "02100" && !u.exhausted,
      );
      if (elfhelm && s.threat > 0)
        choosePlayerResponse(
          s,
          elfhelm.id,
          elfhelm.code,
          "Elfhelm · Threat response",
          [
            {
              id: "reduce",
              label: "Reduce your threat by 1",
              code: elfhelm.code,
              effects: [fx("marshElfhelmReduce", { target: elfhelm.id })],
            },
            skip,
          ],
        );
      return true;
    }
    case "marshElfhelmReduce":
      requireRule(
        s.allies.some(
          (u) => u.id === e.target && u.code === "02100" && !u.exhausted,
        ),
        "Elfhelm must remain ready.",
      );
      reduceThreat(s, 1, { id: e.target, code: "02100" });
      return true;
    case "marshSilvanResponse": {
      const tracker = get(s, e.source),
        target = get(s, e.target);
      if (
        tracker?.code === "02102" &&
        target &&
        hasTrait(target, "Silvan") &&
        rhosgobelHealingAllowed(s, target)
      )
        choosePlayerResponse(
          s,
          tracker.id,
          tracker.code,
          "Silvan Tracker · Refresh healing",
          [
            {
              id: "heal",
              label: `Heal 1 damage from ${name(target)}`,
              code: target.code,
              effects: [
                fx("marshSilvanHeal", {
                  source: tracker.id,
                  target: target.id,
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "marshSilvanHeal": {
      const tracker = get(s, e.source),
        target = get(s, e.target);
      requireRule(
        tracker?.code === "02102" &&
          target &&
          hasTrait(target, "Silvan") &&
          rhosgobelHealingAllowed(s, target),
        "A Silvan character must have damage to heal.",
      );
      rhosgobelHeal(s, target, 1, {
        source: tracker.id,
        code: tracker.code,
        player: ownerOf(s, tracker),
      });
      return true;
    }
    case "marshMockingSet": {
      const host = get(s, e.source),
        target = allHeroes(s).find((u) => u.id === e.target);
      const attachment = host?.attachments.find(
        (a) =>
          a.id === e.text && a.code === "02099" && !a.blanked && !a.exhausted,
      );
      requireRule(
        host && target && host.id !== target.id && attachment,
        "Song of Mocking requires another hero and a ready attachment.",
      );
      attachment.exhausted = true;
      s.used.push(`phase:mocking:${s.nextId++}:${target.id}:${host.id}`);
      log(
        s,
        `Song of Mocking: ${name(host)} takes this phase's damage assigned to ${name(target)}.`,
      );
      return true;
    }
    case "marshMockingDamage": {
      const context = readDamageContext(e);
      const target = get(s, e.target),
        enemy = get(s, context.enemyId),
        amount = e.value ?? 0;
      if (!target) return true;
      const remainingHealth = stats(s, target).health - target.damage;
      log(s, `Song of Mocking redirects ${amount} damage to ${name(target)}.`);
      if (damage(s, target.id, amount, context) && enemy)
        applyCombatDamageConsequences(
          s,
          target,
          enemy,
          amount,
          remainingHealth,
        );
      check(s);
      return true;
    }
    default:
      return false;
  }
}
