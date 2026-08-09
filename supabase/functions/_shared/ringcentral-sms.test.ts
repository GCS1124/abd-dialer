import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRingCentralSmsMessage } from "./ringcentral-sms.ts";

test("normalizes numeric RingCentral message identifiers", () => {
  const message = normalizeRingCentralSmsMessage({
    id: 6424569004,
    conversationId: 6424569004,
    type: "SMS",
    direction: "Inbound",
    from: {
      phoneNumber: "+16505550123",
      name: "Jordan",
    },
    to: [
      {
        phoneNumber: "+17027494172",
        target: true,
      },
    ],
    text: "Test message",
    messageStatus: "Received",
  });

  assert.equal(message?.id, "6424569004");
  assert.equal(message?.conversationId, "6424569004");
  assert.equal(message?.ownPhoneNumber, "+17027494172");
  assert.equal(message?.text, "Test message");
});
