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
} from "./types";
import { SCENARIOS, scenario, OBJECTIVES } from "./scenarios";

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
  ...characters(s),
  ...s.staging,
  ...s.engaged,
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
  s.log.push({ id: s.nextId++, round: s.round, text, kind });
  if (s.log.length > 250) s.log.shift();
}
function prepend(s: GameState, ...effects: Effect[]) {
  s.queue.unshift(...effects);
}
function choose(
  s: GameState,
  title: string,
  options: Option[],
  description?: string,
) {
  if (options.length) s.choice = { title, options, description };
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
        s.faramir +
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
        : s.gondor
          ? 1
          : 0),
    defense:
      (c.defense ?? 0) +
      (u.code === "rc135" && s.mendorBoost ? 2 : 0) +
      (u.tempDefense ?? 0) +
      (s.gondor && hasGondor(u) ? 1 : 0),
    health:
      (c.health ?? 0) +
      u.attachments.filter((a) => a.code === "01040").length * 4,
  };
}
export const stagingThreat = (s: GameState) =>
  s.threatModifier +
  s.staging
    .filter((u) => ["enemy", "location"].includes(card(u.code).type_code))
    .reduce(
      (n, u) =>
        n +
        (u.suppressed
          ? 0
          : Math.max(
              0,
              (card(u.code).threat ?? 0) +
                (u.tempThreat ?? 0) -
                u.attachments.filter((a) => a.code === "01056").length,
            )),
      0,
    );
export const questWill = (s: GameState) =>
  characters(s)
    .filter((u) => u.committed || s.committedIds.includes(u.id))
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
  s.heroes
    .flatMap((h) => h.attachments)
    .filter((a) => OBJECTIVES.includes(a.code)).length;
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...s.engaged].some((u) => u.code === code);
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
function check(s: GameState) {
  if (s.status !== "playing") return;
  s.committedIds = s.committedIds.filter((id) =>
    characters(s).some((u) => u.id === id && !u.exhausted),
  );
  if (
    s.phase === "defense" &&
    !s.combat &&
    s.engaged.every((u) => u.attacked || u.feinted || has(u, "01069"))
  ) {
    s.phase = "attack";
    s.engaged.forEach((u) => {
      u.attacked = false;
    });
  }
  if (
    ["quest", "staging"].includes(s.phase) &&
    !s.encounterDeck.length &&
    s.encounterDiscard.length
  ) {
    s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
    log(s, "The empty encounter deck is refilled during the quest phase.");
  }
  const doomed = [
    ...characters(s),
    ...s.engaged,
    ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
  ].find((u) => u.damage >= stats(s, u).health);
  if (doomed) {
    destroy(s, doomed);
    return;
  }
  if (s.threat >= 50 || !s.heroes.length) {
    s.status = "lost";
    s.reason =
      s.threat >= 50
        ? "Your threat reached 50. The shadow has found you."
        : "The last hero has fallen.";
    s.choice = null;
    s.queue = [];
    log(s, s.reason, "danger");
  } else advanceQuest(s);
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
    : s.discard
  ).push(a.code);
  log(s, `${card(a.code).name} is discarded from ${name(u)}.`);
}
function destroy(s: GameState, u: Unit) {
  const c = card(u.code);
  if (c.type_code === "ally" || c.type_code === "hero") {
    for (const h of s.heroes)
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
    if (u.facedownCard) s.discard.push(u.facedownCard);
    else if (u.code === "01115") {
      s.encounterDeck.push(u.code);
      shuffle(s, s.encounterDeck);
    } else if (c.victory) s.victory += c.victory;
    else s.encounterDiscard.push(u.code);
    if (u.code === "01102") s.nazgulDefeated = true;
    if (u.code === "01082" && s.campaign && s.scenarioId === "anduin")
      s.queue.push(fx("earnPermanent", { code: "rc133" }));
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
    } else s.discard.push(u.code);
    if (c.type_code === "hero") s.fallenThreat += c.threat ?? 0;
    log(s, `${c.name} has fallen.`, "danger");
    if (c.type_code === "ally") s.queue.push(fx("valiant"));
    if (c.type_code === "hero" && c.traits?.includes("Dwarf"))
      s.queue.push(fx("brok"));
  }
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
  if (u.code === "01078") prepend(s, fx("mountainReward"));
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
      ![...s.staging, ...s.engaged].some(
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
  const mendor = s.allies.find((u) => u.code === "rc135");
  if (mendor) {
    mendor.exhausted = false;
    draw(s, 1);
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
    if (s.branch === "spider") prepend(s, fx("findSpider"));
  }
  if (s.stage === 3 && s.scenarioId === "anduin") {
    s.stageRevealing = true;
    prepend(s, fx("reveal"), fx("reveal"), fx("stageRevealed"));
  }
  log(s, `A new chapter: ${stageInfo(s).name}.`, "chapter");
}
function phaseEnd(s: GameState) {
  s.faramir = 0;
  s.gondor = false;
  s.questDebuff = 0;
  s.threatModifier = 0;
  s.standTogether = false;
  s.used = s.used.filter((k) => !k.startsWith("protector:"));
  for (const x of units(s)) {
    x.tempThreat = 0;
    x.tempWill = 0;
    x.tempAttack = 0;
    x.tempDefense = 0;
    x.suppressed = false;
    x.feinted = false;
  }
  for (const u of [...characters(s)]) {
    if (u.code === "01007") u.boost = 0;
    if (u.beornReturn) {
      s.allies = s.allies.filter((a) => a.id !== u.id);
      for (const a of [...u.attachments]) discardAttachment(s, u, a);
      s.deck.push(u.code);
      shuffle(s, s.deck);
      s.queue.push(fx("valiant"));
      continue;
    }
    if (u.temporary) {
      s.allies = s.allies.filter((a) => a.id !== u.id);
      for (const a of [...u.attachments]) discardAttachment(s, u, a);
      u.temporary = false;
      u.exhausted = false;
      u.damage = 0;
      u.committed = false;
      s.hand.push(u);
      log(s, `${name(u)} returns to your hand after Sneak Attack.`);
      s.queue.push(fx("valiant"));
    }
  }
}
function nextRound(s: GameState) {
  s.round++;
  s.phase = "planning";
  s.used = [];
  s.peek = null;
  s.alliesPlayed = 0;
  s.mendorBoost = false;
  for (const h of s.heroes) h.resources += has(h, "rc134") ? 2 : 1;
  draw(s, 1);
  log(s, `Round ${s.round} · Each hero gains 1 resource.`, "chapter");
}
function engage(s: GameState, u: Unit) {
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.engaged.push(u);
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
  let thalin = false;
  if (
    c.type_code === "enemy" &&
    s.heroes.some((h) => h.code === "01006" && h.committed)
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
  if (doomed) s.threat += Number(doomed[1]);
  if (c.text?.includes("Surge.")) prepend(s, fx("reveal"));
  const when = (c.text ?? "").includes("When Revealed");
  const options: Option[] = [];
  if (
    when &&
    s.hand.some((u) => u.code === "01050") &&
    resources(s, "spirit") >= 1
  )
    options.push({
      id: "cancel",
      label: "Play A Test of Will · 1 Spirit",
      code: "01050",
      effects: [
        fx("spendEvent", { code: "01050" }),
        fx("placeEncounter", {
          code,
          flag: true,
          value: thalin ? 1 : 0,
          source: guarding,
        }),
      ],
    });
  const eleanor = s.heroes.find((h) => h.code === "01008" && !h.exhausted);
  if (when && c.type_code === "treachery" && eleanor)
    options.push({
      id: "eleanor",
      label: "Exhaust Eleanor to cancel and replace",
      code: "01008",
      effects: [
        fx("exhaust", { target: eleanor.id }),
        fx("cancelReplace", { code, source: guarding }),
      ],
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
      s.threatModifier++;
      break;
    case "01105":
      s.shackles++;
      break;
    case "01112":
      prepend(s, fx("reveal"));
      break;
    case "01116":
      if (s.threat >= 35)
        for (const x of [...characters(s)]) damage(s, x.id, 1);
      break;
    case "01117":
      s.threat += characters(s).filter((x) => !x.committed).length;
      break;
    case "01118":
      s.staging
        .filter((x) => card(x.code).type_code === "location")
        .forEach((x) => (x.tempThreat = (x.tempThreat ?? 0) + 1));
      if (s.threat >= 35) prepend(s, fx("discardHand"));
      break;
    case "rc137": {
      const most = Math.max(...s.heroes.map((h) => h.damage));
      choose(s, "Lingering Venom", [
        {
          id: "exhaust",
          label: "Exhaust every damaged character",
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
    case "01074":
      prepend(s, fx("chooseExhaust", { count: 1 }));
      break;
    case "01076":
      s.questDebuff++;
      break;
    case "01079": {
      const events = s.hand.filter((u) => card(u.code).type_code === "event");
      s.hand = s.hand.filter((u) => card(u.code).type_code !== "event");
      s.discard.push(...events.map((u) => u.code));
      log(s, `Eyes of the Forest discards ${events.length} events.`, "danger");
      break;
    }
    case "01080":
      choose(
        s,
        "Caught in a Web",
        opts(s.heroes, (u) => [fx("web", { target: u.id })]),
        "Choose a hero to bear the web. It prevents normal refreshing unless that hero pays 2 resources.",
      );
      break;
    case "01089":
      choose(
        s,
        "Dol Guldur Orcs",
        opts(
          characters(s).filter((u) => u.committed),
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
      for (const u of [...characters(s)].filter((u) => u.exhausted))
        damage(s, u.id, 1);
      break;
    case "01098":
      choose(
        s,
        "Black Forest Bats",
        opts(
          characters(s).filter((u) => u.committed),
          (u) => [fx("uncommit", { target: u.id })],
        ),
        "Remove a character from the quest. It remains exhausted.",
      );
      break;
  }
  if (c.type_code === "treachery") returnTreachery(s, code);
}
function enterAlly(s: GameState, u: Unit, temporary = false) {
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
            s.staging.filter((x) => card(x.code).type_code === "enemy"),
            (x) => [fx("engage", { target: x.id })],
          ),
          skip,
        ],
        "You may engage an enemy from staging.",
      );
      break;
    case "01059": {
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
        ...characters(s).flatMap((h) =>
          h.attachments
            .filter((a) => a.code === "01080")
            .map((a) => ({
              id: a.id,
              label: `Remove web from ${name(h)}`,
              effects: [
                fx("discardAttachment", { target: h.id, source: a.id }),
              ],
            })),
        ),
        skip,
      ]);
      break;
    case "01018":
      for (const x of [...s.staging, ...s.engaged].filter((x) =>
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
  const list =
    defenderOnly && c?.defenderId ? [get(s, c.defenderId)!] : characters(s);
  const options: Option[] = [];
  for (const u of list.filter(Boolean))
    for (const a of u.attachments) {
      if (
        !card(a.code).text?.includes("Permanent") &&
        (card(a.code).sphere_code !== "encounter" ||
          OBJECTIVES.includes(a.code))
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
      if (undefended)
        for (const x of characters(s))
          for (const a of [...x.attachments]) discardAttachment(s, x, a);
      else attachmentChoice(s);
      break;
    case "01104":
      s.threat += s.engaged.length;
      break;
    case "01105":
      s.shackles++;
      break;
    case "01111":
      s.progress = Math.max(0, s.progress - (undefended ? 3 : 1));
      break;
    case "01112": {
      const enemy = get(s, c.enemyId),
        extra = encounterDraw(s, true);
      if (enemy && extra) {
        enemy.shadows.push(extra);
        prepend(s, fx("shadowReveal", { code: extra }));
      }
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
        for (const u of characters(s))
          for (const a of [...u.attachments])
            if (card(a.code).sphere_code !== "encounter")
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
    case "eowynDiscard": {
      const h = s.hand.find((x) => x.id === e.target);
      if (h) {
        s.hand = s.hand.filter((x) => x.id !== h.id);
        s.discard.push(h.code);
        const eowyn = s.heroes.find((x) => x.code === "01007");
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
          [...s.staging, ...s.engaged].filter(
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
            s.heroes.filter((u) => u.committed),
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
    case "nextRound":
      nextRound(s);
      break;
    case "travelDone":
      phaseEnd(s);
      s.phase = "encounter";
      s.optionalEngagement = false;
      break;
    case "travelReady":
      choose(
        s,
        "Old Forest Road",
        [
          ...opts(
            characters(s).filter((u) => u.exhausted),
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
    case "startCombat":
      s.phase = "defense";
      for (const enemy of [...s.engaged].sort(
        (a, b) =>
          (card(b.code).engagement ?? 0) - (card(a.code).engagement ?? 0),
      )) {
        enemy.attacked = false;
        const code = encounterDraw(s, true);
        enemy.shadows = code ? [code] : [];
      }
      for (const enemy of s.engaged)
        if (has(enemy, "01069") || enemy.feinted) enemy.attacked = true;
      if (!s.engaged.length || s.engaged.every((e) => e.attacked)) {
        s.phase = "attack";
        for (const enemy of s.engaged) enemy.attacked = false;
      }
      break;
    case "shadowReveal": {
      if (!get(s, s.combat?.enemyId)) break;
      log(
        s,
        `Shadow: ${card(e.code!).name}${card(e.code!).shadow ? " — " + card(e.code!).shadow : " · no effect"}.`,
      );
      if (
        card(e.code!).shadow &&
        s.hand.some((u) => u.code === "01048") &&
        resources(s, "spirit") >= 1
      ) {
        choose(
          s,
          "A shadow falls",
          [
            {
              id: "cancel",
              label: "Play Hasty Stroke · 1 Spirit",
              code: "01048",
              effects: [fx("spendEvent", { code: "01048" })],
            },
            {
              id: "resolve",
              label: "Resolve shadow effect",
              code: e.code,
              effects: [fx("shadowEffect", { code: e.code })],
            },
          ],
          card(e.code!).shadow,
        );
      } else prepend(s, fx("shadowEffect", { code: e.code }));
      break;
    }
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
      const amount = Math.max(
        0,
        power -
          (c.ignoreDefense
            ? 0
            : defenders.reduce((n, d) => n + stats(s, d).defense, 0)),
      );
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
      log(s, `${name(enemy)} attacks for ${power}.`);
      break;
    }
    case "enemyDone": {
      const enemy = get(s, s.combat?.enemyId);
      if (enemy) {
        enemy.attacked = true;
        if (enemy.code === "01090") enemy.resources++;
        if (enemy.code === "01111") s.progress = Math.max(0, s.progress - 1);
        if (s.combat?.returnToStaging || s.combat?.returnWolf) {
          s.engaged = s.engaged.filter((x) => x.id !== enemy.id);
          s.encounterDiscard.push(...enemy.shadows);
          enemy.shadows = [];
          if (s.combat.returnWolf) s.encounterDeck.unshift("01081");
          else s.staging.push(enemy);
        }
      }
      s.combat = s.suspendedCombats.pop() ?? null;
      if (s.combat) break;
      if (s.engaged.every((u) => u.attacked || u.feinted || has(u, "01069"))) {
        s.phase = "attack";
        for (const x of s.engaged) x.attacked = false;
      }
      break;
    }
    case "webRefresh":
      if (u?.exhausted && has(u, "01080") && u.resources >= 2)
        choose(s, `Free ${name(u)} from the web?`, [
          {
            id: "pay",
            label: "Pay 2 resources from this hero to ready",
            effects: [
              fx("resource", { target: u.id, value: -2 }),
              fx("ready", { target: u.id }),
            ],
          },
          { id: "skip", label: "Leave this hero exhausted", effects: [] },
        ]);
      break;
    case "refreshEnd":
      s.threat += s.activeLocation?.code === "01114" ? 2 : 1;
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
function flush(s: GameState) {
  let n = 0;
  while (s.queue.length && !s.choice && s.status === "playing") {
    requireRule(++n < 200, "Effect queue overflow.");
    handle(s, s.queue.shift()!);
    check(s);
  }
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
    (heroCodes.join() === starter.heroes.join() || !!options.campaign);
  requireRule(
    list.length === 50 || (list.length === 30 && original),
    "Use an original 30-card starter list or exactly 50 cards for a custom deck.",
  );
  requireRule(
    heroCodes.length === 3 &&
      new Set(heroCodes).size === 3 &&
      heroCodes.every((c) => card(c).type_code === "hero"),
    "Choose 3 different heroes.",
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
      ? structuredClone(options.campaign ?? newCampaign(heroCodes))
      : null;
  const s: GameState = {
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
  s.heroes = heroCodes.map((code) => make(s, code));
  s.threat = s.heroes.reduce((n, h) => n + (card(h.code).threat ?? 0), 0);
  if (campaign) {
    s.threat += campaign.threatPenalty;
    if (s.includeSupport && campaign.boons.includes("rc132"))
      s.deck.push("rc132");
    s.encounterDeck.push(
      ...campaign.burdens.filter((c) => ["rc136", "rc137"].includes(c)),
    );
    for (const h of s.heroes)
      for (const code of campaign.permanent[h.code] ?? [])
        h.attachments.push({ id: `a${s.nextId++}`, code, exhausted: false });
    s.allies.push(make(s, "rc135"));
  }
  shuffle(s, s.deck);
  draw(s, 6);
  if (scenarioId === "mirkwood") {
    for (const code of ["01096", "01099"]) {
      s.encounterDeck.splice(s.encounterDeck.indexOf(code), 1);
      s.staging.push(make(s, code));
    }
    shuffle(s, s.encounterDeck);
  } else if (scenarioId === "anduin") {
    shuffle(s, s.encounterDeck);
    s.queue.push(fx("reveal"), fx("ensureTroll"));
  } else {
    s.encounterDeck = s.encounterDeck.filter(
      (code) => code !== "01102" && !OBJECTIVES.includes(code),
    );
    shuffle(s, s.encounterDeck);
    if (campaign) s.queue.push(fx("appointedByFate"));
    for (const code of OBJECTIVES) {
      const objective = make(s, code);
      s.staging.push(objective);
      s.queue.push(fx("guardObjective", { target: objective.id }));
    }
    s.queue.push(fx("capturePrisoner"));
  }
  log(
    s,
    `${scenario(scenarioId).name} · ${playMode === "campaign" ? "Mirkwood Paths campaign" : "Normal game"}.`,
    "chapter",
  );
  flush(s);
  return s;
}
export function canPlay(s: GameState, u: Unit): string | null {
  const c = card(u.code);
  if (s.choice || s.status !== "playing")
    return "Resolve the current choice first.";
  if (s.phase === "setup") return "Continue to the next action window.";
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
    (s.mendorBoost || !s.allies.some((a) => a.code === "rc135"))
  )
    return "Mendor must be free, and his Support can be played once per round.";
  if (["01024", "01037", "01047", "01048", "01050"].includes(u.code))
    return "This response is offered automatically when its trigger occurs.";
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
export function playTargets(s: GameState, u: Unit): Unit[] {
  const c = card(u.code);
  if (c.type_code === "attachment") {
    if (u.code === "01056")
      return [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ].filter((x) => card(x.code).type_code === "location");
    if (u.code === "01069") return s.engaged.filter((e) => e.code !== "01102");
    if (u.code === "01072") return characters(s);
    return s.heroes.filter(
      (h) =>
        !c.text?.includes("Restricted") ||
        h.attachments.filter((a) => card(a.code).text?.includes("Restricted"))
          .length < 2,
    );
  }
  if (u.code === "01020") return s.allies.filter((a) => a.exhausted);
  if (u.code === "01021")
    return s.heroes.filter(
      (a) => !a.exhausted && s.heroes.some((h) => h.id !== a.id && h.exhausted),
    );
  if (u.code === "01032") return characters(s);
  if (u.code === "01033")
    return characters(s).filter(
      (a) => !a.exhausted && card(a.code).text?.includes("Ranged"),
    );
  if (u.code === "01035")
    return characters(s).filter((a) => !a.exhausted && canFight(a));
  if (["01034", "01052"].includes(u.code)) return s.engaged;
  if (u.code === "01063") return characters(s).filter((a) => a.damage > 0);
  if (u.code === "01065")
    return s.staging.filter((a) => card(a.code).type_code === "enemy");
  if (u.code === "01066")
    return s.staging.filter((a) => card(a.code).type_code === "location");
  if (["01051", "01053", "01054"].includes(u.code))
    return s.discard
      .map((code, i) => ({ ...s.heroes[0], code, id: `discard-${i}` }))
      .filter((a) =>
        u.code === "01051"
          ? card(a.code).type_code === "ally" &&
            card(a.code).sphere_code !== "neutral" &&
            (!card(a.code).is_unique ||
              !units(s).some((x) => x.code === a.code))
          : u.code === "01053"
            ? card(a.code).sphere_code === "spirit"
            : card(a.code).type_code === "hero",
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
              !characters(s).some((h) => h.damage > 0)
            : u.code === "01031"
              ? s.used.includes(u.id)
              : u.code === "01058"
                ? u.exhausted || !s.heroes.some((h) => h.damage > 0)
                : s.used.includes(u.id) || u.exhausted,
    });
  for (const a of u.attachments) {
    const active = ["01026", "01057", "01070", "01071", "01072"].includes(
      a.code,
    );
    if (active)
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
  requireRule(s.status === "playing", "This adventure has ended.");
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
      nextRound(s);
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
      s.queue.push(
        ...(committed.some((u) => u.code === "01002") ? [fx("theodred")] : []),
        ...(committed.some((u) => u.code === "01001") ? [fx("aragorn")] : []),
      );
      for (const u of committed) {
        if (u.code === "01044" && s.activeLocation)
          s.queue.push(
            fx("locationProgress", { target: s.activeLocation.id, value: 1 }),
          );
        if (u.code === "01045")
          s.queue.push(
            ...s.staging
              .filter((x) => card(x.code).type_code === "location")
              .map((x) => fx("locationProgress", { target: x.id, value: 1 })),
          );
      }
      const reveals =
        s.scenarioId === "anduin"
          ? s.stage === 3
            ? 0
            : s.stage === 2
              ? 2
              : 1
          : 1;
      s.queue.push(
        ...Array.from({ length: reveals }, () => fx("reveal")),
        fx("questReady"),
      );
      break;
    }
    case "NEXT": {
      if (s.phase === "planning") {
        phaseEnd(s);
        s.phase = "quest";
        s.lastQuest = null;
        log(s, "Quest phase · Choose characters to commit.");
        if (s.scenarioId === "dol-guldur" && s.stage === 3) orcGuard(s);
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
          s.threat -= net;
          for (const jailor of s.staging.filter((u) => u.code === "01101"))
            s.queue.push(fx("jailor", { source: jailor.id }));
          log(
            s,
            `Quest fails by ${-net}. Threat rises to ${s.threat}.`,
            "danger",
          );
        } else
          log(s, "Willpower matches threat. No progress or threat increase.");
        s.queue.push(fx("finishQuestPhase"));
      } else if (s.phase === "travel") {
        requireRule(
          s.activeLocation || !s.staging.some((u) => u.code === "01088"),
          "You must travel to The East Bight.",
        );
        phaseEnd(s);
        s.phase = "encounter";
        s.optionalEngagement = false;
      } else if (s.phase === "encounter") {
        for (const u of [...s.staging]
          .filter(
            (u) =>
              !(s.scenarioId === "anduin" && s.stage === 2) &&
              card(u.code).type_code === "enemy" &&
              (card(u.code).engagement ?? 0) <= s.threat,
          )
          .sort(
            (a, b) =>
              (card(b.code).engagement ?? 0) - (card(a.code).engagement ?? 0),
          ))
          engage(s, u);
        s.queue.push(fx("phaseEnd"), fx("startCombat"));
      } else if (s.phase === "refresh") {
        phaseEnd(s);
        for (const ally of [...s.allies])
          if (ally.code === "01073") {
            s.allies = s.allies.filter((a) => a.id !== ally.id);
            for (const a of [...ally.attachments])
              discardAttachment(s, ally, a);
            s.discard.push(ally.code);
            s.queue.push(fx("valiant"));
            log(s, "Gandalf departs at the end of the round.");
          }
        for (const enemy of [...s.staging, ...s.engaged]) enemy.boost = 0;
        for (const h of [...s.heroes]) {
          if (has(h, "01109")) s.threat += 2;
          if (has(h, "01110")) damage(s, h.id, 1);
        }
        s.queue.push(fx("nextRound"));
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
                !s.allies.some((x) => x.code === a.code)),
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
      if (u.code === "01051")
        effectiveCost =
          Number(card(s.discard[Number(action.target!.split("-")[1])]).cost) ||
          0;
      if (u.code === "01067") {
        effectiveCost = action.amount ?? 0;
        requireRule(
          Number.isInteger(effectiveCost) &&
            effectiveCost > 0 &&
            effectiveCost <= s.deck.length,
          "Choose a positive X no larger than your remaining deck.",
        );
      }
      pay(s, { ...c, cost: effectiveCost }, action.payment);
      s.hand = s.hand.filter((x) => x.id !== u.id);
      log(s, `Played ${c.name}.`, "good");
      if (c.type_code === "ally") {
        s.alliesPlayed++;
        enterAlly(s, u);
      } else if (c.type_code === "attachment") {
        get(s, action.target)!.attachments.push({
          id: u.id,
          code: u.code,
          exhausted: false,
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
        u && characters(s).some((x) => x.id === u.id),
        "Choose a character you control.",
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
      requireRule(
        hero.attachments.filter((a) =>
          card(a.code).text?.includes("Restricted"),
        ).length < 2,
        "This hero already has two restricted attachments.",
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
          s.heroes.some((h) => !h.exhausted),
          "Great Forest Web requires a ready hero.",
        );
      if (u.code === "01094")
        requireRule(
          s.hand.length >= 2,
          "Necromancer’s Pass requires 2 cards to discard.",
        );
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.activeLocation = u;
      log(s, `Travelled to ${name(u)}.`, "good");
      if (u.code === "01087") progressLocation(s, u, 1);
      if (u.code === "01107") orcGuard(s);
      if (u.code === "01099") s.queue.push(fx("travelReady"));
      if (u.code === "01100") s.queue.push(fx("draw", { value: 2 }));
      if (u.code === "01077") s.queue.push(fx("travelExhaust"));
      if (u.code === "01078") s.queue.push(fx("reveal"));
      if (u.code === "01094") {
        for (let i = 0; i < 2; i++) {
          const n = Math.floor(random(s) * s.hand.length);
          s.discard.push(s.hand.splice(n, 1)[0].code);
        }
        log(s, "Necromancer’s Pass discards 2 random cards.");
      }
      s.queue.push(fx("strengthOfWill", { target: u.id }), fx("travelDone"));
      break;
    }
    case "ENGAGE": {
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
      requireRule(s.phase === "attack", "Enemies must finish attacking first.");
      const enemy = [
        ...s.engaged,
        ...s.staging.filter((u) => card(u.code).type_code === "enemy"),
      ].find((u) => u.id === action.enemyId && !u.attacked);
      requireRule(enemy, "You may attack each enemy once per round.");
      playerAttack(s, enemy, action.attackerIds, true);
      break;
    }
    case "END_ATTACKS":
      requireRule(s.phase === "attack", "Finish enemy attacks first.");
      phaseEnd(s);
      for (const sniper of s.staging.filter((u) => u.code === "01083"))
        s.queue.push(fx("chooseDamage", { value: 1, source: sniper.id }));
      for (const u of characters(s)) {
        u.committed = false;
        u.attacked = false;
        u.boost = 0;
        for (const a of u.attachments) a.exhausted = false;
        if (!has(u, "01080")) u.exhausted = false;
        else s.queue.push(fx("webRefresh", { target: u.id }));
      }
      for (const u of s.engaged) {
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        u.attacked = false;
      }
      s.eowynUsed = false;
      s.queue.push(fx("refreshEnd"));
      break;
    default:
      throw new RuleError("Unknown action.");
  }
  flush(s);
  check(s);
  return s;
}

export function score(s: GameState) {
  return (
    (s.round - 1) * 10 +
    s.threat +
    s.fallenThreat +
    s.heroes.reduce((n, h) => n + h.damage, 0) -
    s.victory
  );
}
export function publicState(s: GameState) {
  return {
    mode: s.status,
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
    staging: s.staging.map((u) => ({
      id: u.id,
      name: name(u),
      ...stats(s, u),
      threat: card(u.code).threat,
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
    const integer = (n: unknown) =>
      typeof n === "number" && Number.isInteger(n) && Number.isFinite(n);
    const codes = (v: unknown): v is string[] =>
      Array.isArray(v) &&
      v.every((c) => typeof c === "string" && SCRIPTED.has(c));
    const validUnit = (u: Unit) =>
      u &&
      typeof u.id === "string" &&
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
          typeof a.exhausted === "boolean",
      ) &&
      codes(u.shadows) &&
      (u.guarding === undefined || typeof u.guarding === "string") &&
      (u.facedownCard === undefined ||
        (SCRIPTED.has(u.facedownCard) &&
          card(u.facedownCard).sphere_code !== "encounter"));
    if (
      s.version !== 2 ||
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
      s.startingHeroes.length !== 3 ||
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
        c.heroes.length !== 3 ||
        new Set(c.heroes).size !== 3 ||
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
    const ids = [
      ...units(s),
      ...s.hand,
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
    characters(s).find((u) => u.id === id && !u.exhausted && canFight(u)),
  );
  requireRule(
    attackers.every(Boolean),
    "All attackers must be ready characters.",
  );
  const staging = s.staging.some((u) => u.id === enemy.id);
  requireRule(
    !staging || (attackers.length === 1 && attackers[0]!.code === "01009"),
    "Only Dúnhere can attack a staging enemy, and he must attack alone.",
  );
  attackers.forEach((u) => {
    u!.exhausted = true;
  });
  if (regular) enemy.attacked = true;
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
  log(
    s,
    `${attackers.map((u) => name(u!)).join(" + ")} attack ${name(enemy)} for ${power}.`,
  );
  const killed =
    enemy.damage + Math.max(0, power - stats(s, enemy).defense) >=
    stats(s, enemy).health;
  damage(s, enemy.id, Math.max(0, power - stats(s, enemy).defense));
  if (killed && s.status === "playing") {
    const tokens = attackers.reduce(
      (n, u) =>
        n +
        (u!.code === "01005" ? 2 : 0) +
        u!.attachments.filter((a) => a.code === "01039").length,
      0,
    );
    if (tokens) {
      log(s, `The victory adds ${tokens} progress.`, "good");
      progress(s, tokens);
    }
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
            s.heroes.filter((h) => h.id !== u.id && h.exhausted),
            (h) => [fx("ready", { target: h.id })],
          ),
        );
      }
      break;
    case "01022":
      s.gondor = true;
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
                !s.allies.some((x) => x.code === a.code)),
          ),
          (a) => [fx("sneak", { target: a.id })],
        ),
        "Put an ally into play. It returns to your hand at the end of this phase.",
      );
      break;
    case "01025":
      characters(s).forEach((u) => {
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
        for (const e of [...s.engaged]) damage(s, e.id, 1);
      }
      break;
    case "01034":
      if (u) u.feinted = true;
      if (
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
              ...s.engaged,
              ...(u.code === "01009"
                ? s.staging.filter((e) => card(e.code).type_code === "enemy")
                : []),
            ],
            (enemy) => [fx("quickAttack", { target: enemy.id, source: u.id })],
          ),
          "Immediately attack with the chosen character.",
        );
      break;
    case "01036":
      s.engaged.forEach((e) => {
        e.feinted = true;
      });
      if (s.phase === "defense") {
        s.phase = "attack";
        s.engaged.forEach((e) => {
          e.attacked = false;
        });
      }
      break;
    case "01038":
      s.standTogether = true;
      log(
        s,
        "Stand Together allows multiple defenders for each attack this phase.",
      );
      break;
    case "01046":
      s.threat = Math.max(0, s.threat - 6);
      break;
    case "01049": {
      s.discard.splice(s.discard.lastIndexOf(code), 1);
      s.deck.push(...s.discard.splice(0));
      shuffle(s, s.deck);
      s.removed.push(code);
      log(
        s,
        "Will of the West reshuffles your discard pile and is removed from the game.",
      );
      break;
    }
    case "01051": {
      const i = Number(target!.split("-")[1]);
      const ally = s.discard.splice(i, 1)[0];
      enterAlly(s, make(s, ally));
      break;
    }
    case "01052":
      if (u) {
        s.engaged = s.engaged.filter((e) => e.id !== u.id);
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        u.attacked = false;
        s.staging.push(u);
        if (
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
      const i = Number(target!.split("-")[1]);
      s.hand.push(make(s, s.discard.splice(i, 1)[0]));
      break;
    }
    case "01054": {
      const i = Number(target!.split("-")[1]),
        c = s.discard.splice(i, 1)[0];
      s.heroes.push(make(s, c));
      s.fallenThreat -= card(c).threat ?? 0;
      break;
    }
    case "01063":
      if (u) u.damage = 0;
      break;
    case "01064":
      draw(s, 3);
      break;
    case "01065":
    case "01066":
      if (u) u.suppressed = true;
      break;
    case "01067": {
      const top = s.deck.slice(0, cost);
      choose(
        s,
        "Gandalf’s Search",
        top.map((code, i) => ({
          id: `search-${i}`,
          code,
          label: card(code).name,
          effects: [fx("searchTake", { code, value: i, count: cost })],
        })),
        "Add one card to your hand, then order the rest on top of your deck.",
      );
      break;
    }
    case "01068":
      s.heroes.forEach((h) => {
        h.damage = 0;
      });
      break;
    default:
      throw new RuleError("This event is a triggered response.");
  }
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
      s.faramir++;
      log(s, "Faramir grants every character +1 willpower this phase.", "good");
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
        characters(s).some((h) => h.damage > 0),
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
          characters(s).filter((h) => h.damage > 0),
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
        s.activeLocation?.code !== "01095" && s.deck.length,
        "You cannot draw cards now.",
      );
      u.exhausted = true;
      s.used.push(u.id);
      draw(s, 2);
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
        s.heroes.some((h) => h.damage > 0),
        "There is no damaged hero to heal.",
      );
      choose(
        s,
        "Daughter of the Nimrodel",
        opts(
          s.heroes.filter((h) => h.damage > 0),
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
        s.activeLocation?.code !== "01095" && s.deck.length,
        "You cannot draw cards now.",
      );
      u.exhausted = true;
      draw(s, 1);
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
    case "valiant":
      if (
        s.hand.some((u) => u.code === "01024") &&
        resources(s, "leadership") >= 1
      )
        choose(
          s,
          "Valiant Sacrifice",
          [
            {
              id: "play",
              label: "Pay 1 Leadership to draw 2 cards",
              code: "01024",
              effects: [
                fx("spendEvent", { code: "01024" }),
                fx("draw", { value: 2 }),
              ],
            },
            skip,
          ],
          "An ally has left play.",
        );
      break;
    case "brok": {
      const brok = s.hand.find((u) => u.code === "01019");
      if (brok && !s.allies.some((u) => u.code === "01019"))
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
      if (
        combat?.defenderId &&
        get(s, combat.enemyId) &&
        s.hand.some((u) => u.code === "01037") &&
        resources(s, "tactics") >= 2
      )
        choose(
          s,
          "Swift Strike",
          [
            {
              id: "play",
              label: "Pay 2 Tactics to deal 2 damage",
              code: "01037",
              effects: [
                fx("spendEvent", { code: "01037" }),
                fx("damage", { target: combat.enemyId, value: 2 }),
              ],
            },
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
  const fallen = s.startingHeroes.filter((code) => s.discard.includes(code));
  c.fallen = [...new Set([...c.fallen, ...fallen])];
  for (const code of fallen) delete c.permanent[code];
  if (s.scenarioId === "mirkwood") {
    if (!c.boons.includes("rc132")) c.boons.push("rc132");
    c.burdens.push(s.branch === "beorn" ? "rc136" : "rc137");
  }
  if (s.scenarioId === "anduin") {
    for (const h of s.heroes) {
      const permanent = h.attachments
        .filter((a) => ["rc133", "rc138"].includes(a.code))
        .map((a) => a.code);
      if (permanent.length) c.permanent[h.code] = permanent;
    }
    const highest = Math.max(...s.heroes.map((h) => h.damage));
    const candidates = s.heroes.filter((h) => h.damage === highest);
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
    c.mendorSaved = s.allies.some((a) => a.code === "rc135");
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
): GameState {
  requireRule(
    s.status === "won" && s.campaign && s.campaign.completed.length < 3,
    "Win the current chapter before continuing.",
  );
  const c = structuredClone(s.campaign);
  requireRule(
    heroes.length === 3 &&
      new Set(heroes).size === 3 &&
      heroes.every(
        (h) => card(h).type_code === "hero" && !c.fallen.includes(h),
      ),
    "Choose three different heroes who have not fallen.",
  );
  const replaced = c.heroes.filter((h) => !heroes.includes(h));
  requireRule(
    replaced.filter((h) => !c.fallen.includes(h)).length <= 1,
    "Between quests, you may replace fallen heroes and voluntarily change one other hero.",
  );
  const next = SCENARIOS[c.completed.length].id;
  requireRule(
    next !== "dol-guldur" || !c.prisoner || heroes.includes(c.prisoner),
    "The recorded prisoner must remain in this fellowship.",
  );
  c.threatPenalty += replaced.length;
  c.heroes = [...heroes];
  const d = STARTERS.find((d) => d.id === deckId);
  requireRule(d, "Choose a Core Set starter deck.");
  return createGame(seed, d.cards, heroes, d.id, {
    scenarioId: next,
    playMode: "campaign",
    campaign: c,
    includeSupport,
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
    scenarioId: s.scenarioId,
    playMode: s.playMode,
    campaign: s.campaign ?? undefined,
    includeSupport: s.includeSupport,
  });
}
function rescuePrisoner(s: GameState) {
  if (!s.prisoner) return;
  const hero = s.prisoner;
  s.prisoner = null;
  hero.damage = 1;
  s.heroes.push(hero);
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
    prepend(s, fx("earnPermanent", { code: "rc138" }));
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
  const defenders = ids.map((id) =>
    characters(s).find((u) => u.id === id && !u.exhausted && canFight(u)),
  );
  requireRule(
    defenders.every(Boolean),
    "Choose ready characters able to defend.",
  );
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
  if (enemy.code === "01091") {
    const code = encounterDraw(s, true);
    if (code) enemy.shadows.push(code);
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
      characters(s).forEach((u) => (u.committed = false));
      phaseEnd(s);
      s.phase = "travel";
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
        opts(s.heroes, (h) => [
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
        s.heroes.find((h) => h.code === code) ??
        s.heroes[Math.floor(random(s) * s.heroes.length)];
      if (hero) {
        s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        s.prisoner = hero;
        log(s, `${name(hero)} is the prisoner.`, "danger");
      }
      const m = s.allies.find((a) => a.code === "rc135");
      if (m) {
        s.allies = s.allies.filter((a) => a.id !== m.id);
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
        // Discard is not destruction: no Horn, Scarred, or Dwarf death response.
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
          s.discard.push(u.code);
          if (card(u.code).type_code === "hero")
            s.fallenThreat += card(u.code).threat ?? 0;
        }
        if (card(u.code).type_code === "ally") s.queue.push(fx("valiant"));
        log(s, `${name(u)} is discarded.`, "danger");
      }
      break;
    case "returnAlly":
      if (u) {
        if (u.code === "rc135") {
          prepend(s, fx("discardCharacter", { target: u.id }));
          break;
        }
        s.allies = s.allies.filter((a) => a.id !== u.id);
        for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        u.exhausted = false;
        u.damage = 0;
        u.committed = false;
        s.hand.push(u);
        s.queue.push(fx("valiant"));
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
      s.suspendedCombats.push(s.combat);
      const wolf = make(s, "01081");
      s.engaged.push(wolf);
      const shadow = encounterDraw(s, true);
      if (shadow) wolf.shadows.push(shadow);
      choose(s, "Wolf Rider attacks from the shadows", [
        ...opts(
          characters(s).filter((x) => !x.exhausted && canFight(x)),
          (x) => [fx("wolfDefend", { target: wolf.id, source: x.id })],
        ),
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
    return validateSave(s) ? s : null;
  } catch {
    return null;
  }
}
