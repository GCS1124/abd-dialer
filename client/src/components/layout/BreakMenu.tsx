import { CheckCircle2, Clock3, LogOut, X } from "lucide-react";

import type { BreakType, TimeTrackingState } from "../../types";
import { cn } from "../../lib/utils";
import { getBreakMenuOptions, getTimeTrackingPanelState } from "../../lib/timeTracking.ts";

interface BreakMenuProps {
  open: boolean;
  timeTracking: TimeTrackingState;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onStartBreak: (breakType: BreakType) => void;
  onEndBreak: () => void;
  onClose: () => void;
  disabled?: boolean;
  nowIso?: string;
}

export function BreakMenu({
  open,
  timeTracking,
  onCheckIn,
  onCheckOut,
  onStartBreak,
  onEndBreak,
  onClose,
  disabled = false,
  nowIso,
}: BreakMenuProps) {
  if (!open) {
    return null;
  }

  const onBreak = timeTracking.status === "on_break";
  const options = getBreakMenuOptions(timeTracking, nowIso);
  const panelState = getTimeTrackingPanelState(timeTracking, nowIso);
  const activeBreak = options.find((option) => option.active) ?? null;
  const canCheckIn = timeTracking.status === "checked_out";
  const primaryActionLabel = canCheckIn ? "Check in" : "Check out";
  const primaryActionDescription = canCheckIn
    ? "Start the shift from here."
    : "End the shift from here.";
  const primaryActionHint = canCheckIn
    ? "Move to ready status and unlock break controls."
    : timeTracking.status === "on_break"
      ? "Checks out immediately and preserves the active break time."
      : "Close out the current ready session.";
  const primaryActionTone = canCheckIn
    ? "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-50 dark:hover:bg-sky-950/50"
    : "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-50 dark:hover:bg-rose-950/50";
  const statusLabel =
    timeTracking.status === "checked_out"
      ? "Checked out"
      : timeTracking.status === "checked_in"
        ? "Ready"
        : "On break";
  const statusToneClasses =
    timeTracking.status === "checked_out"
      ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      : timeTracking.status === "checked_in"
        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-200"
      : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
  const optionStateLabel = (optionActive: boolean, optionDisabled: boolean) =>
    optionActive ? "Running now" : optionDisabled ? "Unavailable" : "Tap to start";
  const primaryActionIcon = canCheckIn ? <CheckCircle2 size={14} /> : <LogOut size={14} />;

  return (
    <div
      id="time-tracking-menu"
      className="absolute left-0 top-full z-[80] mt-2 w-[21rem] max-w-[calc(100vw-1.5rem)]"
    >
      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-3.5 py-2.5 dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.96))]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="crm-section-label">Time Tracking</p>
              
              <div
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]",
                  statusToneClasses,
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {statusLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close time tracking menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="px-3.5 pb-3.5 pt-3.5">
          <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50/80 px-2.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/70">
            {onBreak ? (
              <div className="mt-2.5 rounded-[16px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 shadow-[0_6px_16px_rgba(245,158,11,0.08)] dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">Current break</span>
                  <button
                    type="button"
                    onClick={() => {
                      onEndBreak();
                      onClose();
                    }}
                    disabled={disabled}
                    className="inline-flex h-7 items-center rounded-full border border-amber-300 bg-white px-2.5 text-[10px] font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-slate-950 dark:text-amber-200 dark:hover:bg-amber-950/50"
                  >
                    End break
                  </button>
                </div>
                {activeBreak ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[10px] uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-200/80">
                        {activeBreak.label}
                      </div>
                      {panelState.activeBreakUsageLabel ? (
                        <div className="mt-0.5 text-[10px] text-amber-700/70 dark:text-amber-200/70">
                          {panelState.activeBreakUsageLabel}
                        </div>
                      ) : null}
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700/80 shadow-[0_1px_0_rgba(15,23,42,0.03)] dark:bg-slate-950/70 dark:text-amber-200/80">
                      <Clock3 size={11} />
                      {activeBreak.durationLabel}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-2.5 max-h-[12.5rem] space-y-1.5 overflow-y-auto pr-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (disabled || option.disabled) {
                      return;
                    }

                    onStartBreak(option.value);
                    onClose();
                  }}
                  disabled={disabled || option.disabled}
                  className={cn(
                    "group w-full rounded-[16px] border px-3.5 py-2.5 text-left transition",
                    "border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-sky-200 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-700 dark:hover:bg-sky-950/35",
                    option.active && "border-sky-200 bg-sky-50/80 shadow-[0_8px_20px_rgba(14,165,233,0.08)] dark:border-sky-700 dark:bg-sky-950/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-100">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                        {optionStateLabel(option.active, option.disabled)}
                      </span>
                    </div>
                    {option.usageLabel ? (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        {option.usageLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                      <Clock3 size={11} className="text-sky-500" />
                      {option.durationLabel}
                    </span>
                    {option.active ? (
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300">
                        <CheckCircle2 size={11} />
                        Active
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
