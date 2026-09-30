import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { accountConfigured, loadAccountClient } from "./client";
import { CHOICES_KEY, parseChoices, readChoices } from "./choices";
import type { FellowshipChoices } from "./choices";

type LoadState = "idle" | "loading" | "ready" | "error";
export function useAccount(
  choices: FellowshipChoices,
  restore: (choices: FellowshipChoices) => void,
) {
  const [accountClient, setAccountClient] = useState<SupabaseClient | null>(
    null,
  );
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(!accountConfigured);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saving, setSaving] = useState(false);
  const [savedChoices, setSavedChoices] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [retry, setRetry] = useState(0);
  const current = useRef(choices);
  const restoreRef = useRef(restore);
  const guest = useRef(readChoices() ?? choices);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    loadAccountClient()
      .then((c) => {
        if (cancelled) return;
        setAccountClient(c);
        if (!identity.current) {
          setLoadState("idle");
          setMessage("");
        }
        if (!c) setInitialized(true);
      })
      .catch(() => {
        if (cancelled) return;
        setInitialized(true);
        setLoadState("error");
        setMessage(
          "Could not connect to accounts. Guest play is available; retry to reconnect.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);
  current.current = choices;
  restoreRef.current = restore;
  useEffect(() => {
    if (!accountClient) return;
    const { data } = accountClient.auth.onAuthStateChange((event, session) => {
      if (identity.current !== (session?.user.id ?? null)) {
        generation.current++;
        // Preserve the guest's setup separately when an account takes over.
        if (!identity.current && session?.user) guest.current = current.current;
        identity.current = session?.user.id ?? null;
        setSavedChoices(null);
        setLoadState(session?.user ? "loading" : "idle");
        setSaving(false);
        setMessage("");
        if (!session?.user) {
          setRecovery(false);
          restoreRef.current(guest.current);
        }
      }
      setUser(session?.user ?? null);
      setInitialized(true);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, [accountClient]);
  useEffect(() => {
    // Account choices never overwrite guest choices in this browser.
    if (!initialized || user) return;
    guest.current = choices;
    try {
      localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
    } catch {
      /* Guest play still works. */
    }
  }, [choices, initialized, user]);
  useEffect(() => {
    if (!accountClient || !user) return;
    const id = user.id;
    const version = ++generation.current;
    let cancelled = false;
    setLoadState("loading");
    setMessage("");
    Promise.resolve(
      accountClient
        .from("fellowship_choices")
        .select("choices")
        .eq("user_id", id)
        .maybeSingle(),
    )
      .then(({ data, error }) => {
        if (
          cancelled ||
          version !== generation.current ||
          identity.current !== id
        )
          return;
        if (error) {
          setLoadState("error");
          setMessage(
            "Could not load your saved choices. Retry before saving changes.",
          );
          return;
        }
        if (data) {
          const restored = parseChoices(data.choices);
          if (!restored) {
            setLoadState("error");
            setMessage(
              "Your saved choices use an unsupported format. They have not been overwritten.",
            );
            return;
          }
          restoreRef.current(restored);
          setSavedChoices(JSON.stringify(restored));
        }
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled && version === generation.current) {
          setLoadState("error");
          setMessage(
            "Could not reach your account. Check your connection and retry.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accountClient, user?.id, retry]);
  const save = useCallback(async () => {
    if (!accountClient || !user || loadState !== "ready" || saving) return;
    const snapshot = current.current;
    const id = user.id;
    const version = generation.current;
    setSaving(true);
    setMessage("");
    try {
      const { error } = await accountClient
        .from("fellowship_choices")
        .upsert({ user_id: id, choices: snapshot }, { onConflict: "user_id" });
      if (identity.current !== id || version !== generation.current) return;
      if (error) throw error;
      setSavedChoices(JSON.stringify(snapshot));
      setMessage("Your fellowship choices are saved to your account.");
    } catch {
      if (identity.current === id && version === generation.current)
        setMessage(
          "Could not save to your account. Your current choices are still here; please retry.",
        );
    } finally {
      if (identity.current === id && version === generation.current)
        setSaving(false);
    }
  }, [accountClient, user, loadState, saving]);
  return {
    user,
    initialized,
    configured: accountConfigured,
    loadState,
    saving,
    message,
    recovery,
    finishRecovery: () => setRecovery(false),
    save,
    retry: () => setRetry((n) => n + 1),
    dirty: JSON.stringify(choices) !== savedChoices,
  };
}
export type AccountState = ReturnType<typeof useAccount>;
