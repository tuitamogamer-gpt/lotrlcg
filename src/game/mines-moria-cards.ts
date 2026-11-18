import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  make,
  prepend,
  shuffle,
  stats,
  threatOf,
} from "./core";
import {
  discardAttachment,
  discardCharacter,
  enterEnemyEngaged,
  exhaustCharacter,
  raiseThreat,
  removeFromQuest,
} from "./board";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { MM, mmCost, mmHasTrait } from "./mines-moria-support";
import {
  charactersOf,
  enemiesInPlay,
  his,
  phaseKey,
  players,
  removeProgress,
  returnToStaging,
  searchable,
  seatLabel,
  stageNumber,
  toStaging,
  who,
} from "./fellowship-event-lib";

/** The treacheries the scenario resolves itself. */
export const MM_TREACHERIES: readonly string[] = [
  MM.fear,
  MM.cannot,
  MM.grabbed,
  MM.denizen,
  MM.caveIn,
  MM.pitfall,
  MM.foul,
  MM.malice,
  MM.dreadful,
  MM.hidden,
  MM.signs,
  MM.ruin,
  MM.coming,
  MM.massing,
];
const defendersOf = (s: GameState) => {
  const c = s.combat;
  if (!c) return [];
  return (c.defenderIds ?? (c.defenderId ? [c.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u);
};
/** Each player in turn order resolves an effect. */
const eachPlayer = (s: GameState, kind: string, data: Partial<Effect> = {}) =>
  playerOrder(s).map((player) => fx(kind, { ...data, player }));
/** Take a revealed shadow card off its enemy, keeping the shadow bookkeeping aligned. */
function takeShadow(enemy: Unit, code: string) {
  const revealed = enemy.revealedShadowCount ?? enemy.shadows.length;
  let i = -1;
  for (let k = Math.min(revealed, enemy.shadows.length) - 1; k >= 0; k--)
    if (enemy.shadows[k] === code) {
      i = k;
      break;
    }
  if (i < 0) i = enemy.shadows.indexOf(code);
  if (i < 0) return false;
  enemy.shadows.splice(i, 1);
  enemy.faceupShadows?.splice(i, 1);
  if (enemy.revealedShadowCount !== undefined && i < enemy.revealedShadowCount)
    enemy.revealedShadowCount--;
  return true;
}
const randomCard = (s: GameState, p: number) => {
  const hand = seatView(s, p).hand;
  return hand.length ? shuffle(s, [...hand])[0] : undefined;
};
/** Discard a card from a player's hand; returns its printed cost. */
const discardFromHand = (s: GameState, p: number, id: string) => {
  let cost = 0;
  forOwner(s, p, () => {
    const i = s.hand.findIndex((u) => u.id === id);
    if (i < 0) return;
    const [u] = s.hand.splice(i, 1);
    s.discard.push(u.code);
    cost = Number(card(u.code).cost) || 0;
    log(s, `${name(u)} is discarded from ${his(s)} hand.`, "danger");
  });
  return cost;
};
/** Add to the staging area's total threat until the end of the phase. */
export function addStagingThreat(s: GameState, amount: number, source: string) {
  const q = s.minesMoria;
  if (!q || amount <= 0) return;
  q.stagingBonus.push({ key: phaseKey(s), amount, source });
}
const allCharacters = (s: GameState) =>
  playerOrder(s).flatMap((p) => charactersOf(s, p).map((u) => ({ u, p })));

// ---------------------------------------------------------------------------
// Revealed encounter cards.

export function mmEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.minesMoria;
  if (!q) return false;
  const first = firstPlayer(s);
  // When Revealed effects of enemies and locations (they are already staged).
  if (fromReveal && !replay) {
    if (code === MM.dweller) {
      prepend(s, fx("mmDweller", { player: first }));
      return true;
    }
    if (code === MM.armoury) {
      prepend(s, fx("mmArmoury", { player: first }));
      return true;
    }
    if (code === MM.sneak) {
      prepend(s, fx("mmSneak", { player: first }));
      return true;
    }
    if (code === MM.swarming) {
      prepend(s, fx("mmSwarming", { player: first }));
      return true;
    }
    if (code === MM.spinner) {
      prepend(s, fx("mmSpinner", { player: first }));
      return true;
    }
  }
  if (!MM_TREACHERIES.includes(code)) return false;
  const player = activeSeat(s);
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
  const effects: Effect[] =
    code === MM.fear
      ? [fx("mmFear", { source: u.id, player: first })]
      : code === MM.cannot
        ? [fx("mmCannot", { player: first })]
        : code === MM.grabbed
          ? [fx("mmGrabbed", { player: first })]
          : code === MM.denizen
            ? [fx("mmDenizen", { source: u.id, player: first })]
            : code === MM.caveIn
              ? [fx("mmCaveIn", { player: first })]
              : code === MM.pitfall
                ? [fx("mmPitfall", { player: first })]
                : code === MM.foul
                  ? [fx("mmFoul", { player: first })]
                  : code === MM.malice
                    ? [fx("mmMalice", { player: first })]
                    : code === MM.dreadful
                      ? [fx("mmDreadful", { player: first })]
                      : code === MM.hidden
                        ? [fx("mmHidden", { player: first })]
                        : code === MM.signs
                          ? [fx("mmSigns", { player: first })]
                          : code === MM.ruin
                            ? eachPlayer(s, "mmRuin")
                            : code === MM.coming
                              ? [
                                  fx("mmComing", {
                                    ids: [],
                                    count: players(s),
                                    player: first,
                                  }),
                                ]
                              : [fx("mmMassingDeep", { player: first })];
  prepend(s, ...effects, fx("mmTreacheryDone", { source: u.id, player }));
  return true;
}

// ---------------------------------------------------------------------------
// Shadow effects.

export function mmShadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.minesMoria;
  if (!c || !q) return false;
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = defendersOf(s);
  const boost = (n: number, text: string) => {
    c.attackBonus += n;
    log(s, `${text}: the attacking enemy gets +${n} attack.`, "danger");
  };
  switch (code) {
    case MM.savage:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        `Savage Werewolf: the attacking enemy makes an additional attack against ${who(s, p)} after this one.`,
        "danger",
      );
      return true;
    case MM.hall:
      if (defenders.length)
        prepend(
          s,
          fx("mmDefenderAttachment", { target: defenders[0].id, player: p }),
        );
      else log(s, "Many-pillared Hall: there is no defending character.");
      return true;
    case MM.dweller:
      boost(enemy && mmHasTrait(enemy.code, "Spider") ? 2 : 1, "Deep-dweller");
      return true;
    case MM.cannot: {
      const engaged = seatView(s, p).engaged.length;
      if (engaged)
        prepend(
          s,
          fx("mmAssign", {
            count: engaged,
            text: "We Cannot Get Out",
            player: p,
          }),
        );
      return true;
    }
    case MM.broodling:
      boost(1, "Spider Broodling");
      c.mmProgressOnKill = true;
      return true;
    case MM.grabbed:
      for (const d of defenders) q.noReady.push({ id: d.id, round: s.round });
      log(
        s,
        defenders.length
          ? "Grabbed by Spiders: the defending character cannot ready until the end of the round."
          : "Grabbed by Spiders: there is no defending character.",
        "danger",
      );
      return true;
    case MM.bats:
      if (enemy && takeShadow(enemy, MM.bats)) {
        s.encounterDeck = shuffle(s, [...s.encounterDeck, MM.bats]);
        log(s, "Moria Bats is shuffled into the encounter deck.", "danger");
      }
      return true;
    case MM.caveIn:
      c.mmLocationOnKill = true;
      log(
        s,
        "Cave In: if this attack destroys a character, the active location returns to the staging area.",
        "danger",
      );
      return true;
    case MM.hive:
      c.returnToStaging = true;
      log(
        s,
        "Hive Guardian: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
    case MM.mines: {
      const fresh =
        !!enemy &&
        q.engagedRound.some((x) => x.id === enemy.id && x.round === s.round);
      if (enemy && fresh) q.noDamage.push({ id: enemy.id, key: phaseKey(s) });
      log(
        s,
        fresh
          ? "Abandoned Mines: the attacking enemy engaged this round; it cannot take damage this phase."
          : "Abandoned Mines: the attacking enemy did not engage this round.",
        fresh ? "danger" : "normal",
      );
      return true;
    }
    case MM.pitfall:
      prepend(s, fx("mmPitfallShadow", { player: p }));
      return true;
    case MM.spinner:
      c.mmReturnOnKill = true;
      log(
        s,
        "Web-spinner: if this attack destroys a character, the attacking enemy returns to the staging area.",
        "danger",
      );
      return true;
    case MM.cavern:
      if (!removeProgress(s, 2, "Cobwebbed Cavern"))
        log(s, "Cobwebbed Cavern: there is no progress on the main quest.");
      return true;
    case MM.foul:
      for (const d of defenders)
        prepend(s, fx("damage", { target: d.id, value: 1 }));
      log(
        s,
        defenders.length
          ? "Foul Air: 1 damage to the defending character."
          : "Foul Air: there is no defending character.",
        "danger",
      );
      return true;
    case MM.malice:
      prepend(s, fx("mmMaliceShadow", { player: p }));
      return true;
    case MM.dreadful: {
      const random = randomCard(s, p);
      if (random) discardFromHand(s, p, random.id);
      else
        log(
          s,
          `Dark and Dreadful: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
      return true;
    }
    case MM.signs: {
      const others = seatView(s, p).engaged.filter(
        (u) => u.id !== c.enemyId,
      ).length;
      boost(others ? 2 : 1, "Signs of Conflict");
      return true;
    }
    case MM.ruin:
      prepend(s, fx("mmExhaustOne", { text: "Crumbling Ruin", player: p }));
      return true;
    case MM.sneak:
      boost(1, "Goblin Sneak");
      return true;
    case MM.coming:
      prepend(s, fx("mmComingShadow", { player: firstPlayer(s) }));
      return true;
    case MM.swarming:
      if (
        enemy &&
        mmHasTrait(enemy.code, "Goblin") &&
        takeShadow(enemy, MM.swarming)
      ) {
        const u = make(s, MM.swarming);
        log(
          s,
          `Swarming Goblins: the attacking enemy is a Goblin; Swarming Goblins is put into play engaged with ${who(s, p)}.`,
          "danger",
        );
        enterEnemyEngaged(s, u, p);
      } else log(s, "Swarming Goblins: the attacking enemy is not a Goblin.");
      return true;
    case MM.massing:
      q.massing.push({ player: p, key: phaseKey(s) });
      log(
        s,
        `Massing in the Deep: each enemy engaged with ${who(s, p)} gets +1 attack this phase.`,
        "danger",
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Card effects.

export function mmCardEffect(s: GameState, e: Effect): boolean {
  const q = s.minesMoria;
  if (!q || !e.kind.startsWith("mm")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "mmTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    case "mmAttachHeld": {
      const host = get(s, e.target);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!host || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      host.attachments.push({
        id: held.id,
        code: held.code,
        exhausted: false,
      } as Unit["attachments"][number]);
      log(s, `${card(held.code).name} is attached to ${name(host)}.`, "danger");
      return true;
    }
    case "mmEachThreat":
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "mmExhaustOne": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("mmExhaust", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "mmExhaust": {
      const u = get(s, e.target);
      if (u && !u.exhausted) exhaustCharacter(s, u);
      return true;
    }
    case "mmDiscardCharacter": {
      const u = get(s, e.target);
      const owner = playerOrder(s).find((o) =>
        charactersOf(s, o).some((x) => x.id === e.target),
      );
      // discardCharacter logs the discard.
      if (u && owner !== undefined)
        forOwner(s, owner, () => discardCharacter(s, u));
      return true;
    }
    // Assign X damage among characters you control, 1 at a time.
    case "mmAssign": {
      const left = e.count ?? 0;
      const targets = charactersOf(s, p);
      if (left <= 0 || !targets.length) return true;
      choose(
        s,
        `${e.text} · Assign 1 damage (${left} left) to a character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("mmAssign", { count: left - 1, text: e.text, player: p }),
          ],
        })),
      );
      return true;
    }
    // Assign X damage among characters in play (the first player assigns).
    case "mmAssignAny": {
      const left = e.count ?? 0;
      const targets = allCharacters(s);
      if (left <= 0 || !targets.length) return true;
      choose(
        s,
        `${e.text} · Assign 1 damage (${left} left) to a character in play${seatLabel(s, first)}`,
        targets.map(({ u, p: owner }) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${s.table ? ` (${who(s, owner)})` : ""} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: owner }),
            fx("mmAssignAny", { count: left - 1, text: e.text, player: first }),
          ],
        })),
      );
      return true;
    }
    case "mmHandDiscard":
      if (e.target) discardFromHand(s, p, e.target);
      return true;
    case "mmRandomDiscard": {
      const random = randomCard(s, p);
      if (random) discardFromHand(s, p, random.id);
      return true;
    }
    // Deep-dweller: each engaged Spider enemy returns to the staging area.
    case "mmDweller": {
      const spiders = globalEngaged(s).filter((u) =>
        mmHasTrait(u.code, "Spider"),
      );
      for (const u of spiders) returnToStaging(s, u);
      log(
        s,
        spiders.length
          ? `Deep-dweller: ${spiders.map(name).join(", ")} ${spiders.length === 1 ? "returns" : "return"} to the staging area.`
          : "Deep-dweller: no Spider enemy is engaged.",
        spiders.length ? "danger" : "normal",
      );
      return true;
    }
    // Plundered Armoury: the top card, staged if it is an enemy.
    case "mmArmoury": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "enemy") {
        toStaging(s, top);
        log(
          s,
          `Plundered Armoury: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
      } else {
        s.encounterDiscard.push(top);
        log(
          s,
          `Plundered Armoury: ${card(top).name} is discarded from the encounter deck.`,
        );
      }
      return true;
    }
    // Goblin Sneak: a Goblin enemy of cost 1 or less from the top 5.
    case "mmSneak": {
      const top = s.encounterDeck.slice(0, 5);
      const options = [
        ...new Set(
          top.filter(
            (c) =>
              card(c).type_code === "enemy" &&
              mmHasTrait(c, "Goblin") &&
              mmCost(c) <= 1,
          ),
        ),
      ];
      if (!options.length) {
        log(
          s,
          "Goblin Sneak: there is no Goblin enemy of cost 1 or less among the top 5 encounter cards.",
        );
        return true;
      }
      choose(
        s,
        `Goblin Sneak · The opposing team adds a Goblin enemy of cost 1 or less from the top 5 encounter cards to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${mmCost(c)})`,
          effects: [
            fx("mmTopStage", { code: c, text: "Goblin Sneak", player: first }),
          ],
        })),
        card(MM.sneak).text,
      );
      return true;
    }
    case "mmTopStage": {
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      toStaging(s, c);
      log(
        s,
        `${e.text}: ${card(c).name} is added to the staging area.`,
        "danger",
      );
      return true;
    }
    // Swarming Goblins: each copy in the discard pile returns to the staging area.
    case "mmSwarming": {
      let n = 0;
      for (let i = s.encounterDiscard.length - 1; i >= 0; i--)
        if (s.encounterDiscard[i] === MM.swarming) {
          s.encounterDiscard.splice(i, 1);
          toStaging(s, MM.swarming);
          n++;
        }
      log(
        s,
        n
          ? `Swarming Goblins: ${n} ${n === 1 ? "copy returns" : "copies return"} from the encounter discard pile to the staging area.`
          : "Swarming Goblins: no copy is in the encounter discard pile.",
        n ? "danger" : "normal",
      );
      return true;
    }
    // Web-spinner: no more than 4 progress this phase, or surge.
    case "mmSpinner":
      choose(
        s,
        `Web-spinner · No more than 4 progress can be placed on the current quest this phase, or Web-spinner gains surge${seatLabel(s, first)}`,
        [
          {
            id: "cap",
            label: "No more than 4 progress on the current quest this phase",
            effects: [
              fx("mmCap", { value: 4, code: MM.spinner, player: first }),
            ],
          },
          {
            id: "surge",
            label: "Web-spinner gains surge",
            effects: [fx("mmSurge", { code: MM.spinner, player: first })],
          },
        ],
        card(MM.spinner).text,
      );
      return true;
    case "mmCap": {
      const source = card(e.code ?? MM.spinner);
      q.caps.push({
        key: phaseKey(s),
        limit: e.value ?? 0,
        placed: 0,
        source: source.code,
      });
      // The Fate of Balin is named by its B side.
      log(
        s,
        `${source.back_name ?? source.name}: no more than ${e.value} progress can be placed on the current quest this phase.`,
        "danger",
      );
      return true;
    }
    case "mmSurge":
      log(s, `${card(e.code!).name} gains surge.`, "danger");
      prepend(s, ...surgeEffects(e.code!));
      return true;
    // Shadow of Fear: on a hero, whose text box is blank.
    case "mmFear": {
      const heroes = playerOrder(s).flatMap((owner) =>
        seatView(s, owner)
          .heroes.filter((h) => !h.attachments.some((a) => a.code === MM.fear))
          .map((h) => ({ h, owner })),
      );
      if (!heroes.length) {
        log(s, "Shadow of Fear: there is no hero to attach it to.");
        return true;
      }
      choose(
        s,
        `Shadow of Fear · The opposing team attaches it to a hero${seatLabel(s, first)}`,
        heroes.map(({ h, owner }) => ({
          id: h.id,
          code: h.code,
          label: `Attach to ${name(h)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("mmAttachHeld", {
              target: h.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(MM.fear).text,
      );
      return true;
    }
    // We Cannot Get Out: X threat, the most characters controlled by a player.
    case "mmCannot": {
      const x = Math.max(
        0,
        ...playerOrder(s).map((o) => charactersOf(s, o).length),
      );
      addStagingThreat(s, x, MM.cannot);
      log(
        s,
        `We Cannot Get Out: ${x} threat is added to the staging area until the end of the phase.`,
        "danger",
      );
      return true;
    }
    // Grabbed by Spiders: X questing characters leave the quest, X the Spider enemies in play.
    case "mmGrabbed": {
      const x = enemiesInPlay(s).filter((u) =>
        mmHasTrait(u.code, "Spider"),
      ).length;
      if (!x) {
        log(
          s,
          "Grabbed by Spiders: there is no Spider enemy in play; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.grabbed));
        return true;
      }
      prepend(
        s,
        fx("mmUnquest", {
          count: x,
          text: "Grabbed by Spiders",
          player: first,
        }),
      );
      return true;
    }
    case "mmUnquest": {
      const left = e.count ?? 0;
      const questing = allCharacters(s).filter(({ u }) => u.committed);
      if (left <= 0 || !questing.length) return true;
      choose(
        s,
        `${e.text} · Remove a character from the quest (${left} left)${seatLabel(s, first)}`,
        questing.map(({ u, p: owner }) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${s.table ? ` (${who(s, owner)})` : ""} (${stats(s, u).will} willpower)`,
          effects: [
            fx("mmUnquestOne", { target: u.id, player: owner }),
            fx("mmUnquest", { count: left - 1, text: e.text, player: first }),
          ],
        })),
      );
      return true;
    }
    case "mmUnquestOne": {
      const u = get(s, e.target);
      if (!u) return true;
      removeFromQuest(s, u);
      forOwner(s, p, () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(s, `${name(u)} is removed from the quest.`, "danger");
      return true;
    }
    // Denizen of the Deep: on a non-unique enemy, which returns to the staging area.
    case "mmDenizen": {
      const enemies = enemiesInPlay(s).filter(
        (u) =>
          !card(u.code).is_unique &&
          !u.attachments.some((a) => a.code === MM.denizen),
      );
      if (!enemies.length) {
        log(
          s,
          "Denizen of the Deep: there is no non-unique enemy in play; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.denizen));
        return true;
      }
      choose(
        s,
        `Denizen of the Deep · The opposing team attaches it to a non-unique enemy, which returns to the staging area${seatLabel(s, first)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Attach to ${name(u)}`,
          effects: [
            fx("mmAttachHeld", {
              target: u.id,
              source: e.source,
              player: first,
            }),
            fx("mmReturn", { target: u.id, player: first }),
          ],
        })),
        card(MM.denizen).text,
      );
      return true;
    }
    case "mmReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
    // Cave In: the active location returns; X damage per player, X its threat.
    case "mmCaveIn": {
      const loc = s.activeLocation;
      if (!loc) {
        log(
          s,
          "Cave In: there is no active location; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.caveIn));
        return true;
      }
      s.activeLocation = null;
      s.staging.push(loc);
      const x = Math.max(0, threatOf(s, loc));
      log(
        s,
        `Cave In: ${name(loc)} returns to the staging area; each player assigns ${x} damage among characters he controls.`,
        "danger",
      );
      if (x)
        prepend(s, ...eachPlayer(s, "mmAssign", { count: x, text: "Cave In" }));
      return true;
    }
    case "mmReturnLocation": {
      const loc = s.activeLocation;
      if (!loc) return true;
      s.activeLocation = null;
      s.staging.push(loc);
      log(s, `${e.text}: ${name(loc)} returns to the staging area.`, "danger");
      return true;
    }
    // Sudden Pitfall: the opposing team discards an ally.
    case "mmPitfall": {
      const allies = playerOrder(s).flatMap((owner) =>
        seatView(s, owner)
          .allies.filter((u) => card(u.code).type_code === "ally")
          .map((u) => ({ u, owner })),
      );
      if (!allies.length) {
        log(
          s,
          "Sudden Pitfall: there is no ally to discard; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.pitfall));
        return true;
      }
      choose(
        s,
        `Sudden Pitfall · The opposing team chooses and discards an ally${seatLabel(s, first)}`,
        allies.map(({ u, owner }) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [fx("mmDiscardCharacter", { target: u.id, player: owner })],
        })),
        card(MM.pitfall).text,
      );
      return true;
    }
    case "mmPitfallShadow": {
      const c = s.combat;
      const allies = seatView(s, p).allies.filter(
        (u) => card(u.code).type_code === "ally",
      );
      choose(
        s,
        `Sudden Pitfall · Shadow: discard an ally you control, or the attacking enemy cannot take damage this phase${seatLabel(s, p)}`,
        [
          ...allies.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Discard ${name(u)}`,
            effects: [fx("mmDiscardCharacter", { target: u.id, player: p })],
          })),
          {
            id: "protect",
            label: "The attacking enemy cannot take damage this phase",
            effects: [
              fx("mmProtect", {
                target: c?.enemyId,
                text: "Sudden Pitfall",
                player: p,
              }),
            ],
          },
        ],
        card(MM.pitfall).shadow,
      );
      return true;
    }
    case "mmProtect":
      if (e.target) q.noDamage.push({ id: e.target, key: phaseKey(s) });
      log(
        s,
        `${e.text}: the attacking enemy cannot take damage this phase.`,
        "danger",
      );
      return true;
    // Foul Air: damage to each questing character, or threat and no quest resolution.
    case "mmFoul": {
      const questing = allCharacters(s).filter(({ u }) => u.committed).length;
      choose(
        s,
        `Foul Air · Deal 1 damage to each character committed to the quest, or raise each player's threat by 1 and end the quest phase without resolving the quest${seatLabel(s, first)}`,
        [
          {
            id: "damage",
            label: `Deal 1 damage to each questing character (${questing})`,
            effects: [fx("mmFoulDamage", { player: first })],
          },
          {
            id: "end",
            label: "Raise each player's threat by 1 and end the quest phase",
            effects: [fx("mmFoulEnd", { player: first })],
          },
        ],
        card(MM.foul).text,
      );
      return true;
    }
    case "mmFoulDamage": {
      const questing = allCharacters(s).filter(({ u }) => u.committed);
      log(
        s,
        "Foul Air: 1 damage to each character committed to the quest.",
        "danger",
      );
      prepend(
        s,
        ...questing.map(({ u, p: owner }) =>
          fx("damage", { target: u.id, value: 1, player: owner }),
        ),
      );
      return true;
    }
    case "mmFoulEnd":
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => raiseThreat(s, 1, "encounter"));
      q.questEnded = s.round;
      // The rest of the staging step does not happen.
      s.queue = s.queue.filter((x) => x.kind !== "reveal");
      log(
        s,
        "Foul Air: each player raises his threat by 1 and the quest phase ends without resolving the quest.",
        "danger",
      );
      return true;
    // Lurking Malice: every hero resource is discarded, +1 staged threat each.
    case "mmMalice": {
      let total = 0;
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => {
          for (const h of s.heroes) {
            total += h.resources;
            h.resources = 0;
          }
        });
      if (!total) {
        log(
          s,
          "Lurking Malice: no resource was discarded; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.malice));
        return true;
      }
      addStagingThreat(s, total, MM.malice);
      log(
        s,
        `Lurking Malice: ${total} resource${total === 1 ? " is" : "s are"} discarded; the staging area gets +${total} threat.`,
        "danger",
      );
      return true;
    }
    case "mmMaliceShadow": {
      const heroes = seatView(s, p).heroes.filter((h) => h.resources > 0);
      if (!heroes.length) {
        log(
          s,
          `Lurking Malice: ${who(s, p)} ${s.table ? "has" : "have"} no resource to discard.`,
        );
        return true;
      }
      choose(
        s,
        `Lurking Malice · Shadow: discard a resource from the resource pool of a hero you control${seatLabel(s, p)}`,
        heroes.map((h) => ({
          id: h.id,
          code: h.code,
          label: `${name(h)} (${h.resources} resource${h.resources === 1 ? "" : "s"})`,
          effects: [fx("mmMaliceTake", { target: h.id, player: p })],
        })),
      );
      return true;
    }
    case "mmMaliceTake": {
      const h = get(s, e.target);
      if (!h || h.resources <= 0) return true;
      h.resources -= 1;
      log(
        s,
        `Lurking Malice: a resource is discarded from ${name(h)}'s pool.`,
        "danger",
      );
      return true;
    }
    // Dark and Dreadful: a random card from each hand; their costs as threat.
    case "mmDreadful": {
      let total = 0;
      for (const owner of playerOrder(s)) {
        const random = randomCard(s, owner);
        if (random) total += discardFromHand(s, owner, random.id);
      }
      addStagingThreat(s, total, MM.dreadful);
      log(
        s,
        `Dark and Dreadful: the discarded cards cost ${total}; the staging area gets +${total} threat until the end of the phase.`,
        "danger",
      );
      return true;
    }
    // Hidden Threat: a card from the top 5 facedown under the main quest.
    case "mmHidden": {
      const max = stageNumber(s);
      const top = s.encounterDeck.slice(0, 5);
      const options = [...new Set(top.filter((c) => mmCost(c) <= max))];
      if (!options.length) {
        log(
          s,
          `Hidden Threat: no card with cost ${max} or less among the top 5 encounter cards.`,
        );
        return true;
      }
      choose(
        s,
        `Hidden Threat · The opposing team places a card with cost ${max} or less from the top 5 encounter cards facedown under the main quest${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Place ${card(c).name} (cost ${mmCost(c)})`,
          effects: [fx("mmHiddenTake", { code: c, player: first })],
        })),
        card(MM.hidden).text,
      );
      return true;
    }
    case "mmHiddenTake": {
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      q.hidden.push(c);
      log(
        s,
        "Hidden Threat: a card is placed facedown under the main quest; it is revealed after the next time the players quest successfully.",
        "danger",
      );
      return true;
    }
    // Signs of Conflict: +1 threat to staged enemies and locations this phase.
    case "mmSigns": {
      const key = phaseKey(s);
      q.signs = { key, count: (q.signs?.key === key ? q.signs.count : 0) + 1 };
      log(
        s,
        "Signs of Conflict: each enemy and location in the staging area gets +1 threat until the end of the phase.",
        "danger",
      );
      return true;
    }
    // Crumbling Ruin: 1 damage per character controlled, among them.
    case "mmRuin": {
      const n = charactersOf(s, p).length;
      if (n)
        prepend(
          s,
          fx("mmAssign", { count: n, text: "Crumbling Ruin", player: p }),
        );
      return true;
    }
    // They Are Coming!: one different 0 cost enemy per player.
    case "mmComing": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("mmShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          mmCost(c) === 0 &&
          !taken.has(card(c).name),
      );
      if (!options.length) {
        log(s, "They Are Coming!: there is no different 0 cost enemy.");
        prepend(s, fx("mmShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `They Are Coming! · The opposing team adds a different 0 cost enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("mmSearchStage", {
              code: c,
              text: "They Are Coming!",
              player: first,
            }),
            fx("mmComing", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(MM.coming).text,
      );
      return true;
    }
    case "mmComingShadow": {
      const options = [
        ...new Set(
          s.encounterDiscard.filter((c) => card(c).type_code === "enemy"),
        ),
      ].sort((a, b) => card(a).name.localeCompare(card(b).name));
      if (!options.length) {
        log(
          s,
          "They Are Coming!: there is no enemy in the encounter discard pile.",
        );
        return true;
      }
      choose(
        s,
        `They Are Coming! · Shadow: the opposing team shuffles an enemy from the encounter discard pile into the encounter deck${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Shuffle ${card(c).name} into the encounter deck`,
          effects: [
            fx("mmDiscardToDeck", {
              code: c,
              text: "They Are Coming!",
              player: first,
            }),
          ],
        })),
        card(MM.coming).shadow,
      );
      return true;
    }
    case "mmDiscardToDeck": {
      const i = s.encounterDiscard.lastIndexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDiscard.splice(i, 1);
      s.encounterDeck = shuffle(s, [...s.encounterDeck, c]);
      log(
        s,
        `${e.text}: ${card(c).name} is shuffled into the encounter deck.`,
        "danger",
      );
      return true;
    }
    // Massing in the Deep: each engaged enemy attacks.
    case "mmMassingDeep": {
      const attacks = playerOrder(s).flatMap((owner) =>
        seatView(s, owner).engaged.map((u) =>
          fx("immediateAttack", { target: u.id, player: owner }),
        ),
      );
      if (!attacks.length) {
        log(
          s,
          "Massing in the Deep: no enemy is engaged; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(MM.massing));
        return true;
      }
      log(
        s,
        "Massing in the Deep: each engaged enemy makes an attack.",
        "danger",
      );
      prepend(s, ...attacks);
      return true;
    }
    // Many-pillared Hall's shadow: an attachment of the defending character.
    case "mmDefenderAttachment": {
      const host = get(s, e.target);
      if (!host?.attachments.length) {
        log(
          s,
          "Many-pillared Hall: the defending character has no attachment.",
        );
        return true;
      }
      choose(
        s,
        `Many-pillared Hall · Shadow: discard an attachment from ${name(host)}${seatLabel(s, p)}`,
        host.attachments.map((a) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${card(a.code).name}`,
          effects: [
            fx("mmDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })) as Option[],
        card(MM.hall).shadow,
      );
      return true;
    }
    case "mmDropAttachment": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      // discardAttachment logs the discard.
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
  }
  return false;
}
