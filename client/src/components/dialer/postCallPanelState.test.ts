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
      subDispositionLabel: "Requested Callback",
    }),
    "Callback / Requested Callback for Julie Turner. Notes: Call tomorrow",
  );
});
