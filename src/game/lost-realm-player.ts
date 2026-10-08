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
  canPay,
  choose,
  fx,
  get,
  make,
  prepend,
  removeShadowCard,
  requireRule,
  shuffle,
  skip,
  takePlayerDeck,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  engage,
  exhaustCharacter,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { engagedEnemies } from "./considered-engagement";
import { amonPlayerCanEngage } from "./amon-din-player-cards";
import { celebrimborProtected } from "./celebrimbor-support";
import { playerCardImmune } from "./card-immunity";
import { shadowFlameCanMove } from "./shadow-flame";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsEnemyEntered } from "./heirs-numenor";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { reduceThreat } from "./threat-reduction";
const HEIR = "phase:heir-valandil:";
export const REALM_ATTACKS_STARTED = "phase:normal-enemy-attacks";
const countEnemies = (s: GameState, p = activeSeat(s)) =>
  engagedEnemies(s, p).length;
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const movableEnemies = (s: GameState) =>
  enemies(s).filter(
    (u) =>
      !engagedEnemies(s).some((e) => e.id === u.id) &&
      !playerCardImmune(u) &&
      shadowFlameCanMove(s, u) &&
      !celebrimborProtected(s, u) &&
      amonPlayerCanEngage(s, u, activeSeat(s)),
  );
const canExhaust = (u: Unit) =>
  !u.exhausted &&
  !playerCardImmune(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
const trackers = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => canExhaust(u) && (hasTrait(u, "Scout") || hasTrait(u, "Ranger")),
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !playerCardImmune(u),
  );
const conditions = (u: Unit) =>
  u.attachments.filter(
    (a) =>
      !a.facedown &&
      attachmentHasTrait(a, "Condition") &&
      !/\bPermanent\b/i.test(card(a.code).text ?? ""),
  );
const athelasTargets = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      !playerCardImmune(u) &&
      (rhosgobelHealingAllowed(s, u) || conditions(u).length),
  );
export const realmHalbarad = (s: GameState) =>
  s.heroes.some((h) => h.code === "09002" && !h.blanked);
export const realmExtraEngagement = (s: GameState) =>
  realmHalbarad(s) && !s.used.includes("phase:halbarad-extra-engagement");
export const realmNoQuestExhaust = (s: GameState, u: Unit) =>
  u.code === "09002" && !u.blanked && countEnemies(s, ownerOf(s, u)) > 0;
export const realmWillProtected = (s: GameState, u: Unit) =>
  countEnemies(s, ownerOf(s, u)) > 0 &&
  u.attachments.some((a) => a.code === "09013" && !a.blanked && !a.facedown) &&
  !playerCardImmune(u);
export function realmWillBonus(s: GameState, u: Unit) {
  const n = countEnemies(s, ownerOf(s, u));
  return (
    (!u.blanked && u.code === "09006" ? n : 0) +
    (realmWillProtected(s, u) ? 1 : 0)
  );
}
export function realmDefensePenalty(s: GameState, u: Unit) {
  if (card(u.code).type_code !== "enemy" || playerCardImmune(u)) return 0;
  return allHeroes(s).filter(
    (h) =>
      h.code === "09001" &&
      !h.blanked &&
      engagedEnemies(s, ownerOf(s, h)).some((e) => e.id === u.id),
  ).length;
}
export const realmThreatPenalty = (u: Unit) =>
  playerCardImmune(u)
    ? 0
    : u.attachments.filter(
        (a) => a.code === "09012" && !a.blanked && !a.facedown,
      ).length;
export function realmPlayCost(s: GameState, c: Card, cost: number) {
  return c.type_code === "ally" && (c.traits ?? "").includes("Dúnedain")
    ? Math.max(
        0,
        cost -
          s.used
            .filter((k) => k.startsWith(HEIR))
            .reduce((n, k) => n + Number(k.slice(HEIR.length)), 0),
      )
    : cost;
}
export function realmAllyPlayed(s: GameState, u: Unit, played: boolean) {
  if (played && (card(u.code).traits ?? "").includes("Dúnedain"))
    s.used = s.used.filter((k) => !k.startsWith(HEIR));
}
export function realmPlayTargets(s: GameState, code: string): Unit[] | null {
  if (code === "09008") return movableEnemies(s);
  if (code === "09010")
    return allHeroes(s).filter(
      (h) => hasTrait(h, "Dúnedain") && !playerCardImmune(h),
    );
  if (code === "09011")
    return allCharacters(s).filter(
      (h) =>
        (hasTrait(h, "Dúnedain") || hasTrait(h, "Healer")) &&
        !playerCardImmune(h),
    );
  if (code === "09012")
    return enemies(s).filter(
      (u) =>
        !playerCardImmune(u) && !u.attachments.some((a) => a.code === code),
    );
  if (code === "09013")
    return allHeroes(s).filter(
      (h) =>
        (hasTrait(h, "Dúnedain") || hasTrait(h, "Noldor")) &&
        !playerCardImmune(h) &&
        !h.attachments.some((a) => a.code === code),
    );
  return null;
}
export function realmPlayProblem(s: GameState, code: string) {
  if (
    code === "09008" &&
    (s.phase !== "defense" ||
      !!s.combat ||
      playerOrder(s).some((p) =>
        seatView(s, p).used.includes(REALM_ATTACKS_STARTED),
      ))
  )
    return "Tireless Hunters must be played before normal enemy attacks begin.";
  return null;
}
export function realmEvent(s: GameState, code: string, target?: string) {
  if (code !== "09008") return false;
  const u = movableEnemies(s).find((u) => u.id === target);
  if (u) {
    prepend(
      s,
      fx("realmTirelessShadow", { target: u.id, player: activeSeat(s) }),
    );
    engage(s, u);
  }
  return true;
}
const canOfferTireless = (s: GameState) =>
  !realmPlayProblem(s, "09008") &&
  s.hand.some((u) => u.code === "09008") &&
  canPay(s, card("09008")) &&
  movableEnemies(s).length > 0;

/** Preserve the combat action window when the normal attack list is empty. */
export function realmEmptyCombatWindow(s: GameState) {
  if (
    playerOrder(s).some((p) =>
      seatView(s, p).used.includes("phase:tireless-opening-active"),
    )
  )
    return true;
  const players = playerOrder(s).filter((p) => {
    const view = seatView(s, p);
    return (
      !view.used.includes("phase:tireless-opening") && canOfferTireless(view)
    );
  });
  if (!players.length) return false;
  if (s.choice || s.queue.length) return true;
  for (const p of players)
    forOwner(s, p, () =>
      s.used.push("phase:tireless-opening", "phase:tireless-opening-active"),
    );
  prepend(
    s,
    ...players.map((player) => fx("realmOpening", { player })),
    fx("realmOpeningFinished"),
  );
  return true;
}
export function realmAllyEntered(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === "09003")
    prepend(
      s,
      fx("realmWatchmanOffer", { target: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === "09004")
    prepend(
      s,
      fx("realmHunterSearch", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function realmAttackKilled(s: GameState, ids: string[]) {
  for (const u of ids
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && u.code === "09001" && !u.blanked))
    prepend(
      s,
      fx("realmAragornOffer", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function realmEngagementResponse(s: GameState, u: Unit) {
  return fx("realmTrackersOffer", {
    value: card(u.code).threat ?? 0,
    player: activeSeat(s),
  });
}
export function realmEnemyDestroyed(
  s: GameState,
  u: Unit,
  attachments: Attachment[],
) {
  for (const a of attachments.filter(
    (a) => a.code === "09012" && !a.blanked && !a.facedown,
  )) {
    const player = attachmentController(s, u, a) ?? a.owner ?? activeSeat(s),
      owner = a.owner ?? player;
    prepend(
      s,
      fx("realmVigilOffer", {
        source: a.id,
        code: a.code,
        owner,
        player,
        value: seatView(s, owner).discard.lastIndexOf(a.code),
        count: card(u.code).threat ?? 0,
      }),
    );
  }
}
export const realmAbilityLabel = (code: string) =>
  code === "09010"
    ? "Exhaust Heir of Valandil · Reduce the next Dúnedain ally’s cost"
    : code === "09011"
      ? "Discard Athelas · Heal a character"
      : null;
export function realmAbilityProblem(s: GameState, u: Unit, id?: string) {
  const a = u.attachments.find((a) => a.id === id);
  if (
    !a ||
    a.blanked ||
    a.facedown ||
    attachmentController(s, u, a) !== activeSeat(s)
  )
    return "Choose an active attachment you control.";
  if (a.code === "09010")
    return s.phase !== "planning" || a.exhausted || !countEnemies(s)
      ? "Heir of Valandil needs an engaged enemy and a ready attachment in planning."
      : null;
  if (a.code === "09011")
    return !canExhaust(u) || !athelasTargets(s).length
      ? "Athelas needs a ready bearer and a character with damage or a Condition."
      : null;
  return "This attachment has no action.";
}
export function useRealmAbility(s: GameState, u: Unit, id?: string) {
  const a = u.attachments.find((a) => a.id === id);
  if (!a || !realmAbilityLabel(a.code)) return false;
  requireRule(
    !realmAbilityProblem(s, u, id),
    realmAbilityProblem(s, u, id) ?? "",
  );
  if (a.code === "09010") {
    a.exhausted = true;
    s.used.push(HEIR + countEnemies(s));
  } else
    choose(
      s,
      "Athelas · Choose a character",
      athelasTargets(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: name(h),
        effects: [
          fx("realmAthelas", {
            source: a.id,
            target: u.id,
            text: h.id,
            player: activeSeat(s),
          }),
        ],
      })),
    );
  return true;
}
export function realmEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("realm")) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "realmOpeningFinished":
      for (const p of playerOrder(s))
        forOwner(
          s,
          p,
          () =>
            (s.used = s.used.filter(
              (k) => k !== "phase:tireless-opening-active",
            )),
        );
      break;
    case "realmOpening":
      if (canOfferTireless(s))
        choose(s, "Before enemy attacks · Tireless Hunters", [
          {
            id: "play",
            code: "09008",
            label: "Play Tireless Hunters",
            effects: [fx("realmOpeningTarget")],
          },
          skip,
        ]);
      break;
    case "realmOpeningTarget":
      choose(s, "Tireless Hunters · Choose an enemy", [
        ...movableEnemies(s).map((enemy) => ({
          id: enemy.id,
          code: enemy.code,
          label: name(enemy),
          effects: [
            fx("eventPlay", {
              code: "09008",
              effects: [fx("realmOpeningEngage", { target: enemy.id })],
            }),
            fx("realmOpening"),
          ],
        })),
        skip,
      ]);
      break;
    case "realmOpeningEngage":
      realmEvent(s, "09008", e.target);
      break;
    case "realmWatchmanOffer":
      if (u && s.deck.length)
        choose(s, "Weather Hills Watchman", [
          {
            id: "search",
            label: "Search the top 5 cards for a Signal",
            effects: [fx("realmWatchmanSearch")],
          },
          skip,
        ]);
      break;
    case "realmWatchmanSearch":
      choose(s, "Weather Hills Watchman · Choose a Signal", [
        ...s.deck.slice(0, 5).flatMap((code, i) =>
          (card(code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Signal")
            ? [
                {
                  id: `card-${i}`,
                  code,
                  label: card(code).name,
                  effects: [fx("realmWatchmanTake", { code, value: i })],
                },
              ]
            : [],
        ),
        {
          id: "none",
          label: "Do not take a card · Shuffle the deck",
          effects: [fx("realmWatchmanTake")],
        },
      ]);
      break;
    case "realmWatchmanTake":
      if (
        e.code &&
        e.value !== undefined &&
        e.value < 5 &&
        s.deck[e.value] === e.code
      )
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "realmHunterSearch":
      if (u) {
        const options: Option[] = s.encounterDeck
          .slice(0, 5)
          .flatMap((code, i) =>
            card(code).type_code === "enemy" && !card(code).is_unique
              ? [
                  {
                    id: `enemy-${i}`,
                    code,
                    label: card(code).name,
                    effects: [
                      fx("realmHunterTake", { target: u.id, code, value: i }),
                    ],
                  },
                ]
              : [],
          );
        if (!options.length)
          options.push({
            id: "none",
            label: "Find no enemy · Discard Dúnedain Hunter",
            effects: [fx("realmHunterTake", { target: u.id })],
          });
        choose(
          s,
          "Dúnedain Hunter · Search the top 5 encounter cards",
          options,
        );
      }
      break;
    case "realmHunterTake": {
      const found =
        e.code &&
        e.value !== undefined &&
        e.value < 5 &&
        s.encounterDeck[e.value] === e.code;
      if (found) {
        s.encounterDeck.splice(e.value!, 1);
        const enemy = make(s, e.code!);
        s.staging.push(enemy);
        heirsEnemyEntered(s, enemy, false);
        engage(s, enemy);
      } else if (u) discardCharacter(s, u);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "realmAragornOffer":
      if (u && movableEnemies(s).length)
        choose(s, "Aragorn · Engage another enemy", [
          ...movableEnemies(s).map((enemy) => ({
            id: enemy.id,
            code: enemy.code,
            label: name(enemy),
            effects: [fx("engage", { target: enemy.id })],
          })),
          skip,
        ]);
      break;
    case "realmTirelessShadow":
      if (
        u &&
        engagedEnemies(s).some((enemy) => enemy.id === u.id) &&
        u.shadows.length
      )
        choose(
          s,
          "Tireless Hunters · Discard a shadow",
          u.shadows.map((code, i) => ({
            id: `shadow-${i}`,
            label: u.faceupShadows?.[i]
              ? `Discard ${card(code).name}`
              : `Discard facedown shadow ${i + 1}`,
            ...(u.faceupShadows?.[i] ? { code } : {}),
            effects: [fx("realmDiscardShadow", { target: u.id, value: i })],
          })),
        );
      break;
    case "realmDiscardShadow":
      if (u && e.value !== undefined) {
        const code = removeShadowCard(u, e.value);
        if (code) s.encounterDiscard.push(code);
      }
      break;
    case "realmTrackersOffer":
      if (
        (e.value ?? 0) > 0 &&
        s.hand.some((c) => c.code === "09009") &&
        canPay(s, card("09009")) &&
        trackers(s).length &&
        locations(s).length
      )
        choose(s, "Expert Trackers · After engaging an enemy", [
          {
            id: "play",
            code: "09009",
            label: "Play Expert Trackers",
            effects: [{ ...e, kind: "realmTrackersCharacter" }],
          },
          skip,
        ]);
      break;
    case "realmTrackersCharacter":
      choose(
        s,
        "Expert Trackers · Exhaust a Scout or Ranger",
        trackers(s).map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [{ ...e, kind: "realmTrackersLocation", target: h.id }],
        })),
      );
      break;
    case "realmTrackersLocation":
      if (u && trackers(s).some((h) => h.id === u.id))
        choose(
          s,
          "Expert Trackers · Choose a location",
          locations(s).map((l) => ({
            id: l.id,
            code: l.code,
            label: `${name(l)} · ${e.value} progress`,
            effects: [
              fx("eventPlay", {
                code: "09009",
                player: activeSeat(s),
                costEffects: [fx("realmTrackersExhaust", { target: u.id })],
                effects: [
                  fx("locationProgress", { target: l.id, value: e.value }),
                ],
              }),
              { ...e, kind: "realmTrackersOffer", target: undefined },
            ],
          })),
        );
      break;
    case "realmTrackersExhaust":
      requireRule(
        u && trackers(s).some((h) => h.id === u.id) && exhaustCharacter(s, u),
        "Exhaust an eligible Scout or Ranger to pay Expert Trackers’ cost.",
      );
      break;
    case "realmAthelas": {
      const a = u?.attachments.find((a) => a.id === e.source),
        target = get(s, e.text);
      requireRule(
        u &&
          a &&
          a.code === "09011" &&
          canExhaust(u) &&
          target &&
          athelasTargets(s).some((h) => h.id === target.id),
        "Athelas needs its ready bearer and an eligible character.",
      );
      discardAttachment(s, u, a);
      requireRule(exhaustCharacter(s, u), "Exhaust the bearer of Athelas.");
      prepend(
        s,
        fx("realmAthelasHeal", {
          target: target.id,
          source: a.id,
          owner: a.owner ?? activeSeat(s),
        }),
      );
      break;
    }
    case "realmAthelasHeal":
      if (u) {
        rhosgobelHeal(s, u, u.damage, {
          code: "09011",
          source: e.source,
          player: e.owner,
        });
        prepend(s, fx("realmAthelasCondition", { target: u.id }));
      }
      break;
    case "realmAthelasCondition":
      if (u && !playerCardImmune(u) && conditions(u).length)
        choose(s, "Athelas · You may discard a Condition", [
          ...conditions(u).map((a) => ({
            id: a.id,
            code: a.code,
            label: card(a.code).name,
            effects: [fx("discardAttachment", { target: u.id, source: a.id })],
          })),
          skip,
        ]);
      break;
    case "realmVigilOffer":
      if ((e.count ?? 0) > 0)
        choose(s, "Secret Vigil · Enemy destroyed", [
          {
            id: "reduce",
            code: e.code,
            label: `Reduce each player’s threat by ${e.count}`,
            effects: [{ ...e, kind: "realmVigilReduce" }],
          },
          skip,
        ]);
      break;
    case "realmVigilReduce":
      for (const player of playerOrder(s))
        forOwner(s, player, () =>
          reduceThreat(s, e.count ?? 0, {
            id: e.source,
            code: "09012",
            owner: e.owner,
            zone: "discard",
            index: e.value,
          }),
        );
      break;
    default:
      return false;
  }
  return true;
}
