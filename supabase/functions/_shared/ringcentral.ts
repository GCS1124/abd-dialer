const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";
export const RINGCENTRAL_TELEPHONY_SESSION_FILTER = "/restapi/v1.0/account/~/telephony/sessions";

export interface RingCentralPhoneNumber {
  phoneNumber: string;
  features?: string[];
  usageType?: string | null;
  type?: string | null;
  label?: string | null;
  enabled?: boolean;
}

export interface RingCentralRequestError extends Error {
  status?: number;
  errorCode?: string | null;
}

export interface RingCentralCallLogRecordingSummary {
  id?: string | null;
  contentUri?: string | null;
}

export interface RingCentralCallLogRecordSummary {
  id?: string | null;
  telephonySessionId?: string | null;
  startTime?: string | null;
  duration?: number | null;
  recording?: RingCentralCallLogRecordingSummary | null;
}

export interface RingCentralRecordingMatch {
  callLogId: string;
  recordingId: string | null;
  contentUri: string;
  telephonySessionId: string;
}

export type RingCentralVideoBridgeType = "Instant" | "Scheduled" | "PMI";

export interface RingCentralVideoBridgeRequest {
  name: string;
  type: RingCentralVideoBridgeType;
  security?: {
    passwordProtected: boolean;
    password?: string;
    noGuests: boolean;
    sameAccount: boolean;
    e2ee: boolean;
  };
  preferences: {
    join: {
      audioMuted: boolean;
      videoMuted: boolean;
      waitingRoomRequired: "Nobody";
      pstn: {
        promptAnnouncement: boolean;
        promptParticipants: boolean;
      };
    };
    playTones: "Off";
    musicOnHold: boolean;
    joinBeforeHost: boolean;
    screenSharing: boolean;
    recordingsMode: "User";
    transcriptionsMode: "User";
  };
}

export interface RingCentralVideoBridge {
  id: string | null;
  name: string;
  type: RingCentralVideoBridgeType;
  joinUrl: string | null;
  webPin: string | null;
  participantCode: string | null;
  hostCode: string | null;
  password: string | null;
  passwordProtected: boolean;
  joinBeforeHost: boolean;
  audioMuted: boolean;
  videoMuted: boolean;
}

interface RingCentralCallLogListPayload {
  records?: unknown[];
}

const RINGCENTRAL_VIDEO_BRIDGE_TYPES = new Set<RingCentralVideoBridgeType>([
  "Instant",
  "Scheduled",
  "PMI",
]);

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function formatE164PhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return value.trim();
}

const RINGCENTRAL_CALLER_ID_USAGE_TYPES = new Set([
  "MainCompanyNumber",
  "AdditionalCompanyNumber",
  "CompanyNumber",
  "DirectNumber",
]);

const RINGCENTRAL_RINGOUT_FROM_TYPES = new Set([
  "PhoneLine",
  "Mobile",
  "Work",
  "Other",
  "VoiceFax",
]);

const RINGCENTRAL_RINGOUT_FROM_USAGE_TYPES = new Set([
  "ForwardedNumber",
  "DirectNumber",
  "MainCompanyNumber",
  "AdditionalCompanyNumber",
  "CompanyNumber",
]);

export function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function isRingCentralOutboundDirection(value: unknown) {
  return readText(value).toLowerCase() === "outbound";
}

export function shouldSuppressRingCentralLiveAlert(input: {
  direction: unknown;
  activeDirection: unknown;
}) {
  return (
    isRingCentralOutboundDirection(input.direction) ||
    isRingCentralOutboundDirection(input.activeDirection)
  );
}

export function normalizeRingCentralSessionId(value: unknown) {
  const text = readText(value);
  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/^[\s"'`([{<]+/g, "")
    .replace(/[\s"'`),.;:!?}\]>]+$/g, "");

  return normalized || null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

export function normalizeRingCentralVideoBridgeType(value: unknown): RingCentralVideoBridgeType {
  const text = readText(value);
  if (RINGCENTRAL_VIDEO_BRIDGE_TYPES.has(text as RingCentralVideoBridgeType)) {
    return text as RingCentralVideoBridgeType;
  }

  return "Instant";
}

export function buildRingCentralVideoBridgeRequest(input: {
  name?: unknown;
  type?: unknown;
  passwordProtected?: unknown;
  password?: unknown;
  joinBeforeHost?: unknown;
  audioMuted?: unknown;
  videoMuted?: unknown;
}): RingCentralVideoBridgeRequest {
  const password = readText(input.password);
  const passwordProtected = input.passwordProtected === true || Boolean(password);

  return {
    name: readText(input.name) || "CRM Dialer Meeting",
    type: normalizeRingCentralVideoBridgeType(input.type),
    ...(passwordProtected
      ? {
        security: {
          passwordProtected: true,
          ...(password ? { password } : {}),
          noGuests: false,
          sameAccount: false,
          e2ee: false,
        },
      }
      : {}),
    preferences: {
      join: {
        audioMuted: input.audioMuted === true,
        videoMuted: input.videoMuted === true,
        waitingRoomRequired: "Nobody",
        pstn: {
          promptAnnouncement: true,
          promptParticipants: true,
        },
      },
      playTones: "Off",
      musicOnHold: true,
      joinBeforeHost: input.joinBeforeHost !== false,
      screenSharing: true,
      recordingsMode: "User",
      transcriptionsMode: "User",
    },
  };
}

export function normalizeRingCentralVideoBridge(value: unknown): RingCentralVideoBridge {
  const record = readRecord(value);
  const pins = readRecord(record?.pins);
  const pstnPins = readRecord(pins?.pstn);
  const security = readRecord(record?.security);
  const password = readRecord(security?.password);
  const preferences = readRecord(record?.preferences);
  const joinPreferences = readRecord(preferences?.join);
  const discovery = readRecord(record?.discovery);

  return {
    id: readText(record?.id) || null,
    name: readText(record?.name) || "CRM Dialer Meeting",
    type: normalizeRingCentralVideoBridgeType(record?.type),
    joinUrl: readText(discovery?.web) || null,
    webPin: readText(pins?.web) || null,
    participantCode: readText(pstnPins?.participant) || null,
    hostCode: readText(pstnPins?.host) || null,
    password: readText(password?.plainText) || readText(security?.password) || null,
    passwordProtected: security?.passwordProtected === true,
    joinBeforeHost: preferences?.joinBeforeHost === false ? false : true,
    audioMuted: joinPreferences?.audioMuted === true,
    videoMuted: joinPreferences?.videoMuted === true,
  };
}

export function extractRingCentralSessionId(value: string | null | undefined) {
  const text = readText(value);
  if (!text) {
    return null;
  }

  const match = text.match(/\bRingCentral session ([A-Za-z0-9._:-]+)\b/i);
  return normalizeRingCentralSessionId(match?.[1] ?? null);
}

function readRingCentralErrorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const value of [record.errorCode, record.error_code]) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return "";
  }

  for (const error of errors) {
    if (!error || typeof error !== "object") {
      continue;
    }

    const errorRecord = error as Record<string, unknown>;
    for (const value of [errorRecord.errorCode, errorRecord.error_code]) {
      const text = readText(value);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function readRingCentralErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  for (const value of [record.message, record.error_description]) {
    const text = readText(value);
    if (text) {
      return text;
    }
  }

  const errors = record.errors;
  if (!Array.isArray(errors)) {
    return "";
  }

  for (const error of errors) {
    if (!error || typeof error !== "object") {
      continue;
    }

    const errorRecord = error as Record<string, unknown>;
    for (const value of [errorRecord.message, errorRecord.description]) {
      const text = readText(value);
      if (text) {
        return text;
      }
    }
  }

  return "";
}

export function createRingCentralRequestError(
  status: number,
  payload: unknown,
  fallbackMessage: string,
) {
  const errorCode = readRingCentralErrorCode(payload);
  const message = readRingCentralErrorMessage(payload) || fallbackMessage;
  const error = new Error(errorCode ? `${message} (${errorCode})` : message) as RingCentralRequestError;
  error.status = status;
  error.errorCode = errorCode || null;
  return error;
}

export function isRingCentralAuthorizationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return Number((error as { status?: unknown }).status) === 401;
}

export async function retryRingCentralRequestAfterRefresh<T>(input: {
  accessToken: string;
  refreshAccessToken: () => Promise<string>;
  request: (accessToken: string) => Promise<T>;
}) {
  try {
    return await input.request(input.accessToken);
  } catch (error) {
    if (!isRingCentralAuthorizationError(error)) {
      throw error;
    }

    const refreshedAccessToken = await input.refreshAccessToken();
    return await input.request(refreshedAccessToken);
  }
}

export function formatRingCentralPhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

export function isRingCentralOutboundNumber(value: RingCentralPhoneNumber) {
  return isRingCentralRingOutFromNumber(value);
}

export function isRingCentralCallerIdNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber) {
    return false;
  }

  if (value.enabled === false) {
    return false;
  }

  const features = value.features ?? [];
  if (features.includes("CallerId")) {
    return true;
  }

  return RINGCENTRAL_CALLER_ID_USAGE_TYPES.has(value.usageType ?? "");
}

export function isRingCentralRingOutFromNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber) {
    return false;
  }

  if (value.enabled === false) {
    return false;
  }

  const features = value.features ?? [];
  if (features.includes("CallForwarding") || features.includes("CallFlip")) {
    return true;
  }

  return (
    RINGCENTRAL_RINGOUT_FROM_TYPES.has(value.type ?? "") ||
    RINGCENTRAL_RINGOUT_FROM_USAGE_TYPES.has(value.usageType ?? "")
  );
}

export function selectRingCentralRingOutFromNumber(
  numbers: RingCentralPhoneNumber[],
  preferredFromNumber: string | null,
) {
  const normalizedPreferred = preferredFromNumber ? normalizePhoneNumber(preferredFromNumber) : "";
  if (normalizedPreferred) {
    const preferredMatch = numbers.find(
      (number) =>
        normalizePhoneNumber(number.phoneNumber) === normalizedPreferred &&
        isRingCentralRingOutFromNumber(number),
    );
    if (preferredMatch) {
      return normalizePhoneNumber(preferredMatch.phoneNumber);
    }
  }

  const firstRingOutNumber = numbers.find(isRingCentralRingOutFromNumber);
  if (firstRingOutNumber) {
    return normalizePhoneNumber(firstRingOutNumber.phoneNumber);
  }

  return "";
}

export function buildRingCentralAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string | null;
  serverUrl?: string;
}) {
  const url = new URL(RINGCENTRAL_AUTHORIZE_PATH, input.serverUrl ?? DEFAULT_RINGCENTRAL_SERVER_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export function selectRingCentralRecordingForSession(
  records: RingCentralCallLogRecordSummary[],
  telephonySessionId: string,
) {
  const sessionId = normalizeRingCentralSessionId(telephonySessionId);
  if (!sessionId) {
    return null;
  }

  const matches = records
    .map((record) => {
      const recordSessionId = normalizeRingCentralSessionId(record.telephonySessionId);
      const callLogId = readText(record.id);
      const recordingId = readText(record.recording?.id);
      const contentUri = readText(record.recording?.contentUri);
      const duration =
        typeof record.duration === "number" && Number.isFinite(record.duration)
          ? record.duration
          : Number(record.duration ?? 0);
      const startTime = readText(record.startTime);

      if (!callLogId || recordSessionId !== sessionId || !contentUri) {
        return null;
      }

      return {
        callLogId,
        recordingId: recordingId || null,
        contentUri,
        telephonySessionId: recordSessionId,
        duration: Number.isFinite(duration) ? duration : 0,
        startTime,
      };
    })
    .filter((record): record is RingCentralRecordingMatch & { duration: number; startTime: string } => Boolean(record));

  matches.sort((left, right) => {
    if (right.duration !== left.duration) {
      return right.duration - left.duration;
    }

    const leftStart = left.startTime ? Date.parse(left.startTime) : Number.POSITIVE_INFINITY;
    const rightStart = right.startTime ? Date.parse(right.startTime) : Number.POSITIVE_INFINITY;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }

    return left.callLogId.localeCompare(right.callLogId);
  });

  if (!matches.length) {
    return null;
  }

  const [selected] = matches;
  return {
    callLogId: selected.callLogId,
    recordingId: selected.recordingId,
    contentUri: selected.contentUri,
    telephonySessionId: selected.telephonySessionId,
  } satisfies RingCentralRecordingMatch;
}

function buildRingCentralRecordingLookupWindow(occurredAt: string | null | undefined) {
  const occurredTime = occurredAt ? Date.parse(occurredAt) : Number.NaN;
  const anchor = Number.isFinite(occurredTime) ? occurredTime : Date.now();

  return {
    dateFrom: new Date(anchor - 24 * 60 * 60 * 1000).toISOString(),
    dateTo: new Date(anchor + 24 * 60 * 60 * 1000).toISOString(),
  };
}

function mapRingCentralCallLogRecord(value: unknown): RingCentralCallLogRecordSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const recordingValue = record.recording;
  const recording =
    recordingValue && typeof recordingValue === "object"
      ? {
        id: readText((recordingValue as Record<string, unknown>).id) || null,
        contentUri: readText((recordingValue as Record<string, unknown>).contentUri) || null,
      }
      : null;

  return {
    id: readText(record.id) || null,
    telephonySessionId: readText(record.telephonySessionId) || null,
    startTime: readText(record.startTime) || null,
    duration:
      typeof record.duration === "number" && Number.isFinite(record.duration)
        ? record.duration
        : Number.isFinite(Number(record.duration))
          ? Number(record.duration)
          : null,
    recording,
  };
}

async function fetchRingCentralCallLogPage(input: {
  accessToken: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  perPage: number;
  serverUrl?: string;
}) {
  const url = new URL("/restapi/v1.0/account/~/call-log", input.serverUrl ?? DEFAULT_RINGCENTRAL_SERVER_URL);
  url.searchParams.set("view", "Detailed");
  url.searchParams.set("type", "Voice");
  url.searchParams.set("recordingType", "All");
  url.searchParams.set("dateFrom", input.dateFrom);
  url.searchParams.set("dateTo", input.dateTo);
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("perPage", String(input.perPage));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as RingCentralCallLogListPayload) : {};
  if (!response.ok) {
    throw createRingCentralRequestError(
      response.status,
      data,
      `RingCentral call log lookup failed (${response.status}).`,
    );
  }

  const records = Array.isArray(data.records) ? data.records : [];
  return records
    .map((record) => mapRingCentralCallLogRecord(record))
    .filter((record): record is RingCentralCallLogRecordSummary => Boolean(record));
}

export async function fetchRingCentralCallLogRecords(input: {
  accessToken: string;
  dateFrom: string;
  dateTo: string;
  serverUrl?: string;
  maxPages?: number;
  perPage?: number;
}) {
  const maxPages = Math.max(1, input.maxPages ?? 3);
  const perPage = Math.max(1, input.perPage ?? 100);
  const records: RingCentralCallLogRecordSummary[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRecords = await fetchRingCentralCallLogPage({
      accessToken: input.accessToken,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      page,
      perPage,
      serverUrl: input.serverUrl,
    });

    records.push(...pageRecords);

    if (pageRecords.length < perPage) {
      break;
    }
  }

  return records;
}

export async function fetchRingCentralRecordingForSession(input: {
  accessToken: string;
  telephonySessionId: string;
  occurredAt?: string | null;
  serverUrl?: string;
  maxPages?: number;
  perPage?: number;
}) {
  const sessionId = normalizeRingCentralSessionId(input.telephonySessionId);
  if (!sessionId) {
    return null;
  }

  const { dateFrom, dateTo } = buildRingCentralRecordingLookupWindow(input.occurredAt ?? null);
  const records = await fetchRingCentralCallLogRecords({
    accessToken: input.accessToken,
    dateFrom,
    dateTo,
    serverUrl: input.serverUrl,
    maxPages: input.maxPages,
    perPage: input.perPage,
  });

  return selectRingCentralRecordingForSession(records, sessionId);
}

export async function fetchRingCentralRecordingContent(input: {
  accessToken: string;
  contentUri: string;
}) {
  const response = await fetch(input.contentUri, {
    headers: {
      Accept: "audio/*,application/octet-stream;q=0.9,*/*;q=0.8",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    throw createRingCentralRequestError(
      response.status,
      payload,
      `RingCentral recording download failed (${response.status}).`,
    );
  }

  return response;
}
