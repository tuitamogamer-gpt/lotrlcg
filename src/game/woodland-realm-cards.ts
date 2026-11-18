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
import { WR, wrCost, wrHasTrait } from "./woodland-realm-support";
import {
  charactersOf,
  enemiesInPlay,
  engagedWith,
  his,
  isEnemy,
  phaseKey,
  players,
  returnToStaging,
  searchable,
  seatLabel,
  stageNumber,
  toStaging,
  verb,
  who,
} from "./fellowship-event-lib";

/** The treacheries the scenario resolves itself. */
export const WR_TREACHERIES: readonly string[] = [
  WR.despair,
  WR.gloom,
  WR.exhaustion,
  WR.web,
  WR.driven,
  WR.rain,
  WR.eyes,
  WR.hatred,
  WR.vastness,
  WR.massing,
  WR.turned,
  WR.witless,
  WR.frightened,
  WR.wasted,
];
const heroOf = (s: GameState, p: number, u: Unit) =>
  seatView(s, p).heroes.some((h) => h.id === u.id);
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
const discardFromHand = (s: GameState, p: number, id: string) =>
  forOwner(s, p, () => {
    const i = s.hand.findIndex((u) => u.id === id);
    if (i < 0) return;
    const [u] = s.hand.splice(i, 1);
    s.discard.push(u.code);
    log(s, `${name(u)} is discarded from ${his(s)} hand.`, "danger");
  });

// ---------------------------------------------------------------------------
// Revealed encounter cards.

export function wrEncounter(
  s: GameState,
  code: string,
  replay = false,
  fromReveal = true,
) {
  const q = s.woodlandRealm;
  if (!q) return false;
  const first = firstPlayer(s);
  // When Revealed effects of enemies and locations (they are already staged).
  if (fromReveal && !replay) {
    if (code === WR.bats) {
      prepend(s, fx("wrBats", { player: first }));
      return true;
    }
    if (code === WR.giant) {
      prepend(s, ...eachPlayer(s, "wrExhaustOne", { text: "Giant Spider" }));
      return true;
    }
    if (code === WR.giantWeb) {
      prepend(s, fx("wrGiantWeb", { player: first }));
      return true;
    }
    if (code === WR.labyrinth) {
      const key = phaseKey(s);
      q.labyrinth = {
        key,
        count: (q.labyrinth?.key === key ? q.labyrinth.count : 0) + 1,
      };
      log(
        s,
        "Labyrinthine Woods: each location in the staging area gets +1 threat until the end of the phase.",
        "danger",
      );
      return true;
    }
    if (code === WR.orcs) {
      const u = [...s.staging].reverse().find((x) => x.code === WR.orcs);
      if (u) prepend(s, fx("wrStagedAttack", { target: u.id, player: first }));
      return true;
    }
  }
  if (!WR_TREACHERIES.includes(code)) return false;
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
    code === WR.despair
      ? [fx("wrDespair", { player: first })]
      : code === WR.gloom
        ? [
            fx("wrEachThreat", {
              value: stageNumber(s) + 1,
              text: "Gathering Gloom",
              player: first,
            }),
          ]
        : code === WR.exhaustion
          ? [
              ...eachPlayer(s, "wrExhaustOne", { text: "Exhaustion" }),
              fx("wrExhaustion", { player: first }),
            ]
          : code === WR.web
            ? [fx("wrWeb", { source: u.id, player: first })]
            : code === WR.driven
              ? [fx("wrDriven", { source: u.id, player: first })]
              : code === WR.rain
                ? eachPlayer(s, "wrRain")
                : code === WR.eyes
                  ? eachPlayer(s, "wrEyes")
                  : code === WR.hatred
                    ? [fx("wrHatred", { player: first })]
                    : code === WR.vastness
                      ? [fx("wrVastness", { player: first })]
                      : code === WR.massing
                        ? [
                            fx("wrMassing", {
                              ids: [],
                              count: Math.min(2, players(s)),
                              player: first,
                            }),
                          ]
                        : code === WR.turned
                          ? [fx("wrTurned", { source: u.id, player: first })]
                          : code === WR.witless
                            ? eachPlayer(s, "wrWitless")
                            : code === WR.frightened
                              ? eachPlayer(s, "wrFrightened")
                              : [fx("wrWasted", { player: first })];
  prepend(s, ...effects, fx("wrTreacheryDone", { source: u.id, player }));
  return true;
}

// ---------------------------------------------------------------------------
// Shadow effects.

export function wrShadow(s: GameState, code: string) {
  const c = s.combat;
  const q = s.woodlandRealm;
  if (!c || !q) return false;
  const enemy = get(s, c.enemyId);
  const p = c.attackPlayer ?? activeSeat(s);
  const defenders = defendersOf(s);
  const boost = (n: number, text: string) => {
    c.attackBonus += n;
    log(s, `${text}: the attacking enemy gets +${n} attack.`, "danger");
  };
  switch (code) {
    case WR.despair:
      for (const d of defenders)
        q.blankShadow.push({ id: d.id, key: phaseKey(s) });
      log(
        s,
        defenders.length
          ? "Despair: the defending character's text box is blank until the end of the phase."
          : "Despair: there is no defending character.",
        "danger",
      );
      return true;
    case WR.gloom: {
      const threat = seatView(s, p).threat;
      boost(threat >= 35 ? 2 : 1, "Gathering Gloom");
      return true;
    }
    case WR.bats:
      if (enemy && takeShadow(enemy, WR.bats)) {
        s.encounterDeck = shuffle(s, [...s.encounterDeck, WR.bats]);
        log(
          s,
          "Black Forest Bats is shuffled into the encounter deck.",
          "danger",
        );
      }
      return true;
    case WR.exhaustion:
      for (const d of defenders) q.noReady.push({ id: d.id, round: s.round });
      log(
        s,
        defenders.length
          ? "Exhaustion: the defending character cannot ready until the end of the round."
          : "Exhaustion: there is no defending character.",
        "danger",
      );
      return true;
    case WR.spiders:
      boost(
        enemy && wrHasTrait(enemy.code, "Spider") ? 2 : 1,
        "Spiders of Mirkwood",
      );
      return true;
    case WR.wolf:
      if (
        enemy &&
        wrHasTrait(enemy.code, "Orc") &&
        takeShadow(enemy, WR.wolf)
      ) {
        const u = make(s, WR.wolf);
        log(
          s,
          `Wolf Rider: the attacking enemy is an Orc; Wolf Rider is put into play engaged with ${who(s, p)}.`,
          "danger",
        );
        enterEnemyEngaged(s, u, p);
      } else log(s, "Wolf Rider: the attacking enemy is not an Orc.");
      return true;
    case WR.rain: {
      const random = randomCard(s, p);
      if (random) discardFromHand(s, p, random.id);
      else
        log(
          s,
          `Wind-whipped Rain: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
      return true;
    }
    case WR.giant:
      prepend(s, fx("wrExhaustOne", { text: "Giant Spider", player: p }));
      return true;
    case WR.eyes:
      boost(stageNumber(s), "Eyes of the Forest");
      return true;
    case WR.patrol: {
      const fresh =
        !!enemy &&
        q.engagedRound.some((x) => x.id === enemy.id && x.round === s.round);
      boost(fresh ? 2 : 1, "Mirkwood Patrol");
      return true;
    }
    case WR.mountains:
      prepend(s, fx("wrMountainsShadow", { player: p }));
      return true;
    case WR.hatred: {
      boost(1, "Hatred Rekindled");
      if (enemy) {
        const dealt = dealEnemyShadows(s, enemy, 1);
        q.uncancelable.push(...dealt);
        log(
          s,
          dealt.length
            ? "Hatred Rekindled: the attacking enemy is dealt an additional shadow card, whose shadow effects cannot be canceled."
            : "Hatred Rekindled: the encounter deck is empty.",
          "danger",
        );
        // The additional card resolves in this attack.
        prepend(s, ...dealt.map((x) => fx("shadowReveal", { code: x })));
      }
      return true;
    }
    case WR.bear:
      if (enemy) {
        q.defenseBoosts.push({
          id: enemy.id,
          key: phaseKey(s),
          value: stageNumber(s),
        });
        log(
          s,
          `Wild Bear: the attacking enemy gets +${stageNumber(s)} defense until the end of the phase.`,
          "danger",
        );
      }
      return true;
    case WR.labyrinth:
      q.labyrinthShadow.push({ player: p, key: phaseKey(s) });
      log(
        s,
        `Labyrinthine Woods: each enemy engaged with ${who(s, p)} gets +1 attack until the end of the phase.`,
        "danger",
      );
      return true;
    case WR.vastness:
      c.wrRevealOnKill = true;
      log(
        s,
        "Vastness of Mirkwood: if this attack destroys a character, the top encounter card is revealed.",
        "danger",
      );
      return true;
    case WR.flock:
      if (enemy && takeShadow(enemy, WR.flock)) {
        toStaging(s, WR.flock);
        log(s, "Mirkwood Flock is added to the staging area.", "danger");
      }
      return true;
    case WR.massing:
      c.wrExtraOnKill = true;
      log(
        s,
        "Massing at Night: if this attack destroys a character, the attacking enemy makes an additional attack.",
        "danger",
      );
      return true;
    case WR.wargs:
      c.returnToStaging = true;
      log(
        s,
        "Wild Wargs: the attacking enemy returns to the staging area after this attack.",
        "danger",
      );
      return true;
    case WR.witless:
      if (!defenders.length)
        prepend(
          s,
          fx("wrDiscardAlly", { text: "Lost and Witless", player: p }),
        );
      log(
        s,
        defenders.length
          ? "Lost and Witless: the attack is defended."
          : `Lost and Witless: the attack is undefended; ${who(s, p)} ${verb(s, "discard")} an ally.`,
        defenders.length ? "normal" : "danger",
      );
      return true;
    case WR.wicked:
      if (enemy) q.noDamage.push({ id: enemy.id, key: phaseKey(s) });
      log(
        s,
        "Wicked Spider: the attacking enemy cannot take damage this phase.",
        "danger",
      );
      return true;
    case WR.frightened:
      boost(1, "A Frightened Beast");
      c.wrThreatOnKill = true;
      return true;
    case WR.orcs:
      prepend(s, fx("wrOrcsEngage", { player: p }));
      return true;
    case WR.wasted:
      prepend(
        s,
        fx("wrDropOwnAttachment", { text: "Wasted Provisions", player: p }),
      );
      return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Card effects.

export function wrCardEffect(s: GameState, e: Effect): boolean {
  const q = s.woodlandRealm;
  if (!q || !e.kind.startsWith("wr")) return false;
  const p = e.player ?? activeSeat(s);
  const first = firstPlayer(s);
  switch (e.kind) {
    case "wrTreacheryDone": {
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i < 0) return true;
      const [held] = q.resolving.splice(i, 1);
      s.encounterDiscard.push(held.code);
      return true;
    }
    // Each player deals X damage to a character he controls.
    case "wrDamageOne": {
      const targets = charactersOf(s, p);
      if (!targets.length) return true;
      choose(
        s,
        `${e.text} · Deal ${e.value} damage to a character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [fx("damage", { target: u.id, value: e.value, player: p })],
        })),
      );
      return true;
    }
    case "wrExhaustOne": {
      const ready = charactersOf(s, p).filter(
        (u) => !u.exhausted && (!e.flag || heroOf(s, p, u)),
      );
      if (!ready.length) return true;
      choose(
        s,
        `${e.text} · Exhaust a ${e.flag ? "hero" : "character"} you control${seatLabel(s, p)}`,
        ready.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Exhaust ${name(u)}`,
          effects: [
            fx("wrExhaust", {
              target: u.id,
              flag: e.flag,
              player: p,
            }),
          ],
        })),
      );
      return true;
    }
    case "wrExhaust": {
      const u = get(s, e.target);
      if (!u || u.exhausted) return true;
      exhaustCharacter(s, u);
      // Enchanted Stream's travel: the hero cannot ready while it is active.
      if (e.flag) q.streamHeroes.push(u.id);
      return true;
    }
    case "wrDiscardCharacter": {
      const u = get(s, e.target);
      // discardCharacter logs the discard.
      if (u && charactersOf(s, p).some((x) => x.id === u.id))
        forOwner(s, p, () => discardCharacter(s, u));
      return true;
    }
    case "wrDiscardAlly": {
      const allies = seatView(s, p).allies.filter(
        (u) => card(u.code).type_code === "ally",
      );
      if (!allies.length) return true;
      choose(
        s,
        `${e.text} · Discard an ally you control${seatLabel(s, p)}`,
        allies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("wrDiscardCharacter", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "wrDropOwnAttachment": {
      const hosts = charactersOf(s, p).filter((u) =>
        u.attachments.some((a) => card(a.code).sphere_code !== "encounter"),
      );
      const options: Option[] = hosts.flatMap((host) =>
        host.attachments
          .filter((a) => card(a.code).sphere_code !== "encounter")
          .map((a) => ({
            id: a.id,
            code: a.code,
            label: `Discard ${card(a.code).name} from ${name(host)}`,
            effects: [
              fx("wrDropAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
      );
      if (!options.length) {
        log(
          s,
          `${e.text}: ${who(s, p)} ${s.table ? "controls" : "control"} no attachment.`,
        );
        return true;
      }
      choose(
        s,
        `${e.text} · Discard an attachment you control${seatLabel(s, p)}`,
        options,
      );
      return true;
    }
    case "wrDropAttachment": {
      const host = get(s, e.target);
      const a = host?.attachments.find((x) => x.id === e.source);
      // discardAttachment logs the discard.
      if (host && a) discardAttachment(s, host, a);
      return true;
    }
    case "wrEachThreat": {
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: each player raises his threat by ${e.value}.`,
        "danger",
      );
      return true;
    }
    case "wrThreat":
      forOwner(s, p, () => raiseThreat(s, e.value ?? 0, "encounter"));
      log(
        s,
        `${e.text}: ${who(s, p)} ${verb(s, "raise")} ${his(s)} threat by ${e.value}.`,
        "danger",
      );
      return true;
    case "wrStagedAttack": {
      const u = get(s, e.target);
      if (!u) return true;
      log(
        s,
        `${name(u)} makes an immediate attack against the first player.`,
        "danger",
      );
      prepend(s, fx("immediateAttack", { target: u.id, player: first }));
      return true;
    }
    case "wrReveal":
      prepend(s, fx("reveal", { player: first }));
      return true;
    // Black Forest Bats: the opposing team chooses a questing character.
    case "wrBats": {
      const questing = playerOrder(s).flatMap((owner) =>
        charactersOf(s, owner)
          .filter((u) => u.committed)
          .map((u) => ({ u, owner })),
      );
      if (!questing.length) {
        log(s, "Black Forest Bats: there is no questing character.");
        return true;
      }
      choose(
        s,
        `Black Forest Bats · The opposing team chooses a questing character to remove from the quest${seatLabel(s, first)}`,
        questing.map(({ u, owner }) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)}${s.table ? ` (${who(s, owner)})` : ""} (${stats(s, u).will} willpower)`,
          effects: [fx("wrUnquest", { target: u.id, player: owner })],
        })),
        card(WR.bats).text,
      );
      return true;
    }
    case "wrUnquest": {
      const u = get(s, e.target);
      if (!u) return true;
      removeFromQuest(s, u);
      forOwner(s, p, () => {
        s.committedIds = s.committedIds.filter((id) => id !== u.id);
      });
      log(s, `${name(u)} is removed from the quest.`, "danger");
      return true;
    }
    // Giant Web becomes the active location.
    case "wrGiantWeb": {
      const web = [...s.staging].reverse().find((u) => u.code === WR.giantWeb);
      if (!web) return true;
      s.staging = s.staging.filter((u) => u.id !== web.id);
      const previous = s.activeLocation;
      if (previous) s.staging.push(previous);
      s.activeLocation = web;
      log(
        s,
        previous
          ? `Giant Web becomes the active location; ${name(previous)} returns to the staging area.`
          : "Giant Web becomes the active location.",
        "danger",
      );
      return true;
    }
    case "wrDespair":
      q.despairRound = s.round;
      log(
        s,
        "Despair: until the end of the round, each character's printed text box is blank (except for Traits).",
        "danger",
      );
      return true;
    case "wrExhaustion":
      q.noPlayerReady = s.round;
      log(
        s,
        "Exhaustion: until the end of the round, characters cannot be readied by player card effects.",
        "danger",
      );
      return true;
    // Caught in a Web: the opposing team attaches it to a hero and exhausts that hero.
    case "wrWeb": {
      const heroes = playerOrder(s).flatMap((owner) =>
        seatView(s, owner)
          .heroes.filter((h) => !h.attachments.some((a) => a.code === WR.web))
          .map((h) => ({ h, owner })),
      );
      if (!heroes.length) {
        log(s, "Caught in a Web: there is no hero to attach it to.");
        return true;
      }
      choose(
        s,
        `Caught in a Web · The opposing team attaches it to a hero and exhausts that hero${seatLabel(s, first)}`,
        heroes.map(({ h, owner }) => ({
          id: h.id,
          code: h.code,
          label: `Attach to ${name(h)}${s.table ? ` (${who(s, owner)})` : ""}`,
          effects: [
            fx("wrAttachHeld", {
              target: h.id,
              source: e.source,
              player: first,
            }),
            fx("wrExhaust", { target: h.id, player: owner }),
          ],
        })),
        card(WR.web).text,
      );
      return true;
    }
    case "wrAttachHeld": {
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
    // Driven by Shadow: on an enemy, which returns to the staging area.
    case "wrDriven": {
      const enemies = enemiesInPlay(s).filter(
        (u) => !u.attachments.some((a) => a.code === WR.driven),
      );
      if (!enemies.length) {
        log(
          s,
          "Driven by Shadow: there is no enemy in play; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(WR.driven));
        return true;
      }
      choose(
        s,
        `Driven by Shadow · The opposing team attaches it to an enemy, which returns to the staging area${seatLabel(s, first)}`,
        enemies.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Attach to ${name(u)}`,
          effects: [
            fx("wrAttachHeld", {
              target: u.id,
              source: e.source,
              player: first,
            }),
            fx("wrReturn", { target: u.id, player: first }),
          ],
        })),
        card(WR.driven).text,
      );
      return true;
    }
    case "wrReturn": {
      const u = get(s, e.target);
      if (u && returnToStaging(s, u))
        log(s, `${name(u)} returns to the staging area.`, "danger");
      return true;
    }
    // Wind-whipped Rain: keep 1 card, or X damage among characters.
    case "wrRain": {
      const hand = seatView(s, p).hand;
      if (!hand.length) {
        log(
          s,
          `Wind-whipped Rain: ${who(s, p)} ${s.table ? "has" : "have"} no card in hand.`,
        );
        return true;
      }
      choose(
        s,
        `Wind-whipped Rain · Keep 1 card and discard the rest, or assign ${hand.length} damage among characters you control${seatLabel(s, p)}`,
        [
          {
            id: "keep",
            label: `Choose 1 card from your hand and discard the other ${hand.length - 1}`,
            effects: [fx("wrRainKeep", { player: p })],
          },
          {
            id: "damage",
            label: `Assign ${hand.length} damage among characters you control`,
            effects: [fx("wrRainDamage", { count: hand.length, player: p })],
          },
        ],
        card(WR.rain).text,
      );
      return true;
    }
    case "wrRainKeep": {
      const hand = seatView(s, p).hand;
      if (hand.length <= 1) return true;
      choose(
        s,
        `Wind-whipped Rain · Choose the card you keep${seatLabel(s, p)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Keep ${name(u)}`,
          effects: [fx("wrRainDiscard", { target: u.id, player: p })],
        })),
      );
      return true;
    }
    case "wrRainDiscard":
      forOwner(s, p, () => {
        const discarded = s.hand.filter((u) => u.id !== e.target);
        s.hand = s.hand.filter((u) => u.id === e.target);
        s.discard.push(...discarded.map((u) => u.code));
        log(
          s,
          `Wind-whipped Rain: ${discarded.length} card${discarded.length === 1 ? " is" : "s are"} discarded from ${his(s)} hand.`,
          "danger",
        );
      });
      return true;
    case "wrRainDamage": {
      const left = e.count ?? 0;
      const targets = charactersOf(s, p);
      if (left <= 0 || !targets.length) return true;
      choose(
        s,
        `Wind-whipped Rain · Assign 1 damage (${left} left) to a character you control${seatLabel(s, p)}`,
        targets.map((u) => ({
          id: u.id,
          code: u.code,
          label: `${name(u)} (${stats(s, u).health - u.damage} hit points left)`,
          effects: [
            fx("damage", { target: u.id, value: 1, player: p }),
            fx("wrRainDamage", { count: left - 1, player: p }),
          ],
        })),
      );
      return true;
    }
    // Eyes of the Forest: the opposing team discards a card from each hand.
    case "wrEyes": {
      const hand = seatView(s, p).hand;
      if (!hand.length) return true;
      choose(
        s,
        `Eyes of the Forest · The opposing team discards a card from ${who(s, p)}${s.table ? "'s" : "r"} hand${seatLabel(s, first)}`,
        hand.map((u) => ({
          id: u.id,
          code: u.code,
          label: `Discard ${name(u)}`,
          effects: [fx("wrHandDiscard", { target: u.id, player: p })],
        })),
        card(WR.eyes).text,
      );
      return true;
    }
    case "wrHandDiscard":
      if (e.target) discardFromHand(s, p, e.target);
      return true;
    // Hatred Rekindled: each engaged enemy attacks.
    case "wrHatred": {
      const attacks = playerOrder(s).flatMap((owner) =>
        seatView(s, owner).engaged.map((u) =>
          fx("immediateAttack", { target: u.id, player: owner }),
        ),
      );
      if (!attacks.length) {
        log(
          s,
          "Hatred Rekindled: no enemy is engaged; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(WR.hatred));
        return true;
      }
      log(
        s,
        "Hatred Rekindled: each engaged enemy makes an immediate attack.",
        "danger",
      );
      prepend(s, ...attacks);
      return true;
    }
    // Vastness of Mirkwood: a card with cost up to the stage number from the top 5.
    case "wrVastness": {
      const max = stageNumber(s);
      const top = s.encounterDeck.slice(0, 5);
      const eligible = [...new Set(top.filter((c) => wrCost(c) <= max))];
      if (!eligible.length) {
        s.encounterDeck = shuffle(s, s.encounterDeck);
        log(
          s,
          `Vastness of Mirkwood: no card with cost ${max} or less among the top 5 encounter cards; the deck is shuffled.`,
        );
        return true;
      }
      choose(
        s,
        `Vastness of Mirkwood · The opposing team chooses a card with cost ${max} or less from the top 5 encounter cards to reveal${seatLabel(s, first)}`,
        eligible.map((c) => ({
          id: c,
          code: c,
          label: `Reveal ${card(c).name} (cost ${wrCost(c)})`,
          effects: [fx("wrVastnessTake", { code: c, player: first })],
        })),
        card(WR.vastness).text,
      );
      return true;
    }
    case "wrVastnessTake": {
      const i = s.encounterDeck.slice(0, 5).indexOf(e.code ?? "");
      if (i < 0) return true;
      const [c] = s.encounterDeck.splice(i, 1);
      s.encounterDeck = shuffle(s, s.encounterDeck);
      log(
        s,
        `Vastness of Mirkwood: ${card(c).name} is set aside, the encounter deck is shuffled and it is revealed.`,
        "danger",
      );
      prepend(s, fx("revealCard", { code: c, player: first }));
      return true;
    }
    // Massing at Night: one different 0 cost enemy per player (limit 2).
    case "wrMassing": {
      const taken = new Set(e.ids ?? []);
      if ((e.count ?? 0) <= 0) {
        prepend(s, fx("wrShuffle", { player: first }));
        return true;
      }
      const options = searchable(
        s,
        (c) =>
          card(c).type_code === "enemy" &&
          wrCost(c) === 0 &&
          !taken.has(card(c).name),
      );
      if (!options.length) {
        log(s, "Massing at Night: there is no different 0 cost enemy.");
        prepend(s, fx("wrShuffle", { player: first }));
        return true;
      }
      choose(
        s,
        `Massing at Night · The opposing team adds a different 0 cost enemy to the staging area${seatLabel(s, first)}`,
        options.map((c) => ({
          id: c,
          code: c,
          label: `Add ${card(c).name}`,
          effects: [
            fx("wrSearchStage", {
              code: c,
              text: "Massing at Night",
              player: first,
            }),
            fx("wrMassing", {
              ids: [...taken, card(c).name],
              count: (e.count ?? 1) - 1,
              player: first,
            }),
          ],
        })),
        card(WR.massing).text,
      );
      return true;
    }
    // Turned Around: 5 progress removed, attached to the main quest (+5 quest points).
    case "wrTurned": {
      const removed = Math.min(5, s.progress);
      s.progress -= removed;
      const i = q.resolving.findIndex((x) => x.id === e.source);
      if (i >= 0) {
        const [held] = q.resolving.splice(i, 1);
        (s.questAttachments ??= {})[q.currentQuest] = [
          ...(s.questAttachments[q.currentQuest] ?? []),
          {
            id: held.id,
            code: held.code,
            exhausted: false,
          } as Unit["attachments"][number],
        ];
      }
      log(
        s,
        `Turned Around: ${removed} progress ${removed === 1 ? "is" : "are"} removed and it is attached to the main quest (+5 quest points).`,
        "danger",
      );
      return true;
    }
    // Lost and Witless: each player discards the allies in his hand.
    case "wrWitless":
      forOwner(s, p, () => {
        const allies = s.hand.filter((u) => card(u.code).type_code === "ally");
        s.hand = s.hand.filter((u) => card(u.code).type_code !== "ally");
        s.discard.push(...allies.map((u) => u.code));
        log(
          s,
          `Lost and Witless: ${who(s, p)} ${verb(s, "reveal")} ${his(s)} hand and ${verb(s, "discard")} ${allies.length} all${allies.length === 1 ? "y" : "ies"}.`,
          allies.length ? "danger" : "normal",
        );
      });
      return true;
    // A Frightened Beast: threat per questing character, or a questing character discarded.
    case "wrFrightened": {
      const questing = charactersOf(s, p).filter((u) => u.committed);
      if (!questing.length) {
        log(
          s,
          `A Frightened Beast: ${who(s, p)} ${s.table ? "has" : "have"} no questing character.`,
        );
        return true;
      }
      choose(
        s,
        `A Frightened Beast · Raise your threat by ${questing.length}, or discard a questing character you control${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: `Raise your threat by ${questing.length}`,
            effects: [
              fx("wrThreat", {
                value: questing.length,
                text: "A Frightened Beast",
                player: p,
              }),
            ],
          },
          ...questing.map((u) => ({
            id: u.id,
            code: u.code,
            label: `Discard ${name(u)}`,
            effects: [fx("wrDiscardCharacter", { target: u.id, player: p })],
          })),
        ],
        card(WR.frightened).text,
      );
      return true;
    }
    // Wasted Provisions: every hero resource is discarded, 1 threat each.
    case "wrWasted": {
      let total = 0;
      for (const owner of playerOrder(s))
        forOwner(s, owner, () => {
          const n = s.heroes.reduce((t, h) => t + h.resources, 0);
          for (const h of s.heroes) h.resources = 0;
          if (n) raiseThreat(s, n, "encounter");
          total += n;
        });
      if (!total) {
        log(
          s,
          "Wasted Provisions: no resource was discarded; it gains surge.",
          "danger",
        );
        prepend(s, ...surgeEffects(WR.wasted));
        return true;
      }
      log(
        s,
        `Wasted Provisions: ${total} resource${total === 1 ? " is" : "s are"} discarded; each player raises his threat by as many.`,
        "danger",
      );
      return true;
    }
    case "wrMountainsShadow":
      choose(
        s,
        `Mountains of Mirkwood · Shadow: raise your threat by 2, or the attacking enemy gets +2 attack${seatLabel(s, p)}`,
        [
          {
            id: "threat",
            label: "Raise your threat by 2",
            effects: [
              fx("wrThreat", {
                value: 2,
                text: "Mountains of Mirkwood",
                player: p,
              }),
            ],
          },
          {
            id: "attack",
            label: "The attacking enemy gets +2 attack",
            effects: [
              fx("wrBoost", {
                value: 2,
                text: "Mountains of Mirkwood",
                player: p,
              }),
            ],
          },
        ],
        card(WR.mountains).shadow,
      );
      return true;
    case "wrBoost":
      if (s.combat) {
        s.combat.attackBonus += e.value ?? 0;
        log(
          s,
          `${e.text}: the attacking enemy gets +${e.value} attack.`,
          "danger",
        );
      }
      return true;
  }
  return false;
}
/** Enemies in play: staged and engaged. */
export const wrEnemies = (s: GameState) => [
  ...s.staging.filter(isEnemy),
  ...globalEngaged(s),
];
export { engagedWith };
