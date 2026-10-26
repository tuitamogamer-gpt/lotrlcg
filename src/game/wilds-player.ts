import { isSacked } from "./carrock";
import { beneathSandsPlayerAttackResolved } from "./beneath-sands-player";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  canPay,
  cannotReady,
  choose,
  fx,
  get,
  make,
  prepend,
  requireRule,
  restrictAttachments,
  shuffle,
  skip,
} from "./core";
import {
  damage,
  exhaustCharacter,
  progressLocation,
  readyCharacter,
  enemyAddedToStaging,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { isHero, isAlly } from "./card-types";
import { playerCardImmune } from "./card-immunity";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playTargets } from "./actions";
import {
  WILDS_PLAYER as P,
  WILDS_KING,
  WILDS_BARTER,
  WILDS_VALOUR,
  wildsPlayerAttachment,
} from "./wilds-player-support";

const active = (a: Attachment) => !a.blanked && !a.facedown;
const owned = (s: GameState, u: Unit) => ownerOf(s, u) === activeSeat(s);
const ownCharacters = (s: GameState) =>
  allCharacters(s).filter((u) => owned(s, u));
const readyAttachments = (u: Unit) =>
  u.attachments.filter(
    (a) =>
      wildsPlayerAttachment(a) &&
      !a.exhausted &&
      !/Permanent/i.test(card(a.code).text ?? ""),
  );
const pendingBarter = (id: string) => `phase:wilds-barter-paid:${id}:`;
const barred = (s: GameState, u: Unit, source: string) =>
  playerEffectImmune(s, u, source);
function asUnit(s: GameState, a: Attachment): Unit {
  return {
    ...make(s, a.code),
    id: a.id,
    owner: a.owner,
    controller: a.controller,
    exhausted: false,
  };
}
function returnAttachment(s: GameState, host: Unit, a: Attachment) {
  host.attachments = host.attachments.filter((x) => x.id !== a.id);
  forOwner(s, a.owner ?? ownerOf(s, host), () => s.hand.push(asUnit(s, a)));
}
function transferTargets(s: GameState, from: Unit, a: Attachment) {
  const before = from.attachments;
  from.attachments = before.filter((x) => x.id !== a.id);
  try {
    // Moving a card is not playing it; retain all printed attachment restrictions.
    return playTargets(
      s,
      { ...from, id: a.id, code: a.code, owner: a.owner },
      { putIntoPlay: true },
    ).filter(
      (u) => u.id !== from.id && allCharacters(s).some((c) => c.id === u.id),
    );
  } finally {
    from.attachments = before;
  }
}
function movable(s: GameState) {
  return ownCharacters(s).flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          attachmentHasTrait(a, "Item") &&
          !/Permanent/i.test(card(a.code).text ?? "") &&
          !barred(s, host, P.trader),
      )
      .flatMap((a) =>
        transferTargets(s, host, a).length ? [{ host, a }] : [],
      ),
  );
}
export function wildsPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.bow)
    return allCharacters(s).filter(
      (u) => hasTrait(u, "Dale") || hasTrait(u, "Warrior"),
    );
  if (code === P.map)
    return allCharacters(s).filter(
      (u) =>
        (hasTrait(u, "Dale") || hasTrait(u, "Scout")) &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === P.king)
    return allHeroes(s).filter(
      (u) => hasTrait(u, "Dale") || hasTrait(u, "Esgaroth"),
    );
  if (code === P.necklace) return allHeroes(s);
  if (
    code === P.traffic &&
    !ownCharacters(s).some((u) => u.attachments.some(wildsPlayerAttachment))
  )
    return [];
  if (code === P.traffic)
    return ownCharacters(s).filter(
      (u) => isHero(u) && hasTrait(u, "Dale") && !barred(s, u, code),
    );
  if (code === P.arms)
    return allCharacters(s).filter(
      (u) =>
        isAlly(u) &&
        u.exhausted &&
        !cannotReady(u, s) &&
        u.attachments.some(wildsPlayerAttachment) &&
        !barred(s, u, code),
    );
  if (code === P.barter)
    return ownCharacters(s).filter(
      (u) => readyAttachments(u).length && !barred(s, u, code),
    );
  return undefined;
}
export function wildsPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.valour)
    return "Valour of the North responds when attackers or a defender are declared against an enemy with an attachment.";
  if (
    [P.traffic, P.barter].includes(u.code as typeof P.traffic) &&
    s.phase !== "planning"
  )
    return "This is a Planning Action.";
  if (u.code === P.traffic && s.used.includes("round:wilds-traffic"))
    return "Only 1 copy of Traffic from Dale can be played each round.";
  if (
    [P.traffic, P.arms, P.barter].includes(u.code as typeof P.traffic) &&
    !wildsPlayerPlayTargets(s, u.code)!.length
  )
    return "No eligible character can be chosen.";
  return null;
}
export function wildsPlayerEventCost(s: GameState, u: Unit, target?: string) {
  if (u.code === P.traffic) s.used.push("round:wilds-traffic");
  if (u.code !== P.barter) return;
  const host = get(s, target);
  requireRule(
    host && owned(s, host) && readyAttachments(host).length,
    "Choose a character you control with a ready player attachment.",
  );
  choose(
    s,
    "Bartering · Return a ready attachment",
    readyAttachments(host!).map((a) => ({
      id: a.id,
      code: a.code,
      label: `Return ${card(a.code).name}`,
      effects: [
        fx("wildsBarterCost", { source: u.id, target: host!.id, text: a.id }),
      ],
    })),
  );
}
export function wildsPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
  physicalId?: string,
) {
  const u = get(s, target);
  if (code === P.traffic) {
    requireRule(
      !!u && wildsPlayerPlayTargets(s, code)!.some((h) => h.id === u.id),
      "Choose a Dale hero you control.",
    );
    prepend(
      s,
      fx("resource", {
        target: u!.id,
        value: ownCharacters(s).filter((c) =>
          c.attachments.some(wildsPlayerAttachment),
        ).length,
      }),
    );
    return true;
  }
  if (code === P.arms) {
    requireRule(
      !!u && wildsPlayerPlayTargets(s, code)!.some((h) => h.id === u.id),
      "Choose an exhausted ally with a player attachment.",
    );
    readyCharacter(s, u!);
    return true;
  }
  if (code === P.barter) {
    const id =
      physicalId ??
      [...(s.resolvingEvents ?? [])].reverse().find((v) => v.unit.code === code)
        ?.unit.id;
    const prefix = pendingBarter(id ?? ""),
      key = s.used.find((k) => k.startsWith(prefix));
    if (key) {
      s.used = s.used.filter((k) => k !== key);
      s.used.push(WILDS_BARTER + key.slice(prefix.length));
    }
    return true;
  }
  return false;
}
export function wildsPlayerCardPlayed(s: GameState, c: Card) {
  if (c.type_code === "attachment")
    s.used = s.used.filter((k) => !k.startsWith(WILDS_BARTER));
  if (
    c.type_code === "ally" &&
    (c.traits ?? "").split(".").some((t) => t.trim() === "Dale")
  )
    s.used = s.used.filter((k) => !k.startsWith(WILDS_KING));
}
export function wildsPlayerAbilityLabel(code: string) {
  if (code === P.trader)
    return "Exhaust Long Lake Trader · move an Item attachment";
  if (code === P.king)
    return "Exhaust King of Dale · reduce the next Dale ally's cost";
  return undefined;
}
export function wildsPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === P.king,
    );
    if (!a) return null;
    if (!active(a) || a.exhausted) return "King of Dale must be ready.";
    if (attachmentController(s, u, a) !== activeSeat(s))
      return "You must control King of Dale.";
    return s.phase !== "planning" ? "King of Dale is a Planning Action." : null;
  }
  if (u.code !== P.trader) return null;
  if (!owned(s, u) || u.blanked || u.exhausted || playerCardImmune(u))
    return "Long Lake Trader must be ready and under your control.";
  return movable(s).length
    ? null
    : "No Item attachment can move to another eligible character.";
}
export function wildsPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (attachmentId) {
    const a = u.attachments.find(
      (a) => a.id === attachmentId && a.code === P.king,
    );
    if (!a) return false;
    requireRule(
      !wildsPlayerAbilityProblem(s, u, attachmentId),
      wildsPlayerAbilityProblem(s, u, attachmentId) ?? "",
    );
    a.exhausted = true;
    s.used.push(
      WILDS_KING +
        new Set(
          u.attachments
            .filter(wildsPlayerAttachment)
            .map((a) => card(a.code).name),
        ).size,
    );
    return true;
  }
  if (u.code !== P.trader) return false;
  requireRule(
    !wildsPlayerAbilityProblem(s, u),
    wildsPlayerAbilityProblem(s, u) ?? "",
  );
  requireRule(exhaustCharacter(s, u), "Long Lake Trader cannot exhaust.");
  choose(
    s,
    "Long Lake Trader · Choose an Item attachment",
    movable(s).map(({ host, a }) => ({
      id: a.id,
      code: a.code,
      label: `Move ${card(a.code).name} from ${name(host)}`,
      effects: [fx("wildsTraderTarget", { source: a.id, target: host.id })],
    })),
  );
  return true;
}
export const useWildsPlayerAbility = wildsPlayerAbility;
export function wildsPlayerAttachmentPlayed(
  s: GameState,
  host: Unit,
  a: Attachment,
  played: boolean,
  _fromHand: boolean,
) {
  if (
    !played ||
    !hasTrait(host, "Dale") ||
    host.attachments.some((x) => x.id !== a.id)
  )
    return;
  const player = activeSeat(s);
  prepend(
    s,
    ...allHeroes(s)
      .filter(
        (h) =>
          h.code === P.brand &&
          !h.blanked &&
          !isSacked(h) &&
          ownerOf(s, h) === player,
      )
      .map((h) => fx("wildsBrandOffer", { source: h.id, player })),
  );
}
export function wildsPlayerCharactersCommitted(s: GameState, actual: Unit[]) {
  if (!allActiveLocations(s).length) return;
  prepend(
    s,
    ...actual.flatMap((host) =>
      host.attachments
        .filter((a) => a.code === P.map && active(a))
        .map((a) =>
          fx("wildsMapOffer", {
            source: a.id,
            target: host.id,
            player: attachmentController(s, host, a) ?? ownerOf(s, host),
          }),
        ),
    ),
  );
}
function valourOffers(s: GameState, enemy: Unit, characters: Unit[]) {
  if (!enemy.attachments.length) return [];
  return playerOrder(s).flatMap((player) =>
    seatView(s, player)
      .hand.filter(
        (u) => u.code === P.valour && canPay(seatView(s, player), card(u.code)),
      )
      .flatMap((event) =>
        characters
          .filter((u) => !barred(s, u, P.valour))
          .map((u) =>
            fx("wildsValourOffer", {
              source: event.id,
              target: u.id,
              text: enemy.id,
              player,
            }),
          ),
      ),
  );
}
export function wildsPlayerAttackersDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return [
    ...attackers.flatMap((host) =>
      host.attachments
        .filter(
          (a) =>
            a.code === P.bow &&
            active(a) &&
            !a.exhausted &&
            !barred(s, enemy, P.bow),
        )
        .map((a) =>
          fx("wildsBowOffer", {
            source: a.id,
            target: host.id,
            text: enemy.id,
            player: attachmentController(s, host, a) ?? ownerOf(s, host),
          }),
        ),
    ),
    ...valourOffers(s, enemy, attackers),
  ];
}
export function wildsPlayerDefenderDeclared(
  s: GameState,
  enemy: Unit,
  defender: Unit,
): Effect[] {
  return valourOffers(s, enemy, [defender]);
}
export function wildsPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const player of playerOrder(s)) {
    const view = seatView(s, player);
    view.used.splice(
      0,
      view.used.length,
      ...view.used.filter(
        (key) => !ids.some((id) => key.startsWith(WILDS_VALOUR + id + ":")),
      ),
    );
  }
}
/** Detach before framework disposal; the complete snapshot survives a save while Bard's response is pending. */
export function wildsPlayerCharacterLeaving(s: GameState, u: Unit) {
  if (!isHero(u) && !isAlly(u)) return;
  const bards = allHeroes(s).filter(
    (h) =>
      h.code === P.bard &&
      !h.blanked &&
      !isSacked(h) &&
      !seatView(s, ownerOf(s, h)).used.includes(`phase:wilds-bard:${h.id}`),
  );
  const attachments = u.attachments.filter(wildsPlayerAttachment);
  if (!bards.length || !attachments.length) return;
  u.attachments = u.attachments.filter((a) => !attachments.includes(a));
  prepend(
    s,
    fx("wildsBardOffer", {
      source: bards[0].id,
      player: ownerOf(s, bards[0]),
      text: JSON.stringify(
        attachments.map((a) => ({ ...a, owner: a.owner ?? ownerOf(s, u) })),
      ),
      ids: bards.slice(1).map((h) => h.id),
    }),
  );
}
/** Guarded (enemy or location) adds a discarded encounter; it does not reveal it. */
export function wildsPlayerSpecialAttachmentEntry(s: GameState, u: Unit) {
  if (u.code !== P.necklace) return false;
  prepend(
    s,
    fx("wildsNecklaceGuard", {
      source: u.id,
      code: u.code,
      player: activeSeat(s),
      owner: u.owner ?? activeSeat(s),
    }),
  );
  return true;
}
export function wildsPlayerGuardLeaving(s: GameState, u: Unit) {
  if (!["enemy", "ship-enemy", "location"].includes(card(u.code).type_code))
    return;
  const necklaces = u.attachments.filter(
    (a) =>
      a.code === P.necklace &&
      !s.burglarContract?.guarded.some((g) => g.attachmentId === a.id),
  );
  u.attachments = u.attachments.filter((a) => !necklaces.includes(a));
  prepend(
    s,
    ...necklaces.map((a) =>
      fx("wildsNecklaceClaim", {
        source: a.id,
        code: a.code,
        player: a.owner ?? a.controller ?? activeSeat(s),
        owner: a.owner ?? a.controller ?? activeSeat(s),
      }),
    ),
  );
}
export function handleWildsPlayerEffect(s: GameState, e: Effect): boolean {
  const target = get(s, e.target);
  switch (e.kind) {
    case "wildsAttackCleanup":
      beneathSandsPlayerAttackResolved(s, e.ids ?? []);
      wildsPlayerAttackResolved(s, e.ids ?? []);
      return true;
    case "wildsBrandOffer": {
      const h = get(s, e.source);
      if (h && !h.blanked && !isSacked(h))
        choosePlayerResponse(
          s,
          h.id,
          h.code,
          "Brand son of Bain · Draw a card?",
          [
            {
              id: "use",
              label: "Draw 1 card",
              effects: [fx("wildsBrandDraw", { source: h.id })],
            },
            skip,
          ],
        );
      return true;
    }
    case "wildsBrandDraw": {
      const h = get(s, e.source);
      if (h && !h.blanked && !isSacked(h)) prepend(s, fx("draw", { value: 1 }));
      return true;
    }
    case "wildsTraderTarget": {
      const a = target?.attachments.find((a) => a.id === e.source);
      if (a)
        choose(
          s,
          "Long Lake Trader · Choose the new character",
          transferTargets(s, target!, a).map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("wildsTraderMove", {
                source: a.id,
                target: target!.id,
                text: u.id,
              }),
            ],
          })),
        );
      return true;
    }
    case "wildsTraderMove": {
      const a = target?.attachments.find((a) => a.id === e.source),
        to = get(s, e.text);
      requireRule(
        a &&
          to &&
          owned(s, target!) &&
          attachmentHasTrait(a, "Item") &&
          transferTargets(s, target!, a).some((u) => u.id === to.id),
        "Choose another eligible character.",
      );
      target!.attachments = target!.attachments.filter((x) => x.id !== a!.id);
      to!.attachments.push(a!);
      restrictAttachments(s, to!);
      return true;
    }
    case "wildsBarterCost": {
      const a = target?.attachments.find((a) => a.id === e.text);
      requireRule(
        target &&
          a &&
          owned(s, target) &&
          readyAttachments(target).some((x) => x.id === a.id),
        "Bartering requires a ready player attachment on a character you control.",
      );
      const cost = Math.max(0, Number(card(a!.code).cost) || 0);
      returnAttachment(s, target!, a!);
      s.used.push(pendingBarter(e.source ?? "") + cost);
      return true;
    }
    case "wildsMapOffer": {
      const a = target?.attachments.find(
        (a) => a.id === e.source && a.code === P.map && active(a),
      );
      const locations = allActiveLocations(s).filter(
        (l) => !barred(s, l, P.map),
      );
      if (a && locations.length)
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Map of Rhovanion · Place 1 progress?",
          [
            ...locations.map((l) => ({
              id: l.id,
              code: l.code,
              label: `Place 1 progress on ${name(l)}`,
              effects: [fx("wildsMapProgress", { target: l.id })],
            })),
            skip,
          ],
        );
      return true;
    }
    case "wildsMapProgress":
      if (
        target &&
        allActiveLocations(s).some((l) => l.id === target.id) &&
        !barred(s, target, P.map)
      )
        progressLocation(s, target, 1);
      return true;
    case "wildsBowOffer": {
      const a = target?.attachments.find(
          (a) =>
            a.id === e.source && a.code === P.bow && active(a) && !a.exhausted,
        ),
        enemy = get(s, e.text);
      if (a && enemy && !barred(s, enemy, P.bow))
        choosePlayerResponse(s, a.id, a.code, "Bow of Yew · Deal 1 damage?", [
          {
            id: "use",
            label: "Exhaust Bow of Yew · Deal 1 damage",
            effects: [
              fx("wildsBowDamage", {
                source: a.id,
                target: target!.id,
                text: enemy.id,
              }),
            ],
          },
          skip,
        ]);
      return true;
    }
    case "wildsBowDamage": {
      const a = target?.attachments.find((a) => a.id === e.source),
        enemy = get(s, e.text);
      if (a && active(a) && !a.exhausted && enemy && !barred(s, enemy, P.bow)) {
        a.exhausted = true;
        damage(s, enemy.id, 1);
      }
      return true;
    }
    case "wildsValourOffer": {
      const event = s.hand.find(
          (u) => u.id === e.source && u.code === P.valour,
        ),
        enemy = get(s, e.text);
      if (
        event &&
        target &&
        enemy?.attachments.length &&
        !barred(s, target, P.valour) &&
        canPay(s, card(event.code))
      )
        choosePlayerResponse(
          s,
          event.id,
          event.code,
          "Valour of the North · Strengthen this character?",
          [
            {
              id: "use",
              label: `Play Valour of the North on ${name(target)}`,
              effects: [
                fx("eventPlay", {
                  source: event.id,
                  code: event.code,
                  effects: [
                    fx("wildsValourBoost", {
                      target: target.id,
                      source: event.id,
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
    case "wildsValourBoost":
      if (target && !barred(s, target, P.valour))
        s.used.push(WILDS_VALOUR + target.id + ":" + e.source);
      return true;
    case "wildsBardOffer": {
      const bard = get(s, e.source);
      if (
        (bard && isSacked(bard)) ||
        s.used.includes(`phase:wilds-bard:${e.source}`)
      ) {
        prepend(s, { ...e, kind: "wildsBardDecline" });
        return true;
      }
      choosePlayerResponse(
        s,
        e.source!,
        P.bard,
        "Bard son of Brand · Return the attachments?",
        [
          {
            id: "use",
            label: "Return each player attachment to its owner's hand",
            effects: [{ ...e, kind: "wildsBardReturn" }],
          },
          {
            id: "skip",
            label: "Decline",
            effects: [{ ...e, kind: "wildsBardDecline" }],
          },
        ],
      );
      return true;
    }
    case "wildsBardDecline": {
      const other = (e.ids ?? [])
        .map((id) => get(s, id))
        .find(
          (h) =>
            h &&
            !h.blanked &&
            !isSacked(h) &&
            !seatView(s, ownerOf(s, h)).used.includes(
              `phase:wilds-bard:${h.id}`,
            ),
        );
      if (other) {
        prepend(s, {
          ...e,
          kind: "wildsBardOffer",
          source: other.id,
          player: ownerOf(s, other),
          ids: e.ids!.filter((id) => id !== other.id),
        });
        return true;
      }
      for (const a of JSON.parse(e.text ?? "[]") as Attachment[])
        forOwner(s, a.owner ?? activeSeat(s), () => s.discard.push(a.code));
      return true;
    }
    case "wildsBardReturn": {
      const bard = get(s, e.source);
      if (bard && isSacked(bard)) {
        prepend(s, { ...e, kind: "wildsBardDecline" });
        return true;
      }
      s.used.push(`phase:wilds-bard:${e.source}`);
      for (const a of JSON.parse(e.text ?? "[]") as Attachment[])
        forOwner(s, a.owner ?? activeSeat(s), () => s.hand.push(asUnit(s, a)));
      return true;
    }
    case "wildsNecklaceGuard": {
      let reshuffled = false;
      for (let n = 0; n < 1000; n++) {
        if (!s.encounterDeck.length) {
          if (reshuffled || !s.encounterDiscard.length) break;
          s.encounterDeck.push(...s.encounterDiscard);
          s.encounterDiscard = [];
          shuffle(s, s.encounterDeck);
          reshuffled = true;
        }
        const code = s.encounterDeck.shift()!,
          c = card(code);
        if (["enemy", "ship-enemy", "location"].includes(c.type_code)) {
          const guard = make(s, code);
          guard.attachments.push({
            id: e.source!,
            code: P.necklace,
            owner: e.owner,
            controller: e.player,
            exhausted: false,
          });
          s.staging.push(guard);
          if (c.type_code !== "location") enemyAddedToStaging(s, guard);
          return true;
        }
        s.encounterDiscard.push(code);
      }
      prepend(s, { ...e, kind: "wildsNecklaceClaim" });
      return true;
    }
    case "wildsNecklaceClaim": {
      const template = allHeroes(s)[0];
      const targets = template
        ? playTargets(
            s,
            { ...template, id: e.source!, code: P.necklace, owner: e.owner },
            { putIntoPlay: true },
          )
        : [];
      if (targets.length)
        choose(
          s,
          "Necklace of Girion · Attach to a hero",
          targets.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [{ ...e, kind: "wildsNecklaceAttach", target: h.id }],
          })),
        );
      else
        forOwner(s, e.owner ?? activeSeat(s), () => s.discard.push(P.necklace));
      return true;
    }
    case "wildsNecklaceAttach":
      if (target && isHero(target) && !barred(s, target, P.necklace)) {
        target.attachments.push({
          id: e.source!,
          code: P.necklace,
          owner: e.owner,
          controller: e.owner,
          exhausted: false,
        });
        restrictAttachments(s, target);
      }
      return true;
    default:
      return false;
  }
}
