import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  canPay,
  canPlayerAffectShadow,
  choose,
  fx,
  get,
  log,
  prepend,
  putPlayerDeck,
  removePlayerShadowCard,
  requireRule,
  shuffle,
  skip,
} from "./core";
import { damage, discardHandCard, takePlayerDiscard } from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  attachmentController,
  ownerOf,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { discardableHand } from "./hand-rules";
import { isEnemy } from "./ships";
import { isSacked } from "./carrock";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { MUMAKIL_PLAYER as P } from "./mumakil-player-support";

const phaseLimit = (u: Unit) => `phase:mumakil:${u.code}:${u.id}`;
const used = (s: GameState, key: string) =>
  s.used.includes(key) ||
  !!s.table?.seats.some((seat) => seat.used.includes(key));
const usable = (u: Unit) => !u.blanked && !isSacked(u);
const handAllies = (s: GameState) =>
  discardableHand(s).filter(
    (u) => card(u.code).type_code === "ally" && hasTrait(u, "Harad"),
  );
const readyTargets = (s: GameState) =>
  drownedCannotReady(s) || desertCrossingCannotPlayerReady(s)
    ? []
    : allCharacters(s).filter(
        (u) =>
          u.exhausted &&
          hasTrait(u, "Harad") &&
          !cannotReady(u, s) &&
          !playerEffectImmune(s, u, P.kahliel),
      );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => isEnemy(u) && !card(u.code).is_unique,
  );
const yazanTargets = (s: GameState) =>
  enemies(s).filter((u) => !playerEffectImmune(s, u, P.yazan));
const facedownShadows = (s: GameState) =>
  enemies(s)
    .filter((u) => canPlayerAffectShadow(s, u))
    .flatMap((u) =>
      u.shadows.flatMap((code, index) =>
        index >= (u.revealedShadowCount ?? 0) && !u.faceupShadows?.[index]
          ? [{ enemy: u, code, index }]
          : [],
      ),
    );
const topHarad = (s: GameState) => {
  for (let i = s.discard.length - 1; i >= 0; i--)
    if (
      card(s.discard[i]).type_code === "ally" &&
      (card(s.discard[i]).traits ?? "")
        .split(".")
        .some((t) => t.trim() === "Harad")
    )
      return i;
  return -1;
};
const headdress = (u: Unit, id: string | undefined) =>
  u.attachments.find(
    (a) => a.id === id && a.code === P.headdress && !a.blanked && !a.facedown,
  );

export function mumakilPlayerAbilityLabel(code: string) {
  if (code === P.kahliel)
    return "Discard a Harad ally from hand · Ready a Harad character · Once per phase";
  if (code === P.headdress)
    return "Refresh · Exhaust Headdress · Shuffle your topmost Harad ally into your deck";
  return undefined;
}
export function mumakilPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!attachmentId && u.code === P.kahliel) {
    if (ownerOf(s, u) !== activeSeat(s) || !usable(u))
      return "Only Kahliel's controller can use his active text.";
    if (used(s, phaseLimit(u))) return "Kahliel has already acted this phase.";
    if (!handAllies(s).length)
      return "Discard a Harad ally card from your hand as the cost.";
    if (!readyTargets(s).length)
      return "There is no exhausted Harad character that can be readied.";
  } else if (attachmentId && headdress(u, attachmentId)) {
    const a = headdress(u, attachmentId)!;
    if (attachmentController(s, u, a) !== activeSeat(s))
      return "Only this attachment's controller can use it.";
    if (s.phase !== "refresh")
      return "Kahliel's Headdress has a Refresh Action.";
    if (a.exhausted) return "Kahliel's Headdress must be ready.";
    if (dikeCannotLeaveDiscard(s))
      return "An encounter effect prevents moving cards out of discard piles.";
    if (topHarad(s) < 0) return "Your discard pile has no Harad ally.";
  }
  return null;
}
export function useMumakilPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (
    (!attachmentId && u.code !== P.kahliel) ||
    (attachmentId && !headdress(u, attachmentId))
  )
    return false;
  const problem = mumakilPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  if (!attachmentId) {
    choose(
      s,
      "Kahliel · Choose a Harad character to ready",
      readyTargets(s).map((target) => ({
        id: target.id,
        code: target.code,
        label: `Ready ${name(target)}`,
        effects: [
          fx("mumakilPlayerKahlielCost", { source: u.id, target: target.id }),
        ],
      })),
    );
  } else {
    const a = headdress(u, attachmentId)!;
    a.exhausted = true;
    const ally = takePlayerDiscard(s, topHarad(s));
    putPlayerDeck(s, ally);
    shuffle(s, s.deck);
    log(
      s,
      `Kahliel's Headdress shuffles ${name(ally)} into its controller's deck.`,
      "good",
    );
  }
  return true;
}

export function mumakilPlayerPlayProblem(_s: GameState, u: Unit) {
  return u.code === P.coney
    ? "Coney in a Trap responds automatically after you engage an enemy."
    : null;
}
export function mumakilConeyCondition(s: GameState, player = activeSeat(s)) {
  const own = allCharacters(s).filter(
    (u) => ownerOf(s, u) === player && card(u.code).is_unique,
  );
  return own.some(
    (ranger) =>
      hasTrait(ranger, "Ranger") &&
      own.some(
        (warrior) => warrior.id !== ranger.id && hasTrait(warrior, "Warrior"),
      ),
  );
}
export const mumakilEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player = activeSeat(s),
) => seatView(s, player).used.includes(`round:mumakil-coney:${enemy.id}`);
export function mumakilPlayerEnemyEngaged(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  const p = seatView(s, player);
  if (
    !mumakilConeyCondition(s, player) ||
    mumakilEnemyCannotAttack(s, enemy, player) ||
    playerEffectImmune(s, enemy, P.coney)
  )
    return;
  prepend(
    s,
    ...p.hand
      .filter((u) => u.code === P.coney && canPay(p, card(u.code)))
      .map((u) =>
        fx("mumakilPlayerConeyOffer", {
          source: u.id,
          target: enemy.id,
          player,
        }),
      ),
  );
}

interface DiscardedCard {
  code: string;
  index: number;
}
const pipes = (s: GameState, player = activeSeat(s)) =>
  allCharacters(s).flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          a.code === P.pipe &&
          !a.blanked &&
          !a.facedown &&
          !a.exhausted &&
          attachmentController(s, host, a) === player,
      )
      .map((a) => ({ host, attachment: a })),
  );

/** One atomic discard batch retains each physical discard position until its responses finish. */
export function mumakilPlayerDeckDiscarded(
  s: GameState,
  codes: string[],
  player: number,
) {
  if (!codes.length || !pipes(s, player).length || dikeCannotLeaveDiscard(s))
    return;
  const discard = seatView(s, player).discard,
    remaining = [...codes],
    discarded: DiscardedCard[] = [];
  // A discard can include foreign-owned cards; only physical cards in this player's
  // discard can be moved back into this player's deck by their Pipe.
  for (
    let index = discard.length - 1;
    index >= 0 && remaining.length;
    index--
  ) {
    const match = remaining.lastIndexOf(discard[index]);
    if (match >= 0) {
      remaining.splice(match, 1);
      discarded.push({ code: discard[index], index });
    }
  }
  prepend(
    s,
    fx("mumakilPlayerPipeBatch", { text: JSON.stringify(discarded), player }),
  );
}

/** All actual commits share this path, including effects that commit Firyal. */
export function mumakilCharactersCommitted(s: GameState, ids: string[]) {
  prepend(
    s,
    ...ids.flatMap((id) => {
      const u = get(s, id);
      return u?.code === P.firyal && usable(u) && s.encounterDeck.length
        ? [
            fx("mumakilPlayerFiryalOffer", {
              source: u.id,
              player: ownerOf(s, u),
            }),
          ]
        : [];
    }),
  );
}
export function mumakilAttackersDeclared(
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return attackers
    .filter(
      (u) =>
        u.code === P.yazan &&
        usable(u) &&
        !used(s, phaseLimit(u)) &&
        yazanTargets(s).length,
    )
    .map((u) =>
      fx("mumakilPlayerYazanOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
/** Declaring without exhausting (e.g. Path of Need) never triggers Jubayr. */
export function mumakilDefendersDeclared(
  s: GameState,
  _enemy: Unit,
  defenders: Unit[],
  exhaustedIds: string[],
): Effect[] {
  return defenders
    .filter(
      (u) =>
        u.code === P.jubayr &&
        usable(u) &&
        exhaustedIds.includes(u.id) &&
        !used(s, phaseLimit(u)) &&
        facedownShadows(s).length,
    )
    .map((u) =>
      fx("mumakilPlayerJubayrOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}

export function handleMumakilPlayerEffect(s: GameState, e: Effect): boolean {
  const source = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "mumakilPlayerConeyOffer": {
      const event = s.hand.find((u) => u.id === e.source && u.code === P.coney);
      if (
        event &&
        target &&
        mumakilConeyCondition(s) &&
        !mumakilEnemyCannotAttack(s, target) &&
        !playerEffectImmune(s, target, P.coney) &&
        canPay(s, card(event.code))
      )
        choosePlayerResponse(
          s,
          event.id,
          event.code,
          "Coney in a Trap · Prevent this enemy attacking you this round?",
          [
            {
              id: "use",
              code: event.code,
              label: `Play Coney in a Trap · ${name(target)} cannot attack you`,
              effects: [
                fx("eventPlay", {
                  source: event.id,
                  code: event.code,
                  effects: [
                    fx("mumakilPlayerConeyResolve", { target: target.id }),
                  ],
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "mumakilPlayerConeyResolve":
      if (target && !playerEffectImmune(s, target, P.coney))
        s.used.push(`round:mumakil-coney:${target.id}`);
      return true;
    case "mumakilPlayerPipeBatch": {
      if (dikeCannotLeaveDiscard(s)) return true;
      const discarded = (JSON.parse(e.text ?? "[]") as DiscardedCard[]).filter(
        ({ code, index }) => s.discard[index] === code,
      );
      const options: Option[] = pipes(s).flatMap(({ host, attachment: a }) =>
        discarded.map(({ code, index }) => ({
          id: `${a.id}:${index}`,
          code,
          label: `Exhaust Dwarf Pipe on ${name(host)} · Put ${card(code).name} on the bottom of your deck`,
          ability: {
            player: activeSeat(s),
            source: a.id,
            code: a.code,
            type: "response" as const,
          },
          effects: [
            fx("mumakilPlayerPipeUse", {
              source: a.id,
              target: host.id,
              code,
              value: index,
              text: JSON.stringify(discarded),
            }),
          ],
        })),
      );
      if (options.length)
        choose(s, "Dwarf Pipe · Return a card just discarded from your deck?", [
          ...options,
          skip,
        ]);
      return true;
    }
    case "mumakilPlayerPipeUse": {
      const pipe = target?.attachments.find(
        (a) =>
          a.id === e.source &&
          a.code === P.pipe &&
          !a.blanked &&
          !a.facedown &&
          !a.exhausted,
      );
      requireRule(
        !!pipe &&
          attachmentController(s, target!, pipe) === activeSeat(s) &&
          s.discard[e.value!] === e.code &&
          !dikeCannotLeaveDiscard(s),
        "Dwarf Pipe needs a ready attachment and that actual discarded card.",
      );
      pipe!.exhausted = true;
      const discarded = JSON.parse(e.text ?? "[]") as DiscardedCard[];
      const recovered = takePlayerDiscard(s, e.value!);
      putPlayerDeck(s, recovered);
      const remaining = discarded
        .filter(({ index }) => index !== e.value)
        .map(({ code, index }) => ({
          code,
          index: index > e.value! ? index - 1 : index,
        }));
      prepend(
        s,
        fx("mumakilPlayerPipeBatch", { text: JSON.stringify(remaining) }),
      );
      return true;
    }
    case "mumakilPlayerKahlielCost":
      requireRule(
        !!source &&
          !mumakilPlayerAbilityProblem(s, source) &&
          readyTargets(s).some((u) => u.id === e.target),
        "Kahliel's cost and target must remain available.",
      );
      choose(
        s,
        "Kahliel · Choose the physical Harad ally card to discard",
        handAllies(s).map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [
            fx("mumakilPlayerKahlielReady", {
              source: e.source,
              target: e.target,
              text: u.id,
            }),
          ],
        })),
      );
      return true;
    case "mumakilPlayerKahlielReady": {
      requireRule(
        !!source &&
          !mumakilPlayerAbilityProblem(s, source) &&
          handAllies(s).some((u) => u.id === e.text) &&
          readyTargets(s).some((u) => u.id === e.target),
        "Kahliel's physical cost and target must remain available.",
      );
      s.used.push(phaseLimit(source!));
      const tail = s.queue;
      s.queue = [];
      discardHandCard(s, e.text!);
      s.queue.push(fx("ready", { target: e.target }), ...tail);
      return true;
    }
    case "mumakilPlayerFiryalOffer":
      if (source?.code === P.firyal && usable(source) && s.encounterDeck.length)
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Firyal · Look at the top encounter card?",
          [
            {
              id: "use",
              label: "Look at the top encounter card",
              effects: [fx("mumakilPlayerFiryalLook", { source: source.id })],
            },
            skip,
          ],
        );
      return true;
    case "mumakilPlayerFiryalLook": {
      const code = s.encounterDeck[0];
      if (code)
        choose(s, "Firyal · You may discard the looked-at card", [
          {
            id: "discard",
            code,
            label: `Discard ${card(code).name}`,
            effects: [fx("mumakilPlayerFiryalDiscard", { code })],
          },
          {
            id: "keep",
            code,
            label: `Leave ${card(code).name} on top`,
            effects: [],
          },
        ]);
      return true;
    }
    case "mumakilPlayerFiryalDiscard":
      requireRule(
        s.encounterDeck[0] === e.code,
        "The looked-at encounter card must remain on top.",
      );
      s.encounterDiscard.push(s.encounterDeck.shift()!);
      return true;
    case "mumakilPlayerYazanOffer":
      if (
        source?.code === P.yazan &&
        usable(source) &&
        !used(s, phaseLimit(source)) &&
        yazanTargets(s).length
      )
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Yazan · Deal 1 damage to a non-unique enemy?",
          [
            ...yazanTargets(s).map((u) => ({
              id: u.id,
              code: u.code,
              label: `Deal 1 damage to ${name(u)}`,
              effects: [
                fx("mumakilPlayerYazanUse", {
                  source: source.id,
                  target: u.id,
                }),
              ],
            })),
            skip,
          ],
        );
      return true;
    case "mumakilPlayerYazanUse":
      requireRule(
        !!source &&
          !used(s, phaseLimit(source)) &&
          yazanTargets(s).some((u) => u.id === e.target),
        "Yazan needs an affected non-unique enemy.",
      );
      s.used.push(phaseLimit(source!));
      damage(s, target!.id, 1);
      return true;
    case "mumakilPlayerJubayrOffer":
      if (
        source?.code === P.jubayr &&
        usable(source) &&
        !used(s, phaseLimit(source)) &&
        facedownShadows(s).length
      )
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Jubayr · Discard a facedown shadow card?",
          [
            ...facedownShadows(s).map(({ enemy, code, index }) => ({
              id: `${enemy.id}:${index}`,
              code: enemy.code,
              label: `Discard facedown shadow ${index + 1} from ${name(enemy)}`,
              effects: [
                fx("mumakilPlayerJubayrUse", {
                  source: source.id,
                  target: enemy.id,
                  value: index,
                  code,
                }),
              ],
            })),
            skip,
          ],
        );
      return true;
    case "mumakilPlayerJubayrUse": {
      requireRule(
        !!source &&
          !used(s, phaseLimit(source)) &&
          facedownShadows(s).some(
            ({ enemy, code, index }) =>
              enemy.id === e.target && index === e.value && code === e.code,
          ),
        "Jubayr needs the chosen physical facedown shadow.",
      );
      s.used.push(phaseLimit(source!));
      const code = removePlayerShadowCard(s, target!, e.value!);
      if (code) s.encounterDiscard.push(code);
      return true;
    }
    default:
      return false;
  }
}
