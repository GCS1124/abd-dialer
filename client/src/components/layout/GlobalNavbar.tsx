import { Bell, ChevronDown, Clock3, LogOut, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppState } from "../../hooks/useAppState";
import { cn, formatDuration } from "../../lib/utils";
import { getBreakMenuOptions, getDisplayedSeconds } from "../../lib/timeTracking.ts";
import { AlertsPopover } from "./AlertsPopover";

function formatNavbarClock(now: number) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(now));
}

const pillBase =
  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[12px] font-semibold transition";

export function GlobalNavbar() {
  const {
    currentUser,
    theme,
    setTheme,
    logout,
    timeTracking,
    checkIn,
    checkOut,
    incomingAlerts,
    markIncomingAlertsSeen,
    activeCall,
    wrapUpLeadId,
  } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const [alertsOpen, setAlertsOpen] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (alertsOpen) {
      markIncomingAlertsSeen();
    }
  }, [alertsOpen, markIncomingAlertsSeen]);

  if (!currentUser) {
    return null;
  }

  const nowIso = new Date(now).toISOString();
  const sessionSeconds = getDisplayedSeconds(timeTracking, nowIso);
  const activeBreak =
    timeTracking.status === "on_break"
      ? getBreakMenuOptions(timeTracking, nowIso).find((option) => option.active) ?? null
      : null;
  const busy = Boolean(activeCall || wrapUpLeadId);
  const actionLabel = timeTracking.status === "checked_out" ? "CHECK IN" : "CHECK OUT";
  const statusLabel =
    timeTracking.status === "checked_out"
      ? "CHECKED OUT"
      : timeTracking.status === "on_break"
        ? "ON BREAK"
        : "CHECKED IN";
  const statusPillClasses = cn(
    pillBase,
    "min-w-[9.5rem] select-none uppercase tracking-[0.18em]",
    timeTracking.status === "checked_in" &&
      "border-[#79d8ba] bg-[#8ae0c4] text-[#667c72] shadow-[0_10px_20px_rgba(116,219,193,0.18)]",
    timeTracking.status === "on_break" &&
      "min-w-[12.5rem] h-auto min-h-10 flex-col items-start gap-0.5 border-amber-200 bg-amber-100 py-2 text-left text-amber-800 shadow-[0_10px_20px_rgba(251,191,36,0.12)]",
    timeTracking.status === "checked_out" &&
      "border-slate-200 bg-slate-50 text-slate-500",
  );
  const actionButtonClasses = cn(
    pillBase,
    "justify-center uppercase tracking-[0.18em]",
    timeTracking.status === "checked_out"
      ? "border-[#d8e9fb] bg-white text-[#1f7db3] hover:border-[#b8d8f3] hover:bg-sky-50"
      : "border-[#ef7b70] bg-[#ef7b70] text-white shadow-[0_10px_24px_rgba(239,123,112,0.18)] hover:bg-[#e66557]",
  );

  return (
    <div className="border-b border-sky-100/80 bg-[linear-gradient(180deg,#edf4fc_0%,#e6eef8_100%)] px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <Clock3 size={14} className="text-sky-500" />
            {formatNavbarClock(now)}
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className={cn(
              pillBase,
              "border-slate-200 bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
              "uppercase tracking-[0.18em]",
            )}
          >
            {theme === "dark" ? <SunMedium size={14} /> : <MoonStar size={14} />}
            {theme === "dark" ? "LIGHT" : "DARK"}
          </button>
        </div>

        <div className="flex flex-nowrap items-center justify-center gap-2">
          <div
            role="status"
            aria-live="polite"
            aria-label={
              timeTracking.status === "on_break" && activeBreak
                ? `On break, ${activeBreak.label}, ${activeBreak.durationLabel}`
                : statusLabel
            }
            className={statusPillClasses}
          >
            {timeTracking.status === "on_break" ? (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  ON BREAK
                </span>
                <span className="text-[11px] font-semibold normal-case tracking-normal text-amber-800 dark:text-amber-100">
                  {activeBreak?.label ?? "Break"} | {activeBreak?.durationLabel ?? "00:00"}
                </span>
              </>
            ) : (
              <span>{statusLabel}</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (timeTracking.status === "checked_out") {
                checkIn();
              } else {
                checkOut();
              }
            }}
            disabled={busy}
            className={cn(actionButtonClasses, "disabled:cursor-not-allowed disabled:opacity-70")}
          >
            {actionLabel}
          </button>

          <div className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-[12px] font-medium text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
            <Clock3 size={14} className="text-sky-500" />
            <span className="uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Login
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-100">
              {formatDuration(sessionSeconds)}
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setAlertsOpen((current) => !current);
              }}
              className={cn(
                pillBase,
                "border-slate-200 bg-white text-slate-700 shadow-[0_10px_24px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
              )}
            >
              <Bell size={14} className="text-slate-500 dark:text-slate-400" />
              Alerts
            </button>
            <AlertsPopover
              open={alertsOpen}
              items={incomingAlerts}
              onClose={() => setAlertsOpen(false)}
            />
          </div>

          <button
            type="button"
            onClick={logout}
            className={cn(
              pillBase,
              "border-[#1d6ea1] bg-[#1f7db3] text-white shadow-[0_10px_24px_rgba(31,125,179,0.22)] hover:bg-[#186791]",
            )}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
