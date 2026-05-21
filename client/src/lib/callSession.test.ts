import assert from "node:assert/strict";
import test from "node:test";

import {
  createIncomingCallState,
  promoteCallToConnected,
} from "./callSession.ts";

test("promoteCallToConnected preserves the inbound call identity", () => {
  const ringing = createIncomingCallState({
    leadId: "lead-1",
    displayName: "Shadma Ali",
    dialedNumber: "+17325939636",
    startedAt: 1716240000000,
    callId: "call-1",
  });

  const connected = promoteCallToConnected(ringing);

  assert.equal(connected.status, "connected");
  assert.equal(connected.direction, "incoming");
  assert.equal(connected.callId, "call-1");
});
