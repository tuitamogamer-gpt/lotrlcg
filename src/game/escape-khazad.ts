import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  enterEnemyEngaged,
  raiseThreat,
} from "./board";
import { canTravel } from "./actions";
import { dealEnemyShadows } from "./considered-engagement";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestCode, mainQuestUnit } from "./quest-state";
import {
  EK,
  EK_BRIDGE_TARGET,
  EK_EVENT_CARDS,
  ekCost,
  ekHasTrait,
  ekRecipe,
  ekStageInfo,
  ekStageOf,
} from "./escape-khazad-support";
import {
  activeKey,
  ekCardEffect,
  ekEncounter,
  ekShadow,
  isCharacter,
  printedThreat,
  roundKey,
} from "./escape-khazad-cards";
import {
  fellowshipEventComplete,
  fellowshipEventDefeat,
  fellowshipEventEffect,
  fellowshipEventOpening,
  fellowshipEventSharedKinds,
  type FellowshipEventConfig,
} from "./fellowship-event";
import { fellowshipEventState } from "./fellowship-event-support";
import {
  engagedWith,
  enemiesInPlay,
  inPlay,
  isEnemy,
  isLocation,
  liftEnemy,
  live,
  players,
  searchable,
  seatLabel,
  stageNumber,
  takeSearched,
  toStaging,
  who,
} from "./fellowship-event-lib";
export * from "./escape-khazad-support";

/**
 * Escape from Khazad-dûm (2019 Fellowship event), played cooperatively. The
 * players build the quest deck from Out of the Depths and one stage 2 and one
 * stage 3 card, and the encounter deck from 7 of the 14 encounter sets (the
 * quick build); the first player resolves each 'opposing team' effect. Lost
 * in Moria, they climb out of the Dark Pit, whose other side is Durin's Bane,
 * search for an exit and escape the Balrog at the East Gate.
 */
const at = (s: GameState, code: string) =>
  s.escapeKhazad?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
const bane = (s: GameState) => enemiesInPlay(s).find((u) => u.code === EK.bane);
const pitInPlay = (s: GameState) =>
  s.staging.some((u) => u.code === EK.pit) ||
  s.activeLocation?.code === EK.pit ||
  (s.extraActiveLocations ?? []).some((u) => u.code === EK.pit);
const defendersOf = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** Locations the players could travel to now. */
const travelable = (s: GameState, test: (u: Unit) => boolean = () => true) =>
  s.staging.filter((u) => isLocation(u) && test(u) && !canTravel(s, u));

/** The shared quick build, with this scenario's stage effects. */
const EK_EVENT: FellowshipEventConfig = {
  ...EK_EVENT_CARDS,
  prefix: "ek",
  state: (s) => s.escapeKhazad,
  // 3A Nearing the Gate: Durin's Bane instead of a search of the top 5 cards.
  stageFront: (s, code) =>
    ekStageOf(code) === 3
      ? [fx("ekGate", { player: firstPlayer(s) })]
      : undefined,
  stageRevealed: (s, code) => {
    const first = firstPlayer(s);
    if (code === EK.lair) return [fx("ekLair", { player: first })];
    if (code === EK.wrongTurn)
      return playerOrder(s).map((owner) =>
        fx("ekWrongTurn", { player: owner }),
      );
    if (code === EK.lastLord) return [fx("ekLastLord", { player: first })];
    return [];
  },
};

// ---------------------------------------------------------------------------
// Setup.

export function setupEscapeKhazad(s: GameState) {
  const r = ekRecipe();
  const cards = r.cards.flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = [];
  s.escapeKhazad = {
    ...fellowshipEventState(cards, EK.depths),
    baneAside: false,
    baneSafe: null,
    baneDamage: null,
    bridgeDamage: 0,
    bridgePlaced: null,
    lair: null,
    blank: [],
    penalties: [],
    enemyDefense: [],
    noDamage: [],
    fatigue: null,
    noReady: [],
    reduced: [],
    dungeon: [],
    nameless: [],
    excess: null,
    resolving: [],
  };
  log(
    s,
    "Escape from Khazad-dûm: the players choose a stage 2 and a stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.escapeKhazad;
  if (!q) return false;
  if (!fellowshipEventComplete(s, q, ekStageInfo(s)?.quest ?? 0)) return true;
  // 1B: Dark Pit must be explored first.
  if (q.currentQuest === EK.depths && pitInPlay(s)) return true;
  // Last Lord of Moria: Durin's Bane must leave play first.
  if (q.currentQuest === EK.lastLord && bane(s)) return true;
  fellowshipEventDefeat(
    s,
    EK_EVENT,
    "The players escape through the East Gate of Moria: they win the game!",
  );
  return true;
}

function ekStageEffect(s: GameState, e: Effect): boolean {
  const q = s.escapeKhazad;
  if (!q || !e.kind.startsWith("ek")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    // 1B: Dark Pit is explored; it is flipped over and Durin's Bane is set aside.
    case "ekPitFlip":
      q.baneAside = true;
      log(
        s,
        "Out of the Depths: Dark Pit is explored; it is flipped over and Durin's Bane is set aside, out of play. Each player searches the top 5 cards of his deck for a card.",
        "good",
      );
      prepend(
        s,
        ...playerOrder(s).map((owner) => fx("ekDepths", { player: owner })),
      );
      return true;
    case "ekDepths": {
      const top = [...new Set(seatView(s, p).deck.slice(0, 5))];
      if (!top.length) {
        log(
          s,
          `Out of the Depths: ${who(s, p)} ${s.table ? "has" : "have"} no card in the deck.`,
        );
        return true;
      }
      choose(
        s,
        `Out of the Depths · Search the top 5 cards of your deck for a card to add to your hand${seatLabel(s, p)}`,
        top.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} to your hand`,
          effects: [fx("ekDepthsTake", { code: c, player: p })],
        })),
        card(EK.depths).back_text,
      );
      return true;
    }
    case "ekDepthsTake":
      forOwner(s, p, () => {
        const i = s.deck.slice(0, 5).indexOf(e.code ?? "");
        if (i < 0) return;
        const [c] = s.deck.splice(i, 1);
        const u = make(s, c);
        u.owner = p;
        s.hand.push(u);
        s.deck = shuffle(s, s.deck);
        log(
          s,
          `Out of the Depths: ${who(s, p)} ${s.table ? "adds" : "add"} ${card(c).name} to ${s.table ? "his" : "your"} hand and ${s.table ? "shuffles" : "shuffle"} the deck.`,
          "good",
        );
      });
      return true;
    // 3A: the set-aside Durin's Bane is added to the staging area.
    case "ekGate": {
      if (!q.baneAside) {
        log(s, "Nearing the Gate: Durin's Bane is not set aside.");
        return true;
      }
      q.baneAside = false;
      const u = toStaging(s, EK.bane);
      q.baneSafe = s.round;
      log(
        s,
        "Nearing the Gate: Durin's Bane is added to the staging area; it cannot take damage this round.",
        "danger",
      );
      if (players(s) > 1)
        prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    // Old One Lair: an enemy with cost 2 or less, with a resource on it.
    case "ekLair": {
      const options = searchable(
        s,
        (c) => card(c).type_code === "enemy" && ekCost(c) <= 2,
      );
      if (!options.length) {
        log(s, "Old One Lair: there is no enemy with cost 2 or less.");
        prepend(s, fx("ekShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Old One Lair · The opposing team adds an enemy with cost 2 or less to the staging area and places a resource on it${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${ekCost(c)})`,
          effects: [
            fx("ekLairTake", { code: c, player: first }),
            fx("ekShuffle", { player: first }),
          ],
        })),
        card(EK.lair).back_text,
      );
      return true;
    }
    case "ekLairTake": {
      if (!e.code || !takeSearched(s, e.code)) return true;
      const u = toStaging(s, e.code);
      u.resources += 1;
      q.lair = u.id;
      log(
        s,
        `Old One Lair: ${name(u)} is added to the staging area with a resource on it; it is immune to player card effects, and no progress can be placed on the stage while it is in play.`,
        "danger",
      );
      return true;
    }
    // A Wrong Turn: each player keeps 1 card and shuffles the rest into the deck.
    case "ekWrongTurn": {
      const hand = seatView(s, p).hand;
      if (hand.length <= 1) {
        log(
          s,
          `A Wrong Turn: ${who(s, p)} ${s.table ? "keeps" : "keep"} ${s.table ? "his" : "your"} hand.`,
        );
        return true;
      }
      choose(
        s,
        `A Wrong Turn · Choose 1 card in your hand to keep; the rest are shuffled into your deck${seatLabel(s, p)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Keep ${name(u)}`,
          effects: [fx("ekKeep", { target: u.id, player: p })],
        })),
        card(EK.wrongTurn).back_text,
      );
      return true;
    }
    case "ekKeep":
      forOwner(s, p, () => {
        const rest = s.hand.filter((u) => u.id !== e.target);
        s.hand = s.hand.filter((u) => u.id === e.target);
        s.deck = shuffle(s, [...s.deck, ...rest.map((u) => u.code)]);
        log(
          s,
          `A Wrong Turn: ${rest.length} card${rest.length === 1 ? " is" : "s are"} shuffled into ${who(s, p)}${s.table ? "'s" : "r"} deck.`,
          "danger",
        );
      });
      return true;
    // Last Lord of Moria: Durin's Bane engages the first player.
    case "ekLastLord": {
      const u = bane(s);
      if (!u || engagedWith(s, u) === first) return true;
      liftEnemy(s, u);
      log(
        s,
        `Last Lord of Moria: Durin's Bane engages ${who(s, first)}.`,
        "danger",
      );
      enterEnemyEngaged(s, u, first);
      return true;
    }
    // The Bridge of Khazad-dûm: Durin's Bane attacks the first player.
    case "ekBridgeAttack": {
      const u = bane(s);
      if (!u) return true;
      log(
        s,
        `The Bridge of Khazad-dûm: Durin's Bane attacks ${who(s, first)}; undefended or excess damage is placed on the stage.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", {
          target: u.id,
          player: first,
          damageTarget: EK_BRIDGE_TARGET,
        }),
      );
      return true;
    }
    case "ekBridgeDamage": {
      const n = e.value ?? 0;
      if (n <= 0) return true;
      q.bridgeDamage += n;
      log(
        s,
        `The Bridge of Khazad-dûm: ${n} ${e.text ?? ""} damage is placed on the stage (${q.bridgeDamage} of 10).`.replace(
          "  ",
          " ",
        ),
        "danger",
      );
      if (q.bridgeDamage >= 10)
        lose(
          s,
          "The Bridge of Khazad-dûm has damage equal to its quest points: the players lose the game.",
        );
      return true;
    }
    // Durin's Bane destroyed a character: its controller's threat +2, 2 damage healed.
    case "ekBaneKill": {
      const u = get(s, e.target);
      forOwner(s, p, () => raiseThreat(s, 2, "encounter"));
      if (u) u.damage = Math.max(0, u.damage - 2);
      log(
        s,
        `Durin's Bane destroyed a character: ${who(s, p)} ${s.table ? "raises" : "raise"} threat by 2 and 2 damage is healed from Durin's Bane.`,
        "danger",
      );
      return true;
    }
    // Western Hall's travel: the top card's printed threat to each player.
    case "ekWesternHall": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      s.encounterDiscard.push(top);
      const x = printedThreat(top);
      log(
        s,
        `Western Hall: ${card(top).name} is discarded from the encounter deck; each player raises his threat by ${x}.`,
        x ? "danger" : "normal",
      );
      if (x)
        prepend(
          s,
          fx("ekEachThreat", { value: x, text: "Western Hall", player: first }),
        );
      return true;
    }
    // The Mountain's Roots' travel: each player discards the top X cards of his deck.
    case "ekMill":
      forOwner(s, p, () => {
        const cards = s.deck.splice(0, e.count ?? 0);
        s.discard.push(...cards);
        log(
          s,
          `The Mountain's Roots: ${who(s, p)} ${s.table ? "discards" : "discard"} ${cards.length} card${cards.length === 1 ? "" : "s"} from the top of the deck.`,
          "danger",
        );
      });
      return true;
    // Lightless Grotto's travel: the first player engages a staged enemy.
    case "ekGrotto": {
      const enemies = s.staging.filter(isEnemy);
      if (!enemies.length) {
        log(s, "Lightless Grotto: there is no enemy in the staging area.");
        return true;
      }
      choose(
        s,
        `Lightless Grotto · Choose an enemy in the staging area to engage${seatLabel(s, first)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Engage ${name(u)}`,
          effects: [fx("ekEngage", { target: u.id, player: first })],
        })),
        card(EK.grotto).text,
      );
      return true;
    }
    case "ekEngage": {
      const u = get(s, e.target);
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      log(
        s,
        `${who(s, p)} ${s.table ? "engages" : "engage"} ${name(u)}.`,
        "danger",
      );
      enterEnemyEngaged(s, u, p);
      return true;
    }
    // Dreadful Gap's travel: a card from the encounter discard pile shuffled back.
    case "ekGap": {
      const options = [...new Set(s.encounterDiscard)];
      if (!options.length) {
        log(s, "Dreadful Gap: the encounter discard pile is empty.");
        return true;
      }
      choose(
        s,
        `Dreadful Gap · The opposing team shuffles a card from the encounter discard pile into the encounter deck${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Shuffle ${card(c).name} into the encounter deck`,
          effects: [
            fx("ekReshuffle", { code: c, text: "Dreadful Gap", player: first }),
          ],
        })),
        card(EK.gap).text,
      );
      return true;
    }
    // Mithril Lode, explored as the active location: a resource for a hero of each player.
    case "ekMithril":
      choose(
        s,
        `Mithril Lode · Response: each player adds 1 resource to the resource pool of a hero he controls?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label: "Each player adds 1 resource to a hero's pool",
            effects: playerOrder(s).map((owner) =>
              fx("ekMithrilHero", { player: owner }),
            ),
          },
          {
            id: "skip",
            label: "Continue without using this ability",
            effects: [],
          },
        ],
        card(EK.mithril).text,
      );
      return true;
    case "ekMithrilHero": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Mithril Lode · Add 1 resource to the resource pool of a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} (${h.resources} resource${h.resources === 1 ? "" : "s"})`,
          effects: [fx("ekResource", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "ekResource": {
      const h = get(s, e.target);
      if (!h) return true;
      h.resources += 1;
      log(s, `Mithril Lode: ${name(h)} gains 1 resource.`, "good");
      return true;
    }
    // Watchful Eyes: an exhausted hero at the end of the combat phase reveals a card.
    case "ekEyesReveal":
      log(
        s,
        `Watchful Eyes: ${e.text} is exhausted at the end of the combat phase; 1 card is revealed from the encounter deck.`,
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
  }
  return false;
}
/** The Bridge of Khazad-dûm: Durin's Bane's undefended damage goes onto the stage. */
function bridgeUndefended(s: GameState) {
  const c = s.combat;
  const q = s.escapeKhazad;
  if (!q || !c || c.undefendedTargetId !== EK_BRIDGE_TARGET) return false;
  if (defendersOf(s).length) return false;
  const enemy = get(s, c.enemyId);
  if (!enemy) return false;
  c.attackResolved = true;
  if (c.noDamage) {
    log(s, `${name(enemy)}'s attack deals no damage.`, "good");
    return true;
  }
  const power = Math.max(0, stats(s, enemy).attack + c.attackBonus);
  prepend(
    s,
    fx("ekBridgeDamage", {
      value: power,
      text: "undefended",
      player: firstPlayer(s),
    }),
  );
  return true;
}
/** Goblin Dungeon: each ally it guards returns to its owner's control, exhausted. */
function freeDungeon(s: GameState, locationId: string) {
  const q = s.escapeKhazad;
  if (!q) return;
  for (const g of q.dungeon.filter((x) => x.locationId === locationId)) {
    q.dungeon = q.dungeon.filter((x) => x !== g);
    g.ally.exhausted = true;
    forOwner(s, g.player, () => s.allies.push(g.ally));
    log(
      s,
      `Goblin Dungeon: ${name(g.ally)} returns to ${who(s, g.player)}${s.table ? "'s" : "r"} control, exhausted.`,
      "good",
    );
  }
}
/**
 * Undisturbed Bones on the main quest: when a 'when revealed' effect would be
 * canceled, one copy is discarded instead and the effect resolves.
 */
function discardBones(s: GameState) {
  const code = mainQuestCode(s);
  const bones = code
    ? s.questAttachments?.[code]?.find((a) => a.code === EK.bones)
    : undefined;
  const host = mainQuestUnit(s);
  if (!bones || !host) return false;
  discardAttachment(s, host, bones);
  log(
    s,
    "Undisturbed Bones is discarded instead: the 'when revealed' effect is not canceled.",
    "danger",
  );
  return true;
}
/** Eleanor's cancel (a hero's response): Undisturbed Bones resolves the card instead. */
function bonesCounterReplace(s: GameState, e: Effect) {
  if (!s.escapeKhazad || !e.code || !discardBones(s)) return false;
  prepend(
    s,
    fx("placeEncounter", {
      text: "revealed",
      code: e.code,
      source: e.source,
      revealOrigin: e.revealOrigin,
      player: e.player,
    }),
  );
  return true;
}
/** Each guarded ally whose Goblin Dungeon left play, and each card a Nameless Thing held. */
function guardCheck(s: GameState) {
  const q = s.escapeKhazad;
  if (!q) return;
  for (const g of [...q.dungeon])
    if (!inPlay(s, g.locationId)) freeDungeon(s, g.locationId);
  for (const g of [...q.nameless]) {
    if (inPlay(s, g.enemyId)) continue;
    q.nameless = q.nameless.filter((x) => x !== g);
    forOwner(s, g.player, () => s.discard.push(g.code));
    log(s, `Nameless Thing left play: ${card(g.code).name} is discarded.`);
  }
}
/** The X of a Nameless Thing: the printed cost of its card. */
const namelessX = (s: GameState, id: string) => {
  const g = s.escapeKhazad?.nameless.find((x) => x.enemyId === id);
  return g ? Number(card(g.code).cost) || 0 : 0;
};

// ---------------------------------------------------------------------------
// Hooks.

export const ESCAPE_KHAZAD_HOOKS: Batch4ScenarioHooks = {
  setup: setupEscapeKhazad,
  openingHandsKept: (s) => fellowshipEventOpening(s, EK_EVENT),
  advance,
  stageInfo: ekStageInfo,
  encounter: ekEncounter,
  shadow: ekShadow,
  effect: (s, e) =>
    (e.kind === "enemyDamage" && bridgeUndefended(s)) ||
    (e.kind === "cancelReplace" && bonesCounterReplace(s, e)) ||
    fellowshipEventEffect(s, e, EK_EVENT) ||
    ekStageEffect(s, e) ||
    ekCardEffect(s, e),
  check: guardCheck,
  stats: (s, u) => {
    const q = s.escapeKhazad;
    if (!q) return {};
    if (isCharacter(u)) {
      let will = 0,
        attack = 0,
        defense = 0;
      for (const x of q.penalties)
        if (x.id === u.id && activeKey(s, x.key)) {
          will -= x.will;
          attack -= x.attack;
          defense -= x.defense;
        }
      return { will, attack, defense };
    }
    if (!isEnemy(u)) return {};
    let attack = 0,
      defense = 0;
    for (const x of q.enemyDefense)
      if (x.id === u.id && activeKey(s, x.key)) defense += x.value;
    if (!u.blanked) {
      // Nameless Thing: +X attack and defense, X its card's printed cost.
      if (u.code === EK.nameless) {
        const x = namelessX(s, u.id);
        attack += x;
        defense += x;
      }
      // Black Uruks: +1 attack for each shadow card dealt for this attack.
      if (u.code === EK.uruks && s.combat?.enemyId === u.id)
        attack += u.shadows.length;
    }
    return { attack, defense };
  },
  threatBonus: (s, u) => {
    const q = s.escapeKhazad;
    if (!q) return 0;
    let bonus = 0;
    if (isEnemy(u) && ekHasTrait(u.code, "Creature"))
      bonus += staged(s, EK.nest);
    if (live(u, EK.branching))
      bonus += Math.min(3, s.staging.filter(isLocation).length);
    if (live(u, EK.roots)) bonus += stageNumber(s) + 1;
    if (live(u, EK.nameless)) bonus += namelessX(s, u.id);
    bonus += 2 * u.attachments.filter((a) => a.code === EK.vast).length;
    return bonus;
  },
  // A Way Up: the active location's threat is added to the staging area.
  stagingThreat: (s) =>
    s.escapeKhazad && at(s, EK.wayUp) && s.activeLocation
      ? threatOf(s, s.activeLocation)
      : 0,
  // Frightful Den: Troll enemies get -10 engagement cost.
  engagementBonus: (s, u) =>
    s.escapeKhazad &&
    isEnemy(u) &&
    ekHasTrait(u.code, "Troll") &&
    staged(s, EK.den)
      ? -10
      : 0,
  cannotOptionallyEngage: (s, u) =>
    !!s.escapeKhazad && (live(u, EK.bane) || live(u, EK.elder)),
  // The Rear Guard: Durin's Bane is considered engaged with each player.
  consideredEngaged: (s, u, player) =>
    !!s.escapeKhazad &&
    live(u, EK.bane) &&
    at(s, EK.rearGuard) &&
    s.staging.some((x) => x.id === u.id) &&
    playerOrder(s).includes(player),
  immune: (s, u) => {
    const q = s.escapeKhazad;
    if (!q) return false;
    if (at(s, EK.lair) && u.id === q.lair) return true;
    return u.attachments.some((a) => a.code === EK.vast);
  },
  damageAmount: (s, u, amount, context) => {
    const q = s.escapeKhazad;
    if (!q || !isEnemy(u)) return amount;
    if (
      !context.combatDamage &&
      [EK.dweller, EK.chieftain].some((c) => live(u, c))
    )
      return 0;
    if (q.noDamage.some((x) => x.id === u.id && activeKey(s, x.key))) return 0;
    if (u.code === EK.bane && q.baneSafe === s.round) return 0;
    // Lightless Grotto: non-unique staged enemies cannot take damage.
    if (
      staged(s, EK.grotto) &&
      !card(u.code).is_unique &&
      s.staging.some((x) => x.id === u.id)
    )
      return 0;
    // Last Lord of Moria: no more than X damage each round, X the progress on it.
    if (u.code === EK.bane && at(s, EK.lastLord)) {
      const taken = q.baneDamage?.round === s.round ? q.baneDamage.amount : 0;
      return Math.max(0, Math.min(amount, s.progress - taken));
    }
    return amount;
  },
  damageDealt: (s, u, amount, context) => {
    const q = s.escapeKhazad;
    if (!q) return;
    if (u.code === EK.bane && at(s, EK.lastLord))
      q.baneDamage = {
        round: s.round,
        amount:
          (q.baneDamage?.round === s.round ? q.baneDamage.amount : 0) + amount,
      };
    const c = s.combat;
    if (!c || !context.combatDamage || context.enemyId !== c.enemyId) return;
    if (!isCharacter(u)) return;
    const excess = Math.max(0, u.damage - stats(s, u).health);
    if (!excess) return;
    // The Bridge of Khazad-dûm: excess damage of Durin's Bane's attack.
    if (c.undefendedTargetId === EK_BRIDGE_TARGET)
      prepend(
        s,
        fx("ekBridgeDamage", {
          value: excess,
          text: "excess",
          player: firstPlayer(s),
        }),
      );
    const enemy = get(s, c.enemyId);
    if (enemy && live(enemy, EK.stoneTroll))
      q.excess = { id: u.id, amount: excess };
  },
  characterDestroyed: (s, u, context) => {
    const q = s.escapeKhazad;
    const c = s.combat;
    if (!q || !c || !context.combatDamage || context.enemyId !== c.enemyId)
      return;
    const enemy = get(s, c.enemyId);
    const p = c.attackPlayer ?? activeSeat(s);
    const effects: Effect[] = [];
    // Western Hall's shadow: a destroyed character reveals the top card.
    if (c.ekRevealOnKill) {
      c.ekRevealOnKill = false;
      effects.push(fx("reveal", { player: firstPlayer(s) }));
    }
    // Old Stone-troll: 1 threat for each excess point of damage.
    if (enemy && live(enemy, EK.stoneTroll) && q.excess?.id === u.id)
      effects.push(
        fx("ekThreat", {
          value: q.excess.amount,
          text: "Old Stone-troll",
          player: p,
        }),
      );
    q.excess = null;
    if (enemy && live(enemy, EK.bane))
      effects.push(fx("ekBaneKill", { target: enemy.id, player: p }));
    if (effects.length) prepend(s, ...effects);
  },
  // No non-objective player card attachments.
  cannotAttach: (s, u, code) =>
    !!s.escapeKhazad &&
    [EK.caveTroll, EK.stoneTroll, EK.dweller, EK.chieftain].some((c) =>
      live(u, c),
    ) &&
    card(code).type_code === "attachment",
  // Rock Adder cannot be defended; allies cannot defend against Cave-troll.
  cannotDefend: (s, enemy, defender) =>
    !!s.escapeKhazad &&
    (live(enemy, EK.adder) ||
      (live(enemy, EK.caveTroll) &&
        !!defender &&
        card(defender.code).type_code === "ally")),
  cannotAttack: (s, character, enemy) =>
    !!s.escapeKhazad &&
    live(enemy, EK.caveTroll) &&
    card(character.code).type_code === "ally",
  // The Great Bridge: no more than 1 attacker against each enemy.
  attackProblem: (s, _enemy, ids) =>
    s.escapeKhazad && staged(s, EK.greatBridge) && ids.length > 1
      ? "While The Great Bridge is in the staging area, no more than 1 character can be declared as an attacker against each enemy."
      : null,
  cannotPlayerReady: (s) =>
    !!s.escapeKhazad && s.escapeKhazad.fatigue === s.round,
  cannotReady: (s, u) =>
    !!s.escapeKhazad &&
    s.escapeKhazad.noReady.some((x) => x.id === u.id && x.round === s.round),
  // New Devilry: blank text boxes, except for Traits.
  characterBlanked: (s, u) =>
    !!s.escapeKhazad &&
    isCharacter(u) &&
    s.escapeKhazad.blank.some((x) => x.id === u.id && activeKey(s, x.key)),
  cannotCancel: (s, shadow, code) => {
    const q = s.escapeKhazad;
    if (!q) return false;
    // Chieftain of the Pit: shadow effects cannot be canceled.
    if (shadow) return enemiesInPlay(s).some((u) => live(u, EK.chieftain));
    return !!code && q.noCancel === code;
  },
  // Undisturbed Bones: an event's cancel is canceled and Bones is discarded.
  revealCancelCountered: (s) => !!s.escapeKhazad && discardBones(s),
  threatReduction: (s, amount, reason) => {
    const q = s.escapeKhazad;
    if (!q) return amount;
    // The Rear Guard: no threat reduction by player card effects.
    if (at(s, EK.rearGuard) && reason === "player-card") {
      log(
        s,
        "The Rear Guard: each player's threat cannot be reduced by player card effects.",
      );
      return 0;
    }
    // Silent Caverns: no more than 1 threat reduced for each player each round.
    if (!staged(s, EK.caverns)) return amount;
    const p = activeSeat(s);
    const row = q.reduced.find((x) => x.player === p && x.round === s.round);
    const allowed = Math.max(0, Math.min(amount, 1 - (row?.amount ?? 0)));
    const actual = Math.min(allowed, s.threat);
    if (actual) {
      if (row) row.amount += actual;
      else q.reduced.push({ player: p, round: s.round, amount: actual });
    }
    if (allowed < amount)
      log(
        s,
        "Silent Caverns: each player's threat cannot be reduced by more than 1 each round.",
      );
    return allowed;
  },
  // A Way Up and Bottomless Chasm: the players must travel, if able.
  mustTravel: (s) => {
    if (
      !s.escapeKhazad ||
      s.activeLocation ||
      (s.extraActiveLocations ?? []).length
    )
      return false;
    if (travelable(s, (u) => live(u, EK.chasm)).length) return true;
    return at(s, EK.wayUp) && travelable(s).length > 0;
  },
  travelProblem: (s, u) => {
    if (!s.escapeKhazad || live(u, EK.chasm)) return null;
    return travelable(s, (x) => live(x, EK.chasm)).length
      ? "When faced with the option to travel, the players must travel to Bottomless Chasm."
      : null;
  },
  travelEffects: (s, u) => {
    if (!s.escapeKhazad || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === EK.pit)
      return [
        fx("ekTopSearch", {
          value: players(s) >= 2 ? 2 : 1,
          code: EK.pit,
          player: first,
        }),
      ];
    if (u.code === EK.roots)
      return playerOrder(s).map((owner) =>
        fx("ekMill", { count: stageNumber(s) + 1, player: owner }),
      );
    if (u.code === EK.hall) return [fx("ekWesternHall", { player: first })];
    if (u.code === EK.grotto) return [fx("ekGrotto", { player: first })];
    if (u.code === EK.caverns)
      return [
        fx("ekEachThreat", { value: 2, text: "Silent Caverns", player: first }),
      ];
    if (u.code === EK.gap) return [fx("ekGap", { player: first })];
    if (u.code === EK.forked)
      return [
        fx("ekEachThreat", { value: 1, text: "Forked Passage", player: first }),
      ];
    return undefined;
  },
  // 1B: Dark Pit, explored, is flipped over instead of being discarded.
  locationDestination: (s, u) => {
    if (!s.escapeKhazad || u.code !== EK.pit || !at(s, EK.depths)) return false;
    prepend(s, fx("ekPitFlip", { code: EK.pit, player: firstPlayer(s) }));
    return true;
  },
  explored: (s, u, wasActive) => {
    if (!s.escapeKhazad || u.blanked) return;
    const first = firstPlayer(s);
    // Goblin Dungeon: its guarded ally returns to its owner's control.
    if (u.code === EK.dungeon) freeDungeon(s, u.id);
    if (u.code === EK.nest)
      prepend(
        s,
        fx("ekTraitSearch", { text: "Nest of Vermin", player: first }),
      );
    if (u.code === EK.den)
      prepend(
        s,
        fx("ekTraitSearch", {
          text: "Frightful Den",
          flag: true,
          player: first,
        }),
      );
    if (u.code === EK.greatBridge)
      prepend(s, ...playerOrder(s).map(() => fx("reveal", { player: first })));
    if (u.code === EK.mithril && wasActive)
      prepend(s, fx("ekMithril", { player: first }));
  },
  // Undisturbed Bones and the A side's search: nothing to cancel here.
  progress: (s, amount, quest) => {
    const q = s.escapeKhazad;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    // Old One Lair: no progress while the enemy with a resource is in play.
    if (
      at(s, EK.lair) &&
      q.lair &&
      enemiesInPlay(s).some((u) => u.id === q.lair)
    )
      return 0;
    // The Bridge of Khazad-dûm: no more than 5 progress each round.
    if (at(s, EK.bridge)) {
      const placed =
        q.bridgePlaced?.round === s.round ? q.bridgePlaced.placed : 0;
      return Math.min(amount, Math.max(0, 5 - placed));
    }
    return amount;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.escapeKhazad;
    if (!q || quest.id !== mainQuestUnit(s)?.id || !at(s, EK.bridge)) return;
    q.bridgePlaced = {
      round: s.round,
      placed:
        (q.bridgePlaced?.round === s.round ? q.bridgePlaced.placed : 0) +
        amount,
    };
  },
  // Dreadful Gap: no progress on other locations in the staging area.
  locationProgressBlocked: (s, u) =>
    !!s.escapeKhazad &&
    s.staging.some((x) => x.id === u.id) &&
    s.staging.some((x) => x.id !== u.id && live(x, EK.gap)),
  // Forked Passage: 1 more threat in the refresh phase for each copy.
  refreshThreatBonus: (s) => (s.escapeKhazad ? staged(s, EK.forked) : 0),
  // Orc Horn Blower: each engaged enemy is dealt an additional shadow card.
  combatBegin: (s) => {
    if (!s.escapeKhazad) return;
    const horns = enemiesInPlay(s).filter((u) => live(u, EK.horn)).length;
    if (!horns) return;
    const engaged = globalEngaged(s);
    for (const u of engaged) dealEnemyShadows(s, u, horns);
    if (engaged.length)
      log(
        s,
        `Orc Horn Blower: each engaged enemy is dealt ${horns === 1 ? "an additional shadow card" : `${horns} additional shadow cards`}.`,
        "danger",
      );
  },
  // Watchful Eyes: an exhausted hero at the end of the combat phase.
  combatEnd: (s) => {
    if (!s.escapeKhazad) return;
    const effects: Effect[] = [];
    for (const owner of playerOrder(s))
      for (const h of seatView(s, owner).heroes)
        for (const a of h.attachments)
          if (a.code === EK.eyes && h.exhausted)
            effects.push(
              fx("ekEyesReveal", { text: name(h), player: firstPlayer(s) }),
            );
    if (effects.length) prepend(s, ...effects);
  },
  // Elder Nameless Thing: after the commit, it attacks the first player.
  committed: (s) => {
    if (!s.escapeKhazad) return;
    const first = firstPlayer(s);
    const elders = s.staging.filter((u) => live(u, EK.elder));
    if (elders.length) {
      log(s, `Elder Nameless Thing attacks ${who(s, first)}.`, "danger");
      prepend(
        s,
        ...elders.map((u) =>
          fx("immediateAttack", { target: u.id, player: first }),
        ),
      );
    }
  },
  // The Bridge of Khazad-dûm: at the beginning of the quest phase.
  questBegin: (s) =>
    s.escapeKhazad && at(s, EK.bridge) && bane(s)
      ? [fx("ekBridgeAttack", { player: firstPlayer(s) })]
      : [],
  engaged: (s, u) => {
    const q = s.escapeKhazad;
    if (!q) return;
    // Hobgoblin: it cannot take damage until the end of the round.
    if (live(u, EK.hobgoblin)) {
      q.noDamage.push({ id: u.id, key: roundKey(s) });
      log(
        s,
        "Hobgoblin engaged: it cannot take damage until the end of the round.",
        "danger",
      );
    }
    // Orc Raiders: it is dealt a shadow card.
    if (live(u, EK.raiders)) {
      const dealt = dealEnemyShadows(s, u, 1);
      if (dealt.length)
        log(s, "Orc Raiders engaged: it is dealt a shadow card.", "danger");
    }
  },
  enemyEntered: (s, u) => {
    const q = s.escapeKhazad;
    if (!q) return;
    const first = firstPlayer(s);
    // Nameless Thing: the top card of the first player's deck, once per copy in play.
    if (live(u, EK.nameless) && !q.nameless.some((x) => x.enemyId === u.id))
      prepend(s, fx("ekNameless", { target: u.id, player: first }));
    // Last Lord of Moria: Durin's Bane engages the first player again.
    if (u.code === EK.bane && at(s, EK.lastLord))
      prepend(s, fx("ekLastLord", { player: first }));
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (!s.escapeKhazad || enemy.blanked) return;
    if (enemy.code === EK.caveSpider)
      prepend(s, fx("ekSpiderChoice", { text: "Cave Spider", player }));
    if (enemy.code === EK.unspeakable)
      prepend(s, fx("ekUnspeakable", { player }));
    if (enemy.code === EK.dweller) prepend(s, fx("ekDweller", { player }));
    // Chieftain of the Pit: an additional shadow card for each attack.
    if (enemy.code === EK.chieftain) {
      const dealt = dealEnemyShadows(s, enemy, 1);
      if (dealt.length)
        log(
          s,
          "Chieftain of the Pit attacks: it is dealt an additional shadow card.",
          "danger",
        );
    }
  },
  // Last Lord of Moria: Durin's Bane follows the first player.
  firstPlayerChanged: (s) => {
    if (s.escapeKhazad && at(s, EK.lastLord) && bane(s))
      prepend(s, fx("ekLastLord", { player: firstPlayer(s) }));
  },
  playerEliminating: (s, p) => {
    const q = s.escapeKhazad;
    if (!q) return;
    // An eliminated player's guarded allies and attached cards leave the game.
    q.dungeon = q.dungeon.filter((g) => g.player !== p);
    q.nameless = q.nameless.filter((g) => g.player !== p);
  },
  roundEnd: (s) => {
    const q = s.escapeKhazad;
    if (!q) return [];
    q.noReady = q.noReady.filter((x) => x.round > s.round);
    q.reduced = q.reduced.filter((x) => x.round > s.round);
    q.blank = [];
    q.penalties = [];
    q.enemyDefense = [];
    q.noDamage = [];
    return [];
  },
  sharedEffect: (e) =>
    [
      ...fellowshipEventSharedKinds("ek"),
      "ekTreacheryDone",
      "ekPitFlip",
      "ekGate",
      "ekEachThreat",
      "ekBridgeDamage",
    ].includes(e.kind),
};
