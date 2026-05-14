import { jsonResponse, optionsResponse } from "../_shared/http.ts";
import { createServiceClient } from "../_shared/supabase.ts";

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
  subscription_id: string | null;
  subscription_expires_at: string | null;
  webhook_validation_token: string | null;
  last_inbound_event_at: string | null;
  connected_at: string;
  updated_at: string;
}

interface LeadRow {
  id: string;
  full_name: string;
  phone: string;
  alt_phone: string | null;
  phone_numbers: string[] | null;
}

interface RingCentralSessionParty {
  direction?: string;
  missedCall?: boolean;
  from?: {
    phoneNumber?: string;
    name?: string;
  };
  to?: {
    phoneNumber?: string;
    name?: string;
  };
  status?: {
    code?: string;
  };
}

interface RingCentralSessionBody {
  telephonySessionId?: string;
  sessionId?: string;
  eventTime?: string;
  parties?: RingCentralSessionParty[];
}

type JsonRecord = Record<string, unknown>;

const ringCentralServerUrl = Deno.env.get("RINGCENTRAL_SERVER_URL")?.trim() || "https://platform.ringcentral.com";
const ringCentralWebhookFilter = "/restapi/v1.0/account/~/extension/~/telephony/sessions?direction=Inbound";

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function buildMatchVariants(value: string) {
  const normalized = normalizeNumber(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  if (normalized.length === 11 && normalized.startsWith("1")) {
    variants.add(normalized.slice(1));
  }
  if (normalized.length === 10) {
    variants.add(`1${normalized}`);
  }

  return [...variants];
}

function numbersMatch(left: string, right: string) {
  const leftVariants = buildMatchVariants(left);
  const rightVariants = buildMatchVariants(right);

  if (!leftVariants.length || !rightVariants.length) {
    return false;
  }

  return leftVariants.some((value) => rightVariants.includes(value));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function readSessionBody(payload: JsonRecord) {
  const nestedBody = readOptionalRecord(payload.body);
  return nestedBody ?? payload;
}

function readValidationToken(request: Request) {
  return request.headers.get("validation-token")?.trim() || "";
}

function buildWebhookResponse(body: unknown, validationToken: string, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (validationToken) {
    headers.set("Validation-Token", validationToken);
  }

  return jsonResponse(body, {
    ...init,
    headers,
  });
}

function buildRingCentralWebhookUrl() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  if (!supabaseUrl) {
    throw new Error("Missing Supabase URL.");
  }

  return new URL("/functions/v1/ringcentral-webhook", supabaseUrl).toString();
}

async function buildDeterministicUuid(seed: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const uuidBytes = bytes.slice(0, 16);

  uuidBytes[6] = (uuidBytes[6] & 0x0f) | 0x50;
  uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;

  const hex = Array.from(uuidBytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getSessionId(session: RingCentralSessionBody) {
  return readString(session.telephonySessionId) || readString(session.sessionId);
}

function getInboundParty(session: RingCentralSessionBody) {
  const parties = Array.isArray(session.parties) ? session.parties : [];
  return (
    parties.find((party) => party.direction === "Inbound" && (readString(party.from?.phoneNumber) || readString(party.to?.phoneNumber))) ||
    parties.find((party) => party.direction === "Inbound") ||
    parties[0] ||
    null
  );
}

function getInboundCallerNumber(session: RingCentralSessionBody) {
  const party = getInboundParty(session);
  if (!party) {
    return "";
  }

  return readString(party.from?.phoneNumber) || readString(party.to?.phoneNumber);
}

function getInboundStatusCode(session: RingCentralSessionBody) {
  const party = getInboundParty(session);
  return readString(party?.status?.code);
}

function isLiveAlertStatus(statusCode: string) {
  return statusCode === "Setup" || statusCode === "Proceeding";
}

function isFinalStatus(statusCode: string) {
  return statusCode === "Disconnected" || statusCode === "Gone" || statusCode === "VoiceMail";
}

async function loadIntegrationByValidationToken(validationToken: string) {
  if (!validationToken) {
    return null;
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, subscription_id, subscription_expires_at, webhook_validation_token, last_inbound_event_at, connected_at, updated_at",
    )
    .eq("webhook_validation_token", validationToken)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data as RingCentralIntegrationRow | null) ?? null;
}

async function loadIntegrationBySubscriptionId(subscriptionId: string) {
  if (!subscriptionId) {
    return null;
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("ringcentral_integrations")
    .select(
      "app_user_id, account_id, extension_id, access_token, refresh_token, token_type, scope, access_token_expires_at, refresh_token_expires_at, selected_caller_id, subscription_id, subscription_expires_at, webhook_validation_token, last_inbound_event_at, connected_at, updated_at",
    )
    .eq("subscription_id", subscriptionId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return (data as RingCentralIntegrationRow | null) ?? null;
}

async function refreshAccessTokenIfNeeded(
  serviceClient: ReturnType<typeof createServiceClient>,
  integration: RingCentralIntegrationRow,
) {
  const expiry = new Date(integration.access_token_expires_at).getTime();
  if (Number.isFinite(expiry) && expiry > Date.now() + 60_000) {
    return integration;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim()) {
    headers.Authorization = `Basic ${btoa(
      `${Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || ""}:${Deno.env.get("RINGCENTRAL_CLIENT_SECRET")?.trim() || ""}`,
    )}`;
  }

  const response = await fetch(new URL("/restapi/oauth/token", ringCentralServerUrl).toString(), {
    method: "POST",
    headers,
    body: new URLSearchParams({
      client_id: Deno.env.get("RINGCENTRAL_CLIENT_ID")?.trim() || "",
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }).toString(),
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as JsonRecord & { error_description?: string }) : {};
  if (!response.ok) {
    throw Object.assign(
      new Error(
        typeof data.error_description === "string"
          ? data.error_description
          : `RingCentral token request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }

  const accessToken = readString(data.access_token);
  const refreshToken = readString(data.refresh_token) || integration.refresh_token;
  const tokenType = readString(data.token_type) || integration.token_type;
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : Number(data.expires_in);
  const refreshTokenExpiresIn =
    typeof data.refresh_token_expires_in === "number" ? data.refresh_token_expires_in : Number(data.refresh_token_expires_in);

  if (!accessToken || !Number.isFinite(expiresIn)) {
    throw new Error("RingCentral token response was incomplete.");
  }

  const updated: RingCentralIntegrationRow = {
    ...integration,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: tokenType || "Bearer",
    scope: readString(data.scope) || integration.scope,
    access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_token_expires_at: Number.isFinite(refreshTokenExpiresIn)
      ? new Date(Date.now() + refreshTokenExpiresIn * 1000).toISOString()
      : integration.refresh_token_expires_at,
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.from("ringcentral_integrations").upsert(updated);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return updated;
}

async function ensureWebhookSubscription(
  serviceClient: ReturnType<typeof createServiceClient>,
  integration: RingCentralIntegrationRow,
) {
  if (integration.subscription_id && integration.webhook_validation_token && !isFinalSubscriptionExpiryNeeded(integration)) {
    return integration;
  }

  const validationToken = integration.webhook_validation_token || crypto.randomUUID();
  const response = await fetch(
    integration.subscription_id
      ? new URL(`/restapi/v1.0/subscription/${encodeURIComponent(integration.subscription_id)}`, ringCentralServerUrl).toString()
      : new URL("/restapi/v1.0/subscription", ringCentralServerUrl).toString(),
    {
      method: integration.subscription_id ? "PUT" : "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${integration.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventFilters: [ringCentralWebhookFilter],
        deliveryMode: {
          transportType: "WebHook",
          address: buildRingCentralWebhookUrl(),
          validationToken,
        },
      }),
    },
  );

  const text = await response.text();
  const data = text ? (JSON.parse(text) as JsonRecord & { message?: string; error_description?: string }) : {};

  if (!response.ok) {
    if (response.status === 404 && integration.subscription_id) {
      const retryResponse = await fetch(new URL("/restapi/v1.0/subscription", ringCentralServerUrl).toString(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventFilters: [ringCentralWebhookFilter],
          deliveryMode: {
            transportType: "WebHook",
            address: buildRingCentralWebhookUrl(),
            validationToken,
          },
        }),
      });

      const retryText = await retryResponse.text();
      const retryData = retryText ? (JSON.parse(retryText) as JsonRecord & { message?: string; error_description?: string }) : {};
      if (!retryResponse.ok) {
        throw Object.assign(
          new Error(
            typeof retryData.message === "string"
              ? retryData.message
              : typeof retryData.error_description === "string"
                ? retryData.error_description
                : `RingCentral subscription request failed (${retryResponse.status}).`,
          ),
          { status: retryResponse.status },
        );
      }

      return saveWebhookSubscription(serviceClient, integration, retryData, validationToken);
    }

    throw Object.assign(
      new Error(
        typeof data.message === "string"
          ? data.message
          : typeof data.error_description === "string"
            ? data.error_description
            : `RingCentral subscription request failed (${response.status}).`,
      ),
      { status: response.status },
    );
  }

  return saveWebhookSubscription(serviceClient, integration, data, validationToken);
}

function isFinalSubscriptionExpiryNeeded(integration: RingCentralIntegrationRow) {
  if (!integration.subscription_expires_at) {
    return true;
  }

  const expiry = new Date(integration.subscription_expires_at).getTime();
  return !Number.isFinite(expiry) || expiry <= Date.now() + 24 * 60 * 60 * 1000;
}

async function saveWebhookSubscription(
  serviceClient: ReturnType<typeof createServiceClient>,
  integration: RingCentralIntegrationRow,
  data: JsonRecord,
  validationToken: string,
) {
  const subscriptionId =
    readString(data.id) || readString(data.subscriptionId) || integration.subscription_id || "";
  const expirationTime =
    readString(data.expirationTime) || readString(data.expiryTime) || integration.subscription_expires_at || "";

  if (!subscriptionId || !expirationTime) {
    throw new Error("RingCentral subscription response was incomplete.");
  }

  const updated: RingCentralIntegrationRow = {
    ...integration,
    subscription_id: subscriptionId,
    subscription_expires_at: expirationTime,
    webhook_validation_token: validationToken,
    updated_at: new Date().toISOString(),
  };

  const { error } = await serviceClient.from("ringcentral_integrations").upsert(updated);
  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return updated;
}

async function findLeadByPhoneNumber(phoneNumber: string) {
  const digits = normalizeNumber(phoneNumber);
  if (!digits) {
    return null;
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("leads")
    .select("id, full_name, phone, alt_phone, phone_numbers")
    .order("created_at", { ascending: false });

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  const leads = (data ?? []) as LeadRow[];
  for (const lead of leads) {
    const phoneNumbers = lead.phone_numbers?.length ? lead.phone_numbers : [lead.phone, lead.alt_phone ?? ""];
    if (phoneNumbers.some((value) => numbersMatch(value ?? "", digits))) {
      return lead;
    }
  }

  return null;
}

async function recentActivityHasSession(leadId: string, sessionId: string) {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("activity_logs")
    .select("id, description, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return ((data ?? []) as Array<{ description: string | null }>).some((row) =>
    typeof row.description === "string" && row.description.includes(sessionId)
  );
}

function buildIncomingSummary(input: {
  statusCode: string;
  callerNumber: string;
  callerName: string;
}) {
  const caller = input.callerName || input.callerNumber || "unknown number";
  const status = input.statusCode === "VoiceMail" ? "missed" : "received";
  return `RingCentral inbound call ${status} from ${caller}.`;
}

async function insertLiveAlert(input: {
  leadId: string;
  actorId: string;
  leadName: string;
  callerNumber: string;
  callerName: string;
  sessionId: string;
  statusCode: string;
}) {
  if (await recentActivityHasSession(input.leadId, input.sessionId)) {
    return;
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("activity_logs").insert({
    lead_id: input.leadId,
    actor_id: input.actorId,
    activity_type: "call",
    title: `Incoming RingCentral call from ${input.leadName}`,
    description: `${buildIncomingSummary({
      statusCode: input.statusCode,
      callerNumber: input.callerNumber,
      callerName: input.callerName,
    })} Session ${input.sessionId}.`,
  });

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }
}

async function upsertIncomingCallLog(input: {
  integration: RingCentralIntegrationRow;
  leadId: string;
  leadName: string;
  callerNumber: string;
  callerName: string;
  sessionId: string;
  eventTime: string;
  statusCode: string;
  missedCall: boolean;
}) {
  const serviceClient = createServiceClient();
  const callLogId = await buildDeterministicUuid(`ringcentral:${input.sessionId}`);
  const startedAt = new Date(input.eventTime).getTime();
  const durationSeconds = Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    : 0;
  const missed = input.missedCall || input.statusCode === "VoiceMail";
  const disposition = missed ? "No Answer" : "Interested";
  const callStatus = missed ? "missed" : "connected";
  const summary = missed
    ? `RingCentral missed call from ${input.callerName || input.callerNumber || "unknown caller"}.`
    : `RingCentral inbound call connected from ${input.callerName || input.callerNumber || "unknown caller"}.`;

  const [callInsert, leadUpdate, activityInsert] = await Promise.all([
    serviceClient.from("call_logs").upsert({
      id: callLogId,
      lead_id: input.leadId,
      agent_id: input.integration.app_user_id,
      direction: "incoming",
      disposition,
      duration_seconds: durationSeconds,
      call_status: callStatus,
      recording_enabled: false,
      recording_url: null,
      outcome_summary: summary,
      notes: `Auto-logged from RingCentral session ${input.sessionId}.`,
    }),
    serviceClient
      .from("leads")
      .update({
        last_contacted: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.leadId),
    serviceClient.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: input.integration.app_user_id,
      activity_type: "call",
      title: `RingCentral call logged for ${input.leadName}`,
      description: `${summary} Session ${input.sessionId}.`,
    }),
  ]);

  if (callInsert.error) {
    throw Object.assign(new Error(callInsert.error.message), { status: 500 });
  }
  if (leadUpdate.error) {
    throw Object.assign(new Error(leadUpdate.error.message), { status: 500 });
  }
  if (activityInsert.error) {
    throw Object.assign(new Error(activityInsert.error.message), { status: 500 });
  }
}

async function handleWebhookEvent(request: Request, body: unknown) {
  const validationToken = readValidationToken(request);
  const payload = isRecord(body) ? body : {};
  const session = readSessionBody(payload);
  const subscriptionId = readString(payload.subscriptionId);
  const sessionId = getSessionId(session);

  let integration: RingCentralIntegrationRow | null = null;
  if (subscriptionId) {
    integration = await loadIntegrationBySubscriptionId(subscriptionId);
  }
  if (!integration && validationToken) {
    integration = await loadIntegrationByValidationToken(validationToken);
  }

  if (!integration) {
    return buildWebhookResponse({ ok: true }, validationToken, { status: 200 });
  }

  const serviceClient = createServiceClient();
  const refreshedIntegration = await refreshAccessTokenIfNeeded(serviceClient, integration);
  const statusCode = getInboundStatusCode(session);
  const callerNumber = getInboundCallerNumber(session);
  const callerName = readString(
    getInboundParty(session)?.from?.name || getInboundParty(session)?.to?.name || "",
  );
  const eventTime = readString(session.eventTime) || new Date().toISOString();
  const lead = await findLeadByPhoneNumber(callerNumber);

  if (!lead) {
    return buildWebhookResponse({ ok: true }, validationToken, { status: 200 });
  }

  if (isLiveAlertStatus(statusCode)) {
    await insertLiveAlert({
      leadId: lead.id,
      actorId: refreshedIntegration.app_user_id,
      leadName: lead.full_name,
      callerNumber,
      callerName,
      sessionId,
      statusCode,
    });
  }

  if (isFinalStatus(statusCode)) {
    await upsertIncomingCallLog({
      integration: refreshedIntegration,
      leadId: lead.id,
      leadName: lead.full_name,
      callerNumber,
      callerName,
      sessionId,
      eventTime,
      statusCode,
      missedCall:
        Boolean(getInboundParty(session)?.missedCall) ||
        statusCode === "VoiceMail" ||
        statusCode === "Gone",
    });
  }

  const { error } = await serviceClient
    .from("ringcentral_integrations")
    .update({
      last_inbound_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("app_user_id", refreshedIntegration.app_user_id);

  if (error) {
    throw Object.assign(new Error(error.message), { status: 500 });
  }

  return buildWebhookResponse({ ok: true }, validationToken, { status: 200 });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return optionsResponse();
  }

  try {
    const text = await request.text();
    const trimmed = text.trim();
    const body = trimmed ? (JSON.parse(trimmed) as unknown) : null;

    return await handleWebhookEvent(request, body);
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? (error as { status?: number }).status ?? 500
        : 500;
    return jsonResponse(
      { message: error instanceof Error ? error.message : "Unable to process RingCentral webhook." },
      { status },
    );
  }
});
