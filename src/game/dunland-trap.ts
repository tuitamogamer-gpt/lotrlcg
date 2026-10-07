import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  draw,
  encounterDraw,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  units,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardQuestAttachments,
  enemyAddedToStaging,
  engage,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allEngaged,
  attachmentController,
  firstPlayer,
  forOwner,
  playerOrder,
  seatView,
} from "./table";
import { attachmentHasTrait, hasTrait } from "./expansion-passives";
import { currentQuestCode, currentQuestUnit } from "./quest-state";
import { canLeaveHand } from "./hand-rules";
import { DUNLAND_TRAP as D, dunlandTimeLimit } from "./dunland-trap-support";

const locations = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].filter(
    (u) => card(u.code).type_code === "location",
  );
const enemies = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const boar = (code: string) =>
  card(code).type_code === "enemy" && /Boar Clan/.test(card(code).traits ?? "");
const dunland = (code: string) =>
  card(code).type_code === "enemy" &&
  /\bDunland\b/.test(card(code).traits ?? "");
export const dunlandCannotLeave = (u: Unit) => u.code === D.turch && !u.blanked;
export const dunlandCombatBonus = (s: GameState, u: Unit) =>
  (u.code === D.stalker && !u.blanked ? Math.min(4, u.resources) : 0) +
  (hasTrait(u, "Dunland") &&
  locations(s).some((l) => l.code === D.ravine && !l.blanked)
    ? 1
    : 0);
export const dunlandThreatBonus = (_s: GameState, u: Unit) =>
  u.code === D.foothills && !u.blanked ? u.resources : 0;
export function setupDunlandTrap(s: GameState) {
  s.encounterDeck = s.encounterDeck.filter(
    (c) => ![D.turch, D.ravine, D.road].includes(c),
  );
  s.dunlandTrap = {
    initialized: false,
    time: 0,
    setAside: [D.turch, D.ravine, D.road].map((c) => make(s, c)),
  };
}
export function dunlandOpeningHandsKept(s: GameState) {
  if (!s.dunlandTrap || s.dunlandTrap.initialized) return false;
  prepend(s, fx("dunlandSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
function takeSetAside(s: GameState, code: string) {
  const q = s.dunlandTrap!,
    u = q.setAside.find((u) => u.code === code);
  if (u) q.setAside = q.setAside.filter((x) => x.id !== u.id);
  return u;
}
export function advanceDunlandTrap(s: GameState) {
  if (!s.dunlandTrap) return false;
  if (
    s.stage === 1 &&
    s.progress >= 18 &&
    !s.queue.length &&
    !s.choice &&
    !s.stageRevealing
  )
    prepend(s, fx("dunlandAdvance", { value: 2, player: firstPlayer(s) }));
  return true;
}
export function dunlandCheck(s: GameState) {
  if (!s.dunlandTrap || s.status !== "playing") return;
  const boss = enemies(s).find((u) => u.code === D.turch && !u.blanked);
  if (
    boss &&
    !seatView(s, firstPlayer(s)).engaged.some((u) => u.id === boss.id)
  )
    forOwner(s, firstPlayer(s), () => engage(s, boss));
}
export function dunlandCharacterDestroyed(
  s: GameState,
  u: Unit,
  destruction: boolean,
) {
  if (
    !destruction ||
    s.stage !== 3 ||
    !s.dunlandTrap?.stageThreeReady ||
    card(u.code).type_code !== "hero"
  )
    return;
  s.status = "lost";
  s.reason = "A hero has been destroyed. The Dunland trap closes.";
  s.queue = [];
  s.choice = null;
  log(s, s.reason, "danger");
}
export function dunlandEngaged(s: GameState, _u: Unit) {
  const boss = enemies(s).find((u) => u.code === D.turch && !u.blanked);
  if (boss)
    prepend(
      s,
      fx("removeQuestTime", { code: boss.code, player: firstPlayer(s) }),
    );
}
export function dunlandDrawEffects(s: GameState, player: number): Effect[] {
  const effects: Effect[] = [];
  for (const u of seatView(s, player).engaged.filter((u) => !u.blanked)) {
    if (u.code === D.stalker)
      effects.push(fx("dunlandToken", { target: u.id, code: u.code, player }));
    if (u.code === D.warrior)
      effects.push(fx("dunlandShadow", { target: u.id, code: u.code, player }));
  }
  for (const l of locations(s).filter(
    (u) => u.code === D.foothills && !u.blanked,
  ))
    effects.push(fx("dunlandToken", { target: l.id, code: l.code, player }));
  const hill = s.staging.find((u) => u.code === D.hills && !u.blanked);
  if (hill) effects.push(fx("dunlandHills", { code: hill.code, player }));
  return effects;
}
/** These locations modify only the framework draw, not card effects in the resource phase. */
export function dunlandResourceDraw(s: GameState): number | undefined {
  const active = allActiveLocations(s).filter((u) => !u.blanked);
  if (active.some((u) => u.code === D.plains)) return 0;
  if (active.some((u) => u.code === D.stream)) return 2;
  return undefined;
}
export function dunlandRefreshEffects(s: GameState): Effect[] {
  return locations(s)
    .filter((u) => u.code === D.road && !u.blanked)
    .map((u) => fx("removeQuestTime", { code: u.code, source: u.id }));
}
export function dunlandCombatEndEffects(s: GameState): Effect[] {
  return s.dunlandTrap && s.stage === 2
    ? [fx("dunlandAdvance", { value: 3, player: firstPlayer(s) })]
    : [];
}
export function dunlandExplored(s: GameState, u: Unit) {
  if (u.attachments.some((a) => a.code === D.ambush && !a.blanked))
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("dunlandSearch", { player, text: "Dunland" }),
      ),
      fx("dunlandShuffle"),
    );
}
export function dunlandTravelProblem(s: GameState, u: Unit) {
  if (u.code !== D.hills || u.blanked) return null;
  return playerOrder(s).every(
    (p) => seatView(s, p).deck.length > 0 && seatView(s, p).shackles === 0,
  )
    ? null
    : "Hills of Dunland requires every player to draw a card.";
}
export function dunlandTravel(s: GameState, u: Unit): Effect[] | undefined {
  return u.code === D.hills && !u.blanked
    ? playerOrder(s).map((player) => fx("draw", { value: 1, player }))
    : undefined;
}
export function dunlandEncounter(s: GameState, code: string, replay = false) {
  if (code === D.frenzied) {
    if (s.dunlandTrap) s.dunlandTrap.frenziedDiscarded = 0;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
      ...playerOrder(s).map((player) =>
        fx("dunlandDiscardAlliesHand", { player }),
      ),
      fx("dunlandFrenziedDone", { player: firstPlayer(s) }),
    );
  } else if (code === D.ambush) {
    prepend(s, fx("dunlandAmbush", { player: firstPlayer(s) }));
    return true;
  } else return false;
  if (!replay) s.encounterDiscard.push(code);
  return true;
}
export function dunlandShadow(s: GameState, code: string) {
  const c = s.combat,
    u = c ? get(s, c.enemyId) : undefined;
  if (!c || !u) return false;
  if (code === D.warrior) c.attackBonus += u.shadows.length;
  else if (code === D.plains)
    c.attackBonus += c.defenderId || c.defenderIds?.length ? 1 : 3;
  else if (code === D.stream) {
    c.attackBonus++;
    const shadow = encounterDraw(s, true);
    if (shadow) u.shadows.push(shadow);
  } else if (code === D.frenzied) u.roundCannotTakeDamage = true;
  else return false;
  return true;
}
export function dunlandTrapEffect(s: GameState, e: Effect): boolean {
  // Player-card scripts also use a dunland prefix; handle only explicit quest effects.
  const q = s.dunlandTrap,
    u = get(s, e.target);
  switch (e.kind) {
    case "dunlandSetup": {
      if (!q || q.initialized) break;
      q.initialized = true;
      q.time = 2;
      s.activeLocation = takeSetAside(s, D.road) ?? null;
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("dunlandSearch", { player, flag: true }),
        ),
        fx("dunlandShuffle"),
      );
      break;
    }
    case "dunlandSearch": {
      const eligible = e.text === "Dunland" ? dunland : boar;
      const options = (e.flag ? ["deck"] : ["deck", "discard"]).flatMap(
        (source) =>
          [
            ...new Set(
              (source === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
                eligible,
              ),
            ),
          ].map((code) => ({
            id: `${source}:${code}`,
            code,
            label: `${card(code).name} · encounter ${source}`,
            effects: [
              fx("dunlandTakeEnemy", {
                code,
                text: source,
                player: activeSeat(s),
              }),
            ],
          })),
      );
      if (options.length)
        choose(s, `Choose a ${e.text ?? "Boar Clan"} enemy to engage`, options);
      break;
    }
    case "dunlandTakeEnemy": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard,
        index = pile.indexOf(e.code!);
      if (index < 0) break;
      pile.splice(index, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      engage(s, enemy);
      break;
    }
    case "dunlandShuffle":
      shuffle(s, s.encounterDeck);
      break;
    case "dunlandAdvance": {
      if (!q) break;
      const old = s.stage;
      if (old !== e.value! - 1) break;
      if (old === 1) {
        const pending = s.queue.length;
        if (questDefeated(s, currentQuestCode(s)!)) {
          s.queue.splice(s.queue.length - pending, 0, e);
          break;
        }
      } else discardQuestAttachments(s, currentQuestCode(s)!);
      s.stage = e.value!;
      s.progress = 0;
      s.stageRevealing = true;
      q.time = 0;
      log(s, card(currentQuestCode(s)!).name, "chapter");
      if (s.stage === 2) {
        for (const l of allActiveLocations(s)) s.staging.push(l);
        s.activeLocation = takeSetAside(s, D.ravine) ?? null;
        s.extraActiveLocations = [];
        prepend(
          s,
          ...playerOrder(s).flatMap((player) => [
            fx("dunlandDiscardEquipment", { player }),
            fx("dunlandKeepAlly", { player }),
          ]),
          fx("dunlandTrapBack", { player: firstPlayer(s) }),
        );
      } else {
        const pending = s.queue.length;
        const boss = takeSetAside(s, D.turch);
        if (boss)
          forOwner(s, firstPlayer(s), () => {
            s.staging.push(boss);
            engage(s, boss);
          });
        // Chief Turch enters on 3A; his initial engagement precedes Time on 3B.
        s.queue.splice(
          s.queue.length - pending,
          0,
          fx("dunlandStageThreeReady"),
        );
      }
      break;
    }
    case "dunlandDiscardEquipment": {
      const quest = currentQuestUnit(s);
      for (const host of [...units(s), ...(quest ? [quest] : [])])
        for (const a of [...host.attachments])
          if (
            attachmentController(s, host, a) === activeSeat(s) &&
            (attachmentHasTrait(a, "Item") || attachmentHasTrait(a, "Mount"))
          )
            discardAttachment(s, host, a);
      break;
    }
    case "dunlandKeepAlly":
      if (s.allies.length > 1)
        choose(
          s,
          "The trap: choose one ally to keep",
          s.allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [
              fx("dunlandDiscardOtherAllies", {
                target: a.id,
                player: activeSeat(s),
              }),
            ],
          })),
        );
      break;
    case "dunlandDiscardOtherAllies":
      for (const a of [...s.allies])
        if (a.id !== e.target) discardCharacter(s, a);
      break;
    case "dunlandTrapBack":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("dunlandSearch", { player })),
        fx("dunlandShuffle"),
        ...playerOrder(s).flatMap((player) => [
          fx("reshufflePlayer", { player }),
          fx("draw", { value: 1, player }),
        ]),
        fx("stageRevealed"),
      );
      break;
    case "dunlandStageThreeReady":
      if (q) {
        q.stageThreeReady = true;
        q.time = dunlandTimeLimit(s);
        s.stageRevealing = false;
        log(s, `No Way Out · Time ${q.time}.`, "chapter");
      }
      break;
    case "dunlandTimeExpired":
      if (!q || q.time !== 0 || s.stage !== e.value) break;
      if (s.stage === 1)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("dunlandDiscardHandDraw", { player }),
          ),
          fx("dunlandResetTime", { value: 1 }),
        );
      else if (s.stage === 3 && q.stageThreeReady && !q.lastStand) {
        q.lastStand = true;
        prepend(
          s,
          fx("engagementRound", { player: firstPlayer(s) }),
          fx("dunlandFinalAttacks", { player: firstPlayer(s) }),
        );
      }
      break;
    case "dunlandDiscardHandDraw":
      for (const c of [...s.hand]) discardHandCard(s, c.id);
      draw(s, 2);
      break;
    case "dunlandResetTime":
      if (q && s.stage === e.value && !q.time) q.time = 2;
      break;
    case "dunlandFinalAttacks": {
      const attacks = playerOrder(s).flatMap((player) =>
        seatView(s, player).engaged.map((enemy) =>
          fx("immediateAttack", { target: enemy.id, code: enemy.code, player }),
        ),
      );
      prepend(
        s,
        fx("fangornOrder", {
          text: "Choose the next final attack",
          effects: attacks,
          player: firstPlayer(s),
        }),
        fx("dunlandVictory", { player: firstPlayer(s) }),
      );
      break;
    }
    case "dunlandVictory":
      if (q?.lastStand && s.status === "playing") {
        win(s);
      }
      break;
    case "dunlandToken":
      if (u) u.resources++;
      break;
    case "dunlandShadow": {
      if (u) {
        const code = encounterDraw(s, true);
        if (code) u.shadows.push(code);
      }
      break;
    }
    case "dunlandHills": {
      const code = s.encounterDeck.shift();
      if (!code) break;
      if (dunland(code)) {
        const enemy = make(s, code);
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
        engage(s, enemy);
      } else s.encounterDiscard.push(code);
      break;
    }
    case "dunlandDiscardAlliesHand": {
      for (const ally of [...s.hand].filter(
        (u) => card(u.code).type_code === "ally" && canLeaveHand(u),
      )) {
        discardHandCard(s, ally.id);
        if (q) q.frenziedDiscarded = (q.frenziedDiscarded ?? 0) + 1;
      }
      break;
    }
    case "dunlandFrenziedDone": {
      const count = q?.frenziedDiscarded ?? 0;
      if (q) delete q.frenziedDiscarded;
      if (!count)
        prepend(s, fx("amonSurgeWindow", { code: D.frenzied }), fx("reveal"));
      break;
    }
    case "dunlandAmbush": {
      const active = allActiveLocations(s).filter(
        (l) => !l.attachments.some((a) => a.code === D.ambush),
      );
      if (active.length)
        choose(
          s,
          "Attach Dunlending Ambush to an active location",
          active.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [fx("dunlandAttachAmbush", { target: l.id })],
          })),
        );
      else s.encounterDiscard.push(D.ambush);
      break;
    }
    case "dunlandAttachAmbush":
      if (u) {
        const a = make(s, D.ambush);
        u.attachments.push({ id: a.id, code: a.code, exhausted: false });
      } else s.encounterDiscard.push(D.ambush);
      break;
    default:
      return false;
  }
  return true;
}
