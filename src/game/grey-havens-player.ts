import { GREY_HAVENS as G } from "./grey-havens-player-support";
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
  canFight,
  canPay,
  choose,
  draw,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import {
  charactersCommitted,
  damage,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardLocation,
  exhaustCharacter,
  progressLocation,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  effectiveKeyword,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { playerCardImmune } from "./card-immunity";
import { discardableHand } from "./hand-rules";
import { khazadCannotExhaust } from "./khazad-dum";
import {
  watcherWaterCannotExhaust,
  watcherWaterProgressCapacity,
} from "./watcher-water";
import { rhosgobelCanFight } from "./rhosgobel";
import { redhornCanDefend } from "./redhorn-gate";
import { foundationsCanFight } from "./foundations-stone";
import { ettenCanDefend } from "./ettenmoors";
import { heirsCanDefend, heirsLocationProgressBlocked } from "./heirs-numenor";
import { druadanForestCanDefend } from "./druadan-forest";
import { dreadLocationProgressBlocked } from "./dread-realm";
import { shadowFlameLocationProgressBlocked } from "./shadow-flame";
import { tharbadLocationBlocked } from "./tharbad";
import { catchLocationProgressBlocked } from "./catch-orc";
import { choosePlayerResponse } from "./player-ability-triggers";
import { beginEnemyAttack } from "./combat";
import { ninNoCardEconomy } from "./nin-eilph-support";
import { isAlly } from "./card-types";
import { isEnemy, shipCanDefend } from "./ships";
import { fateCannotDraw } from "./fate-numenor";
import { FATE as F, FATE_UNCHARTED } from "./fate-numenor-support";

const PHASE = "phase:grey-havens:";
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const affected = (u: Unit) => !playerCardImmune(u);
const canExhaust = (u: Unit) =>
  !u.exhausted &&
  affected(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const topDiscard = (s: GameState, u: Unit) =>
  seatView(s, ownerOf(s, u)).discard.at(-1);
const topType = (s: GameState, u: Unit, type: string) => {
  const code = topDiscard(s, u);
  return !!code && card(code).type_code === type;
};
const marker = (s: GameState, key: string) =>
  playerOrder(s).some((p) => seatView(s, p).used.includes(key));
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && affected(u),
  );
// Neither face of an Uncharted island may enter the normal encounter deck.
const compassLocationCode = (code: string) =>
  card(code).type_code === "location" &&
  code !== F.lost &&
  !FATE_UNCHARTED.includes(code);
const compassLocations = (s: GameState) =>
  s.staging.filter((u) => compassLocationCode(u.code) && affected(u));
const progressAllowed = (s: GameState, u: Unit) =>
  !dreadLocationProgressBlocked(s, u) &&
  !shadowFlameLocationProgressBlocked(s, u) &&
  !tharbadLocationBlocked(s, u) &&
  !catchLocationProgressBlocked(s, u) &&
  !heirsLocationProgressBlocked(s, u) &&
  (watcherWaterProgressCapacity(s, u) ?? Infinity) > 0;
const flightTargets = (s: GameState) =>
  allCharacters(s).filter((u) => u.committed && affected(u));
const volleyTargets = (s: GameState) =>
  allEngaged(s).filter((u) => isEnemy(u) && affected(u));
const repeats = (s: GameState, code: string) =>
  1 + s.discard.filter((c) => c === code).length;
const currentAttachment = (s: GameState, u: Unit, id?: string) =>
  u.attachments.find(
    (a) =>
      a.id === id &&
      enabled(a) &&
      attachmentController(s, u, a) === activeSeat(s),
  );
const continueAfterResponses = (
  s: GameState,
  priorLength: number,
  effect: Effect,
) => s.queue.splice(s.queue.length - priorLength, 0, effect);

export function greyHavensStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0 };
  if (u.blanked || !affected(u)) return result;
  if (u.code === G.seaWatcher && topType(s, u, "ally")) result.attack = 2;
  if (u.code === G.warden && topType(s, u, "attachment")) result.defense = 2;
  if (u.code === G.sailor && topType(s, u, "event")) result.will = 1;
  return result;
}
export function greyHavensDynamicKeywords(s: GameState, u: Unit) {
  if (u.blanked || !affected(u)) return [];
  if (u.code === G.seaWatcher && topType(s, u, "ally")) return ["Ranged"];
  if (u.code === G.warden && topType(s, u, "attachment")) return ["Sentinel"];
  return [];
}
export const greyHavensCannotDamage = (s: GameState, u: Unit) =>
  u.code === G.sailor && !u.blanked && u.committed && topType(s, u, "event");
export const greyHavensCanQuestExhausted = (u: Unit) =>
  u.code === G.navigator && !u.blanked;
export const greyHavensQuestStat = (
  s: GameState,
  u: Unit,
  ordinary: "will" | "attack" | "defense",
) => (marker(s, `${PHASE}hook:${u.id}`) ? "attack" : ordinary);
export const greyHavensResourceDrawBonus = (
  s: GameState,
  player = activeSeat(s),
) =>
  seatView(s, player).heroes.filter((u) => u.code === G.cirdan && !u.blanked)
    .length;
/** The mandatory choice can see only physical cards from this resource draw. */
export function greyHavensResourceCardsDrawn(
  s: GameState,
  ids: string[],
  player = activeSeat(s),
) {
  const cirdan = seatView(s, player).heroes.find(
    (u) => u.code === G.cirdan && !u.blanked,
  );
  if (cirdan && ids.length)
    prepend(s, fx("greyHavensCirdan", { source: cirdan.id, ids, player }));
}
export function greyHavensSetup(s: GameState) {
  prepend(
    s,
    ...playerOrder(s).flatMap((player) => {
      const galdor = seatView(s, player).heroes.find(
        (u) => u.code === G.galdor && !u.blanked,
      );
      return galdor
        ? [fx("greyHavensGaldorSetup", { source: galdor.id, player })]
        : [];
    }),
  );
}
export function greyHavensPlayCost(s: GameState, c: Card, cost: number) {
  if (
    c.type_code !== "ally" ||
    !(c.traits ?? "").split(".").some((t) => t.trim() === "Noldor")
  )
    return cost;
  const reduction = s.used
    .filter((key) => key.startsWith(`${PHASE}sea:`))
    .reduce((sum, key) => sum + Number(key.split(":")[3]), 0);
  return reduction ? Math.max(1, cost - reduction) : cost;
}
/** Putting an ally into play does not spend a 'next ally played' discount. */
export function greyHavensAllyPlayed(s: GameState, code: string) {
  if ((card(code).traits ?? "").split(".").some((t) => t.trim() === "Noldor"))
    s.used = s.used.filter((key) => !key.startsWith(`${PHASE}sea:`));
}
export function greyHavensPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  const chars = allCharacters(s).filter(affected);
  if (code === G.hook) return chars;
  if (code === G.compass)
    return chars.filter(
      (u) => hasResourceIcon(u, "leadership") || hasTrait(u, "Scout"),
    );
  if (code === G.almanac)
    return s.staging.filter(
      (u) => card(u.code).type_code === "location" && affected(u),
    );
  if (code === G.sea) return chars.filter((u) => hasTrait(u, "Noldor"));
  if (code === G.narya)
    return chars.filter((u) =>
      ["Círdan the Shipwright", "Gandalf"].includes(card(u.code).name),
    );
  if (code === G.volley)
    return chars.filter(
      (u) =>
        ownerOf(s, u) === activeSeat(s) &&
        canExhaust(u) &&
        effectiveKeyword(u, "Ranged"),
    );
  if (code === G.star) return locations(s).filter((u) => progressAllowed(s, u));
  if (code === G.flight) return flightTargets(s);
  return null;
}
export function greyHavensPlayProblem(s: GameState, code: string) {
  if (code === G.anchor)
    return "Use Anchor Watch when an enemy is declared as an attacker against you.";
  if (code === G.volley && !["defense", "attack"].includes(s.phase))
    return "Skyward Volley is a Combat Action.";
  if (
    code === G.volley &&
    (!greyHavensPlayTargets(s, code)!.length || !volleyTargets(s).length)
  )
    return "Skyward Volley needs a ready ranged character you control and an engaged enemy.";
  if (code === G.flight && !["quest", "staging"].includes(s.phase))
    return "Elwing's Flight is a Quest Action.";
  if (code === G.flight && !flightTargets(s).length)
    return "Elwing's Flight needs a questing character.";
  return null;
}
/** Additional costs are paid before a cancellation can skip the event's effects. */
export function greyHavensEventCost(
  s: GameState,
  code: string,
  target?: string,
) {
  if (code !== G.volley) return;
  const u = get(s, target);
  requireRule(
    u && greyHavensPlayTargets(s, code)!.some((c) => c.id === u.id),
    "Exhaust a ranged character you control.",
  );
  requireRule(
    exhaustCharacter(s, u),
    "The ranged character must exhaust to pay Skyward Volley.",
  );
}
export function greyHavensEvent(s: GameState, code: string, target?: string) {
  const u = get(s, target);
  if (code === G.volley) {
    prepend(s, fx("greyHavensRepeat", { code, count: repeats(s, code) }));
    return true;
  }
  if (code === G.star || code === G.flight) {
    requireRule(
      u && greyHavensPlayTargets(s, code)!.some((c) => c.id === u.id),
      "Choose a legal target for this event.",
    );
    prepend(
      s,
      fx("greyHavensRepeatResolve", { code, target, count: repeats(s, code) }),
    );
    return true;
  }
  return false;
}
export const greyHavensAbilityLabel = (code: string) =>
  (
    ({
      [G.galdor]: "Draw 6 cards · Once per game",
      [G.hook]:
        "Discard Grappling Hook and exhaust character · Quest with attack",
      [G.sea]:
        "Exhaust To the Sea, to the Sea! · Discard cards for a Noldor ally discount",
      [G.narya]: "Exhaust Narya and character · Ready up to 2 allies",
    }) as Record<string, string>
  )[code] ?? null;
export function greyHavensAbilityProblem(s: GameState, u: Unit, id?: string) {
  const a = currentAttachment(s, u, id),
    code = a?.code ?? u.code;
  if (!a && (u.blanked || ownerOf(s, u) !== activeSeat(s)))
    return "Choose an active character you control.";
  if (code === G.galdor)
    return s.hand.length ||
      s.used.includes(`game:grey-havens:galdor:${u.id}`) ||
      !s.deck.length ||
      ninNoCardEconomy(s) ||
      fateCannotDraw(s) ||
      allActiveLocations(s).some((l) => l.code === "01095")
      ? "Galdor needs an empty hand, a drawable deck and his unused once-per-game Action."
      : null;
  if (!a || a.exhausted) return "Choose a ready attachment you control.";
  if (code === G.hook)
    return !["quest", "staging"].includes(s.phase) ||
      !canExhaust(u) ||
      u.committed
      ? "Grappling Hook needs a ready uncommitted character during the quest phase."
      : null;
  if (code === G.sea)
    return !discardableHand(s).length
      ? "To the Sea, to the Sea! requires a hand card to discard."
      : null;
  if (code === G.narya)
    return !canExhaust(u) ||
      !allCharacters(s).some((ally) => isAlly(ally) && affected(ally))
      ? "Narya needs its ready attached character and an ally."
      : null;
  return "This card has no Grey Havens Action.";
}
export function useGreyHavensAbility(s: GameState, u: Unit, id?: string) {
  const a = currentAttachment(s, u, id),
    code = a?.code ?? u.code;
  if (!greyHavensAbilityLabel(code)) return false;
  requireRule(
    !greyHavensAbilityProblem(s, u, id),
    greyHavensAbilityProblem(s, u, id) ?? "",
  );
  if (code === G.galdor) {
    s.used.push(`game:grey-havens:galdor:${u.id}`);
    draw(s, 6);
    return true;
  }
  if (code === G.hook) {
    discardAttachment(s, u, a!);
    requireRule(
      exhaustCharacter(s, u),
      "Grappling Hook's character must exhaust.",
    );
    u.committed = true;
    seatView(s, ownerOf(s, u)).used.push(`${PHASE}hook:${u.id}`);
    charactersCommitted(s, [u], [u.id]);
    return true;
  }
  if (code === G.sea) {
    a!.exhausted = true;
    prepend(s, fx("greyHavensSeaChoose", { source: a!.id, value: 0 }));
    return true;
  }
  if (code === G.narya) {
    a!.exhausted = true;
    requireRule(exhaustCharacter(s, u), "Narya's character must exhaust.");
    prepend(s, fx("greyHavensNaryaChoose", { count: 2, ids: [] }));
    return true;
  }
  return false;
}

export function greyHavensAnchorDefenders(s: GameState, enemy: Unit) {
  return allCharacters(s).filter(
    (u) =>
      u.exhausted &&
      ownerOf(s, u) === activeSeat(s) &&
      affected(u) &&
      canFight(u) &&
      shipCanDefend(enemy, u) &&
      rhosgobelCanFight(enemy, u) &&
      redhornCanDefend(enemy, u) &&
      foundationsCanFight(enemy, u) &&
      ettenCanDefend(s, enemy, u) &&
      heirsCanDefend(s, enemy, u) &&
      druadanForestCanDefend(s, enemy, u) &&
      !u.attachments.some((a) => !a.blanked && a.code === "01108"),
  );
}
/** Suspends before the ordinary defender declaration and preserves its complete continuation. */
export function greyHavensOfferAnchorAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  returnWolf = false,
  watcherResolved = false,
  shadowsPrepared = false,
) {
  if (!greyHavensAnchorDefenders(s, enemy).length) return false;
  const events = s.hand.filter(
    (u) =>
      u.code === G.anchor &&
      canPay(s, { ...card(u.code), playOwner: u.owner ?? activeSeat(s) }),
  );
  if (!events.length) return false;
  const context = {
    target: enemy.id,
    flag: returnWolf,
    value: watcherResolved ? 1 : 0,
    count: shadowsPrepared ? 1 : 0,
    player: activeSeat(s),
  };
  choose(s, "Anchor Watch · Enemy declared as an attacker", [
    ...events.map((event): Option => ({
      ...option(event, [
        fx("eventPlay", {
          code: G.anchor,
          source: event.id,
          effects: [fx("greyHavensAnchorStart", { ...context, ids: [] })],
        }),
      ]),
      label: `Play ${name(event)}`,
      ability: {
        player: activeSeat(s),
        source: event.id,
        code: event.code,
        type: "response",
      },
    })),
    {
      ...skip,
      effects: [
        fx("greyHavensResumeAttack", { ...context, ids, text: "ordinary" }),
      ],
    },
  ]);
  return true;
}

/** Active locations buffer first. The first player may then allocate to any Almanac location. */
export function greyHavensAlmanac(s: GameState, amount: number) {
  if (amount <= 0) return false;
  if (marker(s, `${PHASE}almanac-bypass`)) {
    for (const p of playerOrder(s)) {
      const seat = seatView(s, p);
      seat.used = seat.used.filter((key) => key !== `${PHASE}almanac-bypass`);
    }
    return false;
  }
  const targets = s.staging.filter(
    (u) =>
      card(u.code).type_code === "location" &&
      affected(u) &&
      progressAllowed(s, u) &&
      u.attachments.some((a) => a.code === G.almanac && enabled(a)) &&
      locationQuest(s, u) > u.progress,
  );
  if (!targets.length) return false;
  choose(s, "Explorer's Almanac · Allocate successful quest progress", [
    ...targets.flatMap((u) =>
      Array.from(
        {
          length: Math.min(
            amount,
            locationQuest(s, u) - u.progress,
            watcherWaterProgressCapacity(s, u) ?? Infinity,
          ),
        },
        (_, i): Option => ({
          id: `${u.id}:${i + 1}`,
          code: u.code,
          label: `${name(u)} · ${i + 1} progress`,
          effects: [
            fx("greyHavensAlmanacPlace", {
              target: u.id,
              value: i + 1,
              count: amount - i - 1,
            }),
          ],
        }),
      ),
    ),
    {
      id: "quest",
      label: "Place remaining progress on the current quest",
      effects: [fx("greyHavensAlmanacQuest", { value: amount })],
    },
  ]);
  return true;
}

export function greyHavensEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  if (e.kind === "startTravel" && e.text === "grey-havens-travel-started")
    return false;
  // A separate key, rather than e.text, preserves other expansion timing markers.
  const navigators =
    e.kind === "finishQuestPhase"
      ? allCharacters(s).filter(
          (c) => c.code === G.navigator && c.committed && !c.blanked,
        )
      : [];
  if (navigators.length && !marker(s, `${PHASE}navigator-resolved`)) {
    for (const p of playerOrder(s))
      seatView(s, p).used.push(`${PHASE}navigator-resolved`);
    prepend(
      s,
      ...navigators.map((c) =>
        fx("greyHavensNavigator", { target: c.id, player: ownerOf(s, c) }),
      ),
      e,
    );
    return true;
  }
  if (
    e.kind === "startTravel" &&
    !marker(s, `${PHASE}compass-offered`) &&
    compassLocations(s).length > 0 &&
    allCharacters(s).some(
      (c) =>
        canExhaust(c) &&
        c.attachments.some(
          (a) => a.code === G.compass && enabled(a) && !a.exhausted,
        ),
    )
  ) {
    // startPhase clears phase markers, so the actual startTravel must happen first.
    prepend(
      s,
      { ...e, text: "grey-havens-travel-started" },
      fx("greyHavensCompassOffers"),
    );
    for (const p of playerOrder(s))
      seatView(s, p).used.push(`${PHASE}compass-offered`);
    return true;
  }
  switch (e.kind) {
    case "greyHavensResourceDraw": {
      const before = new Set(s.hand.map((c) => c.id));
      // No End in Sight permits the framework draw but prevents every player-card bonus.
      draw(
        s,
        ninNoCardEconomy(s) ? Math.min(1, e.value ?? 1) : (e.value ?? 1),
        false,
      );
      greyHavensResourceCardsDrawn(
        s,
        s.hand.filter((c) => !before.has(c.id)).map((c) => c.id),
      );
      return true;
    }
    case "greyHavensCirdan": {
      const drawn = discardableHand(s).filter((c) => e.ids?.includes(c.id));
      if (drawn.length)
        choose(
          s,
          "Círdan the Shipwright · Discard one of the cards just drawn",
          drawn.map((c) =>
            option(c, [fx("greyHavensDiscard", { target: c.id })]),
          ),
        );
      return true;
    }
    case "greyHavensDiscard":
      if (s.hand.some((c) => c.id === e.target)) discardHandCard(s, e.target!);
      return true;
    case "greyHavensGaldorSetup": {
      const galdor = get(s, e.source);
      if (galdor && !galdor.blanked && !s.mulled)
        choosePlayerResponse(
          s,
          galdor.id,
          galdor.code,
          "Galdor of the Havens · Replace any cards in your setup hand",
          [
            {
              id: "use",
              label: "Use Galdor instead of taking a mulligan",
              effects: [fx("greyHavensGaldorChoose", { value: 0, ids: [] })],
            },
            skip,
          ],
        );
      return true;
    }
    case "greyHavensGaldorChoose":
      s.mulled = true;
      choose(s, "Galdor of the Havens · Choose setup cards to discard", [
        ...discardableHand(s)
          .filter((c) => !e.ids?.includes(c.id))
          .map((c) =>
            option(c, [
              fx("greyHavensGaldorDiscard", {
                target: c.id,
                ids: [...(e.ids ?? []), c.id],
                value: (e.value ?? 0) + 1,
              }),
            ]),
          ),
        {
          id: "done",
          label: `Finish · Draw ${e.value ?? 0} replacement cards`,
          effects: [fx("draw", { value: e.value ?? 0 })],
        },
      ]);
      return true;
    case "greyHavensGaldorDiscard":
      requireRule(
        s.hand.some((c) => c.id === e.target),
        "The chosen setup card must remain in hand.",
      );
      {
        const pending = s.queue.length;
        discardHandCard(s, e.target!);
        continueAfterResponses(
          s,
          pending,
          fx("greyHavensGaldorChoose", { value: e.value, ids: e.ids }),
        );
      }
      return true;
    case "greyHavensRepeat": {
      if (!e.count) return true;
      const targets =
        e.code === G.volley
          ? volleyTargets(s)
          : e.code === G.star
            ? locations(s).filter((c) => progressAllowed(s, c))
            : flightTargets(s);
      if (targets.length)
        choose(
          s,
          `${card(e.code!).name} · Resolve ${e.count} remaining effect${e.count === 1 ? "" : "s"}`,
          targets.map((c) =>
            option(c, [
              fx("greyHavensRepeatResolve", {
                code: e.code,
                target: c.id,
                count: e.count,
              }),
            ]),
          ),
        );
      return true;
    }
    case "greyHavensRepeatResolve": {
      const pending = s.queue.length;
      if (u && affected(u)) {
        if (e.code === G.volley && volleyTargets(s).some((c) => c.id === u.id))
          damage(s, u.id, 2);
        if (e.code === G.star && locations(s).some((c) => c.id === u.id))
          progressLocation(s, u, 2);
        if (
          e.code === G.flight &&
          flightTargets(s).some((c) => c.id === u.id)
        ) {
          readyCharacter(s, u);
          u.tempWill = (u.tempWill ?? 0) + 1;
        }
      }
      continueAfterResponses(
        s,
        pending,
        fx("greyHavensRepeat", { code: e.code, count: (e.count ?? 1) - 1 }),
      );
      return true;
    }
    case "greyHavensSeaChoose":
      choose(s, "To the Sea, to the Sea! · Discard cards", [
        ...discardableHand(s)
          .filter((c) => !e.ids?.includes(c.id))
          .map((c) =>
            option(c, [
              fx("greyHavensSeaDiscard", {
                target: c.id,
                source: e.source,
                value: (e.value ?? 0) + 1,
                ids: [...(e.ids ?? []), c.id],
              }),
            ]),
          ),
        ...((e.value ?? 0)
          ? [
              {
                id: "done",
                label: `Finish · Reduce the next Noldor ally's cost by ${e.value}`,
                effects: [
                  fx("greyHavensSeaFinish", {
                    value: e.value,
                    source: e.source,
                  }),
                ],
              },
            ]
          : []),
      ]);
      return true;
    case "greyHavensSeaDiscard": {
      requireRule(
        discardableHand(s).some((c) => c.id === e.target),
        "Discard the chosen physical hand card.",
      );
      const pending = s.queue.length;
      discardHandCard(s, e.target!);
      continueAfterResponses(
        s,
        pending,
        fx("greyHavensSeaChoose", {
          value: e.value,
          source: e.source,
          ids: e.ids,
        }),
      );
      return true;
    }
    case "greyHavensSeaFinish":
      s.used.push(`${PHASE}sea:${e.value}:${e.source}`);
      return true;
    case "greyHavensNaryaChoose": {
      const allies = allCharacters(s).filter(
        (c) => isAlly(c) && affected(c) && !e.ids?.includes(c.id),
      );
      if (e.count && allies.length)
        choose(s, "Narya · Ready up to 2 allies", [
          ...allies.map((c) =>
            option(c, [
              fx("greyHavensNaryaReady", {
                target: c.id,
                count: e.count,
                ids: [...(e.ids ?? []), c.id],
              }),
            ]),
          ),
          { id: "done", label: "Finish choosing allies", effects: [] },
        ]);
      return true;
    }
    case "greyHavensNaryaReady": {
      const pending = s.queue.length;
      if (u && affected(u)) {
        readyCharacter(s, u);
        u.tempAttack = (u.tempAttack ?? 0) + 1;
        u.tempDefense = (u.tempDefense ?? 0) + 1;
      }
      continueAfterResponses(
        s,
        pending,
        fx("greyHavensNaryaChoose", { count: (e.count ?? 1) - 1, ids: e.ids }),
      );
      return true;
    }
    case "greyHavensNavigator":
      if (u && u.committed && !u.blanked)
        choose(s, "Lindon Navigator · Discard it or a hand card", [
          {
            id: "ally",
            code: u.code,
            label: "Discard Lindon Navigator from play",
            effects: [fx("greyHavensNavigatorDiscard", { target: u.id })],
          },
          ...discardableHand(s).map((c) =>
            option(c, [fx("greyHavensDiscard", { target: c.id })]),
          ),
        ]);
      return true;
    case "greyHavensNavigatorDiscard":
      if (u) discardCharacter(s, u);
      return true;
    case "greyHavensCompassOffers":
      prepend(
        s,
        ...allCharacters(s).flatMap((c) =>
          c.attachments
            .filter(
              (a) =>
                a.code === G.compass &&
                enabled(a) &&
                !a.exhausted &&
                canExhaust(c),
            )
            .map((a) =>
              fx("greyHavensCompassOffer", {
                target: c.id,
                source: a.id,
                player: attachmentController(s, c, a) ?? ownerOf(s, c),
              }),
            ),
        ),
      );
      return true;
    case "greyHavensCompassOffer": {
      const a = u && currentAttachment(s, u, e.source);
      if (
        u &&
        a &&
        !a.exhausted &&
        canExhaust(u) &&
        compassLocations(s).length > 0
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          "Mariner's Compass · Beginning of the travel phase",
          [
            {
              id: "use",
              code: a.code,
              label:
                "Exhaust Compass and character · Search top 5 encounter cards",
              effects: [
                fx("greyHavensCompassSearch", { target: u.id, source: a.id }),
              ],
            },
            skip,
          ],
        );
      return true;
    }
    case "greyHavensCompassSearch": {
      const a = u && currentAttachment(s, u, e.source);
      requireRule(
        u &&
          a &&
          !a.exhausted &&
          canExhaust(u) &&
          compassLocations(s).length > 0,
        "The Compass and attached character must exhaust.",
      );
      a.exhausted = true;
      requireRule(
        exhaustCharacter(s, u),
        "The attached character must exhaust.",
      );
      choose(s, "Mariner's Compass · Search top 5 for a location", [
        ...s.encounterDeck.slice(0, 5).flatMap((code, value) =>
          compassLocationCode(code)
            ? [
                {
                  id: `deck-${value}`,
                  code,
                  label: card(code).name,
                  effects: [fx("greyHavensCompassLocation", { value, code })],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Choose no location · Shuffle encounter deck",
          effects: [fx("greyHavensCompassShuffle")],
        },
      ]);
      return true;
    }
    case "greyHavensCompassLocation":
      choose(
        s,
        "Mariner's Compass · Switch with a staging location",
        compassLocations(s).map((c) =>
          option(c, [
            fx("greyHavensCompassSwitch", {
              target: c.id,
              value: e.value,
              code: e.code,
            }),
          ]),
        ),
      );
      return true;
    case "greyHavensCompassSwitch": {
      requireRule(
        u &&
          compassLocations(s).some((c) => c.id === u.id) &&
          !!e.code &&
          compassLocationCode(e.code) &&
          s.encounterDeck[e.value!] === e.code,
        "Switch the chosen physical locations.",
      );
      const incoming = s.encounterDeck.splice(e.value!, 1)[0];
      discardLocation(s, u);
      const index = s.encounterDiscard.lastIndexOf(u.code);
      requireRule(index >= 0, "The switched-out location must leave staging.");
      s.encounterDiscard.splice(index, 1);
      s.encounterDeck.push(u.code);
      s.staging.push(make(s, incoming));
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Mariner's Compass switches locations without revealing or travelling.",
      );
      return true;
    }
    case "greyHavensCompassShuffle":
      shuffle(s, s.encounterDeck);
      return true;
    case "greyHavensAlmanacPlace":
      if (u && affected(u) && s.staging.some((c) => c.id === u.id))
        progressLocation(s, u, e.value ?? 0);
      prepend(
        s,
        fx("continueProgress", { value: e.count ?? 0, text: "quest" }),
      );
      return true;
    case "greyHavensAlmanacQuest":
      for (const p of playerOrder(s))
        seatView(s, p).used.push(`${PHASE}almanac-bypass`);
      prepend(
        s,
        fx("continueProgress", { value: e.value ?? 0, text: "quest" }),
      );
      return true;
    case "greyHavensAnchorStart":
      prepend(s, {
        ...e,
        kind: "greyHavensAnchorChoose",
        text: String(repeats(s, G.anchor)),
      });
      return true;
    case "greyHavensAnchorChoose": {
      const defenders = u
        ? greyHavensAnchorDefenders(s, u).filter((c) => !e.ids?.includes(c.id))
        : [];
      if (Number(e.text) > 0 && defenders.length)
        choose(
          s,
          "Anchor Watch · Declare an exhausted defender",
          defenders.map((c) =>
            option(c, [
              {
                ...e,
                kind: "greyHavensAnchorChoose",
                ids: [...(e.ids ?? []), c.id],
                text: String(Number(e.text) - 1),
              },
            ]),
          ),
        );
      else prepend(s, { ...e, kind: "greyHavensResumeAttack", text: "anchor" });
      return true;
    }
    case "greyHavensResumeAttack":
      if (u)
        beginEnemyAttack(
          s,
          u,
          e.ids ?? [],
          !!e.flag,
          !!e.value,
          !!e.count,
          true,
          e.text === "anchor",
        );
      return true;
    default:
      return false;
  }
}
