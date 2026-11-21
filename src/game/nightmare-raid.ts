/**
 * Raid on the Grey Havens' Nightmare Deck (docs/NIGHTMARE.md): its setup card
 * (removals, which the scenario's setup applies with the Dream-chaser shuffled
 * into the encounter deck for the setup search, in
 * src/game/raid-grey-havens.ts; Captain Sahír and Na'asiyah cannot have
 * attachments), its stage 2 (Sahír's Advance, whose victory and shared
 * resources are the scenario's own checks) and its Nightmare encounter cards,
 * composed with the scenario's rules through batch4Scenario while a Nightmare
 * mode game is played. Effects use the "nrd" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, imageUrl, name } from "./cards";
import { choose, fx, get, log, make, prepend, stats } from "./core";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  ownerOf,
  playerOrder,
  seatName,
} from "./table";
import { RAID as R } from "./raid-grey-havens-support";
import { raidAflame, raidAflameLocations } from "./raid-grey-havens";
import { NIGHTMARE_GH as G, nightmareLive } from "./nightmare";
import { NEUTRAL_LAYER, live, seatLabel } from "./nightmare-core";

const nrdLive = (s: GameState) =>
  nightmareLive(s) &&
  s.scenarioId === "raid-on-the-grey-havens" &&
  !!s.raidGreyHavens;
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const raider = (code: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Raider");
const unique = (code: string) =>
  card(code).type_code === "location" && !!card(code).is_unique;
/** Damage on a Nightmare Ship location in play (each is unique). */
const shipDamage = (s: GameState, code: string) => {
  const ship = [...s.staging, ...allActiveLocations(s)].find((u) =>
    live(s, u, code),
  );
  return ship
    ? [
        fx("raidLocationDamage", {
          target: ship.id,
          value: 1,
          player: firstPlayer(s),
        }),
      ]
    : [];
};
const locationOptions = (
  s: GameState,
  value: number,
  where: Unit[] = raidAflameLocations(s),
): Option[] =>
  where.map((u) => ({
    id: u.id,
    code: u.code,
    label: `${name(u)} · ${u.damage} / ${raidAflame(u)} damage`,
    effects: [
      fx("raidLocationDamage", { target: u.id, value, player: firstPlayer(s) }),
    ],
  }));
const stagedAflame = (s: GameState) =>
  s.staging.filter(
    (u) => card(u.code).type_code === "location" && raidAflame(u) > 0,
  );

// ------------------------------------------------------------- passives

/** The setup card's back: "Captain Sahír and Na'asiyah each gain: 'Cannot have attachments.'" */
const nrdCannotAttach = (s: GameState, u: Unit) =>
  nrdLive(s) && [R.sahir, R.naasiyah].includes(u.code);
/** Corsair Pyromaniac: "+1 [threat], +1 [attack], and +1 [defense] for each resource token on it." */
const nrdStats = (s: GameState, u: Unit) =>
  nrdLive(s) && live(s, u, G.pyromaniac) && u.resources > 0
    ? { attack: u.resources, defense: u.resources }
    : {};
const nrdThreatBonus = (s: GameState, u: Unit) =>
  nrdLive(s) && live(s, u, G.pyromaniac) ? u.resources : 0;
/** Burning Tower: "While Burning Tower is in the staging area, damage cannot be healed." */
const nrdCannotHeal = (s: GameState) =>
  nrdLive(s) && s.staging.some((u) => live(s, u, G.tower));

// ------------------------------------------------------------- the cards

/**
 * Corsair Pillager: "During the combat phase, Corsair Pillager makes 1
 * additional attack for each resource token on it." Its additional attacks
 * follow its normal attack (they are immediate attacks themselves).
 */
function nrdAttackStarted(s: GameState, enemy: Unit) {
  const c = s.combat;
  if (!c || c.immediate || !nrdLive(s) || !live(s, enemy, G.pillager)) return;
  if (!["defense", "attack"].includes(s.phase) || enemy.resources <= 0) return;
  c.extraAttacks = (c.extraAttacks ?? 0) + enemy.resources;
  log(
    s,
    `Corsair Pillager makes ${enemy.resources} additional attack${enemy.resources === 1 ? "" : "s"} (1 for each resource on it).`,
    "danger",
  );
}
/**
 * Corsair Pillager: "Forced: After the players travel to an Aflame location,
 * place 1 resource on Corsair Pillager for each damage on that location."
 */
function nrdTravelEntered(s: GameState, u: Unit, actual: boolean) {
  if (!nrdLive(s) || !actual || raidAflame(u) <= 0 || u.damage <= 0) return;
  const pillagers = enemies(s).filter((x) => live(s, x, G.pillager));
  for (const x of pillagers) x.resources += u.damage;
  if (pillagers.length)
    log(
      s,
      `Corsair Pillager: the players travel to ${name(u)}, with ${u.damage} damage; each Corsair Pillager gets ${u.damage} resource${u.damage === 1 ? "" : "s"}.`,
      "danger",
    );
}
/**
 * Elite Marauder: "For each excess point of combat damage dealt by Elite
 * Marauder (damage that is dealt beyond the remaining hit points of the
 * character damaged by its attack) you must place 1 damage on an Aflame
 * location in the staging area."
 */
function nrdDamageDealt(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (!nrdLive(s) || !context.combatDamage) return;
  const enemy = get(s, context.enemyId);
  if (!enemy || !live(s, enemy, G.marauder)) return;
  if (
    !["hero", "ally", "objective-ally", "ship-objective"].includes(
      card(u.code).type_code,
    )
  )
    return;
  const before = u.damage - value;
  const excess = Math.max(0, value - Math.max(0, stats(s, u).health - before));
  if (!excess) return;
  const player = s.combat?.attackPlayer ?? ownerOf(s, u);
  log(
    s,
    `Elite Marauder deals ${excess} excess damage: ${s.table ? `${seatName(s, player)} places` : "you place"} 1 damage on an Aflame location in the staging area for each point.`,
    "danger",
  );
  prepend(
    s,
    ...Array.from({ length: excess }, () => fx("nrdMarauder", { player })),
  );
}
/** Nárelenya: "Forced: After the first player plays an ally from his hand, deal 1 damage to the Nárelenya." */
function nrdAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand: boolean,
) {
  if (!nrdLive(s) || !played || !fromHand || ownerOf(s, u) !== firstPlayer(s))
    return false;
  const effects = shipDamage(s, G.narelenya);
  if (effects.length) {
    log(
      s,
      `Nárelenya: the first player plays ${name(u)}; 1 damage is dealt to the Nárelenya.`,
      "danger",
    );
    prepend(s, ...effects);
  }
  return false;
}
/** Dawn Star: "Forced: After the first player draws any number of cards, deal 1 damage to the Dawn Star." */
function nrdCardsDrawn(s: GameState, player: number, count: number) {
  if (!nrdLive(s) || count <= 0 || player !== firstPlayer(s)) return;
  const effects = shipDamage(s, G.dawnStar);
  if (effects.length) {
    log(
      s,
      "Dawn Star: the first player draws; 1 damage is dealt to the Dawn Star.",
      "danger",
    );
    prepend(s, ...effects);
  }
}
/** Silver Wing: "Forced: After the first player attacks an enemy, deal 1 damage to the Silver Wing." */
function nrdPlayerAttackResolved(s: GameState, _enemy: Unit, ids: string[]) {
  if (!nrdLive(s)) return;
  const attacker = ids.map((id) => get(s, id)).find((u): u is Unit => !!u);
  if ((attacker ? ownerOf(s, attacker) : activeSeat(s)) !== firstPlayer(s))
    return;
  const effects = shipDamage(s, G.silverWing);
  if (effects.length) {
    log(
      s,
      "Silver Wing: the first player attacks; 1 damage is dealt to the Silver Wing.",
      "danger",
    );
    prepend(s, ...effects);
  }
}

function nrdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!nrdLive(s) || (code !== G.sudden && code !== G.infiltration))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  // Sudden Assault: "Each player must either deal 2 damage to an Aflame
  // location in play, or reveal 1 card from the top of the encounter deck."
  if (code === G.sudden)
    prepend(s, ...playerOrder(s).map((player) => fx("nrdSudden", { player })));
  // Infiltration: "Remove 1 resource from each hero in play. Distribute
  // those resources as evenly as possible among Raider enemies in play or
  // set aside."
  else prepend(s, fx("nrdInfiltration", { player: firstPlayer(s) }));
  return true;
}

function nrdShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !nrdLive(s)) return false;
  // Sudden Assault: "Either deal 2 damage to an Aflame location in play or
  // attacking enemy makes an additional attack after this one."
  if (code === G.sudden) {
    prepend(
      s,
      fx("nrdSuddenShadow", { player: c.attackPlayer ?? activeSeat(s) }),
    );
    return true;
  }
  // Infiltration: "Damage from this attack is dealt to an Aflame location in
  // play instead of the defending character."
  if (code === G.infiltration) {
    c.nrdInfiltration = true;
    log(
      s,
      "Infiltration: damage from this attack is dealt to an Aflame location in play instead of the defending character.",
      "danger",
    );
    return true;
  }
  return false;
}
function nrdReplaceDamage(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  const c = s.combat;
  if (
    !nrdLive(s) ||
    !c?.nrdInfiltration ||
    value <= 0 ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    !(c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).includes(u.id) ||
    !raidAflameLocations(s).length
  )
    return false;
  log(
    s,
    `Infiltration: ${value} damage to ${name(u)} is dealt to an Aflame location instead.`,
    "danger",
  );
  prepend(
    s,
    fx("nrdRedirect", { value, player: c.attackPlayer ?? ownerOf(s, u) }),
  );
  return true;
}

/** Sahír's Advance (Nightmare) for the quest inspector. */
function nrdStageInfo(s: GameState) {
  if (!nrdLive(s) || s.stage !== 2) return undefined;
  const c = card(G.advance);
  return {
    name: c.back_name ?? c.name,
    cardCode: G.advance,
    quest: 0,
    story: c.back_text ?? "",
    side: "B" as const,
    questImage: imageUrl({ ...c, imagesrc: c.back_imagesrc }),
  };
}

// ------------------------------------------------------------- effects

export function nightmareRaidEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nrd")) return false;
  if (!nrdLive(s)) return true;
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    case "nrdShips": {
      // The first player's search takes the Dream-chaser; each other player
      // chooses a different unique location.
      const i = s.encounterDeck.indexOf(R.dream);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        s.staging.push(make(s, R.dream));
        log(
          s,
          "Setup: the Dream-chaser is added to the staging area from the encounter deck.",
        );
      }
      prepend(
        s,
        ...playerOrder(s)
          .filter((x) => x !== firstPlayer(s))
          .map((player) => fx("nrdShip", { player })),
      );
      return true;
    }
    case "nrdShip": {
      const codes = [...new Set(s.encounterDeck.filter(unique))];
      if (!codes.length) return true;
      choose(
        s,
        `Setup · Add a unique location to the staging area${seatLabel(s, p)}`,
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("nrdShipTake", { code, player: p })],
        })),
        "Instead of adding the Dream-chaser to the staging area during setup, each player must search the encounter deck for a different unique location and add it to the staging area, one of which must be the Dream-chaser.",
      );
      return true;
    }
    case "nrdShipTake": {
      const i = s.encounterDeck.indexOf(e.code ?? "");
      if (i < 0) return true;
      s.encounterDeck.splice(i, 1);
      s.staging.push(make(s, e.code!));
      log(
        s,
        `Setup: ${who(s, p)} ${s.table ? "adds" : "add"} ${card(e.code!).name} to the staging area from the encounter deck.`,
      );
      return true;
    }
    case "nrdTower": {
      // "Choose X characters, where X is the amount of damage on Burning
      // Tower. Deal 1 damage to each chosen character."
      const all = allCharacters(s);
      const x = Math.min(e.value ?? 0, all.length);
      if (!x) return true;
      if (x >= all.length) {
        log(
          s,
          `Burning Tower: 1 damage is dealt to each character (${all.map((u) => name(u)).join(", ")}).`,
          "danger",
        );
        prepend(
          s,
          ...all.map((u) =>
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
          ),
        );
        return true;
      }
      prepend(s, fx("nrdTowerPick", { value: x, ids: [], player: p }));
      return true;
    }
    case "nrdTowerPick": {
      const chosen = e.ids ?? [];
      if (chosen.length >= (e.value ?? 0)) {
        const targets = chosen
          .map((id) => get(s, id))
          .filter((u): u is Unit => !!u);
        log(
          s,
          `Burning Tower: 1 damage is dealt to ${targets.map((u) => name(u)).join(", ")}.`,
          "danger",
        );
        prepend(
          s,
          ...targets.map((u) =>
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
          ),
        );
        return true;
      }
      choose(
        s,
        `Burning Tower · Choose a character (${chosen.length + 1} of ${e.value})${seatLabel(s, p)}`,
        allCharacters(s)
          .filter((u) => !chosen.includes(u.id))
          .map((u): Option => ({
            id: u.id,
            code: u.code,
            label: s.table
              ? `${name(u)} · ${seatName(s, ownerOf(s, u))}`
              : name(u),
            effects: [
              fx("nrdTowerPick", {
                value: e.value,
                ids: [...chosen, u.id],
                player: p,
              }),
            ],
          })),
        "Forced: After damage is placed on Burning Tower, choose X characters, where X is the amount of damage on Burning Tower. Deal 1 damage to each chosen character.",
      );
      return true;
    }
    case "nrdPyromaniac": {
      const pyromaniacs = enemies(s).filter((x) => live(s, x, G.pyromaniac));
      for (const x of pyromaniacs) x.resources++;
      if (pyromaniacs.length)
        log(
          s,
          "Corsair Pyromaniac: a card is placed underneath The Havens Burn; 1 resource is placed on each Corsair Pyromaniac.",
          "danger",
        );
      return true;
    }
    case "nrdMarauder": {
      const options = locationOptions(s, 1, stagedAflame(s));
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Elite Marauder · Place 1 damage on an Aflame location${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "nrdSudden": {
      const options: Option[] = [];
      if (raidAflameLocations(s).length)
        options.push({
          id: "damage",
          label: "Deal 2 damage to an Aflame location in play",
          effects: [fx("nrdAflameDamage", { value: 2, player: p })],
        });
      if (s.encounterDeck.length || s.encounterDiscard.length)
        options.push({
          id: "reveal",
          label: "Reveal 1 card from the top of the encounter deck",
          effects: [fx("reveal", { player: p })],
        });
      if (!options.length) return true;
      choose(
        s,
        `Sudden Assault · Choose one${seatLabel(s, p)}`,
        options,
        "When Revealed: Each player must either deal 2 damage to an Aflame location in play, or reveal 1 card from the top of the encounter deck.",
      );
      return true;
    }
    case "nrdSuddenShadow": {
      const options: Option[] = [];
      if (raidAflameLocations(s).length)
        options.push({
          id: "damage",
          label: "Deal 2 damage to an Aflame location in play",
          effects: [fx("nrdAflameDamage", { value: 2, player: p })],
        });
      options.push({
        id: "attack",
        label: "The attacking enemy makes an additional attack after this one",
        effects: [fx("nrdExtraAttack", { player: p })],
      });
      choose(
        s,
        `Sudden Assault · Choose one${seatLabel(s, p)}`,
        options,
        "Shadow: Either deal 2 damage to an Aflame location in play or attacking enemy makes an additional attack after this one.",
      );
      return true;
    }
    case "nrdExtraAttack":
      if (s.combat) s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "Sudden Assault: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case "nrdAflameDamage":
    case "nrdRedirect": {
      const options = locationOptions(s, e.value ?? 0);
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `${e.kind === "nrdRedirect" ? "Infiltration" : "Sudden Assault"} · Deal ${e.value} damage to an Aflame location${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "nrdInfiltration": {
      let removed = 0;
      for (const h of allCharacters(s).filter(
        (u) => card(u.code).type_code === "hero" && u.resources > 0,
      )) {
        h.resources--;
        removed++;
      }
      const raiders = [
        ...enemies(s),
        ...(s.raidGreyHavens?.setAside ?? []),
      ].filter((u) => raider(u.code) && !u.blanked);
      if (!removed) {
        log(s, "Infiltration: no hero has a resource.");
        return true;
      }
      if (!raiders.length) {
        log(
          s,
          `Infiltration: ${removed} resource${removed === 1 ? " is" : "s are"} removed from the heroes; no Raider enemy is in play or set aside.`,
          "danger",
        );
        return true;
      }
      const each = Math.floor(removed / raiders.length);
      for (const u of raiders) u.resources += each;
      const rest = removed - each * raiders.length;
      log(
        s,
        `Infiltration: ${removed} resource${removed === 1 ? " is" : "s are"} removed from the heroes and distributed among ${raiders.length} Raider enem${raiders.length === 1 ? "y" : "ies"}${each ? ` (${each} each)` : ""}.`,
        "danger",
      );
      if (rest)
        prepend(
          s,
          fx("nrdInfiltrationRest", { value: rest, ids: [], player: p }),
        );
      return true;
    }
    case "nrdInfiltrationRest": {
      const given = e.ids ?? [];
      if (given.length >= (e.value ?? 0)) return true;
      const raiders = [
        ...enemies(s),
        ...(s.raidGreyHavens?.setAside ?? []),
      ].filter((u) => raider(u.code) && !u.blanked && !given.includes(u.id));
      if (!raiders.length) return true;
      choose(
        s,
        `Infiltration · Place 1 more resource on a Raider enemy (${given.length + 1} of ${e.value})${seatLabel(s, p)}`,
        raiders.map((u): Option => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${s.raidGreyHavens?.setAside.some((x) => x.id === u.id) ? " · set aside" : ""} · ${u.resources} resources`,
          effects: [
            fx("nrdInfiltrationGive", { target: u.id, player: p }),
            fx("nrdInfiltrationRest", {
              value: e.value,
              ids: [...given, u.id],
              player: p,
            }),
          ],
        })),
        "Distribute those resources as evenly as possible among Raider enemies in play or set aside.",
      );
      return true;
    }
    case "nrdInfiltrationGive": {
      const u =
        get(s, e.target) ??
        s.raidGreyHavens?.setAside.find((x) => x.id === e.target);
      if (u) u.resources++;
      return true;
    }
  }
  return false;
}

export const NIGHTMARE_RAID_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotAttach: nrdCannotAttach,
  stats: nrdStats,
  threatBonus: nrdThreatBonus,
  cannotHeal: nrdCannotHeal,
  enemyAttackStarted: nrdAttackStarted,
  travelEntered: nrdTravelEntered,
  damageDealt: nrdDamageDealt,
  allyEntered: nrdAllyEntered,
  cardsDrawn: nrdCardsDrawn,
  playerAttackResolved: nrdPlayerAttackResolved,
  encounter: nrdEncounter,
  shadow: nrdShadow,
  replaceDamage: nrdReplaceDamage,
  stageInfo: nrdStageInfo,
  effect: nightmareRaidEffect,
  sharedEffect: () => false,
};
