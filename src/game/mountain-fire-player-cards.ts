import { sagaCampaignOneRingExhausted } from "./saga-campaign-cards";
import type { Card, Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  canGainResources,
  canPay,
  cannotReady,
  choose,
  engagementCost,
  fx,
  get,
  log,
  prepend,
  requireRule,
  shuffle,
  skip,
  spendResources,
  stats,
  takePlayerDeck,
} from "./core";
import {
  allyCanEnter,
  destroy,
  discardAttachment,
  enterAlly,
  exhaustCharacter,
  readyCharacter,
  returnAlly,
  takePlayerDiscard,
} from "./board";
import {
  activeSeat,
  attachmentController,
  forOwner,
  globalCharacters,
  ownerOf,
  seatName,
  seatView,
} from "./table";
import {
  MOUNTAIN_FIRE_ARAGORN,
  MOUNTAIN_FIRE_FRODO,
  isOneRing,
} from "./lotr-saga-codes";
import { batch4Scenario } from "./batch4-scenarios";
import { isAlly, isHero } from "./card-types";
import { hasTrait } from "./expansion-passives";
import { isEnemy } from "./ships";
import { playerEffectImmune } from "./player-effect-immunity";
import { playerCardImmune } from "./card-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { stormcallerEffectiveThreat as effectiveThreat } from "./threat-read";
import { heirsCanSpendResources } from "./heirs-numenor";
import { isSacked } from "./carrock";
import { fateCannotSearch } from "./fate-numenor";
import { eomerCanAttack, playerAttack } from "./combat";
import { captainsKey, titleInPlay } from "./mountain-fire-player-support";

/**
 * The Lord of the Rings: The Mountain of Fire player cards. The Saga places
 * the Fellowship-sphere Frodo Baggins; his Planning Action exhausts The One
 * Ring to add 1 resource to a hero's pool. In The Tower of Cirith Ungol The
 * One Ring rides with the hero carrying Last of the Company until 3A, so the
 * cost is paid wherever the Ring is attached, by the player who controls it.
 * The Black Gate Opens places the Fellowship-sphere Aragorn instead, whose
 * Action spends 1 resource from his pool to ready him once per phase.
 *
 * Éomer, Tom Cotton, Rosie Cotton, Elfhelm, Elladan, Elrohir, Orc Disguise,
 * Captains of the West, Gúthwinë and Raise the Shire complete the box;
 * Friend of Friends is a passive attachment and Gwaihir the objective-ally of
 * The Black Gate Opens.
 */
export const MOUNTAIN_FIRE_PLAYER = {
  frodo: MOUNTAIN_FIRE_FRODO,
  aragorn: MOUNTAIN_FIRE_ARAGORN,
  eomer: "146003",
  tom: "146004",
  rosie: "146005",
  elfhelm: "146006",
  elladan: "146007",
  elrohir: "146008",
  disguise: "146009",
  captains: "146010",
  guthwine: "146011",
  raise: "146013",
} as const;
/** Aragorn's Action: limit once per phase, for each copy. */
const aragornKey = (id: string) => `phase:mfp-aragorn:${id}`;
/** Tom Cotton: the first Hobbit ally a player plays this round. */
const TOM_HOBBIT = "round:mfp-tom-hobbit";
/** Rosie Cotton's Action: limit once per phase, for each copy. */
const rosieKey = (id: string) => `phase:mfp-rosie:${id}`;
/** Elfhelm is discarded at the end of the phase he was put into play. */
const ELFHELM_DISCARD = "phase:mfp-elfhelm:";
/** Orc Disguise: that enemy cannot attack this player until the end of the round. */
const disguiseKey = (enemy: string) => `round:mfp-disguise:${enemy}`;
/** Gúthwinë: +2 attack for this attack; the key records its controller. */
const GUTHWINE = "phase:mfp-guthwine:";
/** Raise the Shire: the ally returns to its owner's hand at the end of the round. */
const RAISE_RETURN = "round:mfp-raise:";
const P = MOUNTAIN_FIRE_PLAYER;

const live = (u: Unit) => !u.blanked;
const enabled = (a: { blanked?: boolean; facedown?: boolean }) =>
  !a.blanked && !a.facedown;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const seatSuffix = (s: GameState, u: Unit) =>
  s.table ? ` · ${seatName(s, ownerOf(s, u))}` : "";
const traitsOf = (c: Card) =>
  (c.traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const hobbitAllyCard = (c: Card) =>
  c.type_code === "ally" && traitsOf(c).includes("Hobbit");
/** Every player's used list: the keys of effects on other players' cards. */
const lists = (s: GameState) =>
  new Set([s.used, ...(s.table?.seats.map((p) => p.used) ?? [])]);
/** "An enemy with an engagement cost higher than your threat." */
const higher = (s: GameState, enemy: Unit, p: number) =>
  engagementCost(s, enemy) > effectiveThreat(s, p);
const isOrc = (u: Unit) => isEnemy(u) && hasTrait(u, "Orc");

/** The One Ring in play, with the character it is attached to. */
function theOneRing(s: GameState) {
  for (const host of globalCharacters(s)) {
    const ring = host.attachments.find((a) => isOneRing(a.code));
    if (ring) return { host, ring };
  }
  return undefined;
}
/** The heroes whose pool can take the resource. */
const recipients = (s: GameState) =>
  globalCharacters(s).filter((u) => isHero(u) && canGainResources(s, u));

// ---------------------------------------------------------------- actions

export const mountainFirePlayerAbilityLabel = (code: string) =>
  code === P.frodo
    ? "Frodo Baggins · Exhaust The One Ring to add 1 resource to a hero's pool"
    : code === P.aragorn
      ? "Aragorn · Spend 1 resource from Aragorn's pool to ready him"
      : code === P.rosie
        ? "Rosie Cotton · Exhaust her: add her willpower to a Hobbit hero's willpower, attack or defense until the end of the phase"
        : undefined;
function aragornProblem(s: GameState, u: Unit): string | undefined {
  if (u.blanked) return "Aragorn's printed text is blank.";
  if (ownerOf(s, u) !== activeSeat(s)) return "You do not control Aragorn.";
  if (s.used.includes(aragornKey(u.id)))
    return "Aragorn's Action is limited to once per phase.";
  if (u.resources < 1) return "Aragorn needs 1 resource in his resource pool.";
  if (!u.exhausted) return "Aragorn is already ready.";
  if (cannotReady(u, s)) return "Aragorn cannot be readied.";
  return undefined;
}
/** Rosie Cotton: the Hobbit heroes in play. */
const hobbitHeroes = (s: GameState) =>
  globalCharacters(s).filter(
    (h) => isHero(h) && hasTrait(h, "Hobbit") && !playerCardImmune(h),
  );
function rosieProblem(s: GameState, u: Unit): string | undefined {
  if (!live(u)) return "Rosie Cotton's printed text is blank.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "You do not control Rosie Cotton.";
  if (s.used.includes(rosieKey(u.id)))
    return "Rosie Cotton's Action is limited to once per phase.";
  if (u.exhausted) return "Rosie Cotton must be ready to exhaust.";
  if (!hobbitHeroes(s).length) return "Rosie Cotton needs a Hobbit hero.";
  return undefined;
}
export function mountainFirePlayerAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code === P.aragorn) return aragornProblem(s, u);
  if (u.code === P.rosie) return rosieProblem(s, u);
  if (u.code !== P.frodo) return undefined;
  const title = card(u.code).name;
  if (u.blanked) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  if (s.phase !== "planning")
    return "Frodo Baggins' ability is a Planning Action.";
  const held = theOneRing(s);
  if (!held) return "The One Ring is not in play.";
  if (
    (attachmentController(s, held.host, held.ring) ?? ownerOf(s, held.host)) !==
    activeSeat(s)
  )
    return "You do not control The One Ring.";
  if (held.ring.exhausted) return "The One Ring is exhausted.";
  if (!recipients(s).length) return "No hero can gain resources.";
  return undefined;
}
const ATTRIBUTES = [
  ["will", "willpower"],
  ["attack", "attack"],
  ["defense", "defense"],
] as const;
export function useMountainFirePlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  if (attachmentId || ![P.frodo, P.aragorn, P.rosie].includes(u.code as never))
    return false;
  const problem = mountainFirePlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  if (u.code === P.aragorn) {
    s.used.push(aragornKey(u.id));
    spendResources(s, u, 1);
    readyCharacter(s, u);
    log(s, "Aragorn spends 1 resource from his pool to ready himself.", "good");
    return true;
  }
  if (u.code === P.rosie) {
    requireRule(exhaustCharacter(s, u), "Rosie Cotton cannot exhaust.");
    s.used.push(rosieKey(u.id));
    const value = Math.max(0, stats(s, u).will);
    choose(
      s,
      `Rosie Cotton · Add ${value} to a Hobbit hero's attribute${seatLabel(s, p)}`,
      hobbitHeroes(s).flatMap((hero) =>
        ATTRIBUTES.map(([key, label]) => ({
          id: `${hero.id}:${key}`,
          code: hero.code,
          label: `${name(hero)}${seatSuffix(s, hero)}: +${value} ${label}`,
          effects: [
            fx("mfpRosie", {
              source: u.id,
              target: hero.id,
              text: key,
              value,
              player: p,
            }),
          ],
        })),
      ),
      "Action: exhaust Rosie Cotton to choose a Hobbit hero and an attribute (willpower, attack, or defense). Add Rosie Cotton's willpower to that hero's chosen attribute until the end of the phase. (Limit once per phase.)",
    );
    return true;
  }
  theOneRing(s)!.ring.exhausted = true;
  log(s, "Frodo Baggins exhausts The One Ring.", "good");
  batch4Scenario(s).oneRingExhausted?.(s);
  sagaCampaignOneRingExhausted(s);
  choose(
    s,
    `Frodo Baggins · Add 1 resource to a hero's pool${seatLabel(s, p)}`,
    recipients(s).map((hero) => ({
      id: hero.id,
      code: hero.code,
      label: s.table
        ? `${name(hero)} · ${seatName(s, ownerOf(s, hero))}`
        : name(hero),
      effects: [fx("mfpFrodoResource", { target: hero.id, player: p })],
    })),
    "Planning Action: exhaust The One Ring to add 1 resource to a hero's pool.",
  );
  return true;
}

// ---------------------------------------------------------------- Elfhelm

/** Elfhelm: the Rohan heroes you control that can spend 1 resource. */
const rohanPayers = (s: GameState) =>
  s.heroes.filter(
    (h) =>
      hasTrait(h, "Rohan") && h.resources >= 1 && heirsCanSpendResources(s, h),
  );
export const mountainFirePlayerHandAbilityLabel = (code: string) =>
  code === P.elfhelm
    ? "Elfhelm · Spend 1 resource from a Rohan hero's pool to put him into play until the end of the phase"
    : undefined;
export function mountainFirePlayerHandAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code !== P.elfhelm) return undefined;
  if (!s.hand.some((h) => h.id === u.id))
    return "Choose Elfhelm in your own hand.";
  if (!allyCanEnter(s, u.code))
    return "Elfhelm's unique title or a scenario restriction prevents his entry.";
  if (!rohanPayers(s).length)
    return "Elfhelm needs a Rohan hero you control with a resource to spend.";
  return undefined;
}
export function useMountainFirePlayerHandAbility(
  s: GameState,
  u: Unit,
): boolean {
  if (u.code !== P.elfhelm) return false;
  const problem = mountainFirePlayerHandAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  const p = activeSeat(s);
  const payers = rohanPayers(s);
  if (payers.length === 1) {
    prepend(
      s,
      fx("mfpElfhelm", { source: u.id, target: payers[0].id, player: p }),
    );
    return true;
  }
  choose(
    s,
    `Elfhelm · Spend 1 resource from a Rohan hero's pool${seatLabel(s, p)}`,
    payers.map((hero) => ({
      id: hero.id,
      code: hero.code,
      label: `Spend 1 resource from ${name(hero)}'s pool (${hero.resources})`,
      effects: [fx("mfpElfhelm", { source: u.id, target: hero.id, player: p })],
    })),
    "Action: spend 1 resource from a Rohan hero's resource pool to put Elfhelm into play from your hand under your control. At the end of the phase, discard Elfhelm if he is still in play.",
  );
  return true;
}
/** Elfhelm leaves at the end of the phase he was put into play. */
export function mountainFirePlayerPhaseEnd(s: GameState): Effect[] {
  const ids = new Set(
    [...lists(s)].flatMap((list) =>
      list
        .filter((k) => k.startsWith(ELFHELM_DISCARD))
        .map((k) => k.slice(ELFHELM_DISCARD.length)),
    ),
  );
  return globalCharacters(s)
    .filter((u) => ids.has(u.id) && u.code === P.elfhelm)
    .map((u) =>
      fx("mfpElfhelmDiscard", { target: u.id, player: ownerOf(s, u) }),
    );
}

// ---------------------------------------------------------------- Tom Cotton

/**
 * Tom Cotton: while you are engaged with an enemy above your threat, the
 * first Hobbit ally you play each round needs no resource match. The
 * exemption removes the match only, never the cost or spending limits.
 */
export function mountainFirePlayerNoResourceMatch(s: GameState, c: Card) {
  if (!hobbitAllyCard(c) || s.used.includes(TOM_HOBBIT)) return false;
  if (!s.heroes.some((h) => h.code === P.tom && live(h) && !isSacked(h)))
    return false;
  const p = activeSeat(s);
  return s.engaged.some((u) => isEnemy(u) && higher(s, u, p));
}
/** A played Hobbit ally is the first of the round whether or not Tom applied. */
export function mountainFirePlayerCardPlayed(s: GameState, c: Card) {
  if (hobbitAllyCard(c) && !s.used.includes(TOM_HOBBIT))
    s.used.push(TOM_HOBBIT);
}
/** Tom Cotton: after a Hobbit ally enters play. */
export function mountainFirePlayerAllyEntered(s: GameState, u: Unit) {
  if (!isAlly(u) || !hasTrait(u, "Hobbit")) return;
  const offers = globalCharacters(s)
    .filter((h) => h.code === P.tom && isHero(h) && live(h) && !isSacked(h))
    .map((h) =>
      fx("mfpTomOffer", {
        source: h.id,
        target: u.id,
        player: ownerOf(s, h),
      }),
    );
  if (offers.length) prepend(s, ...offers);
}

// ---------------------------------------------------------------- statistics

/** Elladan and Elrohir: +2 attack and +2 defense while the other is in play. */
export function mountainFirePlayerStats(s: GameState, u: Unit) {
  return {
    attack:
      u.code === P.elladan && live(u) && titleInPlay(s, "Elrohir") ? 2 : 0,
    defense:
      u.code === P.elrohir && live(u) && titleInPlay(s, "Elladan") ? 2 : 0,
  };
}

// ---------------------------------------------------------------- Éomer

/** The enemies in the staging area Éomer can attack. */
const eomerTargets = (s: GameState, u: Unit) =>
  s.staging.filter(
    (enemy) =>
      isEnemy(enemy) &&
      !playerEffectImmune(s, enemy, P.eomer) &&
      eomerCanAttack(s, enemy, u) &&
      !batch4Scenario(s).attackProblem?.(s, enemy, [u.id]),
  );
const eomerUsable = (s: GameState, u: Unit) =>
  u.code === P.eomer &&
  live(u) &&
  !isSacked(u) &&
  u.committed === true &&
  u.resources >= 1 &&
  heirsCanSpendResources(s, u) &&
  eomerTargets(s, u).length > 0;
/** Éomer: after he commits to the quest. */
export function mountainFirePlayerCharactersCommitted(
  s: GameState,
  units: Unit[],
) {
  const offers = units
    .filter((u) => eomerUsable(s, u))
    .map((u) => fx("mfpEomerOffer", { source: u.id, player: ownerOf(s, u) }));
  if (offers.length) prepend(s, ...offers);
}

// ---------------------------------------------------------------- engagement

/** Orc Disguise in play, with its host and controller. */
function disguises(s: GameState) {
  return globalCharacters(s).flatMap((host) =>
    host.attachments
      .filter((a) => a.code === P.disguise && enabled(a))
      .map((a) => ({
        host,
        a,
        player: attachmentController(s, host, a) ?? ownerOf(s, host),
      })),
  );
}
/** Orc Disguise: +5 engagement cost while an Orc makes an engagement check with you. */
export function mountainFirePlayerEngagementCheckBonus(
  s: GameState,
  enemy: Unit,
  player: number,
) {
  return isOrc(enemy) &&
    !playerEffectImmune(s, enemy, P.disguise) &&
    disguises(s).some((d) => d.player === player)
    ? 5
    : 0;
}
/** Orc Disguise: "until the end of the round, that enemy cannot attack you." */
export const mountainFirePlayerEnemyCannotAttack = (
  s: GameState,
  enemy: Unit,
  player: number,
) => seatView(s, player).used.includes(disguiseKey(enemy.id));
/**
 * After an enemy engages you: Orc Disguise (an Orc), Raise the Shire, and
 * Elladan and Elrohir (an Orc you optionally engaged).
 */
export function mountainFirePlayerEnemyEngaged(
  s: GameState,
  enemy: Unit,
  optional: boolean,
) {
  if (!isEnemy(enemy)) return;
  const p = activeSeat(s);
  const offers: Effect[] = [];
  if (isOrc(enemy) && !playerEffectImmune(s, enemy, P.disguise))
    for (const d of disguises(s).filter((d) => d.player === p))
      offers.push(
        fx("mfpDisguiseOffer", {
          source: d.a.id,
          target: d.host.id,
          text: enemy.id,
          player: p,
        }),
      );
  const raise = s.hand.find((u) => u.code === P.raise);
  if (raise && canPay(s, card(P.raise)))
    offers.push(
      fx("mfpRaiseOffer", {
        source: raise.id,
        text: enemy.id,
        flag: higher(s, enemy, p),
        player: p,
      }),
    );
  if (optional && isOrc(enemy))
    for (const twin of s.allies.filter(
      (u) =>
        (u.code === P.elladan || u.code === P.elrohir) &&
        live(u) &&
        u.exhausted &&
        !cannotReady(u, s),
    ))
      offers.push(
        fx("mfpTwinOffer", { source: twin.id, text: enemy.id, player: p }),
      );
  if (offers.length) prepend(s, ...offers);
}

// ---------------------------------------------------------------- events

export function mountainFirePlayerPlayProblem(
  s: GameState,
  u: Unit,
): string | null {
  switch (u.code) {
    case P.captains:
      if (s.phase !== "quest" && s.phase !== "staging")
        return "Captains of the West is a Quest Action.";
      return nobleHeroes(s).length
        ? null
        : "Captains of the West needs a Noble hero in play.";
    case P.raise:
      return "Raise the Shire is played in response to engaging an enemy.";
  }
  return null;
}
const nobleHeroes = (s: GameState) =>
  globalCharacters(s).filter(
    (h) => isHero(h) && hasTrait(h, "Noble") && !playerCardImmune(h),
  );
export function mountainFirePlayerEvent(s: GameState, code: string): boolean {
  if (code !== P.captains) return false;
  const heroes = nobleHeroes(s);
  for (const h of heroes) {
    h.tempWill = (h.tempWill ?? 0) + 1;
    const used = seatView(s, ownerOf(s, h)).used;
    if (!used.includes(captainsKey(h.id))) used.push(captainsKey(h.id));
  }
  log(
    s,
    heroes.length
      ? `Captains of the West: ${heroes.map((h) => name(h)).join(", ")} get${heroes.length === 1 ? "s" : ""} +1 willpower and do${heroes.length === 1 ? "es" : ""} not exhaust to commit to the quest until the end of the phase.`
      : "Captains of the West: there is no Noble hero in play.",
    "good",
  );
  return true;
}

// ---------------------------------------------------------------- Gúthwinë

/** Gúthwinë: after the attached hero is declared as an attacker. */
export function mountainFirePlayerAttackersDeclared(
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return attackers.flatMap((u) =>
    u.attachments
      .filter((a) => a.code === P.guthwine && enabled(a) && !a.exhausted)
      .map((a) =>
        fx("mfpGuthwineOffer", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}
/** The keys sit in the controller's list, whoever declared the attack. */
const guthwineKeys = (s: GameState, id: string) =>
  [...lists(s)].flatMap((list) =>
    list.filter((k) => k.startsWith(`${GUTHWINE}${id}:`)),
  );
/** Gúthwinë: if this attack destroys an enemy, a Rohan ally returns to hand. */
export function mountainFirePlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  const effects = ids.flatMap((id) =>
    guthwineKeys(s, id).map((k) =>
      fx("mfpGuthwineReturn", {
        target: id,
        player: Number(k.split(":").at(-1)) || 0,
      }),
    ),
  );
  if (effects.length) prepend(s, ...effects);
}
/** Gúthwinë's bonus lasts until the attack resolves. */
export function mountainFirePlayerAttackResolved(s: GameState, ids: string[]) {
  for (const id of ids) {
    const keys = guthwineKeys(s, id);
    if (!keys.length) continue;
    for (const list of lists(s))
      list.splice(0, list.length, ...list.filter((k) => !keys.includes(k)));
    const u = get(s, id);
    if (u) u.tempAttack = (u.tempAttack ?? 0) - 2 * keys.length;
  }
}
/** The Rohan allies in a player's discard pile, by position. */
const rohanAlliesDiscarded = (s: GameState) =>
  s.discard
    .map((code, index) => ({ code, index }))
    .filter(
      ({ code }) =>
        card(code).type_code === "ally" &&
        traitsOf(card(code)).includes("Rohan"),
    );

// ---------------------------------------------------------------- round end

/** Raise the Shire: the ally still in play returns to its owner's hand. */
export function mountainFirePlayerRoundEnd(s: GameState): Effect[] {
  const ids = new Set(
    [...lists(s)].flatMap((list) =>
      list
        .filter((k) => k.startsWith(RAISE_RETURN))
        .map((k) => k.slice(RAISE_RETURN.length)),
    ),
  );
  return globalCharacters(s)
    .filter((u) => ids.has(u.id) && isAlly(u))
    .map((u) => fx("mfpRaiseReturn", { target: u.id, player: ownerOf(s, u) }));
}
/** A later entry starts a new instance even when the card keeps its id. */
export const mountainFirePlayerLeavingKeys = (id: string) => [
  `${ELFHELM_DISCARD}${id}`,
  `${RAISE_RETURN}${id}`,
];

// ---------------------------------------------------------------- effects

/** Raise the Shire: the Hobbit allies in the searched cards. */
const raiseAllies = (s: GameState, window: number) =>
  s.deck
    .slice(0, window)
    .map((code, index) => ({ code, index }))
    .filter(({ code }) => hobbitAllyCard(card(code)) && allyCanEnter(s, code));

export function mountainFirePlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("mfp")) return false;
  const p = e.player ?? activeSeat(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "mfpFrodoResource": {
      if (u && canGainResources(s, u)) {
        u.resources += 1;
        log(
          s,
          `Frodo Baggins: 1 resource is added to ${name(u)}'s pool.`,
          "good",
        );
      }
      return true;
    }
    // Rosie Cotton: her willpower on the chosen attribute until the end of the phase.
    case "mfpRosie": {
      if (!u || !isHero(u)) return true;
      const value = e.value ?? 0;
      if (e.text === "will") u.tempWill = (u.tempWill ?? 0) + value;
      else if (e.text === "attack") u.tempAttack = (u.tempAttack ?? 0) + value;
      else u.tempDefense = (u.tempDefense ?? 0) + value;
      const label =
        ATTRIBUTES.find(([key]) => key === e.text)?.[1] ?? "defense";
      log(
        s,
        `Rosie Cotton: ${name(u)} gets +${value} ${label} until the end of the phase.`,
        "good",
      );
      return true;
    }
    // Elfhelm: pay from the Rohan hero, then he enters play from the hand.
    case "mfpElfhelm": {
      const elfhelm = s.hand.find((h) => h.id === e.source);
      requireRule(
        elfhelm?.code === P.elfhelm &&
          u &&
          rohanPayers(s).some((h) => h.id === u.id) &&
          allyCanEnter(s, P.elfhelm),
        "Elfhelm must be in your hand and the Rohan hero able to pay 1 resource.",
      );
      spendResources(s, u!, 1);
      s.hand = s.hand.filter((h) => h.id !== elfhelm!.id);
      s.used.push(`${ELFHELM_DISCARD}${elfhelm!.id}`);
      log(
        s,
        `Elfhelm: ${name(u!)} spends 1 resource to put Elfhelm into play; he will be discarded at the end of the phase.`,
        "good",
      );
      enterAlly(s, elfhelm!, false, false, true);
      return true;
    }
    case "mfpElfhelmDiscard":
      if (u && u.code === P.elfhelm) {
        log(s, "Elfhelm is discarded at the end of the phase.");
        destroy(s, u, false, "discard", false);
      }
      return true;
    // Tom Cotton: the Hobbit ally gets +2 attack until the end of the round.
    case "mfpTomOffer": {
      const tom = get(s, e.source);
      if (!tom || !live(tom) || !u || !isAlly(u)) return true;
      choosePlayerResponse(
        s,
        tom.id,
        P.tom,
        `Tom Cotton · ${name(u)} entered play${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.tom,
            label: `${name(u)} gets +2 attack until the end of the round`,
            effects: [
              fx("mfpTomBoost", { source: tom.id, target: u.id, player: p }),
            ],
          },
          skip,
        ],
        "Response: after a Hobbit ally enters play, it gets +2 attack until the end of the round.",
        p,
      );
      return true;
    }
    case "mfpTomBoost":
      if (u && isAlly(u)) {
        u.roundAttack = (u.roundAttack ?? 0) + 2;
        log(
          s,
          `Tom Cotton: ${name(u)} gets +2 attack until the end of the round.`,
          "good",
        );
      }
      return true;
    // Éomer: spend 1 resource to attack an enemy in the staging area.
    case "mfpEomerOffer": {
      const eomer = get(s, e.source);
      if (!eomer || !eomerUsable(s, eomer)) return true;
      choosePlayerResponse(
        s,
        eomer.id,
        P.eomer,
        `Éomer · Committed to the quest${seatLabel(s, p)}`,
        [
          ...eomerTargets(s, eomer).map((enemy) => ({
            id: enemy.id,
            code: enemy.code,
            label: `Spend 1 resource: Éomer attacks ${name(enemy)}`,
            effects: [
              fx("mfpEomerAttack", {
                source: eomer.id,
                target: enemy.id,
                player: p,
              }),
            ],
          })),
          skip,
        ],
        "Response: after Éomer commits to the quest, spend 1 resource from his resource pool to declare him as an attacker (and resolve his attack) against an enemy in the staging area.",
        p,
      );
      return true;
    }
    case "mfpEomerAttack": {
      const eomer = get(s, e.source);
      requireRule(
        eomer &&
          u &&
          eomerUsable(s, eomer) &&
          eomerTargets(s, eomer).some((x) => x.id === u.id),
        "Éomer attacks an enemy in the staging area with a resource from his pool.",
      );
      spendResources(s, eomer!, 1);
      log(
        s,
        `Éomer spends 1 resource from his pool and attacks ${name(u!)} in the staging area.`,
        "good",
      );
      playerAttack(s, u!, [eomer!.id], false, "eomer");
      return true;
    }
    // Elladan and Elrohir: ready after you optionally engage an Orc.
    case "mfpTwinOffer": {
      const twin = get(s, e.source);
      const enemy = get(s, e.text);
      if (!twin || !live(twin) || !twin.exhausted || cannotReady(twin, s))
        return true;
      choosePlayerResponse(
        s,
        twin.id,
        twin.code,
        `${name(twin)} · You optionally engaged ${enemy ? name(enemy) : "an Orc"}${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: twin.code,
            label: `Ready ${name(twin)}`,
            effects: [fx("mfpTwinReady", { target: twin.id, player: p })],
          },
          skip,
        ],
        `Response: after you optionally engage an Orc enemy, ready ${name(twin)}.`,
        p,
      );
      return true;
    }
    case "mfpTwinReady":
      if (u && u.exhausted && !cannotReady(u, s)) {
        readyCharacter(s, u);
        log(s, `${name(u)} readies.`, "good");
      }
      return true;
    // Orc Disguise: discard it; the Orc cannot attack you this round.
    case "mfpDisguiseOffer": {
      const disguise = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.disguise && enabled(a),
      );
      const enemy = get(s, e.text);
      if (!u || !disguise || !enemy || !isOrc(enemy)) return true;
      choosePlayerResponse(
        s,
        disguise.id,
        P.disguise,
        `Orc Disguise · ${name(enemy)} engaged you${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.disguise,
            label: `Discard Orc Disguise: ${name(enemy)} cannot attack you until the end of the round`,
            effects: [
              fx("mfpDisguise", {
                target: u.id,
                source: disguise.id,
                text: enemy.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after an Orc engages you, discard Orc Disguise. Until the end of the round, that enemy cannot attack you.",
        p,
      );
      return true;
    }
    case "mfpDisguise": {
      const disguise = u?.attachments.find((a) => a.id === e.source);
      const enemy = get(s, e.text);
      if (!u || !disguise || !enemy) return true;
      discardAttachment(s, u, disguise);
      const used = seatView(s, p).used;
      if (!used.includes(disguiseKey(enemy.id)))
        used.push(disguiseKey(enemy.id));
      log(
        s,
        s.table
          ? `Orc Disguise is discarded: ${name(enemy)} cannot attack ${seatName(s, p)} until the end of the round.`
          : `Orc Disguise is discarded: ${name(enemy)} cannot attack you until the end of the round.`,
        "good",
      );
      return true;
    }
    // Gúthwinë: exhaust it for +2 attack for this attack.
    case "mfpGuthwineOffer": {
      const guthwine = u?.attachments.find(
        (a) => a.id === e.source && a.code === P.guthwine,
      );
      if (!u || !guthwine || guthwine.exhausted || !enabled(guthwine))
        return true;
      choosePlayerResponse(
        s,
        guthwine.id,
        P.guthwine,
        `Gúthwinë · ${name(u)} is declared as an attacker${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.guthwine,
            label: `Exhaust Gúthwinë: ${name(u)} gets +2 attack for this attack`,
            effects: [
              fx("mfpGuthwineUse", {
                target: u.id,
                source: guthwine.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after attached hero is declared as an attacker, exhaust Gúthwinë to give that hero +2 attack for this attack. If this attack destroys an enemy, return a Rohan ally from your discard pile to your hand.",
        p,
      );
      return true;
    }
    case "mfpGuthwineUse": {
      const guthwine = u?.attachments.find((a) => a.id === e.source);
      if (!u || !guthwine || guthwine.exhausted) return true;
      guthwine.exhausted = true;
      u.tempAttack = (u.tempAttack ?? 0) + 2;
      s.used.push(`${GUTHWINE}${u.id}:${p}`);
      log(s, `Gúthwinë: ${name(u)} gets +2 attack for this attack.`, "good");
      return true;
    }
    case "mfpGuthwineReturn": {
      forOwner(s, p, () => {
        const allies = rohanAlliesDiscarded(s);
        if (!allies.length) {
          log(s, "Gúthwinë: there is no Rohan ally in the discard pile.");
          return;
        }
        const codes = [...new Set(allies.map((a) => a.code))];
        if (codes.length === 1) {
          s.hand.push(takePlayerDiscard(s, allies[0].index));
          log(
            s,
            `Gúthwinë: ${card(allies[0].code).name} returns from the discard pile to ${s.table ? `${seatName(s, p)}'s` : "your"} hand.`,
            "good",
          );
          return;
        }
        choose(
          s,
          `Gúthwinë · Return a Rohan ally to your hand${seatLabel(s, p)}`,
          codes.map((code) => ({
            id: code,
            code,
            label: `Return ${card(code).name} to your hand`,
            effects: [fx("mfpGuthwineTake", { code, player: p })],
          })),
          "The attack destroyed an enemy: return a Rohan ally from your discard pile to your hand.",
        );
      });
      return true;
    }
    case "mfpGuthwineTake": {
      const entry = rohanAlliesDiscarded(s).find((a) => a.code === e.code);
      if (!entry) return true;
      s.hand.push(takePlayerDiscard(s, entry.index));
      log(
        s,
        `Gúthwinë: ${card(entry.code).name} returns from the discard pile to ${s.table ? `${seatName(s, p)}'s` : "your"} hand.`,
        "good",
      );
      return true;
    }
    // Raise the Shire: played in response to engaging an enemy.
    case "mfpRaiseOffer": {
      const event = s.hand.find((c) => c.id === e.source);
      const enemy = get(s, e.text);
      if (!event || !canPay(s, card(P.raise))) return true;
      const whole = enemy ? higher(s, enemy, p) : !!e.flag;
      choosePlayerResponse(
        s,
        event.id,
        P.raise,
        `Raise the Shire · You engaged ${enemy ? name(enemy) : "an enemy"}${seatLabel(s, p)}`,
        [
          {
            id: "play",
            code: P.raise,
            label: `Play Raise the Shire: search ${whole ? "your entire deck" : "the top 5 cards of your deck"} for a Hobbit ally`,
            effects: [
              fx("eventPlay", {
                source: event.id,
                code: P.raise,
                player: p,
                effects: [
                  fx("mfpRaise", { text: e.text, flag: whole, player: p }),
                ],
              }),
            ],
          },
          skip,
        ],
        "Response: after you engage an enemy, search the top 5 cards of your deck for a Hobbit ally and put it into play (search your entire deck instead if that enemy's engagement cost is higher than your threat). Shuffle your deck. At the end of the round, if that ally is still in play, return it to your hand.",
        p,
      );
      return true;
    }
    case "mfpRaise": {
      if (fateCannotSearch(s, p)) {
        log(s, "Raise the Shire: the deck cannot be searched.");
        return true;
      }
      const enemy = get(s, e.text);
      const whole = enemy ? higher(s, enemy, p) : !!e.flag;
      const window = whole ? s.deck.length : Math.min(5, s.deck.length);
      const allies = raiseAllies(s, window);
      if (!allies.length) {
        shuffle(s, s.deck);
        log(
          s,
          `Raise the Shire: no Hobbit ally among ${whole ? "the cards of the deck" : "the top 5 cards"}; the deck is shuffled.`,
        );
        return true;
      }
      choose(
        s,
        `Raise the Shire · Put a Hobbit ally into play${seatLabel(s, p)}`,
        [
          ...allies.map(({ code, index }) => ({
            id: `ally-${index}`,
            code,
            label: `Put ${card(code).name} into play`,
            effects: [
              fx("mfpRaiseEnter", {
                value: index,
                code,
                count: window,
                player: p,
              }),
            ],
          })),
          {
            id: "none",
            label: "Choose no ally · Shuffle your deck",
            effects: [fx("mfpRaiseShuffle", { player: p })],
          },
        ],
        `Search ${whole ? "your entire deck" : "the top 5 cards of your deck"} for a Hobbit ally and put it into play. Shuffle your deck. At the end of the round, if that ally is still in play, return it to your hand.`,
      );
      return true;
    }
    case "mfpRaiseEnter": {
      requireRule(
        raiseAllies(s, e.count ?? 5).some(
          ({ code, index }) => index === e.value && code === e.code,
        ),
        "Choose a Hobbit ally among the searched cards.",
      );
      const ally = takePlayerDeck(s, e.value);
      s.used.push(`${RAISE_RETURN}${ally.id}`);
      shuffle(s, s.deck);
      log(
        s,
        `Raise the Shire: ${name(ally)} enters play; the deck is shuffled.`,
        "good",
      );
      enterAlly(s, ally, false, false, false);
      return true;
    }
    case "mfpRaiseShuffle":
      shuffle(s, s.deck);
      log(s, "Raise the Shire: the deck is shuffled.");
      return true;
    case "mfpRaiseReturn":
      if (u && isAlly(u) && globalCharacters(s).some((x) => x.id === u.id)) {
        log(s, `Raise the Shire: ${name(u)} returns to its owner's hand.`);
        returnAlly(s, u);
      }
      return true;
  }
  return false;
}
