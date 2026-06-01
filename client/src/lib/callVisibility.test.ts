import assert from "node:assert/strict";
import test from "node:test";

import { canViewCallRecordings, getVisibleCallLogsForUser } from "./callVisibility.ts";
import type { CallLog } from "../types";

function buildCallLog(overrides: Partial<CallLog>): CallLog {
  return {
    id: "call-1",
    leadId: "lead-1",
    leadName: "Lead One",
    phone: "+15555550100",
    createdAt: "2026-05-26T12:00:00.000Z",
    agentId: "agent-1",
    agentName: "Agent One",
    callType: "outgoing",
    durationSeconds: 120,
    disposition: "Interested",
    status: "connected",
    notes: "",
    recordingEnabled: false,
    outcomeSummary: "",
    aiSummary: "",
    sentiment: "neutral",
    suggestedNextAction: "",
    followUpAt: null,
    ...overrides,
  };
}

test("agent users only see their own calls and cannot view recordings", () => {
  const calls = [
    buildCallLog({ id: "call-1", agentId: "agent-1" }),
    buildCallLog({ id: "call-2", agentId: "agent-2" }),
  ];

  const visible = getVisibleCallLogsForUser(calls, { id: "agent-1", role: "agent" });

  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.id, "call-1");
  assert.equal(canViewCallRecordings({ role: "agent" }), false);
  assert.equal(canViewCallRecordings({ role: "team_leader" }), true);
});
