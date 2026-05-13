import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
}

interface RingCentralIntegrationRow {
  app_user_id: string;
  account_id: string | null;
  extension_id: string | null;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  access_token_expires_at: string;
  refresh_token_expires_at: string | null;
  selected_caller_id: string | null;
  connected_at: string;
  updated_at: string;
}

interface RingCentralTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function readRingOutId(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { ringOutId?: unknown }).ringOutId === "string"
  ) {
    return (value as { ringOutId: string }).ringOutId.trim();
  }

  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id.trim();
  }

  return "";
}

function requireRingCentralClientId() {
  if (!ringCentralClientId) {
    throw new Error("Missing RingCentral client id.");
  }

  return ringCentralClientId;
}

function getRingCentralApiUrl(path: string) {
  return new URL(path, ringCentralServerUrl).toString();
}

async function requireWorkspaceUser(request: Request) {
  const currentUser = await getAuthenticatedUser(request);
  if (!currentUser) {
    throw Object.assign(new Error("Missing authentication."), { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("app_users")
    .select("id, auth_user_id")
    .eq("auth_user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Workspace profile not found."), { status: 404 });
  }

  return {
    workspaceUser: data as AppUserRow,
    serviceClient,
  };
}

async function fetchRingCentralToken(body: Record<string, string>) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (ringCentralClientSecret) {
    headers.Authorization = `Basic ${btoa(`${requireRingCentralClientId()}:${ringCentralClientSecret}`)}`;
  }

  const response = await fetch(getRingCentralApiUrl("/restapi/oauth/token"), {
    method: "POST",
    headers,
    body: new URLSearchParams({
      client_id: requireRingCentralClientId(),
      ...body,
    }).toString(),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Partial<RingCentralTokenResponse> & { error_description?: string }) : {};

  if (!response.ok) {
    throw Object.assign(
      new Error(data.error_description || `RingCentral token request failed (${response.status}).`),
      { status: response.status },
    );
  }

  if (!data.access_token || !data.refresh_token || !data.expires_in || !data.token_type) {
    throw new Error("RingCentral token response was incomplete.");
  }

  return data as RingCentralTokenResponse;
}

async function loadIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, connected_at, updated_at",
    )
    .eq("app_user_id", workspaceUserId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data as RingCentralIntegrationRow | null) ?? null;
}

async function saveIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: RingCentralIntegrationRow,
) {
  const { error } = await serviceClient.from("ringcentral_integrations").upsert(row);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

function isAccessTokenExpired(row: RingCentralIntegrationRow) {
  const expiry = new Date(row.access_token_expires_at).getTime();
  return Number.isFinite(expiry) ? expiry <= Date.now() + 60_000 : true;
}

async function refreshIntegrationIfNeeded(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  row: RingCentralIntegrationRow,
) {
  if (!isAccessTokenExpired(row)) {
    return row;
  }

  const refreshed = await fetchRingCentralToken({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  const updatedRow: RingCentralIntegrationRow = {
    ...row,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? row.refresh_token,
    token_type: refreshed.token_type ?? row.token_type,
    scope: refreshed.scope ?? row.scope,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    refresh_token_expires_at: refreshed.refresh_token_expires_in
      ? new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString()
      : row.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };

  await saveIntegration(serviceClient, updatedRow);
  return updatedRow;
}

async function handleRingOutStatus(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutId = readRingOutId(body.ringOutId);
  if (!ringOutId) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(ringOutId)}`),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refreshed.access_token}`,
      },
    },
  );

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw Object.assign(
      new Error(
        typeof data.message === "string"
          ? data.message
          : `RingCentral ring-out status request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }

  const ringOutStatus = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : {};
  return jsonResponse({
    success: true,
    call: {
      id: typeof data.id === "string" ? data.id : ringOutId,
      status:
        typeof ringOutStatus.status === "string"
          ? ringOutStatus.status
          : typeof data.status === "string"
            ? data.status
            : null,
      callStatus:
        typeof ringOutStatus.callStatus === "string"
          ? ringOutStatus.callStatus
          : typeof ringOutStatus.state === "string"
            ? ringOutStatus.state
            : null,
      callerStatus:
        typeof ringOutStatus.callerStatus === "string"
          ? ringOutStatus.callerStatus
          : null,
      calleeStatus:
        typeof ringOutStatus.calleeStatus === "string"
          ? ringOutStatus.calleeStatus
          : null,
      to: null,
      from: null,
    },
  });
}

async function handleRingOutCancel(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const ringOutId = readRingOutId(body.ringOutId);
  if (!ringOutId) {
    return jsonResponse({ message: "ringOutId is required." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/account/~/extension/~/ring-out/${encodeURIComponent(ringOutId)}`),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refreshed.access_token}`,
      },
    },
  );

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    throw Object.assign(
      new Error(
        typeof data.message === "string"
          ? data.message
          : `RingCentral ring-out cancel request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }

  return jsonResponse({ success: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await request.json().catch(() => ({}))
      : {};
    const action = typeof body.action === "string" ? body.action : "";
    const { serviceClient, workspaceUser } = await requireWorkspaceUser(request);

    if (action === "ring-out-status") {
      return await handleRingOutStatus(body, serviceClient, workspaceUser);
    }

    if (action === "ring-out-cancel") {
      return await handleRingOutCancel(body, serviceClient, workspaceUser);
    }

    return jsonResponse({ message: "Unsupported RingCentral action." }, { status: 400 });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? (error as { status?: number }).status ?? 500
        : 500;
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Unable to process RingCentral request." },
      { status },
    );
  }
});
