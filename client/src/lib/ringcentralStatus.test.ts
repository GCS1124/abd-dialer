import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRingCentralStatus } from "./ringcentralStatus.ts";

test("normalizeRingCentralStatus preserves active telephony recovery fields", () => {
  const status = normalizeRingCentralStatus({
    connected: true,
    accountId: "acct-1",
    extensionId: "ext-1",
    selectedRingOutNumber: "+17325939636",
    availableRingOutNumbers: [],
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
});
