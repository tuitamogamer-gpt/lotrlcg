import { spendResources } from "./core";
// Exact active and triggered player rules from A Journey to Rhosgobel.
import { card, name, plain } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  skip,
} from "./core";
import {
  check,
  exhaustCharacter,
  discardCharacter,
  returnAlly,
  spendEvent,
} from "./board";
import { khazadCannotExhaust } from "./khazad-dum";
import { isSacked } from "./carrock";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { gondorResourcesGained } from "./gondor-player-cards";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { consumeLeaveCard, leaveCardAvailable } from "./leave-consumption";
import {
  firstPlayer,
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";

const enemies = (s: GameState) =>
  [...allEngaged(s), ...s.staging].filter(
    (u) =>
      card(u.code).type_code === "enemy" &&
      !/immune to player card effects/i.test(plain(card(u.code).text)),
  );
const giftsRecipients = (s: GameState, source: Unit) =>
  allHeroes(s).filter((u) => u.id !== source.id && !isSacked(u));
const giftsDonors = (s: GameState) =>
  allHeroes(s).filter(
    (u) =>
      u.resources > 0 &&
      hasResourceIcon(u, "leadership") &&
      giftsRecipients(s, u).length,
  );
const damagedEnemies = (s: GameState) =>
  enemies(s).filter(
    (u) => u.damage > 0 && enemies(s).some((other) => other.id !== u.id),
  );
const creatures = (s: GameState) =>
  [...allCharacters(s), ...enemies(s)].filter(
    (u) => hasTrait(u, "Creature") && rhosgobelHealingAllowed(s, u),
  );
const readyEagles = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => !u.exhausted && !khazadCannotExhaust(u) && hasTrait(u, "Eagle"),
  );

export function rhosgobelPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "02052" && !giftsDonors(s).length)
    return "Parting Gifts needs a Leadership hero with resources and another hero able to gain them.";
  if (code === "02058" && !damagedEnemies(s).length)
    return "Infighting needs a damaged enemy and a different enemy.";
  return null;
}
export function rhosgobelPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  return code === "02052"
    ? giftsDonors(s)
    : code === "02058"
      ? damagedEnemies(s)
      : null;
}
export function rhosgobelPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (code === "02052") {
    const donor = giftsDonors(s).find((u) => u.id === target);
    requireRule(donor, "Choose a Leadership hero with resources to move.");
    choose(
      s,
      "Parting Gifts · Receiving hero",
      opts(giftsRecipients(s, donor), (u) => [
        fx("rhosGiftsAmount", { source: donor.id, target: u.id }),
      ]),
    );
    return true;
  }
  if (code === "02058") {
    const donor = damagedEnemies(s).find((u) => u.id === target);
    requireRule(donor, "Choose an enemy with damage tokens to move.");
    choose(
      s,
      "Infighting · Receiving enemy",
      opts(
        enemies(s).filter((u) => u.id !== donor.id),
        (u) => [fx("rhosInfightingAmount", { source: donor.id, target: u.id })],
      ),
    );
    return true;
  }
  return false;
}
export const rhosgobelAbilityLabel = (code: string) =>
  code === "02059" ? "Spend resources to heal a Creature" : undefined;
export function rhosgobelAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== "02059") return undefined;
  if (u.resources < 1) return "Radagast needs a resource in his own pool.";
  if (!creatures(s).length)
    return "A Creature must have damage that can be healed.";
  return undefined;
}
export function useRhosgobelAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "02059") return false;
  requireRule(
    !rhosgobelAbilityProblem(s, u),
    rhosgobelAbilityProblem(s, u) ?? "",
  );
  choose(
    s,
    "Radagast · Creature to heal",
    opts(creatures(s), (target) => [
      fx("rhosRadagastAmount", { source: u.id, target: target.id }),
    ]),
    "Spend resources from Radagast's pool. This action does not exhaust him.",
  );
  return true;
}
function chooseAmount(
  s: GameState,
  title: string,
  max: number,
  kind: string,
  e: Effect,
) {
  requireRule(max > 0, "At least one token must be moved or healed.");
  choose(
    s,
    title,
    Array.from({ length: max }, (_, i) => ({
      id: `amount-${i + 1}`,
      label: `${i + 1}`,
      effects: [{ ...e, kind, value: i + 1 }],
    })),
  );
}

/** Capture each unblanked attachment's controller before its location leaves play. */
export function rhosgobelLocationExplored(s: GameState, location: Unit) {
  prepend(
    s,
    ...location.attachments
      .filter((a) => a.code === "02056" && !a.blanked)
      .map((a) =>
        fx("rhosMathomResponse", {
          player: a.owner ?? activeSeat(s),
          value: firstPlayer(s),
          code: a.code,
        }),
      ),
  );
}

/** Removal from the quest ends commitment; the Forced effect tests that status. */
export function rhosgobelQuestResolved(s: GameState) {
  const escorts = allCharacters(s).filter(
    (u) => u.code === "02055" && u.committed,
  );
  for (const escort of escorts) {
    log(s, "Escort from Edoras is discarded after resolving its quest.");
    discardCharacter(s, escort);
  }
}

function recoverableHero(s: GameState, code: string, owner: number) {
  const p = seatView(s, owner);
  return (
    !s.table?.seats[owner].eliminated &&
    p.heroes.length > 0 &&
    p.discard.includes(code) &&
    !allCharacters(s).some((u) => card(u.code).name === card(code).name)
  );
}
function landrovals(s: GameState) {
  return s.heroes.length && !s.used.includes("game:landroval")
    ? s.allies.filter((u) => u.code === "02053")
    : [];
}
/** Destruction only: generic discard/return cannot open these response windows. */
export function rhosgobelCharacterDestroyed(
  s: GameState,
  victim: Unit,
  controller: number,
) {
  const type = card(victim.code).type_code;
  const owner = victim.owner ?? controller;
  if (type === "hero") {
    if (!recoverableHero(s, victim.code, owner)) return;
    prepend(
      s,
      ...playerOrder(s)
        .filter((player) => landrovals(seatView(s, player)).length)
        .map((player) =>
          fx("rhosLandrovalResponse", {
            player,
            code: victim.code,
            count: owner,
            target: victim.id,
          }),
        ),
    );
  } else if (type === "ally") {
    prepend(
      s,
      ...playerOrder(s)
        .filter((player) => {
          const p = seatView(s, player);
          return (
            p.heroes.length &&
            readyEagles(p).length &&
            p.hand.some((u) => u.code === "02054") &&
            canPay(p, card("02054"))
          );
        })
        .map((player) =>
          fx("rhosEyrieResponse", {
            player,
            code: victim.code,
            count: owner,
            target: victim.id,
          }),
        ),
    );
  }
}

export function handleRhosgobelPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "rhosGiftsAmount": {
      const donor = giftsDonors(s).find((u) => u.id === e.source),
        recipient =
          donor && giftsRecipients(s, donor).find((u) => u.id === e.target);
      requireRule(
        donor && recipient,
        "These heroes cannot move resources now.",
      );
      chooseAmount(
        s,
        "Parting Gifts · Resources to move",
        donor.resources,
        "rhosGiftsMove",
        e,
      );
      return true;
    }
    case "rhosGiftsMove": {
      const donor = giftsDonors(s).find((u) => u.id === e.source),
        recipient =
          donor && giftsRecipients(s, donor).find((u) => u.id === e.target),
        amount = e.value ?? 0;
      requireRule(
        donor &&
          recipient &&
          Number.isInteger(amount) &&
          amount > 0 &&
          amount <= donor.resources,
        "Parting Gifts requires available resources and an eligible receiving hero.",
      );
      donor.resources -= amount;
      recipient.resources += amount;
      gondorResourcesGained(s, recipient, amount, true);
      log(
        s,
        `Parting Gifts moves ${amount} resources from ${name(donor)} to ${name(recipient)}.`,
        "good",
      );
      return true;
    }
    case "rhosInfightingAmount": {
      const donor = damagedEnemies(s).find((u) => u.id === e.source),
        recipient = enemies(s).find(
          (u) => u.id === e.target && u.id !== donor?.id,
        );
      requireRule(
        donor && recipient,
        "Infighting requires two different enemies.",
      );
      chooseAmount(
        s,
        "Infighting · Damage tokens to move",
        donor.damage,
        "rhosInfightingMove",
        e,
      );
      return true;
    }
    case "rhosInfightingMove": {
      const donor = damagedEnemies(s).find((u) => u.id === e.source),
        recipient = enemies(s).find(
          (u) => u.id === e.target && u.id !== donor?.id,
        ),
        amount = e.value ?? 0;
      requireRule(
        donor &&
          recipient &&
          Number.isInteger(amount) &&
          amount > 0 &&
          amount <= donor.damage,
        "Infighting requires damage tokens to move between two different enemies.",
      );
      // Moving tokens is not dealing damage. Complete both changes before destruction checks.
      donor.damage -= amount;
      recipient.damage += amount;
      log(
        s,
        `Infighting moves ${amount} damage from ${name(donor)} to ${name(recipient)}.`,
        "good",
      );
      check(s);
      return true;
    }
    case "rhosRadagastAmount": {
      const source = get(s, e.source),
        target = creatures(s).find((u) => u.id === e.target);
      requireRule(
        source?.code === "02059" && target,
        "Radagast requires a damaged Creature.",
      );
      chooseAmount(
        s,
        "Radagast · Wounds to heal",
        Math.min(source.resources, target.damage),
        "rhosRadagastHeal",
        e,
      );
      return true;
    }
    case "rhosRadagastHeal": {
      const source = get(s, e.source),
        target = creatures(s).find((u) => u.id === e.target),
        amount = e.value ?? 0;
      requireRule(
        source?.code === "02059" &&
          target &&
          Number.isInteger(amount) &&
          amount > 0 &&
          amount <= source.resources &&
          amount <= target.damage,
        "Radagast requires enough resources and wounds.",
      );
      spendResources(s, source, amount);
      rhosgobelHeal(s, target, amount, {
        source: source.id,
        code: source.code,
        player: ownerOf(s, source),
      });
      return true;
    }
    case "rhosMathomResponse":
      choose(s, "Ancient Mathom · Explored location", [
        {
          id: "draw",
          label: "First player draws 3 cards",
          code: "02056",
          effects: [fx("draw", { value: 3, player: e.value ?? 0 })],
        },
        skip,
      ]);
      return true;
    case "rhosLandrovalResponse": {
      if (
        !e.code ||
        !leaveCardAvailable(s, e.target) ||
        !recoverableHero(s, e.code, e.count ?? 0) ||
        !landrovals(s).length
      )
        return true;
      choose(
        s,
        "Landroval · Destroyed hero",
        [
          ...opts(landrovals(s), (u) => [
            { ...e, kind: "rhosLandrovalRecover", source: u.id },
          ]),
          skip,
        ],
        `Return Landroval to his owner's hand to return ${card(e.code).name} with 1 damage. Once per game for this player.`,
      );
      return true;
    }
    case "rhosLandrovalRecover": {
      const landroval = landrovals(s).find((u) => u.id === e.source),
        owner = e.count ?? 0;
      requireRule(
        landroval &&
          e.code &&
          leaveCardAvailable(s, e.target) &&
          recoverableHero(s, e.code, owner),
        "This hero cannot be recovered now.",
      );
      s.used.push("game:landroval");
      consumeLeaveCard(s, e.target!);
      returnAlly(s, landroval);
      const code = e.code;
      forOwner(s, owner, () => {
        s.discard.splice(s.discard.lastIndexOf(code), 1);
        const recovered = make(s, code);
        recovered.owner = owner;
        recovered.damage = 1;
        s.heroes.push(recovered);
        s.fallenThreat -= card(code).threat ?? 0;
      });
      log(
        s,
        `Landroval returns ${card(code).name} to play with 1 damage.`,
        "good",
      );
      check(s);
      return true;
    }
    case "rhosEyrieResponse": {
      const owner = e.count ?? 0;
      if (
        !e.code ||
        !seatView(s, owner).discard.includes(e.code) ||
        !readyEagles(s).length ||
        !s.hand.some((u) => u.code === "02054") ||
        !canPay(s, card("02054")) ||
        !leaveCardAvailable(s, e.target)
      )
        return true;
      choose(
        s,
        "To the Eyrie · Destroyed ally",
        [
          ...opts(readyEagles(s), (u) => [
            { ...e, kind: "rhosEyrieRecover", source: u.id },
          ]),
          skip,
        ],
        `Play To the Eyrie and exhaust an Eagle you control to return ${card(e.code).name} to its owner's hand.`,
      );
      return true;
    }
    case "rhosEyrieRecover": {
      const eagle = readyEagles(s).find((u) => u.id === e.source),
        owner = e.count ?? 0;
      requireRule(
        eagle &&
          e.code &&
          seatView(s, owner).discard.includes(e.code) &&
          leaveCardAvailable(s, e.target),
        "This ally cannot be returned now.",
      );
      requireRule(
        exhaustCharacter(s, eagle),
        "Pay To the Eyrie's Eagle exhaustion cost.",
      );
      if (!spendEvent(s, "02054")) return true;
      // Mark the physical destruction for every seat; older same-title discards are not this ally.
      consumeLeaveCard(s, e.target!);
      const code = e.code;
      forOwner(s, owner, () => {
        s.discard.splice(s.discard.lastIndexOf(code), 1);
        const fresh = make(s, code);
        fresh.owner = owner;
        s.hand.push(fresh);
      });
      log(
        s,
        `To the Eyrie returns ${card(code).name} to its owner's hand.`,
        "good",
      );
      return true;
    }
    default:
      return false;
  }
}
