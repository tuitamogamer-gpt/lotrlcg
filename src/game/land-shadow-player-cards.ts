import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  canPay,
  choose,
  draw,
  engagementCost,
  fx,
  get,
  log,
  prepend,
  requireRule,
  skip,
  spendResources,
  stats,
  threatOf,
} from "./core";
import {
  damage,
  exhaustCharacter,
  readyCharacter,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  allEngaged,
  attachmentController,
  attackersFor,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { LAND_SHADOW_FRODO, isOneRing } from "./lotr-saga-codes";
import { batch4Scenario } from "./batch4-scenarios";
import { hasTrait } from "./expansion-passives";
import { isHero } from "./card-types";
import { isEnemy } from "./ships";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import type { LeaveDestination } from "./mirkwood-player-cards";
import { playerAttack } from "./combat";

/**
 * The Lord of the Rings: The Land of Shadow player cards. The Saga places the
 * Fellowship-sphere Frodo Baggins with The One Ring; his Action spends 1
 * Fellowship resource and exhausts The One Ring for +2 willpower and +2
 * attack until the end of the round. Faramir, Damrod, Anborn, Skinbark,
 * Gamling, Staff of Lebethron, Ambush, Snowmane, Taste it Again!, In the
 * Shadows and Speak Your Promise! complete the box; Mablung is scripted with
 * the collector cards and the Brace of Coneys boon waits for campaign mode.
 */
export const LAND_SHADOW_PLAYER = {
  frodo: LAND_SHADOW_FRODO,
  faramir: "144002",
  damrod: "144003",
  anborn: "144004",
  skinbark: "144006",
  gamling: "144007",
  staff: "144008",
  ambush: "144009",
  snowmane: "144010",
  taste: "144011",
  shadows: "144012",
  promise: "144013",
} as const;
const P = LAND_SHADOW_PLAYER;
/** Damrod: the first Trap card his controller plays this round. */
const DAMROD_KEY = "round:lsp-damrod-trap";
/** Faramir's Response: limit once per phase, for each copy. */
const faramirKey = (id: string) => `phase:lsp-faramir:${id}`;
/** Taste it Again!: +2 attack while this hero attacks that enemy, this phase. */
const tasteKey = (hero: string, enemy: string) =>
  `phase:lsp-taste:${hero}:${enemy}`;
/** The bonus is applied while the attack resolves. */
const TASTE_APPLIED = "phase:lsp-taste-applied:";

const live = (u: Unit) => !u.blanked;
const enabled = (a: { blanked?: boolean; facedown?: boolean }) =>
  !a.blanked && !a.facedown;
const ring = (u: Unit) => u.attachments.find((a) => isOneRing(a.code));
const traits = (c: Card) =>
  (c.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const isTrapCode = (code: string) => traits(card(code)).includes("Trap");
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
/** "An enemy with engagement cost higher than your threat." */
const higher = (s: GameState, enemy: Unit, p: number) =>
  engagementCost(s, enemy) > effectiveThreat(s, p);
const ringBearer = (s: GameState) =>
  globalCharacters(s).find((u) => hasTrait(u, "Ring-bearer"));

// ---------------------------------------------------------------- Frodo

export const landShadowPlayerAbilityLabel = (code: string) =>
  code === P.frodo
    ? "Frodo Baggins · Spend 1 resource and exhaust The One Ring: +2 willpower and +2 attack until the end of the round"
    : code === P.ambush
      ? "Ambush · Discard Ambush to declare an attack against the attached enemy"
      : undefined;
export function landShadowPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || a.code !== P.ambush) return undefined;
    return ambushProblem(s, u, a);
  }
  if (u.code !== P.frodo) return undefined;
  const title = card(u.code).name;
  if (u.blanked) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  // Frodo is the Fellowship hero: his own pool holds the Fellowship resource.
  if (u.resources < 1) return "Frodo Baggins needs 1 Fellowship resource.";
  const r = ring(u);
  if (!r || r.blanked) return "The One Ring is not attached to Frodo Baggins.";
  if (r.exhausted) return "The One Ring is exhausted.";
  return undefined;
}
export function useLandShadowPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId) {
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || a.code !== P.ambush) return false;
    const problem = ambushProblem(s, u, a);
    requireRule(!problem, problem ?? "");
    useAmbush(s, u, a.id);
    return true;
  }
  if (u.code !== P.frodo) return false;
  const problem = landShadowPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  spendResources(s, u, 1);
  ring(u)!.exhausted = true;
  u.roundWill = (u.roundWill ?? 0) + 2;
  u.roundAttack = (u.roundAttack ?? 0) + 2;
  log(
    s,
    "Frodo Baggins spends 1 resource and exhausts The One Ring: he gets +2 willpower and +2 attack until the end of the round.",
    "good",
  );
  batch4Scenario(s).oneRingExhausted?.(s);
  return true;
}

// ---------------------------------------------------------------- costs

/**
 * Damrod reduces the first Trap card his controller plays each round by 1;
 * In the Shadows costs 1 less for each Hobbit or Ranger hero you control.
 */
export function landShadowPlayerCostReduction(s: GameState, c: Card) {
  let discount = 0;
  if (
    isTrapCode(c.code) &&
    !s.used.includes(DAMROD_KEY) &&
    s.heroes.some((h) => h.code === P.damrod && live(h))
  )
    discount++;
  if (c.code === P.shadows)
    discount += s.heroes.filter(
      (h) => hasTrait(h, "Hobbit") || hasTrait(h, "Ranger"),
    ).length;
  return discount;
}
/** After a card is played: Damrod's reduction applies to the first Trap only. */
export function landShadowPlayerCardPlayed(s: GameState, c: Card) {
  if (isTrapCode(c.code) && !s.used.includes(DAMROD_KEY))
    s.used.push(DAMROD_KEY);
}

// ---------------------------------------------------------------- events

const enemiesEngaged = (s: GameState) => s.engaged.filter((u) => isEnemy(u));
/** In the Shadows: the enemies engaged with you above your threat. */
const shadowsTargets = (s: GameState) =>
  enemiesEngaged(s).filter(
    (u) => higher(s, u, activeSeat(s)) && !playerEffectImmune(s, u, P.shadows),
  );
/** Speak Your Promise!: the Ring-bearer readies as the cost. */
const promiseBearer = (s: GameState) => {
  const bearer = ringBearer(s);
  return bearer && bearer.exhausted && !cannotReady(bearer, s)
    ? bearer
    : undefined;
};
export function landShadowPlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  switch (u.code) {
    case P.shadows:
      if (s.phase !== "defense" && s.phase !== "attack")
        return "In the Shadows is a Combat Action.";
      return shadowsTargets(s).length
        ? null
        : "In the Shadows needs an enemy engaged with you with an engagement cost higher than your threat.";
    case P.promise:
      if (!promiseBearer(s))
        return "Speak Your Promise! readies an exhausted Ring-bearer.";
      return enemiesEngaged(s).length
        ? null
        : "Speak Your Promise! needs an enemy engaged with you.";
    case P.taste:
      return "Taste it Again! is played in response to a hero you control defending an attack.";
  }
  return null;
}
/** Speak Your Promise!'s cost: ready the Ring-bearer. */
export function landShadowPlayerEventCost(s: GameState, u: Unit) {
  if (u.code !== P.promise) return;
  const bearer = promiseBearer(s);
  requireRule(bearer, "Speak Your Promise! readies an exhausted Ring-bearer.");
  readyCharacter(s, bearer, true);
  log(s, `Speak Your Promise!: ${name(bearer)} readies to pay the cost.`);
}
export function landShadowPlayerEvent(s: GameState, code: string): boolean {
  const player = activeSeat(s);
  switch (code) {
    case P.shadows: {
      const targets = shadowsTargets(s);
      for (const u of targets) {
        u.tempAttack = (u.tempAttack ?? 0) - 1;
        u.tempDefense = (u.tempDefense ?? 0) - 1;
      }
      log(
        s,
        targets.length
          ? `In the Shadows: ${targets.map((u) => name(u)).join(", ")} get${targets.length === 1 ? "s" : ""} -1 attack and -1 defense until the end of the phase.`
          : "In the Shadows: no enemy engaged with you has an engagement cost higher than your threat.",
        "good",
      );
      return true;
    }
    case P.promise: {
      const enemies = enemiesEngaged(s);
      if (!enemies.length) {
        log(s, "Speak Your Promise!: no enemy is engaged with you.");
        return true;
      }
      choose(
        s,
        `Speak Your Promise! · Choose an enemy engaged with you${seatLabel(s, player)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("lspPromise", { target: u.id, player })],
        })),
        "If the Ring-bearer's willpower is greater than that enemy's threat, lower that enemy's attack and defense by the difference until the end of the phase.",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- triggers

/** Faramir: after you engage an enemy, ready an ally you control (once per phase). */
/** The exhausted allies Faramir can ready (Sméagol ignores player cards). */
const faramirAllies = (s: GameState) =>
  s.allies.filter(
    (u) =>
      u.exhausted && !cannotReady(u, s) && !playerEffectImmune(s, u, P.faramir),
  );
export function landShadowPlayerEnemyEngaged(s: GameState, _enemy: Unit) {
  const p = activeSeat(s);
  if (!faramirAllies(s).length) return;
  const offers = s.heroes
    .filter(
      (u) =>
        u.code === P.faramir && live(u) && !s.used.includes(faramirKey(u.id)),
    )
    .map((u) => fx("lspFaramirOffer", { source: u.id, player: p }));
  if (offers.length) prepend(s, ...offers);
}
/**
 * An enemy entered the staging area: Ambush attaches to it, Damrod answers
 * each Trap that attached to it, and Anborn may slow it.
 */
export function landShadowPlayerEnemyAddedToStaging(
  s: GameState,
  enemy: Unit,
  before: ReadonlySet<string>,
) {
  if (!isEnemy(enemy)) return;
  const eligible =
    !playerEffectImmune(s, enemy, P.ambush) &&
    !/cannot have attachments/i.test(card(enemy.code).text ?? "") &&
    !batch4Scenario(s).cannotAttach?.(s, enemy, P.ambush);
  if (eligible)
    for (const trap of s.staging.filter((u) => u.code === P.ambush)) {
      s.staging = s.staging.filter((u) => u.id !== trap.id);
      enemy.attachments.push({
        id: trap.id,
        code: trap.code,
        exhausted: false,
        ...(trap.owner !== undefined ? { owner: trap.owner } : {}),
        ...(trap.controller !== undefined
          ? { controller: trap.controller }
          : {}),
      });
      log(s, `Ambush is attached to ${name(enemy)}.`, "good");
    }
  const effects: Effect[] = [];
  for (const a of enemy.attachments.filter(
    (a) => !before.has(a.id) && isTrapCode(a.code),
  ))
    effects.push(...damrodOffers(s, a.controller ?? a.owner ?? activeSeat(s)));
  for (const p of playerOrder(s))
    for (const anborn of seatView(s, p).allies.filter(
      (u) => u.code === P.anborn && live(u) && !u.exhausted,
    ))
      effects.push(
        fx("lspAnbornOffer", {
          source: anborn.id,
          target: enemy.id,
          player: p,
        }),
      );
  if (effects.length) prepend(s, ...effects);
}
/** A Trap played onto an enemy: Damrod's Response. */
export function landShadowPlayerAttachmentPlayed(
  s: GameState,
  host: Unit,
  attachment: { code: string; controller?: number; owner?: number },
) {
  if (!isEnemy(host) || !isTrapCode(attachment.code)) return;
  prepend(
    s,
    ...damrodOffers(
      s,
      attachment.controller ?? attachment.owner ?? activeSeat(s),
    ),
  );
}
function damrodOffers(s: GameState, p: number): Effect[] {
  return seatView(s, p)
    .heroes.filter((u) => u.code === P.damrod && live(u))
    .map((u) => fx("lspDamrodOffer", { source: u.id, player: p }));
}
/** Ambush is played into the staging area unattached. */
export function landShadowPlayerSpecialAttachmentEntry(
  s: GameState,
  u: Unit,
): boolean {
  if (u.code !== P.ambush) return false;
  requireRule(
    !s.staging.some((other) => other.id === u.id),
    "The same physical Trap is already in staging.",
  );
  u.owner ??= activeSeat(s);
  u.controller ??= activeSeat(s);
  s.staging.push(u);
  log(s, "Ambush is played into the staging area unattached.");
  return true;
}
/** Skinbark enters play exhausted. */
export function landShadowPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code !== P.skinbark || !live(u)) return;
  u.exhausted = true;
  log(s, "Skinbark enters play exhausted.");
}
/** Skinbark attacking alone against an Orc enemy: the enemy does not count its defense. */
export function landShadowPlayerAttackDefense(
  s: GameState,
  enemy: Unit,
  ids: string[],
): number | undefined {
  if (ids.length !== 1) return undefined;
  const attacker = get(s, ids[0]);
  return attacker?.code === P.skinbark &&
    live(attacker) &&
    hasTrait(enemy, "Orc")
    ? 0
    : undefined;
}
/** Gamling: after a Rohan ally you control is discarded from play. */
export function landShadowPlayerCharacterLeft(
  s: GameState,
  u: Unit,
  controller: number,
  destination: LeaveDestination,
  lastKnownType: string | undefined,
) {
  if (
    lastKnownType !== "ally" ||
    destination.zone !== "discard" ||
    destination.index === undefined ||
    !hasTrait(u, "Rohan")
  )
    return;
  const offers = seatView(s, controller)
    .allies.filter(
      (g) => g.code === P.gamling && g.id !== u.id && live(g) && !g.exhausted,
    )
    .map((g) =>
      fx("lspGamlingOffer", {
        source: g.id,
        code: u.code,
        value: destination.index,
        owner: destination.player,
        player: controller,
      }),
    );
  if (offers.length) prepend(s, ...offers);
}
/** Staff of Lebethron: after the attached hero exhausts to defend. */
export function landShadowPlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
  exhausted: string[],
): Effect[] {
  if (!enemy.shadows.length) return [];
  return defenders
    .filter((d) => exhausted.includes(d.id) && isHero(d))
    .flatMap((d) =>
      d.attachments
        .filter((a) => a.code === P.staff && enabled(a) && !a.exhausted)
        .filter((a) => {
          const p = attachmentController(s, d, a) ?? ownerOf(s, d);
          return higher(s, enemy, p);
        })
        .map((a) =>
          fx("lspStaffOffer", {
            target: d.id,
            source: a.id,
            value: 0,
            text: enemy.id,
            player: attachmentController(s, d, a) ?? ownerOf(s, d),
          }),
        ),
    );
}
/** Taste it Again!: after a hero you control defends an attack. */
export function landShadowPlayerAfterDefense(
  s: GameState,
  enemyId: string,
  defenderIds: string[],
) {
  const enemy = get(s, enemyId) ?? allEngaged(s).find((u) => u.id === enemyId);
  if (!enemy) return;
  const offers: Effect[] = [];
  for (const id of defenderIds) {
    const hero = get(s, id);
    if (!hero || !isHero(hero)) continue;
    const p = ownerOf(s, hero);
    if (!higher(s, enemy, p)) continue;
    const view = seatView(s, p);
    if (!view.hand.some((c) => c.code === P.taste)) continue;
    offers.push(
      fx("lspTasteOffer", { target: hero.id, text: enemy.id, player: p }),
    );
  }
  if (offers.length) prepend(s, ...offers);
}
/** Snowmane: after the attached hero quests successfully. */
export function landShadowPlayerQuestSucceeded(s: GameState) {
  const order = playerOrder(s);
  prepend(
    s,
    ...globalCharacters(s)
      .filter((u) => u.committed && isHero(u))
      .flatMap((u) =>
        u.attachments
          .filter((a) => a.code === P.snowmane && enabled(a))
          .map((a) => ({
            u,
            a,
            player: attachmentController(s, u, a) ?? ownerOf(s, u),
          })),
      )
      .sort((x, y) => order.indexOf(x.player) - order.indexOf(y.player))
      .map(({ u, a, player }) =>
        fx("lspSnowmaneOffer", { target: u.id, source: a.id, player }),
      ),
  );
}
/** Taste it Again!'s +2 attack applies while the hero attacks that enemy. */
export function landShadowPlayerAttackersDeclared(
  s: GameState,
  enemy: Unit,
  attackers: Unit[],
): Effect[] {
  for (const u of attackers)
    if (s.used.includes(tasteKey(u.id, enemy.id))) {
      u.tempAttack = (u.tempAttack ?? 0) + 2;
      s.used.push(`${TASTE_APPLIED}${u.id}`);
      log(
        s,
        `Taste it Again!: ${name(u)} gets +2 attack against ${name(enemy)}.`,
      );
    }
  return [];
}
export function landShadowPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const id of ids) {
    const key = `${TASTE_APPLIED}${id}`;
    if (!s.used.includes(key)) continue;
    s.used = s.used.filter((k) => k !== key);
    const u = get(s, id);
    if (u) u.tempAttack = (u.tempAttack ?? 0) - 2;
  }
}

// ---------------------------------------------------------------- Ambush

const ambushHost = (s: GameState, enemy: Unit) =>
  allEngaged(s).some((u) => u.id === enemy.id);
function ambushProblem(
  s: GameState,
  enemy: Unit,
  a: { blanked?: boolean; facedown?: boolean },
): string | undefined {
  if (!enabled(a)) return "Ambush's text is blank.";
  if (s.phase !== "defense" && s.phase !== "attack")
    return "Ambush is a Combat Action.";
  if (!ambushHost(s, enemy) || ownerOf(s, enemy) !== activeSeat(s))
    return "Only the player engaged with the attached enemy can trigger Ambush.";
  return ambushAttackers(s, enemy).some((u) => ownAttacker(s, u.id))
    ? undefined
    : "No ready character you control can attack the attached enemy.";
}
/** The ordinary attackers: the engaged player's ready characters, and Ranged ones. */
const ambushAttackers = (s: GameState, enemy: Unit) => attackersFor(s, enemy);
const ownAttacker = (s: GameState, id: string) => {
  const u = get(s, id);
  return !!u && ownerOf(s, u) === activeSeat(s);
};
function useAmbush(s: GameState, enemy: Unit, attachmentId: string) {
  const a = enemy.attachments.find((x) => x.id === attachmentId)!;
  enemy.attachments = enemy.attachments.filter((x) => x.id !== attachmentId);
  forOwner(s, a.owner ?? activeSeat(s), () => s.discard.push(a.code));
  log(
    s,
    `Ambush is discarded: ${s.table ? seatName(s, activeSeat(s)) : "you"} declare${s.table ? "s" : ""} an attack against ${name(enemy)}.`,
    "good",
  );
  prepend(
    s,
    fx("lspAmbushAttackers", {
      target: enemy.id,
      ids: [],
      player: activeSeat(s),
    }),
  );
}

// ---------------------------------------------------------------- effects

export function landShadowPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("lsp")) return false;
  const p = e.player ?? activeSeat(s);
  const source = e.source ? get(s, e.source) : undefined;
  const target = e.target
    ? (get(s, e.target) ??
      [...s.staging, ...allEngaged(s)].find((u) => u.id === e.target))
    : undefined;
  switch (e.kind) {
    case "lspFaramirOffer": {
      if (!source || source.code !== P.faramir || !live(source)) return true;
      if (s.used.includes(faramirKey(source.id))) return true;
      const allies = faramirAllies(s);
      if (!allies.length) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        `Faramir · You engaged an enemy${seatLabel(s, p)}`,
        [
          ...allies.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Ready ${name(u)}`,
            effects: [
              fx("lspFaramirReady", {
                source: source.id,
                target: u.id,
                player: p,
              }),
            ],
          })),
          skip,
        ],
        "Response: after you engage an enemy, ready an ally you control. (Limit once per phase.)",
        p,
      );
      return true;
    }
    case "lspFaramirReady":
      if (!source || s.used.includes(faramirKey(source.id))) return true;
      s.used.push(faramirKey(source.id));
      if (target && target.exhausted) {
        readyCharacter(s, target);
        log(s, `Faramir readies ${name(target)}.`, "good");
      }
      return true;
    case "lspDamrodOffer":
      if (
        !source ||
        source.code !== P.damrod ||
        !live(source) ||
        !s.deck.length
      )
        return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        `Damrod · A Trap you control is attached to an enemy${seatLabel(s, p)}`,
        [
          {
            id: "draw",
            label: "Draw 1 card",
            code: P.damrod,
            effects: [fx("lspDamrodDraw", { player: p })],
          },
          skip,
        ],
        "Response: after a Trap card you control is attached to an enemy, draw 1 card.",
        p,
      );
      return true;
    case "lspDamrodDraw":
      draw(s, 1);
      log(s, "Damrod: 1 card is drawn.", "good");
      return true;
    case "lspAnbornOffer": {
      if (
        !source ||
        source.code !== P.anborn ||
        !live(source) ||
        source.exhausted
      )
        return true;
      if (!target || !s.staging.some((u) => u.id === target.id)) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        `Anborn · ${name(target)} is added to the staging area${seatLabel(s, p)}`,
        [
          {
            id: "exhaust",
            label: `Exhaust Anborn: ${name(target)} gets +5 engagement cost until the end of the round, then 1 damage`,
            code: P.anborn,
            effects: [
              fx("lspAnborn", {
                source: source.id,
                target: target.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after an enemy is added to the staging area, exhaust Anborn to give that enemy +5 engagement cost until the end of the round. Then, deal 1 damage to that enemy.",
        p,
      );
      return true;
    }
    case "lspAnborn": {
      if (!source || source.exhausted || !target) return true;
      exhaustCharacter(s, source);
      if (playerEffectImmune(s, target, P.anborn)) {
        log(s, `Anborn: ${name(target)} is immune to player card effects.`);
        return true;
      }
      target.tempEngagement = (target.tempEngagement ?? 0) + 5;
      log(
        s,
        `Anborn: ${name(target)} gets +5 engagement cost until the end of the round and takes 1 damage.`,
        "good",
      );
      damage(s, target.id, 1, {});
      return true;
    }
    case "lspGamlingOffer": {
      if (
        !source ||
        source.code !== P.gamling ||
        !live(source) ||
        source.exhausted
      )
        return true;
      const owner = e.owner ?? p;
      if (seatView(s, owner).discard[e.value ?? -1] !== e.code) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        `Gamling · ${card(e.code!).name} is discarded from play${seatLabel(s, p)}`,
        [
          {
            id: "return",
            label: `Exhaust Gamling: return ${card(e.code!).name} to your hand`,
            code: P.gamling,
            effects: [{ ...e, kind: "lspGamlingReturn" }],
          },
          skip,
        ],
        "Response: after a Rohan ally you control is discarded from play, exhaust Gamling to return that ally to your hand.",
        p,
      );
      return true;
    }
    case "lspGamlingReturn": {
      if (!source || source.exhausted) return true;
      const owner = e.owner ?? p;
      exhaustCharacter(s, source);
      forOwner(s, owner, () => {
        if (s.discard[e.value ?? -1] === e.code) {
          s.hand.push(takePlayerDiscard(s, e.value!));
          log(
            s,
            `Gamling is exhausted: ${card(e.code!).name} returns to its owner's hand.`,
            "good",
          );
        }
      });
      return true;
    }
    case "lspStaffOffer": {
      const staff = target?.attachments.find(
        (a) =>
          a.id === e.source && a.code === P.staff && enabled(a) && !a.exhausted,
      );
      const enemy = e.text
        ? (get(s, e.text) ?? allEngaged(s).find((u) => u.id === e.text))
        : undefined;
      if (!target || !staff || !enemy || !enemy.shadows.length) return true;
      choosePlayerResponse(
        s,
        staff.id,
        P.staff,
        `Staff of Lebethron · ${name(target)} exhausted to defend${seatLabel(s, p)}`,
        [
          {
            id: "discard",
            label: `Exhaust Staff of Lebethron: discard a shadow card from ${name(enemy)}`,
            code: P.staff,
            effects: [{ ...e, kind: "lspStaffDiscard" }],
          },
          skip,
        ],
        "Response: after attached hero exhausts to defend an attack from an enemy with engagement cost higher than your threat, exhaust Staff of Lebethron to discard a shadow card from that enemy.",
        p,
      );
      return true;
    }
    case "lspStaffDiscard": {
      const staff = target?.attachments.find((a) => a.id === e.source);
      const enemy = e.text
        ? (get(s, e.text) ?? allEngaged(s).find((u) => u.id === e.text))
        : undefined;
      if (!staff || staff.exhausted || !enemy || !enemy.shadows.length)
        return true;
      staff.exhausted = true;
      // The facedown shadow cards are indistinguishable: the first is discarded.
      const revealed = enemy.revealedShadowCount ?? 0;
      const index = Math.min(revealed, enemy.shadows.length - 1);
      const [code] = enemy.shadows.splice(index, 1);
      enemy.faceupShadows?.splice(index, 1);
      if (
        enemy.revealedShadowCount !== undefined &&
        index < enemy.revealedShadowCount
      )
        enemy.revealedShadowCount--;
      s.encounterDiscard.push(code);
      log(
        s,
        `Staff of Lebethron is exhausted: a shadow card (${card(code).name}) is discarded from ${name(enemy)}.`,
        "good",
      );
      return true;
    }
    case "lspTasteOffer": {
      const hero = target;
      const enemy = e.text
        ? (get(s, e.text) ?? allEngaged(s).find((u) => u.id === e.text))
        : undefined;
      const event = s.hand.find((c) => c.code === P.taste);
      if (!hero || !enemy || !event || !canPay(s, card(P.taste))) return true;
      choosePlayerResponse(
        s,
        event.id,
        P.taste,
        `Taste it Again! · ${name(hero)} defended ${name(enemy)}${seatLabel(s, p)}`,
        [
          {
            id: "play",
            label: `Play Taste it Again!: ready ${name(hero)}, +2 attack against ${name(enemy)} this phase`,
            code: P.taste,
            effects: [
              fx("eventPlay", {
                source: event.id,
                code: P.taste,
                player: p,
                effects: [
                  fx("lspTaste", {
                    target: hero.id,
                    text: enemy.id,
                    player: p,
                  }),
                ],
              }),
            ],
          },
          skip,
        ],
        "Response: after a hero you control defends an attack made by an enemy with engagement cost higher than your threat, ready that hero. Until the end of the phase, that hero gets +2 attack while attacking that enemy.",
        p,
      );
      return true;
    }
    case "lspTaste": {
      if (!target || !e.text) return true;
      if (target.exhausted && !cannotReady(target, s))
        readyCharacter(s, target);
      s.used.push(tasteKey(target.id, e.text));
      log(
        s,
        `Taste it Again!: ${name(target)} readies and gets +2 attack while attacking that enemy this phase.`,
        "good",
      );
      return true;
    }
    case "lspSnowmaneOffer": {
      const mount = target?.attachments.find(
        (a) => a.id === e.source && a.code === P.snowmane && enabled(a),
      );
      if (!target || !mount || !target.exhausted || cannotReady(target, s))
        return true;
      choosePlayerResponse(
        s,
        mount.id,
        P.snowmane,
        `Snowmane · ${name(target)} quested successfully${seatLabel(s, p)}`,
        [
          {
            id: "ready",
            label: `Ready ${name(target)}`,
            code: P.snowmane,
            effects: [fx("lspSnowmaneReady", { target: target.id, player: p })],
          },
          skip,
        ],
        "Response: after attached hero quests successfully, ready attached hero.",
        p,
      );
      return true;
    }
    case "lspSnowmaneReady":
      if (target && target.exhausted) {
        readyCharacter(s, target);
        log(s, `Snowmane readies ${name(target)}.`, "good");
      }
      return true;
    case "lspPromise": {
      const bearer = ringBearer(s);
      if (!target || !bearer) return true;
      if (playerEffectImmune(s, target, P.promise)) {
        log(
          s,
          `Speak Your Promise!: ${name(target)} is immune to player card effects.`,
        );
        return true;
      }
      const will = stats(s, bearer).will;
      const threat = threatOf(s, { ...target, suppressed: false });
      const difference = will - threat;
      if (difference <= 0) {
        log(
          s,
          `Speak Your Promise!: ${name(bearer)}'s willpower (${will}) is not greater than ${name(target)}'s threat (${threat}).`,
        );
        return true;
      }
      target.tempAttack = (target.tempAttack ?? 0) - difference;
      target.tempDefense = (target.tempDefense ?? 0) - difference;
      log(
        s,
        `Speak Your Promise!: ${name(target)} gets -${difference} attack and -${difference} defense until the end of the phase (willpower ${will} against threat ${threat}).`,
        "good",
      );
      return true;
    }
    case "lspAmbushAttack":
      if (target && (e.ids ?? []).length) playerAttack(s, target, e.ids!);
      return true;
    case "lspAmbushAttackers": {
      const enemy = target;
      if (!enemy || !allEngaged(s).some((u) => u.id === enemy.id)) return true;
      const chosen = e.ids ?? [];
      const ready = ambushAttackers(s, enemy).filter(
        (u) => !chosen.includes(u.id),
      );
      const options: Option[] = ready.map((u) => ({
        id: u.id,
        code: u.code,
        label: `Declare ${name(u)} as an attacker`,
        effects: [{ ...e, ids: [...chosen, u.id] }],
      }));
      if (chosen.some((id) => ownAttacker(s, id)))
        options.push({
          id: "attack",
          label: `Attack ${name(enemy)} with ${chosen.map((id) => name(get(s, id)!)).join(", ")}`,
          effects: [
            fx("lspAmbushAttack", { target: enemy.id, ids: chosen, player: p }),
          ],
        });
      if (!options.length) return true;
      choose(
        s,
        `Ambush · Declare attackers against ${name(enemy)}${seatLabel(s, p)}`,
        options,
        "Combat Action: the engaged player discards Ambush to declare an attack against the attached enemy.",
      );
      return true;
    }
  }
  return false;
}
