import test from "node:test";
import assert from "node:assert/strict";
import { runGreyHavensGame } from "./grey-havens-simulation-driver";

for (const easy of [false, true])
  test(`The Thing in the Depths ${easy ? "easy" : "normal"}: every review mode preserves complete 1–4 player games with restoration after every action`, (t) => {
    const outcomes = { won: 0, lost: 0 };
    const observed = new Set<string>();
    for (const players of [1, 2, 3, 4]) {
      const immediate = runGreyHavensGame(
        "the-thing-in-the-depths",
        easy,
        players,
        11,
      );
      outcomes[immediate.state.status as "won" | "lost"]++;
      for (const entry of immediate.observed) observed.add(entry);
      for (const review of ["all", "hidden", "decisions"] as const) {
        const { flow, ...paced } = runGreyHavensGame(
          "the-thing-in-the-depths",
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
    assert.ok(
      observed.has("action:DEFEND"),
      "complete games include real enemy attacks",
    );
    t.diagnostic(JSON.stringify({ outcomes, decisions: observed.size }));
  });
