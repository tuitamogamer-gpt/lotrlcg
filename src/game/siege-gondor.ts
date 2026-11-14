import type { Effect, GameState, Option, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import {
  discardAttachment,
  discardLocation,
  enemyAddedToStaging,
  enterEnemyEngaged,
  exhaustCharacter,
  questDefeated,
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
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { lotrSagaCheck } from "./lotr-saga";
import { hasTrait } from "./expansion-passives";
import { returnToStaging } from "./black-riders-hunted";
import {
  SG,
  SG_CAPTAIN_ENGAGEMENT,
  SG_GALLEY_ENGAGEMENT,
  SG_QUAYS,
  SG_RAIDING,
  SG_SHIPS_TO_TRAVEL,
  SIEGE_GONDOR_RECIPES,
  isSgCorsairCode,
  isSgShipCode,
  sgFleet,
  sgFleetResources,
  sgShipsInVictory,
  siegeGondorStageInfo,
} from "./siege-gondor-support";
export * from "./siege-gondor-support";

/**
 * The Siege of Gondor, the second scenario of The Flame of the West. Aragorn
 * and the Dead fall upon the fleet of Umbar at Pelargir: The Corsair Fleet
 * gathers a resource at the beginning of each staging step and strikes each
 * player with an encounter card or with X damage. The players put 3 Ship
 * locations in the victory display, take Great Corsair Ship and place 20
 * progress on Attack on Pelargir to win.
 */
const TREACHERIES: readonly string[] = [
  SG.fellFolk,
  SG.sails,
  SG.raiding,
  SG.brink,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string, plural = `${base}s`) =>
  s.table ? plural : base;
/** The game phase, its steps included (the staging step is in the quest phase). */
const phaseOf = (s: GameState) =>
  s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase;
/** The current quest's text is in effect. */
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked && !s.siegeGondor?.advancing;
const at = (s: GameState, quest: string) =>
  s.siegeGondor?.currentQuest === quest && stageLive(s);
const isShip = (u: Unit) =>
  card(u.code).type_code === "location" && hasTrait(u, "Ship");
const isCorsair = (u: Unit) => isEnemy(u) && hasTrait(u, "Corsair");
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
/** The active location is a Ship. */
const shipActive = (s: GameState) =>
  allActiveLocations(s).some((u) => isShip(u));
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
/** Great Corsair Ship is in play (in the staging area or the active location). */
const greatShipInPlay = (s: GameState) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => u.code === SG.greatShip);
const stagingLive = (s: GameState, code: string) =>
  s.staging.filter((u) => live(u, code)).length;
/** The characters a player controls, in that player's seat. */
const charactersOf = (s: GameState, p: number) => {
  const view = seatView(s, p);
  return [...view.heroes, ...view.allies].filter(isCharacter);
};
const questingOf = (s: GameState, p: number) =>
  charactersOf(s, p).filter(
    (u) => u.committed || seatView(s, p).committedIds?.includes(u.id),
  );
/** The attachments a player controls, with their hosts. */
function attachmentsOf(s: GameState, p: number) {
  const hosts = [
    ...globalCharacters(s),
    ...s.staging,
    ...globalEngaged(s),
    ...allActiveLocations(s),
  ];
  return hosts.flatMap((host) =>
    host.attachments
      .filter((a) => attachmentController(s, host, a) === p)
      .map((a) => ({ host, a })),
  );
}
const costOf = (code: string) => Number(card(code).cost) || 0;
/** The encounter cards that can still be revealed. */
const canReveal = (s: GameState) =>
  s.encounterDeck.length + s.encounterDiscard.length > 0;
/** Fell Folk of Umbar: the discard pile would be reshuffled to find a Corsair enemy. */
const fellReshuffle = (s: GameState) =>
  ["quest", "staging"].includes(s.phase) &&
  s.encounterDiscard.some(isSgCorsairCode);
const corsairsAvailable = (s: GameState) =>
  [...s.encounterDeck, ...s.encounterDiscard].filter(isSgCorsairCode);

// ---------------------------------------------------------------------------
// Setup and the quest.

export function setupSiegeGondor(s: GameState) {
  const r = SIEGE_GONDOR_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // 1A: The Corsair Fleet (Corsair side faceup) and Great Corsair Ship join the staging area.
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.activeLocation = null;
  s.siegeGondor = {
    currentQuest: SG.pelargir,
    advancing: false,
    resolving: [],
    setAside: section("sharedSetAside"),
  };
  log(
    s,
    "Attack on Pelargir: The Corsair Fleet (Corsair side faceup) and Great Corsair Ship are added to the staging area.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.siegeGondor;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  const goal = siegeGondorStageInfo(s)?.quest ?? 0;
  if (goal <= 0 || s.progress < goal) return true;
  // 1B: the players cannot defeat this stage while Great Corsair Ship is in play.
  if (stageLive(s) && greatShipInPlay(s)) return true;
  // The game ends at once, so the stage's text stays in effect.
  questDefeated(s, q.currentQuest);
  win(
    s,
    "Attack on Pelargir is defeated: the fleet of Umbar is taken at Pelargir, and the players win the game.",
  );
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
  const q = s.siegeGondor;
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
    fx("sgTreachery", { code, source: u.id, player }),
    fx("sgTreacheryDone", { source: u.id, player }),
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
  const x = sgFleetResources(s);
  switch (held.code) {
    case SG.fellFolk: {
      const engaged = seatView(s, p).engaged.filter(isCorsair);
      either(
        s,
        p,
        "Fell Folk of Umbar",
        [
          ...(engaged.length
            ? [
                {
                  id: "return",
                  label: `Return each Corsair enemy engaged with you to the staging area (${engaged.length})`,
                  effects: [fx("sgFellReturn", { player: p })],
                },
              ]
            : []),
          ...(s.encounterDeck.some(isSgCorsairCode) || fellReshuffle(s)
            ? [
                {
                  id: "discard",
                  label:
                    "Discard from the encounter deck until a Corsair enemy is discarded and engage it",
                  effects: [fx("sgFellDiscard", { player: p })],
                },
              ]
            : []),
        ],
        "Peril. When Revealed: either return each Corsair enemy engaged with you to the staging area, or discard cards from the top of the encounter deck until a Corsair enemy is discarded and put that enemy into play engaged with you.",
      );
      return;
    }
    case SG.sails:
      prepend(s, fx("sgSails", { player: p }));
      return;
    case SG.raiding:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("sgRaidingChoice", { player })),
      );
      return;
    case SG.brink:
      either(
        s,
        p,
        "Driven to the Brink",
        [
          ...(["quest", "staging"].includes(s.phase)
            ? [
                {
                  id: "end",
                  label:
                    "Immediately end the quest phase without resolving the quest",
                  effects: [fx("sgBrinkEnd", { player: p })],
                },
              ]
            : []),
          ...(x > 0 && questingOf(s, p).length
            ? [
                {
                  id: "damage",
                  label: `Assign ${x} damage among questing characters you control`,
                  effects: [
                    fx("sgAssign", {
                      value: x,
                      text: "Driven to the Brink",
                      flag: true,
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
        ],
        "Peril. When Revealed: either immediately end the quest phase (without resolving the quest), or assign X damage among questing characters you control. X is the number of resources on The Corsair Fleet.",
      );
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.siegeGondor) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case SG.corsair: {
      const bonus = shipActive(s) ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Corsair of Umbar: the attacking enemy gets +${bonus} attack${bonus === 2 ? " (the active location is a Ship)" : ""}.`,
        "danger",
      );
      return true;
    }
    case SG.pirate:
      c.sgPirate = true;
      log(
        s,
        "Haradrim Pirate: the defending character gets -1 defense for each damage on it.",
        "danger",
      );
      return true;
    case SG.port:
      c.sgPort = true;
      log(
        s,
        "Port of Pelargir: a character this attack damages cannot ready until the end of the round.",
        "danger",
      );
      return true;
    case SG.crew:
      if (!shipActive(s)) {
        log(s, "Umbar Pirate Crew: the active location is not a Ship.");
        return true;
      }
      c.returnToStaging = true;
      log(
        s,
        "Umbar Pirate Crew: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
    case SG.raiding:
      c.attackBonus += 1;
      c.sgRaiding = true;
      log(
        s,
        "Raiding the Coasts: the attacking enemy gets +1 attack; if this attack destroys a character, the defending player discards an attachment.",
        "danger",
      );
      return true;
    case SG.brink:
      prepend(s, fx("sgExhaust", { text: "Driven to the Brink", player: p }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Effects.

export function siegeGondorEffect(s: GameState, e: Effect): boolean {
  const q = s.siegeGondor;
  if (!q || !e.kind.startsWith("sg")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...s.staging, ...globalEngaged(s), ...allActiveLocations(s)].find(
        (x) => x.id === e.target,
      ))
    : undefined;
  switch (e.kind) {
    case "sgTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "sgTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // 1A Setup: each player searches the encounter deck for a Ship location.
    case "sgSetupSearch": {
      const options = [...new Set(s.encounterDeck.filter(isSgShipCode))].map(
        (code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("sgSetupTake", { code, player: p })],
        }),
      );
      if (!options.length) {
        log(
          s,
          `Attack on Pelargir: no Ship location remains in the encounter deck for ${who(s, p)}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Attack on Pelargir · Search the encounter deck for a Ship location${seatLabel(s, p)}`,
          options,
          "Setup: each player searches the encounter deck for a Ship location and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "sgSetupTake": {
      const i = e.code ? s.encounterDeck.indexOf(e.code) : -1;
      if (i < 0) return true;
      s.encounterDeck.splice(i, 1);
      s.staging.push(make(s, e.code!));
      log(
        s,
        `Attack on Pelargir: ${who(s, p)} ${verb(s, "add")} ${card(e.code!).name} to the staging area.`,
        "danger",
      );
      return true;
    }
    case "sgShuffle":
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.text ?? "The Siege of Gondor"}: the encounter deck is shuffled.`,
      );
      return true;
    // The Corsair Fleet, Forced: at the beginning of the staging step.
    case "sgFleet": {
      const fleet = sgFleet(s);
      if (!fleet || fleet.blanked) return true;
      fleet.resources += 1;
      log(
        s,
        `The Corsair Fleet: 1 resource is placed on it (X is ${fleet.resources}).`,
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("sgFleetChoice", { player })),
      );
      return true;
    }
    case "sgFleetChoice": {
      const x = sgFleetResources(s);
      either(
        s,
        p,
        "The Corsair Fleet",
        [
          ...(canReveal(s)
            ? [
                {
                  id: "reveal",
                  label: "Reveal an encounter card",
                  effects: [fx("reveal", { player: p })],
                },
              ]
            : []),
          ...(x > 0 && charactersOf(s, p).length
            ? [
                {
                  id: "damage",
                  label: `Assign ${x} damage among characters you control`,
                  effects: [
                    fx("sgAssign", {
                      value: x,
                      text: "The Corsair Fleet",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
        ],
        "Forced: at the beginning of the staging step, place 1 resource on this objective. Then, each player must choose: either reveal an encounter card, or assign X damage among characters he controls. X is the number of resources here.",
      );
      return true;
    }
    // Assign damage one point at a time; flag: questing characters only.
    case "sgAssign": {
      const remaining = e.value ?? 0;
      const characters = e.flag ? questingOf(s, p) : charactersOf(s, p);
      if (remaining <= 0 || !characters.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text ?? "The Siege of Gondor"} · Assign damage · ${remaining} remaining${seatLabel(s, p)}`,
          characters.map((c) => ({
            id: c.id,
            code: c.code,
            label: `${name(c)} · ${c.damage} damage`,
            effects: [
              fx("damage", { target: c.id, value: 1, player: p }),
              fx("sgAssign", {
                value: remaining - 1,
                text: e.text,
                flag: e.flag,
                player: p,
              }),
            ],
          })),
          e.flag
            ? "Assign the damage one at a time among questing characters you control."
            : "Assign the damage one at a time among characters you control.",
        ),
      );
      return true;
    }
    // Pelargir Quays: assign damage among characters in play.
    case "sgQuaysDamage": {
      const remaining = e.value ?? 0;
      const characters = globalCharacters(s).filter(isCharacter);
      if (remaining <= 0 || !characters.length) return true;
      choose(
        s,
        `Pelargir Quays · Assign damage · ${remaining} remaining${seatLabel(s, first)}`,
        characters.map((c) => ({
          id: c.id,
          code: c.code,
          label: `${name(c)}${s.table ? ` · ${seatName(s, ownerOf(s, c))}` : ""} · ${c.damage} damage`,
          effects: [
            fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
            fx("sgQuaysDamage", { value: remaining - 1, player: first }),
          ],
        })),
        "Forced: at the end of the round, place a damage token here. Then, if there are 4 damage tokens here, discard Pelargir Quays and assign 4 damage among characters in play.",
      );
      return true;
    }
    case "sgQuays": {
      if (!u || u.code !== SG.quays) return true;
      u.damage += 1;
      log(
        s,
        `Pelargir Quays: a damage token is placed on it (${u.damage}/${SG_QUAYS}).`,
        "danger",
      );
      if (u.damage < SG_QUAYS) return true;
      discardLocation(s, u);
      log(
        s,
        `Pelargir Quays: ${SG_QUAYS} damage is assigned among characters in play.`,
        "danger",
      );
      prepend(s, fx("sgQuaysDamage", { value: SG_QUAYS, player: first }));
      return true;
    }
    // Fell Folk of Umbar.
    case "sgFellReturn": {
      const engaged = seatView(s, p).engaged.filter(isCorsair);
      for (const enemy of engaged) returnToStaging(s, enemy);
      return true;
    }
    case "sgFellDiscard": {
      for (;;) {
        // An empty encounter deck is reshuffled during the quest phase only.
        if (!s.encounterDeck.length && fellReshuffle(s)) {
          s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
          log(s, "The encounter discard pile is shuffled back into its deck.");
        }
        const code = s.encounterDeck.shift();
        if (!code) {
          log(
            s,
            "Fell Folk of Umbar: the encounter deck runs out without a Corsair enemy.",
          );
          return true;
        }
        if (!isSgCorsairCode(code)) {
          s.encounterDiscard.push(code);
          log(s, `Fell Folk of Umbar: ${card(code).name} is discarded.`);
          continue;
        }
        const enemy = make(s, code);
        log(
          s,
          `Fell Folk of Umbar: ${card(code).name} is discarded and put into play engaged with ${who(s, p)}.`,
          "danger",
        );
        enterEnemyEngaged(s, enemy, p);
        return true;
      }
    }
    // Black Sails.
    case "sgSails": {
      const ships = s.staging.filter((x) => isShip(x));
      const key = { round: s.round, phase: phaseOf(s) };
      const same =
        q.sails?.round === key.round && q.sails.phase === key.phase
          ? q.sails.ids
          : [];
      q.sails = { ...key, ids: [...same, ...ships.map((x) => x.id)] };
      log(
        s,
        ships.length
          ? `Black Sails: each Ship location in the staging area (${ships.length}) gets +1 threat until the end of the phase.`
          : "Black Sails: there is no Ship location in the staging area.",
        "danger",
      );
      if (s.staging.some((x) => isShip(x) && !card(x.code).is_unique))
        return true;
      prepend(s, fx("sgSailsSearch", { player: p }));
      return true;
    }
    case "sgSailsSearch": {
      const options: Option[] = [];
      for (const zone of ["deck", "discard"] as const)
        for (const code of [
          ...new Set(
            (zone === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              isSgShipCode,
            ),
          ),
        ])
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("sgSailsTake", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          "Black Sails: no Ship location is in the encounter deck or discard pile.",
        );
        prepend(s, fx("sgShuffle", { text: "Black Sails", player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Black Sails · Search for a Ship location${seatLabel(s, p)}`,
          options,
          "When Revealed: if there are no non-unique Ship locations in the staging area, search the encounter deck and discard pile for a Ship location and add it to the staging area. Shuffle the encounter deck.",
        ),
      );
      return true;
    }
    case "sgSailsTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = e.code ? pile.lastIndexOf(e.code) : -1;
      if (i >= 0) {
        pile.splice(i, 1);
        s.staging.push(make(s, e.code!));
        log(
          s,
          `Black Sails: ${card(e.code!).name} is added to the staging area from the ${e.text === "discard" ? "discard pile" : "encounter deck"}.`,
          "danger",
        );
      }
      prepend(s, fx("sgShuffle", { text: "Black Sails", player: p }));
      return true;
    }
    // Raiding the Coasts.
    case "sgRaidingChoice": {
      const own = attachmentsOf(s, p);
      const top = Math.max(-1, ...own.map(({ a }) => costOf(a.code)));
      const highest = own.filter(({ a }) => costOf(a.code) === top);
      either(
        s,
        p,
        "Raiding the Coasts",
        [
          {
            id: "threat",
            label: `Add ${SG_RAIDING} to the total threat in the staging area until the end of the phase`,
            effects: [fx("sgRaiding", { player: p })],
          },
          ...(highest.length
            ? [
                {
                  id: "attachment",
                  label: `Discard the highest cost attachment you control (cost ${top})`,
                  effects: [fx("sgDiscardHighest", { player: p })],
                },
              ]
            : []),
        ],
        "When Revealed: each player must choose: either add 3 to the total threat in the staging area until the end of the phase, or discard the highest cost attachment you control.",
      );
      return true;
    }
    case "sgRaiding": {
      const key = { round: s.round, phase: phaseOf(s) };
      const before =
        q.raiding?.round === key.round && q.raiding.phase === key.phase
          ? q.raiding.amount
          : 0;
      q.raiding = { ...key, amount: before + SG_RAIDING };
      log(
        s,
        `Raiding the Coasts: ${who(s, p)} ${verb(s, "add")} ${SG_RAIDING} to the total threat in the staging area until the end of the phase.`,
        "danger",
      );
      return true;
    }
    case "sgDiscardHighest": {
      const own = attachmentsOf(s, p);
      if (!own.length) return true;
      const top = Math.max(...own.map(({ a }) => costOf(a.code)));
      const highest = own.filter(({ a }) => costOf(a.code) === top);
      if (highest.length === 1) {
        const { host, a } = highest[0];
        prepend(
          s,
          fx("sgDropAttachment", {
            target: host.id,
            source: a.id,
            text: e.text ?? "Raiding the Coasts",
            player: p,
          }),
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text ?? "Raiding the Coasts"} · Discard the highest cost attachment you control${seatLabel(s, p)}`,
          highest.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)} · cost ${top}`,
            effects: [
              fx("sgDropAttachment", {
                target: host.id,
                source: a.id,
                text: e.text ?? "Raiding the Coasts",
                player: p,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    // Raiding the Coasts' shadow: an attachment you control.
    case "sgDiscardAttachment": {
      const own = attachmentsOf(s, p);
      if (!own.length) {
        log(
          s,
          `Raiding the Coasts: ${who(s, p)} control${s.table ? "s" : ""} no attachment.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Raiding the Coasts · Discard an attachment you control${seatLabel(s, p)}`,
          own.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("sgDropAttachment", {
                target: host.id,
                source: a.id,
                text: "Raiding the Coasts",
                player: p,
              }),
            ],
          })),
          "Shadow: if this attack destroys a character, discard an attachment you control.",
        ),
      );
      return true;
    }
    case "sgDropAttachment": {
      const host =
        u ??
        [...globalCharacters(s), ...s.staging, ...globalEngaged(s)].find(
          (x) => x.id === e.target,
        );
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!host || !a) return true;
      log(
        s,
        `${e.text ?? "Raiding the Coasts"}: ${card(a.code).name} is discarded.`,
        "danger",
      );
      forOwner(s, ownerOf(s, host), () => discardAttachment(s, host, a));
      return true;
    }
    // Driven to the Brink.
    case "sgBrinkEnd":
      log(
        s,
        "Driven to the Brink: the quest phase ends immediately without resolving the quest.",
        "danger",
      );
      if (["quest", "staging"].includes(s.phase)) {
        s.queue = s.queue.filter(
          (x) =>
            ![
              "reveal",
              "khazadStagingEnd",
              "questReady",
              "finishQuestPhase",
            ].includes(x.kind),
        );
        s.queue.push(fx("finishQuestPhase", { player: first }));
      }
      return true;
    // Exhaust a character you control (Umbar Pirate Crew, Driven to the Brink's shadow).
    case "sgExhaust": {
      const ready = charactersOf(s, p).filter((x) => !x.exhausted);
      if (!ready.length) {
        log(
          s,
          `${e.text ?? "The Siege of Gondor"}: ${who(s, p)} control${s.table ? "s" : ""} no ready character.`,
        );
        return true;
      }
      if (ready.length === 1) {
        prepend(
          s,
          fx("sgExhaustTarget", {
            target: ready[0].id,
            text: e.text,
            player: p,
          }),
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text ?? "The Siege of Gondor"} · Exhaust a character you control${seatLabel(s, p)}`,
          ready.map((x) => ({
            id: x.id,
            code: x.code,
            label: name(x),
            effects: [
              fx("sgExhaustTarget", { target: x.id, text: e.text, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    case "sgExhaustTarget":
      if (u && !u.exhausted) {
        forOwner(s, ownerOf(s, u), () => exhaustCharacter(s, u));
        log(
          s,
          `${e.text ?? "The Siege of Gondor"}: ${name(u)} is exhausted.`,
          "danger",
        );
      }
      return true;
    // Haradrim Pirate, Forced: when it engages you.
    case "sgPirate": {
      const amount = e.value ?? 1;
      const characters = charactersOf(s, p);
      if (!characters.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `Haradrim Pirate · Deal ${amount} damage to a character you control${seatLabel(s, p)}`,
          characters.map((c) => ({
            id: c.id,
            code: c.code,
            label: `${name(c)} · ${c.damage} damage`,
            effects: [fx("damage", { target: c.id, value: amount, player: p })],
          })),
          "Forced: when Haradrim Pirate engages you, deal 1 damage to a character you control (2 damage instead if the active location is a Ship).",
        ),
      );
      return true;
    }
    // Ship travel: discard from the top until a Corsair enemy is discarded.
    case "sgSeek": {
      const pile = s.encounterDiscard.splice(0);
      s.encounterDeck = shuffle(s, [...s.encounterDeck, ...pile]);
      log(
        s,
        `${e.text ?? "Travel"}: the encounter discard pile is shuffled into the encounter deck.`,
      );
      while (s.encounterDeck.length) {
        const code = s.encounterDeck.shift()!;
        if (!isSgCorsairCode(code)) {
          s.encounterDiscard.push(code);
          log(s, `${e.text ?? "Travel"}: ${card(code).name} is discarded.`);
          continue;
        }
        const enemy = make(s, code);
        s.staging.push(enemy);
        log(
          s,
          `${e.text ?? "Travel"}: ${card(code).name} is discarded and added to the staging area.`,
          "danger",
        );
        enemyAddedToStaging(s, enemy);
        return true;
      }
      log(s, `${e.text ?? "Travel"}: no Corsair enemy is discarded.`);
      return true;
    }
    // Great Corsair Ship travel: each player searches for a Corsair enemy.
    case "sgShipSearch": {
      const last = e.flag;
      const pool = corsairsAvailable(s);
      const mustCaptain = last && !q.captainFound && pool.includes(SG.captain);
      const options: Option[] = [];
      for (const zone of ["deck", "discard"] as const)
        for (const code of [
          ...new Set(
            (zone === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
              (c) => isSgCorsairCode(c) && (!mustCaptain || c === SG.captain),
            ),
          ),
        ])
          options.push({
            id: `${zone}-${code}`,
            code,
            label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [fx("sgShipTake", { code, text: zone, player: p })],
          });
      if (!options.length) {
        log(
          s,
          `Great Corsair Ship: no Corsair enemy remains for ${who(s, p)}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Great Corsair Ship · Search for a Corsair enemy${seatLabel(s, p)}`,
          options,
          mustCaptain
            ? "Travel: one of those enemies must be Corsair Captain, if able."
            : "Travel: each player searches the encounter deck and discard pile for a Corsair enemy and adds it to the staging area. One of those enemies must be Corsair Captain, if able.",
        ),
      );
      return true;
    }
    case "sgShipTake": {
      const pile = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = e.code ? pile.lastIndexOf(e.code) : -1;
      if (i < 0) return true;
      pile.splice(i, 1);
      if (e.code === SG.captain) q.captainFound = true;
      const enemy = make(s, e.code!);
      s.staging.push(enemy);
      log(
        s,
        `Great Corsair Ship: ${who(s, p)} ${verb(s, "add")} ${card(e.code!).name} to the staging area.`,
        "danger",
      );
      enemyAddedToStaging(s, enemy);
      return true;
    }
    case "sgShipDone":
      delete q.captainFound;
      shuffle(s, s.encounterDeck);
      log(s, "Great Corsair Ship: the encounter deck is shuffled.");
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hooks.

export const SIEGE_GONDOR_HOOKS: Batch4ScenarioHooks = {
  setup: setupSiegeGondor,
  // 1A Setup: each player searches for a Ship location once the hands are kept.
  openingHandsKept: (s) => {
    if (!s.siegeGondor || s.round > 0) return false;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("sgSetupSearch", { player })),
      fx("sgShuffle", { text: "Attack on Pelargir", player: firstPlayer(s) }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: siegeGondorStageInfo,
  check: (s) => {
    if (!s.siegeGondor || s.status !== "playing") return;
    lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // The Corsair Fleet, Forced: at the beginning of the staging step.
  committed: (s) => {
    const fleet = sgFleet(s);
    if (s.siegeGondor && fleet && !fleet.blanked)
      prepend(s, fx("sgFleet", { target: fleet.id, player: firstPlayer(s) }));
  },
  // Pelargir Quays, Forced: at the end of the round.
  roundEnd: (s) => {
    const q = s.siegeGondor;
    if (!q) return [];
    delete q.moored;
    const quays = [...s.staging, ...allActiveLocations(s)].filter((u) =>
      live(u, SG.quays),
    );
    return quays.map((u) =>
      fx("sgQuays", { target: u.id, player: firstPlayer(s) }),
    );
  },
  // 1B: each Ship location in the staging area is immune to player card effects.
  immune: (s, u) => at(s, SG.pelargir) && isShip(u) && inStaging(s, u),
  stats: (s, u) => {
    if (!s.siegeGondor) return {};
    // Corsair of Umbar: +2 attack and +2 defense while the active location is a Ship.
    if (live(u, SG.corsair) && shipActive(s)) return { attack: 2, defense: 2 };
    // Haradrim Pirate's shadow: -1 defense for each damage on the defending character.
    const c = s.combat;
    if (c?.sgPirate && isCharacter(u) && u.damage > 0) {
      const ids = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
      if (ids.includes(u.id)) return { defense: -u.damage };
    }
    return {};
  },
  threatBonus: (s, u) => {
    const q = s.siegeGondor;
    if (!q) return 0;
    let bonus = 0;
    // Great Corsair Ship: X is the number of resources on The Corsair Fleet.
    if (u.code === SG.greatShip && !u.blanked) bonus += sgFleetResources(s);
    // Black Sails: +1 threat for each copy until the end of the phase.
    if (
      q.sails?.round === s.round &&
      q.sails.phase === phaseOf(s) &&
      inStaging(s, u)
    )
      bonus += q.sails.ids.filter((id) => id === u.id).length;
    return bonus;
  },
  // Raiding the Coasts: +3 total threat in the staging area until the end of the phase.
  stagingThreat: (s) => {
    const r = s.siegeGondor?.raiding;
    return r && r.round === s.round && r.phase === phaseOf(s) ? r.amount : 0;
  },
  engagementBonus: (s, u) => {
    if (!s.siegeGondor || !isCorsair(u)) return 0;
    return (
      (activeIs(s, SG.galley) ? -SG_GALLEY_ENGAGEMENT : 0) +
      (live(u, SG.captain) && shipActive(s) ? -SG_CAPTAIN_ENGAGEMENT : 0)
    );
  },
  // Corsair Dromon: each Corsair enemy gains Archery 1 (from the staging area).
  combatBegin: (s) => {
    if (!s.siegeGondor || !activeIs(s, SG.dromon)) return;
    const archery = s.staging.filter(isCorsair).length;
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  cannotOptionallyEngage: (s, u) => !!s.siegeGondor && live(u, SG.captain),
  cannotAttach: (s, u) => !!s.siegeGondor && live(u, SG.crew),
  engaged: (s, u) => {
    if (!s.siegeGondor || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === SG.pirate)
      prepend(
        s,
        fx("sgPirate", {
          value: shipActive(s) ? 2 : 1,
          target: u.id,
          player: p,
        }),
      );
    if (u.code === SG.crew)
      prepend(
        s,
        fx("sgExhaust", { text: "Umbar Pirate Crew", target: u.id, player: p }),
      );
    if (u.code === SG.captain && shipActive(s)) {
      log(
        s,
        "Corsair Captain engages while the active location is a Ship: it makes an immediate attack.",
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: p }));
    }
  },
  // Port of Pelargir's shadow: a character this attack damages cannot ready.
  damageDealt: (s, u, amount, context) => {
    const q = s.siegeGondor,
      c = s.combat;
    if (!q || !c?.sgPort || amount <= 0 || !isCharacter(u)) return;
    if (!context.combatDamage || context.enemyId !== c.enemyId) return;
    q.moored = {
      round: s.round,
      ids: [...(q.moored?.round === s.round ? q.moored.ids : []), u.id],
    };
  },
  cannotReady: (s, u) =>
    !!s.siegeGondor?.moored &&
    s.siegeGondor.moored.round === s.round &&
    s.siegeGondor.moored.ids.includes(u.id),
  // Raiding the Coasts' shadow: if this attack destroys a character.
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.siegeGondor || !c?.sgRaiding || !isCharacter(u)) return;
    if (!context.combatDamage || context.enemyId !== c.enemyId) return;
    c.sgRaiding = false;
    prepend(
      s,
      fx("sgDiscardAttachment", { player: c.attackPlayer ?? ownerOf(s, u) }),
    );
  },
  // Port of Pelargir: no more than 1 damage healed from each character each round.
  cannotHeal: (s, u) => {
    const q = s.siegeGondor;
    if (!q || !stagingLive(s, SG.port)) return false;
    return (
      (q.healed?.round === s.round ? (q.healed.amounts[u.id] ?? 0) : 0) >= 1
    );
  },
  healLimit: (s, u) => {
    const q = s.siegeGondor;
    if (!q || !stagingLive(s, SG.port)) return undefined;
    const healed =
      q.healed?.round === s.round ? (q.healed.amounts[u.id] ?? 0) : 0;
    return Math.max(0, 1 - healed);
  },
  healed: (s, u, amount) => {
    const q = s.siegeGondor;
    if (!q || amount <= 0) return;
    const amounts = q.healed?.round === s.round ? q.healed.amounts : {};
    q.healed = {
      round: s.round,
      amounts: { ...amounts, [u.id]: (amounts[u.id] ?? 0) + amount },
    };
  },
  travelProblem: (s, u) => {
    if (!s.siegeGondor || u.blanked) return null;
    if (u.code === SG.greatShip) {
      const ships = sgShipsInVictory(s);
      if (ships < SG_SHIPS_TO_TRAVEL)
        return `Great Corsair Ship: the players cannot travel here unless there are at least ${SG_SHIPS_TO_TRAVEL} Ship locations in the victory display (${ships}).`;
      return null;
    }
    if (
      (u.code === SG.galley || u.code === SG.dromon) &&
      !corsairsAvailable(s).length
    )
      return `${name(u)}: there is no Corsair enemy in the encounter deck or discard pile to add to the staging area.`;
    return null;
  },
  travelEffects: (s, u) => {
    if (!s.siegeGondor || u.blanked) return undefined;
    const first = firstPlayer(s);
    if (u.code === SG.galley || u.code === SG.dromon)
      return [fx("sgSeek", { text: name(u), player: first })];
    if (u.code === SG.greatShip) {
      const order = playerOrder(s);
      return [
        ...order.map((player, i) =>
          fx("sgShipSearch", { flag: i === order.length - 1, player }),
        ),
        fx("sgShipDone", { player: first }),
      ];
    }
    return undefined;
  },
  effect: siegeGondorEffect,
  sharedEffect: (e) =>
    [
      "sgTreacheryDone",
      "sgShuffle",
      "sgFleet",
      "sgQuaysDamage",
      "sgQuays",
      "sgSails",
      "sgBrinkEnd",
      "sgSeek",
      "sgShipDone",
    ].includes(e.kind),
};
