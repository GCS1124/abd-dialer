import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Radio, ToggleLeft, ToggleRight, X } from "lucide-react";

import type { Campaign, User } from "../../types";
import { cn } from "../../lib/utils";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";

export interface LeadUploadCampaignSelection {
  mode: "existing" | "new";
  campaignSourceKey: string;
  campaignName: string;
  assignedUserId: string | null;
  allowAutoDial: boolean;
  isActive: boolean;
}

interface LeadUploadCampaignModalProps {
  open: boolean;
  campaigns: Campaign[];
  users: User[];
  fileName: string;
  rowCount: number;
  invalidRows: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (selection: LeadUploadCampaignSelection) => void | Promise<void>;
}

function getFocusableElements(container: HTMLDivElement | null) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

function normalizeCampaignSourceKey(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "uncategorized";
}

export function LeadUploadCampaignModal({
  open,
  campaigns,
  users,
  fileName,
  rowCount,
  invalidRows,
  busy,
  onClose,
  onConfirm,
}: LeadUploadCampaignModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const busyRef = useRef(busy);
  const [mode, setMode] = useState<"existing" | "new">(campaigns.length ? "existing" : "new");
  const [selectedCampaignKey, setSelectedCampaignKey] = useState(campaigns[0]?.sourceKey ?? "");
  const [campaignName, setCampaignName] = useState("");
  const [campaignSourceKey, setCampaignSourceKey] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [allowAutoDial, setAllowAutoDial] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.sourceKey === selectedCampaignKey) ?? null;

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!open || wasOpenRef.current) {
      wasOpenRef.current = open;
      return;
    }

    setMode(campaigns.length ? "existing" : "new");
    setSelectedCampaignKey(campaigns[0]?.sourceKey ?? "");
    setCampaignName("");
    setCampaignSourceKey("");
    setAssignedUserId("");
    setAllowAutoDial(true);
    setIsActive(true);
    wasOpenRef.current = true;
  }, [campaigns, open]);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    if (mode === "existing" && campaigns.length) {
      const isSelectedCampaignValid = campaigns.some(
        (campaign) => campaign.sourceKey === selectedCampaignKey,
      );
      if (!isSelectedCampaignValid) {
        setSelectedCampaignKey(campaigns[0]?.sourceKey ?? "");
      }
    }
  }, [campaigns, mode, open, selectedCampaignKey]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (busyRef.current) {
          return;
        }

        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(containerRef.current);
      if (!focusable.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const confirmDisabled =
    busy ||
    (mode === "existing"
      ? !selectedCampaign
      : !campaignName.trim() && !campaignSourceKey.trim());
  const effectiveCampaignName =
    mode === "existing"
      ? selectedCampaign?.name ?? ""
      : campaignName.trim() || campaignSourceKey.trim();
  const effectiveCampaignSourceKey =
    mode === "existing"
      ? selectedCampaign?.sourceKey ?? ""
      : normalizeCampaignSourceKey(campaignSourceKey || campaignName);
  const summaryName =
    mode === "existing"
      ? selectedCampaign?.name ?? "Choose a campaign"
      : effectiveCampaignName || "New campaign";

  const handleConfirm = async () => {
    if (confirmDisabled) {
      return;
    }

    await onConfirm({
      mode,
      campaignSourceKey: effectiveCampaignSourceKey,
      campaignName: effectiveCampaignName,
      assignedUserId: mode === "existing" ? selectedCampaign?.assignedUserId ?? null : assignedUserId || null,
      allowAutoDial: mode === "existing" ? selectedCampaign?.allowAutoDial ?? true : allowAutoDial,
      isActive: mode === "existing" ? selectedCampaign?.isActive ?? true : isActive,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-upload-campaign-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Lead import
            </p>
            <h3
              id="lead-upload-campaign-title"
              className="mt-2 text-[22px] font-semibold text-slate-900 dark:text-white"
            >
              Assign this spreadsheet to a campaign
            </h3>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500 dark:text-slate-400">
              Choose an existing campaign or create a new one before the import runs.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close upload dialog"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {fileName}
            </Badge>
            <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
              {rowCount} rows
            </Badge>
            {invalidRows ? (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                {invalidRows} invalid rows in file
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  disabled={busy || !campaigns.length}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                    mode === "existing"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-transparent text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-950",
                    (!campaigns.length || busy) && "cursor-not-allowed opacity-50",
                  )}
                >
                  Assign existing
                </button>
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  disabled={busy}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-[14px] px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] transition",
                    mode === "new"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "bg-transparent text-slate-500 hover:bg-white dark:text-slate-400 dark:hover:bg-slate-950",
                    busy && "cursor-not-allowed opacity-50",
                  )}
                >
                  Create new
                </button>
              </div>

              {mode === "existing" ? (
                campaigns.length ? (
                  <div className="space-y-3">
                    <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-slate-400">
                      Select a campaign
                    </p>
                    <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                      {campaigns.map((campaign) => {
                        const isSelected = campaign.sourceKey === selectedCampaignKey;

                        return (
                          <button
                            key={campaign.id}
                            type="button"
                            onClick={() => setSelectedCampaignKey(campaign.sourceKey)}
                            disabled={busy}
                            className={cn(
                              "flex w-full items-center justify-between gap-4 rounded-[20px] border px-4 py-4 text-left transition",
                              isSelected
                                ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(8,145,178,0.06)] dark:border-cyan-500/40 dark:bg-cyan-950/20"
                                : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700 dark:hover:bg-slate-900",
                              busy && "cursor-not-allowed opacity-70",
                            )}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                                  isSelected
                                    ? "bg-cyan-600 text-white"
                                    : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-200",
                                )}
                              >
                                {isSelected ? <CheckCircle2 size={18} /> : <Radio size={18} />}
                              </div>

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-[16px] font-semibold text-slate-900 dark:text-white">
                                    {campaign.name}
                                  </p>
                                  <Badge
                                    className={cn(
                                      "px-2 py-1 text-[10px] font-medium",
                                      campaign.isActive
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                        : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                                    )}
                                  >
                                    {campaign.isActive ? "Active" : "Paused"}
                                  </Badge>
                                  <Badge className="bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {campaign.leadCount} leads
                                  </Badge>
                                </div>
                                <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                                  {campaign.sourceKey} · Assigned to{" "}
                                  {campaign.assignedUserName || "Unassigned"}
                                </p>
                              </div>
                            </div>

                            <span className="shrink-0 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                              {isSelected ? "Selected" : "Select"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                      Every imported row will be assigned to the selected campaign source key.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-[13px] leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    No existing campaigns yet. Switch to Create new to continue.
                  </div>
                )
              ) : (
                <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div>
                    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                      Campaign name
                    </p>
                    <input
                      value={campaignName}
                      onChange={(event) => setCampaignName(event.target.value)}
                      placeholder="Q2 plumbing prospects"
                      disabled={busy}
                      className="crm-input mt-2 py-3"
                    />
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                      Source key
                    </p>
                    <input
                      value={campaignSourceKey}
                      onChange={(event) => setCampaignSourceKey(event.target.value)}
                      placeholder="Leave blank to use the campaign name"
                      disabled={busy}
                      className="crm-input mt-2 py-3"
                    />
                  </div>

                  <div>
                    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                      Queue owner
                    </p>
                    <select
                      value={assignedUserId}
                      onChange={(event) => setAssignedUserId(event.target.value)}
                      disabled={busy}
                      className="crm-input mt-2 py-3"
                    >
                      <option value="">Unassigned</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} - {user.role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
                      Dialing behavior
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setAllowAutoDial((current) => !current)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {allowAutoDial ? "Auto-dial on" : "Auto-dial off"}
                        {allowAutoDial ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsActive((current) => !current)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {isActive ? "Active" : "Paused"}
                        {isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  </div>

                  <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                    The campaign is created first, then the spreadsheet import is written into that
                    new queue.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Import summary
                </p>
                <h4 className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-white">
                  {summaryName}
                </h4>
                <p className="mt-2 text-[13px] leading-6 text-slate-500 dark:text-slate-400">
                  {mode === "existing"
                    ? "This upload will be attached to the selected campaign and remain grouped with that queue."
                    : "This upload will create a campaign first, then place every imported row into that queue."}
                </p>
              </div>

              <div className="space-y-3 rounded-[20px] border border-white bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">File</span>
                  <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
                    {fileName}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">Rows</span>
                  <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
                    {rowCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">Invalid rows</span>
                  <span className="text-[12px] font-semibold text-slate-900 dark:text-white">
                    {invalidRows}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] text-slate-500 dark:text-slate-400">Target source</span>
                  <span className="truncate text-[12px] font-semibold text-slate-900 dark:text-white">
                    {mode === "existing"
                      ? selectedCampaign?.sourceKey || "Select a campaign"
                      : effectiveCampaignSourceKey || "Will derive from the name"}
                  </span>
                </div>
              </div>

              <div className="rounded-[20px] border border-dashed border-slate-300 bg-white p-4 text-[13px] leading-6 text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                No data is written until you confirm. Closing this dialog cancels the pending upload.
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <p className="text-[12px] leading-5 text-slate-500 dark:text-slate-400">
            Create the campaign first if needed, then import the spreadsheet into that queue.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleConfirm()} disabled={confirmDisabled}>
              {busy ? "Importing..." : mode === "existing" ? "Import into campaign" : "Create campaign and import"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
