import assert from "node:assert/strict";
import {
  base as fixture,
  choose,
  reload,
} from "./against-shadow-final-fixtures";
import { applyAction, createGame } from "../src/game/engine";
import { STARTERS } from "../src/game/cards";
import { get, make } from "../src/game/core";
import { flush, handle } from "../src/game/effects";
import { playerOrder, forOwner } from "../src/game/table";
import { CARN as C } from "../src/game/carn-dum-support";
import type { GameState, Unit } from "../src/game/types";

export { choose, reload };
export function base(players = 1) {
  const s = fixture("the-battle-of-carn-dum", players);
  s.carnDum = {
    initialized: true,
    furiousRound: -1,
    furiousPenalty: 0,
    terrorRound: -1,
    terrorThreat: 0,
    threeShadowIds: [],
  };
  for (const player of playerOrder(s))
    forOwner(s, player, () => {
      s.deck = Array(30).fill("01057");
    });
  s.staging.push(make(s, C.thaurdir));
  return s;
}
export function boss(s: GameState) {
  return s.staging.find((u) => u.code === C.thaurdir)!;
}
export function second(s = base(), progress = 0) {
  s.stage = 2;
  s.progress = progress;
  boss(s).flipped = true;
  return s;
}
export function staged(s: GameState, code: string) {
  const u = make(s, code);
  s.staging.push(u);
  return u;
}
export function enemy(s: GameState, code = C.garrison, player = 0) {
  const u = make(s, code);
  forOwner(s, player, () => s.engaged.push(u));
  return u;
}
export function ally(s: GameState, code = "01016", player = 0) {
  let u!: Unit;
  forOwner(s, player, () => {
    u = make(s, code);
    s.allies.push(u);
  });
  return u;
}
export function start(players = 1, easy = false) {
  const d = STARTERS[0];
  let s = createGame(19, d.cards, d.heroes, d.id, {
    scenarioId: "the-battle-of-carn-dum",
    easy,
    ...(players > 1
      ? {
          seats: STARTERS.slice(0, players).map((d) => ({
            deckId: d.id,
            heroes: [...d.heroes],
          })),
        }
      : {}),
  });
  for (let i = 0; s.phase === "setup"; i++) {
    assert.ok(i < 160, "opening decisions terminate");
    s = applyAction(
      reload(s),
      s.choice
        ? { type: "CHOOSE", id: s.choice.options[0].id }
        : { type: "KEEP" },
    );
  }
  return settle(s);
}
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 180, "pending decisions terminate and survive saving");
    s = choose(
      reload(s),
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
export function finish(s: GameState) {
  flush(s);
  return settle(s);
}
export function defend(s: GameState, e: Unit, d?: Unit) {
  s.phase = "defense";
  return applyAction(reload(s), {
    type: "DEFEND",
    enemyId: e.id,
    defenderId: d?.id ?? null,
  });
}
export function target(s: GameState, id: string, amount?: number) {
  const option = s.choice?.options.find(
    (o) =>
      o.id === id ||
      o.effects.some(
        (e) =>
          e.target === id &&
          (amount === undefined || e.value === amount || e.count === amount),
      ),
  );
  assert.ok(option, JSON.stringify(s.choice));
  return choose(reload(s), option.id);
}

/** Browser fixtures keep the physical boss in staging and use actual queued flip/attack rules. */
export function browserCaptain() {
  const s = base();
  staged(s, C.garrison).shadows = ["01099"];
  boss(s).shadows = ["01099", "01099"];
  return reload(s);
}
export function browserChampion() {
  const s = second(base(2));
  boss(s).damage = 3;
  boss(s).shadows = ["01099", "01099"];
  return reload(s);
}
export function browserFlipChoice() {
  const s = browserCaptain();
  boss(s).shadows = ["01099"];
  handle(s, { kind: "carnFlip", target: boss(s).id, player: 0 });
  flush(s);
  assert.ok(
    s.choice?.title.includes("Immediate attack"),
    JSON.stringify(s.choice),
  );
  assert.equal(get(s, boss(s).id)?.flipped, true);
  return reload(s);
}
