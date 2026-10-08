import { ninNoCardEconomy } from "./nin-eilph-support";
import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { globalPlayerOrder } from "./table";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
import { takePlayerDeck } from "./core";
import { engagementCost } from "./core";
// Redhorn Gate actions and response windows, with physical Keeping Count tokens.
import { card } from "./cards";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  draw,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  check,
  exhaustCharacter,
  discardAttachment,
  discardPlayerDeck,
  enterAlly,
  allyCanEnter,
  progressLocation,
  raiseThreat,
  readyCharacter,
  returnAlly,
  spendEvent,
} from "./board";
import { hasResourceIcon } from "./expansion-passives";
import { isSacked } from "./carrock";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
const affected = (u: Unit) => !playerCardImmune(u);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy" && affected(u),
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && affected(u),
  );
const locationsWithProgress = (s: GameState) =>
  locations(s).filter(
    (u) => u.progress > 0 && locations(s).some((v) => v.id !== u.id),
  );
const spiritPayers = (s: GameState) =>
  s.heroes.filter(
    (u) =>
      hasResourceIcon(u, "spirit") &&
      u.resources > 0 &&
      heirsCanSpendResources(s, u),
  );
const uniqueAllowed = allyCanEnter;
const goodMealKey = (sphere: string) => `round:good-meal:${sphere}`;
const mealMatches = (key: string, sphere: string) =>
  key.startsWith("round:good-meal:") &&
  key.slice("round:good-meal:".length).split(",").includes(sphere);
const keeping = (s: GameState) =>
  allHeroes(s).flatMap((u) =>
    u.attachments.filter((a) => a.code === "04005" && !a.facedown),
  );

export function redhornPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (["04002", "04003"].includes(code) && !s.deck.length)
    return "This event requires a player deck card.";
  if (code === "04004" && ![...s.heroes, ...s.allies].length)
    return "Unseen Strike requires a character you control.";
  if (code === "04007")
    return "Renewed Friendship responds to another player's attachment play; use its response window.";
  if (code === "04009" && !s.encounterDeck.length)
    return "Needful to Know needs a top encounter card to look at.";
  return null;
}
export function redhornPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  return code === "04004" ? [...s.heroes, ...s.allies] : null;
}
export function redhornPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["04002", "04003", "04004", "04009"].includes(code)) return false;
  requireRule(
    !redhornPlayerPlayProblem(s, code),
    redhornPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "04002") {
    const discarded = discardPlayerDeck(s, 1)[0],
      cost = card(discarded).cost === "X" ? 0 : Number(card(discarded).cost);
    if (cost >= s.heroes.length + s.allies.length) {
      draw(s, 2);
      if (enemies(s).length)
        choose(
          s,
          "Taking Initiative · Enemy",
          opts(enemies(s), (u) => [fx("damage", { target: u.id, value: 2 })]),
        );
    }
  }
  if (code === "04003") {
    const top = s.deck.slice(0, 5),
      allies = top.flatMap((code, index) =>
        card(code).type_code === "ally" && uniqueAllowed(s, code)
          ? [
              {
                id: `ally-${index}`,
                label: card(code).name,
                code,
                effects: [fx("redhornTimelyAlly", { value: index, ids: top })],
              },
            ]
          : [],
      );
    log(s, `Timely Aid reveals ${top.map((c) => card(c).name).join(", ")}.`);
    if (allies.length)
      choose(
        s,
        "Timely Aid · Revealed cards",
        allies,
        "Put one revealed ally into play. Shuffle all other cards back.",
      );
    else {
      shuffle(s, s.deck);
      if (top.length)
        choose(
          s,
          "Timely Aid · No eligible revealed ally",
          top.map((code, i) => ({
            id: `view-${i}`,
            label: card(code).name,
            code,
            effects: [],
          })),
        );
    }
  }
  if (code === "04004") {
    const u = [...s.heroes, ...s.allies].find((u) => u.id === target);
    requireRule(u, "Choose a character you control.");
    s.used.push(`phase:unseen-strike:${u.id}`);
  }
  if (code === "04009") {
    raiseThreat(s, 1, "cost");
    check(s);
    if (s.status !== "playing") return true;
    const code = s.encounterDeck[0],
      c = card(code),
      amount =
        c.type_code === "enemy" || c.type_code === "location"
          ? (c.threat ?? 0)
          : 0;
    reduceThreat(s, amount, "04009");
    choose(
      s,
      "Needful to Know · Look at encounter top",
      [
        {
          id: "continue",
          label: `${c.name} · reduce threat by ${amount}`,
          code,
          effects: [],
        },
      ],
      "The encounter card is not revealed or moved.",
    );
  }
  return true;
}
export function redhornPlayerCost(s: GameState, c: Card, cost: number) {
  const meal =
    c.type_code === "event"
      ? 2 * s.used.filter((k) => mealMatches(k, c.sphere_code)).length
      : 0;
  return Math.max(0, cost - meal);
}
export function redhornPlayerEventPlayed(s: GameState, code: string) {
  if (card(code).type_code === "event")
    s.used = s.used.filter((k) => !mealMatches(k, card(code).sphere_code));
}
export function redhornPlayerStats(s: GameState, u: Unit) {
  const tokens = u.attachments.filter(
    (a) => a.code === "04005" && !a.blanked && !a.facedown,
  );
  const countBonus = tokens.reduce(
    (n, own) =>
      n +
      Math.max(
        0,
        ...keeping(s)
          .filter((a) => a.id !== own.id)
          .map((a) => (a.resourceTokens ?? 0) - (own.resourceTokens ?? 0)),
      ),
    0,
  );
  return {
    will: 0,
    attack:
      countBonus +
      (u.code === "04028" &&
      !u.blanked &&
      allHeroes(s).some((v) => v.code === "04001")
        ? 2
        : 0),
    defense:
      u.code === "04001" &&
      !u.blanked &&
      allHeroes(s).some((v) => v.code === "04028")
        ? 2
        : 0,
  };
}
export function redhornPlayerAttackBonus(
  s: GameState,
  u: Unit,
  enemy: Unit,
): number {
  if (engagementCost(s, enemy) <= seatView(s, ownerOf(s, u)).threat) return 0;
  return (
    3 *
    globalPlayerOrder(s).reduce(
      (n, i) =>
        n +
        seatView(s, i).used.filter((k) => k === `phase:unseen-strike:${u.id}`)
          .length,
      0,
    )
  );
}
export function redhornPlayerDefenderDeclared(s: GameState, u: Unit) {
  if (
    u.code === "04001" &&
    !u.blanked &&
    !isSacked(u) &&
    u.resources > 0 &&
    heirsCanSpendResources(s, u) &&
    u.exhausted
  )
    prepend(
      s,
      fx("redhornElrohirResponse", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function redhornPlayerAttackKilled(s: GameState, attackerIds: string[]) {
  for (const id of attackerIds) {
    const host = get(s, id);
    if (!host) continue;
    for (const a of host.attachments.filter(
      (a) => a.code === "04005" && !a.blanked && !a.facedown,
    ))
      a.resourceTokens = (a.resourceTokens ?? 0) + 1;
  }
}
export function redhornPlayerAttachmentPlayed(
  s: GameState,
  host: Unit,
  _a: Attachment,
  playingPlayer: number,
) {
  const controller = ownerOf(s, host);
  if (card(host.code).type_code !== "hero" || controller === playingPlayer)
    return;
  const p = seatView(s, controller);
  if (p.hand.some((u) => u.code === "04007") && canPay(p, card("04007")))
    prepend(
      s,
      fx("redhornFriendshipResponse", {
        value: playingPlayer,
        player: controller,
      }),
    );
}
export const redhornPlayerAbilityLabel = (code: string) =>
  code === "04008"
    ? "Exhaust · move up to 2 location progress"
    : code === "04010"
      ? "Discard · reduce next matching event cost"
      : undefined;
export function redhornPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === "04010",
    );
    if (a && (a.blanked || a.facedown))
      return "Good Meal's printed text is inactive.";
    return undefined;
  }
  if (u.code === "04008" && (u.exhausted || !locationsWithProgress(s).length))
    return "Ravenhill Scout must be ready and needs progress to move between locations.";
  return undefined;
}
export function useRedhornPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === "04010",
    );
    if (!a) return false;
    requireRule(
      !redhornPlayerAbilityProblem(s, u, attachmentId),
      redhornPlayerAbilityProblem(s, u, attachmentId) ?? "",
    );
    const spheres = ["leadership", "tactics", "spirit", "lore"].filter(
      (sphere) => hasResourceIcon(u, sphere),
    );
    discardAttachment(s, u, a);
    s.used.push(goodMealKey(spheres.join(",")));
    return true;
  }
  if (u.code !== "04008") return false;
  requireRule(
    !redhornPlayerAbilityProblem(s, u),
    redhornPlayerAbilityProblem(s, u) ?? "",
  );
  exhaustCharacter(s, u);
  choose(
    s,
    "Ravenhill Scout · Source location",
    opts(locationsWithProgress(s), (source) => [
      fx("redhornScoutTarget", { source: source.id }),
    ]),
  );
  return true;
}
export const redhornPlayerHandAbilityLabel = (code: string) =>
  code === "04006" ? "Pay 1 Spirit · enter exhausted and committed" : undefined;
export function redhornPlayerHandAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== "04006" || !s.hand.some((h) => h.id === u.id))
    return "Choose Bofur in your own hand.";
  if (!["quest", "staging"].includes(s.phase))
    return "Bofur requires a Quest Action window.";
  if (!spiritPayers(s).length) return "Bofur needs one Spirit hero resource.";
  if (!uniqueAllowed(s, u.code)) return "A unique Bofur is already in play.";
  return undefined;
}
export function useRedhornPlayerHandAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "04006") return false;
  requireRule(
    !redhornPlayerHandAbilityProblem(s, u),
    redhornPlayerHandAbilityProblem(s, u) ?? "",
  );
  choose(
    s,
    "Bofur · Pay Quest Action",
    opts(spiritPayers(s), (payer) => [
      fx("redhornBofurEnter", { source: u.id, target: payer.id }),
    ]),
  );
  return true;
}
export function redhornPlayerQuestSucceeded(s: GameState) {
  prepend(
    s,
    ...allCharacters(s)
      .filter(
        (u) =>
          u.code === "04006" &&
          playerOrder(s).some((i) =>
            seatView(s, i).used.includes(`phase:bofur:${u.id}`),
          ),
      )
      .map((u) =>
        fx("redhornBofurReturn", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function handleRedhornPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "redhornTimelyAlly": {
      const index = e.value ?? -1;
      requireRule(
        e.ids &&
          index >= 0 &&
          index < e.ids.length &&
          e.ids.every((code, i) => s.deck[i] === code) &&
          card(s.deck[index]).type_code === "ally" &&
          uniqueAllowed(s, s.deck[index]),
        "Choose one eligible ally from the original five revealed cards.",
      );
      const u = takePlayerDeck(s, index);
      shuffle(s, s.deck);
      enterAlly(s, u, false, false);
      return true;
    }
    case "redhornElrohirResponse": {
      const hero = get(s, e.target);
      if (
        hero?.code === "04001" &&
        !hero.blanked &&
        !isSacked(hero) &&
        hero.resources > 0 &&
        heirsCanSpendResources(s, hero) &&
        hero.exhausted
      )
        choose(s, "Elrohir · Declared defender", [
          {
            id: "ready",
            label: "Spend Elrohir's resource to ready him",
            code: hero.code,
            effects: [fx("redhornElrohirReady", { target: hero.id })],
          },
          skip,
        ]);
      return true;
    }
    case "redhornElrohirReady": {
      const hero = get(s, e.target);
      requireRule(
        hero?.code === "04001" &&
          !hero.blanked &&
          !isSacked(hero) &&
          hero.resources > 0 &&
          heirsCanSpendResources(s, hero) &&
          hero.exhausted,
        "Elrohir cannot pay his defender response.",
      );
      spendResources(s, hero, 1);
      readyCharacter(s, hero);
      return true;
    }
    case "redhornScoutTarget": {
      const source = locationsWithProgress(s).find((u) => u.id === e.source);
      if (!source) return true;
      choose(
        s,
        "Ravenhill Scout · Receiving location",
        opts(
          locations(s).filter((u) => u.id !== source.id),
          (target) => [
            fx("redhornScoutAmount", { source: source.id, target: target.id }),
          ],
        ),
      );
      return true;
    }
    case "redhornScoutAmount": {
      const source = locationsWithProgress(s).find((u) => u.id === e.source);
      requireRule(
        source &&
          locations(s).some((u) => u.id === e.target && u.id !== source.id),
        "Choose two different eligible locations.",
      );
      choose(
        s,
        "Ravenhill Scout · Progress amount",
        Array.from({ length: Math.min(2, source.progress) }, (_, i) => ({
          id: `amount-${i + 1}`,
          label: `${i + 1}`,
          effects: [{ ...e, kind: "redhornScoutMove", value: i + 1 }],
        })),
      );
      return true;
    }
    case "redhornScoutMove": {
      const source = locations(s).find((u) => u.id === e.source),
        target = locations(s).find((u) => u.id === e.target),
        amount = e.value ?? 0;
      requireRule(
        source &&
          target &&
          source.id !== target.id &&
          amount > 0 &&
          amount <= 2 &&
          source.progress >= amount,
        "The selected progress cannot be moved.",
      );
      source.progress -= amount;
      progressLocation(s, target, amount);
      return true;
    }
    case "redhornBofurEnter": {
      const hand = s.hand.find((u) => u.id === e.source),
        payer = spiritPayers(s).find((u) => u.id === e.target);
      requireRule(
        hand && payer && !redhornPlayerHandAbilityProblem(s, hand),
        "Bofur can no longer enter through this Quest Action.",
      );
      spendResources(s, payer, 1);
      s.hand = s.hand.filter((u) => u.id !== hand.id);
      hand.exhausted = true;
      hand.committed = true;
      s.used.push(`phase:bofur:${hand.id}`);
      enterAlly(s, hand, false, false);
      return true;
    }
    case "redhornBofurReturn": {
      const bofur = get(s, e.target);
      if (bofur?.code === "04006") returnAlly(s, bofur);
      return true;
    }
    case "redhornFriendshipResponse":
      if (s.hand.some((u) => u.code === "04007") && canPay(s, card("04007")))
        choose(s, "Renewed Friendship · Attachment played", [
          {
            id: "play",
            label: "Play Renewed Friendship",
            code: "04007",
            effects: [fx("redhornFriendshipMode", { value: e.value })],
          },
          skip,
        ]);
      return true;
    case "redhornFriendshipMode": {
      if (!spendEvent(s, "04007")) return true;
      const player = e.value ?? 0,
        p = seatView(s, player);
      choose(s, `Renewed Friendship · ${seatName(s, player)}`, [
        ...p.heroes
          .filter((u) => u.exhausted)
          .map((u) => ({
            id: u.id,
            label: `Ready ${card(u.code).name}`,
            code: u.code,
            effects: [fx("ready", { target: u.id, player })],
          })),
        ...(ninNoCardEconomy(s)
          ? []
          : [
              {
                id: "draw",
                label: "Draw 1 card",
                effects: [fx("draw", { value: 1, player })],
              },
            ]),
        ...(p.threat > 0
          ? [
              {
                id: "threat",
                label: "Lower threat by 2",
                effects: [fx("threat", { value: -2, player, code: "04007" })],
              },
            ]
          : []),
      ]);
      return true;
    }
    default:
      return false;
  }
}
