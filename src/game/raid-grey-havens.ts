import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import {
  RAID as R,
  RAID_ENCOUNTERS,
  RAID_RECIPES,
} from "./raid-grey-havens-support";
import { card, name } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  random,
  removeShadowCard,
  shuffle,
} from "./core";
import {
  discardAttachment,
  discardHandCard,
  enemyAddedToStaging,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";

const isRaid = (s: GameState) =>
  s.scenarioId === "raid-on-the-grey-havens" && !!s.raidGreyHavens;
const corsairRules = (s: GameState) =>
  [
    "voyage-across-belegaer",
    "the-fate-of-numenor",
    "raid-on-the-grey-havens",
  ].includes(s.scenarioId);
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const raiders = (s: GameState) => enemies(s).filter((u) => trait(u, "Raider"));
const damageLocations = (s: GameState) =>
  locations(s).filter((u) => raidAflame(u) > 0);
export const raidAflame = (u: Unit) =>
  !u.blanked || u.printedKeywordsPreserved
    ? Number(/Aflame\s+(\d+)/i.exec(card(u.code).text ?? "")?.[1] ?? 0)
    : 0;
const active = (s: GameState, u: Unit) =>
  allActiveLocations(s).some((l) => l.id === u.id);
const defenders = (s: GameState) =>
  (s.combat?.defenderIds ?? (s.combat?.defenderId ? [s.combat.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
const topEnemyIndex = (s: GameState) => {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (card(s.encounterDiscard[i]).type_code === "enemy") return i;
  return -1;
};
function ordered(s: GameState, effects: Effect[], text: string) {
  const labels: Record<string, [string, string]> = {
    raidDreamLost: [R.dream, "Dream-chaser has burned · lose the game"],
    raidPiersBurn: [R.piers, "Burning Piers · deal 3 damage to Dream-chaser"],
    raidWhiteBurn: [R.white, "White Ship · add 1 resource to every Raider"],
    raidCaravelBurn: [
      R.caravel,
      "Elven Caravel · deal 1 damage to every character",
    ],
    raidHavensBurn: [
      R.burn,
      "The Havens Burn · reveal the next encounter card",
    ],
    raidDamageAllLocations: [
      R.fires,
      "The Fires Spread · deal 1 damage to every Aflame location",
    ],
  };
  const described = effects.map((e) => ({
    ...e,
    code: e.code ?? get(s, e.target)?.code ?? labels[e.kind]?.[0],
    text: e.text ?? labels[e.kind]?.[1],
  }));
  if (described.length === 1) prepend(s, described[0]);
  else if (described.length)
    prepend(
      s,
      fx("fangornOrder", { effects: described, text, player: firstPlayer(s) }),
    );
}
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function add(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
}
function removeLocation(s: GameState, u: Unit) {
  s.staging = s.staging.filter((l) => l.id !== u.id);
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  if (s.extraActiveLocations)
    s.extraActiveLocations = s.extraActiveLocations.filter(
      (l) => l.id !== u.id,
    );
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
}
export function setupRaidGreyHavens(s: GameState) {
  const r = RAID_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    r.cards
      .filter(
        (c) =>
          c.section === section &&
          RAID_ENCOUNTERS.some((v) => v.code === c.code),
      )
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  s.raidGreyHavens = {
    initialized: false,
    setAside: pile("sharedSetAside").map((c) => make(s, c)),
    burned: [],
  };
}
export function raidOpeningHandsKept(s: GameState) {
  if (!isRaid(s) || s.raidGreyHavens!.initialized) return false;
  prepend(s, fx("raidSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
/** The printed quest only grants this token to cards actually revealed by the encounter deck. */
export function raidCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  origin: Effect["revealOrigin"] = "encounter",
) {
  if (
    isRaid(s) &&
    s.stage === 2 &&
    !s.stageRevealing &&
    fromReveal &&
    origin === "encounter" &&
    trait(u, "Raider")
  )
    u.resources++;
}
export function raidStats(s: GameState, u: Unit) {
  return {
    attack:
      corsairRules(s) && !u.blanked && u.code === R.raider ? u.resources : 0,
    defense:
      corsairRules(s) && !u.blanked && u.code === R.leader ? u.resources : 0,
  };
}
export const raidLocationThreat = (s: GameState, u: Unit) =>
  isRaid(s) && u.code === R.piers && !u.blanked
    ? (card(u.code).threat ?? 0) + u.damage
    : undefined;
export function raidLocationProgressBlocked(s: GameState, u: Unit) {
  return (
    !!isRaid(s) &&
    (u.code === R.dream ||
      (!active(s, u) &&
        s.staging.some((l) => l.code === R.harbor && !l.blanked)))
  );
}
/** Location damage is unrelated to the character hit-point framework. */
export function raidDamageLocation(
  s: GameState,
  u: Unit,
  value: number,
): boolean | undefined {
  if (!isRaid(s) || card(u.code).type_code !== "location" || !raidAflame(u))
    return undefined;
  if (value <= 0) return false;
  u.damage += value;
  log(s, `${name(u)} takes ${value} fire damage.`, "danger");
  if (u.damage >= raidAflame(u)) raidBurn(s, u);
  return true;
}
function raidBurn(s: GameState, u: Unit) {
  removeLocation(s, u);
  s.raidGreyHavens!.burned.push(u);
  log(
    s,
    `${name(u)} burns and is placed facedown underneath The Havens Burn.`,
    "danger",
  );
  const effects: Effect[] = [];
  if (u.code === R.dream && !u.blanked)
    effects.push(fx("raidDreamLost", { player: firstPlayer(s) }));
  else if (u.code === R.piers && !u.blanked)
    effects.push(fx("raidPiersBurn", { player: firstPlayer(s) }));
  else if (u.code === R.white && !u.blanked)
    effects.push(fx("raidWhiteBurn", { player: firstPlayer(s) }));
  else if (u.code === R.caravel && !u.blanked)
    effects.push(fx("raidCaravelBurn", { player: firstPlayer(s) }));
  if (s.staging.some((l) => l.code === R.burn && !l.blanked))
    effects.push(fx("raidHavensBurn", { player: firstPlayer(s) }));
  ordered(s, effects, "Choose the next burning-location Forced effect");
}
/** Sahír cancels only the points for which he can discard a token. */
export function raidDamageAmount(s: GameState, u: Unit, amount: number) {
  if (!isRaid(s) || u.code !== R.sahir || u.blanked || amount <= 0)
    return amount;
  const cancelled = Math.min(amount, u.resources);
  u.resources -= cancelled;
  if (cancelled)
    log(
      s,
      `Captain Sahír discards ${cancelled} resources to cancel ${cancelled} damage.`,
    );
  return amount - cancelled;
}
export function raidEngaged(s: GameState, u: Unit) {
  if (!corsairRules(s) || u.blanked) return;
  const player = ownerOf(s, u);
  if (u.code === R.leader)
    prepend(s, fx("raidLeaderResources", { target: u.id, player }));
  if (isRaid(s) && u.code === R.naasiyah)
    prepend(s, fx("raidNaasiyahEvents", { target: u.id, player }));
}
/** Both elite enemies use the normal engagement window, but their printed controller is fixed. */
export function raidEngagementPlayer(
  s: GameState,
  u: Unit,
): number | undefined {
  if (!isRaid(s) || u.blanked) return undefined;
  if (u.code === R.sahir) return firstPlayer(s);
  if (u.code === R.naasiyah) return playerOrder(s).at(-1);
  return undefined;
}
export function raidResourcesCollected(s: GameState) {
  if (!corsairRules(s)) return;
  ordered(
    s,
    allEngaged(s)
      .filter((u) => u.code === R.infiltrator && !u.blanked)
      .map((u) =>
        fx("raidStealResource", { target: u.id, player: ownerOf(s, u) }),
      ),
    "Choose the next Corsair Infiltrator resource theft",
  );
}
export function raidAttackStarted(s: GameState, enemy: Unit, _player: number) {
  if (!corsairRules(s) || enemy.blanked) return;
  if (enemy.code === R.infiltrator)
    for (let i = 0; i < enemy.resources; i++) {
      const co = encounterDraw(s, true);
      if (co) enemy.shadows.push(co);
    }
  if (isRaid(s) && enemy.code === R.naasiyah) raidNaasiyahStart(enemy);
}
function raidNaasiyahStart(u: Unit) {
  if (u.raidCombatResourceBonus !== undefined) return;
  u.raidCombatResourceBonus = u.resources;
  u.tempAttack = (u.tempAttack ?? 0) + u.resources;
  u.tempDefense = (u.tempDefense ?? 0) + u.resources;
}
function raidNaasiyahEnd(u: Unit) {
  if (u.raidCombatResourceBonus === undefined) return;
  u.tempAttack = (u.tempAttack ?? 0) - u.raidCombatResourceBonus;
  u.tempDefense = (u.tempDefense ?? 0) - u.raidCombatResourceBonus;
  delete u.raidCombatResourceBonus;
  u.resources = Math.max(0, u.resources - 1);
}
export function raidPlayerAttackStarted(s: GameState, enemy: Unit) {
  if (isRaid(s) && enemy.code === R.naasiyah && !enemy.blanked)
    raidNaasiyahStart(enemy);
}
export function raidPlayerAttackFinished(s: GameState, enemy: Unit) {
  if (isRaid(s) && enemy.code === R.naasiyah) raidNaasiyahEnd(enemy);
}
export function raidCharacterDestroyed(
  s: GameState,
  _u: Unit,
  context: DamageContext,
) {
  if (
    corsairRules(s) &&
    s.combat &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId
  )
    s.combat.raidKilledCharacter = true;
}
export function raidAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
) {
  if (!corsairRules(s)) return;
  const enemy = get(s, combat.enemyId),
    effects: Effect[] = [];
  if (enemy && !enemy.blanked) {
    if (enemy.code === R.raider)
      effects.push(
        fx("raidStealResource", {
          target: enemy.id,
          player: combat.attackPlayer ?? activeSeat(s),
        }),
      );
    if (isRaid(s) && enemy.code === R.ravager)
      effects.push(
        fx("raidRavager", { target: enemy.id, player: firstPlayer(s) }),
      );
    if (isRaid(s) && enemy.code === R.sahir)
      enemy.resources += combat.raidKilledCharacter ? 4 : 2;
    if (isRaid(s) && enemy.code === R.naasiyah) raidNaasiyahEnd(enemy);
  }
  if (isRaid(s) && combat.raidKilledCharacter)
    for (let i = 0; i < (combat.raidFiresOnKill ?? 0); i++)
      effects.push(
        fx("raidDamageAllLocations", { value: 1, player: firstPlayer(s) }),
      );
  ordered(s, effects, "Choose the next Corsair after-attack Forced effect");
}
export function raidExplored(s: GameState, u: Unit) {
  if (isRaid(s) && u.code === R.runner && !u.blanked)
    prepend(s, fx("raidRunnerResponse", { player: firstPlayer(s) }));
}
export function raidRoundEnd(s: GameState): Effect[] {
  return isRaid(s)
    ? [
        fx("raidRoundFire", {
          ids: s.staging.filter((u) => raidAflame(u) > 0).map((u) => u.id),
          player: firstPlayer(s),
        }),
      ]
    : [];
}
export function raidCombatEnd(s: GameState): Effect[] {
  return isRaid(s) && s.stage === 1
    ? [
        fx("raidLowestFire", {
          value: enemies(s).filter((u) => trait(u, "Corsair")).length,
          player: firstPlayer(s),
        }),
      ]
    : [];
}
export function raidQuestProgress(s: GameState, value: number) {
  if (!isRaid(s) || s.stage !== 2) return false;
  prepend(s, fx("raidRemoveFire", { value, player: firstPlayer(s) }));
  return true;
}
export function raidAdvance(s: GameState) {
  if (!isRaid(s)) return false;
  if (
    !s.raidGreyHavens!.initialized ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 18) {
    if (questDefeated(s, R.assault)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("raidStageTwo", { player: firstPlayer(s) }));
  } else if (
    s.stage === 2 &&
    s.victoryCards?.includes(R.sahir) &&
    locations(s).every((u) => u.damage === 0)
  ) {
    win(s);
    s.reason =
      "Captain Sahír is defeated and the fires in the Grey Havens are extinguished.";
  }
  return true;
}
export function raidCheck(s: GameState) {
  if (!isRaid(s) || !s.raidGreyHavens!.initialized || s.status !== "playing")
    return;
  for (const u of damageLocations(s))
    if (u.damage >= raidAflame(u)) {
      raidBurn(s, u);
      break;
    }
}
export function raidTravelProblem(s: GameState, u: Unit) {
  if (!isRaid(s)) return null;
  if (u.code === R.dream && !u.blanked)
    return "The players cannot travel to Dream-chaser.";
  if (
    u.code === R.white &&
    !u.blanked &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (co) =>
        card(co).type_code === "enemy" &&
        (card(co).traits ?? "").includes("Corsair"),
    )
  )
    return "White Ship requires a Corsair in the encounter deck or discard pile.";
  if (
    u.code === R.caravel &&
    !u.blanked &&
    u.damage > 0 &&
    playerOrder(s).some(
      (p) => ![...seatView(s, p).heroes, ...seatView(s, p).allies].length,
    )
  )
    return "Each player needs a character to assign Elven Caravel's travel damage.";
  return null;
}
export function raidTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (!isRaid(s) || u.blanked) return undefined;
  if (u.code === R.white)
    return [fx("raidSearchCorsair", { player: firstPlayer(s) })];
  if (u.code === R.caravel)
    return playerOrder(s).map((player) =>
      fx("raidAssignDamage", { value: u.damage, ids: [], effects: [], player }),
    );
  return undefined;
}
export function raidEncounter(s: GameState, code: string, replay = false) {
  if (
    !corsairRules(s) ||
    (!isRaid(s) &&
      ![R.raider, R.infiltrator, R.leader, R.hardened].includes(code))
  )
    return false;
  if (code === R.arsonist)
    prepend(s, fx("raidArsonist", { player: firstPlayer(s) }));
  else if (code === R.pillaged) {
    const u = [...s.staging].reverse().find((u) => u.code === code);
    if (u)
      prepend(s, fx("raidPillaged", { target: u.id, player: firstPlayer(s) }));
  } else if (code === R.torch)
    prepend(s, ...playerOrder(s).map((player) => fx("raidTorch", { player })));
  else if (code === R.fires) {
    const ids = damageLocations(s).map((u) => u.id);
    prepend(
      s,
      ...ids.map((target) =>
        fx("raidLocationDamage", { target, value: 1, player: firstPlayer(s) }),
      ),
      ...(ids.length < 3 && !replay
        ? [
            fx("amonSurgeWindow", { code }),
            fx("reveal", { player: firstPlayer(s) }),
          ]
        : []),
    );
  } else if (code === R.hardened) {
    for (const u of raiders(s)) u.resources++;
    const targets = allEngaged(s).filter((u) => !trait(u, "Ship"));
    ordered(
      s,
      targets.map((u) =>
        fx("immediateAttack", { target: u.id, player: ownerOf(s, u) }),
      ),
      "Battle-Hardened · Choose the next immediate attack",
    );
    if (!targets.length && !replay)
      prepend(
        s,
        fx("amonSurgeWindow", { code }),
        fx("reveal", { player: firstPlayer(s) }),
      );
  } else if (!RAID_ENCOUNTERS.some((c) => c.code === code)) return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function raidShadow(s: GameState, code: string) {
  const c = s.combat,
    enemy = get(s, c?.enemyId);
  if (!corsairRules(s) || !c || !enemy) return false;
  const player = c.attackPlayer ?? activeSeat(s),
    ds = defenders(s);
  if (code === R.hardened) {
    if (trait(enemy, "Raider")) enemy.resources += 2;
  } else if (!isRaid(s)) return false;
  else if (code === R.harbor)
    c.attackBonus += allActiveLocations(s).reduce((n, l) => n + l.damage, 0);
  else if (code === R.piers) {
    const index = enemy.shadows
      .slice(0, enemy.revealedShadowCount ?? enemy.shadows.length)
      .lastIndexOf(code);
    if (index >= 0) removeShadowCard(enemy, index);
    add(s, code);
  } else if (code === R.pillaged) {
    if (trait(enemy, "Raider"))
      for (const d of ds) {
        enemy.resources += d.resources;
        d.resources = 0;
      }
  } else if (code === R.runner) {
    if (trait(enemy, "Raider"))
      prepend(s, fx("raidRunnerShadow", { target: enemy.id, player }));
  } else if (code === R.torch) {
    const l = allActiveLocations(s).find((l) => raidAflame(l) > 0);
    if (l)
      choose(s, "Put to the Torch · Damage the active location or defender", [
        {
          id: l.id,
          label: `${name(l)} · 3 damage`,
          code: l.code,
          effects: [
            fx("raidLocationDamage", {
              target: l.id,
              value: 3,
              player: firstPlayer(s),
            }),
          ],
        },
        ...opts(ds, (d) => [
          fx("damage", { target: d.id, value: 1, player: ownerOf(s, d) }),
        ]),
      ]);
  } else if (code === R.fires) c.raidFiresOnKill = (c.raidFiresOnKill ?? 0) + 1;
  else return false;
  return true;
}
const SHARED = new Set([
  "raidSetup",
  "raidStageTwo",
  "raidEliteEntered",
  "raidStageTwoResources",
  "raidStageReady",
  "raidRoundFire",
  "raidLowestFire",
  "raidLocationDamage",
  "raidRemoveFire",
  "raidRemoveFireTarget",
  "raidPiersBurn",
  "raidWhiteBurn",
  "raidCaravelBurn",
  "raidHavensBurn",
  "raidHavensCheck",
  "raidDreamLost",
  "raidArsonist",
  "raidSearchAflame",
  "raidSearchCorsair",
  "raidSearchTake",
  "raidPillaged",
  "raidRestoreEnemy",
  "raidDamageAllLocations",
  "raidRunnerResponse",
  "raidRunnerDraw",
  "raidRavager",
]);
export const raidSharedEffect = (e: Effect) => SHARED.has(e.kind);
export function raidEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("raid")) return false;
  if (!corsairRules(s)) return true;
  const u = get(s, e.target),
    q = s.raidGreyHavens;
  switch (e.kind) {
    case "raidResourcesCollected":
      raidResourcesCollected(s);
      break;
    case "raidSetup": {
      if (!q) break;
      q.initialized = true;
      for (const co of [R.burn, R.dream, R.ravager]) {
        const index = q.setAside.findIndex((u) => u.code === co);
        if (index >= 0) {
          const v = q.setAside.splice(index, 1)[0];
          s.staging.push(v);
          if (card(co).type_code === "enemy") enemyAddedToStaging(s, v);
        }
      }
      shuffle(s, s.encounterDeck);
      let remaining = playerOrder(s).length;
      while (remaining > 0 && s.encounterDeck.length) {
        const co = s.encounterDeck.shift()!;
        const v = make(s, co);
        if (raidAflame(v) > 0) {
          s.staging.push(v);
          remaining--;
        } else s.encounterDiscard.push(co);
      }
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      break;
    }
    case "raidStageTwo":
      if (q) {
        const elites = q.setAside.splice(0);
        s.staging.push(...elites);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("reveal", { player })),
          fx("raidStageTwoResources", { player: firstPlayer(s) }),
          fx("raidStageReady", { player: firstPlayer(s) }),
        );
        // Both enemies enter together. The first player orders their entry
        // effects, and each ordinary staging response resolves before 2A's
        // subsequent reveals. Waiting Traps therefore follow that choice.
        ordered(
          s,
          elites.map((v) =>
            fx("raidEliteEntered", {
              target: v.id,
              code: v.code,
              text: `${name(v)} · resolve entry effects`,
              player: firstPlayer(s),
            }),
          ),
          "Sahír's Advance · Choose the next elite enemy's entry effects",
        );
      }
      break;
    case "raidEliteEntered":
      if (u && s.staging.some((v) => v.id === u.id)) enemyAddedToStaging(s, u);
      break;
    case "raidStageTwoResources": {
      const fire = locations(s).find((u) => u.code === R.dream)?.damage ?? 0;
      for (const v of raiders(s))
        v.resources += [R.sahir, R.naasiyah].includes(v.code) ? fire : 1;
      break;
    }
    case "raidStageReady":
      s.stageRevealing = false;
      break;
    case "raidRoundFire":
      prepend(
        s,
        ...(e.ids ?? [])
          .filter((id) => s.staging.some((u) => u.id === id))
          .map((target) =>
            fx("raidLocationDamage", {
              target,
              value: 1,
              player: firstPlayer(s),
            }),
          ),
      );
      break;
    case "raidLocationDamage":
      if (u) raidDamageLocation(s, u, e.value ?? 0);
      break;
    case "raidDamageAllLocations":
      prepend(
        s,
        ...damageLocations(s).map((u) =>
          fx("raidLocationDamage", {
            target: u.id,
            value: e.value ?? 1,
            player: firstPlayer(s),
          }),
        ),
      );
      break;
    case "raidLowestFire": {
      const targets = damageLocations(s),
        min = Math.min(...targets.map(raidAflame));
      if ((e.value ?? 0) > 0)
        choose(
          s,
          "Deal fire damage to a lowest Aflame location",
          opts(
            targets.filter((u) => raidAflame(u) === min),
            (u) => [
              fx("raidLocationDamage", {
                target: u.id,
                value: e.value,
                player: firstPlayer(s),
              }),
            ],
          ),
        );
      break;
    }
    case "raidRavager":
      if (u) {
        u.resources++;
        prepend(
          s,
          fx("raidLowestFire", { value: u.resources, player: firstPlayer(s) }),
        );
      }
      break;
    case "raidPiersBurn": {
      const dream = locations(s).find((u) => u.code === R.dream);
      if (dream)
        prepend(
          s,
          fx("raidLocationDamage", {
            target: dream.id,
            value: 3,
            player: firstPlayer(s),
          }),
        );
      break;
    }
    case "raidWhiteBurn":
      for (const v of raiders(s)) v.resources++;
      break;
    case "raidCaravelBurn":
      prepend(
        s,
        ...allCharacters(s).map((u) =>
          fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
        ),
      );
      break;
    case "raidDreamLost":
      lose(s, "Dream-chaser has burned. The Elven fleet is lost.");
      break;
    case "raidHavensBurn":
      prepend(
        s,
        fx("reveal", { player: firstPlayer(s) }),
        fx("raidHavensCheck", { player: firstPlayer(s) }),
      );
      break;
    case "raidHavensCheck":
      if (q && q.burned.length >= (s.table?.seats.length ?? 1) + 3)
        lose(s, "The Corsairs have destroyed the Elven fleet.");
      break;
    case "raidRemoveFire": {
      const n = e.value ?? 0,
        targets = locations(s).filter((u) => u.damage > 0);
      if (n <= 0 || !targets.length) break;
      choose(
        s,
        "Sahír's Advance · Remove damage from locations",
        targets.flatMap((u) =>
          Array.from({ length: Math.min(n, u.damage) }, (_, i) => ({
            id: `${u.id}:${i + 1}`,
            label: `${name(u)} · remove ${i + 1} damage`,
            code: u.code,
            effects: [
              fx("raidRemoveFireTarget", {
                target: u.id,
                value: i + 1,
                player: firstPlayer(s),
              }),
              fx("raidRemoveFire", {
                value: n - i - 1,
                player: firstPlayer(s),
              }),
            ],
          })),
        ),
      );
      break;
    }
    case "raidRemoveFireTarget":
      if (u) u.damage = Math.max(0, u.damage - (e.value ?? 0));
      break;
    case "raidArsonist": {
      const targets = damageLocations(s);
      const pile = [...s.encounterDeck, ...s.encounterDiscard]
        .map((co) => make(s, co))
        .filter((u) => raidAflame(u) > 0);
      choose(
        s,
        "Corsair Arsonist · Damage a location or find an Aflame location",
        [
          ...opts(targets, (u) => [
            fx("raidLocationDamage", {
              target: u.id,
              value: 2,
              player: firstPlayer(s),
            }),
          ]),
          ...(pile.length
            ? [
                {
                  id: "search",
                  label: "Find a location with the highest Aflame value",
                  effects: [fx("raidSearchAflame", { player: firstPlayer(s) })],
                },
              ]
            : []),
        ],
      );
      break;
    }
    case "raidSearchAflame":
    case "raidSearchCorsair": {
      const candidates = (["deck", "discard"] as const).flatMap((zone) =>
        [
          ...new Set(zone === "deck" ? s.encounterDeck : s.encounterDiscard),
        ].map((co) => ({
          code: co,
          zone,
          aflame: Number(/Aflame\s+(\d+)/i.exec(card(co).text ?? "")?.[1] ?? 0),
        })),
      );
      const max = Math.max(...candidates.map((c) => c.aflame));
      const matches = candidates.filter((c) =>
        e.kind === "raidSearchAflame"
          ? c.aflame > 0 && c.aflame === max
          : card(c.code).type_code === "enemy" &&
            (card(c.code).traits ?? "").includes("Corsair"),
      );
      choose(
        s,
        e.kind === "raidSearchAflame"
          ? "Find a highest Aflame location"
          : "White Ship · Find a Corsair enemy",
        matches.map(({ code, zone }) => ({
          id:
            matches.filter((c) => c.code === code).length > 1
              ? `${zone}:${code}`
              : code,
          label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
          code,
          effects: [
            fx("raidSearchTake", { code, text: zone, player: firstPlayer(s) }),
          ],
        })),
      );
      break;
    }
    case "raidSearchTake": {
      const pile =
        e.text === "discard"
          ? s.encounterDiscard
          : e.text === "deck"
            ? s.encounterDeck
            : s.encounterDeck.includes(e.code!)
              ? s.encounterDeck
              : s.encounterDiscard;
      const index = pile.indexOf(e.code!);
      if (index >= 0) {
        add(s, pile.splice(index, 1)[0]);
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "raidPillaged": {
      const index = topEnemyIndex(s);
      choose(s, "Pillaged Ship · Damage the ship or restore an enemy", [
        ...(u
          ? [
              {
                id: "damage",
                label: "Deal 3 damage to Pillaged Ship",
                code: u.code,
                effects: [
                  fx("raidLocationDamage", {
                    target: u.id,
                    value: 3,
                    player: firstPlayer(s),
                  }),
                ],
              },
            ]
          : []),
        ...(index >= 0
          ? [
              {
                id: "enemy",
                label: `Add ${card(s.encounterDiscard[index]).name} to staging`,
                code: s.encounterDiscard[index],
                effects: [fx("raidRestoreEnemy", { player: firstPlayer(s) })],
              },
            ]
          : []),
      ]);
      break;
    }
    case "raidRestoreEnemy": {
      const index = topEnemyIndex(s);
      if (index >= 0) add(s, s.encounterDiscard.splice(index, 1)[0]);
      break;
    }
    case "raidTorch":
      choose(s, "Put to the Torch · Choose a character or Aflame location", [
        ...opts([...s.heroes, ...s.allies], (u) => [
          fx("damage", { target: u.id, value: 3, player: activeSeat(s) }),
        ]),
        ...opts(damageLocations(s), (u) => [
          fx("raidLocationDamage", {
            target: u.id,
            value: 3,
            player: firstPlayer(s),
          }),
        ]),
      ]);
      break;
    case "raidRunnerResponse":
      choose(s, "Elven Wave-runner · Each player may draw a card", [
        {
          id: "draw",
          label: "Each player draws 1 card",
          effects: [fx("raidRunnerDraw", { player: firstPlayer(s) })],
        },
        { id: "skip", label: "Skip the response", effects: [] },
      ]);
      break;
    case "raidRunnerDraw":
      for (const p of playerOrder(s)) forOwner(s, p, () => draw(s, 1));
      break;
    case "raidRunnerShadow":
      if (s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      if (u) u.resources++;
      break;
    case "raidLeaderResources":
      if (u)
        for (const h of s.heroes)
          if (h.resources > 0) {
            h.resources--;
            u.resources++;
          }
      break;
    case "raidNaasiyahEvents":
      if (u)
        for (let i = s.hand.length - 1; i >= 0; i--)
          if (card(s.hand[i].code).type_code === "event") {
            discardHandCard(s, s.hand[i].id);
            u.resources++;
          }
      break;
    case "raidStealResource":
      if (u)
        choose(
          s,
          "Move 1 hero resource to the Corsair",
          opts(
            s.heroes.filter((h) => h.resources > 0),
            (h) => [
              fx("raidStealResourceTarget", {
                source: u.id,
                target: h.id,
                player: activeSeat(s),
              }),
            ],
          ),
        );
      break;
    case "raidStealResourceTarget": {
      const enemy = get(s, e.source);
      if (u && enemy && u.resources > 0) {
        u.resources--;
        enemy.resources++;
      }
      break;
    }
    case "raidAssignDamage": {
      const amount = e.value ?? 0;
      if (amount <= 0) {
        const merged: Effect[] = [];
        for (const effect of e.effects ?? []) {
          const old = merged.find((v) => v.target === effect.target);
          if (old) old.value = (old.value ?? 0) + (effect.value ?? 0);
          else merged.push({ ...effect });
        }
        prepend(s, ...merged);
        break;
      }
      const chars = [...s.heroes, ...s.allies];
      choose(
        s,
        `Assign Elven Caravel travel damage · ${amount} remaining`,
        opts(chars, (u) => [
          fx("raidAssignDamage", {
            value: amount - 1,
            effects: [
              ...(e.effects ?? []),
              fx("damage", { target: u.id, value: 1, player: activeSeat(s) }),
            ],
            player: activeSeat(s),
          }),
        ]),
      );
      break;
    }
    default:
      throw new Error(`Unknown Raid on the Grey Havens effect ${e.kind}`);
  }
  return true;
}
