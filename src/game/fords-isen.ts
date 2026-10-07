import { removeQuestTime } from "./quest-time";
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  characters,
  choose,
  draw,
  fx,
  get,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  stats,
  units,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  engage,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  questDefeated,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  attachToQuest,
  currentQuestCode,
  currentQuestUnit,
} from "./quest-state";
import { hasTrait } from "./expansion-passives";
import { FORDS as F, fordsTimeLimit } from "./fords-isen-support";

const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const largeHand = (s: GameState, count: number) =>
  playerOrder(s).some((p) => seatView(s, p).hand.length >= count);
const dunland = (code: string) =>
  card(code).type_code === "enemy" &&
  /\bDunland\b/.test(card(code).traits ?? "");
const lose = (s: GameState, reason: string) => {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
};

export function setupFordsIsen(s: GameState) {
  s.fordsIsen = { time: 5 };
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![F.grima, F.islet].includes(c),
  );
  const grima = make(s, F.grima),
    islet = make(s, F.islet);
  islet.guarding = grima.id;
  s.staging.push(islet, grima);
  prepend(
    s,
    fx("fordsSearch", {
      ids: [],
      count: 0,
      flag: true,
      player: firstPlayer(s),
    }),
  );
}

export function fordsCheck(s: GameState) {
  if (!s.fordsIsen || s.status !== "playing") return;
  const captive = s.staging.find((u) => u.code === F.grima);
  if (captive && !units(s).some((u) => u.guarding === captive.id)) {
    s.staging = s.staging.filter((u) => u.id !== captive.id);
    forOwner(s, firstPlayer(s), () => s.allies.push(captive));
    log(s, "Gríma is rescued and joins the first player's fellowship.", "good");
  }
  const grima = allCharacters(s).find((u) => u.code === F.grima);
  if (!grima && !captive) {
    lose(s, "Gríma has left play. The defence of the Fords has failed.");
    return;
  }
  if (grima && !grima.blanked) {
    const from = ownerOf(s, grima),
      to = firstPlayer(s);
    if (from !== to) {
      forOwner(
        s,
        from,
        () => (s.allies = s.allies.filter((u) => u.id !== grima.id)),
      );
      forOwner(s, to, () => s.allies.push(grima));
    }
  }
  // A smaller hand can lower The King's Road's quest points without placing new progress.
  for (const road of [...s.staging, ...allActiveLocations(s)].filter(
    (u) => u.code === F.road,
  ))
    if (road.progress >= 2 + fordsLocationBonus(s, road))
      progressLocation(s, road, 0);
}
export function advanceFordsIsen(s: GameState) {
  if (!s.fordsIsen) return false;
  if (
    s.queue.length ||
    s.choice ||
    s.stageRevealing ||
    s.progress < [6, 14, 16][s.stage - 1]
  )
    return true;
  if (
    s.stage === 1 &&
    !seatView(s, firstPlayer(s)).allies.some((u) => u.code === F.grima)
  )
    return true;
  if (s.stage === 3 && enemies(s).length) return true;
  if (questDefeated(s, currentQuestCode(s)!)) return true;
  if (s.stage === 3) {
    win(s);
    s.reason =
      "Gríma is safe and the Dunlendings are defeated. The Fords of Isen hold.";
    return true;
  }
  s.stage++;
  s.progress = 0;
  s.stageRevealing = true;
  s.fordsIsen.time = fordsTimeLimit(s.stage);
  prepend(
    s,
    fx("fordsSearch", { ids: [], count: 0, player: firstPlayer(s) }),
    fx("fordsStageReady"),
  );
  return true;
}
export const fordsRemoveTime = removeQuestTime;
export const fordsCannotGainResources = (s: GameState, cardEffect: boolean) =>
  cardEffect && s.staging.some((u) => u.code === F.fords && !u.blanked);
export const fordsLocationBonus = (s: GameState, u: Unit) =>
  u.code === F.road && !u.blanked && largeHand(s, 3) ? 3 : 0;
export const fordsMandatoryTravel = (s: GameState) =>
  !allActiveLocations(s).length &&
  largeHand(s, 5) &&
  s.staging.some((u) => u.code === F.road && !u.blanked);
export function fordsAttackBonus(s: GameState, u: Unit) {
  return (
    (card(u.code).type_code === "enemy" && hasTrait(u, "Dunland")
      ? s.staging.filter((l) => l.code === F.gap && !l.blanked).length
      : 0) +
    (u.code === F.bandit &&
    !u.blanked &&
    allEngaged(s).some((e) => e.id === u.id)
      ? seatView(s, ownerOf(s, u)).hand.length
      : 0)
  );
}
export function fordsThreatBonus(s: GameState, u: Unit) {
  return (
    (card(u.code).type_code === "enemy" && hasTrait(u, "Dunland")
      ? allActiveLocations(s).filter((l) => l.code === F.islet && !l.blanked)
          .length
      : 0) +
    (u.code === F.prowler && !u.blanked && largeHand(s, 5) ? 1 : 0) +
    (u.roundThreat ?? 0)
  );
}
export const fordsRevealSurge = (s: GameState, code: string) =>
  code === F.prowler && largeHand(s, 3);
export const fordsCannotCancel = (s: GameState, code: string) =>
  code === F.hills && largeHand(s, 5);
export function fordsTravelEntered(s: GameState, u: Unit) {
  if (u.code === F.fords && !u.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("fordsFillHand", { player })),
    );
}
export function fordsCardsDrawn(s: GameState, player = activeSeat(s)) {
  const effects: Effect[] = [];
  for (const u of enemies(s)) {
    if (u.blanked) continue;
    if (u.code === F.tribesman)
      effects.push(fx("fordsTribesman", { target: u.id, code: u.code }));
    if (
      u.code === F.berserker &&
      seatView(s, player).engaged.some((e) => e.id === u.id)
    )
      effects.push(fx("immediateAttack", { target: u.id, player }));
  }
  for (const a of currentQuestUnit(s)?.attachments ?? []) {
    if (a.blanked || a.facedown) continue;
    if (a.code === F.hatreds)
      effects.push(fx("fordsThreat", { value: 1, code: a.code, player }));
    if (a.code === F.wild)
      effects.push(fx("fordsDivideDamage", { value: 1, code: a.code, player }));
  }
  if (effects.length)
    prepend(s, fx("fordsDrawReactions", { effects, player: firstPlayer(s) }));
}
export function fordsEngaged(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === F.raider)
    prepend(
      s,
      fx("fordsDivideDamage", {
        value: s.hand.length,
        code: u.code,
        player: activeSeat(s),
      }),
    );
  if (u.code === F.chieftain)
    prepend(
      s,
      fx("fordsChieftain", { value: s.hand.length, player: activeSeat(s) }),
    );
}
export function fordsCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !(s.combat?.fordsTimeOnKill || s.combat?.timeOnKill) ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const count = (s.combat.fordsTimeOnKill ?? 0) + (s.combat.timeOnKill ?? 0);
  s.combat.timeOnKill = 0;
  s.combat.fordsTimeOnKill = 0;
  // Each physical shadow supplies a separate Forced trigger. A timeout resolves
  // completely before the next copy removes its counter from the current quest.
  prepend(
    s,
    ...Array.from({ length: count }, () =>
      fx("removeQuestTime", { player: firstPlayer(s) }),
    ),
  );
}
export function fordsAttackFinished(
  s: GameState,
  u: Unit,
  player: number,
  combat: NonNullable<GameState["combat"]>,
) {
  prepend(
    s,
    ...Array.from(
      { length: (combat.fordsExtraAttacks ?? 0) + (combat.extraAttacks ?? 0) },
      () => fx("immediateAttack", { target: u.id, player }),
    ),
  );
}
export const fordsAbilityProblem = (s: GameState, u: Unit) =>
  u.blanked || u.exhausted || !s.allies.some((a) => a.id === u.id)
    ? "Exhaust Gríma under your control to draw a card."
    : null;
export function fordsAbility(s: GameState, u: Unit) {
  if (u.code !== F.grima) return false;
  requireRule(!fordsAbilityProblem(s, u), fordsAbilityProblem(s, u) ?? "");
  exhaustCharacter(s, u);
  draw(s, 1);
  return true;
}
export function fordsEncounter(s: GameState, code: string, replay = false) {
  if (code === F.tribesman)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
    );
  else if (code === F.pillaging)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
      ...playerOrder(s).map((player) => fx("fordsHandThreat", { player })),
    );
  else if (code === F.hills)
    prepend(s, ...playerOrder(s).map((player) => fx("fordsHills", { player })));
  else if ([F.hatreds, F.wild].includes(code)) {
    const quest = currentQuestCode(s);
    if (quest)
      attachToQuest(s, quest, { id: `a${s.nextId++}`, code, exhausted: false });
    else if (!replay) s.encounterDiscard.push(code);
    return true;
  } else if (code === F.tidings) {
    forOwner(s, firstPlayer(s), () => {
      s.hand.push(make(s, code));
      if (s.hand.length >= 5)
        prepend(s, fx("amonSurgeWindow", { code }), fx("reveal"));
      fordsCardsDrawn(s);
    });
    return true;
  } else return false;
  if (card(code).type_code === "treachery" && !replay)
    s.encounterDiscard.push(code);
  return true;
}
export function fordsShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === F.gap) {
    c.attackBonus++;
    c.fordsTimeOnKill = (c.fordsTimeOnKill ?? 0) + 1;
  } else if (code === F.bandit)
    c.attackBonus += seatView(s, player).hand.length >= 3 ? 2 : 1;
  else if (code === F.tribesman) c.attackBonus++;
  else if (code === F.berserker)
    c.fordsExtraAttacks = (c.fordsExtraAttacks ?? 0) + 1;
  else if ([F.pillaging, F.raider].includes(code))
    prepend(
      s,
      fx("fordsDiscardAttachments", {
        player,
        flag: code === F.pillaging && !c.defenderId,
      }),
    );
  else return false;
  return true;
}

export function fordsEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("fords")) return false;
  switch (e.kind) {
    case "fordsStageReady":
      s.stageRevealing = false;
      break;
    case "fordsRemoveTime":
      fordsRemoveTime(s, e.value ?? 1);
      break;
    case "fordsTimeExpired": {
      if (!s.fordsIsen || e.value !== s.stage || s.fordsIsen.time) break;
      if (s.stage === 1) {
        const g = units(s).find((u) => u.code === F.grima);
        if (g && s.staging.some((u) => u.id === g.id)) {
          s.staging = s.staging.filter((u) => u.id !== g.id);
          s.encounterDiscard.push(g.code);
        } else if (g) discardCharacter(s, g);
        lose(
          s,
          "Time has run out. Gríma is discarded and the defence of the Fords fails.",
        );
      } else if (s.stage === 2)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("fordsDivideDamage", {
              player,
              value: seatView(s, player).hand.length,
              code: F.attack,
            }),
          ),
          fx("fordsResetTime", { value: s.stage }),
        );
      else {
        // Discarding cards does not reshuffle an exhausted encounter deck.
        const discarded = s.encounterDeck.splice(
          0,
          seatView(s, firstPlayer(s)).hand.length,
        );
        s.encounterDiscard.push(...discarded);
        for (const code of discarded.filter(
          (c) => card(c).type_code === "enemy",
        )) {
          s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(code), 1);
          placeEncounter(s, code, true);
        }
        s.fordsIsen.time = 3;
      }
      break;
    }
    case "fordsResetTime":
      if (s.fordsIsen && s.stage === e.value)
        s.fordsIsen.time = fordsTimeLimit(s.stage);
      break;
    case "fordsSearch": {
      const player = playerOrder(s)[e.count ?? 0];
      if (player === undefined) {
        shuffle(s, s.encounterDeck);
        break;
      }
      const candidates = [
        ...new Set([...s.encounterDeck, ...(e.flag ? [] : s.encounterDiscard)]),
      ].filter((c) => dunland(c) && !(e.ids ?? []).includes(c));
      const next = (code?: string) =>
        fx("fordsSearch", {
          flag: e.flag,
          count: (e.count ?? 0) + 1,
          ids: [...(e.ids ?? []), ...(code ? [code] : [])],
          player: playerOrder(s)[(e.count ?? 0) + 1] ?? firstPlayer(s),
        });
      if (!candidates.length) {
        prepend(s, next());
        break;
      }
      forOwner(s, player, () =>
        choose(
          s,
          "Choose a different Dunland enemy",
          candidates.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("fordsTakeEnemy", { code, flag: e.flag, player }),
              next(code),
            ],
          })),
          e.flag
            ? "Search the encounter deck. Each player must choose a different enemy."
            : "Search the encounter deck and discard pile. Each player must choose a different enemy.",
        ),
      );
      break;
    }
    case "fordsTakeEnemy": {
      const pool = s.encounterDeck.includes(e.code!)
        ? s.encounterDeck
        : s.encounterDiscard;
      const i = pool.indexOf(e.code!);
      if (i < 0 || (e.flag && pool === s.encounterDiscard)) break;
      pool.splice(i, 1);
      if (e.text === "reveal") {
        shuffle(s, s.encounterDeck);
        revealed(s, e.code!);
      } else placeEncounter(s, e.code!, true);
      break;
    }
    case "fordsHills":
      choose(
        s,
        "Down From The Hills",
        [
          ...(s.fordsIsen?.time
            ? [
                {
                  id: "time",
                  label: "Remove 1 time counter",
                  effects: [fx("fordsRemoveTime", { player: firstPlayer(s) })],
                },
              ]
            : []),
          {
            id: "search",
            label: "Search for and reveal a Dunland enemy",
            effects: [fx("fordsHillsSearch")],
          },
        ],
        "Choose before looking through the encounter deck.",
      );
      break;
    case "fordsHillsSearch": {
      const candidates = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard]),
      ].filter(dunland);
      if (!candidates.length) {
        shuffle(s, s.encounterDeck);
        break;
      }
      choose(
        s,
        "Down From The Hills · Choose an enemy",
        candidates.map((code) => ({
          id: code,
          code,
          label: `Reveal ${card(code).name}`,
          effects: [
            fx("fordsTakeEnemy", {
              code,
              text: "reveal",
              player: activeSeat(s),
            }),
          ],
        })),
      );
      break;
    }
    case "fordsChieftain": {
      const discarded = s.encounterDeck.splice(0, e.value ?? 0);
      s.encounterDiscard.push(...discarded);
      // The topmost card of the discard pile was the last card discarded from the deck.
      const code = [...discarded].reverse().find(dunland);
      if (code) {
        s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(code), 1);
        const enemy = make(s, code);
        s.staging.push(enemy);
        engage(s, enemy);
      }
      break;
    }
    case "fordsFillHand":
      draw(s, Math.max(0, 5 - s.hand.length));
      break;
    case "fordsHandThreat":
      raiseThreat(s, s.hand.length, "encounter");
      break;
    case "fordsThreat":
      raiseThreat(s, e.value ?? 1, "encounter");
      break;
    case "fordsTribesman": {
      const u = get(s, e.target);
      if (u) u.roundThreat = (u.roundThreat ?? 0) + 1;
      break;
    }
    case "fordsDrawReactions": {
      const effects = e.effects ?? [];
      if (effects.length <= 1) {
        prepend(s, ...effects);
        break;
      }
      choose(
        s,
        "Card draw · Choose the next Forced effect",
        effects.map((effect, i) => ({
          id: String(i),
          code: effect.code ?? get(s, effect.target)?.code,
          label:
            effect.kind === "fordsTribesman"
              ? `${card(effect.code!).name} · +1 threat this round`
              : effect.kind === "immediateAttack"
                ? "Dunland Berserker · immediate attack"
                : card(effect.code!).name,
          effects: [
            effect,
            fx("fordsDrawReactions", {
              effects: effects.filter((_f, n) => n !== i),
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "fordsDivideDamage": {
      const remaining = e.value ?? 0,
        assignments = e.effects ?? [];
      const eligible = characters(s)
        .map((u) => ({
          u,
          capacity:
            stats(s, u).health -
            u.damage -
            assignments
              .filter((a) => a.target === u.id)
              .reduce((n, a) => n + (a.value ?? 0), 0),
        }))
        .filter((x) => x.capacity > 0);
      if (remaining <= 0 || !eligible.length) {
        const totals = new Map<string, Effect>();
        for (const a of assignments) {
          const prior = totals.get(a.target!);
          if (prior) prior.value = (prior.value ?? 0) + (a.value ?? 0);
          else totals.set(a.target!, { ...a });
        }
        prepend(s, ...totals.values());
        break;
      }
      choose(
        s,
        `${e.code ? card(e.code).name : "Dunland"} · Assign ${remaining} damage`,
        eligible.flatMap(({ u, capacity }) =>
          Array.from({ length: Math.min(remaining, capacity) }, (_v, i) => ({
            id: `${u.id}:${i + 1}`,
            code: u.code,
            label: `${name(u)} · ${i + 1} damage`,
            effects: [
              fx("fordsDivideDamage", {
                value: remaining - i - 1,
                code: e.code,
                player: activeSeat(s),
                effects: [
                  ...assignments,
                  fx("damage", {
                    target: u.id,
                    value: i + 1,
                    player: activeSeat(s),
                  }),
                ],
              }),
            ],
          })),
        ),
        "Divide the damage among characters you control. Damage is dealt after all assignments are chosen.",
      );
      break;
    }
    case "fordsDiscardAttachments": {
      const quest = currentQuestUnit(s);
      const eligible = [...units(s), ...(quest ? [quest] : [])].flatMap(
        (host) =>
          host.attachments
            .filter(
              (a) =>
                attachmentController(s, host, a) === activeSeat(s) &&
                !card(a.code).text?.includes("Permanent"),
            )
            .map((a) => ({ host, a })),
      );
      if (e.flag)
        for (const { host, a } of eligible) discardAttachment(s, host, a);
      else
        choose(
          s,
          "Choose an attachment you control to discard",
          eligible.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("discardAttachment", { target: host.id, source: a.id }),
            ],
          })),
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
