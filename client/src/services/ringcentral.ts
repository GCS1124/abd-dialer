import {
  getSupabaseBrowserKey,
  getSupabaseFunctionUrl,
} from "../lib/supabase";
import {
  normalizeRingCentralStatus,
  type RingCentralIntegrationStatus,
} from "../lib/ringcentralStatus";
import {
  normalizeRingCentralBrowserVoiceSession,
  type RingCentralPhoneNumber,
  selectRingCentralCallerIdNumber,
  selectRingCentralRingOutFromNumber,
} from "../lib/ringcentral";
import { getSessionAccessToken } from "./auth";
import type { VoiceProviderConfig } from "../types";

export type { RingCentralIntegrationStatus } from "../lib/ringcentralStatus";

export type RingCentralVideoMeetingType = "Instant" | "Scheduled" | "PMI";

export interface CreateRingCentralVideoMeetingInput {
  name: string;
  type: RingCentralVideoMeetingType;
  passwordProtected?: boolean;
  password?: string | null;
  joinBeforeHost?: boolean;
  audioMuted?: boolean;
  videoMuted?: boolean;
}

export interface RingCentralVideoMeeting {
  id: string | null;
  name: string;
  type: RingCentralVideoMeetingType;
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

function readErrorPayloadMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const values = payload as Record<string, unknown>;
  if (typeof values.message === "string" && values.message.trim()) {
    return values.message.trim();
  }

  if (typeof values.error === "string" && values.error.trim()) {
    return values.error.trim();
  }

  if (typeof values.code === "string" && values.code.trim()) {
    return values.code.trim();
  }

  return "";
}

function normalizeRingCentralNumbers(numbers: RingCentralPhoneNumber[]) {
  return numbers.map((number) => ({
    ...number,
    phoneNumber: number.phoneNumber.replace(/[^\d]/g, ""),
  }));
}

function normalizeRingCentralBrowserVoiceSessionResponse(
  voice: Partial<VoiceProviderConfig> | null | undefined,
) {
  return normalizeRingCentralBrowserVoiceSession(voice);
}

function normalizeRingCentralIntegrationStatus(status: RingCentralIntegrationStatus) {
  const normalizedStatus = normalizeRingCentralStatus(status);
  return {
    ...normalizedStatus,
    availableCallerIdNumbers: normalizeRingCentralNumbers(normalizedStatus.availableCallerIdNumbers),
  };
}

async function invokeRingCentralFunctionWithToken<T>(
  body: Record<string, unknown>,
  functionName: string,
  accessToken: string | null,
) {
  if (!accessToken) {
    throw new Error("You must be signed in to use RingCentral.");
  }

  const response = await fetch(getSupabaseFunctionUrl(functionName), {
    method: "POST",
    headers: {
      apikey: getSupabaseBrowserKey(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message = readErrorPayloadMessage(payload) || `RingCentral function failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

export async function beginRingCentralConnection(accessToken?: string | null) {
  const response = await invokeRingCentralFunctionWithToken<{ status: RingCentralIntegrationStatus }>(
    { action: "connect" },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function loadRingCentralStatus(accessToken?: string | null) {
  const response = await invokeRingCentralFunctionWithToken<{ status: RingCentralIntegrationStatus }>(
    { action: "status" },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function loadRingCentralBrowserVoiceSession(accessToken?: string | null) {
  const response = await invokeRingCentralFunctionWithToken<{ voice: VoiceProviderConfig }>(
    {
      action: "browser-voice-session",
    },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );

  return normalizeRingCentralBrowserVoiceSessionResponse(response.voice);
}

export async function saveRingCentralCallerIdNumber(callerIdNumber: string | null, accessToken?: string | null) {
  const response = await invokeRingCentralFunctionWithToken<{ status: RingCentralIntegrationStatus }>(
    { action: "update-caller-id-number", callerIdNumber },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function disconnectRingCentral(accessToken?: string | null) {
  await invokeRingCentralFunctionWithToken<{ success: boolean }>(
    { action: "disconnect" },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );
}

export async function createRingCentralVideoMeeting(
  input: CreateRingCentralVideoMeetingInput,
  accessToken?: string | null,
) {
  const response = await invokeRingCentralFunctionWithToken<{ meeting: RingCentralVideoMeeting }>(
    { action: "create-video-meeting", ...input },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );

  return response.meeting;
}

export async function syncRingCentralRecordings(limit?: number, accessToken?: string | null) {
  return await invokeRingCentralFunctionWithToken<{
    checkedCount: number;
    hydratedCount: number;
    propagatedCount: number;
  }>(
    { action: "sync-recordings", limit },
    "ringcentral",
    accessToken ?? await getSessionAccessToken(),
  );
}

export async function fetchRingCentralRecordingBlob(callLogId: string, accessToken?: string | null) {
  const token = accessToken ?? await getSessionAccessToken();
  if (!token) {
    throw new Error("You must be signed in to load recordings.");
  }

  const response = await fetch(getSupabaseFunctionUrl("ringcentral"), {
    method: "POST",
    headers: {
      apikey: getSupabaseBrowserKey(),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "recording-content",
      callLogId,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (text) {
      let message = "";
      try {
        message = readErrorPayloadMessage(JSON.parse(text));
      } catch {
        // Fall through to the raw response body below.
      }

      if (message) {
        throw new Error(message);
      }

      throw new Error(text.length > 300 ? `${text.slice(0, 300)}...` : text);
    }

    throw new Error(`RingCentral function failed (${response.status}).`);
  }

  return await response.blob();
}

export function chooseRingCentralCallerIdNumber(
  numbers: RingCentralPhoneNumber[],
  preferredCallerIdNumber: string | null,
) {
  return selectRingCentralCallerIdNumber(numbers, preferredCallerIdNumber);
}

export function chooseRingCentralRingOutFromNumber(
  numbers: RingCentralPhoneNumber[],
  preferredFromNumber: string | null,
) {
  return selectRingCentralRingOutFromNumber(numbers, preferredFromNumber);
}
