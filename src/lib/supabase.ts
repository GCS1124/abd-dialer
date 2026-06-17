import { createClient } from "@supabase/supabase-js";

const metaEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env ?? {};

const supabaseUrl =
  metaEnv.VITE_SUPABASE_URL?.trim() || metaEnv.SUPABASE_URL?.trim() ||
  "https://placeholder.supabase.co";
const supabasePublishableKey =
  metaEnv.VITE_SUPABASE_ANON_KEY?.trim() ||
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  metaEnv.SUPABASE_ANON_KEY?.trim() ||
  metaEnv.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  "sb_publishable_placeholder";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const hasSupabaseEnv =
  Boolean(metaEnv.VITE_SUPABASE_URL?.trim() || metaEnv.SUPABASE_URL?.trim()) &&
  Boolean(
    metaEnv.VITE_SUPABASE_ANON_KEY?.trim() ||
      metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
      metaEnv.SUPABASE_ANON_KEY?.trim() ||
      metaEnv.SUPABASE_PUBLISHABLE_KEY?.trim(),
  );

export function assertSupabaseConfigured() {
  if (!hasSupabaseEnv) {
    throw new Error(
      "Supabase environment variables are missing. Set VITE_SUPABASE_URL or SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY (or the non-VITE variants) before signing in.",
    );
  }
}
