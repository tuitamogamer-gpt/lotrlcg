import { khazadBookNoExhaust } from "./khazad-dum";
import definitions from "../data/passive-player-cards.json";
import type { Card, GameState, Unit } from "./types";
import { card } from "./cards";
import { allActiveLocations, allCharacters, ownerOf, seatView } from "./table";
import { marshPlayerNoQuestExhaust } from "./marsh-player-cards";

/** Explicit rules registrations. Unregistered reference text never grants support. */
import { elfNoQuestExhaust } from "./elf-player-cards";

export const PASSIVE_PLAYER_CARDS = definitions as Card[];
const SPHERES: Record<string, string> = {
  "02010": "leadership",
  "02034": "lore",
  "02081": "spirit",
  "02104": "tactics",
};
type AttachmentRule = {
  type?: "hero" | "ally" | "location";
  traits?: string[];
  sphere?: string;
  limit?: number;
  restricted?: number;
  keywords?: string[];
  grantsTraits?: string[];
  will?: number;
  attack?: number;
  defense?: number;
  health?: number;
  names?: string[];
  requiresKeyword?: string;
  unique?: boolean;
};
const rules: Record<string, AttachmentRule> = {
  "08088": {
    traits: ["Silvan"],
    requiresKeyword: "Ranged",
    restricted: 1,
    attack: 1,
  },
  "08093": { type: "ally", unique: true },
  "08118": { names: ["Galadriel"] },
  "08139": { type: "hero", requiresKeyword: "Sentinel" },
  "08031": { type: "hero", traits: ["Scout"] },
  "08034": { type: "hero", limit: 1 },
  "07008": {
    type: "hero",
    sphere: "tactics",
    traits: ["Rohan"],
    restricted: 1,
  },
  "07009": { type: "hero", sphere: "spirit" },
  "07010": { type: "hero" },
  "02010": { type: "hero" },
  "02031": { grantsTraits: ["Rohan"] },
  "02002": { type: "hero", attack: 1 },
  "02026": { type: "hero", defense: 1 },
  "02051": { type: "hero", will: 1 },
  "02056": { type: "location" },
  "02097": { type: "hero", keywords: ["Ranged"] },
  "02117": { type: "hero", keywords: ["Sentinel"] },
  "02120": { type: "hero", sphere: "tactics" },
  "02099": { type: "hero" },
  "02103": { traits: ["Hobbit"] },
  "02029": { type: "ally" },
  "02033": { sphere: "lore", restricted: 1 },
  "02034": { type: "hero" },
  "02081": { type: "hero" },
  "02104": { type: "hero" },
  "08113": { type: "hero", traits: ["Noble"] },
  "08140": { type: "hero", traits: ["Warrior"] },
  "03007": { traits: ["Dwarf"], restricted: 1, attack: 1 },
  "03013": { traits: ["Dwarf", "Hobbit"], limit: 1, health: 1 },
  "04055": { type: "hero" },
  "04057": { traits: ["Noldor", "Silvan"], limit: 1, keywords: ["Ranged"] },
  "04005": { type: "hero", limit: 1 },
  "04010": { type: "hero", traits: ["Hobbit"] },
  "04031": { traits: ["Noldor", "Silvan"], restricted: 1 },
  "04062": { type: "hero" },
  "04080": {
    traits: ["Dwarf", "Hobbit"],
    restricted: 1,
    health: 1,
    defense: 1,
  },
  "04082": { traits: ["Dwarf"] },
  "04085": { type: "hero", sphere: "lore", limit: 1 },
  "04107": { type: "hero", traits: ["Noldor", "Silvan"] },
  "04103": { type: "location" },
  "04109": { type: "hero", sphere: "lore" },
  "04110": { type: "hero", traits: ["Noldor", "Silvan"] },
  "04130": { type: "hero", sphere: "leadership" },
  "04133": { type: "hero" },
  "04137": { type: "hero", names: ["Elrond"] },
  "05009": { sphere: "tactics", limit: 1, restricted: 1 },
  "05013": { type: "hero", traits: ["Gondor", "Dúnedain"] },
  "06005": { type: "hero", limit: 1, restricted: 1 },
  "06007": { type: "hero" },
  "06035": { type: "hero", sphere: "tactics", limit: 1 },
  "06058": { type: "hero", traits: ["Gondor", "Outlands"] },
  "06059": { type: "hero", sphere: "tactics" },
  "06082": { type: "ally", traits: ["Gondor"], grantsTraits: ["Outlands"] },
  "06088": { traits: ["Ranger"], restricted: 1 },
  "06136": { type: "hero", traits: ["Gondor"] },
  "08029": {
    traits: ["Noldor", "Silvan"],
    restricted: 1,
    health: 2,
    keywords: ["Sentinel"],
  },
  "08120": { traits: ["Noldor", "Silvan"], limit: 1 },
  "10093": { grantsTraits: ["Noldor", "Silvan"] },
  "12003": { grantsTraits: ["Gondor"] },
  "12034": {
    traits: ["Warrior"],
    restricted: 2,
    attack: 1,
    defense: 1,
    health: 2,
  },
  "12091": { type: "hero" },
  "143009": { limit: 1, health: 2 },
  "146012": { type: "hero", traits: ["Hobbit"] },
  "16011": {
    type: "hero",
    traits: ["Silvan"],
    restricted: 1,
    will: 1,
    attack: 1,
  },
  "17061": { type: "hero", traits: ["Hobbit"], limit: 1 },
  "18007": { traits: ["Dale", "Warrior"], limit: 1, defense: 1 },
  "19003": { type: "ally", limit: 1, restricted: 1, health: 2 },
  "19028": {
    traits: ["Noble"],
    sphere: "leadership",
    limit: 1,
    restricted: 1,
    defense: 2,
    health: 2,
  },
  "19089": { traits: ["Warrior"], sphere: "tactics", limit: 1, restricted: 1 },
  "19092": { type: "ally" },
  "19120": {
    traits: ["Dale", "Dwarf"],
    restricted: 1,
    defense: 1,
    keywords: ["Sentinel"],
  },
  "22008": { type: "hero", sphere: "spirit", limit: 1, restricted: 1, will: 2 },
  "22032": { sphere: "tactics", limit: 1, restricted: 1 },
  "22060": { type: "hero", limit: 1 },
  "22083": { type: "hero", traits: ["Noble"], limit: 1, restricted: 1 },
  "22138": { type: "hero", traits: ["Noble"], limit: 1, restricted: 1 },
  "22143": {
    traits: ["Warrior"],
    restricted: 1,
    keywords: ["Ranged", "Sentinel"],
  },
};
export const passiveRule = (code: string) => rules[code];
export function effectiveTraits(u: Unit): string[] {
  return [
    ...new Set([
      ...(u.blanked ? "" : (card(u.code).traits ?? ""))
        .split(".")
        .map((t) => t.trim())
        .filter(Boolean),
      ...(u.dynamicTraits ?? []),
      ...u.attachments.flatMap((a) =>
        !a.blanked ? (rules[a.code]?.grantsTraits ?? []) : [],
      ),
      ...(u.attachments.some((a) => !a.blanked && a.code === "01026")
        ? ["Gondor"]
        : []),
    ]),
  ];
}
export const hasTrait = (u: Unit, trait: string) =>
  effectiveTraits(u).includes(trait);
export function effectiveKeyword(u: Unit, keyword: string): boolean {
  const printed = (card(u.code).text ?? "").replace(/<[^>]*>/g, "");
  const exact = new RegExp(`(?:^|[.\\n]\\s*)${keyword}(?:[.\\s]|$)`, "i");
  return (
    !!u.dynamicKeywords?.some(
      (k) => k.toLowerCase() === keyword.toLowerCase(),
    ) ||
    !!u.roundKeywords?.some((k) => k.toLowerCase() === keyword.toLowerCase()) ||
    (!u.blanked && exact.test(printed)) ||
    u.attachments.some(
      (a) =>
        !a.blanked &&
        rules[a.code]?.keywords?.some(
          (k) => k.toLowerCase() === keyword.toLowerCase(),
        ),
    )
  );
}
export function hasResourceIcon(u: Unit, sphere: string) {
  return (
    sphere === "neutral" ||
    card(u.code).sphere_code === sphere ||
    !!u.phaseResourceIcons?.includes(sphere) ||
    u.attachments.some(
      (a) =>
        !a.blanked &&
        (SPHERES[a.code] === sphere ||
          (a.code === "04137" && sphere === "spirit") ||
          (a.code === "04055" && sphere === "leadership") ||
          (a.code === "06007" &&
            card(u.code).name === "Aragorn" &&
            sphere === "lore") ||
          (a.code === "08121" && sphere === "lore") ||
          (a.code === "01027" &&
            card(u.code).name === "Aragorn" &&
            sphere === "spirit")),
    )
  );
}
export function expansionPlayTargets(s: GameState, c: Card): Unit[] | null {
  const rule = rules[c.code];
  if (!rule) return null;
  const candidates =
    rule.type === "location"
      ? [...s.staging, ...allActiveLocations(s)]
      : allCharacters(s);
  return candidates.filter((u) => {
    if (
      !u.blanked &&
      /cannot have restricted attachments/i.test(card(u.code).text ?? "") &&
      (rule.restricted ?? 0) > 0
    )
      return false;
    if (/immune to player card effects/i.test(card(u.code).text ?? ""))
      return false;
    if (rule.type && card(u.code).type_code !== rule.type) return false;
    if (rule.unique && !card(u.code).is_unique) return false;
    if (
      c.code === "08093" &&
      (u.code === "rc135" || /Objective-Ally/i.test(card(u.code).text ?? ""))
    )
      return false;
    if (rule.requiresKeyword && !effectiveKeyword(u, rule.requiresKeyword))
      return false;
    if (rule.names && !rule.names.includes(card(u.code).name)) return false;
    if (c.code === "04062" && ownerOf(s, u) !== (s.table?.active ?? 0))
      return false;
    const traitMatch = rule.traits?.some((t) => hasTrait(u, t));
    // Hero resource icons also identify the spheres to which the hero belongs
    // (original Core rules, p. 8); gained icons therefore satisfy restrictions.
    const sphereMatch = rule.sphere && hasResourceIcon(u, rule.sphere);
    // Ancestral Armor and Warrior Sword say sphere OR trait.
    if (c.code === "04057") {
      if (!traitMatch && card(u.code).name !== "Aragorn") return false;
    } else if (["07008", "19028", "19089"].includes(c.code)) {
      if (!traitMatch && !sphereMatch) return false;
    } else {
      if (rule.traits && !traitMatch) return false;
      if (rule.sphere && !sphereMatch) return false;
    }
    return (
      !rule.limit ||
      u.attachments.filter((a) => a.code === c.code).length < rule.limit
    );
  });
}
export function expansionPlayProblem(s: GameState, c: Card): string | null {
  if (
    c.code === "143009" &&
    ![...s.heroes, ...s.allies].some((u) => hasTrait(u, "Ent"))
  )
    return "Ent Draught requires an Ent character you control.";
  if (
    c.code === "146012" &&
    allCharacters(s)
      .flatMap((u) => u.attachments)
      .filter((a) => a.code === c.code).length >= 2
  )
    return "Only two copies of Friend of Friends may be in play.";
  if (rules[c.code] && !expansionPlayTargets(s, c)?.length)
    return "This attachment has no eligible character or its printed limit is reached.";
  return null;
}
export const restrictedSlots = (u: Unit) =>
  u.attachments.reduce(
    (total, a) =>
      total +
      (a.blanked
        ? 0
        : (rules[a.code]?.restricted ??
          (/\bRestricted\b/.test(card(a.code).text ?? "") ? 1 : 0))),
    0,
  );
export const restrictedLimit = (u: Unit) =>
  2 + u.attachments.filter((a) => !a.blanked && a.code === "22060").length;
export const restrictedAttachment = (code: string) =>
  (rules[code]?.restricted ??
    (/\bRestricted\b/.test(card(code).text ?? "") ? 1 : 0)) > 0;
export function questExhausts(s: GameState, u: Unit) {
  if (khazadBookNoExhaust(u)) return false;
  if (elfNoQuestExhaust(s, u)) return false;
  if (pathOfNeed(s, u)) return false;
  if (marshPlayerNoQuestExhaust(s, u)) return false;
  const p = seatView(s, ownerOf(s, u));
  if (u.code === "22028" && p.threat >= 40) return false;
  return !u.attachments.some(
    (a) =>
      !a.blanked &&
      (a.code === "04107" ||
        a.code === "19092" ||
        (a.code === "12091" && p.heroes.length <= 2)),
  );
}
export const pathOfNeed = (s: GameState, u: Unit) =>
  card(u.code).type_code === "hero" &&
  allActiveLocations(s).some((l) =>
    l.attachments.some((a) => !a.blanked && a.code === "04103"),
  );
export const resourcePhaseBonus = (u: Unit) =>
  u.attachments.filter((a) => !a.blanked && ["04062", "rc134"].includes(a.code))
    .length;
export const singlePoolCard = (c: Card) => c.code === "12139";
export function secrecyDiscount(s: GameState, c: Card) {
  if (s.threat > 20) return 0;
  return c.code === "04132"
    ? 4
    : ["04003", "04029", "04062", "04081", "04136"].includes(c.code)
      ? 3
      : ["04009", "04036", "08026", "08008", "08089"].includes(c.code)
        ? 2
        : 0;
}
export function expansionStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0, health: 0 };
  const owner = ownerOf(s, u),
    p = seatView(s, owner);
  if (u.code === "08141" && !u.blanked)
    result.attack += [...p.heroes, ...p.allies].filter(
      (u) => u.damage > 0 && hasTrait(u, "Ent"),
    ).length;
  if (u.code === "22028" && p.threat >= 40) result.attack += 2;
  if (u.code === "02055" && u.committed) result.will += 2;
  for (const a of u.attachments) {
    if (a.blanked) continue;
    const rule = rules[a.code];
    for (const key of ["will", "attack", "defense", "health"] as const)
      result[key] += rule?.[key] ?? 0;
    if (a.code === "06005") result.defense += hasTrait(u, "Gondor") ? 2 : 1;
    if (a.code === "06007")
      result.health += u.attachments.filter(
        (x) =>
          !x.blanked &&
          (card(x.code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Artifact"),
      ).length;
    if (a.code === "08120")
      result.defense += allActiveLocations(s).some((l) => hasTrait(l, "Forest"))
        ? 2
        : 1;
    if (a.code === "12091" && p.heroes.length + p.allies.length <= 5)
      result.will += 2;
    if (
      a.code === "146012" &&
      allCharacters(s).some(
        (h) =>
          h.id !== u.id &&
          card(h.code).type_code === "hero" &&
          h.attachments.some((x) => x.code === "146012"),
      )
    )
      for (const key of ["will", "attack", "defense", "health"] as const)
        result[key]++;
    if (a.code === "17061")
      result.will += u.attachments.filter(
        (x) =>
          !x.blanked &&
          (card(x.code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Song"),
      ).length;
    if (a.code === "18007" && effectiveKeyword(u, "Sentinel")) result.health++;
    if (a.code === "19089") result.attack += Math.min(3, p.engaged.length);
    if (a.code === "22032")
      result.attack += u.attachments.filter(
        (x) => !x.blanked && restrictedAttachment(x.code),
      ).length;
    if (a.code === "22083") result.attack += p.threat >= 40 ? 2 : 1;
    if (a.code === "22138") result.defense += p.threat >= 40 ? 2 : 1;
  }
  for (const host of allCharacters(s)) {
    if (
      host.code === "05002" &&
      !host.blanked &&
      host.resources > 0 &&
      card(u.code).type_code === "ally" &&
      hasTrait(u, "Gondor")
    )
      result.attack++;
    for (const a of host.attachments) {
      if (a.blanked) continue;
      if (a.code === "04130" && hasTrait(u, "Dwarf")) result.health++;
      if (
        a.code === "04055" &&
        card(host.code).name === "Aragorn" &&
        ownerOf(s, host) === owner
      )
        result.will++;
      if (a.code === "06136" && host.resources > 0 && hasTrait(u, "Gondor"))
        result.will++;
    }
  }
  return result;
}
