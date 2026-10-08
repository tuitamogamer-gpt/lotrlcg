import { canRemoveQuestTime } from "./quest-time";
import { trialsTimeOptions } from "./three-trials";
import { dunlandRefreshEffects } from "./dunland-trap";
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  units,
} from "./core";
import {
  damage,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  progressLocation,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { effectiveKeyword, hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { currentQuestCode } from "./quest-state";
import { FANGORN as F, fangornTimeLimit } from "./fangorn-support";

const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const staging = (s: GameState, code: string) =>
  s.staging.some((u) => u.code === code && !u.blanked);
const readyHero = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const huorn = (code: string) =>
  card(code).type_code === "enemy" && /\bHuorn\b/.test(card(code).traits ?? "");
export const hasHinder = (u: Unit) => effectiveKeyword(u, "Hinder");
export const fangornCarrier = (s: GameState) =>
  allHeroes(s).find((h) => h.attachments.some((a) => a.code === F.mugash));
export const fangornForestBonus = (s: GameState, u: Unit) =>
  card(u.code).type_code === "location" &&
  hasTrait(u, "Forest") &&
  s.staging.some((l) => l.id === u.id) &&
  staging(s, F.ancient)
    ? 1
    : 0;
export const fangornLocationBonus = (s: GameState, u: Unit) =>
  3 * fangornForestBonus(s, u) +
  2 * u.attachments.filter((a) => a.code === F.offTrack && !a.blanked).length;

export function setupFangorn(s: GameState) {
  s.fangorn = { time: 4 };
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![F.edge, F.mugash].includes(c),
  );
  const mugash = make(s, F.mugash),
    edge = make(s, F.edge);
  edge.guarding = mugash.id;
  s.staging.push(edge, mugash);
  prepend(
    s,
    ...Array.from({ length: playerOrder(s).length - 1 }, () =>
      fx("reveal", { player: firstPlayer(s) }),
    ),
  );
}
export function fangornCheck(s: GameState) {
  if (!s.fangorn) return;
  for (const l of locations(s))
    if (l.progress > 0 && l.progress >= locationQuest(s, l))
      progressLocation(s, l, 0);
}
export function fangornClaim(s: GameState, objective: Unit, hero: Unit) {
  if (objective.code !== F.mugash) return false;
  requireRule(readyHero(hero), "Exhaust a ready hero to claim Mugash.");
  exhaustCharacter(s, hero);
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  hero.attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
  });
  log(s, `${name(hero)} captures Mugash.`, "good");
  return true;
}
export function fangornDamageTaken(s: GameState, hero: Unit) {
  const a = hero.attachments.find((a) => a.code === F.mugash && !a.blanked);
  if (!a) return;
  hero.attachments = hero.attachments.filter((x) => x.id !== a.id);
  s.encounterDeck.unshift(a.code);
  log(s, "Mugash escapes to the top of the encounter deck.", "danger");
}
function shuffleMugash(s: GameState) {
  const ids = new Set(
    s.staging.filter((u) => u.code === F.mugash).map((u) => u.id),
  );
  for (const u of units(s)) {
    u.attachments = u.attachments.filter((a) => a.code !== F.mugash);
    if (u.guarding && ids.has(u.guarding)) delete u.guarding;
    u.shadows = u.shadows.filter((c) => c !== F.mugash);
  }
  s.staging = s.staging.filter((u) => u.code !== F.mugash);
  s.encounterDeck = s.encounterDeck.filter((c) => c !== F.mugash);
  s.encounterDiscard = s.encounterDiscard.filter((c) => c !== F.mugash);
  s.encounterDeck = shuffle(s, [...s.encounterDeck, F.mugash]);
  log(
    s,
    "Mugash escapes into the forest; shuffle him into the encounter deck.",
    "danger",
  );
}
export function fangornProgressPlaced(s: GameState) {
  if (
    s.fangorn &&
    !s.fangorn.progressTrigger &&
    s.stage === 3 &&
    s.progress >= 6 &&
    fangornCarrier(s)
  ) {
    s.fangorn.progressTrigger = true;
    prepend(
      s,
      fx("fangornAdvance", { value: 2, count: 3, player: firstPlayer(s) }),
    );
  }
}
export function advanceFangorn(s: GameState) {
  if (!s.fangorn) return false;
  if (s.queue.length || s.choice || s.stageRevealing) return true;
  const advance =
    s.stage === 3
      ? s.fangorn.progressTrigger
      : s.progress >= (s.stage === 1 ? 9 : 12) && !!fangornCarrier(s);
  if (advance)
    prepend(
      s,
      fx("fangornAdvance", {
        value: s.stage === 2 ? 0 : 2,
        player: firstPlayer(s),
      }),
    );
  return true;
}
export function fangornCombatStart(s: GameState) {
  const count = allEngaged(s).filter(hasHinder).length;
  if (count)
    prepend(s, fx("fangornHinder", { value: count, player: firstPlayer(s) }));
}
/** Resolve beginning-of-resource Forced effects before resource collection and drawing. */
export function fangornResourceStart(s: GameState) {
  const effects = allEngaged(s)
    .filter((u) => !u.blanked && [F.dark, F.angry, F.deadly].includes(u.code))
    .map((u) =>
      fx("fangornResource", {
        target: u.id,
        code: u.code,
        player: ownerOf(s, u),
      }),
    );
  if (!effects.length) return false;
  prepend(
    s,
    fx("fangornOrder", { effects, player: firstPlayer(s) }),
    fx("resourceCollect"),
  );
  return true;
}
export function fangornAttackStarted(s: GameState) {
  if (s.fangorn?.maliceAttacked !== undefined) s.fangorn.maliceAttacked = true;
}
export function fangornCannotReady(s: GameState, u: Unit) {
  if (s.phase !== "refresh" || !staging(s, F.heart) || !u.exhausted)
    return false;
  const readied = s.refreshReadied?.[ownerOf(s, u)] ?? [];
  return !readied.includes(u.id) && readied.length >= 5;
}
export function fangornCharacterReadied(s: GameState, u: Unit) {
  if (s.phase !== "refresh") return;
  const ids = ((s.refreshReadied ??= {})[ownerOf(s, u)] ??= []);
  if (!ids.includes(u.id)) ids.push(u.id);
}
export function fangornRefreshCharacters(
  s: GameState,
  player: number,
): Effect[] | undefined {
  if (!staging(s, F.heart)) return undefined;
  return [fx("fangornRefresh", { player, ids: [] })];
}
export function fangornTimeRemoved(s: GameState, count: number): Effect[] {
  return allHeroes(s).flatMap((h) =>
    h.attachments
      .filter((a) => a.code === F.rest && !a.blanked)
      .flatMap((a) =>
        Array.from({ length: count }, () =>
          fx("fangornRestDamage", {
            target: h.id,
            source: a.id,
            code: a.code,
            player: ownerOf(s, h),
          }),
        ),
      ),
  );
}
export function fangornRefreshTime(s: GameState) {
  const extra = locations(s).flatMap((u) =>
    u.attachments
      .filter((a) => a.code === F.offTrack && !a.blanked)
      .map((a) => fx("removeQuestTime", { code: a.code, source: a.id })),
  );
  extra.push(...dunlandRefreshEffects(s));
  if (!extra.length) return false;
  prepend(
    s,
    fx("fangornOrder", {
      effects: [fx("removeQuestTime", { code: currentQuestCode(s) }), ...extra],
      player: firstPlayer(s),
    }),
  );
  return true;
}
function tangledCost(s: GameState, u: Unit) {
  return hasTrait(u, "Forest") && staging(s, F.tangled);
}
export function fangornTravelProblem(s: GameState, u: Unit): string | null {
  if (tangledCost(s, u) && !allHeroes(s).some(readyHero))
    return "Tangled Woods requires a ready hero to exhaust.";
  if (
    u.code === F.edge &&
    !u.blanked &&
    [...s.encounterDeck, ...s.encounterDiscard].filter(huorn).length <
      (playerOrder(s).length >= 3 ? 2 : 1)
  )
    return "Edge of Fangorn requires enough Huorns in the encounter deck or discard pile.";
  return null;
}
export function fangornTravel(s: GameState, u: Unit): Effect[] | undefined {
  const effects: Effect[] = [];
  if (tangledCost(s, u))
    effects.push(fx("fangornExhaustHero", { player: firstPlayer(s) }));
  if (u.code === F.edge && !u.blanked)
    effects.push(
      ...Array.from({ length: playerOrder(s).length >= 3 ? 2 : 1 }, () =>
        fx("fangornSearchHuorn", { player: firstPlayer(s) }),
      ),
      fx("fangornShuffle"),
    );
  return effects.length ? effects : undefined;
}
export function fangornEncounter(s: GameState, code: string, replay = false) {
  if (code === F.turned)
    prepend(s, fx("fangornTurned", { player: firstPlayer(s) }));
  else if (code === F.malice) {
    if (s.fangorn) s.fangorn.maliceAttacked = false;
    prepend(
      s,
      fx("fangornOrder", {
        text: "Choose the next Huorn to attack",
        player: firstPlayer(s),
        effects: allEngaged(s)
          .filter((u) => hasTrait(u, "Huorn"))
          .map((u) =>
            fx("immediateAttack", {
              target: u.id,
              code: u.code,
              player: ownerOf(s, u),
            }),
          ),
      }),
      fx("fangornMaliceDone", { player: firstPlayer(s) }),
    );
  } else if (code === F.provisions)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("fordsDivideDamage", {
          value:
            seatView(s, player).heroes.length +
            seatView(s, player).allies.length,
          code,
          player,
        }),
      ),
    );
  else if ([F.offTrack, F.rest].includes(code)) {
    prepend(s, fx("fangornCondition", { code, player: firstPlayer(s) }));
    return true;
  } else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function fangornShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const player = c.attackPlayer ?? activeSeat(s);
  if (code === F.ancient) prepend(s, fx("catchExhaust", { code, player }));
  else if (code === F.turned) {
    if (!c.defenderId && !c.defenderIds?.length)
      prepend(s, fx("fangornReturnLocation", { player }));
  } else if (code === F.heart) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === F.provisions) {
    const defenders = (
      c.defenderIds?.length ? c.defenderIds : c.defenderId ? [c.defenderId] : []
    )
      .map((id) => get(s, id))
      .filter(Boolean);
    c.attackBonus +=
      defenders.length && defenders.every((u) => u!.damage === 0) ? 2 : 1;
  } else return false;
  return true;
}

export function fangornEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("fangorn")) return false;
  const u = get(s, e.target),
    q = s.fangorn;
  switch (e.kind) {
    case "fangornOrder": {
      const effects = e.effects ?? [];
      if (effects.length < 2) {
        prepend(s, ...effects);
        break;
      }
      choose(
        s,
        e.text ?? "Choose the next Forced effect",
        effects.map((effect, i) => ({
          id: `order-${i}`,
          code: effect.code,
          label: effect.code
            ? `${card(effect.code).name}${effect.target && get(s, effect.target) && effect.kind === "fangornRestDamage" ? ` · ${name(get(s, effect.target)!)}` : ""}`
            : effect.kind === "fangornTimeExpired"
              ? "The quest's Time effect"
              : "Remove a quest time counter",
          effects: [
            effect,
            fx("fangornOrder", {
              effects: effects.filter((_, n) => n !== i),
              text: e.text,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "fangornAdvance": {
      if (!q || (e.count === 3 && s.stage !== 3)) break;
      const pending = s.queue.length;
      if (s.stage === 3 || e.value === 3)
        discardQuestAttachments(s, currentQuestCode(s)!);
      else if (questDefeated(s, currentQuestCode(s)!)) {
        s.queue.splice(s.queue.length - pending, 0, e);
        break;
      }
      delete q.progressTrigger;
      if (e.value === 0) {
        win(s);
        s.reason = "You escape Fangorn with Mugash in custody.";
        break;
      }
      s.stage = e.value!;
      s.progress = 0;
      q.time = fangornTimeLimit(s.stage);
      s.stageRevealing = true;
      log(s, `${card(currentQuestCode(s)!).name} · Time ${q.time}.`, "chapter");
      prepend(
        s,
        ...(s.stage === 2
          ? [
              ...playerOrder(s).map((player) =>
                fx("fangornSearchHuorn", { player }),
              ),
              fx("fangornShuffle"),
            ]
          : []),
        fx("stageRevealed"),
      );
      break;
    }
    case "fangornTimeExpired":
      if (!q || s.stage !== e.value || q.time !== 0) break;
      if (s.stage < 3) {
        shuffleMugash(s);
        prepend(s, fx("fangornAdvance", { value: 3, player: firstPlayer(s) }));
      } else {
        s.encounterDiscard.push(...s.encounterDeck.splice(0, 5));
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("fangornDiscardReveal", { player }),
          ),
          fx("fangornResetTime", { value: s.stage }),
        );
      }
      break;
    case "fangornResetTime":
      if (q && s.stage === e.value && q.time === 0) q.time = 3;
      break;
    case "fangornShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      break;
    case "fangornSearchHuorn": {
      const choices = ["deck", "discard"].flatMap((source) =>
        [
          ...new Set(
            (source === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              huorn,
            ),
          ),
        ].map((code) => ({
          id: `${source}:${code}`,
          code,
          label: `${card(code).name} · encounter ${source}`,
          effects: [
            fx("fangornTakeHuorn", {
              code,
              text: source,
              flag: e.flag,
              player: activeSeat(s),
            }),
          ],
        })),
      );
      if (choices.length)
        choose(
          s,
          e.flag ? "Choose a Huorn to engage" : "Choose a Huorn for staging",
          choices,
        );
      break;
    }
    case "fangornTakeHuorn": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const index = pile.indexOf(e.code!);
      if (index < 0) break;
      pile.splice(index, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      if (e.flag) engage(s, enemy);
      break;
    }
    case "fangornDiscardReveal": {
      const codes = [
        ...new Set(
          s.encounterDiscard.filter((c) =>
            ["enemy", "objective"].includes(card(c).type_code),
          ),
        ),
      ];
      if (codes.length)
        choose(
          s,
          "Reveal an enemy or objective from the encounter discard pile",
          codes.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("fangornRevealSelected", { code, player: activeSeat(s) }),
            ],
          })),
        );
      break;
    }
    case "fangornRevealSelected": {
      const i = s.encounterDiscard.indexOf(e.code!);
      if (i < 0) break;
      s.encounterDiscard.splice(i, 1);
      prepend(s, fx("resolveReveal", { code: e.code, player: activeSeat(s) }));
      break;
    }
    case "fangornHinder": {
      const n = Math.min(s.progress, e.value ?? 0);
      s.progress -= n;
      const remaining = (e.value ?? 0) - n;
      if (remaining > 0) {
        const options = allActiveLocations(s).filter((l) => l.progress > 0);
        if (options.length === 1) {
          const take = Math.min(remaining, options[0].progress);
          options[0].progress -= take;
        } else if (options.length > 1)
          choose(
            s,
            "Hinder: remove 1 progress from an active location",
            options.map((l) => ({
              id: l.id,
              code: l.code,
              label: name(l),
              effects: [
                fx("fangornHinderLocation", { target: l.id }),
                fx("fangornHinder", {
                  value: remaining - 1,
                  player: firstPlayer(s),
                }),
              ],
            })),
          );
      }
      log(
        s,
        `Hinder removes up to ${e.value} progress, starting with the quest.`,
        "danger",
      );
      break;
    }
    case "fangornHinderLocation":
      if (u) u.progress = Math.max(0, u.progress - 1);
      break;
    case "fangornResource":
      if (!u) break;
      if (e.code === F.dark) raiseThreat(s, 2, "encounter");
      if (e.code === F.angry)
        prepend(
          s,
          fx("immediateAttack", { target: u.id, player: activeSeat(s) }),
        );
      if (e.code === F.deadly)
        choose(
          s,
          "Deadly Huorn: deal 3 damage to one character",
          [...s.heroes, ...s.allies].map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("damage", { target: h.id, value: 3, player: activeSeat(s) }),
            ],
          })),
        );
      break;
    case "fangornMaliceDone": {
      const attacked = q?.maliceAttacked;
      if (q) delete q.maliceAttacked;
      if (!attacked)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("fangornSearchHuorn", { player, flag: true }),
          ),
          fx("fangornShuffle"),
        );
      break;
    }
    case "fangornRestDamage":
      if (u) damage(s, u.id, 1);
      break;
    case "fangornExhaustHero":
      choose(
        s,
        "Tangled Woods: exhaust a hero to travel",
        allHeroes(s)
          .filter(readyHero)
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("exhaust", { target: h.id })],
          })),
      );
      break;
    case "fangornTurned": {
      const options: import("./types").Option[] = trialsTimeOptions(s);
      if (canRemoveQuestTime(s))
        options.push({
          id: "time",
          label: "Remove 1 time counter from the current quest",
          effects: [fx("removeQuestTime")],
        });
      if (allActiveLocations(s).length)
        options.push({
          id: "location",
          label: "Return an active location to staging",
          effects: [fx("fangornReturnLocation")],
        });
      if (options.length) choose(s, "Turned Around", options);
      break;
    }
    case "fangornReturnLocation": {
      const options = allActiveLocations(s);
      if (options.length === 1)
        prepend(s, fx("fangornReturnSelected", { target: options[0].id }));
      else if (options.length)
        choose(
          s,
          "Return an active location to staging",
          options.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("fangornReturnSelected", { target: l.id })],
          })),
        );
      break;
    }
    case "fangornReturnSelected":
      if (u && allActiveLocations(s).some((l) => l.id === u.id)) {
        if (s.activeLocation?.id === u.id) s.activeLocation = null;
        s.extraActiveLocations = s.extraActiveLocations?.filter(
          (l) => l.id !== u.id,
        );
        s.staging.push(u);
      }
      break;
    case "fangornCondition": {
      const candidates = (
        e.code === F.rest
          ? allHeroes(s).filter((h) => h.committed)
          : locations(s)
      ).filter((u) => !u.attachments.some((a) => a.code === e.code));
      if (candidates.length)
        choose(
          s,
          `Attach ${card(e.code!).name}`,
          candidates.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("fangornAttachCondition", { target: u.id, code: e.code }),
            ],
          })),
        );
      else s.encounterDiscard.push(e.code!);
      break;
    }
    case "fangornAttachCondition":
      if (u) {
        const a = make(s, e.code!);
        u.attachments.push({ id: a.id, code: a.code, exhausted: false });
        if (e.code === F.rest) {
          u.committed = false;
          const seat = seatView(s, ownerOf(s, u));
          seat.committedIds = seat.committedIds.filter((id) => id !== u.id);
        }
      } else s.encounterDiscard.push(e.code!);
      break;
    case "fangornRefresh": {
      const considered = e.ids ?? [];
      const candidates = [...s.heroes, ...s.allies].filter(
        (u) => u.exhausted && !considered.includes(u.id) && !cannotReady(u, s),
      );
      if (!candidates.length) break;
      const effectsFor = (u: Unit) => [
        fx(
          u.attachments.some((a) => a.code === "01080" && !a.blanked)
            ? "webRefresh"
            : "ready",
          { target: u.id, player: activeSeat(s) },
        ),
        fx("fangornRefresh", {
          ids: [...considered, u.id],
          player: activeSeat(s),
        }),
      ];
      const available = 5 - (s.refreshReadied?.[activeSeat(s)]?.length ?? 0);
      if (candidates.length <= available)
        prepend(s, ...effectsFor(candidates[0]));
      else
        choose(
          s,
          `Heart of Fangorn: choose a character to ready (${available} remaining)`,
          candidates.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: effectsFor(u),
          })),
        );
      break;
    }
  }
  return true;
}
