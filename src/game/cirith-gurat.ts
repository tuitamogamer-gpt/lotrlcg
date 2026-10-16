import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { isAlly, isHero } from "./card-types";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  enemyAddedToStaging,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { reduceThreat } from "./threat-reduction";
import {
  CIRITH_GURAT as C,
  CIRITH_GURAT_MAIN_QUESTS,
  CIRITH_GURAT_RECIPES,
  cirithGuratGuarded,
  cirithGuratCaptives,
  cirithGuratStageInfo,
} from "./cirith-gurat-support";
export * from "./cirith-gurat-support";
const own = (s: GameState, p: number) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === p);
const live = (s: GameState) => !!s.cirithGurat;
const stageLive = (s: GameState, n: number) =>
  live(s) && s.stage === n && !mainQuestUnit(s)?.blanked;
const orc = (code: string) =>
  (card(code).traits ?? "").split(".").some((x) => x.trim() === "Orc");
const hosts = (s: GameState) =>
  [...s.staging, ...allEngaged(s), ...allActiveLocations(s)].filter((u) =>
    ["enemy", "location", "encounter-side-quest"].includes(
      card(u.code).type_code,
    ),
  );
const unattached = (s: GameState, u: Unit) =>
  !u.attachments.length && !cirithGuratGuarded(s, u.id);
const stagingHosts = (s: GameState, enemyOnly = false) =>
  s.staging.filter(
    (u) =>
      (enemyOnly
        ? card(u.code).type_code === "enemy"
        : ["enemy", "location"].includes(card(u.code).type_code)) &&
      unattached(s, u),
  );
const phaseKey = (s: GameState) =>
  ["defense", "attack"].includes(s.phase)
    ? "combat"
    : ["quest", "staging"].includes(s.phase)
      ? "quest"
      : s.phase;
const skip = { id: "skip", label: "Decline response", effects: [] };
type CirithCombat = NonNullable<GameState["combat"]> & {
  cirithTakenShadows?: number;
  cirithDamagedAllies?: string[];
  cirithDestroyedAlly?: boolean;
};
export function setupCirithGurat(s: GameState) {
  const recipe = CIRITH_GURAT_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Source staging contains the four-player preselection. Restore those Orcs
  // before each actual player makes the printed different-title setup search.
  s.encounterDeck = [
    ...pile("sharedEncounterDeck"),
    ...pile("sharedStagingArea").filter((code) => orc(code)),
  ];
  const objective = make(s, C.captives),
    cell = make(s, C.cell),
    abaan = make(s, C.abaan);
  abaan.owner = firstPlayer(s);
  s.staging.push(objective, cell);
  s.cirithGurat = {
    initialized: false,
    rescuePending: 0,
    advancing: false,
    currentQuest: C.rescue,
    questDeck: CIRITH_GURAT_MAIN_QUESTS.slice(1),
    completedQuests: [],
    captives: [],
    guarding: {},
    setAside: pile("sharedSetAside").map((code) => make(s, code)),
    setupOrcs: [],
    engagedRound: -1,
    sneakResources: 0,
    stageThreeChecks: false,
    abaanExhausted: false,
    abaanBonuses: [],
    destroyedAllies: [],
    shadowDefense: [],
  };
  capture(s, abaan, cell.id);
}
export function cirithGuratOpeningHandsKept(s: GameState) {
  if (!s.cirithGurat || s.cirithGurat.initialized) return false;
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("cirithGuratSetupOrc", { player })),
    fx("cirithGuratShuffle"),
    ...playerOrder(s).map((player) => fx("cirithGuratSetupAlly", { player })),
    fx("cirithGuratSetupDone"),
    fx("nextRound"),
  );
  return true;
}
/** Moving into objective status is not a leave of play. Preserve physical id and owner. */
function capture(s: GameState, u: Unit, guardId: string) {
  const q = s.cirithGurat;
  if (!q) return;
  const owner = u.owner ?? ownerOf(s, u);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.heroes = s.heroes.filter((h) => h.id !== u.id);
      s.allies = s.allies.filter((a) => a.id !== u.id);
      s.committedIds = s.committedIds.filter((id) => id !== u.id);
    });
  const reset = make(s, u.code);
  reset.id = u.id;
  reset.owner = owner;
  q.captives = q.captives.filter((h) => h.id !== u.id);
  q.captives.push(reset);
  q.guarding[u.id] = guardId;
  log(
    s,
    `${name(u)} is captured by ${hosts(s).find((h) => h.id === guardId) ? name(hosts(s).find((h) => h.id === guardId)!) : "the guards"}.`,
    "danger",
  );
}
/** Resolve one rescue trigger for every simultaneous group freed from a host. */
export function cirithGuratHostLeaves(s: GameState, host: Unit) {
  const q = s.cirithGurat;
  if (!q) return;
  const freed = cirithGuratCaptives(s, host.id);
  if (!freed.length) return;
  for (const u of freed) {
    delete q.guarding[u.id];
    q.captives = q.captives.filter((h) => h.id !== u.id);
    u.exhausted = true;
    const p = u.code === C.abaan ? firstPlayer(s) : (u.owner ?? firstPlayer(s));
    forOwner(s, p, () => {
      (isHero(u) ? s.heroes : s.allies).push(u);
    });
    if (u.code === C.abaan) q.abaanExhausted = true;
    log(s, `${name(u)} is rescued, exhausted.`, "good");
  }
  if (host.code === C.captured && !host.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("cirithGuratCapturedThreat", {
          player,
          value: freed
            .filter((c) => c.owner === player)
            .reduce((n, c) => n + (Number(card(c.code).cost) || 0), 0),
        }),
      ),
    );
  if (stageLive(s, 1)) {
    q.rescuePending++;
    prepend(
      s,
      fx("reveal", { player: firstPlayer(s) }),
      fx("cirithGuratRescueDone"),
    );
  }
}
export function cirithGuratCheck(s: GameState) {
  const q = s.cirithGurat;
  if (!q || s.status !== "playing") return;
  for (const u of [...q.captives])
    if (u.code !== C.abaan && s.table?.seats[u.owner ?? 0]?.eliminated) {
      q.captives = q.captives.filter((c) => c.id !== u.id);
      delete q.guarding[u.id];
      seatView(s, u.owner ?? 0).removed.push(u.code);
    }
  // Generic removal effects and player elimination also free objectives immediately.
  for (const id of [...new Set(Object.values(q.guarding))])
    if (id !== "pending" && !hosts(s).some((u) => u.id === id))
      cirithGuratHostLeaves(s, { id } as Unit);
  const abaan = allCharacters(s).find((u) => u.code === C.abaan);
  if (abaan) {
    const controller = ownerOf(s, abaan),
      p = firstPlayer(s);
    if (controller !== p) {
      forOwner(s, controller, () => {
        s.allies = s.allies.filter((u) => u.id !== abaan.id);
      });
      forOwner(s, p, () => {
        s.allies.push(abaan);
      });
    }
    if (abaan.exhausted && !q.abaanExhausted && !abaan.blanked)
      prepend(s, fx("cirithGuratAbaanOffer", { source: abaan.id, player: p }));
    q.abaanExhausted = abaan.exhausted;
  }
}
export function cirithGuratAdvance(s: GameState) {
  const q = s.cirithGurat;
  if (!q) return false;
  if (
    !q.initialized ||
    q.rescuePending > 0 ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  const points = s.stage === 2 ? 15 : 10;
  if (
    s.progress < points ||
    (s.stage === 2 ? q.sneakResources < 2 : q.captives.length > 0)
  )
    return true;
  if (questDefeated(s, q.currentQuest)) return true;
  if (s.stage === 3) {
    win(s);
    s.reason =
      "The prisoners are rescued and your fellowship fights its way out of Cirith Gurat.";
  } else {
    q.advancing = true;
    prepend(s, fx("cirithGuratAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function cirithGuratStats(s: GameState, u: Unit) {
  const n =
    s.cirithGurat?.abaanBonuses.filter(
      (b) => b.id === u.id && b.round === s.round,
    ).length ?? 0;
  return {
    attack: n,
    will: n,
    defense:
      n +
      (s.cirithGurat?.shadowDefense
        .filter(
          (b) =>
            b.id === u.id && b.round === s.round && b.phase === phaseKey(s),
        )
        .reduce((n, b) => n + b.value, 0) ?? 0) +
      (live(s) &&
      !u.blanked &&
      u.code === C.guard &&
      cirithGuratGuarded(s, u.id)
        ? 2
        : 0),
    health: 0,
  };
}
export const cirithGuratThreatBonus = (s: GameState, u: Unit) =>
  live(s) && !u.blanked && u.code === C.cell
    ? cirithGuratCaptives(s, u.id).reduce(
        (n, c) => n + (card(c.code).willpower ?? 0),
        0,
      )
    : 0;
export const cirithGuratEngagementModifier = (s: GameState, u: Unit) =>
  s.cirithGurat?.stageThreeChecks && !cirithGuratGuarded(s, u.id)
    ? -(card(u.code).engagement ?? 0)
    : stageLive(s, 2) && s.staging.some((x) => x.id === u.id)
      ? s.progress
      : 0;
export const cirithGuratImmune = (s: GameState, u: Unit) =>
  stageLive(s, 1) &&
  s.staging.some((x) => x.id === u.id) &&
  ["enemy", "location"].includes(card(u.code).type_code) &&
  cirithGuratGuarded(s, u.id);
export const cirithGuratDamageAmount = (
  s: GameState,
  u: Unit,
  amount: number,
) =>
  stageLive(s, 2) &&
  s.staging.some((x) => x.id === u.id) &&
  card(u.code).type_code === "enemy"
    ? 0
    : amount;
export const cirithGuratLocationProgressBlocked = (s: GameState, u: Unit) =>
  live(s) &&
  s.staging.some((x) => x.id === u.id) &&
  s.staging.some((x) => x.code === C.gate && !x.blanked);
export const cirithGuratAllyCost = (s: GameState) =>
  live(s)
    ? s.staging.filter((u) => u.code === C.guardroom && !u.blanked).length
    : 0;
export const cirithGuratThreatReduction = (
  s: GameState,
  amount: number,
  reason = "player-card",
) =>
  live(s) &&
  reason === "player-card" &&
  s.staging.some((u) => u.code === C.mines && !u.blanked)
    ? Math.min(1, amount)
    : amount;
export function cirithGuratEngaged(s: GameState, u: Unit) {
  if (!s.cirithGurat) return;
  s.cirithGurat.engagedRound = s.round;
  if (u.code === C.jailer && !u.blanked)
    prepend(
      s,
      fx("cirithGuratChooseCapture", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function cirithGuratQuestBegin(s: GameState): Effect[] {
  return stageLive(s, 3)
    ? [fx("cirithGuratDiscardEnemy", { player: firstPlayer(s) })]
    : [];
}
export function cirithGuratRoundEnd(s: GameState): Effect[] {
  if (!live(s)) return [];
  return [
    ...(stageLive(s, 2)
      ? [
          fx("reveal", { player: firstPlayer(s) }),
          fx("cirithGuratSneakResource"),
        ]
      : []),
    ...[...s.staging, ...allActiveLocations(s)]
      .filter(
        (u) =>
          u.code === C.torture && !u.blanked && cirithGuratGuarded(s, u.id),
      )
      .flatMap(() =>
        playerOrder(s).map((player) => fx("threat", { value: 1, player })),
      ),
  ];
}
export function cirithGuratTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (!live(s) || u.blanked) return undefined;
  if (u.code === C.gate)
    return [fx("cirithGuratGate", { player: firstPlayer(s) })];
  if (u.code === C.guardroom)
    return [
      fx("cirithGuratShuffle"),
      fx("cirithGuratDiscardEnemy", { text: "orc", player: firstPlayer(s) }),
    ];
  if (u.code === C.mines)
    return playerOrder(s).map((player) => fx("cirithGuratMines", { player }));
}
export const cirithGuratExplored = (s: GameState, u: Unit) =>
  cirithGuratHostLeaves(s, u);
export const cirithGuratEnemyLeaves = (
  s: GameState,
  u: Unit,
  _destruction = false,
) => cirithGuratHostLeaves(s, u);
export function cirithGuratSideDefeated(s: GameState, u: Unit) {
  cirithGuratHostLeaves(s, u);
}
export function cirithGuratCardEntered(
  s: GameState,
  u: Unit,
  fromReveal = false,
  canceled = false,
) {
  if (!live(s) || !fromReveal || canceled || u.blanked) return false;
  const e =
    u.code === C.warg
      ? "cirithGuratWarg"
      : u.code === C.torture
        ? "cirithGuratTorture"
        : u.code === C.captured
          ? "cirithGuratCaptured"
          : null;
  if (e) prepend(s, fx(e, { source: u.id, player: firstPlayer(s) }));
  return false;
}
export function cirithGuratEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!live(s) || ![C.prisoner, C.tormented].includes(code)) return false;
  if (!replay) s.encounterDiscard.push(code);
  if (fromReveal)
    prepend(
      s,
      fx(code === C.prisoner ? "cirithGuratTaken" : "cirithGuratTormented", {
        player: firstPlayer(s),
      }),
    );
  return true;
}
export function cirithGuratShadow(s: GameState, code: string) {
  const c = s.combat as CirithCombat | null,
    enemy = c ? get(s, c.enemyId) : undefined;
  if (!live(s) || !c || !enemy) return false;
  if (code === C.warg) c.attackBonus++;
  else if (code === C.prisoner) {
    c.attackBonus++;
    c.cirithTakenShadows = (c.cirithTakenShadows ?? 0) + 1;
  } else if (code === C.tormented)
    s.cirithGurat!.shadowDefense.push({
      id: enemy.id,
      round: s.round,
      phase: phaseKey(s),
      value: cirithGuratGuarded(s, enemy.id) ? 2 : 1,
    });
  else if (code === C.jailer) {
    const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
      .map((id) => get(s, id))
      .filter(
        (u): u is Unit =>
          !!u && isAlly(u) && stats(s, u).will < threatOf(s, enemy),
      );
    if (defenders.length) {
      for (const u of defenders) capture(s, u, enemy.id);
      c.cancelCombatDamage = true;
      s.queue = s.queue.filter((e) => e.kind !== "enemyDamage");
    }
  } else return false;
  return true;
}
export function cirithGuratDamageDealt(
  s: GameState,
  u: Unit,
  amount: number,
  context: DamageContext,
) {
  const c = s.combat as CirithCombat | null;
  if (
    !live(s) ||
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    amount <= 0 ||
    !isAlly(u)
  )
    return;
  (c.cirithDamagedAllies ??= []).push(u.id);
  if (u.damage >= stats(s, u).health) c.cirithDestroyedAlly = true;
}
export function cirithGuratAttackFinished(
  s: GameState,
  completed: NonNullable<GameState["combat"]>,
): Effect[] {
  if (!live(s)) return [];
  const c = completed as CirithCombat,
    enemy = get(s, c.enemyId);
  return [
    ...(enemy?.code === C.guard &&
    !enemy.blanked &&
    !cirithGuratGuarded(s, enemy.id)
      ? (c.cirithDamagedAllies ?? []).map((id) =>
          fx("cirithGuratGuardCapture", { source: enemy.id, target: id }),
        )
      : []),
    ...Array.from(
      { length: c.cirithDestroyedAlly ? (c.cirithTakenShadows ?? 0) : 0 },
      () => fx("reveal", { player: c.attackPlayer ?? activeSeat(s) }),
    ),
  ];
}
export function cirithGuratCharacterDestroyed(
  s: GameState,
  u: Unit,
  _context: DamageContext,
) {
  if (
    s.cirithGurat &&
    isAlly(u) &&
    !s.cirithGurat.destroyedAllies.includes(u.id)
  )
    s.cirithGurat.destroyedAllies.push(u.id);
}
export function cirithGuratCharacterLeft(
  s: GameState,
  u: Unit,
  controller: number,
  destination?: { zone: string },
) {
  if (!s.cirithGurat) return;
  if (u.code === C.abaan) {
    s.status = "lost";
    s.reason = "Abaan has left play. The rescue of Cirith Gurat has failed.";
    s.choice = null;
    s.queue = [];
    return;
  }
  if (
    isAlly(u) &&
    (destination
      ? destination.zone === "discard"
      : seatView(s, u.owner ?? controller).discard.includes(u.code)) &&
    (s.cirithGurat.destroyedAllies.includes(u.id) ||
      u.damage >= stats(s, u).health) &&
    s.staging.some(
      (h) => h.code === C.cell && !h.blanked && !cirithGuratGuarded(s, h.id),
    )
  )
    prepend(
      s,
      fx("cirithGuratCellDestroyed", {
        target: u.id,
        code: u.code,
        player: u.owner ?? controller,
      }),
    );
  s.cirithGurat.destroyedAllies = s.cirithGurat.destroyedAllies.filter(
    (id) => id !== u.id,
  );
}
function addEnemy(s: GameState, u: Unit) {
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function discardEnemy(s: GameState, orcOnly = false) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === "enemy" && (!orcOnly || orc(code))) {
      addEnemy(s, make(s, code));
      return;
    }
    s.encounterDiscard.push(code);
  }
}
function captureChoice(s: GameState, source: string, p: number, hero = false) {
  const choices = own(s, p).filter(hero ? isHero : isAlly);
  if (choices.length)
    choose(
      s,
      `${seatName(s, p)} · Choose ${hero ? "a hero" : "an ally"} to become a captive`,
      choices.map((u) => ({
        id: u.id,
        code: u.code,
        label: name(u),
        effects: [
          fx("cirithGuratCapture", {
            target: u.id,
            source,
            player: p,
            flag: hero,
          }),
        ],
      })),
    );
}
export const cirithGuratSharedEffect = (e: Effect) =>
  e.kind.startsWith("cirithGurat");
export function cirithGuratEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("cirithGurat")) return false;
  const q = s.cirithGurat;
  if (!q) return true;
  const p = e.player ?? firstPlayer(s),
    u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "cirithGuratSetupOrc": {
      const unique = [...new Set(s.encounterDeck)].filter(
        (code) => orc(code) && !q.setupOrcs.includes(code),
      );
      choose(
        s,
        `${seatName(s, p)} · Add a different Orc enemy`,
        unique.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("cirithGuratSetupOrcTake", { code, player: p })],
        })),
      );
      break;
    }
    case "cirithGuratSetupOrcTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0) {
        const code = s.encounterDeck.splice(i, 1)[0];
        q.setupOrcs.push(code);
        addEnemy(s, make(s, code));
      }
      break;
    }
    case "cirithGuratShuffle":
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      break;
    case "cirithGuratSetupAlly": {
      const seat = seatView(s, p);
      let code: string | undefined;
      while (seat.deck.length) {
        const c = seat.deck.shift()!;
        if (
          card(c).type_code === "ally" &&
          !allCharacters(s).some((u) => u.code === c) &&
          !q.captives.some((u) => u.code === c)
        ) {
          code = c;
          break;
        }
        seat.discard.push(c);
      }
      if (code) {
        const ally = make(s, code);
        ally.owner = p;
        q.captives.push(ally);
        q.guarding[ally.id] = "pending";
        prepend(
          s,
          fx("cirithGuratChooseHost", {
            target: ally.id,
            player: p,
            flag: true,
          }),
        );
      }
      break;
    }
    case "cirithGuratRescueDone":
      q.rescuePending = Math.max(0, q.rescuePending - 1);
      break;
    case "cirithGuratSetupDone":
      q.initialized = true;
      break;
    case "cirithGuratChooseHost": {
      const held = q.captives.find((c) => c.id === e.target) ?? u;
      if (!held) break;
      const available = stagingHosts(s, !!e.flag);
      if (available.length)
        choose(
          s,
          `${seatName(s, p)} · Choose a guard for ${name(held)}`,
          available.map((host) => ({
            id: host.id,
            code: host.code,
            label: name(host),
            effects: [
              fx("cirithGuratAttach", {
                source: host.id,
                target: held.id,
                player: p,
              }),
            ],
          })),
        );
      else if (q.guarding[held.id] === "pending") {
        q.captives = q.captives.filter((x) => x.id !== held.id);
        delete q.guarding[held.id];
        seatView(s, p).discard.push(held.code);
      }
      break;
    }
    case "cirithGuratAttach": {
      const held = q.captives.find((c) => c.id === e.target) ?? u;
      if (held && source) capture(s, held, source.id);
      break;
    }
    case "cirithGuratAdvance":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("cirithGuratStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "cirithGuratStageReveal":
      if (s.stage === 2)
        prepend(
          s,
          fx("cirithGuratShuffle"),
          ...playerOrder(s).map((player) =>
            fx("cirithGuratDiscardEnemy", { player }),
          ),
        );
      if (s.stage === 3) {
        const chief = q.setAside.shift();
        if (chief) addEnemy(s, chief);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("cirithGuratHero", { player })),
          fx("cirithGuratStageChecks"),
        );
      }
      break;
    case "cirithGuratDiscardEnemy":
      discardEnemy(s, e.text === "orc");
      break;
    case "cirithGuratHero":
      captureChoice(s, "", p, true);
      break;
    case "cirithGuratCapture":
      if (u && (!e.source || source)) {
        if (!source && e.flag) {
          for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
          u.damage = 0;
          u.resources = 0;
          u.progress = 0;
          u.boost = 0;
        }
        if (source) capture(s, u, source.id);
        else
          prepend(
            s,
            fx("cirithGuratChooseHost", {
              target: u.id,
              player: p,
              flag: !!e.flag,
            }),
          );
      }
      break;
    case "cirithGuratChooseCapture":
      if (source) captureChoice(s, source.id, p);
      break;
    case "cirithGuratStageChecks":
      q.stageThreeChecks = true;
      prepend(
        s,
        fx("engagementRound", { player: firstPlayer(s) }),
        fx("cirithGuratStageChecksDone"),
      );
      break;
    case "cirithGuratStageChecksDone":
      q.stageThreeChecks = false;
      break;
    case "cirithGuratSneakResource":
      if (stageLive(s, 2) && q.engagedRound !== s.round) {
        q.sneakResources++;
        log(
          s,
          `Sneak Past the Guards gains a resource (${q.sneakResources}/2).`,
          "good",
        );
      }
      break;
    case "cirithGuratTaken": {
      if (!own(s, p).some(isAlly) || !stagingHosts(s).length)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("threat", { value: 2, player })),
        );
      else captureChoice(s, "", p);
      break;
    }
    case "cirithGuratTormented":
      for (const player of playerOrder(s)) {
        const n = q.captives.filter(
          (c) => c.owner === player && c.code !== C.abaan,
        ).length;
        if (n) prepend(s, fx("threat", { value: n, player }));
      }
      if (
        playerOrder(s).some(
          (player) =>
            !q.captives.some((c) => c.owner === player && c.code !== C.abaan),
        )
      )
        prepend(s, fx("reveal", { player: p }));
      break;
    case "cirithGuratWarg": {
      if (!source) break;
      const counts = playerOrder(s).map((player) => ({
        player,
        n: own(s, player).filter(isAlly).length,
      }));
      const max = Math.max(...counts.map((x) => x.n));
      const options = counts
        .filter((x) => x.n === max)
        .map(({ player }) => ({
          id: String(player),
          label: seatName(s, player),
          effects: [fx("immediateAttack", { target: source.id, player })],
        }));
      if (options.length === 1) prepend(s, ...options[0].effects);
      else
        choose(
          s,
          "Dungeon Warg · Choose the tied player with most allies",
          options,
        );
      break;
    }
    case "cirithGuratTorture": {
      if (!source) break;
      const seat = seatView(s, p);
      let code: string | undefined;
      while (seat.deck.length) {
        const c = seat.deck.shift()!;
        if (card(c).type_code === "ally") {
          code = c;
          break;
        }
        seat.discard.push(c);
      }
      if (code) {
        const ally = make(s, code);
        ally.owner = p;
        capture(s, ally, source.id);
        for (const other of allCharacters(s).filter((u) => u.code === code))
          discardCharacter(s, other);
        for (const other of q.captives.filter(
          (u) => u.code === code && u.id !== ally.id,
        )) {
          q.captives = q.captives.filter((u) => u.id !== other.id);
          delete q.guarding[other.id];
          seatView(s, other.owner ?? p).discard.push(other.code);
        }
      }
      break;
    }
    case "cirithGuratCaptured":
      if (source)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("cirithGuratChooseCapture", { source: source.id, player }),
          ),
          fx("cirithGuratCapturedDone", { source: source.id, player: p }),
        );
      break;
    case "cirithGuratCapturedDone":
      if (source && !cirithGuratGuarded(s, source.id)) {
        s.staging = s.staging.filter((u) => u.id !== source.id);
        s.encounterDiscard.push(source.code);
        prepend(s, fx("reveal", { player: p }));
      }
      break;
    case "cirithGuratCapturedThreat":
      forOwner(s, p, () => {
        reduceThreat(s, e.value ?? 0, C.captured, "encounter");
      });
      break;
    case "cirithGuratGuardCapture":
      if (
        u &&
        source &&
        isAlly(u) &&
        allCharacters(s).some((c) => c.id === u.id) &&
        !cirithGuratGuarded(s, source.id)
      )
        capture(s, u, source.id);
      break;
    case "cirithGuratCellDestroyed": {
      const available = s.staging.filter(
        (u) => u.code === C.cell && !u.blanked && !cirithGuratGuarded(s, u.id),
      );
      if (!available.length || !seatView(s, p).discard.includes(e.code!)) break;
      choose(
        s,
        "Dungeon Cell · Choose an empty cell for the destroyed ally",
        available.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("cirithGuratCellTake", {
              source: h.id,
              target: e.target,
              code: e.code,
              player: p,
            }),
          ],
        })),
      );
      break;
    }
    case "cirithGuratCellTake": {
      const discard = seatView(s, p).discard,
        index = discard.lastIndexOf(e.code!);
      if (source && !cirithGuratGuarded(s, source.id) && index >= 0) {
        discard.splice(index, 1);
        const ally = make(s, e.code!);
        ally.id = e.target!;
        ally.owner = p;
        capture(s, ally, source.id);
      }
      break;
    }
    case "cirithGuratGate": {
      const code = encounterDraw(s);
      const threat = code ? (card(code).threat ?? 0) : 0;
      if (code) s.encounterDiscard.push(code);
      const cards = seatView(s, p).hand.filter(
        (u) => (Number(card(u.code).cost) || 0) > threat,
      );
      choose(
        s,
        `Gate of Iron · Discard a card costing more than ${threat}, or raise each player's threat`,
        [
          ...cards.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Discard ${name(u)}`,
            effects: [
              fx("cirithGuratGateDiscard", { target: u.id, player: p }),
            ],
          })),
          {
            id: "threat",
            label: "Raise each player's threat by 3",
            effects: playerOrder(s).map((player) =>
              fx("threat", { value: 3, player }),
            ),
          },
        ],
      );
      break;
    }
    case "cirithGuratGateDiscard":
      if (u)
        forOwner(s, p, () => {
          s.hand = s.hand.filter((h) => h.id !== u.id);
          s.discard.push(u.code);
        });
      break;
    case "cirithGuratMines":
      forOwner(s, p, () => {
        const top = s.deck.splice(0, 3);
        s.discard.push(...top);
        prepend(
          s,
          fx("threat", {
            value: top.filter((c) => card(c).type_code === "ally").length,
            player: p,
          }),
        );
      });
      break;
    case "cirithGuratAbaanOffer": {
      if (!source || source.blanked) break;
      const harad = allCharacters(s).filter((u) =>
        (card(u.code).traits ?? "")
          .split(".")
          .some((t) => t.trim() === "Harad"),
      );
      choose(
        s,
        "Abaan · Give a Harad character +1 willpower, attack and defense this round?",
        [
          ...harad.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [fx("cirithGuratAbaanBonus", { target: u.id })],
          })),
          skip,
        ],
      );
      break;
    }
    case "cirithGuratAbaanBonus":
      if (u) q.abaanBonuses.push({ id: u.id, round: s.round });
      break;
    default:
      return false;
  }
  return true;
}

import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
export const CIRITH_GURAT_HOOKS: Batch4ScenarioHooks = {
  setup: setupCirithGurat,
  openingHandsKept: cirithGuratOpeningHandsKept,
  check: cirithGuratCheck,
  advance: cirithGuratAdvance,
  stageInfo: cirithGuratStageInfo,
  stats: cirithGuratStats,
  threatBonus: cirithGuratThreatBonus,
  engagementBonus: cirithGuratEngagementModifier,
  damageAmount: cirithGuratDamageAmount,
  locationProgressBlocked: cirithGuratLocationProgressBlocked,
  allyCost: cirithGuratAllyCost,
  threatReduction: cirithGuratThreatReduction,
  immune: cirithGuratImmune,
  engaged: cirithGuratEngaged,
  questBegin: cirithGuratQuestBegin,
  roundEnd: cirithGuratRoundEnd,
  travelEffects: cirithGuratTravelEffects,
  hostLeaves: cirithGuratHostLeaves,
  explored: cirithGuratExplored,
  sideDefeated: cirithGuratSideDefeated,
  cardEntered: cirithGuratCardEntered,
  encounter: cirithGuratEncounter,
  shadow: cirithGuratShadow,
  damageDealt: cirithGuratDamageDealt,
  characterDestroyed: cirithGuratCharacterDestroyed,
  attackFinished: cirithGuratAttackFinished,
  characterLeft: (s, u, controller, destination) =>
    cirithGuratCharacterLeft(
      s,
      u,
      controller,
      destination ? { zone: destination } : undefined,
    ),
  sharedEffect: cirithGuratSharedEffect,
  effect: cirithGuratEffect,
};
