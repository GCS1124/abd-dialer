import type {
  CallDisposition,
  DialerMainDisposition,
  DialerQueueAction,
  DialerSubDisposition,
  LeadPriority,
  LeadStatus,
} from "../types";

type TimingKind = "callback" | "follow_up" | null;

interface DialerDispositionOption {
  key: DialerSubDisposition;
  label: string;
  disposition: CallDisposition;
  callbackPriority: LeadPriority;
  timingKind: TimingKind;
}

interface DialerDispositionGroup {
  key: DialerMainDisposition;
  label: string;
  queueAction: DialerQueueAction;
  subDispositions: readonly DialerDispositionOption[];
}

export interface ResolvedDialerDispositionSelection {
  mainDisposition: DialerMainDisposition;
  mainDispositionLabel: string;
  subDisposition: DialerSubDisposition;
  subDispositionLabel: string;
  disposition: CallDisposition;
  queueAction: DialerQueueAction;
  callbackPriority: LeadPriority;
  timingKind: TimingKind;
}

const dispositionGroups = [
  {
    key: "NOT_CONNECTED",
    label: "Not Connected",
    queueAction: "RETRY_NEXT_DAY",
    subDispositions: [
      { key: "NO_ANSWER", label: "No Answer", disposition: "No Answer", callbackPriority: "Medium", timingKind: null },
      { key: "VOICEMAIL", label: "Voicemail", disposition: "Voicemail", callbackPriority: "Medium", timingKind: null },
      { key: "BUSY", label: "Busy", disposition: "Busy", callbackPriority: "Medium", timingKind: null },
      { key: "SWITCHED_OFF", label: "Switched Off", disposition: "Switched Off", callbackPriority: "Medium", timingKind: null },
      { key: "NOT_REACHABLE", label: "Not Reachable", disposition: "Not Reachable", callbackPriority: "Medium", timingKind: null },
      { key: "CALL_FAILED", label: "Call Failed", disposition: "Call Failed", callbackPriority: "Medium", timingKind: null },
      { key: "DISCONNECTED", label: "Disconnected", disposition: "Disconnected", callbackPriority: "Medium", timingKind: null },
      { key: "NETWORK_ISSUE", label: "Network Issue", disposition: "Network Issue", callbackPriority: "Medium", timingKind: null },
    ],
  },
  {
    key: "CALLBACK",
    label: "Callback",
    queueAction: "SCHEDULE_CALLBACK",
    subDispositions: [
      { key: "CALL_BACK_LATER", label: "Call Back Later", disposition: "Call Back Later", callbackPriority: "Medium", timingKind: "callback" },
      { key: "REQUESTED_CALLBACK", label: "Requested Callback", disposition: "Call Back Later", callbackPriority: "High", timingKind: "callback" },
      { key: "FOLLOW_UP_REQUIRED", label: "Follow-Up Required", disposition: "Follow-Up Required", callbackPriority: "Medium", timingKind: "follow_up" },
    ],
  },
  {
    key: "INTERESTED",
    label: "Interested",
    queueAction: "MOVE_TO_PIPELINE",
    subDispositions: [
      { key: "INTERESTED", label: "Interested", disposition: "Interested", callbackPriority: "Medium", timingKind: null },
      { key: "MEETING_VISIT_DEMO_SCHEDULED", label: "Meeting / Visit / Demo Scheduled", disposition: "Appointment Booked", callbackPriority: "High", timingKind: "callback" },
      { key: "PROPOSAL_SHARED", label: "Proposal Shared", disposition: "Interested", callbackPriority: "High", timingKind: null },
      { key: "PENDING_DECISION", label: "Pending Decision", disposition: "Follow-Up Required", callbackPriority: "Medium", timingKind: "follow_up" },
      { key: "NEGOTIATION", label: "Negotiation", disposition: "Follow-Up Required", callbackPriority: "High", timingKind: "follow_up" },
    ],
  },
  {
    key: "NOT_INTERESTED",
    label: "Not Interested",
    queueAction: "COOLDOWN_3_DAYS",
    subDispositions: [
      { key: "PRICE_ISSUE", label: "Price Issue", disposition: "Not Interested", callbackPriority: "Low", timingKind: null },
      { key: "NO_REQUIREMENT", label: "No Requirement", disposition: "Not Interested", callbackPriority: "Low", timingKind: null },
      { key: "ALREADY_HAVE_VENDOR_SERVICE", label: "Already Have Vendor / Service", disposition: "Not Interested", callbackPriority: "Low", timingKind: null },
      { key: "NOT_INTERESTED_OTHER", label: "Other", disposition: "Not Interested", callbackPriority: "Low", timingKind: null },
    ],
  },
  {
    key: "EXISTING_CUSTOMER",
    label: "Existing Customer",
    queueAction: "REMOVE_FROM_COLD_QUEUE",
    subDispositions: [
      { key: "EXISTING_CUSTOMER", label: "Existing Customer", disposition: "Existing Customer", callbackPriority: "Low", timingKind: null },
    ],
  },
  {
    key: "INVALID_LEAD",
    label: "Invalid Lead",
    queueAction: "REMOVE_FROM_QUEUE",
    subDispositions: [
      { key: "WRONG_NUMBER", label: "Wrong Number", disposition: "Wrong Number", callbackPriority: "Low", timingKind: null },
      { key: "INVALID_NUMBER", label: "Invalid Number", disposition: "Wrong Number", callbackPriority: "Low", timingKind: null },
      { key: "DUPLICATE_LEAD", label: "Duplicate Lead", disposition: "Wrong Number", callbackPriority: "Low", timingKind: null },
    ],
  },
  {
    key: "DO_NOT_CALL",
    label: "Do Not Call",
    queueAction: "PERMANENTLY_EXCLUDE",
    subDispositions: [
      { key: "DNC_REQUESTED", label: "DNC Requested", disposition: "DNC", callbackPriority: "Low", timingKind: null },
      { key: "DO_NOT_CALL", label: "Do Not Call", disposition: "DNC", callbackPriority: "Low", timingKind: null },
      { key: "OPTED_OUT", label: "Opted Out", disposition: "DNC", callbackPriority: "Low", timingKind: null },
    ],
  },
  {
    key: "CLOSED",
    label: "Closed",
    queueAction: "REMOVE_FROM_ACTIVE_QUEUE",
    subDispositions: [
      { key: "WON", label: "Won", disposition: "Sale Closed", callbackPriority: "Low", timingKind: null },
      { key: "LOST", label: "Lost", disposition: "Sale Closed", callbackPriority: "Low", timingKind: null },
    ],
  },
] as const satisfies readonly DialerDispositionGroup[];

const groupByKey = new Map(dispositionGroups.map((group) => [group.key, group] as const));
const legacyToSelection = new Map<CallDisposition, { group: DialerMainDisposition; sub: DialerSubDisposition }>([
  ["No Answer", { group: "NOT_CONNECTED", sub: "NO_ANSWER" }],
  ["Voicemail", { group: "NOT_CONNECTED", sub: "VOICEMAIL" }],
  ["Busy", { group: "NOT_CONNECTED", sub: "BUSY" }],
  ["Switched Off", { group: "NOT_CONNECTED", sub: "SWITCHED_OFF" }],
  ["Not Reachable", { group: "NOT_CONNECTED", sub: "NOT_REACHABLE" }],
  ["Call Failed", { group: "NOT_CONNECTED", sub: "CALL_FAILED" }],
  ["Disconnected", { group: "NOT_CONNECTED", sub: "DISCONNECTED" }],
  ["Network Issue", { group: "NOT_CONNECTED", sub: "NETWORK_ISSUE" }],
  ["Call Back Later", { group: "CALLBACK", sub: "CALL_BACK_LATER" }],
  ["Follow-Up Required", { group: "CALLBACK", sub: "FOLLOW_UP_REQUIRED" }],
  ["Interested", { group: "INTERESTED", sub: "INTERESTED" }],
  ["Appointment Booked", { group: "INTERESTED", sub: "MEETING_VISIT_DEMO_SCHEDULED" }],
  ["Not Interested", { group: "NOT_INTERESTED", sub: "NOT_INTERESTED_OTHER" }],
  ["Existing Customer", { group: "EXISTING_CUSTOMER", sub: "EXISTING_CUSTOMER" }],
  ["Wrong Number", { group: "INVALID_LEAD", sub: "WRONG_NUMBER" }],
  ["DNC", { group: "DO_NOT_CALL", sub: "DO_NOT_CALL" }],
  ["Sale Closed", { group: "CLOSED", sub: "WON" }],
  ["Failed Attempt", { group: "NOT_CONNECTED", sub: "CALL_FAILED" }],
  ["Not available", { group: "NOT_CONNECTED", sub: "NOT_REACHABLE" }],
  ["Rpc hung", { group: "NOT_CONNECTED", sub: "DISCONNECTED" }],
  ["3rd party hung up", { group: "NOT_CONNECTED", sub: "DISCONNECTED" }],
  ["Already have team", { group: "NOT_INTERESTED", sub: "ALREADY_HAVE_VENDOR_SERVICE" }],
  ["Already have yelp account", { group: "NOT_INTERESTED", sub: "ALREADY_HAVE_VENDOR_SERVICE" }],
]);

export function getDispositionGroups() {
  return dispositionGroups;
}

export function getDispositionGroup(key: DialerMainDisposition | null | undefined) {
  return (key ? groupByKey.get(key) : null) ?? null;
}

export function getDispositionSubDisposition(
  mainDisposition: DialerMainDisposition | null | undefined,
  subDisposition: DialerSubDisposition | null | undefined,
) {
  const group = getDispositionGroup(mainDisposition);
  if (!group) {
    return null;
  }

  return group.subDispositions.find((item) => item.key === subDisposition) ?? null;
}

export function getDispositionQueueActionLabel(queueAction: DialerQueueAction) {
  const labels: Record<DialerQueueAction, string> = {
    RETRY_NEXT_DAY: "Retry next day",
    SCHEDULE_CALLBACK: "Schedule callback",
    MOVE_TO_PIPELINE: "Move to pipeline",
    COOLDOWN_3_DAYS: "Cooldown 3 days",
    REMOVE_FROM_COLD_QUEUE: "Remove from cold queue",
    REMOVE_FROM_QUEUE: "Remove from queue",
    PERMANENTLY_EXCLUDE: "Permanently exclude",
    REMOVE_FROM_ACTIVE_QUEUE: "Remove from active queue",
  };

  return labels[queueAction];
}

export function resolveDispositionSelection(input: {
  mainDisposition?: DialerMainDisposition | null;
  subDisposition?: DialerSubDisposition | null;
  disposition?: CallDisposition | null;
}): ResolvedDialerDispositionSelection {
  const legacySelection = input.disposition ? legacyToSelection.get(input.disposition) ?? null : null;
  const mainDisposition = input.mainDisposition ?? legacySelection?.group ?? "NOT_CONNECTED";
  const group = getDispositionGroup(mainDisposition) ?? dispositionGroups[0];
  const subDisposition =
    getDispositionSubDisposition(mainDisposition, input.subDisposition) ??
    group.subDispositions.find((item) => item.key === legacySelection?.sub) ??
    group.subDispositions[0];

  return {
    mainDisposition: group.key,
    mainDispositionLabel: group.label,
    subDisposition: subDisposition.key,
    subDispositionLabel: subDisposition.label,
    disposition: subDisposition.disposition,
    queueAction: group.queueAction,
    callbackPriority: subDisposition.callbackPriority,
    timingKind: subDisposition.timingKind,
  };
}

export function getDispositionLeadStatus(selection: ResolvedDialerDispositionSelection): LeadStatus {
  switch (selection.mainDisposition) {
    case "NOT_CONNECTED":
      return "contacted";
    case "CALLBACK":
      return selection.subDisposition === "FOLLOW_UP_REQUIRED"
        ? "follow_up"
        : selection.subDisposition === "MEETING_VISIT_DEMO_SCHEDULED"
          ? "appointment_booked"
          : "callback_due";
    case "INTERESTED":
      return selection.subDisposition === "MEETING_VISIT_DEMO_SCHEDULED"
        ? "appointment_booked"
        : selection.subDisposition === "PENDING_DECISION" || selection.subDisposition === "NEGOTIATION"
          ? "follow_up"
          : "qualified";
    case "NOT_INTERESTED":
      return "closed_lost";
    case "EXISTING_CUSTOMER":
      return "closed_won";
    case "INVALID_LEAD":
    case "DO_NOT_CALL":
      return "invalid";
    case "CLOSED":
      return selection.subDisposition === "LOST" ? "closed_lost" : "closed_won";
    default:
      return "contacted";
  }
}
