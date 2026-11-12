import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canFight,
  canPlayerAffectShadow,
  choose,
  fx,
  get,
  log,
  prepend,
  requireRule,
  shuffle,
  skip,
  spendResources,
  stats,
} from "./core";
import {
  addVictoryCard,
  allyCanEnter,
  destroy,
  discardPlayerDeck,
  enterAlly,
  exhaustCharacter,
  returnAlly,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  forOwner,
  globalCharacters,
  hasKeyword,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { playerEffectImmune } from "./player-effect-immunity";
import { consideredEngaged, dealEnemyShadows } from "./considered-engagement";
import { addCurrentQuestProgress } from "./side-quests";
import { choosePlayerResponse } from "./player-ability-triggers";
import { heirsCanSpendResources } from "./heirs-numenor";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { isBagginsBilbo } from "./hobbit-codes";
import { isEnemy } from "./ships";
import { playerAttack, greatYewBowCanAttack } from "./combat";

/**
 * The On the Doorstep player cards that are not Dwarf allies or heroes counted
 * by the Dwarf module (Óin, Bombur, Glóin, Bifur, Dwalin, King Under the
 * Mountain). Hobbit player-card hooks delegate here.
 */
export const OTD_PLAYER = {
  balin: "132002",
  bard: "132003",
  shot: "132009",
  alliance: "132010",
  ravens: "132011",
  kinsfolk: "132012",
  lucky: "132013",
  bow: "132014",
  arrow: "132015",
  key: "132016",
  hunter: "132017",
} as const;
const P = OTD_PLAYER;
/** Desperate Alliance: one copy per phase for all players together. */
const ALLIANCE = `phase:${P.alliance}`;
/** `phase:132010:lent:<hero>` sits in the lending player's list. */
const LENT = `phase:${P.alliance}:lent:`;
/** `phase:132012:<ally>` marks an ally To me! O my kinsfolk! put into play. */
const KINSFOLK = `phase:${P.kinsfolk}:`;
/** `attack:otd-black-arrow:<hero>`: +5 attack until this attack resolves. */
const ARROW = "attack:otd-black-arrow:";
/** The printed card types Expert Treasure-hunter can name. */
export const OTD_CARD_TYPES = [
  "Ally",
  "Attachment",
  "Event",
  "Treasure",
  "Player Side Quest",
] as const;

const enabled = (a: { blanked?: boolean; facedown?: boolean }) =>
  !a.blanked && !a.facedown;
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const cardHasTrait = (code: string, trait: string) =>
  (card(code).traits ?? "")
    .split(".")
    .some((t) => t.trim().toLowerCase() === trait.toLowerCase());
const TYPE_NAMES: Record<string, string> = {
  ally: "Ally",
  attachment: "Attachment",
  event: "Event",
  "player-side-quest": "Player Side Quest",
};
/** The printed type line: Hobbit treasures read "Treasure". */
const printedType = (code: string) =>
  card(code).treasure ? "Treasure" : (TYPE_NAMES[card(code).type_code] ?? "");
const bilbo = (s: GameState) =>
  allCharacters(s).find((u) => isBagginsBilbo(u.code));
const named = (u: Unit, title: string) => card(u.code).name === title;
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const enemiesInPlay = (s: GameState) =>
  [...allEngaged(s), ...s.staging].filter((u) => isEnemy(u));

/** Costs resolve, with anything they trigger, before the paid effect. */
function payThen(s: GameState, cost: () => void, effects: Effect[]) {
  const continuation = s.queue,
    player = activeSeat(s);
  s.queue = [];
  cost();
  s.queue.push(
    ...effects.map((e) => ({ ...e, player: e.player ?? player })),
    ...continuation,
  );
}

/**
 * A ranged attack is an attack by a Ranged character against an enemy engaged
 * with another player (FAQ 1.9). Great Yew Bow's attack says it is ranged.
 */
export function otdRangedAttack(
  s: GameState,
  u: Unit,
  enemy: Unit,
  mode?: string,
) {
  if (mode === "great-yew-bow") return true;
  if (!hasKeyword(u, "Ranged")) return false;
  const controller = ownerOf(s, u);
  return inStaging(s, enemy)
    ? !consideredEngaged(s, enemy, controller) &&
        playerOrder(s).some(
          (p) => p !== controller && consideredEngaged(s, enemy, p),
        )
    : ownerOf(s, enemy) !== controller;
}

// ---------------------------------------------------------------------------
// Targets and play restrictions.

function weapons(s: GameState) {
  const player = activeSeat(s);
  return allCharacters(s).flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          !a.exhausted &&
          attachmentHasTrait(a, "Weapon") &&
          attachmentController(s, host, a) === player,
      )
      .map((a) => ({ host, a })),
  );
}
const shotTargets = (s: GameState) =>
  enemiesInPlay(s).filter(
    (u) =>
      !card(u.code).is_unique &&
      stats(s, u).defense === 0 &&
      !playerEffectImmune(s, u, P.shot),
  );
const allianceTargets = (s: GameState) =>
  s.heroes.filter(
    (u) => !isBagginsBilbo(u.code) && !playerEffectImmune(s, u, P.alliance),
  );
const allianceRecipients = (s: GameState) =>
  playerOrder(s).filter((p) => p !== activeSeat(s));
const ravensTargets = (s: GameState) =>
  s.heroes.filter((u) => canExhaust(u) && !playerEffectImmune(s, u, P.ravens));
function kinsfolkAllies(s: GameState) {
  return s.discard.flatMap((code, index) =>
    card(code).type_code === "ally" &&
    cardHasTrait(code, "Dwarf") &&
    allyCanEnter(s, code)
      ? [{ code, index }]
      : [],
  );
}
const luckyTargets = (s: GameState) =>
  allCharacters(s).filter(
    (u) => !named(u, "Bilbo Baggins") && !playerEffectImmune(s, u, P.lucky),
  );

export function otdPlayerTargets(s: GameState, code: string) {
  if (code === P.shot) return shotTargets(s);
  if (code === P.alliance) return allianceTargets(s);
  if (code === P.ravens) return ravensTargets(s);
  if (code === P.lucky) return luckyTargets(s);
  return undefined;
}

export function otdPlayerPlayProblem(s: GameState, u: Unit): string | null {
  switch (u.code) {
    case P.shot:
      if (!weapons(s).length)
        return "Straight Shot needs a ready Weapon attachment you control.";
      if (!shotTargets(s).length)
        return "Straight Shot needs a non-unique enemy with 0 defense.";
      return null;
    case P.alliance:
      if (!allianceRecipients(s).length)
        return "Desperate Alliance needs another player.";
      if (s.used.includes(ALLIANCE))
        return "Only one Desperate Alliance can be played each phase.";
      if (s.combat) return "Play Desperate Alliance between attacks.";
      if (!allianceTargets(s).length)
        return "Desperate Alliance needs a hero you control other than Bilbo Baggins.";
      return null;
    case P.ravens:
      if (!ravensTargets(s).length)
        return "Ravens of the Mountain needs a ready hero you control.";
      if (!s.encounterDeck.length) return "The encounter deck is empty.";
      return null;
    case P.kinsfolk:
      if (!s.heroes.some((h) => hasTrait(h, "Dwarf")))
        return "To me! O my kinsfolk! needs a Dwarf hero you control.";
      if (dikeCannotLeaveDiscard(s))
        return "Cards cannot leave your discard pile.";
      if (!kinsfolkAllies(s).length)
        return "To me! O my kinsfolk! needs a Dwarf ally in your discard pile that can enter play.";
      return null;
    case P.lucky: {
      if (!bilbo(s)) return "The Lucky Number needs Bilbo Baggins in play.";
      if (!luckyTargets(s).length)
        return "The Lucky Number needs a character other than Bilbo Baggins.";
      return null;
    }
    default:
      return null;
  }
}

/** Costs printed on the events are paid as they are played. */
export function otdPlayerEventCost(s: GameState, u: Unit, target?: string) {
  if (u.code === P.shot) {
    const list = weapons(s);
    requireRule(list.length > 0, "Exhaust a ready Weapon attachment.");
    if (list.length === 1) {
      list[0].a.exhausted = true;
      return;
    }
    choose(
      s,
      "Straight Shot · Exhaust a Weapon",
      list.map(({ host, a }) => ({
        id: a.id,
        code: a.code,
        label: `${card(a.code).name} on ${name(host)}`,
        effects: [
          fx("hobbitPlayerShotCost", {
            source: a.id,
            target: host.id,
            player: activeSeat(s),
          }),
        ],
      })),
      "Exhaust a Weapon attachment you control.",
    );
  }
  if (u.code === P.alliance)
    for (const p of seatIndices(s)) {
      const view = seatView(s, p);
      if (!view.used.includes(ALLIANCE)) view.used.push(ALLIANCE);
    }
  if (u.code === P.ravens) {
    const hero = get(s, target);
    requireRule(
      hero && ravensTargets(s).some((x) => x.id === hero.id),
      "Exhaust a ready hero you control.",
    );
    requireRule(exhaustCharacter(s, hero!), "This hero cannot exhaust.");
  }
}

export function otdPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  const player = activeSeat(s);
  switch (code) {
    case P.shot: {
      const enemy = get(s, target);
      if (enemy && shotTargets(s).some((u) => u.id === enemy.id)) {
        log(s, `Straight Shot discards ${name(enemy)}.`, "good");
        destroy(s, enemy, false);
      }
      return true;
    }
    case P.alliance: {
      const hero = get(s, target);
      if (!hero || !allianceTargets(s).some((u) => u.id === hero.id))
        return true;
      const recipients = allianceRecipients(s);
      if (recipients.length === 1)
        prepend(
          s,
          fx("hobbitPlayerAlliance", {
            target: hero.id,
            value: recipients[0],
            player,
          }),
        );
      else
        choose(
          s,
          `Desperate Alliance · Give ${name(hero)} to`,
          recipients.map((p) => ({
            id: `seat-${p}`,
            label: seatName(s, p),
            code: P.alliance,
            effects: [
              fx("hobbitPlayerAlliance", {
                target: hero.id,
                value: p,
                player,
              }),
            ],
          })),
          "Until the end of the phase that player controls the hero and its resources.",
        );
      return true;
    }
    case P.ravens: {
      if (!s.encounterDeck.length) return true;
      shuffle(s, s.encounterDeck);
      const top = s.encounterDeck[0];
      const amount = Math.max(0, card(top).threat ?? 0);
      // The shuffle ends any earlier knowledge of the top card.
      for (const p of seatIndices(s))
        forOwner(s, p, () => {
          s.peek = null;
        });
      s.peek = top;
      choose(
        s,
        `Ravens of the Mountain · ${card(top).name}`,
        [
          {
            id: "progress",
            label: `Place ${amount} progress on the current quest`,
            code: top,
            effects: [fx("hobbitPlayerRavens", { value: amount, player })],
          },
        ],
        `The shuffled encounter deck's top card has ${amount} threat. It stays on top of the deck.`,
      );
      return true;
    }
    case P.kinsfolk: {
      const allies = kinsfolkAllies(s);
      if (!allies.length) return true;
      choose(
        s,
        "To me! O my kinsfolk! · Dwarf ally",
        allies.map(({ code, index }) => ({
          id: `discard-${index}`,
          label: card(code).name,
          code,
          effects: [fx("hobbitPlayerKinsfolk", { code, value: index, player })],
        })),
        "Put the ally into play. It goes to the bottom of your deck at the end of the phase.",
      );
      return true;
    }
    case P.lucky: {
      const u = get(s, target),
        b = bilbo(s);
      if (!u || !b || !luckyTargets(s).some((x) => x.id === u.id)) return true;
      const bonus = stats(s, b);
      u.tempWill = (u.tempWill ?? 0) + bonus.will;
      u.tempAttack = (u.tempAttack ?? 0) + bonus.attack;
      u.tempDefense = (u.tempDefense ?? 0) + bonus.defense;
      log(
        s,
        `The Lucky Number: ${name(u)} gets +${bonus.will} willpower, +${bonus.attack} attack and +${bonus.defense} defense until the end of the phase.`,
        "good",
      );
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Great Yew Bow's Combat Action.

export const otdPlayerAbilityLabel = (code: string) =>
  code === P.bow
    ? "Great Yew Bow · Exhaust it and the hero to attack an enemy in the staging area"
    : undefined;
const bowTargets = (s: GameState, host: Unit) =>
  s.staging.filter(
    (u) =>
      isEnemy(u) &&
      !playerEffectImmune(s, u, P.bow) &&
      greatYewBowCanAttack(s, u, host),
  );
function bowProblem(s: GameState, u: Unit, a: Attachment) {
  if (!enabled(a)) return "Great Yew Bow's text is inactive.";
  if (attachmentController(s, u, a) !== activeSeat(s))
    return "You do not control Great Yew Bow.";
  if (!["defense", "attack"].includes(s.phase))
    return "Great Yew Bow has a Combat Action.";
  if (s.combat) return "Wait until the current attack has resolved.";
  if (a.exhausted) return "Great Yew Bow must be ready.";
  if (!canExhaust(u)) return "The attached hero must be ready.";
  if (!canFight(u)) return "The attached hero cannot attack.";
  if (!bowTargets(s, u).length)
    return "Choose an enemy in the staging area that the hero can attack.";
  return undefined;
}
export function otdPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((x) => x.id === attachmentId);
  return a?.code === P.bow ? bowProblem(s, u, a) : undefined;
}
export function useOtdPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = u.attachments.find((x) => x.id === attachmentId);
  if (a?.code !== P.bow) return false;
  const problem = bowProblem(s, u, a);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  choose(
    s,
    "Great Yew Bow · Choose an enemy in the staging area",
    bowTargets(s, u).map((enemy) => ({
      id: enemy.id,
      code: enemy.code,
      label: name(enemy),
      effects: [
        fx("hobbitPlayerBow", {
          source: a.id,
          target: u.id,
          text: enemy.id,
          player,
        }),
      ],
    })),
    `Exhaust Great Yew Bow and ${name(u)}, who makes a ranged attack alone.`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// Triggered hooks called by the engine.

/** Balin: pay 1 resource from his pool to cancel a shadow effect. */
export function otdPlayerShadowOptions(
  s: GameState,
  code: string,
  hasText: boolean,
): Option[] {
  const combat = s.combat;
  if (!hasText || !combat) return [];
  const enemy = get(s, combat.enemyId);
  if (!enemy || !canPlayerAffectShadow(s, enemy)) return [];
  return playerOrder(s).flatMap((player) =>
    seatView(s, player)
      .heroes.filter(
        (u) =>
          u.code === P.balin &&
          !u.blanked &&
          u.resources >= 1 &&
          heirsCanSpendResources(s, u) &&
          !(combat.otdBalin ?? []).includes(u.id),
      )
      .map((balin) => ({
        id: `otd-balin-${balin.id}`,
        code: P.balin,
        label: `Balin · Pay 1 resource to cancel it, then deal another shadow card${s.table ? ` · ${seatName(s, player)}` : ""}`,
        ability: {
          player,
          source: balin.id,
          code: P.balin,
          type: "response" as const,
        },
        effects: [
          fx("hobbitPlayerBalin", {
            source: balin.id,
            target: enemy.id,
            code,
            player,
          }),
        ],
      })),
  );
}

/** Bard the Bowman's ranged attacks and Black Arrow's response. */
export function otdPlayerAttackersDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
  mode?: string,
): Effect[] {
  for (const u of attackers)
    if (
      u.code === P.bard &&
      !u.blanked &&
      otdRangedAttack(s, u, enemy, mode) &&
      !playerEffectImmune(s, enemy, P.bard)
    ) {
      enemy.tempDefense = (enemy.tempDefense ?? 0) - 2;
      log(
        s,
        `Bard the Bowman makes a ranged attack: ${name(enemy)} gets −2 defense until the end of the phase.`,
        "good",
      );
    }
  return attackers.flatMap((u) =>
    u.attachments
      .filter((a) => a.code === P.arrow && enabled(a))
      .map((a) =>
        fx("hobbitPlayerArrowOffer", {
          target: u.id,
          source: a.id,
          text: enemy.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}
/** Black Arrow's +5 attack lasts until the attack resolves. */
export function otdPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      for (const id of ids) {
        const key = `${ARROW}${id}`;
        if (!s.used.includes(key)) continue;
        s.used = s.used.filter((k) => k !== key);
        const u = get(s, id);
        if (u) u.tempAttack = (u.tempAttack ?? 0) - 5;
      }
    });
}

/** Thrór's Key: after a location is added to the staging area. */
export function otdPlayerLocationEntered(s: GameState, location: Unit) {
  if (
    !isLocation(location) ||
    !inStaging(s, location) ||
    playerEffectImmune(s, location, P.key)
  )
    return;
  const order = playerOrder(s);
  const keys = [...globalCharacters(s), ...s.staging, ...allActiveLocations(s)]
    .flatMap((host) =>
      host.attachments
        .filter((a) => a.code === P.key && enabled(a))
        .map((a) => ({
          host,
          a,
          player: attachmentController(s, host, a) ?? ownerOf(s, host),
        })),
    )
    .filter((k) => k.host.id !== location.id && order.includes(k.player))
    .sort((x, y) => order.indexOf(x.player) - order.indexOf(y.player));
  prepend(
    s,
    ...keys.map(({ host, a, player }) =>
      fx("hobbitPlayerKeyOffer", {
        target: host.id,
        source: a.id,
        text: location.id,
        player,
      }),
    ),
  );
}
/** A location with Thrór's Key has a blank text box, except for traits. */
export const otdPlayerLocationBlanked = (u: Unit) =>
  isLocation(u) && u.attachments.some((a) => a.code === P.key && enabled(a));

/** Expert Treasure-hunter: after the attached hero quests successfully. */
export function otdPlayerQuestSucceeded(s: GameState) {
  const order = playerOrder(s);
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.committed)
      .flatMap((u) =>
        u.attachments
          .filter((a) => a.code === P.hunter && enabled(a))
          .map((a) => ({
            u,
            a,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          })),
      )
      .sort((x, y) => order.indexOf(x.player) - order.indexOf(y.player))
      .map(({ u, a, player }) =>
        fx("hobbitPlayerHunterOffer", { target: u.id, source: a.id, player }),
      ),
  );
}

/** A player whose hero Desperate Alliance lent is not eliminated meanwhile. */
export function otdPlayerHeroLent(s: GameState, player: number) {
  return seatView(s, player).used.some(
    (k) =>
      k.startsWith(LENT) &&
      globalCharacters(s).some((u) => u.id === k.slice(LENT.length)),
  );
}
/**
 * The end of the phase, before its phase-scoped markers are cleared: lent
 * heroes return and To me! O my kinsfolk! allies go to the bottom of the deck.
 */
export function otdPlayerPhaseEnd(s: GameState): Effect[] {
  const effects: Effect[] = [];
  for (const p of seatIndices(s)) {
    const view = seatView(s, p);
    for (const key of view.used.filter((k) => k.startsWith(LENT))) {
      const hero = globalCharacters(s).find(
        (u) => u.id === key.slice(LENT.length),
      );
      if (hero) returnLentHero(s, hero, p);
    }
    for (const key of view.used.filter((k) => k.startsWith(KINSFOLK))) {
      const id = key.slice(KINSFOLK.length);
      if (globalCharacters(s).some((u) => u.id === id))
        effects.push(
          fx("hobbitPlayerKinsfolkBottom", { target: id, player: p }),
        );
    }
    forOwner(s, p, () => {
      s.used = s.used.filter((k) => !k.startsWith(ARROW));
    });
  }
  return effects;
}
function returnLentHero(s: GameState, hero: Unit, lender: number) {
  const holder = ownerOf(s, hero);
  if (s.table?.seats[lender]?.eliminated) {
    forOwner(s, holder, () => destroy(s, hero, false));
    return;
  }
  if (holder === lender) return;
  moveHero(s, hero, holder, lender);
  log(
    s,
    `Desperate Alliance ends: ${name(hero)} returns to ${seatName(s, lender)}.`,
  );
}
function moveHero(s: GameState, hero: Unit, from: number, to: number) {
  forOwner(s, from, () => {
    s.heroes = s.heroes.filter((u) => u.id !== hero.id);
  });
  hero.controller = to;
  forOwner(s, to, () => {
    s.heroes.push(hero);
  });
}

// ---------------------------------------------------------------------------
// Effects.

const arrowOn = (hero: Unit | undefined, id?: string) =>
  hero?.attachments.find(
    (a) => a.id === id && a.code === P.arrow && enabled(a),
  );
const attackPending = (s: GameState, enemyId?: string, heroId?: string) =>
  s.queue.some(
    (e) =>
      e.kind === "resolvePlayerAttack" &&
      e.target === enemyId &&
      !!heroId &&
      !!e.ids?.includes(heroId),
  );

export function otdPlayerEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "hobbitPlayerShotCost": {
      const a = u?.attachments.find((x) => x.id === e.source);
      requireRule(
        u && a && weapons(s).some((w) => w.a.id === a.id && w.host.id === u.id),
        "Exhaust a ready Weapon attachment you control.",
      );
      a!.exhausted = true;
      return true;
    }
    case "hobbitPlayerAlliance": {
      const to = e.value ?? -1;
      if (
        !u ||
        !s.heroes.some((h) => h.id === u.id) ||
        !allianceRecipients(s).includes(to)
      )
        return true;
      const from = activeSeat(s);
      moveHero(s, u, from, to);
      s.used.push(`${LENT}${u.id}`);
      log(
        s,
        `Desperate Alliance: ${seatName(s, to)} controls ${name(u)} and its ${u.resources} resources until the end of the phase.`,
        "good",
      );
      return true;
    }
    case "hobbitPlayerRavens":
      addCurrentQuestProgress(s, e.value ?? 0);
      log(
        s,
        `Ravens of the Mountain places ${e.value ?? 0} progress on the current quest.`,
        "good",
      );
      return true;
    case "hobbitPlayerKinsfolk": {
      const index = e.value ?? -1;
      requireRule(
        s.discard[index] === e.code &&
          kinsfolkAllies(s).some((x) => x.index === index),
        "Choose a Dwarf ally from your discard pile.",
      );
      const ally = takePlayerDiscard(s, index);
      ally.owner ??= activeSeat(s);
      enterAlly(s, ally, false, false, false);
      s.used.push(`${KINSFOLK}${ally.id}`);
      log(
        s,
        `To me! O my kinsfolk!: ${name(ally)} enters play until the end of the phase.`,
        "good",
      );
      return true;
    }
    case "hobbitPlayerKinsfolkBottom":
      if (u && globalCharacters(s).some((x) => x.id === u.id))
        returnAlly(s, u, "bottom");
      return true;
    case "hobbitPlayerBow": {
      const bow = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.bow,
      );
      const enemy = get(s, e.text);
      requireRule(
        u &&
          bow &&
          enemy &&
          !bowProblem(s, u, bow) &&
          bowTargets(s, u).some((x) => x.id === enemy.id),
        "Great Yew Bow attacks an enemy in the staging area.",
      );
      bow!.exhausted = true;
      requireRule(exhaustCharacter(s, u!), "The attached hero cannot exhaust.");
      log(s, `${name(u!)} draws the Great Yew Bow against ${name(enemy!)}.`);
      playerAttack(s, enemy!, [u!.id], false, "great-yew-bow");
      return true;
    }
    case "hobbitPlayerBalin": {
      const balin = get(s, e.source),
        combat = s.combat;
      requireRule(
        balin?.code === P.balin &&
          !balin.blanked &&
          balin.resources >= 1 &&
          !!combat &&
          combat.enemyId === e.target &&
          !(combat.otdBalin ?? []).includes(balin.id),
        "Balin pays 1 resource from his pool, once per attack.",
      );
      (combat!.otdBalin ??= []).push(balin!.id);
      log(s, "Balin pays 1 resource to cancel the shadow effect.", "good");
      payThen(s, () => spendResources(s, balin!, 1), [
        fx("hobbitPlayerBalinShadow", {
          target: e.target,
          code: e.code,
          player: e.player,
        }),
      ]);
      return true;
    }
    case "hobbitPlayerBalinShadow": {
      if (!u || s.combat?.enemyId !== u.id) return true;
      const at = u.revealedShadowCount ?? 0;
      const codes = dealEnemyShadows(s, u, 1);
      if (!codes.length) return true;
      // The new card is the next one revealed during this attack.
      u.shadows.splice(u.shadows.length - codes.length, codes.length);
      u.shadows.splice(at, 0, ...codes);
      if (u.faceupShadows) {
        const flags = u.faceupShadows.splice(
          u.faceupShadows.length - codes.length,
          codes.length,
        );
        u.faceupShadows.splice(at, 0, ...flags);
      }
      const reveals = codes.map((code) => fx("shadowReveal", { code }));
      const done = s.queue.findIndex(
        (x) =>
          x.kind === "shadowResolved" && x.source === u.id && x.code === e.code,
      );
      if (done >= 0) s.queue.splice(done + 1, 0, ...reveals);
      else prepend(s, ...reveals);
      log(s, `Balin deals ${name(u)} another shadow card.`);
      return true;
    }
    case "hobbitPlayerArrowOffer": {
      const arrow = arrowOn(u, e.source);
      if (!u || !arrow || !attackPending(s, e.text, u.id)) return true;
      choosePlayerResponse(
        s,
        arrow.id,
        P.arrow,
        "Black Arrow · Add it to the victory display?",
        [
          {
            id: "use",
            code: P.arrow,
            label: `Add Black Arrow to the victory display: ${name(u)} gets +5 attack for this attack`,
            effects: [{ ...e, kind: "hobbitPlayerArrowUse" }],
          },
          skip,
        ],
        "Response: after the attached hero declares an attack.",
      );
      return true;
    }
    case "hobbitPlayerArrowUse": {
      const arrow = arrowOn(u, e.source);
      if (!u || !arrow || !attackPending(s, e.text, u.id)) return true;
      u.attachments = u.attachments.filter((a) => a.id !== arrow.id);
      addVictoryCard(s, arrow.code);
      u.tempAttack = (u.tempAttack ?? 0) + 5;
      seatView(s, ownerOf(s, u)).used.push(`${ARROW}${u.id}`);
      log(
        s,
        `Black Arrow goes to the victory display: ${name(u)} gets +5 attack for this attack.`,
        "good",
      );
      return true;
    }
    case "hobbitPlayerKeyOffer": {
      const key = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.key && enabled(a),
      );
      const location = get(s, e.text);
      if (
        !u ||
        !key ||
        !location ||
        !inStaging(s, location) ||
        playerEffectImmune(s, location, P.key)
      )
        return true;
      choosePlayerResponse(
        s,
        key.id,
        P.key,
        `Thrór's Key · Attach it to ${name(location)}?`,
        [
          {
            id: "use",
            code: P.key,
            label: `Attach Thrór's Key to ${name(location)}`,
            effects: [{ ...e, kind: "hobbitPlayerKeyAttach" }],
          },
          skip,
        ],
        "While attached to a location, Thrór's Key treats its printed text box as blank, except for traits.",
      );
      return true;
    }
    case "hobbitPlayerKeyAttach": {
      const key = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.key && enabled(a),
      );
      const location = get(s, e.text);
      if (
        !u ||
        !key ||
        !location ||
        !inStaging(s, location) ||
        playerEffectImmune(s, location, P.key)
      )
        return true;
      const controller =
        attachmentController(s, u, key) ?? e.player ?? activeSeat(s);
      u.attachments = u.attachments.filter((a) => a.id !== key.id);
      key.controller = controller;
      location.attachments.push(key);
      log(
        s,
        `Thrór's Key is attached to ${name(location)}; its text box is blank except for traits.`,
        "good",
      );
      return true;
    }
    case "hobbitPlayerHunterOffer": {
      const hunter = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.hunter && enabled(a),
      );
      if (!u || !hunter || !s.deck.length) return true;
      choosePlayerResponse(
        s,
        hunter.id,
        P.hunter,
        `Expert Treasure-hunter · ${name(u)} quested successfully`,
        [
          ...OTD_CARD_TYPES.map((type) => ({
            id: type.toLowerCase().replace(/\s+/g, "-"),
            code: P.hunter,
            label: `Name ${type}`,
            effects: [{ ...e, kind: "hobbitPlayerHunterName", text: type }],
          })),
          skip,
        ],
        "Name a card type and discard the top card of your deck. If it is the named type, take it into your hand.",
      );
      return true;
    }
    case "hobbitPlayerHunterName": {
      if (!s.deck.length) return true;
      const player = e.player ?? activeSeat(s);
      const continuation = s.queue;
      s.queue = [];
      const [code] = discardPlayerDeck(s, 1, player);
      log(
        s,
        `Expert Treasure-hunter names ${e.text} and discards ${card(code).name}.`,
      );
      // Responses to the discard resolve before the card is taken.
      s.queue.push(
        fx("hobbitPlayerHunterTake", { code, text: e.text, player }),
        ...continuation,
      );
      return true;
    }
    case "hobbitPlayerHunterTake": {
      if (!e.code || printedType(e.code) !== e.text) return true;
      const index = s.discard.lastIndexOf(e.code);
      if (index < 0 || dikeCannotLeaveDiscard(s)) return true;
      s.hand.push(takePlayerDiscard(s, index));
      log(
        s,
        `Expert Treasure-hunter: ${card(e.code).name} is the named type and goes to hand.`,
        "good",
      );
      return true;
    }
    default:
      return false;
  }
}
