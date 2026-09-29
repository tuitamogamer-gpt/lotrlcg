// Enemy and player attacks.
import { card, name } from "./cards";
import type { GameState, Unit } from "./types";

import {
  activeSeat,
  ownerOf,
  playerOrder,
  defendersFor,
  attackersFor,
} from "./table";

import {
  encounterDraw,
  fx,
  get,
  log,
  prepend,
  requireRule,
  stats,
} from "./core";
import { damage } from "./board";

export function playerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  regular = false,
) {
  ids = [...new Set(ids)];
  requireRule(ids.length > 0, "Choose at least one attacker.");
  const attackers = ids.map((id) =>
    attackersFor(s, enemy).find((u) => u.id === id),
  );
  requireRule(
    attackers.every(Boolean),
    "All attackers must be ready characters.",
  );
  requireRule(
    attackers.some((u) => u && ownerOf(s, u) === activeSeat(s)),
    "Declare an attack with at least one character you control.",
  );
  const staging = s.staging.some((u) => u.id === enemy.id);
  requireRule(
    !staging || (attackers.length === 1 && attackers[0]!.code === "01009"),
    "Only Dúnhere can attack a staging enemy, and he must attack alone.",
  );
  attackers.forEach((u) => {
    u!.exhausted = true;
  });
  if (regular) {
    enemy.attacked = true;
    if (s.table)
      enemy.attackedBy = [...(enemy.attackedBy ?? []), activeSeat(s)];
  }
  prepend(
    s,
    ...attackers
      .filter((u) =>
        u!.attachments.some((a) => a.code === "rc133" && !a.exhausted),
      )
      .map((u) => fx("valorResponse", { target: u!.id, source: enemy.id })),
    fx("resolvePlayerAttack", {
      target: enemy.id,
      ids,
      value: staging ? 1 : 0,
    }),
  );
}

export function resolvePlayerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  stagingBonus: number,
) {
  const attackers = ids.map((id) => get(s, id)).filter((u): u is Unit => !!u);
  const power =
    attackers.reduce(
      (n, u) =>
        n +
        stats(s, u!).attack +
        (card(enemy.code).traits?.includes("Orc")
          ? u!.attachments.filter((a) => a.code === "01039").length
          : 0),
      0,
    ) + stagingBonus;
  const defense = stats(s, enemy).defense;
  const amount = Math.max(0, power - defense);
  log(
    s,
    `${attackers.map((u) => name(u!)).join(" + ")} attack ${name(enemy)}: ${power} attack − ${defense} defense = ${amount} damage.`,
  );
  const killed = enemy.damage + amount >= stats(s, enemy).health;
  damage(s, enemy.id, amount);
  if (killed && s.status === "playing") {
    const responses = attackers.flatMap((u) => [
      ...(u.code === "01005" ? [`01005:${u.id}`] : []),
      ...u.attachments
        .filter((a) => a.code === "01039")
        .map((a) => `01039:${a.id}`),
    ]);
    if (responses.length)
      prepend(
        s,
        fx("attackProgress", { ids: responses, player: s.table?.first ?? 0 }),
      );
  }
}

export function combatDamage(
  s: GameState,
  target: Unit,
  enemy: Unit,
  amount: number,
) {
  const killed = target.damage + amount >= stats(s, target).health;
  if (enemy.code === "01082")
    s.threat += Math.max(0, amount - (stats(s, target).health - target.damage));
  damage(s, target.id, amount);
  if (
    killed &&
    enemy.code === "01082" &&
    s.campaign &&
    s.scenarioId === "anduin" &&
    !s.campaignScarred &&
    s.status === "playing"
  ) {
    s.campaignScarred = true;
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("earnPermanent", { code: "rc138", player }),
      ),
    );
  }
}

export function beginEnemyAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  returnWolf = false,
) {
  requireRule(
    new Set(ids).size === ids.length && (ids.length <= 1 || s.standTogether),
    "Multiple defenders require Stand Together.",
  );
  const defenders = ids.map((id) => defendersFor(s).find((u) => u.id === id));
  requireRule(
    defenders.every(Boolean),
    "Choose ready characters able to defend.",
  );
  requireRule(
    ids.length <= 1 ||
      defenders.every((u) => u && ownerOf(s, u) === activeSeat(s)),
    "Stand Together combines characters controlled by the defending player.",
  );
  // Beastmaster's Forced effect precedes declaration responses (including Spearman).
  if (enemy.code === "01091") {
    const code = encounterDraw(s, true);
    if (code) {
      enemy.shadows.push(code);
      log(
        s,
        "Dol Guldur Beastmaster receives an additional facedown shadow before the defender is declared.",
      );
    }
  }
  for (const d of defenders) d!.exhausted = true;
  s.combat = {
    enemyId: enemy.id,
    defenderId: ids[0] ?? null,
    defenderIds: ids,
    attackBonus: 0,
    returnWolf,
    returnToStaging:
      enemy.code === "01085" &&
      enemy.shadows.some((code) => !card(code).shadow),
  };
  if (enemy.code === "01084") s.threat++;
  for (const d of defenders) if (d!.code === "01029") damage(s, enemy.id, 1);
  if (!get(s, enemy.id)) {
    prepend(s, fx("enemyDone"));
    return;
  }
  prepend(
    s,
    fx("swiftStrike"),
    ...enemy.shadows.map((code) => fx("shadowReveal", { code })),
    fx("enemyDamage"),
    fx("enemyDone"),
  );
}
