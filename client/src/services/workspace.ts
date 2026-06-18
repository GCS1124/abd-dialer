import { supabase, hasSupabaseBrowserConfig, assertSupabaseConfigured } from "../lib/supabase";
import { isMissingSupabaseTableError } from "../lib/supabaseErrors";
import { buildWorkspaceAnalytics } from "../lib/analytics";
import { filterLeadsForDialerCampaign } from "../lib/dialerCampaigns";
import { EXHAUSTED_QUEUE_PHONE_INDEX } from "../lib/dialerQueue";
import {
  getDispositionLeadStatus,
  resolveDispositionSelection,
} from "../lib/dialerDisposition";
import { buildRingCentralCallLogId } from "../lib/ringcentralCallLogId";
import { getLeadCompanyName } from "../lib/leadIdentity";
import { getInitials } from "../lib/utils";
import { loadRingCentralBrowserVoiceSession as loadRingCentralBrowserVoiceSessionAction } from "./ringcentral";
import type {
  CallAttemptFailureStage,
  CallDisposition,
  CallLog,
  CallLogFormInput,
  CallLogStatus,
  CallType,
  Campaign,
  CampaignCreateInput,
  CampaignUpdateInput,
  Lead,
  LeadImportRecord,
  LeadUploadCampaignInput,
  LeadPriority,
  LeadStatus,
  LeadUpdateInput,
  SipProfile,
  User,
  CreateSipProfileInput,
  QueueCursor,
  QueueFilter,
  QueueItem,
  QueueProgressRecord,
  QueueSort,
  QueueState,
  SaveDispositionInput,
  TimecardSnapshot,
  UpdateSipProfileInput,
  UploadResult,
  VoiceProviderConfig,
  WorkspacePayload,
  WorkspaceSettingsStatus,
  DialerMainDisposition,
  DialerSubDisposition,
} from "../types";

interface VoiceSessionResponse extends VoiceProviderConfig {
  sipUri?: string | null;
  authorizationId?: string | null;
  authorizationUsername?: string | null;
  authorizationPassword?: string | null;
  dialPrefix?: string | null;
  displayName?: string | null;
  message?: string | null;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
}

type ApiCallAttemptFailureStage = CallAttemptFailureStage;
type ApiCallDisposition = CallDisposition;
type ApiCallLog = CallLog;
type ApiCallLogStatus = CallLogStatus;
type ApiCallType = CallType;
type ApiLead = Lead;
type ApiLeadImportRecord = LeadImportRecord;
type ApiLeadPriority = LeadPriority;
type ApiLeadStatus = LeadStatus;
type ApiSipProfile = SipProfile;
type ApiUser = User;
type CreateCallLogInput = CallLogFormInput;
type SignupInput = {
  name: string;
  email: string;
  password: string;
  team: string;
  timezone: string;
  title: string;
};

interface SaveFailedCallAttemptInput {
  leadId: string;
  dialedNumber: string;
  failureStage: ApiCallAttemptFailureStage;
  sipStatus?: number | null;
  sipReason?: string | null;
  failureMessage?: string | null;
  startedAt: string;
  endedAt?: string | null;
}

interface StoredSipProfile extends ApiSipProfile {
  sipPassword: string;
}

interface DbUserRow {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: ApiUser["role"];
  team_name: string;
  title: string | null;
  timezone: string;
  status: User["status"];
  must_reset_password: boolean;
}

interface DbLeadRow {
  id: string;
  external_id: string | null;
  full_name: string;
  phone: string;
  alt_phone: string | null;
  phone_numbers: string[] | null;
  email: string | null;
  company: string | null;
  job_title: string | null;
  location: string | null;
  source: string | null;
  interest: string | null;
  status: ApiLeadStatus;
  notes: string | null;
  last_contacted: string | null;
  last_disposition: ApiCallDisposition | null;
  last_disposition_main: DialerMainDisposition | null;
  last_disposition_sub: DialerSubDisposition | null;
  last_attempted_at: string | null;
  last_contacted_at: string | null;
  contact_attempt_count: number | null;
  connected_attempt_count: number | null;
  next_eligible_at: string | null;
  next_callback_at: string | null;
  next_follow_up_at: string | null;
  callback_priority: ApiLeadPriority | null;
  not_interested_reason: string | null;
  is_dnc: boolean | null;
  is_invalid_number: boolean | null;
  assigned_agent: string | null;
  callback_time: string | null;
  priority: ApiLeadPriority;
  lead_score: number;
  created_at: string;
  updated_at: string;
}

interface DbLeadTagRow {
  id: string;
  lead_id: string;
  label: string;
}

interface DbLeadNoteRow {
  id: string;
  lead_id: string;
  author_id: string | null;
  note_body: string;
  created_at: string;
}

interface DbCallLogRow {
  id: string;
  lead_id: string;
  agent_id: string | null;
  direction: ApiCallType;
  disposition: ApiCallDisposition;
  duration_seconds: number;
  call_status: ApiCallLogStatus;
  recording_enabled: boolean;
  recording_url: string | null;
  outcome_summary: string | null;
  notes: string | null;
  main_disposition: DialerMainDisposition | null;
  sub_disposition: DialerSubDisposition | null;
  wrap_up_started_at: string | null;
  wrap_up_ended_at: string | null;
  wrap_up_duration_seconds: number | null;
  callback_at: string | null;
  callback_priority: ApiLeadPriority | null;
  follow_up_at: string | null;
  not_interested_reason: string | null;
  created_at: string;
}

interface DbEmployeeTimecardRow {
  user_id: string;
  work_date: string;
  timezone: string;
  time_on_system_seconds: number;
  break_seconds: number;
  wrap_seconds: number;
  login_hours_seconds: number;
  created_at: string;
  updated_at: string;
}

interface DbActivityRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  activity_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface DbCallbackRow {
  id: string;
  lead_id: string;
  owner_id: string | null;
  scheduled_for: string;
  priority: ApiLeadPriority;
  status: "scheduled" | "completed" | "overdue" | "cancelled";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbCampaignRow {
  id: string;
  name: string;
  source_key: string;
  assigned_user_id: string | null;
  is_active: boolean;
  allow_auto_dial: boolean;
  created_at: string;
  updated_at: string;
}

interface DbQueueProgressRow {
  user_id: string;
  queue_key: string;
  queue_scope: string;
  queue_sort: QueueSort;
  queue_filter: QueueFilter;
  current_lead_id: string | null;
  current_phone_index: number;
  created_at: string;
  updated_at: string;
}

interface DbSipProfileRow {
  id: string;
  label: string;
  provider_url: string;
  sip_domain: string;
  sip_username: string;
  sip_password: string;
  caller_id: string;
  owner_user_id: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface DbUserSipPreferenceRow {
  user_id: string;
  active_sip_profile_id: string | null;
}

interface FailedAttemptDiagnostic {
  dialedNumber: string;
  failureStage: ApiCallAttemptFailureStage;
  sipStatus: number | null;
  sipReason: string | null;
  failureMessage: string | null;
  startedAt: string;
  endedAt: string;
}

const diagnosticPrefix = "CALL_ATTEMPT_DIAGNOSTIC:";
const missedDispositions = new Set([
  "No Answer",
  "Busy",
  "Voicemail",
  "Call Failed",
  "Switched Off",
  "Not Reachable",
  "Disconnected",
  "Network Issue",
  "Wrong Number",
  "Failed Attempt",
  "Not available",
  "Rpc hung",
  "3rd party hung up",
]);
const rejectedDispositions = new Set(["Already have team", "Already have yelp account"]);
const openStatuses = new Set<ApiLeadStatus>([
  "new",
  "contacted",
  "callback_due",
  "follow_up",
  "qualified",
  "appointment_booked",
  "closed_lost",
]);

function requireSupabaseClient() {
  assertSupabaseConfigured();
  if (!supabase) {
    throw new Error("Supabase browser client is not configured.");
  }

  return supabase;
}

const ringCentralVoiceSessionCache = new Map<string, VoiceProviderConfig>();

function getCachedRingCentralBrowserVoiceSession(userId: string) {
  return ringCentralVoiceSessionCache.get(userId) ?? null;
}

function cacheRingCentralBrowserVoiceSession(userId: string, voice: VoiceProviderConfig) {
  if (voice.available) {
    ringCentralVoiceSessionCache.set(userId, voice);
  }
}

export function clearRingCentralBrowserVoiceSessionCache(userId?: string | null) {
  if (typeof userId === "string" && userId.trim()) {
    ringCentralVoiceSessionCache.delete(userId);
    return;
  }

  ringCentralVoiceSessionCache.clear();
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanString(value: string | null | undefined, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeIso(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function normalizeStage(value: unknown): ApiCallAttemptFailureStage {
  if (
    value === "session_unavailable" ||
    value === "session_start" ||
    value === "invite" ||
    value === "microphone" ||
    value === "server_disconnect" ||
    value === "sip_reject" ||
    value === "hangup_before_connect" ||
    value === "unknown"
  ) {
    return value;
  }

  return "unknown";
}

function isFailedAttemptDescription(description: string | null | undefined) {
  return Boolean(description?.startsWith(diagnosticPrefix));
}

function buildFailedAttemptDescription(input: SaveFailedCallAttemptInput) {
  const now = new Date().toISOString();
  const payload: FailedAttemptDiagnostic = {
    dialedNumber: cleanString(input.dialedNumber),
    failureStage: normalizeStage(input.failureStage),
    sipStatus: typeof input.sipStatus === "number" ? input.sipStatus : null,
    sipReason: cleanString(input.sipReason, "") || null,
    failureMessage: cleanString(input.failureMessage, "") || null,
    startedAt: safeIso(input.startedAt, now),
    endedAt: safeIso(input.endedAt, now),
  };

  return `${diagnosticPrefix}${JSON.stringify(payload)}`;
}

function parseFailedAttemptDescription(description: string | null | undefined): FailedAttemptDiagnostic | null {
  if (!description?.startsWith(diagnosticPrefix)) {
    return null;
  }

  try {
    const value = JSON.parse(description.slice(diagnosticPrefix.length)) as Partial<FailedAttemptDiagnostic>;
    const now = new Date().toISOString();

    return {
      dialedNumber: cleanString(value.dialedNumber),
      failureStage: normalizeStage(value.failureStage),
      sipStatus: typeof value.sipStatus === "number" ? value.sipStatus : null,
      sipReason: cleanString(value.sipReason, "") || null,
      failureMessage: cleanString(value.failureMessage, "") || null,
      startedAt: safeIso(value.startedAt, now),
      endedAt: safeIso(value.endedAt, now),
    };
  } catch {
    return null;
  }
}

function formatFailedAttemptSummary(diagnostic: FailedAttemptDiagnostic) {
  const failureStageLabels: Record<ApiCallAttemptFailureStage, string> = {
    session_unavailable: "Dial unavailable",
    session_start: "Dial start",
    invite: "Dial launch failed",
    microphone: "Launch blocked",
    server_disconnect: "Launch canceled",
    sip_reject: "Dial rejected",
    hangup_before_connect: "Ended before connect",
    unknown: "Unknown failure",
  };

  const stage = failureStageLabels[diagnostic.failureStage];
  const transportSummary = diagnostic.sipStatus
    ? ` Status ${diagnostic.sipStatus}${diagnostic.sipReason ? ` ${diagnostic.sipReason}` : ""}.`
    : "";
  const message = diagnostic.failureMessage ? ` ${diagnostic.failureMessage}` : "";

  return `${stage} before connect for ${diagnostic.dialedNumber || "unknown number"}.${transportSummary}${message}`.trim();
}

function buildFailedAttemptCallLog(input: {
  id: string;
  leadId: string;
  leadName: string;
  primaryPhone: string;
  createdAt: string;
  actor: User | null;
  diagnostic: FailedAttemptDiagnostic;
}): ApiCallLog {
  const durationSeconds = Math.max(
    0,
    Math.floor(
      (new Date(input.diagnostic.endedAt).getTime() - new Date(input.diagnostic.startedAt).getTime()) /
        1000,
    ),
  );
  const summary = formatFailedAttemptSummary(input.diagnostic);

  return {
    id: input.id,
    leadId: input.leadId,
    leadName: input.leadName,
    phone: input.diagnostic.dialedNumber || input.primaryPhone,
    createdAt: input.createdAt,
    agentId: input.actor?.id ?? "",
    agentName: input.actor?.name ?? "System",
    callType: "outgoing",
    durationSeconds,
    disposition: "Failed Attempt",
    status: "failed",
    source: "failed_attempt",
    failureStage: input.diagnostic.failureStage,
    sipStatus: input.diagnostic.sipStatus,
    sipReason: input.diagnostic.sipReason,
    failureMessage: input.diagnostic.failureMessage,
    notes: input.diagnostic.failureMessage ?? "",
    recordingEnabled: false,
    recordingUrl: null,
    outcomeSummary: summary,
    aiSummary: summary,
    sentiment: "neutral",
    suggestedNextAction: "Review the launch details, retry, or continue with the manual dialer.",
    followUpAt: null,
  };
}

function firstUsefulLine(value: string) {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .find(Boolean) ?? ""
  );
}

function detectSentiment(text: string, status: ApiCallLogStatus) {
  const content = text.toLowerCase();

  if (status === "missed" || status === "failed") {
    return "neutral" as const;
  }

  const positiveSignals = [
    "interested",
    "booked",
    "qualified",
    "proposal",
    "pricing",
    "demo",
    "yes",
    "approved",
    "happy",
    "good",
  ];
  const negativeSignals = [
    "not interested",
    "wrong number",
    "angry",
    "bad",
    "declined",
    "cancel",
    "spam",
    "busy",
    "no answer",
    "voicemail",
    "later",
  ];

  const positiveCount = positiveSignals.filter((signal) => content.includes(signal)).length;
  const negativeCount = negativeSignals.filter((signal) => content.includes(signal)).length;

  if (positiveCount > negativeCount) {
    return "positive" as const;
  }

  if (negativeCount > positiveCount) {
    return "negative" as const;
  }

  return "neutral" as const;
}

function buildSuggestedNextAction(
  status: ApiCallLogStatus,
  sentiment: "positive" | "neutral" | "negative",
  callbackAt?: string | null,
) {
  if (status === "follow_up" && callbackAt) {
    return "Reschedule the next touch and keep the lead in the active follow-up queue.";
  }
  if (status === "missed") {
    return "Retry later and leave a note only if you learned something useful.";
  }
  if (status === "failed") {
    return "Review the dial launch, retry the call, or continue manually.";
  }
  if (sentiment === "positive") {
    return "Move the lead forward with a concrete next step or booking.";
  }
  if (sentiment === "negative") {
    return "Review objections, decide whether to nurture later, or close out the lead.";
  }
  return "Capture the context clearly and decide whether a follow-up is needed.";
}

function buildSummary(text: string, status: ApiCallLogStatus, disposition?: ApiCallDisposition) {
  const firstLine = firstUsefulLine(text);
  if (firstLine) {
    return firstLine.slice(0, 160);
  }

  if (disposition) {
    return `${disposition} logged from the call workflow.`;
  }

  if (status === "follow_up") {
    return "Callback required after this call.";
  }
  if (status === "missed") {
    return "Call attempt was missed and needs another try.";
  }
  if (status === "failed") {
    return "Browser call failed before connecting.";
  }

  return "Call completed and saved to the CRM.";
}

function buildAiAssist(input: {
  notes: string;
  status: ApiCallLogStatus;
  callbackAt?: string | null;
  disposition?: ApiCallDisposition;
  outcomeSummary?: string;
}) {
  const source = [input.outcomeSummary ?? "", input.notes].filter(Boolean).join(". ").trim();
  const aiSummary = buildSummary(source, input.status, input.disposition);
  const sentiment = detectSentiment(source, input.status);
  const suggestedNextAction = buildSuggestedNextAction(input.status, sentiment, input.callbackAt);

  return {
    aiSummary,
    sentiment,
    suggestedNextAction,
  };
}

function stripExtension(value: string) {
  return value.replace(/\s*(?:ext\.?|extension|x)\s*\d+$/i, "").trim();
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function normalizeDialableNumber(rawValue: string): string | null {
  const trimmed = stripExtension(rawValue.trim());
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

function extractDialableNumbers(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  const segments = trimmed
    .split(/[,\n;|/]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const candidates = segments.length > 1 ? segments : [trimmed];
  return dedupePreserveOrder(
    candidates.flatMap((candidate) => {
      const normalized = normalizeDialableNumber(candidate);
      return normalized ? [normalized] : [];
    }),
  );
}

function buildLeadDialNumbers(input: {
  phone: string;
  altPhone: string;
  phoneNumbers?: string[] | null;
}) {
  const sourceNumbers =
    input.phoneNumbers?.length && input.phoneNumbers.length > 0
      ? input.phoneNumbers
      : [input.phone, input.altPhone];

  return dedupePreserveOrder(sourceNumbers.flatMap((value) => extractDialableNumbers(value)));
}

function normalizeLeadImportPhoneFields(input: {
  phone: string;
  altPhone: string;
  phoneNumbers?: string[] | null;
}) {
  const phoneNumbers = buildLeadDialNumbers(input);

  return {
    phone: phoneNumbers[0] ?? input.phone.trim(),
    altPhone: phoneNumbers[1] ?? "",
    phoneNumbers,
  };
}

const QUEUE_CONFIG = {
  NON_CONTACT_RETRY_DELAY_DAYS: 1,
  NOT_INTERESTED_COOLDOWN_DAYS: 3,
  DEFAULT_CALLBACK_PRIORITY: "Medium" as const,
  BUSINESS_DAY_START_HOUR: 9,
  BUSINESS_DAY_END_HOUR: 18,
} as const;

type QueueBucket = "fresh" | "callback" | "repeat";
type QueueReason = "Fresh Lead" | "Callback Due" | "Follow-up Due" | "Retry Due" | "Repeated Lead";

const nonContactRetryDispositions = new Set<ApiCallDisposition>([
  "No Answer",
  "Busy",
  "Voicemail",
  "Call Failed",
  "Switched Off",
  "Not Reachable",
  "Disconnected",
  "Network Issue",
  "Failed Attempt",
  "Rpc hung",
  "Not available",
  "3rd party hung up",
]);

const callbackDispositions = new Set<ApiCallDisposition>([
  "Call Back Later",
  "Follow-Up Required",
  "Appointment Booked",
]);

const terminalDispositions = new Set<ApiCallDisposition>([
  "Wrong Number",
  "Existing Customer",
  "DNC",
  "Sale Closed",
]);

const repeatRetryDispositions = new Set<ApiCallDisposition>([
  "No Answer",
  "Busy",
  "Voicemail",
  "Call Failed",
  "Switched Off",
  "Not Reachable",
  "Disconnected",
  "Network Issue",
  "Failed Attempt",
  "Rpc hung",
  "Not available",
  "3rd party hung up",
  "Not Interested",
]);

function priorityWeight(priority: ApiLeadPriority) {
  const weights: Record<ApiLeadPriority, number> = {
    Urgent: 0,
    High: 1,
    Medium: 2,
    Low: 3,
  };

  return weights[priority];
}

function parseIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addDaysToIso(referenceIso: string, days: number) {
  const next = new Date(referenceIso);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function getNextBusinessDayMorningIso(referenceIso: string) {
  const next = new Date(referenceIso);
  next.setDate(next.getDate() + QUEUE_CONFIG.NON_CONTACT_RETRY_DELAY_DAYS);
  next.setHours(QUEUE_CONFIG.BUSINESS_DAY_START_HOUR, 0, 0, 0);
  return next.toISOString();
}

function getLeadContactAttemptCount(lead: ApiLead) {
  return Math.max(0, Math.floor(lead.contactAttemptCount ?? 0));
}

type LeadDispositionSource = {
  lastDisposition?: ApiCallDisposition | null;
  lastDispositionMain?: DialerMainDisposition | null;
  lastDispositionSub?: DialerSubDisposition | null;
};

function getLeadDispositionSelection(lead: LeadDispositionSource) {
  if (!lead.lastDispositionMain && !lead.lastDispositionSub && !lead.lastDisposition) {
    return null;
  }

  return resolveDispositionSelection({
    mainDisposition: lead.lastDispositionMain ?? null,
    subDisposition: lead.lastDispositionSub ?? null,
    disposition: lead.lastDisposition ?? null,
  });
}

function getLeadLastDisposition(lead: LeadDispositionSource) {
  return getLeadDispositionSelection(lead)?.disposition ?? lead.lastDisposition ?? null;
}

function getLeadLastDispositionMain(lead: LeadDispositionSource) {
  return getLeadDispositionSelection(lead)?.mainDisposition ?? lead.lastDispositionMain ?? null;
}

function getLeadLastDispositionSub(lead: LeadDispositionSource) {
  return getLeadDispositionSelection(lead)?.subDisposition ?? lead.lastDispositionSub ?? null;
}

function getLeadLastAttemptedAt(lead: ApiLead) {
  return lead.lastAttemptedAt ?? lead.lastContactedAt ?? lead.lastContacted ?? lead.updatedAt ?? lead.createdAt;
}

function getLeadNextCallbackAt(lead: ApiLead) {
  return lead.nextCallbackAt ?? lead.callbackTime ?? null;
}

function getLeadNextFollowUpAt(lead: ApiLead) {
  return lead.nextFollowUpAt ?? null;
}

function getLeadNextEligibleAt(lead: ApiLead) {
  const explicitEligibleAt = parseIso(lead.nextEligibleAt ?? null);
  if (explicitEligibleAt !== null) {
    return explicitEligibleAt;
  }

  const selection = getLeadDispositionSelection(lead);
  const lastAttemptedAt = getLeadLastAttemptedAt(lead);
  const lastAttemptedMs = parseIso(lastAttemptedAt) ?? Date.now();

  if (!selection) {
    return null;
  }

  if (selection.queueAction === "RETRY_NEXT_DAY") {
    return parseIso(getNextBusinessDayMorningIso(lastAttemptedAt));
  }

  if (selection.queueAction === "SCHEDULE_CALLBACK") {
    const callbackAt = getLeadNextCallbackAt(lead) ?? getLeadNextFollowUpAt(lead);
    return parseIso(callbackAt);
  }

  if (selection.queueAction === "MOVE_TO_PIPELINE") {
    return parseIso(getLeadNextFollowUpAt(lead));
  }

  if (selection.queueAction === "COOLDOWN_3_DAYS") {
    return parseIso(addDaysToIso(lastAttemptedAt, QUEUE_CONFIG.NOT_INTERESTED_COOLDOWN_DAYS));
  }

  return null;
}

function isLeadSuppressed(lead: ApiLead) {
  const selection = getLeadDispositionSelection(lead);
  if (!selection) {
    return false;
  }

  return (
    Boolean(lead.isDnc) ||
    Boolean(lead.isInvalidNumber) ||
    lead.status === "closed_won" ||
    lead.status === "invalid" ||
    selection.queueAction === "REMOVE_FROM_COLD_QUEUE" ||
    selection.queueAction === "REMOVE_FROM_QUEUE" ||
    selection.queueAction === "PERMANENTLY_EXCLUDE" ||
    selection.queueAction === "REMOVE_FROM_ACTIVE_QUEUE"
  );
}

function isFreshLead(lead: ApiLead) {
  return !isLeadSuppressed(lead) && (getLeadContactAttemptCount(lead) === 0 || !getLeadDispositionSelection(lead));
}

function isCallbackLeadDue(lead: ApiLead, nowMs: number) {
  const callbackAt = parseIso(getLeadNextCallbackAt(lead));
  const followUpAt = parseIso(getLeadNextFollowUpAt(lead));
  const selection = getLeadDispositionSelection(lead);
  if (callbackAt === null && followUpAt === null) {
    return false;
  }

  if (
    selection?.queueAction !== "SCHEDULE_CALLBACK" &&
    selection?.queueAction !== "MOVE_TO_PIPELINE"
  ) {
    return false;
  }

  return Boolean(
    (callbackAt !== null && callbackAt <= nowMs) || (followUpAt !== null && followUpAt <= nowMs),
  );
}

function isRepeatEligibleLead(lead: ApiLead, nowMs: number) {
  if (isLeadSuppressed(lead) || isFreshLead(lead)) {
    return false;
  }

  const eligibleAt = getLeadNextEligibleAt(lead);
  if (eligibleAt === null) {
    return false;
  }

  return eligibleAt <= nowMs && getLeadContactAttemptCount(lead) > 0;
}

function getLeadQueueBucket(lead: ApiLead, nowMs: number): QueueBucket | null {
  if (isLeadSuppressed(lead)) {
    return null;
  }

  if (isFreshLead(lead)) {
    return "fresh";
  }

  if (isCallbackLeadDue(lead, nowMs)) {
    return "callback";
  }

  if (isRepeatEligibleLead(lead, nowMs)) {
    return "repeat";
  }

  return null;
}

function getLeadQueueReason(lead: ApiLead, nowMs: number): QueueReason | null {
  if (isFreshLead(lead)) {
    return "Fresh Lead";
  }

  const callbackAt = parseIso(getLeadNextCallbackAt(lead));
  const followUpAt = parseIso(getLeadNextFollowUpAt(lead));
  const selection = getLeadDispositionSelection(lead);
  if ((callbackAt !== null && callbackAt <= nowMs) || (followUpAt !== null && followUpAt <= nowMs)) {
    if (selection?.queueAction === "RETRY_NEXT_DAY") {
      return "Retry Due";
    }

    return callbackAt !== null && (followUpAt === null || callbackAt <= followUpAt)
      ? "Callback Due"
      : "Follow-up Due";
  }

  if (isRepeatEligibleLead(lead, nowMs)) {
    const lastDisposition = getLeadLastDisposition(lead);
    return selection?.queueAction === "RETRY_NEXT_DAY" && lastDisposition
      ? "Retry Due"
      : "Repeated Lead";
  }

  return null;
}

function getQueueKey(queueScope: string, queueSort: QueueSort, queueFilter: QueueFilter) {
  return `${queueScope}:${queueSort}:${queueFilter}`;
}

function getVisibleLeads(leads: Lead[], role: User["role"], userId: string) {
  if (role === "agent") {
    return leads.filter((lead) => lead.assignedAgentId === userId);
  }

  return leads;
}

function resolveQueueIndex(queueItems: QueueItem[], cursor: QueueCursor | null | undefined) {
  if (!queueItems.length) {
    return -1;
  }

  if (!cursor?.currentLeadId) {
    return -1;
  }

  const exactIndex = queueItems.findIndex(
    (item) => item.leadId === cursor.currentLeadId && item.phoneIndex === cursor.currentPhoneIndex,
  );

  if (exactIndex >= 0) {
    return exactIndex;
  }

  const sameLeadItems = queueItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.leadId === cursor.currentLeadId);

  if (!sameLeadItems.length) {
    return -1;
  }

  const exactPhoneIndex = sameLeadItems.find(({ item }) => item.phoneIndex === cursor.currentPhoneIndex);
  if (exactPhoneIndex) {
    return exactPhoneIndex.index;
  }

  const sameLeadAtOrBeforeCursor = [...sameLeadItems]
    .reverse()
    .find(({ item }) => item.phoneIndex <= cursor.currentPhoneIndex);

  if (sameLeadAtOrBeforeCursor) {
    return sameLeadAtOrBeforeCursor.index;
  }

  return sameLeadItems[0].index;
}

function buildQueueItems(
  leads: Lead[],
  campaigns: Campaign[],
  currentUser: User,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope = "default",
) {
  const scoped = getVisibleLeads(leads, currentUser.role, currentUser.id).filter((lead) =>
    queueFilter === "all" ? openStatuses.has(lead.status) : lead.status === queueFilter,
  );
  const campaignScoped = filterLeadsForDialerCampaign(scoped, campaigns, queueScope);
  const nowMs = Date.now();
  const freshLeads = campaignScoped.filter((lead) => getLeadQueueBucket(lead, nowMs) === "fresh");
  const callbackLeads = campaignScoped.filter((lead) => getLeadQueueBucket(lead, nowMs) === "callback");
  const repeatLeads = campaignScoped.filter((lead) => getLeadQueueBucket(lead, nowMs) === "repeat");

  const activeLeads = freshLeads.length
    ? [...freshLeads].sort((left, right) => {
        const createdGap = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        if (createdGap !== 0) {
          return createdGap;
        }

        const priorityGap = priorityWeight(left.priority) - priorityWeight(right.priority);
        if (priorityGap !== 0) {
          return priorityGap;
        }

        return left.fullName.localeCompare(right.fullName);
      })
    : callbackLeads.length
      ? [...callbackLeads].sort((left, right) => {
          const leftDue =
            parseIso(getLeadNextCallbackAt(left)) ?? parseIso(getLeadNextFollowUpAt(left)) ?? Number.MAX_SAFE_INTEGER;
          const rightDue =
            parseIso(getLeadNextCallbackAt(right)) ?? parseIso(getLeadNextFollowUpAt(right)) ?? Number.MAX_SAFE_INTEGER;
          if (leftDue !== rightDue) {
            return leftDue - rightDue;
          }

          const priorityGap = priorityWeight(left.callbackPriority ?? QUEUE_CONFIG.DEFAULT_CALLBACK_PRIORITY) -
            priorityWeight(right.callbackPriority ?? QUEUE_CONFIG.DEFAULT_CALLBACK_PRIORITY);
          if (priorityGap !== 0) {
            return priorityGap;
          }

          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        })
      : [...repeatLeads].sort((left, right) => {
          const leftEligible = getLeadNextEligibleAt(left) ?? Number.MAX_SAFE_INTEGER;
          const rightEligible = getLeadNextEligibleAt(right) ?? Number.MAX_SAFE_INTEGER;
          if (leftEligible !== rightEligible) {
            return leftEligible - rightEligible;
          }

          const leftAttempt = parseIso(getLeadLastAttemptedAt(left)) ?? Number.MAX_SAFE_INTEGER;
          const rightAttempt = parseIso(getLeadLastAttemptedAt(right)) ?? Number.MAX_SAFE_INTEGER;
          if (leftAttempt !== rightAttempt) {
            return leftAttempt - rightAttempt;
          }

          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        });

  return activeLeads.map((lead) => {
    const phoneNumbers = buildLeadDialNumbers({
      phone: lead.phone,
      altPhone: lead.altPhone,
      phoneNumbers: lead.phoneNumbers,
    });
    const queueReason = getLeadQueueReason(lead, nowMs);

    return {
      queueKey: getQueueKey(queueScope, queueSort, queueFilter),
      queueScope,
      queueSort,
      queueFilter,
      leadId: lead.id,
      leadName: lead.fullName,
      phoneIndex: 0,
      phoneNumber: phoneNumbers[0] ?? lead.phone,
      numberCount: Math.max(1, phoneNumbers.length),
      queueReason,
    };
  });
}

function selectQueueState(
  queueItems: QueueItem[],
  cursor: QueueCursor | QueueProgressRecord | null | undefined,
  queueScope = "default",
  queueSort: QueueSort = "priority",
  queueFilter: QueueFilter = "all",
): QueueState {
  const currentIndex = resolveQueueIndex(queueItems, cursor);
  const currentItem =
    currentIndex >= 0 && currentIndex < queueItems.length ? queueItems[currentIndex] : null;
  const nextItem = currentIndex >= 0 ? queueItems[currentIndex + 1] ?? null : null;

  return {
    queueKey: getQueueKey(queueScope, queueSort, queueFilter),
    queueScope,
    queueSort,
    queueFilter,
    currentItem,
    nextItem,
    items: queueItems,
    queueReason: currentItem?.queueReason ?? null,
    progress: cursor
      ? "userId" in cursor
        ? cursor
        : {
            userId: "",
            queueKey: getQueueKey(queueScope, queueSort, queueFilter),
            queueScope,
            queueSort,
            queueFilter,
            currentLeadId: cursor.currentLeadId,
            currentPhoneIndex: cursor.currentPhoneIndex,
            createdAt: "",
            updatedAt: "",
          }
      : null,
  };
}

function advanceQueueCursor(
  queueItems: QueueItem[],
  cursor: QueueCursor | null | undefined,
  outcome: "completed" | "failed" | "skipped" | "invalid" | "restart" = "completed",
): QueueCursor {
  if (!queueItems.length) {
    return { currentLeadId: null, currentPhoneIndex: 0 };
  }

  if (outcome === "restart") {
    return {
      currentLeadId: queueItems[0].leadId,
      currentPhoneIndex: queueItems[0].phoneIndex,
    };
  }

  const currentIndex = resolveQueueIndex(queueItems, cursor);
  if (currentIndex < 0) {
    return {
      currentLeadId: cursor?.currentLeadId ?? null,
      currentPhoneIndex: cursor?.currentPhoneIndex ?? 0,
    };
  }

  const currentItem = queueItems[currentIndex];
  const nextItem = queueItems[currentIndex + 1] ?? null;
  if (!nextItem) {
    return {
      currentLeadId: null,
      currentPhoneIndex: EXHAUSTED_QUEUE_PHONE_INDEX,
    };
  }

  return {
    currentLeadId: nextItem.leadId,
    currentPhoneIndex: nextItem.phoneIndex,
  };
}

function mapUser(row: DbUserRow): User {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    team: row.team_name,
    timezone: row.timezone,
    avatar: getInitials(row.full_name),
    title: row.title ?? "Outbound Agent",
    status: row.status,
    mustResetPassword: row.must_reset_password,
  };
}

function mapCallStatus(value: string, disposition: ApiCallDisposition): ApiCallLogStatus {
  if (value === "connected" || value === "missed" || value === "follow_up" || value === "failed") {
    return value;
  }

  if (value === "completed") {
    return missedDispositions.has(disposition) ? "missed" : "connected";
  }

  return missedDispositions.has(disposition)
    ? "missed"
    : disposition === "Call Back Later" || disposition === "Follow-Up Required"
      ? "follow_up"
      : "connected";
}

function mapCallType(value: string): ApiCallType {
  return value === "incoming" ? "incoming" : "outgoing";
}

function dispositionToStatus(disposition: ApiCallDisposition): ApiLeadStatus {
  const map: Record<ApiCallDisposition, ApiLeadStatus> = {
    "No Answer": "contacted",
    Busy: "contacted",
    Voicemail: "contacted",
    "Call Failed": "contacted",
    "Switched Off": "contacted",
    "Not Reachable": "contacted",
    Disconnected: "contacted",
    "Network Issue": "contacted",
    "Wrong Number": "invalid",
    "Not Interested": "closed_lost",
    "Existing Customer": "closed_won",
    DNC: "invalid",
    Interested: "qualified",
    "Call Back Later": "callback_due",
    "Follow-Up Required": "follow_up",
    "Appointment Booked": "appointment_booked",
    "Sale Closed": "closed_won",
    "Failed Attempt": "contacted",
    "Rpc hung": "contacted",
    "Not available": "contacted",
    "Already have team": "closed_lost",
    "Already have yelp account": "closed_lost",
    "3rd party hung up": "contacted",
  };

  return map[disposition];
}

function callStatusFromDisposition(disposition: ApiCallDisposition): ApiCallLogStatus {
  if (disposition === "Failed Attempt") {
    return "failed";
  }

  if (missedDispositions.has(disposition)) {
    return "missed";
  }

  if (rejectedDispositions.has(disposition)) {
    return "connected";
  }

  return disposition === "Call Back Later" || disposition === "Follow-Up Required"
    ? "follow_up"
    : "connected";
}

function activityTypeFromDisposition(disposition: ApiCallDisposition) {
  if (disposition === "Appointment Booked") {
    return "appointment";
  }
  if (disposition === "Sale Closed") {
    return "sale";
  }
  if (disposition === "Call Back Later" || disposition === "Follow-Up Required") {
    return "callback";
  }
  if (
    disposition === "Wrong Number" ||
    disposition === "DNC" ||
    disposition === "Existing Customer" ||
    disposition === "Not Interested"
  ) {
    return "status";
  }

  return "call";
}

interface LeadDispositionPatch {
  status: ApiLeadStatus;
  last_disposition: ApiCallDisposition;
  last_disposition_main: DialerMainDisposition;
  last_disposition_sub: DialerSubDisposition;
  last_attempted_at: string;
  last_contacted_at: string | null;
  contact_attempt_count: number;
  connected_attempt_count: number;
  next_eligible_at: string | null;
  next_callback_at: string | null;
  next_follow_up_at: string | null;
  callback_priority: ApiLeadPriority;
  not_interested_reason: string | null;
  is_dnc: boolean;
  is_invalid_number: boolean;
  callback_time: string | null;
  priority: ApiLeadPriority;
}

function buildLeadDispositionPatch(
  lead: DbLeadRow,
  input: WorkspaceDispositionInput,
  now: string,
): LeadDispositionPatch {
  const selection = resolveDispositionSelection({
    mainDisposition: input.mainDisposition ?? null,
    subDisposition: input.subDisposition ?? null,
    disposition: input.disposition,
  });
  const callbackPriority = selection.callbackPriority ?? input.callbackPriority ?? input.followUpPriority ?? QUEUE_CONFIG.DEFAULT_CALLBACK_PRIORITY;
  const contactAttemptCount = Math.max(0, (lead.contact_attempt_count ?? 0) + 1);
  const isConnectedOutcome =
    selection.mainDisposition !== "NOT_CONNECTED" &&
    selection.mainDisposition !== "INVALID_LEAD" &&
    selection.mainDisposition !== "DO_NOT_CALL";
  const connectedAttemptCount = Math.max(
    0,
    (lead.connected_attempt_count ?? 0) + (isConnectedOutcome ? 1 : 0),
  );
  const lastContactedAt = isConnectedOutcome ? now : lead.last_contacted_at ?? null;
  const callbackAt = input.callbackAt?.trim() || null;
  const followUpAt = input.followUpAt?.trim() || null;
  const scheduledAt =
    selection.timingKind === "callback"
      ? callbackAt
      : selection.timingKind === "follow_up"
        ? followUpAt
        : null;
  const leadStatus = getDispositionLeadStatus(selection);

  switch (selection.queueAction) {
    case "RETRY_NEXT_DAY":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: getNextBusinessDayMorningIso(now),
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
    case "SCHEDULE_CALLBACK":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: scheduledAt,
        next_callback_at: selection.timingKind === "follow_up" ? null : scheduledAt,
        next_follow_up_at: selection.timingKind === "follow_up" ? scheduledAt : null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: scheduledAt,
        priority: callbackPriority,
      };
    case "MOVE_TO_PIPELINE":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: scheduledAt,
        next_callback_at: selection.timingKind === "callback" ? scheduledAt : null,
        next_follow_up_at: selection.timingKind === "follow_up" ? scheduledAt : null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: scheduledAt,
        priority: callbackPriority,
      };
    case "COOLDOWN_3_DAYS":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: addDaysToIso(now, QUEUE_CONFIG.NOT_INTERESTED_COOLDOWN_DAYS),
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: input.notInterestedReason?.trim() || null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
    case "REMOVE_FROM_COLD_QUEUE":
    case "REMOVE_FROM_QUEUE": {
      const isInvalidLeadNumber =
        selection.subDisposition === "WRONG_NUMBER" || selection.subDisposition === "INVALID_NUMBER";
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: null,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: isInvalidLeadNumber ? true : Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
    }
    case "PERMANENTLY_EXCLUDE":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: null,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: true,
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
    case "REMOVE_FROM_ACTIVE_QUEUE":
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: null,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
    default:
      return {
        status: leadStatus,
        last_disposition: selection.disposition,
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lastContactedAt,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: connectedAttemptCount,
        next_eligible_at: null,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: callbackPriority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: callbackPriority,
      };
  }
}

function normalizeSipDomain(value: string) {
  return value
    .trim()
    .replace(/^(wss?|https?):\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\/.*$/, "");
}

function normalizeSipProviderUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http/i, "ws");
  }

  return `wss://${normalizeSipDomain(trimmed)}/`;
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= 4) {
    return "*".repeat(trimmed.length);
  }

  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function canManageSharedProfiles(user: User) {
  return user.role === "admin" || user.role === "team_leader";
}

function mapSipProfileRow(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, User>,
): ApiSipProfile {
  return {
    id: row.id,
    label: row.label,
    providerUrl: row.provider_url,
    sipDomain: row.sip_domain,
    sipUsername: row.sip_username,
    callerId: row.caller_id,
    ownerUserId: row.owner_user_id,
    ownerUserName: row.owner_user_id ? (usersById.get(row.owner_user_id)?.name ?? null) : null,
    isShared: row.is_shared,
    isActive: row.id === activeProfileId,
    passwordPreview: maskSecret(row.sip_password),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoredSipProfile(
  row: DbSipProfileRow,
  activeProfileId: string | null,
  usersById: Map<string, User>,
): StoredSipProfile {
  const apiProfile = mapSipProfileRow(row, activeProfileId, usersById);
  return {
    ...apiProfile,
    sipPassword: row.sip_password,
  };
}

function mapLeadRow(
  lead: DbLeadRow,
  usersById: Map<string, User>,
  relations: {
    tags: Map<string, DbLeadTagRow[]>;
    notes: Map<string, DbLeadNoteRow[]>;
    calls: Map<string, DbCallLogRow[]>;
    activities: Map<string, DbActivityRow[]>;
    callbacks: Map<string, DbCallbackRow[]>;
  },
) {
  const assignedAgent = lead.assigned_agent ? usersById.get(lead.assigned_agent) ?? null : null;
  const activeCallback = (relations.callbacks.get(lead.id) ?? [])[0];
  const sortedCallRows = [...(relations.calls.get(lead.id) ?? [])].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
  const latestCall = sortedCallRows[0] ?? null;
  const dispositionSelection = getLeadDispositionSelection({
    lastDisposition: lead.last_disposition,
    lastDispositionMain: lead.last_disposition_main,
    lastDispositionSub: lead.last_disposition_sub,
  });
  const latestConnectedCall =
    sortedCallRows.find((call) => !missedDispositions.has(call.disposition)) ?? null;
  const phoneNumbers = buildLeadDialNumbers({
    phone: lead.phone ?? "",
    altPhone: lead.alt_phone ?? "",
    phoneNumbers: lead.phone_numbers ?? [],
  });
  const primaryPhone = phoneNumbers[0] ?? lead.phone ?? "";
  const secondaryPhone = phoneNumbers[1] ?? lead.alt_phone ?? "";
  const activitiesForLead = relations.activities.get(lead.id) ?? [];
  const callHistory: ApiCallLog[] = sortedCallRows.map((call) => {
    const callSelection = resolveDispositionSelection({
      mainDisposition: call.main_disposition ?? null,
      subDisposition: call.sub_disposition ?? null,
      disposition: call.disposition,
    });
    const status = mapCallStatus(call.call_status, call.disposition);
    const aiAssist = buildAiAssist({
      notes: call.notes ?? "",
      outcomeSummary: call.outcome_summary ?? "",
      status,
      disposition: call.disposition,
      callbackAt: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
    });

    return {
      id: call.id,
      leadId: lead.id,
      leadName: lead.full_name || "Untitled Lead",
      phone: primaryPhone,
      createdAt: call.created_at,
      agentId: call.agent_id ?? "",
      agentName: call.agent_id ? usersById.get(call.agent_id)?.name ?? "Unknown Agent" : "Unknown Agent",
      callType: mapCallType(call.direction),
      durationSeconds: call.duration_seconds,
      disposition: call.disposition,
      mainDisposition: callSelection.mainDisposition,
      subDisposition: callSelection.subDisposition,
      status,
      source: "call_log",
      notes: call.notes ?? "",
      recordingEnabled: call.recording_enabled,
      recordingUrl: call.recording_url ?? null,
      outcomeSummary: call.outcome_summary ?? "",
      aiSummary: aiAssist.aiSummary,
      sentiment: aiAssist.sentiment,
      suggestedNextAction: aiAssist.suggestedNextAction,
      followUpAt: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
    };
  });

  activitiesForLead.forEach((activity) => {
    const diagnostic = parseFailedAttemptDescription(activity.description);
    if (!diagnostic) {
      return;
    }

    callHistory.push(
      buildFailedAttemptCallLog({
        id: activity.id,
        leadId: lead.id,
        leadName: lead.full_name || "Untitled Lead",
        primaryPhone,
        createdAt: activity.created_at,
        actor: activity.actor_id ? usersById.get(activity.actor_id) ?? null : null,
        diagnostic,
      }),
    );
  });

  callHistory.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return {
    id: lead.id,
    fullName: lead.full_name || "Untitled Lead",
    phone: primaryPhone,
    altPhone: secondaryPhone,
    phoneNumbers,
    email: lead.email ?? "",
    company: lead.company ?? "",
    jobTitle: lead.job_title ?? "",
    location: lead.location ?? "",
    source: lead.source ?? "",
    interest: lead.interest ?? "",
    status: lead.status ?? "new",
    notes: lead.notes ?? "",
    lastContacted: lead.last_contacted_at ?? lead.last_contacted ?? null,
    lastDisposition: lead.last_disposition ?? dispositionSelection?.disposition ?? latestCall?.disposition ?? null,
    lastDispositionMain: lead.last_disposition_main ?? dispositionSelection?.mainDisposition ?? null,
    lastDispositionSub: lead.last_disposition_sub ?? dispositionSelection?.subDisposition ?? null,
    lastAttemptedAt: lead.last_attempted_at ?? latestCall?.created_at ?? lead.last_contacted ?? null,
    lastContactedAt: lead.last_contacted_at ?? latestConnectedCall?.created_at ?? lead.last_contacted ?? null,
    contactAttemptCount: lead.contact_attempt_count ?? sortedCallRows.length,
    connectedAttemptCount:
      lead.connected_attempt_count ?? sortedCallRows.filter((call) => !missedDispositions.has(call.disposition)).length,
    nextEligibleAt: lead.next_eligible_at ?? lead.callback_time ?? null,
    nextCallbackAt: lead.next_callback_at ?? lead.callback_time ?? null,
    nextFollowUpAt: lead.next_follow_up_at ?? null,
    callbackPriority: lead.callback_priority ?? lead.priority,
    notInterestedReason: lead.not_interested_reason ?? null,
    isDnc: Boolean(lead.is_dnc),
    isInvalidNumber: Boolean(lead.is_invalid_number) || lead.status === "invalid",
    assignedAgentId: assignedAgent?.id ?? "",
    assignedAgentName: assignedAgent?.name ?? "Unassigned",
    callbackTime: activeCallback?.scheduled_for ?? lead.callback_time ?? null,
    priority: lead.priority ?? "Medium",
    createdAt: lead.created_at ?? new Date().toISOString(),
    updatedAt: lead.updated_at ?? lead.created_at ?? new Date().toISOString(),
    tags: (relations.tags.get(lead.id) ?? []).map((tag) => tag.label),
    callHistory,
    notesHistory: (relations.notes.get(lead.id) ?? []).map((note) => ({
      id: note.id,
      body: note.note_body,
      createdAt: note.created_at,
      authorId: note.author_id ?? "",
      authorName: note.author_id ? usersById.get(note.author_id)?.name ?? "System" : "System",
    })),
    activities: activitiesForLead.map((activity) => {
      const diagnostic = parseFailedAttemptDescription(activity.description);
      return {
        id: activity.id,
        type:
          activity.activity_type === "call" ||
          activity.activity_type === "note" ||
          activity.activity_type === "callback" ||
          activity.activity_type === "status" ||
          activity.activity_type === "appointment" ||
          activity.activity_type === "sale"
            ? activity.activity_type
            : "status",
        title: activity.title,
        description: diagnostic ? formatFailedAttemptSummary(diagnostic) : activity.description ?? "",
        createdAt: activity.created_at,
        actorId: activity.actor_id,
        actorName: activity.actor_id ? usersById.get(activity.actor_id)?.name ?? "System" : "System",
      };
    }),
    leadScore: lead.lead_score ?? 0,
    timezone: assignedAgent?.timezone ?? "UTC",
  } satisfies Lead;
}

function normalizeCampaignSourceKey(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return (trimmed || "Uncategorized").toLowerCase();
}

function formatCampaignName(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || "Uncategorized";
}

function getLeadCampaignSourceKey(lead: DbLeadRow) {
  return normalizeCampaignSourceKey(lead.source);
}

function isCampaignTouchedRecently(lead: DbLeadRow) {
  const reference = lead.last_contacted ?? lead.updated_at ?? lead.created_at;
  const referenceTime = new Date(reference).getTime();
  return Number.isFinite(referenceTime) ? Date.now() - referenceTime <= 48 * 60 * 60 * 1000 : false;
}

function campaignCountsForLeads(leads: DbLeadRow[]) {
  return leads.reduce(
    (accumulator, lead) => {
      accumulator.leadCount += 1;
      if (lead.status === "callback_due" || lead.status === "follow_up" || lead.callback_time) {
        accumulator.callbackCount += 1;
      }
      if (!lead.notes && !lead.last_contacted) {
        accumulator.untouchedCount += 1;
      }
      if (!isCampaignTouchedRecently(lead)) {
        accumulator.staleCount += 1;
      }
      return accumulator;
    },
    {
      leadCount: 0,
      callbackCount: 0,
      untouchedCount: 0,
      staleCount: 0,
    },
  );
}

function mapCampaignRow(
  row: DbCampaignRow,
  usersById: Map<string, User>,
  groupedLeads: Map<string, DbLeadRow[]>,
): Campaign {
  const leads = groupedLeads.get(row.source_key) ?? [];
  const counts = campaignCountsForLeads(leads);
  const activeLeadCount = leads.filter((lead) =>
    ["new", "contacted", "callback_due", "follow_up", "qualified", "appointment_booked"].includes(lead.status),
  ).length;
  const recentLeadAt = leads
    .map((lead) => lead.last_contacted ?? lead.updated_at ?? lead.created_at)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  const assignedUser = row.assigned_user_id ? usersById.get(row.assigned_user_id) ?? null : null;

  return {
    id: row.id,
    name: row.name,
    sourceKey: row.source_key,
    assignedUserId: row.assigned_user_id,
    assignedUserName: assignedUser?.name ?? "Unassigned",
    isActive: row.is_active,
    allowAutoDial: row.allow_auto_dial,
    leadCount: counts.leadCount,
    activeLeadCount,
    callbackCount: counts.callbackCount,
    untouchedCount: counts.untouchedCount,
    staleCount: counts.staleCount,
    recentLeadAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function uniqueCampaignSeeds(leads: DbLeadRow[]) {
  const seen = new Map<string, string>();
  leads.forEach((lead) => {
    const sourceKey = getLeadCampaignSourceKey(lead);
    if (!seen.has(sourceKey)) {
      seen.set(sourceKey, formatCampaignName(lead.source));
    }
  });

  return seen;
}

async function fetchWorkspaceUsers() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("app_users")
    .select("id, auth_user_id, full_name, email, role, team_name, title, timezone, status, must_reset_password")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as DbUserRow[];
}

async function fetchWorkspaceUserPreferences(userIds: string[]) {
  const client = requireSupabaseClient();
  if (!userIds.length) {
    return [] as DbUserSipPreferenceRow[];
  }

  const { data, error } = await client
    .from("user_sip_preferences")
    .select("user_id, active_sip_profile_id")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as DbUserSipPreferenceRow[];
}

async function fetchSipProfiles() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .order("is_shared", { ascending: false })
    .order("label", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as DbSipProfileRow[];
}

async function fetchCampaignRows() {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("campaigns")
    .select("id, name, source_key, assigned_user_id, is_active, allow_auto_dial, created_at, updated_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return [] as DbCampaignRow[];
    }

    throw error;
  }

  return (data ?? []) as DbCampaignRow[];
}

async function fetchQueueProgress(currentUserId: string, queueKey: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("queue_progress")
    .select(
      "user_id, queue_key, queue_scope, queue_sort, queue_filter, current_lead_id, current_phone_index, created_at, updated_at",
    )
    .eq("user_id", currentUserId)
    .eq("queue_key", queueKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbQueueProgressRow | null) ?? null;
}

function toTimecardSnapshot(row: DbEmployeeTimecardRow): TimecardSnapshot {
  return {
    workDate: row.work_date,
    timezone: row.timezone,
    timeOnSystemSeconds: row.time_on_system_seconds,
    breakSeconds: row.break_seconds,
    wrapSeconds: row.wrap_seconds,
    loginHoursSeconds: row.login_hours_seconds,
    capturedAt: row.updated_at,
    hasCheckedIn: true,
  };
}

async function fetchEmployeeTimecards(employeeId: string, month: string) {
  const client = requireSupabaseClient();
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return [] as TimecardSnapshot[];
  }

  const monthStart = `${year}-${`${monthIndex + 1}`.padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(year, monthIndex + 1, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${`${nextMonthDate.getUTCMonth() + 1}`.padStart(2, "0")}-01`;

  const { data, error } = await client
    .from("employee_timecards")
    .select(
      "user_id, work_date, timezone, time_on_system_seconds, break_seconds, wrap_seconds, login_hours_seconds, created_at, updated_at",
    )
    .eq("user_id", employeeId)
    .gte("work_date", monthStart)
    .lt("work_date", nextMonth)
    .order("work_date", { ascending: true });

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return [] as TimecardSnapshot[];
    }

    throw error;
  }

  return ((data ?? []) as DbEmployeeTimecardRow[]).map(toTimecardSnapshot);
}

async function upsertEmployeeTimecardSnapshot(currentUser: User, snapshot: TimecardSnapshot) {
  const client = requireSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await client.from("employee_timecards").upsert(
    {
      user_id: currentUser.id,
      work_date: snapshot.workDate,
      timezone: snapshot.timezone,
      time_on_system_seconds: snapshot.timeOnSystemSeconds,
      break_seconds: snapshot.breakSeconds,
      wrap_seconds: snapshot.wrapSeconds,
      login_hours_seconds: snapshot.loginHoursSeconds,
      updated_at: now,
    },
    {
      onConflict: "user_id,work_date",
    },
  );

  if (error) {
    if (isMissingSupabaseTableError(error)) {
      return;
    }

    throw error;
  }
}

function toQueueProgressRecord(row: DbQueueProgressRow): QueueProgressRecord {
  return {
    userId: row.user_id,
    queueKey: row.queue_key,
    queueScope: row.queue_scope,
    queueSort: row.queue_sort,
    queueFilter: row.queue_filter,
    currentLeadId: row.current_lead_id,
    currentPhoneIndex: row.current_phone_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function upsertQueueProgress(input: {
  userId: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentLeadId: string | null;
  currentPhoneIndex: number;
}) {
  const client = requireSupabaseClient();
  const now = new Date().toISOString();
  const queueKey = getQueueKey(input.queueScope, input.queueSort, input.queueFilter);

  const { error } = await client.from("queue_progress").upsert(
    {
      user_id: input.userId,
      queue_key: queueKey,
      queue_scope: input.queueScope,
      queue_sort: input.queueSort,
      queue_filter: input.queueFilter,
      current_lead_id: input.currentLeadId,
      current_phone_index: input.currentPhoneIndex,
      updated_at: now,
    },
    {
      onConflict: "user_id,queue_key",
    },
  );

  if (error) {
    throw error;
  }
}

async function fetchLeadsWorkspace() {
  const client = requireSupabaseClient();
  const [users, leadRows, tagRows, noteRows, callRows, activityRows, callbackRows] =
    await Promise.all([
      fetchWorkspaceUsers(),
      client
        .from("leads")
        .select(
          "id, external_id, full_name, phone, alt_phone, phone_numbers, email, company, job_title, location, source, interest, status, notes, last_contacted, last_disposition, last_disposition_main, last_disposition_sub, last_attempted_at, last_contacted_at, contact_attempt_count, connected_attempt_count, next_eligible_at, next_callback_at, next_follow_up_at, callback_priority, not_interested_reason, is_dnc, is_invalid_number, assigned_agent, callback_time, priority, lead_score, created_at, updated_at",
        )
        .order("created_at", { ascending: false }),
      client.from("lead_tags").select("id, lead_id, label"),
      client.from("lead_notes").select("id, lead_id, author_id, note_body, created_at"),
      client.from("call_logs").select(
        "id, lead_id, agent_id, direction, disposition, duration_seconds, call_status, recording_enabled, recording_url, outcome_summary, notes, main_disposition, sub_disposition, wrap_up_started_at, wrap_up_ended_at, wrap_up_duration_seconds, callback_at, callback_priority, follow_up_at, not_interested_reason, created_at",
      ),
      client.from("activity_logs").select(
        "id, lead_id, actor_id, activity_type, title, description, created_at",
      ),
      client.from("callbacks").select(
        "id, lead_id, owner_id, scheduled_for, priority, status, completed_at, created_at, updated_at",
      ),
    ]);

  if (leadRows.error) throw leadRows.error;
  if (tagRows.error) throw tagRows.error;
  if (noteRows.error) throw noteRows.error;
  if (callRows.error) throw callRows.error;
  if (activityRows.error) throw activityRows.error;
  if (callbackRows.error) throw callbackRows.error;

  const usersById = new Map(users.map((user) => [user.id, mapUser(user)]));
  const tags = new Map<string, DbLeadTagRow[]>();
  const notes = new Map<string, DbLeadNoteRow[]>();
  const calls = new Map<string, DbCallLogRow[]>();
  const activities = new Map<string, DbActivityRow[]>();
  const callbacks = new Map<string, DbCallbackRow[]>();

  ((tagRows.data ?? []) as DbLeadTagRow[]).forEach((row) => {
    const bucket = tags.get(row.lead_id) ?? [];
    bucket.push(row);
    tags.set(row.lead_id, bucket);
  });
  ((noteRows.data ?? []) as DbLeadNoteRow[]).forEach((row) => {
    const bucket = notes.get(row.lead_id) ?? [];
    bucket.push(row);
    notes.set(row.lead_id, bucket);
  });
  ((callRows.data ?? []) as DbCallLogRow[]).forEach((row) => {
    const bucket = calls.get(row.lead_id) ?? [];
    bucket.push(row);
    calls.set(row.lead_id, bucket);
  });
  ((activityRows.data ?? []) as DbActivityRow[]).forEach((row) => {
    const bucket = activities.get(row.lead_id) ?? [];
    bucket.push(row);
    activities.set(row.lead_id, bucket);
  });
  ((callbackRows.data ?? []) as DbCallbackRow[]).forEach((row) => {
    if (row.status !== "scheduled") {
      return;
    }
    const bucket = callbacks.get(row.lead_id) ?? [];
    bucket.push(row);
    callbacks.set(row.lead_id, bucket);
  });

  const leadData = ((leadRows.data ?? []) as DbLeadRow[]).map((lead) =>
    mapLeadRow(lead, usersById, { tags, notes, calls, activities, callbacks }),
  );

  return {
    users: Array.from(usersById.values()),
    leads: leadData,
    leadRows: (leadRows.data ?? []) as DbLeadRow[],
    usersById,
  };
}

async function loadSipProfileState(currentUser: User, users: User[]) {
  const client = requireSupabaseClient();
  const [profileRowsResult, preferenceRowsResult] = await Promise.allSettled([
    fetchSipProfiles(),
    client
      .from("user_sip_preferences")
      .select("user_id, active_sip_profile_id")
      .eq("user_id", currentUser.id)
      .maybeSingle(),
  ]);

  if (
    profileRowsResult.status === "rejected" &&
    !isMissingSupabaseTableError(profileRowsResult.reason)
  ) {
    throw profileRowsResult.reason;
  }

  if (
    preferenceRowsResult.status === "rejected" &&
    !isMissingSupabaseTableError(preferenceRowsResult.reason)
  ) {
    throw preferenceRowsResult.reason;
  }

  const profileRows =
    profileRowsResult.status === "fulfilled" ? profileRowsResult.value : [];
  const preferenceRows =
    preferenceRowsResult.status === "fulfilled" ? preferenceRowsResult.value : null;

  const usersById = new Map(users.map((user) => [user.id, user]));
  const activeProfileId =
    (preferenceRows?.data as DbUserSipPreferenceRow | null)?.active_sip_profile_id ?? null;
  const activeRow = activeProfileId ? profileRows.find((profile) => profile.id === activeProfileId) ?? null : null;
  const activeProfile = activeRow ? mapSipProfileRow(activeRow, activeProfileId, usersById) : null;
  const activeStoredProfile = activeRow ? mapStoredSipProfile(activeRow, activeProfileId, usersById) : null;

  const visibleProfiles =
    currentUser.role === "admin"
      ? profileRows.map((row) => mapSipProfileRow(row, activeProfileId, usersById))
      : [];

  return {
    profiles: visibleProfiles,
    activeProfile,
    activeStoredProfile,
    selectionRequired: currentUser.role === "admin" && visibleProfiles.length > 0 && !activeProfileId,
  };
}

function buildWorkspaceSettingsStatus(voice: VoiceSessionResponse): WorkspaceSettingsStatus {
  return {
    authMode: "supabase",
    signupEnabled: true,
    importFormats: ["csv", "xlsx", "xls"],
    voice: {
      provider: "ringcentral",
      available: voice.available,
      callerId: voice.callerId,
      configuredFields: {
        websocketUrl: Boolean(voice.websocketUrl),
        sipDomain: Boolean(voice.sipDomain),
        sipUsername: Boolean(voice.username),
        sipPassword: Boolean(voice.authorizationPassword),
        callerId: Boolean(voice.callerId),
      },
    },
    supabase: {
      connected: true,
      publishableKeyConfigured: hasSupabaseBrowserConfig,
      serviceRoleConfigured: true,
      reason: null,
      realtimeAvailable: true,
    },
  };
}

export async function loadWorkspace(currentUser: User, token?: string | null): Promise<WorkspacePayload> {
  const { users, leads, leadRows, usersById } = await fetchLeadsWorkspace();
  const campaignRows = await fetchCampaignRows();
  const campaignRowMap = new Map(campaignRows.map((row) => [row.source_key, row]));
  const groupedLeadRows = new Map<string, DbLeadRow[]>();
  leadRows.forEach((lead) => {
    const sourceKey = getLeadCampaignSourceKey(lead);
    const bucket = groupedLeadRows.get(sourceKey) ?? [];
    bucket.push(lead);
    groupedLeadRows.set(sourceKey, bucket);
  });
  const leadCampaignSeeds = uniqueCampaignSeeds(leadRows);
  const campaignSourceKeys = new Set<string>([
    ...campaignRowMap.keys(),
    ...leadCampaignSeeds.keys(),
  ]);
  const campaigns = Array.from(campaignSourceKeys.values()).map((sourceKey) => {
    const existingRow = campaignRowMap.get(sourceKey);
    const row: DbCampaignRow = existingRow ?? {
      id: `campaign:${sourceKey}`,
      name: leadCampaignSeeds.get(sourceKey) ?? formatCampaignName(sourceKey),
      source_key: sourceKey,
      assigned_user_id: null,
      is_active: true,
      allow_auto_dial: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return mapCampaignRow(row, usersById, groupedLeadRows);
  });
  campaigns.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
  const profiles: SipProfile[] = [];
  const activeProfile: SipProfile | null = null;
  const selectionRequired = false;
  const cachedRingCentralVoiceSession = getCachedRingCentralBrowserVoiceSession(currentUser.id);
  const ringCentralVoiceSession = cachedRingCentralVoiceSession ?? await loadRingCentralBrowserVoiceSessionAction().catch(() => null);
  if (ringCentralVoiceSession?.available) {
    cacheRingCentralBrowserVoiceSession(currentUser.id, ringCentralVoiceSession);
  }
  const session: VoiceSessionResponse = ringCentralVoiceSession?.available
    ? {
        ...ringCentralVoiceSession,
        provider: "ringcentral",
        displayName: ringCentralVoiceSession.displayName ?? currentUser.name,
        authorizationId: ringCentralVoiceSession.authorizationId ?? null,
      }
    : ringCentralVoiceSession
    ? {
        ...ringCentralVoiceSession,
        provider: "ringcentral",
        displayName: ringCentralVoiceSession.displayName ?? currentUser.name,
        authorizationId: ringCentralVoiceSession.authorizationId ?? null,
      }
    : {
        provider: "ringcentral",
        available: false,
        source: "unconfigured",
        callerId: null,
        websocketUrl: null,
        sipDomain: null,
        username: null,
        profileId: null,
        profileLabel: null,
        authorizationId: null,
        message: "RingCentral calling is managed from Settings.",
      };
  const currentSessionUser = {
    ...currentUser,
    activeSipProfileId: null,
    activeSipProfileLabel: null,
  };

  return {
    user: currentSessionUser,
    users,
    leads,
    campaigns,
    analytics: buildWorkspaceAnalytics(leads, users, currentSessionUser),
    settings: buildWorkspaceSettingsStatus(session),
    voice: session,
    sipProfiles: profiles,
    activeSipProfile: activeProfile,
    sipProfileSelectionRequired: selectionRequired,
  };
}

export async function loadEmployeeTimecards(employeeId: string, month: string) {
  return fetchEmployeeTimecards(employeeId, month);
}

export async function saveEmployeeTimecard(currentUser: User, snapshot: TimecardSnapshot) {
  await upsertEmployeeTimecardSnapshot(currentUser, snapshot);
}

async function attachSipAssignments(users: User[]) {
  const client = requireSupabaseClient();
  const ids = users.map((user) => user.id);
  if (!ids.length) {
    return users;
  }

  const { data, error } = await client
    .from("user_sip_preferences")
    .select("user_id, active_sip_profile_id")
    .in("user_id", ids);

  if (error) {
    return users;
  }

  const profileIds = Array.from(
    new Set(
      ((data ?? []) as DbUserSipPreferenceRow[])
        .map((row) => row.active_sip_profile_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const profileRows = profileIds.length
    ? ((await client
        .from("sip_profiles")
        .select("id, label")
        .in("id", profileIds)) as { data: Array<{ id: string; label: string }> | null; error: Error | null })
    : { data: [], error: null };

  const profileMap = new Map(
    ((profileRows.data ?? []) as Array<{ id: string; label: string }>).map((row) => [row.id, row.label]),
  );
  const assignmentMap = new Map<string, { profileId: string | null; profileLabel: string | null }>();
  ((data ?? []) as DbUserSipPreferenceRow[]).forEach((row) => {
    assignmentMap.set(row.user_id, {
      profileId: row.active_sip_profile_id ?? null,
      profileLabel: row.active_sip_profile_id ? profileMap.get(row.active_sip_profile_id) ?? null : null,
    });
  });

  return users.map((user) => {
    const assignment = assignmentMap.get(user.id);
    return {
      ...user,
      activeSipProfileId: assignment?.profileId ?? null,
      activeSipProfileLabel: assignment?.profileLabel ?? null,
    };
  });
}

export async function loadQueueCursor(
  currentUser: User,
  leads: Lead[],
  campaigns: Campaign[],
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope = "default",
): Promise<QueueState> {
  const queueItems = buildQueueItems(
    leads,
    campaigns,
    currentUser,
    queueSort,
    queueFilter,
    queueScope,
  );
  const queueKey = getQueueKey(queueScope, queueSort, queueFilter);
  const progress = await fetchQueueProgress(currentUser.id, queueKey);
  return selectQueueState(
    queueItems,
    progress ? toQueueProgressRecord(progress) : null,
    queueScope,
    queueSort,
    queueFilter,
  );
}

export async function saveQueueCursor(
  currentUser: User,
  queueScope: string,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  currentLeadId: string | null,
  currentPhoneIndex: number,
) {
  await upsertQueueProgress({
    userId: currentUser.id,
    queueScope,
    queueSort,
    queueFilter,
    currentLeadId,
    currentPhoneIndex,
  });
}

export function computeNextQueueCursor(
  leads: Lead[],
  campaigns: Campaign[],
  currentUser: User,
  queueSort: QueueSort,
  queueFilter: QueueFilter,
  queueScope: string,
  cursor: QueueCursor | null,
  outcome: "completed" | "failed" | "skipped" | "invalid" | "restart" = "completed",
) {
  const queueItems = buildQueueItems(
    leads,
    campaigns,
    currentUser,
    queueSort,
    queueFilter,
    queueScope,
  );
  return advanceQueueCursor(queueItems, cursor, outcome);
}

async function ensureLeadAccess(leadId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Lead not found");
  }

  return data as DbLeadRow;
}

async function ensureCallLogAccess(callId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.from("call_logs").select("*").eq("id", callId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Call log not found");
  }

  return data as DbCallLogRow;
}

function leadStatusFromCallStatus(status: ApiCallLogStatus): ApiLeadStatus {
  if (status === "failed") {
    return "contacted";
  }

  if (status === "follow_up") {
    return "follow_up";
  }

  return "qualified";
}

function dispositionFromCallStatus(status: ApiCallLogStatus): ApiCallDisposition {
  if (status === "failed") {
    return "Failed Attempt";
  }

  if (status === "missed") {
    return "No Answer";
  }

  if (status === "follow_up") {
    return "Follow-Up Required";
  }

  return "Interested";
}

interface WorkspaceDispositionInput extends SaveDispositionInput {
  leadId: string;
  durationSeconds: number;
  recordingEnabled: boolean;
  wrapUpStartedAt?: string | null;
  wrapUpEndedAt?: string | null;
  wrapUpDurationSeconds?: number | null;
}

export async function saveFailedCallAttempt(
  input: SaveFailedCallAttemptInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const selection = resolveDispositionSelection({
    disposition: "Failed Attempt",
  });
  const description = buildFailedAttemptDescription({
    ...input,
    endedAt: input.endedAt || now,
  });
  const contactAttemptCount = Math.max(0, (lead.contact_attempt_count ?? 0) + 1);
  const nextEligibleAt = getNextBusinessDayMorningIso(now);

  const [leadUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: "contacted",
        last_disposition: "Failed Attempt",
        last_disposition_main: selection.mainDisposition,
        last_disposition_sub: selection.subDisposition,
        last_attempted_at: now,
        last_contacted_at: lead.last_contacted_at ?? lead.last_contacted ?? null,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: Math.max(0, lead.connected_attempt_count ?? 0),
        next_eligible_at: nextEligibleAt,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: lead.callback_priority ?? lead.priority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        callback_time: null,
        priority: lead.priority,
        updated_at: now,
      })
      .eq("id", input.leadId),
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: "call",
      title: "Call failed before connect",
      description,
    }),
  ]);

  if (leadUpdate.error) {
    throw leadUpdate.error;
  }
  if (activityInsert.error) {
    throw activityInsert.error;
  }
}

export async function markLeadInvalid(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(leadId);
  const now = new Date().toISOString();
  const contactAttemptCount = Math.max(0, (lead.contact_attempt_count ?? 0) + 1);

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: "invalid",
        last_disposition: "Wrong Number",
        last_disposition_main: "INVALID_LEAD",
        last_disposition_sub: "WRONG_NUMBER",
        last_attempted_at: now,
        last_contacted_at: lead.last_contacted_at ?? lead.last_contacted ?? null,
        contact_attempt_count: contactAttemptCount,
        connected_attempt_count: Math.max(0, lead.connected_attempt_count ?? 0),
        next_eligible_at: null,
        next_callback_at: null,
        next_follow_up_at: null,
        callback_priority: lead.callback_priority ?? lead.priority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: true,
        callback_time: null,
        priority: lead.priority,
        notes: "Marked invalid from preview dialer queue.",
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead marked invalid",
      description: "Removed from active dialer queue after validation.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function saveDisposition(
  input: WorkspaceDispositionInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const trimmedNotes = input.notes.trim();
  const trimmedSummary = input.outcomeSummary.trim();
  const ringcentralSessionId = input.ringcentralSessionId?.trim() || null;
  const callType = input.callType ?? "outgoing";
  const dispositionPatch = buildLeadDispositionPatch(lead, input, now);
  const wrapUpStartedAt = input.wrapUpStartedAt || now;
  const wrapUpEndedAt = input.wrapUpEndedAt || now;
  const wrapUpDurationSeconds =
    typeof input.wrapUpDurationSeconds === "number" && Number.isFinite(input.wrapUpDurationSeconds)
      ? Math.max(0, Math.floor(input.wrapUpDurationSeconds))
      : Math.max(
          0,
          Math.floor((new Date(wrapUpEndedAt).getTime() - new Date(wrapUpStartedAt).getTime()) / 1000),
        );
  const callbackAt = dispositionPatch.next_callback_at ?? dispositionPatch.next_follow_up_at ?? null;

  const callLogPayload = {
    lead_id: input.leadId,
    agent_id: currentUser.id,
    direction: callType,
    disposition: dispositionPatch.last_disposition,
    main_disposition: dispositionPatch.last_disposition_main,
    sub_disposition: dispositionPatch.last_disposition_sub,
    duration_seconds: input.durationSeconds,
    call_status: callStatusFromDisposition(dispositionPatch.last_disposition),
    outcome_summary: trimmedSummary,
    notes: trimmedNotes || null,
    wrap_up_started_at: wrapUpStartedAt,
    wrap_up_ended_at: wrapUpEndedAt,
    wrap_up_duration_seconds: wrapUpDurationSeconds,
    callback_at: dispositionPatch.next_callback_at ?? dispositionPatch.next_follow_up_at ?? null,
    callback_priority: dispositionPatch.callback_priority,
    follow_up_at: dispositionPatch.next_follow_up_at,
    not_interested_reason: dispositionPatch.not_interested_reason,
    ...(ringcentralSessionId
      ? {
          id: await buildRingCentralCallLogId(ringcentralSessionId),
          recording_provider: "ringcentral",
          ringcentral_session_id: ringcentralSessionId,
        }
      : {
          recording_enabled: input.recordingEnabled,
          recording_url: null,
        }),
  } as const;

  const [leadUpdate, callInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: dispositionPatch.status,
        notes: trimmedNotes || lead.notes,
        last_disposition: dispositionPatch.last_disposition,
        last_disposition_main: dispositionPatch.last_disposition_main,
        last_disposition_sub: dispositionPatch.last_disposition_sub,
        last_attempted_at: dispositionPatch.last_attempted_at,
        last_contacted_at: dispositionPatch.last_contacted_at,
        contact_attempt_count: dispositionPatch.contact_attempt_count,
        connected_attempt_count: dispositionPatch.connected_attempt_count,
        next_eligible_at: dispositionPatch.next_eligible_at,
        next_callback_at: dispositionPatch.next_callback_at,
        next_follow_up_at: dispositionPatch.next_follow_up_at,
        callback_priority: dispositionPatch.callback_priority,
        not_interested_reason: dispositionPatch.not_interested_reason,
        is_dnc: dispositionPatch.is_dnc,
        is_invalid_number: dispositionPatch.is_invalid_number,
        last_contacted: dispositionPatch.last_contacted_at ?? lead.last_contacted ?? null,
        callback_time: callbackAt,
        priority: dispositionPatch.priority,
        updated_at: now,
      })
      .eq("id", input.leadId),
    ringcentralSessionId
      ? client.from("call_logs").upsert(callLogPayload as any)
      : client.from("call_logs").insert(callLogPayload as any),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callInsert.error) throw callInsert.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [];

  if (trimmedNotes) {
    operations.push(
      client.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: trimmedNotes,
      }),
    );
  }

  operations.push(
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: activityTypeFromDisposition(input.disposition),
      title: `${input.disposition} saved`,
      description:
        trimmedSummary || `Disposition ${input.disposition} saved after call completion.`,
    }),
  );

  if (callbackAt) {
    operations.push(
      client
        .from("callbacks")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("lead_id", input.leadId)
        .eq("status", "scheduled"),
    );
    operations.push(
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        priority: input.followUpPriority,
        status: "scheduled",
      }),
    );
    operations.push(
      client.from("activity_logs").insert({
        lead_id: input.leadId,
        actor_id: currentUser.id,
        activity_type: "callback",
        title: "Callback scheduled",
        description: `Callback scheduled for ${callbackAt}.`,
      }),
    );
  } else {
    operations.push(
      client
        .from("callbacks")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("lead_id", input.leadId)
        .eq("status", "scheduled"),
    );
  }

  if (input.disposition === "Appointment Booked" && callbackAt) {
    operations.push(
      client.from("appointments").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: callbackAt,
        status: "scheduled",
        notes: trimmedSummary || trimmedNotes || null,
      }),
    );
  }

  const results = await Promise.all(operations);
  const failingResult = results.find((result) => "error" in result && result.error);
  if (failingResult && "error" in failingResult && failingResult.error) {
    throw failingResult.error;
  }
}

export async function uploadLeads(
  records: ApiLeadImportRecord[],
  currentUser: User,
  assignToUserId?: string,
  campaign?: LeadUploadCampaignInput,
) {
  const client = requireSupabaseClient();
  let duplicates = 0;
  let invalidRows = 0;
  const normalizedCampaignSourceKey = campaign?.sourceKey
    ? normalizeCampaignSourceKey(campaign.sourceKey)
    : null;
  const normalizedCampaignName = campaign?.name
    ? formatCampaignName(campaign.name)
    : normalizedCampaignSourceKey
      ? formatCampaignName(normalizedCampaignSourceKey)
      : null;
  const normalizedRecords = records.map((record) => {
    const dialablePhones = normalizeLeadImportPhoneFields({
      phone: record.phone,
      altPhone: record.altPhone,
      phoneNumbers: record.phoneNumbers,
    });

    return {
      record,
      dialablePhones,
      normalizedEmail: record.email.trim().toLowerCase(),
    };
  });

  const normalizedPhones = normalizedRecords.flatMap(({ dialablePhones }) => dialablePhones.phoneNumbers).filter(Boolean);
  const normalizedEmails = normalizedRecords.map(({ normalizedEmail }) => normalizedEmail).filter(Boolean);

  const [existingByPhoneResult, existingByAltPhoneResult, existingByEmailResult] = await Promise.all([
    normalizedPhones.length
      ? client.from("leads").select("phone, alt_phone").in("phone", normalizedPhones)
      : Promise.resolve({ data: [], error: null }),
    normalizedPhones.length
      ? client.from("leads").select("phone, alt_phone").in("alt_phone", normalizedPhones)
      : Promise.resolve({ data: [], error: null }),
    normalizedEmails.length
      ? client.from("leads").select("email").in("email", normalizedEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (existingByPhoneResult.error) throw existingByPhoneResult.error;
  if (existingByAltPhoneResult.error) throw existingByAltPhoneResult.error;
  if (existingByEmailResult.error) throw existingByEmailResult.error;

  const existingPhoneRows = [
    ...((existingByPhoneResult.data ?? []) as Array<{ phone: string | null; alt_phone: string | null }>),
    ...((existingByAltPhoneResult.data ?? []) as Array<{ phone: string | null; alt_phone: string | null }>),
  ];
  const existingPhones = new Set(
    existingPhoneRows.flatMap((row) =>
      buildLeadDialNumbers({ phone: row.phone ?? "", altPhone: row.alt_phone ?? "" }),
    ),
  );
  const existingEmails = new Set(
    ((existingByEmailResult.data ?? []) as Array<{ email: string | null }>)
      .map((row) => row.email?.toLowerCase() ?? "")
      .filter(Boolean),
  );

  const rows = normalizedRecords.flatMap(({ record, dialablePhones, normalizedEmail }) => {
    if (!record.fullName.trim() || !dialablePhones.phoneNumbers.length) {
      invalidRows += 1;
      return [];
    }

    const normalizedPhone = dialablePhones.phone;
    const normalizedAltPhone = dialablePhones.altPhone;
    if (
      existingPhones.has(normalizedPhone) ||
      (normalizedAltPhone && existingPhones.has(normalizedAltPhone)) ||
      (normalizedEmail && existingEmails.has(normalizedEmail))
    ) {
      duplicates += 1;
      return [];
    }

    existingPhones.add(normalizedPhone);
    if (normalizedAltPhone) {
      existingPhones.add(normalizedAltPhone);
    }
    if (normalizedEmail) {
      existingEmails.add(normalizedEmail);
    }

    return [
      {
        full_name: record.fullName.trim(),
        phone: normalizedPhone,
        alt_phone: normalizedAltPhone || null,
        phone_numbers: dialablePhones.phoneNumbers,
        email: normalizedEmail || null,
        company:
          getLeadCompanyName({
            fullName: record.fullName.trim(),
            company: record.company.trim(),
          }) || null,
        job_title: record.jobTitle.trim() || null,
        location: record.location.trim() || null,
        source: normalizedCampaignSourceKey ?? (record.source.trim() || "Bulk Import"),
        interest: record.interest.trim() || null,
        status: record.status,
        notes: record.notes.trim() || null,
        last_contacted: record.lastContacted || null,
        assigned_agent: currentUser.role === "agent" ? currentUser.id : assignToUserId ?? null,
        callback_time: record.callbackTime || null,
        priority: record.priority,
        lead_score: 60,
      },
    ];
  });

  if (rows.length) {
    const { data, error } = await client.from("leads").insert(rows).select("id");
    if (error) throw error;

    const insertedIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (insertedIds.length) {
      const [tagInsert, activityInsert] = await Promise.all([
        client.from("lead_tags").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            label: "bulk-import",
          })),
        ),
        client.from("activity_logs").insert(
          insertedIds.map((leadId) => ({
            lead_id: leadId,
            actor_id: currentUser.id,
            activity_type: "status",
            title: "Lead imported",
            description: "Imported from spreadsheet and added to the calling queue.",
          })),
        ),
      ]);

      if (tagInsert.error) throw tagInsert.error;
      if (activityInsert.error) throw activityInsert.error;
    }

    const campaignSeeds = new Map<string, string>();
    if (normalizedCampaignSourceKey) {
      campaignSeeds.set(
        normalizedCampaignSourceKey,
        normalizedCampaignName ?? formatCampaignName(normalizedCampaignSourceKey),
      );
    } else {
      normalizedRecords.forEach(({ record }) => {
        const sourceKey = normalizeCampaignSourceKey(record.source);
        if (!campaignSeeds.has(sourceKey)) {
          campaignSeeds.set(sourceKey, formatCampaignName(record.source));
        }
      });
    }

    if (campaignSeeds.size) {
      const { error: campaignError } = await client.from("campaigns").upsert(
        Array.from(campaignSeeds.entries()).map(([sourceKey, name]) => ({
          name,
          source_key: sourceKey,
          updated_at: new Date().toISOString(),
        })),
        {
          onConflict: "source_key",
        },
      );

      if (campaignError && !isMissingSupabaseTableError(campaignError)) {
        throw campaignError;
      }
    }
  }

  return {
    added: rows.length,
    duplicates,
    invalidRows,
  } satisfies UploadResult;
}

export async function assignLead(leadId: string, userId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);

  const { data: assignee, error: assigneeError } = await client
    .from("app_users")
    .select("id, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (assigneeError) throw assigneeError;
  if (!assignee) {
    throw new Error("Assignee not found");
  }

  const { error } = await client
    .from("leads")
    .update({ assigned_agent: userId, updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;

  const { error: activityError } = await client.from("activity_logs").insert({
    lead_id: leadId,
    actor_id: currentUser.id,
    activity_type: "status",
    title: "Lead reassigned",
    description: `Lead assigned to ${assignee.full_name}.`,
  });
  if (activityError) throw activityError;
}

export async function updateLead(leadId: string, input: LeadUpdateInput, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(leadId);

  const normalizedFullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
  const normalizedEmail = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const normalizedCompany = typeof input.company === "string" ? input.company.trim() : "";
  const normalizedJobTitle = typeof input.jobTitle === "string" ? input.jobTitle.trim() : "";
  const normalizedLocation = typeof input.location === "string" ? input.location.trim() : "";
  const normalizedAssignedAgentId =
    typeof input.assignedAgentId === "string" && input.assignedAgentId.trim()
      ? input.assignedAgentId.trim()
      : null;
  const parsedLastContacted =
    typeof input.lastContacted === "string" && input.lastContacted.trim()
      ? new Date(input.lastContacted)
      : null;
  const normalizedLastContacted =
    parsedLastContacted && Number.isFinite(parsedLastContacted.getTime())
      ? parsedLastContacted.toISOString()
      : null;
  const sourcePhoneNumbers =
    input.phoneNumbers?.length && input.phoneNumbers.length > 0
      ? input.phoneNumbers
      : [input.phone ?? lead.phone ?? "", input.altPhone ?? lead.alt_phone ?? "", ...(lead.phone_numbers?.slice(2) ?? [])];
  const normalizedPhones = normalizeLeadImportPhoneFields({
    phone: typeof input.phone === "string" ? input.phone : lead.phone,
    altPhone: typeof input.altPhone === "string" ? input.altPhone : (lead.alt_phone ?? ""),
    phoneNumbers: sourcePhoneNumbers,
  });

  if (!normalizedPhones.phoneNumbers.length) {
    throw new Error("At least one phone number is required.");
  }

  let assigneeName: string | null = null;
  if (normalizedAssignedAgentId) {
    const { data: assignee, error: assigneeError } = await client
      .from("app_users")
      .select("id, full_name")
      .eq("id", normalizedAssignedAgentId)
      .maybeSingle();
    if (assigneeError) throw assigneeError;
    if (!assignee) {
      throw new Error("Assigned agent not found");
    }

    assigneeName = assignee.full_name;
  }

  const nextEmail = normalizedEmail || null;
  const nextCompany = normalizedCompany || null;
  const nextLocation = normalizedLocation || null;

  const { error } = await client
    .from("leads")
    .update({
      full_name: normalizedFullName || lead.full_name,
      phone: normalizedPhones.phone,
      alt_phone: normalizedPhones.altPhone || null,
      phone_numbers: normalizedPhones.phoneNumbers,
      email: nextEmail,
      company: nextCompany,
      job_title: normalizedJobTitle || null,
      location: nextLocation,
      assigned_agent: normalizedAssignedAgentId,
      last_contacted: normalizedLastContacted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw error;

  const changedFields: string[] = [];
  if ((lead.full_name ?? "") !== (normalizedFullName || lead.full_name)) {
    changedFields.push("name");
  }
  if ((lead.phone ?? "") !== normalizedPhones.phone) {
    changedFields.push("phone");
  }
  if ((lead.alt_phone ?? "") !== (normalizedPhones.altPhone || "")) {
    changedFields.push("alt phone");
  }
  if ((lead.email ?? "") !== (nextEmail ?? "")) {
    changedFields.push("email");
  }
  if ((lead.company ?? "") !== (nextCompany ?? "")) {
    changedFields.push("company");
  }
  if ((lead.job_title ?? "") !== (normalizedJobTitle || "")) {
    changedFields.push("designation");
  }
  if ((lead.location ?? "") !== (nextLocation ?? "")) {
    changedFields.push("location");
  }
  if ((lead.assigned_agent ?? null) !== normalizedAssignedAgentId) {
    changedFields.push("assigned agent");
  }
  if ((lead.last_contacted ?? null) !== normalizedLastContacted) {
    changedFields.push("last contacted");
  }

  const descriptionParts: string[] = [];
  if (changedFields.length) {
    descriptionParts.push(`Updated ${changedFields.join(", ")}.`);
  } else {
    descriptionParts.push("Updated contact details.");
  }

  if ((lead.assigned_agent ?? null) !== normalizedAssignedAgentId) {
    descriptionParts.push(
      normalizedAssignedAgentId
        ? `Assigned to ${assigneeName ?? "the selected agent"}.`
        : "Unassigned the lead.",
    );
  }

  const { error: activityError } = await client.from("activity_logs").insert({
    lead_id: leadId,
    actor_id: currentUser.id,
    activity_type: "status",
    title: "Lead details updated",
    description: descriptionParts.join(" "),
  });
  if (activityError) throw activityError;
}

function assertCampaignManagementAccess(currentUser: User) {
  if (currentUser.role === "agent") {
    throw new Error("Campaign management is restricted to admins and team leaders.");
  }
}

async function ensureCampaignAccess(campaignId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("campaigns")
    .select("id, name, source_key, assigned_user_id, is_active, allow_auto_dial, created_at, updated_at")
    .eq("id", campaignId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Campaign not found.");
  }

  return data as DbCampaignRow;
}

async function syncCampaignLeads(sourceKey: string, assignedUserId: string | null, currentUser: User) {
  const client = requireSupabaseClient();
  const normalizedSourceKey = normalizeCampaignSourceKey(sourceKey);
  const { data: leads, error: leadLookupError } = await client
    .from("leads")
    .select("id, source")
    .ilike("source", normalizedSourceKey === "uncategorized" ? "%" : sourceKey);

  if (leadLookupError) {
    throw leadLookupError;
  }

  const matchingLeadIds = ((leads ?? []) as Array<{ id: string; source: string | null }>).filter((lead) =>
    getLeadCampaignSourceKey({ source: lead.source } as DbLeadRow) === normalizedSourceKey,
  ).map((lead) => lead.id);

  if (matchingLeadIds.length) {
    const { error } = await client
      .from("leads")
      .update({
        assigned_agent: assignedUserId,
        updated_at: new Date().toISOString(),
      })
      .in("id", matchingLeadIds);

    if (error) {
      throw error;
    }

    const { error: activityError } = await client.from("activity_logs").insert(
      matchingLeadIds.map((leadId) => ({
        lead_id: leadId,
        actor_id: currentUser.id,
        activity_type: "status",
        title: "Campaign assignment updated",
        description: assignedUserId
          ? "Assigned through campaign ownership."
          : "Campaign owner cleared.",
      })),
    );

    if (activityError) {
      throw activityError;
    }
  }
}

export async function createCampaign(
  input: CampaignCreateInput,
  currentUser: User,
) {
  assertCampaignManagementAccess(currentUser);
  const client = requireSupabaseClient();
  const now = new Date().toISOString();
  const sourceKey = normalizeCampaignSourceKey(input.sourceKey);
  const name = formatCampaignName(input.name);

  const { data, error } = await client
    .from("campaigns")
    .upsert(
      {
        name,
        source_key: sourceKey,
        assigned_user_id: input.assignedUserId ?? null,
        is_active: input.isActive ?? true,
        allow_auto_dial: input.allowAutoDial ?? true,
        updated_at: now,
      },
      { onConflict: "source_key" },
    )
    .select("id, name, source_key, assigned_user_id, is_active, allow_auto_dial, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Unable to create campaign.");
  }

  if (input.assignedUserId) {
    await syncCampaignLeads(sourceKey, input.assignedUserId, currentUser);
  }

  return data as DbCampaignRow;
}

export async function updateCampaign(
  campaignId: string,
  input: CampaignUpdateInput,
  currentUser: User,
) {
  assertCampaignManagementAccess(currentUser);
  const client = requireSupabaseClient();
  const existing = await ensureCampaignAccess(campaignId);
  const nextName = typeof input.name === "string" && input.name.trim() ? input.name.trim() : existing.name;
  const nextIsActive = typeof input.isActive === "boolean" ? input.isActive : existing.is_active;
  const nextAllowAutoDial =
    typeof input.allowAutoDial === "boolean" ? input.allowAutoDial : existing.allow_auto_dial;

  if (currentUser.role !== "admin" && typeof input.isActive === "boolean" && input.isActive !== existing.is_active) {
    throw new Error("Only admins can activate or deactivate campaigns.");
  }

  const { data, error } = await client
    .from("campaigns")
    .update({
      name: nextName,
      is_active: nextIsActive,
      allow_auto_dial: nextAllowAutoDial,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("id, name, source_key, assigned_user_id, is_active, allow_auto_dial, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Unable to update campaign.");
  }

  return data as DbCampaignRow;
}

export async function assignCampaign(
  campaignId: string,
  userId: string | null,
  currentUser: User,
) {
  assertCampaignManagementAccess(currentUser);
  const client = requireSupabaseClient();
  const existing = await ensureCampaignAccess(campaignId);

  if (userId) {
    const { data: assignee, error: assigneeError } = await client
      .from("app_users")
      .select("id, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (assigneeError) {
      throw assigneeError;
    }
    if (!assignee) {
      throw new Error("Assignee not found.");
    }
  }

  const { data, error } = await client
    .from("campaigns")
    .update({
      assigned_user_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("id, name, source_key, assigned_user_id, is_active, allow_auto_dial, created_at, updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Unable to update campaign assignment.");
  }

  await syncCampaignLeads(existing.source_key, userId, currentUser);
  return data as DbCampaignRow;
}

export async function deleteCampaign(campaignId: string, currentUser: User) {
  assertCampaignManagementAccess(currentUser);
  const client = requireSupabaseClient();
  await ensureCampaignAccess(campaignId);
  const { error } = await client.from("campaigns").delete().eq("id", campaignId);
  if (error) {
    throw error;
  }
}

export async function bulkUpdateLeadStatus(leadIds: string[], status: ApiLeadStatus, currentUser: User) {
  const client = requireSupabaseClient();
  if (!leadIds.length) {
    return 0;
  }

  const { error } = await client
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", leadIds);
  if (error) throw error;

  const { error: activityError } = await client.from("activity_logs").insert(
    leadIds.map((leadId) => ({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Bulk status update",
      description: `Lead moved to ${status.replace("_", " ")}.`,
    })),
  );
  if (activityError) throw activityError;

  return leadIds.length;
}

export async function deleteLeads(leadIds: string[], currentUser: User) {
  const client = requireSupabaseClient();
  if (!leadIds.length) {
    return 0;
  }

  const { error } = await client.from("leads").delete().in("id", leadIds);
  if (error) throw error;

  return leadIds.length;
}

export async function createCallLog(input: CreateCallLogInput, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callInsert, leadUpdate] = await Promise.all([
    client.from("call_logs").insert({
      lead_id: input.leadId,
      agent_id: currentUser.id,
      direction: input.callType,
      disposition,
      duration_seconds: input.durationSeconds,
      call_status: input.status,
      recording_enabled: false,
      recording_url: null,
      outcome_summary: aiAssist.aiSummary,
      notes: input.notes.trim() || null,
    }),
    client
      .from("leads")
      .update({
        last_contacted: now,
        callback_time: input.callbackAt || null,
        priority: input.priority,
        status: leadStatusFromCallStatus(input.status),
        notes: input.notes.trim() || lead.notes,
        updated_at: now,
      })
      .eq("id", input.leadId),
  ]);

  if (callInsert.error) throw callInsert.error;
  if (leadUpdate.error) throw leadUpdate.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: `${input.callType === "incoming" ? "Incoming" : "Outgoing"} call logged`,
      description: aiAssist.aiSummary,
    }),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", input.leadId)
      .eq("status", "scheduled"),
  ];

  if (input.notes.trim()) {
    operations.push(
      client.from("lead_notes").insert({
        lead_id: input.leadId,
        author_id: currentUser.id,
        note_body: input.notes.trim(),
      }),
    );
  }

  if (input.callbackAt) {
    operations.push(
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => "error" in result && result.error);
  if (failure && "error" in failure && failure.error) {
    throw failure.error;
  }
}

export async function updateCallLog(callId: string, input: CreateCallLogInput, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(input.leadId);
  const existingCall = await ensureCallLogAccess(callId);
  void existingCall;
  const now = new Date().toISOString();
  const disposition = dispositionFromCallStatus(input.status);
  const aiAssist = buildAiAssist({
    notes: input.notes,
    status: input.status,
    disposition,
    callbackAt: input.callbackAt || null,
  });

  const [callUpdate, leadUpdate] = await Promise.all([
    client
      .from("call_logs")
      .update({
        lead_id: input.leadId,
        direction: input.callType,
        disposition,
        duration_seconds: input.durationSeconds,
        call_status: input.status,
        outcome_summary: aiAssist.aiSummary,
        notes: input.notes.trim() || null,
      })
      .eq("id", callId),
    client
      .from("leads")
      .update({
        callback_time: input.callbackAt || null,
        priority: input.priority,
        status: leadStatusFromCallStatus(input.status),
        notes: input.notes.trim() || lead.notes,
        updated_at: now,
      })
      .eq("id", input.leadId),
  ]);

  if (callUpdate.error) throw callUpdate.error;
  if (leadUpdate.error) throw leadUpdate.error;

  const operations: Array<PromiseLike<{ error: unknown | null }>> = [
    client.from("activity_logs").insert({
      lead_id: input.leadId,
      actor_id: currentUser.id,
      activity_type: input.status === "follow_up" ? "callback" : "call",
      title: "Call log updated",
      description: aiAssist.aiSummary,
    }),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", input.leadId)
      .eq("status", "scheduled"),
  ];

  if (input.callbackAt) {
    operations.push(
      client.from("callbacks").insert({
        lead_id: input.leadId,
        owner_id: currentUser.id,
        scheduled_for: input.callbackAt,
        priority: input.priority,
        status: "scheduled",
      }),
    );
  }

  const results = await Promise.all(operations);
  const failure = results.find((result) => "error" in result && result.error);
  if (failure && "error" in failure && failure.error) {
    throw failure.error;
  }
}

export async function deleteCallLog(callId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const callLog = await ensureCallLogAccess(callId);
  const { error } = await client.from("call_logs").delete().eq("id", callId);
  if (error) throw error;
  void currentUser;
  void callLog;
}

export async function deleteCallLogs(callIds: string[], currentUser: User) {
  const client = requireSupabaseClient();
  if (!callIds.length) {
    return 0;
  }

  await Promise.all(callIds.map((callId) => ensureCallLogAccess(callId)));
  const { error } = await client.from("call_logs").delete().in("id", callIds);
  if (error) throw error;
  void currentUser;
  return callIds.length;
}

export async function rescheduleCallback(leadId: string, callbackAt: string, priority: ApiLeadPriority, currentUser: User) {
  const client = requireSupabaseClient();
  const lead = await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, callbackInsert, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        last_disposition: "Call Back Later",
        last_disposition_main: "CALLBACK",
        last_disposition_sub: "CALL_BACK_LATER",
        last_attempted_at: now,
        last_contacted_at: now,
        contact_attempt_count: Math.max(0, (lead.contact_attempt_count ?? 0) + 1),
        connected_attempt_count: Math.max(0, (lead.connected_attempt_count ?? 0) + 1),
        callback_time: callbackAt,
        next_callback_at: callbackAt,
        next_follow_up_at: null,
        next_eligible_at: callbackAt,
        callback_priority: priority,
        not_interested_reason: null,
        is_dnc: Boolean(lead.is_dnc),
        is_invalid_number: Boolean(lead.is_invalid_number),
        priority,
        status: "callback_due",
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("callbacks").insert({
      lead_id: leadId,
      owner_id: currentUser.id,
      scheduled_for: callbackAt,
      priority,
      status: "scheduled",
    }),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback rescheduled",
      description: `Callback moved to ${callbackAt}.`,
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (callbackInsert.error) throw callbackInsert.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function markCallbackCompleted(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        callback_time: null,
        next_callback_at: null,
        next_follow_up_at: null,
        next_eligible_at: null,
        status: "contacted",
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "completed",
        completed_at: now,
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "callback",
      title: "Callback completed",
      description: "Scheduled callback was completed and removed from queue.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

export async function reopenLead(leadId: string, currentUser: User) {
  const client = requireSupabaseClient();
  await ensureLeadAccess(leadId);
  const now = new Date().toISOString();

  const [leadUpdate, callbackUpdate, activityInsert] = await Promise.all([
    client
      .from("leads")
      .update({
        status: "follow_up",
        callback_time: null,
        next_callback_at: null,
        next_follow_up_at: null,
        next_eligible_at: now,
        updated_at: now,
      })
      .eq("id", leadId),
    client
      .from("callbacks")
      .update({
        status: "cancelled",
        updated_at: now,
      })
      .eq("lead_id", leadId)
      .eq("status", "scheduled"),
    client.from("activity_logs").insert({
      lead_id: leadId,
      actor_id: currentUser.id,
      activity_type: "status",
      title: "Lead reopened",
      description: "Lead moved back into the follow-up queue.",
    }),
  ]);

  if (leadUpdate.error) throw leadUpdate.error;
  if (callbackUpdate.error) throw callbackUpdate.error;
  if (activityInsert.error) throw activityInsert.error;
}

async function callWorkspaceUsersFunction<T>(
  action: "create" | "delete",
  payload: Record<string, unknown>,
) {
  const client = requireSupabaseClient();
  const { data, error } = await client.functions.invoke("workspace-users", {
    body: { action, ...payload },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as T;
}

export async function inviteWorkspaceUser(input: {
  name: string;
  email: string;
  role: User["role"];
  team: string;
  timezone: string;
  title: string;
}) {
  return callWorkspaceUsersFunction<{
    user: User;
    temporaryPassword: string;
  }>("create", input);
}

export async function deleteWorkspaceUser(userId: string) {
  await callWorkspaceUsersFunction("delete", { userId });
}

export async function updateWorkspaceUserStatus(userId: string, status: User["status"], currentUser: User) {
  const client = requireSupabaseClient();
  const { error } = await client
    .from("app_users")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  void currentUser;
}

export async function createSipProfile(input: CreateSipProfileInput, currentUser: User) {
  const client = requireSupabaseClient();
  const normalizedLabel = input.label.trim();
  const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
  const normalizedDomain = normalizeSipDomain(input.sipDomain);
  const normalizedUsername = input.sipUsername.trim();
  const normalizedPassword = input.sipPassword.trim();
  const normalizedCallerId = input.callerId.trim();
  const isShared = canManageSharedProfiles(currentUser) ? input.isShared : false;

  if (
    !normalizedLabel ||
    !normalizedUrl ||
    !normalizedDomain ||
    !normalizedUsername ||
    !normalizedPassword ||
    !normalizedCallerId
  ) {
    throw new Error("Every dial profile field is required");
  }

  const { data, error } = await client
    .from("sip_profiles")
    .insert({
      label: normalizedLabel,
      provider_url: normalizedUrl,
      sip_domain: normalizedDomain,
      sip_username: normalizedUsername,
      sip_password: normalizedPassword,
      caller_id: normalizedCallerId,
      owner_user_id: isShared ? null : currentUser.id,
      is_shared: isShared,
    })
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) throw error;

  const usersById = new Map([[currentUser.id, currentUser]]);
  return mapSipProfileRow(data as DbSipProfileRow, null, usersById);
}

export async function activateSipProfile(profileId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const row = await getSipProfileById(profileId);
  if (!row) {
    throw new Error("Dial profile not found");
  }

  const now = new Date().toISOString();
  const { error } = await client.from("user_sip_preferences").upsert(
    {
      user_id: currentUser.id,
      active_sip_profile_id: profileId,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function updateSipProfile(
  profileId: string,
  input: UpdateSipProfileInput,
  currentUser: User,
) {
  const client = requireSupabaseClient();
  const existing = await getSipProfileById(profileId);
  if (!existing) {
    throw new Error("Dial profile not found");
  }

  const normalizedLabel = input.label.trim();
  const normalizedUrl = normalizeSipProviderUrl(input.providerUrl);
  const normalizedDomain = normalizeSipDomain(input.sipDomain);
  const normalizedUsername = input.sipUsername.trim();
  const normalizedPassword = input.sipPassword?.trim() ?? "";
  const normalizedCallerId = input.callerId.trim();
  const isShared = canManageSharedProfiles(currentUser) ? input.isShared : existing.is_shared;

  if (
    !normalizedLabel ||
    !normalizedUrl ||
    !normalizedDomain ||
    !normalizedUsername ||
    !normalizedCallerId
  ) {
    throw new Error("Every dial profile field except password is required");
  }

  const updatePayload: Record<string, string | boolean | null> = {
    label: normalizedLabel,
    provider_url: normalizedUrl,
    sip_domain: normalizedDomain,
    sip_username: normalizedUsername,
    caller_id: normalizedCallerId,
    is_shared: isShared,
    owner_user_id: isShared ? null : existing.owner_user_id,
  };

  if (normalizedPassword) {
    updatePayload.sip_password = normalizedPassword;
  }

  const { data, error } = await client
    .from("sip_profiles")
    .update(updatePayload)
    .eq("id", profileId)
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .single();

  if (error) throw error;

  const usersById = new Map([[currentUser.id, currentUser]]);
  return mapSipProfileRow(data as DbSipProfileRow, profileId, usersById);
}

export async function deleteSipProfile(profileId: string, currentUser: User) {
  const client = requireSupabaseClient();
  const existing = await getSipProfileById(profileId);
  if (!existing) {
    throw new Error("Dial profile not found");
  }

  const { error: preferenceError } = await client
    .from("user_sip_preferences")
    .delete()
    .eq("active_sip_profile_id", profileId);
  if (preferenceError) throw preferenceError;

  const { error } = await client.from("sip_profiles").delete().eq("id", profileId);
  if (error) throw error;

  void currentUser;
}

export async function assignSipProfileToUser(userId: string, profileId: string | null) {
  const client = requireSupabaseClient();
  if (!profileId) {
    const { error } = await client.from("user_sip_preferences").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }

  const row = await getSipProfileById(profileId);
  if (!row) {
    throw new Error("Dial profile not found");
  }

  const now = new Date().toISOString();
  const { error } = await client.from("user_sip_preferences").upsert(
    {
      user_id: userId,
      active_sip_profile_id: profileId,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

async function getSipProfileById(profileId: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from("sip_profiles")
    .select(
      "id, label, provider_url, sip_domain, sip_username, sip_password, caller_id, owner_user_id, is_shared, created_at, updated_at",
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DbSipProfileRow | null) ?? null;
}
