import { NIN } from "./nin-eilph-support";
import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  stats,
  enemyAttackPrevented,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
} from "./core";
import {
  check,
  destroy,
  enemyAddedToStaging,
  engage,
  progressLocation,
  raiseThreat,
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
  removeActiveLocation,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { heirsShadowDealt } from "./heirs-numenor";
import { canRemoveQuestTime } from "./quest-time";
import { reduceThreat } from "./threat-reduction";
import { consumeLeaveCard } from "./leave-consumption";
import { takePlayerDiscard } from "./board";
import { THARBAD as T, tharbadTimeLimit } from "./tharbad-support";
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const active = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => u.code === code && !u.blanked);
export const tharbadNalir = (s: GameState) =>
  allCharacters(s).find((u) => [T.nalir, NIN.nalir].includes(u.code));
export const tharbadNoEngagementChecks = (s: GameState) =>
  active(s, T.rooftops);
export const tharbadTimeBlocked = (s: GameState) => active(s, T.hideout);
export const tharbadCannotMakeActive = (u: Unit) =>
  u.code === T.crossing && !u.blanked;
export const tharbadLocationBlocked = (s: GameState, u: Unit) =>
  u.code === T.streets && !u.blanked && s.staging.some((x) => x.id === u.id);
export const tharbadLocationQuest = (s: GameState, u: Unit) =>
  u.code === T.crossing && !u.blanked ? 2 * (s.table?.seats.length ?? 1) : 0;
const bellachPresent = (s: GameState) =>
  enemies(s).some((u) => u.code === T.bellach && !u.blanked);
export function tharbadThreatBonus(s: GameState, u: Unit) {
  let n = u.code === T.bellach && !u.blanked ? (s.table?.seats.length ?? 1) : 0;
  if (card(u.code).type_code === "enemy") {
    if (bellachPresent(s) && (hasTrait(u, "Orc") || hasTrait(u, "Creature")))
      n++;
    if (active(s, T.rooftops)) n++;
  }
  if (card(u.code).type_code === "location" && hasTrait(u, "City"))
    n += s.staging.filter((l) => l.code === T.ruins && !l.blanked).length;
  return n;
}
export function tharbadEngagementModifier(s: GameState, u: Unit) {
  return (
    (bellachPresent(s) && (hasTrait(u, "Orc") || hasTrait(u, "Creature"))
      ? -30
      : 0) + (active(s, T.streets) ? -20 : 0)
  );
}
export function setupTharbad(s: GameState) {
  const removed = [T.nalir, T.mug, T.bellach, T.crossing];
  s.encounterDeck = s.encounterDeck.filter((c) => !removed.includes(c));
  s.tharbad = {
    initialized: false,
    time: 4,
    elimination: 50,
    setAside: [make(s, T.bellach), make(s, T.crossing)],
    removedSources: [],
  };
}
export function tharbadOpeningHandsKept(s: GameState) {
  if (!s.tharbad || s.tharbad.initialized) return false;
  prepend(s, fx("tharbadSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function tharbadCheck(s: GameState) {
  const q = s.tharbad ?? s.ninEilph;
  if (!q?.initialized || s.status !== "playing") return;
  const nalir = tharbadNalir(s);
  if (!nalir) {
    s.status = "lost";
    s.reason = "Nalir has left play. The map is lost.";
    s.choice = null;
    s.queue = [];
    return;
  }
  const first = firstPlayer(s),
    owner = ownerOf(s, nalir);
  if (owner !== first) {
    forOwner(
      s,
      owner,
      () => (s.allies = s.allies.filter((u) => u.id !== nalir.id)),
    );
    forOwner(s, first, () => s.allies.push(nalir));
  }
  for (const l of allActiveLocations(s))
    if (tharbadCannotMakeActive(l)) {
      removeActiveLocation(s, l.id);
      s.staging.push(l);
    }
}
export function advanceTharbad(s: GameState) {
  const q = s.tharbad;
  if (!q) return false;
  if (
    s.stage === 1 &&
    q.initialized &&
    !q.advancing &&
    !s.stageRevealing &&
    !s.choice &&
    playerOrder(s).every((p) => seatView(s, p).threat === 0)
  ) {
    q.advancing = true;
    prepend(s, fx("tharbadAdvance", { player: firstPlayer(s) }));
  }
  return true;
}
export function tharbadQuestProgress(s: GameState, n: number) {
  if (!s.tharbad) return false;
  if (s.stage === 1) {
    for (const p of playerOrder(s))
      forOwner(s, p, () => reduceThreat(s, n, undefined, "quest-card"));
    log(
      s,
      `Quest progress reduces each player's threat by up to ${n}.`,
      "good",
    );
    advanceTharbad(s);
  } else {
    const crossing = s.staging.find((u) => u.code === T.crossing);
    if (crossing) progressLocation(s, crossing, n);
  }
  return true;
}
export function tharbadExplored(s: GameState, u: Unit) {
  if (s.tharbad && u.code === T.crossing) win(s);
}
export function tharbadCharacterLeft(
  s: GameState,
  u: Unit,
  controller: number,
) {
  if (!s.tharbad && !s.ninEilph) return;
  if ([T.nalir, NIN.nalir].includes(u.code)) {
    s.status = "lost";
    s.reason = "Nalir has left play. The map is lost.";
    s.choice = null;
    s.queue = [];
    return;
  }
  if (s.tharbad && s.stage === 2)
    prepend(s, fx("tharbadThreat", { value: 2, player: controller }));
}
export function tharbadEnemyDestroyed(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (u.code !== T.bellach || u.blanked || !destruction) return false;
  s.encounterDeck.push(u.code);
  shuffle(s, s.encounterDeck);
  log(s, "Bellach is shuffled back into the encounter deck.");
  return true;
}
export function tharbadTimeRemoved(s: GameState, count: number) {
  return allEngaged(s)
    .filter((u) => u.code === T.marauder && !u.blanked)
    .flatMap((u) =>
      Array.from({ length: count }, () =>
        fx("tharbadMarauderShadows", {
          target: u.id,
          code: u.code,
          player: ownerOf(s, u),
        }),
      ),
    );
}
export function tharbadAttackStarted(s: GameState, u: Unit) {
  if (u.code === T.spy && !u.blanked)
    prepend(s, fx("removeQuestTime", { code: u.code, player: firstPlayer(s) }));
}
export function tharbadCombatStart(s: GameState) {
  if (active(s, T.ruins))
    for (const u of allEngaged(s)) {
      const c = encounterDraw(s, true);
      if (c) {
        u.shadows.push(c);
        heirsShadowDealt(s, u);
      }
    }
}
export function tharbadQuestStart(s: GameState) {
  prepend(
    s,
    ...locations(s)
      .filter((l) => l.code === T.hideout && !l.blanked)
      .map((l) => fx("tharbadLocationProgress", { target: l.id, value: 1 })),
  );
}
export function tharbadRefreshStart(s: GameState) {
  const nalir = tharbadNalir(s);
  return nalir && !nalir.blanked
    ? [
        fx("tharbadThreat", {
          value: s.table?.seats.length ?? 1,
          player: ownerOf(s, nalir),
        }),
      ]
    : [];
}
function returnEnemies(s: GameState) {
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      const units = s.engaged.splice(0);
      for (const u of units) {
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
    });
}
export function tharbadTravelProblem(s: GameState, u: Unit) {
  if (tharbadCannotMakeActive(u))
    return "The Crossing at Tharbad cannot leave staging.";
  if (
    u.code === T.inn &&
    !u.blanked &&
    ![...s.encounterDeck, ...s.encounterDiscard].some(
      (c) =>
        card(c).type_code === "enemy" && /\bSpy\b/.test(card(c).traits ?? ""),
    )
  )
    return "Seedy Inn requires a Spy enemy in the encounter deck or discard pile.";
  return null;
}
export function tharbadTravel(s: GameState, u: Unit): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (u.code === T.alley)
    return playerOrder(s).map((player) =>
      fx("tharbadThreat", { value: enemies(s).length, player }),
    );
  if (u.code === T.inn)
    return [fx("tharbadSearchSpy", { player: firstPlayer(s) })];
  return undefined;
}
export function tharbadTravelEntered(s: GameState, u: Unit) {
  if (u.blanked) return;
  if (u.code === T.rooftops) returnEnemies(s);
  if (u.code === T.alley && s.tharbad) s.tharbad.time++;
}
export function tharbadEncounter(s: GameState, code: string, replay = false) {
  if (code === T.tail) {
    returnEnemies(s);
    prepend(s, fx("tharbadTailChoice", { player: firstPlayer(s) }));
  } else if (code === T.cornered)
    prepend(s, fx("tharbadCorneredChoice", { player: firstPlayer(s) }));
  else if (code === T.lot)
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("tharbadThreat", {
          value: seatView(s, player).allies.length,
          player,
        }),
      ),
      fx("tharbadLotSurge", { player: firstPlayer(s) }),
    );
  else if (code === T.dwarf)
    prepend(s, fx("tharbadGetDwarf", { player: firstPlayer(s) }));
  else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function tharbadShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if ([T.lot, T.cornered].includes(code))
    c.attackBonus += s.threat <= 20 ? 2 : 1;
  else if (code === T.marauder)
    prepend(s, fx("removeQuestTime", { code, player: firstPlayer(s) }));
  else if (code === T.dwarf) {
    if (!(c.defenderIds?.length || c.defenderId)) {
      const n = tharbadNalir(s);
      if (n)
        prepend(
          s,
          fx("damage", { target: n.id, value: 2, player: ownerOf(s, n) }),
        );
    }
  } else if (code === T.inn)
    c.tharbadDamageThreat = (c.tharbadDamageThreat ?? 0) + 1;
  else return false;
  return true;
}
export function tharbadAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  if (c.tharbadDamageThreat && c.damageDealt)
    prepend(
      s,
      fx("tharbadThreat", {
        value: c.tharbadDamageThreat * c.damageDealt,
        player: c.attackPlayer ?? activeSeat(s),
      }),
    );
}
function timeOption(s: GameState) {
  return canRemoveQuestTime(s)
    ? [
        {
          id: "time",
          label: "Remove 1 time counter",
          effects: [fx("removeQuestTime", { player: firstPlayer(s) })],
        },
      ]
    : [];
}
export function tharbadEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("tharbad")) return false;
  const q = s.tharbad,
    u = get(s, e.target);
  switch (e.kind) {
    case "tharbadSetup":
      if (q) {
        q.initialized = true;
        s.activeLocation = make(s, T.mug);
        forOwner(s, firstPlayer(s), () => s.allies.push(make(s, T.nalir)));
        for (const _ of playerOrder(s)) {
          const i = s.encounterDeck.indexOf(T.spy);
          if (i >= 0) {
            s.encounterDeck.splice(i, 1);
            const spy = make(s, T.spy);
            s.staging.push(spy);
            enemyAddedToStaging(s, spy);
          }
        }
        shuffle(s, s.encounterDeck);
      }
      break;
    case "tharbadThreat":
      raiseThreat(s, e.value ?? 0, "encounter");
      break;
    case "tharbadLocationProgress":
      if (u) progressLocation(s, u, e.value ?? 0);
      break;
    case "tharbadAdvance": {
      if (!q || s.stage !== 1) break;
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      q.advancing = false;
      for (const u of q.setAside.splice(0)) {
        s.staging.push(u);
        if (card(u.code).type_code === "enemy") enemyAddedToStaging(s, u);
      }
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      let remaining = s.table?.seats.length ?? 1;
      while (remaining && s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (
          card(code).type_code === "enemy" &&
          /\bOrc\b/.test(card(code).traits ?? "")
        ) {
          const u = make(s, code);
          s.staging.push(u);
          enemyAddedToStaging(s, u);
          remaining--;
        } else s.encounterDiscard.push(code);
      }
      q.time = 3;
      prepend(s, fx("tharbadStageReady"));
      log(s, "Escape from Tharbad", "chapter");
      break;
    }
    case "tharbadStageReady":
      s.stageRevealing = false;
      break;
    case "tharbadTimeExpired": {
      if (!q || e.value !== s.stage || q.time !== 0) break;
      if (s.stage === 1) {
        q.elimination = Math.max(0, q.elimination - 10);
        log(s, `Threat elimination level falls to ${q.elimination}.`, "danger");
        check(s);
        if (s.status === "playing") q.time = 4;
      } else {
        const nalir = tharbadNalir(s),
          bellach = enemies(s).find((u) => u.code === T.bellach);
        choose(s, "Escape from Tharbad · Time expires", [
          {
            id: "threat",
            label: "Raise every player’s threat by 3",
            effects: [
              ...playerOrder(s).map((player) =>
                fx("tharbadThreat", { value: 3, player }),
              ),
              fx("tharbadResetTime"),
            ],
          },
          ...(nalir &&
          bellach &&
          !enemyAttackPrevented(s, bellach, ownerOf(s, nalir))
            ? [
                {
                  id: "attack",
                  code: bellach.code,
                  label: "Bellach attacks Nalir",
                  effects: [
                    fx("immediateAttack", {
                      target: bellach.id,
                      damageTarget: nalir.id,
                      player: ownerOf(s, nalir),
                    }),
                    fx("tharbadResetTime"),
                  ],
                },
              ]
            : []),
        ]);
      }
      break;
    }
    case "tharbadResetTime":
      if (q) q.time = tharbadTimeLimit(s.stage);
      break;
    case "tharbadMarauderShadows":
      if (u) {
        if (s.combat?.enemyId === u.id)
          prepend(s, fx("khazadExtraShadows", { target: u.id, count: 2 }));
        else
          for (let i = 0; i < 2; i++) {
            const code = encounterDraw(s, true);
            if (code) {
              u.shadows.push(code);
              heirsShadowDealt(s, u);
            }
          }
      }
      break;
    case "tharbadTailChoice":
      choose(s, "Constant Tail", [
        ...timeOption(s),
        {
          id: "spies",
          label: "Staging Spies get +2 threat for this phase",
          effects: [fx("tharbadTailBonus")],
        },
      ]);
      break;
    case "tharbadTailBonus":
      for (const u of s.staging.filter(
        (u) => card(u.code).type_code === "enemy" && hasTrait(u, "Spy"),
      ))
        u.tempThreat = (u.tempThreat ?? 0) + 2;
      break;
    case "tharbadCorneredChoice":
      choose(s, "Cornered", [
        ...timeOption(s),
        {
          id: "enemies",
          label: "Enemies get −20 engagement cost and +1 attack this round",
          effects: [fx("tharbadCorneredBonus")],
        },
      ]);
      break;
    case "tharbadCorneredBonus":
      for (const u of enemies(s)) {
        u.tempEngagement = (u.tempEngagement ?? 0) - 20;
        u.roundAttack = (u.roundAttack ?? 0) + 1;
      }
      break;
    case "tharbadLotSurge":
      if (playerOrder(s).some((p) => seatView(s, p).threat <= 20))
        prepend(s, fx("amonSurgeWindow", { code: T.lot }), fx("reveal"));
      break;
    case "tharbadGetDwarf": {
      const found = s.staging.filter((u) => card(u.code).type_code === "enemy"),
        highest = Math.max(...found.map((u) => stats(s, u).attack));
      if (!found.length)
        prepend(s, fx("amonSurgeWindow", { code: T.dwarf }), fx("reveal"));
      else {
        const options = found
          .filter((u) => stats(s, u).attack === highest)
          .map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("tharbadAttackNalir", {
                target: u.id,
                player: firstPlayer(s),
              }),
            ],
          }));
        if (options.length === 1) prepend(s, ...options[0].effects);
        else choose(s, "Get That Dwarf! · Choose a tied attacker", options);
      }
      break;
    }
    case "tharbadAttackNalir":
      if (u) {
        const pending = s.queue.length;
        engage(s, u);
        const nalir = tharbadNalir(s);
        if (nalir)
          s.queue.splice(
            s.queue.length - pending,
            0,
            fx("immediateAttack", {
              target: u.id,
              damageTarget: nalir.id,
              player: ownerOf(s, nalir),
            }),
          );
      }
      break;
    case "tharbadSearchSpy": {
      const options = ["deck", "discard"].flatMap((source) =>
        [
          ...new Set(
            (source === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (c) =>
                card(c).type_code === "enemy" &&
                /\bSpy\b/.test(card(c).traits ?? ""),
            ),
          ),
        ].map((code) => ({
          id: `${source}:${code}`,
          code,
          label: `${card(code).name} · encounter ${source}`,
          effects: [fx("tharbadTakeSpy", { code, text: source })],
        })),
      );
      if (options.length) choose(s, "Seedy Inn · Choose a Spy", options);
      break;
    }
    case "tharbadTakeSpy": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) {
        pile.splice(i, 1);
        const u = make(s, e.code!);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
        shuffle(s, s.encounterDeck);
      }
      break;
    }
    case "tharbadRemoveThreatSource": {
      if (!e.code) break;
      const pending = s.resolvingEvents?.find((x) => x.unit.id === e.source);
      if (pending) {
        pending.destination = "removed";
        break;
      }
      const host = allCharacters(s).find((u) => u.id === e.source);
      if (host) {
        destroy(s, host, false, "removed");
        break;
      }
      const attachment = [
        ...allCharacters(s),
        ...allEngaged(s),
        ...s.staging,
        ...allActiveLocations(s),
      ]
        .flatMap((host) => host.attachments.map((a) => ({ host, a })))
        .find((x) => x.a.id === e.source);
      const owner = e.owner ?? activeSeat(s),
        p = seatView(s, owner);
      const beforeRemoved = p.removed.length;
      if (attachment) {
        attachment.host.attachments = attachment.host.attachments.filter(
          (a) => a.id !== e.source,
        );
        p.removed.push(e.code);
      } else {
        const hand = p.hand.findIndex((u) => u.id === e.source);
        if (hand >= 0) {
          p.hand.splice(hand, 1);
          p.removed.push(e.code);
        } else if (e.text === "victory") {
          const i = s.victoryCards?.indexOf(e.code) ?? -1;
          if (i >= 0) {
            s.victoryCards!.splice(i, 1);
            s.victory -= card(e.code).victory ?? 0;
            p.removed.push(e.code);
          }
        } else {
          const i = p.discard.findIndex(
            (c, i) => i >= (e.value ?? 0) && c === e.code,
          );
          if (i >= 0) {
            forOwner(s, owner, () => {
              takePlayerDiscard(s, i, { encounterEffect: true });
            });
            p.removed.push(e.code);
          }
        }
      }
      if (p.removed.length === beforeRemoved) break;
      if (e.source) consumeLeaveCard(s, e.source);
      log(
        s,
        `The Empty Mug removes ${card(e.code).name} from the game.`,
        "danger",
      );
      break;
    }
    default:
      return false;
  }
  return true;
}
