import type { Effect, GameState, Unit } from "./types";
import type { Batch4ScenarioHooks } from "./batch4-scenario-contract";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  make,
  prepend,
  putPlayerDeck,
  random,
  shuffle,
  takePlayerDeck,
} from "./core";
import {
  addVictoryCard,
  discardCharacter,
  enemyAddedToStaging,
  exhaustCharacter,
  questDefeated,
  removeFromQuest,
  raiseThreat,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  allHeroes,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import { reduceThreat } from "./threat-reduction";
import { heirsCannotHaveAttachments } from "./heirs-numenor";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import {
  GHOST_FRAMSBURG as G,
  GHOST_FRAMSBURG_RECIPES,
  GHOST_FRAMSBURG_LOOT,
  GHOST_FRAMSBURG_QUEST_CHAIN,
  ghostFramsburgStageInfo,
} from "./ghost-framsburg-support";
export * from "./ghost-framsburg-support";
const live = (s: GameState) =>
  s.scenarioId === "the-ghost-of-framsburg" && !!s.ghostFramsburg;
const trait = (u: Unit | string, t: string) =>
  (typeof u === "string"
    ? (card(u).traits ?? "")
    : [
        ...(card(u.code).traits ?? "").split("."),
        ...(u.dynamicTraits ?? []),
      ].join(".")
  )
    .split(".")
    .some((v) => v.trim() === t);
const own = (s: GameState, p: number) => [
  ...seatView(s, p).heroes,
  ...seatView(s, p).allies,
];
const dark = (s: GameState) =>
  !!s.activeLocation && trait(s.activeLocation, "Dark");
const phaseKey = (s: GameState) =>
  ["defense", "attack"].includes(s.phase)
    ? "combat"
    : ["quest", "staging"].includes(s.phase)
      ? "quest"
      : s.phase;
export const ghostControlledLoot = (s: GameState) =>
  allCharacters(s).flatMap((host) =>
    host.attachments
      .filter((a) => GHOST_FRAMSBURG_LOOT.includes(a.code))
      .map((a) => ({ host, a })),
  );
const lootCount = (s: GameState) => ghostControlledLoot(s).length;
export function ghostDiscoverValue(
  s: GameState,
  u: Unit | undefined = s.activeLocation ?? undefined,
) {
  if (!u || (u.blanked && !u.printedKeywordsPreserved)) return 0;
  const base =
    u.code === G.staircase
      ? Math.floor(seatView(s, firstPlayer(s)).threat / 10)
      : u.code === G.hall
        ? 4
        : u.code === G.tower
          ? 3
          : u.code === G.moonlit
            ? 2
            : 0;
  return Math.max(
    0,
    base +
      (s.ghostFramsburg?.discoverModifiers.find((m) => m.id === u.id)?.amount ??
        0),
  );
}
const hasDiscover = (u: Unit) =>
  (!u.blanked || !!u.printedKeywordsPreserved) &&
  [G.staircase, G.hall, G.tower, G.moonlit].includes(u.code);
const claimHeroes = (s: GameState, player: number) =>
  seatView(s, player).heroes.filter((h) => !heirsCannotHaveAttachments(h));
const add = (s: GameState, code: string) => {
  const u = make(s, code);
  s.staging.push(u);
  if (card(code).type_code === "enemy") enemyAddedToStaging(s, u);
  return u;
};
function discardUntil(s: GameState, predicate: (code: string) => boolean) {
  while (s.encounterDeck.length) {
    const code = s.encounterDeck.shift()!;
    if (predicate(code)) return code;
    s.encounterDiscard.push(code);
  }
  return undefined;
}
function removeFromBoard(s: GameState, u: Unit) {
  s.staging = s.staging.filter((c) => c.id !== u.id);
  for (const p of playerOrder(s))
    forOwner(s, p, () => {
      s.engaged = s.engaged.filter((c) => c.id !== u.id);
    });
}
function startClaim(s: GameState) {
  const q = s.ghostFramsburg!;
  if (
    q.claiming ||
    s.status !== "playing" ||
    !claimHeroes(s, firstPlayer(s)).length
  )
    return;
  const free = q.loot.find((l) => !l.guardId);
  if (free) {
    q.claiming = free.unit.id;
    prepend(
      s,
      fx("ghostFramsburgClaim", {
        source: free.unit.id,
        player: firstPlayer(s),
      }),
    );
  }
}
export function setupGhostFramsburg(s: GameState) {
  if (s.scenarioId !== "the-ghost-of-framsburg") return;
  const recipe = GHOST_FRAMSBURG_RECIPES.find(
    (r) => r.id === (s.easyMode ? "E" : "Q") + "08.7",
  )!;
  const codes = (sections: string[]) =>
    recipe.cards
      .filter((c) => sections.includes(c.section))
      .flatMap((c) => Array<string>(c.quantity).fill(c.code));
  s.encounterDeck = shuffle(
    s,
    codes(["sharedEncounterDeck", "sharedStagingArea"]),
  );
  s.ghostFramsburg = {
    initialized: false,
    advancing: false,
    currentQuest: G.keep,
    questDeck: GHOST_FRAMSBURG_QUEST_CHAIN.slice(1),
    completedQuests: [],
    setAside: codes(["sharedSetAside"]).map((c) => make(s, c)),
    discoverCards: [],
    loot: [],
    removed: [],
    setupLocations: [],
    discoverModifiers: [],
    noReady: [],
    noDamage: [],
    shadows: [],
    threatReduced: [],
    destroyedEnemies: [],
  };
}
export function ghostFramsburgOpening(s: GameState) {
  if (!live(s) || s.ghostFramsburg!.initialized) return false;
  prepend(
    s,
    ...playerOrder(s).map((player) =>
      fx("ghostFramsburgSetupLocation", { player }),
    ),
    fx("ghostFramsburgSetupDone", { player: firstPlayer(s) }),
    fx("nextRound"),
  );
  return true;
}
export function ghostFramsburgAdvance(s: GameState) {
  if (!live(s)) return false;
  const q = s.ghostFramsburg!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  const needed = s.stage === 1 ? 6 : s.stage === 2 ? 12 : 6;
  if (
    s.progress < needed ||
    (s.stage < 3 && lootCount(s) < s.stage) ||
    questDefeated(s, q.currentQuest)
  )
    return true;
  if (s.stage === 3) {
    if (s.victoryCards?.includes(G.shade)) {
      win(s);
      s.reason =
        "Fram's Shade is laid to rest and the companions recover Wormsbane.";
    }
    return true;
  }
  q.advancing = true;
  prepend(s, fx("ghostFramsburgAdvance", { player: firstPlayer(s) }));
  return true;
}
export function ghostFramsburgStats(s: GameState, u: Unit) {
  let will = 0,
    attack = 0,
    defense = 0;
  if (!live(s)) return { will, attack, defense };
  if (!u.blanked) {
    if (u.code === G.shade) {
      attack += lootCount(s);
      defense += lootCount(s);
    }
    if (u.code === G.stalker) {
      attack += Math.floor(seatView(s, firstPlayer(s)).threat / 10);
      defense += Math.floor(seatView(s, firstPlayer(s)).threat / 10);
    }
    if (u.code === G.werewolf) attack += u.damage;
  }
  const penalty = s
    .ghostFramsburg!.shadows.filter((m) => m.id === u.id && m.round === s.round)
    .reduce((n, m) => n + m.amount, 0);
  return {
    will: will - penalty,
    attack: attack - penalty,
    defense: defense - penalty,
  };
}
export function ghostFramsburgThreatReduction(
  s: GameState,
  amount: number,
  reason?: string,
) {
  if (!live(s) || reason !== "player-card") return amount;
  const q = s.ghostFramsburg!,
    p = activeSeat(s),
    record = q.threatReduced.find((m) => m.player === p && m.round === s.round),
    n = Math.min(
      amount,
      s.staging.some((u) => u.code === G.moonlit && !u.blanked)
        ? Math.max(0, 1 - (record?.amount ?? 0))
        : Infinity,
      seatView(s, p).threat,
    );
  if (record) record.amount += n;
  else q.threatReduced.push({ player: p, round: s.round, amount: n });
  return n;
}
export function ghostFramsburgTravelEntered(
  s: GameState,
  u: Unit,
  actual: boolean,
) {
  if (!live(s) || u.blanked) return;
  if (hasDiscover(u))
    prepend(
      s,
      fx(actual ? "ghostFramsburgKeyResponse" : "ghostFramsburgDiscover", {
        target: u.id,
        player: firstPlayer(s),
      }),
    );
  if (u.code === G.crypt)
    prepend(
      s,
      fx("ghostFramsburgCrypt", { target: u.id, player: firstPlayer(s) }),
    );
  if (actual && u.code === G.tomb)
    prepend(
      s,
      fx("ghostFramsburgTomb", { target: u.id, player: firstPlayer(s) }),
    );
}
export function ghostFramsburgHostLeaves(
  s: GameState,
  u: Unit,
  defeated = true,
) {
  if (!live(s)) return;
  const q = s.ghostFramsburg!;
  for (const l of q.loot.filter((v) => v.guardId === u.id)) l.guardId = "";
  q.discoverModifiers = q.discoverModifiers.filter((m) => m.id !== u.id);
  if (
    defeated &&
    card(u.code).type_code === "enemy" &&
    !q.destroyedEnemies.includes(u.id)
  )
    q.destroyedEnemies.push(u.id);
  startClaim(s);
}
export function ghostFramsburgEnemyDestination(s: GameState, u: Unit) {
  if (!live(s)) return false;
  const q = s.ghostFramsburg!,
    destroyed = q.destroyedEnemies.includes(u.id);
  q.destroyedEnemies = q.destroyedEnemies.filter((id) => id !== u.id);
  if (!destroyed) return false;
  if (u.code === G.spectre && !u.blanked && dark(s)) {
    s.encounterDeck = shuffle(s, [...s.encounterDeck, u.code]);
    return true;
  }
  if (u.code === G.shade && s.stage === 3 && s.victoryCards?.includes(G.tomb)) {
    addVictoryCard(s, u.code);
    s.victory += 6;
    return true;
  }
  return false;
}
export function ghostFramsburgEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  if (!live(s)) return false;
  if (GHOST_FRAMSBURG_LOOT.includes(code)) return true;
  if (![G.ruins, G.terrible, G.slammed, G.afraid, G.eyes].includes(code))
    return false;
  if (!replay) s.encounterDiscard.push(code);
  prepend(
    s,
    fx("ghostFramsburgTreachery", {
      code,
      player: firstPlayer(s),
      flag: fromReveal,
    }),
  );
  return true;
}
export function ghostFramsburgCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  _cancelled: boolean,
) {
  if (!live(s)) return;
  const q = s.ghostFramsburg!;
  if (q.revealing) {
    const i = q.discoverCards.findIndex(
      (c) => c.id === q.revealing && c.code === u.code,
    );
    if (i >= 0) {
      const old = q.discoverCards.splice(i, 1)[0];
      u.id = old.id;
      delete q.revealing;
    }
  }
  if (fromReveal && GHOST_FRAMSBURG_LOOT.includes(u.code)) {
    s.staging = s.staging.filter((c) => c.id !== u.id);
    s.encounterDiscard.push(u.code);
    prepend(s, fx("reveal", { player: activeSeat(s) }));
  }
}
type GhostCombat = NonNullable<GameState["combat"]> & {
  ghostThreatOnKill?: number;
};
export function ghostFramsburgShadow(s: GameState, code: string) {
  if (!live(s) || !s.combat) return false;
  const c = s.combat as GhostCombat,
    p = c.attackPlayer ?? activeSeat(s),
    defenders = c.defenderIds ?? (c.defenderId ? [c.defenderId] : []);
  if (code === G.stalker)
    prepend(
      s,
      fx("ghostFramsburgStalkerShadow", { player: p, target: c.enemyId }),
    );
  else if (code === G.spectre) c.attackBonus += dark(s) ? 2 : 1;
  else if (code === G.moonlit)
    prepend(s, fx("ghostFramsburgThreat", { player: p, value: 1 }));
  else if (code === G.tower)
    prepend(s, fx("ghostFramsburgDiscardAttachment", { player: p }));
  else if (code === G.terrible) {
    c.attackBonus++;
    c.ghostThreatOnKill = (c.ghostThreatOnKill ?? 0) + 3;
  } else if (code === G.ruins) c.extraAttacks = (c.extraAttacks ?? 0) + 1;
  else if (code === G.spider)
    for (const id of defenders)
      s.ghostFramsburg!.noReady.push({ id, round: s.round });
  else if (code === G.werewolf)
    prepend(
      s,
      ...defenders.map((target) =>
        fx("damage", { target, value: 1, player: p }),
      ),
    );
  else if (code === G.bats) {
    if (dark(s))
      s.ghostFramsburg!.noDamage.push({
        id: c.enemyId,
        round: s.round,
        phase: phaseKey(s),
      });
  } else if (code === G.eyes) {
    if (!defenders.length)
      prepend(s, fx("ghostFramsburgDiscardAlly", { player: p }));
  } else return false;
  return true;
}
export function ghostFramsburgAbilityProblem(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (!a || ![G.lantern, G.teeth].includes(a.code)) return null;
  if (a.blanked || a.facedown)
    return "This Loot objective's ability is unavailable.";
  if (ownerOf(s, u) !== activeSeat(s))
    return "Only the controller of this Loot objective can use it.";
  if (a.exhausted) return "Ready this Loot objective before using it.";
  if (
    a.code === G.teeth &&
    (u.exhausted || khazadCannotExhaust(u) || watcherWaterCannotExhaust(u))
  )
    return "Ready the attached hero to pay this cost.";
  if (a.code === G.lantern && ghostDiscoverValue(s) <= 0)
    return "An active Discover location is required.";
  return null;
}
export function ghostFramsburgAbility(
  s: GameState,
  u: Unit,
  attachmentId?: string,
) {
  const a = u.attachments.find((a) => a.id === attachmentId);
  if (!live(s) || !a || ![G.lantern, G.teeth].includes(a.code)) return false;
  if (ghostFramsburgAbilityProblem(s, u, attachmentId)) return true;
  if (a.code === G.teeth && !exhaustCharacter(s, u)) return true;
  a.exhausted = true;
  choose(
    s,
    `${card(a.code).name} · Choose a player`,
    playerOrder(s).map((player) => ({
      id: String(player),
      label: `Player ${player + 1}`,
      effects: [
        fx(
          a.code === G.lantern
            ? "ghostFramsburgLantern"
            : "ghostFramsburgTeeth",
          { player, value: ghostDiscoverValue(s) },
        ),
      ],
    })),
  );
  return true;
}
export function ghostFramsburgEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("ghostFramsburg")) return false;
  const q = s.ghostFramsburg;
  if (!q) return true;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  selectSeat(s, player);
  switch (e.kind) {
    case "ghostFramsburgThreat":
      raiseThreat(
        s,
        e.value ?? 0,
        e.text === "quest-card" ? "quest-card" : "encounter",
      );
      break;
    case "ghostFramsburgSetupLocation": {
      const available = [
        ...new Set(
          s.encounterDeck.filter(
            (c) =>
              card(c).type_code === "location" && !q.setupLocations.includes(c),
          ),
        ),
      ];
      choose(
        s,
        `Player ${player + 1} · Search for a different location`,
        available.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("ghostFramsburgSetupTake", { code, player })],
        })),
      );
      break;
    }
    case "ghostFramsburgSetupTake": {
      const i = s.encounterDeck.indexOf(e.code!);
      if (i >= 0 && !q.setupLocations.includes(e.code!)) {
        q.setupLocations.push(e.code!);
        add(s, s.encounterDeck.splice(i, 1)[0]);
      }
      break;
    }
    case "ghostFramsburgSetupDone":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      q.initialized = true;
      break;
    case "ghostFramsburgAdvance":
      q.completedQuests.push(q.currentQuest);
      q.currentQuest = q.questDeck.shift()!;
      s.stage++;
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("ghostFramsburgStageReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    case "ghostFramsburgStageReveal":
      if (s.stage === 2) {
        s.encounterDeck = shuffle(s, [
          ...s.encounterDeck,
          ...s.encounterDiscard.splice(0),
        ]);
        prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
      }
      if (s.stage === 3) {
        const i = q.setAside.findIndex((c) => c.code === G.tomb);
        if (i >= 0) s.staging.push(q.setAside.splice(i, 1)[0]);
        prepend(
          s,
          ...playerOrder(s)
            .filter((p) => p !== firstPlayer(s))
            .map((player) => fx("ghostFramsburgFindUndead", { player })),
          fx("ghostFramsburgShuffle", { player: firstPlayer(s) }),
        );
      }
      break;
    case "ghostFramsburgFindUndead": {
      const codes = [
        ...new Set(
          [...s.encounterDeck, ...s.encounterDiscard].filter(
            (c) =>
              card(c).type_code === "enemy" &&
              !card(c).is_unique &&
              trait(c, "Undead"),
          ),
        ),
      ];
      choose(
        s,
        `Player ${player + 1} · Find a non-unique Undead enemy`,
        codes.map((code) => ({
          id: code,
          code,
          label: card(code).name,
          effects: [fx("ghostFramsburgTakeUndead", { code, player })],
        })),
      );
      break;
    }
    case "ghostFramsburgTakeUndead": {
      const pile = s.encounterDeck.includes(e.code!)
          ? s.encounterDeck
          : s.encounterDiscard,
        i = pile.indexOf(e.code!);
      if (i >= 0) add(s, pile.splice(i, 1)[0]);
      break;
    }
    case "ghostFramsburgShuffle":
      s.encounterDeck = shuffle(s, s.encounterDeck);
      break;
    case "ghostFramsburgQuestBegin":
      choose(s, "Searching the Ruins · Choose one", [
        {
          id: "threat",
          label: "Raise each player's threat by 2",
          effects: playerOrder(s).map((player) =>
            fx("ghostFramsburgThreat", { player, value: 2 }),
          ),
        },
        {
          id: "location",
          label: "Discard until a location is found and add it to staging",
          effects: [
            fx("ghostFramsburgFindLocation", { player: firstPlayer(s) }),
          ],
        },
      ]);
      break;
    case "ghostFramsburgFindLocation": {
      const code = discardUntil(s, (c) => card(c).type_code === "location");
      if (code) add(s, code);
      break;
    }
    case "ghostFramsburgKeyResponse": {
      const key = ghostControlledLoot(s).find(
        (v) => v.a.code === G.key && !v.a.exhausted && !v.a.blanked,
      );
      if (!u || !key) {
        prepend(s, fx("ghostFramsburgDiscover", { target: e.target, player }));
        break;
      }
      selectSeat(s, ownerOf(s, key.host));
      choose(s, "Crypt Key · Change the Discover value?", [
        {
          id: "increase",
          label: "Exhaust Crypt Key · Discover +1",
          effects: [
            fx("ghostFramsburgUseKey", {
              target: u.id,
              source: key.a.id,
              value: 1,
              player: ownerOf(s, key.host),
            }),
          ],
        },
        {
          id: "decrease",
          label: "Exhaust Crypt Key · Discover −1",
          effects: [
            fx("ghostFramsburgUseKey", {
              target: u.id,
              source: key.a.id,
              value: -1,
              player: ownerOf(s, key.host),
            }),
          ],
        },
        {
          id: "skip",
          label: "Keep the Discover value",
          effects: [fx("ghostFramsburgDiscover", { target: u.id, player })],
        },
      ]);
      break;
    }
    case "ghostFramsburgUseKey": {
      const key = ghostControlledLoot(s).find(
        (v) => v.a.id === e.source && !v.a.exhausted,
      );
      if (u && key) {
        key.a.exhausted = true;
        q.discoverModifiers = q.discoverModifiers.filter((m) => m.id !== u.id);
        q.discoverModifiers.push({ id: u.id, amount: e.value ?? 0 });
      }
      prepend(
        s,
        fx("ghostFramsburgDiscover", {
          target: e.target,
          player: firstPlayer(s),
        }),
      );
      break;
    }
    case "ghostFramsburgDiscover": {
      if (!u || s.activeLocation?.id !== u.id || !hasDiscover(u)) break;
      const n = ghostDiscoverValue(s, u);
      if (s.encounterDeck.length < n)
        s.encounterDeck = shuffle(s, [
          ...s.encounterDeck,
          ...s.encounterDiscard.splice(0),
        ]);
      q.discoverCards = s.encounterDeck.splice(0, n).map((c) => make(s, c));
      const looked = `Looked at: ${q.discoverCards.map((c) => name(c)).join(", ") || "no cards"}. After the Loot choice, reveal one random Hazard and discard the other cards.`;
      const loot = q.discoverCards.filter((c) =>
        GHOST_FRAMSBURG_LOOT.includes(c.code),
      );
      if (loot.length)
        choose(
          s,
          `Discover ${n} · Choose a Loot objective`,
          loot.map((c) => ({
            id: c.id,
            code: c.code,
            label: `Guard ${name(c)} with ${name(u)}`,
            effects: [
              fx("ghostFramsburgDiscoverLoot", {
                source: c.id,
                target: u.id,
                player,
                value: n,
              }),
            ],
          })),
          looked,
        );
      else if (q.discoverCards.length)
        choose(
          s,
          `Discover ${n} · Looked-at cards`,
          [
            {
              id: "continue",
              label: "Resolve discovery",
              effects: [
                fx("ghostFramsburgDiscoverHazard", {
                  target: u.id,
                  player,
                  value: n,
                }),
              ],
            },
          ],
          looked,
        );
      else
        prepend(
          s,
          fx("ghostFramsburgDiscoverHazard", {
            target: u.id,
            player,
            value: n,
          }),
        );
      break;
    }
    case "ghostFramsburgDiscoverLoot": {
      const i = q.discoverCards.findIndex((c) => c.id === e.source);
      if (i >= 0 && u)
        q.loot.push({ unit: q.discoverCards.splice(i, 1)[0], guardId: u.id });
      prepend(
        s,
        fx("ghostFramsburgDiscoverHazard", {
          target: e.target,
          player,
          value: e.value,
        }),
      );
      break;
    }
    case "ghostFramsburgDiscoverHazard": {
      const hazards = q.discoverCards.filter((c) => trait(c, "Hazard"));
      if (hazards.length) {
        const hazard = hazards[Math.floor(random(s) * hazards.length)];
        if (card(hazard.code).type_code === "treachery")
          q.discoverCards = q.discoverCards.filter((c) => c.id !== hazard.id);
        else q.revealing = hazard.id;
        prepend(
          s,
          fx("revealCard", { code: hazard.code, player }),
          fx("ghostFramsburgDiscoverEnd", {
            target: e.target,
            player,
            value: e.value,
            flag: true,
          }),
        );
      } else
        prepend(
          s,
          fx("ghostFramsburgDiscoverEnd", {
            target: e.target,
            player,
            value: e.value,
          }),
        );
      break;
    }
    case "ghostFramsburgDiscoverEnd":
      s.encounterDiscard.push(...q.discoverCards.splice(0).map((c) => c.code));
      delete q.revealing;
      if (u?.code === G.staircase && !u.blanked && !e.flag)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("ghostFramsburgReduceEncounter", {
              player,
              value: Math.floor(seatView(s, firstPlayer(s)).threat / 10),
            }),
          ),
        );
      break;
    case "ghostFramsburgReduceEncounter":
      reduceThreat(s, e.value ?? 0, undefined, "encounter");
      break;
    case "ghostFramsburgCrypt": {
      const code = discardUntil(
        s,
        (c) => card(c).type_code === "enemy" && trait(c, "Undead"),
      );
      if (code) {
        const enemy = add(s, code),
          loot = [
            ...new Set(
              s.encounterDiscard.filter((c) =>
                GHOST_FRAMSBURG_LOOT.includes(c),
              ),
            ),
          ];
        choose(
          s,
          "Forgotten Crypt · Guard a discarded Loot objective",
          loot.map((code) => ({
            id: code,
            code,
            label: card(code).name,
            effects: [
              fx("ghostFramsburgCryptLoot", { target: enemy.id, code, player }),
            ],
          })),
        );
      }
      break;
    }
    case "ghostFramsburgCryptLoot": {
      const i = s.encounterDiscard.indexOf(e.code!);
      if (i >= 0 && u)
        q.loot.push({
          unit: make(s, s.encounterDiscard.splice(i, 1)[0]),
          guardId: u.id,
        });
      break;
    }
    case "ghostFramsburgClaim": {
      const loot = q.loot.find((l) => l.unit.id === e.source && !l.guardId);
      if (!loot) {
        delete q.claiming;
        break;
      }
      choose(
        s,
        `${card(loot.unit.code).name} · Attach to a hero you control`,
        claimHeroes(s, player).map((h) => ({
          id: h.id,
          code: h.code,
          label: name(h),
          effects: [
            fx("ghostFramsburgClaimTake", {
              source: loot.unit.id,
              target: h.id,
              player,
            }),
          ],
        })),
      );
      break;
    }
    case "ghostFramsburgClaimTake": {
      const i = q.loot.findIndex((l) => l.unit.id === e.source && !l.guardId);
      if (i >= 0 && u && claimHeroes(s, player).some((h) => h.id === u.id)) {
        const loot = q.loot.splice(i, 1)[0].unit;
        u.attachments.push({
          id: loot.id,
          code: loot.code,
          exhausted: loot.exhausted,
          owner: player,
          controller: player,
        });
      }
      delete q.claiming;
      startClaim(s);
      break;
    }
    case "ghostFramsburgTomb": {
      const pile = s.encounterDeck.includes(G.shade)
          ? s.encounterDeck
          : s.encounterDiscard,
        i = pile.indexOf(G.shade);
      let shade = [...s.staging, ...allEngaged(s)].find(
        (c) => c.code === G.shade,
      );
      if (i >= 0) shade = add(s, pile.splice(i, 1)[0]);
      s.encounterDeck = shuffle(s, s.encounterDeck);
      if (shade)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("immediateAttack", { target: shade!.id, player }),
          ),
        );
      break;
    }
    case "ghostFramsburgTreachery":
      if (e.code === G.ruins) {
        if (s.activeLocation && hasDiscover(s.activeLocation))
          prepend(
            s,
            ...playerOrder(s).map((player) =>
              fx("ghostFramsburgDiscover", {
                target: s.activeLocation!.id,
                player,
              }),
            ),
          );
        else
          prepend(
            s,
            ...playerOrder(s).map((player) =>
              fx("ghostFramsburgThreat", { player, value: 2 }),
            ),
            fx("reveal", { player }),
          );
      }
      if (e.code === G.terrible)
        for (const c of allCharacters(s))
          q.shadows.push({ id: c.id, round: s.round, amount: 1 });
      if (e.code === G.slammed) {
        q.slammedRound = s.round;
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("chooseExhaust", { count: 1, player }),
          ),
        );
      }
      if (e.code === G.eyes)
        prepend(
          s,
          ...playerOrder(s).map((player) =>
            fx("ghostFramsburgEyes", { player }),
          ),
        );
      if (e.code === G.afraid) {
        const heroes = allHeroes(s).filter(
          (h) => h.committed && !h.attachments.some((a) => a.code === G.afraid),
        );
        choose(
          s,
          "Afraid of the Dark · Choose a questing hero",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [
              fx("ghostFramsburgAfraid", {
                target: h.id,
                player: ownerOf(s, h),
              }),
            ],
          })),
        );
      }
      break;
    case "ghostFramsburgAfraid":
      if (u?.committed) {
        const i = s.encounterDiscard.lastIndexOf(G.afraid);
        if (i >= 0) {
          s.encounterDiscard.splice(i, 1);
          const a = make(s, G.afraid);
          u.attachments.push({ id: a.id, code: a.code, exhausted: false });
          removeFromQuest(s, u);
          forOwner(s, player, () => {
            s.committedIds = s.committedIds.filter((id) => id !== u.id);
          });
        }
      }
      break;
    case "ghostFramsburgEyes": {
      const chars = own(s, player).filter((c) => c.committed);
      choose(s, "Eyes in the Dark · Choose one", [
        {
          id: "threat",
          label: `Raise your threat by ${chars.length}`,
          effects: [
            fx("ghostFramsburgThreat", { player, value: chars.length }),
          ],
        },
        ...chars.map((c) => ({
          id: c.id,
          code: c.code,
          label: `Discard ${name(c)}`,
          effects: [
            fx("ghostFramsburgDiscardCharacter", { target: c.id, player }),
          ],
        })),
      ]);
      break;
    }
    case "ghostFramsburgDiscardCharacter":
      if (u) discardCharacter(s, u);
      break;
    case "ghostFramsburgStalkerShadow":
      choose(s, "Crypt Stalker · Choose one", [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [fx("ghostFramsburgThreat", { player, value: 2 })],
        },
        {
          id: "return",
          label: "Return attacking enemy to staging",
          effects: [
            fx("ghostFramsburgReturnEnemy", { target: e.target, player }),
          ],
        },
      ]);
      break;
    case "ghostFramsburgReturnEnemy":
      if (u) {
        removeFromBoard(s, u);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
    case "ghostFramsburgDiscardAttachment": {
      const options = own(s, player).flatMap((h) =>
        h.attachments
          .filter(
            (a) =>
              !a.facedown && !card(a.code).type_code.startsWith("objective"),
          )
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name}`,
            effects: [
              fx("discardAttachment", { target: h.id, source: a.id, player }),
            ],
          })),
      );
      choose(s, "Cursed Tower · Discard a non-objective attachment", options);
      break;
    }
    case "ghostFramsburgDiscardAlly":
      choose(
        s,
        "Discard an ally you control",
        seatView(s, player).allies.map((c) => ({
          id: c.id,
          code: c.code,
          label: name(c),
          effects: [
            fx("ghostFramsburgDiscardCharacter", { target: c.id, player }),
          ],
        })),
      );
      break;
    case "ghostFramsburgTeeth":
      reduceThreat(s, 2, undefined, "encounter");
      break;
    case "ghostFramsburgLantern": {
      const n = Math.min(e.value ?? 0, seatView(s, player).deck.length);
      choose(
        s,
        "Old Lantern · Add one looked-at card to your hand",
        seatView(s, player)
          .deck.slice(0, n)
          .map((code, i) => ({
            id: String(i),
            code,
            label: card(code).name,
            effects: [
              fx("ghostFramsburgLanternTake", {
                player,
                value: i,
                count: n,
                code,
              }),
            ],
          })),
      );
      break;
    }
    case "ghostFramsburgLanternTake":
      forOwner(s, player, () => {
        if (s.deck[e.value!] === e.code) {
          s.hand.push(takePlayerDeck(s, e.value!));
          prepend(
            s,
            fx("ghostFramsburgLanternBottom", {
              player,
              count: (e.count ?? 1) - 1,
            }),
          );
        }
      });
      break;
    case "ghostFramsburgLanternBottom":
      if ((e.count ?? 0) > 0)
        choose(
          s,
          "Old Lantern · Order the remaining cards on the bottom",
          seatView(s, player)
            .deck.slice(0, e.count)
            .map((code, i) => ({
              id: String(i),
              code,
              label: `Place ${card(code).name} next on the bottom`,
              effects: [
                fx("ghostFramsburgLanternPut", {
                  player,
                  value: i,
                  count: e.count,
                  code,
                }),
              ],
            })),
        );
      break;
    case "ghostFramsburgLanternPut":
      forOwner(s, player, () => {
        if (s.deck[e.value!] === e.code)
          putPlayerDeck(s, takePlayerDeck(s, e.value!));
      });
      prepend(
        s,
        fx("ghostFramsburgLanternBottom", {
          player,
          count: (e.count ?? 1) - 1,
        }),
      );
      break;
    default:
      return false;
  }
  return true;
}
export const GHOST_FRAMSBURG_HOOKS: Batch4ScenarioHooks = {
  setup: setupGhostFramsburg,
  openingHandsKept: ghostFramsburgOpening,
  check: startClaim,
  advance: ghostFramsburgAdvance,
  stageInfo: ghostFramsburgStageInfo,
  stats: ghostFramsburgStats,
  threatBonus: (s, u) =>
    !live(s) || u.blanked
      ? 0
      : u.code === G.shade
        ? lootCount(s)
        : [G.stalker, G.staircase].includes(u.code)
          ? Math.floor(seatView(s, firstPlayer(s)).threat / 10)
          : 0,
  locationProgressPlaced: (s, u, amount) => {
    if (
      amount > 0 &&
      trait(u, "Dark") &&
      s.staging.some((c) => c.id === u.id)
    ) {
      const n = s.staging.filter((c) => c.code === G.hall && !c.blanked).length;
      if (n)
        prepend(
          s,
          fx("ghostFramsburgThreat", { player: activeSeat(s), value: n }),
        );
    }
  },
  shadowCards: (s, u, amount) =>
    amount > 0 && u.code === G.shade && !u.blanked
      ? Math.max(1, lootCount(s))
      : amount,
  threatReduction: ghostFramsburgThreatReduction,
  questBegin: (s) =>
    s.stage === 2
      ? [fx("ghostFramsburgQuestBegin", { player: firstPlayer(s) })]
      : [],
  immune: (s, u) =>
    (!u.blanked && [G.tomb, G.crypt].includes(u.code)) ||
    (s.stage === 3 && u.code === G.shade),
  cannotAttach: (_s, u, code) =>
    !u.blanked &&
    u.code === G.shade &&
    !card(code).type_code.startsWith("objective"),
  cannotReady: (s, u) =>
    s.ghostFramsburg!.noReady.some((m) => m.id === u.id && m.round === s.round),
  cannotPlayerReady: (s) => s.ghostFramsburg!.slammedRound === s.round,
  characterBlanked: (s, u) =>
    dark(s) && u.attachments.some((a) => a.code === G.afraid && !a.blanked),
  willpowerOverride: (s, u) =>
    dark(s) && u.attachments.some((a) => a.code === G.afraid && !a.blanked)
      ? 0
      : undefined,
  damageAmount: (s, u, n) =>
    (!u.blanked && u.code === G.bats && dark(s)) ||
    s.ghostFramsburg!.noDamage.some(
      (m) => m.id === u.id && m.round === s.round && m.phase === phaseKey(s),
    )
      ? 0
      : n,
  damageDealt: (s, u, n, c) => {
    if (
      n > 0 &&
      c.combatDamage &&
      c.enemyId &&
      get(s, c.enemyId)?.code === G.spider &&
      !get(s, c.enemyId)?.blanked
    )
      s.ghostFramsburg!.noReady.push({ id: u.id, round: s.round });
  },
  hostLeaves: ghostFramsburgHostLeaves,
  enemyDestination: ghostFramsburgEnemyDestination,
  travelProblem: (s, u) =>
    u.code === G.tomb && lootCount(s) < 3
      ? "The players must control 3 Loot objectives to travel to The Cursed Tomb."
      : null,
  travelEntered: ghostFramsburgTravelEntered,
  cardEntered: ghostFramsburgCardEntered,
  encounter: ghostFramsburgEncounter,
  shadow: ghostFramsburgShadow,
  eventPlayed: (s, u) => {
    const n = s.staging.filter((c) => c.code === G.tower && !c.blanked).length;
    if (n)
      prepend(
        s,
        fx("ghostFramsburgThreat", { player: ownerOf(s, u), value: n }),
      );
  },
  enemyAttackStarted: (s, u, p) => {
    if (u.code === G.stalker && !u.blanked)
      prepend(s, fx("ghostFramsburgThreat", { player: p, value: 1 }));
  },
  shadowResolved: (s, u, code) => {
    if (u.code === G.werewolf && !u.blanked && !card(code).shadow) {
      const c = s.combat;
      prepend(
        s,
        fx("damage", { target: u.id, value: 1 }),
        ...(c?.defenderIds ?? (c?.defenderId ? [c.defenderId] : [])).map(
          (target) => fx("damage", { target, value: 1 }),
        ),
      );
    }
  },
  characterDestroyed: (s, _u, c) => {
    if (
      c.combatDamage &&
      s.combat &&
      (s.combat as GhostCombat).ghostThreatOnKill
    ) {
      prepend(
        s,
        fx("ghostFramsburgThreat", {
          player: s.combat.attackPlayer ?? activeSeat(s),
          value: (s.combat as GhostCombat).ghostThreatOnKill,
        }),
      );
      delete (s.combat as GhostCombat).ghostThreatOnKill;
    }
  },
  abilityLabel: (code) =>
    code === G.lantern
      ? "Exhaust Old Lantern to look for a card"
      : code === G.teeth
        ? "Exhaust Scatha's Teeth and hero to reduce threat"
        : undefined,
  abilityProblem: ghostFramsburgAbilityProblem,
  ability: ghostFramsburgAbility,
  effect: ghostFramsburgEffect,
};
