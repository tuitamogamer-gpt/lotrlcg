import type { Effect, GameState, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  locationQuest,
  make,
  prepend,
  requireRule,
  shuffle,
} from "./core";
import {
  discardAttachment,
  enemyAddedToStaging,
  questDefeated,
  win,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allEngaged,
  firstPlayer,
  forOwner,
  ownerOf,
  playerOrder,
  seatView,
  selectSeat,
} from "./table";
import {
  WILDS_RHOVANION as W,
  WILDS_OBJECTIVE_LOCATIONS,
} from "./wilds-rhovanion-support";
import {
  wildsMirkwood,
  wildsQuestLive,
  wildsEnemies,
  wildsLocations,
  wildsTrait,
  wildsObjective,
  wildsAdd,
  wildsDiscardUntil,
  wildsGuard,
  wildsGuarded,
  wildsDetachUnit,
} from "./wilds-rhovanion-helpers";
type Recipe = { cards: { code: string; quantity: number; section: string }[] };
const branch = (stage: number, side: string) =>
  stage === 2
    ? side === "C"
      ? W.orcs
      : W.spiders
    : stage === 3
      ? side === "C"
        ? W.trulyLost
        : W.carried
      : side === "C"
        ? W.escape
        : W.fear;
const objectivePresent = (s: GameState) =>
  wildsLocations(s).some(wildsObjective);
const selectedTrait = (s: GameState) =>
  wildsQuestLive(s, W.spiders)
    ? "Spider"
    : wildsQuestLive(s, W.orcs)
      ? "Orc"
      : undefined;
const phaseKey = (s: GameState) =>
  `${s.round}:quest:${s.wildsRhovanion?.currentQuest}`;
function discardStored(s: GameState, locationId?: string) {
  const q = s.wildsRhovanion!;
  for (const batch of q.storedCards.filter(
    (v) => locationId === undefined || v.locationId === locationId,
  ))
    for (const c of batch.cards)
      forOwner(s, c.owner ?? batch.player, () => s.discard.push(c.code));
  q.storedCards = q.storedCards.filter(
    (v) => locationId !== undefined && v.locationId !== locationId,
  );
}
export function wildsMirkwoodSetup(s: GameState, recipe: Recipe) {
  const q = s.wildsRhovanion!;
  q.currentQuest = W.ambushed;
  q.questDeck = [W.spiders, W.orcs, W.carried, W.trulyLost, W.fear, W.escape];
  const spiders = recipe.cards
    .filter((c) => c.section === "sharedStagingArea" && c.code === "01096")
    .reduce((n, c) => n + c.quantity, 0);
  s.encounterDeck.push(
    ...Array<string>(Math.max(0, spiders - playerOrder(s).length)).fill(
      "01096",
    ),
  );
  q.setAside.push(
    make(s, W.haldan),
    make(s, W.searching),
    ...Array.from({ length: playerOrder(s).length }, () => make(s, "01096")),
  );
  q.setAside.push(
    ...recipe.cards
      .filter((c) =>
        ["sharedEncounterDeck2", "sharedEncounterDeck3"].includes(c.section),
      )
      .flatMap((c) =>
        Array.from({ length: c.quantity }, () => make(s, c.code)),
      ),
  );
}
export function wildsMirkwoodCheck(s: GameState) {
  if (!wildsMirkwood(s) || s.status !== "playing") return;
  const q = s.wildsRhovanion!;
  if (q.haldanId) {
    const h = allCharacters(s).find((u) => u.id === q.haldanId);
    if (h && ownerOf(s, h) !== firstPlayer(s)) {
      wildsDetachUnit(s, h);
      h.owner = firstPlayer(s);
      forOwner(s, firstPlayer(s), () => s.allies.push(h));
    }
  }
  // The nemesis victory is dispatched on its actual leave, not merely its absence.
}
export function wildsMirkwoodAdvance(s: GameState) {
  if (!wildsMirkwood(s)) return false;
  const q = s.wildsRhovanion!;
  if (
    !q.initialized ||
    q.advancing ||
    s.stageRevealing ||
    s.phase === "setup" ||
    s.status !== "playing"
  )
    return true;
  if (
    q.currentQuest === W.escape &&
    s.progress >= 16 &&
    !allEngaged(s).length &&
    !questDefeated(s, q.currentQuest)
  ) {
    win(s);
    s.reason = "The companions have escaped from Taur-nu-Fuin.";
  }
  if (
    q.currentQuest === W.fear &&
    s.progress >= 8 &&
    !q.nemesisId &&
    !questDefeated(s, q.currentQuest)
  ) {
    win(s);
    s.reason = "The companions have escaped the Forest of Great Fear.";
  }
  return true;
}
export function wildsMirkwoodProgress(
  s: GameState,
  amount: number,
  quest: Unit,
) {
  if (
    !wildsMirkwood(s) ||
    amount <= 0 ||
    quest.code !== s.wildsRhovanion!.currentQuest ||
    objectivePresent(s) ||
    !s.staging.some((u) => u.code === W.searching && !u.blanked)
  )
    return amount;
  prepend(
    s,
    fx("wildsMirkwoodSearch", { value: amount, player: firstPlayer(s) }),
  );
  return 0;
}
export function wildsMirkwoodEndEncounter(s: GameState): Effect[] {
  return wildsMirkwood(s)
    ? s.staging
        .filter((u) => u.code === W.patrol && !u.blanked)
        .map((u) =>
          fx("wildsMirkwoodPatrol", { target: u.id, player: firstPlayer(s) }),
        )
    : [];
}
export function wildsMirkwoodRoundEnd(s: GameState): Effect[] {
  if (!wildsMirkwood(s)) return [];
  const q = s.wildsRhovanion!;
  if (q.currentQuest === W.escape)
    return playerOrder(s).map((player) =>
      fx("threat", { player, value: seatView(s, player).engaged.length }),
    );
  if (
    q.currentQuest === W.fear &&
    q.nemesisId &&
    wildsEnemies(s).some((u) => u.id === q.nemesisId)
  )
    return [
      fx("wildsMirkwoodNemesisStaging", {
        target: q.nemesisId,
        player: firstPlayer(s),
      }),
      fx("immediateAttack", { target: q.nemesisId, player: firstPlayer(s) }),
    ];
  return [];
}
export function wildsMirkwoodHostLeaves(
  s: GameState,
  u: Unit,
  defeated = true,
) {
  if (!wildsMirkwood(s)) return;
  const q = s.wildsRhovanion!;
  if (q.nemesisId === u.id) {
    delete q.nemesisId;
    if (q.currentQuest === W.fear && defeated) {
      win(s);
      s.reason =
        "The companions have defeated the nemesis of the Forest of Great Fear.";
    }
  }
  if (!defeated) {
    for (const captive of q.guardedHeroes.filter((h) => h.guardId === u.id))
      captive.guardId = "";
  }
  const rescued = q.guardedHeroes.filter((h) => h.guardId === u.id);
  q.guardedHeroes = q.guardedHeroes.filter((h) => h.guardId !== u.id);
  for (const saved of rescued) {
    saved.hero.exhausted = true;
    saved.hero.committed = false;
    forOwner(s, saved.player, () => s.heroes.push(saved.hero));
  }
  if (
    q.storedCards.some((h) => h.locationId === u.id) &&
    u.progress < locationQuest(s, u)
  )
    discardStored(s, u.id);
}
export function wildsMirkwoodExplored(s: GameState, u: Unit) {
  if (!wildsMirkwood(s)) return;
  const q = s.wildsRhovanion!;
  for (const batch of q.storedCards.filter((v) => v.locationId === u.id))
    for (const c of batch.cards)
      forOwner(s, c.owner ?? batch.player, () => s.hand.push(c));
  q.storedCards = q.storedCards.filter((v) => v.locationId !== u.id);
}
export function wildsMirkwoodTravelEntered(
  s: GameState,
  u: Unit,
  actual = true,
) {
  if (
    !wildsMirkwood(s) ||
    !actual ||
    !wildsObjective(u) ||
    u.blanked ||
    s.stage >= 4 ||
    s.wildsRhovanion!.advancing
  )
    return;
  s.wildsRhovanion!.advancing = true;
  prepend(
    s,
    fx("wildsMirkwoodAdvance", {
      text: [W.clearing, W.abandoned].includes(u.code) ? "C" : "A",
      player: firstPlayer(s),
    }),
  );
}
export function wildsMirkwoodRevealSurge(s: GameState, code: string) {
  const trait = selectedTrait(s),
    q = s.wildsRhovanion;
  return (
    wildsMirkwood(s) &&
    !!trait &&
    ["quest", "staging"].includes(s.phase) &&
    card(code).type_code === "enemy" &&
    wildsTrait(code, trait) &&
    q!.firstTraitRevealedPhase !== phaseKey(s)
  );
}
export function wildsMirkwoodCardEntered(
  s: GameState,
  u: Unit,
  fromReveal: boolean,
  _cancelled: boolean,
) {
  if (
    fromReveal &&
    wildsMirkwood(s) &&
    ["quest", "staging"].includes(s.phase) &&
    selectedTrait(s) &&
    card(u.code).type_code === "enemy" &&
    wildsTrait(u, selectedTrait(s)!)
  ) {
    s.wildsRhovanion!.firstTraitRevealedRound = s.round;
    s.wildsRhovanion!.firstTraitRevealedPhase = phaseKey(s);
  }
}
function beginStage(s: GameState) {
  const q = s.wildsRhovanion!,
    player = firstPlayer(s);
  if (q.currentQuest === W.spiders || q.currentQuest === W.orcs) {
    const set =
        q.currentQuest === W.spiders
          ? "Spiders of Mirkwood"
          : "Dol Guldur Orcs",
      cards = q.setAside.filter((u) => card(u.code).encounter_set === set);
    q.setAside = q.setAside.filter((u) => !cards.includes(u));
    s.encounterDeck = shuffle(s, [
      ...s.encounterDeck,
      ...cards.map((u) => u.code),
    ]);
    prepend(s, ...playerOrder(s).map((player) => fx("reveal", { player })));
    return;
  }
  if (q.currentQuest === W.carried) {
    prepend(
      s,
      ...playerOrder(s).map((player) =>
        fx("wildsMirkwoodCaptureHero", { player }),
      ),
      fx("wildsMirkwoodAssignGuards", { player: firstPlayer(s) }),
    );
    return;
  }
  if (q.currentQuest === W.trulyLost) {
    for (const _p of playerOrder(s)) {
      const code = wildsDiscardUntil(
        s,
        (c) =>
          card(c).type_code === "location" &&
          !WILDS_OBJECTIVE_LOCATIONS.includes(c),
      );
      if (code) wildsAdd(s, code);
    }
    prepend(s, fx("wildsMirkwoodHideHand", { player, ids: [], count: 0 }));
    return;
  }
  for (const u of s.staging.filter((u) => u.code === W.searching)) {
    wildsDetachUnit(s, u);
    q.removed.push(u);
  }
  if (q.currentQuest === W.escape) {
    for (const p of playerOrder(s)) {
      const code = wildsDiscardUntil(s, (c) => card(c).type_code === "enemy");
      if (code) wildsAdd(s, code, p);
    }
    return;
  }
  if (q.currentQuest === W.fear) {
    const enemies = q.setAside.filter(
        (u) => card(u.code).type_code === "enemy",
      ),
      health = Math.max(0, ...enemies.map((u) => card(u.code).health ?? 0));
    const candidates = enemies.filter(
      (u) => (card(u.code).health ?? 0) === health,
    );
    if (candidates.length)
      choose(
        s,
        "The Forest of Great Fear · Choose the nemesis",
        candidates.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [fx("wildsMirkwoodNemesis", { target: u.id, player })],
        })),
      );
  }
}
export function wildsMirkwoodEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("wildsMirkwood")) return false;
  const q = s.wildsRhovanion;
  if (!q) return true;
  const player = e.player ?? activeSeat(s),
    u = get(s, e.target);
  if (
    [
      "wildsMirkwoodCaptureHero",
      "wildsMirkwoodHeroGuard",
      "wildsMirkwoodHideHand",
      "wildsMirkwoodStoreHand",
    ].includes(e.kind)
  )
    selectSeat(s, player);
  switch (e.kind) {
    case "wildsMirkwoodSetup": {
      const take = (code: string) => {
        const i = q.setAside.findIndex((u) => u.code === code);
        return i < 0 ? undefined : q.setAside.splice(i, 1)[0];
      };
      const h = take(W.haldan);
      if (h) {
        h.owner = firstPlayer(s);
        q.haldanId = h.id;
        forOwner(s, firstPlayer(s), () => s.allies.push(h));
      }
      const searching = take(W.searching);
      if (searching) s.staging.push(searching);
      for (const _p of playerOrder(s)) {
        const spider = take("01096");
        if (spider) {
          s.staging.push(spider);
          enemyAddedToStaging(s, spider);
        }
      }
      q.initialized = true;
      break;
    }
    case "wildsMirkwoodSearch": {
      s.encounterDiscard.push(...s.encounterDeck.splice(0, e.value ?? 0));
      let i = s.encounterDiscard.length - 1;
      while (
        i >= 0 &&
        !WILDS_OBJECTIVE_LOCATIONS.includes(s.encounterDiscard[i])
      )
        i--;
      if (i >= 0) {
        const objective = wildsAdd(s, s.encounterDiscard.splice(i, 1)[0]);
        wildsGuard(
          s,
          objective,
          [W.path, W.abandoned].includes(objective.code) ? "location" : "enemy",
        );
      }
      break;
    }
    case "wildsMirkwoodPatrol": {
      const available = s.staging.filter(
        (o) => wildsObjective(o) && !wildsGuarded(s, o),
      );
      if (u && s.staging.some((p) => p.id === u.id) && available.length)
        choose(
          s,
          "Mirkwood Patrol · Guard an objective-location",
          available.map((o) => ({
            id: o.id,
            code: o.code,
            label: `Guard ${name(o)}`,
            effects: [
              fx("wildsMirkwoodPatrolGuard", { source: u.id, target: o.id }),
            ],
          })),
        );
      break;
    }
    case "wildsMirkwoodPatrolGuard": {
      const patrol = get(s, e.source);
      if (
        patrol &&
        u &&
        s.staging.some((p) => p.id === patrol.id) &&
        !wildsGuarded(s, u)
      ) {
        if (!patrol.guarding) patrol.guarding = u.id;
        else if (patrol.guarding !== u.id)
          patrol.cobasGuarding = [
            ...new Set([...(patrol.cobasGuarding ?? []), u.id]),
          ];
      }
      break;
    }
    case "wildsMirkwoodAdvance": {
      if (s.stage >= 4) {
        q.advancing = false;
        break;
      }
      if (q.currentQuest === W.trulyLost) discardStored(s);
      if (q.currentQuest === W.carried) {
        const captured = q.guardedHeroes.splice(0);
        for (const g of captured) {
          const guard = get(s, g.guardId);
          if (guard?.guarding === g.hero.id) delete guard.guarding;
          forOwner(s, g.player, () => s.discard.push(g.hero.code));
        }
      }
      q.completedQuests.push(q.currentQuest);
      s.stage++;
      q.currentQuest = branch(s.stage, e.text ?? "A");
      q.questDeck = q.questDeck.filter((c) => c !== q.currentQuest);
      s.progress = 0;
      q.advancing = false;
      s.stageRevealing = true;
      prepend(
        s,
        fx("wildsMirkwoodReveal", { player: firstPlayer(s) }),
        fx("stageRevealed"),
      );
      break;
    }
    case "wildsMirkwoodReveal":
      beginStage(s);
      break;
    case "wildsMirkwoodCaptureHero": {
      const heroes = seatView(s, player).heroes;
      if (heroes.length)
        choose(
          s,
          "Carried Away · Choose a hero",
          heroes.map((h) => ({
            id: h.id,
            code: h.code,
            label: name(h),
            effects: [fx("wildsMirkwoodHeroGuard", { target: h.id, player })],
          })),
        );
      break;
    }
    case "wildsMirkwoodHeroGuard": {
      const hero = seatView(s, player).heroes.find((h) => h.id === e.target);
      if (!hero) break;
      for (const a of [...hero.attachments])
        discardAttachment(s, hero, a, true);
      Object.assign(hero, {
        damage: 0,
        resources: 0,
        progress: 0,
        boost: 0,
        committed: false,
        tempWill: 0,
        tempAttack: 0,
        tempDefense: 0,
        exhausted: false,
      });
      forOwner(s, player, () => {
        s.heroes = s.heroes.filter((h) => h.id !== hero.id);
        s.committedIds = s.committedIds.filter((id) => id !== hero.id);
      });
      q.guardedHeroes.push({ hero, player, guardId: "" });
      break;
    }
    case "wildsMirkwoodAssignGuards": {
      for (const p of playerOrder(s)) {
        const captive = q.guardedHeroes.find(
          (h) => h.player === p && !h.guardId,
        );
        if (!captive) continue;
        const code = wildsDiscardUntil(s, (c) => card(c).type_code === "enemy");
        if (code) {
          const guard = wildsAdd(s, code);
          guard.guarding = captive.hero.id;
          captive.guardId = guard.id;
        }
      }
      break;
    }
    case "wildsMirkwoodHideHand": {
      const order = playerOrder(s),
        index = e.count ?? 0,
        p = order[index];
      if (p === undefined) break;
      const available = s.staging.filter(
        (l) => card(l.code).type_code === "location" && !e.ids?.includes(l.id),
      );
      if (!seatView(s, p).hand.length) {
        prepend(s, { ...e, count: index + 1, player: order[index + 1] ?? p });
        break;
      }
      if (available.length)
        choose(
          s,
          "Truly Lost · Hide your hand under a different location",
          available.map((l) => ({
            id: l.id,
            code: l.code,
            label: name(l),
            effects: [
              fx("wildsMirkwoodStoreHand", {
                target: l.id,
                player: p,
                ids: e.ids ?? [],
                count: index,
              }),
            ],
          })),
        );
      break;
    }
    case "wildsMirkwoodStoreHand": {
      requireRule(
        u && card(u.code).type_code === "location" && !e.ids?.includes(u.id),
        "Choose a different staging location for each player's hand.",
      );
      forOwner(s, player, () =>
        q.storedCards.push({
          locationId: u!.id,
          player,
          cards: s.hand.splice(0),
        }),
      );
      const order = playerOrder(s),
        index = (e.count ?? 0) + 1;
      if (index < order.length)
        prepend(
          s,
          fx("wildsMirkwoodHideHand", {
            ids: [...(e.ids ?? []), u!.id],
            count: index,
            player: order[index],
          }),
        );
      break;
    }
    case "wildsMirkwoodNemesis": {
      const i = q.setAside.findIndex((u) => u.id === e.target);
      if (i >= 0) {
        const enemy = q.setAside.splice(i, 1)[0];
        q.nemesisId = enemy.id;
        s.staging.push(enemy);
        enemyAddedToStaging(s, enemy);
      }
      break;
    }
    case "wildsMirkwoodNemesisStaging":
      if (u) {
        wildsDetachUnit(s, u);
        s.staging.push(u);
        enemyAddedToStaging(s, u);
      }
      break;
  }
  return true;
}
