import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
// Only a public publishable/anon key belongs in a browser build. RLS protects every row.
export const accountConfigured = !!(url && key);
let client: SupabaseClient | null = null;
let loading: Promise<SupabaseClient | null> | null = null;
/**
 * The Supabase library is only downloaded when an account backend is
 * configured, so guest play never pays for it.
 */
export function loadAccountClient(): Promise<SupabaseClient | null> {
  if (!accountConfigured) return Promise.resolve(null);
  loading ??= import("@supabase/supabase-js")
    .then(({ createClient }) => {
      client ??= createClient(url!, key!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
      return client;
    })
    .catch((error) => {
      // A failed chunk download must not poison every future sign-in attempt.
      loading = null;
      throw error;
    });
  return loading;
}
