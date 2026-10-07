import { hasSilverLamp } from "./voice-isengard";
import { heirsShadowDealt } from "./heirs-numenor";
import { currentQuestCode } from "./quest-state";
// Original Khazad-dûm encounter sets and the three printed scenarios.
import encounters from "../data/khazad-dum-encounter-cards.json";
import quests from "../data/khazad-dum-quest-cards.json";
import { card, name } from "./cards";
import type { Attachment, Card, Effect, GameState, Unit } from "./types";
type KhazadState = NonNullable<GameState["khazad"]>;
import {
  choose,
  encounterDraw,
  enqueue,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  removeShadowCard,
  requireRule,
  restrictAttachments,
  shuffle,
  skip,
  stats,
  threatOf,
  units,
} from "./core";
import {
  questDefeated,
  addVictoryCard,
  check,
  discardAttachment,
  discardHandCard,
  discardPlayerDeck,
  destroy,
  engage,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  defendersFor,
  attachmentController,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatView,
  selectSeat,
} from "./table";
import { beginEnemyAttack } from "./combat";
import {
  hasTrait,
  effectiveKeyword,
  restrictedSlots,
  restrictedLimit,
} from "./expansion-passives";

export const KHAZAD_ENCOUNTERS = encounters as Card[];
export const KHAZAD_QUESTS = quests as (Card & {
  back_quest?: number;
  back_victory?: number;
})[];
const code = (suffix: string) =>
  `octgn:51223bd0-ffd1-11df-a976-0801207c${suffix}`;
export const KHAZAD = {
  foe: code("9001"),
  presence: code("9002"),
  wayUp: code("9004"),
  tools: code("9006"),
  bitter: code("9009"),
  uruks: code("9010"),
  book: code("9011"),
  branching: code("9013"),
  bridge: code("9014"),
  burning: code("9015"),
  caveIn: code("9016"),
  torch: code("9017"),
  caveTroll: code("9018"),
  chance: code("9019"),
  chieftain: code("9020"),
  ruin: code("9021"),
  dreadful: code("9022"),
  gap: code("9023"),
  east: code("9027"),
  enter: code("9028"),
  hall: code("9032"),
  well: code("9033"),
  archer: code("9034"),
  follower: code("9035"),
  patrolQuest: code("9036"),
  scout: code("9038"),
  spearman: code("9039"),
  swordsman: code("9040"),
  tunnels: code("9041"),
  greatTroll: code("9042"),
  hidden: code("9043"),
  knees: code("9045"),
  passage: code("9046"),
  roads: code("9047"),
  massing: code("9048"),
  warg: code("9049"),
  devilry: code("9051"),
  drummer: code("9052"),
  horn: code("9053"),
  leader: code("9054"),
  armoury: code("9055"),
  wrong: code("9056"),
  blocked: code("9058"),
  darkness: code("9060"),
  council: code("9062"),
  down: code("9064"),
  up: code("9066"),
  narrow: code("9068"),
  chamber: code("9070"),
  fear: code("9072"),
  signs: code("9073"),
  stairs: code("9074"),
  stray: code("9075"),
  pitfall: code("9076"),
  balin: code("9077"),
  roots: code("9079"),
  nameless: code("9080"),
  waters: code("9081"),
  bones: code("9082"),
  upper: code("9084"),
  lair: code("9086"),
  eyes: code("9087"),
  shaft: code("9089"),
} as const;
const flightQuests = KHAZAD_QUESTS.filter(
  (q) => q.encounter_set === "Flight from Moria" && q.code !== KHAZAD.presence,
).map((q) => q.code);
const isKhazad = (s: GameState) =>
  ["into-the-pit", "the-seventh-level", "flight-from-moria"].includes(
    s.scenarioId,
  );
const lastPlayer = (s: GameState) => playerOrder(s).at(-1) ?? 0;
const state = (s: GameState): KhazadState =>
  (s.khazad ??= { victoryCards: [], questDeck: [] });
const allEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const torchHosts = (s: GameState) =>
  allHeroes(s).flatMap((u) =>
    u.attachments
      .filter((a) => a.code === KHAZAD.torch && !a.exhausted && !a.blanked)
      .map((a) => ({ u, a })),
  );
const active = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code);
const immune = (u: Unit) =>
  /Immune to (?:player )?card effects/i.test(card(u.code).text ?? "");
const questDefinition = (questCode: string) =>
  KHAZAD_QUESTS.find((q) => q.code === questCode)!;

export function khazadVictory(s: GameState, cardCode: string) {
  if (isKhazad(s)) state(s).victoryCards.push(cardCode);
}
function addQuestVictory(s: GameState, questCode: string) {
  addVictoryCard(s, questCode);
  log(
    s,
    `${questDefinition(questCode).back_name ?? questDefinition(questCode).name} enters the victory display.`,
    "good",
  );
}
export function setupKhazad(s: GameState) {
  state(s);
  if (s.scenarioId === "into-the-pit") {
    s.encounterDeck = s.encounterDeck.filter(
      (c) =>
        ![KHAZAD.east, KHAZAD.torch, KHAZAD.hall, KHAZAD.bridge].includes(
          c as typeof KHAZAD.east,
        ),
    );
    s.activeLocation = make(s, KHAZAD.east);
    prepend(
      s,
      fx("khazadAttachSetup", {
        code: KHAZAD.torch,
        player: s.table?.first ?? 0,
      }),
      ...playerOrder(s).map((player) => fx("reveal", { player })),
    );
  } else if (s.scenarioId === "the-seventh-level") {
    s.encounterDeck = s.encounterDeck.filter((c) => c !== KHAZAD.book);
    prepend(
      s,
      fx("khazadAttachSetup", {
        code: KHAZAD.book,
        player: s.table?.first ?? 0,
      }),
      ...playerOrder(s).map((player) => fx("reveal", { player })),
    );
  } else if (s.scenarioId === "flight-from-moria") {
    const k = state(s);
    k.questDeck = shuffle(s, [...flightQuests]);
    k.activeQuest = KHAZAD.presence;
    k.questSide = "B";
    s.encounterDeck = s.encounterDeck.filter(
      (c) => c !== KHAZAD.nameless && c !== KHAZAD.foe,
    );
    s.encounterDeck.push(...Array(livingSeats(s).length).fill(KHAZAD.foe));
    placeEncounter(s, KHAZAD.nameless, true);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("reveal", { player })),
      fx("khazadPresenceDone", { player: s.table?.first ?? 0 }),
    );
  }
  shuffle(s, s.encounterDeck);
}
export function advanceKhazad(s: GameState) {
  if (!isKhazad(s)) return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length
  )
    return true;
  if (s.scenarioId === "into-the-pit") {
    if (
      s.stage === 1 &&
      s.progress >= 7 &&
      state(s).victoryCards.includes(KHAZAD.bridge)
    ) {
      if (questDefeated(s, currentQuestCode(s)!)) return true;
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      prepend(
        s,
        ...playerOrder(s).map((player, index) =>
          fx("khazadPatrolSearch", {
            player,
            flag: index === playerOrder(s).length - 1,
          }),
        ),
        fx("khazadStageReady"),
      );
    } else if (
      s.stage === 2 &&
      (s.progress >= 11 || allEnemies(s).length === 0)
    ) {
      if (questDefeated(s, currentQuestCode(s)!)) return true;
      s.stage = 3;
      s.progress = 0;
      log(
        s,
        "A Way Up · Heroes no longer collect resources during the resource phase.",
        "chapter",
      );
    } else if (s.stage === 3 && s.progress >= 12) win(s);
  } else if (s.scenarioId === "the-seventh-level") {
    if (s.stage === 1 && s.progress >= 15) {
      if (questDefeated(s, currentQuestCode(s)!)) return true;
      s.stage = 2;
      s.progress = 0;
      removeBook(s);
      log(
        s,
        "The Fate of Balin · Reveal extra encounter cards at the end of each staging step.",
        "chapter",
      );
    } else if (s.stage === 2 && s.progress >= 17) win(s);
  } else {
    const k = state(s),
      q = k.activeQuest;
    if (k.questSide !== "B" || !q || s.stage !== 2) return true;
    const threshold = questDefinition(q).back_quest;
    if (threshold === undefined || s.progress < threshold) return true;
    if (q === KHAZAD.blocked || q === KHAZAD.darkness) win(s);
    else {
      if (questDefeated(s, q)) return true;
      addQuestVictory(s, q);
      newFlightQuest(s);
    }
  }
  return true;
}
export function khazadStageInfo(s: GameState) {
  if (s.scenarioId !== "flight-from-moria" || !s.khazad?.activeQuest)
    return undefined;
  const k = s.khazad,
    q = questDefinition(k.activeQuest!);
  return {
    name: k.questSide === "B" ? (q.back_name ?? q.name) : q.name,
    quest: k.questSide === "B" ? (q.back_quest ?? 0) : 0,
    story: k.questSide === "B" ? (q.back_text ?? "") : (q.text ?? ""),
    cardCode: q.code,
    questImage: k.questSide === "B" ? q.back_imagesrc : q.imagesrc,
    side: k.questSide,
    questNumber: Number(q.cost),
  };
}
export function khazadStatBonus(s: GameState, u: Unit) {
  const n = livingSeats(s).length;
  return {
    attack:
      (u.code === KHAZAD.nameless
        ? s.victory
        : u.code === KHAZAD.stray
          ? n
          : 0) +
      (card(u.code).type_code === "enemy"
        ? s.staging.filter((l) => l.code === KHAZAD.armoury).length
        : 0),
    defense: u.code === KHAZAD.nameless ? s.victory : 0,
  };
}
export function khazadThreatBonus(s: GameState, u: Unit) {
  const n = livingSeats(s).length,
    c = card(u.code);
  return (
    (u.code === KHAZAD.nameless
      ? s.victory
      : [KHAZAD.stray, KHAZAD.roots].includes(u.code as typeof KHAZAD.stray)
        ? n
        : 0) +
    (c.type_code === "enemy"
      ? s.staging.filter((e) => e.code === KHAZAD.drummer).length * n
      : 0) +
    (c.type_code === "location" && hasTrait(u, "Dark")
      ? s.staging.filter((l) => l.code === KHAZAD.branching).length
      : 0)
  );
}
export function khazadLocationQuest(s: GameState, u: Unit) {
  return u.code === KHAZAD.gap
    ? allCharacters(s).length
    : u.code === KHAZAD.roots
      ? livingSeats(s).length
      : undefined;
}
export const khazadCannotPlay = (s: GameState) => active(s, KHAZAD.bridge);
export const khazadResourcePhase = (s: GameState) =>
  !(s.scenarioId === "into-the-pit" && s.stage === 3);
export const khazadCannotExhaust = (u: Unit) =>
  u.attachments.some((a) => a.code === KHAZAD.fear && !a.blanked);
export const khazadCannotReady = khazadCannotExhaust;
export const khazadBlanked = (u: Unit) =>
  u.attachments.some((a) => a.code === KHAZAD.fear && !a.blanked);
export const khazadBookNoExhaust = (u: Unit) =>
  u.attachments.some((a) => a.code === KHAZAD.book && !a.blanked);
export const khazadCanAttack = (u: Unit) =>
  !u.attachments.some((a) => a.code === KHAZAD.book && !a.blanked);
export const khazadWillCounts = (s: GameState, u: Unit) =>
  !u.committed || !s.khazad?.narrowIds || s.khazad.narrowIds.includes(u.id);
export const khazadCannotCancel = (cardCode: string) =>
  [KHAZAD.foe, KHAZAD.pitfall].includes(cardCode as typeof KHAZAD.foe);
export function khazadOptionalEngageProblem(s: GameState, u: Unit) {
  if (active(s, KHAZAD.east) || active(s, KHAZAD.waters))
    return "The active location prohibits optional engagement.";
  if (u.code === KHAZAD.nameless)
    return "The Nameless Fear cannot engage or be engaged.";
  if (u.code === KHAZAD.archer)
    return "Goblin Archer cannot be optionally engaged.";
  if (u.code === KHAZAD.scout && s.threat >= 25)
    return "A player with threat 25 or higher cannot optionally engage Goblin Scout.";
  return null;
}
export const khazadAutoEngageAllowed = (s: GameState, u: Unit) =>
  !active(s, KHAZAD.east) && u.code !== KHAZAD.nameless;
export function khazadEngaged(s: GameState, u: Unit) {
  if (card(u.code).type_code === "enemy")
    u.boost += s.staging.filter((l) => l.code === KHAZAD.knees).length;
}
export const khazadCanRangedAttack = (
  s: GameState,
  enemy: Unit,
  attacker: Unit,
  viaRanged: boolean,
) =>
  enemy.code !== KHAZAD.greatTroll ||
  !viaRanged ||
  ownerOf(s, enemy) === ownerOf(s, attacker);
export function khazadRevealedEnemy(s: GameState, u: Unit) {
  if (card(u.code).type_code !== "enemy") return;
  const archers = allEnemies(s).filter((e) => e.code === KHAZAD.archer).length;
  const first = s.table?.first ?? 0;
  prepend(
    s,
    ...Array.from({ length: archers }, () =>
      fx("khazadArcherDamage", { player: first }),
    ),
  );
  if (hasTrait(u, "Goblin"))
    s.progress = Math.max(
      0,
      s.progress - s.staging.filter((l) => l.code === KHAZAD.tunnels).length,
    );
}
export function khazadDiscardRevealedEnemy(s: GameState, u: Unit) {
  if (
    s.scenarioId !== "into-the-pit" ||
    s.stage !== 2 ||
    card(u.code).type_code !== "enemy"
  )
    return false;
  s.staging = s.staging.filter((e) => e.id !== u.id);
  s.encounterDiscard.push(u.code);
  log(
    s,
    `${name(u)} is discarded by Goblin Patrol instead of entering staging.`,
  );
  return true;
}
export function khazadDamageCancelled(s: GameState, u: Unit, value: number) {
  if (value <= 0 || u.code !== KHAZAD.leader) return false;
  if (u.shadowCancelsDamage) return true;
  const discarded = encounterDraw(s);
  if (discarded) s.encounterDiscard.push(discarded);
  const cancelled = !!discarded && card(discarded).type_code === "enemy";
  log(
    s,
    `Patrol Leader discards ${discarded ? card(discarded).name : "no card"}${cancelled ? " and cancels the damage" : "; damage is not canceled"}.`,
  );
  return cancelled;
}
export function khazadAfterCombatDamage(
  s: GameState,
  enemy: Unit,
  target: Unit,
  value: number,
  remaining: number,
) {
  if (enemy.code === KHAZAD.caveTroll && value > remaining)
    prepend(
      s,
      fx("khazadTrollExcess", {
        count: value - remaining,
        source: target.id,
        player: ownerOf(s, enemy),
      }),
    );
}
export function khazadAttackBonus(
  _s: GameState,
  enemy: Unit,
  undefended: boolean,
) {
  return undefended &&
    [KHAZAD.spearman, KHAZAD.swordsman].includes(
      enemy.code as typeof KHAZAD.spearman,
    )
    ? 2
    : 0;
}
export function khazadAttachmentLeaves(s: GameState, _u: Unit, a: Attachment) {
  if (a.code === KHAZAD.torch) {
    s.removed.push(a.code);
    log(s, "Cave Torch leaves play and is removed from the game.");
    return true;
  }
  if (a.code === KHAZAD.book || a.code === KHAZAD.tools) {
    s.staging.push(make(s, a.code));
    log(s, `${card(a.code).name} returns to staging.`);
    return true;
  }
  return false;
}
function removeBook(s: GameState) {
  s.staging = s.staging.filter((u) => u.code !== KHAZAD.book);
  for (const u of allHeroes(s))
    u.attachments = u.attachments.filter((a) => a.code !== KHAZAD.book);
  s.removed.push(KHAZAD.book);
}
export function khazadClaim(s: GameState, objective: Unit, hero: Unit) {
  if (
    ![KHAZAD.book, KHAZAD.tools].includes(objective.code as typeof KHAZAD.book)
  )
    return false;
  requireRule(
    !hero.exhausted && !khazadCannotExhaust(hero),
    "Exhaust a ready hero to claim this objective.",
  );
  requireRule(
    !units(s).some((u) => u.guarding === objective.id),
    "Defeat the objective's guard first.",
  );
  requireRule(
    exhaustCharacter(s, hero),
    "This hero cannot exhaust to claim the objective.",
  );
  s.staging = s.staging.filter((u) => u.id !== objective.id);
  for (const previous of allHeroes(s))
    previous.attachments = previous.attachments.filter(
      (a) => a.id !== objective.id,
    );
  hero.attachments.push({
    id: objective.id,
    code: objective.code,
    exhausted: false,
    owner: ownerOf(s, hero),
  });
  restrictAttachments(s, hero);
  return true;
}
export function khazadTravelProblem(s: GameState, u: Unit) {
  if (u.code === KHAZAD.passage && !torchHosts(s).length)
    return "Lightless Passage requires a ready Cave Torch.";
  if (
    u.code === KHAZAD.stairs &&
    !seatView(s, s.table?.first ?? 0)
      .heroes.concat(seatView(s, s.table?.first ?? 0).allies)
      .some((x) => !x.exhausted && !khazadCannotExhaust(x))
  )
    return "The first player needs a ready character to exhaust.";
  return null;
}
export function khazadTravelCost(s: GameState, u: Unit) {
  switch (u.code) {
    case KHAZAD.hall:
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 3, "cost"));
      if (s.status === "playing")
        prepend(s, fx("travelEnter", { target: u.id }));
      return true;
    case KHAZAD.stairs:
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "Stairs of Náin · Travel cost",
        opts(
          [...s.heroes, ...s.allies].filter(
            (c) => !c.exhausted && !khazadCannotExhaust(c),
          ),
          (c) => [
            fx("exhaust", { target: c.id }),
            fx("travelEnter", { target: u.id }),
          ],
        ),
      );
      return true;
    case KHAZAD.passage:
      choose(
        s,
        "Lightless Passage · Travel cost",
        torchHosts(s).map(({ u: host, a }) => ({
          id: a.id,
          label: `Exhaust Cave Torch on ${name(host)}`,
          code: a.code,
          effects: [
            fx("khazadExhaustTorch", { target: host.id, source: a.id }),
            fx("travelEnter", { target: u.id }),
          ],
        })),
      );
      return true;
    default:
      return false;
  }
}
export function khazadExplored(s: GameState, u: Unit) {
  if (u.code === KHAZAD.east)
    prepend(s, fx("khazadSetAsideLocation", { code: KHAZAD.hall }));
  else if (u.code === KHAZAD.hall)
    prepend(s, fx("khazadSetAsideLocation", { code: KHAZAD.bridge }));
  else if (u.code === KHAZAD.branching)
    prepend(s, fx("khazadBranching", { player: s.table?.first ?? 0 }));
  else if (u.code === KHAZAD.armoury)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("khazadArmoury", { player })),
    );
  else if (u.code === KHAZAD.lair)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("khazadLairDraw", { player })),
    );
}
export function khazadBeforeStaging(s: GameState) {
  if (s.scenarioId === "flight-from-moria" && state(s).questSide === "A")
    prepend(s, fx("khazadFlipQuest", { player: s.table?.first ?? 0 }));
}
export function khazadStagingEnd(s: GameState) {
  if (s.scenarioId === "the-seventh-level" && s.stage === 2)
    prepend(
      s,
      fx("khazadBalinExtra", {
        count: livingSeats(s).length,
        player: s.table?.first ?? 0,
      }),
    );
}
export function khazadQuestEnd(s: GameState) {
  if (s.scenarioId !== "flight-from-moria" || state(s).questSide !== "B")
    return;
  const k = state(s),
    other =
      k.activeQuest === KHAZAD.up
        ? KHAZAD.down
        : k.activeQuest === KHAZAD.down
          ? KHAZAD.up
          : undefined;
  if (other && k.victoryCards.includes(other)) {
    k.victoryCards.splice(k.victoryCards.indexOf(other), 1);
    if (s.victoryCards?.includes(other))
      s.victoryCards.splice(s.victoryCards.indexOf(other), 1);
    s.victory -= questDefinition(other).victory ?? 0;
    k.questDeck.push(other);
    shuffle(s, k.questDeck);
    log(
      s,
      `${questDefinition(other).back_name} leaves the victory display and is shuffled into the quest deck.`,
    );
  }
}
export function khazadCombatEnd(s: GameState) {
  prepend(
    s,
    ...allHeroes(s).flatMap((u) =>
      u.attachments
        .filter((a) => a.code === KHAZAD.eyes && !a.blanked && u.exhausted)
        .map(() => fx("reveal", { player: s.table?.first ?? 0 })),
    ),
    ...(s.scenarioId === "flight-from-moria" && state(s).questSide === "B"
      ? [fx("khazadBypassChoice", { player: s.table?.first ?? 0 })]
      : []),
  );
}
export function khazadRoundEnd(s: GameState) {
  if (s.khazad) delete s.khazad.narrowIds;
}
export function khazadQuestProgress(s: GameState, n: number) {
  if (s.scenarioId !== "flight-from-moria" || state(s).questSide !== "B")
    return false;
  const k = state(s);
  if (k.activeQuest === KHAZAD.darkness) {
    log(s, "Only Abandoned Tools can place progress on Escape from Darkness.");
    return true;
  }
  if (k.activeQuest === KHAZAD.narrow && !k.toolsFound && n > 0) {
    k.toolsFound = true;
    prepend(s, fx("khazadFindTools"));
  }
  return false;
}
export function khazadAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (a?.code === KHAZAD.torch)
    return a.exhausted
      ? "Cave Torch is exhausted."
      : !units(s).some(
            (l) =>
              card(l.code).type_code === "location" &&
              hasTrait(l, "Dark") &&
              !immune(l),
          )
        ? "Choose a Dark location."
        : null;
  if (a?.code === KHAZAD.tools)
    return s.scenarioId !== "flight-from-moria" ||
      state(s).questSide !== "B" ||
      state(s).activeQuest !== KHAZAD.darkness ||
      s.phase !== "refresh"
      ? "Use Abandoned Tools during refresh on Escape from Darkness."
      : u.exhausted || khazadCannotExhaust(u)
        ? "The attached hero must be ready and able to exhaust."
        : null;
  if (a?.code === KHAZAD.fear)
    return u.resources < 3
      ? "Spend three resources from this hero to discard Shadow of Fear."
      : null;
  if (u.code === KHAZAD.shaft)
    return livingSeats(s).every((p) => seatView(s, p).threat < 50)
      ? null
      : "Every player must be able to raise threat.";
  return undefined;
}
export function khazadAbility(s: GameState, u: Unit, attachmentId?: string) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (
    a &&
    [KHAZAD.torch, KHAZAD.tools, KHAZAD.fear].includes(
      a.code as typeof KHAZAD.torch,
    )
  ) {
    const problem = khazadAbilityProblem(s, u, attachmentId);
    requireRule(!problem, problem ?? "");
    if (a.code === KHAZAD.torch) {
      const locations = units(s).filter(
        (l) =>
          card(l.code).type_code === "location" &&
          hasTrait(l, "Dark") &&
          !immune(l),
      );
      choose(
        s,
        "Cave Torch · Illuminate a Dark location",
        locations.flatMap((l) =>
          Array.from({ length: 4 }, (_, value) => ({
            id: `${l.id}:${value}`,
            label: `${name(l)} · ${value} progress`,
            code: l.code,
            effects: [
              fx("khazadTorchAction", {
                target: l.id,
                value,
                source: a.id,
                text: u.id,
              }),
            ],
          })),
        ),
      );
    } else if (a.code === KHAZAD.tools) {
      requireRule(
        exhaustCharacter(s, u),
        "This hero cannot exhaust Abandoned Tools.",
      );
      s.progress++;
    } else {
      u.resources -= 3;
      discardAttachment(s, u, a);
    }
    return true;
  }
  if (u.code === KHAZAD.shaft) {
    for (const p of playerOrder(s))
      forOwner(s, p, () => raiseThreat(s, 1, "cost"));
    if (s.status === "playing") progressLocation(s, u, 1);
    return true;
  }
  return false;
}
function newFlightQuest(s: GameState, flip = false, selected?: string) {
  const k = state(s),
    next = selected ?? k.questDeck.shift();
  requireRule(next, "The quest deck needs another search route.");
  k.activeQuest = next;
  k.questSide = "A";
  k.toolsFound = false;
  s.progress = 0;
  s.stage = 2;
  log(
    s,
    "Search for an Exit · This route is revealed at the beginning of staging.",
    "chapter",
  );
  if (flip) prepend(s, fx("khazadFlipQuest", { player: s.table?.first ?? 0 }));
}
function flipFlightQuest(s: GameState) {
  const k = state(s),
    q = k.activeQuest;
  if (!q || k.questSide !== "A") return;
  k.questSide = "B";
  s.stageRevealing = true;
  log(s, questDefinition(q).back_name ?? "Search for an Exit", "chapter");
  switch (q) {
    case KHAZAD.wrong:
      prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      break;
    case KHAZAD.blocked:
      prepend(s, fx("khazadBlockedChoice", { player: s.table?.first ?? 0 }));
      break;
    case KHAZAD.council:
      prepend(s, fx("khazadCouncil", { player: s.table?.first ?? 0 }));
      break;
    case KHAZAD.narrow:
      k.narrowIds = [];
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("khazadNarrowChoice", { player })),
      );
      break;
  }
  enqueue(s, fx("khazadStageReady"));
}
function fearAttack(s: GameState) {
  const fear = s.staging.find((u) => u.code === KHAZAD.nameless);
  return fear ? stats(s, fear).attack : 0;
}
export function khazadEncounter(s: GameState, cardCode: string) {
  const first = s.table?.first ?? 0,
    last = lastPlayer(s),
    u = [...s.staging].reverse().find((u) => u.code === cardCode);
  const afterDiscard = (effects: Effect[]) =>
    prepend(s, ...effects, fx("khazadDiscardTreachery", { code: cardCode }));
  switch (cardCode) {
    case KHAZAD.bitter:
      forOwner(s, first, () => {
        for (const h of s.heroes) h.resources = Math.max(0, h.resources - 3);
      });
      break;
    case KHAZAD.uruks:
      prepend(s, fx("khazadUruksAttachment", { player: first }));
      return true;
    case KHAZAD.burning:
      afterDiscard([
        fx("khazadBurningChoice", {
          player: first,
          ids: s.staging
            .filter((u) =>
              ["enemy", "location"].includes(card(u.code).type_code),
            )
            .map((u) => u.id),
        }),
      ]);
      return true;
    case KHAZAD.caveIn:
      afterDiscard([fx("khazadCaveIn", { player: first })]);
      return true;
    case KHAZAD.chance: {
      const c = [...s.encounterDiscard]
        .reverse()
        .find((c) => card(c).type_code === "enemy");
      if (c) {
        s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(c), 1);
        const e = make(s, c);
        s.staging.push(e);
        forOwner(s, first, () => engage(s, e));
      } else prepend(s, fx("reveal", { player: first }));
      break;
    }
    case KHAZAD.chieftain:
      if (u) u.boost += 3;
      return true;
    case KHAZAD.ruin:
      afterDiscard(
        playerOrder(s).map((player) => fx("khazadRuin", { player })),
      );
      return true;
    case KHAZAD.dreadful:
      afterDiscard(
        allCharacters(s)
          .filter((c) => c.exhausted)
          .map((c) =>
            fx("damage", {
              target: c.id,
              value: allActiveLocations(s).some((l) => hasTrait(l, "Dark"))
                ? 2
                : 1,
              player: ownerOf(s, c),
            }),
          ),
      );
      return true;
    case KHAZAD.gap:
      if (u) prepend(s, fx("khazadGap", { target: u.id, player: first }));
      return true;
    case KHAZAD.well:
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("khazadWell", { target: u?.id, player }),
        ),
        fx("khazadWellCheck", { target: u?.id, player: first }),
      );
      return true;
    case KHAZAD.follower:
      if (u) forOwner(s, last, () => engage(s, u));
      return true;
    case KHAZAD.hidden:
      afterDiscard([
        fx("khazadHiddenThreat", {
          value: s.staging.filter((e) => card(e.code).type_code === "enemy")
            .length,
        }),
        fx("khazadDiscardAttachment", { player: last }),
      ]);
      return true;
    case KHAZAD.roads: {
      const locs = s.encounterDiscard.filter(
        (c) => card(c).type_code === "location",
      );
      s.encounterDiscard = s.encounterDiscard.filter(
        (c) => card(c).type_code !== "location",
      );
      s.encounterDeck.push(...locs);
      shuffle(s, s.encounterDeck);
      break;
    }
    case KHAZAD.massing:
      afterDiscard(playerOrder(s).map((player) => fx("reveal", { player })));
      return true;
    case KHAZAD.horn:
      prepend(s, fx("reveal", { player: first }));
      return true;
    case KHAZAD.lair: {
      const index = s.encounterDeck.indexOf(KHAZAD.warg),
        disc = s.encounterDiscard.indexOf(KHAZAD.warg);
      if (index >= 0) s.encounterDeck.splice(index, 1);
      else if (disc >= 0) s.encounterDiscard.splice(disc, 1);
      if (index >= 0 || disc >= 0) placeEncounter(s, KHAZAD.warg, true);
      shuffle(s, s.encounterDeck);
      return true;
    }
    case KHAZAD.eyes:
    case KHAZAD.fear:
      afterDiscard([fx("khazadCondition", { code: cardCode, player: first })]);
      return true;
    case KHAZAD.pitfall:
      afterDiscard([fx("khazadPitfall", { player: first })]);
      return true;
    case KHAZAD.bones:
      afterDiscard(
        playerOrder(s).map((player) => fx("khazadBones", { player })),
      );
      return true;
    case KHAZAD.foe:
      afterDiscard([fx("khazadFoe", { player: last, value: fearAttack(s) })]);
      return true;
    case KHAZAD.devilry:
      if (s.scenarioId === "flight-from-moria" && s.stage === 2) {
        state(s).questDeck.push(state(s).activeQuest!);
        shuffle(s, state(s).questDeck);
        newFlightQuest(s, true);
      } else prepend(s, fx("reveal"));
      break;
    default:
      return (
        KHAZAD_ENCOUNTERS.some((c) => c.code === cardCode) &&
        card(cardCode).type_code !== "treachery"
      );
  }
  if (card(cardCode).type_code === "treachery")
    s.encounterDiscard.push(cardCode);
  return true;
}
export function khazadShadow(s: GameState, cardCode: string) {
  const c = s.combat,
    enemy = c ? get(s, c.enemyId) : undefined;
  if (!c || !enemy) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  const undefended = defenders.length === 0;
  switch (cardCode) {
    case KHAZAD.bitter:
      for (const h of s.heroes) h.resources = Math.max(0, h.resources - 2);
      break;
    case KHAZAD.uruks:
      if (undefended)
        prepend(s, fx("khazadExtraShadows", { target: enemy.id, count: 2 }));
      break;
    case KHAZAD.burning:
      c.attackBonus = (c.attackBonus ?? 0) + 2;
      break;
    case KHAZAD.chance:
      c.attackBonus =
        (c.attackBonus ?? 0) +
        (ownerOf(s, enemy) === (s.table?.first ?? 0) ? 3 : 1);
      break;
    case KHAZAD.chieftain:
      {
        const end = s.queue.findIndex((e) => e.kind === "enemyDone");
        s.queue.splice(
          end >= 0 ? end + 1 : s.queue.length,
          0,
          fx("khazadRepeatAttack", {
            target: enemy.id,
            player: ownerOf(s, enemy),
          }),
        );
      }
      break;
    case KHAZAD.dreadful:
      if (undefended) c.attackBonus = (c.attackBonus ?? 0) + 2;
      else prepend(s, fx("damage", { target: defenders[0].id, value: 1 }));
      break;
    case KHAZAD.follower:
      c.attackBonus =
        (c.attackBonus ?? 0) + (activeSeat(s) === lastPlayer(s) ? 2 : 1);
      break;
    case KHAZAD.spearman:
    case KHAZAD.swordsman: {
      const index = enemy.shadows.indexOf(cardCode);
      if (index >= 0) removeShadowCard(enemy, index);
      placeEncounter(s, cardCode, true);
      break;
    }
    case KHAZAD.tunnels:
      c.attackBonus =
        (c.attackBonus ?? 0) + (hasTrait(enemy, "Goblin") ? 3 : 1);
      break;
    case KHAZAD.passage:
      enemy.shadowCancelsCombatDamage = true;
      break;
    case KHAZAD.massing:
    case KHAZAD.stray:
    case KHAZAD.roots:
      c.attackBonus = (c.attackBonus ?? 0) + livingSeats(s).length;
      break;
    case KHAZAD.warg:
      c.attackBonus =
        (c.attackBonus ?? 0) +
        (allActiveLocations(s).some((l) => hasTrait(l, "Mountain")) ? 2 : 1);
      break;
    case KHAZAD.leader:
      enemy.shadowCancelsDamage = true;
      break;
    case KHAZAD.signs:
      raiseThreat(s, 2, "encounter");
      break;
    case KHAZAD.stairs:
      prepend(s, fx("khazadChooseExhaust"));
      break;
    case KHAZAD.pitfall:
      prepend(
        s,
        ...defenders.map((u) => fx("discardCharacter", { target: u.id })),
      );
      break;
    case KHAZAD.bones:
      prepend(
        s,
        ...defenders
          .filter((u) =>
            ["ally", "objective-ally"].includes(card(u.code).type_code),
          )
          .map((u) => fx("discardCharacter", { target: u.id })),
      );
      break;
    case KHAZAD.foe:
      if (defenders[0])
        prepend(
          s,
          fx("damage", { target: defenders[0].id, value: fearAttack(s) }),
        );
      break;
    case KHAZAD.devilry:
      if (undefended) {
        const fear = s.staging.find((u) => u.code === KHAZAD.nameless);
        raiseThreat(s, fear ? threatOf(s, fear) : 0, "encounter");
      }
      break;
    default:
      return false;
  }
  return true;
}
export function khazadEffect(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "khazadAttachSetup":
      choose(
        s,
        `${card(e.code!).name} · Choose a bearer`,
        opts(allHeroes(s), (h) => [
          fx("khazadSetupBearer", {
            code: e.code,
            target: h.id,
            player: ownerOf(s, h),
          }),
        ]),
      );
      break;
    case "khazadSetupBearer":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: e.code!,
          exhausted: false,
          owner: ownerOf(s, u),
        });
        restrictAttachments(s, u);
      }
      break;
    case "khazadStageReady":
      s.stageRevealing = false;
      break;
    case "khazadDiscardTreachery":
      if (
        !allHeroes(s).some((u) => u.attachments.some((a) => a.code === e.code))
      )
        s.encounterDiscard.push(e.code!);
      break;
    case "khazadSetAsideLocation":
      placeEncounter(s, e.code!, true);
      break;
    case "khazadPatrolSearch": {
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(
            (c) => card(c).type_code === "enemy",
          ),
        ),
      ];
      const patrolAlready = allEnemies(s).some((u) => u.code === KHAZAD.leader);
      const choices =
        e.flag && !patrolAlready && codes.includes(KHAZAD.leader)
          ? [KHAZAD.leader]
          : codes;
      choose(
        s,
        "Goblin Patrol · Choose an enemy",
        choices.map((c) => ({
          id: c,
          label: card(c).name,
          code: c,
          effects: [fx("khazadSearchEnemy", { code: c })],
        })),
        "At least one choice must be Patrol Leader, if available.",
      );
      break;
    }
    case "khazadSearchEnemy": {
      const index = s.encounterDeck.indexOf(e.code!),
        disc = s.encounterDiscard.indexOf(e.code!);
      if (index >= 0) s.encounterDeck.splice(index, 1);
      else if (disc >= 0) s.encounterDiscard.splice(disc, 1);
      if (index >= 0 || disc >= 0) placeEncounter(s, e.code!, true);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "khazadUruksAttachment": {
      const options = allCharacters(s)
        .filter((u) => u.committed)
        .flatMap((host) =>
          host.attachments.map((a) => ({
            id: a.id,
            label: `${card(a.code).name} on ${name(host)}`,
            code: a.code,
            effects: [
              fx("discardAttachment", {
                target: host.id,
                source: a.id,
              }),
            ],
          })),
        );
      choose(
        s,
        "Black Uruks · Discard a questing character's attachment",
        options,
      );
      break;
    }
    case "khazadArcherDamage":
      choose(
        s,
        "Goblin Archer · Deal one damage",
        opts([...s.heroes, ...s.allies], (u) => [
          fx("damage", { target: u.id, value: 1 }),
        ]),
      );
      break;
    case "khazadTrollExcess":
      if ((e.count ?? 0) > 0) {
        const cs = [...s.heroes, ...s.allies].filter((u) => u.id !== e.source);
        choose(
          s,
          "Cave-troll · Excess combat damage",
          opts(cs, (u) => [
            fx("damage", { target: u.id, value: 1 }),
            fx("khazadTrollExcess", { ...e, count: e.count! - 1 }),
          ]),
        );
      }
      break;
    case "khazadBurningChoice": {
      const torches = torchHosts(s);
      if (!torches.length) prepend(s, fx("khazadBurningBoost", { ids: e.ids }));
      else
        choose(s, "Burning Low · Cancel with Cave Torch?", [
          ...torches.map(({ u, a }) => ({
            id: a.id,
            label: `Exhaust Cave Torch on ${name(u)} to cancel`,
            code: a.code,
            effects: [fx("khazadExhaustTorch", { target: u.id, source: a.id })],
          })),
          {
            id: "resolve",
            label: "Raise staged enemy and location threat",
            effects: [fx("khazadBurningBoost", { ids: e.ids })],
          },
        ]);
      break;
    }
    case "khazadBurningBoost":
      for (const id of e.ids ?? []) {
        const enemy = get(s, id);
        if (enemy)
          enemy.tempThreat =
            (enemy.tempThreat ?? 0) +
            (card(enemy.code).type_code === "location" &&
            hasTrait(enemy, "Dark")
              ? 3
              : 1);
      }
      break;
    case "khazadExhaustTorch": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && a.code === KHAZAD.torch,
      );
      if (a && !a.exhausted) {
        a.exhausted = true;
        prepend(s, fx("khazadTorchDiscard"));
      }
      break;
    }
    case "khazadTorchAction": {
      const host = get(s, e.text),
        a = host?.attachments.find(
          (a) => a.id === e.source && a.code === KHAZAD.torch,
        );
      requireRule(
        a && !a.exhausted && u && hasTrait(u, "Dark") && !immune(u),
        "Use a ready Cave Torch on a Dark location.",
      );
      a.exhausted = true;
      prepend(s, fx("khazadTorchDiscard"));
      if (e.value) progressLocation(s, u, e.value);
      break;
    }
    case "khazadTorchDiscard": {
      const c = encounterDraw(s);
      if (c) {
        if (card(c).type_code === "enemy") placeEncounter(s, c, true);
        else s.encounterDiscard.push(c);
        log(
          s,
          `Cave Torch discards ${card(c).name}${card(c).type_code === "enemy" ? " into staging" : ""}.`,
        );
      }
      break;
    }
    case "khazadBranching": {
      const looked = s.encounterDeck.splice(0, 3);
      choose(
        s,
        "Branching Paths · Choose an encounter",
        looked.map((c, i) => ({
          id: String(i),
          label: card(c).name,
          code: c,
          effects: [
            fx("khazadBranchSelect", {
              code: c,
              ids: looked.filter((_, j) => j !== i),
            }),
          ],
        })),
      );
      break;
    }
    case "khazadBranchSelect":
      if ((e.ids?.length ?? 0) > 1)
        choose(
          s,
          "Branching Paths · Order remaining cards",
          e.ids!.map((c, i) => ({
            id: String(i),
            label: `${card(c).name} first, then ${card(e.ids![1 - i]).name}`,
            code: c,
            effects: [
              fx("khazadBranchFinish", {
                code: e.code,
                ids: [c, e.ids![1 - i]],
              }),
            ],
          })),
        );
      else prepend(s, fx("khazadBranchFinish", { code: e.code, ids: e.ids }));
      break;
    case "khazadBranchFinish":
      s.encounterDeck.push(...(e.ids ?? []));
      revealed(s, e.code!);
      break;
    case "khazadCaveIn": {
      const locations = allActiveLocations(s);
      if (locations.length > 1)
        choose(
          s,
          "Cave In · Choose an active location",
          opts(locations, (l) => [fx("khazadCaveInResolve", { target: l.id })]),
        );
      else prepend(s, fx("khazadCaveInResolve", { target: locations[0]?.id }));
      break;
    }
    case "khazadCaveInResolve": {
      const removed = s.progress + (u && !immune(u) ? u.progress : 0);
      s.progress = 0;
      if (u && !immune(u)) u.progress = 0;
      if (!removed) prepend(s, fx("reveal"));
      break;
    }
    case "khazadRuin": {
      const ready = [...s.heroes, ...s.allies].filter(
        (u) => !u.exhausted && !khazadCannotExhaust(u),
      );
      if (!ready.length) {
        discardPlayerDeck(s, 1);
        break;
      }
      choose(
        s,
        "Crumbling Ruin · Exhaust a character",
        opts(ready, (u) => [fx("khazadRuinResolve", { target: u.id })]),
      );
      break;
    }
    case "khazadRuinResolve":
      if (u) {
        requireRule(exhaustCharacter(s, u), "This character cannot exhaust.");
        const code = s.deck[0];
        if (code) {
          const cost = Number(card(code).cost) || 0;
          discardPlayerDeck(s, 1);
          if (cost >= stats(s, u).health - u.damage) destroy(s, u, false);
        }
      }
      break;
    case "khazadGap": {
      const previous = allActiveLocations(s).filter((l) => !immune(l));
      if (previous.length > 1)
        choose(
          s,
          "Dreadful Gap · Choose the returned active location",
          opts(previous, (l) => [
            fx("khazadGapEnter", { target: e.target, source: l.id }),
          ]),
        );
      else
        prepend(
          s,
          fx("khazadGapEnter", { target: e.target, source: previous[0]?.id }),
        );
      break;
    }
    case "khazadGapEnter":
      if (u) {
        const previous = allActiveLocations(s).find((l) => l.id === e.source);
        if (previous) {
          removeActiveLocation(s, previous.id);
          s.staging.push(previous);
        }
        prepend(
          s,
          fx("travelEnter", {
            target: u.id,
            text: "strider-replace",
            flag: true,
          }),
        );
      }
      break;
    case "khazadWell":
      if (s.hand.length)
        choose(s, "Fouled Well · Discard a random card?", [
          {
            id: "discard",
            label: "Discard one random card",
            effects: [fx("khazadWellDiscard", { target: e.target })],
          },
          skip,
        ]);
      break;
    case "khazadWellDiscard": {
      const index = Math.floor(random(s) * s.hand.length),
        discarded = s.hand[index];
      if (discarded) {
        discardHandCard(s, discarded.id);
        if (u) u.resources++;
      }
      break;
    }
    case "khazadWellCheck":
      if (u && u.resources < livingSeats(s).length) prepend(s, fx("reveal"));
      if (u) u.resources = 0;
      break;
    case "khazadHiddenThreat":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "khazadDiscardAttachment":
      choose(
        s,
        "Hidden Threat · Discard an attachment you control",
        allCharacters(s).flatMap((host) =>
          host.attachments
            .filter((a) => attachmentController(s, host, a) === activeSeat(s))
            .map((a) => ({
              id: a.id,
              label: `${card(a.code).name} on ${name(host)}`,
              code: a.code,
              effects: [
                fx("discardAttachment", {
                  target: host.id,
                  source: a.id,
                }),
              ],
            })),
        ),
      );
      break;
    case "khazadCondition":
      choose(
        s,
        `${card(e.code!).name} · Attach to a hero`,
        opts(
          s.heroes.filter((u) => !u.attachments.some((a) => a.code === e.code)),
          (u) => [fx("khazadAttachCondition", { target: u.id, code: e.code })],
        ),
      );
      break;
    case "khazadAttachCondition":
      if (u)
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: e.code!,
          exhausted: false,
          owner: activeSeat(s),
        });
      else s.encounterDiscard.push(e.code!);
      break;
    case "khazadPitfall":
      choose(
        s,
        "Sudden Pitfall · Discard a questing character",
        opts(
          [...s.heroes, ...s.allies].filter((u) => u.committed),
          (u) => [fx("discardCharacter", { target: u.id })],
        ),
      );
      break;
    case "khazadBones":
      choose(
        s,
        "Undisturbed Bones · Damage an ally",
        opts(s.allies, (u) => [
          fx("damage", { target: u.id, value: s.allies.length }),
        ]),
      );
      break;
    case "khazadChooseExhaust":
      choose(
        s,
        "Stairs of Náin · Exhaust a character",
        opts(
          [...s.heroes, ...s.allies].filter(
            (u) => !u.exhausted && !khazadCannotExhaust(u),
          ),
          (u) => [fx("exhaust", { target: u.id })],
        ),
      );
      break;
    case "khazadExtraShadows":
      if (u) {
        const codes = Array.from({ length: e.count ?? 0 }, () =>
          encounterDraw(s, true),
        ).filter((c): c is string => !!c);
        u.faceupShadows ??= u.shadows.map(() => false);
        u.faceupShadows.splice(
          u.revealedShadowCount ?? 0,
          0,
          ...codes.map(() => hasSilverLamp(s, u)),
        );
        u.shadows.splice(u.revealedShadowCount ?? 0, 0, ...codes);
        prepend(s, ...codes.map((code) => fx("shadowReveal", { code })));
      }
      break;
    case "khazadRepeatAttack":
      if (u && allEngaged(s).some((enemy) => enemy.id === u.id)) {
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        u.attacked = false;
        s.phase = "defense";
        delete u.shadowCancelsDamage;
        delete u.shadowCancelsCombatDamage;
        const code = encounterDraw(s, true);
        if (code) {
          u.shadows.push(code);
          heirsShadowDealt(s, u);
        }
        choose(s, `${name(u)} · Additional attack`, [
          ...opts(defendersFor(s, u), (d) => [
            fx("khazadRepeatDefend", { target: u.id, source: d.id }),
          ]),
          {
            id: "undefended",
            label: "Leave the additional attack undefended",
            effects: [fx("khazadRepeatDefend", { target: u.id })],
          },
        ]);
      }
      break;
    case "khazadRepeatDefend":
      if (u) beginEnemyAttack(s, u, e.source ? [e.source] : []);
      break;
    case "khazadArmoury": {
      const eligible = s.hand.filter(
        (a) =>
          card(a.code).type_code === "attachment" &&
          /\b(?:Weapon|Armou?r)\b/i.test(card(a.code).traits ?? ""),
      );
      const choices = eligible.flatMap((a) =>
        [...s.heroes, ...s.allies]
          .filter((host) => armouryLegal(s, card(a.code), host))
          .map((host) => ({
            id: `${a.id}:${host.id}`,
            label: `${card(a.code).name} on ${name(host)}`,
            code: a.code,
            effects: [
              fx("khazadArmouryAttach", { target: host.id, source: a.id }),
            ],
          })),
      );
      if (choices.length)
        choose(s, "Plundered Armoury · Attach a Weapon or Armour", [
          ...choices,
          skip,
        ]);
      break;
    }
    case "khazadArmouryAttach": {
      const a = s.hand.find((a) => a.id === e.source);
      if (u && a) {
        s.hand = s.hand.filter((c) => c.id !== a.id);
        u.attachments.push({
          id: a.id,
          code: a.code,
          exhausted: false,
          owner: activeSeat(s),
        });
        restrictAttachments(s, u);
      }
      break;
    }
    case "khazadLairDraw":
      choose(s, "Warg Lair · Draw a card?", [
        {
          id: "draw",
          label: "Draw one card",
          effects: [fx("draw", { count: 1 })],
        },
        skip,
      ]);
      break;
    case "khazadBalinExtra": {
      const codes = Array.from({ length: e.count ?? 0 }, () =>
        encounterDraw(s),
      ).filter((c): c is string => !!c);
      const enemies = codes.filter((c) => card(c).type_code === "enemy");
      s.encounterDiscard.push(
        ...codes.filter((c) => card(c).type_code !== "enemy"),
      );
      prepend(s, ...enemies.map((code) => fx("khazadBalinEnemy", { code })));
      break;
    }
    case "khazadBalinEnemy":
      revealed(s, e.code!);
      break;
    case "khazadFoe":
      choose(
        s,
        "A Foe Beyond · Damage a hero",
        opts(s.heroes, (h) => [
          fx("damage", { target: h.id, value: e.value ?? 0 }),
        ]),
      );
      break;
    case "khazadPresenceDone":
      if (questDefeated(s, KHAZAD.presence)) {
        enqueue(s, fx(e.kind, { player: s.table?.first ?? 0 }));
        break;
      }
      addQuestVictory(s, KHAZAD.presence);
      newFlightQuest(s);
      break;
    case "khazadFlipQuest":
      flipFlightQuest(s);
      break;
    case "khazadBypassChoice":
      if (
        ![KHAZAD.presence, KHAZAD.council].includes(
          state(s).activeQuest as typeof KHAZAD.presence,
        )
      )
        choose(s, "Search for an Exit · Bypass this route?", [
          {
            id: "bypass",
            label: "Put this route beneath the quest deck",
            effects: [fx("khazadBypass")],
          },
          skip,
        ]);
      break;
    case "khazadBypass":
      state(s).questDeck.push(state(s).activeQuest!);
      newFlightQuest(s);
      break;
    case "khazadBlockedChoice":
      choose(s, "Blocked by Shadow · Choose an escape", [
        {
          id: "risk",
          label:
            "Each player discards an encounter; a treachery eliminates that player",
          effects: playerOrder(s).map((player) =>
            fx("khazadBlockedRisk", { player }),
          ),
        },
        {
          id: "route",
          label: "Reveal the next quest and put this route beneath the deck",
          effects: [fx("khazadBypass"), fx("khazadFlipQuest")],
        },
      ]);
      break;
    case "khazadBlockedRisk": {
      const c = encounterDraw(s);
      if (c) {
        s.encounterDiscard.push(c);
        if (card(c).type_code === "treachery") {
          s.threat = 50;
          check(s);
        }
        log(s, `Blocked by Shadow discards ${card(c).name}.`);
      }
      break;
    }
    case "khazadCouncil": {
      const k = state(s),
        foes = s.encounterDiscard.filter((c) => c === KHAZAD.foe);
      s.encounterDiscard = s.encounterDiscard.filter((c) => c !== KHAZAD.foe);
      s.encounterDeck.push(...foes);
      shuffle(s, s.encounterDeck);
      const looked = k.questDeck.splice(0, 2);
      choose(
        s,
        "Hasty Council · Choose a revealed route",
        looked.map((q, i) => ({
          id: q,
          label: questDefinition(q).back_name ?? questDefinition(q).name,
          code: q,
          effects: [
            fx("khazadCouncilSelect", {
              code: q,
              ids: looked.filter((_, j) => j !== i),
            }),
          ],
        })),
      );
      break;
    }
    case "khazadCouncilSelect":
      if (questDefeated(s, KHAZAD.council)) {
        enqueue(s, e);
        break;
      }
      state(s).questDeck.push(...(e.ids ?? []));
      newFlightQuest(s, false, e.code);
      prepend(
        s,
        fx("khazadFlipQuest", { player: s.table?.first ?? 0 }),
        fx("khazadCouncilVictory"),
      );
      break;
    case "khazadCouncilVictory":
      addQuestVictory(s, KHAZAD.council);
      break;
    case "khazadNarrowChoice":
      choose(
        s,
        "Narrow Paths · Keep one questing character",
        opts(
          [...s.heroes, ...s.allies].filter((u) => u.committed),
          (u) => [fx("khazadNarrowKeep", { target: u.id })],
        ),
      );
      break;
    case "khazadNarrowKeep":
      if (u) state(s).narrowIds!.push(u.id);
      break;
    case "khazadFindTools": {
      let index = s.encounterDeck.indexOf(KHAZAD.tools),
        disc = s.encounterDiscard.indexOf(KHAZAD.tools);
      if (index >= 0) s.encounterDeck.splice(index, 1);
      else if (disc >= 0) s.encounterDiscard.splice(disc, 1);
      if (index >= 0 || disc >= 0) placeEncounter(s, KHAZAD.tools, true);
      shuffle(s, s.encounterDeck);
      break;
    }
    default:
      return false;
  }
  return true;
}
function armouryLegal(s: GameState, c: Card, u: Unit) {
  const text = c.text ?? "";
  if (
    c.is_unique &&
    allCharacters(s).some((u) => u.attachments.some((a) => a.code === c.code))
  )
    return false;
  if (/Attach to a hero/i.test(text) && card(u.code).type_code !== "hero")
    return false;
  if (/Attach to a.*Dwarf/i.test(text) && !hasTrait(u, "Dwarf")) return false;
  if (/Attach to a.*Gondor/i.test(text) && !hasTrait(u, "Gondor")) return false;
  if (
    /Attach to a.*Noldor.*Silvan/i.test(text) &&
    !hasTrait(u, "Noldor") &&
    !hasTrait(u, "Silvan")
  )
    return false;
  if (/Attach to a.*ranged/i.test(text) && !effectiveKeyword(u, "Ranged"))
    return false;
  if (/Restricted/i.test(text) && restrictedSlots(u) >= restrictedLimit(u))
    return false;
  return true;
}
