import assert from "node:assert/strict";
import test from "node:test";

import { getRecordingState } from "./recordingState.ts";

test("maps recording rows to ready, processing, and unavailable states", () => {
  assert.deepEqual(getRecordingState({ recordingEnabled: true, recordingUrl: "https://example.com" }), {
    hasRecordingUrl: true,
    status: "Ready",
    toneClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  });

  assert.deepEqual(getRecordingState({ recordingEnabled: true, recordingUrl: null }), {
    hasRecordingUrl: false,
    status: "Processing",
    toneClass: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  });

  assert.deepEqual(getRecordingState({ recordingEnabled: false, recordingUrl: null }), {
    hasRecordingUrl: false,
    status: "Unavailable",
    toneClass: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  });
});
