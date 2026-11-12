import type { Effect, GameState, Unit } from "./types";
import type { DamageContext } from "./damage-context";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  removeShadowCard,
  shuffle,
  stats,
  units,
} from "./core";
import { damage, discardAttachment } from "./board";
import {
  activeSeat,
  allEngaged,
  attachmentController,
  forOwner,
  globalCharacters,
  ownerOf,
  seatName,
} from "./table";
import { dealEnemyShadows } from "./considered-engagement";
import { surgeEffects } from "./surge";
import { oneRingExhausted } from "./lotr-saga";
import { SP } from "./shadow-past-support";
import { KD } from "./knife-dark-support";
import {
  isMorgul,
  isNazgulCard,
  returnToStaging,
  who,
} from "./black-riders-hunted";

/**
 * The Nazgûl and The Black Riders encounter sets of The Black Riders: the
 * Ringwraiths, The Witch-king, Pale Blade and Power in their Terror (shared by
 * A Knife in the Dark and Flight to the Ford), and Black Steed and Rode Like a
 * Gale (shared by A Shadow of the Past and Flight to the Ford). Their effect
 * kinds keep the names they were saved under when the earlier scenario
 * introduced them.
 */
export const NAZGUL = {
  ringwraith: KD.ringwraith,
  witchKing: KD.witchKing,
  blade: KD.blade,
  terror: KD.terror,
  steed: SP.steed,
  gale: SP.gale,
} as const;
const N = NAZGUL;
export const NAZGUL_TREACHERIES: readonly string[] = [
  N.blade,
  N.terror,
  N.steed,
  N.gale,
];
/** The scenarios whose encounter decks hold The Nazgûl set. */
const nazgulLive = (s: GameState) => !!(s.knifeDark || s.flightFord);
/** The scenarios whose encounter decks hold The Black Riders set. */
const ridersLive = (s: GameState) => !!(s.shadowPast || s.flightFord);
const live = (u: Unit, code: string) => u.code === code && !u.blanked;
const attached = (u: Unit, code: string) =>
  u.attachments.some((a) => a.code === code && !a.blanked);
export const steedOf = (u: Unit) => attached(u, N.steed);
const enemiesInPlay = (s: GameState) =>
  [...s.staging, ...allEngaged(s)].filter(
    (u) => card(u.code).type_code === "enemy",
  );
const seatLabel = (s: GameState, p: number) =>
  s.table ? ` · ${seatName(s, p)}` : "";
const where = (s: GameState, u: Unit) =>
  allEngaged(s).some((x) => x.id === u.id)
    ? ` · engaged with ${who(s, ownerOf(s, u))}`
    : " · staging area";

/**
 * When Revealed effects. An attachment treachery stays with its scenario
 * until `attach` builds the scenario's own attach effect for the chosen enemy.
 */
export function nazgulTreachery(
  s: GameState,
  code: string,
  p: number,
  attach: (target: string) => Effect,
) {
  const nazgulCode = code === N.blade || code === N.terror;
  if ((nazgulCode && !nazgulLive(s)) || (!nazgulCode && !ridersLive(s)))
    return false;
  switch (code) {
    case N.blade:
    case N.steed: {
      const blade = code === N.blade;
      const targets = enemiesInPlay(s).filter(
        (u) =>
          isNazgulCard(u.code) && !u.attachments.some((a) => a.code === code),
      );
      if (!targets.length) {
        log(s, `${card(code).name}: no Nazgûl enemy in play can take it.`);
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `${card(code).name} · Attach to a Nazgûl enemy${seatLabel(s, p)}`,
          targets.map((u) => ({
            id: u.id,
            code: u.code,
            label: `${name(u)}${where(s, u)}`,
            effects: [attach(u.id)],
          })),
          blade
            ? "Attached enemy gets +1 attack and cannot take non-combat damage."
            : "Attached enemy gets −10 engagement cost and returns to the staging area at the end of the refresh phase.",
        ),
      );
      return true;
    }
    case N.terror:
      prepend(s, fx("kdTerror", { player: p }));
      return true;
    case N.gale: {
      const riders = allEngaged(s).filter((u) => isNazgulCard(u.code));
      for (const u of riders) returnToStaging(s, u);
      if (!riders.length) {
        log(
          s,
          "Rode Like a Gale: no Nazgûl enemy was engaged. It gains surge.",
        );
        prepend(s, ...surgeEffects(N.gale));
      }
      return true;
    }
  }
  return false;
}

/** Shadow effects of Ringwraith, Power in their Terror and Rode Like a Gale. */
export function nazgulShadow(s: GameState, code: string) {
  const c = s.combat;
  if (!c) return false;
  const p = c.attackPlayer ?? activeSeat(s);
  if (code === N.gale && ridersLive(s)) {
    c.spReturn = true;
    return true;
  }
  if (!nazgulLive(s)) return false;
  if (code === N.terror) {
    prepend(s, fx("kdTerrorShadow", { player: p }));
    return true;
  }
  if (code === N.ringwraith) {
    // Shadow: shuffle this card into the encounter deck.
    const enemy = get(s, c.enemyId);
    const i = enemy?.shadows.indexOf(code) ?? -1;
    if (enemy && i >= 0) {
      removeShadowCard(enemy, i);
      s.encounterDeck.push(code);
      shuffle(s, s.encounterDeck);
      log(s, "Ringwraith is shuffled into the encounter deck.", "danger");
    }
    return true;
  }
  return false;
}

export function nazgulEffect(s: GameState, e: Effect): boolean {
  const p = e.player ?? activeSeat(s),
    u = get(s, e.target);
  if (e.kind === "spSteedReturn") {
    if (!ridersLive(s)) return false;
    if (u && steedOf(u)) returnToStaging(s, u);
    return true;
  }
  if (!nazgulLive(s)) return false;
  switch (e.kind) {
    case "kdTerror": {
      const allies = globalCharacters(s).filter(
        (x) => card(x.code).type_code === "ally",
      );
      for (const a of allies) a.roundWill = (a.roundWill ?? 0) - 1;
      const broken = allies.filter((a) => stats(s, a).will <= 0);
      log(
        s,
        `Power in their Terror: each ally gets −1 willpower until the end of the round${broken.length ? `; ${broken.map((a) => name(a)).join(", ")} take${broken.length === 1 ? "s" : ""} 2 damage` : ""}.`,
        "danger",
      );
      for (const a of broken)
        forOwner(s, ownerOf(s, a), () => damage(s, a.id, 2, {}));
      return true;
    }
    case "kdTerrorShadow": {
      const choices = units(s).flatMap((host) =>
        host.attachments
          .filter(
            (a) =>
              attachmentController(s, host, a) === p &&
              card(a.code).type_code !== "objective",
          )
          .map((a) => ({ host, a })),
      );
      if (!choices.length) return true;
      if (choices.length === 1) {
        const [{ host, a }] = choices;
        forOwner(s, p, () => discardAttachment(s, host, a));
        return true;
      }
      forOwner(s, p, () =>
        choose(
          s,
          `Power in their Terror · Discard a non-objective attachment you control${seatLabel(s, p)}`,
          choices.map(({ host, a }) => ({
            id: a.id,
            code: a.code,
            label: `${card(a.code).name} · ${name(host)}`,
            effects: [
              fx("kdDiscardAttachment", {
                target: host.id,
                source: a.id,
                player: p,
              }),
            ],
          })),
        ),
      );
      return true;
    }
    case "kdDiscardAttachment": {
      const a = u?.attachments.find((x) => x.id === e.source);
      if (u && a) forOwner(s, p, () => discardAttachment(s, u, a));
      return true;
    }
    case "kdWraithShadow": {
      if (!u || !oneRingExhausted(s)) return true;
      if (!dealEnemyShadows(s, u, 1).length) return true;
      log(
        s,
        "Ringwraith attacks while The One Ring is exhausted: it is dealt an additional shadow card.",
        "danger",
      );
      return true;
    }
  }
  return false;
}

/** Pale Blade: +1 attack. */
export const nazgulAttackBonus = (s: GameState, u: Unit) =>
  nazgulLive(s) && attached(u, N.blade) ? 1 : 0;
/** Pale Blade: the attached enemy cannot take non-combat damage. */
export const nazgulNoDamage = (s: GameState, u: Unit, context: DamageContext) =>
  nazgulLive(s) && attached(u, N.blade) && !context.combatDamage;
/** The Witch-king (−30 with The One Ring exhausted) and Black Steed (−10). */
export function nazgulEngagementBonus(s: GameState, u: Unit) {
  let bonus = 0;
  if (nazgulLive(s) && live(u, N.witchKing) && oneRingExhausted(s)) bonus -= 30;
  if (ridersLive(s) && steedOf(u)) bonus -= 10;
  return bonus;
}
export const nazgulImmune = (s: GameState, u: Unit) =>
  nazgulLive(s) && live(u, N.witchKing);
/** "Cannot have non-Morgul attachments." */
export const nazgulCannotAttach = (s: GameState, u: Unit, code: string) =>
  (nazgulLive(s) || ridersLive(s)) &&
  !u.blanked &&
  isNazgulCard(u.code) &&
  /Cannot have non-Morgul attachments/.test(card(u.code).text ?? "") &&
  !isMorgul(code);
/** Characters with 1 willpower or less cannot defend The Witch-king. */
export const nazgulCannotDefend = (
  s: GameState,
  enemy: Unit,
  defender?: Unit,
) =>
  nazgulLive(s) &&
  live(enemy, N.witchKing) &&
  !!defender &&
  stats(s, defender).will <= 1;
/** Ringwraith: an additional shadow card when it attacks with The One Ring exhausted. */
export function nazgulAttackStarted(s: GameState, enemy: Unit, player: number) {
  if (nazgulLive(s) && live(enemy, N.ringwraith) && oneRingExhausted(s))
    prepend(s, fx("kdWraithShadow", { target: enemy.id, player }));
}
/** Black Steed: at the end of the refresh phase its enemy returns to the staging area. */
export const blackSteedRoundEnd = (s: GameState): Effect[] =>
  !ridersLive(s)
    ? []
    : allEngaged(s)
        .filter((u) => steedOf(u))
        .map((u) =>
          fx("spSteedReturn", { target: u.id, player: ownerOf(s, u) }),
        );
