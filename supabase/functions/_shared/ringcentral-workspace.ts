import type { SupabaseClient } from "./supabase.ts";

const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";

export interface RingCentralWorkspaceConfigRow {
  workspace_id: string;
  server_url: string | null;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
  updated_at: string;
}

export interface RingCentralWorkspaceConfig {
  workspaceId: string;
  serverUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  apiUrl(path: string): string;
  basicAuthorizationHeader(): string;
}

export async function loadRingCentralWorkspaceConfig(
  serviceClient: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await serviceClient
    .from("ringcentral_workspace_configs")
    .select("workspace_id, server_url, redirect_uri, client_id, client_secret, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    return null;
  }

  const row = data as RingCentralWorkspaceConfigRow;
  const serverUrl = row.server_url?.trim() || DEFAULT_RINGCENTRAL_SERVER_URL;
  const redirectUri = row.redirect_uri.trim();
  const clientId = row.client_id.trim();
  const clientSecret = row.client_secret.trim();

  if (!redirectUri || !clientId || !clientSecret) {
    throw Object.assign(new Error("RingCentral workspace config is incomplete."), { status: 500 });
  }

  return {
    workspaceId: row.workspace_id,
    serverUrl,
    redirectUri,
    clientId,
    clientSecret,
    apiUrl(path: string) {
      return new URL(path, serverUrl).toString();
    },
    basicAuthorizationHeader() {
      return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
    },
  } satisfies RingCentralWorkspaceConfig;
}

export function requireRingCentralWorkspaceConfig(
  config: RingCentralWorkspaceConfig | null,
  workspaceId: string,
) {
  if (!config) {
    throw Object.assign(
      new Error(`RingCentral workspace config not found for workspace ${workspaceId}.`),
      { status: 409 },
    );
  }

  return config;
}
