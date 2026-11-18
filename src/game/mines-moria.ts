import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, draw, fx, get, log, make, prepend } from "./core";
import { discardAttachment, enterEnemyEngaged } from "./board";
import {
  activeSeat,
  attachmentController,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { mainQuestUnit } from "./quest-state";
import {
  MM,
  MM_EVENT_CARDS,
  mmCost,
  mmHasTrait,
  mmRecipe,
  mmStageInfo,
} from "./mines-moria-support";
import type { MinesMoriaState } from "./mines-moria-types";
import { mmCardEffect, mmEncounter, mmShadow } from "./mines-moria-cards";
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
  charactersOf,
  engagedWith,
  enemiesInPlay,
  isEnemy,
  isLocation,
  live,
  phaseKey,
  players,
  removeProgress,
  searchable,
  seatLabel,
  stageNumber,
  toStaging,
  who,
} from "./fellowship-event-lib";
export * from "./mines-moria-support";

/**
 * The Mines of Moria (2019 Fellowship event), played cooperatively. The
 * players build the quest deck from To the West-door and one stage 2 and one
 * stage 3 card, and the encounter deck from 7 of the 14 encounter sets (the
 * quick build); the first player resolves each 'opposing team' effect. They
 * defeat The Watcher at the West-door, which turns into Chamber of Mazarbul,
 * cross Moria and search for the Chamber and the fate of Balin.
 */
const at = (s: GameState, code: string) =>
  s.minesMoria?.currentQuest === code &&
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked;
const staged = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
const stagedUnits = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code));
const watcherInPlay = (s: GameState) =>
  enemiesInPlay(s).some((u) => u.code === MM.watcher);
const chamberInPlay = (s: GameState) =>
  s.staging.some((u) => u.code === MM.chamber) ||
  s.activeLocation?.code === MM.chamber ||
  (s.extraActiveLocations ?? []).some((u) => u.code === MM.chamber);
const isCharacter = (u: Unit) =>
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code);
/** The progress caps of this phase on the current quest. */
const capsNow = (q: MinesMoriaState, s: GameState) =>
  q.caps.filter((x) => x.key === phaseKey(s));

/** The shared quick build, with this scenario's stage effects. */
const MM_EVENT: FellowshipEventConfig = {
  ...MM_EVENT_CARDS,
  prefix: "mm",
  state: (s) => s.minesMoria,
  requestSetup: (s) => [fx("mmWestDoor", { player: firstPlayer(s) })],
  stageRevealed: (s, code) => {
    const first = firstPlayer(s);
    if (code === MM.longDark)
      return [fx("mmLongDark", { ids: [], count: players(s), player: first })];
    if (code === MM.narrow)
      return playerOrder(s).map((owner) =>
        fx("mmNarrow", { target: String(owner), player: first }),
      );
    if (code === MM.drums) return [fx("mmDrums", { player: first })];
    return [];
  },
  stageDefeated: (s, code) => {
    const q = s.minesMoria;
    if (!q || code !== MM.narrow) return;
    // Narrow Paths: each guarded attachment returns to its owner's hand.
    for (const g of q.guarded)
      forOwner(s, g.owner, () => {
        const u = make(s, g.attachment.code);
        u.owner = g.owner;
        s.hand.push(u);
        log(
          s,
          `Narrow Paths: ${card(g.attachment.code).name} returns to ${who(s, g.owner)}${s.table ? "'s" : "r"} hand.`,
          "good",
        );
      });
    q.guarded = [];
  },
};

// ---------------------------------------------------------------------------
// Setup.

export function setupMinesMoria(s: GameState) {
  const r = mmRecipe();
  const cards = r.cards.flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = [];
  s.minesMoria = {
    ...fellowshipEventState(cards, MM.request),
    guarded: [],
    guarding: null,
    hidden: [],
    stagingBonus: [],
    signs: null,
    zigil: [],
    caps: [],
    brood: null,
    lightless: [],
    firstTreachery: null,
    questEnded: null,
    noReady: [],
    noDamage: [],
    engagedRound: [],
    massing: [],
    warlords: [],
    resolving: [],
  };
  log(
    s,
    "The Mines of Moria: the players choose a stage 2 and a stage 3 quest card and 7 of the 14 encounter sets; the first player resolves each 'opposing team' effect.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.minesMoria;
  if (!q) return false;
  if (!fellowshipEventComplete(s, q, mmStageInfo(s)?.quest ?? 0)) return true;
  // 1B: The Watcher must be defeated first.
  if (q.currentQuest === MM.request && watcherInPlay(s)) return true;
  // Drums in the Deep: no enemy may be in play.
  if (q.currentQuest === MM.drums && enemiesInPlay(s).length) return true;
  // The Fate of Balin and Continuing Eastward: Chamber of Mazarbul must leave play.
  if (
    (q.currentQuest === MM.balin || q.currentQuest === MM.eastward) &&
    chamberInPlay(s)
  )
    return true;
  fellowshipEventDefeat(
    s,
    MM_EVENT,
    "The players find the Chamber of Mazarbul and learn the fate of Balin's colony: they win the game!",
  );
  return true;
}
/** Player attachments a player controls (on any card in play). */
function controlledAttachments(s: GameState, p: number) {
  const hosts = [
    ...playerOrder(s).flatMap((o) => charactersOf(s, o)),
    ...globalEngaged(s),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ];
  return hosts.flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          card(a.code).type_code === "attachment" &&
          attachmentController(s, host, a) === p,
      )
      .map((a) => ({ host, a })),
  );
}

function mmStageEffect(s: GameState, e: Effect): boolean {
  const q = s.minesMoria;
  if (!q || !e.kind.startsWith("mm")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    // 1A: each hero gains a resource.
    case "mmWestDoor":
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => {
          for (const h of s.heroes) h.resources += 1;
        });
      log(
        s,
        "To the West-door: each player adds 1 resource to each of his heroes' resource pools.",
        "good",
      );
      return true;
    // 1B: The Watcher is defeated and flipped over to Chamber of Mazarbul.
    case "mmChamber": {
      toStaging(s, MM.chamber);
      log(
        s,
        "To the West-door: The Watcher is defeated; it is flipped over and Chamber of Mazarbul is added to the staging area.",
        "good",
      );
      return true;
    }
    // A Presence in the Dark: 1 of the top 2 cards goes to the bottom.
    case "mmPresence": {
      const top = s.encounterDeck.slice(0, 2);
      if (top.length < 2) {
        log(
          s,
          "A Presence in the Dark: fewer than 2 cards are in the encounter deck.",
        );
        return true;
      }
      choose(
        s,
        `A Presence in the Dark · The opposing team puts 1 of the top 2 encounter cards on the bottom and the other back on top${seatLabel(s, first)}`,
        top.map((c, i) => ({
          id: `bottom:${i}`,
          code: c,
          label: `Put ${card(c).name} on the bottom (${card(top[1 - i]).name} stays on top)`,
          effects: [fx("mmPresenceBottom", { value: i, player: first })],
        })),
        card(MM.presence).back_text,
      );
      return true;
    }
    case "mmPresenceBottom": {
      const i = e.value ?? 0;
      if (s.encounterDeck.length < 2) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      s.encounterDeck.push(c);
      log(
        s,
        "A Presence in the Dark: the opposing team puts 1 of the top 2 encounter cards on the bottom of the deck.",
        "danger",
      );
      return true;
    }
    // The Long Dark of Moria: one different 0 cost location per player.
    case "mmLongDark": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("mmShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "location" &&
          mmCost(c) === 0 &&
          !taken.has(card(c).name),
      );
      if (!options.length) {
        log(
          s,
          "The Long Dark of Moria: there is no different 0 cost location.",
        );
        prepend(s, fx("mmShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `The Long Dark of Moria · The opposing team adds a different 0 cost location to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("mmSearchStage", {
              code: c,
              text: "The Long Dark of Moria",
              player: first,
            }),
            fx("mmLongDark", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(MM.longDark).back_text,
      );
      return true;
    }
    // Narrow Paths: an attachment controlled by each player is guarded.
    case "mmNarrow": {
      const owner = Number(e.target);
      const options = controlledAttachments(s, owner);
      if (!options.length) {
        log(
          s,
          `Narrow Paths: ${who(s, owner)} ${s.table ? "controls" : "control"} no attachment.`,
        );
        return true;
      }
      choose(
        s,
        `Narrow Paths · The opposing team chooses an attachment controlled by ${who(s, owner)} to guard under the stage${seatLabel(s, first)}`,
        options.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} on ${name(host)}`,
          effects: [
            fx("mmGuard", {
              target: host.id,
              source: a.id,
              value: owner,
              player: first,
            }),
          ],
        })),
        card(MM.narrow).back_text,
      );
      return true;
    }
    case "mmGuard": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!host || !a) return true;
      q.guarding = { id: a.id, owner: e.value ?? a.owner ?? 0 };
      discardAttachment(s, host, a, false, false);
      q.guarding = null;
      return true;
    }
    // Drums in the Deep: an enemy from the deck or discard pile.
    case "mmDrums": {
      const options = searchable(s, (c) => card(c).type_code === "enemy");
      if (!options.length) {
        log(
          s,
          "Drums in the Deep: there is no enemy in the encounter deck or discard pile.",
        );
        return true;
      }
      choose(
        s,
        `Drums in the Deep · The opposing team adds an enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("mmSearchStage", {
              code: c,
              text: "Drums in the Deep",
              player: first,
            }),
          ],
        })),
        card(MM.drums).back_text,
      );
      return true;
    }
    // The Fate of Balin: another reveal, or no more than 5 progress this phase.
    case "mmBalin":
      choose(
        s,
        `The Fate of Balin · Reveal an additional encounter card this phase, or no more than 5 progress can be placed on the stage this phase${seatLabel(s, first)}`,
        [
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("reveal", { player: first })],
          },
          {
            id: "cap",
            label: "No more than 5 progress on the stage this phase",
            effects: [fx("mmCap", { value: 5, code: MM.balin, player: first })],
          },
        ],
        card(MM.balin).back_text,
      );
      return true;
    // Searches for an enemy with a trait and a cost (Spider Burrow, Goblin Tunnels, Goblin Warlord).
    case "mmTraitSearch": {
      const trait = e.flag ? "Goblin" : "Spider";
      const max = e.value ?? 1;
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          mmHasTrait(c, trait) &&
          (e.text === "Goblin Warlord" ? mmCost(c) === 0 : mmCost(c) <= max),
      );
      const shuffleAfter = fx("mmShuffle", { player: first });
      if (!options.length) {
        log(s, `${e.text}: there is no ${trait} enemy to add.`);
        prepend(s, shuffleAfter);
        return true;
      }
      choose(
        s,
        `${e.text} · The opposing team adds a ${trait} enemy ${e.text === "Goblin Warlord" ? "with cost 0" : `with cost ${max} or less`} to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${mmCost(c)})`,
          effects: [
            fx("mmSearchStage", { code: c, text: e.text, player: first }),
            shuffleAfter,
          ],
        })),
      );
      return true;
    }
    // Goblin Follower: it engages the player an enemy just engaged.
    case "mmFollower": {
      const u = get(s, e.target);
      if (!u || !s.staging.some((x) => x.id === u.id)) return true;
      log(s, `Goblin Follower engages ${who(s, p)}.`, "danger");
      enterEnemyEngaged(s, u, p);
      return true;
    }
    // Spider Broodling: 2 progress removed after it engages.
    case "mmBroodling":
      if (!removeProgress(s, 2, e.text ?? "Spider Broodling"))
        log(s, `${e.text}: there is no progress on the main quest.`);
      return true;
    // Hidden Threat: the facedown cards are revealed after a successful quest.
    case "mmHiddenReveal": {
      const cards = [...q.hidden];
      q.hidden = [];
      if (!cards.length) return true;
      log(
        s,
        `Hidden Threat: the players quested successfully; ${cards.length === 1 ? "the card" : "the cards"} under the main quest ${cards.length === 1 ? "is" : "are"} revealed.`,
        "danger",
      );
      prepend(
        s,
        ...cards.map((c) => fx("revealCard", { code: c, player: first })),
      );
      return true;
    }
    // Zigil Mineshaft's Quest Action: each player's threat for 1 less threat this phase.
    case "mmZigil": {
      const u = get(s, e.target);
      if (!u) return true;
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => (s.threat += 1));
      const key = phaseKey(s);
      const row = q.zigil.find((x) => x.id === u.id && x.key === key);
      if (row) row.amount += 1;
      else q.zigil.push({ id: u.id, key, amount: 1 });
      log(
        s,
        "Zigil Mineshaft: each player raises his threat by 1; Zigil Mineshaft gets -1 threat until the end of the phase.",
        "good",
      );
      return true;
    }
    // Dwarven Forge: explored as the active location, each player may draw.
    case "mmForge":
      choose(
        s,
        `Dwarven Forge · Response: each player draws 1 card?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label: "Each player draws 1 card",
            effects: [fx("mmForgeDraw", { player: first })],
          },
          {
            id: "skip",
            label: "Continue without using this ability",
            effects: [],
          },
        ],
        card(MM.forge).text,
      );
      return true;
    case "mmForgeDraw":
      for (const owner of playerOrder(s)) forOwner(s, owner, () => draw(s, 1));
      log(s, "Dwarven Forge: each player draws 1 card.", "good");
      return true;
    // Darkened Stairway's travel: the top card; a treachery resolves.
    case "mmStairway": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      s.encounterDiscard.push(top);
      if (card(top).type_code === "treachery") {
        log(
          s,
          `Darkened Stairway: ${card(top).name} is discarded from the encounter deck and its 'when revealed' effect resolves.`,
          "danger",
        );
        prepend(
          s,
          fx("resolvePrintedWhenRevealed", { code: top, player: first }),
        );
      } else
        log(
          s,
          `Darkened Stairway: ${card(top).name} is discarded from the encounter deck.`,
        );
      return true;
    }
    // Narrow Fissure's travel: 1 damage to a hero of each player.
    case "mmFissure": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      choose(
        s,
        `Narrow Fissure · Deal 1 damage to a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} (${(card(h.code).health ?? 0) - h.damage} hit points left)`,
          effects: [fx("damage", { target: h.id, value: 1, player: p })],
        })),
      );
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const MINES_MORIA_HOOKS: Batch4ScenarioHooks = {
  setup: setupMinesMoria,
  openingHandsKept: (s) => fellowshipEventOpening(s, MM_EVENT),
  advance,
  stageInfo: mmStageInfo,
  encounter: mmEncounter,
  shadow: mmShadow,
  effect: (s, e) =>
    fellowshipEventEffect(s, e, MM_EVENT) ||
    mmStageEffect(s, e) ||
    mmCardEffect(s, e),
  stats: (s, u) => {
    const q = s.minesMoria;
    if (!q || u.blanked || !isEnemy(u)) return {};
    const key = phaseKey(s);
    let attack = 0,
      defense = 0,
      health = 0;
    // The Watcher: +4 hit points per player.
    if (u.code === MM.watcher) health += 4 * players(s);
    if (mmHasTrait(u.code, "Spider")) defense += staged(s, MM.burrow);
    if (mmHasTrait(u.code, "Goblin")) attack += staged(s, MM.tunnels);
    if (u.attachments.some((a) => a.code === MM.denizen)) {
      attack += 1;
      defense += 1;
    }
    const owner = engagedWith(s, u);
    if (
      owner !== undefined &&
      q.massing.some((x) => x.player === owner && x.key === key)
    )
      attack += 1;
    return { attack, defense, health };
  },
  threatBonus: (s, u) => {
    const q = s.minesMoria;
    if (!q || u.blanked) return 0;
    const key = phaseKey(s);
    const inStaging = s.staging.some((x) => x.id === u.id);
    let bonus = 0;
    // The Watcher: +2 threat per player; Chamber of Mazarbul: X = stage + 1.
    if (u.code === MM.watcher) bonus += 2 * players(s);
    if (u.code === MM.chamber) bonus += stageNumber(s) + 1;
    if (u.code === MM.hall) bonus += staged(s, MM.hall);
    if (u.code === MM.guardroom) bonus += u.resources;
    if (u.attachments.some((a) => a.code === MM.denizen)) bonus += 1;
    if (inStaging && (isEnemy(u) || isLocation(u)) && q.signs?.key === key)
      bonus += q.signs.count;
    if (inStaging && isLocation(u) && at(s, MM.eastward)) bonus += 1;
    if (u.code === MM.zigil)
      bonus -= q.zigil
        .filter((x) => x.id === u.id && x.key === key)
        .reduce((n, x) => n + x.amount, 0);
    return bonus;
  },
  // Continuing Eastward: +3 quest points to each staged location.
  locationQuestBonus: (s, u) =>
    s.minesMoria && at(s, MM.eastward) && s.staging.some((x) => x.id === u.id)
      ? 3
      : 0,
  stagingThreat: (s) => {
    const q = s.minesMoria;
    if (!q) return 0;
    const key = phaseKey(s);
    return q.stagingBonus
      .filter((x) => x.key === key)
      .reduce((n, x) => n + x.amount, 0);
  },
  // Werewolf: -10 engagement cost while there is an active location.
  engagementBonus: (s, u) =>
    s.minesMoria && live(u, MM.werewolf) && s.activeLocation ? -10 : 0,
  cannotOptionallyEngage: (s, u) =>
    !!s.minesMoria && (live(u, MM.watcher) || live(u, MM.follower)),
  // 1B: with 5 progress, The Watcher is considered engaged with each player.
  consideredEngaged: (s, u, player) =>
    !!s.minesMoria &&
    live(u, MM.watcher) &&
    at(s, MM.request) &&
    s.progress >= 5 &&
    s.staging.some((x) => x.id === u.id) &&
    playerOrder(s).includes(player),
  immune: (s, u) =>
    !!s.minesMoria && u.attachments.some((a) => a.code === MM.denizen),
  damageAmount: (s, u, amount, context) => {
    const q = s.minesMoria;
    if (!q || !isEnemy(u)) return amount;
    if (!context.combatDamage && [MM.brood, MM.warlord].some((c) => live(u, c)))
      return 0;
    // Drums in the Deep: no enemy takes damage while Chamber of Mazarbul is staged.
    if (at(s, MM.drums) && s.staging.some((x) => x.code === MM.chamber))
      return 0;
    if (q.noDamage.some((x) => x.id === u.id && x.key === phaseKey(s)))
      return 0;
    return amount;
  },
  // No non-objective player card attachments.
  cannotAttach: (s, u, code) =>
    !!s.minesMoria &&
    [MM.brood, MM.troll, MM.warlord].some((c) => live(u, c)) &&
    card(code).type_code === "attachment",
  cannotPlayerReady: (s) => !!s.minesMoria && staged(s, MM.well) > 0,
  cannotReady: (s, u) =>
    !!s.minesMoria &&
    s.minesMoria.noReady.some((x) => x.id === u.id && x.round === s.round),
  // Shadow of Fear: the attached hero's text box is blank.
  characterBlanked: (s, u) =>
    !!s.minesMoria &&
    isCharacter(u) &&
    u.attachments.some((a) => a.code === MM.fear),
  cannotHeal: (s) => !!s.minesMoria && staged(s, MM.fissure) > 0,
  // Stairs of Náin: the first treachery revealed each round, until the next reveal.
  revealed: (s, code) => {
    const q = s.minesMoria;
    if (!q) return;
    if (q.firstTreachery?.round === s.round) q.firstTreachery.open = false;
    else if (card(code).type_code === "treachery")
      q.firstTreachery = { round: s.round, code, open: true };
  },
  cannotCancel: (s, shadow, code) => {
    const q = s.minesMoria;
    if (!q || !code || shadow) return false;
    return q.noCancel === code || stairsTreachery(s, q, code);
  },
  revealedSurge: (s, code) =>
    !!s.minesMoria && stairsTreachery(s, s.minesMoria, code),
  // Darkened Stairway: a canceled 'when revealed' effect reveals a card.
  whenRevealedCancelled: (s) => {
    const n = staged(s, MM.stairway);
    if (!s.minesMoria || !n) return;
    prepend(
      s,
      ...Array.from({ length: n }, () =>
        fx("reveal", { player: firstPlayer(s) }),
      ),
    );
  },
  progress: (s, amount, quest) => {
    const q = s.minesMoria;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return amount;
    let allowed = amount;
    for (const c of capsNow(q, s))
      allowed = Math.min(allowed, Math.max(0, c.limit - c.placed));
    // Brood Mother: no more than 5 progress on the main quest each round.
    if (staged(s, MM.brood)) {
      const placed = q.brood?.round === s.round ? q.brood.placed : 0;
      allowed = Math.min(allowed, Math.max(0, 5 - placed));
    }
    return allowed;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.minesMoria;
    if (!q || quest.id !== mainQuestUnit(s)?.id) return;
    for (const c of capsNow(q, s)) c.placed += amount;
    q.brood = {
      round: s.round,
      placed: (q.brood?.round === s.round ? q.brood.placed : 0) + amount,
    };
  },
  // Abandoned Mines: no progress on it while it is in the staging area.
  locationProgressBlocked: (s, u) =>
    !!s.minesMoria && live(u, MM.mines) && s.staging.some((x) => x.id === u.id),
  // Lightless Passage: no more than 1 progress on each staged location each round.
  locationProgressCapacity: (s, u) => {
    const q = s.minesMoria;
    if (!q || !staged(s, MM.lightless) || !s.staging.some((x) => x.id === u.id))
      return undefined;
    const placed =
      q.lightless.find((x) => x.id === u.id && x.round === s.round)?.amount ??
      0;
    return Math.max(0, 1 - placed);
  },
  locationProgressPlaced: (s, u, amount) => {
    const q = s.minesMoria;
    if (!q || !s.staging.some((x) => x.id === u.id)) return;
    const row = q.lightless.find((x) => x.id === u.id && x.round === s.round);
    if (row) row.amount += amount;
    else q.lightless.push({ id: u.id, round: s.round, amount });
  },
  // A Presence in the Dark and The Fate of Balin, at the beginning of the staging step.
  beginStaging: (s) => {
    const q = s.minesMoria;
    if (!q) return false;
    const first = firstPlayer(s);
    if (at(s, MM.presence)) prepend(s, fx("mmPresence", { player: first }));
    if (at(s, MM.balin)) prepend(s, fx("mmBalin", { player: first }));
    return false;
  },
  // Foul Air: the quest phase ends without resolving the quest.
  resolveQuest: (s) => {
    const q = s.minesMoria;
    if (!q || q.questEnded !== s.round) return false;
    q.questEnded = null;
    log(s, "Foul Air: the quest is not resolved this round.");
    prepend(s, fx("finishQuestPhase", { player: firstPlayer(s) }));
    return true;
  },
  // Hidden Threat: after the players quest successfully.
  questSucceeded: (s) => {
    if (s.minesMoria?.hidden.length)
      prepend(s, fx("mmHiddenReveal", { player: firstPlayer(s) }));
  },
  engaged: (s, u) => {
    const q = s.minesMoria;
    if (!q) return;
    const p = activeSeat(s);
    q.engagedRound.push({ id: u.id, round: s.round });
    if (live(u, MM.broodling))
      prepend(s, fx("mmBroodling", { text: "Spider Broodling", player: p }));
    // Goblin Follower: each staged copy engages the same player.
    const followers = stagedUnits(s, MM.follower).filter((f) => f.id !== u.id);
    if (followers.length)
      prepend(
        s,
        ...followers.map((f) => fx("mmFollower", { target: f.id, player: p })),
      );
  },
  // Goblin Warlord: after it enters play, a 0 cost Goblin enemy.
  enemyEntered: (s, u) => {
    const q = s.minesMoria;
    if (!q || !live(u, MM.warlord) || q.warlords.includes(u.id)) return;
    q.warlords.push(u.id);
    prepend(
      s,
      fx("mmTraitSearch", {
        text: "Goblin Warlord",
        flag: true,
        value: 0,
        player: firstPlayer(s),
      }),
    );
  },
  // The Watcher, defeated: it is flipped over to Chamber of Mazarbul.
  enemyDestination: (s, u, destruction) => {
    if (!s.minesMoria || u.code !== MM.watcher || !destruction) return false;
    prepend(s, fx("mmChamber", { code: MM.watcher, player: firstPlayer(s) }));
    return true;
  },
  shadowResolved: (s, enemy, code) => {
    const c = s.combat;
    if (!s.minesMoria || !c || card(code).shadow || enemy.blanked) return;
    // Savage Werewolf: an additional attack, with no shadow card.
    if (enemy.code === MM.savage) {
      c.mmSavageAttack = true;
      log(
        s,
        "Savage Werewolf is dealt a shadow card with no shadow effect: it makes an additional attack after this one.",
        "danger",
      );
    }
  },
  attackFinished: (s, c, skipped = false) => {
    if (!s.minesMoria) return [];
    const enemy = get(s, c.enemyId);
    if (skipped || !enemy || !c.mmSavageAttack) return [];
    const p = c.attackPlayer ?? activeSeat(s);
    if (engagedWith(s, enemy) === undefined) return [];
    return [
      fx("immediateAttack", { target: enemy.id, player: p, noShadow: true }),
    ];
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.minesMoria || !c || !context.combatDamage) return;
    if (context.enemyId !== c.enemyId) return;
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    if (c.mmProgressOnKill) {
      c.mmProgressOnKill = false;
      effects.push(
        fx("mmBroodling", { text: "Spider Broodling", player: first }),
      );
    }
    if (c.mmLocationOnKill) {
      c.mmLocationOnKill = false;
      effects.push(fx("mmReturnLocation", { text: "Cave In", player: first }));
    }
    if (c.mmReturnOnKill) {
      c.mmReturnOnKill = false;
      c.returnToStaging = true;
    }
    // Hive Guardian: after it attacks and destroys an ally, it returns.
    const enemy = get(s, c.enemyId);
    if (enemy && live(enemy, MM.hive) && card(u.code).type_code === "ally")
      c.returnToStaging = true;
    if (effects.length) prepend(s, ...effects);
  },
  // Great Cave-troll and Goblin Archer, at the end of the encounter phase.
  encounterEnd: (s) => {
    if (!s.minesMoria) return [];
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    const trolls = staged(s, MM.troll);
    if (trolls)
      effects.push(
        fx("mmEachThreat", {
          value: 2 * trolls,
          text: "Great Cave-troll",
          player: first,
        }),
      );
    for (let i = 0; i < staged(s, MM.archer); i++)
      effects.push(
        fx("mmAssignAny", {
          count: enemiesInPlay(s).length,
          text: "Goblin Archer",
          player: first,
        }),
      );
    return effects;
  },
  roundEnd: (s) => {
    const q = s.minesMoria;
    if (!q) return [];
    q.noReady = q.noReady.filter((x) => x.round > s.round);
    q.engagedRound = q.engagedRound.filter((x) => x.round > s.round);
    q.lightless = q.lightless.filter((x) => x.round > s.round);
    q.stagingBonus = [];
    q.caps = [];
    q.zigil = [];
    q.noDamage = [];
    q.massing = [];
    q.signs = null;
    return [];
  },
  travelProblem: (s, u) =>
    s.minesMoria &&
    live(u, MM.chamber) &&
    !(stageNumber(s) === 3 && !s.stageRevealing)
      ? "The players cannot travel to Chamber of Mazarbul unless they are at stage 3B."
      : null,
  travelEffects: (s, u) => {
    if (!s.minesMoria || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === MM.chamber || u.code === MM.lightless)
      return playerOrder(s).map((owner) =>
        fx("mmRandomDiscard", { player: owner }),
      );
    if (u.code === MM.stairway) return [fx("mmStairway", { player: first })];
    if (u.code === MM.guardroom) {
      // X is Ancient Guardroom's threat as the players travel there.
      const x = (card(u.code).threat ?? 0) + u.resources;
      return [
        fx("mmAssignAny", {
          count: x,
          text: "Ancient Guardroom",
          player: first,
        }),
      ];
    }
    if (u.code === MM.well)
      return playerOrder(s).map((owner) =>
        fx("mmExhaustOne", { text: "Fouled Well", player: owner }),
      );
    if (u.code === MM.cavern)
      return [fx("mmBroodling", { text: "Cobwebbed Cavern", player: first })];
    if (u.code === MM.fissure)
      return playerOrder(s).map((owner) => fx("mmFissure", { player: owner }));
    return undefined;
  },
  explored: (s, u, wasActive) => {
    if (!s.minesMoria) return;
    const first = firstPlayer(s);
    // Continuing Eastward: the explored active location reveals a card.
    if (wasActive && at(s, MM.eastward))
      prepend(s, fx("reveal", { player: first }));
    if (u.blanked) return;
    if (u.code === MM.burrow)
      prepend(
        s,
        fx("mmTraitSearch", { text: "Spider Burrow", value: 1, player: first }),
      );
    if (u.code === MM.tunnels)
      prepend(
        s,
        fx("mmTraitSearch", {
          text: "Goblin Tunnels",
          flag: true,
          value: 1,
          player: first,
        }),
      );
    if (u.code === MM.stairs)
      prepend(
        s,
        fx("mmEachThreat", { value: 4, text: "Stairs of Náin", player: first }),
      );
    if (u.code === MM.forge && wasActive)
      prepend(s, fx("mmForge", { player: first }));
  },
  // Ancient Guardroom: after an event is played, it gets a resource.
  eventPlayed: (s) => {
    if (!s.minesMoria) return;
    const rooms = [
      ...s.staging,
      ...(s.activeLocation ? [s.activeLocation] : []),
    ].filter((u) => live(u, MM.guardroom));
    for (const room of rooms) room.resources += 1;
    if (rooms.length)
      log(
        s,
        "Ancient Guardroom: an event was played; 1 resource is placed on Ancient Guardroom.",
        "danger",
      );
  },
  // Narrow Paths: attachments sharing a guarded title cannot be played.
  playProblem: (s, code) => {
    const q = s.minesMoria;
    if (!q || !at(s, MM.narrow) || card(code).type_code !== "attachment")
      return null;
    return q.guarded.some(
      (g) => card(g.attachment.code).name === card(code).name,
    )
      ? `Narrow Paths guards a copy of ${card(code).name}.`
      : null;
  },
  // Narrow Paths: the guarded attachment goes under the stage.
  attachmentLeaves: (s, host, a) => {
    const q = s.minesMoria;
    if (!q?.guarding || q.guarding.id !== a.id) return false;
    q.guarded.push({
      owner: q.guarding.owner,
      attachment: {
        id: a.id,
        code: a.code,
        exhausted: false,
        owner: q.guarding.owner,
      },
    });
    log(
      s,
      `Narrow Paths: ${card(a.code).name} is guarded under the stage, taken from ${name(host)}.`,
      "danger",
    );
    return true;
  },
  // Zigil Mineshaft's Quest Action, triggered by the first player.
  abilityLabel: (code) =>
    code === MM.zigil
      ? "Zigil Mineshaft · Quest Action: raise each player's threat by 1 for -1 threat this phase"
      : undefined,
  abilityProblem: (s, u) => {
    if (!s.minesMoria) return "Not this scenario.";
    if (!live(u, MM.zigil)) return "Zigil Mineshaft's text is blank.";
    if (!["quest", "staging"].includes(s.phase))
      return "Use this Quest Action during the quest phase.";
    if (activeSeat(s) !== firstPlayer(s))
      return "Only the first player can trigger this Action.";
    const reduced = s.minesMoria.zigil
      .filter((x) => x.id === u.id && x.key === phaseKey(s))
      .reduce((n, x) => n + x.amount, 0);
    if (reduced >= (card(u.code).threat ?? 0))
      return "Zigil Mineshaft has no threat left to reduce.";
    return null;
  },
  ability: (s, u) => {
    if (!s.minesMoria || !live(u, MM.zigil)) return false;
    prepend(s, fx("mmZigil", { target: u.id, player: firstPlayer(s) }));
    return true;
  },
  sharedEffect: (e) =>
    [
      ...fellowshipEventSharedKinds("mm"),
      "mmTreacheryDone",
      "mmWestDoor",
      "mmChamber",
      "mmEachThreat",
      "mmHiddenReveal",
    ].includes(e.kind),
};
/** Stairs of Náin: the first treachery revealed this round, while it resolves. */
function stairsTreachery(s: GameState, q: MinesMoriaState, code: string) {
  return (
    staged(s, MM.stairs) > 0 &&
    q.firstTreachery?.round === s.round &&
    q.firstTreachery.open &&
    q.firstTreachery.code === code
  );
}
