import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  cannotReady,
  choose,
  fx,
  get,
  make,
  prepend,
  requireRule,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  allyCanEnter,
  discardCharacter,
  enterAlly,
  raiseThreat,
  readyCharacter,
  returnAlly,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  resolvePlayerCard,
} from "./actions";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { rhosgobelHealingAllowed } from "./rhosgobel";
import { shadowEastRing } from "./shadow-east-player-support";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { isSacked } from "./carrock";
import { batch4Scenario } from "./batch4-scenarios";
import {
  WAINRIDERS_PLAYER as P,
  wainPrintedDoomed,
  wandererContract,
  wandererHero,
} from "./wainriders-player-support";
const state = (s: GameState) =>
  (s.wainridersPlayers ??= { contracts: [], horns: [], scout: [] });
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const scouts = (s: GameState) =>
  s.staging.filter(
    (u) =>
      card(u.code).type_code === "enemy" &&
      !card(u.code).is_unique &&
      !playerEffectImmune(s, u, P.scout),
  );
const healable = (s: GameState, h: Unit) =>
  !playerEffectImmune(s, h, P.wanderer) && rhosgobelHealingAllowed(s, h);
export function wandererSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count =
        s.deck.filter((c) => c === P.wanderer).length ||
        s.customDeck?.[P.wanderer] ||
        0;
      if (!count) return;
      requireRule(
        count === 1 && s.heroes.length === 1,
        "The Grey Wanderer requires one starting hero and one contract.",
      );
      s.deck = s.deck.filter((c) => c !== P.wanderer);
      const unit = make(s, P.wanderer);
      unit.owner = player;
      state(s).contracts.push({
        player,
        unit,
        hero: s.heroes[0].id,
        heroCode: s.heroes[0].code,
        side: "A",
      });
      s.queue.push(fx("wainPlayerSetup", { player }));
    });
}
export function wainridersPlayerEliminated(s: GameState, player: number) {
  const q = s.wainridersPlayers;
  if (!q) return;
  for (const c of q.contracts.filter((c) => c.player === player))
    forOwner(s, player, () => s.removed.push(c.unit.code));
  q.contracts = q.contracts.filter((c) => c.player !== player);
}
export function wainridersPlayerTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.command)
    return allHeroes(s).filter(
      (h) =>
        h.attachments.some((a) => a.code === "21001") &&
        !h.attachments.some((a) => a.code === code),
    );
}
export function wainridersPlayerPlayedEffects(
  s: GameState,
  _u: Unit,
  hasDoomed: boolean,
  played: boolean,
): Effect[] {
  if (!played || !hasDoomed) return [];
  return s.heroes
    .filter(
      (h) => h.code === P.saruman && !h.blanked && !isSacked(h) && h.exhausted,
    )
    .map((h) =>
      fx("wainPlayerSaruman", { source: h.id, player: activeSeat(s) }),
    );
}
export function wainridersDoomedResponses(s: GameState, players: number[]) {
  return allCharacters(s)
    .filter((u) => u.code === P.soldier && !u.blanked && !isSacked(u))
    .flatMap((u) =>
      players
        .filter((p) => p !== ownerOf(s, u))
        .map((player) =>
          fx("wainPlayerSoldier", { source: u.id, value: player }),
        ),
    );
}
export function wainridersPlayerCommitted(s: GameState, committed: Unit[]) {
  for (const h of committed)
    for (const a of h.attachments.filter(
      (a) => a.code === P.command && !a.blanked && !a.facedown,
    ))
      prepend(
        s,
        fx("wainPlayerCommand", {
          target: h.id,
          source: a.id,
          player: attachmentController(s, h, a) ?? ownerOf(s, h),
        }),
      );
}
export function wainridersPlayerAttackKilled(s: GameState, ids: string[]) {
  for (const id of ids) {
    const u = get(s, id);
    if (u?.code === P.nori && !u.blanked && !isSacked(u))
      prepend(s, fx("wainPlayerNori", { source: u.id, player: ownerOf(s, u) }));
  }
}
export function wainridersPlayerPhaseEnd(s: GameState) {
  const q = s.wainridersPlayers;
  if (!q) return [];
  const ids = q.horns.splice(0);
  return ids
    .filter((id) => allCharacters(s).some((u) => u.id === id))
    .map((target) =>
      fx("wainPlayerHornsReturn", {
        target,
        player: ownerOf(s, get(s, target)!),
      }),
    );
}
export function wainridersPlayerEventProblem(s: GameState, code: string) {
  if (code === P.sighted && !s.encounterDeck.length)
    return "The encounter deck is empty.";
  if (
    code === P.horns &&
    !playerOrder(s).some((p) =>
      seatView(s, p).hand.some((u) => allyCanEnter(seatView(s, p), u.code)),
    )
  )
    return "No player has an ally that can enter play.";
  return null;
}
export function wainridersPlayerEvent(s: GameState, code: string) {
  if (code === P.horns)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("wainPlayerHorns", { player })),
    );
  else if (code === P.sighted)
    prepend(
      s,
      fx("wainPlayerSighted", {
        ids: s.encounterDeck.slice(0, 5),
        value: 0,
        player: activeSeat(s),
      }),
    );
  else return false;
  return true;
}
export function wainridersPlayerAbilityLabel(code: string) {
  return code === P.scout
    ? "Discard to avoid an enemy's engagement checks"
    : code === P.staff
      ? "Exhaust · Reduce Doomed or search"
      : code === P.wanderer
        ? "Exhaust · Raise threat 1 · Choose two"
        : undefined;
}
export function wainridersPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | null {
  const a = u.attachments.find((a) => a.id === attachmentId),
    code = a?.code ?? u.code;
  if (!wainridersPlayerAbilityLabel(code)) return null;
  if (
    a
      ? a.blanked ||
        a.facedown ||
        attachmentController(s, u, a) !== activeSeat(s)
      : u.blanked || isSacked(u) || ownerOf(s, u) !== activeSeat(s)
  )
    return "Use an active card you control.";
  if (code === P.scout) {
    if (
      !s.allies.some((x) => x.id === u.id) ||
      batch4Scenario(s).cannotLeave?.(s, u, false)
    )
      return "The Scout cannot pay its discard cost.";
    if (!scouts(s).length) return "Choose a non-unique enemy in staging.";
  }
  if (code === P.staff && (a?.exhausted || !a))
    return "Saruman's Staff is exhausted.";
  if (code === P.wanderer) {
    const c = wandererContract(s),
      h = wandererHero(s);
    if (!c || c.unit.id !== u.id || c.side !== "B")
      return "The Grey Wanderer must finish setup and flip first.";
    if (c.unit.exhausted) return "The Grey Wanderer is exhausted.";
    if (!h || playerEffectImmune(s, h, P.wanderer))
      return "Your starting hero cannot receive this effect.";
    if (
      !canGainResources(s, h) &&
      (!h.exhausted ||
        cannotReady(h, s) ||
        batch4Scenario(s).cannotPlayerReady?.(s)) &&
      (!h.damage || !healable(s, h))
    )
      return "Your starting hero cannot benefit from these effects.";
  }
  return null;
}
export function useWainridersPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId),
    code = a?.code ?? u.code;
  if (!wainridersPlayerAbilityLabel(code)) return false;
  requireRule(
    !wainridersPlayerAbilityProblem(s, u, attachmentId),
    wainridersPlayerAbilityProblem(s, u, attachmentId) ?? "",
  );
  if (code === P.scout) {
    const ids = scouts(s).map((u) => u.id),
      player = activeSeat(s);
    discardCharacter(s, u);
    if (!get(s, u.id)) prepend(s, fx("wainPlayerScout", { ids, player }));
  } else if (code === P.staff) {
    a!.exhausted = true;
    choose(s, "Saruman's Staff · Choose one", [
      {
        id: "reduce",
        label: "Reduce the next Doomed event this phase by 2",
        effects: [fx("used", { text: "phase:wain-staff" })],
      },
      {
        id: "search",
        label: "Search the top 5 cards for a Doomed event",
        effects: [fx("wainPlayerStaffSearch")],
      },
    ]);
  } else {
    wandererContract(s)!.unit.exhausted = true;
    raiseThreat(s, 1, "cost");
    prepend(
      s,
      fx("wainPlayerWandererChoose", { ids: [], player: activeSeat(s) }),
    );
  }
  return true;
}
export function wainridersPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("wainPlayer")) return false;
  const player = e.player ?? activeSeat(s),
    source = get(s, e.source),
    u = get(s, e.target);
  switch (e.kind) {
    case "wainPlayerSetup": {
      const c = wandererContract(s);
      if (!c || c.side !== "A") break;
      const choices = s.deck.flatMap((code, index) => {
        if (
          card(code).type_code !== "attachment" ||
          Number(card(code).cost) !== 1
        )
          return [];
        const probe = { ...c.unit, code };
        if (effectCardPlayProblem(s, probe, { putIntoPlay: true })) return [];
        return effectCardPlayTargets(s, probe, { putIntoPlay: true }).map(
          (h) => ({
            id: `${index}:${h.id}`,
            code,
            label: `${card(code).name} · ${name(h)}`,
            effects: [
              fx("wainPlayerSetupTake", {
                code,
                value: index,
                target: h.id,
                player,
              }),
            ],
          }),
        );
      });
      choose(s, "The Grey Wanderer · Search for a printed cost 1 attachment", [
        ...choices,
        {
          id: "skip",
          label: "Find no attachment · Remain on side A",
          effects: [fx("wainPlayerShuffle")],
        },
      ]);
      break;
    }
    case "wainPlayerSetupTake": {
      const c = wandererContract(s);
      if (!c || s.deck[e.value ?? -1] !== e.code) break;
      const physical = takePlayerDeck(s, e.value);
      resolvePlayerCard(s, physical, e.target, 1, false, false);
      shuffle(s, s.deck);
      c.side = "B";
      break;
    }
    case "wainPlayerShuffle":
      shuffle(s, s.deck);
      break;
    case "wainPlayerSaruman":
      if (source && !source.blanked && !isSacked(source) && source.exhausted)
        choosePlayerResponse(
          s,
          source.id,
          P.saruman,
          "Saruman · Ready after playing a Doomed card",
          [
            {
              id: "ready",
              label: "Ready Saruman",
              effects: [fx("wainPlayerReady", { target: source.id, player })],
            },
            skip,
          ],
        );
      break;
    case "wainPlayerReady":
      if (u) readyCharacter(s, u);
      break;
    case "wainPlayerSoldier": {
      if (
        !source ||
        source.blanked ||
        isSacked(source) ||
        !playerOrder(s).includes(e.value!) ||
        ownerOf(s, source) === e.value
      )
        break;
      const controller = ownerOf(s, source);
      selectSeat(s, controller);
      choosePlayerResponse(
        s,
        source.id,
        P.soldier,
        "Soldier of Isengard · Give control after Doomed",
        [
          {
            id: "give",
            label: `Give control to Player ${(e.value ?? 0) + 1}`,
            effects: [
              fx("wainPlayerSoldierGive", {
                source: source.id,
                value: e.value,
                player: controller,
              }),
            ],
          },
          skip,
        ],
      );
      break;
    }
    case "wainPlayerSoldierGive":
      if (
        source &&
        source.code === P.soldier &&
        !source.blanked &&
        playerOrder(s).includes(e.value!)
      ) {
        const controller = ownerOf(s, source);
        if (controller === e.value) break;
        source.owner ??= controller;
        forOwner(s, controller, () => {
          s.allies = s.allies.filter((u) => u.id !== source.id);
        });
        forOwner(s, e.value!, () => {
          source.controller = e.value;
          s.allies.push(source);
        });
      }
      break;
    case "wainPlayerCommand": {
      const a = u?.attachments.find((a) => a.id === e.source),
        ring = shadowEastRing(s);
      if (
        !u ||
        !a ||
        a.blanked ||
        a.facedown ||
        !ring ||
        ring.host.id !== u.id ||
        ring.player !== player ||
        ring.attachment.exhausted ||
        ring.attachment.blanked
      )
        break;
      if (
        ![...s.heroes, ...s.allies].some(
          (x) =>
            x.id !== u.id &&
            card(x.code).is_unique &&
            !playerEffectImmune(s, x, P.command),
        )
      )
        break;
      choosePlayerResponse(
        s,
        a.id,
        P.command,
        "Power of Command · Strengthen your unique characters",
        [
          {
            id: "use",
            label: "Exhaust The One Ring · Raise threat 1",
            effects: [
              fx("wainPlayerCommandPay", {
                target: u.id,
                source: a.id,
                player,
              }),
            ],
          },
          skip,
        ],
      );
      break;
    }
    case "wainPlayerCommandPay": {
      const ring = shadowEastRing(s),
        a = u?.attachments.find((a) => a.id === e.source);
      if (
        !u ||
        !a ||
        a.blanked ||
        !ring ||
        ring.host.id !== u.id ||
        ring.player !== player ||
        ring.attachment.exhausted ||
        ring.attachment.blanked
      )
        break;
      ring.attachment.exhausted = true;
      raiseThreat(s, 1, "cost");
      prepend(s, fx("wainPlayerCommandApply", { target: u.id, player }));
      break;
    }
    case "wainPlayerCommandApply":
      for (const h of [...s.heroes, ...s.allies])
        if (
          h.id !== e.target &&
          card(h.code).is_unique &&
          !playerEffectImmune(s, h, P.command)
        )
          h.tempWill = (h.tempWill ?? 0) + 1;
      break;
    case "wainPlayerNori":
      if (
        source &&
        !source.blanked &&
        !isSacked(source) &&
        s.discard.length &&
        !dikeCannotLeaveDiscard(s)
      )
        choosePlayerResponse(
          s,
          source.id,
          P.nori,
          "Nori · Recycle the top discard",
          [
            {
              id: "return",
              code: s.discard.at(-1),
              label: `Put ${card(s.discard.at(-1)!).name} on the bottom of your deck`,
              effects: [
                fx("wainPlayerNoriTake", { source: source.id, player }),
              ],
            },
            skip,
          ],
        );
      break;
    case "wainPlayerNoriTake":
      if (
        source &&
        !source.blanked &&
        s.discard.length &&
        !dikeCannotLeaveDiscard(s)
      )
        s.deck.push(s.discard.pop()!);
      break;
    case "wainPlayerHorns":
      choose(s, "Horns! Horns! Horns! · Put an ally into play", [
        ...s.hand
          .filter((u) => allyCanEnter(s, u.code))
          .map((u) =>
            option(u, [fx("wainPlayerHornsTake", { source: u.id, player })]),
          ),
        { ...skip, label: "Put no ally into play" },
      ]);
      break;
    case "wainPlayerHornsTake": {
      const ally = s.hand.find((u) => u.id === e.source);
      if (!ally || !allyCanEnter(s, ally.code)) break;
      s.hand = s.hand.filter((u) => u.id !== ally.id);
      state(s).horns.push(ally.id);
      enterAlly(s, ally, false, false, true);
      break;
    }
    case "wainPlayerHornsReturn":
      if (u) returnAlly(s, u, true);
      break;
    case "wainPlayerSighted": {
      const codes = e.ids ?? [],
        i = e.value ?? 0;
      if (i < codes.length)
        choose(
          s,
          `Far-sighted · Encounter card ${i + 1} of ${codes.length}`,
          [
            {
              id: "continue",
              code: codes[i],
              label:
                i + 1 === codes.length
                  ? "Finish · Keep the same order"
                  : "View next card",
              effects: [
                fx("wainPlayerSighted", { ids: codes, value: i + 1, player }),
              ],
            },
          ],
          card(codes[i]).text,
        );
      break;
    }
    case "wainPlayerStaffSearch": {
      const choices = s.deck.slice(0, 5).flatMap((code, index) =>
        card(code).type_code === "event" && wainPrintedDoomed(code)
          ? [
              {
                id: `deck-${index}`,
                code,
                label: card(code).name,
                effects: [
                  fx("wainPlayerStaffTake", { code, value: index, player }),
                ],
              },
            ]
          : [],
      );
      choose(s, "Saruman's Staff · Search the top 5 cards", [
        ...choices,
        {
          id: "skip",
          label: "Find no event · Shuffle",
          effects: [fx("wainPlayerShuffle", { player })],
        },
      ]);
      break;
    }
    case "wainPlayerStaffTake":
      if (s.deck[e.value ?? -1] === e.code)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "wainPlayerScout":
      choose(
        s,
        "Rohirrim Scout · Choose an enemy",
        scouts(s)
          .filter((u) => e.ids?.includes(u.id))
          .map((u) =>
            option(u, [fx("wainPlayerScoutTake", { target: u.id, player })]),
          ),
      );
      break;
    case "wainPlayerScoutTake":
      if (u && scouts(s).some((x) => x.id === u.id))
        state(s).scout.push({ player, enemy: u.id, round: s.round });
      break;
    case "wainPlayerWandererChoose": {
      const chosen = e.ids ?? [];
      if (chosen.length === 2) {
        prepend(
          s,
          ...chosen.map((text) =>
            fx("wainPlayerWandererApply", { text, player }),
          ),
        );
        break;
      }
      choose(
        s,
        `The Grey Wanderer · Choose ${chosen.length === 0 ? "first" : "second"} effect`,
        ["ready", "resources", "heal"]
          .filter((text) => !chosen.includes(text))
          .map((text) => ({
            id: text,
            label:
              text === "ready"
                ? "Ready your starting hero"
                : text === "resources"
                  ? "Add 2 resources to your starting hero"
                  : "Heal 3 damage from your starting hero",
            effects: [
              fx("wainPlayerWandererChoose", {
                ids: [...chosen, text],
                player,
              }),
            ],
          })),
      );
      break;
    }
    case "wainPlayerWandererApply": {
      const h = wandererHero(s);
      if (!h || playerEffectImmune(s, h, P.wanderer)) break;
      if (e.text === "ready") readyCharacter(s, h);
      if (e.text === "resources" && canGainResources(s, h))
        prepend(s, fx("resource", { target: h.id, value: 2, player }));
      if (e.text === "heal" && healable(s, h))
        prepend(
          s,
          fx("heal", {
            target: h.id,
            value: 3,
            source: wandererContract(s)?.unit.id,
            code: P.wanderer,
            player,
          }),
        );
      break;
    }
    default:
      return false;
  }
  return true;
}
