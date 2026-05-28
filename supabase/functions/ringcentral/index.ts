import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient, getAuthenticatedUser } from "../_shared/supabase.ts";
import {
  buildRingCentralVideoBridgeRequest,
  createRingCentralRequestError,
  extractRingCentralSessionId,
  fetchRingCentralCallLogRecords,
  fetchRingCentralRecordingContent,
  fetchRingCentralRecordingForSession,
  formatRingCentralPhoneNumber,
  isRingCentralOutboundNumber,
  normalizeRingCentralSessionId,
  normalizeRingCentralVideoBridge,
  readText,
  retryRingCentralRequestAfterRefresh,
  selectRingCentralRecordingForSession,
  RINGCENTRAL_TELEPHONY_SESSION_FILTER,
  type RingCentralPhoneNumber,
  type RingCentralCallLogRecordSummary,
  type RingCentralRecordingMatch,
  type RingCentralVideoBridge,
  type RingCentralVideoBridgeRequest,
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
  cached_ringout_numbers: string | null;
  subscription_id: string | null;
  subscription_expires_at: string | null;
  webhook_validation_token: string | null;
  last_inbound_event_at: string | null;
  active_telephony_session_id: string | null;
  active_telephony_party_id: string | null;
  active_telephony_direction: string | null;
  active_telephony_status_code: string | null;
  active_telephony_updated_at: string | null;
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
  mainNumber?: string | null;
  operator?: {
    id?: string | number;
    extensionNumber?: string | null;
  };
}

interface RingCentralExtensionResponse {
  id?: string | number;
  extensionNumber?: string | null;
}

interface RingCentralSubscriptionResponse {
  id?: string;
  subscriptionId?: string;
  expirationTime?: string;
  expiryTime?: string;
}

interface RingCentralStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  accountMainNumber: string | null;
  selectedCallerIdNumber: string | null;
  availableCallerIdNumbers: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
  activeTelephonySessionId: string | null;
  activeTelephonyPartyId: string | null;
  activeTelephonyDirection: string | null;
  activeTelephonyStatusCode: string | null;
  activeTelephonyUpdatedAt: string | null;
  debug?: RingCentralStatusDebug;
}

interface RingCentralStatusDebug {
  accountInfoFailed: boolean;
  ringOutNumbersPartialFailure: boolean;
  cachedCallerIdNumbers: RingCentralPhoneNumber[];
  ringOutNumberSources: RingCentralPhoneNumberFetchSourceResult[];
}

interface RingCentralPhoneNumberFetchSourceResult {
  name: string;
  numbers: RingCentralPhoneNumber[];
  error: string | null;
}

interface RingCentralPhoneNumberFetchResult {
  numbers: RingCentralPhoneNumber[];
  partialFailure: boolean;
  sources?: RingCentralPhoneNumberFetchSourceResult[];
}

interface RingCentralSipProvisionProxyRecord {
  proxy?: string;
  proxyTLS?: string;
}

interface RingCentralSipProvisionInfoRecord {
  domain?: string;
  sipDomain?: string;
  outboundProxy?: string;
  outboundProxyBackup?: string;
  outboundProxies?: RingCentralSipProvisionProxyRecord[];
  username?: string;
  userName?: string;
  password?: string;
  authorizationId?: string;
}

interface RingCentralSipProvisionResponse {
  sipInfo?: RingCentralSipProvisionInfoRecord[];
  device?: {
    id?: string | number | null;
  } | null;
}

interface RingCentralBrowserVoiceSession {
  provider: "ringcentral";
  available: boolean;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  authorizationId: string | null;
  sipUri: string | null;
  authorizationUsername: string | null;
  authorizationPassword: string | null;
  dialPrefix: string | null;
  displayName: string | null;
  message: string | null;
}

interface CallLogRecordingRow {
  id: string;
  lead_id: string;
  agent_id: string | null;
  direction: "incoming" | "outgoing";
  recording_enabled: boolean;
  recording_provider: string | null;
  recording_url: string | null;
  ringcentral_session_id: string | null;
  ringcentral_recording_id: string | null;
  recording_last_checked_at: string | null;
  notes: string | null;
  created_at: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralClientId = Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "";
const ringCentralClientSecret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || "";
const ringCentralUserJwt = Deno.env.get("RINGCENTRAL_USER_JWT")?.trim() || "";
const ringCentralRecordingSyncLimit = 100;
const ringCentralRecordingRecheckIntervalMs = 10 * 60 * 1000;
const ringCentralRecordingPropagationWindowMs = 15 * 60 * 1000;

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

function requireSupabaseUrl() {
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL.");
  }

  return supabaseUrl;
}

function buildRingCentralWebhookUrl() {
  return new URL("/functions/v1/ringcentral-webhook", requireSupabaseUrl()).toString();
}

function buildRingCentralWebhookValidationToken() {
  return crypto.randomUUID();
}

function buildEmptyStatus(message = null): RingCentralStatus {
  return {
    connected: false,
    accountId: null,
    extensionId: null,
    accountMainNumber: null,
    selectedCallerIdNumber: null,
    availableCallerIdNumbers: [],
    connectedAt: null,
    updatedAt: null,
    expiresAt: null,
    message,
    activeTelephonySessionId: null,
    activeTelephonyPartyId: null,
    activeTelephonyDirection: null,
    activeTelephonyStatusCode: null,
    activeTelephonyUpdatedAt: null,
  };
}

function buildUnavailableBrowserVoiceSession(
  message: string,
  source: RingCentralBrowserVoiceSession["source"] = "unconfigured",
): RingCentralBrowserVoiceSession {
  return {
    provider: "ringcentral",
    available: false,
    source,
    callerId: null,
    websocketUrl: null,
    sipDomain: null,
    username: null,
    profileId: null,
    profileLabel: null,
    authorizationId: null,
    sipUri: null,
    authorizationUsername: null,
    authorizationPassword: null,
    dialPrefix: null,
    displayName: null,
    message,
  };
}

function getRingCentralApiUrl(path: string) {
  return new URL(path, ringCentralServerUrl).toString();
}

function normalizeWssUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `wss://${trimmed}`;
}

function readOutboundProxy(record: RingCentralSipProvisionInfoRecord) {
  const direct = readText(record.outboundProxy);
  if (direct) {
    return direct;
  }

  for (const proxy of record.outboundProxies ?? []) {
    const proxyTls = readText(proxy.proxyTLS);
    if (proxyTls) {
      return proxyTls;
    }

    const proxyPlain = readText(proxy.proxy);
    if (proxyPlain) {
      return proxyPlain;
    }
  }

  return "";
}

function readOutboundProxyBackup(record: RingCentralSipProvisionInfoRecord, primaryProxy: string) {
  const direct = readText(record.outboundProxyBackup);
  if (direct) {
    return direct;
  }

  const proxies = record.outboundProxies ?? [];
  let primaryMatched = false;
  for (const proxy of proxies) {
    const candidate = readText(proxy.proxyTLS) || readText(proxy.proxy);
    if (!candidate) {
      continue;
    }

    if (!primaryMatched && candidate === primaryProxy) {
      primaryMatched = true;
      continue;
    }

    if (candidate !== primaryProxy) {
      return candidate;
    }
  }

  return primaryProxy;
}

function buildBrowserVoiceSession(
  data: RingCentralSipProvisionResponse,
  workspaceUser: AppUserRow,
  selectedCallerId: string | null,
): RingCentralBrowserVoiceSession {
  const sipInfo = data.sipInfo?.[0] ?? null;
  if (!sipInfo) {
    return buildUnavailableBrowserVoiceSession("RingCentral browser calling is not ready.", "ringcentral");
  }

  const domain = readText(sipInfo.domain) || readText(sipInfo.sipDomain);
  const username = readText(sipInfo.username) || readText(sipInfo.userName);
  const password = readText(sipInfo.password);
  const authorizationId = readText(sipInfo.authorizationId) || username || readText(data.device?.id);
  const outboundProxy = readOutboundProxy(sipInfo);
  const outboundProxyBackup = readOutboundProxyBackup(sipInfo, outboundProxy);
  const websocketUrl = normalizeWssUrl(outboundProxy || outboundProxyBackup);
  const displayName = workspaceUser.full_name.trim();
  const callerId = normalizeNumber(selectedCallerId ?? "");
  const available = Boolean(
    websocketUrl &&
    domain &&
    username &&
    password &&
    authorizationId &&
    displayName,
  );

  if (!available) {
    return {
      ...buildUnavailableBrowserVoiceSession(
        "RingCentral browser calling is not ready.",
        "ringcentral",
      ),
      callerId: callerId || null,
      displayName,
      authorizationId: authorizationId || null,
      username: username || null,
      sipDomain: domain || null,
      websocketUrl: websocketUrl || null,
      authorizationUsername: username || null,
      authorizationPassword: password || null,
      sipUri: username && domain ? `sip:${username}@${domain}` : null,
    };
  }

  return {
    provider: "ringcentral",
    available: true,
    source: "ringcentral",
    callerId: callerId || null,
    websocketUrl,
    sipDomain: domain,
    username,
    profileId: null,
    profileLabel: null,
    authorizationId,
    sipUri: `sip:${username}@${domain}`,
    authorizationUsername: username,
    authorizationPassword: password,
    dialPrefix: null,
    displayName,
    message: null,
  };
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

async function fetchRingCentralAccountInfo(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const [accountResponse, extensionResponse] = await Promise.all([
      fetch(getRingCentralApiUrl("/restapi/v1.0/account/~"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
      fetch(getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~"), {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }),
    ]);

    const accountText = await accountResponse.text();
    const accountData = accountText
      ? (JSON.parse(accountText) as RingCentralAccountResponse & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};

    if (!accountResponse.ok) {
      throw createRingCentralRequestError(
        accountResponse.status,
        accountData,
        `RingCentral account lookup failed (${accountResponse.status}).`,
      );
    }

    const extensionText = await extensionResponse.text();
    const extensionData = extensionText
      ? (JSON.parse(extensionText) as RingCentralExtensionResponse & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};

    if (!extensionResponse.ok) {
      throw createRingCentralRequestError(
        extensionResponse.status,
        extensionData,
        `RingCentral extension lookup failed (${extensionResponse.status}).`,
      );
    }

    return {
      accountId: normalizeIdentifier(accountData.id),
      mainNumber: typeof accountData.mainNumber === "string" ? accountData.mainNumber.trim() : null,
      extensionId: normalizeIdentifier(extensionData.id) ?? normalizeIdentifier(accountData.operator?.id) ?? null,
      extensionNumber: typeof extensionData.extensionNumber === "string" && extensionData.extensionNumber.trim()
        ? extensionData.extensionNumber.trim()
        : typeof accountData.operator?.extensionNumber === "string" && accountData.operator.extensionNumber.trim()
          ? accountData.operator.extensionNumber.trim()
      : null,
    };
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function fetchRingCentralSipProvision(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const response = await fetch(getRingCentralApiUrl("/restapi/v1.0/client-info/sip-provision"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sipInfo: [{ transport: "WSS" }],
      }),
    });

    const text = await response.text();
    const data = text ? (JSON.parse(text) as RingCentralSipProvisionResponse & {
      message?: string;
      error_description?: string;
      errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
    }) : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral SIP provisioning failed (${response.status}).`,
      );
    }

    return data as RingCentralSipProvisionResponse;
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function createRingCentralVideoBridge(
  accessToken: string,
  payload: RingCentralVideoBridgeRequest,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const response = await fetch(getRingCentralApiUrl("/rcvideo/v2/account/~/extension/~/bridges"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) as unknown : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral video meeting creation failed (${response.status}).`,
      );
    }

    return normalizeRingCentralVideoBridge(data);
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

function selectPreferredCallerIdNumber(
  numbers: RingCentralPhoneNumber[],
  preferredPhoneNumber: string | null,
) {
  const eligibleNumbers = numbers.filter(isRingCentralOutboundNumber);
  if (!eligibleNumbers.length) {
    return null;
  }

  const normalizedPreferred = preferredPhoneNumber ? normalizeNumber(preferredPhoneNumber) : "";
  if (normalizedPreferred) {
    const preferredMatch = eligibleNumbers.find((number) => normalizeNumber(number.phoneNumber) === normalizedPreferred);
    if (preferredMatch) {
      return normalizeNumber(preferredMatch.phoneNumber);
    }
  }

  const rankedMatches = [
    eligibleNumbers.find((number) => number.usageType === "DirectNumber" && number.type !== "FaxOnly"),
    eligibleNumbers.find((number) => number.usageType === "DirectNumber"),
    eligibleNumbers.find((number) => (number.features ?? []).includes("CallerId") && number.type !== "FaxOnly"),
    eligibleNumbers[0],
  ];

  for (const match of rankedMatches) {
    if (match?.phoneNumber) {
      return normalizeNumber(match.phoneNumber);
    }
  }

  return null;
}

async function fetchRingCentralCallerIdNumbers(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const numbers = await fetchRingCentralForwardingNumbers(token);
    return {
      numbers: numbers.numbers.filter(isRingCentralOutboundNumber),
      partialFailure: numbers.partialFailure,
      sources: numbers.sources,
    };
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

function mergeRingCentralPhoneNumbers(
  numbersByKey: Map<string, RingCentralPhoneNumber>,
  candidates: RingCentralPhoneNumber[],
) {
  for (const candidate of candidates) {
    const phoneNumber = normalizeNumber(candidate.phoneNumber);
    if (!phoneNumber) {
      continue;
    }

    const existing = numbersByKey.get(phoneNumber);
    const features = new Set([...(existing?.features ?? []), ...(candidate.features ?? [])]);
    numbersByKey.set(phoneNumber, {
      phoneNumber,
      usageType: candidate.usageType ?? existing?.usageType ?? null,
      type: candidate.type ?? existing?.type ?? null,
      features: [...features],
      enabled: candidate.enabled ?? existing?.enabled,
      label:
        candidate.label ??
        existing?.label ??
        `${formatRingCentralPhoneNumber(phoneNumber)}${candidate.usageType ? ` - ${candidate.usageType}` : ""}`,
    });
  }
}

function parseCachedRingCentralPhoneNumbers(value: string | null) {
  if (!value) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const numbersByKey = new Map<string, RingCentralPhoneNumber>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Partial<RingCentralPhoneNumber>;
    const phoneNumber = typeof record.phoneNumber === "string" ? normalizeNumber(record.phoneNumber) : "";
    if (!phoneNumber) {
      continue;
    }

    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber,
      usageType: typeof record.usageType === "string" ? record.usageType : null,
      type: typeof record.type === "string" ? record.type : null,
      features: Array.isArray(record.features)
        ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [],
      enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
      label: typeof record.label === "string" ? record.label.trim() : undefined,
    }]);
  }

  return [...numbersByKey.values()];
}

function serializeRingCentralPhoneNumbers(numbers: RingCentralPhoneNumber[]) {
  return JSON.stringify(numbers);
}

function collectRingCentralPhoneNumbersFromValue(
  value: unknown,
  numbersByKey: Map<string, RingCentralPhoneNumber>,
  parentEnabled = true,
) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, parentEnabled));
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  const enabled = parentEnabled && (typeof record.enabled === "boolean" ? record.enabled : true);
  const label =
    typeof record.label === "string" && record.label.trim()
      ? record.label.trim()
      : typeof record.name === "string" && record.name.trim()
        ? record.name.trim()
        : undefined;
  const features = Array.isArray(record.features)
    ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const type = typeof record.type === "string" ? record.type : null;
  const usageType = typeof record.usageType === "string" ? record.usageType : null;

  const directPhoneNumber = typeof record.phoneNumber === "string" ? normalizeNumber(record.phoneNumber) : "";
  if (directPhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: directPhoneNumber,
      usageType,
      type,
      features,
      enabled,
      label,
    }]);
  }

  const destination = record.destination && typeof record.destination === "object"
    ? (record.destination as Record<string, unknown>)
    : null;
  const destinationPhoneNumber = destination && typeof destination.phoneNumber === "string"
    ? normalizeNumber(destination.phoneNumber)
    : "";
  if (destinationPhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: destinationPhoneNumber,
      usageType: usageType ?? "ForwardedNumber",
      type: type ?? "Other",
      features: features.length ? features : ["CallForwarding"],
      enabled,
      label,
    }]);
  }

  const device = record.device && typeof record.device === "object"
    ? (record.device as Record<string, unknown>)
    : null;
  const devicePhoneNumber = device && typeof device.phoneNumber === "string"
    ? normalizeNumber(device.phoneNumber)
    : "";
  if (devicePhoneNumber) {
    mergeRingCentralPhoneNumbers(numbersByKey, [{
      phoneNumber: devicePhoneNumber,
      usageType: usageType ?? "ForwardedNumber",
      type: type ?? "PhoneLine",
      features: features.length ? features : ["CallForwarding", "CallFlip"],
      enabled,
      label,
    }]);
  }

  if (Array.isArray(record.records)) {
    record.records.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.items)) {
    record.items.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.targets)) {
    record.targets.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (Array.isArray(record.actions)) {
    record.actions.forEach((item) => collectRingCentralPhoneNumbersFromValue(item, numbersByKey, enabled));
  }

  if (record.dispatching && typeof record.dispatching === "object") {
    collectRingCentralPhoneNumbersFromValue(record.dispatching, numbersByKey, enabled);
  }
}

async function fetchRingCentralOwnedPhoneNumbers(accessToken: string): Promise<RingCentralPhoneNumberFetchResult> {
  const requests = [
    {
      name: "extension-phone-number",
      path: "/restapi/v1.0/account/~/extension/~/phone-number?page=1&perPage=100",
    },
    {
      name: "account-phone-number",
      path: "/restapi/v1.0/account/~/phone-number?page=1&perPage=100",
    },
  ].map(async ({ path }) => {
    const response = await fetch(getRingCentralApiUrl(path), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) as unknown : {};

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral phone number lookup failed (${response.status}).`,
      );
    }

    const numbersByKey = new Map<string, RingCentralPhoneNumber>();
    collectRingCentralPhoneNumbersFromValue(data, numbersByKey);
    return [...numbersByKey.values()];
  });

  const results = await Promise.allSettled(requests);
  const numbersByKey = new Map<string, RingCentralPhoneNumber>();
  const sources: RingCentralPhoneNumberFetchSourceResult[] = [];
  let partialFailure = false;

  for (const [index, result] of results.entries()) {
    const sourceName = index === 0 ? "extension-phone-number" : "account-phone-number";
    if (result.status === "fulfilled") {
      mergeRingCentralPhoneNumbers(numbersByKey, result.value);
      sources.push({
        name: sourceName,
        numbers: result.value,
        error: null,
      });
    } else {
      partialFailure = true;
      sources.push({
        name: sourceName,
        numbers: [],
        error: result.reason instanceof Error ? result.reason.message : "Unable to load RingCentral numbers.",
      });
    }
  }

  if (results.some((result) => result.status === "fulfilled")) {
    return {
      numbers: [...numbersByKey.values()],
      partialFailure,
      sources,
    };
  }

  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => result.reason)
    .filter((reason): reason is Error => reason instanceof Error);

  if (errors.length > 0) {
    throw errors[0];
  }

  return {
    numbers: [],
    partialFailure: true,
    sources,
  };
}

async function fetchRingCentralForwardingNumbers(
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
): Promise<RingCentralPhoneNumberFetchResult> {
  const request = async (token: string) => {
    const fetchLegacyForwardingNumbers = async () => {
      const response = await fetch(
        getRingCentralApiUrl("/restapi/v1.0/account/~/extension/~/forwarding-number?page=1&perPage=100"),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const text = await response.text();
      let data: unknown = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = {};
        }
      }

      if (!response.ok) {
        throw createRingCentralRequestError(
          response.status,
          data,
          `RingCentral forwarding number lookup failed (${response.status}).`,
        );
      }

      const numbersByKey = new Map<string, RingCentralPhoneNumber>();
      const addLegacyNumbers = (candidate: Partial<RingCentralPhoneNumber> & { phoneNumber?: string | null }) => {
        const phoneNumber = typeof candidate.phoneNumber === "string" ? normalizeNumber(candidate.phoneNumber) : "";
        if (!phoneNumber) {
          return;
        }

        const existing = numbersByKey.get(phoneNumber);
        const features = new Set([...(existing?.features ?? []), ...(candidate.features ?? [])]);
        numbersByKey.set(phoneNumber, {
          phoneNumber,
          usageType: candidate.usageType ?? existing?.usageType ?? null,
          type: candidate.type ?? existing?.type ?? null,
          features: [...features],
          enabled: candidate.enabled ?? existing?.enabled,
          label:
            candidate.label ??
            existing?.label ??
            `${formatRingCentralPhoneNumber(phoneNumber)}${candidate.usageType ? ` - ${candidate.usageType}` : ""}`,
        });
      };

      const collectLegacyFromValue = (value: unknown) => {
        if (!value) {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach(collectLegacyFromValue);
          return;
        }

        if (typeof value !== "object") {
          return;
        }

        const record = value as Record<string, unknown>;
        const directPhoneNumber = typeof record.phoneNumber === "string" ? record.phoneNumber : "";
        if (directPhoneNumber) {
          addLegacyNumbers({
            phoneNumber: directPhoneNumber,
            usageType: typeof record.usageType === "string" ? record.usageType : null,
            type: typeof record.type === "string" ? record.type : null,
            features: Array.isArray(record.features)
              ? record.features.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              : [],
            enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
            label: typeof record.label === "string" ? record.label.trim() : undefined,
          });
        }

        if (Array.isArray(record.records)) {
          record.records.forEach(collectLegacyFromValue);
        }

        if (Array.isArray(record.items)) {
          record.items.forEach(collectLegacyFromValue);
        }
      };

      collectLegacyFromValue(data);
      return [...numbersByKey.values()];
    };

    const fetchForwardingTargets = async () => {
      const response = await fetch(
        getRingCentralApiUrl("/restapi/v2/accounts/~/extensions/~/comm-handling/voice/forwarding-targets"),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const text = await response.text();
      const data = text
        ? (JSON.parse(text) as unknown)
        : {};

      if (!response.ok) {
        throw createRingCentralRequestError(
          response.status,
          data,
          `RingCentral forwarding target lookup failed (${response.status}).`,
        );
      }

      const numbersByKey = new Map<string, RingCentralPhoneNumber>();
      collectRingCentralPhoneNumbersFromValue(data, numbersByKey);
      return [...numbersByKey.values()];
    };

    const [forwardingTargetsResult, legacyNumbersResult, ownedPhoneNumbersResult] = await Promise.allSettled([
      fetchForwardingTargets(),
      fetchLegacyForwardingNumbers(),
      fetchRingCentralOwnedPhoneNumbers(token),
    ]);

    const numbersByKey = new Map<string, RingCentralPhoneNumber>();
    const sources: RingCentralPhoneNumberFetchSourceResult[] = [];
    let partialFailure = false;
    const mergeResult = (
      result: PromiseSettledResult<RingCentralPhoneNumber[] | RingCentralPhoneNumberFetchResult>,
      name: string,
    ) => {
      if (result.status === "fulfilled") {
        if (Array.isArray(result.value)) {
          mergeRingCentralPhoneNumbers(numbersByKey, result.value);
          sources.push({
            name,
            numbers: result.value,
            error: null,
          });
          return;
        }

        mergeRingCentralPhoneNumbers(numbersByKey, result.value.numbers);
        partialFailure = partialFailure || result.value.partialFailure;
        if (result.value.sources?.length) {
          sources.push(...result.value.sources);
        } else {
          sources.push({
            name,
            numbers: result.value.numbers,
            error: null,
          });
        }
        return;
      }

      partialFailure = true;
      sources.push({
        name,
        numbers: [],
        error: result.reason instanceof Error ? result.reason.message : "Unable to load RingCentral numbers.",
      });
    };

    mergeResult(forwardingTargetsResult, "forwarding-targets");
    mergeResult(legacyNumbersResult, "legacy-forwarding-number");
    mergeResult(ownedPhoneNumbersResult, "owned-phone-number");

    if (
      forwardingTargetsResult.status === "fulfilled" ||
      legacyNumbersResult.status === "fulfilled" ||
      ownedPhoneNumbersResult.status === "fulfilled"
    ) {
      return {
        numbers: [...numbersByKey.values()],
        partialFailure,
        sources,
      };
    }

    const errors = [forwardingTargetsResult, legacyNumbersResult, ownedPhoneNumbersResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason)
      .filter((reason): reason is Error => reason instanceof Error);

    if (errors.length > 0) {
      throw errors[0];
    }

    return {
      numbers: [],
      partialFailure: true,
      sources,
    };
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function loadIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
) {
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, cached_ringout_numbers, subscription_id, subscription_expires_at, webhook_validation_token, last_inbound_event_at, active_telephony_session_id, active_telephony_party_id, active_telephony_direction, active_telephony_status_code, active_telephony_updated_at, connected_at, updated_at",
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
    cached_ringout_numbers: row.cached_ringout_numbers ?? null,
    subscription_id: row.subscription_id ?? null,
    subscription_expires_at: row.subscription_expires_at ?? null,
    webhook_validation_token: row.webhook_validation_token ?? null,
    last_inbound_event_at: row.last_inbound_event_at ?? null,
    active_telephony_session_id: row.active_telephony_session_id ?? null,
    active_telephony_party_id: row.active_telephony_party_id ?? null,
    active_telephony_direction: row.active_telephony_direction ?? null,
    active_telephony_status_code: row.active_telephony_status_code ?? null,
    active_telephony_updated_at: row.active_telephony_updated_at ?? null,
    connected_at: row.connected_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.from("ringcentral_integrations").upsert(payload);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

async function refreshIntegration(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: RingCentralIntegrationRow,
) {
  const refreshed = await fetchRingCentralToken({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });

  const latestRow = await loadIntegration(serviceClient, row.app_user_id);
  const baseRow = latestRow ?? row;
  const updatedRow: RingCentralIntegrationRow = {
    ...baseRow,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? baseRow.refresh_token,
    token_type: refreshed.token_type ?? baseRow.token_type,
    scope: refreshed.scope ?? baseRow.scope,
    access_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    refresh_token_expires_at: refreshed.refresh_token_expires_in
      ? new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString()
      : baseRow.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };

  await saveIntegration(serviceClient, updatedRow);
  return updatedRow;
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

  const [ringOutNumbersResult, accountInfoResult] = await Promise.allSettled([
    fetchRingCentralCallerIdNumbers(token.access_token),
    fetchRingCentralAccountInfo(token.access_token),
  ]);

  const ringOutNumbers =
    ringOutNumbersResult.status === "fulfilled" ? ringOutNumbersResult.value.numbers : ([] as RingCentralPhoneNumber[]);
  const ringOutNumbersPartialFailure =
    ringOutNumbersResult.status === "fulfilled" ? ringOutNumbersResult.value.partialFailure : true;
  const accountInfo = accountInfoResult.status === "fulfilled" ? accountInfoResult.value : null;
  const accountInfoSucceeded = accountInfoResult.status === "fulfilled";
  const callerIdNumbersByKey = new Map<string, RingCentralPhoneNumber>();
  const accountMainNumber = accountInfo?.mainNumber ? normalizeNumber(accountInfo.mainNumber) : null;
  if (accountMainNumber) {
    mergeRingCentralPhoneNumbers(callerIdNumbersByKey, [{
      phoneNumber: accountMainNumber,
      usageType: "MainCompanyNumber",
      type: "MainCompanyNumber",
      features: ["CallerId"],
      enabled: true,
      label: formatRingCentralPhoneNumber(accountMainNumber),
    }]);
  }
  mergeRingCentralPhoneNumbers(callerIdNumbersByKey, ringOutNumbers);
  const selectedCallerIdNumber = selectPreferredCallerIdNumber([...callerIdNumbersByKey.values()], null);
  const cachedRingoutNumbers =
    accountInfoSucceeded && !ringOutNumbersPartialFailure
      ? serializeRingCentralPhoneNumbers([...callerIdNumbersByKey.values()])
      : null;

  await saveIntegration(serviceClient, {
    app_user_id: workspaceUserId,
    account_id: accountInfo?.accountId ?? null,
    extension_id: accountInfo?.extensionId ?? token.owner_id ?? null,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type ?? "Bearer",
    scope: token.scope ?? null,
    access_token_expires_at: expiresAt,
    refresh_token_expires_at: refreshTokenExpiresAt,
    selected_caller_id: selectedCallerIdNumber || null,
    cached_ringout_numbers: cachedRingoutNumbers,
    connected_at: new Date().toISOString(),
    active_telephony_session_id: null,
    active_telephony_party_id: null,
    active_telephony_direction: null,
    active_telephony_status_code: null,
    active_telephony_updated_at: null,
  });

  return buildIntegrationStatus(serviceClient, workspaceUserId);
}

function parseRingCentralSubscriptionResponse(data: Record<string, unknown>) {
  const id =
    typeof data.id === "string" && data.id.trim()
      ? data.id.trim()
      : typeof data.subscriptionId === "string" && data.subscriptionId.trim()
        ? data.subscriptionId.trim()
        : "";
  const expirationTime =
    typeof data.expirationTime === "string" && data.expirationTime.trim()
      ? data.expirationTime.trim()
      : typeof data.expiryTime === "string" && data.expiryTime.trim()
        ? data.expiryTime.trim()
        : "";

  return { id, expirationTime };
}

async function requestRingCentralSubscription(
  accessToken: string,
  subscriptionId: string | null,
  validationToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const request = async (token: string) => {
    const body = JSON.stringify({
      eventFilters: [RINGCENTRAL_TELEPHONY_SESSION_FILTER],
      deliveryMode: {
        transportType: "WebHook",
        address: buildRingCentralWebhookUrl(),
        validationToken,
      },
    });

    let response = await fetch(
      subscriptionId
        ? getRingCentralApiUrl(`/restapi/v1.0/subscription/${encodeURIComponent(subscriptionId)}`)
        : getRingCentralApiUrl("/restapi/v1.0/subscription"),
      {
        method: subscriptionId ? "PUT" : "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      },
    );

    let text = await response.text();
    let data = text
      ? (JSON.parse(text) as Record<string, unknown> & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};

    if (!response.ok && response.status === 404 && subscriptionId) {
      response = await fetch(getRingCentralApiUrl("/restapi/v1.0/subscription"), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      text = await response.text();
      data = text
        ? (JSON.parse(text) as Record<string, unknown> & {
          message?: string;
          error_description?: string;
          errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
        })
        : {};
    }

    if (!response.ok) {
      throw createRingCentralRequestError(
        response.status,
        data,
        `RingCentral subscription request failed (${response.status}).`,
      );
    }

    const parsed = parseRingCentralSubscriptionResponse(data);
    if (!parsed.id || !parsed.expirationTime) {
      throw new Error("RingCentral subscription response was incomplete.");
    }

    return parsed;
  };

  if (!refreshAccessToken) {
    return await request(accessToken);
  }

  return await retryRingCentralRequestAfterRefresh({
    accessToken,
    refreshAccessToken,
    request,
  });
}

async function deleteRingCentralWebhookSubscription(accessToken: string, subscriptionId: string) {
  const response = await fetch(
    getRingCentralApiUrl(`/restapi/v1.0/subscription/${encodeURIComponent(subscriptionId)}`),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    const data = text
      ? (JSON.parse(text) as Record<string, unknown> & {
        message?: string;
        error_description?: string;
        errors?: Array<{ message?: string; description?: string; errorCode?: string; error_code?: string }>;
      })
      : {};
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral subscription delete failed (${response.status}).`,
    );
  }
}

async function ensureRingCentralWebhookSubscription(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  accessToken: string,
  refreshAccessToken?: () => Promise<string>,
) {
  const integration = await loadIntegration(serviceClient, workspaceUserId);
  if (!integration) {
    throw new Error("RingCentral is not connected.");
  }

  const validationToken = integration.webhook_validation_token || buildRingCentralWebhookValidationToken();
  if (validationToken !== integration.webhook_validation_token) {
    await saveIntegration(serviceClient, {
      ...integration,
      webhook_validation_token: validationToken,
    });
  }

  const subscription = await requestRingCentralSubscription(
    accessToken,
    integration.subscription_id,
    validationToken,
    refreshAccessToken,
  );
  const updatedIntegration: RingCentralIntegrationRow = {
    ...integration,
    subscription_id: subscription.id,
    subscription_expires_at: subscription.expirationTime,
    webhook_validation_token: validationToken,
    updated_at: new Date().toISOString(),
  };

  await saveIntegration(serviceClient, updatedIntegration);
  return updatedIntegration;
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

function isWebhookSubscriptionValid(row: RingCentralIntegrationRow) {
  if (!row.subscription_id) {
    return false;
  }

  const expiry = new Date(row.subscription_expires_at ?? "").getTime();
  return Number.isFinite(expiry) ? expiry > Date.now() + 5 * 60_000 : false;
}

async function refreshIntegrationIfNeeded(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  row: RingCentralIntegrationRow,
) {
  if (!isAccessTokenExpired(row)) {
    return row;
  }

  return await refreshIntegration(serviceClient, row);
}

async function loadRecordingCandidateCallLogs(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
  limit: number,
) {
  let query = serviceClient
    .from("call_logs")
    .select(
      "id, lead_id, agent_id, direction, recording_enabled, recording_provider, recording_url, ringcentral_session_id, ringcentral_recording_id, recording_last_checked_at, notes, created_at",
    )
    .not("ringcentral_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 250)));

  if (workspaceUser.role === "agent") {
    query = query.eq("agent_id", workspaceUser.id);
  }

  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data ?? []) as CallLogRecordingRow[];
}

function buildRingCentralRecordingLookupWindow(rows: CallLogRecordingRow[]) {
  const timestamps = rows
    .map((row) => Date.parse(row.created_at))
    .filter((value): value is number => Number.isFinite(value));
  const earliest = timestamps.length ? Math.min(...timestamps) : Date.now();
  const latest = timestamps.length ? Math.max(...timestamps) : earliest;
  const paddingMs = 24 * 60 * 60 * 1000;

  return {
    dateFrom: new Date(earliest - paddingMs).toISOString(),
    dateTo: new Date(latest + paddingMs).toISOString(),
  };
}

async function loadCallLogRecordingRow(
  serviceClient: ReturnType<typeof createServiceClient>,
  callLogId: string,
) {
  const { data, error } = await serviceClient
    .from("call_logs")
    .select(
      "id, lead_id, agent_id, direction, recording_enabled, recording_provider, recording_url, ringcentral_session_id, ringcentral_recording_id, recording_last_checked_at, notes, created_at",
    )
    .eq("id", callLogId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data as CallLogRecordingRow | null) ?? null;
}

function isRingCentralRecordingLookupDue(row: CallLogRecordingRow) {
  if (row.recording_url) {
    return false;
  }

  const lastCheckedAt = row.recording_last_checked_at ? Date.parse(row.recording_last_checked_at) : Number.NaN;
  if (!Number.isFinite(lastCheckedAt)) {
    return true;
  }

  return lastCheckedAt <= Date.now() - ringCentralRecordingRecheckIntervalMs;
}

async function markRingCentralRecordingChecked(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: CallLogRecordingRow,
  sessionId: string,
) {
  const payload = {
    recording_provider: row.recording_provider ?? "ringcentral",
    ringcentral_session_id: row.ringcentral_session_id ?? sessionId,
    recording_last_checked_at: new Date().toISOString(),
  };

  const { error } = await serviceClient
    .from("call_logs")
    .update(payload)
    .eq("id", row.id);

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return {
    ...row,
    ...payload,
  } satisfies CallLogRecordingRow;
}

async function applyRingCentralRecordingMatch(
  serviceClient: ReturnType<typeof createServiceClient>,
  row: CallLogRecordingRow,
  sessionId: string,
  match: RingCentralRecordingMatch,
) {
  const payload = {
    recording_enabled: true,
    recording_provider: "ringcentral",
    recording_url: match.contentUri,
    ringcentral_session_id: row.ringcentral_session_id ?? sessionId,
    ringcentral_recording_id: match.recordingId,
    recording_last_checked_at: new Date().toISOString(),
  };

  const { error } = await serviceClient
    .from("call_logs")
    .update(payload)
    .eq("id", row.id);

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return {
    ...row,
    ...payload,
  } satisfies CallLogRecordingRow;
}

async function propagateRingCentralRecordingToNearestCallLog(
  serviceClient: ReturnType<typeof createServiceClient>,
  sourceRow: CallLogRecordingRow,
) {
  if (!sourceRow.recording_url) {
    return 0;
  }

  const createdAt = Date.parse(sourceRow.created_at);
  if (!Number.isFinite(createdAt)) {
    return 0;
  }

  let query = serviceClient
    .from("call_logs")
    .select("id, recording_url, ringcentral_session_id, created_at")
    .eq("lead_id", sourceRow.lead_id)
    .eq("direction", sourceRow.direction)
    .gte("created_at", new Date(createdAt - ringCentralRecordingPropagationWindowMs).toISOString())
    .lte("created_at", new Date(createdAt + ringCentralRecordingPropagationWindowMs).toISOString())
    .neq("id", sourceRow.id)
    .is("recording_url", null);

  if (sourceRow.agent_id) {
    query = query.eq("agent_id", sourceRow.agent_id);
  }

  const { data, error } = await query;
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  const candidates = ((data ?? []) as Array<{
    id: string;
    recording_url: string | null;
    ringcentral_session_id: string | null;
    created_at: string;
  }>).sort((left, right) => {
    const leftDistance = Math.abs(Date.parse(left.created_at) - createdAt);
    const rightDistance = Math.abs(Date.parse(right.created_at) - createdAt);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.created_at.localeCompare(right.created_at);
  });

  const [candidate] = candidates;
  if (!candidate) {
    return 0;
  }

  const { error: updateError } = await serviceClient
    .from("call_logs")
    .update({
      recording_enabled: true,
      recording_provider: "ringcentral",
      recording_url: sourceRow.recording_url,
      ringcentral_session_id: candidate.ringcentral_session_id ?? sourceRow.ringcentral_session_id,
      ringcentral_recording_id: sourceRow.ringcentral_recording_id,
      recording_last_checked_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);

  if (updateError) {
    throw Object.assign(new Error(updateError.message), { status: 500 });
  }

  return 1;
}

async function hydrateRingCentralRecordingForCallLog(
  serviceClient: ReturnType<typeof createServiceClient>,
  integration: RingCentralIntegrationRow,
  row: CallLogRecordingRow,
  refreshAccessToken: () => Promise<string>,
  records?: RingCentralCallLogRecordSummary[],
) {
  const sessionId = normalizeRingCentralSessionId(row.ringcentral_session_id ?? extractRingCentralSessionId(row.notes));
  if (!sessionId) {
    return row;
  }

  if (!isRingCentralRecordingLookupDue(row)) {
    return row;
  }

  const match = records
    ? selectRingCentralRecordingForSession(records, sessionId)
    : await retryRingCentralRequestAfterRefresh({
      accessToken: integration.access_token,
      refreshAccessToken,
      request: async (accessToken) =>
        await fetchRingCentralRecordingForSession({
          accessToken,
          telephonySessionId: sessionId,
          occurredAt: row.created_at,
          serverUrl: ringCentralServerUrl,
        }),
    });

  if (!match) {
    return await markRingCentralRecordingChecked(serviceClient, row, sessionId);
  }

  return await applyRingCentralRecordingMatch(serviceClient, row, sessionId, match);
}

async function handleSyncRecordings(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ checkedCount: 0, hydratedCount: 0, propagatedCount: 0 }, { status: 409 });
  }

  let activeIntegration = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const limit = Math.max(
    1,
    Math.min(
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.floor(body.limit)
        : Number.parseInt(readText(body.limit), 10) || ringCentralRecordingSyncLimit,
      250,
    ),
  );
  const candidates = await loadRecordingCandidateCallLogs(serviceClient, workspaceUser, limit);
  let hydratedCount = 0;
  let propagatedCount = 0;

  if (!candidates.length) {
    return jsonResponse({
      checkedCount: 0,
      hydratedCount: 0,
      propagatedCount: 0,
    });
  }

  const refreshAccessToken = async () => {
    activeIntegration = await refreshIntegration(serviceClient, activeIntegration);
    return activeIntegration.access_token;
  };

  const { dateFrom, dateTo } = buildRingCentralRecordingLookupWindow(candidates);
  const recordingRecords = await retryRingCentralRequestAfterRefresh({
    accessToken: activeIntegration.access_token,
    refreshAccessToken,
    request: async (accessToken) =>
      await fetchRingCentralCallLogRecords({
        accessToken,
        dateFrom,
        dateTo,
        serverUrl: ringCentralServerUrl,
      }),
  });

  for (const candidate of candidates) {
    const hydrated = await hydrateRingCentralRecordingForCallLog(
      serviceClient,
      activeIntegration,
      candidate,
      refreshAccessToken,
      recordingRecords,
    );

    if (!candidate.recording_url && Boolean(hydrated.recording_url)) {
      hydratedCount += 1;
    }

    if (hydrated.recording_url) {
      propagatedCount += await propagateRingCentralRecordingToNearestCallLog(serviceClient, hydrated);
    }
  }

  return jsonResponse({
    checkedCount: candidates.length,
    hydratedCount,
    propagatedCount,
  });
}

async function handleRecordingContent(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const callLogId = readText(body.callLogId);
  if (!callLogId) {
    return jsonResponse({ message: "Call log id is required." }, { status: 400 });
  }

  const row = await loadCallLogRecordingRow(serviceClient, callLogId);
  if (!row || !row.recording_url) {
    return jsonResponse({ message: "Recording not found for this call log." }, { status: 404 });
  }

  if (row.recording_provider && row.recording_provider !== "ringcentral") {
    return jsonResponse({ message: "Unsupported recording provider." }, { status: 400 });
  }

  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let activeIntegration = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const refreshAccessToken = async () => {
    activeIntegration = await refreshIntegration(serviceClient, activeIntegration);
    return activeIntegration.access_token;
  };

  const upstream = await retryRingCentralRequestAfterRefresh({
    accessToken: activeIntegration.access_token,
    refreshAccessToken,
    request: async (accessToken) =>
      await fetchRingCentralRecordingContent({
        accessToken,
        contentUri: row.recording_url ?? "",
      }),
  });

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, x-retry-count");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "audio/mpeg");

  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  const contentDisposition = upstream.headers.get("Content-Disposition");
  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

function mapRingCentralStatus(
  row: RingCentralIntegrationRow | null,
  callerIdNumbers: RingCentralPhoneNumber[],
  accountMainNumber: string | null,
  selectedCallerIdNumber: string | null,
  message: string | null = null,
): RingCentralStatus {
  if (!row) {
    return buildEmptyStatus(message);
  }

  return {
    connected: true,
    accountId: row.account_id,
    extensionId: row.extension_id,
    accountMainNumber,
    selectedCallerIdNumber,
    availableCallerIdNumbers: callerIdNumbers,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    expiresAt: row.access_token_expires_at,
    message,
    activeTelephonySessionId: row.active_telephony_session_id,
    activeTelephonyPartyId: row.active_telephony_party_id,
    activeTelephonyDirection: row.active_telephony_direction,
    activeTelephonyStatusCode: row.active_telephony_status_code,
    activeTelephonyUpdatedAt: row.active_telephony_updated_at,
  };
}

async function buildIntegrationStatus(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUserId: string,
  options: { refresh?: boolean; debug?: boolean } = {},
) {
  const row = await loadIntegration(serviceClient, workspaceUserId);
  if (!row) {
    return buildEmptyStatus();
  }

  let activeRow = options.refresh === false ? row : await refreshIntegrationIfNeeded(serviceClient, workspaceUserId, row);
  let callerIdNumbers: RingCentralPhoneNumber[] = [];
  let accountMainNumber: string | null = null;
  let message: string | null = null;
  let accountInfoFailed = false;
  let ringOutNumbersPartialFailure = false;
  let ringOutNumbersResult: RingCentralPhoneNumberFetchResult | null = null;
  const cachedCallerIdNumbers = parseCachedRingCentralPhoneNumbers(activeRow.cached_ringout_numbers);

  try {
    const accountInfo = await fetchRingCentralAccountInfo(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });
    accountMainNumber = accountInfo.mainNumber ? normalizeNumber(accountInfo.mainNumber) : null;
  } catch (error) {
    accountInfoFailed = true;
    message = error instanceof Error ? error.message : "Unable to load RingCentral numbers.";
  }

  try {
    ringOutNumbersResult = await fetchRingCentralCallerIdNumbers(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });
    callerIdNumbers = ringOutNumbersResult.numbers;
    ringOutNumbersPartialFailure = ringOutNumbersResult.partialFailure;
  } catch (error) {
    ringOutNumbersPartialFailure = true;
    const nextMessage = error instanceof Error ? error.message : "Unable to load RingCentral numbers.";
    message = message ? `${message} ${nextMessage}` : nextMessage;
  }

  const callerIdNumbersByKey = new Map<string, RingCentralPhoneNumber>();
  if (accountMainNumber) {
    mergeRingCentralPhoneNumbers(callerIdNumbersByKey, [{
      phoneNumber: accountMainNumber,
      usageType: "MainCompanyNumber",
      type: "MainCompanyNumber",
      features: ["CallerId"],
      enabled: true,
      label: formatRingCentralPhoneNumber(accountMainNumber),
    }]);
  }
  mergeRingCentralPhoneNumbers(callerIdNumbersByKey, callerIdNumbers);
  if (accountInfoFailed || ringOutNumbersPartialFailure) {
    mergeRingCentralPhoneNumbers(callerIdNumbersByKey, cachedCallerIdNumbers);
  }
  callerIdNumbers = [...callerIdNumbersByKey.values()];

  const storedSelectedCallerIdNumber = activeRow.selected_caller_id ? normalizeNumber(activeRow.selected_caller_id) : null;
  const selectedCallerIdNumber = selectPreferredCallerIdNumber(callerIdNumbers, storedSelectedCallerIdNumber);
  const serializedCachedRingoutNumbers =
    !accountInfoFailed && !ringOutNumbersPartialFailure
      ? serializeRingCentralPhoneNumbers(callerIdNumbers)
      : activeRow.cached_ringout_numbers;

  if (
    (selectedCallerIdNumber && selectedCallerIdNumber !== storedSelectedCallerIdNumber) ||
    serializedCachedRingoutNumbers !== activeRow.cached_ringout_numbers
  ) {
    await saveIntegration(serviceClient, {
      ...activeRow,
      selected_caller_id:
        selectedCallerIdNumber && selectedCallerIdNumber !== storedSelectedCallerIdNumber
          ? selectedCallerIdNumber
          : activeRow.selected_caller_id,
      cached_ringout_numbers: serializedCachedRingoutNumbers,
    });
  }

  if (!isWebhookSubscriptionValid(activeRow)) {
    try {
      activeRow = await ensureRingCentralWebhookSubscription(serviceClient, workspaceUserId, activeRow.access_token, async () => {
        const refreshed = await refreshIntegration(serviceClient, activeRow);
        activeRow = refreshed;
        return refreshed.access_token;
      });
    } catch (error) {
      const webhookMessage =
        error instanceof Error ? error.message : "Unable to configure RingCentral call alerts.";
      message = message ? `${message} ${webhookMessage}` : webhookMessage;
    }
  }

  const status = mapRingCentralStatus(activeRow, callerIdNumbers, accountMainNumber, selectedCallerIdNumber, message);
  if (options.debug) {
    status.debug = {
      accountInfoFailed,
      ringOutNumbersPartialFailure,
      cachedCallerIdNumbers,
      ringOutNumberSources: ringOutNumbersResult?.sources ?? [],
    };
  }

  return status;
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

async function handleStatus(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id, {
    debug: body.debug === true,
  });
  return jsonResponse({ status });
}

async function handleBrowserVoiceSession(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({
      voice: buildUnavailableBrowserVoiceSession("RingCentral is not connected.", "unconfigured"),
    });
  }

  let activeRow = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);

  try {
    const sipProvision = await fetchRingCentralSipProvision(activeRow.access_token, async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    });

    const voice = buildBrowserVoiceSession(sipProvision, workspaceUser, activeRow.selected_caller_id);
    return jsonResponse({ voice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load RingCentral browser calling.";
    return jsonResponse({
      voice: {
        ...buildUnavailableBrowserVoiceSession(message, "ringcentral"),
        callerId: activeRow.selected_caller_id ? normalizeNumber(activeRow.selected_caller_id) : null,
        displayName: workspaceUser.full_name,
      },
    });
  }
}

async function handleUpdateCallerIdNumber(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const callerIdNumber = typeof body.callerIdNumber === "string"
    ? normalizeNumber(body.callerIdNumber)
    : "";
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  const status = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  const allowedCallerIdNumbers = new Set(
    status.availableCallerIdNumbers
      .filter(isRingCentralOutboundNumber)
      .map((number) => normalizeNumber(number.phoneNumber)),
  );

  if (callerIdNumber && !allowedCallerIdNumbers.has(callerIdNumber)) {
    return jsonResponse({ message: "Choose a caller ID number from your RingCentral account." }, { status: 400 });
  }

  await saveIntegration(serviceClient, {
    ...integration,
    selected_caller_id: callerIdNumber || null,
  });

  const nextStatus = await buildIntegrationStatus(serviceClient, workspaceUser.id);
  return jsonResponse({ status: nextStatus });
}

async function handleDisconnect(
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (integration?.subscription_id) {
    try {
      const refreshed = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
      await deleteRingCentralWebhookSubscription(refreshed.access_token, refreshed.subscription_id);
    } catch {
      // Best-effort cleanup. Disconnecting the CRM connection should still succeed.
    }
  }

  await deleteIntegration(serviceClient, workspaceUser.id);
  return jsonResponse({ success: true });
}

async function handleCreateVideoMeeting(
  body: Record<string, unknown>,
  serviceClient: ReturnType<typeof createServiceClient>,
  workspaceUser: AppUserRow,
) {
  const integration = await loadIntegration(serviceClient, workspaceUser.id);
  if (!integration) {
    return jsonResponse({ message: "RingCentral is not connected." }, { status: 409 });
  }

  let activeRow = await refreshIntegrationIfNeeded(serviceClient, workspaceUser.id, integration);
  const requestPayload = buildRingCentralVideoBridgeRequest({
    name: body.name,
    type: body.type,
    passwordProtected: body.passwordProtected,
    password: body.password,
    joinBeforeHost: body.joinBeforeHost,
    audioMuted: body.audioMuted,
    videoMuted: body.videoMuted,
  });

  const meeting: RingCentralVideoBridge = await createRingCentralVideoBridge(
    activeRow.access_token,
    requestPayload,
    async () => {
      const refreshed = await refreshIntegration(serviceClient, activeRow);
      activeRow = refreshed;
      return refreshed.access_token;
    },
  );

  return jsonResponse({ meeting });
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

    if (action === "status") {
      return await handleStatus(body, serviceClient, workspaceUser);
    }

    if (action === "browser-voice-session") {
      return await handleBrowserVoiceSession(serviceClient, workspaceUser);
    }

    if (action === "update-caller-id-number") {
      return await handleUpdateCallerIdNumber(body, serviceClient, workspaceUser);
    }

    if (action === "sync-recordings") {
      return await handleSyncRecordings(body, serviceClient, workspaceUser);
    }

    if (action === "recording-content") {
      return await handleRecordingContent(body, serviceClient, workspaceUser);
    }

    if (action === "disconnect") {
      return await handleDisconnect(serviceClient, workspaceUser);
    }

    if (action === "create-video-meeting") {
      return await handleCreateVideoMeeting(body, serviceClient, workspaceUser);
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
