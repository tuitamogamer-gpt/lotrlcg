import type {
  Attachment,
  Card,
  Effect,
  GameState,
  Option,
  Unit,
} from "./types";
import { card, name } from "./cards";
import {
  cannotReady,
  choose,
  fx,
  get,
  log,
  prepend,
  requireRule,
  restrictAttachments,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  charactersCommitted,
  damage,
  destroy,
  exhaustCharacter,
  raiseThreat,
  readyCharacter,
} from "./board";
import {
  activeSeat,
  allCharacters,
  attachmentController,
  forOwner,
  globalCharacters,
  ownerOf,
  playerOrder,
  seatIndices,
  seatName,
  seatView,
} from "./table";
import { hasTrait } from "./expansion-passives";
import { playerEffectImmune } from "./player-effect-immunity";
import { engagedEnemies } from "./considered-engagement";
import { canCommit, playTargets } from "./actions";
import { batch4Scenario } from "./batch4-scenarios";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { heirsCanSpendResources } from "./heirs-numenor";
import { fateCannotSearch } from "./fate-numenor";
import { isEnemy } from "./ships";
import { HOBBIT_BILBO } from "./hobbit-codes";

/**
 * The remaining player cards of The Hobbit: Over Hill and Under Hill. Nori,
 * Ori, Fili, Kili, Dori, Cram, Thrór's Map, A Very Good Tale and Foe-hammer
 * were scripted with the Dwarf, collector and Gondor card modules.
 */
export const HOBBIT_PLAYER = {
  thorin: "131002",
  beorn: "131005",
  bofur: "131008",
  gandalf: "131010",
  hood: "131012",
  cleaver: "131016",
  late: "131017",
  mischief: "131018",
  burglar: "131019",
} as const;
const P = HOBBIT_PLAYER;
/** One marker per Expecting Mischief resolved this quest phase. */
const MISCHIEF = `phase:${P.mischief}`;
/** An enemy has already been revealed from the encounter deck this phase. */
const REVEALED = `phase:${P.mischief}:revealed`;

const enabled = (u: { blanked?: boolean; facedown?: boolean }) =>
  !u.blanked && !u.facedown;
const cardHasTrait = (code: string, trait: string) =>
  (card(code).traits ?? "")
    .split(".")
    .some((t) => t.trim().toLowerCase() === trait.toLowerCase());
const canExhaust = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const bilbo = (s: GameState) =>
  globalCharacters(s).find((u) => u.code === HOBBIT_BILBO);

/** Thorin Oakenshield collects 1 additional resource with 5 Dwarf characters. */
export function hobbitPlayerResourceBonus(s: GameState, h: Unit) {
  if (h.code !== P.thorin || h.blanked) return 0;
  const p = seatView(s, ownerOf(s, h));
  return [...p.heroes, ...p.allies].filter((u) => hasTrait(u, "Dwarf"))
    .length >= 5
    ? 1
    : 0;
}
/** Beorn does not exhaust to defend. */
export const hobbitPlayerNoDefenseExhaust = (u: Unit) =>
  u.code === P.beorn && !u.blanked;
/** Gandalf does not exhaust to commit to a quest. */
export const hobbitPlayerNoQuestExhaust = (u: Unit) =>
  u.code === P.gandalf && !u.blanked;

/** Burglar Baggins may be paid from Bilbo's pool by any player. */
export function hobbitPlayerExtraPayers(
  s: GameState,
  c: Card,
  own: Unit[],
): Unit[] {
  if (c.code !== P.burglar) return [];
  const b = bilbo(s);
  return b && !own.some((u) => u.id === b.id) && heirsCanSpendResources(s, b)
    ? [b]
    : [];
}

function readyWeapons(s: GameState) {
  return s.heroes.flatMap((hero) =>
    hero.attachments
      .filter(
        (a) => !a.exhausted && enabled(a) && cardHasTrait(a.code, "Weapon"),
      )
      .map((a) => ({ hero, a })),
  );
}
const cleaverEnemies = (s: GameState) =>
  engagedEnemies(s, activeSeat(s)).filter((u) => isEnemy(u));
function lateTargets(s: GameState) {
  return [...s.heroes, ...s.allies].filter(
    (u) => !u.committed && canExhaust(u) && canCommit(s, u, true),
  );
}
const readyable = (s: GameState, u: Unit) =>
  u.exhausted &&
  !cannotReady(u, s) &&
  !batch4Scenario(s).cannotPlayerReady?.(s) &&
  !batch4Scenario(s).cannotPlayerReadyCharacter?.(s, u) &&
  !playerEffectImmune(s, u, P.hood);
function hoodTargets(s: GameState, host: Unit) {
  return allCharacters(s).filter((u) => u.id !== host.id && readyable(s, u));
}
/** Moving a card is not playing it; its printed restrictions still apply. */
function hoodCanMoveTo(s: GameState, host: Unit, a: Attachment, to: Unit) {
  const before = host.attachments;
  host.attachments = before.filter((x) => x.id !== a.id);
  try {
    return playTargets(
      s,
      { ...host, id: a.id, code: a.code, owner: a.owner },
      { putIntoPlay: true },
    ).some((u) => u.id === to.id);
  } finally {
    host.attachments = before;
  }
}

export function hobbitPlayerTargets(s: GameState, code: string) {
  if (code === P.hood) return allCharacters(s);
  if (code === P.cleaver) return cleaverEnemies(s);
  if (code === P.late) return lateTargets(s);
  return undefined;
}
export function hobbitPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.cleaver) {
    if (!readyWeapons(s).length)
      return "Goblin-cleaver needs a ready Weapon attached to a hero you control.";
    if (!cleaverEnemies(s).length)
      return "Goblin-cleaver needs an enemy engaged with you.";
  }
  if (u.code === P.late && !lateTargets(s).length)
    return "Late Adventurer needs a ready character you control that is not committed and can commit to the quest.";
  if (u.code === P.mischief) {
    if (s.phase !== "quest")
      return "Play Expecting Mischief during the quest phase, before the staging step.";
    if (s.used.includes(REVEALED))
      return "An enemy has already been revealed from the encounter deck this phase.";
  }
  if (u.code === P.burglar) {
    const b = bilbo(s);
    if (!b) return "Burglar Baggins needs Bilbo Baggins in play.";
    if (playerEffectImmune(s, b, P.burglar))
      return "Bilbo Baggins is immune to player card effects.";
  }
  return null;
}
/** Costs printed on the events are paid as they are played. */
export function hobbitPlayerEventCost(s: GameState, u: Unit, target?: string) {
  if (u.code === P.cleaver) {
    const weapons = readyWeapons(s);
    requireRule(
      weapons.length > 0,
      "Exhaust a ready Weapon attached to a hero you control.",
    );
    if (weapons.length === 1) {
      weapons[0].a.exhausted = true;
      return;
    }
    choose(
      s,
      "Goblin-cleaver · Exhaust a Weapon",
      weapons.map(({ hero, a }) => ({
        id: a.id,
        code: a.code,
        label: `${card(a.code).name} on ${name(hero)}`,
        effects: [
          fx("hobbitPlayerCleaverCost", {
            source: a.id,
            target: hero.id,
            player: activeSeat(s),
          }),
        ],
      })),
      "Exhaust a Weapon card attached to a hero you control.",
    );
  }
  if (u.code === P.late) {
    const t = get(s, target);
    requireRule(
      t && lateTargets(s).some((x) => x.id === t.id),
      "Choose a ready character you control that is not committed to the quest.",
    );
    requireRule(exhaustCharacter(s, t!), "This character cannot exhaust.");
  }
}
export function hobbitPlayerEvent(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  switch (code) {
    case P.cleaver: {
      const enemy = get(s, target);
      if (
        enemy &&
        cleaverEnemies(s).some((u) => u.id === enemy.id) &&
        !playerEffectImmune(s, enemy, code)
      )
        damage(s, enemy.id, hasTrait(enemy, "Orc") ? 3 : 2);
      return true;
    }
    case P.late: {
      const u = get(s, target);
      if (
        u &&
        s.heroes.concat(s.allies).some((x) => x.id === u.id) &&
        !u.committed &&
        !playerEffectImmune(s, u, code) &&
        canCommit(s, u, true)
      ) {
        u.committed = true;
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
        log(s, `Late Adventurer commits ${name(u)} to the quest.`, "good");
        charactersCommitted(s, [u]);
      }
      return true;
    }
    case P.mischief:
      s.used.push(MISCHIEF);
      log(
        s,
        "Expecting Mischief: the first enemy revealed from the encounter deck this phase takes 2 damage.",
        "good",
      );
      return true;
    case P.burglar: {
      const b = bilbo(s);
      if (b && !playerEffectImmune(s, b, code)) {
        b.tempWill = (b.tempWill ?? 0) + 2;
        b.tempAttack = (b.tempAttack ?? 0) + 2;
        b.tempDefense = (b.tempDefense ?? 0) + 2;
        log(
          s,
          "Burglar Baggins: Bilbo Baggins gets +2 willpower, attack and defense until the end of the phase.",
          "good",
        );
      }
      return true;
    }
    default:
      return false;
  }
}

/**
 * Expecting Mischief: each resolved copy deals 2 damage to the first enemy
 * revealed from the encounter deck this quest phase. Revealing an enemy also
 * closes the event's play window ("before the staging step").
 */
export function hobbitPlayerEnemyRevealed(s: GameState, enemy: Unit) {
  if (!["quest", "staging"].includes(s.phase)) return;
  let copies = 0,
    inHand = false;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      copies += s.used.filter((k) => k === MISCHIEF).length;
      inHand ||= s.hand.some((h) => h.code === P.mischief);
    });
  if (!copies && !inHand) return;
  for (const p of seatIndices(s))
    forOwner(s, p, () => {
      s.used = s.used.filter((k) => k !== MISCHIEF);
      if (!s.used.includes(REVEALED)) s.used.push(REVEALED);
    });
  prepend(
    s,
    ...Array.from({ length: copies }, () =>
      fx("hobbitPlayerMischief", { target: enemy.id, value: 2 }),
    ),
  );
}

/** Gandalf's Forced effect at the end of each refresh phase. */
export function hobbitPlayerRefreshEnd(s: GameState) {
  const order = playerOrder(s);
  prepend(
    s,
    ...globalCharacters(s)
      .filter((u) => u.code === P.gandalf && !u.blanked)
      .sort(
        (a, b) => order.indexOf(ownerOf(s, a)) - order.indexOf(ownerOf(s, b)),
      )
      .map((u) =>
        fx("hobbitPlayerGandalf", { target: u.id, player: ownerOf(s, u) }),
      ),
  );
}

export const hobbitPlayerAbilityLabel = (code: string) =>
  code === P.bofur
    ? "Bofur · Exhaust to search the top 5 cards for a Weapon"
    : code === P.hood
      ? "Spare Hood and Cloak · Ready another character"
      : undefined;
export function hobbitPlayerAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): string | undefined {
  if (attachmentId) {
    const a = u.attachments.find((x) => x.id === attachmentId);
    if (!a || a.code !== P.hood) return undefined;
    if (!enabled(a)) return "Spare Hood and Cloak's text is inactive.";
    if (attachmentController(s, u, a) !== activeSeat(s))
      return "You do not control Spare Hood and Cloak.";
    if (a.exhausted) return "Spare Hood and Cloak must be ready.";
    if (!canExhaust(u)) return "The attached character must be ready.";
    if (!hoodTargets(s, u).length)
      return "Choose another exhausted character that can be readied.";
    return undefined;
  }
  if (u.code !== P.bofur) return undefined;
  if (u.blanked) return "Bofur's printed text is blank.";
  if (ownerOf(s, u) !== activeSeat(s)) return "You do not control Bofur.";
  if (!canExhaust(u)) return "Bofur must be ready.";
  if (!s.deck.length) return "Your deck has no cards to search.";
  if (fateCannotSearch(s))
    return "An encounter effect prevents searching your deck.";
  return undefined;
}
export function useHobbitPlayerAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
): boolean {
  const a = attachmentId
    ? u.attachments.find((x) => x.id === attachmentId)
    : undefined;
  if (attachmentId ? a?.code !== P.hood : u.code !== P.bofur) return false;
  const problem = hobbitPlayerAbilityProblem(s, u, attachmentId);
  requireRule(!problem, problem ?? "");
  const player = activeSeat(s);
  if (a) {
    a.exhausted = true;
    requireRule(
      exhaustCharacter(s, u),
      "The attached character cannot exhaust.",
    );
    choose(
      s,
      "Spare Hood and Cloak · Ready another character",
      hoodTargets(s, u).map((t) => ({
        id: t.id,
        code: t.code,
        label: `${name(t)}${s.table ? ` · ${seatName(s, ownerOf(s, t))}` : ""}`,
        effects: [
          fx("hobbitPlayerHood", {
            source: a.id,
            target: u.id,
            text: t.id,
            player,
          }),
        ],
      })),
      "Ready the chosen character, then attach Spare Hood and Cloak to it.",
    );
    return true;
  }
  requireRule(exhaustCharacter(s, u), "Bofur cannot exhaust.");
  const options: Option[] = s.deck.slice(0, 5).flatMap((code, index) =>
    card(code).type_code === "attachment" && cardHasTrait(code, "Weapon")
      ? [
          {
            id: `card-${index}`,
            label: card(code).name,
            code,
            effects: [
              fx("hobbitPlayerBofurTake", { code, value: index, player }),
            ],
          },
        ]
      : [],
  );
  choose(
    s,
    "Bofur · Top 5 cards of your deck",
    [
      ...options,
      {
        id: "none",
        label: options.length
          ? "Take no Weapon and shuffle"
          : "No Weapon attachment · Shuffle the cards back",
        effects: [fx("hobbitPlayerBofurTake", { value: -1, player })],
      },
    ],
    `Searched: ${s.deck
      .slice(0, 5)
      .map((code) => card(code).name)
      .join(", ")}.`,
  );
  return true;
}

export function hobbitPlayerEffect(s: GameState, e: Effect): boolean {
  if (!e.kind.startsWith("hobbitPlayer")) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "hobbitPlayerCleaverCost": {
      const a = u?.attachments.find((x) => x.id === e.source);
      requireRule(
        u &&
          a &&
          readyWeapons(s).some((w) => w.a.id === a.id && w.hero.id === u.id),
        "Exhaust a ready Weapon attached to a hero you control.",
      );
      a!.exhausted = true;
      return true;
    }
    case "hobbitPlayerMischief":
      if (
        u &&
        isEnemy(u) &&
        !playerEffectImmune(s, u, P.mischief) &&
        damage(s, u.id, e.value ?? 2)
      )
        log(s, `Expecting Mischief deals 2 damage to ${name(u)}.`, "good");
      return true;
    case "hobbitPlayerGandalf":
      if (
        u &&
        u.code === P.gandalf &&
        !u.blanked &&
        allCharacters(s).some((x) => x.id === u.id)
      )
        choose(
          s,
          "Gandalf · Forced: discard Gandalf from play",
          [
            {
              id: "keep",
              label: "Raise your threat by 2 to keep Gandalf",
              code: u.code,
              effects: [
                fx("hobbitPlayerGandalfKeep", {
                  target: u.id,
                  player: e.player,
                }),
              ],
            },
            {
              id: "discard",
              label: "Discard Gandalf from play",
              code: u.code,
              effects: [
                fx("hobbitPlayerGandalfDiscard", {
                  target: u.id,
                  player: e.player,
                }),
              ],
            },
          ],
          "At the end of the refresh phase Gandalf is discarded unless his controller raises their threat by 2 to cancel the effect.",
        );
      return true;
    case "hobbitPlayerGandalfKeep":
      if (u && allCharacters(s).some((x) => x.id === u.id)) {
        raiseThreat(s, 2, "cost");
        log(s, "Gandalf stays: his controller raises their threat by 2.");
      }
      return true;
    case "hobbitPlayerGandalfDiscard":
      if (u && allCharacters(s).some((x) => x.id === u.id)) {
        destroy(s, u, false);
        log(s, "Gandalf is discarded at the end of the refresh phase.");
      }
      return true;
    case "hobbitPlayerHood": {
      const to = get(s, e.text);
      if (!u || !to || !allCharacters(s).some((x) => x.id === to.id))
        return true;
      if (readyable(s, to)) readyCharacter(s, to);
      const a = u.attachments.find(
        (x) => x.id === e.source && x.code === P.hood,
      );
      if (a && hoodCanMoveTo(s, u, a, to)) {
        u.attachments = u.attachments.filter((x) => x.id !== a.id);
        to.attachments.push(a);
        restrictAttachments(s, to);
        log(s, `Spare Hood and Cloak moves to ${name(to)}.`);
      }
      return true;
    }
    case "hobbitPlayerBofurTake": {
      const index = e.value ?? -1;
      if (index >= 0) {
        requireRule(
          index < 5 &&
            s.deck[index] === e.code &&
            card(e.code!).type_code === "attachment" &&
            cardHasTrait(e.code!, "Weapon"),
          "Choose a Weapon attachment from the original top five cards.",
        );
        s.hand.push(takePlayerDeck(s, index));
      }
      shuffle(s, s.deck);
      return true;
    }
    default:
      return false;
  }
}
