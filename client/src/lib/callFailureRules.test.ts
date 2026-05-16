import assert from "node:assert/strict";
import test from "node:test";

import {
  isRingCentralRateLimitError,
  shouldAdvanceQueueAfterCallFailure,
} from "./ringcentral";

test("detects RingCentral rate-limit failures", () => {
  assert.equal(isRingCentralRateLimitError("Request rate exceeded (CMN-301)"), true);
  assert.equal(isRingCentralRateLimitError("CMN-304"), true);
  assert.equal(isRingCentralRateLimitError("RingCentral could not connect the call."), false);
});

test("does not advance the queue for RingCentral rate-limit failures", () => {
  assert.equal(shouldAdvanceQueueAfterCallFailure("Request rate exceeded (CMN-301)"), false);
});

test("does not advance the queue when the callback number is unusable", () => {
  assert.equal(
    shouldAdvanceQueueAfterCallFailure("No usable callback number configured for RingCentral."),
    false,
  );
});

test("advances the queue for ordinary call failures", () => {
  assert.equal(shouldAdvanceQueueAfterCallFailure("RingCentral could not connect the call."), true);
});
