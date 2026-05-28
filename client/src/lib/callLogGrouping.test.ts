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

test("mergeCallLogsForView prefers outgoing metadata and incoming recording data", () => {
  const merged = mergeCallLogsForView([
    makeCall({
      id: "incoming-recording",
      createdAt: "2026-05-29T01:16:00.000Z",
      callType: "incoming",
      durationSeconds: 1,
      disposition: "Interested",
      status: "connected",
      notes: "Auto-logged from RingCentral session s-123.",
      outcomeSummary: "Incoming call summary",
      aiSummary: "Incoming AI summary",
      suggestedNextAction: "Incoming next action",
      followUpAt: "2026-05-29T02:00:00.000Z",
      recordingEnabled: true,
      recordingUrl: "https://example.com/recording",
    }),
    makeCall({
      id: "outgoing-metadata",
      createdAt: "2026-05-29T01:15:00.000Z",
      callType: "outgoing",
      durationSeconds: 62,
      disposition: "Call Back Later",
      status: "follow_up",
      notes: "Outgoing call note",
      outcomeSummary: "Outgoing call summary",
      aiSummary: "Outgoing AI summary",
      suggestedNextAction: "Outgoing next action",
      followUpAt: "2026-05-29T03:00:00.000Z",
    }),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "outgoing-metadata");
  assert.equal(merged[0].durationSeconds, 62);
  assert.equal(merged[0].disposition, "Call Back Later");
  assert.equal(merged[0].status, "follow_up");
  assert.equal(merged[0].notes, "Outgoing call note");
  assert.equal(merged[0].outcomeSummary, "Outgoing call summary");
  assert.equal(merged[0].aiSummary, "Outgoing AI summary");
  assert.equal(merged[0].suggestedNextAction, "Outgoing next action");
  assert.equal(merged[0].followUpAt, "2026-05-29T03:00:00.000Z");
  assert.equal(merged[0].recordingUrl, "https://example.com/recording");
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
