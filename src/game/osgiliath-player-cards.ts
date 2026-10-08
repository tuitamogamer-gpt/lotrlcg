import { playerCardImmune } from "./card-immunity";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
// Assault on Osgiliath: exact printed-icon passives and serializable choices.
import { card, name, plain } from "./cards";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import {
  canFight,
  choose,
  draw,
  fx,
  get,
  log,
  opts,
  prepend,
  requireRule,
  skip,
} from "./core";
import {
  damage,
  discardAttachment,
  engage,
  exhaustCharacter,
  raiseThreat,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { khazadCanAttack, khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isSacked } from "./carrock";
import { shadowFlameCanMove } from "./shadow-flame";
import { rhosgobelCanFight } from "./rhosgobel";
import { longDarkCanAttack } from "./long-dark";
import {
  amonPlayerCanEngage,
  amonPlayerCannotDeclareAttack,
} from "./amon-din-player-cards";
import { playerAttack } from "./combat";
import {
  discardTarget,
  eventReplayPayments,
  needsTarget,
  playEventFromDiscardEffect,
  playTargets,
  replayEventProblem,
} from "./actions";

const immune = (u: Unit) => playerCardImmune(u);
const active = (a: Attachment) => !a.blanked && !a.facedown;
const liveCharacter = (s: GameState, u: Unit) =>
  allCharacters(s).some((candidate) => candidate.id === u.id);
const exhaustible = (u: Unit) =>
  !u.exhausted &&
  !isSacked(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
const hasTrap = (u: Unit) =>
  u.attachments.some(
    (a) =>
      active(a) &&
      ((card(a.code).traits ?? "")
        .split(".")
        .some((trait) => trait.trim() === "Trap") ||
        a.dynamicTraits?.includes("Trap")),
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy" && !immune(u),
  );
const stagingEnemies = (s: GameState) =>
  s.staging.filter((u) => card(u.code).type_code === "enemy" && !immune(u));
const outlandsDiscard = (s: GameState) =>
  s.discard
    .map((code, index) => ({ code, index }))
    .filter(
      ({ code }) =>
        card(code).type_code === "ally" &&
        (card(code).traits ?? "")
          .split(".")
          .some((trait) => trait.trim() === "Outlands"),
    );
const marker = (s: GameState, key: string) =>
  playerOrder(s).some((player) => seatView(s, player).used.includes(key));
const attachment = (s: GameState, host: Unit, id?: string) =>
  host.attachments.find(
    (a) =>
      a.id === id &&
      active(a) &&
      attachmentController(s, host, a) === activeSeat(s),
  );

export const OSGILIATH_ATTACHMENT_ACTIONS = [
  "06085",
  "06087",
  "06088",
  "06090",
];

export function osgiliathPlayerStats(s: GameState, u: Unit) {
  return {
    will:
      u.code === "06086" && !u.blanked
        ? seatView(s, ownerOf(s, u)).heroes.filter(
            (h) => card(h.code).sphere_code === "spirit",
          ).length
        : 0,
    attack:
      u.code === "06081" && !u.blanked
        ? s.staging.filter((enemy) => card(enemy.code).type_code === "enemy")
            .length
        : 0,
    defense: 0,
  };
}

export function osgiliathPlayerCost(s: GameState, c: Card, cost: number) {
  return c.code === "06087"
    ? Math.max(
        0,
        cost -
          s.heroes.filter((h) => card(h.code).sphere_code === "spirit").length,
      )
    : cost;
}

export function osgiliathPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === "06089") return enemies(s).filter(hasTrap);
  if (code === "06085")
    return allHeroes(s).filter(
      (u) => !immune(u) && (hasTrait(u, "Gondor") || hasTrait(u, "Dúnedain")),
    );
  if (code === "06087")
    return allHeroes(s).filter(
      (u) => !immune(u) && hasResourceIcon(u, "spirit"),
    );
  if (code === "06088")
    return allCharacters(s).filter((u) => !immune(u) && hasTrait(u, "Ranger"));
  if (code === "06090")
    return allHeroes(s).filter((u) => !immune(u) && hasTrait(u, "Noble"));
  return null;
}

export function osgiliathPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === "06083" && !outlandsDiscard(s).length)
    return "Men of the West needs an Outlands ally in your discard pile.";
  if (
    code === "06089" &&
    ![...s.heroes, ...s.allies].some((u) => hasTrait(u, "Ranger"))
  )
    return "Forest Patrol needs a Ranger character you control.";
  if (code === "06089" && !osgiliathPlayerPlayTargets(s, code)?.length)
    return "Forest Patrol needs an enemy with an active Trap attached.";
  if (
    ["06085", "06087", "06088", "06090"].includes(code) &&
    !osgiliathPlayerPlayTargets(s, code)?.length
  )
    return "This attachment has no eligible character.";
  return null;
}

/** X is the declared amount; event cost surcharges and discounts do not change it. */
export function osgiliathPlayerEventEffect(
  s: GameState,
  code: string,
  target?: string,
  amount = 0,
): boolean {
  if (code === "06083") {
    requireRule(
      Number.isInteger(amount) &&
        amount > 0 &&
        amount <= outlandsDiscard(s).length,
      "Choose a positive X no larger than your discarded Outlands allies.",
    );
    prepend(s, fx("osgiliathMenChoose", { count: amount }));
    return true;
  }
  if (code === "06089") {
    requireRule(
      !osgiliathPlayerPlayProblem(s, code),
      osgiliathPlayerPlayProblem(s, code) ?? "",
    );
    const enemy = osgiliathPlayerPlayTargets(s, code)!.find(
      (u) => u.id === target,
    );
    requireRule(enemy, "Choose an enemy with an active Trap attached.");
    damage(s, enemy.id, 3);
    return true;
  }
  return false;
}

function mapTargets(s: GameState, unit: Unit, index: number) {
  return playTargets(s, unit).filter((target) => {
    if (target.id.startsWith("discard-")) {
      const selected = discardTarget(s, target.id);
      if (selected.player === activeSeat(s) && selected.index === index)
        return false;
    }
    return !replayEventProblem(s, unit, target.id);
  });
}
function mapEvents(s: GameState) {
  return s.discard
    .map((code, index) => ({
      index,
      unit: { ...s.heroes[0], code, id: `osgiliath-discard-${index}` } as Unit,
    }))
    .filter(
      ({ unit, index }) =>
        card(unit.code).type_code === "event" &&
        card(unit.code).sphere_code === "spirit" &&
        !replayEventProblem(s, unit) &&
        (!needsTarget(unit) || mapTargets(s, unit, index).length > 0),
    );
}
const mapEvent = (s: GameState, e: Effect) =>
  mapEvents(s).find(
    ({ index, unit }) => index === e.value && unit.code === e.code,
  );

export const osgiliathPlayerAbilityLabel = (code: string) =>
  ({
    "06085": "Spend 1 resource · gain attack",
    "06087": "Discard Map · play a Spirit event",
    "06088": "Exhaust Bow and character · deal 1 damage",
    "06090": "Exhaust Palantir and hero · name an encounter card type",
  })[code];

export function osgiliathPlayerAbilityProblem(
  s: GameState,
  host: Unit,
  id?: string,
): string | undefined {
  const raw = host.attachments.find((a) => a.id === id);
  if (!raw || !OSGILIATH_ATTACHMENT_ACTIONS.includes(raw.code))
    return undefined;
  const a = attachment(s, host, id);
  if (!a || !liveCharacter(s, host))
    return "This attachment must be faceup, unblanked and controlled by you.";
  if (a.code === "06085") {
    if (immune(host)) return "This hero is immune to player card effects.";
    if (!heirsCanSpendResources(s, host))
      return "Orc Vanguard prevents this hero from spending resources.";
    if (host.resources < 2)
      return "Gondorian Fire needs a resource to spend and at least one remaining for its attack bonus.";
    if (marker(s, `phase:osgiliath-fire:${a.id}`))
      return "This physical Gondorian Fire has been used this phase.";
  }
  if (a.code === "06087" && !mapEvents(s).length)
    return "Your discard pile needs a Spirit event that can be played and paid for now.";
  if (
    ["06088", "06090"].includes(a.code) &&
    (a.exhausted || !exhaustible(host))
  )
    return "Both attachment and attached character must be ready and able to exhaust.";
  if (a.code === "06088" && !stagingEnemies(s).length)
    return "Ranger Bow needs an eligible enemy in staging.";
  if (a.code === "06090" && s.phase !== "planning")
    return "Palantir is a Planning Action.";
  if (a.code === "06090" && !s.encounterDeck.length)
    return "The encounter deck has no cards to look at.";
  return undefined;
}

export function useOsgiliathPlayerAbility(
  s: GameState,
  host: Unit,
  id?: string,
): boolean {
  const raw = host.attachments.find((a) => a.id === id);
  if (!raw || !OSGILIATH_ATTACHMENT_ACTIONS.includes(raw.code)) return false;
  const problem = osgiliathPlayerAbilityProblem(s, host, id);
  requireRule(!problem, problem ?? "");
  const a = attachment(s, host, id)!;
  if (a.code === "06085") {
    spendResources(s, host, 1);
    host.tempAttack = (host.tempAttack ?? 0) + host.resources;
    s.used.push(`phase:osgiliath-fire:${a.id}`);
    log(
      s,
      `${name(host)} gains +${host.resources} attack this phase from Gondorian Fire.`,
      "good",
    );
  }
  if (a.code === "06087")
    choose(
      s,
      "Map of Earnil · Spirit event",
      [
        ...mapEvents(s).map(({ index, unit }) => ({
          id: `discard-${index}`,
          code: unit.code,
          label: card(unit.code).name,
          effects: [
            fx("osgiliathMapTarget", {
              source: host.id,
              text: id,
              code: unit.code,
              value: index,
            }),
          ],
        })),
        skip,
      ],
      "Choose the event, legal targets and its complete normal payment. Discard the Map as the cost; this physical event finishes on the bottom of your deck.",
    );
  if (a.code === "06088")
    choose(s, "Ranger Bow · Staging enemy", [
      ...opts(stagingEnemies(s), (enemy) => [
        fx("osgiliathBow", { source: host.id, text: id, target: enemy.id }),
      ]),
      skip,
    ]);
  if (a.code === "06090")
    choose(
      s,
      "Palantir · Name a card type",
      [
        ...[
          "enemy",
          "location",
          "treachery",
          "objective",
          "objective-ally",
          "objective-hero",
          "quest",
          "hero",
          "ally",
          "attachment",
          "event",
          "treasure",
          "contract",
          "player-side-quest",
          "encounter-side-quest",
        ].map((type) => ({
          id: type,
          label: type.replaceAll("-", " "),
          effects: [
            fx("osgiliathPalantirName", {
              source: host.id,
              target: id,
              text: type,
            }),
          ],
        })),
        skip,
      ],
      "Name a type before seeing the top three cards. Their order will be preserved.",
    );
  return true;
}

const monoTactics = (s: GameState, player: number) => {
  const heroes = seatView(s, player).heroes;
  return (
    heroes.length > 0 &&
    heroes.every((h) => card(h.code).sphere_code === "tactics")
  );
};
function knightTargets(s: GameState, knight: Unit): Unit[] {
  const player = ownerOf(s, knight);
  if (
    !liveCharacter(s, knight) ||
    knight.blanked ||
    !monoTactics(s, player) ||
    !exhaustible(knight) ||
    !canFight(knight) ||
    !khazadCanAttack(knight) ||
    amonPlayerCannotDeclareAttack(s, player)
  )
    return [];
  return stagingEnemies(s).filter(
    (enemy) =>
      shadowFlameCanMove(s, enemy) &&
      amonPlayerCanEngage(s, enemy, player) &&
      longDarkCanAttack(s, enemy) &&
      rhosgobelCanFight(enemy, knight),
  );
}
/** Both playing and putting this ally into play grant its entry response. */
export function osgiliathPlayerAllyEntered(
  s: GameState,
  ally: Unit,
  _played: boolean,
) {
  if (ally.code === "06084" && knightTargets(s, ally).length)
    prepend(
      s,
      fx("osgiliathKnightResponse", {
        source: ally.id,
        player: ownerOf(s, ally),
      }),
    );
}

export function handleOsgiliathPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "osgiliathMenChoose": {
      if ((e.count ?? 0) <= 0) return true;
      const entries = outlandsDiscard(s);
      requireRule(
        entries.length >= e.count!,
        "The declared Outlands allies must remain in your discard pile.",
      );
      choose(
        s,
        "Men of the West · Return an Outlands ally",
        entries.map(({ code, index }) => ({
          id: `discard-${index}`,
          code,
          label: card(code).name,
          effects: [
            fx("osgiliathMenReturn", { value: index, code, count: e.count }),
          ],
        })),
      );
      return true;
    }
    case "osgiliathMenReturn": {
      const entry = outlandsDiscard(s).find(
        ({ index, code }) => index === e.value && code === e.code,
      );
      requireRule(entry, "Choose that actual discarded Outlands ally.");
      s.hand.push(takePlayerDiscard(s, entry.index));
      if ((e.count ?? 1) > 1)
        prepend(s, fx("osgiliathMenChoose", { count: e.count! - 1 }));
      return true;
    }
    case "osgiliathBow": {
      const host = get(s, e.source),
        enemy = stagingEnemies(s).find((u) => u.id === e.target);
      requireRule(
        host && enemy && !osgiliathPlayerAbilityProblem(s, host, e.text),
        "The Ranger Bow, ready character and staging enemy must remain available.",
      );
      const a = attachment(s, host, e.text)!;
      requireRule(a.code === "06088", "Choose that physical Ranger Bow.");
      a.exhausted = true;
      requireRule(
        exhaustCharacter(s, host),
        "The Bow's character must actually exhaust.",
      );
      damage(s, enemy.id, 1);
      return true;
    }
    case "osgiliathPalantirName": {
      const host = get(s, e.source);
      requireRule(
        host && !osgiliathPlayerAbilityProblem(s, host, e.target),
        "Palantir and its ready hero must remain available during planning.",
      );
      const a = attachment(s, host, e.target)!;
      requireRule(a.code === "06090", "Choose that physical Palantir.");
      a.exhausted = true;
      requireRule(
        exhaustCharacter(s, host),
        "Palantir's hero must actually exhaust.",
      );
      const looked = s.encounterDeck.slice(0, 3);
      prepend(
        s,
        fx("osgiliathPalantirLook", { ids: looked, text: e.text, value: 0 }),
      );
      return true;
    }
    case "osgiliathPalantirLook": {
      const looked = e.ids ?? [],
        index = e.value ?? 0;
      if (index < looked.length) {
        const code = looked[index];
        s.peek = code;
        choose(
          s,
          `Palantir · Card ${index + 1} of ${looked.length}`,
          [
            {
              id: "continue",
              code,
              label: card(code).name,
              effects: [{ ...e, value: index + 1 }],
            },
          ],
          plain(card(code).text),
        );
      } else {
        s.peek = null;
        // Each looked-at card creates its own draw/threat instruction.
        for (const code of looked) {
          if (card(code).type_code === e.text) draw(s, 1);
          else raiseThreat(s, 2, "player-card");
        }
      }
      return true;
    }
    case "osgiliathKnightResponse": {
      const knight = get(s, e.source);
      if (!knight) return true;
      const targets = knightTargets(s, knight);
      if (targets.length)
        choose(
          s,
          "Knight of Minas Tirith · Entered play",
          [
            ...opts(targets, (enemy) => [
              fx("osgiliathKnightEngage", {
                source: knight.id,
                target: enemy.id,
              }),
            ]),
            skip,
          ],
          "Engage a staging enemy, then exhaust this Knight to immediately attack it.",
        );
      return true;
    }
    case "osgiliathKnightEngage": {
      const knight = get(s, e.source),
        enemy =
          knight && knightTargets(s, knight).find((u) => u.id === e.target);
      requireRule(
        knight && enemy,
        "Choose a staging enemy that this Knight can engage and attack.",
      );
      const previous = s.queue.length;
      engage(s, enemy);
      const engagementEffects = s.queue.splice(0, s.queue.length - previous);
      prepend(
        s,
        ...engagementEffects,
        fx("osgiliathKnightAttack", { source: knight.id, target: enemy.id }),
      );
      return true;
    }
    case "osgiliathKnightAttack": {
      const knight = get(s, e.source),
        enemy = get(s, e.target);
      if (
        !knight ||
        !enemy ||
        !liveCharacter(s, knight) ||
        !exhaustible(knight) ||
        !canFight(knight) ||
        !khazadCanAttack(knight) ||
        !longDarkCanAttack(s, enemy) ||
        !rhosgobelCanFight(enemy, knight) ||
        amonPlayerCannotDeclareAttack(s, activeSeat(s))
      )
        return true;
      if (
        !seatView(s, ownerOf(s, knight)).engaged.some((u) => u.id === enemy.id)
      )
        return true;
      playerAttack(s, enemy, [knight.id], false, "knight");
      return true;
    }
    case "osgiliathMapTarget": {
      const host = get(s, e.source),
        entry = mapEvent(s, e);
      requireRule(
        host && attachment(s, host, e.text)?.code === "06087" && entry,
        "The Map and selected playable Spirit event must remain available.",
      );
      if (needsTarget(entry.unit))
        choose(
          s,
          "Map of Earnil · Event target",
          opts(mapTargets(s, entry.unit, entry.index), (target) => [
            { ...e, kind: "osgiliathMapPayment", target: target.id },
          ]),
        );
      else prepend(s, { ...e, kind: "osgiliathMapPayment" });
      return true;
    }
    case "osgiliathMapPayment": {
      const host = get(s, e.source),
        entry = mapEvent(s, e);
      requireRule(
        host &&
          attachment(s, host, e.text)?.code === "06087" &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target),
        "Choose a legal Spirit event and target.",
      );
      choose(
        s,
        "Map of Earnil · Pay event cost",
        eventReplayPayments(s, entry.unit, e.target).map((payment, index) => ({
          id: `pay-${index}`,
          label:
            Object.entries(payment)
              .map(([id, amount]) => `${amount} from ${name(get(s, id)!)}`)
              .join(" + ") || "Play at cost 0",
          effects: [
            {
              ...e,
              kind: "osgiliathMapPlay",
              ids: Object.entries(payment).map(
                ([id, amount]) => `${id}=${amount}`,
              ),
            },
          ],
        })),
      );
      return true;
    }
    case "osgiliathMapPlay": {
      const host = get(s, e.source),
        a = host && attachment(s, host, e.text),
        entry = mapEvent(s, e);
      requireRule(
        host &&
          a?.code === "06087" &&
          entry &&
          !replayEventProblem(s, entry.unit, e.target),
        "The Map, event and target must still be legal.",
      );
      const payment = Object.fromEntries(
        (e.ids ?? []).map((value) => {
          const split = value.lastIndexOf("=");
          return [value.slice(0, split), Number(value.slice(split + 1))];
        }),
      );
      requireRule(
        eventReplayPayments(s, entry.unit, e.target).some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(payment),
        ),
        "Choose the event's complete legal resource payment.",
      );
      discardAttachment(s, host, a);
      playEventFromDiscardEffect(s, entry.index, {
        target: e.target,
        payment,
        bottom: true,
      });
      return true;
    }
    default:
      return false;
  }
}
