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
  const timeTrackingMenuEnabled = timeTracking.status !== "checked_out";
  const actionLabel =
    timeTracking.status === "checked_out"
      ? "CHECK IN"
      : timeTracking.status === "checked_in"
        ? "READY"
        : "ON BREAK";
  const actionSubtitle =
    timeTracking.status === "checked_out"
      ? "Start shift"
      : timeTracking.status === "checked_in"
        ? "Ready to dial"
        : `${panelState.activeBreakLabel ?? "Break"} • ${panelState.activeBreakDurationLabel ?? "00:00"}`;
  const actionIcon =
    timeTracking.status === "checked_out" ? (
      <PhoneCall size={16} />
    ) : timeTracking.status === "checked_in" ? (
      <Clock3 size={16} />
    ) : (
      <PhoneOff size={16} />
    );
  const actionButtonClasses = cn(
    "flex w-full min-w-0 items-center justify-between gap-3 rounded-[16px] border px-4 py-2.5 text-left transition",
    timeTracking.status === "checked_out" &&
      "border-emerald-200 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
    timeTracking.status === "checked_in" &&
      "border-sky-200 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-50",
    timeTracking.status === "on_break" &&
      "border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50",
    "disabled:cursor-not-allowed disabled:opacity-70",
  );

  useEffect(() => {
    if (!timeTrackingMenuEnabled) {
      setBreakOpen(false);
    }
  }, [setBreakOpen, timeTrackingMenuEnabled]);

  const metricCardClasses =
    "rounded-[16px] border border-slate-200 bg-white px-4 py-2.5 text-center shadow-[0_1px_0_rgba(15,23,42,0.03)] dark:border-slate-700 dark:bg-slate-950";
  const metricLabelClasses =
    "text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500";
  const metricValueClasses =
    "mt-0.5 text-[14px] font-semibold text-slate-900 dark:text-slate-50";

  return (
    <div className="border-b border-sky-100/80 bg-[linear-gradient(180deg,#edf4fc_0%,#e6eef8_100%)] px-3 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90 xl:flex-row xl:items-start xl:justify-between">
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

        <div className="min-w-0 flex-1">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start ">
            <div className="w-full rounded-[24px] border border-slate-200/80 bg-white/85 p-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] dark:border-slate-800 dark:bg-slate-950/80 xl:max-w-[36rem] xl:justify-self-center">
              <div
                className={cn(
                  "grid gap-2",
                  timeTrackingMenuEnabled ? "sm:grid-cols-[10.5rem,minmax(0,1fr)]" : "grid-cols-1",
                )}
              >
                {timeTrackingMenuEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      checkOut();
                      setBreakOpen(false);
                      setAlertsOpen(false);
                    }}
                    disabled={busy}
                    className={cn(
                      "inline-flex h-full items-center justify-center gap-2 rounded-[16px] border px-4 py-2.5 text-left transition",
                      "border-rose-200 bg-rose-50 text-rose-900 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-50 dark:hover:bg-rose-950/50",
                      "disabled:cursor-not-allowed disabled:opacity-70",
                    )}
                  >
                    <LogOut size={14} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">
                      Check out
                    </span>
                  </button>
                ) : null}

                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!timeTrackingMenuEnabled) {
                        checkIn();
                        setBreakOpen(false);
                        setAlertsOpen(false);
                        return;
                      }

                      setBreakOpen((current) => !current);
                      setAlertsOpen(false);
                    }}
                    aria-haspopup={timeTrackingMenuEnabled ? "menu" : undefined}
                    aria-expanded={timeTrackingMenuEnabled ? breakOpen : undefined}
                    aria-controls={timeTrackingMenuEnabled ? "time-tracking-menu" : undefined}
                    className={cn(actionButtonClasses)}
                  >
                    <div className="grid flex-1 min-w-0 grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3">
                      <div className="flex items-center justify-center text-slate-700/90 dark:text-current">
                        {actionIcon}
                      </div>
                      <div className="min-w-0 text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em]">
                          <span>{actionLabel}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] font-medium opacity-90">
                          {actionSubtitle}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "flex items-center justify-center text-slate-700/70 dark:text-current",
                          !timeTrackingMenuEnabled && "opacity-0",
                        )}
                      >
                        <ChevronDown
                          size={15}
                          className={cn("shrink-0 transition-transform", breakOpen && "rotate-180")}
                        />
                      </div>
                    </div>
                  </button>
                  <BreakMenu
                    open={timeTrackingMenuEnabled && breakOpen}
                    timeTracking={timeTracking}
                    onCheckIn={() => {
                      checkIn();
                      setBreakOpen(false);
                    }}
                    onCheckOut={() => {
                      checkOut();
                      setBreakOpen(false);
                    }}
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
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className={metricCardClasses}>
                  <p className={metricLabelClasses}>Time on system</p>
                  <p className={metricValueClasses}>{panelState.timeOnSystemLabel}</p>
                </div>
                <div className={metricCardClasses}>
                  <p className={metricLabelClasses}>Login hours</p>
                  <p className={metricValueClasses}>{panelState.loginHoursLabel}</p>
                </div>
              </div>

              {timeTracking.status === "on_break" ? (
                <div className="mt-2 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-[0_1px_0_rgba(245,158,11,0.05)] dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-600 dark:text-amber-200">
                    Break in progress
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <span>{panelState.activeBreakLabel ?? "Break"}</span>
                    <span className="text-amber-700/70 dark:text-amber-100/70">•</span>
                    <span>{panelState.activeBreakDurationLabel ?? "00:00"}</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
      </div>
    </div>
  );
}
