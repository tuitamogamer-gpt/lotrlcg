import type {
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { reduceThreat, type ThreatSource } from "./threat-reduction";
import { card, cards, name } from "./cards";
import {
  cannotReady,
  choose,
  draw,
  engagementCost,
  fx,
  get,
  log,
  prepend,
  requireRule,
  skip,
  threatOf,
} from "./core";
import {
  damage,
  discardAttachment,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  attachmentController,
  globalCharacters,
  ownerOf,
  seatName,
  seatView,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { isAlly, isHero } from "./card-types";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import { isEnemy } from "./ships";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";

/**
 * The player cards of The Lord of the Rings: The Black Riders other than
 * Frodo Baggins (the Saga framework) and Elf-stone (the collector module).
 * Hobbit Cloak, Dagger of Westernesse and Hobbit Pipe register their attach
 * restrictions and printed bonuses in the attachment rules of
 * `expansion-passives.ts`; their conditional parts live here.
 */
export const BLACK_RIDERS_PLAYER = {
  sam: "141002",
  merry: "141003",
  pippin: "141004",
  fatty: "141005",
  bill: "141006",
  barliman: "141007",
  maggot: "141008",
  determination: "141009",
  smoke: "141010",
  notice: "141011",
  intuition: "141012",
  cloak: "141013",
  dagger: "141014",
  pipe: "141015",
} as const;
const P = BLACK_RIDERS_PLAYER;

const live = (u: Unit) => !u.blanked && !isSacked(u);
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const hobbitHeroes = (s: GameState, p: number) =>
  seatView(s, p).heroes.filter((h) => hasTrait(h, "Hobbit"));
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
/** "An enemy with an engagement cost higher than your threat." */
const higher = (s: GameState, enemy: Unit, p: number) =>
  engagementCost(s, enemy) > effectiveThreat(s, p);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter((u) => isEnemy(u));
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
/** The threat an enemy has, even while it does not contribute it. */
const enemyThreat = (s: GameState, u: Unit) =>
  threatOf(s, { ...u, suppressed: false, ignoreThreatRound: undefined });
function attachmentById(s: GameState, id?: string) {
  for (const host of globalCharacters(s)) {
    const a = host.attachments.find((x) => x.id === id);
    if (a) return { host, a };
  }
  return undefined;
}

// ---------------------------------------------------------------- passives

/**
 * Pippin: each enemy in play gets +1 engagement cost for each Hobbit hero his
 * controller controls. Enemies immune to player card effects ignore it
 * (FAQ 1.9, section 1.47).
 */
export function blackRidersPlayerEngagementBonus(s: GameState, u: Unit) {
  if (!isEnemy(u)) return 0;
  let bonus = 0;
  for (const pippin of globalCharacters(s))
    if (pippin.code === P.pippin && live(pippin))
      bonus += hobbitHeroes(s, ownerOf(s, pippin)).length;
  return bonus && !playerEffectImmune(s, u, P.pippin) ? bonus : 0;
}
/** Merry's attack and Bill the Pony's hit points, for characters in play. */
export function blackRidersPlayerStats(s: GameState, u: Unit) {
  const result = { attack: 0, health: 0 };
  if (u.code === P.merry && live(u))
    result.attack += hobbitHeroes(s, ownerOf(s, u)).length;
  if (isCharacter(u) && hasTrait(u, "Hobbit")) {
    const inPlay = globalCharacters(s);
    if (
      inPlay.some((b) => b.code === P.bill && live(b)) &&
      inPlay.some((x) => x.id === u.id)
    )
      result.health += 1;
  }
  return result;
}
/** Dagger of Westernesse: +1 more attack against a higher engagement cost. */
export const blackRidersPlayerAttackBonus = (
  s: GameState,
  u: Unit,
  enemy: Unit,
) =>
  u.attachments.filter(
    (a) =>
      a.code === P.dagger &&
      enabled(a) &&
      higher(s, enemy, attachmentController(s, u, a) ?? ownerOf(s, u)),
  ).length;
/** Hobbit Cloak: +2 defense against an enemy with a higher engagement cost. */
export const blackRidersPlayerDefenseBonus = (
  s: GameState,
  defender: Unit,
  enemy: Unit,
) =>
  2 *
  defender.attachments.filter(
    (a) =>
      a.code === P.cloak &&
      enabled(a) &&
      higher(
        s,
        enemy,
        attachmentController(s, defender, a) ?? ownerOf(s, defender),
      ),
  ).length;
/**
 * Barliman Butterbur: if each hero the defending player controls is a Hobbit,
 * undefended damage may go to him.
 */
export function blackRidersPlayerUndefendedTargets(s: GameState): Unit[] {
  if (!s.heroes.length || !s.heroes.every((h) => hasTrait(h, "Hobbit")))
    return [];
  return s.allies.filter((u) => u.code === P.barliman && live(u));
}
/** Bill the Pony (2 less with Sam Gamgee) and Take No Notice (1 less per Hobbit or Ranger hero). */
export function blackRidersPlayerCostReduction(s: GameState, c: Card) {
  if (c.code === P.bill)
    return [...s.heroes, ...s.allies].some(
      (u) => card(u.code).name === "Sam Gamgee",
    )
      ? 2
      : 0;
  if (c.code === P.notice)
    return s.heroes.filter(
      (h) => hasTrait(h, "Hobbit") || hasTrait(h, "Ranger"),
    ).length;
  return 0;
}
/**
 * "Cannot have attachments" is absolute: anything attached to Bill the Pony
 * while his text box was blank is discarded once it is active again (FAQ 1.9,
 * section 1.56).
 */
export function blackRidersPlayerCheck(s: GameState) {
  for (const bill of globalCharacters(s).filter(
    (u) => u.code === P.bill && !u.blanked,
  ))
    for (const a of [...bill.attachments])
      discardAttachment(s, bill, a, false, false);
}

// ------------------------------------------------------------------ events

const determinationTargets = (s: GameState) =>
  allCharacters(s).filter(
    (u) => hasTrait(u, "Hobbit") && !playerEffectImmune(s, u, P.determination),
  );
/** Pipe attachments the active player controls, on any character. */
const pipesYouControl = (s: GameState) =>
  globalCharacters(s).reduce(
    (n, host) =>
      n +
      host.attachments.filter(
        (a) =>
          attachmentHasTrait(a, "Pipe") &&
          attachmentController(s, host, a) === activeSeat(s),
      ).length,
    0,
  );
const pipeHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      h.attachments.some((a) => attachmentHasTrait(a, "Pipe")) &&
      !playerEffectImmune(s, h, P.smoke),
  );
const noticeTargets = (s: GameState) =>
  enemiesInPlay(s).filter((u) => !playerEffectImmune(s, u, P.notice));

export function blackRidersPlayerTargets(s: GameState, code: string) {
  return code === P.determination ? determinationTargets(s) : undefined;
}
export function blackRidersPlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  if (u.code === P.determination && !determinationTargets(s).length)
    return "Halfling Determination needs a Hobbit character to choose.";
  if (u.code === P.smoke && !pipesYouControl(s) && !pipeHeroes(s).length)
    return "Smoke Rings needs a Pipe you control or a hero with a Pipe attachment.";
  if (u.code === P.notice && !noticeTargets(s).length)
    return "Take No Notice needs an enemy in play whose engagement cost can change.";
  return null;
}
export function blackRidersPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  switch (code) {
    case P.determination: {
      const u = get(s, target);
      if (!u || !determinationTargets(s).some((x) => x.id === u.id))
        return true;
      u.tempWill = (u.tempWill ?? 0) + 2;
      u.tempAttack = (u.tempAttack ?? 0) + 2;
      u.tempDefense = (u.tempDefense ?? 0) + 2;
      log(
        s,
        `Halfling Determination: ${name(u)} gets +2 willpower, attack and defense until the end of the phase.`,
        "good",
      );
      return true;
    }
    case P.smoke: {
      // Both parts are fixed when the event resolves (FAQ 1.9, section 1.55).
      const reduction = pipesYouControl(s);
      const heroes = pipeHeroes(s);
      for (const h of heroes) h.tempWill = (h.tempWill ?? 0) + 1;
      const parts = [
        ...(reduction ? [`your threat −${reduction}`] : []),
        ...(heroes.length
          ? [
              `${heroes.map((h) => name(h)).join(", ")} get${heroes.length === 1 ? "s" : ""} +1 willpower until the end of the phase`,
            ]
          : []),
      ];
      log(s, `Smoke Rings: ${parts.join("; ")}.`, "good");
      if (reduction) reduceThreat(s, reduction, code);
      return true;
    }
    case P.notice: {
      const enemies = noticeTargets(s);
      for (const u of enemies) u.tempEngagement = (u.tempEngagement ?? 0) + 5;
      log(
        s,
        `Take No Notice: ${enemies.map((u) => name(u)).join(", ")} get${enemies.length === 1 ? "s" : ""} +5 engagement cost until the end of the round.`,
        "good",
      );
      return true;
    }
    case P.intuition: {
      const heroes = s.heroes.filter(
        (h) => !playerEffectImmune(s, h, P.intuition),
      );
      for (const h of heroes) h.roundWill = (h.roundWill ?? 0) + 1;
      const count = hobbitHeroes(s, activeSeat(s)).length;
      log(
        s,
        `Frodo's Intuition: each hero you control gets +1 willpower until the end of the round; draw ${count}.`,
        "good",
      );
      if (count) draw(s, count);
      return true;
    }
  }
  return false;
}

// --------------------------------------------------------------- abilities

const fattyKey = (u: Unit) => `round:${P.fatty}:${u.id}`;
const fattyTargets = (s: GameState) =>
  s.staging.filter((u) => isEnemy(u) && !playerEffectImmune(s, u, P.fatty));
export const blackRidersPlayerAbilityLabel = (code: string) =>
  code === P.fatty
    ? "Fatty Bolger · Exhaust: raise your threat so a staging enemy does not contribute its threat"
    : undefined;
export function blackRidersPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId || u.code !== P.fatty) return undefined;
  if (!live(u)) return "Fatty Bolger's printed text is blank.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "You do not control Fatty Bolger.";
  if (!canExhaust(u)) return "Fatty Bolger must be ready.";
  if (s.used.includes(fattyKey(u)))
    return "Fatty Bolger's action is limited to once per round.";
  if (!fattyTargets(s).length) return "There is no enemy in the staging area.";
  return undefined;
}
export function useBlackRidersPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || u.code !== P.fatty) return false;
  const problem = blackRidersPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  requireRule(exhaustCharacter(s, u), "Fatty Bolger cannot exhaust.");
  s.used.push(fattyKey(u));
  choose(
    s,
    "Fatty Bolger · Choose an enemy in the staging area",
    fattyTargets(s).map((x) => ({
      id: x.id,
      code: x.code,
      label: `${name(x)} · ${enemyThreat(s, x)} threat`,
      effects: [fx("brpFatty", { source: u.id, target: x.id, player })],
    })),
    "Raise your threat by its threat. Until the end of the phase, it does not contribute its threat.",
  );
  return true;
}

// --------------------------------------------------------------- responses

/**
 * Sam Gamgee and Pippin respond when their controller engages an enemy with
 * a higher engagement cost than that player's threat. Being engaged by an
 * enemy, including one put into play engaged, is the same as engaging it
 * (FAQ 1.9, section 1.49).
 */
export function blackRidersPlayerEnemyEngaged(s: GameState, enemy: Unit) {
  const p = activeSeat(s);
  if (!higher(s, enemy, p)) return;
  const own = [...s.heroes, ...s.allies];
  const offers: Effect[] = [
    ...own
      .filter((u) => u.code === P.sam && live(u))
      .map((u) =>
        fx("brpSamOffer", { source: u.id, target: enemy.id, player: p }),
      ),
    ...own
      .filter((u) => u.code === P.pippin && live(u))
      .map((u) =>
        fx("brpPippinOffer", { source: u.id, target: enemy.id, player: p }),
      ),
  ];
  if (offers.length) prepend(s, ...offers);
}
const merryTargets = (s: GameState, merry: Unit, ids: string[]) =>
  ids
    .filter((id) => id !== merry.id)
    .map((id) => get(s, id))
    .filter(
      (u): u is Unit =>
        !!u &&
        isCharacter(u) &&
        u.exhausted &&
        !cannotReady(u, s) &&
        !playerEffectImmune(s, u, P.merry),
    );
/** Merry: after he participates in an attack that destroys an enemy. */
export function blackRidersPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  for (const merry of ids
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && u.code === P.merry && live(u)))
    if (merryTargets(s, merry, ids).length)
      prepend(
        s,
        fx("brpMerryOffer", {
          source: merry.id,
          ids,
          player: ownerOf(s, merry),
        }),
      );
}
const maggotTargets = (s: GameState, p: number) =>
  seatView(s, p).engaged.filter(
    (u) => isEnemy(u) && !playerEffectImmune(s, u, P.maggot),
  );
/** Farmer Maggot: after he enters play, however he entered. */
export function blackRidersPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code !== P.maggot || !live(u)) return;
  const p = ownerOf(s, u);
  if (maggotTargets(s, p).length)
    prepend(s, fx("brpMaggotOffer", { source: u.id, player: p }));
}
/**
 * Hobbit Pipe: after its controller's threat is reduced by an event card
 * effect. The source names the event, or the event still resolving made the
 * reduction.
 */
export function blackRidersPlayerThreatReduced(
  s: GameState,
  source: ThreatSource | string | undefined,
  reason: string,
) {
  if (reason !== "player-card" || !fromEvent(s, source)) return;
  const p = activeSeat(s);
  const offers = globalCharacters(s).flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          a.code === P.pipe &&
          enabled(a) &&
          !a.exhausted &&
          attachmentController(s, host, a) === p,
      )
      .map((a) => fx("brpPipeOffer", { source: a.id, player: p })),
  );
  if (offers.length) prepend(s, ...offers);
}
function fromEvent(s: GameState, source: ThreatSource | string | undefined) {
  const id = typeof source === "string" ? source : source?.id;
  const code =
    typeof source === "string"
      ? cards[source]
        ? source
        : undefined
      : source?.code;
  const resolved =
    code ??
    s.resolvingEvents?.find((x) => x.unit.id === id)?.unit.code ??
    (id ? (get(s, id)?.code ?? attachmentById(s, id)?.a.code) : undefined);
  if (resolved) return cards[resolved]?.type_code === "event";
  return !!s.resolvingEvents?.length;
}

const use = (label: string, effects: Effect[]): Option => ({
  id: "use",
  label,
  effects,
});

export function blackRidersPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("brp")) return false;
  const p = e.player ?? activeSeat(s);
  const source = get(s, e.source);
  const target = get(s, e.target);
  switch (e.kind) {
    case "brpSamOffer":
      if (!source || !live(source) || ownerOf(s, source) !== p) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Sam Gamgee · Ready him and give him +1 willpower, attack and defense",
        [
          use("Ready Sam Gamgee; +1 willpower, attack and defense this round", [
            fx("brpSam", { source: source.id, player: p }),
          ]),
          skip,
        ],
        target
          ? `${name(target)} has an engagement cost higher than your threat.`
          : undefined,
        p,
      );
      return true;
    case "brpSam":
      if (!source) return true;
      if (source.exhausted) readyCharacter(s, source);
      // The bonus does not depend on readying him (FAQ 1.9 card ruling).
      source.roundWill = (source.roundWill ?? 0) + 1;
      source.roundAttack = (source.roundAttack ?? 0) + 1;
      source.roundDefense = (source.roundDefense ?? 0) + 1;
      log(
        s,
        "Sam Gamgee readies and gets +1 willpower, attack and defense until the end of the round.",
        "good",
      );
      return true;
    case "brpPippinOffer":
      if (
        !source ||
        !live(source) ||
        ownerOf(s, source) !== p ||
        !s.deck.length
      )
        return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Pippin · Draw a card",
        [use("Draw 1 card", [fx("brpPippinDraw", { player: p })]), skip],
        target
          ? `${name(target)} has an engagement cost higher than your threat.`
          : undefined,
        p,
      );
      return true;
    case "brpPippinDraw":
      log(s, "Pippin: his controller draws 1 card.", "good");
      draw(s, 1);
      return true;
    case "brpMerryOffer": {
      if (!source || !live(source)) return true;
      const targets = merryTargets(s, source, e.ids ?? []);
      if (!targets.length) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Merry · Ready another character that participated in the attack",
        [
          ...targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Ready ${name(u)}${seatLabel(s, ownerOf(s, u))}`,
            effects: [
              fx("brpMerryReady", {
                source: source.id,
                target: u.id,
                ids: e.ids,
                player: p,
              }),
            ],
          })),
          skip,
        ],
        undefined,
        p,
      );
      return true;
    }
    case "brpMerryReady":
      if (
        source &&
        target &&
        merryTargets(s, source, e.ids ?? []).some((u) => u.id === target.id)
      ) {
        readyCharacter(s, target);
        log(s, `Merry readies ${name(target)}.`, "good");
      }
      return true;
    case "brpMaggotOffer": {
      if (!source || !live(source)) return true;
      const targets = maggotTargets(s, p);
      if (!targets.length) return true;
      choosePlayerResponse(
        s,
        source.id,
        source.code,
        "Farmer Maggot · Deal damage to an enemy engaged with you",
        [
          ...targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `${name(u)} · ${higher(s, u, p) ? 2 : 1} damage`,
            effects: [
              fx("brpMaggotDamage", {
                source: source.id,
                target: u.id,
                player: p,
              }),
            ],
          })),
          skip,
        ],
        "2 damage instead of 1 to an enemy whose engagement cost is higher than your threat.",
        p,
      );
      return true;
    }
    case "brpMaggotDamage":
      if (target && maggotTargets(s, p).some((u) => u.id === target.id)) {
        const amount = higher(s, target, p) ? 2 : 1;
        log(s, `Farmer Maggot deals ${amount} damage to ${name(target)}.`);
        damage(s, target.id, amount);
      }
      return true;
    case "brpFatty": {
      if (
        !target ||
        !s.staging.some((u) => u.id === target.id) ||
        playerEffectImmune(s, target, P.fatty)
      )
        return true;
      const amount = enemyThreat(s, target);
      if (amount) raiseThreat(s, amount, "player-card");
      target.suppressed = true;
      log(
        s,
        `Fatty Bolger: threat +${amount}; ${name(target)} does not contribute its threat until the end of the phase.`,
      );
      return true;
    }
    case "brpPipeOffer": {
      const found = attachmentById(s, e.source);
      if (!found || !enabled(found.a) || found.a.exhausted || !s.deck.length)
        return true;
      choosePlayerResponse(
        s,
        found.a.id,
        found.a.code,
        "Hobbit Pipe · Exhaust to draw a card",
        [
          use("Exhaust Hobbit Pipe and draw 1 card", [
            fx("brpPipeDraw", { source: found.a.id, player: p }),
          ]),
          skip,
        ],
        `Attached to ${name(found.host)}.`,
        p,
      );
      return true;
    }
    case "brpPipeDraw": {
      const found = attachmentById(s, e.source);
      if (!found || found.a.exhausted) return true;
      found.a.exhausted = true;
      log(s, "Hobbit Pipe exhausts: its controller draws 1 card.", "good");
      draw(s, 1);
      return true;
    }
  }
  return false;
}
