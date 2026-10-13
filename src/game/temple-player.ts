import { TEMPLE_PLAYER as P } from "./temple-player-support";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name, plain } from "./cards";
import {
  canPay,
  cannotReady,
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  requireRule,
  skip,
  spendResources,
  units,
} from "./core";
import { damage, progressLocation, readyCharacter } from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  eachArea,
  firstPlayer,
  forOwner,
  hasKeyword,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { isHero } from "./card-types";
import { engagedEnemies } from "./considered-engagement";
import {
  attachmentHasTrait,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { isSacked } from "./carrock";
import { heirsCanSpendResources } from "./heirs-numenor";
import { choosePlayerResponse } from "./player-ability-triggers";

const PHASE = "phase:temple:";
const CHECKS_DONE = PHASE + "engagement-checks-done";
const ENGAGED = PHASE + "enemy-engaged";
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const affected = (u: Unit) => !playerCardImmune(u);
const usable = (u: Unit) => !u.blanked && !isSacked(u) && affected(u);
const enemy = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code);
const allUsed = (s: GameState) =>
  seatIndices(s).flatMap((p) => seatView(s, p).used);
const marked = (s: GameState, key: string) => allUsed(s).includes(key);
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const payerHeroes = (s: GameState, sphere: string, player?: number) =>
  allHeroes(s).filter(
    (h) =>
      (player === undefined || ownerOf(s, h) === player) &&
      h.resources > 0 &&
      hasResourceIcon(h, sphere) &&
      heirsCanSpendResources(seatView(s, ownerOf(s, h)), h),
  );
const stagingEnemies = (s: GameState) =>
  s.staging.filter((u) => enemy(u) && affected(u));
// Progress prevention does not make a nonimmune staging location an illegal target.
// Its independent "If" clause still grants willpower when no exploration occurs.
const outriderTargets = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "location" && affected(u));

/** Actual cost responses finish before the ability's dependent effects. */
function payThen(s: GameState, cost: () => void, effects: Effect[]) {
  const continuation = s.queue;
  s.queue = [];
  cost();
  s.queue.push(...effects, ...continuation);
}
const eventOption = (
  s: GameState,
  u: Unit,
  effects: Effect[],
  type: "action" | "response" = "response",
): Option => ({
  id: u.id,
  code: u.code,
  label: `Play ${name(u)}`,
  ability: { player: activeSeat(s), source: u.id, code: u.code, type },
  effects: [
    fx("eventPlay", {
      code: u.code,
      source: u.id,
      player: activeSeat(s),
      effects,
    }),
  ],
});
const affordableCopies = (s: GameState, code: string) =>
  s.hand.filter(
    (u) =>
      u.code === code &&
      canPay(s, { ...card(code), playOwner: u.owner ?? activeSeat(s) }),
  );

export function templePlayerStats(s: GameState, u: Unit) {
  const elfhelm =
    isHero(u) &&
    affected(u) &&
    u.attachments.some((a) => attachmentHasTrait(a, "Mount")) &&
    allCharacters(s).some(
      (h) => h.code === P.elfhelm && !h.blanked && !isSacked(h),
    );
  const nets = u.attachments.filter(
    (a) => a.code === P.nets && enabled(a),
  ).length;
  return {
    threat: 0,
    will: elfhelm && hasResourceIcon(u, "spirit") ? 1 : 0,
    attack: (elfhelm && hasResourceIcon(u, "tactics") ? 1 : 0) - 2 * nets,
    defense: (elfhelm && hasResourceIcon(u, "leadership") ? 1 : 0) - 2 * nets,
  };
}
export function templePlayerBlanked(s: GameState, u: Unit) {
  return marked(s, PHASE + "wrath:" + u.id);
}
export function templePlayerPhaseEnd(s: GameState) {
  for (const p of seatIndices(s)) {
    const view = seatView(s, p);
    view.used.splice(
      0,
      view.used.length,
      ...view.used.filter((key) => !key.startsWith(PHASE)),
    );
  }
}
export function templePlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.destrier)
    return allHeroes(s).filter(
      (h) =>
        affected(h) &&
        (hasResourceIcon(h, "leadership") || hasKeyword(h, "Sentinel")),
    );
  if (code === P.wrath)
    return units(s).filter(
      (u) => enemy(u) && !card(u.code).is_unique && affected(u),
    );
  if (code === P.nets) return [];
  return undefined;
}
export function templePlayerPlayProblem(
  s: GameState,
  u: Unit,
  _origin: "hand" | "deck" | "discard" = "hand",
) {
  if (u.code === P.party)
    return "Scouting Party is offered after committing a nonempty company of Scouts.";
  if (u.code === P.wrath) {
    if (
      !allHeroes(s).some(
        (h) => ownerOf(s, h) === activeSeat(s) && hasTrait(h, "Noldor"),
      )
    )
      return "Revealed in Wrath requires a Noldor hero you control.";
    if (!templePlayerPlayTargets(s, P.wrath)!.length)
      return "Choose a non-unique enemy that can be affected by player cards.";
  }
  if (u.code === P.arrows) {
    if (s.phase !== "encounter" || !templePlayerEngagementChecksComplete(s))
      return "Arrows from the Trees can be played only after making engagement checks.";
    if (marked(s, ENGAGED)) return "An enemy was engaged this phase.";
    if (!stagingEnemies(s).length)
      return "There is no staging enemy that can take this player-card damage.";
  }
  return null;
}
export const templePlayerAbilityAnyPlayer = (code: string) => code === P.ceorl;
export function templePlayerAbilityLabel(code: string): string | undefined {
  if (code === P.ceorl)
    return "Spend 1 Spirit resource · Ready Ceorl · Once per phase";
  return undefined;
}
export function templePlayerAbilityProblem(
  s: GameState,
  u: Unit,
  _attachmentId?: string,
) {
  if (u.code !== P.ceorl) return null;
  if (!usable(u)) return "Ceorl's printed Action is unavailable.";
  if (marked(s, PHASE + "ceorl:" + u.id))
    return "This Ceorl has already acted this phase.";
  if (!u.exhausted || cannotReady(u, s))
    return "Ceorl must be exhausted and able to ready.";
  if (!payerHeroes(s, "spirit", activeSeat(s)).length)
    return "You need a spendable Spirit resource.";
  return null;
}
export function useTemplePlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (u.code !== P.ceorl || attachmentId) return false;
  const problem = templePlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  choose(
    s,
    "Ceorl · Spend 1 Spirit resource",
    payerHeroes(s, "spirit", activeSeat(s)).map((h) =>
      option(h, [
        fx("templePlayerCeorlPay", {
          source: u.id,
          target: h.id,
          owner: ownerOf(s, u),
        }),
      ]),
    ),
    "Any player may pay from a Spirit hero they control. Ceorl keeps his physical owner.",
  );
  return true;
}
export function templePlayerSpecialAttachmentEntry(s: GameState, u: Unit) {
  if (u.code !== P.nets) return false;
  requireRule(
    !s.staging.some((x) => x.id === u.id),
    "The same physical Nets are already in staging.",
  );
  u.owner ??= activeSeat(s);
  s.staging.push(u);
  return true;
}
export function templePlayerEnemyEntered(s: GameState, u: Unit) {
  if (
    !enemy(u) ||
    !s.staging.some((x) => x.id === u.id) ||
    !affected(u) ||
    (!u.blanked &&
      /cannot (?:have|be given) attachments/i.test(plain(card(u.code).text)))
  )
    return;
  for (const trap of s.staging.filter((x) => x.code === P.nets && !x.blanked)) {
    s.staging = s.staging.filter((x) => x.id !== trap.id);
    u.attachments.push({
      id: trap.id,
      code: trap.code,
      owner: trap.owner ?? activeSeat(s),
      exhausted: trap.exhausted,
      ...(trap.controller === undefined ? {} : { controller: trap.controller }),
    });
    log(s, `Entangling Nets attaches to ${name(u)}.`, "good");
  }
}
export function templePlayerEvent(s: GameState, code: string, target?: string) {
  if (code === P.wrath) {
    const u = get(s, target);
    requireRule(
      u && templePlayerPlayTargets(s, code)!.some((x) => x.id === u.id),
      "Choose an eligible non-unique enemy.",
    );
    s.used.push(PHASE + "wrath:" + u.id);
    log(
      s,
      `${name(u)}'s printed text is blank until the phase ends; its Traits remain.`,
      "good",
    );
    return true;
  }
  if (code === P.arrows) {
    prepend(
      s,
      fx("templePlayerArrowsDamage", {
        value: 1,
        effects: [fx("templePlayerArrowsGroupOffer")],
      }),
    );
    return true;
  }
  return false;
}

export function templePlayerCharactersCommitted(
  s: GameState,
  committed: Unit[],
) {
  const effects = committed
    .filter((u) => u.code === P.outrider && usable(u))
    .map((u) =>
      fx("templePlayerOutriderOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  for (const player of new Set(committed.map((u) => ownerOf(s, u))))
    if (scoutingGroup(s, player).length)
      effects.push(fx("templePlayerPartyOffer", { player }));
  prepend(s, ...effects);
}
function scoutingGroup(s: GameState, player = activeSeat(s)) {
  const group = allCharacters(s).filter(
    (u) => ownerOf(s, u) === player && u.committed,
  );
  return group.length && group.every((u) => hasTrait(u, "Scout")) ? group : [];
}

/** Capture Sentinel's defending seat before generic combat cleanup restores the actor. */
export function templePlayerAfterDefense(
  s: GameState,
  enemyId: string,
  defenderIds: string[],
  attackPlayer: number,
) {
  const effects: Effect[] = [];
  for (const id of defenderIds) {
    const hero = get(s, id);
    if (
      !hero ||
      !isHero(hero) ||
      !hero.exhausted ||
      cannotReady(hero, s) ||
      !affected(hero)
    )
      continue;
    for (const a of hero.attachments.filter(
      (a) => a.code === P.destrier && enabled(a) && !a.exhausted,
    ))
      effects.push(
        fx("templePlayerDestrierOffer", {
          source: hero.id,
          target: a.id,
          text: enemyId,
          owner: attackPlayer,
          player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
        }),
      );
  }
  prepend(s, ...effects);
}
export function templePlayerShadowOptions(
  s: GameState,
  code: string,
  hasText: boolean,
): Option[] {
  if (!hasText || !s.combat) return [];
  const defenders =
    s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : []);
  const deorwine = defenders
    .map((id) => get(s, id))
    .find((u) => u?.code === P.deorwine && usable(u));
  if (!deorwine) return [];
  return playerOrder(s).flatMap((player) =>
    payerHeroes(s, "leadership", player).map((h) => ({
      id: `temple-deorwine-${h.id}`,
      code: P.deorwine,
      label: `Déorwine · Spend 1 Leadership from ${name(h)} · ${seatName(s, player)}`,
      ability: {
        player,
        source: deorwine.id,
        code: P.deorwine,
        type: "response" as const,
      },
      effects: [
        fx("templePlayerDeorwinePay", {
          source: deorwine.id,
          target: h.id,
          code,
          player,
        }),
      ],
    })),
  );
}

export function templePlayerEngaged(s: GameState, _u: Unit) {
  if (s.phase === "encounter" && !marked(s, ENGAGED)) s.used.push(ENGAGED);
}
export const templePlayerEngagementChecksComplete = (s: GameState) =>
  marked(s, CHECKS_DONE);
export function templePlayerEngagementChecksDone(s: GameState) {
  if (!marked(s, CHECKS_DONE)) s.used.push(CHECKS_DONE);
}
/** The engine inserts this continuation after all checks and before ending the phase. */
export function templePlayerAfterEngagementChecks(s: GameState) {
  templePlayerEngagementChecksDone(s);
  if (marked(s, ENGAGED)) return false;
  const windows: Effect[] = [];
  eachArea(s, () =>
    windows.push(fx("templePlayerArrowsWindow", { player: firstPlayer(s) })),
  );
  prepend(s, ...windows);
  return true;
}
export function templePlayerSharedEffect(e: Effect) {
  return [
    "templePlayerArrowsDamage",
    "templePlayerArrowsHit",
    "templePlayerArrowsGroupOffer",
    "templePlayerArrowsGroupChoose",
    "templePlayerArrowsGroupPay",
    "templePlayerArrowsWindow",
  ].includes(e.kind);
}

export function templePlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("templePlayer")) return false;
  const u = get(s, e.source);
  const target = get(s, e.target);
  switch (e.kind) {
    case "templePlayerCeorlPay": {
      requireRule(
        u?.code === P.ceorl &&
          target &&
          payerHeroes(s, "spirit", activeSeat(s)).some(
            (h) => h.id === target.id,
          ),
        "Choose a spendable Spirit hero you control.",
      );
      const problem = templePlayerAbilityProblem(s, u);
      requireRule(!problem, problem ?? "");
      s.used.push(PHASE + "ceorl:" + u.id);
      payThen(s, () => spendResources(s, target, 1), [
        fx("templePlayerCeorlReady", {
          source: u.id,
          owner: e.owner,
          player: activeSeat(s),
        }),
      ]);
      break;
    }
    case "templePlayerCeorlReady": {
      if (!u || u.code !== P.ceorl || !u.exhausted || cannotReady(u, s)) break;
      readyCharacter(s, u);
      if (u.exhausted) break;
      const controller = ownerOf(s, u);
      const recipients = playerOrder(s).filter((p) => p !== controller);
      if (recipients.length)
        choose(
          s,
          "Ceorl · Give control to another player",
          [
            ...recipients.map((p) => ({
              id: `player-${p}`,
              label: seatName(s, p),
              effects: [
                fx("templePlayerCeorlTransfer", { source: u.id, value: p }),
              ],
            })),
            skip,
          ],
          "Ceorl remains the same physical ally; his owner and once-per-phase limit stay unchanged.",
        );
      break;
    }
    case "templePlayerCeorlTransfer": {
      if (!u || u.code !== P.ceorl) break;
      const from = ownerOf(s, u),
        to = e.value!;
      requireRule(
        playerOrder(s).includes(to) && to !== from,
        "Choose another surviving player.",
      );
      u.owner ??= from;
      forOwner(s, from, () => {
        s.allies = s.allies.filter((x) => x.id !== u.id);
        s.heroes = s.heroes.filter((x) => x.id !== u.id);
      });
      forOwner(s, to, () => {
        u.controller = to;
        (isHero(u) ? s.heroes : s.allies).push(u);
      });
      log(s, `Ceorl is now controlled by ${seatName(s, to)}.`, "good");
      break;
    }
    case "templePlayerOutriderOffer":
      if (u?.code === P.outrider && usable(u) && outriderTargets(s).length)
        choosePlayerResponse(
          s,
          u.id,
          u.code,
          "Rhovanion Outrider · Committed to the quest",
          [
            ...outriderTargets(s).map((l) =>
              option(l, [
                fx("templePlayerOutriderProgress", {
                  source: u.id,
                  target: l.id,
                }),
              ]),
            ),
            skip,
          ],
        );
      break;
    case "templePlayerOutriderProgress":
      if (u && target && outriderTargets(s).some((x) => x.id === target.id)) {
        progressLocation(s, target, 1);
        if (s.staging.some((x) => x.id === target.id) && get(s, u.id))
          u.tempWill = (u.tempWill ?? 0) + 1;
      }
      break;
    case "templePlayerPartyOffer": {
      const group = scoutingGroup(s);
      const copies = group.length ? affordableCopies(s, P.party) : [];
      if (copies.length)
        choose(
          s,
          "Scouting Party · Scouts committed",
          [
            ...copies.map((event) =>
              eventOption(s, event, [
                fx("templePlayerPartyBoost", { ids: group.map((u) => u.id) }),
              ]),
            ),
            skip,
          ],
          "Every character you have committed must be a Scout; other fellowships do not affect this condition.",
        );
      break;
    }
    case "templePlayerPartyBoost":
      for (const id of e.ids ?? []) {
        const character = get(s, id);
        if (character) character.tempWill = (character.tempWill ?? 0) + 2;
      }
      break;
    case "templePlayerDestrierOffer": {
      const a = u?.attachments.find(
        (a) =>
          a.id === e.target &&
          a.code === P.destrier &&
          enabled(a) &&
          !a.exhausted,
      );
      if (
        u &&
        isHero(u) &&
        u.exhausted &&
        !cannotReady(u, s) &&
        affected(u) &&
        a
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Armored Destrier · After defending",
          [
            {
              id: "ready",
              label: `Exhaust Armored Destrier · Ready ${name(u)}`,
              code: a.code,
              effects: [{ ...e, kind: "templePlayerDestrierReady" }],
            },
            skip,
          ],
        );
      break;
    }
    case "templePlayerDestrierReady": {
      const a = u?.attachments.find(
        (a) =>
          a.id === e.target &&
          a.code === P.destrier &&
          enabled(a) &&
          !a.exhausted,
      );
      requireRule(
        u && a && u.exhausted && !cannotReady(u, s) && affected(u),
        "The attached hero must be able to ready.",
      );
      a.exhausted = true;
      readyCharacter(s, u);
      if (!u.exhausted)
        prepend(s, { ...e, kind: "templePlayerDestrierShadow" });
      break;
    }
    case "templePlayerDestrierShadow": {
      const shadows = engagedEnemies(s, e.owner ?? activeSeat(s))
        .filter((enemy) => enemy.id !== e.text)
        .flatMap((enemy) =>
          enemy.shadows.map((code, index) => ({ enemy, code, index })),
        );
      if (shadows.length)
        choose(
          s,
          "Armored Destrier · Discard another enemy's shadow",
          shadows.map(({ enemy, code, index }) => ({
            id: `${enemy.id}-${index}`,
            label: `${name(enemy)} · Shadow ${index + 1}`,
            ...(enemy.faceupShadows?.[index] ? { code } : {}),
            effects: [
              fx("templePlayerDestrierDiscard", {
                target: enemy.id,
                value: index,
                owner: e.owner,
                text: e.text,
              }),
            ],
          })),
          "The enemy must be engaged with the defending player. Facedown shadows stay hidden.",
        );
      break;
    }
    case "templePlayerDestrierDiscard":
      if (
        target &&
        target.id !== e.text &&
        engagedEnemies(s, e.owner ?? activeSeat(s)).some(
          (enemy) => enemy.id === target.id,
        )
      ) {
        const code = removeShadowCard(target, e.value ?? -1);
        if (code) s.encounterDiscard.push(code);
      }
      break;
    case "templePlayerDeorwinePay": {
      const defenders =
        s.combat?.defenderIds ??
        (s.combat?.defenderId ? [s.combat.defenderId] : []);
      requireRule(
        u?.code === P.deorwine &&
          usable(u) &&
          defenders.includes(u.id) &&
          target &&
          payerHeroes(s, "leadership", activeSeat(s)).some(
            (h) => h.id === target.id,
          ),
        "Déorwine must be defending, with a Leadership resource you can spend.",
      );
      payThen(s, () => spendResources(s, target, 1), []);
      log(s, "Déorwine cancels the triggered shadow effect.", "good");
      break;
    }
    case "templePlayerArrowsWindow": {
      if (marked(s, ENGAGED)) break;
      const options = playerOrder(s).flatMap((p) => {
        const view = seatView(s, p);
        if (templePlayerPlayProblem(view, { code: P.arrows } as Unit))
          return [];
        return affordableCopies(view, P.arrows).map((event) =>
          eventOption(
            view,
            event,
            [
              fx("templePlayerArrowsDamage", {
                value: 1,
                player: p,
                effects: [fx("templePlayerArrowsGroupOffer", { player: p })],
              }),
              fx("templePlayerArrowsWindow", { player: p }),
            ],
            "action",
          ),
        );
      });
      if (options.length)
        choose(s, "After engagement checks · Arrows from the Trees", [
          ...options,
          skip,
        ]);
      break;
    }
    case "templePlayerArrowsDamage":
      prepend(s, {
        ...e,
        kind: "templePlayerArrowsHit",
        ids: stagingEnemies(s).map((enemy) => enemy.id),
        flag: true,
      });
      break;
    case "templePlayerArrowsHit": {
      const [id, ...remaining] = e.ids ?? [];
      if (!id) {
        if (e.flag) prepend(s, ...(e.effects ?? []));
        break;
      }
      const enemyUnit = get(s, id);
      const continuation = s.queue;
      s.queue = [];
      const resolved =
        !!enemyUnit &&
        enemy(enemyUnit) &&
        s.staging.some((u) => u.id === id) &&
        affected(enemyUnit) &&
        damage(s, id, e.value ?? 1);
      // Resolve destruction/mandatory damage responses before the next placement
      // and the dependent Then payment window.
      s.queue.push(
        { ...e, ids: remaining, flag: !!e.flag && resolved },
        ...continuation,
      );
      break;
    }
    case "templePlayerArrowsGroupOffer":
      if (
        stagingEnemies(s).length &&
        payerHeroes(s, "tactics").reduce((n, h) => n + h.resources, 0) >= 3
      )
        choose(s, "Arrows from the Trees · Group payment", [
          {
            id: "pay",
            label:
              "Spend 3 Tactics resources as a group · Deal 2 additional damage",
            effects: [fx("templePlayerArrowsGroupChoose", { ids: [] })],
          },
          skip,
        ]);
      break;
    case "templePlayerArrowsGroupChoose": {
      const picked = e.ids ?? [];
      if (picked.length === 3) {
        prepend(s, fx("templePlayerArrowsGroupPay", { ids: picked }));
        break;
      }
      const payers = payerHeroes(s, "tactics").filter(
        (h) => h.resources > picked.filter((id) => id === h.id).length,
      );
      requireRule(
        payers.length,
        "The chosen group payment cannot be completed.",
      );
      choose(
        s,
        `Arrows from the Trees · Choose resource ${picked.length + 1} of 3`,
        payers.map((h) =>
          option(
            h,
            [fx("templePlayerArrowsGroupChoose", { ids: [...picked, h.id] })],
            `${name(h)} · ${seatName(s, ownerOf(s, h))}`,
          ),
        ),
        "Choose the full payment before any resources are spent.",
      );
      break;
    }
    case "templePlayerArrowsGroupPay": {
      requireRule(e.ids?.length === 3, "Choose exactly 3 Tactics resources.");
      const amounts = new Map<string, number>();
      for (const id of e.ids) amounts.set(id, (amounts.get(id) ?? 0) + 1);
      for (const [id, amount] of amounts) {
        const h = get(s, id);
        requireRule(
          h &&
            payerHeroes(s, "tactics").some((u) => u.id === id) &&
            h.resources >= amount,
          "Every selected Tactics resource must remain spendable.",
        );
      }
      payThen(s, () => {
        for (const [id, amount] of amounts) {
          const h = get(s, id)!;
          forOwner(s, ownerOf(s, h), () => spendResources(s, h, amount));
        }
      }, [fx("templePlayerArrowsDamage", { value: 2, player: activeSeat(s) })]);
      break;
    }
    default:
      throw new Error(`Unknown Temple player effect: ${e.kind}`);
  }
  return true;
}
