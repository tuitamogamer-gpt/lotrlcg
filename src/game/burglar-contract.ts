import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  globalUnits,
  log,
  make,
  prepend,
  requireRule,
  shuffle,
} from "./core";
import {
  activeSeat,
  allActiveLocations,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
} from "./table";
import {
  effectCardPlayProblem,
  playTargets,
  resolvePlayerCard,
} from "./actions";
import { playerEffectImmune } from "./player-effect-immunity";
import { batch4Scenario } from "./batch4-scenarios";
import { progressLocation } from "./board";
import {
  BURGLAR_CONTRACT as B,
  burglarDeckProblems,
  burglarGuardedObjective,
} from "./burglar-contract-support";

const state = (s: GameState) => s.burglarContract;
const contractPlayers = (s: GameState) =>
  playerOrder(s).filter((player) =>
    state(s)?.contracts.some((c) => c.player === player),
  );
const ordinaryGuarded = (a: Attachment) =>
  card(a.code).type_code === "attachment" &&
  /Guarded\s*\(/i.test(card(a.code).text ?? "");
const host = (s: GameState, id: string | undefined) =>
  get(s, id) ?? s.wrathRuin?.pendingExplored.find((u) => u.id === id);
const order = (s: GameState, effects: Effect[], title: string) => {
  if (effects.length > 1)
    prepend(
      s,
      fx("fangornOrder", { effects, text: title, player: firstPlayer(s) }),
    );
  else prepend(s, ...effects);
};
function asUnit(s: GameState, a: Attachment): Unit {
  return {
    ...make(s, a.code),
    id: a.id,
    owner: a.owner ?? a.controller ?? activeSeat(s),
  };
}
function discard(s: GameState, u: Unit) {
  forOwner(s, u.owner ?? activeSeat(s), () => {
    if (s.table?.seats[activeSeat(s)].eliminated) s.removed.push(u.code);
    else s.discard.push(u.code);
  });
}
function uniqueInPlay(s: GameState, code: string): boolean {
  const c = card(code);
  return (
    !!c.is_unique &&
    globalUnits(s).some(
      (u) =>
        card(u.code).name === c.name ||
        u.attachments.some(
          (a) => !a.facedown && !a.namelessCard && card(a.code).name === c.name,
        ),
    )
  );
}
export function burglarContractSetup(
  s: GameState,
  lootByPlayer: Record<number, string[]> = {},
) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count =
        s.deck.filter((code) => code === B).length || s.customDeck?.[B] || 0;
      if (!count) return;
      requireRule(count === 1, "Choose one copy of The Burglar’s Turn.");
      const cards =
        s.customDeck ??
        Object.fromEntries(
          [...new Set(s.deck)].map((code) => [
            code,
            s.deck.filter((x) => x === code).length,
          ]),
        );
      const problems = burglarDeckProblems({
        cards,
        loot: lootByPlayer[player],
      });
      requireRule(!problems.length, problems[0] ?? "");
      s.burglarContract ??= { contracts: [], guarded: [], claims: [] };
      const unit = make(s, B);
      unit.owner = player;
      const loot = lootByPlayer[player].map((code) => ({
        ...make(s, code),
        owner: player,
      }));
      s.burglarContract.contracts.push({
        player,
        unit,
        side: "B",
        loot: shuffle(s, loot),
      });
      s.deck = s.deck.filter((code) => code !== B);
      log(
        s,
        `${seatName(s, player)} prepares a separate fourteen-card loot deck.`,
      );
    });
}
/** Triggered only by actual travel, never by moving a location into the active slot. */
export function burglarContractTravelEntered(
  s: GameState,
  u: Unit,
  travelled: boolean,
) {
  if (!travelled || !state(s)) return;
  const effects: Effect[] = [];
  if (u.code === "01087" && burglarContractHandlesBrownLands(s))
    effects.push(
      fx("burglarBrownLandsProgress", {
        target: u.id,
        value: 1,
        code: u.code,
        player: firstPlayer(s),
        text: "The Brown Lands · Place 1 progress",
      }),
    );
  if (
    !playerEffectImmune(s, u, B) &&
    !batch4Scenario(s).cannotAttach?.(s, u, B) &&
    !/cannot have attachments/i.test(card(u.code).text ?? "")
  )
    effects.push(
      ...contractPlayers(s)
        .filter(
          (p) => state(s)!.contracts.find((c) => c.player === p)!.loot.length,
        )
        .map((player) =>
          fx("burglarTravelLoot", {
            target: u.id,
            player,
            code: B,
            text: `The Burglar’s Turn · ${seatName(s, player)}`,
          }),
        ),
    );
  order(s, effects, "Travel · Choose the next Forced effect");
}
export const burglarContractHandlesBrownLands = (s: GameState) =>
  contractPlayers(s).length > 0;
/** An actual attachment departure removes only its metadata, never another copy. */
export function burglarContractAttachmentLeft(s: GameState, a: Attachment) {
  if (state(s))
    state(s)!.guarded = state(s)!.guarded.filter(
      (g) => g.attachmentId !== a.id,
    );
}
function collectClaims(s: GameState, u: Unit) {
  const q = state(s),
    players = contractPlayers(s);
  if (!q || !players.length) return;
  for (const a of [...u.attachments]) {
    const loot = burglarGuardedObjective(s, a);
    if (!loot && !ordinaryGuarded(a)) continue;
    u.attachments = u.attachments.filter((x) => x.id !== a.id);
    burglarContractAttachmentLeft(s, a);
    q.claims.push({
      locationId: u.id,
      unit: asUnit(s, a),
      remainingPlayers: [...players],
      ...(!loot
        ? {
            regularGuarded: true,
            regularPlayer: a.controller ?? a.owner ?? activeSeat(s),
          }
        : {}),
    });
  }
}
/** Prepare saved physical choices before ordinary exploration discards a host.
 * Wrath retains its explored host itself, so collection waits for the chosen
 * simultaneous When trigger, after any earlier capture/Tavern effect.
 */
export function burglarContractExploreEffects(
  s: GameState,
  u: Unit,
  wasActive: boolean,
): Effect[] {
  if (!state(s)) return [];
  if (!wasActive) {
    burglarContractLocationLeaving(s, u, true, false);
    return [];
  }
  const players = contractPlayers(s);
  if (!players.length) return [];
  const guarded = u.attachments.some(
    (a) => burglarGuardedObjective(s, a) || ordinaryGuarded(a),
  );
  if (!guarded) return [];
  if (!s.wrathRuin) collectClaims(s, u);
  return players.map((player) =>
    fx("burglarExplore", {
      target: u.id,
      player,
      code: B,
      text: `The Burglar’s Turn · ${seatName(s, player)}`,
    }),
  );
}
export const burglarLocationExplorationEffects = burglarContractExploreEffects;
/** Staging exploration and non-exploration departures do not grant loot. */
export function burglarContractLocationLeaving(
  s: GameState,
  u: Unit,
  explored = false,
  wasActive = false,
) {
  if (!state(s) || card(u.code).type_code !== "location") return;
  if (explored && wasActive) {
    order(
      s,
      burglarContractExploreEffects(s, u, true),
      "Explore · Choose the next contract",
    );
    return;
  }
  for (const a of [...u.attachments])
    if (burglarGuardedObjective(s, a)) {
      u.attachments = u.attachments.filter((x) => x.id !== a.id);
      burglarContractAttachmentLeft(s, a);
      discard(s, asUnit(s, a));
    }
}
export function burglarContractPlayerEliminating(s: GameState, player: number) {
  const q = state(s);
  if (!q) return;
  const removed: string[] = [];
  for (const c of q.contracts.filter((c) => c.player === player))
    removed.push(c.unit.code, ...c.loot.map((u) => u.code));
  q.contracts = q.contracts.filter((c) => c.player !== player);
  for (const u of [...globalUnits(s), ...(s.wrathRuin?.pendingExplored ?? [])])
    for (const a of [...u.attachments]) {
      if (a.owner !== player || !burglarGuardedObjective(s, a)) continue;
      u.attachments = u.attachments.filter((x) => x.id !== a.id);
      burglarContractAttachmentLeft(s, a);
      removed.push(a.code);
    }
  for (const claim of [...q.claims]) {
    if (claim.unit.owner === player) {
      removed.push(claim.unit.code);
      q.claims = q.claims.filter((c) => c !== claim);
    } else {
      claim.remainingPlayers = claim.remainingPlayers.filter(
        (p) => p !== player,
      );
      if (!claim.remainingPlayers.length) {
        discard(s, claim.unit);
        q.claims = q.claims.filter((c) => c !== claim);
      }
    }
  }
  forOwner(s, player, () => s.removed.push(...removed));
}
export const burglarContractPlayerEliminated = burglarContractPlayerEliminating;
function claimTargets(s: GameState, u: Unit): Unit[] {
  if (effectCardPlayProblem(s, u, { putIntoPlay: true })) return [];
  return playTargets(s, u, { putIntoPlay: true });
}
function finishClaim(s: GameState, id: string) {
  const q = state(s);
  if (q) q.claims = q.claims.filter((c) => c.unit.id !== id);
}
export function handleBurglarContractEffect(s: GameState, e: Effect): boolean {
  const q = state(s);
  if (!e.kind.startsWith("burglar")) return false;
  if (!q) return true;
  switch (e.kind) {
    case "burglarBrownLandsProgress": {
      const u = host(s, e.target);
      if (u) progressLocation(s, u, 1);
      return true;
    }
    case "burglarTravelLoot": {
      const c = q.contracts.find((c) => c.player === activeSeat(s)),
        u = host(s, e.target);
      if (
        !c?.loot.length ||
        !u ||
        !allActiveLocations(s).some((x) => x.id === u.id) ||
        playerEffectImmune(s, u, B) ||
        batch4Scenario(s).cannotAttach?.(s, u, B) ||
        /cannot have attachments/i.test(card(u.code).text ?? "")
      )
        return true;
      const loot = c.loot.shift()!;
      if (uniqueInPlay(s, loot.code)) {
        discard(s, loot);
        log(
          s,
          `${card(loot.code).name} is already in play. Discard the revealed loot without drawing a replacement.`,
        );
        return true;
      }
      u.attachments.push({
        id: loot.id,
        code: loot.code,
        owner: loot.owner,
        controller: c.player,
        exhausted: false,
        blanked: true,
      });
      q.guarded.push({
        locationId: u.id,
        attachmentId: loot.id,
        player: c.player,
      });
      log(s, `${name(u)} guards ${card(loot.code).name}.`);
      return true;
    }
    case "burglarExplore": {
      if (!q.contracts.some((c) => c.player === activeSeat(s))) return true;
      const u = host(s, e.target);
      if (u) collectClaims(s, u);
      const claims = q.claims.filter(
        (c) =>
          c.locationId === e.target &&
          !c.fallback &&
          c.remainingPlayers.includes(activeSeat(s)),
      );
      if (claims.length > 1)
        choose(
          s,
          "The Burglar’s Turn · Choose the next guarded attachment",
          claims.map((c) => ({
            id: c.unit.id,
            code: c.unit.code,
            label: card(c.unit.code).name,
            effects: [
              fx("burglarClaim", {
                source: c.unit.id,
                target: e.target,
                player: activeSeat(s),
              }),
            ],
          })),
        );
      else if (claims.length)
        prepend(
          s,
          fx("burglarClaim", {
            source: claims[0].unit.id,
            target: e.target,
            player: activeSeat(s),
          }),
        );
      return true;
    }
    case "burglarClaim": {
      const claim = q.claims.find(
        (c) =>
          c.unit.id === e.source && c.remainingPlayers.includes(activeSeat(s)),
      );
      if (!claim) return true;
      const u = claim.unit;
      choose(s, `The Burglar’s Turn · Claim ${card(u.code).name}`, [
        ...claimTargets(s, u).map((target) => ({
          id: `attach:${target.id}`,
          code: target.code,
          label: `Attach to ${name(target)}`,
          effects: [
            fx("burglarAttach", {
              source: u.id,
              target: target.id,
              text: e.target,
              player: activeSeat(s),
            }),
          ],
        })),
        {
          id: "hand",
          label: "Add to your hand",
          effects: [
            fx("burglarHand", {
              source: u.id,
              target: e.target,
              player: activeSeat(s),
            }),
          ],
        },
        {
          id: "skip",
          label: "Do not claim this attachment",
          effects: [
            fx("burglarDecline", {
              source: u.id,
              target: e.target,
              player: activeSeat(s),
            }),
          ],
        },
      ]);
      return true;
    }
    case "burglarAttach": {
      const claim = q.claims.find(
          (c) =>
            c.unit.id === e.source &&
            c.remainingPlayers.includes(activeSeat(s)),
        ),
        target = get(s, e.target);
      requireRule(
        claim &&
          target &&
          claimTargets(s, claim.unit).some((u) => u.id === target.id),
        "Choose an eligible attachment target.",
      );
      const u = claim!.unit;
      finishClaim(s, u.id);
      resolvePlayerCard(s, u, target!.id, 0, false, false, false, 0, true);
      prepend(
        s,
        fx("burglarExplore", { target: e.text, player: activeSeat(s) }),
      );
      return true;
    }
    case "burglarHand": {
      const claim = q.claims.find(
        (c) =>
          c.unit.id === e.source && c.remainingPlayers.includes(activeSeat(s)),
      );
      if (!claim) return true;
      finishClaim(s, claim.unit.id);
      s.hand.push(claim.unit);
      prepend(
        s,
        fx("burglarExplore", { target: e.target, player: activeSeat(s) }),
      );
      return true;
    }
    case "burglarDecline": {
      const claim = q.claims.find((c) => c.unit.id === e.source);
      if (!claim) return true;
      claim.remainingPlayers = claim.remainingPlayers.filter(
        (p) => p !== activeSeat(s),
      );
      if (!claim.remainingPlayers.length) {
        if (claim.regularGuarded) {
          claim.fallback = true;
          const player =
            claim.regularPlayer ?? claim.unit.owner ?? activeSeat(s);
          claim.remainingPlayers = [player];
          prepend(
            s,
            fx("burglarOrdinaryClaim", {
              source: claim.unit.id,
              target: claim.locationId,
              code: claim.unit.code,
              player,
              owner: claim.unit.owner,
            }),
          );
        } else {
          finishClaim(s, claim.unit.id);
          discard(s, claim.unit);
        }
      }
      prepend(
        s,
        fx("burglarExplore", { target: e.target, player: activeSeat(s) }),
      );
      return true;
    }
    case "burglarOrdinaryClaim": {
      const claim = q.claims.find((c) => c.unit.id === e.source && c.fallback);
      if (!claim) return true;
      const targets = claimTargets(s, claim.unit);
      if (!targets.length) {
        finishClaim(s, claim.unit.id);
        discard(s, claim.unit);
      } else
        choose(
          s,
          `${card(claim.unit.code).name} · Choose an eligible character`,
          targets.map((u) => ({
            id: `attach:${u.id}`,
            code: u.code,
            label: `Attach to ${name(u)}`,
            effects: [
              fx("burglarAttach", {
                source: claim.unit.id,
                target: u.id,
                text: claim.locationId,
                player: activeSeat(s),
              }),
            ],
          })),
        );
      return true;
    }
    default:
      return false;
  }
}
