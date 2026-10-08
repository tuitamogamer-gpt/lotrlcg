import { mainQuestCode } from "./quest-state";
import { beginEnemyAttack, enemyAttackStarted } from "./combat";
import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  units,
  locationQuest,
} from "./core";
import {
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  questDefeated,
  progressLocation,
  raiseThreat,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  attachmentController,
  firstPlayer,
  defendersFor,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
} from "./table";
import { currentQuestCode, mainQuestUnit } from "./quest-state";
import { heirsEnemyEntered, heirsShadowDealt } from "./heirs-numenor";
import { hasSilverLamp } from "./voice-isengard";
import {
  ANTLERED as A,
  RAVEN_CODES,
  printedLocationTime,
} from "./antlered-support";
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
export function antleredRoutePiles(s: GameState) {
  const q = s.antlered;
  if (!q) return;
  const routed = s.encounterDiscard.filter((c) => RAVEN_CODES.includes(c));
  if (routed.length) {
    s.encounterDiscard = s.encounterDiscard.filter(
      (c) => !RAVEN_CODES.includes(c),
    );
    q.ravenDiscard.push(...routed);
  }
  if (!q.ravenDeck.length && q.ravenDiscard.length) {
    q.ravenDeck = shuffle(s, q.ravenDiscard.splice(0));
    log(s, "The Raven discard pile is shuffled back into the Raven deck.");
  }
}
export function ravenDraw(s: GameState) {
  antleredRoutePiles(s);
  const c = s.antlered?.ravenDeck.shift();
  antleredRoutePiles(s);
  return c;
}
export function setupAntlered(s: GameState) {
  const fixed = [A.turch, A.chief, A.camp];
  s.antlered = {
    initialized: false,
    time: 0,
    ravenDeck: s.encounterDeck.filter((c) => RAVEN_CODES.includes(c)),
    ravenDiscard: [],
    setAside: [make(s, A.chief), make(s, A.camp)],
    setupEnemies: [],
  };
  s.encounterDeck = s.encounterDeck.filter(
    (c) => !fixed.includes(c) && !RAVEN_CODES.includes(c),
  );
}
export function antleredOpeningHandsKept(s: GameState) {
  if (!s.antlered || s.antlered.initialized) return false;
  prepend(s, fx("crownSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function antleredCardEntered(s: GameState, u: Unit, revealed: boolean) {
  if (s.antlered && printedLocationTime(u.code))
    u.timeCounters = revealed ? printedLocationTime(u.code) : 0;
}
export function antleredCheck(s: GameState) {
  antleredRoutePiles(s);
  if (!s.antlered?.initialized || s.status !== "playing") return;
  const t = allCharacters(s).find((u) => u.code === A.turch);
  if (!t) {
    s.status = "lost";
    s.reason = "Chief Turch has left play. The Boar Clan is defeated.";
    s.choice = null;
    s.queue = [];
    return;
  }
  for (const l of locations(s))
    if (locationQuest(s, l) > 0 && l.progress >= locationQuest(s, l))
      progressLocation(s, l, 0);
  const p = firstPlayer(s),
    owner = ownerOf(s, t);
  if (owner !== p) {
    forOwner(s, owner, () => {
      s.allies = s.allies.filter((u) => u.id !== t.id);
    });
    forOwner(s, p, () => s.allies.push(t));
  }
}
export const antleredNoDefenseExhaust = (u: Unit) =>
  u.code === A.turch && !u.blanked;
export const antleredCannotDamage = (s: GameState, u: Unit) =>
  u.code === A.chief &&
  !u.blanked &&
  locations(s).some((l) => l.code === A.camp);
export const antleredLocationBonus = (s: GameState, u: Unit) =>
  s.antlered &&
  s.stage === 2 &&
  !s.stageRevealing &&
  s.staging.some((l) => l.id === u.id)
    ? 2
    : 0;
export const antleredPlayProblem = (s: GameState, code: string) =>
  s.antlered?.eventsBlockedRound === s.round && card(code).type_code === "event"
    ? "Fierce Folk prevents playing events until the end of this round."
    : null;
export function advanceAntlered(s: GameState) {
  const q = s.antlered;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.choice ||
    s.stage === 3 ||
    s.progress < (s.stage === 1 ? 10 : 15)
  )
    return true;
  q.advancing = true;
  prepend(s, fx("crownAdvance", { player: firstPlayer(s) }));
  return true;
}
export function antleredEndRound(s: GameState) {
  if (s.antlered && s.stage === 3 && s.victoryCards?.includes(A.chief)) win(s);
}
function addRaven(s: GameState, code: string, engaged = false) {
  const u = make(s, code);
  s.staging.push(u);
  enemyAddedToStaging(s, u);
  heirsEnemyEntered(s, u, false);
  if (engaged) engage(s, u);
  return u;
}
/** Decrement the whole batch before offering the order of simultaneous Forced effects. */
export function antleredRemoveLocationTime(
  s: GameState,
  ids: string[],
  refreshQuest = false,
) {
  const expired: Effect[] = [];
  for (const l of locations(s)) {
    const amount = ids.filter((id) => id === l.id).length;
    if (amount && (l.timeCounters ?? 0) > 0) {
      l.timeCounters = Math.max(0, l.timeCounters! - amount);
      if (!l.timeCounters && !l.blanked)
        expired.push(
          fx("crownLocationExpired", {
            target: l.id,
            code: l.code,
            player: firstPlayer(s),
          }),
        );
    }
  }
  const q = s.antlered;
  if (refreshQuest && q && q.time > 0) {
    q.time--;
    if (!q.time)
      expired.push(
        fx("crownTimeExpired", {
          value: s.stage,
          code: currentQuestCode(s),
          player: firstPlayer(s),
        }),
      );
  }
  if (expired.length)
    prepend(
      s,
      fx("fangornOrder", {
        text: "Choose the next Time effect",
        effects: expired,
        player: firstPlayer(s),
      }),
    );
}
export function antleredRefreshTime(s: GameState) {
  if (!s.antlered) return false;
  antleredRemoveLocationTime(
    s,
    locations(s)
      .filter((l) => !l.blanked && printedLocationTime(l.code) > 0)
      .map((l) => l.id),
    true,
  );
  return true;
}
export function antleredEngaged(s: GameState, u: Unit) {
  if (s.antlered && u.code === A.warrior && !u.blanked)
    prepend(
      s,
      fx("crownAllocateTime", {
        value: s.hand.length,
        ids: [],
        player: firstPlayer(s),
      }),
    );
}
/** Normal attacks, like immediate attacks, resolve attack-start Forced effects before declaring defenders. */
export function antleredBeforeNormalDefense(s: GameState, u: Unit) {
  if (
    !s.antlered ||
    u.code !== A.chief ||
    u.blanked ||
    !allActiveLocations(s).some((l) => (l.timeCounters ?? 0) > 0)
  )
    return false;
  prepend(
    s,
    fx("crownChooseDefenders", {
      target: u.id,
      ids: [],
      player: activeSeat(s),
    }),
  );
  enemyAttackStarted(s, u, activeSeat(s));
  return true;
}
export function antleredAttackStarted(s: GameState, u: Unit) {
  if (s.antlered && u.code === A.chief && !u.blanked)
    prepend(s, fx("crownActiveTime", { value: 1, player: firstPlayer(s) }));
}
export function antleredCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  if (
    s.combat?.crownTimeOnKill &&
    context.combatDamage &&
    context.enemyId === s.combat.enemyId &&
    ["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    prepend(
      s,
      ...Array.from({ length: s.combat.crownTimeOnKill }, () =>
        fx("crownActiveTime", { value: 1, player: firstPlayer(s) }),
      ),
    );
}
export function antleredEncounter(s: GameState, code: string, replay = false) {
  if (!s.antlered) return false;
  if (code === A.skirmisher) {
    const opts = [
      {
        id: "reveal",
        label: "Reveal an additional encounter card",
        effects: [fx("reveal")],
      },
    ];
    if (allActiveLocations(s).some((l) => (l.timeCounters ?? 0) > 0))
      opts.unshift({
        id: "time",
        label: "Remove 1 time counter from the active location",
        effects: [fx("crownActiveTime", { value: 1 })],
      });
    choose(s, "Raven Skirmisher", opts);
  } else if (code === A.folk) {
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 3, player })),
      fx("crownFolkBlock"),
    );
  } else if (code === A.cry)
    prepend(s, fx("crownRemoveAllTime"), fx("crownCryRefill"));
  else if (code === A.back) {
    let removed = 0;
    for (const l of s.staging.filter(
      (u) => card(u.code).type_code === "location",
    )) {
      removed += l.progress;
      l.progress = 0;
    }
    s.threatModifier += removed;
    if (!removed) prepend(s, fx("reveal"));
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function antleredShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if (code === A.battlefield) {
    for (const id of c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
      prepend(s, fx("damage", { target: id, value: 1 }));
  } else if (code === A.village)
    prepend(s, fx("crownExtraShadows", { target: c.enemyId, count: 2 }));
  else if (code === A.country)
    prepend(
      s,
      fx("fordsDivideDamage", {
        value: printedLocationTime(s.activeLocation?.code ?? ""),
        code,
        player: activeSeat(s),
      }),
    );
  else if (code === A.skirmisher)
    c.attackBonus += printedLocationTime(s.activeLocation?.code ?? "");
  else if (code === A.warrior)
    prepend(s, fx("crownDiscardAttachment", { player: activeSeat(s) }));
  else if (code === A.folk) {
    c.attackBonus++;
    c.crownTimeOnKill = (c.crownTimeOnKill ?? 0) + 1;
  } else return false;
  return true;
}
export function antleredEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("crown")) return false;
  const q = s.antlered;
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "crownChooseDefenders": {
      if (!u) break;
      const ids = e.ids ?? [],
        ready = defendersFor(s, u),
        selected = ids.filter((id) => ready.some((d) => d.id === id));
      const options = ready
        .filter(
          (d) =>
            !selected.includes(d.id) &&
            (!selected.length || ownerOf(s, d) === activeSeat(s)),
        )
        .map((d) => ({
          id: d.id,
          code: d.code,
          label: name(d),
          effects: [
            fx(
              s.standTogether && ownerOf(s, d) === activeSeat(s)
                ? "crownChooseDefenders"
                : "crownDefend",
              { target: u.id, ids: [...selected, d.id], player: activeSeat(s) },
            ),
          ],
        }));
      if (selected.length)
        options.push({
          id: "defend",
          code: u.code,
          label: "Defend with the selected characters",
          effects: [
            fx("crownDefend", {
              target: u.id,
              ids: selected,
              player: activeSeat(s),
            }),
          ],
        });
      options.push({
        id: "undefended",
        code: u.code,
        label: "Leave the attack undefended",
        effects: [
          fx("crownDefend", { target: u.id, ids: [], player: activeSeat(s) }),
        ],
      });
      choose(
        s,
        "Raven Chief · Declare defenders",
        options,
        "The location's Time effect has resolved. Choose the ready characters who will defend this attack.",
      );
      break;
    }
    case "crownDefend":
      if (u) beginEnemyAttack(s, u, e.ids ?? [], false, false, true);
      break;
    case "crownSetup": {
      q.initialized = true;
      forOwner(s, firstPlayer(s), () => s.allies.push(make(s, A.turch)));
      for (const code of [A.battlefield, A.warcamp]) {
        const i = s.encounterDeck.indexOf(code);
        if (i >= 0) s.encounterDeck.splice(i, 1);
        const l = make(s, code);
        antleredCardEntered(s, l, true);
        if (code === A.battlefield) s.activeLocation = l;
        else s.staging.push(l);
      }
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("crownSetupEnemy", { player })),
        fx("crownStageReady"),
      );
      break;
    }
    case "crownSetupEnemy":
      choose(
        s,
        "Choose a different Raven enemy",
        [...new Set(q.ravenDeck)]
          .filter((c) => !q.setupEnemies.includes(c))
          .map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [fx("crownSetupAdd", { code })],
          })),
      );
      break;
    case "crownSetupAdd": {
      const i = q.ravenDeck.indexOf(e.code!);
      if (i >= 0) {
        q.ravenDeck.splice(i, 1);
        q.setupEnemies.push(e.code!);
        addRaven(s, e.code!);
      }
      break;
    }
    case "crownStageReady":
      q.time = s.stage === 3 ? 2 : 3;
      q.advancing = false;
      s.stageRevealing = false;
      if (s.stage === 1) {
        shuffle(s, s.encounterDeck);
        shuffle(s, q.ravenDeck);
      }
      break;
    case "crownAdvance": {
      const code = mainQuestCode(s)!;
      if (!e.flag) {
        const before = s.queue.length;
        questDefeated(s, code);
        const added = s.queue.length - before;
        if (added) {
          s.queue.splice(
            added,
            0,
            fx("crownAdvance", { flag: true, player: firstPlayer(s) }),
          );
          break;
        }
      }
      discardQuestAttachments(s, code);
      s.stage++;
      s.progress = 0;
      s.stageRevealing = true;
      q.time = 0;
      if (s.stage === 2) {
        q.ravenDeck.push(...q.ravenDiscard.splice(0));
        shuffle(s, q.ravenDeck);
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("crownRavenAdd", { player })),
          fx("crownStageReady"),
        );
      } else {
        for (const v of q.setAside.splice(0)) {
          s.staging.push(v);
          antleredCardEntered(s, v, false);
          if (card(v.code).type_code === "enemy") enemyAddedToStaging(s, v);
        }
        prepend(
          s,
          ...Array.from(
            { length: Math.max(0, (s.table?.seats.length ?? 1) - 1) },
            () => fx("crownRavenAdd", { player: firstPlayer(s) }),
          ),
          fx("crownStageReady"),
        );
      }
      log(s, card(mainQuestCode(s)!).name, "chapter");
      break;
    }
    case "crownRavenAdd": {
      const code = ravenDraw(s);
      if (code) addRaven(s, code, !!e.flag);
      break;
    }
    case "crownRavenReveal": {
      const code = ravenDraw(s);
      if (code) revealed(s, code);
      break;
    }
    case "crownTimeExpired":
      if (s.stage === e.value) {
        const due =
          s.stage === 1
            ? [fx("crownRemoveAllTime")]
            : s.stage === 2
              ? [fx("crownRavenReveal")]
              : playerOrder(s).flatMap((player) =>
                  seatView(s, player).engaged.map((v) =>
                    fx("immediateAttack", { target: v.id, player }),
                  ),
                );
        prepend(s, ...due, fx("crownResetTime", { value: s.stage }));
      }
      break;
    case "crownResetTime":
      if (s.stage === e.value) q.time = s.stage === 3 ? 2 : 3;
      break;
    case "crownRemoveAllTime":
      antleredRemoveLocationTime(
        s,
        locations(s).map((l) => l.id),
      );
      break;
    case "crownActiveTime": {
      const ls = allActiveLocations(s).filter((l) => (l.timeCounters ?? 0) > 0);
      if (ls.length === 1)
        antleredRemoveLocationTime(s, Array(e.value ?? 1).fill(ls[0].id));
      else if (ls.length > 1)
        choose(
          s,
          "Choose the active location to remove time",
          ls.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("crownRemoveTimeBatch", {
                ids: Array(e.value ?? 1).fill(l.id),
              }),
            ],
          })),
        );
      break;
    }
    case "crownAllocateTime": {
      const ids = e.ids ?? [],
        available = locations(s).filter(
          (l) => (l.timeCounters ?? 0) > ids.filter((id) => id === l.id).length,
        );
      if (ids.length >= (e.value ?? 0) || !available.length) {
        antleredRemoveLocationTime(s, ids);
        break;
      }
      choose(
        s,
        `Raven Warrior · Remove time (${ids.length} / ${e.value})`,
        available.map((l) => ({
          id: l.id,
          code: l.code,
          label: `${name(l)} · ${(l.timeCounters ?? 0) - ids.filter((id) => id === l.id).length} remaining`,
          effects: [
            fx("crownAllocateTime", {
              value: e.value,
              ids: [...ids, l.id],
              player: firstPlayer(s),
            }),
          ],
        })),
      );
      break;
    }
    case "crownRemoveTimeBatch":
      antleredRemoveLocationTime(s, e.ids ?? []);
      break;
    case "crownLocationExpired":
      if (e.code === A.battlefield)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("crownBattlefieldDamage", { player, code: e.code }),
          ),
        );
      else if (e.code === A.village)
        prepend(s, fx("crownRavenReveal", { player: firstPlayer(s) }));
      else if (e.code === A.warcamp)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("crownRavenAdd", { flag: true, player }),
          ),
        );
      else if (e.code === A.country)
        for (const p of playerOrder(s))
          forOwner(s, p, () => raiseThreat(s, s.hand.length, "encounter"));
      else if (e.code === A.camp) {
        for (const v of allCharacters(s))
          if (v.damage && !v.exhausted) exhaustCharacter(s, v);
        if (u && locations(s).some((l) => l.id === u.id)) u.timeCounters = 3;
      }
      break;
    case "crownBattlefieldDamage":
      prepend(
        s,
        fx("fordsDivideDamage", {
          value: s.hand.length,
          code: A.battlefield,
          player: activeSeat(s),
        }),
      );
      break;
    case "crownFolkBlock":
      q.eventsBlockedRound = s.round;
      break;
    case "crownCryRefill":
      for (const l of locations(s))
        if (!(l.timeCounters ?? 0))
          l.timeCounters = l.blanked ? 0 : printedLocationTime(l.code);
      if (!s.staging.some((l) => card(l.code).type_code === "location"))
        prepend(s, fx("reveal"));
      break;
    case "crownExtraShadows":
      if (u) {
        const codes = Array.from({ length: e.count ?? 0 }, () =>
          ravenDraw(s),
        ).filter((c): c is string => !!c);
        u.faceupShadows ??= u.shadows.map(() => false);
        const at = u.revealedShadowCount ?? 0;
        u.shadows.splice(at, 0, ...codes);
        u.faceupShadows.splice(at, 0, ...codes.map(() => hasSilverLamp(s, u)));
        for (const _ of codes) heirsShadowDealt(s, u);
        prepend(s, ...codes.map((code) => fx("shadowReveal", { code })));
      }
      break;
    case "crownDiscardAttachment": {
      const quest = mainQuestUnit(s),
        hosts = [...units(s), ...(quest ? [quest] : [])];
      choose(
        s,
        "Raven Warrior · Discard an attachment you control",
        hosts.flatMap((h) =>
          h.attachments
            .filter((a) => attachmentController(s, h, a) === activeSeat(s))
            .map((a) => ({
              id: a.id,
              code: a.code,
              label: `${card(a.code).name} · ${name(h)}`,
              effects: [
                fx("discardAttachment", { target: h.id, source: a.id }),
              ],
            })),
        ),
      );
      break;
    }
    default:
      return false;
  }
  return true;
}
