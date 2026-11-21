import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  random,
  shuffle,
  spendResources,
  takePlayerDeck,
  threatOf,
} from "./core";
import {
  destroy,
  discardAttachment,
  discardHandCard,
  discardLocation,
  enemyAddedToStaging,
  engage,
  enterEnemyEngaged,
  questDefeated,
  raiseThreat,
  removeFromQuest,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  livingSeats,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { deckCardInserted } from "./physical-player-card";
import {
  effectCardPlayProblem,
  effectCardPlayTargets,
  needsTarget,
  playCardFromEffect,
} from "./actions";
import { dealEnemyShadows } from "./considered-engagement";
import { hasResourceIcon } from "./expansion-passives";
import {
  mordorOrcCharacterDestroyed,
  mordorOrcEngaged,
  mordorOrcShadow,
  mordorOrcsEffect,
  stagingArchery,
} from "./mordor-orcs";
import { direThreatReduction } from "./dire-rules";
import {
  BG,
  BG_EMBASSY_PAIRS,
  BLACK_GATE_RECIPES,
  bgGate,
  bgScore,
  blackGateStageInfo,
} from "./black-gate-support";
export * from "./black-gate-support";

/**
 * The Black Gate Opens, the second scenario of The Mountain of Fire. The
 * first player controls the Fellowship-sphere Aragorn; an embassy from Barad-
 * dûr pairs player cards with encounter cards, then the armies of Mordor pour
 * out of The Black Gate. The Battle of the Morannon cannot be defeated: each
 * round The Black Gate gathers a resource and the first player reveals one
 * encounter card for each of them. The players cannot win; their result is
 * the number of resources on The Black Gate when they fall. Dire: threat
 * elimination is 99, threat reduction by non-boon player cards is limited to 1
 * each round and Valour triggers at 80.
 */
const TREACHERIES: readonly string[] = [
  BG.hawk,
  BG.hour,
  BG.jaws,
  BG.rage,
  BG.onslaught,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, v: string) => (s.table ? `${v}s` : v);
const his = (s: GameState) => (s.table ? "his" : "your");
/** The game phase, its steps included. */
const phaseOf = (s: GameState) =>
  s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase;
/** The current quest's text is in effect. */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.blackGate?.advancing;
const at = (s: GameState, quest: string) =>
  s.blackGate?.currentQuest === quest && stageLive(s);
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter((u) => isEnemy(u));
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
const traits = (code: string) =>
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const hasPrintedTrait = (code: string, trait: string) =>
  traits(code).includes(trait);
const isNazgul = (code: string) =>
  card(code).type_code === "enemy" && hasPrintedTrait(code, "Nazgûl");
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const questingOf = (s: GameState, p: number) =>
  charactersOf(s, p).filter((u) => u.committed);
const cost = (code: string) => Number(card(code).cost) || 0;
const printedThreat = (code: string) => Number(card(code).threat) || 0;
/** The enemy carries Hell-hawk. */
const hawked = (u: Unit) =>
  u.attachments.some((a) => a.code === BG.hawk && !a.blanked);
const mouth = (s: GameState) => s.staging.find((u) => live(u, BG.mouth));
/** Towers of the Teeth's X: the characters of the player with the most. */
const mostCharacters = (s: GameState) =>
  Math.max(0, ...playerOrder(s).map((p) => charactersOf(s, p).length));

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupBlackGate(s: GameState) {
  const r = BLACK_GATE_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.activeLocation = null;
  s.blackGate = {
    currentQuest: BG.embassy,
    advancing: false,
    resolving: [],
    setAside: section("sharedSetAside"),
  };
  log(
    s,
    "Embassy from The Dark Tower: The Black Gate and The Mouth of Sauron are added to the staging area, Gwaihir is set aside and the encounter deck is shuffled.",
    "chapter",
  );
}
/** A paired player card its owner can play now, at no cost. */
function embassyPlayable(s: GameState, owner: number, u: Unit) {
  let ok = false;
  forOwner(s, owner, () => {
    ok =
      !effectCardPlayProblem(s, u, { putIntoPlay: false }) &&
      (!needsTarget(u) || effectCardPlayTargets(s, u).length > 0);
  });
  return ok;
}
function takePair(s: GameState, id: string | undefined) {
  const q = s.blackGate!;
  const i = q.embassy?.findIndex((p) => p.unit.id === id) ?? -1;
  return i < 0 ? undefined : q.embassy!.splice(i, 1)[0];
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.blackGate;
  if (!q || !TREACHERIES.includes(code)) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const u = make(s, code);
  q.resolving.push(u);
  const player = activeSeat(s);
  prepend(
    s,
    fx("bgTreachery", { code, source: u.id, player }),
    fx("bgTreacheryDone", { source: u.id, player }),
  );
  return true;
}
/**
 * An "either … or …" choice: an option is offered only when it can change the
 * game; with one left it resolves alone.
 */
function either(
  s: GameState,
  p: number,
  title: string,
  options: Option[],
  description: string,
) {
  if (!options.length) {
    log(s, `${title}: nothing can be resolved.`);
    return;
  }
  if (options.length === 1) {
    prepend(s, ...options[0].effects);
    return;
  }
  forOwner(s, p, () =>
    choose(s, `${title} · Choose one${seatLabel(s, p)}`, options, description),
  );
}
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    case BG.hawk: {
      const nazgul = (c: string) => isNazgul(c);
      const search = [
        ...s.encounterDeck,
        ...s.encounterDiscard,
        ...(s.victoryCards ?? []),
      ].some(nazgul);
      const hosts = enemiesInPlay(s).filter(
        (u) => isNazgul(u.code) && !hawked(u),
      );
      either(
        s,
        p,
        "Hell-hawk",
        [
          ...(search
            ? [
                {
                  id: "search",
                  label:
                    "Search the encounter deck, discard pile and victory display for a Nazgûl enemy",
                  effects: [fx("bgHawkSearch", { player: p })],
                },
              ]
            : []),
          ...(hosts.length
            ? [
                {
                  id: "attach",
                  label: "Attach Hell-hawk to a Nazgûl enemy in play",
                  effects: [fx("bgHawkHost", { source: held.id, player: p })],
                },
              ]
            : []),
        ],
        "When Revealed: either search the encounter deck, discard pile and victory display for a Nazgûl enemy and add it to the staging area, or attach Hell-hawk to a Nazgûl enemy in play.",
      );
      return;
    }
    case BG.hour:
      prepend(s, ...playerOrder(s).map((player) => fx("bgHour", { player })));
      return;
    case BG.jaws: {
      const x = bgScore(s);
      if (!x) {
        log(s, "Jaws of Steel: there is no resource on The Black Gate.");
        return;
      }
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bgJaws", { value: x, player })),
      );
      return;
    }
    case BG.rage: {
      const m = mouth(s);
      if (!m) {
        log(s, "Rage Filled Him: The Mouth of Sauron is not in play.");
        return;
      }
      s.blackGate!.rage = { player: p, enemy: m.id };
      log(
        s,
        `Rage Filled Him: The Mouth of Sauron makes an immediate attack against ${who(s, p)}.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: m.id, player: p }));
      return;
    }
    case BG.onslaught:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bgOnslaught", { player })),
        fx("bgOnslaughtMark", { player: firstPlayer(s) }),
      );
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!s.blackGate || !c) return false;
  if (mordorOrcShadow(s, code)) return true;
  const attacker = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case BG.hour:
      prepend(s, fx("bgDiscardAttachment", { player: p }));
      return true;
    case BG.jaws: {
      const x = bgScore(s);
      c.attackBonus += x;
      log(
        s,
        `Jaws of Steel: the attacking enemy gets +${x} attack (1 for each resource on The Black Gate).`,
        "danger",
      );
      return true;
    }
    case BG.rage: {
      const bonus = attacker?.code === BG.mouth ? 3 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Rage Filled Him: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case BG.onslaught:
      prepend(s, fx("bgOnslaughtShadow", { player: p }));
      return true;
    case BG.warrior: {
      const q = s.blackGate;
      const ids = (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u)
        .map((u) => u.id);
      if (!ids.length) {
        log(s, "Warrior of Rhûn: no character defends this attack.");
        return true;
      }
      const prior = q.noReady?.round === s.round ? q.noReady.ids : [];
      q.noReady = { round: s.round, ids: [...new Set([...prior, ...ids])] };
      log(
        s,
        "Warrior of Rhûn: the defending character cannot ready until the end of the round.",
        "danger",
      );
      return true;
    }
    case BG.bowman:
      c.bgNextPlayer = true;
      log(
        s,
        "Easterling Bowman: after this attack, the attacking enemy engages the next player and makes an attack.",
        "danger",
      );
      return true;
    case BG.gwaihir:
      c.noDamage = true;
      log(s, "Gwaihir: this attack deals no damage.", "good");
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Searches and helpers.

/** Discard from the top of the encounter deck until an enemy. */
function discardUntilEnemy(s: GameState, text: string): string | undefined {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (card(code).type_code === "enemy") return code;
    s.encounterDiscard.push(code);
    log(s, `${text}: ${card(code).name} is discarded.`);
  }
  log(s, `${text}: no enemy is discarded.`);
  return undefined;
}
function addEnemy(s: GameState, code: string, text: string) {
  const enemy = make(s, code);
  s.staging.push(enemy);
  log(s, `${text}: ${card(code).name} is added to the staging area.`, "danger");
  enemyAddedToStaging(s, enemy);
  return enemy;
}
/** Return an engaged enemy to the staging area; its shadow cards are discarded. */
function toStaging(s: GameState, u: Unit) {
  const owner = playerOrder(s).find((p) =>
    seatView(s, p).engaged.some((x) => x.id === u.id),
  );
  if (owner === undefined) return;
  forOwner(s, owner, () => {
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  });
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  delete u.faceupShadows;
  u.revealedShadowCount = 0;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
// ---------------------------------------------------------------------------
// Effects.

export function blackGateEffect(s: GameState, e: Effect): boolean {
  const q = s.blackGate;
  if (!q || !e.kind.startsWith("bg")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = get(s, e.target);
  switch (e.kind) {
    case "bgTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "bgTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const [held] = q.resolving.splice(i, 1);
        s.encounterDiscard.push(held.code);
      }
      return true;
    }
    // 1B When Revealed: 4 faceup player cards paired with 4 encounter cards.
    case "bgEmbassy": {
      const placed: { owner: number; unit: Unit }[] = [];
      let moved = true;
      while (placed.length < BG_EMBASSY_PAIRS && moved) {
        moved = false;
        for (const player of playerOrder(s)) {
          if (placed.length >= BG_EMBASSY_PAIRS) break;
          let top: Unit | undefined;
          forOwner(s, player, () => {
            if (s.deck.length) top = takePlayerDeck(s);
          });
          if (!top) continue;
          top.owner = player;
          placed.push({ owner: player, unit: top });
          moved = true;
        }
      }
      const revealed: string[] = [];
      while (revealed.length < BG_EMBASSY_PAIRS) {
        if (!s.encounterDeck.length) {
          if (!s.encounterDiscard.length) break;
          s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
        }
        revealed.push(s.encounterDeck.shift()!);
      }
      // Starting with the highest cost player card, each takes the highest
      // threat encounter card remaining (ties in the order they were placed).
      const players = [...placed].sort(
        (a, b) => cost(b.unit.code) - cost(a.unit.code),
      );
      const encounterCards = [...revealed].sort(
        (a, b) => printedThreat(b) - printedThreat(a),
      );
      const pairs = players
        .slice(0, encounterCards.length)
        .map((x, i) => ({ ...x, encounter: encounterCards[i] }));
      for (const x of players.slice(pairs.length))
        forOwner(s, x.owner, () => s.discard.push(x.unit.code));
      s.encounterDiscard.push(...encounterCards.slice(pairs.length));
      q.embassy = pairs;
      log(
        s,
        `Embassy from The Dark Tower: ${pairs.map((x) => `${card(x.unit.code).name} with ${card(x.encounter).name}`).join("; ") || "no pair is formed"}.`,
        "chapter",
      );
      prepend(
        s,
        ...pairs.map((x) =>
          fx("bgEmbassyPair", { target: x.unit.id, player: first }),
        ),
      );
      return true;
    }
    case "bgEmbassyPair": {
      const pair = q.embassy?.find((x) => x.unit.id === e.target);
      if (!pair) return true;
      const title = card(pair.unit.code).name,
        threat = card(pair.encounter).name;
      const options: Option[] = [
        {
          id: "discard",
          code: pair.unit.code,
          label: `Discard ${title} and ${threat}`,
          effects: [
            fx("bgEmbassyDiscard", { target: pair.unit.id, player: first }),
          ],
        },
        ...(embassyPlayable(s, pair.owner, pair.unit)
          ? [
              {
                id: "reveal",
                code: pair.encounter,
                label: `Reveal ${threat} to play ${title} at no cost${seatLabel(s, pair.owner)}`,
                effects: [
                  fx("bgEmbassyReveal", {
                    target: pair.unit.id,
                    player: first,
                  }),
                ],
              },
            ]
          : []),
      ];
      if (options.length === 1) {
        log(s, `Embassy from The Dark Tower: ${title} cannot be played now.`);
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Embassy from The Dark Tower · ${title} and ${threat}${seatLabel(s, first)}`,
          options,
          "For each pair, the first player must choose: either discard both cards in that pair, or reveal the encounter card to play the player card at no cost.",
        ),
      );
      return true;
    }
    case "bgEmbassyDiscard": {
      const pair = takePair(s, e.target);
      if (!pair) return true;
      forOwner(s, pair.owner, () => s.discard.push(pair.unit.code));
      if (pair.encounter) s.encounterDiscard.push(pair.encounter);
      log(
        s,
        `Embassy from The Dark Tower: ${card(pair.unit.code).name} and ${card(pair.encounter).name} are discarded.`,
      );
      return true;
    }
    case "bgEmbassyReveal": {
      const pair = q.embassy?.find((x) => x.unit.id === e.target);
      if (!pair) return true;
      // The encounter card is revealed from the top of the deck.
      s.encounterDeck.unshift(pair.encounter);
      pair.encounter = "";
      prepend(
        s,
        fx("reveal", { player: first }),
        fx("bgEmbassyPlay", { target: pair.unit.id, player: pair.owner }),
      );
      return true;
    }
    case "bgEmbassyPlay": {
      const pair = q.embassy?.find((x) => x.unit.id === e.target);
      if (!pair) return true;
      const owner = pair.owner;
      if (!embassyPlayable(s, owner, pair.unit)) {
        takePair(s, pair.unit.id);
        forOwner(s, owner, () => s.discard.push(pair.unit.code));
        log(
          s,
          `Embassy from The Dark Tower: ${card(pair.unit.code).name} can no longer be played and is discarded.`,
        );
        return true;
      }
      if (!needsTarget(pair.unit)) {
        prepend(
          s,
          fx("bgEmbassyResolve", { target: pair.unit.id, player: owner }),
        );
        return true;
      }
      let targets: Unit[] = [];
      forOwner(s, owner, () => {
        targets = effectCardPlayTargets(s, pair.unit);
      });
      forOwner(s, owner, () =>
        choose(
          s,
          `${card(pair.unit.code).name} · Choose a target${seatLabel(s, owner)}`,
          targets.map((t) => ({
            id: t.id,
            code: t.code,
            label: name(t),
            effects: [
              fx("bgEmbassyResolve", {
                target: pair.unit.id,
                source: t.id,
                player: owner,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "bgEmbassyResolve": {
      const pair = takePair(s, e.target);
      if (!pair) return true;
      log(
        s,
        `Embassy from The Dark Tower: ${card(pair.unit.code).name} is played at no cost.`,
        "good",
      );
      forOwner(s, pair.owner, () => {
        // The card goes back on top of its owner's deck, where the
        // card-effect play takes the physical card.
        s.deck.unshift(pair.unit.code);
        deckCardInserted(s, 0, pair.unit);
        playCardFromEffect(s, pair.unit, {
          putIntoPlay: false,
          target: e.source,
        });
      });
      return true;
    }
    // 1B has no quest points: once the embassy is resolved, 2A is revealed.
    case "bgEmbassyDone": {
      for (const pair of q.embassy ?? []) {
        forOwner(s, pair.owner, () => s.discard.push(pair.unit.code));
        if (pair.encounter) s.encounterDiscard.push(pair.encounter);
      }
      delete q.embassy;
      questDefeated(s, q.currentQuest);
      prepend(s, fx("bgStageTwo", { player: first }));
      return true;
    }
    // 2A: each player adds a different Orc, Troll or Nazgûl enemy; Gwaihir joins the deck.
    case "bgStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = BG.battle;
      s.stageRevealing = true;
      q.searched = [];
      log(s, "The Battle of the Morannon.", "chapter");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("bgSearch", { player })),
        fx("bgGwaihirIn", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    case "bgSearch": {
      const taken = q.searched ?? [];
      const fits = (c: string) =>
        card(c).type_code === "enemy" &&
        ["Orc", "Troll", "Nazgûl"].some((t) => hasPrintedTrait(c, t)) &&
        !taken.includes(card(c).name);
      const zone = (codes: string[], id: string, label: string) =>
        [...new Set(codes.filter(fits))].map((c) => ({
          id: `${id}-${c}`,
          code: c,
          label: `${card(c).name} · ${label}`,
          effects: [fx("bgSearchTake", { code: c, text: id, player: p })],
        }));
      const options = [
        ...zone(s.encounterDeck, "deck", "encounter deck"),
        ...zone(s.encounterDiscard, "discard", "discard pile"),
      ];
      if (!options.length) {
        log(
          s,
          `The Battle of the Morannon: ${who(s, p)} ${verb(s, "find")} no different Orc, Troll or Nazgûl enemy.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Battle of the Morannon · Search for a different Orc, Troll or Nazgûl enemy${seatLabel(s, p)}`,
          options,
          "When Revealed: each player searches the encounter deck and discard pile for a different Orc, Troll, or Nazgûl enemy and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "bgSearchTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = pile.indexOf(e.code ?? "");
      if (i < 0) return true;
      pile.splice(i, 1);
      (q.searched ??= []).push(card(e.code!).name);
      addEnemy(s, e.code!, "The Battle of the Morannon");
      return true;
    }
    case "bgGwaihirIn": {
      const i = q.setAside.indexOf(BG.gwaihir);
      if (i >= 0) {
        q.setAside.splice(i, 1);
        s.encounterDeck.push(BG.gwaihir);
      }
      s.encounterDeck = shuffle(s, s.encounterDeck);
      delete q.searched;
      log(
        s,
        "The Battle of the Morannon: Gwaihir is shuffled into the encounter deck.",
      );
      return true;
    }
    // The Black Gate's Forced effect at the beginning of the quest phase.
    case "bgGate": {
      const gate = bgGate(s);
      if (!gate || gate.blanked) return true;
      gate.resources += 1;
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 1, "encounter"));
      log(
        s,
        `The Black Gate: 1 resource is placed here (${gate.resources} in all), and each player raises his threat by 1.`,
        "danger",
      );
      return true;
    }
    // 2B Forced: after the players quest unsuccessfully, discard the active location.
    case "bgDiscardActive": {
      const active = s.activeLocation;
      if (!active) return true;
      log(
        s,
        `The Battle of the Morannon: the quest failed, so ${name(active)} is discarded.`,
        "danger",
      );
      discardLocation(s, active, true);
      return true;
    }
    // Beleaguered Hills: each player engages a non-unique enemy in the staging area.
    case "bgHills": {
      const targets = s.staging.filter(
        (x) => isEnemy(x) && !card(x.code).is_unique,
      );
      if (!targets.length) {
        log(s, "Beleaguered Hills: there is no non-unique enemy to engage.");
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Beleaguered Hills · Engage a non-unique enemy in the staging area${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("bgEngage", { target: x.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "bgEngage":
      if (u && inStaging(s, u)) forOwner(s, p, () => engage(s, u));
      return true;
    // Reeking Moat: a non-unique, non-Nazgûl enemy goes facedown under it.
    case "bgMoat": {
      const moat = get(s, e.target);
      if (!moat) return true;
      const targets = s.staging.filter(
        (x) => isEnemy(x) && !card(x.code).is_unique && !isNazgul(x.code),
      );
      if (!targets.length) {
        log(
          s,
          "Reeking Moat: there is no non-unique, non-Nazgûl enemy in the staging area.",
        );
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Reeking Moat · Place a non-unique, non-Nazgûl enemy facedown under it${seatLabel(s, first)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("bgMoatPlace", {
                target: x.id,
                source: moat.id,
                player: first,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "bgMoatPlace": {
      if (!u || !inStaging(s, u)) return true;
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      const entry = (q.moat ??= []).find((m) => m.location === e.source);
      if (entry) entry.units.push(u);
      else q.moat.push({ location: e.source!, units: [u] });
      log(s, `Reeking Moat: ${name(u)} is placed facedown under it.`, "good");
      return true;
    }
    case "bgMoatRelease": {
      const i = q.moat?.findIndex((m) => m.location === e.source) ?? -1;
      if (i < 0) return true;
      const [entry] = q.moat!.splice(i, 1);
      if (!q.moat!.length) delete q.moat;
      for (const enemy of entry.units) {
        log(
          s,
          `Reeking Moat leaves play: ${name(enemy)} is put into play engaged with ${who(s, first)}.`,
          "danger",
        );
        enterEnemyEngaged(s, enemy, first);
      }
      return true;
    }
    // Slopes of Cirith Gorgor: shuffle the discard pile in, discard until an enemy, engage it.
    case "bgSlopes": {
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      log(
        s,
        "Slopes of Cirith Gorgor: the encounter discard pile is shuffled into the encounter deck.",
      );
      const code = discardUntilEnemy(s, "Slopes of Cirith Gorgor");
      if (!code) return true;
      const enemy = make(s, code);
      log(
        s,
        `Slopes of Cirith Gorgor: ${card(code).name} is put into play engaged with ${who(s, first)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, first);
      return true;
    }
    // Easterling Bowman: 1 damage to a questing character you control.
    case "bgBowman":
    case "bgOnslaught": {
      const text =
        e.kind === "bgBowman" ? "Easterling Bowman" : "Onslaught of Mordor";
      const targets = questingOf(s, p);
      if (!targets.length) {
        log(
          s,
          `${text}: ${who(s, p)} ${verb(s, "control")} no questing character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${text} · Deal 1 damage to a questing character you control${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: [fx("damage", { target: x.id, value: 1, player: p })],
          })),
        ),
      );
      return true;
    }
    // Onslaught of Mordor: each damaged character, -1 willpower and no healing this phase.
    case "bgOnslaughtMark": {
      const ids = globalCharacters(s)
        .filter((x) => isCharacter(x) && x.damage > 0)
        .map((x) => x.id);
      const key = { round: s.round, phase: phaseOf(s) };
      const prior =
        q.onslaught?.round === key.round && q.onslaught.phase === key.phase
          ? q.onslaught.ids
          : [];
      q.onslaught = { ...key, ids: [...new Set([...prior, ...ids])] };
      log(
        s,
        "Onslaught of Mordor: until the end of the phase, each damaged character gets -1 willpower and cannot be healed.",
        "danger",
      );
      return true;
    }
    // Warrior of Rhûn: remove a questing character you control from the quest.
    case "bgWarrior": {
      const targets = questingOf(s, p);
      if (!targets.length) {
        log(
          s,
          `Warrior of Rhûn: ${who(s, p)} ${verb(s, "control")} no questing character.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Warrior of Rhûn · Remove a questing character you control from the quest${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("bgUnquest", { target: x.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "bgUnquest":
      if (u?.committed) {
        removeFromQuest(s, u);
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
        log(
          s,
          `Warrior of Rhûn: ${name(u)} is removed from the quest.`,
          "danger",
        );
      }
      return true;
    // Hell-hawk.
    case "bgHawkSearch": {
      const zone = (codes: string[], id: string, label: string) =>
        [...new Set(codes.filter((c) => isNazgul(c)))].map((c) => ({
          id: `${id}-${c}`,
          code: c,
          label: `${card(c).name} · ${label}`,
          effects: [fx("bgHawkTake", { code: c, text: id, player: p })],
        }));
      const options = [
        ...zone(s.encounterDeck, "deck", "encounter deck"),
        ...zone(s.encounterDiscard, "discard", "discard pile"),
        ...zone(s.victoryCards ?? [], "victory", "victory display"),
      ];
      if (!options.length) return true;
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Hell-hawk · Search for a Nazgûl enemy${seatLabel(s, p)}`,
          options,
        ),
      );
      return true;
    }
    case "bgHawkTake": {
      const pile =
        e.text === "discard"
          ? s.encounterDiscard
          : e.text === "victory"
            ? (s.victoryCards ??= [])
            : s.encounterDeck;
      const i = pile.indexOf(e.code ?? "");
      if (i < 0) return true;
      pile.splice(i, 1);
      if (e.text === "victory")
        s.victory = Math.max(0, s.victory - (card(e.code!).victory ?? 0));
      if (e.text === "deck") s.encounterDeck = shuffle(s, s.encounterDeck);
      addEnemy(s, e.code!, "Hell-hawk");
      return true;
    }
    case "bgHawkHost": {
      const hosts = enemiesInPlay(s).filter(
        (x) => isNazgul(x.code) && !hawked(x),
      );
      if (!hosts.length) return true;
      const options = hosts.map((x) => ({
        id: x.id,
        code: x.code,
        label: name(x),
        effects: [
          fx("bgHawkAttach", { target: x.id, source: e.source, player: p }),
        ],
      }));
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Hell-hawk · Attach to a Nazgûl enemy${seatLabel(s, p)}`,
          options,
        ),
      );
      return true;
    }
    case "bgHawkAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!u || i < 0 || hawked(u)) return true;
      const [held] = q.resolving.splice(i, 1);
      u.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(
        s,
        `Hell-hawk is attached to ${name(u)}: +2 threat, +2 attack, +2 defense and immune to player card effects.`,
        "danger",
      );
      return true;
    }
    // The Hour of Doom: threat for each character, or the highest cost ally.
    case "bgHour": {
      const chars = charactersOf(s, p);
      const allies = seatView(s, p).allies.filter((x) => isAlly(x));
      const top = Math.max(-1, ...allies.map((x) => cost(x.code)));
      either(
        s,
        p,
        "The Hour of Doom",
        [
          ...(chars.length
            ? [
                {
                  id: "threat",
                  label: `Raise your threat by ${chars.length}`,
                  effects: [
                    fx("moThreat", {
                      value: chars.length,
                      text: "The Hour of Doom",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
          ...allies
            .filter((x) => cost(x.code) === top)
            .map((x) => ({
              id: `discard-${x.id}`,
              code: x.code,
              label: `Discard ${name(x)}`,
              effects: [fx("bgDiscardAlly", { target: x.id, player: p })],
            })),
        ],
        "When Revealed: each player must choose: either raise your threat by 1 for each character you control, or discard the highest cost ally you control.",
      );
      return true;
    }
    case "bgDiscardAlly":
      if (u && isAlly(u)) {
        log(s, `The Hour of Doom: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    // Jaws of Steel: X damage among characters you control, one at a time.
    case "bgJaws": {
      const left = e.value ?? 0;
      const targets = charactersOf(s, p);
      if (left <= 0 || !targets.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Jaws of Steel · Assign damage among characters you control · ${left} remaining${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: `${name(x)} · ${x.damage} damage`,
            effects: [
              fx("damage", { target: x.id, value: 1, player: p }),
              ...(left > 1
                ? [fx("bgJaws", { value: left - 1, player: p })]
                : []),
            ],
          })),
        ),
      );
      return true;
    }
    // Shadows.
    case "bgDiscardAttachment": {
      const owned = [
        ...globalCharacters(s),
        ...s.staging,
        ...globalEngaged(s),
        ...allActiveLocations(s),
      ].flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!owned.length) {
        log(s, "The Hour of Doom: you control no non-objective attachment.");
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Hour of Doom · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          owned.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} on ${name(host)}`,
            effects: [
              fx("bgDiscardThat", { target: host.id, source: a.id, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "bgDiscardThat": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(
          s,
          `The Hour of Doom: ${card(a.code).name} is discarded.`,
          "danger",
        );
        discardAttachment(s, u, a);
      }
      return true;
    }
    case "bgOnslaughtShadow": {
      const targets = s.staging.filter(
        (x) => isEnemy(x) && !card(x.code).is_unique,
      );
      if (!targets.length) {
        log(
          s,
          "Onslaught of Mordor: there is no non-unique enemy in the staging area.",
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Onslaught of Mordor · Engage a non-unique enemy in the staging area and deal it a shadow card${seatLabel(s, p)}`,
          targets.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [fx("bgOnslaughtEngage", { target: x.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "bgOnslaughtEngage":
      if (u && inStaging(s, u)) {
        forOwner(s, p, () => engage(s, u));
        dealEnemyShadows(s, u, 1);
        log(
          s,
          `Onslaught of Mordor: ${name(u)} is dealt a shadow card.`,
          "danger",
        );
      }
      return true;
    // Nazgûl of Mordor: raise your threat by 4 or return it to the staging area.
    case "bgNazgul": {
      const engaged = !!u && globalEngaged(s).some((x) => x.id === u.id);
      either(
        s,
        p,
        "Nazgûl of Mordor",
        [
          {
            id: "threat",
            label: "Raise your threat by 4",
            effects: [
              fx("moThreat", { value: 4, text: "Nazgûl of Mordor", player: p }),
            ],
          },
          ...(engaged
            ? [
                {
                  id: "return",
                  code: BG.nazgul,
                  label: "Return Nazgûl of Mordor to the staging area",
                  effects: [fx("bgReturn", { target: u!.id, player: p })],
                },
              ]
            : []),
        ],
        "Forced: after Nazgûl of Mordor attacks, either raise your threat by 4, or return Nazgûl of Mordor to the staging area.",
      );
      return true;
    }
    case "bgReturn":
      if (u) {
        toStaging(s, u);
        log(s, `${name(u)} returns to the staging area.`, "danger");
      }
      return true;
    // Easterling Bowman's shadow: the attacker engages the next player and attacks.
    case "bgNextAttack": {
      if (!u || !globalEngaged(s).some((x) => x.id === u.id)) return true;
      const order = playerOrder(s);
      const next = order[(order.indexOf(p) + 1) % order.length] ?? p;
      if (next !== p) forOwner(s, next, () => engage(s, u));
      log(
        s,
        `Easterling Bowman: ${name(u)} engages ${who(s, next)} and makes an attack.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: next }));
      return true;
    }
    // Gorgoroth Hill-troll: a random card from hand, threat equal to its printed cost.
    case "bgTroll": {
      forOwner(s, p, () => {
        if (!s.hand.length) {
          log(
            s,
            `Gorgoroth Hill-troll: ${who(s, p)} ${verb(s, "have")} no card in hand.`,
          );
          return;
        }
        const picked = s.hand[Math.floor(random(s) * s.hand.length)];
        const value = cost(picked.code);
        discardHandCard(s, picked.id, { encounterEffect: true });
        raiseThreat(s, value, "encounter");
        log(
          s,
          `Gorgoroth Hill-troll: ${card(picked.code).name} is discarded at random, and ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${value}.`,
          "danger",
        );
      });
      return true;
    }
    // Gwaihir: take control of him, or pay to discard him and a non-unique enemy.
    case "bgGwaihir": {
      const held = s.staging.find((x) => x.id === e.source);
      if (!held) return true;
      const payer = seatView(s, first).heroes.find(
        (h) => hasResourceIcon(h, "fellowship") && h.resources > 0,
      );
      const targets = payer
        ? s.staging.filter((x) => isEnemy(x) && !card(x.code).is_unique)
        : [];
      forOwner(s, first, () =>
        choose(
          s,
          `Gwaihir · Choose one${seatLabel(s, first)}`,
          [
            {
              id: "control",
              code: BG.gwaihir,
              label: "Take control of Gwaihir",
              effects: [
                fx("bgGwaihirControl", { source: held.id, player: first }),
              ],
            },
            ...targets.map((x) => ({
              id: `discard-${x.id}`,
              code: x.code,
              label: `Spend 1 Fellowship resource and discard Gwaihir to discard ${name(x)}`,
              effects: [
                fx("bgGwaihirDiscard", {
                  source: held.id,
                  target: x.id,
                  value: 0,
                  player: first,
                }),
              ],
            })),
          ],
          "When Revealed: the first player must choose: either take control of Gwaihir, or spend 1 Fellowship resource and discard Gwaihir to discard a non-unique enemy in the staging area.",
        ),
      );
      return true;
    }
    case "bgGwaihirControl": {
      const held = s.staging.find((x) => x.id === e.source);
      if (!held) return true;
      s.staging = s.staging.filter((x) => x.id !== held.id);
      held.owner = first;
      held.controller = first;
      forOwner(s, first, () => s.allies.push(held));
      log(
        s,
        `Gwaihir: ${who(s, first)} ${verb(s, "take")} control of Gwaihir.`,
        "good",
      );
      return true;
    }
    case "bgGwaihirDiscard": {
      const held = s.staging.find((x) => x.id === e.source);
      if (!held) return true;
      const payer = seatView(s, first).heroes.find(
        (h) => hasResourceIcon(h, "fellowship") && h.resources > 0,
      );
      if (!payer || !u || !inStaging(s, u)) {
        prepend(s, fx("bgGwaihirControl", { source: e.source, player: first }));
        return true;
      }
      forOwner(s, first, () => spendResources(s, payer, 1));
      s.staging = s.staging.filter((x) => x.id !== held.id);
      s.encounterDiscard.push(held.code);
      s.staging = s.staging.filter((x) => x.id !== u.id);
      s.encounterDiscard.push(u.code, ...u.shadows);
      u.shadows = [];
      for (const a of [...u.attachments]) discardAttachment(s, u, a);
      log(
        s,
        `Gwaihir: ${name(payer)} spends 1 resource; Gwaihir and ${name(u)} are discarded.`,
        "good",
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const BLACK_GATE_HOOKS: Batch4ScenarioHooks = {
  setup: setupBlackGate,
  // 1B's When Revealed resolves once the opening hands are kept, then 2A.
  openingHandsKept: (s) => {
    const q = s.blackGate;
    if (
      !q ||
      q.currentQuest !== BG.embassy ||
      q.embassy !== undefined ||
      s.round > 0
    )
      return false;
    const first = firstPlayer(s);
    prepend(
      s,
      fx("bgEmbassy", { player: first }),
      fx("bgEmbassyDone", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  // 1B's pairs are played at no cost before the first round.
  setupPlays: (s) => !!s.blackGate?.embassy,
  // 1B advances by its own effect; 2B cannot be defeated.
  advance: (s) => !!s.blackGate,
  stageInfo: blackGateStageInfo,
  check: (s) => {
    if (s.blackGate && s.status === "playing") lotrSagaCheck(s);
  },
  encounter,
  shadow,
  questBegin: (s) => {
    const gate = bgGate(s);
    return s.blackGate && gate && !gate.blanked
      ? [fx("bgGate", { player: firstPlayer(s) })]
      : [];
  },
  // 2B: the first player reveals one encounter card for each resource on The Black Gate.
  extraStagingReveals: (s) =>
    at(s, BG.battle) ? bgScore(s) - livingSeats(s).length : 0,
  stagingRevealsByFirstPlayer: (s) => at(s, BG.battle),
  failedQuest: (s) => {
    const q = s.blackGate;
    if (
      q &&
      at(s, BG.battle) &&
      s.activeLocation &&
      q.failedRound !== s.round
    ) {
      q.failedRound = s.round;
      prepend(s, fx("bgDiscardActive", { player: firstPlayer(s) }));
    }
    return false;
  },
  cardEntered: (s, u, fromReveal, cancelled) => {
    if (!s.blackGate || !fromReveal || cancelled || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === BG.bowman) prepend(s, fx("bgBowman", { player: p }));
    if (u.code === BG.warrior) prepend(s, fx("bgWarrior", { player: p }));
    // Gwaihir waits in the staging area for the first player's choice.
    if (u.code === BG.gwaihir)
      prepend(s, fx("bgGwaihir", { source: u.id, player: firstPlayer(s) }));
  },
  engaged: (s, u) => {
    if (s.blackGate) mordorOrcEngaged(s, u, activeSeat(s));
  },
  // Archery from the staging area: Snaga Archer and Easterling Bowman.
  combatBegin: (s) => {
    if (s.blackGate) stagingArchery(s, firstPlayer(s));
  },
  attackFinished: (s, c, skipped = false) => {
    const q = s.blackGate;
    if (!q) return [];
    const effects: Effect[] = [];
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    if (q.rage?.enemy === c.enemyId) delete q.rage;
    if (skipped || !enemy) return effects;
    if (live(enemy, BG.nazgul))
      effects.push(fx("bgNazgul", { target: enemy.id, player: p }));
    if (c.bgNextPlayer)
      effects.push(fx("bgNextAttack", { target: enemy.id, player: p }));
    if (c.bgTrollKill) effects.push(fx("bgTroll", { player: p }));
    return effects;
  },
  characterDestroyed: (s, u, context) => {
    const q = s.blackGate;
    const c = s.combat;
    if (!q || !isCharacter(u) || !context.combatDamage || !c) return;
    if (context.enemyId !== c.enemyId) return;
    mordorOrcCharacterDestroyed(s, context);
    const enemy = get(s, c.enemyId);
    if (enemy && live(enemy, BG.troll)) c.bgTrollKill = true;
    // Rage Filled Him: a character destroyed by The Mouth of Sauron's attack.
    if (q.rage && q.rage.enemy === c.enemyId) {
      const p = q.rage.player;
      delete q.rage;
      prepend(
        s,
        fx("moThreat", { value: 4, text: "Rage Filled Him", player: p }),
      );
    }
  },
  // The Mouth of Sauron: after a player cancels a 'when revealed' effect.
  revealCancelCountered: (s) => {
    if (s.blackGate) s.blackGate.canceller = activeSeat(s);
    return false;
  },
  whenRevealedCancelled: (s) => {
    const q = s.blackGate;
    if (!q) return;
    const p = q.canceller ?? activeSeat(s);
    delete q.canceller;
    const m = mouth(s);
    if (!m) return;
    log(
      s,
      `The Mouth of Sauron makes an immediate attack against ${who(s, p)}, who canceled a 'when revealed' effect.`,
      "danger",
    );
    prepend(s, fx("immediateAttack", { target: m.id, player: p }));
  },
  cannotLeave: (s, u) => !!s.blackGate && live(u, BG.mouth) && inStaging(s, u),
  cannotEngage: (s, u) => !!s.blackGate && live(u, BG.mouth),
  cannotOptionallyEngage: (s, u) => !!s.blackGate && live(u, BG.mouth),
  // Hell-hawk's host, and the staging area while Wall of Morannon is active.
  immune: (s, u) =>
    !!s.blackGate &&
    (hawked(u) ||
      (activeIs(s, BG.wall) &&
        inStaging(s, u) &&
        (isEnemy(u) || card(u.code).type_code === "location"))),
  travelProblem: (s, u) =>
    s.blackGate && u.code === BG.gate
      ? "The players cannot travel to The Black Gate."
      : null,
  // "After … becomes the active location", by any means.
  travelEntered: (s, u) => {
    if (!s.blackGate || u.blanked) return;
    const first = firstPlayer(s);
    if (u.code === BG.hills)
      prepend(s, ...playerOrder(s).map((player) => fx("bgHills", { player })));
    if (u.code === BG.moat)
      prepend(s, fx("bgMoat", { target: u.id, player: first }));
    if (u.code === BG.wall) {
      const engaged = globalEngaged(s).filter((x) => isEnemy(x));
      for (const enemy of engaged) toStaging(s, enemy);
      if (engaged.length)
        log(
          s,
          `Wall of Morannon: ${engaged.map((x) => name(x)).join(", ")} ${engaged.length === 1 ? "returns" : "return"} to the staging area.`,
          "danger",
        );
    }
  },
  // "When … leaves play": Slopes of Cirith Gorgor and Reeking Moat.
  hostLeaves: (s, u) => {
    if (!s.blackGate) return;
    const first = firstPlayer(s);
    if (live(u, BG.slopes)) prepend(s, fx("bgSlopes", { player: first }));
    if (s.blackGate.moat?.some((m) => m.location === u.id))
      prepend(s, fx("bgMoatRelease", { source: u.id, player: first }));
  },
  threatBonus: (s, u) => {
    if (!s.blackGate) return 0;
    let bonus = 0;
    if (live(u, BG.gate)) bonus += u.resources;
    if (live(u, BG.towers)) bonus += mostCharacters(s);
    if (hawked(u)) bonus += 2;
    return bonus;
  },
  stats: (s, u) => {
    const q = s.blackGate;
    if (!q) return {};
    let will = 0,
      attack = 0,
      defense = 0;
    if (hawked(u)) {
      attack += 2;
      defense += 2;
    }
    if (
      q.onslaught?.round === s.round &&
      q.onslaught.phase === phaseOf(s) &&
      q.onslaught.ids.includes(u.id)
    )
      will -= 1;
    return { will, attack, defense };
  },
  // Beleaguered Hills: -X total threat, X being the engaged enemies' threat.
  stagingThreat: (s) =>
    s.blackGate && activeIs(s, BG.hills)
      ? -globalEngaged(s)
          .filter((x) => isEnemy(x))
          .reduce((n, x) => n + threatOf(s, x), 0)
      : 0,
  // Waste of Dagorlad: each ally's printed text box is blank, except Traits.
  characterBlanked: (s, u) =>
    !!s.blackGate && activeIs(s, BG.waste) && isAlly(u),
  // Towers of the Teeth: the players cannot play allies.
  playProblem: (s, code) =>
    s.blackGate && activeIs(s, BG.towers) && card(code).type_code === "ally"
      ? "While Towers of the Teeth is the active location, players cannot play allies."
      : null,
  cannotAttach: (s, u, code) =>
    !!s.blackGate &&
    ((live(u, BG.nazgul) && !hasPrintedTrait(code, "Morgul")) ||
      live(u, BG.troll)),
  cannotHeal: (s, u) => {
    const q = s.blackGate;
    return (
      !!q?.onslaught &&
      q.onslaught.round === s.round &&
      q.onslaught.phase === phaseOf(s) &&
      q.onslaught.ids.includes(u.id)
    );
  },
  cannotReady: (s, u) =>
    !!s.blackGate?.noReady &&
    s.blackGate.noReady.round === s.round &&
    s.blackGate.noReady.ids.includes(u.id),
  // Dire: no more than 1 threat reduction each round from non-boon player cards.
  threatReduction: (s, amount, reason, source) =>
    s.blackGate ? direThreatReduction(s, amount, reason, source) : amount,
  // The players cannot win: their result is the resources on The Black Gate.
  // Epic multiplayer mode: the game ends for both teams (no score).
  lossReason: (s, reason) => {
    if (!s.blackGate || s.epicTeam !== undefined) return reason;
    const n = bgScore(s);
    return `${reason} The players held the Morannon for ${n} round${n === 1 ? "" : "s"}: ${n} resource${n === 1 ? "" : "s"} on The Black Gate.`;
  },
  effect: (s, e) =>
    (!!s.blackGate && mordorOrcsEffect(s, e)) || blackGateEffect(s, e),
  sharedEffect: (e) =>
    [
      "bgTreacheryDone",
      "bgEmbassy",
      "bgEmbassyPair",
      "bgEmbassyDiscard",
      "bgEmbassyReveal",
      "bgEmbassyDone",
      "bgStageTwo",
      "bgGwaihirIn",
      "bgGate",
      "bgDiscardActive",
      "bgMoat",
      "bgMoatPlace",
      "bgMoatRelease",
      "bgSlopes",
      "bgOnslaughtMark",
      "bgGwaihir",
      "bgGwaihirControl",
      "bgGwaihirDiscard",
    ].includes(e.kind),
};
