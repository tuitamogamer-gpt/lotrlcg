/**
 * The Blood of Gondor's Nightmare Deck (docs/NIGHTMARE.md): its setup card's
 * rules (a hidden card for each player at setup; no victory unless The
 * Cross-roads and Black Númenorean are in the victory display) and its
 * Nightmare encounter cards, composed with the scenario's own rules
 * (src/game/blood-gondor.ts) through batch4Scenario while a Nightmare mode
 * game is played. The scenario's hidden-card effects ("bloodTake",
 * "bloodTurn", "bloodTurnAll") do the taking and turning. Effects use the
 * "nbg" prefix.
 */
import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, log, prepend, random } from "./core";
import { discardAttachment, removeFromQuest } from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { NIGHTMARE_AS as N, nightmareLive } from "./nightmare";
import {
  NEUTRAL_LAYER,
  defendingPlayer,
  live,
  seatLabel,
} from "./nightmare-core";
import { BLOOD_GONDOR as B } from "./blood-gondor-support";

type Combat = NonNullable<GameState["combat"]>;

export interface NightmareBloodState {
  /** Edge of Ithilien's shadow: a turned treachery gives the attacking enemy an additional attack. */
  edgeAttacks?: { enemyId: string; player: number }[];
}

const bgLive = (s: GameState) =>
  nightmareLive(s) && s.scenarioId === "the-blood-of-gondor";
const hidden = (s: GameState, p: number) => s.bloodGondor?.hidden[p] ?? [];
const allHidden = (s: GameState) =>
  Object.values(s.bloodGondor?.hidden ?? {}).flat().length;
const inPlay = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
  ...allEngaged(s),
];
const numenoreanLive = (s: GameState) =>
  inPlay(s).some((u) => live(s, u, N.numenorean));
/** A blind choice among a player's hidden cards (their identities stay private). */
const hiddenOptions = (
  s: GameState,
  p: number,
  then: (u: Unit) => Effect[],
): Option[] =>
  hidden(s, p).map((u, i) => ({
    id: u.id,
    label: `Hidden card ${i + 1}`,
    effects: then(u),
  }));

// ------------------------------------------------------------- the setup card

/** "The players cannot win the game unless The Crossroads and Black Númenorean are in the victory display." */
const bgCannotWin = (s: GameState) =>
  bgLive(s) &&
  !(
    (s.victoryCards ?? []).includes(B.crossroads) &&
    (s.victoryCards ?? []).some((c) => c === N.numenorean || c === B.numenorean)
  );

// ------------------------------------------------------------- the cards

/** Black Númenorean: "X is the total number of hidden cards in the game." */
const bgThreatBonus = (s: GameState, u: Unit) =>
  bgLive(s) && live(s, u, N.numenorean) ? allHidden(s) : 0;
/** Edge of Ithilien: "Archery X. X is the highest number of hidden cards in any player's play area." Uruk Marksman: "Archery 3." */
function bgArcheryBonus(s: GameState) {
  if (!bgLive(s)) return 0;
  const edges = [...s.staging, ...allActiveLocations(s)].filter((u) =>
    live(s, u, N.edge),
  ).length;
  const high = Math.max(0, ...playerOrder(s).map((p) => hidden(s, p).length));
  // Uruk Marksman: "Archery 3."
  const marksmen = inPlay(s).filter((u) => live(s, u, N.marksman)).length;
  return edges * high + 3 * marksmen;
}
/** Black Númenorean: "Forced: When Black Númenorean engages you, turn all hidden cards in your play area faceup." */
function bgEngaged(s: GameState, u: Unit) {
  if (!bgLive(s) || !live(s, u, N.numenorean)) return;
  prepend(s, fx("bloodTurnAll", { player: activeSeat(s) }));
}
/** Black Númenorean: "Forced: At the end of the round, each player must raise his threat by 1 for each hidden card in his play area." */
const bgRoundEnd = (s: GameState): Effect[] =>
  bgLive(s) && numenoreanLive(s)
    ? playerOrder(s).map((player) =>
        fx("heirsThreat", { value: hidden(s, player).length, player }),
      )
    : [];
/**
 * After a hidden card is turned faceup: Orc Trickster's immediate attack,
 * Uruk Marksman's 3 damage and return, and Mountains of Shadow's hidden card
 * (once for each turning of 1 or more cards).
 */
function bgHiddenCardTurned(s: GameState, u: Unit, player: number) {
  if (!bgLive(s)) return;
  const effects: Effect[] = [];
  const engaged = allEngaged(s).some((x) => x.id === u.id);
  // Orc Trickster: "Forced: After Orc Trickster is turned faceup as a
  // hidden card, it makes an immediate attack against the engaged player."
  if (u.code === N.trickster && engaged && !u.blanked)
    effects.push(fx("immediateAttack", { target: u.id, player }));
  // Uruk Marksman: "Forced: After Uruk Marksman is turned faceup as a hidden
  // card, deal 3 damage to a character controlled by the engaged player and
  // return Uruk Marksman to the staging area."
  if (u.code === N.marksman && engaged && !u.blanked)
    effects.push(fx("nbgMarksman", { target: u.id, player }));
  // Mountains of Shadow, while active: "Forced: After you turn 1 or more
  // hidden cards faceup, take 1 hidden card." The last card of a turning
  // takes it.
  const batch = s.queue.some(
    (e) =>
      (e.kind === "bloodTurn" || e.kind === "bloodFaceup") &&
      (e.player ?? activeSeat(s)) === player,
  );
  if (!batch)
    for (const l of allActiveLocations(s).filter((x) =>
      live(s, x, N.mountains),
    ))
      effects.push(fx("bloodTake", { player, code: l.code }));
  prepend(s, ...effects);
}
/** Orc Trickster: "Forced: When Orc Trickster would be damaged, a random player takes it facedown as a hidden card in his play area instead." */
function bgReplaceDamage(
  s: GameState,
  u: Unit,
  value: number,
  _context: DamageContext,
) {
  if (!bgLive(s) || value <= 0 || !live(s, u, N.trickster) || !s.bloodGondor)
    return false;
  const players = playerOrder(s);
  const player = players[Math.floor(random(s) * players.length)];
  // Its attachments go to their owners' discard piles as it leaves play.
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.staging = s.staging.filter((x) => x.id !== u.id);
  for (const p of players)
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  s.encounterDiscard.push(...u.shadows);
  Object.assign(u, {
    damage: 0,
    progress: 0,
    resources: 0,
    exhausted: false,
    attachments: [],
    shadows: [],
  });
  delete u.faceupShadows;
  delete u.owner;
  (s.bloodGondor.hidden[player] ??= []).push(u);
  log(
    s,
    `Orc Trickster would be damaged: ${seatLabel(s, player) ? `Player ${player + 1}` : "you"} take${seatLabel(s, player) ? "s" : ""} it facedown as a hidden card instead.`,
    "danger",
  );
  return true;
}

function bgEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!bgLive(s) || (code !== N.surrounded && code !== N.onslaught))
    return false;
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  s.encounterDiscard.push(code);
  if (!fromReveal) return true;
  if (code === N.surrounded)
    prepend(
      s,
      fx("nbgSurrounded", {
        ids: playerOrder(s).map(String),
        player: firstPlayer(s),
      }),
    );
  else {
    // Sudden Onslaught: "Each player turns each hidden card in his play area
    // faceup. Each player then takes hidden cards equal to the number of
    // hidden cards he just turned faceup."
    const counts = playerOrder(s).map((p) => [p, hidden(s, p).length]);
    prepend(
      s,
      ...counts.map(([player]) => fx("bloodTurnAll", { player })),
      ...counts
        .filter(([, n]) => n > 0)
        .map(([player, count]) => fx("bloodTake", { player, count })),
    );
  }
  return true;
}

function bgShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !bgLive(s)) return false;
  const p = defendingPlayer(s);
  switch (code) {
    // Edge of Ithilien: "Turn 1 hidden card in your play area faceup. If it
    // is a treachery card, attacking enemy makes an additional attack after
    // this one."
    case N.edge:
      prepend(s, fx("nbgEdge", { target: c.enemyId, player: p }));
      return true;
    // Mountains of Shadow: "Either take 2 hidden cards, or this attack is
    // considered undefended."
    case N.mountains:
      choose(
        s,
        `Mountains of Shadow · Take 2 hidden cards, or this attack is considered undefended${seatLabel(s, p)}`,
        [
          {
            id: "take",
            label: "Take 2 hidden cards",
            effects: [fx("bloodTake", { player: p, count: 2 })],
          },
          {
            id: "undefended",
            label: "This attack is considered undefended",
            effects: [fx("nbgUndefended", { player: p })],
          },
        ],
        card(N.mountains).shadow,
      );
      return true;
    // Sudden Onslaught: "Take 1 hidden card. Then, turn 1 hidden card in your
    // play area faceup."
    case N.onslaught:
      prepend(
        s,
        fx("bloodTake", { player: p }),
        fx("nbgTurnOne", { player: p }),
      );
      return true;
  }
  return false;
}
function bgAttackFinished(s: GameState, combat: Combat): Effect[] {
  const q = s.nightmare;
  const again = (q?.edgeAttacks ?? []).filter(
    (m) => m.enemyId === combat.enemyId,
  );
  if (!again.length) return [];
  q!.edgeAttacks = q!.edgeAttacks!.filter((m) => m.enemyId !== combat.enemyId);
  if (!q!.edgeAttacks.length) delete q!.edgeAttacks;
  return again.map((m) =>
    fx("immediateAttack", { target: m.enemyId, player: m.player }),
  );
}

// ------------------------------------------------------------- effects

export function nightmareBloodEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("nbg")) return false;
  const p = e.player ?? firstPlayer(s);
  switch (e.kind) {
    case "nbgMarksman": {
      const marksman = allEngaged(s).find((u) => u.id === e.target);
      const characters = [...seatView(s, p).heroes, ...seatView(s, p).allies];
      prepend(s, fx("nbgReturn", { target: e.target, player: p }));
      if (!characters.length) return true;
      choose(
        s,
        `Uruk Marksman · Deal 3 damage to a character you control${seatLabel(s, p)}`,
        characters.map((c): Option => ({
          id: c.id,
          code: c.code,
          label: `${name(c)} (${c.damage} damage)`,
          effects: [fx("damage", { target: c.id, value: 3, player: p })],
        })),
        marksman ? card(marksman.code).text : undefined,
      );
      return true;
    }
    case "nbgReturn": {
      const u = allEngaged(s).find((x) => x.id === e.target);
      if (!u) return true;
      forOwner(s, ownerOf(s, u), () => {
        s.engaged = s.engaged.filter((x) => x.id !== u.id);
      });
      s.staging.push(u);
      log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
    case "nbgSurrounded": {
      // Surrounded by Shadow: "Each player must either take 1 hidden card
      // for each questing hero he controls, or remove one hero he controls
      // from the quest for each hidden card in his play area."
      const ids = e.ids ?? [];
      if (!ids.length) return true;
      const player = Number(ids[0]);
      const rest = fx("nbgSurrounded", {
        ids: ids.slice(1),
        player: firstPlayer(s),
      });
      if (!playerOrder(s).includes(player)) {
        prepend(s, rest);
        return true;
      }
      const questing = seatView(s, player).heroes.filter((h) => h.committed);
      const count = hidden(s, player).length;
      choose(
        s,
        `Surrounded by Shadow · Take ${questing.length} hidden card${questing.length === 1 ? "" : "s"}, or remove ${Math.min(count, questing.length)} questing hero${Math.min(count, questing.length) === 1 ? "" : "es"} from the quest${seatLabel(s, player)}`,
        [
          {
            id: "take",
            label: `Take ${questing.length} hidden card${questing.length === 1 ? "" : "s"}`,
            effects: [
              ...(questing.length
                ? [fx("bloodTake", { player, count: questing.length })]
                : []),
              rest,
            ],
          },
          {
            id: "remove",
            label: `Remove ${Math.min(count, questing.length)} hero${Math.min(count, questing.length) === 1 ? "" : "es"} from the quest`,
            effects: [fx("nbgRemoveHeroes", { value: count, player }), rest],
          },
        ],
        card(N.surrounded).text,
      );
      return true;
    }
    case "nbgRemoveHeroes": {
      const left = e.value ?? 0;
      const questing = seatView(s, p).heroes.filter((h) => h.committed);
      if (left <= 0 || !questing.length) return true;
      if (questing.length <= left) {
        for (const h of questing) forOwner(s, p, () => removeFromQuest(s, h));
        log(
          s,
          `Surrounded by Shadow: ${questing.map((h) => name(h)).join(", ")} ${questing.length === 1 ? "is" : "are"} removed from the quest.`,
          "danger",
        );
        return true;
      }
      choose(
        s,
        `Surrounded by Shadow · Remove a hero you control from the quest (${left} left)${seatLabel(s, p)}`,
        questing.map((h): Option => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("nbgRemoveHero", { target: h.id, player: p }),
            fx("nbgRemoveHeroes", { value: left - 1, player: p }),
          ],
        })),
      );
      return true;
    }
    case "nbgRemoveHero": {
      const h = seatView(s, p).heroes.find((x) => x.id === e.target);
      if (h?.committed) {
        forOwner(s, p, () => removeFromQuest(s, h));
        log(s, `Surrounded by Shadow: ${name(h)} is removed from the quest.`);
      }
      return true;
    }
    case "nbgTurnOne": {
      // Turn 1 hidden card in your play area faceup (a blind choice).
      const options = hiddenOptions(s, p, (u) => [
        fx("bloodTurn", { player: p, target: u.id }),
      ]);
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Turn 1 hidden card in your play area faceup${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "nbgEdge": {
      // Edge of Ithilien's shadow: the turned card, if a treachery, gives an
      // additional attack.
      const options = hiddenOptions(s, p, (u) => [
        fx("bloodTurn", { player: p, target: u.id }),
        fx("nbgEdgeAfter", { target: e.target, code: u.code, player: p }),
      ]);
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Edge of Ithilien · Turn 1 hidden card in your play area faceup${seatLabel(s, p)}`,
        options,
        card(N.edge).shadow,
      );
      return true;
    }
    case "nbgEdgeAfter":
      if (e.code && card(e.code).type_code === "treachery" && e.target) {
        const q = (s.nightmare ??= {});
        q.edgeAttacks = [
          ...(q.edgeAttacks ?? []),
          { enemyId: e.target, player: p },
        ];
        log(
          s,
          "Edge of Ithilien: a treachery was turned faceup, so the attacking enemy makes an additional attack after this one.",
          "danger",
        );
      }
      return true;
    case "nbgUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(
          s,
          "Mountains of Shadow: this attack is considered undefended.",
          "danger",
        );
      }
      return true;
  }
  return false;
}

// ------------------------------------------------------------- hooks

export const NIGHTMARE_BLOOD_HOOKS: Batch4ScenarioHooks = {
  ...NEUTRAL_LAYER,
  cannotWin: bgCannotWin,
  threatBonus: bgThreatBonus,
  archeryBonus: bgArcheryBonus,
  engaged: bgEngaged,
  roundEnd: bgRoundEnd,
  hiddenCardTurned: bgHiddenCardTurned,
  replaceDamage: bgReplaceDamage,
  encounter: bgEncounter,
  shadow: bgShadow,
  attackFinished: bgAttackFinished,
  effect: nightmareBloodEffect,
  sharedEffect: (e) => e.kind.startsWith("nbg"),
};

// ------------------------------------------------------------- saves

export function validNightmareBlood(s: GameState) {
  const a = s.nightmare?.edgeAttacks;
  return (
    a === undefined ||
    (Array.isArray(a) &&
      a.every(
        (m) =>
          !!m &&
          typeof m.enemyId === "string" &&
          Number.isInteger(m.player) &&
          m.player >= 0,
      ))
  );
}
