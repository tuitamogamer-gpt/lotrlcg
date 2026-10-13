import type { Effect, GameState, Option, Unit } from "./types";
import { COBAS_PLAYER as P } from "./cobas-player-support";
import { name } from "./cards";
import { choose, draw, fx, get, prepend, spendResources } from "./core";
import {
  activeSeat,
  allHeroes,
  ownerOf,
  playerOrder,
  seatName,
  seatView,
} from "./table";
import { hasResourceIcon } from "./expansion-passives";
import { heirsCanSpendResources } from "./heirs-numenor";
import { playerCardImmune } from "./card-immunity";

const BOOST = "combat:cobas:";
const KNIFE = "phase:cobas-knife:";
const seats = (s: GameState) =>
  s.table ? s.table.seats.map((_, p) => seatView(s, p)) : [s];
const knifeEnemies = (s: GameState, player: number) =>
  seatView(s, player).engaged;
const knifePlayers = (s: GameState) =>
  playerOrder(s).filter((p) =>
    knifeEnemies(s, p).some((u) => !playerCardImmune(u)),
  );
const lorePayers = (s: GameState) =>
  allHeroes(s).filter(
    (h) =>
      h.resources > 0 &&
      hasResourceIcon(h, "lore") &&
      heirsCanSpendResources(s, h),
  );

export function cobasPlayerPlayProblem(s: GameState, u: Unit) {
  if (u.code === P.terrible)
    return "Terrible to Behold uses the Noble defender declaration response window.";
  if (u.code === P.knife && !knifePlayers(s).length)
    return "Knife-work needs an engaged enemy that can be affected.";
  return null;
}
export function cobasPlayerEvent(s: GameState, code: string) {
  if (code !== P.knife) return false;
  const options = knifePlayers(s).map((player) => ({
    id: `player-${player}`,
    label: seatName(s, player),
    effects: [fx("cobasPlayerKnifeReduce", { value: player })],
  }));
  choose(s, "Knife-work · Choose a player", options);
  return true;
}
export function cobasPlayerAttackEffects(
  s: GameState,
  enemy: Unit,
  ids: string[],
): Effect[] {
  return ids.flatMap((id) =>
    get(s, id)?.code === P.naasiyah
      ? [
          fx("cobasPlayerNaasiyahWindow", {
            target: id,
            source: enemy.id,
            flag: true,
            player: ownerOf(s, get(s, id)!),
          }),
        ]
      : [],
  );
}
export function cobasPlayerDefendersDeclared(
  s: GameState,
  enemy: Unit,
  defenders: Unit[],
): Effect[] {
  return defenders
    .filter((u) => u.code === P.naasiyah)
    .map((u) =>
      fx("cobasPlayerNaasiyahWindow", {
        target: u.id,
        source: enemy.id,
        flag: false,
        player: ownerOf(s, u),
      }),
    );
}
/** Each increment retains its exact attack so repeated/extra attacks clear independently. */
export function cobasPlayerAttackFinished(
  s: GameState,
  enemyId: string,
  playerAttack: boolean,
) {
  for (const seat of seats(s)) {
    const kept = seat.used.filter((key) => {
      if (!key.startsWith(BOOST)) return true;
      const [enemy, attacking, character, stat] = JSON.parse(
        key.slice(BOOST.length),
      ) as [string, boolean, string, "attack" | "defense"];
      if (enemy !== enemyId || attacking !== playerAttack) return true;
      const u = get(s, character);
      if (u && stat === "attack") u.tempAttack = (u.tempAttack ?? 0) - 2;
      if (u && stat === "defense") u.tempDefense = (u.tempDefense ?? 0) - 2;
      return false;
    });
    // seatView is a projection for a remote player; mutate the shared list.
    seat.used.splice(0, seat.used.length, ...kept);
  }
}
export function cobasPlayerAttackKilled(s: GameState) {
  const player = activeSeat(s);
  const count = seats(s)
    .flatMap((seat) => seat.used)
    .filter((key) => key === `${KNIFE}${player}`).length;
  // A player attacks when declaring this attack; contributing Ranged characters
  // to another player's attack does not make them its initiating player.
  if (count) prepend(s, fx("cobasPlayerKnifeDraw", { value: count, player }));
}
/** A lasting event also expires if its initiating player was eliminated. */
export function cobasPlayerPhaseEnd(s: GameState) {
  for (const seat of seats(s)) {
    const kept = seat.used.filter((key) => !key.startsWith(KNIFE));
    seat.used.splice(0, seat.used.length, ...kept);
  }
}
function naasiyahWindow(s: GameState, e: Effect) {
  const u = get(s, e.target);
  if (
    !u ||
    u.code !== P.naasiyah ||
    u.blanked ||
    ownerOf(s, u) !== e.player ||
    !get(s, e.source)
  )
    return;
  const options: Option[] = [
    { id: "continue", label: "Continue the attack", effects: [] },
  ];
  if (u.resources > 0 && heirsCanSpendResources(s, u))
    for (const stat of ["attack", "defense"] as const)
      options.push({
        id: stat,
        label: `Spend 1 Na'asiyah resource · +2 ${stat} for this attack`,
        code: u.code,
        ability: {
          player: ownerOf(s, u),
          source: u.id,
          code: u.code,
          type: "action",
        },
        effects: [{ ...e, kind: "cobasPlayerNaasiyahBoost", text: stat }, e],
      });
  if (options.length > 1) choose(s, "Na'asiyah · Combat actions", options);
}
function knifePaymentOptions(s: GameState, chosen: number): Option[] {
  const heroes = lorePayers(s),
    options: Option[] = [];
  for (let i = 0; i < heroes.length; i++) {
    const a = heroes[i];
    if (a.resources >= 2)
      options.push({
        id: `pay-${a.id}`,
        label: `${seatName(s, ownerOf(s, a))} · ${name(a)}: 2 Lore`,
        code: a.code,
        effects: [
          fx("cobasPlayerKnifePay", { ids: [a.id, a.id], value: chosen }),
        ],
      });
    for (const b of heroes.slice(i + 1))
      options.push({
        id: `pay-${a.id}-${b.id}`,
        label: `${name(a)} + ${name(b)}: 1 Lore each`,
        effects: [
          fx("cobasPlayerKnifePay", { ids: [a.id, b.id], value: chosen }),
        ],
      });
  }
  return options;
}
export function cobasPlayerEffect(s: GameState, e: Effect) {
  if (!e.kind.startsWith("cobasPlayer")) return false;
  const u = get(s, e.target);
  switch (e.kind) {
    case "cobasPlayerNaasiyahWindow":
      naasiyahWindow(s, e);
      break;
    case "cobasPlayerNaasiyahBoost": {
      if (
        !u ||
        u.code !== P.naasiyah ||
        u.blanked ||
        ownerOf(s, u) !== e.player ||
        !get(s, e.source) ||
        u.resources < 1 ||
        !heirsCanSpendResources(s, u)
      )
        break;
      const tail = s.queue;
      s.queue = [];
      spendResources(s, u, 1);
      s.queue.push({ ...e, kind: "cobasPlayerNaasiyahResolve" }, ...tail);
      break;
    }
    case "cobasPlayerNaasiyahResolve":
      if (
        u &&
        get(s, e.source) &&
        (e.text === "attack" || e.text === "defense")
      ) {
        if (e.text === "attack") u.tempAttack = (u.tempAttack ?? 0) + 2;
        else u.tempDefense = (u.tempDefense ?? 0) + 2;
        seatView(s, ownerOf(s, u)).used.push(
          BOOST + JSON.stringify([e.source, !!e.flag, u.id, e.text]),
        );
      }
      break;
    case "cobasPlayerKnifeReduce": {
      const player = e.value!,
        enemies = knifeEnemies(s, player);
      let affected = 0;
      for (const enemy of enemies)
        if (!playerCardImmune(enemy)) {
          enemy.tempDefense = (enemy.tempDefense ?? 0) - 1;
          affected++;
        }
      if (affected && affected === enemies.length) {
        const options = knifePaymentOptions(s, player);
        if (options.length)
          choose(s, "Knife-work · Group may spend 2 Lore", [
            { id: "skip", label: "Decline extra payment", effects: [] },
            ...options,
          ]);
      }
      break;
    }
    case "cobasPlayerKnifePay": {
      const ids = e.ids ?? [],
        heroes = lorePayers(s);
      if (
        ids.length !== 2 ||
        !ids.every((id) =>
          heroes.some(
            (h) =>
              h.id === id && h.resources >= ids.filter((i) => i === id).length,
          ),
        )
      )
        break;
      const tail = s.queue;
      s.queue = [];
      for (const id of [...new Set(ids)])
        spendResources(s, get(s, id)!, ids.filter((i) => i === id).length);
      s.queue.push(
        fx("cobasPlayerKnifeEnable", { value: e.value, player: e.player }),
        ...tail,
      );
      break;
    }
    case "cobasPlayerKnifeEnable":
      if (playerOrder(s).includes(e.value!)) s.used.push(`${KNIFE}${e.value}`);
      break;
    case "cobasPlayerKnifeDraw":
      draw(s, e.value ?? 1);
      break;
    default:
      return false;
  }
  return true;
}
