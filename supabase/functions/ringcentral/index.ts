import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";
import {
  buildRingCentralAuthorizationUrl,
  buildRingOutRequestPayload,
  formatRingCentralPhoneNumber,
  selectRingCentralCallerId,
  type RingCentralPhoneNumber,
} from "../_shared/ringcentral.ts";

interface AppUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: "admin" | "team_leader" | "agent";
  team_name: string;
  title: string | null;
  timezone: string;
  status: "online" | "away" | "offline";
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
  owner_id?: string;
}

interface RingCentralAccountResponse {
  id?: string | number;
  operator?: {
    id?: string | number;
    extensionNumber?: string | null;
  };
}

interface RingCentralCallerNumberResponse {
  records?: Array<{
    phoneNumber?: string;
    usageType?: string | null;
    features?: string[] | null;
  }>;
}

interface RingCentralStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  selectedCallerId: string | null;
  availableCallerIds: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
}

const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";
const ringCentralUserJwt = Deno.env.get("RINGCENTRAL_USER_JWT")?.trim() || "";

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeIdentifier(value: string | number | null | undefined) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function requireRingCentralClientId() {
  if (!ringCentralClientId) {
    throw new Error("Missing RingCentral client id.");
  }

  return ringCentralClientId;
}

function requireRingCentralUserJwt() {
  if (!ringCentralUserJwt) {
    throw new Error("Missing RingCentral JWT credential.");
  }

  return ringCentralUserJwt;
}

function buildEmptyStatus(message = null): RingCentralStatus {
  return {
    connected: false,
    accountId: null,
    extensionId: null,
    selectedCallerId: null,
    availableCallerIds: [],
    connectedAt: null,
    updatedAt: null,
    expiresAt: null,
    message,
  };
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
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status")
    .eq("auth_user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  if (!data) {
    throw Object.assign(new Error("Workspace profile not found."), { status: 404 });
  }

  return {
    currentUser,
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

async function fetchRingCentralAccountInfo(accessToken: string) {
  const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/account/~"), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as RingCentralAccountResponse & { message?: string }) : {};

  if (!response.ok) {
    throw Object.assign(
      new Error(data.message || `RingCentral account lookup failed (${response.status}).`),
      { status: response.status },
    );
  }

  return {
    accountId: normalizeIdentifier(data.id),
  };
}

async function fetchRingCentralCallerIds(accessToken: string) {
  const response = await fetch(
    getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/phone-number?page=1&perPage=100"),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const text = await response.text();
  const data = text ? (JSON.parse(text) as RingCentralCallerNumberResponse & { message?: string }) : {};

  if (!response.ok) {
    throw Object.assign(new Error(data.message || `RingCentral caller ID lookup failed (${response.status}).`), {
      status: response.status,
    });
  }

  return (data.records ?? [])
    .map((record) => {
      const phoneNumber = typeof record.phoneNumber === "string" ? normalizeNumber(record.phoneNumber) : "";
      if (!phoneNumber) {
        return null;
      }

      const usageType = typeof record.usageType === "string" ? record.usageType : null;
      const features = Array.isArray(record.features)
        ? record.features.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];

      return {
        phoneNumber,
        usageType,
        features,
        label: `${formatRingCentralPhoneNumber(phoneNumber)}${usageType ? ` - ${usageType}` : ""}`,
      } satisfies RingCentralPhoneNumber;
    })
    .filter((value): value is RingCentralPhoneNumber => Boolean(value));
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
  row: Partial<RingCentralIntegrationRow> & { app_user_id: string },
) {
  const payload = {
    app_user_id: row.app_user_id,
    account_id: row.account_id ?? null,
    extension_id: row.extension_id ?? null,
    access_token: row.access_token ?? "",
    refresh_token: row.refresh_token ?? "",
    token_type: row.token_type ?? "Bearer",
    scope: row.scope ?? null,
    access_token_expires_at: row.access_token_expires_at ?? new Date().toISOString(),
    refresh_token_expires_at: row.refresh_token_expires_at ?? null,
    selected_caller_id: row.selected_caller_id ?? null,
    connected_at: row.connected_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.from("ringcentral_integrations").upsert(payload);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

async function saveIntegrationFromToken(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  token: RingCentralTokenResponse,
) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const refreshTokenExpiresAt = token.refresh_token_expires_in
    ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
    : null;

  const [callerIdsResult, accountInfoResult] = await Promise.allSettled([
    fetchRingCentralCallerIds(token.access_token),
    fetchRingCentralAccountInfo(token.access_token),
  ]);

  const callerIds =
    callerIdsResult.status === "fulfilled" ? callerIdsResult.value : ([] as RingCentralPhoneNumber[]);
  const accountInfo = accountInfoResult.status === "fulfilled" ? accountInfoResult.value : null;
  const selectedCallerId = selectRingCentralCallerId(callerIds, null) || null;

  await saveIntegration(serviceClient, {
    app_user_id: workspaceUserId,
    account_id: accountInfo?.accountId ?? null,
    extension_id: token.owner_id ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "Bearer",
    scope: token.scope ?? null,
    access_token_expires_at: expiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    selected_caller_id: selectedCallerId,
    connected_at: new Date().toISOString(),
  });

  return buildIntegrationStatus(serviceClient, workspaceUserId);
}

async function deleteIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { error } = await serviceClient.from("ringcentral_integrations").delete().eq("app_user_id", workspaceUserId);
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

function mapRingCentralStatus(
  row: RingCentralIntegrationRow | null,
  callerIds: RingCentralPhoneNumber[],
  selectedCallerId: string | null,
  message: string | null = null,
): RingCentralStatus {
  if (!row) {
    return buildEmptyStatus(message);
  }

  return {
    connected: true,
    accountId: row.account_id,
    extensionId: row.extension_id,
    selectedCallerId,
    availableCallerIds: callerIds,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    expiresAt: row.access_token_expires_at,
    message,
  };
}

async function buildIntegrationStatus(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  options: { refresh?: boolean } = {},
) {
  const row = await loadIntegration(serviceClient, workspaceUserId);
  if (!row) {
    return buildEmptyStatus();
  }

  const activeRow = options.refresh === false ? row : await refreshIntegrationIfNeeded(serviceClient, workspaceUserId, row);
  let callerIds: RingCentralPhoneNumber[] = [];
  let message: string | null = null;

  try {
    callerIds = await fetchRingCentralCallerIds(activeRow.access_token);
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to load RingCentral caller IDs.";
  }

  let selectedCallerId = selectRingCentralCallerId(callerIds, activeRow.selected_caller_id || null);
  if (!selectedCallerId && activeRow.selected_caller_id) {
    selectedCallerId = activeRow.selected_caller_id;
  }

  if (selectedCallerId !== activeRow.selected_caller_id && selectedCallerId) {
    await saveIntegration(serviceClient, {
      ...activeRow,
      selected_caller_id: selectedCallerId,
    });
  }

  return mapRingCentralStatus(activeRow, callerIds, selectedCallerId || null, message);
}

async function handleAuthUrl(body: Record<string, unknown>) {
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
  const state = typeof body.state === "string" ? body.state.trim() : "";
  const codeChallenge = typeof body.codeChallenge === "string" ? body.codeChallenge.trim() : "";

  if (!redirectUri || !state || !codeChallenge) {
    return jsonResponse({ message: "redirectUri, state, and codeChallenge are required." }, { status: 400 });
  }

  return jsonResponse({
    authorizationUrl: buildRingCentralAuthorizationUrl({
      clientId: requireRingCentralClientId(),
      redirectUri,
      codeChallenge,
      state,
      serverUrl: ringCentralServerUrl,
    }),
  });
}

async function handleConnect(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const token = await fetchRingCentralToken({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: requireRingCentralUserJwt(),
  });

  const status = await saveIntegrationFromToken(serviceClient, workspaceUser.id, token);
  return jsonResponse({ status });
}

async function handleExchange(
  request: Request,
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const codeVerifier = typeof body.codeVerifier === "string" ? body.codeVerifier.trim() : "";
  const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri.trim() : "";
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ message: "code, codeVerifier, and redirectUri are required." }, { status: 400 });
  }

  const token = await fetchRingCentralToken({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  const status = await saveIntegrationFromToken(serviceClient, workspaceUser.id, token);
  return jsonResponse({ status });
}

async function handleStatus(serviceClient: ReturnType<typeof createServiceClient>, workspaceUser: AppUserRow) {
  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status });
}

async function handleUpdateCallerId(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const callerId = typeof body.callerId === "string" ? normalizeNumber(body.callerId) : "";
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  const callerIdCandidates = status.availableCallerIds.filter(
    (number) => number.features?.includes("CallerId") ?? false,
  );
  const allowedCallerIds = new Set(
    (callerIdCandidates.length ? callerIdCandidates : status.availableCallerIds).map((number) =>
      normalizeNumber(number.phoneNumber),
    ),
  );

  if (callerId && !allowedCallerIds.has(callerId)) {
    return jsonResponse({ message: "Choose a caller ID from your RingCentral numbers." }, { status: 400 });
  }

  await saveIntegration(serviceClient, {
    ...integration,
    selected_caller_id: callerId || null,
  });

  const nextStatus = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status: nextStatus });
}

async function handleDisconnect(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  await deleteIntegration(serviceClient, workspaceUser.id);
  return jsonResponse({ success: true });
}

async function handleRingOut(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const callerId = typeof body.callerId === "string" ? body.callerId.trim() : "";
  const playPrompt = typeof body.playPrompt === "boolean" ? body.playPrompt : false;
  if (!to) {
    return jsonResponse({ message: "A destination phone number is required." }, { status: 400 });
  }

  const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const selectedCallerId = normalizeNumber(callerId) || normalizeNumber(refreshed.selected_caller_id ?? "");
  const payload = buildRingOutRequestPayload({
    to,
    callerId: selectedCallerId || null,
    playPrompt,
  });

  const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/ring-out"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${refreshed.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw Object.assign(
      new Error(
        typeof data.message === "string"
          ? data.message
          : `RingCentral ring-out request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }

  const ringOutStatus = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : {};
  return jsonResponse({
    success: true,
    call: {
      id: typeof data.id === "string" ? data.id : null,
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
      to: payload.to.phoneNumber,
      from: payload.from?.phoneNumber ?? null,
    },
  });
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

    if (action === "connect") {
      return await handleConnect(serviceClient, workspaceUser);
    }

    if (action === "auth-url") {
      return await handleAuthUrl(body);
    }

    if (action === "exchange") {
      return await handleExchange(request, body, serviceClient, workspaceUser);
    }

    if (action === "status") {
      return await handleStatus(serviceClient, workspaceUser);
    }

    if (action === "update-caller-id") {
      return await handleUpdateCallerId(body, serviceClient, workspaceUser);
    }

    if (action === "disconnect") {
      return await handleDisconnect(serviceClient, workspaceUser);
    }

    if (action === "ring-out") {
      return await handleRingOut(body, serviceClient, workspaceUser);
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
