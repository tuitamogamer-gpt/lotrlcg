import { removeFromQuest } from "./board";
import { encounterCharacterEntered } from "./encounter-character-uniqueness";
import type { Card, Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { encodeDamageContext } from "./damage-context";
import { isHero, unitType } from "./card-types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  opts,
  prepend,
  shuffle,
  skip,
  draw,
} from "./core";
import {
  addVictoryCard,
  damage,
  discardAttachment,
  discardHandCard,
  discardCharacter,
  discardPlayerDeck,
  enemyAddedToStaging,
  questDefeated,
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
  attachmentController,
} from "./table";
import { allQuestUnits, mainQuestUnit } from "./quest-state";
import { resolveDoomed } from "./voice-isengard";
import { surgeEffects } from "./surge";
import {
  DROWNED as D,
  DROWNED_NIGHTMARE as DN,
  DROWNED_NIGHTMARE_GROTTO,
  DROWNED_RECIPES,
  drownedFront,
  drownedNightmare,
  drownedUnderwater,
} from "./drowned-support";
import { nightmareEncounterDecks } from "./nightmare";
import { isDreamchaserGame } from "./dreamchaser-campaign-support";
import { dreamchaserDrownedReady } from "./dreamchaser-campaign";
export { drownedUnderwater, drownedState } from "./drowned-support";

const live = (s: GameState) =>
  s.scenarioId === "the-drowned-ruins" && !!s.drowned;
const trait = (u: Unit, t: string) =>
  (card(u.code).traits ?? "").split(".").some((v) => v.trim() === t);
const activeNamed = (s: GameState, title: string) =>
  live(s) &&
  allActiveLocations(s).some((u) => card(u.code).name === title && !u.blanked);
const questLive = (s: GameState) => !mainQuestUnit(s)?.blanked;
export const drownedIsDoubleSided = (s: GameState, u: Unit) =>
  !!s.drowned?.originalCodes[u.id];
export const drownedCannotEnterStaging = (s: GameState, u: Unit) =>
  live(s) && [D.shrine, D.shrine + ":B"].includes(u.code) && !u.blanked;
export const drownedCannotAttach = (s: GameState, u: Unit) =>
  live(s) && [D.shrine, D.shrine + ":B"].includes(u.code) && !u.blanked;
export const drownedCannotAttack = (s: GameState) =>
  activeNamed(s, "Dark Abyss");
export const drownedCannotReady = (s: GameState) =>
  activeNamed(s, "Twisting Hollow");
export const drownedAttachmentsBlanked = (s: GameState) =>
  activeNamed(s, "Sunken Temple");
/** Cave Eel, and the Nightmare Deck's Great Shark: "cannot be engaged … unless the active location is Underwater". */
const waterEnemy = (s: GameState, u: Unit) =>
  (u.code === D.eel || u.code === DN.shark) &&
  !u.blanked &&
  !drownedUnderwater(s);
export const drownedCannotEngage = (s: GameState, u: Unit) =>
  live(s) &&
  ((activeNamed(s, "Drowned Cave") && trait(u, "Undead")) || waterEnemy(s, u));
export const drownedCannotCancel = (s: GameState, code: string) =>
  live(s) && code === D.ancient;
export const drownedQuestProgressBlocked = (s: GameState) =>
  live(s) && s.stage === 2;
export const drownedPlayProblem = (s: GameState, c: Card) =>
  live(s) &&
  questLive(s) &&
  drownedUnderwater(s) &&
  ["ally", "attachment"].includes(c.type_code)
    ? "Allies and attachments cannot be played while the active location is Underwater."
    : null;
export const drownedCostReduction = (s: GameState, c: Card) =>
  live(s) &&
  c.type_code === "ally" &&
  activeNamed(s, "Undersea Grotto") &&
  s.drowned!.firstAllyRound !== s.round
    ? 1
    : 0;
export function drownedAllyPlayed(s: GameState, played: boolean) {
  if (live(s) && played) s.drowned!.firstAllyRound = s.round;
}
export const drownedThreatBonus = (s: GameState, u: Unit) =>
  activeNamed(s, "Water-Logged Halls") && trait(u, "Undead") ? -1 : 0;
export const drownedAttackBonus = (s: GameState, u: Unit) =>
  live(s) && u.code === D.scorpion && !u.blanked && drownedUnderwater(s)
    ? 2
    : 0;
export function drownedPublicState(s: GameState) {
  const q = s.drowned;
  return q
    ? {
        initialized: q.initialized,
        currentQuest: q.currentQuest,
        grottoCount: q.grottoDeck.length,
        topGrottoCode: q.grottoDeck[0]?.code,
        underwaterVictories: q.victoryLocations.filter((u) =>
          trait(u, "Underwater"),
        ).length,
        underwater: drownedUnderwater(s),
        flipLocked: q.flipLockedRound === s.round,
        setAside: q.setAside.length,
        removed: q.removedUnits.length,
      }
    : undefined;
}
export function setupDrowned(s: GameState) {
  const r = DROWNED_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const pile = (section: string) =>
    r.cards
      .filter((c) => c.section === section)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // The Nightmare setup card's removals and its Nightmare Deck: Overgrown
  // Passage and Sharp Precipice join the Grotto deck.
  const [encounter, grotto] = drownedNightmare(s)
    ? nightmareEncounterDecks(
        s.scenarioId,
        [pile("sharedEncounterDeck"), pile("sharedEncounterDeck2")],
        (code) => (DROWNED_NIGHTMARE_GROTTO.includes(code) ? 1 : 0),
      )
    : [pile("sharedEncounterDeck"), pile("sharedEncounterDeck2")];
  const originalCodes: Record<string, string> = {};
  const location = (code: string) => {
    const u = make(s, drownedFront(code));
    originalCodes[u.id] = code;
    return u;
  };
  s.drowned = {
    initialized: false,
    advancing: false,
    currentQuest: D.grotto,
    grottoDeck: shuffle(s, grotto).map(location),
    setAside: [
      location(D.shrine),
      make(s, D.sahirAlly),
      make(s, D.naasiyahAlly),
    ],
    victoryLocations: [],
    removedUnits: [],
    originalCodes,
    flipLockedRound: 0,
    firstAllyRound: 0,
    bottomOnDestroy: [],
    blankedDepartures: [],
    combatBoosts: [],
  };
  s.encounterDeck = shuffle(s, encounter);
  s.encounterDiscard = [];
  s.staging = [];
  s.activeLocation = null;
}
export function drownedOpeningHandsKept(s: GameState) {
  if (!live(s) || s.drowned!.initialized) return false;
  prepend(s, fx("drownedSetup", { player: firstPlayer(s) }), fx("nextRound"));
  return true;
}
export function drownedAddGrotto(s: GameState, underwater = false) {
  const u = s.drowned?.grottoDeck.shift();
  if (!u) return;
  s.staging.push(u);
  if (underwater) drownedFlip(s, u);
  log(s, `${name(u)} enters the staging area.`);
  return u;
}
/** Shuffling a hidden pile erases its association with previously visible handles. */
function drownedResealGrotto(s: GameState) {
  const q = s.drowned!;
  for (const u of q.grottoDeck) {
    const original = q.originalCodes[u.id];
    delete q.originalCodes[u.id];
    u.id = make(s, u.code).id;
    q.originalCodes[u.id] = original;
  }
}
/** Flipping retains physical identity, attachments and damage; only progress is cleared. */
export function drownedFlip(s: GameState, u: Unit, preserveProgress = false) {
  const original = s.drowned?.originalCodes[u.id];
  if (
    !original ||
    (allActiveLocations(s).some((l) => l.id === u.id) &&
      s.drowned!.flipLockedRound === s.round)
  )
    return false;
  u.code = u.code.endsWith(":B") ? drownedFront(original) : original + ":B";
  if (!preserveProgress) u.progress = 0;
  log(s, `${name(u)} is now faceup.`);
  return true;
}
export function drownedTravelEntered(
  s: GameState,
  u: Unit,
  actualTravel = true,
) {
  if (!live(s)) return;
  drownedReturnUndead(s);
  if (
    actualTravel &&
    drownedIsDoubleSided(s, u) &&
    !u.code.endsWith(":B") &&
    u.code !== D.shrine &&
    !u.blanked
  )
    prepend(
      s,
      // Sharp Precipice: "Forced: After you travel to Sharp Precipice, flip
      // it to its Underwater side."
      fx(u.code === DN.precipice ? "drownedFlip" : "drownedFlipResponse", {
        target: u.id,
        player: firstPlayer(s),
      }),
    );
}
function returnEnemy(s: GameState, u: Unit) {
  forOwner(
    s,
    ownerOf(s, u),
    () => (s.engaged = s.engaged.filter((x) => x.id !== u.id)),
  );
  delete u.owner;
  s.staging.push(u);
  enemyAddedToStaging(s, u);
}
function drownedReturnUndead(s: GameState) {
  if (activeNamed(s, "Drowned Cave"))
    for (const u of allEngaged(s).filter((u) => trait(u, "Undead")))
      returnEnemy(s, u);
}
export function drownedCheck(s: GameState) {
  if (live(s)) drownedReturnUndead(s);
}
export function drownedEncounterStart(s: GameState) {
  if (!live(s) || drownedUnderwater(s)) return;
  // Cave Eel, and the Nightmare Deck's Great Shark.
  for (const u of allEngaged(s).filter(
    (u) => (u.code === D.eel || u.code === DN.shark) && !u.blanked,
  ))
    returnEnemy(s, u);
}
export function drownedQuestStart(s: GameState) {
  if (!live(s)) return;
  for (const u of allActiveLocations(s).filter(
    (u) => u.code === D.shrine && !u.blanked,
  ))
    drownedFlip(s, u, true);
}
export function drownedQuestEnd(s: GameState) {
  if (!live(s)) return;
  const forced = allActiveLocations(s)
    .filter((u) => trait(u, "Underwater") && !u.blanked)
    .map((u) =>
      fx("drownedUnderwaterForced", {
        target: u.id,
        code: u.code,
        player: firstPlayer(s),
      }),
    );
  if (forced.length > 1)
    prepend(
      s,
      fx("fangornOrder", {
        effects: forced,
        text: "Choose the next Underwater Forced effect",
        player: firstPlayer(s),
      }),
    );
  else prepend(s, ...forced);
}
/** Destination is a rule of the double-sided card and survives text blanking. */
export function drownedLocationDestination(s: GameState, u: Unit) {
  if (!drownedIsDoubleSided(s, u)) return false;
  const q = s.drowned!;
  if (u.code.endsWith(":B") || (card(u.code).victory ?? 0) > 0) {
    q.victoryLocations.push(u);
    addVictoryCard(s, u.code);
  } else {
    u.progress = 0;
    q.grottoDeck.push(u);
    shuffle(s, q.grottoDeck);
  }
  return true;
}
export function drownedLocationExplored(
  s: GameState,
  u: Unit,
  wasActive: boolean,
) {
  if (!live(s)) return;
  // Forced replenishment precedes the optional active Cursed Caverns responses.
  const effects: Effect[] = [];
  // Exploration listeners capture the old physical handle before it becomes hidden.
  if (
    drownedIsDoubleSided(s, u) &&
    !u.code.endsWith(":B") &&
    !card(u.code).victory
  )
    effects.push(fx("drownedResealGrotto", { player: firstPlayer(s) }));
  if (drownedIsDoubleSided(s, u) && s.stage === 1 && questLive(s))
    effects.push(fx("drownedReplenish", { player: firstPlayer(s) }));
  if (wasActive && u.code === D.caverns && !u.blanked)
    effects.push(
      ...playerOrder(s).map((player) => fx("drownedCaverns", { player })),
    );
  prepend(s, ...effects);
  if (
    [D.shrine, D.shrine + ":B"].includes(u.code) &&
    !u.blanked &&
    s.victoryCards?.includes(u.code)
  ) {
    win(s, "The heroes escape the flooded shrine with Na'asiyah.");
  }
}
export function drownedAdvance(s: GameState) {
  if (!live(s)) return false;
  const q = s.drowned!;
  if (
    s.stage !== 1 ||
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.queue.length ||
    s.choice ||
    s.status !== "playing"
  )
    return true;
  if (s.progress < 15 || (questLive(s) && q.victoryLocations.length < 3))
    return true;
  if (questDefeated(s, D.grotto)) return true;
  q.advancing = true;
  q.currentQuest = D.betrayal;
  s.stage = 2;
  s.progress = 0;
  s.stageRevealing = true;
  prepend(s, fx("drownedBetrayal", { player: firstPlayer(s) }));
  return true;
}
export function drownedEncounter(s: GameState, code: string, replay = false) {
  if (!live(s) || ![D.undertow, D.abyss, D.tangling, D.ancient].includes(code))
    return false;
  if (!replay) s.encounterDiscard.push(code);
  const kinds: Record<string, string> = {
    [D.undertow]: "drownedUndertow",
    [D.abyss]: "drownedAbyss",
    [D.tangling]: "drownedTangling",
    [D.ancient]: "drownedAncient",
  };
  if (code === D.tangling)
    prepend(s, ...playerOrder(s).map((player) => fx(kinds[code], { player })));
  else
    prepend(s, fx(kinds[code], { player: firstPlayer(s), count: 0, value: 0 }));
  return true;
}
export function drownedShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  if ([D.ancient, D.scorpion].includes(code))
    s.combat.attackBonus += drownedUnderwater(s) ? 2 : 1;
  else if (code === D.tangling)
    prepend(
      s,
      fx("drownedDiscardAttachment", {
        player: s.combat.attackPlayer ?? activeSeat(s),
      }),
    );
  else if (code === D.abyss) {
    if (drownedUnderwater(s))
      prepend(
        s,
        fx("drownedSearchEnemy", {
          text: "Creature",
          player: s.combat.attackPlayer ?? activeSeat(s),
        }),
      );
  } else return false;
  return true;
}
/** A receipt records actual pre-Then resolution, rather than later token totals. */
function drownedThenStart(s: GameState, location: Unit, assignments: string[]) {
  const q = s.drowned!;
  const id = `drowned-then-${(q.thenSequence = (q.thenSequence ?? 0) + 1)}`;
  const receipt = {
    id,
    locationId: location.id,
    locationCode: location.code,
    expected: assignments.map((assignment) => `${id}/${assignment}`),
    resolved: [] as string[],
  };
  (q.thenReceipts ??= []).push(receipt);
  return receipt;
}
function drownedThenResolved(s: GameState, token?: string) {
  if (!token) return;
  const receipt = s.drowned?.thenReceipts?.find((r) =>
    r.expected.includes(token),
  );
  if (receipt && !receipt.resolved.includes(token))
    receipt.resolved.push(token);
}
/** Successful redirection resolves an assignment; prevention/cancellation never reaches this hook. */
export function drownedDamageDealt(
  s: GameState,
  value: number,
  context: DamageContext,
) {
  if (value >= 1) drownedThenResolved(s, context.drownedThenToken);
}
export function drownedEffect(s: GameState, e: Effect) {
  const q = s.drowned;
  if (!live(s) || !q) return false;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "drownedSetup": {
      const ps = playerOrder(s);
      for (const [code, p] of [
        [D.sahirAlly, firstPlayer(s)],
        [D.naasiyahAlly, ps.at(-1)!],
      ] as const) {
        const ally = q.setAside.find((u) => u.code === code)!;
        q.setAside = q.setAside.filter((u) => u.id !== ally.id);
        ally.owner = p;
        ally.controller = p;
        forOwner(s, p, () => s.allies.push(ally));
        encounterCharacterEntered(s, ally);
        if (s.status !== "playing") return true;
      }
      for (let i = 0; i < (ps.length >= 3 ? 3 : 2); i++) drownedAddGrotto(s);
      q.initialized = true;
      // The Dream-chaser campaign card's Setup.
      if (isDreamchaserGame(s)) prepend(s, ...dreamchaserDrownedReady(s));
      break;
    }
    case "drownedResealGrotto":
      drownedResealGrotto(s);
      break;
    case "drownedReplenish":
      drownedAddGrotto(s);
      break;
    case "drownedAncient":
      drownedAddGrotto(s, true);
      break;
    case "drownedFlipResponse":
      if (
        u &&
        !u.blanked &&
        allActiveLocations(s).some((l) => l.id === u.id) &&
        q.flipLockedRound !== s.round
      )
        choose(
          s,
          `${name(u)} · Flip to its ${u.code.endsWith(":B") ? "Grotto" : "Underwater"} side?`,
          [
            {
              id: "flip",
              label: "Flip the location · Remove all progress",
              effects: [fx("drownedFlip", { target: u.id, player })],
            },
            skip,
          ],
        );
      break;
    case "drownedFlip":
      if (u && allActiveLocations(s).some((l) => l.id === u.id))
        drownedFlip(s, u);
      break;
    case "drownedUnderwaterForced": {
      if (
        !u ||
        u.blanked ||
        !allActiveLocations(s).some((l) => l.id === u.id) ||
        !trait(u, "Underwater")
      )
        break;
      const title = card(u.code).name,
        effects: Effect[] = [];
      if (title === "Shrine to Morgoth") {
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("drownedThreat", { value: 5, player }),
          ),
        );
        break;
      }
      // The Nightmare Deck's Flooded Caverns: "return an Underwater location
      // from the victory display to the bottom of the Grotto deck, Grotto
      // side faceup. Then, return Flooded Caverns to the staging area."
      if (title === "Flooded Caverns") {
        const receipt = drownedThenStart(s, u, ["location"]);
        prepend(
          s,
          fx("drownedFloodedReturn", {
            text: receipt.expected[0],
            player: firstPlayer(s),
          }),
          fx("drownedThenFinish", {
            target: u.id,
            source: receipt.id,
            player: firstPlayer(s),
          }),
        );
        break;
      }
      const characters =
        title === "Sunken Temple"
          ? allCharacters(s).filter(
              (c) => isHero(c) || unitType(c) === "objective-ally",
            )
          : title === "Dark Abyss"
            ? allCharacters(s)
            : [];
      const players = playerOrder(s);
      const receipt = drownedThenStart(
        s,
        u,
        characters.length || ["Dark Abyss", "Sunken Temple"].includes(title)
          ? characters.map((c) => c.id)
          : players.map((p) => `player-${p}`),
      );
      if (title === "Dark Abyss")
        effects.push(
          ...characters.map((c, i) =>
            fx("damage", {
              target: c.id,
              value: 1,
              player: ownerOf(s, c),
              text: encodeDamageContext({
                drownedThenToken: receipt.expected[i],
              }),
            }),
          ),
        );
      else if (title === "Twisting Hollow")
        effects.push(
          ...players.map((player, i) =>
            fx("drownedDiscardCharacter", {
              player,
              text: receipt.expected[i],
            }),
          ),
        );
      else if (title === "Sunken Temple")
        characters.forEach((c, i) => {
          if (c.resources > 0) {
            c.resources--;
            drownedThenResolved(s, receipt.expected[i]);
          }
        });
      else if (title === "Drowned Cave")
        effects.push(
          ...players.map((player, i) =>
            fx("drownedDiscardDeck", {
              value: 10,
              player,
              text: receipt.expected[i],
            }),
          ),
        );
      // The Nightmare Deck's Underwater sides.
      else if (title === "Jagged Cavern")
        effects.push(
          ...players.map((player, i) =>
            fx("drownedDiscardHand", { player, text: receipt.expected[i] }),
          ),
        );
      else if (title === "Submerged Crawlway")
        effects.push(
          ...players.map((player, i) =>
            fx("drownedSearchEnemy", {
              player,
              source: receipt.expected[i],
            }),
          ),
        );
      effects.push(
        fx("drownedThenFinish", {
          target: u.id,
          source: receipt.id,
          player: firstPlayer(s),
        }),
      );
      prepend(s, ...effects);
      break;
    }
    case "drownedDiscardCharacter": {
      const own = allCharacters(s).filter((c) => ownerOf(s, c) === player);
      if (own.length)
        choose(
          s,
          "Twisting Hollow · Discard a character",
          opts(own, (c) => [
            fx("drownedThenDiscardCharacter", {
              target: c.id,
              player,
              text: e.text,
            }),
          ]),
        );
      break;
    }
    case "drownedThenDiscardCharacter":
      if (
        u &&
        allCharacters(s).some((c) => c.id === u.id) &&
        ownerOf(s, u) === player
      ) {
        discardCharacter(s, u);
        if (!allCharacters(s).some((c) => c.id === u.id))
          drownedThenResolved(s, e.text);
      }
      break;
    case "drownedDiscardDeck": {
      const discarded = discardPlayerDeck(s, e.value ?? 0, player);
      if (discarded.length === (e.value ?? 0)) drownedThenResolved(s, e.text);
      break;
    }
    case "drownedThenFinish": {
      const receipt = q.thenReceipts?.find((r) => r.id === e.source);
      q.thenReceipts = q.thenReceipts?.filter((r) => r.id !== e.source);
      if (
        receipt &&
        receipt.expected.length > 0 &&
        receipt.expected.every((t) => receipt.resolved.includes(t)) &&
        u?.code === receipt.locationCode &&
        allActiveLocations(s).some((l) => l.id === u.id)
      )
        prepend(
          s,
          fx(
            u.code === D.cave
              ? "drownedCaveReturn"
              : u.code === DN.flooded
                ? "drownedReturnLocation"
                : "drownedFlipResponse",
            { target: u.id, player: firstPlayer(s) },
          ),
        );
      break;
    }
    // Jagged Cavern: "each player must discard each card in his or her hand."
    case "drownedDiscardHand":
      forOwner(s, player, () => {
        for (const h of [...s.hand])
          discardHandCard(s, h.id, { encounterEffect: true });
        if (!s.hand.length) drownedThenResolved(s, e.text);
      });
      break;
    case "drownedFloodedReturn": {
      const underwater = q.victoryLocations.filter((v) =>
        trait(v, "Underwater"),
      );
      if (!underwater.length) break;
      choose(
        s,
        "Flooded Caverns · Return an Underwater location to the Grotto deck",
        underwater.map((v) => ({
          id: v.id,
          code: v.code,
          label: `${name(v)} · to the bottom of the Grotto deck`,
          effects: [
            fx("drownedFloodedBottom", {
              target: v.id,
              text: e.text,
              player,
            }),
          ],
        })),
      );
      break;
    }
    case "drownedFloodedBottom": {
      const v = q.victoryLocations.find((x) => x.id === e.target);
      if (!v) break;
      q.victoryLocations = q.victoryLocations.filter((x) => x.id !== v.id);
      const i = s.victoryCards?.lastIndexOf(v.code) ?? -1;
      if (i >= 0) s.victoryCards!.splice(i, 1);
      v.code = drownedFront(q.originalCodes[v.id]);
      v.progress = 0;
      q.grottoDeck.push(v);
      log(
        s,
        `Flooded Caverns: ${name(v)} returns to the bottom of the Grotto deck.`,
        "danger",
      );
      drownedThenResolved(s, e.text);
      break;
    }
    case "drownedCaveReturn":
      if (u && allActiveLocations(s).some((l) => l.id === u.id))
        choose(s, "Drowned Cave · Return to staging?", [
          {
            id: "return",
            label: "Return Drowned Cave to staging",
            effects: [fx("drownedReturnLocation", { target: u.id, player })],
          },
          skip,
        ]);
      break;
    case "drownedReturnLocation":
      if (
        u &&
        (u.code === D.cave || u.code === DN.flooded) &&
        allActiveLocations(s).some((l) => l.id === u.id)
      ) {
        if (s.activeLocation?.id === u.id) s.activeLocation = null;
        s.extraActiveLocations = s.extraActiveLocations?.filter(
          (l) => l.id !== u.id,
        );
        s.staging.push(u);
      }
      break;
    case "drownedThreat":
      forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      break;
    case "drownedCaverns":
      if (seatView(s, player).deck.length)
        choose(s, "Cursed Caverns · Draw the bottom card?", [
          {
            id: "draw",
            label: "Raise threat by 2 · Draw the bottom card",
            effects: [fx("drownedCavernsDraw", { player })],
          },
          skip,
        ]);
      break;
    case "drownedCavernsDraw":
      forOwner(s, player, () => {
        raiseThreat(s, 2, "encounter");
        if (s.status === "playing" && !s.table?.seats[player].eliminated)
          draw(s, 1, true, true);
      });
      break;
    case "drownedUndertow":
      q.flipLockedRound = s.round;
      if (drownedUnderwater(s))
        prepend(
          s,
          ...allActiveLocations(s)
            .filter((u) => trait(u, "Underwater"))
            .map((u) =>
              fx("drownedUnderwaterForced", {
                target: u.id,
                player: firstPlayer(s),
              }),
            ),
        );
      else resolveDoomed(s, 3, "encounter");
      break;
    case "drownedAbyss": {
      const ps = playerOrder(s),
        index = e.count ?? 0;
      if (index >= ps.length) {
        if (!(e.value ?? 0)) prepend(s, ...surgeEffects(D.abyss));
        break;
      }
      prepend(
        s,
        fx("drownedAbyssChoose", {
          player: ps[index],
          count: index,
          value: e.value ?? 0,
        }),
      );
      break;
    }
    case "drownedAbyssChoose": {
      const hand = seatView(s, player).hand;
      choose(
        s,
        "Into the Abyss · Keep one card type",
        ["ally", "attachment", "event", "player-side-quest", "hero"].map(
          (type) => {
            const cards = hand.filter((u) => card(u.code).type_code !== type);
            return {
              id: type,
              label: `Keep ${type} cards · Discard ${cards.length}`,
              effects: [
                ...cards.map((u) =>
                  fx("discardHandCard", { target: u.id, player }),
                ),
                fx("drownedAbyss", {
                  count: (e.count ?? 0) + 1,
                  value: (e.value ?? 0) + cards.length,
                  player: firstPlayer(s),
                }),
              ],
            };
          },
        ),
      );
      break;
    }
    case "drownedTangling": {
      const committed = allCharacters(s).filter(
        (u) => ownerOf(s, u) === player && u.committed,
      );
      if (committed.length)
        choose(
          s,
          "Tangling and Grasping · Remove a character from the quest",
          opts(committed, (u) => [
            fx("drownedRemoveQuester", {
              target: u.id,
              player,
              flag: drownedUnderwater(s),
            }),
          ]),
        );
      break;
    }
    case "drownedRemoveQuester":
      if (u?.committed) {
        removeFromQuest(s, u);
        seatView(s, ownerOf(s, u)).committedIds = seatView(
          s,
          ownerOf(s, u),
        ).committedIds.filter((id) => id !== u.id);
        if (e.flag) damage(s, u.id, 2);
      }
      break;
    case "drownedDiscardAttachment": {
      const options = [
        ...allCharacters(s),
        ...allEngaged(s),
        ...s.staging,
        ...allActiveLocations(s),
        ...allQuestUnits(s),
      ].flatMap((host) =>
        host.attachments
          .filter((a) => attachmentController(s, host, a) === player)
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name}`,
            effects: [
              fx("discardAttachment", {
                target: host.id,
                source: a.id,
                player,
              }),
            ],
          })),
      );
      if (options.length)
        choose(s, "Tangling and Grasping · Discard an attachment", options);
      break;
    }
    case "drownedBetrayal": {
      for (const old of allActiveLocations(s)) s.staging.push(old);
      s.activeLocation = q.setAside.find((u) => u.code === D.shrine)!;
      s.extraActiveLocations = [];
      q.setAside = q.setAside.filter((u) => u.id !== s.activeLocation!.id);
      const sahir = allCharacters(s).find((u) => u.code === D.sahirAlly);
      if (sahir) {
        forOwner(
          s,
          ownerOf(s, sahir),
          () => (s.allies = s.allies.filter((u) => u.id !== sahir.id)),
        );
        for (const a of [...sahir.attachments]) discardAttachment(s, sahir, a);
        sahir.code = D.sahir;
        sahir.damage = 0;
        sahir.resources = 0;
        sahir.progress = 0;
        delete sahir.controller;
        sahir.owner = firstPlayer(s);
        forOwner(s, firstPlayer(s), () => s.engaged.push(sahir));
      }
      prepend(
        s,
        ...(sahir
          ? [
              // The Nightmare setup card: he attacks each player in turn
              // order, instead of only the first player.
              ...(drownedNightmare(s) ? playerOrder(s) : [firstPlayer(s)]).map(
                (player) => fx("immediateAttack", { target: sahir.id, player }),
              ),
              fx("drownedRemoveSahir", {
                target: sahir.id,
                player: firstPlayer(s),
              }),
            ]
          : []),
        ...playerOrder(s).map((player) =>
          fx("drownedSearchEnemy", { text: "Undead", player }),
        ),
        fx("drownedStageReady", { player: firstPlayer(s) }),
      );
      break;
    }
    case "drownedRemoveSahir":
      if (u) {
        forOwner(
          s,
          ownerOf(s, u),
          () => (s.engaged = s.engaged.filter((x) => x.id !== u.id)),
        );
        s.staging = s.staging.filter((x) => x.id !== u.id);
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        q.removedUnits.push(u);
      }
      break;
    case "drownedSearchEnemy": {
      // Without a trait (Submerged Crawlway), any enemy.
      const codes = [
        ...new Set([...s.encounterDeck, ...s.encounterDiscard]),
      ].filter(
        (code) =>
          card(code).type_code === "enemy" &&
          (!e.text ||
            (card(code).traits ?? "")
              .split(".")
              .some((t) => t.trim() === e.text)),
      );
      if (codes.length)
        choose(
          s,
          e.text ? `Search for an ${e.text} enemy` : "Search for an enemy",
          codes.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("drownedAddEnemy", { code, player, source: e.source }),
            ],
          })),
        );
      else shuffle(s, s.encounterDeck);
      break;
    }
    case "drownedAddEnemy": {
      const pile = s.encounterDeck.includes(e.code!)
          ? s.encounterDeck
          : s.encounterDiscard,
        index = pile.indexOf(e.code!);
      if (index < 0) break;
      pile.splice(index, 1);
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      enemyAddedToStaging(s, enemy);
      shuffle(s, s.encounterDeck);
      drownedThenResolved(s, e.source);
      break;
    }
    case "drownedStageReady":
      q.advancing = false;
      s.stageRevealing = false;
      break;
    default:
      return false;
  }
  return true;
}
