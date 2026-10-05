import { globalPlayerOrder } from "./table";
// The Drúadan Forest: printed-sphere restrictions and exact lasting responses.
import { card, cards, plain } from "./cards";
import type { Card, Effect, GameState, Phase, Unit } from "./types";
import { choose, fx, get, opts, prepend, requireRule, skip } from "./core";
import { damage, discardCharacter, readyCharacter } from "./board";
import {
  effectiveTraits,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { khazadCannotReady } from "./khazad-dum";
import { watcherWaterCannotReady } from "./watcher-water";
import {
  allCharacters,
  allEngaged,
  attachmentController,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { currentQuestUnit } from "./quest-state";
const spheres = ["leadership", "tactics", "spirit", "lore"];
const marker = (s: GameState, key: string) =>
  playerOrder(s).some((player) => seatView(s, player).used.includes(key));
const printedHeroes = (s: GameState, sphere: string) =>
  s.heroes.length > 0 &&
  s.heroes.every((h) => card(h.code).sphere_code === sphere);
const readyableAllies = (s: GameState) =>
  allCharacters(s).filter(
    (u) =>
      ["ally", "objective-ally"].includes(card(u.code).type_code) &&
      u.exhausted &&
      !khazadCannotReady(u) &&
      !watcherWaterCannotReady(u),
  );
const phaseGroup: Record<Phase, string> = {
  setup: "setup",
  resource: "resource",
  planning: "planning",
  quest: "quest",
  staging: "quest",
  travel: "travel",
  encounter: "encounter",
  defense: "combat",
  attack: "combat",
  refresh: "refresh",
};
const immune = (u: Unit) =>
  !u.blanked &&
  /immune to (?:player )?card effects/i.test(plain(card(u.code).text));
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy" && !immune(u),
  );
const keyword = (text: string, name: string) =>
  new RegExp(`(?:^|[.\\n]\\s*)${name}(?:[.\\s]|$)`, "i").test(plain(text));
/** Return the negative adjustment, not the total starting threat. Card objects support reference-only deck previews. */
export function druadanPlayerStartingThreat(heroes: (string | Card)[]): number {
  const definitions = heroes
    .map((h) => (typeof h === "string" ? cards[h] : h))
    .filter((c): c is Card => !!c);
  return definitions.some((c) => c.code === "06032")
    ? -definitions.filter((c) => c.sphere_code === "lore").length
    : 0;
}
export function druadanPlayerPhaseStarted(
  s: GameState,
  previousPhase: Phase,
  nextPhase: Phase,
) {
  if (
    phaseGroup[previousPhase] === phaseGroup[nextPhase] ||
    nextPhase === "setup"
  )
    return;
  for (const source of allCharacters(s).filter(
    (u) => u.code === "06033" && !u.blanked,
  )) {
    const controlled = seatView(s, ownerOf(s, source)).allies.filter((u) =>
      hasTrait(u, "Outlands"),
    );
    if (
      new Set(
        controlled
          .map((u) => card(u.code).sphere_code)
          .filter((sphere) => spheres.includes(sphere)),
      ).size === 4
    )
      readyCharacter(s, source);
  }
}
export function druadanPlayerStats(s: GameState, u: Unit) {
  const instances = globalPlayerOrder(s).reduce(
    (n, p) =>
      n +
      seatView(s, p).used.filter((k) => k === `round:harbor-master:${u.id}`)
        .length,
    0,
  );
  return { will: 0, attack: 0, defense: instances };
}
export function druadanPlayerQuestStat(
  s: GameState,
): "will" | "attack" | "defense" {
  const quest = currentQuestUnit(s);
  if (!quest) return "will";
  const c = card(quest.code),
    text = c.back_text ?? c.text ?? "";
  if (keyword(text, "Siege")) return "defense";
  return keyword(text, "Battle") || marker(s, `phase:trained-war:${quest.id}`)
    ? "attack"
    : "will";
}
export const druadanPlayerDefenseStat = (
  s: GameState,
  u: Unit,
): "will" | null =>
  globalPlayerOrder(s).some((p) =>
    seatView(s, p).used.includes(`phase:against-shadow:${u.id}`),
  )
    ? "will"
    : null;
export const druadanPlayerNoEngagementChecks = (s: GameState) =>
  marker(s, "phase:advance-warning");
export function druadanPlayerUndefendedTargets(s: GameState): Unit[] {
  if (
    !s.heroes.length ||
    !spheres.some((sphere) => s.heroes.every((h) => hasResourceIcon(h, sphere)))
  )
    return [];
  return s.allies.filter((u) => u.code === "06041" && !u.blanked);
}
export function druadanPlayerPlayProblem(
  s: GameState,
  code: string,
): string | null {
  const required = {
    "06034": "leadership",
    "06036": "tactics",
    "06038": "spirit",
    "06040": "lore",
  }[code as "06034" | "06036" | "06038" | "06040"];
  if (required && !printedHeroes(s, required))
    return `${card(code).name} requires every hero you control to have a printed ${required} icon.`;
  if (code === "06034" && !readyableAllies(s).length)
    return "Strength of Arms needs an exhausted ally able to ready.";
  if (
    code === "06036" &&
    (!currentQuestUnit(s) || druadanPlayerQuestStat(s) !== "will")
  )
    return "Trained for War needs the current quest to have neither Siege nor Battle.";
  if (
    code === "06038" &&
    !allCharacters(s).some((u) => hasResourceIcon(u, "spirit"))
  )
    return "Against the Shadow needs a Spirit character in play.";
  return null;
}
export function druadanPlayerEventEffect(s: GameState, code: string): boolean {
  if (!["06034", "06036", "06038", "06040"].includes(code)) return false;
  requireRule(
    !druadanPlayerPlayProblem(s, code),
    druadanPlayerPlayProblem(s, code) ?? "",
  );
  if (code === "06034")
    for (const ally of readyableAllies(s)) readyCharacter(s, ally);
  if (code === "06036")
    s.used.push(`phase:trained-war:${currentQuestUnit(s)!.id}`);
  if (code === "06038")
    for (const u of allCharacters(s).filter((u) =>
      hasResourceIcon(u, "spirit"),
    ))
      s.used.push(`phase:against-shadow:${u.id}`);
  if (code === "06040") s.used.push("phase:advance-warning");
  return true;
}
export function druadanPlayerLeavesPlay(s: GameState, u: Unit) {
  if (
    !["hero", "ally", "objective-ally", "objective-hero"].includes(
      card(u.code).type_code,
    )
  )
    return;
  prepend(
    s,
    ...allCharacters(s)
      .filter((source) => source.code === "06037" && !source.blanked)
      .map((source) =>
        fx("druadanRefugeeForced", {
          source: source.id,
          player: ownerOf(s, source),
        }),
      ),
  );
}
export function druadanPlayerResourcesGained(
  s: GameState,
  hero: Unit,
  amount: number,
  cardEffect: boolean,
) {
  if (amount <= 0 || !cardEffect) return;
  prepend(
    s,
    ...seatView(s, ownerOf(s, hero))
      .allies.filter((u) => u.code === "06039" && !u.blanked)
      .map((u) =>
        fx("druadanHarborResponse", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function druadanPlayerAttackKilled(
  s: GameState,
  enemy: Unit,
  ids: string[],
  lastKnownEnemyTraits: string[],
) {
  const traits = [...lastKnownEnemyTraits],
    targets = enemies(s).filter(
      (u) =>
        u.id !== enemy.id && effectiveTraits(u).some((t) => traits.includes(t)),
    );
  if (!targets.length) return;
  prepend(
    s,
    ...ids.flatMap((id) => {
      const hero = get(s, id);
      return hero
        ? hero.attachments
            .filter((a) => a.code === "06035" && !a.blanked && !a.facedown)
            .map((a) =>
              fx("druadanProwessResponse", {
                source: hero.id,
                code: a.id,
                ids: traits,
                target: enemy.id,
                player: attachmentController(s, hero, a) ?? ownerOf(s, hero),
              }),
            )
        : [];
    }),
  );
}
function prowessTargets(s: GameState, e: Effect) {
  return enemies(s).filter(
    (u) =>
      u.id !== e.target &&
      effectiveTraits(u).some((t) => (e.ids ?? []).includes(t)),
  );
}
export function handleDruadanPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "druadanRefugeeForced": {
      const u = get(s, e.source);
      if (u?.code === "06037" && !u.blanked) discardCharacter(s, u);
      return true;
    }
    case "druadanHarborResponse": {
      const u = get(s, e.source);
      if (u?.code === "06039" && !u.blanked)
        choose(s, "Harbor Master · Card-effect resource gain", [
          {
            id: "defense",
            label: "Gain +1 defense until end of round",
            code: u.code,
            effects: [fx("druadanHarborDefense", { source: u.id })],
          },
          skip,
        ]);
      return true;
    }
    case "druadanHarborDefense": {
      const u = get(s, e.source);
      requireRule(
        u?.code === "06039" && !u.blanked,
        "Harbor Master must remain in play with its printed ability.",
      );
      s.used.push(`round:harbor-master:${u.id}`);
      return true;
    }
    case "druadanProwessResponse": {
      const hero = get(s, e.source),
        a = hero?.attachments.find((a) => a.id === e.code);
      if (
        a?.code === "06035" &&
        !a.blanked &&
        !a.facedown &&
        prowessTargets(s, e).length
      )
        choose(s, "Mighty Prowess · Attack destroyed enemy", [
          ...opts(prowessTargets(s, e), (u) => [
            { ...e, kind: "druadanProwessDamage", text: u.id },
          ]),
          skip,
        ]);
      return true;
    }
    case "druadanProwessDamage": {
      const hero = get(s, e.source),
        a = hero?.attachments.find((a) => a.id === e.code),
        target = prowessTargets(s, e).find((u) => u.id === e.text);
      requireRule(
        a?.code === "06035" && !a.blanked && !a.facedown && target,
        "The attached hero and another enemy sharing a destroyed enemy trait must remain available.",
      );
      damage(s, target.id, 1);
      return true;
    }
    default:
      return false;
  }
}
