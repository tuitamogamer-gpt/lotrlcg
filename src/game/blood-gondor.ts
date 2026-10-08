import { mainQuestCode } from "./quest-state";
// The Blood of Gondor: physical hidden cards are kept outside every public play zone.
import { card, name } from "./cards";
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  threatOf,
} from "./core";
import {
  damage,
  discardCharacter,
  engage,
  enemyAddedToStaging,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  forOwner,
  ownerOf,
  playerOrder,
  selectSeat,
} from "./table";
import { prepareEnemyShadows } from "./considered-engagement";
import { pauseFor } from "./presentation";
import { heirsEncounter } from "./heirs-numenor";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { isSacked } from "./carrock";
import { BLOOD_GONDOR as B } from "./blood-gondor-support";

const first = (s: GameState) => s.table?.first ?? 0;
const hidden = (s: GameState, p: number) => s.bloodGondor?.hidden[p] ?? [];
const isBlood = (s: GameState) => s.scenarioId === "the-blood-of-gondor";
const live = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
  ...allEngaged(s),
];
export function setupBloodGondor(s: GameState) {
  s.bloodGondor = { hidden: {}, turning: [], captured: [], conflict: false };
  const setup = [B.crossroads, B.numenorean, B.faramir, B.alcaron];
  s.encounterDeck = s.encounterDeck.filter((c) => !setup.includes(c));
  placeEncounter(s, B.crossroads);
  placeEncounter(s, B.numenorean);
  forOwner(s, first(s), () => {
    for (const code of [B.faramir, B.alcaron]) s.allies.push(make(s, code));
  });
  shuffle(s, s.encounterDeck);
  prepend(s, ...playerOrder(s).map(() => fx("reveal", { player: first(s) })));
}
export function bloodTakeHidden(s: GameState, player: number, count = 1) {
  if (!s.bloodGondor || s.table?.seats[player]?.eliminated) return;
  for (let n = 0; n < count; n++) {
    if (!s.encounterDeck.length && s.encounterDiscard.length)
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    const code = encounterDraw(s);
    if (!code) break;
    (s.bloodGondor.hidden[player] ??= []).push(make(s, code));
    log(s, `Player ${player + 1} takes a hidden card.`, "danger");
  }
  bloodGondorCheck(s);
}
function turnAll(s: GameState, player: number, lying = false, shadows = false) {
  const q = s.bloodGondor!;
  const cards = hidden(s, player).filter((u) => !q.turning.includes(u.id));
  q.turning.push(...cards.map((u) => u.id));
  prepend(
    s,
    ...cards.map((u) =>
      fx("bloodTurn", {
        player,
        target: u.id,
        flag: lying,
        text: shadows ? "shadows" : undefined,
      }),
    ),
  );
}
export function bloodGondorCheck(s: GameState) {
  if (!isBlood(s) || !s.bloodGondor || s.status !== "playing") return;
  if (s.stage === 1) {
    for (const u of allCharacters(s).filter((u) =>
      [B.faramir, B.alcaron].includes(u.code),
    )) {
      const p = ownerOf(s, u);
      if (p === first(s)) continue;
      forOwner(s, p, () => {
        s.allies = s.allies.filter((a) => a.id !== u.id);
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      forOwner(s, first(s), () => {
        u.owner = first(s);
        s.allies.push(u);
        if (u.committed) s.committedIds.push(u.id);
      });
    }
  } else {
    for (const p of playerOrder(s))
      if (
        hidden(s, p).length >= 5 &&
        !hidden(s, p).some((u) => s.bloodGondor!.turning.includes(u.id))
      )
        turnAll(s, p);
  }
}
export function bloodGondorEliminated(s: GameState, player: number) {
  const q = s.bloodGondor;
  if (!q) return;
  const cards = hidden(s, player);
  s.encounterDiscard.push(...cards.map((u) => u.code));
  q.turning = q.turning.filter((id) => !cards.some((u) => u.id === id));
  q.hidden[player] = [];
}
export function bloodGondorCharacterLeft(s: GameState, u: Unit) {
  if (s.bloodGondor)
    s.bloodGondor.captured = s.bloodGondor.captured.filter(
      (c) => c.id !== u.id,
    );
  if (isBlood(s) && [B.faramir, B.alcaron].includes(u.code) && !u.blanked) {
    s.status = "lost";
    s.reason = `${name(u)} has left play.`;
    s.queue = [];
    s.choice = null;
  }
}
export function bloodGondorQuestStart(s: GameState) {
  if (isBlood(s))
    prepend(s, ...playerOrder(s).map((player) => fx("bloodTake", { player })));
}
export function bloodGondorCombatStart(s: GameState) {
  if (isBlood(s) && s.stage === 1)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("bloodCombatChoice", { player })),
    );
}
export function advanceBloodGondor(s: GameState) {
  if (!isBlood(s)) return false;
  if (
    s.choice ||
    s.queue.length ||
    s.stageRevealing ||
    s.progress < (s.stage === 1 ? 11 : 15)
  )
    return true;
  if (questDefeated(s, mainQuestCode(s)!)) return true;
  if (s.stage === 2) {
    win(s);
    s.reason =
      "You break through the ambush and pursue the captives into the Morgul Vale.";
    return true;
  }
  s.stage = 2;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(s, fx("bloodCapture", { player: first(s) }));
  return true;
}
export const bloodGondorQuestStat = (s: GameState) =>
  !isBlood(s)
    ? undefined
    : live(s).some((u) => u.code === B.crossroads && !u.blanked)
      ? ("defense" as const)
      : s.stage === 2
        ? ("attack" as const)
        : ("will" as const);
export const bloodGondorThreat = (s: GameState, u: Unit) =>
  u.code === B.crossroads
    ? playerOrder(s).length
    : u.code === B.numenorean
      ? Object.values(s.bloodGondor?.hidden ?? {}).flat().length
      : undefined;
export const bloodGondorLocationBonus = (s: GameState, u: Unit) =>
  !u.blanked &&
  [B.eastern, B.western].includes(u.code) &&
  s.staging.some((l) => l.id === u.id)
    ? 5
    : 0;
export const bloodGondorStagingBonus = (s: GameState) =>
  s.bloodGondor?.conflict
    ? allEngaged(s)
        .filter((u) => /\bOrc\b/.test(card(u.code).traits ?? ""))
        .reduce((sum, u) => sum + threatOf(s, u), 0)
    : 0;
export const bloodGondorArchery = (s: GameState) =>
  live(s).filter((u) => u.code === B.woods && !u.blanked).length *
  playerOrder(s).length;
export function bloodGondorExplored(s: GameState, u: Unit) {
  if (u.code === B.woods && !u.blanked)
    prepend(s, fx("bloodDiscardHidden", { player: first(s) }));
}
export function bloodGondorEngaged(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === B.crow) prepend(s, fx("bloodTake", { player: activeSeat(s) }));
  if (u.code === B.ambusher)
    prepend(s, fx("bloodDiscardAlly", { player: activeSeat(s) }));
}
export function bloodGondorRoundEnd(s: GameState): Effect[] {
  return live(s).some((u) => u.code === B.numenorean && !u.blanked)
    ? playerOrder(s).map((player) =>
        fx("heirsThreat", { value: hidden(s, player).length, player }),
      )
    : [];
}
export function bloodGondorCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !isBlood(s) ||
    !context.combatDamage ||
    !s.combat ||
    context.enemyId !== s.combat.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  const enemy = get(s, context.enemyId!);
  const brutal = enemy?.code === B.uruk && !enemy.blanked;
  if (brutal || s.combat.bloodTurnOnKill)
    (s.combat.bloodKilledPlayers ??= []).push({
      player: ownerOf(s, u),
      shadows: !!brutal,
    });
}
export function bloodGondorAttackFinished(
  s: GameState,
  completed: NonNullable<GameState["combat"]>,
) {
  prepend(
    s,
    ...(completed.bloodKilledPlayers ?? []).map(({ player, shadows }) =>
      fx("bloodTurnAll", { player, text: shadows ? "shadows" : undefined }),
    ),
  );
}
export function bloodGondorTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (
    !isBlood(s) ||
    u.blanked ||
    ![B.crossroads, B.eastern, B.western, B.northern, B.southern].includes(
      u.code,
    )
  )
    return;
  return [
    fx("bloodTake", { player: first(s), count: u.code === B.eastern ? 2 : 1 }),
  ];
}
export function bloodGondorEncounter(
  s: GameState,
  code: string,
  replay = false,
) {
  if (code === B.lying)
    prepend(s, fx("bloodTurnAll", { player: first(s), flag: true }));
  else if (code === B.looms)
    prepend(s, ...playerOrder(s).map((player) => fx("bloodTake", { player })));
  else if (code === B.conflict) {
    if (s.bloodGondor) s.bloodGondor.conflict = true;
    if (!allEngaged(s).some((u) => /\bOrc\b/.test(card(u.code).traits ?? "")))
      prepend(s, fx("reveal"));
  } else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function bloodGondorShadow(s: GameState, code: string) {
  if (!s.combat) return false;
  if ([B.crow, B.conflict].includes(code))
    prepend(
      s,
      fx("bloodTake", { player: s.combat.attackPlayer ?? activeSeat(s) }),
    );
  else if (code === B.ambusher)
    s.combat.attackBonus += s.combat.defenderId ? 1 : 3;
  else if (code === B.looms) s.combat.bloodTurnOnKill = true;
  else return false;
  return true;
}
export const bloodGondorAbilityLabel = (code: string) =>
  code === B.faramir
    ? "Reveal a hidden card · Deal 3 damage if it is an enemy"
    : code === B.alcaron
      ? "Return an engaged enemy to staging"
      : null;
export function bloodGondorAbilityProblem(s: GameState, u: Unit) {
  if (
    !isBlood(s) ||
    s.stage !== 1 ||
    ownerOf(s, u) !== activeSeat(s) ||
    !s.allies.some((a) => a.id === u.id)
  )
    return "You must control this objective ally.";
  if (
    u.blanked ||
    u.exhausted ||
    isSacked(u) ||
    khazadCannotExhaust(u) ||
    watcherWaterCannotExhaust(u)
  )
    return "This ally cannot use its action.";
  if (u.code === B.faramir && !["defense", "attack"].includes(s.phase))
    return "Combat action.";
  if (
    u.code === B.faramir &&
    !Object.values(s.bloodGondor!.hidden).some((cards) => cards.length)
  )
    return "No hidden cards.";
  if (u.code === B.alcaron && !s.engaged.length) return "No engaged enemy.";
  return null;
}
export function bloodGondorAbility(s: GameState, u: Unit) {
  if (!bloodGondorAbilityLabel(u.code)) return false;
  requireRule(
    !bloodGondorAbilityProblem(s, u),
    bloodGondorAbilityProblem(s, u) ?? "",
  );
  requireRule(exhaustCharacter(s, u), "Cannot exhaust objective ally.");
  if (u.code === B.alcaron)
    choose(
      s,
      "Lord Alcaron · Return an enemy",
      opts(s.engaged, (e) => [fx("bloodReturn", { target: e.id })]),
    );
  else
    choose(
      s,
      "Faramir · Choose a hidden card",
      playerOrder(s).flatMap((player) =>
        hidden(s, player).map((c, i) => ({
          id: c.id,
          label: `Player ${player + 1} · Hidden card ${i + 1}`,
          effects: [fx("bloodTurn", { player, target: c.id, value: 3 })],
        })),
      ),
    );
  return true;
}
export function bloodGondorEffect(s: GameState, e: Effect): boolean {
  if (
    !e.kind.startsWith("blood") ||
    ![
      "bloodTake",
      "bloodTurnAll",
      "bloodTurn",
      "bloodFaceup",
      "bloodDamage",
      "bloodReturn",
      "bloodCapture",
      "bloodStageReady",
      "bloodCombatChoice",
      "bloodDiscardAlly",
      "bloodDiscardHidden",
      "bloodDiscardOne",
    ].includes(e.kind)
  )
    return false;
  const player = e.player ?? activeSeat(s),
    q = s.bloodGondor;
  if (!q) return true;
  switch (e.kind) {
    case "bloodTake":
      bloodTakeHidden(s, player, e.count ?? 1);
      break;
    case "bloodTurnAll":
      turnAll(s, player, !!e.flag, e.text === "shadows");
      break;
    case "bloodTurn": {
      const u = hidden(s, player).find((u) => u.id === e.target);
      if (!u) break;
      prepend(s, { ...e, kind: "bloodFaceup" });
      pauseFor(s, {
        kind: "reveal",
        title: "Hidden card turned faceup",
        detail: `Player ${player + 1} turns over ${name(u)}.`,
        cards: [{ code: u.code, label: "Hidden card" }],
      });
      break;
    }
    case "bloodFaceup": {
      const u = hidden(s, player).find((u) => u.id === e.target);
      if (!u) break;
      q.hidden[player] = hidden(s, player).filter((c) => c.id !== u.id);
      q.turning = q.turning.filter((id) => id !== u.id);
      log(s, `Hidden card · ${name(u)} turns faceup.`);
      const c = card(u.code);
      if (c.type_code === "enemy") {
        engage(s, u);
        if (e.value)
          prepend(s, fx("bloodDamage", { target: u.id, value: e.value }));
        if (e.text === "shadows") prepareEnemyShadows(s, u);
      } else if (e.flag && c.type_code === "location")
        placeEncounter(s, u.code, true);
      else s.encounterDiscard.push(u.code);
      // Turning faceup is not revealing: no Surge, Doomed or Thalin. Lying in Wait only resolves When Revealed.
      if (e.flag && c.type_code === "treachery") {
        if (!bloodGondorEncounter(s, u.code, true))
          heirsEncounter(s, u.code, true);
      }
      break;
    }
    case "bloodDamage":
      damage(s, e.target!, e.value!);
      break;
    case "bloodReturn": {
      const u = get(s, e.target);
      if (!u) break;
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
      s.staging.push(u);
      enemyAddedToStaging(s, u);
      break;
    }
    case "bloodCapture": {
      for (const p of playerOrder(s))
        forOwner(s, p, () => {
          const allies = s.allies.filter((u) =>
            [B.faramir, B.alcaron].includes(u.code),
          );
          s.allies = s.allies.filter((u) => !allies.includes(u));
          s.committedIds = s.committedIds.filter(
            (id) => !allies.some((u) => u.id === id),
          );
          for (const u of allies) {
            delete u.owner;
            u.committed = false;
            q.captured.push(u);
          }
        });
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bloodTurnAll", { player })),
        fx("bloodStageReady"),
      );
      break;
    }
    case "bloodStageReady":
      s.stageRevealing = false;
      break;
    case "bloodCombatChoice":
      choose(s, "The Ambush · Hidden cards", [
        {
          id: "turn",
          label: `Turn all ${hidden(s, player).length} hidden cards faceup`,
          effects: [fx("bloodTurnAll", { player })],
        },
        {
          id: "take",
          label: "Take 1 hidden card",
          effects: [fx("bloodTake", { player })],
        },
      ]);
      break;
    case "bloodDiscardAlly": {
      const allies = s.allies.filter((u) => card(u.code).type_code === "ally");
      if (allies.length)
        choose(
          s,
          "Orc Ambusher · Discard an ally",
          opts(allies, (u) => [fx("bloodDiscardOne", { target: u.id })]),
        );
      break;
    }
    case "bloodDiscardOne": {
      const u = get(s, e.target);
      if (u) discardCharacter(s, u);
      break;
    }
    case "bloodDiscardHidden": {
      if (e.target) {
        const u = hidden(s, player).find((c) => c.id === e.target);
        if (u) {
          q.hidden[player] = hidden(s, player).filter((c) => c.id !== u.id);
          q.turning = q.turning.filter((id) => id !== u.id);
          s.encounterDiscard.push(u.code);
        }
      } else if (hidden(s, player).length)
        choose(
          s,
          "The Dark Woods · Discard a hidden card",
          hidden(s, player).map((u, i) => ({
            id: u.id,
            label: `Hidden card ${i + 1}`,
            effects: [fx("bloodDiscardHidden", { player, target: u.id })],
          })),
        );
      break;
    }
  }
  selectSeat(s, player);
  return true;
}
