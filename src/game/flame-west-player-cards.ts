import type { Card, Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  canPay,
  choose,
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
  check,
  damage,
  discardCharacter,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isHero } from "./card-types";
import { isEnemy } from "./ships";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { reduceThreat } from "./threat-reduction";
import {
  encodeDamageContext,
  readDamageContext,
  type DamageContext,
} from "./damage-context";
import { applyCombatDamageConsequences, playerAttack } from "./combat";
import { canTravel } from "./actions";

/**
 * The Lord of the Rings: The Flame of the West player cards. Aragorn, the
 * Fellowship hero of its three scenarios, is described with the Saga rules of
 * The Passing of the Grey Company and Desperate Defense was scripted with the
 * collector cards; the Esquires are the boons of The Battle of the Pelennor
 * Fields. Éowyn, Beregond, Grimbold, Prince Imrahil, Halbarad,
 * Ghân-buri-Ghân, Sterner than Steel, Golden Shield, Livery of the Tower,
 * Roheryn and Banner of Elendil complete the box.
 */
export const FLAME_WEST_PLAYER = {
  eowyn: "145002",
  beregond: "145003",
  grimbold: "145004",
  imrahil: "145005",
  halbarad: "145006",
  ghan: "145007",
  sterner: "145008",
  shield: "145010",
  livery: "145011",
  roheryn: "145012",
  banner: "145013",
} as const;
const P = FLAME_WEST_PLAYER;
/** Éowyn's Action: limit once per game for the group. */
const EOWYN_KEY = "game:fwp-eowyn";
const eowynSetupKey = (id: string) => `game:fwp-eowyn-setup:${id}`;
/** Beregond's Response: limit once per round, for each copy. */
const beregondKey = (id: string) => `round:fwp-beregond:${id}`;

const live = (u: Unit) => !u.blanked;
const enabled = (a: { blanked?: boolean; facedown?: boolean }) =>
  !a.blanked && !a.facedown;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
/** A key in any seat's used list: group-wide limits. */
const usedByGroup = (s: GameState, key: string) =>
  s.used.includes(key) || !!s.table?.seats.some((p) => p.used.includes(key));
const traits = (c: Card) =>
  (c.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);

// ---------------------------------------------------------------- setup

/** Éowyn, Setup: reduce your threat by 3 (the initial threat level). */
export function flameWestPlayerSetup(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      for (const h of s.heroes.filter(
        (h) =>
          h.code === P.eowyn &&
          live(h) &&
          !s.used.includes(eowynSetupKey(h.id)),
      )) {
        s.used.push(eowynSetupKey(h.id));
        reduceThreat(s, 3, P.eowyn);
        s.startingThreat = s.threat;
        log(
          s,
          `Éowyn: ${s.table ? `${seatName(s, p)} reduces his` : "you reduce your"} threat by 3 (${s.threat}).`,
          "good",
        );
      }
    });
}

// ---------------------------------------------------------------- actions

export const flameWestPlayerAbilityLabel = (code: string) =>
  code === P.eowyn
    ? "Éowyn · Raise your threat by 3 to ready her: +9 attack until the end of the phase"
    : code === P.grimbold
      ? "Grimbold · Discard him: an engaged enemy cannot attack that player this phase"
      : code === P.ghan
        ? "Ghân-buri-Ghân · Discard him to travel to a location without its Travel effect"
        : undefined;
/** Grimbold: the enemies engaged with a player, with that player. */
function grimboldTargets(s: GameState) {
  return playerOrder(s).flatMap((p) =>
    seatView(s, p)
      .engaged.filter(
        (u) => isEnemy(u) && !playerEffectImmune(s, u, P.grimbold),
      )
      .map((enemy) => ({ enemy, player: p })),
  );
}
export function flameWestPlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (![P.eowyn, P.grimbold, P.ghan].includes(u.code as typeof P.eowyn))
    return undefined;
  const title = card(u.code).name;
  if (!live(u)) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  if (u.code === P.eowyn)
    return usedByGroup(s, EOWYN_KEY)
      ? "Éowyn's Action is limited to once per game for the group."
      : undefined;
  if (u.code === P.grimbold) {
    if (s.phase !== "defense" && s.phase !== "attack")
      return "Grimbold's ability is a Combat Action.";
    return grimboldTargets(s).length
      ? undefined
      : "Grimbold needs an enemy engaged with a player.";
  }
  if (s.phase !== "travel")
    return "Ghân-buri-Ghân's ability is a Travel Action.";
  return ghanTargets(s).length
    ? undefined
    : "Ghân-buri-Ghân needs a location the players can travel to.";
}
/** Ghân-buri-Ghân: the locations in the staging area the players can travel to. */
function ghanTargets(s: GameState) {
  if (s.temple) return [];
  return s.staging.filter(
    (u) =>
      card(u.code).type_code === "location" &&
      !playerEffectImmune(s, u, P.ghan) &&
      !canTravel(s, u),
  );
}
export function useFlameWestPlayerAbility(s: GameState, u: Unit): boolean {
  if (![P.eowyn, P.grimbold, P.ghan].includes(u.code as typeof P.eowyn))
    return false;
  const problem = flameWestPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  if (u.code === P.eowyn) {
    s.used.push(EOWYN_KEY);
    raiseThreat(s, 3, "cost");
    readyCharacter(s, u);
    u.tempAttack = (u.tempAttack ?? 0) + 9;
    log(
      s,
      `Éowyn: ${s.table ? `${seatName(s, p)} raises his` : "you raise your"} threat by 3 to ready her; she gets +9 attack until the end of the phase.`,
      "good",
    );
    return true;
  }
  if (u.code === P.grimbold) {
    const targets = grimboldTargets(s);
    choose(
      s,
      `Grimbold · Choose an enemy engaged with a player${seatLabel(s, p)}`,
      targets.map(({ enemy, player }) => ({
        id: `${enemy.id}:${player}`,
        code: enemy.code,
        label: s.table
          ? `${name(enemy)} cannot attack ${seatName(s, player)} this phase`
          : `${name(enemy)} cannot attack you this phase`,
        effects: [
          fx("fwpGrimbold", {
            source: u.id,
            target: enemy.id,
            value: player,
            player: p,
          }),
        ],
      })),
      "Combat Action: discard Grimbold to choose an enemy engaged with a player. That enemy cannot attack that player this phase.",
    );
    return true;
  }
  const targets = ghanTargets(s);
  choose(
    s,
    `Ghân-buri-Ghân · Travel to a location${seatLabel(s, p)}`,
    targets.map((loc) => ({
      id: loc.id,
      code: loc.code,
      label: `Travel to ${name(loc)} without resolving its Travel effect`,
      effects: [
        fx("fwpGhanTravel", { source: u.id, target: loc.id, player: p }),
      ],
    })),
    "Travel Action: discard Ghân-buri-Ghân to travel to a location without resolving its Travel effect.",
  );
  return true;
}

// ---------------------------------------------------------------- statistics

/** The hero carrying Banner of Elendil and the Banner's controller. */
function banners(s: GameState) {
  return globalCharacters(s).flatMap((host) =>
    host.attachments
      .filter((a) => a.code === P.banner && enabled(a))
      .map((a) => ({
        host,
        player: attachmentController(s, host, a) ?? ownerOf(s, host),
      })),
  );
}
/**
 * Ghân-buri-Ghân's willpower is the threat of the active location; Banner of
 * Elendil gives +1 willpower to each other questing character its controller
 * controls while Aragorn is committed to the quest.
 */
export function flameWestPlayerWillBonus(s: GameState, u: Unit) {
  let bonus = 0;
  if (u.code === P.ghan && live(u) && s.activeLocation)
    bonus += threatOf(s, s.activeLocation);
  if (u.committed)
    for (const b of banners(s))
      if (b.host.id !== u.id && b.host.committed && ownerOf(s, u) === b.player)
        bonus++;
  return bonus;
}
/** Banner of Elendil: +1 attack for each other attacker while Aragorn attacks. */
export function flameWestPlayerAttackBonus(
  s: GameState,
  attacker: Unit,
  attackers: Unit[],
) {
  return banners(s).filter(
    (b) =>
      b.host.id !== attacker.id &&
      attackers.some((a) => a.id === b.host.id) &&
      ownerOf(s, attacker) === b.player,
  ).length;
}

// ---------------------------------------------------------------- Halbarad

/** Halbarad costs 1 less for each enemy engaged with you. */
export function flameWestPlayerCostReduction(s: GameState, c: Card) {
  return c.code === P.halbarad ? s.engaged.filter((u) => isEnemy(u)).length : 0;
}
/** Each enemy engaged with Halbarad's controller gets +10 engagement cost. */
export function flameWestPlayerEngagementBonus(s: GameState, enemy: Unit) {
  if (!isEnemy(enemy)) return 0;
  for (const p of playerOrder(s)) {
    const view = seatView(s, p);
    if (!view.engaged.some((u) => u.id === enemy.id)) continue;
    return view.allies.some((u) => u.code === P.halbarad && live(u)) ||
      view.heroes.some((u) => u.code === P.halbarad && live(u))
      ? 10
      : 0;
  }
  return 0;
}

// ---------------------------------------------------------------- Prince Imrahil

/** A hero card in the owner's discard pile makes Prince Imrahil a hero. */
export function flameWestPlayerRefresh(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const heroCard = s.discard.some((c) => card(c).type_code === "hero");
      for (const u of [...s.heroes, ...s.allies].filter(
        (u) => u.code === P.imrahil,
      )) {
        const hero = heroCard && live(u);
        if (!!u.fwpImrahilHero === hero) continue;
        if (hero) u.fwpImrahilHero = true;
        else delete u.fwpImrahilHero;
        if (hero && !s.heroes.includes(u)) {
          s.allies = s.allies.filter((a) => a !== u);
          s.heroes.push(u);
          log(
            s,
            "Prince Imrahil loses the ally card type and gains the hero card type.",
            "good",
          );
        }
        if (!hero && !s.allies.includes(u)) {
          s.heroes = s.heroes.filter((a) => a !== u);
          s.allies.push(u);
          log(s, "Prince Imrahil is an ally again.");
        }
      }
    });
}

// ---------------------------------------------------------------- defense

/**
 * After defenders are declared: Golden Shield's Response, and each defending
 * Beregond's damage, so that "takes no damage" can be checked afterwards.
 */
export function flameWestPlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  const c = s.combat;
  if (c)
    for (const d of defenders.filter((d) => d.code === P.beregond && live(d)))
      (c.fwpBeregond ??= {})[d.id] = d.damage;
  return defenders.flatMap((d) =>
    d.attachments
      .filter((a) => a.code === P.shield && enabled(a) && !a.exhausted)
      .map((a) =>
        fx("fwpShieldOffer", {
          target: d.id,
          source: a.id,
          text: enemy.id,
          player: attachmentController(s, d, a) ?? ownerOf(s, d),
        }),
      ),
  );
}
/** After an attack: Beregond defended and took no damage. */
export function flameWestPlayerAfterDefense(
  s: GameState,
  completed: NonNullable<GameState["combat"]>,
  attackPlayer: number,
) {
  const before = completed.fwpBeregond ?? {};
  const defenderIds =
    completed.defenderIds ??
    (completed.defenderId ? [completed.defenderId] : []);
  const offers: Effect[] = [];
  for (const id of defenderIds) {
    const u = get(s, id);
    if (!u || u.code !== P.beregond || !live(u) || !(id in before)) continue;
    if (u.damage > before[id]) continue;
    const p = ownerOf(s, u);
    if (seatView(s, p).used.includes(beregondKey(u.id))) continue;
    offers.push(
      fx("fwpBeregondOffer", { source: u.id, value: attackPlayer, player: p }),
    );
  }
  delete completed.fwpBeregond;
  if (offers.length) prepend(s, ...offers);
}

// ---------------------------------------------------------------- shadows

/** Sterner than Steel: the Weapon or Armor attachments on the defenders. */
function sternerCosts(s: GameState, player: number) {
  const c = s.combat;
  const ids = c?.defenderIds ?? (c?.defenderId ? [c.defenderId] : []);
  return ids.flatMap((id) => {
    const d = get(s, id);
    if (!d) return [];
    return d.attachments
      .filter(
        (a) =>
          enabled(a) &&
          !a.exhausted &&
          (attachmentController(s, d, a) ?? ownerOf(s, d)) === player &&
          traits(card(a.code)).some((t) => t === "Weapon" || t === "Armor"),
      )
      .map((a) => ({ host: d, attachment: a }));
  });
}
export function flameWestPlayerShadowOptions(
  s: GameState,
  code: string,
  hasShadow: boolean,
): Option[] {
  if (!hasShadow || !s.combat) return [];
  return playerOrder(s).flatMap((player) => {
    const view = seatView(s, player);
    if (!sternerCosts(s, player).length) return [];
    return view.hand
      .filter((u) => u.code === P.sterner && canPay(view, card(u.code)))
      .slice(0, 1)
      .map((u) => ({
        id: `fwp-sterner-${u.id}`,
        code: u.code,
        label: `Play Sterner than Steel · Exhaust a Weapon or Armor on the defender${seatLabel(s, player)}`,
        ability: {
          player,
          source: u.id,
          code: u.code,
          type: "response" as const,
        },
        effects: [
          fx("eventPlay", {
            code: u.code,
            source: u.id,
            player,
            effects: [],
            costEffects: [fx("fwpSternerCost", { player })],
            cancelledEffects: [
              fx("shadowEffect", {
                code,
                player: s.combat?.attackPlayer ?? activeSeat(s),
              }),
            ],
          }),
        ],
      }));
  });
}

// ---------------------------------------------------------------- damage

/** Livery of the Tower: spend X resources to cancel X damage just dealt. */
export function offerLiveryDamage(
  s: GameState,
  target: Unit,
  value: number,
  context: DamageContext,
): boolean {
  if (
    context.bypassLivery ||
    value <= 0 ||
    !isHero(target) ||
    target.resources < 1
  )
    return false;
  const livery = target.attachments.find(
    (a) => a.code === P.livery && enabled(a),
  );
  if (!livery) return false;
  prepend(
    s,
    fx("fwpLiveryWindow", {
      target: target.id,
      source: livery.id,
      value,
      text: encodeDamageContext(context),
      player: attachmentController(s, target, livery) ?? ownerOf(s, target),
    }),
  );
  return true;
}
function resumeDamage(s: GameState, e: Effect, value: number) {
  const context = { ...readDamageContext(e), bypassLivery: true };
  const target = get(s, e.target);
  if (!target) return;
  if (value <= 0) {
    check(s);
    return;
  }
  const enemy = get(s, context.enemyId);
  const remaining = stats(s, target).health - target.damage;
  if (damage(s, target.id, value, context) && enemy && context.combatDamage)
    applyCombatDamageConsequences(s, target, enemy, value, remaining);
}

// ---------------------------------------------------------------- engagement

/** Roheryn: after you optionally engage an enemy. */
export function flameWestPlayerEnemyEngaged(
  s: GameState,
  enemy: Unit,
  optional: boolean,
) {
  if (!optional || !isEnemy(enemy)) return;
  const p = activeSeat(s);
  const offers = s.heroes.flatMap((h) =>
    h.attachments
      .filter(
        (a) =>
          a.code === P.roheryn &&
          enabled(a) &&
          !a.exhausted &&
          !h.exhausted &&
          (attachmentController(s, h, a) ?? ownerOf(s, h)) === p,
      )
      .map((a) =>
        fx("fwpRoherynOffer", {
          target: h.id,
          source: a.id,
          text: enemy.id,
          player: p,
        }),
      ),
  );
  if (offers.length) prepend(s, ...offers);
}

// ---------------------------------------------------------------- effects

export function flameWestPlayerEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    // Grimbold: discard him; the enemy cannot attack that player this phase.
    case "fwpGrimbold": {
      const grimbold = get(s, e.source);
      requireRule(
        grimbold?.code === P.grimbold &&
          u &&
          seatView(s, e.value ?? p).engaged.some((x) => x.id === u.id),
        "Grimbold must still be in play and the enemy engaged with that player.",
      );
      discardCharacter(s, grimbold!);
      log(
        s,
        s.table
          ? `Grimbold is discarded: ${name(u!)} cannot attack ${seatName(s, e.value ?? p)} this phase.`
          : `Grimbold is discarded: ${name(u!)} cannot attack you this phase.`,
        "good",
      );
      prepend(s, fx("feintEnemy", { target: u!.id, value: e.value ?? p }));
      return true;
    }
    // Ghân-buri-Ghân: discard him to travel without the Travel effect.
    case "fwpGhanTravel": {
      const ghan = get(s, e.source);
      requireRule(
        ghan?.code === P.ghan && u && ghanTargets(s).some((x) => x.id === u.id),
        "Ghân-buri-Ghân must still be in play and the location reachable.",
      );
      discardCharacter(s, ghan!);
      log(
        s,
        `Ghân-buri-Ghân is discarded: the players travel to ${name(u!)} without resolving its Travel effect.`,
        "good",
      );
      // The travel itself is the group's, as the first player's ordinary travel.
      prepend(s, fx("travelEnter", { target: u!.id, player: firstPlayer(s) }));
      return true;
    }
    // Golden Shield: add the hero's willpower to its defense for this attack.
    case "fwpShieldOffer": {
      const shield = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.shield && enabled(a),
      );
      if (!u || !shield || shield.exhausted || !s.combat) return true;
      choosePlayerResponse(
        s,
        shield.id,
        P.shield,
        `Golden Shield · ${name(u)} defends${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.shield,
            label: `Exhaust Golden Shield: +${stats(s, u).will} defense for this attack`,
            effects: [
              fx("fwpShieldUse", {
                target: u.id,
                source: shield.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after attached hero is declared as a defender, exhaust Golden Shield to add attached hero's willpower to its defense for this attack.",
        p,
      );
      return true;
    }
    case "fwpShieldUse": {
      const shield = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.shield,
      );
      const c = s.combat;
      requireRule(
        u && shield && !shield.exhausted && c,
        "Golden Shield must be ready and its hero defending.",
      );
      shield!.exhausted = true;
      const will = stats(s, u!).will;
      c!.defenseBonuses ??= {};
      c!.defenseBonuses[u!.id] = (c!.defenseBonuses[u!.id] ?? 0) + will;
      log(
        s,
        `Golden Shield: ${name(u!)} adds ${will} willpower to its defense for this attack.`,
        "good",
      );
      return true;
    }
    // Beregond: reduce the defending player's threat by 1.
    case "fwpBeregondOffer": {
      const beregond = get(s, e.source);
      if (!beregond || s.used.includes(beregondKey(beregond.id))) return true;
      const defending = e.value ?? p;
      choosePlayerResponse(
        s,
        beregond.id,
        P.beregond,
        `Beregond · Defended and took no damage${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.beregond,
            label: s.table
              ? `Reduce ${seatName(s, defending)}'s threat by 1`
              : "Reduce your threat by 1",
            effects: [
              fx("fwpBeregondUse", {
                source: beregond.id,
                value: defending,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after Beregond defends an attack and takes no damage, reduce the defending player's threat by 1. (Limit once per round.)",
        p,
      );
      return true;
    }
    case "fwpBeregondUse": {
      const beregond = get(s, e.source);
      if (!beregond || s.used.includes(beregondKey(beregond.id))) return true;
      s.used.push(beregondKey(beregond.id));
      const defending = e.value ?? p;
      forOwner(s, defending, () => reduceThreat(s, 1, P.beregond));
      log(
        s,
        s.table
          ? `Beregond: ${seatName(s, defending)}'s threat is reduced by 1.`
          : "Beregond: your threat is reduced by 1.",
        "good",
      );
      return true;
    }
    // Sterner than Steel's cost: exhaust a Weapon or Armor on the defender.
    case "fwpSternerCost": {
      const costs = sternerCosts(s, p);
      requireRule(
        costs.length,
        "Sterner than Steel needs a ready Weapon or Armor on the defender.",
      );
      if (costs.length === 1) {
        prepend(
          s,
          fx("fwpSternerExhaust", {
            target: costs[0].host.id,
            source: costs[0].attachment.id,
            player: p,
          }),
        );
        return true;
      }
      choose(
        s,
        `Sterner than Steel · Exhaust a Weapon or Armor${seatLabel(s, p)}`,
        costs.map(({ host, attachment }) => ({
          id: attachment.id,
          code: attachment.code,
          label: `${card(attachment.code).name} on ${name(host)}`,
          effects: [
            fx("fwpSternerExhaust", {
              target: host.id,
              source: attachment.id,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "fwpSternerExhaust": {
      const a = u?.attachments.find((x) => x.id === e.source);
      requireRule(
        a && !a.exhausted,
        "The Weapon or Armor must still be ready.",
      );
      a!.exhausted = true;
      log(s, `Sterner than Steel: ${card(a!.code).name} is exhausted.`);
      return true;
    }
    // Livery of the Tower: spend X resources to cancel X damage just dealt.
    case "fwpLiveryWindow": {
      const value = e.value ?? 0;
      const livery = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.livery && enabled(a),
      );
      if (!u || !livery || u.resources < 1) {
        resumeDamage(s, e, value);
        return true;
      }
      const most = Math.min(value, u.resources);
      choosePlayerResponse(
        s,
        livery.id,
        P.livery,
        `Livery of the Tower · ${value} damage to ${name(u)}${seatLabel(s, p)}`,
        [
          ...Array.from({ length: most }, (_, i) => ({
            id: `cancel-${i + 1}`,
            code: P.livery,
            label: `Spend ${i + 1} resource${i ? "s" : ""}: cancel ${i + 1} damage`,
            effects: [{ ...e, kind: "fwpLiveryUse", count: i + 1 }],
          })),
          { ...skip, effects: [{ ...e, kind: "fwpLiveryResume", count: 0 }] },
        ],
        "Response: spend X resources from attached hero's pool to cancel X damage just dealt to attached hero.",
        p,
      );
      return true;
    }
    case "fwpLiveryUse": {
      const x = Math.min(e.count ?? 0, u?.resources ?? 0, e.value ?? 0);
      if (u && x > 0) {
        spendResources(s, u, x);
        log(
          s,
          `Livery of the Tower: ${name(u)} spends ${x} resource${x === 1 ? "" : "s"} to cancel ${x} damage.`,
          "good",
        );
      }
      resumeDamage(s, e, (e.value ?? 0) - x);
      return true;
    }
    case "fwpLiveryResume":
      resumeDamage(s, e, e.value ?? 0);
      return true;
    // Roheryn: exhaust Roheryn and the hero to attack the engaged enemy.
    case "fwpRoherynOffer": {
      const roheryn = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.roheryn && enabled(a),
      );
      const enemy = get(s, e.text);
      if (
        !u ||
        !roheryn ||
        roheryn.exhausted ||
        u.exhausted ||
        !enemy ||
        !s.engaged.some((x) => x.id === enemy.id)
      )
        return true;
      choosePlayerResponse(
        s,
        roheryn.id,
        P.roheryn,
        `Roheryn · You optionally engaged ${name(enemy)}${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.roheryn,
            label: `Exhaust Roheryn and ${name(u)}: ${name(u)} attacks ${name(enemy)}`,
            effects: [
              fx("fwpRoherynAttack", {
                target: u.id,
                source: roheryn.id,
                text: enemy.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after you optionally engage an enemy, exhaust Roheryn and attached hero to declare that hero as an attacker (and resolve its attack) against that enemy.",
        p,
      );
      return true;
    }
    case "fwpRoherynAttack": {
      const roheryn = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.roheryn,
      );
      const enemy = get(s, e.text);
      requireRule(
        u &&
          roheryn &&
          !roheryn.exhausted &&
          enemy &&
          s.engaged.some((x) => x.id === enemy.id),
        "Roheryn's hero attacks an enemy engaged with you.",
      );
      roheryn!.exhausted = true;
      requireRule(exhaustCharacter(s, u!), "The attached hero cannot exhaust.");
      log(s, `Roheryn: ${name(u!)} rides against ${name(enemy!)}.`);
      playerAttack(s, enemy!, [u!.id], false, "roheryn");
      return true;
    }
  }
  return false;
}
