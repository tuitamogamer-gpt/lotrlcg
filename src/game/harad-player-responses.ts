import { HARAD_PLAYER as P } from "./harad-player-support";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  canGainResources,
  canPay,
  cannotReady,
  choose,
  fx,
  get,
  prepend,
  requireRule,
  skip,
  spendResources,
  stats,
} from "./core";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isHero } from "./card-types";
import { playerCardImmune } from "./card-immunity";
import { discardCharacter, discardHandCard, readyCharacter } from "./board";
import { choosePlayerResponse } from "./player-ability-triggers";
import { heirsCanSpendResources } from "./heirs-numenor";
import { discardableHand } from "./hand-rules";
import { drownedCannotReady } from "./drowned";
import { reduceThreat } from "./threat-reduction";

const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const used = (s: GameState, key: string) =>
  s.used.includes(key) ||
  !!s.table?.seats.some((seat) => seat.used.includes(key));
const limit = (u: Unit) => `phase:harad:${u.code}:${u.id}`;
const shield = (hero: Unit | undefined, id: string | undefined) =>
  hero?.attachments.find(
    (a) => a.id === id && a.code === P.shield && enabled(a),
  );
const partner = (source: Unit) =>
  source.code === P.gimli ? "Legolas" : "Gimli";
/** The identity bonus is a separate sentence, without a successful-ready Then. */
const targets = (s: GameState, source: Unit) =>
  allHeroes(s).filter(
    (hero) =>
      hero.id !== source.id &&
      !playerCardImmune(hero) &&
      ((hero.exhausted && !cannotReady(hero, s) && !drownedCannotReady(s)) ||
        card(hero.code).name === partner(source)),
  );
const gimliAvailable = (s: GameState, source: Unit) =>
  source.code === P.gimli &&
  isHero(source) &&
  !source.blanked &&
  source.resources > 0 &&
  heirsCanSpendResources(s, source) &&
  !used(s, limit(source)) &&
  targets(s, source).length > 0;
const legolasAvailable = (s: GameState, source: Unit) =>
  source.code === P.legolas &&
  isHero(source) &&
  !source.blanked &&
  !used(s, limit(source)) &&
  discardableHand(seatView(s, ownerOf(s, source))).length > 0 &&
  targets(s, source).length > 0;

/** Called after all actual defenders have been declared, before shadow resolution. */
export function haradDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return defenders
    .filter((hero) => gimliAvailable(s, hero))
    .map((hero) =>
      fx("haradGimliOffer", {
        source: hero.id,
        target: enemy.id,
        player: ownerOf(s, hero),
      }),
    );
}

/** Uses actual newly committed identities, including direct card-effect commitment. */
export function haradCharactersCommitted(s: GameState, ids: string[]) {
  prepend(
    s,
    ...ids.flatMap((id) => {
      const hero = get(s, id);
      return hero && legolasAvailable(s, hero)
        ? [fx("haradLegolasOffer", { source: id, player: ownerOf(s, hero) })]
        : [];
    }),
  );
}

export function haradWellWarnedCondition(s: GameState, player = activeSeat(s)) {
  const characters = allCharacters(s).filter(
    (u) => ownerOf(s, u) === player && card(u.code).is_unique,
  );
  return characters.some(
    (noble) =>
      hasTrait(noble, "Noble") &&
      characters.some(
        (scout) => scout.id !== noble.id && hasTrait(scout, "Scout"),
      ),
  );
}
const warnedCopies = (s: GameState, player: number) => {
  const p = seatView(s, player);
  return haradWellWarnedCondition(s, player)
    ? p.hand.filter(
        (u) =>
          u.code === P.wellWarned &&
          canPay(p, { ...card(u.code), playOwner: u.owner ?? player }),
      )
    : [];
};

/** Any eligible controller may respond; the engaged player's identity is captured. */
export function haradEnemyEngaged(s: GameState, enemy: Unit) {
  const engagedPlayer = activeSeat(s),
    printedThreat = Number(card(enemy.code).threat ?? 0);
  prepend(
    s,
    ...playerOrder(s).flatMap((player) =>
      warnedCopies(s, player).map((event) =>
        fx("haradWellWarnedOffer", {
          source: event.id,
          target: enemy.id,
          value: printedThreat,
          owner: engagedPlayer,
          player,
        }),
      ),
    ),
  );
}

/** Only surviving heroes that actually suffered enemy combat damage can respond. */
export function haradPlayerDamageTaken(
  s: GameState,
  hero: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    !isHero(hero) ||
    value <= 0 ||
    !context.combatDamage ||
    !context.enemyId ||
    hero.damage >= stats(s, hero).health ||
    !canGainResources(s, hero) ||
    playerCardImmune(hero)
  )
    return;
  prepend(
    s,
    ...hero.attachments
      .filter((a) => a.code === P.shield && enabled(a) && !a.exhausted)
      .map((a) =>
        fx("haradShieldOffer", {
          source: a.id,
          target: hero.id,
          player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
        }),
      ),
  );
}

/** Caller supplies the common When Revealed cancellation gate and physical continuation.
 * Unlike A Test of Will this ability also covers encounter side quests. */
export function haradWhenRevealedOptions(
  s: GameState,
  code: string,
  continuation: Effect,
): Option[] {
  if (
    continuation.revealOrigin === "underworld" ||
    !(s.victoryCards ?? []).some((c) =>
      ["player-side-quest", "encounter-side-quest"].includes(card(c).type_code),
    )
  )
    return [];
  return allCharacters(s)
    .filter((u) => u.code === P.bounder && !u.blanked && !playerCardImmune(u))
    .map((u) => ({
      id: `bounder-${u.id}`,
      code: u.code,
      label: `Discard Halfling Bounder${s.table ? ` · Player ${ownerOf(s, u) + 1}` : ""}`,
      ability: {
        player: ownerOf(s, u),
        source: u.id,
        code: u.code,
        type: "response",
      },
      effects: [
        fx("haradBounderDiscard", {
          source: u.id,
          code,
          player: ownerOf(s, u),
          effects: [{ ...continuation, flag: true }],
        }),
      ],
    }));
}

export function handleHaradResponseEffect(s: GameState, e: Effect): boolean {
  const source = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "haradGimliOffer":
      if (source && gimliAvailable(s, source))
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Gimli · Spend 1 resource to ready another hero?",
          [
            ...targets(s, source).map((hero) => ({
              id: hero.id,
              code: hero.code,
              label: `Ready ${name(hero)}${card(hero.code).name === "Legolas" ? " · +1 attack this phase" : ""}`,
              effects: [
                fx("haradGimliResolve", { source: source.id, target: hero.id }),
              ],
            })),
            skip,
          ],
        );
      return true;
    case "haradGimliResolve":
      requireRule(
        source &&
          target &&
          source.resources > 0 &&
          heirsCanSpendResources(s, source) &&
          !used(s, limit(source)) &&
          targets(s, source).some((u) => u.id === target.id),
        "Gimli requires his own resource and another eligible hero.",
      );
      spendResources(s, source, 1);
      s.used.push(limit(source));
      readyCharacter(s, target);
      if (card(target.code).name === "Legolas")
        target.tempAttack = (target.tempAttack ?? 0) + 1;
      return true;
    case "haradLegolasOffer":
      if (source && legolasAvailable(s, source))
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Legolas · Discard a card to ready another hero?",
          [
            ...targets(s, source).map((hero) => ({
              id: hero.id,
              code: hero.code,
              label: `Ready ${name(hero)}${card(hero.code).name === "Gimli" ? " · +1 willpower this phase" : ""}`,
              effects: [
                fx("haradLegolasDiscardChoice", {
                  source: source.id,
                  target: hero.id,
                }),
              ],
            })),
            skip,
          ],
        );
      return true;
    case "haradLegolasDiscardChoice":
      if (source && target)
        choose(
          s,
          "Legolas · Choose a card from your hand to discard",
          discardableHand(s).map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [{ ...e, kind: "haradLegolasResolve", text: u.id }],
          })),
        );
      return true;
    case "haradLegolasResolve":
      requireRule(
        source &&
          target &&
          !used(s, limit(source)) &&
          discardableHand(s).some((u) => u.id === e.text) &&
          targets(s, source).some((u) => u.id === target.id),
        "Legolas requires a physical card from his controller's hand and another eligible hero.",
      );
      discardHandCard(s, e.text!);
      s.used.push(limit(source));
      readyCharacter(s, target);
      if (card(target.code).name === "Gimli")
        target.tempWill = (target.tempWill ?? 0) + 1;
      return true;
    case "haradWellWarnedOffer": {
      const player = e.player ?? activeSeat(s),
        event = warnedCopies(s, player).find((u) => u.id === e.source);
      if (event && (e.value ?? 0) > 0)
        choosePlayerResponse(
          s,
          event.id,
          event.code,
          `Well Warned · Reduce Player ${(e.owner ?? player) + 1}'s threat by ${e.value}?`,
          [
            {
              id: event.id,
              code: event.code,
              label: "Play Well Warned",
              effects: [
                fx("eventPlay", {
                  source: event.id,
                  code: event.code,
                  player,
                  effects: [{ ...e, kind: "haradWellWarnedResolve" }],
                }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "haradWellWarnedResolve":
      forOwner(s, e.owner ?? activeSeat(s), () =>
        reduceThreat(s, e.value ?? 0, {
          id: e.source,
          code: P.wellWarned,
          owner: e.player,
        }),
      );
      return true;
    case "haradShieldOffer": {
      const a = shield(target, e.source);
      if (
        target &&
        a &&
        !a.exhausted &&
        canGainResources(s, target) &&
        !playerCardImmune(target)
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          `Dwarven Shield · Add 1 resource to ${name(target)}?`,
          [
            {
              id: "use",
              label: "Exhaust Dwarven Shield to add 1 resource",
              effects: [{ ...e, kind: "haradShieldResolve" }],
            },
            skip,
          ],
        );
      return true;
    }
    case "haradShieldResolve": {
      const a = shield(target, e.source);
      requireRule(
        target &&
          a &&
          !a.exhausted &&
          canGainResources(s, target) &&
          !playerCardImmune(target),
        "Dwarven Shield requires its surviving hero and ready attachment.",
      );
      a.exhausted = true;
      prepend(s, fx("resource", { target: target.id, value: 1 }));
      return true;
    }
    case "haradBounderDiscard":
      requireRule(
        source && source.code === P.bounder,
        "The physical Halfling Bounder must remain in play.",
      );
      discardCharacter(s, source);
      prepend(s, fx("afterPlayerAbility", { effects: e.effects ?? [] }));
      return true;
    default:
      return false;
  }
}
