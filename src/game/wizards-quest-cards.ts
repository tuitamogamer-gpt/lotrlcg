import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import { choose, fx, get, log, make, prepend, shuffle, stats } from "./core";
import {
  discardAttachment,
  discardCharacter,
  enterEnemyEngaged,
  exhaustCharacter,
  raiseThreat,
  removeFromQuest,
} from "./board";
import { dealEnemyShadows } from "./considered-engagement";
import {
  activeSeat,
  firstPlayer,
  forOwner,
  globalEngaged,
  playerOrder,
  seatView,
} from "./table";
import { surgeEffects } from "./surge";
import { WQ, wqCost, wqHasTrait } from "./wizards-quest-support";
import {
  charactersOf,
  enemiesInPlay,
  engagedWith,
  his,
  isEnemy,
  isLocation,
  phaseKey,
  players,
  returnToStaging,
  searchable,
  seatLabel,
  stageNumber,
  takeSearched,
  toStaging,
  verb,
  who,
} from "./fellowship-event-lib";

/** The treacheries the scenario resolves itself. */
export const WQ_TREACHERIES: readonly string[] = [
  WQ.pursued,
  WQ.blood,
  WQ.mosquitoes,
  WQ.shadow,
  WQ.storm,
  WQ.eyes,
  WQ.sevenfold,
  WQ.befouled,
  WQ.restless,
  WQ.reach,
  WQ.nightfall,
  WQ.fastness,
  WQ.fog,
  WQ.weighed,
];
const isTroll = (u: Unit) => isEnemy(u) && wqHasTrait(u.code, "Troll");
const isWargCode = (c: string) =>
  card(c).type_code === "enemy" && wqHasTrait(c, "Warg");
const highestAttack = (s: GameState) => {
  const enemies = s.staging.filter(isEnemy);
  if (!enemies.length) return [];
  const top = Math.max(...enemies.map((u) => stats(s, u).attack));
  return enemies.filter((u) => stats(s, u).attack === top);
};
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

// ---------------------------------------------------------------------------
// Revealed encounter cards.

export function wqEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.wizardsQuest;
  if (!q) return false;
  const first = firstPlayer(s);
  // When Revealed effects of enemies and locations (they are already staged).
  if (fromReveal && !replay) {
    if (code === WQ.pass) {
      prepend(s, fx("wqPass", { player: first }));
      return true;
    }
    if (code === WQ.pine) {
      const key = phaseKey(s);
      q.pine = { key, count: (q.pine?.key === key ? q.pine.count : 0) + 1 };
      log(
        s,
        "Pine Slopes: each Pine Slopes gets +2 threat until the end of the phase.",
        "danger",
      );
      return true;
    }
    if (code === WQ.orcs) {
      prepend(
        s,
        ...eachPlayer(s, "wqDamageOne", { value: 1, text: "Dol Guldur Orcs" }),
      );
      return true;
    }
    if (code === WQ.howling) {
      prepend(s, fx("wqHowling", { player: first }));
      return true;
    }
  }
  if (!WQ_TREACHERIES.includes(code)) return false;
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
    code === WQ.pursued
      ? [fx("wqPursued", { player: first })]
      : code === WQ.blood
        ? [fx("wqBlood", { source: u.id, player: first })]
        : code === WQ.mosquitoes
          ? eachPlayer(s, "wqDamageOne", {
              value: stageNumber(s) + 1,
              text: "Swarming Mosquitoes",
            })
          : code === WQ.shadow
            ? [fx("wqUnderShadow", { source: u.id, player: first })]
            : code === WQ.storm
              ? [
                  ...eachPlayer(s, "wqDamageOne", {
                    value: 1,
                    flag: true,
                    text: "Evil Storm",
                  }),
                  fx("wqStorm", { player: first }),
                ]
              : code === WQ.eyes
                ? eachPlayer(s, "wqEyes")
                : code === WQ.sevenfold
                  ? [fx("wqSevenfold", { ids: [], player: first })]
                  : code === WQ.befouled
                    ? [fx("wqBefouled", { source: u.id, player: first })]
                    : code === WQ.restless
                      ? [fx("wqRestless", { player: first })]
                      : code === WQ.reach
                        ? [fx("wqReach", { player: first })]
                        : code === WQ.nightfall
                          ? [fx("wqNightfall", { source: u.id, player: first })]
                          : code === WQ.fastness
                            ? [
                                fx("wqZeroLocations", {
                                  ids: [],
                                  count: Math.min(2, players(s)),
                                  player: first,
                                }),
                              ]
                            : code === WQ.fog
                              ? [fx("wqFog", { player: first })]
                              : [fx("wqWeighed", { player: first })];
  prepend(s, ...effects, fx("wqTreacheryDone", { source: u.id, player }));
  return true;
}

// ---------------------------------------------------------------------------
// Shadow effects.

export function wqShadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.wizardsQuest;
  if (!c || !q) return false;
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = defendersOf(s);
  const boost = (n: number, text: string) => {
    c.attackBonus += n;
    log(s, `${text}: the attacking enemy gets +${n} attack.`, "danger");
  };
  switch (code) {
    case WQ.pursued:
      if (enemy && card(enemy.code).is_unique) {
        c.extraAttacks = (c.extraAttacks ?? 0) + 1;
        log(
          s,
          `Pursued by Shadow: ${name(enemy)} is unique and makes an additional attack after this one.`,
          "danger",
        );
      } else log(s, "Pursued by Shadow: the attacking enemy is not unique.");
      return true;
    case WQ.flies: {
      const count = seatView(s, p).engaged.length;
      if (count) forOwner(s, p, () => raiseThreat(s, count, "encounter"));
      log(
        s,
        `Forest Flies: ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${count}, 1 for each enemy engaged with ${who(s, p)}.`,
        "danger",
      );
      return true;
    }
    case WQ.mosquitoes:
      boost(
        defenders.some((d) => d.attachments.length) ? 2 : 1,
        "Swarming Mosquitoes",
      );
      return true;
    case WQ.sniper:
      c.wqNoDefense = true;
      log(
        s,
        "Goblin Sniper: the defending character does not count its defense.",
        "danger",
      );
      return true;
    case WQ.warg: {
      const engaged = seatView(s, p).engaged;
      const both =
        engaged.some((u) => wqHasTrait(u.code, "Orc")) &&
        engaged.some((u) => wqHasTrait(u.code, "Warg"));
      if (both)
        prepend(
          s,
          fx("wqDiscardOne", { player: p, text: "Necromancer's Warg" }),
        );
      log(
        s,
        both
          ? `Necromancer's Warg: ${who(s, p)} ${s.table ? "is" : "are"} engaged with an Orc and a Warg enemy and ${verb(s, "discard")} a character.`
          : `Necromancer's Warg: ${who(s, p)} ${s.table ? "is" : "are"} not engaged with both an Orc and a Warg enemy.`,
        both ? "danger" : "normal",
      );
      return true;
    }
    case WQ.storm:
      prepend(
        s,
        ...defenders.map((d) => fx("damage", { target: d.id, value: 1 })),
      );
      log(
        s,
        defenders.length
          ? "Evil Storm: 1 damage to the defending character."
          : "Evil Storm: there is no defending character.",
        "danger",
      );
      return true;
    case WQ.spider:
      c.extraAttacks = (c.extraAttacks ?? 0) + 1;
      log(
        s,
        "Spider of Dol Guldur: the attacking enemy makes an additional attack after this one.",
        "danger",
      );
      return true;
    case WQ.patch:
      c.wqRevealOnKill = true;
      log(
        s,
        "Patch of Midnight: if this attack destroys a character, the top encounter card is revealed.",
        "danger",
      );
      return true;
    case WQ.eyes:
      boost(1, "Eyes in the Dark");
      c.wqThreatOnKill = true;
      return true;
    case WQ.sevenfold:
      prepend(s, fx("wqSevenfoldShadow", { player: p }));
      return true;
    case WQ.restless:
      boost(1, "Restless Hunters");
      c.wqReturnOnKill = true;
      return true;
    case WQ.orcs:
      c.wqDamagedDefense = true;
      log(
        s,
        "Dol Guldur Orcs: the defending character gets -1 defense for each damage on it.",
        "danger",
      );
      return true;
    case WQ.reach:
      boost(
        defenders.some((d) => d.damage > 0) ? 2 : 1,
        "The Necromancer's Reach",
      );
      return true;
    case WQ.ravenous:
      c.wqExhaustOnKill = true;
      log(
        s,
        "Ravenous Spider: if this attack destroys a character, the defending player exhausts a character.",
        "danger",
      );
      return true;
    case WQ.gate:
      boost(seatView(s, p).engaged.length, "Forest Gate");
      return true;
    case WQ.venomous:
      for (const d of defenders) q.noReady.push({ id: d.id, round: s.round });
      log(
        s,
        defenders.length
          ? "Venomous Spider: the defending character cannot ready until the end of the round."
          : "Venomous Spider: there is no defending character.",
        "danger",
      );
      return true;
    case WQ.thicket: {
      const fresh =
        !!enemy &&
        q.engagedRound.some((x) => x.id === enemy.id && x.round === s.round);
      if (fresh && enemy) q.noDamage.push({ id: enemy.id, round: s.round });
      log(
        s,
        fresh
          ? "Pitch-dark Thicket: the attacking enemy was engaged this round and cannot take damage until the end of the round."
          : "Pitch-dark Thicket: the attacking enemy was not engaged this round.",
        fresh ? "danger" : "normal",
      );
      return true;
    }
    case WQ.fastness:
      c.wqActiveOnKill = true;
      log(
        s,
        "Fastness of Mirkwood: if this attack destroys a character, the active location returns to the staging area.",
        "danger",
      );
      return true;
    case WQ.bats: {
      boost(1, "Dark Bats");
      if (enemy) {
        const dealt = dealEnemyShadows(s, enemy, 1);
        log(
          s,
          dealt.length
            ? "Dark Bats: the attacking enemy is dealt an additional shadow card."
            : "Dark Bats: the encounter deck is empty.",
          "danger",
        );
        // The additional card resolves in this attack.
        prepend(s, ...dealt.map((x) => fx("shadowReveal", { code: x })));
      }
      return true;
    }
    case WQ.fog:
      q.fogShadow.push({ player: p, key: phaseKey(s) });
      log(
        s,
        `Treacherous Fog: each enemy engaged with ${who(s, p)} gets +1 attack and +1 defense until the end of the phase.`,
        "danger",
      );
      return true;
    case WQ.howling:
      boost(enemy && wqHasTrait(enemy.code, "Warg") ? 2 : 1, "Howling Warg");
      return true;
    case WQ.weighed: {
      const host = defenders.find((d) => d.attachments.length);
      if (host)
        prepend(
          s,
          fx("wqDiscardAttachment", {
            target: host.id,
            player: p,
            text: "Weighed Down",
          }),
        );
      else log(s, "Weighed Down: the defending character has no attachment.");
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Card effects.

export function wqCardEffect(s: GameState, e: Effect): boolean {
  const q = s.wizardsQuest;
  if (!q || !e.kind.startsWith("wq")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "wqTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    // Each player deals X damage to a character (a questing one, or a hero).
    case "wqDamageOne": {
      const targets = charactersOf(s, p).filter((u) =>
        e.flag ? u.committed : e.code === WQ.sniper ? heroOf(s, p, u) : true,
      );
      if (!targets.length) return true;
      choose(
        s,
        `${e.text} · Deal ${e.value} damage to a ${e.flag ? "questing character" : e.code === WQ.sniper ? "hero" : "character"} you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [fx("damage", { target: u.id, value: e.value, player: p })],
        })),
      );
      return true;
    }
    case "wqExhaustOne": {
      const ready = charactersOf(s, p).filter((u) => !u.exhausted);
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a character you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [fx("wqExhaust", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "wqExhaust": {
      const u = get(s, e.target);
      if (u && !u.exhausted) exhaustCharacter(s, u);
      return true;
    }
    case "wqDiscardOne": {
      const targets = charactersOf(s, p);
      if (!targets.length) return true;
      choose(
        s,
        `${e.text} · Discard a character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("wqDiscardCharacter", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "wqDiscardCharacter": {
      const u = get(s, e.target);
      // discardCharacter logs the discard.
      if (u && charactersOf(s, p).some((x) => x.id === u.id))
        forOwner(s, p, () => discardCharacter(s, u));
      return true;
    }
    case "wqDiscardAttachment": {
      const host = get(s, e.target);
      if (!host || !host.attachments.length) return true;
      choose(
        s,
        `${e.text} · Discard an attachment from ${name(host)}${seatLabel(s, p)}`,
        host.attachments.map((a) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${card(a.code).name}`,
          effects: [
            fx("wqDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "wqDropAttachment": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      // discardAttachment logs the discard.
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    // Pursued by Shadow and Hunter's Lookout: the highest-attack staged enemy attacks.
    case "wqPursued":
    case "wqLookoutTravel": {
      const pursued = e.kind === "wqPursued";
      const source = pursued ? "Pursued by Shadow" : "Hunter's Lookout";
      const highest = highestAttack(s);
      if (!highest.length) {
        log(s, `${source}: there is no enemy in the staging area.`);
        if (pursued) {
          log(s, "Pursued by Shadow gains surge.", "danger");
          prepend(s, ...surgeEffects(WQ.pursued));
        }
        return true;
      }
      if (highest.length === 1) {
        prepend(
          s,
          fx("wqStagedAttack", {
            target: highest[0].id,
            text: source,
            player: first,
          }),
        );
        return true;
      }
      choose(
        s,
        `${source} · Choose the enemy with the highest attack${seatLabel(s, first)}`,
        highest.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} attacks the first player`,
          effects: [
            fx("wqStagedAttack", { target: u.id, text: source, player: first }),
          ],
        })),
      );
      return true;
    }
    case "wqStagedAttack": {
      const u = get(s, e.target);
      if (!u) return true;
      log(
        s,
        `${e.text}: ${name(u)} makes an immediate attack against the first player.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    // Smoking Blood: the opposing team attaches it to a Troll enemy.
    case "wqBlood": {
      const trolls = enemiesInPlay(s).filter(
        (u) => isTroll(u) && !u.attachments.some((a) => a.code === WQ.blood),
      );
      if (!trolls.length) {
        log(
          s,
          "Smoking Blood: there is no Troll enemy to attach it to; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(WQ.blood));
        return true;
      }
      choose(
        s,
        `Smoking Blood · The opposing team attaches it to a Troll enemy${seatLabel(s, first)}`,
        trolls.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Attach Smoking Blood to ${name(u)}`,
          effects: [
            fx("wqAttachHeld", {
              target: u.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(WQ.blood).text,
      );
      return true;
    }
    case "wqAttachHeld": {
      const host = get(s, e.target);
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (!host || i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      host.attachments.push({ id: held.id, code: held.code, exhausted: false });
      log(s, `${card(held.code).name} is attached to ${name(host)}.`, "danger");
      return true;
    }
    // Under the Shadow: attached to the main quest.
    case "wqUnderShadow": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      const list = ((s.questAttachments ??= {})[q.currentQuest] ??= []);
      list.push({ id: held.id, code: held.code, exhausted: false });
      log(
        s,
        "Under the Shadow is attached to the main quest: each player cannot play more than 1 card each phase.",
        "danger",
      );
      return true;
    }
    case "wqStorm":
      q.storm = { key: phaseKey(s) };
      log(
        s,
        "Evil Storm: until the end of the phase, each damaged character gets -1 willpower and cannot be healed.",
        "danger",
      );
      return true;
    // Eyes in the Dark: the opposing team chooses a questing character of each player.
    case "wqEyes": {
      const questing = charactersOf(s, p).filter((u) => u.committed);
      if (!questing.length) return true;
      choose(
        s,
        `Eyes in the Dark · The opposing team chooses a questing character of ${who(s, p)} to ready and remove from the quest${seatLabel(s, first)}`,
        questing.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).will} willpower)`,
          effects: [fx("wqEyesTake", { target: u.id, player: p })],
        })),
        card(WQ.eyes).text,
      );
      return true;
    }
    case "wqEyesTake": {
      const u = get(s, e.target);
      if (!u) return true;
      u.exhausted = false;
      removeFromQuest(s, u);
      forOwner(s, p, () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(
        s,
        `Eyes in the Dark: ${name(u)} is readied and removed from the quest.`,
        "danger",
      );
      return true;
    }
    // Power Sevenfold: any number of non-unique encounter cards in play are discarded.
    case "wqSevenfold": {
      const chosen = new Set(e.ids ?? []);
      const candidates = sevenfoldTargets(s).filter((u) => !chosen.has(u.id));
      const options: Option[] = [
        ...candidates.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Add ${name(u)}`,
          effects: [
            fx("wqSevenfold", { ids: [...chosen, u.id], player: first }),
          ],
        })),
        {
          id: "resolve",
          label: chosen.size
            ? `Discard the ${chosen.size} chosen card${chosen.size === 1 ? "" : "s"} and reveal as many`
            : "Choose no card",
          effects: [
            fx("wqSevenfoldResolve", { ids: [...chosen], player: first }),
          ],
        },
      ];
      if (!candidates.length && !chosen.size) {
        log(
          s,
          "Power Sevenfold: there is no non-unique encounter card in play.",
        );
        return true;
      }
      choose(
        s,
        `Power Sevenfold · The opposing team chooses non-unique encounter cards in play (${chosen.size} chosen)${seatLabel(s, first)}`,
        options,
        card(WQ.sevenfold).text,
      );
      return true;
    }
    case "wqSevenfoldResolve": {
      const ids = e.ids ?? [];
      let count = 0;
      for (const id of ids) {
        const u = sevenfoldTargets(s).find((x) => x.id === id);
        if (!u) continue;
        discardEncounterUnit(s, u);
        count++;
      }
      if (count)
        log(
          s,
          `Power Sevenfold: ${count} encounter card${count === 1 ? " is" : "s are"} discarded; as many are revealed.`,
          "danger",
        );
      prepend(
        s,
        ...Array.from({ length: count }, () => fx("reveal", { player: first })),
      );
      return true;
    }
    case "wqSevenfoldShadow":
      choose(
        s,
        `Power Sevenfold · Shadow: reveal an encounter card, or treat this attack as undefended${seatLabel(s, p)}`,
        [
          {
            id: "reveal",
            label: "Reveal an encounter card",
            effects: [fx("reveal", { player: first })],
          },
          {
            id: "undefended",
            label: "Treat this attack as undefended",
            effects: [fx("wqUndefended", { player: p })],
          },
        ],
        card(WQ.sevenfold).shadow,
      );
      return true;
    case "wqUndefended":
      if (s.combat) {
        s.combat.defenderId = null;
        s.combat.defenderIds = [];
        log(
          s,
          "Power Sevenfold: this attack is treated as undefended.",
          "danger",
        );
      }
      return true;
    // Befouled Equipment: the character with the most attachments.
    case "wqBefouled": {
      const all = playerOrder(s).flatMap((owner) =>
        charactersOf(s, owner)
          .filter((u) => !u.attachments.some((a) => a.code === WQ.befouled))
          .map((u) => ({ u, owner })),
      );
      if (!all.length) return true;
      const most = Math.max(...all.map((x) => x.u.attachments.length));
      const tied = all.filter((x) => x.u.attachments.length === most);
      choose(
        s,
        `Befouled Equipment · Attach it to the character with the most attachments${seatLabel(s, first)}`,
        tied.map(({ u, owner }) => ({
          id: u.id,
          code: u.code,
          label: `Attach to ${name(u)}${s.table ? ` (${who(s, owner)})` : ""} (${u.attachments.length} attachments)`,
          effects: [
            fx("wqAttachHeld", {
              target: u.id,
              source: e.source,
              player: first,
            }),
          ],
        })),
        card(WQ.befouled).text,
      );
      return true;
    }
    case "wqBefouledRound": {
      const host = get(s, e.target);
      if (!host) return true;
      const own = host.attachments.find((a) => a.code === WQ.befouled);
      const others = host.attachments.filter((a) => a.code !== WQ.befouled);
      if (!others.length) {
        if (own) discardAttachment(s, host, own);
        return true;
      }
      if (others.length === 1) {
        prepend(
          s,
          fx("wqDropAttachment", {
            target: host.id,
            source: others[0].id,
            player: p,
          }),
        );
        return true;
      }
      choose(
        s,
        `Befouled Equipment · Discard an attachment from ${name(host)}${seatLabel(s, p)}`,
        others.map((a) => ({
          id: a.id,
          code: a.code,
          label: `Discard ${card(a.code).name}`,
          effects: [
            fx("wqDropAttachment", {
              target: host.id,
              source: a.id,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    // Restless Hunters: each engaged enemy returns to the staging area.
    case "wqRestless": {
      const engaged = [...globalEngaged(s)];
      let returned = 0;
      for (const u of engaged) if (returnToStaging(s, u)) returned++;
      if (returned) {
        log(
          s,
          `Restless Hunters: ${returned} engaged enem${returned === 1 ? "y returns" : "ies return"} to the staging area.`,
          "danger",
        );
        return true;
      }
      log(
        s,
        "Restless Hunters: no enemy was returned; it gains surge.",
        "danger",
      );
      prepend(s, ...surgeEffects(WQ.restless));
      return true;
    }
    case "wqReach": {
      const exhausted = playerOrder(s).flatMap((owner) =>
        charactersOf(s, owner).filter((u) => u.exhausted),
      );
      prepend(
        s,
        ...exhausted.map((u) => fx("damage", { target: u.id, value: 1 })),
      );
      log(
        s,
        `The Necromancer's Reach: 1 damage to each exhausted character (${exhausted.length}).`,
        "danger",
      );
      return true;
    }
    case "wqNightfall": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      q.nightfall.push({ player: first, code: held.code });
      log(
        s,
        `Nightfall is attached to ${s.table ? "the first player's" : "your"} threat dial: 1 additional threat in each refresh phase.`,
        "danger",
      );
      return true;
    }
    // Fastness of Mirkwood: one different 0 cost location per player (limit 2).
    case "wqZeroLocations": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "location" &&
          wqCost(c) === 0 &&
          !taken.has(card(c).name),
      );
      if (!options.length) {
        log(s, "Fastness of Mirkwood: there is no different 0 cost location.");
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Fastness of Mirkwood · The opposing team adds a different 0 cost location to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wqSearchStage", {
              code: c,
              text: "Fastness of Mirkwood",
              player: first,
            }),
            fx("wqZeroLocations", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(WQ.fastness).text,
      );
      return true;
    }
    case "wqFog":
      q.fog = { key: phaseKey(s) };
      log(
        s,
        "Treacherous Fog: each enemy and location in the staging area gets +2 threat until the end of the phase.",
        "danger",
      );
      return true;
    case "wqWeighed": {
      const loaded = playerOrder(s).flatMap((owner) =>
        charactersOf(s, owner).filter(
          (u) => u.attachments.length && !u.exhausted,
        ),
      );
      for (const u of loaded) exhaustCharacter(s, u);
      if (loaded.length) {
        log(
          s,
          `Weighed Down: ${loaded.length} character${loaded.length === 1 ? " is" : "s are"} exhausted.`,
          "danger",
        );
        return true;
      }
      log(
        s,
        "Weighed Down: no character was exhausted; it gains surge.",
        "danger",
      );
      prepend(s, ...surgeEffects(WQ.weighed));
      return true;
    }
    // Howling Warg: the top card, revealed if it is a Warg.
    case "wqHowling": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (wqHasTrait(top, "Warg")) {
        log(
          s,
          `Howling Warg: ${card(top).name} is discarded from the encounter deck; it is a Warg and is revealed.`,
          "danger",
        );
        prepend(s, fx("revealCard", { code: top, player: first }));
        return true;
      }
      s.encounterDiscard.push(top);
      log(
        s,
        `Howling Warg: ${card(top).name} is discarded from the encounter deck.`,
      );
      return true;
    }
    // Necromancer's Pass: the first player chooses a card, the opposing team another.
    case "wqPass": {
      const pass = [...s.staging].reverse().find((u) => u.code === WQ.pass);
      const hand = seatView(s, first).hand;
      if (!pass || hand.length < 2) {
        log(
          s,
          "Necromancer's Pass: the first player has fewer than 2 cards in hand; no card is guarded.",
        );
        return true;
      }
      choose(
        s,
        `Necromancer's Pass · Choose a card in your hand${seatLabel(s, first)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: name(u),
          effects: [
            fx("wqPassGuard", { target: pass.id, source: u.id, player: first }),
          ],
        })),
        card(WQ.pass).text,
      );
      return true;
    }
    case "wqPassGuard": {
      const hand = seatView(s, first).hand.filter((u) => u.id !== e.source);
      if (!hand.length) return true;
      choose(
        s,
        `Necromancer's Pass · The opposing team chooses a different card from the first player's hand to guard${seatLabel(s, first)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Guard ${name(u)}`,
          effects: [
            fx("wqPassTake", { target: e.target, source: u.id, player: first }),
          ],
        })),
        card(WQ.pass).text,
      );
      return true;
    }
    case "wqPassTake": {
      if (!s.staging.some((u) => u.id === e.target)) return true;
      forOwner(s, first, () => {
        const i = s.hand.findIndex((u) => u.id === e.source);
        if (i < 0) return;
        const [taken] = s.hand.splice(i, 1);
        q.passGuards.push({
          locationId: e.target!,
          card: taken,
          player: first,
        });
        log(
          s,
          `Necromancer's Pass guards ${name(taken)}: copies of it cannot be played.`,
          "danger",
        );
      });
      return true;
    }
    // Dol Guldur Beastmaster: a Necromancer's Warg engages the player.
    case "wqBeastmaster": {
      if (!takeSearched(s, WQ.warg)) {
        log(s, "Dol Guldur Beastmaster: there is no Necromancer's Warg.");
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      const u = make(s, WQ.warg);
      log(
        s,
        `Dol Guldur Beastmaster: Necromancer's Warg is put into play engaged with ${who(s, p)}.`,
        "danger",
      );
      enterEnemyEngaged(s, u, p);
      prepend(s, fx("wqShuffle", { player: first }));
      return true;
    }
    // Hunting Warg: an immediate attack after it engages.
    case "wqHunting": {
      const u = get(s, e.target);
      if (!u || engagedWith(s, u) === undefined) return true;
      q.huntingAttack = u.id;
      log(
        s,
        `Hunting Warg makes an immediate attack against ${who(s, p)}.`,
        "danger",
      );
      prepend(
        s,
        fx("immediateAttack", { target: u.id, player: p }),
        fx("wqHuntingDone", { player: p }),
      );
      return true;
    }
    case "wqHuntingDone":
      q.huntingAttack = null;
      return true;
    // Nazgûl of Dol Guldur: it returns to the staging area, or 3 threat.
    case "wqNazgul": {
      const u = get(s, e.target);
      if (!u) return true;
      const engaged = engagedWith(s, u) !== undefined;
      choose(
        s,
        `Nazgûl of Dol Guldur · Return it to the staging area, or raise your threat by 3${seatLabel(s, p)}`,
        [
          ...(engaged
            ? [
                {
                  id: "return",
                  label: "Nazgûl of Dol Guldur returns to the staging area",
                  effects: [fx("wqReturn", { target: u.id, player: p })],
                },
              ]
            : []),
          {
            id: "threat",
            label: "Raise your threat by 3",
            effects: [
              fx("wqThreat", {
                value: 3,
                player: p,
                text: "Nazgûl of Dol Guldur",
              }),
            ],
          },
        ],
        card(WQ.nazgul).text,
      );
      return true;
    }
    case "wqReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
    case "wqThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    // Bane of Amon Lanc: 1 card from hand for each excess point of damage.
    case "wqDiscardHand": {
      const hand = seatView(s, p).hand;
      if (!hand.length || (e.count ?? 0) <= 0) return true;
      choose(
        s,
        `Bane of Amon Lanc · Discard a card from your hand (${e.count} left)${seatLabel(s, p)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [
            fx("wqDiscardHandCard", { target: u.id, player: p }),
            fx("wqDiscardHand", { count: (e.count ?? 1) - 1, player: p }),
          ],
        })),
      );
      return true;
    }
    case "wqDiscardHandCard":
      forOwner(s, p, () => {
        const i = s.hand.findIndex((u) => u.id === e.target);
        if (i < 0) return;
        const [u] = s.hand.splice(i, 1);
        s.discard.push(u.code);
        log(s, `${name(u)} is discarded from ${his(s)} hand.`, "danger");
      });
      return true;
    case "wqReveal":
      prepend(s, fx("reveal", { player: first }));
      return true;
    // Watched Path: explored, the top card; an enemy is added to the staging area.
    case "wqWatched": {
      const top = s.encounterDeck.shift();
      if (!top) return true;
      if (card(top).type_code === "enemy") {
        toStaging(s, top);
        log(
          s,
          `Watched Path: ${card(top).name} is discarded from the encounter deck and added to the staging area.`,
          "danger",
        );
        return true;
      }
      s.encounterDiscard.push(top);
      log(
        s,
        `Watched Path: ${card(top).name} is discarded from the encounter deck.`,
      );
      return true;
    }
    // Dark Bats: after its attack damages a character, reveal and discard it.
    case "wqBats": {
      const u = get(s, e.target);
      prepend(s, fx("reveal", { player: first }));
      if (u) {
        const owner = engagedWith(s, u);
        if (owner !== undefined || s.staging.some((x) => x.id === u.id)) {
          discardEncounterUnit(s, u);
          log(
            s,
            "Dark Bats reveals the top encounter card and is discarded.",
            "danger",
          );
        }
      }
      return true;
    }
    case "wqActiveReturns": {
      const active = s.activeLocation;
      if (!active) return true;
      s.activeLocation = null;
      s.staging.push(active);
      log(
        s,
        `Fastness of Mirkwood: ${name(active)} returns to the staging area.`,
        "danger",
      );
      return true;
    }
    case "wqEachThreat": {
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    }
    // The Wargs' Glade: a non-unique Warg enemy joins the staging area.
    case "wqGlade": {
      const options = searchable(s, (c) => isWargCode(c) && !card(c).is_unique);
      if (!options.length) {
        log(s, "The Wargs' Glade: there is no non-unique Warg enemy.");
        prepend(s, fx("wqShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `The Wargs' Glade · The opposing team adds a non-unique Warg enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wqSearchStage", {
              code: c,
              text: "The Wargs' Glade",
              player: first,
            }),
            fx("wqShuffle", { player: first }),
          ],
        })),
        card(WQ.glade).text,
      );
      return true;
    }
    // Troll Cave's travel: a Hill Troll from the top 5 cards.
    case "wqCaveTravel": {
      const top = s.encounterDeck.slice(0, 5);
      const i = top.indexOf(WQ.troll);
      if (i >= 0) {
        s.encounterDeck.splice(i, 1);
        toStaging(s, WQ.troll);
        log(
          s,
          "Troll Cave: a Hill Troll from the top 5 encounter cards is added to the staging area.",
          "danger",
        );
      } else
        log(
          s,
          "Troll Cave: there is no Hill Troll in the top 5 encounter cards.",
        );
      prepend(s, fx("wqShuffle", { player: first }));
      return true;
    }
    case "wqResponse": {
      const draw =
        e.code === WQ.cave
          ? "each player draws 1 card"
          : "each hero gains 1 resource and each player draws 1 card";
      choose(
        s,
        `${card(e.code ?? "").name} · Response: ${draw}?${seatLabel(s, first)}`,
        [
          {
            id: "use",
            label: `Use ${card(e.code ?? "").name}'s Response`,
            effects: [fx("wqResponseUse", { code: e.code, player: first })],
          },
          {
            id: "skip",
            label: "Continue without using this ability",
            effects: [],
          },
        ],
        card(e.code ?? "").text,
      );
      return true;
    }
    case "wqResponseUse": {
      const resources =
        e.code === WQ.rhosgobel
          ? playerOrder(s).flatMap((owner) =>
              seatView(s, owner).heroes.map((h) =>
                fx("resource", { target: h.id, value: 1, player: owner }),
              ),
            )
          : [];
      prepend(
        s,
        ...resources,
        ...playerOrder(s).map((owner) =>
          fx("draw", { value: 1, player: owner }),
        ),
      );
      log(
        s,
        e.code === WQ.rhosgobel
          ? "Rhosgobel: each hero gains 1 resource and each player draws 1 card."
          : "Troll Cave: each player draws 1 card.",
        "good",
      );
      return true;
    }
    // The Sorcerer's Tower: a treachery's 'when revealed' effects resolve.
    case "wqTowerExplored": {
      s.encounterDeck = shuffle(s, [
        ...s.encounterDeck,
        ...s.encounterDiscard.splice(0),
      ]);
      while (s.encounterDeck.length) {
        const top = s.encounterDeck.shift()!;
        s.encounterDiscard.push(top);
        if (card(top).type_code === "treachery") {
          log(
            s,
            `The Sorcerer's Tower: ${card(top).name} is discarded; its 'when revealed' effects resolve.`,
            "danger",
          );
          prepend(
            s,
            fx("resolvePrintedWhenRevealed", { code: top, player: first }),
          );
          return true;
        }
      }
      log(
        s,
        "The Sorcerer's Tower: there is no treachery in the encounter deck.",
      );
      return true;
    }
    case "wqPatch": {
      const patch = [
        ...s.staging,
        ...(s.activeLocation ? [s.activeLocation] : []),
      ].find((u) => u.id === e.target);
      if (!patch) return true;
      if (s.activeLocation?.id === patch.id) s.activeLocation = null;
      s.staging = s.staging.filter((u) => u.id !== patch.id);
      s.encounterDiscard.push(patch.code);
      log(
        s,
        "Patch of Midnight is discarded at the beginning of the staging step; the top encounter card is revealed.",
        "danger",
      );
      prepend(s, fx("reveal", { player: first }));
      return true;
    }
  }
  return false;
}
const heroOf = (s: GameState, p: number, u: Unit) =>
  seatView(s, p).heroes.some((h) => h.id === u.id);
/** Non-unique encounter cards in play: staged and engaged cards and the active location. */
function sevenfoldTargets(s: GameState) {
  return [
    ...s.staging,
    ...globalEngaged(s),
    ...(s.activeLocation ? [s.activeLocation] : []),
  ].filter(
    (u) =>
      card(u.code).sphere_code === "encounter" &&
      !card(u.code).is_unique &&
      (isEnemy(u) || isLocation(u)),
  );
}
/** Discard an encounter card in play with its attachments and shadow cards. */
export function discardEncounterUnit(s: GameState, u: Unit) {
  const q = s.wizardsQuest;
  if (s.activeLocation?.id === u.id) s.activeLocation = null;
  const owner = engagedWith(s, u);
  if (owner !== undefined) {
    const seat = s.table?.seats[owner];
    if (seat) seat.engaged = seat.engaged.filter((x) => x.id !== u.id);
    s.engaged = s.engaged.filter((x) => x.id !== u.id);
  }
  s.staging = s.staging.filter((x) => x.id !== u.id);
  s.encounterDiscard.push(...u.shadows, u.code);
  u.shadows = [];
  for (const a of u.attachments) {
    if (card(a.code).sphere_code === "encounter")
      s.encounterDiscard.push(a.code);
    else {
      const holder = a.owner ?? a.controller ?? playerOrder(s)[0];
      forOwner(s, holder, () => s.discard.push(a.code));
    }
  }
  u.attachments = [];
  if (q && q.passGuards.some((g) => g.locationId === u.id))
    prepend(s, fx("wqPassCheck"));
}
