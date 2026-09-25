// Real Supabase browser client with controlled Auth/PostgREST responses.
// These tests do not claim to verify a hosted project or email delivery.
import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const base = process.env.ACCOUNT_TEST_URL ?? "http://127.0.0.1:5181";
const api = "https://lotr-account-test.supabase.co";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const preset = {
  version: 1,
  setupMode: "classic",
  selectedDeck: "lore",
  seatDecks: ["lore"],
  playMode: "normal",
  scenario: "anduin",
};
const rows = new Map([
  [alice, preset],
  [bob, { ...preset, selectedDeck: "tactics", scenario: "mirkwood" }],
]);
let failRead = false,
  failSave = false,
  writes = 0,
  signups = 0,
  resets = 0,
  passwordUpdates = 0,
  holdSave = null;
const errors = [];
const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
const user = (id) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email: id === alice ? "alice@example.test" : "bob@example.test",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
});
const session = (id) => ({
  access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })}.testsignature`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: `test-refresh-${id}`,
  user: user(id),
});
const browser = await (
  process.env.BROWSER === "webkit" ? webkit : chromium
).launch({ headless: true });
async function device(callbackType) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  if (callbackType)
    await context.addInitScript(
      (type) =>
        localStorage.setItem(
          "sb-lotr-account-test-auth-token-code-verifier",
          JSON.stringify(`test-verifier/${type}`),
        ),
      callbackType,
    );
  await context.route(`${api}/**`, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const json = (value, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    let body = {};
    try {
      body = req.postDataJSON() ?? {};
    } catch {}
    const token = req.headers().authorization?.split(" ")[1];
    let id;
    try {
      id = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ).sub;
    } catch {}
    if (url.pathname === "/auth/v1/signup") {
      signups++;
      return json(user(alice));
    }
    if (url.pathname === "/auth/v1/recover") {
      resets++;
      return json({});
    }
    if (url.pathname === "/auth/v1/token") {
      if (body.password === "wrong-password")
        return json(
          { code: "invalid_credentials", msg: "Invalid login credentials" },
          400,
        );
      return json(session(body.email === "bob@example.test" ? bob : alice));
    }
    if (url.pathname === "/auth/v1/user") {
      if (req.method() === "PUT") {
        assert.equal(body.password.length >= 12, true);
        passwordUpdates++;
      }
      return json(user(id));
    }
    if (url.pathname === "/auth/v1/logout") return json({});
    if (url.pathname === "/rest/v1/fellowship_choices") {
      if (!id) return json({ message: "Unauthenticated" }, 401);
      if (req.method() === "GET") {
        if (failRead) return json({ message: "Temporarily unavailable" }, 503);
        assert.equal(url.searchParams.get("user_id"), `eq.${id}`);
        return json(rows.has(id) ? { choices: rows.get(id) } : null);
      }
      assert.equal(
        body.user_id,
        id,
        "client writes are scoped to the current account",
      );
      if (failSave) return json({ message: "Temporarily unavailable" }, 503);
      if (holdSave) await holdSave;
      rows.set(id, body.choices);
      writes++;
      return json({});
    }
    throw new Error(`Unexpected test request ${url.pathname}`);
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(callbackType ? `${base}/?code=test-callback-code` : base);
  return { page, context };
}
const choices = (p) =>
  p.evaluate(() => JSON.parse(window.render_game_to_text()).fellowship);
async function open(p) {
  await p.getByRole("button", { name: "Sign in or register" }).click();
}
async function login(
  p,
  email = "alice@example.test",
  password = "long-test-password",
) {
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.locator(".account-form button[type=submit]").click();
  if (password === "wrong-password") return;
  await p.getByRole("button", { name: "Sign out", exact: true }).waitFor();
  await p
    .locator(".account-panel")
    .getByText("These choices are saved to your account.")
    .waitFor();
}
await fs.mkdir("output/fellowship-choices", { recursive: true });
const { page: p, context: a } = await device();
await p.getByRole("button", { name: /Classic solo/ }).click();
await p.getByRole("button", { name: "Choose Spirit", exact: true }).click();
await open(p);
await p.getByRole("button", { name: "Create account", exact: true }).click();
await p.getByLabel("Email", { exact: true }).fill("alice@example.test");
await p.getByLabel("Password", { exact: true }).fill("long-test-password");
await p
  .getByLabel("Confirm password", { exact: true })
  .fill("different-password");
await p.locator(".account-form button[type=submit]").click();
assert.ok(await p.getByText("The passwords do not match.").isVisible());
assert.equal(signups, 0);
await p
  .getByLabel("Confirm password", { exact: true })
  .fill("long-test-password");
await p.locator(".account-form button[type=submit]").click();
await p.getByText(/Check your email to confirm/).waitFor();
assert.equal(signups, 1);
await p.screenshot({
  path: "output/fellowship-choices/account-registration.png",
});
await p
  .getByRole("group", { name: "Account action" })
  .getByRole("button", { name: "Sign in", exact: true })
  .click();
await login(p, "alice@example.test", "wrong-password");
await p.getByText(/Sign-in failed/).waitFor();
await p.getByRole("button", { name: "Forgot password?" }).click();
await p.locator(".account-form button[type=submit]").click();
await p.getByText(/If an account exists/).waitFor();
assert.equal(resets, 1);
await p
  .getByRole("group", { name: "Account action" })
  .getByRole("button", { name: "Sign in", exact: true })
  .click();
await login(p);
assert.deepEqual(await choices(p), preset);
assert.equal(
  writes,
  0,
  "loading an account never overwrites its saved choices",
);
await p.screenshot({ path: "output/fellowship-choices/account-signed-in.png" });
await p.keyboard.press("Escape");
await p.getByRole("button", { name: "Choose Spirit", exact: true }).click();
await p.getByRole("button", { name: "Save choices", exact: true }).click();
await p.getByRole("button", { name: "Choices saved", exact: true }).waitFor();
assert.equal(rows.get(alice).selectedDeck, "spirit");
await p.reload();
await p.getByRole("button", { name: "Choices saved", exact: true }).waitFor();
assert.equal((await choices(p)).selectedDeck, "spirit");
// A second browser/device recovers the account selection.
const { page: q, context: b } = await device();
await open(q);
await login(q);
assert.equal((await choices(q)).selectedDeck, "spirit");
await b.close();
// Failed reads cannot erase cloud data; retry restores it.
failRead = true;
await p.reload();
await p.getByText(/Could not load your saved choices/).waitFor();
assert.ok(
  await p
    .getByRole("button", { name: "Save choices", exact: true })
    .isDisabled(),
);
failRead = false;
await p.getByRole("button", { name: "Retry", exact: true }).click();
await p.getByRole("button", { name: "Choices saved", exact: true }).waitFor();
// Failed writes leave the new choice visible and unsaved.
await p.getByRole("button", { name: "Choose Leadership", exact: true }).click();
failSave = true;
await p.getByRole("button", { name: "Save choices", exact: true }).click();
await p.getByText(/Could not save to your account/).waitFor();
assert.equal(rows.get(alice).selectedDeck, "spirit");
assert.equal((await choices(p)).selectedDeck, "leadership");
failSave = false;
await p.getByRole("button", { name: "Save choices", exact: true }).click();
await p.getByRole("button", { name: "Choices saved", exact: true }).waitFor();
// Logging out restores the guest selection, not the previous account's selection.
await p.getByRole("button", { name: "My account", exact: true }).click();
await p.getByRole("button", { name: "Sign out", exact: true }).click();
await p.getByRole("group", { name: "Account action" }).waitFor();
assert.equal((await choices(p)).selectedDeck, "spirit");
await login(p, "bob@example.test");
assert.equal((await choices(p)).selectedDeck, "tactics");
assert.equal(rows.get(alice).selectedDeck, "leadership");
await p.keyboard.press("Escape");
// A response arriving after logout must not report success on the next account.
let release;
holdSave = new Promise((resolve) => {
  release = resolve;
});
await p.getByRole("button", { name: "Choose Lore", exact: true }).click();
await p.getByRole("button", { name: "Save choices", exact: true }).click();
await p.getByRole("button", { name: "My account", exact: true }).click();
await p.getByRole("button", { name: "Sign out", exact: true }).click();
await p.getByRole("group", { name: "Account action" }).waitFor();
release();
holdSave = null;
await login(p);
assert.equal((await choices(p)).selectedDeck, "leadership");
assert.ok(
  await p
    .locator(".account-panel")
    .getByText("These choices are saved to your account.")
    .isVisible(),
);
await a.close();
const { page: recovered, context: recoveryContext } = await device("recovery");
await recovered
  .getByRole("button", { name: "Update password", exact: true })
  .waitFor();
await recovered
  .getByLabel("New password", { exact: true })
  .fill("replacement-test-password");
await recovered
  .getByLabel("Confirm password", { exact: true })
  .fill("replacement-test-password");
await recovered
  .getByRole("button", { name: "Update password", exact: true })
  .click();
await recovered
  .getByRole("button", { name: "Sign out", exact: true })
  .waitFor();
assert.equal(passwordUpdates, 1);
await recoveryContext.close();
const { page: confirmed, context: confirmationContext } =
  await device("signup");
await confirmed
  .getByRole("button", { name: "My account", exact: true })
  .waitFor();
await confirmed
  .getByRole("button", { name: "Choices saved", exact: true })
  .waitFor();
assert.equal((await choices(confirmed)).selectedDeck, "leadership");
await confirmationContext.close();
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Account client passed: registration, confirmation callback, password mismatch, login failure, reset request and recovery callback, explicit save, reload and second device, read/write errors and retry, guest/account isolation, stale response after logout. Hosted email delivery remains a deployment check.",
);
