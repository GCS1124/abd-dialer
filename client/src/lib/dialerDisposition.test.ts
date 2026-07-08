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
    subDispositionLabel: "Callback Requested",
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

test("uses the updated dialer disposition labels", () => {
  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "NOT_CONNECTED",
      subDisposition: "VOICEMAIL",
    }).subDispositionLabel,
    "Left Voicemail",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "CALLBACK",
      subDisposition: "REQUESTED_CALLBACK",
    }).subDispositionLabel,
    "Callback Requested",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "CALLBACK",
      subDisposition: "GATEKEEPER_REACHED",
    }).subDispositionLabel,
    "Gatekeeper Reached",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "NOT_INTERESTED",
      subDisposition: "NOT_INTERESTED_OTHER",
    }).subDispositionLabel,
    "Not Interested",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "INVALID_LEAD",
      subDisposition: "WRONG_NUMBER",
    }).subDispositionLabel,
    "Bad/Wrong Number",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "DO_NOT_CALL",
      subDisposition: "DO_NOT_CALL",
    }).subDispositionLabel,
    "Do Not Contact (DNC)",
  );

  assert.equal(
    resolveDispositionSelection({
      disposition: "3rd party hung up",
    }).subDispositionLabel,
    "Hung up",
  );
});
