import type { ActiveCall } from "../types";

type CallLikeState = Pick<ActiveCall, "direction" | "status"> | null | undefined;

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
