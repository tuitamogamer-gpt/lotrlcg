import assert from "node:assert/strict";
import { base as common } from "./against-shadow-final-fixtures";
import { applyAction, restoreSave, validateSave } from "../src/game/engine";
import { make } from "../src/game/core";
import { syncSeat } from "../src/game/table";
import { RAID as R } from "../src/game/raid-grey-havens-support";
import type { GameState } from "../src/game/types";
export function base(players = 1) {
  const s = common("raid-on-the-grey-havens", players);
  s.raidGreyHavens = {
    initialized: true,
    setAside: [make(s, R.sahir), make(s, R.naasiyah)],
    burned: [],
  };
  s.staging.push(make(s, R.burn), make(s, R.dream));
  return s;
}
export function second(players = 1) {
  const s = base(players);
  s.stage = 2;
  s.staging.push(...s.raidGreyHavens!.setAside.splice(0));
  return s;
}
export function reload(s: GameState) {
  syncSeat(s);
  const json = JSON.parse(JSON.stringify(s));
  assert.ok(validateSave(json), "save validates");
  const restored = restoreSave(json);
  assert.ok(restored);
  return restored;
}
export function pick(s: GameState, id: string) {
  assert.ok(
    s.choice?.options.some((o) => o.id === id),
    JSON.stringify(s.choice),
  );
  return applyAction(reload(s), { type: "CHOOSE", id });
}
export function settle(s: GameState) {
  for (let i = 0; s.choice && s.status === "playing"; i++) {
    assert.ok(i < 150, "choices terminate");
    s = pick(
      s,
      s.choice.options.find((o) => o.id === "skip")?.id ??
        s.choice.options[0].id,
    );
  }
  return s;
}
