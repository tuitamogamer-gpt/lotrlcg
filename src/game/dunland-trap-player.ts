import { cannotReady } from "./core";
// The Dunland Trap player cards; Celeborn, Naith Guide, Firefoot, Tree People
// and Blue Mountain Trader use the complete Silvan/Rohan/Collector implementations.
import { card, plain } from "./cards";
import type { Attachment, Effect, GameState, Unit } from "./types";
import {
  canGainResources,
  canPay,
  choose,
  draw,
  fx,
  get,
  opts,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  skip,
  stats,
} from "./core";
import {
  addVictoryCard,
  check,
  damage,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";

import { roadRivendellCannotCancel } from "./road-rivendell";
import { gondorResourcesGained } from "./gondor-player-cards";
import { returnPlayedEventToHand } from "./event-resolution";
import { applyCombatDamageConsequences } from "./combat";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";

const SWIFT = "round:swift-and-silent";
const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const readyTargets = (s: GameState) =>
  s.heroes.filter((u) => u.exhausted && !immune(u) && !cannotReady(u, s));
const resourceTargets = (s: GameState) =>
  s.heroes.filter((u) => !immune(u) && canGainResources(s, u));

export function dunlandPlayTargets(s: GameState, code: string): Unit[] | null {
  if (code === "08003") return readyTargets(s);
  if (code === "08007") return allHeroes(s).filter((u) => !immune(u));
  return null;
}
export function dunlandPlayProblem(s: GameState, code: string) {
  if (code === "08003" && !readyTargets(s).length)
    return "Swift and Silent needs an exhausted hero you control who can ready.";
  if (
    code === "08010" &&
    !playerOrder(s).some((p) => councilOptions(seatView(s, p)).size)
  )
    return "The White Council needs an option that can affect a player's fellowship.";
  return null;
}
/** Count plays, including canceled copies, separately from successful resolution. */
export function dunlandEventPlayed(s: GameState, code: string) {
  if (code === "08003") s.used.push(SWIFT);
}
export function dunlandEvent(s: GameState, code: string, target?: string) {
  if (code === "08003") {
    const hero = readyTargets(s).find((u) => u.id === target);
    if (hero) readyCharacter(s, hero);
    if (
      hero &&
      s.threat <= 20 &&
      s.used.filter((key) => key === SWIFT).length === 1
    )
      returnPlayedEventToHand(s, code);
    return true;
  }
  if (code === "08010") {
    prepend(
      s,
      fx("dunlandCouncilStep", { ids: playerOrder(s).map(String), text: "[]" }),
    );
    return true;
  }
  return false;
}

export function dunlandAllyEntered(s: GameState, u: Unit) {
  if (u.code === "08008" && !u.blanked && s.encounterDeck.length)
    prepend(
      s,
      fx("dunlandLookoutOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}

/** Use the departing attachments' snapshot to locate each physical discarded Song. */
export function dunlandFallResponses(
  s: GameState,
  hero: Unit,
  attachments: Attachment[],
  controller: number,
) {
  if (card(hero.code).type_code !== "hero") return;
  const effects: Effect[] = [];
  for (const a of attachments) {
    if (a.code !== "08007" || a.blanked || a.facedown) continue;
    const owner = a.owner ?? controller;
    const index = seatView(s, owner).discard.lastIndexOf(a.code);
    if (index >= 0)
      effects.push(
        fx("dunlandFallOffer", {
          source: a.id,
          code: hero.code,
          value: index,
          count: card(hero.code).threat ?? 0,
          owner,
          player: controller,
        }),
      );
  }
  prepend(s, ...effects);
}

function closeCopies(s: GameState, p: number) {
  const view = seatView(s, p);
  return canPay(view, card("08005"))
    ? view.hand.filter((u) => u.code === "08005")
    : [];
}
export function offerCloseCall(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    context.bypassCloseCall ||
    value <= 0 ||
    card(target.code).type_code !== "hero"
  )
    return false;
  if (
    !context.enemyId &&
    (roadRivendellCannotCancel(s) ||
      allActiveLocations(s).some((u) => u.code === "02016"))
  )
    return false;
  if (!playerOrder(s).some((p) => closeCopies(s, p).length)) return false;
  prepend(
    s,
    fx("dunlandCloseWindow", {
      target: target.id,
      value,
      text: encodeDamageContext(context),
      player: firstPlayer(s),
    }),
  );
  return true;
}
function resumeDamage(s: GameState, e: Effect) {
  const target = get(s, e.target);
  if (!target) return;
  const context = readDamageContext(e);
  // A fellowship eliminated by Doomed cannot resolve its event ability.
  const canceled =
    e.owner === undefined || !s.table?.seats[e.owner]?.eliminated
      ? (e.count ?? 0)
      : 0;
  const value = Math.max(0, (e.value ?? 0) - canceled);
  if (!value) {
    check(s);
    return;
  }
  const remaining = stats(s, target).health - target.damage;
  const enemy = get(s, context.enemyId);
  if (damage(s, target.id, value, context) && enemy && context.combatDamage)
    applyCombatDamageConsequences(s, target, enemy, value, remaining);
}

function councilOptions(s: GameState) {
  const options = new Set<string>();
  if (readyTargets(s).length) options.add("ready");
  if (resourceTargets(s).length) options.add("resource");
  if (
    s.deck.length &&
    !s.shackles &&
    !allActiveLocations(s).some((u) => u.code === "01095")
  )
    options.add("draw");
  if (s.discard.length) options.add("shuffle");
  return options;
}

export function dunlandEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "dunlandLookoutOffer": {
      const source = get(s, e.source);
      if (!source || source.blanked || !s.encounterDeck.length) return true;
      choose(s, "Ithilien Lookout · Look at the encounter deck", [
        {
          id: "look",
          label: "Look at the top encounter card",
          effects: [{ ...e, kind: "dunlandLookoutPeek" }],
        },
        skip,
      ]);
      return true;
    }
    case "dunlandLookoutPeek": {
      const code = s.encounterDeck[0];
      if (!code) return true;
      s.peek = code;
      choose(
        s,
        `Ithilien Lookout · ${card(code).name}`,
        [
          ...(card(code).type_code === "enemy"
            ? [
                {
                  id: "discard",
                  code,
                  label: "Discard this enemy",
                  effects: [
                    { ...e, kind: "dunlandLookoutFinish", code, flag: true },
                  ],
                },
              ]
            : []),
          {
            id: "keep",
            code,
            label: "Leave this card on top",
            effects: [{ ...e, kind: "dunlandLookoutFinish", code }],
          },
        ],
        plain(card(code).text),
      );
      return true;
    }
    case "dunlandLookoutFinish":
      requireRule(
        s.encounterDeck[0] === e.code,
        "The inspected card must remain on top.",
      );
      if (e.flag) {
        requireRule(
          card(e.code!).type_code === "enemy",
          "Only an enemy can be discarded.",
        );
        s.encounterDiscard.push(s.encounterDeck.shift()!);
      }
      s.peek = null;
      return true;
    case "dunlandFallOffer":
      if (seatView(s, e.owner!).discard[e.value!] !== "08007") return true;
      choose(s, "The Fall of Gil-Galad · Hero destroyed", [
        {
          id: "victory",
          code: "08007",
          label: `Add the Song to victory · reduce your threat by ${e.count}`,
          effects: [{ ...e, kind: "dunlandFallVictory" }],
        },
        skip,
      ]);
      return true;
    case "dunlandFallVictory":
      requireRule(
        seatView(s, e.owner!).discard[e.value!] === "08007",
        "The attached Song must remain in its owner's discard pile.",
      );
      forOwner(s, e.owner!, () => takePlayerDiscard(s, e.value!));
      addVictoryCard(s, "08007");
      s.threat = Math.max(0, s.threat - (e.count ?? 0));
      return true;
    case "dunlandCloseWindow": {
      if (!get(s, e.target)) return true;
      choose(s, `Close Call · ${e.value} damage to a hero`, [
        ...playerOrder(s).flatMap((p) =>
          closeCopies(s, p).map((u) => ({
            id: u.id,
            code: u.code,
            label: `Play Close Call · Player ${p + 1}`,
            effects: [
              { ...e, kind: "dunlandCloseAmount", source: u.id, player: p },
            ],
          })),
        ),
        {
          id: "skip",
          label: "Continue without Close Call",
          effects: [
            {
              ...e,
              kind: "dunlandCloseResume",
              text: encodeDamageContext({
                ...readDamageContext(e),
                bypassCloseCall: true,
              }),
            },
          ],
        },
      ]);
      return true;
    }
    case "dunlandCloseAmount":
      choose(
        s,
        "Close Call · Choose X",
        Array.from({ length: e.value ?? 0 }, (_, i) => ({
          id: `cancel-${i + 1}`,
          label: `Doomed ${i + 1} · cancel ${i + 1} damage`,
          effects: [{ ...e, kind: "dunlandClosePlay", count: i + 1 }],
        })),
      );
      return true;
    case "dunlandClosePlay": {
      requireRule(
        closeCopies(s, activeSeat(s)).some((u) => u.id === e.source) &&
          get(s, e.target) &&
          (e.count ?? 0) > 0 &&
          e.count! <= e.value!,
        "Choose the physical Close Call and damage amount.",
      );
      const resume = { ...e, kind: "dunlandCloseResume", owner: activeSeat(s) };
      prepend(
        s,
        fx("eventPlay", {
          code: "08005",
          source: e.source,
          value: e.count,
          effects: [resume],
          cancelledEffects: [{ ...resume, count: 0 }],
        }),
      );
      return true;
    }
    case "dunlandCloseResume":
      resumeDamage(s, e);
      return true;
    case "dunlandCouncilStep": {
      const remaining = (e.ids ?? [])
        .map(Number)
        .filter((p) => playerOrder(s).includes(p));
      if (!remaining.length) return true;
      const player = remaining.shift()!;
      selectSeat(s, player);
      const used = JSON.parse(e.text ?? "[]") as string[];
      const useful = councilOptions(s);
      const available = ["ready", "resource", "draw", "shuffle"].filter(
        (id) => !used.includes(id),
      );
      const choices = available.some((id) => useful.has(id))
        ? available.filter((id) => useful.has(id))
        : available;
      choose(
        s,
        `The White Council · Player ${player + 1}`,
        choices.map((id) => ({
          id,
          label: {
            ready: "Ready a hero",
            resource: "Add 1 resource to a hero",
            draw: "Draw 1 card",
            shuffle: "Shuffle a discarded card into your deck",
          }[id]!,
          effects: [
            fx("dunlandCouncilOption", { text: id, player }),
            fx("dunlandCouncilStep", {
              ids: remaining.map(String),
              text: JSON.stringify([...used, id]),
              player,
            }),
          ],
        })),
      );
      return true;
    }
    case "dunlandCouncilOption":
      if (e.text === "draw") draw(s, 1);
      else if (e.text === "shuffle") {
        if (s.discard.length)
          choose(
            s,
            "The White Council · Choose a discarded card",
            s.discard.map((code, index) => ({
              id: `discard-${index}`,
              code,
              label: card(code).name,
              effects: [
                fx("dunlandCouncilShuffle", {
                  value: index,
                  code,
                  player: activeSeat(s),
                }),
              ],
            })),
          );
      } else {
        const heroes =
          e.text === "ready" ? readyTargets(s) : resourceTargets(s);
        if (heroes.length)
          choose(
            s,
            `The White Council · ${e.text === "ready" ? "Ready" : "Resource"}`,
            opts(heroes, (u) => [
              fx("dunlandCouncilHero", {
                target: u.id,
                text: e.text,
                player: activeSeat(s),
              }),
            ]),
          );
      }
      return true;
    case "dunlandCouncilHero": {
      const targets = e.text === "ready" ? readyTargets(s) : resourceTargets(s);
      const hero = targets.find((h) => h.id === e.target);
      requireRule(hero, "Choose an eligible hero you control.");
      if (e.text === "ready") readyCharacter(s, hero);
      else {
        hero.resources++;
        gondorResourcesGained(s, hero, 1, true);
      }
      return true;
    }
    case "dunlandCouncilShuffle":
      requireRule(
        s.discard[e.value!] === e.code,
        "Choose the physical discarded card.",
      );
      putPlayerDeck(s, takePlayerDiscard(s, e.value!));
      shuffle(s, s.deck);
      return true;
    default:
      return false;
  }
}
