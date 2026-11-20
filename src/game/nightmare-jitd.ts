/**
 * Journey in the Dark's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (each hero in each player's discard pile cannot leave it; the players
 * cannot defeat stage 3B unless The Balrog is in the victory display) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/journey-dark.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario's Balrog (set aside until Doom, Doom, Doom
 * runs out of tokens) carries the Nightmare Weapons. Effects use the "njd"
 * prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  removeShadowCard,
} from "./core";
import { damage, discardHandCard, enemyAddedToStaging } from "./board";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { removeCurrentQuestProgress } from "./side-quests";
import { rhosgobelHeal } from "./rhosgobel";
import { who } from "./black-riders-hunted";
import { JD, jdBalrog } from "./journey-dark-support";
import { NIGHTMARE_TRD as N, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, phaseKey, seatLabel } from "./nightmare-core";

export interface NightmareJourneyDarkState {
  /** Fiery Whip and Flaming Sword, attached to The Balrog while it is set aside, out of play. */
  darkWeapons?: string[];
  /** Very Weary: each resolved copy's round and phase, while each damaged character gets -2 [willpower]. */
  darkWeary?: { round: number; phase: string }[];
  /** Cut Off: the round in which progress cannot be placed on the quest. */
  darkCutOff?: number;
}

type Combat = NonNullable<GameState["combat"]>;

const jdLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "journey-in-the-dark";
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const locationsInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(isLocation);
const WEAPONS: readonly string[] = [N.whip, N.sword];
const weapons = (u: Unit, code: string) =>
  u.attachments.filter((a) => a.code === code && !a.blanked).length;
/** The Great Bridge's response: "The Balrog loses all keywords" (Archery and Regenerate among them). */
const unbound = (s: GameState) => !!s.journeyDark?.balrogUnbound;
const ownCharacters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** Very Weary's copies lasting this phase. */
const wearyCopies = (s: GameState) =>
  (s.nightmare?.darkWeary ?? []).filter(
    (x) => x.round === s.round && x.phase === phaseKey(s),
  ).length;

// ------------------------------------------------------------- the setup card

/** "Each hero in each player's discard pile cannot leave the discard pile." */
const jdDiscardCardKept = (s: GameState, code: string) =>
  jdLive(s) && card(code).type_code === "hero";
/** "The players cannot defeat stage 3B unless The Balrog is in the victory display." */
const jdCannotDefeatStage = (s: GameState, stage: number) =>
  jdLive(s) && stage === 3 && !(s.victoryCards ?? []).includes(JD.balrog);

// ------------------------------------------------------------- the cards

/** Slab-bearer: "Cannot have attachments." */
const jdCannotAttach = (s: GameState, u: Unit) =>
  jdLive(s) && live(s, u, N.slab);
/** Slab-bearer: "Forced: When Slab-bearer is destroyed, discard the top card of the encounter deck. If the discarded card is an enemy, add it to the staging area." */
function jdCharacterDestroyed(s: GameState, u: Unit) {
  if (jdLive(s) && live(s, u, N.slab))
    prepend(s, fx("njdSlab", { player: firstPlayer(s) }));
}
/** Glowing Fissure: "X is 1 more than the number of damaged characters." (Its printed [threat] is X.) */
const jdThreatBonus = (s: GameState, u: Unit) =>
  jdLive(s) && live(s, u, N.glowing)
    ? 1 + globalCharacters(s).filter((x) => x.damage > 0).length
    : 0;
/** Glowing Fissure: "Forced: After a player commits characters to the quest, he deals 1 damage to a character he controls." (Each copy in play.) */
function jdCharactersCommitted(s: GameState, units: Unit[]) {
  if (!jdLive(s) || !units.length) return;
  const fissures = locationsInPlay(s).filter((u) => live(s, u, N.glowing));
  if (!fissures.length) return;
  const p = ownerOf(s, units[0]);
  prepend(s, ...fissures.map(() => fx("njdFissure", { player: p })));
}
/** Darkened Mine: "While Darkened Mine is in the staging area, progress cannot be placed on locations in the staging area." */
const jdLocationProgressBlocked = (s: GameState, u: Unit) =>
  jdLive(s) &&
  s.staging.some((x) => x.id === u.id) &&
  s.staging.some((x) => live(s, x, N.mine));
/**
 * Very Weary: "Until the end of the phase, each damaged character gets -2
 * [willpower]." Fiery Whip: "Attached enemy gets +1 [defense]." Flaming
 * Sword: "Attached enemy gets +1 [attack]."
 */
function jdStats(s: GameState, u: Unit) {
  if (!jdLive(s)) return {};
  if (live(s, u, JD.balrog))
    return { attack: weapons(u, N.sword), defense: weapons(u, N.whip) };
  const weary = wearyCopies(s);
  return weary && isCharacter(u) && u.damage > 0 ? { will: -2 * weary } : {};
}
/** Cut Off: "progress cannot be placed on the quest until the end of the round." */
function jdProgress(s: GameState, amount: number, quest: Unit) {
  if (
    !jdLive(s) ||
    amount <= 0 ||
    s.nightmare?.darkCutOff !== s.round ||
    mainQuestUnit(s)?.id !== quest.id
  )
    return amount;
  log(s, "Cut Off: progress cannot be placed on the quest this round.");
  return 0;
}
/** Zirakzigil Archer: "Archery 2." Fiery Whip: "Attached enemy ... gains Archery 4." (While in the staging area, as the scenario's Moria Archer.) */
function jdCombatBegin(s: GameState) {
  if (!jdLive(s)) return;
  const balrog = s.staging.find((u) => live(s, u, JD.balrog));
  const archery =
    2 * s.staging.filter((u) => live(s, u, N.zirak)).length +
    (balrog && !unbound(s) ? 4 * weapons(balrog, N.whip) : 0);
  if (archery)
    prepend(s, fx("heirsArchery", { value: archery, player: firstPlayer(s) }));
}
/** Flaming Sword: "Regenerate 4. (At the end of the refresh phase, remove 4 damage from the attached enemy.)" */
function jdRefreshEndForced(s: GameState): Effect[] {
  if (!jdLive(s) || unbound(s)) return [];
  const balrog = jdBalrog(s);
  if (!balrog || balrog.blanked || !weapons(balrog, N.sword)) return [];
  return [fx("njdRegenerate", { target: balrog.id, player: firstPlayer(s) })];
}
/** The Weapons attached to The Balrog out of play come into play with it. */
function jdEnemyEntered(s: GameState, u: Unit) {
  const q = s.nightmare;
  if (!jdLive(s) || !live(s, u, JD.balrog) || !q?.darkWeapons?.length) return;
  for (const code of q.darkWeapons)
    u.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
  log(
    s,
    `The Balrog enters play with ${q.darkWeapons.map((c) => card(c).name).join(" and ")} attached.`,
    "danger",
  );
  delete q.darkWeapons;
}
/** Cut Off's shadow: "If this attack destroys a character, remove all progress from the quest." */
function jdAttackFinished(s: GameState, c: Combat, skipped = false): Effect[] {
  if (!jdLive(s) || skipped || !c.jtdDestroyed || !c.nmClearOnKill) return [];
  return [fx("njdClear", { player: c.attackPlayer ?? firstPlayer(s) })];
}

function jdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!jdLive(s)) return false;
  const p = activeSeat(s);
  if (code === N.zirak) {
    // Zirakzigil Archer: "When Revealed: Discard a random card from your
    // hand. Assign X damage among characters you control, where X is the
    // cost of the discarded card."
    if (fromReveal) prepend(s, fx("njdZirak", { player: p }));
    return true;
  }
  if (![...WEAPONS, N.weary, N.cutOff].includes(code)) return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (!fromReveal) {
    s.encounterDiscard.push(code);
    return true;
  }
  if (WEAPONS.includes(code)) {
    prepend(s, fx("njdWeapon", { code, player: p }));
    return true;
  }
  s.encounterDiscard.push(code);
  if (code === N.cutOff) {
    prepend(s, fx("njdCutOff", { player: p }));
    return true;
  }
  // Very Weary: "Each player deals 1 damage to a questing character he
  // controls. Until the end of the phase, each damaged character gets -2
  // [willpower]."
  const q = (s.nightmare ??= {});
  q.darkWeary = [
    ...(q.darkWeary ?? []).filter((x) => x.round === s.round),
    { round: s.round, phase: phaseKey(s) },
  ];
  prepend(s, ...playerOrder(s).map((player) => fx("njdWeary", { player })));
  return true;
}

function jdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !jdLive(s)) return false;
  const p = c.attackPlayer ?? firstPlayer(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    // Darkened Mine: "Discard 1 random card from your hand."
    case N.mine:
      prepend(s, fx("njdDiscard", { code, player: p }));
      return true;
    // Fiery Whip and Flaming Sword: "If attacking enemy is The Balrog,
    // attach [it] to it."
    case N.whip:
    case N.sword:
      if (enemy && live(s, enemy, JD.balrog))
        prepend(
          s,
          fx("njdWeaponShadow", { code, source: enemy.id, player: p }),
        );
      return true;
    // Very Weary: "Deal 1 damage to the defending character."
    case N.weary: {
      const defenders = c.defenderIds?.length
        ? c.defenderIds
        : c.defenderId
          ? [c.defenderId]
          : [];
      prepend(
        s,
        ...defenders.map((id) =>
          fx("njdHurt", { target: id, code, player: p }),
        ),
      );
      return true;
    }
    // Cut Off: "If this attack destroys a character, remove all progress
    // from the quest."
    case N.cutOff:
      c.nmClearOnKill = (c.nmClearOnKill ?? 0) + 1;
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

export function nightmareJourneyDarkEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("njd")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "njdSlab": {
      const code = encounterDraw(s);
      if (!code) {
        log(s, "Slab-bearer: the encounter deck is empty.");
        return true;
      }
      if (card(code).type_code !== "enemy") {
        s.encounterDiscard.push(code);
        log(
          s,
          `Slab-bearer is destroyed: ${card(code).name} is discarded from the encounter deck.`,
        );
        return true;
      }
      const x = make(s, code);
      s.staging.push(x);
      enemyAddedToStaging(s, x);
      log(
        s,
        `Slab-bearer is destroyed: ${card(code).name} is discarded from the encounter deck and added to the staging area.`,
        "danger",
      );
      return true;
    }
    case "njdZirak": {
      let cost = 0;
      forOwner(s, p, () => {
        if (!s.hand.length) {
          log(
            s,
            `Zirakzigil Archer: ${who(s, p)} ha${s.table ? "s" : "ve"} no card in hand.`,
          );
          return;
        }
        const discarded = s.hand[Math.floor(random(s) * s.hand.length)];
        cost = Number(card(discarded.code).cost) || 0;
        log(
          s,
          `Zirakzigil Archer: ${name(discarded)} (cost ${cost}) is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, discarded.id, { encounterEffect: true });
      });
      if (cost > 0)
        prepend(
          s,
          fx("jtdAssignDamage", {
            value: cost,
            text: "Zirakzigil Archer",
            player: p,
          }),
        );
      return true;
    }
    case "njdFissure": {
      const own = ownCharacters(s, p);
      if (!own.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Glowing Fissure${seatLabel(s, p)} · Deal 1 damage to a character you control`,
          own.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("njdHurt", { target: x.id, code: N.glowing, player: p }),
            ],
          })),
          "Forced: after a player commits characters to the quest.",
        ),
      );
      return true;
    }
    case "njdHurt":
      if (u && globalCharacters(s).some((x) => x.id === u.id)) {
        log(
          s,
          `${card(e.code ?? N.weary).name}: 1 damage is dealt to ${name(u)}.`,
          "danger",
        );
        damage(s, u.id, 1);
      }
      return true;
    case "njdWeary": {
      const questing = ownCharacters(s, p).filter((x) => x.committed);
      if (!questing.length) {
        log(
          s,
          `Very Weary: ${who(s, p)} control${s.table ? "s" : ""} no questing character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Very Weary${seatLabel(s, p)} · Deal 1 damage to a questing character you control`,
          questing.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("njdHurt", { target: x.id, code: N.weary, player: p }),
            ],
          })),
          "Until the end of the phase, each damaged character gets -2 willpower.",
        ),
      );
      return true;
    }
    case "njdCutOff": {
      const own = ownCharacters(s, p);
      const options: Option[] = [
        ...(own.length
          ? [
              {
                id: "damage",
                label: "Deal 1 damage to each character you control",
                effects: own.map((x) =>
                  fx("njdHurt", { target: x.id, code: N.cutOff, player: p }),
                ),
              },
            ]
          : []),
        {
          id: "progress",
          label: "Progress cannot be placed on the quest this round",
          effects: [fx("njdCutOffRound", { player: p })],
        },
      ];
      forOwner(s, p, () =>
        choose(
          s,
          `Cut Off${seatLabel(s, p)} · Choose`,
          options,
          "Peril. Either deal 1 damage to each character you control, or progress cannot be placed on the quest until the end of the round.",
        ),
      );
      return true;
    }
    case "njdCutOffRound":
      (s.nightmare ??= {}).darkCutOff = s.round;
      log(
        s,
        "Cut Off: progress cannot be placed on the quest until the end of the round.",
        "danger",
      );
      return true;
    case "njdDiscard":
      forOwner(s, p, () => {
        if (!s.hand.length) return;
        const discarded = s.hand[Math.floor(random(s) * s.hand.length)];
        log(
          s,
          `${card(e.code ?? N.mine).name}: ${name(discarded)} is discarded at random${seatLabel(s, p)}.`,
          "danger",
        );
        discardHandCard(s, discarded.id, { encounterEffect: true });
      });
      return true;
    case "njdWeapon": {
      const code = e.code!;
      const balrog = jdBalrog(s);
      if (balrog) {
        balrog.attachments.push({
          id: `a${s.nextId++}`,
          code,
          exhausted: false,
        });
        log(
          s,
          `${card(code).name} is attached to The Balrog as a Weapon.`,
          "danger",
        );
        return true;
      }
      if (s.journeyDark?.setAside.includes(JD.balrog)) {
        const q = (s.nightmare ??= {});
        q.darkWeapons = [...(q.darkWeapons ?? []), code];
        log(
          s,
          `${card(code).name} is attached to The Balrog, out of play, as a Weapon.`,
          "danger",
        );
        return true;
      }
      s.encounterDiscard.push(code);
      log(
        s,
        `${card(code).name}: The Balrog has left play, so it is discarded.`,
      );
      return true;
    }
    case "njdWeaponShadow": {
      const enemy = get(s, e.source);
      const at = enemy?.shadows.indexOf(e.code!) ?? -1;
      if (!enemy || at < 0 || !live(s, enemy, JD.balrog)) return true;
      removeShadowCard(enemy, at);
      enemy.attachments.push({
        id: `a${s.nextId++}`,
        code: e.code!,
        exhausted: false,
      });
      log(
        s,
        `${card(e.code!).name} is attached to The Balrog as a Weapon.`,
        "danger",
      );
      return true;
    }
    case "njdRegenerate":
      if (u && !unbound(s) && weapons(u, N.sword)) {
        log(s, "Flaming Sword: The Balrog regenerates.", "danger");
        rhosgobelHeal(s, u, 4, { code: N.sword });
      }
      return true;
    case "njdClear": {
      const removed = removeCurrentQuestProgress(s, Number.MAX_SAFE_INTEGER);
      log(
        s,
        `Cut Off: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the quest.`,
        "danger",
      );
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_JOURNEY_DARK_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  discardCardKept: jdDiscardCardKept,
  cannotDefeatStage: jdCannotDefeatStage,
  cannotAttach: jdCannotAttach,
  characterDestroyed: jdCharacterDestroyed,
  threatBonus: jdThreatBonus,
  charactersCommitted: jdCharactersCommitted,
  locationProgressBlocked: jdLocationProgressBlocked,
  stats: jdStats,
  progress: jdProgress,
  combatBegin: jdCombatBegin,
  refreshEndForced: jdRefreshEndForced,
  enemyEntered: jdEnemyEntered,
  attackFinished: jdAttackFinished,
  encounter: jdEncounter,
  shadow: jdShadow,
  effect: nightmareJourneyDarkEffect,
  sharedEffect: (e) => ["njdSlab", "njdClear"].includes(e.kind),
};

// ------------------------------------------------------------- saves

export function validNightmareJourneyDark(s: GameState) {
  const q = s.nightmare;
  const n = (x: unknown) => Number.isInteger(x) && Number(x) >= 0;
  return (
    (q?.darkWeapons === undefined ||
      (Array.isArray(q.darkWeapons) &&
        q.darkWeapons.every((c) => WEAPONS.includes(c)) &&
        new Set(q.darkWeapons).size === q.darkWeapons.length)) &&
    (q?.darkWeary === undefined ||
      (Array.isArray(q.darkWeary) &&
        q.darkWeary.every(
          (x) => !!x && n(x.round) && typeof x.phase === "string",
        ))) &&
    (q?.darkCutOff === undefined || n(q.darkCutOff))
  );
}
