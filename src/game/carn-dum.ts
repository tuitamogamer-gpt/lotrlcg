import type { Card, Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  engagementCost,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  putPlayerDeck,
  random,
  removeShadowCard,
  shuffle,
  stats,
  takePlayerDeck,
} from "./core";
import {
  advanceDefense,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  questDefeated,
  raiseThreat,
  takePlayerDiscard,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { allQuestUnits, attachToQuest, currentQuestUnit } from "./quest-state";
import { choosePlayerResponse } from "./player-ability-triggers";
import { foundationsPlayerCardDiscarded } from "./foundations-player-cards";
import { dwarfDeckDiscarded } from "./dwarf-player-cards";
import { heirsShadowDealt } from "./heirs-numenor";
import { CARN as C, CARN_RECIPES } from "./carn-dum-support";

type CarnCombat = NonNullable<GameState["combat"]> & {
  carnFlipAfter?: number;
  carnExtraAttacks?: number;
  carnVileSearch?: number;
  carnKilledAllies?: string[];
};
const isCarn = (s: GameState) =>
  s.scenarioId === "the-battle-of-carn-dum" && !!s.carnDum;
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const boss = (s: GameState) => enemies(s).find((u) => u.code === C.thaurdir);
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location" && !u.blanked,
  );
const active = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code && !u.blanked);
const sameTitle = (a: string, b: string) => card(a).name === card(b).name;
const sorcery = (code: string) =>
  card(code).type_code === "treachery" &&
  (card(code).traits ?? "").split(".").some((t) => t.trim() === "Sorcery");
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
function ordered(s: GameState, effects: Effect[], text: string) {
  if (effects.length === 1) prepend(s, effects[0]);
  else if (effects.length)
    prepend(s, fx("fangornOrder", { effects, text, player: firstPlayer(s) }));
}
function dealShadow(s: GameState, u: Unit) {
  const code = encounterDraw(s, true);
  if (!code) return false;
  u.shadows.push(code);
  if (u.faceupShadows) u.faceupShadows.push(false);
  heirsShadowDealt(s, u);
  return true;
}

export function setupCarnDum(s: GameState) {
  const recipe = CARN_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  s.encounterDeck = recipe.cards
    .filter((r) => r.section === "sharedEncounterDeck")
    .flatMap((r) => Array<string>(r.quantity).fill(r.code));
  s.carnDum = {
    initialized: false,
    furiousRound: -1,
    furiousPenalty: 0,
    terrorRound: -1,
    terrorThreat: 0,
    threeShadowIds: [],
  };
}
export function carnOpeningHandsKept(s: GameState) {
  if (!isCarn(s) || s.carnDum!.initialized) return false;
  prepend(s, fx("carnSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
/** Exactly-three conditions are latched, including when an attack is prevented. */
export function carnCheck(s: GameState) {
  if (!isCarn(s) || !s.carnDum!.initialized || s.status !== "playing") return;
  const q = s.carnDum!,
    live = enemies(s);
  const eligible = live.filter(
    (u) =>
      u.shadows.length === 3 &&
      ((u.code === C.thaurdir && s.stage === 1) ||
        (u.code === C.wolf &&
          !u.blanked &&
          s.staging.some((e) => e.id === u.id))),
  );
  const ids = new Set(eligible.map((u) => u.id));
  q.threeShadowIds = q.threeShadowIds.filter((id) => ids.has(id));
  const effects: Effect[] = [];
  for (const u of eligible)
    if (!q.threeShadowIds.includes(u.id)) {
      q.threeShadowIds.push(u.id);
      effects.push(
        fx(u.code === C.thaurdir ? "carnFlip" : "carnWolf", {
          target: u.id,
          code: u.code,
          player: firstPlayer(s),
          text: `${name(u)} · Exactly three shadow cards`,
        }),
      );
    }
  ordered(s, effects, "Carn Dûm · Choose the next three-shadow Forced effect");
}
export function carnShadowDealt(s: GameState, _u: Unit) {
  carnCheck(s);
}
export const carnUsesExistingShadows = (s: GameState, u: Unit) =>
  isCarn(s) && [C.thaurdir, C.wolf].includes(u.code);
/** The caller keeps the existing array instead of suspending/restoring it. */
export function carnImmediateShadows(s: GameState, u: Unit, noDeal = false) {
  if (!carnUsesExistingShadows(s, u)) return false;
  u.revealedShadowCount = 0;
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  if (!noDeal) dealShadow(s, u);
  return true;
}
/** Ordinary resolved shadows leave after an attack; stage 1 keeps only unresolved ones. */
export function carnFinishEnemyShadows(s: GameState, u: Unit) {
  if (!isCarn(s)) return false;
  const count = Math.min(u.shadows.length, u.revealedShadowCount ?? 0);
  for (let i = 0; i < count; i++) {
    const code = removeShadowCard(u, 0);
    if (code) s.encounterDiscard.push(code);
  }
  delete u.shadowCancelsDamage;
  delete u.shadowCancelsCombatDamage;
  u.revealedShadowCount = 0;
  carnCheck(s);
  return true;
}
export function carnCombatEndShadows(s: GameState, u: Unit) {
  if (!isCarn(s) || s.stage !== 1) return false;
  carnFinishEnemyShadows(s, u);
  return true;
}
export const carnConsideredEngaged = (
  s: GameState,
  u: Unit,
  player = activeSeat(s),
) =>
  isCarn(s) &&
  s.stage === 2 &&
  u.code === C.thaurdir &&
  s.staging.some((e) => e.id === u.id) &&
  playerOrder(s).includes(player);
export const carnCannotEngage = (s: GameState, u: Unit) =>
  isCarn(s) && u.code === C.thaurdir;
export const carnCannotDamage = (s: GameState, u: Unit) =>
  isCarn(s) && s.stage === 1 && u.code === C.thaurdir;
export const carnIndestructible = (s: GameState, u: Unit) =>
  isCarn(s) &&
  u.code === C.thaurdir &&
  !u.blanked &&
  !(s.stage === 2 && s.progress >= 15);
export const carnCannotAttach = (s: GameState, u: Unit) =>
  isCarn(s) && u.code === C.thaurdir && !u.blanked;
export function carnEngagementModifier(s: GameState, u: Unit) {
  const b = boss(s);
  return isCarn(s) &&
    b &&
    !b.blanked &&
    u.code !== C.thaurdir &&
    card(u.code).type_code === "enemy"
    ? b.flipped
      ? -10
      : 10
    : 0;
}
export const carnStats = (s: GameState, u: Unit) => ({
  defense:
    isCarn(s) &&
    s.carnDum!.furiousRound === s.round &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
      ? -s.carnDum!.furiousPenalty
      : 0,
});
export const carnThreatBonus = (s: GameState, u: Unit) =>
  isCarn(s) && u.code === C.garrison && !u.blanked ? u.shadows.length : 0;
export const carnStagingThreat = (s: GameState) =>
  isCarn(s) && s.carnDum!.terrorRound === s.round ? s.carnDum!.terrorThreat : 0;
export const carnQuestStat = (s: GameState): "attack" | undefined =>
  isCarn(s) && active(s, C.battlefield) ? "attack" : undefined;
export function carnProgress(s: GameState, amount: number) {
  return isCarn(s)
    ? Math.max(
        0,
        amount -
          enemies(s).filter((u) => u.code === C.grunts && !u.blanked).length,
      )
    : amount;
}
export function carnAfterQuestProgress(
  s: GameState,
  u: Unit | undefined,
  amount: number,
) {
  if (!isCarn(s) || amount <= 0 || u?.code !== C.furious || u.blanked) return;
  if (s.carnDum!.furiousRound !== s.round) s.carnDum!.furiousPenalty = 0;
  s.carnDum!.furiousRound = s.round;
  s.carnDum!.furiousPenalty += 2;
  const b = boss(s);
  if (b && !b.flipped)
    prepend(
      s,
      fx("carnFlip", {
        target: b.id,
        player: firstPlayer(s),
        text: "Furious Charge · Captain flips",
      }),
    );
}
export function carnSideDefeated(s: GameState, u: Unit) {
  if (!isCarn(s) || u.blanked) return;
  if (u.code === C.power)
    prepend(s, ...playerOrder(s).map((player) => fx("carnRefill", { player })));
  if (u.code === C.furious) {
    const forced = s.queue.filter(
      (e) =>
        e.kind === "carnFlip" && e.text === "Furious Charge · Captain flips",
    );
    s.queue = s.queue.filter((e) => !forced.includes(e));
    prepend(
      s,
      ...forced,
      fx("carnFuriousResponse", { source: u.id, player: firstPlayer(s) }),
    );
  }
}
export function carnPlayCost(s: GameState, c: Card, owner = activeSeat(s)) {
  if (
    !isCarn(s) ||
    !seatView(s, owner).discard.some((code) => sameTitle(code, c.code))
  )
    return 0;
  return allQuestUnits(s).reduce(
    (n, u) =>
      n + u.attachments.filter((a) => a.code === C.curse && !a.blanked).length,
    0,
  );
}
export function carnResourceSpent(s: GameState, u: Unit, amount: number) {
  if (!isCarn(s) || amount <= 0) return;
  const copies = allActiveLocations(s).filter(
    (l) => l.code === C.walls && !l.blanked,
  ).length;
  prepend(
    s,
    ...Array.from({ length: amount * copies }, () =>
      fx("carnResourceTax", { value: 1, player: ownerOf(s, u) }),
    ),
  );
}
export function carnEventPlayed(s: GameState, _code?: string) {
  if (!isCarn(s)) return;
  for (const u of enemies(s).filter((u) => u.code === C.wolf && !u.blanked))
    dealShadow(s, u);
  carnCheck(s);
}
export function carnAfterReveal(
  s: GameState,
  code: string,
  _origin?: Effect["revealOrigin"],
) {
  if (!isCarn(s) || !sorcery(code)) return;
  const u = boss(s);
  if (u && !u.blanked)
    prepend(
      s,
      fx("carnBossForced", {
        target: u.id,
        flag: !!u.flipped,
        player: firstPlayer(s),
      }),
    );
}
export function carnEndRound(s: GameState) {
  if (!isCarn(s)) return;
  const b = boss(s);
  if (b && ((s.stage === 1 && b.flipped) || (s.stage === 2 && !b.flipped)))
    prepend(s, fx("carnFlip", { target: b.id, player: firstPlayer(s) }));
}
export function carnTravelProblem(s: GameState, u: Unit) {
  if (!isCarn(s) || u.blanked || u.code !== C.blight) return null;
  return enemies(s).length && s.encounterDeck.length >= enemies(s).length
    ? null
    : "Blight of Carn Dûm requires one shadow card for every enemy in play.";
}
export function carnTravel(s: GameState, u: Unit): Effect[] | undefined {
  return isCarn(s) && !u.blanked && u.code === C.blight
    ? [fx("carnDealAll", { player: firstPlayer(s) })]
    : undefined;
}
export function carnEnemyDefeated(s: GameState, u: Unit) {
  if (isCarn(s) && s.stage === 2 && u.code === C.thaurdir) win(s);
}
export function carnAdvance(s: GameState) {
  if (!isCarn(s)) return false;
  if (
    !s.carnDum!.initialized ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.stage === 1 && s.progress >= 15) {
    if (questDefeated(s, C.clutches)) return true;
    s.stage = 2;
    s.progress = 0;
    s.stageRevealing = true;
    log(s, "Midwinter's Crux · The final battle with Thaurdir.", "chapter");
    prepend(s, fx("carnStageTwo", { player: firstPlayer(s) }));
  }
  return true;
}
export function carnCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    !isCarn(s) ||
    !s.combat ||
    !context.combatDamage ||
    context.enemyId !== s.combat.enemyId ||
    card(u.code).type_code !== "ally"
  )
    return;
  const c = s.combat as CarnCombat;
  (c.carnKilledAllies ??= []).push(u.code);
}
export function carnAttackFinished(
  s: GameState,
  combat: NonNullable<GameState["combat"]>,
) {
  if (!isCarn(s)) return;
  const c = combat as CarnCombat,
    player = c.attackPlayer ?? activeSeat(s),
    effects: Effect[] = [];
  for (const u of locations(s).filter((u) => u.code === C.blight))
    effects.push(
      fx("carnHealEnemy", {
        target: c.enemyId,
        value: 1,
        code: u.code,
        player,
      }),
    );
  for (let i = 0; i < (c.carnFlipAfter ?? 0); i++)
    effects.push(
      fx("carnFlip", {
        target: boss(s)?.id,
        player: firstPlayer(s),
        code: C.will,
      }),
    );
  for (let i = 0; i < (c.carnVileSearch ?? 0); i++)
    for (const code of c.carnKilledAllies ?? [])
      effects.push(fx("carnSearchAllyCopy", { code, player }));
  for (let i = 0; i < (c.carnExtraAttacks ?? 0); i++)
    effects.push(fx("carnRepeatAttack", { target: c.enemyId, player }));
  if (effects.length)
    prepend(s, fx("carnAttackEffects", { effects, player: firstPlayer(s) }));
}

export function carnEncounter(s: GameState, code: string, replay = false) {
  if (!isCarn(s)) return false;
  if (code === C.will) prepend(s, fx("carnWill", { player: firstPlayer(s) }));
  else if (code === C.sky)
    prepend(s, ...playerOrder(s).map((player) => fx("carnSky", { player })));
  else if (code === C.vile)
    prepend(s, ...playerOrder(s).map((player) => fx("carnVile", { player })));
  else if (code === C.sorcery)
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("carnDarkSorcery", { player })),
    );
  else if (code === C.curse)
    prepend(s, fx("carnCurse", { player: firstPlayer(s) }));
  else if (code === C.terror)
    prepend(
      s,
      fx("carnTerror", {
        ids: [],
        effects: playerOrder(s).map((player) =>
          fx("carnMill", { count: 3, player }),
        ),
        player: firstPlayer(s),
      }),
    );
  else if (
    ![
      C.thaurdir,
      C.grunts,
      C.garrison,
      C.wolf,
      C.battlefield,
      C.mountains,
      C.blight,
      C.walls,
      C.furious,
      C.power,
    ].includes(code)
  )
    return false;
  if (!replay && card(code).type_code === "treachery" && code !== C.curse)
    s.encounterDiscard.push(code);
  return true;
}
export function carnShadow(s: GameState, code: string) {
  if (!isCarn(s) || !s.combat) return false;
  const c = s.combat as CarnCombat,
    u = get(s, c.enemyId),
    player = c.attackPlayer ?? activeSeat(s);
  if (code === C.grunts && u) {
    const index = Math.max(0, (u.revealedShadowCount ?? 1) - 1);
    const removed = removeShadowCard(u, index);
    if (removed) {
      const orc = make(s, removed);
      s.staging.push(orc);
      enemyAddedToStaging(s, orc);
    }
  } else if (code === C.garrison) c.attackBonus += u?.shadows.length ?? 0;
  else if (code === C.battlefield)
    c.attackBonus +=
      u && seatView(s, player).threat > engagementCost(s, u) ? 3 : 1;
  else if (code === C.mountains)
    prepend(s, fx("carnThreat", { value: 2, player }));
  else if (code === C.blight) {
    if (u?.code === C.thaurdir) u.damage = Math.max(0, u.damage - 3);
  } else if (code === C.walls) {
    if (seatView(s, player).threat >= 40)
      c.carnExtraAttacks = (c.carnExtraAttacks ?? 0) + 1;
  } else if (code === C.will) c.carnFlipAfter = (c.carnFlipAfter ?? 0) + 1;
  else if (code === C.sky) prepend(s, fx("carnRandomHand", { player }));
  else if (code === C.vile) {
    c.attackBonus++;
    c.carnVileSearch = (c.carnVileSearch ?? 0) + 1;
  } else if (code === C.terror)
    prepend(
      s,
      fx("carnMill", {
        count: 3,
        ids: [],
        player,
        effects: [fx("carnShadowTerror", { target: c.enemyId, player })],
      }),
    );
  else if (code === C.sorcery) {
    const defenders = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
      .map((id) => get(s, id))
      .filter((u): u is Unit => !!u)
      .filter((u) =>
        seatView(s, u.owner ?? ownerOf(s, u)).discard.some((code) =>
          sameTitle(code, u.code),
        ),
      );
    if (defenders.length === 1) discardCharacter(s, defenders[0]);
    else if (defenders.length > 1)
      choose(
        s,
        "Dark Sorcery · Discard a defending character",
        opts(defenders, (u) => [
          fx("carnDiscardCharacter", { target: u.id, player: ownerOf(s, u) }),
        ]),
      );
  } else if (!card(code).shadow?.trim() && active(s, C.mountains))
    prepend(s, fx("carnThreat", { value: 2, player }));
  else return false;
  return true;
}

/** Granted effects remain cancellable even though the printed shadow is empty. */
export function carnShadowText(s: GameState, code: string): string | undefined {
  return (
    card(code).shadow ||
    (isCarn(s) && active(s, C.mountains)
      ? "Shadow: Raise defending player's threat by 2."
      : undefined)
  );
}

function discardCopies(s: GameState, code: string, one = false) {
  const indices = s.deck
    .map((c, i) => (sameTitle(c, code) ? i : -1))
    .filter((i) => i >= 0);
  const chosen = one ? indices.slice(0, 1) : indices;
  const codes: string[] = [];
  for (const i of chosen.reverse()) {
    const u = takePlayerDeck(s, i);
    codes.push(u.code);
    forOwner(s, u.owner ?? activeSeat(s), () => {
      s.discard.push(u.code);
      foundationsPlayerCardDiscarded(s, u);
    });
  }
  if (codes.length) dwarfDeckDiscarded(s, codes, activeSeat(s));
  shuffle(s, s.deck);
}
export function carnEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("carn")) return false;
  if (!isCarn(s)) return true;
  const q = s.carnDum!,
    u = get(s, e.target);
  switch (e.kind) {
    case "carnThreat":
    case "carnResourceTax":
      if ((e.value ?? 0) > 0) raiseThreat(s, e.value!, "encounter");
      break;
    case "carnSetup": {
      if (q.initialized) break;
      const recipe = CARN_RECIPES.find(
        (r) => r.mode === (s.easyMode ? "easy" : "standard"),
      )!;
      const count = recipe.cards.find(
        (r) => r.code === C.garrison && r.section === "sharedStagingArea",
      )!.quantity;
      const players = playerOrder(s).length,
        used = Math.min(count, players);
      s.staging.push(make(s, C.thaurdir));
      for (let i = 0; i < used; i++) s.staging.push(make(s, C.garrison));
      s.encounterDeck.push(...Array<string>(count - used).fill(C.garrison));
      s.activeLocation = make(s, C.battlefield);
      q.initialized = true;
      shuffle(s, s.encounterDeck);
      log(
        s,
        "Thaurdir commands the garrison · Captain side faceup.",
        "chapter",
      );
      break;
    }
    case "carnDealAll":
      for (const enemy of enemies(s)) dealShadow(s, enemy);
      carnCheck(s);
      break;
    case "carnFlip":
      if (u?.code === C.thaurdir) {
        u.flipped = !u.flipped;
        log(
          s,
          `Thaurdir flips to ${u.flipped ? "Champion" : "Captain"}.`,
          "danger",
        );
        if (!u.blanked)
          prepend(
            s,
            fx("carnBossForced", {
              target: u.id,
              flag: u.flipped,
              player: firstPlayer(s),
            }),
          );
      }
      break;
    case "carnBossForced":
      if (u?.code === C.thaurdir) {
        if (e.flag) {
          u.damage = Math.max(0, u.damage - 3);
          prepend(
            s,
            fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
          );
        } else prepend(s, fx("carnDealAll", { player: firstPlayer(s) }));
      }
      break;
    case "carnWolf":
      if (u?.code === C.wolf && s.staging.some((x) => x.id === u.id)) {
        engage(s, u);
        prepend(
          s,
          fx("immediateAttack", {
            target: u.id,
            player: firstPlayer(s),
            flag: true,
          }),
        );
      }
      break;
    case "carnWill": {
      const b = boss(s);
      if (!b) break;
      prepend(
        s,
        fx("carnFlip", { target: b.id, player: firstPlayer(s) }),
        fx("carnWillSurge", { player: firstPlayer(s), flag: !!b.flipped }),
      );
      break;
    }
    case "carnWillSurge":
      if (e.flag)
        prepend(
          s,
          fx("amonSurgeWindow", { code: C.will }),
          fx("reveal", { player: firstPlayer(s) }),
        );
      break;
    case "carnStageTwo": {
      const shadows = enemies(s).reduce((n, u) => n + u.shadows.length, 0),
        b = boss(s);
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("carnThreat", { value: shadows, player }),
        ),
        ...(b && !b.flipped
          ? [fx("carnFlip", { target: b.id, player: firstPlayer(s) })]
          : []),
        fx("carnStageReady"),
      );
      break;
    }
    case "carnStageReady":
      s.stageRevealing = false;
      break;
    case "carnFuriousResponse":
      choosePlayerResponse(
        s,
        e.source!,
        C.furious,
        "Furious Charge · Add 10 progress to the main quest?",
        [
          {
            id: "resolve",
            label: "Add 10 progress to the main quest",
            effects: [fx("carnMainProgress", { value: 10 })],
          },
          skip,
        ],
        undefined,
        firstPlayer(s),
      );
      break;
    case "carnMainProgress":
      s.progress += e.value ?? 10;
      break;
    case "carnRefill":
      for (let i = 0; i < 5 && s.discard.length; i++)
        putPlayerDeck(
          s,
          takePlayerDiscard(s, s.discard.length - 1, { encounterEffect: true }),
        );
      shuffle(s, s.deck);
      break;
    case "carnCurse": {
      const quest = currentQuestUnit(s);
      if (quest)
        attachToQuest(s, quest.code, {
          id: `a${s.nextId++}`,
          code: C.curse,
          exhausted: false,
        });
      else s.encounterDiscard.push(C.curse);
      break;
    }
    case "carnDarkSorcery":
      for (const ally of s.allies.filter((u) =>
        s.discard.some((c) => sameTitle(c, u.code)),
      ))
        discardCharacter(s, ally);
      break;
    case "carnDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "carnRandomHand":
      if (s.hand.length)
        discardHandCard(s, s.hand[Math.floor(random(s) * s.hand.length)].id);
      break;
    case "carnSky": {
      if (!s.hand.length) break;
      const chosen = s.hand[Math.floor(random(s) * s.hand.length)];
      discardHandCard(s, chosen.id);
      prepend(
        s,
        fx("carnDiscardCopies", { code: chosen.code, player: activeSeat(s) }),
      );
      break;
    }
    case "carnDiscardCopies":
      discardCopies(s, e.code!);
      break;
    case "carnSearchAllyCopy": {
      const candidates = [
        ...new Set(s.deck.filter((c) => sameTitle(c, e.code!))),
      ];
      if (candidates.length)
        choose(
          s,
          "Vile Affliction · Discard another copy of the destroyed ally",
          candidates.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("carnDiscardOneCopy", { code, player: activeSeat(s) }),
            ],
          })),
        );
      else shuffle(s, s.deck);
      break;
    }
    case "carnDiscardOneCopy":
      discardCopies(s, e.code!, true);
      break;
    case "carnVile": {
      const amount = Math.max(
        0,
        ...s.discard.map((code) => Number(card(code).cost) || 0),
      );
      const ids = [...s.heroes, ...s.allies]
        .filter((u) => u.committed || s.committedIds.includes(u.id))
        .map((u) => u.id);
      prepend(
        s,
        fx("carnAssignDamage", {
          value: amount,
          ids,
          effects: [],
          player: activeSeat(s),
        }),
      );
      break;
    }
    case "carnAssignDamage": {
      const amount = e.value ?? 0,
        targets = (e.ids ?? [])
          .map((id) => get(s, id))
          .filter((u): u is Unit => !!u),
        options: Option[] = [];
      for (const target of targets) {
        const reserved = (e.effects ?? [])
          .filter((f) => f.target === target.id)
          .reduce((n, f) => n + (f.value ?? 0), 0);
        const capacity = Math.max(
          0,
          stats(s, target).health - target.damage - reserved,
        );
        for (let n = 1; n <= Math.min(amount, capacity); n++)
          options.push({
            id: `${target.id}:${n}`,
            code: target.code,
            label: `${name(target)} · ${n} damage`,
            effects: [
              fx("carnAssignDamage", {
                ...e,
                value: amount - n,
                effects: [
                  ...(e.effects ?? []),
                  fx("damage", {
                    target: target.id,
                    value: n,
                    player: ownerOf(s, target),
                  }),
                ],
              }),
            ],
          });
      }
      if (!amount || !options.length) {
        const combined: Effect[] = [];
        for (const f of e.effects ?? []) {
          const previous = combined.find((g) => g.target === f.target);
          if (previous) previous.value = (previous.value ?? 0) + (f.value ?? 0);
          else combined.push({ ...f });
        }
        prepend(s, ...combined);
      } else
        choose(
          s,
          `Vile Affliction · Assign ${amount} remaining damage`,
          options,
          "Assign among characters you control that are committed to the quest, up to their remaining hit points.",
        );
      break;
    }
    case "carnMill": {
      const before = s.queue.length,
        codes = discardPlayerDeck(s, e.count ?? 3, activeSeat(s));
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        ...(e.effects ?? []).map((next) => ({
          ...next,
          ids: [...(next.ids ?? []), ...codes],
        })),
      );
      break;
    }
    case "carnTerror": {
      const [next, ...effects] = e.effects ?? [];
      if (next)
        prepend(
          s,
          fx("carnMill", {
            ...next,
            effects: [
              fx("carnTerror", { ids: e.ids, effects, player: firstPlayer(s) }),
            ],
          }),
        );
      else {
        if (q.terrorRound !== s.round) {
          q.terrorRound = s.round;
          q.terrorThreat = 0;
        }
        q.terrorThreat +=
          2 * new Set((e.ids ?? []).map((code) => card(code).type_code)).size;
      }
      break;
    }
    case "carnShadowTerror":
      if (s.combat && s.combat.enemyId === e.target)
        s.combat.attackBonus += new Set(
          (e.ids ?? []).map((code) => card(code).type_code),
        ).size;
      break;
    case "carnHealEnemy":
      if (u) u.damage = Math.max(0, u.damage - (e.value ?? 1));
      break;
    case "carnRepeatAttack":
      if (u)
        prepend(
          s,
          fx("immediateAttack", {
            target: u.id,
            player: e.player ?? activeSeat(s),
          }),
        );
      break;
    case "carnAttackEffects":
      prepend(
        s,
        fx("fangornOrder", {
          effects: e.effects,
          player: firstPlayer(s),
          text: "Carn Dûm · Choose the next after-attack effect",
        }),
        fx("carnAttackFinished"),
      );
      break;
    case "carnAttackFinished":
      advanceDefense(s);
      break;
    default:
      throw new Error(`Unknown Carn Dûm effect ${e.kind}`);
  }
  return true;
}
