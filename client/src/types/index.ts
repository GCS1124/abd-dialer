export type UserRole = "admin" | "team_leader" | "agent";

export type ThemeMode = "light" | "dark";

export type LeadPriority = "Low" | "Medium" | "High" | "Urgent";

export type QueueSort = "priority" | "newest" | "callback_due";

export type QueueFilter = "all" | LeadStatus;

export type LeadStatus =
  | "new"
  | "contacted"
  | "callback_due"
  | "follow_up"
  | "qualified"
  | "appointment_booked"
  | "closed_won"
  | "closed_lost"
  | "invalid";

export type CallDisposition =
  | "No Answer"
  | "Busy"
  | "Voicemail"
  | "Call Failed"
  | "Switched Off"
  | "Not Reachable"
  | "Disconnected"
  | "Network Issue"
  | "Wrong Number"
  | "Not Interested"
  | "Existing Customer"
  | "DNC"
  | "Interested"
  | "Call Back Later"
  | "Follow-Up Required"
  | "Appointment Booked"
  | "Sale Closed"
  | "Failed Attempt"
  | "Rpc hung"
  | "Not available"
  | "Already have team"
  | "Already have yelp account"
  | "3rd party hung up";

export type DialerMainDisposition =
  | "NOT_CONNECTED"
  | "CALLBACK"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "EXISTING_CUSTOMER"
  | "INVALID_LEAD"
  | "DO_NOT_CALL"
  | "CLOSED";

export type DialerSubDisposition =
  | "NO_ANSWER"
  | "VOICEMAIL"
  | "BUSY"
  | "SWITCHED_OFF"
  | "NOT_REACHABLE"
  | "CALL_FAILED"
  | "DISCONNECTED"
  | "NETWORK_ISSUE"
  | "CALL_BACK_LATER"
  | "REQUESTED_CALLBACK"
  | "FOLLOW_UP_REQUIRED"
  | "INTERESTED"
  | "MEETING_VISIT_DEMO_SCHEDULED"
  | "PROPOSAL_SHARED"
  | "PENDING_DECISION"
  | "NEGOTIATION"
  | "PRICE_ISSUE"
  | "NO_REQUIREMENT"
  | "ALREADY_HAVE_VENDOR_SERVICE"
  | "NOT_INTERESTED_OTHER"
  | "EXISTING_CUSTOMER"
  | "WRONG_NUMBER"
  | "INVALID_NUMBER"
  | "DUPLICATE_LEAD"
  | "DNC_REQUESTED"
  | "DO_NOT_CALL"
  | "OPTED_OUT"
  | "WON"
  | "LOST";

export type DialerQueueAction =
  | "RETRY_NEXT_DAY"
  | "SCHEDULE_CALLBACK"
  | "MOVE_TO_PIPELINE"
  | "COOLDOWN_3_DAYS"
  | "REMOVE_FROM_COLD_QUEUE"
  | "REMOVE_FROM_QUEUE"
  | "PERMANENTLY_EXCLUDE"
  | "REMOVE_FROM_ACTIVE_QUEUE";

export type CallType = "incoming" | "outgoing";

export type CallLogStatus = "connected" | "missed" | "follow_up" | "failed";

export type CallSentiment = "positive" | "neutral" | "negative";

export type CallTransportMode = "browser_softphone";

export type CallLifecycleState = "idle" | "ringing" | "connected" | "ending" | "failed";

export type CallAttemptFailureStage =
  | "session_unavailable"
  | "session_start"
  | "invite"
  | "microphone"
  | "server_disconnect"
  | "sip_reject"
  | "hangup_before_connect"
  | "unknown";

export type CallActivityType =
  | "call"
  | "note"
  | "callback"
  | "status"
  | "appointment"
  | "sale";

export type CallControlStatus =
  | "idle"
  | "ringing"
  | "connected"
  | "manual"
  | "on_hold"
  | "ended";

export type BreakType = "freshen_up" | "lunch" | "tea" | "meeting_training";

export type TimeTrackingStatus = "checked_out" | "checked_in" | "on_break";

export interface TimeTrackingState {
  status: TimeTrackingStatus;
  checkedInAt: string | null;
  breakStartedAt: string | null;
  breakType: BreakType | null;
  wrapUpStartedAt: string | null;
  activeSessionSeconds: number;
  activeBreakSeconds: number;
  activeWrapUpSeconds: number;
  hasCheckedIn: boolean;
  breakUsageCounts: Record<BreakType, number>;
  breakDurationsSeconds: Record<BreakType, number>;
  lastUpdatedAt: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: string;
  timezone: string;
  avatar: string;
  title: string;
  status: "online" | "away" | "offline";
  activeSipProfileId?: string | null;
  activeSipProfileLabel?: string | null;
  mustResetPassword?: boolean;
}

export interface NoteEntry {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

export interface CallLog {
  id: string;
  leadId: string;
  leadName: string;
  phone: string;
  createdAt: string;
  agentId: string;
  agentName: string;
  callType: CallType;
  durationSeconds: number;
  disposition: CallDisposition;
  mainDisposition?: DialerMainDisposition | null;
  subDisposition?: DialerSubDisposition | null;
  status: CallLogStatus;
  source?: "call_log" | "failed_attempt";
  failureStage?: CallAttemptFailureStage;
  sipStatus?: number | null;
  sipReason?: string | null;
  failureMessage?: string | null;
  notes: string;
  recordingEnabled: boolean;
  recordingUrl?: string | null;
  outcomeSummary: string;
  aiSummary: string;
  sentiment: CallSentiment;
  suggestedNextAction: string;
  followUpAt: string | null;
}

export interface LeadActivity {
  id: string;
  type: CallActivityType;
  title: string;
  description: string;
  createdAt: string;
  actorName: string;
}

export interface Campaign {
  id: string;
  name: string;
  sourceKey: string;
  assignedUserId: string | null;
  assignedUserName: string;
  isActive: boolean;
  allowAutoDial: boolean;
  leadCount: number;
  activeLeadCount: number;
  callbackCount: number;
  untouchedCount: number;
  staleCount: number;
  recentLeadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  fullName: string;
  phone: string;
  altPhone: string;
  phoneNumbers?: string[];
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: LeadStatus;
  notes: string;
  lastContacted: string | null;
  lastDisposition?: CallDisposition | null;
  lastDispositionMain?: DialerMainDisposition | null;
  lastDispositionSub?: DialerSubDisposition | null;
  lastAttemptedAt?: string | null;
  lastContactedAt?: string | null;
  contactAttemptCount?: number;
  connectedAttemptCount?: number;
  nextEligibleAt?: string | null;
  nextCallbackAt?: string | null;
  nextFollowUpAt?: string | null;
  callbackPriority?: LeadPriority;
  notInterestedReason?: string | null;
  isDnc?: boolean;
  isInvalidNumber?: boolean;
  assignedAgentId: string;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: LeadPriority;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  callHistory: CallLog[];
  notesHistory: NoteEntry[];
  activities: LeadActivity[];
  leadScore: number;
  timezone: string;
}

export interface ActiveCall {
  leadId: string | null;
  dialedNumber: string;
  displayName: string;
  startedAt: number;
  status: CallControlStatus;
  muted: boolean;
  recordingEnabled: boolean;
  direction?: CallType;
  callId?: string | null;
  transportMode?: CallTransportMode;
  lifecycleState?: CallLifecycleState;
}

export interface SaveDispositionInput {
  disposition: CallDisposition;
  mainDisposition?: DialerMainDisposition | null;
  subDisposition?: DialerSubDisposition | null;
  notes: string;
  callbackAt: string;
  followUpPriority: LeadPriority;
  outcomeSummary: string;
  followUpAt?: string;
  callbackPriority?: LeadPriority;
  notInterestedReason?: string;
  nextStep?: string;
  callType?: CallType;
  ringcentralSessionId?: string | null;
}

export interface CallLogFormInput {
  leadId: string;
  callType: CallType;
  durationSeconds: number;
  status: CallLogStatus;
  notes: string;
  callbackAt: string;
  priority: LeadPriority;
}

export interface LeadImportRecord {
  fullName: string;
  phone: string;
  altPhone: string;
  phoneNumbers?: string[];
  email: string;
  company: string;
  jobTitle: string;
  location: string;
  source: string;
  interest: string;
  status: LeadStatus;
  notes: string;
  lastContacted: string | null;
  assignedAgentName: string;
  callbackTime: string | null;
  priority: LeadPriority;
}

export interface LeadUpdateInput {
  fullName?: string;
  phone?: string;
  altPhone?: string;
  phoneNumbers?: string[];
  email?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  assignedAgentId?: string | null;
  lastContacted?: string | null;
}

export interface CampaignUpdateInput {
  name?: string;
  isActive?: boolean;
  allowAutoDial?: boolean;
}

export interface CampaignCreateInput {
  name: string;
  sourceKey: string;
  assignedUserId?: string | null;
  isActive?: boolean;
  allowAutoDial?: boolean;
}

export interface LeadUploadCampaignInput {
  name: string;
  sourceKey: string;
}

export interface UploadResult {
  added: number;
  duplicates: number;
  invalidRows: number;
}

export interface AgentDashboardMetrics {
  totalAssignedLeads: number;
  callsMadeToday: number;
  connectedCalls: number;
  noAnswers: number;
  callbacksScheduled: number;
  appointmentsBooked: number;
  salesClosed: number;
  conversionRate: number;
  averageCallDuration: number;
  remainingLeads: number;
}

export interface AdminDashboardMetrics {
  totalTeamCalls: number;
  connectedCalls: number;
  callbackCompletionRate: number;
  appointmentsBooked: number;
  salesClosed: number;
  activeLeads: number;
  averageCallDuration: number;
}

export interface ChartDatum {
  label: string;
  value: number;
}

export interface DailyPerformanceDatum {
  label: string;
  calls: number;
  connected: number;
}

export interface TopAgentDatum {
  id: string;
  name: string;
  role: UserRole;
  calls: number;
  conversions: number;
  callbackCompletionRate: number;
}

export type InsightTone = "slate" | "blue" | "amber" | "rose" | "emerald";

export interface FocusMetric {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: InsightTone;
}

export interface RecommendedLead {
  leadId: string;
  fullName: string;
  company: string;
  phone: string;
  priority: LeadPriority;
  status: LeadStatus;
  leadScore: number;
  callbackTime: string | null;
  reason: string;
  suggestedAction: string;
  assignedAgentName: string;
}

export interface ActivityFeedItem {
  id: string;
  leadId: string;
  leadName: string;
  type: CallActivityType;
  title: string;
  description: string;
  createdAt: string;
  actorName: string;
}

export interface RiskMetric {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: InsightTone;
}

export interface DuplicateInsight {
  id: string;
  matchType: "phone" | "email";
  value: string;
  count: number;
  leadIds: string[];
  leadNames: string[];
}

export interface WorkspaceAnalytics {
  agentMetrics: AgentDashboardMetrics | null;
  adminMetrics: AdminDashboardMetrics | null;
  callbackCounts: {
    today: number;
    overdue: number;
    upcoming: number;
  };
  performanceData: DailyPerformanceDatum[];
  dispositionData: ChartDatum[];
  pipelineData: ChartDatum[];
  statusData: ChartDatum[];
  topAgents: TopAgentDatum[];
  focusMetrics: FocusMetric[];
  recommendedLeads: RecommendedLead[];
  activityFeed: ActivityFeedItem[];
  riskMetrics: RiskMetric[];
  duplicateInsights: DuplicateInsight[];
}

export type VoiceProviderName = "ringcentral";

export interface SipProfile {
  id: string;
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  callerId: string;
  ownerUserId: string | null;
  ownerUserName: string | null;
  isShared: boolean;
  isActive: boolean;
  passwordPreview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSipProfileInput {
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword: string;
  callerId: string;
  isShared: boolean;
}

export interface UpdateSipProfileInput {
  label: string;
  providerUrl: string;
  sipDomain: string;
  sipUsername: string;
  sipPassword?: string;
  callerId: string;
  isShared: boolean;
}

export interface VoiceProviderConfig {
  provider: VoiceProviderName;
  available: boolean;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  authorizationId?: string | null;
  sipUri?: string | null;
  authorizationUsername?: string | null;
  authorizationPassword?: string | null;
  dialPrefix?: string | null;
  displayName?: string | null;
  message?: string | null;
}

export interface WorkspaceSettingsStatus {
  authMode: "supabase";
  signupEnabled: boolean;
  importFormats: string[];
  voice: {
    provider: VoiceProviderName;
    available: boolean;
    callerId: string | null;
    configuredFields: {
      websocketUrl: boolean;
      sipDomain: boolean;
      sipUsername: boolean;
      sipPassword: boolean;
      callerId: boolean;
    };
  };
  supabase: {
    connected: boolean;
    publishableKeyConfigured: boolean;
    serviceRoleConfigured: boolean;
    reason?: string | null;
    realtimeAvailable?: boolean;
  };
}

export interface RuntimeStatus {
  backend: "ok";
  dataMode: "supabase";
  signupEnabled: boolean;
  message: string;
  supabase: {
    configured: boolean;
    reachable: boolean;
    host: string | null;
    reason: string | null;
  };
  voice: {
    provider: VoiceProviderName;
    available: boolean;
  };
}

export interface WorkspacePayload {
  user: User;
  users: User[];
  leads: Lead[];
  campaigns: Campaign[];
  analytics: WorkspaceAnalytics;
  settings: WorkspaceSettingsStatus;
  voice: VoiceProviderConfig;
  sipProfiles: SipProfile[];
  activeSipProfile: SipProfile | null;
  sipProfileSelectionRequired: boolean;
}

export interface QueueCursor {
  currentLeadId: string | null;
  currentPhoneIndex: number;
}

export interface QueueItem {
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  leadId: string;
  leadName: string;
  phoneIndex: number;
  phoneNumber: string;
  numberCount: number;
  queueReason?: string | null;
}

export interface QueueProgressRecord extends QueueCursor {
  userId: string;
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  createdAt: string;
  updatedAt: string;
}

export interface QueueState {
  queueKey: string;
  queueScope: string;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentItem: QueueItem | null;
  nextItem: QueueItem | null;
  items: QueueItem[];
  progress: QueueProgressRecord | null;
  queueReason: string | null;
}

export interface SaveDispositionResponse {
  success: boolean;
  queueState?: QueueState;
  savedLead?: Lead | null;
  nextLead?: Lead | null;
  queueReason?: string | null;
}
