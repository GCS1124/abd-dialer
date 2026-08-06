import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDispositionOutcomeSummary,
  isPostCallSaveDisabled,
} from "./postCallPanelState.js";

test("voicemail outcomes can be saved without a hidden summary field", () => {
  assert.equal(
    isPostCallSaveDisabled({
      saving: false,
      needsCallbackTime: false,
      callbackAt: "",
    }),
    false,
  );
});

test("outcome summary is derived from disposition and notes", () => {
  assert.equal(
    buildDispositionOutcomeSummary("Voicemail", "VM", "Julie Turner"),
    "Voicemail for Julie Turner. Notes: VM",
  );
});

test("grouped outcome summary uses the main and sub labels", () => {
  assert.equal(
    buildDispositionOutcomeSummary("Call Back Later", "Call tomorrow", "Julie Turner", {
      mainDispositionLabel: "Callback",
      subDispositionLabel: "Callback Requested",
    }),
    "Callback / Callback Requested for Julie Turner. Notes: Call tomorrow",
  );
});

test("grouped outcome summary does not repeat identical labels", () => {
  assert.equal(
    buildDispositionOutcomeSummary("Not Interested", "No notes", "Julie Turner", {
      mainDispositionLabel: "Not Interested",
      subDispositionLabel: "Not Interested",
    }),
    "Not Interested for Julie Turner. Notes: No notes",
  );
});

test("custom disposition labels are preserved in the outcome summary", () => {
  assert.equal(
    buildDispositionOutcomeSummary("Custom proposal sent", "Follow up later", "Julie Turner", {
      mainDispositionLabel: "Interested",
      subDispositionLabel: "Proposal Sent",
      customDispositionLabel: "Custom proposal sent",
    }),
    "Interested / Custom proposal sent for Julie Turner. Notes: Follow up later",
  );
});
