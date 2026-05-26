import {
  Bell,
  ChevronDown,
  Clock3,
  LogOut,
  MoonStar,
  PhoneCall,
  PhoneOff,
  SunMedium,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAppState } from "../../hooks/useAppState";
import { cn } from "../../lib/utils";
import { getTimeTrackingPanelState } from "../../lib/timeTracking.ts";
import { AlertsPopover } from "./AlertsPopover";
import { BreakMenu } from "./BreakMenu";
import { Button } from "../shared/Button";

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
    answerCall,
    rejectCall,
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

  const nowIso = new Date(now).toISOString();
  const panelState = getTimeTrackingPanelState(timeTracking, nowIso);
  const busy = Boolean(activeCall || wrapUpLeadId);
  const incomingRinging = activeCall?.direction === "incoming" && activeCall.status === "ringing";
  const actionLabel = timeTracking.status === "checked_out" ? "CHECK IN" : "CHECK OUT";
  const statusButtonClasses = cn(
    "flex h-full min-w-[10.75rem] items-center justify-between gap-4 px-4 py-3 text-left uppercase tracking-[0.18em] transition",
    timeTracking.status === "checked_out" &&
      "border-r border-slate-200 bg-[#8ae0c4] text-[#667c72] hover:bg-[#82dcc1] dark:border-slate-700",
    timeTracking.status === "checked_in" &&
      "border-r border-slate-200 bg-[#ef7b70] text-white hover:bg-[#e66557] dark:border-slate-700",
    timeTracking.status === "on_break" &&
      "border-r border-slate-200 bg-amber-100 text-amber-800 hover:bg-amber-200 dark:border-slate-700 dark:text-amber-100",
  );
  const metricsLabelClasses =
    "text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500";
  const metricsValueClasses =
    "text-[14px] font-semibold text-slate-900 dark:text-slate-50";

  return (
    <div className="border-b border-sky-100/80 bg-[linear-gradient(180deg,#edf4fc_0%,#e6eef8_100%)] px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90 lg:flex-row lg:items-center lg:justify-between">
        {incomingRinging ? (
          <div className="flex flex-col gap-3 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 shadow-[0_10px_28px_rgba(244,63,94,0.12)] dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-100 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-600 dark:text-rose-200">
                Incoming call
              </p>
              <p className="mt-1 truncate text-[14px] font-semibold">
                {activeCall?.displayName || "Unknown caller"}
              </p>
              <p className="truncate text-[12px] text-rose-700 dark:text-rose-200">
                {activeCall?.dialedNumber || "--"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void answerCall()}>
                <PhoneCall size={14} />
                Answer
              </Button>
              <Button size="sm" variant="danger" onClick={() => void rejectCall()}>
                <PhoneOff size={14} />
                Reject
              </Button>
            </div>
          </div>
        ) : null}

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

        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-full border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950">
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
            className={cn(statusButtonClasses, "disabled:cursor-not-allowed disabled:opacity-70")}
          >
            <span className="shrink-0 text-[12px] font-semibold tracking-[0.18em]">
              {actionLabel}
            </span>
            {timeTracking.status === "on_break" ? (
              <span className="flex min-w-0 flex-col items-end gap-0.5 normal-case tracking-normal">
                <span className="text-[10px] font-semibold tracking-[0.22em] text-amber-700/80 dark:text-amber-100/80">
                  ON BREAK
                </span>
                <span className="truncate text-[11px] font-semibold text-amber-800 dark:text-amber-100">
                  {panelState.activeBreakLabel ?? "Break"} {"\u2022"}{" "}
                  {panelState.activeBreakDurationLabel ?? "00:00"}
                </span>
              </span>
            ) : null}
          </button>

          <div className="grid min-w-0 flex-1 gap-3 px-4 py-2 sm:grid-cols-2 sm:gap-4">
            <div className="min-w-0">
              <p className={metricsLabelClasses}>Time on system</p>
              <p className={metricsValueClasses}>{panelState.timeOnSystemLabel}</p>
            </div>
            <div className="min-w-0">
              <p className={metricsLabelClasses}>Login hours</p>
              <p className={metricsValueClasses}>{panelState.loginHoursLabel}</p>
            </div>
          </div>

          <div className="relative flex items-stretch border-l border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setBreakOpen((current) => !current);
                setAlertsOpen(false);
              }}
              aria-expanded={breakOpen}
              className={cn(
                "inline-flex h-full items-center gap-2 px-4 text-[12px] font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900",
                "disabled:cursor-not-allowed disabled:opacity-70",
              )}
            >
              <Clock3 size={14} className="text-sky-500" />
              <ChevronDown
                size={14}
                className={cn("text-slate-400 transition-transform", breakOpen && "rotate-180")}
              />
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
              nowIso={nowIso}
            />
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
