import type { QueueCursor } from "../types";

export const EXHAUSTED_QUEUE_PHONE_INDEX = -1;

export function chooseHydratedQueueCursor(
  serverCursor: QueueCursor | null,
  storedCursor: QueueCursor | null,
  fallbackCursor: QueueCursor | null,
) {
  return serverCursor ?? storedCursor ?? fallbackCursor;
}

export function shouldAdvanceQueueAfterDisposition(
  currentCursor: Pick<QueueCursor, "currentLeadId" | "currentPhoneIndex"> | null | undefined,
  leadId: string | null,
  currentPhoneIndex: number,
) {
  if (!currentCursor?.currentLeadId) {
    return true;
  }

  if (!leadId) {
    return false;
  }

  return (
    currentCursor.currentLeadId === leadId &&
    currentCursor.currentPhoneIndex === currentPhoneIndex
  );
}

export function isQueueCursorExhausted(
  cursor: Pick<QueueCursor, "currentLeadId" | "currentPhoneIndex"> | null | undefined,
) {
  return !cursor?.currentLeadId && cursor?.currentPhoneIndex === EXHAUSTED_QUEUE_PHONE_INDEX;
}

export function shouldRestartExhaustedQueue(
  cursor: Pick<QueueCursor, "currentLeadId" | "currentPhoneIndex"> | null | undefined,
  cursorUpdatedAt: string | null | undefined,
  itemCreatedAts: string[],
) {
  if (!isQueueCursorExhausted(cursor) || !cursorUpdatedAt) {
    return false;
  }

  const cursorUpdatedAtMs = Date.parse(cursorUpdatedAt);
  if (!Number.isFinite(cursorUpdatedAtMs)) {
    return false;
  }

  return itemCreatedAts.some((createdAt) => {
    const createdAtMs = Date.parse(createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs > cursorUpdatedAtMs;
  });
}
