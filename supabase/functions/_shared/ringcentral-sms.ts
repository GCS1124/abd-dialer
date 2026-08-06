type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

export interface RingCentralSmsParticipant {
  phoneNumber: string | null;
  extensionNumber: string | null;
  name: string | null;
  location: string | null;
  target: boolean;
}

export interface RingCentralSmsMessageRecord {
  id: string | null;
  conversationId: string | null;
  direction: "Inbound" | "Outbound";
  fromPhoneNumber: string | null;
  fromName: string | null;
  toPhoneNumbers: string[];
  toNames: string[];
  subject: string | null;
  text: string;
  readStatus: string | null;
  messageStatus: string | null;
  availability: string | null;
  creationTime: string | null;
  lastModifiedTime: string | null;
  peerPhoneNumber: string | null;
  peerName: string | null;
  ownPhoneNumber: string | null;
}

export function normalizeRingCentralSmsParticipant(value: unknown): RingCentralSmsParticipant | null {
  const record = readOptionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    phoneNumber: readText(record.phoneNumber) || null,
    extensionNumber: readText(record.extensionNumber) || null,
    name: readText(record.name) || null,
    location: readText(record.location) || null,
    target: record.target === true,
  };
}

export function normalizeRingCentralSmsMessage(value: unknown): RingCentralSmsMessageRecord | null {
  const record = readOptionalRecord(value);
  if (!record) {
    return null;
  }

  const from = normalizeRingCentralSmsParticipant(record.from);
  const to = Array.isArray(record.to)
    ? record.to
      .map((entry) => normalizeRingCentralSmsParticipant(entry))
      .filter((entry): entry is RingCentralSmsParticipant => Boolean(entry))
    : [];
  const direction = readText(record.direction).toLowerCase() === "outbound" ? "Outbound" : "Inbound";
  const subject = readText(record.subject);
  const text = subject || readText(record.text);
  const peerParticipant =
    direction === "Outbound"
      ? to.find((participant) => participant.target && participant.phoneNumber) ??
        to.find((participant) => participant.phoneNumber) ??
        null
      : from;
  const ownParticipant =
    direction === "Outbound"
      ? from
      : to.find((participant) => participant.target && participant.phoneNumber) ??
        to.find((participant) => participant.phoneNumber) ??
        null;

  return {
    id: readText(record.id) || null,
    conversationId: readText(record.conversationId) || null,
    direction,
    fromPhoneNumber: from?.phoneNumber ?? null,
    fromName: from?.name ?? null,
    toPhoneNumbers: to
      .map((participant) => participant.phoneNumber)
      .filter((phoneNumber): phoneNumber is string => Boolean(phoneNumber)),
    toNames: to
      .map((participant) => participant.name)
      .filter((name): name is string => Boolean(name)),
    subject: subject || null,
    text,
    readStatus: readText(record.readStatus) || null,
    messageStatus: readText(record.messageStatus) || null,
    availability: readText(record.availability) || null,
    creationTime: readText(record.creationTime) || null,
    lastModifiedTime: readText(record.lastModifiedTime) || null,
    peerPhoneNumber: peerParticipant?.phoneNumber ?? null,
    peerName: peerParticipant?.name ?? null,
    ownPhoneNumber: ownParticipant?.phoneNumber ?? null,
  };
}
