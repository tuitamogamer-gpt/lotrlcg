import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
} from "./core";
import { discardAttachment, enemyAddedToStaging } from "./board";
import {
  activeSeat,
  allEngaged,
  firstPlayer,
  forOwner,
  playerOrder,
} from "./table";
import { RIVER_RUNNING as R } from "./river-running-support";
export const SHADOW_EAST = R;
export const shadowEastTrait = (u: Unit | string, t: string) =>
  (card(typeof u === "string" ? u : u.code).traits ?? "")
    .split(".")
    .some((x) => x.trim() === t);
export const shadowEastEnemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
export const shadowEastAttachments = (u: Unit) =>
  u.attachments.filter(
    (a) => !a.blanked && shadowEastTrait(a.code, "Easterling"),
  );
const attachments = (u: Unit, code: string) =>
  u.attachments.filter((a) => a.code === code && !a.blanked);
const sideLive = (s: GameState) =>
  s.staging.some((u) => u.code === R.warriors && !u.blanked);
const easterlingTreachery = (code: string) =>
  card(code).type_code === "treachery" && shadowEastTrait(code, "Easterling");
function topTreachery(s: GameState) {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (easterlingTreachery(s.encounterDiscard[i])) return i;
  return -1;
}
export function shadowEastAttach(
  s: GameState,
  u: Unit,
  code: string,
  physical?: Unit,
) {
  const a = physical ?? make(s, code);
  u.attachments.push({ id: a.id, code, exhausted: false });
  log(s, `${card(code).name} attaches to ${name(u)}.`, "danger");
}
export function shadowEastAttachTop(s: GameState, u: Unit) {
  const i = topTreachery(s);
  if (i >= 0) shadowEastAttach(s, u, s.encounterDiscard.splice(i, 1)[0]);
}
export function shadowEastReturn(s: GameState, u: Unit) {
  if (s.staging.some((x) => x.id === u.id)) return;
  let found = false;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      if (s.engaged.some((x) => x.id === u.id)) {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
        found = true;
      }
    });
  if (!found) return;
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  delete u.revealedShadowCount;
  delete u.owner;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
export function shadowEastStats(_s: GameState, u: Unit) {
  const n =
    !u.blanked && u.code === R.raider ? shadowEastAttachments(u).length : 0;
  return { attack: n + 2 * attachments(u, R.sword).length, defense: n };
}
export const shadowEastThreatBonus = (_s: GameState, u: Unit) =>
  2 * attachments(u, R.horse).length;
export const shadowEastEngagementBonus = (_s: GameState, u: Unit) =>
  !u.blanked && u.code === R.rider ? -10 * shadowEastAttachments(u).length : 0;
export function shadowEastCombatBegin(s: GameState) {
  const n = shadowEastEnemies(s).reduce(
    (n, u) =>
      n +
      (!u.blanked
        ? u.code === R.raider
          ? 1
          : u.code === R.rider
            ? 2
            : 0
        : 0) +
      2 * attachments(u, R.bow).length,
    0,
  );
  if (n) prepend(s, fx("heirsArchery", { value: n, player: firstPlayer(s) }));
}
export function shadowEastEnemyEntered(s: GameState, u: Unit) {
  const seen =
    s.riverRunning?.enteredEnemies ??
    s.templeDoom?.enteredEnemies ??
    s.wrathRuin?.enteredEnemies;
  if (!seen || seen.includes(u.id)) return;
  seen.push(u.id);
  const effects: Effect[] = [];
  if (u.code === R.captain && !u.blanked)
    effects.push(
      fx("eastCaptainEnter", { target: u.id, player: firstPlayer(s) }),
    );
  if (shadowEastTrait(u, "Easterling") && sideLive(s))
    effects.push(fx("eastAttachTop", { target: u.id, player: firstPlayer(s) }));
  if (effects.length > 1)
    prepend(s, fx("eastEntryOrder", { effects, player: firstPlayer(s) }));
  else prepend(s, ...effects);
}
export function shadowEastEnemyAttackStarted(s: GameState, u: Unit) {
  if (u.code === R.warrior && !u.blanked)
    prepend(s, fx("eastAttachTop", { target: u.id, player: firstPlayer(s) }));
}
export function shadowEastSideQuestChosen(s: GameState, u: Unit) {
  if (u.code === R.warriors && !u.blanked)
    prepend(s, fx("eastWarriorsAttack", { player: firstPlayer(s) }));
}
export function shadowEastDamageAmount(s: GameState, u: Unit, value: number) {
  if (value <= 0 || u.code !== R.captain || u.blanked) return value;
  const as = shadowEastAttachments(u);
  if (!as.length) return value;
  if (as.length === 1) discardAttachment(s, u, as[0]);
  else
    prepend(
      s,
      fx("eastCaptainCancel", { target: u.id, player: firstPlayer(s) }),
    );
  return 0;
}
const targets = (s: GameState, code: string) =>
  shadowEastEnemies(s).filter(
    (u) =>
      shadowEastTrait(u, "Easterling") &&
      !u.attachments.some((a) => a.code === code),
  );
const tied = (units: Unit[], value: (u: Unit) => number, highest = false) => {
  const goal = (highest ? Math.max : Math.min)(...units.map(value));
  return units.filter((u) => value(u) === goal);
};
const resolving = (s: GameState) =>
  s.riverRunning?.resolving ??
  s.templeDoom?.resolving ??
  s.wrathRuin?.resolving;
function takeResolving(s: GameState, id: string | undefined) {
  const pile = resolving(s);
  const i = pile?.findIndex((u) => u.id === id) ?? -1;
  return i >= 0 ? pile!.splice(i, 1)[0] : undefined;
}
export function shadowEastEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (![R.sword, R.bow, R.horse, R.rider].includes(code)) return false;
  if (code === R.rider) {
    if (fromReveal) {
      const u = [...s.staging].reverse().find((u) => u.code === code);
      if (u)
        prepend(
          s,
          fx("eastRiderSearch", { target: u.id, player: firstPlayer(s) }),
        );
    }
    return true;
  }
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i < 0) return true;
    s.encounterDiscard.splice(i, 1);
  }
  const physical = make(s, code);
  resolving(s)!.push(physical);
  prepend(
    s,
    fx("eastAttachRevealed", {
      code,
      source: physical.id,
      player: firstPlayer(s),
    }),
  );
  return true;
}
export function shadowEastShadow(s: GameState, code: string) {
  const c = s.combat,
    u = c ? get(s, c.enemyId) : undefined;
  if (!c) return false;
  if (code === R.raider)
    c.attackBonus += u && shadowEastAttachments(u).length ? 2 : 1;
  else if (code === R.warrior) {
    if (u)
      prepend(
        s,
        fx("eastAttachTop", {
          target: u.id,
          player: c.attackPlayer ?? activeSeat(s),
        }),
      );
  } else return false;
  return true;
}
export const shadowEastRoundEnd = (s: GameState) =>
  shadowEastEnemies(s)
    .filter((u) => attachments(u, R.horse).length)
    .map((u) =>
      fx("eastHorseReturn", { target: u.id, player: firstPlayer(s) }),
    );
export const shadowEastRevealedSurge = (s: GameState, code: string) =>
  code === R.horse && !targets(s, code).length;
export const shadowEastSharedEffect = (e: Effect) =>
  e.kind.startsWith("east") && !e.kind.startsWith("eastPlayer");
export function shadowEastEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("east") || e.kind.startsWith("eastPlayer"))
    return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "eastEntryOrder":
      choose(s, "Choose the order of the enemy's forced entry effects", [
        {
          id: "captain-first",
          label: "Resolve Easterling Captain first",
          effects: e.effects ?? [],
        },
        {
          id: "warriors-first",
          label: "Resolve Warriors of the East first",
          effects: [...(e.effects ?? [])].reverse(),
        },
      ]);
      break;
    case "eastCaptainEnter":
      if (u)
        while (s.encounterDeck.length) {
          const code = s.encounterDeck.shift()!;
          if (easterlingTreachery(code)) {
            shadowEastAttach(s, u, code);
            break;
          }
          s.encounterDiscard.push(code);
        }
      break;
    case "eastAttachTop":
      if (u) shadowEastAttachTop(s, u);
      break;
    case "eastCaptainCancel":
      if (u)
        choose(
          s,
          "Easterling Captain · Discard an Easterling attachment to cancel the damage",
          shadowEastAttachments(u).map((a) => ({
            id: a.id,
            code: a.code,
            label: card(a.code).name,
            effects: [
              fx("eastDiscardAttachment", { target: u.id, source: a.id }),
            ],
          })),
        );
      break;
    case "eastDiscardAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      break;
    }
    case "eastWarriorsAttack": {
      const enemies = s.staging.filter(
        (u) =>
          card(u.code).type_code === "enemy" &&
          shadowEastTrait(u, "Easterling"),
      );
      if (enemies.length)
        choose(
          s,
          "Warriors of the East · The strongest Easterling attacks",
          tied(enemies, (u) => stats(s, u).attack, true).map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
            ],
          })),
        );
      break;
    }
    case "eastAttachRevealed": {
      const code = e.code!,
        enemies = targets(s, code);
      const selected =
        code === R.sword
          ? tied(enemies, (u) => stats(s, u).attack)
          : tied(enemies, (u) => engagementCost(s, u), code === R.bow);
      if (selected.length)
        choose(
          s,
          `${card(code).name} · Choose its attachment target`,
          selected.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("eastAttachFromDiscard", {
                target: u.id,
                code,
                source: e.source,
                player: firstPlayer(s),
              }),
            ],
          })),
        );
      else {
        const physical = takeResolving(s, e.source);
        if (physical) s.encounterDiscard.push(physical.code);
      }
      break;
    }
    case "eastAttachFromDiscard": {
      const physical = takeResolving(s, e.source);
      if (u && physical) {
        shadowEastAttach(s, u, physical.code, physical);
        if (e.code === R.horse) shadowEastReturn(s, u);
      } else if (physical) s.encounterDiscard.push(physical.code);
      break;
    }
    case "eastRiderSearch": {
      const choices = (["deck", "discard"] as const).flatMap((p) => {
        const pile = p === "deck" ? s.encounterDeck : s.encounterDiscard;
        const i = pile.indexOf(R.horse);
        return i < 0
          ? []
          : [
              {
                id: p,
                code: R.horse,
                label: `Attach Easterling Horse from the encounter ${p}`,
                effects: [
                  fx("eastRiderTake", {
                    target: e.target,
                    text: p,
                    value: i,
                    player: firstPlayer(s),
                  }),
                ],
              },
            ];
      });
      if (u && choices.length)
        choose(s, "Rider of Rhûn · Search for Easterling Horse", choices);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "eastRiderTake": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      if (u && e.value !== undefined && pile[e.value] === R.horse)
        shadowEastAttach(s, u, pile.splice(e.value, 1)[0]);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "eastHorseReturn":
      if (u && attachments(u, R.horse).length) shadowEastReturn(s, u);
      break;
    default:
      return false;
  }
  return true;
}
export const SHADOW_EAST_SHARED_HOOKS: Batch4ScenarioHooks = {
  stats: shadowEastStats,
  threatBonus: shadowEastThreatBonus,
  engagementBonus: shadowEastEngagementBonus,
  combatBegin: shadowEastCombatBegin,
  enemyEntered: shadowEastEnemyEntered,
  enemyAttackStarted: shadowEastEnemyAttackStarted,
  sideQuestChosen: shadowEastSideQuestChosen,
  damageAmount: shadowEastDamageAmount,
  encounter: shadowEastEncounter,
  shadow: shadowEastShadow,
  roundEnd: shadowEastRoundEnd,
  revealedSurge: shadowEastRevealedSurge,
  effect: shadowEastEffect,
  sharedEffect: shadowEastSharedEffect,
};
