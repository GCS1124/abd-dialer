import { getActiveWrapUpSeconds } from "./timeTracking.ts";
import { formatDuration } from "./utils";

import type { ActiveCall, TimeTrackingState } from "../types";

type CallLikeState =
  | Pick<ActiveCall, "direction" | "status" | "lifecycleState" | "startedAt">
  | null
  | undefined;
type CallAccessState = Pick<TimeTrackingState, "status" | "hasCheckedIn"> | null | undefined;
type CallLaunchState = {
  activeCall: CallLikeState;
  wrapUpLeadId: string | null;
  callLaunchPending: boolean;
  allowDuringWrapUp?: boolean;
};
type LiveDialerStatusCopyState = {
  activeCall: CallLikeState;
  wrapUpLeadId: string | null;
  callLaunchPending: boolean;
  timeTracking: TimeTrackingState;
  nowIso: string;
};

export function getPrimaryCallActionLabel(activeCall: CallLikeState) {
  if (!activeCall) {
    return "Call";
  }

  if (activeCall.direction === "incoming" && activeCall.status === "ringing") {
    return "Answer";
  }

  return "End call";
}

export function getSecondaryCallActionLabel(activeCall: CallLikeState) {
  if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
    return "Reject";
  }

  return null;
}

export function getActiveCallStatusLabel(activeCall: CallLikeState) {
  if (!activeCall) {
    return "";
  }

  if (activeCall.status === "connected" || activeCall.lifecycleState === "connected") {
    return "connected";
  }

  return activeCall.status.replace(/_/g, " ");
}

export function getLiveDialerStatusText({
  activeCall,
  wrapUpLeadId,
  callLaunchPending,
  timeTracking,
  nowIso,
}: LiveDialerStatusCopyState) {
  if (wrapUpLeadId) {
    return `Wrap-up | ${formatDuration(getActiveWrapUpSeconds(timeTracking, nowIso))}`;
  }

  if (activeCall) {
    const startedAt = Number.isFinite(activeCall.startedAt) ? activeCall.startedAt : null;
    const elapsedSeconds =
      startedAt === null
        ? 0
        : Math.max(1, Math.floor((Date.parse(nowIso) - startedAt) / 1000));

    return `${getActiveCallStatusLabel(activeCall)} | ${formatDuration(elapsedSeconds)}`;
  }

  if (callLaunchPending) {
    return "Dialing...";
  }

  return null;
}

export function isCallLaunchDisabled({
  activeCall,
  wrapUpLeadId,
  callLaunchPending,
  allowDuringWrapUp = false,
}: CallLaunchState) {
  return Boolean(activeCall) || callLaunchPending || (Boolean(wrapUpLeadId) && !allowDuringWrapUp);
}

export function canMakeCall(timeTracking: CallAccessState) {
  if (!timeTracking) {
    return false;
  }

  if (timeTracking.status === "on_break") {
    return false;
  }

  if (!timeTracking.hasCheckedIn) {
    return false;
  }

  if (timeTracking.status === "checked_out") {
    return false;
  }

  return timeTracking.status === "checked_in";
}

export function getCallAccessMessage(timeTracking: CallAccessState) {
  if (!timeTracking) {
    return "Please check in before making calls.";
  }

  if (timeTracking.status === "on_break") {
    return "You are currently on break. Please end your break before making calls.";
  }

  if (!timeTracking.hasCheckedIn) {
    return "Please check in before making calls.";
  }

  if (timeTracking.status === "checked_out") {
    return "You have checked out. Calls are not allowed after checkout.";
  }

  return null;
}
