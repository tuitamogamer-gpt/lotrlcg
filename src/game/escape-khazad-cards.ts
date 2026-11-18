import type { Attachment, Effect, GameState, Option, Unit } from "./types";
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
  exhaustCharacter,
  raiseThreat,
  removeFromQuest,
} from "./board";
import {
  activeSeat,
  attachmentController,
  defendersFor,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { dealEnemyShadows } from "./considered-engagement";
import { mainQuestCode } from "./quest-state";
import { EK, ekCost, ekHasTrait } from "./escape-khazad-support";
import {
  charactersOf,
  enemiesInPlay,
  his,
  isLocation,
  phaseKey,
  players,
  removeProgress,
  searchable,
  seatLabel,
  stageNumber,
  toStaging,
  verb,
  who,
} from "./fellowship-event-lib";

/** The treacheries the scenario resolves itself. */
export const EK_TREACHERIES: readonly string[] = [
  EK.swarm,
  EK.eyes,
  EK.bones,
  EK.deepDark,
  EK.lost,
  EK.devilry,
  EK.roads,
  EK.fatigue,
  EK.darkPlaces,
  EK.fissure,
  EK.howls,
  EK.vast,
  EK.chance,
  EK.foe,
];
/** The key of an effect that lasts until the end of the round. */
export const roundKey = (s: GameState) => `${s.round}:round`;
/** A lasting effect of this phase or this round. */
export const activeKey = (s: GameState, key: string) =>
  key === phaseKey(s) || key === roundKey(s);
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
const allCharacters = (s: GameState) =>
  playerOrder(s).flatMap((p) => charactersOf(s, p).map((u) => ({ u, p })));
const isCharacter = (u: Unit) =>
  ["hero", "ally", "objective-ally"].includes(card(u.code).type_code);
/** Player attachments a player controls, on any card in play. */
export function controlledAttachments(s: GameState, p: number) {
  const hosts = [
    ...playerOrder(s).flatMap((o) => charactersOf(s, o)),
    ...globalEngaged(s),
    ...s.staging,
    ...(s.activeLocation ? [s.activeLocation] : []),
  ];
  return hosts.flatMap((host) =>
    host.attachments
      .filter(
        (a) =>
          card(a.code).type_code === "attachment" &&
          attachmentController(s, host, a) === p,
      )
      .map((a) => ({ host, a })),
  );
}
/** Discard the top card of a player's deck; returns it. */
function discardTop(s: GameState, p: number) {
  let top: string | undefined;
  forOwner(s, p, () => {
    top = s.deck.shift();
    if (top) s.discard.push(top);
  });
  return top;
}
/** Deal a shadow card to the attacking enemy, resolved in this attack. */
function dealResolved(s: GameState, enemy: Unit, count: number) {
  const dealt = dealEnemyShadows(s, enemy, count);
  prepend(s, ...dealt.map((code) => fx("shadowReveal", { code })));
  return dealt;
}
const printedThreat = (c: string) => Number(card(c).threat) || 0;

// ---------------------------------------------------------------------------
// Revealed encounter cards.

export function ekEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.escapeKhazad;
  if (!q) return false;
  const first = firstPlayer(s);
  // When Revealed effects of enemies and locations (they are already staged).
  if (fromReveal && !replay) {
    if (code === EK.blackBats) {
      prepend(s, fx("ekBlackBats", { player: first }));
      return true;
    }
    if (code === EK.twisting) {
      prepend(s, fx("ekTwisting", { player: first }));
      return true;
    }
    if (code === EK.dungeon) {
      const dungeon = s.staging.filter((u) => u.code === EK.dungeon).at(-1);
      if (dungeon && !dungeon.blanked)
        prepend(s, fx("ekDungeon", { target: dungeon.id, player: first }));
      return true;
    }
  }
  if (!EK_TREACHERIES.includes(code)) return false;
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
    code === EK.swarm
      ? [fx("ekSwarm", { player: first })]
      : code === EK.eyes
        ? [fx("ekEyes", { source: u.id, player: first })]
        : code === EK.bones
          ? [fx("ekBones", { source: u.id, player: first })]
          : code === EK.deepDark
            ? eachPlayer(s, "ekDeepDark")
            : code === EK.lost
              ? playerOrder(s).map((owner) =>
                  fx("ekLost", { target: String(owner), player: first }),
                )
              : code === EK.devilry
                ? [fx("ekDevilry", { player: first })]
                : code === EK.roads
                  ? [
                      fx("ekRoads", {
                        ids: [],
                        count: players(s),
                        player: first,
                      }),
                    ]
                  : code === EK.fatigue
                    ? [
                        fx("ekFatigue", { player: first }),
                        ...eachPlayer(s, "ekExhaustOne", { text: "Fatigue" }),
                      ]
                    : code === EK.darkPlaces
                      ? [fx("ekDarkPlaces", { player: first })]
                      : code === EK.fissure
                        ? eachPlayer(s, "ekFissure")
                        : code === EK.howls
                          ? [fx("ekHowls", { player: first })]
                          : code === EK.vast
                            ? [fx("ekVast", { source: u.id, player: first })]
                            : code === EK.chance
                              ? [fx("ekChance", { player: first })]
                              : [fx("ekFoe", { player: first })];
  prepend(s, ...effects, fx("ekTreacheryDone", { source: u.id, player }));
  return true;
}

// ---------------------------------------------------------------------------
// Shadow effects.

export function ekShadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.escapeKhazad;
  if (!c || !q) return false;
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = defendersOf(s);
  const boost = (n: number, text: string) => {
    c.attackBonus += n;
    log(s, `${text}: the attacking enemy gets +${n} attack.`, "danger");
  };
  switch (code) {
    case EK.blackBats:
      prepend(s, fx("ekBatsShadow", { player: p }));
      return true;
    case EK.swarm: {
      const key = phaseKey(s);
      for (const u of charactersOf(s, p))
        q.penalties.push({ id: u.id, key, will: 0, attack: 1, defense: 1 });
      log(
        s,
        `Swarm of Bats: each character ${who(s, p)} ${s.table ? "controls" : "control"} gets -1 attack and -1 defense until the end of the phase.`,
        "danger",
      );
      return true;
    }
    case EK.caveSpider:
      prepend(
        s,
        fx("ekSpiderChoice", { text: "Cave Spider (shadow)", player: p }),
      );
      return true;
    case EK.deepDark: {
      const n = seatView(s, p).engaged.length;
      if (n)
        prepend(
          s,
          fx("ekThreat", { value: n, text: "Deep Deep Dark", player: p }),
        );
      else log(s, `Deep Deep Dark: no enemy is engaged with ${who(s, p)}.`);
      return true;
    }
    case EK.adder:
      if (!defenders.length) boost(2, "Rock Adder");
      else log(s, "Rock Adder: this attack is defended.");
      return true;
    case EK.chasm:
      if (enemy)
        q.enemyDefense.push({ id: enemy.id, key: phaseKey(s), value: 2 });
      log(
        s,
        "Bottomless Chasm: the attacking enemy gets +2 defense until the end of the phase.",
        "danger",
      );
      return true;
    case EK.lost:
      for (const d of defenders) q.noReady.push({ id: d.id, round: s.round });
      log(
        s,
        defenders.length
          ? "Lost and Alone: the defending character cannot ready until the end of the round."
          : "Lost and Alone: there is no defending character.",
        "danger",
      );
      return true;
    case EK.hobgoblin:
      if (enemy) q.noDamage.push({ id: enemy.id, key: phaseKey(s) });
      log(
        s,
        "Hobgoblin: the attacking enemy cannot take damage this phase.",
        "danger",
      );
      return true;
    case EK.hall:
      c.ekRevealOnKill = true;
      log(
        s,
        "Western Hall: if this attack destroys a character, the top card of the encounter deck is revealed.",
        "danger",
      );
      return true;
    case EK.devilry:
      for (const d of defenders) q.blank.push({ id: d.id, key: phaseKey(s) });
      log(
        s,
        defenders.length
          ? "New Devilry: the defending character's text box is blank, except for Traits, until the end of the phase."
          : "New Devilry: there is no defending character.",
        "danger",
      );
      return true;
    case EK.unspeakable:
      boost(1, "Unspeakable Thing");
      return true;
    case EK.branching:
      boost(1, "Branching Paths");
      return true;
    case EK.roads:
      prepend(s, fx("ekRoadsShadow", { player: firstPlayer(s) }));
      return true;
    case EK.fatigue:
      prepend(s, fx("ekFatigueShadow", { player: p }));
      return true;
    case EK.darkPlaces:
      boost(stageNumber(s), "Dark Places");
      return true;
    case EK.horn:
      if (enemy) {
        const dealt = dealResolved(s, enemy, 2);
        log(
          s,
          dealt.length
            ? `Orc Horn Blower: the attacking enemy is dealt ${dealt.length} additional shadow card${dealt.length === 1 ? "" : "s"}.`
            : "Orc Horn Blower: the encounter deck is empty.",
          "danger",
        );
      }
      return true;
    case EK.fissure:
      prepend(s, fx("ekDamageOne", { text: "Deep Fissure", player: p }));
      return true;
    case EK.uruks:
      prepend(s, fx("ekUruksShadow", { player: firstPlayer(s) }));
      return true;
    case EK.howls:
      boost(enemy && ekHasTrait(enemy.code, "Uruk") ? 2 : 1, "Orcish Howls");
      return true;
    case EK.raiders:
      boost(1, "Orc Raiders");
      if (enemy) {
        const dealt = dealResolved(s, enemy, 1);
        log(
          s,
          dealt.length
            ? "Orc Raiders: the attacking enemy is dealt an additional shadow card."
            : "Orc Raiders: the encounter deck is empty.",
          "danger",
        );
      }
      return true;
    case EK.chance:
      if (enemy && card(enemy.code).is_unique) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          `Chance Encounter: the attacking enemy is unique; it makes an additional attack against ${who(s, p)} after this one.`,
          "danger",
        );
      } else log(s, "Chance Encounter: the attacking enemy is not unique.");
      return true;
    case EK.foe:
      prepend(s, fx("ekFoeShadow", { player: p }));
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Card effects.

export function ekCardEffect(s: GameState, e: Effect): boolean {
  const q = s.escapeKhazad;
  if (!q || !e.kind.startsWith("ek")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "ekTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    case "ekAttachHeld": {
      const host = get(s, e.target);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!host || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      host.attachments.push({
        id: held.id,
        code: held.code,
        exhausted: false,
      } as Attachment);
      log(s, `${card(held.code).name} is attached to ${name(host)}.`, "danger");
      return true;
    }
    case "ekThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "ekEachThreat":
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "ekExhaustOne": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("ekExhaust", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "ekExhaust": {
      const u = get(s, e.target);
      if (u && !u.exhausted) exhaustCharacter(s, u);
      return true;
    }
    // Exhaust X characters in play (the first player chooses each).
    case "ekExhaustAny": {
      const left = e.count ?? 0;
      const ready = allCharacters(s).filter(({ u }) => !u.exhausted);
      if (left <= 0 || !ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character (${left} left)${seatLabel(s, first)}`,
        ready.map(({ u, p: owner }) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("ekExhaust", { target: u.id, player: owner }),
            fx("ekExhaustAny", {
              count: left - 1,
              text: e.text,
              player: first,
            }),
          ],
        })),
      );
      return true;
    }
    case "ekDiscardCharacter": {
      const u = get(s, e.target);
      const owner = playerOrder(s).find((o) =>
        charactersOf(s, o).some((x) => x.id === e.target),
      );
      if (u && owner !== undefined)
        forOwner(s, owner, () => discardCharacter(s, u));
      return true;
    }
    // Assign X damage among characters you control, 1 at a time.
    case "ekAssign": {
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
            fx("ekAssign", { count: left - 1, text: e.text, player: p }),
          ],
        })),
      );
      return true;
    }
    case "ekDamageOne":
      prepend(s, fx("ekAssign", { count: 1, text: e.text, player: p }));
      return true;
    // Searches for an enemy with a trait and cost 1 or less (Nest of Vermin, Frightful Den).
    case "ekTraitSearch": {
      const trait = e.flag ? "Troll" : "Creature";
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          ekHasTrait(c, trait) &&
          ekCost(c) <= 1,
      );
      const shuffleAfter = fx("ekShuffle", { player: first });
      if (!options.length) {
        log(s, `${e.text}: there is no ${trait} enemy with cost 1 or less.`);
        prepend(s, shuffleAfter);
        return true;
      }
      choose(
        s,
        `${e.text} · The opposing team adds a ${trait} enemy with cost 1 or less to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name} (cost ${ekCost(c)})`,
          effects: [
            fx("ekSearchStage", { code: c, text: e.text, player: first }),
            shuffleAfter,
          ],
        })),
      );
      return true;
    }
    // Black Bats: each player's threat +2, or another card is revealed.
    case "ekBlackBats":
      choose(
        s,
        `Black Bats · Raise each player's threat by 2, or reveal an additional encounter card${seatLabel(s, first)}`,
        [
          {
            id: "threat",
            label: "Raise each player's threat by 2",
            effects: [
              fx("ekEachThreat", {
                value: 2,
                text: "Black Bats",
                player: first,
              }),
            ],
          },
          {
            id: "reveal",
            label: "Reveal an additional encounter card",
            effects: [fx("reveal", { player: first })],
          },
        ],
        card(EK.blackBats).text,
      );
      return true;
    case "ekBatsShadow": {
      const options: Option[] = [
        {
          id: "threat",
          label: "Raise your threat by 2",
          effects: [
            fx("ekThreat", { value: 2, text: "Black Bats", player: p }),
          ],
        },
      ];
      // An undefended attack cannot become any more undefended.
      if (defendersOf(s).length)
        options.push({
          id: "undefended",
          label: "This attack is considered undefended",
          effects: [fx("ekUndefended", { text: "Black Bats", player: p })],
        });
      choose(
        s,
        `Black Bats · Raise your threat by 2, or this attack is considered undefended${seatLabel(s, p)}`,
        options,
        card(EK.blackBats).shadow,
      );
      return true;
    }
    case "ekUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(s, `${e.text}: this attack is considered undefended.`, "danger");
      }
      return true;
    // Cave Spider: 2 progress from the main quest, or +2 attack.
    case "ekSpiderChoice": {
      const options: Option[] = [];
      if (s.progress > 0)
        options.push({
          id: "progress",
          label: "Remove 2 progress from the main quest",
          effects: [fx("ekRemoveProgress", { value: 2, text: "Cave Spider" })],
        });
      options.push({
        id: "attack",
        label: "The attacking enemy gets +2 attack for this attack",
        effects: [fx("ekAttackBonus", { value: 2, text: "Cave Spider" })],
      });
      choose(
        s,
        `${e.text} · Remove 2 progress from the main quest, or the attacking enemy gets +2 attack${seatLabel(s, p)}`,
        options,
        e.text?.includes("shadow")
          ? card(EK.caveSpider).shadow
          : card(EK.caveSpider).text,
      );
      return true;
    }
    case "ekRemoveProgress":
      removeProgress(s, e.value ?? 0, e.text ?? "");
      return true;
    case "ekAttackBonus":
      if (s.combat) {
        s.combat.attackBonus += e.value ?? 0;
        log(
          s,
          `${e.text}: the attacking enemy gets +${e.value} attack for this attack.`,
          "danger",
        );
      }
      return true;
    // Unspeakable Thing: the top card of the defending player's deck.
    case "ekUnspeakable": {
      const top = discardTop(s, p);
      const x = top ? Number(card(top).cost) || 0 : 0;
      if (s.combat && x) s.combat.attackBonus += x;
      log(
        s,
        top
          ? `Unspeakable Thing: ${card(top).name} is discarded from the top of ${who(s, p)}${s.table ? "'s" : "r"} deck; it gets +${x} attack for this attack.`
          : `Unspeakable Thing: ${who(s, p)} ${s.table ? "has" : "have"} no card in ${his(s)} deck.`,
        "danger",
      );
      return true;
    }
    // Shadow Dweller: X damage among the characters the defending player controls.
    case "ekDweller": {
      const top = discardTop(s, p);
      const x = top ? Number(card(top).cost) || 0 : 0;
      log(
        s,
        top
          ? `Shadow Dweller: ${card(top).name} is discarded from the top of ${who(s, p)}${s.table ? "'s" : "r"} deck; ${who(s, p)} ${verb(s, "assign")} ${x} damage.`
          : `Shadow Dweller: ${who(s, p)} ${s.table ? "has" : "have"} no card in ${his(s)} deck.`,
        "danger",
      );
      if (x)
        prepend(
          s,
          fx("ekAssign", { count: x, text: "Shadow Dweller", player: p }),
        );
      return true;
    }
    // Twisting Passage: the top card, staged if it is a location.
    case "ekTwisting": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "location") {
        toStaging(s, top);
        log(
          s,
          `Twisting Passage: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
      } else {
        s.encounterDiscard.push(top);
        log(
          s,
          `Twisting Passage: ${card(top).name} is discarded from the encounter deck.`,
        );
      }
      return true;
    }
    // Goblin Dungeon: an ally is guarded under it.
    case "ekDungeon": {
      const allies = playerOrder(s).flatMap((owner) =>
        seatView(s, owner).allies.map((u) => ({ u, owner })),
      );
      if (!allies.length) {
        log(s, "Goblin Dungeon: there is no ally in play.");
        return true;
      }
      choose(
        s,
        `Goblin Dungeon · The opposing team chooses an ally to guard under Goblin Dungeon${seatLabel(s, first)}`,
        allies.map(({ u, owner }) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("ekDungeonTake", {
              target: u.id,
              source: e.target,
              value: owner,
              player: first,
            }),
          ],
        })),
        card(EK.dungeon).text,
      );
      return true;
    }
    case "ekDungeonTake": {
      const owner = e.value ?? 0;
      const ally = seatView(s, owner).allies.find((u) => u.id === e.target);
      if (!ally || !e.source) return true;
      for (const a of [...ally.attachments])
        discardAttachment(s, ally, a, true);
      forOwner(s, owner, () => {
        s.allies = s.allies.filter((u) => u.id !== ally.id);
        s.committedIds = s.committedIds.filter((id) => id !== ally.id);
      });
      Object.assign(ally, {
        damage: 0,
        resources: 0,
        progress: 0,
        exhausted: false,
        committed: false,
        attachments: [],
      });
      q.dungeon.push({ locationId: e.source, player: owner, ally });
      log(
        s,
        `Goblin Dungeon: ${name(ally)} is placed under Goblin Dungeon as a guarded objective.`,
        "danger",
      );
      return true;
    }
    // Nameless Thing: the top card of the first player's deck, attached faceup.
    case "ekNameless": {
      const u = get(s, e.target);
      if (!u || q.nameless.some((x) => x.enemyId === u.id)) return true;
      let top: string | undefined;
      forOwner(s, first, () => (top = s.deck.shift()));
      if (!top) {
        log(
          s,
          `Nameless Thing: ${who(s, first)} ${s.table ? "has" : "have"} no card in ${his(s)} deck.`,
        );
        return true;
      }
      q.nameless.push({ enemyId: u.id, player: first, code: top });
      log(
        s,
        `Nameless Thing: ${card(top).name} (cost ${Number(card(top).cost) || 0}) is attached to it faceup as a guarded attachment; it gets +${Number(card(top).cost) || 0} threat, attack and defense.`,
        "danger",
      );
      return true;
    }
    // Swarm of Bats: each character -1 willpower this phase.
    case "ekSwarm": {
      const key = phaseKey(s);
      for (const { u } of allCharacters(s))
        q.penalties.push({ id: u.id, key, will: 1, attack: 0, defense: 0 });
      log(
        s,
        "Swarm of Bats: each character gets -1 willpower until the end of the phase.",
        "danger",
      );
      return true;
    }
    // Watchful Eyes: on a hero (limit 1 per hero).
    case "ekEyes": {
      const heroes = playerOrder(s).flatMap((owner) =>
        seatView(s, owner)
          .heroes.filter((h) => !h.attachments.some((a) => a.code === EK.eyes))
          .map((h) => ({ h, owner })),
      );
      if (!heroes.length) {
        log(s, "Watchful Eyes: there is no hero to attach it to.");
        return true;
      }
      choose(
        s,
        `Watchful Eyes · The opposing team attaches it to a hero${seatLabel(s, first)}`,
        heroes.map(({ h, owner }) => ({
          id: h.id,
          code: h.code,
          label: `Attach to ${name(h)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("ekAttachHeld", {
              target: h.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(EK.eyes).text,
      );
      return true;
    }
    // Undisturbed Bones: attached to the main quest.
    case "ekBones": {
      const code = mainQuestCode(s);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!code || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      ((s.questAttachments ??= {})[code] ??= []).push({
        id: held.id,
        code: EK.bones,
        exhausted: false,
      });
      log(
        s,
        "Undisturbed Bones is attached to the main quest: when a 'when revealed' effect would be canceled, it is discarded instead.",
        "danger",
      );
      return true;
    }
    // Deep Deep Dark: threat for each character, or a character discarded.
    case "ekDeepDark": {
      const characters = charactersOf(s, p);
      choose(
        s,
        `Deep Deep Dark · Raise your threat by 1 for each character you control, or discard a character you control${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise your threat by ${characters.length}`,
            effects: [
              fx("ekThreat", {
                value: characters.length,
                text: "Deep Deep Dark",
                player: p,
              }),
            ],
          },
          ...characters.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Discard ${name(u)}`,
            effects: [fx("ekDiscardCharacter", { target: u.id, player: p })],
          })),
        ],
        card(EK.deepDark).text,
      );
      return true;
    }
    // Lost and Alone: a questing character of each player leaves the quest.
    case "ekLost": {
      const owner = Number(e.target);
      const questing = charactersOf(s, owner).filter((u) => u.committed);
      if (!questing.length) {
        log(
          s,
          `Lost and Alone: ${who(s, owner)} ${s.table ? "controls" : "control"} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `Lost and Alone · The opposing team removes a questing character controlled by ${who(s, owner)} from the quest${seatLabel(s, first)}`,
        questing.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).will} willpower)`,
          effects: [fx("ekUnquest", { target: u.id, player: owner })],
        })),
        card(EK.lost).text,
      );
      return true;
    }
    case "ekUnquest": {
      const u = get(s, e.target);
      if (!u?.committed) return true;
      forOwner(s, p, () => {
        removeFromQuest(s, u);
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(s, `${name(u)} is removed from the quest.`, "danger");
      return true;
    }
    // Deep Fissure: 1 damage to a questing character, removed from the quest.
    case "ekFissure": {
      const questing = charactersOf(s, p).filter((u) => u.committed);
      if (!questing.length) {
        log(
          s,
          `Deep Fissure: ${who(s, p)} ${s.table ? "controls" : "control"} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `Deep Fissure · Deal 1 damage to a questing character you control and remove it from the quest${seatLabel(s, p)}`,
        questing.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [
            fx("ekUnquest", { target: u.id, player: p }),
            fx("damage", { target: u.id, value: 1, player: p }),
          ],
        })),
        card(EK.fissure).text,
      );
      return true;
    }
    // New Devilry: each character's text box is blank until the end of the round.
    case "ekDevilry": {
      const key = roundKey(s);
      for (const { u } of allCharacters(s)) q.blank.push({ id: u.id, key });
      log(
        s,
        "New Devilry: until the end of the round, each character's text box is blank, except for Traits.",
        "danger",
      );
      return true;
    }
    // Many Roads: one different 0 cost location per player.
    case "ekRoads": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("ekShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "location" &&
          ekCost(c) === 0 &&
          !taken.has(card(c).name),
      );
      if (!options.length) {
        log(s, "Many Roads: there is no different 0 cost location.");
        prepend(s, fx("ekShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Many Roads · The opposing team adds a different 0 cost location to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("ekSearchStage", { code: c, text: "Many Roads", player: first }),
            fx("ekRoads", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(EK.roads).text,
      );
      return true;
    }
    case "ekRoadsShadow": {
      const options = [
        ...new Set(s.encounterDiscard.filter((c) => isLocationCode(c))),
      ];
      if (!options.length) {
        log(
          s,
          "Many Roads: there is no location in the encounter discard pile.",
        );
        return true;
      }
      choose(
        s,
        `Many Roads · The opposing team shuffles a location from the encounter discard pile into the encounter deck${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Shuffle ${card(c).name} into the encounter deck`,
          effects: [
            fx("ekReshuffle", { code: c, text: "Many Roads", player: first }),
          ],
        })),
        card(EK.roads).shadow,
      );
      return true;
    }
    case "ekReshuffle": {
      const i = s.encounterDiscard.lastIndexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDiscard.splice(i, 1);
      s.encounterDeck = shuffle(s, [...s.encounterDeck, c]);
      log(
        s,
        `${e.text}: ${card(c).name} is shuffled from the encounter discard pile into the encounter deck.`,
        "danger",
      );
      return true;
    }
    // Fatigue: characters cannot be readied by player card effects this round.
    case "ekFatigue":
      q.fatigue = s.round;
      log(
        s,
        "Fatigue: each player exhausts a character; until the end of the round, characters cannot be readied by player card effects.",
        "danger",
      );
      return true;
    // Fatigue's shadow: the defender is removed; another may be declared.
    case "ekFatigueShadow": {
      const c = s.combat;
      const enemy = get(s, c?.enemyId);
      const removed = defendersOf(s);
      if (!c || !enemy || !removed.length) {
        log(s, "Fatigue: there is no defending character.");
        return true;
      }
      c.defenderId = null;
      c.defenderIds = [];
      log(
        s,
        `Fatigue: ${removed.map(name).join(", ")} ${removed.length === 1 ? "is" : "are"} removed from this attack.`,
        "danger",
      );
      const options = forOwnerList(s, p, () => defendersFor(s, enemy)).filter(
        (u) =>
          !removed.some((r) => r.id === u.id) &&
          !u.exhausted &&
          charactersOf(s, p).some((x) => x.id === u.id),
      );
      choose(
        s,
        `Fatigue · Declare a different defending character, or leave the attack undefended${seatLabel(s, p)}`,
        [
          ...options.map((u) => ({
            id: u.id,
            code: u.code,
            label: `${name(u)} defends (${stats(s, u).defense} defense)`,
            effects: [fx("ekRedefend", { target: u.id, player: p })],
          })),
          {
            id: "none",
            label: "No defender: the attack is undefended",
            effects: [],
          },
        ],
        card(EK.fatigue).shadow,
      );
      return true;
    }
    case "ekRedefend": {
      const u = get(s, e.target);
      const c = s.combat;
      if (!u || !c || u.exhausted) return true;
      exhaustCharacter(s, u);
      c.defenderId = u.id;
      c.defenderIds = [u.id];
      log(s, `${name(u)} is declared as the defending character.`);
      return true;
    }
    // Dark Places: X threat, the active location's; else surge.
    case "ekDarkPlaces": {
      const active = s.activeLocation;
      if (!active) {
        log(
          s,
          "Dark Places: there is no active location; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(EK.darkPlaces));
        return true;
      }
      const x = threatOf(s, active);
      prepend(
        s,
        fx("ekEachThreat", { value: x, text: "Dark Places", player: first }),
      );
      return true;
    }
    // Orcish Howls: X characters exhausted, X the Uruk enemies in play; else surge.
    case "ekHowls": {
      const x = enemiesInPlay(s).filter((u) =>
        ekHasTrait(u.code, "Uruk"),
      ).length;
      if (!x) {
        log(
          s,
          "Orcish Howls: there is no Uruk enemy in play; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(EK.howls));
        return true;
      }
      prepend(
        s,
        fx("ekExhaustAny", { count: x, text: "Orcish Howls", player: first }),
      );
      return true;
    }
    // Vast and Intricate: on a non-unique staged location; else surge.
    case "ekVast": {
      const locations = s.staging.filter(
        (u) => isLocation(u) && !card(u.code).is_unique,
      );
      if (!locations.length) {
        log(
          s,
          "Vast and Intricate: there is no non-unique location in the staging area; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(EK.vast));
        return true;
      }
      choose(
        s,
        `Vast and Intricate · The opposing team attaches it to a non-unique location in the staging area${seatLabel(s, first)}`,
        locations.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Attach to ${name(u)}`,
          effects: [
            fx("ekAttachHeld", {
              target: u.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(EK.vast).text,
      );
      return true;
    }
    // Chance Encounter: the highest attack staged enemy attacks the first player.
    case "ekChance": {
      const enemies = s.staging.filter(
        (u) => card(u.code).type_code === "enemy",
      );
      if (!enemies.length) {
        log(
          s,
          "Chance Encounter: there is no enemy in the staging area; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(EK.chance));
        return true;
      }
      const top = Math.max(...enemies.map((u) => stats(s, u).attack));
      const highest = enemies.filter((u) => stats(s, u).attack === top);
      choose(
        s,
        `Chance Encounter · The highest attack enemy in the staging area attacks the first player${seatLabel(s, first)}`,
        highest.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${top} attack) attacks ${who(s, first)}`,
          effects: [fx("immediateAttack", { target: u.id, player: first })],
        })),
        card(EK.chance).text,
      );
      return true;
    }
    // A Foe Beyond: an attachment controlled by a player is discarded; else surge.
    case "ekFoe": {
      const options = playerOrder(s).flatMap((owner) =>
        controlledAttachments(s, owner).map((x) => ({ ...x, owner })),
      );
      if (!options.length) {
        log(
          s,
          "A Foe Beyond: no player controls an attachment; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(EK.foe));
        return true;
      }
      choose(
        s,
        `A Foe Beyond · The opposing team discards an attachment controlled by a player${seatLabel(s, first)}`,
        options.map(({ host, a, owner }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} on ${name(host)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("ekDropAttachment", {
              target: host.id,
              source: a.id,
              player: owner,
            }),
          ],
        })),
        card(EK.foe).text,
      );
      return true;
    }
    case "ekFoeShadow": {
      const options = controlledAttachments(s, p);
      if (!options.length) {
        log(
          s,
          `A Foe Beyond: ${who(s, p)} ${s.table ? "controls" : "control"} no attachment.`,
        );
        return true;
      }
      choose(
        s,
        `A Foe Beyond · Discard an attachment you control${seatLabel(s, p)}`,
        options.map(({ host, a }) => ({
          id: a.id,
          code: a.code,
          label: `${card(a.code).name} on ${name(host)}`,
          effects: [
            fx("ekDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
        card(EK.foe).shadow,
      );
      return true;
    }
    case "ekDropAttachment": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    // Black Uruks' shadow: a card from the top 5, dealt as a shadow card.
    case "ekUruksShadow": {
      const enemy = get(s, s.combat?.enemyId);
      const top = [...new Set(s.encounterDeck.slice(0, 5))];
      if (!enemy || !top.length) {
        log(s, "Black Uruks: the encounter deck is empty.");
        return true;
      }
      choose(
        s,
        `Black Uruks · The opposing team deals a card from the top 5 encounter cards to the attacking enemy as a shadow card${seatLabel(s, first)}`,
        top.map((c) => ({
          id: c,
          code: c,
          label: `Deal ${card(c).name}`,
          effects: [fx("ekUruksDeal", { code: c, player: first })],
        })),
        card(EK.uruks).shadow,
      );
      return true;
    }
    case "ekUruksDeal": {
      const enemy = get(s, s.combat?.enemyId);
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (!enemy || i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      enemy.shadows.push(c);
      if (enemy.faceupShadows) enemy.faceupShadows.push(false);
      log(
        s,
        `Black Uruks: ${card(c).name} is dealt to the attacking enemy as a shadow card.`,
        "danger",
      );
      prepend(s, fx("shadowReveal", { code: c }));
      return true;
    }
  }
  return false;
}
const isLocationCode = (c: string) => card(c).type_code === "location";
/** A list computed from a player's point of view. */
function forOwnerList<T>(s: GameState, p: number, f: () => T[]): T[] {
  let out: T[] = [];
  forOwner(s, p, () => (out = f()));
  return out;
}
export { isCharacter, printedThreat };
