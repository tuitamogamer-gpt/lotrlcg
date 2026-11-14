import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { MORDOR_ORCS } from "./mordor-orcs-codes";
export { MORDOR_ORCS };
import { name } from "./cards";
import { choose, fx, get, log, prepend } from "./core";
import { exhaustCharacter, raiseThreat } from "./board";
import { activeSeat, forOwner, seatName, seatView } from "./table";
import { isEnemy } from "./ships";
import { whiteHandArchery } from "./white-hand";

/**
 * The Orcs of Mordor encounter set of The Mountain of Fire, shared by The
 * Tower of Cirith Ungol and The Black Gate Opens: Orc of Mordor, Snaga Archer
 * and Uruk Soldier, with their engagement effects and shadows, and the
 * generic exhaust, damage and threat steps the scenarios' own cards reuse.
 */
const O = MORDOR_ORCS;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const defenders = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};

/** Forced: after an Orcs of Mordor enemy engages you. */
export function mordorOrcEngaged(s: GameState, u: Unit, p: number) {
  if (u.blanked) return false;
  if (u.code === O.orc)
    prepend(s, fx("moExhaustOne", { text: "Orc of Mordor", player: p }));
  else if (u.code === O.archer) prepend(s, fx("moArcherDamage", { player: p }));
  else if (u.code === O.soldier)
    prepend(s, fx("moThreat", { value: 2, text: "Uruk Soldier", player: p }));
  else return false;
  return true;
}
/** The Orcs of Mordor's shadow effects. */
export function mordorOrcShadow(s: GameState, shadow: string) {
  const c = s.combat;
  if (!c) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (shadow) {
    case O.orc:
      prepend(s, fx("moExhaustOne", { text: "Orc of Mordor", player: p }));
      return true;
    case O.archer: {
      const damaged = defenders(s).some((d) => d.damage > 0);
      c.attackBonus += damaged ? 2 : 1;
      log(
        s,
        `Snaga Archer: the attacking enemy gets +${damaged ? 2 : 1} attack.`,
        "danger",
      );
      return true;
    }
    case O.soldier:
      c.attackBonus += 1;
      c.cuReturnOnKill = true;
      log(
        s,
        "Uruk Soldier: +1 attack; if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
  }
  return false;
}
/** Uruk Soldier's shadow: a destroyed character returns the attacker to the staging area. */
export function mordorOrcCharacterDestroyed(
  s: GameState,
  context: DamageContext,
) {
  const c = s.combat;
  if (!c?.cuReturnOnKill || !context.combatDamage) return;
  if (context.enemyId !== c.enemyId) return;
  c.cuReturnOnKill = false;
  c.returnToStaging = true;
}
/** Archery X of the enemies in the staging area (Snaga Archer, Easterling Bowman). */
export function stagingArchery(s: GameState, player: number) {
  const archery = s.staging.reduce(
    (n, x) => n + (x.blanked || !isEnemy(x) ? 0 : whiteHandArchery(x.code)),
    0,
  );
  if (archery > 0) prepend(s, fx("heirsArchery", { value: archery, player }));
}

export function mordorOrcsEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    // Raise a player's threat (Uruk Soldier and the scenarios' own cards).
    case "moThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "his" : "your"} threat by ${e.value}.`,
        "danger",
      );
      return true;
    // Exhaust a character you control.
    case "moExhaustOne": {
      const ready = [...seatView(s, p).heroes, ...seatView(s, p).allies].filter(
        (c) => !c.exhausted,
      );
      if (!ready.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
          ready.map((c) => ({
            id: c.id,
            code: c.code,
            label: name(c),
            effects: [
              fx("moExhaust", { target: c.id, text: e.text, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "moExhaust":
      if (u && exhaustCharacter(s, u))
        log(s, `${e.text}: ${name(u)} is exhausted.`, "danger");
      return true;
    // Snaga Archer: deal 2 damage to a character you control.
    case "moArcherDamage": {
      const targets = [...seatView(s, p).heroes, ...seatView(s, p).allies];
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Snaga Archer · Deal 2 damage to a character you control${seatLabel(s, p)}`,
          targets.map((c) => ({
            id: c.id,
            code: c.code,
            label: `${name(c)} · ${c.damage} damage`,
            effects: [fx("damage", { target: c.id, value: 2, player: p })],
          })),
        ),
      );
      return true;
    }
  }
  return false;
}
