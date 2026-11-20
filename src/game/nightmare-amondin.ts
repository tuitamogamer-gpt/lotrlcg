/**
 * Encounter at Amon Dîn's Nightmare Deck (docs/NIGHTMARE.md): its setup
 * card's rules (Ghulat cannot take damage before 15 progress on Protect the
 * Villagers, 1 villager on Rescued Villagers at setup, a villager or an
 * encounter card at the beginning of each quest phase) and its Nightmare
 * encounter cards, composed with the scenario's own rules
 * (src/game/amon-din.ts) through batch4Scenario while a Nightmare mode game
 * is played. Effects use the "nam" prefix.
 */
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, shuffle } from "./core";
import { engage } from "./board";
import {
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
} from "./table";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
} from "./nightmare-core";
import {
  amonDinAddDead,
  amonDinDeadVillagers,
  amonDinDiscardVillagers,
  amonDinRescued,
} from "./amon-din";
import { AMON_DIN as A } from "./amon-din-support";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareAmonDinState {
  /** Trapped Villagers: the copies revealed this round (each adds the Dead Villagers' tokens to the staging area's [threat]). */
  trapped?: { round: number; count: number };
  /** Orc Raiders' shadow: an additional attack by these enemies after this one. */
  raiders?: { enemyId: string; player: number }[];
  /** Trapped Villagers' shadow: the attacks it resolved in, and whether they destroyed an ally. */
  trappedShadows?: { enemyId: string; killed?: boolean }[];
  /** Besieged Homestead's Travel: the enemy revealed next is put into play engaged with the first player. */
  engageNext?: string;
}

const amLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "encounter-at-amon-din";
const isEnemy = (code: string) => card(code).type_code === "enemy";
const villagers = (s: GameState) => amonDinRescued(s)?.resources ?? 0;
const deaths = (s: GameState) => amonDinDeadVillagers(s)?.damage ?? 0;
const inPlay = (s: GameState) => [
  ...s.staging,
  ...allEngaged(s),
  ...allActiveLocations(s),
];

// ------------------------------------------------------------- the setup card

/** "Ghulat cannot take damage unless there are at least 15 progress tokens on Protect the Villagers." */
function amDamageAmount(
  s: GameState,
  u: Unit,
  amount: number,
  _context: DamageContext,
) {
  if (!amLive(s) || amount <= 0 || u.code !== A.ghulat) return amount;
  if (s.stage === 2 && s.progress >= 15) return amount;
  log(
    s,
    "Ghulat cannot take damage unless there are at least 15 progress tokens on Protect the Villagers.",
  );
  return 0;
}
/** "Forced: At the beginning of the quest phase, either discard 1 villager token from Rescued Villagers, or reveal an encounter card." */
const amQuestBegin = (s: GameState): Effect[] =>
  amLive(s) ? [fx("namQuestBegin", { player: firstPlayer(s) })] : [];

// ------------------------------------------------------------- the cards

/** Trapped Villagers: "Until the end of the round, add 1 to the total [threat] in the staging area for each damage token on Dead Villagers." */
function amStagingThreat(s: GameState) {
  const t = s.nightmare?.trapped;
  return amLive(s) && t && t.round === s.round ? t.count * deaths(s) : 0;
}
/** Besieged Homestead: "Forced: When any amount of progress is placed on a location in the staging area, discard 1 villager token from that location." */
function amLocationProgressPlaced(s: GameState, u: Unit, amount: number) {
  if (!amLive(s) || amount <= 0 || !s.staging.some((l) => l.id === u.id))
    return;
  const homesteads = inPlay(s).filter((l) => live(s, l, N.homestead));
  prepend(
    s,
    ...homesteads.map(() =>
      fx("namDiscardFrom", {
        target: u.id,
        code: N.homestead,
        player: firstPlayer(s),
      }),
    ),
  );
}
/** Overrun Village: while in the staging area, "Forced: After an enemy engages a player, discard 1 villager token from Overrun Village." */
function amEngaged(s: GameState) {
  if (!amLive(s)) return;
  prepend(
    s,
    ...s.staging
      .filter((l) => live(s, l, N.village))
      .map((l) =>
        fx("namDiscardFrom", {
          target: l.id,
          code: N.village,
          player: firstPlayer(s),
        }),
      ),
  );
}
/** Besieged Homestead's and Overrun Village's Travel effects. */
function amTravelEffects(s: GameState, u: Unit) {
  if (!amLive(s)) return undefined;
  // "Travel: The first player searches the encounter deck for an enemy,
  // reveals it, and puts it into play engaged with him. Shuffle the
  // encounter deck."
  if (live(s, u, N.homestead))
    return [fx("namHomesteadTravel", { player: firstPlayer(s) })];
  // "Travel: Place 1 damage token on Dead Villagers."
  if (live(s, u, N.village))
    return [fx("namDead", { count: 1, code: N.village })];
  return undefined;
}
/** Besieged Homestead's Travel: its enemy is put into play engaged with the first player as it is revealed. */
function amCardEntered(s: GameState, u: Unit, fromReveal: boolean) {
  const q = s.nightmare;
  if (!amLive(s) || !fromReveal || !q?.engageNext || q.engageNext !== u.code)
    return;
  delete q.engageNext;
  forOwner(s, firstPlayer(s), () => engage(s, u));
}
/** Those Now Sundered: "Forced: At the end of the round, discard 1 villager token from Rescued Villagers." */
function amRoundEnd(s: GameState): Effect[] {
  if (!amLive(s)) return [];
  const r = amonDinRescued(s);
  return (r?.attachments ?? [])
    .filter((a) => a.code === N.sundered && !a.blanked)
    .map(() =>
      fx("namDiscardRescued", {
        count: 1,
        code: N.sundered,
        player: firstPlayer(s),
      }),
    );
}
/** Trapped Villagers' shadow: "If this attack destroys an ally, place 1 damage token on Dead Villagers." */
function amCharacterDestroyed(s: GameState, u: Unit, context: DamageContext) {
  const q = s.nightmare;
  if (
    !amLive(s) ||
    !q?.trappedShadows?.length ||
    !context.combatDamage ||
    !s.combat ||
    context.enemyId !== s.combat.enemyId ||
    !["ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  for (const t of q.trappedShadows)
    if (t.enemyId === s.combat.enemyId) t.killed = true;
}
function amAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  if (!amLive(s) || !q) return [];
  const effects: Effect[] = [];
  const trapped = (q.trappedShadows ?? []).filter(
    (t) => t.enemyId === combat.enemyId,
  );
  if (trapped.length) {
    q.trappedShadows = q.trappedShadows!.filter(
      (t) => t.enemyId !== combat.enemyId,
    );
    if (!q.trappedShadows.length) delete q.trappedShadows;
    const killed = trapped.filter((t) => t.killed).length;
    if (killed) effects.push(fx("namDead", { count: killed, code: N.trapped }));
  }
  // Orc Raiders' shadow: "Attacking enemy makes an additional attack after
  // this one."
  const again = (q.raiders ?? []).filter((r) => r.enemyId === combat.enemyId);
  if (again.length) {
    q.raiders = q.raiders!.filter((r) => r.enemyId !== combat.enemyId);
    if (!q.raiders.length) delete q.raiders;
    effects.push(
      ...again.map((r) =>
        fx("immediateAttack", { target: r.enemyId, player: r.player }),
      ),
    );
  }
  return effects;
}

/** The Nightmare encounter cards' "When Revealed" effects. */
function amEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!amLive(s)) return false;
  if (code === N.raiders || code === N.pillaging) {
    // The enemy just revealed: in the staging area, or engaged with the
    // first player (Besieged Homestead's Travel).
    const fresh = [
      ...s.staging,
      ...allEngaged(s).filter((u) => ownerOf(s, u) === firstPlayer(s)),
    ]
      .reverse()
      .find((u) => u.code === code);
    if (fromReveal && fresh)
      prepend(
        s,
        fx(code === N.raiders ? "namRaiders" : "namPillaging", {
          target: fresh.id,
          player: firstPlayer(s),
        }),
      );
    return true;
  }
  if (
    code !== N.trapped &&
    code !== N.run &&
    code !== N.saveUs &&
    code !== N.sundered
  )
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  if (code !== N.sundered || !fromReveal) s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  switch (code) {
    case N.trapped:
      prepend(s, fx("namTrapped", { player: firstPlayer(s) }));
      break;
    case N.run:
      prepend(s, fx("namRun", { player: firstPlayer(s) }));
      break;
    case N.saveUs:
      prepend(
        s,
        fx("namSaveUs", {
          ids: playerOrder(s).map(String),
          player: firstPlayer(s),
        }),
      );
      break;
    case N.sundered:
      prepend(s, fx("namSundered", { player: firstPlayer(s) }));
      break;
  }
  return true;
}

function amShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !amLive(s)) return false;
  const p = defendingPlayer(s);
  const q = (s.nightmare ??= {});
  switch (code) {
    // Orc Raiders: "Attacking enemy makes an additional attack after this
    // one."
    case N.raiders:
      q.raiders = [...(q.raiders ?? []), { enemyId: c.enemyId, player: p }];
      return true;
    // Pillaging Orc: "Deal attacking enemy 1 shadow card for each villager
    // token on the active location."
    case N.pillaging: {
      const count = s.activeLocation?.resources ?? 0;
      if (count)
        prepend(s, fx("khazadExtraShadows", { target: c.enemyId, count }));
      return true;
    }
    // Trapped Villagers: "Attacking enemy gets +2 [attack]. If this attack
    // destroys an ally, place 1 damage token on Dead Villagers."
    case N.trapped:
      c.attackBonus += 2;
      q.trappedShadows = [...(q.trappedShadows ?? []), { enemyId: c.enemyId }];
      return true;
    // Run for your Lives!: "Either discard 1 villager token from Rescued
    // Villagers, or this attack is considered undefended."
    case N.run:
      prepend(s, fx("namRunShadow", { player: p }));
      return true;
    // Save Us!: "Attacking enemy gets +1 [attack]. Deal it another shadow
    // card."
    case N.saveUs:
      c.attackBonus += 1;
      prepend(s, fx("khazadExtraShadows", { target: c.enemyId, count: 1 }));
      return true;
  }
  return false;
}

// ------------------------------------------------------------- effects

/** Enemies in the encounter deck (and its discard pile), by code, for a search. */
function enemiesIn(list: string[]) {
  return [...new Set(list.filter(isEnemy))];
}

export function nightmareAmonDinEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nam")) return false;
  const p = e.player ?? firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "namQuestBegin": {
      if (!villagers(s)) {
        log(
          s,
          "Encounter at Amon Dîn · Nightmare: Rescued Villagers has no villager token, so an encounter card is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: p }));
        return true;
      }
      choose(
        s,
        `Encounter at Amon Dîn · Nightmare: discard 1 villager token from Rescued Villagers, or reveal an encounter card${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: "Discard 1 villager token from Rescued Villagers",
            effects: [fx("namDiscardRescued", { count: 1, player: p })],
          },
          {
            id: "reveal",
            label: "Reveal an encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
        card(N.amonCard).back_text,
      );
      return true;
    }
    case "namDiscardRescued": {
      const r = amonDinRescued(s);
      const n = r ? amonDinDiscardVillagers(s, r, e.count ?? 1) : 0;
      if (n)
        log(
          s,
          `${e.code ? `${card(e.code).name}: ` : ""}${n} villager ${n === 1 ? "token is" : "tokens are"} discarded from Rescued Villagers.`,
          "danger",
        );
      return true;
    }
    case "namDiscardFrom":
      if (u?.resources) {
        amonDinDiscardVillagers(s, u, 1);
        log(
          s,
          `${card(e.code ?? N.homestead).name}: 1 villager token is discarded from ${name(u)}.`,
          "danger",
        );
      }
      return true;
    case "namDead":
      amonDinAddDead(s, e.count ?? 1);
      return true;
    case "namRaiders": {
      // Orc Raiders: "Either discard 1 villager token from Rescued
      // Villagers, or Orc Raiders makes an immediate attack against the
      // first player."
      const attack = fx("immediateAttack", {
        target: e.target,
        player: firstPlayer(s),
      });
      if (!villagers(s) || !u) {
        if (u) prepend(s, attack);
        return true;
      }
      choose(
        s,
        `Orc Raiders · Discard 1 villager token from Rescued Villagers, or it attacks the first player${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: "Discard 1 villager token from Rescued Villagers",
            effects: [fx("namDiscardRescued", { count: 1, player: p })],
          },
          {
            id: "attack",
            label:
              "Orc Raiders makes an immediate attack against the first player",
            effects: [attack],
          },
        ],
        card(N.raiders).text,
      );
      return true;
    }
    case "namPillaging": {
      // Pillaging Orc: "Either discard 1 villager token from Rescued
      // Villagers, or reveal an additional encounter card."
      const reveal = fx("reveal", { player: firstPlayer(s) });
      if (!villagers(s)) {
        prepend(s, reveal);
        return true;
      }
      choose(
        s,
        `Pillaging Orc · Discard 1 villager token from Rescued Villagers, or reveal an additional encounter card${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: "Discard 1 villager token from Rescued Villagers",
            effects: [fx("namDiscardRescued", { count: 1, player: p })],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [reveal],
          },
        ],
        card(N.pillaging).text,
      );
      return true;
    }
    case "namTrapped": {
      // Trapped Villagers: "Place 3 damage tokens on Dead Villagers. Until
      // the end of the round, add 1 to the total [threat] in the staging
      // area for each damage token on Dead Villagers."
      amonDinAddDead(s, 3);
      const q = (s.nightmare ??= {});
      q.trapped = {
        round: s.round,
        count: (q.trapped?.round === s.round ? q.trapped.count : 0) + 1,
      };
      log(
        s,
        `Trapped Villagers: until the end of the round, the staging area gets +1 [threat] for each damage token on Dead Villagers (${deaths(s)}).`,
        "danger",
      );
      return true;
    }
    case "namRun": {
      // Run for your Lives!: "Discard 1 villager token from Rescued
      // Villagers. Assign X damage among characters in play. X is the
      // number of damage tokens on Dead Villagers." The villager's fate
      // (Lord Alcaron may save it) resolves before X is counted.
      prepend(s, fx("namRunDamage", { player: p }));
      const r = amonDinRescued(s);
      if (r) amonDinDiscardVillagers(s, r, 1);
      return true;
    }
    case "namRunDamage":
      prepend(s, fx("namAssign", { value: deaths(s), player: p }));
      return true;
    case "namAssign": {
      const left = e.value ?? 0;
      const characters = allCharacters(s);
      if (left <= 0 || !characters.length) return true;
      choose(
        s,
        `Run for your Lives! · Assign 1 damage to a character in play (${left} left)${seatLabel(s, p)}`,
        characters.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: `${name(c)} (${c.damage} damage)`,
          effects: [
            fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
            fx("namAssign", { value: left - 1, player: p }),
          ],
        })),
        card(N.run).text,
      );
      return true;
    }
    case "namRunShadow": {
      // Run for your Lives!'s shadow: "Either discard 1 villager token from
      // Rescued Villagers, or this attack is considered undefended."
      const options: Option[] = [
        ...(villagers(s)
          ? [
              {
                id: "discard",
                label: "Discard 1 villager token from Rescued Villagers",
                effects: [fx("namDiscardRescued", { count: 1, player: p })],
              },
            ]
          : []),
        {
          id: "undefended",
          label: "This attack is considered undefended",
          effects: [fx("namUndefended", { player: p })],
        },
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Run for your Lives! · Discard 1 villager token from Rescued Villagers, or this attack is considered undefended${seatLabel(s, p)}`,
        options,
        card(N.run).shadow,
      );
      return true;
    }
    case "namUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(
          s,
          "Run for your Lives!: this attack is considered undefended.",
          "danger",
        );
      }
      return true;
    case "namSaveUs": {
      // Save Us!: "Each player must choose: either discard 2 villager tokens
      // from Rescued Villagers, or search the encounter deck and discard pile
      // for an enemy, reveal it, and add it to the staging area. Shuffle the
      // encounter deck."
      const ids = e.ids ?? [];
      if (!ids.length) return true;
      const player = Number(ids[0]);
      const rest = fx("namSaveUs", {
        ids: ids.slice(1),
        player: firstPlayer(s),
      });
      if (!playerOrder(s).includes(player)) {
        prepend(s, rest);
        return true;
      }
      const foes = enemiesIn([...s.encounterDeck, ...s.encounterDiscard]);
      const options: Option[] = [
        ...(villagers(s) >= 2
          ? [
              {
                id: "discard",
                label: "Discard 2 villager tokens from Rescued Villagers",
                effects: [
                  fx("namDiscardRescued", {
                    count: 2,
                    code: N.saveUs,
                    player,
                  }),
                  rest,
                ],
              },
            ]
          : []),
        ...foes.map((code): Option => ({
          id: `search:${code}`,
          code,
          label: `Reveal ${card(code).name} from the ${s.encounterDeck.includes(code) ? "encounter deck" : "discard pile"}`,
          effects: [fx("namSearchReveal", { code, player }), rest],
        })),
      ];
      if (!options.length) {
        shuffle(s, s.encounterDeck);
        log(s, "Save Us!: no enemy is found; the encounter deck is shuffled.");
        prepend(s, rest);
        return true;
      }
      choose(
        s,
        `Save Us! · Discard 2 villager tokens from Rescued Villagers, or reveal an enemy from the encounter deck or discard pile${seatLabel(s, player)}`,
        options,
        card(N.saveUs).text,
      );
      return true;
    }
    case "namSearchReveal": {
      const code = e.code;
      if (!code) return true;
      const deck = s.encounterDeck.indexOf(code);
      if (deck >= 0) s.encounterDeck.splice(deck, 1);
      else {
        const pile = s.encounterDiscard.lastIndexOf(code);
        if (pile < 0) return true;
        s.encounterDiscard.splice(pile, 1);
      }
      shuffle(s, s.encounterDeck);
      log(s, `Save Us!: ${card(code).name} is revealed.`, "danger");
      prepend(s, fx("revealCard", { code }));
      return true;
    }
    case "namHomesteadTravel": {
      const foes = enemiesIn(s.encounterDeck);
      if (!foes.length) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Besieged Homestead: the encounter deck holds no enemy; it is shuffled.",
        );
        return true;
      }
      choose(
        s,
        `Besieged Homestead · Search the encounter deck for an enemy, reveal it and engage it${seatLabel(s, p)}`,
        foes.map((code): Option => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("namHomesteadEnemy", { code, player: p })],
        })),
        card(N.homestead).text,
      );
      return true;
    }
    case "namHomesteadEnemy": {
      const code = e.code;
      const at = code ? s.encounterDeck.indexOf(code) : -1;
      if (!code || at < 0) return true;
      s.encounterDeck.splice(at, 1);
      shuffle(s, s.encounterDeck);
      (s.nightmare ??= {}).engageNext = code;
      log(
        s,
        `Besieged Homestead: ${card(code).name} is revealed and engages the first player.`,
        "danger",
      );
      prepend(s, fx("revealCard", { code }), fx("namEngageDone"));
      return true;
    }
    case "namEngageDone":
      // A cancelled or redirected reveal leaves no pending engagement.
      if (s.nightmare?.engageNext) delete s.nightmare.engageNext;
      return true;
    case "namSundered": {
      // Those Now Sundered: "Attach to Rescued Villagers."
      const r = amonDinRescued(s);
      if (!r) {
        s.encounterDiscard.push(N.sundered);
        return true;
      }
      r.attachments.push({
        id: `${r.id}:sundered:${s.nextId++}`,
        code: N.sundered,
        exhausted: false,
      } as Attachment);
      log(s, "Those Now Sundered attaches to Rescued Villagers.", "danger");
      return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_AMONDIN_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  damageAmount: amDamageAmount,
  questBegin: amQuestBegin,
  stagingThreat: amStagingThreat,
  locationProgressPlaced: amLocationProgressPlaced,
  engaged: amEngaged,
  travelEffects: amTravelEffects,
  cardEntered: amCardEntered,
  roundEnd: amRoundEnd,
  characterDestroyed: amCharacterDestroyed,
  attackFinished: amAttackFinished,
  encounter: amEncounter,
  shadow: amShadow,
  effect: nightmareAmonDinEffect,
  sharedEffect: (e) => e.kind.startsWith("nam"),
};

// ------------------------------------------------------------- saves

export function validNightmareAmonDin(s: GameState) {
  const q = s.nightmare;
  if (!q) return true;
  const int = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
  return (
    (q.trapped === undefined ||
      (!!q.trapped && int(q.trapped.round) && int(q.trapped.count))) &&
    (q.raiders === undefined ||
      (Array.isArray(q.raiders) &&
        q.raiders.every(
          (r) => !!r && typeof r.enemyId === "string" && int(r.player),
        ))) &&
    (q.trappedShadows === undefined ||
      (Array.isArray(q.trappedShadows) &&
        q.trappedShadows.every(
          (t) =>
            !!t &&
            typeof t.enemyId === "string" &&
            (t.killed === undefined || typeof t.killed === "boolean"),
        ))) &&
    (q.engageNext === undefined ||
      (typeof q.engageNext === "string" && isEnemy(q.engageNext)))
  );
}
