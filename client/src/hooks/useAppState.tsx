import {
  useCallback,
  createContext,
  useMemo,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import {
  getActiveDialerCampaigns,
  resolveDialerCampaignKey,
  shouldAutoDialCampaign,
} from "../lib/dialerCampaigns";
import {
  chooseHydratedQueueCursor,
  isQueueCursorExhausted,
  shouldResetDialerCampaignSelectionOnEnter,
  EXHAUSTED_QUEUE_PHONE_INDEX,
} from "../lib/dialerQueue";
import { apiRequest } from "../lib/api";
import { buildBrowserSoftphoneConfig } from "../lib/browserSoftphone";
import {
  createIncomingCallState,
  createOutgoingCallState,
  promoteCallToConnected,
} from "../lib/callSession";
import {
  buildIncomingAlerts,
  countUnreadIncomingAlerts,
  loadSeenIncomingAlertIds,
  saveSeenIncomingAlertIds,
  type IncomingAlertItem,
} from "../lib/incomingAlerts.ts";
import { findLeadForDialNumber } from "../lib/dialerNumbers";
import { createRingbackToneController } from "../lib/ringbackTone";
import type { RingbackAudioContextLike } from "../lib/ringbackTone";
import {
  formatDialNumberForSession,
} from "../lib/softphoneDialing";
import {
  checkIn as createCheckedInTimeTrackingState,
  checkOut as createCheckedOutTimeTrackingState,
  createInitialTimeTrackingState,
  endBreak as createEndedBreakTimeTrackingState,
  endWrapUp as createEndedWrapUpTimeTrackingState,
  getActiveWrapUpSeconds,
  getDisplayedSeconds,
  getTimeTrackingSnapshot,
  normalizeTimeTrackingState,
  shouldPersistTimeTrackingSnapshot,
  startBreak as createStartedBreakTimeTrackingState,
  startWrapUp as createStartedWrapUpTimeTrackingState,
} from "../lib/timeTracking.ts";
import { canMakeCall, getCallAccessMessage } from "../lib/callUi.ts";
import type { EmployeeActivityCalendarResponse } from "../lib/employeeActivityCalendar.ts";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import {
  beginRingCentralConnection as beginRingCentralConnectionAction,
  completeRingCentralConnection as completeRingCentralConnectionAction,
  disconnectRingCentral as disconnectRingCentralAction,
  loadRingCentralStatus as loadRingCentralStatusAction,
  saveRingCentralCallerIdNumber as saveRingCentralCallerIdNumberAction,
  syncRingCentralRecordings as syncRingCentralRecordingsAction,
  type RingCentralIntegrationStatus,
} from "../services/ringcentral";
import {
  clearRingCentralBrowserVoiceSessionCache,
} from "../services/workspace";
import {
  createRingCentralSoftphone,
  type RingCentralSoftphoneClient,
  type RingCentralSoftphoneSession,
} from "../services/ringcentralSoftphone";
import {
  isRingCentralRateLimitError,
  shouldAdvanceQueueAfterCallFailure,
} from "../lib/ringcentral";
import type {
  ActiveCall,
  CallAttemptFailureStage,
  CallLogFormInput,
  CallType,
  CreateSipProfileInput,
  Campaign,
  CampaignCreateInput,
  CampaignUpdateInput,
  Lead,
  LeadImportRecord,
  LeadPriority,
  LeadStatus,
  LeadUploadCampaignInput,
  LeadUpdateInput,
  QueueFilter,
  QueueSort,
  QueueState,
  SaveDispositionInput,
  SaveDispositionResponse,
  SipProfile,
  BreakType,
  ThemeMode,
  UpdateSipProfileInput,
  UploadResult,
  User,
  VoiceProviderConfig,
  WorkspaceAnalytics,
  WorkspaceSettingsStatus,
  WorkspacePayload,
  TimeTrackingState,
  CallTransportMode,
  QueueCursor,
} from "../types";

interface VoiceSessionResponse {
  provider: "ringcentral";
  available: boolean;
  source: "profile" | "environment" | "ringcentral" | "unconfigured";
  callerId: string | null;
  websocketUrl: string | null;
  sipDomain: string | null;
  username: string | null;
  profileId: string | null;
  profileLabel: string | null;
  authorizationId?: string | null;
  sipUri?: string;
  authorizationUsername?: string;
  authorizationPassword?: string;
  dialPrefix?: string;
  displayName?: string;
  message?: string;
}

interface InviteUserResult {
  user: User;
  temporaryPassword: string;
}

interface AuthResponse {
  token: string | null;
  refreshToken?: string | null;
  user: User;
  message?: string;
}

function buildVoiceConfigSignature(session: VoiceSessionResponse, displayName: string) {
  return JSON.stringify({
    provider: session.provider,
    websocketUrl: session.websocketUrl,
    sipDomain: session.sipDomain,
    username: session.username,
    callerId: session.callerId,
    authorizationId: session.authorizationId ?? null,
    sipUri: session.sipUri,
    displayName,
  });
}

function isMicrophoneAccessError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";

  return (
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name) ||
    /permission denied|permission dismissed|not allowed|denied by system|microphone/i.test(message)
  );
}

function isBrowserGestureRequiredError(error: unknown) {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";

  return name === "NotAllowedError" && /user gesture|required|activation/i.test(message);
}

async function ensureMicrophoneAccess() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((track) => track.stop());
}

function usePersistentState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (!stored) {
      return fallback;
    }

    try {
      return JSON.parse(stored) as T;
    } catch {
      return fallback;
    }
  });
  const fallbackRef = useRef(fallback);
  const keyRef = useRef(key);

  fallbackRef.current = fallback;

  useEffect(() => {
    if (keyRef.current === key) {
      return;
    }

    keyRef.current = key;
    const stored = localStorage.getItem(key);
    if (!stored) {
      setValue(fallbackRef.current);
      return;
    }

    try {
      setValue(JSON.parse(stored) as T);
    } catch {
      setValue(fallbackRef.current);
    }
  }, [key]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

function getQueueCursorStorageKey(userId: string | null, signature: string) {
  return userId ? `crm-dialer:queue-cursor:${userId}:${signature}` : null;
}

function readStoredQueueCursor(userId: string | null, signature: string): QueueCursor | null {
  const storageKey = getQueueCursorStorageKey(userId, signature);
  if (!storageKey || typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<QueueCursor> | null;
    const currentLeadId = typeof parsed?.currentLeadId === "string" ? parsed.currentLeadId : null;
    const currentPhoneIndex = typeof parsed?.currentPhoneIndex === "number" && Number.isFinite(parsed.currentPhoneIndex)
      ? Math.max(EXHAUSTED_QUEUE_PHONE_INDEX, Math.floor(parsed.currentPhoneIndex))
      : 0;
    if (currentLeadId) {
      return { currentLeadId, currentPhoneIndex: Math.max(0, currentPhoneIndex) };
    }

    if (currentPhoneIndex === EXHAUSTED_QUEUE_PHONE_INDEX) {
      return { currentLeadId: null, currentPhoneIndex };
    }

    return null;
  } catch {
    return null;
  }
}

function writeStoredQueueCursor(
  userId: string | null,
  signature: string,
  cursor: QueueCursor | null,
) {
  const storageKey = getQueueCursorStorageKey(userId, signature);
  if (!storageKey || typeof window === "undefined") {
    return;
  }

  if (
    !cursor ||
    (cursor.currentLeadId == null && cursor.currentPhoneIndex !== EXHAUSTED_QUEUE_PHONE_INDEX)
  ) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      currentLeadId: cursor.currentLeadId,
      currentPhoneIndex: cursor.currentLeadId
        ? Math.max(0, Math.floor(cursor.currentPhoneIndex))
        : cursor.currentPhoneIndex,
    }),
  );
}

function normalizeQueueCursor(
  queueItems: Array<{ leadId: string; phoneIndex: number }>,
  cursor: QueueCursor | null | undefined,
) {
  if (
    cursor?.currentLeadId == null &&
    cursor?.currentPhoneIndex === EXHAUSTED_QUEUE_PHONE_INDEX
  ) {
    return {
      currentLeadId: null,
      currentPhoneIndex: EXHAUSTED_QUEUE_PHONE_INDEX,
    };
  }

  if (!cursor?.currentLeadId || !queueItems.length) {
    return null;
  }

  const exactMatch = queueItems.findIndex(
    (item) => item.leadId === cursor.currentLeadId && item.phoneIndex === cursor.currentPhoneIndex,
  );
  if (exactMatch >= 0) {
    return {
      currentLeadId: queueItems[exactMatch].leadId,
      currentPhoneIndex: queueItems[exactMatch].phoneIndex,
    };
  }

  const sameLeadItems = queueItems
    .filter((item) => item.leadId === cursor.currentLeadId)
    .sort((left, right) => left.phoneIndex - right.phoneIndex);
  if (!sameLeadItems.length) {
    return null;
  }

  const sameLeadAtOrBeforeCursor = [...sameLeadItems]
    .reverse()
    .find((item) => item.phoneIndex <= cursor.currentPhoneIndex);

  const selectedItem = sameLeadAtOrBeforeCursor ?? sameLeadItems[0];
  return {
    currentLeadId: selectedItem.leadId,
    currentPhoneIndex: selectedItem.phoneIndex,
  };
}

function createBrowserRingbackToneController() {
  return createRingbackToneController({
    createAudioContext: () => {
      if (typeof window === "undefined") {
        return null;
      }

      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
        null;

      return AudioContextCtor ? (new AudioContextCtor() as unknown as RingbackAudioContextLike) : null;
    },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
}

const emptyAnalytics: WorkspaceAnalytics = {
  agentMetrics: null,
  adminMetrics: null,
  callbackCounts: {
    today: 0,
    overdue: 0,
    upcoming: 0,
  },
  performanceData: [],
  dispositionData: [],
  mainDispositionData: [],
  pipelineData: [],
  statusData: [],
  topAgents: [],
  focusMetrics: [],
  recommendedLeads: [],
  activityFeed: [],
  riskMetrics: [],
  duplicateInsights: [],
};

const emptyVoiceConfig: VoiceProviderConfig = {
  provider: "ringcentral",
  available: false,
  source: "unconfigured",
  callerId: null,
  websocketUrl: null,
  sipDomain: null,
  username: null,
  profileId: null,
  profileLabel: null,
};

const emptyRingCentralStatus: RingCentralIntegrationStatus = {
  connected: false,
  accountId: null,
  extensionId: null,
  accountMainNumber: null,
  selectedCallerIdNumber: null,
  availableCallerIdNumbers: [],
  connectedAt: null,
  updatedAt: null,
  expiresAt: null,
  message: null,
  activeTelephonySessionId: null,
  activeTelephonyPartyId: null,
  activeTelephonyDirection: null,
  activeTelephonyStatusCode: null,
  activeTelephonyUpdatedAt: null,
};

const RINGCENTRAL_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

const emptySettingsStatus: WorkspaceSettingsStatus = {
  authMode: "supabase",
  signupEnabled: false,
  importFormats: ["csv", "xlsx", "xls"],
  voice: {
    provider: "ringcentral",
    available: false,
    callerId: null,
    configuredFields: {
      websocketUrl: false,
      sipDomain: false,
      sipUsername: false,
      sipPassword: false,
      callerId: false,
    },
  },
  supabase: {
    connected: false,
    publishableKeyConfigured: false,
    serviceRoleConfigured: false,
    reason: "Workspace settings have not loaded yet.",
    realtimeAvailable: false,
  },
};

interface AppStateContextValue {
  currentUser: User | null;
  users: User[];
  leads: Lead[];
  campaigns: Campaign[];
  dialerCampaignKey: string | null;
  dialerCampaignSelectionRequired: boolean;
  analytics: WorkspaceAnalytics;
  settingsStatus: WorkspaceSettingsStatus;
  voiceConfig: VoiceProviderConfig;
  ringCentralStatus: RingCentralIntegrationStatus;
  sipProfiles: SipProfile[];
  activeSipProfile: SipProfile | null;
  sipProfileSelectionRequired: boolean;
  callError: string | null;
  theme: ThemeMode;
  sessionReady: boolean;
  workspaceLoading: boolean;
  workspaceError: string | null;
  lastWorkspaceSyncAt: string | null;
  queueState: QueueState | null;
  queueSort: QueueSort;
  queueFilter: QueueFilter;
  currentLeadId: string | null;
  currentPhoneIndex: number;
  activeCall: ActiveCall | null;
  wrapUpLeadId: string | null;
  callLaunchPending: boolean;
  autoDialEnabled: boolean;
  autoDialDelaySeconds: number;
  autoDialCountdown: number | null;
  timeTracking: TimeTrackingState;
  incomingAlerts: IncomingAlertItem[];
  unseenIncomingAlertCount: number;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  continueWithGoogle: () => Promise<{ success: boolean; message?: string }>;
  signup: (input: {
    name: string;
    email: string;
    password: string;
    team: string;
    timezone: string;
    title: string;
  }) => Promise<{ success: boolean; message?: string }>;
  changePassword: (
    password: string,
  ) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
  syncRingCentralRecordings: (
    limit?: number,
  ) => Promise<{
    checkedCount: number;
    hydratedCount: number;
    propagatedCount: number;
  }>;
  fetchEmployeeActivityCalendar: (
    employeeId: string,
    month: string,
  ) => Promise<EmployeeActivityCalendarResponse>;
  setTheme: (theme: ThemeMode) => void;
  setQueueSort: (sort: QueueSort) => void;
  setQueueFilter: (filter: QueueFilter) => void;
  setDialerCampaignKey: (campaignKey: string | null) => void;
  setAutoDialEnabled: (enabled: boolean) => void;
  setAutoDialDelaySeconds: (delay: number) => void;
  authToken: string | null;
  checkIn: () => void;
  checkOut: () => void;
  startBreak: (breakType: BreakType) => void;
  endBreak: () => void;
  markIncomingAlertsSeen: () => void;
  selectLead: (leadId: string) => void;
  previousLead: () => void;
  nextLead: () => void;
  skipLead: () => void;
  markLeadInvalid: () => Promise<void>;
  startCall: (input?: {
    phone?: string;
    leadId?: string | null;
    displayName?: string;
    phoneIndex?: number;
    allowDuringWrapUp?: boolean;
  }) => Promise<boolean>;
  toggleMute: () => void;
  holdCall: () => void;
  resumeCall: () => void;
  answerCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  refreshRingCentralStatus: (
    options?: { force?: boolean },
    tokenOverride?: string | null,
  ) => Promise<RingCentralIntegrationStatus | null>;
  connectRingCentral: () => Promise<void>;
  disconnectRingCentral: () => Promise<void>;
  setRingCentralCallerIdNumber: (callerIdNumber: string | null) => Promise<void>;
  saveDisposition: (input: SaveDispositionInput, leadIdOverride?: string) => Promise<void>;
  uploadLeads: (
    records: LeadImportRecord[],
    assignToUserId?: string,
    campaign?: LeadUploadCampaignInput,
  ) => Promise<UploadResult>;
  createCampaign: (input: CampaignCreateInput) => Promise<void>;
  updateCampaign: (campaignId: string, input: CampaignUpdateInput) => Promise<void>;
  assignCampaign: (campaignId: string, userId: string | null) => Promise<void>;
  deleteCampaign: (campaignId: string) => Promise<void>;
  updateLead: (leadId: string, input: LeadUpdateInput) => Promise<void>;
  assignLead: (leadId: string, userId: string) => Promise<void>;
  bulkUpdateLeadStatus: (leadIds: string[], status: LeadStatus) => Promise<void>;
  deleteLeads: (leadIds: string[]) => Promise<void>;
  createCallLog: (input: CallLogFormInput) => Promise<void>;
  updateCallLog: (callId: string, input: CallLogFormInput) => Promise<void>;
  deleteCallLog: (callId: string) => Promise<void>;
  deleteCallLogs: (callIds: string[]) => Promise<void>;
  rescheduleCallback: (leadId: string, callbackAt: string, priority: LeadPriority) => Promise<void>;
  markCallbackCompleted: (leadId: string) => Promise<void>;
  reopenLead: (leadId: string) => Promise<void>;
  inviteUser: (input: {
    name: string;
    email: string;
    role: User["role"];
    team: string;
    timezone: string;
    title: string;
  }) => Promise<InviteUserResult>;
  setUserStatus: (userId: string, status: User["status"]) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  createSipProfile: (
    input: CreateSipProfileInput,
    options?: { activate?: boolean },
  ) => Promise<SipProfile>;
  activateSipProfile: (profileId: string) => Promise<void>;
  updateSipProfile: (profileId: string, input: UpdateSipProfileInput) => Promise<SipProfile>;
  deleteSipProfile: (profileId: string) => Promise<void>;
  assignSipProfileToUser: (userId: string, profileId: string | null) => Promise<void>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [theme, setTheme] = usePersistentState<ThemeMode>("preview-dialer-theme", "light");
  const [authToken, setAuthToken] = usePersistentState<string | null>("preview-dialer-token", null);
  const [authRefreshToken, setAuthRefreshToken] = usePersistentState<string | null>(
    "preview-dialer-refresh-token",
    null,
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [preferredDialerCampaignKey, setPreferredDialerCampaignKey] = useState<string | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const leadsRef = useRef<Lead[]>([]);
  const [analytics, setAnalytics] = useState<WorkspaceAnalytics>(emptyAnalytics);
  const [settingsStatus, setSettingsStatus] = useState<WorkspaceSettingsStatus>(emptySettingsStatus);
  const [voiceConfig, setVoiceConfig] = useState<VoiceProviderConfig>(emptyVoiceConfig);
  const [ringCentralStatus, setRingCentralStatus] =
    useState<RingCentralIntegrationStatus>(emptyRingCentralStatus);
  const [sipProfiles, setSipProfiles] = useState<SipProfile[]>([]);
  const [activeSipProfile, setActiveSipProfile] = useState<SipProfile | null>(null);
  const [sipProfileSelectionRequired, setSipProfileSelectionRequired] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastWorkspaceSyncAt, setLastWorkspaceSyncAt] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [queueSort, setQueueSort] = useState<QueueSort>("priority");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [autoDialEnabled, setAutoDialEnabled] = usePersistentState<boolean>(
    "preview-dialer-auto-dial-enabled",
    false,
  );
  const [autoDialDelaySeconds, setAutoDialDelaySeconds] = usePersistentState<number>(
    "preview-dialer-auto-dial-delay",
    3,
  );
  const manualFirstDialStorageKey = currentUser
    ? `preview-dialer-manual-first-dial:${currentUser.id}`
    : "preview-dialer-manual-first-dial:guest";
  const [manualFirstDialRequired, setManualFirstDialRequired] = usePersistentState<boolean>(
    manualFirstDialStorageKey,
    false,
  );
  const [postWrapAutoDialDelaySeconds, setPostWrapAutoDialDelaySeconds] = useState<number | null>(
    null,
  );
  const [autoDialCountdown, setAutoDialCountdown] = useState<number | null>(null);
  const [currentLeadId, setCurrentLeadId] = useState<string | null>(null);
  const [currentPhoneIndex, setCurrentPhoneIndex] = useState(0);
  const [queueCursorHydrated, setQueueCursorHydrated] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [wrapUpLeadId, setWrapUpLeadId] = useState<string | null>(null);
  const [wrapUpDurationSeconds, setWrapUpDurationSeconds] = useState(0);
  const [callLaunchPending, setCallLaunchPending] = useState(false);
  const timeTrackingStorageKey = currentUser
    ? `preview-dialer-time-tracking:${currentUser.id}`
    : "preview-dialer-time-tracking:guest";
  const [timeTracking, setTimeTracking] = usePersistentState<TimeTrackingState>(
    timeTrackingStorageKey,
    createInitialTimeTrackingState(),
  );
  const [seenIncomingAlertIds, setSeenIncomingAlertIds] = useState<string[]>([]);
  const browserSoftphoneConfig = useMemo(
    () => buildBrowserSoftphoneConfig(voiceConfig, voiceConfig),
    [voiceConfig],
  );
  const voiceClientRef = useRef<RingCentralSoftphoneClient | null>(null);
  const voiceConfigSignatureRef = useRef<string | null>(null);
  const browserSoftphoneStartListenerRef = useRef<(() => void) | null>(null);
  const browserSoftphoneStartInProgressRef = useRef(false);
  const timeTrackingRef = useRef(timeTracking);
  const lastTimecardSyncSignatureRef = useRef<string | null>(null);
  const wrapUpLeadIdRef = useRef<string | null>(null);
  const wrapUpRingCentralSessionIdRef = useRef<string | null>(null);
  const wrapUpCallTypeRef = useRef<CallType | null>(null);
  const suppressVoiceDisconnectRef = useRef(0);
  const callLaunchPendingRef = useRef(false);
  const activeCallMetaRef = useRef<{
    leadId: string | null;
    dialedNumber: string;
    phoneIndex: number;
    startedAt: number;
    browserCallId: string | null;
    callMode: "incoming" | "outgoing";
    connected: boolean;
    browserConnected: boolean;
    userHangup: boolean;
    attemptPersisted: boolean;
    transportMode: CallTransportMode;
    sipStatusCode?: number | null;
    sipReasonPhrase?: string | null;
  } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const autoDialTimerRef = useRef<number | null>(null);
  const lastAutoDialLeadIdRef = useRef<string | null>(null);
  const notifiedCallbacksRef = useRef<Set<string>>(new Set());
  const notifiedRingCentralActivityIdsRef = useRef<Set<string>>(new Set());
  const ringCentralActivitySeededRef = useRef(false);
  const queueStateSignatureRef = useRef<string | null>(null);
  const ringbackToneRef = useRef<ReturnType<typeof createRingbackToneController> | null>(null);
  const ringCentralStatusCacheRef = useRef<{
    status: RingCentralIntegrationStatus;
    fetchedAt: number;
  } | null>(null);
  const ringCentralStatusRequestRef = useRef<Promise<RingCentralIntegrationStatus | null> | null>(
    null,
  );
  const ringCentralStatusRequestGenerationRef = useRef(0);
  const ringCentralRecordingSyncInFlightRef = useRef<Promise<void> | null>(null);
  const ringCentralRecordingLastRunAtRef = useRef(0);
  const ringCentralCallbackHandledRef = useRef(false);
  const lastDialerPathnameRef = useRef<string | null>(null);
  const dialerCampaignSelectionResetPendingRef = useRef(false);
  const dialerCampaignSelectionClearPendingRef = useRef(false);

  useEffect(() => {
    setTimeTracking((current) => normalizeTimeTrackingState(current));
  }, [setTimeTracking, timeTracking, timeTrackingStorageKey]);

  useEffect(() => {
    timeTrackingRef.current = timeTracking;
  }, [timeTracking]);

  if (!ringbackToneRef.current) {
    ringbackToneRef.current = createBrowserRingbackToneController();
  }

  currentUserRef.current = currentUser;
  leadsRef.current = leads;

  function startRingbackTone() {
    ringbackToneRef.current?.start();
  }

  function stopRingbackTone() {
    ringbackToneRef.current?.stop();
  }

  async function syncTimecardSnapshot() {
    if (!authToken || !currentUser) {
      return;
    }

    const snapshot = getTimeTrackingSnapshot(
      timeTrackingRef.current,
      new Date().toISOString(),
      currentUser.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );

    if (!shouldPersistTimeTrackingSnapshot(snapshot)) {
      return;
    }

    const signature = [
      snapshot.workDate,
      snapshot.timeOnSystemSeconds,
      snapshot.breakSeconds,
      snapshot.wrapSeconds,
      snapshot.loginHoursSeconds,
      snapshot.hasCheckedIn ? "1" : "0",
    ].join(":");

    if (lastTimecardSyncSignatureRef.current === signature) {
      return;
    }

    try {
      await apiRequest("/timecards/sync", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({ snapshot }),
      });
      lastTimecardSyncSignatureRef.current = signature;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save timecard activity.";
      setWorkspaceError(message);
    }
  }

  const activeDialerCampaigns = useMemo(() => getActiveDialerCampaigns(campaigns), [campaigns]);
  const dialerCampaignKey = useMemo(
    () => resolveDialerCampaignKey(activeDialerCampaigns, preferredDialerCampaignKey),
    [activeDialerCampaigns, preferredDialerCampaignKey],
  );
  const autoDialAllowedForQueue = useMemo(
    () => shouldAutoDialCampaign(activeDialerCampaigns, dialerCampaignKey, autoDialEnabled),
    [activeDialerCampaigns, autoDialEnabled, dialerCampaignKey],
  );
  const queueScope = dialerCampaignKey ?? "unselected";
  const queueItems = queueState?.items ?? [];
  const queue = useMemo(() => {
    if (!currentUser) {
      return [] as Lead[];
    }

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    return queueItems
      .map((item) => leadById.get(item.leadId))
      .filter((lead): lead is Lead => Boolean(lead));
  }, [currentUser, leads, queueItems]);
  const dialerCampaignSelectionRequired =
    Boolean(queueState) &&
    activeDialerCampaigns.length > 1 &&
    (!dialerCampaignKey || queueItems.length === 0);
  const incomingAlerts = useMemo(() => buildIncomingAlerts(leads), [leads]);
  const seenIncomingAlertIdSet = useMemo(
    () => new Set(seenIncomingAlertIds),
    [seenIncomingAlertIds],
  );
  const queueSignature = `${queueScope}:${queueSort}:${queueFilter}`;
  const unseenIncomingAlertCount = useMemo(
    () => countUnreadIncomingAlerts(incomingAlerts, seenIncomingAlertIdSet),
    [incomingAlerts, seenIncomingAlertIdSet],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!currentUser) {
      setSeenIncomingAlertIds([]);
      lastTimecardSyncSignatureRef.current = null;
      return;
    }

    setSeenIncomingAlertIds([...loadSeenIncomingAlertIds(currentUser.id)]);
    lastTimecardSyncSignatureRef.current = null;
  }, [currentUser?.id, currentUser?.timezone]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    saveSeenIncomingAlertIds(currentUser.id, new Set(seenIncomingAlertIds));
  }, [currentUser?.id, seenIncomingAlertIds]);

  useEffect(() => {
    if (!authToken || !currentUser) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void syncTimecardSnapshot();
    }, 150);

    const shouldAutoSync =
      timeTracking.status !== "checked_out" || Boolean(timeTracking.wrapUpStartedAt);
    const intervalId = shouldAutoSync
      ? window.setInterval(() => {
          void syncTimecardSnapshot();
        }, 30000)
      : null;

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [
    authToken,
    currentUser?.id,
    currentUser?.timezone,
    timeTracking.lastUpdatedAt,
    timeTracking.status,
    timeTracking.wrapUpStartedAt,
  ]);

  useEffect(() => {
    if (!queueCursorHydrated) {
      return;
    }

    if (!queue.length) {
      setCurrentLeadId(null);
      setCurrentPhoneIndex(0);
      if (dialerCampaignKey) {
        setPreferredDialerCampaignKey(null);
      }
      return;
    }

    if (isQueueCursorExhausted({ currentLeadId, currentPhoneIndex })) {
      setCurrentLeadId(null);
      return;
    }

    if (currentLeadId !== null && !queue.some((item) => item.id === currentLeadId)) {
      setCurrentLeadId(queue[0].id);
      setCurrentPhoneIndex(0);
      return;
    }

    if (currentLeadId === null && !dialerCampaignSelectionRequired) {
      setCurrentLeadId(queue[0].id);
      setCurrentPhoneIndex(0);
    }
  }, [
    dialerCampaignKey,
    dialerCampaignSelectionRequired,
    currentLeadId,
    currentPhoneIndex,
    queue,
    queueCursorHydrated,
  ]);

  useEffect(() => {
    const enteredDialer = location.pathname === "/dialer" && lastDialerPathnameRef.current !== "/dialer";
    if (location.pathname !== "/dialer") {
      dialerCampaignSelectionResetPendingRef.current = false;
    } else if (enteredDialer) {
      dialerCampaignSelectionResetPendingRef.current = true;
    }

    const shouldResetSelection =
      shouldResetDialerCampaignSelectionOnEnter(
        lastDialerPathnameRef.current,
        location.pathname,
        activeDialerCampaigns.length,
      ) || (location.pathname === "/dialer" && dialerCampaignSelectionResetPendingRef.current && activeDialerCampaigns.length > 1);

    lastDialerPathnameRef.current = location.pathname;

    if (shouldResetSelection) {
      setPreferredDialerCampaignKey(null);
      dialerCampaignSelectionResetPendingRef.current = false;
    }
  }, [activeDialerCampaigns.length, location.pathname]);

  function applyQueueCursor(nextCursor: QueueCursor | null) {
    const normalizedCursor = nextCursor ?? { currentLeadId: null, currentPhoneIndex: 0 };
    setCurrentLeadId(normalizedCursor.currentLeadId);
    setCurrentPhoneIndex(normalizedCursor.currentPhoneIndex);
    setQueueCursorHydrated(true);
    writeStoredQueueCursor(currentUserRef.current?.id ?? null, queueSignature, normalizedCursor);
  }

  useEffect(() => {
    if (!authToken || !currentUser || workspaceLoading) {
      return;
    }

    if (queueStateSignatureRef.current === queueSignature) {
      return;
    }

    void syncQueueCursorFromServer(authToken).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unable to sync the active queue cursor.";
      setWorkspaceError(message);
    });
  }, [authToken, currentUser?.id, queueFilter, queueSort, queueScope, workspaceLoading, queueSignature]);

  useEffect(() => {
    return () => {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      let nextToken = authToken;
      let nextRefreshToken = authRefreshToken;

      if (
        !nextToken &&
        supabase &&
        typeof window !== "undefined" &&
        window.location.pathname === "/login" &&
        (window.location.search.includes("code=") ||
          window.location.hash.includes("access_token=") ||
          window.location.hash.includes("refresh_token="))
      ) {
        const sessionResult = await supabase.auth.getSession();
        nextToken = sessionResult.data.session?.access_token ?? null;
        nextRefreshToken = sessionResult.data.session?.refresh_token ?? null;
      }

      if (!nextToken || !nextRefreshToken) {
        if (active) {
          if (nextToken || nextRefreshToken) {
            cleanupSession();
          } else {
            setCurrentUser(null);
            setUsers([]);
            setLeads([]);
            setCampaigns([]);
            setQueueState(null);
            setAnalytics(emptyAnalytics);
            setSettingsStatus(emptySettingsStatus);
            setVoiceConfig(emptyVoiceConfig);
            setRingCentralStatus(emptyRingCentralStatus);
            setSipProfiles([]);
            setActiveSipProfile(null);
            setSipProfileSelectionRequired(false);
            setCallError(null);
            setWorkspaceError(null);
            setLastWorkspaceSyncAt(null);
          }
          setSessionReady(true);
        }
        return;
      }

      try {
        const { error: sessionError } = await supabase!.auth.setSession({
          access_token: nextToken,
          refresh_token: nextRefreshToken,
        });
        if (sessionError) {
          throw sessionError;
        }

        const payload = await apiRequest<{ user: User }>("/auth/me", {
          token: nextToken,
        });

        if (!active) {
          return;
        }

        if (!authToken && nextToken) {
          setAuthToken(nextToken);
        }
        if (!authRefreshToken && nextRefreshToken) {
          setAuthRefreshToken(nextRefreshToken);
        }
        setCurrentUser(payload.user);
        if (!payload.user.mustResetPassword) {
          await loadWorkspace(nextToken, { silent: true });
        }
      } catch {
        if (active) {
          cleanupSession();
        }
      } finally {
        if (active) {
          setSessionReady(true);
        }
      }
    }

    void hydrateSession();

    return () => {
      active = false;
    };
  }, [authRefreshToken, authToken]);

  useEffect(() => {
    if (!authToken || !currentUser || typeof window === "undefined") {
      return;
    }

    if (ringCentralCallbackHandledRef.current) {
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (!code || !state) {
      if (!error && !errorDescription) {
        return;
      }

      ringCentralCallbackHandledRef.current = true;
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("error");
      nextUrl.searchParams.delete("error_description");
      window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      setWorkspaceError(errorDescription || error || "RingCentral login was cancelled.");
      return;
    }

    ringCentralCallbackHandledRef.current = true;
    const authorizationCode = code;
    const authorizationState = state;
    let active = true;

    async function completeCallback() {
      try {
        const status = await completeRingCentralConnectionAction(
          { code: authorizationCode, state: authorizationState },
          authToken,
        );
        if (!active) {
          return;
        }

        setRingCentralStatus(status);
        setWorkspaceError(null);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("code");
        nextUrl.searchParams.delete("state");
        nextUrl.searchParams.delete("error");
        nextUrl.searchParams.delete("error_description");
        window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        await refreshRingCentralStatus({ force: true }, authToken);
      } catch (error) {
        if (!active) {
          return;
        }

        setWorkspaceError(
          error instanceof Error ? error.message : "Unable to finish the RingCentral connection.",
        );
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete("code");
        nextUrl.searchParams.delete("state");
        nextUrl.searchParams.delete("error");
        nextUrl.searchParams.delete("error_description");
        window.history.replaceState({}, document.title, `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      }
    }

    void completeCallback();

    return () => {
      active = false;
    };
  }, [authToken, currentUser, location.hash, location.pathname, location.search]);

  useEffect(() => {
    return () => {
      stopRingbackTone();
      const client = voiceClientRef.current;
      voiceClientRef.current = null;
      voiceConfigSignatureRef.current = null;
      activeCallMetaRef.current = null;
      remoteAudioRef.current = null;
      if (client) {
        void client.unregister().catch(() => undefined);
        void client.disconnect().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !autoDialAllowedForQueue ||
      manualFirstDialRequired ||
      !currentLeadId ||
      !queue.some((lead) => lead.id === currentLeadId) ||
      activeCall ||
      callLaunchPending ||
      wrapUpLeadId ||
      workspaceLoading ||
      lastAutoDialLeadIdRef.current === currentLeadId ||
      !canMakeCall(timeTracking)
    ) {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
      setAutoDialCountdown(null);
      return;
    }

    const duration = Math.max(1, postWrapAutoDialDelaySeconds ?? autoDialDelaySeconds);
    const leadId = currentLeadId;
    const startAt = Date.now();

    setAutoDialCountdown(duration);

    autoDialTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(
        0,
        duration - Math.floor((Date.now() - startAt) / 1000),
      );
      setAutoDialCountdown(remaining);

      if (remaining === 0) {
        if (autoDialTimerRef.current) {
          window.clearInterval(autoDialTimerRef.current);
          autoDialTimerRef.current = null;
        }
        setAutoDialCountdown(null);
        void startCall()
          .then((started) => {
            if (started) {
              lastAutoDialLeadIdRef.current = leadId;
            }
          })
          .catch(() => undefined);
      }
    }, 250);

    return () => {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
    };
  }, [
    autoDialDelaySeconds,
    autoDialAllowedForQueue,
    activeCall,
    callLaunchPending,
    currentLeadId,
    manualFirstDialRequired,
    queue,
    postWrapAutoDialDelaySeconds,
    timeTracking,
    wrapUpLeadId,
    workspaceLoading,
  ]);

  useEffect(() => {
    if (!currentLeadId) {
      lastAutoDialLeadIdRef.current = null;
      return;
    }

    if (lastAutoDialLeadIdRef.current && lastAutoDialLeadIdRef.current !== currentLeadId) {
      setAutoDialCountdown(null);
    }
  }, [currentLeadId]);

  useEffect(() => {
    if (!authToken || currentUser?.mustResetPassword) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadWorkspace(authToken, { silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [authToken, currentUser?.mustResetPassword]);

  useEffect(() => {
    if (
      !authToken ||
      currentUser?.mustResetPassword ||
      settingsStatus.authMode !== "supabase" ||
      !settingsStatus.supabase.connected ||
      !supabase
    ) {
      return;
    }

    const supabaseClient = supabase;

    supabaseClient.realtime.setAuth(authToken);
    const handleChange = () => {
      void loadWorkspace(authToken, { silent: true });
    };

    const channel = supabaseClient
      .channel(`crm-live-${currentUser?.id ?? "session"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_logs" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_logs" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "callbacks" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, handleChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "followups" }, handleChange)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ringcentral_integrations",
          filter: currentUser?.id ? `app_user_id=eq.${currentUser.id}` : undefined,
        },
        () => {
          void refreshRingCentralStatus({ force: true }, authToken);
        },
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [authToken, currentUser?.id, currentUser?.mustResetPassword, settingsStatus.authMode, settingsStatus.supabase.connected]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    const scopeLeads =
      currentUser?.role === "agent"
        ? leads.filter((lead) => lead.assignedAgentId === currentUser.id)
        : leads;

    scopeLeads.forEach((lead) => {
      if (!lead.callbackTime) {
        return;
      }

      const callbackAt = new Date(lead.callbackTime).getTime();
      const diffMinutes = Math.round((callbackAt - Date.now()) / (1000 * 60));
      const notificationId = `${lead.id}:${lead.callbackTime}`;
      if (notifiedCallbacksRef.current.has(notificationId)) {
        return;
      }

      if (diffMinutes <= 0) {
        new Notification("Missed follow-up", {
          body: `${lead.fullName} is overdue for follow-up.`,
        });
        notifiedCallbacksRef.current.add(notificationId);
      } else if (diffMinutes <= 30) {
        new Notification("Upcoming follow-up", {
          body: `${lead.fullName} needs attention in the next ${diffMinutes} minutes.`,
        });
        notifiedCallbacksRef.current.add(notificationId);
      }
    });
  }, [currentUser, leads]);

  useEffect(() => {
    const activities = leads.flatMap((lead) => lead.activities ?? []);
    if (!activities.length) {
      return;
    }

    if (!ringCentralActivitySeededRef.current) {
      activities.forEach((activity) => {
        notifiedRingCentralActivityIdsRef.current.add(activity.id);
      });
      ringCentralActivitySeededRef.current = true;
      return;
    }

    const newRingCentralActivities = activities.filter(
      (activity) =>
        !notifiedRingCentralActivityIdsRef.current.has(activity.id) &&
        activity.title.toLowerCase().startsWith("incoming ringcentral call"),
    );

    newRingCentralActivities.forEach((activity) => {
      notifiedRingCentralActivityIdsRef.current.add(activity.id);
      toast.info(activity.title, {
        description: activity.description || "Incoming RingCentral call detected.",
      });
    });

    activities.forEach((activity) => {
      notifiedRingCentralActivityIdsRef.current.add(activity.id);
    });
  }, [leads]);

  useEffect(() => {
    notifiedRingCentralActivityIdsRef.current.clear();
    ringCentralActivitySeededRef.current = false;
  }, [currentUser?.id]);

  async function loadWorkspace(
    tokenOverride?: string | null,
    options: { silent?: boolean; ignorePasswordReset?: boolean } = {},
  ) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return false;
    }

    if (!options.ignorePasswordReset && currentUser?.mustResetPassword) {
      return false;
    }

    setWorkspaceLoading(true);
    try {
      const payload = await apiRequest<WorkspacePayload>("/workspace", {
        token,
      });
      setCurrentUser(payload.user);
      setUsers(payload.users);
      setLeads(payload.leads);
      setCampaigns(payload.campaigns ?? []);
      setAnalytics(payload.analytics);
      setSettingsStatus(payload.settings);
      setVoiceConfig(payload.voice);
      setSipProfiles(payload.sipProfiles);
      setActiveSipProfile(payload.activeSipProfile);
      setSipProfileSelectionRequired(payload.sipProfileSelectionRequired);
      const ringCentralStatus = await refreshRingCentralStatus({ force: true }, token);
      if (token) {
        void triggerRingCentralRecordingSync(token, ringCentralStatus);
      }
      await syncQueueCursorFromServer(token);
      setWorkspaceError(null);
      setLastWorkspaceSyncAt(new Date().toISOString());
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sync the CRM workspace.";
      if (!options.silent || !workspaceError) {
        setWorkspaceError(message);
      }
      return false;
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function triggerRingCentralRecordingSync(
    token: string,
    status: RingCentralIntegrationStatus | null,
  ) {
    if (!status?.connected) {
      return;
    }

    const now = Date.now();
    if (
      ringCentralRecordingSyncInFlightRef.current ||
      now - ringCentralRecordingLastRunAtRef.current < 5 * 60 * 1000
    ) {
      return;
    }

    ringCentralRecordingLastRunAtRef.current = now;
    const request = syncRingCentralRecordingsAction(100, token)
      .then(async (result) => {
        if (result.hydratedCount > 0 || result.propagatedCount > 0) {
          await loadWorkspace(token, { silent: true });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (ringCentralRecordingSyncInFlightRef.current === request) {
          ringCentralRecordingSyncInFlightRef.current = null;
        }
      });

    ringCentralRecordingSyncInFlightRef.current = request;
  }

  async function refreshRingCentralStatus(
    options: { force?: boolean } = {},
    tokenOverride?: string | null,
  ) {
    const token = tokenOverride ?? authToken;
    const cached = ringCentralStatusCacheRef.current;
    const now = Date.now();
    if (!options.force && cached && now - cached.fetchedAt < RINGCENTRAL_STATUS_CACHE_TTL_MS) {
      setRingCentralStatus(cached.status);
      return cached.status;
    }

    if (!options.force && ringCentralStatusRequestRef.current) {
      return ringCentralStatusRequestRef.current;
    }

    const requestGeneration = ringCentralStatusRequestGenerationRef.current + 1;
    ringCentralStatusRequestGenerationRef.current = requestGeneration;
    const request = loadRingCentralStatusAction(token)
      .then((status) => {
        if (ringCentralStatusRequestGenerationRef.current === requestGeneration) {
          ringCentralStatusCacheRef.current = { status, fetchedAt: Date.now() };
          setRingCentralStatus(status);
        }
        return status;
      })
      .catch((error) => {
        if (ringCentralStatusRequestGenerationRef.current === requestGeneration) {
          const message =
            error instanceof Error ? error.message : "Unable to load RingCentral settings.";
          setRingCentralStatus((existing) => ({
            ...existing,
            connected: false,
            message,
          }));
        }
        return null;
      })
      .finally(() => {
        if (ringCentralStatusRequestRef.current === request) {
          ringCentralStatusRequestRef.current = null;
        }
      });

    if (!options.force) {
      ringCentralStatusRequestRef.current = request;
    }

    return request;
  }

  function cacheRingCentralStatus(status: RingCentralIntegrationStatus) {
    const previousSelectedCallerIdNumber = ringCentralStatusCacheRef.current?.status.selectedCallerIdNumber ?? null;
    ringCentralStatusRequestGenerationRef.current += 1;
    ringCentralStatusCacheRef.current = { status, fetchedAt: Date.now() };
    ringCentralStatusRequestRef.current = null;
    if (previousSelectedCallerIdNumber !== status.selectedCallerIdNumber) {
      clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    }
    setRingCentralStatus(status);
  }

  function invalidateRingCentralStatusCache() {
    ringCentralStatusRequestGenerationRef.current += 1;
    ringCentralStatusCacheRef.current = null;
    ringCentralStatusRequestRef.current = null;
  }

  async function syncQueueCursorFromServer(tokenOverride?: string | null) {
    const token = tokenOverride ?? authToken;
    if (!token) {
      return null;
    }

    setQueueCursorHydrated(false);
    const response = await apiRequest<QueueState>(
      `/dialer/next-lead?sort=${encodeURIComponent(queueSort)}&filter=${encodeURIComponent(queueFilter)}&scope=${encodeURIComponent(queueScope)}`,
      {
        token,
      },
    );
    setQueueState(response);
    const currentCursor = normalizeQueueCursor(response.items, {
      currentLeadId,
      currentPhoneIndex,
    });
    const storedCursor = normalizeQueueCursor(
      response.items,
      readStoredQueueCursor(currentUser?.id ?? null, queueSignature),
    );
    const serverCursor = normalizeQueueCursor(response.items, getQueueCursorFromState(response));
    const fallbackCursor = response.items[0]
      ? {
          currentLeadId: response.items[0].leadId,
          currentPhoneIndex: response.items[0].phoneIndex,
        }
      : null;
    applyQueueCursor(
      chooseHydratedQueueCursor(serverCursor, storedCursor, currentCursor ?? fallbackCursor),
    );
    setQueueCursorHydrated(true);
    queueStateSignatureRef.current = queueSignature;
    return response;
  }

  async function persistQueueCursor(nextLeadId: string | null, nextPhoneIndex: number) {
    if (!authToken || !currentUser) {
      return null;
    }

    const response = await apiRequest<QueueState>("/queue", {
      method: "PUT",
      token: authToken,
      body: JSON.stringify({
        queueScope,
        queueSort,
        queueFilter,
        currentLeadId: nextLeadId,
        currentPhoneIndex: nextPhoneIndex,
      }),
    });
    setQueueState(response);

    const nextCursor = normalizeQueueCursor(
      response.items ?? [],
      getQueueCursorFromState(response),
    );
    applyQueueCursor(nextCursor);
    queueStateSignatureRef.current = queueSignature;
    return response;
  }

  async function advanceQueueCursor(
    outcome: "completed" | "failed" | "skipped" | "invalid" | "restart",
    currentLeadIdOverride?: string | null,
    currentPhoneIndexOverride?: number,
  ) {
    if (!authToken || !currentUser) {
      return null;
    }

    const response = await apiRequest<QueueState>("/queue/advance", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        queueScope,
        queueSort,
        queueFilter,
        currentLeadId: currentLeadIdOverride ?? currentLeadId,
        currentPhoneIndex:
          typeof currentPhoneIndexOverride === "number" ? currentPhoneIndexOverride : currentPhoneIndex,
        outcome,
      }),
    });
    setQueueState(response);

    const nextCursor = normalizeQueueCursor(
      response.items ?? [],
      getQueueCursorFromState(response),
    );
    applyQueueCursor(nextCursor);
    queueStateSignatureRef.current = queueSignature;
    return response;
  }

  function cleanupSession() {
    stopRingbackTone();
    invalidateRingCentralStatusCache();
    clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    setAuthToken(null);
    setAuthRefreshToken(null);
    setCurrentUser(null);
    setUsers([]);
    setLeads([]);
    setCampaigns([]);
    setAnalytics(emptyAnalytics);
    setSettingsStatus(emptySettingsStatus);
    setVoiceConfig(emptyVoiceConfig);
    setRingCentralStatus(emptyRingCentralStatus);
    setSipProfiles([]);
    setActiveSipProfile(null);
    setSipProfileSelectionRequired(false);
    setCallError(null);
    setWorkspaceError(null);
    setLastWorkspaceSyncAt(null);
    setQueueState(null);
    setAutoDialCountdown(null);
    setTimeTracking(createInitialTimeTrackingState());
    setSeenIncomingAlertIds([]);
    setCurrentLeadId(null);
    setCurrentPhoneIndex(0);
    setQueueCursorHydrated(false);
    setActiveCall(null);
    setWrapUpLeadId(null);
    setWrapUpDurationSeconds(0);
    setCallLaunchPending(false);
    setManualFirstDialRequired(false);
    setPostWrapAutoDialDelaySeconds(null);
    wrapUpLeadIdRef.current = null;
    lastAutoDialLeadIdRef.current = null;
    queueStateSignatureRef.current = null;
    callLaunchPendingRef.current = false;
    ringCentralCallbackHandledRef.current = false;
    if (autoDialTimerRef.current) {
      window.clearInterval(autoDialTimerRef.current);
      autoDialTimerRef.current = null;
    }
    activeCallMetaRef.current = null;
    void destroyVoiceClient();
  }

  async function persistFailedCallAttempt(
    meta: NonNullable<typeof activeCallMetaRef.current>,
    failureStage: CallAttemptFailureStage,
    failureMessage: string,
  ) {
    if (
      !authToken ||
      !meta.leadId ||
      meta.connected ||
      meta.attemptPersisted ||
      meta.callMode === "incoming"
    ) {
      return;
    }

    meta.attemptPersisted = true;

    try {
      await apiRequest("/dialer/attempt", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({
          leadId: meta.leadId,
          dialedNumber: meta.dialedNumber,
          failureStage,
          sipStatus: meta.sipStatusCode ?? null,
          sipReason: meta.sipReasonPhrase ?? null,
          failureMessage,
          startedAt: new Date(meta.startedAt).toISOString(),
          endedAt: new Date().toISOString(),
        }),
      });
      await loadWorkspace(authToken, { silent: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to save failed call diagnostics.";
      setWorkspaceError(message);
    }
  }

  function finishCallSession(leadId: string | null, startedAt: number) {
    stopRingbackTone();
    setActiveCall((existing) =>
      existing && existing.startedAt === startedAt ? null : existing,
    );

    const meta = activeCallMetaRef.current;
    wrapUpRingCentralSessionIdRef.current = meta?.browserCallId ?? null;
    wrapUpCallTypeRef.current = meta?.callMode === "incoming" ? "incoming" : "outgoing";

    if (leadId) {
      wrapUpLeadIdRef.current = leadId;
      setWrapUpLeadId(leadId);
      setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
      setTimeTracking((current) =>
        createStartedWrapUpTimeTrackingState(current, new Date().toISOString()),
      );
      setCallError(null);
    } else {
      wrapUpLeadIdRef.current = null;
      setWrapUpLeadId(null);
      setWrapUpDurationSeconds(0);
      wrapUpRingCentralSessionIdRef.current = null;
      wrapUpCallTypeRef.current = null;
    }

    activeCallMetaRef.current = null;

    if (leadId && meta && meta.callMode !== "incoming" && authToken && currentUser) {
      void advanceQueueCursor(
        "completed",
        leadId,
        typeof meta.phoneIndex === "number" ? meta.phoneIndex : currentPhoneIndex,
      )
        .then((response) => {
          if (!response?.nextItem && activeDialerCampaigns.length > 1) {
            setPreferredDialerCampaignKey(null);
          }
        })
        .catch(() => null);
    }
  }

  async function failCallSession(
    message: string,
    startedAt: number,
    failureStage: CallAttemptFailureStage = "unknown",
    advanceQueue = false,
  ) {
    stopRingbackTone();
    const meta = activeCallMetaRef.current;
    let shouldSurfaceCallError = true;
    if (meta?.callMode === "incoming" && !meta.connected) {
      shouldSurfaceCallError = false;
    }
    if (meta && meta.startedAt === startedAt && !meta.userHangup) {
      await persistFailedCallAttempt(meta, failureStage, message);
    }

    setActiveCall((existing) => {
      if (!existing || existing.startedAt !== startedAt) {
        return existing;
      }

      if (
        existing.status === "connected" ||
        existing.status === "on_hold" ||
        existing.status === "manual"
      ) {
        if (existing.leadId) {
          wrapUpLeadIdRef.current = existing.leadId;
          wrapUpRingCentralSessionIdRef.current = meta?.browserCallId ?? null;
          wrapUpCallTypeRef.current = meta?.callMode === "incoming" ? "incoming" : "outgoing";
          setWrapUpLeadId(existing.leadId);
          setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
          setTimeTracking((current) =>
            createStartedWrapUpTimeTrackingState(current, new Date().toISOString()),
          );
        }
        shouldSurfaceCallError = false;
        return null;
      }

      if (existing.leadId) {
        wrapUpLeadIdRef.current = existing.leadId;
        wrapUpRingCentralSessionIdRef.current = meta?.browserCallId ?? null;
        wrapUpCallTypeRef.current = meta?.callMode === "incoming" ? "incoming" : "outgoing";
        setWrapUpLeadId(existing.leadId);
        setWrapUpDurationSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
        setTimeTracking((current) =>
          createStartedWrapUpTimeTrackingState(current, new Date().toISOString()),
        );
      }

      return null;
    });
    activeCallMetaRef.current = null;
    if (shouldSurfaceCallError && !isRingCentralRateLimitError(message)) {
      setCallError(message);
    } else {
      setCallError(null);
    }

    if (advanceQueue && meta?.leadId && !meta.connected && !meta.userHangup) {
      await advanceQueueCursor("failed", meta.leadId, meta.phoneIndex).catch(() => null);
    }
  }

  async function destroyVoiceClient() {
    const client = voiceClientRef.current;
    voiceClientRef.current = null;
    voiceConfigSignatureRef.current = null;
    remoteAudioRef.current = null;
    clearBrowserSoftphoneActivationListener();
    browserSoftphoneStartInProgressRef.current = false;

    if (!client) {
      return;
    }

    suppressVoiceDisconnectRef.current += 1;
    try {
      await client.dispose();
    } catch {
      // Ignore softphone cleanup failures during teardown.
    } finally {
      suppressVoiceDisconnectRef.current = Math.max(
        0,
        suppressVoiceDisconnectRef.current - 1,
      );
    }
  }

  function clearBrowserSoftphoneActivationListener() {
    const listener = browserSoftphoneStartListenerRef.current;
    if (!listener || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("pointerdown", listener, true);
    window.removeEventListener("keydown", listener, true);
    window.removeEventListener("touchstart", listener, true);
    browserSoftphoneStartListenerRef.current = null;
  }

  function queueBrowserSoftphoneActivation(client: RingCentralSoftphoneClient) {
    if (typeof window === "undefined" || browserSoftphoneStartListenerRef.current) {
      return;
    }

    const listener = () => {
      clearBrowserSoftphoneActivationListener();
      void startBrowserSoftphone(client).catch(() => undefined);
    };

    browserSoftphoneStartListenerRef.current = listener;
    window.addEventListener("pointerdown", listener, true);
    window.addEventListener("keydown", listener, true);
    window.addEventListener("touchstart", listener, true);
  }

  async function startBrowserSoftphone(client: RingCentralSoftphoneClient) {
    if (browserSoftphoneStartInProgressRef.current || voiceClientRef.current !== client) {
      return;
    }

    browserSoftphoneStartInProgressRef.current = true;
    try {
      await client.start();
      if (voiceClientRef.current !== client) {
        return;
      }

      voiceConfigSignatureRef.current = JSON.stringify({
        provider: browserSoftphoneConfig.source,
        websocketUrl: browserSoftphoneConfig.websocketUrl,
        sipDomain: browserSoftphoneConfig.sipDomain,
        callerId: browserSoftphoneConfig.callerId,
        authorizationId: browserSoftphoneConfig.authorizationId,
        authorizationUsername: browserSoftphoneConfig.authorizationUsername,
        displayName: browserSoftphoneConfig.displayName,
        profileId: browserSoftphoneConfig.profileId,
      });
      clearBrowserSoftphoneActivationListener();
    } catch (error) {
      if (isBrowserGestureRequiredError(error)) {
        queueBrowserSoftphoneActivation(client);
        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to start the RingCentral browser softphone.";
      setCallError((existing) => existing ?? message);
    } finally {
      browserSoftphoneStartInProgressRef.current = false;
    }
  }

  function bindBrowserSoftphoneSession(
    session: RingCentralSoftphoneSession,
    input: {
      leadId: string | null;
      dialedNumber: string;
      displayName: string;
      startedAt: number;
      phoneIndex: number;
      callMode: "incoming" | "outgoing";
      transportMode: CallTransportMode;
    },
  ) {
    const browserCallId = session.callId ?? null;
    const sessionAlreadyConnected = input.callMode === "outgoing" || session.state === "answered";
    activeCallMetaRef.current = {
      leadId: input.leadId,
      dialedNumber: input.dialedNumber,
      phoneIndex: input.phoneIndex,
      startedAt: input.startedAt,
      browserCallId,
      callMode: input.callMode,
      connected: sessionAlreadyConnected,
      browserConnected: sessionAlreadyConnected,
      userHangup: false,
      attemptPersisted: false,
      transportMode: input.transportMode,
    };

    if (input.leadId) {
      setCurrentLeadId(input.leadId);
      setCurrentPhoneIndex(input.phoneIndex);
    }

    const baseCall =
      input.callMode === "incoming"
        ? createIncomingCallState({
            leadId: input.leadId,
            displayName: input.displayName,
            dialedNumber: input.dialedNumber,
            startedAt: input.startedAt,
            callId: browserCallId,
          })
        : createOutgoingCallState({
            leadId: input.leadId,
            displayName: input.displayName,
            dialedNumber: input.dialedNumber,
            startedAt: input.startedAt,
            callId: browserCallId,
            transportMode: input.transportMode,
          });

    const initialCall = {
      ...baseCall,
      callId: browserCallId,
      transportMode: input.transportMode,
    };

    setActiveCall(
      sessionAlreadyConnected
        ? promoteCallToConnected(initialCall)
        : initialCall,
    );

    if (sessionAlreadyConnected) {
      stopRingbackTone();
    }

    session.on?.("ringing", () => {
      if (input.callMode === "incoming") {
        startRingbackTone();
      }

      setActiveCall((existing) => {
        if (!existing || existing.startedAt !== input.startedAt) {
          return existing;
        }

        if (existing.status === "connected" || existing.lifecycleState === "connected") {
          return existing;
        }

        return {
          ...existing,
          callId: browserCallId ?? existing.callId,
          transportMode: input.transportMode,
          status: "ringing",
          lifecycleState: "ringing",
        };
      });
    });

    session.on?.("answered", () => {
      stopRingbackTone();
      activeCallMetaRef.current = {
        ...(activeCallMetaRef.current ?? {
          leadId: input.leadId,
          dialedNumber: input.dialedNumber,
          phoneIndex: input.phoneIndex,
          startedAt: input.startedAt,
          browserCallId,
          callMode: input.callMode,
          connected: false,
          browserConnected: false,
          userHangup: false,
          attemptPersisted: false,
          transportMode: input.transportMode,
        }),
        browserCallId,
        connected: true,
        browserConnected: true,
      };

      setActiveCall((existing) => {
        if (!existing || existing.startedAt !== input.startedAt) {
          return existing;
        }

        return promoteCallToConnected({
          ...existing,
          callId: browserCallId ?? existing.callId,
          transportMode: input.transportMode,
          lifecycleState: "connected",
        });
      });
    });

    session.on?.("disposed", () => {
      const meta = activeCallMetaRef.current;
      if (!meta || meta.startedAt !== input.startedAt) {
        return;
      }

      if (meta.connected) {
        finishCallSession(meta.leadId, input.startedAt);
        return;
      }

      if (meta.callMode === "incoming" || meta.userHangup) {
        setActiveCall((existing) =>
          existing && existing.startedAt === input.startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        return;
      }

      void failCallSession(
        "RingCentral ended the call before it connected.",
        input.startedAt,
        "hangup_before_connect",
        shouldAdvanceQueueAfterCallFailure("RingCentral ended the call before it connected."),
      );
    });

    session.on?.("failed", (error) => {
      const meta = activeCallMetaRef.current;
      if (!meta || meta.startedAt !== input.startedAt) {
        return;
      }

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to place the RingCentral browser call.";

      if (meta.connected) {
        finishCallSession(meta.leadId, input.startedAt);
        return;
      }

      if (meta.callMode === "incoming") {
        setActiveCall((existing) =>
          existing && existing.startedAt === input.startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        return;
      }

      void failCallSession(
        message,
        input.startedAt,
        "invite",
        shouldAdvanceQueueAfterCallFailure(message),
      );
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function setupBrowserSoftphone() {
      await destroyVoiceClient();

      if (!browserSoftphoneConfig.available || !ringCentralStatus.connected) {
        return;
      }

      try {
        const client = await createRingCentralSoftphone(browserSoftphoneConfig, {
          onInboundCall: (session) => {
            const remoteNumber = session.remoteNumber ?? session.callId ?? "";
            const matchedLead = findLeadForDialNumber(
              leadsRef.current,
              remoteNumber,
            );
            bindBrowserSoftphoneSession(session, {
              leadId: matchedLead?.lead.id ?? null,
              dialedNumber: remoteNumber,
              displayName: matchedLead?.lead.fullName ?? remoteNumber,
              startedAt: Date.now(),
              phoneIndex: matchedLead?.phoneIndex ?? 0,
              callMode: "incoming",
              transportMode: "browser_softphone",
            });
          },
        });

        if (!client) {
          return;
        }

        if (cancelled) {
          await client.dispose();
          return;
        }

        voiceClientRef.current = client;
        queueBrowserSoftphoneActivation(client);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Unable to start the RingCentral browser softphone.";
          setCallError((existing) => existing ?? message);
        }
      }
    }

    void setupBrowserSoftphone();

    return () => {
      cancelled = true;
      void destroyVoiceClient();
    };
  }, [
    browserSoftphoneConfig.available,
    browserSoftphoneConfig.callerId,
    browserSoftphoneConfig.authorizationId,
    browserSoftphoneConfig.authorizationPassword,
    browserSoftphoneConfig.authorizationUsername,
    browserSoftphoneConfig.displayName,
    browserSoftphoneConfig.profileId,
    browserSoftphoneConfig.sipDomain,
    browserSoftphoneConfig.source,
    browserSoftphoneConfig.websocketUrl,
    ringCentralStatus.connected,
  ]);

  const login = async (email: string, password: string) => {
    try {
      const payload = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!payload.token) {
        return {
          success: false,
          message: payload.message ?? "Supabase session could not be established.",
        };
      }
      if (!payload.refreshToken) {
        return {
          success: false,
          message: "Supabase session is missing a refresh token.",
        };
      }

      setAuthToken(payload.token);
      setAuthRefreshToken(payload.refreshToken);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      if (!payload.user.mustResetPassword) {
        await loadWorkspace(payload.token, { silent: true });
      }
      setSessionReady(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Cannot reach the sign-in service. Check that the backend is running.",
      };
    }
  };

  const continueWithGoogle = async () => {
    if (!supabase) {
      return {
        success: false,
        message: "Google sign-in requires a configured Supabase browser client.",
      };
    }

    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      return {
        success: false,
        message: error.message,
      };
    }

    return { success: true };
  };

  const logout = () => {
    void supabase?.auth.signOut();
    cleanupSession();
    setSessionReady(true);
  };

  const signup = async (input: {
    name: string;
    email: string;
    password: string;
    team: string;
    timezone: string;
    title: string;
  }) => {
    try {
      const payload = await apiRequest<AuthResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });

      if (!payload.token) {
        return {
          success: false,
          message: payload.message ?? "Account created, but sign-in is still required.",
        };
      }
      if (!payload.refreshToken) {
        return {
          success: false,
          message: "Supabase session is missing a refresh token.",
        };
      }

      setAuthToken(payload.token);
      setAuthRefreshToken(payload.refreshToken);
      setCurrentUser(payload.user);
      setWorkspaceError(null);
      if (!payload.user.mustResetPassword) {
        await loadWorkspace(payload.token, { silent: true });
      }
      setSessionReady(true);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to create your account.",
      };
    }
  };

  const changePassword = async (password: string) => {
    try {
      if (!authToken) {
        return {
          success: false,
          message: "Missing session.",
        };
      }

      const payload = await apiRequest<{ user: User; message?: string }>("/auth/change-password", {
        method: "POST",
        token: authToken,
        body: JSON.stringify({ newPassword: password }),
      });

      if (!payload.user) {
        return {
          success: false,
          message: payload.message ?? "Unable to update your password.",
        };
      }

      setCurrentUser(payload.user);
      setWorkspaceError(null);
      await loadWorkspace(authToken, { silent: true, ignorePasswordReset: true });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unable to update your password.",
      };
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspace(authToken, { silent: false });
  };

  const syncRingCentralRecordings = async (limit = 100) => {
    if (!authToken) {
      throw new Error("Missing session.");
    }

    const result = await syncRingCentralRecordingsAction(limit, authToken);
    ringCentralRecordingLastRunAtRef.current = Date.now();
    if (result.hydratedCount > 0 || result.propagatedCount > 0) {
      await loadWorkspace(authToken, { silent: true });
    }
    return result;
  };

  const fetchEmployeeActivityCalendar = useCallback(
    async (employeeId: string, month: string) => {
      if (!authToken || !currentUser) {
        throw new Error("Missing session context.");
      }

      const search = new URLSearchParams({ employeeId, month });
      return apiRequest<EmployeeActivityCalendarResponse>(
        `/admin/employee-activity-calendar?${search.toString()}`,
        {
          method: "GET",
          token: authToken,
        },
      );
    },
    [authToken, currentUser],
  );

  const checkIn = () => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setManualFirstDialRequired(true);
    setPostWrapAutoDialDelaySeconds(null);
    setTimeTracking((current) =>
      createCheckedInTimeTrackingState(current, new Date().toISOString()),
    );
  };

  const checkOut = () => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setManualFirstDialRequired(false);
    setPostWrapAutoDialDelaySeconds(null);
    setTimeTracking((current) =>
      createCheckedOutTimeTrackingState(current, new Date().toISOString()),
    );
  };

  const startBreak = (breakType: BreakType) => {
    if (activeCall || wrapUpLeadId) {
      return;
    }

    setTimeTracking((current) =>
      createStartedBreakTimeTrackingState(current, breakType, new Date().toISOString()),
    );
  };

  const endBreak = () => {
    setTimeTracking((current) => createEndedBreakTimeTrackingState(current, new Date().toISOString()));
  };

  const markIncomingAlertsSeen = () => {
    setSeenIncomingAlertIds((current) => {
      const next = new Set(current);
      incomingAlerts.forEach((alert) => {
        next.add(alert.id);
      });
      return [...next];
    });
  };

  const selectLead = (leadId: string) => {
    if (!wrapUpLeadId) {
      lastAutoDialLeadIdRef.current = null;
      applyQueueCursor({ currentLeadId: leadId, currentPhoneIndex: 0 });
      void persistQueueCursor(leadId, 0).catch(() => undefined);
    }
  };

  const previousLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    if (currentIndex <= 0) {
      return;
    }

    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = queue[currentIndex - 1]?.id ?? null;
    if (!nextLeadId) {
      return;
    }

    applyQueueCursor({ currentLeadId: nextLeadId, currentPhoneIndex: 0 });
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const nextLead = () => {
    if (wrapUpLeadId || !queue.length) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    if (currentIndex < 0 || currentIndex >= queue.length - 1) {
      return;
    }

    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = queue[currentIndex + 1]?.id ?? null;
    if (!nextLeadId) {
      return;
    }

    applyQueueCursor({ currentLeadId: nextLeadId, currentPhoneIndex: 0 });
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const skipLead = () => {
    if (wrapUpLeadId) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === currentLeadId);
    if (currentIndex < 0 || currentIndex >= queue.length - 1) {
      return;
    }

    lastAutoDialLeadIdRef.current = null;
    const nextLeadId = queue[currentIndex + 1]?.id ?? null;
    if (!nextLeadId) {
      return;
    }

    applyQueueCursor({ currentLeadId: nextLeadId, currentPhoneIndex: 0 });
    void persistQueueCursor(nextLeadId, 0).catch(() => undefined);
  };

  const markLeadInvalid = async () => {
    if (!authToken || !currentLeadId || !currentUser || wrapUpLeadId) {
      return;
    }

    await apiRequest(`/leads/${currentLeadId}/invalid`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({
        queueScope,
        queueSort,
        queueFilter,
        currentPhoneIndex,
      }),
    });
    await refreshWorkspace();
    lastAutoDialLeadIdRef.current = null;
  };

  const startCall = async (input?: {
    phone?: string;
    leadId?: string | null;
    displayName?: string;
    phoneIndex?: number;
    allowDuringWrapUp?: boolean;
  }) => {
    if (
      callLaunchPendingRef.current ||
      activeCall ||
      (wrapUpLeadId && !input?.allowDuringWrapUp)
    ) {
      return false;
    }

    const callAccessMessage = getCallAccessMessage(timeTracking);
    if (callAccessMessage) {
      setCallError(callAccessMessage);
      return false;
    }

    callLaunchPendingRef.current = true;
    setCallLaunchPending(true);
    try {
      if (autoDialTimerRef.current) {
        window.clearInterval(autoDialTimerRef.current);
        autoDialTimerRef.current = null;
      }
      setAutoDialCountdown(null);
      setPostWrapAutoDialDelaySeconds(null);
      setCallError(null);

      const startedAt = Date.now();
      const requestedLeadId =
        input && Object.prototype.hasOwnProperty.call(input, "leadId")
          ? input.leadId ?? null
          : currentLeadId;
      const requestedPhoneIndex =
        input && Object.prototype.hasOwnProperty.call(input, "phoneIndex") &&
        typeof input.phoneIndex === "number"
          ? input.phoneIndex
          : currentPhoneIndex;
      const lead = requestedLeadId
        ? leads.find((item) => item.id === requestedLeadId) ?? null
        : null;

      if (requestedLeadId && !lead) {
        throw new Error("Lead not found");
      }

      const leadPhoneNumbers = lead?.phoneNumbers?.length
        ? lead.phoneNumbers
        : [lead?.phone ?? "", lead?.altPhone ?? ""].filter(Boolean);
      const queueDialedNumber = (
        input?.phone ??
        leadPhoneNumbers[requestedPhoneIndex] ??
        leadPhoneNumbers[currentPhoneIndex] ??
        leadPhoneNumbers[0] ??
        ""
      ).trim();
      if (!queueDialedNumber) {
        throw new Error("Phone number not found");
      }

      const callLeadId = lead?.id ?? requestedLeadId ?? null;
      const formattedDialNumber = formatDialNumberForSession(queueDialedNumber, {
        callerId: null,
        timezone: lead?.timezone ?? currentUser?.timezone,
      });
      if (!formattedDialNumber) {
        await failCallSession("Enter a valid 10-digit US phone number.", startedAt, "session_start");
        throw new Error("Enter a valid 10-digit US phone number.");
      }

      const outboundDialNumber = formattedDialNumber;
      const displayName = (input?.displayName ?? lead?.fullName ?? queueDialedNumber).trim();
      const browserSoftphoneClient = voiceClientRef.current;
      const browserCallingReady = Boolean(
        browserSoftphoneClient && browserSoftphoneConfig.available,
      );

      if (!browserCallingReady) {
        const message =
          "RingCentral browser calling is not ready. Reconnect RingCentral in Settings.";
        await failCallSession(
          message,
          startedAt,
          "session_unavailable",
        );
        throw new Error(message);
      }

      if (!callLeadId && currentLeadId) {
        lastAutoDialLeadIdRef.current = currentLeadId;
      }

      startRingbackTone();

      if (callLeadId) {
        try {
          await persistQueueCursor(callLeadId, requestedPhoneIndex);
        } catch (error) {
          await failCallSession(
            error instanceof Error && error.message.trim()
              ? error.message
              : "Unable to save the active queue cursor before dialing.",
            startedAt,
            "session_start",
          );
          throw error;
        }
      }

      try {
        const browserSession = await browserSoftphoneClient!.call(
          outboundDialNumber,
          browserSoftphoneConfig.callerId ?? undefined,
        );
        bindBrowserSoftphoneSession(browserSession, {
          leadId: callLeadId,
          dialedNumber: outboundDialNumber,
          phoneIndex: requestedPhoneIndex,
          startedAt,
          callMode: "outgoing",
          displayName,
          transportMode: "browser_softphone",
        });
        setManualFirstDialRequired(false);
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";
        const shouldAdvanceQueue = shouldAdvanceQueueAfterCallFailure(errorMessage);
        await failCallSession(
          errorMessage.trim() ? errorMessage : "Unable to place the RingCentral browser call.",
          startedAt,
          "invite",
          shouldAdvanceQueue,
        );
        throw error;
      }
    } finally {
      callLaunchPendingRef.current = false;
      setCallLaunchPending(false);
    }
  };

  const toggleMute = () => {
    return;
  };

  const holdCall = () => {
    return;
  };

  const resumeCall = () => {
    return;
  };

  const answerCall = () => {
    if (!activeCall || activeCall.direction !== "incoming" || activeCall.status !== "ringing") {
      return;
    }

    const client = voiceClientRef.current;
    if (!client) {
      return;
    }

    void client.answer().catch(() => undefined);
  };

  const rejectCall = () => {
    if (activeCall?.direction === "incoming" && activeCall.status === "ringing") {
      const client = voiceClientRef.current;
      const startedAt = activeCall.startedAt;
      const meta = activeCallMetaRef.current;
      if (meta && meta.startedAt === startedAt) {
        meta.userHangup = true;
      }

      stopRingbackTone();
      setActiveCall((existing) =>
        existing && existing.startedAt === startedAt ? null : existing,
      );
      activeCallMetaRef.current = null;
      setCallError(null);
      void client?.reject().catch(() => undefined);
      return;
    }

    void endCall();
  };

  const endCall = () => {
    if (!activeCall) {
      return;
    }

    const callLeadId = activeCall.leadId;
    const startedAt = activeCall.startedAt;
    const meta = activeCallMetaRef.current;
    if (meta && meta.startedAt === startedAt) {
      meta.userHangup = true;
    }

    const browserClient = voiceClientRef.current;
    if (activeCall.direction === "incoming" && activeCall.status === "ringing") {
      stopRingbackTone();
      setActiveCall((existing) =>
        existing && existing.startedAt === startedAt ? null : existing,
      );
      activeCallMetaRef.current = null;
      setCallError(null);
      void browserClient?.reject().catch(() => undefined);
      return;
    }

    if (browserClient && activeCall.transportMode === "browser_softphone") {
      const connected = activeCall.status === "connected" || Boolean(meta?.connected);
      stopRingbackTone();
      void browserClient.hangup().catch(() => undefined);

      if (connected) {
        finishCallSession(callLeadId, startedAt);
      } else if (callLeadId && activeCall.direction !== "incoming") {
        finishCallSession(callLeadId, startedAt);
      } else {
        setActiveCall((existing) =>
          existing && existing.startedAt === startedAt ? null : existing,
        );
        activeCallMetaRef.current = null;
        setCallError(null);
      }

      return;
    }

    stopRingbackTone();
    if (callLeadId) {
      finishCallSession(callLeadId, startedAt);
      return;
    }

    setActiveCall((existing) =>
      existing && existing.startedAt === startedAt ? null : existing,
    );
    activeCallMetaRef.current = null;
    setCallError(null);
  };

  const saveDisposition = async (input: SaveDispositionInput, leadIdOverride?: string) => {
    const targetLeadId = leadIdOverride ?? wrapUpLeadId;
    if (!authToken || !targetLeadId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const liveWrapUpSeconds = Math.max(0, getActiveWrapUpSeconds(timeTracking, nowIso));

    const response = await apiRequest<SaveDispositionResponse>("/dialer/disposition", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        ...input,
        leadId: targetLeadId,
        durationSeconds: liveWrapUpSeconds || wrapUpDurationSeconds || 60,
        recordingEnabled: activeCall?.recordingEnabled ?? false,
        queueScope,
        queueSort,
        queueFilter,
        currentPhoneIndex,
        wrapUpStartedAt: timeTracking.wrapUpStartedAt,
        wrapUpEndedAt: nowIso,
        wrapUpDurationSeconds: liveWrapUpSeconds,
        ringcentralSessionId: wrapUpRingCentralSessionIdRef.current ?? null,
        callType: wrapUpCallTypeRef.current ?? "outgoing",
      }),
    });

    lastAutoDialLeadIdRef.current = targetLeadId;
    if (wrapUpLeadId === targetLeadId) {
      setWrapUpLeadId(null);
      setWrapUpDurationSeconds(0);
      wrapUpLeadIdRef.current = null;
      wrapUpRingCentralSessionIdRef.current = null;
      wrapUpCallTypeRef.current = null;
      setTimeTracking((current) =>
        createEndedWrapUpTimeTrackingState(current, new Date().toISOString()),
      );
    }
    if (response.queueState) {
      setQueueState(response.queueState);
      const nextCursor = normalizeQueueCursor(response.queueState.items ?? [], {
        currentLeadId: response.queueState.currentItem?.leadId ?? null,
        currentPhoneIndex: response.queueState.currentItem?.phoneIndex ?? 0,
      });
      applyQueueCursor(nextCursor);
      queueStateSignatureRef.current = queueSignature;
      if (
        dialerCampaignSelectionClearPendingRef.current ||
        (activeDialerCampaigns.length > 1 && !response.queueState.nextItem)
      ) {
        setPreferredDialerCampaignKey(null);
        dialerCampaignSelectionClearPendingRef.current = false;
      }
    } else if (response.nextLead) {
      setCurrentLeadId(response.nextLead.id);
      setCurrentPhoneIndex(0);
    }
    setPostWrapAutoDialDelaySeconds(8);
    await refreshWorkspace();
  };

  const uploadLeads = async (
    records: LeadImportRecord[],
    assignToUserId?: string,
    campaign?: LeadUploadCampaignInput,
  ) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const result = await apiRequest<UploadResult>("/leads/upload", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({
        records,
        assignToUserId,
        campaignSourceKey: campaign?.sourceKey,
        campaignName: campaign?.name,
      }),
    });
    await refreshWorkspace();
    return result;
  };

  const createCampaign = async (input: CampaignCreateInput) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest("/campaigns", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const updateCampaign = async (campaignId: string, input: CampaignUpdateInput) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/campaigns/${campaignId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const assignCampaign = async (campaignId: string, userId: string | null) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/campaigns/${campaignId}/assign`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ userId }),
    });
    await refreshWorkspace();
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/campaigns/${campaignId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const updateLead = async (leadId: string, input: LeadUpdateInput) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/leads/${leadId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const assignLead = async (leadId: string, userId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/leads/${leadId}/assign`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ userId }),
    });
    await refreshWorkspace();
  };

  const bulkUpdateLeadStatus = async (leadIds: string[], status: LeadStatus) => {
    if (!authToken || !leadIds.length) {
      return;
    }
    await apiRequest("/leads/bulk-status", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ leadIds, status }),
    });
    await refreshWorkspace();
  };

  const deleteLeads = async (leadIds: string[]) => {
    if (!authToken || !leadIds.length) {
      return;
    }
    await apiRequest("/leads/bulk-delete", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ leadIds }),
    });
    await refreshWorkspace();
  };

  const createCallLog = async (input: CallLogFormInput) => {
    if (!authToken) {
      return;
    }

    await apiRequest("/calls", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const updateCallLog = async (callId: string, input: CallLogFormInput) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/calls/${callId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
  };

  const deleteCallLog = async (callId: string) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/calls/${callId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const deleteCallLogs = async (callIds: string[]) => {
    if (!authToken) {
      return;
    }

    await apiRequest("/calls/bulk-delete", {
      method: "POST",
      token: authToken,
      body: JSON.stringify({ callIds }),
    });
    await refreshWorkspace();
  };

  const rescheduleCallback = async (
    leadId: string,
    callbackAt: string,
    priority: LeadPriority,
  ) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/reschedule`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ callbackTime: callbackAt, priority }),
    });
    await refreshWorkspace();
  };

  const markCallbackCompleted = async (leadId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/complete`, {
      method: "PATCH",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const reopenLeadRecord = async (leadId: string) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/callbacks/${leadId}/reopen`, {
      method: "PATCH",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const inviteUser = async (input: {
    name: string;
    email: string;
    role: User["role"];
    team: string;
    timezone: string;
    title: string;
  }) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const result = await apiRequest<InviteUserResult>("/users", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });
    await refreshWorkspace();
    return result;
  };

  const setUserStatus = async (userId: string, status: User["status"]) => {
    if (!authToken) {
      return;
    }
    await apiRequest(`/users/${userId}/status`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ status }),
    });
    await refreshWorkspace();
  };

  const deleteUser = async (userId: string) => {
    if (!authToken) {
      return;
    }

    await apiRequest(`/users/${userId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const connectRingCentral = async () => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const authorizationUrl = await beginRingCentralConnectionAction(authToken);
    if (typeof window !== "undefined") {
      window.location.assign(authorizationUrl);
    }
  };

  const disconnectRingCentral = async () => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await disconnectRingCentralAction(authToken);
    invalidateRingCentralStatusCache();
    clearRingCentralBrowserVoiceSessionCache(currentUserRef.current?.id ?? null);
    setRingCentralStatus(emptyRingCentralStatus);
  };

  const setRingCentralCallerIdNumber = async (callerIdNumber: string | null) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const status = await saveRingCentralCallerIdNumberAction(callerIdNumber, authToken);
    cacheRingCentralStatus(status);
    await refreshWorkspace();
  };

  const activateSipProfile = async (profileId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    if (activeCall) {
      throw new Error("End the current call before changing dial settings.");
    }

    await destroyVoiceClient();
    await apiRequest("/sip-profiles/active", {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ profileId }),
    });
    await refreshWorkspace();
  };

  const createSipProfile = async (
    input: CreateSipProfileInput,
    options: { activate?: boolean } = {},
  ) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<{ profile: SipProfile }>("/sip-profiles", {
      method: "POST",
      token: authToken,
      body: JSON.stringify(input),
    });

    if (options.activate) {
      await activateSipProfile(response.profile.id);
      return response.profile;
    }

    await refreshWorkspace();
    return response.profile;
  };

  const updateSipProfile = async (profileId: string, input: UpdateSipProfileInput) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    const response = await apiRequest<{ profile: SipProfile }>(`/sip-profiles/${profileId}`, {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify(input),
    });

    await refreshWorkspace();
    return response.profile;
  };

  const deleteSipProfile = async (profileId: string) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest(`/sip-profiles/${profileId}`, {
      method: "DELETE",
      token: authToken,
    });
    await refreshWorkspace();
  };

  const assignSipProfileToUser = async (userId: string, profileId: string | null) => {
    if (!authToken) {
      throw new Error("Missing session");
    }

    await apiRequest("/sip-profiles/assign", {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ userId, profileId }),
    });
    await refreshWorkspace();
  };

  return (
    <AppStateContext.Provider
      value={{
        currentUser,
        users,
        leads,
        campaigns,
        dialerCampaignKey,
        dialerCampaignSelectionRequired,
        analytics,
        settingsStatus,
        voiceConfig,
        ringCentralStatus,
        authToken,
        sipProfiles,
        activeSipProfile,
        sipProfileSelectionRequired,
        callError,
        theme,
        sessionReady,
        workspaceLoading,
        workspaceError,
        lastWorkspaceSyncAt,
        queueState,
        queueSort,
        queueFilter,
        currentLeadId,
        currentPhoneIndex,
        activeCall,
        wrapUpLeadId,
        callLaunchPending,
        autoDialEnabled,
        autoDialDelaySeconds,
        autoDialCountdown,
        timeTracking,
        incomingAlerts,
        unseenIncomingAlertCount,
        login,
        continueWithGoogle,
        signup,
        changePassword,
        logout,
        refreshWorkspace,
        syncRingCentralRecordings,
        fetchEmployeeActivityCalendar,
        setTheme,
        setQueueSort,
        setQueueFilter,
        setDialerCampaignKey: setPreferredDialerCampaignKey,
        setAutoDialEnabled,
        setAutoDialDelaySeconds,
        checkIn,
        checkOut,
        startBreak,
        endBreak,
        markIncomingAlertsSeen,
        selectLead,
        previousLead,
        nextLead,
        skipLead,
        markLeadInvalid,
        startCall,
        toggleMute,
        holdCall,
        resumeCall,
        answerCall,
        rejectCall,
        endCall,
        refreshRingCentralStatus,
        connectRingCentral,
        disconnectRingCentral,
        setRingCentralCallerIdNumber,
        saveDisposition,
        uploadLeads,
        createCampaign,
        updateCampaign,
        assignCampaign,
        deleteCampaign,
        updateLead,
        assignLead,
        bulkUpdateLeadStatus,
        deleteLeads,
        createCallLog,
        updateCallLog,
        deleteCallLog,
        deleteCallLogs,
        rescheduleCallback,
        markCallbackCompleted,
        reopenLead: reopenLeadRecord,
        inviteUser,
        setUserStatus,
        deleteUser,
        createSipProfile,
        activateSipProfile,
        updateSipProfile,
        deleteSipProfile,
        assignSipProfileToUser,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

function getQueueCursorFromState(response: QueueState) {
  if (response.currentItem) {
    return {
      currentLeadId: response.currentItem.leadId,
      currentPhoneIndex: response.currentItem.phoneIndex,
    };
  }

  if (response.progress) {
    return {
      currentLeadId: response.progress.currentLeadId,
      currentPhoneIndex: response.progress.currentPhoneIndex,
    };
  }

  return {
    currentLeadId: null as string | null,
    currentPhoneIndex: 0,
  };
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }

  return context;
}
