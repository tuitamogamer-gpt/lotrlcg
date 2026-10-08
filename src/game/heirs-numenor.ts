import { choosePlayerResponse } from "./player-ability-triggers";
import { removeCurrentQuestProgress } from "./side-quests";
import { selectedSideQuest } from "./side-quest-support";
import { mainQuestCode } from "./quest-state";
import { isengardShadowDealt } from "./voice-isengard";
import { bloodGondorArchery } from "./blood-gondor";
import { morgulShadowDealt } from "./morgul-vale";
import { druadanForestArcheryTargets } from "./druadan-forest";
import { assaultOsgiliathArcheryBonus } from "./assault-osgiliath";
// Heirs of Númenor: physical objectives, branching quests and explicit encounter decisions.
import type { Attachment, Effect, GameState, Unit } from "./types";
import { HEIRS_NUMENOR as H } from "./heirs-numenor-support";
export {
  HEIRS_NUMENOR,
  HEIRS_NUMENOR_ENCOUNTERS,
  HEIRS_NUMENOR_QUESTS,
  BRIGANDS_ENCOUNTERS,
} from "./heirs-numenor-support";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  engagementCost,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  stats,
  threatOf,
  units,
} from "./core";
import {
  damage,
  discardCharacter,
  discardAttachment,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  raiseThreat,
  progressLocation,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  removeActiveLocation,
} from "./table";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { syncAttachmentText } from "./attachment-text";
import { currentQuestCode, currentQuestUnit } from "./quest-state";
import type { DamageContext } from "./damage-context";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";

export interface HeirsNumenorState {
  firstEnemyRound?: number;
  removedStages: number[];
  mumakDamage: Record<string, number>;
  roundAssault?: number;
  roundSpiders?: string[];
  phaseRabble?: Record<string, number>;
}
type HeirsState = GameState & { heirsNumenor?: HeirsNumenorState };
const state = (s: GameState) =>
  ((s as HeirsState).heirsNumenor ??= { removedStages: [], mumakDamage: {} });
const isPeril = (s: GameState) =>
  (s.scenarioId as string) === "peril-in-pelargir";
const isIthilien = (s: GameState) =>
  (s.scenarioId as string) === "into-ithilien";
const isSiege = (s: GameState) =>
  (s.scenarioId as string) === "siege-of-cair-andros";
const first = (s: GameState) => s.table?.first ?? 0;
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const scrollHero = (s: GameState) =>
  allHeroes(s).find((h) => h.attachments.some((a) => a.code === H.scroll));
const active = (s: GameState, code: string) =>
  units(s).filter((u) => u.code === code && !u.blanked);
const encounterThreat = (value: number, player: number) =>
  fx("heirsThreat", { value, player });
const liveCharacters = (s: GameState) => [
  ...allCharacters(s),
  ...s.staging.filter((u) => card(u.code).type_code === "objective-ally"),
];

/** Preserve the one physical Scroll through attachment changes and host departures. */
function takeScroll(s: GameState): Attachment | undefined {
  const objective = s.staging.find((u) => u.code === H.scroll);
  if (objective) {
    s.staging = s.staging.filter((u) => u.id !== objective.id);
    return { id: objective.id, code: objective.code, exhausted: false };
  }
  for (const host of units(s)) {
    const a = host.attachments.find((a) => a.code === H.scroll);
    if (a) {
      host.attachments = host.attachments.filter((x) => x.id !== a.id);
      return a;
    }
  }
  return undefined;
}
function attachScroll(s: GameState, host?: Unit) {
  const a = takeScroll(s);
  if (!a) return;
  if (host) {
    delete a.owner;
    if (card(host.code).type_code === "hero") a.owner = ownerOf(s, host);
    host.attachments.push(a);
    log(s, `Alcaron's Scroll attaches to ${name(host)}.`);
  } else {
    const u = make(s, H.scroll);
    u.id = a.id;
    s.staging.push(u);
    log(s, "Alcaron's Scroll returns to the staging area.");
  }
}
export function heirsAttachmentLeaves(
  s: GameState,
  _host: Unit,
  a: Attachment,
): boolean {
  if (a.code !== H.scroll) return false;
  const u = make(s, H.scroll);
  u.id = a.id;
  s.staging.push(u);
  log(s, "Alcaron's Scroll returns to the staging area.");
  return true;
}
export function heirsClaim(s: GameState, objective: Unit, hero: Unit): boolean {
  if (objective.code !== H.scroll) return false;
  requireRule(
    s.staging.some((u) => u.id === objective.id) && !objective.blanked,
    "Alcaron's Scroll must be unattached in staging.",
  );
  requireRule(
    ownerOf(s, hero) === activeSeat(s) && exhaustCharacter(s, hero),
    "Exhaust a ready hero you control to claim Alcaron's Scroll.",
  );
  attachScroll(s, hero);
  return true;
}
export const heirsObjectiveFree = (s: GameState, u: Unit) =>
  u.code === H.scroll && !u.blanked && s.staging.some((x) => x.id === u.id);
export const heirsCanOptionallyEngage = (s: GameState) =>
  !(isPeril(s) && s.stage === 3) && !(isIthilien(s) && s.stage === 3);
export const heirsNoEngagementChecks = (s: GameState) =>
  isIthilien(s) && s.stage === 3;

export function setupHeirs(s: GameState): void {
  if (!isPeril(s) && !isIthilien(s) && !isSiege(s)) return;
  state(s);
  if (isIthilien(s)) {
    for (const code of [H.celador, H.road]) {
      const index = s.encounterDeck.indexOf(code);
      if (index >= 0) s.encounterDeck.splice(index, 1);
    }
    s.activeLocation = make(s, H.road);
    placeEncounter(s, H.celador, true);
    for (const _player of playerOrder(s)) {
      const index = s.encounterDeck.indexOf(H.company);
      if (index >= 0) {
        s.encounterDeck.splice(index, 1);
        placeEncounter(s, H.company, true);
      }
    }
    shuffle(s, s.encounterDeck);
    heirsCheck(s);
    return;
  }
  if (isSiege(s)) {
    for (const code of [H.approach, H.banks, H.citadel]) {
      const index = s.encounterDeck.indexOf(code);
      if (index >= 0) s.encounterDeck.splice(index, 1);
      placeEncounter(s, code, true);
    }
    shuffle(s, s.encounterDeck);
    return;
  }
  if (!isPeril(s)) return;
  for (const code of [H.fish, H.scroll]) {
    const index = s.encounterDeck.indexOf(code);
    if (index >= 0) s.encounterDeck.splice(index, 1);
  }
  s.activeLocation = make(s, H.fish);
  s.staging.push(make(s, H.scroll));
  s.stageRevealing = true;
  prepend(
    s,
    fx("heirsSetupScroll", { player: first(s) }),
    fx("heirsPerilStageOne", { player: first(s) }),
  );
}
export function advanceHeirs(s: GameState): boolean {
  if (!isPeril(s) && !isIthilien(s) && !isSiege(s)) return false;
  const emptyBattleground =
    isSiege(s) && s.stage === 1 && !battlegrounds(s).length;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.pendingQuestDefeat ||
    (!emptyBattleground && (s.choice || s.queue.length))
  )
    return true;
  const goal = isPeril(s)
    ? [6, 13, 15][s.stage - 1]
    : isIthilien(s)
      ? [15, 9, 12, 15][s.stage - 1]
      : [9, 9, 7, 5, 15][s.stage - 1];
  if (!emptyBattleground && s.progress < goal) return true;
  if (isPeril(s) && s.stage >= 2 && !scrollHero(s)) return true;
  if (questDefeated(s, mainQuestCode(s)!)) return true;
  if (
    (isPeril(s) && s.stage === 3) ||
    (isIthilien(s) && s.stage === 4) ||
    (isSiege(s) && s.stage === 5)
  ) {
    win(s);
    return true;
  }
  if (isIthilien(s)) {
    s.stage =
      s.stage === 1 ? (s.staging.some((u) => u.code === H.celador) ? 3 : 2) : 4;
  } else {
    s.stage++;
    if (isSiege(s)) while (state(s).removedStages.includes(s.stage)) s.stage++;
  }
  s.progress = 0;
  s.stageRevealing = true;
  if (isIthilien(s)) {
    log(
      s,
      `Stage ${s.stage} · ${["Ambush in Ithilien", "Southron Counter-attack", "The Hidden Way", "Approaching Cair Andros"][s.stage - 1]}`,
      "chapter",
    );
    prepend(
      s,
      ...(s.stage === 3 ? [fx("heirsTakeRangers", { player: first(s) })] : []),
      fx("heirsStageReady"),
    );
    return true;
  }
  if (isSiege(s)) {
    log(
      s,
      `Stage ${s.stage} · ${["The Defense", "Reinforcing the Banks", "Breakthrough at the Approach", "Breakthrough at the Citadel", "The Last Battle"][s.stage - 1]}`,
      "chapter",
    );
    prepend(
      s,
      ...(s.stage === 5
        ? playerOrder(s).map((player) => fx("reveal", { player }))
        : []),
      fx("heirsStageReady"),
    );
    return true;
  }
  log(
    s,
    `Stage ${s.stage} · ${s.stage === 2 ? "Fighting in the Streets" : "Escape to the Quays"}`,
    "chapter",
  );
  if (s.stage === 2)
    prepend(
      s,
      fx("heirsPerilStageTwo", { player: first(s) }),
      fx("heirsStageReady"),
    );
  else
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("heirsSearchEnemy", { player })),
      fx("heirsShuffle"),
      fx("heirsStageReady"),
    );
  return true;
}
export function heirsStats(s: GameState, u: Unit) {
  const q = (s as HeirsState).heirsNumenor;
  const docks =
    card(u.code).type_code === "enemy"
      ? allActiveLocations(s).filter((l) => l.code === H.docks && !l.blanked)
          .length
      : 0;
  const company =
    u.code === H.company && !u.blanked && heirsBattleOrSiege(s) ? 2 : 0;
  const assault = ["hero", "ally", "objective-ally"].includes(
    card(u.code).type_code,
  )
    ? 2 * (q?.roundAssault ?? 0)
    : 0;
  const spider = q?.roundSpiders?.includes(u.id)
    ? liveCharacters(s).filter((c) => !c.committed).length
    : 0;
  const rabble = q?.phaseRabble?.[u.id] ?? 0;
  return {
    attack: docks + company + spider + rabble - assault,
    defense: docks - assault,
    threat: company,
  };
}
export function heirsQuestStat(
  s: GameState,
): "will" | "attack" | "defense" | null {
  if (
    isIthilien(s) &&
    s.stage === 4 &&
    playerOrder(s).some((p) => seatView(s, p).threat >= 37)
  )
    return "defense";
  if (isSiege(s) && s.stage === 5 && s.victory >= 4) return "attack";
  return null;
}
function questKeyword(s: GameState, keyword: string) {
  const stat = selectedSideQuest(s) ? null : heirsQuestStat(s),
    code = currentQuestCode(s);
  if (stat) return stat === (keyword === "Battle" ? "attack" : "defense");
  return (
    (!!code &&
      new RegExp(`(?:^|[.\\n]\\s*)${keyword}(?:[.\\s]|$)`, "i").test(
        card(code).back_text ?? card(code).text ?? "",
      )) ||
    (keyword === "Battle" &&
      playerOrder(s).some((p) =>
        seatView(s, p).used.includes(
          `phase:trained-war:${currentQuestUnit(s)?.id}`,
        ),
      ))
  );
}
const heirsBattleOrSiege = (s: GameState) =>
  questKeyword(s, "Battle") || questKeyword(s, "Siege");
export const heirsStagingQuestCharacters = (s: GameState) =>
  s.staging.filter(
    (u) => [H.celador, H.guardian].includes(u.code) && !u.blanked,
  );
const battlegrounds = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && hasTrait(u, "Battleground"),
  );
export const heirsStagingThreatBonus = (s: GameState) =>
  isSiege(s) && s.stage === 4 ? 5 : 0;
export const heirsStagingCountBonus = (s: GameState) =>
  isSiege(s) && s.stage === 2 ? 1 : 0;
export const heirsCanDefend = (_s: GameState, enemy: Unit, defender: Unit) =>
  enemy.code !== H.lieutenant ||
  !!enemy.blanked ||
  !["ally", "objective-ally"].includes(card(defender.code).type_code);
export const heirsCanSpendResources = (s: GameState, hero: Unit) =>
  !s.staging.some((u) => u.code === H.vanguard && !u.blanked) ||
  !["leadership", "spirit", "lore"].some((sphere) =>
    hasResourceIcon(hero, sphere),
  );
export const heirsEngagementCost = (
  s: GameState,
  enemy: Unit,
): number | null =>
  card(enemy.code).type_code === "enemy" &&
  s.staging.some((u) => u.id === enemy.id) &&
  allActiveLocations(s).some((l) => l.code === H.road && !l.blanked)
    ? 0
    : null;
export const heirsCannotHaveAttachments = (u: Unit) =>
  !u.blanked &&
  /cannot have attachments/i.test(
    (card(u.code).text ?? "").replace(/<[^>]*>/g, ""),
  );
export const heirsLocationProgressBlocked = (s: GameState, u: Unit) =>
  u.code === H.camp &&
  !u.blanked &&
  s.staging.some((l) => l.id === u.id) &&
  enemies(s).some((enemy) => hasTrait(enemy, "Orc"));
export const heirsDamageAmount = (s: GameState, u: Unit, value: number) =>
  u.code === H.mumak && !u.blanked
    ? Math.min(
        value,
        Math.max(
          0,
          3 - ((s as HeirsState).heirsNumenor?.mumakDamage[u.id] ?? 0),
        ),
      )
    : value;
export function heirsRoundEnd(s: GameState) {
  if (isIthilien(s) && s.stage === 4)
    prepend(s, ...playerOrder(s).map((p) => encounterThreat(2, p)));
  const q = (s as HeirsState).heirsNumenor;
  if (q) {
    q.mumakDamage = {};
    q.roundSpiders = [];
    q.roundAssault = 0;
  }
}
export function heirsPhaseEnd(s: GameState) {
  const q = (s as HeirsState).heirsNumenor;
  if (q) q.phaseRabble = {};
}
export function heirsShadowDealt(s: GameState, enemy: Unit) {
  morgulShadowDealt(s, enemy);
  isengardShadowDealt(s, enemy);
  if (enemy.code === H.rabble && !enemy.blanked) {
    const counts = (state(s).phaseRabble ??= {});
    counts[enemy.id] = (counts[enemy.id] ?? 0) + 2;
  }
}
export function heirsCharacterLeaves(s: GameState, _u: Unit) {
  prepend(
    s,
    ...active(s, H.celador).map((c) =>
      fx("damage", { target: c.id, value: 1, player: first(s) }),
    ),
  );
}
/** Called before ordinary discard destinations, including elimination and return effects. */
export function heirsRemoveCharacter(s: GameState, u: Unit): boolean {
  if (u.code !== H.celador || u.blanked) return false;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.allies = s.allies.filter((x) => x.id !== u.id);
    });
  s.removed.push(u.code);
  return true;
}
export function heirsCheck(s: GameState) {
  for (const c of s.staging.filter((u) =>
    [H.celador, H.guardian].includes(u.code),
  ))
    c.committed = !c.blanked;
  for (const u of enemies(s).filter(heirsCannotHaveAttachments))
    for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  for (const u of battlegrounds(s)) {
    const maximum =
      u.code === H.banks
        ? 3
        : u.code === H.approach
          ? 7
          : u.code === H.citadel
            ? 11
            : Infinity;
    if (!u.blanked && u.damage >= maximum) {
      s.staging = s.staging.filter((x) => x.id !== u.id);
      removeActiveLocation(s, u.id);
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      s.removed.push(u.code);
      log(
        s,
        `${name(u)} is destroyed and removed without victory points.`,
        "danger",
      );
    }
  }
}
export function heirsQuestFailed(s: GameState): boolean {
  const celador = active(s, H.celador).map((c) =>
    fx("damage", { target: c.id, value: 1, player: first(s) }),
  );
  const replace = isSiege(s) && s.stage === 3;
  prepend(
    s,
    ...celador,
    ...(replace
      ? playerOrder(s).map((player) => fx("heirsFailureDiscard", { player }))
      : []),
  );
  return replace;
}
export function heirsExplored(s: GameState, u: Unit) {
  if (!isSiege(s) || u.blanked) return;
  const stage =
    u.code === H.banks
      ? 2
      : u.code === H.approach
        ? 3
        : u.code === H.citadel
          ? 4
          : 0;
  if (stage > s.stage && !state(s).removedStages.includes(stage))
    prepend(
      s,
      fx("heirsRemoveStageResponse", {
        source: u.id,
        value: stage,
        code: u.code,
        player: first(s),
      }),
    );
}
export function heirsUndefendedDamage(
  s: GameState,
  enemy: Unit,
  value: number,
): boolean {
  if (!isSiege(s) || s.stage !== 1) return false;
  const locations = battlegrounds(s),
    lowest = Math.min(...locations.map((l) => statsThreat(s, l))),
    targets = locations.filter((l) => statsThreat(s, l) === lowest);
  if (!targets.length) return false;
  prepend(
    s,
    fx("heirsUndefendedLocation", {
      ids: targets.map((l) => l.id),
      source: enemy.id,
      value,
      player: first(s),
    }),
  );
  return true;
}
const statsThreat = (s: GameState, u: Unit) => threatOf(s, u);
/** Called once for each actual top-of-deck discard, before subsequent effects. */
export function heirsEncounterTopDiscarded(s: GameState, code: string) {
  if (card(code).type_code !== "location") return;
  syncAttachmentText(s);
  prepend(
    s,
    ...active(s, H.storehouse).flatMap(() =>
      playerOrder(s).map((p) => encounterThreat(1, p)),
    ),
  );
}
export function heirsDiscardEncounterTop(s: GameState): string | undefined {
  const code = encounterDraw(s);
  if (!code) return;
  s.encounterDiscard.push(code);
  heirsEncounterTopDiscarded(s, code);
  return code;
}
export function heirsThreatRaised(
  s: GameState,
  player: number,
  amount: number,
) {
  if (amount <= 0) return;
  syncAttachmentText(s);
  const bearer = scrollHero(s);
  if (!bearer || ownerOf(s, bearer) !== player) return;
  prepend(
    s,
    ...active(s, H.thug)
      .filter((u) => !seatView(s, player).engaged.some((e) => e.id === u.id))
      .map((u) => fx("heirsThugEngage", { target: u.id, player })),
  );
}
export function heirsQuestStart(s: GameState) {
  syncAttachmentText(s);
  if (!scrollHero(s)) return;
  for (const fish of active(s, H.fish))
    prepend(
      s,
      fx("heirsFishDiscard", {
        source: fish.id,
        count: playerOrder(s).length,
        player: first(s),
      }),
    );
}
export function heirsEnemyEntered(
  s: GameState,
  enemy: Unit,
  fromReveal: boolean,
) {
  if (enemy.code === H.elite && !enemy.blanked)
    prepend(s, fx("immediateAttack", { target: enemy.id, player: first(s) }));
  if (
    isPeril(s) &&
    s.stage === 3 &&
    fromReveal &&
    state(s).firstEnemyRound !== s.round
  ) {
    state(s).firstEnemyRound = s.round;
    const bearer = scrollHero(s);
    if (bearer)
      prepend(
        s,
        fx("immediateAttack", { target: enemy.id, player: ownerOf(s, bearer) }),
      );
  }
}
export function heirsEngaged(
  s: GameState,
  enemy: Unit,
  player: number,
  optional: boolean,
) {
  if (enemy.blanked) return;
  if (enemy.code === H.bandit)
    for (const h of seatView(s, player).heroes)
      h.resources = Math.max(0, h.resources - (optional ? 1 : 2));
  if (enemy.code === H.traitor)
    prepend(
      s,
      ...seatView(s, player).allies.map((a) =>
        fx("damage", { target: a.id, value: optional ? 1 : 2, player }),
      ),
    );
  if (enemy.code === H.assassin)
    prepend(
      s,
      fx("heirsAssassin", { target: enemy.id, flag: optional, player }),
    );
  if (enemy.code === H.arsonist)
    for (const e of seatView(s, player).engaged) {
      const code = encounterDraw(s, true);
      if (code) {
        e.shadows.push(code);
        heirsShadowDealt(s, e);
      }
    }
}
export function heirsCombatStart(s: GameState) {
  syncAttachmentText(s);
  let amount =
    active(s, H.assassin).length * 2 +
    assaultOsgiliathArcheryBonus(s) +
    bloodGondorArchery(s);
  amount += active(s, H.mercenaries).length * playerOrder(s).length;
  const icons = ["leadership", "tactics", "spirit", "lore"].filter((sphere) =>
    allHeroes(s).some((h) => hasResourceIcon(h, sphere)),
  ).length;
  amount += active(s, H.arbalesters).length * icons;
  if (isIthilien(s) && s.stage === 2) amount += playerOrder(s).length;
  if (amount)
    prepend(s, fx("heirsArchery", { value: amount, player: first(s) }));
}
type ScrollCombat = NonNullable<GameState["combat"]> & {
  heirsScrollDamage?: boolean;
};
export function heirsForcedCombatDamageTarget(s: GameState): Unit | undefined {
  return (s.combat as ScrollCombat | null)?.heirsScrollDamage
    ? scrollHero(s)
    : undefined;
}
export const heirsCombatDamageTarget = (s: GameState, target: Unit) =>
  heirsForcedCombatDamageTarget(s) ?? target;
/** Damage was actually dealt: resolve the Scroll Forced transfer before lethal host removal. */
export function heirsDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (value > 0 && u.code === H.mumak)
    state(s).mumakDamage[u.id] = (state(s).mumakDamage[u.id] ?? 0) + value;
  if (value <= 0 || !context.combatDamage || !context.enemyId) return;
  const a = u.attachments.find((a) => a.code === H.scroll && !a.blanked),
    enemy = get(s, context.enemyId);
  if (a && card(u.code).type_code === "hero" && enemy) attachScroll(s, enemy);
}
export const heirsCannotCancel = (code: string) =>
  [H.lieutenant, H.power].includes(code);
export function heirsEncounter(
  s: GameState,
  code: string,
  replay = false,
): boolean {
  const fresh = s.staging.filter((u) => u.code === code).at(-1);
  if (code === H.collateral)
    prepend(
      s,
      fx("heirsCollateral", {
        count: 2,
        value: 0,
        player: first(s),
        text: replay ? "replay" : undefined,
      }),
    );
  else if (code === H.lurking) {
    const returning = allEngaged(s).filter((u) => hasTrait(u, "Brigand"));
    if (!returning.length)
      prepend(s, fx("amonSurgeWindow", { code }), fx("reveal"));
    else
      prepend(
        s,
        ...returning.map((u) => fx("heirsReturnStaging", { target: u.id })),
      );
  } else if (code === H.wargs)
    prepend(
      s,
      ...liveCharacters(s)
        .filter((u) => u.committed)
        .map((u) => fx("damage", { target: u.id, value: 1 })),
    );
  else if (code === H.bat)
    prepend(s, fx("heirsForestBat", { player: first(s) }));
  else if (code === H.guardian)
    prepend(s, fx("amonSurgeWindow", { code }), fx("reveal"));
  else if (code === H.spider && fresh)
    (state(s).roundSpiders ??= []).push(fresh.id);
  else if (code === H.lostCompanion)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("heirsLostCompanion", { player })),
      fx("heirsLostCompanionFinish"),
    );
  else if (code === H.watcher) {
    const count = liveCharacters(s).filter((u) => u.committed).length;
    prepend(
      s,
      ...playerOrder(s).map((p) => encounterThreat(count, p)),
      ...(heirsBattleOrSiege(s)
        ? [fx("amonSurgeWindow", { code }), fx("reveal")]
        : []),
    );
  } else if (code === H.support)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("heirsSearchEnemy", { player, flag: true }),
      ),
      fx("heirsShuffle"),
    );
  else if (code === H.ram)
    prepend(
      s,
      ...allActiveLocations(s)
        .filter((u) => hasTrait(u, "Battleground"))
        .map((u) => fx("damage", { target: u.id, value: 3 })),
    );
  else if (code === H.scramblers)
    prepend(
      s,
      ...battlegrounds(s).map((u) => fx("damage", { target: u.id, value: 1 })),
    );
  else if (code === H.raft)
    prepend(s, fx("heirsLowestBattleground", { value: 2, player: first(s) }));
  else if (code === H.assault)
    state(s).roundAssault = (state(s).roundAssault ?? 0) + 1;
  else if (code === H.scourge) {
    let cost = 0;
    for (const p of playerOrder(s)) {
      const discarded = discardPlayerDeck(s, 1, p);
      for (const c of discarded) {
        const printedCost = Number(card(c).cost);
        if (Number.isFinite(printedCost)) cost += printedCost;
      }
    }
    s.threatModifier += cost;
  } else if (code === H.malice)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("heirsMalice", { player })),
    );
  else if (code === H.power)
    prepend(
      s,
      fx("heirsPower", {
        player: first(s),
        text: replay ? "replay" : undefined,
      }),
    );
  else if (code === H.lieutenant) {
    const treachery = [...s.encounterDiscard]
      .reverse()
      .find((code) => card(code).type_code === "treachery");
    if (treachery)
      prepend(
        s,
        fx("resolvePrintedWhenRevealed", { code: treachery, player: first(s) }),
      );
  } else if (
    !Object.values(H).includes(code) ||
    card(code).type_code === "quest"
  )
    return false;
  if (
    !replay &&
    card(code).type_code === "treachery" &&
    ![H.collateral, H.power].includes(code)
  )
    s.encounterDiscard.push(code);
  return true;
}
export function heirsShadow(s: GameState, code: string): boolean {
  const combat = s.combat,
    enemy = get(s, combat?.enemyId);
  if (!combat || !enemy) return false;
  if ([H.collateral, H.thug].includes(code))
    (combat as ScrollCombat).heirsScrollDamage = true;
  else if ([H.lurking, H.road].includes(code)) combat.returnToStaging = true;
  else if (code === H.storehouse)
    prepend(
      s,
      fx("heirsExtraShadows", {
        target: enemy.id,
        count: enemies(s).filter((u) => hasTrait(u, "Thug")).length,
      }),
    );
  else if (code === H.wargs)
    prepend(
      s,
      ...(
        combat.defenderIds ?? (combat.defenderId ? [combat.defenderId] : [])
      ).map((target) => fx("damage", { target, value: 1 })),
    );
  else if (code === H.bat)
    prepend(
      s,
      encounterThreat(threatOf(s, enemy), combat.attackPlayer ?? activeSeat(s)),
    );
  else if (code === H.guardian)
    prepend(s, fx("damage", { target: enemy.id, value: 2 }));
  else if (code === H.company)
    combat.attackBonus += heirsBattleOrSiege(s) ? 2 : 1;
  else if (code === H.mercenaries)
    combat.attackBonus += hasTrait(enemy, "Harad") ? 3 : 1;
  else if (code === H.arbalesters) combat.attackBonus += 2;
  else if (code === H.elite)
    (
      combat as ScrollCombat & { heirsRepeatAttack?: boolean }
    ).heirsRepeatAttack = true;
  else if ([H.trail, H.glade].includes(code))
    removeCurrentQuestProgress(s, threatOf(s, enemy));
  else if (code === H.watcher)
    prepend(
      s,
      ...playerOrder(s).map((p) =>
        encounterThreat(seatView(s, p).engaged.length, p),
      ),
    );
  else if (code === H.assault)
    prepend(
      s,
      ...battlegrounds(s).map((u) => fx("damage", { target: u.id, value: 2 })),
    );
  else if ([H.ram, H.raft, H.scramblers].includes(code)) {
    const targetCode =
        code === H.ram ? H.approach : code === H.raft ? H.banks : H.citadel,
      location = units(s).find((u) => u.code === targetCode);
    if (location) prepend(s, fx("damage", { target: location.id, value: 2 }));
    else combat.attackBonus += 2;
  } else if ([H.arsonist, H.scourge].includes(code)) {
    combat.attackBonus++;
    prepend(s, fx("heirsExtraShadows", { target: enemy.id, count: 1 }));
  } else if (code === H.rabble)
    prepend(
      s,
      fx("heirsExtraShadows", {
        target: enemy.id,
        count: playerOrder(s).length,
      }),
    );
  else if (code === H.vanguard)
    prepend(s, fx("heirsExtraShadows", { target: enemy.id, count: 2 }));
  else if (code === H.camp) combat.attackBonus += enemy.shadows.length;
  else return false;
  return true;
}
export function heirsAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  return (combat as typeof combat & { heirsRepeatAttack?: boolean })
    .heirsRepeatAttack && get(s, combat.enemyId)
    ? [
        fx("immediateAttack", {
          target: combat.enemyId,
          player: combat.attackPlayer ?? activeSeat(s),
        }),
      ]
    : [];
}
export const heirsAbilityLabel = (code: string) =>
  code === H.trail ? "Exhaust a Ranger · Place 3 progress" : null;
const readyRangers = (s: GameState) =>
  s.heroes
    .concat(s.allies)
    .filter(
      (c) =>
        !c.exhausted &&
        hasTrait(c, "Ranger") &&
        !khazadCannotExhaust(c) &&
        !watcherWaterCannotExhaust(c),
    );
export function heirsAbilityProblem(s: GameState, u: Unit): string | null {
  if (u.code !== H.trail) return null;
  if (s.phase === "setup") return "Wait for an action window.";
  if (u.blanked || !units(s).some((x) => x.id === u.id))
    return "Overgrown Trail must remain active in play.";
  if (!readyRangers(s).length)
    return "Exhaust a ready Ranger character you control.";
  return null;
}
export function useHeirsAbility(s: GameState, u: Unit): boolean {
  if (u.code !== H.trail) return false;
  requireRule(!heirsAbilityProblem(s, u), heirsAbilityProblem(s, u) ?? "");
  choose(
    s,
    "Overgrown Trail · Exhaust a Ranger",
    opts(readyRangers(s), (c) => [
      fx("heirsTrail", { target: u.id, source: c.id }),
    ]),
  );
  return true;
}
export function handleHeirsEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "heirsTakeRangers": {
      const rangers = s.staging.filter(
        (u) =>
          card(u.code).type_code === "objective-ally" && hasTrait(u, "Ranger"),
      );
      s.staging = s.staging.filter((u) => !rangers.some((r) => r.id === u.id));
      for (const ranger of rangers) {
        ranger.committed = false;
        ranger.owner = activeSeat(s);
        s.allies.push(ranger);
      }
      break;
    }
    case "heirsForestBat": {
      const heroes = allHeroes(s).filter((h) => h.committed);
      if (heroes.length)
        choose(
          s,
          "Forest Bat · Damage and remove a questing hero",
          opts(heroes, (h) => [fx("heirsForestBatResolve", { target: h.id })]),
        );
      break;
    }
    case "heirsForestBatResolve":
      if (u) {
        damage(s, u.id, 2);
        const surviving = get(s, u.id);
        if (surviving) surviving.committed = false;
      }
      break;
    case "heirsLostCompanion": {
      const characters = s.heroes.concat(s.allies).filter((u) => u.committed);
      if (characters.length)
        choose(
          s,
          "Lost Companion · Remove one character from the quest",
          opts(characters, (u) => [fx("uncommit", { target: u.id })]),
        );
      break;
    }
    case "heirsLostCompanionFinish":
      if (
        playerOrder(s).some(
          (p) =>
            !seatView(s, p)
              .heroes.concat(seatView(s, p).allies)
              .some((u) => u.committed),
        )
      )
        for (const c of liveCharacters(s)) c.committed = false;
      break;
    case "heirsFailureDiscard": {
      const characters = s.heroes.concat(s.allies);
      if (characters.length)
        choose(
          s,
          "Breakthrough at the Approach · Discard a character",
          opts(characters, (c) => [
            fx("heirsDiscardCharacter", { target: c.id }),
          ]),
        );
      break;
    }
    case "heirsDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "heirsRemoveStageResponse":
      choosePlayerResponse(
        s,
        e.source ?? e.code!,
        e.code!,
        `${card(e.code!).name} · Remove stage ${e.value}`,
        [
          {
            id: "remove",
            label: `Remove stage ${e.value} from the quest deck`,
            effects: [fx("heirsRemoveStage", { value: e.value })],
          },
          {
            id: "skip",
            label: "Continue without removing the stage",
            effects: [],
          },
        ],
      );
      break;
    case "heirsRemoveStage":
      if (e.value! > s.stage && !state(s).removedStages.includes(e.value!))
        state(s).removedStages.push(e.value!);
      break;
    case "heirsLowestBattleground": {
      const locations = battlegrounds(s),
        lowest = Math.min(...locations.map((l) => threatOf(s, l))),
        targets = locations.filter((l) => threatOf(s, l) === lowest);
      if (targets.length > 1)
        choose(
          s,
          "Choose the lowest threat Battleground",
          opts(targets, (l) => [
            fx("damage", { target: l.id, value: e.value }),
          ]),
        );
      else if (targets[0]) damage(s, targets[0].id, e.value ?? 0);
      break;
    }
    case "heirsUndefendedLocation": {
      const targets = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u);
      if (targets.length > 1)
        choose(
          s,
          `Assign ${e.value} undefended damage to the lowest threat Battleground`,
          opts(targets, (l) => [
            fx("heirsLocationCombatDamage", {
              target: l.id,
              value: e.value,
              source: e.source,
            }),
          ]),
        );
      else if (targets[0])
        damage(s, targets[0].id, e.value ?? 0, {
          enemyId: e.source,
          combatDamage: true,
        });
      break;
    }
    case "heirsLocationCombatDamage":
      if (u)
        damage(s, u.id, e.value ?? 0, {
          enemyId: e.source,
          combatDamage: true,
        });
      break;
    case "heirsMalice":
      choose(
        s,
        "The Master's Malice · Choose a sphere",
        ["leadership", "tactics", "spirit", "lore"].map((sphere) => ({
          id: sphere,
          label: sphere[0].toUpperCase() + sphere.slice(1),
          effects: [fx("heirsMaliceDamage", { text: sphere })],
        })),
      );
      break;
    case "heirsMaliceDamage":
      prepend(
        s,
        ...s.heroes
          .concat(s.allies)
          .filter((c) => card(c.code).sphere_code !== e.text)
          .map((c) => fx("damage", { target: c.id, value: 3 })),
      );
      break;
    case "heirsPower": {
      const returning = s.staging.filter(
          (u) => card(u.code).sphere_code === "encounter",
        ),
        count = returning.length;
      s.staging = s.staging.filter(
        (u) => !returning.some((r) => r.id === u.id),
      );
      for (const u of returning) {
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        if (!heirsRemoveCharacter(s, u)) s.encounterDeck.push(u.code);
        if (card(u.code).type_code === "objective-ally")
          heirsCharacterLeaves(s, u);
      }
      shuffle(s, s.encounterDeck);
      prepend(
        s,
        ...Array.from({ length: count }, () =>
          fx("reveal", { player: first(s) }),
        ),
        ...(e.text === "replay"
          ? []
          : [fx("heirsFinishTreachery", { code: H.power })]),
      );
      break;
    }
    case "heirsTrail": {
      const ranger = get(s, e.source);
      requireRule(
        u &&
          ranger &&
          !u.blanked &&
          hasTrait(ranger, "Ranger") &&
          ownerOf(s, ranger) === activeSeat(s) &&
          exhaustCharacter(s, ranger),
        "Exhaust a ready Ranger you control while Overgrown Trail remains in play.",
      );
      progressLocation(s, u, 3);
      break;
    }
    case "heirsThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "heirsSetupScroll":
      choose(
        s,
        "Attach Alcaron's Scroll to a hero",
        opts(allHeroes(s), (h) => [fx("heirsAttachScroll", { target: h.id })]),
      );
      break;
    case "heirsAttachScroll":
      if (u) attachScroll(s, u);
      break;
    case "heirsPerilStageOne":
      for (const _player of playerOrder(s)) {
        const index = s.encounterDeck.indexOf(H.thug);
        if (index >= 0) {
          s.encounterDeck.splice(index, 1);
          placeEncounter(s, H.thug, true);
        }
      }
      shuffle(s, s.encounterDeck);
      s.stageRevealing = false;
      break;
    case "heirsPerilStageTwo": {
      const candidates = enemies(s),
        max = Math.max(...candidates.map((u) => engagementCost(s, u)));
      const highest = candidates.filter((u) => engagementCost(s, u) === max);
      if (highest.length > 1)
        choose(
          s,
          "Attach Alcaron's Scroll to the highest engagement cost enemy",
          opts(highest, (u) => [fx("heirsAttachScroll", { target: u.id })]),
        );
      else attachScroll(s, highest[0]);
      break;
    }
    case "heirsStageReady":
      s.stageRevealing = false;
      break;
    case "heirsShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "heirsSearchEnemy": {
      const options = [
        ...s.encounterDeck.map((code, i) => ({ code, i, zone: "deck" })),
        ...s.encounterDiscard.map((code, i) => ({ code, i, zone: "discard" })),
      ].filter(
        ({ code }) =>
          card(code).type_code === "enemy" &&
          (!e.flag || /Harad\b/.test(card(code).traits ?? "")),
      );
      if (options.length)
        choose(
          s,
          "Choose an enemy to add to staging",
          options.map(({ code, i, zone }) => ({
            id: `${zone}:${i}`,
            label: `${card(code).name} · ${zone}`,
            code,
            effects: [fx("heirsSearchAdd", { code, value: i, text: zone })],
          })),
        );
      break;
    }
    case "heirsSearchAdd": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      requireRule(
        pile[e.value!] === e.code,
        "Choose the same physical encounter card.",
      );
      pile.splice(e.value!, 1);
      placeEncounter(s, e.code!, true);
      break;
    }
    case "heirsThugEngage":
      if (u) engage(s, u);
      break;
    case "heirsReturnStaging":
      if (u && allEngaged(s).some((x) => x.id === u.id)) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    case "heirsAssassin": {
      const heroes = s.heroes;
      if (heroes.length)
        choose(
          s,
          e.flag
            ? "Umbar Assassin · Deal 3 damage to a hero"
            : "Umbar Assassin · Discard a hero",
          opts(heroes, (h) => [
            fx("heirsAssassinResolve", { target: h.id, flag: e.flag }),
          ]),
        );
      break;
    }
    case "heirsAssassinResolve":
      if (u) {
        if (e.flag) damage(s, u.id, 3);
        else discardCharacter(s, u);
      }
      break;
    case "heirsArchery": {
      const remaining = e.value ?? 0;
      if (remaining <= 0) break;
      const characters = druadanForestArcheryTargets(
        s,
        liveCharacters(s).filter((u) => u.damage < stats(s, u).health),
      );
      if (characters.length)
        choose(
          s,
          `Assign Archery damage · ${remaining} remaining`,
          opts(characters, (u) => [
            fx("damage", { target: u.id, value: 1 }),
            fx("heirsArchery", { value: remaining - 1, player: first(s) }),
          ]),
          "Divide this damage among characters in play. Defense does not reduce Archery damage.",
        );
      break;
    }
    case "heirsFishDiscard": {
      if ((e.count ?? 0) <= 0) break;
      const before = s.queue.length,
        code = heirsDiscardEncounterTop(s);
      if (!code) break;
      const forced = s.queue.splice(0, s.queue.length - before);
      if (card(code).type_code === "enemy") {
        const index = s.encounterDiscard.lastIndexOf(code);
        s.encounterDiscard.splice(index, 1);
        placeEncounter(s, code, true);
      }
      prepend(
        s,
        ...forced,
        fx("heirsFishDiscard", {
          count: e.count! - 1,
          source: e.source,
          player: first(s),
        }),
      );
      break;
    }
    case "heirsCollateral": {
      if ((e.count ?? 0) <= 0) {
        if (!e.flag) {
          prepend(
            s,
            fx("heirsCollateral", {
              count:
                2 * s.encounterDiscard.filter((c) => c === H.collateral).length,
              value: e.value,
              flag: true,
              player: first(s),
              text: e.text,
            }),
          );
          break;
        }
        prepend(
          s,
          ...playerOrder(s).map((p) => encounterThreat((e.value ?? 0) * 2, p)),
          ...(e.text === "replay"
            ? []
            : [fx("heirsFinishTreachery", { code: H.collateral })]),
        );
        break;
      }
      const before = s.queue.length,
        code = heirsDiscardEncounterTop(s);
      const forced = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...forced,
        fx("heirsCollateral", {
          count: code ? e.count! - 1 : 0,
          value:
            (e.value ?? 0) +
            (code && card(code).type_code === "location" ? 1 : 0),
          player: first(s),
          flag: e.flag,
          text: e.text,
        }),
      );
      break;
    }
    case "heirsFinishTreachery":
      s.encounterDiscard.push(e.code!);
      break;
    case "heirsExtraShadows": {
      if (!u) break;
      const effects: Effect[] = [];
      for (let i = 0; i < (e.count ?? 0); i++) {
        const code = encounterDraw(s, true);
        if (!code) break;
        u.shadows.push(code);
        heirsShadowDealt(s, u);
        effects.push(fx("shadowReveal", { code }));
      }
      prepend(s, ...effects);
      break;
    }
    default:
      return false;
  }
  return true;
}
/** Pure save validation: modifiers may outlive the physical sources that created them. */
export function validateHeirsState(s: GameState): boolean {
  const raw: unknown = (s as HeirsState).heirsNumenor;
  const natural = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const idList = (value: unknown) =>
    Array.isArray(value) &&
    value.every((id) => typeof id === "string" && id.length > 0) &&
    new Set(value).size === value.length;
  const counts = (value: unknown, even = false) =>
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([id, n]) => id.length > 0 && natural(n) && (!even || n % 2 === 0),
    );
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const v = raw as Record<string, unknown>;
    if (
      !Array.isArray(v.removedStages) ||
      !v.removedStages.every((n) => [2, 3, 4].includes(n)) ||
      new Set(v.removedStages).size !== v.removedStages.length ||
      !counts(v.mumakDamage)
    )
      return false;
    if (
      v.firstEnemyRound !== undefined &&
      (!natural(v.firstEnemyRound) ||
        v.firstEnemyRound < 1 ||
        v.firstEnemyRound > s.round)
    )
      return false;
    if (v.roundAssault !== undefined && !natural(v.roundAssault)) return false;
    if (v.roundSpiders !== undefined && !idList(v.roundSpiders)) return false;
    if (v.phaseRabble !== undefined && !counts(v.phaseRabble, true))
      return false;
  }
  return [s.combat, ...(s.suspendedCombats ?? [])].every(
    (c) =>
      !c ||
      ["heirsScrollDamage", "heirsRepeatAttack"].every(
        (key) =>
          !(key in c) ||
          typeof (c as unknown as Record<string, unknown>)[key] === "boolean",
      ),
  );
}
