import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveCallStatusLabel,
  canMakeCall,
  getCallAccessMessage,
  getLiveDialerStatusText,
  getPrimaryCallActionLabel,
  getSecondaryCallActionLabel,
  isCallLaunchDisabled,
} from "./callUi.ts";
import { createInitialTimeTrackingState, startWrapUp } from "./timeTracking.ts";

test("incoming ringing calls show Answer and Decline labels", () => {
  const activeCall = {
    direction: "incoming",
    status: "ringing",
    startedAt: 0,
  } as const;

  assert.equal(getPrimaryCallActionLabel(activeCall), "Answer");
  assert.equal(getSecondaryCallActionLabel(activeCall), "Decline");
});

test("connected calls show a connected status label", () => {
  assert.equal(
    getActiveCallStatusLabel({
      direction: "outgoing",
      status: "ringing",
      startedAt: 0,
      lifecycleState: "connected",
    }),
    "connected",
  );
  assert.equal(
    getActiveCallStatusLabel({
      direction: "outgoing",
      status: "connected",
      startedAt: 0,
    }),
    "connected",
  );
});

test("live dialer status text includes connected call timers", () => {
  const nowIso = "2026-05-21T09:00:45.000Z";
  const activeCall = {
    direction: "outgoing",
    status: "connected",
    lifecycleState: "connected",
    startedAt: Date.parse("2026-05-21T09:00:00.000Z"),
  } as const;

  assert.equal(
    getLiveDialerStatusText({
      activeCall,
      wrapUpLeadId: null,
      callLaunchPending: false,
      timeTracking: createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"),
      nowIso,
    }),
    "connected | 00:45",
  );
});

test("live dialer status text includes wrap-up timers", () => {
  const checkedIn = {
    ...createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"),
    status: "checked_in",
    checkedInAt: "2026-05-21T09:00:00.000Z",
    hasCheckedIn: true,
  } as const;
  const wrapped = startWrapUp(checkedIn, "2026-05-21T09:20:00.000Z");

  assert.equal(
    getLiveDialerStatusText({
      activeCall: null,
      wrapUpLeadId: "lead-123",
      callLaunchPending: false,
      timeTracking: wrapped,
      nowIso: "2026-05-21T09:20:10.000Z",
    }),
    "Wrap-up | 00:10",
  );
});

test("live dialer status text shows dialing before the call exists", () => {
  assert.equal(
    getLiveDialerStatusText({
      activeCall: null,
      wrapUpLeadId: null,
      callLaunchPending: true,
      timeTracking: createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"),
      nowIso: "2026-05-21T09:00:05.000Z",
    }),
    "Dialing...",
  );
});

test("live dialer status text falls back to null when idle", () => {
  assert.equal(
    getLiveDialerStatusText({
      activeCall: null,
      wrapUpLeadId: null,
      callLaunchPending: false,
      timeTracking: createInitialTimeTrackingState("2026-05-21T09:00:00.000Z"),
      nowIso: "2026-05-21T09:00:05.000Z",
    }),
    null,
  );
});

test("a pending call launch disables the call button before activeCall exists", () => {
  assert.equal(
    isCallLaunchDisabled({
      activeCall: null,
      wrapUpLeadId: null,
      callLaunchPending: true,
    }),
    true,
  );
});

test("agents who have not checked in are blocked with the check-in message", () => {
  const agentStatus = { status: "checked_out", hasCheckedIn: false } as const;

  assert.equal(canMakeCall(agentStatus), false);
  assert.equal(
    getCallAccessMessage(agentStatus),
    "Please check in before making calls.",
  );
});

test("agents who checked out are blocked with the checkout message", () => {
  const agentStatus = { status: "checked_out", hasCheckedIn: true } as const;

  assert.equal(canMakeCall(agentStatus), false);
  assert.equal(
    getCallAccessMessage(agentStatus),
    "You have checked out. Calls are not allowed after checkout.",
  );
});

test("agents on break are blocked with the break message", () => {
  const agentStatus = { status: "on_break", hasCheckedIn: true } as const;

  assert.equal(canMakeCall(agentStatus), false);
  assert.equal(
    getCallAccessMessage(agentStatus),
    "You are currently on break. Please end your break before making calls.",
  );
});

test("checked-in agents can make a call", () => {
  const agentStatus = { status: "checked_in", hasCheckedIn: true } as const;

  assert.equal(canMakeCall(agentStatus), true);
  assert.equal(getCallAccessMessage(agentStatus), null);
});
