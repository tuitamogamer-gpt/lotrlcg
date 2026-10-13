import assert from "node:assert/strict";

/** A targeted debug run must still execute a complete, restored game. */
export function hotseatCaseSelector(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!/^(normal|easy)\/[1-4]\/[1-8]$/.test(value))
    throw Error(
      `Invalid LOTR_HOTSEAT_CASE ${JSON.stringify(value)}: expected normal|easy / players 1–4 / seed 1–8, for example normal/1/1.`,
    );
  return value;
}

export function assertHotseatGameCounts(
  scenarioId: string,
  selector: string | undefined,
  supportsEasy: boolean,
  outcomes: {
    normal: { won: number; lost: number };
    easy: { won: number; lost: number };
  },
) {
  const normal = outcomes.normal.won + outcomes.normal.lost;
  const easy = outcomes.easy.won + outcomes.easy.lost;
  if (selector) {
    if (selector.startsWith("easy/") && !supportsEasy)
      throw Error(
        `LOTR_HOTSEAT_CASE ${selector} selects no available games for ${scenarioId}: this matrix only registers normal difficulty.`,
      );
    assert.equal(
      normal + easy,
      1,
      `LOTR_HOTSEAT_CASE ${selector} must complete exactly one game for ${scenarioId}; an empty selection cannot pass`,
    );
    assert.equal(normal, selector.startsWith("normal/") ? 1 : 0);
    assert.equal(easy, selector.startsWith("easy/") ? 1 : 0);
  } else {
    assert.equal(normal, 32, `${scenarioId}: all 32 normal games complete`);
    assert.equal(easy, supportsEasy ? 32 : 0, `${scenarioId}: easy game count`);
  }
}
