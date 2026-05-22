import { Bell, ChevronDown, Clock3, LogOut, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

import { useAppState } from "../../hooks/useAppState";
import { formatDuration, cn } from "../../lib/utils";
import { getDisplayedSeconds } from "../../lib/timeTracking.ts";
import { AlertsPopover } from "./AlertsPopover";
import { BreakMenu } from "./BreakMenu";

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
    startBreak,
    endBreak,
    incomingAlerts,
    markIncomingAlertsSeen,
    activeCall,
    wrapUpLeadId,
  } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

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

  const sessionSeconds = getDisplayedSeconds(timeTracking, new Date(now).toISOString());
  const busy = Boolean(activeCall || wrapUpLeadId);
  const actionLabel = timeTracking.status === "checked_out" ? "CHECK IN" : "CHECK OUT";
  const statusLabel =
    timeTracking.status === "checked_out"
      ? "CHECKED OUT"
      : timeTracking.status === "on_break"
        ? "ON BREAK"
        : "CHECKED IN";
  const statusButtonClasses = cn(
    pillBase,
    "min-w-[9.5rem] justify-between uppercase tracking-[0.18em]",
    timeTracking.status === "checked_in" &&
      "border-[#79d8ba] bg-[#8ae0c4] text-[#667c72] shadow-[0_10px_20px_rgba(116,219,193,0.18)] hover:bg-[#82dcc1]",
    timeTracking.status === "on_break" &&
      "border-amber-200 bg-amber-100 text-amber-800 shadow-[0_10px_20px_rgba(251,191,36,0.12)] hover:bg-amber-200",
    timeTracking.status === "checked_out" &&
      "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
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
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (timeTracking.status === "checked_out" || busy) {
                  return;
                }

                setBreakOpen((current) => !current);
                setAlertsOpen(false);
              }}
              disabled={busy || timeTracking.status === "checked_out"}
              className={cn(statusButtonClasses, "disabled:cursor-not-allowed disabled:opacity-70")}
            >
              <span>{statusLabel}</span>
              <ChevronDown size={14} className="shrink-0" />
            </button>
            <BreakMenu
              open={breakOpen}
              timeTracking={timeTracking}
              onStartBreak={(breakType) => {
                startBreak(breakType);
                setBreakOpen(false);
              }}
              onEndBreak={() => {
                endBreak();
                setBreakOpen(false);
              }}
              onClose={() => setBreakOpen(false)}
              disabled={busy}
              nowIso={new Date(now).toISOString()}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (timeTracking.status === "checked_out") {
                checkIn();
              } else {
                checkOut();
              }
              setBreakOpen(false);
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
                setBreakOpen(false);
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
