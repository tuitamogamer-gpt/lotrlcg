// The effect interpreter: every queued effect kind resolves here, plus queue flushing.
import { card, name } from "./cards";
import type { Effect, GameState, Unit } from "./types";

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
  passSeat,
} from "./table";

import { pauseFor, recordObservation } from "./presentation";
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
  log,
  make,
  observation,
  opts,
  prepend,
  random,
  requireRule,
  shuffle,
  skip,
  stats,
  canPay,
  playCost,
} from "./core";
import {
  advanceDefense,
  check,
  damage,
  discardAttachment,
  engage,
  enterAlly,
  nextRound,
  phaseEnd,
  placeEncounter,
  progressLocation,
  resolveReveal,
  returnAlly,
  revealed,
  shadow,
  spendEvent,
} from "./board";
import { combatDamage, playerAttack } from "./combat";
import { orcGuard, scenarioEffect } from "./scenario-rules";

export function handle(s: GameState, e: Effect) {
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
      if (s.scenarioId === "hunt-for-gollum" && s.stage === 2)
        prepend(s, fx("huntLook", { count: 2, player: s.table?.first ?? 0 }));
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
      if (s.activeLocation?.code === "02017") {
        s.activeLocation.progress = Math.max(0, s.activeLocation.progress - 1);
        s.progress = Math.max(0, s.progress - 1);
        log(
          s,
          "River Ninglor washes away 1 progress from itself and the quest.",
          "danger",
        );
      }
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

export function shadowResponse(s: GameState, code: string) {
  const eligible = playerOrder(s).filter((i) => {
    const p = seatView(s, i);
    return (
      s.activeLocation?.code !== "02016" &&
      card(code).shadow &&
      p.hand.some((u) => u.code === "01048") &&
      canPay(p, card("01048"))
    );
  });
  if (eligible.length)
    choose(
      s,
      "A shadow falls",
      [
        ...eligible.map((player) => ({
          id: s.table ? `cancel-${player}` : "cancel",
          label: `Play Hasty Stroke · ${playCost(s, card("01048"))} Spirit${s.table ? " · " + seatName(s, player) : ""}`,
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

export function flush(s: GameState) {
  let n = 0;
  while (
    s.queue.length &&
    !s.choice &&
    !s.flow?.pending &&
    s.status === "playing"
  ) {
    requireRule(++n < 200, "Effect queue overflow.");
    const effect = s.queue.shift()!;
    if (s.table && effect.player !== undefined) {
      // These belong to the company, even if a reveal eliminates the original
      // first player. The surviving first player resolves the remaining steps.
      const sharedHuntEffect = [
        "huntLook",
        "huntReveal",
        "huntClaim",
        "huntProgress",
      ].includes(effect.kind);
      selectSeat(s, sharedHuntEffect ? s.table.first : effect.player);
    }
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

export function extraEffect(s: GameState, e: Effect) {
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
          p.hand.some((u) => u.code === "01024") && canPay(p, card("01024"))
        );
      });
      if (eligible.length)
        choose(
          s,
          "Valiant Sacrifice",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay ${playCost(s, card("01024"))} Leadership${s.table ? " from " + seatName(s, player) : ""} · ${s.table ? seatName(s, controller) + " draws" : "draw"} 2 cards`,
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
          p.hand.some((u) => u.code === "01037") && canPay(p, card("01037"))
        );
      });
      if (combat?.defenderId && get(s, combat.enemyId) && eligible.length)
        choose(
          s,
          "Swift Strike",
          [
            ...eligible.map((player) => ({
              id: s.table ? `play-${player}` : "play",
              label: `Pay ${playCost(s, card("01037"))} Tactics${s.table ? " · " + seatName(s, player) : ""} to deal 2 damage`,
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
        canPay(s, card("01047")) &&
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
