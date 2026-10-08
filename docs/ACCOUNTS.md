# Fellowship choices and accounts

All ten built-in preconstructed decks (four Core learning lists, four retail Starters and two Collector lists) are visible as cards, with three named hero scans, sphere, starting threat, original deck size and a separate inspection action. Hot-seat assigns complete starters to 1–4 seats and prevents duplicate heroes. Classic, new-game and campaign deck/hero choices no longer use dropdowns. Browsing a deck does not select it.

Guests automatically retain setup choices in `there-and-back-again.choices.v1`. Existing game saves and legacy deck settings remain readable. Account choices are separate from guest choices: sign-out restores the guest setup.

## Connect a Supabase project

1. Use a Supabase project dedicated to this game. Apply the SQL files in `supabase/migrations/` in filename order in its SQL editor (or through the Supabase migration CLI). The `202610070001_preconstructed_choices.sql` extension accepts the six precon ids, custom deck references and the earlier scripted scenarios. The later `202610070002_fords_isen_choices.sql` and `202610070003_catch_orc_choices.sql` migrations add Fords of Isen and To Catch an Orc while preserving ownership policies. The `202610070004_fangorn_choices.sql` migration adds Into Fangorn, and `202610070005_dunland_trap_choices.sql` adds The Dunland Trap. The `202610080001_three_trials_choices.sql` migration adds The Three Trials. The `202610080002_tharbad_choices.sql` migration adds Trouble in Tharbad. The `202610080003_nin_eilph_choices.sql` migration adds The Nîn-in-Eilph. The `202610080004_celebrimbor_choices.sql` migration adds Celebrimbor’s Secret. The `202610080005_antlered_choices.sql` migration adds The Antlered Crown. The `202610080006_chetwood_choices.sql` migration adds Intruders in Chetwood. The `202610080007_weather_hills_choices.sql` migration adds The Weather Hills. The migration creates a private per-user choices table, ownership policies for every operation, data checks and automatic timestamps. No application passwords are stored in this table.
2. Enable email/password authentication and email confirmation. Set a minimum password length of 12 characters in the Auth configuration, matching the registration UI. Configure production SMTP for confirmation and password-reset delivery.
3. Set Auth **Site URL** to `https://lotrlcg.vercel.app`. Allow the exact localhost origins used for development and the exact production/preview origins intended to support sign-in. The client sends `window.location.origin` as the confirmation/recovery redirect. PKCE email links should be opened in the browser that requested them.
4. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in local `.env.local` and the intended Vercel environment. Use only the public publishable key (or legacy anon key); never use a service-role key, secret key, database password or management token in a `VITE_` variable. Do not overwrite unrelated environment values.
5. Build/redeploy after changing these build-time settings. Without both settings, the game remains available to guests and the account dialog honestly reports that accounts are not connected.
6. Verify real email confirmation, sign-in, reset-password email and saving/restoring choices on two browsers. Test two different accounts to confirm ownership isolation on the hosted database. Local tests do not substitute for this deployment check.

The implementation was checked against the official [Supabase Auth documentation](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) and [Row Level Security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## What is saved

A signed-in player explicitly presses **Save choices** to store the classic starter, hot-seat starter assignments (and therefore the three heroes of each starter), player count, solo arrangement, normal/campaign mode and selected quest. The account's choices load on sign-in and reload. A failed or invalid cloud read never triggers an overwrite. Failed saves retain the unsaved selection and offer retry. Responses from an old session cannot mark a later account as saved.

Game progress, custom campaign hero replacements, campaign journals and table appearance preferences remain local. Export/import transfers a game. Account sign-in never deletes or replaces game progress; the setup screen can still resume the existing local adventure.

## Validation

- `node --import tsx --test tests/fellowship-choices.test.ts tests/account-rls.test.ts`: input validation plus the real migration executed by PGlite PostgreSQL. Verifies anonymous rejection, own-row access, cross-account read/update/upsert/delete isolation, invalid setup rejection and account-deletion cascade.
- `node scripts/browser-fellowship-choices.mjs`: unconfigured production preview (default port 5178), visible heroes, independent inspection, classic/hot-seat persistence, no setup dropdown, unavailable-account state and responsive overflow checks.
- `node scripts/browser-account.mjs`: run a Vite server on port 5181 with `VITE_SUPABASE_URL=https://lotr-account-test.supabase.co` and `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test_fixture`. The browser intercepts every test-service request. It exercises the actual Supabase SDK using simulated Auth/PostgREST responses: confirmation, password validation, sign-in failure, reset request, save/restore across browser contexts, errors/retry and session isolation. Test settings must never be used for deployment.
- Existing player-setup/campaign regressions now select visible deck/hero buttons. Fixture loaders clear the new setup preference before loading an older save, so the fixture itself determines the starting state.

## Current connection status

No Supabase project was provisioned or modified and no real account/email was created during implementation. The project has no Supabase environment settings. Hosted activation requires access to the user's Supabase project and applying the steps above. The automatic approval review blocked reading the signed-in Supabase dashboard without explicit authorization. No production deployment was performed.
