import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  removeShadowCard,
  requireRule,
  shuffle,
  stats,
} from "./core";
import {
  addVictoryCard,
  depositInFlightEncounterCards,
  destroy,
  discardAttachment,
  discardCharacter,
  discardHandCard,
  discardPlayerDeck,
  enemyAddedToStaging,
  engage,
  exhaustCharacter,
  placeEncounter,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  allCharacters,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  removeActiveLocation,
  seatName,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { surgeEffects } from "./surge";
import { choosePlayerResponse } from "./player-ability-triggers";
import {
  LAKE as L,
  LAKE_QUESTS,
  LAKE_RECIPES,
  LAKE_TOWN_LIMIT,
  LAKE_TOWN_TARGET,
  isSmaug,
  lakeBurnTotal,
  lakeLocations,
  lakePlayers,
  lakeSmaug,
  lakeSmaugCap,
  lakeStageInfo,
  lakeTownDamage,
  lakeTownUnit,
  lakeTrait,
} from "./lake-town-support";
export * from "./lake-town-support";

type Combat = NonNullable<GameState["combat"]>;
const typeOf = (code: string) => card(code).type_code;
const isCharacter = (u: Unit) => ["hero", "ally"].includes(typeOf(u.code));
const exhaustable = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const inPlay = (s: GameState, code: string) =>
  lakeLocations(s).some((l) => l.code === code && !l.blanked);
const reckless = (s: GameState) =>
  s.lakeTown && s.lakeTown.reckless.round === s.round
    ? s.lakeTown.reckless.count
    : 0;
const defendersOf = (c: Combat) =>
  c.defenderIds?.length ? c.defenderIds : c.defenderId ? [c.defenderId] : [];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const skip: Option = { id: "skip", label: "Skip the response", effects: [] };
const TREACHERIES = [
  L.catching,
  L.close,
  L.dire,
  L.reckless,
  L.blast,
  L.baiting,
];
/** Shadow cards resolve one at a time; the resolving copy is the last revealed. */
function takeShadow(enemy: Unit, code: string) {
  const i = Math.max(0, (enemy.revealedShadowCount ?? 1) - 1);
  const index = enemy.shadows[i] === code ? i : enemy.shadows.indexOf(code);
  if (index < 0) return false;
  removeShadowCard(enemy, index);
  return true;
}
function nextPlayer(s: GameState, p: number) {
  const order = playerOrder(s);
  if (order.length < 2) return undefined;
  return order[(order.indexOf(p) + 1) % order.length];
}
const readyHeroes = (s: GameState) =>
  playerOrder(s).flatMap((p) =>
    seatView(s, p).heroes.filter((h) => exhaustable(h)),
  );

// ---------------------------------------------------------------------------
// Lake-town's damage.

function townCheck(s: GameState) {
  if (s.status !== "playing" || lakeTownDamage(s) < LAKE_TOWN_LIMIT) return;
  s.status = "lost";
  s.reason = "Lake-town has completely burned. The players have lost the game.";
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, s.reason, "danger");
}
function damageTown(s: GameState, amount: number, source: string) {
  const town = lakeTownUnit(s);
  if (!town || amount <= 0) return;
  town.damage += amount;
  log(
    s,
    `${source}: Lake-town takes ${amount} damage (${town.damage}/${LAKE_TOWN_LIMIT}).`,
    "danger",
  );
  townCheck(s);
}
function healTown(s: GameState, amount: number, source: string) {
  const town = lakeTownUnit(s);
  if (!town || amount <= 0) return;
  const removed = Math.min(amount, town.damage);
  town.damage -= removed;
  log(s, `${source}: ${removed} damage removed from Lake-town.`, "good");
}
/** Move damage from Smaug to Lake-town (The Master's Manor, Smaug the Magnificent). */
function smaugToTown(s: GameState, amount: number, source: string) {
  const smaug = lakeSmaug(s);
  if (!smaug) return;
  const moved = Math.min(amount, smaug.damage);
  if (moved <= 0) return;
  smaug.damage -= moved;
  damageTown(s, moved, source);
}

// ---------------------------------------------------------------------------
// Setup, the Smaug deck and the quest stages.

export function setupLakeTown(s: GameState) {
  const r = LAKE_RECIPES.find((r) => r.mode === "standard")!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  for (const code of section("sharedSetAside")) s.staging.push(make(s, code));
  s.lakeTown = {
    currentQuest: L.terror,
    advancing: false,
    smaugDeck: shuffle(s, section("sharedEncounterDeck2")),
    smaugDiscard: [],
    smaugRound: 0,
    resolving: [],
    reckless: { round: 0, count: 0 },
    thrush: null,
  };
  log(
    s,
    "Terror from the Mountain: the copies of Smaug form a separate Smaug deck and Lake-town is added to the staging area. One encounter card per player is revealed.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.lakeTown;
  if (!q) return false;
  const goal = lakeStageInfo(s)?.quest ?? 0;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length ||
    goal <= 0 ||
    s.progress < goal
  )
    return true;
  q.advancing = true;
  prepend(s, fx("lakeDefeatQuest", { player: firstPlayer(s) }));
  return true;
}
function setStage(s: GameState, stage: number) {
  const q = s.lakeTown!;
  s.stage = stage;
  q.currentQuest = LAKE_QUESTS[stage - 1].code;
  s.progress = 0;
  trimSmaug(s);
}
/** Stage 1B and 2B's limits remove damage above them at once. */
function trimSmaug(s: GameState) {
  const smaug = lakeSmaug(s),
    cap = lakeSmaugCap(s);
  if (smaug && smaug.damage > cap) {
    log(
      s,
      `${name(smaug)} cannot have more than ${cap} damage: ${smaug.damage - cap} damage removed.`,
    );
    smaug.damage = cap;
  }
}
/** Reveal the next Smaug; the previous one is discarded and its damage moves on. */
function revealSmaug(s: GameState, engaged: boolean) {
  const q = s.lakeTown!;
  const first = firstPlayer(s);
  if (!q.smaugDeck.length && q.smaugDiscard.length) {
    q.smaugDeck = shuffle(s, q.smaugDiscard.splice(0));
    log(s, "The Smaug discard pile is shuffled into a new Smaug deck.");
  }
  const code = q.smaugDeck.shift();
  q.smaugRound = s.round;
  if (!code) return;
  const old = lakeSmaug(s);
  const carried = old?.damage ?? 0;
  if (old) {
    old.damage = 0;
    destroy(s, old, false, "discard", false);
  }
  const fresh = make(s, code);
  fresh.damage = Math.min(carried, lakeSmaugCap(s));
  const carriedText = fresh.damage ? ` with ${fresh.damage} damage` : "";
  log(
    s,
    engaged
      ? `${card(code).name} is revealed${carriedText}.`
      : `${card(code).name} enters the staging area${carriedText}.`,
    "danger",
  );
  s.staging.push(fresh);
  if (engaged) forOwner(s, first, () => engage(s, fresh));
  else enemyAddedToStaging(s, fresh);
  prepend(s, fx("lakeSmaugRevealed", { target: fresh.id, player: first }));
}

// ---------------------------------------------------------------------------
// Encounter cards.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.lakeTown;
  if (!q) return false;
  const first = firstPlayer(s);
  if (code === L.bridge || code === L.house || code === L.manor) {
    if (fromReveal)
      prepend(
        s,
        code === L.bridge
          ? fx("lakeBridge", { player: first })
          : code === L.house
            ? fx("lakeBurn", { code: L.house, player: first })
            : fx("lakeManor", { player: first }),
      );
    return true;
  }
  if (!TREACHERIES.includes(code)) return false;
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
  prepend(
    s,
    fx("lakeTreachery", { code, source: u.id, player: first }),
    fx("lakeTreacheryDone", { source: u.id, player: first }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.lakeTown) return false;
  const p = c.attackPlayer ?? activeSeat(s),
    enemy = get(s, c.enemyId);
  switch (code) {
    case L.catching:
      c.defensePenalty = (c.defensePenalty ?? 0) + 2;
      return true;
    case L.close:
    case L.blast:
      prepend(s, fx("lakeHeroCancel", { code, player: p }));
      return true;
    case L.dire:
      c.lakeLeap = true;
      return true;
    case L.wharf:
      c.attackBonus += 2;
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      return true;
    case L.dock:
      if (enemy && takeShadow(enemy, code)) {
        placeEncounter(s, code);
        log(s, "Fisherman's Dock is added to the staging area.", "danger");
      }
      return true;
    case L.merchant:
      damageTown(
        s,
        defendersOf(c).some((id) => get(s, id)) ? 1 : 4,
        "Merchant's District",
      );
      return true;
    case L.reckless:
      c.lakeReckless = true;
      return true;
    case L.manor:
      c.lakeManor = true;
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Burn: each player may exhaust characters to take it; the rest burns Lake-town.

/** The characters a player may exhaust to take burn damage. */
function burnCharacters(s: GameState, player: number) {
  return [...seatView(s, player).heroes, ...seatView(s, player).allies].filter(
    (u) => exhaustable(u) && stats(s, u).health - u.damage > 0,
  );
}

// ---------------------------------------------------------------------------
// Effects.

export function lakeTownEffect(s: GameState, e: Effect): boolean {
  const q = s.lakeTown;
  if (!q) return false;
  const c = s.combat;
  // Town-Baiting's attack against Lake-town: undefended damage burns the town.
  if (
    e.kind === "enemyDamage" &&
    c?.undefendedTargetId === LAKE_TOWN_TARGET &&
    !defendersOf(c).some((id) => !!get(s, id))
  ) {
    const enemy = get(s, c.enemyId);
    c.attackResolved = true;
    if (enemy)
      damageTown(
        s,
        Math.max(0, stats(s, enemy).attack + c.attackBonus),
        `${name(enemy)}'s undefended attack`,
      );
    return true;
  }
  if (!e.kind.startsWith("lake")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "lakeSetup":
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("reveal", { player })),
        fx("lakeStageOne", { player: first }),
      );
      return true;
    case "lakeStageOne":
      damageTown(s, lakePlayers(s), "Terror from the Mountain");
      return true;
    case "lakeDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("lakeNextStage", { player: first }));
      return true;
    }
    case "lakeNextStage":
      q.advancing = false;
      if (s.stage >= LAKE_QUESTS.length) return true;
      setStage(s, s.stage + 1);
      log(s, `${card(q.currentQuest).name} begins.`, "chapter");
      return true;
    case "lakeReset":
      if (s.stage !== 3) return true;
      setStage(s, 2);
      log(
        s,
        "The Dragon's Wrath: the quest deck is reset to stage 2B, Fire and Water.",
        "chapter",
      );
      return true;
    case "lakeSmaugChoice":
      if (q.smaugRound === s.round) return true;
      choose(
        s,
        "Smaug · Where does the dragon strike?",
        [
          {
            id: "staging",
            label: "Place the next Smaug in the staging area",
            effects: [fx("lakeSmaugReveal", { flag: false, player: first })],
          },
          {
            id: "engaged",
            label: `The next Smaug enters play engaged with ${s.table ? seatName(s, first) : "you"}`,
            effects: [fx("lakeSmaugReveal", { flag: true, player: first })],
          },
        ],
        "Before the top card of the Smaug deck is revealed, the first player chooses its destination. The previous Smaug is discarded and its damage moves to the new one.",
      );
      return true;
    case "lakeSmaugReveal":
      if (q.smaugRound !== s.round) revealSmaug(s, !!e.flag);
      return true;
    case "lakeSmaugRevealed":
      if (!u || !isSmaug(u)) return true;
      if (u.code === L.magnificent) smaugToTown(s, 3, "Smaug the Magnificent");
      else if (u.code === L.mighty)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("immediateAttack", { target: u.id, player }),
          ),
        );
      else prepend(s, fx("lakeBurn", { player: first }));
      return true;
    case "lakeBurn": {
      const total = e.value ?? lakeBurnTotal(s, e.code);
      if (total <= 0) {
        log(s, "There is no burn on the locations in play.");
        return true;
      }
      log(
        s,
        `Burn: the locations in play deal ${total} burn damage.`,
        "danger",
      );
      prepend(
        s,
        fx("lakeBurnAssign", {
          value: total,
          ids: playerOrder(s).map(String),
          player: playerOrder(s)[0],
        }),
      );
      return true;
    }
    case "lakeBurnAssign": {
      const remaining = e.value ?? 0;
      const ids = e.ids ?? [];
      if (remaining <= 0) return true;
      if (!ids.length) {
        damageTown(s, remaining, "Burn");
        return true;
      }
      const player = Number(ids[0]);
      const options = burnCharacters(s, player).map((u) => ({
        id: u.id,
        code: u.code,
        label: `Exhaust ${name(u)} to take burn damage (up to ${Math.min(remaining, stats(s, u).health - u.damage)})`,
        effects: [
          fx("lakeBurnAmount", {
            target: u.id,
            value: remaining,
            ids,
            player,
          }),
        ],
      }));
      const rest = ids.slice(1);
      const pass = fx("lakeBurnAssign", {
        value: remaining,
        ids: rest,
        player: rest.length ? Number(rest[0]) : first,
      });
      if (!options.length) {
        prepend(s, pass);
        return true;
      }
      forOwner(s, player, () =>
        choose(
          s,
          `Burn · ${remaining} damage to assign${s.table ? ` · ${seatName(s, player)}` : ""}`,
          [
            ...options,
            {
              id: "town",
              label: rest.length
                ? "Assign no more burn damage (the next player may)"
                : `Assign the remaining ${remaining} damage to Lake-town`,
              effects: [pass],
            },
          ],
          "Exhaust any number of your characters to assign burn damage to them, up to their remaining hit points. Damage not assigned to characters burns Lake-town.",
        ),
      );
      return true;
    }
    case "lakeBurnAmount": {
      const remaining = e.value ?? 0;
      const ids = e.ids ?? [];
      const again = fx("lakeBurnAssign", { value: remaining, ids, player: p });
      if (!u || !burnCharacters(s, p).some((c) => c.id === u.id)) {
        prepend(s, again);
        return true;
      }
      const left = stats(s, u).health - u.damage;
      forOwner(s, p, () =>
        choose(
          s,
          `Burn · ${name(u)} takes how much burn damage?`,
          [
            ...Array.from(
              { length: Math.min(remaining, left) },
              (_, i) => i + 1,
            ).map((n) => ({
              id: `take-${n}`,
              label: `Exhaust ${name(u)} to take ${n} burn damage${n >= left ? " (destroyed)" : ""}`,
              effects: [
                fx("lakeBurnTake", {
                  target: u.id,
                  value: n,
                  count: remaining,
                  ids,
                  player: p,
                }),
              ],
            })),
            {
              id: "back",
              label: "Choose another character",
              effects: [again],
            },
          ],
          `${remaining} burn damage remains. ${name(u)} has ${left} hit points left; damage equal to that destroys them.`,
        ),
      );
      return true;
    }
    case "lakeBurnTake": {
      const n = e.value ?? 0,
        remaining = e.count ?? 0;
      const ids = e.ids ?? [];
      if (u && exhaustable(u) && exhaustCharacter(s, u)) {
        prepend(
          s,
          fx("damage", { target: u.id, value: n, player: ownerOf(s, u) }),
          fx("lakeBurnAssign", {
            value: remaining - n,
            ids,
            player: Number(ids[0] ?? first),
          }),
        );
        log(s, `${name(u)} exhausts to take ${n} burn damage.`);
      } else
        prepend(
          s,
          fx("lakeBurnAssign", {
            value: remaining,
            ids,
            player: Number(ids[0] ?? first),
          }),
        );
      return true;
    }
    case "lakeTownDamage":
      damageTown(s, e.value ?? 0, e.text ?? "Lake-town");
      return true;
    case "lakeTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (!held) return true;
      treachery(s, held.code);
      return true;
    }
    case "lakeTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "lakeCatching": {
      const pier = (s.victoryCards ?? []).find((code) => code === e.code);
      if (!pier || !lakeTrait(pier, "Pier")) return true;
      s.victoryCards!.splice(s.victoryCards!.indexOf(pier), 1);
      s.victory -= card(pier).victory ?? 0;
      s.encounterDeck.push(pier);
      shuffle(s, s.encounterDeck);
      log(
        s,
        `Catching Fire: ${card(pier).name} leaves the victory display and is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    case "lakeCloseToFlame":
      prepend(
        s,
        ...allCharacters(s).map((c) =>
          fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
        ),
      );
      return true;
    case "lakeDire": {
      const allies = seatView(s, p).allies;
      if (!allies.length) {
        damageTown(
          s,
          2,
          s.table
            ? `Dire Magnificence (${seatName(s, p)} has no ally)`
            : "Dire Magnificence (you have no ally)",
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          "Dire Magnificence · Discard an ally you control",
          allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [fx("lakeDiscardAlly", { target: a.id, player: p })],
          })),
        ),
      );
      return true;
    }
    case "lakeDiscardAlly":
      if (u && seatView(s, p).allies.some((a) => a.id === u.id))
        discardCharacter(s, u);
      return true;
    case "lakeBridge": {
      const x = lakeTownDamage(s);
      let discarded = 0;
      if (x > 0)
        for (const player of playerOrder(s))
          discarded += discardPlayerDeck(s, x, player).length;
      log(
        s,
        `Great Bridge: each player discards ${plural(x, "card")} from the top of their deck.`,
        "danger",
      );
      if (!discarded) prepend(s, ...surgeEffects(L.bridge));
      return true;
    }
    case "lakeManor":
      smaugToTown(s, Infinity, "The Master's Manor");
      return true;
    case "lakeHeroCancel": {
      const heroes = playerOrder(s).flatMap((player) =>
        seatView(s, player).heroes.map((h) => ({ h, player })),
      );
      choose(
        s,
        `${card(e.code!).name} · Shadow effect`,
        [
          ...heroes.map(({ h, player }) => ({
            id: `discard-${h.id}`,
            code: h.code,
            label: `Discard ${name(h)}${s.table ? ` (${seatName(s, player)})` : ""} to cancel this effect`,
            effects: [
              fx("lakeHeroDiscard", { target: h.id, code: e.code, player }),
            ],
          })),
          {
            id: "resolve",
            label: "Resolve the shadow effect",
            code: e.code,
            effects: [fx("lakeShadowResolve", { code: e.code, player: p })],
          },
        ],
        e.code === L.close
          ? "Deal 1 damage to each character in play, unless any player discards a hero."
          : "Resolve all burn damage from the locations in play, unless any player discards a hero.",
      );
      return true;
    }
    case "lakeHeroDiscard":
      if (u && seatView(s, ownerOf(s, u)).heroes.some((h) => h.id === u.id)) {
        log(
          s,
          `${name(u)} is discarded to cancel ${card(e.code!).name}'s shadow effect.`,
          "danger",
        );
        discardCharacter(s, u);
      }
      return true;
    case "lakeShadowResolve":
      prepend(
        s,
        e.code === L.close
          ? fx("lakeCloseToFlame", { player: p })
          : fx("lakeBurn", { player: first }),
      );
      return true;
    case "lakeDiscardHand":
      forOwner(s, p, () => {
        for (const h of [...s.hand])
          discardHandCard(s, h.id, { encounterEffect: true });
      });
      log(
        s,
        s.table
          ? `${seatName(s, p)} discards their hand.`
          : "You discard your hand.",
        "danger",
      );
      return true;
    case "lakeLeap": {
      if (!u || !isSmaug(u)) return true;
      forOwner(s, p, () => engage(s, u));
      log(
        s,
        `${name(u)} engages ${seatName(s, p)} and attacks again.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
      return true;
    }
    case "lakeDockPay":
      choose(
        s,
        "Fisherman's Dock · Exhaust a hero to travel here",
        readyHeroes(s).map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
          effects: [fx("exhaust", { target: h.id, player: ownerOf(s, h) })],
        })),
        "There are now 2 active locations.",
      );
      return true;
    case "lakeMerchant": {
      if (
        !u ||
        u.code !== L.merchant ||
        !lakeLocations(s).some((l) => l.id === u.id)
      )
        return true;
      damageTown(s, 2 * lakePlayers(s), "Merchant's District");
      if (s.status !== "playing") return true;
      const wasActive = allActiveLocations(s).some((l) => l.id === u.id);
      if (wasActive) removeActiveLocation(s, u.id);
      else s.staging = s.staging.filter((l) => l.id !== u.id);
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      addVictoryCard(s, u.code);
      log(s, "Merchant's District is added to the victory display.", "good");
      return true;
    }
    case "lakeThrushOffer": {
      const thrush = u?.attachments.find(
        (a) => a.id === e.source && a.code === L.thrush && !a.blanked,
      );
      if (!u || !thrush || !seatView(s, p).hand.length) return true;
      choosePlayerResponse(
        s,
        thrush.id,
        L.thrush,
        "The Old Thrush · Lower Smaug's defense?",
        [
          {
            id: "use",
            code: L.thrush,
            label: "Discard cards from your hand to reduce Smaug's defense",
            effects: [{ ...e, kind: "lakeThrushDiscard" }],
          },
          skip,
        ],
        "Response: after the attached hero exhausts to attack Smaug, discard X cards from hand to reduce Smaug's defense by X for this attack.",
      );
      return true;
    }
    case "lakeThrushDiscard": {
      const smaug = get(s, e.text);
      const hand = seatView(s, p).hand;
      if (!smaug || !isSmaug(smaug) || !hand.length) return true;
      const value = q.thrush?.enemyId === smaug.id ? q.thrush.value : 0;
      forOwner(s, p, () =>
        choose(s, `The Old Thrush · Smaug's defense −${value}`, [
          ...hand.map((h) => ({
            id: h.id,
            code: h.code,
            label: `Discard ${name(h)}`,
            effects: [{ ...e, kind: "lakeThrushCard", ids: [h.id] }],
          })),
          {
            id: "done",
            label: value ? "Stop discarding" : "Discard no card",
            effects: [],
          },
        ]),
      );
      return true;
    }
    case "lakeThrushCard": {
      const smaug = get(s, e.text);
      if (!smaug || !isSmaug(smaug)) return true;
      const handId = e.ids?.[0];
      if (!handId || !seatView(s, p).hand.some((h) => h.id === handId))
        return true;
      forOwner(s, p, () =>
        discardHandCard(s, handId, { encounterEffect: true }),
      );
      q.thrush = {
        enemyId: smaug.id,
        value: (q.thrush?.enemyId === smaug.id ? q.thrush.value : 0) + 1,
      };
      prepend(s, { ...e, kind: "lakeThrushDiscard", ids: undefined });
      return true;
    }
    case "lakeConvertOffer": {
      const pending = s.queue.find((x) => x.kind === "successfulQuestProgress");
      if (!pending) return true;
      const capacity = allActiveLocations(s).reduce(
        (n, l) => n + Math.max(0, locationQuest(s, l) - l.progress),
        0,
      );
      const max = Math.min(
        Math.max(0, (pending.value ?? 0) - capacity),
        lakeTownDamage(s),
      );
      if (max <= 0) return true;
      choose(
        s,
        "Fire and Water · Douse the flames?",
        [
          ...Array.from({ length: max }, (_, i) => max - i).map((n) => ({
            id: `convert-${n}`,
            label: `Discard ${plural(n, "progress token")} to remove ${n} damage from Lake-town`,
            effects: [fx("lakeConvert", { value: n, player: first })],
          })),
          {
            id: "keep",
            label: "Place every progress token on the quest",
            effects: [],
          },
        ],
        "Progress that would be placed on Fire and Water may instead be discarded to remove the same amount of damage from Lake-town.",
      );
      return true;
    }
    case "lakeConvert": {
      const pending = s.queue.find((x) => x.kind === "successfulQuestProgress");
      const n = Math.min(e.value ?? 0, pending?.value ?? 0, lakeTownDamage(s));
      if (!pending || n <= 0) return true;
      pending.value = (pending.value ?? 0) - n;
      healTown(s, n, "Fire and Water");
      return true;
    }
    default:
      return true;
  }
}
function treachery(s: GameState, code: string) {
  const first = firstPlayer(s);
  const smaug = lakeSmaug(s);
  switch (code) {
    case L.catching: {
      const piers = [
        ...new Set((s.victoryCards ?? []).filter((c) => lakeTrait(c, "Pier"))),
      ];
      if (!piers.length) {
        log(s, "Catching Fire: no Pier location is in the victory display.");
        prepend(s, ...surgeEffects(L.catching));
        return;
      }
      choose(
        s,
        "Catching Fire · Shuffle a Pier back into the encounter deck",
        piers.map((pier) => ({
          id: pier,
          code: pier,
          label: card(pier).name,
          effects: [fx("lakeCatching", { code: pier, player: first })],
        })),
      );
      return;
    }
    case L.close:
      prepend(s, fx("lakeCloseToFlame", { player: first }));
      return;
    case L.dire:
      prepend(s, ...playerOrder(s).map((player) => fx("lakeDire", { player })));
      return;
    case L.reckless:
      if (!smaug) {
        log(s, "Reckless in His Rage: Smaug is not in play.");
        return;
      }
      s.lakeTown!.reckless = { round: s.round, count: reckless(s) + 1 };
      log(
        s,
        `Reckless in His Rage: ${name(smaug)} gets +2 threat, +2 attack and −2 defense, and allies cannot defend against him this round.`,
        "danger",
      );
      return;
    case L.blast:
      prepend(s, fx("lakeBurn", { player: first }));
      return;
    case L.baiting: {
      const last = playerOrder(s).at(-1) ?? first;
      if (!smaug) {
        log(s, "Town-Baiting: Smaug is not in play.");
        return;
      }
      log(
        s,
        `Town-Baiting: ${name(smaug)} attacks Lake-town; ${s.table ? seatName(s, last) : "you"} may declare a defender.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", {
          target: smaug.id,
          player: last,
          damageTarget: LAKE_TOWN_TARGET,
        }),
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Hooks.

const smaugAttack = (u: Unit) => isSmaug(u) && !u.blanked;
function abilityProblem(s: GameState, u: Unit, attachmentId?: string) {
  if (!s.lakeTown) return "No action.";
  if (attachmentId) return "No action.";
  if (u.code === L.merchant) {
    if (s.phase !== "travel") return "Merchant's District has a Travel Action.";
    if (!lakeLocations(s).some((l) => l.id === u.id))
      return "Merchant's District must be in play.";
    if (u.blanked) return "Merchant's District's text box is blank.";
    return null;
  }
  if (u.code === L.wrath) {
    if (s.stage !== 3 || mainQuestUnit(s)?.code !== L.wrath)
      return "The Dragon's Wrath is not the current quest.";
    if (!stageLive(s)) return "Wait for the stage to be revealed.";
    if (s.phase !== "refresh")
      return "The Dragon's Wrath has a Refresh Action.";
    return null;
  }
  return "No action.";
}
export const LAKE_TOWN_HOOKS: Batch4ScenarioHooks = {
  setup: setupLakeTown,
  openingHandsKept: (s) => {
    const q = s.lakeTown;
    if (!q || s.round > 0) return false;
    prepend(s, fx("lakeSetup", { player: firstPlayer(s) }), fx("nextRound"));
    return true;
  },
  advance,
  stageInfo: lakeStageInfo,
  questBegin: (s) =>
    s.lakeTown && s.lakeTown.smaugRound !== s.round && s.status === "playing"
      ? [fx("lakeSmaugChoice", { player: firstPlayer(s) })]
      : [],
  extraStagingReveals: (s) =>
    s.lakeTown && s.stage === 3 && stageLive(s) ? 1 : 0,
  check: (s) => {
    if (!s.lakeTown) return;
    townCheck(s);
    if (s.status === "playing") trimSmaug(s);
  },
  stats: (s, u) => {
    if (!s.lakeTown || !isSmaug(u)) return {};
    const r = reckless(s);
    const thrush =
      s.lakeTown.thrush?.enemyId === u.id ? s.lakeTown.thrush.value : 0;
    return { attack: 2 * r, defense: -2 * r - thrush };
  },
  threatBonus: (s, u) => (s.lakeTown && isSmaug(u) ? 2 * reckless(s) : 0),
  cannotDefend: (s, enemy, defender) =>
    !!s.lakeTown &&
    reckless(s) > 0 &&
    isSmaug(enemy) &&
    !!defender &&
    typeOf(defender.code) === "ally",
  immune: (s, u) =>
    !!s.lakeTown && typeOf(u.code) === "location" && inPlay(s, L.wharf),
  cannotCancel: (s, shadowEffect, code) =>
    !!s.lakeTown && !shadowEffect && (code === L.baiting || inPlay(s, L.east)),
  damageAmount: (s, u, amount) => {
    if (!s.lakeTown || !isSmaug(u)) return amount;
    if (inPlay(s, L.north)) return 0;
    return Math.max(0, Math.min(amount, lakeSmaugCap(s) - u.damage));
  },
  damageDealt: (s, u, _amount, ctx) => {
    const c = s.combat;
    if (!s.lakeTown || !c || !ctx.combatDamage || ctx.enemyId !== c.enemyId)
      return;
    const enemy = get(s, c.enemyId);
    const excessToTown =
      c.undefendedTargetId === LAKE_TOWN_TARGET ||
      (enemy?.code === L.magnificent && !enemy.blanked);
    if (!excessToTown || !isCharacter(u)) return;
    const excess = Math.max(0, u.damage - stats(s, u).health);
    if (excess > 0)
      prepend(
        s,
        fx("lakeTownDamage", {
          value: excess,
          text: "Excess damage",
          player: firstPlayer(s),
        }),
      );
  },
  characterDestroyed: (s, u, ctx) => {
    if (!s.lakeTown) return;
    const c = s.combat;
    if (c && ctx.combatDamage && ctx.enemyId === c.enemyId && isCharacter(u))
      c.lakeKilled = true;
    if (!isSmaug(u) || s.stage !== 3 || !stageLive(s)) return;
    const vp = s.victory,
      burned = lakeTownDamage(s);
    if (vp > burned) {
      win(s);
      s.reason = `Smaug is defeated: ${plural(vp, "victory point")} outweigh the ${burned} damage on Lake-town, and the town is saved.`;
    } else {
      s.status = "lost";
      s.reason = `Smaug is defeated, but Lake-town has ${burned} damage against ${plural(vp, "victory point")}: Lake-town has burned and the players have lost.`;
      depositInFlightEncounterCards(s);
      s.choice = null;
      s.queue = [];
      log(s, s.reason, "danger");
    }
  },
  enemyDestination: (s, u) => {
    if (!s.lakeTown || !isSmaug(u)) return false;
    s.lakeTown.smaugDiscard.push(u.code);
    return true;
  },
  attackersDeclared: (s, enemy, ids) =>
    !s.lakeTown || !smaugAttack(enemy)
      ? []
      : ids.flatMap((id) => {
          const hero = get(s, id);
          const thrush = hero?.attachments.find(
            (a) => a.code === L.thrush && !a.blanked,
          );
          return hero && thrush && hero.exhausted
            ? [
                fx("lakeThrushOffer", {
                  target: hero.id,
                  source: thrush.id,
                  text: enemy.id,
                  player: ownerOf(s, hero),
                }),
              ]
            : [];
        }),
  playerAttackResolved: (s) => {
    if (s.lakeTown) s.lakeTown.thrush = null;
  },
  combatEnd: (s) => {
    if (s.lakeTown) s.lakeTown.thrush = null;
  },
  attackFinished: (s, combat, skipped = false) => {
    if (!s.lakeTown || skipped) return [];
    const p = combat.attackPlayer ?? firstPlayer(s);
    const enemy = get(s, combat.enemyId);
    const effects: Effect[] = [];
    if (combat.lakeKilled) {
      if (combat.lakeReckless)
        effects.push(fx("lakeBurn", { player: firstPlayer(s) }));
      if (combat.lakeManor) effects.push(fx("lakeDiscardHand", { player: p }));
      const next = nextPlayer(s, p);
      if (combat.lakeLeap && enemy && next !== undefined)
        effects.push(fx("lakeLeap", { target: enemy.id, player: next }));
    }
    return effects;
  },
  travelProblem: (s, u) => {
    if (!s.lakeTown) return null;
    if (
      u.code !== L.south &&
      lakeLocations(s).some((l) => l.code === L.south && !l.blanked)
    )
      return "South Pier: the players cannot travel to other locations.";
    if (
      u.code === L.dock &&
      !u.blanked &&
      allActiveLocations(s).length === 1 &&
      !readyHeroes(s).length
    )
      return "Fisherman's Dock: exhaust a hero to travel here as a second active location.";
    return null;
  },
  secondActiveLocation: (s, u) =>
    !!s.lakeTown &&
    u.code === L.dock &&
    !u.blanked &&
    allActiveLocations(s).length === 1,
  travelEffects: (s, u) =>
    s.lakeTown &&
    u.code === L.dock &&
    !u.blanked &&
    allActiveLocations(s).length === 1
      ? [fx("lakeDockPay", { target: u.id, player: firstPlayer(s) })]
      : undefined,
  claimableObjective: (s, u) => !!s.lakeTown && u.code === L.thrush,
  claim: (s, objective, hero) => {
    if (!s.lakeTown || objective.code !== L.thrush) return false;
    requireRule(
      exhaustable(hero) && exhaustCharacter(s, hero),
      "The Old Thrush requires a ready hero to exhaust.",
    );
    s.staging = s.staging.filter((x) => x.id !== objective.id);
    hero.attachments.push({
      id: objective.id,
      code: objective.code,
      exhausted: false,
    });
    log(s, `${name(hero)} exhausts to claim The Old Thrush.`, "good");
    return true;
  },
  abilityLabel: (code) =>
    code === L.merchant
      ? "Merchant's District · Travel Action: deal 2 damage per player to Lake-town to add it to the victory display"
      : code === L.wrath
        ? "The Dragon's Wrath · Refresh Action: reset the quest deck to stage 2B"
        : undefined,
  abilityProblem,
  ability: (s, u, attachmentId) => {
    if (abilityProblem(s, u, attachmentId)) return false;
    prepend(
      s,
      u.code === L.merchant
        ? fx("lakeMerchant", { target: u.id, player: activeSeat(s) })
        : fx("lakeReset", { player: firstPlayer(s) }),
    );
    return true;
  },
  questSucceeded: (s) => {
    if (s.lakeTown && s.stage === 2 && stageLive(s) && lakeTownDamage(s) > 0)
      prepend(s, fx("lakeConvertOffer", { player: firstPlayer(s) }));
  },
  encounter,
  shadow,
  effect: lakeTownEffect,
  sharedEffect: (e) =>
    [
      "lakeSetup",
      "lakeStageOne",
      "lakeDefeatQuest",
      "lakeNextStage",
      "lakeReset",
      "lakeSmaugChoice",
      "lakeSmaugReveal",
      "lakeSmaugRevealed",
      "lakeBurn",
      "lakeTownDamage",
      "lakeTreachery",
      "lakeTreacheryDone",
      "lakeCatching",
      "lakeCloseToFlame",
      "lakeBridge",
      "lakeManor",
      "lakeConvertOffer",
      "lakeConvert",
    ].includes(e.kind),
};
