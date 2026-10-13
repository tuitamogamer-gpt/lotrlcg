import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, imageUrl, name } from "./cards";
import {
  choose,
  fx,
  locationQuest,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
  spendResources,
  threatOf,
} from "./core";
import { exhaustCharacter, win, templeMapLocationExplored } from "./board";
import {
  activeSeat,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  selectSeat,
} from "./table";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  TEMPLE as T,
  TEMPLE_RECIPES,
  templeActiveLocation,
  templeAdjacent,
  templeCell,
  templeIsMapLocation,
  templeMapUnit,
  templeMapUnits,
} from "./temple-support";
import { templeAfterMapMove, templeLocationFlipped } from "./temple-encounters";
export {
  templeActiveLocation,
  templeAdjacent,
  templeCell,
  templeIsMapLocation,
  templeIsStaged,
  templeLocationsLeft,
  templeMapUnit,
  templeMapUnits,
  templeState,
} from "./temple-support";

const live = (s: GameState) => !!s.temple;
const uncharted = (u: Unit) => [T.lost, T.temple].includes(u.code);
const keyInPlay = (s: GameState) => {
  for (const hero of allHeroes(s)) {
    const attachment = hero.attachments.find((a) => a.code === T.key);
    if (attachment) return { card: attachment, hero };
  }
  const key = s.staging.find((u) => u.code === T.key);
  return key ? { card: key, hero: undefined } : undefined;
};
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);

/** Adjacent map cards use actual staging storage, without duplicating any Unit. */
export function templeSyncMap(s: GameState) {
  const q = s.temple;
  if (!q) return;
  const map = templeMapUnits(s);
  const active = map.find((u) => u.id === q.activeId);
  const cell = active && templeCell(s, active.id);
  const stagedIds = new Set(
    active
      ? templeAdjacent(s, active.id)
          .filter((u) => {
            const other = templeCell(s, u.id)!;
            if (
              !active.blanked &&
              active.code === T.cliffs &&
              other.column > cell!.column
            )
              return false;
            if (
              !active.blanked &&
              active.code === T.jungle &&
              other.row !== cell!.row
            )
              return false;
            return true;
          })
          .map((u) => u.id)
      : [],
  );
  const mapIds = new Set(q.map.map((c) => c.id));
  s.staging = [
    ...s.staging.filter((u) => !mapIds.has(u.id)),
    ...q.map.flatMap((c) => {
      const u = map.find((u) => u.id === c.id);
      return u && stagedIds.has(c.id) ? [u] : [];
    }),
  ];
  q.outOfStaging = map.filter(
    (u) => u.id !== q.activeId && !stagedIds.has(u.id),
  );
  s.activeLocation = active ?? null;
  s.extraActiveLocations = [];
}

export function setupTemple(s: GameState) {
  const recipe = TEMPLE_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  const maps = pile("sharedEncounterDeck2");
  const temples = shuffle(
    s,
    maps.filter((c) => [T.grotto, T.halls].includes(c)),
  );
  const islands = shuffle(
    s,
    maps.filter((c) => ![T.grotto, T.halls].includes(c)),
  );
  s.temple = {
    initialized: false,
    map: [],
    activeId: null,
    travelUsed: false,
    outOfStaging: [],
    setAside: [],
    victoryEnemies: [],
    removedUnits: [],
    originalCodes: {},
    hiddenBacks: {},
    lookedBy: {},
    privateLook: null,
    phaseThreat: 0,
    phaseThreatPhase: null,
    sunkenBoosts: [],
    sunkenPhase: null,
    bottomOnDestroy: [],
    blankedDepartures: [],
    combatBoosts: [],
  };
  const q = s.temple;
  for (let row = 0; row < 3; row++)
    for (let column = 0; column < 5; column++) {
      const original = column === 4 ? temples[row] : islands.shift()!;
      const u = make(s, column === 4 ? T.temple : T.lost);
      q.map.push({ id: u.id, row, column });
      q.outOfStaging.push(u);
      q.originalCodes[u.id] = original;
      q.hiddenBacks[u.id] = original;
    }
  q.setAside = pile("sharedSetAside")
    .filter((code) => card(code).type_code !== "rules")
    .map((code) =>
      make(
        s,
        code === T.sahir
          ? T.sahirAlly
          : code === T.naasiyah
            ? T.naasiyahAlly
            : code,
      ),
    );
  s.encounterDeck = shuffle(s, pile("sharedEncounterDeck"));
  s.encounterDiscard = [];
  s.staging = [];
  s.activeLocation = null;
  s.extraActiveLocations = [];
}

export function templeOpeningHandsKept(s: GameState) {
  if (!live(s) || s.temple!.initialized) return false;
  prepend(s, fx("templeSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export const templeAdvance = (s: GameState) => live(s);
export const templeLocationQuest = (s: GameState, u: Unit) =>
  live(s) && templeIsMapLocation(s, u) && uncharted(u) ? Infinity : undefined;
export const templeCannotLeave = (s: GameState, u: Pick<Unit, "id">) =>
  templeIsMapLocation(s, u);
/** Normal exploration travel has its own effect, never a player make-active effect. */
export const templeCannotMakeActive = (s: GameState, _u?: Unit) => live(s);
export const templeCannotAttach = (s: GameState, u: Unit) =>
  live(s) && u.code === T.lost && !u.blanked;
export function templeProgressLocation(s: GameState, u: Unit, value: number) {
  if (!templeIsMapLocation(s, u)) return false;
  const before = u.progress;
  u.progress += Math.max(0, value);
  if (u.code === T.grotto && !u.blanked && before < 8 && u.progress >= 8) {
    win(s);
    s.reason =
      "The eighth progress is placed on The Grotto's Entrance. The sunken ruins are found.";
  }
  return true;
}
export function templeCheck(s: GameState) {
  if (!live(s)) return;
  templeSyncMap(s);
  const grotto = templeMapUnits(s).find(
    (u) => u.code === T.grotto && !u.blanked && u.progress >= 8,
  );
  if (grotto && s.status === "playing") {
    win(s);
    s.reason =
      "The eighth progress is placed on The Grotto's Entrance. The sunken ruins are found.";
  }
}

export function templeTravelTargets(s: GameState): Unit[] {
  const active = templeActiveLocation(s);
  const cell = active && templeCell(s, active.id);
  if (!active || !cell) return [];
  return templeMapUnits(s).filter((u) => {
    if (u.id === active.id) return false;
    if (!active.blanked && active.code === T.caverns) {
      const other = templeCell(s, u.id)!;
      return (
        Math.abs(cell.row - other.row) + Math.abs(cell.column - other.column) <=
        3
      );
    }
    return s.staging.some((x) => x.id === u.id);
  });
}
export function templeTravelProblem(s: GameState, u: Unit): string | null {
  if (!live(s)) return null;
  if (!s.temple!.initialized || s.phase !== "travel")
    return "Exploration travel is available in the travel phase.";
  if (s.temple!.travelUsed)
    return "The players have already travelled during this travel phase.";
  const active = templeActiveLocation(s);
  if (!active || active.progress < locationQuest(s, active))
    return "Complete the active location before travelling from it.";
  if (!templeTravelTargets(s).some((x) => x.id === u.id))
    return "Choose an adjacent staging location, or a location up to three steps from Winding Caverns.";
  if (!u.blanked && u.code === T.temple) {
    const key = keyInPlay(s);
    if (!key || !key.hero || key.card.exhausted || key.card.blanked)
      return "The Gate Key must be claimed by a player and ready to enter an Uncharted Temple.";
  }
  return null;
}
export const templeTravelCandidates = (s: GameState) =>
  templeTravelTargets(s).filter((u) => templeTravelProblem(s, u) === null);
export function templeTravelEffects(s: GameState, u: Unit): Effect[] | null {
  if (!live(s)) return null;
  return [
    fx("templeTravel", {
      source: s.temple!.activeId ?? undefined,
      target: u.id,
      player: firstPlayer(s),
    }),
  ];
}
export function templeTravelStart(s: GameState) {
  if (s.temple) s.temple.travelUsed = false;
}
/** Turning over is not revealing, and every flip removes all progress. */
export function templeFlip(s: GameState, u: Unit, resolve = true) {
  const q = s.temple;
  const face = q?.hiddenBacks[u.id];
  if (!q || !face) return false;
  u.code = face;
  u.flipped = true;
  u.progress = 0;
  delete q.hiddenBacks[u.id];
  delete q.lookedBy[u.id];
  templeSyncMap(s);
  log(s, `The island is turned over: ${name(u)}.`, "chapter");
  if (resolve && !u.blanked) prepend(s, ...templeLocationFlipped(s, u));
  return true;
}
export function templeQuestProgress(s: GameState, amount: number) {
  if (!live(s)) return false;
  if (amount > 0)
    prepend(s, fx("templeAllocate", { value: amount, player: firstPlayer(s) }));
  return true;
}
export function templePeek(s: GameState, u: Unit, viewers = [activeSeat(s)]) {
  if (!s.temple?.hiddenBacks[u.id]) return false;
  prepend(
    s,
    fx("templeLook", {
      target: u.id,
      ids: viewers.map(String),
      player: viewers[0] ?? firstPlayer(s),
    }),
  );
  return true;
}
export function templeObjectiveFree(s: GameState, u: Unit) {
  return live(s) && u.code === T.key
    ? ![
        ...s.staging,
        ...(s.table?.seats.flatMap((p) => p.engaged) ?? []),
        ...s.engaged,
      ].some((x) => x.guarding === u.id)
    : undefined;
}
export function templeClaim(s: GameState, objective: Unit, hero: Unit) {
  if (!live(s) || objective.code !== T.key) return false;
  requireRule(
    templeObjectiveFree(s, objective) && canExhaust(hero),
    "Exhaust a ready hero to claim the unguarded Gate Key.",
  );
  requireRule(ownerOf(s, hero) === activeSeat(s), "Choose a hero you control.");
  exhaustCharacter(s, hero);
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  hero.attachments.push({
    id: objective.id,
    code: T.key,
    exhausted: objective.exhausted,
    controller: activeSeat(s),
    owner: activeSeat(s),
  });
  log(s, `${name(hero)} claims the Gate Key.`, "good");
  return true;
}
export function templeAttachmentLeaves(
  s: GameState,
  _host: Unit,
  a: Attachment,
) {
  if (!live(s) || a.code !== T.key) return false;
  const u = make(s, T.key);
  u.id = a.id;
  u.exhausted = a.exhausted;
  s.staging.push(u);
  log(s, "The Gate Key returns to staging, unclaimed.");
  return true;
}
export function templeAbilityLabel(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  if (!live(s)) return null;
  if (!attachmentId && u.code === T.lost && !u.blanked)
    return "Remove 4 progress · Look at this island";
  if (
    attachmentId &&
    u.attachments.some(
      (a) => a.id === attachmentId && a.code === T.key && !a.blanked,
    )
  )
    return "Exhaust Key and hero · Spend 3 · Look inside the Temple";
  return null;
}
export function templeAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  if (!templeAbilityLabel(s, u, attachmentId))
    return "This card has no available Temple action.";
  if (s.phase === "setup" || !s.temple!.initialized)
    return "Finish setup before taking actions.";
  if (!attachmentId)
    return u.progress >= 4 ? null : "Looking at this island costs 4 progress.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "The Gate Key's attached hero must be under your control.";
  const key = u.attachments.find((a) => a.id === attachmentId)!;
  if (key.exhausted || !canExhaust(u) || u.resources < 3)
    return "The Key and attached hero must be ready, and that hero must have 3 resources.";
  if (!templeMapUnits(s).some((l) => l.code === T.temple))
    return "There is no Uncharted Temple left to look at.";
  return null;
}
export function templeAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (!templeAbilityLabel(s, u, attachmentId)) return false;
  requireRule(
    !templeAbilityProblem(s, u, attachmentId),
    templeAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (!attachmentId) {
    u.progress -= 4;
    templePeek(s, u);
  } else {
    choose(
      s,
      "Gate Key · Choose a Temple to look at",
      templeMapUnits(s)
        .filter((l) => l.code === T.temple)
        .map((l) => ({
          id: l.id,
          label: `Temple · row ${templeCell(s, l.id)!.row + 1}`,
          code: T.temple,
          effects: [
            fx("templeKeyPeek", {
              source: u.id,
              target: l.id,
              text: attachmentId,
              player: activeSeat(s),
            }),
          ],
        })),
    );
  }
  return true;
}

export function templePublicState(s: GameState) {
  const q = s.temple;
  if (!q) return undefined;
  return {
    initialized: q.initialized,
    activeId: q.activeId,
    cells: q.map.map((cell) => {
      const u = templeMapUnit(s, cell.id)!;
      const definition = card(u.code);
      const quest = locationQuest(s, u);
      const looked = q.lookedBy[u.id]?.includes(activeSeat(s))
        ? q.hiddenBacks[u.id]
        : undefined;
      return {
        ...cell,
        code: u.code,
        name: definition.name,
        image: imageUrl(definition),
        progress: u.progress,
        quest: Number.isFinite(quest) ? quest : null,
        threat: threatOf(s, u),
        active: q.activeId === cell.id,
        adjacent:
          !!q.activeId &&
          templeAdjacent(s, q.activeId).some((x) => x.id === cell.id),
        staged: s.staging.some((x) => x.id === cell.id),
        travelProblem: templeTravelProblem(s, u),
        peekProblem:
          u.code === T.lost
            ? templeAbilityProblem(s, u)
            : "Use the Gate Key to look at an Uncharted Temple.",
        ...(looked
          ? {
              looked: {
                code: looked,
                name: card(looked).name,
                image: imageUrl(card(looked)),
              },
            }
          : {}),
      };
    }),
  };
}
export function templePrivateLookVisible(s: GameState) {
  const look = s.temple?.privateLook;
  return (
    !look || !!s.temple?.lookedBy[look.locationId]?.includes(activeSeat(s))
  );
}

export function templeEffect(s: GameState, e: Effect) {
  if (!live(s) || !e.kind.startsWith("temple")) return false;
  const q = s.temple!;
  const player = e.player ?? firstPlayer(s);
  const u = e.target ? templeMapUnit(s, e.target) : undefined;
  switch (e.kind) {
    case "templeSetup": {
      for (const [code, owner] of [
        [T.sahirAlly, firstPlayer(s)],
        [T.naasiyahAlly, playerOrder(s).at(-1)!],
      ] as const) {
        const captain = q.setAside.find((u) => u.code === code)!;
        q.setAside = q.setAside.filter((u) => u.id !== captain.id);
        captain.owner = owner;
        captain.controller = owner;
        forOwner(s, owner, () => s.allies.push(captain));
      }
      const guardian = q.setAside.find((u) => u.code === T.guardian)!;
      const key = q.setAside.find((u) => u.code === T.key)!;
      q.setAside = q.setAside.filter(
        (u) => ![guardian.id, key.id].includes(u.id),
      );
      guardian.guarding = key.id;
      s.staging.push(guardian, key);
      const corners = q.map
        .filter((c) => c.column === 0 && [0, 2].includes(c.row))
        .map((c) => templeMapUnit(s, c.id)!);
      for (const corner of corners) templeFlip(s, corner, false);
      selectSeat(s, firstPlayer(s));
      choose(
        s,
        "Choose the starting active location",
        corners.map((u) => ({
          id: u.id,
          label: name(u),
          code: u.code,
          detail:
            templeCell(s, u.id)!.row === 0
              ? "Top-left of the Island Map"
              : "Bottom-left of the Island Map",
          effects: [
            fx("templeStart", { target: u.id, player: firstPlayer(s) }),
          ],
        })),
        "Both starting locations are already turned over. Their Forced effects do not resolve during setup.",
      );
      break;
    }
    case "templeStart":
      if (u) {
        q.activeId = u.id;
        q.initialized = true;
        templeSyncMap(s);
        log(s, `The expedition begins at ${name(u)}.`, "chapter");
      }
      break;
    case "templeTravel": {
      if (!u) break;
      requireRule(!templeTravelProblem(s, u), templeTravelProblem(s, u) ?? "");
      requireRule(
        e.source === q.activeId,
        "The active map location has changed.",
      );
      const previous = templeActiveLocation(s)!;
      q.travelUsed = true;
      if (u.code === T.temple && !u.blanked)
        keyInPlay(s)!.card.exhausted = true;
      previous.progress = 0;
      q.outOfStaging.push(previous);
      if (s.activeLocation?.id === previous.id) s.activeLocation = null;
      q.activeId = u.id;
      templeSyncMap(s);
      log(s, `Travelled from ${name(previous)} to ${name(u)}.`, "good");
      prepend(
        s,
        fx("fangornOrder", {
          effects: templeAfterMapMove(s, previous.id, u.id),
          text: "Choose the next travel-right Forced effect",
          player,
        }),
        fx("templeFlip", { target: u.id, player }),
        fx("templeExploreDeparted", { target: previous.id, player }),
        fx("templeTravelResponses", { target: u.id, player }),
      );
      break;
    }
    case "templeFlip":
      if (u && uncharted(u) && !u.blanked) templeFlip(s, u);
      break;
    case "templeExploreDeparted":
      if (u) templeMapLocationExplored(s, u);
      break;
    case "templeAllocate": {
      const n = e.value ?? 0;
      if (n <= 0 || s.status !== "playing") break;
      const locations = s.staging.filter((u) => templeIsMapLocation(s, u));
      selectSeat(s, firstPlayer(s));
      choose(
        s,
        `Searching the Island · Place ${n} progress`,
        [
          {
            id: "quest",
            label: `Place ${n} on Searching the Island`,
            code: T.search,
            effects: [fx("templeAllocateMain", { value: n, player })],
          },
          ...locations.flatMap((l) =>
            Array.from({ length: n }, (_, i) => ({
              id: `${l.id}:${i + 1}`,
              label: `${name(l)} · ${i + 1} progress`,
              code: l.code,
              effects: [
                fx("templeAllocateLocation", {
                  target: l.id,
                  value: i + 1,
                  count: n - i - 1,
                  player,
                }),
              ],
            })),
          ),
        ],
        "Each progress that would be placed on the main quest may instead be placed on a location in the staging area.",
      );
      break;
    }
    case "templeAllocateMain":
      s.progress += e.value ?? 0;
      break;
    case "templeAllocateLocation":
      if (u && s.staging.some((l) => l.id === u.id))
        templeProgressLocation(s, u, e.value ?? 0);
      if (s.status === "playing" && (e.count ?? 0) > 0)
        prepend(s, fx("templeAllocate", { value: e.count, player }));
      break;
    case "templeKeyPeek": {
      const hero = allHeroes(s).find((h) => h.id === e.source);
      if (!hero || !u) break;
      requireRule(
        !templeAbilityProblem(s, hero, e.text),
        templeAbilityProblem(s, hero, e.text) ?? "",
      );
      spendResources(s, hero, 3);
      exhaustCharacter(s, hero);
      hero.attachments.find((a) => a.id === e.text)!.exhausted = true;
      templePeek(s, u, [player]);
      break;
    }
    case "templeLook": {
      if (!e.target && e.ids?.length) {
        prepend(
          s,
          ...e.ids.map((id) =>
            fx("templeLook", { target: id, flag: e.flag, player }),
          ),
        );
        break;
      }
      if (!u || !q.hiddenBacks[u.id]) break;
      const viewers = e.flag
        ? playerOrder(s)
        : (e.ids?.map(Number) ?? [player]);
      q.lookedBy[u.id] = [
        ...new Set([...(q.lookedBy[u.id] ?? []), ...viewers]),
      ];
      selectSeat(s, player);
      const face = q.hiddenBacks[u.id];
      q.privateLook = { locationId: u.id, player };
      choose(
        s,
        "Uncharted location · Facedown side",
        [
          {
            id: "close",
            label: "Close",
            code: face,
            effects: [fx("templeLookClose", { player })],
          },
        ],
        "Looking does not flip the location or resolve its Forced effect.",
      );
      break;
    }
    case "templeLookClose":
      q.privateLook = null;
      break;
    default:
      return false;
  }
  return true;
}
