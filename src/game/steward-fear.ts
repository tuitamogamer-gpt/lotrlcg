import { selectedSideQuest } from "./side-quest-support";
import { removeCurrentQuestProgress } from "./side-quests";
import { mainQuestCode } from "./quest-state";
import { playerCardImmune } from "./card-immunity";
// Original/easy The Steward's Fear and the shared Streets of Gondor encounter set.
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { spendResources } from "./core";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  requireRule,
  shuffle,
  skip,
  stats,
  units,
} from "./core";
import {
  addVictoryCard,
  advanceQuest,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  exhaustCharacter,
  placeEncounter,
  progressLocation,
  questDefeated,
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
  attachmentController,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
  selectSeat,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isSacked } from "./carrock";
import { heirsCanSpendResources } from "./heirs-numenor";
import {
  STEWARD_FEAR as S,
  STREETS as G,
  STEWARD_CLUES,
  STEWARD_PLOTS,
  STEWARD_VILLAINS,
} from "./steward-fear-support";
export { STEWARD_FEAR, STREETS } from "./steward-fear-support";

const isSteward = (s: GameState) => s.scenarioId === "the-stewards-fear";
const state = (s: GameState) =>
  (s.stewardFear ??= {
    underworldDeck: [],
    underneath: {},
    removedHidden: [],
    questResources: 0,
    pendingUnderworld: [],
  });
const first = (s: GameState) => s.table?.first ?? 0;
const encounterUnits = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
  ...allEngaged(s),
];
const active = (s: GameState, code: string) =>
  encounterUnits(s).some((u) => u.code === code && !u.blanked);
const readyHero = (u: Unit) =>
  card(u.code).type_code === "hero" &&
  !u.exhausted &&
  !isSacked(u) &&
  !khazadCannotExhaust(u) &&
  !watcherWaterCannotExhaust(u);
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
export function setupStewardFear(s: GameState) {
  const q = state(s);
  q.underworldDeck = s.encounterDeck.filter(
    (code) =>
      STEWARD_CLUES.includes(code) ||
      (card(code).type_code === "enemy" &&
        ["Streets of Gondor", "Brigands"].includes(
          card(code).encounter_set ?? "",
        )),
  );
  const plots = shuffle(
      s,
      s.encounterDeck.filter((c) => STEWARD_PLOTS.includes(c)),
    ),
    villains = shuffle(
      s,
      s.encounterDeck.filter((c) => STEWARD_VILLAINS.includes(c)),
    );
  q.hiddenPlot = plots.shift();
  q.hiddenVillain = villains.shift();
  q.removedHidden = [...plots, ...villains];
  q.rootsSetAside = S.roots;
  s.encounterDeck = s.encounterDeck.filter(
    (c) =>
      !q.underworldDeck.includes(c) &&
      !STEWARD_PLOTS.includes(c) &&
      !STEWARD_VILLAINS.includes(c) &&
      c !== S.roots,
  );
  shuffle(s, q.underworldDeck);
  const starIndex = s.encounterDeck.indexOf(S.fourthStar);
  requireRule(
    starIndex >= 0,
    "The Fourth Star must be in the original encounter deck.",
  );
  s.encounterDeck.splice(starIndex, 1);
  const star = make(s, S.fourthStar);
  s.activeLocation = star;
  stewardFearLocationEntered(s, star);
  shuffle(s, s.encounterDeck);
  log(
    s,
    "The Fourth Star is active. The Underworld deck and hidden conspiracy are set aside.",
    "chapter",
  );
}
export const stewardFearQuestProgress = (s: GameState) =>
  isSteward(s) && s.stage < 3;
export function advanceStewardFear(s: GameState): boolean {
  if (!isSteward(s)) return false;
  if (s.stageRevealing || s.phase === "setup" || s.status !== "playing")
    return true;
  const q = state(s);
  if (s.stage === 3) {
    if (
      s.progress >= 15 &&
      !encounterUnits(s).some((u) => STEWARD_VILLAINS.includes(u.code))
    ) {
      if (!questDefeated(s, mainQuestCode(s)!)) win(s);
    }
    return true;
  }
  if (q.questResources < 4 || questDefeated(s, mainQuestCode(s)!)) return true;
  s.stage++;
  s.progress = 0;
  q.questResources = 0;
  s.stageRevealing = true;
  prepend(s, fx("stewardStageReveal", { player: first(s) }));
  return true;
}
export function stewardFearCheck(s: GameState) {
  if (
    active(s, S.flames) &&
    livingSeats(s).some((p) => !seatView(s, p).deck.length)
  )
    lose(s, "Up in Flames: a player's deck is empty. The conspiracy succeeds.");
}
export function stewardFearLocationEntered(s: GameState, u: Unit) {
  if (!isSteward(s) || u.blanked) return;
  const match = /Underworld (\d+|X)\b/i.exec(card(u.code).text ?? "");
  if (!match) return;
  const q = state(s),
    n = match[1] === "X" ? livingSeats(s).length : Number(match[1]);
  q.underneath[u.id] = q.underworldDeck.splice(0, n);
  log(
    s,
    `${name(u)} receives ${q.underneath[u.id].length} facedown Underworld card(s).`,
  );
}
export function stewardFearLocationLeft(
  s: GameState,
  u: Unit,
  explored: boolean,
  wasActive: boolean,
) {
  if (!isSteward(s)) return;
  const q = state(s),
    hidden = q.underneath[u.id] ?? [];
  delete q.underneath[u.id];
  q.pendingUnderworld.unshift(...hidden);
  prepend(
    s,
    ...(hidden.length
      ? [
          fx("stewardUnderworldNext", {
            count: hidden.length,
            player: first(s),
          }),
        ]
      : []),
    ...(explored && wasActive && s.stage < 3
      ? [
          fx("stewardQuestToken", {
            value: 1,
            code: mainQuestCode(s),
            player: first(s),
          }),
        ]
      : []),
    ...(explored && u.code === S.fourthStar && !u.blanked
      ? playerOrder(s).map((player) => fx("stewardStarDraw", { player }))
      : []),
  );
}
export function stewardFearTravelEntered(s: GameState, u: Unit) {
  if (u.code === S.houses && !u.blanked)
    for (const c of allCharacters(s)) exhaustCharacter(s, c);
}
export function stewardFearTravelProblem(s: GameState, u: Unit): string | null {
  if (
    u.code !== G.cityStreet &&
    s.staging.some((l) => l.code === G.cityStreet && !l.blanked)
  )
    return "City Street must be travelled to while it is in staging.";
  if (
    u.code === G.market &&
    !u.blanked &&
    livingSeats(s).some(
      (p) =>
        !seatView(s, p).heroes.some(
          (h) => h.resources >= 1 && heirsCanSpendResources(s, h),
        ),
    )
  )
    return "Market Square requires every player to spend 1 resource from one hero.";
  return null;
}
export function stewardFearTravelEffects(
  s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.code !== G.market || u.blanked) return undefined;
  return playerOrder(s).map((player) =>
    fx("stewardMarketPay", { target: u.id, player }),
  );
}
export const stewardFearLocationQuestBonus = (s: GameState, u: Unit) =>
  s.staging.some((l) => l.id === u.id)
    ? encounterUnits(s).filter((l) => l.code === S.roots && !l.blanked).length *
      2
    : 0;
export const stewardFearEnemyAttackBonus = (s: GameState, u: Unit) =>
  u.code === S.dissident && !u.blanked
    ? encounterUnits(s).filter(
        (l) =>
          card(l.code).type_code === "location" && hasTrait(l, "Underworld"),
      ).length
    : 0;
export const stewardFearExtraRevealCount = (s: GameState) =>
  encounterUnits(s).filter((u) => u.code === S.alliance && !u.blanked).length;
export const stewardFearCannotCancel = (code: string) => code === G.lostCity;
export const stewardFearOptionalEngagementProblem = (
  _s: GameState,
  u: Unit,
): string | null =>
  u.code === S.daughter && !u.blanked
    ? "Daughter of Berúthiel cannot be optionally engaged."
    : null;
export function stewardFearCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (!context.enemyId || !context.combatDamage) return;
  if (
    s.combat?.enemyId === context.enemyId &&
    s.combat.stewardRemoveTokensIfKilled
  ) {
    state(s).questResources = 0;
    s.progress = 0;
  }
  if (card(u.code).type_code === "hero" && active(s, S.alliance))
    lose(s, "Unholy Alliance: a hero was destroyed by an enemy attack.");
}
function trouble(s: GameState, u: Unit) {
  if (card(u.code).type_code !== "hero") return;
  const n = u.attachments.filter(
    (a) => a.code === G.localTrouble && !a.blanked,
  ).length;
  if (n) forOwner(s, ownerOf(s, u), () => raiseThreat(s, n, "encounter"));
}
export const stewardFearCharacterExhausted = trouble;
export const stewardFearCharacterReadied = trouble;
export const stewardFearHeroAbilityTriggered = trouble;
/** Actual accepted triggers, never the optional offer or its declined branch. */
export function stewardHeroResponseEffect(s: GameState, e: Effect) {
  const sourceKinds: Record<string, string> = {
    huntFrodoCancel: "02025",
    longDarkHamaReturn: "04076",
    elfCeleborn: "08001",
    rohanLothirielChoose: "22027",
    shadowFlameElrondHeal: "04128",
    amonPippinReturn: "06056",
    dwarfBifurMove: "03002",
    elfHaldir: "08056",
    bloodCaldaraResolve: "06107",
    foundationsGlorfindelForced: "04101",
  };
  const targetKinds: Record<string, string> = {
    redhornElrohirReady: "04001",
    roadElladanReady: "04028",
    gondorImrahilReady: "02050",
    gondorMablungResource: "08084",
    rohanEomerBoost: "07001",
    marshBoromirReady: "02095",
    marshBoromirDiscard: "02095",
  };
  const controlledKinds: Record<string, string> = {
    collectorNoriThreat: "131003",
    collectorThorinChoose: "22001",
    rohanHirgonChoose: "17055",
  };
  let hero: Unit | undefined;
  if (sourceKinds[e.kind]) hero = get(s, e.source ?? e.target);
  if (targetKinds[e.kind]) hero = get(s, e.target);
  if (controlledKinds[e.kind])
    hero = s.heroes.find((h) => h.code === controlledKinds[e.kind]);
  if (e.kind === "eowynDiscard" && s.hand.some((u) => u.id === e.target))
    hero = allHeroes(s).find((h) => h.code === "01007");
  // Core and older generic response effects carry an explicit printed hero source.
  if (
    ["resource", "ready", "exhaust", "threat", "questProgress"].includes(
      e.kind,
    ) &&
    e.source &&
    e.code &&
    ["01001", "01002", "01008", "02072", "03001", "01005"].includes(e.code)
  )
    hero = get(s, e.source);
  if (
    e.kind === "resource" &&
    (e.value ?? 0) < 0 &&
    e.flag === true &&
    get(s, e.target)?.code === "01011"
  )
    hero = get(s, e.target);
  const expected =
    sourceKinds[e.kind] ??
    targetKinds[e.kind] ??
    controlledKinds[e.kind] ??
    e.code ??
    hero?.code;
  if (
    hero &&
    expected &&
    hero.code === expected &&
    !hero.blanked &&
    !isSacked(hero)
  )
    trouble(s, hero);
}
export function stewardFearAttackStarted(
  s: GameState,
  u: Unit,
  player: number,
) {
  if (u.blanked) return;
  if (u.code === S.bane)
    prepend(
      s,
      ...playerOrder(s).map((p) =>
        fx("stewardDeckDiscard", { count: 3, player: p }),
      ),
    );
  if (u.code === G.pickpocket)
    prepend(
      s,
      fx("stewardPickpocketResource", { target: u.id, player }),
      fx("stewardPickpocketHand", { player }),
    );
}
export function stewardFearAttackFinished(
  s: GameState,
  u: Unit,
  _player: number,
) {
  if (u.blanked) return;
  if (u.code === S.daughter)
    prepend(
      s,
      fx("stewardDaughterReturn", { target: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === S.castamir)
    prepend(s, fx("stewardCastamirReveal", { target: u.id, player: first(s) }));
}
export function stewardFearEventPlayed(s: GameState) {
  prepend(
    s,
    ...encounterUnits(s)
      .filter((u) => u.code === S.bane && !u.blanked)
      .map((u) => fx("immediateAttack", { target: u.id, player: first(s) })),
  );
}
export function stewardFearTreacheryRevealed(
  s: GameState,
  code: string,
  origin: string = "encounter",
) {
  if (origin !== "encounter" || card(code).type_code !== "treachery") return;
  prepend(
    s,
    ...encounterUnits(s)
      .filter((u) => u.code === S.castamir && !u.blanked)
      .map((u) => fx("immediateAttack", { target: u.id, player: first(s) })),
  );
}
export function stewardFearRoundEndEffects(s: GameState): Effect[] {
  return [
    ...encounterUnits(s)
      .filter((u) => u.code === S.counsels && !u.blanked)
      .flatMap((u) =>
        playerOrder(s).map((player) =>
          fx("stewardCounsels", { value: 2, source: u.id, player }),
        ),
      ),
    ...encounterUnits(s)
      .filter((u) => u.code === S.flames && !u.blanked)
      .map((u) => fx("stewardFlames", { target: u.id, player: first(s) })),
  ];
}
export const stewardFearIsClue = (code: string) => STEWARD_CLUES.includes(code);
export function stewardFearClaimProblem(
  s: GameState,
  obj: Unit,
  hero: Unit,
): string | null {
  if (!stewardFearIsClue(obj.code)) return null;
  if (!s.staging.some((u) => u.id === obj.id) || obj.blanked)
    return "Choose a Clue in staging.";
  if (!s.heroes.some((h) => h.id === hero.id) || !readyHero(hero))
    return "Choose a ready hero who can exhaust.";
  return null;
}
export function stewardFearClaim(s: GameState, obj: Unit, hero: Unit): boolean {
  if (!stewardFearIsClue(obj.code)) return false;
  requireRule(
    !stewardFearClaimProblem(s, obj, hero),
    stewardFearClaimProblem(s, obj, hero) ?? "",
  );
  requireRule(exhaustCharacter(s, hero), "The hero cannot exhaust.");
  s.staging = s.staging.filter((u) => u.id !== obj.id);
  if (obj.code === S.map) {
    hero.attachments.push({ id: obj.id, code: obj.code, exhausted: false });
    log(s, `${name(hero)} claims Secret Map.`, "good");
  } else {
    addVictoryCard(s, obj.code);
    state(s).questResources += obj.code === S.prisoner ? 2 : 1;
    log(s, `${name(obj)} is added to the victory display.`, "good");
    advanceQuest(s);
  }
  return true;
}
export function stewardFearAbilityLabel(
  u: Unit,
  attachmentId?: string,
): string | undefined {
  return u.attachments.some((a) => a.id === attachmentId && a.code === S.map)
    ? "Use Secret Map · 3 progress"
    : undefined;
}
export function stewardFearAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (!stewardFearAbilityLabel(u, attachmentId)) return undefined;
  if (!allActiveLocations(s).some((l) => l.blanked || !playerCardImmune(l)))
    return "Secret Map requires an active location that can receive progress.";
  return undefined;
}
export function useStewardFearAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (!stewardFearAbilityLabel(u, attachmentId)) return false;
  requireRule(
    !stewardFearAbilityProblem(s, u, attachmentId),
    stewardFearAbilityProblem(s, u, attachmentId) ?? "",
  );
  const locations = allActiveLocations(s).filter(
    (l) => l.blanked || !playerCardImmune(l),
  );
  choose(
    s,
    "Secret Map · Choose the active location",
    opts(locations, (l) => [
      fx("stewardMapUse", { target: u.id, source: attachmentId, text: l.id }),
    ]),
  );
  return true;
}
export function stewardFearEncounter(
  s: GameState,
  code: string,
  replay = false,
): boolean {
  if (code === S.sewers) {
    const locations = allActiveLocations(s);
    if (isSteward(s) && state(s).underworldDeck.length && locations.length)
      choose(
        s,
        "Sewers · Add an Underworld card",
        opts(locations, (l) => [fx("stewardSewers", { target: l.id })]),
      );
  } else if (code === S.knife) {
    const player = first(s),
      allies = seatView(s, player).allies;
    if (allies.length) {
      const ally = allies[Math.floor(random(s) * allies.length)];
      prepend(
        s,
        fx("stewardKnife", {
          target: ally.id,
          value: stats(s, ally).attack,
          player,
        }),
      );
    } else prepend(s, fx("reveal", { player }));
  } else if (code === S.discovery) {
    if (isSteward(s)) prepend(s, fx("stewardDiscovery", { player: first(s) }));
  } else if (code === S.falseLead && ["quest", "staging"].includes(s.phase)) {
    // The remainder of staging (including Surge) is cancelled by ending the phase.
    s.queue = s.queue.filter(
      (e) =>
        ![
          "reveal",
          "questReady",
          "khazadStagingEnd",
          "questSucceeded",
          "questSuccessResponses",
          "successfulQuestProgress",
        ].includes(e.kind),
    );
    s.lastQuest = null;
    prepend(s, fx("finishQuestPhase", { player: first(s) }));
  } else if (code === S.falseLead) {
    // There is no quest phase to end when Castamir reveals this during combat.
  } else if (code === G.localTrouble) {
    const heroes = allHeroes(s).filter(
      (h) => !h.attachments.some((a) => a.code === code),
    );
    const high = Math.max(...heroes.map((h) => card(h.code).threat ?? 0));
    selectSeat(s, first(s));
    choose(
      s,
      "Local Trouble · Highest printed threat",
      opts(
        heroes.filter((h) => (card(h.code).threat ?? 0) === high),
        (h) => [
          fx("stewardTroubleAttach", { target: h.id, code, flag: replay }),
        ],
      ),
    );
    if (!heroes.length && !replay) s.encounterDiscard.push(code);
    return true;
  } else if (code === G.lostCity) {
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("stewardLostCitySearch", { player }),
      ),
      fx("stewardShuffle"),
    );
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function stewardFearShadow(s: GameState, code: string): boolean {
  const c = s.combat;
  if (!c) return false;
  const undefended = !(
    c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
  ).some((id) => !!get(s, id));
  if (code === S.storehouse) c.attackBonus += undefended ? 2 : 1;
  else if (code === G.cityStreet) c.attackBonus += 2;
  else if (code === S.dissident) {
    if (undefended && isSteward(s)) {
      if (selectedSideQuest(s)) {
        removeCurrentQuestProgress(s, 1);
        return true;
      }
      const q = state(s);
      if (q.questResources > 0 && s.progress > 0) {
        selectSeat(s, first(s));
        choose(s, "Underworld Dissident · Remove 1 quest token", [
          {
            id: "resource",
            label: "Remove 1 resource token",
            effects: [fx("stewardRemoveQuestToken", { flag: true })],
          },
          {
            id: "progress",
            label: "Remove 1 progress token",
            effects: [fx("stewardRemoveQuestToken")],
          },
        ]);
      } else if (q.questResources > 0) q.questResources--;
      else removeCurrentQuestProgress(s, 1);
    }
  } else if (code === S.falseLead) c.stewardRemoveTokensIfKilled = true;
  else if (code === G.lostCity) {
    for (const u of [...s.hand]) discardHandCard(s, u.id);
  } else if (code === G.market) {
    for (const h of s.heroes) h.resources = 0;
  } else if (code === G.pickpocket) {
    const attachments = units(s).flatMap((host) =>
      host.attachments
        .filter((a) => attachmentController(s, host, a) === activeSeat(s))
        .map((a) => ({ host, a })),
    );
    if (undefended)
      for (const { host, a } of attachments) discardAttachment(s, host, a);
    else
      choose(
        s,
        "Pickpocket · Discard an attachment",
        attachments.map(({ host, a }) => ({
          id: a.id,
          label: `${card(a.code).name} · ${name(host)}`,
          code: a.code,
          effects: [fx("discardAttachment", { target: host.id, source: a.id })],
        })),
      );
  } else return false;
  return true;
}
export function handleStewardFearEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "stewardStageReveal": {
      const q = state(s);
      if (s.stage === 2) {
        if (q.hiddenPlot) {
          placeEncounter(s, q.hiddenPlot);
          delete q.hiddenPlot;
        }
        for (const l of allActiveLocations(s)) {
          s.staging.push(l);
        }
        s.activeLocation = null;
        s.extraActiveLocations = [];
        if (q.rootsSetAside) {
          const roots = make(s, q.rootsSetAside);
          delete q.rootsSetAside;
          s.activeLocation = roots;
          stewardFearLocationEntered(s, roots);
          stewardFearTravelEntered(s, roots);
        }
      } else if (s.stage === 3) {
        if (q.hiddenVillain) {
          placeEncounter(s, q.hiddenVillain);
          delete q.hiddenVillain;
        }
        s.encounterDeck.push(...q.underworldDeck.splice(0));
        shuffle(s, s.encounterDeck);
      }
      s.stageRevealing = false;
      log(
        s,
        s.stage === 2
          ? "The Plot is revealed. Roots of Mindolluin becomes active."
          : "The Villain is revealed. The remaining Underworld deck is shuffled into the encounter deck.",
        "chapter",
      );
      break;
    }
    case "stewardUnderworldNext": {
      const code = state(s).pendingUnderworld.shift();
      if (!code || !(e.count ?? 0)) break;
      if ((e.count ?? 0) > 1)
        prepend(
          s,
          fx("stewardUnderworldNext", {
            count: e.count! - 1,
            player: first(s),
          }),
        );
      revealed(s, code, undefined, "underworld");
      break;
    }
    case "stewardRemoveQuestToken":
      if (e.flag)
        state(s).questResources = Math.max(0, state(s).questResources - 1);
      else removeCurrentQuestProgress(s, 1);
      break;
    case "stewardQuestToken":
      if (e.code === mainQuestCode(s) && s.stage < 3) {
        state(s).questResources += e.value ?? 1;
        advanceQuest(s);
      }
      break;
    case "stewardStarDraw":
      choose(s, "The Fourth Star · Draw 1 card?", [
        {
          id: "draw",
          label: "Draw 1 card",
          effects: [fx("draw", { count: 1 })],
        },
        skip,
      ]);
      break;
    case "stewardMarketPay":
      choose(
        s,
        "Market Square · Spend 1 resource",
        opts(
          s.heroes.filter(
            (h) => h.resources > 0 && heirsCanSpendResources(s, h),
          ),
          (h) => [fx("stewardMarketSpend", { target: h.id })],
        ),
        `${seatName(s, activeSeat(s))} must spend from one hero.`,
      );
      break;
    case "stewardMarketSpend":
      requireRule(
        u && u.resources > 0 && heirsCanSpendResources(s, u),
        "This hero cannot spend a resource for Market Square.",
      );
      spendResources(s, u, 1);
      break;
    case "stewardSewers":
      if (u && allActiveLocations(s).some((l) => l.id === u.id)) {
        const code = state(s).underworldDeck.shift();
        if (code) (state(s).underneath[u.id] ??= []).push(code);
      }
      break;
    case "stewardDeckDiscard":
      discardPlayerDeck(s, e.count ?? 3);
      break;
    case "stewardPickpocketResource":
      choose(
        s,
        "Pickpocket · Discard 1 resource",
        opts(
          s.heroes.filter((h) => h.resources > 0),
          (h) => [fx("resource", { target: h.id, value: -1 })],
        ),
      );
      break;
    case "stewardPickpocketHand":
      if (s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      break;
    case "stewardDaughterReturn":
      if (u)
        choose(s, "Daughter of Berúthiel · Prevent her return?", [
          {
            id: "return",
            label: "Return her to staging",
            effects: [fx("stewardReturnEnemy", { target: u.id })],
          },
          {
            id: "prevent",
            label: "Raise threat by 4 to keep her engaged",
            effects: [fx("threat", { value: 4 })],
          },
        ]);
      break;
    case "stewardReturnEnemy":
      if (u) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    case "stewardCastamirReveal": {
      const code = encounterDraw(s);
      if (code) {
        prepend(
          s,
          fx("stewardDiscardRevealed", {
            code,
            ids: units(s).flatMap((x) => [
              x.id,
              ...x.attachments.map((a) => a.id),
            ]),
          }),
        );
        revealed(s, code);
      }
      break;
    }
    case "stewardDiscardRevealed": {
      const fresh = units(s).find(
        (x) => x.code === e.code && !e.ids?.includes(x.id),
      );
      if (fresh) {
        const wasActive = allActiveLocations(s).some((l) => l.id === fresh.id);
        s.staging = s.staging.filter((x) => x.id !== fresh.id);
        forOwner(s, ownerOf(s, fresh), () => {
          s.engaged = s.engaged.filter((x) => x.id !== fresh.id);
        });
        if (s.activeLocation?.id === fresh.id) s.activeLocation = null;
        for (const a of [...fresh.attachments]) discardAttachment(s, fresh, a);
        s.encounterDiscard.push(fresh.code);
        if (card(fresh.code).type_code === "location")
          stewardFearLocationLeft(s, fresh, false, wasActive);
      } else if (e.code === G.localTrouble) {
        for (const h of allHeroes(s))
          for (const a of [...h.attachments].filter(
            (a) => a.code === e.code && !e.ids?.includes(a.id),
          ))
            discardAttachment(s, h, a);
      }
      break;
    }
    case "stewardCounsels":
      raiseThreat(s, 2, "encounter");
      break;
    case "stewardFlames":
      if (u && !u.blanked) {
        u.resources++;
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("stewardFlamesDiscard", { count: u.resources, player }),
          ),
        );
      }
      break;
    case "stewardFlamesDiscard":
      discardPlayerDeck(s, e.count ?? 0);
      stewardFearCheck(s);
      break;
    case "stewardKnife":
      choose(
        s,
        "A Knife in the Back · Damage a hero",
        opts(s.heroes, (h) => [
          fx("damage", { target: h.id, value: e.value }),
          fx("stewardKnifeDiscard", { target: e.target }),
        ]),
        `${u ? name(u) : "The randomly selected ally"} has ${e.value ?? 0} attack.`,
      );
      break;
    case "stewardKnifeDiscard":
      if (u && s.allies.some((a) => a.id === u.id)) discardCharacter(s, u);
      else prepend(s, fx("reveal"));
      break;
    case "stewardDiscovery": {
      const code = state(s).underworldDeck.shift();
      if (!code) break;
      if (STEWARD_CLUES.includes(code)) s.encounterDiscard.push(code);
      else revealed(s, code, undefined, "underworld");
      break;
    }
    case "stewardTroubleAttach":
      if (e.flag) {
        const index = s.encounterDiscard.lastIndexOf(G.localTrouble);
        if (index >= 0) s.encounterDiscard.splice(index, 1);
      }
      if (u)
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: G.localTrouble,
          exhausted: false,
        });
      break;
    case "stewardLostCitySearch": {
      const options = [
        ...s.encounterDeck.map((code, i) => ({ code, i, zone: "deck" })),
        ...s.encounterDiscard.map((code, i) => ({ code, i, zone: "discard" })),
      ].filter(
        ({ code }) =>
          card(code).type_code === "location" &&
          /(?:^|\.)\s*City\s*(?:\.|$)/.test(card(code).traits ?? ""),
      );
      choose(
        s,
        "Lost in the City · Choose a City location",
        options.map(({ code, i, zone }) => ({
          id: `${zone}-${i}`,
          label: `${card(code).name} · ${zone === "deck" ? "Encounter deck" : "Encounter discard"}`,
          code,
          effects: [fx("stewardLostCityPut", { code, value: i, text: zone })],
        })),
      );
      break;
    }
    case "stewardLostCityPut": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      requireRule(
        pile[e.value!] === e.code,
        "Choose the actual City location from the indicated pile.",
      );
      const code = pile.splice(e.value!, 1)[0];
      placeEncounter(s, code, true);
      break;
    }
    case "stewardShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "stewardMapUse": {
      const a = u?.attachments.find(
        (a) => a.id === e.source && a.code === S.map,
      );
      const location = get(s, e.text);
      if (
        u &&
        a &&
        location &&
        allActiveLocations(s).some((l) => l.id === location.id)
      ) {
        u.attachments = u.attachments.filter((x) => x.id !== a.id);
        addVictoryCard(s, a.code);
        progressLocation(s, location, 3);
      }
      break;
    }
    default:
      return false;
  }
  return true;
}
