import type { Attachment, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  cannotReady,
  choose,
  draw,
  fx,
  get,
  prepend,
  requireRule,
  shuffle,
  skip,
  spendResources,
  takePlayerDeck,
  putPlayerDeck,
} from "./core";
import {
  damage,
  destroy,
  discardAttachment,
  discardCharacter,
  discardLocation,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import {
  attachmentHasTrait,
  hasResourceIcon,
  hasTrait,
} from "./expansion-passives";
import { choosePlayerResponse } from "./player-ability-triggers";
import { playerEffectImmune } from "./player-effect-immunity";
import { isSacked } from "./carrock";
import { drownedCannotReady } from "./drowned";
import { desertCrossingCannotPlayerReady } from "./desert-crossing";
import { movableHand } from "./hand-rules";
import { fateCannotSearch } from "./fate-numenor";
import { isEnemy } from "./ships";
import { morgulCannotLeave } from "./morgul-vale";
import { dunlandCannotLeave } from "./dunland-trap";
import { trialsCannotLeave } from "./three-trials";
import { depthsCannotLeave } from "./depths";
import { stormcallerAreaCannotLeave } from "./stormcaller";
import { raceHaradCannotLeave } from "./race-harad";
import { progressLocation } from "./board";
import { enemyAddedToStaging } from "./board";
import { playTargets, resolvePlayerCard } from "./actions";
import { removePlayedEvent } from "./event-resolution";
import { batch4Scenario } from "./batch4-scenarios";
import {
  BATCH4_PLAYER as P,
  BATCH4_REFUGEE_COST,
} from "./batch4-player-support";
const live = (u: Unit) => !u.blanked && !isSacked(u);
const mark = (u: Unit, period = "phase") =>
  `${period}:batch4:${u.code}:${u.id}`;
const used = (s: GameState, key: string) =>
  s.used.includes(key) || !!s.table?.seats.some((p) => p.used.includes(key));
const canReady = (s: GameState, u: Unit, code: string) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !drownedCannotReady(s) &&
  !desertCrossingCannotPlayerReady(s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !playerEffectImmune(s, u, code);
const removable = (s: GameState, u: Unit, code: string) =>
  !playerEffectImmune(s, u, code) &&
  !morgulCannotLeave(s, u) &&
  !dunlandCannotLeave(u) &&
  !trialsCannotLeave(s, u) &&
  !depthsCannotLeave(s, u) &&
  !stormcallerAreaCannotLeave(s, u) &&
  !raceHaradCannotLeave(s, u) &&
  !batch4Scenario(s).cannotLeave?.(s, u);
const traitPair = (s: GameState, a: string, b: string) => {
  const own = [...s.heroes, ...s.allies].filter((u) => card(u.code).is_unique);
  return own.some(
    (u) => hasTrait(u, a) && own.some((v) => v.id !== u.id && hasTrait(v, b)),
  );
};
const enemies = (s: GameState, code: string) =>
  s.engaged.filter(
    (u) =>
      isEnemy(u) && !card(u.code).is_unique && !playerEffectImmune(s, u, code),
  );
const locations = (s: GameState, code: string) =>
  s.staging.filter(
    (u) =>
      card(u.code).type_code === "location" &&
      !card(u.code).is_unique &&
      removable(s, u, code),
  );
const allLocations = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) =>
      card(u.code).type_code === "location" && !playerEffectImmune(s, u, code),
  );
const conditions = (s: GameState) =>
  [
    ...allCharacters(s),
    ...s.staging,
    ...allEngaged(s),
    ...allActiveLocations(s),
  ].flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          attachmentHasTrait(a, "Condition") &&
          !/Permanent/i.test(card(a.code).text ?? "") &&
          !playerEffectImmune(s, host, P.bulwark),
      )
      .map((a) => ({ host, a })),
  );
const current = (u: Unit, id: string | undefined) =>
  u.attachments.find((a) => a.id === id && !a.blanked && !a.facedown);
const windReserves = (s: GameState) =>
  s.batch4WindReserves?.[activeSeat(s)] ?? 0;
const songHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      h.attachments.some((a) => !a.facedown && attachmentHasTrait(a, "Song")) &&
      canReady(s, h, P.burst),
  );
const damagedEnts = (s: GameState) =>
  [...s.heroes, ...s.allies].filter(
    (u) => u.damage > 0 && hasTrait(u, "Ent") && canReady(s, u, P.dam),
  );
export function batch4PlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  if (code === P.followed)
    return [...s.staging, ...allEngaged(s)].filter(
      (u) => isEnemy(u) && !playerEffectImmune(s, u, code),
    );
  if (code === P.fierce) return enemies(s, code);
  if (code === P.heirs) return locations(s, code);
  return undefined;
}
export function batch4PlayerPlayProblem(s: GameState, u: Unit) {
  if (
    u.code === P.toby &&
    !allCharacters(s).some((h) =>
      h.attachments.some(
        (a) =>
          attachmentHasTrait(a, "Pipe") &&
          attachmentController(s, h, a) === activeSeat(s),
      ),
    ) &&
    !allHeroes(s).some(
      (h) =>
        h.damage > 0 &&
        h.attachments.some((a) => attachmentHasTrait(a, "Pipe")) &&
        !playerEffectImmune(s, h, P.toby),
    )
  )
    return "Old Toby needs a controlled Pipe to draw or an affected damaged hero with a Pipe to heal.";
  if (u.code === P.wind)
    return "Encounter cards are set aside during setup and enter the encounter deck through Flight to the Sea.";
  if (u.code === P.fierce && !["defense", "attack"].includes(s.phase))
    return "Fierce Defense has Combat Actions.";
  if (u.code === P.fierce && !enemies(s, u.code).length)
    return "Choose a non-unique enemy engaged with you.";
  if (
    u.code === P.heirs &&
    (!traitPair(s, "Noldor", "Dúnedain") || !locations(s, u.code).length)
  )
    return "Heirs of Eärendil requires separate unique Noldor and Dúnedain characters you control, and a staging location.";
  if (u.code === P.burst && !songHeroes(s).length)
    return "There is no exhausted hero with a Song attachment that can be readied.";
  if (
    u.code === P.dam &&
    (!traitPair(s, "Ent", "Hobbit") || !damagedEnts(s).length)
  )
    return "The Dam Bursts needs separate unique Ent and Hobbit characters and an exhausted damaged Ent you control.";
  if (u.code === P.bulwark && (!s.allies.length || !conditions(s).length))
    return "Bulwark of the West needs an ally you can discard and a Condition attachment.";
  if (u.code === P.armory && fateCannotSearch(s))
    return "An encounter effect prevents searching your deck.";
  if (u.code === P.flight) {
    if (s.phase !== "planning")
      return "Flight to the Sea has a Planning Action.";
    if (!s.heroes.some((h) => hasTrait(h, "Noldor") || hasTrait(h, "Silvan")))
      return "Flight to the Sea needs a Noldor or Silvan hero you control.";
    if (!windReserves(s))
      return "There is no set-aside Wind from the Sea to shuffle into the encounter deck.";
  }
  return null;
}
export function batch4PlayerEvent(s: GameState, code: string, target?: string) {
  if (code === P.burst) {
    for (const h of songHeroes(s)) readyCharacter(s, h);
    return true;
  }
  if (code === P.toby) {
    const pipes = allCharacters(s).flatMap((h) =>
      h.attachments.filter(
        (a) =>
          !a.facedown &&
          attachmentHasTrait(a, "Pipe") &&
          attachmentController(s, h, a) === activeSeat(s),
      ),
    );
    const heals = allHeroes(s)
      .filter(
        (h) =>
          h.damage > 0 &&
          h.attachments.some(
            (a) => !a.facedown && attachmentHasTrait(a, "Pipe"),
          ) &&
          !playerEffectImmune(s, h, code),
      )
      .map((h) => fx("heal", { target: h.id, value: 1, code }));
    const tail = s.queue;
    s.queue = [];
    draw(s, pipes.length);
    s.queue.push(...heals, ...tail);
    return true;
  }
  if (code === P.fierce) {
    const u = enemies(s, code).find((u) => u.id === target);
    if (!u) return true;
    const options = [];
    if (["defense", "attack"].includes(s.phase))
      options.push({
        id: "damage",
        label: `Deal 3 damage to ${name(u)}`,
        effects: [fx("batch4PlayerFierceDamage", { target: u.id })],
      });
    if (s.threat >= 40 && removable(s, u, code))
      options.push({
        id: "discard",
        label: `Valour · Discard ${name(u)}`,
        effects: [fx("batch4PlayerFierceDiscard", { target: u.id })],
      });
    if (options.length === 1) prepend(s, ...options[0].effects);
    else if (options.length)
      choose(s, "Fierce Defense · Choose an action", options);
    return true;
  }
  if (code === P.heirs) {
    const u = locations(s, code).find((u) => u.id === target);
    if (u) {
      raiseThreat(s, card(u.code).quest ?? 0, "player-card");
      if (s.status === "playing") discardLocation(s, u);
    }
    return true;
  }
  if (code === P.dam) {
    for (const u of damagedEnts(s)) readyCharacter(s, u);
    return true;
  }
  if (code === P.bulwark) {
    choose(
      s,
      "Bulwark of the West · Choose the ally to discard",
      s.allies.map((u) => ({
        id: u.id,
        code: u.code,
        label: `Discard ${name(u)}`,
        effects: [fx("batch4PlayerBulwarkChoose", { source: u.id })],
      })),
    );
    return true;
  }
  if (code === P.armory) {
    if (s.threat >= 40)
      choose(s, "Open the Armory · Choose an action", [
        {
          id: "hand",
          label: "Search top 10 · Add a Weapon or Armor to your hand",
          effects: [fx("batch4PlayerArmorySearch")],
        },
        {
          id: "play",
          label: "Valour · Search top 5 and put a Weapon or Armor into play",
          effects: [fx("batch4PlayerArmorySearch", { flag: true })],
        },
      ]);
    else prepend(s, fx("batch4PlayerArmorySearch"));
    return true;
  }
  if (code === P.flight) {
    if (windReserves(s)) {
      (s.batch4WindReserves ??= {})[activeSeat(s)] = windReserves(s) - 1;
      s.encounterDeck.push(P.wind);
      shuffle(s, s.encounterDeck);
    }
    removePlayedEvent(s, code);
    return true;
  }
  return false;
}
export function batch4PlayerAbilityLabel(code: string) {
  if (code === P.hope)
    return "Spend 1 resource from this hero · +1 willpower · Limit 3 per phase";
  if (code === P.pipe)
    return "Exhaust Pipe · Put a hand card on your deck bottom · Draw 1";
  if (code === P.refugee)
    return "Exhaust Southron Refugee · Next Harad ally costs 1 less this phase";
  if (code === P.folco)
    return "Discard Folco Boffin · Reduce your threat by 7 · Once per game";
  if (code === P.daleKnight)
    return "Ready Knight of Dale · Spend 1 Leadership resource or use Valour";
  if (code === P.quickbeam)
    return "Deal 2 damage to Quickbeam · Ready him · Once per phase";
  if (code === P.ring)
    return "Exhaust Magic Ring · Raise threat by 1 · Heal, gain a resource, or ready hero";
  return undefined;
}
export function batch4PlayerAbilityProblem(s: GameState, u: Unit, id?: string) {
  const a = id ? current(u, id) : undefined,
    code = a?.code ?? u.code;
  if (!batch4PlayerAbilityLabel(code)) return null;
  if (id) {
    if (!a || attachmentController(s, u, a!) !== activeSeat(s))
      return "Only the attachment's controller can use its active text.";
  } else if (ownerOf(s, u) !== activeSeat(s) || !live(u))
    return "Only the character's controller can use its active text.";
  if (code === P.hope) {
    if (playerEffectImmune(s, u, code))
      return "The attached hero cannot be affected by this Song.";
    if (u.resources < 1) return "Attached hero needs a resource.";
    if (s.used.filter((k) => k === mark(u) + ":" + a!.id).length >= 3)
      return "Song of Hope has reached its three uses this phase.";
  }
  if (code === P.pipe && (a!.exhausted || !movableHand(s).length))
    return "Dúnedain Pipe needs a ready attachment and a movable card in your hand.";
  if (code === P.refugee && u.exhausted)
    return "Southron Refugee must be ready to exhaust.";
  if (code === P.folco && used(s, `game:batch4-folco:${activeSeat(s)}`))
    return "Folco Boffin has already been used this game.";
  if (code === P.quickbeam && (used(s, mark(u)) || !canReady(s, u, code)))
    return "Quickbeam needs to be exhausted, able to ready, and unused this phase.";
  if (code === P.daleKnight) {
    if (!canReady(s, u, code))
      return "Knight of Dale must be exhausted and able to ready.";
    if (s.threat >= 40 && !used(s, mark(u, "round") + ":valour")) return null;
    if (
      used(s, mark(u, "round") + ":paid") ||
      !s.heroes.some((h) => h.resources > 0 && hasResourceIcon(h, "leadership"))
    )
      return "Knight of Dale needs a Leadership resource or an unused Valour action.";
  }
  if (code === P.ring) {
    if (a!.exhausted) return "Magic Ring must be ready.";
    if (!u.damage && !canGainResources(s, u) && !canReady(s, u, code))
      return "Magic Ring needs an effect that can change the game state.";
  }
  return null;
}
export function useBatch4PlayerAbility(s: GameState, u: Unit, id?: string) {
  const a = id ? current(u, id) : undefined,
    code = a?.code ?? u.code;
  if (!batch4PlayerAbilityLabel(code)) return false;
  const problem = batch4PlayerAbilityProblem(s, u, id);
  requireRule(!problem, problem ?? "");
  if (code === P.hope) {
    spendResources(s, u, 1);
    s.used.push(mark(u) + ":" + a!.id);
    if (!playerEffectImmune(s, u, code)) u.tempWill = (u.tempWill ?? 0) + 1;
  }
  if (code === P.pipe)
    choose(
      s,
      "Dúnedain Pipe · Choose the physical card to place on your deck bottom",
      movableHand(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: `Put ${name(h)} on the bottom`,
        effects: [
          fx("batch4PlayerPipeUse", {
            source: a!.id,
            target: u.id,
            text: h.id,
          }),
        ],
      })),
    );
  if (code === P.refugee) {
    requireRule(
      exhaustCharacter(s, u),
      "Southron Refugee must exhaust as the cost.",
    );
    s.used.push(BATCH4_REFUGEE_COST + u.id);
  }
  if (code === P.folco) {
    s.used.push(`game:batch4-folco:${activeSeat(s)}`);
    const tail = s.queue;
    s.queue = [];
    discardCharacter(s, u);
    s.queue.push(
      fx("threat", { value: -7, source: u.id, code: P.folco }),
      ...tail,
    );
  }
  if (code === P.quickbeam) {
    s.used.push(mark(u));
    const tail = s.queue;
    s.queue = [];
    requireRule(
      damage(s, u.id, 2, { cost: true }),
      "Quickbeam must take the damage cost before he can ready.",
    );
    s.queue.push(fx("ready", { target: u.id }), ...tail);
  }
  if (code === P.daleKnight) {
    const options = [];
    if (s.threat >= 40 && !used(s, mark(u, "round") + ":valour"))
      options.push({
        id: "valour",
        label: "Valour · Ready without a resource",
        effects: [fx("batch4PlayerKnightReady", { source: u.id, flag: true })],
      });
    if (!used(s, mark(u, "round") + ":paid"))
      options.push(
        ...s.heroes
          .filter((h) => h.resources > 0 && hasResourceIcon(h, "leadership"))
          .map((h) => ({
            id: h.id,
            code: h.code,
            label: `Spend 1 Leadership resource from ${name(h)}`,
            effects: [
              fx("batch4PlayerKnightReady", { source: u.id, target: h.id }),
            ],
          })),
      );
    choose(s, "Knight of Dale · Choose the action and its payment", options);
  }
  if (code === P.ring) {
    const options = [];
    if (u.damage > 0 && !playerEffectImmune(s, u, code))
      options.push({
        id: "heal",
        label: "Heal 1 damage",
        effects: [
          fx("batch4PlayerRingUse", {
            source: a!.id,
            target: u.id,
            text: "heal",
          }),
        ],
      });
    if (canGainResources(s, u) && !playerEffectImmune(s, u, code))
      options.push({
        id: "resource",
        label: "Add 1 resource",
        effects: [
          fx("batch4PlayerRingUse", {
            source: a!.id,
            target: u.id,
            text: "resource",
          }),
        ],
      });
    if (canReady(s, u, code))
      options.push({
        id: "ready",
        label: "Ready attached hero",
        effects: [
          fx("batch4PlayerRingUse", {
            source: a!.id,
            target: u.id,
            text: "ready",
          }),
        ],
      });
    choose(s, "Magic Ring · Choose one effect", options);
  }
  return true;
}
export function batch4PlayerAttachmentPlayed(
  s: GameState,
  host: Unit,
  a: Attachment,
  played: boolean,
  fromHand: boolean,
) {
  if (
    [P.scout, P.noble].includes(a.code as typeof P.scout) &&
    !a.blanked &&
    !a.facedown &&
    played &&
    fromHand &&
    attachmentController(s, host, a) === activeSeat(s)
  )
    prepend(
      s,
      fx("batch4PlayerSkillOffer", {
        source: a.id,
        target: host.id,
        player: attachmentController(s, host, a) ?? ownerOf(s, host),
      }),
    );
}
export function batch4PlayerAllyEntered(s: GameState, u: Unit, played = false) {
  if (played && hasTrait(u, "Harad"))
    s.used = s.used.filter((k) => !k.startsWith(BATCH4_REFUGEE_COST));
  if (u.code === P.leaflock && !u.blanked) u.exhausted = true;
  if (u.code === P.halfast && live(u))
    prepend(
      s,
      fx("batch4PlayerHalfastOffer", { source: u.id, player: ownerOf(s, u) }),
    );
}
export function batch4PlayerCharactersCommitted(s: GameState, ids: string[]) {
  for (const id of ids) {
    const u = get(s, id);
    if (u?.code === P.ranger && live(u))
      prepend(
        s,
        fx("batch4PlayerRangerOffer", { source: u.id, player: ownerOf(s, u) }),
      );
  }
}
export function batch4PlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return defenders
    .filter(
      (u) =>
        u.code === P.defender &&
        live(u) &&
        seatView(s, ownerOf(s, u)).threat >= 40 &&
        !playerEffectImmune(s, enemy, P.defender),
    )
    .map((u) =>
      fx("batch4PlayerDefenderOffer", {
        source: u.id,
        target: enemy.id,
        player: ownerOf(s, u),
      }),
    );
}
export function batch4PlayerEnemyAttackResolved(
  s: GameState,
  enemy: Unit,
  defenders: string[],
) {
  for (const id of defenders) {
    const u = get(s, id);
    if (
      u?.code === P.fastred &&
      live(u) &&
      !used(s, mark(u)) &&
      get(s, enemy.id) &&
      removable(s, enemy, P.fastred)
    )
      prepend(
        s,
        fx("batch4PlayerFastredOffer", {
          source: u.id,
          target: enemy.id,
          player: ownerOf(s, u),
        }),
      );
  }
}
export function batch4PlayerAttackKilled(
  s: GameState,
  enemy: Unit,
  ids: string[],
) {
  for (const id of ids) {
    const u = get(s, id);
    if (u?.code === P.beorning && live(u) && allLocations(s, P.beorning).length)
      prepend(
        s,
        fx("batch4PlayerBeorningOffer", {
          source: u.id,
          value: card(enemy.code).threat ?? 0,
          player: ownerOf(s, u),
        }),
      );
  }
}
export function batch4PlayerSetup(s: GameState) {
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      (s.batch4WindReserves ??= {})[player] ??= 0;
      s.deck = s.deck.filter((c) => c !== P.wind);
    });
}
export function batch4PlayerWindRevealed(s: GameState, u: Unit) {
  if (u.code !== P.wind) return false;
  for (const h of allHeroes(s).filter(
    (h) => h.committed && h.exhausted && !cannotReady(h, s),
  ))
    readyCharacter(s, h, false);
  s.staging = s.staging.filter((v) => v.id !== u.id);
  const i = s.encounterDiscard.lastIndexOf(P.wind);
  if (i >= 0) s.encounterDiscard.splice(i, 1);
  s.removed.push(P.wind);
  return true;
}
export function batch4PlayerWindShadow(s: GameState, defender?: Unit) {
  const defenders = s.combat?.defenderIds?.length
    ? s.combat.defenderIds.map((id) => get(s, id)).filter((u): u is Unit => !!u)
    : defender
      ? [defender]
      : [];
  for (const u of defenders)
    if (u.exhausted && !cannotReady(u, s)) readyCharacter(s, u, false);
}
export function batch4PlayerSpecialAttachmentEntry(s: GameState, u: Unit) {
  if (u.code !== P.followed) return false;
  u.controller = activeSeat(s);
  s.staging.push(u);
  return true;
}
export function batch4PlayerEnemyEngaged(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  if (playerEffectImmune(s, enemy, P.followed)) return;
  const traps = s.staging.filter(
    (u) => u.code === P.followed && (u.controller ?? u.owner ?? 0) === player,
  );
  for (const trap of traps) {
    if (
      !playTargets(s, trap, { putIntoPlay: true }).some(
        (u) => u.id === enemy.id,
      )
    )
      continue;
    s.staging = s.staging.filter((u) => u.id !== trap.id);
    enemy.attachments.push({
      id: trap.id,
      code: trap.code,
      exhausted: false,
      owner: trap.owner ?? player,
      controller: player,
    });
  }
}
export function handleBatch4PlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("batch4Player")) return false;
  const source = get(s, e.source),
    target = get(s, e.target);
  switch (e.kind) {
    case "batch4PlayerFierceDamage":
      if (target && enemies(s, P.fierce).some((u) => u.id === target.id))
        damage(s, target.id, 3);
      break;
    case "batch4PlayerFierceDiscard":
      if (
        target &&
        enemies(s, P.fierce).some((u) => u.id === target.id) &&
        removable(s, target, P.fierce)
      )
        destroy(s, target, false);
      break;
    case "batch4PlayerPipeUse": {
      const a = target && current(target, e.source),
        h = movableHand(s).find((h) => h.id === e.text);
      requireRule(
        a &&
          a.code === P.pipe &&
          !a.exhausted &&
          attachmentController(s, target!, a) === activeSeat(s) &&
          h,
        "The ready physical Pipe and hand card must remain available.",
      );
      a.exhausted = true;
      s.hand = s.hand.filter((u) => u.id !== h!.id);
      // A foreign-owned hand card returns to its physical owner's deck.
      forOwner(s, h!.owner ?? activeSeat(s), () => {
        putPlayerDeck(s, h!);
      });
      draw(s, 1);
      break;
    }
    case "batch4PlayerKnightReady": {
      requireRule(
        source &&
          source.code === P.daleKnight &&
          live(source) &&
          canReady(s, source, P.daleKnight),
        "Knight of Dale must remain in play and able to ready.",
      );
      const key = mark(source!, "round") + (e.flag ? ":valour" : ":paid");
      requireRule(
        !used(s, key),
        "This Knight of Dale action was already used this round.",
      );
      if (e.flag)
        requireRule(
          s.threat >= 40,
          "The Valour action requires at least 40 threat.",
        );
      else {
        requireRule(
          target &&
            s.heroes.some((h) => h.id === target.id) &&
            hasResourceIcon(target, "leadership") &&
            target.resources > 0,
          "Spend a Leadership resource from your hero.",
        );
        spendResources(s, target!, 1);
      }
      s.used.push(key);
      readyCharacter(s, source!);
      break;
    }
    case "batch4PlayerRingUse": {
      const a = target && current(target, e.source);
      requireRule(
        a?.code === P.ring && !batch4PlayerAbilityProblem(s, target!, a.id),
        "The physical Magic Ring must remain ready and usable.",
      );
      a!.exhausted = true;
      raiseThreat(s, 1, "player-card");
      if (s.status !== "playing") break;
      if (e.text === "heal")
        prepend(
          s,
          fx("heal", {
            target: target!.id,
            value: 1,
            source: a!.id,
            code: P.ring,
          }),
        );
      if (e.text === "resource" && canGainResources(s, target!))
        prepend(
          s,
          fx("resource", {
            target: target!.id,
            value: 1,
            source: a!.id,
            code: P.ring,
          }),
        );
      if (e.text === "ready" && canReady(s, target!, P.ring))
        readyCharacter(s, target!);
      break;
    }
    case "batch4PlayerSkillOffer": {
      const a = target && current(target, e.source);
      if (
        a &&
        [P.scout, P.noble].includes(a.code as typeof P.scout) &&
        attachmentController(s, target!, a) === activeSeat(s)
      )
        choosePlayerResponse(
          s,
          a.id,
          a.code,
          `${card(a.code).name} · Draw a card?`,
          [
            {
              id: "use",
              label: "Draw 1 card",
              effects: [fx("draw", { value: 1 })],
            },
            skip,
          ],
        );
      break;
    }
    case "batch4PlayerHalfastOffer":
      if (source?.code === P.halfast && live(source))
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Halfast Gamgee · Add a resource to a hero?",
          [
            ...allHeroes(s)
              .filter(
                (h) =>
                  canGainResources(s, h) &&
                  !playerEffectImmune(s, h, P.halfast),
              )
              .map((h) => ({
                id: h.id,
                code: h.code,
                label: `Add 1 resource to ${name(h)}`,
                effects: [fx("batch4PlayerHalfastResource", { target: h.id })],
              })),
            skip,
          ],
        );
      break;
    case "batch4PlayerHalfastResource":
      if (
        target &&
        allHeroes(s).some((h) => h.id === target.id) &&
        canGainResources(s, target) &&
        !playerEffectImmune(s, target, P.halfast)
      )
        prepend(
          s,
          fx("resource", { target: target.id, value: 1, code: P.halfast }),
        );
      break;
    case "batch4PlayerRangerOffer": {
      const trapped = [...s.staging, ...allEngaged(s)].filter(
        (u) =>
          isEnemy(u) &&
          u.attachments.some(
            (a) => !a.facedown && attachmentHasTrait(a, "Trap"),
          ),
      );
      if (source?.code === P.ranger && live(source) && trapped.length)
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Emyn Arnen Ranger · Choose an enemy with a Trap attachment",
          [
            ...trapped.map((u) => ({
              id: u.id,
              code: u.code,
              label: `Gain +${card(u.code).threat ?? 0} willpower from ${name(u)}`,
              effects: [
                fx("batch4PlayerRangerBoost", {
                  source: source.id,
                  value: card(u.code).threat ?? 0,
                }),
              ],
            })),
            skip,
          ],
        );
      break;
    }
    case "batch4PlayerRangerBoost":
      if (source && !playerEffectImmune(s, source, P.ranger))
        source.tempWill = (source.tempWill ?? 0) + (e.value ?? 0);
      break;
    case "batch4PlayerDefenderOffer":
      if (
        source?.code === P.defender &&
        live(source) &&
        target &&
        s.threat >= 40 &&
        !playerEffectImmune(s, target, P.defender)
      )
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Defender of Cair Andros · Deal 1 damage to the attacking enemy?",
          [
            {
              id: "use",
              label: `Deal 1 damage to ${name(target)}`,
              effects: [
                fx("batch4PlayerDefenderDamage", { target: target.id }),
              ],
            },
            skip,
          ],
        );
      break;
    case "batch4PlayerDefenderDamage":
      if (target && !playerEffectImmune(s, target, P.defender))
        damage(s, target.id, 1);
      break;
    case "batch4PlayerFastredOffer":
      if (
        source?.code === P.fastred &&
        live(source) &&
        !used(s, mark(source)) &&
        target &&
        allEngaged(s).some((u) => u.id === target.id) &&
        removable(s, target, P.fastred)
      )
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Fastred · Return the enemy to staging to reduce threat by 2?",
          [
            {
              id: "use",
              label: `Return ${name(target)} to staging · Reduce your threat by 2`,
              effects: [
                fx("batch4PlayerFastredReturn", {
                  source: source.id,
                  target: target.id,
                }),
              ],
            },
            skip,
          ],
        );
      break;
    case "batch4PlayerFastredReturn": {
      requireRule(
        source?.code === P.fastred &&
          live(source) &&
          !used(s, mark(source)) &&
          target &&
          allEngaged(s).some((u) => u.id === target.id) &&
          removable(s, target, P.fastred),
        "Fastred and his attacked enemy must remain available.",
      );
      s.used.push(mark(source!));
      forOwner(s, ownerOf(s, target!), () => {
        s.engaged = s.engaged.filter((u) => u.id !== target!.id);
      });
      s.encounterDiscard.push(...target!.shadows);
      target!.shadows = [];
      delete target!.faceupShadows;
      target!.revealedShadowCount = 0;
      s.staging.push(target!);
      enemyAddedToStaging(s, target!);
      prepend(
        s,
        fx("threat", { value: -2, source: source!.id, code: P.fastred }),
      );
      break;
    }
    case "batch4PlayerBeorningOffer":
      if (
        source?.code === P.beorning &&
        live(source) &&
        allLocations(s, P.beorning).length
      )
        choosePlayerResponse(
          s,
          source.id,
          source.code,
          "Beorning Guardian · Discard it to place progress?",
          [
            ...allLocations(s, P.beorning).map((u) => ({
              id: u.id,
              code: u.code,
              label: `Discard Beorning Guardian · Place ${e.value ?? 0} progress on ${name(u)}`,
              effects: [
                fx("batch4PlayerBeorningUse", {
                  source: source.id,
                  target: u.id,
                  value: e.value,
                }),
              ],
            })),
            skip,
          ],
        );
      break;
    case "batch4PlayerBeorningUse": {
      requireRule(
        source?.code === P.beorning &&
          live(source) &&
          target &&
          allLocations(s, P.beorning).some((u) => u.id === target.id),
        "The Guardian and affected location must remain available.",
      );
      const tail = s.queue;
      s.queue = [];
      discardCharacter(s, source!);
      s.queue.push(
        fx("batch4PlayerBeorningProgress", {
          target: target!.id,
          value: e.value,
        }),
        ...tail,
      );
      break;
    }
    case "batch4PlayerBeorningProgress":
      if (target && allLocations(s, P.beorning).some((u) => u.id === target.id))
        progressLocation(s, target, e.value ?? 0);
      break;
    case "batch4PlayerBulwarkChoose":
      if (source && s.allies.some((u) => u.id === source.id))
        choose(
          s,
          "Bulwark of the West · Choose a Condition attachment",
          conditions(s).map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name} from ${name(host)}`,
            effects: [
              fx("batch4PlayerBulwarkUse", {
                source: source.id,
                target: host.id,
                text: a.id,
              }),
            ],
          })),
        );
      break;
    case "batch4PlayerBulwarkUse": {
      requireRule(
        source &&
          s.allies.some((u) => u.id === source.id) &&
          conditions(s).some(
            ({ host, a }) => host.id === e.target && a.id === e.text,
          ),
        "The physical ally cost and Condition must remain available.",
      );
      const tail = s.queue;
      s.queue = [];
      discardCharacter(s, source!);
      s.queue.push(
        fx("batch4PlayerBulwarkDiscard", { target: e.target, source: e.text }),
        ...tail,
      );
      break;
    }
    case "batch4PlayerBulwarkDiscard": {
      const a = target?.attachments.find(
        (a) => a.id === e.source && attachmentHasTrait(a, "Condition"),
      );
      if (a && !playerEffectImmune(s, target!, P.bulwark))
        discardAttachment(s, target!, a);
      break;
    }
    case "batch4PlayerArmorySearch": {
      if (fateCannotSearch(s)) break;
      const limit = e.flag ? 5 : 10;
      choose(s, `Open the Armory · Search the top ${limit} cards`, [
        ...s.deck.slice(0, limit).flatMap((code, index) => {
          const c = card(code);
          if (
            c.type_code !== "attachment" ||
            !/(?:^|\.\s*)(?:Weapon|Armor)\./.test(c.traits ?? "")
          )
            return [];
          return [
            {
              id: `deck-${index}`,
              code,
              label: c.name,
              effects: [
                fx("batch4PlayerArmoryTake", {
                  value: index,
                  code,
                  flag: e.flag,
                }),
              ],
            },
          ];
        }),
        {
          id: "none",
          label: "Find no card · Shuffle your deck",
          effects: [fx("batch4PlayerArmoryShuffle")],
        },
      ]);
      break;
    }
    case "batch4PlayerArmoryTake": {
      requireRule(
        e.value !== undefined &&
          e.value < (e.flag ? 5 : 10) &&
          s.deck[e.value] === e.code,
        "Choose the physical searched card.",
      );
      if (e.flag) {
        const preview = {
          ...get(s, "unused"),
          id: "batch4-armory-preview",
          code: e.code!,
          attachments: [],
        } as Unit;
        const targets = playTargets(s, preview, { putIntoPlay: true });
        if (targets.length)
          choose(s, "Open the Armory · Choose where to put the attachment", [
            ...targets.map((u) => ({
              id: u.id,
              code: u.code,
              label: `Attach ${card(e.code!).name} to ${name(u)}`,
              effects: [
                fx("batch4PlayerArmoryAttach", {
                  target: u.id,
                  value: e.value,
                  code: e.code,
                }),
              ],
            })),
            {
              id: "none",
              label: "Find no card · Shuffle your deck",
              effects: [fx("batch4PlayerArmoryShuffle")],
            },
          ]);
        else shuffle(s, s.deck);
      } else {
        s.hand.push(takePlayerDeck(s, e.value));
        shuffle(s, s.deck);
      }
      break;
    }
    case "batch4PlayerArmoryAttach": {
      requireRule(
        e.value !== undefined && s.deck[e.value] === e.code,
        "The physical searched attachment must remain in the deck.",
      );
      const u = takePlayerDeck(s, e.value);
      requireRule(
        playTargets(s, u, { putIntoPlay: true }).some((t) => t.id === e.target),
        "Choose an eligible attachment host.",
      );
      resolvePlayerCard(s, u, e.target, 0, false, false);
      shuffle(s, s.deck);
      break;
    }
    case "batch4PlayerArmoryShuffle":
      shuffle(s, s.deck);
      break;
    default:
      return false;
  }
  return true;
}
