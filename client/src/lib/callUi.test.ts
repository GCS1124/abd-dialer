import assert from "node:assert/strict";
import test from "node:test";

import {
  getActiveCallStatusLabel,
  canMakeCall,
  getCallAccessMessage,
  getPrimaryCallActionLabel,
  getSecondaryCallActionLabel,
  isCallLaunchDisabled,
} from "./callUi.ts";

test("incoming ringing calls show Answer and Reject labels", () => {
  const activeCall = {
    direction: "incoming",
    status: "ringing",
  } as const;

  assert.equal(getPrimaryCallActionLabel(activeCall), "Answer");
  assert.equal(getSecondaryCallActionLabel(activeCall), "Reject");
});

test("connected calls show a connected status label", () => {
  assert.equal(
    getActiveCallStatusLabel({
      direction: "outgoing",
      status: "ringing",
      lifecycleState: "connected",
    }),
    "connected",
  );
  assert.equal(
    getActiveCallStatusLabel({
      direction: "outgoing",
      status: "connected",
    }),
    "connected",
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
