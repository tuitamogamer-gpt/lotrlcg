import { currentQuestCode } from "./quest-state";
// Original The Redhorn Gate and its shared Misty Mountains encounter set.
import encounters from "../data/redhorn-gate-encounter-cards.json";
import quests from "../data/redhorn-gate-quest-cards.json";
import { card, name } from "./cards";
import type { Card, Effect, GameState, Unit } from "./types";
import {
  choose,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  shuffle,
  spendResources,
  skip,
  stats,
  units,
} from "./core";
import {
  questDefeated,
  check,
  charactersCommitted,
  damage,
  discardAttachment,
  discardCharacter,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  win,
} from "./board";
import {
  allActiveLocations,
  allCharacters,
  allHeroes,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";

export const REDHORN_ENCOUNTERS = encounters as Card[];
export const REDHORN_QUESTS = quests as Card[];
export const REDHORN = Object.fromEntries(
  [
    ["up", "Up the Pass"],
    ["drifts", "Snowdrifts"],
    ["peaks", "The Mountains' Peaks"],
    ["arwen", "Arwen Undómiel"],
    ["caradhras", "Caradhras"],
    ["avalanche", "Avalanche!"],
    ["celebdil", "Celebdil"],
    ["stones", "Fallen Stones"],
    ["fanuidhol", "Fanuidhol"],
    ["voices", "Fell Voices"],
    ["cold", "Freezing Cold"],
    ["goblin", "Mountain Goblin"],
    ["troll", "Mountain Troll"],
    ["crags", "Rocky Crags"],
    ["warg", "Snow Warg"],
    ["stair", "The Dimrill Stair"],
    ["snowstorm", "Snowstorm"],
  ].map(([key, title]) => [
    key,
    [...REDHORN_ENCOUNTERS, ...REDHORN_QUESTS].find((c) => c.name === title)!
      .code,
  ]),
) as Record<
  | "up"
  | "drifts"
  | "peaks"
  | "arwen"
  | "caradhras"
  | "avalanche"
  | "celebdil"
  | "stones"
  | "fanuidhol"
  | "voices"
  | "cold"
  | "goblin"
  | "troll"
  | "crags"
  | "warg"
  | "stair"
  | "snowstorm",
  string
>;
const isRedhorn = (s: GameState) => s.scenarioId === "redhorn-gate";
const state = (s: GameState) => (s.redhorn ??= { setAside: [], snowstorms: 0 });
const active = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => l.code === code);
const arwen = (s: GameState) =>
  allCharacters(s).find((u) => u.code === REDHORN.arwen);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
const unblankedCold = (u: Unit) =>
  u.attachments.filter((a) => a.code === REDHORN.cold && !a.blanked).length;

export function setupRedhorn(s: GameState) {
  const r = state(s);
  r.setAside = s.encounterDeck.filter((c) => c === REDHORN.snowstorm);
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![REDHORN.snowstorm, REDHORN.arwen, REDHORN.caradhras].includes(c),
  );
  placeEncounter(s, REDHORN.caradhras, true);
  const first = s.table?.first ?? 0,
    a = make(s, REDHORN.arwen);
  forOwner(s, first, () => s.allies.push(a));
  shuffle(s, s.encounterDeck);
  enqueue(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
}
export function redhornCheck(s: GameState) {
  if (!isRedhorn(s) || !s.redhorn || s.status !== "playing") return;
  const a = arwen(s);
  if (!a) {
    lose(s, "Arwen Undómiel has left play. The escort has failed.");
    return;
  }
  const controller = ownerOf(s, a),
    p = seatView(s, controller);
  if (
    s.table?.seats[controller].eliminated ||
    p.threat >= 50 ||
    !p.heroes.length
  ) {
    lose(s, "Arwen Undómiel's controlling fellowship has been eliminated.");
    return;
  }
  const discarded = allCharacters(s).find(
    (u) =>
      unblankedCold(u) > 1 ||
      (s.stage === 3 && stats(s, u).will === 0) ||
      (state(s).snowShadowIds?.includes(u.id) && stats(s, u).will === 0),
  );
  if (discarded) discardCharacter(s, discarded);
}
export function redhornFollowFirstPlayer(s: GameState) {
  if (!isRedhorn(s) || !s.table || s.status !== "playing") return;
  const a = arwen(s);
  if (!a) return;
  const from = ownerOf(s, a),
    to = s.table.first;
  if (from === to) return;
  forOwner(s, from, () => (s.allies = s.allies.filter((u) => u.id !== a.id)));
  forOwner(s, to, () => s.allies.push(a));
  log(s, `Arwen follows the first player: ${seatName(s, to)}.`);
}
export function redhornCharacterExhausted(s: GameState, u: Unit) {
  if (u.code !== REDHORN.arwen || u.blanked) return;
  prepend(s, fx("redhornArwenResponse", { player: ownerOf(s, u) }));
}
export function redhornStatBonus(s: GameState, u: Unit) {
  return {
    will:
      -2 * unblankedCold(u) -
      (u.committed ? (stateIfPresent(s)?.snowstorms ?? 0) : 0) -
      (u.committed && active(s, REDHORN.caradhras) ? 1 : 0),
    attack: [REDHORN.goblin, REDHORN.troll].includes(u.code)
      ? s.staging.filter(
          (l) =>
            card(l.code).type_code === "location" && hasTrait(l, "Mountain"),
        ).length
      : 0,
  };
}
const stateIfPresent = (s: GameState) => s.redhorn;
export const redhornWillCounts = (s: GameState, u: Unit) =>
  !active(s, REDHORN.fanuidhol) ||
  card(u.code).type_code !== "hero" ||
  !!s.redhorn?.fanuidholPaid?.includes(u.id);
export const redhornCanCommit = (u: Unit) => !unblankedCold(u);
export const redhornCanDefend = (enemy: Unit, u: Unit) =>
  enemy.code !== REDHORN.warg || card(u.code).type_code === "hero";
export function redhornDefendersDeclared(
  s: GameState,
  enemy: Unit,
  ids: string[],
) {
  if (enemy.code !== REDHORN.warg) return;
  // Snow Warg is Forced, preceding optional declaration responses.
  for (const id of ids) damage(s, id, 1);
}
export function redhornBeforeQuestResolution(s: GameState) {
  if (!active(s, REDHORN.fanuidhol) || state(s).fanuidholResolved) return false;
  state(s).fanuidholResolved = true;
  prepend(
    s,
    ...allHeroes(s)
      .filter((h) => h.committed)
      .map((h) =>
        fx("redhornFanuidhol", { target: h.id, player: ownerOf(s, h) }),
      ),
  );
  return s.queue.length > 0;
}
export function redhornPhaseEnd(s: GameState) {
  if (!s.redhorn) return;
  s.redhorn.snowstorms = 0;
  delete s.redhorn.fanuidholPaid;
  delete s.redhorn.fanuidholResolved;
  delete s.redhorn.snowShadowIds;
}
export function redhornRoundEnd(s: GameState) {
  for (const l of allActiveLocations(s).filter(
    (l) => l.code === REDHORN.celebdil,
  ))
    l.progress = Math.max(0, l.progress - 2);
}
export const redhornCanMakeActive = (u: Unit, questEffect = false) =>
  u.code !== REDHORN.caradhras || questEffect;
export function redhornTravelProblem(s: GameState, u: Unit) {
  if (u.code === REDHORN.caradhras)
    return "Only a quest-card effect can make Caradhras active.";
  if (
    u.code === REDHORN.crags &&
    !livingSeats(s).every(
      (p) => [...seatView(s, p).heroes, ...seatView(s, p).allies].length,
    )
  )
    return "Each player must have a character to take two damage.";
  return null;
}
export function redhornTravelCost(s: GameState, u: Unit) {
  if (u.code === REDHORN.crags) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("redhornCragsCost", { player })),
      fx("travelEnter", { target: u.id, player: s.table?.first ?? 0 }),
    );
    return true;
  }
  if (u.code === REDHORN.stair) {
    prepend(
      s,
      fx("redhornDimrillTravel"),
      fx("travelEnter", { target: u.id, player: s.table?.first ?? 0 }),
    );
    return true;
  }
  return false;
}
export function advanceRedhorn(s: GameState) {
  if (!isRedhorn(s)) return false;
  if (
    s.status !== "playing" ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.stage === 1 && s.progress >= 9) {
    if (questDefeated(s, currentQuestCode(s)!)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("redhornSnowdriftsReveal"), fx("redhornStageReady"));
  } else if (s.stage === 2 && s.progress >= 11) {
    s.stageRevealing = true;
    prepend(
      s,
      fx("redhornSnowdriftsForced", { count: Math.max(0, s.progress - 11) }),
    );
  } else if (s.stage === 3 && s.progress >= 13 && s.victory >= 5) win(s);
  return true;
}
export function redhornEncounter(s: GameState, code: string) {
  const first = s.table?.first ?? 0;
  switch (code) {
    case REDHORN.avalanche: {
      const ready = allCharacters(s).filter(
        (u) => !u.exhausted && !khazadCannotExhaust(u),
      );
      const committed: Unit[] = [];
      for (const u of ready) {
        exhaustCharacter(s, u);
        if (["quest", "staging"].includes(s.phase) && !u.committed) {
          u.committed = true;
          committed.push(u);
        }
      }
      if (committed.length)
        charactersCommitted(
          s,
          committed,
          committed.map((u) => u.id),
        );
      break;
    }
    case REDHORN.stones:
      prepend(s, fx("redhornFallenStones", { player: first }));
      break;
    case REDHORN.voices: {
      const found = [...s.encounterDiscard]
        .reverse()
        .filter((c) => (card(c).traits ?? "").split(/[.\s]+/).includes("Snow"))
        .slice(0, 2);
      for (const c of found) {
        const index = s.encounterDiscard.lastIndexOf(c);
        s.encounterDiscard.splice(index, 1);
      }
      prepend(
        s,
        fx("redhornVoicesOrder", {
          ids: found,
          flag:
            found.filter((c) => card(c).type_code === "treachery").length < 2,
        }),
      );
      break;
    }
    case REDHORN.cold:
      prepend(s, fx("redhornCold", { player: first }));
      return true;
    case REDHORN.snowstorm:
      state(s).snowstorms++;
      break;
    default:
      return (
        REDHORN_ENCOUNTERS.some((c) => c.code === code) &&
        card(code).type_code !== "treachery"
      );
  }
  s.encounterDiscard.push(code);
  return true;
}
export function redhornShadow(s: GameState, code: string) {
  if (!s.combat) return false;
  if ([REDHORN.stones, REDHORN.crags].includes(code))
    prepend(
      s,
      fx("redhornActiveProgressAttack", { player: s.table?.first ?? 0 }),
    );
  else if ([REDHORN.goblin, REDHORN.troll].includes(code))
    s.combat.attackBonus += allActiveLocations(s).some((l) =>
      hasTrait(l, "Mountain"),
    )
      ? 2
      : 1;
  else if (code === REDHORN.snowstorm) {
    const defenders = (
      s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : [])
    )
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u);
    for (const u of defenders) u.tempWill = (u.tempWill ?? 0) - 1;
    state(s).snowShadowIds = [
      ...new Set([
        ...(state(s).snowShadowIds ?? []),
        ...defenders.map((u) => u.id),
      ]),
    ];
    redhornCheck(s);
  } else return false;
  return true;
}
function removeVictoryLocation(s: GameState, code: string) {
  const index = s.victoryCards?.indexOf(code) ?? -1;
  if (index < 0) return false;
  s.victoryCards!.splice(index, 1);
  s.victory = Math.max(0, s.victory - (card(code).victory ?? 0));
  const kdIndex = s.khazad?.victoryCards.indexOf(code) ?? -1;
  if (kdIndex >= 0) s.khazad!.victoryCards.splice(kdIndex, 1);
  return true;
}
function discardLocation(s: GameState, u: Unit) {
  removeActiveLocation(s, u.id);
  s.staging = s.staging.filter((l) => l.id !== u.id);
  s.encounterDiscard.push(u.code);
  for (const a of [...u.attachments]) discardAttachment(s, u, a);
}
export function redhornEffect(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "redhornArwenResponse":
      choose(s, "Arwen Undómiel · Add a resource?", [
        ...opts(
          allHeroes(s).filter((h) => !isSacked(h)),
          (h) => [fx("resource", { target: h.id, value: 1 })],
        ),
        skip,
      ]);
      break;
    case "redhornFanuidhol":
      if (u && u.resources && !isSacked(u))
        choose(s, `Fanuidhol · Count ${name(u)}'s willpower?`, [
          {
            id: "pay",
            label: "Spend one resource from this hero",
            code: u.code,
            effects: [fx("redhornFanuidholPay", { target: u.id })],
          },
          skip,
        ]);
      break;
    case "redhornFanuidholPay":
      if (u && u.resources) {
        spendResources(s, u, 1);
        state(s).fanuidholPaid = [...(state(s).fanuidholPaid ?? []), u.id];
      }
      break;
    case "redhornStageReady":
      s.stageRevealing = false;
      check(s);
      break;
    case "redhornSnowdriftsReveal": {
      const snow = state(s).setAside.splice(0, livingSeats(s).length + 1);
      s.encounterDeck.push(...snow);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "redhornSnowdriftsForced": {
      const locations = allActiveLocations(s);
      if (locations.length > 1)
        choose(
          s,
          "Snowdrifts · Discard one active location",
          opts(locations, (l) => [
            fx("redhornSnowdriftsLocation", { target: l.id, count: e.count }),
          ]),
        );
      else
        prepend(
          s,
          fx("redhornSnowdriftsLocation", {
            target: locations[0]?.id,
            count: e.count,
          }),
        );
      break;
    }
    case "redhornSnowdriftsLocation": {
      if (u) discardLocation(s, u);
      let caradhras = s.staging.find((l) => l.code === REDHORN.caradhras);
      if (caradhras)
        s.staging = s.staging.filter((l) => l.id !== caradhras!.id);
      else {
        removeVictoryLocation(s, REDHORN.caradhras);
        const index = s.encounterDiscard.indexOf(REDHORN.caradhras);
        if (index >= 0) s.encounterDiscard.splice(index, 1);
        caradhras = make(s, REDHORN.caradhras);
      }
      if (!s.activeLocation) s.activeLocation = caradhras;
      else (s.extraActiveLocations ??= []).push(caradhras);
      // The forced buffer is created after the eleventh token. Surplus can fill
      // this buffer, but quest progress never carries onto the next quest card.
      const remainder = Math.min(
        e.count ?? 0,
        Math.max(0, (card(caradhras.code).quest ?? 0) - caradhras.progress),
      );
      if (remainder) progressLocation(s, caradhras, remainder);
      prepend(s, fx("redhornSnowdriftsComplete"));
      break;
    }
    case "redhornSnowdriftsComplete": {
      if (questDefeated(s, currentQuestCode(s)!)) {
        enqueue(s, fx(e.kind));
        break;
      }
      s.stage = 3;
      s.progress = 0;
      const snow = s.encounterDiscard.filter((c) => c === REDHORN.snowstorm);
      s.encounterDiscard = s.encounterDiscard.filter(
        (c) => c !== REDHORN.snowstorm,
      );
      s.encounterDeck.push(...snow);
      shuffle(s, s.encounterDeck);
      prepend(s, fx("redhornStageReady"));
      redhornCheck(s);
      break;
    }
    case "redhornFallenStones":
      choose(s, "Fallen Stones · Clear progress or reveal two cards", [
        {
          id: "remove",
          label: "Remove all progress tokens from play",
          effects: [fx("redhornRemoveProgress")],
        },
        {
          id: "reveal",
          label: "Reveal two encounter cards",
          effects: [fx("reveal"), fx("reveal")],
        },
      ]);
      break;
    case "redhornRemoveProgress":
      s.progress = 0;
      for (const u of units(s)) u.progress = 0;
      break;
    case "redhornVoicesOrder": {
      const found = e.ids ?? [];
      if (found.length === 2 && found[0] !== found[1])
        choose(
          s,
          "Fell Voices · Choose the top card",
          found.map((code, index) => ({
            id: String(index),
            label: card(code).name,
            code,
            effects: [
              fx("redhornVoicesPutTop", {
                ids: [code, found[1 - index]],
                flag: e.flag,
              }),
            ],
          })),
        );
      else prepend(s, fx("redhornVoicesPutTop", { ids: found, flag: e.flag }));
      break;
    }
    case "redhornVoicesPutTop":
      s.encounterDeck.unshift(...(e.ids ?? []));
      if (e.flag) prepend(s, fx("reveal"));
      break;
    case "redhornCold":
      choose(
        s,
        "Freezing Cold · Attach to a hero",
        opts(s.heroes, (h) => [fx("redhornColdAttach", { target: h.id })]),
      );
      if (!s.choice) s.encounterDiscard.push(REDHORN.cold);
      break;
    case "redhornColdAttach":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: REDHORN.cold,
          exhausted: false,
        });
        redhornCheck(s);
      }
      break;
    case "redhornCragsCost":
      choose(
        s,
        "Rocky Crags · Deal two damage to a character",
        opts([...s.heroes, ...s.allies], (h) => [
          fx("damage", { target: h.id, value: 2 }),
        ]),
      );
      break;
    case "redhornDimrillTravel": {
      const locations = s.encounterDiscard.filter(
          (c) => card(c).type_code === "location",
        ),
        victory = (s.victoryCards ?? []).filter(
          (c) => card(c).type_code === "location",
        );
      s.encounterDiscard = s.encounterDiscard.filter(
        (c) => card(c).type_code !== "location",
      );
      for (const c of victory) removeVictoryLocation(s, c);
      s.encounterDeck.push(...locations, ...victory);
      shuffle(s, s.encounterDeck);
      if (locations.length + victory.length >= 2) {
        for (const p of playerOrder(s))
          forOwner(s, p, () => (s.threat = Math.max(0, s.threat - 11)));
        for (const h of allCharacters(s))
          for (const a of [...h.attachments])
            if (a.code === REDHORN.cold) discardAttachment(s, h, a);
      }
      break;
    }
    case "redhornActiveProgressAttack": {
      const locations = allActiveLocations(s);
      if (locations.length > 1)
        choose(
          s,
          "Fallen Stones · Choose the active location",
          opts(locations, (l) => [
            fx("redhornLocationAttack", { target: l.id }),
          ]),
        );
      else if (locations[0] && s.combat)
        s.combat.attackBonus += locations[0].progress;
      break;
    }
    case "redhornLocationAttack":
      if (u && s.combat) s.combat.attackBonus += u.progress;
      break;
    default:
      return false;
  }
  return true;
}
