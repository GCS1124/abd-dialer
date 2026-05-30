import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyTimecardSummary, summarizeTimecards } from "./timecards.ts";

test("averages timecards across tracked days only", () => {
  const summary = summarizeTimecards([
    {
      workDate: "2026-05-01",
      timezone: "UTC",
      timeOnSystemSeconds: 3600,
      breakSeconds: 600,
      wrapSeconds: 300,
      loginHoursSeconds: 4500,
      capturedAt: "2026-05-01T18:00:00.000Z",
      hasCheckedIn: true,
    },
    {
      workDate: "2026-05-02",
      timezone: "UTC",
      timeOnSystemSeconds: 5400,
      breakSeconds: 900,
      wrapSeconds: 600,
      loginHoursSeconds: 6900,
      capturedAt: "2026-05-02T18:00:00.000Z",
      hasCheckedIn: true,
    },
  ]);

  assert.equal(summary.trackedDays, 2);
  assert.equal(summary.totalTimeOnSystemSeconds, 9000);
  assert.equal(summary.totalBreakSeconds, 1500);
  assert.equal(summary.totalWrapSeconds, 900);
  assert.equal(summary.totalLoginHoursSeconds, 11400);
  assert.equal(summary.averageTimeOnSystemSeconds, 4500);
  assert.equal(summary.averageBreakSeconds, 750);
  assert.equal(summary.averageWrapSeconds, 450);
  assert.equal(summary.averageLoginHoursSeconds, 5700);
});

test("returns an empty summary when no timecards exist", () => {
  const summary = summarizeTimecards([]);
  assert.deepEqual(summary, createEmptyTimecardSummary());
});
