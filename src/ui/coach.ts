import {
  engagedEnemies,
  normalAttackPending,
} from "../game/considered-engagement";
import { shadowFlameCanMove } from "../game/shadow-flame";
import { effectiveKeyword } from "../game/expansion-passives";
import { card } from "../game/cards";
import { engagementCost, questStat as currentQuestStat } from "../game/core";
import {
  canFight,
  enemyAttackPrevented,
  canPlay,
  canCommit,
  canTravel,
  optionalEngagementProblem,
  locationQuest,
  characters,
  hasClue,
  needsTarget,
  playTargets,
  questWill,
  stagingThreat,
  stats,
  threatOf,
} from "../game/engine";
import {
  activeSeat,
  allActiveLocations,
  attackersFor,
  defendersFor,
  ownerOf,
} from "../game/table";
import type { GameState, Unit } from "../game/types";
import { emynMuilMustCommit, emynMuilEventsBlocked } from "../game/emyn-muil";

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
  if (s.escapeTest)
    return {
      title:
        s.escapeTest.phase === "preparing"
          ? "Reserve ready characters for the escape"
          : "Actions before escape cards are dealt",
      text:
        s.escapeTest.phase === "preparing"
          ? "Choose ready heroes and allies. Each committed character exhausts to contribute its current strength."
          : "You can play events and use abilities now. Resolve the escape test when you are ready; committed strength must exceed the dealt escape values.",
      tone: "info",
    };
  if (
    s.table &&
    activeSeat(s) !== s.table.turn &&
    [
      "setup",
      "resource",
      "planning",
      "quest",
      "encounter",
      "defense",
      "attack",
    ].includes(s.phase)
  )
    return null;
  const questStat = currentQuestStat(s);
  const questLabel =
    questStat === "attack"
      ? "Attack"
      : questStat === "defense"
        ? "Defense"
        : "Willpower";
  const chars = characters(s);
  const committed = (u: Unit) => u.committed || s.committedIds.includes(u.id);
  const ready = chars.filter((u) => !u.exhausted);
  const enemies = s.staging.filter(
    (u) => card(u.code).type_code === "enemy" && shadowFlameCanMove(s, u),
  );
  const willEngage = enemies.filter((u) => engagementCost(s, u) <= s.threat);
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
    case "resource":
      return tip({
        title: "Resource actions",
        text: "Resource collection and card draw are complete. Use eligible events or abilities before beginning planning; allies and attachments wait for planning.",
        tone: "info",
      });
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
      return tip({
        title: s.hand.length
          ? "No card plays available now"
          : "Your hand is empty",
        text: s.hand.length
          ? "Cards may need matching resources, an eligible target, or a response trigger. Resources carry over; you can begin the quest when ready."
          : "Begin the quest. You draw a card at the start of every round.",
        tone: "info",
      });
    }
    case "quest": {
      if (emynMuilMustCommit(s)) {
        const remaining = chars.filter((u) => canCommit(s, u) && !committed(u));
        return tip({
          title: remaining.length
            ? "Every ready character must quest"
            : "All required questers are selected",
          text: remaining.length
            ? `The Falls of Rauros requires ${list(remaining)} to commit. Select all remaining eligible ready characters before revealing encounters.`
            : "The Falls of Rauros requires every eligible ready character to commit. Continue to staging when your actions are finished.",
          tone: remaining.length ? "warn" : "info",
        });
      }
      if (
        s.scenarioId === "hunt-for-gollum" &&
        s.stage === 3 &&
        !s.heroes.some(hasClue)
      )
        return tip({
          title: "A Clue is required to quest",
          text: "On the Trail allows only a fellowship whose hero holds a Clue to commit characters. This fellowship must commit none; keep its characters ready for combat.",
          tone: "warn",
        });
      const will = questWill(s),
        threat = stagingThreat(s);
      const reserve = ready.filter((u) => !committed(u) && canFight(u));
      const attackers = [...engagedEnemies(s), ...willEngage].filter(
        (e) => !enemyAttackPrevented(s, e),
      );
      if (will < threat)
        return tip({
          title: `${questLabel} ${will} is below staging threat ${threat}`,
          text: `Commit more characters or risk ${threat - will} threat. Revealed encounters and their effects can change these totals before resolution.`,
          tone: "warn",
        });
      if (attackers.length && !reserve.length)
        return tip({
          title: "Keep a defender ready",
          text: `${will} ${questLabel.toLowerCase()} meets the current ${threat} threat, but ${list(attackers)} may attack this round. Leave your best defender uncommitted.`,
          tone: "warn",
        });
      return tip({
        title:
          will === threat
            ? `${questLabel} ${will} matches threat ${threat}`
            : `${questLabel} ${will} beats threat ${threat}`,
        text: `${will - threat} potential progress before encounter reveals. ${plural(reserve.length, "character")} ${reserve.length === 1 ? "stays" : "stay"} ready for combat.`,
        tone: will === threat ? "info" : "good",
      });
    }
    case "staging":
      return tip({
        title: "Last actions before the quest resolves",
        text: `Staging threat is now ${stagingThreat(s)} against ${questWill(s)} ${questLabel.toLowerCase()}. ${emynMuilEventsBlocked(s) ? "Amon Hen prevents playing events; use other legal actions before resolving the quest." : `Use events or abilities that increase ${questLabel.toLowerCase()} or lower threat, then resolve the quest.`}`,
        tone: "info",
      });
    case "travel": {
      const locations = s.staging.filter(
        (u) => card(u.code).type_code === "location" && !canTravel(s, u),
      );
      const active = allActiveLocations(s);
      if (active.length && !locations.length) {
        return tip({
          title:
            active.length === 1
              ? `Exploring ${nameOf(active[0])}`
              : `Exploring ${active.length} active locations`,
          text:
            active
              .map(
                (u) =>
                  `${nameOf(u)}: ${u.progress} / ${locationQuest(s, u)} progress.`,
              )
              .join(" ") + " Continue to the encounter phase.",
          tone: "info",
        });
      }
      if (!locations.length)
        return tip({
          title: "No location to travel to",
          text: "Continue to engagement. With no active location, future quest progress goes straight to the quest card.",
          tone: "info",
        });
      const mandatory = locations.find((u) => u.code === "01088");
      const best =
        mandatory ??
        [...locations].sort((a, b) => threatOf(s, b) - threatOf(s, a))[0];
      return tip({
        title: `Travel to ${nameOf(best)} to remove ${threatOf(s, best)} threat`,
        text: mandatory
          ? `You must travel to The East Bight while it is in staging and there is no active location. Future quest progress explores it first (${locationQuest(s, best)} needed).`
          : `An active location stops adding threat, but future progress explores it first (${locationQuest(s, best)} needed). Read its travel cost.`,
        tone: mandatory ? "warn" : "good",
      });
    }
    case "encounter": {
      if (willEngage.length)
        return tip({
          title: `${list(willEngage)} will engage you`,
          text: `Engagement cost ${willEngage.map((u) => engagementCost(s, u)).join("/")} is at or below your threat ${s.threat}. Prepare a ready defender.`,
          tone: "warn",
        });
      const optional = enemies.filter((e) => !optionalEngagementProblem(s, e));
      if (optional.length && ready.length) {
        const e = optional[0];
        return tip({
          title: "Optional engagement",
          text: `${nameOf(e)} needs threat ${engagementCost(s, e)} to engage on its own. Engaging it now, while defenders are ready, removes ${threatOf(s, e)} threat from staging.`,
          tone: "info",
        });
      }
      return tip({
        title: "No new automatic engagements",
        text: engagedEnemies(s).length
          ? "Continue to combat. Already engaged enemies still attack, so keep a defender ready."
          : "Continue to combat. No staging enemy engages automatically at your current threat.",
        tone: "good",
      });
    }
    case "defense": {
      const enemy = engagedEnemies(s).find(
        (e) => normalAttackPending(s, e) && !enemyAttackPrevented(s, e),
      );
      if (!enemy) return null;
      const attack = stats(s, enemy).attack;
      const scored = defendersFor(s, enemy).map((u) => ({
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
        text:
          s.scenarioId === "siege-of-cair-andros" && s.stage === 1
            ? `${nameOf(enemy)} attacks for ${attack}. Undefended damage goes to the lowest-threat Battleground; excess damage does not carry over.`
            : `${nameOf(enemy)} attacks for ${attack}. Undefended damage goes to one hero of your choice.`,
        tone: "warn",
      });
    }
    case "attack": {
      const seat = activeSeat(s);
      const physicalTargets = new Map(
        [
          ...engagedEnemies(s),
          ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
        ].map((enemy) => [enemy.id, enemy]),
      );
      const targets = [...physicalTargets.values()].filter((e) =>
        s.table ? !e.attackedBy?.includes(seat) : !e.attacked,
      );
      if (!targets.length)
        return tip({
          title: "No enemies left to attack",
          text: s.earlyAttackPlayers?.length
            ? "Finish these early attacks to continue to enemy attacks."
            : "Finish attacks to reach the refresh phase.",
          tone: "info",
        });
      const attackable = targets.filter((enemy) =>
        attackersFor(s, enemy).some((u) => ownerOf(s, u) === seat),
      );
      if (!attackable.length)
        return tip({
          title: "No legal attack is available",
          text: s.earlyAttackPlayers?.length
            ? "Finish these early attacks to continue to enemy attacks."
            : "Card restrictions or exhausted characters prevent an attack. Finish attacks to reach refresh.",
          tone: "info",
        });
      const target = [...attackable].sort(
        (a, b) =>
          stats(s, a).health - a.damage - (stats(s, b).health - b.damage),
      )[0];
      const attackers = attackersFor(s, target);
      const power = attackers.reduce((sum, u) => sum + stats(s, u).attack, 0);
      const defense = stats(s, target).defense;
      const hp = stats(s, target).health - target.damage;
      const damage = Math.max(0, power - defense);
      if (effectiveKeyword(target, "Indestructible"))
        return tip({
          title: `Damage ${nameOf(target)}`,
          text: `${power} attack − ${defense} defense = ${damage} damage. Indestructible prevents its destruction even at 0 remaining hit points.`,
          tone: "info",
        });
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
        title: `Threat is now ${s.threat}`,
        text:
          s.threat >= 40
            ? "Above 40 most enemies engage automatically. Lower threat with Spirit cards or Gandalf."
            : "The fellowship has readied and refresh threat has been applied. Use eligible actions before beginning the next round.",
        tone: s.threat >= 40 ? "warn" : "info",
      });
  }
  return null;
}
