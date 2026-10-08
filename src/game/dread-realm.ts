import type { Attachment, Card, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { LeaveDestination } from "./mirkwood-player-cards";
import type { DreadKilledCharacter } from "./dread-realm-support";
import { DREAD as D, DREAD_RECIPES } from "./dread-realm-support";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  fx,
  get,
  locationQuest,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  random,
  removeShadowCard,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  destroy,
  discardCharacter,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  progressLocation,
  questDefeated,
  takePlayerDiscard,
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
  seatName,
  seatView,
} from "./table";
import { allQuestUnits, attachToQuest, currentQuestUnit } from "./quest-state";
import { syncAttachmentText } from "./attachment-text";
import { playerCardImmune } from "./card-immunity";
import { isAlly } from "./card-types";

type DreadCombat = NonNullable<GameState["combat"]> & {
  dreadKilled?: DreadKilledCharacter[];
  dreadReanimateOnKill?: number;
  dreadRevealOnKill?: number;
};
const isDread = (s: GameState) =>
  s.scenarioId === "the-dread-realm" && !!s.dreadRealm;
const trait = (code: string, text: string) =>
  (card(code).traits ?? "").split(".").some((t) => t.trim() === text);
const undead = (u: Unit) => trait(u.code, "Undead");
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const sameTitle = (codes: string[], code: string) =>
  codes.some((c) => card(c).name === card(code).name);
const attachments = (s: GameState) =>
  [
    ...allCharacters(s),
    ...enemies(s),
    ...locations(s),
    ...allQuestUnits(s),
  ].flatMap((host) =>
    host.attachments.map((attachment) => ({ host, attachment })),
  );
const sorceries = (s: GameState) =>
  attachments(s).filter(
    ({ attachment: a }) => a.code === D.wraith || trait(a.code, "Sorcery"),
  );
const boss = (s: GameState) => enemies(s).find((u) => u.code === D.daechanar);
function order(s: GameState, effects: Effect[], text: string) {
  if (effects.length === 1) prepend(s, effects[0]);
  else if (effects.length)
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
function topUndead(s: GameState) {
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (
      card(s.encounterDiscard[i]).type_code === "enemy" &&
      trait(s.encounterDiscard[i], "Undead")
    )
      return i;
  return -1;
}
function restoreUndead(s: GameState, engaged: boolean) {
  const i = topUndead(s);
  if (i < 0) return;
  const u = make(s, s.encounterDiscard.splice(i, 1)[0]);
  if (engaged) engage(s, u);
  else {
    s.staging.push(u);
    enemyAddedToStaging(s, u);
  }
}
/** Preserve the real player card, hiding its printed face and abilities until it leaves play. */
export function dreadReanimate(
  s: GameState,
  physical: Unit,
  player = activeSeat(s),
  staging = false,
) {
  const enemy = make(s, D.reanimated);
  enemy.id = physical.id;
  enemy.facedownCard = physical.code;
  enemy.facedownCardId = physical.id;
  enemy.owner = physical.owner ?? player;
  if (staging) {
    s.staging.push(enemy);
    enemyAddedToStaging(s, enemy);
  } else forOwner(s, player, () => engage(s, enemy));
  log(
    s,
    `${seatName(s, player)} reanimates a facedown card${staging ? " into the staging area" : " engaged with them"}.`,
    "danger",
  );
  return enemy;
}
export function setupDreadRealm(s: GameState) {
  const recipe = DREAD_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    recipe.cards
      .filter((r) => r.section === section)
      .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.encounterDeck = pile("sharedEncounterDeck");
  s.dreadRealm = {
    initialized: false,
    daechanarDefeated: false,
    setAside: pile("sharedSetAside").map((c) => make(s, c)),
    pendingWraiths: [],
    discardBindings: [],
    terrorRound: -1,
    terrorThreat: 0,
  };
}
export function dreadOpeningHandsKept(s: GameState) {
  if (!isDread(s) || s.dreadRealm!.initialized) return false;
  prepend(s, fx("dreadSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function dreadStats(s: GameState, u: Unit) {
  const result = { will: 0, attack: 0, defense: 0, health: 0 };
  if (!isDread(s)) return result;
  const wraiths = u.attachments.filter(
    (a) => a.code === D.wraith && !a.blanked,
  ).length;
  result.will -= wraiths;
  result.attack -= wraiths;
  result.defense -= wraiths;
  if (u.code === D.reanimated) {
    const halls = s.staging.filter(
      (l) => l.code === D.halls && !l.blanked,
    ).length;
    result.attack += halls;
    result.defense += halls;
  }
  if (u.code === D.daechanar && !u.blanked)
    result.attack += sorceries(s).length;
  return result;
}
export const dreadWillZero = (s: GameState, u: Unit) =>
  isDread(s) && u.attachments.some((a) => a.code === D.fell && !a.blanked);
export const dreadMustCommit = dreadWillZero;
export const dreadIndestructible = (s: GameState, u: Unit) =>
  isDread(s) && u.code === D.daechanar && !u.blanked && sorceries(s).length > 0;
export const dreadCannotAttach = (s: GameState, u: Unit) =>
  isDread(s) && u.code === D.daechanar && !u.blanked;
export const dreadLocationProgressBlocked = (s: GameState, u: Unit) =>
  isDread(s) && u.code === D.altar && !u.blanked && !!boss(s);
export const dreadLocationThreat = (s: GameState, u: Unit) =>
  isDread(s) && u.code === D.crypt && !u.blanked
    ? (card(u.code).threat ?? 0) +
      enemies(s).filter((e) => e.code === D.reanimated).length
    : undefined;
export const dreadStagingThreat = (s: GameState) =>
  isDread(s) && s.dreadRealm!.terrorRound === s.round
    ? s.dreadRealm!.terrorThreat
    : 0;
export function dreadPlayCost(s: GameState, c: Card, owner = activeSeat(s)) {
  if (!isDread(s) || !sameTitle(seatView(s, owner).discard, c.code)) return 0;
  return allQuestUnits(s).reduce(
    (n, q) =>
      n + q.attachments.filter((a) => a.code === D.curse && !a.blanked).length,
    0,
  );
}
export function dreadCancelEnemyDamage(s: GameState, u: Unit, value: number) {
  if (
    !isDread(s) ||
    value <= 0 ||
    u.code !== D.daechanar ||
    u.blanked ||
    !sorceries(s).length
  )
    return false;
  prepend(s, fx("dreadRemoveSorcery", { player: firstPlayer(s) }));
  log(
    s,
    "Daechanar cancels all damage just dealt and removes a Sorcery card from the game.",
    "danger",
  );
  return true;
}
export function dreadCharacterLeft(
  s: GameState,
  u: Unit,
  destination: LeaveDestination,
) {
  if (
    !isDread(s) ||
    destination.zone !== "discard" ||
    destination.index === undefined ||
    card(u.code).sphere_code === "encounter"
  )
    return;
  const bindings = s.dreadRealm!.discardBindings;
  s.dreadRealm!.discardBindings = bindings.filter((b) => b.id !== u.id);
  s.dreadRealm!.discardBindings.push({
    id: u.id,
    code: u.code,
    owner: destination.player,
    index: destination.index,
  });
}
export function dreadPlayerCardDiscarded(s: GameState, u: Unit) {
  dreadCharacterLeft(s, u, {
    zone: "discard",
    player: activeSeat(s),
    index: s.discard.length - 1,
  });
}
export function dreadPlayerDiscardTaken(
  s: GameState,
  index: number,
  player = activeSeat(s),
) {
  if (!isDread(s)) return undefined;
  let id: string | undefined;
  s.dreadRealm!.discardBindings = s.dreadRealm!.discardBindings.flatMap((b) => {
    if (b.owner !== player) return [b];
    if (b.index === index) {
      id = b.id;
      return [];
    }
    return [{ ...b, index: b.index > index ? b.index - 1 : b.index }];
  });
  return id;
}
export function dreadEnemyLeaves(s: GameState, u: Unit) {
  if (!isDread(s)) return false;
  if (u.code === D.reanimated && u.facedownCard) {
    dreadCharacterLeft(
      s,
      { ...u, id: u.facedownCardId ?? u.id, code: u.facedownCard },
      {
        zone: "discard",
        player: u.owner ?? activeSeat(s),
        index: seatView(s, u.owner ?? activeSeat(s)).discard.length,
      },
    );
    return false;
  }
  if (u.code !== D.wraith || u.blanked) return false;
  const pending = make(s, u.code);
  pending.id = u.id;
  delete pending.owner;
  s.dreadRealm!.pendingWraiths.push(pending);
  prepend(s, fx("dreadWraithAttach", { source: u.id, player: firstPlayer(s) }));
  return true;
}
export function dreadAttachmentLeaves(
  s: GameState,
  host: Unit,
  a: Attachment,
  leaving: boolean,
) {
  if (!isDread(s) || a.blanked) return false;
  if (a.code === D.wraith && leaving) {
    const enemy = make(s, D.wraith);
    enemy.id = a.id;
    delete enemy.owner;
    s.staging.push(enemy);
    enemyAddedToStaging(s, enemy);
    log(
      s,
      "Wraith of Carn Dûm returns to the staging area as an enemy.",
      "danger",
    );
    return true;
  }
  if (a.code === D.possession && !leaving)
    prepend(
      s,
      fx("dreadDiscardPossessed", {
        target: host.id,
        player: ownerOf(s, host),
      }),
    );
  return false;
}
export function dreadCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat as DreadCombat | null;
  if (
    !isDread(s) ||
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  (c.dreadKilled ??= []).push({
    id: u.id,
    code: u.code,
    owner: u.owner ?? ownerOf(s, u),
    player: c.attackPlayer ?? activeSeat(s),
  });
}
export function dreadAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
) {
  if (!isDread(s)) return;
  const c = combat as DreadCombat,
    enemy = get(s, c.enemyId);
  const count =
    (c.dreadReanimateOnKill ?? 0) +
    (enemy?.code === D.dwimmerlaik && !enemy.blanked ? 1 : 0);
  const effects: Effect[] = [];
  for (const victim of c.dreadKilled ?? [])
    for (let i = 0; i < count; i++)
      effects.push(
        fx("dreadReanimateDiscard", {
          source: victim.id,
          code: victim.code,
          owner: victim.owner,
          player: victim.player,
          flag: true,
        }),
      );
  if (c.dreadKilled?.length)
    for (let i = 0; i < (c.dreadRevealOnKill ?? 0); i++)
      effects.push(fx("reveal", { player: firstPlayer(s) }));
  order(s, effects, "Choose the next after-attack Forced effect");
}
export function dreadEnemyDefeated(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (isDread(s) && destruction && u.code === D.daechanar)
    s.dreadRealm!.daechanarDefeated = true;
}
export function dreadEngaged(s: GameState, u: Unit) {
  if (isDread(s) && u.code === D.lord && !u.blanked)
    prepend(s, fx("dreadLord", { target: u.id, player: ownerOf(s, u) }));
}
export function dreadExplored(s: GameState, u: Unit) {
  if (isDread(s) && u.code === D.dungeon && !u.blanked)
    prepend(
      s,
      fx("dreadDungeonExplored", {
        source: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
}
export function dreadSideDefeated(s: GameState, u: Unit) {
  if (isDread(s) && u.code === D.power && !u.blanked)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("dreadRefill", { player })),
    );
}
export function dreadStagingEnd(s: GameState) {
  if (!isDread(s)) return;
  order(
    s,
    locations(s)
      .filter((l) => l.code === D.altar && !l.blanked)
      .map((l) => fx("dreadAltar", { source: l.id, player: firstPlayer(s) })),
    "Choose the next end-of-staging Forced effect",
  );
}
export function dreadQuestEnd(s: GameState): Effect[] {
  return isDread(s) && s.stage === 3
    ? [fx("dreadEscape", { player: firstPlayer(s) })]
    : [];
}
export function dreadRoundEnd(s: GameState): Effect[] {
  return isDread(s)
    ? locations(s)
        .filter((l) => l.code === D.tombs && !l.blanked)
        .map((l) => fx("dreadTombs", { source: l.id, player: firstPlayer(s) }))
    : [];
}
export function dreadRefreshEnd(s: GameState) {
  if (!isDread(s)) return;
  order(
    s,
    s.staging
      .filter((u) => u.code === D.seal && !u.blanked)
      .map((u) => fx("dreadSeal", { source: u.id, player: firstPlayer(s) })),
    "Choose the next end-of-refresh Forced effect",
  );
}
export function dreadTravelProblem(s: GameState, u: Unit) {
  if (!isDread(s) || u.code !== D.tombs || u.blanked) return null;
  const count = enemies(s).filter(undead).length;
  return count > 0 && s.encounterDeck.length >= count
    ? null
    : "Tombs of Carn Dûm requires one available shadow card for every Undead enemy in play.";
}
export function dreadTravel(s: GameState, u: Unit): Effect[] | undefined {
  return isDread(s) && u.code === D.tombs && !u.blanked
    ? [fx("dreadTombsTravel", { player: firstPlayer(s) })]
    : undefined;
}
/** This receives only progress that has passed through active-location buffering. */
export function dreadQuestProgress(
  s: GameState,
  n: number,
  playerEffect = false,
) {
  if (!isDread(s) || s.stage !== 3) return false;
  prepend(
    s,
    fx("dreadDivideProgress", {
      value: n,
      flag: playerEffect,
      player: firstPlayer(s),
    }),
  );
  return true;
}
export const dreadPreserveQuestAttachment = (
  s: GameState,
  code: string,
  a: Attachment,
) =>
  isDread(s) &&
  code === D.catacombs &&
  (a.code === D.wraith || trait(a.code, "Sorcery"));
export function dreadAdvance(s: GameState) {
  if (!isDread(s)) return false;
  if (
    !s.dreadRealm!.initialized ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 18) {
    if (questDefeated(s, D.catacombs)) return true;
    const old = s.questAttachments?.[D.catacombs] ?? [];
    const transfer = old.filter(
      (a) => a.code === D.wraith || trait(a.code, "Sorcery"),
    );
    (s.questAttachments ??= {})[D.catacombs] = old.filter(
      (a) => !transfer.includes(a),
    );
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    (s.questAttachments[D.awakened] ??= []).push(...transfer);
    prepend(s, fx("dreadStageTwo", { player: firstPlayer(s) }));
  } else if (s.stage === 2 && s.dreadRealm!.daechanarDefeated) {
    if (questDefeated(s, D.awakened)) return true;
    s.stage = 3;
    s.progress = 0;
    s.stageRevealing = true;
    prepend(s, fx("dreadStageThree", { player: firstPlayer(s) }));
  }
  return true;
}
/** Witch text is separate from cancelable shadow effects, and resolves after those effects. */
export function dreadShadowResolved(s: GameState, enemy: Unit, code: string) {
  if (
    isDread(s) &&
    enemy.code === D.witch &&
    !enemy.blanked &&
    trait(code, "Sorcery")
  )
    prepend(
      s,
      fx("dreadShadowSorcery", {
        source: enemy.id,
        code,
        player: s.combat?.attackPlayer ?? activeSeat(s),
      }),
    );
}
export function dreadEncounter(s: GameState, code: string, replay = false) {
  if (!isDread(s)) return false;
  if (code === D.cursed) {
    for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
      if (s.encounterDiscard[i] === D.cursed) {
        const u = make(s, s.encounterDiscard.splice(i, 1)[0]);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
  } else if (code === D.restless) {
    const targets = enemies(s).filter(undead);
    if (!targets.length && !replay)
      prepend(
        s,
        fx("amonSurgeWindow", { code }),
        fx("reveal", { player: firstPlayer(s) }),
      );
    for (const u of targets) {
      u.roundThreat = (u.roundThreat ?? 0) + 1;
      u.roundAttack = (u.roundAttack ?? 0) + 1;
      u.roundDefense = (u.roundDefense ?? 0) + 1;
    }
  } else if (code === D.sorcery)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("dreadDarkSorcery", { player })),
    );
  else if (code === D.terror)
    prepend(
      s,
      fx("dreadTerror", {
        ids: [],
        effects: playerOrder(s).map((player) =>
          fx("dreadMill", { count: 3, player }),
        ),
        player: firstPlayer(s),
      }),
    );
  else if (code === D.curse || code === D.calamity)
    prepend(s, fx("dreadQuestAttach", { code, player: firstPlayer(s) }));
  else if (code === D.fell)
    prepend(s, fx("dreadFellPlayer", { code, player: firstPlayer(s) }));
  else if (code === D.possession)
    prepend(s, fx("dreadPossession", { code, player: firstPlayer(s) }));
  else if (
    ![
      D.daechanar,
      D.dwimmerlaik,
      D.witch,
      D.wraith,
      D.tombs,
      D.altar,
      D.crypt,
      D.halls,
      D.dungeon,
      D.seal,
      D.power,
    ].includes(code)
  )
    return false;
  if (
    !replay &&
    card(code).type_code === "treachery" &&
    ![D.curse, D.calamity, D.fell, D.possession].includes(code)
  )
    s.encounterDiscard.push(code);
  return true;
}
export function dreadShadow(s: GameState, code: string) {
  const c = s.combat as DreadCombat | null;
  if (!isDread(s) || !c) return false;
  const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
  if ([D.dwimmerlaik, D.crypt].includes(code))
    c.dreadReanimateOnKill = (c.dreadReanimateOnKill ?? 0) + 1;
  else if (code === D.calamity) c.attackBonus += sorceries(s).length;
  else if (code === D.halls) {
    const player = c.attackPlayer ?? activeSeat(s),
      pile = seatView(s, player).discard;
    const candidates = defenders.flatMap((u) =>
      pile.flatMap((co, index) =>
        card(co).name === card(u.code).name ? [{ code: co, index }] : [],
      ),
    );
    if (candidates.length)
      choose(
        s,
        "Dark Halls · Reanimate a discarded copy of the defender",
        candidates.map((v) => ({
          id: String(v.index),
          label: card(v.code).name,
          code: v.code,
          effects: [
            fx("dreadReanimateDiscardIndex", {
              value: v.index,
              flag: true,
              player,
            }),
          ],
        })),
      );
  } else if (code === D.dungeon)
    prepend(
      s,
      fx("dreadDungeonShadow", { player: c.attackPlayer ?? activeSeat(s) }),
    );
  else if (code === D.cursed)
    c.attackBonus += defenders.some((u) =>
      sameTitle(seatView(s, u.owner ?? ownerOf(s, u)).discard, u.code),
    )
      ? 2
      : 1;
  else if (code === D.restless)
    for (const u of seatView(s, c.attackPlayer ?? activeSeat(s)).engaged.filter(
      undead,
    )) {
      u.roundAttack = (u.roundAttack ?? 0) + 1;
      u.roundDefense = (u.roundDefense ?? 0) + 1;
    }
  else if (code === D.lord) {
    c.attackBonus++;
    c.dreadRevealOnKill = (c.dreadRevealOnKill ?? 0) + 1;
  } else if (code === D.sorcery) {
    const targets = defenders.filter((u) =>
      sameTitle(seatView(s, u.owner ?? ownerOf(s, u)).discard, u.code),
    );
    if (targets.length === 1) discardCharacter(s, targets[0]);
    else if (targets.length)
      choose(
        s,
        "Dark Sorcery · Discard a defending character",
        opts(targets, (u) => [
          fx("dreadDiscardCharacter", { target: u.id, player: ownerOf(s, u) }),
        ]),
      );
  } else if (code === D.terror)
    prepend(
      s,
      fx("dreadMill", {
        count: 3,
        ids: [],
        effects: [fx("dreadTerrorShadow", { target: c.enemyId })],
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
  else return false;
  return true;
}

export function dreadEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("dread")) return false;
  if (!isDread(s)) return true;
  const q = s.dreadRealm!,
    u = get(s, e.target);
  switch (e.kind) {
    case "dreadSetup":
      if (!q.initialized) {
        q.initialized = true;
        s.stageRevealing = true;
        shuffle(s, s.encounterDeck);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("reveal", { player })),
          ...playerOrder(s).map((player) =>
            fx("dreadReanimateDeck", { count: 1, player }),
          ),
          fx("dreadStageReady", { player: firstPlayer(s) }),
        );
      }
      break;
    case "dreadStageReady":
      s.stageRevealing = false;
      break;
    case "dreadStageTwo": {
      const enemy = q.setAside.find((u) => u.code === D.daechanar),
        altar = q.setAside.find((u) => u.code === D.altar);
      if (enemy) {
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      if (altar) {
        s.staging.push(...allActiveLocations(s));
        s.extraActiveLocations = [];
        s.activeLocation = altar;
      }
      q.setAside = [];
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("dreadReanimateDeck", { count: 1, player }),
        ),
        fx("dreadStageReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "dreadStageThree":
      prepend(
        s,
        fx("dreadFindLocations", { player: firstPlayer(s) }),
        fx("dreadStageReady", { player: firstPlayer(s) }),
      );
      break;
    case "dreadFindLocations": {
      const count =
        playerOrder(s).length -
        s.staging.filter((u) => card(u.code).type_code === "location").length;
      if (count <= 0) break;
      const options = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(
            (co) => card(co).type_code === "location",
          ),
        ),
      ].map((co) => ({
        id: co,
        label: card(co).name,
        code: co,
        effects: [
          fx("dreadAddLocation", { code: co }),
          fx("dreadFindLocations", { player: firstPlayer(s) }),
        ],
      }));
      choose(
        s,
        `Daechanar's Fall · Add ${count} more staging location${count === 1 ? "" : "s"}`,
        options,
      );
      break;
    }
    case "dreadAddLocation": {
      const pile = s.encounterDeck.includes(e.code!)
          ? s.encounterDeck
          : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) {
        s.staging.push(make(s, pile.splice(i, 1)[0]));
        if (pile === s.encounterDeck) shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "dreadReanimateDeck":
      if ((e.count ?? 1) > 0 && s.deck.length) {
        dreadReanimate(s, takePlayerDeck(s), activeSeat(s));
        if ((e.count ?? 1) > 1)
          prepend(s, fx("dreadReanimateDeck", { ...e, count: e.count! - 1 }));
      }
      break;
    case "dreadReanimateDiscard": {
      const binding = q.discardBindings.find(
        (b) => b.id === e.source && b.owner === e.owner,
      );
      if (!binding) break;
      const player = e.player ?? activeSeat(s);
      let physical!: Unit;
      forOwner(s, binding.owner, () => {
        physical = takePlayerDiscard(s, binding.index, {
          encounterEffect: true,
        });
      });
      physical.id = e.source!;
      physical.owner = binding.owner;
      const enemy = dreadReanimate(s, physical, player, e.text === "staging");
      if (e.code === D.possession)
        enemy.attachments.push({
          id: `a${s.nextId++}`,
          code: D.possession,
          exhausted: false,
        });
      if (e.flag) {
        const shadow = encounterDraw(s, true);
        if (shadow) enemy.shadows.push(shadow);
      }
      break;
    }
    case "dreadReanimateDiscardIndex":
      if (e.value !== undefined && e.value >= 0 && e.value < s.discard.length) {
        const enemy = dreadReanimate(
          s,
          takePlayerDiscard(s, e.value, { encounterEffect: true }),
        );
        if (e.flag) {
          const shadow = encounterDraw(s, true);
          if (shadow) enemy.shadows.push(shadow);
        }
      }
      break;
    case "dreadWraithAttach": {
      const wraith = q.pendingWraiths.find((u) => u.id === e.source);
      if (!wraith) break;
      const targets = allCharacters(s);
      if (!targets.length) {
        q.pendingWraiths = q.pendingWraiths.filter((u) => u.id !== e.source);
        s.encounterDiscard.push(D.wraith);
        break;
      }
      choose(
        s,
        "Wraith of Carn Dûm · Attach to a character",
        opts(targets, (u) => [
          fx("dreadAttachWraith", {
            source: wraith.id,
            target: u.id,
            player: ownerOf(s, u),
          }),
        ]),
      );
      break;
    }
    case "dreadAttachWraith": {
      const wraith = q.pendingWraiths.find((u) => u.id === e.source);
      if (u && wraith) {
        u.attachments.push({ id: wraith.id, code: D.wraith, exhausted: false });
        q.pendingWraiths = q.pendingWraiths.filter((u) => u.id !== wraith.id);
        syncAttachmentText(s);
      }
      break;
    }
    case "dreadRemoveSorcery":
      choose(
        s,
        "Daechanar · Remove a Sorcery card from the game",
        sorceries(s).map(({ host, attachment: a }) => ({
          id: a.id,
          label: `${card(a.code).name} · ${name(host)}`,
          code: a.code,
          effects: [
            fx("dreadRemoveSorceryCard", {
              target: host.id,
              source: a.id,
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    case "dreadRemoveSorceryCard": {
      const pair = sorceries(s).find(({ attachment: a }) => a.id === e.source);
      if (pair) {
        pair.host.attachments = pair.host.attachments.filter(
          (a) => a.id !== e.source,
        );
        if (pair.host.id.startsWith("quest:"))
          (s.questAttachments ??= {})[pair.host.code] = pair.host.attachments;
        (s.removedEncounter ??= []).push(pair.attachment.code);
        syncAttachmentText(s);
      }
      break;
    }
    case "dreadQuestAttach": {
      const quest = currentQuestUnit(s);
      if (!quest) {
        s.encounterDiscard.push(e.code!);
        break;
      }
      attachToQuest(s, quest.code, {
        id: `a${s.nextId++}`,
        code: e.code!,
        exhausted: false,
      });
      if (e.code === D.calamity)
        prepend(
          s,
          fx("dreadReanimateDeck", {
            count: attachments(s).filter(
              ({ attachment: a }) => a.code === D.calamity,
            ).length,
            player: firstPlayer(s),
          }),
        );
      break;
    }
    case "dreadFellPlayer": {
      const high = Math.max(
        ...playerOrder(s).map((p) => seatView(s, p).threat),
      );
      const players = playerOrder(s).filter(
        (p) => seatView(s, p).threat === high,
      );
      if (players.length === 1)
        prepend(s, fx("dreadFellHero", { player: players[0] }));
      else
        choose(
          s,
          "A Fell Dread · Choose the player with highest threat",
          players.map((p) => ({
            id: String(p),
            label: seatName(s, p),
            effects: [fx("dreadFellHero", { player: p })],
          })),
        );
      break;
    }
    case "dreadFellHero": {
      const targets = s.heroes.filter(
        (u) => !u.attachments.some((a) => a.code === D.fell),
      );
      if (!targets.length) {
        s.encounterDiscard.push(D.fell);
        break;
      }
      choose(
        s,
        "A Fell Dread · Attach to a hero you control",
        opts(targets, (u) => [fx("dreadAttachFell", { target: u.id })]),
      );
      break;
    }
    case "dreadAttachFell":
      if (u) {
        u.attachments.push({
          id: `a${s.nextId++}`,
          code: D.fell,
          exhausted: false,
        });
        syncAttachmentText(s);
      } else s.encounterDiscard.push(D.fell);
      break;
    case "dreadPossession": {
      const allies = allCharacters(s).filter(isAlly);
      const cost = (u: Unit) => Number(card(u.code).cost) || 0;
      const maximum = Math.max(...allies.map(cost));
      const targets = allies.filter((u) => cost(u) === maximum);
      if (!targets.length) {
        s.encounterDiscard.push(D.possession);
        break;
      }
      choose(
        s,
        "Possession · Destroy a highest-cost ally",
        opts(targets, (u) => [
          fx("dreadPossessAlly", { target: u.id, player: ownerOf(s, u) }),
        ]),
      );
      break;
    }
    case "dreadPossessAlly":
      if (u) {
        const controller = ownerOf(s, u),
          owner = u.owner ?? controller,
          id = u.id;
        destroy(s, u);
        if (s.status === "playing")
          prepend(
            s,
            fx("dreadReanimateDiscard", {
              source: id,
              code: D.possession,
              owner,
              player: controller,
              text: "staging",
            }),
          );
      } else s.encounterDiscard.push(D.possession);
      break;
    case "dreadDiscardPossessed":
      if (u) destroy(s, u, false);
      break;
    case "dreadDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "dreadDarkSorcery":
      for (const target of s.allies.filter(
        (u) => isAlly(u) && sameTitle(s.discard, u.code),
      ))
        discardCharacter(s, target);
      break;
    case "dreadLord":
      restoreUndead(s, true);
      break;
    case "dreadSeal":
      for (let i = 0; i < 3 && s.encounterDeck.length; i++)
        s.encounterDiscard.push(s.encounterDeck.shift()!);
      restoreUndead(s, false);
      break;
    case "dreadRefill":
      for (let i = 0; i < 5 && s.discard.length; i++)
        putPlayerDeck(
          s,
          takePlayerDiscard(s, s.discard.length - 1, { encounterEffect: true }),
        );
      shuffle(s, s.deck);
      break;
    case "dreadAltar": {
      const options = [
        {
          id: "reveal",
          label: "Reveal an additional encounter card",
          effects: [fx("reveal", { player: firstPlayer(s) })],
        },
      ];
      if (s.deck.length)
        options.push({
          id: "reanimate",
          label: "Reanimate the top card of your deck",
          effects: [
            fx("dreadReanimateDeck", { count: 1, player: firstPlayer(s) }),
          ],
        });
      choose(s, "Altar of Midwinter · Reveal or reanimate", options);
      break;
    }
    case "dreadTombs":
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("dreadMill", {
            count: 1,
            ids: [],
            effects: [fx("dreadTombsReanimate")],
            player,
          }),
        ),
      );
      break;
    case "dreadTombsReanimate":
      if (e.source && e.code && card(e.code).type_code === "ally")
        prepend(
          s,
          fx("dreadReanimateDiscard", {
            source: e.source,
            owner: e.owner,
            code: e.code,
            player: activeSeat(s),
          }),
        );
      break;
    case "dreadTombsTravel":
      for (const enemy of enemies(s).filter(undead)) {
        const shadow = encounterDraw(s, true);
        if (shadow) enemy.shadows.push(shadow);
      }
      break;
    case "dreadEscape":
      if (!locations(s).length) {
        win(s);
        s.reason = "You have escaped Carn Dûm.";
      } else
        prepend(
          s,
          ...allCharacters(s).map((u) =>
            fx("damage", { target: u.id, value: 1, player: ownerOf(s, u) }),
          ),
        );
      break;
    case "dreadDivideProgress": {
      const amount = e.value ?? 0;
      const targets = s.staging.filter(
        (u) =>
          card(u.code).type_code === "location" &&
          !dreadLocationProgressBlocked(s, u) &&
          (!e.flag || !playerCardImmune(u)),
      );
      if (amount <= 0 || !targets.length) break;
      choose(
        s,
        "Daechanar's Fall · Divide progress among staging locations",
        targets.flatMap((u) =>
          Array.from(
            {
              length: Math.min(
                amount,
                Math.max(0, locationQuest(s, u) - u.progress),
              ),
            },
            (_, i) => ({
              id: `${u.id}:${i + 1}`,
              code: u.code,
              label: `${name(u)} · ${i + 1} progress`,
              effects: [
                fx("dreadPlaceProgress", {
                  target: u.id,
                  value: i + 1,
                  player: firstPlayer(s),
                }),
                fx("dreadDivideProgress", {
                  value: amount - i - 1,
                  flag: e.flag,
                  player: firstPlayer(s),
                }),
              ],
            }),
          ),
        ),
      );
      break;
    }
    case "dreadPlaceProgress":
      if (u) progressLocation(s, u, e.value ?? 0);
      break;
    case "dreadDungeonExplored": {
      if (!s.hand.length) break;
      const index = Math.floor(random(s) * s.hand.length),
        physical = s.hand.splice(index, 1)[0];
      const enemy = dreadReanimate(s, physical);
      const discardIndex = s.encounterDiscard.lastIndexOf(D.dungeon);
      if (discardIndex >= 0) s.encounterDiscard.splice(discardIndex, 1);
      enemy.shadows.push(D.dungeon);
      break;
    }
    case "dreadDungeonShadow": {
      const codes: string[] = [];
      for (let i = 0; i < 2 && s.encounterDeck.length; i++) {
        const co = s.encounterDeck.shift()!;
        s.encounterDiscard.push(co);
        if (trait(co, "Sorcery")) codes.push(co);
      }
      order(
        s,
        codes.map((code) =>
          fx("dreadDiscardSorcery", { code, player: activeSeat(s) }),
        ),
        "Choose the next discarded Sorcery When Revealed effect",
      );
      break;
    }
    case "dreadShadowSorcery": {
      const enemy = get(s, e.source);
      if (!enemy) break;
      if ([D.curse, D.calamity, D.fell, D.possession].includes(e.code!)) {
        const index = enemy.shadows
          .slice(0, enemy.revealedShadowCount ?? 0)
          .lastIndexOf(e.code!);
        if (index >= 0) removeShadowCard(enemy, index);
      }
      dreadEncounter(s, e.code!, true);
      break;
    }
    case "dreadDiscardSorcery":
      if ([D.curse, D.calamity, D.fell, D.possession].includes(e.code!)) {
        const i = s.encounterDiscard.lastIndexOf(e.code!);
        if (i >= 0) s.encounterDiscard.splice(i, 1);
      }
      dreadEncounter(s, e.code!, true);
      break;
    case "dreadMill": {
      if (!(e.count ?? 0) || !s.deck.length) {
        prepend(
          s,
          ...(e.effects ?? []).map((next) => ({
            ...next,
            ids: [...(next.ids ?? []), ...(e.ids ?? [])],
            player: next.player ?? activeSeat(s),
          })),
        );
        break;
      }
      const before = s.queue.length;
      const index = s.discard.length;
      const codes = discardPlayerDeck(s, 1, activeSeat(s), true, false);
      const responses = s.queue.splice(0, s.queue.length - before);
      const physical = q.discardBindings.find(
        (b) => b.owner === activeSeat(s) && b.index === index,
      );
      const effects = (e.effects ?? []).map((next) =>
        next.kind === "dreadTombsReanimate" && physical
          ? {
              ...next,
              source: physical.id,
              code: physical.code,
              owner: physical.owner,
            }
          : next,
      );
      const continuation = fx("dreadMill", {
        ...e,
        count: (e.count ?? 0) - codes.length,
        ids: [...(e.ids ?? []), ...codes],
        effects,
      });
      prepend(s, ...responses, continuation);
      break;
    }
    case "dreadTerror": {
      const [next, ...effects] = e.effects ?? [];
      if (next)
        prepend(
          s,
          fx("dreadMill", {
            ...next,
            ids: [],
            effects: [
              fx("dreadTerror", {
                ids: e.ids,
                effects,
                player: firstPlayer(s),
              }),
            ],
          }),
        );
      else {
        if (q.terrorRound !== s.round) {
          q.terrorRound = s.round;
          q.terrorThreat = 0;
        }
        q.terrorThreat +=
          2 * new Set((e.ids ?? []).map((co) => card(co).type_code)).size;
      }
      break;
    }
    case "dreadTerrorShadow":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.attackBonus += new Set(
          (e.ids ?? []).map((co) => card(co).type_code),
        ).size;
      break;
    default:
      throw new Error(`Unknown Dread Realm effect ${e.kind}`);
  }
  return true;
}
