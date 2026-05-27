import {
  getSupabaseBrowserKey,
  getSupabaseClient,
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

async function invokeRingCentralFunction<T>(body: Record<string, unknown>, functionName = "ringcentral") {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw new Error(await getRingCentralFunctionErrorMessage(error));
  }

  return data as T;
}

function readErrorPayloadMessage(payload: unknown) {
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

async function getRingCentralFunctionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;

  if (context instanceof Response) {
    const status = context.status;
    const fallback = `RingCentral function failed${status ? ` (${status})` : ""}.`;
    const text = await context
      .clone()
      .text()
      .catch(() => "");

    if (!text) {
      return fallback;
    }

    try {
      const message = readErrorPayloadMessage(JSON.parse(text));
      if (message) {
        return message;
      }
    } catch {
      return text.length > 300 ? `${text.slice(0, 300)}...` : text;
    }

    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to reach RingCentral settings.";
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

export async function beginRingCentralConnection() {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "connect",
  });

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function loadRingCentralStatus() {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "status",
  });

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function loadRingCentralBrowserVoiceSession() {
  const response = await invokeRingCentralFunction<{ voice: VoiceProviderConfig }>(
    {
      action: "browser-voice-session",
    },
  );

  return normalizeRingCentralBrowserVoiceSessionResponse(response.voice);
}

export async function saveRingCentralCallerIdNumber(callerIdNumber: string | null) {
  const response = await invokeRingCentralFunction<{ status: RingCentralIntegrationStatus }>({
    action: "update-caller-id-number",
    callerIdNumber,
  });

  return normalizeRingCentralIntegrationStatus(response.status);
}

export async function disconnectRingCentral() {
  await invokeRingCentralFunction<{ success: boolean }>({
    action: "disconnect",
  });
}

export async function createRingCentralVideoMeeting(
  input: CreateRingCentralVideoMeetingInput,
) {
  const response = await invokeRingCentralFunction<{ meeting: RingCentralVideoMeeting }>({
    action: "create-video-meeting",
    ...input,
  });

  return response.meeting;
}

export async function syncRingCentralRecordings(limit?: number) {
  return await invokeRingCentralFunction<{
    checkedCount: number;
    hydratedCount: number;
    propagatedCount: number;
  }>({
    action: "sync-recordings",
    limit,
  });
}

export async function fetchRingCentralRecordingBlob(callLogId: string) {
  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    throw new Error("You must be signed in to load recordings.");
  }

  const response = await fetch(getSupabaseFunctionUrl("ringcentral"), {
    method: "POST",
    headers: {
      apikey: getSupabaseBrowserKey(),
      Authorization: `Bearer ${accessToken}`,
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
