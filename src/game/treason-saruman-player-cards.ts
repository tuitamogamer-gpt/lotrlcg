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
  cannotReady,
  choose,
  fx,
  get,
  log,
  requireRule,
  shuffle,
  spendResources,
  stats,
  takePlayerDeck,
} from "./core";
import {
  damage,
  destroy,
  exhaustCharacter,
  progressLocation,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  globalCharacters,
  ownerOf,
  seatName,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { hasTrait } from "./expansion-passives";
import { playerEffectImmune } from "./player-effect-immunity";
import { choosePlayerResponse } from "./player-ability-triggers";
import { isEnemy } from "./ships";
import { TOS_ARAGORN } from "./lotr-saga-codes";

/**
 * The Lord of the Rings: The Treason of Saruman player cards. The scenario
 * places the Fellowship-sphere Aragorn with the first player; his Action
 * spends 2 resources from his own pool to ready a hero. Ten more player cards
 * of the box follow; Gimli and Legolas were scripted with the collector cards
 * and Ent Draught with the passive cards, and the six boons wait for
 * campaign mode.
 */
export const TREASON_PLAYER = {
  aragorn: TOS_ARAGORN,
  theoden: "143002",
  treebeard: "143003",
  quickbeam: "143006",
  hama: "143007",
  arod: "143008",
  herugrim: "143010",
  entmoot: "143011",
  helm: "143012",
  hunters: "143013",
  shadowfax: "143014",
} as const;
const P = TREASON_PLAYER;
/** Théoden: the first Rohan ally his controller plays from hand this round. */
const THEODEN_KEY = "tsp:theoden-rohan-ally";
/** Treebeard: each use this phase (Limit 5 times per phase). */
const TREEBEARD_KEY = (id: string) => `phase:tsp-treebeard:${id}`;
/** Háma: once per round, and his discard at the end of the phase. */
const HAMA_KEY = (id: string) => `tsp-hama:${id}`;
const HAMA_DISCARD = "phase:tsp-hama-discard:";
/** Herugrim: the willpower added to the attached hero's attack for this attack. */
const HERUGRIM_KEY = "tsp-herugrim:";
const TREEBEARD_LIMIT = 5;
const live = (u: Unit) => !u.blanked;
const enabled = (a: Attachment) => !a.blanked && !a.facedown;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const traits = (c: Card) => (c.traits ?? "").split(".").map((t) => t.trim());
const controlsEnt = (s: GameState) =>
  [...s.heroes, ...s.allies].some((u) => hasTrait(u, "Ent"));
const readyTargets = (s: GameState) =>
  globalCharacters(s).filter(
    (h) => isHero(h) && h.exhausted && !cannotReady(h, s),
  );

// ---------------------------------------------------------------- costs

/**
 * Théoden reduces the first Rohan ally his controller plays from hand each
 * round by 1; Herugrim costs 1 less to play on Théoden.
 */
export function treasonPlayerCostReduction(
  s: GameState,
  c: Card,
  target?: Unit,
) {
  let discount = 0;
  if (
    c.type_code === "ally" &&
    traits(c).includes("Rohan") &&
    c.playOrigin !== "discard" &&
    c.playOrigin !== "deck" &&
    !s.used.includes(THEODEN_KEY) &&
    s.heroes.some((h) => h.code === P.theoden && live(h))
  )
    discount++;
  if (c.code === P.herugrim && target && card(target.code).name === "Théoden")
    discount++;
  return discount;
}
/** After a card is played: Théoden's reduction applies to the first Rohan ally only. */
export function treasonPlayerCardPlayed(
  s: GameState,
  c: Card,
  _u: Unit,
  fromHand: boolean,
) {
  if (
    fromHand &&
    c.type_code === "ally" &&
    traits(c).includes("Rohan") &&
    s.heroes.some((h) => h.code === P.theoden) &&
    !s.used.includes(THEODEN_KEY)
  )
    s.used.push(THEODEN_KEY);
}

// ---------------------------------------------------------------- play rules

const heroesCommitted = (s: GameState) =>
  globalCharacters(s).filter((u) => isHero(u) && u.committed);
/** Helm! Helm!: the non-unique enemies engaged with you it can discard. */
const helmEnemies = (s: GameState) =>
  s.engaged.filter(
    (u) =>
      isEnemy(u) &&
      !card(u.code).is_unique &&
      !playerEffectImmune(s, u, P.helm),
  );
/** Helm! Helm!: the Rohan allies you control that can pay its cost. */
const helmAllies = (s: GameState) =>
  s.allies.filter((u) => hasTrait(u, "Rohan") && !u.exhausted);
/** Arod attaches to a hero or a character named Legolas. */
const arodTargets = (s: GameState) =>
  globalCharacters(s).filter(
    (u) => isHero(u) || card(u.code).name === "Legolas",
  );
export function treasonPlayerTargets(s: GameState, code: string) {
  if (code === P.arod) return arodTargets(s);
  if (code === P.helm) return helmEnemies(s).length ? helmAllies(s) : [];
  return undefined;
}
export function treasonPlayerPlayProblem(s: GameState, u: Unit): string | null {
  switch (u.code) {
    case P.entmoot:
      if (!controlsEnt(s)) return "Entmoot needs an Ent character you control.";
      return s.deck.length ? null : "Entmoot needs cards in your deck.";
    case P.helm:
      if (s.phase !== "attack")
        return "Helm! Helm! is played after the resolving enemy attacks step.";
      if (!helmEnemies(s).length)
        return "Helm! Helm! needs a non-unique enemy engaged with you.";
      return helmAllies(s).length
        ? null
        : "Helm! Helm! needs a ready Rohan ally you control to exhaust and discard.";
    case P.hunters:
      if (!s.heroes.some((h) => h.code === TOS_ARAGORN))
        return "The Three Hunters needs the Fellowship Aragorn under your control.";
      if (s.phase !== "quest" && s.phase !== "staging")
        return "The Three Hunters is a Quest Action.";
      return heroesCommitted(s).length
        ? null
        : "The Three Hunters needs a hero committed to the quest.";
  }
  return null;
}
/** Helm! Helm!'s cost: exhaust and discard the chosen Rohan ally. */
export function treasonPlayerEventCost(s: GameState, u: Unit, target?: string) {
  if (u.code !== P.helm) return;
  const ally = s.allies.find((x) => x.id === target);
  requireRule(
    ally && helmAllies(s).some((x) => x.id === ally.id),
    "Helm! Helm! needs a ready Rohan ally you control.",
  );
  exhaustCharacter(s, ally);
  log(
    s,
    `Helm! Helm!: ${name(ally)} is exhausted and discarded to pay the cost.`,
  );
  destroy(s, ally, false, "discard", false);
}
export function treasonPlayerEvent(s: GameState, code: string): boolean {
  const player = activeSeat(s);
  switch (code) {
    case P.entmoot:
      s.queue.unshift(
        fx("tspEntmoot", { value: Math.min(5, s.deck.length), player }),
      );
      return true;
    case P.helm: {
      const enemies = helmEnemies(s);
      if (!enemies.length) {
        log(s, "Helm! Helm!: no non-unique enemy is engaged with you.");
        return true;
      }
      choose(
        s,
        `Helm! Helm! · Discard a non-unique enemy engaged with you${seatLabel(s, player)}`,
        enemies.map((x) => ({
          id: x.id,
          code: x.code,
          label: name(x),
          effects: [fx("tspHelmDiscard", { target: x.id, player })],
        })),
        "Combat Action: choose and discard a non-unique enemy engaged with you.",
      );
      return true;
    }
    case P.hunters:
      s.queue.unshift(fx("tspHunters", { ids: [], player }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------- abilities

export const treasonPlayerAbilityLabel = (code: string) =>
  code === P.aragorn
    ? "Aragorn · Spend 2 resources from Aragorn's resource pool: ready a hero"
    : code === P.treebeard
      ? "Treebeard · Deal 1 damage to Treebeard: +1 willpower and +1 attack until the end of the phase"
      : code === P.hama
        ? "Háma · Ready Háma: +3 defense until the end of the phase, then discard him"
        : code === P.shadowfax
          ? "Shadowfax · Exhaust: ready Gandalf"
          : undefined;
function shadowfaxOn(u: Unit, attachmentId?: string) {
  const a = u.attachments.find((x) => x.id === attachmentId);
  return a?.code === P.shadowfax ? a : undefined;
}
export function treasonPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = shadowfaxOn(u, attachmentId);
    if (!a) return undefined;
    if (!enabled(a)) return "Shadowfax's text is inactive.";
    if (attachmentController(s, u, a) !== activeSeat(s))
      return "You do not control Shadowfax.";
    if (a.exhausted) return "Shadowfax must be ready.";
    if (!u.exhausted || cannotReady(u, s))
      return `${name(u)} is not an exhausted character that can be readied.`;
    return undefined;
  }
  if (![P.aragorn, P.treebeard, P.hama].includes(u.code as never))
    return undefined;
  const title = card(u.code).name;
  if (!live(u)) return `${title}'s printed text is blank.`;
  if (ownerOf(s, u) !== activeSeat(s)) return `You do not control ${title}.`;
  if (u.code === P.aragorn) {
    if (u.resources < 2)
      return "Aragorn needs 2 resources in his resource pool.";
    if (!readyTargets(s).length) return "No exhausted hero can be readied.";
    return undefined;
  }
  if (u.code === P.treebeard) {
    if (
      s.used.filter((k) => k === TREEBEARD_KEY(u.id)).length >= TREEBEARD_LIMIT
    )
      return "Treebeard's Action is limited to 5 times per phase.";
    return undefined;
  }
  // Háma: a Combat Action, once per round.
  if (s.phase !== "defense" && s.phase !== "attack")
    return "Háma's Combat Action is used in the combat phase.";
  if (s.used.includes(HAMA_KEY(u.id)))
    return "Háma's Combat Action is limited to once per round.";
  return undefined;
}
export function useTreasonPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const player = activeSeat(s);
  if (attachmentId) {
    const a = shadowfaxOn(u, attachmentId);
    if (!a) return false;
    const problem = treasonPlayerAbilityProblem(s, u, attachmentId);
    requireRule(!problem, problem ?? "");
    a.exhausted = true;
    readyCharacter(s, u);
    log(s, `Shadowfax is exhausted to ready ${name(u)}.`, "good");
    return true;
  }
  if (![P.aragorn, P.treebeard, P.hama].includes(u.code as never)) return false;
  const problem = treasonPlayerAbilityProblem(s, u);
  requireRule(!problem, problem ?? "");
  if (u.code === P.treebeard) {
    s.used.push(TREEBEARD_KEY(u.id));
    damage(s, u.id, 1, { cost: true });
    u.tempWill = (u.tempWill ?? 0) + 1;
    u.tempAttack = (u.tempAttack ?? 0) + 1;
    log(
      s,
      `Treebeard takes 1 damage and gets +1 willpower and +1 attack until the end of the phase.`,
      "good",
    );
    return true;
  }
  if (u.code === P.hama) {
    s.used.push(HAMA_KEY(u.id), `${HAMA_DISCARD}${u.id}`);
    readyCharacter(s, u);
    u.tempDefense = (u.tempDefense ?? 0) + 3;
    log(
      s,
      "Háma readies and gets +3 defense until the end of the phase; he will be discarded at the end of the phase.",
      "good",
    );
    return true;
  }
  spendResources(s, u, 2);
  choose(
    s,
    "Aragorn · Ready a hero",
    readyTargets(s).map((h) => ({
      id: h.id,
      code: h.code,
      label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
      effects: [fx("tspAragornReady", { source: u.id, target: h.id, player })],
    })),
    "Aragorn spends 2 resources from his resource pool to ready a hero.",
  );
  return true;
}

// ---------------------------------------------------------------- responses

/** Arod: after the attached character participates in an attack that destroys an enemy. */
export function treasonPlayerAttackKilled(
  s: GameState,
  _enemy: Unit,
  ids: string[],
) {
  const effects: Effect[] = [];
  for (const u of ids.map((id) => get(s, id)).filter((x): x is Unit => !!x)) {
    for (const a of u.attachments.filter(
      (x) => x.code === P.arod && enabled(x) && !x.exhausted,
    ))
      effects.push(
        fx("tspArodOffer", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      );
  }
  s.queue.unshift(...effects);
}
/** Quickbeam enters play exhausted, then may take 1 damage to ready. */
export function treasonPlayerAllyEntered(s: GameState, u: Unit) {
  if (u.code !== P.quickbeam || !live(u)) return;
  u.exhausted = true;
  log(s, "Quickbeam enters play exhausted.");
  s.queue.unshift(
    fx("tspQuickbeamOffer", { source: u.id, player: ownerOf(s, u) }),
  );
}
/** Herugrim: after the attached hero is declared as an attacker. */
export function treasonPlayerAttackersDeclared(
  s: GameState,
  _enemy: Unit,
  attackers: Unit[],
): Effect[] {
  return attackers.flatMap((u) =>
    u.attachments
      .filter((a) => a.code === P.herugrim && enabled(a) && !a.exhausted)
      .map((a) =>
        fx("tspHerugrimOffer", {
          target: u.id,
          source: a.id,
          player: attachmentController(s, u, a) ?? ownerOf(s, u),
        }),
      ),
  );
}
/** Herugrim's bonus lasts until the attack resolves. */
export function treasonPlayerAttackResolved(s: GameState, ids: string[]) {
  for (const id of ids) {
    const keys = s.used.filter((k) => k.startsWith(`${HERUGRIM_KEY}${id}:`));
    if (!keys.length) continue;
    s.used = s.used.filter((k) => !keys.includes(k));
    const u = get(s, id);
    for (const key of keys) {
      const value = Number(key.split(":").at(-1)) || 0;
      if (u) u.tempAttack = (u.tempAttack ?? 0) - value;
    }
  }
}
/** Háma is discarded at the end of the phase he used his Combat Action. */
export function treasonPlayerPhaseEnd(s: GameState): Effect[] {
  const ids = s.used
    .filter((k) => k.startsWith(HAMA_DISCARD))
    .map((k) => k.slice(HAMA_DISCARD.length));
  return globalCharacters(s)
    .filter((u) => ids.includes(u.id))
    .map((u) => fx("tspHamaDiscard", { target: u.id, player: ownerOf(s, u) }));
}

// ---------------------------------------------------------------- effects

const skip: Option = {
  id: "skip",
  label: "Do not use this response",
  effects: [],
};
const anyLocations = (s: GameState) =>
  [...allActiveLocations(s), ...s.staging].filter(
    (u) =>
      card(u.code).type_code === "location" &&
      !playerEffectImmune(s, u, P.arod),
  );

export function treasonPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("tsp")) return false;
  const p = e.player ?? activeSeat(s);
  const u = e.target
    ? (get(s, e.target) ?? globalCharacters(s).find((x) => x.id === e.target))
    : undefined;
  const source = e.source
    ? (get(s, e.source) ?? globalCharacters(s).find((x) => x.id === e.source))
    : undefined;
  switch (e.kind) {
    case "tspAragornReady": {
      if (u && u.exhausted && !cannotReady(u, s)) {
        readyCharacter(s, u);
        log(s, `Aragorn readies ${name(u)}.`, "good");
      } else if (u) log(s, `${card(u.code).name} cannot be readied.`);
      return true;
    }
    case "tspArodOffer": {
      const arod = u?.attachments.find((a) => a.id === e.source);
      if (!u || !arod || arod.exhausted || !enabled(arod)) return true;
      const locations = anyLocations(s);
      if (!locations.length) return true;
      choosePlayerResponse(
        s,
        arod.id,
        P.arod,
        `Arod · Exhaust Arod to place 1 progress on a location?${seatLabel(s, p)}`,
        [
          ...locations.map((l) => ({
            id: l.id,
            code: l.code,
            label: `Place 1 progress on ${name(l)}`,
            effects: [
              fx("tspArodPlace", {
                target: u.id,
                source: arod.id,
                ids: [l.id],
                player: p,
              }),
            ],
          })),
          skip,
        ],
        "Response: after the attached character participates in an attack that destroys an enemy, exhaust Arod to place 1 progress token on any location.",
      );
      return true;
    }
    case "tspArodPlace": {
      const arod = u?.attachments.find((a) => a.id === e.source);
      const location = anyLocations(s).find((l) => l.id === e.ids?.[0]);
      if (!arod || arod.exhausted || !location) return true;
      arod.exhausted = true;
      log(
        s,
        `Arod is exhausted: 1 progress is placed on ${name(location)}.`,
        "good",
      );
      progressLocation(s, location, 1);
      return true;
    }
    case "tspQuickbeamOffer":
      if (!source || !source.exhausted || cannotReady(source, s)) return true;
      choosePlayerResponse(
        s,
        source.id,
        P.quickbeam,
        `Quickbeam · Deal 1 damage to him to ready him?${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.quickbeam,
            label: "Deal 1 damage to Quickbeam and ready him",
            effects: [
              fx("tspQuickbeamReady", { source: source.id, player: p }),
            ],
          },
          skip,
        ],
        "Response: after Quickbeam enters play, deal 1 damage to him to ready him.",
      );
      return true;
    case "tspQuickbeamReady":
      if (!source) return true;
      damage(s, source.id, 1, { cost: true });
      if (get(s, source.id)) {
        readyCharacter(s, source);
        log(s, "Quickbeam takes 1 damage and readies.", "good");
      }
      return true;
    case "tspHerugrimOffer": {
      const herugrim = u?.attachments.find((a) => a.id === e.source);
      if (!u || !herugrim || herugrim.exhausted || !enabled(herugrim))
        return true;
      const will = stats(s, u).will;
      choosePlayerResponse(
        s,
        herugrim.id,
        P.herugrim,
        `Herugrim · Add ${name(u)}'s willpower to its attack?${seatLabel(s, p)}`,
        [
          {
            id: "use",
            code: P.herugrim,
            label: `Exhaust Herugrim: ${name(u)} gets +${will} attack for this attack`,
            effects: [
              fx("tspHerugrimUse", {
                target: u.id,
                source: herugrim.id,
                player: p,
              }),
            ],
          },
          skip,
        ],
        "Response: after the attached hero is declared as an attacker, exhaust Herugrim to add its willpower to its attack for this attack.",
      );
      return true;
    }
    case "tspHerugrimUse": {
      const herugrim = u?.attachments.find((a) => a.id === e.source);
      if (!u || !herugrim || herugrim.exhausted) return true;
      herugrim.exhausted = true;
      const will = Math.max(0, stats(s, u).will);
      u.tempAttack = (u.tempAttack ?? 0) + will;
      s.used.push(`${HERUGRIM_KEY}${u.id}:${will}`);
      log(
        s,
        `Herugrim: ${name(u)} gets +${will} attack for this attack.`,
        "good",
      );
      return true;
    }
    case "tspHamaDiscard":
      if (u && u.code === P.hama) {
        log(s, "Háma is discarded at the end of the phase.");
        destroy(s, u, false, "discard", false);
      }
      return true;
    case "tspHelmDiscard": {
      const enemy = s.engaged.find((x) => x.id === e.target);
      if (!enemy || !helmEnemies(s).some((x) => x.id === enemy.id)) return true;
      log(s, `Helm! Helm!: ${name(enemy)} is discarded.`, "good");
      destroy(s, enemy, false, "discard", true);
      return true;
    }
    case "tspEntmoot": {
      const window = Math.min(e.value ?? 0, s.deck.length);
      const ents = s.deck
        .slice(0, window)
        .map((code, index) => ({ code, index }))
        .filter(({ code }) => traits(card(code)).includes("Ent"));
      if (!ents.length) {
        shuffle(s, s.deck);
        log(s, "Entmoot: the other cards are shuffled back into the deck.");
        return true;
      }
      choose(
        s,
        `Entmoot · Add an Ent card to your hand${seatLabel(s, p)}`,
        [
          ...ents.map(({ code, index }) => ({
            id: `take-${index}`,
            code,
            label: `Add ${card(code).name} to your hand`,
            effects: [
              fx("tspEntmootTake", { value: index, count: window, player: p }),
            ],
          })),
          {
            id: "done",
            label: "Shuffle the other cards back into your deck",
            effects: [fx("tspEntmoot", { value: 0, player: p })],
          },
        ],
        "Search the top 5 cards of your deck for any number of Ent cards and add them to your hand. Shuffle the other cards back into your deck.",
      );
      return true;
    }
    case "tspEntmootTake": {
      const index = e.value ?? -1;
      const code = s.deck[index];
      if (code === undefined || !traits(card(code)).includes("Ent"))
        return true;
      s.hand.push(takePlayerDeck(s, index));
      log(s, `Entmoot: ${card(code).name} is added to the hand.`, "good");
      s.queue.unshift(
        fx("tspEntmoot", { value: (e.count ?? 1) - 1, player: p }),
      );
      return true;
    }
    case "tspHunters": {
      const chosen = e.ids ?? [];
      const candidates = heroesCommitted(s).filter(
        (h) => !chosen.includes(h.id) && !playerEffectImmune(s, h, P.hunters),
      );
      if (chosen.length >= 3 || !candidates.length) return true;
      if (candidates.length <= 3 - chosen.length) {
        s.queue.unshift(
          ...candidates.map((h) =>
            fx("tspHuntersHero", { target: h.id, player: p }),
          ),
        );
        return true;
      }
      choose(
        s,
        `The Three Hunters · Choose a hero committed to the quest · ${3 - chosen.length} remaining${seatLabel(s, p)}`,
        candidates.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [
            fx("tspHuntersHero", { target: h.id, player: p }),
            fx("tspHunters", { ids: [...chosen, h.id], player: p }),
          ],
        })),
        "Quest Action: choose 3 heroes committed to the quest. Ready them; until the end of the round each gets +1 willpower, +1 attack and +1 defense.",
      );
      return true;
    }
    case "tspHuntersHero":
      if (!u || !isCharacter(u)) return true;
      readyCharacter(s, u);
      u.roundWill = (u.roundWill ?? 0) + 1;
      u.roundAttack = (u.roundAttack ?? 0) + 1;
      u.roundDefense = (u.roundDefense ?? 0) + 1;
      log(
        s,
        `The Three Hunters: ${name(u)} readies and gets +1 willpower, +1 attack and +1 defense until the end of the round.`,
        "good",
      );
      return true;
  }
  return true;
}
