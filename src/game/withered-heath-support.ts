import encounters from "../data/withered-heath-encounter-cards.json";
import quests from "../data/withered-heath-quest-cards.json";
import recipes from "../data/withered-heath-recipes.json";
import shared from "../data/wilds-rhovanion-encounter-cards.json";
import type { Card, GameState } from "./types";
export type { WitheredHeathState } from "./withered-heath-types";
export const WITHERED_HEATH_ENCOUNTERS = encounters as Card[];
export const WITHERED_HEATH_QUESTS = quests as Card[];
export const WITHERED_HEATH_RECIPES = recipes;
const code = (name: string) =>
  [...encounters, ...quests, ...shared].find((c) => c.name === name)!.code;
export const WITHERED_HEATH = {
  search: code("Searching for Dragon Sign"),
  attack: code("The Cold-Drake Attacks!"),
  hunt: code("Hunting the Beast"),
  cornered: code("A Cornered Dragon"),
  drake: code("Cold-Drake"),
  sign: code("Dragon Sign"),
  troll: code("Snow-troll"),
  hatchling: code("Dragon Hatchling"),
  pass: code("Mountain Pass"),
  door: code("Dwarven Door"),
  entrance: code("Cave Entrance"),
  creatureDen: code("Creature Den"),
  falls: code("High Falls"),
  snow: code("Heavy Snow"),
  cold: code("Deadly Cold"),
  supplies: code("Ruined Supplies"),
  lost: code("Lost in the Wild"),
  weighed: code("Weighed Down"),
  werewolf: code("Werewolf"),
  spider: code("Giant Spider"),
  bats: code("Black Bats"),
  treasury: code("Ancient Treasury"),
  armory: code("Lost Armory"),
  frightful: code("Frightful Den"),
  grotto: code("Lightless Grotto"),
  cavern: code("Crumbling Cavern"),
  lake: code("Underground Lake"),
};
export const WITHERED_HEATH_MAIN_QUESTS = [
  WITHERED_HEATH.search,
  WITHERED_HEATH.attack,
  WITHERED_HEATH.hunt,
  WITHERED_HEATH.cornered,
];
const seats = (s: GameState) =>
  (s.table?.seats ?? []).filter((_, i) => i !== s.table!.active);
export const witheredHeathHosts = (s: GameState) => [
  ...s.heroes,
  ...s.allies,
  ...s.engaged,
  ...seats(s).flatMap((p) => [...p.heroes, ...p.allies, ...p.engaged]),
  ...s.staging,
  ...(s.activeLocation ? [s.activeLocation] : []),
  ...(s.extraActiveLocations ?? []),
];
export const witheredHeathSigns = (s: GameState) =>
  (s.victoryCards ?? []).filter((c) => c === WITHERED_HEATH.sign).length;
export const witheredHeathDragon = (s: GameState) =>
  [...witheredHeathHosts(s), ...(s.witheredHeath?.setAside ?? [])].find(
    (u) => u.code === WITHERED_HEATH.drake,
  );
export function witheredHeathStageInfo(s: GameState) {
  const q = WITHERED_HEATH_QUESTS.find(
    (c) => c.code === s.witheredHeath?.currentQuest,
  );
  return q
    ? {
        name: q.back_name ?? q.name,
        cardCode: q.code,
        quest: q.back_quest ?? 0,
        story: q.back_text ?? "",
        questImage: q.back_imagesrc ?? q.imagesrc,
      }
    : undefined;
}
export function validateWitheredHeath(
  s: GameState,
  validUnit: (u: unknown) => boolean,
) {
  const q = s.witheredHeath;
  if (q === undefined) return s.scenarioId !== "the-withered-heath";
  if (
    !q ||
    s.scenarioId !== "the-withered-heath" ||
    ![
      q.questDeck,
      q.completedQuests,
      q.setAside,
      q.cavesDeck,
      q.resolving,
      q.removed,
      q.guards,
      q.peeked,
      q.noReady,
      q.noDamage,
      q.usedResponses,
    ].every(Array.isArray)
  )
    return false;
  const chain = [...q.completedQuests, q.currentQuest, ...q.questDeck];
  const stored = [
    ...q.setAside,
    ...q.cavesDeck,
    ...q.resolving,
    ...q.removed,
    ...q.guards.map((g) => g?.sign),
  ];
  if (!stored.every(validUnit)) return false;
  const hosts = witheredHeathHosts(s),
    hands = [...s.hand, ...seats(s).flatMap((p) => p.hand)];
  const ids = [...hosts, ...hands, ...stored]
    .map((u) => u.id)
    .concat(hosts.flatMap((u) => u.attachments.map((a) => a.id)));
  const legalCaves = WITHERED_HEATH_RECIPES[0].cards
    .filter((c) => c.section === "sharedEncounterDeck2")
    .map((c) => c.code)
    .concat(WITHERED_HEATH.sign);
  const signs =
    [...hosts, ...stored].filter((u) => u.code === WITHERED_HEATH.sign).length +
    witheredHeathSigns(s);
  const dragons =
    [...hosts, ...stored].filter((u) => u.code === WITHERED_HEATH.drake)
      .length +
    (s.victoryCards ?? []).filter((c) => c === WITHERED_HEATH.drake).length;
  const round = (n: number) => Number.isInteger(n) && n >= 0 && n <= s.round;
  return (
    typeof q.initialized === "boolean" &&
    typeof q.advancing === "boolean" &&
    Number.isInteger(s.stage) &&
    s.stage >= 1 &&
    s.stage <= 4 &&
    q.currentQuest === WITHERED_HEATH_MAIN_QUESTS[s.stage - 1] &&
    chain.length === 4 &&
    chain.every((c, i) => c === WITHERED_HEATH_MAIN_QUESTS[i]) &&
    new Set(ids).size === ids.length &&
    signs === 4 &&
    dragons === 1 &&
    q.setAside.every((u) =>
      [WITHERED_HEATH.sign, WITHERED_HEATH.drake].includes(u.code),
    ) &&
    q.cavesDeck.every((u) => legalCaves.includes(u.code)) &&
    q.removed.every((u) => u.code === WITHERED_HEATH.sign) &&
    q.resolving.every((u) =>
      [WITHERED_HEATH.weighed, WITHERED_HEATH.lost].includes(u.code),
    ) &&
    q.peeked.length <= 3 &&
    q.peeked.every((c) => typeof c === "string") &&
    q.guards.every(
      (g) =>
        g &&
        g.sign.code === WITHERED_HEATH.sign &&
        typeof g.guardId === "string" &&
        hosts.some((u) => u.id === g.guardId),
    ) &&
    new Set(q.guards.map((g) => g.sign.id)).size === q.guards.length &&
    round(q.damageRound) &&
    Number.isInteger(q.damageTaken) &&
    q.damageTaken >= 0 &&
    q.damageTaken <= 6 &&
    (q.playerReadyBlockedRound === undefined ||
      round(q.playerReadyBlockedRound)) &&
    q.noReady.every((m) => m && typeof m.id === "string" && round(m.round)) &&
    q.noDamage.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        round(m.round) &&
        [
          "setup",
          "resource",
          "planning",
          "quest",
          "staging",
          "travel",
          "encounter",
          "defense",
          "attack",
          "refresh",
        ].includes(m.phase),
    ) &&
    q.usedResponses.every((c) =>
      [WITHERED_HEATH.armory, WITHERED_HEATH.treasury].includes(c),
    ) &&
    new Set(q.usedResponses).size === q.usedResponses.length
  );
}
