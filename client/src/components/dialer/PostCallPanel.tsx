import { Check, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DialerMainDisposition,
  DialerSubDisposition,
  SaveDispositionInput,
} from "../../types";
import {
  getDispositionOption,
  getDispositionOptions,
  getDispositionQueueActionLabel,
  getMainDispositionOptions,
  resolveDispositionSelection,
} from "../../lib/dialerDisposition";
import { cn, formatDateTime } from "../../lib/utils";
import { buildDispositionOutcomeSummary, isPostCallSaveDisabled } from "./postCallPanelState";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";

const notInterestedReasons = ["Price Issue", "No Requirement", "Already Have", "Other"] as const;

export function PostCallPanel({
  open,
  leadName,
  onSave,
  saveDisabled = false,
}: {
  open: boolean;
  leadName: string;
  onSave: (input: SaveDispositionInput) => Promise<void>;
  saveDisabled?: boolean;
}) {
  const mainDispositionOptions = getMainDispositionOptions();
  const dispositionOptions = getDispositionOptions();
  const [mainDisposition, setMainDisposition] = useState<DialerMainDisposition>("NON_DECISION_MAKER");
  const [subDisposition, setSubDisposition] = useState<DialerSubDisposition>("NO_ANSWER");
  const [dispositionSearch, setDispositionSearch] = useState("No Answer");
  const [customDisposition, setCustomDisposition] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [notInterestedReason, setNotInterestedReason] = useState<(typeof notInterestedReasons)[number]>("Price Issue");
  const [saving, setSaving] = useState(false);
  const [sendSmsConfirmation, setSendSmsConfirmation] = useState(true);
  const [smsMessage, setSmsMessage] = useState("");
  const [smsMessageEdited, setSmsMessageEdited] = useState(false);
  const previousMeetingDispositionRef = useRef(false);
  const normalizedDispositionSearch = dispositionSearch.trim().toLowerCase();
  const filteredSubDispositions = useMemo(() => {
    if (!normalizedDispositionSearch) {
      return dispositionOptions;
    }

    return dispositionOptions.filter((item) => {
      const normalizedLabel = item.label.toLowerCase();
      const normalizedKey = item.key.toLowerCase().replace(/_/g, " ");
      return normalizedLabel.includes(normalizedDispositionSearch) || normalizedKey.includes(normalizedDispositionSearch);
    });
  }, [dispositionOptions, normalizedDispositionSearch]);
  const exactMatchedDisposition = useMemo(() => {
    if (!normalizedDispositionSearch) {
      return null;
    }

    return (
      dispositionOptions.find((item) => {
        const normalizedLabel = item.label.toLowerCase();
        const normalizedKey = item.key.toLowerCase().replace(/_/g, " ");
        return normalizedLabel === normalizedDispositionSearch || normalizedKey === normalizedDispositionSearch;
      }) ?? null
    );
  }, [dispositionOptions, normalizedDispositionSearch]);
  const canAddCustomDisposition = Boolean(normalizedDispositionSearch) && !exactMatchedDisposition;
  const pendingCustomDisposition = !customDisposition && canAddCustomDisposition ? dispositionSearch.trim() : null;
  const activeCustomDisposition = customDisposition ?? pendingCustomDisposition;
  const selectedDisposition = resolveDispositionSelection({
    mainDisposition,
    subDisposition,
    disposition: activeCustomDisposition,
  });
  const needsCallbackTime = selectedDisposition.timingKind === "callback";
  const needsFollowUpTime = selectedDisposition.timingKind === "follow_up";
  const needsNotInterestedReason = [
    "PRICE_ISSUE",
    "NO_REQUIREMENT",
    "ALREADY_HAVE_VENDOR_SERVICE",
    "NOT_INTERESTED_OTHER",
  ].includes(selectedDisposition.subDisposition);
  const isWarningDisposition =
    selectedDisposition.queueAction === "PERMANENTLY_EXCLUDE" ||
    selectedDisposition.queueAction === "REMOVE_FROM_QUEUE";
  const isClosedDisposition =
    selectedDisposition.queueAction === "REMOVE_FROM_ACTIVE_QUEUE" ||
    selectedDisposition.queueAction === "REMOVE_FROM_COLD_QUEUE";
  const isMeetingScheduledDisposition = selectedDisposition.subDisposition === "MEETING_VISIT_DEMO_SCHEDULED";
  const meetingSmsDraft = useMemo(() => {
    const scheduledTime = callbackAt ? formatDateTime(callbackAt) : "the scheduled time";
    return `Hi ${leadName}, your meeting is scheduled for ${scheduledTime}. Please reply if you need to reschedule.`;
  }, [callbackAt, leadName]);
  const shouldSendMeetingSms = isMeetingScheduledDisposition && sendSmsConfirmation;
  const shouldDisableMeetingSmsSend = shouldSendMeetingSms && !smsMessage.trim();

  const handleMainDispositionChange = (value: DialerMainDisposition) => {
    setMainDisposition(value);
  };

  const handleSubDispositionSelect = (value: DialerSubDisposition) => {
    const nextOption = getDispositionOption(value);
    if (!nextOption) {
      return;
    }

    setSubDisposition(nextOption.key);
    setDispositionSearch(nextOption.label);
    setCustomDisposition(null);
  };

  const handleAddCustomDisposition = () => {
    const nextValue = dispositionSearch.trim();
    if (!nextValue) {
      return;
    }

    const exactMatch = dispositionOptions.find((item) => item.label.toLowerCase() === nextValue.toLowerCase());
    if (exactMatch) {
      handleSubDispositionSelect(exactMatch.key);
      return;
    }

    setCustomDisposition(nextValue);
    setDispositionSearch(nextValue);
  };

  useEffect(() => {
    if (!open) {
      setMainDisposition("NON_DECISION_MAKER");
      setSubDisposition("NO_ANSWER");
      setDispositionSearch("No Answer");
      setCustomDisposition(null);
      setNotes("");
      setCallbackAt("");
      setFollowUpAt("");
      setNotInterestedReason("Price Issue");
      setSendSmsConfirmation(true);
      setSmsMessage("");
      setSmsMessageEdited(false);
      previousMeetingDispositionRef.current = false;
      setSaving(false);
    }
  }, [open, leadName]);

  useEffect(() => {
    if (!isMeetingScheduledDisposition) {
      setSendSmsConfirmation(false);
      setSmsMessage("");
      setSmsMessageEdited(false);
      previousMeetingDispositionRef.current = false;
      return;
    }

    if (!previousMeetingDispositionRef.current) {
      setSendSmsConfirmation(true);
    }
    if (!smsMessageEdited) {
      setSmsMessage(meetingSmsDraft);
    }
    previousMeetingDispositionRef.current = true;
  }, [isMeetingScheduledDisposition, meetingSmsDraft, smsMessageEdited]);

  if (!open) {
    return null;
  }

  return (
    <Card className="space-y-3 border border-cyan-300/60 p-4 dark:border-cyan-500/30">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
          Wrap-Up
        </p>
        <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
          Save outcome for {leadName}
        </h3>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-[11px]">
          <span className="font-medium text-slate-700 dark:text-slate-200">Main disposition</span>
          <select
            value={mainDisposition}
            onChange={(event) => handleMainDispositionChange(event.target.value as DialerMainDisposition)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {mainDispositionOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label> 

        <div className="space-y-1.5 text-[11px] md:col-span-2">
          <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-200">Sub disposition</span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              {activeCustomDisposition ? "Custom" : "Preset"}
            </span>
          </div>

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={dispositionSearch}
              onChange={(event) => {
                setDispositionSearch(event.target.value);
                setCustomDisposition(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAddCustomDisposition();
                }
              }}
              placeholder="Type to search or add a sub disposition"
              className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-10 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
            {dispositionSearch.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setDispositionSearch(selectedDisposition.subDispositionLabel);
                  setCustomDisposition(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Clear disposition search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <span>{filteredSubDispositions.length} result{filteredSubDispositions.length === 1 ? "" : "s"}</span>
              <span className="truncate text-right">
                {activeCustomDisposition
                  ? `Custom: ${activeCustomDisposition}`
                  : `Selected: ${selectedDisposition.subDispositionLabel}`}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto p-1">
              {filteredSubDispositions.length ? (
                filteredSubDispositions.map((item) => {
                  const isSelected = item.key === subDisposition && !customDisposition;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleSubDispositionSelect(item.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[12px] transition",
                        isSelected
                          ? "bg-cyan-50 text-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100"
                          : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900",
                      )}
                    >
                      <span className="font-medium">{item.label}</span>
                      {isSelected ? <Check size={14} className="shrink-0 text-cyan-600 dark:text-cyan-300" /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-3 text-[12px] text-slate-500 dark:text-slate-400">0 results</div>
              )}

              {canAddCustomDisposition ? (
                <button
                  type="button"
                  onClick={handleAddCustomDisposition}
                  className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left text-[12px] font-medium text-slate-900 transition hover:bg-slate-100 dark:bg-slate-900/60 dark:text-slate-100 dark:hover:bg-slate-900"
                >
                  <Plus size={14} className="shrink-0 text-cyan-600 dark:text-cyan-300" />
                  <span>Add "{dispositionSearch.trim()}"</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="md:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-[12px] text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-950/20 dark:text-cyan-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Queue action:</span>
            <span>{getDispositionQueueActionLabel(selectedDisposition.queueAction)}</span>
            <span className="text-cyan-500/80 dark:text-cyan-300/80">|</span>
            <span className="font-medium">Calculated priority:</span>
            <span>{selectedDisposition.callbackPriority}</span>
          </div>
        </div>

        <label className="space-y-1.5 text-[11px] md:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Call notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="Capture objections, buying signals, timing, and next step detail"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          />
        </label>

        {needsNotInterestedReason ? (
          <label className="space-y-1.5 text-[11px] md:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">Not interested reason</span>
            <select
              value={notInterestedReason}
              onChange={(event) =>
                setNotInterestedReason(event.target.value as (typeof notInterestedReasons)[number])
              }
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            >
              {notInterestedReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {needsCallbackTime ? (
          <label className="space-y-1.5 text-[11px] md:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {selectedDisposition.subDisposition === "MEETING_VISIT_DEMO_SCHEDULED"
                ? "Meeting date and time"
                : "Callback date and time"}
            </span>
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(event) => setCallbackAt(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        ) : null}

        {isMeetingScheduledDisposition ? (
          <div className="md:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-3 py-3 dark:border-cyan-500/20 dark:bg-cyan-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                  RingCentral SMS
                </p>
                <p className="text-[12px] leading-5 text-cyan-900/80 dark:text-cyan-100/80">
                  Send a confirmation text as soon as this meeting is saved.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-medium text-cyan-900 dark:text-cyan-100">
                <input
                  type="checkbox"
                  checked={sendSmsConfirmation}
                  onChange={(event) => setSendSmsConfirmation(event.target.checked)}
                  className="h-4 w-4 rounded border-cyan-400 text-cyan-600 focus:ring-cyan-500"
                />
                Send SMS
              </label>
            </div>
            <textarea
              value={smsMessage}
              onChange={(event) => {
                setSmsMessage(event.target.value);
                setSmsMessageEdited(true);
              }}
              rows={3}
              disabled={!sendSmsConfirmation}
              className="mt-3 w-full rounded-2xl border border-cyan-200 bg-white px-3 py-2 text-[12px] outline-none transition focus:border-cyan-500 disabled:cursor-not-allowed disabled:bg-cyan-50 dark:border-cyan-500/20 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400 dark:disabled:bg-slate-900"
              placeholder="Write the confirmation text here"
            />
            <p className="mt-2 text-[11px] leading-5 text-cyan-800/80 dark:text-cyan-100/70">
              The SMS will be sent from the connected RingCentral number and include the scheduled time.
            </p>
          </div>
        ) : null}

        {needsFollowUpTime ? (
          <label className="space-y-1.5 text-[11px] md:col-span-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">Follow-up date and time</span>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(event) => setFollowUpAt(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
        ) : null}

        {isClosedDisposition ? (
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
            This lead will be marked {selectedDisposition.subDispositionLabel.toLowerCase()} and removed from the active queue.
          </div>
        ) : null}

        {isWarningDisposition ? (
          <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-100">
            {["DNC_REQUESTED", "DO_NOT_CALL", "OPTED_OUT"].includes(selectedDisposition.subDisposition)
              ? "This lead will be added to Do Not Call and removed from the dialer queue."
              : "This number will be marked invalid and removed from the queue."}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
        <div className="space-y-2 text-right">
          {saveDisabled ? (
            <p className="text-[11px] text-cyan-700 dark:text-cyan-300">
              Take notes now. Save after the call ends.
            </p>
          ) : null}
          <Button
            size="md"
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  disposition: selectedDisposition.disposition,
                  mainDisposition: selectedDisposition.mainDisposition,
                  subDisposition: selectedDisposition.subDisposition,
                  notes,
                  callbackAt: needsCallbackTime && callbackAt ? new Date(callbackAt).toISOString() : "",
                  followUpPriority: selectedDisposition.callbackPriority,
                  callbackPriority: selectedDisposition.callbackPriority,
                  followUpAt: needsFollowUpTime && followUpAt ? new Date(followUpAt).toISOString() : "",
                  notInterestedReason: needsNotInterestedReason ? notInterestedReason : "",
                  sendFollowUpSms: shouldSendMeetingSms,
                  followUpSmsMessage: shouldSendMeetingSms ? smsMessage.trim() : "",
                  outcomeSummary: buildDispositionOutcomeSummary(selectedDisposition.disposition, notes, leadName, {
                    mainDispositionLabel: selectedDisposition.mainDispositionLabel,
                    subDispositionLabel: selectedDisposition.subDispositionLabel,
                    customDispositionLabel: activeCustomDisposition,
                    notInterestedReason: needsNotInterestedReason ? notInterestedReason : null,
                  }),
                });
              } finally {
                setSaving(false);
              }
            }}
            disabled={
              saveDisabled ||
              isPostCallSaveDisabled({
                saving,
                needsCallbackTime,
                callbackAt,
                needsFollowUpTime,
                followUpAt,
                needsNotInterestedReason,
                notInterestedReason,
              }) ||
              shouldDisableMeetingSmsSend
            }
          >
            {saving
              ? "Saving..."
              : shouldSendMeetingSms
                ? "Save disposition & send SMS"
                : "Save disposition & load next lead"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
