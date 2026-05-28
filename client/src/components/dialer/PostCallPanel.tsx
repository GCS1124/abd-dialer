import { useEffect, useState } from "react";

import type {
  DialerMainDisposition,
  DialerSubDisposition,
  SaveDispositionInput,
} from "../../types";
import {
  getDispositionGroups,
  getDispositionQueueActionLabel,
  resolveDispositionSelection,
} from "../../lib/dialerDisposition";
import { buildDispositionOutcomeSummary, isPostCallSaveDisabled } from "./postCallPanelState";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";

const notInterestedReasons = ["Price Issue", "No Requirement", "Already Have", "Other"] as const;

export function PostCallPanel({
  open,
  leadName,
  onSave,
}: {
  open: boolean;
  leadName: string;
  onSave: (input: SaveDispositionInput) => Promise<void>;
}) {
  const dispositionGroups = getDispositionGroups();
  const [mainDisposition, setMainDisposition] = useState<DialerMainDisposition>("NOT_CONNECTED");
  const [subDisposition, setSubDisposition] = useState<DialerSubDisposition>("NO_ANSWER");
  const [notes, setNotes] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [notInterestedReason, setNotInterestedReason] = useState<(typeof notInterestedReasons)[number]>("Price Issue");
  const [saving, setSaving] = useState(false);
  const selectedDisposition = resolveDispositionSelection({
    mainDisposition,
    subDisposition,
  });
  const selectedGroup =
    dispositionGroups.find((group) => group.key === selectedDisposition.mainDisposition) ?? dispositionGroups[0];
  const needsCallbackTime = selectedDisposition.timingKind === "callback";
  const needsFollowUpTime = selectedDisposition.timingKind === "follow_up";
  const needsNotInterestedReason = selectedDisposition.mainDisposition === "NOT_INTERESTED";
  const isWarningDisposition =
    selectedDisposition.mainDisposition === "DO_NOT_CALL" ||
    selectedDisposition.mainDisposition === "INVALID_LEAD";
  const isClosedDisposition = selectedDisposition.mainDisposition === "CLOSED";

  useEffect(() => {
    if (!open) {
      setMainDisposition("NOT_CONNECTED");
      setSubDisposition("NO_ANSWER");
      setNotes("");
      setCallbackAt("");
      setFollowUpAt("");
      setNotInterestedReason("Price Issue");
      setSaving(false);
    }
  }, [open, leadName]);

  useEffect(() => {
    setSubDisposition(selectedGroup.subDispositions[0].key);
  }, [selectedGroup.key]);

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
            onChange={(event) => setMainDisposition(event.target.value as DialerMainDisposition)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {dispositionGroups.map((group) => (
              <option key={group.key} value={group.key}>
                {group.label}
              </option>
            ))}
          </select>
        </label> 

        <label className="space-y-1.5 text-[11px]">
          <span className="font-medium text-slate-700 dark:text-slate-200">Sub disposition</span>
          <select
            value={subDisposition}
            onChange={(event) => setSubDisposition(event.target.value as DialerSubDisposition)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950"
          >
            {selectedGroup.subDispositions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

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
            {selectedDisposition.mainDisposition === "DO_NOT_CALL"
              ? "This lead will be added to Do Not Call and removed from the dialer queue."
              : "This number will be marked invalid and removed from the queue."}
          </div>
        ) : null}
      </div>

      <div className="flex justify-end">
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
                outcomeSummary: buildDispositionOutcomeSummary(selectedDisposition.disposition, notes, leadName, {
                  mainDispositionLabel: selectedDisposition.mainDispositionLabel,
                  subDispositionLabel: selectedDisposition.subDispositionLabel,
                  notInterestedReason: needsNotInterestedReason ? notInterestedReason : null,
                }),
              });

            } finally {
              setSaving(false);
            }
          }}
          disabled={isPostCallSaveDisabled({
            saving,
            needsCallbackTime,
            callbackAt,
            needsFollowUpTime,
            followUpAt,
            needsNotInterestedReason,
            notInterestedReason,
          })}
        >
          {saving ? "Saving..." : "Save disposition & load next lead"}
        </Button>
      </div>
    </Card>
  );
}
