import { useState } from "react";
import {
  Copy,
  LockKeyhole,
  RefreshCcw,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import {
  createRingCentralVideoMeeting,
  type RingCentralVideoMeeting,
  type RingCentralVideoMeetingType,
} from "../services/ringcentral";

const meetingTypeOptions: Array<{
  value: RingCentralVideoMeetingType;
  label: string;
  description: string;
}> = [
  {
    value: "Instant",
    label: "Instant",
    description: "Good for one-off meetings. RingCentral retains the bridge for about three days.",
  },
  {
    value: "Scheduled",
    label: "Scheduled",
    description: "Reusable bridge. RingCentral does not store calendar time, so pair it with your invite.",
  },
  {
    value: "PMI",
    label: "PMI",
    description: "Uses the host's personal meeting bridge.",
  },
];

const initialMeetingForm = {
  name: "CRM Dialer Meeting",
  type: "Instant" as RingCentralVideoMeetingType,
  passwordProtected: false,
  password: "",
  joinBeforeHost: true,
  audioMuted: false,
  videoMuted: false,
};

function FieldLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-slate-900 dark:text-white">
        {title}
      </p>
      {description ? (
        <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string | null;
  onCopy?: (value: string) => void;
}) {
  return (
    <div className="crm-subtle-card space-y-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {value && onCopy ? (
          <button
            type="button"
            onClick={() => onCopy(value)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 transition hover:text-sky-800 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            <Copy size={12} />
            Copy
          </button>
        ) : null}
      </div>
      <p className="break-all text-sm font-medium text-slate-900 dark:text-white">
        {value || "Not available"}
      </p>
    </div>
  );
}

export function MeetingsPage() {
  const {
    currentUser,
    ringCentralStatus,
    connectRingCentral,
    refreshRingCentralStatus,
  } = useAppState();
  const [form, setForm] = useState(initialMeetingForm);
  const [createdMeeting, setCreatedMeeting] = useState<RingCentralVideoMeeting | null>(null);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [creatingMeeting, setCreatingMeeting] = useState(false);
  const [connectingRingCentral, setConnectingRingCentral] = useState(false);

  if (!currentUser) {
    return null;
  }

  const selectedType = meetingTypeOptions.find((option) => option.value === form.type) ?? meetingTypeOptions[0];

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Clipboard access is not available in this browser.");
    }
  };

  const handleConnectRingCentral = async () => {
    try {
      setMeetingError(null);
      setConnectingRingCentral(true);
      await connectRingCentral();
      await refreshRingCentralStatus({ force: true });
    } catch (error) {
      setMeetingError(
        error instanceof Error ? error.message : "Unable to connect RingCentral.",
      );
    } finally {
      setConnectingRingCentral(false);
    }
  };

  const handleCreateMeeting = async () => {
    try {
      setMeetingError(null);
      setCreatingMeeting(true);
      const meeting = await createRingCentralVideoMeeting({
        name: form.name,
        type: form.type,
        passwordProtected: form.passwordProtected,
        password: form.passwordProtected ? form.password : null,
        joinBeforeHost: form.joinBeforeHost,
        audioMuted: form.audioMuted,
        videoMuted: form.videoMuted,
      });
      setCreatedMeeting(meeting);
      toast.success("Meeting bridge created.");
    } catch (error) {
      setMeetingError(
        error instanceof Error ? error.message : "Unable to create the RingCentral meeting.",
      );
    } finally {
      setCreatingMeeting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Meetings"
        title="RingCentral video meetings"
        description="Create RingCentral Video meeting bridges directly from the CRM. This follows the RingCentral Video quick start flow, but keeps the account credentials on the server."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => refreshRingCentralStatus({ force: true })}
            >
              <RefreshCcw size={14} />
              Refresh status
            </Button>
            {!ringCentralStatus.connected ? (
              <Button
                onClick={handleConnectRingCentral}
                disabled={connectingRingCentral}
              >
                <Video size={14} />
                {connectingRingCentral ? "Connecting..." : "Connect RingCentral"}
              </Button>
            ) : null}
          </div>
        }
      />

      {!ringCentralStatus.connected && meetingError ? (
        <Card className="px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {meetingError}
        </Card>
      ) : null}

      {!ringCentralStatus.connected ? (
        <EmptyState
          icon={Video}
          title="RingCentral is not connected"
          description="Connect RingCentral first, then come back here to create meetings from the CRM."
          action={
            <Button
              onClick={handleConnectRingCentral}
              disabled={connectingRingCentral}
            >
              <Video size={14} />
              {connectingRingCentral ? "Connecting..." : "Connect RingCentral"}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="crm-subtle-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Status
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  Connected
                </p>
              </div>
              <div className="crm-subtle-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Extension
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {ringCentralStatus.extensionId || "Current user"}
                </p>
              </div>
              <div className="crm-subtle-card px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  Account
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {ringCentralStatus.accountId || "Current account"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <FieldLabel
                title="Meeting name"
                description="RingCentral uses the bridge name for the room users join."
              />
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="h-11 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder="CRM Dialer Meeting"
              />
            </div>

            <div className="space-y-4">
              <FieldLabel
                title="Bridge type"
                description={selectedType.description}
              />
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as RingCentralVideoMeetingType,
                  }))
                }
                className="h-11 w-full rounded-[12px] border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {meetingTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="crm-subtle-card flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.passwordProtected}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      passwordProtected: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Require password
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                    Leave the password blank if you want RingCentral to auto-generate one.
                  </p>
                </div>
              </label>

              <label className="crm-subtle-card flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.joinBeforeHost}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      joinBeforeHost: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Join before host
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                    Let participants enter the room before the host arrives.
                  </p>
                </div>
              </label>
            </div>

            {form.passwordProtected ? (
              <div className="space-y-4">
                <FieldLabel
                  title="Meeting password"
                  description="Optional. Provide one to control the password yourself."
                />
                <div className="relative">
                  <LockKeyhole
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={form.password}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, password: event.target.value }))
                    }
                    className="h-11 w-full rounded-[12px] border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-[#1f7db3] dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    placeholder="Auto-generate if left blank"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="crm-subtle-card flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.audioMuted}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      audioMuted: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Mute audio on join
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                    Participants join with their microphones muted.
                  </p>
                </div>
              </label>

              <label className="crm-subtle-card flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.videoMuted}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      videoMuted: event.target.checked,
                    }))
                  }
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Mute video on join
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                    Participants join with video disabled.
                  </p>
                </div>
              </label>
            </div>

            {ringCentralStatus.message ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {ringCentralStatus.message}
              </div>
            ) : null}

            {meetingError ? (
              <div className="crm-subtle-card px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                {meetingError}
              </div>
            ) : null}

            <Button
              onClick={handleCreateMeeting}
              disabled={creatingMeeting}
              className="w-full"
            >
              <Video size={14} />
              {creatingMeeting ? "Creating meeting..." : "Create meeting"}
            </Button>
          </Card>

          <Card className="space-y-5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="crm-section-label text-sky-700 dark:text-cyan-300">
                  Latest bridge
                </p>
                <h3 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                  {createdMeeting?.name || "No meeting created yet"}
                </h3>
              </div>
              {createdMeeting?.type ? (
                <div className="rounded-full bg-cyan-100 px-3 py-1 text-[11px] font-medium text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                  {createdMeeting.type}
                </div>
              ) : null}
            </div>

            {createdMeeting ? (
              <>
                <div className="crm-subtle-card space-y-3 px-4 py-4">
                  <FieldLabel
                    title="Join URL"
                    description="Open the meeting or copy the link into a calendar invite, SMS, or email."
                  />
                  <div className="rounded-[12px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <p className="break-all">{createdMeeting.joinUrl || "Join link not returned."}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        if (createdMeeting.joinUrl) {
                          window.open(createdMeeting.joinUrl, "_blank", "noopener,noreferrer");
                        }
                      }}
                      disabled={!createdMeeting.joinUrl}
                    >
                      Open meeting
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (createdMeeting.joinUrl) {
                          void copyValue(createdMeeting.joinUrl);
                        }
                      }}
                      disabled={!createdMeeting.joinUrl}
                    >
                      <Copy size={14} />
                      Copy link
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField
                    label="Web PIN"
                    value={createdMeeting.webPin}
                    onCopy={(value) => void copyValue(value)}
                  />
                  <DetailField
                    label="Participant PSTN"
                    value={createdMeeting.participantCode}
                    onCopy={(value) => void copyValue(value)}
                  />
                  <DetailField
                    label="Host code"
                    value={createdMeeting.hostCode}
                    onCopy={(value) => void copyValue(value)}
                  />
                  <DetailField
                    label="Password"
                    value={createdMeeting.password}
                    onCopy={(value) => void copyValue(value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="crm-subtle-card px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Join before host
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {createdMeeting.joinBeforeHost ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                  <div className="crm-subtle-card px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Audio on join
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {createdMeeting.audioMuted ? "Muted" : "Live"}
                    </p>
                  </div>
                  <div className="crm-subtle-card px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                      Video on join
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                      {createdMeeting.videoMuted ? "Muted" : "Live"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-950/40">
                <div className="rounded-full bg-slate-100 p-4 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Video size={26} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-[20px] font-semibold text-slate-900 dark:text-white">
                    No bridge created yet
                  </h3>
                  <p className="max-w-md text-[13px] leading-6 text-slate-500 dark:text-slate-400">
                    Use the form to create an instant or reusable RingCentral Video bridge, then the join details will appear here.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Card className="grid gap-3 p-5 md:grid-cols-3">
        <div className="crm-subtle-card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Quick start
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            This tab calls RingCentral&apos;s bridge endpoint for the current connected user and surfaces the returned `discovery.web` join URL.
          </p>
        </div>
        <div className="crm-subtle-card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Scheduled bridges
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            A scheduled bridge is reusable, but RingCentral does not persist meeting date or time on the bridge itself.
          </p>
        </div>
        <div className="crm-subtle-card px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            API status
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            RingCentral currently documents the Video REST API as beta, so contract changes may still happen upstream.
          </p>
        </div>
      </Card>
    </div>
  );
}
