import { useState } from "react";
import {
  CloudCheck,
  FloppyDisk,
  UserCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { accountClient } from "../account/client";
import type { AccountState } from "../account/use-account";

export function AccountStrip({
  account,
  open,
}: {
  account: AccountState;
  open: () => void;
}) {
  return (
    <div className="account-strip">
      <CloudCheck size={23} />
      <div>
        <strong>
          {account.user
            ? "Your fellowship, ready for the next journey."
            : "Keep your fellowship for another day."}
        </strong>
        <span role="status">
          {!account.initialized
            ? "Connecting to your account…"
            : account.loadState === "loading"
              ? "Loading your saved choices…"
              : account.loadState === "error"
                ? account.message
                : account.user
                  ? account.saving
                    ? "Saving choices…"
                    : account.dirty
                      ? "You have choices to save to your account."
                      : "These choices are saved to your account."
                  : "Choices stay on this device. Sign in to save them across devices."}
        </span>
      </div>
      {account.user ? (
        <button
          className="secondary"
          disabled={
            account.loadState !== "ready" || account.saving || !account.dirty
          }
          onClick={() => void account.save()}
        >
          <FloppyDisk size={17} />
          {account.saving
            ? "Saving…"
            : account.dirty
              ? "Save choices"
              : "Choices saved"}
        </button>
      ) : (
        <button className="secondary" onClick={open}>
          <UserCircle size={18} /> Sign in / Register
        </button>
      )}
      {account.loadState === "error" && (
        <button className="text-link" onClick={account.retry}>
          Retry
        </button>
      )}
      {account.message && account.loadState !== "error" && (
        <p className="account-save-message" role="status">
          {account.message}
        </p>
      )}
    </div>
  );
}

export function AccountPanel({ account }: { account: AccountState }) {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!account.configured)
    return (
      <div className="account-unavailable">
        <UserCircle size={44} />
        <h3>Accounts are not connected yet.</h3>
        <p>
          Your choices are saved on this device. Online sign-in and saving will
          become available when the account service is connected.
        </p>
        <p>You can keep playing as a guest.</p>
      </div>
    );
  if (!account.initialized)
    return <p role="status">Connecting to your account…</p>;
  if (account.user && !account.recovery)
    return (
      <div className="account-panel">
        <UserCircle size={38} />
        <h3>Your traveller’s account</h3>
        <p className="account-email">{account.user.email}</p>
        <p>
          Save your starter decks, heroes, player arrangement, game mode and
          quest. They load when you sign in on another device.
        </p>
        <p className="account-note">
          Adventure progress stays on this device. Use export/import in How to
          play to move a game.
        </p>
        <AccountStrip account={account} open={() => {}} />
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const { error } = await accountClient!.auth.signOut({
                scope: "local",
              });
              if (error) throw error;
              setPassword("");
              setConfirmPassword("");
            })
          }
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
        {error && (
          <p role="alert" className="account-error">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        void act(async () => {
          if (account.recovery || mode === "register") {
            if (password !== confirmPassword)
              throw new Error("The passwords do not match.");
          }
          if (account.recovery) {
            const { error } = await accountClient!.auth.updateUser({
              password,
            });
            if (error) throw error;
            setPassword("");
            setConfirmPassword("");
            account.finishRecovery();
          } else if (mode === "reset") {
            const { error } = await accountClient!.auth.resetPasswordForEmail(
              email.trim(),
              { redirectTo: window.location.origin },
            );
            if (error) throw error;
            setMessage(
              "If an account exists for this email, a password reset link will arrive shortly.",
            );
          } else if (mode === "register") {
            const { data, error } = await accountClient!.auth.signUp({
              email: email.trim(),
              password,
              options: { emailRedirectTo: window.location.origin },
            });
            if (error) throw error;
            setPassword("");
            setConfirmPassword("");
            if (!data.session)
              setMessage(
                "Check your email to confirm your account, then sign in here. If you already have an account, use Sign in.",
              );
          } else {
            const { error } = await accountClient!.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (error)
              throw new Error(
                "Sign-in failed. Check your email, password and email confirmation, then try again.",
              );
            setPassword("");
          }
        });
      }}
    >
      {!account.recovery && (
        <div className="account-tabs" role="group" aria-label="Account action">
          {(["login", "register"] as const).map((v) => (
            <button
              type="button"
              key={v}
              disabled={busy}
              aria-pressed={mode === v}
              onClick={() => {
                setMode(v);
                setError("");
                setMessage("");
                setPassword("");
                setConfirmPassword("");
              }}
            >
              {v === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}
      <p>
        {account.recovery
          ? "Choose a new password for your account."
          : mode === "reset"
            ? "Enter your email to receive a password reset link."
            : "Keep your chosen fellowship with you, wherever you play."}
      </p>
      {!account.recovery && (
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            maxLength={254}
            required
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      )}
      {(mode !== "reset" || account.recovery) && (
        <label>
          {account.recovery ? "New password" : "Password"}
          <input
            type="password"
            aria-label={account.recovery ? "New password" : "Password"}
            autoComplete={
              mode === "register" || account.recovery
                ? "new-password"
                : "current-password"
            }
            value={password}
            minLength={mode === "register" || account.recovery ? 12 : undefined}
            maxLength={128}
            required
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
          {(mode === "register" || account.recovery) && (
            <small>Use at least 12 characters.</small>
          )}
        </label>
      )}
      {(mode === "register" || account.recovery) && (
        <label>
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            minLength={12}
            maxLength={128}
            required
            disabled={busy}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
      )}
      {message && (
        <p role="status" className="account-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      <button className="primary" type="submit" disabled={busy}>
        {busy
          ? "Please wait…"
          : account.recovery
            ? "Update password"
            : mode === "register"
              ? "Create account"
              : mode === "reset"
                ? "Send reset link"
                : "Sign in"}
        <ArrowRight size={18} />
      </button>
      {mode === "login" && !account.recovery && (
        <button
          className="text-link"
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("reset");
            setMessage("");
            setError("");
          }}
        >
          Forgot password?
        </button>
      )}
      <p className="account-note">
        Fellowship choices sync with your account. Saved adventures remain on
        this device.
      </p>
    </form>
  );
}
