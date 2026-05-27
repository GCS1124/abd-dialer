import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseHydratedQueueCursor,
  isQueueCursorExhausted,
  shouldAdvanceQueueAfterDisposition,
  shouldResetDialerCampaignSelectionOnEnter,
} from "./dialerQueue.ts";

test("prefers the server queue cursor over stored and fallback cursors", () => {
  assert.deepEqual(
    chooseHydratedQueueCursor(
      { currentLeadId: "server", currentPhoneIndex: 2 },
      { currentLeadId: "stored", currentPhoneIndex: 1 },
      { currentLeadId: "fallback", currentPhoneIndex: 0 },
    ),
    { currentLeadId: "server", currentPhoneIndex: 2 },
  );
});

test("falls back to stored and then fallback queue cursors", () => {
  assert.deepEqual(
    chooseHydratedQueueCursor(
      null,
      { currentLeadId: "stored", currentPhoneIndex: 1 },
      { currentLeadId: "fallback", currentPhoneIndex: 0 },
    ),
    { currentLeadId: "stored", currentPhoneIndex: 1 },
  );

  assert.deepEqual(
    chooseHydratedQueueCursor(null, null, { currentLeadId: "fallback", currentPhoneIndex: 0 }),
    { currentLeadId: "fallback", currentPhoneIndex: 0 },
  );
});

test("reopens campaign selection when entering the dialer with multiple active campaigns", () => {
  assert.equal(shouldResetDialerCampaignSelectionOnEnter(null, "/dialer", 2), true);
  assert.equal(shouldResetDialerCampaignSelectionOnEnter("/dashboard", "/dialer", 3), true);
  assert.equal(shouldResetDialerCampaignSelectionOnEnter("/dialer", "/dialer", 3), false);
  assert.equal(shouldResetDialerCampaignSelectionOnEnter("/dashboard", "/reports", 3), false);
  assert.equal(shouldResetDialerCampaignSelectionOnEnter("/dashboard", "/dialer", 1), false);
});

test("advances disposition queue only for the currently active lead cursor", () => {
  assert.equal(
    shouldAdvanceQueueAfterDisposition(
      { currentLeadId: "lead-1", currentPhoneIndex: 0 },
      "lead-1",
      0,
    ),
    true,
  );

  assert.equal(
    shouldAdvanceQueueAfterDisposition(
      { currentLeadId: "lead-2", currentPhoneIndex: 0 },
      "lead-1",
      0,
    ),
    false,
  );

  assert.equal(shouldAdvanceQueueAfterDisposition(null, "lead-1", 0), true);
});

test("treats the exhausted queue sentinel as a real finished state", () => {
  assert.equal(
    isQueueCursorExhausted({ currentLeadId: null, currentPhoneIndex: -1 }),
    true,
  );
  assert.equal(
    isQueueCursorExhausted({ currentLeadId: "lead-1", currentPhoneIndex: -1 }),
    false,
  );
  assert.equal(isQueueCursorExhausted({ currentLeadId: null, currentPhoneIndex: 0 }), false);
});
