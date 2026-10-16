import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, name, plain } from "./cards";
import {
  canGainResources,
  canPay,
  cannotReady,
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  skip,
  takePlayerDeck,
} from "./core";
import {
  discardCharacter,
  discardLocation,
  exhaustCharacter,
  progressLocation,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allCharacters,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { isSacked } from "./carrock";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { mainQuestCode } from "./quest-state";
import { morgulCannotLeave } from "./morgul-vale";
import { resolveDoomed } from "./voice-isengard";
import { stewardFearLocationEntered } from "./steward-fear";
import { amonDinLocationEntered } from "./amon-din";
import { watcherPlayerLocationEntered } from "./watcher-player-cards";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { RACE_HARAD_PLAYER as P } from "./race-harad-player-support";

const STEWARD_LIMIT = "round:race-harad:steward";
const usable = (u: Unit) => !u.blanked && !isSacked(u);
const tribesmanTargets = (s: GameState, source: Unit) =>
  allCharacters(s).filter(
    (u) => u.id !== source.id && hasTrait(u, "Harad") && !playerEffectImmune(s, u, P.tribesman),
  );
const canReadyHero = (s: GameState, u: Unit) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !drownedCannotReady(s) &&
  !desertCrossingCannotPlayerReady(s) &&
  !playerEffectImmune(s, u, P.steed);
const currentSteed = (u: Unit, id: string | undefined) =>
  u.attachments.find(
    (a) => a.id === id && a.code === P.steed && !a.blanked && !a.facedown && !a.exhausted,
  );
const stagingLocations = (s: GameState, source: string) =>
  s.staging.filter(
    (u) => card(u.code).type_code === "location" && !playerEffectImmune(s, u, source),
  );
const settlers = (s: GameState, player = activeSeat(s)) =>
  seatView(s, player).allies.filter(
    (u) => u.code === P.settler && usable(u) && !morgulCannotLeave(s, u) && !playerEffectImmune(s, u, P.settler),
  );
const stewards = (s: GameState, player = activeSeat(s)) =>
  seatView(s, player).allies.filter((u) => u.code === P.steward && usable(u));
const sameTitle = (s: GameState, code: string) =>
  stagingLocations(s, P.settler).filter((u) => card(u.code).name === card(code).name);

export function raceHaradPlayerSetup(s: GameState) {
  const effects = playerOrder(s).flatMap((player) =>
      seatView(s, player).heroes
        .filter((u) => u.code === P.thurindir && usable(u))
        .map((u) => fx("raceHaradPlayerThurindirSearch", { source: u.id, player })),
    );
  if (!effects.length) return false;
  prepend(s, ...effects);
  return true;
}

export const raceHaradPlayerAbilityLabel = (code: string) =>
  code === P.tribesman
    ? "Exhaust Kahliel's Tribesman · Another Harad character gets +1 willpower, attack and defense this phase"
    : undefined;

export function raceHaradPlayerAbilityProblem(s: GameState, u: Unit) {
  if (u.code !== P.tribesman) return null;
  if (!usable(u) || ownerOf(s, u) !== activeSeat(s) || !s.allies.some((a) => a.id === u.id))
    return "Kahliel's Tribesman must be an ally you control with active text.";
  if (u.exhausted || khazadCannotExhaust(u) || watcherWaterCannotExhaust(u)) return "Kahliel's Tribesman must be ready and able to exhaust.";
  if (!tribesmanTargets(s, u).length) return "Choose another Harad character that can receive the bonus.";
  return null;
}

export function useRaceHaradPlayerAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId || u.code !== P.tribesman) return false;
  const problem = raceHaradPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  choose(s, "Kahliel's Tribesman · Choose another Harad character", tribesmanTargets(s, u).map((target) => ({
    id: target.id,
    code: target.code,
    label: `Give ${name(target)} +1 willpower, attack and defense this phase`,
    effects: [fx("raceHaradPlayerTribesmanUse", { source: u.id, target: target.id })],
  })));
  return true;
}

/** The restriction concerns the main quest even while a side quest is selected. */
export function raceHaradMainQuestHasKeywords(s: GameState) {
  const code = mainQuestCode(s);
  if (!code) return true;
  const c = card(code);
  const text = plain(c.back_text ?? c.text);
  return /(?:^|[.\n]\s*)(?:Battle|Siege|Sailing|Surge|Peril|Indestructible|Guarded(?:\s*\([^)]*\))?|Doomed\s+(?:\d+|X)|Time\s+(?:\d+|X)|Hide\s+(?:\d+|X))(?:[.\s]|$)/i.test(text);
}
export function raceHaradPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.hunters) return "Proud Hunters responds after your hero's attack destroys an enemy.";
  if (u.code === P.backtrack) {
    if (raceHaradMainQuestHasKeywords(s)) return "Backtrack requires a main quest with no keywords.";
    if (s.progress < 1) return "Backtrack needs progress on the main quest to move.";
    if (!stagingLocations(s, P.backtrack).length) return "Backtrack needs a location in staging that can receive progress.";
  }
  return null;
}
export function raceHaradPlayerEvent(s: GameState, code: string, _target?: string) {
  if (code !== P.backtrack) return false;
  requireRule(!raceHaradMainQuestHasKeywords(s), "The main quest must have no keywords.");
  choose(s, "Backtrack · Choose a staging location", stagingLocations(s, code).map((u) => ({
    id: u.id,
    code: u.code,
    label: name(u),
    effects: [fx("raceHaradPlayerBacktrackAmount", { target: u.id })],
  })));
  return true;
}

export function raceHaradPlayerEnemyEngaged(s: GameState, _enemy: Unit, player: number) {
  prepend(s, ...allCharacters(s).flatMap((host) =>
    host.attachments.filter((a) =>
      a.code === P.steed && !a.blanked && !a.facedown && !a.exhausted &&
      attachmentController(s, host, a) === player && canReadyHero(s, host),
    ).map((a) => fx("raceHaradPlayerSteedOffer", { source: a.id, target: host.id, player })),
  ));
}

export function raceHaradProudHuntersCondition(s: GameState, player = activeSeat(s)) {
  const own = allCharacters(s).filter((u) => ownerOf(s, u) === player && card(u.code).is_unique);
  return own.some((noble) => hasTrait(noble, "Noble") &&
    own.some((ranger) => ranger.id !== noble.id && hasTrait(ranger, "Ranger")));
}
export function raceHaradPlayerAttackKilled(s: GameState, enemy: Unit, ids: string[]) {
  prepend(s, ...playerOrder(s).flatMap((player) => {
    const p = seatView(s, player);
    const heroes = p.heroes.filter((u) => ids.includes(u.id) && canGainResources(s, u));
    if (!heroes.length || !raceHaradProudHuntersCondition(s, player) || !(card(enemy.code).threat! > 0)) return [];
    return p.hand.filter((u) => u.code === P.hunters && canPay(p, card(u.code))).map((u) =>
      fx("raceHaradPlayerHuntersOffer", { source: u.id, ids: heroes.map((h) => h.id), value: card(enemy.code).threat ?? 0, player }));
  }));
}

export function raceHaradPlayerAllyEntered(s: GameState, u: Unit, played: boolean, fromHand: boolean) {
  if (u.code !== P.pathfinder || !usable(u)) return false;
  prepend(s,
    fx("raceHaradPlayerPathfinderSearch", { source: u.id, player: ownerOf(s, u) }),
    fx("allyEntryResponses", { target: u.id, flag: played, value: fromHand ? 1 : 0, text: "desert-race-resolved", player: ownerOf(s, u) }),
  );
  return true;
}
export function raceHaradPlayerAttachmentPlayed(s: GameState, host: Unit, a: Attachment, played: boolean, fromHand: boolean) {
  const player = attachmentController(s, host, a);
  // The host's controller controls the attachment. A different player having
  // played it does not satisfy that controller's "after you play" condition.
  if (a.code === P.warrior && !a.blanked && !a.facedown && played && fromHand && player === activeSeat(s))
    prepend(s, fx("raceHaradPlayerWarriorOffer", { source: a.id, target: host.id, player }));
}
export function raceHaradPlayerLocationExplored(s: GameState, u: Unit, wasActive: boolean) {
  if (!wasActive || !sameTitle(s, u.code).length) return;
  prepend(s, ...playerOrder(s).flatMap((player) =>
    settlers(s, player).map((settler) => fx("raceHaradPlayerSettlerOffer", { source: settler.id, code: u.code, player })),
  ));
}
/** The event is already paid and held outside hand/discard while this response resolves. */
export function raceHaradPlayerEventPlayed(s: GameState, u: Unit) {
  if (card(u.code).type_code !== "event" || s.used.includes(STEWARD_LIMIT)) return;
  prepend(s, ...stewards(s).map((steward) =>
    fx("raceHaradPlayerStewardOffer", { source: steward.id, target: u.id, code: u.code, player: activeSeat(s) }),
  ));
}

export function handleRaceHaradPlayerEffect(s: GameState, e: Effect): boolean {
  const source = get(s, e.source), target = get(s, e.target);
  switch (e.kind) {
    case "raceHaradPlayerThurindirSearch": {
      if (!source || !usable(source)) return true;
      choose(s, "Thurindir · Search your deck for a side quest", [
        ...s.deck.flatMap((code, index) => card(code).type_code === "player-side-quest" ? [{
          id: `deck-${index}`, code, label: card(code).name,
          effects: [fx("raceHaradPlayerThurindirTake", { value: index, code })],
        }] : []),
        { id: "none", label: "Find no side quest · Shuffle your deck", effects: [fx("raceHaradPlayerThurindirTake")] },
      ]);
      return true;
    }
    case "raceHaradPlayerThurindirTake":
      if (e.code && e.value !== undefined && s.deck[e.value] === e.code && card(e.code).type_code === "player-side-quest")
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      return true;
    case "raceHaradPlayerTribesmanUse":
      requireRule(!!source && !raceHaradPlayerAbilityProblem(s, source) && tribesmanTargets(s, source).some((u) => u.id === e.target), "The Tribesman and another affected Harad character must remain available.");
      requireRule(exhaustCharacter(s, source!), "Kahliel's Tribesman must exhaust as the cost.");
      target!.tempWill = (target!.tempWill ?? 0) + 1;
      target!.tempAttack = (target!.tempAttack ?? 0) + 1;
      target!.tempDefense = (target!.tempDefense ?? 0) + 1;
      return true;
    case "raceHaradPlayerSteedOffer": {
      const a = target && currentSteed(target, e.source);
      if (target && a && attachmentController(s, target, a) === activeSeat(s) && canReadyHero(s, target))
        choosePlayerResponse(s, a.id, a.code, "Steed of the North · Ready attached hero?", [{
          id: "use", label: `Exhaust Steed of the North · Ready ${name(target)}`,
          effects: [fx("raceHaradPlayerSteedUse", { source: a.id, target: target.id })],
        }, skip]);
      return true;
    }
    case "raceHaradPlayerSteedUse": {
      const a = target && currentSteed(target, e.source);
      requireRule(!!target && !!a && attachmentController(s, target, a) === activeSeat(s) && canReadyHero(s, target), "Steed needs a ready attachment and an affected exhausted hero.");
      a!.exhausted = true;
      readyCharacter(s, target!);
      return true;
    }
    case "raceHaradPlayerWarriorOffer": {
      const a = target?.attachments.find((a) => a.id === e.source && a.code === P.warrior && !a.blanked && !a.facedown);
      if (a && attachmentController(s, target!, a) === activeSeat(s))
        choosePlayerResponse(s, a.id, a.code, "Mighty Warrior · Draw a card?", [{ id: "use", label: "Draw 1 card", effects: [fx("draw", { value: 1 })] }, skip]);
      return true;
    }
    case "raceHaradPlayerHuntersOffer": {
      const event = s.hand.find((u) => u.id === e.source && u.code === P.hunters);
      const heroes = s.heroes.filter((h) => e.ids?.includes(h.id) && canGainResources(s, h));
      if (event && heroes.length && raceHaradProudHuntersCondition(s) && canPay(s, card(event.code)))
        choosePlayerResponse(s, event.id, event.code, "Proud Hunters · Reward a hero in the attack?", [
          ...heroes.map((h) => ({ id: h.id, code: h.code, label: `Play Proud Hunters · Add ${e.value} resources to ${name(h)}`,
            effects: [fx("eventPlay", { source: event.id, code: event.code, effects: [fx("raceHaradPlayerHuntersResolve", { target: h.id, value: e.value })] })],
          })), skip,
        ]);
      return true;
    }
    case "raceHaradPlayerHuntersResolve":
      if (target && ownerOf(s, target) === activeSeat(s) && s.heroes.some((h) => h.id === target.id) && canGainResources(s, target)) {
        target.resources += e.value ?? 0;
        log(s, `Proud Hunters adds ${e.value ?? 0} resources to ${name(target)}.`, "good");
      }
      return true;
    case "raceHaradPlayerPathfinderSearch":
      if (source && usable(source)) choose(s, "Dunedain Pathfinder · Search the top 5 encounter cards", [
        ...s.encounterDeck.slice(0, 5).flatMap((code, index) => card(code).type_code === "location" && !card(code).is_unique ? [{
          id: `deck-${index}`, code, label: card(code).name,
          effects: [fx("raceHaradPlayerPathfinderTake", { source: source.id, code, value: index })],
        }] : []),
        { id: "none", label: "Find no location · Discard Dunedain Pathfinder", effects: [fx("raceHaradPlayerPathfinderTake", { source: source.id })] },
      ]);
      return true;
    case "raceHaradPlayerPathfinderTake":
      if (e.code && e.value !== undefined && e.value < 5 && s.encounterDeck[e.value] === e.code && card(e.code).type_code === "location" && !card(e.code).is_unique) {
        s.encounterDeck.splice(e.value, 1);
        const location = make(s, e.code);
        s.staging.push(location);
        stewardFearLocationEntered(s, location);
        amonDinLocationEntered(s, location);
        watcherPlayerLocationEntered(s, location);
      } else if (source) discardCharacter(s, source);
      shuffle(s, s.encounterDeck);
      return true;
    case "raceHaradPlayerBacktrackAmount":
      if (target && stagingLocations(s, P.backtrack).some((u) => u.id === target.id))
        choose(s, "Backtrack · Choose progress to move from the main quest", Array.from({ length: s.progress }, (_, index) => ({
          id: String(index + 1), code: target.code, label: `Move ${index + 1} progress to ${name(target)}`,
          effects: [fx("raceHaradPlayerBacktrackMove", { target: target.id, value: index + 1 })],
        })));
      return true;
    case "raceHaradPlayerBacktrackMove": {
      requireRule(!!target && stagingLocations(s, P.backtrack).some((u) => u.id === target.id) && !raceHaradMainQuestHasKeywords(s), "Backtrack needs an affected staging location and a main quest without keywords.");
      const n = Math.min(s.progress, Math.max(0, e.value ?? 0));
      s.progress -= n;
      progressLocation(s, target!, n);
      return true;
    }
    case "raceHaradPlayerSettlerOffer":
      if (source && settlers(s).some((u) => u.id === source.id) && e.code && sameTitle(s, e.code).length)
        choosePlayerResponse(s, source.id, source.code, "Eryn Galen Settler · Discard a matching staging location?", [
          ...sameTitle(s, e.code).map((u) => ({ id: u.id, code: u.code, label: `Discard Eryn Galen Settler · Discard ${name(u)}`,
            effects: [fx("raceHaradPlayerSettlerUse", { source: source.id, target: u.id, code: e.code })],
          })), skip,
        ]);
      return true;
    case "raceHaradPlayerSettlerUse": {
      requireRule(!!source && settlers(s).some((u) => u.id === source.id) && !!target && !!e.code && sameTitle(s, e.code).some((u) => u.id === target.id), "Settler needs its physical ally cost and a location with the just explored title.");
      const continuation = s.queue;
      s.queue = [];
      discardCharacter(s, source!);
      s.queue.push(fx("raceHaradPlayerSettlerDiscard", { target: target!.id, code: e.code }), ...continuation);
      return true;
    }
    case "raceHaradPlayerSettlerDiscard":
      if (target && e.code && sameTitle(s, e.code).some((u) => u.id === target.id)) discardLocation(s, target);
      return true;
    case "raceHaradPlayerStewardOffer":
      if (source && stewards(s).some((u) => u.id === source.id) && !s.used.includes(STEWARD_LIMIT))
        choosePlayerResponse(s, source.id, source.code, "Steward of Orthanc · Give the event Doomed 1 to draw?", [{
          id: "use", label: `Give ${card(e.code!).name} Doomed 1 · Draw 1 card`,
          effects: [fx("raceHaradPlayerStewardUse", { source: source.id, target: e.target, code: e.code })],
        }, skip]);
      return true;
    case "raceHaradPlayerStewardUse": {
      requireRule(!!source && stewards(s).some((u) => u.id === source.id) && !s.used.includes(STEWARD_LIMIT), "A Steward can trigger only once per round across all copies you control.");
      s.used.push(STEWARD_LIMIT);
      const continuation = s.queue;
      s.queue = [];
      resolveDoomed(s, 1, "player-card");
      s.queue.push(fx("draw", { value: 1, player: activeSeat(s) }), ...continuation);
      return true;
    }
    default:
      return false;
  }
}
