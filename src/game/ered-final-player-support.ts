import definitions from "../data/ered-final-player-cards.json";
import type { Attachment, Card, GameState, Unit } from "./types";
import { card } from "./cards";
import { engagementCost } from "./core";
import { isHero } from "./card-types";
import { hasTrait } from "./expansion-passives";
import { engagedEnemies } from "./considered-engagement";
import { playerCardImmune } from "./card-immunity";
import { ownerOf, seatIndices, seatView } from "./table";
import { foundationsAreaPlayers } from "./foundations-stone-support";
import { gramAreaPlayers } from "./mount-gram-support";
import { stormcallerEffectiveThreat } from "./threat-read";

/** All twenty source records remain distinct; Armor of Erebor reuses its definition. */
export const ERED_FINAL_PLAYER_CARDS = definitions as Card[];
export const ERED_FINAL_PLAYER_CODES = definitions.map((c) => c.code);
export const ERED_FINAL_PLAYER = {
  bilbo: "19112",
  defender: "19113",
  guide: "19114",
  gaffer: "19115",
  song: "19116",
  sting: "19117",
  shield: "19118",
  toymaker: "19119",
  armor: "19120",
  shirefolk: "19121",
  radagast: "19145",
  raven: "19146",
  kingsReturn: "19147",
  hound: "19148",
  hunt: "19149",
  shirriff: "19150",
  debt: "19151",
  shirt: "19152",
  reforged: "19153",
  staff: "19154",
} as const;
export const ERED_FINAL_PREFIX = "ered-final:";
export const eredFinalMarks = (s: GameState) =>
  seatIndices(s).flatMap((player) => seatView(s, player).used);
export const eredFinalAreaPlayers = (s: GameState) =>
  foundationsAreaPlayers(s) ?? gramAreaPlayers(s) ?? seatIndices(s);
export const eredFinalAttachmentLive = (a: Attachment) =>
  !a.blanked && !a.facedown;

export function eredFinalPlayerStats(s: GameState, u: Unit) {
  const r = { will: 0, attack: 0, defense: 0, health: 0 },
    P = ERED_FINAL_PLAYER;
  if (playerCardImmune(u)) return r;
  for (const a of u.attachments.filter(eredFinalAttachmentLive)) {
    if (a.code === P.sting && isHero(u)) {
      r.will++;
      r.attack++;
      r.defense++;
    }
  }
  if (u.code === P.shirriff && !u.blanked) {
    const player = ownerOf(s, u);
    if (
      engagedEnemies(s, player).some(
        (enemy) =>
          engagementCost(s, enemy) > stormcallerEffectiveThreat(s, player),
      )
    ) {
      r.will++;
      r.attack++;
      r.defense++;
    }
  }
  return r;
}
export const eredFinalPlayerQuestExhausts = (s: GameState, u: Unit) =>
  !eredFinalMarks(s).includes(`round:${ERED_FINAL_PREFIX}radagast:${u.id}`);
export const eredFinalPlayerNoDefenseExhaust = (s: GameState, u: Unit) =>
  eredFinalMarks(s).includes(`round:${ERED_FINAL_PREFIX}defender:${u.id}`);
export const eredFinalPlayerCannotFight = (u: Unit) =>
  u.code === ERED_FINAL_PLAYER.raven && !u.blanked;
export const eredFinalPlayerCanHaveAttachments = (u: Unit) =>
  !!u.blanked ||
  ![ERED_FINAL_PLAYER.raven, ERED_FINAL_PLAYER.hound].includes(
    u.code as typeof ERED_FINAL_PLAYER.raven,
  );

/** Designer-confirmed reprint errata grants only the printed three extra icons. */
export const eredFinalPlayerResourceMatch = (
  _s: GameState,
  hero: Unit,
  c: Card,
) =>
  hero.code === ERED_FINAL_PLAYER.radagast &&
  !hero.blanked &&
  c.type_code === "ally" &&
  /\bCreature\./.test(c.traits ?? "") &&
  ["leadership", "spirit", "tactics"].includes(c.sphere_code);
export function eredFinalPlayerCostReduction(s: GameState, c: Card) {
  return (
    (c.type_code === "attachment"
      ? eredFinalAreaPlayers(s)
          .flatMap((player) => seatView(s, player).used)
          .filter((k) => k.startsWith(`phase:${ERED_FINAL_PREFIX}toymaker:`))
          .length * 2
      : 0) +
    (c.type_code === "ally" && /\bCreature\./.test(c.traits ?? "")
      ? s.used.filter((k) => k.startsWith(`phase:${ERED_FINAL_PREFIX}staff:`))
          .length * 2
      : 0)
  );
}
export const eredFinalPlayerPreventAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) =>
  seatView(s, player).used.includes(
    `round:${ERED_FINAL_PREFIX}gaffer:${enemy.id}`,
  );

export const eredFinalGuardedCard = (code: string) =>
  card(code).type_code === "attachment" &&
  /\bGuarded\s*\(/i.test(card(code).text ?? "");
export const eredFinalCreatureAlly = (u: Unit) =>
  ["ally", "objective-ally"].includes(card(u.code).type_code) &&
  hasTrait(u, "Creature");
