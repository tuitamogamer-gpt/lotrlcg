// The Angmar Awakened campaign's player-card boons in play: the six boons
// Loot the Dungeons offers in Escape from Mount Gram (Berelind, Chieftain's
// Brooch, Coruhaer, Laermuin, Mail of Eärnur and Silverthorn) and the three
// Clue boons of The Treachery of Rhudaur (Daechanar's Brand, Heirloom of
// Iârchon and Orders from Angmar).
import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import { fx, get, log, prepend } from "./core";
import { effectiveTraits } from "./expansion-passives";
import { isHero } from "./card-types";
import {
  allCharacters,
  forOwner,
  ownerOf,
  seatIndices,
  seatView,
} from "./table";
import { choosePlayerResponse } from "./player-ability-triggers";
import { rhosgobelHealingAllowed } from "./rhosgobel";
import { addVictoryCard, check, damage, destroy } from "./board";
import { shuffle, stats } from "./core";
import { addQuestProgress } from "./side-quests";
import { mainQuestUnit } from "./quest-state";

export const LOOT = {
  berelind: "10176",
  brooch: "10177",
  coruhaer: "10178",
  laermuin: "10179",
  mail: "10180",
  silverthorn: "10181",
} as const;
export const CLUE = {
  brand: "10185",
  heirloom: "10186",
  orders: "10187",
} as const;
const live = (s: GameState, u?: Unit) =>
  !!u && !u.blanked && s.campaign?.kind === "angmar";
const attached = (u: Unit, code: string) =>
  u.attachments.filter((a) => a.code === code && !a.blanked);
const spent = (s: GameState, id: string) =>
  (s.angmarCards?.spent ?? []).includes(id);

/** Chieftain's Brooch: "Each ally that shares a Trait with attached hero gets +1 [willpower]." */
export function angmarBroochWill(s: GameState, u: Unit) {
  if (s.campaign?.kind !== "angmar" || card(u.code).type_code !== "ally")
    return 0;
  const traits = effectiveTraits(u);
  return allCharacters(s)
    .filter((h) => isHero(h) && h.id !== u.id)
    .filter((h) => attached(h, LOOT.brooch).length)
    .filter((h) => effectiveTraits(h).some((t) => traits.includes(t)))
    .reduce((n, h) => n + attached(h, LOOT.brooch).length, 0);
}
/** The Traits of the enemies in the victory display. */
const victoryTraits = (s: GameState) =>
  new Set(
    (s.victoryCards ?? [])
      .filter((code) => card(code).type_code === "enemy")
      .flatMap((code) =>
        (card(code).traits ?? "")
          .split(".")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
  );
/**
 * Silverthorn: "While attacking or defending against an enemy, attached hero
 * gets +1 [attack] and +1 [defense] if that enemy shares a Trait with an
 * enemy in the victory display."
 */
export function angmarSilverthornBonus(s: GameState, u: Unit, enemy?: Unit) {
  if (s.campaign?.kind !== "angmar" || !enemy) return 0;
  const n = attached(u, LOOT.silverthorn).length;
  if (!n) return 0;
  const traits = victoryTraits(s);
  return effectiveTraits(enemy).some((t) => traits.has(t)) ? n : 0;
}

const undead = (enemy?: Unit) =>
  !!enemy && effectiveTraits(enemy).includes("Undead");
/**
 * Daechanar's Brand: "+1 [attack] (+2 [attack] instead when attacking an
 * Undead enemy)"; Orders from Angmar: "+1 [defense] (+2 [defense] instead
 * while defending against an Undead enemy)". The +1 is a passive bonus; this
 * is the extra point against Undead.
 */
export function angmarClueUndeadBonus(
  s: GameState,
  u: Unit,
  enemy: Unit | undefined,
  stat: "attack" | "defense",
) {
  if (s.campaign?.kind !== "angmar" || !undead(enemy)) return 0;
  return attached(u, stat === "attack" ? CLUE.brand : CLUE.orders).length;
}
/** The Clue boons' Responses: "After you play …". */
export function angmarCampaignAttachmentPlayed(
  s: GameState,
  host: Unit,
  attachment: { id: string; code: string; owner?: number; controller?: number },
) {
  if (s.campaign?.kind !== "angmar") return;
  const p = attachment.controller ?? attachment.owner ?? ownerOf(s, host);
  if (attachment.code === CLUE.brand)
    prepend(s, fx("angmarClueBrand", { source: attachment.id, player: p }));
  else if (attachment.code === CLUE.heirloom && host.damage > 0)
    prepend(
      s,
      fx("angmarClueHeirloom", {
        source: attachment.id,
        target: host.id,
        player: p,
      }),
    );
  else if (attachment.code === CLUE.orders && ordersTargets(s).length)
    prepend(s, fx("angmarClueOrders", { source: attachment.id, player: p }));
}
/** Orders from Angmar: the non-unique Undead enemies with 2 or less remaining hit points. */
const ordersTargets = (s: GameState) =>
  [
    ...s.staging,
    ...seatIndices(s).flatMap((p) => seatView(s, p).engaged),
  ].filter(
    (u) =>
      ["enemy", "ship-enemy"].includes(card(u.code).type_code) &&
      !card(u.code).is_unique &&
      undead(u) &&
      stats(s, u).health - u.damage <= 2,
  );
/** Berelind's and Silverthorn's Responses, after an attack destroys an enemy. */
export function angmarLootAttackKilled(
  s: GameState,
  enemy: Unit,
  attackerIds: string[],
) {
  if (s.campaign?.kind !== "angmar") return;
  for (const id of attackerIds) {
    const u = get(s, id);
    if (!u) continue;
    if (u.code === LOOT.berelind && live(s, u))
      prepend(
        s,
        fx("angmarLootBerelind", { source: u.id, player: ownerOf(s, u) }),
      );
    for (const a of attached(u, LOOT.silverthorn))
      // A destroyed enemy in the encounter discard pile (not one that went
      // to the victory display by its own Victory points).
      if (!spent(s, a.id) && s.encounterDiscard.lastIndexOf(enemy.code) >= 0)
        prepend(
          s,
          fx("angmarLootSilverthorn", {
            source: a.id,
            target: u.id,
            code: enemy.code,
            player: ownerOf(s, u),
          }),
        );
  }
}
/** Coruhaer's Response, after it defends an attack. */
export function angmarLootEnemyAttackResolved(
  s: GameState,
  enemy: Unit,
  defenderIds: string[],
) {
  if (s.campaign?.kind !== "angmar") return;
  for (const id of defenderIds) {
    const u = get(s, id);
    if (u?.code !== LOOT.coruhaer || !live(s, u)) continue;
    const p = ownerOf(s, u);
    if (seatView(s, p).heroes.some((h) => h.resources > 0))
      prepend(
        s,
        fx("angmarLootCoruhaer", {
          source: u.id,
          target: enemy.id,
          player: p,
        }),
      );
  }
}
/** Laermuin's Response, after it commits to a quest. */
export function angmarLootCommitted(s: GameState, committed: Unit[]) {
  if (s.campaign?.kind !== "angmar") return;
  for (const u of committed)
    if (u.code === LOOT.laermuin && live(s, u) && healable(s).length)
      prepend(
        s,
        fx("angmarLootLaermuin", { source: u.id, player: ownerOf(s, u) }),
      );
}
/** Mail of Eärnur's Response, after a player's threat is reduced. */
export function angmarLootThreatReduced(s: GameState) {
  if (s.campaign?.kind !== "angmar") return;
  for (const p of seatIndices(s))
    for (const h of seatView(s, p).heroes)
      for (const a of attached(h, LOOT.mail))
        if (h.damage > 0 && rhosgobelHealingAllowed(s, h))
          prepend(
            s,
            fx("angmarLootMail", { source: a.id, target: h.id, player: p }),
          );
}
/** The damaged characters that can be healed. */
const healable = (s: GameState) =>
  allCharacters(s).filter((u) => u.damage > 0 && rhosgobelHealingAllowed(s, u));
/** The quest cards in play: the main quest and each side quest. */
function questCards(s: GameState) {
  const main = mainQuestUnit(s);
  return [
    ...(main ? [main] : []),
    ...s.staging.filter((u) =>
      ["player-side-quest", "encounter-side-quest"].includes(
        card(u.code).type_code,
      ),
    ),
  ];
}
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };

export function angmarLootEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "angmarLootBerelind": {
      const p = e.player ?? 0;
      const quests = questCards(s);
      if (!quests.length) return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? LOOT.berelind,
          LOOT.berelind,
          "Berelind · Place 1 progress on a quest card in play?",
          [
            ...quests.map((q) => ({
              id: q.id,
              code: q.code,
              label: `Place 1 progress on ${name(q)}`,
              effects: [
                fx("angmarLootProgress", { target: q.id, code: q.code }),
              ],
            })),
            skip,
          ],
          card(LOOT.berelind).text,
          p,
        ),
      );
      return true;
    }
    case "angmarLootProgress": {
      const quest = questCards(s).find(
        (u) => u.id === e.target && u.code === e.code,
      );
      if (quest) addQuestProgress(s, quest, 1);
      return true;
    }
    case "angmarLootSilverthorn": {
      const p = e.player ?? 0;
      const hero = get(s, e.target);
      if (!hero || spent(s, e.source!)) return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source!,
          LOOT.silverthorn,
          `Silverthorn · Add ${card(e.code!).name} to the victory display?`,
          [
            {
              id: "victory",
              label: `Add ${card(e.code!).name} to the victory display (once per game)`,
              effects: [
                fx("angmarLootVictory", { source: e.source, code: e.code }),
              ],
            },
            skip,
          ],
          card(LOOT.silverthorn).text,
          p,
        ),
      );
      return true;
    }
    case "angmarLootVictory": {
      const i = s.encounterDiscard.lastIndexOf(e.code!);
      if (i < 0 || spent(s, e.source!)) return true;
      s.encounterDiscard.splice(i, 1);
      addVictoryCard(s, e.code!);
      ((s.angmarCards ??= {}).spent ??= []).push(e.source!);
      log(
        s,
        `Silverthorn: ${card(e.code!).name} is added to the victory display.`,
        "good",
      );
      return true;
    }
    case "angmarLootCoruhaer": {
      const p = e.player ?? 0;
      const enemy = get(s, e.target);
      const payers = seatView(s, p).heroes.filter((h) => h.resources > 0);
      if (!enemy || !payers.length) return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? LOOT.coruhaer,
          LOOT.coruhaer,
          `Coruhaer · Spend 1 resource to deal 2 damage to ${name(enemy)}?`,
          [
            ...payers.map((h) => ({
              id: h.id,
              code: h.code,
              label: `Spend 1 resource from ${name(h)}`,
              effects: [
                fx("angmarLootCoruhaerDamage", {
                  source: h.id,
                  target: enemy.id,
                }),
              ],
            })),
            skip,
          ],
          card(LOOT.coruhaer).text,
          p,
        ),
      );
      return true;
    }
    case "angmarLootCoruhaerDamage": {
      const hero = get(s, e.source);
      const enemy = get(s, e.target);
      if (!hero || !enemy || hero.resources < 1) return true;
      hero.resources -= 1;
      log(
        s,
        `Coruhaer: ${name(hero)} spends 1 resource; 2 damage is dealt to ${name(enemy)}.`,
        "good",
      );
      damage(s, enemy.id, 2, {});
      check(s);
      return true;
    }
    case "angmarLootLaermuin": {
      const p = e.player ?? 0;
      const targets = healable(s);
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? LOOT.laermuin,
          LOOT.laermuin,
          "Laermuin · Heal 1 damage from a character?",
          [
            ...targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: `Heal 1 damage from ${name(u)}`,
              effects: [
                fx("heal", {
                  target: u.id,
                  value: 1,
                  source: e.source,
                  code: LOOT.laermuin,
                  player: p,
                }),
              ],
            })),
            skip,
          ],
          card(LOOT.laermuin).text,
          p,
        ),
      );
      return true;
    }
    case "angmarClueBrand": {
      const p = e.player ?? 0;
      const top = s.encounterDeck.slice(0, 5);
      const sorcery = [...new Set(top)].filter(
        (code) =>
          card(code).type_code === "treachery" &&
          (card(code).traits ?? "")
            .split(".")
            .some((t) => t.trim() === "Sorcery"),
      );
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? CLUE.brand,
          CLUE.brand,
          "Daechanar's Brand · Search the top 5 cards of the encounter deck for a Sorcery treachery?",
          [
            ...sorcery.map((code) => ({
              id: code,
              code,
              label: `Add ${card(code).name} to the victory display`,
              effects: [fx("angmarClueBrandTake", { code })],
            })),
            {
              id: "search",
              label: sorcery.length
                ? "Take no card · Shuffle the encounter deck"
                : "No Sorcery treachery · Shuffle the encounter deck",
              effects: [fx("angmarClueBrandTake", {})],
            },
            skip,
          ],
          card(CLUE.brand).text,
          p,
        ),
      );
      return true;
    }
    case "angmarClueBrandTake": {
      if (e.code) {
        const i = s.encounterDeck.slice(0, 5).indexOf(e.code);
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          addVictoryCard(s, e.code);
          log(
            s,
            `Daechanar's Brand: ${card(e.code).name} is added to the victory display.`,
            "good",
          );
        }
      }
      shuffle(s, s.encounterDeck);
      return true;
    }
    case "angmarClueHeirloom": {
      const p = e.player ?? 0;
      const host = get(s, e.target);
      if (!host || !host.damage || !rhosgobelHealingAllowed(s, host))
        return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? CLUE.heirloom,
          CLUE.heirloom,
          `Heirloom of Iârchon · Heal all damage from ${name(host)}?`,
          [
            {
              id: "heal",
              label: `Heal ${host.damage} damage from ${name(host)}`,
              effects: [
                fx("heal", {
                  target: host.id,
                  value: host.damage,
                  source: e.source,
                  code: CLUE.heirloom,
                  player: p,
                }),
              ],
            },
            skip,
          ],
          card(CLUE.heirloom).text,
          p,
        ),
      );
      return true;
    }
    case "angmarClueOrders": {
      const p = e.player ?? 0;
      const targets = ordersTargets(s);
      if (!targets.length) return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? CLUE.orders,
          CLUE.orders,
          "Orders from Angmar · Discard a non-unique Undead enemy with 2 or less remaining hit points?",
          [
            ...targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: `Discard ${name(u)}`,
              effects: [fx("angmarClueOrdersDiscard", { target: u.id })],
            })),
            skip,
          ],
          card(CLUE.orders).text,
          p,
        ),
      );
      return true;
    }
    case "angmarClueOrdersDiscard": {
      const enemy = ordersTargets(s).find((u) => u.id === e.target);
      if (!enemy) return true;
      log(s, `Orders from Angmar: ${name(enemy)} is discarded.`, "good");
      destroy(s, enemy, false);
      return true;
    }
    case "angmarLootMail": {
      const p = e.player ?? 0;
      const hero = get(s, e.target);
      if (!hero || !hero.damage || !rhosgobelHealingAllowed(s, hero))
        return true;
      forOwner(s, p, () =>
        choosePlayerResponse(
          s,
          e.source ?? LOOT.mail,
          LOOT.mail,
          `Mail of Eärnur · Heal 1 damage from ${name(hero)}?`,
          [
            {
              id: "heal",
              label: `Heal 1 damage from ${name(hero)}`,
              effects: [
                fx("heal", {
                  target: hero.id,
                  value: 1,
                  source: e.source,
                  code: LOOT.mail,
                  player: p,
                }),
              ],
            },
            skip,
          ],
          card(LOOT.mail).text,
          p,
        ),
      );
      return true;
    }
  }
  return false;
}
