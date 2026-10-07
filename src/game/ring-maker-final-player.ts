import { cannotReady } from "./core";
// The Nîn-in-Eilph, Celebrimbor's Secret and The Antlered Crown.
import { card, name, plain } from "./cards";
import type { Effect, GameState, Option, Unit } from "./types";
import {
  canGainResources,
  canPay,
  choose,
  draw,
  followFirstPlayer,
  fx,
  get,
  opts,
  prepend,
  random,
  removeShadowCard,
  requireRule,
  shuffle,
  skip,
  spendResources,
  takePlayerDeck,
  units,
} from "./core";
import { damage, discardHandCard, readyCharacter, returnAlly } from "./board";
import {
  activeSeat,
  allCharacters,
  eachSeat,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { engagedEnemies } from "./considered-engagement";
import { khazadDamageCancelled } from "./khazad-dum";

import { morgulCannotLeave } from "./morgul-vale";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";

const BELTS = "round:tighten-belts";
const RIDE = "phase:ride-them-down:";
const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const readyTargets = (s: GameState) =>
  allCharacters(s).filter(
    (u) => hasTrait(u, "Ent") && u.exhausted && !immune(u) && !cannotReady(u),
  );
const beltsTargets = (s: GameState) =>
  s.heroes.filter(
    (h) =>
      h.resourcesSpentRound !== s.round && canGainResources(s, h) && !immune(h),
  );

export function finalRingPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "08090")
    return s.allies.filter(
      (u) => hasTrait(u, "Silvan") && !immune(u) && !morgulCannotLeave(s, u),
    );
  if (code === "08142")
    return s.staging.filter(
      (u) =>
        card(u.code).type_code === "enemy" &&
        !card(u.code).is_unique &&
        !immune(u),
    );
  return null;
}
export function finalRingPlayProblem(s: GameState, code: string) {
  if (code === "08086") {
    if (s.used.includes(BELTS))
      return "Only one Tighten Our Belts may be played by the players each round.";
    if (!playerOrder(s).some((p) => beltsTargets(seatView(s, p)).length))
      return "No hero can gain a resource without having spent resources this round.";
  }
  if (
    code === "08145" &&
    !allCharacters(s).some((u) => !immune(u) && rhosgobelHealingAllowed(s, u))
  )
    return "No damaged character can be healed.";
  return null;
}
export function finalRingEventPlayed(s: GameState, code: string) {
  if (code === "08086") eachSeat(s, () => s.used.push(BELTS));
}
/** The returned ally is an ability cost, paid even if the event is canceled. */
export function finalRingEventCost(
  s: GameState,
  code: string,
  target?: string,
) {
  if (code !== "08090") return undefined;
  const ally = finalRingPlayTargets(s, code)?.find((u) => u.id === target);
  requireRule(ally, "Return a Silvan ally you control.");
  const cost = Number(card(ally.code).cost) || 0;
  returnAlly(s, ally);
  return cost;
}
export function finalRingEvent(
  s: GameState,
  code: string,
  target?: string,
  amount = 0,
) {
  switch (code) {
    case "08085":
      if (s.table) {
        s.table.first = activeSeat(s);
        followFirstPlayer(s);
      }
      draw(s, 1);
      return true;
    case "08086":
      choose(
        s,
        "Tighten Our Belts · Choose a player",
        playerOrder(s).map((player) => ({
          id: `player-${player}`,
          label: `Player ${player + 1}`,
          effects: [fx("finalRingBelts", { player })],
        })),
      );
      return true;
    case "08090":
      s.threat = Math.max(0, s.threat - amount);
      return true;
    case "08116":
      for (const u of allCharacters(s))
        if (
          !immune(u) &&
          hasTrait(u, "Rohan") &&
          u.attachments.some(
            (a) =>
              !a.blanked &&
              !a.facedown &&
              ((card(a.code).traits ?? "")
                .split(".")
                .some((t) => t.trim() === "Mount") ||
                a.dynamicTraits?.includes("Mount")),
          )
        )
          u.tempAttack = (u.tempAttack ?? 0) + 3;
      return true;
    case "08142":
      if (finalRingPlayTargets(s, code)?.some((u) => u.id === target))
        eachSeat(s, () => {
          s.used = s.used.filter((k) => !k.startsWith(RIDE));
          s.used.push(`${RIDE}${target}`);
        });
      return true;
    case "08143":
      // Shadows are separate cards: an enemy's immunity does not protect them.
      for (const u of units(s).filter(
        (u) => card(u.code).type_code === "enemy",
      ))
        while (u.shadows.length)
          s.encounterDiscard.push(removeShadowCard(u, 0)!);
      return true;
    case "08145":
      for (const u of allCharacters(s))
        if (!immune(u) && rhosgobelHealingAllowed(s, u))
          rhosgobelHeal(s, u, u.damage, { code, player: activeSeat(s) });
      return true;
    default:
      return false;
  }
}
export const finalRingReplacesQuestProgress = (s: GameState) =>
  s.used.some((k) => k.startsWith(RIDE));
export function finalRingQuestProgress(s: GameState, amount: number) {
  const effect = s.used.find((k) => k.startsWith(RIDE));
  if (!effect) return false;
  const enemy = get(s, effect.slice(RIDE.length));
  // The replacement lasts for the phase, even if its chosen enemy has left play.
  if (enemy && !immune(enemy)) damage(s, enemy.id, amount);
  return true;
}

export function finalRingAllyEntering(u: Unit) {
  if (!u.blanked && ["08119", "08141", "08146"].includes(u.code))
    u.exhausted = true;
}
export function finalRingAllyEntered(s: GameState, u: Unit) {
  if (u.code === "08089" && !u.blanked && s.encounterDeck.length)
    prepend(
      s,
      fx("finalRingTravelerOffer", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function finalRingAttackBonus(
  s: GameState,
  attacker: Unit,
  enemy: Unit,
) {
  return engagedEnemies(s, ownerOf(s, attacker)).some((u) => u.id === enemy.id)
    ? 0
    : attacker.attachments.filter(
        (a) => a.code === "08088" && !a.blanked && !a.facedown,
      ).length;
}
/** A continuous control effect follows the token; physical ownership never changes. */
export function finalRingFollowFirst(s: GameState) {
  if (!s.table) return;
  for (const ally of globalCharacters(s).filter(
    (u) => card(u.code).type_code === "ally",
  )) {
    const enabled = ally.attachments.some(
      (a) => a.code === "08093" && !a.blanked && !a.facedown,
    );
    if (!enabled) continue;
    const from = ownerOf(s, ally);
    // No duration is specified: a control change persists if the attachment leaves.
    const to = firstPlayer(seatView(s, from));
    if (from === to || s.table.seats[to]?.eliminated) continue;
    forOwner(s, from, () => {
      s.allies = s.allies.filter((u) => u.id !== ally.id);
      s.committedIds = s.committedIds.filter((id) => id !== ally.id);
    });
    forOwner(s, to, () => {
      s.allies.push(ally);
      if (ally.committed && !s.committedIds.includes(ally.id))
        s.committedIds.push(ally.id);
    });
  }
}
export const finalRingUndefendedTargets = (s: GameState) =>
  s.allies.filter(
    (u) =>
      !immune(u) &&
      u.attachments.some(
        (a) => a.code === "08093" && !a.blanked && !a.facedown,
      ),
  );

export const finalRingAbilityLabel = (code: string) =>
  code === "08146"
    ? "Pay 2 resources · Ready an Ent"
    : code === "08118"
      ? "Search with the Mirror"
      : null;
export function finalRingAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (
    ownerOf(s, u) !== activeSeat(s) ||
    (attachmentId ? !a || a.blanked || a.facedown : u.blanked)
  )
    return "This ability must be on an active card you control.";
  if (a?.code === "08118")
    return a.exhausted || !s.deck.length
      ? "The Mirror must be ready and your deck must contain a card."
      : null;
  if (u.code === "08146")
    return u.resources < 2 || !readyTargets(s).length
      ? "Treebeard needs 2 resources and an exhausted Ent that can ready."
      : null;
  return "This card has no available action.";
}
export function useFinalRingAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (attachmentId ? a?.code !== "08118" : u.code !== "08146") return false;
  requireRule(
    !finalRingAbilityProblem(s, u, attachmentId),
    finalRingAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (a) {
    a.exhausted = true;
    choose(s, "Mirror of Galadriel · Search the top 10 cards", [
      ...s.deck.slice(0, 10).map((code, count) => ({
        id: `card-${count}`,
        code,
        label: card(code).name,
        effects: [fx("finalRingMirrorTake", { code, count })],
      })),
      {
        id: "skip",
        label: "Finish search without taking a card",
        effects: [fx("finalRingMirrorTake")],
      },
    ]);
  } else {
    spendResources(s, u, 2);
    choose(
      s,
      "Treebeard · Ready an Ent",
      opts(readyTargets(s), (target) => [fx("ready", { target: target.id })]),
    );
  }
  return true;
}

export function finalRingShadowOptions(s: GameState, code: string): Option[] {
  if (!card(code).shadow) return [];
  const defenders =
    s.combat?.defenderIds ??
    (s.combat?.defenderId ? [s.combat.defenderId] : []);
  return defenders.flatMap((id) => {
    const h = get(s, id);
    return h?.code === "08137" &&
      !h.blanked &&
      !h.shadowCancelsDamage &&
      !khazadDamageCancelled(s, h, 1)
      ? [
          {
            id: `erkenbrand-${h.id}`,
            code: h.code,
            label: "Erkenbrand · Take 1 damage to cancel the shadow",
            effects: [
              fx("finalRingErkenbrand", {
                target: h.id,
                code,
                player: ownerOf(s, h),
              }),
            ],
          },
        ]
      : [];
  });
}
export function finalRingDamageTaken(s: GameState, u: Unit) {
  for (const combat of [s.combat, ...s.suspendedCombats]) {
    const ids =
      combat?.defenderIds ?? (combat?.defenderId ? [combat.defenderId] : []);
    if (
      combat &&
      ids.includes(u.id) &&
      !combat.damagedDefenders?.includes(u.id)
    )
      (combat.damagedDefenders ??= []).push(u.id);
  }
}
export function finalRingDefenseFinished(s: GameState) {
  const combat = s.combat;
  for (const id of combat?.defenderIds ??
    (combat?.defenderId ? [combat.defenderId] : [])) {
    const h = get(s, id);
    if (!h || combat?.damagedDefenders?.includes(id)) continue;
    for (const a of h.attachments.filter(
      (a) => a.code === "08139" && !a.blanked && !a.facedown && !a.exhausted,
    ))
      prepend(
        s,
        fx("finalRingRisingOffer", {
          target: id,
          source: a.id,
          player: ownerOf(s, h),
        }),
      );
  }
}

export function finalRingHastyWindow(s: GameState): Effect[] {
  return allCharacters(s).some((u) => u.committed && !immune(u)) &&
    playerOrder(s).some((p) => {
      const view = seatView(s, p);
      return (
        view.hand.some((u) => u.code === "08144") && canPay(view, card("08144"))
      );
    })
    ? [fx("finalRingHastyWindow", { player: activeSeat(s) })]
    : [];
}
export function finalRingEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "finalRingBelts":
      prepend(
        s,
        ...beltsTargets(s).map((h) =>
          fx("resource", { target: h.id, value: 1 }),
        ),
      );
      return true;
    case "finalRingPioneerOffer":
    case "finalRingGuardOffer": {
      const pioneer = e.kind === "finalRingPioneerOffer";
      const targets = (pioneer ? s.staging : allCharacters(s)).filter(
        (u) => !immune(u),
      );
      if (targets.length)
        choose(
          s,
          pioneer
            ? "Mirkwood Pioneer · Ignore staging threat"
            : "Henneth Annûn Guard · Grant defense and sentinel",
          [
            ...opts(targets, (u) => [
              fx(pioneer ? "finalRingPioneer" : "finalRingGuard", {
                target: u.id,
              }),
            ]),
            skip,
          ],
        );
      return true;
    }
    case "finalRingPioneer": {
      const u = get(s, e.target);
      if (u) u.ignoreThreatRound = s.round;
      return true;
    }
    case "finalRingGuard": {
      const u = get(s, e.target);
      if (u) {
        u.roundDefense = (u.roundDefense ?? 0) + 2;
        (u.roundKeywords ??= []).push("Sentinel");
      }
      return true;
    }
    case "finalRingTravelerOffer":
      if (get(s, e.target) && s.encounterDeck.length)
        choose(s, "Celduin Traveler · Look ahead", [
          {
            id: "look",
            label: "Look at the top encounter card",
            effects: [fx("finalRingTravelerLook")],
          },
          skip,
        ]);
      return true;
    case "finalRingTravelerLook": {
      const code = s.encounterDeck[0];
      if (code)
        choose(s, "Celduin Traveler · Top encounter card", [
          ...(card(code).type_code === "location"
            ? [
                {
                  id: "discard",
                  code,
                  label: `Discard ${card(code).name}`,
                  effects: [fx("finalRingTravelerDiscard", { code })],
                },
              ]
            : []),
          {
            id: "keep",
            code,
            label: `Keep ${card(code).name} on top`,
            effects: [],
          },
        ]);
      return true;
    }
    case "finalRingTravelerDiscard":
      if (s.encounterDeck[0] === e.code)
        s.encounterDiscard.push(s.encounterDeck.shift()!);
      return true;
    case "finalRingMirrorTake": {
      const taken =
        e.count !== undefined && e.count < 10 && s.deck[e.count] === e.code;
      if (taken) s.hand.push(takePlayerDeck(s, e.count));
      s.deck = shuffle(s, s.deck);
      if (taken && s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      return true;
    }
    case "finalRingErkenbrand": {
      const h = get(s, e.target);
      requireRule(
        h &&
          finalRingShadowOptions(s, e.code!).some(
            (o) => o.id === `erkenbrand-${h.id}`,
          ),
        "Erkenbrand must be defending and able to pay the damage cost.",
      );
      damage(s, h.id, 1, { cost: true });
      return true;
    }
    case "finalRingRisingOffer": {
      const h = get(s, e.target),
        a = h?.attachments.find((a) => a.id === e.source);
      if (h && a && !a.blanked && !a.exhausted && canGainResources(s, h))
        choose(s, "The Day's Rising · No damage while defending", [
          {
            id: "resource",
            label: `Exhaust The Day's Rising · Give ${name(h)} 1 resource`,
            effects: [{ ...e, kind: "finalRingRising" }],
          },
          skip,
        ]);
      return true;
    }
    case "finalRingRising": {
      const h = get(s, e.target),
        a = h?.attachments.find((a) => a.id === e.source);
      if (h && a && !a.exhausted && !a.blanked && canGainResources(s, h)) {
        a.exhausted = true;
        prepend(s, fx("resource", { target: h.id, value: 1 }));
      }
      return true;
    }
    case "finalRingHastyWindow": {
      if (!finalRingHastyWindow(s).length) return true;
      const options: Option[] = [];
      for (const player of playerOrder(s)) {
        const p = seatView(s, player);
        if (
          !p.hand.some((u) => u.code === "08144") ||
          !canPay(p, card("08144"))
        )
          continue;
        for (const u of allCharacters(s).filter(
          (u) => u.committed && !immune(u),
        ))
          options.push({
            id: `hasty-${player}-${u.id}`,
            code: "08144",
            label: `Player ${player + 1} · Ready and withdraw ${name(u)}`,
            effects: [
              fx("eventPlay", {
                code: "08144",
                player,
                effects: [fx("finalRingHastyReady", { target: u.id, player })],
              }),
              e,
            ],
          });
      }
      choose(s, "Don't Be Hasty! · Before encounter keywords", [
        ...options,
        skip,
      ]);
      return true;
    }
    case "finalRingHastyReady": {
      const u = get(s, e.target);
      if (u && u.committed && !immune(u)) {
        readyCharacter(s, u);
        u.committed = false;
        forOwner(s, ownerOf(s, u), () => {
          s.committedIds = s.committedIds.filter((id) => id !== u.id);
        });
      }
      return true;
    }
    default:
      return false;
  }
}
