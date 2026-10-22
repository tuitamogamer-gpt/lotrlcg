import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  cannotReady,
  choose,
  draw,
  engagementCost,
  fx,
  get,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  skip,
  stats,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  allyCanEnter,
  check,
  damage,
  destroy,
  discardCharacter,
  discardPlayerDeck,
  enemyAddedToStaging,
  enterAlly,
  readyCharacter,
  returnAlly,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  eachSeat,
  forOwner,
  globalEachSeat,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { isAlly, isHero } from "./card-types";
import { playerEffectImmune } from "./player-effect-immunity";
import { isSacked } from "./carrock";
import {
  effectCardPlayProblem,
  needsTarget,
  playTargets,
  resolvePlayerCard,
} from "./actions";
import {
  choosePlayerResponse,
  afterPlayerAbility,
} from "./player-ability-triggers";
import { fateCannotSearch } from "./fate-numenor";
import { dikeCannotLeaveDiscard } from "./deadmens-discard";
import { reduceThreat } from "./threat-reduction";
import { stormcallerEffectiveThreat } from "./threat-read";
import { movableHand } from "./hand-rules";
import { ringMakerCharacterLeft } from "./ring-maker-player";
import { shadowFlameCanMove } from "./shadow-flame";
import { morgulCannotLeave } from "./morgul-vale";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { batch4Scenario } from "./batch4-scenarios";
import { gondorResourcesGained } from "./gondor-player-cards";
import { applyCombatDamageConsequences } from "./combat";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import {
  ERED_FINAL_PLAYER as P,
  ERED_FINAL_PREFIX as PREFIX,
  eredFinalAttachmentLive as aLive,
  eredFinalGuardedCard,
  eredFinalMarks,
} from "./ered-final-player-support";

const live = (u: Unit) => !u.blanked && !isSacked(u);
const own = (s: GameState) =>
  allCharacters(s).filter((u) => ownerOf(s, u) === activeSeat(s));
const barred = (s: GameState, u: Unit, code: string) =>
  playerEffectImmune(s, u, code);
const readyable = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !drownedCannotReady(s) &&
  !desertCrossingCannotPlayerReady(s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !barred(s, u, code);
const enemy = (u: Unit) =>
  ["enemy", "ship-enemy"].includes(card(u.code).type_code);
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(enemy);
const choiceFor = (u: Unit, effects: Effect[]): Option => ({
  id: u.id,
  code: u.code,
  label: name(u),
  effects,
});
function response(
  s: GameState,
  source: string,
  code: string,
  title: string,
  effects: Effect[],
) {
  choosePlayerResponse(s, source, code, title, [
    { id: "use", code, label: "Use response", effects },
    skip,
  ]);
}
const effectPreview = (
  s: GameState,
  code: string,
  owner = activeSeat(s),
): Unit => ({
  id: `preview:${code}`,
  code,
  owner,
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
const canReturnSilvan = (s: GameState, u: Unit) =>
  isAlly(u) &&
  hasTrait(u, "Silvan") &&
  !barred(s, u, P.guide) &&
  !morgulCannotLeave(s, u);
const gafferTargets = (s: GameState) =>
  enemies(s).filter(
    (u) =>
      engagementCost(s, u) > stormcallerEffectiveThreat(s) &&
      !barred(s, u, P.gaffer),
  );
const staffReturnTargets = (s: GameState) =>
  s.engaged.filter(
    (u) =>
      enemy(u) &&
      !card(u.code).is_unique &&
      hasTrait(u, "Creature") &&
      !barred(s, u, P.staff) &&
      shadowFlameCanMove(s, u) &&
      !morgulCannotLeave(s, u),
  );
const uniquePair = (s: GameState) =>
  own(s).some(
    (istari) =>
      card(istari.code).is_unique &&
      hasTrait(istari, "Istari") &&
      own(s).some(
        (eagle) =>
          eagle.id !== istari.id &&
          card(eagle.code).is_unique &&
          hasTrait(eagle, "Eagle"),
      ),
  );
const attachmentAbility = (u: Unit, id?: string) =>
  id ? u.attachments.find((a) => a.id === id && aLive(a)) : undefined;
const fixedCost = (code: string) => {
  const printed = card(code).printed_stats?.cost ?? card(code).cost;
  return typeof printed === "number" ||
    (typeof printed === "string" && /^\d+$/.test(printed))
    ? Number(printed)
    : undefined;
};
const discardId = (s: GameState, player: number, index: number) =>
  s.table ? `discard-${player}-${index}` : `discard-${index}`;
function parseDiscard(s: GameState, id?: string) {
  const m = /^discard-(\d+)(?:-(\d+))?$/.exec(id ?? "");
  if (!m) return undefined;
  const player = m[2] === undefined ? activeSeat(s) : Number(m[1]),
    index = Number(m[2] ?? m[1]);
  return playerOrder(s).includes(player)
    ? { player, index, code: seatView(s, player).discard[index] }
    : undefined;
}
function reforgedTargets(s: GameState) {
  if (dikeCannotLeaveDiscard(s)) return [];
  return playerOrder(s).flatMap((player) =>
    seatView(s, player).discard.flatMap((code, index) => {
      const c = card(code),
        preview = effectPreview(s, code, player);
      return c.type_code === "attachment" &&
        /\bItem\./.test(c.traits ?? "") &&
        fixedCost(code) !== undefined &&
        !effectCardPlayProblem(s, preview, { putIntoPlay: false }) &&
        (!needsTarget(preview) || playTargets(s, preview).length)
        ? [{ ...preview, id: discardId(s, player, index) }]
        : [];
    }),
  );
}

export function eredFinalPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.guide) return own(s).filter((u) => canReturnSilvan(s, u));
  if (code === P.hunt)
    return s.staging.filter(
      (u) =>
        enemy(u) &&
        !card(u.code).is_unique &&
        !barred(s, u, code) &&
        !morgulCannotLeave(s, u) &&
        shadowFlameCanMove(s, u),
    );
  if (code === P.reforged) return reforgedTargets(s);
  if (code === P.sting)
    return allHeroes(s).filter(
      (u) => hasTrait(u, "Hobbit") && !barred(s, u, code),
    );
  if (code === P.shirt) return allHeroes(s).filter((u) => !barred(s, u, code));
  if (code === P.shield)
    return allCharacters(s).filter((u) => !barred(s, u, code));
  if (code === P.staff)
    return allCharacters(s).filter(
      (u) => card(u.code).name === "Radagast" && !barred(s, u, code),
    );
  return undefined;
}
export function eredFinalPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.shirefolk && !s.heroes.every((h) => hasTrait(h, "Hobbit")))
    return "The Shirefolk requires every hero you control to have the Hobbit trait.";
  if (u.code === P.guide && !eredFinalPlayerPlayTargets(s, u.code)!.length)
    return "Elf Guide needs a Silvan ally you can return as its cost.";
  if (
    u.code === P.hunt &&
    (!["defense", "attack"].includes(s.phase) ||
      !eredFinalPlayerPlayTargets(s, u.code)!.length)
  )
    return "The Great Hunt needs a non-unique staging enemy during combat.";
  if (u.code === P.reforged && !reforgedTargets(s).length)
    return "Reforged needs an eligible Item attachment in a player's discard pile.";
  if (
    [P.kingsReturn, P.debt].includes(u.code as typeof P.debt) &&
    fateCannotSearch(s)
  )
    return "This encounter effect prevents searching your deck.";
  if (u.code === P.debt && !uniquePair(s))
    return "Gwaihir's Debt requires a unique Istari and a different unique Eagle you control.";
  return null;
}
export function eredFinalPlayerEventCost(
  s: GameState,
  u: Unit,
  target?: string,
) {
  if (u.code !== P.guide) return;
  const ally = own(s).find((a) => a.id === target && canReturnSilvan(s, a));
  requireRule(
    ally,
    "Return a Silvan ally you control to pay Elf Guide's cost.",
  );
  returnAlly(s, ally!);
}
export function eredFinalPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
  _eventId?: string,
  _amount?: number,
) {
  if (code === P.guide) {
    choose(
      s,
      "Elf Guide · Choose a hero's resource pool",
      allHeroes(s)
        .filter((u) => canGainResources(s, u) && !barred(s, u, code))
        .map((u) =>
          choiceFor(u, [fx("eredFinalGain", { target: u.id, value: 1, code })]),
        ),
    );
    return true;
  }
  if (code === P.song) {
    const count = s.hand.length,
      cards = movableHand(s),
      full = cards.length === count;
    for (const u of cards) {
      s.hand = s.hand.filter((h) => h.id !== u.id);
      ringMakerCharacterLeft(s, u.id);
      putPlayerDeck(s, u);
    }
    shuffle(s, s.deck);
    if (full)
      draw(
        s,
        count +
          (own(s).some((u) => card(u.code).is_unique && hasTrait(u, "Hobbit"))
            ? 1
            : 0),
      );
    return true;
  }
  if (code === P.shirefolk) {
    reduceThreat(s, 4, code);
    return true;
  }
  if (code === P.hunt) {
    const u = eredFinalPlayerPlayTargets(s, code)!.find((u) => u.id === target);
    if (u) discardCharacter(s, u);
    return true;
  }
  if (code === P.kingsReturn) {
    prepend(s, fx("eredFinalKingsSearch"));
    return true;
  }
  if (code === P.debt) {
    prepend(s, fx("eredFinalDebtSearch"));
    return true;
  }
  if (code === P.reforged) {
    const selected = parseDiscard(s, target);
    if (selected && reforgedTargets(s).some((u) => u.id === target))
      prepend(
        s,
        fx("eredFinalReforgedChoose", {
          code: selected.code,
          owner: selected.player,
          value: selected.index,
        }),
      );
    return true;
  }
  return false;
}

export function eredFinalPlayerAbilityLabel(code: string) {
  return (
    {
      [P.gaffer]: "Gaffer Gamgee · Return to prevent an enemy attacking you",
      [P.raven]: "Messenger Raven · Return and name a card type",
      [P.staff]: "Radagast's Staff · Exhaust and choose an effect",
    } as Record<string, string>
  )[code];
}
export function eredFinalPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  id?: string,
) {
  const a = attachmentAbility(u, id),
    code =
      (id ? u.attachments.find((a) => a.id === id)?.code : undefined) ?? u.code;
  if (!eredFinalPlayerAbilityLabel(code)) return null;
  if (id && (!a || attachmentController(s, u, a) !== activeSeat(s)))
    return "Choose an active attachment you control.";
  if (!id && (!live(u) || ownerOf(s, u) !== activeSeat(s)))
    return "Choose an active character you control.";
  if (
    code === P.gaffer &&
    (!["defense", "attack"].includes(s.phase) ||
      barred(s, u, code) ||
      !gafferTargets(s).length)
  )
    return "Gaffer Gamgee needs combat and an eligible higher-engagement enemy.";
  if (code === P.raven && (s.phase !== "refresh" || barred(s, u, code)))
    return "Messenger Raven's Action is available during refresh.";
  if (code === P.staff && (!a || a.exhausted))
    return "Exhaust an active Radagast's Staff you control.";
  return null;
}
export function useEredFinalPlayerAbility(s: GameState, u: Unit, id?: string) {
  const a = attachmentAbility(u, id),
    code =
      (id ? u.attachments.find((a) => a.id === id)?.code : undefined) ?? u.code;
  if (!eredFinalPlayerAbilityLabel(code)) return false;
  const problem = eredFinalPlayerAbilityProblem(s, u, id);
  requireRule(!problem, problem ?? "");
  if (code === P.gaffer)
    choose(
      s,
      "Gaffer Gamgee · Choose an enemy",
      gafferTargets(s).map((t) =>
        choiceFor(t, [fx("eredFinalGaffer", { source: u.id, target: t.id })]),
      ),
    );
  if (code === P.raven) {
    const owner = u.owner ?? activeSeat(s);
    returnAlly(s, u);
    choose(
      s,
      "Messenger Raven · Name a card type",
      [
        "ally",
        "attachment",
        "event",
        "side-quest",
        "hero",
        "enemy",
        "location",
        "treachery",
        "objective",
        "quest",
      ].map((text) => ({
        id: text,
        label: text.replaceAll("-", " "),
        effects: [fx("eredFinalRavenPlayer", { text, owner })],
      })),
    );
  }
  if (code === P.staff) {
    a!.exhausted = true;
    choose(s, "Radagast's Staff · Choose one", [
      {
        id: "discount",
        label: "Reduce your next Creature ally's cost by 2",
        effects: [fx("eredFinalStaffDiscount", { source: a!.id })],
      },
      ...(allCharacters(s).some(
        (t) => isAlly(t) && hasTrait(t, "Creature") && readyable(s, t, code),
      )
        ? [
            {
              id: "ready",
              label: "Ready a Creature ally",
              effects: [fx("eredFinalStaffReadyChoose")],
            },
          ]
        : []),
      ...(staffReturnTargets(s).length
        ? [
            {
              id: "return",
              label: "Return an engaged Creature enemy to staging",
              effects: [fx("eredFinalStaffReturnChoose")],
            },
          ]
        : []),
    ]);
  }
  return true;
}

export function eredFinalPlayerCardPlayed(
  s: GameState,
  c: Card,
  _u?: Unit,
  _fromHand?: boolean,
) {
  if (c.type_code === "attachment")
    eachSeat(
      s,
      () => {
        s.used = s.used.filter(
          (k) => !k.startsWith(`phase:${PREFIX}toymaker:`),
        );
      },
      true,
    );
  if (c.type_code === "ally" && /\bCreature\./.test(c.traits ?? ""))
    s.used = s.used.filter((k) => !k.startsWith(`phase:${PREFIX}staff:`));
  if (!/\bCreature\./.test(c.traits ?? "")) return;
  for (const hero of s.heroes.filter((u) => u.code === P.radagast && live(u)))
    if (!eredFinalMarks(s).includes(`round:${PREFIX}radagast:${hero.id}`))
      prepend(
        s,
        fx("eredFinalRadagastOffer", {
          source: hero.id,
          player: activeSeat(s),
        }),
      );
}
export function eredFinalPlayerAllyEntered(
  s: GameState,
  u: Unit,
  played = false,
  fromHand = false,
) {
  if (!live(u)) return;
  if (u.code === P.defender)
    prepend(
      s,
      fx("eredFinalDefenderOffer", { source: u.id, player: ownerOf(s, u) }),
    );
  if (u.code === P.toymaker && played && fromHand)
    prepend(
      s,
      fx("eredFinalToymakerOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function eredFinalPlayerCharactersCommitted(
  s: GameState,
  units: Unit[],
) {
  for (const u of units.filter(
    (u) => u.code === P.bilbo && live(u) && u.committed,
  ))
    if (s.staging.some((t) => enemy(t) && !barred(s, t, P.bilbo)))
      prepend(
        s,
        fx("eredFinalBilboOffer", { source: u.id, player: ownerOf(s, u) }),
      );
}
export function eredFinalPlayerQuestSucceeded(s: GameState) {
  eachSeat(
    s,
    () => {
      const keys = s.used.filter((k) => k.startsWith(`phase:${PREFIX}bilbo:`));
      s.used = s.used.filter((k) => !keys.includes(k));
      for (const k of keys) {
        const target = k.split(":").at(-2)!;
        prepend(
          s,
          fx("eredFinalBilboDamage", { target, player: activeSeat(s) }),
        );
      }
    },
    true,
  );
}
function stingDeclarations(s: GameState, defendingEnemy: Unit, units: Unit[]) {
  if (barred(s, defendingEnemy, P.sting)) return;
  for (const u of units.filter(isHero))
    for (const a of u.attachments.filter((a) => a.code === P.sting && aLive(a)))
      prepend(
        s,
        fx("eredFinalStingOffer", {
          source: a.id,
          target: defendingEnemy.id,
          ids: [u.id],
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
}
export const eredFinalPlayerAttackersDeclared = stingDeclarations;
export const eredFinalPlayerDefendersDeclared = stingDeclarations;
export function eredFinalPlayerShadowTriggered(
  s: GameState,
  attackingEnemy: Unit,
  _code: string,
  effectiveShadow: boolean,
) {
  if (!effectiveShadow || !s.combat || s.combat.enemyId !== attackingEnemy.id)
    return;
  for (const u of allCharacters(s))
    for (const a of u.attachments.filter(
      (a) => a.code === P.shield && aLive(a) && !a.exhausted,
    ))
      if (!barred(s, u, P.shield))
        prepend(
          s,
          fx("eredFinalShieldOffer", {
            source: a.id,
            target: u.id,
            text: attackingEnemy.id,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          }),
        );
}
export function eredFinalPlayerUnitLeaving(s: GameState, u: Unit) {
  globalEachSeat(
    s,
    () => {
      s.used = s.used.filter(
        (k) =>
          ![
            `round:${PREFIX}defender:${u.id}`,
            `round:${PREFIX}radagast:${u.id}`,
            `round:${PREFIX}gaffer:${u.id}`,
          ].includes(k) &&
          !k.startsWith(`round:${PREFIX}debt:${u.id}:`) &&
          !(
            enemy(u) &&
            k.startsWith(`phase:${PREFIX}bilbo:`) &&
            k.split(":").at(-2) === u.id
          ),
      );
    },
    true,
  );
}
export function eredFinalPlayerRoundEnd(s: GameState): Effect[] {
  const effects: Effect[] = [];
  for (const u of allCharacters(s).filter(isAlly)) {
    const key = eredFinalMarks(s).find((k) =>
      k.startsWith(`round:${PREFIX}debt:${u.id}:`),
    );
    if (key)
      effects.push(
        fx("eredFinalDebtReturn", { target: u.id, player: ownerOf(s, u) }),
      );
  }
  return effects;
}

function preventionOptions(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
): Option[] {
  if (!isHero(u) || value <= 0) return [];
  const options: Option[] = [],
    visited = context.eredFinalPrevented ?? [];
  for (const a of u.attachments.filter(
    (a) => a.code === P.shirt && aLive(a) && !visited.includes(a.id),
  ))
    if (!barred(s, u, a.code))
      options.push({
        id: a.id,
        code: a.code,
        label: "Mithril Shirt · Reduce damage by 1",
        ability: {
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
          source: a.id,
          code: a.code,
          type: "response",
        },
        effects: [
          fx("eredFinalPrevent", {
            source: a.id,
            target: u.id,
            code: a.code,
            value,
            text: encodeDamageContext(context),
            count: 1,
          }),
        ],
      });
  const player = ownerOf(s, u);
  if (!barred(s, u, P.hound))
    for (const hound of seatView(s, player).allies.filter(
      (h) =>
        h.code === P.hound &&
        live(h) &&
        !barred(s, h, P.hound) &&
        !visited.includes(h.id),
    ))
      for (let count = 1; count <= Math.min(2, value); count++)
        options.push({
          id: `${hound.id}-${count}`,
          code: hound.code,
          label: `Discard Loyal Hound · Cancel ${count} damage`,
          ability: {
            player,
            source: hound.id,
            code: hound.code,
            type: "response",
          },
          effects: [
            fx("eredFinalPrevent", {
              source: hound.id,
              target: u.id,
              code: hound.code,
              value,
              count,
              text: encodeDamageContext(context),
            }),
          ],
        });
  return options;
}
export function offerEredFinalDamage(
  s: GameState,
  u: Unit,
  value: number,
  context: DamageContext,
) {
  if (
    context.cost ||
    context.bypassEredFinal ||
    !preventionOptions(s, u, value, context).length
  )
    return false;
  prepend(
    s,
    fx("eredFinalDamageWindow", {
      target: u.id,
      value,
      text: encodeDamageContext(context),
      player: ownerOf(s, u),
    }),
  );
  return true;
}
function resumeDamage(
  s: GameState,
  u: Unit | undefined,
  value: number,
  context: DamageContext,
) {
  if (!u) return;
  if (value <= 0) {
    check(s);
    return;
  }
  const remaining = stats(s, u).health - u.damage,
    attacker = get(s, context.enemyId);
  if (damage(s, u.id, value, context) && attacker && context.combatDamage)
    applyCombatDamageConsequences(s, u, attacker, value, remaining);
}

/** Guarded cards use both physical attachments and scenario-specific custody zones. */
export function eredFinalEnemyGuardingCard(s: GameState, u: Unit) {
  return (
    !!u.guarding ||
    !!u.cobasGuarding?.length ||
    u.attachments.some((a) => eredFinalGuardedCard(a.code)) ||
    !!s.roamRhovanion?.guardedPlayerCards.some((g) => g.guardId === u.id) ||
    !!s.roamRhovanion?.guarded.some((g) => g.guardId === u.id) ||
    !!s.wildsRhovanion?.guardedPlayerCards.some((g) => g.guardId === u.id) ||
    !!s.wildsRhovanion?.guardedHeroes.some((g) => g.guardId === u.id) ||
    !!s.mountGundabad?.guardedPlayerCards.some((g) => g.guardId === u.id) ||
    !!s.ghostFramsburg?.loot.some((g) => g.guardId === u.id) ||
    !!s.witheredHeath?.guards.some((g) => g.guardId === u.id) ||
    Object.values(s.cirithGurat?.guarding ?? {}).includes(u.id) ||
    Object.values(s.mordor?.guarding ?? {}).includes(u.id)
  );
}

export function handleEredFinalPlayerEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.source),
    t = get(s, e.target);
  switch (e.kind) {
    case "eredFinalGain":
      if (t && canGainResources(s, t) && !barred(s, t, e.code ?? P.guide)) {
        t.resources += e.value ?? 1;
        gondorResourcesGained(s, t, e.value ?? 1, true);
      }
      return true;
    case "eredFinalGaffer":
      if (
        u &&
        t &&
        u.code === P.gaffer &&
        gafferTargets(s).some((x) => x.id === t.id)
      ) {
        returnAlly(s, u);
        s.used.push(`round:${PREFIX}gaffer:${t.id}`);
      }
      return true;
    case "eredFinalRavenPlayer":
      choose(
        s,
        "Messenger Raven · Choose a player's top card",
        playerOrder(s).map((player) => ({
          id: `player-${player}`,
          label: `Player ${player + 1}`,
          effects: [{ ...e, kind: "eredFinalRavenTop", player }],
        })),
      );
      return true;
    case "eredFinalRavenTop": {
      const code = s.deck[0];
      if (!code) return true;
      const matches =
        card(code).type_code === e.text ||
        (e.text === "side-quest" &&
          card(code).type_code.endsWith("side-quest"));
      choose(
        s,
        `Messenger Raven · ${matches ? "Matching" : "Different"} card type`,
        [
          {
            id: "continue",
            code,
            label: `${card(code).name} · ${matches ? "Add to owner's hand" : "Discard"}`,
            effects: [
              { ...e, kind: "eredFinalRavenTake", code, flag: matches },
            ],
          },
        ],
      );
      return true;
    }
    case "eredFinalRavenTake":
      if (s.deck[0] === e.code) {
        if (e.flag) {
          const top = takePlayerDeck(s);
          forOwner(s, top.owner ?? activeSeat(s), () => s.hand.push(top));
        } else discardPlayerDeck(s, 1);
      }
      return true;
    case "eredFinalStaffDiscount":
      s.used.push(`phase:${PREFIX}staff:${e.source}`);
      return true;
    case "eredFinalStaffReadyChoose":
      choose(
        s,
        "Radagast's Staff · Ready a Creature ally",
        allCharacters(s)
          .filter(
            (t) =>
              isAlly(t) && hasTrait(t, "Creature") && readyable(s, t, P.staff),
          )
          .map((t) =>
            choiceFor(t, [fx("eredFinalStaffReady", { target: t.id })]),
          ),
      );
      return true;
    case "eredFinalStaffReady":
      if (t && readyable(s, t, P.staff)) readyCharacter(s, t);
      return true;
    case "eredFinalStaffReturnChoose":
      choose(
        s,
        "Radagast's Staff · Return an engaged Creature enemy",
        staffReturnTargets(s).map((t) =>
          choiceFor(t, [fx("eredFinalStaffReturn", { target: t.id })]),
        ),
      );
      return true;
    case "eredFinalStaffReturn":
      if (t && staffReturnTargets(s).some((x) => x.id === t.id)) {
        s.engaged = s.engaged.filter((x) => x.id !== t.id);
        s.staging.push(t);
        enemyAddedToStaging(s, t);
      }
      return true;
    case "eredFinalDefenderOffer":
      if (u && u.code === P.defender && live(u))
        response(s, u.id, u.code, "Greenwood Defender · Entered play", [
          fx("eredFinalDefender", { source: u.id }),
        ]);
      return true;
    case "eredFinalDefender":
      if (u) s.used.push(`round:${PREFIX}defender:${u.id}`);
      return true;
    case "eredFinalToymakerOffer":
      if (u && u.code === P.toymaker && live(u))
        response(s, u.id, u.code, "Erebor Toymaker · Played from hand", [
          fx("eredFinalToymaker", { source: u.id }),
        ]);
      return true;
    case "eredFinalToymaker":
      s.used.push(`phase:${PREFIX}toymaker:${e.source}`);
      return true;
    case "eredFinalRadagastOffer":
      if (
        u &&
        live(u) &&
        !eredFinalMarks(s).includes(`round:${PREFIX}radagast:${u.id}`)
      )
        response(s, u.id, u.code, "Radagast · Creature card played", [
          fx("eredFinalRadagast", { source: u.id }),
        ]);
      return true;
    case "eredFinalRadagast":
      if (u) s.used.push(`round:${PREFIX}radagast:${u.id}`);
      return true;
    case "eredFinalBilboOffer":
      if (
        u &&
        live(u) &&
        s.staging.some((t) => enemy(t) && !barred(s, t, P.bilbo))
      )
        response(s, u.id, u.code, "Bilbo Baggins · Committed to the quest", [
          fx("eredFinalBilboChoose", { source: u.id }),
        ]);
      return true;
    case "eredFinalBilboChoose":
      choose(
        s,
        "Bilbo Baggins · Choose a staging enemy",
        s.staging
          .filter((t) => enemy(t) && !barred(s, t, P.bilbo))
          .map((t) =>
            choiceFor(t, [
              fx("eredFinalBilbo", { source: e.source, target: t.id }),
            ]),
          ),
      );
      return true;
    case "eredFinalBilbo":
      if (u && t && !barred(s, t, P.bilbo)) {
        u.tempWill = (u.tempWill ?? 0) + threatOf(s, t);
        s.used.push(`phase:${PREFIX}bilbo:${u.id}:${t.id}:${s.nextId++}`);
      }
      return true;
    case "eredFinalBilboDamage":
      if (t && !barred(s, t, P.bilbo)) {
        const guarding = eredFinalEnemyGuardingCard(s, t);
        damage(s, t.id, guarding ? 2 : 1);
      }
      return true;
    case "eredFinalStingOffer": {
      const hero = get(s, e.ids?.[0]),
        a = hero?.attachments.find(
          (a) => a.id === e.source && a.code === P.sting && aLive(a),
        );
      if (a && t && !barred(s, t, P.sting))
        response(s, a.id, a.code, "Sting · Hero declared against an enemy", [
          fx("eredFinalStingDamage", { target: t.id }),
        ]);
      return true;
    }
    case "eredFinalStingDamage":
      if (t && !barred(s, t, P.sting)) damage(s, t.id, 1);
      return true;
    case "eredFinalShieldOffer": {
      const a = t?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.shield && aLive(a) && !a.exhausted,
      );
      if (a && s.combat?.enemyId === e.text && !barred(s, t!, P.shield))
        response(s, a.id, a.code, "Round Shield · Shadow effect triggered", [
          { ...e, kind: "eredFinalShield" },
        ]);
      return true;
    }
    case "eredFinalShield": {
      const combat = s.combat;
      const a = t?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.shield && aLive(a) && !a.exhausted,
      );
      if (
        a &&
        t &&
        combat &&
        combat.enemyId === e.text &&
        !barred(s, t, P.shield)
      ) {
        a.exhausted = true;
        combat.defenseBonuses ??= {};
        combat.defenseBonuses[t.id] = (combat.defenseBonuses[t.id] ?? 0) + 2;
      }
      return true;
    }
    case "eredFinalKingsSearch":
      if (!fateCannotSearch(s))
        choose(s, "The King's Return · Search for a Guarded attachment", [
          ...s.deck.flatMap((code, value) => {
            const preview = effectPreview(s, code);
            return eredFinalGuardedCard(code) &&
              !effectCardPlayProblem(s, preview, { putIntoPlay: true })
              ? [
                  {
                    id: `card-${value}`,
                    code,
                    label: card(code).name,
                    effects: [fx("eredFinalKingsEnter", { code, value })],
                  },
                ]
              : [];
          }),
          {
            id: "none",
            label: "Find no card · Shuffle",
            effects: [fx("eredFinalShuffle")],
          },
        ]);
      return true;
    case "eredFinalKingsEnter":
      if (e.value !== undefined && s.deck[e.value] === e.code) {
        const selected = takePlayerDeck(s, e.value);
        shuffle(s, s.deck);
        resolvePlayerCard(s, selected, undefined, 0, false, false);
      }
      return true;
    case "eredFinalShuffle":
      shuffle(s, s.deck);
      return true;
    case "eredFinalDebtSearch":
      if (!fateCannotSearch(s))
        choose(s, "Gwaihir's Debt · Search the top five", [
          ...s.deck.slice(0, 5).flatMap((code, value) =>
            card(code).type_code === "ally" &&
            /\b(?:Eagle|Istari)\./.test(card(code).traits ?? "") &&
            allyCanEnter(s, code)
              ? [
                  {
                    id: `card-${value}`,
                    code,
                    label: card(code).name,
                    effects: [fx("eredFinalDebtEnter", { code, value })],
                  },
                ]
              : [],
          ),
          {
            id: "none",
            label: "Find no ally · Shuffle",
            effects: [fx("eredFinalShuffle")],
          },
        ]);
      return true;
    case "eredFinalDebtEnter":
      if (
        e.value !== undefined &&
        s.deck[e.value] === e.code &&
        allyCanEnter(s, e.code!)
      ) {
        const selected = takePlayerDeck(s, e.value);
        shuffle(s, s.deck);
        enterAlly(s, selected);
        s.used.push(`round:${PREFIX}debt:${selected.id}:${s.nextId++}`);
      }
      return true;
    case "eredFinalDebtReturn":
      if (t && isAlly(t)) returnAlly(s, t);
      return true;
    case "eredFinalReforgedChoose": {
      const selected = parseDiscard(
        s,
        discardId(s, e.owner ?? activeSeat(s), e.value ?? -1),
      );
      if (!selected || selected.code !== e.code || dikeCannotLeaveDiscard(s))
        return true;
      const preview = effectPreview(s, selected.code, selected.player);
      if (effectCardPlayProblem(s, preview, { putIntoPlay: false }))
        return true;
      if (needsTarget(preview))
        choose(
          s,
          "Reforged · Choose an attachment target",
          playTargets(s, preview).map((t) =>
            choiceFor(t, [
              { ...e, kind: "eredFinalReforgedPlay", target: t.id },
            ]),
          ),
        );
      else prepend(s, { ...e, kind: "eredFinalReforgedPlay" });
      return true;
    }
    case "eredFinalReforgedPlay": {
      const owner = e.owner ?? activeSeat(s);
      if (
        seatView(s, owner).discard[e.value ?? -1] !== e.code ||
        dikeCannotLeaveDiscard(s)
      )
        return true;
      const preview = effectPreview(s, e.code!, owner);
      if (
        effectCardPlayProblem(s, preview, { putIntoPlay: false }) ||
        (needsTarget(preview) &&
          !playTargets(s, preview).some((t) => t.id === e.target))
      )
        return true;
      let physical!: Unit;
      forOwner(s, owner, () => {
        physical = takePlayerDiscard(s, e.value!);
      });
      resolvePlayerCard(s, physical, e.target, 0, true, false);
      return true;
    }
    case "eredFinalDamageWindow":
      if (t)
        choose(s, `Prevent damage · ${name(t)}`, [
          ...preventionOptions(s, t, e.value ?? 0, readDamageContext(e)),
          {
            id: "skip",
            label: `Deal ${e.value ?? 0} damage`,
            effects: [
              {
                ...e,
                kind: "eredFinalDamageResume",
                text: encodeDamageContext({
                  ...readDamageContext(e),
                  bypassEredFinal: true,
                }),
              },
            ],
          },
        ]);
      return true;
    case "eredFinalPrevent": {
      if (!t) return true;
      if (e.code === P.shirt)
        requireRule(
          t.attachments.some(
            (a) => a.id === e.source && a.code === P.shirt && aLive(a),
          ),
          "The responding Mithril Shirt must remain active.",
        );
      else {
        requireRule(
          u && u.code === P.hound && live(u) && ownerOf(s, u) === ownerOf(s, t),
          "Discard a Loyal Hound you control.",
        );
        destroy(s, u!, false, "discard", false);
      }
      const context = readDamageContext(e);
      afterPlayerAbility(
        s,
        fx("eredFinalDamageResume", {
          target: t.id,
          value: Math.max(0, (e.value ?? 0) - (e.count ?? 1)),
          text: encodeDamageContext({
            ...context,
            eredFinalPrevented: [
              ...(context.eredFinalPrevented ?? []),
              e.source!,
            ],
          }),
          player: ownerOf(s, t),
        }),
      );
      return true;
    }
    case "eredFinalDamageResume":
      resumeDamage(s, t, e.value ?? 0, readDamageContext(e));
      return true;
    default:
      return false;
  }
}
