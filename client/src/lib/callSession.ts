import type { ActiveCall, CallLifecycleState, CallTransportMode, CallType } from "../types";

type IncomingCallStateInput = {
  leadId: string | null;
  displayName: string;
  dialedNumber: string;
  startedAt: number;
  callId?: string | null;
};

type BaseCallState = Pick<
  ActiveCall,
  "leadId" | "dialedNumber" | "displayName" | "startedAt" | "muted" | "recordingEnabled"
> & {
  callId: string | null;
  direction: CallType;
  status: "ringing";
  transportMode: CallTransportMode;
  lifecycleState: CallLifecycleState;
};

export function createIncomingCallState(input: IncomingCallStateInput): ActiveCall {
  return {
    leadId: input.leadId,
    dialedNumber: input.dialedNumber,
    displayName: input.displayName,
    startedAt: input.startedAt,
    status: "ringing",
    muted: false,
    recordingEnabled: false,
    direction: "incoming",
    callId: input.callId ?? null,
    transportMode: "browser_softphone",
    lifecycleState: "ringing",
  };
}

export function promoteCallToConnected(call: ActiveCall): ActiveCall {
  if (call.status === "connected") {
    return call;
  }

  return {
    ...call,
    status: "connected",
    lifecycleState: "connected",
  };
}

export function createOutgoingCallState(input: {
  leadId: string | null;
  dialedNumber: string;
  displayName: string;
  startedAt: number;
  callId?: string | null;
  transportMode?: CallTransportMode;
}): ActiveCall {
  return {
    leadId: input.leadId,
    dialedNumber: input.dialedNumber,
    displayName: input.displayName,
    startedAt: input.startedAt,
    status: "ringing",
    muted: false,
    recordingEnabled: false,
    direction: "outgoing",
    callId: input.callId ?? null,
    transportMode: input.transportMode ?? "browser_softphone",
    lifecycleState: "ringing",
  };
}

export function updateCallTransportMode(
  call: ActiveCall,
  transportMode: CallTransportMode,
): ActiveCall {
  return {
    ...call,
    transportMode,
  };
}
