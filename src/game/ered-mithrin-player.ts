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
  make,
  pay,
  prepend,
  requireRule,
  restrictAttachments,
  shuffle,
  skip,
  spendResources,
  takePlayerDeck,
} from "./core";
import {
  destroy,
  discardCharacter,
  enemyAddedToStaging,
  exhaustCharacter,
  progressLocation,
  raiseThreat,
  readyCharacter,
  returnAlly,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  attachmentHasTrait,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { isAlly, isHero } from "./card-types";
import { playerEffectImmune } from "./player-effect-immunity";
import { isSacked } from "./carrock";
import { choosePlayerResponse } from "./player-ability-triggers";
import {
  effectCardPlayProblem,
  playCardFromHandEffect,
  playTargets,
  resolvePlayerCard,
} from "./actions";
import { removePlayedEvent } from "./event-resolution";
import { fateCannotSearch } from "./fate-numenor";
import { reduceThreat } from "./threat-reduction";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { batch4Scenario } from "./batch4-scenarios";
import {
  ERED_GUARDED,
  ERED_MITHRIN_PLAYER as P,
  eredMarks,
  eredMithrinPlayerRefresh,
  eredPlayerAttachment,
  eredSideQuests,
} from "./ered-mithrin-player-support";

type Reserves = GameState & { eredEagleReserves?: Record<number, number> };
const live = (u: Unit) => !u.blanked && !isSacked(u);
const own = (s: GameState) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === activeSeat(s));
const barred = (s: GameState, u: Unit, code: string) =>
  playerEffectImmune(s, u, code);
const readyable = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !drownedCannotReady(s) &&
  !desertCrossingCannotPlayerReady(s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !barred(s, u, code);
const aLive = (a: Attachment) => !a.blanked && !a.facedown;
const mark = (u: Unit, period = "phase") => `${period}:ered:${u.code}:${u.id}`;
const used = (s: GameState, key: string) => eredMarks(s).includes(key);
const locations = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !barred(s, u, code),
  );
const silvans = (s: GameState) =>
  own(s).filter(
    (u) => isAlly(u) && hasTrait(u, "Silvan") && !barred(s, u, P.elvenking),
  );
const eagles = (s: GameState) =>
  own(s).filter(
    (u) => isAlly(u) && hasTrait(u, "Eagle") && !barred(s, u, P.flight),
  );
const act = (
  s: GameState,
  source: string,
  code: string,
  title: string,
  options: Option[],
) => choosePlayerResponse(s, source, code, title, [...options, skip]);
function response(
  s: GameState,
  source: string,
  code: string,
  title: string,
  effects: Effect[],
  label = "Use response",
) {
  act(s, source, code, title, [{ id: "use", label, effects }]);
}
const eventOption = (
  event: Unit,
  label: string,
  effects: Effect[],
  extra: Partial<Effect> = {},
): Option => ({
  id: event.id,
  code: event.code,
  label,
  effects: [
    fx("eventPlay", { source: event.id, code: event.code, effects, ...extra }),
  ],
});
function attachUnit(s: GameState, u: Unit, host: Unit) {
  host.attachments.push({
    id: u.id,
    code: u.code,
    owner: u.owner ?? activeSeat(s),
    controller: activeSeat(s),
    exhausted: false,
  });
  restrictAttachments(s, host);
}
function legalHosts(s: GameState, u: Unit) {
  return playTargets(s, u, { putIntoPlay: true });
}
function itemPlays(s: GameState, host: Unit) {
  return s.hand.filter(
    (u) =>
      card(u.code).type_code === "attachment" &&
      (card(u.code).traits ?? "").includes("Item.") &&
      !effectCardPlayProblem(s, u, { putIntoPlay: false }) &&
      legalHosts(s, u).some((t) => t.id === host.id),
  );
}
const attachChoices = (
  s: GameState,
  u: Unit,
  kind: string,
  base: Partial<Effect> = {},
) =>
  legalHosts(s, u).map((t) => ({
    id: t.id,
    code: t.code,
    label: name(t),
    effects: [fx(kind, { ...base, source: u.id, code: u.code, target: t.id })],
  }));

export function eredMithrinPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if ([P.clearing, P.path].includes(code as typeof P.path))
    return locations(s, code).filter(
      (l) =>
        (code !== P.path || !l.progress) &&
        (code !== P.clearing || !l.attachments.some((a) => a.code === code)),
    );
  if (code === P.cloak)
    return allCharacters(s).filter(
      (u) =>
        (hasResourceIcon(u, "spirit") || hasTrait(u, "Scout")) &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === P.boots)
    return allCharacters(s).filter(
      (u) =>
        (hasResourceIcon(u, "lore") || hasTrait(u, "Ranger")) &&
        !u.attachments.some((a) => a.code === code),
    );
  if (code === P.elvenking)
    return allHeroes(s).filter((u) => hasTrait(u, "Silvan"));
  if (code === P.glamdring)
    return allCharacters(s).filter(
      (u) => isHero(u) || card(u.code).name === "Gandalf",
    );
  if ([P.arkenstone, P.orcrist].includes(code as typeof P.arkenstone))
    return allHeroes(s);
  if (code === P.ring) return allHeroes(s).filter((u) => hasTrait(u, "Dwarf"));
  if (code === P.south)
    return s.staging.filter(
      (u) =>
        card(u.code).type_code === "location" &&
        u.attachments.some(eredPlayerAttachment) &&
        !barred(s, u, code),
    );
  if (code === P.flight) return eagles(s);
  return undefined;
}
export function eredMithrinPlayerPlayProblem(s: GameState, u: Unit) {
  if ([P.rage, P.hidden, P.quicker, P.swift].includes(u.code as typeof P.rage))
    return `${name(u)} requires its printed Response window.`;
  if (u.code === P.eagle)
    return "Encounter cards enter the encounter deck through Flight of the Eagles.";
  if (u.code === P.walls && s.phase !== "planning")
    return "Man the Walls has a Planning Action.";
  if (u.code === P.walls && used(s, "round:ered-walls-played"))
    return "Man the Walls has already been played this round.";
  if (
    u.code === P.south &&
    (s.phase !== "travel" || !eredMithrinPlayerPlayTargets(s, u.code)?.length)
  )
    return "South Away! needs the travel phase and an attached staging location.";
  if (
    u.code === P.flight &&
    (!eagles(s).length || !(s as Reserves).eredEagleReserves?.[activeSeat(s)])
  )
    return "Flight of the Eagles needs an Eagle ally and a set-aside Eagle of the North.";
  if (
    u.code === P.lands &&
    !locations(s, u.code).some((l) => l.attachments.some(eredPlayerAttachment))
  )
    return "Familiar Lands needs a location with an attachment.";
  return null;
}
export function eredMithrinPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
  _eventId?: string,
) {
  if (code === P.flight) {
    if ((s as Reserves).eredEagleReserves?.[activeSeat(s)]) {
      (s as Reserves).eredEagleReserves![activeSeat(s)]--;
      s.encounterDeck.push(P.eagle);
      shuffle(s, s.encounterDeck);
      removePlayedEvent(s, code);
    }
    return true;
  }
  if (code === P.south) {
    const u = eredMithrinPlayerPlayTargets(s, code)?.find(
      (u) => u.id === target,
    );
    if (u) {
      if (s.activeLocation) s.staging.push(s.activeLocation);
      s.staging = s.staging.filter((l) => l.id !== u.id);
      s.activeLocation = u;
      for (const p of playerOrder(s))
        forOwner(s, p, () => reduceThreat(s, u.attachments.length, P.south));
    }
    return true;
  }
  if (code === P.walls) {
    s.used.push("round:ered-walls-played");
    for (const p of playerOrder(s))
      forOwner(s, p, () => s.used.push("phase:ered-walls"));
    return true;
  }
  if (code === P.lands) {
    s.used.push("phase:ered-lands");
    return true;
  }
  return [P.rage, P.hidden, P.quicker, P.swift].includes(code as typeof P.rage);
}
export function eredMithrinPlayerEventCost(
  s: GameState,
  u: Unit,
  target?: string,
) {
  if (u.code === P.flight) {
    const eagle = eagles(s).find((u) => u.id === target);
    requireRule(
      eagle,
      "Return an Eagle ally you control to pay Flight of the Eagles.",
    );
    returnAlly(s, eagle!);
  }
}
export function eredMithrinPlayerAbilityLabel(code: string) {
  return (
    (
      {
        [P.skin]: "Beorning Skin-changer · Replace with a Beorning",
        [P.wiglaf]: "Wiglaf · Exhaust an attachment to ready",
        [P.stallion]: "Wild Stallion · Attach to an ally",
        [P.thranduil]: "Thranduil · Play a Silvan ally",
        [P.elvenking]: "The Elvenking · Return a Silvan ally",
        [P.bear]: "Giant Bear · Ready and return at phase end",
        [P.dain]: "Dáin Ironfoot · Discard to defend",
        [P.soldier]: "Soldier of Erebor · Discard 3 to ready",
        [P.arkenstone]: "The Arkenstone · Transfer to another player",
        [P.cloak]: "Grey Cloak · Avoid an engagement check",
        [P.ring]: "Ring of Thrór · Discard to ready",
      } as Record<string, string>
    )[code] ?? null
  );
}
export function eredMithrinPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  id?: string,
) {
  const a = id ? u.attachments.find((a) => a.id === id && aLive(a)) : undefined,
    code = a?.code ?? u.code;
  if (!eredMithrinPlayerAbilityLabel(code)) return null;
  if (id && (!a || attachmentController(s, u, a) !== activeSeat(s)))
    return "Only this attachment's controller can use it.";
  if (!id && (ownerOf(s, u) !== activeSeat(s) || !live(u)))
    return "Only the character's controller can use its active text.";
  if (code === P.skin) {
    if (!["defense", "attack"].includes(s.phase))
      return "Beorning Skin-changer has a Combat Action.";
    if (
      ![...s.hand.map((u) => u.code), ...s.discard].some(
        (c) =>
          card(c).type_code === "ally" &&
          (card(c).traits ?? "").includes("Beorning.") &&
          Number(card(c).cost) >= 3,
      )
    )
      return "No eligible Beorning in your hand or discard pile.";
  }
  if (
    code === P.wiglaf &&
    (!readyable(s, u, code) ||
      used(s, mark(u)) ||
      !u.attachments.some((a) => aLive(a) && !a.exhausted))
  )
    return "Wiglaf needs a ready attachment and an unused action this phase.";
  if (
    code === P.stallion &&
    (s.phase !== "planning" ||
      !own(s).some(
        (t) =>
          t.id !== u.id &&
          isAlly(t) &&
          !t.attachments.some((a) => a.code === P.stallion) &&
          !barred(s, t, code),
      ))
  )
    return "Wild Stallion needs another ally you control in the planning phase.";
  if (
    code === P.thranduil &&
    (!["defense", "attack"].includes(s.phase) ||
      used(s, mark(u, "round")) ||
      !s.hand.some(
        (h) => card(h.code).type_code === "ally" && hasTrait(h, "Silvan"),
      ))
  )
    return "Thranduil needs a Silvan ally in hand and an unused Combat Action.";
  if (
    code === P.elvenking &&
    (a!.exhausted || !silvans(s).length || !readyable(s, u, code))
  )
    return "The Elvenking needs a Silvan ally to return and an exhausted hero that can ready.";
  if (code === P.bear && (used(s, mark(u)) || !readyable(s, u, code)))
    return "Giant Bear must be exhausted and unused this phase.";
  if (
    code === P.dain &&
    s.combat?.defenderId !== u.id &&
    !s.combat?.defenderIds?.includes(u.id)
  )
    return "Dáin Ironfoot must be defending.";
  if (
    code === P.dain &&
    (!s.deck.length || s.used.filter((k) => k === mark(u)).length >= 3)
  )
    return "Dáin needs a card to discard and fewer than three uses this phase.";
  if (
    code === P.soldier &&
    (s.deck.length < 3 || used(s, mark(u, "round")) || !readyable(s, u, code))
  )
    return "Soldier of Erebor needs 3 cards, and an unused ready action this round.";
  if (
    code === P.arkenstone &&
    (used(s, `round:ered-arkenstone:${a!.id}`) ||
      !allHeroes(s).some((h) => ownerOf(s, h) !== ownerOf(s, u)))
  )
    return "The Arkenstone needs another player's hero and an unused action this round.";
  if (
    code === P.cloak &&
    (s.phase !== "encounter" ||
      u.exhausted ||
      !s.staging.some(
        (e) =>
          ["enemy", "ship-enemy"].includes(card(e.code).type_code) &&
          !card(e.code).is_unique &&
          !barred(s, e, code),
      ))
  )
    return "Grey Cloak needs a ready character and a non-unique staging enemy in the encounter phase.";
  if (
    code === P.ring &&
    (a!.exhausted || !s.deck.length || !readyable(s, u, code))
  )
    return "Ring of Thrór needs a ready Ring, a deck card, and an exhausted hero that can ready.";
  return null;
}
export function useEredMithrinPlayerAbility(
  s: GameState,
  u: Unit,
  id?: string,
) {
  const a = id ? u.attachments.find((a) => a.id === id) : undefined,
    code = a?.code ?? u.code;
  if (!eredMithrinPlayerAbilityLabel(code)) return false;
  const problem = eredMithrinPlayerAbilityProblem(s, u, id);
  requireRule(!problem, problem ?? "");
  if (code === P.skin) {
    choose(s, "Beorning Skin-changer · Choose a Beorning", [
      ...s.hand
        .filter(
          (h) =>
            card(h.code).type_code === "ally" &&
            hasTrait(h, "Beorning") &&
            Number(card(h.code).cost) >= 3,
        )
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: `Hand · ${name(h)}`,
          effects: [fx("eredPlayerSkin", { source: u.id, target: h.id })],
        })),
      ...s.discard.flatMap((c, i) =>
        card(c).type_code === "ally" &&
        (card(c).traits ?? "").includes("Beorning.") &&
        Number(card(c).cost) >= 3
          ? [
              {
                id: `discard-${i}`,
                code: c,
                label: `Discard · ${card(c).name}`,
                effects: [fx("eredPlayerSkin", { source: u.id, value: i })],
              },
            ]
          : [],
      ),
    ]);
  }
  if (code === P.wiglaf)
    choose(
      s,
      "Wiglaf · Choose an attachment to exhaust",
      u.attachments
        .filter((a) => aLive(a) && !a.exhausted)
        .map((a) => ({
          id: a.id,
          code: a.code,
          label: card(a.code).name,
          effects: [
            fx("eredPlayerWiglafReady", { source: u.id, target: a.id }),
          ],
        })),
    );
  if (code === P.stallion)
    choose(
      s,
      "Wild Stallion · Choose an ally",
      own(s)
        .filter(
          (t) =>
            t.id !== u.id &&
            isAlly(t) &&
            !t.attachments.some((a) => a.code === P.stallion) &&
            !barred(s, t, code),
        )
        .map((t) => ({
          id: t.id,
          code: t.code,
          label: name(t),
          effects: [fx("eredPlayerStallion", { source: u.id, target: t.id })],
        })),
    );
  if (code === P.thranduil)
    choose(
      s,
      "Thranduil · Choose a Silvan ally",
      s.hand
        .filter(
          (h) => card(h.code).type_code === "ally" && hasTrait(h, "Silvan"),
        )
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("eredPlayerThranduil", { source: u.id, target: h.id })],
        })),
    );
  if (code === P.elvenking)
    choose(
      s,
      "The Elvenking · Return a Silvan ally",
      silvans(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: name(h),
        effects: [
          fx("eredPlayerElvenking", {
            source: a!.id,
            target: u.id,
            text: h.id,
          }),
        ],
      })),
    );
  if (code === P.bear) {
    s.used.push(mark(u), `phase:ered-bear-return:${u.id}`);
    readyCharacter(s, u);
  }
  if (code === P.dain) {
    const c = takePlayerDeck(s);
    s.discard.push(c.code);
    s.used.push(mark(u), `attack:ered-dain:${u.id}:${s.used.length}`);
  }
  if (code === P.soldier) {
    for (let n = 0; n < 3; n++) s.discard.push(takePlayerDeck(s).code);
    s.used.push(mark(u, "round"));
    readyCharacter(s, u);
  }
  if (code === P.arkenstone)
    choose(
      s,
      "The Arkenstone · Choose another player's hero",
      allHeroes(s)
        .filter((h) => ownerOf(s, h) !== ownerOf(s, u) && !barred(s, h, code))
        .map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("eredPlayerArkenstone", {
              source: a!.id,
              target: u.id,
              text: h.id,
            }),
          ],
        })),
    );
  if (code === P.cloak)
    choose(
      s,
      "Grey Cloak · Choose an enemy",
      s.staging
        .filter(
          (e) =>
            ["enemy", "ship-enemy"].includes(card(e.code).type_code) &&
            !card(e.code).is_unique &&
            !barred(s, e, code),
        )
        .map((e) => ({
          id: e.id,
          code: e.code,
          label: name(e),
          effects: [
            fx("eredPlayerCloak", { source: a!.id, target: u.id, text: e.id }),
          ],
        })),
    );
  if (code === P.ring) {
    a!.exhausted = true;
    const top = takePlayerDeck(s);
    s.discard.push(top.code);
    readyCharacter(s, u);
    if (card(top.code).type_code === "attachment")
      prepend(
        s,
        fx("eredPlayerRingAttachment", {
          source: top.id,
          code: top.code,
          value: s.discard.length - 1,
        }),
      );
  }
  return true;
}

export function eredMithrinPlayerSpecialAttachmentEntry(s: GameState, u: Unit) {
  if (ERED_GUARDED.includes(u.code)) {
    prepend(
      s,
      fx("eredPlayerGuard", {
        source: u.id,
        code: u.code,
        owner: u.owner ?? activeSeat(s),
        player: activeSeat(s),
      }),
    );
    return true;
  }
  if (u.code === P.outmatched) {
    u.owner ??= activeSeat(s);
    u.controller = activeSeat(s);
    s.staging.push(u);
    return true;
  }
  return false;
}
export function eredMithrinPlayerGuardLeaving(s: GameState, u: Unit) {
  if (!["enemy", "ship-enemy", "location"].includes(card(u.code).type_code))
    return;
  const guards = u.attachments.filter((a) => ERED_GUARDED.includes(a.code));
  u.attachments = u.attachments.filter((a) => !guards.includes(a));
  prepend(
    s,
    ...guards.map((a) =>
      fx("eredPlayerClaim", {
        source: a.id,
        code: a.code,
        player: a.controller ?? a.owner ?? activeSeat(s),
        owner: a.owner ?? activeSeat(s),
      }),
    ),
  );
}
export function eredMithrinPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played = false,
) {
  if (!live(u)) return;
  if (u.code === P.fisherman)
    prepend(
      s,
      fx("eredPlayerFishermanOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === P.wiglaf && played)
    prepend(
      s,
      fx("eredPlayerWiglafOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === P.meneldor)
    prepend(
      s,
      fx("eredPlayerMeneldorOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === P.galion)
    prepend(
      s,
      fx("eredPlayerGalionOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (played && s.used.includes("phase:ered-walls")) {
    s.used = s.used.filter((k) => k !== "phase:ered-walls");
    s.used.push(`round:ered-walls:${u.id}`);
  }
  eredMithrinPlayerRefresh(s);
}
export function eredMithrinPlayerCharacterLeaving(s: GameState, u: Unit) {
  if (u.code === P.meneldor && live(u))
    prepend(
      s,
      fx("eredPlayerMeneldorOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function eredMithrinPlayerLocationExplored(
  s: GameState,
  u: Unit,
  wasActive = true,
  attachments: Attachment[] = u.attachments,
) {
  for (const h of allHeroes(s).filter(
    (h) => wasActive && h.code === P.haldan && live(h),
  ))
    if (attachments.length)
      prepend(
        s,
        fx("eredPlayerHaldanOffer", {
          source: h.id,
          value: attachments.length,
          player: ownerOf(s, h),
        }),
      );
  for (const a of attachments.filter((a) => a.code === P.clearing && aLive(a)))
    prepend(
      s,
      fx("eredPlayerClearingOffer", { source: a.id, player: firstPlayer(s) }),
    );
}
export function eredMithrinPlayerLocationRevealed(s: GameState, _u: Unit) {
  for (const h of allCharacters(s))
    for (const a of h.attachments.filter(
      (a) => a.code === P.boots && aLive(a) && !a.exhausted,
    ))
      if (readyable(s, h, a.code))
        prepend(
          s,
          fx("eredPlayerBootsOffer", {
            source: a.id,
            target: h.id,
            player: attachmentController(s, h, a) ?? ownerOf(s, h),
          }),
        );
}
function rageOffers(s: GameState, enemy: Unit, characters: Unit[]) {
  if (
    !characters.some((u) => hasTrait(u, "Beorning")) ||
    barred(s, enemy, P.rage)
  )
    return [];
  return playerOrder(s).flatMap((player) =>
    seatView(s, player)
      .hand.filter(
        (u) => u.code === P.rage && canPay(seatView(s, player), card(u.code)),
      )
      .map((event) =>
        fx("eredPlayerRageOffer", {
          source: event.id,
          target: enemy.id,
          player,
        }),
      ),
  );
}
export function eredMithrinPlayerAttackersDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
): Effect[] {
  for (const u of attackers) {
    const view = seatView(s, ownerOf(s, u)),
      key = `phase:ered-swift-next:${u.id}`;
    if (view.used.includes(key)) {
      view.used = view.used.filter((k) => k !== key);
      view.used.push(`attack:ered-swift:${u.id}:${s.used.length}`);
    }
  }
  return rageOffers(s, enemy, attackers);
}
export function eredMithrinPlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return rageOffers(s, enemy, defenders);
}
export function eredMithrinPlayerEnemyAttackResolved(
  s: GameState,
  enemy: Unit,
  defenderIds: string[],
) {
  for (const id of defenderIds) {
    const d = get(s, id);
    if (!d) continue;
    if (d.code === P.grimbeorn && live(d) && d.resources > 0)
      prepend(
        s,
        fx("eredPlayerGrimbeornOffer", {
          source: d.id,
          target: enemy.id,
          player: ownerOf(s, d),
        }),
      );
    for (const a of enemy.attachments.filter(
      (a) => a.code === P.outmatched && aLive(a),
    ))
      if (readyable(s, d, a.code))
        prepend(
          s,
          fx("eredPlayerOutmatchedOffer", {
            source: a.id,
            target: d.id,
            player: attachmentController(s, enemy, a) ?? ownerOf(s, enemy),
          }),
        );
  }
  for (const p of playerOrder(s))
    forOwner(
      s,
      p,
      () =>
        (s.used = s.used.filter(
          (k) =>
            !defenderIds.some((id) => k.startsWith(`attack:ered-dain:${id}:`)),
        )),
    );
}
export function eredMithrinPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  for (const id of ids) {
    const u = get(s, id);
    if (!u) continue;
    for (const a of u.attachments.filter(
      (a) =>
        [P.glamdring, P.orcrist].includes(a.code as typeof P.glamdring) &&
        aLive(a),
    ))
      prepend(
        s,
        fx("eredPlayerWeaponOffer", {
          source: a.id,
          target: u.id,
          code: a.code,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
    const player = ownerOf(s, u);
    for (const event of seatView(s, player).hand.filter(
      (e) => e.code === P.swift && canPay(seatView(s, player), card(e.code)),
    ))
      if (
        u.attachments.some(
          (a) => aLive(a) && !a.exhausted && attachmentHasTrait(a, "Weapon"),
        ) &&
        readyable(s, u, P.swift)
      )
        prepend(
          s,
          fx("eredPlayerSwiftOffer", {
            source: event.id,
            target: u.id,
            player,
          }),
        );
  }
}
export function eredMithrinPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const p of playerOrder(s))
    forOwner(
      s,
      p,
      () =>
        (s.used = s.used.filter(
          (k) => !ids.some((id) => k.startsWith(`attack:ered-swift:${id}:`)),
        )),
    );
}
export function eredMithrinPlayerQuestStart(s: GameState) {
  for (const player of playerOrder(s))
    for (const u of seatView(s, player).hand.filter(
      (u) => u.code === P.hidden && canPay(seatView(s, player), card(u.code)),
    ))
      if (
        s.encounterDeck
          .slice(0, 5)
          .some((c) => card(c).type_code === "location")
      )
        prepend(s, fx("eredPlayerHiddenOffer", { source: u.id, player }));
}
export function eredMithrinPlayerCombatStart(s: GameState) {
  if (eredSideQuests(s).length)
    for (const u of allCharacters(s).filter(
      (u) => u.code === P.thalion && live(u),
    ))
      if (readyable(s, u, P.thalion)) readyCharacter(s, u, false);
  eredMithrinPlayerRefresh(s);
}
export function eredMithrinPlayerPhaseEnd(s: GameState) {
  for (const u of allCharacters(s))
    if (used(s, `phase:ered-bear-return:${u.id}`)) returnAlly(s, u, true);
}
export function eredMithrinPlayerCardPlayed(
  _s: GameState,
  _c: Card,
  _u?: Unit,
) {}
export function eredMithrinPlayerEnemyEngaged(
  s: GameState,
  u: Unit,
  player: number,
) {
  const trap = s.staging.find(
    (t) => t.code === P.outmatched && ownerOf(s, t) === player,
  );
  if (trap && !barred(s, u, trap.code)) {
    s.staging = s.staging.filter((t) => t !== trap);
    u.attachments.push({
      id: trap.id,
      code: trap.code,
      owner: trap.owner ?? player,
      controller: player,
      exhausted: false,
    });
  }
}
export function eredMithrinPlayerSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const reserves = ((s as Reserves).eredEagleReserves ??= {});
      reserves[player] ??= 0;
      s.deck = s.deck.filter((c) => c !== P.eagle);
    });
}
export function eredMithrinPlayerEagleRevealed(s: GameState, u: Unit) {
  if (u.code !== P.eagle) return false;
  s.staging = s.staging.filter((t) => t.id !== u.id);
  prepend(
    s,
    fx("eredPlayerEagleController", {
      source: u.id,
      code: u.code,
      owner: u.owner,
      player: firstPlayer(s),
    }),
  );
  return true;
}
export function eredMithrinPlayerShadowOptions(
  s: GameState,
  code: string,
  hasShadow: boolean,
): Option[] {
  if (!hasShadow) return [];
  return playerOrder(s).flatMap((player) => {
    const p = seatView(s, player);
    if (
      ![...p.heroes, ...p.allies].some(
        (u) => isAlly(u) && hasTrait(u, "Silvan") && !barred(s, u, P.quicker),
      )
    )
      return [];
    return p.hand
      .filter((u) => u.code === P.quicker && canPay(p, card(u.code)))
      .map((u) =>
        eventOption(u, "Play Quicker Than Sight · Return a Silvan ally", [], {
          player,
          costEffects: [fx("eredPlayerQuickerCost", { player })],
          cancelledEffects: [
            fx("shadowEffect", {
              code,
              player: s.combat?.attackPlayer ?? activeSeat(s),
            }),
          ],
        }),
      );
  });
}

export function handleEredMithrinPlayerEffect(
  s: GameState,
  e: Effect,
): boolean {
  const u = get(s, e.source),
    t = get(s, e.target);
  switch (e.kind) {
    case "eredPlayerGuard": {
      let shuffled = false;
      for (let n = 0; n < 1000; n++) {
        if (!s.encounterDeck.length) {
          if (shuffled || !s.encounterDiscard.length) break;
          s.encounterDeck.push(...s.encounterDiscard);
          s.encounterDiscard = [];
          shuffle(s, s.encounterDeck);
          shuffled = true;
        }
        const code = s.encounterDeck.shift()!;
        if (
          ["enemy", "ship-enemy", "location"].includes(card(code).type_code)
        ) {
          const guard = make(s, code);
          guard.attachments.push({
            id: e.source!,
            code: e.code!,
            owner: e.owner,
            controller: e.player,
            exhausted: false,
          });
          s.staging.push(guard);
          if (card(code).type_code !== "location")
            enemyAddedToStaging(s, guard);
          return true;
        }
        s.encounterDiscard.push(code);
      }
      prepend(s, { ...e, kind: "eredPlayerClaim" });
      return true;
    }
    case "eredPlayerClaim": {
      const template = make(s, e.code!);
      template.id = e.source!;
      template.owner = e.owner;
      const opts = attachChoices(s, template, "eredPlayerGuardAttach", {
        owner: e.owner,
      });
      if (opts.length)
        choose(s, `${card(e.code!).name} · Choose an eligible character`, opts);
      else forOwner(s, e.owner ?? activeSeat(s), () => s.discard.push(e.code!));
      return true;
    }
    case "eredPlayerGuardAttach":
      if (t) {
        attachUnit(
          s,
          { ...make(s, e.code!), id: e.source!, owner: e.owner },
          t,
        );
      }
      return true;
    case "eredPlayerSkin": {
      requireRule(u?.code === P.skin, "The Skin-changer must remain in play.");
      let ally: Unit;
      if (e.target) {
        ally = s.hand.find((h) => h.id === e.target)!;
        requireRule(ally, "The chosen Beorning must remain in hand.");
        s.hand = s.hand.filter((h) => h.id !== ally.id);
      } else ally = takePlayerDiscard(s, e.value!);
      discardCharacter(s, u!);
      resolvePlayerCard(s, ally, undefined, 0, false, !!e.target);
      return true;
    }
    case "eredPlayerWiglafReady": {
      const a = u?.attachments.find((a) => a.id === e.target);
      requireRule(
        u && a && !a.exhausted,
        "A ready attachment must pay Wiglaf's cost.",
      );
      a!.exhausted = true;
      s.used.push(mark(u!));
      readyCharacter(s, u!);
      return true;
    }
    case "eredPlayerStallion":
      if (u && t) {
        requireRule(
          u.code === P.stallion && isAlly(t) && ownerOf(s, t) === activeSeat(s),
          "Choose an ally you control.",
        );
        s.allies = s.allies.filter((a) => a.id !== u.id);
        attachUnit(s, u, t);
      }
      return true;
    case "eredPlayerThranduil": {
      requireRule(
        u && live(u) && !used(s, mark(u, "round")),
        "Thranduil has already been used.",
      );
      const ally = s.hand.find((h) => h.id === e.target)!;
      requireRule(
        ally && hasTrait(ally, "Silvan"),
        "Choose a Silvan ally in hand.",
      );
      s.used.push("ered-thranduil-paying");
      try {
        pay(s, card(ally.code));
      } finally {
        s.used = s.used.filter((k) => k !== "ered-thranduil-paying");
      }
      s.used.push(mark(u!, "round"));
      s.hand = s.hand.filter((h) => h.id !== ally.id);
      resolvePlayerCard(
        s,
        ally,
        undefined,
        Number(card(ally.code).cost) || 0,
        true,
        true,
      );
      return true;
    }
    case "eredPlayerElvenking": {
      const a = t?.attachments.find((a) => a.id === e.source),
        ally = get(s, e.text);
      requireRule(
        a && !a.exhausted && ally && silvans(s).includes(ally),
        "The Elvenking needs a ready attachment and a Silvan ally.",
      );
      a!.exhausted = true;
      returnAlly(s, ally!);
      readyCharacter(s, t!);
      return true;
    }
    case "eredPlayerArkenstone": {
      const a = t?.attachments.find((a) => a.id === e.source),
        to = get(s, e.text);
      requireRule(
        a && to && ownerOf(s, t!) !== ownerOf(s, to),
        "Choose another player's hero.",
      );
      s.used.push(`round:ered-arkenstone:${a!.id}`);
      reduceThreat(s, 2, { id: a!.id, code: P.arkenstone, owner: a!.owner });
      t!.attachments = t!.attachments.filter((x) => x !== a);
      a!.controller = ownerOf(s, to!);
      to!.attachments.push(a!);
      forOwner(s, ownerOf(s, to!), () => raiseThreat(s, 2, "player-card"));
      return true;
    }
    case "eredPlayerCloak": {
      const a = t?.attachments.find((a) => a.id === e.source);
      if (a && get(s, e.text)) {
        requireRule(
          exhaustCharacter(s, t!),
          "Grey Cloak exhausts attached character as its cost.",
        );
        t!.attachments = t!.attachments.filter((x) => x !== a);
        forOwner(s, a.owner ?? activeSeat(s), () => s.discard.push(a.code));
        s.used.push(`phase:ered-cloak:${e.text}`);
      }
      return true;
    }
    case "eredPlayerRingAttachment": {
      const i = e.value!,
        c = s.discard[i];
      if (c !== e.code) return true;
      const cardUnit = { ...make(s, c), id: e.source! };
      if (effectCardPlayProblem(s, cardUnit, { putIntoPlay: true }))
        return true;
      const opts = attachChoices(s, cardUnit, "eredPlayerRingPut", {
        value: i,
      });
      if (opts.length)
        choose(
          s,
          "Ring of Thrór · Put the discarded attachment into play",
          opts,
        );
      return true;
    }
    case "eredPlayerRingPut":
      if (t && s.discard[e.value!] === e.code) {
        const top = takePlayerDiscard(s, e.value!);
        top.id = e.source!;
        resolvePlayerCard(s, top, t.id, 0, false, false);
      }
      return true;
    case "eredPlayerFishermanOffer":
      if (u && live(u) && !fateCannotSearch(s))
        response(s, u.id, u.code, "Long Lake Fisherman · Name a number", [
          fx("eredPlayerFishermanNumber", { source: u.id }),
        ]);
      return true;
    case "eredPlayerFishermanNumber": {
      const values = [
        ...new Set([
          0,
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          ...s.deck
            .slice(0, 5)
            .map((c) => Number(card(c).cost))
            .filter(Number.isFinite),
        ]),
      ];
      choose(
        s,
        "Long Lake Fisherman · Name a printed cost",
        values.map((n) => ({
          id: String(n),
          label: String(n),
          effects: [fx("eredPlayerFishermanFind", { value: n })],
        })),
      );
      return true;
    }
    case "eredPlayerFishermanFind": {
      if (fateCannotSearch(s)) return true;
      const opts = s.deck.slice(0, 5).flatMap((c, i) =>
        Number(card(c).cost) === e.value
          ? [
              {
                id: String(i),
                code: c,
                label: card(c).name,
                effects: [fx("eredPlayerFishermanTake", { value: i, code: c })],
              },
            ]
          : [],
      );
      if (opts.length)
        choose(s, "Long Lake Fisherman · Choose a matching card", [
          ...opts,
          { ...skip, effects: [fx("eredPlayerShuffle")] },
        ]);
      else shuffle(s, s.deck);
      return true;
    }
    case "eredPlayerFishermanTake":
      if (s.deck[e.value!] === e.code) s.hand.push(takePlayerDeck(s, e.value!));
      shuffle(s, s.deck);
      return true;
    case "eredPlayerShuffle":
      shuffle(s, s.deck);
      return true;
    case "eredPlayerWiglafOffer":
      if (u && live(u) && itemPlays(s, u).length)
        act(
          s,
          u.id,
          u.code,
          "Wiglaf · Play an Item on him for no cost",
          itemPlays(s, u).map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("eredPlayerWiglafPlay", { source: h.id, target: u.id }),
            ],
          })),
        );
      return true;
    case "eredPlayerWiglafPlay":
      if (t && s.hand.some((h) => h.id === e.source))
        playCardFromHandEffect(s, e.source!, t.id);
      return true;
    case "eredPlayerMeneldorOffer": {
      const ls = locations(s, P.meneldor);
      if (ls.length)
        act(
          s,
          e.source!,
          P.meneldor,
          "Meneldor · Place 2 progress",
          ls.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("eredPlayerMeneldorProgress", { target: l.id })],
          })),
        );
      return true;
    }
    case "eredPlayerMeneldorProgress":
      if (t && !barred(s, t, P.meneldor)) progressLocation(s, t, 2);
      return true;
    case "eredPlayerGalionOffer":
      if (u && live(u))
        response(s, u.id, u.code, "Galion · Gain 1 willpower this round", [
          fx("eredPlayerGalionBoost", { source: u.id }),
        ]);
      return true;
    case "eredPlayerGalionBoost":
      if (u) s.used.push(`round:ered-galion:${u.id}`);
      return true;
    case "eredPlayerHaldanOffer":
      if (u && live(u))
        response(s, u.id, u.code, `Haldan · Draw ${e.value} cards`, [
          fx("draw", { value: e.value }),
        ]);
      return true;
    case "eredPlayerClearingOffer":
      response(
        s,
        e.source!,
        P.clearing,
        "Woodmen's Clearing · First player reduces threat by 3",
        [fx("threat", { value: -3, code: P.clearing })],
      );
      return true;
    case "eredPlayerBootsOffer": {
      const a = t?.attachments.find((a) => a.id === e.source);
      if (a && aLive(a) && !a.exhausted && readyable(s, t!, a.code))
        response(s, a.id, a.code, "Leather Boots · Ready attached character", [
          fx("eredPlayerBootsReady", { source: a.id, target: t!.id }),
        ]);
      return true;
    }
    case "eredPlayerBootsReady": {
      const a = t?.attachments.find((a) => a.id === e.source);
      if (a && !a.exhausted) {
        a.exhausted = true;
        readyCharacter(s, t!);
      }
      return true;
    }
    case "eredPlayerRageOffer": {
      const event = s.hand.find((h) => h.id === e.source);
      if (event && t && !barred(s, t, P.rage) && canPay(s, card(event.code)))
        act(s, event.id, event.code, "Beorn's Rage · Weaken the enemy", [
          eventOption(event, "Play Beorn's Rage", [
            fx("eredPlayerRage", { source: event.id, target: t.id }),
          ]),
        ]);
      return true;
    }
    case "eredPlayerRage":
      if (t && !barred(s, t, P.rage))
        s.used.push(`phase:ered-rage:${t.id}:${e.source}`);
      return true;
    case "eredPlayerGrimbeornOffer":
      if (u && t && live(u) && u.resources > 0)
        response(
          s,
          u.id,
          u.code,
          "Grimbeorn the Old · Counterattack",
          [fx("eredPlayerGrimbeorn", { source: u.id, target: t.id })],
          "Spend 1 resource · Attack with -2 enemy defense",
        );
      return true;
    case "eredPlayerGrimbeorn":
      if (u && t && u.resources > 0) {
        spendResources(s, u, 1);
        s.used.push(`attack:ered-grim:${t.id}:${u.id}`);
        prepend(
          s,
          ...eredMithrinPlayerAttackersDeclared(s, t, [u]),
          fx("resolvePlayerAttack", { target: t.id, ids: [u.id] }),
          fx("eredPlayerGrimCleanup", { source: u.id, target: t.id }),
        );
      }
      return true;
    case "eredPlayerGrimCleanup":
      s.used = s.used.filter(
        (k) => k !== `attack:ered-grim:${e.target}:${e.source}`,
      );
      return true;
    case "eredPlayerOutmatchedOffer":
      if (t && readyable(s, t, P.outmatched))
        response(
          s,
          e.source!,
          P.outmatched,
          "Outmatched · Ready the defender",
          [fx("ready", { target: t.id })],
        );
      return true;
    case "eredPlayerWeaponOffer": {
      const a = t?.attachments.find((a) => a.id === e.source && aLive(a));
      if (a && (a.code !== P.orcrist || canGainResources(s, t!)))
        response(
          s,
          a.id,
          a.code,
          `${card(a.code).name} · ${a.code === P.glamdring ? "Draw 1 card" : "Gain 1 resource"}`,
          [
            fx("eredPlayerWeaponGain", {
              source: a.id,
              target: t!.id,
              code: a.code,
            }),
          ],
        );
      return true;
    }
    case "eredPlayerWeaponGain":
      if (t) {
        if (e.code === P.glamdring) draw(s, 1);
        else if (canGainResources(s, t)) t.resources++;
      }
      return true;
    case "eredPlayerSwiftOffer": {
      const event = s.hand.find((h) => h.id === e.source);
      if (event && t && readyable(s, t, P.swift))
        act(s, event.id, event.code, "Swift and Strong · Ready the attacker", [
          eventOption(
            event,
            "Play Swift and Strong",
            [fx("eredPlayerSwiftGain", { target: t.id })],
            { costEffects: [fx("eredPlayerSwiftWeapon", { target: t.id })] },
          ),
        ]);
      return true;
    }
    case "eredPlayerSwiftWeapon":
      if (t)
        choose(
          s,
          "Swift and Strong · Exhaust a Weapon",
          t.attachments
            .filter(
              (a) =>
                aLive(a) && !a.exhausted && attachmentHasTrait(a, "Weapon"),
            )
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: card(a.code).name,
              effects: [
                fx("eredPlayerSwiftReady", { source: a.id, target: t.id }),
              ],
            })),
        );
      return true;
    case "eredPlayerSwiftReady": {
      const a = t?.attachments.find((a) => a.id === e.source);
      if (a && !a.exhausted) {
        a.exhausted = true;
      }
      return true;
    }
    case "eredPlayerSwiftGain":
      if (t) {
        readyCharacter(s, t);
        s.used.push(`phase:ered-swift-next:${t.id}`);
      }
      return true;
    case "eredPlayerHiddenOffer": {
      const event = s.hand.find((h) => h.id === e.source);
      if (event && canPay(s, card(event.code)))
        act(
          s,
          event.id,
          event.code,
          "The Hidden Way · Search the top 5 encounter cards",
          [
            eventOption(event, "Play The Hidden Way", [
              fx("eredPlayerHiddenSearch"),
            ]),
          ],
        );
      return true;
    }
    case "eredPlayerHiddenSearch": {
      const opts = s.encounterDeck.slice(0, 5).flatMap((c, i) =>
        card(c).type_code === "location"
          ? [
              {
                id: String(i),
                code: c,
                label: card(c).name,
                effects: [fx("eredPlayerHiddenActive", { code: c, value: i })],
              },
            ]
          : [],
      );
      if (opts.length)
        choose(s, "The Hidden Way · Make a location active", opts);
      else shuffle(s, s.encounterDeck);
      return true;
    }
    case "eredPlayerHiddenActive":
      if (s.encounterDeck[e.value!] === e.code) {
        s.encounterDeck.splice(e.value!, 1);
        if (s.activeLocation) s.staging.push(s.activeLocation);
        s.activeLocation = make(s, e.code!);
        s.used.push("phase:ered-hidden");
        shuffle(s, s.encounterDeck);
      }
      return true;
    case "eredPlayerEagleController":
      choose(
        s,
        "Eagle of the North · First player chooses its controller",
        playerOrder(s).map((player) => ({
          id: String(player),
          label: `Player ${player + 1}`,
          effects: [
            fx("eredPlayerEagleEnter", {
              source: e.source,
              owner: e.owner,
              player,
            }),
          ],
        })),
      );
      return true;
    case "eredPlayerEagleEnter": {
      const eagle = {
        ...make(s, P.eagle),
        id: e.source!,
        owner: e.owner ?? e.player,
        controller: e.player,
      };
      resolvePlayerCard(s, eagle, undefined, 0, false, false);
      const enemies = s.staging.filter(
        (u) =>
          ["enemy", "ship-enemy"].includes(card(u.code).type_code) &&
          !card(u.code).is_unique &&
          !barred(s, u, P.eagle),
      );
      if (enemies.length)
        choose(s, "Eagle of the North · Discard a non-unique enemy", [
          ...enemies.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("eredPlayerEagleDiscard", { target: u.id })],
          })),
          skip,
        ]);
      return true;
    }
    case "eredPlayerEagleDiscard":
      if (t && !card(t.code).is_unique && !barred(s, t, P.eagle))
        destroy(s, t, false);
      return true;
    case "eredPlayerQuickerCost":
      choose(
        s,
        "Quicker Than Sight · Return a Silvan ally",
        silvans(s).map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("eredPlayerQuickerReturn", { target: u.id })],
        })),
      );
      return true;
    case "eredPlayerQuickerReturn":
      if (t && silvans(s).some((u) => u.id === t.id)) returnAlly(s, t);
      return true;
    default:
      return false;
  }
}
