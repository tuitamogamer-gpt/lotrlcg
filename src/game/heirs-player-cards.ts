import { canGainResources } from "./core";
import { globalPlayerOrder } from "./table";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
// Exact Heirs of Númenor player actions, lasting effects and physical Trap entry.
import { card, plain } from "./cards";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  log,
  prepend,
  requireRule,
  skip,
  takePlayerDeck,
} from "./core";
import {
  damage,
  discardCharacter,
  discardPlayerDeck,
  exhaustCharacter,
  spendEvent,
} from "./board";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { gondorResourcesGained } from "./gondor-player-cards";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { currentQuestUnit } from "./quest-state";
import { consumeLeaveCard, leaveCardAvailable } from "./leave-consumption";

const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const allHosts = (s: GameState): Unit[] => [
  ...new Map(
    [
      ...allCharacters(s),
      ...allEngaged(s),
      ...s.staging,
      ...allActiveLocations(s),
      ...(currentQuestUnit(s) ? [currentQuestUnit(s)!] : []),
    ].map((u) => [u.id, u]),
  ).values(),
];
const hasMarker = (s: GameState, key: string) =>
  globalPlayerOrder(s).some((player) => seatView(s, player).used.includes(key));
const ownEnemies = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "enemy");
const resourceTargets = (s: GameState) =>
  allHeroes(s).filter((u) => hasTrait(u, "Gondor") && canGainResources(s, u));
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const rawTraits = (c: Card) =>
  (c.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const masterMarker = (type: string) => `phase:master-lore:${type}`;
export const HEIRS_ATTACHMENT_ACTIONS = ["05013"];

/** The cost supplied here already includes ordinary reducers and surcharges. */
export function heirsPlayerCost(
  s: GameState,
  c: Card,
  cost: number,
  target?: Unit,
): number {
  let value = cost;
  if (
    target?.code === "05001" &&
    !target.blanked &&
    c.type_code === "attachment" &&
    rawTraits(c).some((t) => t === "Weapon" || t === "Armor")
  )
    value = Math.max(0, value - 2);
  if (c.sphere_code === "lore") {
    const discounts = s.used.filter(
      (k) => k === masterMarker(c.type_code),
    ).length;
    if (discounts && value > 0) value = Math.max(1, value - discounts);
  }
  return value;
}
export function heirsPlayerCardPlayed(s: GameState, c: Card) {
  if (c.sphere_code === "lore")
    s.used = s.used.filter((k) => k !== masterMarker(c.type_code));
}
export function heirsPlayerStats(s: GameState, u: Unit) {
  const copies = globalPlayerOrder(s).reduce(
    (count, p) =>
      count +
      seatView(s, p).used.filter((k) => k === `round:beacons:${u.id}`).length,
    0,
  );
  return { will: 0, attack: 0, defense: 2 * copies };
}
export const heirsPlayerNoDefenseExhaust = (s: GameState, u: Unit) =>
  hasMarker(s, `round:beacons:${u.id}`);
export function heirsPlayerTraitGrants(s: GameState, id: string): string[] {
  return ["Gondor", "Rohan"].filter((trait) =>
    hasMarker(s, `phase:mutual:${trait}:${id}`),
  );
}
export function heirsPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "05006" && !resourceTargets(s).length)
    return "Wealth of Gondor needs a Gondor hero who can gain resources.";
  if (code === "05012")
    return "A Watchful Peace responds after a location with no victory points is explored; use its response window.";
  if (code === "05011" && !allCharacters(s).length)
    return "Light the Beacons needs a character in play.";
  if (
    code === "05005" &&
    !allHosts(s).some(
      (u) =>
        hasTrait(u, "Gondor") ||
        hasTrait(u, "Rohan") ||
        u.attachments.some((a) =>
          attachmentTraits(s, a).some((t) => t === "Gondor" || t === "Rohan"),
        ),
    )
  )
    return "Mutual Accord needs a Gondor or Rohan card in play.";
  return null;
}
export const heirsPlayerPlayTargets = (
  s: GameState,
  code: string,
): Unit[] | null =>
  code === "05006" ? resourceTargets(s) : code === "05017" ? [] : null;
function attachmentTraits(s: GameState, a: Attachment) {
  return [
    ...(!a.blanked && !a.facedown ? rawTraits(card(a.code)) : []),
    ...heirsPlayerTraitGrants(s, a.id),
  ];
}
export function heirsPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (!["05005", "05006", "05011"].includes(code)) return false;
  requireRule(
    !heirsPlayerPlayProblem(s, code),
    heirsPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "05006") {
    const hero = resourceTargets(s).find((u) => u.id === target);
    requireRule(hero, "Choose a Gondor hero who can gain resources.");
    hero.resources++;
    gondorResourcesGained(s, hero, 1, true);
  } else if (code === "05011") {
    for (const u of allCharacters(s)) s.used.push(`round:beacons:${u.id}`);
  } else {
    // Snapshot both original sets before assigning either lasting trait.
    const grants = allHosts(s).flatMap((u) => [
      ...["Gondor", "Rohan"]
        .filter((t) => hasTrait(u, t))
        .map((t) => ({ id: u.id, trait: t === "Gondor" ? "Rohan" : "Gondor" })),
      ...u.attachments.flatMap((a) =>
        ["Gondor", "Rohan"]
          .filter((t) => attachmentTraits(s, a).includes(t))
          .map((t) => ({
            id: a.id,
            trait: t === "Gondor" ? "Rohan" : "Gondor",
          })),
      ),
    ]);
    for (const grant of grants)
      s.used.push(`phase:mutual:${grant.trait}:${grant.id}`);
  }
  return true;
}
export const heirsPlayerAbilityLabel = (code: string) =>
  ({
    "05010": "Discard Damrod · lower your threat",
    "05015": "Exhaust · next added enemy has 0 threat",
    "05016": "Exhaust · discount next Lore card",
  })[code as "05010" | "05015" | "05016"];
export function heirsPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (a?.code !== "05013") return undefined;
    if (a.blanked || a.facedown)
      return "Blood of Númenor's printed ability is blank.";
    if (!heirsCanSpendResources(s, u))
      return "Orc Vanguard prevents this hero from spending resources.";
    if (u.resources < 2)
      return "The attached hero needs at least 2 resources to gain defense after paying 1.";
    if (hasMarker(s, `phase:blood-numenor:${a.id}`))
      return "This copy of Blood of Númenor has already been used this phase.";
    return undefined;
  }
  if (!["05010", "05015", "05016"].includes(u.code)) return undefined;
  if (u.blanked || isSacked(u))
    return "This character cannot trigger its printed ability.";
  if (u.code === "05010")
    return ownEnemies(s).length && s.threat > 0
      ? undefined
      : "Damrod needs staging enemies and threat that can be lowered.";
  if (!canExhaust(u)) return "This ally must be ready and able to exhaust.";
  return undefined;
}
export function useHeirsPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    if (a?.code !== "05013") return false;
    requireRule(
      !heirsPlayerAbilityProblem(s, u, attachmentId),
      heirsPlayerAbilityProblem(s, u, attachmentId) ?? "",
    );
    spendResources(s, u, 1);
    u.tempDefense = (u.tempDefense ?? 0) + u.resources;
    s.used.push(`phase:blood-numenor:${a.id}`);
    return true;
  }
  if (!["05010", "05015", "05016"].includes(u.code)) return false;
  requireRule(
    !heirsPlayerAbilityProblem(s, u),
    heirsPlayerAbilityProblem(s, u) ?? "",
  );
  if (u.code === "05010") {
    const amount = ownEnemies(s).length;
    s.threat = Math.max(0, s.threat - amount);
    discardCharacter(s, u);
    return true;
  }
  requireRule(exhaustCharacter(s, u), "This ally cannot exhaust.");
  if (u.code === "05015") s.used.push(`phase:tracker-next:${u.id}`);
  else
    choose(
      s,
      "Master of Lore · Name a card type",
      ["ally", "attachment", "event"].map((type) => ({
        id: type,
        label: type[0].toUpperCase() + type.slice(1),
        effects: [fx("heirsMasterType", { text: type })],
      })),
    );
  return true;
}
export function heirsPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (
    u.code === "05014" &&
    played &&
    fromHand &&
    !u.blanked &&
    seatView(s, ownerOf(s, u)).deck.length
  )
    prepend(
      s,
      fx("heirsHunterResponse", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function heirsPlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  ids: string[],
) {
  if (immune(enemy)) return;
  const effects = ids.flatMap((id) => {
    const u = get(s, id);
    return u
      ? u.attachments
          .filter((a) => a.code === "05009" && !a.blanked && !a.facedown)
          .map((a) =>
            fx("heirsSpearResponse", {
              source: u.id,
              target: enemy.id,
              code: a.id,
              player: attachmentController(s, u, a) ?? ownerOf(s, u),
            }),
          )
      : [];
  });
  prepend(s, ...effects);
}
/** Ranger Spikes' destination is staging rather than a chosen host. */
export function heirsPlayerSpecialAttachmentEntry(
  s: GameState,
  u: Unit,
): boolean {
  if (u.code !== "05017") return false;
  requireRule(
    !s.staging.some((other) => other.id === u.id),
    "The same physical Trap is already in staging.",
  );
  u.owner ??= activeSeat(s);
  s.staging.push(u);
  return true;
}
export function heirsPlayerEnemyAddedToStaging(s: GameState, enemy: Unit) {
  if (card(enemy.code).type_code !== "enemy") return;
  const eligible =
    !immune(enemy) &&
    !/cannot have attachments/i.test(plain(card(enemy.code).text));
  if (eligible) {
    const traps = s.staging.filter((u) => u.code === "05017" && !u.blanked);
    for (const trap of traps) {
      s.staging = s.staging.filter((u) => u.id !== trap.id);
      enemy.attachments.push({
        id: trap.id,
        code: trap.code,
        owner: trap.owner ?? activeSeat(s),
        exhausted: trap.exhausted,
      });
    }
  }
  const pending = playerOrder(s).flatMap((player) =>
    seatView(s, player).used.filter((k) => k.startsWith("phase:tracker-next:")),
  );
  for (const player of playerOrder(s)) {
    const p = seatView(s, player);
    p.used = p.used.filter((k) => !k.startsWith("phase:tracker-next:"));
  }
  if (pending.length && !immune(enemy)) enemy.suppressed = true;
}
export const heirsPlayerNoEngagementCheck = (u: Unit) =>
  u.attachments.some((a) => a.code === "05017" && !a.blanked && !a.facedown);
export const heirsPlayerThreatModifier = (u: Unit) =>
  -2 *
  u.attachments.filter((a) => a.code === "05017" && !a.blanked && !a.facedown)
    .length;
function peaceDiscardIndex(s: GameState, e: Effect): number {
  let occurrence = e.value ?? -1;
  return s.encounterDiscard.findIndex(
    (code) => code === e.code && occurrence-- === 0,
  );
}
function peaceAvailable(s: GameState, e: Effect) {
  return leaveCardAvailable(s, e.source) && peaceDiscardIndex(s, e) >= 0;
}
export function heirsPlayerLocationExplored(
  s: GameState,
  u: Unit,
  discardIndex?: number,
) {
  if (
    (card(u.code).victory ?? 0) > 0 ||
    immune(u) ||
    discardIndex === undefined ||
    s.encounterDiscard[discardIndex] !== u.code
  )
    return;
  const occurrence = s.encounterDiscard
    .slice(0, discardIndex)
    .filter((code) => code === u.code).length;
  prepend(
    s,
    ...playerOrder(s)
      .filter((player) => {
        const p = seatView(s, player);
        return (
          p.hand.some((c) => c.code === "05012") && canPay(p, card("05012"))
        );
      })
      .map((player) =>
        fx("heirsPeaceResponse", {
          source: u.id,
          code: u.code,
          value: occurrence,
          player,
        }),
      ),
  );
}
export function handleHeirsPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "heirsMasterType":
      requireRule(
        ["ally", "attachment", "event"].includes(e.text ?? ""),
        "Name a playable player-card type.",
      );
      s.used.push(masterMarker(e.text!));
      return true;
    case "heirsHunterResponse": {
      const u = get(s, e.source);
      if (u?.code === "05014" && !u.blanked && s.deck.length)
        choose(s, "Hunter of Lamedon · Played from hand", [
          {
            id: "reveal",
            label: "Reveal the top card",
            code: u.code,
            effects: [fx("heirsHunterReveal")],
          },
          skip,
        ]);
      return true;
    }
    case "heirsHunterReveal": {
      const code = s.deck[0];
      if (!code) return true;
      log(s, `Hunter of Lamedon reveals ${card(code).name}.`);
      const outlands = rawTraits(card(code)).includes("Outlands");
      choose(s, "Hunter of Lamedon · Revealed card", [
        {
          id: "resolve",
          label: outlands
            ? "Add Outlands card to hand"
            : "Discard revealed card",
          code,
          effects: [fx("heirsHunterResolve", { code, flag: outlands })],
        },
      ]);
      return true;
    }
    case "heirsHunterResolve": {
      requireRule(s.deck[0] === e.code, "Resolve the same revealed top card.");
      if (e.flag) s.hand.push(takePlayerDeck(s));
      else discardPlayerDeck(s, 1);
      return true;
    }
    case "heirsSpearResponse": {
      const host = get(s, e.source),
        enemy = get(s, e.target),
        a = host?.attachments.find((a) => a.id === e.code);
      if (
        enemy &&
        !immune(enemy) &&
        a?.code === "05009" &&
        !a.blanked &&
        !a.facedown
      )
        choose(s, "Spear of the Citadel · Declared defender", [
          {
            id: "damage",
            label: "Deal 1 damage to the attacking enemy",
            code: a.code,
            effects: [{ ...e, kind: "heirsSpearDamage" }],
          },
          skip,
        ]);
      return true;
    }
    case "heirsSpearDamage": {
      const host = get(s, e.source),
        enemy = get(s, e.target),
        a = host?.attachments.find((a) => a.id === e.code);
      requireRule(
        enemy &&
          !immune(enemy) &&
          a?.code === "05009" &&
          !a.blanked &&
          !a.facedown,
        "The Spear and attacking enemy must remain available.",
      );
      damage(s, enemy.id, 1);
      return true;
    }
    case "heirsPeaceResponse":
      if (
        peaceAvailable(s, e) &&
        s.hand.some((u) => u.code === "05012") &&
        canPay(s, card("05012"))
      )
        choose(s, "A Watchful Peace · Location explored", [
          {
            id: "return",
            label: "Return explored location to encounter-deck top",
            code: "05012",
            effects: [{ ...e, kind: "heirsPeaceReturn" }],
          },
          skip,
        ]);
      return true;
    case "heirsPeaceReturn": {
      requireRule(
        peaceAvailable(s, e),
        "The same explored location must remain in the encounter discard.",
      );
      if (!spendEvent(s, "05012")) return true;
      const index = peaceDiscardIndex(s, e);
      s.encounterDeck.unshift(s.encounterDiscard.splice(index, 1)[0]);
      consumeLeaveCard(s, e.source!);
      // Preserve recorded physical ordinals when another identically printed explored card is still awaiting its response.
      for (const pending of s.queue)
        if (
          pending.kind.startsWith("heirsPeace") &&
          pending.code === e.code &&
          (pending.value ?? -1) > (e.value ?? -1)
        )
          pending.value!--;
      return true;
    }
    default:
      return false;
  }
}
