import assert from "node:assert/strict";
import test from "node:test";

import {
  isRingCentralTelephonyWebhookPayload,
  shouldAcknowledgeRingCentralWebhookImmediately,
} from "./ringcentral-webhook.ts";

test("acknowledges RingCentral validation handshakes immediately", () => {
  assert.equal(shouldAcknowledgeRingCentralWebhookImmediately(null), true);
  assert.equal(shouldAcknowledgeRingCentralWebhookImmediately({}), true);
  assert.equal(
    shouldAcknowledgeRingCentralWebhookImmediately({
      subscriptionId: "sub-123",
    }),
    true,
  );
});

test("acknowledges non-telephony webhook payloads immediately", () => {
  assert.equal(
    shouldAcknowledgeRingCentralWebhookImmediately({
      event: "/rcvideo/v1/meetings",
      body: {
        meetingId: "mtg-123",
        status: "Scheduled",
      },
    }),
    true,
  );
});

test("detects top-level telephony webhook payloads", () => {
  assert.equal(
    isRingCentralTelephonyWebhookPayload({
      telephonySessionId: "session-123",
      parties: [],
    }),
    true,
  );
});

test("detects nested telephony webhook payloads", () => {
  assert.equal(
    isRingCentralTelephonyWebhookPayload({
      subscriptionId: "sub-123",
      body: {
        sessionId: "legacy-session-1",
        eventTime: "2026-05-27T13:45:00.000Z",
        parties: [
          {
            id: "party-1",
            direction: "Inbound",
          },
        ],
      },
    }),
    true,
  );
});
