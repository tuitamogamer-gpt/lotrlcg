import { reduceThreat } from "./threat-reduction";
import { canGainResources } from "./core";
import { takePlayerDeck } from "./core";
// Exact active and triggered rules for the official Defenders of Gondor starter.
import { card, name } from "./cards";
import type { Effect, GameState, Option, Unit } from "./types";
import {
  canPay,
  choose,
  draw,
  fx,
  get,
  log,
  opts,
  playCost,
  prepend,
  requireRule,
  shuffle,
  skip,
} from "./core";
import { exhaustCharacter, readyCharacter, spendEvent } from "./board";
import { isSacked } from "./carrock";
import { druadanPlayerResourcesGained } from "./druadan-player-cards";
import { hasTrait } from "./expansion-passives";
import {
  allHeroes,
  eachSeat,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";

const livingDefenders = (s: GameState) =>
  (s.combat?.defenderIds ?? (s.combat?.defenderId ? [s.combat.defenderId] : []))
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && hasTrait(u, "Gondor"));
const readyImrahils = (s: GameState) =>
  allHeroes(s).filter(
    (u) =>
      u.code === "02050" &&
      !u.blanked &&
      u.exhausted &&
      !isSacked(u) &&
      !seatView(s, ownerOf(s, u)).used.includes(`round:imrahil:${u.id}`),
  );

function cardResources(
  s: GameState,
  target: Unit,
  value: number,
  transfer = false,
) {
  if (!canGainResources(s, target, true, transfer)) return;
  target.resources += value;
  gondorResourcesGained(s, target, value, true);
}
function moveDonorOptions(s: GameState, source?: string): Option[] {
  return opts(
    s.heroes.filter(
      (h) =>
        h.resources > 0 &&
        allHeroes(s).some(
          (other) =>
            other.id !== h.id && canGainResources(s, other, true, true),
        ),
    ),
    (h) => [fx("gondorMoveDestination", { target: h.id, source })],
  );
}
function soldierSearch(s: GameState, count: number, anyNumber: boolean) {
  const options = s.deck.slice(0, count).flatMap((code, index) => {
    const c = card(code);
    return c.type_code === "ally" &&
      (c.traits ?? "").split(".").some((t) => t.trim() === "Gondor")
      ? [
          {
            id: `soldier-search-${index}`,
            label: c.name,
            code,
            effects: [
              fx("gondorSoldierTake", {
                code,
                value: index,
                count,
                flag: anyNumber,
              }),
            ],
          },
        ]
      : [];
  });
  if (!options.length) {
    shuffle(s, s.deck);
    return;
  }
  choose(
    s,
    "Soldier of Gondor",
    [
      ...options,
      {
        id: "skip",
        label: "Finish searching and shuffle the deck",
        effects: [fx("gondorSearchFinish")],
      },
    ],
    anyNumber
      ? "Valour: choose any number of Gondor allies from the original top five."
      : "Choose one Gondor ally from the top five, or finish without taking one.",
  );
}

export function gondorEventEffect(
  s: GameState,
  code: string,
  target?: string,
): boolean {
  switch (code) {
    case "22003": {
      const increase = 40 - s.threat;
      if (increase < 0) reduceThreat(s, -increase, code);
      else s.threat = 40;
      if (increase > 0) draw(s, increase >= 10 ? 4 : 1);
      return true;
    }
    case "22029":
      eachSeat(s, () => {
        if (s.threat >= 40)
          for (const u of [...s.heroes, ...s.allies]) readyCharacter(s, u);
      });
      return true;
    case "05008": {
      const defender = livingDefenders(s).find((u) => u.id === target);
      requireRule(
        defender,
        "Behind Strong Walls requires a defending Gondor character.",
      );
      readyCharacter(s, defender);
      defender.tempDefense = (defender.tempDefense ?? 0) + 1;
      return true;
    }
    default:
      return false;
  }
}
export function gondorPlayProblem(s: GameState, code: string): string | null {
  if (code === "22003" && s.threat === 40)
    return "Pillars of the Kings would not change your threat.";
  if (
    code === "22029" &&
    !playerOrder(s).some((i) => {
      const p = seatView(s, i);
      return (
        p.threat >= 40 && [...p.heroes, ...p.allies].some((u) => u.exhausted)
      );
    })
  )
    return "Need Drives Them requires an exhausted character controlled by a player at 40 threat or higher.";
  if (code === "05008" && !livingDefenders(s).length)
    return "Behind Strong Walls requires a defending Gondor character.";
  return null;
}
export function gondorPlayTargets(s: GameState, code: string): Unit[] | null {
  return code === "05008" ? livingDefenders(s) : null;
}
export const gondorAbilityLabel = (code: string) =>
  code === "05003" ? "Move a hero resource" : undefined;
export function gondorAbilityProblem(
  s: GameState,
  u: Unit,
): string | undefined {
  if (u.code === "05003") {
    if (u.exhausted) return "Errand-rider must be ready.";
    if (!moveDonorOptions(s).length)
      return "A hero you control needs a resource and another hero must be in play.";
  }
  return undefined;
}
export function useGondorAbility(s: GameState, u: Unit): boolean {
  if (u.code !== "05003") return false;
  requireRule(!gondorAbilityProblem(s, u), gondorAbilityProblem(s, u) ?? "");
  choose(s, "Errand-rider · Choose a donor", moveDonorOptions(s, u.id));
  return true;
}

export function gondorAllyEntered(s: GameState, u: Unit) {
  if (["22002", "06135", "05018"].includes(u.code))
    prepend(
      s,
      fx("gondorAllyResponse", {
        target: u.id,
        code: u.code,
        player: ownerOf(s, u),
      }),
    );
}
export function gondorLeavesPlay(s: GameState, u: Unit, controller: number) {
  const effects: Effect[] = [];
  if (u.code === "06108" && !u.blanked)
    effects.push(fx("gondorSquireResponse", { player: controller }));
  for (const hero of readyImrahils(s))
    effects.push(
      fx("gondorImrahilResponse", {
        target: hero.id,
        player: ownerOf(s, hero),
      }),
    );
  prepend(s, ...effects);
}
export function gondorResourcesGained(
  s: GameState,
  hero: Unit,
  amount: number,
  cardEffect: boolean,
) {
  druadanPlayerResourcesGained(s, hero, amount, cardEffect);
  if (
    amount > 0 &&
    cardEffect &&
    hero.exhausted &&
    hero.attachments.some(
      (a) => a.code === "08113" && !a.exhausted && !a.blanked,
    )
  )
    prepend(
      s,
      fx("gondorHeirResponse", { target: hero.id, player: ownerOf(s, hero) }),
    );
}
export function gondorEnemyEngaged(
  s: GameState,
  _enemy: Unit,
  player: number,
  optional: boolean,
) {
  const hero = seatView(s, player).heroes.find(
    (h) => h.code === "08084" && !h.blanked && !isSacked(h),
  );
  const effects: Effect[] = [];
  if (hero && !seatView(s, player).used.includes(`phase:mablung:${hero.id}`))
    effects.push(fx("gondorMablungResponse", { target: hero.id, player }));
  if (optional) effects.push(fx("gondorCaptainWindow", { player }));
  prepend(s, ...effects);
}
export function gondorRoundStats(s: GameState, u: Unit) {
  const count = seatView(s, ownerOf(s, u)).used.filter(
    (key) => key === `round:captain:${u.id}`,
  ).length;
  return { attack: count, defense: count };
}
export function gondorAttackKilled(s: GameState, attackerIds: string[]) {
  prepend(s, fx("gondorFoeHammerWindow", { ids: attackerIds }));
}
export function gondorDefenseWindow(s: GameState, defenderIds: string[]) {
  const defenders = defenderIds
    .map((id) => get(s, id))
    .filter((u): u is Unit => !!u && hasTrait(u, "Gondor"));
  const options = playerOrder(s).flatMap((player) => {
    const p = seatView(s, player);
    if (!p.hand.some((u) => u.code === "05008") || !canPay(p, card("05008")))
      return [];
    return defenders.map((defender) => ({
      id: `walls-${player}-${defender.id}`,
      code: "05008",
      label: `Behind Strong Walls · ${name(defender)} · ${playCost(p, card("05008"))} Tactics${s.table ? ` · ${seatName(s, player)}` : ""}`,
      effects: [
        fx("gondorStrongWalls", {
          target: defender.id,
          player,
          ids: defenderIds,
        }),
      ],
    }));
  });
  if (options.length)
    choose(s, "Combat action window · Behind Strong Walls", [...options, skip]);
}

export function handleGondorPlayerEffect(s: GameState, e: Effect): boolean {
  switch (e.kind) {
    case "gondorAllyResponse": {
      const u = get(s, e.target);
      if (!u || u.code !== e.code) return true;
      if (u.code === "22002" && s.deck.length)
        choose(s, "Soldier of Gondor", [
          {
            id: "search",
            label: "Search the top five cards for Gondor allies",
            code: u.code,
            effects: [fx("gondorSoldierSearch")],
          },
          skip,
        ]);
      if (u.code === "06135" && moveDonorOptions(s).length)
        choose(s, "Pelargir Ship Captain", [
          {
            id: "move",
            label: "Move one resource between hero pools",
            code: u.code,
            effects: [fx("gondorMoveDonor")],
          },
          skip,
        ]);
      if (u.code === "05018") {
        const targets = allHeroes(s).filter(
          (h) =>
            canGainResources(s, h) &&
            (hasTrait(h, "Gondor") || hasTrait(h, "Noble")),
        );
        if (targets.length)
          choose(s, "Envoy of Pelargir", [
            ...opts(targets, (h) => [
              fx("gondorAddResource", { target: h.id }),
            ]),
            skip,
          ]);
      }
      return true;
    }
    case "gondorSoldierSearch":
      soldierSearch(s, Math.min(5, s.deck.length), s.threat >= 40);
      return true;
    case "gondorSoldierTake": {
      const index = e.value ?? -1,
        count = e.count ?? 0;
      const c = e.code ? card(e.code) : undefined;
      requireRule(
        index >= 0 &&
          index < count &&
          s.deck[index] === e.code &&
          c?.type_code === "ally" &&
          (c.traits ?? "").split(".").some((t) => t.trim() === "Gondor"),
        "That Gondor ally is not in the searched portion of the deck.",
      );
      const physical = takePlayerDeck(s, index);
      s.hand.push(physical);
      if (e.flag) soldierSearch(s, count - 1, true);
      else shuffle(s, s.deck);
      return true;
    }
    case "gondorSearchFinish":
      shuffle(s, s.deck);
      return true;
    case "gondorMoveDonor":
      if (moveDonorOptions(s).length)
        choose(s, "Move a resource · Choose a donor", [
          ...moveDonorOptions(s),
          skip,
        ]);
      return true;
    case "gondorMoveDestination": {
      const donor = s.heroes.find((h) => h.id === e.target && h.resources > 0);
      requireRule(
        donor,
        "The donor must be a hero you control with a resource.",
      );
      choose(
        s,
        "Move a resource · Choose a recipient",
        opts(
          allHeroes(s).filter(
            (h) => h.id !== donor.id && canGainResources(s, h, true, true),
          ),
          (h) => [
            fx("gondorMoveResource", {
              target: h.id,
              source: donor.id,
              text: e.source,
            }),
          ],
        ),
      );
      return true;
    }
    case "gondorMoveResource": {
      const donor = s.heroes.find((h) => h.id === e.source && h.resources > 0),
        recipient = allHeroes(s).find((h) => h.id === e.target);
      const errand = e.text ? get(s, e.text) : undefined;
      requireRule(
        donor &&
          recipient &&
          canGainResources(s, recipient, true, true) &&
          recipient.id !== donor.id &&
          (!e.text || (errand?.code === "05003" && !errand.exhausted)),
        "The resource transfer is no longer legal.",
      );
      if (errand) exhaustCharacter(s, errand);
      donor.resources--;
      cardResources(s, recipient, 1, true);
      log(s, `Moved 1 resource from ${name(donor)} to ${name(recipient)}.`);
      return true;
    }
    case "gondorAddResource": {
      const hero = allHeroes(s).find((h) => h.id === e.target);
      if (hero) cardResources(s, hero, 1);
      return true;
    }
    case "gondorSquireResponse": {
      const targets = allHeroes(s).filter(
        (h) => hasTrait(h, "Gondor") && canGainResources(s, h),
      );
      if (targets.length)
        choose(s, "Squire of the Citadel", [
          ...opts(targets, (h) => [fx("gondorAddResource", { target: h.id })]),
          skip,
        ]);
      return true;
    }
    case "gondorImrahilResponse": {
      const hero = readyImrahils(s).find((h) => h.id === e.target);
      if (hero)
        choose(s, "Prince Imrahil", [
          {
            id: "ready-imrahil",
            label: "Ready Prince Imrahil",
            code: hero.code,
            effects: [fx("gondorImrahilReady", { target: hero.id })],
          },
          skip,
        ]);
      return true;
    }
    case "gondorImrahilReady": {
      const hero = readyImrahils(s).find((h) => h.id === e.target);
      requireRule(hero, "Prince Imrahil can respond only once per round.");
      readyCharacter(s, hero);
      s.used.push(`round:imrahil:${hero.id}`);
      return true;
    }
    case "gondorHeirResponse": {
      const hero = get(s, e.target);
      const options = hero?.exhausted
        ? hero.attachments
            .filter((a) => a.code === "08113" && !a.exhausted && !a.blanked)
            .map((a) => ({
              id: a.id,
              label: "Exhaust Heir of Mardil to ready its hero",
              code: a.code,
              effects: [
                fx("gondorHeirReady", { target: hero.id, source: a.id }),
              ],
            }))
        : [];
      if (options.length) choose(s, "Heir of Mardil", [...options, skip]);
      return true;
    }
    case "gondorHeirReady": {
      const hero = get(s, e.target),
        a = hero?.attachments.find(
          (a) =>
            a.id === e.source &&
            a.code === "08113" &&
            !a.exhausted &&
            !a.blanked,
        );
      requireRule(
        hero?.exhausted && a,
        "Heir of Mardil must be ready and its hero exhausted.",
      );
      a.exhausted = true;
      readyCharacter(s, hero);
      return true;
    }
    case "gondorMablungResponse": {
      const hero = s.heroes.find(
        (h) =>
          h.id === e.target && h.code === "08084" && !h.blanked && !isSacked(h),
      );
      if (hero && !s.used.includes(`phase:mablung:${hero.id}`))
        choose(s, "Mablung", [
          {
            id: "mablung-resource",
            label: "Add 1 resource to Mablung",
            code: hero.code,
            effects: [fx("gondorMablungResource", { target: hero.id })],
          },
          skip,
        ]);
      return true;
    }
    case "gondorMablungResource": {
      const hero = s.heroes.find(
        (h) =>
          h.id === e.target && h.code === "08084" && !h.blanked && !isSacked(h),
      );
      requireRule(
        hero && !s.used.includes(`phase:mablung:${hero.id}`),
        "Mablung may respond only once per phase.",
      );
      s.used.push(`phase:mablung:${hero.id}`);
      cardResources(s, hero, 1);
      return true;
    }
    case "gondorCaptainWindow": {
      const options = s.heroes.flatMap((hero) =>
        hero.attachments
          .filter((a) => a.code === "08140" && !a.exhausted && !a.blanked)
          .map((a) => ({
            id: a.id,
            label: `Exhaust Captain of Gondor · ${name(hero)}`,
            code: a.code,
            effects: [
              fx("gondorCaptainBoost", { target: hero.id, source: a.id }),
              fx("gondorCaptainWindow"),
            ],
          })),
      );
      if (options.length)
        choose(s, "Captain of Gondor · Optional engagement", [
          ...options,
          skip,
        ]);
      return true;
    }
    case "gondorCaptainBoost": {
      const hero = s.heroes.find((h) => h.id === e.target),
        a = hero?.attachments.find(
          (a) =>
            a.id === e.source &&
            a.code === "08140" &&
            !a.exhausted &&
            !a.blanked,
        );
      requireRule(hero && a, "Captain of Gondor must be ready.");
      a.exhausted = true;
      s.used.push(`round:captain:${hero.id}`);
      return true;
    }
    case "gondorFoeHammerWindow": {
      const attackers = (e.ids ?? [])
        .map((id) => get(s, id))
        .filter((u): u is Unit => !!u && card(u.code).type_code === "hero");
      const options = playerOrder(s).flatMap((player) => {
        const p = seatView(s, player);
        if (
          !p.hand.some((u) => u.code === "131015") ||
          !canPay(p, card("131015"))
        )
          return [];
        return attackers
          .filter((u) => ownerOf(s, u) === player)
          .flatMap((hero) =>
            hero.attachments
              .filter(
                (a) =>
                  !a.exhausted &&
                  !a.blanked &&
                  (card(a.code).traits ?? "")
                    .split(".")
                    .some((t) => t.trim() === "Weapon"),
              )
              .map((a) => ({
                id: `foe-hammer-${a.id}`,
                label: `Play Foe-hammer · Exhaust ${card(a.code).name} on ${name(hero)}${s.table ? ` · ${seatName(s, player)}` : ""}`,
                code: "131015",
                effects: [
                  fx("gondorFoeHammer", {
                    target: hero.id,
                    source: a.id,
                    ids: e.ids,
                    player,
                  }),
                ],
              })),
          );
      });
      if (options.length)
        choose(s, "Foe-hammer · Enemy destroyed by a hero", [...options, skip]);
      return true;
    }
    case "gondorFoeHammer": {
      const hero = s.heroes.find(
          (u) => u.id === e.target && card(u.code).type_code === "hero",
        ),
        weapon = hero?.attachments.find(
          (a) =>
            a.id === e.source &&
            !a.exhausted &&
            !a.blanked &&
            (card(a.code).traits ?? "")
              .split(".")
              .some((t) => t.trim() === "Weapon"),
        );
      requireRule(
        hero && weapon && e.ids?.includes(hero.id),
        "Foe-hammer requires a ready Weapon on a hero that attacked and destroyed the enemy.",
      );
      weapon.exhausted = true;
      if (!spendEvent(s, "131015")) return true;
      draw(s, 3);
      prepend(s, fx("gondorFoeHammerWindow", { ids: e.ids }));
      return true;
    }
    case "gondorDefenseWindow":
      gondorDefenseWindow(s, e.ids ?? []);
      return true;
    case "gondorStrongWalls": {
      const defender = livingDefenders(s).find((u) => u.id === e.target);
      requireRule(
        defender,
        "Behind Strong Walls requires a surviving defending Gondor character.",
      );
      if (!spendEvent(s, "05008")) return true;
      gondorEventEffect(s, "05008", defender.id);
      prepend(s, fx("gondorDefenseWindow", { ids: e.ids }));
      return true;
    }
    default:
      return false;
  }
}
