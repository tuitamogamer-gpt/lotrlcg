import { STORMCALLER_PLAYER as P } from "./stormcaller-player-support";
import type {
  Action,
  Attachment,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  canPay,
  cannotReady,
  choose,
  fx,
  get,
  log,
  pay,
  prepend,
  requireRule,
  shuffle,
  skip,
  spendResources,
  stats,
  takePlayerDeck,
} from "./core";
import {
  damage,
  discardHandCard,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { movableHand } from "./hand-rules";
import { heirsCanSpendResources } from "./heirs-numenor";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { ninNoCardEconomy } from "./nin-eilph-support";
import { fateCannotDraw, fateCannotSearch } from "./fate-numenor";
import { canPlay, resolvePaidPlayerCard } from "./actions";
import { foundationsPlayerCardDiscarded } from "./foundations-player-cards";
import { dreadPlayerCardDiscarded } from "./dread-realm";
import { afterPlayerAbility } from "./player-ability-triggers";
import { STORMCALLER_VANISH } from "./threat-read";
export { stormcallerEffectiveThreat, STORMCALLER_VANISH } from "./threat-read";

const PHASE = "phase:stormcaller:";
const ROUND = "round:stormcaller:";
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const affected = (u: Unit) => !playerCardImmune(u);
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const marked = (s: GameState, key: string) =>
  playerOrder(s).some((p) => seatView(s, p).used.includes(key));
const rod = (u: Unit, id?: string) =>
  u.attachments.find((a) => a.id === id && a.code === P.rod && enabled(a));
const drawable = (s: GameState) =>
  s.deck.length > 0 &&
  !ninNoCardEconomy(s) &&
  !fateCannotDraw(s) &&
  !allActiveLocations(s).some((u) => u.code === "01095");
const denethorTargets = (s: GameState, u: Unit) =>
  allHeroes(s).filter(
    (h) =>
      h.id !== u.id &&
      hasTrait(h, "Gondor") &&
      affected(h) &&
      canGainResources(s, h, true, true),
  );
const healingTargets = (s: GameState) =>
  allCharacters(s).filter((u) => affected(u) && rhosgobelHealingAllowed(s, u));
const searchablePlayers = (s: GameState) =>
  playerOrder(s).filter(
    (p) => seatView(s, p).deck.length > 0 && !fateCannotSearch(s, p),
  );
const groupPayers = (s: GameState, sphere: string) =>
  allHeroes(s).filter(
    (h) =>
      h.resources > 0 &&
      hasResourceIcon(h, sphere) &&
      heirsCanSpendResources(seatView(s, ownerOf(s, h)), h),
  );

export function stormcallerSetup(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes)
        if (
          h.code === P.denethor &&
          !h.blanked &&
          !s.used.includes(`game:stormcaller:denethor-setup:${h.id}`)
        ) {
          h.resources += 2;
          s.used.push(`game:stormcaller:denethor-setup:${h.id}`);
        }
    });
}
export function stormcallerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.rod)
    return allHeroes(s).filter((u) => hasTrait(u, "Gondor") && affected(u));
  if (code === P.service) return allCharacters(s).filter(affected);
  return undefined;
}
export function stormcallerPlayProblem(
  s: GameState,
  u: Unit,
  origin: "hand" | "deck" | "discard" = "hand",
) {
  if (u.code === P.lastStand || u.code === P.tides)
    return "This event can only be played in its printed Response window.";
  if (
    u.code === P.guardian &&
    origin === "hand" &&
    !s.used.includes(`${PHASE}guardian-paid:${u.id}`) &&
    movableHand(s).filter((c) => c.id !== u.id).length < 2
  )
    return "Guardian of Rivendell requires two other cards discarded from your hand.";
  if (
    u.code === P.vanish &&
    allHeroes(s).filter((h) => ownerOf(s, h) === activeSeat(s)).length > 2
  )
    return "Vanish from Sight can only be played while you control 2 or fewer heroes.";
  if (u.code === P.heed && !searchablePlayers(s).length)
    return "Choose a player whose deck can be searched.";
  return null;
}
export function stormcallerAbilityLabel(code: string): string | undefined {
  if (code === P.denethor)
    return "Move 1 resource to another Gondor hero · Once per round";
  if (code === P.rod) return "Spend 2 attached-hero resources · Draw 1 card";
  if (code === P.glorfindel)
    return "Discard a card · Ready Glorfindel · Once per phase";
  if (code === P.caregiver)
    return "Discard a card · Heal 1 damage · Twice per round";
  return undefined;
}
export function stormcallerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    const a = rod(u, attachmentId);
    if (!a) return "Choose an active Rod of the Steward.";
    if (
      u.resources < 2 ||
      !heirsCanSpendResources(seatView(s, ownerOf(s, u)), u)
    )
      return "The attached hero needs two spendable resources.";
    if (!drawable(s)) return "You need a drawable card in your deck.";
    return null;
  }
  if (u.blanked || !affected(u))
    return "This character's ability is unavailable.";
  if (u.code === P.denethor) {
    if (marked(s, `${ROUND}denethor:${u.id}`))
      return "Denethor has already moved a resource this round.";
    if (u.resources < 1 || !denethorTargets(s, u).length)
      return "Choose another Gondor hero that can receive a resource.";
  } else if (u.code === P.glorfindel) {
    if (marked(s, `${PHASE}glorfindel:${u.id}`))
      return "Glorfindel has already used this Action this phase.";
    if (!u.exhausted || cannotReady(u, s) || !movableHand(s).length)
      return "Glorfindel must be able to ready, with a card available to discard.";
  } else if (u.code === P.caregiver) {
    if (
      playerOrder(s).reduce(
        (n, p) =>
          n +
          seatView(s, p).used.filter((k) => k === `${ROUND}caregiver:${u.id}`)
            .length,
        0,
      ) >= 2
    )
      return "This Imladris Caregiver has already acted twice this round.";
    if (!movableHand(s).length || !healingTargets(s).length)
      return "You need a card to discard and a damaged character that can be healed.";
  }
  return null;
}

export function useStormcallerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (
    attachmentId
      ? !rod(u, attachmentId)
      : ![P.denethor, P.glorfindel, P.caregiver].some((code) => code === u.code)
  )
    return false;
  const problem = stormcallerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  if (attachmentId) {
    const player = activeSeat(s);
    forOwner(s, ownerOf(s, u), () => spendResources(s, u, 2));
    s.queue.push(fx("draw", { value: 1, player }));
  } else if (u.code === P.denethor) {
    choose(
      s,
      "Denethor · Move 1 resource to another Gondor hero",
      denethorTargets(s, u).map((h) =>
        option(h, [
          fx("stormcallerDenethorMove", { source: u.id, target: h.id }),
        ]),
      ),
    );
  } else if (u.code === P.glorfindel) {
    choose(
      s,
      "Glorfindel · Discard a card to ready",
      movableHand(s).map((c) =>
        option(c, [
          fx("stormcallerAbilityDiscard", {
            source: u.id,
            target: c.id,
            code: u.code,
          }),
        ]),
      ),
    );
  } else {
    choose(
      s,
      "Imladris Caregiver · Choose a character to heal",
      healingTargets(s).map((t) =>
        option(t, [
          fx("stormcallerCaregiverCost", { source: u.id, target: t.id }),
        ]),
      ),
    );
  }
  return true;
}

/** PLAY has already passed its normal preflight; reserve the exact chosen hand cost. */
export function stormcallerGuardianPlay(
  s: GameState,
  u: Unit,
  action: Extract<Action, { type: "PLAY" }>,
) {
  if (u.code !== P.guardian) return false;
  requireRule(
    movableHand(s).filter((c) => c.id !== u.id).length >= 2,
    "Guardian of Rivendell needs two other physical hand cards.",
  );
  guardianChoose(
    s,
    fx("stormcallerGuardianChoose", {
      source: u.id,
      text: JSON.stringify(action),
      ids: [],
      player: activeSeat(s),
    }),
  );
  return true;
}
function guardianChoose(s: GameState, e: Effect) {
  const selected = e.ids ?? [];
  if (selected.length === 2) {
    prepend(s, { ...e, kind: "stormcallerGuardianDiscard" });
    return;
  }
  choose(
    s,
    `Guardian of Rivendell · Choose hand card ${selected.length + 1}/2 to discard`,
    movableHand(s)
      .filter((c) => c.id !== e.source && !selected.includes(c.id))
      .map((c) =>
        option(c, [{ ...e, kind: "stormcallerGuardianSelect", target: c.id }]),
      ),
  );
}

export function stormcallerPlayAllyFromDiscard(
  s: GameState,
  index: number,
  payment?: Record<string, number>,
) {
  if (s.discard[index] !== P.glorfindel) return false;
  requireRule(
    Number.isSafeInteger(index) && s.discard[index] === P.glorfindel,
    "Choose Glorfindel in your own discard pile.",
  );
  const preview = {
    ...s.heroes[0],
    code: P.glorfindel,
    id: `discard-${index}`,
    owner: activeSeat(s),
  } as Unit;
  const problem = canPlay(s, preview, { playOrigin: "discard" });
  requireRule(!problem, problem ?? "");
  const c = {
    ...card(P.glorfindel),
    playOrigin: "discard" as const,
    playOwner: activeSeat(s),
  };
  pay(s, c, payment);
  const physical = takePlayerDiscard(s, index);
  resolvePaidPlayerCard(
    s,
    physical,
    undefined,
    Number(c.cost) || 0,
    true,
    false,
  );
  return true;
}

export function stormcallerEvent(s: GameState, code: string, _target?: string) {
  if (code === P.vanish) {
    s.used.push(STORMCALLER_VANISH);
    log(
      s,
      "Vanish from Sight treats this fellowship's threat as 20 when its actual threat is higher, until the phase ends.",
    );
    return true;
  }
  if (code !== P.heed) return false;
  choose(
    s,
    "Heed the Dream · Choose a player",
    searchablePlayers(s).map((p) => ({
      id: `player-${p}`,
      label: seatName(s, p),
      effects: [fx("stormcallerHeedSearch", { player: p, owner: p })],
    })),
  );
  return true;
}

const responseCopies = (s: GameState, code: string) =>
  s.hand.filter(
    (u) =>
      u.code === code &&
      canPay(s, { ...card(code), playOwner: u.owner ?? activeSeat(s) }),
  );
const responseEventOption = (
  s: GameState,
  u: Unit,
  effects: Effect[],
): Option => ({
  id: u.id,
  code: u.code,
  label: `Play ${name(u)}`,
  ability: {
    player: activeSeat(s),
    source: u.id,
    code: u.code,
    type: "response",
  },
  effects: [
    fx("eventPlay", {
      code: u.code,
      source: u.id,
      player: activeSeat(s),
      effects,
    }),
  ],
});
const defendingCharacters = (s: GameState, enemyId?: string) => {
  const c = s.combat;
  return c && c.enemyId === enemyId
    ? (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u && affected(u))
    : [];
};

/** Called only after actual destruction, using the character's traits before leaving. */
export function stormcallerCharacterDestroyed(
  s: GameState,
  u: Unit,
  lastKnownTraits: string[],
) {
  const c = s.combat;
  if (
    !c ||
    !lastKnownTraits.includes("Warrior") ||
    !(c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).includes(u.id)
  )
    return;
  const enemy = get(s, c.enemyId),
    value = card(u.code).attack ?? 0;
  if (!enemy || !affected(enemy) || value <= 0) return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((p) => responseCopies(seatView(s, p), P.lastStand).length)
      .map((p) =>
        fx("stormcallerLastStandOffer", {
          player: p,
          target: enemy.id,
          source: u.id,
          value,
        }),
      ),
  );
}

/** Compare the same physical attack around actual shadow-effect dispatch, including deferred clauses. */
export function stormcallerShadowAttackIncreased(
  s: GameState,
  previousCombat: GameState["combat"],
  previousBonus: number,
  previousEnemyAttack?: number,
) {
  if (
    !previousCombat ||
    s.combat !== previousCombat ||
    !defendingCharacters(s, previousCombat.enemyId).length
  )
    return;
  const enemy = get(s, previousCombat.enemyId);
  const increased =
    previousEnemyAttack === undefined
      ? previousCombat.attackBonus > previousBonus
      : !!enemy &&
        stats(s, enemy).attack + previousCombat.attackBonus >
          previousEnemyAttack + previousBonus;
  if (!increased) return;
  prepend(
    s,
    ...playerOrder(s)
      .filter((p) => responseCopies(seatView(s, p), P.tides).length)
      .map((p) =>
        fx("stormcallerTidesOffer", {
          player: p,
          target: previousCombat.enemyId,
        }),
      ),
  );
}
export function stormcallerAttackBonus(s: GameState, u: Unit) {
  return playerOrder(s).reduce(
    (n, p) =>
      n +
      seatView(s, p).used.filter((k) => k === `${PHASE}tides:${u.id}`).length *
        3,
    0,
  );
}
export function stormcallerAttackFinished(s: GameState, ids: string[]) {
  const keys = new Set(ids.map((id) => `${PHASE}tides:${id}`));
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.used = s.used.filter((k) => !keys.has(k));
    });
}

function groupChoose(s: GameState, e: Effect) {
  const ids = e.ids ?? [],
    total = e.value ?? 0;
  if (ids.length === total) {
    prepend(s, { ...e, kind: "stormcallerGroupPay" });
    return;
  }
  const allocated = (id: string) => ids.filter((v) => v === id).length;
  choose(
    s,
    `${card(e.code!).name} · Allocate ${e.text} resource ${ids.length + 1}/${total}`,
    groupPayers(s, e.text!)
      .filter((h) => h.resources > allocated(h.id))
      .map((h) => ({
        id: h.id,
        code: h.code,
        label: `${name(h)} · ${seatName(s, ownerOf(s, h))}`,
        effects: [{ ...e, kind: "stormcallerGroupSelect", target: h.id }],
      })),
  );
}
function groupCanPay(s: GameState, sphere: string, amount: number) {
  return groupPayers(s, sphere).reduce((n, h) => n + h.resources, 0) >= amount;
}
function resolveCostBefore(
  s: GameState,
  cost: () => void,
  ...effects: Effect[]
) {
  const continuation = s.queue;
  s.queue = [];
  cost();
  s.queue.push(...effects, ...continuation);
}

export function stormcallerEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "stormcallerDenethorMove": {
      requireRule(
        source?.code === P.denethor &&
          !stormcallerAbilityProblem(s, source) &&
          u &&
          denethorTargets(s, source).some((h) => h.id === u.id),
        "Move Denethor's resource to another eligible Gondor hero.",
      );
      source.resources--;
      u.resources++;
      forOwner(s, ownerOf(s, source), () =>
        s.used.push(`${ROUND}denethor:${source.id}`),
      );
      return true;
    }
    case "stormcallerCaregiverCost":
      requireRule(
        source?.code === P.caregiver &&
          !stormcallerAbilityProblem(s, source) &&
          u &&
          healingTargets(s).some((t) => t.id === u.id),
        "Choose a damaged character that can be healed.",
      );
      choose(
        s,
        "Imladris Caregiver · Discard a card from your hand",
        movableHand(s).map((c) =>
          option(c, [
            fx("stormcallerAbilityDiscard", {
              source: source.id,
              target: c.id,
              code: source.code,
              text: u.id,
            }),
          ]),
        ),
      );
      return true;
    case "stormcallerAbilityDiscard": {
      const physical = movableHand(s).find((c) => c.id === e.target);
      requireRule(
        source && physical && !stormcallerAbilityProblem(s, source),
        "Pay the Action's physical hand discard cost.",
      );
      const key =
        source.code === P.glorfindel
          ? `${PHASE}glorfindel:${source.id}`
          : `${ROUND}caregiver:${source.id}`;
      forOwner(s, ownerOf(s, source), () => s.used.push(key));
      resolveCostBefore(
        s,
        () => discardHandCard(s, physical.id),
        fx("stormcallerAbilityAfterDiscard", {
          source: source.id,
          target: e.text,
          code: source.code,
        }),
      );
      return true;
    }
    case "stormcallerAbilityAfterDiscard":
      if (e.code === P.glorfindel && source) readyCharacter(s, source);
      if (e.code === P.caregiver && u && affected(u))
        rhosgobelHeal(s, u, 1, {
          source: e.source,
          code: P.caregiver,
          player: activeSeat(s),
        });
      return true;
    case "stormcallerGuardianChoose":
      guardianChoose(s, e);
      return true;
    case "stormcallerGuardianSelect": {
      requireRule(
        movableHand(s).some((c) => c.id === e.target && c.id !== e.source) &&
          !e.ids?.includes(e.target!),
        "Choose another physical hand card for Guardian's cost.",
      );
      guardianChoose(s, {
        ...e,
        ids: [...(e.ids ?? []), e.target!],
        target: undefined,
      });
      return true;
    }
    case "stormcallerGuardianDiscard": {
      const physical = s.hand.find(
        (c) => c.id === e.source && c.code === P.guardian,
      );
      requireRule(
        physical &&
          e.ids?.length === 2 &&
          new Set(e.ids).size === 2 &&
          e.ids.every((id) =>
            movableHand(s).some((c) => c.id === id && c.id !== e.source),
          ),
        "Discard exactly two other physical hand cards.",
      );
      const action = JSON.parse(e.text!) as Extract<Action, { type: "PLAY" }>;
      resolveCostBefore(
        s,
        () => {
          // All normal and additional costs are paid before either discard can resolve responses.
          pay(
            s,
            { ...card(P.guardian), playOwner: physical.owner ?? activeSeat(s) },
            action.payment,
          );
          s.hand = s.hand.filter((c) => c.id !== physical.id);
          (s.pendingPlayerPlays ??= []).push({
            unit: physical,
            player: activeSeat(s),
            target: action.target,
            effectiveCost: Number(card(P.guardian).cost) || 0,
            played: true,
            fromHand: true,
            bottom: false,
            amount: action.amount ?? 0,
          });
          for (const id of e.ids!) discardHandCard(s, id);
        },
        { ...e, kind: "stormcallerGuardianPaid" },
      );
      return true;
    }
    case "stormcallerGuardianPaid": {
      const pending = s.pendingPlayerPlays?.find((p) => p.unit.id === e.source);
      if (!pending) return true;
      s.pendingPlayerPlays = s.pendingPlayerPlays!.filter((p) => p !== pending);
      if (!s.pendingPlayerPlays.length) delete s.pendingPlayerPlays;
      const physical = pending.unit,
        key = `${PHASE}guardian-paid:${physical.id}`;
      s.used.push(key);
      const problem = canPlay(s, physical, {
        resolvingEffect: true,
        noCost: true,
      });
      s.used = s.used.filter((k) => k !== key);
      if (
        problem ||
        s.status !== "playing" ||
        s.table?.seats[pending.player]?.eliminated
      ) {
        forOwner(s, physical.owner ?? pending.player, () => {
          s.discard.push(physical.code);
          foundationsPlayerCardDiscarded(s, physical);
          dreadPlayerCardDiscarded(s, physical);
        });
        log(
          s,
          `Guardian of Rivendell cannot enter play after its costs: ${problem ?? "its controller left the game"}`,
        );
        return true;
      }
      resolvePaidPlayerCard(
        s,
        physical,
        pending.target,
        pending.effectiveCost,
        true,
        true,
        false,
        pending.amount,
      );
      return true;
    }
    case "stormcallerHeedSearch": {
      if (fateCannotSearch(s, e.owner ?? activeSeat(s))) {
        log(s, "Heed the Dream cannot search this player’s deck.");
        return true;
      }
      const limit = e.flag ? s.deck.length : Math.min(5, s.deck.length);
      choose(
        s,
        `Heed the Dream · Search ${e.flag ? "your deck" : "the top 5 cards"}`,
        [
          ...s.deck.slice(0, limit).map((code, i) => ({
            id: `deck-${i}`,
            code,
            label: card(code).name,
            effects: [
              fx("stormcallerHeedTake", {
                value: i,
                code,
                flag: e.flag,
                owner: e.owner,
                player: e.owner,
              }),
            ],
          })),
          {
            id: "none",
            label: "Choose no card · Shuffle your deck",
            effects: [fx("stormcallerHeedShuffle", { player: e.owner })],
          },
        ],
      );
      return true;
    }
    case "stormcallerHeedTake": {
      if (fateCannotSearch(s, e.owner ?? activeSeat(s))) {
        log(s, "Heed the Dream cannot search this player’s deck.");
        return true;
      }
      requireRule(
        Number.isSafeInteger(e.value) &&
          e.value! >= 0 &&
          (e.flag || e.value! < 5) &&
          s.deck[e.value!] === e.code,
        "Choose the actual card in the searched deck.",
      );
      s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      if (!e.flag && s.deck.length && groupCanPay(s, "leadership", 3))
        choose(
          s,
          "Heed the Dream · Then spend 3 Leadership resources as a group?",
          [
            {
              id: "pay",
              label: "Allocate 3 Leadership resources · Search the entire deck",
              effects: [
                fx("stormcallerGroupChoose", {
                  code: P.heed,
                  text: "leadership",
                  value: 3,
                  ids: [],
                  owner: e.owner,
                  effects: [
                    fx("stormcallerHeedSearch", {
                      flag: true,
                      owner: e.owner,
                      player: e.owner,
                    }),
                  ],
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "stormcallerHeedShuffle":
      shuffle(s, s.deck);
      return true;
    case "stormcallerGroupChoose":
      groupChoose(s, e);
      return true;
    case "stormcallerGroupSelect": {
      const ids = e.ids ?? [],
        h = groupPayers(s, e.text!).find((h) => h.id === e.target);
      requireRule(
        h && h.resources > ids.filter((id) => id === h.id).length,
        "Allocate an available resource with the required sphere icon.",
      );
      groupChoose(s, { ...e, ids: [...ids, h.id], target: undefined });
      return true;
    }
    case "stormcallerGroupPay": {
      const ids = e.ids ?? [],
        allocated = new Map<string, number>();
      for (const id of ids) allocated.set(id, (allocated.get(id) ?? 0) + 1);
      requireRule(
        ids.length === e.value &&
          [...allocated].every(([id, n]) =>
            groupPayers(s, e.text!).some(
              (h) => h.id === id && h.resources >= n,
            ),
          ),
        "Pay the complete shared resource allocation.",
      );
      resolveCostBefore(
        s,
        () => {
          for (const [id, n] of allocated) {
            const h = get(s, id)!;
            forOwner(s, ownerOf(s, h), () => spendResources(s, h, n));
          }
        },
        ...(e.effects ?? []),
      );
      return true;
    }
    case "stormcallerLastStandOffer": {
      if (!u || !affected(u)) return true;
      const copies = responseCopies(s, P.lastStand);
      if (copies.length)
        choose(s, "Last Stand · Warrior defender destroyed", [
          ...copies.map((c) =>
            responseEventOption(s, c, [
              fx("stormcallerLastStandDamage", {
                target: e.target,
                value: e.value,
                source: e.source,
              }),
            ]),
          ),
          skip,
        ]);
      return true;
    }
    case "stormcallerLastStandDamage":
      if (u && affected(u)) damage(s, u.id, e.value ?? 0);
      afterPlayerAbility(s, {
        ...e,
        kind: "stormcallerLastStandOffer",
        player: activeSeat(s),
      });
      return true;
    case "stormcallerTidesOffer": {
      if (!defendingCharacters(s, e.target).length) return true;
      const copies = responseCopies(s, P.tides);
      if (copies.length)
        choose(s, "Tides of Fate · Shadow increased the enemy's attack", [
          ...copies.map((c) =>
            responseEventOption(s, c, [
              fx("stormcallerTidesDefender", { source: e.target }),
            ]),
          ),
          skip,
        ]);
      return true;
    }
    case "stormcallerTidesDefender":
      choose(
        s,
        "Tides of Fate · Choose the defending character",
        defendingCharacters(s, e.source).map((d) =>
          option(d, [
            fx("stormcallerTidesDefense", { target: d.id, source: e.source }),
          ]),
        ),
      );
      return true;
    case "stormcallerTidesDefense": {
      requireRule(
        u && defendingCharacters(s, e.source).some((d) => d.id === u.id),
        "Choose a current defending character for Tides of Fate.",
      );
      const bonuses = (s.combat!.defenseBonuses ??= {});
      bonuses[u.id] = (bonuses[u.id] ?? 0) + 3;
      afterPlayerAbility(
        s,
        fx("stormcallerTidesOffer", {
          target: e.source,
          player: activeSeat(s),
        }),
      );
      if (groupCanPay(s, "tactics", 2))
        choose(
          s,
          "Tides of Fate · Then spend 2 Tactics resources as a group?",
          [
            {
              id: "pay",
              label:
                "Allocate 2 Tactics resources · Ready and give +3 attack for the next attack",
              effects: [
                fx("stormcallerGroupChoose", {
                  code: P.tides,
                  text: "tactics",
                  value: 2,
                  ids: [],
                  effects: [fx("stormcallerTidesReady", { target: u.id })],
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "stormcallerTidesReady":
      if (u && affected(u)) {
        readyCharacter(s, u);
        forOwner(s, ownerOf(s, u), () => s.used.push(`${PHASE}tides:${u.id}`));
      }
      return true;
    default:
      return false;
  }
}
