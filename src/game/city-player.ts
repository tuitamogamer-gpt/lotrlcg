import type { Effect, GameState, Option, Unit } from "./types";
import { card, name } from "./cards";
import {
  choose,
  fx,
  get,
  log,
  prepend,
  putPlayerDeck,
  requireRule,
  shuffle,
  skip,
  spendResources,
  spendResourcePayment,
  stats,
  takePlayerDeck,
} from "./core";
import {
  advanceDefense,
  allyCanEnter,
  characterLeftPlay,
  discardAttachment,
  enemyAddedToStaging,
  enterAlly,
  exhaustCharacter,
} from "./board";
import {
  activeSeat,
  allCharacters,
  allHeroes,
  forOwner,
  ownerOf,
  seatName,
  seatView,
} from "./table";
import { unitType } from "./card-types";
import { effectiveTraits, hasResourceIcon } from "./expansion-passives";
import { heirsCanSpendResources } from "./heirs-numenor";
import { isSacked } from "./carrock";
import { khazadCannotExhaust } from "./khazad-dum";
import { watcherWaterCannotExhaust } from "./watcher-water";
import { playerCardImmune } from "./card-immunity";
import { fateCannotSearch } from "./fate-numenor";
import { shadowFlameCanMove } from "./shadow-flame";
import { morgulCannotLeave } from "./morgul-vale";
import { choosePlayerResponse } from "./player-ability-triggers";
import { CITY_PLAYER as P, CITY_SOLDIER_DISCOUNT } from "./city-player-support";

const IMRAHIL = "round:city:imrahil:";
const RETURN = "phase:city:imrahil-return:";
const lists = (s: GameState) =>
  new Set([s.used, ...(s.table?.seats.map((p) => p.used) ?? [])]);
const used = (s: GameState, key: string) =>
  [...lists(s)].some((list) => list.includes(key));
const usable = (u: Unit) => !u.blanked && !isSacked(u) && !playerCardImmune(u);
const exhaustible = (u: Unit) =>
  !u.exhausted && !khazadCannotExhaust(u) && !watcherWaterCannotExhaust(u);
const lorePayers = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      ownerOf(s, h) === activeSeat(s) &&
      h.resources > 0 &&
      hasResourceIcon(h, "lore") &&
      heirsCanSpendResources(s, h),
  );
const presenceHeroes = (s: GameState, chosen: Unit) =>
  allHeroes(s).filter(
    (h) => (card(h.code).threat ?? 0) < (card(chosen.code).threat ?? 0),
  );
const ownPresenceHeroes = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      ownerOf(s, h) === activeSeat(s) &&
      !playerCardImmune(h) &&
      presenceHeroes(s, h).some((u) => !playerCardImmune(u)),
  );
const imrahilAllies = (s: GameState, traits: string[]) =>
  s.deck
    .slice(0, 5)
    .flatMap((code, index) =>
      allyCanEnter(s, code) &&
      (card(code).traits ?? "")
        .split(".")
        .some((trait) => traits.includes(trait.trim()))
        ? [{ code, index }]
        : [],
    );
const guardianEnemy = (s: GameState, enemy: Unit) =>
  !playerCardImmune(enemy) &&
  shadowFlameCanMove(s, enemy) &&
  !morgulCannotLeave(s, enemy);
function payThen(s: GameState, pay: () => void, effects: Effect[]) {
  const tail = s.queue,
    player = activeSeat(s);
  s.queue = [];
  pay();
  s.queue.push(
    ...effects.map((e) => ({ ...e, player: e.player ?? player })),
    ...tail,
  );
}
export function cityPlayerPlayTargets(
  s: GameState,
  code: string,
): Unit[] | undefined {
  return code === P.presence ? ownPresenceHeroes(s) : undefined;
}
export function cityPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.line)
    return "Hold the Line uses the enemy attack response window.";
  if (u.code === P.presence && !ownPresenceHeroes(s).length)
    return "Inspiring Presence needs your hero and a hero with a lower threat cost who can receive its bonus.";
  return null;
}
export function cityPlayerAbilityLabel(code: string) {
  if (code === P.imrahil)
    return "Spend 1 Imrahil resource · Search top 5 for a shared-trait ally · Once per round";
  if (code === P.sulien)
    return "Spend 1 Lore resource · Exhaust Súlien · Staging locations −1 threat";
  return undefined;
}
export const cityPlayerAbilityAnyPlayer = (code: string) => code === P.sulien;
export function cityPlayerAbilityProblem(s: GameState, u: Unit) {
  if (u.code === P.imrahil) {
    if (ownerOf(s, u) !== activeSeat(s) || !usable(u))
      return "Only Prince Imrahil's controller can trigger his active text.";
    if (!["defense", "attack"].includes(s.phase))
      return "Prince Imrahil has a Combat Action.";
    if (used(s, IMRAHIL + s.round + ":" + u.id))
      return "Prince Imrahil has already acted this round.";
    if (!u.resources || !heirsCanSpendResources(s, u))
      return "Prince Imrahil needs 1 spendable resource.";
    if (fateCannotSearch(s))
      return "An encounter effect prevents searching your deck.";
    if (!s.deck.length) return "Your deck is empty.";
    return null;
  }
  if (u.code === P.sulien) {
    if (!usable(u) || !exhaustible(u))
      return "Súlien must be ready and able to exhaust.";
    if (!lorePayers(s).length)
      return "The triggering player needs 1 spendable Lore resource.";
    if (
      !s.staging.some(
        (l) => card(l.code).type_code === "location" && !playerCardImmune(l),
      )
    )
      return "There is no affected staging location.";
  }
  return null;
}
export function useCityPlayerAbility(s: GameState, u: Unit) {
  if (!cityPlayerAbilityLabel(u.code)) return false;
  requireRule(
    !cityPlayerAbilityProblem(s, u),
    cityPlayerAbilityProblem(s, u) ?? "",
  );
  if (u.code === P.imrahil) {
    s.used.push(IMRAHIL + s.round + ":" + u.id);
    payThen(s, () => spendResources(s, u, 1), [
      fx("cityPlayerImrahilSearch", {
        source: u.id,
        text: JSON.stringify(effectiveTraits(u)),
      }),
    ]);
  } else
    choose(
      s,
      "Súlien · Spend 1 Lore resource",
      lorePayers(s).map((h) => ({
        id: h.id,
        code: h.code,
        label: `${name(h)} · 1 Lore`,
        effects: [fx("cityPlayerSulienPay", { source: u.id, target: h.id })],
      })),
    );
  return true;
}
export function cityPlayerAllyEntered(s: GameState, u: Unit) {
  if (
    ![P.soldier, P.guardian].includes(u.code as typeof P.soldier) ||
    !usable(u)
  )
    return;
  prepend(
    s,
    fx(
      u.code === P.soldier
        ? "cityPlayerSoldierOffer"
        : "cityPlayerGuardianOffer",
      { source: u.id, player: ownerOf(s, u) },
    ),
  );
}
export function cityPlayerCharacterLeft(s: GameState, u: Unit) {
  for (const list of lists(s))
    list.splice(0, list.length, ...list.filter((key) => key !== RETURN + u.id));
}
export function cityPlayerPhaseEnd(s: GameState): Effect[] {
  const ids = new Set(
    [...lists(s)].flatMap((list) =>
      list
        .filter((key) => key.startsWith(RETURN))
        .map((key) => key.slice(RETURN.length)),
    ),
  );
  return [...ids].flatMap((id) => {
    const u = allCharacters(s).find((u) => u.id === id);
    return u
      ? [fx("cityPlayerImrahilReturn", { target: id, player: ownerOf(s, u) })]
      : [];
  });
}
export function cityPlayerEvent(s: GameState, code: string, target?: string) {
  if (code !== P.presence) return false;
  const hero = allHeroes(s).find(
    (h) => h.id === target && ownerOf(s, h) === activeSeat(s),
  );
  if (!hero) return true;
  const heroes = presenceHeroes(s, hero),
    affected = heroes.filter((h) => !playerCardImmune(h));
  for (const h of affected) h.tempDefense = (h.tempDefense ?? 0) + 2;
  if (affected.length && affected.length === heroes.length) {
    const options = groupTwoOptions(s, "leadership", "cityPlayerPresencePay", {
      value: card(hero.code).threat ?? 0,
    });
    if (options.length)
      choose(s, "Inspiring Presence · Group may spend 2 Leadership", [
        skip,
        ...options,
      ]);
  }
  return true;
}
function groupTwoOptions(
  s: GameState,
  sphere: string,
  kind: string,
  extra: Partial<Effect>,
): Option[] {
  const heroes = allHeroes(s).filter(
      (h) =>
        h.resources > 0 &&
        hasResourceIcon(h, sphere) &&
        heirsCanSpendResources(s, h),
    ),
    options: Option[] = [];
  for (let i = 0; i < heroes.length; i++) {
    const a = heroes[i];
    if (a.resources >= 2)
      options.push({
        id: `pay-${a.id}`,
        code: a.code,
        label: `${seatName(s, ownerOf(s, a))} · ${name(a)}: 2 ${sphere}`,
        effects: [fx(kind, { ...extra, ids: [a.id, a.id] })],
      });
    for (const b of heroes.slice(i + 1))
      options.push({
        id: `pay-${a.id}-${b.id}`,
        label: `${name(a)} + ${name(b)}: 1 ${sphere} each`,
        effects: [fx(kind, { ...extra, ids: [a.id, b.id] })],
      });
  }
  return options;
}
export function cityPlayerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("cityPlayer")) return false;
  const u = get(s, e.target),
    source = get(s, e.source);
  switch (e.kind) {
    case "cityPlayerImrahilSearch": {
      if (fateCannotSearch(s)) break;
      const traits = source
        ? effectiveTraits(source)
        : (JSON.parse(e.text ?? "[]") as string[]);
      choose(s, "Prince Imrahil · Search the top 5 cards", [
        ...imrahilAllies(s, traits).map(({ code, index }) => ({
          id: `deck-${index}`,
          code,
          label: `Put ${card(code).name} into play`,
          effects: [
            fx("cityPlayerImrahilEnter", {
              source: e.source,
              code,
              value: index,
              text: JSON.stringify(traits),
            }),
          ],
        })),
        {
          id: "none",
          label: "Choose no ally · Shuffle your deck",
          effects: [fx("cityPlayerImrahilShuffle")],
        },
      ]);
      break;
    }
    case "cityPlayerImrahilEnter": {
      if (fateCannotSearch(s)) break;
      const traits = source
        ? effectiveTraits(source)
        : (JSON.parse(e.text ?? "[]") as string[]);
      requireRule(
        imrahilAllies(s, traits).some(
          ({ code, index }) => index === e.value && code === e.code,
        ),
        "Choose an eligible physical ally among the top five cards.",
      );
      const ally = takePlayerDeck(s, e.value);
      s.used.push(RETURN + ally.id);
      shuffle(s, s.deck);
      enterAlly(s, ally, false, false, false);
      break;
    }
    case "cityPlayerImrahilShuffle":
      shuffle(s, s.deck);
      break;
    case "cityPlayerImrahilReturn": {
      if (!u || !allCharacters(s).some((h) => h.id === u.id)) break;
      const controller = ownerOf(s, u),
        owner = u.owner ?? controller,
        attack = stats(s, u).attack,
        traits = effectiveTraits(u),
        type = unitType(u);
      for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
      forOwner(s, controller, () => {
        s.allies = s.allies.filter((h) => h.id !== u.id);
        s.heroes = s.heroes.filter((h) => h.id !== u.id);
      });
      forOwner(s, owner, () => {
        putPlayerDeck(s, u);
        shuffle(s, s.deck);
      });
      log(s, `${name(u)} is shuffled into its owner's deck by Prince Imrahil.`);
      prepend(s, fx("valiant", { player: controller }));
      characterLeftPlay(
        s,
        u,
        controller,
        {
          zone: "deck",
          player: owner,
          id: u.id,
          index: seatView(s, owner).deck.indexOf(u.code),
        },
        attack,
        traits,
        true,
        type,
      );
      break;
    }
    case "cityPlayerSulienPay": {
      if (
        !source ||
        source.code !== P.sulien ||
        !u ||
        !lorePayers(s).some((h) => h.id === u.id) ||
        cityPlayerAbilityProblem(s, source)
      )
        break;
      payThen(s, () => spendResources(s, u, 1), [
        fx("cityPlayerSulienExhaust", { source: source.id }),
      ]);
      break;
    }
    case "cityPlayerSulienExhaust": {
      if (!source || !exhaustible(source) || playerCardImmune(source)) break;
      payThen(s, () => {
        requireRule(exhaustCharacter(s, source), "Súlien must exhaust.");
      }, [fx("cityPlayerSulienReduce")]);
      break;
    }
    case "cityPlayerSulienReduce":
      for (const l of s.staging)
        if (card(l.code).type_code === "location" && !playerCardImmune(l))
          l.tempThreat = (l.tempThreat ?? 0) - 1;
      break;
    case "cityPlayerSoldierOffer":
      if (source?.code === P.soldier && usable(source))
        choosePlayerResponse(
          s,
          source.id,
          P.soldier,
          "Soldier of Dol Amroth · Reduce the next Tactics card's cost",
          [
            {
              id: "use",
              code: P.soldier,
              label: "Next Tactics card this phase costs 1 less",
              effects: [fx("cityPlayerSoldierResolve")],
            },
            skip,
          ],
        );
      break;
    case "cityPlayerSoldierResolve":
      s.used.push(CITY_SOLDIER_DISCOUNT);
      break;
    case "cityPlayerGuardianOffer":
      if (source?.code === P.guardian && usable(source)) {
        const enemies = seatView(s, ownerOf(s, source)).engaged.filter((h) =>
          guardianEnemy(s, h),
        );
        if (enemies.length)
          choosePlayerResponse(
            s,
            source.id,
            P.guardian,
            "Guardian of Ithilien · Return an engaged enemy to staging",
            [
              ...enemies.map((h) => ({
                id: h.id,
                code: h.code,
                label: `Return ${name(h)} to staging`,
                effects: [
                  fx("cityPlayerGuardianReturn", {
                    source: source.id,
                    target: h.id,
                    player: ownerOf(s, source),
                  }),
                ],
              })),
              skip,
            ],
          );
      }
      break;
    case "cityPlayerGuardianReturn":
      if (
        u &&
        seatView(s, e.player ?? activeSeat(s)).engaged.some(
          (h) => h.id === u.id,
        ) &&
        guardianEnemy(s, u)
      ) {
        const controller = e.player ?? activeSeat(s);
        forOwner(s, controller, () => {
          s.engaged = s.engaged.filter((h) => h.id !== u.id);
        });
        s.encounterDiscard.push(...u.shadows);
        u.shadows = [];
        delete u.faceupShadows;
        u.revealedShadowCount = 0;
        if (u.facedownCard) {
          forOwner(s, u.owner ?? controller, () =>
            s.discard.push(u.facedownCard!),
          );
          for (const a of [...u.attachments]) discardAttachment(s, u, a, true);
        } else {
          u.attacked = false;
          s.staging.push(u);
          enemyAddedToStaging(s, u);
        }
        advanceDefense(s);
      }
      break;
    case "cityPlayerPresencePay": {
      const ids = e.ids ?? [],
        heroes = allHeroes(s);
      if (
        ids.length !== 2 ||
        !ids.every((id) =>
          heroes.some(
            (h) =>
              h.id === id &&
              h.resources >= ids.filter((i) => i === id).length &&
              hasResourceIcon(h, "leadership") &&
              heirsCanSpendResources(s, h),
          ),
        )
      )
        break;
      payThen(s, () => {
        spendResourcePayment(
          s,
          Object.fromEntries(
            [...new Set(ids)].map((id) => [
              id,
              ids.filter((i) => i === id).length,
            ]),
          ),
        );
      }, [fx("cityPlayerPresenceAttack", { value: e.value })]);
      break;
    }
    case "cityPlayerPresenceAttack":
      for (const h of allHeroes(s))
        if ((card(h.code).threat ?? 0) < e.value! && !playerCardImmune(h))
          h.tempAttack = (h.tempAttack ?? 0) + 2;
      break;
    default:
      return false;
  }
  return true;
}
