import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle } from "./core";
import { enemyAddedToStaging, exhaustCharacter, raiseThreat } from "./board";
import { reduceThreat } from "./threat-reduction";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { epicTeams } from "./epic";
import { BG } from "./black-gate-support";
import { MD } from "./mount-doom-support";
import { ME, ME_NAMES, meEye, mofEpicLive } from "./mof-epic-support";
export * from "./mof-epic-support";

/**
 * The Mountain of Fire's epic multiplayer mode: two teams play The Black Gate
 * Opens and Mount Doom at once (src/game/epic.ts holds the teams' games and
 * their turns). This layer adds the Epic Multiplayer Mode card, In Darkness
 * Bind Them and The Eye of Sauron to both scenarios' hooks, and lets the
 * Nazgûl that The Eye of Sauron carries keep their printed text at the other
 * scenario.
 */
const BGO = "the-black-gate-opens";
const traits = (code: string) =>
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .filter(Boolean);
const isEnemy = (u: Unit) => card(u.code).type_code === "enemy";
const isNazgul = (code: string) =>
  card(code).type_code === "enemy" && traits(code).includes("Nazgûl");
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const teamName = (t: GameState) => ME_NAMES[t.epicTeam ?? 0];
/** A team's staging area, as the cards name it. */
const stagingOf = (t: GameState) =>
  t.epicTeam === 0
    ? "The Black Gate Opens staging area"
    : "the Mount Doom staging area";
/** The other scenario's game. */
const otherTeam = (s: GameState) =>
  epicTeams(s).find((t) => t !== s && t.epicTeam !== s.epicTeam);
/** The scenario state that holds a treachery while it resolves. */
const holder = (s: GameState) => s.blackGate ?? s.mountDoom;
/** Effects for a team's players: at once for the active team, at its next turn otherwise. */
function queueFor(s: GameState, team: GameState, effects: Effect[]) {
  if (!effects.length) return;
  if (team === s) prepend(s, ...effects);
  else team.queue = [...effects, ...team.queue];
}
/** An encounter card moves to the other scenario's staging area (new ids; its damage stays). */
function moveToTeam(team: GameState, u: Unit) {
  const moved: Unit = {
    ...structuredClone(u),
    id: `c${team.nextId++}`,
    attachments: u.attachments.map((a) => ({
      ...structuredClone(a),
      id: `a${team.nextId++}`,
    })),
    shadows: [],
    revealedShadowCount: 0,
  };
  delete moved.faceupShadows;
  delete moved.owner;
  team.staging.push(moved);
  if (isEnemy(moved)) enemyAddedToStaging(team, moved);
  return moved;
}
const charactersOf = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];

// ---------------------------------------------------------------------------
// Setup: a copy of In Darkness Bind Them in each encounter deck, and The Eye
// of Sauron, Mount Doom side faceup, in the Mount Doom staging area.

export function mofEpicSetup(s: GameState) {
  s.encounterDeck = shuffle(s, [...s.encounterDeck, ME.bind]);
  const doom = s.epicTeam === 1;
  if (doom) s.staging.push(make(s, ME.eyeDoom));
  log(
    s,
    `Epic multiplayer mode · ${teamName(s)}: a copy of In Darkness Bind Them is shuffled into the encounter deck${doom ? ", and The Eye of Sauron is placed in the staging area with its Mount Doom side faceup" : ""}.`,
    "chapter",
  );
}

// ---------------------------------------------------------------------------
// In Darkness Bind Them.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (code !== ME.bind) return false;
  if (!fromReveal) {
    if (!replay) s.encounterDiscard.push(code);
    return true;
  }
  if (replay) {
    const i = s.encounterDiscard.lastIndexOf(code);
    if (i >= 0) s.encounterDiscard.splice(i, 1);
  }
  const q = holder(s);
  const u = make(s, code);
  q?.resolving.push(u);
  prepend(
    s,
    ...playerOrder(s).map((player) => fx("meBindExhaust", { player })),
    fx("meBindDone", { source: u.id, player: firstPlayer(s) }),
  );
  return true;
}
function shadow(s: GameState, code: string) {
  if (code !== ME.bind) return false;
  const c = s.combat;
  if (!c) return true;
  if (!meEye(s)) {
    log(
      s,
      "Shadow: In Darkness Bind Them · The Eye of Sauron is not in the staging area: no effect.",
    );
    return true;
  }
  c.attackBonus += 2;
  c.returnToStaging = true;
  log(
    s,
    "Shadow: In Darkness Bind Them · The Eye of Sauron is in the staging area: the attacking enemy gets +2 attack and returns to the staging area after this attack.",
    "danger",
  );
  return true;
}

// ---------------------------------------------------------------------------
// Effects.

function effect(s: GameState, e: Effect): boolean {
  if (!mofEpicLive(s)) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s);
  switch (e.kind) {
    // In Darkness Bind Them: each player exhausts a character he controls.
    case "meBindExhaust": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      if (ready.length === 1) {
        prepend(s, fx("meBindExhaustTake", { target: ready[0].id, player: p }));
        return true;
      }
      choose(
        s,
        `In Darkness Bind Them · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("meBindExhaustTake", { target: u.id, player: p })],
        })),
        card(ME.bind).text,
      );
      return true;
    }
    case "meBindExhaustTake": {
      const u = get(s, e.target);
      if (!u || u.exhausted) return true;
      forOwner(s, p, () => exhaustCharacter(s, u));
      log(s, `In Darkness Bind Them: ${name(u)} is exhausted.`, "danger");
      return true;
    }
    case "meBindDone": {
      const q = holder(s);
      if (q) q.resolving = q.resolving.filter((u) => u.id !== e.source);
      s.encounterDiscard.push(ME.bind);
      if (meEye(s)) {
        s.epicBound = s.round;
        log(
          s,
          "In Darkness Bind Them: The Eye of Sauron is in the staging area, so characters cannot be readied by player card effects this round.",
          "danger",
        );
      }
      return true;
    }
    // The Eye of Sauron: at the end of the round it flips and moves, with each
    // Nazgûl enemy in the staging area, to the other scenario, unless the
    // first player raises each player's threat by 3 (once a round).
    case "meEye": {
      const eye = meEye(s);
      const epic = s.epic;
      const team = otherTeam(s);
      if (!eye || !epic || epic.eyeRound === s.round || !team) return true;
      epic.eyeRound = s.round;
      choose(
        s,
        `The Eye of Sauron · Raise each player's threat by 3 to keep it at ${teamName(s)}?${seatLabel(s, first)}`,
        [
          {
            id: "move",
            label: `Flip The Eye of Sauron and move it, with each Nazgûl enemy in the staging area, to ${stagingOf(team)}`,
            effects: [fx("meEyeMove", { player: first })],
          },
          {
            id: "cancel",
            label: "Raise each player's threat by 3 to cancel this effect",
            effects: [fx("meEyeCancel", { player: first })],
          },
        ],
        card(eye.code).text,
      );
      return true;
    }
    case "meEyeCancel":
      for (const player of playerOrder(s))
        forOwner(s, player, () => raiseThreat(s, 3, "encounter"));
      log(
        s,
        `The Eye of Sauron: each player raises his threat by 3; it stays at ${teamName(s)}.`,
        "danger",
      );
      return true;
    case "meEyeMove": {
      const eye = meEye(s);
      const team = otherTeam(s);
      if (!eye || !team) return true;
      s.staging = s.staging.filter((u) => u.id !== eye.id);
      team.staging.push(
        make(team, eye.code === ME.eyeDoom ? ME.eyeGate : ME.eyeDoom),
      );
      const nazgul = s.staging.filter(
        (u) => isEnemy(u) && isNazgul(u.code) && u.id !== eye.id,
      );
      s.staging = s.staging.filter((u) => !nazgul.includes(u));
      for (const u of nazgul) moveToTeam(team, u);
      const carried = nazgul.length
        ? `, with ${nazgul.map((u) => name(u)).join(", ")}`
        : "";
      log(
        s,
        `The Eye of Sauron flips and moves to ${stagingOf(team)}${carried}.`,
        "danger",
      );
      log(
        team,
        `The Eye of Sauron flips and arrives in the staging area from ${teamName(s)}${carried}.`,
        "danger",
      );
      return true;
    }
    // Epic Multiplayer Mode: the first player chooses a scenario.
    case "meEpic":
      choose(
        s,
        `Epic Multiplayer Mode · Choose a scenario: each player there draws 1 card, and each player at the other scenario reduces his threat by 3${seatLabel(s, first)}`,
        [0, 1].map((team) => ({
          id: `team-${team}`,
          label: `${ME_NAMES[team]}: each player there draws 1 card; each player at ${ME_NAMES[1 - team]} reduces his threat by 3`,
          effects: [fx("meEpicChosen", { value: team, player: first })],
        })),
        card(ME.mode).back_text,
      );
      return true;
    case "meEpicChosen": {
      const teams = epicTeams(s);
      const chosen = teams[e.value ?? 0];
      const other = teams.find((t) => t !== chosen)!;
      const effects = (t: GameState) =>
        playerOrder(t).map((player) =>
          t === chosen
            ? fx("draw", { value: 1, player })
            : fx("meThreatDown", { player }),
        );
      log(
        s,
        `Epic Multiplayer Mode: ${teamName(chosen)} is chosen: each player there draws 1 card, and each player at ${teamName(other)} reduces his threat by 3.`,
        "good",
      );
      for (const t of teams.filter((t) => t !== s)) queueFor(s, t, effects(t));
      // Then the player who controls Gwaihir may give control of it.
      prepend(s, ...effects(s), fx("meGwaihir", { player: first }));
      return true;
    }
    case "meThreatDown":
      forOwner(s, p, () => reduceThreat(s, 3, card(ME.mode).name, "encounter"));
      return true;
    case "meGwaihir":
      for (const team of epicTeams(s))
        for (const player of playerOrder(team)) {
          const g = seatView(team, player).allies.find(
            (u) => u.code === BG.gwaihir,
          );
          if (!g) continue;
          queueFor(s, team, [fx("meGwaihirOffer", { target: g.id, player })]);
          return true;
        }
      return true;
    case "meGwaihirOffer": {
      const g = seatView(s, p).allies.find((u) => u.id === e.target);
      if (!g) return true;
      const targets = epicTeams(s).flatMap((team) =>
        playerOrder(team)
          .filter((x) => team !== s || x !== p)
          .map((x) => ({ team, player: x })),
      );
      if (!targets.length) return true;
      choose(
        s,
        `Gwaihir · Give control of Gwaihir to another player?${seatLabel(s, p)}`,
        [
          { id: "keep", label: "Keep control of Gwaihir", effects: [] },
          ...targets.map(({ team, player }) => ({
            id: `give-${team.epicTeam}-${player}`,
            label: `Give control of Gwaihir to ${team.table ? `${seatName(team, player)} at ` : ""}${teamName(team)}`,
            effects: [
              fx("meGwaihirGive", {
                target: g.id,
                value: team.epicTeam,
                text: String(player),
                player: p,
              }),
            ],
          })),
        ],
        card(ME.mode).back_text,
      );
      return true;
    }
    case "meGwaihirGive": {
      const team = epicTeams(s)[e.value ?? -1];
      const to = Number(e.text);
      const g = seatView(s, p).allies.find((u) => u.id === e.target);
      if (!team || !g || !Number.isInteger(to)) return true;
      forOwner(s, p, () => {
        s.allies = s.allies.filter((u) => u.id !== g.id);
      });
      if (team === s) {
        if (s.table) g.owner = to;
        forOwner(s, to, () => s.allies.push(g));
      } else {
        const moved: Unit = {
          ...structuredClone(g),
          id: `c${team.nextId++}`,
          attachments: g.attachments.map((a) => ({
            ...structuredClone(a),
            id: `a${team.nextId++}`,
          })),
        };
        if (team.table) moved.owner = to;
        else delete moved.owner;
        forOwner(team, to, () => team.allies.push(moved));
        log(
          team,
          `Gwaihir arrives from ${teamName(s)}: ${team.table ? seatName(team, to) : "you"} ${team.table ? "takes" : "take"} control of him.`,
          "good",
        );
      }
      log(
        s,
        `Gwaihir: control passes to ${team.table ? `${seatName(team, to)} at ` : ""}${teamName(team)}.`,
        "good",
      );
      return true;
    }
    // Nazgûl of Mordor at Mount Doom: raise your threat by 4 or return it to
    // the staging area.
    case "meNazgul": {
      const u = get(s, e.target);
      const engaged = !!u && seatView(s, p).engaged.some((x) => x.id === u.id);
      const options = [
        {
          id: "threat",
          label: "Raise your threat by 4",
          effects: [fx("meNazgulThreat", { player: p })],
        },
        ...(engaged
          ? [
              {
                id: "return",
                code: BG.nazgul,
                label: "Return Nazgûl of Mordor to the staging area",
                effects: [fx("meReturn", { target: u!.id, player: p })],
              },
            ]
          : []),
      ];
      if (options.length === 1) {
        prepend(s, ...options[0].effects);
        return true;
      }
      choose(
        s,
        `Nazgûl of Mordor · Choose one${seatLabel(s, p)}`,
        options,
        "Forced: after Nazgûl of Mordor attacks, either raise your threat by 4, or return Nazgûl of Mordor to the staging area.",
      );
      return true;
    }
    case "meNazgulThreat":
      forOwner(s, p, () => raiseThreat(s, 4, "encounter"));
      log(s, "Nazgûl of Mordor: the defending player raises his threat by 4.");
      return true;
    case "meReturn": {
      const u = get(s, e.target);
      if (!u) return true;
      const owner = playerOrder(s).find((x) =>
        seatView(s, x).engaged.some((y) => y.id === u.id),
      );
      if (owner === undefined) return true;
      forOwner(s, owner, () => {
        s.engaged = s.engaged.filter((y) => y.id !== u.id);
      });
      s.encounterDiscard.push(...u.shadows);
      u.shadows = [];
      delete u.faceupShadows;
      u.revealedShadowCount = 0;
      s.staging.push(u);
      log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
  }
  return false;
}
const SHARED = [
  "meBindDone",
  "meEye",
  "meEyeCancel",
  "meEyeMove",
  "meEpic",
  "meEpicChosen",
  "meGwaihir",
];

// ---------------------------------------------------------------------------
// The Eye of Sauron's constant effects and the carried Nazgûl.

/** The Black Gate Opens side: each enemy in the staging area gets +1 threat. */
function threatBonus(s: GameState, u: Unit) {
  let bonus = 0;
  if (meEye(s)?.code === ME.eyeGate && isEnemy(u) && inStaging(s, u))
    bonus += 1;
  // Hell-hawk carried to Mount Doom on its Nazgûl: +2 threat.
  if (s.scenarioId !== BGO && hawked(u)) bonus += 2;
  return bonus;
}
/** The Black Gate Opens side: and -10 engagement cost. */
const engagementBonus = (s: GameState, u: Unit) =>
  meEye(s)?.code === ME.eyeGate && isEnemy(u) && inStaging(s, u) ? -10 : 0;
/** The Mount Doom side: add 1 Sauron's Eye icon to each Fortitude test. */
const fortitudeBonus = (s: GameState) =>
  meEye(s)?.code === ME.eyeDoom && s.hideTest?.kind === "fortitude" ? 1 : 0;
const hawked = (u: Unit) =>
  u.attachments.some((a) => a.code === BG.hawk && !a.blanked);
const morgul = (code: string) => traits(code).includes("Morgul");
/** Each Nazgûl's "No non-Morgul attachments." at the other scenario. */
const cannotAttach = (s: GameState, u: Unit, code: string) =>
  !morgul(code) &&
  ((s.scenarioId === BGO && u.code === MD.wraith) ||
    (s.scenarioId !== BGO && u.code === BG.nazgul));

function roundEnd(s: GameState): Effect[] {
  if (!mofEpicLive(s)) return [];
  const first = firstPlayer(s);
  const effects: Effect[] = [];
  if (meEye(s) && s.epic?.eyeRound !== s.round)
    effects.push(fx("meEye", { player: first }));
  // The Epic Multiplayer Mode card, next to the Mount Doom quest deck.
  if (s.epicTeam === 1) effects.push(fx("meEpic", { player: first }));
  return effects;
}
function attackFinished(
  s: GameState,
  c: NonNullable<GameState["combat"]>,
  skipped = false,
): Effect[] {
  if (!mofEpicLive(s) || skipped || s.scenarioId === BGO) return [];
  const enemy = get(s, c.enemyId);
  if (!enemy || enemy.code !== BG.nazgul || enemy.blanked) return [];
  return [
    fx("meNazgul", {
      target: enemy.id,
      player: c.attackPlayer ?? activeSeat(s),
    }),
  ];
}

/** Both scenarios' hooks with the epic multiplayer mode's cards. */
export function composeMofEpic(h: Batch4ScenarioHooks): Batch4ScenarioHooks {
  return {
    ...h,
    setup: (s) => {
      h.setup?.(s);
      mofEpicSetup(s);
    },
    encounter: (s, code, replay, fromReveal) =>
      encounter(s, code, replay, fromReveal) ||
      !!h.encounter?.(s, code, replay, fromReveal),
    shadow: (s, code) => shadow(s, code) || !!h.shadow?.(s, code),
    effect: (s, e) => effect(s, e) || !!h.effect?.(s, e),
    sharedEffect: (e) => SHARED.includes(e.kind) || !!h.sharedEffect?.(e),
    roundEnd: (s) => [...(h.roundEnd?.(s) ?? []), ...roundEnd(s)],
    attackFinished: (s, c, skipped) => [
      ...(h.attackFinished?.(s, c, skipped) ?? []),
      ...attackFinished(s, c, skipped),
    ],
    threatBonus: (s, u) => (h.threatBonus?.(s, u) ?? 0) + threatBonus(s, u),
    engagementBonus: (s, u) =>
      (h.engagementBonus?.(s, u) ?? 0) + engagementBonus(s, u),
    hideThreatBonus: (s, p) =>
      (h.hideThreatBonus?.(s, p) ?? 0) + fortitudeBonus(s),
    cannotPlayerReady: (s) =>
      !!h.cannotPlayerReady?.(s) || s.epicBound === s.round,
    stats: (s, u) => {
      const base = h.stats?.(s, u) ?? {};
      if (s.scenarioId === BGO || !hawked(u)) return base;
      return {
        ...base,
        attack: (base.attack ?? 0) + 2,
        defense: (base.defense ?? 0) + 2,
      };
    },
    immune: (s, u) => !!h.immune?.(s, u) || (s.scenarioId !== BGO && hawked(u)),
    cannotAttach: (s, u, code) =>
      !!h.cannotAttach?.(s, u, code) || cannotAttach(s, u, code),
  };
}
