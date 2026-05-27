import { Clock3, LogOut, X } from "lucide-react";

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

  return (
    <div
      id="time-tracking-menu"
      className="absolute left-0 top-full z-50 mt-2 w-[23rem] max-w-[calc(100vw-1.5rem)]"
    >
      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)] dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="crm-section-label">Time Tracking</p>
              <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                Break controls and live shift totals
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close time tracking menu"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 pt-4">
          
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Time on system
              </p>
              <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                {panelState.timeOnSystemLabel}
              </p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Break time
              </p>
              <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                {panelState.totalBreakTimeLabel}
              </p>
            </div>
            <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Login hours
              </p>
              <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                {panelState.totalLoginHoursLabel}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Break choices
            </p>
            {onBreak ? (
              <div className="mt-2 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">Current break</span>
                  <button
                    type="button"
                    onClick={() => {
                      onEndBreak();
                      onClose();
                    }}
                    disabled={disabled}
                    className="inline-flex h-8 items-center rounded-full border border-amber-300 bg-white px-3 text-[11px] font-semibold text-amber-700 transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900/60 dark:bg-slate-950 dark:text-amber-200 dark:hover:bg-amber-950/50"
                  >
                    End break
                  </button>
                </div>
                {activeBreak ? (
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-amber-700/80 dark:text-amber-200/80">
                      {activeBreak.label}
                    </div>
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700/80 dark:text-amber-200/80">
                      <Clock3 size={12} />
                      {activeBreak.durationLabel}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={cn("mt-3 max-h-[14rem] space-y-2 overflow-y-auto pr-1")}>
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
                    "w-full rounded-[18px] border px-4 py-3 text-left transition",
                    "border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-sky-200 hover:bg-sky-50/70 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-800 dark:bg-slate-950 dark:hover:border-sky-700 dark:hover:bg-sky-950/35",
                    option.active && "border-sky-200 bg-sky-50/80 dark:border-sky-700 dark:bg-sky-950/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-100">
                      {option.label}
                    </span>
                    {option.usageLabel ? (
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        {option.usageLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[12px]">
                    <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <Clock3 size={12} className="text-sky-500" />
                      {option.durationLabel}
                    </span>
                    {option.active ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">
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
