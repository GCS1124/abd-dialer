import type { VoiceProviderConfig } from "../types";

const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";

export interface RingCentralPhoneNumber {
  phoneNumber: string;
  features?: string[];
  usageType?: string | null;
  type?: string | null;
  label?: string | null;
  enabled?: boolean;
}

export interface RingCentralBrowserVoiceSession extends VoiceProviderConfig {}

function normalizePhoneNumber(value: string) {
  return value.replace(/[^\d]/g, "");
}

function normalizeVoiceSource(value: unknown): VoiceProviderConfig["source"] {
  if (value === "profile" || value === "environment" || value === "ringcentral") {
    return value;
  }

  return "unconfigured";
}

function formatE164PhoneNumber(value: string) {
  const digits = normalizePhoneNumber(value);
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
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

export function isRingCentralOutboundNumber(value: RingCentralPhoneNumber) {
  return isRingCentralRingOutFromNumber(value);
}

export function selectRingCentralCallerIdNumber(
  numbers: RingCentralPhoneNumber[],
  preferredCallerIdNumber: string | null,
) {
  const normalizedPreferred = preferredCallerIdNumber ? normalizePhoneNumber(preferredCallerIdNumber) : "";
  if (normalizedPreferred) {
    const preferredMatch = numbers.find(
      (number) =>
        normalizePhoneNumber(number.phoneNumber) === normalizedPreferred &&
        isRingCentralCallerIdNumber(number),
    );
    if (preferredMatch) {
      return normalizePhoneNumber(preferredMatch.phoneNumber);
    }
  }

  const firstCallerIdNumber = numbers.find(isRingCentralCallerIdNumber);
  if (firstCallerIdNumber) {
    return normalizePhoneNumber(firstCallerIdNumber.phoneNumber);
  }

  return "";
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

export function formatRingCentralPhoneNumber(value: string) {
  return formatE164PhoneNumber(value);
}

export function buildRingCentralAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  serverUrl?: string;
}) {
  const url = new URL(RINGCENTRAL_AUTHORIZE_PATH, input.serverUrl ?? DEFAULT_RINGCENTRAL_SERVER_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function normalizeRingCentralBrowserVoiceSession(
  session: Partial<RingCentralBrowserVoiceSession> | null | undefined,
): RingCentralBrowserVoiceSession {
  return {
    provider: "ringcentral",
    available: session?.available ?? false,
    source: normalizeVoiceSource(session?.source),
    callerId: session?.callerId ?? null,
    websocketUrl: session?.websocketUrl ?? null,
    sipDomain: session?.sipDomain ?? null,
    username: session?.username ?? null,
    profileId: session?.profileId ?? null,
    profileLabel: session?.profileLabel ?? null,
    authorizationId: session?.authorizationId ?? null,
    sipUri: session?.sipUri ?? null,
    authorizationUsername: session?.authorizationUsername ?? null,
    authorizationPassword: session?.authorizationPassword ?? null,
    dialPrefix: session?.dialPrefix ?? null,
    displayName: session?.displayName ?? null,
    message: session?.message ?? null,
  };
}

export function isRingCentralRateLimitError(message: string) {
  return /CMN-30[1-4]|Request rate exceeded/i.test(message);
}

export function shouldAdvanceQueueAfterCallFailure(message: string) {
  return !isRingCentralRateLimitError(message);
}
