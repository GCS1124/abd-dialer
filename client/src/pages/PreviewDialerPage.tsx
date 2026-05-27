import {
  Building2,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Clock3,
  FileUp,
  History,
  Globe,
  Mail,
  MapPin,
  MoreVertical,
  PencilLine,
  Phone,
  PhoneCall,
  PhoneOff,
  PlayCircle,
  Search,
  SkipForward,
  SkipBack,
  StickyNote,
  Save,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { ActivityTimeline } from "../components/dialer/ActivityTimeline";
import { CampaignQueueChooserModal } from "../components/dialer/CampaignQueueChooserModal";
import { PostCallPanel } from "../components/dialer/PostCallPanel";
import { ImportTemplateCard } from "../components/import/ImportTemplateCard";
import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { EmptyState } from "../components/shared/EmptyState";
import { RingCentralRecordingPlayer } from "../components/shared/RingCentralRecordingPlayer";
import { useAppState } from "../hooks/useAppState";
import { getQueueLeads } from "../lib/analytics";
import { buildLeadDestinationOptions } from "../lib/dialerNumbers";
import {
  getActiveCallStatusLabel,
  getPrimaryCallActionLabel,
  getSecondaryCallActionLabel,
  isCallLaunchDisabled,
} from "../lib/callUi";
import { parseLeadFile } from "../lib/csv";
import { buildLeadWebsiteHref, extractLeadWebsite, stripLeadWebsiteFromNotes } from "../lib/leadNotes";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatPhone,
  getCallStatusTone,
  getDispositionTone,
  getInitials,
  getLeadStatusTone,
  getPriorityTone,
  toDatetimeLocalInput,
} from "../lib/utils";
import { getActiveWrapUpSeconds } from "../lib/timeTracking";
import { formatDialNumberForSession } from "../lib/softphoneDialing";
import type { Lead, LeadPriority } from "../types";

type WorkspaceTab = "history" | "notes" | "recordings" | "timeline";

function formatRelativeTime(value?: string | null) {
  if (!value) {
    return "new";
  }

  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildCallbackDraft(value?: string | null) {
  if (value) {
    return toDatetimeLocalInput(value);
  }

  const nextHour = new Date(Date.now() + 60 * 60 * 1000);
  const offset = nextHour.getTimezoneOffset() * 60 * 1000;
  return new Date(nextHour.getTime() - offset).toISOString().slice(0, 16);
}

function buildQuickCallbackInput(hoursFromNow: number, hour?: number, minute = 0) {
  const value = new Date();
  value.setSeconds(0, 0);

  if (typeof hour === "number") {
    value.setDate(value.getDate() + hoursFromNow);
    value.setHours(hour, minute, 0, 0);
  } else {
    value.setMinutes(value.getMinutes() + hoursFromNow * 60);
  }

  return toDatetimeLocalInput(value.toISOString());
}

interface ContactDetailsFormState {
  fullName: string;
  jobTitle: string;
  email: string;
  phone: string;
  altPhone: string;
  company: string;
  location: string;
  assignedAgentId: string;
  lastContacted: string;
}

function buildContactDetailsForm(lead: Lead | null): ContactDetailsFormState {
  return {
    fullName: lead?.fullName ?? "",
    jobTitle: lead?.jobTitle ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    altPhone: lead?.altPhone ?? "",
    company: lead?.company ?? "",
    location: lead?.location ?? "",
    assignedAgentId: lead?.assignedAgentId ?? "",
    lastContacted: toDatetimeLocalInput(lead?.lastContacted),
  };
}

function buildEditedPhoneNumbers(lead: Lead, phone: string, altPhone: string) {
  const remainingNumbers = lead.phoneNumbers?.length ? lead.phoneNumbers.slice(2) : [];
  return [phone.trim(), altPhone.trim(), ...remainingNumbers].filter(Boolean);
}

function DetailSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[6px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</h3>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function PreviewDialerPage() {
  const {
    currentUser,
    users,
    leads,
    campaigns,
    queueSort,
    queueFilter,
    setQueueFilter,
    currentLeadId,
    dialerCampaignKey,
    dialerCampaignSelectionRequired,
    setDialerCampaignKey,
    activeCall,
    wrapUpLeadId,
    timeTracking,
    callLaunchPending,
    callError,
    selectLead,
    previousLead,
    nextLead,
    skipLead,
    markLeadInvalid,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    saveDisposition,
    uploadLeads,
    updateLead,
    rescheduleCallback,
  } = useAppState();

  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [callbackPanelOpen, setCallbackPanelOpen] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");
  const [callbackPriority, setCallbackPriority] = useState<LeadPriority>("High");
  const [callbackSaving, setCallbackSaving] = useState(false);
  const [callbackMessage, setCallbackMessage] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("history");
  const [heroTimer, setHeroTimer] = useState(0);
  const [wrapUpTimer, setWrapUpTimer] = useState(0);
  const [queueSearch, setQueueSearch] = useState("");
  const [destinationChoice, setDestinationChoice] = useState("custom");
  const [customDestination, setCustomDestination] = useState("");
  const [contactDetailsEditing, setContactDetailsEditing] = useState(false);
  const [contactDetailsSaving, setContactDetailsSaving] = useState(false);
  const [contactDetailsError, setContactDetailsError] = useState("");
  const [contactDetailsForm, setContactDetailsForm] = useState<ContactDetailsFormState>(
    () => buildContactDetailsForm(null),
  );
  const currentUserId = currentUser?.id ?? "";
  const currentUserRole = currentUser?.role ?? "agent";
  const currentUserTimezone = currentUser?.timezone ?? null;

  const activeDialerCampaigns = useMemo(
    () => campaigns.filter((campaign) => campaign.isActive),
    [campaigns],
  );
  const selectedDialerCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.sourceKey === dialerCampaignKey) ?? null,
    [campaigns, dialerCampaignKey],
  );
  const queue = getQueueLeads(leads, currentUserRole, currentUserId, queueSort, queueFilter, {
    campaigns,
    queueScope: dialerCampaignKey ?? "unselected",
  });
  const queueLead = currentLeadId
    ? queue.find((lead) => lead.id === currentLeadId) ?? queue[0] ?? null
    : dialerCampaignSelectionRequired
      ? null
      : queue[0] ?? null;
  const activeLeadId = wrapUpLeadId || activeCall?.leadId || queueLead?.id || currentLeadId;
  const activeLead = leads.find((lead) => lead.id === activeLeadId) ?? null;
  const scheduleCallbackDraft = callbackAt || buildCallbackDraft(activeLead?.callbackTime);
  const queuePosition = activeLead ? queue.findIndex((lead) => lead.id === activeLead.id) + 1 : 0;
  const isAdmin = currentUserRole === "admin";
  const noteEntries = useMemo(() => activeLead?.notesHistory ?? [], [activeLead]);
  const callEntries = useMemo(() => activeLead?.callHistory ?? [], [activeLead]);
  const recordingEntries = useMemo(
    () => callEntries.filter((call) => call.recordingEnabled || Boolean(call.recordingUrl)),
    [callEntries],
  );
  const queuedLeads = useMemo(
    () => queue.filter((lead) => lead.id !== activeLead?.id),
    [activeLead?.id, queue],
  );
  const filteredQueuedLeads = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) {
      return queuedLeads;
    }

    return queuedLeads.filter((lead) =>
      [lead.fullName, lead.company, lead.phone, lead.email].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [queueSearch, queuedLeads]);
  useEffect(() => {
    if (!isAdmin && workspaceTab === "recordings") {
      setWorkspaceTab("history");
    }
  }, [isAdmin, workspaceTab]);
  const headerName = activeLead?.fullName || activeCall?.displayName || "--";
  const headerPhone = activeLead?.phone || activeCall?.dialedNumber || "--";
  const headerInitials = getInitials(headerName);
  const leadDestinationOptions = useMemo(
    () => buildLeadDestinationOptions(activeLead),
    [activeLead],
  );
  const selectedDestinationOption = useMemo(
    () =>
      destinationChoice === "custom"
        ? null
        : leadDestinationOptions.find((option) => option.value === destinationChoice) ?? null,
    [destinationChoice, leadDestinationOptions],
  );
  const customDestinationTrimmed = customDestination.trim();
  const destinationPhone = selectedDestinationOption?.value ?? customDestinationTrimmed;
  const destinationPhoneIndex =
    destinationChoice === "custom" ? undefined : selectedDestinationOption?.phoneIndex;
  const destinationDialNumber = destinationPhone
    ? formatDialNumberForSession(destinationPhone, {
        callerId: null,
        timezone: currentUserTimezone,
      })
    : "";
  const canCallLead =
    Boolean(destinationDialNumber) &&
    !isCallLaunchDisabled({
      activeCall: null,
      wrapUpLeadId,
      callLaunchPending,
    });
  const isIncomingRinging = activeCall?.direction === "incoming" && activeCall?.status === "ringing";
  const primaryCallActionLabel = getPrimaryCallActionLabel(activeCall);
  const secondaryCallActionLabel = getSecondaryCallActionLabel(activeCall);
  const assignedAgentOptions = useMemo(
    () => [{ id: "", name: "Unassigned" }, ...users.map((user) => ({ id: user.id, name: user.name }))],
    [users],
  );

  useEffect(() => {
    const nextChoice = leadDestinationOptions[0]?.value ?? "custom";
    setDestinationChoice(nextChoice);
    setCustomDestination("");
  }, [activeLead?.id, leadDestinationOptions]);

  useEffect(() => {
    if (!activeCall) {
      setHeroTimer(0);
      return;
    }

    setHeroTimer(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    const interval = window.setInterval(() => {
      setHeroTimer(Math.max(1, Math.floor((Date.now() - activeCall.startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [activeCall]);

  useEffect(() => {
    if (!wrapUpLeadId) {
      setWrapUpTimer(0);
      return;
    }

    const updateWrapUpTimer = () => {
      setWrapUpTimer(getActiveWrapUpSeconds(timeTracking, new Date().toISOString()));
    };

    updateWrapUpTimer();
    const interval = window.setInterval(updateWrapUpTimer, 1000);

    return () => window.clearInterval(interval);
  }, [timeTracking, wrapUpLeadId]);

  useEffect(() => {
    if (wrapUpLeadId) {
      setWorkspaceTab("notes");
    }
  }, [wrapUpLeadId]);

  useEffect(() => {
    setContactDetailsEditing(false);
    setContactDetailsError("");
    setContactDetailsForm(buildContactDetailsForm(activeLead));
  }, [activeLead?.id]);

  useEffect(() => {
    if (contactDetailsEditing) {
      return;
    }

    setContactDetailsForm(buildContactDetailsForm(activeLead));
  }, [activeLead?.updatedAt, contactDetailsEditing]);

  if (!currentUser) {
    return null;
  }

  const campaignQueueChooser = (
    <CampaignQueueChooserModal
      open={dialerCampaignSelectionRequired}
      campaigns={activeDialerCampaigns}
      selectedCampaignKey={dialerCampaignKey}
      onSelectCampaign={(campaignKey) => setDialerCampaignKey(campaignKey)}
    />
  );

  const handleCallLead = () => {
    if (!activeLead || !destinationPhone) {
      return;
    }

    void startCall({
      phone: destinationPhone,
      leadId: activeLead.id,
      displayName: activeLead.fullName,
      phoneIndex: destinationPhoneIndex,
    }).catch(() => undefined);
  };

  const handleBulkFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadMessage("");
    setUploading(true);
    try {
      const parsed = await parseLeadFile(file);
      const result = await uploadLeads(
        parsed.rows,
        currentUserRole === "agent" ? currentUserId : undefined,
      );
      const invalidRows = parsed.invalidRows + result.invalidRows;
      setUploadMessage(
        `${result.added} leads added. ${result.duplicates} duplicates skipped.${invalidRows ? ` ${invalidRows} invalid rows ignored.` : ""}`,
      );
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Unable to load that file into the queue.",
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleScheduleCallback = async () => {
    if (!activeLead || !scheduleCallbackDraft) {
      return;
    }

    const currentIndex = queue.findIndex((lead) => lead.id === activeLead.id);
    const nextLeadId = queue[currentIndex + 1]?.id ?? queue[currentIndex - 1]?.id ?? null;

    setCallbackSaving(true);
    setCallbackMessage("");
    try {
      await rescheduleCallback(
        activeLead.id,
        new Date(scheduleCallbackDraft).toISOString(),
        callbackPriority,
      );
      setCallbackMessage(`Callback scheduled for ${activeLead.fullName}.`);
      setCallbackPanelOpen(false);
      setCallbackAt("");
      if (nextLeadId) {
        selectLead(nextLeadId);
      }
    } catch (error) {
      setCallbackMessage(
        error instanceof Error ? error.message : "Unable to schedule that callback.",
      );
    } finally {
      setCallbackSaving(false);
    }
  };

  const handleContactDetailsCancel = () => {
    setContactDetailsEditing(false);
    setContactDetailsError("");
    setContactDetailsForm(buildContactDetailsForm(activeLead));
  };

  const handleContactDetailsSave = async () => {
    if (!activeLead) {
      return;
    }

    const lastContacted = contactDetailsForm.lastContacted
      ? new Date(contactDetailsForm.lastContacted).toISOString()
      : null;

    setContactDetailsSaving(true);
    setContactDetailsError("");
    try {
      await updateLead(activeLead.id, {
        fullName: contactDetailsForm.fullName,
        jobTitle: contactDetailsForm.jobTitle,
        email: contactDetailsForm.email,
        phone: contactDetailsForm.phone,
        altPhone: contactDetailsForm.altPhone,
        phoneNumbers: buildEditedPhoneNumbers(activeLead, contactDetailsForm.phone, contactDetailsForm.altPhone),
        company: contactDetailsForm.company,
        location: contactDetailsForm.location,
        assignedAgentId: contactDetailsForm.assignedAgentId || null,
        lastContacted,
      });
      toast.success("Contact details updated.");
      setContactDetailsEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update contact details.";
      setContactDetailsError(message);
      toast.error(message);
    } finally {
      setContactDetailsSaving(false);
    }
  };

  const workspaceTabs: Array<{
    id: WorkspaceTab;
    label: string;
    icon: LucideIcon;
  }> = [
    { id: "history", label: "History", icon: History },
    { id: "notes", label: "Notes", icon: StickyNote },
    ...(isAdmin
      ? ([{ id: "recordings", label: "Recordings", icon: PlayCircle }] as Array<{
          id: WorkspaceTab;
          label: string;
          icon: LucideIcon;
        }>)
      : []),
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ];

  const leadStatusLabel = activeLead?.status ? activeLead.status.replace("_", " ") : "";
  const dialerCampaignLabel = selectedDialerCampaign?.name ?? null;
  const leadWebsite = extractLeadWebsite(activeLead?.notes ?? "");
  const callStatusText = wrapUpLeadId
    ? `Wrap-up | ${formatDuration(wrapUpTimer)}`
    : callLaunchPending
    ? "Dialing..."
    : activeCall
    ? `${getActiveCallStatusLabel(activeCall)} | ${formatDuration(heroTimer)}`
    : "Ready to dial";
  const callStatusTone = wrapUpLeadId
    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300"
    : activeCall || callLaunchPending
    ? "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-950/20 dark:text-cyan-300"
    : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  if (!activeLead) {
    return (
      <div className="space-y-4 pb-4 text-sm">
        {campaignQueueChooser}
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#eef4fb] shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
          <div className="space-y-4 px-4 py-4">
            <EmptyState
              icon={PhoneOff}
              title={
                activeDialerCampaigns.length === 0
                  ? "No active campaigns"
                  : dialerCampaignSelectionRequired
                    ? "Choose a campaign queue"
                    : dialerCampaignKey && selectedDialerCampaign
                    ? `No leads available in ${selectedDialerCampaign.name}`
                    : "No leads available in the current queue"
              }
              description={
                activeDialerCampaigns.length === 0
                  ? "Activate a campaign in Campaigns to load its queue."
                  : dialerCampaignSelectionRequired
                    ? "Pick one active campaign to load the queue. The others stay paused in Dialer."
                    : "The dialer will load the next lead automatically when one becomes available."
              }
            />
          </div>
        </section>
      </div>
    );
  }

  const leadDetails: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    href?: string | null;
  }> = [
    { icon: User, label: "Name", value: activeLead.fullName || "--" },
    { icon: Briefcase, label: "Designation", value: activeLead.jobTitle || "--" },
    { icon: Mail, label: "Email", value: activeLead.email || "--" },
    { icon: Phone, label: "Phone", value: formatPhone(activeLead.phone) },
    { icon: Phone, label: "Alt phone", value: activeLead.altPhone ? formatPhone(activeLead.altPhone) : "--" },
    { icon: Building2, label: "Company", value: activeLead.company || "--" },
    {
      icon: Globe,
      label: "Website",
      value: leadWebsite || "--",
      href: leadWebsite ? buildLeadWebsiteHref(leadWebsite) : null,
    },
    { icon: MapPin, label: "Location", value: activeLead.location || "--" },
    { icon: Clock3, label: "Assigned agent", value: activeLead.assignedAgentName || "--" },
    {
      icon: History,
      label: "Last contacted",
      value: activeLead.lastContacted ? formatDateTime(activeLead.lastContacted) : "Not contacted yet",
    },
  ];

  return (
    <div className="space-y-4 pb-4 text-sm">
      {campaignQueueChooser}
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[#eef4fb] shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
        {callError ? (
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <AlertBanner
              title="Dialer notice"
              description={callError}
              tone="error"
            />
          </div>
        ) : null}

        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              
              <div className="min-w-0">
                <p className="truncate text-[18px] font-semibold text-slate-900 dark:text-white">
                  {headerName}
                </p>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {formatPhone(headerPhone)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  {dialerCampaignLabel ? <span>{dialerCampaignLabel}</span> : null}
                  {dialerCampaignLabel ? <span>|</span> : null}
                  <span>Queue {Math.max(queuePosition, 0)} / {queue.length || 1}</span>
                  <span>|</span>
                  <span>{activeLead.company || "No company"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="md"
                variant="secondary"
                className="h-12 w-12 shrink-0 px-0 text-slate-900 dark:text-white"
                onClick={previousLead}
                disabled={Boolean(wrapUpLeadId || activeCall || callLaunchPending)}
                aria-label="Back to previous lead"
                title="Back"
              >
                <SkipBack size={26} strokeWidth={2.25} />
              </Button>

              <Button
                size="md"
                variant="secondary"
                className="h-12 w-12 shrink-0 px-0 text-slate-900 dark:text-white"
                onClick={skipLead}
                disabled={Boolean(wrapUpLeadId || activeCall || callLaunchPending)}
                aria-label="Skip current lead"
                title="Skip"
              >
                <SkipForward size={26} strokeWidth={2.25} />
              </Button>

              {secondaryCallActionLabel ? (
                <>
                  <Button
                    size="md"
                    onClick={() => void answerCall()}
                    disabled={Boolean(wrapUpLeadId) || !isIncomingRinging}
                  >
                    <PhoneCall size={15} />
                    {primaryCallActionLabel}
                  </Button>
                  <Button
                    size="md"
                    variant="danger"
                    onClick={() => void rejectCall()}
                    disabled={Boolean(wrapUpLeadId) || !isIncomingRinging}
                  >
                    <PhoneOff size={15} />
                    {secondaryCallActionLabel}
                  </Button>
                </>
              ) : (
              <Button
                size="md"
                onClick={() => {
                  if (activeCall) {
                    void endCall();
                    return;
                  }

                  void handleCallLead();
                }}
                disabled={
                  callLaunchPending ||
                  Boolean(wrapUpLeadId) ||
                  (!activeCall && !canCallLead)
                }
              >
                  {activeCall ? <PhoneOff size={15} /> : <PhoneCall size={15} />}
                  {primaryCallActionLabel}
                </Button>
              )}

              <div
                className={cn(
                  "min-w-[180px] rounded-[18px] border px-4 py-2",
                  callStatusTone,
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
                  Call log / status
                </p>
                <p className="mt-1 text-[12px] font-medium leading-5">{callStatusText}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:min-h-[calc(100vh-320px)] xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <aside className="space-y-4">
              <DetailSection title="Lead snapshot">
                <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[13px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {getInitials(activeLead.fullName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">
                      {activeLead.fullName}
                    </p>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {formatPhone(activeLead.phone)}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <div className="flex flex-col gap-2">
               
                <select
                  value={destinationChoice}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setDestinationChoice(nextValue);
                    if (nextValue !== "custom") {
                      setCustomDestination("");
                    }
                  }}
                  className="crm-input py-2 text-[12px]"
                >
                  {leadDestinationOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  <option value="custom">Custom number</option>
                </select>
               
              </div>

              {destinationChoice === "custom" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Custom number
                  </p>
                  <input
                    value={customDestination}
                    onChange={(event) => setCustomDestination(event.target.value)}
                    placeholder="Enter destination phone number"
                    inputMode="tel"
                    className="crm-input py-2 text-[12px]"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-4 text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <Badge className={getLeadStatusTone(activeLead.status)}>
                    {leadStatusLabel}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Priority</span>
                  <Badge className={getPriorityTone(activeLead.priority)}>
                    {activeLead.priority}
                  </Badge>
                </div>
              </div>
            </div>
              </DetailSection>

              <DetailSection
                title="Contact details"
                action={
                  contactDetailsEditing ? (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleContactDetailsCancel}
                        disabled={contactDetailsSaving}
                      >
                        <XCircle size={14} />
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleContactDetailsSave()}
                        disabled={contactDetailsSaving}
                      >
                        <Save size={14} />
                        {contactDetailsSaving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setContactDetailsEditing(true)}
                    >
                      <PencilLine size={14} />
                      Edit
                    </Button>
                  )
                }
              >
                {contactDetailsEditing ? (
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleContactDetailsSave();
                    }}
                  >
                    {contactDetailsError ? (
                      <AlertBanner
                        title="Update failed"
                        description={contactDetailsError}
                        tone="error"
                      />
                    ) : null}

                    <div className="grid gap-3">
                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Name
                        </p>
                        <input
                          value={contactDetailsForm.fullName}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, fullName: event.target.value }))
                          }
                          type="text"
                          placeholder="Lead name"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Designation
                        </p>
                        <input
                          value={contactDetailsForm.jobTitle}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, jobTitle: event.target.value }))
                          }
                          type="text"
                          placeholder="Job title"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Email
                        </p>
                        <input
                          value={contactDetailsForm.email}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, email: event.target.value }))
                          }
                          type="email"
                          placeholder="name@example.com"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Phone
                        </p>
                        <input
                          value={contactDetailsForm.phone}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, phone: event.target.value }))
                          }
                          type="tel"
                          placeholder="+1 212 555 0100"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Alt phone
                        </p>
                        <input
                          value={contactDetailsForm.altPhone}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, altPhone: event.target.value }))
                          }
                          type="tel"
                          placeholder="+1 212 555 0101"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Company
                        </p>
                        <input
                          value={contactDetailsForm.company}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, company: event.target.value }))
                          }
                          type="text"
                          placeholder="Company name"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Location
                        </p>
                        <input
                          value={contactDetailsForm.location}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({ ...current, location: event.target.value }))
                          }
                          type="text"
                          placeholder="Street, city, state"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Assigned agent
                        </p>
                        <select
                          value={contactDetailsForm.assignedAgentId}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({
                              ...current,
                              assignedAgentId: event.target.value,
                            }))
                          }
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        >
                          {assignedAgentOptions.map((agent) => (
                            <option key={agent.id || "unassigned"} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                          Last contacted
                        </p>
                        <input
                          value={contactDetailsForm.lastContacted}
                          onChange={(event) =>
                            setContactDetailsForm((current) => ({
                              ...current,
                              lastContacted: event.target.value,
                            }))
                          }
                          type="datetime-local"
                          className="crm-input py-2 text-[12px]"
                          disabled={contactDetailsSaving}
                        />
                      </label>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-3">
                    {leadDetails.map((item) => (
                      <div key={item.label} className="flex gap-3">
                        <div className="mt-0.5 text-slate-400 dark:text-slate-500">
                          <item.icon size={15} />
                        </div>
                        <div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400">{item.label}</p>
                          <p className="mt-0.5 text-[13px] text-slate-900 dark:text-white">
                            {item.href ? (
                              <a
                                href={item.href}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-sky-700 transition hover:text-sky-800 dark:text-cyan-300 dark:hover:text-cyan-200"
                              >
                                {item.value}
                              </a>
                            ) : (
                              item.value
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DetailSection>
            </aside>

            <section className="min-w-0">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950">
                <div className="border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex flex-wrap items-center gap-5">
                    {workspaceTabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = workspaceTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setWorkspaceTab(tab.id)}
                          className={cn(
                            "inline-flex items-center gap-2 border-b-2 px-1 py-3 text-[12px] font-medium transition",
                            isActive
                              ? "border-surface-700 text-surface-700 dark:border-cyan-400 dark:text-cyan-300"
                              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
                          )}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 bg-[#f5f7fc] p-4 dark:bg-slate-950">
                  {workspaceTab === "history" ? (
                    <DetailSection title="Call history" className="p-4">
                      {callEntries.length ? (
                        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                          <table className="min-w-[680px] w-full border-collapse">
                            <thead className="bg-slate-50 dark:bg-slate-900/50">
                              <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                <th className="px-3 py-2.5">Outcome</th>
                                <th className="px-3 py-2.5">Disposition</th>
                                <th className="px-3 py-2.5">Duration</th>
                                <th className="px-3 py-2.5">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {callEntries.map((call) => {
                                const outcomeLabel =
                                  call.source === "failed_attempt" || call.status === "failed"
                                    ? "Failed"
                                    : call.status.replace(/_/g, " ");

                                return (
                                  <tr
                                    key={call.id}
                                    className="border-t border-slate-200 text-[11px] text-slate-700 dark:border-slate-800 dark:text-slate-200"
                                  >
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <Badge
                                        className={cn(
                                          "px-2.5 py-1 text-[10px] font-medium",
                                          getCallStatusTone(call.status),
                                        )}
                                      >
                                        {outcomeLabel}
                                      </Badge>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5">
                                      <Badge
                                        className={cn(
                                          "px-2.5 py-1 text-[10px] font-medium",
                                          getDispositionTone(call.disposition),
                                        )}
                                      >
                                        {call.disposition}
                                      </Badge>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                                      {formatDuration(call.durationSeconds)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500 dark:text-slate-400">
                                      {formatDateTime(call.createdAt)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">
                          No calls yet.
                        </p>
                      )}
                    </DetailSection>
                  ) : null}

                  {workspaceTab === "notes" ? (
                    <div className="space-y-4">
                      {wrapUpLeadId && activeLead ? (
                        <PostCallPanel
                          key={activeLead.id}
                          open
                          leadName={activeLead.fullName}
                          onSave={async (input) => {
                            await saveDisposition(input, activeLead.id);
                          }}
                        />
                      ) : null}

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <DetailSection title="Notes history">
                          <div className="space-y-3">
                            {noteEntries.length ? (
                              noteEntries.map((note) => (
                                <div
                                  key={note.id}
                                  className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-[13px] font-medium text-slate-900 dark:text-white">
                                      {note.authorName}
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      {formatDateTime(note.createdAt)}
                                    </p>
                                  </div>
                                  <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                                    {note.body}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                                No notes yet.
                              </p>
                            )}
                          </div>
                        </DetailSection>

                        <DetailSection title="Summary">
                          <p className="text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                            {stripLeadWebsiteFromNotes(activeLead.notes) || "No note saved."}
                          </p>
                        </DetailSection>
                      </div>
                    </div>
                  ) : null}

                  {workspaceTab === "recordings" && isAdmin ? (
                    <DetailSection
                      title="Recordings"
                      className="space-y-4"
                    >
                      {recordingEntries.length ? (
                        <div className="space-y-3">
                          {recordingEntries.map((call) => {
                            const hasRecordingUrl = Boolean(call.recordingUrl);
                            const recordingLabel = hasRecordingUrl
                              ? "Ready"
                              : call.recordingEnabled
                                ? "Processing"
                                : "Unavailable";
                            const recordingTone = hasRecordingUrl
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300"
                              : call.recordingEnabled
                                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300"
                                : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

                            return (
                              <div
                                key={call.id}
                                className="rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-white">
                                      {call.leadName}
                                    </p>
                                    <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                                      {formatPhone(call.phone)} • {formatDateTime(call.createdAt)}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      className={cn(
                                        "px-2.5 py-1 text-[10px] font-medium",
                                        getCallStatusTone(call.status),
                                      )}
                                    >
                                      {call.callType === "incoming" ? "Incoming" : "Outgoing"}
                                    </Badge>
                                    <Badge
                                      className={cn(
                                        "px-2.5 py-1 text-[10px] font-medium",
                                        getDispositionTone(call.disposition),
                                      )}
                                    >
                                      {call.disposition}
                                    </Badge>
                                    <Badge
                                      className={cn(
                                        "px-2.5 py-1 text-[10px] font-medium",
                                        recordingTone,
                                      )}
                                    >
                                      {recordingLabel}
                                    </Badge>
                                  </div>
                                </div>

                                {hasRecordingUrl ? (
                                  <div className="mt-4 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <RingCentralRecordingPlayer callLogId={call.id} />
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Duration {formatDuration(call.durationSeconds)}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-4 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                                    {call.recordingEnabled
                                      ? "Recording metadata is available, but the media file is still processing."
                                      : "This call does not have a recording attached."}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <EmptyState
                          icon={PlayCircle}
                          title="No recordings yet"
                          description="Recorded calls will appear here once RingCentral provides a recording URL for completed calls."
                        />
                      )}
                    </DetailSection>
                  ) : null}

                  {workspaceTab === "timeline" ? (
                    <div className="rounded-[18px] border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
                      <ActivityTimeline lead={activeLead} embedded />
                    </div>
                  ) : null}

                </div>
              </div>
            </section>
          </div>
        </div>

      </section>
    </div>
  );
}
