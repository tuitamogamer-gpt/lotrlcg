import type {
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  canPay,
  choose,
  engagementCost,
  fx,
  get,
  make,
  prepend,
  requireRule,
  shuffle,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  discardCharacter,
  discardHandCard,
  discardLocation,
  enemyAddedToStaging,
  enterAlly,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatIndices,
  seatView,
} from "./table";
import { hasResourceIcon, hasTrait } from "./expansion-passives";
import { isAlly } from "./card-types";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { playerCardImmune } from "./card-immunity";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import { isSacked } from "./carrock";
import { canLeaveHand } from "./hand-rules";
import { batch4Scenario } from "./batch4-scenarios";
import { skipsFrameworkRefresh } from "./refresh-rules";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
export const SORROW_PLAYER = {
  gwaihir: "22108",
  archer: "22109",
  book: "22110",
  messenger: "22111",
  song: "22112",
  emissary: "22113",
  plan: "22114",
  pipe: "22115",
  smoke: "22116",
  wilyador: "22117",
  king: "22134",
} as const;
const P = SORROW_PLAYER;
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const option = (u: Unit, effects: Effect[], label = name(u)): Option => ({
  id: u.id,
  code: u.code,
  label,
  effects,
});
const live = (u: Unit) => !u.blanked && !isSacked(u);
const aLive = (a: Attachment) => !a.blanked && !a.facedown;
const state = (s: GameState) =>
  (s.landSorrowPlayers ??= { contracts: [], smoke: [], readied: [] });
/** Quest, staging and combat phases each count as one phase for printed limits. */
const phaseKey = (s: GameState) =>
  `${s.round}:${
    ["quest", "staging"].includes(s.phase)
      ? "quest"
      : ["attack", "defense"].includes(s.phase)
        ? "combat"
        : s.phase
  }`;
const isEagleAlly = (u: Unit) => isAlly(u) && hasTrait(u, "Eagle");
/** Heals go through the shared heal rules (healing caps and heal responses). */
const heal = (s: GameState, u: Unit, amount = 1) => {
  rhosgobelHeal(s, u, amount);
};
const readyable = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  live(u) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !batch4Scenario(s).cannotPlayerReadyCharacter?.(s, u) &&
  !playerEffectImmune(s, u, code);
/** Messenger of the King's attached ally, by its physical attachment. */
export const messengerHosted = (u: Unit) =>
  u.attachments.some((a) => a.code === P.king);
export function messengerDeckProblems(
  heroes: string[],
  cards: Record<string, number>,
) {
  if (!cards[P.king]) return [];
  return heroes.length > 2
    ? ["Messenger of the King allows at most two heroes during setup."]
    : [];
}
/** Printed sum added to the starting threat. X, dash and blank values count as 0. */
export const messengerThreat = (code: string) => {
  const c = card(code);
  return [c.willpower, c.attack, c.defense, c.health].reduce<number>(
    (n, v) => n + (Number.isFinite(Number(v)) ? Number(v) : 0),
    0,
  );
};
export const messengerCandidates = (s: GameState) => [
  ...new Set(
    s.deck.filter((code) => {
      const c = card(code);
      return (
        c.type_code === "ally" &&
        !!c.is_unique &&
        !["neutral", "encounter", "fellowship", "baggins"].includes(
          c.sphere_code,
        ) &&
        !allCharacters(s).some((u) => card(u.code).name === c.name)
      );
    }),
  ),
];
export function messengerSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      const count = s.deck.filter((c) => c === P.king).length;
      if (!count) return;
      requireRule(
        count === 1 && s.heroes.length <= 2,
        "Messenger of the King allows one contract and at most two starting heroes.",
      );
      s.deck = s.deck.filter((c) => c !== P.king);
      const unit = make(s, P.king);
      unit.owner = player;
      state(s).contracts.push({ player, id: unit.id, side: "A", unit });
      s.queue.push(fx("sorrowPlayerKingSetup", { player }));
    });
}
export function landSorrowPlayerEliminated(s: GameState, p: number) {
  const q = s.landSorrowPlayers;
  if (!q) return;
  for (const c of q.contracts.filter((c) => c.player === p && c.unit))
    forOwner(s, p, () => s.removed.push(c.unit!.code));
  q.contracts = q.contracts.filter((c) => c.player !== p);
  q.smoke = q.smoke.filter((x) => x.player !== p);
}
export function validateLandSorrowPlayers(
  s: GameState,
  unit: (v: unknown) => boolean,
) {
  const q = s.landSorrowPlayers;
  if (q === undefined) return true;
  const n = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  return (
    !!q &&
    Array.isArray(q.contracts) &&
    q.contracts.every(
      (c) =>
        !!c &&
        seatIndices(s).includes(c.player) &&
        typeof c.id === "string" &&
        (c.side === "A"
          ? unit(c.unit) && c.unit!.code === P.king && c.unit!.id === c.id
          : c.side === "B" &&
            c.unit === undefined &&
            typeof c.ally === "string"),
    ) &&
    new Set(q.contracts.map((c) => c.player)).size === q.contracts.length &&
    Array.isArray(q.smoke) &&
    q.smoke.every(
      (x) => !!x && seatIndices(s).includes(x.player) && n(x.amount),
    ) &&
    Array.isArray(q.readied) &&
    q.readied.every(
      (x) => !!x && typeof x.id === "string" && typeof x.key === "string",
    )
  );
}
export const landSorrowPlayerUnit = (s: GameState, id?: string) =>
  s.landSorrowPlayers?.contracts.find((c) => c.unit?.id === id)?.unit;
export const landSorrowPlayerPublic = (s: GameState) =>
  s.landSorrowPlayers
    ? {
        contracts: s.landSorrowPlayers.contracts.map((c) => ({
          player: c.player,
          id: c.id,
          side: c.side,
          ally: c.ally ?? null,
        })),
        smoke: s.landSorrowPlayers.smoke,
      }
    : undefined;
/** Gwaihir does not ready during the refresh phase's framework step. */
export const landSorrowPlayerSkipsRefresh = skipsFrameworkRefresh;
/** Messenger of the King: the attached character cannot be readied more than once per phase. */
export const landSorrowPlayerCannotReady = (s: GameState, u: Unit) =>
  messengerHosted(u) &&
  !!s.landSorrowPlayers?.readied.some(
    (x) => x.id === u.id && x.key === phaseKey(s),
  );
export function landSorrowPlayerCharacterReadied(s: GameState, u: Unit) {
  if (!messengerHosted(u)) return;
  const q = state(s),
    key = phaseKey(s);
  q.readied = q.readied.filter((x) => x.key === key && x.id !== u.id);
  q.readied.push({ id: u.id, key });
}
export function landSorrowPlayerStats(s: GameState, u: Unit) {
  const book = allHeroes(s).some(
    (h) =>
      h.committed && h.attachments.some((a) => a.code === P.book && aLive(a)),
  );
  return {
    will: book && hasTrait(u, "Hobbit") ? 1 : 0,
  };
}
export const landSorrowPlayerAttackBonus = (
  s: GameState,
  u: Unit,
  enemy: Unit,
) =>
  u.code === P.archer &&
  live(u) &&
  engagementCost(s, enemy) > effectiveThreat(s, ownerOf(s, u))
    ? 1
    : 0;
const pipes = (s: GameState, p: number) =>
  allCharacters(s).reduce(
    (n, u) =>
      n +
      u.attachments.filter(
        (a) =>
          aLive(a) &&
          /(?:^|\.)\s*Pipe\s*\./.test(card(a.code).traits ?? "") &&
          attachmentController(s, u, a) === p,
      ).length,
    0,
  );
export const landSorrowPlayerCostReduction = (s: GameState, _c: Card) =>
  s.landSorrowPlayers?.smoke
    .filter((x) => x.player === activeSeat(s))
    .reduce((n, x) => n + x.amount, 0) ?? 0;
/** The next card the player actually plays consumes every pending reduction. */
export function landSorrowPlayerCardPlayed(s: GameState) {
  const q = s.landSorrowPlayers;
  if (q) q.smoke = q.smoke.filter((x) => x.player !== activeSeat(s));
}
export function landSorrowPlayerPlayProblem(_s: GameState, code: string) {
  if (code === P.plan)
    return "Play Bilbo's Plan in its response window after you attack and destroy an enemy.";
  return null;
}
export function landSorrowPlayerEvent(s: GameState, code: string) {
  if (code !== P.smoke) return false;
  const amount = pipes(s, activeSeat(s));
  if (amount) state(s).smoke.push({ player: activeSeat(s), amount });
  return true;
}
export function landSorrowPlayerAttachmentPlayed(
  s: GameState,
  _host: Unit,
  a: Attachment,
  played: boolean,
) {
  if (played && a.code === P.pipe && s.deck.length)
    prepend(s, fx("sorrowPlayerPipe", { source: a.id, player: activeSeat(s) }));
}
export function landSorrowPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code === P.messenger && live(u))
    prepend(
      s,
      fx("sorrowPlayerMessenger", { source: u.id, player: ownerOf(s, u) }),
    );
  if (isEagleAlly(u)) gwaihirResponses(s);
}
function gwaihirResponses(s: GameState) {
  for (const g of allHeroes(s).filter(
    (h) => h.code === P.gwaihir && live(h) && h.exhausted,
  ))
    prepend(
      s,
      fx("sorrowPlayerGwaihir", { source: g.id, player: ownerOf(s, g) }),
    );
}
export function landSorrowPlayerCharacterLeft(
  s: GameState,
  u: Unit,
  lastKnownType: string,
  lastKnownTraits: string[],
) {
  if (
    ["ally", "objective-ally"].includes(lastKnownType) &&
    lastKnownTraits.includes("Eagle")
  )
    gwaihirResponses(s);
  const q = s.landSorrowPlayers;
  if (q) q.contracts = q.contracts.filter((c) => c.ally !== u.id);
}
/** Messenger of the King is immune to card effects while attached, and is removed with its host. */
export function landSorrowPlayerAttachmentLeaves(
  s: GameState,
  host: Unit,
  a: Attachment,
  leaving: boolean,
  byCardEffect: boolean,
) {
  if (a.code !== P.king) return false;
  if (!leaving && byCardEffect) return true;
  host.attachments = host.attachments.filter((x) => x.id !== a.id);
  const q = s.landSorrowPlayers;
  if (q) q.contracts = q.contracts.filter((c) => c.id !== a.id);
  seatView(s, a.owner ?? ownerOf(s, host)).removed.push(a.code);
  return true;
}
export function landSorrowPlayerQuestSucceeded(s: GameState) {
  const effects: Effect[] = [];
  for (const h of allHeroes(s))
    for (const a of h.attachments.filter(
      (a) => a.code === P.book && aLive(a) && !a.exhausted,
    ))
      effects.push(
        fx("sorrowPlayerBook", {
          target: h.id,
          source: a.id,
          player: attachmentController(s, h, a) ?? ownerOf(s, h),
        }),
      );
  for (const u of allCharacters(s).filter(
    (u) => u.code === P.emissary && u.committed && live(u),
  ))
    effects.push(
      fx("sorrowPlayerEmissary", { target: u.id, player: ownerOf(s, u) }),
    );
  prepend(s, ...effects);
}
export function landSorrowPlayerRoundEnd(s: GameState): Effect[] {
  return allCharacters(s)
    .filter((u) => u.code === P.wilyador && live(u))
    .map((u) =>
      fx("sorrowPlayerWilyador", { target: u.id, player: ownerOf(s, u) }),
    );
}
export function landSorrowPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  const players = [
    ...new Set(
      ids
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u)
        .map((u) => ownerOf(s, u)),
    ),
  ];
  for (const p of players)
    for (const e of seatView(s, p).hand.filter((h) => h.code === P.plan))
      prepend(s, fx("sorrowPlayerPlanOffer", { source: e.id, player: p }));
}
const songProblem = (s: GameState, host: Unit, a?: Attachment) =>
  !a || a.code !== P.song || !aLive(a)
    ? "Song of Healing is not active."
    : !host.damage
      ? "The attached hero has no damage."
      : !rhosgobelHealingAllowed(s, host)
        ? "The attached hero cannot be healed."
        : !s.hand.some(
              (u) =>
                canLeaveHand(u) &&
                !batch4Scenario(s).cannotDiscardHand?.(s, u, true),
            )
          ? "Discard a card from your hand to use Song of Healing."
          : null;
export const landSorrowPlayerAbilityLabel = (code: string) =>
  code === P.song ? "Song of Healing · Discard a card to heal 1" : undefined;
export const landSorrowPlayerAbilityProblem = (
  s: GameState,
  u: Unit,
  attachmentId?: string,
) =>
  songProblem(
    s,
    u,
    u.attachments.find((a) => a.id === attachmentId),
  );
export function useLandSorrowPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (!a || a.code !== P.song) return false;
  requireRule(!songProblem(s, u, a), songProblem(s, u, a) ?? "");
  // Any player may trigger it; the triggering player discards from their own hand.
  choose(
    s,
    "Song of Healing · Discard a card from your hand",
    s.hand
      .filter(
        (c) =>
          canLeaveHand(c) && !batch4Scenario(s).cannotDiscardHand?.(s, c, true),
      )
      .map((c) =>
        option(c, [
          fx("sorrowPlayerSongPay", {
            target: u.id,
            source: c.id,
            player: activeSeat(s),
          }),
        ]),
      ),
  );
  return true;
}
const tacticsHeroes = (s: GameState, p: number) =>
  seatView(s, p).heroes.filter(
    (h) => hasResourceIcon(h, "tactics") && h.resources > 0 && !isSacked(h),
  );
export function landSorrowPlayerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("sorrowPlayer")) return false;
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "sorrowPlayerKingSetup": {
      const c = s.landSorrowPlayers?.contracts.find(
        (c) => c.player === p && c.side === "A",
      );
      if (!c) break;
      const choices = messengerCandidates(s).map((code) => ({
        id: code,
        code,
        label: `${card(code).name} · +${messengerThreat(code)} starting threat`,
        effects: [fx("sorrowPlayerKingTake", { code, player: p })],
      }));
      choose(
        s,
        "Messenger of the King · Choose a non-neutral unique ally",
        choices.length
          ? choices
          : [
              {
                id: "none",
                label: "No eligible ally · The contract remains on side A",
                effects: [],
              },
            ],
      );
      break;
    }
    case "sorrowPlayerKingTake": {
      const q = state(s),
        c = q.contracts.find((c) => c.player === p && c.side === "A");
      const index = s.deck.indexOf(e.code ?? "");
      if (!c || index < 0 || !messengerCandidates(s).includes(e.code!)) break;
      const ally = takePlayerDeck(s, index);
      ally.owner = p;
      enterAlly(s, ally, false, false, false);
      const threat = messengerThreat(ally.code);
      s.threat += threat;
      s.startingThreat = (s.startingThreat ?? 0) + threat;
      const contract = c.unit!;
      ally.attachments.push({
        id: contract.id,
        code: P.king,
        owner: p,
        controller: p,
        exhausted: false,
      });
      c.side = "B";
      c.ally = ally.id;
      delete c.unit;
      s.allies = s.allies.filter((x) => x.id !== ally.id);
      s.heroes.push(ally);
      break;
    }
    case "sorrowPlayerGwaihir":
      if (
        source &&
        source.code === P.gwaihir &&
        readyable(s, source, P.gwaihir) &&
        !s.used.includes(`phase:sorrow-gwaihir:${source.id}`)
      )
        choosePlayerResponse(s, source.id, P.gwaihir, "Gwaihir · Ready", [
          {
            id: "ready",
            label: "Ready Gwaihir (limit once per phase)",
            effects: [
              fx("sorrowPlayerGwaihirReady", { target: source.id, player: p }),
            ],
          },
          skip,
        ]);
      break;
    case "sorrowPlayerGwaihirReady":
      if (u && !s.used.includes(`phase:sorrow-gwaihir:${u.id}`)) {
        s.used.push(`phase:sorrow-gwaihir:${u.id}`);
        readyCharacter(s, u);
      }
      break;
    case "sorrowPlayerMessenger": {
      if (!source || !live(source)) break;
      const players = playerOrder(s).filter((player) =>
        [...seatView(s, player).heroes, ...seatView(s, player).allies].some(
          (c) =>
            c.damage > 0 &&
            c.attachments.some((a) => card(a.code).sphere_code !== "encounter"),
        ),
      );
      if (players.length)
        choosePlayerResponse(
          s,
          source.id,
          P.messenger,
          "Dale Messenger · Choose a player to heal",
          [
            ...players.map((player) => ({
              id: `player-${player}`,
              label: `Player ${player + 1} heals characters with player attachments`,
              effects: [fx("sorrowPlayerMessengerHeal", { player })],
            })),
            skip,
          ],
        );
      break;
    }
    case "sorrowPlayerMessengerHeal":
      for (const c of [...s.heroes, ...s.allies].filter((c) =>
        c.attachments.some((a) => card(a.code).sphere_code !== "encounter"),
      ))
        if (!playerEffectImmune(s, c, P.messenger)) heal(s, c);
      break;
    case "sorrowPlayerSongPay": {
      const a = u?.attachments.find((a) => a.code === P.song);
      if (!u || songProblem(s, u, a) || !s.hand.some((c) => c.id === e.source))
        break;
      discardHandCard(s, e.source!);
      if (!playerEffectImmune(s, u, P.song)) heal(s, u);
      break;
    }
    case "sorrowPlayerBook": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a && aLive(a) && !a.exhausted)
        choosePlayerResponse(
          s,
          a.id,
          P.book,
          "Red Book of Westmarch · Add a resource",
          [
            {
              id: "use",
              label: `Exhaust Red Book · Add 1 resource to ${name(u)}`,
              effects: [
                fx("sorrowPlayerBookUse", {
                  target: u.id,
                  source: a.id,
                  player: p,
                }),
              ],
            },
            skip,
          ],
        );
      break;
    }
    case "sorrowPlayerBookUse": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a && !a.exhausted) {
        a.exhausted = true;
        prepend(s, fx("resource", { target: u.id, value: 1, player: p }));
      }
      break;
    }
    case "sorrowPlayerEmissary": {
      if (!u || !allCharacters(s).some((c) => c.id === u.id)) break;
      const payers = tacticsHeroes(s, p);
      choose(s, "Eagle Emissary · Pay 1 Tactics resource or discard it", [
        ...payers.map((h) =>
          option(
            h,
            [
              fx("resource", {
                target: h.id,
                value: -1,
                flag: true,
                player: p,
              }),
            ],
            `Pay 1 Tactics resource from ${name(h)}`,
          ),
        ),
        {
          id: "discard",
          label: "Discard Eagle Emissary",
          effects: [fx("sorrowPlayerDiscard", { target: u.id, player: p })],
        },
      ]);
      break;
    }
    case "sorrowPlayerDiscard":
      if (u && allCharacters(s).some((c) => c.id === u.id))
        discardCharacter(s, u);
      break;
    case "sorrowPlayerWilyador": {
      if (!u || !allCharacters(s).some((c) => c.id === u.id) || !live(u)) break;
      const payers = playerOrder(s).flatMap((player) =>
        seatView(s, player)
          .heroes.filter((h) => h.resources > 0 && !isSacked(h))
          .map((h) => ({ h, player })),
      );
      choose(s, "Wilyador · The players may spend 1 resource as a group", [
        ...payers.map(({ h, player }) => ({
          id: h.id,
          code: h.code,
          label: `Spend 1 resource from ${name(h)} (player ${player + 1})`,
          effects: [
            fx("resource", { target: h.id, value: -1, flag: true, player }),
          ],
        })),
        {
          id: "discard",
          label: "Discard Wilyador",
          effects: [fx("sorrowPlayerDiscard", { target: u.id, player: p })],
        },
      ]);
      break;
    }
    case "sorrowPlayerPipe": {
      if (!s.deck.length) break;
      choosePlayerResponse(
        s,
        e.source ?? P.pipe,
        P.pipe,
        "Spare Pipe · Search the top 5 cards for an event",
        [
          {
            id: "search",
            label: "Search the top 5 cards",
            effects: [fx("sorrowPlayerPipeSearch", { player: p })],
          },
          skip,
        ],
      );
      break;
    }
    case "sorrowPlayerPipeSearch": {
      const found = s.deck.slice(0, 5).flatMap((code, i) =>
        card(code).type_code === "event"
          ? [
              {
                id: String(i),
                code,
                label: card(code).name,
                effects: [
                  fx("sorrowPlayerPipeTake", { value: i, code, player: p }),
                ],
              },
            ]
          : [],
      );
      choose(s, "Spare Pipe · Add an event to your hand", [
        ...found,
        {
          id: "none",
          label: "Take no event · Shuffle",
          effects: [fx("sorrowPlayerShuffle", { player: p })],
        },
      ]);
      break;
    }
    case "sorrowPlayerPipeTake":
      if (e.value !== undefined && e.value < 5 && s.deck[e.value] === e.code)
        s.hand.push(takePlayerDeck(s, e.value));
      shuffle(s, s.deck);
      break;
    case "sorrowPlayerShuffle":
      shuffle(s, s.deck);
      break;
    case "sorrowPlayerPlanOffer": {
      const event = s.hand.find((h) => h.id === e.source);
      if (!event || !canPay(s, card(event.code))) break;
      choosePlayerResponse(
        s,
        event.id,
        P.plan,
        "Bilbo's Plan · After you destroy an enemy",
        [
          {
            id: event.id,
            code: event.code,
            label: "Play Bilbo's Plan",
            effects: [
              fx("eventPlay", {
                source: event.id,
                code: event.code,
                effects: [fx("sorrowPlayerPlan", { player: p })],
              }),
            ],
          },
          skip,
        ],
      );
      break;
    }
    case "sorrowPlayerPlan": {
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      let found: string | undefined;
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        s.encounterDiscard.push(code);
        if (card(code).type_code === "enemy") {
          found = code;
          break;
        }
      }
      if (!found) break;
      const enemyThreat = threatOf(s, {
        id: `plan:${found}`,
        code: found,
        exhausted: false,
        damage: 0,
        progress: 0,
        resources: 0,
        committed: false,
        attachments: [],
        boost: 0,
        attacked: false,
        shadows: [],
      });
      const locations = [...s.staging, ...allActiveLocations(s)].filter(
        (l) =>
          card(l.code).type_code === "location" &&
          !card(l.code).is_unique &&
          !playerCardImmune(l) &&
          threatOf(s, l) <= enemyThreat,
      );
      choose(s, `Bilbo's Plan · ${card(found).name} was discarded`, [
        ...locations.map((l) =>
          option(
            l,
            [
              fx("sorrowPlayerPlanTake", {
                code: found,
                target: l.id,
                player: p,
              }),
            ],
            `Add ${card(found!).name} to staging · Discard ${name(l)}`,
          ),
        ),
        {
          id: "skip",
          label: `Leave ${card(found).name} in the discard pile`,
          effects: [],
        },
      ]);
      break;
    }
    case "sorrowPlayerPlanTake": {
      const i = s.encounterDiscard.lastIndexOf(e.code ?? "");
      if (i < 0 || !u) break;
      s.encounterDiscard.splice(i, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      if (
        [...s.staging, ...allActiveLocations(s)].some((l) => l.id === u.id) &&
        !playerCardImmune(u)
      )
        prepend(s, fx("sorrowPlayerPlanDiscard", { target: u.id, player: p }));
      break;
    }
    case "sorrowPlayerPlanDiscard":
      if (
        u &&
        [...s.staging, ...allActiveLocations(s)].some((l) => l.id === u.id)
      )
        discardLocation(s, u);
      break;
    default:
      return false;
  }
  return true;
}
