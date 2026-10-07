// Encounter at Amon Dîn: exact optional responses and lasting permissions.
import { card, name, plain } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
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
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  raiseThreat,
  spendEvent,
} from "./board";
import {
  firstPlayer,
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { engagedEnemies } from "./considered-engagement";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { shadowFlameCanMove } from "./shadow-flame";
import { roadRivendellCannotCancel } from "./road-rivendell";
import { applyCombatDamageConsequences } from "./combat";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import {
  eventReplayPayments,
  needsTarget,
  playEventFromDiscardEffect,
  playTargets,
  replayEventProblem,
} from "./actions";

const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const marker = (s: GameState, key: string) =>
  playerOrder(s).some((p) => seatView(s, p).used.includes(key));
const allHobbits = (s: GameState, player = activeSeat(s)) => {
  const heroes = seatView(s, player).heroes;
  return heroes.length > 0 && heroes.every((h) => hasTrait(h, "Hobbit"));
};
const monoLeadership = (s: GameState, player = activeSeat(s)) => {
  const heroes = seatView(s, player).heroes;
  return (
    heroes.length > 0 &&
    heroes.every((h) => card(h.code).sphere_code === "leadership")
  );
};
const movableEngaged = (s: GameState, enemy: Unit) =>
  allEngaged(s).some((u) => u.id === enemy.id) &&
  !immune(enemy) &&
  shadowFlameCanMove(s, enemy);
export const AMON_ATTACHMENT_ACTIONS = ["06059"];
const bookAttachment = (s: GameState, u: Unit, attachmentId?: string) =>
  u.attachments.find(
    (a) =>
      a.id === attachmentId &&
      a.code === "06059" &&
      !a.blanked &&
      !a.facedown &&
      attachmentController(s, u, a) === activeSeat(s),
  );
function bookEvents(s: GameState) {
  return s.discard
    .map((code, index) => ({
      index,
      unit: { ...s.heroes[0], id: `amon-discard-${index}`, code } as Unit,
    }))
    .filter(
      ({ unit }) =>
        card(unit.code).sphere_code === "tactics" &&
        card(unit.code).type_code === "event" &&
        !replayEventProblem(s, unit),
    );
}
export const amonPlayerAbilityLabel = (code: string) =>
  code === "06059" ? "Discard Book · play a Tactics event" : undefined;
export function amonPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (!u.attachments.some((a) => a.id === attachmentId && a.code === "06059"))
    return undefined;
  if (!bookAttachment(s, u, attachmentId))
    return "This Book must be faceup, unblanked and controlled by you.";
  if (!bookEvents(s).length)
    return "Your discard pile needs a Tactics event that can be played and paid for now.";
  return undefined;
}
export function useAmonPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!u.attachments.some((a) => a.id === attachmentId && a.code === "06059"))
    return false;
  requireRule(
    !amonPlayerAbilityProblem(s, u, attachmentId),
    amonPlayerAbilityProblem(s, u, attachmentId) ?? "",
  );
  choose(
    s,
    "Book of Eldacar · Tactics event",
    [
      ...bookEvents(s).map(({ index, unit }) => ({
        id: `discard-${index}`,
        label: card(unit.code).name,
        code: unit.code,
        effects: [
          fx("amonBookTarget", {
            source: u.id,
            text: attachmentId,
            code: unit.code,
            value: index,
          }),
        ],
      })),
      skip,
    ],
    "Choose an event, legal targets and its normal payment. The Book is discarded as the cost, then this physical event goes to the bottom of your deck.",
  );
  return true;
}

export function amonPlayerStats(s: GameState, u: Unit) {
  return {
    will:
      u.code === "06057" && !u.blanked
        ? -seatView(s, ownerOf(s, u)).heroes.filter((h) => h.damage > 0).length
        : 0,
    attack: 0,
    defense: 0,
  };
}
/** This is a discard condition, not damage or character destruction. */
export const amonPlayerDiscardAtZero = (s: GameState): Unit[] =>
  allCharacters(s).filter(
    (u) => u.code === "06057" && !u.blanked && stats(s, u).will <= 0,
  );
export function amonPlayerCost(s: GameState, c: Card, cost: number): number {
  return c.code === "06059"
    ? Math.max(
        0,
        cost -
          s.heroes.filter((h) => card(h.code).sphere_code === "tactics").length,
      )
    : cost;
}
export function amonPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "06060")
    return "Gondorian Discipline responds to damage just dealt; use its response window.";
  if (code === "06062")
    return "Small Target responds to your Hobbit hero exhausting to defend; use its response window.";
  if (code === "06065" && !allHobbits(s))
    return "Hobbit-sense requires every hero you control to be a Hobbit.";
  if (code === "06065" && !["defense", "attack"].includes(s.phase))
    return "Hobbit-sense is a Combat Action.";
  return null;
}
export const amonPlayerPlayTargets = (
  _s: GameState,
  code: string,
): Unit[] | null => (code === "06064" ? [] : null);
export function amonPlayerEventEffect(s: GameState, code: string): boolean {
  if (code !== "06065") return false;
  requireRule(
    !amonPlayerPlayProblem(s, code),
    amonPlayerPlayProblem(s, code) ?? "",
  );
  s.used.push(`round:hobbit-sense-declaration:${activeSeat(s)}`);
  for (const enemy of engagedEnemies(s))
    s.used.push(`round:hobbit-sense-enemy:${enemy.id}:${activeSeat(s)}`);
  return true;
}
export const amonPlayerCannotDeclareAttack = (
  s: GameState,
  player = activeSeat(s),
) => marker(s, `round:hobbit-sense-declaration:${player}`);
export const amonPlayerEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) => marker(s, `round:hobbit-sense-enemy:${enemy.id}:${player}`);
export const amonPlayerCanEngage = (
  s: GameState,
  enemy: Unit,
  player: number,
) => !marker(s, `round:pippin:${enemy.id}:${player}`);

export function amonPlayerEnemyEngaged(s: GameState, enemy: Unit) {
  const player = ownerOf(s, enemy),
    p = seatView(s, player);
  if (!allHobbits(s, player) || !movableEngaged(s, enemy)) return;
  prepend(
    s,
    ...p.heroes
      .filter((h) => h.code === "06056" && !h.blanked && !isSacked(h))
      .map((h) =>
        fx("amonPippinResponse", { source: h.id, target: enemy.id, player }),
      ),
  );
}
/** Playing from a deck also qualifies; putting an ally into play does not. */
export function amonPlayerAllyEntered(
  s: GameState,
  ally: Unit,
  played: boolean,
) {
  const player = ownerOf(s, ally);
  if (
    !played ||
    !["lore", "spirit", "tactics"].includes(card(ally.code).sphere_code) ||
    !monoLeadership(s, player)
  )
    return;
  prepend(
    s,
    ...allCharacters(s).flatMap((host) =>
      host.attachments
        .filter(
          (a) =>
            a.code === "06058" &&
            !a.blanked &&
            !a.facedown &&
            attachmentController(s, host, a) === player,
        )
        .map((a) =>
          fx("amonMorthondResponse", { source: host.id, text: a.id, player }),
        ),
    ),
  );
}
export function amonPlayerSpecialAttachmentEntry(
  s: GameState,
  u: Unit,
): boolean {
  if (u.code !== "06064") return false;
  u.owner ??= activeSeat(s);
  s.staging.push(u);
  return true;
}
export function amonPlayerEnemyAddedToStaging(s: GameState, enemy: Unit) {
  if (
    card(enemy.code).type_code !== "enemy" ||
    immune(enemy) ||
    (!enemy.blanked &&
      /cannot have attachments/i.test(plain(card(enemy.code).text)))
  )
    return;
  for (const trap of [...s.staging].filter(
    (u) => u.code === "06064" && !u.blanked,
  )) {
    s.staging = s.staging.filter((u) => u.id !== trap.id);
    enemy.attachments.push({
      id: trap.id,
      code: trap.code,
      owner: trap.owner ?? activeSeat(s),
      exhausted: trap.exhausted,
    });
  }
}
export const amonPlayerCanAttackEnemy = (
  _s: GameState,
  enemy: Unit,
  _u?: Unit,
) =>
  enemy.attachments.some(
    (a) => a.code === "06064" && !a.blanked && !a.facedown,
  );
export function amonPlayerAttackResolved(
  s: GameState,
  enemy: Unit,
  ids: string[],
  amount: number,
) {
  if (amount <= 0 || !get(s, enemy.id) || !movableEngaged(s, enemy)) return;
  prepend(
    s,
    ...ids
      .map((id) => get(s, id))
      .filter(
        (u): u is Unit =>
          !!u && u.code === "06063" && !u.blanked && !isSacked(u),
      )
      .map((u) =>
        fx("amonArcherResponse", {
          source: u.id,
          target: enemy.id,
          player: ownerOf(s, u),
        }),
      ),
  );
}
function returnEnemy(s: GameState, enemy: Unit) {
  requireRule(
    movableEngaged(s, enemy),
    "This enemy cannot be returned to staging by a player card.",
  );
  forOwner(s, ownerOf(s, enemy), () => {
    s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
  });
  s.encounterDiscard.push(...enemy.shadows);
  enemy.shadows = [];
  delete enemy.faceupShadows;
  enemy.revealedShadowCount = 0;
  s.staging.push(enemy);
  enemyAddedToStaging(s, enemy);
}

/** Cancellation occurs before lethal damage, redirects, and after-damage responses. */
export function offerGondorianDiscipline(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext = {},
): boolean {
  if (
    context.bypassDiscipline ||
    value <= 0 ||
    !["hero", "ally", "objective-ally"].includes(card(target.code).type_code) ||
    !hasTrait(target, "Gondor")
  )
    return false;
  if (
    !context.enemyId &&
    (roadRivendellCannotCancel(s) ||
      allActiveLocations(s).some((u) => u.code === "02016"))
  )
    return false;
  if (!playerOrder(s).some((p) => disciplineCopies(s, p).length)) return false;
  prepend(
    s,
    fx("amonDisciplineWindow", {
      target: target.id,
      value,
      text: encodeDamageContext(context),
      player: firstPlayer(s),
    }),
  );
  return true;
}
function disciplineCopies(s: GameState, player: number) {
  const p = seatView(s, player);
  return canPay(p, card("06060"))
    ? p.hand.filter((u) => u.code === "06060")
    : [];
}
function resumeDamage(
  s: GameState,
  e: Effect,
  value: number,
  context: DamageContext,
) {
  const target = get(s, e.target);
  if (!target) return;
  if (value <= 0) {
    check(s);
    return;
  }
  const remaining = stats(s, target).health - target.damage,
    enemy = get(s, context.enemyId);
  if (damage(s, target.id, value, context) && enemy && context.combatDamage)
    applyCombatDamageConsequences(s, target, enemy, value, remaining);
}

/** Only actual ready-to-exhaust transitions from defense create this Response. */
export function amonPlayerDefendersExhausted(
  s: GameState,
  enemy: Unit,
  ids: string[],
) {
  if (
    immune(enemy) ||
    !enemy.shadows.some((_code, i) => i >= (enemy.revealedShadowCount ?? 0))
  )
    return;
  for (const id of ids) {
    const hero = get(s, id);
    if (
      !hero ||
      card(hero.code).type_code !== "hero" ||
      !hasTrait(hero, "Hobbit")
    )
      continue;
    const player = ownerOf(s, hero),
      p = seatView(s, player);
    if (
      p.hand.some((u) => u.code === "06062") &&
      canPay(p, card("06062")) &&
      smallTargets(s, enemy, player).length
    )
      prepend(
        s,
        fx("amonSmallResponse", { source: hero.id, target: enemy.id, player }),
      );
  }
}
function smallTargets(s: GameState, enemy: Unit, player = activeSeat(s)) {
  return engagedEnemies(s, player).filter(
    (u) => u.id !== enemy.id && !immune(u),
  );
}
/** Consume the redirect for this single attack, even if the chosen enemy has left play. */
export function amonPlayerEnemyAttackTarget(
  s: GameState,
  enemy: Unit,
): Unit | null | undefined {
  const prefix = `phase:small-target:${enemy.id}:`;
  for (const player of playerOrder(s)) {
    const p = seatView(s, player),
      key = p.used.find((k) => k.startsWith(prefix));
    if (key) {
      p.used.splice(p.used.indexOf(key), 1);
      return get(s, key.slice(prefix.length)) ?? null;
    }
  }
  return undefined;
}
export function amonPlayerSurgeRevealed(s: GameState, revealed: Unit) {
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.code === "06061" && !u.blanked && !isSacked(u))
      .map((u) =>
        fx("amonLampwrightResponse", {
          source: u.id,
          target: revealed.id,
          player: ownerOf(s, u),
        }),
      ),
  );
}
/** A named next reveal is consumed even if it has a different card type. */
export function amonPlayerInterceptReveal(s: GameState, code: string): boolean {
  const names = playerOrder(s).flatMap((p) =>
    seatView(s, p)
      .used.filter((k) => k.startsWith("game:lampwright-next:"))
      .map((k) => k.split(":").at(-1)!),
  );
  for (const p of playerOrder(s)) {
    const view = seatView(s, p);
    for (let i = view.used.length - 1; i >= 0; i--)
      if (view.used[i].startsWith("game:lampwright-next:"))
        view.used.splice(i, 1);
  }
  if (!names.includes(card(code).type_code)) return false;
  s.encounterDiscard.push(code);
  log(
    s,
    `Minas Tirith Lampwright discards ${card(code).name} without resolving its effects.`,
  );
  return true;
}

export function handleAmonPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "amonBookTarget": {
      const host = get(s, e.source),
        entry = bookEvents(s).find(
          (entry) => entry.index === e.value && entry.unit.code === e.code,
        );
      requireRule(
        host && bookAttachment(s, host, e.text) && entry,
        "The Book and selected legal discard event must remain available.",
      );
      if (needsTarget(entry.unit))
        choose(
          s,
          "Book of Eldacar · Event target",
          playTargets(s, entry.unit)
            .filter((target) => !replayEventProblem(s, entry.unit, target.id))
            .map((target) => ({
              id: target.id,
              label: name(target),
              code: target.code,
              effects: [{ ...e, kind: "amonBookPayment", target: target.id }],
            })),
        );
      else prepend(s, { ...e, kind: "amonBookPayment" });
      return true;
    }
    case "amonBookPayment": {
      const host = get(s, e.source),
        entry = bookEvents(s).find(
          (entry) => entry.index === e.value && entry.unit.code === e.code,
        );
      requireRule(
        host &&
          bookAttachment(s, host, e.text) &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target),
        "Choose a legal discard event and target.",
      );
      const payments = eventReplayPayments(s, entry.unit, e.target);
      choose(
        s,
        "Book of Eldacar · Pay event cost",
        payments.map((payment, index) => ({
          id: `pay-${index}`,
          label:
            Object.entries(payment)
              .map(([id, amount]) => `${amount} from ${name(get(s, id)!)}`)
              .join(" + ") || "Play at printed cost 0",
          effects: [
            {
              ...e,
              kind: "amonBookPlay",
              ids: Object.entries(payment).map(
                ([id, amount]) => `${id}=${amount}`,
              ),
            },
          ],
        })),
      );
      return true;
    }
    case "amonBookPlay": {
      const host = get(s, e.source),
        book = host && bookAttachment(s, host, e.text),
        entry = bookEvents(s).find(
          (entry) => entry.index === e.value && entry.unit.code === e.code,
        );
      requireRule(
        host && book && entry && !replayEventProblem(s, entry.unit, e.target),
        "The Book, event and target must still be legal.",
      );
      const payment = Object.fromEntries(
        (e.ids ?? []).map((value) => {
          const split = value.lastIndexOf("=");
          return [value.slice(0, split), Number(value.slice(split + 1))];
        }),
      );
      requireRule(
        eventReplayPayments(s, entry.unit, e.target).some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(payment),
        ),
        "Choose the event's complete legal payment.",
      );
      discardAttachment(s, host, book);
      playEventFromDiscardEffect(s, entry.index, {
        target: e.target,
        payment,
        bottom: true,
      });
      return true;
    }
    case "amonPippinResponse": {
      const pippin = get(s, e.source),
        enemy = get(s, e.target);
      if (
        !pippin ||
        pippin.blanked ||
        isSacked(pippin) ||
        !allHobbits(s) ||
        !enemy ||
        !movableEngaged(s, enemy)
      )
        return true;
      choose(s, "Pippin · Return engaged enemy", [
        {
          id: "return",
          label: `Raise threat by 3 · return ${name(enemy)} to staging`,
          code: pippin.code,
          effects: [{ ...e, kind: "amonPippinReturn" }],
        },
        skip,
      ]);
      return true;
    }
    case "amonPippinReturn": {
      const pippin = get(s, e.source),
        enemy = get(s, e.target);
      requireRule(
        pippin &&
          !pippin.blanked &&
          !isSacked(pippin) &&
          allHobbits(s) &&
          enemy &&
          movableEngaged(s, enemy),
        "Pippin needs an all-Hobbit fellowship and a movable engaged enemy.",
      );
      const player = activeSeat(s);
      raiseThreat(s, 3, "cost");
      check(s);
      if (s.status !== "playing" || s.table?.seats[player].eliminated)
        return true;
      s.used.push(`round:pippin:${enemy.id}:${player}`);
      returnEnemy(s, enemy);
      return true;
    }
    case "amonArcherResponse": {
      const archer = get(s, e.source),
        enemy = get(s, e.target);
      if (!archer || archer.blanked || !enemy || !movableEngaged(s, enemy))
        return true;
      choose(s, "Ithilien Archer · Enemy damaged", [
        {
          id: "return",
          label: `Return ${name(enemy)} to staging`,
          code: archer.code,
          effects: [{ ...e, kind: "amonArcherReturn" }],
        },
        skip,
      ]);
      return true;
    }
    case "amonArcherReturn": {
      const enemy = get(s, e.target);
      requireRule(
        enemy && movableEngaged(s, enemy),
        "The damaged enemy must remain engaged and movable.",
      );
      returnEnemy(s, enemy);
      return true;
    }
    case "amonMorthondResponse": {
      const host = get(s, e.source),
        a = host?.attachments.find(
          (a) =>
            a.id === e.text && a.code === "06058" && !a.blanked && !a.facedown,
        );
      if (!a || !monoLeadership(s) || !s.deck.length) return true;
      choose(s, "Lord of Morthond · Ally played", [
        {
          id: "draw",
          label: "Draw 1 card",
          code: a.code,
          effects: [fx("draw", { value: 1 })],
        },
        skip,
      ]);
      return true;
    }
    case "amonDisciplineWindow": {
      if (!get(s, e.target)) return true;
      choose(s, `Gondorian Discipline · ${e.value} damage assigned`, [
        ...playerOrder(s).flatMap((player) =>
          disciplineCopies(s, player).map((copy) => ({
            id: copy.id,
            label: `${card(copy.code).name} · cancel up to ${Math.min(2, e.value ?? 0)} damage`,
            code: copy.code,
            effects: [
              { ...e, kind: "amonDisciplineAmount", source: copy.id, player },
            ],
          })),
        ),
        {
          id: "skip",
          label: "Continue without canceling damage",
          effects: [{ ...e, kind: "amonDisciplineSkip" }],
        },
      ]);
      return true;
    }
    case "amonDisciplineAmount":
      choose(
        s,
        "Gondorian Discipline · Damage to cancel",
        Array.from({ length: Math.min(2, e.value ?? 0) }, (_, i) => ({
          id: `cancel-${i + 1}`,
          label: `Cancel ${i + 1} damage`,
          effects: [{ ...e, kind: "amonDisciplinePlay", count: i + 1 }],
        })),
      );
      return true;
    case "amonDisciplinePlay": {
      const copy = disciplineCopies(s, activeSeat(s)).find(
          (u) => u.id === e.source,
        ),
        target = get(s, e.target),
        amount = e.count ?? 0;
      requireRule(
        copy &&
          target &&
          hasTrait(target, "Gondor") &&
          amount > 0 &&
          amount <= Math.min(2, e.value ?? 0),
        "Choose a legal Discipline copy and up to 2 damage to cancel.",
      );
      const resolved = spendEvent(s, "06060", copy.id),
        context = readDamageContext(e);
      // A canceled copy still leaves the damage pending for other players' copies.
      resumeDamage(s, e, (e.value ?? 0) - (resolved ? amount : 0), context);
      return true;
    }
    case "amonDisciplineSkip":
      resumeDamage(s, e, e.value ?? 0, {
        ...readDamageContext(e),
        bypassDiscipline: true,
      });
      return true;
    case "amonSmallResponse": {
      const enemy = get(s, e.target),
        hero = get(s, e.source);
      if (
        !enemy ||
        !hero ||
        !s.hand.some((u) => u.code === "06062") ||
        !canPay(s, card("06062")) ||
        !smallTargets(s, enemy).length
      )
        return true;
      choose(s, "Small Target · Hobbit hero defended", [
        ...opts(smallTargets(s, enemy), (target) => [
          { ...e, kind: "amonSmallPlay", source: target.id },
        ]),
        skip,
      ]);
      return true;
    }
    case "amonSmallPlay": {
      const enemy = get(s, e.target),
        target = smallTargets(s, enemy ?? ({ id: "" } as Unit)).find(
          (u) => u.id === e.source,
        );
      requireRule(enemy && target, "Choose another enemy engaged with you.");
      if (!spendEvent(s, "06062")) return true;
      // Revealing for inspection is not resolving this printed shadow effect twice.
      const index = enemy.revealedShadowCount ?? 0,
        code = enemy.shadows[index];
      requireRule(
        code,
        "The attacking enemy needs an unrevealed physical shadow card.",
      );
      enemy.revealedShadowCount = index + 1;
      log(
        s,
        `Small Target reveals ${card(code).name}${card(code).shadow ? " with a shadow effect" : " without a shadow effect"}.`,
      );
      if (!card(code).shadow)
        s.used.push(`phase:small-target:${enemy.id}:${target.id}`);
      else prepend(s, fx("shadowResponse", { code }));
      return true;
    }
    case "amonLampwrightResponse": {
      const lamp = get(s, e.source);
      if (lamp?.code !== "06061" || lamp.blanked || isSacked(lamp)) return true;
      choose(s, "Minas Tirith Lampwright · Card with surge revealed", [
        ...["enemy", "location", "treachery"].map((type) => ({
          id: type,
          label: `Discard Lampwright · name ${type}`,
          effects: [{ ...e, kind: "amonLampwrightName", text: type }],
        })),
        skip,
      ]);
      return true;
    }
    case "amonLampwrightName": {
      const lamp = get(s, e.source);
      requireRule(
        lamp?.code === "06061" &&
          !lamp.blanked &&
          ["enemy", "location", "treachery"].includes(e.text ?? ""),
        "Name an encounter card type and discard your Lampwright.",
      );
      discardCharacter(s, lamp);
      s.used.push(`game:lampwright-next:${s.nextId++}:${e.text}`);
      return true;
    }
    default:
      return false;
  }
}
