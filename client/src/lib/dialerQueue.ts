import type { QueueCursor } from "../types";

export function chooseHydratedQueueCursor(
  serverCursor: QueueCursor | null,
  storedCursor: QueueCursor | null,
  fallbackCursor: QueueCursor | null,
) {
  return serverCursor ?? storedCursor ?? fallbackCursor;
}

export function shouldResetDialerCampaignSelectionOnEnter(
  previousPathname: string | null,
  pathname: string,
  activeCampaignCount: number,
) {
  return pathname === "/dialer" && previousPathname !== "/dialer" && activeCampaignCount > 1;
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
