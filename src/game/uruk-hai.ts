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
  random,
  shuffle,
  threatOf,
} from "./core";
import {
  depositInFlightEncounterCards,
  discardAttachment,
  engage,
  questDefeated,
  revealed,
  win,
} from "./board";
import {
  activeSeat,
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
import { lotrSagaCheck } from "./lotr-saga";
import { returnToStaging } from "./black-riders-hunted";
import {
  UH,
  UH_BARRIER_LIMIT,
  UH_LOST_PURSUIT,
  UH_START_PURSUIT,
  URUK_HAI_RECIPES,
  isUrukHaiCode,
  uhArchery,
  uhToughness,
  urukHaiStageInfo,
} from "./uruk-hai-support";
export * from "./uruk-hai-support";

const TREACHERIES: readonly string[] = [
  UH.rest,
  UH.weariness,
  UH.barrier,
  UH.fighting,
  UH.orders,
];
const stageLive = (s: GameState) =>
  !s.stageRevealing && !mainQuestUnit(s)?.blanked;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const inStaging = (s: GameState, u: Unit) =>
  s.staging.some((x) => x.id === u.id);
const isLocation = (u: Unit) => card(u.code).type_code === "location";
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);
const following = (s: GameState) =>
  s.urukHai?.currentQuest === UH.follow && stageLive(s);
const rescuing = (s: GameState) =>
  s.urukHai?.currentQuest === UH.rescue && stageLive(s);
const uglukInPlay = (s: GameState) =>
  [...s.staging, ...globalEngaged(s)].some((u) => u.code === UH.ugluk);
/** A unit anywhere in play, or a Captive. */
const findUnit = (s: GameState, id?: string) =>
  id === undefined
    ? undefined
    : (get(s, id) ??
      [...globalCharacters(s), ...globalEngaged(s), ...s.staging].find(
        (u) => u.id === id,
      ) ??
      s.urukHai?.captives.find((c) => c.unit.id === id)?.unit);
const captiveOf = (s: GameState, holder: string) =>
  s.urukHai?.captives.find((c) => c.holder === holder);
const committed = (s: GameState) =>
  globalCharacters(s).filter((u) => u.committed);
function lose(s: GameState, reason: string) {
  if (s.status !== "playing") return;
  s.status = "lost";
  s.reason = reason;
  depositInFlightEncounterCards(s);
  s.choice = null;
  s.queue = [];
  log(s, reason, "danger");
}
/** Change the pursuit value, which is the current stage's quest points. */
function pursue(s: GameState, amount: number, reason: string) {
  const q = s.urukHai;
  if (!q || !amount) return;
  q.pursuit = Math.max(0, q.pursuit + amount);
  log(
    s,
    `${reason}: the pursuit value ${amount > 0 ? "increases" : "is reduced"} by ${Math.abs(amount)} to ${q.pursuit}.`,
    amount > 0 ? "danger" : "good",
  );
}

// ---------------------------------------------------------------------------
// Setup and the quest stages.

export function setupUrukHai(s: GameState) {
  const r = URUK_HAI_RECIPES.find(
    (r) => r.mode === (s.easyMode ? "easy" : "standard"),
  )!;
  const section = (name: string) =>
    r.cards
      .filter((c) => c.section === name)
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(s, section("sharedEncounterDeck"));
  // Follow the Orcs: Eastemnet is the active location; Uglúk and To
  // Isengard! are in the staging area.
  const [eastemnet] = section("sharedActiveLocation");
  s.activeLocation = eastemnet ? make(s, eastemnet) : null;
  s.staging = section("sharedStagingArea").map((c) => make(s, c));
  s.urukHai = {
    currentQuest: UH.follow,
    advancing: false,
    pursuit: UH_START_PURSUIT,
    captives: [],
    resolving: [],
  };
  log(
    s,
    "Follow the Orcs: Eastemnet is the active location, Uglúk and To Isengard! are in the staging area, and the pursuit value is 10.",
    "chapter",
  );
}
function advance(s: GameState) {
  const q = s.urukHai;
  if (!q) return false;
  if (
    q.advancing ||
    s.stageRevealing ||
    s.status !== "playing" ||
    s.choice ||
    s.queue.length
  )
    return true;
  // X is the pursuit value.
  if (!stageLive(s) || s.progress < q.pursuit) return true;
  if (q.currentQuest === UH.follow) {
    q.advancing = true;
    prepend(s, fx("uhDefeat", { player: firstPlayer(s) }));
    return true;
  }
  // 2B: the players cannot defeat this stage while Uglúk is in play.
  if (uglukInPlay(s)) return true;
  win(s);
  s.reason =
    "Rescue the Captives is defeated: the players rescue each Captive hero before the Uruk-hai reach Isengard.";
  return true;
}
/** To Isengard!: if there are no Captives in play, the players lose the game. */
function captivesCheck(s: GameState) {
  const q = s.urukHai;
  if (!q || s.status !== "playing" || s.phase === "setup" || s.round < 1)
    return;
  if (!q.captives.length)
    lose(
      s,
      "To Isengard!: there are no Captives in play. The players lose the game.",
    );
}
/** Take a Captive out of play: the hero goes to its owner's discard pile. */
function discardCaptive(s: GameState, id: string, reason: string) {
  const q = s.urukHai!;
  const i = q.captives.findIndex((c) => c.unit.id === id);
  if (i < 0) return;
  const [captive] = q.captives.splice(i, 1);
  forOwner(s, captive.owner, () => {
    s.discard.push(captive.unit.code);
    for (const a of captive.unit.attachments)
      if (card(a.code).type_code !== "objective") s.discard.push(a.code);
  });
  log(
    s,
    `${reason}: the Captive ${name(captive.unit)} is discarded.`,
    "danger",
  );
  captivesCheck(s);
}

// ---------------------------------------------------------------------------
// Encounter cards and shadows.

function encounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.urukHai;
  if (!q) return false;
  const player = activeSeat(s);
  if ([UH.uruks, UH.uruk, UH.snaga].includes(code as never)) {
    if (!fromReveal) return true;
    const u = [...s.staging].reverse().find((x) => x.code === code);
    prepend(
      s,
      fx(
        code === UH.uruks ? "uhUruks" : code === UH.uruk ? "uhUruk" : "uhSnaga",
        { target: u?.id, player },
      ),
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
    fx("uhTreachery", { code, source: u.id, player }),
    fx("uhTreacheryDone", { source: u.id, player }),
  );
  return true;
}
/** "Search the encounter deck and discard pile for an Uruk-hai enemy": one option per card and zone. */
function urukOptions(
  s: GameState,
  kind: string,
  player: number,
  engaged = false,
): Option[] {
  const options: Option[] = [];
  for (const [zone, cards] of [
    ["deck", s.encounterDeck],
    ["discard", s.encounterDiscard],
  ] as const)
    for (const code of [...new Set(cards.filter((c) => isUrukHaiCode(c)))])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
        effects: [fx(kind, { code, text: zone, flag: engaged, player })],
      });
  return options;
}
function treachery(s: GameState, code: string) {
  const q = s.urukHai!;
  const p = activeSeat(s);
  switch (code) {
    case UH.rest: {
      const options: Option[] = [
        {
          id: "end",
          label:
            "Immediately end the quest phase and increase the pursuit value by 3",
          effects: [fx("uhRestEnd", { player: p })],
        },
        {
          id: "damage",
          label: "Deal 1 damage to each character committed to the quest",
          effects: [fx("uhRestDamage", { player: p })],
        },
      ];
      forOwner(s, p, () =>
        choose(
          s,
          `Rest by Night? · Choose one${seatLabel(s, p)}`,
          options,
          "This effect cannot be canceled.",
        ),
      );
      return;
    }
    case UH.weariness: {
      const characters = committed(s);
      for (const u of characters) u.roundWill = (u.roundWill ?? 0) - 1;
      log(
        s,
        characters.length
          ? `Strange Weariness: ${characters.length} character${characters.length === 1 ? " committed to the quest gets" : "s committed to the quest get"} -1 willpower until the end of the round.`
          : "Strange Weariness: no character is committed to the quest.",
        "danger",
      );
      return;
    }
    case UH.barrier:
      q.barrier = {
        round: s.round,
        placed: q.barrier?.round === s.round ? q.barrier.placed : 0,
      };
      log(
        s,
        "Unseen Barrier: the players cannot place more than 3 progress on the current quest this round (progress on the active location does not count).",
        "danger",
      );
      return;
    case UH.fighting: {
      const players = q.fighting?.round === s.round ? q.fighting.players : [];
      q.fighting = {
        round: s.round,
        players: [...new Set([...players, p])].sort(),
      };
      log(
        s,
        `Fighting Uruk-hai: until the end of the round, each enemy engaged with ${who(s, p)} adds its threat to the total threat in the staging area.`,
        "danger",
      );
      const options = urukOptions(s, "uhRevealUruk", p, true);
      if (!options.length) {
        shuffle(s, s.encounterDeck);
        log(
          s,
          "Fighting Uruk-hai: no Uruk-hai enemy is in the encounter deck or discard pile; the encounter deck is shuffled.",
        );
        return;
      }
      prepend(s, fx("uhShuffle", { text: "Fighting Uruk-hai", player: p }));
      forOwner(s, p, () =>
        choose(
          s,
          `Fighting Uruk-hai · Reveal an Uruk-hai enemy engaged with you${seatLabel(s, p)}`,
          options,
          "Peril. Search the encounter deck and discard pile for an Uruk-hai enemy, reveal it, and put it into play engaged with you. Then the encounter deck is shuffled.",
        ),
      );
      return;
    }
    case UH.orders:
      prepend(s, ...playerOrder(s).map((player) => fx("uhOrders", { player })));
      return;
  }
}
function shadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !s.urukHai) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  switch (code) {
    case UH.plains:
    case UH.barrier:
      c.attackBonus += 1;
      c.uhKillPursuit = (c.uhKillPursuit ?? 0) + 1;
      log(
        s,
        `${card(code).name}: the attacking enemy gets +1 attack; if this attack destroys a character, the pursuit value increases by 1.`,
        "danger",
      );
      return true;
    case UH.orders:
      c.attackBonus += 1;
      c.uhOrders = true;
      log(
        s,
        "Saruman's Orders: the attacking enemy gets +1 attack; if this attack destroys a character, it returns to the staging area.",
        "danger",
      );
      return true;
    case UH.weariness:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Strange Weariness: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case UH.banks:
      prepend(s, fx("uhBanks", { player: p }));
      return true;
    case UH.fighter:
      prepend(s, fx("uhDiscardAttachment", { player: p }));
      return true;
  }
  return false;
}
function attackFinished(s: GameState, c: NonNullable<GameState["combat"]>) {
  if (!s.urukHai || !c.uhKilled || !c.uhKillPursuit) return [];
  return [
    fx("uhPursuit", {
      value: c.uhKillPursuit,
      text: "The shadow card's attack destroyed a character",
      player: c.attackPlayer ?? activeSeat(s),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Effects.

export function urukHaiEffect(s: GameState, e: Effect): boolean {
  const q = s.urukHai;
  if (!q || !e.kind.startsWith("uh")) return false;
  const first = firstPlayer(s);
  const p = e.player ?? activeSeat(s),
    u = findUnit(s, e.target);
  switch (e.kind) {
    case "uhSetupCaptive": {
      const heroes = s.heroes.filter(
        (h) => card(h.code).sphere_code !== "fellowship",
      );
      if (!heroes.length) {
        log(
          s,
          `Follow the Orcs: ${who(s, p)} control${s.table ? "s" : ""} no non-Fellowship hero to be a Captive.`,
        );
        return true;
      }
      choose(
        s,
        `Follow the Orcs · Choose a hero to be a Captive${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [fx("uhCaptive", { target: h.id, player: p })],
        })),
        "Setup: each player chooses 1 non-Fellowship hero he controls to be a Captive and places it faceup underneath To Isengard!",
      );
      return true;
    }
    case "uhCaptive": {
      if (!u || !s.heroes.some((h) => h.id === u.id)) return true;
      s.heroes = s.heroes.filter((h) => h.id !== u.id);
      s.committedIds = s.committedIds.filter((id) => id !== u.id);
      u.committed = false;
      q.captives.push({ unit: u, owner: p });
      log(
        s,
        `Follow the Orcs: ${name(u)} is a Captive, faceup underneath To Isengard!, in play but under no player's control.`,
        "danger",
      );
      return true;
    }
    case "uhDefeat": {
      const before = s.queue.length;
      questDefeated(s, q.currentQuest);
      const responses = s.queue.splice(0, s.queue.length - before);
      prepend(s, ...responses, fx("uhStageTwo", { player: first }));
      return true;
    }
    case "uhStageTwo": {
      q.advancing = false;
      s.stage = 2;
      s.progress = 0;
      q.currentQuest = UH.rescue;
      log(s, "Rescue the Captives begins.", "chapter");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("uhSearchUruk", { player })),
        fx("uhShuffle", { text: "Rescue the Captives", player: first }),
      );
      return true;
    }
    case "uhSearchUruk": {
      const options = urukOptions(s, "uhRevealUruk", p);
      if (!options.length) {
        log(
          s,
          `Rescue the Captives: ${who(s, p)} find${s.table ? "s" : ""} no Uruk-hai enemy in the encounter deck or discard pile.`,
        );
        return true;
      }
      choose(
        s,
        `Rescue the Captives · Reveal an Uruk-hai enemy${seatLabel(s, p)}`,
        options,
        "Each player searches the encounter deck and discard pile for an Uruk-hai enemy, reveals it, and adds it to the staging area.",
      );
      return true;
    }
    case "uhRevealUruk": {
      const zone = e.text === "discard" ? s.encounterDiscard : s.encounterDeck;
      const i = zone.lastIndexOf(e.code!);
      if (i < 0) return true;
      zone.splice(i, 1);
      log(
        s,
        `${who(s, p)} ${verb(s, "reveal")} ${card(e.code!).name} from the encounter ${e.text === "discard" ? "discard pile" : "deck"}.`,
        "danger",
      );
      // Fighting Uruk-hai: the revealed enemy is put into play engaged.
      if (e.flag)
        prepend(s, fx("uhEngageRevealed", { code: e.code, player: p }));
      revealed(s, e.code!, undefined, "encounter");
      return true;
    }
    case "uhEngageRevealed": {
      const enemy = [...s.staging].reverse().find((x) => x.code === e.code);
      if (enemy) engage(s, enemy);
      return true;
    }
    case "uhShuffle":
      shuffle(s, s.encounterDeck);
      log(s, `${e.text ?? "The Uruk-hai"}: the encounter deck is shuffled.`);
      return true;
    case "uhTreachery": {
      const held = q.resolving.find((x) => x.id === e.source);
      if (held) treachery(s, held.code);
      return true;
    }
    case "uhTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) s.encounterDiscard.push(q.resolving.splice(i, 1)[0].code);
      return true;
    }
    case "uhRestEnd":
      pursue(s, 3, "Rest by Night?");
      if (s.phase === "quest" || s.phase === "staging") {
        log(
          s,
          "Rest by Night?: the quest phase ends immediately, without resolving the quest.",
          "danger",
        );
        s.queue = s.queue.filter(
          (x) => !["reveal", "khazadStagingEnd", "questReady"].includes(x.kind),
        );
        s.queue.push(fx("finishQuestPhase", { player: first }));
      }
      return true;
    case "uhRestDamage": {
      const characters = committed(s);
      log(
        s,
        characters.length
          ? "Rest by Night?: 1 damage is dealt to each character committed to the quest."
          : "Rest by Night?: no character is committed to the quest.",
        "danger",
      );
      prepend(
        s,
        ...characters.map((c) =>
          fx("damage", { target: c.id, value: 1, player: ownerOf(s, c) }),
        ),
      );
      return true;
    }
    case "uhOrders": {
      const engaged = s.engaged.filter((x) => isEnemy(x));
      const options: Option[] = [
        ...engaged.map((x) => ({
          id: `return-${x.id}`,
          code: x.code,
          label: `Return ${name(x)} to the staging area`,
          effects: [fx("uhOrdersReturn", { target: x.id, player: p })],
        })),
        {
          id: "reveal",
          label: "Reveal an encounter card",
          effects: [fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Saruman's Orders · Choose${seatLabel(s, p)}`,
        options,
        "Each player must choose: either return an enemy engaged with him to the staging area, or reveal an encounter card.",
      );
      return true;
    }
    case "uhOrdersReturn":
      if (u) returnToStaging(s, u);
      return true;
    case "uhUruks": {
      choose(
        s,
        `Uglúk's Uruk-hai · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "pursuit",
            label: "Increase the pursuit value by 3",
            effects: [
              fx("uhPursuit", {
                value: 3,
                text: "Uglúk's Uruk-hai",
                player: p,
              }),
            ],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("reveal", { player: p })],
          },
        ],
        "Peril. When Revealed: either increase the pursuit value by 3, or reveal an additional encounter card.",
      );
      return true;
    }
    case "uhUruk": {
      const characters = [...s.heroes, ...s.allies];
      const options: Option[] = [
        ...(characters.length
          ? [
              {
                id: "damage",
                label: "Assign 3 damage among characters you control",
                effects: [fx("uhAssign", { value: 3, player: p })],
              },
            ]
          : []),
        {
          id: "reveal",
          label: "Reveal an additional encounter card",
          effects: [fx("reveal", { player: p })],
        },
      ];
      choose(
        s,
        `Isengard Uruk · Choose one${seatLabel(s, p)}`,
        options,
        "Peril. When Revealed: either assign 3 damage among characters you control, or reveal an additional encounter card.",
      );
      return true;
    }
    case "uhAssign": {
      const remaining = e.value ?? 0;
      const characters = [...s.heroes, ...s.allies];
      if (remaining <= 0 || !characters.length) return true;
      choose(
        s,
        `Isengard Uruk · Assign damage · ${remaining} remaining${seatLabel(s, p)}`,
        characters.map((c) => ({
          id: c.id,
          code: c.code,
          label: `${name(c)} · ${c.damage} damage`,
          effects: [
            fx("damage", { target: c.id, value: 1, player: p }),
            fx("uhAssign", { value: remaining - 1, player: p }),
          ],
        })),
        "Assign the damage one at a time among characters you control.",
      );
      return true;
    }
    case "uhSnaga": {
      if (!s.hand.length) {
        log(
          s,
          `Snaga: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      const i = Math.floor(random(s) * s.hand.length);
      const [discarded] = s.hand.splice(i, 1);
      s.discard.push(discarded.code);
      const cost = Number(card(discarded.code).cost) || 0;
      if (u && cost > 0) u.roundThreat = (u.roundThreat ?? 0) + cost;
      log(
        s,
        `Snaga: ${who(s, p)} ${verb(s, "discard")} a random card (${name(discarded)}, printed cost ${cost}); Snaga gets +${cost} threat until the end of the round.`,
        "danger",
      );
      return true;
    }
    case "uhGrishnakh": {
      const free = q.captives.filter((c) => !c.holder);
      if (!u || !free.length) return true;
      if (free.length === 1) {
        prepend(
          s,
          fx("uhAttachCaptive", {
            target: u.id,
            source: free[0].unit.id,
            player: first,
          }),
        );
        return true;
      }
      forOwner(s, first, () =>
        choose(
          s,
          `Grishnákh · Attach a Captive to him${seatLabel(s, first)}`,
          free.map((c) => ({
            id: c.unit.id,
            code: c.unit.code,
            label: `${name(c.unit)} · ${s.table ? seatName(s, c.owner) : "your hero"}`,
            effects: [
              fx("uhAttachCaptive", {
                target: u.id,
                source: c.unit.id,
                player: first,
              }),
            ],
          })),
          "Forced: after Grishnákh enters play, the first player attaches 1 of the Captives to him.",
        ),
      );
      return true;
    }
    case "uhAttachCaptive": {
      const captive = q.captives.find((c) => c.unit.id === e.source);
      if (!u || !captive || captive.holder) return true;
      captive.holder = u.id;
      log(
        s,
        `Grishnákh: the Captive ${name(captive.unit)} is attached to him.`,
        "danger",
      );
      return true;
    }
    case "uhGrishnakhDamage": {
      const captive = u ? captiveOf(s, u.id) : undefined;
      if (!captive) return true;
      captive.unit.damage += 1;
      log(
        s,
        `Grishnákh: 1 damage is dealt to the attached Captive, ${name(captive.unit)} (${captive.unit.damage} of ${card(captive.unit.code).health ?? 0}).`,
        "danger",
      );
      if (captive.unit.damage >= (card(captive.unit.code).health ?? 0))
        discardCaptive(s, captive.unit.id, "Grishnákh");
      return true;
    }
    case "uhPursuit":
      pursue(s, e.value ?? 0, e.text ?? "The Uruk-hai");
      return true;
    case "uhCombatPursuit": {
      if (!following(s)) return true;
      const enemies = s.staging.filter((x) => isEnemy(x)).length;
      if (enemies)
        pursue(
          s,
          enemies,
          `Follow the Orcs: ${enemies} enem${enemies === 1 ? "y is" : "ies are"} in the staging area at the end of the combat phase`,
        );
      return true;
    }
    case "uhRefreshPursuit": {
      if (!s.staging.some((x) => live(x, UH.isengard))) return true;
      pursue(s, 1, "To Isengard! at the end of the refresh phase");
      if (q.pursuit >= UH_LOST_PURSUIT)
        lose(
          s,
          `To Isengard!: the pursuit value is ${q.pursuit}. The Uruk-hai reach Isengard with their Captives, and the players lose the game.`,
        );
      return true;
    }
    case "uhWoldDraw":
      log(s, "The Wold is explored: each player draws 1 card.", "good");
      prepend(
        s,
        ...playerOrder(s).map((player) => fx("draw", { value: 1, player })),
      );
      return true;
    case "uhEastemnetResources":
      log(
        s,
        "Eastemnet is explored: 1 resource is added to each hero's resource pool.",
        "good",
      );
      prepend(
        s,
        ...globalCharacters(s)
          .filter((h) => isHero(h))
          .map((h) =>
            fx("resource", { target: h.id, value: 1, player: ownerOf(s, h) }),
          ),
      );
      return true;
    case "uhBanks":
      choose(
        s,
        `Banks of Entwash · Choose one${seatLabel(s, p)}`,
        [
          {
            id: "pursuit",
            label: "Increase the pursuit value by 1",
            effects: [
              fx("uhPursuit", {
                value: 1,
                text: "Banks of Entwash",
                player: p,
              }),
            ],
          },
          {
            id: "undefended",
            label: "This attack is considered undefended",
            effects: [fx("uhUndefended", { player: p })],
          },
        ],
        "Shadow: either increase the pursuit value by 1, or this attack is considered undefended.",
      );
      return true;
    case "uhUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(
          s,
          "Banks of Entwash: this attack is considered undefended.",
          "danger",
        );
      }
      return true;
    case "uhDiscardAttachment": {
      const hosts = [...globalCharacters(s), ...s.staging, ...globalEngaged(s)];
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
          `Uruk-hai Fighter: ${who(s, p)} control${s.table ? "s" : ""} no non-objective attachment.`,
        );
        return true;
      }
      choose(
        s,
        `Uruk-hai Fighter · Discard a non-objective attachment you control${seatLabel(s, p)}`,
        choices.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} · ${name(host)}`,
          effects: [
            fx("uhDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "uhDropAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) {
        log(s, `${card(a.code).name} is discarded.`, "danger");
        discardAttachment(s, u, a);
      }
      return true;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Hooks.

export const URUK_HAI_HOOKS: Batch4ScenarioHooks = {
  setup: setupUrukHai,
  // Follow the Orcs: each player chooses a Captive once the opening hands are kept.
  openingHandsKept: (s) => {
    if (!s.urukHai || s.round > 0) return false;
    prepend(
      s,
      ...playerOrder(s).map((player) => fx("uhSetupCaptive", { player })),
      fx("nextRound"),
    );
    return true;
  },
  advance,
  stageInfo: urukHaiStageInfo,
  check: (s) => {
    if (!s.urukHai) return;
    lotrSagaCheck(s);
    captivesCheck(s);
  },
  encounter,
  shadow,
  attackFinished,
  cannotCancel: (s, _shadow, code) => !!s.urukHai && code === UH.rest,
  // 1B: at the end of the combat phase, +1 pursuit for each enemy in the staging area.
  combatEnd: (s) => {
    if (following(s))
      prepend(s, fx("uhCombatPursuit", { player: firstPlayer(s) }));
  },
  // To Isengard!: at the end of the refresh phase, +1 pursuit; 30 or more loses.
  roundEnd: (s) =>
    s.urukHai ? [fx("uhRefreshPursuit", { player: firstPlayer(s) })] : [],
  // Grishnákh: at the end of the quest phase, 1 damage to the attached Captive.
  endQuest: (s) => {
    const q = s.urukHai;
    if (!q) return;
    for (const g of [...s.staging, ...globalEngaged(s)].filter((x) =>
      live(x, UH.grishnakh),
    ))
      if (captiveOf(s, g.id))
        prepend(
          s,
          fx("uhGrishnakhDamage", { target: g.id, player: firstPlayer(s) }),
        );
  },
  // Plains of Rohan: X is the number of locations in the staging area.
  // (Snaga's +X threat is a round threat modifier the engine counts.)
  threatBonus: (s, u) =>
    s.urukHai && live(u, UH.plains) ? s.staging.filter(isLocation).length : 0,
  // Fighting Uruk-hai: each enemy engaged with that player adds its threat.
  stagingThreat: (s) => {
    const f = s.urukHai?.fighting;
    if (!f || f.round !== s.round) return 0;
    return f.players
      .filter((p) => globalPlayerOrder(s).includes(p))
      .reduce(
        (n, p) =>
          n +
          seatView(s, p)
            .engaged.filter((x) => isEnemy(x))
            .reduce((m, x) => m + threatOf(s, x), 0),
        0,
      );
  },
  // Unseen Barrier: no more than 3 progress on the current quest this round.
  progress: (s, amount, quest) => {
    const q = s.urukHai;
    if (!q || amount <= 0 || quest.id !== mainQuestUnit(s)?.id) return amount;
    if (q.barrier?.round !== s.round) return amount;
    const room = Math.max(0, UH_BARRIER_LIMIT - q.barrier.placed);
    if (amount <= room) return amount;
    log(
      s,
      `Unseen Barrier: only ${room} more progress can be placed on the current quest this round.`,
    );
    return room;
  },
  questProgressPlaced: (s, _quest, amount) => {
    const q = s.urukHai;
    if (!q || amount <= 0) return;
    q.barrier =
      q.barrier?.round === s.round
        ? { round: s.round, placed: q.barrier.placed + amount }
        : { round: s.round, placed: amount };
  },
  // Banks of Entwash: +1 pursuit after any amount of progress is placed on it.
  locationProgressPlaced: (s, u, amount) => {
    if (s.urukHai && live(u, UH.banks) && amount > 0)
      prepend(
        s,
        fx("uhPursuit", {
          value: 1,
          text: "Banks of Entwash",
          player: firstPlayer(s),
        }),
      );
  },
  // 1B: Uglúk cannot leave the staging area or take damage.
  cannotEngage: (s, u) => following(s) && live(u, UH.ugluk),
  cannotLeave: (s, u) => following(s) && live(u, UH.ugluk) && inStaging(s, u),
  // Uglúk cannot have attachments.
  cannotAttach: (s, u) => !!s.urukHai && live(u, UH.ugluk),
  // Allies cannot be declared as attackers or defenders against Uglúk.
  cannotDefend: (s, enemy, defender) =>
    !!s.urukHai && live(enemy, UH.ugluk) && !!defender && isAlly(defender),
  cannotAttack: (s, character, enemy) =>
    !!s.urukHai && live(enemy, UH.ugluk) && isAlly(character),
  // Toughness X; Uglúk takes no damage at stage 1.
  damageAmount: (s, u, amount) => {
    if (!s.urukHai || !isEnemy(u) || amount <= 0) return amount;
    if (following(s) && live(u, UH.ugluk)) {
      log(s, "Follow the Orcs: Uglúk cannot take damage.");
      return 0;
    }
    const t = u.blanked ? 0 : uhToughness(u.code);
    if (!t) return amount;
    const reduced = Math.max(0, amount - t);
    log(
      s,
      `Toughness ${t}: the damage dealt to ${name(u)} is reduced to ${reduced}.`,
    );
    return reduced;
  },
  // Archery X in the staging area at the beginning of the combat phase.
  combatBegin: (s) => {
    if (!s.urukHai) return;
    const archery = s.staging.reduce(
      (n, x) => n + (x.blanked ? 0 : uhArchery(x.code)),
      0,
    );
    if (archery > 0)
      prepend(
        s,
        fx("heirsArchery", { value: archery, player: firstPlayer(s) }),
      );
  },
  travelEffects: (s, u) => {
    if (!s.urukHai || u.blanked) return undefined;
    if (u.code === UH.wold || u.code === UH.eastemnet)
      return [
        fx("uhPursuit", {
          value: 1,
          text: `${card(u.code).name}'s travel effect`,
          player: firstPlayer(s),
        }),
      ];
    return undefined;
  },
  // The Wold and Eastemnet gain their Response while they are active.
  explored: (s, u, wasActive) => {
    if (!s.urukHai || !wasActive || u.blanked) return;
    if (u.code === UH.wold)
      prepend(s, fx("uhWoldDraw", { player: firstPlayer(s) }));
    if (u.code === UH.eastemnet)
      prepend(s, fx("uhEastemnetResources", { player: firstPlayer(s) }));
  },
  cardEntered: (s, u, _fromReveal, cancelled) => {
    if (!s.urukHai || cancelled) return;
    if (live(u, UH.grishnakh))
      prepend(s, fx("uhGrishnakh", { target: u.id, player: firstPlayer(s) }));
  },
  // 2B: after an enemy is defeated, reduce the pursuit value by 1.
  // Grishnákh defeated: his Captive returns underneath To Isengard!.
  hostLeaves: (s, u, defeated) => {
    const q = s.urukHai;
    if (!q || !isEnemy(u)) return;
    const captive = captiveOf(s, u.id);
    if (captive) {
      if (defeated) {
        delete captive.holder;
        log(
          s,
          `Grishnákh is defeated: the Captive ${name(captive.unit)} is placed faceup underneath To Isengard!.`,
          "good",
        );
      } else discardCaptive(s, captive.unit.id, "Grishnákh leaves play");
    }
    if (defeated && rescuing(s))
      prepend(
        s,
        fx("uhPursuit", {
          value: -1,
          text: "Rescue the Captives: an enemy is defeated",
          player: firstPlayer(s),
        }),
      );
  },
  // Uruk-hai Fighter and Saruman's Orders return the attacker after a kill.
  characterDestroyed: (s, u, context) => {
    const c = s.combat;
    if (
      !s.urukHai ||
      !c ||
      !(isHero(u) || isAlly(u)) ||
      !context.combatDamage ||
      context.enemyId !== c.enemyId
    )
      return;
    c.uhKilled = true;
    const enemy = get(s, c.enemyId);
    if (c.uhOrders || (enemy && live(enemy, UH.fighter)))
      c.returnToStaging = true;
  },
  effect: urukHaiEffect,
  sharedEffect: (e) =>
    [
      "uhDefeat",
      "uhStageTwo",
      "uhShuffle",
      "uhTreacheryDone",
      "uhRestEnd",
      "uhRestDamage",
      "uhPursuit",
      "uhCombatPursuit",
      "uhRefreshPursuit",
      "uhWoldDraw",
      "uhEastemnetResources",
      "uhAttachCaptive",
      "uhGrishnakhDamage",
    ].includes(e.kind),
};
