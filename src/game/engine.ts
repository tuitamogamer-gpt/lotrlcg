import {
  card,
  name,
  plain,
  HEROES,
  DECK,
  SCRIPTED,
  encounterCards,
  STARTERS,
} from "./cards";
import type {
  Action,
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
  ScenarioId,
  PlayMode,
  CampaignState,
  SeatConfig,
} from "./types";
import { SCENARIOS, scenario, OBJECTIVES } from "./scenarios";

import {
  activeSeat,
  allCharacters,
  allHeroes,
  allEngaged,
  eachSeat,
  forOwner,
  livingSeats,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
  selectSeat,
  snapshotSeat,
  syncSeat,
  scopedEffect,
  startPhase,
  passSeat,
  defendersFor,
  attackersFor,
  attachmentController,
} from "./table";

import {
  observe,
  pauseFor,
  recordObservation,
  validFlow,
} from "./presentation";

const observation = (s: GameState) =>
  s.flow ? observe(s, stats, stagingThreat, threatOf) : undefined;

export class RuleError extends Error {}
function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuleError(message);
}
const fx = (kind: string, data: Omit<Effect, "kind"> = {}): Effect => ({
  kind,
  ...data,
});
const skip: Option = {
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
const get = (s: GameState, id?: string) => units(s).find((u) => u.id === id);
function random(s: GameState) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle<T>(s: GameState, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function make(s: GameState, code: string): Unit {
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
function log(
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
function prepend(s: GameState, ...effects: Effect[]) {
  s.queue.unshift(...effects.map((e) => scopedEffect(s, e)));
}
function enqueue(s: GameState, ...effects: Effect[]) {
  s.queue.push(...effects.map((e) => scopedEffect(s, e)));
}
function choose(
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
function opts(
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
const has = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code);
const restricted = (u: Unit) =>
  u.attachments.filter((a) => card(a.code).text?.includes("Restricted"));
function restrictAttachments(s: GameState, u: Unit) {
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
function followFirstPlayer(s: GameState) {
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
function hasGondor(u: Unit) {
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
const objectiveCount = (s: GameState) =>
  allHeroes(s)
    .flatMap((h) => h.attachments)
    .filter((a) => OBJECTIVES.includes(a.code)).length;
const inPlay = (s: GameState, code: string) =>
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
function eligiblePayers(s: GameState, c: Card) {
  return s.heroes.filter(
    (h) =>
      c.sphere_code === "neutral" ||
      card(h.code).sphere_code === c.sphere_code ||
      (c.sphere_code === "spirit" && h.code === "01001" && has(h, "01027")),
  );
}
function pay(s: GameState, c: Card, payment?: Record<string, number>) {
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
function draw(s: GameState, count: number) {
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
function encounterDraw(s: GameState, shadow = false) {
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
function advanceDefense(s: GameState) {
  if (s.phase !== "defense" || s.combat) return;
  const next = playerOrder(s).find((i) =>
    seatView(s, i).engaged.some(
      (u) => !u.attacked && !u.feinted && !has(u, "01069"),
    ),
  );
  if (next !== undefined) {
    if (s.table) {
      s.table.turn = next;
      if (!s.choice) selectSeat(s, next);
    }
  } else {
    startPhase(s, "attack");
    allEngaged(s).forEach((u) => {
      u.attacked = false;
      u.attackedBy = [];
    });
  }
}
function check(s: GameState) {
  if (s.status !== "playing") return;
  if (s.prisoner) {
    const p = seatView(s, s.prisoner.owner ?? 0);
    if (
      p.threat >= 50 ||
      (!p.heroes.length && p.startingHeroes.some((h) => h !== s.prisoner!.code))
    ) {
      s.status = "lost";
      s.reason =
        "The prisoner's fellowship has been eliminated. The prisoner cannot be rescued.";
      s.choice = null;
      s.queue = [];
      log(s, s.reason, "danger");
      return;
    }
  }
  eachSeat(s, () => {
    s.committedIds = s.committedIds.filter((id) =>
      characters(s).some((u) => u.id === id && !u.exhausted),
    );
  });
  if (
    ["quest", "staging"].includes(s.phase) &&
    !s.encounterDeck.length &&
    s.encounterDiscard.length
  ) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(s, "The empty encounter deck is refilled during the quest phase.");
  }
  const doomed = [
    ...allCharacters(s),
    ...allEngaged(s),
    ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
  ].find((u) => u.damage >= stats(s, u).health);
  if (doomed) {
    destroy(s, doomed);
    return;
  }
  if (s.table) {
    eachSeat(s, (i) => {
      if (s.threat < 50 && (s.heroes.length || s.prisoner?.owner === i)) return;
      s.table!.seats[i].eliminated = true;
      log(
        s,
        `${seatName(s, i)} is eliminated. The remaining heroes continue.`,
        "danger",
      );
      for (const u of [...s.heroes, ...s.allies]) {
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        seatView(s, u.owner ?? i).discard.push(u.code);
        if (card(u.code).type_code === "hero")
          s.fallenThreat += card(u.code).threat ?? 0;
      }
      if (
        s.allies.some((u) => u.code === "rc135") &&
        s.campaign &&
        s.scenarioId !== "dol-guldur"
      ) {
        s.status = "lost";
        s.reason = "Mendor has left play. The campaign quest is lost.";
      }
      s.discard.push(...s.hand.map((u) => u.code), ...s.deck);
      s.heroes = [];
      s.allies = [];
      s.hand = [];
      s.deck = [];
      s.committedIds = [];
      for (const u of s.engaged) {
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        u.attacked = false;
        s.staging.push(u);
      }
      s.engaged = [];
      if (s.choice && activeSeat(s) === i) s.choice = null;
    });
    const alive = livingSeats(s);
    if (!alive.length) {
      s.status = "lost";
      s.reason = "Every hero’s fellowship has fallen to the shadow.";
    } else {
      if (!alive.includes(s.table.first)) s.table.first = playerOrder(s)[0];
      if (!alive.includes(s.table.turn))
        s.table.turn =
          playerOrder(s).find((i) => !s.table!.passed.includes(i)) ?? alive[0];
      if (s.table.seats[s.table.active].eliminated) selectSeat(s, s.table.turn);
    }
  } else if (s.threat >= 50 || (!s.heroes.length && !s.prisoner)) {
    s.status = "lost";
    s.reason =
      s.threat >= 50
        ? "Your threat reached 50. The shadow has found you."
        : "The last hero has fallen.";
  }
  if (s.status === "lost") {
    s.choice = null;
    s.queue = [];
    log(s, s.reason, "danger");
  } else {
    followFirstPlayer(s);
    const overloaded = allCharacters(s).find((u) => restricted(u).length > 2);
    if (overloaded) {
      if (!s.choice) restrictAttachments(s, overloaded);
      syncSeat(s);
      return;
    }
    advanceDefense(s);
    advanceQuest(s);
  }
  syncSeat(s);
}
function win(s: GameState) {
  if (s.status !== "playing") return;
  s.status = "won";
  s.reason =
    s.scenarioId === "mirkwood"
      ? "Your fellowship has passed safely through Mirkwood."
      : s.scenarioId === "anduin"
        ? "The ambush is broken. Your fellowship reaches the shores of Lórien."
        : "The prisoner is free, the Nazgûl defeated, and your fellowship has escaped Dol Guldur.";
  s.choice = null;
  s.queue = [];
  if (s.campaign) resolveCampaign(s);
  log(s, `Victory! ${s.reason}`, "chapter");
}
function damage(s: GameState, id: string, value: number) {
  const u = get(s, id);
  if (!u) return;
  u.damage += value;
  if (u.code === "01003" && u.damage < stats(s, u).health) u.resources += value;
  log(s, `${name(u)} takes ${value} damage.`, value > 1 ? "danger" : "normal");
  if (u.damage >= stats(s, u).health) destroy(s, u);
  check(s);
}
function discardAttachment(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving = false,
) {
  if (!leaving && card(a.code).text?.includes("Permanent")) return;
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  if (OBJECTIVES.includes(a.code)) {
    s.staging.push(make(s, a.code));
    log(s, `${card(a.code).name} returns to staging, unclaimed.`);
    return;
  }
  (card(a.code).sphere_code === "encounter"
    ? s.encounterDiscard
    : seatView(s, a.owner ?? ownerOf(s, u)).discard
  ).push(a.code);
  log(s, `${card(a.code).name} is discarded from ${name(u)}.`);
}
function destroy(s: GameState, u: Unit) {
  const previous = activeSeat(s);
  selectSeat(s, ownerOf(s, u));
  const c = card(u.code);
  if (c.type_code === "ally" || c.type_code === "hero") {
    for (const h of allHeroes(s))
      for (const a of h.attachments) if (a.code === "01042") h.resources++;
  }
  if (["ally", "hero"].includes(c.type_code)) {
    s.threat += characters(s).reduce(
      (n, h) => n + h.attachments.filter((a) => a.code === "rc138").length,
      0,
    );
  }
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  if (c.type_code === "enemy") {
    s.staging = s.staging.filter((x) => x.id !== u.id);
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
    s.encounterDiscard.push(...u.shadows);
    if (u.facedownCard)
      seatView(s, u.owner ?? activeSeat(s)).discard.push(u.facedownCard);
    else if (u.code === "01115") {
      s.encounterDeck.push(u.code);
      shuffle(s, s.encounterDeck);
    } else if (c.victory) s.victory += c.victory;
    else if (!(s.combat?.returnWolf && s.combat.enemyId === u.id))
      s.encounterDiscard.push(u.code);
    if (u.code === "01102") s.nazgulDefeated = true;
    if (u.code === "01082" && s.campaign && s.scenarioId === "anduin")
      enqueue(
        s,
        ...playerOrder(s).map((player) =>
          fx("earnPermanent", { code: "rc133", player }),
        ),
      );
    log(s, `${c.name} is defeated.`, "good");
    if (
      s.scenarioId === "mirkwood" &&
      s.stage === 3 &&
      s.branch === "spider" &&
      u.code === "01076"
    )
      win(s);
  } else {
    s.heroes = s.heroes.filter((x) => x.id !== u.id);
    s.allies = s.allies.filter((x) => x.id !== u.id);
    if (u.code === "rc135") {
      s.removed.push(u.code);
      if (s.campaign && s.scenarioId !== "dol-guldur") {
        s.status = "lost";
        s.reason = "Mendor has left play. The campaign quest is lost.";
        s.choice = null;
        s.queue = [];
      }
    } else seatView(s, u.owner ?? activeSeat(s)).discard.push(u.code);
    if (c.type_code === "hero") s.fallenThreat += c.threat ?? 0;
    log(s, `${c.name} has fallen.`, "danger");
    if (c.type_code === "ally") enqueue(s, fx("valiant"));
    if (c.type_code === "hero" && c.traits?.includes("Dwarf"))
      enqueue(s, fx("brok"));
  }
  syncSeat(s);
  selectSeat(s, previous);
  check(s);
}
function progressLocation(s: GameState, u: Unit, value: number) {
  u.progress += value;
  if (u.progress < (card(u.code).quest ?? 0)) return;
  log(s, `${name(u)} is explored.`, "good");
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  else s.staging = s.staging.filter((x) => x.id !== u.id);
  if (u.code === "01113") s.encounterDeck.unshift(u.code);
  else if (card(u.code).victory) s.victory += card(u.code).victory!;
  else s.encounterDiscard.push(u.code);
  for (const a of [...u.attachments]) discardAttachment(s, u, a);
  if (u.code === "01078")
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("mountainReward", { player })),
    );
}
function progress(s: GameState, n: number) {
  if (s.activeLocation) {
    const toLocation = Math.min(
      n,
      (card(s.activeLocation.code).quest ?? 0) - s.activeLocation.progress,
    );
    progressLocation(s, s.activeLocation, toLocation);
    n -= toLocation;
  }
  if (n <= 0 || s.status !== "playing") return;
  s.progress += n;
  if (s.scenarioId === "dol-guldur" && s.stage === 2 && s.prisoner)
    rescuePrisoner(s);
  advanceQuest(s);
}
function advanceQuest(s: GameState) {
  if (s.status !== "playing" || s.stageRevealing || s.phase === "setup") return;
  if (s.stage === 3) {
    if (
      s.scenarioId === "anduin" &&
      !s.queue.length &&
      !s.choice &&
      ![...s.staging, ...allEngaged(s)].some(
        (u) => card(u.code).type_code === "enemy",
      )
    )
      win(s);
    else if (
      s.scenarioId === "dol-guldur" &&
      s.progress >= 7 &&
      s.nazgulDefeated &&
      !inPlay(s, "01102")
    )
      win(s);
    else if (
      s.scenarioId === "mirkwood" &&
      s.branch === "beorn" &&
      s.progress >= 10 &&
      !inPlay(s, "01076")
    )
      win(s);
    return;
  }
  if (s.progress < stageInfo(s).quest) return;
  if (s.scenarioId === "anduin" && s.stage === 1 && inPlay(s, "01082")) return;
  if (
    s.scenarioId === "dol-guldur" &&
    (objectiveCount(s) < (s.stage === 1 ? 1 : 3) ||
      (s.stage === 2 && s.prisoner))
  )
    return;
  const mendor = allCharacters(s).find((u) => u.code === "rc135");
  if (mendor) {
    mendor.exhausted = false;
    eachSeat(s, () => draw(s, 1));
    log(
      s,
      "Mendor readies and you draw a card after defeating a quest stage.",
      "good",
    );
  }
  s.stage = (s.stage + 1) as 2 | 3;
  s.progress = 0;
  if (s.stage === 3 && s.scenarioId === "mirkwood") {
    s.branch = random(s) < 0.5 ? "beorn" : "spider";
    if (s.branch === "spider")
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("findSpider", { player })),
      );
  }
  if (s.stage === 3 && s.scenarioId === "anduin") {
    s.stageRevealing = true;
    prepend(
      s,
      ...Array.from({ length: livingSeats(s).length * 2 }, () =>
        fx("reveal", { player: s.table?.first ?? 0 }),
      ),
      fx("stageRevealed"),
    );
  }
  log(s, `A new chapter: ${stageInfo(s).name}.`, "chapter");
}
function phaseEnd(s: GameState) {
  const departures = allCharacters(s)
    .filter((u) => u.temporary || u.beornReturn)
    .map((u) => fx("allyDeparture", { target: u.id, player: ownerOf(s, u) }));
  eachSeat(s, () => phaseEndPlayer(s));
  prepend(s, ...departures);
}
function phaseEndPlayer(s: GameState) {
  s.faramir = 0;
  s.gondor = false;
  s.questDebuff = 0;
  s.threatModifier = 0;
  s.fog = 0;
  s.standTogether = false;
  s.used = s.used.filter((k) => !k.startsWith("protector:"));
  for (const x of [
    ...characters(s),
    ...s.engaged,
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ]) {
    x.tempThreat = 0;
    x.tempWill = 0;
    x.tempAttack = 0;
    x.tempDefense = 0;
    x.suppressed = false;
    x.feinted = false;
    x.preventedAttacks = [];
  }
  for (const u of [...characters(s)]) {
    if (u.code === "01007") u.boost = 0;
  }
}
function returnAlly(s: GameState, u: Unit, toDeck = false) {
  const controller = ownerOf(s, u),
    owner = u.owner ?? controller;
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  forOwner(s, controller, () => {
    s.allies = s.allies.filter((a) => a.id !== u.id);
  });
  forOwner(s, owner, () => {
    if (toDeck) {
      s.deck.push(u.code);
      shuffle(s, s.deck);
    } else s.hand.push(make(s, u.code));
  });
  log(
    s,
    `${name(u)} returns to ${seatName(s, owner)}’s ${toDeck ? "deck" : "hand"}.`,
  );
  prepend(s, fx("valiant", { player: controller }));
}
function nextRound(s: GameState) {
  s.round++;
  startPhase(s, "planning");
  s.alliesPlayed = 0;
  s.mendorBoost = false;
  eachSeat(s, () => {
    s.used = [];
    s.peek = null;
    s.optionalEngagement = false;
    for (const h of s.heroes) h.resources += has(h, "rc134") ? 2 : 1;
    draw(s, 1);
  });
  log(s, `Round ${s.round} · Each hero gains 1 resource.`, "chapter");
}
function engage(s: GameState, u: Unit) {
  if (allEngaged(s).some((e) => e.id === u.id))
    forOwner(s, ownerOf(s, u), () => {
      s.engaged = s.engaged.filter((e) => e.id !== u.id);
    });
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.engaged.push(u);
  if (s.table && !u.facedownCard) u.owner = activeSeat(s);
  if (u.preventedAttacks)
    u.feinted = u.preventedAttacks.includes(activeSeat(s));
  log(s, `${name(u)} engages your fellowship.`, "danger");
  if (u.code === "01096") u.boost = 1;
  if (u.code === "rc136") prepend(s, fx("chooseExhaust", { count: 2 }));
  if (u.code === "01075")
    prepend(s, fx("chooseDamage", { value: 5, flag: true }));
}
function returnTreachery(s: GameState, code: string) {
  if (!["01080", "01105"].includes(code)) s.encounterDiscard.push(code);
}
function revealed(s: GameState, code: string, guarding?: string) {
  const c = card(code);
  s.lastReveal = code;
  log(
    s,
    `Revealed ${c.name}.`,
    c.type_code === "treachery" ? "danger" : "normal",
  );
  if (s.flow) {
    prepend(s, fx("resolveReveal", { code, source: guarding }));
    pauseFor(s, {
      kind: "reveal",
      title: `Revealed · ${c.name}`,
      detail: "Read the encounter. Its revealed effects have not resolved yet.",
      cards: [
        { code, label: guarding ? "Objective guard" : "Encounter revealed" },
      ],
    });
    return;
  }
  resolveReveal(s, code, guarding);
}
function resolveReveal(s: GameState, code: string, guarding?: string) {
  const c = card(code);
  let thalin = false;
  if (
    c.type_code === "enemy" &&
    allHeroes(s).some((h) => h.code === "01006" && h.committed)
  ) {
    thalin = true;
    if ((c.health ?? 0) <= 1) {
      const crow = make(s, code);
      s.staging.push(crow);
      destroy(s, crow);
      log(s, `Thalin defeats ${c.name} as it is revealed.`, "good");
      return;
    }
  }
  const doomed = /Doomed (\d+)/.exec(c.text ?? "");
  if (doomed)
    eachSeat(s, () => {
      s.threat += Number(doomed[1]);
    });
  if (c.text?.includes("Surge.")) prepend(s, fx("reveal"));
  const when = (c.text ?? "").includes("When Revealed");
  const options: Option[] = [];
  const revealingPlayer = activeSeat(s);
  eachSeat(s, (player) => {
    if (
      when &&
      s.hand.some((u) => u.code === "01050") &&
      resources(s, "spirit") >= 1
    )
      options.push({
        id: s.table ? `cancel-${player}` : "cancel",
        label: `Play A Test of Will · 1 Spirit${s.table ? " · " + seatName(s, player) : ""}`,
        code: "01050",
        effects: [
          fx("spendEvent", { code: "01050", player }),
          fx("placeEncounter", {
            code,
            flag: true,
            player: revealingPlayer,
            value: thalin ? 1 : 0,
            source: guarding,
          }),
        ],
      });
    const eleanor = s.heroes.find((h) => h.code === "01008" && !h.exhausted);
    if (when && c.type_code === "treachery" && eleanor)
      options.push({
        id: s.table ? `eleanor-${player}` : "eleanor",
        label: "Exhaust Eleanor to cancel and replace",
        code: "01008",
        effects: [
          fx("exhaust", { target: eleanor.id }),
          fx("cancelReplace", {
            code,
            source: guarding,
            player: revealingPlayer,
          }),
        ],
      });
  });
  if (options.length) {
    choose(
      s,
      `Revealed: ${c.name}`,
      [
        ...options,
        {
          id: "resolve",
          label: "Resolve the encounter",
          code,
          effects: [
            fx("placeEncounter", {
              code,
              value: thalin ? 1 : 0,
              source: guarding,
            }),
          ],
        },
      ],
      c.text,
    );
    return;
  }
  prepend(
    s,
    fx("placeEncounter", { code, value: thalin ? 1 : 0, source: guarding }),
  );
}
function placeEncounter(
  s: GameState,
  code: string,
  cancel = false,
  initialDamage = 0,
  guarding?: string,
) {
  const c = card(code);
  if (c.type_code !== "treachery") {
    const fresh = make(s, code);
    fresh.damage = initialDamage;
    if (guarding && ["enemy", "location"].includes(c.type_code))
      fresh.guarding = guarding;
    s.staging.push(fresh);
    if (c.type_code === "objective") {
      prepend(
        s,
        fx("guardObjective", { target: fresh.id }),
        ...(guarding ? [fx("guardObjective", { target: guarding })] : []),
      );
    }
  }
  if (cancel) {
    if (c.type_code === "treachery") s.encounterDiscard.push(code);
    log(s, `${c.name}’s when-revealed effect was cancelled.`, "good");
    return;
  }
  switch (code) {
    case "01086":
      s.progress = Math.max(0, s.progress - 4);
      break;
    case "01104":
      s.threatModifier += livingSeats(s).length;
      break;
    case "01105":
      forOwner(s, s.table?.first ?? 0, () => {
        s.shackles++;
      });
      break;
    case "01112":
      prepend(
        s,
        ...playerOrder(s).map(() =>
          fx("reveal", { player: s.table?.first ?? 0 }),
        ),
      );
      break;
    case "01116":
      eachSeat(s, () => {
        if (s.threat >= 35)
          for (const x of [...characters(s)]) damage(s, x.id, 1);
      });
      break;
    case "01117":
      eachSeat(s, () => {
        s.threat += characters(s).filter((x) => !x.committed).length;
      });
      break;
    case "01118":
      s.fog = (s.fog ?? 0) + 1;
      prepend(
        s,
        ...playerOrder(s)
          .filter((i) => seatView(s, i).threat >= 35)
          .map((player) => fx("discardHand", { player })),
      );
      break;
    case "rc137":
      prepend(s, ...playerOrder(s).map((player) => fx("venom", { player })));
      break;
    case "01074":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("chooseExhaust", { count: 1, player }),
        ),
      );
      break;
    case "01076":
      s.questDebuff++;
      break;
    case "01079":
      eachSeat(s, () => {
        const events = s.hand.filter((u) => card(u.code).type_code === "event");
        s.hand = s.hand.filter((u) => card(u.code).type_code !== "event");
        s.discard.push(...events.map((u) => u.code));
      });
      break;
    case "01080":
      choose(
        s,
        "Caught in a Web",
        opts(
          allHeroes(s).filter(
            (h) =>
              seatView(s, ownerOf(s, h)).threat ===
              Math.max(...livingSeats(s).map((i) => seatView(s, i).threat)),
          ),
          (u) => [fx("web", { target: u.id })],
        ),
        "The player with the highest threat chooses one of their heroes. The web prevents normal refreshing unless that hero pays 2 resources.",
      );
      break;
    case "01089":
      choose(
        s,
        "Dol Guldur Orcs",
        opts(
          allCharacters(s).filter((u) => u.committed),
          (u) => [fx("damage", { target: u.id, value: 2 })],
        ),
        "Choose a character committed to the quest to take 2 damage.",
      );
      break;
    case "01092":
      if (s.staging.length)
        s.staging
          .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
          .forEach((u) => {
            u.tempThreat = (u.tempThreat ?? 0) + 1;
          });
      else prepend(s, fx("reveal"));
      break;
    case "01093":
      for (const u of [...allCharacters(s)].filter((u) => u.exhausted))
        damage(s, u.id, 1);
      break;
    case "01098":
      prepend(s, ...playerOrder(s).map((player) => fx("bats", { player })));
      break;
  }
  if (c.type_code === "treachery") returnTreachery(s, code);
}
function enterAlly(s: GameState, u: Unit, temporary = false, played = false) {
  u.temporary = temporary;
  s.allies.push(u);
  switch (u.code) {
    case "01073":
      prepend(s, fx("gandalf"));
      break;
    case "01016":
      choose(
        s,
        "Snowbourn Scout",
        [
          ...opts(
            [
              ...s.staging.filter((x) => card(x.code).type_code === "location"),
              ...(s.activeLocation ? [s.activeLocation] : []),
            ],
            (x) => [fx("locationProgress", { target: x.id, value: 1 })],
          ),
          skip,
        ],
        "Place 1 progress on a location.",
      );
      break;
    case "01015":
      choose(
        s,
        "Son of Arnor",
        [
          ...opts(
            [
              ...s.staging.filter((x) => card(x.code).type_code === "enemy"),
              ...allEngaged(s).filter((x) => ownerOf(s, x) !== activeSeat(s)),
            ],
            (x) => [fx("engage", { target: x.id })],
          ),
          skip,
        ],
        "You may engage an enemy from staging or another fellowship.",
      );
      break;
    case "01059": {
      if (!played) break;
      if (s.table) {
        choose(s, "Erebor Hammersmith", [
          ...playerOrder(s).flatMap((player) => {
            const discard = seatView(s, player).discard;
            const code = [...discard]
              .reverse()
              .find((c) => card(c).type_code === "attachment");
            return code
              ? [
                  {
                    id: `player-${player}`,
                    label: `${card(code).name} · ${seatName(s, player)}`,
                    code,
                    effects: [fx("recoverAttachment", { player, code })],
                  },
                ]
              : [];
          }),
          skip,
        ]);
        break;
      }
      const attachment = [...s.discard]
        .reverse()
        .find((code) => card(code).type_code === "attachment");
      if (attachment) {
        const i = s.discard.lastIndexOf(attachment);
        s.discard.splice(i, 1);
        s.hand.push(make(s, attachment));
        log(
          s,
          `Erebor Hammersmith returns ${card(attachment).name} to your hand.`,
        );
      }
      break;
    }
    case "01061":
      choose(s, "Miner of the Iron Hills", [
        ...allCharacters(s).flatMap((h) =>
          h.attachments
            .filter(
              (a) =>
                !card(a.code).text?.includes("Permanent") &&
                (card(a.code).traits?.includes("Condition") ||
                  card(a.code).text?.includes("Condition")),
            )
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `Discard ${card(a.code).name} from ${name(h)}`,
              effects: [
                fx("discardAttachment", { target: h.id, source: a.id }),
              ],
            })),
        ),
        ...playerOrder(s)
          .filter((i) => seatView(s, i).shackles > 0)
          .map((player) => ({
            id: `shackles-${player}`,
            code: "01105",
            label: `Discard Iron Shackles · ${seatName(s, player)}`,
            effects: [fx("discardShackles", { player })],
          })),
        skip,
      ]);
      break;
    case "01018":
      for (const x of [...s.staging, ...allEngaged(s)].filter((x) =>
        card(x.code).traits?.includes("Orc"),
      ))
        damage(s, x.id, 1);
      break;
  }
}
function spendEvent(s: GameState, code: string) {
  const u = s.hand.find((u) => u.code === code);
  requireRule(u, "That event is no longer in hand.");
  pay(s, card(code));
  s.hand = s.hand.filter((x) => x.id !== u.id);
  s.discard.push(code);
  log(s, `Played ${card(code).name}.`, "good");
}
function attachmentChoice(s: GameState, defenderOnly = false) {
  const c = s.combat;
  const list = defenderOnly
    ? (c?.defenderIds ?? (c?.defenderId ? [c.defenderId] : [])).map((id) =>
        get(s, id)!,
      )
    : units(s);
  const options: Option[] = [];
  for (const u of list.filter(Boolean))
    for (const a of u.attachments) {
      if (
        !card(a.code).text?.includes("Permanent") &&
        (defenderOnly || attachmentController(s, u, a) === activeSeat(s))
      )
        options.push({
          id: a.id,
          label: `${card(a.code).name} · ${name(u)}`,
          code: a.code,
          effects: [fx("discardAttachment", { target: u.id, source: a.id })],
        });
    }
  choose(s, "Choose an attachment to discard", options);
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return;
  const undefended = !(
    c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])
  ).some((id) => !!get(s, id));
  switch (code) {
    case "01081":
      prepend(s, fx("wolfAttack"));
      break;
    case "01085":
      c.attackBonus += undefended ? 2 : 1;
      break;
    case "01086":
      c.ignoreDefense = true;
      break;
    case "01103":
      if (undefended) {
        for (const x of units(s))
          for (const a of [...x.attachments])
            if (attachmentController(s, x, a) === activeSeat(s))
              discardAttachment(s, x, a);
      } else attachmentChoice(s);
      break;
    case "01104":
      s.threat += s.engaged.length;
      break;
    case "01105": {
      // The shadow card becomes a Condition on the deck. It must no longer be
      // discarded with this enemy's remaining shadow cards at combat end.
      const enemy = get(s, c.enemyId);
      const index = enemy?.shadows.indexOf(code) ?? -1;
      if (enemy && index >= 0) enemy.shadows.splice(index, 1);
      forOwner(s, s.table?.first ?? 0, () => {
        s.shackles++;
      });
      break;
    }
    case "01111":
      s.progress = Math.max(0, s.progress - (undefended ? 3 : 1));
      break;
    case "01112": {
      const enemy = get(s, c.enemyId),
        effects: Effect[] = [];
      for (const _player of livingSeats(s)) {
        const extra = encounterDraw(s, true);
        if (enemy && extra) {
          enemy.shadows.push(extra);
          effects.push(fx("shadowReveal", { code: extra }));
        }
      }
      prepend(s, ...effects);
      break;
    }
    case "01115":
      c.attackBonus += s.threat >= 35 ? 2 : 1;
      break;
    case "01117": {
      const exhausted = s.allies.filter((a) => a.exhausted);
      if (!exhausted.length) s.threat += 3;
      else
        choose(
          s,
          "Pursued by Shadow",
          opts(exhausted, (a) => [fx("returnAlly", { target: a.id })]),
        );
      break;
    }
    case "rc136": {
      const enemy = get(s, c.enemyId);
      if (enemy) enemy.shadows.splice(enemy.shadows.indexOf(code), 1);
      const swarm = make(s, code);
      s.staging.push(swarm);
      engage(s, swarm);
      break;
    }
    case "rc137":
      characters(s)
        .filter((x) => x.damage > 0)
        .forEach((x) => (x.exhausted = true));
      break;
    case "01074":
      prepend(s, fx("chooseExhaust", { count: undefended ? 2 : 1 }));
      break;
    case "01075":
      for (const u of [...characters(s)]) damage(s, u.id, undefended ? 2 : 1);
      break;
    case "01076":
      s.threat += undefended ? 8 : 4;
      break;
    case "01089":
      c.attackBonus += undefended ? 3 : 1;
      break;
    case "01092":
      if (undefended) {
        for (const u of units(s))
          for (const a of [...u.attachments])
            if (attachmentController(s, u, a) === activeSeat(s))
              discardAttachment(s, u, a);
      } else attachmentChoice(s, true);
      break;
    case "01096":
      attachmentChoice(s);
      break;
    case "01097":
      c.attackBonus++;
      if (undefended) s.threat += 3;
      break;
  }
  check(s);
}
function handle(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "commitSeat": {
      if (!passSeat(s)) break;
      const reveals =
        s.scenarioId === "anduin" && s.stage === 3
          ? 0
          : livingSeats(s).length +
            (s.scenarioId === "anduin" && s.stage === 2 ? 1 : 0);
      const player = s.table?.first ?? 0;
      enqueue(
        s,
        ...Array.from({ length: reveals }, () => fx("reveal", { player })),
        fx("questReady", { player }),
      );
      break;
    }
    case "bats":
      choose(
        s,
        "Black Forest Bats",
        opts(
          characters(s).filter((u) => u.committed),
          (u) => [fx("uncommit", { target: u.id })],
        ),
        "Remove one of this player’s characters from the quest.",
      );
      break;
    case "venom": {
      const most = Math.max(0, ...s.heroes.map((h) => h.damage));
      choose(s, "Lingering Venom", [
        {
          id: "exhaust",
          label: "Exhaust every damaged character you control",
          effects: characters(s)
            .filter((x) => x.damage > 0)
            .map((x) => fx("exhaust", { target: x.id })),
        },
        ...opts(
          s.heroes.filter((h) => h.damage === most),
          (h) => [fx("damage", { target: h.id, value: 2 })],
          () => "Deal 2 damage to this most-damaged hero",
        ),
      ]);
      break;
    }
    case "recoverAttachment": {
      const i = s.discard.lastIndexOf(e.code!);
      if (i >= 0) s.hand.push(make(s, s.discard.splice(i, 1)[0]));
      break;
    }
    case "searchPlayer":
      choose(
        s,
        "Gandalf’s Search",
        s.deck.slice(0, e.value).map((code, i) => ({
          id: `search-${i}`,
          code,
          label: card(code).name,
          effects: [fx("searchTake", { code, value: i, count: e.value })],
        })),
        "Add one card to its owner’s hand, then order the rest on top of the deck.",
      );
      break;
    case "rainOfArrows":
      for (const enemy of [...s.engaged]) damage(s, enemy.id, 1);
      break;
    case "standTogether":
      s.standTogether = true;
      break;
    case "hospitality":
      s.heroes.forEach((h) => {
        h.damage = 0;
      });
      break;
    case "thicket":
      s.engaged.forEach((enemy) => {
        enemy.preventedAttacks = [
          ...new Set([...(enemy.preventedAttacks ?? []), activeSeat(s)]),
        ];
        enemy.feinted = true;
      });
      break;
    case "discardShackles":
      if (s.shackles > 0) {
        s.shackles--;
        s.encounterDiscard.push("01105");
        log(s, "Miner of the Iron Hills discards Iron Shackles.", "good");
      }
      break;
    case "payPass":
      for (let i = 0; i < 2; i++) {
        const index = Math.floor(random(s) * s.hand.length);
        s.discard.push(s.hand.splice(index, 1)[0].code);
      }
      log(
        s,
        "Necromancer’s Pass discards 2 random cards to pay its travel cost.",
      );
      break;
    case "travelEnter":
      if (u && s.staging.some((x) => x.id === u.id)) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        s.activeLocation = u;
        log(s, `Travelled to ${name(u)}.`, "good");
        if (u.code === "01087") progressLocation(s, u, 1);
        if (u.code === "01107") eachSeat(s, () => orcGuard(s));
        if (u.code === "01099")
          enqueue(s, fx("travelReady", { player: s.table?.first ?? 0 }));
        if (u.code === "01100")
          enqueue(s, fx("draw", { value: 2, player: s.table?.first ?? 0 }));
        enqueue(
          s,
          ...playerOrder(s).map((player) =>
            fx("strengthOfWill", { target: u.id, player }),
          ),
          fx("travelDone"),
        );
      }
      break;
    case "reshufflePlayer":
      s.deck.push(...s.discard.splice(0));
      shuffle(s, s.deck);
      break;
    case "faramir":
      characters(s).forEach((u) => {
        u.tempWill = (u.tempWill ?? 0) + 1;
      });
      break;
    case "transferTook":
      if (u && e.value !== undefined) {
        eachSeat(s, () => {
          s.used.push(`took:${u.id}`);
        });
        const from = ownerOf(s, u);
        forOwner(s, from, () => {
          s.allies = s.allies.filter((a) => a.id !== u.id);
          s.threat = Math.max(0, s.threat - 3);
        });
        forOwner(s, e.value, () => {
          s.allies.push(u);
          s.threat += 3;
        });
      }
      break;
    case "eowynDiscard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (h) {
        s.hand = s.hand.filter((x) => x.id !== h.id);
        s.discard.push(h.code);
        const eowyn = allHeroes(s).find((x) => x.code === "01007");
        if (eowyn) eowyn.boost++;
        s.eowynUsed = true;
        log(s, "Éowyn gains +1 willpower this phase.", "good");
      }
      break;
    }
    case "resource":
      if (u) u.resources += e.value ?? 1;
      break;
    case "ready":
      if (u) u.exhausted = false;
      break;
    case "exhaust":
      if (u) u.exhausted = true;
      break;
    case "damage":
      if (u) damage(s, u.id, e.value ?? 0);
      break;
    case "draw":
      draw(s, e.value ?? 1);
      break;
    case "threat":
      s.threat = Math.max(0, s.threat + (e.value ?? 0));
      break;
    case "uncommit":
      if (u) u.committed = false;
      break;
    case "web":
      if (u)
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: "01080",
          exhausted: false,
        });
      break;
    case "spendEvent":
      spendEvent(s, e.code!);
      break;
    case "resolveReveal":
      resolveReveal(s, e.code!, e.source);
      break;
    case "placeEncounter":
      placeEncounter(s, e.code!, e.flag, e.value, e.source);
      break;
    case "reveal": {
      const code = encounterDraw(s);
      if (code) revealed(s, code, e.source);
      break;
    }
    case "engage":
      if (u) engage(s, u);
      break;
    case "locationProgress":
      if (u) progressLocation(s, u, e.value ?? 0);
      break;
    case "discardAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (u && a) discardAttachment(s, u, a);
      break;
    }
    case "chooseExhaust": {
      const available = characters(s).filter((u) => !u.exhausted);
      choose(
        s,
        "Choose a character to exhaust",
        opts(available, (u) => [
          fx("exhaust", { target: u.id }),
          ...((e.count ?? 1) > 1
            ? [fx("chooseExhaust", { count: (e.count ?? 1) - 1 })]
            : []),
        ]),
      );
      break;
    }
    case "chooseDamage":
      choose(
        s,
        `Assign ${e.value} damage`,
        opts(e.flag ? s.heroes : characters(s), (u) => [
          fx("damage", { target: u.id, value: e.value }),
        ]),
        e.flag ? "All damage must be assigned to a single hero." : undefined,
      );
      break;
    case "gandalf":
      choose(s, "Gandalf has arrived", [
        {
          id: "draw",
          label: "Draw 3 cards",
          effects: [fx("draw", { value: 3 })],
        },
        {
          id: "threat",
          label: "Reduce threat by 5",
          effects: [fx("threat", { value: -5 })],
        },
        ...opts(
          [...s.staging, ...allEngaged(s)].filter(
            (u) => card(u.code).type_code === "enemy",
          ),
          (u) => [fx("damage", { target: u.id, value: 4 })],
          () => "Deal 4 damage",
        ),
      ]);
      break;
    case "mountainReward": {
      const top = s.deck.slice(0, 5);
      choose(
        s,
        "Beyond the Mountains of Mirkwood",
        top.map((code, i) => ({
          id: `top${i}`,
          label: card(code).name,
          code,
          effects: [fx("takeSearched", { code, value: i })],
        })),
        "Choose one of the top five cards. The rest are shuffled back into your deck.",
      );
      break;
    }
    case "takeSearched": {
      s.deck.splice(e.value!, 1);
      s.hand.push(make(s, e.code!));
      shuffle(s, s.deck);
      break;
    }
    case "findSpider": {
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter((code) =>
            card(code).traits?.includes("Spider"),
          ),
        ),
      ];
      choose(
        s,
        "Don’t Leave the Path!",
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("fetchSpider", { code })],
        })),
        "Choose a Spider from the encounter deck or discard pile to add to staging. Defeat Ungoliant’s Spawn to win.",
      );
      break;
    }
    case "fetchSpider": {
      const pile = s.encounterDeck.includes(e.code!)
        ? s.encounterDeck
        : s.encounterDiscard;
      pile.splice(pile.indexOf(e.code!), 1);
      s.staging.push(make(s, e.code!));
      shuffle(s, s.encounterDeck);
      log(s, `${card(e.code!).name} emerges from the trees.`, "danger");
      break;
    }
    case "theodred":
      choose(
        s,
        "Théodred’s response",
        [
          ...opts(
            allHeroes(s).filter((u) => u.committed),
            (u) => [fx("resource", { target: u.id, value: 1 })],
          ),
          skip,
        ],
        "Give 1 resource to a hero committed to the quest.",
      );
      break;
    case "aragorn": {
      const a = s.heroes.find((h) => h.code === "01001");
      if (a?.committed && a.exhausted && a.resources > 0)
        choose(s, "Aragorn’s response", [
          {
            id: "ready",
            label: "Spend 1 resource to ready Aragorn",
            code: a.code,
            effects: [
              fx("resource", { target: a.id, value: -1 }),
              fx("ready", { target: a.id }),
            ],
          },
          skip,
        ]);
      break;
    }
    case "questReady":
      s.phase = "staging";
      log(
        s,
        "An encounter has been revealed. Use actions, then resolve the quest.",
      );
      break;
    case "phaseEnd":
      phaseEnd(s);
      break;
    case "startQuest":
      startPhase(s, "quest");
      s.lastQuest = null;
      log(s, "Quest phase · Choose characters to commit.");
      if (s.scenarioId === "dol-guldur" && s.stage === 3)
        eachSeat(s, () => orcGuard(s));
      break;
    case "startTravel":
      s.phase = "travel";
      break;
    case "startEncounter":
      startPhase(s, "encounter");
      eachSeat(s, () => {
        s.optionalEngagement = false;
      });
      break;
    case "allyDeparture":
      if (u?.temporary && u.beornReturn) {
        selectSeat(s, s.table?.first ?? 0);
        choose(
          s,
          `Beorn · Choose the first end-of-phase effect`,
          [
            {
              id: "hand",
              label: "Sneak Attack · Return Beorn to his owner's hand",
              code: u.code,
              effects: [fx("returnAlly", { target: u.id })],
            },
            {
              id: "deck",
              label: "Beorn's fury · Shuffle Beorn into his owner's deck",
              code: u.code,
              effects: [fx("returnAllyDeck", { target: u.id })],
            },
          ],
          "Both effects are due now. The first player chooses; leaving play ends the other effect.",
        );
      } else if (u) returnAlly(s, u, !!u.beornReturn);
      break;
    case "returnAllyDeck":
      if (u) returnAlly(s, u, true);
      break;
    case "endCombat":
      eachSeat(s, () => {
        for (const enemy of s.engaged) {
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          enemy.attacked = false;
        }
      });
      if (s.pendingWolfReturns?.length) {
        s.encounterDeck.unshift(...s.pendingWolfReturns);
        log(
          s,
          `${s.pendingWolfReturns.length} Wolf Rider shadow card(s) return to the encounter deck at the end of combat.`,
        );
        s.pendingWolfReturns = [];
      }
      prepend(
        s,
        ...playerOrder(s).flatMap((player) =>
          s.staging
            .filter((u) => u.code === "01083")
            .map((u) => fx("chooseDamage", { value: 1, source: u.id, player })),
        ),
        fx("refreshReady"),
      );
      break;
    case "refreshReady":
      s.phase = "refresh";
      eachSeat(s, () => {
        for (const u of characters(s)) {
          u.committed = false;
          u.attacked = false;
          u.boost = 0;
          for (const a of u.attachments) a.exhausted = false;
          if (!has(u, "01080")) u.exhausted = false;
          else enqueue(s, fx("webRefresh", { target: u.id }));
        }
        s.eowynUsed = false;
      });
      enqueue(s, fx("refreshEnd"));
      break;
    case "endRound":
      if (s.table) {
        const order = playerOrder(s);
        s.table.first = order[1 % order.length] ?? 0;
        followFirstPlayer(s);
      }
      s.mendorBoost = false;
      eachSeat(s, () => {
        for (const ally of [...s.allies])
          if (ally.code === "01073") {
            s.allies = s.allies.filter((a) => a.id !== ally.id);
            for (const a of [...ally.attachments])
              discardAttachment(s, ally, a, true);
            seatView(s, ally.owner ?? activeSeat(s)).discard.push(ally.code);
            enqueue(s, fx("valiant"));
            log(s, "Gandalf departs at the end of the round.");
          }
        for (const h of [...s.heroes]) {
          if (has(h, "01109")) s.threat += 2;
          if (has(h, "01110")) damage(s, h.id, 1);
        }
      });
      for (const enemy of [...s.staging, ...allEngaged(s)]) enemy.boost = 0;
      enqueue(s, fx("nextRound"));
      break;
    case "nextRound":
      nextRound(s);
      break;
    case "travelDone":
      prepend(s, fx("phaseEnd"), fx("startEncounter"));
      break;
    case "travelReady":
      choose(
        s,
        "Old Forest Road",
        [
          ...opts(
            seatView(s, s.table?.first ?? 0)
              .heroes.concat(seatView(s, s.table?.first ?? 0).allies)
              .filter((u) => u.exhausted),
            (u) => [fx("ready", { target: u.id })],
          ),
          skip,
        ],
        "You may ready one character.",
      );
      break;
    case "travelExhaust":
      choose(
        s,
        "Great Forest Web",
        opts(
          s.heroes.filter((u) => !u.exhausted),
          (u) => [fx("exhaust", { target: u.id })],
        ),
        "Exhaust one hero to pay the travel cost.",
      );
      break;
    case "engagementRound": {
      if (s.scenarioId === "anduin" && s.stage === 2) break;
      const eligible = playerOrder(s).some((i) =>
        s.staging.some(
          (u) =>
            card(u.code).type_code === "enemy" &&
            (card(u.code).engagement ?? 0) <= seatView(s, i).threat,
        ),
      );
      if (eligible)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("automaticEngagement", { player }),
          ),
          fx("engagementRound"),
        );
      break;
    }
    case "automaticEngagement": {
      const enemy = s.staging
        .filter(
          (u) =>
            card(u.code).type_code === "enemy" &&
            (card(u.code).engagement ?? 0) <= s.threat,
        )
        .sort(
          (a, b) =>
            (card(b.code).engagement ?? 0) - (card(a.code).engagement ?? 0),
        )[0];
      if (enemy && !s.table?.seats[activeSeat(s)].eliminated) engage(s, enemy);
      break;
    }
    case "startCombat":
      startPhase(s, "defense");
      eachSeat(s, () => {
        for (const enemy of [...s.engaged].sort(
          (a, b) =>
            (card(b.code).engagement ?? 0) - (card(a.code).engagement ?? 0),
        )) {
          enemy.attacked = false;
          enemy.attackedBy = [];
          const code = encounterDraw(s, true);
          enemy.shadows = code ? [code] : [];
        }
      });
      advanceDefense(s);
      break;
    case "shadowReveal": {
      if (!get(s, s.combat?.enemyId)) break;
      log(
        s,
        `Shadow: ${card(e.code!).name}${card(e.code!).shadow ? " — " + card(e.code!).shadow : " · no effect"}.`,
      );
      if (s.flow) {
        prepend(s, fx("shadowResponse", { code: e.code }));
        pauseFor(s, {
          kind: "shadow",
          title: `Shadow · ${card(e.code!).name}`,
          detail: card(e.code!).shadow
            ? "The shadow is faceup. Review it before its response window and effect."
            : "This card has no shadow effect. Normal encounter text does not resolve here.",
          cards: [{ code: e.code!, label: "Revealed shadow" }],
        });
        break;
      }
      shadowResponse(s, e.code!);
      break;
    }
    case "shadowResponse":
      shadowResponse(s, e.code!);
      break;
    case "shadowEffect": {
      const enemyId = s.combat?.enemyId,
        before = s.queue.length;
      shadow(s, e.code!);
      if (enemyId && get(s, enemyId)?.code === "01102" && card(e.code!).shadow)
        s.queue.splice(
          s.queue.length - before,
          0,
          fx("nazgulDiscard", { target: enemyId }),
        );
      break;
    }
    case "enemyDamage": {
      const c = s.combat;
      const enemy = get(s, c?.enemyId);
      if (!c || !enemy) break;
      const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((x): x is Unit => !!x);
      const power = stats(s, enemy).attack + c.attackBonus;
      const defense = c.ignoreDefense
        ? 0
        : defenders.reduce((n, d) => n + stats(s, d).defense, 0);
      const amount = Math.max(0, power - defense);
      if (defenders.length > 1) {
        if (amount)
          choose(
            s,
            `Assign ${amount} combat damage`,
            opts(defenders, (d) => [
              fx("combatDamage", {
                target: d.id,
                value: amount,
                source: enemy.id,
              }),
            ]),
            "Stand Together: all damage from this attack goes to one defender.",
          );
      } else if (defenders.length) combatDamage(s, defenders[0], enemy, amount);
      else
        choose(
          s,
          `Assign ${power} damage`,
          opts(s.heroes, (h) => [
            fx("combatDamage", {
              target: h.id,
              source: enemy.id,
              value: power,
            }),
          ]),
          "All undefended damage goes to one hero.",
        );
      log(
        s,
        defenders.length
          ? `${name(enemy)} attacks for ${power} − ${defense} defense = ${amount} damage${c.ignoreDefense ? " (defense ignored)" : ""}.`
          : `${name(enemy)} attacks for ${power} damage (undefended).`,
      );
      break;
    }
    case "enemyDone": {
      const enemy = get(s, s.combat?.enemyId);
      if (enemy) {
        enemy.attacked = true;
        if (enemy.code === "01090") enemy.resources++;
        if (enemy.code === "01111") s.progress = Math.max(0, s.progress - 1);
        if (s.combat?.returnToStaging || s.combat?.returnWolf) {
          s.staging = s.staging.filter((x) => x.id !== enemy.id);
          s.engaged = s.engaged.filter((x) => x.id !== enemy.id);
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          if (s.combat.returnWolf) {
            log(
              s,
              "Wolf Rider's attack ends. Its shadow card returns to the deck when combat ends.",
            );
          } else s.staging.push(enemy);
        }
      }
      s.combat = s.suspendedCombats.pop() ?? null;
      if (s.combat) break;
      advanceDefense(s);
      break;
    }
    case "webRefresh": {
      const cost =
        (u?.attachments.filter((a) => a.code === "01080").length ?? 0) * 2;
      if (u?.exhausted && cost && u.resources >= cost)
        choose(s, `Free ${name(u)} from the web?`, [
          {
            id: "pay",
            label: `Pay ${cost} resources from this hero to ready`,
            effects: [
              fx("resource", { target: u.id, value: -cost }),
              fx("ready", { target: u.id }),
            ],
          },
          { id: "skip", label: "Leave this hero exhausted", effects: [] },
        ]);
      break;
    }
    case "refreshEnd":
      eachSeat(s, () => {
        s.threat += s.activeLocation?.code === "01114" ? 2 : 1;
      });
      s.phase = "refresh";
      log(s, "Refresh · Threat increases by 1.");
      check(s);
      break;
    case "sneak": {
      const a = s.hand.find((x) => x.id === e.target);
      if (a) {
        s.hand = s.hand.filter((x) => x.id !== a.id);
        enterAlly(s, a, true);
      }
      break;
    }
    default:
      extraEffect(s, e);
  }
}
function shadowResponse(s: GameState, code: string) {
  const eligible = playerOrder(s).filter((i) => {
    const p = seatView(s, i);
    return (
      card(code).shadow &&
      p.hand.some((u) => u.code === "01048") &&
      resources(p, "spirit") >= 1
    );
  });
  if (eligible.length)
    choose(
      s,
      "A shadow falls",
      [
        ...eligible.map((player) => ({
          id: s.table ? `cancel-${player}` : "cancel",
          label: `Play Hasty Stroke · 1 Spirit${s.table ? " · " + seatName(s, player) : ""}`,
          code: "01048",
          effects: [fx("spendEvent", { code: "01048", player })],
        })),
        {
          id: "resolve",
          label: "Resolve shadow effect",
          code,
          effects: [fx("shadowEffect", { code })],
        },
      ],
      card(code).shadow,
    );
  else prepend(s, fx("shadowEffect", { code }));
}
function flush(s: GameState) {
  let n = 0;
  while (
    s.queue.length &&
    !s.choice &&
    !s.flow?.pending &&
    s.status === "playing"
  ) {
    requireRule(++n < 200, "Effect queue overflow.");
    const effect = s.queue.shift()!;
    if (s.table && effect.player !== undefined) selectSeat(s, effect.player);
    const before = observation(s);
    if (
      !s.table?.seats[activeSeat(s)].eliminated ||
      [
        "nextRound",
        "phaseEnd",
        "startCombat",
        "finishQuestPhase",
        "questReady",
        "commitSeat",
        "stageRevealed",
        "refreshEnd",
        "travelDone",
        "travelEnter",
        "reveal",
        "placeEncounter",
        "resolveReveal",
        "engagementRound",
        "automaticEngagement",
        "enemyDone",
        "startQuest",
        "startTravel",
        "startEncounter",
        "endCombat",
        "refreshReady",
        "endRound",
      ].includes(effect.kind)
    )
      handle(s, effect);
    if (!s.flow?.pending) check(s);
    if (before) recordObservation(s, before, observation(s)!, effect);
  }
  if (
    s.table &&
    !s.choice &&
    !s.flow?.pending &&
    ["setup", "planning", "quest", "encounter", "defense", "attack"].includes(
      s.phase,
    )
  )
    selectSeat(s, s.table.turn);
  syncSeat(s);
}
export function createGame(
  seed = Date.now(),
  deck = DECK,
  heroCodes = HEROES,
  deckId = "custom",
  options: {
    scenarioId?: ScenarioId;
    playMode?: PlayMode;
    campaign?: CampaignState;
    includeSupport?: boolean;
    seats?: SeatConfig[];
    guided?: boolean;
  } = {},
): GameState {
  const list = Object.entries(deck).flatMap(
    ([code, n]) => Array(n).fill(code) as string[],
  );
  const starter = STARTERS.find((d) => d.id === deckId);
  const original =
    !!starter &&
    JSON.stringify(Object.entries(deck).sort()) ===
      JSON.stringify(Object.entries(starter.cards).sort()) &&
    (heroCodes.join() === starter.heroes.join() ||
      !!options.campaign ||
      !!options.seats);
  requireRule(
    list.length === 50 || (list.length === 30 && original),
    "Use an original 30-card starter list or exactly 50 cards for a custom deck.",
  );
  requireRule(
    heroCodes.length >= 1 &&
      heroCodes.length <= 3 &&
      new Set(heroCodes).size === heroCodes.length &&
      heroCodes.every((c) => card(c).type_code === "hero"),
    "Choose one to three different heroes.",
  );
  for (const [code, n] of Object.entries(deck)) {
    requireRule(
      SCRIPTED.has(code) &&
        card(code).type_code !== "hero" &&
        card(code).sphere_code !== "encounter" &&
        !code.startsWith("rc"),
      "Only scripted player cards can be included.",
    );
    requireRule(
      Number.isInteger(n) && n >= 0 && n <= 3,
      "A deck can contain at most 3 copies of each card.",
    );
  }
  const scenarioId = options.scenarioId ?? "mirkwood";
  const playMode = options.playMode ?? "normal";
  requireRule(
    SCENARIOS.some((q) => q.id === scenarioId),
    "Unknown Core Set scenario.",
  );
  requireRule(
    playMode === "normal" || playMode === "campaign",
    "Unknown game mode.",
  );
  requireRule(
    playMode !== "campaign" || options.campaign || scenarioId === "mirkwood",
    "A campaign begins in Mirkwood.",
  );
  const campaign =
    playMode === "campaign"
      ? structuredClone(
          options.campaign ??
            newCampaign(options.seats?.flatMap((p) => p.heroes) ?? heroCodes),
        )
      : null;
  const s: GameState = {
    ...(options.guided
      ? { flow: { nextId: 1, pending: null, history: [] } }
      : {}),
    version: 2,
    scenarioId,
    playMode,
    campaign,
    startingHeroes: [...heroCodes],
    prisoner: null,
    captiveMendor: null,
    nazgulDefeated: false,
    stageRevealing: false,
    alliesPlayed: 0,
    threatModifier: 0,
    shackles: 0,
    mendorBoost: false,
    campaignScarred: false,
    includeSupport: options.includeSupport ?? true,
    suspendedCombats: [],
    deckId,
    used: [],
    standTogether: false,
    peek: null,
    seed: seed | 0,
    originalSeed: seed | 0,
    nextId: 1,
    phase: "setup",
    round: 0,
    threat: 29,
    status: "playing",
    reason: "",
    heroes: [],
    allies: [],
    hand: [],
    deck: list,
    discard: [],
    removed: [],
    encounterDeck: encounterCards
      .filter((c) =>
        (scenario(scenarioId).sets as readonly string[]).includes(
          c.encounter_set ?? "",
        ),
      )
      .flatMap((c) => Array(c.quantity).fill(c.code)),
    encounterDiscard: [],
    staging: [],
    engaged: [],
    activeLocation: null,
    stage: 1,
    branch: "unknown",
    progress: 0,
    victory: 0,
    fallenThreat: 0,
    committedIds: [],
    questDebuff: 0,
    faramir: 0,
    gondor: false,
    eowynUsed: false,
    mulled: false,
    optionalEngagement: false,
    choice: null,
    queue: [],
    combat: null,
    log: [],
    lastReveal: null,
    lastQuest: null,
  };
  if (options.seats) {
    const heroes = options.seats.flatMap((p) => p.heroes);
    requireRule(
      options.seats.length >= 1 &&
        options.seats.length <= 4 &&
        new Set(heroes).size === heroes.length,
      "Choose one to four players with different heroes across the table.",
    );
    for (const config of options.seats) {
      const d = STARTERS.find((d) => d.id === config.deckId);
      requireRule(
        d &&
          config.heroes.length >= 1 &&
          config.heroes.length <= 3 &&
          config.heroes.every(
            (h) => SCRIPTED.has(h) && card(h).type_code === "hero",
          ),
        "Each player needs one to three heroes and a Core Set starter deck.",
      );
    }
    const blank = snapshotSeat(s);
    s.table = {
      seats: options.seats.map(() => structuredClone(blank)),
      active: 0,
      first: 0,
      turn: 0,
      passed: [],
    };
    options.seats.forEach((config, i) => {
      selectSeat(s, i);
      const d = STARTERS.find((d) => d.id === config.deckId)!;
      s.deckId = d.id;
      s.startingHeroes = [...config.heroes];
      s.deck = Object.entries(d.cards).flatMap(([code, n]) =>
        Array<string>(n).fill(code),
      );
      s.heroes = config.heroes.map((h) => make(s, h));
      s.threat =
        config.heroes.reduce((n, h) => n + (card(h).threat ?? 0), 0) +
        (campaign?.threatPenalty ?? 0);
      syncSeat(s);
    });
    selectSeat(s, 0);
  } else {
    s.heroes = heroCodes.map((code) => make(s, code));
    s.threat =
      s.heroes.reduce((n, h) => n + (card(h.code).threat ?? 0), 0) +
      (campaign?.threatPenalty ?? 0);
  }
  if (campaign) {
    s.encounterDeck.push(
      ...campaign.burdens.filter((c) => ["rc136", "rc137"].includes(c)),
    );
    eachSeat(s, () => {
      if (s.includeSupport && campaign.boons.includes("rc132"))
        s.deck.push("rc132");
      for (const h of s.heroes)
        for (const code of campaign.permanent[h.code] ?? [])
          h.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
    });
    s.allies.push(make(s, "rc135"));
  }
  eachSeat(s, () => {
    shuffle(s, s.deck);
    draw(s, 6);
  });
  if (scenarioId === "mirkwood") {
    for (const code of ["01096", "01099"]) {
      s.encounterDeck.splice(s.encounterDeck.indexOf(code), 1);
      s.staging.push(make(s, code));
    }
    shuffle(s, s.encounterDeck);
  } else if (scenarioId === "anduin") {
    shuffle(s, s.encounterDeck);
    enqueue(
      s,
      ...playerOrder(s).map((player) => fx("reveal", { player })),
      fx("ensureTroll"),
    );
  } else {
    s.encounterDeck = s.encounterDeck.filter(
      (code) => code !== "01102" && !OBJECTIVES.includes(code),
    );
    shuffle(s, s.encounterDeck);
    if (campaign)
      enqueue(s, fx("appointedByFate", { player: s.table?.first ?? 0 }));
    for (const code of OBJECTIVES) {
      const objective = make(s, code);
      s.staging.push(objective);
      enqueue(s, fx("guardObjective", { target: objective.id }));
    }
    enqueue(s, fx("capturePrisoner"));
  }
  log(
    s,
    `${scenario(scenarioId).name} · ${playMode === "campaign" ? "Mirkwood Paths campaign" : "Normal game"}.`,
    "chapter",
  );
  if (s.flow)
    pauseFor(s, {
      kind: "setup",
      title: `${scenario(scenarioId).shortName} · The table is ready`,
      detail:
        "Each fellowship has drawn six starting cards. Review the setup, then continue at your pace.",
      cards: s.staging.map((u) => ({ code: u.code, label: "Scenario setup" })),
      lines: s.log.slice(),
    });
  flush(s);
  return s;
}
export function canPlay(s: GameState, u: Unit): string | null {
  const c = card(u.code);
  if (s.flow?.pending)
    return "Review the current event before playing another card.";
  if (s.choice || s.status !== "playing")
    return "Resolve the current choice first.";
  if (s.table?.seats[activeSeat(s)].eliminated)
    return "This fellowship has been eliminated.";
  if (s.phase === "setup") return "Continue to the next action window.";
  if (
    ["ally", "attachment"].includes(c.type_code) &&
    s.table &&
    activeSeat(s) !== s.table.turn
  )
    return "Wait for this hero’s planning turn.";
  if (!eligiblePayers(s, c).length)
    return "A matching sphere hero is required.";
  if (["ally", "attachment"].includes(c.type_code) && s.phase !== "planning")
    return "Play allies and attachments during planning.";
  if (
    c.type_code === "ally" &&
    s.scenarioId === "dol-guldur" &&
    s.stage < 3 &&
    s.alliesPlayed >= 1
  )
    return "Only one ally may be played each round at this quest stage.";
  if (
    u.code === "rc132" &&
    (s.mendorBoost || !allCharacters(s).some((a) => a.code === "rc135"))
  )
    return "Mendor must be free, and his Support can be played once per round.";
  if (["01024", "01037", "01047", "01048", "01050"].includes(u.code))
    return "This response is offered automatically when its trigger occurs.";
  if (u.code === "01036" && s.heroes.length < 3)
    return "Thicket of Spears needs 3 heroes’ resource pools in the same deck.";
  if (resources(s, c.sphere_code) < Number(c.cost ?? 0))
    return "Not enough matching resources.";
  if (
    c.is_unique &&
    units(s).some(
      (x) => x.code === c.code || x.attachments.some((a) => a.code === c.code),
    )
  )
    return "A unique card with this name is already in play.";
  return null;
}
function discardTarget(s: GameState, target: string) {
  const parts = target.split("-").slice(1).map(Number);
  return {
    player: parts.length > 1 ? parts[0] : activeSeat(s),
    index: parts.at(-1)!,
  };
}
export function playTargets(s: GameState, u: Unit): Unit[] {
  const c = card(u.code);
  if (c.type_code === "attachment") {
    if (u.code === "01056")
      return [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ].filter((x) => card(x.code).type_code === "location");
    if (u.code === "01069")
      return allEngaged(s).filter((e) => e.code !== "01102");
    if (u.code === "01072") return allCharacters(s);
    return allHeroes(s);
  }
  if (u.code === "01020")
    return allCharacters(s).filter(
      (a) => card(a.code).type_code === "ally" && a.exhausted,
    );
  if (u.code === "01021")
    return s.heroes.filter(
      (a) =>
        !a.exhausted && allHeroes(s).some((h) => h.id !== a.id && h.exhausted),
    );
  if (u.code === "01032") return allCharacters(s);
  if (u.code === "01033")
    return characters(s).filter(
      (a) => !a.exhausted && card(a.code).text?.includes("Ranged"),
    );
  if (u.code === "01035")
    return characters(s).filter(
      (a) =>
        !a.exhausted &&
        canFight(a) &&
        [
          ...allEngaged(s),
          ...s.staging.filter((e) => card(e.code).type_code === "enemy"),
        ].some((enemy) => attackersFor(s, enemy).some((x) => x.id === a.id)),
    );
  if (["01034", "01052"].includes(u.code)) return allEngaged(s);
  if (u.code === "01063") return allCharacters(s).filter((a) => a.damage > 0);
  if (u.code === "01065")
    return s.staging.filter((a) => card(a.code).type_code === "enemy");
  if (u.code === "01066")
    return s.staging.filter((a) => card(a.code).type_code === "location");
  if (["01051", "01053", "01054"].includes(u.code))
    return (
      s.table && u.code !== "01053" ? livingSeats(s) : [activeSeat(s)]
    ).flatMap((player) =>
      seatView(s, player)
        .discard.map((code, i) => ({
          ...s.heroes[0],
          code,
          id: s.table ? `discard-${player}-${i}` : `discard-${i}`,
        }))
        .filter((a) =>
          u.code === "01051"
            ? card(a.code).type_code === "ally" &&
              card(a.code).sphere_code !== "neutral" &&
              (!card(a.code).is_unique ||
                !units(s).some((x) => x.code === a.code))
            : u.code === "01053"
              ? card(a.code).sphere_code === "spirit"
              : card(a.code).type_code === "hero",
        ),
    );
  return [];
}
export const needsTarget = (u: Unit) =>
  card(u.code).type_code === "attachment" ||
  [
    "01020",
    "01021",
    "01032",
    "01033",
    "01034",
    "01035",
    "01051",
    "01052",
    "01053",
    "01054",
    "01063",
    "01065",
    "01066",
  ].includes(u.code);
export const responseCards = ["01024", "01037", "01047", "01048", "01050"];
export function availableAbilities(s: GameState, u: Unit) {
  const results: { id?: string; label: string; disabled: boolean }[] = [];
  const heroAbility: Record<string, string> = {
    "01007": "Strength of spirit",
    "01010": "Look ahead",
    "01011": "Healing touch",
    "01012": "Draw 2 cards",
    "01014": "Rally fellowship",
    "01031": "Beorn’s fury",
    "01058": "Heal a hero",
    "01060": "Scout the path",
    "01062": "Draw a card",
    ...(s.table ? { "01043": "Visit another fellowship" } : {}),
  };
  if (heroAbility[u.code])
    results.push({
      label: heroAbility[u.code],
      disabled:
        u.code === "01007"
          ? s.eowynUsed || !s.hand.length
          : u.code === "01011"
            ? s.used.includes(u.id) ||
              u.resources < 1 ||
              !allCharacters(s).some((h) => h.damage > 0)
            : u.code === "01031"
              ? s.used.includes(u.id)
              : u.code === "01058"
                ? u.exhausted || !allHeroes(s).some((h) => h.damage > 0)
                : s.used.includes(u.id) || u.exhausted,
    });
  for (const a of u.attachments) {
    const active = ["01026", "01057", "01070", "01071", "01072"].includes(
      a.code,
    );
    if (active && attachmentController(s, u, a) === activeSeat(s))
      results.push({
        id: a.id,
        label: card(a.code).name,
        disabled: a.exhausted,
      });
  }
  return results;
}
export function applyAction(input: GameState, action: Action): GameState {
  const s = structuredClone(input);
  if (action.type === "CONTINUE") {
    requireRule(
      s.flow?.pending && s.flow.pending.id === action.stepId,
      "This event is no longer waiting for confirmation.",
    );
    s.flow.pending = null;
    flush(s);
    syncSeat(s);
    return s;
  }
  if (action.type === "SELECT_SEAT") {
    requireRule(
      s.table &&
        Number.isInteger(action.seat) &&
        action.seat >= 0 &&
        action.seat < s.table.seats.length,
      "Choose an existing hero seat.",
    );
    requireRule(!s.choice, "Resolve the current choice first.");
    selectSeat(s, action.seat);
    syncSeat(s);
    return s;
  }
  requireRule(!s.flow?.pending, "Review the current event before continuing.");
  const before = observation(s);
  requireRule(s.status === "playing", "This adventure has ended.");
  requireRule(
    !s.table?.seats[activeSeat(s)].eliminated,
    "This hero's seat has been eliminated. Switch to a surviving hero.",
  );
  if (
    s.table &&
    ([
      "KEEP",
      "MULLIGAN",
      "COMMIT",
      "TOGGLE_QUEST",
      "END_ATTACKS",
      "DEFEND",
    ].includes(action.type) ||
      (action.type === "NEXT" && ["planning", "encounter"].includes(s.phase)))
  )
    requireRule(
      activeSeat(s) === s.table.turn,
      `It is ${seatName(s, s.table.turn)}’s turn.`,
    );
  if (action.type === "CHOOSE") {
    requireRule(s.choice, "There is no pending choice.");
    const option = s.choice.options.find((o) => o.id === action.id);
    requireRule(option, "Invalid choice.");
    log(s, option.label);
    s.choice = null;
    prepend(s, ...option.effects);
    flush(s);
    return s;
  }
  requireRule(!s.choice, "Resolve the current choice first.");
  switch (action.type) {
    case "MULLIGAN":
      requireRule(
        s.phase === "setup" && !s.mulled,
        "You may mulligan once before the first round.",
      );
      s.deck.push(...s.hand.map((u) => u.code));
      s.hand = [];
      shuffle(s, s.deck);
      draw(s, 6);
      s.mulled = true;
      log(s, "You take your one mulligan.");
      break;
    case "KEEP":
      requireRule(s.phase === "setup", "Your opening hand is already kept.");
      if (passSeat(s)) nextRound(s);
      break;
    case "TOGGLE_QUEST": {
      requireRule(
        s.phase === "quest",
        "Choose questers during the quest phase.",
      );
      const u = get(s, action.id);
      requireRule(
        u && characters(s).some((x) => x.id === u.id) && !u.exhausted,
        "Only ready characters may commit.",
      );
      s.committedIds = s.committedIds.includes(u.id)
        ? s.committedIds.filter((x) => x !== u.id)
        : [...s.committedIds, u.id];
      break;
    }
    case "COMMIT": {
      requireRule(s.phase === "quest", "Not at the commit step.");
      for (const u of characters(s).filter((u) =>
        s.committedIds.includes(u.id),
      )) {
        requireRule(!u.exhausted, "A selected character is exhausted.");
        u.exhausted = true;
        u.committed = true;
      }
      const committed = characters(s).filter((u) => u.committed);
      s.committedIds = [];
      log(s, `${committed.length} characters commit to the quest.`);
      enqueue(
        s,
        ...(committed.some((u) => u.code === "01002") ? [fx("theodred")] : []),
        ...(committed.some((u) => u.code === "01001") ? [fx("aragorn")] : []),
      );
      for (const u of committed) {
        if (u.code === "01044" && s.activeLocation)
          enqueue(
            s,
            fx("locationProgress", { target: s.activeLocation.id, value: 1 }),
          );
        if (u.code === "01045")
          enqueue(
            s,
            ...s.staging
              .filter((x) => card(x.code).type_code === "location")
              .map((x) => fx("locationProgress", { target: x.id, value: 1 })),
          );
      }
      enqueue(s, fx("commitSeat"));
      break;
    }
    case "NEXT": {
      if (s.phase === "planning") {
        if (!passSeat(s)) break;
        enqueue(s, fx("phaseEnd"), fx("startQuest"));
      } else if (s.phase === "staging") {
        const will = questWill(s),
          threat = stagingThreat(s),
          net = will - threat;
        s.lastQuest = { will, threat, net };
        if (net > 0) {
          log(
            s,
            `Quest succeeds: ${will} willpower − ${threat} threat = ${net} progress.`,
            "good",
          );
          progress(s, net);
        } else if (net < 0) {
          eachSeat(s, () => {
            s.threat -= net;
          });
          for (const jailor of s.staging.filter((u) => u.code === "01101"))
            enqueue(s, fx("jailor", { source: jailor.id }));
          log(
            s,
            `Quest fails by ${-net}. Threat rises to ${s.threat}.`,
            "danger",
          );
        } else
          log(s, "Willpower matches threat. No progress or threat increase.");
        enqueue(s, fx("finishQuestPhase"));
      } else if (s.phase === "travel") {
        requireRule(
          s.activeLocation || !s.staging.some((u) => u.code === "01088"),
          "You must travel to The East Bight.",
        );
        enqueue(s, fx("phaseEnd"), fx("startEncounter"));
      } else if (s.phase === "encounter") {
        if (!passSeat(s)) break;
        enqueue(s, fx("engagementRound"));
        enqueue(s, fx("phaseEnd"), fx("startCombat"));
      } else if (s.phase === "refresh") {
        enqueue(s, fx("phaseEnd"), fx("endRound"));
      } else throw new RuleError("Finish the current phase action first.");
      break;
    }
    case "PLAY": {
      const u = s.hand.find((u) => u.id === action.id);
      requireRule(u, "Card is not in your hand.");
      const reason = canPlay(s, u);
      requireRule(!reason, reason ?? "");
      const c = card(u.code);
      if (needsTarget(u))
        requireRule(
          playTargets(s, u).some((x) => x.id === action.target),
          "Choose a legal target.",
        );
      if (u.code === "01034")
        requireRule(
          ["defense", "attack"].includes(s.phase),
          "Feint is a Combat Action.",
        );
      if (["01065", "01066"].includes(u.code))
        requireRule(
          ["quest", "staging"].includes(s.phase),
          "This is a Quest Action.",
        );
      if (u.code === "01023")
        requireRule(
          s.hand.some(
            (a) =>
              card(a.code).type_code === "ally" &&
              (!card(a.code).is_unique ||
                !allCharacters(s).some((x) => x.code === a.code)),
          ),
          "You need an eligible ally in hand.",
        );
      if (u.code === "01036")
        requireRule(
          action.payment &&
            Object.values(action.payment).filter((v) => v > 0).length === 3,
          "Thicket of Spears must use 3 different heroes’ resource pools.",
        );
      let effectiveCost = Number(c.cost) || 0;
      if (u.code === "01051") {
        const target = discardTarget(s, action.target!);
        effectiveCost =
          Number(card(seatView(s, target.player).discard[target.index]).cost) ||
          0;
      }
      if (u.code === "01067") {
        effectiveCost = action.amount ?? 0;
        requireRule(
          Number.isInteger(effectiveCost) &&
            effectiveCost > 0 &&
            effectiveCost <=
              Math.max(
                ...livingSeats(s).map((i) => seatView(s, i).deck.length),
              ),
          "Choose a positive X no larger than an available player deck.",
        );
      }
      pay(s, { ...c, cost: effectiveCost }, action.payment);
      s.hand = s.hand.filter((x) => x.id !== u.id);
      log(s, `Played ${c.name}.`, "good");
      if (c.type_code === "ally") {
        s.alliesPlayed++;
        enterAlly(s, u, false, true);
      } else if (c.type_code === "attachment") {
        get(s, action.target)!.attachments.push({
          id: u.id,
          code: u.code,
          exhausted: false,
          ...(s.table ? { owner: activeSeat(s) } : {}),
        });
      } else {
        s.discard.push(u.code);
        eventEffect(s, u.code, action.target, effectiveCost);
      }
      break;
    }
    case "ABILITY": {
      requireRule(s.phase !== "setup", "Wait for an action window.");
      const u = get(s, action.id);
      requireRule(
        u &&
          (action.attachmentId
            ? u.attachments.some(
                (a) =>
                  a.id === action.attachmentId &&
                  attachmentController(s, u, a) === activeSeat(s),
              )
            : characters(s).some((x) => x.id === u.id) || u.code === "01007"),
        "Choose a character or attachment you control.",
      );
      useAbility(s, u, action.attachmentId);
      break;
    }
    case "CLAIM": {
      requireRule(s.phase !== "setup", "Wait for an action window.");
      const objective = s.staging.find((u) => u.id === action.id);
      const hero = s.heroes.find((h) => h.id === action.heroId);
      requireRule(
        objective && objectiveFree(s, objective) && hero,
        "Choose an unguarded objective and a free hero.",
      );
      s.threat += 2;
      s.staging = s.staging.filter((u) => u.id !== objective.id);
      hero.attachments.push({
        id: objective.id,
        code: objective.code,
        exhausted: false,
      });
      log(
        s,
        `${name(hero)} claims ${name(objective)}. Threat rises by 2.`,
        "good",
      );
      if (s.captiveMendor) {
        const m = s.captiveMendor;
        s.captiveMendor = null;
        m.damage = 1;
        s.allies.push(m);
        log(s, "Mendor is rescued with 1 damage.", "good");
      }
      break;
    }
    case "TRAVEL": {
      requireRule(
        s.phase === "travel" && !s.activeLocation,
        "You may travel only when there is no active location.",
      );
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "location",
      );
      requireRule(u, "Choose a location in staging.");
      requireRule(
        u.code === "01088" || !s.staging.some((x) => x.code === "01088"),
        "You must travel to The East Bight.",
      );
      if (u.code === "01077")
        requireRule(
          livingSeats(s).every((i) =>
            seatView(s, i).heroes.some((h) => !h.exhausted),
          ),
          "Great Forest Web requires a ready hero.",
        );
      if (u.code === "01094")
        requireRule(
          seatView(s, s.table?.first ?? 0).hand.length >= 2,
          "Necromancer’s Pass requires 2 cards to discard.",
        );
      if (u.code === "01078")
        requireRule(
          s.encounterDeck.length > 0,
          "There is no encounter card to reveal for this travel cost.",
        );
      if (u.code === "01077")
        enqueue(
          s,
          ...playerOrder(s).map((player) => fx("travelExhaust", { player })),
        );
      if (u.code === "01094")
        enqueue(s, fx("payPass", { player: s.table?.first ?? 0 }));
      if (u.code === "01078")
        enqueue(s, fx("reveal", { player: s.table?.first ?? 0 }));
      enqueue(
        s,
        fx("travelEnter", { target: u.id, player: s.table?.first ?? 0 }),
      );
      break;
    }
    case "ENGAGE": {
      requireRule(
        !s.table || activeSeat(s) === s.table.turn,
        "Wait for this fellowship’s engagement turn.",
      );
      requireRule(
        s.phase === "encounter" && !s.optionalEngagement,
        "You may optionally engage one enemy per round.",
      );
      const u = s.staging.find(
        (x) => x.id === action.id && card(x.code).type_code === "enemy",
      );
      requireRule(u, "Choose an enemy in staging.");
      requireRule(
        u.code !== "01083" ||
          !s.staging.some(
            (e) => e.id !== u.id && card(e.code).type_code === "enemy",
          ),
        "Goblin Sniper cannot be optionally engaged while another enemy is in staging.",
      );
      s.optionalEngagement = true;
      engage(s, u);
      break;
    }
    case "DEFEND": {
      requireRule(
        s.phase === "defense" && !s.combat,
        "Resolve attacks one at a time.",
      );
      const enemy = s.engaged.find(
        (u) =>
          u.id === action.enemyId &&
          !u.attacked &&
          !u.feinted &&
          !has(u, "01069"),
      );
      requireRule(enemy, "This enemy cannot attack again.");
      beginEnemyAttack(
        s,
        enemy,
        action.defenderIds ?? (action.defenderId ? [action.defenderId] : []),
      );
      break;
    }
    case "ATTACK": {
      requireRule(
        !s.table || activeSeat(s) === s.table.turn,
        "Wait for this fellowship’s attack turn.",
      );
      requireRule(s.phase === "attack", "Enemies must finish attacking first.");
      const enemy = [
        ...allEngaged(s),
        ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
      ].find(
        (u) =>
          u.id === action.enemyId &&
          (s.table ? !u.attackedBy?.includes(activeSeat(s)) : !u.attacked),
      );
      requireRule(enemy, "You may attack each enemy once per round.");
      playerAttack(s, enemy, action.attackerIds, true);
      break;
    }
    case "END_ATTACKS":
      requireRule(s.phase === "attack", "Finish enemy attacks first.");
      if (!passSeat(s)) break;
      enqueue(s, fx("phaseEnd"), fx("endCombat"));
      break;
    default:
      throw new RuleError("Unknown action.");
  }
  if (before) {
    if (!s.queue.length) check(s);
    recordObservation(s, before, observation(s)!, action);
  }
  flush(s);
  if (!s.flow?.pending) check(s);
  syncSeat(s);
  return s;
}

export function score(s: GameState) {
  return (
    (s.round - 1) * 10 +
    seatIndices(s).reduce((n, i) => {
      const p = seatView(s, i);
      return (
        n +
        p.threat +
        p.fallenThreat +
        p.heroes.reduce((n, h) => n + h.damage, 0)
      );
    }, 0) -
    s.victory
  );
}
export function publicState(s: GameState) {
  return {
    awaitingConfirmation: !!s.flow?.pending,
    resolution: s.flow?.pending ?? null,
    recentEvents: s.flow?.history.slice(-8) ?? [],
    mode: s.status,
    table: s.table
      ? {
          active: s.table.active,
          first: s.table.first,
          turn: s.table.turn,
          seats: seatIndices(s).map((i) => {
            const p = seatView(s, i);
            return {
              name: seatName(s, i),
              hero: p.startingHeroes[0],
              startingHeroes: p.startingHeroes,
              deckId: p.deckId,
              eliminated: s.table!.seats[i].eliminated,
              threat: p.threat,
              hand: p.hand.map((u) => ({ id: u.id, code: u.code })),
              deckCount: p.deck.length,
              heroes: p.heroes,
              allies: p.allies,
              engaged: p.engaged.map(
                ({ shadows, facedownCard: _facedown, ...u }) => ({
                  ...u,
                  shadowCount: shadows.length,
                }),
              ),
              passed: s.table!.passed.includes(i),
            };
          }),
        }
      : null,
    playMode: s.playMode,
    scenario: s.scenarioId,
    campaign: s.campaign,
    prisoner: s.prisoner ? name(s.prisoner) : null,
    captiveMendor: !!s.captiveMendor,
    objectives: s.staging
      .filter((u) => OBJECTIVES.includes(u.code))
      .map((u) => ({ id: u.id, name: name(u), free: objectiveFree(s, u) })),
    deck: s.deckId,
    peek: s.peek ? card(s.peek).name : null,
    round: s.round,
    phase: s.phase,
    threat: s.threat,
    quest: { ...stageInfo(s), stage: s.stage, progress: s.progress },
    heroes: s.heroes.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    allies: s.allies.map((u) => ({ ...u, name: name(u), stats: stats(s, u) })),
    hand: s.hand.map((u) => ({
      id: u.id,
      code: u.code,
      name: name(u),
      playable: canPlay(s, u) === null,
    })),
    deckCount: s.deck.length,
    encounterCount: s.encounterDeck.length,
    pendingWolfReturns: s.pendingWolfReturns?.length ?? 0,
    staging: s.staging.map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      threat: threatOf(s, u),
      progress: u.progress,
    })),
    engaged: s.engaged.map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      damage: u.damage,
      attacked: u.attacked,
    })),
    activeLocation: s.activeLocation
      ? {
          name: name(s.activeLocation),
          progress: s.activeLocation.progress,
          quest: card(s.activeLocation.code).quest,
        }
      : null,
    willpower: questWill(s),
    stagingThreat: stagingThreat(s),
    choice: s.choice
      ? {
          title: s.choice.title,
          options: s.choice.options.map((o) => ({ id: o.id, label: o.label })),
        }
      : null,
    lastQuest: s.lastQuest,
    lastLog: s.log.slice(-5),
    coordinateSystem:
      "DOM card table; origin top-left, x right, y down. No spatial movement.",
  };
}
export function validateSave(value: unknown): value is GameState {
  try {
    if (!value || typeof value !== "object") return false;
    const s = value as GameState;
    if (!validFlow(s.flow)) return false;
    const integer = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && Number.isFinite(n);
    const codes = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.every((c) => typeof c === "string" && SCRIPTED.has(c));
    const validUnit = (u: Unit) =>
      u &&
      typeof u.id === "string" &&
      (u.owner === undefined ||
        (integer(u.owner) && u.owner >= 0 && u.owner <= 3)) &&
      (u.attackedBy === undefined ||
        (Array.isArray(u.attackedBy) &&
          u.attackedBy.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      (u.preventedAttacks === undefined ||
        (Array.isArray(u.preventedAttacks) &&
          new Set(u.preventedAttacks).size === u.preventedAttacks.length &&
          u.preventedAttacks.every((i) => integer(i) && i >= 0 && i <= 3))) &&
      [u.tempWill, u.tempAttack, u.tempDefense, u.tempThreat].every(
        (n) => n === undefined || integer(n),
      ) &&
      SCRIPTED.has(u.code) &&
      [u.damage, u.progress, u.resources, u.boost].every(integer) &&
      u.damage >= 0 &&
      u.progress >= 0 &&
      u.resources >= 0 &&
      typeof u.exhausted === "boolean" &&
      typeof u.committed === "boolean" &&
      typeof u.attacked === "boolean" &&
      Array.isArray(u.attachments) &&
      u.attachments.every(
        (a) =>
          typeof a.id === "string" &&
          SCRIPTED.has(a.code) &&
          typeof a.exhausted === "boolean" &&
          (a.owner === undefined ||
            (integer(a.owner) && a.owner >= 0 && a.owner <= 3)),
      ) &&
      codes(u.shadows) &&
      (u.guarding === undefined || typeof u.guarding === "string") &&
      (u.facedownCard === undefined ||
        (SCRIPTED.has(u.facedownCard) &&
          card(u.facedownCard).sphere_code !== "encounter"));
    if (
      s.version !== 2 ||
      (s.fog !== undefined && (!integer(s.fog) || s.fog < 0)) ||
      (s.pendingWolfReturns !== undefined &&
        (!Array.isArray(s.pendingWolfReturns) ||
          !s.pendingWolfReturns.every((code) => code === "01081"))) ||
      (!STARTERS.some((d) => d.id === s.deckId) && s.deckId !== "custom") ||
      !Array.isArray(s.used) ||
      !s.used.every((x) => typeof x === "string") ||
      typeof s.standTogether !== "boolean"
    )
      return false;
    if (
      !SCENARIOS.some((q) => q.id === s.scenarioId) ||
      !["normal", "campaign"].includes(s.playMode) ||
      !codes(s.startingHeroes) ||
      s.startingHeroes.length < 1 ||
      s.startingHeroes.length > 3 ||
      !s.startingHeroes.every((c) => card(c).type_code === "hero") ||
      ![s.alliesPlayed, s.threatModifier, s.shackles].every(integer) ||
      s.alliesPlayed < 0 ||
      s.shackles < 0 ||
      ![
        s.nazgulDefeated,
        s.stageRevealing,
        s.mendorBoost,
        s.campaignScarred,
        s.includeSupport,
      ].every((x) => typeof x === "boolean") ||
      (s.prisoner !== null &&
        (!validUnit(s.prisoner) ||
          card(s.prisoner.code).type_code !== "hero")) ||
      (s.captiveMendor !== null &&
        (!validUnit(s.captiveMendor) || s.captiveMendor.code !== "rc135")) ||
      !Array.isArray(s.suspendedCombats) ||
      !s.suspendedCombats.every(
        (c) => c && typeof c.enemyId === "string" && integer(c.attackBonus),
      )
    )
      return false;
    if (s.playMode === "normal" && s.campaign !== null) return false;
    if (s.playMode === "campaign") {
      const c = s.campaign;
      if (
        !c ||
        !codes(c.heroes) ||
        c.heroes.length < 1 ||
        c.heroes.length > (s.table ? 12 : 3) ||
        new Set(c.heroes).size !== c.heroes.length ||
        !c.heroes.every((h) => card(h).type_code === "hero") ||
        !codes(c.fallen) ||
        !c.fallen.every((h) => card(h).type_code === "hero") ||
        !integer(c.threatPenalty) ||
        c.threatPenalty < 0 ||
        !codes(c.boons) ||
        !c.boons.every((x) => ["rc132", "rc133", "rc135"].includes(x)) ||
        !codes(c.burdens) ||
        !c.burdens.every((x) => ["rc136", "rc137", "rc138"].includes(x)) ||
        !c.permanent ||
        typeof c.permanent !== "object" ||
        Array.isArray(c.permanent) ||
        !Object.entries(c.permanent).every(
          ([h, cs]) =>
            card(h).type_code === "hero" &&
            codes(cs) &&
            cs.every((x) => ["rc133", "rc138"].includes(x)),
        ) ||
        (c.prisoner !== null &&
          (!SCRIPTED.has(c.prisoner) ||
            card(c.prisoner).type_code !== "hero")) ||
        typeof c.mendorSaved !== "boolean" ||
        !Array.isArray(c.completed) ||
        c.completed.length > 3 ||
        !c.completed.every(
          (q, i) =>
            q.scenarioId === SCENARIOS[i].id &&
            integer(q.score) &&
            integer(q.rounds) &&
            q.rounds >= 0,
        )
      )
        return false;
    }
    if (
      s.campaign &&
      s.campaign.completed.length !==
        SCENARIOS.findIndex((q) => q.id === s.scenarioId) +
          (s.status === "won" ? 1 : 0)
    )
      return false;
    if (
      ![
        "setup",
        "planning",
        "quest",
        "staging",
        "travel",
        "encounter",
        "defense",
        "attack",
        "refresh",
      ].includes(s.phase) ||
      !["playing", "won", "lost"].includes(s.status)
    )
      return false;
    if (
      ![
        s.seed,
        s.originalSeed,
        s.round,
        s.nextId,
        s.threat,
        s.progress,
        s.victory,
        s.fallenThreat,
        s.questDebuff,
        s.faramir,
      ].every(integer) ||
      s.round < 0 ||
      s.threat < 0 ||
      s.nextId < 1 ||
      ![1, 2, 3].includes(s.stage) ||
      !["unknown", "beorn", "spider"].includes(s.branch)
    )
      return false;
    if (
      ![
        s.deck,
        s.discard,
        s.removed,
        s.encounterDeck,
        s.encounterDiscard,
      ].every(codes)
    )
      return false;
    if (
      ![s.heroes, s.allies, s.hand, s.staging, s.engaged].every(
        (a) => Array.isArray(a) && a.every(validUnit),
      ) ||
      (s.activeLocation !== null && !validUnit(s.activeLocation))
    )
      return false;
    if (
      !s.heroes.every((u) => card(u.code).type_code === "hero") ||
      !s.allies.every((u) => card(u.code).type_code === "ally") ||
      !s.engaged.every((u) => card(u.code).type_code === "enemy")
    )
      return false;
    if (
      !Array.isArray(s.committedIds) ||
      !s.committedIds.every((x) => typeof x === "string") ||
      ![s.eowynUsed, s.mulled, s.optionalEngagement, s.gondor].every(
        (b) => typeof b === "boolean",
      )
    )
      return false;
    const validEffect = (e: Effect) =>
      e && typeof e.kind === "string" && (!e.code || SCRIPTED.has(e.code));
    if (!Array.isArray(s.queue) || !s.queue.every(validEffect)) return false;
    if (
      s.choice !== null &&
      (!s.choice ||
        typeof s.choice.title !== "string" ||
        !Array.isArray(s.choice.options) ||
        !s.choice.options.length ||
        !s.choice.options.every(
          (o) =>
            typeof o.id === "string" &&
            typeof o.label === "string" &&
            (!o.code || SCRIPTED.has(o.code)) &&
            Array.isArray(o.effects) &&
            o.effects.every(validEffect),
        ))
    )
      return false;
    if (
      !Array.isArray(s.log) ||
      !s.log.every(
        (l) =>
          integer(l.id) &&
          integer(l.round) &&
          typeof l.text === "string" &&
          ["normal", "good", "danger", "chapter"].includes(l.kind),
      )
    )
      return false;
    if (
      s.combat !== null &&
      (!s.combat ||
        typeof s.combat.enemyId !== "string" ||
        !integer(s.combat.attackBonus))
    )
      return false;
    if (
      (s.lastReveal !== null && !SCRIPTED.has(s.lastReveal)) ||
      (s.peek !== null && !SCRIPTED.has(s.peek))
    )
      return false;
    if (s.table) {
      const t = s.table;
      if (
        !Array.isArray(t.seats) ||
        t.seats.length < 1 ||
        t.seats.length > 4 ||
        ![t.active, t.first, t.turn].every(
          (i) => integer(i) && i >= 0 && i < t.seats.length,
        ) ||
        !Array.isArray(t.passed) ||
        !t.passed.every((i) => integer(i) && i >= 0 && i < t.seats.length) ||
        new Set(t.passed).size !== t.passed.length
      )
        return false;
      if (
        new Set(t.seats.flatMap((p) => p.startingHeroes)).size !==
        t.seats.flatMap((p) => p.startingHeroes).length
      )
        return false;
      for (const p of t.seats) {
        if (
          typeof p.eliminated !== "boolean" ||
          p.startingHeroes.length < 1 ||
          p.startingHeroes.length > 3 ||
          !validateSave({
            ...s,
            ...p,
            table: undefined,
            playMode: "normal",
            campaign: null,
          })
        )
          return false;
      }
      if (
        s.campaign?.seatPenalties &&
        (s.campaign.seatPenalties.length !== t.seats.length ||
          !s.campaign.seatPenalties.every((n) => integer(n) && n >= 0))
      )
        return false;
      const effects = [
        ...s.queue,
        ...(s.choice?.options.flatMap((o) => o.effects) ?? []),
      ];
      if (
        effects.some(
          (e) =>
            e.player !== undefined &&
            (!integer(e.player) || e.player < 0 || e.player >= t.seats.length),
        )
      )
        return false;
    }
    if (
      s.table &&
      units(s).some(
        (u) =>
          (u.owner !== undefined && u.owner >= s.table!.seats.length) ||
          u.preventedAttacks?.some((i) => i >= s.table!.seats.length) ||
          u.attachments.some(
            (a) => a.owner !== undefined && a.owner >= s.table!.seats.length,
          ),
      )
    )
      return false;
    const ids = [
      ...units(s),
      ...seatIndices(s).flatMap((i) => seatView(s, i).hand),
      ...(s.prisoner ? [s.prisoner] : []),
      ...(s.captiveMendor ? [s.captiveMendor] : []),
    ].map((u) => u.id);
    return new Set(ids).size === ids.length;
  } catch {
    return false;
  }
}

function playerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  regular = false,
) {
  ids = [...new Set(ids)];
  requireRule(ids.length > 0, "Choose at least one attacker.");
  const attackers = ids.map((id) =>
    attackersFor(s, enemy).find((u) => u.id === id),
  );
  requireRule(
    attackers.every(Boolean),
    "All attackers must be ready characters.",
  );
  requireRule(
    attackers.some((u) => u && ownerOf(s, u) === activeSeat(s)),
    "Declare an attack with at least one character you control.",
  );
  const staging = s.staging.some((u) => u.id === enemy.id);
  requireRule(
    !staging || (attackers.length === 1 && attackers[0]!.code === "01009"),
    "Only Dúnhere can attack a staging enemy, and he must attack alone.",
  );
  attackers.forEach((u) => {
    u!.exhausted = true;
  });
  if (regular) {
    enemy.attacked = true;
    if (s.table)
      enemy.attackedBy = [...(enemy.attackedBy ?? []), activeSeat(s)];
  }
  prepend(
    s,
    ...attackers
      .filter((u) =>
        u!.attachments.some((a) => a.code === "rc133" && !a.exhausted),
      )
      .map((u) => fx("valorResponse", { target: u!.id, source: enemy.id })),
    fx("resolvePlayerAttack", {
      target: enemy.id,
      ids,
      value: staging ? 1 : 0,
    }),
  );
}
function resolvePlayerAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  stagingBonus: number,
) {
  const attackers = ids.map((id) => get(s, id)).filter((u): u is Unit => !!u);
  const power =
    attackers.reduce(
      (n, u) =>
        n +
        stats(s, u!).attack +
        (card(enemy.code).traits?.includes("Orc")
          ? u!.attachments.filter((a) => a.code === "01039").length
          : 0),
      0,
    ) + stagingBonus;
  const defense = stats(s, enemy).defense;
  const amount = Math.max(0, power - defense);
  log(
    s,
    `${attackers.map((u) => name(u!)).join(" + ")} attack ${name(enemy)}: ${power} attack − ${defense} defense = ${amount} damage.`,
  );
  const killed = enemy.damage + amount >= stats(s, enemy).health;
  damage(s, enemy.id, amount);
  if (killed && s.status === "playing") {
    const responses = attackers.flatMap((u) => [
      ...(u.code === "01005" ? [`01005:${u.id}`] : []),
      ...u.attachments
        .filter((a) => a.code === "01039")
        .map((a) => `01039:${a.id}`),
    ]);
    if (responses.length)
      prepend(
        s,
        fx("attackProgress", { ids: responses, player: s.table?.first ?? 0 }),
      );
  }
}
function eventEffect(s: GameState, code: string, target?: string, cost = 0) {
  const u = get(s, target);
  switch (code) {
    case "rc132":
      s.mendorBoost = true;
      break;
    case "01020":
      if (u) u.exhausted = false;
      break;
    case "01021":
      if (u) {
        u.exhausted = true;
        choose(
          s,
          "Common Cause",
          opts(
            allHeroes(s).filter((h) => h.id !== u.id && h.exhausted),
            (h) => [fx("ready", { target: h.id })],
          ),
        );
      }
      break;
    case "01022":
      for (const x of allCharacters(s)) {
        x.tempAttack = (x.tempAttack ?? 0) + 1;
        if (hasGondor(x)) x.tempDefense = (x.tempDefense ?? 0) + 1;
      }
      break;
    case "01023":
      choose(
        s,
        "Sneak Attack",
        opts(
          s.hand.filter(
            (a) =>
              card(a.code).type_code === "ally" &&
              (!card(a.code).is_unique ||
                !allCharacters(s).some((x) => x.code === a.code)),
          ),
          (a) => [fx("sneak", { target: a.id })],
        ),
        "Put an ally into play. It returns to your hand at the end of this phase.",
      );
      break;
    case "01025":
      allCharacters(s).forEach((u) => {
        u.exhausted = false;
      });
      break;
    case "01032":
      if (u) {
        u.tempAttack = (u.tempAttack ?? 0) + 1;
        u.tempDefense = (u.tempDefense ?? 0) + 1;
      }
      break;
    case "01033":
      if (u) {
        u.exhausted = true;
        choosePlayer(s, "Rain of Arrows · Choose a fellowship", [
          fx("rainOfArrows"),
        ]);
      }
      break;
    case "01034":
      if (u) {
        u.preventedAttacks = [
          ...new Set([...(u.preventedAttacks ?? []), ownerOf(s, u)]),
        ];
        u.feinted = true;
      }
      if (
        !s.table &&
        s.phase === "defense" &&
        s.engaged.every((e) => e.attacked || e.feinted || has(e, "01069"))
      ) {
        s.phase = "attack";
        s.engaged.forEach((e) => {
          e.attacked = false;
        });
      }
      break;
    case "01035":
      if (u)
        choose(
          s,
          "Quick Strike",
          opts(
            [
              ...allEngaged(s),
              ...s.staging.filter((e) => card(e.code).type_code === "enemy"),
            ].filter((enemy) =>
              attackersFor(s, enemy).some((a) => a.id === u.id),
            ),
            (enemy) => [fx("quickAttack", { target: enemy.id, source: u.id })],
          ),
          "Immediately attack with the chosen character.",
        );
      break;
    case "01036":
      choosePlayer(s, "Thicket of Spears · Choose a fellowship", [
        fx("thicket"),
      ]);
      break;
    case "01038":
      choosePlayer(s, "Stand Together · Choose a fellowship", [
        fx("standTogether"),
      ]);
      log(
        s,
        "Stand Together allows multiple defenders for each attack this phase.",
      );
      break;
    case "01046":
      if (s.table)
        choose(s, "The Galadhrim’s Greeting", [
          ...playerOrder(s).map((player) => ({
            id: `player-${player}`,
            label: `Reduce ${seatName(s, player)}’s threat by 6`,
            effects: [fx("threat", { value: -6, player })],
          })),
          {
            id: "everyone",
            label: "Reduce every fellowship’s threat by 2",
            effects: playerOrder(s).map((player) =>
              fx("threat", { value: -2, player }),
            ),
          },
        ]);
      else s.threat = Math.max(0, s.threat - 6);
      break;
    case "01049":
      s.discard.splice(s.discard.lastIndexOf(code), 1);
      s.removed.push(code);
      choosePlayer(s, "Will of the West · Choose a fellowship", [
        fx("reshufflePlayer"),
      ]);
      break;
    case "01051": {
      const t = discardTarget(s, target!);
      const ally = seatView(s, t.player).discard.splice(t.index, 1)[0];
      const fresh = make(s, ally);
      if (s.table) fresh.owner = t.player;
      enterAlly(s, fresh);
      break;
    }
    case "01052":
      if (u) {
        if (u.facedownCard) {
          const controller = ownerOf(s, u);
          forOwner(s, controller, () => {
            s.engaged = s.engaged.filter((e) => e.id !== u.id);
          });
          seatView(s, u.owner ?? controller).discard.push(u.facedownCard);
          s.encounterDiscard.push(...u.shadows);
          for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
          log(
            s,
            "The Orc Guard returns to its owner's discard pile instead of staging.",
          );
          break;
        }
        forOwner(s, ownerOf(s, u), () => {
          s.engaged = s.engaged.filter((e) => e.id !== u.id);
        });
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        u.attacked = false;
        s.staging.push(u);
        if (
          !s.table &&
          s.phase === "defense" &&
          s.engaged.every((e) => e.attacked || e.feinted || has(e, "01069"))
        ) {
          s.phase = "attack";
          s.engaged.forEach((e) => {
            e.attacked = false;
          });
        }
      }
      break;
    case "01053": {
      const t = discardTarget(s, target!);
      s.hand.push(make(s, s.discard.splice(t.index, 1)[0]));
      break;
    }
    case "01054": {
      const t = discardTarget(s, target!);
      forOwner(s, t.player, () => {
        const code = s.discard.splice(t.index, 1)[0];
        s.heroes.push(make(s, code));
        s.fallenThreat -= card(code).threat ?? 0;
      });
      break;
    }
    case "01063":
      if (u) u.damage = 0;
      break;
    case "01064":
      choosePlayer(s, "Lórien’s Wealth · Who draws 3 cards?", [
        fx("draw", { value: 3 }),
      ]);
      break;
    case "01065":
    case "01066":
      if (u) u.suppressed = true;
      break;
    case "01067":
      if (s.table)
        choose(
          s,
          "Gandalf’s Search · Choose a deck",
          playerOrder(s)
            .filter((i) => seatView(s, i).deck.length >= cost)
            .map((player) => ({
              id: `player-${player}`,
              label: seatName(s, player),
              effects: [fx("searchPlayer", { value: cost, player })],
            })),
        );
      else prepend(s, fx("searchPlayer", { value: cost }));
      break;
    case "01068":
      choosePlayer(s, "Beorn’s Hospitality · Choose a fellowship", [
        fx("hospitality"),
      ]);
      break;
    default:
      throw new RuleError("This event is a triggered response.");
  }
}
function choosePlayer(s: GameState, title: string, effects: Effect[]) {
  if (!s.table) {
    prepend(s, ...effects);
    return;
  }
  choose(
    s,
    title,
    playerOrder(s).map((player) => ({
      id: `player-${player}`,
      label: seatName(s, player),
      effects: effects.map((e) => ({ ...e, player })),
    })),
  );
}
function useAbility(s: GameState, u: Unit, attachmentId?: string) {
  if (attachmentId) {
    const a = u.attachments.find((a) => a.id === attachmentId);
    requireRule(a && !a.exhausted, "This attachment is exhausted.");
    switch (a.code) {
      case "01026":
        a.exhausted = true;
        u.resources += 2;
        log(s, `Steward of Gondor gives ${name(u)} 2 resources.`, "good");
        return;
      case "01057":
        requireRule(u.exhausted, "This hero is already ready.");
        a.exhausted = true;
        u.exhausted = false;
        return;
      case "01072":
        requireRule(u.damage > 0, "This character has no damage.");
        a.exhausted = true;
        u.damage = Math.max(0, u.damage - 2);
        return;
      case "01070": {
        const key = `protector:${a.id}`;
        requireRule(
          s.used.filter((k) => k === key).length < 3 && s.hand.length > 0,
          "Protector of Lórien can be used 3 times per phase and requires a card to discard.",
        );
        choose(
          s,
          "Protector of Lórien",
          s.hand.flatMap((h) => [
            {
              id: `${h.id}-will`,
              label: `Discard ${name(h)} · +1 willpower`,
              code: h.code,
              effects: [
                fx("protector", {
                  target: u.id,
                  source: h.id,
                  text: key,
                  flag: true,
                }),
              ],
            },
            {
              id: `${h.id}-defense`,
              label: `Discard ${name(h)} · +1 defense`,
              code: h.code,
              effects: [
                fx("protector", { target: u.id, source: h.id, text: key }),
              ],
            },
          ]),
        );
        return;
      }
      case "01071":
        requireRule(
          s.phase === "defense" &&
            s.engaged.some((e) => e.shadows.length && !e.attacked),
          "Use Dark Knowledge after shadow cards are dealt.",
        );
        choose(
          s,
          "Dark Knowledge",
          s.engaged
            .filter((e) => !e.attacked)
            .flatMap((e) =>
              e.shadows.map((code, i) => ({
                id: `${e.id}-${i}`,
                label: `${name(e)} · shadow ${i + 1}`,
                effects: [
                  fx("exhaustAttachment", { target: u.id, source: a.id }),
                  fx("peek", { code }),
                ],
              })),
            ),
        );
        return;
      default:
        throw new RuleError("This attachment has a passive ability.");
    }
  }
  switch (u.code) {
    case "01007":
      requireRule(
        !s.eowynUsed && s.hand.length > 0,
        "Éowyn requires a card to discard and can act once per round.",
      );
      choose(
        s,
        "Éowyn · Strength of spirit",
        s.hand.map((h) => ({
          id: h.id,
          label: name(h),
          code: h.code,
          effects: [fx("eowynDiscard", { target: h.id })],
        })),
        "Discard a card to gain +1 willpower until the end of this phase.",
      );
      break;
    case "01014":
      requireRule(!u.exhausted, "Faramir is exhausted.");
      u.exhausted = true;
      choosePlayer(s, "Faramir · Choose a fellowship", [fx("faramir")]);
      log(
        s,
        "Faramir grants the chosen fellowship +1 willpower this phase.",
        "good",
      );
      break;
    case "01010":
    case "01060": {
      requireRule(!u.exhausted, "This character is exhausted.");
      requireRule(s.encounterDeck.length, "The encounter deck is empty.");
      u.exhausted = true;
      const code = s.encounterDeck[0];
      s.peek = code;
      choose(
        s,
        `${name(u)} sees ${card(code).name}`,
        [
          { id: "keep", label: "Leave it on top", code, effects: [] },
          ...(u.code === "01010"
            ? [
                {
                  id: "bottom",
                  label: "Move it to the bottom",
                  code,
                  effects: [fx("encounterBottom")],
                },
              ]
            : []),
        ],
        plain(card(code).text),
      );
      break;
    }
    case "01011":
      requireRule(
        allCharacters(s).some((h) => h.damage > 0),
        "There is no damaged character to heal.",
      );
      requireRule(
        !s.used.includes(u.id) && u.resources >= 1,
        "Glorfindel can heal once per round for 1 of his resources.",
      );
      choose(
        s,
        "Glorfindel · Healing touch",
        opts(
          allCharacters(s).filter((h) => h.damage > 0),
          (h) => [
            fx("resource", { target: u.id, value: -1 }),
            fx("heal", { target: h.id, value: 1 }),
            fx("used", { text: u.id }),
          ],
        ),
        "Pay 1 resource from Glorfindel to heal 1 damage.",
      );
      break;
    case "01012":
      requireRule(
        !u.exhausted && !s.used.includes(u.id),
        "Beravor can act once per round and must be ready.",
      );
      requireRule(
        s.activeLocation?.code !== "01095" &&
          livingSeats(s).some((i) => seatView(s, i).deck.length > 0),
        "You cannot draw cards now.",
      );
      u.exhausted = true;
      s.used.push(u.id);
      choosePlayer(s, "Beravor · Who draws 2 cards?", [
        fx("draw", { value: 2 }),
      ]);
      break;
    case "01031":
      requireRule(
        !s.used.includes(u.id),
        "Beorn can use this action once per round.",
      );
      u.tempAttack = (u.tempAttack ?? 0) + 5;
      u.beornReturn = true;
      s.used.push(u.id);
      log(
        s,
        "Beorn gains +5 attack and will return to the deck at phase end.",
        "good",
      );
      break;
    case "01058":
      requireRule(!u.exhausted, "Daughter of the Nimrodel is exhausted.");
      requireRule(
        allHeroes(s).some((h) => h.damage > 0),
        "There is no damaged hero to heal.",
      );
      choose(
        s,
        "Daughter of the Nimrodel",
        opts(
          allHeroes(s).filter((h) => h.damage > 0),
          (h) => [
            fx("exhaust", { target: u.id }),
            fx("heal", { target: h.id, value: 2 }),
          ],
        ),
        "Exhaust to heal up to 2 damage from a hero.",
      );
      break;
    case "01062":
      requireRule(!u.exhausted, "Gléowine is exhausted.");
      requireRule(
        s.activeLocation?.code !== "01095" &&
          livingSeats(s).some((i) => seatView(s, i).deck.length > 0),
        "You cannot draw cards now.",
      );
      u.exhausted = true;
      choosePlayer(s, "Gléowine · Who draws a card?", [
        fx("draw", { value: 1 }),
      ]);
      break;
    case "01043":
      requireRule(
        !s.used.includes(`took:${u.id}`),
        "Wandering Took can transfer once per round.",
      );
      requireRule(
        s.threat >= 3,
        "Wandering Took requires at least 3 threat to transfer.",
      );
      requireRule(
        livingSeats(s).length > 1,
        "Wandering Took needs another player.",
      );
      choose(
        s,
        "Wandering Took · Choose a new controller",
        livingSeats(s)
          .filter((i) => i !== activeSeat(s))
          .map((i) => ({
            id: `player-${i}`,
            label: seatName(s, i),
            effects: [fx("transferTook", { target: u.id, value: i })],
          })),
      );
      break;
    default:
      throw new RuleError(
        u.code === "01043"
          ? "Wandering Took’s transfer ability requires another player."
          : "This character’s ability is passive or triggers automatically.",
      );
  }
}
function extraEffect(s: GameState, e: Effect) {
  const u = get(s, e.target);
  switch (e.kind) {
    case "cancelReplace":
      s.encounterDiscard.push(e.code!);
      prepend(s, fx("reveal", { source: e.source }));
      break;
    case "quickAttack":
      if (u) playerAttack(s, u, [e.source!]);
      break;
    case "heal":
      if (u) u.damage = Math.max(0, u.damage - (e.value ?? 0));
      break;
    case "used":
      s.used.push(e.text!);
      break;
    case "peek":
      s.peek = e.code!;
      choose(
        s,
        `Revealed shadow: ${card(e.code!).name}`,
        [{ id: "continue", label: "Continue", code: e.code, effects: [] }],
        card(e.code!).shadow || "This card has no shadow effect.",
      );
      break;
    case "encounterBottom":
      s.encounterDeck.push(s.encounterDeck.shift()!);
      s.peek = null;
      break;
    case "exhaustAttachment": {
      const a = u?.attachments.find((a) => a.id === e.source);
      if (a) a.exhausted = true;
      break;
    }
    case "protector": {
      const h = s.hand.find((h) => h.id === e.source);
      if (u && h) {
        s.hand = s.hand.filter((x) => x.id !== h.id);
        s.discard.push(h.code);
        s.used.push(e.text!);
        if (e.flag) u.tempWill = (u.tempWill ?? 0) + 1;
        else u.tempDefense = (u.tempDefense ?? 0) + 1;
      }
      break;
    }
    case "valiant": {
      const controller = activeSeat(s);
      const eligible = playerOrder(s).filter((i) => {
        const p = seatView(s, i);
        return (
          p.hand.some((u) => u.code === "01024") &&
          resources(p, "leadership") >= 1
        );
      });
      if (eligible.length)
        choose(
          s,
          "Valiant Sacrifice",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay 1 Leadership${s.table ? " from " + seatName(s, player) : ""} · ${s.table ? seatName(s, controller) + " draws" : "draw"} 2 cards`,
              code: "01024",
              effects: [
                fx("spendEvent", { code: "01024", player }),
                fx("draw", { value: 2, player: controller }),
              ],
            })),
            skip,
          ],
          "An ally has left play. Its controller draws the cards.",
        );
      break;
    }
    case "brok": {
      const brok = s.hand.find((u) => u.code === "01019");
      if (brok && !allCharacters(s).some((u) => u.code === "01019"))
        choose(
          s,
          "Brok Ironfist",
          [
            {
              id: "play",
              label: "Put Brok Ironfist into play",
              code: "01019",
              effects: [fx("freeAlly", { target: brok.id })],
            },
            skip,
          ],
          "A Dwarf hero has left play.",
        );
      break;
    }
    case "freeAlly": {
      const a = s.hand.find((u) => u.id === e.target);
      if (a) {
        s.hand = s.hand.filter((u) => u.id !== a.id);
        enterAlly(s, a);
      }
      break;
    }
    case "swiftStrike": {
      const combat = s.combat;
      const eligible = playerOrder(s).filter((i) => {
        const p = seatView(s, i);
        return (
          p.hand.some((u) => u.code === "01037") && resources(p, "tactics") >= 2
        );
      });
      if (combat?.defenderId && get(s, combat.enemyId) && eligible.length)
        choose(
          s,
          "Swift Strike",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay 2 Tactics${s.table ? " · " + seatName(s, player) : ""} to deal 2 damage`,
              code: "01037",
              effects: [
                fx("spendEvent", { code: "01037", player }),
                fx("damage", { target: combat.enemyId, value: 2 }),
              ],
            })),
            skip,
          ],
          "A defender has been declared.",
        );
      break;
    }
    case "strengthOfWill":
      if (
        u &&
        s.hand.some((h) => h.code === "01047") &&
        characters(s).some(
          (h) => card(h.code).sphere_code === "spirit" && !h.exhausted,
        )
      )
        choose(
          s,
          "Strength of Will",
          [
            ...opts(
              characters(s).filter(
                (h) => card(h.code).sphere_code === "spirit" && !h.exhausted,
              ),
              (h) => [
                fx("spendEvent", { code: "01047" }),
                fx("exhaust", { target: h.id }),
                fx("locationProgress", { target: u.id, value: 2 }),
              ],
            ),
            skip,
          ],
          "Exhaust a Spirit character to place 2 progress on the location.",
        );
      break;
    case "searchTake": {
      s.hand.push(make(s, s.deck.splice(e.value!, 1)[0]));
      const remaining = s.deck.splice(0, (e.count ?? 1) - 1);
      prepend(s, fx("searchOrder", { ids: remaining, value: 0 }));
      break;
    }
    case "searchOrder": {
      const remaining = e.ids ?? [];
      if (!remaining.length) break;
      choose(
        s,
        "Order the remaining cards",
        remaining.map((code, i) => ({
          id: `order${i}`,
          label: card(code).name,
          code,
          effects: [
            fx("searchPlace", {
              code,
              value: e.value ?? 0,
              ids: remaining.filter((_, j) => i !== j),
            }),
          ],
        })),
        `Choose card ${(e.value ?? 0) + 1} from the top.`,
      );
      break;
    }
    case "searchPlace":
      s.deck.splice(e.value ?? 0, 0, e.code!);
      prepend(s, fx("searchOrder", { ids: e.ids, value: (e.value ?? 0) + 1 }));
      break;
    default:
      if (!scenarioEffect(s, e)) throw new Error(`Unknown effect ${e.kind}`);
  }
}

export function newCampaign(
  heroes: string[],
  mendorLegacy = false,
): CampaignState {
  return {
    heroes: [...heroes],
    fallen: [],
    threatPenalty: 0,
    boons: mendorLegacy ? ["rc132", "rc135"] : [],
    burdens: [],
    permanent: {},
    prisoner: null,
    completed: [],
    mendorSaved: false,
  };
}
function resolveCampaign(s: GameState) {
  const c = s.campaign!;
  if (c.completed.some((q) => q.scenarioId === s.scenarioId)) return;
  const fallen = seatIndices(s).flatMap((i) => {
    const p = seatView(s, i);
    return p.startingHeroes.filter((code) => p.discard.includes(code));
  });
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) delete c.permanent[code];
  if (s.scenarioId === "mirkwood") {
    if (!c.boons.includes("rc132")) c.boons.push("rc132");
    c.burdens.push(s.branch === "beorn" ? "rc136" : "rc137");
  }
  if (s.scenarioId === "anduin") {
    for (const h of allHeroes(s)) {
      const permanent = h.attachments
        .filter((a) => ["rc133", "rc138"].includes(a.code))
        .map((a) => a.code);
      if (permanent.length) c.permanent[h.code] = permanent;
    }
    const highest = Math.max(...allHeroes(s).map((h) => h.damage));
    const candidates = allHeroes(s).filter((h) => h.damage === highest);
    c.prisoner =
      candidates[Math.floor(random(s) * candidates.length)]?.code ?? null;
    log(
      s,
      `${c.prisoner ? card(c.prisoner).name : "A hero"} will be the prisoner in Dol Guldur.`,
    );
  }
  c.boons = c.boons.filter((code) => code !== "rc133");
  c.burdens = c.burdens.filter((code) => code !== "rc138");
  for (const codes of Object.values(c.permanent))
    for (const code of codes)
      (code === "rc133" ? c.boons : c.burdens).push(code);
  if (s.scenarioId === "dol-guldur") {
    c.mendorSaved = allCharacters(s).some((a) => a.code === "rc135");
    if (c.mendorSaved && !c.boons.includes("rc135")) c.boons.push("rc135");
  }
  c.completed.push({
    scenarioId: s.scenarioId,
    score: score(s),
    rounds: s.round,
  });
  log(s, "The campaign log has been updated.", "good");
}
export function continueCampaign(
  s: GameState,
  heroes = s.campaign?.heroes ?? [],
  deckId = s.deckId,
  includeSupport = true,
  seed = Date.now(),
  seatDeckIds?: string[],
): GameState {
  requireRule(
    s.status === "won" && s.campaign && s.campaign.completed.length < 3,
    "Win the current chapter before continuing.",
  );
  const c = structuredClone(s.campaign);
  requireRule(
    heroes.length ===
      (s.table?.seats.flatMap((p) => p.startingHeroes).length ?? 3) &&
      new Set(heroes).size === heroes.length &&
      heroes.every(
        (h) => card(h).type_code === "hero" && !c.fallen.includes(h),
      ),
    "Choose different heroes who have not fallen, keeping each player's hero count.",
  );
  let offset = 0;
  const seats = s.table?.seats.map((p, i) => {
    const next = heroes.slice(offset, offset + p.startingHeroes.length);
    offset += p.startingHeroes.length;
    return {
      heroes: next,
      deckId:
        seatDeckIds?.[i] ??
        (p.startingHeroes.length === 1
          ? STARTERS.find((d) => d.heroes.includes(next[0]))!.id
          : p.deckId),
    };
  });
  const groups = s.table
    ? s.table.seats.map((p, i) => ({
        before: p.startingHeroes,
        after: seats![i].heroes,
      }))
    : [{ before: c.heroes, after: heroes }];
  const replaced = groups.flatMap(({ before, after }) => {
    const removed = before.filter((h) => !after.includes(h));
    requireRule(
      removed.filter((h) => !c.fallen.includes(h)).length <= 1,
      "Between quests, each player may replace fallen heroes and voluntarily change one other hero.",
    );
    return removed;
  });
  const next = SCENARIOS[c.completed.length].id;
  requireRule(
    next !== "dol-guldur" || !c.prisoner || heroes.includes(c.prisoner),
    "The recorded prisoner must remain in this fellowship.",
  );
  c.threatPenalty += replaced.length;
  if (s.table) c.seatPenalties = s.table.seats.map(() => c.threatPenalty);
  c.heroes = [...heroes];
  const d = STARTERS.find((d) => d.id === deckId);
  requireRule(d, "Choose a Core Set starter deck.");
  return createGame(seed, d.cards, seats?.[0].heroes ?? heroes, d.id, {
    ...(seats ? { seats } : {}),
    scenarioId: next,
    playMode: "campaign",
    campaign: c,
    includeSupport,
    guided: !!s.flow,
  });
}
export function retryAdventure(s: GameState, seed = Date.now()): GameState {
  const d = STARTERS.find((d) => d.id === s.deckId);
  requireRule(d, "Choose a starter deck to start again.");
  requireRule(
    s.status !== "won",
    "A won campaign chapter cannot be retried from its resolved log.",
  );
  return createGame(seed, d.cards, s.startingHeroes, d.id, {
    ...(s.table
      ? {
          seats: s.table.seats.map((p) => ({
            heroes: [...p.startingHeroes],
            deckId: p.deckId,
          })),
        }
      : {}),
    scenarioId: s.scenarioId,
    playMode: s.playMode,
    campaign: s.campaign ?? undefined,
    includeSupport: s.includeSupport,
    guided: !!s.flow,
  });
}
function rescuePrisoner(s: GameState) {
  if (!s.prisoner) return;
  const hero = s.prisoner;
  s.prisoner = null;
  hero.damage = 1;
  forOwner(s, hero.owner ?? 0, () => {
    s.heroes.push(hero);
  });
  s.staging.push(make(s, "01102"));
  log(
    s,
    `${name(hero)} is rescued with 1 damage. The Nazgûl enters staging.`,
    "chapter",
  );
}
function orcGuard(s: GameState) {
  const code = s.deck.shift();
  if (!code) return;
  const orc = make(s, "orc-guard");
  orc.facedownCard = code;
  s.engaged.push(orc);
  log(s, "The top card of your deck becomes an engaged Orc Guard.", "danger");
}
function combatDamage(s: GameState, target: Unit, enemy: Unit, amount: number) {
  const killed = target.damage + amount >= stats(s, target).health;
  if (enemy.code === "01082")
    s.threat += Math.max(0, amount - (stats(s, target).health - target.damage));
  damage(s, target.id, amount);
  if (
    killed &&
    enemy.code === "01082" &&
    s.campaign &&
    s.scenarioId === "anduin" &&
    !s.campaignScarred &&
    s.status === "playing"
  ) {
    s.campaignScarred = true;
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("earnPermanent", { code: "rc138", player }),
      ),
    );
  }
}
function beginEnemyAttack(
  s: GameState,
  enemy: Unit,
  ids: string[],
  returnWolf = false,
) {
  requireRule(
    new Set(ids).size === ids.length && (ids.length <= 1 || s.standTogether),
    "Multiple defenders require Stand Together.",
  );
  const defenders = ids.map((id) => defendersFor(s).find((u) => u.id === id));
  requireRule(
    defenders.every(Boolean),
    "Choose ready characters able to defend.",
  );
  requireRule(
    ids.length <= 1 ||
      defenders.every((u) => u && ownerOf(s, u) === activeSeat(s)),
    "Stand Together combines characters controlled by the defending player.",
  );
  // Beastmaster's Forced effect precedes declaration responses (including Spearman).
  if (enemy.code === "01091") {
    const code = encounterDraw(s, true);
    if (code) {
      enemy.shadows.push(code);
      log(
        s,
        "Dol Guldur Beastmaster receives an additional facedown shadow before the defender is declared.",
      );
    }
  }
  for (const d of defenders) d!.exhausted = true;
  s.combat = {
    enemyId: enemy.id,
    defenderId: ids[0] ?? null,
    defenderIds: ids,
    attackBonus: 0,
    returnWolf,
    returnToStaging:
      enemy.code === "01085" &&
      enemy.shadows.some((code) => !card(code).shadow),
  };
  if (enemy.code === "01084") s.threat++;
  for (const d of defenders) if (d!.code === "01029") damage(s, enemy.id, 1);
  if (!get(s, enemy.id)) {
    prepend(s, fx("enemyDone"));
    return;
  }
  prepend(
    s,
    fx("swiftStrike"),
    ...enemy.shadows.map((code) => fx("shadowReveal", { code })),
    fx("enemyDamage"),
    fx("enemyDone"),
  );
}
function scenarioEffect(s: GameState, e: Effect): boolean {
  const u = get(s, e.target);
  switch (e.kind) {
    case "attackProgress": {
      const responses = e.ids ?? [];
      if (!responses.length) break;
      choose(
        s,
        "Victory responses · Choose the next effect",
        [
          ...responses.map((id) => {
            const code = id.split(":")[0],
              value = code === "01005" ? 2 : 1;
            return {
              id,
              code,
              label: `${card(code).name} · Place ${value} progress`,
              effects: [
                fx("questProgress", { value }),
                fx("attackProgress", {
                  ids: responses.filter((x) => x !== id),
                }),
              ],
            };
          }),
          { ...skip, label: "Skip the remaining responses" },
        ],
        "Resolve each response separately. The quest may advance between them.",
      );
      break;
    }
    case "questProgress":
      log(s, `A victory response places ${e.value} progress.`, "good");
      progress(s, e.value ?? 0);
      break;
    case "valorResponse":
      if (u && get(s, e.source))
        choose(s, `Valor: ${name(u)}`, [
          {
            id: "use",
            label: "Exhaust Valor: heal 1 and deal 1 damage",
            effects: [fx("resolveValor", { target: u.id, source: e.source })],
          },
          skip,
        ]);
      break;
    case "resolveValor": {
      const a = u?.attachments.find((a) => a.code === "rc133" && !a.exhausted);
      if (u && a && get(s, e.source)) {
        a.exhausted = true;
        u.damage = Math.max(0, u.damage - 1);
        damage(s, e.source!, 1);
        log(
          s,
          "Valor heals its hero and deals 1 damage to the defending enemy.",
          "good",
        );
      }
      break;
    }
    case "resolvePlayerAttack":
      if (u) resolvePlayerAttack(s, u, e.ids ?? [], e.value ?? 0);
      break;
    case "ensureTroll":
      if (!inPlay(s, "01082")) {
        const i = s.encounterDeck.indexOf("01082");
        if (i >= 0) {
          s.encounterDeck.splice(i, 1);
          s.staging.push(make(s, "01082"));
          shuffle(s, s.encounterDeck);
        }
      }
      break;
    case "stageRevealed":
      s.stageRevealing = false;
      break;
    case "finishQuestPhase":
      allCharacters(s).forEach((u) => (u.committed = false));
      prepend(s, fx("phaseEnd"), fx("startTravel"));
      break;
    case "guardObjective": {
      const code = encounterDraw(s);
      if (u && code) revealed(s, code, u.id);
      break;
    }
    case "appointedByFate":
      choose(
        s,
        "Appointed by Fate",
        opts(allHeroes(s), (h) => [
          fx("attachBoon", { target: h.id, code: "rc134" }),
        ]),
        "This hero collects one extra resource each round. The prisoner’s attachments will be facedown until rescued.",
      );
      break;
    case "attachBoon":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: e.code!,
          exhausted: false,
        });
        log(s, `${card(e.code!).name} is attached to ${name(u)}.`, "good");
      }
      break;
    case "capturePrisoner": {
      const code = s.campaign?.prisoner;
      const hero =
        allHeroes(s).find((h) => h.code === code) ??
        allHeroes(s)[Math.floor(random(s) * allHeroes(s).length)];
      if (hero) {
        forOwner(s, ownerOf(s, hero), () => {
          s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        });
        s.prisoner = hero;
        log(s, `${name(hero)} is the prisoner.`, "danger");
      }
      const m = allCharacters(s).find((a) => a.code === "rc135");
      if (m) {
        forOwner(s, ownerOf(s, m), () => {
          s.allies = s.allies.filter((a) => a.id !== m.id);
        });
        s.captiveMendor = m;
      }
      break;
    }
    case "earnPermanent": {
      const eligible = s.heroes.filter((h) => !has(h, e.code!));
      choose(
        s,
        e.code === "rc133" ? "Earn Valor" : "Scarred by the Hill Troll",
        [
          ...opts(eligible, (h) => [
            fx("attachBoon", { target: h.id, code: e.code }),
          ]),
          ...(e.code === "rc133" ? [skip] : []),
        ],
        "This card remains attached to its hero in later campaign chapters.",
      );
      break;
    }
    case "combatDamage": {
      const enemy = get(s, e.source);
      if (u && enemy) combatDamage(s, u, enemy, e.value ?? 0);
      break;
    }
    case "jailor":
      choose(
        s,
        "Dungeon Jailor",
        opts(
          s.staging.filter((o) => OBJECTIVES.includes(o.code)),
          (o) => [fx("shuffleObjective", { target: o.id })],
        ),
        "Shuffle one unclaimed objective back into the encounter deck.",
      );
      break;
    case "shuffleObjective":
      if (u) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        units(s).forEach((x) => {
          if (x.guarding === u.id) delete x.guarding;
        });
        s.encounterDeck.push(u.code);
        shuffle(s, s.encounterDeck);
      }
      break;
    case "nazgulDiscard":
      if (u)
        choose(
          s,
          "The Nazgûl demands a sacrifice",
          opts(characters(s), (x) => [
            fx("discardCharacter", { target: x.id }),
          ]),
          "After its shadow effect resolves, discard one character you control.",
        );
      break;
    case "discardCharacter":
      if (u) {
        // Discard is not destruction (Horn/Scarred), but it is leaving play (Brok).
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        s.heroes = s.heroes.filter((x) => x.id !== u.id);
        s.allies = s.allies.filter((x) => x.id !== u.id);
        if (u.code === "rc135") {
          s.removed.push(u.code);
          if (s.campaign && s.scenarioId !== "dol-guldur") {
            s.status = "lost";
            s.reason = "Mendor has left play.";
            s.queue = [];
            s.choice = null;
          }
        } else {
          seatView(s, u.owner ?? activeSeat(s)).discard.push(u.code);
          if (card(u.code).type_code === "hero")
            s.fallenThreat += card(u.code).threat ?? 0;
        }
        if (card(u.code).type_code === "ally") enqueue(s, fx("valiant"));
        if (
          card(u.code).type_code === "hero" &&
          card(u.code).traits?.includes("Dwarf")
        )
          prepend(s, fx("brok"));
        log(s, `${name(u)} is discarded.`, "danger");
      }
      break;
    case "returnAlly":
      if (u) {
        if (u.code === "rc135") {
          prepend(s, fx("discardCharacter", { target: u.id }));
          break;
        }
        returnAlly(s, u);
      }
      break;
    case "discardHand":
      choose(
        s,
        "Discard a card",
        opts(s.hand, (x) => [fx("discardHandCard", { target: x.id })]),
      );
      break;
    case "discardHandCard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (h) {
        s.hand = s.hand.filter((x) => x.id !== h.id);
        s.discard.push(h.code);
      }
      break;
    }
    case "wolfAttack": {
      if (!s.combat) break;
      const original = get(s, s.combat.enemyId);
      const i = original?.shadows.indexOf("01081") ?? -1;
      if (original && i >= 0) original.shadows.splice(i, 1);
      (s.pendingWolfReturns ??= []).push("01081");
      s.suspendedCombats.push(s.combat);
      const wolf = make(s, "01081");
      s.engaged.push(wolf);
      const shadow = encounterDraw(s, true);
      if (shadow) wolf.shadows.push(shadow);
      choose(s, "Wolf Rider attacks from the shadows", [
        ...opts(defendersFor(s), (x) => [
          fx("wolfDefend", { target: wolf.id, source: x.id }),
        ]),
        {
          id: "undefended",
          label: "Leave the Wolf Rider attack undefended",
          effects: [fx("wolfDefend", { target: wolf.id })],
        },
      ]);
      break;
    }
    case "wolfDefend":
      if (u) beginEnemyAttack(s, u, e.source ? [e.source] : [], true);
      break;
    default:
      return false;
  }
  return true;
}

export function restoreSave(value: unknown): GameState | null {
  try {
    if (!value || typeof value !== "object") return null;
    const s = structuredClone(value) as GameState;
    if ((s.version as number) === 1) {
      Object.assign(s, {
        version: 2,
        scenarioId: "mirkwood",
        playMode: "normal",
        campaign: null,
        startingHeroes: STARTERS.find((d) => d.id === s.deckId)?.heroes ?? [
          ...s.heroes.map((h) => h.code),
          ...s.discard.filter((c) => card(c).type_code === "hero"),
        ],
        prisoner: null,
        captiveMendor: null,
        nazgulDefeated: false,
        stageRevealing: false,
        alliesPlayed: 0,
        threatModifier: 0,
        shackles: 0,
        mendorBoost: false,
        campaignScarred: false,
        includeSupport: true,
        suspendedCombats: [],
      });
    }
    if (!validateSave(s)) return null;
    // Legacy version-two saves used player/global modifiers. Bind those bonuses
    // to the characters present at restore, then use the same snapshot rules.
    const gondor = s.gondor;
    eachSeat(s, () => {
      for (const u of characters(s)) {
        if (s.faramir) u.tempWill = (u.tempWill ?? 0) + s.faramir;
        if (gondor) {
          u.tempAttack = (u.tempAttack ?? 0) + 1;
          if (hasGondor(u)) u.tempDefense = (u.tempDefense ?? 0) + 1;
        }
      }
      s.faramir = 0;
    });
    s.gondor = false;
    for (const u of allEngaged(s))
      if (u.feinted && u.preventedAttacks === undefined)
        u.preventedAttacks = [ownerOf(s, u)];
    syncSeat(s);
    return s;
  } catch {
    return null;
  }
}
