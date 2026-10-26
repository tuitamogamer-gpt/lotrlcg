import definitions from "../data/ered-mithrin-player-cards.json";
import type { Attachment, Card, GameState, Unit } from "./types";
import { card } from "./cards";
import {
  allActiveLocations,
  allCharacters,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { playerCardImmune } from "./card-immunity";
export const ERED_MITHRIN_PLAYER_CARDS = definitions as Card[];
export const ERED_MITHRIN_PLAYER_CODES = ERED_MITHRIN_PLAYER_CARDS.map(
  (c) => c.code,
);
export const ERED_MITHRIN_PLAYER = {
  grimbeorn: "19001",
  guardian: "19002",
  helm: "19003",
  skin: "19004",
  rage: "19005",
  clearing: "19006",
  hidden: "19007",
  fisherman: "19008",
  cloak: "19009",
  arkenstone: "19010",
  haldan: "19026",
  wiglaf: "19027",
  armor: "19028",
  glamdring: "19029",
  path: "19030",
  meneldor: "19031",
  flight: "19032",
  stallion: "19033",
  south: "19034",
  eagle: "19035",
  thranduil: "19056",
  elvenking: "19057",
  orcrist: "19058",
  traveler: "19059",
  boots: "19060",
  bear: "19061",
  outmatched: "19062",
  galion: "19063",
  quicker: "19064",
  thalion: "19065",
  dain: "19084",
  soldier: "19085",
  walls: "19086",
  hunter: "19087",
  lands: "19088",
  sword: "19089",
  swift: "19090",
  girion: "19091",
  determination: "19092",
  ring: "19093",
} as const;
export const ERED_GUARDED = [
  "19010",
  "19029",
  "19058",
  "19093",
  "19117",
  "19152",
  "22006",
];
export const eredPlayerAttachment = (a: Attachment) =>
  !a.facedown &&
  !a.namelessCard &&
  (card(a.code).type_code === "attachment" || a.code === "19033") &&
  card(a.code).sphere_code !== "encounter";
export const eredSideQuests = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) =>
    ["player-side-quest", "encounter-side-quest"].includes(card(c).type_code),
  );
export const eredMarks = (s: GameState) =>
  playerOrder(s).flatMap((p) => seatView(s, p).used);
export const eredMithrinPlayerAttachmentTraits = (a: Attachment) =>
  a.code === ERED_MITHRIN_PLAYER.stallion && !a.blanked && !a.facedown
    ? ["Mount"]
    : [];
export function eredMithrinPlayerStats(s: GameState, u: Unit) {
  const r = { will: 0, attack: 0, defense: 0, health: 0 },
    P = ERED_MITHRIN_PLAYER;
  if (playerCardImmune(u)) return r;
  const a = u.attachments.filter((a) => !a.blanked && !a.facedown);
  if (!u.blanked && u.code === P.guardian) {
    const n = Math.min(
      3,
      new Set(a.filter(eredPlayerAttachment).map((a) => card(a.code).name))
        .size,
    );
    r.will += n;
    r.attack += n;
    r.defense += n;
    r.health += n;
  }
  if (!u.blanked && u.code === P.traveler) {
    const n = allActiveLocations(s)[0]?.attachments.length ?? 0;
    r.will += n;
    r.attack += n;
    r.defense += n;
  }
  for (const x of a) {
    if (x.code === P.stallion) {
      r.will++;
      r.attack++;
      r.defense++;
      r.health++;
    }
    if ([P.glamdring, P.orcrist].includes(x.code as typeof P.glamdring))
      r.attack += 2;
  }
  if (card(u.code).is_unique)
    r.will += allCharacters(s)
      .filter((h) => ownerOf(s, h) === ownerOf(s, u))
      .flatMap((h) => h.attachments)
      .filter(
        (a) => a.code === P.arkenstone && !a.blanked && !a.facedown,
      ).length;
  const marks = eredMarks(s);
  r.defense +=
    marks.filter((k) => k.startsWith(`attack:ered-grim:${u.id}:`)).length * -2;
  r.defense += marks.filter((k) =>
    k.startsWith(`attack:ered-dain:${u.id}:`),
  ).length;
  r.attack +=
    marks.filter((k) => k.startsWith(`phase:ered-rage:${u.id}:`)).length * -2;
  r.defense +=
    marks.filter((k) => k.startsWith(`phase:ered-rage:${u.id}:`)).length * -2;
  r.attack +=
    marks.filter((k) => k.startsWith(`attack:ered-swift:${u.id}:`)).length * 2;
  if (
    !u.blanked &&
    u.code === P.galion &&
    marks.includes(`round:ered-galion:${u.id}`)
  )
    r.will++;
  return r;
}
export function eredMithrinPlayerCostReduction(
  s: GameState,
  c: Card,
  target?: Unit,
) {
  const P = ERED_MITHRIN_PLAYER;
  let n = 0;
  if (c.code === P.hunter)
    n += allActiveLocations(s)[0]?.attachments.length ?? 0;
  if (
    c.type_code === "attachment" &&
    target?.code === P.girion &&
    !target.blanked &&
    (c.traits ?? "").includes("Item.")
  )
    n++;
  if (c.type_code === "ally" && s.used.includes("phase:ered-walls")) n++;
  return n;
}
export const eredMithrinPlayerQuestExhausts = (s: GameState, u: Unit) =>
  !(
    u.code === ERED_MITHRIN_PLAYER.haldan &&
    !u.blanked &&
    allActiveLocations(s).some((l) => l.attachments.length)
  );
export const eredMithrinPlayerLocationQuest = (
  s: GameState,
  u: Unit,
  printed: number,
) =>
  allActiveLocations(s).some((l) => l.id === u.id) &&
  u.attachments.some(
    (a) => a.code === ERED_MITHRIN_PLAYER.path && !a.blanked && !a.facedown,
  )
    ? 1
    : printed;
export const eredMithrinPlayerLocationThreat = (s: GameState, u: Unit) =>
  card(u.code).type_code === "location" &&
  u.attachments.some(eredPlayerAttachment)
    ? -2 * eredMarks(s).filter((k) => k === "phase:ered-lands").length
    : 0;
export const eredMithrinPlayerPreventEngagement = (
  s: GameState,
  u: Unit,
  player: number,
) => seatView(s, player).used.includes(`phase:ered-cloak:${u.id}`);
export const eredMithrinPlayerCannotFight = (u: Unit) =>
  u.code === ERED_MITHRIN_PLAYER.galion && !u.blanked;
export const eredMithrinPlayerCannotQuest = (s: GameState, u: Unit) =>
  eredMarks(s).includes(`round:ered-walls:${u.id}`);
export const eredMithrinPlayerNoResourceMatch = (s: GameState, c: Card) =>
  s.used.includes("ered-thranduil-paying") &&
  c.type_code === "ally" &&
  (c.traits ?? "").includes("Silvan.");
export function eredMithrinPlayerResourceIcons(s: GameState, u: Unit) {
  return u.code === ERED_MITHRIN_PLAYER.thalion &&
    !u.blanked &&
    eredSideQuests(s).length >= 3
    ? [
        ...new Set(
          eredSideQuests(s)
            .map((c) => card(c).sphere_code)
            .filter((c) =>
              ["leadership", "lore", "spirit", "tactics"].includes(c),
            ),
        ),
      ]
    : [];
}
export function eredMithrinPlayerRefresh(s: GameState) {
  const promote = eredSideQuests(s).length >= 3;
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const u of [...s.heroes, ...s.allies].filter(
        (u) => u.code === ERED_MITHRIN_PLAYER.thalion,
      )) {
        const hero = promote && !u.blanked;
        (u as Unit & { eredThalionHero?: boolean }).eredThalionHero = hero;
        if (hero && !s.heroes.includes(u)) {
          s.allies = s.allies.filter((a) => a !== u);
          s.heroes.push(u);
        }
        if (!hero && !s.allies.includes(u)) {
          s.heroes = s.heroes.filter((a) => a !== u);
          s.allies.push(u);
        }
      }
    });
}
