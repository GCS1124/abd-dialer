import {
  AlertTriangle,
  Copy,
  MoreVertical,
  PhoneCall,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AlertBanner } from "../components/shared/AlertBanner";
import { Badge } from "../components/shared/Badge";
import { Button } from "../components/shared/Button";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { RingCentralRecordingPlayer } from "../components/shared/RingCentralRecordingPlayer";
import { useAppState } from "../hooks/useAppState";
import { mergeCallLogsForView, type MergedCallLog } from "../lib/callLogGrouping";
import {
  cn,
  formatDateTime,
  formatDuration,
  formatPhone,
  formatRelativeAge,
  isToday,
  toDatetimeLocalInput,
} from "../lib/utils";
import type { CallLog, CallLogFormInput, CallType, LeadPriority } from "../types";

type CallPanelMode = "closed" | "view" | "edit" | "create";
type RecordingStatus = "Ready" | "Processing" | "Unavailable";

type CallViewFilter = "all" | "today" | "pending" | "priority";

function getRecordingStatus(call: Pick<CallLog, "recordingEnabled" | "recordingUrl">) {
  const hasRecordingUrl = Boolean(call.recordingUrl);
  const status: RecordingStatus = hasRecordingUrl
    ? "Ready"
    : call.recordingEnabled
      ? "Processing"
      : "Unavailable";

  const toneClass = hasRecordingUrl
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
    : call.recordingEnabled
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return { hasRecordingUrl, status, toneClass };
}

function toFormInput(call?: CallLog): CallLogFormInput {
  if (!call) {
    return {
      leadId: "",
      callType: "outgoing",
      durationSeconds: 180,
      status: "connected",
      notes: "",
      callbackAt: "",
      priority: "Medium",
    };
  }

  return {
    leadId: call.leadId,
    callType: call.callType,
    durationSeconds: call.durationSeconds,
    status: call.status,
    notes: call.notes,
    callbackAt: call.followUpAt ?? "",
    priority: "Medium",
  };
}

export function CallsPage() {
  const {
    leads,
    currentUser,
    createCallLog,
    updateCallLog,
    deleteCallLog,
    deleteCallLogs,
    syncRingCentralRecordings,
    workspaceLoading,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<CallViewFilter>("all");
  const [panelMode, setPanelMode] = useState<CallPanelMode>("closed");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [form, setForm] = useState<CallLogFormInput>(toFormInput());
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [openMenuCallId, setOpenMenuCallId] = useState<string | null>(null);
  const recordingRefreshAttemptedCallIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!openMenuCallId) {
      return;
    }

    const dismiss = () => setOpenMenuCallId(null);
    window.addEventListener("click", dismiss);

    return () => window.removeEventListener("click", dismiss);
  }, [openMenuCallId]);

  const rawCalls = useMemo(
    () =>
      leads
        .flatMap((lead) => lead.callHistory)
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      ),
    [leads],
  );
  const calls = useMemo(() => mergeCallLogsForView(rawCalls), [rawCalls]);
  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedCallId) ?? null,
    [calls, selectedCallId],
  );
  const normalCalls = useMemo(
    () => calls.filter((call) => call.source !== "failed_attempt" && call.status !== "failed"),
    [calls],
  );
  const failedAttemptCount = calls.length - normalCalls.length;

  const filteredCalls = useMemo(() => {
    const lowered = query.trim().toLowerCase();

    return calls.filter((call) => {
      const matchesQuery = !lowered || call.searchText.includes(lowered);

      const lead = leads.find((item) => item.id === call.leadId);
      const matchesView =
        viewFilter === "all"
          ? true
          : viewFilter === "today"
            ? isToday(call.createdAt)
            : viewFilter === "pending"
              ? call.status === "follow_up" || Boolean(call.followUpAt)
              : lead?.priority === "High" || lead?.priority === "Urgent";

      return matchesQuery && matchesView;
    });
  }, [calls, leads, query, viewFilter]);

  const todayCalls = normalCalls.filter((call) => isToday(call.createdAt)).length;
  const weekCalls = normalCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000,
  ).length;
  const monthCalls = normalCalls.filter(
    (call) => Date.now() - new Date(call.createdAt).getTime() <= 30 * 24 * 60 * 60 * 1000,
  ).length;
  const hasFilters = Boolean(query.trim()) || viewFilter !== "all";
  const canViewRecordings =
    currentUser?.role === "admin" || currentUser?.role === "team_leader";
  const selectedRecordingState = selectedCall ? getRecordingStatus(selectedCall) : null;

  const activeLead = leads.find((lead) => lead.id === form.leadId);
  const openCreate = () => {
    const defaultLeadId = leads[0]?.id ?? "";
    setSelectedCallId(null);
    setPanelMode("create");
    setForm({ ...toFormInput(), leadId: defaultLeadId });
    setEditorError("");
    setOpenMenuCallId(null);
    recordingRefreshAttemptedCallIdRef.current = null;
  };

  const openEdit = (call: CallLog) => {
    setSelectedCallId(call.id);
    setPanelMode("edit");
    setForm(toFormInput(call));
    setEditorError("");
    setOpenMenuCallId(null);
    recordingRefreshAttemptedCallIdRef.current = null;
  };

  const openCall = (callId: string) => {
    setSelectedCallId(callId);
    setPanelMode("view");
    setEditorError("");
    setOpenMenuCallId(null);
    recordingRefreshAttemptedCallIdRef.current = null;
  };

  const closePanel = () => {
    setPanelMode("closed");
    setSelectedCallId(null);
    setEditorError("");
    setSaving(false);
    setOpenMenuCallId(null);
    recordingRefreshAttemptedCallIdRef.current = null;
  };

  const refreshRecordings = async () => {
    if (!selectedCall) {
      return;
    }

    recordingRefreshAttemptedCallIdRef.current = selectedCall.id;
    await syncRingCentralRecordings().catch(() => undefined);
  };

  useEffect(() => {
    if (panelMode === "create") {
      return;
    }

    if (selectedCallId && !selectedCall) {
      setPanelMode("closed");
      setSelectedCallId(null);
      setEditorError("");
      setSaving(false);
      setOpenMenuCallId(null);
      recordingRefreshAttemptedCallIdRef.current = null;
    }
  }, [panelMode, selectedCall, selectedCallId]);

  useEffect(() => {
    if (panelMode !== "view" || !selectedCall || !canViewRecordings) {
      return;
    }

    if (selectedRecordingState?.hasRecordingUrl || workspaceLoading) {
      return;
    }

    if (recordingRefreshAttemptedCallIdRef.current === selectedCall.id) {
      return;
    }

    recordingRefreshAttemptedCallIdRef.current = selectedCall.id;
    void syncRingCentralRecordings().catch(() => undefined);
  }, [
    canViewRecordings,
    panelMode,
    selectedCall,
    selectedRecordingState?.hasRecordingUrl,
    syncRingCentralRecordings,
    workspaceLoading,
  ]);

  const copyRecordingUrl = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Clipboard access is not available in this browser.");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setViewFilter("all");
  };

  const handleDeleteCall = async (call: MergedCallLog) => {
    try {
      if (call.mergedCallIds.length > 1) {
        await deleteCallLogs(call.mergedCallIds);
      } else {
        await deleteCallLog(call.id);
      }
      toast.success("Call log deleted.");
      closePanel();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete the call log.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Call Management"
        title="Calls workspace"
        description="Track calls, outcomes, and follow-ups in one compact log."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Quick add call
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Today" value={todayCalls} icon={PhoneCall} />
        <MetricCard label="This week" value={weekCalls} icon={Search} />
        <MetricCard label="This month" value={monthCalls} icon={Plus} />
        <MetricCard
          label="Failed attempts"
          value={String(failedAttemptCount)}
          icon={AlertTriangle}
        />
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "All calls"],
            ["today", "Today's calls"],
            ["pending", "Pending callbacks"],
            ["priority", "High priority leads"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewFilter(value as CallViewFilter)}
              className={
                value === viewFilter
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-[12px] font-medium text-white dark:bg-white dark:text-slate-900"
                  : "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              }
            >
              {label}
            </button>
          ))}
        </div>

        <label className="relative block">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or number"
            className="crm-input py-3 pl-11"
          />
        </label>
      </Card>

      {filteredCalls.length ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="crm-table min-w-[790px] text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.16em]">
                  <th className="w-[180px]">Lead</th>
                  <th className="w-[150px]">Phone</th>
                  <th className="w-[120px]">Agent</th>
                  <th className="w-[130px]">Date / time</th>
                  <th className="w-[80px]">Age</th>
                  <th className="w-[140px]">Disposition</th>
                  <th className="w-[110px]">Recording</th>
                  <th className="w-[88px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => {
                  const recordingState = getRecordingStatus(call);
                  const isSelected = selectedCallId === call.id;

                  return (
                    <tr
                      key={call.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open call log for ${call.leadName}`}
                      onClick={() => openCall(call.id)}
                      onKeyDown={(event) => {
                        if (event.currentTarget !== event.target) {
                          return;
                        }

                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCall(call.id);
                        }
                      }}
                      className={cn(
                        "border-t border-slate-200/80 transition hover:bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500/30 dark:border-slate-800 dark:hover:bg-slate-900/60",
                        isSelected && "bg-cyan-50/70 dark:bg-cyan-950/20",
                      )}
                    >
                      <td className="px-3 py-3">
                        <p className="truncate text-[12px] font-semibold leading-tight text-slate-900 dark:text-white">
                          {call.leadName}
                        </p>
                        {call.mergedCount > 1 ? (
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                            Merged {call.mergedCount} logs
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate text-[12px] font-medium leading-tight text-slate-700 dark:text-slate-200">
                          {formatPhone(call.phone)}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="truncate text-[12px] font-medium leading-tight text-slate-700 dark:text-slate-200">
                          {call.agentName}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-slate-700 dark:text-slate-200">
                        {formatDateTime(call.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-slate-600 dark:text-slate-400">
                        {formatRelativeAge(call.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <Badge className="bg-slate-100 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {call.disposition}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Badge className={cn("text-[11px] font-medium", recordingState.toneClass)}>
                          {recordingState.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenuCallId((current) =>
                                  current === call.id ? null : call.id,
                                );
                              }}
                              aria-label={`Open actions for ${call.leadName}`}
                              aria-expanded={openMenuCallId === call.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-200"
                            >
                              <MoreVertical size={14} />
                            </button>

                            {openMenuCallId === call.id ? (
                              <div
                                onClick={(event) => event.stopPropagation()}
                                className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-40 rounded-[14px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.18)] dark:border-slate-800 dark:bg-slate-950"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuCallId(null);
                                    openCall(call.id);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuCallId(null);
                                    openEdit(call);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuCallId(null);
                                    void handleDeleteCall(call);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] text-rose-600 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : calls.length ? (
        <EmptyState
          icon={PhoneCall}
          title="No call logs match this view"
          description="Adjust the filters or clear the search to see more activity."
          action={
            hasFilters ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon={PhoneCall}
          title={workspaceLoading ? "Loading call activity" : "No call logs yet"}
          description={
            workspaceLoading
              ? "The CRM is loading recent activity."
              : "Use quick add call to capture the first interaction and start building lead history."
          }
          action={
            !workspaceLoading ? (
              <Button onClick={openCreate}>
                <Plus size={16} />
                Quick add call
              </Button>
            ) : undefined
          }
        />
      )}

      <button
        type="button"
        onClick={openCreate}
        className="fixed bottom-6 right-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#1f7db3] text-white shadow-[0_16px_34px_rgba(31,125,179,0.35)] transition hover:bg-[#186791]"
        aria-label="Quick add call"
      >
        <Plus size={22} />
      </button>

      {panelMode !== "closed" ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-3 sm:p-4"
          onClick={closePanel}
        >
          <div className="mx-auto flex min-h-full max-w-[920px] items-center justify-center py-4">
            <div
              className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[20px] border border-slate-200 bg-[#eef4fb] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)] dark:border-slate-800 dark:bg-slate-950"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                    {panelMode === "view" ? "Call log" : "Quick add"}
                  </p>
                  <h2 className="mt-1 text-[16px] font-semibold text-slate-900 dark:text-white">
                    {panelMode === "view"
                      ? "Call details"
                      : panelMode === "edit"
                        ? "Edit call"
                        : "Add call"}
                  </h2>
                  {selectedCall && panelMode !== "create" ? (
                    <div className="mt-1 space-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <p>
                        {formatPhone(selectedCall.phone)} · {selectedCall.agentName} ·{" "}
                        {formatDateTime(selectedCall.createdAt)}
                      </p>
                      {selectedCall.mergedCount > 1 ? (
                        <p>Merged from {selectedCall.mergedCount} call logs.</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {panelMode === "view" && selectedCall ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEdit(selectedCall)}
                      >
                      Edit
                    </Button>
                  ) : null}
                  {panelMode === "edit" && selectedCall ? (
                    <Button variant="secondary" size="sm" onClick={() => openCall(selectedCall.id)}>
                      View only
                    </Button>
                  ) : null}
                  {panelMode === "edit" && selectedCall ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDeleteCall(selectedCall)}
                    >
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={closePanel}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                {panelMode === "view" && selectedCall ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="crm-subtle-card p-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Lead
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                          {selectedCall.leadName}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatPhone(selectedCall.phone)}
                        </p>
                      </div>
                      <div className="crm-subtle-card p-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Agent
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                          {selectedCall.agentName}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatRelativeAge(selectedCall.createdAt)}
                        </p>
                      </div>
                      <div className="crm-subtle-card p-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Date / time
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                          {formatDateTime(selectedCall.createdAt)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {formatDuration(selectedCall.durationSeconds)}
                        </p>
                      </div>
                      <div className="crm-subtle-card p-3">
                        <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                          Status
                        </p>
                        <p className="mt-1 text-[12px] font-semibold text-slate-900 dark:text-white">
                          {selectedCall.disposition}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedCall.followUpAt
                            ? `Follow-up ${formatDateTime(selectedCall.followUpAt)}`
                            : "No follow-up scheduled"}
                        </p>
                      </div>
                      {canViewRecordings ? (
                        <div className="crm-subtle-card space-y-3 p-3 md:col-span-2 xl:col-span-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                Recording
                              </p>
                              <Badge
                                className={cn(
                                  "text-[10px] font-medium",
                                  selectedRecordingState?.toneClass,
                                )}
                              >
                                {selectedRecordingState?.status}
                              </Badge>
                              <Badge className="bg-slate-100 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {formatDuration(selectedCall.durationSeconds)}
                              </Badge>
                            </div>

                            {selectedRecordingState?.hasRecordingUrl ? null : (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void refreshRecordings()}
                                disabled={workspaceLoading}
                              >
                                {workspaceLoading ? "Refreshing..." : "Refresh recordings"}
                              </Button>
                            )}
                          </div>

                          {selectedCall.recordingUrl ? (
                            <div className="space-y-3">
                              <div className="rounded-[14px] border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                                      Recording URL
                                    </p>
                                    <p className="mt-1 break-all text-[11px] leading-5 text-slate-600 dark:text-slate-300">
                                      {selectedCall.recordingUrl}
                                    </p>
                                  </div>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void copyRecordingUrl(selectedCall.recordingUrl ?? "")}
                                  >
                                    <Copy size={13} />
                                    Copy URL
                                  </Button>
                                </div>
                              </div>

                              <RingCentralRecordingPlayer callLogId={selectedCall.id} autoLoad />
                            </div>
                          ) : (
                            <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                              {selectedCall.recordingEnabled
                                ? "Recording metadata is available, but the media file is still processing."
                                : "This call does not have a recording attached yet. Refresh recordings to check RingCentral again."}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
                      <Card className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                              Notes details
                            </p>
                            <h3 className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-white">
                              Call notes
                            </h3>
                          </div>
                          <Badge className="bg-slate-100 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            {selectedCall.disposition}
                          </Badge>
                        </div>

                        <p className="text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                          {selectedCall.notes || "No note saved."}
                        </p>

                        <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            Outcome summary
                          </p>
                          <p className="mt-1 text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                            {selectedCall.outcomeSummary || "No outcome summary captured."}
                          </p>
                        </div>

                        <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                          <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            Follow-up
                          </p>
                          <p className="mt-1 text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                            {selectedCall.followUpAt
                              ? formatDateTime(selectedCall.followUpAt)
                              : "No follow-up scheduled"}
                          </p>
                        </div>
                      </Card>

                      <Card className="space-y-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                              AI preview
                            </p>
                            <h3 className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-white">
                              Suggested next action
                            </h3>
                          </div>
                          <Badge className="bg-cyan-50 text-[10px] text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200">
                            {selectedCall.sentiment}
                          </Badge>
                        </div>

                        <p className="text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                          {selectedCall.aiSummary || "No AI preview available."}
                        </p>

                        <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                          <p className="text-[9px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                            Suggested next action
                          </p>
                          <p className="mt-1 text-[12px] leading-6 text-slate-600 dark:text-slate-300">
                            {selectedCall.suggestedNextAction || "No next action suggested."}
                          </p>
                        </div>
                      </Card>
                    </div>
                  </div>
                ) : null}

                {panelMode === "edit" || panelMode === "create" ? (
                  <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-[10px]">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            Contact
                          </span>
                          <select
                            value={form.leadId}
                            onChange={(event) =>
                              setForm((current) => ({ ...current, leadId: event.target.value }))
                            }
                            disabled={panelMode === "edit"}
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="">Select lead</option>
                            {leads.map((lead) => (
                              <option key={lead.id} value={lead.id}>
                                {lead.fullName} {lead.company ? `| ${lead.company}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1 text-[10px]">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            Call type
                          </span>
                          <select
                            value={form.callType}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                callType: event.target.value as CallType,
                              }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="outgoing">Outgoing</option>
                            <option value="incoming">Incoming</option>
                          </select>
                        </label>

                        <label className="space-y-1 text-[10px]">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            Call duration
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={form.durationSeconds}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                durationSeconds: Number(event.target.value || 0),
                              }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>

                        <label className="space-y-1 text-[10px]">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            Callback time
                          </span>
                          <input
                            type="datetime-local"
                            value={toDatetimeLocalInput(form.callbackAt)}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                callbackAt: event.target.value
                                  ? new Date(event.target.value).toISOString()
                                  : "",
                              }))
                            }
                            className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          />
                        </label>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          Priority
                        </span>
                        <select
                          value={form.priority}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              priority: event.target.value as LeadPriority,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Urgent">Urgent</option>
                          </select>
                        </label>
                      </div>

                      <label className="space-y-1 text-[10px]">
                        <span className="font-medium text-slate-700 dark:text-slate-200">Notes</span>
                        <textarea
                          rows={4}
                          value={form.notes}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, notes: event.target.value }))
                          }
                          placeholder="Capture the next step, objections, or any follow-up context."
                          className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
                        />
                      </label>

                    </div>

                    <div className="space-y-4">
                      <Card className="p-3">
                        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
                          Selected contact
                        </p>
                        <p className="mt-2 text-[13px] font-semibold text-slate-900 dark:text-white">
                          {activeLead?.fullName || "Choose a lead"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {activeLead
                            ? `${formatPhone(activeLead.phone)} | ${activeLead.company || "No company"}`
                            : "The CRM will link this call to the selected lead and update its timeline automatically."}
                        </p>
                      </Card>

                      {editorError ? (
                        <AlertBanner
                          title="Unable to save call"
                          description={editorError}
                          tone="error"
                        />
                      ) : null}

                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={closePanel}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            if (!form.leadId) {
                              setEditorError("Choose a lead before saving the call log.");
                              return;
                            }

                            setSaving(true);
                            setEditorError("");

                            try {
                              if (panelMode === "edit" && selectedCall) {
                                await updateCallLog(selectedCall.id, form);
                                toast.success("Call log updated.");
                              } else {
                                await createCallLog(form);
                                toast.success("Call log saved.");
                              }

                              closePanel();
                            } catch (error) {
                              setEditorError(
                                error instanceof Error ? error.message : "Unable to save the call log.",
                              );
                            } finally {
                              setSaving(false);
                            }
                          }}
                          disabled={!form.leadId || saving || !currentUser}
                        >
                          {saving ? "Saving..." : panelMode === "edit" ? "Update call" : "Save call"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
