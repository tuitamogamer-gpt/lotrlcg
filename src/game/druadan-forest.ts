// Original/easy Drúadan Forest: group Prowl, Wose Archery and peaceful victory.
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  opts,
  prepend,
  shuffle,
  stats,
  units,
} from "./core";
import {
  addVictoryCard,
  advanceQuest,
  discardAttachment,
  enemyAddedToStaging,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatName,
  selectSeat,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { currentQuestCode } from "./quest-state";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsCanSpendResources } from "./heirs-numenor";
import { DRUADAN_FOREST as D } from "./druadan-forest-support";
export { DRUADAN_FOREST } from "./druadan-forest-support";

const isDruadan = (s: GameState) => s.scenarioId === "the-druadan-forest";
const state = (s: GameState) => (s.druadanForest ??= {});
const first = (s: GameState) => s.table?.first ?? 0;
const encounters = (s: GameState) => [
  ...s.staging,
  ...allEngaged(s),
  ...allActiveLocations(s),
];
const active = (s: GameState, code: string) =>
  encounters(s).filter((u) => u.code === code && !u.blanked);
const heroesPaying = (s: GameState, player?: number) =>
  allHeroes(s).filter(
    (h) =>
      h.resources > 0 &&
      (player === undefined || ownerOf(s, h) === player) &&
      heirsCanSpendResources(s, h),
  );
const readyHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      !h.exhausted &&
      !isSacked(h) &&
      !khazadCannotExhaust(h) &&
      !watcherWaterCannotExhaust(h),
  );
const controlledAttachments = (s: GameState, player: number) =>
  units(s).flatMap((host) =>
    host.attachments
      .filter((a) => !a.facedown && attachmentController(s, host, a) === player)
      .map((a) => ({ host, a })),
  );
function removeQuesting(s: GameState, h: Unit) {
  h.committed = false;
  forOwner(s, ownerOf(s, h), () => {
    s.committedIds = s.committedIds.filter((id) => id !== h.id);
  });
}
export function setupDruadanForest(s: GameState) {
  state(s).bossSetAside = D.boss;
  s.encounterDeck = s.encounterDeck.filter((c) => c !== D.boss);
  shuffle(s, s.encounterDeck);
  prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
  log(
    s,
    "Drû-buri-Drû is set aside. Reveal one encounter card per player.",
    "chapter",
  );
}
export function advanceDruadanForest(s: GameState): boolean {
  if (!isDruadan(s)) return false;
  if (
    s.status !== "playing" ||
    s.phase === "setup" ||
    s.stageRevealing ||
    s.choice ||
    s.queue.length
  )
    return true;
  const required = [11, 17, 14][s.stage - 1];
  if (s.progress < required) return true;
  if (s.stage === 3) {
    if (
      s.victoryCards?.includes(D.boss) &&
      !questDefeated(s, currentQuestCode(s)!)
    )
      win(s);
    return true;
  }
  if (questDefeated(s, currentQuestCode(s)!)) return true;
  s.stage++;
  s.progress = 0;
  if (s.stage === 3) {
    s.stageRevealing = true;
    prepend(s, fx("druadanStage3", { player: first(s) }));
  }
  log(
    s,
    s.stage === 2 ? "Stage 2 · An Untimely End" : "Stage 3 · The Passage Out",
    "chapter",
  );
  return true;
}
/** Prowl is a group discard, not payment, and survives When Revealed cancellation. */
export function druadanForestRevealEffects(
  s: GameState,
  code: string,
  origin: Effect["revealOrigin"] = "encounter",
): Effect[] {
  if (origin !== "encounter") return [];
  const match = /\bProwl (\d+|X)\b/i.exec(card(code).text ?? "");
  return match
    ? [
        fx("druadanProwl", {
          value: match[1] === "X" ? playerOrder(s).length : Number(match[1]),
          code,
          player: first(s),
        }),
      ]
    : [];
}
export function druadanForestArchery(s: GameState, u: Unit): number {
  if (u.blanked || card(u.code).type_code !== "enemy") return 0;
  const base =
    u.code === D.elite
      ? 2
      : u.code === D.hunter
        ? allHeroes(s).filter((h) => h.resources === 0).length
        : 0;
  return base + (hasTrait(u, "Wose") ? active(s, D.glade).length : 0);
}
export function druadanForestCombatStart(s: GameState) {
  const amount = encounters(s).reduce(
    (n, u) => n + druadanForestArchery(s, u),
    0,
  );
  if (amount)
    prepend(s, fx("heirsArchery", { value: amount, player: first(s) }));
}
export function druadanForestArcheryTargets(
  s: GameState,
  characters: Unit[],
): Unit[] {
  const allies = characters.filter((u) =>
    ["ally", "objective-ally"].includes(card(u.code).type_code),
  );
  return isDruadan(s) && s.stage === 2 && allies.length ? allies : characters;
}
export const druadanForestThreat = (s: GameState, u: Unit): number | null =>
  u.code === D.glade && !u.blanked
    ? Math.max(
        0,
        ...encounters(s)
          .filter(
            (e) => card(e.code).type_code === "enemy" && hasTrait(e, "Wose"),
          )
          .map((e) => druadanForestArchery(s, e)),
      )
    : null;
export const druadanForestThreatBonus = (s: GameState, u: Unit) =>
  s.staging.some((e) => e.id === u.id) &&
  card(u.code).type_code === "enemy" &&
  hasTrait(u, "Wose")
    ? active(s, D.drummer).length * 2
    : 0;
export const druadanForestStats = (s: GameState, u: Unit) => {
  const bonus =
    s.victoryCards?.includes(D.boss) &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
      ? 1
      : 0;
  return { will: bonus, defense: bonus };
};
export const druadanForestCostIncrease = (s: GameState) =>
  active(s, D.clearing).length;
export const druadanForestCannotGainResources = (
  s: GameState,
  h: Unit,
  cardEffect = true,
) =>
  cardEffect &&
  card(h.code).type_code === "hero" &&
  active(s, D.garden).length > 0;
export const druadanForestCanDefend = (
  _s: GameState,
  enemy: Unit,
  defender: Unit,
) =>
  enemy.code !== D.boss ||
  !!enemy.blanked ||
  !["ally", "objective-ally"].includes(card(defender.code).type_code);
export const druadanForestAttackStat = (s: GameState): "will" | "attack" =>
  isDruadan(s) && s.stage === 3 ? "will" : "attack";
/** Peaceful attack resolution replaces damage and does not destroy an enemy. */
export function druadanForestAttackProgress(
  s: GameState,
  enemy: Unit,
  amount: number,
): boolean {
  if (druadanForestAttackStat(s) !== "will") return false;
  if (amount <= 0) return true;
  enemy.progress = Math.min(stats(s, enemy).health, enemy.progress + amount);
  log(
    s,
    `${name(enemy)} receives ${amount} progress instead of damage.`,
    "good",
  );
  if (enemy.progress >= stats(s, enemy).health) {
    const tokens = enemy.progress;
    for (const a of [...enemy.attachments])
      discardAttachment(s, enemy, a, true);
    s.encounterDiscard.push(...enemy.shadows);
    enemy.shadows = [];
    delete enemy.faceupShadows;
    s.staging = s.staging.filter((u) => u.id !== enemy.id);
    for (const player of playerOrder(s))
      forOwner(s, player, () => {
        s.engaged = s.engaged.filter((u) => u.id !== enemy.id);
      });
    addVictoryCard(s, enemy.code);
    s.progress += tokens;
    log(
      s,
      `${name(enemy)} enters the victory display; ${tokens} progress goes directly on The Passage Out.`,
      "good",
    );
    advanceQuest(s);
  }
  return true;
}
export function druadanForestDamageDealt(s: GameState, u: Unit, value: number) {
  if (
    s.druadanForest?.menDamageTaken !== undefined &&
    value > 0 &&
    card(u.code).type_code === "hero"
  )
    s.druadanForest.menDamageTaken = true;
}
export function druadanForestTravelProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.blanked) return null;
  if (u.code === D.clearing && !readyHeroes(s).length)
    return "Exhaust a ready hero to travel to Ancestral Clearing.";
  if (
    u.code === D.garden &&
    playerOrder(s).some((p) => !heroesPaying(s, p).length)
  )
    return "Each player must pay 1 resource to travel to Garden of Poisons.";
  return null;
}
export function druadanForestTravelEffects(s: GameState, u: Unit): Effect[] {
  if (u.blanked) return [];
  if (u.code === D.clearing)
    return [fx("druadanTravelExhaust", { player: first(s) })];
  if (u.code === D.garden)
    return playerOrder(s).map((player) =>
      fx("druadanPayResources", {
        value: 1,
        player,
        text: "Garden of Poisons",
      }),
    );
  return [];
}
export function druadanForestEncounter(
  s: GameState,
  code: string,
  replay = false,
): boolean {
  if (code === D.men) prepend(s, fx("druadanMenStart", { player: first(s) }));
  else if (code === D.stars)
    prepend(
      s,
      ...allHeroes(s)
        .filter((h) => h.committed)
        .map((h) =>
          fx("druadanStars", { target: h.id, player: ownerOf(s, h) }),
        ),
    );
  else if (code === D.leaves)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("druadanLeaves", { player })),
    );
  else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
type DruadanCombat = NonNullable<GameState["combat"]> & {
  druadanReturnCount?: number;
};
export function druadanForestShadow(s: GameState, code: string): boolean {
  const c = s.combat as DruadanCombat | null;
  if (!c) return false;
  const defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  if ([D.elite, D.thief].includes(code))
    c.druadanReturnCount = (c.druadanReturnCount ?? 0) + 1;
  else if (code === D.hunter) c.attackBonus += 2;
  else if (code === D.men)
    c.attackBonus += s.heroes.filter((h) => h.resources === 0).length;
  else if (code === D.stars)
    for (const id of defenders) {
      const d = get(s, id);
      if (d) d.resources = 0;
    }
  else if (code === D.drummer)
    for (const e of s.engaged) {
      if (hasTrait(e, "Wose")) {
        if (e.id === c.enemyId) c.attackBonus++;
        else e.boost++;
      }
    }
  else if (code === D.leaves) {
    const attachments = defenders.flatMap((id) => {
      const host = get(s, id);
      return host
        ? host.attachments.filter((a) => !a.facedown).map((a) => ({ host, a }))
        : [];
    });
    choose(
      s,
      "Leaves on Tree · Discard a defender's attachment",
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
export function druadanForestAttackFinished(
  s: GameState,
  enemy: Unit,
  completed: NonNullable<GameState["combat"]>,
) {
  const count = (completed as DruadanCombat).druadanReturnCount ?? 0;
  if (count)
    prepend(
      s,
      fx("druadanReturnOffer", { target: enemy.id, count, player: first(s) }),
    );
}
export function handleDruadanForestEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "druadanStage3":
      if (state(s).bossSetAside) {
        placeEncounter(s, D.boss);
        delete state(s).bossSetAside;
      }
      s.stageRevealing = false;
      break;
    case "druadanProwl": {
      const amount = e.value ?? 0;
      const heroes = allHeroes(s).filter((h) => h.resources > 0);
      if (amount > 0 && heroes.length) {
        selectSeat(s, first(s));
        choose(
          s,
          `Prowl · Discard ${amount} more resource${amount === 1 ? "" : "s"}`,
          opts(
            heroes,
            (h) => [
              fx("druadanDiscardResource", { target: h.id }),
              { ...e, value: amount - 1 },
            ],
            (h) =>
              `${h.resources} resources${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          ),
          "Choose resources from any heroes. Prowl is one shared total for the group.",
        );
      }
      break;
    }
    case "druadanDiscardResource":
      if (u) u.resources = Math.max(0, u.resources - 1);
      break;
    case "druadanTravelExhaust":
      choose(
        s,
        "Ancestral Clearing · Exhaust a hero",
        opts(readyHeroes(s), (h) => [fx("exhaust", { target: h.id })]),
      );
      break;
    case "druadanPayResources": {
      const remaining = e.value ?? 0;
      if (remaining > 0)
        choose(
          s,
          `${e.text} · Pay ${remaining} more resource${remaining === 1 ? "" : "s"}`,
          opts(heroesPaying(s, e.player ?? activeSeat(s)), (h) => [
            fx("druadanDiscardResource", { target: h.id }),
            { ...e, value: remaining - 1 },
          ]),
        );
      break;
    }
    case "druadanMenStart":
      state(s).menDamageTaken = false;
      prepend(
        s,
        ...allHeroes(s).map((h) =>
          fx("druadanMenHero", { target: h.id, player: ownerOf(s, h) }),
        ),
        fx("druadanMenFinish", { player: first(s) }),
      );
      break;
    case "druadanMenHero":
      if (u)
        choose(s, `Men in the Dark · ${name(u)}`, [
          ...(u.resources > 0 && heirsCanSpendResources(s, u)
            ? [
                {
                  id: "pay",
                  label: "Pay 1 resource",
                  effects: [fx("druadanDiscardResource", { target: u.id })],
                },
              ]
            : []),
          {
            id: "damage",
            label: "Take 1 damage",
            effects: [fx("damage", { target: u.id, value: 1 })],
          },
        ]);
      break;
    case "druadanMenFinish": {
      const took = state(s).menDamageTaken;
      delete state(s).menDamageTaken;
      if (!took)
        prepend(s, fx("amonSurgeWindow", { code: D.men }), fx("reveal"));
      break;
    }
    case "druadanStars":
      if (u?.committed)
        choose(s, `Stars in Sky · ${name(u)}`, [
          ...(u.resources > 0 && heirsCanSpendResources(s, u)
            ? [
                {
                  id: "pay",
                  label: "Pay 1 resource",
                  effects: [fx("druadanDiscardResource", { target: u.id })],
                },
              ]
            : []),
          {
            id: "remove",
            label: "Remove from the quest",
            effects: [fx("druadanRemoveQuesting", { target: u.id })],
          },
        ]);
      break;
    case "druadanRemoveQuesting":
      if (u) removeQuesting(s, u);
      break;
    case "druadanLeaves": {
      const p = e.player ?? activeSeat(s),
        attachments = controlledAttachments(s, p);
      const count = attachments.length;
      if (!count) break;
      const total = heroesPaying(s, p).reduce((n, h) => n + h.resources, 0);
      choose(s, "Leaves on Tree · Pay for every controlled attachment", [
        ...(total >= count
          ? [
              {
                id: "pay",
                label: `Pay ${count} resources`,
                effects: [
                  fx("druadanPayResources", {
                    value: count,
                    player: p,
                    text: "Leaves on Tree",
                  }),
                ],
              },
            ]
          : []),
        {
          id: "discard",
          label: `Discard all ${count} attachments`,
          effects: [fx("druadanDiscardAllAttachments", { player: p })],
        },
      ]);
      break;
    }
    case "druadanDiscardAllAttachments":
      for (const { host, a } of controlledAttachments(
        s,
        e.player ?? activeSeat(s),
      ))
        discardAttachment(s, host, a);
      break;
    case "druadanReturnOffer": {
      if (!u || !allEngaged(s).some((a) => a.id === u.id)) break;
      const heroes = heroesPaying(s);
      selectSeat(s, first(s));
      choose(s, `${name(u)} · Pay 1 resource or return to staging`, [
        ...opts(
          heroes,
          (h) => [
            fx("druadanDiscardResource", { target: h.id }),
            ...(e.count! > 1 ? [{ ...e, count: e.count! - 1 }] : []),
          ],
          (h) => `${h.resources} resources`,
        ),
        {
          id: "return",
          label: "Return the attacking enemy to staging",
          effects: [fx("druadanReturnEnemy", { target: u.id })],
        },
      ]);
      break;
    }
    case "druadanReturnEnemy":
      if (u && allEngaged(s).some((a) => a.id === u.id)) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((a) => a.id !== u.id);
        });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    default:
      return false;
  }
  return true;
}
