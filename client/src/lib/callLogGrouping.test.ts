import assert from "node:assert/strict";
import test from "node:test";

import { mergeCallLogsForView } from "./callLogGrouping.ts";
import type { CallLog } from "../types";

function makeCall(overrides: Partial<CallLog>): CallLog {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    leadId: overrides.leadId ?? "lead-1",
    leadName: overrides.leadName ?? "Lead",
    phone: overrides.phone ?? "+15555550100",
    createdAt: overrides.createdAt ?? "2026-05-29T00:00:00.000Z",
    agentId: overrides.agentId ?? "agent-1",
    agentName: overrides.agentName ?? "Agent",
    callType: overrides.callType ?? "outgoing",
    durationSeconds: overrides.durationSeconds ?? 30,
    disposition: overrides.disposition ?? "Interested",
    mainDisposition: overrides.mainDisposition ?? null,
    subDisposition: overrides.subDisposition ?? null,
    status: overrides.status ?? "connected",
    source: overrides.source ?? "call_log",
    failureStage: overrides.failureStage,
    sipStatus: overrides.sipStatus ?? null,
    sipReason: overrides.sipReason ?? null,
    failureMessage: overrides.failureMessage ?? null,
    notes: overrides.notes ?? "",
    recordingEnabled: overrides.recordingEnabled ?? false,
    recordingUrl: overrides.recordingUrl ?? null,
    outcomeSummary: overrides.outcomeSummary ?? "",
    aiSummary: overrides.aiSummary ?? "",
    sentiment: overrides.sentiment ?? "neutral",
    suggestedNextAction: overrides.suggestedNextAction ?? "",
    followUpAt: overrides.followUpAt ?? null,
  };
}

test("mergeCallLogsForView groups close lead-and-agent calls into one visible log", () => {
  const merged = mergeCallLogsForView([
    makeCall({
      id: "call-a",
      createdAt: "2026-05-29T01:15:00.000Z",
      disposition: "Interested",
      status: "connected",
      recordingEnabled: true,
      recordingUrl: "https://example.com/recording",
      notes: "Connected call",
    }),
    makeCall({
      id: "call-b",
      createdAt: "2026-05-29T01:16:00.000Z",
      disposition: "Network Issue",
      status: "missed",
      recordingEnabled: false,
      recordingUrl: null,
      notes: "Follow-up attempt",
    }),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "call-a");
  assert.equal(merged[0].mergedCount, 2);
  assert.deepEqual(merged[0].mergedCallIds, ["call-b", "call-a"]);
  assert.equal(merged[0].recordingUrl, "https://example.com/recording");
  assert.equal(merged[0].disposition, "Interested");
});

test("mergeCallLogsForView keeps separated call clusters distinct", () => {
  const merged = mergeCallLogsForView([
    makeCall({
      id: "call-a",
      createdAt: "2026-05-29T01:00:00.000Z",
    }),
    makeCall({
      id: "call-b",
      createdAt: "2026-05-29T01:12:00.000Z",
    }),
  ]);

  assert.equal(merged.length, 2);
});
