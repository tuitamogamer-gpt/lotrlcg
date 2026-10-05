import { enemyAttackPrevented } from "./core";
import {
  amonPlayerCannotDeclareAttack,
  amonPlayerCanAttackEnemy,
  amonPlayerAttackResolved,
  amonPlayerDefendersExhausted,
} from "./amon-din-player-cards";
import {
  consideredEngaged,
  beginConsideredEnemyShadows,
} from "./considered-engagement";
import { shadowFlameEnemyAttackStart } from "./shadow-flame";
import { druadanPlayerAttackKilled } from "./druadan-player-cards";
import { morgulPlayerAttackBonus } from "./morgul-player-cards";
import { longDarkCanAttack } from "./long-dark";
import {
  heirsPlayerNoDefenseExhaust,
  heirsPlayerDefendersDeclared,
} from "./heirs-player-cards";
import {
  collectorAttackersDeclared,
  collectorAttackKilled,
  collectorDefendersDeclared,
} from "./collector-player-cards";
import { effectiveTraits } from "./expansion-passives";
import {
  watcherWaterPlayerAttackEffects,
  watcherWaterRedirectAttack,
  watcherWaterEnemyAttackStart,
} from "./watcher-water";
import {
  foundationsPlayerNoAttackExhaust,
  foundationsPlayerAttackResolved,
  foundationsPlayerCombatDamage,
} from "./foundations-player-cards";
import { canFight } from "./core";
import { syncAttachmentText } from "./attachment-text";
import { khazadCanAttack, khazadCanRangedAttack } from "./khazad-dum";
import { longDarkPlayerAttackersDeclared } from "./long-dark-player-cards";
import { redhornCanDefend, redhornDefendersDeclared } from "./redhorn-gate";
import {
  rohanStagingAttack,
  rohanAttackDeclared,
  rohanAttackResolved,
} from "./rohan-player-cards";
import {
  watcherPlayerAttackBonus,
  watcherPlayerNoDefenseExhaust,
} from "./watcher-player-cards";
import {
  redhornPlayerAttackBonus,
  redhornPlayerAttackKilled,
} from "./redhorn-player-cards";
import { khazadAfterCombatDamage, KHAZAD } from "./khazad-dum";
// Enemy and player attacks.
import { card, name } from "./cards";
import type { GameState, Unit } from "./types";

import {
  activeSeat,
  ownerOf,
  playerOrder,
  defendersFor,
  attackersFor,
  forOwner,
  allCharacters,
  hasKeyword,
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
import { damage, raiseThreat, exhaustCharacter } from "./board";
import { carrockCombatDamage, carrockNoExhaustDefender } from "./carrock";
import { gondorAttackKilled } from "./gondor-player-cards";
import { rhosgobelCanFight } from "./rhosgobel";
import { pathOfNeed } from "./expansion-passives";
import { utilityAttackDeclared } from "./utility-attachments";
import { emynPlayerAttackKilled } from "./emyn-player-cards";
import { marshPlayerAttackResolved } from "./marsh-player-cards";
import {
  heirsCanDefend,
  heirsCombatDamageTarget,
  heirsDamageAmount,
  heirsShadowDealt,
} from "./heirs-numenor";
import { stewardFearAttackStarted } from "./steward-fear";

import { mirkwoodPlayerAttackDefense } from "./mirkwood-player-cards";

import {
  khazadPlayerAttackKilled,
  khazadPlayerAttackResolved,
} from "./khazad-player-cards";

export function playerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  regular = false,
  abilityMode?: "haldir" | "hands-upon-bow" | "knight",
) {
  ids = [...new Set(ids)];
  requireRule(
    !amonPlayerCannotDeclareAttack(s, activeSeat(s)),
    "Hobbit-sense prevents this fellowship from declaring attacks this round.",
  );
  requireRule(ids.length > 0, "Choose at least one attacker.");
  requireRule(
    longDarkCanAttack(s, enemy),
    "Rock Adder cannot be attacked until it deals damage this round.",
  );
  const attackers = ids.map((id) =>
    (abilityMode === "haldir"
      ? allCharacters(s).filter(
          (u) =>
            u.code === "08056" &&
            ownerOf(s, u) === activeSeat(s) &&
            !u.exhausted &&
            rhosgobelCanFight(enemy, u),
        )
      : abilityMode === "hands-upon-bow"
        ? allCharacters(s).filter(
            (u) =>
              ownerOf(s, u) === activeSeat(s) &&
              canFight(u) &&
              hasKeyword(u, "Ranged") &&
              khazadCanAttack(u) &&
              khazadCanRangedAttack(s, enemy, u, false) &&
              rhosgobelCanFight(enemy, u),
          )
        : attackersFor(s, enemy)
    ).find((u) => u.id === id),
  );
  if (abilityMode === "haldir")
    requireRule(ids.length === 1, "Haldir must attack alone with his ability.");
  if (abilityMode === "hands-upon-bow")
    requireRule(
      ids.length === 1 &&
        s.staging.some((u) => u.id === enemy.id) &&
        !/immune to (?:player )?card effects/i.test(
          card(enemy.code).text ?? "",
        ),
      "Hands Upon the Bow declares its single paid Ranged attacker against an eligible staging enemy.",
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
    !!abilityMode ||
      !staging ||
      amonPlayerCanAttackEnemy(s, enemy) ||
      playerOrder(s).some((p) => consideredEngaged(s, enemy, p)) ||
      (attackers.length === 1 && attackers[0]!.code === "01009") ||
      attackers.every(
        (u) =>
          u &&
          (rohanStagingAttack(s, u) ||
            (enemy.code === KHAZAD.archer && hasKeyword(u, "Ranged"))),
      ),
    "Only Dúnhere can attack a staging enemy, and he must attack alone.",
  );
  const priorQueue = s.queue.length;
  attackers.forEach((u) => {
    if (
      abilityMode !== "hands-upon-bow" &&
      (abilityMode === "knight" ||
        abilityMode === "haldir" ||
        (!pathOfNeed(s, u!) && !foundationsPlayerNoAttackExhaust(u!)))
    )
      requireRule(exhaustCharacter(s, u!), "This attacker cannot exhaust.");
  });
  const exhaustionResponses = s.queue.splice(0, s.queue.length - priorQueue);
  utilityAttackDeclared(s, enemy, attackers as Unit[]);
  if (regular) {
    if (!s.earlyAttackPlayers) enemy.attacked = true;
    if (
      s.table ||
      s.earlyAttackPlayers ||
      playerOrder(s).some((p) => consideredEngaged(s, enemy, p))
    )
      enemy.attackedBy = [...(enemy.attackedBy ?? []), activeSeat(s)];
  }
  prepend(
    s,
    ...exhaustionResponses,
    fx("roadAttackers", { ids }),
    ...attackers
      .filter((u) =>
        u!.attachments.some(
          (a) => !a.blanked && a.code === "rc133" && !a.exhausted,
        ),
      )
      .map((u) =>
        fx("valorResponse", {
          target: u!.id,
          source: enemy.id,
          player: ownerOf(s, u!),
        }),
      ),
    fx("resolvePlayerAttack", {
      target: enemy.id,
      ids,
      value:
        (staging &&
        attackers.length === 1 &&
        attackers[0]!.code === "01009" &&
        !attackers[0]!.blanked
          ? 1
          : 0) + (abilityMode === "hands-upon-bow" ? 1 : 0),
    }),
  );
  rohanAttackDeclared(s, enemy, attackers as Unit[]);
  longDarkPlayerAttackersDeclared(s, ids);
  collectorAttackersDeclared(s, ids);
  prepend(s, ...watcherWaterPlayerAttackEffects(s, enemy, ids));
}

export function resolvePlayerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  stagingBonus: number,
) {
  if (!s.used.includes("phase:attack-resolved"))
    s.used.push("phase:attack-resolved");
  const attackers = ids.map((id) => get(s, id)).filter((u): u is Unit => !!u);
  const contributions = Object.fromEntries(
    attackers.map((u) => [
      u.id,
      stats(s, u).attack +
        morgulPlayerAttackBonus(s, u, enemy) +
        redhornPlayerAttackBonus(s, u, enemy) +
        watcherPlayerAttackBonus(s, u, enemy) +
        (card(enemy.code).traits?.includes("Orc")
          ? u.attachments.filter((a) => !a.blanked && a.code === "01039").length
          : 0) +
        (attackers.length === 1 ? stagingBonus : 0),
    ]),
  );
  const power = Object.values(contributions).reduce((total, n) => total + n, 0);
  const defense = mirkwoodPlayerAttackDefense(s, enemy, ids);
  const amount = heirsDamageAmount(s, enemy, Math.max(0, power - defense));
  log(
    s,
    `${attackers.map((u) => name(u!)).join(" + ")} attack ${name(enemy)}: ${power} attack − ${defense} defense = ${amount} damage.`,
  );
  const lastKnownTraits = effectiveTraits(enemy);
  const remainingHealth = stats(s, enemy).health - enemy.damage;
  const lethal = amount >= remainingHealth;
  const engagedPlayer = s.staging.some((u) => u.id === enemy.id)
    ? undefined
    : ownerOf(s, enemy);
  if (watcherWaterRedirectAttack(s, enemy, ids, amount, remainingHealth))
    return;
  const assigned = damage(s, enemy.id, amount, { combatDamage: true });
  const killed = lethal && assigned && !get(s, enemy.id);
  if (killed && s.status === "playing")
    playerAttackKilled(s, enemy, ids, engagedPlayer, lastKnownTraits);
  playerAttackResolved(s, enemy, ids, assigned ? amount : 0, remainingHealth);
  if (assigned && s.status === "playing")
    foundationsPlayerCombatDamage(s, enemy, ids, amount, contributions);
}
/** Actual attack completion, including a Tentacle's replacement damage. */
export function playerAttackResolved(
  s: GameState,
  enemy: Unit,
  ids: string[],
  amount: number,
  remainingHealth: number,
) {
  if (s.status !== "playing") return;
  rohanAttackResolved(s, enemy, ids, amount, remainingHealth);
  amonPlayerAttackResolved(s, enemy, ids, amount);
  khazadPlayerAttackResolved(s, enemy, ids);
  foundationsPlayerAttackResolved(s, ids);
  prepend(s, ...marshPlayerAttackResolved(s, ids));
}

/** After an enemy is destroyed by attack damage, including assigned excess damage. */
export function playerAttackKilled(
  s: GameState,
  enemy: Unit,
  ids: string[],
  engagedPlayer?: number,
  lastKnownTraits = effectiveTraits(enemy),
) {
  const attackers = ids.map((id) => get(s, id)).filter((u): u is Unit => !!u);
  const responses = attackers.flatMap((u) => [
    ...(u.code === "01005" ? [`01005:${u.id}`] : []),
    ...u.attachments
      .filter((a) => !a.blanked && a.code === "01039")
      .map((a) => `01039:${a.id}`),
  ]);
  if (responses.length)
    prepend(
      s,
      fx("attackProgress", { ids: responses, player: s.table?.first ?? 0 }),
    );
  druadanPlayerAttackKilled(s, enemy, ids, lastKnownTraits);
  collectorAttackKilled(s, enemy, ids, lastKnownTraits);
  redhornPlayerAttackKilled(s, ids);
  gondorAttackKilled(
    s,
    attackers.map((u) => u.id),
  );
  khazadPlayerAttackKilled(s, enemy, ids);
  emynPlayerAttackKilled(
    s,
    enemy,
    attackers.map((u) => u.id),
    engagedPlayer,
  );
}

export function combatDamage(
  s: GameState,
  target: Unit,
  enemy: Unit,
  amount: number,
) {
  target = heirsCombatDamageTarget(s, target);
  const remainingHealth = stats(s, target).health - target.damage;
  if (!damage(s, target.id, amount, { enemyId: enemy.id, combatDamage: true }))
    return;
  applyCombatDamageConsequences(s, target, enemy, amount, remainingHealth);
}

/** The attack actually begins once, before its declaration and response windows. */
export function enemyAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (enemyAttackPrevented(s, enemy, player)) return;
  shadowFlameEnemyAttackStart(s, enemy, player);
  stewardFearAttackStarted(s, enemy, player);
}

export function applyCombatDamageConsequences(
  s: GameState,
  target: Unit,
  enemy: Unit,
  amount: number,
  remainingHealth: number,
) {
  const killed = amount >= remainingHealth;
  if (enemy.code === "01082")
    forOwner(s, ownerOf(s, enemy), () => {
      raiseThreat(s, Math.max(0, amount - remainingHealth), "encounter");
    });
  khazadAfterCombatDamage(s, enemy, target, amount, remainingHealth);
  carrockCombatDamage(s, target, enemy, amount);
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
  watcherResolved = false,
  shadowsPrepared = false,
) {
  syncAttachmentText(s, enemy);
  if (enemyAttackPrevented(s, enemy)) {
    s.combat = {
      enemyId: enemy.id,
      defenderId: null,
      defenderIds: [],
      attackBonus: 0,
    };
    prepend(s, fx("enemyDone", { flag: true }));
    log(s, `${name(enemy)} cannot attack this player during this phase.`);
    return;
  }
  if (!watcherResolved && watcherWaterEnemyAttackStart(s, enemy, returnWolf))
    return;
  requireRule(
    new Set(ids).size === ids.length && (ids.length <= 1 || s.standTogether),
    "Multiple defenders require Stand Together.",
  );
  const defenders = ids.map((id) =>
    defendersFor(s, enemy).find((u) => u.id === id),
  );
  requireRule(
    defenders.every(
      (u) =>
        !!u &&
        rhosgobelCanFight(enemy, u) &&
        redhornCanDefend(enemy, u) &&
        heirsCanDefend(s, enemy, u),
    ),
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
      heirsShadowDealt(s, enemy);
      log(
        s,
        "Dol Guldur Beastmaster receives an additional facedown shadow before the defender is declared.",
      );
    }
  }
  if (!shadowsPrepared) beginConsideredEnemyShadows(s, enemy);
  const beforeForced = s.queue.length;
  if (!shadowsPrepared) enemyAttackStarted(s, enemy, activeSeat(s));
  redhornDefendersDeclared(s, enemy, ids);
  const forcedResponses = s.queue.splice(0, s.queue.length - beforeForced);
  const priorQueue = s.queue.length;
  const actuallyExhausted: string[] = [];
  for (const d of defenders.filter((d) => d && get(s, d.id)))
    if (
      !heirsPlayerNoDefenseExhaust(s, d!) &&
      !watcherPlayerNoDefenseExhaust(d!) &&
      !carrockNoExhaustDefender(enemy, d!) &&
      !pathOfNeed(s, d!)
    ) {
      requireRule(exhaustCharacter(s, d!), "This defender cannot exhaust.");
      actuallyExhausted.push(d!.id);
    }
  const exhaustionResponses = s.queue.splice(0, s.queue.length - priorQueue);
  s.combat = {
    enemyId: enemy.id,
    attackPlayer: activeSeat(s),
    damageDealt: 0,
    defenderId: ids[0] ?? null,
    defenderIds: ids,
    attackBonus: 0,
    returnWolf,
    returnToStaging:
      ["01085", KHAZAD.warg].includes(enemy.code) &&
      enemy.shadows.some((code) => !card(code).shadow),
  };
  if (enemy.code === "01084") raiseThreat(s, 1, "encounter");
  for (const d of defenders.filter((d) => d && get(s, d.id)))
    if (d!.code === "01029") damage(s, enemy.id, 1);
  if (!get(s, enemy.id)) {
    prepend(s, ...forcedResponses, ...exhaustionResponses, fx("enemyDone"));
    return;
  }
  prepend(
    s,
    ...forcedResponses,
    ...exhaustionResponses,
    fx("redhornDefenders", { ids }),
    fx("swiftStrike"),
    fx("mirkwoodCombatWindow"),
    fx("gondorDefenseWindow", { ids }),
    ...enemy.shadows.map((code) => fx("shadowReveal", { code })),
    fx("mirkwoodCombatWindow"),
    fx("gondorDefenseWindow", { ids }),
    fx("enemyDamage"),
    fx("enemyDone"),
  );
  collectorDefendersDeclared(s, ids);
  heirsPlayerDefendersDeclared(s, enemy, ids);
  const beforeSmall = s.queue.length;
  amonPlayerDefendersExhausted(s, enemy, actuallyExhausted);
  const smallResponses = s.queue.splice(0, s.queue.length - beforeSmall);
  const mandatory = new Set([...forcedResponses, ...exhaustionResponses]);
  const afterMandatory = s.queue.reduce(
    (last, e, index) => (mandatory.has(e) ? index + 1 : last),
    0,
  );
  s.queue.splice(afterMandatory, 0, ...smallResponses);
}
