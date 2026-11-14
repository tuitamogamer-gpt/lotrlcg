import type { Effect, GameState, Option, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import { choose, fx, get, log, prepend, shuffle } from "./core";
import { discardAttachment, engage, revealed } from "./board";
import {
  activeSeat,
  attachmentController,
  forOwner,
  globalCharacters,
  globalEngaged,
  globalPlayerOrder,
  seatName,
  seatView,
} from "./table";
import { isAlly, isHero } from "./card-types";
import { isEnemy } from "./ships";
import { threatOf } from "./core";
import { UH } from "./uruk-hai-support";

/**
 * The Orcs of the White Hand encounter set of The Treason of Saruman, shared
 * by The Uruk-hai and Helm's Deep: Isengard Uruk, Uruk-hai Fighter and
 * Fighting Uruk-hai. Its effect kinds keep the names they were saved under
 * when The Uruk-hai introduced them.
 */
export const WHITE_HAND = {
  uruk: UH.uruk,
  fighter: UH.fighter,
  fighting: UH.fighting,
} as const;
const W = WHITE_HAND;
type Holder = {
  resolving: Unit[];
  fighting?: { round: number; players: number[] };
};
/** Each scenario that uses the set holds its treacheries and Fighting Uruk-hai. */
export const whiteHandHolder = (s: GameState): Holder | undefined =>
  s.urukHai ?? s.helmsDeep;
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const who = (s: GameState, p: number) => (s.table ? seatName(s, p) : "you");
const verb = (s: GameState, base: string) => (s.table ? `${base}s` : base);

/** Printed Toughness X of an encounter card. */
export const whiteHandToughness = (code: string) =>
  Number(/\bToughness (\d+)/.exec(card(code).text ?? "")?.[1] ?? 0);
/** Printed Archery X of an encounter card. */
export const whiteHandArchery = (code: string) =>
  Number(/\bArchery (\d+)/.exec(card(code).text ?? "")?.[1] ?? 0);
/** An Uruk-hai enemy, by its printed traits. */
export const isUrukHaiEnemyCode = (code: string) =>
  card(code).type_code === "enemy" &&
  (card(code).traits ?? "")
    .split(".")
    .map((t) => t.trim())
    .includes("Uruk-hai");

/** "Search the encounter deck and discard pile for an Uruk-hai enemy": one option per card and zone. */
export function urukOptions(
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
    for (const code of [...new Set(cards.filter((c) => isUrukHaiEnemyCode(c)))])
      options.push({
        id: `${zone}-${code}`,
        code,
        label: `${card(code).name} · ${zone === "deck" ? "encounter deck" : "discard pile"}`,
        effects: [fx(kind, { code, text: zone, flag: engaged, player })],
      });
  return options;
}

/** Isengard Uruk's When Revealed effect, once it is in the staging area. */
export function whiteHandEnemyRevealed(
  s: GameState,
  code: string,
  fromReveal: boolean,
) {
  if (code !== W.uruk || !whiteHandHolder(s)) return false;
  if (!fromReveal) return true;
  const u = [...s.staging].reverse().find((x) => x.code === code);
  prepend(s, fx("uhUruk", { target: u?.id, player: activeSeat(s) }));
  return true;
}
/** Fighting Uruk-hai's When Revealed effect. */
export function whiteHandTreachery(s: GameState, code: string) {
  const q = whiteHandHolder(s);
  if (!q || code !== W.fighting) return false;
  const p = activeSeat(s);
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
    return true;
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
  return true;
}
/** Uruk-hai Fighter's shadow. */
export function whiteHandShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c || !whiteHandHolder(s) || code !== W.fighter) return false;
  prepend(
    s,
    fx("uhDiscardAttachment", { player: c.attackPlayer ?? activeSeat(s) }),
  );
  return true;
}
/** Fighting Uruk-hai: each enemy engaged with its player adds its threat. */
export function whiteHandStagingThreat(s: GameState) {
  const f = whiteHandHolder(s)?.fighting;
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
}
/** Uruk-hai Fighter returns to the staging area after its attack destroys a character. */
export function whiteHandCharacterDestroyed(
  s: GameState,
  u: Unit,
  context: DamageContext,
) {
  const c = s.combat;
  if (
    !whiteHandHolder(s) ||
    !c ||
    !(isHero(u) || isAlly(u)) ||
    !context.combatDamage ||
    context.enemyId !== c.enemyId
  )
    return false;
  const enemy = get(s, c.enemyId);
  if (enemy && live(enemy, W.fighter)) c.returnToStaging = true;
  return true;
}

export function whiteHandEffect(s: GameState, e: Effect): boolean {
  if (!whiteHandHolder(s)) return false;
  const p = e.player ?? activeSeat(s);
  const u = e.target
    ? (get(s, e.target) ??
      [...globalCharacters(s), ...globalEngaged(s), ...s.staging].find(
        (x) => x.id === e.target,
      ))
    : undefined;
  switch (e.kind) {
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
  }
  return false;
}
