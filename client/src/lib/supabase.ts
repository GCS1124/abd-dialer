import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __SUPABASE_PUBLISHABLE_KEY__: string;

const metaEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env ?? {};

const supabaseUrl =
  __SUPABASE_URL__.trim() || metaEnv.VITE_SUPABASE_URL?.trim() || metaEnv.SUPABASE_URL?.trim();
const supabaseBrowserKey =
  __SUPABASE_ANON_KEY__.trim() ||
  __SUPABASE_PUBLISHABLE_KEY__.trim() ||
  metaEnv.VITE_SUPABASE_ANON_KEY?.trim() ||
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  metaEnv.SUPABASE_ANON_KEY?.trim() ||
  metaEnv.SUPABASE_PUBLISHABLE_KEY?.trim();

export const hasSupabaseBrowserConfig = Boolean(supabaseUrl && supabaseBrowserKey);

export const supabase: SupabaseClient | null = hasSupabaseBrowserConfig
  ? createClient(supabaseUrl!, supabaseBrowserKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
      },
    })
  : null;

export function createSupabaseTokenClient(accessToken: string) {
  if (!hasSupabaseBrowserConfig) {
    throw new Error("Supabase browser client is not configured.");
  }

  return createClient(supabaseUrl!, supabaseBrowserKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function assertSupabaseConfigured() {
  if (!supabase) {
    throw new Error(
      "Supabase browser client is not configured. Set VITE_SUPABASE_URL or SUPABASE_URL and VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY.",
    );
  }
}

export function getSupabaseClient() {
  assertSupabaseConfigured();
  return supabase as SupabaseClient;
}

export function getSupabaseFunctionUrl(functionName: string) {
  if (!supabaseUrl) {
    throw new Error("Supabase browser client is not configured.");
  }

  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

export function getSupabaseBrowserKey() {
  if (!supabaseBrowserKey) {
    throw new Error("Supabase browser client is not configured.");
  }

  return supabaseBrowserKey;
}
