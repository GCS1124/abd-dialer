import { createClient, type SupabaseClient, type User as SupabaseUser } from "npm:@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";

function getFirstEnvValue(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function getKeyFromDictionary(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    return "";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`Invalid Supabase environment variable: ${name}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "";
  }

  const values = parsed as Record<string, unknown>;
  const defaultKey = values.default;
  if (typeof defaultKey === "string" && defaultKey.trim()) {
    return defaultKey.trim();
  }

  for (const key of Object.values(values)) {
    if (typeof key === "string" && key.trim()) {
      return key.trim();
    }
  }

  return "";
}

function getPublishableKey() {
  return (
    getFirstEnvValue(["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"]) ||
    getKeyFromDictionary("SUPABASE_PUBLISHABLE_KEYS")
  );
}

function getSecretKey() {
  return (
    getFirstEnvValue(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) ||
    getKeyFromDictionary("SUPABASE_SECRET_KEYS")
  );
}

function requireEnv(value: string, name: string) {
  if (!value) {
    throw new Error(`Missing Supabase environment variable: ${name}`);
  }

  return value;
}

export function createAnonClient(authorization?: string | null) {
  return createClient(
    requireEnv(supabaseUrl, "SUPABASE_URL"),
    requireEnv(
      getPublishableKey(),
      "SUPABASE_PUBLISHABLE_KEYS, SUPABASE_PUBLISHABLE_KEY, or SUPABASE_ANON_KEY",
    ),
    {
      global: authorization
        ? {
            headers: { Authorization: authorization },
          }
        : undefined,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export function createServiceClient() {
  return createClient(
    requireEnv(supabaseUrl, "SUPABASE_URL"),
    requireEnv(
      getSecretKey(),
      "SUPABASE_SECRET_KEYS, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY",
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export async function getAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return null;
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return null;
  }

  const client = createAnonClient(authorization);
  const authClient = client.auth as typeof client.auth & {
    getClaims?: (jwt?: string) => Promise<{ data: { claims?: { sub?: string } } | null; error?: unknown }>;
  };

  if (typeof authClient.getClaims === "function") {
    const { data: claimsData, error: claimsError } = await authClient.getClaims(token);
    const claims = claimsData?.claims as { sub?: string } | null | undefined;
    if (!claimsError && claims?.sub) {
      return { id: claims.sub } as SupabaseUser;
    }
  }

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id } as SupabaseUser;
}

export type { SupabaseClient, SupabaseUser };
