import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRingCentralStatus } from "./ringcentralStatus.ts";

test("normalizeRingCentralStatus preserves active telephony recovery fields", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    accountId: "acct-1",
    extensionId: "ext-1",
    accountMainNumber: "+17325550100",
    selectedCallerIdNumber: "+17325939636",
    availableCallerIdNumbers: [],
    connectedAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:01:00.000Z",
    expiresAt: null,
    message: null,
    activeTelephonySessionId: "session-1",
    activeTelephonyPartyId: "party-1",
    activeTelephonyDirection: "Inbound",
    activeTelephonyStatusCode: "Proceeding",
    activeTelephonyUpdatedAt: "2026-05-21T00:01:30.000Z",
  });

  assert.equal(status.activeTelephonySessionId, "session-1");
  assert.equal(status.activeTelephonyPartyId, "party-1");
  assert.equal(status.activeTelephonyDirection, "Inbound");
  assert.equal(status.activeTelephonyStatusCode, "Proceeding");
  assert.equal(status.activeTelephonyUpdatedAt, "2026-05-21T00:01:30.000Z");
  assert.equal(status.accountMainNumber, "+17325550100");
});

test("normalizeRingCentralStatus accepts legacy RingOut field names", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    selectedRingOutNumber: "17027494172",
    availableRingOutNumbers: [
      {
        phoneNumber: "17027494172",
        usageType: "DirectNumber",
        type: "VoiceFax",
        features: ["CallerId"],
        enabled: true,
      },
    ],
  });

  assert.equal(status.selectedCallerIdNumber, "17027494172");
  assert.equal(status.availableCallerIdNumbers[0]?.phoneNumber, "17027494172");
});

test("normalizeRingCentralStatus hides the RingCentral webhook SUB-522 warning", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    message: "WebHook responds with incorrect HTTP status. HTTP status is 503 (SUB-522)",
  });

  assert.equal(status.message, null);
});

test("normalizeRingCentralStatus preserves other message text when stripping the webhook warning", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    message: "RingCentral numbers could not be loaded. WebHook responds with incorrect HTTP status. HTTP status is 503 (SUB-522)",
  });

  assert.equal(status.message, "RingCentral numbers could not be loaded.");
});
