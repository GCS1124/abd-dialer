import type { RingCentralPhoneNumber } from "./ringcentral.ts";

export interface RingCentralIntegrationStatus {
  connected: boolean;
  accountId: string | null;
  extensionId: string | null;
  accountMainNumber: string | null;
  selectedCallerIdNumber: string | null;
  availableCallerIdNumbers: RingCentralPhoneNumber[];
  selectedRingOutNumber?: string | null;
  availableRingOutNumbers?: RingCentralPhoneNumber[];
  connectedAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  message: string | null;
  activeTelephonySessionId: string | null;
  activeTelephonyPartyId: string | null;
  activeTelephonyDirection: string | null;
  activeTelephonyStatusCode: string | null;
  activeTelephonyUpdatedAt: string | null;
}

export function normalizeRingCentralStatus(
  status: Partial<RingCentralIntegrationStatus> | null | undefined,
): RingCentralIntegrationStatus {
  const normalizedStatus: Partial<RingCentralIntegrationStatus> = status ?? {};

  return {
    connected: normalizedStatus.connected ?? false,
    accountId: normalizedStatus.accountId ?? null,
    extensionId: normalizedStatus.extensionId ?? null,
    accountMainNumber: normalizedStatus.accountMainNumber ?? null,
    selectedCallerIdNumber:
      normalizedStatus.selectedCallerIdNumber ??
      normalizedStatus.selectedRingOutNumber ??
      null,
    availableCallerIdNumbers:
      normalizedStatus.availableCallerIdNumbers ??
      normalizedStatus.availableRingOutNumbers ??
      [],
    connectedAt: normalizedStatus.connectedAt ?? null,
    updatedAt: normalizedStatus.updatedAt ?? null,
    expiresAt: normalizedStatus.expiresAt ?? null,
    message: normalizedStatus.message ?? null,
    activeTelephonySessionId: normalizedStatus.activeTelephonySessionId ?? null,
    activeTelephonyPartyId: normalizedStatus.activeTelephonyPartyId ?? null,
    activeTelephonyDirection: normalizedStatus.activeTelephonyDirection ?? null,
    activeTelephonyStatusCode: normalizedStatus.activeTelephonyStatusCode ?? null,
    activeTelephonyUpdatedAt: normalizedStatus.activeTelephonyUpdatedAt ?? null,
  };
}
