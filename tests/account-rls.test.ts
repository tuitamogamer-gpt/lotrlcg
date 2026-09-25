import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

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
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202609250001_fellowship_choices.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
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
    ]) {
      await assert.rejects(
        db.query(
          "update public.fellowship_choices set choices=$1 where user_id=$2",
          [malformed, bob],
        ),
        /valid_choices/,
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
