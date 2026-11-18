import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  stats,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  engage,
  exhaustCharacter,
} from "./board";
import { activeSeat, firstPlayer, forOwner, playerOrder } from "./table";
import { surgeEffects } from "./surge";
import { dealEnemyShadows } from "./considered-engagement";
import { isShipEnemy, isShipObjective } from "./ships";
import {
  HD,
  hdPhysical,
  hdPrintedBoarding,
  hdPrintedPillage,
} from "./hunt-dreadnaught-support";
import {
  charactersOf,
  corsairIntoPlay,
  dreadnaughtOf,
  enemiesInPlay,
  engagedWith,
  isDread,
  live,
  raiseFor,
  seatLabel,
  shipsOf,
  takeFrom,
  their,
  verb,
  who,
  zones,
} from "./hunt-dreadnaught-lib";

/** The treacheries the scenario resolves itself. */
export const HD_TREACHERIES: readonly string[] = [
  HD.ballista,
  HD.boardingParty,
  HD.grappled,
  HD.mist,
  HD.overworked,
  HD.water,
  HD.tempest,
];
const SHIP_UNIQUES = new Set([
  HD.eithiliant,
  HD.goldenWing,
  HD.pride,
  HD.silentMist,
  HD.swan,
  HD.twilight,
]);
const allShips = (s: GameState) =>
  playerOrder(s).flatMap((p) => shipsOf(s, p).map((u) => ({ u, p })));
const defendersOf = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};
const remaining = (s: GameState, u: Unit) => stats(s, u).health - u.damage;

// ---------------------------------------------------------------------------
// Revealed encounter cards.

export function hdEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.huntDreadnaught;
  if (!q) return false;
  const first = firstPlayer(s);
  if (code === HD.seaMonster) {
    if (!fromReveal) return false;
    prepend(s, fx("hdcSeaMonster", { player: first }));
    return true;
  }
  // Gondorian Warship: the first player chooses a player to control it.
  if (code === HD.warship) {
    if (fromReveal && !replay) prepend(s, fx("hdcWarship", { player: first }));
    return fromReveal;
  }
  // A unique ship-objective shuffled back from the discard pile stays staged.
  if (SHIP_UNIQUES.has(code)) return fromReveal;
  if (!HD_TREACHERIES.includes(code)) return false;
  const player = activeSeat(s);
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) takeFrom(s.encounterDiscard, code);
  const u = make(s, code);
  q.resolving.push(u);
  const effects: Effect[] =
    code === HD.ballista
      ? [fx("hdcBallista", { player: first })]
      : code === HD.boardingParty
        ? playerOrder(s).map((p) => fx("hdcBoardingParty", { player: p }))
        : code === HD.grappled || code === HD.water
          ? [fx("hdcAttachShip", { source: u.id, code, player: first })]
          : code === HD.mist
            ? [fx("hdcMist", { player: first })]
            : code === HD.overworked
              ? [fx("hdcOverworked", { player: first })]
              : [fx("hdcTempest", { player: first })];
  prepend(s, ...effects, fx("hdcTreacheryDone", { source: u.id, player }));
  return true;
}

// ---------------------------------------------------------------------------
// Shadow effects.

export function hdShadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.huntDreadnaught;
  if (!c || !q) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  const defenders = defendersOf(s);
  switch (code) {
    case HD.warship:
      if (enemy)
        prepend(s, fx("damage", { target: enemy.id, value: 5, player: p }));
      return true;
    case HD.blackSails:
      // An engaged Ship enemy returns to the staging area after this attack.
      if (enemy && isShipEnemy(enemy) && engagedWith(s, enemy) !== undefined)
        c.returnToStaging = true;
      return true;
    case HD.ramming:
      prepend(
        s,
        fx("hdcCorsair", { value: 1, text: "Ramming Ship", player: p }),
      );
      return true;
    case HD.shipyard:
      c.attackBonus += 1;
      c.hdPillage = (c.hdPillage ?? 0) + 3;
      return true;
    case HD.mouths:
      if (!defenders.length)
        prepend(s, fx("reveal", { player: firstPlayer(s) }));
      return true;
    case HD.tolfalas:
      prepend(
        s,
        fx("hdcThreat", {
          value: zones(s, p).hand.length >= 5 ? 3 : 1,
          text: "Tolfalas Landing",
          player: p,
        }),
      );
      return true;
    case HD.cove:
      if (enemy)
        q.cove = [
          ...q.cove.filter((m) => m.round === s.round),
          { id: enemy.id, round: s.round },
        ];
      return true;
    case HD.ballista:
      prepend(
        s,
        fx("hdcAssign", {
          count: zones(s, p).discard.length >= 10 ? 3 : 2,
          text: "Ballista Barrage",
          player: p,
        }),
      );
      return true;
    case HD.boardingParty:
      c.attackBonus += shipsOf(s, p).some((u) => u.exhausted) ? 2 : 1;
      return true;
    case HD.grappled:
    case HD.water: {
      const ship = defenders.find((u) => isShipObjective(u));
      if (ship && enemy) {
        const i = enemy.shadows.lastIndexOf(code);
        if (i >= 0) removeShadowCard(enemy, i);
        ship.attachments.push({
          id: `a${s.nextId++}`,
          code,
          exhausted: false,
        } as Attachment);
        log(s, `${card(code).name} is attached to ${name(ship)}.`, "danger");
      }
      return true;
    }
    case HD.mist:
      prepend(s, fx("hdcMistShadow", { target: enemy?.id, player: p }));
      return true;
    case HD.overworked:
      c.attackBonus += zones(s, p).allies.length >= 7 ? 3 : 1;
      return true;
    case HD.tempest: {
      const d = defenders[0];
      if (d) prepend(s, fx("damage", { target: d.id, value: 1, player: p }));
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Keywords and enemies: Boarding, Pillage and the attacks that follow.

/** After an enemy engages a player (from the staging area or put into play engaged). */
export function hdEngaged(s: GameState, u: Unit, fromStaging: boolean) {
  const q = s.huntDreadnaught;
  if (!q || u.blanked) return;
  const p = activeSeat(s);
  const effects: Effect[] = [];
  if (fromStaging) {
    // Corsair Skiff and War Galley: "When ... engages you from the staging area".
    if (live(u, HD.skiff))
      effects.push(fx("hdcGainChoice", { target: u.id, value: 3, player: p }));
    if (live(u, HD.galley))
      effects.push(fx("hdcGainChoice", { target: u.id, value: 4, player: p }));
    if (isShipEnemy(u))
      effects.push(fx("hdcBoard", { target: u.id, player: p }));
  }
  if (live(u, HD.ramming))
    effects.push(fx("hdcRamming", { target: u.id, player: p }));
  if (live(u, HD.descendant))
    effects.push(fx("hdcDescendant", { target: u.id, player: p }));
  prepend(s, ...effects);
}
/** The Boarding value of a Ship enemy now (Cobas Haven reduces it while active). */
export function boardingValue(s: GameState, u: Unit) {
  const q = s.huntDreadnaught!;
  const gained = q.boarding
    .filter((b) => b.id === u.id)
    .reduce((n, b) => n + b.value, 0);
  const printed = u.blanked ? 0 : hdPrintedBoarding(u.code);
  if (printed + gained <= 0) return 0;
  const cobas = s.activeLocation && live(s.activeLocation, HD.cobas) ? 1 : 0;
  return Math.max(0, printed + gained - cobas);
}
/** After an attack: Pillage, Commander of the Dreadnaught and Hydraken. */
export function hdAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
): Effect[] {
  const q = s.huntDreadnaught;
  if (!q) return [];
  const enemy = get(s, combat.enemyId);
  if (!enemy) return [];
  const p = combat.attackPlayer ?? activeSeat(s);
  const effects: Effect[] = [];
  const pillage =
    (enemy.blanked ? 0 : hdPrintedPillage(enemy.code)) +
    (combat.hdPillage ?? 0);
  if (pillage > 0)
    effects.push(
      fx("hdcPillage", {
        target: enemy.id,
        code: enemy.code,
        value: pillage,
        player: p,
      }),
    );
  if (live(enemy, HD.commander) && dreadnaughtOf(s))
    effects.push(fx("hdcCommander", { target: enemy.id, player: p }));
  if (live(enemy, HD.hydraken) && q.hydraken !== s.round)
    effects.push(fx("hdcHydraken", { target: enemy.id, player: p }));
  return effects;
}

// ---------------------------------------------------------------------------
// Effects.

export const HD_CARD_SHARED = [
  "hdcTreacheryDone",
  "hdcBallista",
  "hdcOverworked",
  "hdcMist",
  "hdcTempest",
  "hdcSeaMonster",
  "hdcWarship",
  "hdcAttachShip",
  "hdcShipyard",
  "hdcIsle",
];
export function hdCardEffect(s: GameState, e: Effect): boolean {
  const q = s.huntDreadnaught;
  if (!q) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "hdcThreat":
      raiseFor(s, p, e.value ?? 0);
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${their(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    // Assign X damage among characters you control (non-Ship ones only with flag).
    case "hdcAssign": {
      const left = e.count ?? 0;
      const targets = charactersOf(s, p).filter(
        (u) => !e.flag || !isShipObjective(u),
      );
      if (left <= 0 || !targets.length) return true;
      choose(
        s,
        `${e.text} · Assign 1 damage (${left} left) to a ${e.flag ? "non-Ship " : ""}character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${remaining(s, u)} hit points left)`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("hdcAssign", {
              count: left - 1,
              flag: e.flag,
              text: e.text,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    // Varjax: 1 damage to a Ship you control for each excess point.
    case "hdcShipDamage": {
      const left = e.count ?? 0;
      const ships = shipsOf(s, p);
      if (left <= 0 || !ships.length) return true;
      choose(
        s,
        `${e.text} · Deal 1 damage (${left} left) to a Ship you control${seatLabel(s, p)}`,
        ships.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${remaining(s, u)} hit points left)`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("hdcShipDamage", { count: left - 1, text: e.text, player: p }),
          ],
        })),
      );
      return true;
    }
    case "hdcEasyDraw":
      draw(s, 1, false);
      log(s, `Easy Mode: ${who(s, p)} ${verb(s, "draw")} 1 additional card.`);
      return true;
    case "hdcExtraShadows": {
      const u = get(s, e.target);
      if (u) dealEnemyShadows(s, u, e.count ?? 0);
      return true;
    }
    case "hdcCancelOffer": {
      const u = get(s, e.target);
      if (!u) return true;
      choose(
        s,
        `Destroy the Dreadnaught · Response: raise your threat by 4 to cancel the Dreadnaught's attack?${seatLabel(s, p)}`,
        [
          {
            id: "cancel",
            code: u.code,
            label: "Raise your threat by 4 to cancel the attack",
            effects: [fx("hdCancelImmediate", { target: u.id, player: p })],
          },
          { id: "allow", label: "Let the Dreadnaught attack", effects: [] },
        ],
      );
      return true;
    }
    case "hdcTreacheryDone": {
      const i = q.resolving.findIndex((u) => u.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "hdcExhaustForCondition": {
      const ship = get(s, e.target);
      const left = e.count ?? 0;
      if (!ship) return true;
      if (left <= 0) {
        const a = ship.attachments.find((x) => x.id === e.source);
        if (a) discardAttachment(s, ship, a, false, false);
        return true;
      }
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${card(ship.attachments.find((x) => x.id === e.source)?.code ?? HD.grappled).name} · Exhaust a character (${left} left)${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [
            fx("hdcExhaust", { target: u.id, player: p }),
            fx("hdcExhaustForCondition", {
              target: ship.id,
              source: e.source,
              count: left - 1,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "hdcExhaust": {
      const u = get(s, e.target);
      if (u && !u.exhausted) exhaustCharacter(s, u);
      return true;
    }
    // Sea Monster: 4 damage to the Ship with the fewest remaining hit points.
    case "hdcSeaMonster": {
      const ships = [
        ...enemiesInPlay(s).filter((u) => isShipEnemy(u)),
        ...allShips(s).map(({ u }) => u),
      ];
      if (!ships.length) return true;
      const fewest = Math.min(...ships.map((u) => remaining(s, u)));
      const tied = ships.filter((u) => remaining(s, u) === fewest);
      if (tied.length === 1) {
        prepend(
          s,
          fx("damage", { target: tied[0].id, value: 4, player: first }),
        );
        log(s, `Sea Monster: 4 damage to ${name(tied[0])}.`, "danger");
        return true;
      }
      choose(
        s,
        `Sea Monster · Deal 4 damage to the Ship with the fewest remaining hit points${seatLabel(s, first)}`,
        tied.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Deal 4 damage to ${name(u)} (${remaining(s, u)} hit points left)`,
          effects: [fx("damage", { target: u.id, value: 4, player: first })],
        })),
      );
      return true;
    }
    // Gondorian Warship: a player gains control of it.
    case "hdcWarship": {
      const u = [...s.staging].reverse().find((x) => x.code === HD.warship);
      if (!u) return true;
      const players = playerOrder(s);
      if (players.length === 1) {
        prepend(s, fx("hdcTakeWarship", { target: u.id, player: players[0] }));
        return true;
      }
      choose(
        s,
        `Gondorian Warship · Choose a player to gain control of it${seatLabel(s, first)}`,
        players.map((o) => ({
          id: String(o),
          label: `${who(s, o)} ${verb(s, "gain")} control of Gondorian Warship`,
          effects: [fx("hdcTakeWarship", { target: u.id, player: o })],
        })),
      );
      return true;
    }
    case "hdcTakeWarship": {
      const u = s.staging.find((x) => x.id === e.target);
      if (!u) return true;
      s.staging = s.staging.filter((x) => x.id !== u.id);
      u.owner = p;
      u.controller = p;
      s.allies.push(u);
      log(
        s,
        `${who(s, p)} ${verb(s, "gain")} control of Gondorian Warship.`,
        "good",
      );
      return true;
    }
    // Grappled! and Taking on Water attach to a Ship objective.
    case "hdcAttachShip": {
      const ships = allShips(s);
      if (!ships.length) return true;
      choose(
        s,
        `${card(e.code!).name} · Attach to a Ship objective${seatLabel(s, first)}`,
        ships.map(({ u, p: owner }) => ({
          id: u.id,
          code: u.code,
          label: `Attach to ${name(u)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [fx("hdcAttachHeld", { target: u.id, source: e.source })],
        })),
      );
      return true;
    }
    case "hdcAttachHeld": {
      const host = get(s, e.target);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!host || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      host.attachments.push({
        id: held.id,
        code: held.code,
        exhausted: false,
      } as Attachment);
      log(s, `${card(held.code).name} is attached to ${name(host)}.`, "danger");
      return true;
    }
    case "hdcBallista":
      q.ballista =
        q.ballista?.round === s.round
          ? { round: s.round, count: q.ballista.count + 1 }
          : { round: s.round, count: 1 };
      log(
        s,
        "Ballista Barrage: until the end of the round, each Ship enemy gains Archery 2.",
        "danger",
      );
      return true;
    case "hdcBoardingParty":
      corsairIntoPlay(s, p, 0, "Boarding Party");
      return true;
    case "hdcCorsair":
      corsairIntoPlay(s, p, e.value ?? 0, e.text ?? "Corsair");
      return true;
    // Out of the Mist: the enemy with the highest engagement cost engages the first player and attacks.
    case "hdcMist": {
      const enemies = enemiesInPlay(s);
      if (!enemies.length) {
        log(s, "Out of the Mist: no attack is made, so it gains surge.");
        prepend(s, ...surgeEffects(HD.mist));
        return true;
      }
      const top = Math.max(...enemies.map((u) => engagementCost(s, u)));
      const tied = enemies.filter((u) => engagementCost(s, u) === top);
      if (tied.length === 1) {
        prepend(s, fx("hdcMistEngage", { target: tied[0].id, player: first }));
        return true;
      }
      choose(
        s,
        `Out of the Mist · Choose the enemy with the highest engagement cost${seatLabel(s, first)}`,
        tied.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (engagement cost ${top}) engages ${who(s, first)} and attacks`,
          effects: [fx("hdcMistEngage", { target: u.id, player: first })],
        })),
      );
      return true;
    }
    case "hdcMistEngage": {
      const u = get(s, e.target);
      if (!u) return true;
      if (!isDread(u) && engagedWith(s, u) !== p) engage(s, u);
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      log(s, `Out of the Mist: ${name(u)} attacks ${who(s, p)}.`, "danger");
      return true;
    }
    case "hdcMistShadow": {
      const u = get(s, e.target);
      choose(
        s,
        `Out of the Mist · Shadow: raise your threat by 4, or the attacking enemy makes an additional attack${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 4",
            effects: [
              fx("hdcThreat", { value: 4, text: "Out of the Mist", player: p }),
            ],
          },
          ...(u
            ? [
                {
                  id: "attack",
                  code: u.code,
                  label: `${name(u)} makes an additional attack`,
                  effects: [
                    fx("hdcAdditionalAttack", { target: u.id, player: p }),
                  ],
                },
              ]
            : []),
        ],
      );
      return true;
    }
    case "hdcAdditionalAttack":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      return true;
    case "hdcOverworked":
      q.overworked = s.round;
      log(
        s,
        "Overworked: until the end of the round, each non-Ship ally's text box is blank, except for Traits.",
        "danger",
      );
      if (playerOrder(s).some((o) => zones(s, o).allies.length >= 7)) {
        log(
          s,
          "Overworked: a player controls 7 or more allies, so it gains surge.",
        );
        prepend(s, ...surgeEffects(HD.overworked));
      }
      return true;
    case "hdcTempest": {
      for (const u of enemiesInPlay(s))
        prepend(s, fx("damage", { target: u.id, value: 1, player: first }));
      prepend(
        s,
        ...playerOrder(s).map((o) =>
          fx("hdcAssign", {
            count: charactersOf(s, o).filter((u) => u.exhausted).length,
            text: "Violent Tempest",
            player: o,
          }),
        ),
      );
      log(
        s,
        "Violent Tempest: 1 damage to each enemy; each player assigns 1 damage for each exhausted character they control.",
        "danger",
      );
      return true;
    }
    // Corsair Skiff and War Galley: raise your threat or it gains Boarding 1.
    case "hdcGainChoice": {
      const u = get(s, e.target);
      if (!u) return true;
      choose(
        s,
        `${name(u)} · Raise your threat by ${e.value} or it gains Boarding 1${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise your threat by ${e.value}`,
            effects: [
              fx("hdcThreat", { value: e.value, text: name(u), player: p }),
            ],
          },
          {
            id: "boarding",
            code: u.code,
            label: `${name(u)} gains Boarding 1`,
            effects: [fx("hdcGainBoarding", { target: u.id, player: p })],
          },
        ],
      );
      return true;
    }
    case "hdcGainBoarding":
      q.boarding.push({ id: e.target!, value: 1 });
      return true;
    // Boarding X: put the top X cards of the Corsair deck into play engaged.
    case "hdcBoard": {
      const u = get(s, e.target);
      if (!u || !isShipEnemy(u)) return true;
      const x = boardingValue(s, u);
      if (x <= 0) return true;
      log(s, `${name(u)} · Boarding ${x}.`, "danger");
      for (let i = 0; i < x; i++)
        corsairIntoPlay(s, p, 0, `${name(u)} (Boarding)`);
      return true;
    }
    case "hdcRamming":
      q.ramming = [
        ...q.ramming.filter((m) => m.round === s.round),
        { id: e.target!, round: s.round },
      ];
      log(
        s,
        "Ramming Ship gets +4 attack until the end of the round.",
        "danger",
      );
      return true;
    case "hdcDescendant":
      for (let i = 0; i < 2; i++)
        corsairIntoPlay(s, p, 1, "Descendant of Castamir");
      return true;
    // Pillage X: the attacked player discards the top X cards of their deck.
    case "hdcPillage": {
      const x = e.value ?? 0;
      const discarded: string[] = [];
      forOwner(s, p, () => {
        for (let i = 0; i < x && s.deck.length; i++) {
          const c = s.deck.shift()!;
          s.discard.push(c);
          discarded.push(c);
        }
      });
      log(
        s,
        `Pillage ${x}: ${who(s, p)} ${verb(s, "discard")} the top ${x} cards of ${their(s)} deck${discarded.length ? ` (${discarded.map((c) => card(c).name).join(", ")})` : ""}.`,
        "danger",
      );
      const events = discarded.filter(
        (c) => card(c).type_code === "event",
      ).length;
      const followUp =
        e.code === HD.plunderer
          ? "hdcPlundererDiscard"
          : e.code === HD.buccaneer
            ? "hdcBuccaneerDamage"
            : e.code === HD.marauder
              ? "hdcMarauderResource"
              : undefined;
      if (followUp && events)
        prepend(
          s,
          ...Array.from({ length: events }, () => fx(followUp, { player: p })),
        );
      return true;
    }
    case "hdcPlundererDiscard": {
      const owned = charactersOf(s, p).flatMap((u) =>
        u.attachments
          .filter(
            (a) =>
              card(a.code).type_code === "attachment" &&
              (a.controller ?? a.owner ?? p) === p,
          )
          .map((a) => ({ u, a })),
      );
      if (!owned.length) return true;
      choose(
        s,
        `Corsair Plunderer · Discard an attachment you control${seatLabel(s, p)}`,
        owned.map(({ u, a }) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${card(a.code).name} (on ${name(u)})`,
          effects: [
            fx("hdcDiscardAttachment", {
              target: u.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "hdcDiscardAttachment": {
      const u = get(s, e.target);
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      return true;
    }
    case "hdcBuccaneerDamage":
      prepend(
        s,
        fx("hdcAssign", { count: 1, text: "Daring Buccaneer", player: p }),
      );
      return true;
    case "hdcMarauderResource": {
      const heroes = zones(s, p).heroes.filter((h) => h.resources > 0);
      if (!heroes.length) return true;
      choose(
        s,
        `Fierce Marauder · Discard 1 resource from a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `Discard 1 resource from ${name(h)} (${h.resources})`,
          effects: [fx("hdcLoseResource", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "hdcLoseResource": {
      const h = get(s, e.target);
      if (h && h.resources > 0) h.resources -= 1;
      return true;
    }
    // Commander of the Dreadnaught: the Dreadnaught attacks you.
    case "hdcCommander": {
      const dread = dreadnaughtOf(s);
      if (!dread || s.table?.seats[p]?.eliminated) return true;
      log(
        s,
        "Commander of the Dreadnaught: the Dreadnaught attacks.",
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: dread.id, player: p }));
      return true;
    }
    // Hydraken: an additional attack with 2 shadow cards; its player raises their threat by 4.
    case "hdcHydraken": {
      const u = get(s, e.target);
      if (!u || engagedWith(s, u) === undefined) return true;
      q.hydraken = s.round;
      raiseFor(s, p, 4);
      q.extraShadows.push({ id: u.id, count: 2 });
      log(
        s,
        `Hydraken makes an additional attack with 2 shadow cards; ${who(s, p)} ${verb(s, "raise")} ${their(s)} threat by 4.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", { target: u.id, player: p, noShadow: true }),
      );
      return true;
    }
    // Belfalas Shipyard: the players spend 5 resources to repair and upgrade a ship.
    case "hdcShipyard": {
      const pool = playerOrder(s).reduce(
        (n, o) => n + zones(s, o).heroes.reduce((m, h) => m + h.resources, 0),
        0,
      );
      const ships = allShips(s);
      if (pool < 5 || !ships.length) return true;
      choose(
        s,
        `Belfalas Shipyard · Response: spend 5 resources as a group to heal 5 damage from a Ship, ready it and flip it to its Upgraded side?${seatLabel(s, first)}`,
        [
          ...ships.map(({ u, p: owner }) => ({
            id: u.id,
            code: u.code,
            label: `Repair ${name(u)}${s.table ? ` (${who(s, owner)})` : ""}${u.code.endsWith(":B") || !SHIP_UNIQUES.has(hdPhysical(u.code)) ? "" : " and flip it"}`,
            effects: [
              fx("hdcGroupPay", { value: 5, target: u.id, player: first }),
            ],
          })),
          { id: "skip", label: "Do not use the Response", effects: [] },
        ],
      );
      return true;
    }
    case "hdcGroupPay": {
      const left = e.value ?? 0;
      if (left <= 0) {
        prepend(s, fx("hdFlip", { target: e.target, player: first }));
        return true;
      }
      const payers = playerOrder(s).flatMap((o) =>
        zones(s, o)
          .heroes.filter((h) => h.resources > 0)
          .map((h) => ({ h, o })),
      );
      if (!payers.length) return true;
      choose(
        s,
        `Belfalas Shipyard · Spend a resource (${left} left)${seatLabel(s, first)}`,
        payers.map(({ h, o }) => ({
          id: h.id,
          code: h.code,
          label: `Spend 1 resource from ${name(h)} (${h.resources})${s.table ? ` · ${who(s, o)}` : ""}`,
          effects: [
            fx("hdcLoseResource", { target: h.id, player: o }),
            fx("hdcGroupPay", {
              value: left - 1,
              target: e.target,
              player: first,
            }),
          ],
        })),
      );
      return true;
    }
    // Isle of Fortune: each resource on it moves to a hero's resource pool.
    case "hdcIsle": {
      const left = e.count ?? 0;
      const heroes = playerOrder(s).flatMap((o) =>
        zones(s, o).heroes.map((h) => ({ h, o })),
      );
      if (left <= 0 || !heroes.length) return true;
      choose(
        s,
        `Isle of Fortune · Move a resource to a hero's resource pool (${left} left)${seatLabel(s, first)}`,
        heroes.map(({ h, o }) => ({
          id: h.id,
          code: h.code,
          label: `Move 1 resource to ${name(h)}${s.table ? ` · ${who(s, o)}` : ""}`,
          effects: [
            fx("hdResources", { target: h.id, value: 1, player: o }),
            fx("hdcIsle", { count: left - 1, player: first }),
          ],
        })),
      );
      return true;
    }
    case "hdDiscardAlly": {
      const u = get(s, e.target);
      if (u) discardCharacter(s, u);
      return true;
    }
  }
  return false;
}
