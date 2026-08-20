import type {
  CallDisposition,
  DialerMainDisposition,
  DialerQueueAction,
  DialerSubDisposition,
  LeadPriority,
  LeadStatus,
} from "../types";

export type TimingKind = "callback" | "follow_up" | null;

export interface DialerMainDispositionOption {
  key: DialerMainDisposition;
  label: string;
}

export interface DialerDispositionOption {
  key: DialerSubDisposition;
  label: string;
  disposition: CallDisposition;
  queueAction: DialerQueueAction;
  callbackPriority: LeadPriority;
  timingKind: TimingKind;
  connected: boolean;
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
  connected: boolean;
}

const mainDispositionOptions = [
  { key: "ANSWER_MACHINE", label: "Answer Machine" },
  { key: "HUNG_UP", label: "Hung Up" },
  { key: "CALL_LATER", label: "Call Later" },
  { key: "DECISION_MAKER", label: "Decision Maker" },
  { key: "NON_DECISION_MAKER", label: "Non Decision Maker" },
] as const satisfies readonly DialerMainDispositionOption[];

const mainDispositionLabels: Record<DialerMainDisposition, string> = {
  ANSWER_MACHINE: "Answer Machine",
  HUNG_UP: "Hung Up",
  CALL_LATER: "Call Later",
  DECISION_MAKER: "Decision Maker",
  NON_DECISION_MAKER: "Non Decision Maker",
  NOT_CONNECTED: "Not Connected",
  CALLBACK: "Callback",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  EXISTING_CUSTOMER: "Existing Customer",
  INVALID_LEAD: "Invalid Lead",
  DO_NOT_CALL: "Do Not Call",
  CLOSED: "Closed",
};

const dispositionOptions = [
  { key: "NO_ANSWER", label: "No Answer", disposition: "No Answer", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "VOICEMAIL", label: "Left Voicemail", disposition: "Voicemail", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "BUSY", label: "Busy", disposition: "Busy", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "SWITCHED_OFF", label: "Switched Off", disposition: "Switched Off", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "NOT_REACHABLE", label: "Not Reachable", disposition: "Not Reachable", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "CALL_FAILED", label: "Call Failed", disposition: "Call Failed", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "DISCONNECTED", label: "Disconnected", disposition: "Disconnected", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "HUNG_UP", label: "Hung up", disposition: "3rd party hung up", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "NETWORK_ISSUE", label: "Network Issue", disposition: "Network Issue", queueAction: "RETRY_NEXT_DAY", callbackPriority: "Medium", timingKind: null, connected: false },
  { key: "CALL_BACK_LATER", label: "Call Back Later", disposition: "Call Back Later", queueAction: "SCHEDULE_CALLBACK", callbackPriority: "Medium", timingKind: "callback", connected: true },
  { key: "REQUESTED_CALLBACK", label: "Callback Requested", disposition: "Call Back Later", queueAction: "SCHEDULE_CALLBACK", callbackPriority: "High", timingKind: "callback", connected: true },
  { key: "GATEKEEPER_REACHED", label: "Gatekeeper Reached", disposition: "Call Back Later", queueAction: "SCHEDULE_CALLBACK", callbackPriority: "Medium", timingKind: "callback", connected: true },
  { key: "FOLLOW_UP_REQUIRED", label: "Follow-Up Required", disposition: "Follow-Up Required", queueAction: "SCHEDULE_CALLBACK", callbackPriority: "Medium", timingKind: "follow_up", connected: true },
  { key: "INTERESTED", label: "Interested", disposition: "Interested", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "Medium", timingKind: null, connected: true },
  { key: "MEETING_VISIT_DEMO_SCHEDULED", label: "Meeting Scheduled / Calendar", disposition: "Appointment Booked", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: "callback", connected: true },
  { key: "PROPOSAL_SHARED", label: "Proposal Sent", disposition: "Interested", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: null, connected: true },
  { key: "REPORT_SENT", label: "Report Sent", disposition: "Interested", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: null, connected: true },
  { key: "ESTIMATE_SENT", label: "Estimate Sent", disposition: "Interested", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: null, connected: true },
  { key: "CREATE_A_PLAN", label: "Create a Plan", disposition: "Follow-Up Required", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: null, connected: true },
  { key: "PENDING_DECISION", label: "Pending Decision", disposition: "Follow-Up Required", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "Medium", timingKind: "follow_up", connected: true },
  { key: "NEGOTIATION", label: "Negotiation", disposition: "Follow-Up Required", queueAction: "MOVE_TO_PIPELINE", callbackPriority: "High", timingKind: "follow_up", connected: true },
  { key: "PRICE_ISSUE", label: "Price Issue", disposition: "Not Interested", queueAction: "COOLDOWN_3_DAYS", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "NO_REQUIREMENT", label: "No Requirement", disposition: "Not Interested", queueAction: "COOLDOWN_3_DAYS", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "ALREADY_HAVE_VENDOR_SERVICE", label: "Already Have Vendor / Service", disposition: "Not Interested", queueAction: "COOLDOWN_3_DAYS", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "NOT_INTERESTED_OTHER", label: "Not Interested", disposition: "Not Interested", queueAction: "COOLDOWN_3_DAYS", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "EXISTING_CUSTOMER", label: "Existing Customer", disposition: "Existing Customer", queueAction: "REMOVE_FROM_COLD_QUEUE", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "WRONG_NUMBER", label: "Bad/Wrong Number", disposition: "Wrong Number", queueAction: "REMOVE_FROM_QUEUE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "INVALID_NUMBER", label: "Invalid Number", disposition: "Wrong Number", queueAction: "REMOVE_FROM_QUEUE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "DUPLICATE_LEAD", label: "Duplicate Lead", disposition: "Wrong Number", queueAction: "REMOVE_FROM_QUEUE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "DNC_REQUESTED", label: "DNC Requested", disposition: "DNC", queueAction: "PERMANENTLY_EXCLUDE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "DO_NOT_CALL", label: "Do Not Contact (DNC)", disposition: "DNC", queueAction: "PERMANENTLY_EXCLUDE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "OPTED_OUT", label: "Opted Out", disposition: "DNC", queueAction: "PERMANENTLY_EXCLUDE", callbackPriority: "Low", timingKind: null, connected: false },
  { key: "WON", label: "Won", disposition: "Sale Closed", queueAction: "REMOVE_FROM_ACTIVE_QUEUE", callbackPriority: "Low", timingKind: null, connected: true },
  { key: "LOST", label: "Lost", disposition: "Sale Closed", queueAction: "REMOVE_FROM_ACTIVE_QUEUE", callbackPriority: "Low", timingKind: null, connected: true },
] as const satisfies readonly DialerDispositionOption[];

const optionByKey = new Map(dispositionOptions.map((option) => [option.key, option] as const));

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
  ["Meeting Scheduled / Calendar", { group: "INTERESTED", sub: "MEETING_VISIT_DEMO_SCHEDULED" }],
  ["Proposal Sent", { group: "INTERESTED", sub: "PROPOSAL_SHARED" }],
  ["Report Sent", { group: "INTERESTED", sub: "REPORT_SENT" }],
  ["Estimate Sent", { group: "INTERESTED", sub: "ESTIMATE_SENT" }],
  ["Create a Plan", { group: "INTERESTED", sub: "CREATE_A_PLAN" }],
  ["Not Interested", { group: "NOT_INTERESTED", sub: "NOT_INTERESTED_OTHER" }],
  ["Existing Customer", { group: "EXISTING_CUSTOMER", sub: "EXISTING_CUSTOMER" }],
  ["Wrong Number", { group: "INVALID_LEAD", sub: "WRONG_NUMBER" }],
  ["DNC", { group: "DO_NOT_CALL", sub: "DO_NOT_CALL" }],
  ["Sale Closed", { group: "CLOSED", sub: "WON" }],
  ["Failed Attempt", { group: "NOT_CONNECTED", sub: "CALL_FAILED" }],
  ["Not available", { group: "NOT_CONNECTED", sub: "NOT_REACHABLE" }],
  ["Rpc hung", { group: "NOT_CONNECTED", sub: "DISCONNECTED" }],
  ["3rd party hung up", { group: "NOT_CONNECTED", sub: "HUNG_UP" }],
  ["Already have team", { group: "NOT_INTERESTED", sub: "ALREADY_HAVE_VENDOR_SERVICE" }],
  ["Already have yelp account", { group: "NOT_INTERESTED", sub: "ALREADY_HAVE_VENDOR_SERVICE" }],
]);

export function getMainDispositionOptions() {
  return mainDispositionOptions;
}

export function getDispositionOptions() {
  return dispositionOptions;
}

export function getMainDispositionLabel(key: DialerMainDisposition | null | undefined) {
  return key ? mainDispositionLabels[key] ?? key : "";
}

export function getDispositionOption(key: DialerSubDisposition | null | undefined) {
  return key ? optionByKey.get(key) ?? null : null;
}

/**
 * Kept as a compatibility helper for callers that still pass a main value.
 * Main disposition is intentionally not used to resolve the sub-disposition.
 */
export function getDispositionSubDisposition(
  _mainDisposition: DialerMainDisposition | null | undefined,
  subDisposition: DialerSubDisposition | null | undefined,
) {
  return getDispositionOption(subDisposition);
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
  const mainDisposition = input.mainDisposition ?? legacySelection?.group ?? "NON_DECISION_MAKER";
  const subDisposition =
    getDispositionOption(input.subDisposition) ??
    getDispositionOption(legacySelection?.sub) ??
    dispositionOptions[0];
  const disposition = input.disposition?.trim() || subDisposition.disposition;

  return {
    mainDisposition,
    mainDispositionLabel: getMainDispositionLabel(mainDisposition),
    subDisposition: subDisposition.key,
    subDispositionLabel: subDisposition.label,
    disposition,
    queueAction: subDisposition.queueAction,
    callbackPriority: subDisposition.callbackPriority,
    timingKind: subDisposition.timingKind,
    connected: subDisposition.connected,
  };
}

export function isDispositionConnected(selection: ResolvedDialerDispositionSelection) {
  return selection.connected;
}

export function getDispositionLeadStatus(selection: ResolvedDialerDispositionSelection): LeadStatus {
  switch (selection.subDisposition) {
    case "CALL_BACK_LATER":
    case "REQUESTED_CALLBACK":
    case "GATEKEEPER_REACHED":
      return "callback_due";
    case "FOLLOW_UP_REQUIRED":
    case "CREATE_A_PLAN":
    case "PENDING_DECISION":
    case "NEGOTIATION":
      return "follow_up";
    case "MEETING_VISIT_DEMO_SCHEDULED":
      return "appointment_booked";
    case "INTERESTED":
    case "PROPOSAL_SHARED":
    case "REPORT_SENT":
    case "ESTIMATE_SENT":
      return "qualified";
    case "PRICE_ISSUE":
    case "NO_REQUIREMENT":
    case "ALREADY_HAVE_VENDOR_SERVICE":
    case "NOT_INTERESTED_OTHER":
    case "LOST":
      return "closed_lost";
    case "EXISTING_CUSTOMER":
    case "WON":
      return "closed_won";
    case "WRONG_NUMBER":
    case "INVALID_NUMBER":
    case "DUPLICATE_LEAD":
    case "DNC_REQUESTED":
    case "DO_NOT_CALL":
    case "OPTED_OUT":
      return "invalid";
    default:
      return "contacted";
  }
}
