import { createClient } from "@supabase/supabase-js";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __SUPABASE_PUBLISHABLE_KEY__: string;

const supabaseUrl =
  __SUPABASE_URL__ ||
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.SUPABASE_URL ??
  "https://placeholder.supabase.co";
const supabasePublishableKey =
  __SUPABASE_ANON_KEY__ ||
  __SUPABASE_PUBLISHABLE_KEY__ ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_placeholder";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const hasSupabaseEnv =
  Boolean(import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY);

export function assertSupabaseConfigured() {
  if (!hasSupabaseEnv) {
    throw new Error(
      "Supabase environment variables are missing. Set VITE_SUPABASE_URL or SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}
