import * as Isengard from "./voice-isengard";
import { morgulCannotLeave } from "./morgul-vale";
import { canGainResources } from "./core";
import { engagedEnemies, consideredEngaged } from "./considered-engagement";
import { dunlandEvent } from "./dunland-trap-player";
import {
  morgulPlayerEventEffect,
  useMorgulPlayerAbility,
} from "./morgul-player-cards";
import {
  osgiliathPlayerEventEffect,
  useOsgiliathPlayerAbility,
} from "./osgiliath-player-cards";
import {
  bloodPlayerEventEffect,
  useBloodPlayerAbility,
} from "./blood-gondor-player-cards";
import { removePlayedEvent } from "./event-resolution";
import { shadowFlameCanMove } from "./shadow-flame";
import { advanceDefense, exhaustCharacter, enemyAddedToStaging } from "./board";
// Player card scripts: events, hero and attachment abilities.
import { card, name, plain } from "./cards";
import type { Effect, GameState, Unit } from "./types";

import {
  activeSeat,
  allCharacters,
  allActiveLocations,
  allHeroes,
  allEngaged,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  attackersFor,
} from "./table";

import {
  RuleError,
  choose,
  fx,
  get,
  hasGondor,
  log,
  make,
  opts,
  prepend,
  requireRule,
} from "./core";
import {
  discardAttachment,
  enterAlly,
  allyCanEnter,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import { discardTarget } from "./actions";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import {
  rhosgobelPlayerEventEffect,
  useRhosgobelAbility,
} from "./rhosgobel-player-cards";
import {
  emynPlayerEventEffect,
  useEmynPlayerAbility,
} from "./emyn-player-cards";
import {
  marshPlayerEventEffect,
  useMarshPlayerAbility,
} from "./marsh-player-cards";
import {
  mirkwoodPlayerEventEffect,
  useMirkwoodPlayerAbility,
} from "./mirkwood-player-cards";
import {
  khazadPlayerEventEffect,
  useKhazadPlayerAbility,
} from "./khazad-player-cards";
import {
  redhornPlayerEventEffect,
  useRedhornPlayerAbility,
} from "./redhorn-player-cards";
import {
  roadPlayerEventEffect,
  useRoadPlayerAbility,
} from "./road-player-cards";
import { useWatcherPlayerAbility } from "./watcher-player-cards";
import {
  longDarkPlayerEventEffect,
  useLongDarkPlayerAbility,
} from "./long-dark-player-cards";
import { useFoundationsPlayerAbility } from "./foundations-player-cards";
import {
  shadowFlamePlayerEventEffect,
  useShadowFlamePlayerAbility,
} from "./shadow-flame-player-cards";
import {
  heirsPlayerEventEffect,
  useHeirsPlayerAbility,
} from "./heirs-player-cards";
import { stewardPlayerEventEffect } from "./steward-player-cards";
import { druadanPlayerEventEffect } from "./druadan-player-cards";
import {
  amonPlayerEventEffect,
  useAmonPlayerAbility,
} from "./amon-din-player-cards";
import {
  expansionEventEffect,
  useExpansionAbility,
} from "./expansion-player-cards";
import {
  gondorEventEffect,
  gondorResourcesGained,
  useGondorAbility,
} from "./gondor-player-cards";

export function eventEffect(
  s: GameState,
  code: string,
  target?: string,
  cost = 0,
  amount = cost,
) {
  if (dunlandEvent(s, code, target)) return;
  if (osgiliathPlayerEventEffect(s, code, target, amount)) return;
  if (bloodPlayerEventEffect(s, code, target)) return;
  if (morgulPlayerEventEffect(s, code, target)) return;
  if (amonPlayerEventEffect(s, code)) return;
  if (druadanPlayerEventEffect(s, code)) return;
  if (stewardPlayerEventEffect(s, code, target)) return;
  if (heirsPlayerEventEffect(s, code, target)) return;
  if (shadowFlamePlayerEventEffect(s, code, target)) return;
  if (expansionEventEffect(s, code, target, cost)) return;
  if (gondorEventEffect(s, code, target)) return;
  if (rhosgobelPlayerEventEffect(s, code, target)) return;
  if (emynPlayerEventEffect(s, code, target)) return;
  if (marshPlayerEventEffect(s, code)) return;
  if (mirkwoodPlayerEventEffect(s, code)) return;
  if (khazadPlayerEventEffect(s, code, target)) return;
  if (redhornPlayerEventEffect(s, code, target)) return;
  if (roadPlayerEventEffect(s, code, target)) return;
  if (Isengard.isengardEvent(s, code)) return;
  if (longDarkPlayerEventEffect(s, code, target)) return;
  const u = get(s, target);
  switch (code) {
    case "rc132":
      s.mendorBoost = true;
      break;
    case "01020":
      if (u) readyCharacter(s, u);
      break;
    case "01021":
      if (u) {
        requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
        choose(
          s,
          "Common Cause",
          opts(
            allHeroes(s).filter((h) => h.id !== u.id && h.exhausted),
            (h) => [fx("ready", { target: h.id })],
          ),
        );
      }
      break;
    case "01022":
      for (const x of allCharacters(s)) {
        x.tempAttack = (x.tempAttack ?? 0) + 1;
        if (hasGondor(x)) x.tempDefense = (x.tempDefense ?? 0) + 1;
      }
      break;
    case "01023":
      choose(
        s,
        "Sneak Attack",
        opts(
          s.hand.filter((a) => allyCanEnter(s, a.code)),
          (a) => [fx("sneak", { target: a.id })],
        ),
        "Put an ally into play. It returns to your hand at the end of this phase.",
      );
      break;
    case "01025":
      allCharacters(s).forEach((u) => {
        readyCharacter(s, u);
      });
      break;
    case "01032":
      if (u) {
        u.tempAttack = (u.tempAttack ?? 0) + 1;
        u.tempDefense = (u.tempDefense ?? 0) + 1;
      }
      break;
    case "01033":
      if (u) {
        requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
        choosePlayer(s, "Rain of Arrows · Choose a fellowship", [
          fx("rainOfArrows"),
        ]);
      }
      break;
    case "01034":
      if (u) {
        const eligible = playerOrder(s).filter((p) =>
          engagedEnemies(s, p).some((enemy) => enemy.id === u.id),
        );
        if (eligible.length > 1)
          choose(
            s,
            "Feint · Choose the attacked fellowship",
            eligible.map((player) => ({
              id: `feint-${player}`,
              label: `Prevent ${name(u)} attacking ${seatName(s, player)} this phase`,
              effects: [fx("feintEnemy", { target: u.id, value: player })],
            })),
          );
        else if (eligible.length)
          prepend(s, fx("feintEnemy", { target: u.id, value: eligible[0] }));
      }
      break;
    case "01035":
      if (u)
        choose(
          s,
          "Quick Strike",
          opts(
            [
              ...allEngaged(s),
              ...s.staging.filter((e) => card(e.code).type_code === "enemy"),
            ].filter((enemy) =>
              attackersFor(s, enemy).some((a) => a.id === u.id),
            ),
            (enemy) => [fx("quickAttack", { target: enemy.id, source: u.id })],
          ),
          "Immediately attack with the chosen character.",
        );
      break;
    case "01036":
      choosePlayer(s, "Thicket of Spears · Choose a fellowship", [
        fx("thicket"),
      ]);
      break;
    case "01038":
      choosePlayer(s, "Stand Together · Choose a fellowship", [
        fx("standTogether"),
      ]);
      log(
        s,
        "Stand Together allows multiple defenders for each attack this phase.",
      );
      break;
    case "01046":
      if (s.table)
        choose(s, "The Galadhrim’s Greeting", [
          ...playerOrder(s).map((player) => ({
            id: `player-${player}`,
            label: `Reduce ${seatName(s, player)}’s threat by 6`,
            effects: [fx("threat", { value: -6, player })],
          })),
          {
            id: "everyone",
            label: "Reduce every fellowship’s threat by 2",
            effects: playerOrder(s).map((player) =>
              fx("threat", { value: -2, player }),
            ),
          },
        ]);
      else s.threat = Math.max(0, s.threat - 6);
      break;
    case "01049":
      removePlayedEvent(s, code);
      choosePlayer(s, "Will of the West · Choose a fellowship", [
        fx("reshufflePlayer"),
      ]);
      break;
    case "01051": {
      const t = discardTarget(s, target!);
      requireRule(
        allyCanEnter(s, seatView(s, t.player).discard[t.index]),
        "Choose an ally that can legally enter play.",
      );
      const ally = seatView(s, t.player).discard.splice(t.index, 1)[0];
      const fresh = make(s, ally);
      if (s.table) fresh.owner = t.player;
      enterAlly(s, fresh);
      break;
    }
    case "01052":
      if (u) {
        if (!shadowFlameCanMove(s, u) || morgulCannotLeave(s, u)) break;
        if (u.facedownCard) {
          const controller = ownerOf(s, u);
          forOwner(s, controller, () => {
            s.engaged = s.engaged.filter((e) => e.id !== u.id);
          });
          seatView(s, u.owner ?? controller).discard.push(u.facedownCard);
          s.encounterDiscard.push(...u.shadows);
          for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
          log(
            s,
            "The Orc Guard returns to its owner's discard pile instead of staging.",
          );
          break;
        }
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((e) => e.id !== u.id);
        });
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        u.attacked = false;
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        advanceDefense(s);
      }
      break;
    case "01053": {
      const t = discardTarget(s, target!);
      s.hand.push(takePlayerDiscard(s, t.index));
      break;
    }
    case "01054": {
      const t = discardTarget(s, target!);
      forOwner(s, t.player, () => {
        const code = s.discard.splice(t.index, 1)[0];
        s.heroes.push(make(s, code));
        s.fallenThreat -= card(code).threat ?? 0;
      });
      break;
    }
    case "01063":
      if (u)
        rhosgobelHeal(s, u, u.damage, { code: "01063", player: activeSeat(s) });
      break;
    case "01064":
      choosePlayer(s, "Lórien’s Wealth · Who draws 3 cards?", [
        fx("draw", { value: 3 }),
      ]);
      break;
    case "01065":
    case "01066":
      if (u) u.suppressed = true;
      break;
    case "01067":
      if (s.table)
        choose(
          s,
          "Gandalf’s Search · Choose a deck",
          playerOrder(s)
            .filter((i) => seatView(s, i).deck.length >= cost)
            .map((player) => ({
              id: `player-${player}`,
              label: seatName(s, player),
              effects: [fx("searchPlayer", { value: cost, player })],
            })),
        );
      else prepend(s, fx("searchPlayer", { value: cost }));
      break;
    case "01068":
      choosePlayer(s, "Beorn’s Hospitality · Choose a fellowship", [
        fx("hospitality"),
      ]);
      break;
    default:
      throw new RuleError("This event is a triggered response.");
  }
}

export function choosePlayer(s: GameState, title: string, effects: Effect[]) {
  if (!s.table) {
    prepend(s, ...effects);
    return;
  }
  choose(
    s,
    title,
    playerOrder(s).map((player) => ({
      id: `player-${player}`,
      label: seatName(s, player),
      effects: effects.map((e) => ({ ...e, player })),
    })),
  );
}

export function useAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (Isengard.useIsengardAbility(s, u, attachmentId)) return;
  if (useOsgiliathPlayerAbility(s, u, attachmentId)) return;
  if (useBloodPlayerAbility(s, u, attachmentId)) return;
  if (useMorgulPlayerAbility(s, u, attachmentId)) return;
  if (useAmonPlayerAbility(s, u, attachmentId)) return;
  if (useHeirsPlayerAbility(s, u, attachmentId)) return;
  if (useShadowFlamePlayerAbility(s, u, attachmentId)) return;
  if (useExpansionAbility(s, u, attachmentId)) return;
  if (!attachmentId && useGondorAbility(s, u)) return;
  if (!attachmentId && useRhosgobelAbility(s, u)) return;
  if (!attachmentId && useEmynPlayerAbility(s, u)) return;
  if (useMarshPlayerAbility(s, u, attachmentId)) return;
  if (useMirkwoodPlayerAbility(s, u, attachmentId)) return;
  if (useKhazadPlayerAbility(s, u)) return;
  if (useRedhornPlayerAbility(s, u, attachmentId)) return;
  if (useRoadPlayerAbility(s, u)) return;
  if (!attachmentId && useWatcherPlayerAbility(s, u)) return;
  if (!attachmentId && useLongDarkPlayerAbility(s, u)) return;
  if (!attachmentId && useFoundationsPlayerAbility(s, u)) return;
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    requireRule(
      a && !a.exhausted && !a.blanked,
      "This attachment is exhausted or its printed text is blank.",
    );
    switch (a.code) {
      case "01026":
        requireRule(
          canGainResources(s, u),
          "This hero cannot collect resources from card effects.",
        );
        a.exhausted = true;
        u.resources += 2;
        gondorResourcesGained(s, u, 2, true);
        log(s, `Steward of Gondor gives ${name(u)} 2 resources.`, "good");
        return;
      case "01057":
        requireRule(u.exhausted, "This hero is already ready.");
        a.exhausted = true;
        readyCharacter(s, u);
        return;
      case "01072":
        requireRule(
          rhosgobelHealingAllowed(s, u),
          "This character has no damage that can be healed.",
        );
        a.exhausted = true;
        rhosgobelHeal(s, u, 2, {
          source: a.id,
          code: a.code,
          player: a.owner ?? ownerOf(s, u),
        });
        return;
      case "01070": {
        const key = `protector:${a.id}`;
        requireRule(
          s.used.filter((k) => k === key).length < 3 && s.hand.length > 0,
          "Protector of Lórien can be used 3 times per phase and requires a card to discard.",
        );
        choose(
          s,
          "Protector of Lórien",
          s.hand.flatMap((h) => [
            {
              id: `${h.id}-will`,
              label: `Discard ${name(h)} · +1 willpower`,
              code: h.code,
              effects: [
                fx("protector", {
                  target: u.id,
                  source: h.id,
                  text: key,
                  flag: true,
                }),
              ],
            },
            {
              id: `${h.id}-defense`,
              label: `Discard ${name(h)} · +1 defense`,
              code: h.code,
              effects: [
                fx("protector", { target: u.id, source: h.id, text: key }),
              ],
            },
          ]),
        );
        return;
      }
      case "01071":
        requireRule(
          s.phase === "defense" &&
            engagedEnemies(s).some(
              (e) =>
                e.shadows.length && (!e.attacked || consideredEngaged(s, e)),
            ),
          "Use Dark Knowledge after shadow cards are dealt.",
        );
        choose(
          s,
          "Dark Knowledge",
          engagedEnemies(s)
            .filter((e) => !e.attacked || consideredEngaged(s, e))
            .flatMap((e) =>
              e.shadows.map((code, i) => ({
                id: `${e.id}-${i}`,
                label: `${name(e)} · shadow ${i + 1}`,
                effects: [
                  fx("exhaustAttachment", { target: u.id, source: a.id }),
                  fx("peek", { code }),
                ],
              })),
            ),
        );
        return;
      default:
        throw new RuleError("This attachment has a passive ability.");
    }
  }
  switch (u.code) {
    case "01007":
      requireRule(
        !s.eowynUsed && s.hand.length > 0,
        "Éowyn requires a card to discard and can act once per round.",
      );
      choose(
        s,
        "Éowyn · Strength of spirit",
        s.hand.map((h) => ({
          id: h.id,
          label: name(h),
          code: h.code,
          effects: [fx("eowynDiscard", { target: h.id })],
        })),
        "Discard a card to gain +1 willpower until the end of this phase.",
      );
      break;
    case "01014":
      requireRule(!u.exhausted, "Faramir is exhausted.");
      requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
      choosePlayer(s, "Faramir · Choose a fellowship", [fx("faramir")]);
      log(
        s,
        "Faramir grants the chosen fellowship +1 willpower this phase.",
        "good",
      );
      break;
    case "01010":
    case "01060": {
      requireRule(!u.exhausted, "This character is exhausted.");
      requireRule(s.encounterDeck.length, "The encounter deck is empty.");
      requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
      const code = s.encounterDeck[0];
      s.peek = code;
      choose(
        s,
        `${name(u)} sees ${card(code).name}`,
        [
          { id: "keep", label: "Leave it on top", code, effects: [] },
          ...(u.code === "01010"
            ? [
                {
                  id: "bottom",
                  label: "Move it to the bottom",
                  code,
                  effects: [fx("encounterBottom")],
                },
              ]
            : []),
        ],
        plain(card(code).text),
      );
      break;
    }
    case "01011":
      requireRule(
        allCharacters(s).some((h) => rhosgobelHealingAllowed(s, h)),
        "There is no damaged character to heal.",
      );
      requireRule(
        !s.used.includes(u.id) && u.resources >= 1,
        "Glorfindel can heal once per round for 1 of his resources.",
      );
      choose(
        s,
        "Glorfindel · Healing touch",
        opts(
          allCharacters(s).filter((h) => rhosgobelHealingAllowed(s, h)),
          (h) => [
            fx("resource", { target: u.id, value: -1, flag: true }),
            fx("heal", { target: h.id, value: 1, source: u.id, code: u.code }),
            fx("used", { text: u.id }),
          ],
        ),
        "Pay 1 resource from Glorfindel to heal 1 damage.",
      );
      break;
    case "01012":
      requireRule(
        !u.exhausted && !s.used.includes(u.id),
        "Beravor can act once per round and must be ready.",
      );
      requireRule(
        !allActiveLocations(s).some((l) => l.code === "01095") &&
          livingSeats(s).some((i) => seatView(s, i).deck.length > 0),
        "You cannot draw cards now.",
      );
      requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
      s.used.push(u.id);
      choosePlayer(s, "Beravor · Who draws 2 cards?", [
        fx("draw", { value: 2 }),
      ]);
      break;
    case "01031":
      requireRule(
        !s.used.includes(u.id),
        "Beorn can use this action once per round.",
      );
      u.tempAttack = (u.tempAttack ?? 0) + 5;
      u.beornReturn = true;
      s.used.push(u.id);
      log(
        s,
        "Beorn gains +5 attack and will return to the deck at phase end.",
        "good",
      );
      break;
    case "01058":
      requireRule(!u.exhausted, "Daughter of the Nimrodel is exhausted.");
      requireRule(
        allHeroes(s).some((h) => rhosgobelHealingAllowed(s, h)),
        "There is no damaged hero to heal.",
      );
      choose(
        s,
        "Daughter of the Nimrodel",
        opts(
          allHeroes(s).filter((h) => rhosgobelHealingAllowed(s, h)),
          (h) => [
            fx("exhaust", { target: u.id }),
            fx("heal", { target: h.id, value: 2, source: u.id, code: u.code }),
          ],
        ),
        "Exhaust to heal up to 2 damage from a hero.",
      );
      break;
    case "01062":
      requireRule(!u.exhausted, "Gléowine is exhausted.");
      requireRule(
        !allActiveLocations(s).some((l) => l.code === "01095") &&
          livingSeats(s).some((i) => seatView(s, i).deck.length > 0),
        "You cannot draw cards now.",
      );
      requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
      choosePlayer(s, "Gléowine · Who draws a card?", [
        fx("draw", { value: 1 }),
      ]);
      break;
    case "01043":
      requireRule(
        !s.used.includes(`took:${u.id}`),
        "Wandering Took can transfer once per round.",
      );
      requireRule(
        s.threat >= 3,
        "Wandering Took requires at least 3 threat to transfer.",
      );
      requireRule(
        livingSeats(s).length > 1,
        "Wandering Took needs another player.",
      );
      choose(
        s,
        "Wandering Took · Choose a new controller",
        livingSeats(s)
          .filter((i) => i !== activeSeat(s))
          .map((i) => ({
            id: `player-${i}`,
            label: seatName(s, i),
            effects: [fx("transferTook", { target: u.id, value: i })],
          })),
      );
      break;
    default:
      throw new RuleError(
        u.code === "01043"
          ? "Wandering Took’s transfer ability requires another player."
          : "This character’s ability is passive or triggers automatically.",
      );
  }
}
