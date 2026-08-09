import type { VoiceProviderConfig } from "../types";

const DEFAULT_RINGCENTRAL_SERVER_URL = "https://platform.ringcentral.com";
const RINGCENTRAL_AUTHORIZE_PATH = "/restapi/oauth/authorize";

export interface RingCentralPhoneNumber {
  phoneNumber: string;
  extensionId?: string | null;
  features?: string[];
  usageType?: string | null;
  type?: string | null;
  label?: string | null;
  enabled?: boolean;
}

export interface RingCentralBrowserVoiceSession extends VoiceProviderConfig {}

export interface RingCentralPkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createRingCentralPkcePair(): Promise<RingCentralPkcePair> {
  const verifierBytes = new Uint8Array(64);
  globalThis.crypto.getRandomValues(verifierBytes);
  const codeVerifier = encodeBase64Url(verifierBytes);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );

  return {
    codeVerifier,
    codeChallenge: encodeBase64Url(new Uint8Array(digest)),
  };
}

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
const RINGCENTRAL_SMS_FEATURES = new Set([
  "SmsSender",
  "MmsSender",
  "InternationalSmsSender",
  "A2PSmsSender",
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

export function isRingCentralSmsSenderNumber(value: RingCentralPhoneNumber) {
  if (!value.phoneNumber || value.enabled === false) {
    return false;
  }

  const features = value.features ?? [];
  if (features.some((feature) => RINGCENTRAL_SMS_FEATURES.has(feature))) {
    return true;
  }

  // RingCentral can omit features for non-admin number lookups.
  return features.length === 0 && value.usageType === "DirectNumber" && value.type !== "FaxOnly";
}

export function isRingCentralSmsSenderForExtension(
  value: RingCentralPhoneNumber,
  extensionId?: string | null,
) {
  if (!isRingCentralSmsSenderNumber(value)) {
    return false;
  }

  const numberExtensionId = value.extensionId?.trim() ?? "";
  const authorizedExtensionId = extensionId?.trim() ?? "";
  return !numberExtensionId || !authorizedExtensionId || numberExtensionId === authorizedExtensionId;
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
  const rankedMatches = [
    numbers.find((number) => number.usageType === "MainCompanyNumber" && isRingCentralCallerIdNumber(number)),
    numbers.find((number) => number.usageType === "AdditionalCompanyNumber" && isRingCentralCallerIdNumber(number)),
    numbers.find((number) => number.usageType === "CompanyNumber" && isRingCentralCallerIdNumber(number)),
    firstCallerIdNumber,
  ];

  for (const match of rankedMatches) {
    if (match?.phoneNumber) {
      return normalizePhoneNumber(match.phoneNumber);
    }
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
