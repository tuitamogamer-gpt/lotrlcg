import {
  ANGMAR as A,
  angmarDiscardEvents,
  angmarResponseEvents,
  angmarValour,
} from "./angmar-player-support";
import type {
  Attachment,
  Card,
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
  draw,
  fx,
  get,
  log,
  make,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  skip,
  spendResources,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  addVictoryCard,
  allyCanEnter,
  check,
  damage,
  characterLeftPlay,
  charactersCommitted,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardLocation,
  discardPlayerDeck,
  enterAlly,
  exhaustCharacter,
  progressLocation,
  raiseThreat,
  readyCharacter,
  returnAlly,
  spendEvent,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  eachSeat,
  firstPlayer,
  forOwner,
  globalEachSeat,
  ownerOf,
  playerOrder,
  seatView,
  seatIndices,
} from "./table";
import {
  effectiveKeyword,
  effectiveTraits,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { engagedEnemies } from "./considered-engagement";
import { playerCardImmune } from "./card-immunity";
import { selectedSideQuest } from "./side-quest-support";
import { reduceThreat } from "./threat-reduction";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { putPlayedEventInVictory } from "./event-resolution";
import {
  afterPlayerAbility,
  choosePlayerResponse,
} from "./player-ability-triggers";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import { applyCombatDamageConsequences } from "./combat";
import { isHero, isAlly } from "./card-types";
import { movableHand, canLeaveHand } from "./hand-rules";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsCanSpendResources } from "./heirs-numenor";
import { gondorResourcesGained } from "./gondor-player-cards";

const PREFIX = "phase:angmar:";
const ROUND = "round:angmar:";
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const affected = (u: Unit) => !playerCardImmune(u);
const ready = (s: GameState, u: Unit) =>
  u.exhausted && affected(u) && !cannotReady(u, s);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const marker = (s: GameState, key: string) =>
  playerOrder(s).some((p) => seatView(s, p).used.includes(key));
const mark = (s: GameState, key: string) =>
  eachSeat(s, () => {
    if (!s.used.includes(key)) s.used.push(key);
  });
const canExhaust = (u: Unit) =>
  !u.exhausted &&
  affected(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
const traitShared = (u: Unit, code: string) =>
  effectiveTraits(u).some((t) =>
    (card(code).traits ?? "").split(".").some((v) => v.trim() === t),
  );
const copies = (s: GameState, code: string, player = activeSeat(s)) => {
  const p = seatView(s, player);
  return p.hand.filter(
    (u) =>
      u.code === code &&
      canPay(p, { ...card(code), playOwner: u.owner ?? player }),
  );
};
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const response = (
  s: GameState,
  source: string,
  code: string,
  title: string,
  effects: Effect[],
) =>
  choosePlayerResponse(s, source, code, title, [
    { id: "use", code, label: "Use this response", effects },
    skip,
  ]);
const responseEvent = (s: GameState, u: Unit, effect: Effect): Option => ({
  id: u.id,
  code: u.code,
  label: `Play ${name(u)}`,
  ability: {
    player: activeSeat(s),
    source: u.id,
    code: u.code,
    type: "response",
  },
  effects: [fx("eventPlay", { code: u.code, source: u.id, effects: [effect] })],
});

export function angmarStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0 };
  if (!affected(u)) return result;
  const p = seatView(s, ownerOf(s, u)),
    n = engagedEnemies(s, ownerOf(s, u)).length;
  if (!u.blanked) {
    if (u.code === A.ingold)
      result.will += p.heroes.filter((h) => h.resources > 0).length;
    if (u.code === A.ranger && u.committed && !!selectedSideQuest(s))
      result.will += 2;
    if (u.code === A.veteran && p.threat >= 40) {
      result.will++;
      result.attack++;
      result.defense++;
    }
    if (u.code === A.guardian) result.defense += n;
    if (u.code === A.bowman) result.attack += n;
    if (
      u.code === A.rossiel &&
      allActiveLocations(s).some((l) =>
        (s.victoryCards ?? []).some(
          (code) => card(code).type_code === "location" && traitShared(l, code),
        ),
      )
    )
      result.will += 2;
  }
  result.attack += u.attachments.filter(
    (a) => a.code === A.sword && enabled(a),
  ).length;
  const bonuses = seatIndices(s).reduce(
    (n, player) =>
      n +
      seatView(s, player).used.filter((k) =>
        k.startsWith(`${ROUND}lords:${u.id}:`),
      ).length,
    0,
  );
  result.will += bonuses;
  result.attack += bonuses;
  result.defense += bonuses;
  return result;
}
export const angmarDefenseBonus = (s: GameState, u: Unit, enemy: Unit) =>
  u.code === A.rossiel &&
  !u.blanked &&
  affected(u) &&
  (s.victoryCards ?? []).some(
    (code) => card(code).type_code === "enemy" && traitShared(enemy, code),
  )
    ? 2
    : 0;
export const angmarResourceIcons = (s: GameState, u: Unit) =>
  u.code === A.amarthiul &&
  !u.blanked &&
  engagedEnemies(s, ownerOf(s, u)).length
    ? ["tactics"]
    : [];
export const angmarDynamicKeywords = (s: GameState, u: Unit) =>
  marker(s, `${PREFIX}sentinel:${u.id}`) ? ["Sentinel"] : [];
export const angmarResourceBonus = (s: GameState, u: Unit) =>
  u.code === A.amarthiul &&
  !u.blanked &&
  engagedEnemies(s, ownerOf(s, u)).length >= 2
    ? 1
    : 0;
export const angmarResourceDrawBonus = (s: GameState, player = activeSeat(s)) =>
  seatView(s, player).heroes.filter((u) => u.code === A.erestor && !u.blanked)
    .length * 3;
export const angmarNoCombatExhaust = (s: GameState, u: Unit) =>
  marker(s, `${PREFIX}wrath:${u.id}`);
export const angmarPreventQuestThreat = (s: GameState) =>
  marker(s, `${ROUND}doom`);
export const angmarSkipQuest = (s: GameState) =>
  marker(s, `${ROUND}skip-quest`);
export function angmarPlayCost(s: GameState, c: Card, cost: number) {
  if (c.code === A.lances)
    cost -= (s.victoryCards ?? []).filter((code) => !card(code).victory).length;
  if (c.type_code === "event" && /Valour/.test(c.text ?? ""))
    cost -= s.used.filter((k) => k === `${PREFIX}hope`).length * 2;
  return Math.max(0, cost);
}
export function angmarEventPlayed(s: GameState, code: string) {
  if (/Valour/.test(card(code).text ?? ""))
    s.used = s.used.filter((k) => k !== `${PREFIX}hope`);
}
export function angmarAllyEntering(u: Unit) {
  if (
    !u.blanked &&
    [A.warrior, A.preserver, A.beechbone].includes(u.code as typeof A.warrior)
  )
    u.exhausted = true;
}
function entryResponseAvailable(s: GameState, u: Unit) {
  const p = seatView(s, ownerOf(s, u));
  if (u.code === A.weaver)
    return p.discard.length > 0 && !dikeCannotLeaveDiscard(p);
  if (u.code === A.lindir) return p.hand.length < 3;
  if (u.code === A.healer)
    return allHeroes(s).some(
      (h) => affected(h) && rhosgobelHealingAllowed(s, h),
    );
  return false;
}
export function angmarAllyEntered(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (entryResponseAvailable(s, u))
    prepend(
      s,
      fx("angmarEntryOffer", {
        target: u.id,
        code: u.code,
        player: ownerOf(s, u),
      }),
    );
}

export const angmarThreatTarget = (s: GameState, player: number): Unit => ({
  id: `threat:${player}`,
  code: A.favor,
  owner: player,
  exhausted: false,
  damage: 0,
  progress: 0,
  resources: 0,
  committed: false,
  attachments: seatView(s, player).threatAttachments ?? [],
  boost: 0,
  attacked: false,
  shadows: [],
});
export function angmarPlayTargets(s: GameState, code: string): Unit[] | null {
  const heroes = allHeroes(s).filter(affected),
    chars = allCharacters(s).filter(affected);
  if (code === A.favor)
    return playerOrder(s)
      .filter(
        (p) => !seatView(s, p).threatAttachments?.some((a) => a.code === code),
      )
      .map((p) => angmarThreatTarget(s, p));
  if (code === A.helm)
    return heroes.filter(
      (u) =>
        effectiveKeyword(u, "Sentinel") &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === A.pony) return heroes.filter((u) => hasTrait(u, "Hobbit"));
  if (code === A.steed)
    return heroes.filter(
      (u) => hasTrait(u, "Noldor") || hasResourceIcon(u, "spirit"),
    );
  if (code === A.spear)
    return heroes.filter((u) => hasTrait(u, "Noldor") || hasTrait(u, "Silvan"));
  if (code === A.harp)
    return heroes.filter((u) => hasResourceIcon(u, "spirit"));
  if (code === A.sword)
    return heroes.filter(
      (u) => hasTrait(u, "Dúnedain") || hasTrait(u, "Gondor"),
    );
  if (code === A.cloak)
    return chars.filter(
      (u) =>
        hasTrait(u, "Ranger") && !u.attachments.some((a) => a.code === code),
    );
  if (code === A.thain)
    return chars.filter(
      (u) =>
        card(u.code).type_code === "ally" &&
        card(u.code).is_unique &&
        card(u.code).sphere_code !== "neutral" &&
        card(u.code).sphere_code !== "encounter" &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === A.provisions)
    return [...s.staging, ...allActiveLocations(s)].filter(
      (u) =>
        card(u.code).type_code === "location" &&
        affected(u) &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === A.fair)
    return chars.filter((u) => hasTrait(u, "Noldor") || hasTrait(u, "Silvan"));
  if (code === A.ground)
    return chars.filter((u) => effectiveKeyword(u, "Sentinel") && ready(s, u));
  if (code === A.wrath) return heroes;
  return null;
}
export function angmarPlayProblem(
  s: GameState,
  code: string,
  origin: Card["playOrigin"] = "hand",
) {
  if (angmarDiscardEvents.includes(code) && origin !== "discard")
    return `${card(code).name} can only be played from your discard pile.`;
  if (angmarResponseEvents.includes(code))
    return "Use this card's response window.";
  if (code === A.rally && !angmarValour(s))
    return "Rallying Cry's Action requires Valour; its ordinary Response uses the ally-leaves-play window.";
  if (code === A.doom && s.phase !== "planning")
    return "Doom Hangs Still is a Planning Action.";
  if (
    code === A.stars &&
    (!allActiveLocations(s).some(
      (u) => !card(u.code).is_unique && affected(u),
    ) ||
      ![...s.heroes, ...s.allies].some(
        (u) => canExhaust(u) && (hasTrait(u, "Ranger") || hasTrait(u, "Scout")),
      ))
  )
    return "Distant Stars needs a non-unique active location and a ready Ranger or Scout.";
  if (
    code === A.tale &&
    ![...s.heroes, ...s.allies].some(
      (u) =>
        canExhaust(u) && (hasTrait(u, "Noldor") || hasTrait(u, "Dúnedain")),
    )
  )
    return "Tale of Tinúviel needs a ready Noldor or Dúnedain character.";
  return null;
}
const modes = (s: GameState, code: string, normal: Effect, valour: Effect) => {
  if (!angmarValour(s)) {
    prepend(s, normal);
    return;
  }
  choose(s, `${card(code).name} · Choose the printed Action`, [
    { id: "normal", label: "Use the ordinary Action", effects: [normal] },
    { id: "valour", label: "Use the Valour Action", effects: [valour] },
  ]);
};
function moveSelfEvent(
  s: GameState,
  code: string,
  destination: "hand" | "bottom",
) {
  const event = [...(s.resolvingEvents ?? [])]
    .reverse()
    .find((e) => e.unit.code === code && e.player === activeSeat(s));
  requireRule(event, "The resolving physical event must exist.");
  s.resolvingEvents = s.resolvingEvents!.filter((e) => e !== event);
  if (!s.resolvingEvents.length) delete s.resolvingEvents;
  if (destination === "hand") s.hand.push(event.unit);
  else putPlayerDeck(s, event.unit);
  return event.unit.id;
}
export function angmarEvent(
  s: GameState,
  code: string,
  target?: string,
  _physical?: Unit,
) {
  const u = get(s, target);
  switch (code) {
    case A.rally:
      mark(s, `${PREFIX}rally`);
      return true;
    case A.descendants:
      prepend(
        s,
        fx("angmarDescendants", { value: engagedEnemies(s).length, ids: [] }),
      );
      return true;
    case A.message:
      choose(s, "Dúnedain Message · Choose a side quest", [
        ...s.deck.flatMap((code, value) =>
          card(code).type_code === "player-side-quest"
            ? [
                {
                  id: `card-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("angmarDeckTake", { value })],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Take no card · Shuffle",
          effects: [fx("angmarDeckTake")],
        },
      ]);
      return true;
    case A.fair:
      requireRule(u && affected(u), "Choose a Noldor or Silvan character.");
      u.tempAttack = (u.tempAttack ?? 0) + stats(s, u).will;
      return true;
    case A.stars:
      choose(
        s,
        "Distant Stars · Exhaust a Ranger or Scout",
        [...s.heroes, ...s.allies]
          .filter(
            (u) =>
              canExhaust(u) && (hasTrait(u, "Ranger") || hasTrait(u, "Scout")),
          )
          .map((u) => option(u, [fx("angmarStarsCost", { target: u.id })])),
      );
      return true;
    case A.lances:
      putPlayedEventInVictory(s, code);
      choose(s, "Keen as Lances", [
        {
          id: "resources",
          label: "Add 2 resources to a hero",
          effects: [fx("angmarLancesResources")],
        },
        {
          id: "draw",
          label: "Draw 3 cards",
          effects: [fx("draw", { value: 3 })],
        },
        {
          id: "threat",
          label: "Reduce your threat by 4",
          effects: [fx("angmarLancesThreat")],
        },
      ]);
      return true;
    case A.hope:
      modes(s, code, fx("angmarHopeDiscount"), fx("angmarHopeSearch"));
      return true;
    case A.reinforcements:
      prepend(s, fx("angmarReinforcements", { value: 2, ids: [] }));
      return true;
    case A.cry:
      modes(s, code, fx("angmarCry", { value: 1 }), fx("angmarCryPlayer"));
      return true;
    case A.doom:
      modes(s, code, fx("angmarDoom"), fx("angmarDoomValour"));
      return true;
    case A.ground:
      modes(s, code, fx("angmarGround", { target }), fx("angmarGroundAll"));
      return true;
    case A.lords: {
      const id = moveSelfEvent(s, code, "bottom");
      for (const target of allCharacters(s).filter(
        (u) => hasTrait(u, "Noldor") && affected(u),
      ))
        seatView(s, ownerOf(s, target)).used.push(
          `${ROUND}lords:${target.id}:${id}`,
        );
      return true;
    }
    case A.wrath:
      modes(s, code, fx("angmarWrath", { target }), fx("angmarWrathPlayer"));
      return true;
    case A.light:
      moveSelfEvent(s, code, "hand");
      draw(s, 1);
      return true;
    case A.tale:
      choose(
        s,
        "Tale of Tinúviel · Exhaust a character",
        [...s.heroes, ...s.allies]
          .filter(
            (u) =>
              canExhaust(u) &&
              (hasTrait(u, "Noldor") || hasTrait(u, "Dúnedain")),
          )
          .map((u) => option(u, [fx("angmarTaleExhaust", { target: u.id })])),
      );
      return true;
    default:
      return false;
  }
}

export const angmarAbilityLabel = (code: string) =>
  (
    ({
      [A.pony]: "Exhaust Hobbit Pony and hero · Commit to the quest",
      [A.warrior]: "Deal 1 damage · Gain +3 defense for this attack",
      [A.jeweler]: "Discard 2 hand cards · Put Elven Jeweler into play",
      [A.sentry]: "Discard top 2 cards · Gain Sentinel and +1 defense",
      [A.spear]: "Discard a hand card · Gain +1 attack",
      [A.arwen]: "Discard a hand card · Add 1 resource",
    }) as Record<string, string>
  )[code] ?? null;
function abilityAttachment(s: GameState, u: Unit, id?: string) {
  return u.attachments.find(
    (a) =>
      a.id === id &&
      enabled(a) &&
      attachmentController(s, u, a) === activeSeat(s),
  );
}
export function angmarAbilityProblem(s: GameState, u: Unit, id?: string) {
  const a = abilityAttachment(s, u, id),
    code = a?.code ?? u.code;
  if (!a && (u.blanked || ownerOf(s, u) !== activeSeat(s)))
    return "Choose an active character you control.";
  if (code === A.pony)
    return !a ||
      a.exhausted ||
      !canExhaust(u) ||
      ownerOf(s, u) !== activeSeat(s) ||
      u.committed ||
      !["quest", "staging"].includes(s.phase)
      ? "Hobbit Pony needs a ready, uncommitted hero during the quest phase."
      : null;
  if (code === A.warrior)
    return !s.combat ||
      (s.combat.defenderId !== u.id && !s.combat.defenderIds?.includes(u.id)) ||
      s.used.includes(`${PREFIX}warrior:${u.id}:${s.combat.enemyId}`)
      ? "Derndingle Warrior must be defending and may act once per attack."
      : null;
  if (code === A.jeweler)
    return !s.hand.some((h) => h.id === u.id) ||
      movableHand(s).filter((h) => h.id !== u.id).length < 2 ||
      !allyCanEnter(s, u.code)
      ? "Elven Jeweler needs two other hand cards and a legal entry."
      : null;
  if (code === A.sentry)
    return s.deck.length < 2 || s.used.includes(`${PREFIX}sentry:${u.id}`)
      ? "Longbeard Sentry needs two deck cards and an unused phase action."
      : null;
  if (code === A.spear)
    return !a ||
      !movableHand(s).length ||
      s.used.filter((k) => k === `${PREFIX}spear:${a.id}`).length >= 3
      ? "Elven Spear needs a hand card and fewer than three uses this phase."
      : null;
  if (code === A.arwen)
    return !movableHand(s).length ||
      s.used.includes(`${ROUND}arwen:${u.id}`) ||
      !allHeroes(s).some(
        (h) =>
          affected(h) &&
          canGainResources(s, h) &&
          (hasTrait(h, "Noldor") || card(h.code).name === "Aragorn"),
      )
      ? "Arwen needs a hand card, an eligible resource pool and an unused round action."
      : null;
  return "This card has no Angmar Action.";
}
export function useAngmarAbility(s: GameState, u: Unit, id?: string) {
  const a = abilityAttachment(s, u, id),
    code = a?.code ?? u.code;
  if (!angmarAbilityLabel(code)) return false;
  requireRule(
    !angmarAbilityProblem(s, u, id),
    angmarAbilityProblem(s, u, id) ?? "",
  );
  if (code === A.pony) {
    a!.exhausted = true;
    requireRule(exhaustCharacter(s, u), "The hero must exhaust to commit.");
    u.committed = true;
    s.committedIds = s.committedIds.filter((id) => id !== u.id);
    charactersCommitted(s, [u], [u.id]);
  }
  if (code === A.warrior) {
    s.used.push(`${PREFIX}warrior:${u.id}:${s.combat!.enemyId}`);
    requireRule(
      damage(s, u.id, 1, { cost: true }),
      "The damage cost must be paid.",
    );
    if (get(s, u.id)) {
      s.combat!.defenseBonuses ??= {};
      s.combat!.defenseBonuses[u.id] =
        (s.combat!.defenseBonuses[u.id] ?? 0) + 3;
    }
  }
  if (code === A.sentry) {
    s.used.push(`${PREFIX}sentry:${u.id}`);
    discardPlayerDeck(s, 2);
    if (get(s, u.id)) {
      u.tempDefense = (u.tempDefense ?? 0) + 1;
      u.dynamicKeywords = [...(u.dynamicKeywords ?? []), "Sentinel"];
      mark(s, `${PREFIX}sentinel:${u.id}`);
    }
  }
  if ([A.jeweler, A.spear, A.arwen].includes(code as typeof A.jeweler))
    choose(
      s,
      `${card(code).name} · Discard a hand card`,
      movableHand(s)
        .filter((h) => code !== A.jeweler || h.id !== u.id)
        .map((h) =>
          option(h, [
            fx("angmarDiscardCost", {
              source: u.id,
              target: h.id,
              text: a?.id,
              code,
              value: code === A.jeweler ? 2 : 1,
            }),
          ]),
        ),
    );
  return true;
}

export function angmarSyncSwordThain(s: GameState) {
  eachSeat(s, () => {
    for (const u of [...s.allies])
      if (isHero(u)) {
        s.allies = s.allies.filter((a) => a.id !== u.id);
        s.heroes.push(u);
      }
    for (const u of [...s.heroes])
      if (isAlly(u)) {
        s.heroes = s.heroes.filter((h) => h.id !== u.id);
        s.allies.push(u);
      }
  });
}
export function angmarRevealed(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
) {
  if (origin !== "encounter" || card(code).type_code !== "enemy") return;
  const revealedEnemy: Unit = {
    ...angmarThreatTarget(s, activeSeat(s)),
    id: `revealed:${code}`,
    code,
    attachments: [],
  };
  for (const hero of allHeroes(s).filter(
    (h) => h.code === A.merry && !h.blanked && canExhaust(h),
  ))
    prepend(
      s,
      fx("angmarMerryOffer", {
        source: hero.id,
        code,
        value: threatOf(s, revealedEnemy),
        player: ownerOf(s, hero),
      }),
    );
}
export function angmarRevealOptions(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
  resume?: Effect,
): Option[] {
  if (origin !== "encounter") return [];
  const result: Option[] = [];
  for (const player of playerOrder(s)) {
    const p = seatView(s, player);
    if ((s.victoryCards ?? []).some((v) => card(v).name === card(code).name))
      for (const event of copies(s, A.door, player))
        result.push({
          id: `door-${event.id}`,
          code: event.code,
          label: `The Door is Closed! · Player ${player + 1}`,
          ability: {
            player,
            source: event.id,
            code: event.code,
            type: "response",
          },
          effects: [
            fx("angmarCancelEncounter", {
              code,
              source: event.id,
              player,
              effects: resume ? [resume] : undefined,
            }),
          ],
        });
    if (card(code).type_code === "enemy")
      for (const event of copies(s, A.ears, player))
        for (const hero of p.heroes.filter(
          (h) =>
            canExhaust(h) && (hasTrait(h, "Dúnedain") || hasTrait(h, "Ranger")),
        ))
          result.push({
            id: `ears-${event.id}-${hero.id}`,
            code: event.code,
            label: `Quick Ears · Exhaust ${name(hero)} · Player ${player + 1}`,
            ability: {
              player,
              source: event.id,
              code: event.code,
              type: "response",
            },
            effects: [
              fx("angmarCancelEncounter", {
                code,
                source: event.id,
                target: hero.id,
                player,
                flag: true,
                effects: resume ? [resume] : undefined,
              }),
            ],
          });
  }
  return result;
}
export function angmarCharactersCommitted(s: GameState, ids: string[]) {
  for (const id of ids) {
    const u = get(s, id);
    if (!u) continue;
    for (const a of u.attachments.filter(
      (a) => a.code === A.steed && enabled(a),
    )) {
      const player = attachmentController(s, u, a) ?? ownerOf(s, u);
      if (
        movableHand(seatView(s, player)).length &&
        allActiveLocations(s).some(affected)
      )
        prepend(
          s,
          fx("angmarSteedOffer", { source: a.id, target: u.id, player }),
        );
    }
  }
}
export function angmarCharacterReadied(s: GameState, u: Unit) {
  if (
    u.code === A.preserver &&
    !u.blanked &&
    allCharacters(s).some(
      (t) => hasTrait(t, "Ent") && affected(t) && rhosgobelHealingAllowed(s, t),
    )
  )
    prepend(
      s,
      fx("angmarPreserverOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function angmarDamageTaken(s: GameState, u: Unit, value: number) {
  if (value <= 0 || !hasTrait(u, "Ent") || u.damage >= stats(s, u).health)
    return;
  for (const player of playerOrder(s))
    if (copies(s, A.boomed, player).length)
      prepend(s, fx("angmarBoomedOffer", { target: u.id, player }));
}
type DamageSource = {
  unit: Unit;
  attachment?: Attachment;
  player: number;
  max: number;
  discard?: boolean;
};
function preventionSources(
  s: GameState,
  target: Unit,
  value: number,
): DamageSource[] {
  const sources: DamageSource[] = [];
  if (!affected(target)) return sources;
  for (const guard of allCharacters(s).filter(
    (u) => u.code === A.guard && !u.blanked && canExhaust(u),
  )) {
    const player = ownerOf(s, guard);
    sources.push({ unit: guard, player, max: 1 });
    if (angmarValour(seatView(s, player)))
      sources.push({
        unit: guard,
        player,
        max: Math.min(5, value),
        discard: true,
      });
  }
  for (const a of target.attachments.filter(
    (a) =>
      enabled(a) &&
      !a.exhausted &&
      (a.code === A.helm || (a.code === A.cloak && target.committed)),
  ))
    sources.push({
      unit: target,
      attachment: a,
      player: attachmentController(s, target, a) ?? ownerOf(s, target),
      max: 1,
    });
  return sources;
}
export function offerAngmarDamage(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
): boolean {
  if (
    context.cost ||
    context.bypassAngmar ||
    !preventionSources(s, u, value).length
  )
    return false;
  prepend(
    s,
    fx("angmarDamageWindow", {
      target: u.id,
      value,
      text: encodeDamageContext(context),
      player: activeSeat(s),
    }),
  );
  return true;
}
export function angmarDefenderDeclared(s: GameState, u: Unit) {
  if (!isHero(u) || !s.combat) return;
  for (const dori of allHeroes(s).filter(
    (h) => h.id !== u.id && h.code === A.dori && !h.blanked && canExhaust(h),
  ))
    prepend(
      s,
      fx("angmarDoriOffer", {
        source: dori.id,
        target: u.id,
        text: s.combat.enemyId,
        player: ownerOf(s, dori),
      }),
    );
}
export function angmarAttackDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
) {
  for (const u of attackers.filter(
    (u) => u.code === A.beechbone && !u.blanked && affected(u),
  ))
    prepend(
      s,
      fx("angmarBeechboneOffer", {
        source: u.id,
        target: enemy.id,
        player: ownerOf(s, u),
      }),
    );
}
export function angmarEnemyDestroyed(
  s: GameState,
  u: Unit,
  _attackers: Unit[] = [],
) {
  if (!card(u.code).is_unique) {
    for (const player of playerOrder(s))
      if (
        copies(s, A.none, player).length &&
        (s.victoryCards ?? []).filter((c) => c === A.none).length < 3
      )
        prepend(
          s,
          fx("angmarVictoryOffer", {
            source: u.id,
            code: A.none,
            text: u.code,
            value: s.encounterDiscard.lastIndexOf(u.code),
            player,
          }),
        );
  }
}
export function angmarAttackKilled(
  s: GameState,
  u: Unit,
  attackerIds: string[],
) {
  if ((card(u.code).health ?? 0) >= 5)
    for (const hero of attackerIds
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u))
      for (const a of hero.attachments.filter(
        (a) => a.code === A.sword && enabled(a) && !a.exhausted,
      ))
        prepend(
          s,
          fx("angmarSwordOffer", {
            source: a.id,
            target: hero.id,
            player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
          }),
        );
}
export function angmarLocationExplored(
  s: GameState,
  u: Unit,
  discardIndex: number | undefined,
  attachments: Attachment[],
  wasActive = true,
) {
  if (wasActive)
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        for (const ally of [...s.allies].filter(
          (a) => a.code === A.brandybuck && !a.blanked,
        ))
          prepend(s, fx("angmarBrandybuckBottom", { target: ally.id, player }));
      });
  if (!card(u.code).is_unique && discardIndex !== undefined)
    for (const player of playerOrder(s))
      if (
        copies(s, A.trace, player).length &&
        (s.victoryCards ?? []).filter((c) => c === A.trace).length < 3
      )
        prepend(
          s,
          fx("angmarVictoryOffer", {
            source: u.id,
            code: A.trace,
            text: u.code,
            value: discardIndex,
            player,
          }),
        );
  for (const a of attachments.filter(
    (a) => a.code === A.provisions && enabled(a),
  ))
    prepend(
      s,
      fx("angmarProvisionsOffer", {
        source: a.id,
        code: a.code,
        player: a.controller ?? a.owner ?? firstPlayer(s),
      }),
    );
}
export function angmarTraveled(s: GameState) {
  for (const player of playerOrder(s))
    if (
      seatView(s, player).hand.some((u) => u.code === A.brandybuck) &&
      allyCanEnter(seatView(s, player), A.brandybuck)
    )
      prepend(s, fx("angmarBrandybuckOffer", { player }));
}
export function angmarEngaged(s: GameState, _u: Unit) {
  if (
    s.heroes.some((h) => hasTrait(h, "Dúnedain")) &&
    s.heroes.some((h) => h.resources > 0 && heirsCanSpendResources(s, h)) &&
    s.hand.some((u) => u.code === A.cardolan) &&
    allyCanEnter(s, A.cardolan)
  )
    prepend(s, fx("angmarCardolanOffer", { player: activeSeat(s) }));
}
export function angmarCharacterLeft(
  s: GameState,
  u: Unit,
  controller: number,
  destination: { zone: string; player: number; index?: number },
  byCardEffect = false,
  lastKnownType = card(u.code).type_code,
) {
  globalEachSeat(
    s,
    () => {
      const keys = [
        `${PREFIX}reinforcement:${u.id}`,
        `${PREFIX}sentinel:${u.id}`,
        `${PREFIX}sentry:${u.id}`,
        `${PREFIX}wrath:${u.id}`,
        `${ROUND}cardolan:${u.id}`,
        `${ROUND}galdor:${u.id}`,
        `${ROUND}arwen:${u.id}`,
      ];
      s.used = s.used.filter(
        (k) =>
          !keys.includes(k) &&
          !k.startsWith(`${ROUND}lords:${u.id}:`) &&
          !k.startsWith(`${PREFIX}warrior:${u.id}:`),
      );
    },
    true,
  );
  if (lastKnownType !== "ally") return;
  if (byCardEffect && destination.zone === "discard" && hasTrait(u, "Rohan"))
    for (const eothain of allCharacters(s).filter(
      (a) => a.code === A.eothain && !a.blanked && ready(s, a),
    ))
      prepend(
        s,
        fx("angmarEothainOffer", {
          source: eothain.id,
          player: ownerOf(s, eothain),
        }),
      );
  if (destination.zone !== "discard" || destination.index === undefined) return;
  if (marker(s, `${PREFIX}rally`)) {
    prepend(
      s,
      fx("angmarRallyReturn", {
        source: u.id,
        code: u.code,
        owner: destination.player,
        value: destination.index,
      }),
    );
    return;
  }
  for (const player of playerOrder(s))
    if (copies(s, A.rally, player).length)
      prepend(
        s,
        fx("angmarRallyOffer", {
          source: u.id,
          code: u.code,
          owner: destination.player,
          value: destination.index,
          player,
          count: controller,
        }),
      );
}
export function angmarHandDiscarded(
  s: GameState,
  u: Unit,
  controller: number,
  index: number,
) {
  for (const hero of allHeroes(s))
    for (const a of hero.attachments.filter(
      (a) =>
        a.code === A.harp &&
        enabled(a) &&
        !a.exhausted &&
        (attachmentController(s, hero, a) ?? ownerOf(s, hero)) === controller,
    ))
      prepend(
        s,
        fx("angmarHarpOffer", {
          source: a.id,
          target: hero.id,
          code: u.code,
          text: u.id,
          owner: u.owner ?? controller,
          value: index,
          player: controller,
        }),
      );
  for (const galdor of seatView(s, controller).allies.filter(
    (a) =>
      a.code === A.galdor &&
      !a.blanked &&
      !seatView(s, controller).used.includes(`${ROUND}galdor:${a.id}`),
  ))
    prepend(
      s,
      fx("angmarGaldorOffer", { source: galdor.id, player: controller }),
    );
}
export function angmarSideDefeated(s: GameState, u: Unit) {
  if (
    !u.blanked &&
    [A.scout, A.double, A.delay, A.aid].includes(u.code as typeof A.scout)
  )
    prepend(
      s,
      fx("angmarSideOffer", {
        source: u.id,
        code: u.code,
        player: u.controller ?? u.owner ?? firstPlayer(s),
      }),
    );
}
export function angmarPhaseEnd(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      for (const key of [...s.used].filter((k) =>
        k.startsWith(`${PREFIX}reinforcement:`),
      )) {
        const u = get(s, key.slice(`${PREFIX}reinforcement:`.length));
        if (u && isAlly(u)) returnAlly(s, u);
      }
      for (const key of s.used.filter((k) =>
        k.startsWith(`${PREFIX}sentinel:`),
      )) {
        const u = get(s, key.slice(`${PREFIX}sentinel:`.length));
        if (u)
          u.dynamicKeywords = u.dynamicKeywords?.filter(
            (k) => k !== "Sentinel",
          );
      }
    });
}
export function angmarRoundEnd(s: GameState): Effect[] {
  const result: Effect[] = [];
  for (const player of playerOrder(s)) {
    const p = seatView(s, player);
    if (p.heroes.some((h) => h.code === A.erestor && !h.blanked))
      result.push(fx("angmarErestorDiscard", { player }));
    for (const key of p.used.filter((k) => k.startsWith(`${ROUND}cardolan:`)))
      result.push(
        fx("angmarCardolanShuffle", {
          target: key.slice(`${ROUND}cardolan:`.length),
          player,
        }),
      );
  }
  return result;
}

export const angmarHandAbilities = (s: GameState) =>
  s.hand.filter((u) => u.code === A.jeweler && !angmarAbilityProblem(s, u));
const attachment = (s: GameState, target?: string, source?: string) =>
  get(s, target)?.attachments.find((a) => a.id === source && enabled(a));
const pendingEventVictory = (s: GameState, code: string) =>
  (s.victoryCards ?? []).filter((c) => c === code).length +
  (s.resolvingEvents ?? []).filter(
    (e) => e.unit.code === code && e.destination === "victory",
  ).length;
function resumeAngmarDamage(s: GameState, e: Effect, context: DamageContext) {
  const u = get(s, e.target);
  if (!u) return;
  if ((e.value ?? 0) <= 0) {
    check(s);
    return;
  }
  const remaining = stats(s, u).health - u.damage,
    enemy = get(s, context.enemyId);
  if (damage(s, u.id, e.value!, context) && enemy && context.combatDamage)
    applyCombatDamageConsequences(s, u, enemy, e.value!, remaining);
}
export function angmarEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("angmar")) return false;
  const u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "angmarEntryOffer":
      if (u && !u.blanked && entryResponseAvailable(s, u))
        response(s, u.id, u.code, `${name(u)} · Enters play`, [
          fx("angmarEntryResolve", { target: u.id, code: u.code }),
        ]);
      break;
    case "angmarEntryResolve":
      if (!u || u.blanked) break;
      if (
        u.code === A.weaver &&
        s.discard.length &&
        !dikeCannotLeaveDiscard(s)
      ) {
        const taken = takePlayerDiscard(s, s.discard.length - 1);
        putPlayerDeck(s, taken);
        shuffle(s, s.deck);
      }
      if (u.code === A.lindir) draw(s, Math.max(0, 3 - s.hand.length));
      if (u.code === A.healer)
        choose(
          s,
          "Galadhrim Healer · Choose a player",
          playerOrder(s)
            .filter((player) =>
              seatView(s, player).heroes.some(
                (h) => affected(h) && rhosgobelHealingAllowed(s, h),
              ),
            )
            .map((player) => ({
              id: `player-${player}`,
              label: `Player ${player + 1}`,
              effects: [fx("angmarHealer", { player })],
            })),
        );
      break;
    case "angmarHealer":
      for (const h of s.heroes)
        if (affected(h) && rhosgobelHealingAllowed(s, h))
          rhosgobelHeal(s, h, 1, { code: A.healer, player: activeSeat(s) });
      break;
    case "angmarDescendants": {
      const left = e.value ?? 0;
      choose(s, "Descendants of Kings · Ready a Dúnedain character", [
        ...(left > 0
          ? [...s.heroes, ...s.allies]
              .filter((u) => hasTrait(u, "Dúnedain") && ready(s, u))
              .map((u) =>
                option(u, [
                  fx("angmarDescendantsReady", { target: u.id, value: left }),
                ]),
              )
          : []),
        { id: "done", label: "Finish readying", effects: [] },
      ]);
      break;
    }
    case "angmarDescendantsReady":
      if (u) {
        readyCharacter(s, u);
        if ((e.value ?? 0) > 1)
          prepend(s, fx("angmarDescendants", { value: e.value! - 1 }));
      }
      break;
    case "angmarDeckTake":
      if (e.value !== undefined && e.value >= 0 && e.value < s.deck.length)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "angmarStarsCost":
      requireRule(
        u && exhaustCharacter(s, u),
        "Exhaust the chosen Ranger or Scout.",
      );
      choose(
        s,
        "Distant Stars · Discard an active location",
        allActiveLocations(s)
          .filter((u) => !card(u.code).is_unique && affected(u))
          .map((u) => option(u, [fx("angmarStarsDiscard", { target: u.id })])),
      );
      break;
    case "angmarStarsDiscard": {
      if (
        !u ||
        card(u.code).is_unique ||
        !affected(u) ||
        !allActiveLocations(s).some((l) => l.id === u.id)
      )
        break;
      // Shared departure hooks run without granting exploration or victory points.
      discardLocation(s, u);
      choose(s, "Distant Stars · Make a location active", [
        ...s.encounterDeck.flatMap((code, value) =>
          card(code).type_code === "location" && !card(code).is_unique
            ? [
                {
                  id: `deck-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("angmarStarsActive", { code, value })],
                },
              ]
            : [],
        ),
        ...s.encounterDiscard.flatMap((code, value) =>
          card(code).type_code === "location" && !card(code).is_unique
            ? [
                {
                  id: `discard-${value}`,
                  code,
                  label: `${card(code).name} · Discard`,
                  effects: [
                    fx("angmarStarsActive", { code, value, flag: true }),
                  ],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Do not find a location · Shuffle",
          effects: [fx("angmarStarsActive")],
        },
      ]);
      break;
    }
    case "angmarStarsActive": {
      const zone = e.flag ? s.encounterDiscard : s.encounterDeck;
      if (e.value !== undefined && zone[e.value] === e.code) {
        const location = make(s, zone.splice(e.value, 1)[0]);
        if (s.activeLocation) (s.extraActiveLocations ??= []).push(location);
        else s.activeLocation = location;
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "angmarLancesResources":
      choose(
        s,
        "Keen as Lances · Choose a hero",
        allHeroes(s)
          .filter((u) => affected(u) && canGainResources(s, u))
          .map((u) =>
            option(u, [fx("angmarGain", { target: u.id, value: 2 })]),
          ),
      );
      break;
    case "angmarGain":
      if (u && affected(u) && canGainResources(s, u)) {
        u.resources += e.value ?? 0;
        gondorResourcesGained(s, u, e.value ?? 0, true);
      }
      break;
    case "angmarLancesThreat":
      reduceThreat(s, 4, A.lances);
      break;
    case "angmarHopeDiscount":
      s.used.push(`${PREFIX}hope`);
      break;
    case "angmarHopeSearch":
      choose(s, "Hope Rekindled · Find a Valour event", [
        ...s.deck.slice(0, 10).flatMap((code, value) =>
          card(code).type_code === "event" &&
          /Valour/.test(card(code).text ?? "")
            ? [
                {
                  id: `card-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("angmarDeckTake", { value })],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Take no card · Shuffle",
          effects: [fx("angmarDeckTake")],
        },
      ]);
      break;
    case "angmarCry":
      for (const enemy of enemies(s).filter(affected))
        enemy.tempAttack = (enemy.tempAttack ?? 0) - (e.value ?? 1);
      break;
    case "angmarCryPlayer":
      choose(
        s,
        "Horn's Cry · Choose a player",
        playerOrder(s).map((player) => ({
          id: `player-${player}`,
          label: `Player ${player + 1}`,
          effects: [fx("angmarCryEngaged", { player })],
        })),
      );
      break;
    case "angmarCryEngaged":
      for (const enemy of engagedEnemies(s).filter(affected))
        enemy.tempAttack = (enemy.tempAttack ?? 0) - 3;
      break;
    case "angmarDoom":
      mark(s, `${ROUND}doom`);
      break;
    case "angmarDoomValour":
      eachSeat(s, () => raiseThreat(s, 2, "player-card"));
      mark(s, `${ROUND}skip-quest`);
      break;
    case "angmarGround":
      if (u && effectiveKeyword(u, "Sentinel") && affected(u))
        readyCharacter(s, u);
      break;
    case "angmarGroundAll":
      for (const character of allCharacters(s).filter(
        (u) => effectiveKeyword(u, "Sentinel") && affected(u),
      ))
        readyCharacter(s, character);
      break;
    case "angmarWrath":
      if (u && isHero(u) && affected(u)) mark(s, `${PREFIX}wrath:${u.id}`);
      break;
    case "angmarWrathPlayer":
      choose(
        s,
        "Hour of Wrath · Choose a player",
        playerOrder(s).map((player) => ({
          id: `player-${player}`,
          label: `Player ${player + 1}`,
          effects: [fx("angmarWrathHeroes", { player })],
        })),
      );
      break;
    case "angmarWrathHeroes":
      for (const h of s.heroes.filter(affected))
        mark(s, `${PREFIX}wrath:${h.id}`);
      break;
    case "angmarTaleExhaust": {
      requireRule(
        u && exhaustCharacter(s, u),
        "Exhaust a Noldor or Dúnedain character.",
      );
      const noldor = hasTrait(u, "Noldor"),
        dunedain = hasTrait(u, "Dúnedain"),
        value = card(u.code).willpower ?? 0;
      choose(
        s,
        "Tale of Tinúviel · Ready the other character",
        allCharacters(s)
          .filter(
            (t) =>
              t.id !== u.id &&
              affected(t) &&
              ((noldor && hasTrait(t, "Dúnedain")) ||
                (dunedain && hasTrait(t, "Noldor"))),
          )
          .map((t) =>
            option(t, [fx("angmarTaleReady", { target: t.id, value })]),
          ),
      );
      break;
    }
    case "angmarTaleReady":
      if (u && affected(u)) {
        readyCharacter(s, u);
        u.tempWill = (u.tempWill ?? 0) + (e.value ?? 0);
        u.tempAttack = (u.tempAttack ?? 0) + (e.value ?? 0);
        u.tempDefense = (u.tempDefense ?? 0) + (e.value ?? 0);
      }
      break;
    case "angmarDiscardCost": {
      const copy = s.hand.find((h) => h.id === e.target && canLeaveHand(h));
      requireRule(copy, "The physical cost card must remain in hand.");
      discardHandCard(s, copy.id);
      if (e.code === A.jeweler && (e.value ?? 0) > 1)
        choose(
          s,
          "Elven Jeweler · Discard another hand card",
          movableHand(s)
            .filter((h) => h.id !== e.source)
            .map((h) => option(h, [{ ...e, target: h.id, value: 1 }])),
        );
      else prepend(s, { ...e, kind: "angmarDiscardPaid" });
      break;
    }
    case "angmarDiscardPaid": {
      const bearer = get(s, e.source) ?? s.hand.find((h) => h.id === e.source);
      if (!bearer) break;
      if (e.code === A.jeweler) {
        s.hand = s.hand.filter((h) => h.id !== bearer.id);
        enterAlly(s, bearer, false, false, true);
      }
      if (e.code === A.spear) {
        const a = bearer.attachments.find((a) => a.id === e.text && enabled(a));
        if (a) {
          s.used.push(`${PREFIX}spear:${a.id}`);
          bearer.tempAttack = (bearer.tempAttack ?? 0) + 1;
        }
      }
      if (e.code === A.arwen) {
        s.used.push(`${ROUND}arwen:${bearer.id}`);
        choose(
          s,
          "Arwen Undómiel · Choose a resource pool",
          allHeroes(s)
            .filter(
              (h) =>
                affected(h) &&
                canGainResources(s, h) &&
                (hasTrait(h, "Noldor") || card(h.code).name === "Aragorn"),
            )
            .map((h) =>
              option(h, [fx("angmarGain", { target: h.id, value: 1 })]),
            ),
        );
      }
      break;
    }
    case "angmarMerryOffer":
      if (source && canExhaust(source) && !source.blanked)
        response(s, source.id, source.code, "Merry · Enemy revealed", [
          fx("angmarMerry", { source: source.id, value: e.value }),
        ]);
      break;
    case "angmarMerry":
      if (source && exhaustCharacter(s, source))
        reduceThreat(s, e.value ?? 0, A.merry);
      break;
    case "angmarCancelEncounter": {
      const code = e.flag ? A.ears : A.door;
      if (e.flag)
        requireRule(
          u && exhaustCharacter(s, u),
          "Exhaust a Dúnedain or Ranger hero.",
        );
      if (!spendEvent(s, code, e.source)) {
        prepend(
          s,
          ...(e.effects ?? [
            fx("placeEncounter", {
              text: "revealed",
              code: e.code,
              revealOrigin: "encounter",
            }),
          ]),
        );
        break;
      }
      if (e.flag) {
        s.encounterDeck.push(e.code!);
        shuffle(s, s.encounterDeck);
        prepend(s, fx("reveal"));
      } else s.encounterDiscard.push(e.code!);
      break;
    }
    case "angmarSteedOffer": {
      const a = attachment(s, e.target, e.source);
      if (a && movableHand(s).length && allActiveLocations(s).some(affected))
        response(s, a.id, a.code, "Steed of Imladris · Hero committed", [
          fx("angmarSteedDiscard", { target: e.target, source: a.id }),
        ]);
      break;
    }
    case "angmarSteedDiscard":
      choose(
        s,
        "Steed of Imladris · Discard a hand card",
        movableHand(s).map((h) =>
          option(h, [fx("angmarSteedPay", { target: h.id })]),
        ),
      );
      break;
    case "angmarSteedPay":
      discardHandCard(s, e.target!);
      if (allActiveLocations(s).filter(affected).length === 1)
        progressLocation(s, allActiveLocations(s).filter(affected)[0], 2);
      else
        choose(
          s,
          "Steed of Imladris · Active location",
          allActiveLocations(s)
            .filter(affected)
            .map((l) =>
              option(l, [fx("locationProgress", { target: l.id, value: 2 })]),
            ),
        );
      break;
    case "angmarPreserverOffer":
      if (
        source &&
        !source.blanked &&
        allCharacters(s).some(
          (t) =>
            hasTrait(t, "Ent") && affected(t) && rhosgobelHealingAllowed(s, t),
        )
      )
        response(s, source.id, source.code, "Wellinghall Preserver · Readied", [
          fx("angmarPreserverChoose"),
        ]);
      break;
    case "angmarPreserverChoose":
      choose(
        s,
        "Wellinghall Preserver · Heal an Ent",
        allCharacters(s)
          .filter(
            (u) =>
              hasTrait(u, "Ent") &&
              affected(u) &&
              rhosgobelHealingAllowed(s, u),
          )
          .map((u) => option(u, [fx("angmarPreserverHeal", { target: u.id })])),
      );
      break;
    case "angmarPreserverHeal":
      if (u && rhosgobelHealingAllowed(s, u))
        rhosgobelHeal(s, u, 1, { code: A.preserver, player: activeSeat(s) });
      break;
    case "angmarBoomedOffer":
      if (u && hasTrait(u, "Ent") && affected(u))
        choose(s, "Boomed and Trumpeted · Ent damaged", [
          ...copies(s, A.boomed).map((c) =>
            responseEvent(s, c, fx("angmarBoomed", { target: u.id })),
          ),
          skip,
        ]);
      break;
    case "angmarBoomed":
      if (u && affected(u)) {
        readyCharacter(s, u);
        u.tempAttack = (u.tempAttack ?? 0) + 3;
      }
      break;
    default:
      return angmarRemainingEffect(s, e);
  }
  return true;
}

function angmarRemainingEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "angmarDamageWindow": {
      if (!u) break;
      const value = e.value ?? 0;
      const choices = preventionSources(s, u, value).map((p) => {
        const a = p.attachment,
          code = a?.code ?? p.unit.code,
          id = a?.id ?? p.unit.id;
        return {
          id: `${id}-${p.discard ? "valour" : "normal"}`,
          code,
          label: `${card(code).name} · ${p.discard ? `Discard · Cancel up to ${p.max}` : "Cancel 1"} damage · Player ${p.player + 1}`,
          ability: {
            player: p.player,
            source: id,
            code,
            type: "response" as const,
          },
          effects: [
            {
              ...e,
              kind: p.discard ? "angmarPreventAmount" : "angmarPrevent",
              source: p.unit.id,
              code,
              count: 1,
              ids: a ? [a.id] : [],
              flag: !!p.discard,
              player: p.player,
            },
          ],
        };
      });
      choose(s, `Prevent damage · ${name(u)}`, [
        ...choices,
        {
          id: "skip",
          label: `Deal ${value} remaining damage`,
          effects: [{ ...e, kind: "angmarDamageResume", flag: true }],
        },
      ]);
      break;
    }
    case "angmarPreventAmount":
      choose(
        s,
        "Honour Guard · Damage to cancel",
        Array.from({ length: Math.min(5, e.value ?? 0) }, (_, i) => ({
          id: `cancel-${i + 1}`,
          label: `Cancel ${i + 1} damage`,
          effects: [{ ...e, kind: "angmarPrevent", count: i + 1 }],
        })),
      );
      break;
    case "angmarPrevent": {
      if (!u || !source) break;
      const a = source.attachments.find(
        (a) => a.id === e.ids?.[0] && enabled(a) && !a.exhausted,
      );
      if (a) a.exhausted = true;
      else {
        requireRule(
          !source.blanked && exhaustCharacter(s, source),
          "Exhaust the damage prevention source.",
        );
        if (e.flag) discardCharacter(s, source);
      }
      afterPlayerAbility(s, {
        ...e,
        kind: "angmarDamageResume",
        value: Math.max(0, (e.value ?? 0) - (e.count ?? 1)),
        player: ownerOf(s, u),
        flag: false,
      });
      break;
    }
    case "angmarDamageResume":
      resumeAngmarDamage(s, e, {
        ...readDamageContext(e),
        ...(e.flag ? { bypassAngmar: true } : {}),
      });
      break;
    case "angmarDoriOffer":
      if (source && u && s.combat?.enemyId === e.text && canExhaust(source))
        response(
          s,
          source.id,
          source.code,
          "Dori · Hero declared as defender",
          [fx("angmarDori", { source: source.id, target: u.id, text: e.text })],
        );
      break;
    case "angmarDori":
      if (source && u && s.combat && s.combat.enemyId === e.text) {
        const bonus = stats(s, source).defense,
          combat = s.combat;
        if (exhaustCharacter(s, source)) {
          combat.defenseBonuses ??= {};
          combat.defenseBonuses[u.id] =
            (combat.defenseBonuses[u.id] ?? 0) + bonus;
        }
      }
      break;
    case "angmarBeechboneOffer":
      if (source && u && affected(u))
        response(
          s,
          source.id,
          source.code,
          "Beechbone · Declared as attacker",
          [fx("angmarBeechbone", { source: source.id, target: u.id })],
        );
      break;
    case "angmarBeechbone":
      if (source && u) {
        const amount = source.damage + 1;
        requireRule(
          damage(s, source.id, 1, { cost: true }),
          "The damage cost must be paid.",
        );
        if (get(s, u.id) && affected(u)) damage(s, u.id, amount);
      }
      break;
    case "angmarSwordOffer": {
      const a = attachment(s, e.target, e.source);
      if (a && !a.exhausted && u && canGainResources(s, u))
        response(s, a.id, a.code, "Sword of Númenor · Enemy destroyed", [
          fx("angmarSword", { source: a.id, target: u.id }),
        ]);
      break;
    }
    case "angmarSword": {
      const a = attachment(s, e.target, e.source);
      if (a && !a.exhausted && u && canGainResources(s, u)) {
        a.exhausted = true;
        u.resources++;
        gondorResourcesGained(s, u, 1, true);
      }
      break;
    }
    case "angmarVictoryOffer":
      if (
        e.code &&
        !marker(s, `${PREFIX}victory:${e.source}`) &&
        pendingEventVictory(s, e.code) < 3 &&
        s.encounterDiscard[e.value ?? -1] === e.text
      )
        choose(
          s,
          `${card(e.code).name} · Add defeated card to victory display`,
          [
            ...copies(s, e.code).map((c) =>
              responseEvent(s, c, { ...e, kind: "angmarVictoryTake" }),
            ),
            skip,
          ],
        );
      break;
    case "angmarVictoryTake":
      if (
        e.code &&
        !marker(s, `${PREFIX}victory:${e.source}`) &&
        pendingEventVictory(s, e.code) < 3 &&
        s.encounterDiscard[e.value ?? -1] === e.text
      ) {
        mark(s, `${PREFIX}victory:${e.source}`);
        s.encounterDiscard.splice(e.value!, 1);
        const shift = (pending: Effect) => {
          if (
            pending.kind.startsWith("angmarVictory") &&
            pending.value !== undefined
          ) {
            if (pending.value === e.value) pending.value = -1;
            else if (pending.value > e.value!) pending.value--;
          }
        };
        const visit = (effects: Effect[]) => {
          for (const pending of effects) {
            shift(pending);
            if (pending.effects) visit(pending.effects);
          }
        };
        visit(s.queue);
        for (const o of s.choice?.options ?? []) visit(o.effects);
        addVictoryCard(s, e.text!);
        putPlayedEventInVictory(s, e.code);
      }
      break;
    case "angmarProvisionsOffer":
      response(
        s,
        e.source!,
        A.provisions,
        "Ranger Provisions · Attached location explored",
        [fx("angmarProvisions", { player: firstPlayer(s) })],
      );
      break;
    case "angmarProvisions":
      for (const h of s.heroes.filter(
        (h) => affected(h) && canGainResources(s, h),
      )) {
        h.resources++;
        gondorResourcesGained(s, h, 1, true);
      }
      break;
    case "angmarBrandybuckBottom":
      if (u && u.code === A.brandybuck && !u.blanked) {
        const controller = ownerOf(s, u),
          owner = u.owner ?? controller;
        const attack = stats(s, u).attack,
          traits = effectiveTraits(u);
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        forOwner(s, controller, () => {
          s.allies = s.allies.filter((a) => a.id !== u.id);
        });
        forOwner(s, owner, () => putPlayerDeck(s, u));
        characterLeftPlay(
          s,
          u,
          controller,
          {
            zone: "deck",
            player: owner,
            index: seatView(s, owner).deck.length - 1,
          },
          attack,
          traits,
        );
      }
      break;
    case "angmarBrandybuckOffer": {
      const c = s.hand.find((u) => u.code === A.brandybuck);
      if (c && allyCanEnter(s, c.code))
        response(
          s,
          c.id,
          c.code,
          "Curious Brandybuck · Traveled to a location",
          [
            fx("angmarBrandybuckChoose", {
              source: c.id,
              owner: activeSeat(s),
            }),
          ],
        );
      break;
    }
    case "angmarBrandybuckChoose":
      choose(
        s,
        "Curious Brandybuck · Choose its controller",
        playerOrder(s)
          .filter((p) => allyCanEnter(seatView(s, p), A.brandybuck))
          .map((player) => ({
            id: `player-${player}`,
            label: `Player ${player + 1}`,
            effects: [
              { ...e, kind: "angmarHandAllyEnter", player, code: A.brandybuck },
            ],
          })),
      );
      break;
    case "angmarHandAllyEnter": {
      let ally: Unit | undefined;
      forOwner(s, e.owner ?? activeSeat(s), () => {
        ally = s.hand.find((h) => h.id === e.source);
        if (ally) s.hand = s.hand.filter((h) => h.id !== ally!.id);
      });
      if (ally) {
        enterAlly(s, ally, false, false, true);
        if (e.code === A.reinforcements) {
          s.used.push(`${PREFIX}reinforcement:${ally.id}`);
          prepend(
            s,
            fx("angmarReinforcements", {
              value: (e.value ?? 1) - 1,
              ids: [...(e.ids ?? []), ally.id],
              player: e.count,
            }),
          );
        }
      }
      break;
    }
    case "angmarCardolanOffer": {
      const c = s.hand.find((u) => u.code === A.cardolan);
      if (c && s.heroes.some((h) => hasTrait(h, "Dúnedain")))
        response(s, c.id, c.code, "Ranger of Cardolan · Enemy engaged", [
          fx("angmarCardolanPay", { source: c.id }),
        ]);
      break;
    }
    case "angmarCardolanPay":
      choose(
        s,
        "Ranger of Cardolan · Spend 1 resource",
        s.heroes
          .filter((h) => h.resources > 0 && heirsCanSpendResources(s, h))
          .map((h) =>
            option(h, [
              fx("angmarCardolanEnter", { source: e.source, target: h.id }),
            ]),
          ),
      );
      break;
    case "angmarCardolanEnter": {
      const ally = s.hand.find((h) => h.id === e.source);
      if (ally && u && u.resources > 0 && heirsCanSpendResources(s, u)) {
        spendResources(s, u, 1);
        s.hand = s.hand.filter((h) => h.id !== ally.id);
        enterAlly(s, ally, false, false, true);
        s.used.push(`${ROUND}cardolan:${ally.id}`);
      }
      break;
    }
    case "angmarCardolanShuffle":
      if (u && isAlly(u)) {
        const owner = u.owner ?? ownerOf(s, u);
        returnAlly(s, u, true);
        shuffle(s, seatView(s, owner).deck);
      }
      break;
    case "angmarReinforcements": {
      if ((e.value ?? 0) <= 0) break;
      const player = activeSeat(s);
      choose(s, "Reinforcements · Choose an ally from the players' hands", [
        ...playerOrder(s).flatMap((owner) =>
          seatView(s, owner)
            .hand.filter(
              (h) =>
                card(h.code).type_code === "ally" &&
                playerOrder(s).some((p) =>
                  allyCanEnter(seatView(s, p), h.code),
                ),
            )
            .map((h) => ({
              id: h.id,
              code: h.code,
              label: `${name(h)} · Player ${owner + 1}'s hand`,
              effects: [
                fx("angmarReinforcementsController", {
                  source: h.id,
                  code: h.code,
                  owner,
                  value: e.value,
                  ids: e.ids,
                  count: player,
                }),
              ],
            })),
        ),
        { id: "done", label: "Finish putting allies into play", effects: [] },
      ]);
      break;
    }
    case "angmarReinforcementsController":
      choose(
        s,
        "Reinforcements · Choose the ally's controller",
        playerOrder(s)
          .filter((p) => allyCanEnter(seatView(s, p), e.code!))
          .map((player) => ({
            id: `player-${player}`,
            label: `Player ${player + 1}`,
            effects: [
              {
                ...e,
                kind: "angmarHandAllyEnter",
                player,
                code: A.reinforcements,
              },
            ],
          })),
      );
      break;
    case "angmarRallyOffer":
      if (
        seatView(s, e.owner ?? activeSeat(s)).discard[e.value ?? -1] === e.code
      )
        choose(s, "Rallying Cry · Ally left play", [
          ...copies(s, A.rally).map((c) =>
            responseEvent(s, c, { ...e, kind: "angmarRallyReturn" }),
          ),
          skip,
        ]);
      break;
    case "angmarRallyReturn":
      forOwner(s, e.owner ?? activeSeat(s), () => {
        if (s.discard[e.value ?? -1] === e.code) {
          const copy = takePlayerDiscard(s, e.value!, { playerCardCost: true });
          copy.id = e.source!;
          s.hand.push(copy);
        }
      });
      break;
    case "angmarEothainOffer":
      if (source && ready(s, source))
        response(
          s,
          source.id,
          source.code,
          "Éothain · Rohan ally discarded by a card effect",
          [fx("ready", { target: source.id })],
        );
      break;
    case "angmarHarpOffer": {
      const a = attachment(s, e.target, e.source);
      if (
        a &&
        !a.exhausted &&
        !dikeCannotLeaveDiscard(seatView(s, e.owner ?? activeSeat(s))) &&
        seatView(s, e.owner ?? activeSeat(s)).discard[e.value ?? -1] === e.code
      )
        response(s, a.id, a.code, "Silver Harp · Hand card discarded", [
          { ...e, kind: "angmarHarpReturn" },
        ]);
      break;
    }
    case "angmarHarpReturn": {
      const a = attachment(s, e.target, e.source);
      if (a && !a.exhausted) {
        a.exhausted = true;
        forOwner(s, e.owner ?? activeSeat(s), () => {
          if (
            !dikeCannotLeaveDiscard(s) &&
            s.discard[e.value ?? -1] === e.code
          ) {
            const copy = takePlayerDiscard(s, e.value!);
            copy.id = e.text!;
            seatView(s, e.player ?? activeSeat(s)).hand.push(copy);
          }
        });
      }
      break;
    }
    case "angmarGaldorOffer":
      if (
        source &&
        !source.blanked &&
        !s.used.includes(`${ROUND}galdor:${source.id}`)
      )
        response(
          s,
          source.id,
          source.code,
          "Galdor of the Havens · Cards discarded",
          [fx("angmarGaldor", { source: source.id })],
        );
      break;
    case "angmarGaldor":
      if (source && !s.used.includes(`${ROUND}galdor:${source.id}`)) {
        s.used.push(`${ROUND}galdor:${source.id}`);
        draw(s, 1);
      }
      break;
    case "angmarErestorDiscard":
      for (const copy of [...s.hand]) discardHandCard(s, copy.id);
      break;
    case "angmarSideOffer":
      response(
        s,
        e.source!,
        e.code!,
        `${card(e.code!).name} · Side quest defeated`,
        [fx("angmarSideResolve", { code: e.code })],
      );
      break;
    case "angmarSideResolve":
      if (e.code === A.scout)
        prepend(s, fx("angmarScoutSearch", { player: firstPlayer(s) }));
      if (e.code === A.double) eachSeat(s, () => reduceThreat(s, 5, A.double));
      if (e.code === A.delay)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("angmarDelay", { player })),
        );
      if (e.code === A.aid)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("angmarAid", { player })),
        );
      break;
    case "angmarScoutSearch": {
      const count = Math.min(s.encounterDeck.length, playerOrder(s).length + 4);
      choose(s, "Scout Ahead · Add a non-objective card to victory display", [
        ...s.encounterDeck.slice(0, count).flatMap((code, value) =>
          !card(code).type_code.startsWith("objective") && !card(code).victory
            ? [
                {
                  id: `card-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("angmarScoutTake", { code, value, count })],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Find no card · Reorder remaining cards",
          effects: [fx("angmarScoutTake", { count })],
        },
      ]);
      break;
    }
    case "angmarScoutTake": {
      let count = e.count ?? 0;
      if (e.value !== undefined && s.encounterDeck[e.value] === e.code) {
        addVictoryCard(s, s.encounterDeck.splice(e.value, 1)[0]);
        count--;
      }
      prepend(s, fx("angmarScoutOrder", { value: count, ids: [] }));
      break;
    }
    case "angmarScoutOrder": {
      const chosen = e.ids ?? [],
        count = e.value ?? 0;
      if (chosen.length >= count) {
        const top = s.encounterDeck.splice(0, count);
        s.encounterDeck.unshift(...chosen.map((index) => top[Number(index)]));
        break;
      }
      choose(
        s,
        "Scout Ahead · Choose the next top card",
        s.encounterDeck.slice(0, count).flatMap((code, index) =>
          chosen.includes(String(index))
            ? []
            : [
                {
                  id: `card-${index}`,
                  code,
                  label: card(code).name,
                  effects: [{ ...e, ids: [...chosen, String(index)] }],
                },
              ],
        ),
      );
      break;
    }
    case "angmarDelay":
      choose(s, "Delay the Enemy · Discard an engaged enemy", [
        ...engagedEnemies(s)
          .filter((u) => !card(u.code).is_unique && affected(u))
          .map((u) => option(u, [fx("angmarDelayDiscard", { target: u.id })])),
        skip,
      ]);
      break;
    case "angmarDelayDiscard":
      if (u && !card(u.code).is_unique && affected(u)) discardCharacter(s, u);
      break;
    case "angmarAid":
      choose(s, "Send for Aid · Find an ally in the top 10", [
        ...s.deck.slice(0, 10).flatMap((code, value) =>
          card(code).type_code === "ally" && allyCanEnter(s, code)
            ? [
                {
                  id: `card-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("angmarAidEnter", { code, value })],
                },
              ]
            : [],
        ),
        skip,
      ]);
      break;
    case "angmarAidEnter":
      if (e.value !== undefined && s.deck[e.value] === e.code) {
        const ally = takePlayerDeck(s, e.value);
        enterAlly(s, ally);
        shuffle(s, s.deck);
      }
      break;
    default:
      return false;
  }
  return true;
}

/** Shift pending recovery references when a physical discard card is removed. */
export function angmarDiscardTaken(s: GameState, index: number) {
  const player = activeSeat(s),
    shift = (e: Effect) => {
      if (
        !/angmar(?:Harp|Rally)/.test(e.kind) ||
        e.owner !== player ||
        e.value === undefined
      )
        return;
      if (e.value === index) e.value = -1;
      else if (e.value > index) e.value--;
    };
  const visit = (effects: Effect[]) => {
    for (const e of effects) {
      shift(e);
      if (e.effects) visit(e.effects);
      if (e.costEffects) visit(e.costEffects);
      if (e.cancelledEffects) visit(e.cancelledEffects);
    }
  };
  visit(s.queue);
  for (const option of s.choice?.options ?? []) visit(option.effects);
}
export function angmarFavor(s: GameState, eliminationLevel = 50): boolean {
  const a = s.threatAttachments?.find((a) => a.code === A.favor && enabled(a));
  if (!a || s.threat < eliminationLevel) return false;
  s.threatAttachments = s.threatAttachments!.filter((v) => v.id !== a.id);
  seatView(s, a.owner ?? activeSeat(s)).discard.push(a.code);
  reduceThreat(s, Math.max(0, s.threat - eliminationLevel + 5), A.favor);
  log(s, "Favor of the Valar prevents threat elimination.", "good");
  return s.threat < eliminationLevel;
}
