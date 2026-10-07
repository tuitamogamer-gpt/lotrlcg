import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext, readDamageContext } from "./damage-context";
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
  shuffle,
  skip,
  stats,
} from "./core";
import {
  damage,
  discardAttachment,
  discardHandCard,
  engage,
  enemyAddedToStaging,
  placeEncounter,
  progressLocation,
  questDefeated,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { currentQuestCode } from "./quest-state";
import { playerAttackKilled, playerAttackResolved } from "./combat";
import { effectiveTraits } from "./expansion-passives";
import { heirsShadowDealt } from "./heirs-numenor";
import { MORGUL_VALE as M } from "./morgul-vale-support";
const first = (s: GameState) => s.table?.first ?? 0;
const isMorgul = (s: GameState) => s.scenarioId === "the-morgul-vale";
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const captains = [M.murzag, M.alcaron, M.nazgul];
const tower = (s: GameState) => s.staging.find((u) => u.code === M.tower);
export const morgulTowerProgress = (s: GameState) => tower(s)?.progress ?? 0;
export function setupMorgulVale(s: GameState) {
  s.morgulVale = { defeated: [], setAside: [M.alcaron, M.nazgul, M.bridge] };
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![M.tower, ...captains, M.bridge].includes(c),
  );
  const index = s.encounterDeck.indexOf(M.vale);
  if (index >= 0) s.encounterDeck.splice(index, 1);
  for (const code of [M.tower, M.murzag, M.vale]) placeEncounter(s, code);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const faramir = (code: string) => card(code).name === "Faramir";
      s.removed.push(
        ...s.deck.filter(faramir),
        ...s.hand.filter((u) => faramir(u.code)).map((u) => u.code),
      );
      s.deck = s.deck.filter((c) => !faramir(c));
      s.hand = s.hand.filter((u) => !faramir(u.code));
    });
  shuffle(s, s.encounterDeck);
}
export function morgulAddProgress(s: GameState, count: number) {
  const t = tower(s);
  if (!t || count <= 0 || s.status !== "playing") return;
  t.progress += count;
  log(s, `To the Tower · ${t.progress}/10 progress.`, "danger");
  morgulValeCheck(s);
  if (s.status !== "playing") return;
  // The Forced ability triggers once per placement, irrespective of token count.
  prepend(
    s,
    ...enemies(s)
      .filter((u) => u.code === M.sorcerer && !u.blanked)
      .map((u) => fx("morgulDealShadow", { target: u.id })),
  );
}
export function morgulValeCheck(s: GameState) {
  if (!isMorgul(s)) return;
  if (morgulTowerProgress(s) >= 10) {
    s.status = "lost";
    s.reason = "The captives have reached the tower of Minas Morgul.";
    s.queue = [];
    s.choice = null;
  }
  for (const u of enemies(s).filter((u) => u.code === M.nazgul && !u.blanked))
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  if (s.status === "playing")
    for (const u of [...s.staging, ...allActiveLocations(s)].filter(
      (u) => u.code === M.bridge,
    ))
      if (u.progress >= morgulTowerProgress(s)) progressLocation(s, u, 0);
}
export const morgulCannotLeave = (s: GameState, u: Unit) =>
  isMorgul(s) && u.code === captains[s.stage - 1];
export const morgulDamageAmount = (_s: GameState, u: Unit, value: number) =>
  u.code === M.nazgul && !u.blanked ? Math.min(1, value) : value;
export function morgulEnemyDestroyed(s: GameState, u: Unit) {
  if (
    s.morgulVale &&
    captains.includes(u.code) &&
    !s.morgulVale.defeated.includes(u.code)
  )
    s.morgulVale.defeated.push(u.code);
}
export function advanceMorgulVale(s: GameState) {
  if (!isMorgul(s)) return false;
  if (
    s.choice ||
    s.queue.length ||
    s.stageRevealing ||
    !s.morgulVale?.defeated.includes(captains[s.stage - 1])
  )
    return true;
  if (questDefeated(s, currentQuestCode(s)!)) return true;
  if (s.stage === 3) {
    win(s);
    s.reason =
      "The three Captains are defeated. Faramir is rescued before reaching Minas Morgul.";
    return true;
  }
  s.stage++;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(s, fx("morgulStage", { player: first(s) }));
  return true;
}
export function morgulShadowDealt(_s: GameState, u: Unit) {
  const code = u.shadows.at(-1);
  if (u.code === M.alcaron && !u.blanked && code && !card(code).shadow)
    u.morgulExtraAttacks = (u.morgulExtraAttacks ?? 0) + 1;
}
export function morgulCombatEnd(s: GameState) {
  if (!isMorgul(s)) return;
  for (const u of enemies(s)) {
    delete u.morgulExtraAttacks;
    if (s.staging.some((e) => e.id === u.id)) {
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
    }
  }
}
export function morgulAttackStarted(s: GameState, u: Unit) {
  if (u.code === M.alcaron && !u.blanked)
    prepend(s, fx("morgulProgress", { value: 1, player: first(s) }));
}
export function morgulAttackFinished(
  s: GameState,
  u: Unit,
  player: number,
  completed: NonNullable<GameState["combat"]>,
) {
  const effects: Effect[] = [];
  if (completed.morgulProgressOnKill && completed.morgulKilledCharacter)
    effects.push(fx("morgulProgress", { value: 1, player: first(s) }));
  if (u.code === M.murzag && !u.blanked)
    effects.push(fx("morgulMurzag", { player }));
  if (u.code === M.alcaron && u.morgulExtraAttacks) {
    const count = u.morgulExtraAttacks;
    u.morgulExtraAttacks = 0;
    for (let i = 0; i < count; i++)
      effects.push(fx("immediateAttack", { target: u.id, player }));
  }
  prepend(s, ...effects);
}
export function morgulCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    s.combat?.morgulProgressOnKill &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    s.combat.morgulKilledCharacter = true;
}
export function morgulEngaged(s: GameState, u: Unit, optional: boolean) {
  if (u.code === M.tracker && !u.blanked && optional)
    prepend(s, fx("morgulProgress", { value: 1, player: first(s) }));
}
export const morgulBridgeValue = (s: GameState, u: Unit) =>
  u.code === M.bridge ? morgulTowerProgress(s) : undefined;
export function morgulRoundEnd(s: GameState): Effect[] {
  return [...s.staging, ...allActiveLocations(s)]
    .filter((u) => u.code === M.vale && !u.blanked)
    .flatMap(() =>
      playerOrder(s).map((player) => fx("morgulReturnChoice", { player })),
    );
}
export function morgulExplored(s: GameState, u: Unit) {
  if (u.code === M.road && !u.blanked)
    prepend(s, fx("morgulRoad", { player: first(s) }));
}
export function morgulEncounter(s: GameState, code: string, replay = false) {
  if (code === M.terror)
    prepend(s, fx("morgulProgress", { value: 1, player: first(s) }));
  else if (code === M.city) {
    const count = morgulTowerProgress(s);
    prepend(
      s,
      ...(count
        ? playerOrder(s).map((player) =>
            fx("heirsThreat", { player, value: count }),
          )
        : [fx("reveal")]),
    );
  } else if (code === M.fog) prepend(s, fx("morgulFog", { player: first(s) }));
  else if (code === M.malice)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("morgulMalice", { player })),
    );
  else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function morgulShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if ([M.terror, M.city].includes(code))
    c.attackBonus += morgulTowerProgress(s);
  else if ([M.road, M.malice].includes(code)) c.returnToStaging = true;
  else if (code === M.vale) c.morgulProgressOnKill = true;
  else if (code === M.bodyguard)
    prepend(
      s,
      fx("morgulNextAttack", {
        target: c.enemyId,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  else if (code === M.sorcerer)
    prepend(
      s,
      fx("morgulShadowChoice", { player: c.attackPlayer ?? activeSeat(s) }),
    );
  else if (code === M.tracker) {
    c.attackBonus++;
    if (!c.defenderId)
      prepend(s, fx("morgulProgress", { value: 1, player: first(s) }));
  } else return false;
  return true;
}
/** Resolve mandatory replacement before damage, retaining the attack's response context. */
export function morgulRedirectDamage(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
  attackers?: string[],
) {
  const guards = enemies(s).filter((e) => e.code === M.bodyguard && !e.blanked);
  if (amount <= 0 || !guards.length || !effectiveTraits(u).includes("Captain"))
    return false;
  prepend(
    s,
    fx("morgulRedirectChoice", {
      player: first(s),
      target: u.id,
      value: amount,
      ids: attackers,
      text: encodeDamageContext(context),
    }),
  );
  return true;
}
export function morgulEffect(s: GameState, e: Effect): boolean {
  // Player card effects use a separate prefix/handler.
  if (
    ![
      "morgulProgress",
      "morgulDealShadow",
      "morgulStage",
      "morgulStageReady",
      "morgulMurzag",
      "morgulMurzagEngage",
      "morgulFog",
      "morgulMalice",
      "morgulDiscardThree",
      "morgulReturnChoice",
      "morgulReturn",
      "morgulRoad",
      "morgulReduce",
      "morgulRedirectChoice",
      "morgulRedirect",
      "morgulNextAttack",
      "morgulResume",
      "morgulShadowChoice",
      "morgulUndefended",
    ].includes(e.kind)
  )
    return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "morgulProgress":
      morgulAddProgress(s, e.value ?? 1);
      break;
    case "morgulDealShadow": {
      if (!u) break;
      const code = encounterDraw(s, true);
      if (code) {
        u.shadows.push(code);
        heirsShadowDealt(s, u);
        if (s.combat?.enemyId === u.id)
          prepend(s, fx("shadowReveal", { code }));
      }
      break;
    }
    case "morgulNextAttack": {
      if (!u) break;
      const original = e.player ?? activeSeat(s),
        order = playerOrder(s),
        next = order[(order.indexOf(original) + 1) % order.length];
      if (next === undefined) break;
      forOwner(s, next, () => engage(s, u));
      prepend(
        s,
        fx("immediateAttack", { target: u.id, player: next }),
        fx("morgulResume", { player: original }),
      );
      break;
    }
    case "morgulResume":
      break;
    case "morgulShadowChoice":
      choose(s, "Morgul Sorcerer · Shadow", [
        {
          id: "progress",
          label: "Place 1 progress on To the Tower",
          effects: [fx("morgulProgress", { value: 1 })],
        },
        {
          id: "undefended",
          label: "Treat this attack as undefended",
          effects: [fx("morgulUndefended")],
        },
      ]);
      break;
    case "morgulUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
      }
      break;
    case "morgulStage": {
      const codes = s.stage === 2 ? [M.alcaron] : [M.nazgul, M.bridge];
      for (const code of codes) {
        s.morgulVale!.setAside = s.morgulVale!.setAside.filter(
          (c) => c !== code,
        );
        placeEncounter(s, code);
      }
      prepend(
        s,
        ...(s.stage === 3
          ? playerOrder(s).map(() => fx("reveal", { player: first(s) }))
          : []),
        fx("morgulStageReady"),
      );
      break;
    }
    case "morgulStageReady":
      s.stageRevealing = false;
      break;
    case "morgulMurzag": {
      const code = encounterDraw(s);
      if (!code) break;
      // All cards are revealed. Remember the pre-reveal identities so an existing duplicate is never engaged.
      if (card(code).type_code === "enemy")
        prepend(
          s,
          fx("morgulMurzagEngage", {
            code,
            ids: enemies(s).map((u) => u.id),
            player: activeSeat(s),
          }),
        );
      revealed(s, code);
      break;
    }
    case "morgulMurzagEngage": {
      const fresh = s.staging.find(
        (u) => u.code === e.code && !e.ids?.includes(u.id),
      );
      if (fresh) engage(s, fresh);
      break;
    }
    case "morgulFog":
      choose(s, "Impenetrable Fog", [
        {
          id: "progress",
          label: "Place 3 progress on To the Tower",
          effects: [fx("morgulProgress", { value: 3 })],
        },
        {
          id: "reveal",
          label: `Reveal ${playerOrder(s).length} encounter cards`,
          effects: playerOrder(s).map(() => fx("reveal")),
        },
      ]);
      break;
    case "morgulMalice":
      choose(s, "Sleepless Malice", [
        ...(s.hand.length >= 3
          ? [
              {
                id: "discard",
                label: "Discard 3 random cards",
                effects: [fx("morgulDiscardThree")],
              },
            ]
          : []),
        {
          id: "progress",
          label: "Place 1 progress on To the Tower",
          effects: [fx("morgulProgress", { value: 1 })],
        },
      ]);
      break;
    case "morgulDiscardThree":
      for (let n = 0; n < 3 && s.hand.length; n++)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      break;
    case "morgulReturnChoice":
      if (s.engaged.length)
        choose(
          s,
          "Morgul Vale · Return an enemy to staging",
          opts(s.engaged, (u) => [fx("morgulReturn", { target: u.id })]),
        );
      break;
    case "morgulReturn":
      if (u) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((e) => e.id !== u.id);
        });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    case "morgulRoad":
      choose(s, "Morgul Road · Response", [
        ...(morgulTowerProgress(s)
          ? [
              {
                id: "reduce",
                label: "Remove 1 progress from To the Tower",
                effects: [fx("morgulReduce")],
              },
            ]
          : []),
        ...opts(enemies(s), (u) => [fx("damage", { target: u.id, value: 1 })]),
        skip,
      ]);
      break;
    case "morgulReduce": {
      const t = tower(s);
      if (t) t.progress = Math.max(0, t.progress - 1);
      break;
    }
    case "morgulRedirectChoice": {
      if (!u) break;
      const guards = enemies(s).filter(
        (g) => g.code === M.bodyguard && !g.blanked,
      );
      const amount = e.value ?? 0,
        context = readDamageContext(e),
        attackers = e.ids;
      if (!guards.length) {
        damage(s, u.id, amount, context);
        break;
      }
      const options = guards.flatMap((g) => {
        const amounts =
          u.code === M.nazgul && !u.blanked && amount > 1
            ? [amount, 1]
            : [amount];
        return amounts.map((value) => ({
          id: `${g.id}:${value}`,
          code: g.code,
          label: `${name(g)} · ${value} damage${amounts.length > 1 ? (value === 1 ? " (reduce, then redirect)" : " (redirect first)") : ""}`,
          effects: [
            fx("morgulRedirect", {
              target: g.id,
              source: u.id,
              value,
              ids: attackers,
              text: encodeDamageContext(context),
            }),
          ],
        }));
      });
      choose(s, "Morgul Bodyguard · Redirect damage", options);
      break;
    }
    case "morgulRedirect": {
      if (!u) break;
      const remaining = stats(s, u).health - u.damage,
        traits = effectiveTraits(u),
        p = ownerOf(s, u);
      const amount = e.value ?? 0;
      if (damage(s, u.id, amount, readDamageContext(e)) && e.ids?.length) {
        if (!get(s, u.id)) playerAttackKilled(s, u, e.ids, p, traits);
        playerAttackResolved(s, u, e.ids, amount, remaining);
      }
      break;
    }
  }
  return true;
}
