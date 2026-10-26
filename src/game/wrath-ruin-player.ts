import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  fx,
  get,
  log,
  prepend,
  requireRule,
  shuffle,
} from "./core";
import {
  addVictoryCard,
  allyEntryResponses,
  charactersCommitted,
  damage,
  destroy,
  raiseThreat,
} from "./board";
import {
  activeSeat,
  allHeroes,
  attachmentController,
  attackersFor,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { playerAttack } from "./combat";
import { isEnemy } from "./ships";
import { hasTrait } from "./expansion-passives";
import { isSacked } from "./carrock";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { shadowEastRing } from "./shadow-east-player-support";
import {
  WRATH_RUIN_PLAYER as P,
  wrathBombadilReserve,
} from "./wrath-ruin-player-support";

const live = (u: Unit) => !u.blanked && !isSacked(u);
const attachmentLive = (a: Attachment) => !a.blanked && !a.facedown;
const state = (s: GameState) =>
  (s.wrathRuinPlayers ??= { tomDelays: [], bombadilloOwners: [] });
const skip = (): Option => ({
  id: "skip",
  label: "Continue without the response",
  effects: [],
});
const axeTargets = (s: GameState, player = activeSeat(s)) =>
  seatView(s, player).engaged.filter(
    (u) => isEnemy(u) && !playerEffectImmune(s, u, P.axe),
  );
const tomReservePlayers = (s: GameState) =>
  playerOrder(s).filter((player) => wrathBombadilReserve(s, player) > 0);

export function wrathRuinPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.axe) return allHeroes(s);
  if (code === P.strength)
    return allHeroes(s).filter(
      (u) =>
        u.attachments.some((a) => a.code === "21001") &&
        !u.attachments.some((a) => a.code === P.strength),
    );
  return undefined;
}

function chargeTargets(s: GameState, visited: readonly string[] = []) {
  return s.staging.filter(
    (u) =>
      isEnemy(u) &&
      !card(u.code).is_unique &&
      !visited.includes(u.id) &&
      !playerEffectImmune(s, u, P.charge) &&
      attackersFor(s, u, undefined, true).some(
        (a) => ownerOf(s, a) === activeSeat(s),
      ),
  );
}

export function wrathRuinPlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.code === P.bombadillo) {
    if (s.phase !== "planning") return "Tom Bombadillo! is a Planning Action.";
    if (!s.heroes.some((h) => hasTrait(h, "Hobbit")))
      return "Tom Bombadillo! requires a Hobbit hero you control.";
    if (s.victoryCards?.includes(P.bombadillo))
      return "Tom Bombadillo! cannot be played while a copy is in the victory display.";
    if (!tomReservePlayers(s).length)
      return "There is no set-aside Tom Bombadil remaining among the players.";
  }
  if (u.code === P.charge) {
    if (s.phase !== "staging")
      return "Charge into Battle can be played only after staging during the quest phase.";
    if (!chargeTargets(s).length)
      return "Charge into Battle needs a non-unique staging enemy and an eligible attacker you control.";
  }
  return null;
}

/** The event itself is its printed cost, before cancellation of its ability. */
export function wrathRuinPlayerEventCost(s: GameState, u: Unit) {
  if (u.code !== P.bombadillo) return;
  const pending = s.resolvingEvents?.find((e) => e.unit.id === u.id);
  requireRule(
    pending,
    "Tom Bombadillo! must pay its own physical event as the cost.",
  );
  requireRule(
    !s.victoryCards?.includes(P.bombadillo),
    "Tom Bombadillo! is already in the victory display.",
  );
  addVictoryCard(s, u.code);
  state(s).bombadilloOwners.push({ id: u.id, owner: u.owner ?? activeSeat(s) });
  pending!.destination = "spent";
}

export function wrathRuinPlayerEvent(
  s: GameState,
  code: string,
  _target?: string,
  _eventId?: string,
  _amount?: number,
) {
  if (code === P.bombadillo) {
    const players = tomReservePlayers(s);
    if (players.length === 1)
      prepend(s, fx("wrathPlayerTomShuffle", { owner: players[0] }));
    else if (players.length)
      choose(
        s,
        "Tom Bombadillo! · Choose a set-aside copy",
        players.map((player) => ({
          id: `reserve-${player}`,
          label: `${seatName(s, player)} · ${wrathBombadilReserve(s, player)} Tom Bombadil set aside`,
          effects: [fx("wrathPlayerTomShuffle", { owner: player })],
        })),
      );
    return true;
  }
  if (code === P.charge) {
    prepend(s, fx("wrathPlayerChargeChoose", { ids: [] }));
    return true;
  }
  return false;
}

export function wrathRuinPlayerAllyEntered(
  s: GameState,
  u: Unit,
  _played = false,
  _fromHand = false,
) {
  if (u.code === P.halfling && live(u))
    prepend(
      s,
      fx("wrathPlayerHalflingOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}

export function wrathRuinPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
  _engagedPlayer?: number,
) {
  for (const id of ids) {
    const u = get(s, id);
    if (!u) continue;
    for (const a of u.attachments.filter(
      (a) => a.code === P.axe && attachmentLive(a),
    )) {
      const player = attachmentController(s, u, a) ?? ownerOf(s, u);
      if (axeTargets(s, player).length)
        prepend(
          s,
          fx("wrathPlayerAxeOffer", { source: a.id, target: u.id, player }),
        );
    }
  }
}

export function wrathRuinPlayerShadowOptions(
  s: GameState,
  shadowCode: string,
  hasText = true,
): Option[] {
  if (!hasText || !s.combat) return [];
  const ring = shadowEastRing(s);
  if (!ring || ring.attachment.exhausted || !attachmentLive(ring.attachment))
    return [];
  const defenders =
    s.combat.defenderIds ?? (s.combat.defenderId ? [s.combat.defenderId] : []);
  if (
    !defenders.includes(ring.host.id) ||
    !playerOrder(s).includes(ring.player)
  )
    return [];
  return ring.host.attachments
    .filter(
      (a) =>
        a.code === P.strength &&
        attachmentLive(a) &&
        attachmentController(s, ring.host, a) === ring.player,
    )
    .map((a) => ({
      id: `wrath-strength-${a.id}`,
      code: a.code,
      label:
        "Inner Strength · Exhaust The One Ring and raise threat by 1 to cancel the shadow",
      ability: {
        player: ring.player,
        source: a.id,
        code: a.code,
        type: "response",
      },
      effects: [
        fx("wrathPlayerStrength", {
          source: a.id,
          target: ring.host.id,
          code: shadowCode,
          player: ring.player,
        }),
      ],
    }));
}

export function wrathRuinPlayerEncounter(
  s: GameState,
  code: string,
  _cancel = false,
  fromReveal = true,
) {
  if (code !== P.tom) return false;
  if (fromReveal) {
    const tom = [...s.staging].reverse().find((u) => u.code === P.tom);
    if (tom) {
      state(s).tomDelays.push({ id: tom.id, player: firstPlayer(s) });
      prepend(
        s,
        fx("wrathPlayerTomChoose", { target: tom.id, player: firstPlayer(s) }),
      );
    }
  }
  return true;
}

export function wrathRuinPlayerRoundEnd(s: GameState): Effect[] {
  return (s.wrathRuinPlayers?.tomDelays ?? []).map((d) =>
    fx("wrathPlayerTomDepart", { target: d.id, player: firstPlayer(s) }),
  );
}

/** All choices and attack continuations retain the initiating player's actor. */
export function handleWrathRuinPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("wrathPlayer")) return false;
  const source = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "wrathPlayerTomShuffle":
      if (e.owner !== undefined && tomReservePlayers(s).includes(e.owner)) {
        (s.wrathBombadilReserves ??= {})[e.owner] =
          wrathBombadilReserve(s, e.owner) - 1;
        s.encounterDeck.push(P.tom);
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Tom Bombadillo! · A set-aside Tom Bombadil joins the encounter deck.",
          "good",
        );
      }
      break;
    case "wrathPlayerHalflingOffer":
      if (source?.code === P.halfling && live(source) && s.encounterDeck.length)
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Cautious Halfling · Look at the encounter deck?",
          [
            {
              id: "use",
              label: "Look at the top encounter card",
              effects: [fx("wrathPlayerHalflingLook", { source: source.id })],
            },
            skip(),
          ],
        );
      break;
    case "wrathPlayerHalflingLook": {
      const top = s.encounterDeck[0];
      if (top)
        choose(
          s,
          "Cautious Halfling · Top encounter card",
          [
            {
              id: "continue",
              code: top,
              label: "Finish looking at the top card",
              effects: [fx("wrathPlayerHalflingFinish", { code: top })],
            },
          ],
          "Look only: this card stays on the encounter deck and is not revealed.",
        );
      break;
    }
    case "wrathPlayerHalflingFinish":
      if (e.code && !["enemy", "ship-enemy"].includes(card(e.code).type_code))
        draw(s, 1);
      break;
    case "wrathPlayerAxeOffer": {
      const a = target?.attachments.find(
        (a) => a.id === e.source && a.code === P.axe && attachmentLive(a),
      );
      if (a && axeTargets(s).length)
        choosePlayerResponse(s, a.id, a.code, "Durin's Axe · Deal 1 damage?", [
          ...axeTargets(s).map((u) => ({
            id: u.id,
            code: u.code,
            label: `Deal 1 damage to ${name(u)}`,
            effects: [fx("wrathPlayerAxeDamage", { target: u.id })],
          })),
          skip(),
        ]);
      break;
    }
    case "wrathPlayerAxeDamage":
      if (target && axeTargets(s).some((u) => u.id === target.id))
        damage(s, target.id, 1);
      break;
    case "wrathPlayerStrength": {
      const ring = shadowEastRing(s),
        a = target?.attachments.find(
          (a) =>
            a.id === e.source && a.code === P.strength && attachmentLive(a),
        );
      const defenders =
        s.combat?.defenderIds ??
        (s.combat?.defenderId ? [s.combat.defenderId] : []);
      requireRule(
        ring &&
          a &&
          ring.host.id === target?.id &&
          ring.player === activeSeat(s) &&
          attachmentController(s, target!, a) === activeSeat(s) &&
          !ring.attachment.exhausted &&
          attachmentLive(ring.attachment) &&
          defenders.includes(target!.id),
        "Inner Strength requires its defending hero and a ready One Ring controlled by this player.",
      );
      ring!.attachment.exhausted = true;
      raiseThreat(s, 1, "cost");
      log(s, "Inner Strength · The shadow effect is canceled.", "good");
      break;
    }
    case "wrathPlayerChargeChoose": {
      const visited = e.ids ?? [];
      const targets = chargeTargets(s, visited);
      if (targets.length)
        choose(s, "Charge into Battle · Choose the next enemy", [
          ...targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("wrathPlayerChargeAttackers", {
                target: u.id,
                ids: [],
                text: JSON.stringify(visited),
              }),
            ],
          })),
          { id: "finish", label: "Finish Charge into Battle", effects: [] },
        ]);
      break;
    }
    case "wrathPlayerChargeAttackers": {
      const visited: string[] = JSON.parse(e.text ?? "[]");
      if (
        !target ||
        !chargeTargets(s, visited).some((u) => u.id === target.id)
      ) {
        prepend(s, fx("wrathPlayerChargeChoose", { ids: visited }));
        break;
      }
      const eligible = attackersFor(s, target, undefined, true),
        selected = (e.ids ?? []).filter((id) =>
          eligible.some((u) => u.id === id),
        );
      choose(s, `Charge into Battle · Attack ${name(target)}`, [
        ...eligible.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${selected.includes(u.id) ? "Remove" : "Add"} ${name(u)} · ${seatName(s, ownerOf(s, u))}`,
          effects: [
            fx("wrathPlayerChargeAttackers", {
              target: target.id,
              text: e.text,
              ids: selected.includes(u.id)
                ? selected.filter((id) => id !== u.id)
                : [...selected, u.id],
            }),
          ],
        })),
        ...(selected.some((id) => ownerOf(s, get(s, id)!) === activeSeat(s))
          ? [
              {
                id: "attack",
                label: "Declare this attack",
                effects: [
                  fx("wrathPlayerChargeAttack", {
                    target: target.id,
                    ids: selected,
                    text: e.text,
                  }),
                ],
              },
            ]
          : []),
        {
          id: "back",
          label: "Choose a different enemy",
          effects: [fx("wrathPlayerChargeChoose", { ids: visited })],
        },
      ]);
      break;
    }
    case "wrathPlayerChargeAttack": {
      const visited: string[] = JSON.parse(e.text ?? "[]");
      if (target && chargeTargets(s, visited).some((u) => u.id === target.id)) {
        prepend(
          s,
          fx("wrathPlayerChargeChoose", { ids: [...visited, target.id] }),
        );
        playerAttack(s, target, e.ids ?? [], false, "charge-into-battle");
      } else prepend(s, fx("wrathPlayerChargeChoose", { ids: visited }));
      break;
    }
    case "wrathPlayerTomChoose":
      if (target?.code === P.tom)
        choose(
          s,
          "Tom Bombadil · Choose a fellowship",
          playerOrder(s).map((player) => ({
            id: `player-${player}`,
            label: seatName(s, player),
            effects: [
              fx("wrathPlayerTomControl", {
                target: target.id,
                value: player,
                player: firstPlayer(s),
              }),
            ],
          })),
        );
      break;
    case "wrathPlayerTomControl":
      if (
        target?.code === P.tom &&
        e.value !== undefined &&
        playerOrder(s).includes(e.value)
      ) {
        s.staging = s.staging.filter((u) => u.id !== target.id);
        target.owner = e.value;
        // The revealed ally is already in play. Gaining control is not a new play/put-into-play effect.
        forOwner(s, e.value, () => {
          target.exhausted = false;
          target.committed = true;
          s.allies.push(target);
          allyEntryResponses(s, target, false, false);
          charactersCommitted(s, [target]);
        });
        log(
          s,
          `Tom Bombadil joins ${seatName(s, e.value)}, ready and committed.`,
          "good",
        );
      }
      break;
    case "wrathPlayerTomDepart": {
      const q = state(s);
      q.tomDelays = q.tomDelays.filter((d) => d.id !== e.target);
      const tom = globalCharacters(s).find(
        (u) => u.id === e.target && u.code === P.tom,
      );
      if (tom)
        forOwner(s, ownerOf(s, tom), () => destroy(s, tom, false, "removed"));
      const index = s.victoryCards?.indexOf(P.bombadillo) ?? -1;
      if (index >= 0) {
        s.victoryCards!.splice(index, 1);
        const owner = q.bombadilloOwners.shift()?.owner ?? activeSeat(s);
        forOwner(s, owner, () => s.removed.push(P.bombadillo));
        if (s.khazad) {
          const mirror = s.khazad.victoryCards.indexOf(P.bombadillo);
          if (mirror >= 0) s.khazad.victoryCards.splice(mirror, 1);
        }
      }
      break;
    }
    default:
      return false;
  }
  return true;
}
