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
  removeShadowCard,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  depositInFlightEncounterCards,
  destroy,
  discardAttachment,
  discardLocation,
  enemyAddedToStaging,
  enterAlly,
  enterEnemyEngaged,
  progress,
  questDefeated,
  raiseThreat,
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
  globalPlayerOrder,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { mainQuestUnit } from "./quest-state";
import { fellowshipAragorn, lotrSagaCheck } from "./lotr-saga";
import { hasTrait } from "./expansion-passives";
import { returnToStaging } from "./black-riders-hunted";
import { dealEnemyShadows } from "./considered-engagement";
import { reduceThreat } from "./threat-reduction";
import { whiteHandArchery } from "./white-hand";
import {
  PF,
  PF_MUMAK_CAP,
  PF_MUMAK_THREAT,
  PF_ROHAN_SEARCH,
  PF_WALL_THREAT,
  PF_WRAITH_LIMIT,
  PELENNOR_FIELDS_RECIPES,
  pelennorFieldsStageInfo,
  pfMinasTirith,
  pfMinasTirithHealth,
  pfStagingAllies,
  setPelennorCardLookup,
} from "./pelennor-fields-support";
export * from "./pelennor-fields-support";
setPelennorCardLookup((code) => card(code));

/**
 * The Battle of the Pelennor Fields, the third scenario of The Flame of the
 * West. The garrison of Gondor gathers, the army of Mordor drives the
 * defenders back from Osgiliath and besieges the White City, Rohan comes, and
 * on the fields the players must defeat The Witch-king with Aragorn in play
 * while Minas Tirith still stands.
 */
const TREACHERIES: readonly string[] = [
  PF.rammas,
  PF.beast,
  PF.dart,
  PF.ruin,
  PF.despair,
  PF.shadow,
];
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const isCharacter = (u: Unit) => isHero(u) || isAlly(u);
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string, plural = `${base}s`) =>
  s.table ? plural : base;
const players = (s: GameState) => globalPlayerOrder(s).length;
/** The game phase, its steps included. */
const phaseOf = (s: GameState) =>
  s.phase === "staging" ? "quest" : s.phase === "attack" ? "defense" : s.phase;
/** The current quest's text is in effect. */
const stageLive = (s: GameState) =>
  !s.stageRevealing &&
  !mainQuestUnit(s)?.blanked &&
  !s.pelennorFields?.advancing;
const at = (s: GameState, quest: string) =>
  s.pelennorFields?.currentQuest === quest && stageLive(s);
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].filter((u) => isEnemy(u));
const isNazgul = (u: Unit) => isEnemy(u) && hasTrait(u, "Nazgûl");
const witchKing = (s: GameState) =>
  enemiesInPlay(s).find((u) => u.code === PF.witchKing);
const activeIs = (s: GameState, code: string) =>
  allActiveLocations(s).some((u) => live(u, code));
const inPlayLive = (s: GameState, code: string) =>
  [...s.staging, ...allActiveLocations(s)].some((u) => live(u, code));
const beasts = (u: Unit) =>
  u.attachments.filter((a) => a.code === PF.beast && !a.blanked).length;
const defendersOf = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : [])).filter(
    (id) => !!get(s, id),
  );
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
/** The attachments a player controls, with their hosts. */
function attachmentsOf(s: GameState, p: number, nonObjective = false) {
  const hosts = [
    ...globalCharacters(s),
    ...s.staging,
    ...globalEngaged(s),
    ...allActiveLocations(s),
  ];
  return hosts.flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          attachmentController(s, host, a) === p &&
          // The Esquires are Permanent: they leave play only with their hero.
          a.code !== PF.esquireRohan &&
          a.code !== PF.esquireGondor &&
          (!nonObjective || card(a.code).type_code !== "objective"),
      )
      .map((a) => ({ host, a })),
  );
}
/** Damage to Minas Tirith can still be dealt: it is in play, or City Wall takes it. */
const minasTirithReachable = (s: GameState) =>
  !!pfMinasTirith(s) || activeIs(s, PF.wall);

/**
 * Deal damage to Minas Tirith: an active City Wall takes it first (and is
 * discarded at 4 damage for 3 threat each); before stage 3A, the damage that
 * Minas Tirith cannot take is lost, as the rules card resolves it as fully as
 * possible.
 */
function dealMinasTirith(s: GameState, amount: number, text: string) {
  if (amount <= 0 || s.status !== "playing") return;
  let rest = amount;
  const wall = allActiveLocations(s).find((u) => live(u, PF.wall));
  if (wall) {
    const points = card(wall.code).quest ?? 4;
    const toWall = Math.min(rest, Math.max(0, points - wall.damage));
    if (toWall > 0) {
      wall.damage += toWall;
      rest -= toWall;
      log(
        s,
        `${text}: City Wall takes ${toWall} damage instead of Minas Tirith (${wall.damage}/${points}).`,
        "danger",
      );
    }
    if (wall.damage >= points) {
      discardLocation(s, wall);
      log(
        s,
        `City Wall is discarded: each player raises his threat by ${PF_WALL_THREAT}.`,
        "danger",
      );
      for (const p of playerOrder(s))
        forOwner(s, p, () => raiseThreat(s, PF_WALL_THREAT, "encounter"));
    }
  }
  if (rest <= 0) return;
  const mt = pfMinasTirith(s);
  if (!mt) {
    log(s, `${text}: Minas Tirith is not in play, so its damage is not dealt.`);
    return;
  }
  mt.damage += rest;
  log(
    s,
    `${text}: ${rest} damage to Minas Tirith (${mt.damage}/${pfMinasTirithHealth(players(s))}).`,
    "danger",
  );
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupPelennorFields(s: GameState) {
  const r = PELENNOR_FIELDS_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  s.staging = [];
  const [field] = section("sharedActiveLocation");
  s.activeLocation = field ? make(s, field) : null;
  s.pelennorFields = {
    currentQuest: PF.garrison,
    advancing: false,
    resolving: [],
    setAside: section("sharedSetAside"),
  };
  log(
    s,
    "The Garrison of Gondor: Minas Tirith, Grond, The Witch-king and each Wraith on Wings are set aside, out of play, and Pelennor Field is the active location.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.pelennorFields;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // 4B advances at the end of the quest phase.
  if (q.currentQuest === PF.rohan) return true;
  const goal = pelennorFieldsStageInfo(s)?.quest ?? 0;
  // 2B's X can be 0: the stage is then defeated at once.
  if (
    q.currentQuest === PF.retreat
      ? s.progress < goal
      : goal <= 0 || s.progress < goal
  )
    return true;
  if (q.currentQuest === PF.fields) {
    // 5B cannot be defeated unless Aragorn is in play and The Witch-king is in the victory display.
    if (!fellowshipAragorn(s) || !(s.victoryCards ?? []).includes(PF.witchKing))
      return true;
    questDefeated(s, q.currentQuest);
    win(
      s,
      "Fighting in the Fields is defeated: The Witch-king has fallen, and with Aragorn on the Pelennor the players win the game.",
    );
    return true;
  }
  q.advancing = true;
  prepend(s, fx("pfDefeat", { player: firstPlayer(s) }));
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
  const q = s.pelennorFields;
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
    fx("pfTreachery", { code, source: u.id, player }),
    fx("pfTreacheryDone", { source: u.id, player }),
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
const minasOption = (s: GameState, p: number, amount: number, text: string) =>
  minasTirithReachable(s)
    ? [
        {
          id: "minas",
          label: `Deal ${amount} damage to Minas Tirith`,
          effects: [fx("pfMinas", { value: amount, text, player: p })],
        },
      ]
    : [];
function treachery(s: GameState, held: Unit) {
  const p = activeSeat(s);
  switch (held.code) {
    case PF.rammas:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("pfRammas", { player })),
        fx("pfShuffle", { text: "The Rammas is Breached", player: p }),
      );
      return;
    case PF.beast: {
      const hosts = enemiesInPlay(s).filter((u) => isNazgul(u) && !beasts(u));
      if (!hosts.length) {
        log(
          s,
          "Fell Beast: there is no Nazgûl enemy without a Fell Beast in play.",
        );
        return;
      }
      if (hosts.length === 1) {
        prepend(
          s,
          fx("pfBeastAttach", {
            target: hosts[0].id,
            source: held.id,
            player: p,
          }),
        );
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Fell Beast · Attach to a Nazgûl enemy${seatLabel(s, p)}`,
          hosts.map((u) => ({
            id: u.id,
            code: u.code,
            label: name(u),
            effects: [
              fx("pfBeastAttach", { target: u.id, source: held.id, player: p }),
            ],
          })),
          "Surge. When Revealed: attach to a Nazgûl enemy. Limit 1 per enemy.",
        ),
      );
      return;
    }
    case PF.dart: {
      const free = seatView(s, p).heroes.filter(
        (h) => !h.attachments.some((a) => a.code === PF.dart),
      );
      // A questing hero must be chosen if able, so the whole effect resolves.
      const questing = free.filter(
        (h) => h.committed || s.committedIds.includes(h.id),
      );
      const heroes = questing.length ? questing : free;
      if (!heroes.length) {
        log(
          s,
          `Black Dart: ${who(s, p)} control${s.table ? "s" : ""} no hero without a Black Dart.`,
        );
        return;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Black Dart · Remove a hero you control from the quest${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)}${h.committed || s.committedIds.includes(h.id) ? " · questing" : ""}`,
            effects: [
              fx("pfDartAttach", { target: h.id, source: held.id, player: p }),
            ],
          })),
          "When Revealed: remove a hero you control from the quest and attach Black Dart to that hero. Limit 1 per hero.",
        ),
      );
      return;
    }
    case PF.ruin: {
      const exhausted = globalCharacters(s).filter(
        (u) => isCharacter(u) && u.exhausted,
      );
      either(
        s,
        p,
        "Spells of Ruin",
        [
          ...(exhausted.length
            ? [
                {
                  id: "exhausted",
                  label: `Deal 1 damage to each exhausted character (${exhausted.length})`,
                  effects: [fx("pfRuinExhausted", { player: p })],
                },
              ]
            : []),
          ...minasOption(s, p, 5, "Spells of Ruin"),
        ],
        "When Revealed: either deal 1 damage to each exhausted character, or deal 5 damage to Minas Tirith.",
      );
      return;
    }
    case PF.despair:
      prepend(s, fx("pfDespair", { player: p }));
      return;
    case PF.shadow:
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("pfShadowOfMordor", { player })),
        fx("pfShadowBlank", { player: firstPlayer(s) }),
      );
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.pelennorFields) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  const enemy = get(s, c.enemyId);
  switch (code) {
    case PF.field: {
      const bonus = enemy && hasTrait(enemy, "Harad") ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Pelennor Field: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case PF.eye: {
      const bonus = enemy && hasTrait(enemy, "Mordor") ? 2 : 1;
      c.attackBonus += bonus;
      log(
        s,
        `Orc of the Eye: the attacking enemy gets +${bonus} attack.`,
        "danger",
      );
      return true;
    }
    case PF.champion:
      dealMinasTirith(s, 1, "Southron Champion");
      return true;
    case PF.captain:
      c.pfReturnOnKill = true;
      log(
        s,
        "Morgul Captain: if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
    case PF.orc: {
      if (!pfMinasTirith(s)) {
        log(s, "Mordor Orc: Minas Tirith is not in play.");
        return true;
      }
      const index = enemy?.shadows.indexOf(code) ?? -1;
      if (enemy && index >= 0) removeShadowCard(enemy, index);
      const orc = make(s, PF.orc);
      log(
        s,
        `Mordor Orc engages ${who(s, p)} and is dealt a shadow card.`,
        "danger",
      );
      enterEnemyEngaged(s, orc, p);
      forOwner(s, p, () => dealEnemyShadows(s, orc, 1));
      return true;
    }
    case PF.rammas:
      either(
        s,
        p,
        "The Rammas is Breached",
        [
          ...minasOption(s, p, 3, "The Rammas is Breached"),
          {
            id: "attack",
            label:
              "The attacking enemy makes an additional attack after this one",
            effects: [
              fx("pfExtraAttack", {
                text: "The Rammas is Breached",
                player: p,
              }),
            ],
          },
        ],
        "Shadow: either deal 3 damage to Minas Tirith, or attacking enemy makes an additional attack after this one.",
      );
      return true;
    case PF.dart:
      c.pfDart = true;
      log(
        s,
        "Black Dart: if this attack damages a hero, Black Dart is attached to that hero.",
        "danger",
      );
      return true;
    case PF.ruin:
      c.attackBonus += 1;
      c.pfRuin = true;
      log(
        s,
        "Spells of Ruin: the attacking enemy gets +1 attack; if this attack destroys a character, 2 damage to Minas Tirith.",
        "danger",
      );
      return true;
    case PF.despair:
      prepend(s, fx("pfDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Searches and helpers.

/** Take a card from the encounter deck, else the discard pile. */
function takeFrom(s: GameState, zone: string | undefined, code: string) {
  const pile = zone === "discard" ? s.encounterDiscard : s.encounterDeck;
  const i = pile.lastIndexOf(code);
  if (i < 0) return false;
  pile.splice(i, 1);
  return true;
}
function enemyOptions(
  s: GameState,
  kind: string,
  p: number,
  test: (code: string) => boolean = () => true,
) {
  const options: Option[] = [];
  for (const zone of ["deck", "discard"] as const)
    for (const code of [
      ...new Set(
        (zone === "deck" ? s.encounterDeck : s.encounterDiscard).filter(
          (c) => card(c).type_code === "enemy" && test(c),
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
}
/** Discard from the top of the encounter deck until an enemy, reshuffling once in the quest phase. */
function discardUntilEnemy(s: GameState, text: string, shuffleFirst = false) {
  if (shuffleFirst) {
    s.encounterDeck = shuffle(s, [
      ...s.encounterDeck,
      ...s.encounterDiscard.splice(0),
    ]);
    log(
      s,
      `${text}: the encounter discard pile is shuffled into the encounter deck.`,
    );
  }
  for (;;) {
    if (
      !s.encounterDeck.length &&
      ["quest", "staging"].includes(s.phase) &&
      s.encounterDiscard.some((c) => card(c).type_code === "enemy")
    ) {
      s.encounterDeck = shuffle(s, s.encounterDiscard.splice(0));
      log(s, "The encounter discard pile is shuffled back into its deck.");
    }
    const code = s.encounterDeck.shift();
    if (!code) {
      log(s, `${text}: no enemy is discarded.`);
      return;
    }
    if (card(code).type_code !== "enemy") {
      s.encounterDiscard.push(code);
      log(s, `${text}: ${card(code).name} is discarded.`);
      continue;
    }
    const enemy = make(s, code);
    s.staging.push(enemy);
    log(
      s,
      `${text}: ${card(code).name} is discarded and added to the staging area.`,
      "danger",
    );
    enemyAddedToStaging(s, enemy);
    return;
  }
}
/** Remove an enemy from play and set it aside, out of play. */
function setAsideEnemy(s: GameState, u: Unit) {
  const q = s.pelennorFields!;
  if (inStaging(s, u)) s.staging = s.staging.filter((x) => x.id !== u.id);
  else
    forOwner(s, ownerOf(s, u), () => {
      s.engaged = s.engaged.filter((x) => x.id !== u.id);
    });
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  s.encounterDiscard.push(...u.shadows);
  u.shadows = [];
  q.setAside.push(u.code);
}
/** Deal damage to an ally in the staging area; it is discarded at its hit points. */
function damageStagingAlly(s: GameState, u: Unit, amount: number) {
  u.damage += amount;
  const health = Number(card(u.code).health) || 0;
  log(s, `${name(u)} takes ${amount} damage in the staging area.`, "danger");
  if (u.damage < health) return;
  s.staging = s.staging.filter((x) => x.id !== u.id);
  const owner = u.owner ?? firstPlayer(s);
  for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
  forOwner(s, owner, () => {
    s.discard.push(u.code);
  });
  log(s, `${name(u)} is discarded from the staging area.`, "danger");
}
const uniqueInPlay = (s: GameState, code: string) =>
  card(code).is_unique &&
  [...globalCharacters(s), ...s.staging].some(
    (u) => card(u.code).name === card(code).name,
  );

// ---------------------------------------------------------------------------
// Effects.

export function pelennorFieldsEffect(s: GameState, e: Effect): boolean {
  const q = s.pelennorFields;
  if (!q) return false;
  // Mordor Orc: while Minas Tirith is in play, its undefended damage goes to Minas Tirith.
  if (e.kind === "enemyDamage") {
    const c = s.combat;
    const enemy = c ? get(s, c.enemyId) : undefined;
    if (
      !c ||
      !enemy ||
      !live(enemy, PF.orc) ||
      !pfMinasTirith(s) ||
      defendersOf(s).length
    )
      return false;
    c.attackResolved = true;
    dealMinasTirith(
      s,
      Math.max(0, stats(s, enemy).attack + c.attackBonus),
      "Mordor Orc's undefended attack",
    );
    return true;
  }
  if (!e.kind.startsWith("pf")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...s.staging, ...globalEngaged(s), ...allActiveLocations(s)].find(
        (x) => x.id === e.target,
      ))
    : undefined;
  switch (e.kind) {
    case "pfTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held);
      return true;
    }
    case "pfTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    // 1A Setup: the players may attach the Esquires to different heroes.
    case "pfEsquire": {
      const code = e.code!;
      if (!q.setAside.includes(code)) return true;
      const other =
        code === PF.esquireRohan ? PF.esquireGondor : PF.esquireRohan;
      const heroes = globalCharacters(s).filter(
        (h) => isHero(h) && !h.attachments.some((a) => a.code === other),
      );
      if (!heroes.length) return true;
      forOwner(s, first, () =>
        choose(
          s,
          `The Garrison of Gondor · Attach ${card(code).name}${seatLabel(s, first)}`,
          [
            ...heroes.map((h) => ({
              id: h.id,
              code: h.code,
              label: `${name(h)}${s.table ? ` · ${seatName(s, ownerOf(s, h))}` : ""}`,
              effects: [
                fx("pfEsquireAttach", { target: h.id, code, player: first }),
              ],
            })),
            { id: "skip", label: "Leave it set aside", effects: [] },
          ],
          "Setup: the players may attach Esquire of Rohan and Esquire of Gondor to different heroes.",
        ),
      );
      return true;
    }
    case "pfEsquireAttach": {
      const i = e.code ? q.setAside.indexOf(e.code) : -1;
      if (!u || i < 0) return true;
      q.setAside.splice(i, 1);
      const owner = ownerOf(s, u);
      u.attachments.push({
        id: make(s, e.code!).id,
        code: e.code!,
        exhausted: false,
        owner,
      });
      log(s, `${card(e.code!).name} is attached to ${name(u)}.`, "good");
      return true;
    }
    // 1B Forced: at the end of the planning phase, place 1 progress here.
    case "pfGarrison": {
      s.progress += 1;
      const goal = pelennorFieldsStageInfo(s)?.quest ?? 2;
      log(
        s,
        `The Garrison of Gondor: 1 progress is placed on it (${s.progress}/${goal}).`,
      );
      if (s.progress >= goal && !q.advancing) {
        q.advancing = true;
        prepend(s, fx("pfDefeat", { player: first }));
      }
      return true;
    }
    case "pfDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      const next =
        q.currentQuest === PF.garrison
          ? "pfStageTwo"
          : q.currentQuest === PF.retreat
            ? "pfStageThree"
            : q.currentQuest === PF.besieged
              ? "pfStageFour"
              : "pfStageFive";
      prepend(s, ...responses, fx(next, { player: first }));
      return true;
    }
    case "pfStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = PF.retreat;
      s.stageRevealing = true;
      log(s, "Retreat from Osgiliath.", "chapter");
      prepend(
        s,
        ...playerOrder(s).flatMap((player) => [
          fx("pfWraith", { player }),
          fx("reveal", { player }),
        ]),
        ...playerOrder(s).map((player) => fx("pfRetreat", { player })),
        fx("stageRevealed"),
      );
      return true;
    }
    case "pfWraith": {
      const i = q.setAside.indexOf(PF.wraith);
      if (i < 0) {
        log(s, "Retreat from Osgiliath: no Wraith on Wings is left set aside.");
        return true;
      }
      q.setAside.splice(i, 1);
      const wraith = make(s, PF.wraith);
      s.staging.push(wraith);
      log(
        s,
        `Retreat from Osgiliath: ${who(s, p)} ${verb(s, "add")} a Wraith on Wings to the staging area.`,
        "danger",
      );
      enemyAddedToStaging(s, wraith);
      return true;
    }
    // 2A: discard until an ally that is not in play; it enters the staging area.
    case "pfRetreat": {
      forOwner(s, p, () => {
        let discarded = 0;
        while (s.deck.length) {
          const code = s.deck.shift()!;
          if (card(code).type_code === "ally" && !uniqueInPlay(s, code)) {
            const ally = make(s, code);
            ally.owner = p;
            s.staging.push(ally);
            log(
              s,
              `Retreat from Osgiliath: ${who(s, p)} ${verb(s, "discard")} ${discarded} card${discarded === 1 ? "" : "s"} and ${card(code).name} is put into play in the staging area.`,
              "danger",
            );
            return;
          }
          s.discard.push(code);
          discarded++;
        }
        log(
          s,
          `Retreat from Osgiliath: ${who(s, p)} ${verb(s, "discard")} ${s.table ? "his" : "your"} whole deck without finding an ally.`,
          "danger",
        );
      });
      return true;
    }
    // 2B Forced: at the end of the round, damage among the allies in the staging area.
    case "pfAllyDamage": {
      const remaining = e.value ?? 0;
      const allies = pfStagingAllies(s);
      if (remaining <= 0 || !allies.length) return true;
      forOwner(s, first, () =>
        choose(
          s,
          `Retreat from Osgiliath · Assign damage among allies in the staging area · ${remaining} remaining${seatLabel(s, first)}`,
          allies.map((a) => ({
            id: a.id,
            code: a.code,
            label: `${name(a)} · ${a.damage} damage`,
            effects: [
              fx("pfAllyHit", { target: a.id, player: first }),
              fx("pfAllyDamage", { value: remaining - 1, player: first }),
            ],
          })),
          "Forced: at the end of the round, assign damage among allies in the staging area equal to the number of enemies in the staging area.",
        ),
      );
      return true;
    }
    case "pfAllyHit": {
      const ally = s.staging.find((x) => x.id === e.target);
      if (ally) damageStagingAlly(s, ally, 1);
      return true;
    }
    case "pfStageThree": {
      q.advancing = false;
      s.stage = 3;
      s.progress = 0;
      q.currentQuest = PF.besieged;
      s.stageRevealing = true;
      log(s, "The White City Besieged.", "chapter");
      // Each player takes control of each ally he owns in the staging area and exhausts it.
      for (const ally of pfStagingAllies(s)) {
        s.staging = s.staging.filter((x) => x.id !== ally.id);
        const owner = ally.owner ?? first;
        ally.exhausted = true;
        forOwner(s, owner, () => {
          s.allies.push(ally);
        });
        log(
          s,
          `${name(ally)} returns to ${s.table ? `${seatName(s, owner)}'s` : "your"} control, exhausted.`,
        );
      }
      for (const code of [PF.minasTirith, PF.grond, PF.witchKing]) {
        const i = q.setAside.indexOf(code);
        if (i < 0) continue;
        q.setAside.splice(i, 1);
        const unit = make(s, code);
        s.staging.push(unit);
        if (isEnemy(unit)) enemyAddedToStaging(s, unit);
      }
      log(
        s,
        "The White City Besieged: Minas Tirith, Grond and The Witch-king (Captain side) are added to the staging area.",
        "danger",
      );
      prepend(
        s,
        ...playerOrder(s)
          .filter((player) => player !== first)
          .map((player) => fx("pfSearchEnemy", { player })),
        fx("pfShuffle", { text: "The White City Besieged", player: first }),
        fx("stageRevealed"),
      );
      return true;
    }
    // 3A: each other player searches for a different enemy.
    case "pfSearchEnemy": {
      const chosen = new Set(q.searched ?? []);
      const options = enemyOptions(
        s,
        "pfSearchTake",
        p,
        (c) => !chosen.has(card(c).name) && !uniqueEnemyInPlay(s, c),
      );
      if (!options.length) {
        log(
          s,
          `The White City Besieged: no other enemy is left for ${who(s, p)}.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The White City Besieged · Search for a different enemy${seatLabel(s, p)}`,
          options,
          "When Revealed: each other player searches the encounter deck and discard pile for a different enemy and adds it to the staging area.",
        ),
      );
      return true;
    }
    case "pfSearchTake": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      q.searched = [...(q.searched ?? []), card(e.code).name];
      const enemy = make(s, e.code);
      s.staging.push(enemy);
      log(
        s,
        `The White City Besieged: ${who(s, p)} ${verb(s, "add")} ${card(e.code).name} to the staging area.`,
        "danger",
      );
      enemyAddedToStaging(s, enemy);
      return true;
    }
    case "pfShuffle":
      delete q.searched;
      shuffle(s, s.encounterDeck);
      log(
        s,
        `${e.text ?? "The Battle of the Pelennor Fields"}: the encounter deck is shuffled.`,
      );
      return true;
    // 3B Forced: when an enemy is destroyed, progress equal to its total threat.
    case "pfBesiegedProgress":
      if ((e.value ?? 0) > 0) {
        log(
          s,
          `The White City Besieged: ${e.value} progress for the destroyed enemy.`,
          "good",
        );
        progress(s, e.value ?? 0);
      }
      return true;
    case "pfStageFour": {
      q.advancing = false;
      s.stage = 4;
      s.progress = 0;
      q.currentQuest = PF.rohan;
      s.stageRevealing = true;
      log(s, "Rohan has Come!", "chapter");
      const wk = witchKing(s);
      if (wk) {
        setAsideEnemy(s, wk);
        log(
          s,
          "Rohan has Come!: The Witch-king is set aside, out of play.",
          "good",
        );
      }
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("pfRohan", { player })),
        fx("stageRevealed"),
      );
      return true;
    }
    // 4A: each player searches the top 10 cards of his deck for an ally of a hero's sphere.
    case "pfRohan": {
      const view = seatView(s, p);
      const spheres = new Set(view.heroes.map((h) => card(h.code).sphere_code));
      const top = view.deck.slice(0, PF_ROHAN_SEARCH);
      const picks = [...new Set(top)].filter(
        (c) =>
          card(c).type_code === "ally" &&
          spheres.has(card(c).sphere_code) &&
          !uniqueInPlay(s, c),
      );
      if (!picks.length) {
        prepend(s, fx("pfRohanShuffle", { player: p }));
        log(
          s,
          `Rohan has Come!: ${who(s, p)} ${verb(s, "find")} no ally of a hero's sphere in the top ${PF_ROHAN_SEARCH} cards.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Rohan has Come! · Put an ally into play${seatLabel(s, p)}`,
          picks.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("pfRohanTake", { code, player: p }),
              fx("pfRohanShuffle", { player: p }),
            ],
          })),
          "When Revealed: each player searches the top 10 cards of his deck for an ally that matches the sphere of a hero he controls and puts it into play under his control. Each player shuffles his deck.",
        ),
      );
      return true;
    }
    case "pfRohanTake":
      forOwner(s, p, () => {
        const i = s.deck.slice(0, PF_ROHAN_SEARCH).indexOf(e.code!);
        if (i < 0) return;
        s.deck.splice(i, 1);
        const ally = make(s, e.code!);
        ally.owner = p;
        enterAlly(s, ally);
        log(
          s,
          `Rohan has Come!: ${card(e.code!).name} is put into play under ${s.table ? `${seatName(s, p)}'s` : "your"} control.`,
          "good",
        );
      });
      return true;
    case "pfRohanShuffle":
      forOwner(s, p, () => shuffle(s, s.deck));
      return true;
    case "pfStageFive": {
      q.advancing = false;
      s.stage = 5;
      s.progress = 0;
      q.currentQuest = PF.fields;
      s.stageRevealing = true;
      log(s, "Fighting in the Fields.", "chapter");
      const i = q.setAside.indexOf(PF.witchKing);
      let wk: Unit | undefined;
      if (i >= 0) {
        q.setAside.splice(i, 1);
        wk = make(s, PF.witchKing);
        wk.flipped = true;
        s.staging.push(wk);
        log(
          s,
          "Fighting in the Fields: The Witch-king is added to the staging area, Sorcerer side faceup.",
          "danger",
        );
        enemyAddedToStaging(s, wk);
      }
      prepend(
        s,
        ...(wk ? [fx("pfBeastSearch", { target: wk.id, player: first })] : []),
        fx("pfShuffle", { text: "Fighting in the Fields", player: first }),
        ...playerOrder(s)
          .filter((player) => player !== first)
          .map((player) => fx("reveal", { player })),
        fx("stageRevealed"),
      );
      return true;
    }
    // 5A: a Fell Beast from the encounter deck or discard pile for The Witch-king.
    case "pfBeastSearch": {
      if (!u || beasts(u)) return true;
      const zones = (["deck", "discard"] as const).filter((zone) =>
        (zone === "deck" ? s.encounterDeck : s.encounterDiscard).includes(
          PF.beast,
        ),
      );
      if (!zones.length) {
        log(
          s,
          "Fighting in the Fields: no Fell Beast is in the encounter deck or discard pile.",
        );
        return true;
      }
      if (zones.length === 1) {
        prepend(
          s,
          fx("pfBeastTake", { target: u.id, text: zones[0], player: p }),
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Fighting in the Fields · Search for a Fell Beast${seatLabel(s, p)}`,
          zones.map((zone) => ({
            id: zone,
            code: PF.beast,
            label: `Fell Beast · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
            effects: [
              fx("pfBeastTake", { target: u.id, text: zone, player: p }),
            ],
          })),
          "When Revealed: the first player searches the encounter deck and discard pile for a Fell Beast and attaches it to The Witch-king, if able.",
        ),
      );
      return true;
    }
    case "pfBeastTake":
      if (u && !beasts(u) && takeFrom(s, e.text, PF.beast)) {
        u.attachments.push({
          id: make(s, PF.beast).id,
          code: PF.beast,
          exhausted: false,
        });
        log(
          s,
          `Fighting in the Fields: Fell Beast is attached to ${name(u)}.`,
          "danger",
        );
      }
      return true;
    // The Witch-king (Captain side), Forced: at the beginning of the quest phase.
    case "pfWitchCaptain":
      discardUntilEnemy(s, "The Witch-king");
      return true;
    // The Witch-king (Sorcerer side), Forced: at the beginning of the encounter phase.
    case "pfWitchSorcerer": {
      if (!u || !u.flipped) return true;
      if (inStaging(s, u)) {
        s.staging = s.staging.filter((x) => x.id !== u.id);
        enterEnemyEngaged(s, u, first);
      } else if (ownerOf(s, u) !== first) {
        const from = ownerOf(s, u);
        forOwner(s, from, () => {
          s.engaged = s.engaged.filter((x) => x.id !== u.id);
        });
        forOwner(s, first, () => {
          s.engaged.push(u);
        });
      }
      log(
        s,
        `The Witch-king engages ${s.table ? seatName(s, first) : "you"} and makes an immediate attack.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    // Grond, Forced: at the beginning of the quest phase.
    case "pfGrond": {
      if (!u || u.code !== PF.grond) return true;
      u.resources += 1;
      log(
        s,
        `Grond: 1 resource is placed on it (X is ${u.resources}).`,
        "danger",
      );
      dealMinasTirith(s, u.resources, "Grond");
      return true;
    }
    // Wraith on Wings, Forced: at the beginning of the quest phase (limit 5 resources).
    case "pfWraithResource":
      if (u && u.resources < PF_WRAITH_LIMIT) {
        u.resources += 1;
        log(
          s,
          `Wraith on Wings: 1 resource is placed on it (${u.resources}).`,
          "danger",
        );
      }
      return true;
    // Minas Tirith, Forced: at the end of the round.
    case "pfMinasTirithRound": {
      const mt = pfMinasTirith(s);
      if (!mt) return true;
      const enemies = s.staging.filter((x) => isEnemy(x)).length;
      if (enemies) dealMinasTirith(s, enemies, "Minas Tirith");
      if (mt.damage >= pfMinasTirithHealth(players(s)))
        lose(
          s,
          "Minas Tirith has no hit points remaining: the White City has fallen, and the players lose the game.",
        );
      return true;
    }
    case "pfMinas":
      dealMinasTirith(
        s,
        e.value ?? 0,
        e.text ?? "The Battle of the Pelennor Fields",
      );
      return true;
    case "pfExtraAttack":
      if (s.combat) s.combat.extraAttacks = (s.combat.extraAttacks ?? 0) + 1;
      log(
        s,
        `${e.text ?? "The Battle of the Pelennor Fields"}: the attacking enemy makes an additional attack after this one.`,
        "danger",
      );
      return true;
    // Fell Beast, Forced: at the end of the round, return the attached enemy to the staging area.
    case "pfBeastReturn":
      if (u && globalEngaged(s).some((x) => x.id === u.id))
        returnToStaging(s, u);
      return true;
    case "pfBeastAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!u || i < 0 || beasts(u)) return true;
      const [held] = q.resolving.splice(i, 1);
      u.attachments.push({ id: held.id, code: PF.beast, exhausted: false });
      log(s, `Fell Beast is attached to ${name(u)}.`, "danger");
      return true;
    }
    // Black Dart: remove the hero from the quest and attach.
    case "pfDartAttach": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!u || i < 0 || u.attachments.some((a) => a.code === PF.dart))
        return true;
      const [held] = q.resolving.splice(i, 1);
      forOwner(s, ownerOf(s, u), () => {
        u.committed = false;
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      u.attachments.push({ id: held.id, code: PF.dart, exhausted: false });
      log(
        s,
        `Black Dart: ${name(u)} is removed from the quest and Black Dart is attached.`,
        "danger",
      );
      return true;
    }
    case "pfDart":
      if (u) prepend(s, fx("damage", { target: u.id, value: 1, player: p }));
      return true;
    case "pfRuinExhausted":
      for (const c of globalCharacters(s).filter(
        (x) => isCharacter(x) && x.exhausted,
      ))
        prepend(
          s,
          fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
        );
      log(s, "Spells of Ruin: 1 damage to each exhausted character.", "danger");
      return true;
    // Dread and Despair.
    case "pfDespair": {
      const allies = seatView(s, p).allies.filter(isAlly);
      if (allies.length > 1) {
        forOwner(s, p, () =>
          choose(
            s,
            `Dread and Despair · Discard an ally you control${seatLabel(s, p)}`,
            allies.map((a) => ({
              id: a.id,
              code: a.code,
              label: name(a),
              effects: [
                fx("pfDespairDiscard", { target: a.id, player: p }),
                fx("pfDespairThreat", { player: p }),
              ],
            })),
            "Peril. When Revealed: discard an ally you control. Until the end of the phase, add 1 to the total threat in the staging area for each ally in your discard pile.",
          ),
        );
        return true;
      }
      prepend(
        s,
        ...(allies.length
          ? [fx("pfDespairDiscard", { target: allies[0].id, player: p })]
          : []),
        fx("pfDespairThreat", { player: p }),
      );
      return true;
    }
    case "pfDespairDiscard":
      if (u && isAlly(u)) {
        log(s, `Dread and Despair: ${name(u)} is discarded.`, "danger");
        forOwner(s, ownerOf(s, u), () => destroy(s, u, false));
      }
      return true;
    case "pfDespairThreat": {
      const allies = seatView(s, p).discard.filter(
        (c) => card(c).type_code === "ally",
      ).length;
      const key = { round: s.round, phase: phaseOf(s) };
      const before =
        q.despair?.round === key.round && q.despair.phase === key.phase
          ? q.despair.amount
          : 0;
      q.despair = { ...key, amount: before + allies };
      log(
        s,
        `Dread and Despair: +${allies} total threat in the staging area until the end of the phase.`,
        "danger",
      );
      return true;
    }
    // Shadow of Mordor: each player deals 1 damage to a hero he controls.
    case "pfShadowOfMordor": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      if (heroes.length === 1) {
        prepend(s, fx("damage", { target: heroes[0].id, value: 1, player: p }));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Shadow of Mordor · Deal 1 damage to a hero you control${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)} · ${h.damage} damage`,
            effects: [fx("damage", { target: h.id, value: 1, player: p })],
          })),
          "Doomed 1. When Revealed: each player deals 1 damage to a hero he controls. Until the end of the round, treat the printed text box of each damaged character as if it were blank, except for Traits.",
        ),
      );
      return true;
    }
    // Until the end of the round, each damaged character's printed text box
    // is blank: every character with damage once each player has dealt his.
    case "pfShadowBlank": {
      const damaged = globalCharacters(s).filter((c) => c.damage > 0);
      if (!damaged.length) return true;
      q.shadowed = {
        round: s.round,
        ids: [
          ...new Set([
            ...(q.shadowed?.round === s.round ? q.shadowed.ids : []),
            ...damaged.map((c) => c.id),
          ]),
        ],
      };
      log(
        s,
        `Shadow of Mordor: the printed text boxes of ${damaged.map(name).join(", ")} are blank, except for Traits, until the end of the round.`,
        "danger",
      );
      return true;
    }
    // The Rammas is Breached: each player puts an enemy into play engaged with him.
    case "pfRammas": {
      const options = enemyOptions(
        s,
        "pfRammasTake",
        p,
        (c) => !uniqueEnemyInPlay(s, c),
      );
      if (!options.length) {
        log(s, `The Rammas is Breached: no enemy is left for ${who(s, p)}.`);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `The Rammas is Breached · Search for an enemy${seatLabel(s, p)}`,
          options,
          "When Revealed: each player searches the encounter deck and discard pile for an enemy and puts it into play engaged with him.",
        ),
      );
      return true;
    }
    case "pfRammasTake": {
      if (!e.code || !takeFrom(s, e.text, e.code)) return true;
      const enemy = make(s, e.code);
      log(
        s,
        `The Rammas is Breached: ${card(e.code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, enemy, p);
      return true;
    }
    // Orc of the Eye (Peril): 2 damage to a hero or to Minas Tirith.
    case "pfEye": {
      const heroes = seatView(s, p).heroes;
      either(
        s,
        p,
        "Orc of the Eye",
        [
          ...(heroes.length
            ? [
                {
                  id: "hero",
                  label: "Deal 2 damage to a hero you control",
                  effects: [
                    fx("pfHeroDamage", {
                      value: 2,
                      text: "Orc of the Eye",
                      player: p,
                    }),
                  ],
                },
              ]
            : []),
          ...minasOption(s, p, 2, "Orc of the Eye"),
        ],
        "Peril. When Revealed: either deal 2 damage to a hero you control, or deal 2 damage to Minas Tirith.",
      );
      return true;
    }
    case "pfHeroDamage": {
      const heroes = seatView(s, p).heroes;
      if (!heroes.length) return true;
      forOwner(s, p, () =>
        choose(
          s,
          `${e.text ?? "The Battle of the Pelennor Fields"} · Deal ${e.value ?? 1} damage to a hero you control${seatLabel(s, p)}`,
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: `${name(h)} · ${h.damage} damage`,
            effects: [
              fx("damage", { target: h.id, value: e.value ?? 1, player: p }),
            ],
          })),
        ),
      );
      return true;
    }
    // Morgul Captain (Peril): the topmost Orc enemy in the discard pile engages you.
    case "pfMorgulCaptain": {
      let i = -1;
      for (let j = s.encounterDiscard.length - 1; j >= 0; j--) {
        const c = card(s.encounterDiscard[j]);
        if (
          c.type_code === "enemy" &&
          (c.traits ?? "")
            .split(".")
            .map((t) => t.trim())
            .includes("Orc")
        ) {
          i = j;
          break;
        }
      }
      if (i < 0) {
        log(s, "Morgul Captain: no Orc enemy is in the discard pile.");
        return true;
      }
      const [code] = s.encounterDiscard.splice(i, 1);
      const orc = make(s, code);
      log(
        s,
        `Morgul Captain: ${card(code).name} is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, orc, p);
      return true;
    }
    // Southron Champion: dealt a shadow card with no shadow effect.
    case "pfChampion":
      either(
        s,
        p,
        "Southron Champion",
        [
          ...minasOption(s, p, 3, "Southron Champion"),
          {
            id: "attack",
            label: "It makes an additional attack after this one",
            effects: [
              fx("pfExtraAttack", { text: "Southron Champion", player: p }),
            ],
          },
        ],
        "Forced: after Southron Champion is dealt a shadow card with no shadow effect, either deal 3 damage to Minas Tirith, or it makes an additional attack after this one.",
      );
      return true;
    // Dread and Despair's shadow: a non-objective attachment you control.
    case "pfDiscardAttachment": {
      const own = attachmentsOf(s, p, true);
      if (!own.length) {
        log(
          s,
          `Dread and Despair: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Dread and Despair · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          own.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("pfDropAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
          "Shadow: discard a non-objective attachment you control.",
        ),
      );
      return true;
    }
    case "pfDropAttachment": {
      const host =
        u ??
        [...globalCharacters(s), ...s.staging, ...globalEngaged(s)].find(
          (x) => x.id === e.target,
        );
      const a = host?.attachments.find((x) => x.id === e.source);
      if (!host || !a) return true;
      log(s, `Dread and Despair: ${card(a.code).name} is discarded.`, "danger");
      forOwner(s, ownerOf(s, host), () => discardAttachment(s, host, a));
      return true;
    }
    // 4B: the questing progress is assigned as damage among enemies in play.
    case "pfRohanDamage": {
      const remaining = e.value ?? 0;
      const targets = enemiesInPlay(s);
      if (remaining <= 0 || !targets.length) return true;
      forOwner(s, first, () =>
        choose(
          s,
          `Rohan has Come! · Assign damage among enemies in play · ${remaining} remaining${seatLabel(s, first)}`,
          targets.map((t) => ({
            id: t.id,
            code: t.code,
            label: `${name(t)} · ${t.damage} damage`,
            effects: [
              fx("damage", { target: t.id, value: 1, player: first }),
              fx("pfRohanDamage", { value: remaining - 1, player: first }),
            ],
          })),
          "Progress that would be placed on this stage by questing successfully is instead assigned as damage among enemies in play.",
        ),
      );
      return true;
    }
    // Siege Tower, Forced: after it becomes the active location.
    case "pfTower":
      discardUntilEnemy(s, "Siege Tower", true);
      return true;
    // War Mûmak, Forced: when it is defeated, each player reduces his threat by 4.
    case "pfMumakDefeated":
      for (const player of playerOrder(s))
        forOwner(s, player, () =>
          reduceThreat(s, PF_MUMAK_THREAT, "War Mûmak", "encounter"),
        );
      log(
        s,
        `War Mûmak is defeated: each player reduces his threat by ${PF_MUMAK_THREAT}.`,
        "good",
      );
      return true;
  }
  return false;
}
const uniqueEnemyInPlay = (s: GameState, code: string) =>
  card(code).is_unique &&
  enemiesInPlay(s).some((u) => card(u.code).name === card(code).name);

// ---------------------------------------------------------------------------
// Hooks.

export const PELENNOR_FIELDS_HOOKS: Batch4ScenarioHooks = {
  setup: setupPelennorFields,
  // 1A Setup: the players may attach the Esquires once the hands are kept.
  openingHandsKept: (s) => {
    if (!s.pelennorFields || s.round > 0) return false;
    const first = firstPlayer(s);
    prepend(
      s,
      fx("pfEsquire", { code: PF.esquireRohan, player: first }),
      fx("pfEsquire", { code: PF.esquireGondor, player: first }),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: pelennorFieldsStageInfo,
  check: (s) => {
    if (!s.pelennorFields || s.status !== "playing") return;
    lotrSagaCheck(s);
  },
  encounter,
  shadow,
  // 1B: skip the quest phase and combat phase.
  skipQuestPhase: (s) => at(s, PF.garrison),
  skipPhase: (s, phase) => phase === "combat" && at(s, PF.garrison),
  planningEnd: (s) => {
    if (at(s, PF.garrison))
      prepend(s, fx("pfGarrison", { player: firstPlayer(s) }));
  },
  // 4B Forced: at the end of the quest phase, advance to stage 5A.
  endQuest: (s) => {
    const q = s.pelennorFields;
    if (!q || !at(s, PF.rohan)) return;
    q.advancing = true;
    prepend(s, fx("pfDefeat", { player: firstPlayer(s) }));
  },
  // 4B: questing progress becomes damage among enemies in play.
  successfulQuestProgress: (s, amount) => {
    if (!at(s, PF.rohan) || amount <= 0) return;
    s.progress = Math.max(0, s.progress - amount);
    const targets = enemiesInPlay(s);
    if (!targets.length) {
      log(
        s,
        "Rohan has Come!: there is no enemy in play to take the progress as damage.",
      );
      return;
    }
    log(
      s,
      `Rohan has Come!: ${amount} progress is assigned as damage among enemies in play.`,
      "good",
    );
    prepend(s, fx("pfRohanDamage", { value: amount, player: firstPlayer(s) }));
  },
  // 3B Assault: no progress on this stage from questing or from player card effects.
  successfulQuestProgressBlocked: (s) => at(s, PF.besieged),
  playerQuestProgressBlocked: (s) => at(s, PF.besieged),
  failedQuest: (s, amount) => {
    if (!at(s, PF.besieged)) return false;
    log(
      s,
      "Assault: the players do not raise their threat for the unsuccessful quest.",
      "danger",
    );
    dealMinasTirith(s, amount, "Assault");
    return true;
  },
  questBegin: (s) => {
    if (!s.pelennorFields) return [];
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    const wk = witchKing(s);
    if (wk && !wk.flipped && !wk.blanked)
      effects.push(fx("pfWitchCaptain", { target: wk.id, player: first }));
    const grond = [...s.staging, ...allActiveLocations(s)].find((u) =>
      live(u, PF.grond),
    );
    if (grond) effects.push(fx("pfGrond", { target: grond.id, player: first }));
    for (const w of enemiesInPlay(s).filter((u) => live(u, PF.wraith)))
      effects.push(fx("pfWraithResource", { target: w.id, player: first }));
    return effects;
  },
  encounterBegin: (s) => {
    const wk = witchKing(s);
    if (s.pelennorFields && wk && wk.flipped && !wk.blanked)
      prepend(
        s,
        fx("pfWitchSorcerer", { target: wk.id, player: firstPlayer(s) }),
      );
  },
  roundEnd: (s) => {
    const q = s.pelennorFields;
    if (!q) return [];
    const first = firstPlayer(s);
    const effects: Effect[] = [];
    // The first player orders the simultaneous Forced effects: Minas Tirith first.
    if (pfMinasTirith(s))
      effects.push(fx("pfMinasTirithRound", { player: first }));
    for (const enemy of enemiesInPlay(s).filter((u) => beasts(u)))
      effects.push(fx("pfBeastReturn", { target: enemy.id, player: first }));
    for (const hero of globalCharacters(s))
      for (const a of hero.attachments.filter(
        (a) => a.code === PF.dart && !a.blanked,
      ))
        effects.push(
          fx("pfDart", {
            target: hero.id,
            source: a.id,
            player: ownerOf(s, hero),
          }),
        );
    if (at(s, PF.retreat) && pfStagingAllies(s).length) {
      const n = s.staging.filter((u) => isEnemy(u)).length;
      if (n) effects.push(fx("pfAllyDamage", { value: n, player: first }));
    }
    return effects;
  },
  immune: (s, u) =>
    !!s.pelennorFields &&
    // 2B: allies in the staging area; 5B: The Witch-king.
    ((card(u.code).type_code === "ally" && inStaging(s, u)) ||
      (at(s, PF.fields) && live(u, PF.witchKing))),
  shadowImmune: (s, enemy) => at(s, PF.fields) && live(enemy, PF.witchKing),
  characterBlanked: (s, u) => {
    const q = s.pelennorFields;
    if (!q) return false;
    // 2A/2B: an ally in the staging area has a blank text box.
    if (card(u.code).type_code === "ally" && inStaging(s, u)) return true;
    // Shadow of Mordor.
    return q.shadowed?.round === s.round && q.shadowed.ids.includes(u.id);
  },
  stats: (s, u) => {
    if (!s.pelennorFields) return {};
    if (isEnemy(u)) {
      const n = beasts(u);
      return n ? { attack: n, defense: n } : {};
    }
    // Esquire of Gondor: +1 willpower while committed with another Gondor character.
    if (
      isHero(u) &&
      u.attachments.some((a) => a.code === PF.esquireGondor && !a.blanked) &&
      (u.committed || s.committedIds.includes(u.id)) &&
      globalCharacters(s).some(
        (x) =>
          x.id !== u.id &&
          isCharacter(x) &&
          x.committed &&
          hasTrait(x, "Gondor"),
      )
    )
      return { will: 1 };
    return {};
  },
  // Esquire of Rohan: +1 attack while attacking with another Rohan character.
  playerAttackBonus: (s, attacker, _enemy, attackers) =>
    s.pelennorFields &&
    attacker.attachments.some(
      (a) => a.code === PF.esquireRohan && !a.blanked,
    ) &&
    attackers.some((x) => x.id !== attacker.id && hasTrait(x, "Rohan"))
      ? 1
      : 0,
  threatBonus: (s, u) => {
    if (!s.pelennorFields || u.blanked) return 0;
    let bonus = beasts(u);
    if (u.code === PF.wraith) bonus += u.resources;
    if (u.code === PF.grond) bonus += u.resources;
    return bonus;
  },
  stagingThreat: (s) => {
    const d = s.pelennorFields?.despair;
    return d && d.round === s.round && d.phase === phaseOf(s) ? d.amount : 0;
  },
  engagementBonus: (s, u) => {
    if (!s.pelennorFields || !isEnemy(u)) return 0;
    return (
      (activeIs(s, PF.gate) ? -30 : 0) -
      10 * beasts(u) -
      (live(u, PF.wraith) ? u.resources : 0)
    );
  },
  cannotOptionallyEngage: (s, u) =>
    !!s.pelennorFields && live(u, PF.witchKing) && !u.flipped,
  damageAmount: (s, u, amount) => {
    const q = s.pelennorFields;
    if (!q || amount <= 0) return amount;
    // The Witch-king (Captain side) cannot take damage.
    if (live(u, PF.witchKing) && !u.flipped) return 0;
    // War Mûmak: no more than 3 damage each round.
    if (live(u, PF.mumak)) {
      const taken =
        q.mumak?.round === s.round ? (q.mumak.damage[u.id] ?? 0) : 0;
      return Math.min(amount, Math.max(0, PF_MUMAK_CAP - taken));
    }
    return amount;
  },
  damageDealt: (s, u, amount, context) => {
    const q = s.pelennorFields;
    if (!q || amount <= 0) return;
    if (live(u, PF.mumak)) {
      const damage = q.mumak?.round === s.round ? q.mumak.damage : {};
      q.mumak = {
        round: s.round,
        damage: { ...damage, [u.id]: (damage[u.id] ?? 0) + amount },
      };
    }
    // Black Dart's shadow: if this attack damages a hero, attach Black Dart to that hero.
    const c = s.combat;
    if (
      c?.pfDart &&
      isHero(u) &&
      context.combatDamage &&
      context.enemyId === c.enemyId &&
      !u.attachments.some((a) => a.code === PF.dart)
    ) {
      c.pfDart = false;
      const enemy = get(s, c.enemyId);
      const index = enemy?.shadows.indexOf(PF.dart) ?? -1;
      if (enemy && index >= 0) removeShadowCard(enemy, index);
      u.attachments.push({
        id: make(s, PF.dart).id,
        code: PF.dart,
        exhausted: false,
      });
      log(s, `Black Dart is attached to ${name(u)}.`, "danger");
    }
  },
  cannotAttach: (s, u, code) => {
    if (!s.pelennorFields) return false;
    if (live(u, PF.serpent) || live(u, PF.mumak)) return true;
    // Wraith on Wings cannot have non-Morgul attachments.
    return live(u, PF.wraith) && !hasTraitCode(code, "Morgul");
  },
  attackProblem: (s, enemy, ids) => {
    if (!s.pelennorFields) return null;
    if (live(enemy, PF.serpent) && ids.length > 1)
      return "The Black Serpent cannot be attacked by more than 1 character at a time.";
    if (live(enemy, PF.witchKing) && enemy.flipped) {
      const engaged = ownerOf(s, enemy);
      if (
        ids.some((id) => {
          const a = get(s, id);
          return !!a && ownerOf(s, a) !== engaged;
        })
      )
        return "Only the engaged player can declare attackers against The Witch-king.";
    }
    return null;
  },
  hostLeaves: (s, u, destruction) => {
    if (!s.pelennorFields || !destruction || !isEnemy(u)) return;
    // 3B Forced: progress on this stage equal to the destroyed enemy's total threat.
    if (at(s, PF.besieged))
      prepend(
        s,
        fx("pfBesiegedProgress", {
          value: threatOf(s, u),
          player: firstPlayer(s),
        }),
      );
    if (live(u, PF.mumak))
      prepend(s, fx("pfMumakDefeated", { player: firstPlayer(s) }));
  },
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (!s.pelennorFields || !isCharacter(u) || !context.combatDamage) return;
    // 5B Forced: when an enemy attacks and destroys a character, 1 damage to Minas Tirith.
    if (at(s, PF.fields)) dealMinasTirith(s, 1, "Fighting in the Fields");
    if (!c || context.enemyId !== c.enemyId) return;
    if (c.pfRuin) {
      c.pfRuin = false;
      dealMinasTirith(s, 2, "Spells of Ruin");
    }
    if (c.pfReturnOnKill) {
      c.pfReturnOnKill = false;
      c.returnToStaging = true;
    }
  },
  shadowResolved: (s, enemy, code) => {
    if (!s.pelennorFields || !live(enemy, PF.champion)) return;
    if ((card(code).shadow ?? "").trim()) return;
    prepend(
      s,
      fx("pfChampion", {
        target: enemy.id,
        player: s.combat?.attackPlayer ?? activeSeat(s),
      }),
    );
  },
  cardEntered: (s, u, fromReveal, cancel) => {
    if (!s.pelennorFields || !fromReveal || cancel || u.blanked) return;
    const p = activeSeat(s);
    if (u.code === PF.serpent)
      prepend(
        s,
        fx("immediateAttack", { target: u.id, player: firstPlayer(s) }),
      );
    if (u.code === PF.eye) prepend(s, fx("pfEye", { target: u.id, player: p }));
    if (u.code === PF.captain)
      prepend(s, fx("pfMorgulCaptain", { target: u.id, player: p }));
  },
  travelProblem: (s, u) =>
    at(s, PF.besieged) && hasTrait(u, "Pelennor")
      ? "The White City Besieged: the players cannot travel to Pelennor locations."
      : null,
  travelEffects: (s, u) => {
    if (!s.pelennorFields || u.blanked || u.code !== PF.grond) return undefined;
    const wk = witchKing(s);
    if (!wk) {
      log(s, "Grond: The Witch-king is not in play to attack.");
      return [];
    }
    return playerOrder(s).map((player) =>
      fx("immediateAttack", { target: wk.id, player }),
    );
  },
  travelEntered: (s, u) => {
    if (s.pelennorFields && live(u, PF.tower))
      prepend(s, fx("pfTower", { player: firstPlayer(s) }));
  },
  explored: (s, u) => {
    if (!s.pelennorFields || !live(u, PF.gate)) return;
    // Gate of Gondor, Forced: when explored, return each engaged enemy to the staging area.
    for (const enemy of [...globalEngaged(s)]) returnToStaging(s, enemy);
  },
  // Pelennor Field: while an enemy is in the staging area, no progress on locations there.
  locationProgressBlocked: (s, u) =>
    !!s.pelennorFields &&
    inPlayLive(s, PF.field) &&
    inStaging(s, u) &&
    s.staging.some((x) => isEnemy(x)),
  // Archery from the staging area: War Mûmak, Orc of the Eye and Siege Tower (3).
  combatBegin: (s) => {
    if (!s.pelennorFields) return;
    const archery = s.staging.reduce(
      (n, x) =>
        n +
        (x.blanked
          ? 0
          : isEnemy(x)
            ? whiteHandArchery(x.code)
            : x.code === PF.tower
              ? 3
              : 0),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  // Fire-filled Trench: an event canceling a revealed treachery is canceled.
  revealCancelCountered: (s, code) => {
    if (!s.pelennorFields || card(code).type_code !== "treachery") return false;
    const trench = [...s.staging, ...allActiveLocations(s)].find((u) =>
      live(u, PF.trench),
    );
    if (!trench) return false;
    log(
      s,
      "Fire-filled Trench: the event's effects are canceled, and Fire-filled Trench is discarded.",
      "danger",
    );
    discardLocation(s, trench);
    return true;
  },
  effect: pelennorFieldsEffect,
  sharedEffect: (e) =>
    [
      "pfTreacheryDone",
      "pfEsquire",
      "pfGarrison",
      "pfDefeat",
      "pfStageTwo",
      "pfStageThree",
      "pfStageFour",
      "pfStageFive",
      "pfShuffle",
      "pfBesiegedProgress",
      "pfAllyDamage",
      "pfAllyHit",
      "pfWitchCaptain",
      "pfWitchSorcerer",
      "pfGrond",
      "pfWraithResource",
      "pfMinasTirithRound",
      "pfBeastReturn",
      "pfBeastSearch",
      "pfTower",
      "pfMumakDefeated",
      "pfRohanDamage",
      "pfShadowBlank",
    ].includes(e.kind),
};
const hasTraitCode = (code: string, trait: string) =>
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .includes(trait) ||
  new RegExp(`counts as an? ${trait}`, "i").test(card(code).text ?? "");
