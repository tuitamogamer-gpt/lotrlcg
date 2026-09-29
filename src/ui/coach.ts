import { card } from "../game/cards";
import {
  canFight,
  canPlay,
  characters,
  needsTarget,
  playTargets,
  questWill,
  stagingThreat,
  stats,
  threatOf,
} from "../game/engine";
import { activeSeat } from "../game/table";
import type { GameState, Unit } from "../game/types";

/** One short piece of advice for the current decision, derived from public state. */
export interface CoachTip {
  title: string;
  text: string;
  tone: "info" | "good" | "warn";
  danger?: string;
}

const nameOf = (u: Unit) => card(u.code).name;
const list = (units: Unit[]) => units.map(nameOf).join(", ");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function warnings(s: GameState): string | undefined {
  const dying = s.heroes.find((h) => stats(s, h).health - h.damage <= 1);
  if (dying)
    return `${nameOf(dying)} has 1 hit point left. Heal or keep it out of combat.`;
  if (s.threat >= 45)
    return `Threat ${s.threat}: elimination at 50. Lower it with Spirit cards or Gandalf.`;
  return undefined;
}

export function coachTip(s: GameState): CoachTip | null {
  if (s.flow?.pending || s.choice || s.status !== "playing") return null;
  if (s.table?.seats[activeSeat(s)].eliminated) return null;
  const chars = characters(s);
  const committed = (u: Unit) => u.committed || s.committedIds.includes(u.id);
  const ready = chars.filter((u) => !u.exhausted);
  const enemies = s.staging.filter((u) => card(u.code).type_code === "enemy");
  const willEngage = enemies.filter(
    (u) => (card(u.code).engagement ?? 99) <= s.threat,
  );
  const danger = warnings(s);
  const tip = (t: Omit<CoachTip, "danger">): CoachTip => ({ ...t, danger });
  switch (s.phase) {
    case "setup": {
      const cheap = s.hand.filter(
        (u) =>
          Number(card(u.code).cost) <= 2 &&
          ["ally", "attachment"].includes(card(u.code).type_code),
      ).length;
      if (cheap >= 2)
        return tip({
          title: "Keep this hand",
          text: `${plural(cheap, "card")} cost 2 or less, so you can start building your board in round one.`,
          tone: "good",
        });
      if (s.mulled)
        return tip({
          title: "Play what you have",
          text: "The mulligan is used. Keep the hand and plan around the cards you can afford.",
          tone: "info",
        });
      return tip({
        title: "Consider a mulligan",
        text: `Only ${plural(cheap, "cheap card")} in hand. Each hero gains 1 resource per round, so cards costing 1–2 come out fastest.`,
        tone: "warn",
      });
    }
    case "planning": {
      const playable = s.hand.filter(
        (u) =>
          !canPlay(s, u) && (!needsTarget(u) || playTargets(s, u).length > 0),
      );
      if (playable.length) {
        const allies = playable.filter(
          (u) => card(u.code).type_code === "ally",
        ).length;
        return tip({
          title: `${plural(playable.length, "card")} you can play now`,
          text: allies
            ? "Allies add willpower for questing and can absorb an enemy attack. Spend resources before threat forces you into combat."
            : "Attachments and events strengthen your heroes. Spend resources before threat forces you into combat.",
          tone: "good",
        });
      }
      const costs = s.hand.map((u) => Number(card(u.code).cost) || 0);
      return tip({
        title: s.hand.length ? "Nothing affordable yet" : "Your hand is empty",
        text: s.hand.length
          ? `Resources carry over. Your cheapest card costs ${Math.min(...costs)}; each hero gains 1 resource next round.`
          : "Begin the quest. You draw a card at the start of every round.",
        tone: "info",
      });
    }
    case "quest": {
      const will = questWill(s),
        threat = stagingThreat(s);
      const reserve = ready.filter((u) => !committed(u) && canFight(u));
      const attackers = [...s.engaged, ...willEngage];
      if (will < threat)
        return tip({
          title: `Willpower ${will} is below staging threat ${threat}`,
          text: `Commit more characters or accept ${threat - will} threat. A revealed card usually adds 1–3 threat before the quest resolves.`,
          tone: "warn",
        });
      if (attackers.length && !reserve.length)
        return tip({
          title: "Keep a defender ready",
          text: `${will} willpower beats ${threat} threat, but ${list(attackers)} will attack this round. Leave your best defender uncommitted.`,
          tone: "warn",
        });
      return tip({
        title: `Willpower ${will} beats threat ${threat}`,
        text: `About ${will - threat} progress if the reveal is quiet. ${plural(reserve.length, "character")} stay ready for combat.`,
        tone: "good",
      });
    }
    case "staging":
      return tip({
        title: "Last actions before the quest resolves",
        text: `Staging threat is now ${stagingThreat(s)} against ${questWill(s)} willpower. Play events that add willpower or lower threat, then resolve the quest.`,
        tone: "info",
      });
    case "travel": {
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location",
      );
      if (s.activeLocation) {
        const c = card(s.activeLocation.code);
        return tip({
          title: `Exploring ${c.name}`,
          text: `${s.activeLocation.progress} / ${c.quest ?? 0} progress. Only one location can be active, so continue to the encounter phase.`,
          tone: "info",
        });
      }
      if (!locations.length)
        return tip({
          title: "No location to travel to",
          text: "Continue. Quest progress goes straight to the quest card this round.",
          tone: "info",
        });
      const best = [...locations].sort(
        (a, b) => threatOf(s, b) - threatOf(s, a),
      )[0];
      return tip({
        title: `Travel to ${nameOf(best)} to remove ${threatOf(s, best)} threat`,
        text: `An active location stops adding threat, but future progress explores it first (${card(best.code).quest ?? 0} needed). Read its travel cost.`,
        tone: "good",
      });
    }
    case "encounter": {
      if (willEngage.length)
        return tip({
          title: `${list(willEngage)} will engage you`,
          text: `Engagement cost ${willEngage.map((u) => card(u.code).engagement).join("/")} is at or below your threat ${s.threat}. Prepare a ready defender.`,
          tone: "warn",
        });
      if (enemies.length && ready.length) {
        const e = enemies[0];
        return tip({
          title: "Optional engagement",
          text: `${nameOf(e)} needs threat ${card(e.code).engagement} to engage on its own. Engaging it now, while defenders are ready, removes ${threatOf(s, e)} threat from staging.`,
          tone: "info",
        });
      }
      return tip({
        title: "No enemies will engage",
        text: "Continue to combat. Nothing in staging can reach you this round.",
        tone: "good",
      });
    }
    case "defense": {
      const enemy = s.engaged.find((e) => !e.attacked && !e.feinted);
      if (!enemy) return null;
      const attack = stats(s, enemy).attack;
      const scored = ready.filter(canFight).map((u) => ({
        u,
        damage: Math.max(0, attack - stats(s, u).defense),
        hp: stats(s, u).health - u.damage,
      }));
      const safe = scored
        .filter((o) => o.damage < o.hp)
        .sort((a, b) => a.damage - b.damage || b.hp - a.hp)[0];
      if (safe)
        return tip({
          title: `Defend with ${nameOf(safe.u)}`,
          text: `${nameOf(enemy)} attacks for ${attack}. ${nameOf(safe.u)} (defense ${stats(s, safe.u).defense}) takes ${safe.damage} damage and survives. A shadow card can raise the attack.`,
          tone: "good",
        });
      const chump = scored
        .filter((o) => card(o.u.code).type_code === "ally")
        .sort((a, b) => a.hp - b.hp)[0];
      if (chump)
        return tip({
          title: `Block with ${nameOf(chump.u)}`,
          text: `${nameOf(enemy)} attacks for ${attack} and no hero can defend safely. The ally would be destroyed, but your heroes stay unharmed.`,
          tone: "warn",
        });
      return tip({
        title: "No safe defender",
        text: `${nameOf(enemy)} attacks for ${attack}. Undefended damage goes to one hero of your choice.`,
        tone: "warn",
      });
    }
    case "attack": {
      const seat = activeSeat(s);
      const targets = s.engaged.filter((e) =>
        s.table ? !e.attackedBy?.includes(seat) : !e.attacked,
      );
      if (!targets.length)
        return tip({
          title: "No enemies left to attack",
          text: "Finish attacks to reach the refresh phase.",
          tone: "info",
        });
      const attackers = ready.filter(canFight);
      if (!attackers.length)
        return tip({
          title: "Nobody is ready to attack",
          text: "Exhausted characters cannot attack. Finish attacks; everyone readies in the refresh phase.",
          tone: "info",
        });
      const target = [...targets].sort(
        (a, b) =>
          stats(s, a).health - a.damage - (stats(s, b).health - b.damage),
      )[0];
      const power = attackers.reduce((sum, u) => sum + stats(s, u).attack, 0);
      const defense = stats(s, target).defense;
      const hp = stats(s, target).health - target.damage;
      const damage = Math.max(0, power - defense);
      return damage >= hp
        ? tip({
            title: `Destroy ${nameOf(target)}`,
            text: `All ready attackers deal ${power} − ${defense} = ${damage} damage, enough for its ${hp} remaining hit points.`,
            tone: "good",
          })
        : tip({
            title: `${nameOf(target)} would survive`,
            text: `${power} attack − ${defense} defense = ${damage} damage against ${hp} hit points. Attack to wear it down, or keep attackers ready.`,
            tone: "info",
          });
    }
    case "refresh":
      return tip({
        title: `Threat rises to ${s.threat + 1}`,
        text:
          s.threat >= 40
            ? "Above 40 most enemies engage automatically. Lower threat with Spirit cards or Gandalf."
            : "Every refresh raises threat by 1. Elimination comes at 50.",
        tone: s.threat >= 40 ? "warn" : "info",
      });
  }
  return null;
}
