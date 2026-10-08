import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { BUILT_IN_DECKS } from "../src/game/built-in-decks";
import { SCENARIOS } from "../src/game/scenarios";

test("account database enforces ownership on reads, writes, upserts and deletes", async () => {
  const db = new PGlite();
  const alice = "11111111-1111-4111-8111-111111111111";
  const bob = "22222222-2222-4222-8222-222222222222";
  const choices = {
    version: 1,
    setupMode: "classic",
    selectedDeck: "lore",
    seatDecks: ["lore"],
    playMode: "normal",
    scenario: "anduin",
  };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;`);
    await db.query("insert into auth.users(id) values ($1),($2)", [alice, bob]);
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(file, migrations), "utf8"));
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from public.fellowship_choices"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "insert into public.fellowship_choices(user_id,choices) values ($1,$2)",
        [alice, choices],
      ),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('test.uid',$1,false)", [alice]);
    await db.query(
      "insert into public.fellowship_choices(user_id,choices) values ($1,$2)",
      [alice, choices],
    );
    await assert.rejects(
      db.query(
        "insert into public.fellowship_choices(user_id,choices) values ($1,$2)",
        [bob, choices],
      ),
      /row-level security/,
    );
    await db.query("select set_config('test.uid',$1,false)", [bob]);
    assert.equal(
      (await db.query("select * from public.fellowship_choices")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update public.fellowship_choices set choices=$1 where user_id=$2 returning user_id",
          [choices, alice],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "delete from public.fellowship_choices where user_id=$1 returning user_id",
          [alice],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.fellowship_choices(user_id,choices) values ($1,$2) on conflict(user_id) do update set choices=excluded.choices",
        [alice, choices],
      ),
      /row-level security/,
    );
    await db.query(
      "insert into public.fellowship_choices(user_id,choices) values ($1,$2) on conflict(user_id) do update set choices=excluded.choices",
      [bob, { ...choices, selectedDeck: "spirit" }],
    );
    assert.equal(
      (await db.query("select * from public.fellowship_choices")).rows.length,
      1,
    );
    await assert.rejects(
      db.query(
        "update public.fellowship_choices set user_id=$1 where user_id=$2",
        [alice, bob],
      ),
      /row-level security/,
    );
    for (const malformed of [
      { ...choices, setupMode: null },
      { ...choices, seatDecks: ["lore", "lore"] },
      { ...choices, seatDecks: [] },
      { ...choices, version: 2 },
      { ...choices, selectedDeck: "custom" },
      { ...choices, selectedDeck: "starter-unknown" },
      { ...choices, seatDecks: ["starter-rohan", "starter-rohan"] },
      { ...choices, seatDecks: [null] },
      { ...choices, seatDecks: "starter-rohan" },
      { ...choices, scenario: "unknown" },
      { ...choices, scenario: "the-weather-hill" },
      { ...choices, scenario: "deadmen-s-dike" },
    ]) {
      await assert.rejects(
        db.query(
          "update public.fellowship_choices set choices=$1 where user_id=$2",
          [malformed, bob],
        ),
        /valid_choices/,
      );
    }
    for (const id of [...BUILT_IN_DECKS.map((d) => d.id), "custom:deck-1"])
      await db.query(
        "update public.fellowship_choices set choices=$1 where user_id=$2",
        [{ ...choices, selectedDeck: id, seatDecks: [id] }, bob],
      );
    for (const scenario of SCENARIOS)
      await db.query(
        "update public.fellowship_choices set choices=$1 where user_id=$2",
        [
          {
            ...choices,
            selectedDeck: "starter-rohan",
            seatDecks: ["starter-rohan"],
            scenario: scenario.id,
          },
          bob,
        ],
      );
    for (const [scenario, title] of [
      ["the-weather-hills", "The Weather Hills"],
      ["deadmens-dike", "Deadmen's Dike"],
      ["wastes-of-eriador", "The Wastes of Eriador"],
      ["escape-from-mount-gram", "Escape from Mount Gram"],
      ["across-the-ettenmoors", "Across the Ettenmoors"],
      ["the-treachery-of-rhudaur", "The Treachery of Rhudaur"],
      ["the-battle-of-carn-dum", "The Battle of Carn Dûm"],
      ["the-dread-realm", "The Dread Realm"],
    ]) {
      const scenarioChoices = {
        ...choices,
        setupMode: "hotseat",
        selectedDeck: "starter-rohan",
        seatDecks: [
          "starter-rohan",
          "starter-gondor",
          "starter-elves",
          "starter-dwarves",
        ],
        scenario,
      };
      await db.query(
        "update public.fellowship_choices set choices=$1 where user_id=$2",
        [scenarioChoices, bob],
      );
      assert.deepEqual(
        (
          await db.query<{ choices: typeof scenarioChoices }>(
            "select choices from public.fellowship_choices where user_id=$1",
            [bob],
          )
        ).rows[0].choices,
        scenarioChoices,
        `${title} saves and reloads four distinct starter decks`,
      );
    }
    await db.query("select set_config('test.uid',$1,false)", [alice]);
    assert.deepEqual(
      (
        await db.query<{ choices: typeof choices }>(
          "select choices from public.fellowship_choices",
        )
      ).rows[0].choices,
      choices,
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [alice]);
    assert.equal(
      (
        await db.query(
          "select * from public.fellowship_choices where user_id=$1",
          [alice],
        )
      ).rows.length,
      0,
      "deleting an account removes its choices",
    );
  } finally {
    await db.close();
  }
});
