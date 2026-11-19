// The Dream-chaser campaign's A Storm on Cobas Haven (Part 8): Gavin, the
// four copies of Send for Help he shuffles into the encounter deck, and the
// additional phases the Spirit copy creates.
import type { Effect, GameState, Unit } from "./types";
import { card, name, playerCards } from "./cards";
import {
  canGainResources,
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  removeShadowCard,
  reorderPlayerDeck,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
  startPhase,
} from "./table";
import { beginResources, enterAlly } from "./board";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  needsTarget,
  playCardFromEffect,
} from "./actions";
import {
  DC,
  SEND_FOR_HELP,
  dcBase,
  dcIs,
  dcUpgraded,
  isDreamchaserGame,
} from "./dreamchaser-campaign-support";

const several = (s: GameState) => (s.table?.seats.length ?? 1) > 1;
const state = (s: GameState) => (s.dreamchaser ??= {});
const isHelp = (code: string) =>
  (SEND_FOR_HELP as readonly string[]).includes(dcBase(code));
const sphereOf = (code: string) =>
  ["leadership", "tactics", "spirit", "lore"][
    (SEND_FOR_HELP as readonly string[]).indexOf(dcBase(code))
  ];
const upgraded = (s: GameState, code: string) =>
  dcUpgraded(s.campaign, dcBase(code));
/** The players' heroes for Send for Help (Tactics): every hero card, one per title. */
const collectionHeroes = (s: GameState) => {
  const titles = new Set(allCharacters(s).map((u) => card(u.code).name));
  const seen = new Set<string>();
  return playerCards
    .filter((c) => c.type_code === "hero" && c.official !== false)
    .filter((c) => {
      if (titles.has(c.name) || seen.has(c.name)) return false;
      seen.add(c.name);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

// --------------------------------------------------------------- Gavin

/** "Put Gavin into play under any player's control." */
export const gavinPlacement = (s: GameState, committed = false): Effect =>
  fx("dcGavinPlace", {
    player: firstPlayer(s),
    ...(committed ? { flag: true } : {}),
  });
/** Gavin: "When Gavin leaves play (other than by his ability), remove him from the game." */
export const gavinRemoved = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) && dcIs(u, DC.gavin);
/** Send for Help (Tactics): the heroes it put into play are removed from the game. */
export const borrowedHeroRemoved = (s: GameState, u: Unit) =>
  isDreamchaserGame(s) && !!s.dreamchaser?.borrowed?.includes(u.id);
export const gavinLabel = (code: string) =>
  dcIs(code, DC.gavin)
    ? "Gavin · Planning Action: shuffle Gavin and a random set-aside Send for Help into the encounter deck"
    : undefined;
export function gavinProblem(s: GameState, u: Unit): string | null {
  if (ownerOf(s, u) !== activeSeat(s))
    return "Gavin is controlled by another player.";
  if (s.phase !== "planning")
    return "Use this Planning Action in the planning phase.";
  return null;
}
/** "Planning Action: Shuffle Gavin and 1 random set-aside Send for Help into the encounter deck." */
export function gavinAbility(s: GameState, u: Unit) {
  const q = state(s);
  const p = ownerOf(s, u);
  forOwner(s, p, () => (s.allies = s.allies.filter((x) => x.id !== u.id)));
  const aside = q.sendForHelp ?? [];
  const pick = aside.length
    ? aside[Math.floor(random(s) * aside.length)]
    : undefined;
  if (pick) q.sendForHelp = aside.filter((_, i) => i !== aside.indexOf(pick));
  s.encounterDeck.push(u.code, ...(pick ? [pick] : []));
  shuffle(s, s.encounterDeck);
  log(
    s,
    `Gavin${pick ? " and a random set-aside Send for Help are" : " is"} shuffled into the encounter deck.`,
    "good",
  );
}

// ------------------------------------------------------- Send for Help

/**
 * Gavin and Send for Help are revealed from the encounter deck without
 * entering the staging area. A cancelled Send for Help is still removed
 * from the game; a cancelled Gavin is discarded.
 */
export function cobasCardEntered(s: GameState, u: Unit, cancel: boolean) {
  if (!isDreamchaserGame(s) || (!dcIs(u, DC.gavin) && !isHelp(u.code)))
    return false;
  if (cancel) {
    if (dcIs(u, DC.gavin)) s.encounterDiscard.push(u.code);
    else log(s, "Send for Help is removed from the game.");
  }
  return true;
}
/** Gavin's and Send for Help's When Revealed effects. */
export function cobasCampaignEncounter(s: GameState, code: string) {
  if (!isDreamchaserGame(s)) return false;
  if (dcIs(code, DC.gavin)) {
    prepend(s, gavinPlacement(s, true));
    return true;
  }
  if (isHelp(code)) {
    prepend(s, fx("dcHelp", { code, player: firstPlayer(s) }));
    return true;
  }
  return false;
}
/** Send for Help: "Shadow: Resolve this card's when revealed effect." */
export function cobasCampaignShadow(s: GameState, code: string) {
  if (!isDreamchaserGame(s) || !isHelp(code)) return false;
  // "Remove Send for Help from the game": it leaves the attacking enemy.
  const enemy = get(s, s.combat?.enemyId);
  if (enemy) removeShadowCard(enemy, enemy.shadows.lastIndexOf(code));
  prepend(s, fx("dcHelp", { code, player: firstPlayer(s) }));
  return true;
}

// ------------------------------------------------- the additional phases

/** The effects that begin the next phase (or end the round). */
const PHASE_STARTS = [
  "startPlanning",
  "startQuest",
  "startTravel",
  "startEncounter",
  "startCombat",
  "refreshReady",
  "endRound",
];
const EXTRA_PHASES = ["resource", "planning", "combat", "refresh"] as const;
/** The effect that starts an additional phase. */
const extraStart = (phase: string): Effect =>
  phase === "resource"
    ? fx("dcExtraResource")
    : phase === "planning"
      ? fx("startPlanning", { text: "dc-extra" })
      : phase === "combat"
        ? fx("startCombat", { text: "skipped-encounter" })
        : fx("refreshReady", { text: "dc-extra" });
/**
 * Send for Help (Spirit): "After the current phase, there is an additional
 * instance of the chosen phase." The next phase waits until the additional
 * one ends.
 */
export function dreamchaserPhaseRedirect(s: GameState, e: Effect): boolean {
  const q = s.dreamchaser;
  if (!q || !PHASE_STARTS.includes(e.kind) || e.flag || e.text) return false;
  if (q.extraPhase) {
    const { resume, phase } = q.extraPhase;
    delete q.extraPhase;
    log(s, `Send for Help: the additional ${phase} phase ends.`, "good");
    prepend(s, resume);
    return true;
  }
  if (!q.extraPhases?.length) return false;
  const [phase, ...rest] = q.extraPhases;
  if (rest.length) q.extraPhases = rest;
  else delete q.extraPhases;
  q.extraPhase = { phase, resume: e };
  log(s, `Send for Help: an additional ${phase} phase begins.`, "good");
  prepend(s, extraStart(phase));
  return true;
}

// ------------------------------------------------------------- effects

export function dreamchaserCobasEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "dcGavinPlace": {
      const players = playerOrder(s);
      if (players.length <= 1) {
        prepend(
          s,
          fx("dcGavinTake", { player: players[0] ?? p, flag: e.flag }),
        );
        return true;
      }
      choose(
        s,
        "Gavin · Which player takes control of him?",
        players.map((x) => ({
          id: `seat-${x}`,
          label: seatName(s, x),
          code: DC.gavin,
          effects: [fx("dcGavinTake", { player: x, flag: e.flag })],
        })),
      );
      return true;
    }
    case "dcGavinTake": {
      const gavin = make(s, DC.gavin);
      gavin.owner = p;
      gavin.controller = p;
      // When Revealed: "… committed to the quest."
      if (e.flag && ["quest", "staging"].includes(s.phase))
        gavin.committed = true;
      forOwner(s, p, () => s.allies.push(gavin));
      log(
        s,
        `Gavin enters play under ${several(s) ? `${seatName(s, p)}'s` : "your"} control${gavin.committed ? ", committed to the quest" : ""}.`,
        "good",
      );
      if (e.flag) {
        // "Add 1 resource to Lanwyn's resource pool, if able."
        const lanwyn = allHeroes(s).find((h) => card(h.code).name === "Lanwyn");
        if (lanwyn && canGainResources(s, lanwyn)) {
          lanwyn.resources += 1;
          log(s, "Gavin: Lanwyn gains 1 resource.", "good");
        }
      }
      return true;
    }
    case "dcHelp": {
      const code = e.code!;
      const twice = upgraded(s, code);
      log(
        s,
        `Send for Help (${sphereOf(code)})${twice ? ", upgraded," : ""} is revealed; it is then removed from the game.`,
        "good",
      );
      const base = dcBase(code);
      if (base === SEND_FOR_HELP[0])
        prepend(
          s,
          ...Array.from({ length: twice ? 2 : 1 }, () =>
            fx("dcHelpSearcher", { player: p }),
          ),
        );
      else if (base === SEND_FOR_HELP[1])
        prepend(
          s,
          ...Array.from({ length: twice ? 2 : 1 }, () =>
            fx("dcHelpHero", { player: p }),
          ),
        );
      else if (base === SEND_FOR_HELP[2])
        prepend(
          s,
          fx("dcHelpPhase", { value: twice ? 2 : 1, ids: [], player: p }),
        );
      else prepend(s, fx("dcHelpGandalf", { flag: twice, player: p }));
      return true;
    }
    case "dcHelpSearcher": {
      // Leadership: "Choose a player to search the top 10 cards of their deck …"
      const players = playerOrder(s).filter((x) => seatView(s, x).deck.length);
      if (!players.length) return true;
      if (players.length === 1) {
        prepend(s, fx("dcHelpSearch", { player: players[0] }));
        return true;
      }
      choose(
        s,
        "Send for Help · Which player searches the top 10 cards of their deck?",
        players.map((x) => ({
          id: `seat-${x}`,
          label: seatName(s, x),
          effects: [fx("dcHelpSearch", { player: x })],
        })),
      );
      return true;
    }
    case "dcHelpSearch":
      forOwner(s, p, () => {
        const top = s.deck.slice(0, 10);
        if (!top.length) return;
        choose(
          s,
          `Send for Help · ${several(s) ? `${seatName(s, p)} searches` : "Search"} the top ${top.length} cards of ${several(s) ? "their" : "your"} deck`,
          [
            ...top.flatMap((code, i) => {
              const options = [
                {
                  id: `draw-${i}`,
                  code,
                  label: `Draw ${card(code).name}`,
                  effects: [
                    fx("dcHelpTake", { count: i, code, player: p }),
                    fx("dcHelpShuffle", { player: p }),
                  ],
                },
              ];
              if (
                !effectCardPlayProblem(s, make(s, code), { putIntoPlay: false })
              )
                options.push({
                  id: `play-${i}`,
                  code,
                  label: `Play ${card(code).name} at no cost`,
                  effects: [
                    fx("dcHelpTake", { count: i, code, flag: true, player: p }),
                    fx("dcHelpShuffle", { player: p }),
                  ],
                });
              return options;
            }),
            {
              id: "skip",
              label: "Take nothing · shuffle the deck",
              effects: [fx("dcHelpShuffle", { player: p })],
            },
          ],
        );
      });
      return true;
    case "dcHelpTake":
      forOwner(s, p, () => {
        const i = e.count ?? -1;
        if (s.deck[i] !== e.code) return;
        if (!e.flag) {
          s.hand.push(takePlayerDeck(s, i));
          log(s, `Send for Help: ${card(e.code!).name} is drawn.`, "good");
          return;
        }
        // "… or play it at no cost": the card is played from the top.
        reorderPlayerDeck(s, 0, [i, ...Array.from({ length: i }, (_, k) => k)]);
        const u = make(s, e.code!);
        if (needsTarget(u)) {
          const targets = effectCardPlayTargets(s, u, { putIntoPlay: false });
          if (!targets.length) return;
          choose(
            s,
            `Send for Help · ${card(e.code!).name}: choose a target`,
            targets.map((t) => ({
              id: t.id,
              code: t.code,
              label: name(t),
              effects: [
                fx("dcHelpPlay", { code: e.code, target: t.id, player: p }),
              ],
            })),
          );
        } else prepend(s, fx("dcHelpPlay", { code: e.code, player: p }));
      });
      return true;
    case "dcHelpPlay":
      forOwner(s, p, () => {
        if (s.deck[0] !== e.code) return;
        playCardFromEffect(s, make(s, e.code!), {
          putIntoPlay: false,
          ...(e.target ? { target: e.target } : {}),
        });
        log(
          s,
          `Send for Help: ${card(e.code!).name} is played at no cost.`,
          "good",
        );
      });
      return true;
    case "dcHelpShuffle":
      forOwner(s, p, () => shuffle(s, s.deck));
      return true;
    case "dcHelpHero": {
      // Tactics: "Search the players' collections for a hero and put it into
      // play under any player's control."
      const heroes = collectionHeroes(s);
      if (!heroes.length) return true;
      choose(
        s,
        "Send for Help · Choose a hero from the players' collections",
        heroes.map((c) => ({
          id: c.code,
          code: c.code,
          label: `${c.name}${c.sphere_code ? ` (${c.sphere_code})` : ""}`,
          effects: [fx("dcHelpHeroSeat", { code: c.code, player: p })],
        })),
        "At the end of the round, or if it leaves play, the hero is removed from the game.",
      );
      return true;
    }
    case "dcHelpHeroSeat": {
      const players = playerOrder(s);
      if (players.length <= 1) {
        prepend(
          s,
          fx("dcHelpHeroTake", { code: e.code, player: players[0] ?? p }),
        );
        return true;
      }
      choose(
        s,
        `Send for Help · Which player controls ${card(e.code!).name}?`,
        players.map((x) => ({
          id: `seat-${x}`,
          label: seatName(s, x),
          code: e.code,
          effects: [fx("dcHelpHeroTake", { code: e.code, player: x })],
        })),
      );
      return true;
    }
    case "dcHelpHeroTake": {
      const hero = make(s, e.code!);
      hero.owner = p;
      forOwner(s, p, () => s.heroes.push(hero));
      const q = state(s);
      q.borrowed = [...(q.borrowed ?? []), hero.id];
      log(
        s,
        `Send for Help: ${name(hero)} enters play under ${several(s) ? `${seatName(s, p)}'s` : "your"} control until the end of the round.`,
        "good",
      );
      return true;
    }
    case "dcHelpHeroGone": {
      const hero = get(s, e.target);
      const q = state(s);
      q.borrowed = (q.borrowed ?? []).filter((id) => id !== e.target);
      if (!q.borrowed.length) delete q.borrowed;
      if (!hero) return true;
      const owner = ownerOf(s, hero);
      forOwner(s, owner, () => {
        s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        s.removed.push(hero.code);
      });
      log(s, `Send for Help: ${name(hero)} is removed from the game.`);
      return true;
    }
    case "dcHelpPhase": {
      // Spirit: "Choose one: resource, planning, combat, or refresh. After the
      // current phase, there is an additional instance of the chosen phase."
      const left = e.value ?? 0;
      const chosen = (e.ids ?? []) as string[];
      if (left <= 0) {
        const q = state(s);
        q.extraPhases = [...(q.extraPhases ?? []), ...chosen];
        return true;
      }
      choose(
        s,
        `Send for Help · Choose an additional phase${left > 1 ? " (one of two)" : ""}`,
        [
          ...EXTRA_PHASES.filter((x) => !chosen.includes(x)).map((x) => ({
            id: x,
            label: `An additional ${x} phase after the current phase`,
            effects: [
              fx("dcHelpPhase", {
                value: left - 1,
                ids: [...chosen, x],
                player: p,
              }),
            ],
          })),
          ...(chosen.length
            ? [
                {
                  id: "skip",
                  label: "No second phase",
                  effects: [
                    fx("dcHelpPhase", { value: 0, ids: chosen, player: p }),
                  ],
                },
              ]
            : []),
        ],
      );
      return true;
    }
    case "dcExtraResource":
      startPhase(s, "resource");
      beginResources(s);
      return true;
    case "dcHelpGandalf": {
      // Lore: "Search the players' collections for Gandalf ally (Core Set 73)
      // and put him into play under any player's control, ignoring
      // uniqueness." Upgraded: "that player chooses up to 3 of Gandalf's
      // options instead of 1."
      const players = playerOrder(s);
      if (players.length <= 1) {
        prepend(
          s,
          fx("dcHelpGandalfTake", { player: players[0] ?? p, flag: e.flag }),
        );
        return true;
      }
      choose(
        s,
        "Send for Help · Which player controls Gandalf?",
        players.map((x) => ({
          id: `seat-${x}`,
          label: seatName(s, x),
          code: "01073",
          effects: [fx("dcHelpGandalfTake", { player: x, flag: e.flag })],
        })),
      );
      return true;
    }
    case "dcHelpGandalfTake":
      forOwner(s, p, () => {
        const gandalf = make(s, "01073");
        gandalf.owner = p;
        if (!e.flag) {
          enterAlly(s, gandalf);
          return;
        }
        s.allies.push(gandalf);
        prepend(
          s,
          fx("dcHelpGandalfPick", { source: gandalf.id, ids: [], player: p }),
        );
      });
      log(s, "Send for Help: Gandalf enters play.", "good");
      return true;
    case "dcHelpGandalfPick": {
      const used = (e.ids ?? []) as string[];
      if (used.length >= 3) return true;
      const enemies = [
        ...s.staging,
        ...seatIndices(s).flatMap((x) => seatView(s, x).engaged),
      ].filter((u) => ["enemy", "ship-enemy"].includes(card(u.code).type_code));
      const options = [
        ...(used.includes("draw")
          ? []
          : [
              {
                id: "draw",
                label: "Draw 3 cards",
                effects: [
                  fx("draw", { value: 3, player: p }),
                  fx("dcHelpGandalfPick", {
                    source: e.source,
                    ids: [...used, "draw"],
                    player: p,
                  }),
                ],
              },
            ]),
        ...(used.includes("threat")
          ? []
          : [
              {
                id: "threat",
                label: "Reduce your threat by 5",
                effects: [
                  fx("threat", {
                    value: -5,
                    source: e.source,
                    code: "01073",
                    player: p,
                  }),
                  fx("dcHelpGandalfPick", {
                    source: e.source,
                    ids: [...used, "threat"],
                    player: p,
                  }),
                ],
              },
            ]),
        ...(used.includes("damage")
          ? []
          : enemies.map((u) => ({
              id: `damage-${u.id}`,
              code: u.code,
              label: `Deal 4 damage to ${name(u)}`,
              effects: [
                fx("damage", { target: u.id, value: 4, player: p }),
                fx("dcHelpGandalfPick", {
                  source: e.source,
                  ids: [...used, "damage"],
                  player: p,
                }),
              ],
            }))),
      ];
      if (!options.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Gandalf · Choose up to 3 options (${3 - used.length} left)`,
          [...options, { id: "skip", label: "Done", effects: [] }],
        ),
      );
      return true;
    }
    default:
      return false;
  }
}
/** Send for Help (Tactics): its heroes leave at the end of the round. */
export const cobasRoundEnd = (s: GameState): Effect[] =>
  (s.dreamchaser?.borrowed ?? []).map((id) =>
    fx("dcHelpHeroGone", { target: id }),
  );
