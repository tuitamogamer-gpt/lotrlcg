import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  encounterDraw,
  enemyAttackPrevented,
  fx,
  get,
  locationQuest,
  log,
  make,
  prepend,
  shuffle,
  stats,
} from "./core";
import {
  damage,
  destroy,
  discardAttachment,
  enemyAddedToStaging,
  engage,
  progressLocation,
  questDefeated,
  raiseThreat,
  removeFromQuest,
  win,
} from "./board";
import {
  activeSeat,
  allActiveLocations,
  attachmentController,
  firstPlayer,
  forOwner,
  globalCharacters,
  globalEngaged,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { mainQuestUnit } from "./quest-state";
import { engagedEnemies } from "./considered-engagement";
import { removeCurrentQuestProgress } from "./side-quests";
import { lotrSagaCheck } from "./lotr-saga";
import {
  JD,
  JD_BRIDGE_CAP,
  JD_DOOM_TOKENS,
  JOURNEY_DARK_RECIPES,
  jdBalrog,
  jdDoom,
  jdDrumsGoal,
  journeyDarkStageInfo,
} from "./journey-dark-support";
export * from "./journey-dark-support";

const TREACHERIES: readonly string[] = [
  JD.coming,
  JD.trapped,
  JD.fissure,
  JD.fool,
];
type Combat = NonNullable<GameState["combat"]>;
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const isEnemyCard = (code: string) => card(code).type_code === "enemy";
const isLocationCard = (code: string) => card(code).type_code === "location";
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((l) => live(l, code));
const inPlay = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => u.code === code);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const ownCharacters = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
/** Printed threat of an encounter card; Moria Archer's X is the number of players. */
const printedThreat = (s: GameState, code: string) =>
  code === JD.archer ? playerOrder(s).length : (card(code).threat ?? 0);
/** Discard the top card of the encounter deck. */
function discardEncounterTop(s: GameState) {
  const code = encounterDraw(s);
  if (code) s.encounterDiscard.push(code);
  return code;
}
function takeAside(s: GameState, code: string) {
  const q = s.journeyDark!;
  const i = q.setAside.indexOf(code);
  if (i < 0) return undefined;
  q.setAside.splice(i, 1);
  return make(s, code);
}
const engagedWith = (s: GameState, u: Unit, player: number) =>
  seatView(s, player).engaged.some((x) => x.id === u.id);

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupJourneyDark(s: GameState) {
  const r = JOURNEY_DARK_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  // Stage 1A: each player searches the encounter deck for a setup location;
  // the recipe's prepared locations belong to that deck.
  const staged = section("sharedStagingArea");
  s.encounterDeck = shuffle(s, [
    ...section("sharedEncounterDeck"),
    ...staged.filter((c) => c !== JD.doom),
  ]);
  const doom = make(s, JD.doom);
  doom.damage = JD_DOOM_TOKENS;
  s.staging.push(doom);
  s.journeyDark = {
    currentQuest: JD.moria,
    advancing: false,
    setAside: section("sharedSetAside"),
    resolving: [],
    drums: 0,
    drumsReveal: 0,
    bridgeRound: 0,
    bridgePlaced: 0,
    balrogUnbound: false,
  };
  log(
    s,
    "The Long Dark of Moria: The Balrog, The Great Bridge and Chamber of Mazarbul are set aside, out of play. Doom, Doom, Doom enters the staging area with 10 damage tokens, and each player searches the encounter deck for a different location.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.journeyDark;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = journeyDarkStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // Chamber of Mazarbul: the players cannot advance to the next stage.
  if (s.stage < 3 && inPlay(s, JD.mazarbul)) return true;
  // 2B: X resource tokens are needed to advance.
  if (s.stage === 2 && stageLive(s) && q.drums < jdDrumsGoal(s)) return true;
  if (s.stage === 3) {
    // 3B: the stage cannot be defeated while The Great Bridge is in play.
    if (inPlay(s, JD.bridge)) return true;
    win(
      s,
      "The Bridge of Khazad-dûm is defeated: the Company of the Ring escapes the Mines of Moria.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("jtdDefeatQuest", { player: firstPlayer(s) }));
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
  const q = s.journeyDark;
  if (!q) return false;
  const player = activeSeat(s);
  if ([JD.uruk, JD.orc, JD.archer].includes(code)) {
    if (!fromReveal) return true;
    if (code === JD.uruk) {
      const target = [...s.staging].reverse().find((u) => u.code === code);
      if (target)
        prepend(s, fx("jtdUrukAttack", { target: target.id, player }));
    } else if (code === JD.orc) prepend(s, fx("jtdOrcChoice", { player }));
    else
      prepend(
        s,
        fx("jtdAssignDamage", {
          value: playerOrder(s).length,
          text: "Moria Archer",
          player,
        }),
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
    fx("jtdTreachery", { code, source: u.id, player }),
    fx("jtdTreacheryDone", { source: u.id, player }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.journeyDark) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case JD.uruk:
      c.attackBonus += 1;
      c.jtdUruk = true;
      log(
        s,
        "Uruk from Mordor: the attacking enemy gets +1 attack; if this attack destroys a character, it makes an additional attack.",
        "danger",
      );
      return true;
    case JD.orc:
      prepend(
        s,
        fx("jtdThreat", {
          value: engagedEnemies(s, p).length,
          text: "Moria Orc",
          player: p,
        }),
      );
      return true;
    case JD.mines:
      prepend(
        s,
        fx("jtdDiscardAttachment", {
          value: seatView(s, p).threat >= 35 ? 2 : 1,
          player: p,
        }),
      );
      return true;
    case JD.hall: {
      const bonus = seatView(s, p).threat >= 35 ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Many-pillared Hall: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case JD.trapped:
      prepend(
        s,
        fx("jtdAssignDamage", {
          value: engagedEnemies(s, p).length,
          text: "We Cannot Get Out",
          player: p,
        }),
      );
      return true;
    case JD.fool:
      c.jtdFool = true;
      log(
        s,
        "Fool of a Took!: if this attack destroys a character, 1 card is revealed from the encounter deck.",
        "danger",
      );
      return true;
  }
  return false;
}
function treachery(s: GameState, code: string) {
  const p = activeSeat(s);
  switch (code) {
    case JD.coming: {
      const x = playerOrder(s).length;
      s.encounterDeck.push(...s.encounterDiscard.splice(0));
      shuffle(s, s.encounterDeck);
      const found: string[] = [];
      let discarded = 0;
      while (found.length < x && s.encounterDeck.length) {
        const top = s.encounterDeck.shift()!;
        discarded++;
        if (isEnemyCard(top)) found.push(top);
        else s.encounterDiscard.push(top);
      }
      for (const c of found) {
        const u = make(s, c);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      log(
        s,
        `They Are Coming!: the encounter discard pile is shuffled into the encounter deck; ${discarded} card${discarded === 1 ? " is" : "s are"} discarded and ${found.length ? found.map((c) => card(c).name).join(", ") : "no enemy"} ${found.length === 1 ? "is" : "are"} added to the staging area.`,
        "danger",
      );
      return;
    }
    case JD.trapped: {
      const effects = playerOrder(s).flatMap((player) => {
        const x = ownCharacters(s, player).filter((u) => u.exhausted).length;
        return x
          ? [
              fx("jtdAssignDamage", {
                value: x,
                text: "We Cannot Get Out",
                player,
              }),
            ]
          : [];
      });
      log(
        s,
        "We Cannot Get Out: each player assigns 1 damage among characters he controls for each exhausted character he controls.",
        "danger",
      );
      prepend(s, ...effects);
      return;
    }
    case JD.fissure: {
      const committed = ownCharacters(s, p).filter((u) => u.committed);
      if (!committed.length) {
        log(
          s,
          `Deep Fissure: ${who(s, p)} control${s.table ? "s" : ""} no character committed to the quest.`,
        );
        prepend(s, fx("jtdFissure", { player: p }));
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Deep Fissure · Remove a character you control from the quest${seatLabel(s, p)}`,
          committed.map((u) => ({
            id: u.id,
            code: u.code,
            label: `${name(u)} (printed willpower ${card(u.code).willpower ?? 0})`,
            effects: [fx("jtdFissure", { target: u.id, player: p })],
          })),
          "Peril. Then the top card of the encounter deck is discarded; if its threat is higher than the character's printed willpower, the character is discarded.",
        ),
      );
      return;
    }
    case JD.fool: {
      const doom = jdDoom(s);
      const balrog = jdBalrog(s);
      const options: Option[] = [
        ...(doom && doom.damage > 0
          ? [
              {
                id: "doom",
                label: "Remove 1 damage token from Doom, Doom, Doom",
                effects: [
                  fx("jtdDoom", {
                    value: 1,
                    text: "Fool of a Took!",
                    player: p,
                  }),
                ],
              },
            ]
          : []),
        ...(balrog && !enemyAttackPrevented(s, balrog)
          ? [
              {
                id: "balrog",
                label: "The Balrog makes an attack",
                effects: [
                  fx("jtdBalrogAttack", { text: "Fool of a Took!", player: p }),
                ],
              },
            ]
          : []),
      ];
      if (!options.length) {
        log(
          s,
          "Fool of a Took!: Doom, Doom, Doom has no damage token and The Balrog cannot attack.",
        );
        return;
      }
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return;
      }
      forOwner(s, p, () =>
        choose(s, `Fool of a Took! · Choose${seatLabel(s, p)}`, options),
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Effects.

export function journeyDarkEffect(s: GameState, e: Effect): boolean {
  const q = s.journeyDark;
  if (!q || !e.kind.startsWith("jtd")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  switch (e.kind) {
    case "jtdSetupSearch": {
      const taken = new Set(
        s.staging
          .filter((l) => isLocationCard(l.code))
          .map((l) => card(l.code).name),
      );
      const codes = [
        ...new Set(
          s.encounterDeck.filter(
            (c) => isLocationCard(c) && !taken.has(card(c).name),
          ),
        ),
      ];
      if (!codes.length) {
        log(
          s,
          `The Long Dark of Moria: ${who(s, p)} find${s.table ? "s" : ""} no different location in the encounter deck.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Long Dark of Moria · Add a different location to the staging area${seatLabel(s, p)}`,
          codes.map((c) => ({
            id: c,
            code: c,
            label: card(c).name,
            effects: [fx("jtdSetupAdd", { code: c, player: p })],
          })),
          "Setup: each player adds 1 different location to the staging area.",
        ),
      );
      return true;
    }
    case "jtdSetupAdd": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i < 0) return true;
      s.encounterDeck.splice(i, 1);
      s.staging.push(make(s, e.code!));
      log(
        s,
        `The Long Dark of Moria: ${who(s, p)} add${s.table ? "s" : ""} ${card(e.code!).name} to the staging area.`,
      );
      return true;
    }
    case "jtdShuffle":
      shuffle(s, s.encounterDeck);
      log(s, "The encounter deck is shuffled.");
      return true;
    case "jtdDefeatQuest": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(
        s,
        ...responses,
        fx(s.stage === 1 ? "jtdStageTwo" : "jtdStageThree", { player: first }),
      );
      return true;
    }
    case "jtdStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = JD.drums;
      q.drums = 0;
      log(s, "Drums in the Deep begins.", "chapter");
      const chamber = takeAside(s, JD.mazarbul);
      if (chamber) {
        s.staging.push(chamber);
        log(
          s,
          "Drums in the Deep: Chamber of Mazarbul is added to the staging area.",
          "danger",
        );
      }
      return true;
    }
    case "jtdStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = JD.bridgeStage;
      q.drums = 0;
      log(s, "The Bridge of Khazad-dûm begins.", "chapter");
      const bridge = takeAside(s, JD.bridge);
      if (bridge) {
        s.staging.push(bridge);
        log(
          s,
          "The Bridge of Khazad-dûm: The Great Bridge is added to the staging area.",
          "danger",
        );
      }
      prepend(
        s,
        ...playerOrder(s).flatMap((player) => [
          fx("reveal", { player }),
          fx("jtdDoom", {
            value: 1,
            text: "The Bridge of Khazad-dûm",
            player,
          }),
        ]),
      );
      return true;
    }
    case "jtdDoom": {
      const doom = jdDoom(s);
      if (!doom || doom.blanked) return true;
      const n = Math.min(doom.damage, e.value ?? 1);
      if (n <= 0) {
        log(s, `${e.text ?? "Doom"}: Doom, Doom, Doom has no damage token.`);
        return true;
      }
      doom.damage -= n;
      log(
        s,
        `${e.text ?? "Doom"}: ${n} damage token${n === 1 ? " is" : "s are"} removed from Doom, Doom, Doom (${doom.damage} left).`,
        "danger",
      );
      return true;
    }
    case "jtdQuestEnd": {
      const doom = jdDoom(s);
      if (!doom || doom.blanked) return true;
      // Forced: remove 1 damage token; then, with none left, The Balrog
      // enters the staging area. Forced: The Balrog attacks if in play.
      prepend(
        s,
        fx("jtdDoom", { value: 1, text: "Doom, Doom, Doom", player: first }),
        fx("jtdBalrogRises", { player: first }),
        fx("jtdBalrogAttack", { text: "Doom, Doom, Doom", player: first }),
      );
      return true;
    }
    case "jtdBalrogRises": {
      const doom = jdDoom(s);
      if (!doom || doom.damage > 0) return true;
      const balrog = takeAside(s, JD.balrog);
      if (!balrog) return true;
      s.staging.push(balrog);
      enemyAddedToStaging(s, balrog);
      log(
        s,
        "Doom, Doom, Doom has no damage token: The Balrog is added to the staging area.",
        "danger",
      );
      return true;
    }
    case "jtdBalrogAttack": {
      const balrog = jdBalrog(s);
      if (!balrog || enemyAttackPrevented(s, balrog)) return true;
      const target = inStaging(s, balrog) ? first : ownerOf(s, balrog);
      log(
        s,
        `${e.text ?? "The Balrog"}: The Balrog makes an attack against ${who(s, target)}.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: balrog.id, player: target }));
      return true;
    }
    case "jtdTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code);
      return true;
    }
    case "jtdTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "jtdUrukAttack":
      if (u && inStaging(s, u)) {
        log(
          s,
          `Uruk from Mordor makes an attack against ${who(s, first)}.`,
          "danger",
        );
        prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      }
      return true;
    case "jtdOrcChoice": {
      const doom = jdDoom(s);
      if (!doom || doom.damage <= 0) {
        log(
          s,
          "Moria Orc: Doom, Doom, Doom has no damage token, so an additional encounter card is revealed.",
          "danger",
        );
        prepend(s, fx("reveal", { player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(s, `Moria Orc · Choose${seatLabel(s, p)}`, [
          {
            id: "doom",
            label: "Remove 1 damage from Doom, Doom, Doom",
            effects: [
              fx("jtdDoom", { value: 1, text: "Moria Orc", player: p }),
            ],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("jtdReveal", { text: "Moria Orc", player: p })],
          },
        ]),
      );
      return true;
    }
    case "jtdReveal":
      if (e.text)
        log(
          s,
          `${e.text}: 1 card is revealed from the encounter deck.`,
          "danger",
        );
      prepend(s, fx("reveal", { player: p }));
      return true;
    case "jtdAssignDamage": {
      const x = e.value ?? 0;
      if (x <= 0) return true;
      if (!ownCharacters(s, p).length) {
        log(
          s,
          `${e.text ?? "Damage"}: ${who(s, p)} control${s.table ? "s" : ""} no character.`,
        );
        return true;
      }
      log(
        s,
        `${e.text ?? "Damage"}: ${who(s, p)} assign${s.table ? "s" : ""} ${x} damage among ${s.table ? "their" : "your"} characters.`,
        "danger",
      );
      prepend(
        s,
        ...Array.from({ length: x }, () =>
          fx("chooseDamage", { value: 1, player: p }),
        ),
      );
      return true;
    }
    case "jtdThreat": {
      const x = e.value ?? 0;
      if (x <= 0) return true;
      forOwner(s, p, () => raiseThreat(s, x, "encounter"));
      log(
        s,
        `${e.text ?? "Threat"}: ${who(s, p)} raise${s.table ? "s" : ""} ${s.table ? "their" : "your"} threat by ${x}.`,
        "danger",
      );
      return true;
    }
    case "jtdFissure": {
      if (u && u.committed) {
        forOwner(s, ownerOf(s, u), () => removeFromQuest(s, u));
        log(s, `Deep Fissure: ${name(u)} is removed from the quest.`, "danger");
      }
      const top = discardEncounterTop(s);
      if (!top) {
        log(s, "Deep Fissure: the encounter deck is empty.");
        return true;
      }
      const threat = printedThreat(s, top);
      const will = u ? (card(u.code).willpower ?? 0) : 0;
      log(
        s,
        `Deep Fissure: ${card(top).name} is discarded from the encounter deck (${threat} threat).`,
      );
      if (u && will < threat && get(s, u.id)) {
        log(
          s,
          `Deep Fissure: ${name(u)}'s printed willpower ${will} is less than ${threat}, so ${name(u)} is discarded.`,
          "danger",
        );
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    }
    case "jtdDiscardAttachment": {
      const count = e.value ?? 1;
      if (count <= 0) return true;
      const hosts = [
        ...globalCharacters(s),
        ...s.staging,
        ...globalEngaged(s),
        ...allActiveLocations(s),
      ];
      const choices = hosts.flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!choices.length) {
        log(
          s,
          `Mines of Moria: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Mines of Moria · Discard a non-objective attachment you control (${count} left)${seatLabel(s, p)}`,
          choices.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("jtdDropAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
              ...(count > 1
                ? [fx("jtdDiscardAttachment", { value: count - 1, player: p })]
                : []),
            ],
          })),
        ),
      );
      return true;
    }
    case "jtdDropAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `${card(a.code).name} is discarded.`, "danger");
        forOwner(s, p, () => discardAttachment(s, u, a));
      }
      return true;
    }
    case "jtdChieftain":
      if (u && live(u, JD.chieftain) && !engagedWith(s, u, first)) {
        log(s, "Orc-chieftain engages the first player.", "danger");
        forOwner(s, first, () => engage(s, u));
      }
      return true;
    case "jtdStairway": {
      const top = discardEncounterTop(s);
      if (!top) {
        log(s, "Darkened Stairway: the encounter deck is empty.");
        return true;
      }
      if (!isLocationCard(top)) {
        log(
          s,
          `Darkened Stairway: ${card(top).name} is discarded from the encounter deck.`,
        );
        return true;
      }
      s.encounterDiscard.splice(s.encounterDiscard.lastIndexOf(top), 1);
      s.staging.push(make(s, top));
      log(
        s,
        `Darkened Stairway: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
        "danger",
      );
      return true;
    }
    case "jtdGuardroomTravel": {
      const top = discardEncounterTop(s);
      if (!top) return true;
      const x = printedThreat(s, top);
      log(
        s,
        `Ancient Guardroom: ${card(top).name} is discarded to travel here; each player raises his threat by ${x}.`,
        x ? "danger" : "normal",
      );
      if (x > 0)
        for (const player of playerOrder(s))
          forOwner(s, player, () => raiseThreat(s, x, "encounter"));
      return true;
    }
    case "jtdMazarbulSearch": {
      // One of those enemies must be Orc-chieftain, if able.
      const chieftain =
        !!e.flag &&
        [...s.encounterDeck, ...s.encounterDiscard].includes(JD.chieftain);
      const taken = new Set((e.text ?? "").split("|").filter(Boolean));
      const options: Option[] = [];
      for (const [zone, cards] of [
        ["deck", s.encounterDeck],
        ["discard", s.encounterDiscard],
      ] as const)
        for (const code of [
          ...new Set(
            cards.filter(
              (c) =>
                isEnemyCard(c) &&
                !taken.has(card(c).name) &&
                (!chieftain || c === JD.chieftain),
            ),
          ),
        ])
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("jtdMazarbulFound", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `Chamber of Mazarbul: ${who(s, p)} find${s.table ? "s" : ""} no different enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Chamber of Mazarbul · Search for a different enemy${seatLabel(s, p)}`,
          options,
          chieftain
            ? "One of those enemies must be Orc-chieftain, if able."
            : "Add it to the staging area to travel here.",
        ),
      );
      return true;
    }
    case "jtdMazarbulFound": {
      const pile = e.text === "deck" ? s.encounterDeck : s.encounterDiscard;
      const i = pile.lastIndexOf(e.code!);
      if (i < 0) return true;
      pile.splice(i, 1);
      const x = make(s, e.code!);
      s.staging.push(x);
      enemyAddedToStaging(s, x);
      // Later searches must find a different enemy.
      for (const next of s.queue)
        if (next.kind === "jtdMazarbulSearch")
          next.text = [...(next.text ?? "").split("|"), card(e.code!).name]
            .filter(Boolean)
            .join("|");
      log(
        s,
        `Chamber of Mazarbul: ${card(e.code!).name} is added to the staging area from the ${e.text === "deck" ? "encounter deck" : "discard pile"}.`,
        "danger",
      );
      return true;
    }
    case "jtdBridgeResponse": {
      const balrog = jdBalrog(s);
      const heroes = globalCharacters(s).filter(isHero);
      if (!balrog || !heroes.length) return true;
      choose(
        s,
        "The Great Bridge · Response: discard a hero from play to deal X damage to The Balrog",
        [
          ...heroes.map((h) => {
            const x = card(h.code).threat ?? 0;
            return {
              id: h.id,
              code: h.code,
              label: `Discard ${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""} (${x} damage)`,
              effects: [
                fx("jtdBridgeHero", { target: h.id, player: ownerOf(s, h) }),
              ],
            };
          }),
          { id: "skip", label: "Do not trigger the response", effects: [] },
        ],
        "X is that hero's threat cost. Then, The Balrog loses all keywords for the remainder of the game. Any player may trigger this response.",
      );
      return true;
    }
    case "jtdBridgeHero": {
      const balrog = jdBalrog(s);
      if (!u || !isHero(u) || !balrog) return true;
      const x = card(u.code).threat ?? 0;
      log(
        s,
        `The Great Bridge: ${name(u)} is discarded from play to deal ${x} damage to The Balrog.`,
        "danger",
      );
      forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      if (x > 0) damage(s, balrog.id, x);
      q.balrogUnbound = true;
      log(
        s,
        "The Great Bridge: The Balrog loses all keywords for the remainder of the game.",
        "good",
      );
      return true;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

function attackFinished(s: GameState, combat: Combat, skipped = false) {
  if (!s.journeyDark || skipped || !combat.jtdDestroyed) return [];
  const p = combat.attackPlayer ?? firstPlayer(s);
  return [
    ...(combat.jtdUruk
      ? [fx("immediateAttack", { target: combat.enemyId, player: p })]
      : []),
    ...(combat.jtdFool
      ? [fx("jtdReveal", { text: "Fool of a Took!", player: p })]
      : []),
  ];
}
/** Progress placed this round on stage 3B. */
const bridgePlaced = (s: GameState) =>
  s.journeyDark?.bridgeRound === s.round ? s.journeyDark.bridgePlaced : 0;

export const JOURNEY_DARK_HOOKS: Batch4ScenarioHooks = {
  setup: setupJourneyDark,
  openingHandsKept: (s) => {
    if (!s.journeyDark || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("jtdSetupSearch", { player })),
      fx("jtdShuffle", { player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: journeyDarkStageInfo,
  check: (s) => {
    if (s.journeyDark) lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // 1B: after a player optionally engages an enemy.
  engaged: (s, _u, optional) => {
    if (s.journeyDark && optional && s.stage === 1 && stageLive(s))
      prepend(
        s,
        fx("jtdDoom", {
          value: 1,
          text: "The Long Dark of Moria",
          player: activeSeat(s),
        }),
      );
  },
  // 2B: no enemy in the staging area at the beginning of the quest phase.
  questBegin: (s) => {
    const q = s.journeyDark;
    if (
      q &&
      s.stage === 2 &&
      stageLive(s) &&
      !s.staging.some((u) => isEnemyCard(u.code))
    ) {
      q.drumsReveal = s.round;
      log(
        s,
        "Drums in the Deep: there is no enemy in the staging area, so the first player reveals an additional encounter card this staging step.",
        "danger",
      );
    }
    return [];
  },
  extraStagingReveals: (s) =>
    s.journeyDark?.drumsReveal === s.round && s.stage === 2 && stageLive(s)
      ? 1
      : 0,
  endQuest: (s) => {
    if (s.journeyDark)
      prepend(s, fx("jtdQuestEnd", { player: firstPlayer(s) }));
  },
  // Orc-chieftain engages the first player at the beginning of the encounter phase.
  encounterBegin: (s) => {
    if (!s.journeyDark) return;
    const first = firstPlayer(s);
    const chiefs = [...s.staging, ...globalEngaged(s)].filter(
      (u) => live(u, JD.chieftain) && !engagedWith(s, u, first),
    );
    if (chiefs.length)
      prepend(
        s,
        ...chiefs.map((u) =>
          fx("jtdChieftain", { target: u.id, player: first }),
        ),
      );
  },
  // Moria Archer: Archery 2 while in the staging area.
  combatBegin: (s) => {
    if (!s.journeyDark) return;
    const archery = 2 * s.staging.filter((u) => live(u, JD.archer)).length;
    if (archery)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  stats: (s, u) =>
    s.journeyDark &&
    card(u.code).type_code === "enemy" &&
    activeIs(s, JD.guardroom)
      ? { attack: -1 }
      : {},
  threatBonus: (s, u) => {
    if (!s.journeyDark || u.blanked) return 0;
    if (u.code === JD.archer) return playerOrder(s).length;
    if (u.code === JD.hall)
      return [...s.staging, ...allActiveLocations(s)].filter(
        (x) => x.code === JD.hall,
      ).length;
    return 0;
  },
  progress: (s, amount, quest) => {
    const q = s.journeyDark;
    if (!q || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return amount;
    let left = amount;
    // Mines of Moria: progress goes on it before the current quest.
    for (const mines of s.staging.filter((l) => live(l, JD.mines))) {
      if (left <= 0) break;
      const n = Math.min(
        left,
        Math.max(0, locationQuest(s, mines) - mines.progress),
      );
      if (n <= 0) continue;
      log(
        s,
        `Mines of Moria: ${n} progress ${n === 1 ? "is" : "are"} placed on Mines of Moria before the current quest.`,
      );
      left -= n;
      progressLocation(s, mines, n);
    }
    // 3B: no more than 5 progress on this stage each round.
    if (s.stage === 3 && stageLive(s) && left > 0) {
      const room = Math.max(0, JD_BRIDGE_CAP - bridgePlaced(s));
      if (left > room)
        log(
          s,
          `The Bridge of Khazad-dûm: no more than ${JD_BRIDGE_CAP} progress can be placed on this stage each round${room ? `; ${left - room} progress cannot be placed` : ""}.`,
        );
      left = Math.min(left, room);
    }
    return left;
  },
  questProgressPlaced: (s, quest, amount) => {
    const q = s.journeyDark;
    if (!q || s.stage !== 3 || quest.id !== mainQuestUnit(s)?.id) return;
    if (q.bridgeRound !== s.round) {
      q.bridgeRound = s.round;
      q.bridgePlaced = 0;
    }
    q.bridgePlaced = Math.min(JD_BRIDGE_CAP, q.bridgePlaced + amount);
  },
  explored: (s, u) => {
    if (!s.journeyDark) return;
    const first = firstPlayer(s);
    if (live(u, JD.bridge) && jdBalrog(s))
      prepend(s, fx("jtdBridgeResponse", { player: first }));
    if (live(u, JD.stairway)) prepend(s, fx("jtdStairway", { player: first }));
  },
  travelProblem: (s, u) =>
    s.journeyDark && live(u, JD.guardroom) && !s.encounterDeck.length
      ? "There is no encounter card to discard for Ancient Guardroom's travel cost."
      : null,
  travelEffects: (s, u) => {
    if (!s.journeyDark || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === JD.guardroom)
      return [fx("jtdGuardroomTravel", { player: first })];
    if (u.code === JD.mazarbul) {
      const chieftain = [...s.encounterDeck, ...s.encounterDiscard].includes(
        JD.chieftain,
      );
      return [
        ...playerOrder(s).map((player, i) =>
          fx("jtdMazarbulSearch", { player, flag: i === 0 && chieftain }),
        ),
        fx("jtdShuffle", { player: first }),
      ];
    }
    return undefined;
  },
  indestructible: (s, u) =>
    !!s.journeyDark && live(u, JD.balrog) && !s.journeyDark.balrogUnbound,
  cannotOptionallyEngage: (s, u) => !!s.journeyDark && live(u, JD.balrog),
  consideredEngaged: (s, u, player) =>
    !!s.journeyDark &&
    live(u, JD.balrog) &&
    inStaging(s, u) &&
    player === firstPlayer(s),
  attackProblem: (s, enemy) =>
    s.journeyDark &&
    live(enemy, JD.balrog) &&
    inStaging(s, enemy) &&
    activeSeat(s) !== firstPlayer(s)
      ? "Only the first player can declare attackers against The Balrog."
      : null,
  shadowImmune: (s, enemy) => !!s.journeyDark && live(enemy, JD.balrog),
  cannotAttach: (s, u) =>
    !!s.journeyDark && (live(u, JD.chieftain) || live(u, JD.troll)),
  cannotDefend: (s, enemy, defender) =>
    !!s.journeyDark &&
    live(enemy, JD.chieftain) &&
    !!defender &&
    isAlly(defender),
  damageDealt: (s, u, amount, context) => {
    if (!s.journeyDark || !context.combatDamage || !context.enemyId) return;
    const enemy = get(s, context.enemyId);
    if (!enemy || !live(enemy, JD.troll) || !isCharacter(u)) return;
    const excess = Math.min(amount, Math.max(0, u.damage - stats(s, u).health));
    if (excess <= 0) return;
    const removed = removeCurrentQuestProgress(s, excess);
    log(
      s,
      `Great Cave-troll deals ${excess} excess damage: ${removed} progress ${removed === 1 ? "is" : "are"} removed from the current quest.`,
      "danger",
    );
  },
  characterDestroyed: (s, u, context) => {
    const q = s.journeyDark;
    if (!q) return;
    // 2B: after an enemy is defeated, place 1 resource token on this stage.
    if (card(u.code).type_code === "enemy") {
      if (s.stage === 2 && stageLive(s)) {
        q.drums++;
        log(
          s,
          `Drums in the Deep: 1 resource token is placed on the stage (${q.drums}/${jdDrumsGoal(s)}).`,
          "good",
        );
      }
      return;
    }
    if (
      s.combat &&
      isCharacter(u) &&
      context.combatDamage &&
      context.enemyId === s.combat.enemyId
    )
      s.combat.jtdDestroyed = true;
  },
  attackFinished,
  effect: journeyDarkEffect,
  sharedEffect: (e) =>
    [
      "jtdShuffle",
      "jtdDefeatQuest",
      "jtdStageTwo",
      "jtdStageThree",
      "jtdQuestEnd",
      "jtdBalrogRises",
      "jtdBalrogAttack",
      "jtdStairway",
      "jtdGuardroomTravel",
    ].includes(e.kind),
};
