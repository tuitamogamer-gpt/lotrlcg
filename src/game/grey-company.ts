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
  shuffle,
  spendResources,
} from "./core";
import {
  damage,
  destroy,
  enemyAddedToStaging,
  enterEnemyEngaged,
  questDefeated,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { effectiveKeyword, hasTrait } from "./expansion-passives";
import {
  GC,
  GC_HIGH_THREAT,
  GC_STONE_ENGAGEMENT,
  GC_STONE_PROGRESS,
  GREY_COMPANY_RECIPES,
  gcThreats,
  greyCompanyStageInfo,
  isGcOathbreaker,
} from "./grey-company-support";
export * from "./grey-company-support";

/**
 * The Passing of the Grey Company, the first scenario of The Flame of the
 * West. The first player controls the Fellowship Aragorn; each player begins
 * Overcome by Fear, whose copies return to the threat dials with the
 * encounter cards' choices, and the Undead of Dunharrow are Phantom: the
 * damage of their attacks raises the defending player's threat instead.
 * Through the Paths of the Dead to The Stone of Erech, where the players win
 * by exploring it.
 */
const TREACHERIES: readonly string[] = [
  GC.noTurning,
  GC.whispers,
  GC.chill,
  GC.shut,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isLocation = (code: string) => card(code).type_code === "location";
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string, plural = `${base}s`) =>
  s.table ? plural : base;
const players = (s: GameState) => globalPlayerOrder(s).length;
/** The current quest's text is in effect (not while a stage resolves its When Revealed effects). */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.greyCompany?.advancing;
const at = (s: GameState, quest: string) =>
  s.greyCompany?.currentQuest === quest && stageLive(s);
const stagingCount = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
/** The Stone of Erech is the active location (3B's effects apply). */
const stoneActive = (s: GameState) =>
  !!s.activeLocation && live(s.activeLocation, GC.stone);
const isOathbreaker = (u: Unit) => isEnemy(u) && hasTrait(u, "Oathbreaker");
/** Phantom: the keyword, unless 3B or Faithless Dead's shadow removes it. */
export function gcPhantom(s: GameState, enemy: Unit | undefined) {
  if (!s.greyCompany || !enemy || !isEnemy(enemy)) return false;
  if (!effectiveKeyword(enemy, "Phantom")) return false;
  if (at(s, GC.following) && stoneActive(s) && isOathbreaker(enemy))
    return false;
  return !(s.combat?.enemyId === enemy.id && s.combat.gcNoPhantom);
}

// ---------------------------------------------------------------------------
// Overcome by Fear.

/** The Overcome by Fear attached to a player's threat dial. */
const fearOn = (s: GameState, p: number) =>
  seatView(s, p).threatAttachments?.find((a) => a.code === GC.fear);
export const gcFear = (s: GameState, p: number) => !!fearOn(s, p);
/** "Attach a set aside Overcome by Fear to your threat dial": limit 1 per threat dial. */
export const gcCanAttachFear = (s: GameState, p: number) =>
  !!s.greyCompany && s.greyCompany.fearAside > 0 && !fearOn(s, p);
function attachFear(s: GameState, p: number, text: string) {
  const q = s.greyCompany;
  if (!q || !gcCanAttachFear(s, p)) return false;
  q.fearAside--;
  const fear = make(s, GC.fear);
  forOwner(s, p, () =>
    (s.threatAttachments ??= []).push({
      id: fear.id,
      code: GC.fear,
      exhausted: false,
    }),
  );
  log(
    s,
    `${text}: a set aside Overcome by Fear is attached to ${s.table ? `${seatName(s, p)}'s` : "your"} threat dial.`,
    "danger",
  );
  return true;
}
function detachFear(s: GameState, p: number, text: string) {
  const q = s.greyCompany;
  const fear = fearOn(s, p);
  if (!q || !fear) return false;
  forOwner(s, p, () => {
    s.threatAttachments = (s.threatAttachments ?? []).filter(
      (a) => a.id !== fear.id,
    );
    if (!s.threatAttachments.length) delete s.threatAttachments;
  });
  q.fearAside++;
  log(
    s,
    `${text}: Overcome by Fear is detached from ${s.table ? `${seatName(s, p)}'s` : "your"} threat dial and set aside, out of play.`,
    "good",
  );
  return true;
}
/** The player's own Fellowship heroes with a resource to spend (Aragorn). */
const ownFellowship = (s: GameState, p: number) =>
  seatView(s, p).heroes.filter(
    (u) => card(u.code).sphere_code === "fellowship" && u.resources > 0,
  );
const fellowshipPayer = (s: GameState) =>
  playerOrder(s)
    .flatMap((p) => ownFellowship(s, p))
    .at(0);
const fearOption = (p: number, text: string): Option => ({
  id: "fear",
  label: "Attach a set aside Overcome by Fear to your threat dial",
  effects: [fx("gcAttachFear", { text, player: p })],
});
/**
 * An "either attach a set aside Overcome by Fear, or …" choice: an option is
 * offered only when it can change the game; with one left it resolves alone.
 */
function either(
  s: GameState,
  p: number,
  title: string,
  text: string,
  options: Option[],
  description: string,
  fear = true,
) {
  const available = [
    ...(fear && gcCanAttachFear(s, p) ? [fearOption(p, text)] : []),
    ...options,
  ];
  if (!available.length) {
    log(s, `${text}: nothing can be resolved.`);
    return;
  }
  // With one option left it resolves alone; its effect logs what happens.
  if (available.length === 1) {
    prepend(s, ...available[0].effects);
    return;
  }
  forOwner(s, p, () =>
    choose(
      s,
      `${title} · Choose one${seatLabel(s, p)}`,
      available,
      description,
    ),
  );
}
const allyOption = (s: GameState, p: number, text: string): Option[] =>
  seatView(s, p).allies.some(isAlly)
    ? [
        {
          id: "ally",
          label: "Discard an ally you control",
          effects: [fx("gcDiscardAlly", { text, player: p })],
        },
      ]
    : [];

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupGreyCompany(s: GameState) {
  const r = GREY_COMPANY_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.staging = [];
  s.activeLocation = null;
  // 1A: each player attaches a copy of Overcome by Fear; the others leave the game.
  const copies = section("sharedStagingArea").length;
  const order = globalPlayerOrder(s);
  for (const p of order) {
    const fear = make(s, GC.fear);
    forOwner(s, p, () => {
      s.threatAttachments = [{ id: fear.id, code: GC.fear, exhausted: false }];
    });
  }
  s.greyCompany = {
    currentQuest: GC.door,
    advancing: false,
    resolving: [],
    setAside: section("sharedSetAside"),
    fearAside: 0,
    fearRemoved: Math.max(0, copies - order.length),
  };
  log(
    s,
    `The Forbidden Door: The Stone of Erech and Army of the Dead are set aside, out of play; each player attaches a copy of Overcome by Fear to his threat dial, and the other ${Math.max(0, copies - order.length)} cop${copies - order.length === 1 ? "y is" : "ies are"} removed from the game.`,
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.greyCompany;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 1B has no quest points; 3B is won by exploring The Stone of Erech.
  if (q.currentQuest !== GC.paths) return true;
  const goal = greyCompanyStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  q.advancing = true;
  prepend(s, fx("gcDefeat", { player: firstPlayer(s) }));
  return true;
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.greyCompany;
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
    fx("gcTreachery", { code, source: u.id, player }),
    fx("gcTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    case GC.noTurning:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("gcNoTurning", { player })),
      );
      return;
    case GC.whispers:
      either(
        s,
        p,
        "Whispers in the Dark",
        "Whispers in the Dark",
        [
          {
            id: "weaken",
            label:
              "Each character you control gets -1 willpower, -1 attack and -1 defense until the end of the round",
            effects: [fx("gcWhispers", { player: p })],
          },
        ],
        "Peril. When Revealed: either attach a set aside Overcome by Fear to your threat dial, or each character you control gets -1 willpower, -1 attack and -1 defense until the end of the round.",
      );
      return;
    case GC.chill:
      prepend(s, ...playerOrder(s).map((player) => fx("gcChill", { player })));
      return;
    case GC.shut:
      either(
        s,
        p,
        "The Way is Shut",
        "The Way is Shut",
        [
          {
            id: "shut",
            label:
              "Progress cannot be placed on the current quest until the end of the round",
            effects: [fx("gcShut", { player: p })],
          },
        ],
        "Peril. When Revealed: either attach a set aside Overcome by Fear to your threat dial, or progress cannot be placed on the current quest until the end of the round.",
      );
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.greyCompany) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    case GC.haunted:
      either(
        s,
        p,
        "Haunted Path",
        "Haunted Path",
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [
              fx("gcRaise", { value: 2, text: "Haunted Path", player: p }),
            ],
          },
          ...(enemy
            ? [
                {
                  id: "return",
                  label:
                    "Return the attacking enemy to the staging area after this attack",
                  effects: [fx("gcReturnAfter", { player: p })],
                },
              ]
            : []),
        ],
        "Shadow: either raise your threat by 2, or return the attacking enemy to the staging area after this attack.",
        false,
      );
      return true;
    case GC.deadMan:
      c.attackBonus += 1;
      log(
        s,
        "Dead Man of Dunharrow: the attacking enemy gets +1 attack.",
        "danger",
      );
      return true;
    case GC.chill: {
      if (seatView(s, p).threat < GC_HIGH_THREAT) {
        log(
          s,
          `Blood Runs Chill: ${who(s, p)} ${verb(s, "have", "has")} a threat below ${GC_HIGH_THREAT}.`,
        );
        return true;
      }
      const q = s.greyCompany;
      const ids = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
      if (!ids.length) {
        log(s, "Blood Runs Chill: the attack is undefended.");
        return true;
      }
      q.chilled = {
        round: s.round,
        ids: [...(q.chilled?.round === s.round ? q.chilled.ids : []), ...ids],
      };
      log(
        s,
        "Blood Runs Chill: the defending character cannot ready until the end of the round.",
        "danger",
      );
      return true;
    }
    case GC.noTurning:
      either(
        s,
        p,
        "No Turning Back",
        "No Turning Back",
        [
          {
            id: "attack",
            label:
              "The attacking enemy makes an additional attack after this one",
            effects: [fx("gcExtraAttack", { player: p })],
          },
        ],
        "Shadow: either attach a set aside Overcome by Fear to your threat dial, or the attacking enemy makes an additional attack after this one.",
      );
      return true;
    case GC.whispers: {
      const undefended = !(c.defenderIds?.length || c.defenderId);
      c.attackBonus += undefended ? 2 : 1;
      log(
        s,
        `Whispers in the Dark: the attacking enemy gets +${undefended ? 2 : 1} attack${undefended ? " (the attack is undefended)" : ""}.`,
        "danger",
      );
      return true;
    }
    case GC.faithless:
      c.attackBonus += 1;
      c.gcNoPhantom = true;
      log(
        s,
        "Faithless Dead: the attacking enemy gets +1 attack and loses the Phantom keyword for this attack.",
        "danger",
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Searches.

/** The locations in the encounter deck whose titles no player has chosen yet. */
function pathsLocations(s: GameState, chosen: readonly string[]) {
  const names = new Set(chosen.map((c) => card(c).name));
  return [...new Set(s.encounterDeck.filter(isLocation))].filter(
    (c) => !names.has(card(c).name),
  );
}
const oathbreakerOptions = (s: GameState, kind: string, p: number) => {
  const options: Option[] = [];
  for (const zone of ["deck", "discard"] as const)
    for (const code of [
      ...new Set(
        (zone === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
          isGcOathbreaker,
        ),
      ),
    ])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
        effects: [fx(kind, { code, text: zone, player: p })],
      });
  return options;
};
function takeFrom(s: GameState, zone: string | undefined, code: string) {
  const pile = zone === "discard" ? s.encounterDiscard : s.encounterDeck;
  const i = pile.lastIndexOf(code);
  if (i < 0) return false;
  pile.splice(i, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Effects.

export function greyCompanyEffect(s: GameState, e: Effect): boolean {
  const q = s.greyCompany;
  if (!q || !e.kind.startsWith("gc")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...s.staging, ...globalEngaged(s)].find((x) => x.id === e.target))
    : undefined;
  switch (e.kind) {
    case "gcTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "gcTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // 1B When Revealed: 1 resource on each hero for 3 threat.
    case "gcDoorOffer": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `The Forbidden Door · Add resources${seatLabel(s, p)}`,
          [
            {
              id: "resources",
              label: `Add 1 resource to each hero you control (${heroes.length}) and raise your threat by 3`,
              effects: [fx("gcDoorResources", { player: p })],
            },
            { id: "skip", label: "Decline", effects: [] },
          ],
          "When Revealed: each player may add 1 resource to the resource pool of each hero he controls. Each player who does so must raise his threat by 3.",
        ),
      );
      return true;
    }
    case "gcDoorResources":
      forOwner(s, p, () => {
        for (const h of s.heroes) h.resources += 1;
        raiseThreat(s, 3, "quest-card");
      });
      log(
        s,
        `The Forbidden Door: ${who(s, p)} ${verb(s, "add")} 1 resource to each hero ${s.table ? "he controls" : "you control"} and ${verb(s, "raise")} ${s.table ? "his" : "your"} threat by 3.`,
        "danger",
      );
      return true;
    // 1B Forced: at the end of the planning phase.
    case "gcDiscardHands":
      for (const player of playerOrder(s))
        forOwner(s, player, () => {
          const count = s.hand.length;
          s.discard.push(...s.hand.map((x) => x.code));
          s.hand = [];
          if (count)
            log(
              s,
              `The Forbidden Door: ${who(s, player)} ${verb(s, "discard")} all ${count} card${count === 1 ? "" : "s"} in ${s.table ? "his" : "your"} hand.`,
              "danger",
            );
        });
      return true;
    case "gcDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(q.currentQuest === GC.paths ? "gcStageThree" : "gcStageTwo", {
          player: first,
        }),
      );
      return true;
    }
    case "gcStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = GC.paths;
      s.stageRevealing = true;
      log(s, "The Paths of the Dead begin.", "chapter");
      prepend(
        s,
        ...playerOrder(s).map((player) =>
          fx("gcPathsSearch", { ids: [], player }),
        ),
        fx("gcShuffle", { text: "The Paths of the Dead", player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    // 2A When Revealed: each player searches for a different location.
    case "gcPathsSearch": {
      const chosen = q.searched ?? [];
      const options = pathsLocations(s, chosen).map((code) => ({
        id: code,
        code,
        label: card(code).name,
        effects: [fx("gcPathsTake", { code, player: p })],
      }));
      if (!options.length) {
        log(
          s,
          `The Paths of the Dead: no other location remains in the encounter deck for ${who(s, p)}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Paths of the Dead · Search the encounter deck for a location${seatLabel(s, p)}`,
          options,
          "When Revealed: each player searches the encounter deck for a different location and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "gcPathsTake": {
      if (!e.code || !takeFrom(s, "deck", e.code)) return true;
      q.searched = [...(q.searched ?? []), e.code];
      const location = make(s, e.code);
      s.staging.push(location);
      log(
        s,
        `The Paths of the Dead: ${who(s, p)} ${verb(s, "add")} ${card(e.code).name} to the staging area.`,
        "danger",
      );
      return true;
    }
    case "gcShuffle":
      delete q.searched;
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.text ?? "The Passing of the Grey Company"}: the encounter deck is shuffled.`,
      );
      return true;
    case "gcStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = GC.following;
      delete q.noPlay;
      s.stageRevealing = true;
      log(s, "The Dead are Following.", "chapter");
      prepend(
        s,
        fx("gcFollowingRevealed", { player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    // 3A When Revealed: The Stone of Erech and Army of the Dead join the staging area.
    case "gcFollowingRevealed": {
      for (const code of [GC.stone, GC.army]) {
        const i = q.setAside.indexOf(code);
        if (i < 0) continue;
        q.setAside.splice(i, 1);
        const unit = make(s, code);
        s.staging.push(unit);
        if (code === GC.army) enemyAddedToStaging(s, unit);
      }
      log(
        s,
        "The Dead are Following: The Stone of Erech and Army of the Dead are added to the staging area.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s)
          .filter((player) => gcFear(s, player))
          .map((player) => fx("gcDetachOffer", { player })),
      );
      return true;
    }
    case "gcDetachOffer":
      if (!gcFear(s, p)) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `The Dead are Following · Overcome by Fear${seatLabel(s, p)}`,
          [
            {
              id: "detach",
              label:
                "Raise your threat by 3 to detach Overcome by Fear and set it aside",
              effects: [fx("gcDetachForThreat", { player: p })],
            },
            { id: "skip", label: "Keep Overcome by Fear", effects: [] },
          ],
          "When Revealed: each player may raise his threat by 3 to detach Overcome by Fear from his threat dial and set it aside, out of play.",
        ),
      );
      return true;
    case "gcDetachForThreat":
      if (!gcFear(s, p)) return true;
      forOwner(s, p, () => raiseThreat(s, 3, "quest-card"));
      log(
        s,
        `The Dead are Following: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "his" : "your"} threat by 3.`,
        "danger",
      );
      detachFear(s, p, "The Dead are Following");
      return true;
    // 2B Forced: at the beginning of the planning phase.
    case "gcPathsChoice":
      forOwner(s, p, () =>
        choose(
          s,
          `The Paths of the Dead · Choose one${seatLabel(s, p)}`,
          [
            {
              id: "threat",
              label: "Raise your threat by 1",
              effects: [
                fx("gcRaise", {
                  value: 1,
                  text: "The Paths of the Dead",
                  player: p,
                }),
              ],
            },
            {
              id: "noplay",
              label: "You cannot play cards this phase",
              effects: [fx("gcNoPlay", { player: p })],
            },
          ],
          "Forced: at the beginning of the planning phase each player must choose: either raise your threat by 1, or you cannot play cards this phase.",
        ),
      );
      return true;
    case "gcNoPlay":
      q.noPlay = {
        round: s.round,
        players: [...(q.noPlay?.round === s.round ? q.noPlay.players : []), p],
      };
      log(
        s,
        `The Paths of the Dead: ${who(s, p)} cannot play cards this phase.`,
        "danger",
      );
      return true;
    case "gcRaise": {
      const value = e.value ?? 0;
      forOwner(s, p, () => raiseThreat(s, value, "encounter"));
      log(
        s,
        `${e.text ?? "The Passing of the Grey Company"}: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "his" : "your"} threat by ${value}.`,
        "danger",
      );
      return true;
    }
    case "gcRaiseEach":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text ?? "The Passing of the Grey Company"}: each player raises his threat by ${e.value ?? 0}.`,
        "danger",
      );
      return true;
    // Overcome by Fear.
    case "gcAttachFear":
      if (!attachFear(s, p, e.text ?? "Overcome by Fear"))
        log(
          s,
          `${e.text ?? "Overcome by Fear"}: no Overcome by Fear can be attached.`,
        );
      return true;
    case "gcFearRound": {
      // Forced: at the end of the round, raise your threat by 1; then the
      // player may spend 1 Fellowship resource to set it aside.
      const fear = fearOn(s, p);
      if (!fear || fear.blanked) return true;
      forOwner(s, p, () => raiseThreat(s, 1, "encounter"));
      log(
        s,
        `Overcome by Fear: ${who(s, p)} ${verb(s, "raise")} ${s.table ? "his" : "your"} threat by 1.`,
        "danger",
      );
      const payer = ownFellowship(s, p)[0];
      if (!payer) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Overcome by Fear · Spend 1 Fellowship resource${seatLabel(s, p)}`,
          [
            {
              id: "detach",
              label: `Spend 1 resource from ${name(payer)} to detach Overcome by Fear and set it aside`,
              effects: [fx("gcFearSpend", { source: payer.id, player: p })],
            },
            { id: "skip", label: "Keep Overcome by Fear", effects: [] },
          ],
          "Forced: at the end of the round, raise your threat by 1. Then, you may spend 1 Fellowship resource to detach Overcome by Fear and set it aside, out of play.",
        ),
      );
      return true;
    }
    case "gcFearSpend": {
      const payer = e.source ? get(s, e.source) : undefined;
      if (!payer || payer.resources < 1 || !gcFear(s, p)) return true;
      forOwner(s, ownerOf(s, payer), () => spendResources(s, payer, 1));
      detachFear(
        s,
        p,
        `Overcome by Fear (${name(payer)} spends 1 Fellowship resource)`,
      );
      return true;
    }
    case "gcDiscardAlly": {
      const allies = seatView(s, p).allies.filter(isAlly);
      if (!allies.length) {
        log(s, `${e.text}: ${who(s, p)} ${verb(s, "control")} no ally.`);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text} · Discard an ally you control${seatLabel(s, p)}`,
          allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: name(a),
            effects: [
              fx("gcAllyGone", { target: a.id, text: e.text, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "gcAllyGone":
      if (u) {
        log(s, `${e.text}: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    // Treacheries.
    case "gcNoTurning":
      either(
        s,
        p,
        "No Turning Back",
        "No Turning Back",
        allyOption(s, p, "No Turning Back"),
        "When Revealed: each player must choose: either attach a set aside Overcome by Fear to your threat dial, or discard an ally you control.",
      );
      return true;
    case "gcWhispers": {
      const characters = [
        ...seatView(s, p).heroes,
        ...seatView(s, p).allies,
      ].filter(isCharacter);
      q.whispered = {
        round: s.round,
        ids: [
          ...(q.whispered?.round === s.round ? q.whispered.ids : []),
          ...characters.map((c) => c.id),
        ],
      };
      log(
        s,
        `Whispers in the Dark: each character ${s.table ? `${seatName(s, p)} controls` : "you control"} (${characters.length}) gets -1 willpower, -1 attack and -1 defense until the end of the round.`,
        "danger",
      );
      return true;
    }
    case "gcChill": {
      if (seatView(s, p).threat < GC_HIGH_THREAT) return true;
      const exhausted = [
        ...seatView(s, p).heroes,
        ...seatView(s, p).allies,
      ].filter((c) => isCharacter(c) && c.exhausted);
      log(
        s,
        exhausted.length
          ? `Blood Runs Chill: ${who(s, p)} ${verb(s, "deal")} 1 damage to each exhausted character ${s.table ? "he controls" : "you control"} (${exhausted.map((c) => name(c)).join(", ")}).`
          : `Blood Runs Chill: ${who(s, p)} ${verb(s, "control")} no exhausted character.`,
        exhausted.length ? "danger" : undefined,
      );
      forOwner(s, p, () => {
        for (const c of exhausted) damage(s, c.id, 1, {});
      });
      return true;
    }
    case "gcShut":
      q.shutRound = s.round;
      log(
        s,
        "The Way is Shut: progress cannot be placed on the current quest until the end of the round.",
        "danger",
      );
      return true;
    case "gcReturnAfter":
      if (s.combat) s.combat.returnToStaging = true;
      log(
        s,
        "Haunted Path: the attacking enemy returns to the staging area after this attack.",
      );
      return true;
    case "gcExtraAttack":
      if (s.combat) s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      log(
        s,
        "No Turning Back: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    // Enemies.
    case "gcGhosts":
      either(
        s,
        p,
        "Ghosts of Men",
        "Ghosts of Men",
        u && [...s.staging, ...globalEngaged(s)].some((x) => x.id === u.id)
          ? [
              {
                id: "attack",
                label: "Ghosts of Men makes an immediate attack against you",
                effects: [fx("immediateAttack", { target: u.id, player: p })],
              },
            ]
          : [],
        "Peril. When Revealed: either attach a set aside Overcome by Fear to your threat dial, or Ghosts of Men makes an immediate attack against you.",
      );
      return true;
    case "gcFaithless":
      forOwner(s, p, () =>
        choose(
          s,
          `Faithless Dead · Choose one${seatLabel(s, p)}`,
          [
            {
              id: "threat",
              label: "Raise each player's threat by 2",
              effects: [
                fx("gcRaiseEach", { value: 2, text: "Faithless Dead" }),
              ],
            },
            {
              id: "reveal",
              label: "Reveal an additional encounter card",
              effects: [fx("reveal", { player: p })],
            },
          ],
          "Peril. When Revealed: either raise each player's threat by 2, or reveal an additional encounter card.",
        ),
      );
      return true;
    case "gcDeadMan":
      either(
        s,
        p,
        "Dead Man of Dunharrow",
        "Dead Man of Dunharrow",
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [
              fx("gcRaise", {
                value: 2,
                text: "Dead Man of Dunharrow",
                player: p,
              }),
            ],
          },
        ],
        "Forced: after Dead Man of Dunharrow engages you, either attach a set aside Overcome by Fear to your threat dial, or raise your threat by 2.",
      );
      return true;
    case "gcHost":
      either(
        s,
        p,
        "Shadow Host",
        "Shadow Host",
        u && globalEngaged(s).some((x) => x.id === u.id)
          ? [
              {
                id: "attack",
                label: "Shadow Host makes an immediate attack",
                effects: [fx("immediateAttack", { target: u.id, player: p })],
              },
            ]
          : [],
        "Forced: when Shadow Host engages you, either attach a set aside Overcome by Fear to your threat dial, or it makes an immediate attack.",
      );
      return true;
    case "gcArmy":
      either(
        s,
        p,
        "Army of the Dead",
        "Army of the Dead",
        allyOption(s, p, "Army of the Dead"),
        "Forced: when Army of the Dead attacks, you must either attach a set aside Overcome by Fear to your threat dial, or discard an ally you control.",
      );
      return true;
    // Locations.
    case "gcSpendFellowship": {
      const payer = fellowshipPayer(s);
      if (!payer) return true;
      forOwner(s, ownerOf(s, payer), () => spendResources(s, payer, 1));
      log(
        s,
        `${name(payer)} spends 1 Fellowship resource to travel to ${e.text}.`,
      );
      return true;
    }
    case "gcTryst": {
      const options = oathbreakerOptions(s, "gcTrystTake", p);
      if (!options.length) {
        log(
          s,
          "Trysting Place: no Oathbreaker enemy is in the encounter deck or discard pile.",
        );
        prepend(s, fx("gcShuffle", { text: "Trysting Place", player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Trysting Place · Search for an Oathbreaker enemy${seatLabel(s, p)}`,
          options,
          "Travel: the first player searches the encounter deck and discard pile for an Oathbreaker enemy and puts it into play engaged with him. Shuffle the encounter deck.",
        ),
      );
      return true;
    }
    case "gcTrystTake": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const enemy = make(s, e.code);
      log(
        s,
        `Trysting Place: ${card(e.code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      prepend(s, fx("gcShuffle", { text: "Trysting Place", player: p }));
      enterEnemyEngaged(s, enemy, p);
      return true;
    }
    case "gcStoneProgress": {
      const removed = Math.min(GC_STONE_PROGRESS, s.progress);
      s.progress -= removed;
      log(
        s,
        `The Stone of Erech: ${removed} progress is removed from The Dead are Following to travel here.`,
      );
      return true;
    }
    // The Stone of Erech, after it becomes the active location.
    case "gcStoneSearch": {
      const options = oathbreakerOptions(s, "gcStoneTake", p);
      if (!options.length) {
        log(
          s,
          `The Stone of Erech: no Oathbreaker enemy remains in the encounter deck or discard pile for ${who(s, p)}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Stone of Erech · Search for an Oathbreaker enemy${seatLabel(s, p)}`,
          options,
          "Forced: after The Stone of Erech becomes the active location, each player searches the encounter deck and discard pile for an Oathbreaker enemy and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "gcStoneTake": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const enemy = make(s, e.code);
      s.staging.push(enemy);
      log(
        s,
        `The Stone of Erech: ${who(s, p)} ${verb(s, "add")} ${card(e.code).name} to the staging area.`,
        "danger",
      );
      enemyAddedToStaging(s, enemy);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const GREY_COMPANY_HOOKS: Batch4ScenarioHooks = {
  setup: setupGreyCompany,
  // 1B is revealed once the opening hands are kept.
  openingHandsKept: (s) => {
    if (!s.greyCompany || s.round > 0) return false;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("gcDoorOffer", { player })),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: greyCompanyStageInfo,
  check: (s) => {
    if (!s.greyCompany || s.status !== "playing") return;
    lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // 1B Forced: at the end of the planning phase, discard each hand and advance.
  planningEnd: (s) => {
    if (!at(s, GC.door)) return;
    prepend(
      s,
      fx("gcDiscardHands", { player: firstPlayer(s) }),
      fx("gcStageTwo", { player: firstPlayer(s) }),
    );
  },
  // 2B Forced: at the beginning of the planning phase.
  planningBegin: (s) => {
    if (!at(s, GC.paths)) return;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("gcPathsChoice", { player })),
    );
  },
  playProblem: (s) => {
    const q = s.greyCompany;
    return q &&
      s.phase === "planning" &&
      q.noPlay?.round === s.round &&
      q.noPlay.players.includes(activeSeat(s))
      ? "The Paths of the Dead: you cannot play cards this phase."
      : null;
  },
  // Overcome by Fear: your threat cannot be reduced.
  cannotReduceThreat: (s) =>
    !!s.greyCompany &&
    !!s.threatAttachments?.some((a) => a.code === GC.fear && !a.blanked),
  // 2B: each player cannot reduce his threat below his initial threat level.
  threatReduction: (s, amount) => {
    if (!at(s, GC.paths)) return amount;
    const floor = s.startingThreat ?? 0;
    const allowed = Math.max(0, Math.min(amount, s.threat - floor));
    if (allowed < amount)
      log(
        s,
        `The Paths of the Dead: threat cannot be reduced below its initial level (${floor}).`,
      );
    return allowed;
  },
  roundEnd: (s) => {
    const q = s.greyCompany;
    if (!q) return [];
    delete q.shutRound;
    delete q.chilled;
    delete q.whispered;
    delete q.noPlay;
    return playerOrder(s)
      .filter((p) => gcFear(s, p))
      .map((player) => fx("gcFearRound", { player }));
  },
  // Phantom: the attack's damage raises the defending player's threat instead.
  replaceDamage: (s, u, amount, context) => {
    const c = s.combat;
    if (!s.greyCompany || amount <= 0 || !context.combatDamage || !c)
      return false;
    if (context.enemyId !== c.enemyId) return false;
    const enemy =
      get(s, c.enemyId) ??
      [...s.staging, ...globalEngaged(s)].find((x) => x.id === c.enemyId);
    if (!gcPhantom(s, enemy)) return false;
    const p = c.attackPlayer ?? ownerOf(s, u);
    forOwner(s, p, () => raiseThreat(s, amount, "encounter"));
    log(
      s,
      `Phantom: the ${amount} damage ${name(enemy!)}'s attack would deal to ${name(u)} is canceled, and ${who(s, p)} ${verb(s, "raise")} ${s.table ? "his" : "your"} threat by ${amount} instead.`,
      "danger",
    );
    return true;
  },
  // Whispers in the Dark: -1 willpower, -1 attack and -1 defense this round.
  stats: (s, u) => {
    const w = s.greyCompany?.whispered;
    if (!w || w.round !== s.round) return {};
    const n = w.ids.filter((id) => id === u.id).length;
    return n ? { will: -n, attack: -n, defense: -n } : {};
  },
  // Trysting Place: each enemy in the staging area cannot take damage.
  damageAmount: (s, u, amount) =>
    s.greyCompany &&
    isEnemy(u) &&
    stagingCount(s, GC.trysting) &&
    s.staging.some((x) => x.id === u.id)
      ? 0
      : amount,
  threatBonus: (s, u) => {
    if (!s.greyCompany || u.blanked) return 0;
    // Haunted Path: +1 threat for each player with a threat of 35 or higher.
    if (u.code === GC.haunted)
      return gcThreats(s).filter((t) => t >= GC_HIGH_THREAT).length;
    // Army of the Dead: X is twice the number of players in the game.
    if (u.code === GC.army) return 2 * players(s);
    return 0;
  },
  // 3B: Oathbreaker enemies get -20 engagement cost while The Stone of Erech is active.
  engagementBonus: (s, u) =>
    at(s, GC.following) && stoneActive(s) && isOathbreaker(u)
      ? -GC_STONE_ENGAGEMENT
      : 0,
  // Dark Door: progress cannot be placed on locations in the staging area.
  locationProgressBlocked: (s, u) =>
    !!s.greyCompany &&
    stagingCount(s, GC.darkDoor) > 0 &&
    s.staging.some((x) => x.id === u.id),
  // The Way is Shut: no progress on the current quest this round.
  progress: (s, amount, quest) => {
    const q = s.greyCompany;
    if (!q || q.shutRound !== s.round || quest.id !== mainQuestUnit(s)?.id)
      return amount;
    if (amount > 0)
      log(
        s,
        "The Way is Shut: progress cannot be placed on the current quest this round.",
      );
    return 0;
  },
  // Blood Runs Chill: the defending character cannot ready until the end of the round.
  cannotReady: (s, u) =>
    !!s.greyCompany?.chilled &&
    s.greyCompany.chilled.round === s.round &&
    s.greyCompany.chilled.ids.includes(u.id),
  // Deadly Road: after a When Revealed effect is canceled, each player raises his threat by 1.
  whenRevealedCancelled: (s) => {
    const roads = stagingCount(s, GC.deadly);
    if (s.greyCompany && roads)
      prepend(s, fx("gcRaiseEach", { value: roads, text: "Deadly Road" }));
  },
  cardEntered: (s, u, fromReveal, cancel) => {
    if (!s.greyCompany || !fromReveal || cancel || u.blanked) return;
    // Peril: the revealing player resolves the When Revealed effects.
    if (u.code === GC.ghosts)
      prepend(s, fx("gcGhosts", { target: u.id, player: activeSeat(s) }));
    if (u.code === GC.faithless)
      prepend(s, fx("gcFaithless", { target: u.id, player: activeSeat(s) }));
  },
  engaged: (s, u) => {
    if (!s.greyCompany || u.blanked) return;
    if (u.code === GC.deadMan)
      prepend(s, fx("gcDeadMan", { target: u.id, player: activeSeat(s) }));
    if (u.code === GC.host)
      prepend(s, fx("gcHost", { target: u.id, player: activeSeat(s) }));
  },
  enemyAttackStarted: (s, enemy, player) => {
    if (s.greyCompany && live(enemy, GC.army))
      prepend(s, fx("gcArmy", { target: enemy.id, player }));
  },
  travelProblem: (s, u) => {
    if (!s.greyCompany) return null;
    if (u.code === GC.stone)
      return s.progress >= GC_STONE_PROGRESS
        ? null
        : `The Stone of Erech: remove ${GC_STONE_PROGRESS} progress from stage 3B to travel here (${s.progress}).`;
    if (u.blanked) return null;
    if (u.code === GC.deadly)
      return fellowshipPayer(s)
        ? null
        : "Deadly Road: spend 1 Fellowship resource to travel here.";
    if (u.code === GC.trysting)
      return [...s.encounterDeck, ...s.encounterDiscard].some(isGcOathbreaker)
        ? null
        : "Trysting Place: there is no Oathbreaker enemy in the encounter deck or discard pile to put into play.";
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.greyCompany) return undefined;
    const first = firstPlayer(s);
    if (u.code === GC.stone) return [fx("gcStoneProgress", { player: first })];
    if (u.blanked) return undefined;
    if (u.code === GC.haunted)
      return [fx("gcRaiseEach", { value: 1, text: "Haunted Path" })];
    if (u.code === GC.deadly)
      return [fx("gcSpendFellowship", { text: name(u), player: first })];
    if (u.code === GC.trysting) return [fx("gcTryst", { player: first })];
    if (u.code === GC.darkDoor) return [fx("reveal", { player: first })];
    return undefined;
  },
  travelEntered: (s, u) => {
    if (!s.greyCompany || !live(u, GC.stone)) return;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("gcStoneSearch", { player })),
      fx("gcShuffle", { text: "The Stone of Erech", player: firstPlayer(s) }),
    );
  },
  explored: (s, u) => {
    const q = s.greyCompany;
    if (!q || u.code !== GC.stone || q.currentQuest !== GC.following) return;
    win(s);
    s.reason =
      "The Stone of Erech is explored: the Dead are summoned to the Stone, and the players win the game.";
  },
  effect: greyCompanyEffect,
  sharedEffect: (e) =>
    [
      "gcTreacheryDone",
      "gcDiscardHands",
      "gcDefeat",
      "gcStageTwo",
      "gcShuffle",
      "gcStageThree",
      "gcFollowingRevealed",
      "gcRaiseEach",
    ].includes(e.kind),
};
