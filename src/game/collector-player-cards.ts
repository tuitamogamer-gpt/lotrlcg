import { reduceThreat } from "./threat-reduction";
import { playerCardImmune } from "./card-immunity";
import { canGainResources } from "./core";
import { heirsCanSpendResources } from "./heirs-numenor";
import { spendResources } from "./core";
// Active rules completing the two printed Collector's Edition starter decks.
import { card, plain } from "./cards";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import {
  canPay,
  choose,
  fx,
  get,
  make,
  opts,
  prepend,
  requireRule,
  shuffle,
  skip,
  playCost,
  takePlayerDeck,
  putPlayerDeck,
  reorderPlayerDeck,
} from "./core";
import {
  allyCanEnter,
  damage,
  discardCharacter,
  discardPlayerDeck,
  enterAlly,
  exhaustCharacter,
  readyCharacter,
  returnAlly,
  spendEvent,
  enemyAddedToStaging,
} from "./board";
import {
  firstPlayer,
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import {
  attachmentHasTrait,
  effectiveKeyword,
  effectiveTraits,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { rhosgobelHeal, rhosgobelHealingAllowed } from "./rhosgobel";
import {
  effectCardPlayProblem,
  playCardFromEffect,
  playTargets,
} from "./actions";
import { currentQuestUnit } from "./quest-state";
import { gondorResourcesGained } from "./gondor-player-cards";

const codes = {
  gildor: "22081",
  nori: "131003",
  sellsword: "12083",
  courier: "12087",
  guardsman: "17002",
  fili: "131006",
  kili: "131007",
  galadriel: "142003",
  gimli: "143004",
  desperate: "145009",
  trader: "08006",
  thorin: "22001",
  defeat: "10122",
  azain: "12004",
  ioreth: "12117",
  lookout: "17062",
  stone: "141016",
  elrond: "142005",
  legolas: "143005",
  mablung: "144005",
  sentry: "09005",
  archer: "08087",
  pursuing: "08060",
} as const;
const affected = (u: Unit) => !playerCardImmune(u);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy" && affected(u),
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" &&
      affected(u) &&
      !/cannot (?:place|have) progress|progress cannot be placed|cannot be explored/i.test(
        plain(card(u.code).text),
      ),
  );
const spherePayers = (s: GameState, sphere: string, player = activeSeat(s)) =>
  seatView(s, player).heroes.filter(
    (h) =>
      h.resources > 0 &&
      heirsCanSpendResources(s, h) &&
      hasResourceIcon(h, sphere),
  );
const groupPayers = (s: GameState, sphere: string) =>
  playerOrder(s).flatMap((player) => spherePayers(s, sphere, player));
const used = (s: GameState, key: string) =>
  playerOrder(s).some((p) => seatView(s, p).used.includes(key));
const optional = (s: GameState, title: string, e: Effect, code?: string) =>
  choose(s, title, [
    { id: "use", label: "Use this response", code, effects: [e] },
    skip,
  ]);
const iorethTargets = (s: GameState) =>
  allCharacters(s).filter((u) => rhosgobelHealingAllowed(s, u));
const conditions = (s: GameState) =>
  [
    ...allCharacters(s),
    ...s.staging,
    ...allActiveLocations(s),
    ...(currentQuestUnit(s) ? [currentQuestUnit(s)!] : []),
  ].flatMap((u) =>
    u.attachments
      .filter(
        (a) =>
          attachmentHasTrait(a, "Condition") &&
          !card(a.code).text?.includes("Permanent"),
      )
      .map((a) => ({ u, a })),
  );
const partnerCode = (code: string) =>
  code === codes.fili ? codes.kili : codes.fili;
const dwarfPlayed = (s: GameState, u: Unit, player: number) =>
  hasTrait(u, "Dwarf") &&
  seatView(s, player).heroes.some(
    (h) => h.code === codes.nori && !h.blanked && !isSacked(h),
  );

export function collectorAllyEntered(
  s: GameState,
  u: Unit,
  played: boolean,
  fromHand = played,
) {
  const player = ownerOf(s, u),
    effects: Effect[] = [];
  if (played && fromHand && dwarfPlayed(s, u, player))
    effects.push(fx("collectorNoriResponse", { player }));
  if (u.blanked) return prepend(s, ...effects);
  if (
    [codes.fili, codes.kili].includes(u.code as typeof codes.fili) &&
    played &&
    fromHand &&
    s.phase === "planning"
  )
    effects.push(
      fx("collectorPartnerResponse", { source: u.id, code: u.code, player }),
    );
  if (u.code === codes.galadriel && played && fromHand)
    effects.push(fx("collectorGaladrielResponse", { source: u.id, player }));
  if (u.code === codes.guardsman && played && fromHand)
    effects.push(fx("collectorGuardsmanResponse", { source: u.id, player }));
  if (u.code === codes.courier && locations(s).length)
    effects.push(fx("collectorCourierResponse", { source: u.id, player }));
  if (u.code === codes.elrond)
    effects.push(fx("collectorElrondResponse", { source: u.id, player }));
  if (u.code === codes.mablung && enemies(s).length)
    effects.push(fx("collectorMablungResponse", { source: u.id, player }));
  if (u.code === codes.sentry && seatView(s, player).engaged.length)
    effects.push(
      fx("collectorSentryResponse", {
        source: u.id,
        value: seatView(s, player).engaged.length,
        player,
      }),
    );
  if (
    u.code === codes.archer &&
    enemies(s).some(
      (e) => !seatView(s, player).engaged.some((x) => x.id === e.id),
    )
  )
    effects.push(fx("collectorArcherResponse", { source: u.id, player }));
  prepend(s, ...effects);
}

export function collectorEncounterRevealed(s: GameState, code: string) {
  if (card(code).type_code !== "enemy") return;
  prepend(
    s,
    ...allCharacters(s)
      .filter((u) => u.code === codes.gimli && !u.blanked && u.exhausted)
      .map((u) =>
        fx("collectorGimliResponse", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function collectorEnemyCancelOptions(
  s: GameState,
  code: string,
  continuation: Effect,
): Option[] {
  if (
    card(code).type_code !== "enemy" ||
    !/When Revealed/i.test(card(code).text ?? "")
  )
    return [];
  return allCharacters(s)
    .filter((u) => u.code === codes.lookout && !u.blanked)
    .map((u) => ({
      id: `lookout-${u.id}`,
      label: `Discard Dúnedain Lookout${s.table ? ` · ${seatName(s, ownerOf(s, u))}` : ""}`,
      code: codes.lookout,
      effects: [
        fx("collectorLookoutDiscard", { source: u.id, player: ownerOf(s, u) }),
        { ...continuation, flag: true },
      ],
    }));
}
export const collectorEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) => seatView(s, player).used.includes(`round:andrath:${enemy.id}`);
export function collectorAttackersDeclared(s: GameState, ids: string[]) {
  prepend(
    s,
    ...ids
      .map((id) => get(s, id))
      .filter(
        (u): u is Unit =>
          !!u &&
          u.code === codes.thorin &&
          !u.blanked &&
          seatView(s, ownerOf(s, u)).deck.length > 0 &&
          seatView(s, ownerOf(s, u)).engaged.some(affected),
      )
      .map((u) =>
        fx("collectorThorinResponse", { source: u.id, player: ownerOf(s, u) }),
      ),
  );
}
export function collectorAttackKilled(
  s: GameState,
  enemy: Unit,
  ids: string[],
  lastKnownTraits = effectiveTraits(enemy),
) {
  const attackers = ids
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && !u.blanked);
  const legolas = attackers
    .filter((u) => u.code === codes.legolas)
    .map((u) =>
      fx("collectorLegolasResponse", { source: u.id, player: ownerOf(s, u) }),
    );
  const azain =
    groupPayers(s, "tactics").length &&
    enemies(s).some((u) =>
      effectiveTraits(u).some((t) => lastKnownTraits.includes(t)),
    )
      ? attackers
          .filter((u) => u.code === codes.azain)
          .map((u) =>
            fx("collectorAzainResponse", {
              source: u.id,
              ids: lastKnownTraits,
              player: ownerOf(s, u),
            }),
          )
      : [];
  prepend(s, ...legolas, ...azain);
}
export function collectorDefendersDeclared(s: GameState, ids: string[]) {
  const sentinel = ids
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && effectiveKeyword(u, "Sentinel"));
  if (!sentinel.length) return;
  prepend(
    s,
    ...playerOrder(s).flatMap((player) =>
      seatView(s, player)
        .hand.filter((u) => u.code === codes.desperate)
        .map((u) =>
          fx("collectorDesperateResponse", {
            source: u.id,
            ids: sentinel.map((u) => u.id),
            player,
          }),
        ),
    ),
  );
}
export function collectorEnemyAttackFinished(
  s: GameState,
  defenderIds: string[],
  noDamage: boolean,
) {
  if (noDamage)
    for (const id of defenderIds) {
      const u = get(s, id);
      if (u) readyCharacter(s, u);
    }
}
export const collectorRoundEndEffects = (s: GameState): Effect[] =>
  allCharacters(s).flatMap((u) =>
    !u.blanked && u.code === codes.sellsword
      ? [
          fx("collectorSellswordPayment", {
            source: u.id,
            player: firstPlayer(s),
          }),
        ]
      : !u.blanked &&
          [codes.galadriel, codes.elrond].includes(
            u.code as typeof codes.galadriel,
          )
        ? [fx("collectorRoundDiscard", { source: u.id, player: ownerOf(s, u) })]
        : [],
  );
export const collectorLocationQuestBonus = (u: Unit) =>
  u.attachments.filter(
    (a) => a.code === codes.stone && !a.blanked && !a.facedown,
  ).length;
export function collectorLocationExplored(
  s: GameState,
  u: Unit,
  attachments: Attachment[] = u.attachments,
) {
  prepend(
    s,
    ...attachments
      .filter((a) => a.code === codes.stone && !a.blanked && !a.facedown)
      .map((a) =>
        fx("collectorElfStoneResponse", {
          source: a.id,
          value: firstPlayer(s),
          player: a.owner ?? 0,
        }),
      ),
  );
}
export function collectorQuestDefeated(
  s: GameState,
  _questCode: string,
  attachments: Attachment[],
) {
  prepend(
    s,
    ...attachments
      .filter((a) => a.code === codes.defeat && !a.blanked && !a.facedown)
      .map((a) =>
        fx("collectorLongDefeatResponse", {
          source: a.id,
          owner: a.owner ?? 0,
          player: a.owner ?? 0,
        }),
      ),
  );
}

export function collectorPlayProblem(
  s: GameState,
  code: string,
): string | null {
  if (code === codes.desperate)
    return "Desperate Defense responds to a Sentinel defender declaration; use its response window.";
  if (code === codes.pursuing && !s.allies.some((u) => hasTrait(u, "Silvan")))
    return "Pursuing the Enemy needs a Silvan ally you control to return to hand.";
  return null;
}
export function collectorPlayTargets(
  s: GameState,
  code: string,
): Unit[] | null {
  if (code === codes.pursuing)
    return s.allies.filter((u) => hasTrait(u, "Silvan"));
  if (code === codes.stone) return allActiveLocations(s).filter(affected);
  if (code === codes.defeat) {
    const quest = currentQuestUnit(s);
    return quest && !quest.attachments.some((a) => a.code === codes.defeat)
      ? [quest]
      : [];
  }
  return null;
}
export function collectorEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  if (code !== codes.pursuing) return false;
  const ally = s.allies.find((u) => u.id === target && hasTrait(u, "Silvan"));
  requireRule(ally, "Return a Silvan ally you control.");
  returnAlly(s, ally);
  choose(
    s,
    "Pursuing the Enemy · Choose a player",
    playerOrder(s).map((player) => ({
      id: `player-${player}`,
      label: seatName(s, player),
      effects: [fx("collectorPursueDamage", { player })],
    })),
  );
  return true;
}
export const collectorAbilityLabel = (code: string) =>
  code === codes.gildor
    ? "Spend Gildor's resource · draw a card"
    : code === codes.ioreth
      ? "Exhaust · spend Lore to heal 3"
      : code === codes.trader
        ? "Give Trader to another player"
        : undefined;
export const collectorAbilityAnyPlayer = (code: string) =>
  code === codes.ioreth;
export function collectorAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (
    u.code === codes.gildor &&
    (u.resources < 1 ||
      !heirsCanSpendResources(s, u) ||
      s.used.includes(`round:collector-gildor:${u.id}`))
  )
    return "Gildor needs one resource and may use this action once per round.";
  if (
    u.code === codes.ioreth &&
    (u.exhausted ||
      khazadCannotExhaust(u) ||
      !spherePayers(s, "lore").length ||
      !iorethTargets(s).length)
  )
    return "Ioreth needs to exhaust, a Lore resource, and a damaged character that can be healed.";
  if (
    u.code === codes.trader &&
    (livingSeats(s).length < 2 || used(s, `round:collector-trader:${u.id}`))
  )
    return "The Trader needs another player and may use this action once per round.";
  return undefined;
}
export function useCollectorAbility(s: GameState, u: Unit): boolean {
  if (!collectorAbilityLabel(u.code)) return false;
  requireRule(
    !collectorAbilityProblem(s, u),
    collectorAbilityProblem(s, u) ?? "",
  );
  if (u.code === codes.gildor) {
    spendResources(s, u, 1);
    s.used.push(`round:collector-gildor:${u.id}`);
    choose(
      s,
      "Gildor Inglorion · Choose a player",
      playerOrder(s).map((player) => ({
        id: `player-${player}`,
        label: seatName(s, player),
        effects: [fx("draw", { value: 1, player })],
      })),
    );
  }
  if (u.code === codes.ioreth)
    choose(
      s,
      "Ioreth · Spend a Lore resource",
      opts(spherePayers(s, "lore"), (h) => [
        fx("collectorIorethPay", { source: u.id, target: h.id }),
      ]),
    );
  if (u.code === codes.trader) {
    const player = activeSeat(s);
    s.used.push(`round:collector-trader:${u.id}`);
    choose(
      s,
      "Blue Mountain Trader · Give control",
      playerOrder(s)
        .filter((p) => p !== player)
        .map((recipient) => ({
          id: `player-${recipient}`,
          label: seatName(s, recipient),
          effects: [
            fx("collectorTraderGive", {
              source: u.id,
              value: player,
              player: recipient,
            }),
          ],
        })),
    );
  }
  return true;
}

function galadrielTop(s: GameState) {
  const top = s.deck.slice(0, 5),
    options = top.flatMap((code, index) => {
      if (
        card(code).type_code !== "attachment" ||
        (Number(card(code).cost) || 0) > 3
      )
        return [];
      const u = make(s, code);
      return effectCardPlayProblem(s, u, { putIntoPlay: true })
        ? []
        : [
            {
              id: `attachment-${index}`,
              label: card(code).name,
              code,
              effects: [
                fx("collectorGaladrielTarget", { value: index, ids: top }),
              ],
            },
          ];
    });
  choose(s, "Galadriel · Search top five", [
    ...options,
    {
      id: "skip",
      label: "Return all five in any order",
      effects: [fx("collectorTopOrderStart", { count: top.length })],
    },
  ]);
}
function orderTop(
  s: GameState,
  original: string[],
  remaining: number[],
  ordered: number[],
) {
  requireRule(
    original.every((code, index) => s.deck[index] === code),
    "Order the original viewed cards.",
  );
  if (!remaining.length) {
    reorderPlayerDeck(s, 0, ordered);
    return;
  }
  choose(
    s,
    "Galadriel · Next card on top",
    remaining.map((position, index) => ({
      id: `card-${index}`,
      label: card(original[position]).name,
      code: original[position],
      effects: [
        fx("collectorTopOrder", {
          ids: original,
          text: JSON.stringify({ remaining, ordered }),
          value: index,
        }),
      ],
    })),
    `${ordered.length} already ordered. Choose from the original remaining cards.`,
  );
}
function longDefeatAllocation(
  s: GameState,
  e: Effect,
  allocated: Record<string, number>,
) {
  const total = Object.values(allocated).reduce((n, value) => n + value, 0),
    remaining = 5 - total;
  const targets = [...s.heroes, ...s.allies].filter(
    (u) => rhosgobelHealingAllowed(s, u) && u.damage > (allocated[u.id] ?? 0),
  );
  choose(
    s,
    "The Long Defeat · Allocate up to 5 healing",
    [
      ...(remaining > 0
        ? opts(targets, (u) => [
            {
              ...e,
              kind: "collectorLongDefeatAmount",
              target: u.id,
              value: remaining,
              text: JSON.stringify(allocated),
            },
          ])
        : []),
      {
        id: "done",
        label: `Heal allocated damage · ${total}/5`,
        effects: [
          {
            ...e,
            kind: "collectorLongDefeatApply",
            text: JSON.stringify(allocated),
          },
        ],
      },
    ],
    "Each character receives one healing effect for its total allocation.",
  );
}

export function handleCollectorPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "collectorNoriResponse":
      if (
        s.heroes.some(
          (h) => h.code === codes.nori && !h.blanked && !isSacked(h),
        )
      )
        optional(
          s,
          "Nori · Played a Dwarf from hand",
          fx("collectorNoriThreat"),
          codes.nori,
        );
      return true;
    case "collectorNoriThreat":
      reduceThreat(s, 1, codes.nori);
      return true;
    case "collectorPartnerResponse":
      if (
        s.deck.some((code) => code === partnerCode(e.code!)) &&
        allyCanEnter(s, partnerCode(e.code!))
      )
        optional(
          s,
          `${card(e.code!).name} · Search for ${card(partnerCode(e.code!)).name}`,
          fx("collectorPartnerSearch", { code: partnerCode(e.code!) }),
          e.code,
        );
      return true;
    case "collectorPartnerSearch": {
      const index = s.deck.indexOf(e.code!);
      if (index >= 0 && allyCanEnter(s, e.code!)) {
        enterAlly(s, takePlayerDeck(s, index), false, false, false);
        shuffle(s, s.deck);
      } else shuffle(s, s.deck);
      return true;
    }
    case "collectorGaladrielResponse":
      optional(
        s,
        "Galadriel · Played from hand",
        fx("collectorGaladrielSearch"),
        codes.galadriel,
      );
      return true;
    case "collectorGaladrielSearch":
      galadrielTop(s);
      return true;
    case "collectorGaladrielTarget": {
      const code = e.ids?.[e.value ?? -1];
      requireRule(
        code && e.ids?.every((c, i) => s.deck[i] === c),
        "Use the original top five.",
      );
      const u = make(s, code);
      choose(
        s,
        "Galadriel · Attachment target",
        opts(playTargets(s, u), (target) => [
          fx("collectorGaladrielPut", {
            target: target.id,
            value: e.value,
            ids: e.ids,
          }),
        ]),
      );
      return true;
    }
    case "collectorGaladrielPut": {
      const index = e.value ?? -1,
        code = e.ids?.[index];
      requireRule(
        code && e.ids?.every((c, i) => s.deck[i] === c),
        "The original attachment must remain in the viewed cards.",
      );
      const u = make(s, code);
      requireRule(
        !effectCardPlayProblem(s, u, { putIntoPlay: true }) &&
          playTargets(s, u).some((t) => t.id === e.target),
        "The attachment needs a legal put-into-play target.",
      );
      const physical = takePlayerDeck(s, index);
      putPlayerDeck(s, physical, 0);
      playCardFromEffect(s, physical, { putIntoPlay: true, target: e.target });
      prepend(
        s,
        fx("collectorTopOrderStart", { count: (e.ids?.length ?? 1) - 1 }),
      );
      return true;
    }
    case "collectorTopOrderStart": {
      const original = s.deck.slice(0, e.count ?? 0);
      orderTop(
        s,
        original,
        original.map((_, index) => index),
        [],
      );
      return true;
    }
    case "collectorTopOrder": {
      const { remaining, ordered } = JSON.parse(e.text ?? "{}") as {
        remaining: number[];
        ordered: number[];
      };
      const index = e.value ?? -1;
      requireRule(
        Array.isArray(remaining) &&
          Array.isArray(ordered) &&
          index >= 0 &&
          index < remaining.length,
        "Choose an original remaining card.",
      );
      ordered.push(remaining.splice(index, 1)[0]);
      orderTop(s, e.ids ?? [], remaining, ordered);
      return true;
    }
    case "collectorGuardsmanResponse": {
      const eligible = s.engaged.filter(
        (u) => !card(u.code).is_unique && affected(u),
      );
      if (eligible.length)
        optional(
          s,
          "Andrath Guardsman · Played from hand",
          fx("collectorGuardsmanChoose"),
          codes.guardsman,
        );
      return true;
    }
    case "collectorGuardsmanChoose":
      choose(
        s,
        "Andrath Guardsman · Prevent an enemy attack",
        opts(
          s.engaged.filter((u) => !card(u.code).is_unique && affected(u)),
          (u) => [fx("collectorGuardsmanPrevent", { target: u.id })],
        ),
      );
      return true;
    case "collectorGuardsmanPrevent": {
      const enemy = s.engaged.find(
        (u) => u.id === e.target && !card(u.code).is_unique && affected(u),
      );
      requireRule(enemy, "Choose a non-unique enemy engaged with you.");
      s.used.push(`round:andrath:${enemy.id}`);
      return true;
    }
    case "collectorCourierResponse":
      optional(
        s,
        "Woodland Courier · Entered play",
        fx("collectorCourierChoose"),
        codes.courier,
      );
      return true;
    case "collectorCourierChoose":
      choose(
        s,
        "Woodland Courier · Location",
        opts(locations(s), (u) => [
          fx("locationProgress", {
            target: u.id,
            value: hasTrait(u, "Forest") ? 2 : 1,
          }),
        ]),
      );
      return true;
    case "collectorSentryResponse":
      optional(
        s,
        "Sarn Ford Sentry · Entered play",
        fx("draw", { value: e.value }),
        codes.sentry,
      );
      return true;
    case "collectorArcherResponse":
      if (enemies(s).some((u) => !s.engaged.some((x) => x.id === u.id)))
        optional(
          s,
          "Galadhon Archer · Entered play",
          fx("collectorArcherChoose"),
          codes.archer,
        );
      return true;
    case "collectorArcherChoose":
      choose(
        s,
        "Galadhon Archer · Enemy not engaged with you",
        opts(
          enemies(s).filter((u) => !s.engaged.some((x) => x.id === u.id)),
          (u) => [fx("damage", { target: u.id, value: 1 })],
        ),
      );
      return true;
    case "collectorElrondResponse":
      optional(
        s,
        "Elrond · Entered play",
        fx("collectorElrondChoose", { source: e.source }),
        codes.elrond,
      );
      return true;
    case "collectorElrondChoose":
      choose(s, "Elrond · Choose one", [
        ...(allHeroes(s).some((u) => rhosgobelHealingAllowed(s, u))
          ? [
              {
                id: "heal",
                label: "Heal all damage on one hero",
                effects: [
                  fx("collectorElrondHealChoose", { source: e.source }),
                ],
              },
            ]
          : []),
        ...(conditions(s).length || s.shackles > 0
          ? [
              {
                id: "condition",
                label: "Discard one Condition attachment",
                effects: [fx("collectorElrondCondition")],
              },
            ]
          : []),
        {
          id: "draw",
          label: "Each player draws one card",
          effects: playerOrder(s).map((player) =>
            fx("draw", { value: 1, player }),
          ),
        },
      ]);
      return true;
    case "collectorElrondHealChoose":
      choose(
        s,
        "Elrond · Heal a hero",
        opts(
          allHeroes(s).filter((u) => rhosgobelHealingAllowed(s, u)),
          (u) => [
            fx("heal", {
              target: u.id,
              value: u.damage,
              source: e.source,
              code: codes.elrond,
            }),
          ],
        ),
      );
      return true;
    case "collectorElrondCondition":
      choose(s, "Elrond · Condition attachment", [
        ...conditions(s).map(({ u, a }) => ({
          id: a.id,
          label: `${card(a.code).name} · ${card(u.code).name}`,
          code: a.code,
          effects: [fx("discardAttachment", { target: u.id, source: a.id })],
        })),
        ...(s.shackles > 0
          ? [
              {
                id: "shackles",
                label: "Iron Shackles · Top of your deck",
                code: "01105",
                effects: [fx("discardShackles")],
              },
            ]
          : []),
      ]);
      return true;
    case "collectorMablungResponse":
      optional(
        s,
        "Mablung · Entered play",
        fx("collectorMablungChoose"),
        codes.mablung,
      );
      return true;
    case "collectorMablungChoose":
      choose(
        s,
        "Mablung · Enemy",
        opts(enemies(s), (u) => [
          fx("collectorMablungRaise", { target: u.id }),
        ]),
      );
      return true;
    case "collectorMablungRaise": {
      const u = get(s, e.target);
      if (!u || !affected(u)) return true;
      u.tempEngagement = (u.tempEngagement ?? 0) + 5;
      choose(s, "Mablung · Move the chosen enemy?", [
        ...(s.engaged.some((x) => x.id === u.id)
          ? []
          : [
              {
                id: "engage",
                label: "Engage this enemy",
                effects: [fx("engage", { target: u.id })],
              },
            ]),
        ...(allEngaged(s).some((x) => x.id === u.id)
          ? [
              {
                id: "staging",
                label: "Return this enemy to staging",
                effects: [fx("collectorReturnEnemy", { target: u.id })],
              },
            ]
          : []),
        skip,
      ]);
      return true;
    }
    case "collectorReturnEnemy": {
      const u = get(s, e.target);
      if (u && allEngaged(s).some((x) => x.id === u.id)) {
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      return true;
    }
    case "collectorGimliResponse": {
      const u = get(s, e.source);
      if (u && !u.blanked && u.exhausted)
        optional(
          s,
          "Gimli · Enemy revealed",
          fx("ready", { target: u.id }),
          codes.gimli,
        );
      return true;
    }
    case "collectorLookoutDiscard": {
      const u = get(s, e.source);
      requireRule(
        u?.code === codes.lookout && !u.blanked,
        "The Lookout must remain in play to pay its discard cost.",
      );
      discardCharacter(s, u);
      return true;
    }
    case "collectorThorinResponse":
      if (s.deck.length && s.engaged.some(affected))
        optional(
          s,
          "Thorin Stonehelm · Declared attacker",
          fx("collectorThorinChoose"),
          codes.thorin,
        );
      return true;
    case "collectorThorinChoose":
      choose(
        s,
        "Thorin Stonehelm · Enemy engaged with you",
        opts(s.engaged.filter(affected), (u) => [
          fx("collectorThorinDamage", { target: u.id }),
        ]),
      );
      return true;
    case "collectorThorinDamage": {
      const u = s.engaged.find((u) => u.id === e.target && affected(u));
      requireRule(
        u && s.deck.length,
        "Discard a top deck card to damage an enemy engaged with you.",
      );
      discardPlayerDeck(s, 1);
      damage(s, u.id, 1);
      return true;
    }
    case "collectorLegolasResponse":
      optional(
        s,
        "Legolas · Participated in a killing attack",
        fx("draw", { value: 1 }),
        codes.legolas,
      );
      return true;
    case "collectorAzainResponse":
      if (
        get(s, e.source)?.code === codes.azain &&
        groupPayers(s, "tactics").length &&
        enemies(s).some((u) =>
          effectiveTraits(u).some((t) => e.ids?.includes(t)),
        )
      )
        optional(
          s,
          "Azain Silverbeard · Attack destroyed an enemy",
          fx("collectorAzainPayChoose", { source: e.source, ids: e.ids }),
          codes.azain,
        );
      return true;
    case "collectorAzainPayChoose":
      choose(
        s,
        "Azain Silverbeard · Spend a Tactics resource",
        groupPayers(s, "tactics").map((h) => ({
          id: h.id,
          label: `${card(h.code).name} · ${seatName(s, ownerOf(s, h))}`,
          code: h.code,
          effects: [
            fx("collectorAzainPay", {
              source: e.source,
              target: h.id,
              ids: e.ids,
              player: ownerOf(s, h),
            }),
          ],
        })),
      );
      return true;
    case "collectorAzainPay": {
      const h = spherePayers(s, "tactics").find((h) => h.id === e.target);
      requireRule(h, "Pay one Tactics resource.");
      spendResources(s, h, 1);
      choose(
        s,
        "Azain Silverbeard · Enemy sharing a trait",
        opts(
          enemies(s).filter((u) =>
            effectiveTraits(u).some((t) => e.ids?.includes(t)),
          ),
          (u) => [fx("damage", { target: u.id, value: 2 })],
        ),
      );
      return true;
    }
    case "collectorIorethPay": {
      const healer = get(s, e.source),
        hero = spherePayers(s, "lore").find((h) => h.id === e.target);
      requireRule(
        healer?.code === codes.ioreth &&
          !collectorAbilityProblem(s, healer) &&
          hero,
        "Ioreth and a Lore resource are required.",
      );
      spendResources(s, hero, 1);
      requireRule(exhaustCharacter(s, healer), "Ioreth cannot exhaust.");
      choose(
        s,
        "Ioreth · Heal 3 damage",
        opts(iorethTargets(s), (u) => [
          fx("heal", {
            target: u.id,
            value: 3,
            source: healer.id,
            code: healer.code,
          }),
        ]),
      );
      return true;
    }
    case "collectorTraderGive": {
      const trader = get(s, e.source),
        old = e.value ?? -1;
      requireRule(
        trader?.code === codes.trader &&
          livingSeats(s).includes(activeSeat(s)) &&
          activeSeat(s) !== old,
        "Choose another player to control the Trader.",
      );
      forOwner(s, old, () => {
        s.allies = s.allies.filter((u) => u.id !== trader.id);
      });
      s.allies.push(trader);
      choose(s, "Blue Mountain Trader · Move a resource or discard", [
        ...s.heroes
          .filter((h) => h.resources > 0 && affected(h))
          .flatMap((h) =>
            seatView(s, old)
              .heroes.filter(
                (destination) =>
                  affected(destination) && canGainResources(s, destination),
              )
              .map((destination) => ({
                id: `${h.id}-${destination.id}`,
                label: `${card(h.code).name} → ${card(destination.code).name}`,
                effects: [
                  fx("collectorTraderResource", {
                    source: trader.id,
                    target: h.id,
                    text: destination.id,
                    value: old,
                  }),
                ],
              })),
          ),
        {
          id: "discard",
          label: "Discard Blue Mountain Trader",
          effects: [fx("collectorRoundDiscard", { source: trader.id })],
        },
      ]);
      return true;
    }
    case "collectorTraderResource": {
      const h = s.heroes.find((h) => h.id === e.target && h.resources > 0),
        destination = seatView(s, e.value!).heroes.find(
          (h) => h.id === e.text && canGainResources(s, h),
        );
      requireRule(
        h && destination,
        "Move one resource from the new controller's hero to the previous controller's hero.",
      );
      h.resources--;
      destination.resources++;
      gondorResourcesGained(s, destination, 1, true);
      return true;
    }
    case "collectorPursueDamage":
      for (const u of [...s.engaged].filter(affected)) damage(s, u.id, 1);
      return true;
    case "collectorRoundDiscard": {
      const u = get(s, e.source);
      if (u) discardCharacter(s, u);
      return true;
    }
    case "collectorSellswordPayment": {
      const u = get(s, e.source);
      if (!u || u.blanked) return true;
      choose(s, "Dwarven Sellsword · End of round", [
        ...playerOrder(s).flatMap((player) =>
          spherePayers(s, "leadership", player).map((h) => ({
            id: h.id,
            label: `Spend ${card(h.code).name}'s Leadership resource${s.table ? ` · ${seatName(s, player)}` : ""}`,
            code: h.code,
            effects: [
              fx("collectorSellswordPay", {
                source: u.id,
                target: h.id,
                player,
              }),
            ],
          })),
        ),
        {
          id: "discard",
          label: "Discard Dwarven Sellsword",
          effects: [fx("collectorRoundDiscard", { source: u.id })],
        },
      ]);
      return true;
    }
    case "collectorSellswordPay": {
      const h = spherePayers(s, "leadership").find((h) => h.id === e.target),
        u = get(s, e.source);
      requireRule(
        h && u?.code === codes.sellsword,
        "Spend one Leadership resource to retain this Sellsword.",
      );
      spendResources(s, h, 1);
      return true;
    }
    case "collectorDesperateResponse":
      if (
        s.hand.some((u) => u.id === e.source && u.code === codes.desperate) &&
        canPay(s, card(codes.desperate)) &&
        e.ids?.some((id) => get(s, id))
      )
        choose(s, "Desperate Defense · Sentinel defender", [
          ...e.ids.flatMap((id) => {
            const u = get(s, id);
            return u
              ? [
                  {
                    id,
                    label: `Play Desperate Defense on ${card(u.code).name} · ${playCost(s, card(codes.desperate))} Spirit`,
                    code: codes.desperate,
                    effects: [
                      fx("collectorDesperatePlay", {
                        source: e.source,
                        target: id,
                      }),
                    ],
                  },
                ]
              : [];
          }),
          skip,
        ]);
      return true;
    case "collectorDesperatePlay": {
      const u = get(s, e.target);
      requireRule(
        s.combat &&
          u &&
          effectiveKeyword(u, "Sentinel") &&
          (
            s.combat.defenderIds ??
            (s.combat.defenderId ? [s.combat.defenderId] : [])
          ).includes(u.id),
        "A Sentinel must still be defending this attack.",
      );
      if (!spendEvent(s, codes.desperate, e.source)) return true;
      s.combat.defenseBonuses ??= {};
      s.combat.defenseBonuses[u.id] = (s.combat.defenseBonuses[u.id] ?? 0) + 2;
      s.combat.desperateDefenderIds = [
        ...new Set([...(s.combat.desperateDefenderIds ?? []), u.id]),
      ];
      return true;
    }
    case "collectorElfStoneResponse":
      if (seatView(s, e.value ?? 0).hand.some((u) => allyCanEnter(s, u.code)))
        optional(
          s,
          "Elf-stone · Active location explored",
          fx("collectorElfStoneChoose", { player: e.value }),
          codes.stone,
        );
      return true;
    case "collectorElfStoneChoose":
      choose(
        s,
        "Elf-stone · Put an ally from the first player's hand",
        opts(
          s.hand.filter((u) => allyCanEnter(s, u.code)),
          (u) => [fx("collectorElfStonePut", { target: u.id })],
        ),
      );
      return true;
    case "collectorElfStonePut": {
      const ally = s.hand.find((u) => u.id === e.target);
      requireRule(
        ally && allyCanEnter(s, ally.code),
        "Choose an eligible ally in the first player's hand.",
      );
      s.hand = s.hand.filter((u) => u.id !== ally.id);
      enterAlly(s, ally, false, false, false);
      return true;
    }
    case "collectorLongDefeatResponse":
      optional(
        s,
        "The Long Defeat · Quest defeated",
        fx("collectorLongDefeatPlayers", { source: e.source, owner: e.owner }),
        codes.defeat,
      );
      return true;
    case "collectorLongDefeatPlayers":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("collectorLongDefeatPlayer", {
            source: e.source,
            owner: e.owner,
            player,
          }),
        ),
      );
      return true;
    case "collectorLongDefeatPlayer":
      choose(s, "The Long Defeat · Draw or heal", [
        {
          id: "draw",
          label: "Draw 2 cards",
          effects: [fx("draw", { value: 2 })],
        },
        ...([...s.heroes, ...s.allies].some((u) =>
          rhosgobelHealingAllowed(s, u),
        )
          ? [
              {
                id: "heal",
                label: "Heal up to 5 damage among your characters",
                effects: [
                  fx("collectorLongDefeatAllocate", {
                    source: e.source,
                    owner: e.owner,
                    text: "{}",
                  }),
                ],
              },
            ]
          : []),
      ]);
      return true;
    case "collectorLongDefeatAllocate":
      longDefeatAllocation(s, e, JSON.parse(e.text ?? "{}"));
      return true;
    case "collectorLongDefeatAmount": {
      const u = [...s.heroes, ...s.allies].find((u) => u.id === e.target),
        allocated = JSON.parse(e.text ?? "{}") as Record<string, number>;
      requireRule(
        u && rhosgobelHealingAllowed(s, u),
        "Choose a damaged character you control.",
      );
      const maximum = Math.min(e.value ?? 0, u.damage - (allocated[u.id] ?? 0));
      choose(
        s,
        "The Long Defeat · Healing amount",
        Array.from({ length: maximum }, (_, i) => ({
          id: `heal-${i + 1}`,
          label: `Allocate ${i + 1} healing to ${card(u.code).name}`,
          code: u.code,
          effects: [
            fx("collectorLongDefeatAssign", {
              source: e.source,
              owner: e.owner,
              target: u.id,
              value: i + 1,
              text: e.text,
            }),
          ],
        })),
      );
      return true;
    }
    case "collectorLongDefeatAssign": {
      const allocated = JSON.parse(e.text ?? "{}") as Record<string, number>;
      allocated[e.target!] = (allocated[e.target!] ?? 0) + (e.value ?? 0);
      requireRule(
        Object.values(allocated).reduce((n, v) => n + v, 0) <= 5,
        "Allocate no more than five healing.",
      );
      longDefeatAllocation(s, e, allocated);
      return true;
    }
    case "collectorLongDefeatApply": {
      const allocated = JSON.parse(e.text ?? "{}") as Record<string, number>;
      requireRule(
        Object.values(allocated).reduce((n, v) => n + v, 0) <= 5,
        "Allocate no more than five healing.",
      );
      for (const [id, value] of Object.entries(allocated)) {
        const u = [...s.heroes, ...s.allies].find((u) => u.id === id);
        if (u)
          rhosgobelHeal(s, u, value, {
            source: e.source,
            code: codes.defeat,
            player: e.owner,
          });
      }
      return true;
    }
    default:
      return false;
  }
}
