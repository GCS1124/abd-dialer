import assert from "node:assert/strict";
import test from "node:test";

import {
  getDispositionLeadStatus,
  getDispositionQueueActionLabel,
  getMainDispositionOptions,
  resolveDispositionSelection,
} from "./dialerDisposition.js";

test("exposes only filter-level main dispositions", () => {
  assert.deepEqual(
    getMainDispositionOptions().map((option) => option.key),
    ["ANSWER_MACHINE", "NO_ANSWER", "HUNG_UP", "CALL_LATER", "DECISION_MAKER", "NON_DECISION_MAKER"],
  );
});

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
    connected: true,
  });
});

test("keeps queue workflow on the sub disposition when main is changed", () => {
  const decisionMaker = resolveDispositionSelection({
    mainDisposition: "DECISION_MAKER",
    subDisposition: "CALL_BACK_LATER",
  });
  const answerMachine = resolveDispositionSelection({
    mainDisposition: "ANSWER_MACHINE",
    subDisposition: "CALL_BACK_LATER",
  });

  assert.equal(decisionMaker.queueAction, "SCHEDULE_CALLBACK");
  assert.equal(answerMachine.queueAction, "SCHEDULE_CALLBACK");
  assert.equal(decisionMaker.timingKind, "callback");
  assert.equal(answerMachine.timingKind, "callback");
  assert.equal(getDispositionLeadStatus(decisionMaker), "callback_due");
  assert.equal(getDispositionLeadStatus(answerMachine), "callback_due");
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
      mainDisposition: "INTERESTED",
      subDisposition: "MEETING_VISIT_DEMO_SCHEDULED",
    }).subDispositionLabel,
    "Meeting Scheduled / Calendar",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "INTERESTED",
      subDisposition: "PROPOSAL_SHARED",
    }).subDispositionLabel,
    "Proposal Sent",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "INTERESTED",
      subDisposition: "REPORT_SENT",
    }).subDispositionLabel,
    "Report Sent",
  );

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "INTERESTED",
      subDisposition: "CREATE_A_PLAN",
    }).subDispositionLabel,
    "Create a Plan",
  );

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

  assert.equal(
    resolveDispositionSelection({
      mainDisposition: "INTERESTED",
      subDisposition: "PROPOSAL_SHARED",
      disposition: "Custom proposal sent",
    }).disposition,
    "Custom proposal sent",
  );
});
