// Shared helpers: state access, randomness, logging, effect queue helpers, statistics and payments.
import { card, name } from "./cards";
import type { Card, Effect, GameState, Option, Unit } from "./types";
import { scenario, OBJECTIVES } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allHeroes,
  allEngaged,
  forOwner,
  ownerOf,
  seatName,
  seatView,
  selectSeat,
  scopedEffect,
} from "./table";

import { observe } from "./presentation";

export const observation = (s: GameState) =>
  s.flow ? observe(s, stats, stagingThreat, threatOf) : undefined;

export class RuleError extends Error {}

export function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuleError(message);
}

export const fx = (kind: string, data: Omit<Effect, "kind"> = {}): Effect => ({
  kind,
  ...data,
});

export const skip: Option = {
  id: "skip",
  label: "Continue without using this ability",
  effects: [],
};

export const characters = (s: GameState) => [...s.heroes, ...s.allies];

export const units = (s: GameState) => [
  ...allCharacters(s),
  ...s.staging,
  ...allEngaged(s),
  ...(s.activeLocation ? [s.activeLocation] : []),
];

export const get = (s: GameState, id?: string) =>
  units(s).find((u) => u.id === id);

export function random(s: GameState) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function make(s: GameState, code: string): Unit {
  return {
    id: `c${s.nextId++}`,
    ...(s.table ? { owner: activeSeat(s) } : {}),
    code,
    exhausted: false,
    damage: 0,
    progress: 0,
    resources: 0,
    committed: false,
    attachments: [],
    boost: 0,
    attacked: false,
    shadows: [],
  };
}

export function log(
  s: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "normal",
) {
  s.log.push({
    id: s.nextId++,
    round: s.round,
    text,
    kind,
    ...(s.table ? { player: activeSeat(s) } : {}),
  });
  if (s.log.length > 250) s.log.shift();
}

export function prepend(s: GameState, ...effects: Effect[]) {
  s.queue.unshift(...effects.map((e) => scopedEffect(s, e)));
}

export function enqueue(s: GameState, ...effects: Effect[]) {
  s.queue.push(...effects.map((e) => scopedEffect(s, e)));
}

export function choose(
  s: GameState,
  title: string,
  options: Option[],
  description?: string,
) {
  if (options.length)
    s.choice = {
      title,
      options: options.map((o) => ({
        ...o,
        effects: o.effects.map((e) => scopedEffect(s, e)),
      })),
      description,
    };
}

export function opts(
  list: Unit[],
  effect: (u: Unit) => Effect[],
  detail?: (u: Unit) => string,
): Option[] {
  return list.map((u) => ({
    id: u.id,
    label: name(u),
    code: u.code,
    detail: detail?.(u),
    effects: effect(u),
  }));
}

export const has = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code);

export const restricted = (u: Unit) =>
  u.attachments.filter((a) => card(a.code).text?.includes("Restricted"));

export function restrictAttachments(s: GameState, u: Unit) {
  if (restricted(u).length <= 2) return;
  selectSeat(s, ownerOf(s, u));
  choose(
    s,
    `Restricted attachments · ${name(u)}`,
    restricted(u).map((a) => ({
      id: a.id,
      code: a.code,
      label: `Discard ${card(a.code).name}`,
      effects: [fx("discardAttachment", { target: u.id, source: a.id })],
    })),
    "Choose one attachment to discard. A character may keep two Restricted attachments.",
  );
}

export function followFirstPlayer(s: GameState) {
  if (!s.table) return;
  const mendor = allCharacters(s).find((u) => u.code === "rc135");
  if (!mendor || ownerOf(s, mendor) === s.table.first) return;
  const from = ownerOf(s, mendor),
    to = s.table.first;
  forOwner(s, from, () => {
    s.allies = s.allies.filter((u) => u.id !== mendor.id);
  });
  forOwner(s, to, () => {
    s.allies.push(mendor);
  });
  log(s, `Mendor follows the first player: ${seatName(s, to)}.`);
}

export function hasGondor(u: Unit) {
  return (card(u.code).traits ?? "").includes("Gondor") || has(u, "01026");
}

export function stats(s: GameState, u: Unit) {
  const c = card(u.code);
  return {
    will: Math.max(
      0,
      (c.willpower ?? 0) +
        (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
        u.attachments.filter((a) => a.code === "01027").length * 2 +
        u.attachments.filter((a) => a.code === "01055").length -
        u.attachments.filter((a) => a.code === "01071").length +
        (u.tempWill ?? 0) +
        (u.code === "01007" ? u.boost : 0) -
        (u.committed ? s.questDebuff : 0),
    ),
    attack:
      (c.attack ?? 0) +
      (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
      (u.tempAttack ?? 0) +
      (u.code === "01004" ? u.damage : 0) +
      u.attachments.filter((a) => a.code === "01041").length *
        (c.traits?.includes("Dwarf") ? 2 : 1) +
      (c.type_code === "enemy"
        ? u.boost + (u.code === "01090" ? u.resources * 2 : 0)
        : 0),
    defense:
      (c.defense ?? 0) +
      (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
      (u.tempDefense ?? 0),
    health:
      (c.health ?? 0) +
      u.attachments.filter((a) => a.code === "01040").length * 4,
  };
}

/** Current printed/modifier threat. Suppression only applies in staging. */
export const threatOf = (s: GameState, u: Unit) =>
  u.suppressed && s.staging.some((x) => x.id === u.id)
    ? 0
    : Math.max(
        0,
        (card(u.code).threat ?? 0) +
          (card(u.code).type_code === "location" &&
          s.staging.some((x) => x.id === u.id)
            ? (s.fog ?? 0)
            : 0) +
          (u.tempThreat ?? 0) -
          u.attachments.filter((a) => a.code === "01056").length,
      );

export const stagingThreat = (s: GameState) =>
  s.threatModifier +
  s.staging
    .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
    .reduce((n, u) => n + threatOf(s, u), 0);

export const questWill = (s: GameState) =>
  allCharacters(s)
    .filter(
      (u) =>
        u.committed || seatView(s, ownerOf(s, u)).committedIds.includes(u.id),
    )
    .reduce((n, u) => n + stats(s, u).will, 0);

export const stageInfo = (s: GameState) => {
  if (s.scenarioId !== "mirkwood" || s.stage < 3)
    return scenario(s.scenarioId).stages[s.stage - 1];
  return s.branch === "beorn"
    ? {
        name: "Beorn’s Path",
        quest: 10,
        story:
          "Leave the forest behind. Ungoliant’s Spawn must not remain in play.",
      }
    : {
        name: "Don’t Leave the Path!",
        quest: 0,
        story: "Find and defeat Ungoliant’s Spawn to escape Mirkwood.",
      };
};

export const canFight = (u: Unit) => !has(u, "01108");

export const objectiveFree = (s: GameState, u: Unit) =>
  OBJECTIVES.includes(u.code) && !units(s).some((x) => x.guarding === u.id);

export const objectiveCount = (s: GameState) =>
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => OBJECTIVES.includes(a.code)).length;

export const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allEngaged(s)].some((u) => u.code === code);

export const resources = (s: GameState, sphere?: string) =>
  s.heroes
    .filter(
      (h) =>
        !sphere ||
        sphere === "neutral" ||
        card(h.code).sphere_code === sphere ||
        (sphere === "spirit" && h.code === "01001" && has(h, "01027")),
    )
    .reduce((n, h) => n + h.resources, 0);

export function eligiblePayers(s: GameState, c: Card) {
  return s.heroes.filter(
    (h) =>
      c.sphere_code === "neutral" ||
      card(h.code).sphere_code === c.sphere_code ||
      (c.sphere_code === "spirit" && h.code === "01001" && has(h, "01027")),
  );
}

export function pay(s: GameState, c: Card, payment?: Record<string, number>) {
  let cost = Number(c.cost) || 0;
  const payers = eligiblePayers(s, c);
  requireRule(payers.length > 0, "A matching sphere hero is required.");
  requireRule(
    payers.reduce((n, h) => n + h.resources, 0) >= cost,
    "Not enough matching resources.",
  );
  if (payment) {
    requireRule(
      Object.values(payment).every((v) => Number.isInteger(v) && v >= 0) &&
        Object.values(payment).reduce((a, b) => a + b, 0) === cost,
      "Choose exactly the card’s resource cost.",
    );
    for (const [id, v] of Object.entries(payment)) {
      const h = payers.find((h) => h.id === id);
      requireRule(h && h.resources >= v, "Invalid resource payment.");
      h.resources -= v;
    }
  } else {
    for (const h of [...payers].sort((a, b) => b.resources - a.resources)) {
      const n = Math.min(cost, h.resources);
      h.resources -= n;
      cost -= n;
    }
  }
}

export function draw(s: GameState, count: number) {
  if (s.activeLocation?.code === "01095") {
    log(s, "Enchanted Stream prevents card draw.", "danger");
    return;
  }
  if (count > 0 && s.shackles > 0) {
    s.shackles--;
    s.encounterDiscard.push("01105");
    log(s, "Iron Shackles prevents this draw and is discarded.", "danger");
    return;
  }
  let n = 0;
  while (n < count && s.deck.length) {
    s.hand.push(make(s, s.deck.shift()!));
    n++;
  }
  if (n) log(s, `Drew ${n} ${n === 1 ? "card" : "cards"}.`);
}

export function encounterDraw(s: GameState, shadow = false) {
  if (
    !s.encounterDeck.length &&
    !shadow &&
    ["quest", "staging"].includes(s.phase) &&
    s.encounterDiscard.length
  ) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(s, "The encounter discard pile is shuffled back into its deck.");
  }
  return s.encounterDeck.shift();
}
