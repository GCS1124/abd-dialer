import assert from "node:assert/strict";
import test from "node:test";

import {
  getDispositionLeadStatus,
  getDispositionQueueActionLabel,
  resolveDispositionSelection,
} from "./dialerDisposition.js";

test("resolves grouped callback dispositions from main and sub keys", () => {
  const selection = resolveDispositionSelection({
    mainDisposition: "CALLBACK",
    subDisposition: "REQUESTED_CALLBACK",
  });

  assert.deepEqual(selection, {
    mainDisposition: "CALLBACK",
    mainDispositionLabel: "Callback",
    subDisposition: "REQUESTED_CALLBACK",
    subDispositionLabel: "Requested Callback",
    disposition: "Call Back Later",
    queueAction: "SCHEDULE_CALLBACK",
    callbackPriority: "High",
    timingKind: "callback",
  });
});

test("derives lead statuses from the grouped taxonomy", () => {
  const selection = resolveDispositionSelection({
    mainDisposition: "NOT_CONNECTED",
    subDisposition: "NO_ANSWER",
  });

  assert.equal(getDispositionLeadStatus(selection), "contacted");
  assert.equal(getDispositionQueueActionLabel(selection.queueAction), "Retry next day");
});
