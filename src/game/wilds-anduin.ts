import type { Effect, GameState, Unit } from "./types";
import { card } from "./cards";
import { fx, prepend } from "./core";
import { questDefeated, win } from "./board";
import {
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import {
  WILDS_RHOVANION as W,
  WILDS_ANDUIN_QUESTS,
  WILDS_EVIL_CREATURES,
} from "./wilds-rhovanion-support";
import {
  wildsAnduin,
  wildsEnemies,
  wildsEvil,
  wildsTakeAside,
  wildsDiscardUntil,
  wildsAdd,
} from "./wilds-rhovanion-helpers";
export function wildsAnduinSetup(s: GameState) {
  const q = s.wildsRhovanion!;
  q.questDeck = WILDS_ANDUIN_QUESTS.slice(1);
  q.currentQuest = W.north;
}
export function wildsAnduinAdvance(s: GameState) {
  if (!wildsAnduin(s)) return false;
  const q = s.wildsRhovanion!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (s.progress < (s.stage === 1 ? 10 : 5)) return true;
  if (
    s.stage === 1 &&
    wildsEnemies(s).some((u) => WILDS_EVIL_CREATURES.includes(u.code))
  )
    return true;
  if (
    s.stage === 2 &&
    !allCharacters(s).some(
      (u) => u.code === W.haldan && ownerOf(s, u) === firstPlayer(s),
    )
  )
    return true;
  if (s.stage === 3) return true;
  if (questDefeated(s, q.currentQuest)) return true;
  q.advancing = true;
  prepend(s, fx("wildsAnduinAdvance", { player: firstPlayer(s) }));
  return true;
}
export function wildsAnduinCheck(s: GameState) {
  if (!wildsAnduin(s)) return;
  const q = s.wildsRhovanion!;
  if (!q.haldanId) return;
  const haldan = [...s.staging, ...allCharacters(s)].find(
    (u) => u.id === q.haldanId,
  );
  if (!haldan) return;
  if (q.haldanGuardId && !wildsEnemies(s).some((u) => u.id === q.haldanGuardId))
    delete q.haldanGuardId;
  if (
    !q.haldanGuardId &&
    (s.staging.some((u) => u.id === haldan.id) ||
      ownerOf(s, haldan) !== firstPlayer(s))
  ) {
    s.staging = s.staging.filter((u) => u.id !== haldan.id);
    for (const p of playerOrder(s))
      forOwner(s, p, () => {
        s.allies = s.allies.filter((u) => u.id !== haldan.id);
      });
    haldan.owner = firstPlayer(s);
    forOwner(s, firstPlayer(s), () => s.allies.push(haldan));
  }
}
export function wildsAnduinBeginQuest(s: GameState) {
  if (wildsAnduin(s) && s.stage === 3)
    prepend(s, fx("wildsAnduinEvil", { player: firstPlayer(s) }));
}
export function wildsAnduinBeginEncounter(s: GameState) {
  if (wildsAnduin(s) && s.stage === 1 && s.wildsRhovanion!.questResources > 0) {
    s.wildsRhovanion!.questResources--;
    prepend(s, fx("wildsAnduinEvil", { player: firstPlayer(s) }));
  }
}
export function wildsAnduinQuestProgressPlaced(
  s: GameState,
  amount: number,
  fromQuesting = true,
) {
  if (wildsAnduin(s) && s.stage === 1 && amount > 0 && fromQuesting)
    s.wildsRhovanion!.questResources++;
}
export const wildsAnduinTravelProblem = (s: GameState, u: Unit) =>
  wildsAnduin(s) && s.stage === 3 && u.code === W.ford && s.progress < 5
    ? "The Passage of the Ford needs 5 progress before the players can travel to The Old Ford."
    : undefined;
export function wildsAnduinTravelEntered(s: GameState, u: Unit, actual = true) {
  if (!wildsAnduin(s)) return;
  if (u.code === W.ford && !u.blanked)
    prepend(
      s,
      ...s.staging
        .filter((u) => card(u.code).type_code === "enemy")
        .map((enemy) =>
          fx("immediateAttack", { target: enemy.id, player: firstPlayer(s) }),
        ),
    );
  if (actual && s.stage === 2)
    prepend(s, fx("wildsAnduinEvil", { player: firstPlayer(s) }));
}
export function wildsAnduinExplored(s: GameState, u: Unit) {
  if (!wildsAnduin(s) || u.blanked) return;
  if (u.code === W.riverbank)
    prepend(s, fx("wildsAnduinEvil", { player: firstPlayer(s), flag: true }));
  if (u.code === W.village) {
    const i = s.encounterDiscard.lastIndexOf(W.village);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
    u.code = W.haldan;
    u.progress = 0;
    u.damage = 0;
    u.resources = 0;
    u.flipped = false;
    s.staging.push(u);
    s.wildsRhovanion!.haldanId = u.id;
    const enemy = wildsEvil(s);
    if (enemy) {
      enemy.guarding = u.id;
      s.wildsRhovanion!.haldanGuardId = enemy.id;
    }
    wildsAnduinCheck(s);
  }
  if (u.code === W.ford && s.stage === 3) {
    win(s);
    s.reason = "The companions have rescued Haldan and crossed the Old Ford.";
  }
}
export function wildsAnduinEnemyDestination(s: GameState, u: Unit) {
  if (!wildsAnduin(s) || !WILDS_EVIL_CREATURES.includes(u.code)) return false;
  const q = s.wildsRhovanion!;
  q.evilDiscard.push(u.code);
  if (q.haldanGuardId === u.id) delete q.haldanGuardId;
  return true;
}
export function wildsAnduinEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("wildsAnduin")) return false;
  const q = s.wildsRhovanion;
  if (!q) return true;
  switch (e.kind) {
    case "wildsAnduinSetup":
      for (const _p of playerOrder(s)) {
        const code = wildsDiscardUntil(
          s,
          (c) => card(c).type_code === "location",
        );
        if (code) wildsAdd(s, code);
      }
      q.initialized = true;
      break;
    case "wildsAnduinEvil":
      wildsEvil(s, e.flag ? (e.player ?? firstPlayer(s)) : undefined);
      break;
    case "wildsAnduinAdvance":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.questResources = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("wildsAnduinReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "wildsAnduinReveal": {
      const unit = wildsTakeAside(s, s.stage === 2 ? W.village : W.ford);
      if (unit) s.staging.push(unit);
      if (s.stage === 2)
        prepend(
          s,
          ...playerOrder(s)
            .slice(1)
            .map((player) => fx("reveal", { player })),
        );
      else for (const _p of playerOrder(s).slice(1)) wildsEvil(s);
      break;
    }
  }
  return true;
}
