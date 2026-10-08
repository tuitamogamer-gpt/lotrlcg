import { removeCurrentQuestProgress } from "./side-quests";
import { mainQuestUnit } from "./quest-state";
import type { Attachment, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import type { LeaveDestination } from "./mirkwood-player-cards";
import { card, name } from "./cards";
import {
  characters,
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  stats,
  units,
} from "./core";
import {
  discardAttachment,
  enemyAddedToStaging,
  engage,
  questDefeated,
  discardQuestAttachments,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  removeActiveLocation,
  attachmentController,
} from "./table";
import { heirsCannotHaveAttachments } from "./heirs-numenor";
import { exhaustCharacter } from "./board";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { consumeLeaveCard } from "./leave-consumption";
import {
  CELEBRIMBOR as C,
  CELEBRIMBOR_LOCATIONS,
  CELEBRIMBOR_SCOUR,
  celebrimborProtected,
} from "./celebrimbor-support";
const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const encounters = (s: GameState) => [
  ...s.staging,
  ...allActiveLocations(s),
  ...allEngaged(s),
];
export const celebrimborMould = (s: GameState) =>
  allHeroes(s).find((h) => h.attachments.some((a) => a.code === C.mould));
export const celebrimborSearchCount = (s: GameState) =>
  s.celebrimbor?.search.length ?? 0;
function lose(s: GameState, reason: string) {
  s.status = "lost";
  s.reason = reason;
  s.queue = [];
  s.choice = null;
  log(s, reason, "danger");
}
function underSearch(s: GameState, u: Unit, hidden = false) {
  const q = s.celebrimbor;
  if (!q || q.search.some((c) => c.id === u.id)) return;
  const physical = make(s, u.code);
  physical.id = u.id;
  if (u.owner !== undefined) physical.owner = u.owner;
  q.search.push(physical);
  consumeLeaveCard(s, u.id);
  log(
    s,
    `${hidden ? "A random hand card" : name(u)} is placed facedown underneath The Orcs' Search.`,
    "danger",
  );
}
export function celebrimborDamageLocation(
  s: GameState,
  u: Unit,
  amount: number,
) {
  if (amount <= 0 || !locations(s).some((l) => l.id === u.id)) return;
  u.damage += amount;
  log(s, `${name(u)} takes ${amount} damage.`, "danger");
  if (!s.celebrimbor || u.damage < (card(u.code).quest ?? 0)) return;
  removeActiveLocation(s, u.id);
  s.staging = s.staging.filter((l) => l.id !== u.id);
  if (u.code === C.chamber)
    lose(
      s,
      "The Orcs have found The Secret Chamber. Celebrimbor’s secret is lost.",
    );
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  underSearch(s, u);
}
export function setupCelebrimbor(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![C.bellach, C.search, C.chamber, C.mould].includes(c),
  );
  s.celebrimbor = {
    initialized: false,
    time: 0,
    search: [],
    setupLocations: [],
    stagingLocations: [],
  };
}
export function celebrimborOpeningHandsKept(s: GameState) {
  if (!s.celebrimbor || s.celebrimbor.initialized) return false;
  prepend(s, fx("celebSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function celebrimborThreatBonus(s: GameState, u: Unit) {
  if (u.blanked) return 0;
  return u.code === C.bellach
    ? celebrimborSearchCount(s)
    : u.code === C.chamber
      ? (s.table?.seats.length ?? 1)
      : 0;
}
export function celebrimborCheck(s: GameState) {
  const q = s.celebrimbor;
  if (!q?.initialized || s.status !== "playing") return;
  for (const u of encounters(s))
    if (u.code === C.bellach)
      u.immuneToPlayerEffects = celebrimborProtected(s, u);
  const staged = s.staging.filter((u) => card(u.code).type_code === "location");
  const added = staged.filter(
    (u) =>
      u.code === C.plaza && !u.blanked && !q.stagingLocations.includes(u.id),
  );
  q.stagingLocations = staged.map((u) => u.id);
  if (added.length)
    prepend(
      s,
      ...added.map((u) =>
        fx("celebLocationDamage", {
          target: u.id,
          value: 1,
          code: C.plaza,
          player: firstPlayer(s),
        }),
      ),
    );
  const mould = s.staging.find((u) => u.code === C.mould);
  if (mould && !s.choice) {
    const heroes = seatView(s, firstPlayer(s)).heroes.filter(
      (h) => !heirsCannotHaveAttachments(h),
    );
    if (heroes.length)
      forOwner(s, firstPlayer(s), () =>
        choose(
          s,
          "Claim Celebrimbor’s Mould",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("celebClaim", {
                source: mould.id,
                target: h.id,
                player: firstPlayer(s),
              }),
            ],
          })),
        ),
      );
  }
}
export function celebrimborAttachmentLeaves(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving: boolean,
) {
  if (a.code !== C.mould || !s.celebrimbor) return false;
  if (leaving && card(u.code).type_code === "hero")
    lose(s, "The bearer of Celebrimbor’s Mould has left play.");
  const physical = make(s, a.code);
  physical.id = a.id;
  s.staging.push(physical);
  return true;
}
export function advanceCelebrimbor(s: GameState) {
  const q = s.celebrimbor;
  if (!q) return false;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.choice ||
    !celebrimborMould(s)
  )
    return true;
  if (s.progress < (s.stage === 1 ? 14 : 12)) return true;
  if (s.stage === 2) {
    win(s);
    return true;
  }
  q.advancing = true;
  prepend(s, fx("celebAdvance", { player: firstPlayer(s) }));
  return true;
}
export function celebrimborRefreshEffects(s: GameState): Effect[] {
  return s.celebrimbor?.initialized
    ? [fx("celebSearchThreat", { code: C.search, player: firstPlayer(s) })]
    : [];
}
function scourEffect(
  u: { code: string; id?: string },
  source?: string,
): Effect {
  return fx("celebScour", { code: u.code, target: u.id, source });
}
export function celebrimborScourAll(s: GameState) {
  let foundation = false;
  const effects = encounters(s)
    .filter((u) => !u.blanked && CELEBRIMBOR_SCOUR.includes(u.code))
    .filter((u) => {
      if (u.code !== C.foundation) return true;
      if (foundation) return false;
      foundation = true;
      return true;
    })
    .map((u) => scourEffect(u));
  prepend(
    s,
    fx("fangornOrder", {
      text: "Choose the next Scour effect",
      effects,
      player: firstPlayer(s),
    }),
  );
}
export function celebrimborProgressPlaced(
  s: GameState,
  u: Unit,
  value: number,
) {
  if (u.code !== C.remains || u.blanked || value <= 0) return;
  for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
    if (CELEBRIMBOR_SCOUR.includes(s.encounterDiscard[i])) {
      prepend(s, scourEffect({ code: s.encounterDiscard[i] }, `discard:${i}`));
      break;
    }
}
export function celebrimborTravelProblem(s: GameState, u: Unit) {
  return u.code === C.chamber && !u.blanked && s.progress < 3
    ? "The Secret Chamber requires 3 quest progress to travel here."
    : null;
}
export function celebrimborTravel(
  _s: GameState,
  u: Unit,
): Effect[] | undefined {
  if (u.blanked) return undefined;
  if (u.code === C.chamber) return [fx("celebTravelProgress", { value: 3 })];
  if (u.code === C.foundation)
    return [fx("celebLocationDamage", { target: u.id, value: 1 })];
  return undefined;
}
export function celebrimborEncounter(
  s: GameState,
  code: string,
  replay = false,
) {
  if (code === C.scout) {
    const options = [
      {
        id: "reveal",
        label: "Reveal an additional encounter card",
        effects: [fx("reveal")],
      },
    ];
    if (allActiveLocations(s).length)
      options.unshift({
        id: "damage",
        label: "Place 3 damage on the active location",
        effects: [fx("celebActiveDamage", { value: 3 })],
      });
    choose(s, "Bellach’s Scout", options);
  } else if (code === C.desecrated)
    prepend(
      s,
      fx(allActiveLocations(s).length ? "celebActiveDamage" : "reveal", {
        value: 3,
      }),
    );
  else if (code === C.discovered) {
    const options = [
      {
        id: "scour",
        label: "Trigger each Scour effect in play",
        effects: [fx("celebScourAll", { player: firstPlayer(s) })],
      },
    ];
    if (playerOrder(s).every((p) => seatView(s, p).hand.length))
      options.push({
        id: "hand",
        label:
          "Each player places a random hand card underneath The Orcs’ Search",
        effects: playerOrder(s).map((player) =>
          fx("celebHandSearch", { player }),
        ),
      });
    choose(s, "Discovered!", options);
  } else if (code === C.spies) {
    s.celebrimbor!.spiesExhausted = 0;
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("celebSpiesExhaust", { player, count: celebrimborSearchCount(s) }),
      ),
      fx("celebSpiesSurge"),
    );
  } else return false;
  if (!replay && card(code).type_code === "treachery")
    s.encounterDiscard.push(code);
  return true;
}
export function celebrimborShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  if (code === C.scout) prepend(s, fx("celebActiveDamage", { value: 1 }));
  else if (code === C.tower)
    c.celebExcessCopies = (c.celebExcessCopies ?? 0) + 1;
  else if (code === C.plaza)
    prepend(
      s,
      fx("fordsDivideDamage", {
        value: celebrimborSearchCount(s),
        code: C.plaza,
        player: activeSeat(s),
      }),
    );
  else if (code === C.discovered) c.celebCaptureDestroyed = true;
  else if (code === C.remains) {
    c.attackBonus++;
    c.celebThreatCopies = (c.celebThreatCopies ?? 0) + 1;
  } else if (code === C.desecrated) {
    c.attackBonus++;
    c.celebAllyCostCopies = (c.celebAllyCostCopies ?? 0) + 1;
  } else if (code === C.spies) prepend(s, fx("celebDiscardAttachment"));
  else return false;
  return true;
}
export function celebrimborCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat;
  if (
    !c ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId ||
    !["hero", "ally", "objective-ally"].includes(card(u.code).type_code)
  )
    return;
  if (c.celebCaptureDestroyed) (c.celebCapturedIds ??= []).push(u.id);
  const effects: Effect[] = [];
  for (let i = 0; i < (c.celebThreatCopies ?? 0); i++)
    effects.push(fx("celebSearchThreat", { code: C.remains }));
  const excess = Math.max(0, u.damage - stats(s, u).health);
  for (let i = 0; i < (c.celebExcessCopies ?? 0); i++)
    if (excess)
      effects.push(fx("celebActiveDamage", { value: excess, code: C.tower }));
  if (["ally", "objective-ally"].includes(card(u.code).type_code))
    for (let i = 0; i < (c.celebAllyCostCopies ?? 0); i++)
      if (Number(card(u.code).cost ?? 0) > 0)
        effects.push(
          fx("celebActiveDamage", {
            value: Number(card(u.code).cost ?? 0),
            code: C.desecrated,
          }),
        );
  if (effects.length)
    prepend(s, fx("fangornOrder", { effects, player: firstPlayer(s) }));
}
export function celebrimborCharacterLeft(
  s: GameState,
  u: Unit,
  destination: LeaveDestination,
) {
  if (!s.celebrimbor || !s.combat?.celebCapturedIds?.includes(u.id)) return;
  const p = seatView(s, destination.player);
  const pile =
    destination.zone === "discard"
      ? p.discard
      : destination.zone === "removed"
        ? p.removed
        : undefined;
  if (
    pile &&
    destination.index !== undefined &&
    pile[destination.index] === u.code
  ) {
    pile.splice(destination.index, 1);
    underSearch(s, { ...u, owner: u.owner ?? destination.player });
  }
}
export function celebrimborAttackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
) {
  const enemy = get(s, c.enemyId);
  if (enemy?.code === C.prowler && !enemy.blanked)
    prepend(s, fx("celebActiveDamage", { value: 1, code: C.prowler }));
}
export function celebrimborEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("celeb")) return false;
  const q = s.celebrimbor;
  if (!q) return true;
  const u = get(s, e.target);
  switch (e.kind) {
    case "celebSetup": {
      q.initialized = true;
      const chamber = make(s, C.chamber),
        mould = make(s, C.mould),
        bellach = make(s, C.bellach);
      chamber.attachments.push({
        id: mould.id,
        code: mould.code,
        exhausted: false,
      });
      s.staging.push(bellach, make(s, C.search), chamber);
      enemyAddedToStaging(s, bellach);
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("celebSetupLocation", { player })),
        fx("celebStageReady"),
      );
      break;
    }
    case "celebSetupLocation":
      choose(
        s,
        "Choose a different Ost-in-Edhil location",
        CELEBRIMBOR_LOCATIONS.filter(
          (c) => !q.setupLocations.includes(c) && s.encounterDeck.includes(c),
        ).map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("celebSetupAdd", { code })],
        })),
      );
      break;
    case "celebSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i < 0) break;
      s.encounterDeck.splice(i, 1);
      q.setupLocations.push(e.code!);
      s.staging.push(make(s, e.code!));
      shuffle(s, s.encounterDeck);
      break;
    }
    case "celebAdvance": {
      if (!e.flag) {
        const before = s.queue.length;
        questDefeated(s, C.ruins);
        const added = s.queue.length - before;
        if (added) {
          s.queue.splice(
            added,
            0,
            fx("celebAdvance", { flag: true, player: firstPlayer(s) }),
          );
          break;
        }
      }
      discardQuestAttachments(s, C.ruins);
      s.stage = 2;
      s.progress = 0;
      s.stageRevealing = true;
      q.time = 0;
      log(s, "The Enemy’s Servant", "chapter");
      prepend(
        s,
        fx("celebScourAll"),
        fx("celebBellachAttack"),
        fx("celebStealMould"),
        fx("celebStageReady"),
      );
      break;
    }
    case "celebStageReady":
      q.time = 3;
      q.advancing = false;
      s.stageRevealing = false;
      break;
    case "celebBellachAttack": {
      const bearer = celebrimborMould(s),
        bellach = encounters(s).find((u) => u.code === C.bellach);
      if (bearer && bellach)
        prepend(
          s,
          fx("immediateAttack", {
            target: bellach.id,
            player: ownerOf(s, bearer),
          }),
        );
      break;
    }
    case "celebStealMould": {
      const bearer = celebrimborMould(s),
        bellach = encounters(s).find((u) => u.code === C.bellach);
      if (bearer && bellach) {
        const a = bearer.attachments.find((a) => a.code === C.mould)!;
        bearer.attachments = bearer.attachments.filter((x) => x.id !== a.id);
        delete a.owner;
        bellach.attachments.push(a);
        log(s, "Bellach seizes Celebrimbor’s Mould.", "danger");
      }
      break;
    }
    case "celebClaim": {
      const mould = s.staging.find((m) => m.id === e.source);
      if (
        mould &&
        u &&
        seatView(s, firstPlayer(s)).heroes.some((h) => h.id === u.id)
      ) {
        s.staging = s.staging.filter((m) => m.id !== mould.id);
        u.attachments.push({
          id: mould.id,
          code: mould.code,
          exhausted: false,
        });
        log(s, `${name(u)} claims Celebrimbor’s Mould.`, "good");
      }
      break;
    }
    case "celebTimeExpired":
      if (q.time === 0 && s.stage === e.value)
        prepend(s, fx("celebScourAll"), fx("celebResetTime"));
      break;
    case "celebResetTime":
      q.time = 3;
      break;
    case "celebSearchThreat":
      for (const p of playerOrder(s))
        forOwner(s, p, () => raiseThreat(s, q.search.length, "encounter"));
      break;
    case "celebScourAll":
      celebrimborScourAll(s);
      break;
    case "celebScour": {
      let source = u;
      if (
        e.source?.startsWith("discard:") &&
        [C.prowler, C.tower].includes(e.code!)
      ) {
        const i = Number(e.source.slice(8));
        if (s.encounterDiscard[i] !== e.code) break;
        s.encounterDiscard.splice(i, 1);
        source = make(s, e.code!);
        s.staging.push(source);
        if (e.code === C.prowler) {
          const before = s.queue.length;
          enemyAddedToStaging(s, source);
          s.queue.splice(s.queue.length - before, 0, scourEffect(source));
          break;
        }
      } else if (e.target && [C.prowler, C.tower].includes(e.code!) && !source)
        break;
      if (e.code === C.bellach)
        prepend(
          s,
          ...playerOrder(s).map((player) => fx("celebOrcSearch", { player })),
        );
      else if (e.code === C.scout)
        prepend(s, fx("celebActiveDamage", { value: 1 }));
      else if (e.code === C.tower && source) {
        removeActiveLocation(s, source.id);
        if (!s.staging.some((u) => u.id === source!.id)) s.staging.push(source);
        celebrimborDamageLocation(s, source, 2);
      } else if (e.code === C.foundation)
        prepend(
          s,
          fx("celebAssignLocationDamage", {
            value: locations(s).length,
            player: firstPlayer(s),
          }),
        );
      else if (e.code === C.prowler && source) {
        const highest = Math.max(
          ...playerOrder(s).map((p) => seatView(s, p).threat),
        );
        const players = playerOrder(s).filter(
          (p) => seatView(s, p).threat === highest,
        );
        const effects = (player: number) => [
          fx("celebProwlerEngage", { target: source!.id, player }),
        ];
        if (players.length === 1) prepend(s, ...effects(players[0]));
        else
          choose(
            s,
            "Prowling Orc · Choose a player tied for highest threat",
            players.map((p) => ({
              id: `player-${p}`,
              label: `Player ${p + 1} · ${seatView(s, p).threat} threat`,
              effects: effects(p),
            })),
          );
      }
      break;
    }
    case "celebProwlerEngage":
      if (u) {
        const before = s.queue.length;
        engage(s, u);
        s.queue.splice(
          s.queue.length - before,
          0,
          fx("immediateAttack", { target: u.id, player: activeSeat(s) }),
        );
      }
      break;
    case "celebOrcSearch": {
      const options = ["deck", "discard"].flatMap((text) =>
        [
          ...new Set(
            (text === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (code) =>
                card(code).type_code === "enemy" &&
                /\bOrc\b/.test(card(code).traits ?? ""),
            ),
          ),
        ].map((code) => ({
          id: `${text}:${code}`,
          code,
          label: `${card(code).name} · encounter ${text}`,
          effects: [fx("celebAddOrc", { code, text })],
        })),
      );
      if (options.length) choose(s, "Bellach · Search for an Orc", options);
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "celebAddOrc": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i < 0) break;
      const enemy = make(s, pile.splice(i, 1)[0]);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      shuffle(s, s.encounterDeck);
      break;
    }
    case "celebLocationDamage":
      if (u) celebrimborDamageLocation(s, u, e.value ?? 0);
      break;
    case "celebActiveDamage": {
      const active = allActiveLocations(s);
      if (active.length === 1)
        celebrimborDamageLocation(s, active[0], e.value ?? 0);
      else if (active.length > 1)
        choose(
          s,
          "Choose the active location to damage",
          active.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("celebLocationDamage", { target: l.id, value: e.value }),
            ],
          })),
        );
      break;
    }
    case "celebAssignLocationDamage": {
      const left = e.value ?? 0;
      if (left <= 0) break;
      const options = locations(s).map((l) => ({
        id: l.id,
        code: l.code,
        label: `${name(l)} · ${l.damage}/${card(l.code).quest ?? 0} damage`,
        effects: [
          fx("celebLocationDamage", { target: l.id, value: 1 }),
          fx("celebAssignLocationDamage", {
            value: left - 1,
            player: firstPlayer(s),
          }),
        ],
      }));
      if (options.length)
        choose(
          s,
          `Ancient Foundation · Assign ${left} remaining damage`,
          options,
        );
      break;
    }
    case "celebTravelProgress":
      removeCurrentQuestProgress(s, e.value ?? 0);
      break;
    case "celebHandSearch": {
      if (!s.hand.length) break;
      const i = Math.floor(random(s) * s.hand.length),
        hand = s.hand.splice(i, 1)[0];
      underSearch(s, { ...hand, owner: hand.owner ?? activeSeat(s) }, true);
      break;
    }
    case "celebSpiesExhaust": {
      const left = e.count ?? 0;
      if (left <= 0) break;
      const options = characters(s)
        .filter(
          (u) =>
            !u.exhausted &&
            !khazadCannotExhaust(u) &&
            !watcherWaterCannotExhaust(u),
        )
        .map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("celebExhaust", { target: u.id }),
            fx("celebSpiesExhaust", { count: left - 1, player: activeSeat(s) }),
          ],
        }));
      if (options.length)
        choose(s, `Spies from Mordor · Exhaust ${left} characters`, options);
      break;
    }
    case "celebExhaust":
      if (u && exhaustCharacter(s, u))
        q.spiesExhausted = (q.spiesExhausted ?? 0) + 1;
      break;
    case "celebSpiesSurge":
      if (!q.spiesExhausted) prepend(s, fx("reveal"));
      delete q.spiesExhausted;
      break;
    case "celebDiscardAttachment": {
      const quest = mainQuestUnit(s);
      const options = [...units(s), ...(quest ? [quest] : [])].flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              attachmentController(s, h, a) === activeSeat(s) &&
              card(a.code).type_code !== "objective" &&
              !card(a.code).text?.includes("Permanent"),
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(h)}`,
            effects: [fx("discardAttachment", { target: h.id, source: a.id })],
          })),
      );
      if (options.length)
        choose(
          s,
          "Spies from Mordor · Discard a non-objective attachment",
          options,
        );
      break;
    }
  }
  return true;
}
