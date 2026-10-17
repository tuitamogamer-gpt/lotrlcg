import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  shuffle,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  allyCanEnter,
  discardCharacter,
  discardLocation,
  enemyAddedToStaging,
  engage,
  enterAlly,
  readyCharacter,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { selectedSideQuest } from "./side-quest-support";
import { isAlly, isHero } from "./card-types";
import {
  FIRE_NIGHT as F,
  FIRE_NIGHT_ENCOUNTERS,
  FIRE_NIGHT_RECIPES,
  fireNightSideCount,
  fireNightStageInfo,
} from "./fire-night-support";
export * from "./fire-night-support";

type FireCombat = NonNullable<GameState["combat"]> & {
  fireNightExcess?: boolean;
  fireNightKillHill?: boolean;
  fireNightDiscardAlly?: boolean;
  fireNightKilled?: boolean;
};
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const liveSide = (s: GameState, code: string) =>
  !!s.fireNight && s.staging.some((u) => u.code === code && !u.blanked);
const dagnir = (s: GameState) => s.staging.find((u) => u.code === F.dagnir);
const goblin = (u: Unit) =>
  (card(u.code).traits ?? "").split(".").some((t) => t.trim() === "Goblin");
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const optional = (s: GameState, title: string, effects: Effect[]) =>
  choose(s, title, [
    { id: "response", label: "Use the response", effects },
    { id: "skip", label: "Continue", effects: [] },
  ]);

export function setupFireNight(s: GameState) {
  const r = FIRE_NIGHT_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    r.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.staging.push(...pile("sharedStagingArea").map((c) => make(s, c)));
  s.fireNight = {
    initialized: false,
    currentQuest: F.hill,
    hillDamage: 0,
    sideDeck: shuffle(
      s,
      pile("sharedEncounterDeck2").map((c) => make(s, c)),
    ),
    resolving: [],
    nonQuestDamage: { round: 0, amount: 0 },
    locationProgress: [],
  };
}
export function fireNightOpeningHandsKept(s: GameState) {
  if (!s.fireNight || s.fireNight.initialized) return false;
  prepend(
    s,
    ...playerOrder(s)
      .slice(1)
      .map((player) => fx("reveal", { player })),
    fx("fireNightSetupDone"),
    fx("nextRound"),
  );
  return true;
}
export function fireNightCheck(s: GameState) {
  if (!s.fireNight || s.status !== "playing") return;
  if (s.fireNight.hillDamage >= 50) {
    s.status = "lost";
    s.reason =
      "Hrogar’s Hill has suffered 50 damage. The town falls to Dagnir.";
    s.queue = [];
    s.choice = null;
    if (s.flow) s.flow.pending = null;
    log(s, s.reason, "danger");
  } else if ((dagnir(s)?.damage ?? 0) >= 20) {
    win(s);
    s.reason = "Dagnir retreats into the night. Hrogar’s Hill is saved.";
  }
}
export function fireNightHillDamage(s: GameState, amount: number) {
  if (!s.fireNight || s.status !== "playing" || amount <= 0) return;
  s.fireNight.hillDamage += amount;
  log(
    s,
    `Hrogar’s Hill takes ${amount} damage (${s.fireNight.hillDamage}/50).`,
    "danger",
  );
  fireNightCheck(s);
}
export function fireNightPlanningEnd(s: GameState) {
  if (s.fireNight)
    prepend(
      s,
      fx("fireNightRevealSide"),
      fx("fireNightHillAttack", { player: firstPlayer(s) }),
    );
}
export function fireNightStats(s: GameState, u: Unit) {
  let attack = 0,
    defense = 0;
  if (!s.fireNight) return { attack, defense };
  if (
    u.code === F.dagnir &&
    !u.blanked &&
    s.activeLocation?.code === F.palisade &&
    !s.activeLocation.blanked
  )
    attack -= 2;
  if (goblin(u) && allEngaged(s).some((e) => e.id === u.id)) {
    const n = allEngaged(s).filter(
      (e) =>
        e.id !== u.id &&
        e.code === F.troop &&
        !e.blanked &&
        ownerOf(s, e) === ownerOf(s, u),
    ).length;
    attack += n;
    defense += n;
  }
  return { attack, defense };
}
export const fireNightThreatBonus = (s: GameState, u: Unit) =>
  s.fireNight && !u.blanked && [F.dagnir, F.tower].includes(u.code)
    ? fireNightSideCount(s) + 1
    : 0;
export const fireNightSideQuestGoalBonus = (s: GameState, u: Unit) =>
  s.fireNight && u.code === F.rout && !u.blanked
    ? enemies(s).filter(goblin).length * 5
    : 0;
export const fireNightDefenseOverride = (
  s: GameState,
  _u: Unit,
  enemy: Unit,
) => (enemy.code === F.dagnir && liveSide(s, F.fortify) ? 0 : undefined);
export const fireNightShadowImmune = (s: GameState, enemy: Unit) =>
  enemy.code === F.dagnir && liveSide(s, F.drawFire);
export function fireNightCannotCancel(s: GameState, shadow = false) {
  return (
    !!s.fireNight &&
    (shadow
      ? !!get(s, s.combat?.enemyId) &&
        fireNightShadowImmune(s, get(s, s.combat?.enemyId)!)
      : s.staging.some((u) => u.code === F.accursed && !u.blanked))
  );
}
export const fireNightImmune = (s: GameState, u: Unit) =>
  !!s.fireNight && u.code === F.dagnir && !u.blanked;
export const fireNightCannotLeave = (s: GameState, u: Unit) =>
  !!s.fireNight && u.code === F.dagnir && !u.blanked;
export const fireNightConsideredEngaged = (s: GameState, u: Unit, _p: number) =>
  !!s.fireNight &&
  u.code === F.dagnir &&
  !u.blanked &&
  fireNightSideCount(s) >= 3;
export const fireNightCannotOptionallyEngage = (s: GameState, u: Unit) =>
  !!s.fireNight && !u.blanked && [F.dagnir, F.stray].includes(u.code);
export const fireNightCannotAttach = (s: GameState, u: Unit, code: string) =>
  !!s.fireNight &&
  u.code === F.troop &&
  !u.blanked &&
  card(code).sphere_code !== "encounter";
export const fireNightCannotAttack = (
  s: GameState,
  character: Unit,
  enemy: Unit,
) => enemy.code === F.dagnir && liveSide(s, F.rally) && isAlly(character);
export function fireNightLocationProgressAmount(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (
    !s.fireNight ||
    !s.staging.some((l) => l.id === u.id) ||
    !(card(u.code).traits ?? "").includes("Forest.") ||
    !s.staging.some((l) => l.code === F.darkWoods && !l.blanked)
  )
    return amount;
  const q = s.fireNight,
    old = q.locationProgress.find((m) => m.id === u.id && m.round === s.round);
  const placed = Math.min(amount, Math.max(0, 1 - (old?.amount ?? 0)));
  if (placed > 0) {
    if (old) old.amount += placed;
    else q.locationProgress.push({ id: u.id, round: s.round, amount: placed });
  }
  return placed;
}
export function fireNightDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!s.fireNight || u.code !== F.dagnir || u.blanked) return amount;
  const old = s.fireNight.nonQuestDamage;
  return Math.min(
    amount,
    Math.max(
      0,
      1 + fireNightSideCount(s) - (old.round === s.round ? old.amount : 0),
    ),
  );
}
export function fireNightDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  if (!s.fireNight) return;
  if (u.code === F.dagnir && !u.blanked) {
    const old = s.fireNight.nonQuestDamage;
    s.fireNight.nonQuestDamage = {
      round: s.round,
      amount: amount + (old.round === s.round ? old.amount : 0),
    };
    fireNightCheck(s);
  }
  const c = s.combat as FireCombat | null;
  if (
    context.combatDamage &&
    c &&
    context.enemyId === c.enemyId &&
    (c.undefendedTargetId === "fire-night:hill-excess" || c.fireNightExcess)
  ) {
    const excess = Math.max(0, u.damage - stats(s, u).health);
    if (excess > 0) prepend(s, fx("fireNightHillDamage", { value: excess }));
  }
}
export function fireNightCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !s.fireNight ||
    !context.combatDamage ||
    !s.combat ||
    context.enemyId !== s.combat.enemyId ||
    !allCharacters(s).some((c) => c.id === u.id)
  )
    return;
  (s.combat as FireCombat).fireNightKilled = true;
}
export function fireNightAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  const c = combat as FireCombat;
  if (!s.fireNight || skipped || !c.fireNightKilled) return [];
  return [
    ...(get(s, c.enemyId)?.code === F.dagnir && liveSide(s, F.face)
      ? [fx("fireNightHealDragon", { value: 5 })]
      : []),
    ...(c.fireNightKillHill ? [fx("fireNightHillDamage", { value: 3 })] : []),
    ...(c.fireNightDiscardAlly
      ? [
          fx("fireNightDiscardAlly", {
            player: c.attackPlayer ?? activeSeat(s),
          }),
        ]
      : []),
  ];
}
export function fireNightSideDefeated(s: GameState, u: Unit) {
  if (!s.fireNight || u.blanked) return;
  const effects =
    u.code === F.face
      ? [fx("fireNightQuestDragonDamage", { value: 5 })]
      : u.code === F.douse
        ? [fx("fireNightDouseResponse")]
        : u.code === F.rally
          ? [fx("fireNightRallyResponse")]
          : u.code === F.fortify
            ? [fx("fireNightFortifyResponse")]
            : u.code === F.hold
              ? [fx("fireNightHoldResponse")]
              : [];
  prepend(s, ...effects);
}
export function fireNightSideQuestChosen(s: GameState, u: Unit) {
  if (s.fireNight && u.code === F.drawFire && !u.blanked && dagnir(s))
    prepend(
      s,
      fx("immediateAttack", { target: dagnir(s)!.id, player: firstPlayer(s) }),
    );
}
export function fireNightCommitted(s: GameState) {
  if (liveSide(s, F.defend) && selectedSideQuest(s)?.code === F.defend)
    prepend(s, fx("reveal", { player: firstPlayer(s) }));
}
export function fireNightEndQuest(s: GameState) {
  if (!s.fireNight) return;
  prepend(
    s,
    ...(liveSide(s, F.douse) ? [fx("fireNightHillDamage", { value: 5 })] : []),
    ...s.staging
      .filter((u) => u.code === F.gate && !u.blanked)
      .map((u) => fx("fireNightGate", { target: u.id })),
  );
}
export function fireNightEncounterEnd(s: GameState): Effect[] {
  return liveSide(s, F.defend)
    ? [
        fx("fireNightHillDamage", {
          value: s.staging.filter((u) => card(u.code).type_code === "enemy")
            .length,
        }),
      ]
    : [];
}
export function fireNightEngaged(s: GameState, u: Unit) {
  if (!s.fireNight) return;
  const player = ownerOf(s, u);
  prepend(
    s,
    ...(u.code === F.thrall && !u.blanked
      ? [fx("fireNightThrall", { target: u.id, player })]
      : []),
    ...s.staging
      .filter((e) => e.code === F.stray && !e.blanked && e.id !== u.id)
      .map((e) => fx("fireNightStray", { target: e.id, player })),
  );
}
export function fireNightCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  cancelled: boolean,
) {
  if (!s.fireNight || !fromReveal || cancelled || u.blanked) return;
  if (u.code === F.orc)
    prepend(s, fx("fireNightOrc", { player: firstPlayer(s) }));
  if (u.code === F.rout) prepend(s, fx("fireNightRoutStart"));
}
export function fireNightTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!s.fireNight || u.blanked) return;
  if (u.code === F.palisade)
    return [fx("fireNightReadyHero", { player: firstPlayer(s) })];
  if (u.code === F.tower)
    return playerOrder(s).map((player) =>
      fx("fireNightAssignDamage", { player, value: 1 + fireNightSideCount(s) }),
    );
  if (u.code === F.gate)
    return dagnir(s)
      ? [
          fx("immediateAttack", {
            target: dagnir(s)!.id,
            player: firstPlayer(s),
          }),
        ]
      : [];
  if (u.code === F.accursed) return [fx("reveal", { player: firstPlayer(s) })];
  if (u.code === F.darkWoods)
    return playerOrder(s).map((player) =>
      fx("fireNightDiscardAdd", { player }),
    );
}
export function fireNightEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (
    !s.fireNight ||
    !FIRE_NIGHT_ENCOUNTERS.some(
      (c) => c.code === code && c.type_code === "treachery",
    )
  )
    return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.indexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.fireNight.resolving.push(code);
  prepend(s, fx("fireNightTreachery", { code, player: firstPlayer(s) }));
  return true;
}
export function fireNightRevealedSurge(s: GameState, code: string) {
  if (!s.fireNight) return false;
  if (code === F.bats)
    return allCharacters(s)
      .filter(isHero)
      .every((h) => h.resources === 0);
  if (code === F.wrath)
    return !s.activeLocation || threatOf(s, s.activeLocation) <= 0;
  return false;
}
export function fireNightShadow(s: GameState, code: string) {
  const c = s.combat as FireCombat | null;
  if (!s.fireNight || !c) return false;
  const enemy = get(s, c.enemyId),
    defender = get(s, c.defenderId ?? undefined);
  if (code === F.orc) c.attackBonus += s.fireNight.hillDamage >= 25 ? 2 : 1;
  else if (code === F.flames) c.attackBonus += fireNightSideCount(s);
  else if (code === F.wrath) c.fireNightExcess = true;
  else if (code === F.thrall) c.fireNightKillHill = true;
  else if (code === F.fury) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === F.troop) c.attackBonus += 2;
  else if (code === F.bats)
    c.attackBonus += defender?.attachments.length ? 2 : 1;
  else if (code === F.gloom) {
    c.attackBonus++;
    c.fireNightDiscardAlly = true;
  } else if (code === F.stray) {
    const i = enemy?.shadows
      .slice(0, enemy.revealedShadowCount ?? 0)
      .lastIndexOf(code);
    if (enemy && i !== undefined && i >= 0) {
      removeShadowCard(enemy, i);
      const u = make(s, code);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
    }
  } else return false;
  return true;
}
export const fireNightSharedEffect = (e: Effect) =>
  e.kind.startsWith("fireNight") &&
  ![
    "fireNightAssignDamage",
    "fireNightOrc",
    "fireNightThrall",
    "fireNightRoutChoose",
    "fireNightRoutTake",
    "fireNightRally",
    "fireNightRallyTake",
    "fireNightFortify",
    "fireNightGloom",
    "fireNightDiscardAlly",
    "fireNightReadyHero",
  ].includes(e.kind);

export function fireNightEffect(s: GameState, e: Effect): boolean {
  if (!s.fireNight) return false;
  const q = s.fireNight,
    c = s.combat as FireCombat | null;
  if (
    e.kind === "enemyDamage" &&
    c?.undefendedTargetId?.startsWith("fire-night:hill") &&
    !(c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).some(
      (id) => !!get(s, id),
    )
  ) {
    const enemy = get(s, c.enemyId);
    if (enemy)
      fireNightHillDamage(
        s,
        Math.max(0, stats(s, enemy).attack + c.attackBonus),
      );
    return true;
  }
  if (!e.kind.startsWith("fireNight")) return false;
  const player = e.player ?? firstPlayer(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "fireNightSetupDone":
      q.initialized = true;
      break;
    case "fireNightRevealSide": {
      const side = q.sideDeck.shift();
      if (side) {
        s.staging.push(side);
        log(s, `Side quest revealed · ${name(side)}.`, "chapter");
        fireNightCardEntered(s, side, true, false);
      }
      break;
    }
    case "fireNightHillAttack": {
      const dragon = dagnir(s);
      if (dragon)
        prepend(
          s,
          fx("immediateAttack", {
            target: dragon.id,
            player: firstPlayer(s),
            noShadow: true,
            damageTarget: "fire-night:hill-excess",
          }),
        );
      break;
    }
    case "fireNightHillDamage":
      fireNightHillDamage(s, e.value ?? 0);
      break;
    case "fireNightHealDragon": {
      const d = dagnir(s);
      if (d) d.damage = Math.max(0, d.damage - (e.value ?? 0));
      break;
    }
    case "fireNightQuestDragonDamage": {
      const d = dagnir(s);
      // This damage is caused by a quest effect and explicitly bypasses the non-quest cap.
      if (d) {
        d.damage += e.value ?? 0;
        log(
          s,
          `Face the Dragon deals ${e.value ?? 0} quest damage to Dagnir.`,
          "good",
        );
        fireNightCheck(s);
      }
      break;
    }
    case "fireNightDouseResponse":
      optional(s, "Douse the Flames · Remove 10 damage from Hrogar’s Hill?", [
        fx("fireNightHealHill", { value: 10 }),
      ]);
      break;
    case "fireNightHealHill":
      q.hillDamage = Math.max(0, q.hillDamage - (e.value ?? 0));
      break;
    case "fireNightHoldResponse":
      optional(
        s,
        "Hold the Door · Reduce each player’s threat by 5?",
        playerOrder(s).map((player) => fx("threat", { player, value: -5 })),
      );
      break;
    case "fireNightRallyResponse":
      optional(
        s,
        "Rally the Woodmen · Search for allies?",
        playerOrder(s).map((player) => fx("fireNightRally", { player })),
      );
      break;
    case "fireNightFortifyResponse":
      optional(
        s,
        "Fortify the Defense · Gain resources or cards?",
        playerOrder(s).map((player) => fx("fireNightFortify", { player })),
      );
      break;
    case "fireNightFortify":
      choose(s, "Fortify the Defense · Choose your reward", [
        {
          id: "draw",
          label: "Draw 3 cards",
          effects: [fx("draw", { value: 3, player })],
        },
        {
          id: "resources",
          label: "Each of your heroes gains 1 resource",
          effects: own(s, player)
            .filter(isHero)
            .map((h) => fx("resource", { target: h.id, value: 1, player })),
        },
      ]);
      break;
    case "fireNightRally": {
      const deck = seatView(s, player).deck;
      const options = deck.slice(0, 5).flatMap((code, i) =>
        allyCanEnter(s, code)
          ? [
              {
                id: String(i),
                code,
                label: card(code).name,
                effects: [fx("fireNightRallyTake", { player, value: i, code })],
              },
            ]
          : [],
      );
      choose(s, "Rally the Woodmen · Put an ally from the top 5 into play", [
        ...options,
        {
          id: "skip",
          label: "Finish the search and shuffle your deck",
          effects: [fx("fireNightRallyTake", { player, value: -1 })],
        },
      ]);
      break;
    }
    case "fireNightRallyTake":
      forOwner(s, player, () => {
        const i = e.value ?? -1;
        if (
          i >= 0 &&
          i < Math.min(5, s.deck.length) &&
          s.deck[i] === e.code &&
          allyCanEnter(s, s.deck[i])
        ) {
          const ally = takePlayerDeck(s, i);
          ally.owner ??= player;
          enterAlly(s, ally);
        }
        s.deck = shuffle(s, s.deck);
      });
      break;
    case "fireNightGate":
      if (u && s.staging.some((l) => l.id === u.id) && !u.blanked) {
        u.resources++;
        if (u.resources >= 3) {
          discardLocation(s, u);
          fireNightHillDamage(s, 4);
        }
      }
      break;
    case "fireNightThrall":
      if (u)
        choose(s, "The Dragon’s Thrall · Choose one", [
          {
            id: "hill",
            label: "Deal 3 damage to Hrogar’s Hill",
            effects: [fx("fireNightHillDamage", { value: 3 })],
          },
          {
            id: "attack",
            label: "The Dragon’s Thrall makes an immediate attack against you",
            effects: [fx("immediateAttack", { target: u.id, player })],
          },
        ]);
      break;
    case "fireNightStray":
      if (u && s.staging.some((e) => e.id === u.id))
        forOwner(s, player, () => engage(s, u));
      break;
    case "fireNightOrc":
      choose(s, "Orc of the Flame · Choose one", [
        ...own(s, firstPlayer(s))
          .filter(isHero)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: `Deal 2 damage to ${name(h)}`,
            effects: [
              fx("damage", { target: h.id, value: 2, player: firstPlayer(s) }),
            ],
          })),
        {
          id: "hill",
          label: "Deal 3 damage to Hrogar’s Hill",
          effects: [fx("fireNightHillDamage", { value: 3 })],
        },
      ]);
      break;
    case "fireNightAssignDamage": {
      const left = e.value ?? 0;
      if (left > 0)
        choose(
          s,
          `Assign ${left} damage among your characters`,
          own(s, player)
            .filter((u) => u.damage < stats(s, u).health)
            .map((u) => ({
              id: u.id,
              code: u.code,
              label: `Deal 1 damage to ${name(u)}`,
              effects: [
                fx("damage", { target: u.id, value: 1, player }),
                fx("fireNightAssignDamage", { player, value: left - 1 }),
              ],
            })),
        );
      break;
    }
    case "fireNightDiscardAlly":
      choose(
        s,
        "Gathering Gloom · Discard an ally",
        own(s, player)
          .filter(isAlly)
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("fireNightDiscardCharacter", { target: u.id, player }),
            ],
          })),
      );
      break;
    case "fireNightDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "fireNightReadyHero":
      choose(
        s,
        "Wooden Palisade · Ready a hero",
        own(s, player)
          .filter((h) => isHero(h) && h.exhausted)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("fireNightReady", { target: h.id, player })],
          })),
      );
      break;
    case "fireNightReady":
      if (u) readyCharacter(s, u);
      break;
    case "fireNightDiscardAdd": {
      const code = encounterDraw(s);
      if (code) {
        if (card(code).type_code === "enemy") {
          const enemy = make(s, code);
          s.staging.push(enemy);
          enemyAddedToStaging(s, enemy);
        } else s.encounterDiscard.push(code);
      }
      break;
    }
    case "fireNightRoutStart":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("fireNightRoutChoose", { player }),
        ),
        fx("fireNightShuffle"),
      );
      break;
    case "fireNightRoutChoose": {
      const codes = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard]),
      ].filter(
        (code) =>
          (card(code).traits ?? "").includes("Goblin.") &&
          card(code).type_code === "enemy",
      );
      choose(
        s,
        "Rout the Goblins · Choose a different Goblin to engage",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("fireNightRoutTake", { player, code })],
        })),
      );
      break;
    }
    case "fireNightRoutTake": {
      if (!e.code) break;
      const pile = s.encounterDeck.includes(e.code)
          ? s.encounterDeck
          : s.encounterDiscard,
        i = pile.indexOf(e.code);
      if (i >= 0) {
        pile.splice(i, 1);
        const enemy = make(s, e.code);
        s.staging.push(enemy);
        forOwner(s, player, () => engage(s, enemy));
      }
      break;
    }
    case "fireNightShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      break;
    case "fireNightTreachery": {
      const code = e.code!,
        i = q.resolving.indexOf(code);
      if (i < 0) break;
      q.resolving.splice(i, 1);
      s.encounterDiscard.push(code);
      if (code === F.flames)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("fireNightAssignDamage", {
              player,
              value: 1 + fireNightSideCount(s),
            }),
          ),
        );
      if (code === F.fury && dagnir(s))
        prepend(
          s,
          fx("immediateAttack", {
            target: dagnir(s)!.id,
            player: firstPlayer(s),
            damageTarget: "fire-night:hill",
          }),
        );
      if (code === F.wrath && s.activeLocation) {
        const loc = s.activeLocation,
          amount = threatOf(s, loc);
        discardLocation(s, loc);
        fireNightHillDamage(s, amount);
      }
      if (code === F.gloom)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("fireNightGloom", { player })),
        );
      if (code === F.bats) {
        for (const player of playerOrder(s)) {
          const heroes = own(s, player).filter(isHero),
            n = heroes.reduce((a, h) => a + h.resources, 0);
          for (const h of heroes) h.resources = 0;
          if (n) prepend(s, fx("threat", { player, value: n }));
        }
      }
      break;
    }
    case "fireNightGloom":
      choose(s, "Gathering Gloom · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${own(s, player).filter(isAlly).length}`,
          effects: [
            fx("threat", {
              value: own(s, player).filter(isAlly).length,
              player,
            }),
          ],
        },
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player })],
        },
      ]);
      break;
    default:
      return false;
  }
  return true;
}
export const FIRE_NIGHT_HOOKS: Batch4ScenarioHooks = {
  setup: setupFireNight,
  openingHandsKept: fireNightOpeningHandsKept,
  check: fireNightCheck,
  advance: (s) => !!s.fireNight,
  stageInfo: fireNightStageInfo,
  stats: fireNightStats,
  threatBonus: fireNightThreatBonus,
  sideQuestGoalBonus: fireNightSideQuestGoalBonus,
  defenseOverride: fireNightDefenseOverride,
  shadowImmune: fireNightShadowImmune,
  locationProgressAmount: fireNightLocationProgressAmount,
  immune: fireNightImmune,
  cannotLeave: fireNightCannotLeave,
  cannotEngage: fireNightCannotLeave,
  cannotOptionallyEngage: fireNightCannotOptionallyEngage,
  consideredEngaged: fireNightConsideredEngaged,
  cannotAttach: fireNightCannotAttach,
  cannotAttack: fireNightCannotAttack,
  cannotCancel: fireNightCannotCancel,
  cannotReduceThreat: (s) => liveSide(s, F.hold),
  planningEnd: fireNightPlanningEnd,
  sideDefeated: fireNightSideDefeated,
  sideQuestChosen: fireNightSideQuestChosen,
  committed: fireNightCommitted,
  endQuest: fireNightEndQuest,
  encounterEnd: fireNightEncounterEnd,
  damageAmount: fireNightDamageAmount,
  damageDealt: fireNightDamageDealt,
  characterDestroyed: fireNightCharacterDestroyed,
  attackFinished: fireNightAttackFinished,
  engaged: fireNightEngaged,
  cardEntered: fireNightCardEntered,
  travelEffects: fireNightTravelEffects,
  encounter: fireNightEncounter,
  revealedSurge: fireNightRevealedSurge,
  shadow: fireNightShadow,
  playerAttackDeclared: (s, enemy, ids) =>
    !(
      enemy.code === F.dagnir &&
      liveSide(s, F.rally) &&
      ids.some((id) => {
        const u = get(s, id);
        return !!u && isAlly(u);
      })
    ),
  effect: fireNightEffect,
  sharedEffect: fireNightSharedEffect,
};
