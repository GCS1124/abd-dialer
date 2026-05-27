type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readSessionBody(payload: JsonRecord) {
  return isRecord(payload.body) ? payload.body : payload;
}

export function isRingCentralTelephonyWebhookPayload(body: unknown) {
  if (!isRecord(body)) {
    return false;
  }

  const session = readSessionBody(body);
  return Boolean(
    readString(session.telephonySessionId) ||
      readString(session.sessionId) ||
      Array.isArray(session.parties),
  );
}

export function shouldAcknowledgeRingCentralWebhookImmediately(body: unknown) {
  return !isRingCentralTelephonyWebhookPayload(body);
}
