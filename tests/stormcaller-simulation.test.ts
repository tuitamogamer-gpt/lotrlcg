import test from "node:test";
import assert from "node:assert/strict";
import { runGreyHavensGame } from "./grey-havens-simulation-driver";

for (const easy of [false, true])
  test(`Flight of the Stormcaller ${easy ? "easy" : "normal"}: every review mode preserves complete 1–4 player games with restoration after every action`, (t) => {
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    for (const players of [1, 2, 3, 4]) {
      const immediate = runGreyHavensGame(
        "flight-of-the-stormcaller",
        easy,
        players,
        11,
      );
      outcomes[immediate.state.status as "won" | "lost"]++;
      for (const entry of immediate.observed) observed.add(entry);
      for (const review of ["all", "hidden", "decisions"] as const) {
        const { flow, ...paced } = runGreyHavensGame(
          "flight-of-the-stormcaller",
          easy,
          players,
          11,
          review,
        ).state;
        assert.deepEqual(
          paced,
          immediate.state,
          `${players} players / ${review}`,
        );
        assert.equal(flow!.mode, review);
        assert.equal(flow!.pending, null);
      }
    }
    assert.ok(observed.has("choice:Sailing test · Commit characters"));
    assert.ok(observed.has("action:RESOLVE_SAILING"));
    assert.ok(
      observed.has("action:DEFEND"),
      "complete games include real enemy attacks",
    );
    t.diagnostic(JSON.stringify({ outcomes, decisions: observed.size }));
  });
