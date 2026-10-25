import type {
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import { isEnemy } from "./ships";
import {
  canPay,
  cannotReady,
  choose,
  draw,
  engagementCost,
  fx,
  get,
  log,
  make,
  prepend,
  removeShadowCard,
  requireRule,
  shuffle,
  spendResources,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  characterLeftPlay,
  damage,
  discardCharacter,
  discardAttachment,
  engage,
  enemyAddedToStaging,
  raiseThreat,
  readyCharacter,
  removeFromQuest,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  globalCharacters,
  allHeroes,
  attachmentController,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatView,
} from "./table";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { reduceThreat } from "./threat-reduction";
import { stormcallerEffectiveThreat } from "./threat-read";
import { isSacked } from "./carrock";
import {
  heirsCanSpendResources,
  heirsCannotHaveAttachments,
} from "./heirs-numenor";
import { fateCannotSearch } from "./fate-numenor";
import { batch4Scenario } from "./batch4-scenarios";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { shadowFlameCanMove } from "./shadow-flame";
import { morgulCannotLeave } from "./morgul-vale";
import { hasTrait } from "./expansion-passives";
import {
  SHADOW_EAST_PLAYER as P,
  SHADOW_EAST_PREFIX as PREFIX,
  shadowEastContract,
  shadowEastGollum,
  shadowEastIsMaster,
  shadowEastPlayerAllyProblem,
  shadowEastPlayerCanHaveAttachments,
  shadowEastRing,
} from "./shadow-east-player-support";

const live = (u: Unit) => !u.blanked && !isSacked(u);
const enemy = (u: Unit) => isEnemy(u);
const canReady = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !drownedCannotReady(s) &&
  !desertCrossingCannotPlayerReady(s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !batch4Scenario(s).cannotPlayerReadyCharacter?.(s, u) &&
  !playerEffectImmune(s, u, code);
const state = (s: GameState) =>
  (s.shadowEastPlayers ??= { contracts: [], pendingRings: [] });
const option = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
const skip = (): Option => ({
  id: "skip",
  label: "Continue without the response",
  effects: [],
});
function offer(
  s: GameState,
  source: Unit | Attachment,
  title: string,
  effects: Effect[],
  player = activeSeat(s),
) {
  choosePlayerResponse(
    s,
    source.id,
    source.code,
    title,
    [{ id: "use", label: "Use the response", effects }, skip()],
    undefined,
    player,
  );
}
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.choice = null;
  s.queue = [];
  if (s.flow) s.flow.pending = null;
  log(s, reason, "danger");
}
function ringReady(s: GameState) {
  const ring = shadowEastRing(s);
  return ring &&
    ring.player === activeSeat(s) &&
    !ring.attachment.exhausted &&
    !ring.attachment.blanked
    ? ring
    : undefined;
}
function payRing(s: GameState) {
  const ring = ringReady(s);
  requireRule(
    ring,
    "Exhaust The One Ring you control to pay this Master card's cost.",
  );
  ring!.attachment.exhausted = true;
  raiseThreat(s, 1, "cost");
}
const frodoTargets = (s: GameState, u: Unit) =>
  allCharacters(s).filter(
    (c) =>
      c.id !== u.id &&
      c.committed &&
      card(c.code).is_unique &&
      canReady(s, c, P.frodo),
  );
const faramirTargets = (s: GameState) =>
  s.staging.filter(
    (u) =>
      enemy(u) &&
      !card(u.code).is_unique &&
      !playerEffectImmune(s, u, P.faramir) &&
      !batch4Scenario(s).cannotEngage?.(s, u) &&
      shadowFlameCanMove(s, u),
  );
const pursuitTargets = (s: GameState) =>
  s.staging.filter(
    (u) =>
      enemy(u) &&
      !card(u.code).is_unique &&
      !playerEffectImmune(s, u, P.pursuit) &&
      !morgulCannotLeave(s, u) &&
      shadowFlameCanMove(s, u) &&
      !batch4Scenario(s).cannotLeave?.(s, u, false),
  );

/** Called immediately after starting heroes, before opening hands and any other setup. */
export function shadowEastPlayerSetup(s: GameState) {
  const contracts: { player: number; unit: Unit; side: "A" | "B" }[] = [],
    rings: { player: number; unit: Unit }[] = [];
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      // The selection is retained in customDeck metadata; a contract is never part of the draw deck.
      const contractCount =
        s.deck.filter((c) => c === P.fellowship).length ||
        s.customDeck?.[P.fellowship] ||
        0;
      if (contractCount) {
        requireRule(
          contractCount === 1,
          "Choose at most one Fellowship contract.",
        );
        contracts.push({ player, unit: make(s, P.fellowship), side: "A" });
        s.deck = s.deck.filter((c) => c !== P.fellowship);
      }
      const index = s.deck.indexOf(P.ring);
      if (index >= 0) {
        s.deck.splice(index, 1);
        rings.push({ player, unit: make(s, P.ring) });
      }
      const smeagol = s.heroes.find((u) => u.code === P.smeagol);
      if (smeagol)
        state(s).smeagol = {
          id: smeagol.id,
          owner: player,
          stinkersAdded: false,
        };
    });
  if (!contracts.length && !rings.length && !s.shadowEastPlayers) return;
  const q = state(s);
  q.contracts = contracts;
  q.pendingRings = rings;
  if (rings.length)
    prepend(s, fx("eastPlayerRingChooseOwner", { player: firstPlayer(s) }));
}
/** Recipe setup may replace the encounter deck; add the two physical Stinkers afterwards. */
export function shadowEastPlayerEncounterSetup(s: GameState) {
  const smeagol = s.shadowEastPlayers?.smeagol;
  if (smeagol && !smeagol.stinkersAdded) {
    s.encounterDeck.push(P.stinker, P.stinker);
    shuffle(s, s.encounterDeck);
    smeagol.stinkersAdded = true;
  }
}
export function shadowEastPlayerCheck(s: GameState) {
  if (s.status !== "playing") return;
  for (const smeagol of globalCharacters(s).filter(
    (u) => u.code === P.smeagol && !u.blanked,
  ))
    for (const a of [...smeagol.attachments])
      discardAttachment(s, smeagol, a, false, false);
  if (s.status !== "playing") return;
  const q = s.shadowEastPlayers;
  if (!q) return;
  if (
    q.ring &&
    !globalCharacters(s).some((u) =>
      u.attachments.some((a) => a.id === q.ring!.id),
    )
  ) {
    lose(s, "The One Ring has left play. The players lose the game.");
    return;
  }
  const currentRing = shadowEastRing(s);
  if (q.ring && currentRing?.attachment.id === q.ring.id) {
    q.ring.player = currentRing.player;
    q.ring.heroId = currentRing.host.id;
  }
  for (const contract of q.contracts) {
    const p = seatView(s, contract.player);
    if (
      contract.side === "A" &&
      [...p.heroes, ...p.allies].filter((u) => card(u.code).is_unique)
        .length === 9
    ) {
      contract.side = "B";
      log(s, "Fellowship · The company of nine is complete.", "good");
    }
  }
  const gollum = shadowEastGollum(s);
  if (gollum && !gollum.blanked) {
    const controller = ownerOf(s, gollum);
    const first = firstPlayer(seatView(s, controller));
    if (controller !== first) forOwner(s, first, () => engage(s, gollum));
  }
}
export function shadowEastPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.pursuit)
    return allActiveLocations(s).filter(
      (u) =>
        !u.attachments.some((a) => a.code === P.pursuit) &&
        !playerEffectImmune(s, u, code),
    );
  if (code === P.ruling)
    return s.engaged.filter(
      (u) =>
        !hasTrait(u, "Nazgûl") &&
        !hasTrait(u, "Nazgul") &&
        !playerEffectImmune(s, u, code),
    );
  return undefined;
}
export function shadowEastPlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  const allyProblem = shadowEastPlayerAllyProblem(s, u.code);
  if (allyProblem) return allyProblem;
  if (u.code === P.ring || u.code === P.fellowship)
    return "This card enters play during setup.";
  if (shadowEastIsMaster(u.code) && shadowEastRing(s)?.player !== activeSeat(s))
    return "Only the player who controls The One Ring may use a Master card.";
  if (
    [P.master, P.ruling, P.power].includes(u.code as typeof P.master) &&
    !ringReady(s)
  )
    return "This Master card requires The One Ring you control to be ready.";
  if (u.code === P.master)
    return "The Master Ring is a response to an encounter card just revealed from the encounter deck.";
  if (u.code === P.gathering && (s.phase !== "planning" || fateCannotSearch(s)))
    return "The Gathering Storm searches during the planning phase.";
  if (
    u.code === P.ruling &&
    (!["defense", "attack"].includes(s.phase) ||
      !shadowEastPlayerPlayTargets(s, u.code)!.length)
  )
    return "The Ruling Ring requires an eligible engaged enemy during combat.";
  if (u.code === P.power && !shadowEastRing(s))
    return "The Ring of Power requires its bearer in play.";
  return null;
}
export function shadowEastPlayerEventCost(
  s: GameState,
  u: Unit,
  _target?: string,
) {
  if (u.code === P.ruling || u.code === P.power) payRing(s);
}
export function shadowEastPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
  _eventId?: string,
  _amount?: number,
) {
  if (code === P.gathering) {
    prepend(s, fx("eastPlayerGatheringChoose"));
    return true;
  }
  if (code === P.ruling) {
    const e = s.engaged.find((u) => u.id === target);
    if (
      e &&
      !hasTrait(e, "Nazgûl") &&
      !hasTrait(e, "Nazgul") &&
      !playerEffectImmune(s, e, code)
    )
      s.used.push(`phase:${PREFIX}ruling:${e.id}`);
    return true;
  }
  if (code === P.power) {
    const ring = shadowEastRing(s);
    if (ring && ring.player === activeSeat(s)) {
      readyCharacter(s, ring.host);
      s.used.push(`phase:${PREFIX}power:${ring.host.id}:${s.nextId++}`);
    }
    return true;
  }
  return false;
}
export function shadowEastPlayerCardPlayed(
  s: GameState,
  c: Card,
  _u?: Unit,
  _fromHand?: boolean,
) {
  if (c.type_code === "ally")
    s.used = s.used.filter((k) => !k.startsWith(`phase:${PREFIX}gathering:`));
}
export function shadowEastPlayerAllyEntered(
  s: GameState,
  u: Unit,
  _played = false,
  _fromHand = false,
) {
  if (!live(u)) return;
  if (u.code === P.merry || u.code === P.faramir)
    prepend(
      s,
      fx(
        u.code === P.merry ? "eastPlayerMerryOffer" : "eastPlayerFaramirOffer",
        { source: u.id, player: ownerOf(s, u) },
      ),
    );
}
export function shadowEastPlayerCharactersCommitted(
  s: GameState,
  units: Unit[],
) {
  for (const u of units.filter(
    (u) => u.code === P.frodo && live(u) && u.committed,
  ))
    if (
      u.resources > 0 &&
      heirsCanSpendResources(s, u) &&
      frodoTargets(s, u).length
    )
      prepend(
        s,
        fx("eastPlayerFrodoOffer", { source: u.id, player: ownerOf(s, u) }),
      );
}
export function shadowEastPlayerQuestSucceeded(s: GameState) {
  for (const player of seatIndices(s))
    forOwner(s, player, () => {
      const keys = s.used.filter((k) => k.startsWith(`phase:${PREFIX}frodo:`));
      s.used = s.used.filter((k) => !keys.includes(k));
      for (const _key of keys)
        prepend(s, fx("eastPlayerFrodoThreat", { player }));
    });
}
export function shadowEastPlayerEngaged(s: GameState, u: Unit) {
  if (engagementCost(s, u) <= stormcallerEffectiveThreat(s)) return;
  for (const pippin of s.allies.filter(
    (p) => p.code === P.pippin && live(p) && canReady(s, p, P.pippin),
  ))
    prepend(
      s,
      fx("eastPlayerPippinOffer", { source: pippin.id, player: activeSeat(s) }),
    );
}
export function shadowEastPlayerAttackKilled(
  s: GameState,
  u: Unit,
  ids: string[],
  engagedPlayer?: number,
) {
  if (engagedPlayer === undefined) return;
  for (const id of ids) {
    const derufin = get(s, id);
    if (
      derufin?.code === P.derufin &&
      live(derufin) &&
      !morgulCannotLeave(s, derufin)
    )
      prepend(
        s,
        fx("eastPlayerDerufinOffer", {
          source: id,
          player: ownerOf(s, derufin),
          owner: engagedPlayer,
          value: card(u.code).threat ?? 0,
        }),
      );
  }
}
export function shadowEastPlayerLocationExplored(
  s: GameState,
  u: Unit,
  _wasActive: boolean,
) {
  for (const a of u.attachments.filter(
    (a) => a.code === P.pursuit && !a.blanked && !a.facedown,
  ))
    prepend(
      s,
      fx("eastPlayerPursuitOffer", {
        source: a.id,
        code: a.code,
        player: attachmentController(s, u, a) ?? ownerOf(s, u),
        owner: a.owner ?? ownerOf(s, u),
      }),
    );
}
export function shadowEastPlayerTravelEntered(
  s: GameState,
  _u: Unit,
  actualTravel: boolean,
) {
  if (!actualTravel) return;
  for (const smeagol of allHeroes(s).filter(
    (u) => u.code === P.smeagol && live(u),
  ))
    prepend(
      s,
      fx("eastPlayerSmeagolOffer", {
        source: smeagol.id,
        player: ownerOf(s, smeagol),
      }),
    );
}
export function shadowEastPlayerCharacterLeft(
  s: GameState,
  u: Unit,
  controller: number,
) {
  const contract = shadowEastContract(s, controller);
  if (contract && contract.side === "B") {
    contract.side = "A";
    log(s, "Fellowship · A companion leaves the company.");
  }
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.used = s.used.filter(
        (k) =>
          ![
            `phase:${PREFIX}power:${u.id}:`,
            `round:${PREFIX}merry:${u.id}:`,
          ].some((prefix) => k.startsWith(prefix)),
      );
    });
}
export function shadowEastPlayerAttachmentLeft(
  s: GameState,
  _host: Unit,
  a: Attachment,
) {
  if (a.code === P.ring && s.shadowEastPlayers?.ring?.id === a.id)
    lose(s, "The One Ring has left play. The players lose the game.");
}

/** A transformed hero is still owned by the fellowship that selected him. */
export function shadowEastPlayerEliminated(s: GameState, player: number) {
  const info = s.shadowEastPlayers?.smeagol;
  if (!info || info.owner !== player) return;
  const gollum = shadowEastGollum(s);
  if (!gollum || gollum.id !== info.id) return;
  for (const seat of seatIndices(s))
    forOwner(s, seat, () => {
      s.engaged = s.engaged.filter((u) => u.id !== gollum.id);
    });
  s.staging = s.staging.filter((u) => u.id !== gollum.id);
  s.encounterDiscard.push(...gollum.shadows);
  gollum.shadows = [];
  seatView(s, player).removed.push(P.smeagol);
  log(s, "Gollum leaves the game with Sméagol's eliminated owner.");
}

/** Enemy removal already detached shadows and the engaged physical card. */
export function shadowEastPlayerEnemyDestination(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (u.code !== P.gollum) return false;
  if (!destruction) return false;
  const info = s.shadowEastPlayers?.smeagol;
  if (!info || info.id !== u.id) return false;
  const hero = {
    ...make(s, P.smeagol),
    id: u.id,
    owner: info.owner,
    exhausted: true,
  };
  forOwner(s, info.owner, () => s.heroes.push(hero));
  log(s, "Gollum is defeated and returns as Sméagol, exhausted.", "good");
  return true;
}
function flipSmeagol(s: GameState) {
  const hero = allHeroes(s).find((u) => u.code === P.smeagol);
  if (!hero) return;
  const owner = ownerOf(s, hero),
    oldStats = stats(s, hero);
  state(s).smeagol ??= { id: hero.id, owner, stinkersAdded: true };
  removeFromQuest(s, hero);
  forOwner(s, owner, () => {
    s.heroes = s.heroes.filter((u) => u.id !== hero.id);
  });
  characterLeftPlay(
    s,
    hero,
    owner,
    { zone: "captured", player: owner },
    oldStats.attack,
    (card(hero.code).traits ?? "")
      .split(".")
      .map((t) => t.trim())
      .filter(Boolean),
    true,
    "hero",
  );
  const gollum = { ...make(s, P.gollum), id: hero.id, owner, exhausted: false };
  forOwner(s, owner, () => s.engaged.push(gollum));
  if (owner !== firstPlayer(s))
    forOwner(s, firstPlayer(s), () => engage(s, gollum));
  log(s, "Sméagol flips to Gollum and engages the first player.", "danger");
}
export function shadowEastPlayerEncounter(
  s: GameState,
  code: string,
  _replay = false,
  _fromReveal = true,
) {
  if (code !== P.stinker) return false;
  if (!_replay) s.encounterDiscard.push(code);
  const gollum = shadowEastGollum(s);
  if (gollum)
    prepend(
      s,
      fx("immediateAttack", { target: gollum.id, player: ownerOf(s, gollum) }),
    );
  else flipSmeagol(s);
  return true;
}
export function shadowEastPlayerShadow(s: GameState, code: string) {
  if (code !== P.stinker) return false;
  const player = s.combat?.attackPlayer ?? activeSeat(s),
    gollum = shadowEastGollum(s);
  forOwner(s, player, () =>
    raiseThreat(
      s,
      gollum && ownerOf(s, gollum) === player ? 4 : 2,
      "encounter",
    ),
  );
  const attacker = get(s, s.combat?.enemyId);
  if (attacker) {
    const index = attacker.shadows
      .slice(0, attacker.revealedShadowCount ?? attacker.shadows.length)
      .lastIndexOf(code);
    const physical = removeShadowCard(attacker, index);
    if (physical) {
      s.encounterDeck.push(physical);
      shuffle(s, s.encounterDeck);
    }
  }
  return true;
}
/** Cancels the complete newly revealed card, before Doomed, Surge and When Revealed. */
export function shadowEastPlayerRevealOptions(
  s: GameState,
  code: string,
  resume: Effect,
): Option[] {
  if (/cannot be cancel/i.test(card(code).text ?? "")) return [];
  const ring = shadowEastRing(s);
  if (
    !ring ||
    ring.attachment.exhausted ||
    ring.attachment.blanked ||
    !playerOrder(s).includes(ring.player)
  )
    return [];
  const player = ring.player,
    view = seatView(s, player);
  const event = view.hand.find((u) => u.code === P.master);
  if (!event || !canPay(view, card(P.master))) return [];
  return [
    {
      id: `east-master-${player}`,
      label: "The Master Ring · Cancel this card and reveal another",
      code: P.master,
      ability: { player, source: event.id, code: event.code, type: "response" },
      effects: [
        fx("eventPlay", {
          code: P.master,
          source: event.id,
          player,
          costEffects: [fx("eastPlayerPayRing", { player })],
          effects: [
            fx("eastPlayerMasterCancel", {
              code,
              source: resume.source,
              revealOrigin: resume.revealOrigin,
              player: resume.player ?? activeSeat(s),
            }),
          ],
          cancelledEffects: [resume],
        }),
      ],
    },
  ];
}
export function handleShadowEastPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("eastPlayer")) return false;
  const source = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "eastPlayerRingChooseOwner": {
      const rings = state(s).pendingRings;
      if (rings.length === 1)
        prepend(
          s,
          fx("eastPlayerRingOwner", {
            owner: rings[0].player,
            player: rings[0].player,
          }),
        );
      else
        choose(
          s,
          "The One Ring · First player chooses its controller",
          rings.map((r) => ({
            id: String(r.player),
            label: `Player ${r.player + 1}`,
            effects: [
              fx("eastPlayerRingOwner", { owner: r.player, player: r.player }),
            ],
          })),
        );
      break;
    }
    case "eastPlayerRingOwner": {
      const q = state(s),
        chosen = q.pendingRings.find((r) => r.player === e.owner);
      if (!chosen) break;
      for (const r of q.pendingRings.filter((r) => r !== chosen))
        seatView(s, r.player).removed.push(P.ring);
      q.pendingRings = [chosen];
      const targets = s.heroes.filter(
        (u) =>
          shadowEastPlayerCanHaveAttachments(u) &&
          !heirsCannotHaveAttachments(u),
      );
      requireRule(
        targets.length,
        "The One Ring needs a starting hero who can bear attachments.",
      );
      choose(
        s,
        "The One Ring · Choose its bearer",
        targets.map((u) =>
          option(u, [
            fx("eastPlayerRingAttach", { target: u.id, player: chosen.player }),
          ]),
        ),
      );
      break;
    }
    case "eastPlayerRingAttach": {
      const q = state(s),
        ring = q.pendingRings.find((r) => r.player === activeSeat(s));
      requireRule(
        ring &&
          target &&
          s.heroes.some((u) => u.id === target.id) &&
          shadowEastPlayerCanHaveAttachments(target),
        "Choose an eligible hero you control.",
      );
      target!.attachments.push({
        id: ring!.unit.id,
        code: P.ring,
        owner: ring!.player,
        controller: ring!.player,
        exhausted: false,
      });
      q.ring = { player: ring!.player, id: ring!.unit.id, heroId: target!.id };
      q.pendingRings = [];
      const options = s.deck.flatMap((code, index) =>
        shadowEastIsMaster(code)
          ? [
              {
                id: String(index),
                label: card(code).name,
                code,
                effects: [
                  fx("eastPlayerRingSearch", {
                    value: index,
                    code,
                    player: activeSeat(s),
                  }),
                ],
              },
            ]
          : [],
      );
      choose(s, "The One Ring · Search your deck for a Master card", [
        ...options,
        {
          id: "skip",
          label: "Finish searching",
          effects: [
            fx("eastPlayerRingSearch", { value: -1, player: activeSeat(s) }),
          ],
        },
      ]);
      break;
    }
    case "eastPlayerRingSearch": {
      if ((e.value ?? -1) >= 0 && s.deck[e.value!] === e.code) {
        const u = takePlayerDeck(s, e.value!);
        s.hand.push(u);
        (state(s).setupHandIds ??= {})[activeSeat(s)] = [u.id];
      }
      shuffle(s, s.deck);
      break;
    }
    case "eastPlayerPayRing":
      payRing(s);
      break;
    case "eastPlayerMasterCancel": {
      s.encounterDiscard.push(e.code!);
      prepend(
        s,
        fx("reveal", {
          source: e.source,
          revealOrigin: e.revealOrigin,
          player: e.player,
        }),
      );
      break;
    }
    case "eastPlayerGatheringChoose": {
      const options = s.encounterDeck.slice(0, 5).flatMap((code, index) =>
        ["enemy", "ship-enemy"].includes(card(code).type_code)
          ? [
              {
                id: String(index),
                code,
                label: card(code).name,
                effects: [
                  fx("eastPlayerGatheringSelect", { value: index, code }),
                ],
              },
            ]
          : [],
      );
      choose(s, "The Gathering Storm · Search the top five encounter cards", [
        ...options,
        {
          id: "skip",
          label: "Finish searching",
          effects: [fx("eastPlayerGatheringSelect", { value: -1 })],
        },
      ]);
      break;
    }
    case "eastPlayerGatheringSelect": {
      if (
        (e.value ?? -1) >= 0 &&
        e.value! < 5 &&
        s.encounterDeck[e.value!] === e.code
      ) {
        s.encounterDeck.splice(e.value!, 1);
        const u = make(s, e.code!);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        s.used.push(`phase:${PREFIX}gathering:${threatOf(s, u)}`);
      }
      shuffle(s, s.encounterDeck);
      break;
    }
    case "eastPlayerMerryOffer":
      if (source && live(source))
        offer(s, source, "Merry · Encourage your unique allies", [
          fx("eastPlayerMerryResolve", { source: source.id }),
        ]);
      break;
    case "eastPlayerMerryResolve": {
      for (const u of s.allies.filter(
        (u) => card(u.code).is_unique && !playerEffectImmune(s, u, P.merry),
      ))
        s.used.push(`round:${PREFIX}merry:${u.id}:${s.nextId++}`);
      break;
    }
    case "eastPlayerFaramirOffer":
      if (source && live(source) && faramirTargets(s).length)
        offer(s, source, "Faramir · Engage an enemy", [
          fx("eastPlayerFaramirChoose", { source: source.id }),
        ]);
      break;
    case "eastPlayerFaramirChoose":
      choose(
        s,
        "Faramir · Choose a non-unique staging enemy",
        faramirTargets(s).map((u) =>
          option(u, [fx("eastPlayerFaramirEngage", { target: u.id })]),
        ),
      );
      break;
    case "eastPlayerFaramirEngage":
      if (target && faramirTargets(s).some((u) => u.id === target.id)) {
        engage(s, target);
        prepend(
          s,
          fx("eastPlayerFaramirDamage", {
            target: target.id,
            player: activeSeat(s),
          }),
        );
      }
      break;
    case "eastPlayerFaramirDamage":
      if (
        target &&
        s.engaged.some((u) => u.id === target.id) &&
        !playerEffectImmune(s, target, P.faramir)
      )
        damage(s, target.id, target.attachments.length ? 4 : 2);
      break;
    case "eastPlayerFrodoOffer":
      if (
        source &&
        live(source) &&
        source.resources > 0 &&
        heirsCanSpendResources(s, source) &&
        frodoTargets(s, source).length
      )
        offer(
          s,
          source,
          "Frodo Baggins · Ready another unique questing character",
          [fx("eastPlayerFrodoChoose", { source: source.id })],
        );
      break;
    case "eastPlayerFrodoChoose":
      if (source)
        choose(
          s,
          "Frodo Baggins · Choose a unique character",
          frodoTargets(s, source).map((u) =>
            option(u, [
              fx("eastPlayerFrodoReady", { source: source.id, target: u.id }),
            ]),
          ),
        );
      break;
    case "eastPlayerFrodoReady":
      if (
        source &&
        target &&
        frodoTargets(s, source).some((u) => u.id === target.id) &&
        source.resources > 0
      ) {
        spendResources(s, source, 1);
        readyCharacter(s, target);
        s.used.push(`phase:${PREFIX}frodo:${s.nextId++}`);
      }
      break;
    case "eastPlayerFrodoThreat":
      reduceThreat(s, 1, P.frodo);
      break;
    case "eastPlayerPippinOffer":
      if (source && live(source) && canReady(s, source, P.pippin))
        offer(
          s,
          source,
          "Pippin · Ready after engaging a more threatening enemy",
          [fx("eastPlayerPippinReady", { source: source.id })],
        );
      break;
    case "eastPlayerPippinReady":
      if (source) readyCharacter(s, source);
      break;
    case "eastPlayerDerufinOffer":
      if (source && live(source))
        offer(
          s,
          source,
          "Derufin · Discard to reduce the engaged player's threat",
          [{ ...e, kind: "eastPlayerDerufinResolve" }],
        );
      break;
    case "eastPlayerDerufinResolve":
      if (source && !morgulCannotLeave(s, source)) {
        discardCharacter(s, source);
        if (!get(s, source.id))
          forOwner(s, e.owner ?? activeSeat(s), () =>
            reduceThreat(s, e.value ?? 0, P.derufin),
          );
      }
      break;
    case "eastPlayerPursuitOffer":
      if (pursuitTargets(s).length)
        offer(
          s,
          { id: e.source!, code: P.pursuit, exhausted: false },
          "Put Off Pursuit · Find a location to lose an enemy",
          [{ ...e, kind: "eastPlayerPursuitDiscard" }],
        );
      break;
    case "eastPlayerPursuitDiscard": {
      let found: string | undefined;
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (card(code).type_code === "location") {
          found = code;
          break;
        }
      }
      if (!found) break;
      const index = s.encounterDiscard.lastIndexOf(found);
      s.encounterDiscard.splice(index, 1);
      const location = make(s, found);
      s.staging.push(location);
      choose(
        s,
        "Put Off Pursuit · Shuffle a staging enemy into the encounter deck",
        pursuitTargets(s).map((u) =>
          option(u, [fx("eastPlayerPursuitShuffle", { target: u.id })]),
        ),
      );
      break;
    }
    case "eastPlayerPursuitShuffle":
      if (target && pursuitTargets(s).some((u) => u.id === target.id)) {
        // Generic removal dispatches guard/captured-card consequences before changing the physical destination.
        const code = target.code;
        discardCharacter(s, target);
        if (!get(s, target.id)) {
          const index = s.encounterDiscard.lastIndexOf(code);
          if (index >= 0) {
            s.encounterDiscard.splice(index, 1);
            s.encounterDeck.push(code);
            shuffle(s, s.encounterDeck);
          }
        }
      }
      break;
    case "eastPlayerSmeagolOffer":
      if (source && live(source))
        offer(s, source, "Sméagol · Raise your threat to draw a card", [
          fx("eastPlayerSmeagolDraw", { source: source.id }),
        ]);
      break;
    case "eastPlayerSmeagolDraw":
      raiseThreat(s, 1, "cost");
      draw(s, 1);
      break;
    default:
      return false;
  }
  return true;
}
