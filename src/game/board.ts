// Board rules: damage, destruction, progress, quest advancement, phases, encounter reveals and shadows.
import { card, name } from "./cards";
import type { Attachment, Effect, GameState, Option, Unit } from "./types";
import { OBJECTIVES, CLUE } from "./scenarios";

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
  seatName,
  seatView,
  selectSeat,
  syncSeat,
  startPhase,
  attachmentController,
} from "./table";

import { pauseFor } from "./presentation";
import {
  characters,
  choose,
  draw,
  encounterDraw,
  enqueue,
  followFirstPlayer,
  fx,
  get,
  has,
  inPlay,
  log,
  make,
  objectiveCount,
  opts,
  pay,
  prepend,
  random,
  requireRule,
  restrictAttachments,
  restricted,
  shuffle,
  skip,
  stageInfo,
  stats,
  units,
  hasClue,
  riverlandsInPlay,
  canPay,
  playCost,
} from "./core";
import { rescuePrisoner } from "./scenario-rules";
import { resolveCampaign } from "./campaign";

export function advanceDefense(s: GameState) {
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

export function check(s: GameState) {
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
    // Elimination can remove the final Clue as well as ordinary damage/discard.
    if (
      s.scenarioId === "hunt-for-gollum" &&
      s.stage === 3 &&
      !allHeroes(s).some(hasClue)
    ) {
      s.stage = 2;
      s.progress = 0;
      log(
        s,
        "No hero holds a Clue. The trail is lost and the quest returns to stage 2.",
        "danger",
      );
    }
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

export function win(s: GameState) {
  if (s.status !== "playing") return;
  s.status = "won";
  s.reason =
    s.scenarioId === "mirkwood"
      ? "Your fellowship has passed safely through Mirkwood."
      : s.scenarioId === "anduin"
        ? "The ambush is broken. Your fellowship reaches the shores of Lórien."
        : s.scenarioId === "hunt-for-gollum"
          ? "You have found a true sign of Gollum’s passing. The trail leads on."
          : "The prisoner is free, the Nazgûl defeated, and your fellowship has escaped Dol Guldur.";
  s.choice = null;
  s.queue = [];
  if (s.campaign) resolveCampaign(s);
  log(s, `Victory! ${s.reason}`, "chapter");
}

export function damage(s: GameState, id: string, value: number) {
  const u = get(s, id);
  if (!u) return;
  u.damage += value;
  if (u.code === "01003" && u.damage < stats(s, u).health) u.resources += value;
  log(s, `${name(u)} takes ${value} damage.`, value > 1 ? "danger" : "normal");
  // Signs of Gollum: a damaged bearer returns the clue to the top of the encounter deck.
  if (value > 0 && card(u.code).type_code === "hero")
    for (const a of [...u.attachments].filter((a) => a.code === CLUE))
      discardAttachment(s, u, a, true);
  if (u.damage >= stats(s, u).health) destroy(s, u);
  check(s);
}

export function discardAttachment(
  s: GameState,
  u: Unit,
  a: Attachment,
  leaving = false,
) {
  if (!leaving && card(a.code).text?.includes("Permanent")) return;
  u.attachments = u.attachments.filter((x) => x.id !== a.id);
  if (a.code === CLUE && leaving) {
    s.encounterDeck.unshift(a.code);
    log(
      s,
      `Signs of Gollum returns to the top of the encounter deck from ${name(u)}.`,
      "danger",
    );
    return;
  }
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

export function destroy(s: GameState, u: Unit) {
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

export function progressLocation(s: GameState, u: Unit, value: number) {
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

export function progress(s: GameState, n: number) {
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

export function advanceQuest(s: GameState) {
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
    else if (s.scenarioId === "hunt-for-gollum" && s.progress >= 8) win(s);
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

export function phaseEnd(s: GameState) {
  const departures = allCharacters(s)
    .filter((u) => u.temporary || u.beornReturn)
    .map((u) => fx("allyDeparture", { target: u.id, player: ownerOf(s, u) }));
  eachSeat(s, () => phaseEndPlayer(s));
  prepend(s, ...departures);
}

export function phaseEndPlayer(s: GameState) {
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

export function returnAlly(s: GameState, u: Unit, toDeck = false) {
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

export function nextRound(s: GameState) {
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

export function engage(s: GameState, u: Unit) {
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

export function returnTreachery(s: GameState, code: string) {
  if (!["01080", "01105"].includes(code)) s.encounterDiscard.push(code);
}

export function revealed(s: GameState, code: string, guarding?: string) {
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

export function resolveReveal(s: GameState, code: string, guarding?: string) {
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
  // The Eaves of Mirkwood: encounter card effects cannot be canceled.
  const when =
    (c.text ?? "").includes("When Revealed") &&
    s.activeLocation?.code !== "02016";
  const options: Option[] = [];
  const revealingPlayer = activeSeat(s);
  eachSeat(s, (player) => {
    if (
      when &&
      s.hand.some((u) => u.code === "01050") &&
      canPay(s, card("01050"))
    )
      options.push({
        id: s.table ? `cancel-${player}` : "cancel",
        label: `Play A Test of Will · ${playCost(s, card("01050"))} Spirit${s.table ? " · " + seatName(s, player) : ""}`,
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

export function placeEncounter(
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
        ...(guarding ? [fx("guardObjective", { target: guarding })] : []),
        fx("guardObjective", { target: fresh.id }),
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
    case "02020": {
      // Goblintown Scavengers: each player discards the top card of their deck.
      let total = 0;
      eachSeat(s, () => {
        const top = s.deck.shift();
        if (top) {
          s.discard.push(top);
          total += Number(card(top).cost) || 0;
        }
      });
      const scavengers = [...s.staging].reverse().find((x) => x.code === code);
      if (scavengers)
        scavengers.tempThreat = (scavengers.tempThreat ?? 0) + total;
      log(
        s,
        `Goblintown Scavengers gain ${total} threat until the end of the phase.`,
        "danger",
      );
      break;
    }
    case "02022": {
      const inStaging = s.staging.filter((x) => x.code === CLUE);
      const held = allHeroes(s).flatMap((h) =>
        h.attachments.filter((a) => a.code === CLUE).map((a) => ({ h, a })),
      );
      if (!inStaging.length && !held.length) {
        log(s, "No Clue is in play. False Lead surges.", "danger");
        prepend(s, fx("reveal"));
        break;
      }
      selectSeat(s, s.table?.first ?? 0);
      choose(
        s,
        "False Lead",
        [
          ...opts(inStaging, (x) => [fx("clueShuffle", { target: x.id })]),
          ...held.map(({ h, a }) => ({
            id: `clue-${h.id}-${a.id}`,
            code: CLUE,
            label: `Signs of Gollum on ${name(h)}`,
            effects: [fx("clueShuffle", { target: h.id, source: a.id })],
          })),
        ],
        "Choose a Clue card in play and shuffle it back into the encounter deck.",
      );
      break;
    }
    case "02023":
      for (const x of riverlandsInPlay(s)) x.progress = 0;
      log(
        s,
        "Flooding washes all progress from the Riverland locations.",
        "danger",
      );
      break;
    case "02024":
      eachSeat(s, () => {
        for (const h of s.heroes) {
          if (h.resources > 0) h.resources--;
          else h.exhausted = true;
        }
      });
      break;
  }
  if (c.type_code === "treachery") returnTreachery(s, code);
}

export function enterAlly(
  s: GameState,
  u: Unit,
  temporary = false,
  played = false,
) {
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

export function spendEvent(s: GameState, code: string) {
  const u = s.hand.find((u) => u.code === code);
  requireRule(u, "That event is no longer in hand.");
  pay(s, card(code));
  s.hand = s.hand.filter((x) => x.id !== u.id);
  s.discard.push(code);
  log(s, `Played ${card(code).name}.`, "good");
}

export function attachmentChoice(s: GameState, defenderOnly = false) {
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

export function shadow(s: GameState, code: string) {
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
    case "02015": {
      const rivers = riverlandsInPlay(s).length;
      prepend(
        s,
        ...allCharacters(s)
          .filter(
            (x) =>
              card(x.code).type_code === "ally" &&
              (Number(card(x.code).cost) || 0) < rivers,
          )
          .map((x) =>
            fx("discardCharacter", { target: x.id, player: ownerOf(s, x) }),
          ),
      );
      break;
    }
    case "02017":
      s.progress = Math.max(0, s.progress - (undefended ? 2 : 1));
      break;
    case "02018":
      if (!s.heroes.some(hasClue)) c.returnToStaging = true;
      break;
    case "02019": {
      const enemy = get(s, c.enemyId);
      if (enemy && !s.heroes.some(hasClue))
        c.attackBonus += card(enemy.code).attack ?? 0;
      break;
    }
    case "02021":
      for (const h of allHeroes(s).filter(hasClue))
        damage(s, h.id, undefended ? 3 : 1);
      break;
    case "02023":
      for (const x of riverlandsInPlay(s)) x.progress = 0;
      break;
  }
  check(s);
}
